import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  assertLocalDatabaseTarget,
  summarizeReviewWorkflow
} from "../../src/domain/oldProductEvaluation/realDataDbImportPlan.js";
import {
  GROUP_DECISION_TEMPLATE_COLUMNS,
  M2_REVIEW_CLOSURE_VERSION,
  REVIEW_PACK_COLUMNS,
  assertSanitizedClosureReport,
  buildGroupDecisionPolicy,
  buildGroupDecisionTemplateRows,
  buildReviewPackRow,
  planGroupDecisionApplication,
  planDecisionApplication,
  summarizeBusinessClosure,
  summarizeReadinessClosure,
  validateDecisionRows,
  validateGroupDecisionRows,
  validateGroupDecisionTemplateSchema,
  validateGroupPolicy,
  validateResetConfirmation,
  validateReviewPackSchema
} from "../../src/domain/oldProductEvaluation/reviewDecisionClosure.js";
import { buildRemediatedGroupDecisionTemplateRows } from "../../src/domain/oldProductEvaluation/reviewRemediationPlan.js";

const { Client } = pg;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUTPUT_DIR = join(ROOT, "docs", "analysis", "m2-real-data");
const BUSINESS_CLOSURE_JSON = join(
  OUTPUT_DIR,
  "M2-candidate-b-blocking-review-business-closure-plan-v0.1.json"
);
const BUSINESS_CLOSURE_MD = join(
  OUTPUT_DIR,
  "M2-candidate-b-blocking-review-business-closure-plan-v0.1.md"
);
const READINESS_CLOSURE_JSON = join(
  OUTPUT_DIR,
  "M2-candidate-b-readiness-closure-summary-v0.1.json"
);
const READINESS_CLOSURE_MD = join(
  OUTPUT_DIR,
  "M2-candidate-b-readiness-closure-summary-v0.1.md"
);
const GROUP_POLICY_JSON = join(
  OUTPUT_DIR,
  "M2-candidate-b-review-group-decision-policy-v0.1.json"
);
const GROUP_POLICY_MD = join(
  OUTPUT_DIR,
  "M2-candidate-b-review-group-decision-policy-v0.1.md"
);
const DATA_GAP_REMEDIATION_JSON = join(
  OUTPUT_DIR,
  "M2-candidate-b-data-gap-remediation-summary-v0.1.json"
);
const EXPIRY_WAIVER_POLICY_JSON = join(
  OUTPUT_DIR,
  "M2-candidate-b-expiry-waiver-policy-draft-v0.1.json"
);
const MANUAL_EXCEPTION_BRIEF_JSON = join(
  OUTPUT_DIR,
  "M2-candidate-b-manual-exception-brief-v0.1.json"
);
const USER_DECISION_BRIEF_MD = join(
  OUTPUT_DIR,
  "M2-candidate-b-review-user-decision-brief-v0.1.md"
);
const DEFAULT_PRIVATE_REVIEW_PACK = join(
  ROOT,
  "data",
  "private-output",
  "m2-review",
  "candidate-b-blocking-review-pack.csv"
);
const DEFAULT_GROUP_DECISION_TEMPLATE = join(
  ROOT,
  "data",
  "private-output",
  "m2-review",
  "candidate-b-group-decision-template.csv"
);
const CANDIDATE_VERSION = "m2-realdata-dev-candidate-b-v0.1";

function parseArgs(argv) {
  const args = {
    exportPack: false,
    exportGroupTemplate: false,
    summary: false,
    dryRun: false,
    apply: false,
    decisions: null,
    groupDecisions: null,
    pack: DEFAULT_PRIVATE_REVIEW_PACK,
    groupTemplate: DEFAULT_GROUP_DECISION_TEMPLATE,
    resetDevDecisions: false,
    confirmLocalDevReset: false,
    actor: "local_business_reviewer"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--export-pack") {
      args.exportPack = true;
    } else if (arg === "--export-group-template") {
      args.exportGroupTemplate = true;
    } else if (arg === "--summary") {
      args.summary = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--apply") {
      args.apply = true;
    } else if (arg === "--decisions") {
      args.decisions = resolve(ROOT, argv[++index]);
    } else if (arg === "--group-decisions") {
      args.groupDecisions = resolve(ROOT, argv[++index]);
    } else if (arg === "--pack") {
      args.pack = resolve(ROOT, argv[++index]);
    } else if (arg === "--group-template") {
      args.groupTemplate = resolve(ROOT, argv[++index]);
    } else if (arg === "--reset-dev-decisions") {
      args.resetDevDecisions = true;
    } else if (arg === "--confirm-local-dev-reset") {
      args.confirmLocalDevReset = true;
    } else if (arg === "--actor") {
      args.actor = argv[++index];
    } else {
      throw new Error(`Unsupported argument: ${arg}`);
    }
  }

  if (
    !args.exportPack &&
    !args.exportGroupTemplate &&
    !args.summary &&
    !args.dryRun &&
    !args.apply &&
    !args.resetDevDecisions
  ) {
    args.summary = true;
  }
  if ((args.dryRun || args.apply) && !args.decisions && !args.groupDecisions) {
    throw new Error("Decision import requires --decisions <path> or --group-decisions <path>.");
  }
  if (args.decisions && args.groupDecisions) {
    throw new Error("Use only one of --decisions or --group-decisions.");
  }
  if (args.apply && args.dryRun) {
    throw new Error("Use only one of --dry-run or --apply.");
  }
  if (!validateResetConfirmation(args)) {
    throw new Error("--reset-dev-decisions requires --confirm-local-dev-reset.");
  }
  return args;
}

