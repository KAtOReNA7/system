import {
  scoreCoreLegacyPairedBootstrap,
  scoreCoreLegacyPointRows
} from "./coreLegacyPopulation.js";
import {
  M2_CORE_LEGACY_HORIZON_ROUTER_EXPERIMENT_ID,
  validateM2CoreLegacyHorizonRouterConfig
} from "./coreLegacyHorizonRouter.js";

export class M2CoreLegacyChannelAllocationError extends Error {
  constructor(code) {
    super(code);
    this.name = "M2CoreLegacyChannelAllocationError";
    this.code = code;
  }
}

export function buildM2CoreLegacyObservedChannelAllocation(
  workCases,
  config,
  {
    evaluationHead = null,
    routerExecutionHead = null,
    allocationExecutionHead = null,
    exactHeadCiRunId = null,
    sameCaseEvidenceStatus =
      "SAME_CASE_EVIDENCE_COMPLETE_FOR_LEGAL_MODEL_INTERSECTIONS",
    horizonRouterStatus = "HORIZON_ROUTER_NOT_EVALUABLE"
  } = {}
) {
  validateM2CoreLegacyHorizonRouterConfig(config);
  if (!Array.isArray(workCases)) {
    throw new M2CoreLegacyChannelAllocationError(
      "m2_core_legacy_channel_allocation_cases_required"
    );
  }
  const normalized = workCases.map(normalizeAllocationCase);
  const attempts = [];
  const allocationRows = [];
  for (const workCase of normalized) {
    for (const total of workCase.totalPredictions) {
      for (const arm of config.channelAllocation.arms) {
        if (
          arm.armId === "C0_DIRECT"
          && !["M2-WORK-LG01", "M2-WORK-CRMR01"].includes(
            total.sourceModelId
          )
        ) {
          continue;
        }
        const result = allocateWorkCase({
          workCase,
          total,
          arm,
          config
        });
        attempts.push(result.attempt);
        allocationRows.push(...result.rows);
      }
    }
  }
  const evaluationSets = buildAllocationEvaluationSets({
    attempts,
    allocationRows,
    config
  });
  const horizonDecisions = config.scope.horizonsMonths.map(
    (horizonMonths) => buildAllocationHorizonDecision(
      evaluationSets,
      horizonMonths,
      config
    )
  );
  const channelAllocationStatus = summarizeAllocationTaskStatus(
    horizonDecisions,
    config
  );
  return Object.freeze({
    publicResult: Object.freeze({
      schema:
        "m2.current.core_legacy_observed_channel_allocation.public.v0.1",
      asOf: config.asOf,
      experiment: config.experiment,
      status: "K3_OBSERVED_CHANNEL_ALLOCATION_COMPLETE",
      taskStatus:
        "M2_CORE_LEGACY_HORIZON_ROUTER_AND_CHANNEL_ALLOCATION_COMPLETE",
      sameCaseEvidenceStatus,
      horizonRouterStatus,
      channelAllocationStatus,
      evaluationHead,
      routerExecutionHead,
      allocationExecutionHead,
      exactHeadCiRunId,
      finalDocumentationHead: null,
      target: Object.freeze({
        name: config.scope.target,
        actualDefinitionId: config.scope.actualDefinitionId,
        workTotalGrain: "WORK_TOTAL",
        allocatedGrain: "WORK_CHANNEL",
        onlyOriginMatureObservedCanonicalChannels: true
      }),
      frozenAllocationContract: Object.freeze({
        arms: Object.freeze(config.channelAllocation.arms.map(
          (arm) => Object.freeze({...arm})
        )),
        totalSourceModelIds: Object.freeze([
          ...config.channelAllocation.totalSourceModelIds
        ]),
        zeroDenominatorFallback:
          config.channelAllocation.zeroDenominatorFallback,
        fallbackFailure: config.channelAllocation.fallbackFailure,
        equalSplitAllowed: false,
        futureRevenueAllowed: false,
        resultBasedWindowSelectionAllowed: false,
        currencyMinorUnits:
          config.channelAllocation.currencyMinorUnits,
        requiredConservationDifferenceMinor:
          config.channelAllocation.requiredConservationDifferenceMinor,
        primaryConfirmation: Object.freeze({
          populationId:
            config.channelAllocation.primaryConfirmationPopulationId,
          evaluationFamily:
            config.channelAllocation.primaryConfirmationEvaluationFamily,
          totalSourceModelId:
            config.channelAllocation.primaryConfirmationTotalSourceModelId,
          horizonsMonths: Object.freeze([
            ...config.channelAllocation.primaryConfirmationHorizonsMonths
          ]),
          requiredRobustWindowArmIds: Object.freeze([
            ...config.channelAllocation.requiredRobustWindowArmIds
          ])
        })
      }),
      horizonDecisions: Object.freeze(horizonDecisions),
      evaluationSets: Object.freeze(evaluationSets),
      summaries: Object.freeze({
        attemptCount: attempts.length,
        allocatedAttemptCount: attempts.filter(
          (row) => row.status === "ALLOCATED"
        ).length,
        abstainAttemptCount: attempts.filter(
          (row) => row.status !== "ALLOCATED"
        ).length,
        allocationChannelRowCount: allocationRows.length,
        byArm: summarizeAttempts(attempts, "armId"),
        byTotalSource: summarizeAttempts(attempts, "totalSourceModelId"),
        maximumWorkTotalPointDifference: maximum(
          attempts.map((row) => row.workTotalPointDifference)
        ),
        maximumConservationDifferenceMinor: maximum(
          attempts.map((row) => Math.abs(row.conservationDifferenceMinor))
        )
      }),
      boundaries: Object.freeze({
        rawC0ThroughC4Preserved: true,
        selectedWindowArmId: null,
        resultBasedWindowSelectionPerformed: false,
        workTotalPredictionChanged: false,
        futureChannelRevenueReadForShares: false,
        equalSplitFallbackUsed: false,
        onlyOriginVisibleHistoryUsedForShares: true,
        modelTrainingPerformed: false,
        parameterOrGridChanged: false,
        operationalFallbackChanged: false,
        activeCandidateCreated: false,
        automationAuthorized: false,
        privateIdentityPublished: false,
        productionChanged: false,
        laterOriginRead: false,
        finalHoldoutRead: false
      })
    }),
    privateRows: Object.freeze([
      ...attempts,
      ...allocationRows
    ])
  });
}

