import { createHash } from "node:crypto";

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/u;
const EPSILON = 1e-12;

export const CMX01_ELIGIBILITY_STATUSES = Object.freeze([
  "ELIGIBLE_NATIVE_WORK_TOTAL",
  "ELIGIBLE_NATIVE_WORK_CHANNEL",
  "ELIGIBLE_REGISTERED_COMPOSITE",
  "ELIGIBLE_COMMON_ALLOCATOR_DIAGNOSTIC",
  "FORENSIC_ONLY_INVALID_CONTRACT",
  "EXCLUDED_NO_REPLAYABLE_IMPLEMENTATION",
  "EXCLUDED_NO_CANDIDATE_OUTPUT",
  "EXCLUDED_DATA_LEAKAGE_OR_ORIGIN_UNSAFE",
  "ALIAS_OR_DUPLICATE_NOT_INDEPENDENT_MODEL"
]);

export const CMX01_POPULATIONS = Object.freeze([
  "ORIGIN_VISIBLE_DYNAMIC_CORE80",
  "ANNUAL_ACTUAL_CORE80_HINDSIGHT_DIAGNOSTIC",
  "ALL_ELIGIBLE_WORKS_DIAGNOSTIC"
]);

export function addMonths(month, amount) {
  requireMonth(month, "month");
  if (!Number.isInteger(amount)) {
    throw new Error("m2_cmx01_month_offset_invalid");
  }
  const [year, oneBasedMonth] = month.split("-").map(Number);
  const serial = year * 12 + oneBasedMonth - 1 + amount;
  const targetYear = Math.floor(serial / 12);
  const targetMonth = serial - targetYear * 12 + 1;
  return `${targetYear}-${String(targetMonth).padStart(2, "0")}`;
}

export function buildCmx01OriginGrid({
  firstTargetMonth = "2020-01",
  lastTargetMonth = "2025-12",
  horizons = [3, 6, 12, 36]
} = {}) {
  requireMonth(firstTargetMonth, "first_target_month");
  requireMonth(lastTargetMonth, "last_target_month");
  if (lastTargetMonth < firstTargetMonth) {
    throw new Error("m2_cmx01_target_window_invalid");
  }
  const normalizedHorizons = [...new Set(horizons.map(requireHorizon))]
    .sort((left, right) => left - right);
  const firstOrigin = addMonths(firstTargetMonth, -1);
  const cells = [];
  for (const horizonMonths of normalizedHorizons) {
    const lastOrigin = addMonths(lastTargetMonth, -horizonMonths);
    for (
      let origin = firstOrigin;
      origin <= lastOrigin;
      origin = addMonths(origin, 1)
    ) {
      const targetStart = addMonths(origin, 1);
      const targetEnd = addMonths(origin, horizonMonths);
      cells.push(Object.freeze({
        origin,
        horizonMonths,
        targetStart,
        targetEnd,
        targetYear: Number(targetStart.slice(0, 4)),
        annualH12BusinessExam:
          horizonMonths === 12 && origin.endsWith("-12")
      }));
    }
  }
  cells.sort(compareOriginCells);
  return Object.freeze({
    firstTargetMonth,
    lastTargetMonth,
    horizons: Object.freeze(normalizedHorizons),
    cells: Object.freeze(cells),
    countsByHorizon: Object.freeze(Object.fromEntries(
      normalizedHorizons.map((horizon) => [
        String(horizon),
        cells.filter((cell) => cell.horizonMonths === horizon).length
      ])
    )),
    annualH12Origins: Object.freeze(cells.filter(
      (cell) => cell.annualH12BusinessExam
    ).map((cell) => cell.origin))
  });
}

