import {
  addMonths,
  monthToSerial,
  referenceWindowForOrigin,
  serialToMonth
} from "./coreRevenueManual.js";

export const M2_CORE_LEGACY_EXPERIMENT_ID =
  "M2-EXP-CORE-LEGACY-POPULATION-01";
export const M2_CORE_LEGACY_ACTUAL_ID =
  "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01";

const EPSILON = 1e-9;

export class M2CoreLegacyPopulationError extends Error {
  constructor(code) {
    super(code);
    this.name = "M2CoreLegacyPopulationError";
    this.code = code;
  }
}

export function validateM2CoreLegacyPopulationConfig(config) {
  if (
    config?.schema !== "m2.current.core_legacy_population.v0.1"
    || config?.experiment?.stableExperimentId
      !== M2_CORE_LEGACY_EXPERIMENT_ID
    || config?.target?.actualDefinitionId !== M2_CORE_LEGACY_ACTUAL_ID
    || config?.target?.predictionGrain
      !== "standardWorkId_origin_observedMatureCanonicalChannel_horizon"
    || config?.eligibility?.minimumCompleteMonths !== 3
    || config?.coreSelection?.recomputedAtEveryOrigin !== true
    || config?.coreSelection?.cutoffTiePolicy
      !== "INCLUDE_ALL_EXACT_REFERENCE_REVENUE_TIES"
    || config?.coreSelection?.tailPoolAllowed !== false
    || config?.evaluation?.bootstrap?.iterations !== 2000
    || config?.trainingAblation?.baseModelId !== "M2-WORK-LG01"
    || config?.trainingAblation?.sampleWeightSupport !== "NOT_NATIVE"
    || config?.trainingAblation?.trainingHorizonMonths !== 36
    || config?.trainingAblation?.minimumMatureTrainingRows !== 30
    || config?.trainingAblation?.fallbackStatus
      !== "DISABLED_RAW_LEARNED_GLOBAL_ONLY"
    || config?.portfolioBoundary?.outOfScopeStatus
      !== "OUT_OF_CURRENT_M2_SCOPE_PORTFOLIO_RESEARCH"
  ) {
    throw new M2CoreLegacyPopulationError(
      "m2_core_legacy_population_contract_invalid"
    );
  }
  const arms = config.trainingAblation.arms.map((item) => item.armId);
  if (
    JSON.stringify(arms) !== JSON.stringify([
      `${M2_CORE_LEGACY_EXPERIMENT_ID}/T0_FULL`,
      `${M2_CORE_LEGACY_EXPERIMENT_ID}/T1_CORE90`,
      `${M2_CORE_LEGACY_EXPERIMENT_ID}/T2_CORE80`,
      `${M2_CORE_LEGACY_EXPERIMENT_ID}/T3_REVENUE_WEIGHTED_FULL`
    ])
  ) {
    throw new M2CoreLegacyPopulationError(
      "m2_core_legacy_training_arms_invalid"
    );
  }
  return true;
}

