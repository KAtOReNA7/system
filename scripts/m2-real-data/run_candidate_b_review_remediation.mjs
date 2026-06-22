import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  assertLocalDatabaseTarget,
  buildDistribution
} from "../../src/domain/oldProductEvaluation/realDataDbImportPlan.js";
import {
  GROUP_DECISION_TEMPLATE_COLUMNS,
  buildGroupDecisionPolicy,
  buildGroupDecisionTemplateRows,
  buildReviewPackRow,
  validateGroupDecisionTemplateSchema
} from "../../src/domain/oldProductEvaluation/reviewDecisionClosure.js";
import {
  assertSanitizedRemediationReport,
  buildDataGapRemediationSummary,
  buildExpiryWaiverPolicyDraft,
  buildManualExceptionBrief,
  buildReadinessRemediationPatch,
  buildRemediatedGroupDecisionTemplateRows,
  validateDataGapRemediationSummary,
  validateExpiryWaiverPolicyDraft,
  validateManualExceptionBrief
} from "../../src/domain/oldProductEvaluation/reviewRemediationPlan.js";

const { Client } = pg;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUTPUT_DIR = join(ROOT, "docs", "analysis", "m2-real-data");
const PRIVATE_GROUP_DECISION_TEMPLATE = join(
  ROOT,
  "data",
  "private-output",
  "m2-review",
  "candidate-b-group-decision-template.csv"
);
const DATA_GAP_JSON = join(
  OUTPUT_DIR,
  "M2-candidate-b-data-gap-remediation-summary-v0.1.json"
);
const DATA_GAP_MD = join(
  OUTPUT_DIR,
  "M2-candidate-b-data-gap-remediation-summary-v0.1.md"
);
const EXPIRY_WAIVER_JSON = join(
  OUTPUT_DIR,
  "M2-candidate-b-expiry-waiver-policy-draft-v0.1.json"
);
const EXPIRY_WAIVER_MD = join(
  OUTPUT_DIR,
  "M2-candidate-b-expiry-waiver-policy-draft-v0.1.md"
);
const MANUAL_EXCEPTION_JSON = join(
  OUTPUT_DIR,
  "M2-candidate-b-manual-exception-brief-v0.1.json"
);
const MANUAL_EXCEPTION_MD = join(
  OUTPUT_DIR,
  "M2-candidate-b-manual-exception-brief-v0.1.md"
);
const READINESS_CLOSURE_JSON = join(
  OUTPUT_DIR,
  "M2-candidate-b-readiness-closure-summary-v0.1.json"
);
const READINESS_CLOSURE_MD = join(
  OUTPUT_DIR,
  "M2-candidate-b-readiness-closure-summary-v0.1.md"
);
const CANDIDATE_VERSION = "m2-realdata-dev-candidate-b-v0.1";

function parseArgs(argv) {
  const args = {
    summary: false,
    exportTemplate: false,
    groupTemplate: PRIVATE_GROUP_DECISION_TEMPLATE
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--summary") {
      args.summary = true;
    } else if (arg === "--export-template") {
      args.exportTemplate = true;
    } else if (arg === "--group-template") {
      args.groupTemplate = resolve(ROOT, argv[++index]);
    } else {
      throw new Error(`Unsupported argument: ${arg}`);
    }
  }
  if (!args.summary && !args.exportTemplate) {
    args.summary = true;
    args.exportTemplate = true;
  }
  return args;
}

function readDotEnv(path) {
  const values = {};
  if (!existsSync(path)) {
    throw new Error(".env.local is required for local DB review remediation workflow.");
  }
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const [key, ...rest] = trimmed.split("=");
    values[key] = rest.join("=");
  }
  return values;
}

function requireValue(values, name) {
  const value = values[name];
  if (!value || String(value).trim().length === 0) {
    throw new Error(`${name} is required in .env.local`);
  }
  return String(value);
}