export function validateCmx01Preregistration({
  preregistration,
  registry
}) {
  if (preregistration?.schema !== "m2.cmx01.preregistration.v0.1") {
    throw new Error("m2_cmx01_preregistration_schema_invalid");
  }
  if (preregistration?.campaignId !== "M2-CMX01") {
    throw new Error("m2_cmx01_campaign_identity_invalid");
  }
  if (!Array.isArray(registry?.models) || registry.models.length === 0) {
    throw new Error("m2_cmx01_registry_models_required");
  }
  const registryIds = registry.models.map((model) => model.stableModelId);
  const decisions = preregistration.eligibilityDecisions ?? [];
  const decisionIds = decisions.map((item) => item.modelId);
  assertUnique(registryIds, "m2_cmx01_duplicate_registry_model");
  assertUnique(decisionIds, "m2_cmx01_duplicate_eligibility_model");
  if (
    registryIds.length !== decisionIds.length
    || [...registryIds].sort().join("\n")
      !== [...decisionIds].sort().join("\n")
  ) {
    throw new Error("m2_cmx01_registry_eligibility_population_mismatch");
  }
  for (const decision of decisions) {
    if (!CMX01_ELIGIBILITY_STATUSES.includes(decision.status)) {
      throw new Error("m2_cmx01_eligibility_status_invalid");
    }
    if (typeof decision.reasonCode !== "string" || decision.reasonCode === "") {
      throw new Error("m2_cmx01_eligibility_reason_required");
    }
  }
  if (
    preregistration.bootstrap?.iterations < 5000
    || !Number.isInteger(preregistration.bootstrap.iterations)
    || !Number.isInteger(preregistration.bootstrap.seed)
    || preregistration.bootstrap.blockUnit !== "WORK_AND_FORECAST_ORIGIN"
  ) {
    throw new Error("m2_cmx01_bootstrap_contract_invalid");
  }
  if (
    JSON.stringify(preregistration.populations)
      !== JSON.stringify(CMX01_POPULATIONS)
  ) {
    throw new Error("m2_cmx01_population_contract_invalid");
  }
  const grid = buildCmx01OriginGrid(preregistration.evaluationWindow);
  if (grid.annualH12Origins.join("|") !== [
    "2019-12",
    "2020-12",
    "2021-12",
    "2022-12",
    "2023-12",
    "2024-12"
  ].join("|")) {
    throw new Error("m2_cmx01_annual_origin_contract_invalid");
  }
  return Object.freeze({
    valid: true,
    registryModelCount: registryIds.length,
    originHorizonCellCount: grid.cells.length
  });
}

export function buildCmx01CaseId(row, grain = "WORK_TOTAL") {
  const fields = [
    nonempty(row.population, "population"),
    requireMonth(row.forecastOrigin ?? row.origin, "forecast_origin"),
    requireMonth(row.targetStart, "target_start"),
    requireMonth(row.targetEnd, "target_end"),
    String(requireHorizon(row.horizonMonths ?? row.horizon)),
    nonempty(row.standardWorkId ?? row.workId, "standard_work_id")
  ];
  if (grain === "WORK_CHANNEL") {
    fields.push(nonempty(row.channelUid ?? row.channelId, "channel_uid"));
  } else if (grain !== "WORK_TOTAL") {
    throw new Error("m2_cmx01_case_grain_invalid");
  }
  return fields.join("|");
}

export function assertCmx01CaseUniverse(rows, {
  grain = "WORK_TOTAL",
  predictionField = "predictedCash",
  actualField = "actualCash"
} = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("m2_cmx01_case_rows_required");
  }
  const seen = new Set();
  for (const row of rows) {
    const caseId = buildCmx01CaseId(row, grain);
    if (row.caseId !== undefined && row.caseId !== caseId) {
      throw new Error("m2_cmx01_case_id_mismatch");
    }
    const modelId = nonempty(row.modelId, "model_id");
    const key = `${caseId}|${modelId}`;
    if (seen.has(key)) {
      throw new Error("m2_cmx01_duplicate_model_case");
    }
    seen.add(key);
    finite(row[actualField], "actual_cash");
    const prediction = row[predictionField];
    if (prediction !== null && prediction !== undefined) {
      finite(prediction, "predicted_cash");
    }
    const origin = requireMonth(
      row.forecastOrigin ?? row.origin,
      "forecast_origin"
    );
    if (row.featureCutoff !== undefined && row.featureCutoff > origin) {
      throw new Error("m2_cmx01_future_feature_read");
    }
    if (
      row.trainingMaximumLabelAvailableAsOf !== undefined
      && row.trainingMaximumLabelAvailableAsOf > origin
    ) {
      throw new Error("m2_cmx01_future_training_label_read");
    }
  }
  return true;
}

