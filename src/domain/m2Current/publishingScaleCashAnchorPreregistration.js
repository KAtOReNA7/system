import { createHash } from "node:crypto";

export const M2_PSC02_PREREGISTRATION_SCHEMA =
  "m2.current.publishing_scale_channel_origin_visible_cash_anchor_preregistration.v0.1";
export const M2_PSC02_PREREGISTRATION_ID =
  "M2-PREREG-PSC02-ORIGIN-VISIBLE-CASH-ANCHOR-01";
export const M2_PSC02_EXPERIMENT_ID =
  "M2-EXP-PUBLISHING-SCALE-CHANNEL-CASH-ANCHOR-02";
export const M2_PSC02_PREREGISTRATION_STATUS =
  "M2_PSC02_ORIGIN_VISIBLE_CASH_ANCHOR_PREREGISTERED_IMPLEMENTATION_NOT_AUTHORIZED";
export const M2_PSC02_ANCHOR_AVAILABLE = "ANCHOR_AVAILABLE";
export const M2_PSC02_ANCHOR_UNAVAILABLE =
  "ANCHOR_UNAVAILABLE_NO_ORIGIN_VISIBLE_POSITIVE_CASH";
export const M2_PSC02_ANCHOR_SOURCE_FORM =
  "POSTING_COMPONENT_ROWS_AGGREGATED_WITHIN_CANONICAL_AS_OF_REVISION_SNAPSHOT";
export const M2_PSC02_EXACT_CASE_COVERAGE_GATE =
  "PSC02_EXACT_CASE_COVERAGE_EQUALS_FROZEN_PSC01_RAW";
export const M2_PSC02_GAMMA_NUMERICAL_FAILURE =
  "PSC02_P_GAMMA_OFFSET_NUMERICAL_FAILURE_NO_CANDIDATE_OUTPUT";

const ARM_IDS = Object.freeze({
  D0: `${M2_PSC02_EXPERIMENT_ID}/D0`,
  D1: `${M2_PSC02_EXPERIMENT_ID}/D1`,
  P: `${M2_PSC02_EXPERIMENT_ID}/P`
});
const ANCHOR_LEVELS = Object.freeze([
  "WORK_CHANNEL",
  "WORK_MECHANISM",
  "WORK",
  "CHANNEL_POOL",
  "MECHANISM_POOL",
  "GLOBAL_POOL"
]);
const FORBIDDEN_AUTHORIZATIONS = Object.freeze([
  "implementation",
  "privateInputRead",
  "fitting",
  "training",
  "tuning",
  "realPrediction",
  "developmentEvaluation",
  "bootstrap",
  "independentEvaluation",
  "laterOrigin",
  "finalHoldout",
  "modelActivation",
  "production",
  "automation",
  "release",
  "database",
  "api",
  "provider",
  "financialUse"
]);

export class M2Psc02PreregistrationContractError extends Error {
  constructor(message) {
    super(message);
    this.name = "M2Psc02PreregistrationContractError";
  }
}

