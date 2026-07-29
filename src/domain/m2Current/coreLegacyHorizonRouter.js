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
    || config.horizonRouter?.modelId !== "M2-WORK-HR01"
    || config.horizonRouter?.minimumMatureSelectionOrigins !== 3
    || config.horizonRouter?.matureHistoryDefinition
      !== "prior_origin_target_window_fully_observed_by_outer_origin"
    || config.horizonRouter?.outerActualAllowedForSelection !== false
    || config.horizonRouter?.absoluteBiasExclusionThreshold !== 0.1
    || config.horizonRouter?.wapeTieThreshold !== 0.01
    || config.horizonRouter
      ?.maximumSingleWorkAbsoluteErrorContribution !== 0.5
    || config.horizonRouter
      ?.maximumTopFiveWorkAbsoluteErrorContribution !== 0.8
    || config.horizonRouter
      ?.maximumFallbackSelectionShareForConfirmation !== 0.5
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

export function buildM2CoreLegacyRollingHorizonRouter(rows, config, {
  evaluationHead = null,
  routerExecutionHead = null,
  exactHeadCiRunId = null
} = {}) {
  validateM2CoreLegacyHorizonRouterConfig(config);
  if (!Array.isArray(rows)) {
    throw new M2CoreLegacyHorizonRouterError(
      "m2_core_legacy_router_rows_required"
    );
  }
  const normalized = rows.map(normalizeFrozenRow).filter((row) => (
    row.grain === "WORK_TOTAL"
    && config.scope.populations.includes(row.populationId)
    && config.scope.evaluationFamilies.includes(row.evaluationFamily)
    && config.scope.horizonsMonths.includes(row.horizonMonths)
  ));
  const evaluationSets = [];
  const selectionRows = [];
  const predictionRows = [];
  for (const evaluationFamily of config.scope.evaluationFamilies) {
    for (const populationId of config.scope.populations) {
      for (const horizonMonths of config.scope.horizonsMonths) {
        const cellRows = normalized.filter((row) => (
          row.evaluationFamily === evaluationFamily
          && row.populationId === populationId
          && row.horizonMonths === horizonMonths
        ));
        const built = buildRollingRouterCell(cellRows, {
          config,
          evaluationFamily,
          populationId,
          horizonMonths
        });
        evaluationSets.push(built.public);
        selectionRows.push(...built.selectionRows);
        predictionRows.push(...built.predictionRows);
      }
    }
  }
  const horizonDecisions = config.scope.horizonsMonths.map(
    (horizonMonths) => {
      const primary = evaluationSets.find((row) => (
        row.evaluationFamily === "PRIMARY_ROLLING"
        && row.populationId === "CORE80"
        && row.horizonMonths === horizonMonths
      ));
      const strict = evaluationSets.find((row) => (
        row.evaluationFamily === "STRICT_ROLLING"
        && row.populationId === "CORE80"
        && row.horizonMonths === horizonMonths
      ));
      return Object.freeze({
        horizonMonths,
        primaryStatus: primary?.decision?.status
          ?? "HORIZON_ROUTER_NOT_EVALUABLE",
        primaryMetrics: primary === undefined
          ? null
          : publicRouterDecisionMetrics(primary),
        strictStatus: strict?.decision?.status
          ?? "HORIZON_ROUTER_NOT_EVALUABLE",
        strictMetrics: strict === undefined
          ? null
          : publicRouterDecisionMetrics(strict),
        horizonStatus: primary?.decision?.status
          ?? strict?.decision?.status
          ?? "HORIZON_ROUTER_NOT_EVALUABLE"
      });
    }
  );
  const horizonRouterStatus = summarizeRouterTaskStatus(
    horizonDecisions.map((row) => row.horizonStatus)
  );
  return Object.freeze({
    publicResult: Object.freeze({
      schema:
        "m2.current.core_legacy_rolling_horizon_router.public.v0.1",
      asOf: config.asOf,
      experiment: config.experiment,
      model: Object.freeze({
        modelId: config.horizonRouter.modelId,
        displayNameZh: config.horizonRouter.displayNameZh,
        displayNameEn: config.horizonRouter.displayNameEn,
        entityType: "model_pipeline",
        role: "development_candidate_evidence_only"
      }),
      status: "K2_ROLLING_HORIZON_ROUTER_COMPLETE",
      taskStatus:
        "M2_CORE_LEGACY_HORIZON_ROUTER_AND_CHANNEL_ALLOCATION_PARTIAL",
      horizonRouterStatus,
      evaluationHead,
      routerExecutionHead,
      exactHeadCiRunId,
      finalDocumentationHead: null,
      target: Object.freeze({
        name: config.scope.target,
        actualDefinitionId: config.scope.actualDefinitionId,
        grain: "WORK_TOTAL",
        populations: Object.freeze([...config.scope.populations])
      }),
      frozenSelectionContract: Object.freeze({
        minimumMatureSelectionOrigins:
          config.horizonRouter.minimumMatureSelectionOrigins,
        matureHistoryDefinition:
          config.horizonRouter.matureHistoryDefinition,
        absoluteBiasExclusionThreshold:
          config.horizonRouter.absoluteBiasExclusionThreshold,
        wapeTieThreshold: config.horizonRouter.wapeTieThreshold,
        earlyFallbackOrder: Object.freeze([
          config.horizonRouter.operationalFallbackModelId,
          config.horizonRouter.unsupportedFallbackModelId,
          "ABSTAIN"
        ]),
        posthocReference: Object.freeze({
          ...config.horizonRouter.posthocReference
        }),
        posthocReferenceRole:
          config.horizonRouter.posthocReferenceRole,
        outerActualAllowedForSelection: false
      }),
      horizonDecisions: Object.freeze(horizonDecisions),
      evaluationSets: Object.freeze(evaluationSets),
      selectionSummary: summarizeRouterSelections(selectionRows),
      boundaries: Object.freeze({
        rawCandidatePreserved: true,
        selectedPipelineHidesRawCandidate: false,
        posthocReferenceUsedForSelection: false,
        currentOuterActualReadForSelection: false,
        onlyMaturePriorPseudoOriginsRead: true,
        modelTrainingPerformed: false,
        parameterOrGridChanged: false,
        fallbackChanged: false,
        privateIdentityPublished: false,
        productionChanged: false,
        laterOriginRead: false,
        finalHoldoutRead: false
      })
    }),
    selectionRows: Object.freeze(selectionRows),
    predictionRows: Object.freeze(predictionRows)
  });
}