export function assertCmx01ActualParity(rows, {
  grain = "WORK_TOTAL",
  actualField = "actualCash"
} = {}) {
  const actualByCase = new Map();
  for (const row of rows) {
    const key = buildCmx01CaseId(row, grain);
    const actual = finite(row[actualField], "actual_cash");
    if (actualByCase.has(key) && actualByCase.get(key) !== actual) {
      throw new Error("m2_cmx01_cross_model_actual_mismatch");
    }
    actualByCase.set(key, actual);
  }
  return true;
}

export function scoreCmx01Rows(rows, {
  actualField = "actualCash",
  predictionField = "predictedCash",
  expectedCaseCount = null,
  failureAbsolutePercentageError = 1,
  catastropheAbsolutePercentageError = 3
} = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return emptyMetrics(expectedCaseCount);
  }
  const scored = rows.filter((row) => (
    Number.isFinite(Number(row[actualField]))
    && Number.isFinite(Number(row[predictionField]))
  )).map((row) => {
    const actual = Number(row[actualField]);
    const predicted = Number(row[predictionField]);
    const signedError = predicted - actual;
    const absoluteError = Math.abs(signedError);
    const ape = Math.abs(actual) > EPSILON
      ? absoluteError / Math.abs(actual)
      : null;
    const denominator = Math.abs(actual) + Math.abs(predicted);
    const sape = denominator > EPSILON
      ? 2 * absoluteError / denominator
      : 0;
    return { row, actual, predicted, signedError, absoluteError, ape, sape };
  });
  if (scored.length === 0) return emptyMetrics(expectedCaseCount);
  const actualDenominator = sum(scored.map((item) => Math.abs(item.actual)));
  const absoluteErrorTotal = sum(scored.map((item) => item.absoluteError));
  const signedErrorTotal = sum(scored.map((item) => item.signedError));
  const actualTotal = sum(scored.map((item) => item.actual));
  const predictionTotal = sum(scored.map((item) => item.predicted));
  const workErrors = groupSums(scored, (item) => (
    item.row.standardWorkId ?? item.row.workId
  ), (item) => item.absoluteError);
  const rankedWorkErrors = [...workErrors.entries()].sort((left, right) => (
    right[1] - left[1] || String(left[0]).localeCompare(String(right[0]))
  ));
  const denominatorForContribution = absoluteErrorTotal || 1;
  const expected = expectedCaseCount ?? scored.length;
  return Object.freeze({
    status: "COMPUTED",
    caseCount: scored.length,
    workCount: new Set(scored.map((item) => (
      item.row.standardWorkId ?? item.row.workId
    ))).size,
    expectedCaseCount: expected,
    coverage: expected > 0 ? scored.length / expected : null,
    actualDenominator,
    actualTotal,
    predictionTotal,
    predictedActualRatio: Math.abs(actualTotal) > EPSILON
      ? predictionTotal / actualTotal
      : null,
    absoluteErrorTotal,
    wape: actualDenominator > EPSILON
      ? absoluteErrorTotal / actualDenominator
      : null,
    signedBias: actualDenominator > EPSILON
      ? signedErrorTotal / actualDenominator
      : null,
    mae: absoluteErrorTotal / scored.length,
    rmse: Math.sqrt(
      sum(scored.map((item) => item.signedError ** 2)) / scored.length
    ),
    smape: mean(scored.map((item) => item.sape)),
    medianApeNonzeroActual: median(scored
      .map((item) => item.ape)
      .filter((value) => value !== null)),
    failureRate: scored.filter((item) => (
      item.ape !== null && item.ape >= failureAbsolutePercentageError
    )).length / scored.length,
    catastropheCount: scored.filter((item) => (
      item.ape !== null && item.ape >= catastropheAbsolutePercentageError
    )).length,
    top1WorkAbsoluteErrorContribution: contribution(
      rankedWorkErrors,
      1,
      denominatorForContribution
    ),
    top5WorkAbsoluteErrorContribution: contribution(
      rankedWorkErrors,
      5,
      denominatorForContribution
    ),
    top10WorkAbsoluteErrorContribution: contribution(
      rankedWorkErrors,
      10,
      denominatorForContribution
    ),
    maximumWorkAbsoluteErrorContribution:
      (rankedWorkErrors[0]?.[1] ?? 0) / denominatorForContribution
  });
}

