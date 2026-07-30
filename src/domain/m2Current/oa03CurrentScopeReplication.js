import {
  buildM2CurrentOccurrenceAmountCandidate,
  buildM2CurrentReliableCandidate
} from "./candidate.js";
import {
  allocateM2CoreLegacyChannelShares
} from "./coreLegacyChannelAllocation.js";
import { buildM2CurrentContract } from "./contract.js";

export const M2_OA03_CURRENT_SCOPE_EXPERIMENT_ID =
  "M2-EXP-OA03-CURRENT-SCOPE-REPLICATION-01";
export const M2_OA03_CURRENT_SCOPE_ACTUAL_ID =
  "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01";

const FAMILY_IDS = Object.freeze([
  "PRIMARY_ROLLING",
  "STRICT_ROLLING"
]);
const POPULATION_IDS = Object.freeze(["CORE80", "CORE90"]);
const HORIZONS = Object.freeze([3, 6, 12]);
const EPSILON = 1e-12;

export class M2Oa03CurrentScopeReplicationError extends Error {
  constructor(code) {
    super(code);
    this.name = "M2Oa03CurrentScopeReplicationError";
    this.code = code;
  }
}

export function validateM2Oa03CurrentScopeConfig(config) {
  if (
    config?.schema !== "m2.current.oa03_replication.v0.1"
    || config?.experiment?.stableExperimentId
      !== M2_OA03_CURRENT_SCOPE_EXPERIMENT_ID
    || config?.modelIdentity?.stableModelId !== "M2-WORK-OA03"
    || config?.modelIdentity?.canonicalFunction
      !== "buildM2CurrentOccurrenceAmountCandidate"
    || config?.scope?.actualDefinitionId
      !== M2_OA03_CURRENT_SCOPE_ACTUAL_ID
    || JSON.stringify(config?.scope?.horizonsMonths)
      !== JSON.stringify(HORIZONS)
    || config?.scope?.primaryPopulationId !== "CORE80"
    || config?.scope?.sensitivityPopulationId !== "CORE90"
    || config?.scope?.minimumWorkCompleteBillMonths !== 3
    || config?.scope?.minimumWorkChannelCompleteBillMonths !== 3
    || config?.training?.supportMode !== "FULL_MATURE_TRAINING_SUPPORT"
    || config?.training?.originSafe !== true
    || config?.training?.tailServingAuthorized !== false
    || config?.formula?.baseCandidateId
      !== "M2-current-hierarchical-robust-calibration-v0.2"
    || config?.formula?.minimumEarlierCaseCount !== 80
    || config?.formula?.priorStrength !== 10
    || config?.formula?.priorOccurrenceProbability !== 0.5
    || config?.formula?.minimumFactor !== 0.3
    || config?.formula?.maximumFactor !== 1.5
    || config?.formula?.fallbackFactor !== 1
    || config?.formula?.originalJointHorizonFitSemantics?.enabled !== true
    || config?.formula?.originalJointHorizonFitSemantics
      ?.crossFamilyPoolingAllowed !== false
    || config?.rollingEvaluation
      ?.familiesMustTrainSelectAndEvaluateIndependently !== true
    || config?.rollingEvaluation?.bootstrap?.iterations !== 2000
    || config?.rollingEvaluation?.bootstrap?.seed !== 20260728
    || config?.channelAllocation?.windowMonths !== 12
    || config?.channelAllocation?.canonicalFunction
      !== "allocateM2CoreLegacyChannelShares"
    || config?.channelAllocation?.canonicalArmId !== "C3_TRAILING_12"
    || config?.channelAllocation?.futureFirstChannelAllowed !== false
    || config?.channelAllocation?.equalSplitAllowed !== false
    || config?.channelAllocation?.requiredConservationDifferenceMinor !== 0
  ) {
    throw new M2Oa03CurrentScopeReplicationError(
      "m2_oa03_current_scope_config_invalid"
    );
  }
  const schedules = config.rollingEvaluation.schedules;
  if (
    JSON.stringify(Object.keys(schedules).sort())
      !== JSON.stringify([...FAMILY_IDS].sort())
  ) {
    throw new M2Oa03CurrentScopeReplicationError(
      "m2_oa03_current_scope_schedule_family_invalid"
    );
  }
  for (const family of FAMILY_IDS) {
    const schedule = schedules[family];
    const origins = normalizeMonths(
      schedule.trainingAndEvaluationOrigins,
      `schedule_${family}`
    );
    if (
      origins.length === 0
      || origins.some((origin, index) => (
        index > 0 && origin <= origins[index - 1]
      ))
      || !origins.includes(requireMonth(
        schedule.evaluationStartsAt,
        `schedule_${family}_start`
      ))
    ) {
      throw new M2Oa03CurrentScopeReplicationError(
        "m2_oa03_current_scope_schedule_invalid"
      );
    }
  }
  return true;
}

export function resolveM2Oa03CurrentScopeSchedules({
  config,
  authorityStartMonth,
  labelMaturityCutoff
}) {
  validateM2Oa03CurrentScopeConfig(config);
  const first = requireMonth(
    authorityStartMonth,
    "authority_start_month"
  );
  const cutoff = requireMonth(
    labelMaturityCutoff,
    "label_maturity_cutoff"
  );
  const output = {};
  for (const family of FAMILY_IDS) {
    const schedule = config.rollingEvaluation.schedules[family];
    const origins = schedule.trainingAndEvaluationOrigins.filter(
      (origin) => origin >= first && origin <= cutoff
    );
    const legalCells = [];
    for (const origin of origins) {
      for (const horizonMonths of HORIZONS) {
        if (addMonths(origin, horizonMonths) <= cutoff) {
          legalCells.push(Object.freeze({
            evaluationFamily: family,
            origin,
            horizonMonths,
            evaluationOrigin: origin >= schedule.evaluationStartsAt
          }));
        }
      }
    }
    output[family] = Object.freeze({
      evaluationFamily: family,
      evaluationStartsAt: schedule.evaluationStartsAt,
      origins: Object.freeze(origins),
      evaluationOrigins: Object.freeze(origins.filter(
        (origin) => origin >= schedule.evaluationStartsAt
      )),
      legalCells: Object.freeze(legalCells)
    });
  }
  if (Object.values(output).every(
    (schedule) => schedule.legalCells.length === 0
  )) {
    throw new M2Oa03CurrentScopeReplicationError(
      "m2_oa03_current_scope_no_legal_origin"
    );
  }
  return Object.freeze(output);
}

