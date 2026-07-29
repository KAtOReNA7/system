import {
  scoreCoreLegacyPairedBootstrap,
  scoreCoreLegacyPointRows
} from "./coreLegacyPopulation.js";

const ALLOWED_CAPABILITY_STATUSES = new Set([
  "FROZEN_AVAILABLE",
  "DETERMINISTIC_FROZEN_REPLAY_AVAILABLE",
  "UNSUPPORTED_BY_MODEL_CONTRACT",
  "NOT_RECONSTRUCTABLE"
]);

export const M2_CORE_LEGACY_HORIZON_ROUTER_EXPERIMENT_ID =
  "M2-EXP-CORE-LEGACY-HORIZON-ROUTER-01";

export class M2CoreLegacyHorizonRouterError extends Error {
  constructor(code) {
    super(code);
    this.name = "M2CoreLegacyHorizonRouterError";
    this.code = code;
  }
}

export function validateM2CoreLegacyHorizonRouterConfig(config) {
  if (
    config?.schema !== "m2.current.core_legacy_horizon_router.v0.1"
    || config?.experiment?.stableExperimentId
      !== M2_CORE_LEGACY_HORIZON_ROUTER_EXPERIMENT_ID
  ) {
    throw new M2CoreLegacyHorizonRouterError(
      "m2_core_legacy_horizon_router_config_identity_invalid"
    );
  }
  if (
    config?.scope?.baseContract
      !== "config/m2-current-core-legacy-population.v0.1.json"
    || config?.scope?.actualDefinitionId
      !== "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01"
    || config?.scope?.minimumCompleteMonths !== 3
    || config?.scope?.immaturePolicy !== "ABSTAIN_NOT_ZERO"
  ) {
    throw new M2CoreLegacyHorizonRouterError(
      "m2_core_legacy_horizon_router_scope_invalid"
    );
  }
  assertExactSet(
    config.scope.horizonsMonths,
    [3, 6, 12, 36],
    "horizons"
  );
  assertExactSet(
    config.scope.evaluationFamilies,
    ["PRIMARY_ROLLING", "STRICT_ROLLING"],
    "evaluation_families"
  );
  assertExactSet(
    config.scope.grains,
    ["WORK_CHANNEL", "WORK_TOTAL"],
    "grains"
  );
  assertExactSet(
    config.scope.populations,
    ["CORE80", "CORE90"],
    "populations"
  );
  assertExactSet(
    config.scope.diagnosticPopulations,
    ["TOP20", "TOP50"],
    "diagnostic_populations"
  );
  assertExactSet(
    config.scope.excludedModelIds,
    ["M2-PORT-ETS01", "M2-PORT-LRC01"],
    "excluded_models"
  );
  const models = requireArray(config.models, "models");
  assertExactSet(
    models.map((model) => model.modelId),
    ["M2-WORK-CRMR01", "M2-WORK-LG01", "M2-WORK-OA03"],
    "models"
  );
  assertExactSet(
    config.capabilityRules?.allowedStatuses,
    [...ALLOWED_CAPABILITY_STATUSES],
    "capability_statuses"
  );
  const replay = config.deterministicReplayContract;
  if (
    replay?.contractId
      !== "M2-FROZEN-REPLAY-CORE-LEGACY-HORIZON-01"
    || replay?.maximumNumericDifference !== 0
    || replay?.cacheAbsenceIsBlocking !== false
    || replay?.historicalReceiptAbsenceIsBlocking !== false
    || !replay?.forbidden?.includes("cross_horizon_parameter_copy")
    || !replay?.forbidden?.includes(
      "row_level_prediction_inference_from_public_aggregate"
    )
  ) {
    throw new M2CoreLegacyHorizonRouterError(
      "m2_core_legacy_frozen_replay_contract_invalid"
    );
  }
  if (
    config.sameCaseEvaluation?.bootstrap?.iterations !== 2000
    || config.sameCaseEvaluation?.materialRelativeWapeImprovement !== 0.01
    || config.sameCaseEvaluation?.materialAbsoluteBiasWorsening !== 0.02
    || config.horizonRouter?.minimumMatureSelectionOrigins !== 3
    || config.horizonRouter?.absoluteBiasExclusionThreshold !== 0.1
    || config.horizonRouter?.wapeTieThreshold !== 0.01
    || config.channelAllocation?.equalSplitAllowed !== false
    || config.channelAllocation?.futureRevenueAllowed !== false
    || config.channelAllocation?.requiredConservationDifferenceMinor !== 0
  ) {
    throw new M2CoreLegacyHorizonRouterError(
      "m2_core_legacy_preregistered_threshold_invalid"
    );
  }
  if (
    config.roles?.operationalWorkFallback !== "M2-WORK-OA03"
    || config.roles?.researchWorkBaseline !== "M2-WORK-LG01"
    || config.roles?.activeCandidate !== null
    || config.roles?.approvedForAutomation !== null
  ) {
    throw new M2CoreLegacyHorizonRouterError(
      "m2_core_legacy_model_roles_invalid"
    );
  }
  const matrix = buildM2CoreLegacyCapabilityMatrix(config);
  if (matrix.length !== 48) {
    throw new M2CoreLegacyHorizonRouterError(
      "m2_core_legacy_capability_matrix_incomplete"
    );
  }
  return true;
}