export function buildCmx01MatchedRows(rows, modelIds, {
  grain = "WORK_TOTAL"
} = {}) {
  if (!Array.isArray(modelIds) || modelIds.length < 2) {
    throw new Error("m2_cmx01_matched_model_ids_required");
  }
  assertUnique(modelIds, "m2_cmx01_duplicate_matched_model_id");
  assertCmx01ActualParity(rows, { grain });
  const wanted = new Set(modelIds);
  const byCase = groupBy(rows.filter((row) => wanted.has(row.modelId)), (row) => (
    buildCmx01CaseId(row, grain)
  ));
  return Object.freeze([...byCase.entries()]
    .filter(([, values]) => (
      values.length === modelIds.length
      && values.every((row) => Number.isFinite(Number(row.predictedCash)))
      && new Set(values.map((row) => row.modelId)).size === modelIds.length
    ))
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([, values]) => values.sort((left, right) => (
      left.modelId.localeCompare(right.modelId)
    ))));
}

export function pairedCmx01Bootstrap(rows, {
  candidateModelId,
  baselineModelId,
  iterations = 5000,
  seed = 20260802,
  grain = "WORK_TOTAL"
}) {
  if (!Number.isInteger(iterations) || iterations < 5000) {
    throw new Error("m2_cmx01_bootstrap_iterations_invalid");
  }
  if (!Number.isInteger(seed)) {
    throw new Error("m2_cmx01_bootstrap_seed_invalid");
  }
  const matched = buildCmx01MatchedRows(
    rows,
    [candidateModelId, baselineModelId],
    { grain }
  );
  if (matched.length === 0) {
    throw new Error("m2_cmx01_bootstrap_matched_rows_required");
  }
  const byBlock = groupBy(matched, (row) => [
    row.standardWorkId ?? row.workId,
    row.forecastOrigin ?? row.origin
  ].join("|"));
  const blocks = [...byBlock.entries()].sort(([left], [right]) => (
    left.localeCompare(right)
  ));
  const random = mulberry32(seed);
  const differences = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const sample = [];
    for (let index = 0; index < blocks.length; index += 1) {
      const selected = blocks[Math.floor(random() * blocks.length)][1];
      sample.push(...selected);
    }
    const candidate = scoreCmx01Rows(sample.filter(
      (row) => row.modelId === candidateModelId
    ));
    const baseline = scoreCmx01Rows(sample.filter(
      (row) => row.modelId === baselineModelId
    ));
    if (candidate.wape === null || baseline.wape === null) continue;
    differences.push(candidate.wape - baseline.wape);
  }
  if (differences.length !== iterations) {
    throw new Error("m2_cmx01_bootstrap_degenerate_sample");
  }
  differences.sort((left, right) => left - right);
  return Object.freeze({
    method: "PAIRED_WORK_AND_FORECAST_ORIGIN_BLOCK_BOOTSTRAP",
    candidateModelId,
    baselineModelId,
    iterations,
    seed,
    matchedCaseCount: matched.length / 2,
    blockCount: blocks.length,
    wapeDifferenceCandidateMinusBaseline: Object.freeze({
      lower95: quantile(differences, 0.025),
      median: quantile(differences, 0.5),
      upper95: quantile(differences, 0.975),
      probabilityCandidateBetter:
        differences.filter((value) => value < 0).length / differences.length,
      probabilityCandidateNonInferior:
        differences.filter((value) => value <= 0).length / differences.length
    })
  });
}