export function selectOriginSafeCoreLegacyPopulations({
  origin,
  eligibleMonthlyRows,
  thresholds = {
    CORE80: 0.8,
    CORE90: 0.9
  },
  topCounts = [20, 50]
}) {
  const normalizedOrigin = serialToMonth(monthToSerial(origin));
  const window = referenceWindowForOrigin(normalizedOrigin);
  const start = monthToSerial(window.start);
  const end = monthToSerial(window.end);
  const previousStart = start - 12;
  const previousEnd = end - 12;
  const byWork = new Map();
  for (const row of normalizeMonthlyRows(eligibleMonthlyRows)) {
    if (monthToSerial(row.month) > end) continue;
    const value = byWork.get(row.standardWorkId) ?? new Map();
    value.set(
      row.month,
      (value.get(row.month) ?? 0) + row.cash
    );
    byWork.set(row.standardWorkId, value);
  }
  const ranked = [...byWork].map(([standardWorkId, months]) => {
    const referenceRevenue = sumMonthRange(months, start, end);
    const previousReferenceRevenue = sumMonthRange(
      months,
      previousStart,
      previousEnd
    );
    return {
      standardWorkId,
      referenceRevenue,
      previousReferenceRevenue,
      yoyMultiplier: previousReferenceRevenue > 0
        ? referenceRevenue / previousReferenceRevenue
        : null,
      yoyStatus: previousReferenceRevenue > 0
        ? "COMPUTABLE"
        : "NOT_COMPUTABLE"
    };
  }).sort((left, right) => (
    right.referenceRevenue - left.referenceRevenue
    || stableTextCompare(left.standardWorkId, right.standardWorkId)
  ));
  const positiveRanked = ranked.filter(
    (row) => row.referenceRevenue > 0
  );
  const referenceRevenueTotal = positiveRanked.reduce(
    (sum, row) => sum + row.referenceRevenue,
    0
  );
  if (!(referenceRevenueTotal > 0)) {
    return Object.freeze({
      status: "NOT_COMPUTABLE_NONPOSITIVE_REFERENCE_REVENUE",
      origin: normalizedOrigin,
      referenceWindow: window,
      referenceRevenueTotal,
      ranked: Object.freeze(ranked),
      populations: Object.freeze(Object.fromEntries(
        Object.keys(thresholds).map((id) => [id, Object.freeze([])])
      )),
      populationDiagnostics: Object.freeze({}),
      top: Object.freeze(Object.fromEntries(
        topCounts.map((count) => [`TOP${count}`, Object.freeze([])])
      ))
    });
  }
  const populations = {};
  const populationDiagnostics = {};
  for (const [id, threshold] of Object.entries(thresholds)) {
    if (!(threshold > 0 && threshold <= 1)) {
      throw new M2CoreLegacyPopulationError(
        "m2_core_legacy_population_threshold_invalid"
      );
    }
    let cumulative = 0;
    let cutoff = null;
    const selected = [];
    for (const row of positiveRanked) {
      if (
        cutoff !== null
        && Math.abs(row.referenceRevenue - cutoff) > EPSILON
      ) {
        break;
      }
      selected.push(row.standardWorkId);
      cumulative += row.referenceRevenue;
      if (
        cutoff === null
        && cumulative + EPSILON >= referenceRevenueTotal * threshold
      ) {
        cutoff = row.referenceRevenue;
      }
    }
    populations[id] = Object.freeze(selected);
    populationDiagnostics[id] = Object.freeze({
      threshold,
      selectedWorkCount: selected.length,
      cutoffReferenceRevenue: cutoff,
      referenceRevenueCapture: cumulative / referenceRevenueTotal,
      excessCapture: cumulative / referenceRevenueTotal - threshold,
      cutoffTieCount: cutoff === null
        ? 0
        : positiveRanked.filter(
          (row) => Math.abs(row.referenceRevenue - cutoff) <= EPSILON
        ).length
    });
  }
  return Object.freeze({
    status: "SELECTED",
    origin: normalizedOrigin,
    referenceWindow: window,
    previousReferenceWindow: Object.freeze({
      start: serialToMonth(previousStart),
      end: serialToMonth(previousEnd),
      monthCount: window.monthCount
    }),
    referenceRevenueTotal,
    ranked: Object.freeze(ranked.map((row, index) => Object.freeze({
      ...row,
      referenceRank: index + 1,
      revenueDecile: Math.min(
        10,
        Math.floor(index * 10 / Math.max(1, ranked.length)) + 1
      )
    }))),
    populations: Object.freeze(populations),
    populationDiagnostics: Object.freeze(populationDiagnostics),
    top: Object.freeze(Object.fromEntries(
      topCounts.map((count) => [
        `TOP${count}`,
        Object.freeze(
          ranked.slice(0, count).map((row) => row.standardWorkId)
        )
      ])
    ))
  });
}