export function allocateM2CoreLegacyChannelShares({
  channels,
  totalPointEstimate,
  arm,
  config
}) {
  validateM2CoreLegacyHorizonRouterConfig(config);
  const normalizedChannels = channels.map(normalizeChannel);
  const totalMinor = Math.round(
    finite(totalPointEstimate, "allocation_total_point")
      * config.channelAllocation.currencyMinorUnits
  );
  if (normalizedChannels.length === 0) {
    return Object.freeze({
      status: "ABSTAIN_CHANNEL_ALLOCATION",
      reason: "NO_ORIGIN_MATURE_OBSERVED_CHANNEL",
      fallbackUsed: false,
      totalMinor,
      allocations: Object.freeze([])
    });
  }
  if (arm.kind === "DIRECT_CHANNEL_MODEL") {
    return allocateDirect({
      channels: normalizedChannels,
      totalMinor,
      sourceModelId: arm.sourceModelId,
      config
    });
  }
  let weights;
  let source;
  if (arm.kind === "TRAILING_NONNEGATIVE_REVENUE_SHARE") {
    weights = normalizedChannels.map((channel) => (
      channel.historyNonnegativeByLag
        .slice(0, Number(arm.windowMonths))
        .reduce((sum, value) => sum + value, 0)
    ));
    source = `TRAILING_${Number(arm.windowMonths)}_MONTH_SHARE`;
  } else if (arm.kind === "LG01_NONNEGATIVE_FORECAST_SHARE") {
    if (normalizedChannels.some((channel) => (
      !Number.isFinite(channel.directForecasts["M2-WORK-LG01"])
    ))) {
      return Object.freeze({
        status: "ABSTAIN_CHANNEL_ALLOCATION",
        reason: "LG01_DIRECT_CHANNEL_FORECAST_NOT_LEGALLY_AVAILABLE",
        fallbackUsed: false,
        totalMinor,
        allocations: Object.freeze([])
      });
    }
    weights = normalizedChannels.map((channel) => Math.max(
      0,
      channel.directForecasts["M2-WORK-LG01"]
    ));
    source = "LG01_NONNEGATIVE_FORECAST_SHARE";
  } else {
    throw new M2CoreLegacyChannelAllocationError(
      "m2_core_legacy_channel_allocation_arm_invalid"
    );
  }
  let fallbackUsed = false;
  let fallbackLag = null;
  if (sum(weights) <= 0) {
    const fallback = lastNonzeroHistoryWeights(normalizedChannels);
    if (fallback === null) {
      return Object.freeze({
        status: "ABSTAIN_CHANNEL_ALLOCATION",
        reason: config.channelAllocation.fallbackFailure,
        fallbackUsed: true,
        totalMinor,
        allocations: Object.freeze([])
      });
    }
    weights = fallback.weights;
    fallbackUsed = true;
    fallbackLag = fallback.lag;
    source = "LAST_NONZERO_MONTH_WITHIN_TRAILING_12";
  }
  const shares = normalizeWeights(weights);
  const minors = allocateMinorByShares(
    totalMinor,
    shares,
    normalizedChannels.map((channel) => channel.channelUid)
  );
  return Object.freeze({
    status: "ALLOCATED",
    reason: fallbackUsed
      ? "ZERO_DENOMINATOR_HISTORY_FALLBACK_USED"
      : "FIXED_SHARE_ARM_APPLIED",
    shareSource: source,
    fallbackUsed,
    fallbackLag,
    totalMinor,
    allocations: Object.freeze(normalizedChannels.map(
      (channel, index) => Object.freeze({
        channelUid: channel.channelUid,
        predictedShare: shares[index],
        pointEstimateMinor: minors[index],
        pointEstimate:
          minors[index] / config.channelAllocation.currencyMinorUnits,
        rawDirectChannelPointEstimate: null,
        directCentAdjustmentMinor: 0
      })
    ))
  });
}