export function allocateCmx01Trailing12Channels({
  workPrediction,
  observedMatureChannels,
  lastNonzeroMonthShares = null
}) {
  const total = finite(workPrediction, "work_prediction");
  if (!Array.isArray(observedMatureChannels)
    || observedMatureChannels.length === 0) {
    return Object.freeze({
      status: "ABSTAIN_CHANNEL_ALLOCATION",
      reason: "NO_ORIGIN_OBSERVED_MATURE_CHANNEL"
    });
  }
  assertUnique(
    observedMatureChannels.map((row) => row.channelUid),
    "m2_cmx01_duplicate_allocator_channel"
  );
  let weights = observedMatureChannels.map((row) => ({
    channelUid: nonempty(row.channelUid, "channel_uid"),
    weight: Math.max(0, finite(row.trailing12Cash, "trailing12_cash"))
  }));
  let source = "TRAILING_12_NONNEGATIVE_CASH";
  if (sum(weights.map((row) => row.weight)) <= EPSILON) {
    if (!Array.isArray(lastNonzeroMonthShares)
      || lastNonzeroMonthShares.length === 0) {
      return Object.freeze({
        status: "ABSTAIN_CHANNEL_ALLOCATION",
        reason: "TRAILING_12_ZERO_AND_NO_LAST_NONZERO_MONTH"
      });
    }
    weights = lastNonzeroMonthShares.map((row) => ({
      channelUid: nonempty(row.channelUid, "channel_uid"),
      weight: Math.max(0, finite(row.cash, "last_nonzero_cash"))
    }));
    source = "LAST_NONZERO_MONTH_WITHIN_TRAILING_12";
  }
  const denominator = sum(weights.map((row) => row.weight));
  if (denominator <= EPSILON) {
    return Object.freeze({
      status: "ABSTAIN_CHANNEL_ALLOCATION",
      reason: "ALLOCATOR_DENOMINATOR_ZERO"
    });
  }
  const rows = weights.map((row) => Object.freeze({
    channelUid: row.channelUid,
    share: row.weight / denominator,
    predictedCash: total * row.weight / denominator
  }));
  const difference = total - sum(rows.map((row) => row.predictedCash));
  if (Math.abs(difference) > 1e-7 * Math.max(1, Math.abs(total))) {
    throw new Error("m2_cmx01_channel_allocation_conservation_failed");
  }
  return Object.freeze({
    status: "ALLOCATED",
    allocatorId: "M2-EXP-OA03-CURRENT-SCOPE-REPLICATION-01/C1",
    source,
    rows: Object.freeze(rows),
    workPrediction: total,
    allocatedPrediction: sum(rows.map((row) => row.predictedCash)),
    conservationDifference: difference
  });
}

export function assertCmx01ChannelConservation(workRows, channelRows) {
  const work = uniqueMap(workRows, (row) => buildCmx01CaseId(row, "WORK_TOTAL"));
  const channels = groupBy(channelRows, (row) => {
    const copy = { ...row };
    delete copy.channelUid;
    delete copy.channelId;
    return buildCmx01CaseId(copy, "WORK_TOTAL");
  });
  for (const [key, row] of work) {
    const values = channels.get(key) ?? [];
    const predicted = sum(values.map((item) => finite(
      item.predictedCash,
      "channel_predicted_cash"
    )));
    if (Math.abs(predicted - Number(row.predictedCash)) > 1e-7) {
      throw new Error("m2_cmx01_work_channel_prediction_not_conserved");
    }
  }
  return true;
}

export function buildCmx01Checkpoint({
  contractSha256,
  sourceSnapshotSha256,
  completedPartitions,
  outputDigests
}) {
  const normalized = {
    schema: "m2.cmx01.checkpoint.v0.1",
    contractSha256: sha256Text(nonempty(contractSha256, "contract_sha256")),
    sourceSnapshotSha256: sha256Text(nonempty(
      sourceSnapshotSha256,
      "source_snapshot_sha256"
    )),
    completedPartitions: [...new Set(completedPartitions ?? [])].sort(),
    outputDigests: Object.fromEntries(Object.entries(outputDigests ?? {})
      .sort(([left], [right]) => left.localeCompare(right)))
  };
  return Object.freeze({
    ...normalized,
    checkpointDigest: sha256Canonical(normalized)
  });
}