export function runM2Oa03CurrentScopeFamily({
  evaluationFamily,
  baseRows,
  baseCandidateConfig,
  occurrenceAmountConfig,
  experimentConfig
}) {
  validateM2Oa03CurrentScopeConfig(experimentConfig);
  if (!FAMILY_IDS.includes(evaluationFamily)) {
    throw new M2Oa03CurrentScopeReplicationError(
      "m2_oa03_current_scope_family_invalid"
    );
  }
  const normalized = normalizeBaseRows(
    baseRows,
    evaluationFamily,
    experimentConfig
  );
  const previousContract = buildM2CurrentContract(baseCandidateConfig);
  const occurrenceContract = buildM2CurrentContract(
    occurrenceAmountConfig
  );
  assertCanonicalFormulaContracts({
    previousContract,
    occurrenceContract,
    experimentConfig
  });
  const previous = buildM2CurrentReliableCandidate(
    normalized,
    normalized,
    previousContract
  );
  const candidate = buildM2CurrentOccurrenceAmountCandidate(
    previous.rows,
    occurrenceContract
  );
  const schedule = experimentConfig.rollingEvaluation
    .schedules[evaluationFamily];
  const evaluated = candidate.rows.filter(
    (row) => row.origin >= schedule.evaluationStartsAt
  ).map((row) => Object.freeze({
    ...row,
    evaluationFamily,
    modelId: "M2-WORK-OA03",
    rawOa03PointEstimate: row.pointEstimate,
    rawBaseCandidatePointEstimate: row.baseCandidatePointEstimate,
    pointEstimateMinor: decimalToMinor(
      row.pointEstimate,
      experimentConfig.formula.moneySemantics.fixedPointScalePower
    ).toString(),
    pointEstimate: minorToNumber(
      decimalToMinor(
        row.pointEstimate,
        experimentConfig.formula.moneySemantics.fixedPointScalePower
      ),
      experimentConfig.formula.moneySemantics.fixedPointScalePower
    ),
    selectedPipelineFallbackApplied:
      row.selectedCandidateId
      === experimentConfig.formula.baseCandidateId
  }));
  if (evaluated.length === 0) {
    throw new M2Oa03CurrentScopeReplicationError(
      "m2_oa03_current_scope_family_evaluation_empty"
    );
  }
  const previousByKey = new Map(previous.rows.map(
    (row) => [workCaseKey(row), row]
  ));
  const diagnostics = candidate.selections.map((selection) => Object.freeze({
    ...selection,
    evaluationFamily,
    fullMatureTrainingSupport: true,
    trainingPopulationDiagnostics: buildTrainingPopulationDiagnostics({
      selection,
      previousRows: previous.rows,
      experimentConfig
    })
  }));
  return Object.freeze({
    schema: "m2.current.oa03_family_replication.v0.1",
    experimentId: M2_OA03_CURRENT_SCOPE_EXPERIMENT_ID,
    evaluationFamily,
    candidateId: candidate.candidateId,
    baseCandidateId: candidate.baseCandidateId,
    fitRows: Object.freeze(candidate.rows.map((row) => Object.freeze({
      ...row,
      evaluationFamily,
      modelId: "M2-WORK-OA03",
      hrc02PointEstimate: previousByKey.get(workCaseKey(row))
        ?.pointEstimate ?? null
    }))),
    evaluationRows: Object.freeze(evaluated),
    hrc02Selections: Object.freeze(previous.selections),
    oa03Selections: Object.freeze(diagnostics),
    boundaries: Object.freeze({
      familyFitIndependent: true,
      fullMatureTrainingSupport: true,
      coreOnlyTraining: false,
      tailServing: false,
      futureLabelRead: false,
      formulaChanged: false,
      parameterGridChanged: false,
      revenueWeightingUsed: false,
      selectedFallbackMasksRawOa03: false
    })
  });
}

export function buildM2Oa03PopulationRows(
  evaluationRows,
  populationId
) {
  if (!POPULATION_IDS.includes(populationId)) {
    throw new M2Oa03CurrentScopeReplicationError(
      "m2_oa03_current_scope_population_invalid"
    );
  }
  const flag = populationId.toLowerCase();
  return Object.freeze(evaluationRows
    .filter((row) => row[flag] === true)
    .map((row) => Object.freeze({
      ...row,
      populationId,
      caseKey: workCaseKey(row)
    }))
    .sort(compareEvaluationRows));
}