export function selectM2CoreLegacyHorizonModel({
  outerOrigin,
  horizonMonths,
  currentRows,
  historicalRows,
  config
}) {
  validateM2CoreLegacyHorizonRouterConfig(config);
  const candidateModelIds = [...new Set(currentRows.map(
    (row) => nonempty(row?.modelId, "router_current_model_id")
  ))].sort(compareModelIds);
  const matureHistory = historicalRows.filter((row) => (
    String(row?.origin) !== outerOrigin
    && Number(row?.horizonMonths) === Number(horizonMonths)
    && monthSerial(row.origin) + Number(horizonMonths)
      <= monthSerial(outerOrigin)
  )).map(normalizeFrozenRow);
  const matureByOrigin = groupByValues(
    matureHistory,
    (row) => row.origin
  );
  const historicalByModel = new Map(candidateModelIds.map((modelId) => [
    modelId,
    []
  ]));
  const matureHistoricalOrigins = [];
  for (const [origin, originRows] of [...matureByOrigin.entries()]
    .sort(([left], [right]) => stableTextCompare(left, right))) {
    const maps = candidateModelIds.map((modelId) => uniqueRowsByCase(
      originRows.filter((row) => row.modelId === modelId)
    ));
    const keys = intersectKeys(maps);
    if (keys.length === 0) continue;
    matureHistoricalOrigins.push(origin);
    for (let index = 0; index < candidateModelIds.length; index += 1) {
      const modelId = candidateModelIds[index];
      for (const key of keys) {
        historicalByModel.get(modelId).push(maps[index].get(key));
      }
    }
  }
  const candidateHistoricalMetrics = candidateModelIds.map((modelId) => (
    Object.freeze({
      modelId,
      ...scoreCoreLegacyPointRows(historicalByModel.get(modelId))
    })
  ));
  const minimum = config.horizonRouter.minimumMatureSelectionOrigins;
  if (matureHistoricalOrigins.length < minimum) {
    return Object.freeze({
      selectedModelId: selectFrozenFallback(
        candidateModelIds,
        config
      ).modelId,
      selectionMode: "EARLY_ORIGIN_FALLBACK",
      selectionReason: selectFrozenFallback(
        candidateModelIds,
        config
      ).reason,
      fallbackUsed: true,
      matureHistoricalOriginCount: matureHistoricalOrigins.length,
      matureHistoricalOrigins: Object.freeze(matureHistoricalOrigins),
      candidateModelIds: Object.freeze(candidateModelIds),
      candidateHistoricalMetrics:
        Object.freeze(candidateHistoricalMetrics),
      currentOuterActualReadForSelection: false
    });
  }
  if (candidateModelIds.length === 0) {
    return Object.freeze({
      selectedModelId: null,
      selectionMode: "ABSTAIN",
      selectionReason: "NO_LEGAL_CURRENT_MODEL",
      fallbackUsed: false,
      matureHistoricalOriginCount: matureHistoricalOrigins.length,
      matureHistoricalOrigins: Object.freeze(matureHistoricalOrigins),
      candidateModelIds: Object.freeze([]),
      candidateHistoricalMetrics: Object.freeze([]),
      currentOuterActualReadForSelection: false
    });
  }
  if (candidateModelIds.length === 1) {
    return Object.freeze({
      selectedModelId: candidateModelIds[0],
      selectionMode: "ROLLING_INNER_SELECTION",
      selectionReason: "ONLY_ONE_LEGAL_MODEL",
      fallbackUsed: false,
      matureHistoricalOriginCount: matureHistoricalOrigins.length,
      matureHistoricalOrigins: Object.freeze(matureHistoricalOrigins),
      candidateModelIds: Object.freeze(candidateModelIds),
      candidateHistoricalMetrics:
        Object.freeze(candidateHistoricalMetrics),
      currentOuterActualReadForSelection: false
    });
  }
  const biasThreshold =
    config.horizonRouter.absoluteBiasExclusionThreshold;
  const biasEligible = candidateHistoricalMetrics.filter((row) => (
    row.wape !== null
    && row.signedBias !== null
    && Math.abs(row.signedBias) <= biasThreshold
  ));
  let selected;
  let selectionReason;
  if (biasEligible.length === 0) {
    selected = [...candidateHistoricalMetrics].sort(
      compareAbsoluteBiasThenWape
    )[0];
    selectionReason =
      "ALL_MODELS_EXCEED_ABSOLUTE_BIAS_THRESHOLD_MINIMUM_BIAS_SELECTED";
  } else {
    const byWape = [...biasEligible].sort(compareModelMetrics);
    const pointLeader = byWape[0];
    const nearTies = byWape.filter((row) => (
      relativeWapeDifference(pointLeader.wape, row.wape)
        < config.horizonRouter.wapeTieThreshold
    ));
    selected = nearTies.sort(compareAbsoluteBiasThenWape)[0];
    selectionReason = nearTies.length > 1
      ? "WAPE_WITHIN_ONE_PERCENT_LOWER_ABSOLUTE_BIAS_SELECTED"
      : "LOWEST_HISTORICAL_SAME_CASE_WAPE_AFTER_BIAS_GUARD";
  }
  return Object.freeze({
    selectedModelId: selected?.modelId ?? null,
    selectionMode: selected === undefined
      ? "ABSTAIN"
      : "ROLLING_INNER_SELECTION",
    selectionReason: selected === undefined
      ? "NO_COMPUTABLE_HISTORICAL_METRIC"
      : selectionReason,
    fallbackUsed: false,
    matureHistoricalOriginCount: matureHistoricalOrigins.length,
    matureHistoricalOrigins: Object.freeze(matureHistoricalOrigins),
    candidateModelIds: Object.freeze(candidateModelIds),
    candidateHistoricalMetrics:
      Object.freeze(candidateHistoricalMetrics),
    currentOuterActualReadForSelection: false
  });
}