export function buildM2CoreLegacyCapabilityMatrix(config) {
  const rules = config?.capabilityRules ?? {};
  const frozen = mapSets(rules.frozenAvailableCells);
  const notReconstructable = mapSets(rules.notReconstructableCells);
  const replayable = new Set(
    rules.deterministicReplayIfCacheMissingModels ?? []
  );
  const matrix = [];
  for (const model of requireArray(config?.models, "models")) {
    const supportedGrains = new Set(model.supportedGrains ?? []);
    const supportedHorizons = new Set(model.supportedHorizonsMonths ?? []);
    for (const evaluationFamily of config.scope.evaluationFamilies) {
      for (const horizonMonths of config.scope.horizonsMonths) {
        for (const grain of config.scope.grains) {
          const key = capabilityCellKey({
            evaluationFamily,
            horizonMonths,
            grain
          });
          let status;
          let reason;
          if (
            !supportedGrains.has(grain)
            || !supportedHorizons.has(horizonMonths)
          ) {
            status = "UNSUPPORTED_BY_MODEL_CONTRACT";
            reason = !supportedGrains.has(grain)
              ? "PREDICTION_GRAIN_NOT_SUPPORTED"
              : "HORIZON_NOT_SUPPORTED";
          } else if (frozen.get(model.modelId)?.has(key)) {
            status = "FROZEN_AVAILABLE";
            reason = "VERIFIED_PRIVATE_FROZEN_ROW_CACHE_PRESENT";
          } else if (notReconstructable.get(model.modelId)?.has(key)) {
            status = "NOT_RECONSTRUCTABLE";
            reason = reconstructionReason(
              rules.notReconstructableReasons,
              model.modelId,
              evaluationFamily,
              horizonMonths
            );
          } else {
            throw new M2CoreLegacyHorizonRouterError(
              "m2_core_legacy_capability_cell_unclassified:"
                + `${model.modelId}:${key}`
            );
          }
          if (!ALLOWED_CAPABILITY_STATUSES.has(status)) {
            throw new M2CoreLegacyHorizonRouterError(
              "m2_core_legacy_capability_status_invalid"
            );
          }
          matrix.push(Object.freeze({
            modelId: model.modelId,
            displayNameZh: model.displayNameZh,
            displayNameEn: model.displayNameEn,
            evaluationFamily,
            horizonMonths,
            grain,
            status,
            reason,
            replayIfCacheMissing: status === "FROZEN_AVAILABLE"
              && replayable.has(model.modelId)
              ? "DETERMINISTIC_FROZEN_REPLAY_AVAILABLE"
              : null,
            missingOutputImputedAsZero: false
          }));
        }
      }
    }
  }
  return Object.freeze(matrix);
}