export function scoreM2Oa03PointRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return Object.freeze({
      status: "NOT_COMPUTABLE_EMPTY",
      caseCount: 0,
      workCount: 0,
      actualDenominator: 0,
      predictionTotal: 0,
      actualTotal: 0,
      wape: null,
      signedBias: null,
      absoluteBias: null,
      mae: null,
      medianAbsoluteError: null,
      overpredictionCash: 0,
      underpredictionCash: 0,
      errorConcentration: null
    });
  }
  const values = rows.map((row) => {
    const actual = finite(row.actual, "metric_actual");
    const prediction = finite(
      row.pointEstimate,
      "metric_point_estimate"
    );
    const error = prediction - actual;
    return {
      standardWorkId: nonempty(
        row.standardWorkId,
        "metric_standard_work_id"
      ),
      actual,
      prediction,
      error,
      absoluteError: Math.abs(error)
    };
  });
  const denominator = sum(values.map((row) => Math.abs(row.actual)));
  const actualTotal = sum(values.map((row) => row.actual));
  const predictionTotal = sum(values.map((row) => row.prediction));
  const absoluteErrorTotal = sum(values.map(
    (row) => row.absoluteError
  ));
  const signedError = predictionTotal - actualTotal;
  const absoluteErrors = values.map(
    (row) => row.absoluteError
  ).sort((left, right) => left - right);
  const errorByWork = new Map();
  for (const row of values) {
    errorByWork.set(
      row.standardWorkId,
      (errorByWork.get(row.standardWorkId) ?? 0) + row.absoluteError
    );
  }
  const workErrors = [...errorByWork.values()].sort(
    (left, right) => right - left
  );
  const topWorkCount = Math.max(1, Math.ceil(workErrors.length * 0.1));
  return Object.freeze({
    status: denominator > 0
      ? "COMPUTED"
      : "NOT_COMPUTABLE_ZERO_DENOMINATOR",
    caseCount: values.length,
    workCount: errorByWork.size,
    actualDenominator: denominator,
    predictionTotal,
    actualTotal,
    absoluteErrorTotal,
    wape: denominator > 0 ? absoluteErrorTotal / denominator : null,
    signedBias: denominator > 0 ? signedError / denominator : null,
    absoluteBias: denominator > 0
      ? Math.abs(signedError / denominator)
      : null,
    mae: absoluteErrorTotal / values.length,
    medianAbsoluteError: empiricalQuantile(absoluteErrors, 0.5),
    overpredictionCash: sum(values.map(
      (row) => Math.max(0, row.error)
    )),
    underpredictionCash: sum(values.map(
      (row) => Math.max(0, -row.error)
    )),
    errorConcentration: Object.freeze({
      maximumWorkShare: absoluteErrorTotal > 0
        ? (workErrors[0] ?? 0) / absoluteErrorTotal
        : 0,
      top10PercentWorkShare: absoluteErrorTotal > 0
        ? sum(workErrors.slice(0, topWorkCount)) / absoluteErrorTotal
        : 0,
      top10PercentWorkCount: topWorkCount
    })
  });
}

export function scoreM2Oa03OccurrenceRows(rows) {
  const stored = rows.filter(
    (row) => Number.isFinite(Number(row.occurrenceProbability))
  ).map((row) => ({
    probability: probability(row.occurrenceProbability),
    outcome: Number(finite(row.actual, "occurrence_actual") > 0)
  }));
  if (stored.length === 0) {
    return Object.freeze({
      status: "CAPABILITY_NOT_STORED_FOR_EVALUATED_ROWS",
      evaluatedCaseCount: rows.length,
      probabilityCaseCount: 0
    });
  }
  const positives = stored.filter((row) => row.outcome === 1).length;
  const negatives = stored.length - positives;
  const sorted = [...stored].sort((left, right) => (
    right.probability - left.probability
    || right.outcome - left.outcome
  ));
  let truePositive = 0;
  let falsePositive = 0;
  let previousRecall = 0;
  let previousPrecision = 1;
  let prAuc = 0;
  let averagePrecision = 0;
  for (const row of sorted) {
    if (row.outcome === 1) truePositive += 1;
    else falsePositive += 1;
    const recall = positives > 0 ? truePositive / positives : 0;
    const precisionValue = truePositive / (truePositive + falsePositive);
    prAuc += (recall - previousRecall)
      * (precisionValue + previousPrecision) / 2;
    if (row.outcome === 1) {
      averagePrecision += (recall - previousRecall) * precisionValue;
    }
    previousRecall = recall;
    previousPrecision = precisionValue;
  }
  const bins = Array.from({ length: 10 }, (_, index) => {
    const values = stored.filter((row) => (
      Math.min(9, Math.floor(row.probability * 10)) === index
    ));
    return Object.freeze({
      bin: index + 1,
      lowerInclusive: index / 10,
      upperInclusive: (index + 1) / 10,
      caseCount: values.length,
      meanProbability: values.length > 0
        ? mean(values.map((row) => row.probability))
        : null,
      observedRate: values.length > 0
        ? mean(values.map((row) => row.outcome))
        : null
    });
  });
  return Object.freeze({
    status: "COMPUTED_ON_NATIVE_STORED_PROBABILITIES",
    evaluatedCaseCount: rows.length,
    probabilityCaseCount: stored.length,
    missingProbabilityCaseCount: rows.length - stored.length,
    positiveCaseCount: positives,
    negativeCaseCount: negatives,
    observedOccurrenceRate: positives / stored.length,
    brier: mean(stored.map(
      (row) => (row.probability - row.outcome) ** 2
    )),
    logLoss: mean(stored.map((row) => {
      const bounded = Math.min(
        1 - Number.EPSILON,
        Math.max(Number.EPSILON, row.probability)
      );
      return -(
        row.outcome * Math.log(bounded)
        + (1 - row.outcome) * Math.log(1 - bounded)
      );
    })),
    prAucTrapezoidal: positives > 0 ? prAuc : null,
    averagePrecision: positives > 0 ? averagePrecision : null,
    rocAuc: positives > 0 && negatives > 0
      ? pairwiseRocAuc(stored)
      : null,
    reliability: Object.freeze(bins)
  });
}

export function pairM2Oa03SameCaseRows(
  candidateRows,
  baselineRows
) {
  const candidate = uniqueIndex(candidateRows, comparisonKey);
  const baseline = uniqueIndex(baselineRows, comparisonKey);
  const rows = [];
  let actualMismatchCount = 0;
  for (const [key, current] of candidate) {
    const reference = baseline.get(key);
    if (!reference) continue;
    if (
      Math.abs(
        finite(current.actual, "candidate_actual")
        - finite(reference.actual, "baseline_actual")
      ) > 1e-7
    ) {
      actualMismatchCount += 1;
      continue;
    }
    rows.push(Object.freeze({
      caseKey: workCaseKey(current),
      standardWorkId: current.standardWorkId,
      origin: current.origin,
      horizonMonths: Number(current.horizonMonths),
      evaluationFamily: current.evaluationFamily,
      populationId: current.populationId,
      actual: Number(current.actual),
      candidatePointEstimate: Number(current.pointEstimate),
      baselinePointEstimate: Number(reference.pointEstimate)
    }));
  }
  return Object.freeze({
    rows: Object.freeze(rows.sort(compareEvaluationRows)),
    candidateCaseCount: candidate.size,
    baselineCaseCount: baseline.size,
    sameCaseCount: rows.length,
    actualMismatchCount
  });
}