function buildRollingRouterCell(rows, {
  config,
  evaluationFamily,
  populationId,
  horizonMonths
}) {
  const origins = [...new Set(rows.map((row) => row.origin))]
    .sort(stableTextCompare);
  const selectionRows = [];
  const predictionRows = [];
  const fallbackRows = [];
  const posthocRows = [];
  for (const outerOrigin of origins) {
    const currentRows = rows.filter((row) => row.origin === outerOrigin);
    const selected = selectM2CoreLegacyHorizonModel({
      outerOrigin,
      horizonMonths,
      currentRows: currentRows.map((row) => ({
        modelId: row.modelId
      })),
      historicalRows: rows,
      config
    });
    const selectionId = [
      "ROUTE",
      evaluationFamily,
      populationId,
      `H${horizonMonths}`,
      outerOrigin
    ].join("|");
    selectionRows.push(Object.freeze({
      schema:
        "m2.current.core_legacy_horizon_router_selection.private.v0.1",
      experimentId: M2_CORE_LEGACY_HORIZON_ROUTER_EXPERIMENT_ID,
      routerModelId: config.horizonRouter.modelId,
      selectionId,
      evaluationFamily,
      populationId,
      grain: "WORK_TOTAL",
      outerOrigin,
      horizonMonths,
      selectedModelId: selected.selectedModelId,
      selectionMode: selected.selectionMode,
      selectionReason: selected.selectionReason,
      fallbackUsed: selected.fallbackUsed,
      matureHistoricalOriginCount:
        selected.matureHistoricalOriginCount,
      matureHistoricalOrigins: selected.matureHistoricalOrigins,
      candidateModelIds: selected.candidateModelIds,
      candidateHistoricalMetrics:
        selected.candidateHistoricalMetrics,
      currentOuterActualReadForSelection: false
    }));
    if (selected.selectedModelId !== null) {
      for (const row of currentRows.filter(
        (item) => item.modelId === selected.selectedModelId
      )) {
        predictionRows.push(Object.freeze({
          schema:
            "m2.current.core_legacy_horizon_router_prediction.private.v0.1",
          experimentId: M2_CORE_LEGACY_HORIZON_ROUTER_EXPERIMENT_ID,
          routerModelId: config.horizonRouter.modelId,
          selectionId,
          selectedSourceModelId: selected.selectedModelId,
          selectionMode: selected.selectionMode,
          selectionReason: selected.selectionReason,
          fallbackUsed: selected.fallbackUsed,
          evaluationFamily,
          populationId,
          grain: "WORK_TOTAL",
          origin: row.origin,
          horizonMonths,
          standardWorkId: row.standardWorkId,
          channelUid: null,
          caseKey: row.caseKey,
          pointEstimate: row.pointEstimate,
          actual: row.actual
        }));
      }
    }
    const availableModelIds = [...new Set(currentRows.map(
      (row) => row.modelId
    ))];
    const fallback = selectFrozenFallback(availableModelIds, config);
    if (fallback.modelId !== null) {
      fallbackRows.push(...currentRows.filter(
        (row) => row.modelId === fallback.modelId
      ));
    }
    const posthocModelId = config.horizonRouter
      .posthocReference[String(horizonMonths)];
    posthocRows.push(...currentRows.filter(
      (row) => row.modelId === posthocModelId
    ));
  }
  const publicEvaluation = evaluateRollingRouterCell({
    sourceRows: rows,
    predictionRows,
    fallbackRows,
    posthocRows,
    selectionRows,
    config,
    evaluationFamily,
    populationId,
    horizonMonths
  });
  return {
    public: publicEvaluation,
    selectionRows,
    predictionRows
  };
}

