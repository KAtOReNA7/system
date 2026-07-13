import { withDatabaseClient } from "../db/query.js";
import { evaluateM2FormalEvaluationState } from "../domain/oldProductEvaluation/formalEvaluationStateMachine.js";

const BLOCKING_STATUSES = new Set(["pending", "data_fix_required", "rejected_for_formal"]);
const VISIBLE_PACKAGE_STATUSES = ["prepared", "pending_approval", "approved", "released"];

export async function listM2FormalEvaluationExports(config, { pagination }) {
  return withDatabaseClient(
    config.database.backgroundUrl ?? config.database.readonlyUrl,
    "background",
    "m2-formal-evaluation-exports",
    async (client) => {
      const exportPackage = await loadLatestExportPackage(client);
      const releaseGate = await loadReleaseGate(client, exportPackage);
      if (!exportPackage) {
        return emptyExportList(pagination, releaseGate);
      }
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
           r.formal_evaluation_allowed AS "formalEvaluationAllowed",
           r.not_for_formal_decision AS "notForFormalDecision",
           r.generated_at AS "generatedAt"
         FROM m1.m2_formal_export_items item
         JOIN m1.m2_evaluation_results r ON r.id = item.evaluation_result_id
         WHERE item.export_package_id = $1
           AND r.result_status = 'current'
         ORDER BY r.rating ASC NULLS LAST, r.standard_work_id ASC
         LIMIT $2 OFFSET $3`,
        [exportPackage.id, pagination.pageSize, (pagination.page - 1) * pagination.pageSize]
      );
      const total = await scalar(
        client,
        "SELECT count(*)::int FROM m1.m2_formal_export_items WHERE export_package_id = $1",
        [exportPackage.id]
      );
      return {
        mode: "db_backed",
        candidateVersion: exportPackage.candidateVersion,
        exportPackage: sanitizeExportPackage(exportPackage),
        releaseGate,
        items: result.rows.map(toExportSummary),
        pagination: {
          page: pagination.page,
          pageSize: pagination.pageSize,
          total
        },
        rawRowsWritten: false,
        secretsWritten: false,
        operatingSuggestionsIncluded: false
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
      const exportPackage = await loadLatestExportPackage(client);
      if (!exportPackage) {
        return null;
      }
      const releaseGate = await loadReleaseGate(client, exportPackage);
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
           jsonb_build_object(
             'cutoffMonth', snapshot.cutoff_month,
             'latestCompleteMonth', snapshot.latest_complete_month,
             'incomeFactVersion', snapshot.income_fact_version,
             'remainingCopyrightMonths', snapshot.remaining_copyright_months,
             'activeMonthCount', snapshot.active_month_count,
             'zeroRevenueMonthCount', snapshot.zero_revenue_month_count,
             'incompleteMonthsExcluded', snapshot.incomplete_months_excluded
           ) AS snapshot
         FROM m1.m2_formal_export_items item
         JOIN m1.m2_evaluation_results r ON r.id = item.evaluation_result_id
         LEFT JOIN m1.m2_evaluation_risks risk ON risk.evaluation_result_id = r.id
         LEFT JOIN m1.m2_evaluation_input_snapshots snapshot ON snapshot.evaluation_result_id = r.id
         WHERE item.export_package_id = $1
           AND r.result_status = 'current'
           AND item.standard_work_id = $2
         GROUP BY r.id, snapshot.id`,
        [exportPackage.id, standardWorkId]
      );
      const item = result.rows[0];
      if (!item) {
        return null;
      }
      return {
        mode: "db_backed",
        candidateVersion: exportPackage.candidateVersion,
        exportPackage: sanitizeExportPackage(exportPackage),
        releaseGate,
        item: toExportDetail(item),
        rawRowsWritten: false,
        secretsWritten: false,
        operatingSuggestionsIncluded: false
      };
    }
  );
}