function allocateWorkCase({ workCase, total, arm, config }) {
  const effectiveArm = arm.kind === "DIRECT_CHANNEL_MODEL"
    ? {...arm, sourceModelId: total.sourceModelId}
    : arm;
  const allocated = allocateM2CoreLegacyChannelShares({
    channels: workCase.channels,
    totalPointEstimate: total.pointEstimate,
    arm: effectiveArm,
    config
  });
  const allocationId = [
    workCase.evaluationFamily,
    workCase.populationId,
    `H${workCase.horizonMonths}`,
    total.sourceModelId,
    arm.armId,
    workCase.origin,
    workCase.standardWorkId
  ].join("|");
  const actualPositiveTotal = sum(workCase.channels.map(
    (channel) => Math.max(0, channel.actual)
  ));
  const rows = allocated.allocations.map((item) => {
    const channel = workCase.channels.find(
      (candidate) => candidate.channelUid === item.channelUid
    );
    return Object.freeze({
      schema:
        "m2.current.core_legacy_channel_allocation_row.private.v0.1",
      experimentId: M2_CORE_LEGACY_HORIZON_ROUTER_EXPERIMENT_ID,
      allocationId,
      armId: arm.armId,
      totalSourceModelId: total.sourceModelId,
      evaluationFamily: workCase.evaluationFamily,
      populationId: workCase.populationId,
      grain: "WORK_CHANNEL",
      origin: workCase.origin,
      horizonMonths: workCase.horizonMonths,
      standardWorkId: workCase.standardWorkId,
      channelUid: item.channelUid,
      channelCaseKey: [
        workCase.origin,
        workCase.horizonMonths,
        workCase.standardWorkId,
        item.channelUid
      ].join("\u0000"),
      workCaseKey: [
        workCase.origin,
        workCase.horizonMonths,
        workCase.standardWorkId
      ].join("\u0000"),
      pointEstimate: item.pointEstimate,
      pointEstimateMinor: item.pointEstimateMinor,
      actual: channel.actual,
      predictedShare: item.predictedShare,
      actualShare: actualPositiveTotal > 0
        ? Math.max(0, channel.actual) / actualPositiveTotal
        : null,
      workTotalPointEstimate: total.pointEstimate,
      workTotalPointEstimateMinor: allocated.totalMinor,
      shareSource: allocated.shareSource ?? null,
      fallbackUsed: allocated.fallbackUsed,
      fallbackLag: allocated.fallbackLag ?? null,
      rawDirectChannelPointEstimate:
        item.rawDirectChannelPointEstimate,
      directCentAdjustmentMinor: item.directCentAdjustmentMinor,
      futureChannelRevenueReadForShare: false,
      originMatureObservedChannel: true
    });
  });
  const allocatedMinor = sum(rows.map((row) => row.pointEstimateMinor));
  const conservationDifferenceMinor =
    allocatedMinor - allocated.totalMinor;
  if (
    allocated.status === "ALLOCATED"
    && conservationDifferenceMinor
      !== config.channelAllocation.requiredConservationDifferenceMinor
  ) {
    throw new M2CoreLegacyChannelAllocationError(
      "m2_core_legacy_channel_allocation_conservation_failed"
    );
  }
  return {
    attempt: Object.freeze({
      schema:
        "m2.current.core_legacy_channel_allocation_attempt.private.v0.1",
      experimentId: M2_CORE_LEGACY_HORIZON_ROUTER_EXPERIMENT_ID,
      allocationId,
      armId: arm.armId,
      totalSourceModelId: total.sourceModelId,
      evaluationFamily: workCase.evaluationFamily,
      populationId: workCase.populationId,
      origin: workCase.origin,
      horizonMonths: workCase.horizonMonths,
      standardWorkId: workCase.standardWorkId,
      status: allocated.status,
      reason: allocated.reason,
      fallbackUsed: allocated.fallbackUsed,
      fallbackLag: allocated.fallbackLag ?? null,
      channelCount: workCase.channels.length,
      workTotalPointEstimate: total.pointEstimate,
      workTotalPointEstimateMinor: allocated.totalMinor,
      actualTotal: workCase.actualTotal,
      allocatedChannelMinorTotal: allocatedMinor,
      conservationDifferenceMinor,
      workTotalPointDifference: 0,
      workTotalMetricChanged: false,
      futureChannelRevenueReadForShare: false
    }),
    rows
  };
}

function allocateDirect({
  channels,
  totalMinor,
  sourceModelId,
  config
}) {
  if (channels.some((channel) => (
    !Number.isFinite(channel.directForecasts[sourceModelId])
  ))) {
    return Object.freeze({
      status: "ABSTAIN_CHANNEL_ALLOCATION",
      reason: "DIRECT_CHANNEL_FORECAST_NOT_LEGALLY_AVAILABLE",
      fallbackUsed: false,
      totalMinor,
      allocations: Object.freeze([])
    });
  }
  const raw = channels.map(
    (channel) => channel.directForecasts[sourceModelId]
  );
  const exactMinor = raw.map(
    (value) => value * config.channelAllocation.currencyMinorUnits
  );
  const roundedMinor = exactMinor.map((value) => Math.round(value));
  const initialRoundedMinor = [...roundedMinor];
  const difference = totalMinor - sum(roundedMinor);
  if (difference !== 0) {
    const direction = Math.sign(difference);
    const order = [...raw.keys()].sort((left, right) => {
      const leftResidual = exactMinor[left] - roundedMinor[left];
      const rightResidual = exactMinor[right] - roundedMinor[right];
      return direction > 0
        ? rightResidual - leftResidual
          || stableTextCompare(
            channels[left].channelUid,
            channels[right].channelUid
          )
        : leftResidual - rightResidual
          || stableTextCompare(
            channels[left].channelUid,
            channels[right].channelUid
          );
    });
    for (let index = 0; index < Math.abs(difference); index += 1) {
      roundedMinor[order[index % order.length]] += direction;
    }
  }
  const positive = raw.map((value) => Math.max(0, value));
  const shares = sum(positive) > 0
    ? normalizeWeights(positive)
    : raw.map(() => 0);
  return Object.freeze({
    status: "ALLOCATED",
    reason: "RAW_DIRECT_CHANNEL_FORECAST_CENT_RECONCILED",
    shareSource: "RAW_DIRECT_CHANNEL_FORECAST",
    fallbackUsed: false,
    fallbackLag: null,
    totalMinor,
    allocations: Object.freeze(channels.map((channel, index) => (
      Object.freeze({
        channelUid: channel.channelUid,
        predictedShare: shares[index],
        pointEstimateMinor: roundedMinor[index],
        pointEstimate:
          roundedMinor[index] / config.channelAllocation.currencyMinorUnits,
        rawDirectChannelPointEstimate: raw[index],
        directCentAdjustmentMinor:
          roundedMinor[index] - initialRoundedMinor[index]
      })
    )))
  });
}