export function buildM2CoreLegacyK0CapabilityReport(config) {
  validateM2CoreLegacyHorizonRouterConfig(config);
  const capabilityMatrix = buildM2CoreLegacyCapabilityMatrix(config);
  const counts = Object.fromEntries(
    [...ALLOWED_CAPABILITY_STATUSES].map((status) => [
      status,
      capabilityMatrix.filter((cell) => cell.status === status).length
    ])
  );
  return Object.freeze({
    schema:
      "m2.current.core_legacy_horizon_router.capability_matrix.public.v0.1",
    asOf: config.asOf,
    experiment: config.experiment,
    status: "K0_CAPABILITY_MATRIX_AND_FROZEN_REPLAY_CONTRACT_COMPLETE",
    taskStatus:
      "M2_CORE_LEGACY_HORIZON_ROUTER_AND_CHANNEL_ALLOCATION_PARTIAL",
    scope: config.scope,
    heads: {
      evaluationHead: null,
      evaluationHeadStatus:
        "ASSIGNED_AFTER_K0_EXACT_HEAD_LINUX_WINDOWS_CI",
      finalDocumentationHead: null,
      finalDocumentationHeadStatus: "NOT_YET_ASSIGNED",
      meanings: config.heads
    },
    capabilityMatrix,
    statusCounts: counts,
    deterministicReplayContract: config.deterministicReplayContract,
    evidenceBindings: {
      modelRegistry: "config/m2-model-registry.v1.json",
      priorFrozenRescore:
        "docs/analysis/m2-current/"
        + "M2-core-legacy-frozen-rescore-v0.1.json",
      humanAnchoredContract:
        "config/m2-current-human-anchored.v0.1.json",
      coreRevenueManualContract:
        "config/m2-current-core-revenue-manual.v0.1.json"
    },
    answersAtK0: {
      oa03StrictReplay:
        "NOT_RECONSTRUCTABLE_ORIGINAL_STRICT_FOLD_EVIDENCE_ABSENT",
      oa03H36: "UNSUPPORTED_BY_MODEL_CONTRACT",
      oa03DirectChannel:
        "UNSUPPORTED_BY_MODEL_CONTRACT_ALLOCATION_TEST_REQUIRED",
      lg01PrimaryH3H6H12:
        "NOT_RECONSTRUCTABLE_CROSS_HORIZON_PARAMETER_COPY_FORBIDDEN",
      lg01StrictH36:
        "NOT_RECONSTRUCTABLE_NO_MATURE_STRICT_H36_SELECTION_ORIGINS"
    },
    boundaries: {
      modelTrainingPerformed: false,
      parameterOrGridChanged: false,
      fallbackChanged: false,
      crossHorizonParameterCopyPerformed: false,
      privatePredictionRowsRead: false,
      privateEvaluationPerformed: false,
      missingOutputImputedAsZero: false,
      productionChanged: false,
      laterOriginRead: false,
      finalHoldoutRead: false
    }
  });
}

export function capabilityCellKey({
  evaluationFamily,
  horizonMonths,
  grain
}) {
  return `${evaluationFamily}|${Number(horizonMonths)}|${grain}`;
}