export function scoreM2Oa03PairedBootstrap(rows, {
  iterations = 2000,
  seed = 20260728
} = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return Object.freeze({
      status: "NOT_COMPUTABLE_EMPTY",
      iterations: 0
    });
  }
  const byWork = groupBy(rows, (row) => String(row.standardWorkId));
  const workIds = [...byWork.keys()].sort(stableTextCompare);
  if (workIds.length < 2) {
    return Object.freeze({
      status: "NOT_COMPUTABLE_INSUFFICIENT_WORK_CLUSTERS",
      iterations: 0,
      workCount: workIds.length
    });
  }
  const random = mulberry32(seed);
  const absolute = [];
  const relative = [];
  const bias = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const sample = [];
    for (let index = 0; index < workIds.length; index += 1) {
      const selected = workIds[Math.floor(random() * workIds.length)];
      sample.push(...byWork.get(selected));
    }
    const candidate = scoreM2Oa03PointRows(sample.map((row) => ({
      ...row,
      pointEstimate: row.candidatePointEstimate
    })));
    const baseline = scoreM2Oa03PointRows(sample.map((row) => ({
      ...row,
      pointEstimate: row.baselinePointEstimate
    })));
    if (
      candidate.wape === null
      || baseline.wape === null
      || candidate.signedBias === null
      || baseline.signedBias === null
    ) {
      continue;
    }
    absolute.push(baseline.wape - candidate.wape);
    relative.push(baseline.wape > 0
      ? (baseline.wape - candidate.wape) / baseline.wape
      : 0);
    bias.push(candidate.signedBias - baseline.signedBias);
  }
  absolute.sort((left, right) => left - right);
  relative.sort((left, right) => left - right);
  bias.sort((left, right) => left - right);
  return Object.freeze({
    status: absolute.length === iterations ? "COMPUTED" : "PARTIAL",
    method: "paired_standard_work_cluster_resample",
    iterations: absolute.length,
    seed,
    workCount: workIds.length,
    absoluteWapeImprovement95: interval95(absolute),
    relativeWapeImprovement95: interval95(relative),
    signedBiasDifference95: interval95(bias)
  });
}

export function scoreM2Oa03TimeBlocks(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return Object.freeze([]);
  }
  const origins = [...new Set(rows.map((row) => row.origin))].sort();
  const blockCount = Math.min(3, origins.length);
  const blockByOrigin = new Map(origins.map((origin, index) => [
    origin,
    `TIME_BLOCK_${String(
      Math.min(blockCount, Math.floor(index * blockCount / origins.length) + 1)
    ).padStart(3, "0")}`
  ]));
  const blocks = groupBy(rows, (row) => blockByOrigin.get(row.origin));
  return Object.freeze([...blocks].map(([blockId, values]) => {
    const candidate = scoreM2Oa03PointRows(values.map((row) => ({
      ...row,
      pointEstimate: row.candidatePointEstimate
    })));
    const baseline = scoreM2Oa03PointRows(values.map((row) => ({
      ...row,
      pointEstimate: row.baselinePointEstimate
    })));
    return Object.freeze({
      blockId,
      originCount: new Set(values.map((row) => row.origin)).size,
      caseCount: values.length,
      workCount: new Set(values.map(
        (row) => row.standardWorkId
      )).size,
      candidateWape: candidate.wape,
      baselineWape: baseline.wape,
      candidateSignedBias: candidate.signedBias,
      baselineSignedBias: baseline.signedBias,
      relativeWapeImprovement: (
        candidate.wape !== null
        && baseline.wape !== null
        && baseline.wape > 0
      ) ? (baseline.wape - candidate.wape) / baseline.wape : null,
      candidateWins: (
        candidate.wape !== null
        && baseline.wape !== null
        && candidate.wape < baseline.wape
      )
    });
  }).sort((left, right) => left.blockId.localeCompare(right.blockId)));
}