export function validateM2Psc02Preregistration(
  config,
  {
    psc01Config = null,
    baseConfig = null,
    evaluationContract = null,
    businessAcceptanceContract = null
  } = {}
) {
  const failures = [];
  requireEqual(config?.schema, M2_PSC02_PREREGISTRATION_SCHEMA, "schema", failures);
  requireEqual(
    config?.preregistrationId,
    M2_PSC02_PREREGISTRATION_ID,
    "preregistration_id",
    failures
  );
  requireEqual(
    config?.experimentId,
    M2_PSC02_EXPERIMENT_ID,
    "experiment_id",
    failures
  );
  requireEqual(
    config?.status,
    M2_PSC02_PREREGISTRATION_STATUS,
    "status",
    failures
  );
  requireEqual(config?.modelId, null, "model_identity_must_be_null", failures);
  requireEqual(config?.parentModelId, "M2-CHAN-PSC01", "parent_model", failures);
  requireEqual(
    config?.parentRawVariantId,
    "M2-CHAN-PSC01-RAW",
    "parent_raw_variant",
    failures
  );

  for (const key of [
    "mathematicalDesign",
    "preregistrationContract",
    "publicSyntheticReference"
  ]) {
    requireEqual(config?.authorization?.[key], true, `authorization_${key}`, failures);
  }
  for (const key of FORBIDDEN_AUTHORIZATIONS) {
    requireEqual(config?.authorization?.[key], false, `authorization_${key}`, failures);
  }
  for (const [key, expected] of Object.entries({
    modelCreated: false,
    candidateScoreCreated: false,
    evaluationRowCreated: false,
    activeCandidate: null,
    approvedForAutomation: null,
    productionReady: false,
    finalHoldoutOpened: false
  })) {
    requireEqual(config?.identityBoundary?.[key], expected, `identity_${key}`, failures);
  }

  const scope = config?.immutableScientificScope;
  requireEqual(
    scope?.target,
    "future_sales_share_development_modelable_cash",
    "target",
    failures
  );
  requireEqual(
    scope?.actualDefinitionId,
    "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01",
    "actual_definition",
    failures
  );
  requireEqual(scope?.primaryHorizonMonths, 36, "primary_horizon", failures);
  requireJsonEqual(
    scope?.strictHorizonMonths,
    [3, 6, 12, 18, 24],
    "strict_horizons",
    failures
  );
  requireEqual(
    scope?.developmentReplayEvidenceClass,
    "DEVELOPMENT_REPLAY",
    "development_replay_class",
    failures
  );
  requireEqual(
    scope?.newIndependentOriginRequiresSeparateAuthorization,
    true,
    "independent_authorization",
    failures
  );
  requireEqual(scope?.psc01FrozenArtifactsMutable, false, "psc01_immutability", failures);

  const occurrence = config?.occurrenceFreeze;
  requireEqual(occurrence?.sourceModelId, "M2-CHAN-PSC01", "occurrence_source", failures);
  requireEqual(
    occurrence?.sourceVariantId,
    "M2-CHAN-PSC01-RAW",
    "occurrence_source_variant",
    failures
  );
  requireEqual(
    occurrence?.sourceConfig,
    "config/m2-current-publishing-scale-channel.v0.1.json",
    "occurrence_source_config",
    failures
  );
  requireEqual(
    occurrence?.sourceImplementation,
    "src/domain/m2Current/publishingScaleChannelCore.js",
    "occurrence_source_implementation",
    failures
  );
  requireEqual(
    occurrence?.supportContract,
    "config/m2-publishing-scale-statistical-support.v1.json",
    "occurrence_support_contract",
    failures
  );
  requireEqual(
    occurrence?.executionPolicy,
    "config/m2-publishing-scale-execution-policy.v0.3.json",
    "occurrence_execution_policy",
    failures
  );
  requireEqual(
    occurrence?.algorithm,
    "WORK_BALANCED_WEIGHTED_LOGISTIC_IRLS_WITH_PSC01_ONE_CLASS_SMOOTHING",
    "occurrence_algorithm",
    failures
  );
  requireEqual(
    occurrence?.developmentReplayPolicy,
    "JOIN_FROZEN_PSC01_OCCURRENCE_PROBABILITY_BY_EXACT_MONTHLY_CASE_KEY_NO_REFIT",
    "occurrence_development_replay_policy",
    failures
  );
  requireEqual(
    occurrence?.futureAuthorizedOriginPolicy,
    "BYTE_IDENTICAL_PSC01_OCCURRENCE_CODE_CONFIG_SUPPORT_AND_FALLBACK_REQUIRED",
    "occurrence_future_origin_policy",
    failures
  );
  requireEqual(occurrence?.probabilityTransform, "IDENTITY", "occurrence_transform", failures);
  requireEqual(occurrence?.calibrationAllowed, false, "occurrence_calibration", failures);
  requireEqual(
    occurrence?.refitForDevelopmentReplayAllowed,
    false,
    "occurrence_replay_refit",
    failures
  );
  requireEqual(occurrence?.multiplyCount, 1, "occurrence_multiply_count", failures);
  requireEqual(
    occurrence?.parity?.comparison,
    "IEEE754_BINARY64_BIT_PATTERN",
    "occurrence_parity_comparison",
    failures
  );
  requireEqual(occurrence?.parity?.absoluteTolerance, 0, "occurrence_absolute_tolerance", failures);
  requireEqual(occurrence?.parity?.relativeTolerance, 0, "occurrence_relative_tolerance", failures);
  requireEqual(
    occurrence?.parity?.requiredForEveryFrozenDevelopmentMonthlyCase,
    true,
    "occurrence_parity_required_for_every_case",
    failures
  );
  requireEqual(
    occurrence?.parity?.failureStatus,
    "PSC02_OCCURRENCE_PARITY_FAILED",
    "occurrence_parity_failure_status",
    failures
  );
  requireEqual(occurrence?.taxonomyUsed, false, "occurrence_taxonomy", failures);
  requireEqual(occurrence?.fallbackChanged, false, "occurrence_fallback", failures);

  if (psc01Config !== null) {
    requireEqual(
      occurrence?.supportContract,
      psc01Config.supportContract,
      "occurrence_support_contract_drift",
      failures
    );
    requireEqual(
      occurrence?.executionPolicy,
      psc01Config.executionPolicy,
      "occurrence_execution_policy_drift",
      failures
    );
    requireJsonEqual(
      occurrence?.oneClassSmoothing,
      psc01Config.oneClassSmoothing,
      "occurrence_one_class_smoothing_drift",
      failures
    );
    requireJsonEqual(
      occurrence?.numerical,
      {
        maximumIterations: psc01Config.numerical.maximumIterations,
        coefficientTolerance: psc01Config.numerical.coefficientTolerance,
        pivotTolerance: psc01Config.numerical.pivotTolerance,
        minimumLogisticVariance:
          psc01Config.numerical.minimumLogisticVariance
      },
      "occurrence_numerical_contract_drift",
      failures
    );
    requireJsonEqual(
      occurrence?.selection,
      {
        outerPrimaryWorkFoldCount:
          psc01Config.selection.outerPrimaryWorkFoldCount,
        innerWorkFoldCount: psc01Config.selection.innerWorkFoldCount,
        innerWorkFoldRepeats: psc01Config.selection.innerWorkFoldRepeats
      },
      "occurrence_selection_contract_drift",
      failures
    );
    requireJsonEqual(
      occurrence?.featureOrder,
      psc01Config.featureOrder,
      "occurrence_feature_order_drift",
      failures
    );
    requireJsonEqual(
      occurrence?.basisProfiles,
      psc01Config.basisProfiles,
      "occurrence_basis_drift",
      failures
    );
    requireJsonEqual(
      occurrence?.nodeContracts,
      occurrenceNodeContracts(psc01Config),
      "occurrence_node_contract_drift",
      failures
    );
    requireEqual(scope?.target, psc01Config.target, "psc01_target_drift", failures);
    requireEqual(
      scope?.actualDefinitionId,
      psc01Config.actualDefinitionId,
      "psc01_actual_definition_drift",
      failures
    );
    requireEqual(
      scope?.trainingGrain,
      psc01Config.dataContract.trainingGrain,
      "psc01_training_grain_drift",
      failures
    );
    requireEqual(
      scope?.uniqueKey,
      psc01Config.dataContract.uniqueKey,
      "psc01_unique_key_drift",
      failures
    );
    requireJsonEqual(
      config?.trainingAndSelection?.strictOrigins,
      psc01Config.selection.strictOrigins,
      "psc01_strict_origin_drift",
      failures
    );
  }
  if (baseConfig !== null) {
    requireJsonEqual(
      config?.trainingAndSelection?.primaryOrigins,
      baseConfig.dataContract.primaryOrigins,
      "base_primary_origin_drift",
      failures
    );
  }

  const anchor = config?.cashAnchor;
  requireEqual(anchor?.unit, "CNY_PER_POSITIVE_WORK_CHANNEL_MONTH", "anchor_unit", failures);
  requireEqual(
    anchor?.sourceAuthority?.form,
    M2_PSC02_ANCHOR_SOURCE_FORM,
    "anchor_source_authority_form",
    failures
  );
  requireEqual(
    anchor?.sourceAuthority?.componentAggregationRequired,
    true,
    "anchor_component_aggregation_required",
    failures
  );
  requireEqual(
    anchor?.sourceAuthority?.directComponentMeanAllowed,
    false,
    "anchor_component_mean_forbidden",
    failures
  );
  requireEqual(
    anchor?.sourceAuthority?.publicCodeEvidence,
    "scripts/m2-current/materialize_human_anchored_cases.py#_map_sales_share_rows->_monthly_panel",
    "anchor_source_authority_public_code_evidence",
    failures
  );
  requireEqual(
    anchor?.sourceAuthority?.componentIdentityField,
    "componentId",
    "anchor_component_identity_field",
    failures
  );
  requireEqual(
    anchor?.sourceAuthority?.revisionIdentityField,
    "revisionId",
    "anchor_revision_identity_field",
    failures
  );
  requireJsonEqual(
    anchor?.sourceAuthority?.revisionMetadataFields,
    ["effectiveAt", "availableAt"],
    "anchor_revision_metadata_fields",
    failures
  );
  requireEqual(
    anchor?.anchorObservationGrain,
    "standardWorkId|channelUid|cashMonth|cashCategory|currency",
    "anchor_monthly_observation_grain",
    failures
  );
  requireEqual(
    anchor?.positiveObservationCountRule,
    "COUNT_STRICTLY_POSITIVE_CANONICAL_MONTHLY_NATURAL_KEYS_AFTER_VISIBLE_REVISION_SELECTION",
    "anchor_positive_observation_count_rule",
    failures
  );
  requireEqual(anchor?.lookbackMonths, 12, "anchor_lookback", failures);
  requireEqual(
    anchor?.timeDecay,
    "NONE_EQUAL_POSITIVE_WORK_CHANNEL_MONTH_WEIGHT",
    "anchor_time_decay",
    failures
  );
  requireEqual(
    anchor?.aggregation,
    "UNWEIGHTED_ARITHMETIC_MEAN_OF_STRICTLY_POSITIVE_MONTHLY_AMOUNTS",
    "anchor_arithmetic_scale",
    failures
  );
  requireEqual(anchor?.geometricOrLog1pCenterAllowed, false, "anchor_geometric", failures);
  requireEqual(anchor?.applyCount, 1, "anchor_apply_count", failures);
  requireJsonEqual(anchor?.fallbackOrder, ANCHOR_LEVELS, "anchor_fallback_order", failures);
  requireEqual(anchor?.ownScaleSupport?.minimumCompleteBillMonths, 3, "anchor_bill_months", failures);
  requireEqual(anchor?.ownScaleSupport?.minimumPositiveObservations, 1, "anchor_positive_support", failures);
  requireEqual(anchor?.pooledScaleSupport?.minimumDistinctWorks, 8, "anchor_pool_works", failures);
  requireEqual(
    anchor?.pooledScaleSupport?.minimumPositiveDistinctWorks,
    6,
    "anchor_pool_positive_works",
    failures
  );
  requireEqual(anchor?.eligibility?.futureNewWorkBehavior, "ABSTAIN", "future_work", failures);
  requireEqual(
    anchor?.eligibility?.futureFirstObservedChannelBehavior,
    "ABSTAIN",
    "future_channel",
    failures
  );
  requireEqual(anchor?.eligibility?.zeroPredictionImputationAllowed, false, "anchor_zero_imputation", failures);
  requireEqual(anchor?.clipping?.minimumCny, 0.01, "anchor_floor", failures);
  requireEqual(anchor?.clipping?.postHocScalarAllowed, false, "anchor_posthoc_scalar", failures);
  requireEqual(anchor?.manifest?.inputOrderAffectsDigest, false, "anchor_digest_order", failures);

  const amount = config?.amountDesign;
  requireEqual(amount?.exposure, 1, "amount_exposure", failures);
  requireEqual(amount?.occurrenceMultiplyCount, 1, "amount_occurrence_count", failures);
  requireEqual(amount?.anchorApplyCount, 1, "amount_anchor_count", failures);
  requireEqual(amount?.globalOrPerWorkPostHocCalibrationAllowed, false, "posthoc_calibration", failures);
  requireEqual(amount?.taxonomy, "REPORT_ONLY", "taxonomy_status", failures);
  for (const key of [
    "taxonomyUsedByPrior",
    "taxonomyUsedByFeature",
    "taxonomyUsedByFallback",
    "taxonomyUsedByAmountCorrection",
    "taxonomyUsedBySelection"
  ]) {
    requireEqual(amount?.[key], false, key, failures);
  }
  requireJsonEqual(amount?.residualPredictionClip, [-30, 30], "residual_clip", failures);
  requireEqual(
    amount?.residualPredictionClipRole,
    "FINAL_PREDICTION_ONLY_NOT_FIT_OBJECTIVE_GRADIENT_OR_HESSIAN",
    "residual_clip_role",
    failures
  );
  requireEqual(amount?.estimators?.D0?.machineName, "ANCHOR_ONLY", "d0_identity", failures);
  requireEqual(
    amount?.estimators?.D1?.machineName,
    "ANCHORED_LOG_RATIO_RIDGE",
    "d1_identity",
    failures
  );
  requireEqual(
    amount?.estimators?.P?.machineName,
    "ANCHORED_GAMMA_OFFSET",
    "p_identity",
    failures
  );
  requireEqual(
    amount?.estimators?.P?.distribution,
    "QUASI_GAMMA_VARIANCE_PROPORTIONAL_TO_MU_SQUARED",
    "p_distribution",
    failures
  );
  requireEqual(amount?.estimators?.P?.link, "LOG", "p_link", failures);
  requireEqual(
    amount?.estimators?.P?.offset,
    "log(A)_FIXED_COEFFICIENT_ONE",
    "p_offset",
    failures
  );
  requireJsonEqual(amount?.estimators?.P?.regularizationGrid, [1, 3], "p_lambda_grid", failures);
  requireEqual(
    amount?.estimators?.P?.fitLinearPredictorClip,
    "NONE_UNCLIPPED_X_BETA",
    "p_fit_linear_predictor_clip",
    failures
  );
  requireEqual(
    amount?.estimators?.P?.numericEvaluation,
    "LOG_DOMAIN_RATIO_WITH_EXPLICIT_NONFINITE_FAILURE",
    "p_numeric_evaluation",
    failures
  );
  requireEqual(
    amount?.estimators?.P?.globalNumericFailureStatus,
    M2_PSC02_GAMMA_NUMERICAL_FAILURE,
    "p_global_numeric_failure_status",
    failures
  );
  requireEqual(amount?.estimators?.P?.silentEstimatorSwitchAllowed, false, "p_silent_switch", failures);
  requireEqual(amount?.estimators?.P?.diagnosticArmReplacementAllowed, false, "p_diagnostic_replace", failures);
  requireEqual(amount?.estimators?.D0?.mayReplaceMainDesign, false, "d0_replace", failures);
  requireEqual(amount?.estimators?.D1?.mayReplaceMainDesign, false, "d1_replace", failures);

  const selection = config?.trainingAndSelection;
  requireEqual(selection?.primaryOuterWorkFoldCount, 5, "primary_outer_folds", failures);
  requireEqual(selection?.primaryInnerWorkFoldCount, 3, "primary_inner_folds", failures);
  requireEqual(selection?.primaryInnerWorkFoldRepeats, 3, "primary_inner_repeats", failures);
  requireJsonEqual(selection?.hyperparameterGrid, [1, 3], "selection_grid", failures);
  requireEqual(selection?.outerOutcomeUsedForSelection, false, "outer_selection", failures);
  requireEqual(selection?.estimatorSwitchFromOuterOutcomeAllowed, false, "outer_estimator_switch", failures);
  requireEqual(selection?.anchorWindowSwitchFromOuterOutcomeAllowed, false, "outer_anchor_switch", failures);
  requireEqual(selection?.fallbackSwitchFromOuterOutcomeAllowed, false, "outer_fallback_switch", failures);

  const evaluation = config?.frozenEvaluationContract;
  requireEqual(
    evaluation?.status,
    "FROZEN_BEFORE_ANY_REAL_PSC02_PREDICTION",
    "evaluation_freeze",
    failures
  );
  if (!evaluation?.correctnessGates?.includes(
    M2_PSC02_EXACT_CASE_COVERAGE_GATE
  )) {
    failures.push("exact_case_coverage_gate_missing");
  }
  requireEqual(
    evaluation?.exactCaseCoverage?.candidatePopulation,
    "FROZEN_M2_CHAN_PSC01_RAW_MONTHLY_CASE_KEYS",
    "exact_case_candidate_population",
    failures
  );
  requireEqual(
    evaluation?.exactCaseCoverage?.intersectionScoringAllowed,
    false,
    "exact_case_intersection_scoring",
    failures
  );
  requireEqual(
    evaluation?.exactCaseCoverage?.abstentionZeroImputationAllowed,
    false,
    "exact_case_zero_imputation",
    failures
  );
  requireEqual(
    evaluation?.exactCaseCoverage?.anchorUnavailableDecision,
    "PSC02_DEVELOPMENT_NOT_SUPPORTED",
    "exact_case_anchor_unavailable_decision",
    failures
  );
  requireEqual(evaluation?.diagnosticArmsParticipateInCandidateSelection, false, "diagnostic_selection", failures);
  requireEqual(
    evaluation?.psc01ScaleRecoveryGates?.primaryRelativeWapeFvaMinimum,
    0.1,
    "primary_scale_fva",
    failures
  );
  requireEqual(
    evaluation?.psc01ScaleRecoveryGates?.strictAggregateRelativeWapeFvaMinimum,
    0.1,
    "strict_scale_fva",
    failures
  );
  requireJsonEqual(
    evaluation?.psc01ScaleRecoveryGates?.primaryPredictionActualCashRatioInclusive,
    [0.75, 1.25],
    "primary_cash_ratio",
    failures
  );
  requireJsonEqual(
    evaluation?.psc01ScaleRecoveryGates?.eachStrictHorizonPredictionActualCashRatioInclusive,
    [0.67, 1.5],
    "strict_cash_ratio",
    failures
  );
  requireEqual(
    evaluation?.psc01ScaleRecoveryGates?.normalizedChannelCompositionMaximumWapeHarmAbsolute,
    0.02,
    "composition_guardrail",
    failures
  );
  requireEqual(
    evaluation?.normalizedCompositionRole,
    "POST_HOC_DIAGNOSTIC_NOT_MODEL_EVIDENCE_NOT_CANDIDATE_SCORE",
    "composition_role",
    failures
  );
  if (evaluationContract !== null) {
    requireEqual(
      evaluation?.bootstrap?.iterations,
      evaluationContract.uncertainty.bootstrapIterations,
      "evaluation_bootstrap_iterations",
      failures
    );
    requireEqual(
      evaluation?.bootstrap?.resamplingUnit,
      evaluationContract.uncertainty.workLevelUnit,
      "evaluation_bootstrap_unit",
      failures
    );
    requireEqual(
      evaluation?.privacy?.minimumCaseCount,
      evaluationContract.publicPrivacy.minimumCaseCount,
      "privacy_cases",
      failures
    );
    requireEqual(
      evaluation?.privacy?.minimumWorkCount,
      evaluationContract.publicPrivacy.minimumWorkCount,
      "privacy_works",
      failures
    );
  }
  if (businessAcceptanceContract !== null) {
    requireEqual(
      evaluation?.lg01SuperiorityGates?.combinationRule,
      businessAcceptanceContract.candidateSuperiority.combinationRule,
      "business_combination_rule",
      failures
    );
    requireJsonEqual(
      evaluation?.lg01SuperiorityGates?.requirements,
      businessAcceptanceContract.candidateSuperiority.requirements,
      "business_requirements",
      failures
    );
    requireEqual(
      evaluation?.lg01SuperiorityGates
        ?.materialityMinimumPairedAbsoluteErrorReductionOverPairedActual,
      businessAcceptanceContract.candidateSuperiority.materiality
        .minimumPairedAbsoluteErrorReductionOverPairedActual,
      "business_materiality",
      failures
    );
  }

  requireEqual(
    config?.dependencyBoundary?.productionRunnerImported,
    false,
    "production_runner_dependency",
    failures
  );
  requireEqual(
    config?.dependencyBoundary?.privateLoaderImported,
    false,
    "private_loader_dependency",
    failures
  );
  requireEqual(
    config?.dependencyBoundary?.providerImported,
    false,
    "provider_dependency",
    failures
  );
  for (const forbidden of [
    "LG01_PREDICTION",
    "EVALUATION_ACTUAL_SCALAR",
    "FUTURE_BILLING",
    "LATER_REVISION_NOT_VISIBLE_AT_ORIGIN",
    "TAXONOMY"
  ]) {
    if (!config?.dependencyBoundary?.forbiddenModelInputs?.includes(forbidden)) {
      failures.push(`forbidden_dependency_missing:${forbidden}`);
    }
  }
  requireEqual(
    config?.publicSyntheticContract?.requiredInvariantCount,
    22,
    "public_synthetic_invariant_count",
    failures
  );

  if (failures.length > 0) {
    throw new M2Psc02PreregistrationContractError(
      `m2_psc02_preregistration_invalid:${failures.join(",")}`
    );
  }
  return true;
}