export function buildM2CoreLegacySameCaseEvaluation(rows, config, {
  evaluationHead = null,
  exactHeadCiRunId = null
} = {}) {
  validateM2CoreLegacyHorizonRouterConfig(config);
  if (!Array.isArray(rows)) {
    throw new M2CoreLegacyHorizonRouterError(
      "m2_core_legacy_same_case_rows_required"
    );
  }
  const normalized = rows.map(normalizeFrozenRow);
  const comparisonSets = [];
  const privateRows = [];
  for (const evaluationFamily of config.scope.evaluationFamilies) {
    for (const populationId of [
      ...config.scope.populations,
      ...config.scope.diagnosticPopulations
    ]) {
      for (const grain of config.scope.grains) {
        for (const horizonMonths of config.scope.horizonsMonths) {
          const cellRows = normalized.filter((row) => (
            row.evaluationFamily === evaluationFamily
            && row.populationId === populationId
            && row.grain === grain
            && row.horizonMonths === horizonMonths
          ));
          const comparison = buildSameCaseComparisonSet(cellRows, {
            config,
            evaluationFamily,
            populationId,
            grain,
            horizonMonths
          });
          comparisonSets.push(comparison.public);
          privateRows.push(...comparison.privateRows);
        }
      }
    }
  }
  const horizonDecisions = config.scope.horizonsMonths.map(
    (horizonMonths) => {
      const primary = comparisonSets.find((row) => (
        row.evaluationFamily === "PRIMARY_ROLLING"
        && row.populationId === "CORE80"
        && row.grain === "WORK_TOTAL"
        && row.horizonMonths === horizonMonths
      ));
      const strict = comparisonSets.find((row) => (
        row.evaluationFamily === "STRICT_ROLLING"
        && row.populationId === "CORE80"
        && row.grain === "WORK_TOTAL"
        && row.horizonMonths === horizonMonths
      ));
      return Object.freeze({
        horizonMonths,
        primaryStatus: primary?.winnerDecision?.status
          ?? "NOT_COMPARABLE",
        primaryWinnerModelId:
          primary?.winnerDecision?.winnerModelId ?? null,
        primaryMetrics: primary?.modelMetrics ?? [],
        strictStatus: strict?.winnerDecision?.status
          ?? "NOT_COMPARABLE",
        strictWinnerModelId:
          strict?.winnerDecision?.winnerModelId ?? null,
        strictMetrics: strict?.modelMetrics ?? [],
        horizonStatus: primary?.winnerDecision?.status
          ?? strict?.winnerDecision?.status
          ?? "NOT_COMPARABLE",
        horizonWinnerModelId:
          primary?.winnerDecision?.winnerModelId
          ?? strict?.winnerDecision?.winnerModelId
          ?? null
      });
    }
  );
  const result = Object.freeze({
    schema:
      "m2.current.core_legacy_full_horizon_same_case.public.v0.1",
    asOf: config.asOf,
    experiment: config.experiment,
    status: "K1_FULL_HORIZON_SAME_CASE_FROZEN_RESCORE_COMPLETE",
    taskStatus:
      "M2_CORE_LEGACY_HORIZON_ROUTER_AND_CHANNEL_ALLOCATION_PARTIAL",
    sameCaseEvidenceStatus: determineSameCaseEvidenceStatus(
      horizonDecisions
    ),
    evaluationHead,
    exactHeadCiRunId,
    finalDocumentationHead: null,
    target: {
      name: config.scope.target,
      actualDefinitionId: config.scope.actualDefinitionId,
      maturityPolicy: config.scope.immaturePolicy,
      excludedModelIds: config.scope.excludedModelIds
    },
    horizonDecisions,
    comparisonSets,
    summaries: {
      byPopulation: summarizeComparisonSets(
        comparisonSets,
        "populationId"
      ),
      byGrain: summarizeComparisonSets(comparisonSets, "grain"),
      byEvaluationFamily: summarizeComparisonSets(
        comparisonSets,
        "evaluationFamily"
      )
    },
    boundaries: {
      sameCaseKey: config.sameCaseEvaluation.key,
      bootstrapIterations:
        config.sameCaseEvaluation.bootstrap.iterations,
      independentTimeBlock: "origin_anonymized_in_public_report",
      yearBlock: "calendar_year",
      modelTrainingPerformed: false,
      parameterOrGridChanged: false,
      crossHorizonParameterCopyPerformed: false,
      fallbackUsedToReplaceRawCandidate: false,
      differentCaseIndependentWapeRanked: false,
      privateIdentityPublished: false,
      productionChanged: false,
      laterOriginRead: false,
      finalHoldoutRead: false
    }
  });
  return Object.freeze({
    publicResult: result,
    privateRows: Object.freeze(privateRows)
  });
}

