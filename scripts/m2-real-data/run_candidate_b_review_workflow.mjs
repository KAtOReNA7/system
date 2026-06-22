import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  REVIEW_ACTIONS,
  allowedActionsForStatus,
  assertLocalDatabaseTarget,
  summarizeReviewWorkflow
} from "../../src/domain/oldProductEvaluation/realDataDbImportPlan.js";

const { Client } = pg;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUTPUT_DIR = join(ROOT, "docs", "analysis", "m2-real-data");
const REPORT_JSON = join(OUTPUT_DIR, "M2-candidate-b-blocking-review-workflow-summary-v0.1.json");
const REPORT_MD = join(OUTPUT_DIR, "M2-candidate-b-blocking-review-workflow-summary-v0.1.md");
const CANDIDATE_VERSION = "m2-realdata-dev-candidate-b-v0.1";

function parseArgs(argv) {
  const result = {
    apply: false,
    itemId: null,
    action: null,
    actor: "local_business_reviewer",
    reason: "local candidate-b review workflow update"
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      result.apply = true;
    } else if (arg === "--item-id") {
      result.itemId = Number(argv[++index]);
    } else if (arg === "--action") {
      result.action = argv[++index];
    } else if (arg === "--actor") {
      result.actor = argv[++index];
    } else if (arg === "--reason") {
      result.reason = argv[++index];
    }
  }
  return result;
}

function readDotEnv(path) {
  const values = {};
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

async function loadReviewRows(client) {
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
    auditEventCount: Array.isArray(row.auditMetadata?.events) ? row.auditMetadata.events.length : 0,
    allowedActions: allowedActionsForStatus(row.reviewStatus)
  }));
}

async function applyAction(client, args) {
  if (!args.apply && !args.action && !args.itemId) {
    return null;
  }
  if (!args.apply || !args.itemId || !args.action) {
    throw new Error("Review mutation requires --apply --item-id <id> --action <action>.");
  }
  const nextStatus = REVIEW_ACTIONS[args.action];
  if (!nextStatus) {
    throw new Error(`Unsupported review action: ${args.action}`);
  }
  const current = await client.query(
    `SELECT id, review_status, audit_metadata_json
       FROM m1.m2_evaluation_review_items
      WHERE id = $1`,
    [args.itemId]
  );
  if (current.rowCount === 0) {
    throw new Error(`Review item not found: ${args.itemId}`);
  }
  const row = current.rows[0];
  if (row.review_status !== "pending") {
    throw new Error(`Review item ${args.itemId} is not pending.`);
  }
  const metadata = row.audit_metadata_json ?? {};
  const events = Array.isArray(metadata.events) ? metadata.events : [];
  const nextMetadata = {
    ...metadata,
    events: [
      ...events,
      {
        eventType: `review_${args.action}`,
        actor: args.actor,
        at: new Date().toISOString(),
        reason: args.reason,
        aggregateOnly: true
      }
    ],
    rawDetailWritten: false
  };
  await client.query(
    `UPDATE m1.m2_evaluation_review_items
        SET review_status = $1,
            reviewed_by = $2,
            reviewed_at = now(),
            decision = $3,
            decision_reason = $4,
            audit_metadata_json = $5::jsonb,
            updated_at = now()
      WHERE id = $6`,
    [nextStatus, args.actor, args.action, args.reason, JSON.stringify(nextMetadata), args.itemId]
  );
  return {
    itemId: args.itemId,
    action: args.action,
    nextStatus
  };
}

function table(rows, columns) {
  const lines = [`| ${columns.map(([, label]) => label).join(" | ")} |`];
  lines.push(`|${columns.map(() => "---").join("|")}|`);
  for (const row of rows) {
    lines.push(`| ${columns.map(([key]) => String(row[key] ?? "")).join(" | ")} |`);
  }
  return lines.join("\n");
}

function rowsFromDistribution(distribution) {
  return Object.entries(distribution ?? {}).map(([key, value]) => ({ key, value }));
}