export function buildM2Psc02OriginVisibleCashAnchor(
  rows,
  {
    origin,
    standardWorkId,
    channelUid,
    mechanism,
    originObservedPositiveChannel = true
  },
  config
) {
  validateAnchorQuery({ origin, standardWorkId, channelUid, mechanism });
  if (originObservedPositiveChannel !== true) {
    return unavailableAnchor(origin, "future_or_never_observed_positive_channel");
  }
  const visibleRows = canonicalVisibleAnchorRows(rows, origin, config);
  const lookbackRows = visibleRows.filter((row) => (
    monthIndex(row.cashMonth) >= monthIndex(origin) - config.cashAnchor.lookbackMonths + 1
    && monthIndex(row.cashMonth) <= monthIndex(origin)
  ));
  const originVisiblePositiveForTarget = visibleRows.some((row) => (
    row.standardWorkId === standardWorkId
    && row.channelUid === channelUid
    && row.positiveCash > 0
  ));
  if (!originVisiblePositiveForTarget) {
    return unavailableAnchor(origin, "no_origin_visible_positive_cash_for_target_channel");
  }
  const selectors = {
    WORK_CHANNEL: (row) => (
      row.standardWorkId === standardWorkId && row.channelUid === channelUid
    ),
    WORK_MECHANISM: (row) => (
      row.standardWorkId === standardWorkId && row.mechanism === mechanism
    ),
    WORK: (row) => row.standardWorkId === standardWorkId,
    CHANNEL_POOL: (row) => row.channelUid === channelUid,
    MECHANISM_POOL: (row) => row.mechanism === mechanism,
    GLOBAL_POOL: () => true
  };
  const globalPositiveMaximum = Math.max(
    ...lookbackRows.filter((row) => row.positiveCash > 0)
      .map((row) => row.positiveCash),
    Number.NEGATIVE_INFINITY
  );
  for (const level of config.cashAnchor.fallbackOrder) {
    const selected = lookbackRows.filter(selectors[level]);
    const positive = selected.filter((row) => row.positiveCash > 0);
    const support = anchorSupport(selected, positive);
    if (!anchorLevelEligible(level, support, config)) {
      continue;
    }
    const rawValue = mean(positive.map((row) => row.positiveCash));
    const value = Math.min(
      globalPositiveMaximum,
      Math.max(config.cashAnchor.clipping.minimumCny, rawValue)
    );
    if (!Number.isFinite(value) || value <= 0) {
      continue;
    }
    return Object.freeze({
      status: M2_PSC02_ANCHOR_AVAILABLE,
      origin,
      level,
      value,
      rawArithmeticMean: rawValue,
      unit: config.cashAnchor.unit,
      support: Object.freeze(support),
      timeDecay: config.cashAnchor.timeDecay,
      lookbackMonths: config.cashAnchor.lookbackMonths,
      observationGrain: config.cashAnchor.anchorObservationGrain,
      sourceAuthorityForm: config.cashAnchor.sourceAuthority.form,
      taxonomyUsed: false,
      evaluationActualUsed: false
    });
  }
  return unavailableAnchor(origin, "all_preregistered_anchor_levels_ineligible");
}

