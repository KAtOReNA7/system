import { M2_C0_CLEANED_BILL_CALIBRATED_PARAMETERS } from "./calibratedParameters.js";

export const M2_OLD_PRODUCT_PARAMETER_PROFILE_KEYS = Object.freeze({
  FIXTURE_BASELINE: "fixture_baseline",
  CALIBRATED_NON_FORMAL: "calibrated_non_formal"
});

export const DEFAULT_EVALUATION_PARAMETER_PROFILE =
  M2_OLD_PRODUCT_PARAMETER_PROFILE_KEYS.FIXTURE_BASELINE;
export const CALIBRATED_NON_FORMAL_PARAMETER_PROFILE =
  M2_OLD_PRODUCT_PARAMETER_PROFILE_KEYS.CALIBRATED_NON_FORMAL;

const BASELINE_LIFECYCLE_THRESHOLDS = Object.freeze({
  insufficientHistoryCompleteMonths: 6,
  growthRatio: 1.15,
  decliningRatio: 0.75,
  reboundRatio: 1.5,
  longTailLast12RevenueMax: 100000,
  inactiveRecentRevenueMax: 1,
  copyrightExpiryWarningMonths: 18
});

const BASELINE_RATING_SCORE_BANDS = Object.freeze([
  Object.freeze(["S+", 85]),
  Object.freeze(["S", 75]),
  Object.freeze(["A", 62]),
  Object.freeze(["B", 48]),
  Object.freeze(["C", 34]),
  Object.freeze(["D", 20]),
  Object.freeze(["E", 0])
]);

const BASELINE_LIFECYCLE_FACTORS = Object.freeze({
  growth: 1.2,
  stable: 1,
  rebound: 1.05,
  long_tail: 0.8,
  declining: 0.65,
  inactive: 0.25,
  insufficient_history: 0.6
});

const BASELINE_SCENARIO_MULTIPLIERS = Object.freeze({
  base: 1,
  optimistic: 1.25,
  pessimistic: 0.65
});

const CALIBRATED_SOURCE = M2_C0_CLEANED_BILL_CALIBRATED_PARAMETERS;

const CALIBRATED_LIFECYCLE_THRESHOLDS = Object.freeze({
  insufficientHistoryCompleteMonths: CALIBRATED_SOURCE.lifecycle.insufficientHistoryCompleteMonths,
  growthRatio: CALIBRATED_SOURCE.lifecycle.growthRecent6Prior6Ratio,
  decliningRatio: CALIBRATED_SOURCE.lifecycle.decliningRecent6Prior6Ratio,
  reboundRatio: CALIBRATED_SOURCE.lifecycle.reboundRecent3Previous3Ratio,
  longTailLast12RevenueMax: CALIBRATED_SOURCE.lifecycle.longTailLast12RevenueMax,
  inactiveRecentRevenueMax: CALIBRATED_SOURCE.lifecycle.inactiveRecent6RevenueMax,
  stableLast6CoefficientOfVariationMax: CALIBRATED_SOURCE.lifecycle.stableLast6CoefficientOfVariationMax,
  copyrightExpiryWarningMonths: 12
});

export const EVALUATION_PARAMETER_PROFILES = Object.freeze({
  [M2_OLD_PRODUCT_PARAMETER_PROFILE_KEYS.FIXTURE_BASELINE]: Object.freeze({
    key: M2_OLD_PRODUCT_PARAMETER_PROFILE_KEYS.FIXTURE_BASELINE,
    label: "Fixture baseline",
    source: "synthetic_fixture_baseline",
    sourceParameterVersion: "fixture-baseline-v1",
    nonFormalCalibration: false,
    realDataAggregated: false,
    fixtureOnly: true,
    syntheticOnly: true,
    notForFormalDecision: true,
    formalEvaluationAllowed: false,
    lifecycle: BASELINE_LIFECYCLE_THRESHOLDS,
    forecast: Object.freeze({
      lifecycleFactors: BASELINE_LIFECYCLE_FACTORS,
      scenarioMultipliers: BASELINE_SCENARIO_MULTIPLIERS
    }),
    rating: Object.freeze({
      mode: "fixture_score",
      scoreBands: BASELINE_RATING_SCORE_BANDS
    })
  }),
  [M2_OLD_PRODUCT_PARAMETER_PROFILE_KEYS.CALIBRATED_NON_FORMAL]: Object.freeze({
    key: M2_OLD_PRODUCT_PARAMETER_PROFILE_KEYS.CALIBRATED_NON_FORMAL,
    label: "Calibrated non-formal",
    source: "M2-C-0 cleaned bill aggregate calibration",
    sourceParameterVersion: CALIBRATED_SOURCE.version,
    nonFormalCalibration: true,
    realDataAggregated: true,
    fixtureOnly: true,
    syntheticOnly: true,
    notForFormalDecision: true,
    formalEvaluationAllowed: false,
    lifecycle: CALIBRATED_LIFECYCLE_THRESHOLDS,
    forecast: Object.freeze({
      lifecycleFactors: Object.freeze({ ...CALIBRATED_SOURCE.forecast.lifecycleFactors }),
      scenarioMultipliers: Object.freeze({
        base: CALIBRATED_SOURCE.forecast.scenarioMultipliers.base,
        optimistic: CALIBRATED_SOURCE.forecast.scenarioMultipliers.optimistic,
        pessimistic: CALIBRATED_SOURCE.forecast.scenarioMultipliers.pessimistic
      })
    }),
    rating: Object.freeze({
      mode: "calibrated_amount_threshold",
      absoluteAmountThresholds: Object.freeze({
        ...CALIBRATED_SOURCE.rating.absoluteAmountThresholdCandidates
      })
    })
  })
});

export function resolveEvaluationParameterProfile(
  profileKey = DEFAULT_EVALUATION_PARAMETER_PROFILE
) {
  const profile = EVALUATION_PARAMETER_PROFILES[profileKey];
  if (!profile) {
    throw new RangeError(`Unknown old-product evaluation parameter profile: ${profileKey}`);
  }
  return profile;
}

export function summarizeEvaluationParameterProfile(profile) {
  return {
    key: profile.key,
    label: profile.label,
    source: profile.source,
    sourceParameterVersion: profile.sourceParameterVersion,
    nonFormalCalibration: profile.nonFormalCalibration,
    realDataAggregated: profile.realDataAggregated,
    fixtureOnly: profile.fixtureOnly,
    syntheticOnly: profile.syntheticOnly,
    notForFormalDecision: profile.notForFormalDecision,
    formalEvaluationAllowed: profile.formalEvaluationAllowed
  };
}