export function assessM2Oa03WorkEvidence({
  pairedRows,
  config,
  seedOffset = 0
}) {
  validateM2Oa03CurrentScopeConfig(config);
  if (!Array.isArray(pairedRows) || pairedRows.length === 0) {
    return Object.freeze({
      status: "OA03_CURRENT_SCOPE_PERFORMANCE_NOT_EVALUABLE",
      reason: "NO_LEGAL_SAME_CASE_PRIMARY_REFERENCE"
    });
  }
  const candidate = scoreM2Oa03PointRows(pairedRows.map((row) => ({
    ...row,
    pointEstimate: row.candidatePointEstimate
  })));
  const baseline = scoreM2Oa03PointRows(pairedRows.map((row) => ({
    ...row,
    pointEstimate: row.baselinePointEstimate
  })));
  const relativeWapeImprovement = baseline.wape > 0
    ? (baseline.wape - candidate.wape) / baseline.wape
    : null;
  const absoluteBiasWorsening =
    Math.abs(candidate.signedBias) - Math.abs(baseline.signedBias);
  const bootstrap = scoreM2Oa03PairedBootstrap(pairedRows, {
    iterations: config.rollingEvaluation.bootstrap.iterations,
    seed: config.rollingEvaluation.bootstrap.seed + seedOffset
  });
  const timeBlocks = scoreM2Oa03TimeBlocks(pairedRows);
  const improvingBlocks = timeBlocks.filter(
    (row) => row.candidateWins
  ).length;
  const timeBlockShare = timeBlocks.length > 0
    ? improvingBlocks / timeBlocks.length
    : 0;
  const conditions = Object.freeze({
    materialRelativeWapeImprovement:
      relativeWapeImprovement !== null
      && relativeWapeImprovement
        >= config.rollingEvaluation.materialRelativeWapeImprovement,
    biasGuardrailNotBreached:
      absoluteBiasWorsening
        <= config.rollingEvaluation.maximumAbsoluteBiasWorsening,
    pairedIntervalNotInConflict:
      bootstrap.status === "COMPUTED"
      && bootstrap.relativeWapeImprovement95.lower > 0,
    sufficientIndependentTimeBlocks:
      timeBlocks.length
        >= config.rollingEvaluation.minimumIndependentTimeBlocks,
    timeBlockMajorityNotInConflict:
      timeBlockShare
        >= config.rollingEvaluation.minimumImprovingTimeBlockShare
  });
  let status;
  let reason;
  if (Object.values(conditions).every(Boolean)) {
    status = "OA03_CURRENT_SCOPE_PERFORMANCE_SUPPORTED";
    reason = "ALL_PREREGISTERED_PERFORMANCE_CONDITIONS_SUPPORTED";
  } else if (
    conditions.materialRelativeWapeImprovement
    || relativeWapeImprovement > 0
  ) {
    status = "OA03_CURRENT_SCOPE_PERFORMANCE_MIXED";
    reason = "DIRECTIONAL_IMPROVEMENT_WITH_CONFLICTING_GUARDRAIL";
  } else {
    status = "OA03_CURRENT_SCOPE_PERFORMANCE_NOT_SUPPORTED";
    reason = "MATERIAL_SAME_CASE_IMPROVEMENT_NOT_SUPPORTED";
  }
  return Object.freeze({
    status,
    reason,
    candidate,
    baseline,
    relativeWapeImprovement,
    absoluteBiasWorsening,
    bootstrap,
    timeBlocks,
    timeBlockImprovingShare: timeBlockShare,
    conditions
  });
}

export function allocateM2Oa03Trailing12({
  channels,
  totalPointEstimateMinor,
  isCore = true,
  canonicalConfig
}) {
  const totalMinor = integerBigInt(
    totalPointEstimateMinor,
    "allocation_total_minor"
  );
  if (totalMinor < 0n) {
    throw new M2Oa03CurrentScopeReplicationError(
      "m2_oa03_current_scope_negative_total_prediction"
    );
  }
  if (!Array.isArray(channels)) {
    throw new M2Oa03CurrentScopeReplicationError(
      "m2_oa03_current_scope_allocation_channels_invalid"
    );
  }
  const channelAbstentions = channels
    .filter((channel) => channel?.originObservedMature !== true)
    .map((channel) => Object.freeze({
      channelUid: nonempty(
        channel?.channelUid,
        "allocation_abstention_channel_uid"
      ),
      pointEstimate: null,
      pointEstimateMinor: null,
      reason: nonempty(
        channel?.eligibilityStatus
          ?? "ABSTAIN_NOT_ORIGIN_OBSERVED_MATURE",
        "allocation_abstention_reason"
      )
    }))
    .sort((left, right) => stableTextCompare(
      left.channelUid,
      right.channelUid
    ));
  if (isCore !== true) {
    return allocationAbstention(
      totalMinor,
      "ABSTAIN_OUTSIDE_CORE_NOT_ZERO",
      false,
      channels.map((channel) => Object.freeze({
        channelUid: nonempty(
          channel?.channelUid,
          "allocation_tail_channel_uid"
        ),
        pointEstimate: null,
        pointEstimateMinor: null,
        reason: "ABSTAIN_OUTSIDE_CORE_NOT_ZERO"
      }))
    );
  }
  const normalized = channels
    .filter((channel) => channel?.originObservedMature === true)
    .map((channel) => {
      const history = channel.historyNonnegativeMinorByLag;
      if (
        !Array.isArray(history)
        || history.length !== 12
      ) {
        throw new M2Oa03CurrentScopeReplicationError(
          "m2_oa03_current_scope_trailing12_history_invalid"
        );
      }
      return Object.freeze({
        channelUid: nonempty(
          channel.channelUid,
          "allocation_channel_uid"
        ),
        actual: 0,
        historyNonnegativeByLag: Object.freeze(history.map((value) => {
          const weight = integerBigInt(
            value,
            "allocation_history_minor"
          );
          if (weight < 0n) {
            throw new M2Oa03CurrentScopeReplicationError(
              "m2_oa03_current_scope_allocation_weight_negative"
            );
          }
          return safeMinorNumber(weight) / 100;
        })),
        directForecasts: Object.freeze({})
      });
    }).sort((left, right) => stableTextCompare(
      left.channelUid,
      right.channelUid
    ));
  if (normalized.length === 0) {
    return allocationAbstention(
      totalMinor,
      "NO_ORIGIN_MATURE_OBSERVED_CHANNEL",
      false,
      channelAbstentions
    );
  }
  const arm = canonicalConfig?.channelAllocation?.arms?.find(
    (candidate) => candidate.armId === "C3_TRAILING_12"
  );
  if (
    arm?.kind !== "TRAILING_NONNEGATIVE_REVENUE_SHARE"
    || arm?.windowMonths !== 12
  ) {
    throw new M2Oa03CurrentScopeReplicationError(
      "m2_oa03_current_scope_canonical_allocation_arm_invalid"
    );
  }
  const canonical = allocateM2CoreLegacyChannelShares({
    channels: normalized,
    totalPointEstimate: safeMinorNumber(totalMinor) / 100,
    arm,
    config: canonicalConfig
  });
  if (BigInt(canonical.totalMinor) !== totalMinor) {
    throw new M2Oa03CurrentScopeReplicationError(
      "m2_oa03_current_scope_canonical_total_minor_mismatch"
    );
  }
  if (canonical.status !== "ALLOCATED") {
    return allocationAbstention(
      totalMinor,
      canonical.reason,
      canonical.fallbackUsed,
      [
        ...channelAbstentions,
        ...normalized.map((channel) => Object.freeze({
          channelUid: channel.channelUid,
          pointEstimate: null,
          pointEstimateMinor: null,
          reason: "ABSTAIN_CHANNEL_ALLOCATION"
        }))
      ]
    );
  }
  const allocations = canonical.allocations.map((row) => Object.freeze({
    channelUid: row.channelUid,
    predictedShare: row.predictedShare,
    pointEstimateMinor: BigInt(row.pointEstimateMinor).toString(),
    pointEstimate: row.pointEstimate
  }));
  const difference = allocations.reduce(
    (total, row) => total + BigInt(row.pointEstimateMinor),
    0n
  ) - totalMinor;
  if (difference !== 0n) {
    throw new M2Oa03CurrentScopeReplicationError(
      "m2_oa03_current_scope_allocation_conservation_failed"
    );
  }
  return Object.freeze({
    status: "ALLOCATED",
    reason: canonical.fallbackUsed
      ? "ZERO_DENOMINATOR_HISTORY_FALLBACK_USED"
      : "FIXED_TRAILING_12_SHARE_APPLIED",
    canonicalReason: canonical.reason,
    canonicalArmId: arm.armId,
    fallbackUsed: canonical.fallbackUsed,
    fallbackLag: canonical.fallbackLag,
    totalMinor: totalMinor.toString(),
    conservationDifferenceMinor: difference.toString(),
    allocations: Object.freeze(allocations),
    channelAbstentions: Object.freeze(channelAbstentions)
  });
}