function evaluateRollingRouterCell({
  sourceRows,
  predictionRows,
  fallbackRows,
  posthocRows,
  selectionRows,
  config,
  evaluationFamily,
  populationId,
  horizonMonths
}) {
  const evaluationSetId = [
    "ROUTER",
    evaluationFamily,
    populationId,
    `H${horizonMonths}`
  ].join("-");
  const routerMap = uniqueRowsByCase(predictionRows);
  const byModel = groupByValues(sourceRows, (row) => row.modelId);
  const modelIds = [...byModel.keys()].sort(compareModelIds);
  const modelMaps = new Map(modelIds.map((modelId) => [
    modelId,
    uniqueRowsByCase(byModel.get(modelId))
  ]));
  const commonKeys = intersectKeys([
    routerMap,
    ...modelIds.map((modelId) => modelMaps.get(modelId))
  ]);
  const selectionSummary = summarizeRouterSelections(selectionRows);
  if (routerMap.size === 0 || modelIds.length === 0
    || commonKeys.length === 0) {
    return Object.freeze({
      evaluationSetId,
      evaluationFamily,
      populationId,
      grain: "WORK_TOTAL",
      horizonMonths,
      status: "NOT_COMPARABLE",
      outerOriginCount: new Set(sourceRows.map((row) => row.origin)).size,
      sameCaseCount: 0,
      workCount: 0,
      routerMetrics: null,
      singleModelMetrics: Object.freeze([]),
      strongestSingleModelId: null,
      strongestSingleMetrics: null,
      relativeFva: null,
      absoluteBiasWorsening: null,
      pairedBootstrap: null,
      independentTimeBlocks: Object.freeze([]),
      yearBlocks: Object.freeze([]),
      currentFallbackComparison: null,
      posthocReferenceComparison: null,
      selectionSummary,
      extremeWorkContribution: null,
      fallbackPredictionShare: null,
      decision: Object.freeze({
        status: "HORIZON_ROUTER_NOT_EVALUABLE",
        reason: routerMap.size === 0
          ? "NO_ROUTER_OUTER_PREDICTIONS"
          : "NO_COMMON_SINGLE_MODEL_INTERSECTION"
      })
    });
  }
  const routerRows = commonKeys.map((key) => routerMap.get(key));
  const routerMetrics = Object.freeze({
    modelId: config.horizonRouter.modelId,
    ...scoreCoreLegacyPointRows(routerRows)
  });
  const singleModelMetrics = modelIds.map((modelId) => Object.freeze({
    modelId,
    ...scoreCoreLegacyPointRows(commonKeys.map(
      (key) => modelMaps.get(modelId).get(key)
    ))
  })).sort(compareModelMetrics);
  const strongest = singleModelMetrics[0];
  const strongestMap = modelMaps.get(strongest.modelId);
  const pairedRows = commonKeys.map((key) => {
    const router = routerMap.get(key);
    const baseline = strongestMap.get(key);
    return {
      standardWorkId: router.standardWorkId,
      actual: router.actual,
      candidatePointEstimate: router.pointEstimate,
      baselinePointEstimate: baseline.pointEstimate
    };
  });
  const pairedBootstrap = scoreCoreLegacyPairedBootstrap(pairedRows, {
    iterations: config.sameCaseEvaluation.bootstrap.iterations,
    seed: config.sameCaseEvaluation.bootstrap.seed
      + horizonMonths
      + stableSeedOffset(evaluationSetId)
  });
  const blocks = buildComparisonBlocks({
    sameCaseKeys: commonKeys,
    candidateMap: routerMap,
    baselineMap: strongestMap,
    candidateModelId: config.horizonRouter.modelId,
    baselineModelId: strongest.modelId
  });
  const relativeFva = strongest.wape > 0
    ? (strongest.wape - routerMetrics.wape) / strongest.wape
    : null;
  const absoluteBiasWorsening =
    Math.abs(routerMetrics.signedBias) - Math.abs(strongest.signedBias);
  const extremeWorkContribution =
    buildAnonymousExtremeWorkContribution(routerRows);
  const fallbackPredictionCount = routerRows.filter(
    (row) => row.fallbackUsed === true
  ).length;
  const fallbackPredictionShare = routerRows.length > 0
    ? fallbackPredictionCount / routerRows.length
    : null;
  const decision = decideRollingRouter({
    routerMetrics,
    strongest,
    relativeFva,
    absoluteBiasWorsening,
    pairedBootstrap,
    timeBlocks: blocks.timeBlocks,
    extremeWorkContribution,
    fallbackPredictionShare,
    config
  });
  return Object.freeze({
    evaluationSetId,
    evaluationFamily,
    populationId,
    grain: "WORK_TOTAL",
    horizonMonths,
    status: "COMPUTED_SAME_CASE_INTERSECTION",
    outerOriginCount: new Set(routerRows.map((row) => row.origin)).size,
    sameCaseCount: commonKeys.length,
    workCount: new Set(routerRows.map(
      (row) => row.standardWorkId
    )).size,
    routerMetrics,
    singleModelMetrics: Object.freeze(singleModelMetrics),
    strongestSingleModelId: strongest.modelId,
    strongestSingleMetrics: strongest,
    relativeFva,
    absoluteBiasWorsening,
    pairedBootstrap,
    independentTimeBlocks: blocks.timeBlocks,
    yearBlocks: blocks.yearBlocks,
    currentFallbackComparison: scoreRouterVariantComparison({
      routerMap,
      comparatorRows: fallbackRows,
      comparatorId: "CURRENT_OPERATIONAL_FALLBACK",
      routerModelId: config.horizonRouter.modelId
    }),
    posthocReferenceComparison: scoreRouterVariantComparison({
      routerMap,
      comparatorRows: posthocRows,
      comparatorId: "POSTHOC_REFERENCE",
      routerModelId: config.horizonRouter.modelId
    }),
    selectionSummary,
    extremeWorkContribution,
    fallbackPredictionShare,
    decision
  });
}