async function loadLatestExportPackage(client) {
  const result = await client.query(
    `SELECT
       id,
       export_key AS "exportKey",
       candidate_version AS "candidateVersion",
       algorithm_version AS "algorithmVersion",
       mapping_version_id AS "mappingVersionId",
       basic_info_version_id AS "basicInfoVersionId",
       cutoff_month AS "cutoffMonth",
       status,
       item_count AS "itemCount",
       contains_operating_suggestions AS "containsOperatingSuggestions",
       generated_at AS "generatedAt",
       approved_at AS "approvedAt",
       released_at AS "releasedAt"
     FROM m1.m2_formal_export_packages
     WHERE status = ANY($1::text[])
     ORDER BY id DESC
     LIMIT 1`,
    [VISIBLE_PACKAGE_STATUSES]
  );
  return result.rows[0] ?? null;
}

async function loadReleaseGate(client, exportPackage) {
  if (!exportPackage) {
    return {
      status: "blocked",
      stateMachine: evaluateM2FormalEvaluationState({}),
      checks: {
        packagePrepared: false,
        packageReleased: false,
        blockerZero: false,
        formalFlags: false,
        mappingValidated: false,
        mappingActivated: false,
        algorithmFormal: false,
        noOperatingSuggestions: true
      },
      blockingReasons: ["db_backed_export_package_missing"],
      formalExportCreated: false,
      mappingActivationPrepared: false,
      mappingVersionActivated: false,
      switchMappingVersionCalled: false
    };
  }
  const evidence = await loadStateEvidence(client, exportPackage);
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
  if (evidence.mappingVersionActive !== true) {
    blockingReasons.push("mapping_version_not_active");
  }
  if (evidence.algorithmVersionFormal !== true) {
    blockingReasons.push("algorithm_not_formal");
  }
  if (exportPackage.status !== "released") {
    blockingReasons.push("export_not_released");
  }
  if (exportPackage.containsOperatingSuggestions === true) {
    blockingReasons.push("operating_suggestions_forbidden");
  }
  return {
    status: blockingReasons.length === 0 ? "released" : "blocked",
    packageStatus: exportPackage.status,
    stateMachine,
    checks: {
      packagePrepared: ["prepared", "pending_approval", "approved", "released"].includes(
        exportPackage.status
      ),
      packageReleased: exportPackage.status === "released",
      blockerZero: evidence.reviewBlockingRemaining === 0,
      formalFlags: evidence.formalEvaluationAllowed === true,
      mappingValidated: evidence.mappingVersionValidated === true,
      mappingActivated: evidence.mappingVersionActive === true,
      algorithmFormal: evidence.algorithmVersionFormal === true,
      noOperatingSuggestions: exportPackage.containsOperatingSuggestions !== true
    },
    blockingReasons,
    formalExportCreated: true,
    mappingActivationPrepared: evidence.mappingActivationPrepared,
    mappingVersionActivated: evidence.mappingVersionActive,
    switchMappingVersionCalled: false
  };
}