function readDotEnv(path) {
  const values = {};
  if (!existsSync(path)) {
    throw new Error(".env.local is required for local DB review closure workflow.");
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

async function loadBlockingReviewItems(client) {
  const result = await client.query(
    `SELECT
       i.id AS "reviewItemId",
       r.candidate_version AS "candidateVersion",
       i.standard_work_id AS "stableWorkReference",
       i.review_reason_code AS "reasonCode",
       i.review_status AS "currentStatus",
       i.review_priority AS "priority",
       i.audit_metadata_json AS "auditMetadata",
       r.rating,
       r.lifecycle,
       r.risk_level AS "riskLevel",
       r.primary_suggestion AS "primarySuggestion",
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
     WHERE r.candidate_version = $1
       AND i.review_type = 'blocking_manual_review'
     ORDER BY i.review_priority ASC, i.review_reason_code ASC, i.id ASC`,
    [CANDIDATE_VERSION]
  );
  return result.rows.map((row) => ({
    ...row,
    reviewItemId: Number(row.reviewItemId),
    priority: Number(row.priority),
    riskCodes: row.riskCodes ?? [],
    riskTypes: row.riskTypes ?? [],
    suggestionCodes: row.suggestionCodes ?? []
  }));
}

async function loadAllReviewRows(client) {
  const result = await client.query(
    `SELECT
       i.id,
       i.review_type AS "reviewType",
       i.review_reason_code AS "reviewReasonCode",
       i.review_status AS "reviewStatus",
       i.review_priority AS "reviewPriority",
       i.is_blocking AS "isBlocking",
       i.audit_metadata_json AS "auditMetadata"
     FROM m1.m2_evaluation_review_items i
     JOIN m1.m2_evaluation_results r ON r.id = i.evaluation_result_id
     WHERE r.candidate_version = $1
     ORDER BY i.is_blocking DESC, i.review_priority ASC, i.id ASC`,
    [CANDIDATE_VERSION]
  );
  return result.rows.map((row) => ({
    ...row,
    auditEventCount: Array.isArray(row.auditMetadata?.events) ? row.auditMetadata.events.length : 0
  }));
}

function buildReviewSummary(rows) {
  const summary = summarizeReviewWorkflow(rows);
  const blockingRows = (rows ?? []).filter((row) => row.reviewType === "blocking_manual_review");
  return {
    ...summary,
    blockingStatusDistribution: distribution(blockingRows, "reviewStatus"),
    finalDecisionDistribution: distribution(
      (rows ?? []).filter((row) => row.reviewStatus !== "pending"),
      "reviewStatus"
    ),
    noActionRequiredCount: (rows ?? []).filter((row) => row.reviewStatus === "no_action_required").length
  };
}

function writeCsv(path, rows, columns = REVIEW_PACK_COLUMNS) {
  mkdirSync(dirname(path), { recursive: true });
  const lines = [columns.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => csvEscape(row[column] ?? "")).join(","));
  }
  writeFileSync(path, `${lines.join("\n")}\n`, "utf8");
}

function readCsv(path) {
  const text = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  const records = parseCsvRecords(text);
  if (records.length === 0) {
    return [];
  }
  const [header, ...rows] = records;
  return rows
    .filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""))
    .map((row) =>
      Object.fromEntries(header.map((column, index) => [String(column ?? "").trim(), row[index] ?? ""]))
    );
}

function readDecisionRecords(path) {
  if (path.toLowerCase().endsWith(".json")) {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (Array.isArray(parsed)) {
      return parsed;
    }
    if (Array.isArray(parsed.rows)) {
      return parsed.rows;
    }
    throw new Error("JSON decision file must be an array or an object with rows.");
  }
  return readCsv(path);
}