function decideRollingRouter({
  relativeFva,
  absoluteBiasWorsening,
  pairedBootstrap,
  timeBlocks,
  extremeWorkContribution,
  fallbackPredictionShare,
  config
}) {
  if (relativeFva === null) {
    return Object.freeze({
      status: "HORIZON_ROUTER_NOT_EVALUABLE",
      reason: "NO_COMPUTABLE_SAME_CASE_SINGLE_MODEL_COMPARISON"
    });
  }
  const materialFva = relativeFva
    >= config.horizonRouter.confirmationMinimumRelativeWapeImprovement;
  const biasGuardPass = absoluteBiasWorsening
    <= config.horizonRouter.maximumAbsoluteBiasWorsening;
  const bootstrapSupports = (
    pairedBootstrap?.status === "COMPUTED"
    && pairedBootstrap?.improvement95?.lower > 0
  );
  const timeBlockWinShare = blockWinShare(
    timeBlocks,
    config.horizonRouter.modelId
  );
  const majorityTimeBlocksImprove = timeBlockWinShare > 0.5;
  const extremeWorkGuardPass = (
    (extremeWorkContribution
      ?.largestWorkAbsoluteErrorContribution ?? 1)
      <= config.horizonRouter
        .maximumSingleWorkAbsoluteErrorContribution
    && (extremeWorkContribution
      ?.topFiveWorksAbsoluteErrorContribution ?? 1)
      <= config.horizonRouter
        .maximumTopFiveWorkAbsoluteErrorContribution
  );
  const fallbackGuardPass = (
    fallbackPredictionShare !== null
    && fallbackPredictionShare <= config.horizonRouter
      .maximumFallbackSelectionShareForConfirmation
  );
  const conditions = Object.freeze({
    materialFva,
    biasGuardPass,
    bootstrapSupports,
    majorityTimeBlocksImprove,
    timeBlockWinShare,
    extremeWorkGuardPass,
    fallbackGuardPass
  });
  if (Object.entries(conditions)
    .filter(([key]) => key !== "timeBlockWinShare")
    .every(([, value]) => value === true)) {
    return Object.freeze({
      status: "HORIZON_ROUTER_CONFIRMED",
      reason: "ALL_PREREGISTERED_ROUTER_CONFIRMATION_GATES_PASS",
      conditions
    });
  }
  const directional = relativeFva > 0
    || bootstrapSupports
    || majorityTimeBlocksImprove;
  return Object.freeze({
    status: directional
      ? "HORIZON_ROUTER_MIXED"
      : "HORIZON_ROUTER_NOT_CONFIRMED",
    reason: directional
      ? "PARTIAL_OR_UNSTABLE_ROUTER_EVIDENCE"
      : "NO_DIRECTIONAL_ROUTER_IMPROVEMENT",
    conditions
  });
}