export function buildCoreLegacyOriginPopulation({
  origin,
  monthlyRows,
  minimumCompleteMonths = 3,
  thresholds,
  topCounts
}) {
  const originSerial = monthToSerial(origin);
  const visible = normalizeMonthlyRows(monthlyRows).filter(
    (row) => monthToSerial(row.month) <= originSerial
  );
  const byPair = groupBy(visible, (row) => (
    `${row.standardWorkId}\u0000${row.channelUid}`
  ));
  const firstPositiveByWork = new Map();
  const pairStates = [];
  for (const rows of byPair.values()) {
    const firstPositive = rows
      .filter((row) => row.cash > 0)
      .sort(compareMonthlyRows)[0];
    if (!firstPositive) continue;
    const firstSerial = monthToSerial(firstPositive.month);
    const representative = rows[0];
    const previousWorkFirst = firstPositiveByWork.get(
      representative.standardWorkId
    );
    if (
      previousWorkFirst === undefined
      || firstSerial < previousWorkFirst
    ) {
      firstPositiveByWork.set(
        representative.standardWorkId,
        firstSerial
      );
    }
    pairStates.push({
      standardWorkId: representative.standardWorkId,
      channelUid: representative.channelUid,
      level2Category: representative.level2Category,
      level3Category: representative.level3Category,
      settlementMechanism: representative.settlementMechanism,
      firstPositiveMonth: firstPositive.month,
      firstPositiveSerial: firstSerial,
      completeMonthCount: originSerial - firstSerial + 1,
      monthlyCashBySerial: new Map(
        rows.map((row) => [monthToSerial(row.month), row.cash])
      )
    });
  }
  const eligiblePairs = pairStates.filter((item) => {
    const workFirst = firstPositiveByWork.get(item.standardWorkId);
    return (
      originSerial - workFirst + 1 >= minimumCompleteMonths
      && item.completeMonthCount >= minimumCompleteMonths
    );
  });
  const eligibleKeys = new Set(eligiblePairs.map(
    (item) => `${item.standardWorkId}\u0000${item.channelUid}`
  ));
  const eligibleMonthlyRows = visible.filter((row) => eligibleKeys.has(
    `${row.standardWorkId}\u0000${row.channelUid}`
  ));
  const selection = selectOriginSafeCoreLegacyPopulations({
    origin,
    eligibleMonthlyRows,
    thresholds,
    topCounts
  });
  const core80 = new Set(selection.populations.CORE80 ?? []);
  const core90 = new Set(selection.populations.CORE90 ?? []);
  const top20 = new Set(selection.top.TOP20 ?? []);
  const top50 = new Set(selection.top.TOP50 ?? []);
  const rankByWork = new Map(selection.ranked.map((row) => [
    row.standardWorkId,
    row
  ]));
  const enrichedPairs = eligiblePairs.map((item) => {
    const rank = rankByWork.get(item.standardWorkId);
    return Object.freeze({
      ...item,
      origin,
      workFirstPositiveMonth: serialToMonth(
        firstPositiveByWork.get(item.standardWorkId)
      ),
      workCompleteMonthCount:
        originSerial - firstPositiveByWork.get(item.standardWorkId) + 1,
      core80: core80.has(item.standardWorkId),
      core90: core90.has(item.standardWorkId),
      top20: top20.has(item.standardWorkId),
      top50: top50.has(item.standardWorkId),
      referenceRank: rank?.referenceRank ?? null,
      revenueDecile: rank?.revenueDecile ?? null,
      referenceRevenue: rank?.referenceRevenue ?? 0
    });
  }).sort(comparePairStates);
  return Object.freeze({
    schema: "m2.current.core_legacy_origin_population.v0.1",
    origin,
    minimumCompleteMonths,
    selection,
    eligiblePairs: Object.freeze(enrichedPairs),
    immatureObservedPairs: Object.freeze(pairStates
      .filter((item) => !eligibleKeys.has(
        `${item.standardWorkId}\u0000${item.channelUid}`
      ))
      .map((item) => Object.freeze({
        standardWorkId: item.standardWorkId,
        channelUid: item.channelUid,
        level2Category: item.level2Category,
        level3Category: item.level3Category,
        settlementMechanism: item.settlementMechanism,
        firstPositiveMonth: item.firstPositiveMonth,
        completeMonthCount: item.completeMonthCount,
        workCompleteMonthCount:
          originSerial - firstPositiveByWork.get(item.standardWorkId) + 1
      }))),
    eligibleWorkCount: new Set(
      enrichedPairs.map((item) => item.standardWorkId)
    ).size,
    eligiblePairCount: enrichedPairs.length
  });
}