export function canonicalM2Psc02AnchorInputDigest(rows, origin, config) {
  const canonical = canonicalVisibleAnchorRows(rows, origin, config);
  return sha256(stableStringify(canonical));
}

export function createM2Psc02AnchorManifest({
  origin,
  config,
  schema,
  sourceAuthorityDigestRefs,
  canonicalVisibleInputSha256,
  anchorRows,
  codeSha256,
  runtimeReceipt
}) {
  for (const digest of [
    canonicalVisibleInputSha256,
    codeSha256
  ]) {
    requireSha256(digest);
  }
  if (!Array.isArray(sourceAuthorityDigestRefs)
      || sourceAuthorityDigestRefs.length === 0) {
    throw new M2Psc02PreregistrationContractError(
      "m2_psc02_source_authority_digest_refs_required"
    );
  }
  return Object.freeze({
    schema: "m2.psc02.origin_visible_cash_anchor_manifest.v0.1",
    preregistrationId: M2_PSC02_PREREGISTRATION_ID,
    origin,
    configSha256: sha256(stableStringify(config)),
    schemaSha256: sha256(stableStringify(schema)),
    sourceAuthorityDigestRefs: Object.freeze([...sourceAuthorityDigestRefs].sort()),
    canonicalVisibleInputSha256,
    anchorRowsSha256: sha256(stableStringify(
      [...anchorRows].sort((left, right) => (
        stableStringify(left).localeCompare(stableStringify(right))
      ))
    )),
    codeSha256,
    runtimeReceipt: Object.freeze({...runtimeReceipt})
  });
}

export function assertM2Psc02OccurrenceParity(psc01Rows, psc02Rows) {
  const left = indexUniqueCaseRows(psc01Rows, "psc01_occurrence");
  const right = indexUniqueCaseRows(psc02Rows, "psc02_occurrence");
  if (psc01Rows.length !== psc02Rows.length
      || left.size !== psc01Rows.length
      || right.size !== psc02Rows.length
      || left.size !== right.size) {
    throw new M2Psc02PreregistrationContractError(
      "m2_psc02_occurrence_parity_case_count_mismatch"
    );
  }
  for (const [caseKey, leftRow] of left) {
    const rightRow = right.get(caseKey);
    if (rightRow === undefined) {
      throw new M2Psc02PreregistrationContractError(
        `m2_psc02_occurrence_parity_key_set_mismatch:${caseKey}`
      );
    }
    const leftProbability = requireProbability(
      leftRow.occurrenceProbability,
      "psc01_occurrenceProbability"
    );
    const rightProbability = requireProbability(
      rightRow.occurrenceProbability,
      "psc02_occurrenceProbability"
    );
    if (doubleBits(leftProbability) !== doubleBits(rightProbability)) {
      throw new M2Psc02PreregistrationContractError(
        `m2_psc02_occurrence_parity_failed:${caseKey}`
      );
    }
  }
  return true;
}

