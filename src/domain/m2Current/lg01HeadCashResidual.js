export const LG01_HEAD_CASH_RESIDUAL_MODEL_ID = "M2-WORK-HCRC01";
export const LG01_HEAD_CASH_RESIDUAL_EXPERIMENT_ID =
  "M2-EXP-LG01-HEAD-CASH-RESIDUAL-01";
export const LG01_HEAD_CASH_RESIDUAL_ARM_IDS = Object.freeze([
  "C0",
  "C1",
  "C2",
  "C3"
]);

const EXPECTED_ALPHA_GRID = Object.freeze([0.25, 0.5, 0.75, 1]);

export function validateLg01HeadCashResidualContract(config) {
  const errors = [];

  if (config?.schema !== "m2.current.lg01_head_cash_residual.v0.1") {
    errors.push("hcrc_contract_schema_invalid");
  }
  if (
    config?.experiment?.stableExperimentId
      !== LG01_HEAD_CASH_RESIDUAL_EXPERIMENT_ID
  ) {
    errors.push("hcrc_contract_experiment_id_invalid");
  }
  if (config?.model?.stableModelId !== LG01_HEAD_CASH_RESIDUAL_MODEL_ID) {
    errors.push("hcrc_contract_model_id_invalid");
  }

  const armIds = (config?.arms ?? []).map((arm) => arm.armId);
  if (!sameValues(armIds, LG01_HEAD_CASH_RESIDUAL_ARM_IDS)) {
    errors.push("hcrc_contract_arms_must_be_exactly_c0_through_c3");
  }
  if (!sameValues(config?.scope?.horizonsMonths, [3])) {
    errors.push("hcrc_contract_horizon_must_be_three_months_only");
  }
  if (!sameValues(config?.alpha?.candidateGrid, EXPECTED_ALPHA_GRID)) {
    errors.push("hcrc_contract_alpha_grid_invalid");
  }
  if (config?.alpha?.zeroIsCandidate !== false) {
    errors.push("hcrc_contract_zero_alpha_must_be_fallback_only");
  }
  if (
    config?.residualBounding?.clip?.lowerQuantile !== 0.05
    || config?.residualBounding?.clip?.upperQuantile !== 0.95
  ) {
    errors.push("hcrc_contract_residual_clip_must_be_q05_q95");
  }
  if (
    config?.residualBounding?.trainingFoldPositiveBaseFloor?.quantile !== 0.1
  ) {
    errors.push("hcrc_contract_positive_base_floor_must_be_q10");
  }
  if (
    config?.experiment?.outerOutcomeRead !== false
    || config?.experiment?.firstCompleteOutcomeProduced !== false
  ) {
    errors.push("hcrc_contract_outer_outcome_must_remain_unread_at_preregistration");
  }
  if (
    config?.execution?.singlePrivateDevelopmentEvaluationAuthorized !== true
    || config?.execution?.secondCompleteResultAllowed !== false
  ) {
    errors.push("hcrc_contract_single_private_evaluation_boundary_invalid");
  }
  if (
    config?.frozenInputs?.lg01RefitAllowed !== false
    || config?.frozenInputs?.cham01RefitAllowed !== false
  ) {
    errors.push("hcrc_contract_frozen_predecessor_refit_forbidden");
  }
  if (
    config?.cashBands?.futureActualUsed !== false
    || config?.bandShrinkage?.fixedMinimumWorkCountAllowed !== false
  ) {
    errors.push("hcrc_contract_cash_band_support_must_be_origin_visible");
  }
  if (
    config?.evaluation?.bootstrap?.iterations !== 2000
    || config?.evaluation?.bootstrap?.wholeWorkCluster !== true
  ) {
    errors.push("hcrc_contract_bootstrap_must_cluster_two_thousand_whole_works");
  }
  if (
    config?.evaluation?.rawAndSelectedReportedSeparately !== true
    || config?.evaluation?.fallbackMayReplaceRawMetrics !== false
  ) {
    errors.push("hcrc_contract_raw_candidate_must_remain_visible");
  }

  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors)
  });
}

function sameValues(actual, expected) {
  return (
    Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index])
  );
}