export function buildCoreLegacyWorkCases({
  origins,
  horizons,
  finalMonthlyRows,
  featureMonthlyRowsForOrigin,
  config
}) {
  validateM2CoreLegacyPopulationConfig(config);
  const finalRows = normalizeMonthlyRows(finalMonthlyRows);
  const actualIndex = buildActualIndex(finalRows);
  const workCases = [];
  const channelCases = [];
  const immatureChannelCases = [];
  const populationRows = [];
  for (const origin of [...new Set(origins)].sort()) {
    const population = buildCoreLegacyOriginPopulation({
      origin,
      monthlyRows: featureMonthlyRowsForOrigin(origin),
      minimumCompleteMonths: config.eligibility.minimumCompleteMonths,
      thresholds: config.coreSelection.thresholds,
      topCounts: config.coreSelection.topDiagnostics
    });
    const pairGroups = groupBy(
      population.eligiblePairs,
      (item) => item.standardWorkId
    );
    for (const [standardWorkId, pairs] of pairGroups) {
      const originSerial = monthToSerial(origin);
      const workFirstSerial = Math.min(
        ...pairs.map((item) => monthToSerial(item.workFirstPositiveMonth))
      );
      const canonicalChannels = pairs.map((item) => (
        buildHumanAnchoredChannel(item, originSerial)
      ));
      const trailingWork = densePairCash(
        pairs,
        Math.max(workFirstSerial, originSerial - 11),
        originSerial
      );
      const segment = classifyIntermittency(trailingWork);
      const dominantRevenueMode = dominantMechanism(canonicalChannels);
      for (const horizonMonths of horizons) {
        const pairRows = pairs.map((pair) => {
          const target = futureCashForPair(
            actualIndex,
            pair,
            originSerial,
            horizonMonths
          );
          return {
            experimentId: M2_CORE_LEGACY_EXPERIMENT_ID,
            standardWorkId,
            channelUid: pair.channelUid,
            origin,
            horizonMonths,
            actual: target.actual,
            labelAvailableAsOf: target.labelAvailableAsOf,
            core80: pair.core80,
            core90: pair.core90,
            top20: pair.top20,
            top50: pair.top50,
            level2Category: pair.level2Category,
            level3Category: pair.level3Category,
            settlementMechanism: pair.settlementMechanism,
            referenceRank: pair.referenceRank,
            revenueDecile: pair.revenueDecile
          };
        });
        channelCases.push(...pairRows);
        const actual = pairRows.reduce(
          (sum, row) => sum + row.actual,
          0
        );
        const labelAvailableAsOf = pairRows.reduce(
          (latest, row) => row.labelAvailableAsOf > latest
            ? row.labelAvailableAsOf
            : latest,
          addMonths(origin, horizonMonths)
        );
        const representative = pairs[0];
        workCases.push({
          experimentId: M2_CORE_LEGACY_EXPERIMENT_ID,
          standardWorkId,
          origin,
          horizonMonths,
          targetEnd: addMonths(origin, horizonMonths),
          labelAvailableAsOf,
          actual,
          actualPositive: Math.max(0, actual),
          actualReversal: Math.max(0, -actual),
          observedSalesAgeMonths: originSerial - workFirstSerial + 1,
          monthsSinceLastPositive: monthsSinceLastPositive(trailingWork),
          segment,
          dominantRevenueMode,
          canonicalChannels,
          core80: representative.core80,
          core90: representative.core90,
          top20: representative.top20,
          top50: representative.top50,
          referenceRank: representative.referenceRank,
          referenceRevenue: representative.referenceRevenue,
          revenueDecile: representative.revenueDecile,
          eligibleChannelCount: pairs.length,
          secondLevelCategoryReportingOnly:
            representative.level2Category,
          thirdLevelCategoryReportingOnly:
            representative.level3Category
        });
      }
    }
    for (const pair of population.immatureObservedPairs) {
      for (const horizonMonths of horizons) {
        const target = futureCashForPair(
          actualIndex,
          pair,
          monthToSerial(origin),
          horizonMonths
        );
        immatureChannelCases.push({
          experimentId: M2_CORE_LEGACY_EXPERIMENT_ID,
          standardWorkId: pair.standardWorkId,
          channelUid: pair.channelUid,
          origin,
          horizonMonths,
          actual: target.actual,
          labelAvailableAsOf: target.labelAvailableAsOf,
          completeMonthCount: pair.completeMonthCount,
          workCompleteMonthCount: pair.workCompleteMonthCount,
          level2Category: pair.level2Category,
          level3Category: pair.level3Category,
          settlementMechanism: pair.settlementMechanism,
          eligibilityStatus: "ABSTAIN_IMMATURE_AT_ORIGIN"
        });
      }
    }
    populationRows.push({
      origin,
      eligibleWorkCount: population.eligibleWorkCount,
      eligiblePairCount: population.eligiblePairCount,
      immatureObservedPairCount:
        population.immatureObservedPairs.length,
      core80WorkCount:
        population.selection.populations.CORE80?.length ?? 0,
      core90WorkCount:
        population.selection.populations.CORE90?.length ?? 0,
      core80ReferenceCapture:
        population.selection.populationDiagnostics.CORE80
          ?.referenceRevenueCapture ?? null,
      core90ReferenceCapture:
        population.selection.populationDiagnostics.CORE90
          ?.referenceRevenueCapture ?? null,
      core80ExcessCapture:
        population.selection.populationDiagnostics.CORE80
          ?.excessCapture ?? null,
      core90ExcessCapture:
        population.selection.populationDiagnostics.CORE90
          ?.excessCapture ?? null
    });
  }
  return Object.freeze({
    schema: "m2.current.core_legacy_cases.v0.1",
    workCases: Object.freeze(workCases.sort(compareWorkCases)),
    channelCases: Object.freeze(channelCases.sort(compareChannelCases)),
    immatureChannelCases: Object.freeze(immatureChannelCases.sort(
      compareChannelCases
    )),
    populationRows: Object.freeze(populationRows.sort(
      (left, right) => left.origin.localeCompare(right.origin)
    ))
  });
}

export function scoreCoreLegacyPointRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return Object.freeze({
      status: "NOT_COMPUTABLE_EMPTY",
      caseCount: 0,
      workCount: 0,
      actualTotal: 0,
      predictionTotal: 0,
      absoluteErrorTotal: 0,
      wape: null,
      signedBias: null,
      mae: null,
      medianAbsoluteError: null,
      zeroActualFalsePositiveError: 0,
      zeroPredictionPositiveActualMissError: 0
    });
  }
  const values = rows.map((row) => {
    const actual = finite(row.actual, "actual");
    const pointEstimate = finite(row.pointEstimate, "point_estimate");
    return {
      actual,
      pointEstimate,
      absoluteError: Math.abs(pointEstimate - actual)
    };
  });
  const actualTotal = values.reduce((sum, row) => sum + row.actual, 0);
  const denominator = values.reduce(
    (sum, row) => sum + Math.abs(row.actual),
    0
  );
  const predictionTotal = values.reduce(
    (sum, row) => sum + row.pointEstimate,
    0
  );
  const absoluteErrorTotal = values.reduce(
    (sum, row) => sum + row.absoluteError,
    0
  );
  const absoluteErrors = values.map(
    (row) => row.absoluteError
  ).sort((left, right) => left - right);
  return Object.freeze({
    status: denominator > 0 ? "COMPUTED" : "NOT_COMPUTABLE_ZERO_DENOMINATOR",
    caseCount: values.length,
    workCount: new Set(rows.map(
      (row) => String(row.standardWorkId)
    )).size,
    actualTotal,
    predictionTotal,
    absoluteErrorTotal,
    wape: denominator > 0 ? absoluteErrorTotal / denominator : null,
    signedBias: denominator > 0
      ? (predictionTotal - actualTotal) / denominator
      : null,
    mae: absoluteErrorTotal / values.length,
    medianAbsoluteError: empiricalQuantile(absoluteErrors, 0.5),
    zeroActualFalsePositiveError: values
      .filter((row) => row.actual === 0 && row.pointEstimate > 0)
      .reduce((sum, row) => sum + row.pointEstimate, 0),
    zeroPredictionPositiveActualMissError: values
      .filter((row) => row.pointEstimate === 0 && row.actual > 0)
      .reduce((sum, row) => sum + row.actual, 0)
  });
}

export function scoreCoreLegacyPairedBootstrap(rows, {
  iterations = 2000,
  seed = 20260729
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
  const deltas = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const sample = [];
    for (let index = 0; index < workIds.length; index += 1) {
      const workId = workIds[Math.floor(random() * workIds.length)];
      sample.push(...byWork.get(workId));
    }
    const candidate = scoreCoreLegacyPointRows(sample.map((row) => ({
      ...row,
      pointEstimate: row.candidatePointEstimate
    })));
    const baseline = scoreCoreLegacyPointRows(sample.map((row) => ({
      ...row,
      pointEstimate: row.baselinePointEstimate
    })));
    if (candidate.wape !== null && baseline.wape !== null) {
      deltas.push(baseline.wape - candidate.wape);
    }
  }
  deltas.sort((left, right) => left - right);
  return Object.freeze({
    status: deltas.length === iterations
      ? "COMPUTED"
      : "PARTIAL",
    method: "paired_standard_work_cluster_resample",
    iterations: deltas.length,
    seed,
    workCount: workIds.length,
    improvement95: Object.freeze({
      lower: empiricalQuantile(deltas, 0.025),
      median: empiricalQuantile(deltas, 0.5),
      upper: empiricalQuantile(deltas, 0.975)
    })
  });
}

export function selectCoreLegacyQuarterlyOrigins(origins) {
  const legalOrigins = [...new Set(origins.map((origin) => (
    serialToMonth(monthToSerial(origin))
  )))].sort();
  if (legalOrigins.length === 0) return Object.freeze([]);
  const selected = legalOrigins.filter((_, index) => index % 3 === 0);
  const last = legalOrigins.at(-1);
  if (selected.at(-1) !== last) selected.push(last);
  return Object.freeze(selected);
}