export function evaluateM2Psc02ExactCaseCoverage(
  frozenPsc01RawRows,
  psc02PrimaryRows
) {
  const frozen = indexUniqueCaseRows(
    frozenPsc01RawRows,
    "frozen_psc01_raw_coverage"
  );
  const candidate = indexUniqueCaseRows(
    psc02PrimaryRows,
    "psc02_primary_coverage"
  );
  if (frozenPsc01RawRows.length !== psc02PrimaryRows.length
      || frozen.size !== candidate.size) {
    throw new M2Psc02PreregistrationContractError(
      "m2_psc02_exact_case_coverage_count_mismatch"
    );
  }
  for (const caseKey of frozen.keys()) {
    if (!candidate.has(caseKey)) {
      throw new M2Psc02PreregistrationContractError(
        `m2_psc02_exact_case_coverage_key_set_mismatch:${caseKey}`
      );
    }
  }
  const unavailableCount = [...candidate.values()].filter((row) => (
    row.anchorStatus !== M2_PSC02_ANCHOR_AVAILABLE
    || row.abstained !== false
    || !Number.isFinite(row.positivePoint)
  )).length;
  if (unavailableCount > 0) {
    return Object.freeze({
      correctnessGate: M2_PSC02_EXACT_CASE_COVERAGE_GATE,
      status: "FAILED_ANCHOR_UNAVAILABLE_IN_FROZEN_POPULATION",
      passed: false,
      frozenCaseCount: frozen.size,
      psc02CaseCount: candidate.size,
      anchorUnavailableCaseCount: unavailableCount,
      candidateScoreAllowed: false,
      intersectionScoringUsed: false,
      abstentionZeroImputationUsed: false,
      developmentDecision: "PSC02_DEVELOPMENT_NOT_SUPPORTED"
    });
  }
  return Object.freeze({
    correctnessGate: M2_PSC02_EXACT_CASE_COVERAGE_GATE,
    status: "PASSED_EXACT_KEY_SET_AND_COMPLETE_ANCHOR_COVERAGE",
    passed: true,
    frozenCaseCount: frozen.size,
    psc02CaseCount: candidate.size,
    anchorUnavailableCaseCount: 0,
    candidateScoreAllowed: true,
    intersectionScoringUsed: false,
    abstentionZeroImputationUsed: false,
    developmentDecision: null
  });
}

export function predictM2Psc02MonthlyReference({
  armId,
  occurrenceProbability,
  anchor,
  residualLogMultiplier = 0
}) {
  if (!Object.values(ARM_IDS).includes(armId)) {
    throw new M2Psc02PreregistrationContractError(
      "m2_psc02_reference_arm_invalid"
    );
  }
  if (!Number.isFinite(occurrenceProbability)
      || occurrenceProbability < 0
      || occurrenceProbability > 1) {
    throw new M2Psc02PreregistrationContractError(
      "m2_psc02_reference_occurrence_invalid"
    );
  }
  const anchorValue = typeof anchor === "number" ? anchor : anchor?.value;
  const anchorStatus = typeof anchor === "number"
    ? M2_PSC02_ANCHOR_AVAILABLE
    : anchor?.status;
  if (anchorStatus !== M2_PSC02_ANCHOR_AVAILABLE) {
    return Object.freeze({
      armId,
      status: M2_PSC02_ANCHOR_UNAVAILABLE,
      occurrenceProbability,
      anchor: null,
      residualLogMultiplier: null,
      conditionalPositiveAmount: null,
      positivePoint: null,
      abstained: true
    });
  }
  if (!Number.isFinite(anchorValue) || anchorValue <= 0) {
    throw new M2Psc02PreregistrationContractError(
      "m2_psc02_reference_anchor_invalid"
    );
  }
  if (!Number.isFinite(residualLogMultiplier)) {
    throw new M2Psc02PreregistrationContractError(
      "m2_psc02_reference_residual_invalid"
    );
  }
  if (armId === ARM_IDS.D0 && residualLogMultiplier !== 0) {
    throw new M2Psc02PreregistrationContractError(
      "m2_psc02_anchor_only_residual_must_be_zero"
    );
  }
  const clippedResidual = clamp(residualLogMultiplier, -30, 30);
  const conditionalPositiveAmount = anchorValue * Math.exp(clippedResidual);
  const positivePoint = occurrenceProbability * conditionalPositiveAmount;
  return Object.freeze({
    armId,
    status: "REFERENCE_PREDICTION_AVAILABLE",
    occurrenceProbability,
    anchor: anchorValue,
    residualLogMultiplier: clippedResidual,
    conditionalPositiveAmount,
    positivePoint,
    occurrenceMultiplyCount: 1,
    anchorApplyCount: 1,
    abstained: false
  });
}

export function aggregateM2Psc02HorizonReference(monthlyRows, horizonMonths) {
  if (!Number.isInteger(horizonMonths) || horizonMonths <= 0) {
    throw new M2Psc02PreregistrationContractError(
      "m2_psc02_horizon_invalid"
    );
  }
  if (!Array.isArray(monthlyRows) || monthlyRows.length !== horizonMonths) {
    throw new M2Psc02PreregistrationContractError(
      "m2_psc02_horizon_month_count_mismatch"
    );
  }
  const indices = monthlyRows.map((row) => row.futureMonthIndex).sort(
    (left, right) => left - right
  );
  if (indices.some((value, index) => value !== index + 1)) {
    throw new M2Psc02PreregistrationContractError(
      "m2_psc02_horizon_month_identity_invalid"
    );
  }
  if (monthlyRows.some((row) => !Number.isFinite(row.positivePoint))) {
    throw new M2Psc02PreregistrationContractError(
      "m2_psc02_horizon_prediction_missing"
    );
  }
  return Object.freeze({
    horizonMonths,
    positivePoint: sum(monthlyRows.map((row) => row.positivePoint)),
    aggregation: "SUM_MONTHLY_EXPECTED_POSITIVE_CASH_ONCE",
    monthlyRowCount: monthlyRows.length
  });
}

export function fitM2Psc02AnchoredLogRatioRidgeReference(
  rows,
  {lambda = 1, pivotTolerance = 1e-12} = {}
) {
  requireReferenceLambda(lambda);
  const prepared = prepareReferenceRows(rows);
  const matrix = prepared.design;
  const response = prepared.rows.map((row) => Math.log(
    row.actualPositive / row.anchor
  ));
  const dimension = matrix[0].length;
  const lhs = zeros(dimension, dimension);
  const rhs = Array(dimension).fill(0);
  for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
    const x = matrix[rowIndex];
    const weight = prepared.weights[rowIndex];
    for (let left = 0; left < dimension; left += 1) {
      rhs[left] += weight * x[left] * response[rowIndex];
      for (let right = 0; right < dimension; right += 1) {
        lhs[left][right] += weight * x[left] * x[right];
      }
    }
  }
  for (let index = 1; index < dimension; index += 1) {
    lhs[index][index] += lambda;
  }
  const coefficients = solveLinear(lhs, rhs, pivotTolerance);
  return Object.freeze({
    armId: ARM_IDS.D1,
    status: "CONVERGED",
    lambda,
    coefficients: Object.freeze(coefficients),
    standardizer: prepared.standardizer,
    sampleWeight: "EQUAL_TOTAL_WEIGHT_PER_STANDARD_WORK_NORMALIZED_TO_SUM_ONE"
  });
}