function buildSameCaseComparisonSet(rows, {
  config,
  evaluationFamily,
  populationId,
  grain,
  horizonMonths
}) {
  const comparisonSetId = [
    "SC",
    evaluationFamily,
    populationId,
    grain,
    `H${horizonMonths}`
  ].join("-");
  const byModel = groupByValues(rows, (row) => row.modelId);
  const modelIds = [...byModel.keys()].sort(stableTextCompare);
  const maps = new Map(modelIds.map((modelId) => [
    modelId,
    uniqueRowsByCase(byModel.get(modelId))
  ]));
  const sameCaseKeys = intersectKeys([...maps.values()]);
  if (modelIds.length < 2 || sameCaseKeys.length === 0) {
    return {
      public: Object.freeze({
        comparisonSetId,
        evaluationFamily,
        populationId,
        grain,
        horizonMonths,
        status: "NOT_COMPARABLE",
        availableModelIds: modelIds,
        caseCount: 0,
        workCount: 0,
        modelMetrics: Object.freeze([]),
        winnerDecision: Object.freeze({
          status: "NOT_COMPARABLE",
          winnerModelId: null,
          reason: modelIds.length < 2
            ? "FEWER_THAN_TWO_LEGAL_MODELS"
            : "NO_SHARED_CASE_INTERSECTION"
        }),
        pairedBootstrap: null,
        independentTimeBlocks: Object.freeze([]),
        yearBlocks: Object.freeze([])
      }),
      privateRows: []
    };
  }
  const actualByCase = new Map();
  const privateRows = [];
  const modelRows = new Map();
  for (const modelId of modelIds) {
    const caseMap = maps.get(modelId);
    const selected = [];
    for (const caseKey of sameCaseKeys) {
      const row = caseMap.get(caseKey);
      const priorActual = actualByCase.get(caseKey);
      if (
        priorActual !== undefined
        && Math.abs(priorActual - row.actual) > 1e-9
      ) {
        throw new M2CoreLegacyHorizonRouterError(
          "m2_core_legacy_same_case_actual_mismatch"
        );
      }
      actualByCase.set(caseKey, row.actual);
      selected.push(row);
      privateRows.push(Object.freeze({
        schema:
          "m2.current.core_legacy_full_horizon_same_case_row.private.v0.1",
        experimentId: M2_CORE_LEGACY_HORIZON_ROUTER_EXPERIMENT_ID,
        comparisonSetId,
        modelId,
        evaluationFamily,
        populationId,
        grain,
        origin: row.origin,
        horizonMonths,
        standardWorkId: row.standardWorkId,
        channelUid: row.channelUid,
        caseKey,
        pointEstimate: row.pointEstimate,
        actual: row.actual,
        frozenSourceStatus: row.frozenSourceStatus
      }));
    }
    modelRows.set(modelId, selected);
  }
  const metrics = modelIds.map((modelId) => {
    const selected = modelRows.get(modelId);
    return Object.freeze({
      modelId,
      ...scoreCoreLegacyPointRows(selected),
      extremeWorkContribution:
        buildAnonymousExtremeWorkContribution(selected)
    });
  }).sort(compareModelMetrics);
  const winner = metrics[0];
  const runnerUp = metrics[1];
  const pairedRows = sameCaseKeys.map((caseKey) => {
    const candidate = maps.get(winner.modelId).get(caseKey);
    const baseline = maps.get(runnerUp.modelId).get(caseKey);
    return {
      standardWorkId: candidate.standardWorkId,
      actual: candidate.actual,
      candidatePointEstimate: candidate.pointEstimate,
      baselinePointEstimate: baseline.pointEstimate
    };
  });
  const bootstrap = scoreCoreLegacyPairedBootstrap(pairedRows, {
    iterations: config.sameCaseEvaluation.bootstrap.iterations,
    seed: config.sameCaseEvaluation.bootstrap.seed
      + horizonMonths
      + stableSeedOffset(comparisonSetId)
  });
  const blocks = buildComparisonBlocks({
    sameCaseKeys,
    candidateMap: maps.get(winner.modelId),
    baselineMap: maps.get(runnerUp.modelId),
    candidateModelId: winner.modelId,
    baselineModelId: runnerUp.modelId
  });
  const relativeWapeImprovement = runnerUp.wape > 0
    ? (runnerUp.wape - winner.wape) / runnerUp.wape
    : null;
  const absoluteBiasWorsening =
    Math.abs(winner.signedBias) - Math.abs(runnerUp.signedBias);
  const decision = decideSameCaseWinner({
    winner,
    runnerUp,
    relativeWapeImprovement,
    absoluteBiasWorsening,
    bootstrap,
    timeBlocks: blocks.timeBlocks,
    yearBlocks: blocks.yearBlocks,
    config
  });
  return {
    public: Object.freeze({
      comparisonSetId,
      evaluationFamily,
      populationId,
      grain,
      horizonMonths,
      status: "COMPUTED_SAME_CASE_INTERSECTION",
      availableModelIds: Object.freeze(modelIds),
      caseCount: sameCaseKeys.length,
      workCount: new Set(privateRows.map(
        (row) => row.standardWorkId
      )).size,
      modelMetrics: Object.freeze(metrics),
      winnerDecision: decision,
      pairedBootstrap: bootstrap,
      independentTimeBlocks: blocks.timeBlocks,
      yearBlocks: blocks.yearBlocks
    }),
    privateRows
  };
}

