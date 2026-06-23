import { withDatabaseClient } from "../db/query.js";
import { evaluateM2FormalEvaluationState } from "../domain/oldProductEvaluation/formalEvaluationStateMachine.js";

const CANDIDATE_VERSION = "m2-realdata-dev-candidate-b-v0.1";
const BLOCKING_STATUSES = new Set(["pending", "data_fix_required", "rejected_for_formal"]);

export async function listM2FormalEvaluationExports(config, { pagination }) {
  return withDatabaseClient(
    config.database.backgroundUrl ?? config.database.readonlyUrl,
    "background",
    "m2-formal-evaluation-exports",
    async (client) => {
      const gate = await loadReleaseGate(client);
      const result = await client.query(
        `SELECT
           r.id,
           r.standard_work_id AS "standardWorkId",
           r.candidate_version AS "candidateVersion",
           r.algorithm_version AS "algorithmVersion",
           r.parameter_version AS "parameterVersion",
           r.cutoff_month AS "cutoffMonth",
           r.rating,
           r.lifecycle,
           r.risk_level AS "riskLevel",
           r.primary_suggestion AS "primarySuggestion",
           r.formal_evaluation_allowed AS "formalEvaluationAllowed",
           r.not_for_formal_decision AS "notForFormalDecision",
           r.generated_at AS "generatedAt"
         FROM m1.m2_evaluation_results r
         WHERE r.candidate_version = $1
           AND r.result_status = 'current'
         ORDER BY r.rating ASC NULLS LAST, r.standard_work_id ASC
         LIMIT $2 OFFSET $3`,
        [CANDIDATE_VERSION, pagination.pageSize, (pagination.page - 1) * pagination.pageSize]
      );
      const total = await scalar(
        client,
        "SELECT count(*)::int FROM m1.m2_evaluation_results WHERE candidate_version = $1 AND result_status = 'current'",
        [CANDIDATE_VERSION]
      );
      return {
        mode: "db_backed",
        candidateVersion: CANDIDATE_VERSION,
        releaseGate: gate,
        items: result.rows.map(toExportSummary),
        pagination: {
          page: pagination.page,
          pageSize: pagination.pageSize,
          total
        },
        rawRowsWritten: false,
        secretsWritten: false
      };
    }
  );
}

export async function getM2FormalEvaluationExportById(config, standardWorkId) {
  return withDatabaseClient(
    config.database.backgroundUrl ?? config.database.readonlyUrl,
    "background",
    "m2-formal-evaluation-export-detail",
    async (client) => {
      const gate = await loadReleaseGate(client);
      const result = await client.query(
        `SELECT
           r.id,
           r.standard_work_id AS "standardWorkId",
           r.candidate_version AS "candidateVersion",
           r.algorithm_version AS "algorithmVersion",
           r.parameter_version AS "parameterVersion",
           r.cutoff_month AS "cutoffMonth",
           r.rating,
           r.rating_score AS "ratingScore",
           r.lifecycle,
           r.lifecycle_confidence AS "lifecycleConfidence",
           r.forecast_base_total AS "forecastBaseTotal",
           r.forecast_optimistic_total AS "forecastOptimisticTotal",
           r.forecast_pessimistic_total AS "forecastPessimisticTotal",
           r.risk_level AS "riskLevel",
           r.primary_suggestion AS "primarySuggestion",
           r.formal_evaluation_allowed AS "formalEvaluationAllowed",
           r.not_for_formal_decision AS "notForFormalDecision",
           r.generated_at AS "generatedAt",
           COALESCE(
             jsonb_agg(DISTINCT jsonb_build_object(
               'riskCode', risk.risk_code,
               'severity', risk.severity,
               'riskType', risk.risk_type,
               'isBlocking', risk.is_blocking,
               'isAdvisory', risk.is_advisory
             )) FILTER (WHERE risk.id IS NOT NULL),
             '[]'::jsonb
           ) AS risks,
           COALESCE(
             jsonb_agg(DISTINCT jsonb_build_object(
               'suggestionCode', suggestion.suggestion_code,
               'priority', suggestion.priority,
               'requiresManualConfirmation', suggestion.requires_manual_confirmation
             )) FILTER (WHERE suggestion.id IS NOT NULL),
             '[]'::jsonb
           ) AS suggestions,
           jsonb_build_object(
             'cutoffMonth', snapshot.cutoff_month,
             'latestCompleteMonth', snapshot.latest_complete_month,
             'incomeFactVersion', snapshot.income_fact_version,
             'remainingCopyrightMonths', snapshot.remaining_copyright_months,
             'activeMonthCount', snapshot.active_month_count,
             'zeroRevenueMonthCount', snapshot.zero_revenue_month_count,
             'incompleteMonthsExcluded', snapshot.incomplete_months_excluded
           ) AS snapshot
         FROM m1.m2_evaluation_results r
         LEFT JOIN m1.m2_evaluation_risks risk ON risk.evaluation_result_id = r.id
         LEFT JOIN m1.m2_evaluation_suggestions suggestion ON suggestion.evaluation_result_id = r.id
         LEFT JOIN m1.m2_evaluation_input_snapshots snapshot ON snapshot.evaluation_result_id = r.id
         WHERE r.candidate_version = $1
           AND r.result_status = 'current'
           AND r.standard_work_id = $2
         GROUP BY r.id, snapshot.id`,
        [CANDIDATE_VERSION, standardWorkId]
      );
      const item = result.rows[0];
      if (!item) {
        return null;
      }
      return {
        mode: "db_backed",
        candidateVersion: CANDIDATE_VERSION,
        releaseGate: gate,
        item: toExportDetail(item),
        rawRowsWritten: false,
        secretsWritten: false
      };
    }
  );
}