export function fitM2Psc02AnchoredGammaOffsetReference(
  rows,
  {
    lambda = 1,
    maximumIterations = 200,
    maximumStepHalvings = 20,
    coefficientTolerance = 1e-10,
    relativeObjectiveTolerance = 1e-12,
    pivotTolerance = 1e-12
  } = {}
) {
  requireReferenceLambda(lambda);
  const prepared = prepareReferenceRows(rows);
  const matrix = prepared.design;
  const dimension = matrix[0].length;
  let coefficients = Array(dimension).fill(0);
  let currentEvaluation;
  try {
    currentEvaluation = gammaEvaluation(
      prepared.rows,
      matrix,
      prepared.weights,
      coefficients,
      lambda
    );
  } catch (error) {
    return gammaFailure("INITIAL_UNCLIPPED_TARGET_NONFINITE", {
      iteration: 0,
      lambda,
      errorCode: error.message,
      standardizer: prepared.standardizer
    });
  }
  const objectiveTrace = [currentEvaluation.objective];
  for (let iteration = 1; iteration <= maximumIterations; iteration += 1) {
    let delta;
    try {
      delta = solveLinear(
        currentEvaluation.hessian,
        currentEvaluation.gradient,
        pivotTolerance
      );
    } catch {
      return gammaFailure("SINGULAR_UNCLIPPED_TARGET_HESSIAN", {
        iteration,
        lambda,
        standardizer: prepared.standardizer
      });
    }
    let accepted = false;
    let nextCoefficients = coefficients;
    let nextEvaluation = currentEvaluation;
    let scale = 1;
    let nonfiniteCandidateCount = 0;
    for (let halving = 0; halving <= maximumStepHalvings; halving += 1) {
      const candidate = coefficients.map(
        (value, index) => value - scale * delta[index]
      );
      let candidateEvaluation;
      try {
        candidateEvaluation = gammaEvaluation(
          prepared.rows,
          matrix,
          prepared.weights,
          candidate,
          lambda
        );
      } catch {
        nonfiniteCandidateCount += 1;
        scale /= 2;
        continue;
      }
      if (candidateEvaluation.objective
          <= currentEvaluation.objective + 1e-15) {
        accepted = true;
        nextCoefficients = candidate;
        nextEvaluation = candidateEvaluation;
        break;
      }
      scale /= 2;
    }
    if (!accepted) {
      return gammaFailure(
        nonfiniteCandidateCount > 0
          ? "NONFINITE_UNCLIPPED_TARGET_DURING_STEP_HALVING"
          : "OBJECTIVE_STEP_HALVING_EXHAUSTED",
        {
        iteration,
        lambda,
        nonfiniteCandidateCount,
        standardizer: prepared.standardizer
        }
      );
    }
    const coefficientChange = Math.max(...nextCoefficients.map(
      (value, index) => Math.abs(value - coefficients[index])
    ));
    const relativeObjectiveChange = Math.abs(
      nextEvaluation.objective - currentEvaluation.objective
    ) / Math.max(1, Math.abs(currentEvaluation.objective));
    coefficients = nextCoefficients;
    currentEvaluation = nextEvaluation;
    objectiveTrace.push(currentEvaluation.objective);
    if (coefficientChange <= coefficientTolerance
        && relativeObjectiveChange <= relativeObjectiveTolerance) {
      return Object.freeze({
        armId: ARM_IDS.P,
        status: "CONVERGED",
        lambda,
        iterations: iteration,
        objective: currentEvaluation.objective,
        objectiveTrace: Object.freeze(objectiveTrace),
        coefficients: Object.freeze(coefficients),
        standardizer: prepared.standardizer,
        sampleWeight: "EQUAL_TOTAL_WEIGHT_PER_STANDARD_WORK_NORMALIZED_TO_SUM_ONE",
        offsetCoefficient: 1,
        estimatorSwitchUsed: false
      });
    }
  }
  return gammaFailure("MAXIMUM_ITERATIONS_WITHOUT_CONVERGENCE", {
    iteration: maximumIterations,
    lambda,
    objectiveTrace: Object.freeze(objectiveTrace),
    standardizer: prepared.standardizer
  });
}

export function evaluateM2Psc02GammaObjectiveReference(
  rows,
  coefficients,
  {lambda = 1} = {}
) {
  requireReferenceLambda(lambda);
  const prepared = prepareReferenceRows(rows);
  if (!Array.isArray(coefficients)
      || coefficients.length !== prepared.design[0].length
      || coefficients.some((value) => !Number.isFinite(value))) {
    throw new M2Psc02PreregistrationContractError(
      "m2_psc02_gamma_coefficients_invalid"
    );
  }
  const evaluation = gammaEvaluation(
    prepared.rows,
    prepared.design,
    prepared.weights,
    coefficients,
    lambda
  );
  return Object.freeze({
    objective: evaluation.objective,
    gradient: Object.freeze(evaluation.gradient),
    hessian: Object.freeze(evaluation.hessian.map(Object.freeze)),
    standardizer: prepared.standardizer,
    fitLinearPredictorClipUsed: false
  });
}

export function predictM2Psc02ResidualReference(state, features) {
  if (state?.status !== "CONVERGED") {
    throw new M2Psc02PreregistrationContractError(
      "m2_psc02_reference_state_not_converged"
    );
  }
  const standardized = standardizeFeatures(features, state.standardizer);
  return clamp(dot([1, ...standardized], state.coefficients), -30, 30);
}

export function m2Psc02ReferenceArmIds() {
  return ARM_IDS;
}

function canonicalVisibleAnchorRows(rows, origin, config) {
  if (!Array.isArray(rows)) {
    throw new M2Psc02PreregistrationContractError(
      "m2_psc02_anchor_rows_required"
    );
  }
  const cutoff = endOfOriginMonthUtc(origin);
  const components = canonicalAnchorComponents(rows, config);
  const monthlyRevisions = aggregateAnchorComponentsToMonthlyRevisions(
    components
  );
  const visible = monthlyRevisions.filter((row) => (
    row.cashMonth <= origin
    && Date.parse(row.effectiveAt) <= cutoff
    && Date.parse(row.availableAt) <= cutoff
  ));
  const latest = new Map();
  for (const row of visible) {
    const key = anchorNaturalKey(row);
    const current = latest.get(key);
    if (current === undefined || compareRevisions(current, row) < 0) {
      latest.set(key, row);
    }
  }
  return [...latest.values()].sort(compareAnchorRows).map(Object.freeze);
}

function canonicalAnchorComponents(rows, config) {
  if (config?.cashAnchor?.sourceAuthority?.form
      !== M2_PSC02_ANCHOR_SOURCE_FORM) {
    throw new M2Psc02PreregistrationContractError(
      "m2_psc02_anchor_source_authority_form_invalid"
    );
  }
  const unique = new Map();
  for (const source of rows) {
    const row = normalizeAnchorComponentRow(source);
    const identity = anchorComponentIdentity(row);
    const current = unique.get(identity);
    if (current === undefined) {
      unique.set(identity, row);
      continue;
    }
    if (stableStringify(current) !== stableStringify(row)) {
      throw new M2Psc02PreregistrationContractError(
        `m2_psc02_anchor_component_duplicate_conflict:${row.componentId}`
      );
    }
  }
  return [...unique.values()].sort(compareAnchorComponentRows);
}

function normalizeAnchorComponentRow(row) {
  const normalized = {
    sourceForm: requireText(row?.sourceForm, "sourceForm"),
    componentId: requireText(row?.componentId, "componentId"),
    standardWorkId: requireText(row?.standardWorkId, "standardWorkId"),
    channelUid: requireText(row?.channelUid, "channelUid"),
    mechanism: requireMechanism(row?.mechanism),
    cashMonth: requireMonth(row?.cashMonth),
    cashCategory: requireText(row?.cashCategory, "cashCategory"),
    currency: requireText(row?.currency, "currency"),
    effectiveAt: requireDateTime(row?.effectiveAt, "effectiveAt"),
    availableAt: requireDateTime(row?.availableAt, "availableAt"),
    revisionId: requireText(row?.revisionId, "revisionId"),
    positiveCash: requireFinite(row?.positiveCash, "positiveCash"),
    reversalCash: requireFinite(row?.reversalCash, "reversalCash"),
    excludedUnallocatedReversalResidual: requireFinite(
      row?.excludedUnallocatedReversalResidual,
      "excludedUnallocatedReversalResidual"
    )
  };
  if (normalized.sourceForm !== M2_PSC02_ANCHOR_SOURCE_FORM
      || normalized.cashCategory !== "sales_share"
      || normalized.currency !== "CNY"
      || normalized.positiveCash < 0
      || normalized.reversalCash > 0
      || normalized.excludedUnallocatedReversalResidual > 0) {
    throw new M2Psc02PreregistrationContractError(
      "m2_psc02_anchor_cash_scope_invalid"
    );
  }
  return normalized;
}