function decideSameCaseWinner({
  winner,
  runnerUp,
  relativeWapeImprovement,
  absoluteBiasWorsening,
  bootstrap,
  timeBlocks,
  yearBlocks,
  config
}) {
  const minimum =
    config.sameCaseEvaluation.materialRelativeWapeImprovement;
  const biasMaximum =
    config.sameCaseEvaluation.materialAbsoluteBiasWorsening;
  const bootstrapSupports = (
    bootstrap?.status === "COMPUTED"
    && bootstrap?.improvement95?.lower > 0
  );
  const timeBlockWinShare = blockWinShare(
    timeBlocks,
    winner.modelId
  );
  const yearWinShare = blockWinShare(yearBlocks, winner.modelId);
  let status;
  let reason;
  if (
    relativeWapeImprovement === null
    || relativeWapeImprovement < minimum
  ) {
    status = "NO_STABLE_WINNER";
    reason = "RELATIVE_WAPE_IMPROVEMENT_BELOW_ONE_PERCENT";
  } else if (absoluteBiasWorsening > biasMaximum) {
    status = "WAPE_WIN_BIAS_TRADEOFF";
    reason = "ABSOLUTE_BIAS_WORSENED_MORE_THAN_TWO_PERCENTAGE_POINTS";
  } else if (
    bootstrapSupports
    && timeBlockWinShare > 0.5
    && yearWinShare > 0.5
  ) {
    status = "CLEAR_WINNER";
    reason =
      "MATERIAL_WAPE_WIN_WITH_BIAS_BOOTSTRAP_TIME_AND_YEAR_SUPPORT";
  } else {
    status = "NO_STABLE_WINNER";
    reason = "MATERIAL_POINT_WIN_WITHOUT_STABILITY_SUPPORT";
  }
  return Object.freeze({
    status,
    winnerModelId: status === "CLEAR_WINNER"
      || status === "WAPE_WIN_BIAS_TRADEOFF"
      ? winner.modelId
      : null,
    pointWapeLeaderModelId: winner.modelId,
    comparatorModelId: runnerUp.modelId,
    relativeWapeImprovement,
    absoluteBiasWorsening,
    bootstrapSupports,
    timeBlockWinShare,
    yearWinShare,
    reason
  });
}

function buildComparisonBlocks({
  sameCaseKeys,
  candidateMap,
  baselineMap,
  candidateModelId,
  baselineModelId
}) {
  const rows = sameCaseKeys.map((key) => ({
    key,
    candidate: candidateMap.get(key),
    baseline: baselineMap.get(key)
  }));
  const originGroups = groupByValues(rows, (row) => row.candidate.origin);
  const sortedOrigins = [...originGroups.keys()].sort(stableTextCompare);
  const timeBlocks = sortedOrigins.map((origin, index) => (
    scoreComparisonBlock(
      originGroups.get(origin),
      `TIME_BLOCK_${String(index + 1).padStart(3, "0")}`,
      candidateModelId,
      baselineModelId
    )
  ));
  const yearGroups = groupByValues(
    rows,
    (row) => String(row.candidate.origin).slice(0, 4)
  );
  const yearBlocks = [...yearGroups.entries()]
    .sort(([left], [right]) => stableTextCompare(left, right))
    .map(([year, values]) => scoreComparisonBlock(
      values,
      year,
      candidateModelId,
      baselineModelId
    ));
  return {
    timeBlocks: Object.freeze(timeBlocks),
    yearBlocks: Object.freeze(yearBlocks)
  };
}