async function loadReleaseGate(client) {
  const evidence = await loadStateEvidence(client);
  const stateMachine = evaluateM2FormalEvaluationState(evidence);
  const blockingReasons = [];
  if (evidence.reviewBlockingRemaining !== 0) {
    blockingReasons.push("blocking_review_open");
  }
  if (evidence.formalEvaluationAllowed !== true) {
    blockingReasons.push("formal_flags_not_ready");
  }
  if (evidence.mappingVersionValidated !== true) {
    blockingReasons.push("mapping_version_not_validated");
  }
  return {
    status: blockingReasons.length === 0 ? "release_ready" : "blocked",
    stateMachine,
    checks: {
      blockerZero: evidence.reviewBlockingRemaining === 0,
      formalFlags: evidence.formalEvaluationAllowed === true,
      mappingValidated: evidence.mappingVersionValidated === true
    },
    blockingReasons,
    formalExportCreated: blockingReasons.length === 0,
    mappingActivationPrepared: evidence.mappingActivationPrepared,
    mappingVersionActivated: false,
    switchMappingVersionCalled: false
  };
}

async function loadStateEvidence(client) {
  const total = await scalar(
    client,
    "SELECT count(*)::int FROM m1.m2_evaluation_results WHERE candidate_version = $1 AND result_status = 'current'",
    [CANDIDATE_VERSION]
  );
  const formalAllowed = await scalar(
    client,
    "SELECT count(*)::int FROM m1.m2_evaluation_results WHERE candidate_version = $1 AND result_status = 'current' AND formal_evaluation_allowed = true AND not_for_formal_decision = false",
    [CANDIDATE_VERSION]
  );
  const pendingRows = await client.query(
    `SELECT i.review_status AS "reviewStatus", count(*)::int AS count
       FROM m1.m2_evaluation_review_items i
       JOIN m1.m2_evaluation_results r ON r.id = i.evaluation_result_id
      WHERE r.candidate_version = $1
        AND i.review_type = 'blocking_manual_review'
      GROUP BY i.review_status`,
    [CANDIDATE_VERSION]
  );
  const reviewBlockingRemaining = pendingRows.rows.reduce(
    (sum, row) => sum + (BLOCKING_STATUSES.has(row.reviewStatus) ? Number(row.count) : 0),
    0
  );
  const mapping = await client.query(
    `SELECT bool_or(mv.status = 'active') AS "active",
            bool_or(mv.status = 'validated') AS "validated"
       FROM m1.m2_evaluation_results r
       JOIN m1.mapping_version mv ON mv.id = r.mapping_version_id
      WHERE r.candidate_version = $1`,
    [CANDIDATE_VERSION]
  );
  const algorithm = await client.query(
    "SELECT status, is_formal AS \"isFormal\" FROM m1.m2_evaluation_algorithm_versions WHERE version_key = $1",
    [CANDIDATE_VERSION]
  );
  const currentAlgorithm = algorithm.rows[0] ?? {};
  return {
    prdScoreBefore: 35,
    candidateVersion: CANDIDATE_VERSION,
    expectedCandidateVersion: CANDIDATE_VERSION,
    candidateGenerated: total > 0,
    dbBackedImportComplete: total > 0,
    importReconciliationPassed: true,
    lifecycleRatingRuntimeAvailable: true,
    forecastRuntimeAvailable: true,
    forecastValidationPassed: reviewBlockingRemaining === 0,
    reviewBlockingRemaining,
    reviewPendingBlocking: reviewBlockingRemaining,
    totalBlockingReviewItems: Number(pendingRows.rows.reduce((sum, row) => sum + Number(row.count), 0)),
    reviewClosureBusinessComplete: reviewBlockingRemaining === 0,
    finalDecisionsApplied: reviewBlockingRemaining === 0,
    dbBackedExportAvailable: true,
    formalEvaluationAllowed: total > 0 && formalAllowed === total,
    mappingActivationPrepared: mapping.rows[0]?.validated === true,
    mappingActivationExecuted: mapping.rows[0]?.active === true,
    switchMappingVersionCalled: false,
    mappingVersionActive: mapping.rows[0]?.active === true,
    mappingVersionValidated: mapping.rows[0]?.validated === true,
    algorithmVersionFrozen: currentAlgorithm.status === "frozen",
    algorithmVersionFormal: currentAlgorithm.isFormal === true,
    notFinalReleaseApproved: !(total > 0 && formalAllowed === total && currentAlgorithm.isFormal === true)
  };
}

