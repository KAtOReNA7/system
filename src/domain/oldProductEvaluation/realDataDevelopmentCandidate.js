export const M2_REALDATA_DEV_CANDIDATE_VERSION = "m2-realdata-dev-candidate-b-v0.1";

export const M2_REALDATA_DEV_BASELINE_CANDIDATE =
  "m2-c3-cleaned-bill-nonformal-v0.2/candidate-a";

export const M2_REALDATA_DEV_BOUNDARY = Object.freeze({
  mode: "authorized_local_real_data_development",
  candidateVersion: M2_REALDATA_DEV_CANDIDATE_VERSION,
  baselineCandidate: M2_REALDATA_DEV_BASELINE_CANDIDATE,
  localRealDataReadAllowed: true,
  dataDirectoryReadAllowed: true,
  localDatabaseAllowed: true,
  localDockerAllowed: true,
  localMigrationAllowed: true,
  aggregateOnlyReports: true,
  rawDetailMayEnterGit: false,
  notFinalReleaseApproved: true
});

export const M2_REALDATA_DEV_RATING_ORDER = Object.freeze(["S+", "S", "A", "B", "C", "D", "E"]);

export function ratingForAmount(amount, thresholds) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) {
    return "E";
  }
  for (const rating of M2_REALDATA_DEV_RATING_ORDER.slice(0, -1)) {
    if (numericAmount >= Number(thresholds?.[rating] ?? Number.POSITIVE_INFINITY)) {
      return rating;
    }
  }
  return "E";
}

export function summarizeCandidateDelta(baseline, candidate) {
  const baselineManual = Number(baseline?.manualReviewRequiredCount ?? 0);
  const candidateManual = Number(candidate?.manualReviewRequiredCount ?? 0);
  const baselineAdvisory = Number(baseline?.advisoryOnlyCount ?? 0);
  const candidateAdvisory = Number(candidate?.advisoryOnlyCount ?? 0);
  const baselinePromote = Number(baseline?.promoteCount ?? 0);
  const candidatePromote = Number(candidate?.promoteCount ?? 0);

  return {
    candidateVersion: M2_REALDATA_DEV_CANDIDATE_VERSION,
    baselineCandidate: M2_REALDATA_DEV_BASELINE_CANDIDATE,
    manualReviewReduction: baselineManual - candidateManual,
    advisoryIncrease: candidateAdvisory - baselineAdvisory,
    promoteIncrease: candidatePromote - baselinePromote,
    notFinalReleaseApproved: true
  };
}

export function assertAggregateOnlyPayload(payload) {
  const forbiddenKeys = new Set([
    "rawRows",
    "rawBillRows",
    "realBookTitle",
    "authorName",
    "channelName",
    "perWorkRevenueDetails",
    "envContent",
    "databaseConnectionInfo"
  ]);
  const keys = collectKeys(payload);
  const detectedForbiddenKeys = [...forbiddenKeys].filter((key) => keys.has(key));
  return {
    aggregateOnly: detectedForbiddenKeys.length === 0,
    detectedForbiddenKeys,
    candidateVersion: M2_REALDATA_DEV_CANDIDATE_VERSION,
    rawDetailMayEnterGit: false
  };
}

function collectKeys(value, keys = new Set()) {
  if (!value || typeof value !== "object") {
    return keys;
  }
  for (const [key, child] of Object.entries(value)) {
    keys.add(key);
    if (child && typeof child === "object") {
      collectKeys(child, keys);
    }
  }
  return keys;
}
