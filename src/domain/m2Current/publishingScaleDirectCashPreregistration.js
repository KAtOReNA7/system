export const M2_PSC03_MODEL_ID = "M2-CHAN-PSC03";
export const M2_PSC03_RAW_CANDIDATE_ID = "M2-CHAN-PSC03-RAW";
export const M2_PSC03_EXPERIMENT_ID =
  "M2-EXP-PUBLISHING-SCALE-CHANNEL-DIRECT-CASH-03";
export const M2_PSC03_PREREGISTRATION_ID =
  "M2-PREREG-PSC03-DIRECT-CASH-QUASI-POISSON-01";

const FEATURE_ORDER = Object.freeze([
  "log_recent_1_positive",
  "log_recent_3_positive",
  "log_recent_12_positive",
  "log_cumulative_positive",
  "positive_rate_3",
  "positive_rate_12",
  "log_recent_3_vs_previous_3",
  "previous_3_available",
  "log_positive_volatility_12",
  "months_since_last_positive_scaled",
  "log_historical_peak_positive",
  "months_since_peak_scaled",
  "log_observed_channel_age",
  "log_observed_work_age",
  "trailing_12_work_share",
  "channel_rank_percentile",
  "available_month_fraction_3",
  "available_month_fraction_12"
]);

const STRICT_ORIGINS = Object.freeze([
  "2023-03", "2023-06", "2023-09", "2023-12",
  "2024-03", "2024-06", "2024-09", "2024-12",
  "2025-03", "2025-06", "2025-09"
]);

const NAMED_PLATFORMS = Object.freeze([
  "ximalaya", "wechat_reading", "fanqie_audio", "missevan", "manbo"
]);

export class M2Psc03PreregistrationError extends Error {
  constructor(code) {
    super(code);
    this.name = "M2Psc03PreregistrationError";
    this.code = code;
  }
}