function scoreRouterVariantComparison({
  routerMap,
  comparatorRows,
  comparatorId,
  routerModelId
}) {
  const comparatorMap = uniqueRowsByCase(comparatorRows);
  const keys = intersectKeys([routerMap, comparatorMap]);
  if (keys.length === 0) {
    return Object.freeze({
      comparatorId,
      status: "NOT_COMPARABLE",
      caseCount: 0
    });
  }
  const routerMetrics = Object.freeze({
    modelId: routerModelId,
    ...scoreCoreLegacyPointRows(keys.map((key) => routerMap.get(key)))
  });
  const comparatorMetrics = Object.freeze({
    modelId: comparatorId,
    ...scoreCoreLegacyPointRows(keys.map(
      (key) => comparatorMap.get(key)
    ))
  });
  return Object.freeze({
    comparatorId,
    status: "COMPUTED_SAME_CASE_INTERSECTION",
    caseCount: keys.length,
    routerMetrics,
    comparatorMetrics,
    relativeFva: comparatorMetrics.wape > 0
      ? (comparatorMetrics.wape - routerMetrics.wape)
        / comparatorMetrics.wape
      : null
  });
}

function summarizeRouterSelections(rows) {
  const selected = rows.filter((row) => row.selectedModelId !== null);
  return Object.freeze({
    selectionCount: rows.length,
    selectedPredictionRouteCount: selected.length,
    abstainCount: rows.length - selected.length,
    fallbackSelectionCount: rows.filter(
      (row) => row.fallbackUsed === true
    ).length,
    rollingInnerSelectionCount: rows.filter(
      (row) => row.selectionMode === "ROLLING_INNER_SELECTION"
    ).length,
    bySelectedModelId: countBy(selected, (row) => row.selectedModelId),
    bySelectionReason: countBy(rows, (row) => row.selectionReason)
  });
}