function aggregateAnchorComponentsToMonthlyRevisions(components) {
  const groups = new Map();
  for (const component of components) {
    const key = anchorRevisionGroupKey(component);
    const current = groups.get(key);
    if (current === undefined) {
      groups.set(key, {
        standardWorkId: component.standardWorkId,
        channelUid: component.channelUid,
        mechanism: component.mechanism,
        cashMonth: component.cashMonth,
        cashCategory: component.cashCategory,
        currency: component.currency,
        effectiveAt: component.effectiveAt,
        availableAt: component.availableAt,
        revisionId: component.revisionId,
        components: [component]
      });
      continue;
    }
    if (current.mechanism !== component.mechanism
        || current.effectiveAt !== component.effectiveAt
        || current.availableAt !== component.availableAt) {
      throw new M2Psc02PreregistrationContractError(
        `m2_psc02_anchor_monthly_revision_metadata_conflict:${key}`
      );
    }
    current.components.push(component);
  }
  return [...groups.values()].map((group) => {
    const ordered = [...group.components].sort(compareAnchorComponentRows);
    return {
      standardWorkId: group.standardWorkId,
      channelUid: group.channelUid,
      mechanism: group.mechanism,
      cashMonth: group.cashMonth,
      cashCategory: group.cashCategory,
      currency: group.currency,
      effectiveAt: group.effectiveAt,
      availableAt: group.availableAt,
      revisionId: group.revisionId,
      positiveCash: sum(ordered.map((row) => row.positiveCash)),
      reversalCash: sum(ordered.map((row) => row.reversalCash)),
      excludedUnallocatedReversalResidual: sum(ordered.map(
        (row) => row.excludedUnallocatedReversalResidual
      )),
      componentCount: ordered.length,
      componentIds: ordered.map((row) => row.componentId),
      sourceComponentsSha256: sha256(stableStringify(ordered)),
      observationGrain:
        "standardWorkId|channelUid|cashMonth|cashCategory|currency"
    };
  }).sort(compareAnchorRows);
}

function anchorLevelEligible(level, support, config) {
  if (["WORK_CHANNEL", "WORK_MECHANISM", "WORK"].includes(level)) {
    return support.completeBillMonths
      >= config.cashAnchor.ownScaleSupport.minimumCompleteBillMonths
      && support.positiveObservationCount
      >= config.cashAnchor.ownScaleSupport.minimumPositiveObservations;
  }
  return support.distinctWorks
    >= config.cashAnchor.pooledScaleSupport.minimumDistinctWorks
    && support.positiveDistinctWorks
    >= config.cashAnchor.pooledScaleSupport.minimumPositiveDistinctWorks
    && support.positiveObservationCount > 0;
}

function anchorSupport(selected, positive) {
  return {
    visibleObservationCount: selected.length,
    positiveObservationCount: positive.length,
    completeBillMonths: new Set(selected.map((row) => row.cashMonth)).size,
    distinctWorks: new Set(selected.map((row) => row.standardWorkId)).size,
    positiveDistinctWorks: new Set(
      positive.map((row) => row.standardWorkId)
    ).size
  };
}

function unavailableAnchor(origin, reason) {
  return Object.freeze({
    status: M2_PSC02_ANCHOR_UNAVAILABLE,
    origin,
    level: null,
    value: null,
    rawArithmeticMean: null,
    unit: "CNY_PER_POSITIVE_WORK_CHANNEL_MONTH",
    support: Object.freeze({reason}),
    observationGrain:
      "standardWorkId|channelUid|cashMonth|cashCategory|currency",
    sourceAuthorityForm: M2_PSC02_ANCHOR_SOURCE_FORM,
    taxonomyUsed: false,
    evaluationActualUsed: false
  });
}

function prepareReferenceRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new M2Psc02PreregistrationContractError(
      "m2_psc02_reference_training_rows_required"
    );
  }
  const normalized = rows.map((row) => ({
    standardWorkId: requireText(row.standardWorkId, "standardWorkId"),
    anchor: requirePositive(row.anchor, "anchor"),
    actualPositive: requirePositive(row.actualPositive, "actualPositive"),
    features: requireFeatureVector(row.features)
  }));
  const featureCount = normalized[0].features.length;
  if (normalized.some((row) => row.features.length !== featureCount)) {
    throw new M2Psc02PreregistrationContractError(
      "m2_psc02_reference_feature_dimension_mismatch"
    );
  }
  const workCounts = new Map();
  for (const row of normalized) {
    workCounts.set(row.standardWorkId, (workCounts.get(row.standardWorkId) ?? 0) + 1);
  }
  const workCount = workCounts.size;
  const weights = normalized.map(
    (row) => 1 / (workCount * workCounts.get(row.standardWorkId))
  );
  const standardizer = fitStandardizer(normalized, weights, featureCount);
  const design = normalized.map((row) => [
    1,
    ...standardizeFeatures(row.features, standardizer)
  ]);
  return {rows: normalized, weights, standardizer, design};
}

function fitStandardizer(rows, weights, featureCount) {
  const means = Array(featureCount).fill(0);
  for (let feature = 0; feature < featureCount; feature += 1) {
    means[feature] = sum(rows.map(
      (row, index) => weights[index] * row.features[feature]
    ));
  }
  const standardDeviations = means.map((meanValue, feature) => {
    const variance = sum(rows.map((row, index) => (
      weights[index] * (row.features[feature] - meanValue) ** 2
    )));
    const value = Math.sqrt(Math.max(0, variance));
    return value === 0 ? 1 : value;
  });
  return Object.freeze({
    means: Object.freeze(means),
    standardDeviations: Object.freeze(standardDeviations),
    fitOnlyOnTraining: true
  });
}

function standardizeFeatures(features, standardizer) {
  const normalized = requireFeatureVector(features);
  if (normalized.length !== standardizer.means.length) {
    throw new M2Psc02PreregistrationContractError(
      "m2_psc02_reference_prediction_feature_dimension_mismatch"
    );
  }
  return normalized.map((value, index) => (
    (value - standardizer.means[index])
      / standardizer.standardDeviations[index]
  ));
}

function gammaEvaluation(rows, matrix, weights, coefficients, lambda) {
  let objective = 0;
  const gradient = Array(coefficients.length).fill(0);
  const hessian = zeros(coefficients.length, coefficients.length);
  const minimumLogRatio = Math.log(Number.MIN_VALUE);
  const maximumLogRatio = Math.log(Number.MAX_VALUE);
  for (let index = 0; index < rows.length; index += 1) {
    const x = matrix[index];
    const eta = dot(x, coefficients);
    const logAnchor = Math.log(rows[index].anchor);
    const logActual = Math.log(rows[index].actualPositive);
    const logRatio = logActual - logAnchor - eta;
    if (!Number.isFinite(eta)
        || !Number.isFinite(logRatio)
        || logRatio < minimumLogRatio
        || logRatio > maximumLogRatio) {
      throw new M2Psc02PreregistrationContractError(
        `m2_psc02_gamma_unclipped_ratio_not_representable:${index}`
      );
    }
    const ratio = Math.exp(logRatio);
    const rowObjective = ratio + logAnchor + eta;
    if (!Number.isFinite(ratio) || !Number.isFinite(rowObjective)) {
      throw new M2Psc02PreregistrationContractError(
        `m2_psc02_gamma_unclipped_objective_nonfinite:${index}`
      );
    }
    const weight = weights[index];
    objective += weight * rowObjective;
    for (let left = 0; left < coefficients.length; left += 1) {
      gradient[left] += weight * (1 - ratio) * x[left];
      for (let right = 0; right < coefficients.length; right += 1) {
        hessian[left][right] += weight * ratio * x[left] * x[right];
      }
    }
  }
  objective += 0.5 * lambda * sum(coefficients.slice(1).map(
    (coefficient) => coefficient ** 2
  ));
  for (let index = 1; index < coefficients.length; index += 1) {
    gradient[index] += lambda * coefficients[index];
    hessian[index][index] += lambda;
  }
  if (!Number.isFinite(objective)
      || gradient.some((value) => !Number.isFinite(value))
      || hessian.some((row) => row.some((value) => !Number.isFinite(value)))) {
    throw new M2Psc02PreregistrationContractError(
      "m2_psc02_gamma_unclipped_derivative_nonfinite"
    );
  }
  return {objective, gradient, hessian};
}

