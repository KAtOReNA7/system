import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  assertLocalDatabaseTarget,
  buildDistribution
} from "../../src/domain/oldProductEvaluation/realDataDbImportPlan.js";
import {
  evaluateM2FormalEvaluationState
} from "../../src/domain/oldProductEvaluation/formalEvaluationStateMachine.js";

const { Client } = pg;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CANDIDATE_VERSION = "m2-realdata-dev-candidate-b-v0.1";
const IMPORT_RECONCILIATION_JSON = join(
  ROOT,
  "docs",
  "analysis",
  "m2-real-data",
  "M2-local-db-import-reconciliation-summary-v0.1.json"
);
const READINESS_CLOSURE_JSON = join(
  ROOT,
  "docs",
  "analysis",
  "m2-real-data",
  "M2-candidate-b-readiness-closure-summary-v0.1.json"
);

function readDotEnv(path) {
  if (!existsSync(path)) {
    throw new Error(".env.local is required for local M2 state machine evaluation.");
  }
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

async function loadDbEvidence(client) {
  const result = await client.query(
    `SELECT
       count(*)::int AS "evaluationResults",
       count(*) FILTER (WHERE r.lifecycle IS NOT NULL)::int AS "lifecycleCount",
       count(*) FILTER (WHERE r.rating IS NOT NULL)::int AS "ratingCount",
       count(*) FILTER (WHERE r.forecast_base_total IS NOT NULL)::int AS "forecastBaseCount",
       count(*) FILTER (WHERE r.forecast_optimistic_total IS NOT NULL)::int AS "forecastOptimisticCount",
       count(*) FILTER (WHERE r.forecast_pessimistic_total IS NOT NULL)::int AS "forecastPessimisticCount",
       count(*) FILTER (WHERE r.not_for_formal_decision = true)::int AS "notForFormalDecisionCount",
       count(*) FILTER (WHERE r.formal_evaluation_allowed = true)::int AS "formalEvaluationAllowedCount",
       count(DISTINCT r.mapping_version_id)::int AS "mappingVersionCount",
       bool_or(mv.status = 'active') AS "anyMappingVersionActive",
       bool_or(mv.status = 'validated') AS "anyMappingVersionValidated"
     FROM m1.m2_evaluation_results r
     JOIN m1.mapping_version mv ON mv.id = r.mapping_version_id
     WHERE r.candidate_version = $1`,
    [CANDIDATE_VERSION]
  );
  const review = await client.query(
    `SELECT
       i.review_type AS "reviewType",
       i.review_status AS "reviewStatus",
       i.reviewed_by AS "reviewedBy",
       i.decision_reason AS "decisionReason"
     FROM m1.m2_evaluation_review_items i
     JOIN m1.m2_evaluation_results r ON r.id = i.evaluation_result_id
     WHERE r.candidate_version = $1`,
    [CANDIDATE_VERSION]
  );
  const algorithm = await client.query(
    `SELECT status, is_formal AS "isFormal"
       FROM m1.m2_evaluation_algorithm_versions
      WHERE version_key = $1`,
    [CANDIDATE_VERSION]
  );

  const row = result.rows[0] ?? {};
  const reviewRows = review.rows ?? [];
  const blockingRows = reviewRows.filter((item) => item.reviewType === "blocking_manual_review");
  const blockingStatusDistribution = buildDistribution(blockingRows, "reviewStatus");
  const closedBlockingRows = blockingRows.filter((item) =>
    ["approved", "waiver_granted", "no_action_required"].includes(item.reviewStatus)
  );
  const closedBlockingRowsWithAudit = closedBlockingRows.filter(
    (item) =>
      String(item.reviewedBy ?? "").trim().length > 0 &&
      String(item.decisionReason ?? "").trim().length > 0
  );

  return {
    evaluationResults: Number(row.evaluationResults ?? 0),
    lifecycleCount: Number(row.lifecycleCount ?? 0),
    ratingCount: Number(row.ratingCount ?? 0),
    forecastBaseCount: Number(row.forecastBaseCount ?? 0),
    forecastOptimisticCount: Number(row.forecastOptimisticCount ?? 0),
    forecastPessimisticCount: Number(row.forecastPessimisticCount ?? 0),
    notForFormalDecisionCount: Number(row.notForFormalDecisionCount ?? 0),
    formalEvaluationAllowedCount: Number(row.formalEvaluationAllowedCount ?? 0),
    mappingVersionCount: Number(row.mappingVersionCount ?? 0),
    anyMappingVersionActive: row.anyMappingVersionActive === true,
    anyMappingVersionValidated: row.anyMappingVersionValidated === true,
    totalReviewItems: reviewRows.length,
    blockingReviewItems: blockingRows.length,
    advisoryReviewItems: reviewRows.length - blockingRows.length,
    blockingStatusDistribution,
    pendingBlockingCount: Number(blockingStatusDistribution.pending ?? 0),
    remainingBlockingCount: Object.entries(blockingStatusDistribution).reduce(
      (total, [status, count]) =>
        ["pending", "data_fix_required", "rejected_for_formal"].includes(status)
          ? total + Number(count)
          : total,
      0
    ),
    closedBlockingRowsWithAudit: closedBlockingRowsWithAudit.length,
    algorithmStatus: algorithm.rows[0]?.status ?? null,
    algorithmIsFormal: algorithm.rows[0]?.isFormal === true
  };
}

function readJson(path) {
  if (!existsSync(path)) {
    return null;
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

function buildStateMachineInput(dbEvidence) {
  const importReport = readJson(IMPORT_RECONCILIATION_JSON);
  const evaluationResults = Number(dbEvidence.evaluationResults ?? 0);
  const allResultsHaveLifecycleAndRating =
    evaluationResults > 0 &&
    dbEvidence.lifecycleCount === evaluationResults &&
    dbEvidence.ratingCount === evaluationResults;
  const allResultsHaveForecast =
    evaluationResults > 0 &&
    dbEvidence.forecastBaseCount === evaluationResults &&
    dbEvidence.forecastOptimisticCount === evaluationResults &&
    dbEvidence.forecastPessimisticCount === evaluationResults;
  const reviewClosureBusinessComplete =
    dbEvidence.blockingReviewItems > 0 &&
    dbEvidence.remainingBlockingCount === 0 &&
    dbEvidence.closedBlockingRowsWithAudit === dbEvidence.blockingReviewItems;

  return {
    prdScoreBefore: 35,
    candidateVersion: CANDIDATE_VERSION,
    expectedCandidateVersion: CANDIDATE_VERSION,
    candidateGenerated: evaluationResults > 0,
    dbBackedImportComplete: evaluationResults > 0,
    importReconciliationPassed: importReport?.reconciliation?.passed === true,
    lifecycleRatingRuntimeAvailable: allResultsHaveLifecycleAndRating,
    forecastRuntimeAvailable: allResultsHaveForecast,
    forecastValidationPassed:
      allResultsHaveForecast &&
      importReport?.reconciliation?.passed === true &&
      reviewClosureBusinessComplete,
    reviewBlockingRemaining: dbEvidence.remainingBlockingCount,
    reviewPendingBlocking: dbEvidence.pendingBlockingCount,
    totalBlockingReviewItems: dbEvidence.blockingReviewItems,
    advisoryPending: dbEvidence.advisoryReviewItems,
    reviewClosureBusinessComplete,
    finalDecisionsApplied: reviewClosureBusinessComplete,
    dbBackedExportAvailable: true,
    mappingActivationPrepared: dbEvidence.anyMappingVersionValidated,
    formalEvaluationAllowed:
      evaluationResults > 0 && dbEvidence.formalEvaluationAllowedCount === evaluationResults,
    mappingActivationExecuted: false,
    switchMappingVersionCalled: false,
    mappingVersionActive: dbEvidence.anyMappingVersionActive,
    mappingVersionValidated: dbEvidence.anyMappingVersionValidated,
    algorithmVersionFrozen: dbEvidence.algorithmStatus === "frozen",
    algorithmVersionFormal: dbEvidence.algorithmIsFormal,
    notFinalReleaseApproved: dbEvidence.notForFormalDecisionCount > 0 || dbEvidence.algorithmIsFormal !== true
  };
}

async function main() {
  const config = localConfig(readDotEnv(join(ROOT, ".env.local")));
  const dbEvidence = await withClient(config, loadDbEvidence);
  const stateMachineInput = buildStateMachineInput(dbEvidence);
  const stateMachine = evaluateM2FormalEvaluationState(stateMachineInput);

  console.log(
    JSON.stringify(
      {
        status: "pass",
        candidateVersion: CANDIDATE_VERSION,
        database: {
          hostCategory: "local",
          databaseName: config.databaseName,
          remoteDatabaseConnected: false
        },
        dbEvidence: {
          evaluationResults: dbEvidence.evaluationResults,
          totalReviewItems: dbEvidence.totalReviewItems,
          blockingReviewItems: dbEvidence.blockingReviewItems,
          advisoryReviewItems: dbEvidence.advisoryReviewItems,
          blockingStatusDistribution: dbEvidence.blockingStatusDistribution,
          remainingBlockingCount: dbEvidence.remainingBlockingCount,
          pendingBlockingCount: dbEvidence.pendingBlockingCount,
          algorithmStatus: dbEvidence.algorithmStatus,
          algorithmIsFormal: dbEvidence.algorithmIsFormal,
          mappingVersionActive: dbEvidence.anyMappingVersionActive,
          mappingVersionValidated: dbEvidence.anyMappingVersionValidated
        },
        stateMachine,
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
        rawRowsWrittenToStdout: false,
        secretsWrittenToStdout: false
      },
      null,
      2
    )
  );
  process.exit(1);
});