function buildAllocationEvaluationSets({
  attempts,
  allocationRows,
  config
}) {
  const output = [];
  for (const evaluationFamily of config.scope.evaluationFamilies) {
    for (const populationId of config.scope.populations) {
      for (const horizonMonths of config.scope.horizonsMonths) {
        for (const totalSourceModelId
          of config.channelAllocation.totalSourceModelIds) {
          for (const arm of config.channelAllocation.arms) {
            const cellAttempts = attempts.filter((row) => (
              row.evaluationFamily === evaluationFamily
              && row.populationId === populationId
              && row.horizonMonths === horizonMonths
              && row.totalSourceModelId === totalSourceModelId
              && row.armId === arm.armId
            ));
            const cellRows = allocationRows.filter((row) => (
              row.evaluationFamily === evaluationFamily
              && row.populationId === populationId
              && row.horizonMonths === horizonMonths
              && row.totalSourceModelId === totalSourceModelId
              && row.armId === arm.armId
            ));
            output.push(buildAllocationEvaluationSet({
              attempts: cellAttempts,
              rows: cellRows,
              allRows: allocationRows,
              config,
              evaluationFamily,
              populationId,
              horizonMonths,
              totalSourceModelId,
              armId: arm.armId
            }));
          }
        }
      }
    }
  }
  return output;
}

function buildAllocationEvaluationSet({
  attempts,
  rows,
  allRows,
  config,
  evaluationFamily,
  populationId,
  horizonMonths,
  totalSourceModelId,
  armId
}) {
  const evaluationSetId = [
    "ALLOC",
    evaluationFamily,
    populationId,
    `H${horizonMonths}`,
    totalSourceModelId,
    armId
  ].join("-");
  const allocatedAttempts = attempts.filter(
    (row) => row.status === "ALLOCATED"
  );
  if (rows.length === 0 || allocatedAttempts.length === 0) {
    return Object.freeze({
      evaluationSetId,
      evaluationFamily,
      populationId,
      horizonMonths,
      grain: "WORK_CHANNEL",
      totalSourceModelId,
      armId,
      status: "NOT_EVALUABLE",
      workCaseCount: 0,
      channelCaseCount: 0,
      workTotalMetricsBefore: null,
      workTotalMetricsAfter: null,
      workTotalMetricDifference: null,
      maximumWorkTotalPointDifference: null,
      workChannelMetrics: null,
      channelShareMae: null,
      primaryChannelIdentificationRate: null,
      channelPairwiseRankingAccuracy: null,
      workAllocationError: null,
      anonymousChannelBuckets: Object.freeze([]),
      maximumConservationDifferenceMinor: null,
      maximumDirectCentAdjustmentMinor: null,
      abstainCount: attempts.length,
      bestDirectComparator: null,
      pairedBootstrap: null,
      independentTimeBlocks: Object.freeze([]),
      decision: Object.freeze({
        status: "CHANNEL_ALLOCATION_NOT_EVALUABLE",
        reason: attempts.length === 0
          ? "NO_LEGAL_TOTAL_SOURCE_OR_ALLOCATION_ARM"
          : "ALL_ALLOCATION_ATTEMPTS_ABSTAINED"
      })
    });
  }
  const workTotalRows = allocatedAttempts.map((attempt) => ({
    standardWorkId: attempt.standardWorkId,
    pointEstimate: attempt.workTotalPointEstimate,
    actual: attempt.actualTotal
  }));
  const workTotalBefore = scoreCoreLegacyPointRows(workTotalRows);
  const workTotalAfter = scoreCoreLegacyPointRows(workTotalRows.map(
    (row) => ({...row})
  ));
  const workChannelMetrics = scoreCoreLegacyPointRows(rows);
  const byAllocation = groupByValues(rows, (row) => row.allocationId);
  const workDiagnostics = [...byAllocation.values()].map(
    scoreWorkAllocation
  );
  const comparator = armId === "C0_DIRECT"
    ? null
    : bestDirectComparator({
      candidateRows: rows,
      allRows,
      evaluationFamily,
      populationId,
      horizonMonths,
      config,
      evaluationSetId
    });
  const maximumConservationDifferenceMinor = maximum(
    allocatedAttempts.map(
      (row) => Math.abs(row.conservationDifferenceMinor)
    )
  );
  const maximumWorkTotalPointDifference = maximum(
    allocatedAttempts.map(
      (row) => Math.abs(row.workTotalPointDifference)
    )
  );
  const workTotalMetricDifference = Object.freeze({
    wape: numericDifference(workTotalAfter.wape, workTotalBefore.wape),
    signedBias: numericDifference(
      workTotalAfter.signedBias,
      workTotalBefore.signedBias
    ),
    mae: numericDifference(workTotalAfter.mae, workTotalBefore.mae)
  });
  const decision = armId === "C0_DIRECT"
    ? Object.freeze({
      status: "DIRECT_CHANNEL_REFERENCE",
      reason: "RAW_DIRECT_CHANNEL_MODEL_REFERENCE_ONLY"
    })
    : decideChannelAllocation({
      comparator,
      maximumConservationDifferenceMinor,
      maximumWorkTotalPointDifference,
      workTotalMetricDifference,
      config
    });
  return Object.freeze({
    evaluationSetId,
    evaluationFamily,
    populationId,
    horizonMonths,
    grain: "WORK_CHANNEL",
    totalSourceModelId,
    armId,
    status: "COMPUTED",
    workCaseCount: allocatedAttempts.length,
    channelCaseCount: rows.length,
    workTotalMetricsBefore: workTotalBefore,
    workTotalMetricsAfter: workTotalAfter,
    workTotalMetricDifference,
    maximumWorkTotalPointDifference,
    workChannelMetrics,
    channelShareMae: mean(rows
      .filter((row) => row.actualShare !== null)
      .map((row) => Math.abs(
        row.predictedShare - row.actualShare
      ))),
    primaryChannelIdentificationRate: mean(workDiagnostics.map(
      (row) => row.primaryChannelHit ? 1 : 0
    )),
    channelPairwiseRankingAccuracy: weightedMean(
      workDiagnostics.map((row) => ({
        value: row.rankingAccuracy,
        weight: row.rankingPairCount
      }))
    ),
    workAllocationError: Object.freeze({
      meanWape: mean(workDiagnostics.map((row) => row.wape)),
      medianWape: median(workDiagnostics.map((row) => row.wape)),
      maximumWape: maximum(workDiagnostics.map((row) => row.wape))
    }),
    anonymousChannelBuckets: buildAnonymousChannelBuckets(rows, config),
    maximumConservationDifferenceMinor,
    maximumDirectCentAdjustmentMinor: maximum(rows.map(
      (row) => Math.abs(row.directCentAdjustmentMinor)
    )),
    abstainCount: attempts.filter(
      (row) => row.status !== "ALLOCATED"
    ).length,
    fallbackAllocationCount: allocatedAttempts.filter(
      (row) => row.fallbackUsed === true
    ).length,
    bestDirectComparator: comparator?.public ?? null,
    pairedBootstrap: comparator?.bootstrap ?? null,
    independentTimeBlocks: comparator?.timeBlocks ?? Object.freeze([]),
    decision
  });
}