export function selectCoreLegacyTrainingRows({
  workCases,
  outerOrigin,
  armId,
  primaryHorizonMonths
}) {
  const normalizedOuterOrigin = serialToMonth(monthToSerial(outerOrigin));
  const horizon = Number(primaryHorizonMonths);
  if (!Number.isInteger(horizon) || horizon <= 0) {
    throw new M2CoreLegacyPopulationError(
      "m2_core_legacy_training_horizon_invalid"
    );
  }
  const suffix = String(armId).split("/").at(-1);
  const populationFilter = {
    T0_FULL: () => true,
    T1_CORE90: (row) => row.core90 === true,
    T2_CORE80: (row) => row.core80 === true
  }[suffix];
  if (!populationFilter) {
    throw new M2CoreLegacyPopulationError(
      "m2_core_legacy_training_arm_invalid"
    );
  }
  return Object.freeze(workCases.filter((row) => (
    Number(row.horizonMonths) === horizon
    && String(row.origin) < normalizedOuterOrigin
    && String(row.labelAvailableAsOf) <= normalizedOuterOrigin
    && populationFilter(row)
  )).sort(compareWorkCases));
}

export function decideCoreLegacyTailInterference({
  armAssessments
}) {
  if (!Array.isArray(armAssessments) || armAssessments.length === 0) {
    return Object.freeze({
      status: "TAIL_INTERFERENCE_NOT_EVALUABLE",
      confirmedArmIds: Object.freeze([]),
      reason: "NO_EXECUTABLE_ARM_ASSESSMENTS"
    });
  }
  const executable = armAssessments.filter(
    (row) => row.status === "COMPUTED"
  );
  if (executable.length === 0) {
    return Object.freeze({
      status: "TAIL_INTERFERENCE_NOT_EVALUABLE",
      confirmedArmIds: Object.freeze([]),
      reason: "NO_COMPUTABLE_CONTROLLED_COMPARISON"
    });
  }
  const confirmed = executable.filter((row) => (
    row.threeMonthRelativeWapeImprovementAtLeastMinimum === true
    && row.sixMonthRelativeWapeImprovementAtLeastMinimum === true
    && row.threeMonthBiasNotMateriallyWorse === true
    && row.sixMonthBiasNotMateriallyWorse === true
    && row.threeMonthBootstrapSupportsImprovement === true
    && row.sixMonthBootstrapSupportsImprovement === true
    && row.majorityTimeBlocksImprove === true
    && row.fallbackUsed === false
  ));
  if (confirmed.length > 0) {
    return Object.freeze({
      status: "TAIL_INTERFERENCE_CONFIRMED",
      confirmedArmIds: Object.freeze(
        confirmed.map((row) => row.armId).sort()
      ),
      reason: "PREREGISTERED_THREE_AND_SIX_MONTH_RULE_SATISFIED"
    });
  }
  const anyDirectionalEvidence = executable.some((row) => (
    row.threeMonthRelativeWapeImprovementAtLeastMinimum === true
    || row.sixMonthRelativeWapeImprovementAtLeastMinimum === true
    || row.threeMonthBootstrapSupportsImprovement === true
    || row.sixMonthBootstrapSupportsImprovement === true
    || row.majorityTimeBlocksImprove === true
  ));
  return Object.freeze({
    status: anyDirectionalEvidence
      ? "TAIL_INTERFERENCE_MIXED"
      : "TAIL_INTERFERENCE_NOT_CONFIRMED",
    confirmedArmIds: Object.freeze([]),
    reason: anyDirectionalEvidence
      ? "PARTIAL_OR_UNSTABLE_EVIDENCE"
      : "NO_STABLE_PREREGISTERED_IMPROVEMENT"
  });
}