export function compareM2Oa03FrozenOverlap({
  currentRows,
  frozenRows,
  sameActualDefinition,
  sameTrainingSupport,
  sameFormulaVersion,
  scalePower = 2
}) {
  const current = uniqueIndex(currentRows, workCaseKey);
  const frozen = uniqueIndex(frozenRows, frozenWorkCaseKey);
  const keys = [...current.keys()].filter((key) => frozen.has(key)).sort();
  if (
    sameActualDefinition !== true
    || sameTrainingSupport !== true
    || sameFormulaVersion !== true
  ) {
    return Object.freeze({
      status: "NOT_COMPARABLE_DIFFERENT_CONTRACT",
      sameActualDefinition: sameActualDefinition === true,
      sameTrainingSupport: sameTrainingSupport === true,
      sameFormulaVersion: sameFormulaVersion === true,
      currentCaseCount: current.size,
      frozenCaseCount: frozen.size,
      sameCaseCount: keys.length
    });
  }
  if (keys.length === 0) {
    return Object.freeze({
      status: "NOT_COMPARABLE_NO_SAME_CASE_INTERSECTION",
      currentCaseCount: current.size,
      frozenCaseCount: frozen.size,
      sameCaseCount: 0
    });
  }
  let exact = 0;
  let maximumDifference = 0n;
  let sumDifference = 0n;
  const currentMetric = [];
  const frozenMetric = [];
  for (const key of keys) {
    const left = current.get(key);
    const right = frozen.get(key);
    const currentMinor = decimalToMinor(left.pointEstimate, scalePower);
    const frozenMinor = decimalToMinor(
      right.candidatePointEstimate ?? right.pointEstimate,
      scalePower
    );
    const difference = currentMinor - frozenMinor;
    if (difference === 0n) exact += 1;
    maximumDifference = maximumBigInt(
      maximumDifference,
      absoluteBigInt(difference)
    );
    sumDifference += difference;
    currentMetric.push({
      ...left,
      pointEstimate: minorToNumber(currentMinor, scalePower)
    });
    frozenMetric.push({
      ...left,
      pointEstimate: minorToNumber(frozenMinor, scalePower)
    });
  }
  const currentScore = scoreM2Oa03PointRows(currentMetric);
  const frozenScore = scoreM2Oa03PointRows(frozenMetric);
  return Object.freeze({
    status: maximumDifference === 0n
      ? "EXACT_REPLAY_MATCH"
      : "SEMANTIC_REPLAY_MISMATCH",
    sameCaseCount: keys.length,
    exactRowMatchRate: exact / keys.length,
    maximumAbsoluteDifferenceMinor: maximumDifference.toString(),
    sumDifferenceMinor: sumDifference.toString(),
    wapeReplayDifference: currentScore.wape - frozenScore.wape,
    signedBiasReplayDifference:
      currentScore.signedBias - frozenScore.signedBias
  });
}