export function validateM2Psc03Preregistration({
  preregistration,
  development,
  schema,
  psc01,
  support,
  businessAcceptance
}) {
  const failures = [];
  equal(
    preregistration?.schema,
    "m2.current.publishing_scale_channel_direct_cash_preregistration.v0.1",
    "preregistration_schema",
    failures
  );
  equal(preregistration?.modelId, M2_PSC03_MODEL_ID, "model_id", failures);
  equal(
    preregistration?.rawCandidateId,
    M2_PSC03_RAW_CANDIDATE_ID,
    "candidate_id",
    failures
  );
  equal(
    preregistration?.experimentId,
    M2_PSC03_EXPERIMENT_ID,
    "experiment_id",
    failures
  );
  equal(
    preregistration?.preregistrationId,
    M2_PSC03_PREREGISTRATION_ID,
    "preregistration_id",
    failures
  );
  equal(
    preregistration?.status,
    "PREREGISTERED_BEFORE_ANY_PSC03_PRIVATE_OUTCOME",
    "pre_outcome_status",
    failures
  );
  equal(preregistration?.evidenceClass, "DEVELOPMENT_REPLAY", "evidence", failures);

  equal(
    development?.schema,
    "m2.current.publishing_scale_channel_direct_cash_development.v0.1",
    "development_schema",
    failures
  );
  for (const field of ["modelId", "rawCandidateId", "experimentId", "preregistrationId"]) {
    equal(development?.[field], preregistration?.[field], `development_${field}`, failures);
  }
  equal(
    schema?.$id,
    "m2.current.publishing_scale_channel_direct_cash_schema.v0.1",
    "json_schema_id",
    failures
  );

  equal(psc01?.modelId, "M2-CHAN-PSC01", "psc01_model", failures);
  equal(
    psc01?.actualDefinitionId,
    "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01",
    "actual_definition",
    failures
  );
  jsonEqual(psc01?.featureOrder, FEATURE_ORDER, "feature_order", failures);
  equal(support?.contractId, "M2-PUBLISHING-SCALE-SUPPORT-01", "support", failures);
  equal(
    businessAcceptance?.candidateSuperiority?.combinationRule,
    "AND",
    "candidate_superiority",
    failures
  );
  equal(
    businessAcceptance?.candidateSuperiority?.requirements?.length,
    9,
    "candidate_superiority_count",
    failures
  );

  const immutable = preregistration?.immutableScientificScope;
  equal(immutable?.target, psc01?.target, "target", failures);
  equal(immutable?.actualDefinitionId, psc01?.actualDefinitionId, "actual", failures);
  equal(immutable?.uniqueCaseKey, psc01?.dataContract?.uniqueKey, "key", failures);
  equal(immutable?.taxonomyRole, "REPORT_ONLY", "taxonomy", failures);
  equal(immutable?.privacyMinimumCases, 30, "privacy_cases", failures);
  equal(immutable?.privacyMinimumWorks, 20, "privacy_works", failures);

  const authority = preregistration?.allowedAuthority;
  for (const field of [
    "psc02ComponentLedger",
    "componentIdRequired",
    "revisionIdRequired",
    "effectiveAtRequired",
    "availableAtRequired",
    "psc02MissingZeroExtraThreeIsGate"
  ]) {
    equal(authority?.[field], false, `forbidden_authority_${field}`, failures);
  }

  const occurrence = preregistration?.occurrenceContract;
  equal(occurrence?.sourceModelId, "M2-CHAN-PSC01", "occurrence_source", failures);
  equal(occurrence?.binary64AbsoluteTolerance, 0, "occurrence_abs", failures);
  equal(occurrence?.binary64RelativeTolerance, 0, "occurrence_rel", failures);
  equal(occurrence?.appliedExactlyOnce, true, "occurrence_once", failures);
  equal(occurrence?.refit, false, "occurrence_refit", failures);

  const training = preregistration?.conditionalAmountTraining;
  equal(training?.strictlyPositiveRowsOnly, true, "positive_only", failures);
  equal(
    training?.basicWeight,
    "EQUAL_PER_LEGAL_POSITIVE_MONTHLY_CASE_NORMALIZED_WITHIN_NODE",
    "case_weight",
    failures
  );
  equal(training?.equalTotalWeightPerWork, false, "work_weight", failures);

  jsonEqual(
    preregistration?.hierarchy?.levels,
    ["GLOBAL_POOLED_PARENT", "MECHANISM", "NAMED_PLATFORM"],
    "hierarchy",
    failures
  );
  jsonEqual(
    preregistration?.hierarchy?.namedPlatforms,
    NAMED_PLATFORMS,
    "platforms",
    failures
  );
  equal(
    preregistration?.hierarchy?.childOffset,
    "LOG_PARENT_MEAN_FIXED_COEFFICIENT_ONE",
    "offset",
    failures
  );

  equal(preregistration?.arms?.D0?.role, "DIAGNOSTIC_NOT_CANDIDATE", "D0", failures);
  equal(
    preregistration?.arms?.D1?.role,
    "VARIANCE_FAMILY_DIAGNOSTIC_NOT_CANDIDATE",
    "D1",
    failures
  );
  equal(preregistration?.arms?.P?.role, "SOLE_RAW_CANDIDATE", "P", failures);
  equal(
    preregistration?.arms?.P?.rawCandidateId,
    M2_PSC03_RAW_CANDIDATE_ID,
    "P_candidate",
    failures
  );

  jsonEqual(development?.selection?.lambdaGrid, [1, 3], "lambda", failures);
  equal(development?.selection?.tieTolerance, 1e-12, "tie", failures);
  equal(development?.selection?.primaryOuterWorkFoldCount, 5, "outer", failures);
  equal(development?.selection?.primaryInnerWorkFoldCount, 3, "inner", failures);
  equal(development?.selection?.primaryInnerWorkFoldRepeats, 3, "repeats", failures);
  jsonEqual(development?.selection?.strictOrigins, STRICT_ORIGINS, "origins", failures);
  equal(development?.selection?.outerOutcomeUsedForSelection, false, "outer_selection", failures);

  const numerical = development?.numerical;
  equal(numerical?.maximumIterations, 200, "iterations", failures);
  equal(numerical?.maximumStepHalvings, 20, "halvings", failures);
  equal(numerical?.coefficientTolerance, 1e-10, "coef_tolerance", failures);
  equal(numerical?.relativeObjectiveTolerance, 1e-12, "objective_tolerance", failures);
  equal(numerical?.pivotTolerance, 1e-12, "pivot", failures);
  jsonEqual(numerical?.finalPredictionEtaClip, [-30, 30], "clip", failures);
  equal(numerical?.trainingEtaClip, null, "training_clip", failures);

  const closed = development?.closedBoundaries;
  equal(closed?.activeCandidate, null, "active", failures);
  equal(closed?.approvedForAutomation, null, "automation", failures);
  for (const field of [
    "productionReady",
    "finalHoldoutOpened",
    "independentEvaluationOpened",
    "laterOriginOpened",
    "productionModified",
    "apiModified",
    "databaseUsed",
    "providerUsed"
  ]) {
    equal(closed?.[field], false, `closed_${field}`, failures);
  }

  if (failures.length > 0) {
    throw new M2Psc03PreregistrationError(
      `m2_psc03_preregistration_invalid:${failures.join(",")}`
    );
  }
  return Object.freeze({
    status: "M2_PSC03_PREREGISTRATION_SEMANTIC_VALIDATION_PASSED",
    modelId: M2_PSC03_MODEL_ID,
    rawCandidateId: M2_PSC03_RAW_CANDIDATE_ID,
    experimentId: M2_PSC03_EXPERIMENT_ID,
    preregistrationId: M2_PSC03_PREREGISTRATION_ID,
    featureCount: FEATURE_ORDER.length,
    strictOriginCount: STRICT_ORIGINS.length,
    privateArtifactRead: false,
    outerOutcomeRead: false
  });
}

function equal(actual, expected, field, failures) {
  if (actual !== expected) failures.push(field);
}

function jsonEqual(actual, expected, field, failures) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) failures.push(field);
}