export function buildCoreLegacySyntheticDiagnostic(fixture, config) {
  validateM2CoreLegacyPopulationConfig(config);
  const selections = fixture.selectionCases.map((item) => {
    const result = selectOriginSafeCoreLegacyPopulations({
      origin: item.origin,
      eligibleMonthlyRows: item.eligibleMonthlyRows,
      thresholds: config.coreSelection.thresholds,
      topCounts: config.coreSelection.topDiagnostics
    });
    return {
      id: item.id,
      referenceWindow: result.referenceWindow,
      core80: result.populations.CORE80,
      core90: result.populations.CORE90,
      core80Capture:
        result.populationDiagnostics.CORE80.referenceRevenueCapture,
      core80TieCount:
        result.populationDiagnostics.CORE80.cutoffTieCount
    };
  });
  const eligibility = fixture.eligibilityCases.map((item) => {
    const result = buildCoreLegacyOriginPopulation({
      origin: item.origin,
      monthlyRows: item.monthlyRows,
      minimumCompleteMonths: config.eligibility.minimumCompleteMonths,
      thresholds: config.coreSelection.thresholds,
      topCounts: config.coreSelection.topDiagnostics
    });
    return {
      id: item.id,
      eligiblePairs: result.eligiblePairs.map((row) => (
        `${row.standardWorkId}|${row.channelUid}`
      )),
      immaturePairCount: result.immatureObservedPairs.length
    };
  });
  return Object.freeze({
    schema: "m2.current.core_legacy_population.public_diagnostic.v0.1",
    experimentId: M2_CORE_LEGACY_EXPERIMENT_ID,
    status: "SYNTHETIC_DIAGNOSTIC_PASS",
    selections,
    eligibility,
    boundaries: Object.freeze({
      publicSyntheticOnly: true,
      privateArtifactRead: false,
      modelTrainingPerformed: false,
      tailPoolCreated: false,
      futureActualUsedForSelection: false,
      historicalEvidenceMutated: false,
      productionModified: false
    })
  });
}

function buildHumanAnchoredChannel(item, originSerial) {
  const start = item.firstPositiveSerial;
  const trailingStart = Math.max(start, originSerial - 11);
  const recentStart = Math.max(start, originSerial - 2);
  const latest = item.monthlyCashBySerial.get(originSerial) ?? 0;
  const trailing = sumSerialRange(
    item.monthlyCashBySerial,
    trailingStart,
    originSerial
  );
  const recent3 = sumSerialRange(
    item.monthlyCashBySerial,
    recentStart,
    originSerial
  );
  const cumulative = sumSerialRange(
    item.monthlyCashBySerial,
    start,
    originSerial
  );
  return Object.freeze({
    channelUid: item.channelUid,
    channelRole: "observed_mature_channel",
    revenueMode: normalizeRevenueMode(item.settlementMechanism),
    trailingAnnualPositive: Math.max(0, trailing),
    latestMonthPositive: Math.max(0, latest),
    recent3AnnualPositive: Math.max(0, recent3 / 3 * 12),
    cumulativePositive: Math.max(0, cumulative),
    peerTrendRatio: 1,
    monthsSinceLastPositive: monthsSinceLastPositive(
      denseSerialCash(
        item.monthlyCashBySerial,
        trailingStart,
        originSerial
      )
    )
  });
}

function normalizeRevenueMode(value) {
  const normalized = String(value ?? "UNKNOWN");
  if ([
    "advertising_or_free_share",
    "membership_subscription",
    "rights_or_license_settlement",
    "single_purchase_or_on_demand"
  ].includes(normalized)) {
    return normalized;
  }
  return "rights_or_license_settlement";
}

function dominantMechanism(channels) {
  const totals = new Map();
  for (const channel of channels) {
    totals.set(
      channel.revenueMode,
      (totals.get(channel.revenueMode) ?? 0)
        + channel.trailingAnnualPositive
    );
  }
  return [...totals].sort((left, right) => (
    right[1] - left[1]
    || stableTextCompare(left[0], right[0])
  ))[0]?.[0] ?? "rights_or_license_settlement";
}

function classifyIntermittency(values) {
  const monthsSince = monthsSinceLastPositive(values);
  const positiveCount = values.filter((value) => value > 0).length;
  if (monthsSince >= 6) return "dormant";
  if (positiveCount < Math.max(1, values.length / 2)) {
    return "intermittent";
  }
  return "active";
}

function monthsSinceLastPositive(values) {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (values[index] > 0) return values.length - 1 - index;
  }
  return values.length;
}

function densePairCash(pairs, start, end) {
  const output = [];
  for (let serial = start; serial <= end; serial += 1) {
    output.push(pairs.reduce(
      (sum, item) => sum + (item.monthlyCashBySerial.get(serial) ?? 0),
      0
    ));
  }
  return output;
}

function denseSerialCash(months, start, end) {
  const output = [];
  for (let serial = start; serial <= end; serial += 1) {
    output.push(months.get(serial) ?? 0);
  }
  return output;
}