async function loadStateEvidence(client, exportPackage) {
  const total = await scalar(
    client,
    `SELECT count(*)::int
       FROM m1.m2_formal_export_items item
       JOIN m1.m2_evaluation_results r ON r.id = item.evaluation_result_id
      WHERE item.export_package_id = $1
        AND r.result_status = 'current'`,
    [exportPackage.id]
  );
  const formalAllowed = await scalar(
    client,
    `SELECT count(*)::int
       FROM m1.m2_formal_export_items item
       JOIN m1.m2_evaluation_results r ON r.id = item.evaluation_result_id
      WHERE item.export_package_id = $1
        AND r.result_status = 'current'
        AND r.formal_evaluation_allowed = true
        AND r.not_for_formal_decision = false`,
    [exportPackage.id]
  );
  const pendingRows = await client.query(
    `SELECT review.review_status AS "reviewStatus", count(*)::int AS count
       FROM m1.m2_formal_export_items item
       JOIN m1.m2_evaluation_review_items review
         ON review.evaluation_result_id = item.evaluation_result_id
      WHERE item.export_package_id = $1
        AND review.review_type = 'blocking_manual_review'
      GROUP BY review.review_status`,
    [exportPackage.id]
  );
  const reviewBlockingRemaining = pendingRows.rows.reduce(
    (sum, row) => sum + (BLOCKING_STATUSES.has(row.reviewStatus) ? Number(row.count) : 0),
    0
  );
  const mapping = await client.query(
    `SELECT status,
            status IN ('validated', 'active') AS "validated",
            status = 'active' AS "active"
       FROM m1.mapping_version
      WHERE id = $1`,
    [exportPackage.mappingVersionId]
  );
  const algorithm = await client.query(
    `SELECT status, is_formal AS "isFormal"
       FROM m1.m2_evaluation_algorithm_versions
      WHERE version_key = $1`,
    [exportPackage.algorithmVersion]
  );
  const currentMapping = mapping.rows[0] ?? {};
  const currentAlgorithm = algorithm.rows[0] ?? {};
  const packageComplete = total > 0 && total === Number(exportPackage.itemCount);
  return {
    prdScoreBefore: 35,
    candidateVersion: exportPackage.candidateVersion,
    expectedCandidateVersion: exportPackage.candidateVersion,
    candidateGenerated: total > 0,
    dbBackedImportComplete: total > 0,
    importReconciliationPassed: packageComplete,
    lifecycleRatingRuntimeAvailable: true,
    forecastRuntimeAvailable: true,
    forecastValidationPassed: packageComplete,
    reviewBlockingRemaining,
    reviewPendingBlocking: reviewBlockingRemaining,
    totalBlockingReviewItems: Number(
      pendingRows.rows.reduce((sum, row) => sum + Number(row.count), 0)
    ),
    reviewClosureBusinessComplete: reviewBlockingRemaining === 0,
    finalDecisionsApplied: reviewBlockingRemaining === 0,
    dbBackedExportAvailable: packageComplete,
    formalEvaluationAllowed: total > 0 && formalAllowed === total,
    mappingActivationPrepared: currentMapping.validated === true,
    mappingActivationExecuted: currentMapping.active === true,
    switchMappingVersionCalled: false,
    mappingVersionActive: currentMapping.active === true,
    mappingVersionValidated: currentMapping.validated === true,
    algorithmVersionFrozen: currentAlgorithm.status === "frozen",
    algorithmVersionFormal: currentAlgorithm.isFormal === true,
    notFinalReleaseApproved: !["approved", "released"].includes(exportPackage.status)
  };
}

function emptyExportList(pagination, releaseGate) {
  return {
    mode: "db_backed",
    candidateVersion: null,
    exportPackage: null,
    releaseGate,
    items: [],
    pagination: { page: pagination.page, pageSize: pagination.pageSize, total: 0 },
    rawRowsWritten: false,
    secretsWritten: false,
    operatingSuggestionsIncluded: false
  };
}

function sanitizeExportPackage(exportPackage) {
  return {
    exportKey: exportPackage.exportKey,
    candidateVersion: exportPackage.candidateVersion,
    algorithmVersion: exportPackage.algorithmVersion,
    cutoffMonth: toIsoDate(exportPackage.cutoffMonth),
    status: exportPackage.status,
    itemCount: Number(exportPackage.itemCount),
    generatedAt: exportPackage.generatedAt,
    approvedAt: exportPackage.approvedAt,
    releasedAt: exportPackage.releasedAt,
    operatingSuggestionsIncluded: false
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
    forecastBaseTotal: row.forecastBaseTotal === null ? null : Number(row.forecastBaseTotal),
    forecastOptimisticTotal:
      row.forecastOptimisticTotal === null ? null : Number(row.forecastOptimisticTotal),
    forecastPessimisticTotal:
      row.forecastPessimisticTotal === null ? null : Number(row.forecastPessimisticTotal),
    risks: row.risks ?? [],
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