function bestDirectComparator({
  candidateRows,
  allRows,
  evaluationFamily,
  populationId,
  horizonMonths,
  config,
  evaluationSetId
}) {
  const candidateMap = uniqueByChannelCase(candidateRows);
  const candidates = [];
  for (const directSourceModelId of [
    "M2-WORK-LG01",
    "M2-WORK-CRMR01"
  ]) {
    const directRows = allRows.filter((row) => (
      row.evaluationFamily === evaluationFamily
      && row.populationId === populationId
      && row.horizonMonths === horizonMonths
      && row.armId === "C0_DIRECT"
      && row.totalSourceModelId === directSourceModelId
    ));
    const directMap = uniqueByChannelCase(directRows);
    const keys = intersectKeys([candidateMap, directMap]);
    if (keys.length === 0) continue;
    const candidateSame = keys.map((key) => candidateMap.get(key));
    const directSame = keys.map((key) => directMap.get(key));
    candidates.push({
      directSourceModelId,
      keys,
      candidateMap,
      directMap,
      candidateMetrics: scoreCoreLegacyPointRows(candidateSame),
      comparatorMetrics: scoreCoreLegacyPointRows(directSame)
    });
  }
  if (candidates.length === 0) return null;
  const selected = candidates.sort((left, right) => (
    left.comparatorMetrics.wape - right.comparatorMetrics.wape
    || Math.abs(left.comparatorMetrics.signedBias)
      - Math.abs(right.comparatorMetrics.signedBias)
    || stableTextCompare(
      left.directSourceModelId,
      right.directSourceModelId
    )
  ))[0];
  const pairedRows = selected.keys.map((key) => {
    const candidate = selected.candidateMap.get(key);
    const baseline = selected.directMap.get(key);
    return {
      standardWorkId: candidate.standardWorkId,
      actual: candidate.actual,
      candidatePointEstimate: candidate.pointEstimate,
      baselinePointEstimate: baseline.pointEstimate
    };
  });
  const bootstrap = scoreCoreLegacyPairedBootstrap(pairedRows, {
    iterations: config.channelAllocation.bootstrap.iterations,
    seed: config.channelAllocation.bootstrap.seed
      + horizonMonths
      + stableSeedOffset(evaluationSetId)
  });
  const timeBlocks = scoreTimeBlocks({
    keys: selected.keys,
    candidateMap: selected.candidateMap,
    comparatorMap: selected.directMap
  });
  const relativeWapeImprovement = selected.comparatorMetrics.wape > 0
    ? (
      selected.comparatorMetrics.wape - selected.candidateMetrics.wape
    ) / selected.comparatorMetrics.wape
    : null;
  const absoluteBiasWorsening =
    Math.abs(selected.candidateMetrics.signedBias)
      - Math.abs(selected.comparatorMetrics.signedBias);
  return {
    public: Object.freeze({
      status: "COMPUTED_SAME_CASE_INTERSECTION",
      directSourceModelId: selected.directSourceModelId,
      caseCount: selected.keys.length,
      candidateMetrics: selected.candidateMetrics,
      comparatorMetrics: selected.comparatorMetrics,
      relativeWapeImprovement,
      absoluteBiasWorsening
    }),
    bootstrap,
    timeBlocks,
    relativeWapeImprovement,
    absoluteBiasWorsening
  };
}