function buildActualIndex(rows) {
  const byPair = new Map();
  for (const row of rows) {
    const key = `${row.standardWorkId}\u0000${row.channelUid}`;
    const months = byPair.get(key) ?? new Map();
    const serial = monthToSerial(row.month);
    const current = months.get(serial) ?? {
      cash: 0,
      labelAvailableAsOf: serialToMonth(serial)
    };
    current.cash += row.cash;
    if (row.labelAvailableAsOf > current.labelAvailableAsOf) {
      current.labelAvailableAsOf = row.labelAvailableAsOf;
    }
    months.set(serial, current);
    byPair.set(key, months);
  }
  return byPair;
}

function futureCashForPair(index, pair, originSerial, horizon) {
  const months = index.get(
    `${pair.standardWorkId}\u0000${pair.channelUid}`
  ) ?? new Map();
  let actual = 0;
  let labelAvailableAsOf = serialToMonth(originSerial + horizon);
  for (
    let serial = originSerial + 1;
    serial <= originSerial + horizon;
    serial += 1
  ) {
    const value = months.get(serial);
    if (value === undefined) continue;
    actual += value.cash;
    if (value.labelAvailableAsOf > labelAvailableAsOf) {
      labelAvailableAsOf = value.labelAvailableAsOf;
    }
  }
  return Object.freeze({ actual, labelAvailableAsOf });
}

function sumMonthRange(months, start, end) {
  let total = 0;
  for (const [month, cash] of months) {
    const serial = monthToSerial(month);
    if (serial >= start && serial <= end) total += cash;
  }
  return total;
}

function sumSerialRange(months, start, end) {
  let total = 0;
  for (let serial = start; serial <= end; serial += 1) {
    total += months.get(serial) ?? 0;
  }
  return total;
}

function normalizeMonthlyRows(rows) {
  if (!Array.isArray(rows)) {
    throw new M2CoreLegacyPopulationError(
      "m2_core_legacy_monthly_rows_invalid"
    );
  }
  const aggregated = new Map();
  for (const row of rows) {
    const standardWorkId = nonempty(
      row?.standardWorkId,
      "standard_work_id"
    );
    const channelUid = nonempty(row?.channelUid, "channel_uid");
    const month = serialToMonth(monthToSerial(row?.month));
    const cash = finite(row?.cash, "cash");
    const labelAvailableAsOf = serialToMonth(monthToSerial(
      row?.labelAvailableAsOf ?? month
    ));
    const key = `${standardWorkId}\u0000${channelUid}\u0000${month}`;
    const value = aggregated.get(key) ?? {
      standardWorkId,
      channelUid,
      month,
      cash: 0,
      labelAvailableAsOf: month,
      level2Category: String(row?.level2Category ?? "UNKNOWN"),
      level3Category: String(row?.level3Category ?? "UNKNOWN"),
      settlementMechanism: String(
        row?.settlementMechanism ?? "UNKNOWN"
      )
    };
    value.cash += cash;
    if (labelAvailableAsOf > value.labelAvailableAsOf) {
      value.labelAvailableAsOf = labelAvailableAsOf;
    }
    aggregated.set(key, value);
  }
  return [...aggregated.values()].sort(compareMonthlyRows);
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

function compareMonthlyRows(left, right) {
  return (
    monthToSerial(left.month) - monthToSerial(right.month)
    || stableTextCompare(left.standardWorkId, right.standardWorkId)
    || stableTextCompare(left.channelUid, right.channelUid)
  );
}

function comparePairStates(left, right) {
  return (
    stableTextCompare(left.standardWorkId, right.standardWorkId)
    || stableTextCompare(left.channelUid, right.channelUid)
  );
}

function compareWorkCases(left, right) {
  return (
    left.origin.localeCompare(right.origin)
    || left.horizonMonths - right.horizonMonths
    || stableTextCompare(left.standardWorkId, right.standardWorkId)
  );
}

function compareChannelCases(left, right) {
  return (
    compareWorkCases(left, right)
    || stableTextCompare(left.channelUid, right.channelUid)
  );
}

function empiricalQuantile(sorted, probability) {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let result = value;
    result = Math.imul(result ^ result >>> 15, result | 1);
    result ^= result + Math.imul(result ^ result >>> 7, result | 61);
    return ((result ^ result >>> 14) >>> 0) / 4294967296;
  };
}

function nonempty(value, field) {
  if (value === undefined || value === null || String(value) === "") {
    throw new M2CoreLegacyPopulationError(
      `m2_core_legacy_${field}_invalid`
    );
  }
  return String(value);
}

function finite(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new M2CoreLegacyPopulationError(
      `m2_core_legacy_${field}_invalid`
    );
  }
  return number;
}

function stableTextCompare(left, right) {
  return String(left).localeCompare(String(right), "en");
}