export function validateCmx01Checkpoint(checkpoint, expected) {
  const { checkpointDigest, ...payload } = checkpoint ?? {};
  if (checkpoint?.schema !== "m2.cmx01.checkpoint.v0.1") {
    throw new Error("m2_cmx01_checkpoint_schema_invalid");
  }
  if (sha256Canonical(payload) !== checkpointDigest) {
    throw new Error("m2_cmx01_checkpoint_digest_invalid");
  }
  if (
    checkpoint.contractSha256 !== expected.contractSha256
    || checkpoint.sourceSnapshotSha256 !== expected.sourceSnapshotSha256
  ) {
    throw new Error("m2_cmx01_checkpoint_authority_mismatch");
  }
  return true;
}

export function assertCmx01PublicSafe(value) {
  const serialized = typeof value === "string"
    ? value
    : JSON.stringify(value);
  const forbidden = [
    /(?:^|[\\/])Users[\\/]/iu,
    /[A-Z]:[\\/]/u,
    /(?:^|[\\/])data[\\/]private-(?:input|output)[\\/]/iu,
    /"(?:standardWorkId|workId|workTitle|channelUid|channelId|channelName)"\s*:/iu,
    /"(?:actualCash|predictedCash|actual|pointEstimate)"\s*:\s*-?\d/iu
  ];
  if (forbidden.some((pattern) => pattern.test(serialized))) {
    throw new Error("m2_cmx01_public_artifact_contains_private_content");
  }
  return true;
}

export function sha256Canonical(value) {
  return createHash("sha256").update(
    JSON.stringify(sortObject(value)),
    "utf8"
  ).digest("hex");
}

function sha256Text(value) {
  if (!/^[0-9a-f]{64}$/u.test(value)) {
    throw new Error("m2_cmx01_sha256_invalid");
  }
  return value;
}

function emptyMetrics(expectedCaseCount) {
  return Object.freeze({
    status: "NOT_AVAILABLE",
    caseCount: 0,
    workCount: 0,
    expectedCaseCount,
    coverage: expectedCaseCount > 0 ? 0 : null,
    wape: null,
    signedBias: null,
    predictedActualRatio: null,
    mae: null,
    rmse: null,
    smape: null,
    medianApeNonzeroActual: null,
    failureRate: null,
    catastropheCount: null
  });
}

function compareOriginCells(left, right) {
  return left.origin.localeCompare(right.origin)
    || left.horizonMonths - right.horizonMonths;
}

function groupBy(values, keyFor) {
  const groups = new Map();
  for (const value of values) {
    const key = keyFor(value);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(value);
  }
  return groups;
}

function groupSums(values, keyFor, valueFor) {
  const groups = new Map();
  for (const value of values) {
    const key = keyFor(value);
    groups.set(key, (groups.get(key) ?? 0) + valueFor(value));
  }
  return groups;
}

function uniqueMap(values, keyFor) {
  const output = new Map();
  for (const value of values) {
    const key = keyFor(value);
    if (output.has(key)) {
      throw new Error("m2_cmx01_duplicate_case");
    }
    output.set(key, value);
  }
  return output;
}

function assertUnique(values, code) {
  if (new Set(values).size !== values.length) throw new Error(code);
}

function requireMonth(value, field) {
  if (typeof value !== "string" || !MONTH_PATTERN.test(value)) {
    throw new Error(`m2_cmx01_${field}_invalid`);
  }
  return value;
}

function requireHorizon(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error("m2_cmx01_horizon_invalid");
  }
  return number;
}

function finite(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`m2_cmx01_${field}_nonfinite`);
  }
  return number;
}

function nonempty(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`m2_cmx01_${field}_required`);
  }
  return value;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function mean(values) {
  return values.length > 0 ? sum(values) / values.length : null;
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function quantile(sorted, probability) {
  if (sorted.length === 0) return null;
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function contribution(ranked, count, denominator) {
  return sum(ranked.slice(0, count).map((entry) => entry[1])) / denominator;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [
      key,
      sortObject(value[key])
    ]));
  }
  return value;
}