function localConfig(values) {
  const host = requireValue(values, "M1_LOCAL_DB_HOST");
  const port = Number(requireValue(values, "M1_LOCAL_DEV_DB_PORT"));
  const databaseName = requireValue(values, "M1_LOCAL_DEV_DB_NAME");
  const environmentName = values.M1_LOCAL_DEV_ENVIRONMENT_NAME || "m1-local-dev";
  const guard = assertLocalDatabaseTarget({ host, databaseName, environmentName });
  if (!guard.localOnly) {
    throw new Error(`Refusing non-local or formal database target: ${JSON.stringify(guard)}`);
  }
  return {
    host,
    port,
    databaseName,
    environmentName,
    user: "background_worker",
    password: requireValue(values, "M1_BACKGROUND_WORKER_PASSWORD")
  };
}

async function withClient(config, fn) {
  const client = new Client({
    host: config.host,
    port: config.port,
    database: config.databaseName,
    user: config.user,
    password: config.password,
    connectionTimeoutMillis: 5000
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function loadBlockingReviewItemsWithEvidence(client) {
  const result = await client.query(
    `SELECT
       i.id AS "reviewItemId",
       r.candidate_version AS "candidateVersion",
       i.standard_work_id AS "stableWorkReference",
       i.review_reason_code AS "reasonCode",
       i.review_status AS "currentStatus",
       i.review_priority AS "priority",
       r.rating,
       r.lifecycle,
       r.risk_level AS "riskLevel",
       r.primary_suggestion AS "primarySuggestion",
       s.id AS "inputSnapshotId",
       s.copyright_start AS "copyrightStart",
       s.copyright_end AS "copyrightEnd",
       s.active_month_count AS "activeMonthCount",
       ARRAY(
         SELECT DISTINCT risk.risk_code
           FROM m1.m2_evaluation_risks risk
          WHERE risk.evaluation_result_id = r.id
          ORDER BY risk.risk_code
       ) AS "riskCodes",
       ARRAY(
         SELECT DISTINCT risk.risk_type
           FROM m1.m2_evaluation_risks risk
          WHERE risk.evaluation_result_id = r.id
          ORDER BY risk.risk_type
       ) AS "riskTypes",
       ARRAY(
         SELECT DISTINCT suggestion.suggestion_code
           FROM m1.m2_evaluation_suggestions suggestion
          WHERE suggestion.evaluation_result_id = r.id
          ORDER BY suggestion.suggestion_code
       ) AS "suggestionCodes"
     FROM m1.m2_evaluation_review_items i
     JOIN m1.m2_evaluation_results r ON r.id = i.evaluation_result_id
     LEFT JOIN m1.m2_evaluation_input_snapshots s ON s.evaluation_result_id = r.id
     WHERE r.candidate_version = $1
       AND i.review_type = 'blocking_manual_review'
     ORDER BY i.review_priority ASC, i.review_reason_code ASC, i.id ASC`,
    [CANDIDATE_VERSION]
  );
  return result.rows.map((row) => ({
    ...row,
    reviewItemId: Number(row.reviewItemId),
    priority: Number(row.priority),
    inputSnapshotId: row.inputSnapshotId === null ? null : Number(row.inputSnapshotId),
    activeMonthCount: row.activeMonthCount === null ? null : Number(row.activeMonthCount),
    riskCodes: row.riskCodes ?? [],
    riskTypes: row.riskTypes ?? [],
    suggestionCodes: row.suggestionCodes ?? []
  }));
}

async function loadReviewSummaryRows(client) {
  const result = await client.query(
    `SELECT
       i.review_type AS "reviewType",
       i.review_reason_code AS "reviewReasonCode",
       i.review_status AS "reviewStatus",
       i.review_priority AS "reviewPriority",
       i.audit_metadata_json AS "auditMetadata"
     FROM m1.m2_evaluation_review_items i
     JOIN m1.m2_evaluation_results r ON r.id = i.evaluation_result_id
     WHERE r.candidate_version = $1`,
    [CANDIDATE_VERSION]
  );
  return result.rows.map((row) => ({
    ...row,
    auditEventCount: Array.isArray(row.auditMetadata?.events) ? row.auditMetadata.events.length : 0
  }));
}

function buildDataGapDiagnostics(rows) {
  const dataGapRows = (rows ?? []).filter((row) => row.reasonCode === "high_value_with_data_gap");
  const hasRisk = (row, code) => (row.riskCodes ?? []).includes(code);
  const deterministicAutoFixableRows = dataGapRows.filter(
    (row) =>
      row.inputSnapshotId &&
      row.stableWorkReference &&
      row.copyrightEnd &&
      !hasRisk(row, "missing_basic_info") &&
      !hasRisk(row, "missing_copyright_end") &&
      !hasRisk(row, "aggregate_projection_gap")
  );
  const noActionCandidateRows = deterministicAutoFixableRows.filter(
    (row) =>
      !hasRisk(row, "business_form_mixed") &&
      !hasRisk(row, "abnormal_spike") &&
      !hasRisk(row, "channel_concentration") &&
      !hasRisk(row, "buyout_or_oneoff_income") &&
      !hasRisk(row, "insufficient_history")
  );
  const businessConfirmationRows = dataGapRows.filter(
    (row) =>
      hasRisk(row, "business_form_mixed") ||
      hasRisk(row, "abnormal_spike") ||
      hasRisk(row, "channel_concentration") ||
      hasRisk(row, "buyout_or_oneoff_income") ||
      hasRisk(row, "insufficient_history") ||
      hasRisk(row, "revenue_decline")
  );

  return {
    dataGapItemCount: dataGapRows.length,
    localDbInputSnapshotsChecked: true,
    inputSnapshotCount: dataGapRows.filter((row) => row.inputSnapshotId).length,
    inputSnapshotMissingCount: dataGapRows.filter((row) => !row.inputSnapshotId).length,
    mappingCoverageIncompleteCount: dataGapRows.filter((row) => !row.stableWorkReference).length,
    standardWorkReferenceMissingCount: dataGapRows.filter((row) => !row.stableWorkReference).length,
    missingBasicInfoRiskCount: countRisk(dataGapRows, "missing_basic_info"),
    missingCopyrightEndRiskCount: countRisk(dataGapRows, "missing_copyright_end"),
    aggregateProjectionGapRiskCount: countRisk(dataGapRows, "aggregate_projection_gap"),
    copyrightEndNullCount: dataGapRows.filter((row) => !row.copyrightEnd).length,
    copyrightStartNullCount: dataGapRows.filter((row) => !row.copyrightStart).length,
    businessFormMixedRiskCount: countRisk(dataGapRows, "business_form_mixed"),
    abnormalSpikeRiskCount: countRisk(dataGapRows, "abnormal_spike"),
    channelConcentrationRiskCount: countRisk(dataGapRows, "channel_concentration"),
    insufficientHistoryRiskCount: countRisk(dataGapRows, "insufficient_history"),
    buyoutOrOneoffIncomeRiskCount: countRisk(dataGapRows, "buyout_or_oneoff_income"),
    revenueDeclineRiskCount: countRisk(dataGapRows, "revenue_decline"),
    riskCodeDistribution: delimitedArrayDistribution(dataGapRows, "riskCodes"),
    suggestionCodeDistribution: delimitedArrayDistribution(dataGapRows, "suggestionCodes"),
    activeMonthBucketDistribution: buildDistribution(
      dataGapRows.map((row) => ({ bucket: activeMonthBucket(row.activeMonthCount) })),
      "bucket"
    ),
    autoFixableCount: deterministicAutoFixableRows.length,
    autoFixedCount: 0,
    canBeNoActionRequiredCandidateCount: noActionCandidateRows.length,
    needsSourceDataFixCount: dataGapRows.filter(
      (row) =>
        hasRisk(row, "missing_basic_info") ||
        hasRisk(row, "missing_copyright_end") ||
        hasRisk(row, "aggregate_projection_gap") ||
        !row.copyrightEnd
    ).length,
    needsBusinessConfirmationCount: businessConfirmationRows.length,
    needsBusinessConfirmationPrimaryCount: 0,
    shouldRemainBlockingCount: dataGapRows.length,
    remainingBlockingCount: dataGapRows.length,
    postReimportBlockingCount: dataGapRows.length
  };
}

function countRisk(rows, riskCode) {
  return (rows ?? []).filter((row) => (row.riskCodes ?? []).includes(riskCode)).length;
}

function delimitedArrayDistribution(rows, field) {
  const counts = {};
  for (const row of rows ?? []) {
    for (const value of row[field] ?? []) {
      const key = String(value ?? "").trim();
      if (!key) {
        continue;
      }
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function activeMonthBucket(value) {
  const months = Number(value ?? 0);
  if (months <= 0) {
    return "0";
  }
  if (months <= 2) {
    return "1-2";
  }
  if (months <= 5) {
    return "3-5";
  }
  if (months <= 11) {
    return "6-11";
  }
  return "12+";
}

function readJsonIfExists(path, fallback) {
  if (!existsSync(path)) {
    return fallback;
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJsonAndMarkdownReports({ dataGapSummary, expiryWaiverPolicy, manualExceptionBrief, readinessPatch }) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeCheckedJson(DATA_GAP_JSON, dataGapSummary);
  writeCheckedJson(EXPIRY_WAIVER_JSON, expiryWaiverPolicy);
  writeCheckedJson(MANUAL_EXCEPTION_JSON, manualExceptionBrief);
  writeCheckedJson(READINESS_CLOSURE_JSON, readinessPatch);

  writeFileSync(DATA_GAP_MD, dataGapMarkdown(dataGapSummary), "utf8");
  writeFileSync(EXPIRY_WAIVER_MD, expiryWaiverMarkdown(expiryWaiverPolicy), "utf8");
  writeFileSync(MANUAL_EXCEPTION_MD, manualExceptionMarkdown(manualExceptionBrief), "utf8");
  writeFileSync(READINESS_CLOSURE_MD, readinessMarkdown(readinessPatch), "utf8");
}

function writeCheckedJson(path, payload) {
  const sanitized = assertSanitizedRemediationReport(payload);
  if (!sanitized.sanitized) {
    throw new Error(`Sanitized report boundary violation: ${sanitized.detected.join(", ")}`);
  }
  writeFileSync(path, JSON.stringify(payload, null, 2), "utf8");
}

function writeCsv(path, rows, columns) {
  mkdirSync(dirname(path), { recursive: true });
  const lines = [columns.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => csvEscape(row[column] ?? "")).join(","));
  }
  writeFileSync(path, `${lines.join("\n")}\n`, "utf8");
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function dataGapMarkdown(report) {
  return `# M2 candidate-b data-gap remediation summary v0.1

Mode: authorized local real-data DB-backed development.

Candidate: \`${CANDIDATE_VERSION}\`

This is local development evidence only. It is not a final formal evaluation or release approval.

## Executive Summary

- Data-gap blocking group items: ${report.totalGroupItems}
- Auto-fixable items found: ${report.classification.autoFixableCount}
- Auto-fixes applied: ${report.classification.autoFixedCount}
- Items needing source data fix: ${report.classification.needsSourceDataFixCount}
- Items needing business confirmation signals: ${report.classification.needsBusinessConfirmationCount}
- Remaining blocking items after remediation diagnostics: ${report.beforeAfter.afterBlockingCount}
- Recommended group decision after remediation: \`${report.remediationDecision.recommendedGroupDecisionAfterRemediation}\`
- Reimport required before clearing this group: ${report.remediationDecision.reimportRequiredFlag ? "yes" : "no"}

## Evidence Checks

| Check | Count |
|---|---:|
| input snapshots checked | ${report.evidence.inputSnapshotCount} |
| input snapshots missing | ${report.evidence.inputSnapshotMissingCount} |
| mapping coverage incomplete | ${report.evidence.mappingCoverageIncompleteCount} |
| missing basic-info risk | ${report.evidence.missingBasicInfoRiskCount} |
| missing copyright-end risk | ${report.evidence.missingCopyrightEndRiskCount} |
| aggregate projection gap risk | ${report.evidence.aggregateProjectionGapRiskCount} |
| null copyright end in input snapshot | ${report.evidence.copyrightEndNullCount} |

## Additional Business Confirmation Signals

${markdownDistribution(report.additionalBusinessConfirmationSignals, "Signal")}

## Risk Code Distribution

${markdownDistribution(report.evidence.riskCodeDistribution, "Risk Code")}

## Conclusion

${report.remediationDecision.remediationEvidenceSummary}

No raw rows, real work names, author names, channel names, exact per-work revenue detail, secrets, connection strings, private workbook names, dumps, or temporary DB files are written in this report.
`;
}

function expiryWaiverMarkdown(report) {
  return `# M2 candidate-b expiry waiver policy draft v0.1

Mode: authorized local real-data DB-backed development.

Candidate: \`${CANDIDATE_VERSION}\`

This is a local waiver policy draft only. It does not apply final decisions and does not approve formal release.

## Draft Policy

- Expiry blocker items: ${report.itemCount}
- Recommended decision if business confirms scope: \`${report.recommendedDecision}\`
- Can apply without further data fix: ${report.canApplyWithoutFurtherDataFix ? "yes" : "no"}
- User confirmation required: ${report.userConfirmationRequired ? "yes" : "no"}
- Required fields: ${report.requiredFields.map((field) => `\`${field}\``).join(", ")}
- Default waiver scope: \`${report.defaultWaiverScope}\`
- Default waiver expiry: \`${report.defaultWaiverExpiry}\`

## Readiness Effect

${report.readinessEffect}

## Risk Code Distribution

${markdownDistribution(report.riskCodeDistribution, "Risk Code")}

No raw rows, real work names, author names, channel names, exact per-work revenue detail, secrets, connection strings, private workbook names, dumps, or temporary DB files are written in this report.
`;
}

function manualExceptionMarkdown(report) {
  const rows = report.groups
    .map(
      (group) =>
        `| ${group.groupDecisionId} | ${group.reasonCode} | ${group.itemCount} | ${group.recommendedDecision} | ${group.requiredBusinessDecision} |`
    )
    .join("\n");
  return `# M2 candidate-b manual exception brief v0.1

Mode: authorized local real-data DB-backed development.

Candidate: \`${CANDIDATE_VERSION}\`

This is a local manual exception brief only. It does not apply final decisions and does not approve formal release.

## Manual Exception Groups

| Group | Reason Code | Count | Recommended Decision | Required Business Decision |
|---|---|---:|---|---|
${rows}

## Conclusion

${report.conclusion}

No raw rows, real work names, author names, channel names, exact per-work revenue detail, secrets, connection strings, private workbook names, dumps, or temporary DB files are written in this report.
`;
}

function readinessMarkdown(report) {
  const remediation = report.remediation ?? {};
  const readiness = report.readiness ?? {};
  return `# M2 candidate-b readiness closure summary v0.1

Mode: authorized local real-data DB-backed development.

Candidate: \`${CANDIDATE_VERSION}\`

This is local development evidence only. It is not a final formal evaluation or release approval.

## Current Closure State

- Final decisions applied: ${report.finalDecisionsApplied ? "yes" : "no"}
- Proposed decisions generated: ${report.proposedDecisionsGenerated ? "yes" : "no"}
- Remaining blocking count: ${readiness.remainingBlockingCount}
- Pending count: ${readiness.pendingCount}
- Data fix required count: ${readiness.dataFixRequiredCount}
- Waiver count: ${readiness.waiverCount}
- Rejected for formal count: ${readiness.rejectedForFormalCount}
- Approved count: ${readiness.approvedCount}
- No action required count: ${readiness.noActionRequiredCount}
- Audit event count: ${readiness.auditEventCount}
- Candidate can move to next local readiness stage: ${readiness.candidateCanMoveToNextLocalReadinessStage ? "yes" : "no"}

## Remediation Diagnostics

- Auto-fix applied: ${remediation.autoFixApplied ? "yes" : "no"}
- Blocking count before remediation diagnostics: ${remediation.beforeBlockingCount}
- Blocking count after remediation diagnostics: ${remediation.afterRemediationBlockingCount}
- Data-gap auto-fixed count: ${remediation.dataGapAutoFixedCount}
- Data-gap remaining blocking count: ${remediation.dataGapRemainingBlockingCount}
- Expiry waiver candidate count: ${remediation.expiryWaiverCandidateCount}
- Manual exception pending count: ${remediation.manualExceptionPendingCount}
- Reimport required: ${remediation.reimportRequired ? "yes" : "no"}

## Blocking Status Distribution

${markdownDistribution(readiness.blockingStatusDistribution, "Status")}

## Conclusion

${report.conclusion}

No raw rows, real work names, author names, channel names, exact per-work revenue detail, secrets, connection strings, private workbook names, dumps, or temporary DB files are written in this report.
`;
}

function markdownDistribution(values, label) {
  const rows = Object.entries(values ?? {});
  if (rows.length === 0) {
    return `| ${label} | Count |\n|---|---:|\n| none | 0 |`;
  }
  return [`| ${label} | Count |`, "|---|---:|", ...rows.map(([key, value]) => `| ${key} | ${value} |`)].join(
    "\n"
  );
}

function relativePath(path) {
  return relative(ROOT, path).replaceAll("\\", "/");
}

function assertValidReports({ dataGapSummary, expiryWaiverPolicy, manualExceptionBrief }) {
  const validations = [
    validateDataGapRemediationSummary(dataGapSummary),
    validateExpiryWaiverPolicyDraft(expiryWaiverPolicy),
    validateManualExceptionBrief(manualExceptionBrief)
  ];
  const errors = validations.flatMap((validation) => validation.errors);
  if (errors.length > 0) {
    throw new Error(`Generated remediation reports are invalid: ${JSON.stringify(errors.slice(0, 10))}`);
  }
  for (const report of [dataGapSummary, expiryWaiverPolicy, manualExceptionBrief]) {
    const sanitized = assertSanitizedRemediationReport(report);
    if (!sanitized.sanitized) {
      throw new Error(`Sanitized report boundary violation: ${sanitized.detected.join(", ")}`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const generatedAt = new Date().toISOString();
  const config = localConfig(readDotEnv(join(ROOT, ".env.local")));

  const result = await withClient(config, async (client) => {
    const blockingItems = await loadBlockingReviewItemsWithEvidence(client);
    const packRows = blockingItems.map(buildReviewPackRow);
    const groupPolicy = buildGroupDecisionPolicy(packRows);
    const diagnostics = buildDataGapDiagnostics(blockingItems);
    const dataGapSummary = buildDataGapRemediationSummary({
      candidateVersion: CANDIDATE_VERSION,
      groupPolicy,
      diagnostics,
      generatedAt
    });
    const expiryWaiverPolicy = buildExpiryWaiverPolicyDraft({
      candidateVersion: CANDIDATE_VERSION,
      groupPolicy,
      generatedAt
    });
    const manualExceptionBrief = buildManualExceptionBrief({
      candidateVersion: CANDIDATE_VERSION,
      groupPolicy,
      generatedAt
    });
    assertValidReports({ dataGapSummary, expiryWaiverPolicy, manualExceptionBrief });

    const baseTemplateRows = buildGroupDecisionTemplateRows(packRows);
    const remediatedTemplateRows = buildRemediatedGroupDecisionTemplateRows({
      templateRows: baseTemplateRows,
      dataGapSummary,
      expiryWaiverPolicy,
      manualExceptionBrief
    });
    const schema = validateGroupDecisionTemplateSchema(remediatedTemplateRows);
    if (!schema.valid) {
      throw new Error(`Remediated group template schema is invalid: ${schema.missingColumns.join(", ")}`);
    }

    const currentReadiness = readJsonIfExists(READINESS_CLOSURE_JSON, {
      schema: "m2.authorized_real_data.candidate_b_readiness_closure_summary.v0.1",
      generatedAt,
      mode: "remediation",
      candidateVersion: CANDIDATE_VERSION,
      notFinalReleaseApproved: true,
      finalDecisionsApplied: false,
      proposedDecisionsGenerated: true,
      readiness: {
        remainingBlockingCount: packRows.length,
        pendingCount: packRows.length,
        blockingStatusDistribution: buildDistribution(packRows, "currentStatus"),
        dataFixRequiredCount: 0,
        waiverCount: 0,
        rejectedForFormalCount: 0,
        approvedCount: 0,
        noActionRequiredCount: 0,
        auditEventCount: 0,
        candidateCanMoveToNextLocalReadinessStage: false
      }
    });
    const readinessPatch = buildReadinessRemediationPatch({
      currentReadiness,
      dataGapSummary,
      expiryWaiverPolicy,
      manualExceptionBrief,
      generatedAt
    });

    if (args.exportTemplate) {
      writeCsv(args.groupTemplate, remediatedTemplateRows, GROUP_DECISION_TEMPLATE_COLUMNS);
    }
    if (args.summary) {
      writeJsonAndMarkdownReports({
        dataGapSummary,
        expiryWaiverPolicy,
        manualExceptionBrief,
        readinessPatch
      });
    }

    return {
      blockingItems: packRows.length,
      groupPolicy,
      dataGapSummary,
      expiryWaiverPolicy,
      manualExceptionBrief,
      readinessPatch,
      groupTemplateRows: remediatedTemplateRows.length,
      groupTemplatePath: args.groupTemplate,
      allReviewRows: await loadReviewSummaryRows(client)
    };
  });

  console.log(
    JSON.stringify(
      {
        status: "pass",
        candidateVersion: CANDIDATE_VERSION,
        blockingReviewItems: result.blockingItems,
        groupDistribution: result.groupPolicy.groupDistribution,
        dataGap: {
          totalGroupItems: result.dataGapSummary.totalGroupItems,
          autoFixableCount: result.dataGapSummary.classification.autoFixableCount,
          autoFixedCount: result.dataGapSummary.classification.autoFixedCount,
          needsSourceDataFixCount: result.dataGapSummary.classification.needsSourceDataFixCount,
          remainingBlockingCount: result.dataGapSummary.beforeAfter.afterBlockingCount,
          recommendedGroupDecisionAfterRemediation:
            result.dataGapSummary.remediationDecision.recommendedGroupDecisionAfterRemediation
        },
        expiryWaiverCandidateCount: result.expiryWaiverPolicy.itemCount,
        manualExceptionCount: result.manualExceptionBrief.totalManualExceptionItems,
        privateGroupDecisionTemplate: relativePath(result.groupTemplatePath),
        dataGapReport: relativePath(DATA_GAP_JSON),
        expiryWaiverPolicy: relativePath(EXPIRY_WAIVER_JSON),
        manualExceptionBrief: relativePath(MANUAL_EXCEPTION_JSON),
        readinessClosureReport: relativePath(READINESS_CLOSURE_JSON),
        finalDecisionsApplied: false,
        rawRowsWrittenToStdout: false,
        secretsWrittenToStdout: false
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        status: "failed",
        error: error.message,
        suggestedFixes: [
          "Confirm Docker Desktop and local PostgreSQL are running.",
          "Run npm run import:m2:real-data:local-db before remediation diagnostics.",
          "Confirm .env.local points only to the authorized local development database."
        ],
        rawRowsWrittenToStdout: false,
        secretsWrittenToStdout: false
      },
      null,
      2
    )
  );
  process.exit(1);
});