function writeReports(report) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), "utf8");
  writeFileSync(
    REPORT_MD,
    `# M2 candidate-b blocking review workflow summary v0.1

Mode: authorized local real-data DB-backed development.

Candidate: \`${CANDIDATE_VERSION}\`

This workflow is local development evidence only. It is not a final release approval.

## Review Counts

${table(
  [
    { key: "totalReviewItems", value: report.summary.totalReviewItems },
    { key: "blockingReviewItems", value: report.summary.blockingReviewItems },
    { key: "advisoryReviewItems", value: report.summary.advisoryReviewItems },
    { key: "auditEventCount", value: report.summary.auditEventCount }
  ],
  [["key", "Metric"], ["value", "Count"]]
)}

## Status Distribution

${table(rowsFromDistribution(report.summary.statusDistribution), [["key", "Status"], ["value", "Count"]])}

## Blocking Reason Distribution

${table(rowsFromDistribution(report.summary.reasonCodeDistribution), [["key", "Reason"], ["value", "Count"]])}

## Priority Distribution

${table(rowsFromDistribution(report.summary.priorityDistribution), [["key", "Priority"], ["value", "Count"]])}

Default behavior does not approve any item automatically. Mutations require explicit \`--apply --item-id --action\`.

No raw rows, real work names, author names, channel names, secrets, or connection strings are written in this report.
`,
    "utf8"
  );
}

function writeBlockedReport(error) {
  const message = String(error.message ?? "");
  const report = {
    schema: "m2.authorized_real_data.candidate_b_review_workflow_summary.v0.1",
    generatedAt: new Date().toISOString(),
    mode: "authorized_local_real_data_db_backed_development",
    status: "blocked",
    candidateVersion: CANDIDATE_VERSION,
    notFinalReleaseApproved: true,
    failure: {
      category:
        message.toLowerCase().includes("connect") || message.toLowerCase().includes("econnrefused")
          ? "local_database_connection_failed"
          : "local_review_workflow_unavailable",
      environmentIssue: true,
      schemaIssue: false,
      dataIssue: false,
      suggestedFixes: [
        "Complete local DB import with npm run import:m2:real-data:local-db.",
        "If Docker is blocked, fix Docker Desktop storage and rerun the import before review workflow."
      ]
    },
    sanitizedError: message,
    safeOutputBoundary: {
      rawRowsWritten: false,
      realWorkNamesWritten: false,
      realAuthorNamesWritten: false,
      realChannelNamesWritten: false,
      secretsWritten: false,
      connectionStringsWritten: false
    }
  };
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), "utf8");
  writeFileSync(
    REPORT_MD,
    `# M2 candidate-b blocking review workflow summary v0.1

Status: blocked.

Candidate: \`${CANDIDATE_VERSION}\`

The local DB-backed review workflow could not query review items because the local DB import is not available.

## Suggested Fixes

${report.failure.suggestedFixes.map((item) => `- ${item}`).join("\n")}

No raw rows, real work names, author names, channel names, secrets, or connection strings are written in this report.
`,
    "utf8"
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = localConfig(readDotEnv(join(ROOT, ".env.local")));
  const report = await withClient(config, async (client) => {
    const mutation = await applyAction(client, args);
    const rows = await loadReviewRows(client);
    const summary = summarizeReviewWorkflow(rows);
    return {
      schema: "m2.authorized_real_data.candidate_b_review_workflow_summary.v0.1",
      generatedAt: new Date().toISOString(),
      mode: "authorized_local_real_data_db_backed_development",
      candidateVersion: CANDIDATE_VERSION,
      notFinalReleaseApproved: true,
      mutation,
      summary,
      safeOutputBoundary: {
        rawRowsWritten: false,
        realWorkNamesWritten: false,
        realAuthorNamesWritten: false,
        realChannelNamesWritten: false,
        secretsWritten: false,
        connectionStringsWritten: false
      }
    };
  });
  writeReports(report);
  console.log(
    JSON.stringify(
      {
        status: "pass",
        candidateVersion: CANDIDATE_VERSION,
        totalReviewItems: report.summary.totalReviewItems,
        blockingReviewItems: report.summary.blockingReviewItems,
        pendingCount: report.summary.pendingCount,
        mutationApplied: Boolean(report.mutation),
        report: REPORT_JSON.replaceAll("\\", "/"),
        rawRowsWritten: false,
        secretsWritten: false
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  writeBlockedReport(error);
  console.error(
    JSON.stringify(
      {
        status: "failed",
        error: error.message,
        rawRowsWritten: false,
        secretsWritten: false
      },
      null,
      2
    )
  );
  process.exit(1);
});
