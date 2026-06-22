export const M2_REALDATA_DB_IMPORT_VERSION = "m2-local-db-import-v0.1";

export const M2_REALDATA_DB_IMPORT_REPORTS = Object.freeze({
  reconciliationJson:
    "docs/analysis/m2-real-data/M2-local-db-import-reconciliation-summary-v0.1.json",
  reconciliationMarkdown:
    "docs/analysis/m2-real-data/M2-local-db-import-reconciliation-summary-v0.1.md",
  reviewJson:
    "docs/analysis/m2-real-data/M2-candidate-b-blocking-review-workflow-summary-v0.1.json",
  reviewMarkdown:
    "docs/analysis/m2-real-data/M2-candidate-b-blocking-review-workflow-summary-v0.1.md"
});

export const REVIEW_ACTIONS = Object.freeze({
  approve: "approved",
  "data-fix": "data_fix_required",
  waiver: "waiver_granted",
  reject: "rejected_for_formal",
  "no-action": "no_action_required"
});

export function assertLocalDatabaseTarget({ host, databaseName, environmentName }) {
  const allowedHosts = new Set(["127.0.0.1", "localhost", "::1"]);
  const normalizedHost = String(host ?? "").trim();
  const normalizedDatabaseName = String(databaseName ?? "").trim();
  const normalizedEnvironmentName = String(environmentName ?? "").trim();
  const joined = `${normalizedDatabaseName} ${normalizedEnvironmentName}`.toLowerCase();
  const forbidden = ["prod", "production", "staging", "shared", "formal"];

  return {
    localOnly:
      allowedHosts.has(normalizedHost) &&
      normalizedDatabaseName.length > 0 &&
      normalizedEnvironmentName.length > 0 &&
      !forbidden.some((token) => joined.includes(token)),
    host: normalizedHost,
    databaseName: normalizedDatabaseName,
    environmentName: normalizedEnvironmentName,
    forbiddenTokenDetected: forbidden.find((token) => joined.includes(token)) ?? null
  };
}

export function buildDistribution(rows, field) {
  const distribution = {};
  for (const row of rows ?? []) {
    const value = row?.[field] ?? "unknown";
    distribution[value] = (distribution[value] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(distribution).sort(([left], [right]) => left.localeCompare(right)));
}

export function compareDistribution(expected, actual) {
  const keys = [...new Set([...Object.keys(expected ?? {}), ...Object.keys(actual ?? {})])].sort();
  const mismatches = keys.filter((key) => Number(expected?.[key] ?? 0) !== Number(actual?.[key] ?? 0));
  return {
    matches: mismatches.length === 0,
    mismatches,
    expected: Object.fromEntries(keys.map((key) => [key, Number(expected?.[key] ?? 0)])),
    actual: Object.fromEntries(keys.map((key) => [key, Number(actual?.[key] ?? 0)]))
  };
}

export function summarizeReconciliation({ fileSummary, dbSummary }) {
  const checks = {
    workCount:
      Number(fileSummary?.evaluatedWorkCount ?? 0) === Number(dbSummary?.evaluationResults ?? 0),
    candidateVersion: fileSummary?.candidateVersion === dbSummary?.candidateVersion,
    latestCompleteMonth: fileSummary?.latestCompleteMonth === dbSummary?.latestCompleteMonth,
    ratingDistribution: compareDistribution(
      fileSummary?.ratingDistribution ?? {},
      dbSummary?.ratingDistribution ?? {}
    ).matches,
    lifecycleDistribution: compareDistribution(
      fileSummary?.lifecycleDistribution ?? {},
      dbSummary?.lifecycleDistribution ?? {}
    ).matches,
    blockingReviewCount:
      Number(fileSummary?.manualReviewRequiredCount ?? 0) ===
      Number(dbSummary?.blockingReviewItems ?? 0),
    advisoryReviewCount:
      Number(fileSummary?.advisoryOnlyCount ?? 0) === Number(dbSummary?.advisoryReviewItems ?? 0)
  };

  return {
    checks,
    passed: Object.values(checks).every(Boolean)
  };
}

export function allowedActionsForStatus(status) {
  if (status !== "pending") {
    return [];
  }
  return Object.keys(REVIEW_ACTIONS);
}

export function summarizeReviewWorkflow(rows) {
  const reviewRows = rows ?? [];
  const blockingRows = reviewRows.filter((row) => row.reviewType === "blocking_manual_review");
  const auditEventCount = reviewRows.reduce(
    (total, row) => total + Number(row.auditEventCount ?? 0),
    0
  );

  return {
    totalReviewItems: reviewRows.length,
    blockingReviewItems: blockingRows.length,
    advisoryReviewItems: reviewRows.length - blockingRows.length,
    statusDistribution: buildDistribution(reviewRows, "reviewStatus"),
    reviewTypeDistribution: buildDistribution(reviewRows, "reviewType"),
    reasonCodeDistribution: buildDistribution(blockingRows, "reviewReasonCode"),
    priorityDistribution: buildDistribution(
      reviewRows.map((row) => ({ bucket: priorityBucket(row.reviewPriority) })),
      "bucket"
    ),
    auditEventCount,
    waiverCount: reviewRows.filter((row) => row.reviewStatus === "waiver_granted").length,
    dataFixRequiredCount: reviewRows.filter((row) => row.reviewStatus === "data_fix_required").length,
    rejectedForFormalCount: reviewRows.filter((row) => row.reviewStatus === "rejected_for_formal").length,
    approvedCount: reviewRows.filter((row) => row.reviewStatus === "approved").length,
    pendingCount: reviewRows.filter((row) => row.reviewStatus === "pending").length
  };
}

function priorityBucket(priority) {
  const value = Number(priority);
  if (value <= 20) {
    return "p1";
  }
  if (value <= 50) {
    return "p2";
  }
  return "p3";
}
