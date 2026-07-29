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