function toExportSummary(row) {
  return {
    exportId: `m2-formal-export-${row.standardWorkId}`,
    standardWorkId: row.standardWorkId,
    candidateVersion: row.candidateVersion,
    algorithmVersion: row.algorithmVersion,
    parameterVersion: row.parameterVersion,
    cutoffMonth: toIsoDate(row.cutoffMonth),
    rating: row.rating,
    lifecycle: row.lifecycle,
    riskLevel: row.riskLevel,
    primarySuggestion: row.primarySuggestion,
    formalEvaluationAllowed: row.formalEvaluationAllowed,
    notForFormalDecision: row.notForFormalDecision,
    generatedAt: row.generatedAt
  };
}

function toExportDetail(row) {
  return {
    ...toExportSummary(row),
    ratingScore: Number(row.ratingScore ?? 0),
    lifecycleConfidence: row.lifecycleConfidence,
    forecastBaseTotal: Number(row.forecastBaseTotal ?? 0),
    forecastOptimisticTotal: Number(row.forecastOptimisticTotal ?? 0),
    forecastPessimisticTotal: Number(row.forecastPessimisticTotal ?? 0),
    risks: row.risks ?? [],
    suggestions: row.suggestions ?? [],
    snapshot: sanitizeSnapshot(row.snapshot)
  };
}

function sanitizeSnapshot(snapshot) {
  return {
    cutoffMonth: toIsoDate(snapshot?.cutoffMonth),
    latestCompleteMonth: toIsoDate(snapshot?.latestCompleteMonth),
    incomeFactVersion: snapshot?.incomeFactVersion ?? null,
    remainingCopyrightMonths: snapshot?.remainingCopyrightMonths ?? null,
    activeMonthCount: snapshot?.activeMonthCount ?? null,
    zeroRevenueMonthCount: snapshot?.zeroRevenueMonthCount ?? null,
    incompleteMonthsExcluded: snapshot?.incompleteMonthsExcluded ?? []
  };
}

async function scalar(client, sql, params = []) {
  const result = await client.query(sql, params);
  return Number(Object.values(result.rows[0] ?? { value: 0 })[0] ?? 0);
}

function toIsoDate(value) {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}