function gammaFailure(failureReason, details) {
  return Object.freeze({
    armId: ARM_IDS.P,
    status: M2_PSC02_GAMMA_NUMERICAL_FAILURE,
    failureReason,
    coefficients: null,
    estimatorSwitchUsed: false,
    diagnosticArmReplacementUsed: false,
    ...details
  });
}

function occurrenceNodeContracts(config) {
  return {
    globalPooledParent: pickOccurrence(config.nodes.globalPooledParent),
    ...Object.fromEntries(Object.entries(config.nodes.mechanisms).map(
      ([key, value]) => [key, pickOccurrence(value)]
    )),
    ...Object.fromEntries(config.nodes.namedPlatforms.map(
      (value) => [value.platformId, pickOccurrence(value)]
    ))
  };
}

function pickOccurrence(value) {
  return {
    basisMechanism: value.basisMechanism,
    basisProfile: value.basisProfile,
    occurrenceL2: value.occurrenceL2,
    effectiveParameterCount: value.effectiveParameterCount,
    frozenTier: value.frozenTier
  };
}

function solveLinear(matrix, vector, pivotTolerance) {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) {
        pivot = row;
      }
    }
    if (Math.abs(augmented[pivot][column]) <= pivotTolerance) {
      throw new M2Psc02PreregistrationContractError(
        "m2_psc02_reference_linear_system_singular"
      );
    }
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let index = column; index <= size; index += 1) {
      augmented[column][index] /= divisor;
    }
    for (let row = 0; row < size; row += 1) {
      if (row === column) {
        continue;
      }
      const factor = augmented[row][column];
      for (let index = column; index <= size; index += 1) {
        augmented[row][index] -= factor * augmented[column][index];
      }
    }
  }
  return augmented.map((row) => row[size]);
}

function zeros(rows, columns) {
  return Array.from({length: rows}, () => Array(columns).fill(0));
}

function compareRevisions(left, right) {
  return left.availableAt.localeCompare(right.availableAt)
    || left.effectiveAt.localeCompare(right.effectiveAt)
    || left.revisionId.localeCompare(right.revisionId);
}

function compareAnchorRows(left, right) {
  return left.standardWorkId.localeCompare(right.standardWorkId)
    || left.channelUid.localeCompare(right.channelUid)
    || left.cashMonth.localeCompare(right.cashMonth)
    || left.cashCategory.localeCompare(right.cashCategory)
    || left.currency.localeCompare(right.currency)
    || left.availableAt.localeCompare(right.availableAt)
    || left.effectiveAt.localeCompare(right.effectiveAt)
    || left.revisionId.localeCompare(right.revisionId);
}

function compareAnchorComponentRows(left, right) {
  return anchorNaturalKey(left).localeCompare(anchorNaturalKey(right))
    || left.revisionId.localeCompare(right.revisionId)
    || left.availableAt.localeCompare(right.availableAt)
    || left.effectiveAt.localeCompare(right.effectiveAt)
    || left.componentId.localeCompare(right.componentId);
}

function anchorNaturalKey(row) {
  return [
    row.standardWorkId,
    row.channelUid,
    row.cashMonth,
    row.cashCategory,
    row.currency
  ].join("\u0000");
}

function anchorRevisionGroupKey(row) {
  return `${anchorNaturalKey(row)}\u0000${row.revisionId}`;
}

function anchorComponentIdentity(row) {
  return `${anchorRevisionGroupKey(row)}\u0000${row.componentId}`;
}

function endOfOriginMonthUtc(origin) {
  const [year, month] = requireMonth(origin).split("-").map(Number);
  return Date.UTC(year, month, 0, 15, 59, 59, 999);
}

function monthIndex(value) {
  const [year, month] = requireMonth(value).split("-").map(Number);
  return year * 12 + month - 1;
}

function validateAnchorQuery(query) {
  requireMonth(query.origin);
  requireText(query.standardWorkId, "standardWorkId");
  requireText(query.channelUid, "channelUid");
  requireMechanism(query.mechanism);
}

function requireMonth(value) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/u.test(value ?? "")) {
    throw new M2Psc02PreregistrationContractError(
      "m2_psc02_month_invalid"
    );
  }
  return value;
}

function requireDateTime(value, field) {
  const instant = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(instant)) {
    throw new M2Psc02PreregistrationContractError(
      `m2_psc02_datetime_invalid:${field}`
    );
  }
  return new Date(instant).toISOString();
}

function requireMechanism(value) {
  if (!["membership", "advertising", "transactional"].includes(value)) {
    throw new M2Psc02PreregistrationContractError(
      "m2_psc02_mechanism_invalid"
    );
  }
  return value;
}

function requireText(value, field) {
  if (typeof value !== "string" || value.length === 0) {
    throw new M2Psc02PreregistrationContractError(
      `m2_psc02_text_required:${field}`
    );
  }
  return value;
}

function requireFinite(value, field) {
  if (!Number.isFinite(Number(value))) {
    throw new M2Psc02PreregistrationContractError(
      `m2_psc02_number_required:${field}`
    );
  }
  return Number(value);
}

function requirePositive(value, field) {
  const number = requireFinite(value, field);
  if (number <= 0) {
    throw new M2Psc02PreregistrationContractError(
      `m2_psc02_positive_required:${field}`
    );
  }
  return number;
}

function requireReferenceLambda(value) {
  if (![1, 3].includes(value)) {
    throw new M2Psc02PreregistrationContractError(
      "m2_psc02_reference_lambda_outside_frozen_grid"
    );
  }
  return value;
}

function requireProbability(value, field) {
  const number = requireFinite(value, field);
  if (number < 0 || number > 1) {
    throw new M2Psc02PreregistrationContractError(
      `m2_psc02_probability_invalid:${field}`
    );
  }
  return number;
}

function indexUniqueCaseRows(rows, label) {
  if (!Array.isArray(rows)) {
    throw new M2Psc02PreregistrationContractError(
      `m2_psc02_case_rows_required:${label}`
    );
  }
  const indexed = new Map();
  for (const row of rows) {
    const caseKey = requireText(row?.caseKey, `${label}.caseKey`);
    if (indexed.has(caseKey)) {
      throw new M2Psc02PreregistrationContractError(
        `m2_psc02_duplicate_case_key:${label}:${caseKey}`
      );
    }
    indexed.set(caseKey, row);
  }
  return indexed;
}

function requireFeatureVector(value) {
  if (!Array.isArray(value) || value.some((item) => !Number.isFinite(item))) {
    throw new M2Psc02PreregistrationContractError(
      "m2_psc02_feature_vector_invalid"
    );
  }
  return [...value];
}

function requireSha256(value) {
  if (!/^[0-9a-f]{64}$/u.test(value ?? "")) {
    throw new M2Psc02PreregistrationContractError(
      "m2_psc02_sha256_invalid"
    );
  }
}

function requireEqual(actual, expected, field, failures) {
  if (!Object.is(actual, expected)) {
    failures.push(field);
  }
}

function requireJsonEqual(actual, expected, field, failures) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(field);
  }
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map(
      (key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function doubleBits(value) {
  if (!Number.isFinite(value)) {
    throw new M2Psc02PreregistrationContractError(
      "m2_psc02_occurrence_probability_nonfinite"
    );
  }
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setFloat64(0, value, false);
  return view.getBigUint64(0, false);
}

function dot(left, right) {
  return sum(left.map((value, index) => value * right[index]));
}

function mean(values) {
  return sum(values) / values.length;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