function decideChannelAllocation({
  comparator,
  maximumConservationDifferenceMinor,
  maximumWorkTotalPointDifference,
  workTotalMetricDifference,
  config
}) {
  if (comparator === null) {
    return Object.freeze({
      status: "CHANNEL_ALLOCATION_NOT_EVALUABLE",
      reason: "NO_LEGAL_SAME_CASE_DIRECT_CHANNEL_COMPARATOR"
    });
  }
  const materialWapeImprovement =
    comparator.relativeWapeImprovement !== null
    && comparator.relativeWapeImprovement
      >= config.channelAllocation
        .confirmationMinimumRelativeWapeImprovement;
  const biasGuardPass = comparator.absoluteBiasWorsening
    <= config.channelAllocation.maximumAbsoluteBiasWorsening;
  const bootstrapSupports = (
    comparator.bootstrap?.status === "COMPUTED"
    && comparator.bootstrap?.improvement95?.lower > 0
  );
  const timeBlockWinShare = blockWinShare(comparator.timeBlocks);
  const majorityTimeBlocksImprove = timeBlockWinShare
    > config.channelAllocation.minimumTimeBlockWinShare;
  const workTotalInvariant = (
    maximumWorkTotalPointDifference
      === config.channelAllocation.requiredWorkTotalMetricDifference
    && Object.values(workTotalMetricDifference).every(
      (value) => value
        === config.channelAllocation.requiredWorkTotalMetricDifference
    )
  );
  const conservationPass = maximumConservationDifferenceMinor
    === config.channelAllocation.requiredConservationDifferenceMinor;
  const conditions = Object.freeze({
    materialWapeImprovement,
    biasGuardPass,
    bootstrapSupports,
    majorityTimeBlocksImprove,
    timeBlockWinShare,
    workTotalInvariant,
    conservationPass
  });
  if (Object.entries(conditions)
    .filter(([key]) => key !== "timeBlockWinShare")
    .every(([, value]) => value === true)) {
    return Object.freeze({
      status: "CHANNEL_ALLOCATION_CONFIRMED",
      reason: "ALL_PREREGISTERED_CHANNEL_ALLOCATION_GATES_PASS",
      conditions
    });
  }
  const directional = (
    (comparator.relativeWapeImprovement ?? 0) > 0
    || bootstrapSupports
    || majorityTimeBlocksImprove
  );
  return Object.freeze({
    status: directional
      ? "CHANNEL_ALLOCATION_MIXED"
      : "CHANNEL_ALLOCATION_NOT_CONFIRMED",
    reason: directional
      ? "PARTIAL_OR_UNSTABLE_CHANNEL_ALLOCATION_EVIDENCE"
      : "NO_DIRECTIONAL_CHANNEL_ALLOCATION_IMPROVEMENT",
    conditions
  });
}

function buildAllocationHorizonDecision(
  evaluationSets,
  horizonMonths,
  config
) {
  const required = config.channelAllocation.requiredRobustWindowArmIds
    .map((armId) => evaluationSets.find((row) => (
      row.evaluationFamily
        === config.channelAllocation.primaryConfirmationEvaluationFamily
      && row.populationId
        === config.channelAllocation.primaryConfirmationPopulationId
      && row.horizonMonths === horizonMonths
      && row.totalSourceModelId
        === config.channelAllocation.primaryConfirmationTotalSourceModelId
      && row.armId === armId
    )));
  const statuses = required.map((row) => (
    row?.decision?.status ?? "CHANNEL_ALLOCATION_NOT_EVALUABLE"
  ));
  let status;
  let reason;
  if (statuses.every(
    (value) => value === "CHANNEL_ALLOCATION_NOT_EVALUABLE"
  )) {
    status = "CHANNEL_ALLOCATION_NOT_EVALUABLE";
    reason = "PRIMARY_CONFIRMATION_TOTAL_SOURCE_NOT_LEGALLY_AVAILABLE";
  } else if (statuses.every(
    (value) => value === "CHANNEL_ALLOCATION_CONFIRMED"
  )) {
    status = "CHANNEL_ALLOCATION_CONFIRMED";
    reason = "ALL_THREE_FIXED_HISTORY_WINDOWS_CONFIRMED";
  } else if (statuses.some((value) => (
    value === "CHANNEL_ALLOCATION_CONFIRMED"
    || value === "CHANNEL_ALLOCATION_MIXED"
  ))) {
    status = "CHANNEL_ALLOCATION_MIXED";
    reason = "FIXED_HISTORY_WINDOWS_DISAGREE_OR_ARE_UNSTABLE";
  } else {
    status = "CHANNEL_ALLOCATION_NOT_CONFIRMED";
    reason = "NO_FIXED_HISTORY_WINDOW_CONFIRMED";
  }
  return Object.freeze({
    horizonMonths,
    status,
    reason,
    primaryTotalSourceModelId:
      config.channelAllocation.primaryConfirmationTotalSourceModelId,
    requiredWindowArms: Object.freeze(required.map((row, index) => (
      Object.freeze({
        armId:
          config.channelAllocation.requiredRobustWindowArmIds[index],
        status: statuses[index],
        workChannelWape: row?.workChannelMetrics?.wape ?? null,
        workChannelSignedBias:
          row?.workChannelMetrics?.signedBias ?? null,
        directComparatorModelId:
          row?.bestDirectComparator?.directSourceModelId ?? null,
        relativeWapeImprovement:
          row?.bestDirectComparator?.relativeWapeImprovement ?? null,
        maximumConservationDifferenceMinor:
          row?.maximumConservationDifferenceMinor ?? null
      })
    )))
  });
}