function publicRouterDecisionMetrics(row) {
  return Object.freeze({
    sameCaseCount: row.sameCaseCount,
    routerWape: row.routerMetrics?.wape ?? null,
    routerSignedBias: row.routerMetrics?.signedBias ?? null,
    strongestSingleModelId: row.strongestSingleModelId,
    strongestSingleWape: row.strongestSingleMetrics?.wape ?? null,
    strongestSingleSignedBias:
      row.strongestSingleMetrics?.signedBias ?? null,
    relativeFva: row.relativeFva,
    absoluteBiasWorsening: row.absoluteBiasWorsening,
    fallbackPredictionShare: row.fallbackPredictionShare,
    decision: row.decision
  });
}

function summarizeRouterTaskStatus(statuses) {
  const evaluable = statuses.filter(
    (status) => status !== "HORIZON_ROUTER_NOT_EVALUABLE"
  );
  if (evaluable.length === 0) {
    return "HORIZON_ROUTER_NOT_EVALUABLE";
  }
  if (
    evaluable.length === statuses.length
    && evaluable.every((status) => status === "HORIZON_ROUTER_CONFIRMED")
  ) {
    return "HORIZON_ROUTER_CONFIRMED";
  }
  if (evaluable.some((status) => (
    status === "HORIZON_ROUTER_CONFIRMED"
    || status === "HORIZON_ROUTER_MIXED"
  ))) {
    return "HORIZON_ROUTER_MIXED";
  }
  return "HORIZON_ROUTER_NOT_CONFIRMED";
}

function selectFrozenFallback(candidateModelIds, config) {
  const available = new Set(candidateModelIds);
  if (available.has(config.horizonRouter.operationalFallbackModelId)) {
    return Object.freeze({
      modelId: config.horizonRouter.operationalFallbackModelId,
      reason:
        "INSUFFICIENT_MATURE_SELECTION_ORIGINS_OPERATIONAL_FALLBACK"
    });
  }
  if (available.has(config.horizonRouter.unsupportedFallbackModelId)) {
    return Object.freeze({
      modelId: config.horizonRouter.unsupportedFallbackModelId,
      reason:
        "OA03_UNSUPPORTED_FOR_CELL_LG01_FALLBACK"
    });
  }
  return Object.freeze({
    modelId: null,
    reason: "NO_SUPPORTED_FROZEN_FALLBACK_ABSTAIN"
  });
}

function compareAbsoluteBiasThenWape(left, right) {
  return Math.abs(left.signedBias ?? Number.POSITIVE_INFINITY)
    - Math.abs(right.signedBias ?? Number.POSITIVE_INFINITY)
    || (left.wape ?? Number.POSITIVE_INFINITY)
      - (right.wape ?? Number.POSITIVE_INFINITY)
    || compareModelIds(left.modelId, right.modelId);
}

function compareModelIds(left, right) {
  return modelTiePriority(left) - modelTiePriority(right)
    || stableTextCompare(left, right);
}

function relativeWapeDifference(best, other) {
  if (!Number.isFinite(best) || !Number.isFinite(other)) {
    return Number.POSITIVE_INFINITY;
  }
  if (other === 0) return best === 0 ? 0 : Number.POSITIVE_INFINITY;
  return Math.max(0, (other - best) / Math.abs(other));
}

function monthSerial(value) {
  const match = /^(\d{4})-(\d{2})$/u.exec(String(value));
  if (!match) {
    throw new M2CoreLegacyHorizonRouterError(
      "m2_core_legacy_router_origin_invalid"
    );
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new M2CoreLegacyHorizonRouterError(
      "m2_core_legacy_router_origin_invalid"
    );
  }
  return year * 12 + month - 1;
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