function scoreComparisonBlock(
  rows,
  blockId,
  candidateModelId,
  baselineModelId
) {
  const candidate = scoreCoreLegacyPointRows(rows.map((row) => ({
    ...row.candidate,
    pointEstimate: row.candidate.pointEstimate
  })));
  const baseline = scoreCoreLegacyPointRows(rows.map((row) => ({
    ...row.baseline,
    pointEstimate: row.baseline.pointEstimate
  })));
  let winnerModelId = null;
  if (candidate.wape < baseline.wape) {
    winnerModelId = candidateModelId;
  } else if (baseline.wape < candidate.wape) {
    winnerModelId = baselineModelId;
  }
  return Object.freeze({
    blockId,
    caseCount: rows.length,
    candidateModelId,
    candidateWape: candidate.wape,
    baselineModelId,
    baselineWape: baseline.wape,
    winnerModelId
  });
}

function buildAnonymousExtremeWorkContribution(rows) {
  const byWork = new Map();
  for (const row of rows) {
    const error = Math.abs(row.pointEstimate - row.actual);
    byWork.set(
      row.standardWorkId,
      (byWork.get(row.standardWorkId) ?? 0) + error
    );
  }
  const values = [...byWork.values()].sort((left, right) => right - left);
  const total = values.reduce((sum, value) => sum + value, 0);
  return Object.freeze({
    anonymousWorkCount: values.length,
    largestWorkAbsoluteErrorContribution:
      total > 0 ? (values[0] ?? 0) / total : null,
    topFiveWorksAbsoluteErrorContribution:
      total > 0
        ? values.slice(0, 5).reduce((sum, value) => sum + value, 0)
          / total
        : null,
    workIdentityPublished: false
  });
}

function summarizeComparisonSets(comparisonSets, field) {
  const groups = groupByValues(comparisonSets, (row) => row[field]);
  return Object.freeze([...groups.entries()]
    .sort(([left], [right]) => stableTextCompare(left, right))
    .map(([value, rows]) => Object.freeze({
      [field]: value,
      comparisonSetCount: rows.length,
      computedSameCaseCount: rows.filter(
        (row) => row.status === "COMPUTED_SAME_CASE_INTERSECTION"
      ).length,
      decisionCounts: countBy(rows, (row) => (
        row.winnerDecision.status
      ))
    })));
}

function determineSameCaseEvidenceStatus(horizonDecisions) {
  if (horizonDecisions.every(
    (row) => row.horizonStatus === "NOT_COMPARABLE"
  )) {
    return "SAME_CASE_EVIDENCE_NOT_EVALUABLE";
  }
  if (horizonDecisions.some(
    (row) => row.horizonStatus === "NOT_COMPARABLE"
  )) {
    return "SAME_CASE_EVIDENCE_PARTIAL";
  }
  return "SAME_CASE_EVIDENCE_COMPLETE_FOR_LEGAL_MODEL_INTERSECTIONS";
}