function parseCsvRecords(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function validateDecisionFile(path) {
  const rows = readDecisionRecords(path);
  const schema = validateReviewPackSchema(rows);
  if (!schema.valid) {
    throw new Error(`Decision file is missing required columns: ${schema.missingColumns.join(", ")}`);
  }
  const validation = validateDecisionRows(rows, { candidateVersion: CANDIDATE_VERSION });
  if (!validation.valid) {
    const sample = validation.errors.slice(0, 10);
    throw new Error(`Decision file validation failed: ${JSON.stringify(sample)}`);
  }
  return {
    rows,
    validation
  };
}

function validateGroupDecisionFile(path, currentRows) {
  const rows = readDecisionRecords(path);
  const schema = validateGroupDecisionTemplateSchema(rows);
  if (!schema.valid) {
    throw new Error(`Group decision file is missing required columns: ${schema.missingColumns.join(", ")}`);
  }
  const validation = validateGroupDecisionRows(rows, { currentRows });
  if (!validation.valid) {
    const sample = validation.errors.slice(0, 10);
    throw new Error(`Group decision file validation failed: ${JSON.stringify(sample)}`);
  }
  return {
    rows,
    validation
  };
}

function readJsonIfExists(path) {
  if (!existsSync(path)) {
    return null;
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

function buildCurrentGroupDecisionTemplateRows(packRows) {
  const templateRows = buildGroupDecisionTemplateRows(packRows);
  const dataGapSummary = readJsonIfExists(DATA_GAP_REMEDIATION_JSON);
  const expiryWaiverPolicy = readJsonIfExists(EXPIRY_WAIVER_POLICY_JSON);
  const manualExceptionBrief = readJsonIfExists(MANUAL_EXCEPTION_BRIEF_JSON);
  if (dataGapSummary && expiryWaiverPolicy && manualExceptionBrief) {
    return buildRemediatedGroupDecisionTemplateRows({
      templateRows,
      dataGapSummary,
      expiryWaiverPolicy,
      manualExceptionBrief
    });
  }
  return templateRows;
}

async function applyDecisionUpdates(client, decisions) {
  const result = {
    appliedCount: 0,
    skippedIdempotentCount: 0,
    auditEventCount: 0
  };
  if (decisions.length === 0) {
    return result;
  }

  await client.query("BEGIN");
  try {
    for (const decision of decisions) {
      const current = await client.query(
        `SELECT i.id, i.review_status, i.audit_metadata_json
           FROM m1.m2_evaluation_review_items i
           JOIN m1.m2_evaluation_results r ON r.id = i.evaluation_result_id
          WHERE i.id = $1
            AND r.candidate_version = $2
          FOR UPDATE`,
        [decision.reviewItemId, CANDIDATE_VERSION]
      );
      if (current.rowCount === 0) {
        throw new Error(`Review item not found for candidate-b: ${decision.reviewItemId}`);
      }
      const row = current.rows[0];
      const importId = decisionImportId(decision);
      const metadata = row.audit_metadata_json ?? {};
      const appliedDecisionIds = Array.isArray(metadata.appliedDecisionIds)
        ? metadata.appliedDecisionIds
        : [];
      if (appliedDecisionIds.includes(importId) || row.review_status === decision.decision) {
        result.skippedIdempotentCount += 1;
        continue;
      }
      if (row.review_status !== "pending") {
        throw new Error(`Review item ${decision.reviewItemId} is not pending; reset is required first.`);
      }
      const at = decision.reviewedAt || new Date().toISOString();
      const events = Array.isArray(metadata.events) ? metadata.events : [];
      const event = {
        eventType: decision.groupDecisionId
          ? "candidate_b_group_business_review_decision_applied"
          : "candidate_b_business_review_decision_applied",
        actor: decision.reviewerName,
        at,
        groupDecisionId: decision.groupDecisionId ?? null,
        reasonCode: decision.reasonCode ?? null,
        decision: decision.decision,
        reason: decision.reviewerReason,
        auditNote: decision.auditNote,
        waiverScope: decision.waiverScope,
        waiverExpiry: decision.waiverExpiry,
        dataFixRequiredFlag: decision.dataFixRequiredFlag,
        reimportRequiredFlag: decision.reimportRequiredFlag,
        decisionImportId: importId,
        aggregateOnly: true,
        rawDetailWritten: false
      };
      const nextMetadata = {
        ...metadata,
        appliedDecisionIds: [...appliedDecisionIds, importId],
        latestReviewDecision: {
          version: M2_REVIEW_CLOSURE_VERSION,
          groupDecisionId: decision.groupDecisionId ?? null,
          decision: decision.decision,
          decisionImportId: importId,
          aggregateOnly: true,
          rawDetailWritten: false
        },
        events: [...events, event],
        rawDetailWritten: false
      };
      await client.query(
        `UPDATE m1.m2_evaluation_review_items
            SET review_status = $1,
                reviewed_by = $2,
                reviewed_at = $3::timestamptz,
                decision = $1,
                decision_reason = $4,
                audit_metadata_json = $5::jsonb,
                updated_at = now()
          WHERE id = $6`,
        [
          decision.decision,
          decision.reviewerName,
          at,
          decision.reviewerReason,
          JSON.stringify(nextMetadata),
          decision.reviewItemId
        ]
      );
      result.appliedCount += 1;
      result.auditEventCount += 1;
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
  return result;
}

async function resetDevDecisions(client, actor) {
  const rows = await client.query(
    `SELECT i.id, i.audit_metadata_json
       FROM m1.m2_evaluation_review_items i
       JOIN m1.m2_evaluation_results r ON r.id = i.evaluation_result_id
      WHERE r.candidate_version = $1
      ORDER BY i.id
      FOR UPDATE`,
    [CANDIDATE_VERSION]
  );
  await client.query("BEGIN");
  try {
    for (const row of rows.rows) {
      const metadata = row.audit_metadata_json ?? {};
      const events = Array.isArray(metadata.events) ? metadata.events : [];
      const nextMetadata = {
        ...metadata,
        appliedDecisionIds: [],
        latestReviewDecision: null,
        events: [
          ...events,
          {
            eventType: "candidate_b_local_dev_review_decisions_reset",
            actor,
            at: new Date().toISOString(),
            reason: "explicit local development reset",
            aggregateOnly: true,
            rawDetailWritten: false
          }
        ],
        rawDetailWritten: false
      };
      await client.query(
        `UPDATE m1.m2_evaluation_review_items
            SET review_status = 'pending',
                reviewed_by = NULL,
                reviewed_at = NULL,
                decision = NULL,
                decision_reason = NULL,
                audit_metadata_json = $1::jsonb,
                updated_at = now()
          WHERE id = $2`,
        [JSON.stringify(nextMetadata), row.id]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
  return {
    resetCount: rows.rowCount,
    auditEventCount: rows.rowCount
  };
}

function decisionImportId(decision) {
  return createHash("sha256")
    .update(
      [
        CANDIDATE_VERSION,
        decision.reviewItemId,
        decision.decision,
        decision.reviewerReason,
        decision.reviewerName,
        decision.waiverScope,
        decision.waiverExpiry,
        decision.dataFixRequiredFlag,
        decision.reimportRequiredFlag,
        decision.groupDecisionId ?? ""
      ].join("\u001f")
    )
    .digest("hex")
    .slice(0, 24);
}

function buildReports({
  mode,
  packRows,
  reviewSummary,
  privateReviewPackPath,
  privateGroupDecisionTemplatePath,
  groupPolicy,
  decisionPlan,
  validation,
  groupDecisionPlan,
  groupValidation,
  mutation,
  finalDecisionsApplied,
  proposedDecisionsGenerated
}) {
  const generatedAt = new Date().toISOString();
  const closureSummary = summarizeBusinessClosure(packRows);
  const businessReport = {
    schema: "m2.authorized_real_data.candidate_b_blocking_review_business_closure_plan.v0.1",
    generatedAt,
    mode,
    candidateVersion: CANDIDATE_VERSION,
    notFinalReleaseApproved: true,
    reviewClosureVersion: M2_REVIEW_CLOSURE_VERSION,
    privateReviewPack: {
      relativePath: relativePath(privateReviewPackPath),
      format: "csv",
      rowCount: packRows.length,
      gitignoredExpected: true,
      notForCommit: true
    },
    privateGroupDecisionTemplate: {
      relativePath: relativePath(privateGroupDecisionTemplatePath),
      format: "csv",
      rowCount: groupPolicy.groups.length,
      gitignoredExpected: true,
      notForCommit: true
    },
    closureSummary,
    groupPolicySummary: {
      groupCount: groupPolicy.groupCount,
      totalBlockingReviewItems: groupPolicy.totalBlockingReviewItems,
      groupDistribution: groupPolicy.groupDistribution,
      proposedGroupDecisionDistribution: groupPolicy.proposedGroupDecisionDistribution,
      finalGroupDecisionDistribution: groupDecisionPlan?.groupFinalDecisionDistribution ?? {}
    },
    currentDbReviewSummary: reviewSummary,
    decisionImport: decisionPlan
      ? {
          dryRun: mode === "dry_run",
          apply: mode === "apply",
          validationErrorCount: validation?.errors?.length ?? 0,
          importedDecisionCount: validation?.decisions?.length ?? 0,
          plannedUpdateCount: decisionPlan.updates.length,
          plannedNextBlockingStatusDistribution: decisionPlan.nextStatusDistribution,
          finalDecisionDistribution: distribution(validation?.decisions ?? [], "decision")
        }
      : null,
    groupDecisionImport: groupDecisionPlan
      ? {
          dryRun: mode === "group_dry_run",
          apply: mode === "group_apply",
          validationErrorCount: groupValidation?.errors?.length ?? 0,
          importedGroupDecisionCount: groupValidation?.decisions?.filter((decision) => decision.confirmed).length ?? 0,
          confirmedGroups: groupDecisionPlan.confirmedGroups,
          unconfirmedGroups: groupDecisionPlan.unconfirmedGroups,
          plannedUpdateCount: groupDecisionPlan.updates.length,
          affectedItemCount: groupDecisionPlan.affectedItemCount,
          plannedNextBlockingStatusDistribution: groupDecisionPlan.nextStatusDistribution,
          finalGroupDecisionDistribution: groupDecisionPlan.groupFinalDecisionDistribution
        }
      : null,
    mutation: mutation ?? null,
    safeOutputBoundary: safeOutputBoundary()
  };
  assertReportSanitized(businessReport);
  writeBusinessClosureReport(businessReport);

  const readiness = summarizeReadinessClosure({
    reviewSummary,
    finalDecisionsApplied,
    proposedDecisionsGenerated
  });
  const readinessReport = {
    schema: "m2.authorized_real_data.candidate_b_readiness_closure_summary.v0.1",
    generatedAt,
    mode,
    candidateVersion: CANDIDATE_VERSION,
    notFinalReleaseApproved: true,
    finalDecisionsApplied: Boolean(finalDecisionsApplied),
    proposedDecisionsGenerated: Boolean(proposedDecisionsGenerated),
    readiness,
    dryRunPlan: decisionPlan
      ? {
          plannedUpdateCount: decisionPlan.updates.length,
          plannedNextBlockingStatusDistribution: decisionPlan.nextStatusDistribution,
          finalDecisionDistribution: distribution(validation?.decisions ?? [], "decision")
        }
      : null,
    groupDryRunPlan: groupDecisionPlan
      ? {
          plannedUpdateCount: groupDecisionPlan.updates.length,
          affectedItemCount: groupDecisionPlan.affectedItemCount,
          confirmedGroups: groupDecisionPlan.confirmedGroups,
          unconfirmedGroups: groupDecisionPlan.unconfirmedGroups,
          plannedNextBlockingStatusDistribution: groupDecisionPlan.nextStatusDistribution,
          finalGroupDecisionDistribution: groupDecisionPlan.groupFinalDecisionDistribution,
          importedGroupDecisionCount: groupValidation?.decisions?.filter((decision) => decision.confirmed).length ?? 0
        }
      : null,
    conclusion: finalDecisionsApplied
      ? "Final decisions were applied locally; review remaining blocking statuses and reimport requirements before any next local readiness stage."
      : "Final decisions were not applied. Proposed decisions are generated, and blocking items remain pending until user/business confirmation.",
    safeOutputBoundary: safeOutputBoundary()
  };
  assertReportSanitized(readinessReport);
  writeReadinessClosureReport(readinessReport);

  const groupPolicyReport = {
    ...groupPolicy,
    generatedAt,
    mode,
    candidateVersion: CANDIDATE_VERSION,
    notFinalReleaseApproved: true,
    itemLevelStatusDistribution: reviewSummary.blockingStatusDistribution,
    finalGroupDecisionDistribution: groupDecisionPlan?.groupFinalDecisionDistribution ?? {},
    privateGroupDecisionTemplate: {
      relativePath: relativePath(privateGroupDecisionTemplatePath),
      format: "csv",
      gitignoredExpected: true,
      notForCommit: true
    },
    safeOutputBoundary: safeOutputBoundary()
  };
  const policyValidation = validateGroupPolicy(groupPolicyReport);
  if (!policyValidation.valid) {
    throw new Error(`Generated group policy is invalid: ${JSON.stringify(policyValidation.errors)}`);
  }
  assertReportSanitized(groupPolicyReport);
  writeGroupPolicyReport(groupPolicyReport);
  writeUserDecisionBrief(groupPolicyReport, reviewSummary);

  return { businessReport, readinessReport, groupPolicyReport };
}

function writeBusinessClosureReport(report) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(BUSINESS_CLOSURE_JSON, JSON.stringify(report, null, 2), "utf8");
  writeFileSync(
    BUSINESS_CLOSURE_MD,
    `# M2 candidate-b blocking review business closure plan v0.1

Mode: authorized local real-data DB-backed development.

Candidate: \`${CANDIDATE_VERSION}\`

This is a local development closure plan. It is not a final formal evaluation or release approval.

## Executive Summary

- Blocking review items: ${report.closureSummary.totalBlockingReviewItems}
- Final decisions applied in this run: ${report.mutation?.appliedCount ?? 0}
- Proposed decisions generated: yes
- Private review pack: \`${report.privateReviewPack.relativePath}\`
- Private group decision template: \`${report.privateGroupDecisionTemplate.relativePath}\`
- Group count: ${report.groupPolicySummary.groupCount}

## Reason Code Distribution

${markdownDistribution(report.closureSummary.reasonCodeDistribution, "Reason Code")}

## Reason Group Distribution

${markdownDistribution(report.closureSummary.reasonGroupDistribution, "Reason Group")}

## Priority Distribution

${markdownDistribution(report.closureSummary.priorityDistribution, "Priority")}

## Risk Type Distribution

${markdownDistribution(report.closureSummary.riskTypeDistribution, "Risk Type")}

## Suggestion Type Distribution

${markdownDistribution(report.closureSummary.suggestionCodeDistribution, "Suggestion Code")}

## Data Gap Type Distribution

${markdownDistribution(report.closureSummary.dataGapTypeDistribution, "Data Gap Type")}

## Proposed Decision Distribution

${markdownDistribution(report.closureSummary.proposedDecisionDistribution, "Proposed Decision")}

## Group Decision Distribution

${markdownDistribution(report.groupPolicySummary.groupDistribution, "Group")}

## Proposed Group Decision Distribution

${markdownDistribution(report.groupPolicySummary.proposedGroupDecisionDistribution, "Proposed Group Decision")}

## Required Business Decision Categories

${report.closureSummary.requiredBusinessDecisionCategories.map((item) => `- ${item}`).join("\n")}

No raw rows, real work names, author names, channel names, exact per-work revenue detail, secrets, connection strings, private workbook names, dumps, or temporary DB files are written in this report.
`,
    "utf8"
  );
}

function writeReadinessClosureReport(report) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(READINESS_CLOSURE_JSON, JSON.stringify(report, null, 2), "utf8");
  writeFileSync(
    READINESS_CLOSURE_MD,
    `# M2 candidate-b readiness closure summary v0.1

Mode: authorized local real-data DB-backed development.

Candidate: \`${CANDIDATE_VERSION}\`

This is local development evidence only. It is not a final formal evaluation or release approval.

## Current Closure State

- Final decisions applied: ${report.finalDecisionsApplied ? "yes" : "no"}
- Proposed decisions generated: ${report.proposedDecisionsGenerated ? "yes" : "no"}
- Remaining blocking count: ${report.readiness.remainingBlockingCount}
- Pending count: ${report.readiness.pendingCount}
- Data fix required count: ${report.readiness.dataFixRequiredCount}
- Waiver count: ${report.readiness.waiverCount}
- Rejected for formal count: ${report.readiness.rejectedForFormalCount}
- Approved count: ${report.readiness.approvedCount}
- No action required count: ${report.readiness.noActionRequiredCount}
- Audit event count: ${report.readiness.auditEventCount}
- Reimport required: ${report.readiness.reimportRequired ? "yes" : "no"}
- Candidate can move to next local readiness stage: ${report.readiness.candidateCanMoveToNextLocalReadinessStage ? "yes" : "no"}

## Blocking Status Distribution

${markdownDistribution(report.readiness.blockingStatusDistribution, "Status")}

## Conclusion

${report.conclusion}

No raw rows, real work names, author names, channel names, exact per-work revenue detail, secrets, connection strings, private workbook names, dumps, or temporary DB files are written in this report.
`,
    "utf8"
  );
}

function writeGroupPolicyReport(report) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(GROUP_POLICY_JSON, JSON.stringify(report, null, 2), "utf8");
  writeFileSync(
    GROUP_POLICY_MD,
    `# M2 candidate-b review group decision policy v0.1

Mode: authorized local real-data DB-backed development.

Candidate: \`${CANDIDATE_VERSION}\`

This policy compresses 85 pending blocking review items into auditable group-level business decisions. It is local development evidence only, not final formal release approval.

## Group Summary

${markdownGroupTable(report.groups)}

## Proposed Group Decision Distribution

${markdownDistribution(report.proposedGroupDecisionDistribution, "Proposed Decision")}

## Required Fields Per Decision

${markdownRequiredFields(report.requiredFieldsPerDecision)}

## Audit Metadata Requirements

${report.auditMetadataRequirements.map((item) => `- ${item}`).join("\n")}

## Unconfirmed Group Policy

${report.unconfirmedItemPolicy}

No raw rows, real work names, author names, channel names, exact per-work revenue detail, secrets, connection strings, private workbook names, dumps, or temporary DB files are written in this report.
`,
    "utf8"
  );
}

function writeUserDecisionBriefClean(report, reviewSummary) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(
    USER_DECISION_BRIEF_MD,
    `# M2 candidate-b review user decision brief v0.1

Mode: authorized local real-data DB-backed development.

Candidate: \`${CANDIDATE_VERSION}\`

This brief compresses the 85 pending blocking review items into auditable group-level business decisions. It contains aggregate information only and is not a final formal evaluation or release approval.

## Current State

- Blocking review items: ${report.totalBlockingReviewItems}
- Blocking status distribution: ${formatInlineDistribution(reviewSummary.blockingStatusDistribution)}
- Final group decisions: ${formatInlineDistribution(report.finalGroupDecisionDistribution)}
- Unconfirmed groups and items remain \`pending\`.

## Decision Groups

${report.groups.map(userBriefGroupSectionClean).join("\n\n")}

## How To Proceed

1. Open the gitignored private group template: \`${report.privateGroupDecisionTemplate.relativePath}\`.
2. Fill only groups with a confirmed business decision.
3. For \`waiver_granted\`, provide \`reviewerReason\`, \`reviewerName\`, \`waiverScope\`, and \`waiverExpiry\`.
4. For \`data_fix_required\`, keep \`dataFixRequiredFlag=true\` and confirm whether \`reimportRequiredFlag=true\`.
5. Leave uncertain groups blank or \`pending\`; they will not be applied automatically.

## Blocking And Closure

- \`pending\`, \`data_fix_required\`, and \`rejected_for_formal\` continue to block local readiness.
- \`approved\`, \`waiver_granted\`, and \`no_action_required\` can close the corresponding local blocker only with explicit business reason and audit metadata.
- If any group requires data correction, complete the minimal local source fix and rerun import/reconciliation/remediation before closing it.

Do not treat local candidate-b as a final formal release result. Do not commit private templates, raw bills, ledgers, private Excel/CSV files, .env, .pgpass, dumps, or sensitive details.
`,
    "utf8"
  );
}

function writeUserDecisionBrief(report, reviewSummary) {
  if (process.env.M2_REVIEW_BRIEF_LEGACY !== "1") {
    writeUserDecisionBriefClean(report, reviewSummary);
    return;
  }
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(
    USER_DECISION_BRIEF_MD,
    `# M2 candidate-b 分组业务决策简报 v0.1

当前 85 条 blocking review items 已压缩为 ${report.groupCount} 个业务决策组。这个简报只展示聚合信息，不包含真实作品名、渠道名、作者名、原始账单行或作品 x 渠道 x 月份 x 收入明细。

candidate-b 是授权本地真实数据开发候选，不是最终正式发布审批结果。

## 当前状态

- blocking review items：${report.totalBlockingReviewItems}
- 当前 blocking 状态：${formatInlineDistribution(reviewSummary.blockingStatusDistribution)}
- 当前 final group decisions：${formatInlineDistribution(report.finalGroupDecisionDistribution)}
- 未确认的 group 和 item 会继续保持 pending。

## 需要确认的分组

${report.groups.map(userBriefGroupSection).join("\n\n")}

## 快速推进方式

1. 打开私有模板：\`${report.privateGroupDecisionTemplate.relativePath}\`。
2. 只填写你已经明确确认的 group：\`reviewerDecision\`、\`reviewerReason\`、\`reviewerName\`。
3. 若选择 \`waiver_granted\`，必须填写 \`waiverScope\` 和 \`waiverExpiry\` 或明确的无到期理由。
4. 若选择 \`data_fix_required\`，必须保持 \`dataFixRequiredFlag=true\`，并确认是否需要 \`reimportRequiredFlag=true\`。
5. 没把握的 group 不要填写 final decision，它会继续 pending，不会被自动通过。

## 阻断与放行

- \`pending\`、\`data_fix_required\`、\`rejected_for_formal\` 会继续阻断进入下一阶段 local readiness。
- \`approved\`、\`waiver_granted\`、\`no_action_required\` 可以关闭对应本地 blocker，但必须有明确业务理由和 audit metadata。
- 如果任何 group 需要数据修正，应先完成最小本地数据修正、重新 import/reconciliation，再判断下一阶段 local readiness。

不得把本地 candidate-b 当作最终正式发布结果；不得提交私有模板、原始账单、台账、私有 Excel/CSV、.env、.pgpass、dump 或敏感明细。
`,
    "utf8"
  );
}

function writeBlockedReports(error) {
  const message = String(error.message ?? "");
  const generatedAt = new Date().toISOString();
  const report = {
    schema: "m2.authorized_real_data.candidate_b_review_closure_blocked.v0.1",
    generatedAt,
    status: "blocked",
    candidateVersion: CANDIDATE_VERSION,
    notFinalReleaseApproved: true,
    failure: {
      category:
        message.toLowerCase().includes("connect") || message.toLowerCase().includes("econnrefused")
          ? "local_database_connection_failed"
          : "local_review_decision_closure_unavailable",
      suggestedFixes: [
        "Confirm Docker Desktop and local PostgreSQL are running.",
        "Run npm run import:m2:real-data:local-db before review closure export/apply.",
        "Confirm .env.local points to the authorized local development database only."
      ]
    },
    sanitizedError: message,
    safeOutputBoundary: safeOutputBoundary()
  };
  assertReportSanitized(report);
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(BUSINESS_CLOSURE_JSON, JSON.stringify(report, null, 2), "utf8");
  writeFileSync(READINESS_CLOSURE_JSON, JSON.stringify(report, null, 2), "utf8");
  writeFileSync(
    BUSINESS_CLOSURE_MD,
    `# M2 candidate-b blocking review business closure plan v0.1

Status: blocked.

The local DB-backed review closure workflow could not run. See the JSON summary for sanitized failure category and next fixes.
`,
    "utf8"
  );
  writeFileSync(
    READINESS_CLOSURE_MD,
    `# M2 candidate-b readiness closure summary v0.1

Status: blocked.

No raw rows, real work names, author names, channel names, secrets, or connection strings are written in this report.
`,
    "utf8"
  );
}

function assertReportSanitized(report) {
  const result = assertSanitizedClosureReport(report);
  if (!result.sanitized) {
    throw new Error(`Sanitized report boundary violation: ${result.detected.join(", ")}`);
  }
}

function markdownDistribution(values, label) {
  const rows = Object.entries(values ?? {});
  if (rows.length === 0) {
    return `| ${label} | Count |\n|---|---|\n| none | 0 |`;
  }
  return [`| ${label} | Count |`, "|---|---|", ...rows.map(([key, value]) => `| ${key} | ${value} |`)].join(
    "\n"
  );
}

function markdownGroupTable(groups) {
  const lines = [
    "| Group | Reason Code | Count | Priority | Default Proposed | Allowed Final Decisions |",
    "|---|---|---:|---|---|---|"
  ];
  for (const group of groups ?? []) {
    lines.push(
      `| ${group.groupDecisionId} | ${group.reasonCode} | ${group.itemCount} | ${group.priorityRange} | ${group.defaultProposedDecision} | ${group.allowedFinalDecisions.join(", ")} |`
    );
  }
  return lines.join("\n");
}

function markdownRequiredFields(requiredFields) {
  const lines = ["| Decision | Required Fields |", "|---|---|"];
  for (const [decision, fields] of Object.entries(requiredFields ?? {})) {
    lines.push(`| ${decision} | ${(fields ?? []).join(", ")} |`);
  }
  return lines.join("\n");
}

function formatInlineDistribution(values) {
  const entries = Object.entries(values ?? {});
  if (entries.length === 0) {
    return "none";
  }
  return entries.map(([key, value]) => `${key}=${value}`).join(", ");
}

function userBriefGroupSectionClean(group) {
  const recommendations = {
    "GROUP-DATA-GAP-HIGH-VALUE":
      "Use the remediation summary first. If source data remains incomplete, keep the group as data_fix_required or choose another explicit audited business decision; do not bulk approve.",
    "GROUP-EXPIRY-HIGH-VALUE":
      "Use the waiver policy draft only if business confirms scope and expiry. Missing waiver scope, expiry, reviewer reason, or reviewer name must keep the group pending.",
    "GROUP-INSUFFICIENT-HISTORY":
      "Decide whether short history can be accepted, deferred, rejected for formal use, or handled by additional local evidence.",
    "GROUP-ABNORMAL-SPIKE":
      "Inspect aggregate spike evidence and decide whether the spike is valid one-off income, a data issue, or a formal blocker."
  };
  return `### ${group.groupDecisionId}

- Reason code: \`${group.reasonCode}\`
- Item count: ${group.itemCount}
- Priority range: ${group.priorityRange}
- Default proposed decision: \`${group.defaultProposedDecision}\`
- Allowed final decisions: ${group.allowedFinalDecisions.map((item) => `\`${item}\``).join(", ")}
- Recommended handling: ${recommendations[group.groupDecisionId] ?? group.requiredUserDecision}`;
}

function userBriefGroupSection(group) {
  const options = {
    "GROUP-DATA-GAP-HIGH-VALUE":
      "建议先确认是否全部保持 data_fix_required；如果已有统一业务口径，也可按组选择 waiver_granted、no_action_required、approved 或 rejected_for_formal。选择 data_fix_required 会继续阻断，并通常需要本地数据修正和 reimport。",
    "GROUP-EXPIRY-HIGH-VALUE":
      "建议确认是否可按统一版权到期策略授予 waiver_granted。必须填写 waiverScope、waiverExpiry 或无到期理由、reviewerReason。未确认则保持 pending。",
    "GROUP-INSUFFICIENT-HISTORY":
      "建议判断短历史是否可接受。no_action_required 或 approved 可关闭该组 blocker；pending、data_fix_required、rejected_for_formal 会继续阻断。",
    "GROUP-ABNORMAL-SPIKE":
      "建议单独人工确认异常 spike 是否为可接受的一次性收入影响。approved、waiver_granted 或 no_action_required 可关闭；pending、data_fix_required、rejected_for_formal 会继续阻断。"
  };
  return `### ${group.groupDecisionId}

- reasonCode：\`${group.reasonCode}\`
- itemCount：${group.itemCount}
- priorityRange：${group.priorityRange}
- 默认 proposedDecision：\`${group.defaultProposedDecision}\`
- 可选 final decisions：${group.allowedFinalDecisions.map((item) => `\`${item}\``).join("、")}
- 推荐处理：${options[group.groupDecisionId] ?? group.requiredUserDecision}`;
}

function distribution(rows, field) {
  const result = {};
  for (const row of rows ?? []) {
    const key = String(row?.[field] ?? "").trim() || "unknown";
    result[key] = (result[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

function safeOutputBoundary() {
  return {
    rawRowsWritten: false,
    realWorkNamesWritten: false,
    realAuthorNamesWritten: false,
    realChannelNamesWritten: false,
    exactPerWorkRevenueDetailWritten: false,
    secretsWritten: false,
    connectionStringsWritten: false,
    privateWorkbookNamesWritten: false,
    dumpsOrTempDbFilesWritten: false
  };
}

function relativePath(path) {
  return relative(ROOT, path).replaceAll("\\", "/");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = localConfig(readDotEnv(join(ROOT, ".env.local")));

  const result = await withClient(config, async (client) => {
    let mutation = null;
    if (args.resetDevDecisions) {
      mutation = await resetDevDecisions(client, args.actor);
    }

    const blockingItems = await loadBlockingReviewItems(client);
    const packRows = blockingItems.map(buildReviewPackRow);
    const schema = validateReviewPackSchema(packRows);
    if (!schema.valid) {
      throw new Error(`Generated review pack schema is invalid: ${schema.missingColumns.join(", ")}`);
    }

    let validation = null;
    let decisionPlan = null;
    let groupValidation = null;
    let groupDecisionPlan = null;
    if (args.decisions) {
      const decisionFile = validateDecisionFile(args.decisions);
      validation = decisionFile.validation;
      decisionPlan = planDecisionApplication(packRows, validation.decisions);
      if (!decisionPlan.valid) {
        throw new Error(`Decision plan rejected: ${JSON.stringify(decisionPlan.errors.slice(0, 10))}`);
      }
      if (args.apply) {
        mutation = await applyDecisionUpdates(client, decisionPlan.updates);
      }
    }
    if (args.groupDecisions) {
      const groupDecisionFile = validateGroupDecisionFile(args.groupDecisions, packRows);
      groupValidation = groupDecisionFile.validation;
      groupDecisionPlan = planGroupDecisionApplication(packRows, groupValidation.decisions);
      if (!groupDecisionPlan.valid) {
        throw new Error(`Group decision plan rejected: ${JSON.stringify(groupDecisionPlan.errors.slice(0, 10))}`);
      }
      if (args.apply) {
        mutation = await applyDecisionUpdates(client, groupDecisionPlan.updates);
      }
    }

    const refreshedBlockingItems = await loadBlockingReviewItems(client);
    const refreshedPackRows = refreshedBlockingItems.map(buildReviewPackRow);
    const groupPolicy = buildGroupDecisionPolicy(refreshedPackRows);
    const groupTemplateRows = buildCurrentGroupDecisionTemplateRows(refreshedPackRows);
    const allReviewRows = await loadAllReviewRows(client);
    const reviewSummary = buildReviewSummary(allReviewRows);
    if (args.exportPack) {
      writeCsv(args.pack, refreshedPackRows);
    }
    if (args.exportGroupTemplate) {
      writeCsv(args.pack, refreshedPackRows);
      writeCsv(args.groupTemplate, groupTemplateRows, GROUP_DECISION_TEMPLATE_COLUMNS);
    }

    const mode = args.groupDecisions
      ? args.apply
        ? "group_apply"
        : "group_dry_run"
      : args.apply
        ? "apply"
        : args.dryRun
          ? "dry_run"
          : args.exportGroupTemplate
            ? "export_group_template"
            : args.exportPack
              ? "export_pack"
              : "summary";
    const reports = buildReports({
      mode,
      packRows: refreshedPackRows,
      reviewSummary,
      privateReviewPackPath: args.pack,
      privateGroupDecisionTemplatePath: args.groupTemplate,
      groupPolicy,
      decisionPlan,
      validation,
      groupDecisionPlan,
      groupValidation,
      mutation,
      finalDecisionsApplied: args.apply && Number(mutation?.appliedCount ?? 0) > 0,
      proposedDecisionsGenerated: true
    });

    return {
      mode,
      packRows: refreshedPackRows.length,
      reviewSummary,
      decisionPlan,
      validation,
      groupDecisionPlan,
      groupValidation,
      mutation,
      reports
    };
  });

  console.log(
    JSON.stringify(
      {
        status: "pass",
        mode: result.mode,
        candidateVersion: CANDIDATE_VERSION,
        blockingReviewItems: result.packRows,
        pendingBlockingCount: result.reviewSummary.blockingStatusDistribution.pending ?? 0,
        proposedDecisionDistribution: result.reports.businessReport.closureSummary.proposedDecisionDistribution,
        groupCount: result.reports.groupPolicyReport.groupCount,
        groupDistribution: result.reports.groupPolicyReport.groupDistribution,
        proposedGroupDecisionDistribution: result.reports.groupPolicyReport.proposedGroupDecisionDistribution,
        finalGroupDecisionDistribution: result.reports.groupPolicyReport.finalGroupDecisionDistribution,
        finalDecisionDistribution: result.reviewSummary.finalDecisionDistribution,
        appliedCount: result.mutation?.appliedCount ?? 0,
        dryRunUpdateCount: result.decisionPlan?.updates?.length ?? 0,
        groupDryRunUpdateCount: result.groupDecisionPlan?.updates?.length ?? 0,
        privateReviewPack: relativePath(DEFAULT_PRIVATE_REVIEW_PACK),
        privateGroupDecisionTemplate: relativePath(DEFAULT_GROUP_DECISION_TEMPLATE),
        businessClosureReport: relativePath(BUSINESS_CLOSURE_JSON),
        readinessClosureReport: relativePath(READINESS_CLOSURE_JSON),
        groupPolicyReport: relativePath(GROUP_POLICY_JSON),
        userDecisionBrief: relativePath(USER_DECISION_BRIEF_MD),
        rawRowsWrittenToStdout: false,
        secretsWrittenToStdout: false
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  try {
    writeBlockedReports(error);
  } catch {
    // Keep original error as the process failure.
  }
  console.error(
    JSON.stringify(
      {
        status: "failed",
        error: error.message,
        rawRowsWrittenToStdout: false,
        secretsWrittenToStdout: false
      },
      null,
      2
    )
  );
  process.exit(1);
});