export function decimalToMinor(value, scalePower = 2) {
  const scale = positiveInteger(scalePower, "money_scale_power", {
    allowZero: true
  });
  const text = typeof value === "number"
    ? finite(value, "money_value").toString()
    : String(value);
  const match = /^(-?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/u.exec(
    text
  );
  if (!match) {
    throw new M2Oa03CurrentScopeReplicationError(
      "m2_oa03_current_scope_money_invalid"
    );
  }
  const negative = match[1] === "-";
  const integer = match[2];
  const fraction = match[3] ?? "";
  const exponent = Number(match[4] ?? 0);
  if (!Number.isSafeInteger(exponent)) {
    throw new M2Oa03CurrentScopeReplicationError(
      "m2_oa03_current_scope_money_exponent_invalid"
    );
  }
  const digits = `${integer}${fraction}`.replace(/^0+(?=\d)/u, "");
  const decimalPlaces = fraction.length - exponent;
  const shift = scale - decimalPlaces;
  let magnitude;
  if (shift >= 0) {
    magnitude = BigInt(digits || "0") * 10n ** BigInt(shift);
  } else {
    const divisor = 10n ** BigInt(-shift);
    const raw = BigInt(digits || "0");
    const quotient = raw / divisor;
    const remainder = raw % divisor;
    magnitude = quotient + (remainder * 2n >= divisor ? 1n : 0n);
  }
  return negative ? -magnitude : magnitude;
}

export function minorToNumber(value, scalePower = 2) {
  const minor = integerBigInt(value, "minor_value");
  const scale = 10n ** BigInt(
    positiveInteger(scalePower, "minor_scale_power", { allowZero: true })
  );
  const negative = minor < 0n;
  const magnitude = negative ? -minor : minor;
  const integer = magnitude / scale;
  const fraction = (magnitude % scale).toString().padStart(
    Number(scalePower),
    "0"
  );
  return Number(
    `${negative ? "-" : ""}${integer.toString()}`
      + `${scalePower > 0 ? `.${fraction}` : ""}`
  );
}

function assertCanonicalFormulaContracts({
  previousContract,
  occurrenceContract,
  experimentConfig
}) {
  const formula = experimentConfig.formula;
  const policy = occurrenceContract.candidate.occurrenceAmount;
  if (
    previousContract.candidate.id !== formula.baseCandidateId
    || occurrenceContract.candidate.id
      !== "M2-current-occurrence-amount-calibration-v0.3"
    || policy.baseCandidateId !== formula.baseCandidateId
    || JSON.stringify(policy.eligibleSegments)
      !== JSON.stringify(formula.eligibleSegments)
    || policy.minimumEarlierCaseCount !== formula.minimumEarlierCaseCount
    || policy.minimumRelativeWapeImprovement
      !== formula.minimumRelativeWapeImprovement
    || policy.trainingAbsoluteBiasMaximum
      !== formula.trainingAbsoluteBiasMaximum
    || policy.priorStrength !== formula.priorStrength
    || policy.priorOccurrenceProbability
      !== formula.priorOccurrenceProbability
    || policy.minimumFactor !== formula.minimumFactor
    || policy.maximumFactor !== formula.maximumFactor
  ) {
    throw new M2Oa03CurrentScopeReplicationError(
      "m2_oa03_current_scope_formula_identity_mismatch"
    );
  }
}

function normalizeBaseRows(rows, evaluationFamily, experimentConfig) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new M2Oa03CurrentScopeReplicationError(
      "m2_oa03_current_scope_base_rows_required"
    );
  }
  const allowedOrigins = new Set(
    experimentConfig.rollingEvaluation.schedules[evaluationFamily]
      .trainingAndEvaluationOrigins
  );
  const seen = new Set();
  return rows.map((row) => {
    if (
      row.evaluationFamily !== evaluationFamily
      || !allowedOrigins.has(row.origin)
      || !HORIZONS.includes(Number(row.horizonMonths))
      || !["dense", "intermittent", "dormant"].includes(row.segment)
      || row.route !== "pure_sales_share"
      || row.actualDefinitionId !== M2_OA03_CURRENT_SCOPE_ACTUAL_ID
      || row.historicalFeaturePolicy !== "as_of_only"
      || row.sourceShelfRightsTermPolicy !== "post_hoc_only"
      || typeof row.spikeCandidate !== "boolean"
    ) {
      throw new M2Oa03CurrentScopeReplicationError(
        "m2_oa03_current_scope_base_row_invalid"
      );
    }
    const key = workCaseKey(row);
    if (seen.has(key)) {
      throw new M2Oa03CurrentScopeReplicationError(
        "m2_oa03_current_scope_base_row_duplicate"
      );
    }
    seen.add(key);
    const normalized = {
      ...row,
      standardWorkId: nonempty(
        row.standardWorkId,
        "base_standard_work_id"
      ),
      origin: requireMonth(row.origin, "base_origin"),
      horizonMonths: Number(row.horizonMonths),
      labelAvailableAsOf: requireMonth(
        row.labelAvailableAsOf,
        "base_label_available_as_of"
      ),
      pointEstimate: finite(
        row.basePointEstimate ?? row.pointEstimate,
        "base_point_estimate"
      ),
      actual: finite(row.actual, "base_actual")
    };
    if (
      normalized.pointEstimate < 0
      || normalized.labelAvailableAsOf
        !== addMonths(normalized.origin, normalized.horizonMonths)
    ) {
      throw new M2Oa03CurrentScopeReplicationError(
        "m2_oa03_current_scope_base_row_temporal_invalid"
      );
    }
    return normalized;
  }).sort(compareEvaluationRows);
}

function buildTrainingPopulationDiagnostics({
  selection,
  previousRows,
  experimentConfig
}) {
  const rows = previousRows.filter((row) => (
    row.segment === selection.segment
    && row.origin < selection.outerOrigin
    && row.labelAvailableAsOf <= selection.outerOrigin
  ));
  return Object.freeze(Object.fromEntries(POPULATION_IDS.map(
    (populationId) => {
      const flag = populationId.toLowerCase();
      const outside = rows.filter((row) => row[flag] !== true);
      const totalActual = sum(rows.map((row) => Math.abs(row.actual)));
      const outsideActual = sum(outside.map(
        (row) => Math.abs(row.actual)
      ));
      const totalLoss = sum(rows.map(
        (row) => Math.abs(row.pointEstimate - row.actual)
      ));
      const outsideLoss = sum(outside.map(
        (row) => Math.abs(row.pointEstimate - row.actual)
      ));
      return [populationId, Object.freeze({
        supportMode: experimentConfig.training.supportMode,
        trainingRowCount: rows.length,
        trainingWorkCount: new Set(rows.map(
          (row) => row.standardWorkId
        )).size,
        outsideCoreTrainingRowCount: outside.length,
        outsideCoreTrainingWorkCount: new Set(outside.map(
          (row) => row.standardWorkId
        )).size,
        outsideCoreTrainingRowShare: rows.length > 0
          ? outside.length / rows.length
          : 0,
        outsideCoreTrainingActualShare: totalActual > 0
          ? outsideActual / totalActual
          : 0,
        outsideCoreTrainingLossShare: totalLoss > 0
          ? outsideLoss / totalLoss
          : 0
      })];
    }
  )));
}