function summarizeAllocationTaskStatus(horizonDecisions, config) {
  const required = horizonDecisions.filter((row) => (
    config.channelAllocation.primaryConfirmationHorizonsMonths.includes(
      row.horizonMonths
    )
  ));
  if (required.every(
    (row) => row.status === "CHANNEL_ALLOCATION_CONFIRMED"
  )) {
    return "CHANNEL_ALLOCATION_CONFIRMED";
  }
  if (required.some((row) => (
    row.status === "CHANNEL_ALLOCATION_CONFIRMED"
    || row.status === "CHANNEL_ALLOCATION_MIXED"
  ))) {
    return "CHANNEL_ALLOCATION_MIXED";
  }
  if (required.every(
    (row) => row.status === "CHANNEL_ALLOCATION_NOT_EVALUABLE"
  )) {
    return "CHANNEL_ALLOCATION_NOT_EVALUABLE";
  }
  return "CHANNEL_ALLOCATION_NOT_CONFIRMED";
}

function scoreWorkAllocation(rows) {
  const actualDenominator = sum(rows.map(
    (row) => Math.abs(row.actual)
  ));
  const absoluteError = sum(rows.map(
    (row) => Math.abs(row.pointEstimate - row.actual)
  ));
  const predictedMaximum = maximum(rows.map(
    (row) => row.pointEstimate
  ));
  const actualMaximum = maximum(rows.map((row) => row.actual));
  const predictedTop = new Set(rows.filter(
    (row) => row.pointEstimate === predictedMaximum
  ).map((row) => row.channelUid));
  const actualTop = new Set(rows.filter(
    (row) => row.actual === actualMaximum
  ).map((row) => row.channelUid));
  let rankingPairCount = 0;
  let rankingCorrectCount = 0;
  for (let left = 0; left < rows.length; left += 1) {
    for (let right = left + 1; right < rows.length; right += 1) {
      rankingPairCount += 1;
      const predictedOrder = Math.sign(
        rows[left].pointEstimate - rows[right].pointEstimate
      );
      const actualOrder = Math.sign(
        rows[left].actual - rows[right].actual
      );
      if (predictedOrder === actualOrder) rankingCorrectCount += 1;
    }
  }
  return {
    wape: actualDenominator > 0
      ? absoluteError / actualDenominator
      : null,
    primaryChannelHit: [...predictedTop].some(
      (channelUid) => actualTop.has(channelUid)
    ),
    rankingPairCount,
    rankingAccuracy: rankingPairCount > 0
      ? rankingCorrectCount / rankingPairCount
      : null
  };
}

function buildAnonymousChannelBuckets(rows, config) {
  const groups = groupByValues(rows, (row) => (
    `CHANNEL_BUCKET_${String(
      stableSeedOffset(row.channelUid) % 8 + 1
    ).padStart(2, "0")}`
  ));
  return Object.freeze([...groups.entries()]
    .sort(([left], [right]) => stableTextCompare(left, right))
    .map(([bucketId, values]) => {
      const publish = values.length >= config.channelAllocation
        .minimumAnonymousChannelBucketCaseCount;
      const metrics = publish
        ? scoreCoreLegacyPointRows(values)
        : null;
      return Object.freeze({
        bucketId,
        caseCount: values.length,
        status: publish
          ? "AGGREGATE_METRICS_PUBLISHED"
          : "SUPPRESSED_SMALL_BUCKET",
        wape: metrics?.wape ?? null,
        signedBias: metrics?.signedBias ?? null,
        channelIdentityPublished: false
      });
    }));
}

function scoreTimeBlocks({ keys, candidateMap, comparatorMap }) {
  const groups = groupByValues(keys, (key) => (
    candidateMap.get(key).origin
  ));
  return Object.freeze([...groups.entries()]
    .sort(([left], [right]) => stableTextCompare(left, right))
    .map(([, blockKeys], index) => {
      const candidate = scoreCoreLegacyPointRows(blockKeys.map(
        (key) => candidateMap.get(key)
      ));
      const comparator = scoreCoreLegacyPointRows(blockKeys.map(
        (key) => comparatorMap.get(key)
      ));
      return Object.freeze({
        blockId: `TIME_BLOCK_${String(index + 1).padStart(3, "0")}`,
        caseCount: blockKeys.length,
        candidateWape: candidate.wape,
        comparatorWape: comparator.wape,
        candidateWins: candidate.wape < comparator.wape
      });
    }));
}

function normalizeAllocationCase(value) {
  const channels = requireArray(value?.channels, "channels")
    .map(normalizeChannel);
  if (channels.length === 0) {
    throw new M2CoreLegacyChannelAllocationError(
      "m2_core_legacy_allocation_channels_empty"
    );
  }
  const actualTotal = finite(value?.actualTotal, "actual_total");
  const channelActualTotal = sum(channels.map((channel) => channel.actual));
  if (Math.abs(channelActualTotal - actualTotal) > 1e-7) {
    throw new M2CoreLegacyChannelAllocationError(
      "m2_core_legacy_allocation_actual_total_mismatch"
    );
  }
  return Object.freeze({
    evaluationFamily: nonempty(
      value?.evaluationFamily,
      "evaluation_family"
    ),
    populationId: nonempty(value?.populationId, "population_id"),
    origin: nonempty(value?.origin, "origin"),
    horizonMonths: integer(value?.horizonMonths, "horizon_months"),
    standardWorkId: nonempty(value?.standardWorkId, "standard_work_id"),
    actualTotal,
    totalPredictions: Object.freeze(requireArray(
      value?.totalPredictions,
      "total_predictions"
    ).map((row) => Object.freeze({
      sourceModelId: nonempty(row?.sourceModelId, "total_source_model_id"),
      pointEstimate: finite(row?.pointEstimate, "total_point_estimate")
    }))),
    channels: Object.freeze(channels)
  });
}