function normalizeFrozenRow(row) {
  const modelId = nonempty(row?.modelId, "same_case_model_id");
  const evaluationFamily = nonempty(
    row?.evaluationFamily,
    "same_case_evaluation_family"
  );
  const populationId = nonempty(
    row?.populationId,
    "same_case_population_id"
  );
  const grain = nonempty(row?.grain, "same_case_grain");
  const standardWorkId = nonempty(
    row?.standardWorkId,
    "same_case_work_id"
  );
  const origin = nonempty(row?.origin, "same_case_origin");
  const horizonMonths = Number(row?.horizonMonths);
  const pointEstimate = Number(row?.pointEstimate);
  const actual = Number(row?.actual);
  if (
    !Number.isInteger(horizonMonths)
    || !Number.isFinite(pointEstimate)
    || !Number.isFinite(actual)
  ) {
    throw new M2CoreLegacyHorizonRouterError(
      "m2_core_legacy_same_case_numeric_invalid"
    );
  }
  const channelUid = row?.channelUid === null
    || row?.channelUid === undefined
    ? null
    : String(row.channelUid);
  const caseKey = nonempty(
    row?.caseKey,
    "same_case_case_key"
  );
  return Object.freeze({
    ...row,
    modelId,
    evaluationFamily,
    populationId,
    grain,
    standardWorkId,
    channelUid,
    origin,
    horizonMonths,
    pointEstimate,
    actual,
    caseKey
  });
}

function uniqueRowsByCase(rows) {
  const result = new Map();
  for (const row of rows) {
    const prior = result.get(row.caseKey);
    if (prior && JSON.stringify(prior) !== JSON.stringify(row)) {
      throw new M2CoreLegacyHorizonRouterError(
        "m2_core_legacy_same_case_duplicate_conflict"
      );
    }
    result.set(row.caseKey, row);
  }
  return result;
}

function intersectKeys(maps) {
  if (maps.length === 0) return [];
  return [...maps[0].keys()].filter((key) => (
    maps.every((map) => map.has(key))
  )).sort(stableTextCompare);
}

function compareModelMetrics(left, right) {
  return (left.wape ?? Number.POSITIVE_INFINITY)
    - (right.wape ?? Number.POSITIVE_INFINITY)
    || Math.abs(left.signedBias ?? Number.POSITIVE_INFINITY)
      - Math.abs(right.signedBias ?? Number.POSITIVE_INFINITY)
    || modelTiePriority(left.modelId) - modelTiePriority(right.modelId)
    || stableTextCompare(left.modelId, right.modelId);
}

function modelTiePriority(modelId) {
  return ({
    "M2-WORK-OA03": 0,
    "M2-WORK-LG01": 1,
    "M2-WORK-CRMR01": 2
  })[modelId] ?? 99;
}

function blockWinShare(blocks, modelId) {
  if (blocks.length === 0) return 0;
  return blocks.filter((block) => block.winnerModelId === modelId).length
    / blocks.length;
}

function stableSeedOffset(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash % 100000);
}

function countBy(values, keyOf) {
  const result = {};
  for (const value of values) {
    const key = keyOf(value);
    result[key] = (result[key] ?? 0) + 1;
  }
  return Object.freeze(result);
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

function nonempty(value, field) {
  const result = String(value ?? "").trim();
  if (result.length === 0) {
    throw new M2CoreLegacyHorizonRouterError(
      `m2_core_legacy_${field}_required`
    );
  }
  return result;
}

function stableTextCompare(left, right) {
  return String(left).localeCompare(String(right), "en");
}

function reconstructionReason(
  reasons,
  modelId,
  evaluationFamily,
  horizonMonths
) {
  return reasons?.[
    `${modelId}|${evaluationFamily}|${Number(horizonMonths)}`
  ] ?? reasons?.[`${modelId}|${evaluationFamily}`]
    ?? "HISTORICAL_INFORMATION_INSUFFICIENT";
}

function mapSets(value) {
  return new Map(Object.entries(value ?? {}).map(([key, items]) => [
    key,
    new Set(requireArray(items, `capability_cells_${key}`))
  ]));
}

function assertExactSet(actual, expected, field) {
  const left = [...new Set(requireArray(actual, field))]
    .map(String)
    .sort();
  const right = [...new Set(expected)].map(String).sort();
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    throw new M2CoreLegacyHorizonRouterError(
      `m2_core_legacy_${field}_invalid`
    );
  }
}

function requireArray(value, field) {
  if (!Array.isArray(value)) {
    throw new M2CoreLegacyHorizonRouterError(
      `m2_core_legacy_${field}_required`
    );
  }
  return value;
}