function allocationAbstention(
  totalMinor,
  reason,
  fallbackUsed,
  channelAbstentions = []
) {
  return Object.freeze({
    status: "ABSTAIN_CHANNEL_ALLOCATION",
    reason,
    fallbackUsed,
    fallbackLag: null,
    totalMinor: totalMinor.toString(),
    conservationDifferenceMinor: null,
    allocations: Object.freeze([]),
    channelAbstentions: Object.freeze(channelAbstentions)
  });
}

function pairwiseRocAuc(rows) {
  const positives = rows.filter((row) => row.outcome === 1);
  const negatives = rows.filter((row) => row.outcome === 0);
  let score = 0;
  for (const positiveRow of positives) {
    for (const negativeRow of negatives) {
      if (positiveRow.probability > negativeRow.probability) score += 1;
      else if (positiveRow.probability === negativeRow.probability) {
        score += 0.5;
      }
    }
  }
  return score / (positives.length * negatives.length);
}

function interval95(values) {
  if (values.length === 0) return null;
  return Object.freeze({
    lower: empiricalQuantile(values, 0.025),
    median: empiricalQuantile(values, 0.5),
    upper: empiricalQuantile(values, 0.975)
  });
}

function uniqueIndex(rows, keyOf) {
  const index = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (index.has(key)) {
      throw new M2Oa03CurrentScopeReplicationError(
        "m2_oa03_current_scope_comparison_duplicate"
      );
    }
    index.set(key, row);
  }
  return index;
}

function comparisonKey(row) {
  return [
    row.evaluationFamily,
    row.populationId,
    workCaseKey(row)
  ].join("\u001f");
}

function frozenWorkCaseKey(row) {
  const key = row?.caseKey;
  if (key && typeof key === "object") {
    return [
      key.standardWorkId,
      key.origin,
      Number(key.horizonMonths)
    ].join("|");
  }
  return workCaseKey(row);
}

function workCaseKey(row) {
  return [
    nonempty(row.standardWorkId, "case_standard_work_id"),
    requireMonth(row.origin, "case_origin"),
    positiveInteger(row.horizonMonths, "case_horizon")
  ].join("|");
}

function compareEvaluationRows(left, right) {
  return (
    String(left.evaluationFamily ?? "")
      .localeCompare(String(right.evaluationFamily ?? ""))
    || String(left.populationId ?? "")
      .localeCompare(String(right.populationId ?? ""))
    || String(left.origin).localeCompare(String(right.origin))
    || Number(left.horizonMonths) - Number(right.horizonMonths)
    || stableTextCompare(left.standardWorkId, right.standardWorkId)
  );
}

function groupBy(values, keyOf) {
  const output = new Map();
  for (const value of values) {
    const key = keyOf(value);
    const rows = output.get(key) ?? [];
    rows.push(value);
    output.set(key, rows);
  }
  return output;
}

function normalizeMonths(values, field) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new M2Oa03CurrentScopeReplicationError(
      `m2_oa03_current_scope_${field}_invalid`
    );
  }
  return values.map((value) => requireMonth(value, field));
}

function requireMonth(value, field) {
  if (
    typeof value !== "string"
    || !/^\d{4}-(?:0[1-9]|1[0-2])$/u.test(value)
  ) {
    throw new M2Oa03CurrentScopeReplicationError(
      `m2_oa03_current_scope_${field}_invalid`
    );
  }
  return value;
}

function addMonths(value, offset) {
  const [year, month] = requireMonth(value, "month").split("-").map(Number);
  const serial = year * 12 + month - 1 + Number(offset);
  return `${Math.floor(serial / 12)}-${String(serial % 12 + 1).padStart(
    2,
    "0"
  )}`;
}

function positiveInteger(value, field, { allowZero = false } = {}) {
  const number = Number(value);
  if (
    !Number.isInteger(number)
    || (allowZero ? number < 0 : number <= 0)
  ) {
    throw new M2Oa03CurrentScopeReplicationError(
      `m2_oa03_current_scope_${field}_invalid`
    );
  }
  return number;
}

function nonempty(value, field) {
  if (value === null || value === undefined || String(value) === "") {
    throw new M2Oa03CurrentScopeReplicationError(
      `m2_oa03_current_scope_${field}_invalid`
    );
  }
  return String(value);
}

function finite(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new M2Oa03CurrentScopeReplicationError(
      `m2_oa03_current_scope_${field}_invalid`
    );
  }
  return number;
}

function probability(value) {
  const number = finite(value, "probability");
  if (number < 0 || number > 1) {
    throw new M2Oa03CurrentScopeReplicationError(
      "m2_oa03_current_scope_probability_out_of_range"
    );
  }
  return number;
}

function integerBigInt(value, field) {
  try {
    const result = BigInt(value);
    if (result.toString() !== String(value) && typeof value !== "bigint") {
      throw new Error("not canonical");
    }
    return result;
  } catch {
    throw new M2Oa03CurrentScopeReplicationError(
      `m2_oa03_current_scope_${field}_invalid`
    );
  }
}

function safeMinorNumber(value) {
  if (
    value > BigInt(Number.MAX_SAFE_INTEGER)
    || value < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw new M2Oa03CurrentScopeReplicationError(
      "m2_oa03_current_scope_minor_value_exceeds_canonical_safe_range"
    );
  }
  return Number(value);
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value), 0);
}

function mean(values) {
  return values.length > 0 ? sum(values) / values.length : null;
}

function empiricalQuantile(sorted, probabilityValue) {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * probabilityValue;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function mulberry32(seed) {
  let value = Number(seed) >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let result = value;
    result = Math.imul(result ^ result >>> 15, result | 1);
    result ^= result + Math.imul(result ^ result >>> 7, result | 61);
    return ((result ^ result >>> 14) >>> 0) / 4294967296;
  };
}

function absoluteBigInt(value) {
  return value < 0n ? -value : value;
}

function maximumBigInt(left, right) {
  return left > right ? left : right;
}

function stableTextCompare(left, right) {
  return String(left).localeCompare(String(right), "en");
}