function normalizeChannel(value) {
  const history = requireArray(
    value?.historyNonnegativeByLag,
    "history_nonnegative_by_lag"
  ).map((item) => Math.max(0, finite(item, "history_cash")));
  if (history.length !== 12) {
    throw new M2CoreLegacyChannelAllocationError(
      "m2_core_legacy_allocation_history_window_invalid"
    );
  }
  return Object.freeze({
    channelUid: nonempty(value?.channelUid, "channel_uid"),
    actual: finite(value?.actual, "channel_actual"),
    historyNonnegativeByLag: Object.freeze(history),
    directForecasts: Object.freeze(Object.fromEntries(
      Object.entries(value?.directForecasts ?? {}).map(
        ([modelId, pointEstimate]) => [
          modelId,
          finite(pointEstimate, "direct_channel_point_estimate")
        ]
      )
    ))
  });
}

function lastNonzeroHistoryWeights(channels) {
  for (let lag = 0; lag < 12; lag += 1) {
    const weights = channels.map(
      (channel) => channel.historyNonnegativeByLag[lag]
    );
    if (sum(weights) > 0) return {lag, weights};
  }
  return null;
}

function allocateMinorByShares(totalMinor, shares, channelIds) {
  const sign = totalMinor < 0 ? -1 : 1;
  const magnitude = Math.abs(totalMinor);
  const exact = shares.map((share) => share * magnitude);
  const base = exact.map((value) => Math.floor(value));
  let remainder = magnitude - sum(base);
  const order = [...base.keys()].sort((left, right) => (
    (exact[right] - base[right]) - (exact[left] - base[left])
    || stableTextCompare(channelIds[left], channelIds[right])
  ));
  for (let index = 0; index < remainder; index += 1) {
    base[order[index % order.length]] += 1;
  }
  return base.map((value) => value * sign);
}

function normalizeWeights(values) {
  const denominator = sum(values);
  if (!(denominator > 0)) {
    throw new M2CoreLegacyChannelAllocationError(
      "m2_core_legacy_allocation_zero_weight_normalization"
    );
  }
  return values.map((value) => value / denominator);
}

function uniqueByChannelCase(rows) {
  const result = new Map();
  for (const row of rows) {
    const prior = result.get(row.channelCaseKey);
    if (
      prior !== undefined
      && (
        prior.pointEstimate !== row.pointEstimate
        || prior.actual !== row.actual
      )
    ) {
      throw new M2CoreLegacyChannelAllocationError(
        "m2_core_legacy_allocation_duplicate_channel_case"
      );
    }
    result.set(row.channelCaseKey, row);
  }
  return result;
}

function intersectKeys(maps) {
  if (maps.length === 0) return [];
  return [...maps[0].keys()].filter(
    (key) => maps.every((map) => map.has(key))
  ).sort(stableTextCompare);
}

function summarizeAttempts(rows, field) {
  const groups = groupByValues(rows, (row) => row[field]);
  return Object.freeze([...groups.entries()]
    .sort(([left], [right]) => stableTextCompare(left, right))
    .map(([value, values]) => Object.freeze({
      [field]: value,
      attemptCount: values.length,
      allocatedCount: values.filter(
        (row) => row.status === "ALLOCATED"
      ).length,
      abstainCount: values.filter(
        (row) => row.status !== "ALLOCATED"
      ).length
    })));
}

function blockWinShare(blocks) {
  if (blocks.length === 0) return 0;
  return blocks.filter((row) => row.candidateWins).length / blocks.length;
}

function numericDifference(left, right) {
  if (left === null && right === null) return 0;
  return Number(left) - Number(right);
}

function weightedMean(rows) {
  const available = rows.filter((row) => (
    Number.isFinite(row.value) && row.weight > 0
  ));
  const denominator = sum(available.map((row) => row.weight));
  return denominator > 0
    ? sum(available.map((row) => row.value * row.weight)) / denominator
    : null;
}

function mean(values) {
  const available = values.filter(Number.isFinite);
  return available.length > 0 ? sum(available) / available.length : null;
}

function median(values) {
  const available = values.filter(Number.isFinite)
    .sort((left, right) => left - right);
  if (available.length === 0) return null;
  const middle = Math.floor(available.length / 2);
  return available.length % 2 === 1
    ? available[middle]
    : (available[middle - 1] + available[middle]) / 2;
}

function maximum(values) {
  const available = values.filter(Number.isFinite);
  return available.length > 0 ? Math.max(...available) : null;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function stableSeedOffset(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash % 100000);
}

function groupByValues(values, keyOf) {
  const result = new Map();
  for (const value of values) {
    const key = keyOf(value);
    const group = result.get(key) ?? [];
    group.push(value);
    result.set(key, group);
  }
  return result;
}

function finite(value, field) {
  const result = Number(value);
  if (!Number.isFinite(result)) {
    throw new M2CoreLegacyChannelAllocationError(
      `m2_core_legacy_allocation_${field}_invalid`
    );
  }
  return result;
}

function integer(value, field) {
  const result = Number(value);
  if (!Number.isInteger(result)) {
    throw new M2CoreLegacyChannelAllocationError(
      `m2_core_legacy_allocation_${field}_invalid`
    );
  }
  return result;
}

function nonempty(value, field) {
  const result = String(value ?? "").trim();
  if (result.length === 0) {
    throw new M2CoreLegacyChannelAllocationError(
      `m2_core_legacy_allocation_${field}_required`
    );
  }
  return result;
}

function requireArray(value, field) {
  if (!Array.isArray(value)) {
    throw new M2CoreLegacyChannelAllocationError(
      `m2_core_legacy_allocation_${field}_required`
    );
  }
  return value;
}

function stableTextCompare(left, right) {
  return String(left).localeCompare(String(right), "en");
}
