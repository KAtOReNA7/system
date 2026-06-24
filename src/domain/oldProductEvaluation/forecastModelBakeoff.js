export const M2_FORECAST_MODEL_BAKEOFF_VERSION = "m2-realdata-dev-forecast-model-v1.0";

export const FORECAST_MODEL_IDS = Object.freeze([
  "model_a_trailing_baseline",
  "model_b_lifecycle_robust",
  "model_c_zero_inflated_sparse",
  "model_d_hierarchical_shrinkage",
  "model_e_selector"
]);

export const M2_FORECAST_MODEL_ACCEPTANCE = Object.freeze({
  p0Max: 0,
  p1Max: 3,
  sample200FailRateMax: 0.1,
  sample200WarningRateMax: 0.5,
  fullFailRateTargetMax: 0.2,
  highConfidenceCoverageMin: 0.6,
  allCoverageMin: 0.45,
  highConfidenceSpreadP75Max: 1.5,
  nonLowConfidenceSpreadP75Max: 2
});

export function selectForecastModel(features = {}) {
  const lifecycle = String(features.lifecycle ?? "");
  const rating = String(features.rating ?? "");
  const revenueScale = String(features.revenueScale ?? "");
  const risks = new Set(features.riskCodes ?? []);
  const activeMonthCount = Number(features.activeMonthCount ?? 0);

  if (
    lifecycle === "inactive" ||
    lifecycle === "long_tail" ||
    ["D", "E"].includes(rating) ||
    ["low", "long_tail"].includes(revenueScale)
  ) {
    return {
      selectedModel: "model_c_zero_inflated_sparse",
      selectionReason: "sparse, inactive, long-tail, or low-rating revenue pattern"
    };
  }
  if (activeMonthCount < 6 || lifecycle === "insufficient_history") {
    return {
      selectedModel: "model_d_hierarchical_shrinkage",
      selectionReason: "insufficient work-level history, shrink to conservative cohort prior"
    };
  }
  if (risks.has("abnormal_spike") || risks.has("buyout_or_oneoff_income")) {
    return {
      selectedModel: "model_b_lifecycle_robust",
      selectionReason: "robust lifecycle model dampens spike-sensitive revenue"
    };
  }
  if (["stable", "growth", "rebound", "declining"].includes(lifecycle)) {
    return {
      selectedModel: "model_b_lifecycle_robust",
      selectionReason: "established lifecycle signal with enough history"
    };
  }
  return {
    selectedModel: "model_a_trailing_baseline",
    selectionReason: "fallback to explainable trailing baseline"
  };
}

export function classifyBakeoffVerdict(metrics = {}) {
  const p0 = Number(metrics.p0 ?? 0);
  const p1 = Number(metrics.p1 ?? 0);
  const sampleFailRate = Number(metrics.sample200FailRate ?? 1);
  const sampleWarningRate = Number(metrics.sample200WarningRate ?? 1);
  const fullFailRate = Number(metrics.fullFailRate ?? 1);
  const highCoverage = Number(metrics.highConfidenceCoverage ?? 0);
  const allCoverage = Number(metrics.allCoverage ?? 0);
  const highSpreadP75 = Number(metrics.highConfidenceSpreadP75 ?? Number.POSITIVE_INFINITY);
  const nonLowSpreadP75 = Number(metrics.nonLowConfidenceSpreadP75 ?? Number.POSITIVE_INFINITY);

  const hardPass =
    p0 <= M2_FORECAST_MODEL_ACCEPTANCE.p0Max &&
    p1 <= M2_FORECAST_MODEL_ACCEPTANCE.p1Max &&
    sampleFailRate <= M2_FORECAST_MODEL_ACCEPTANCE.sample200FailRateMax &&
    sampleWarningRate <= M2_FORECAST_MODEL_ACCEPTANCE.sample200WarningRateMax &&
    fullFailRate <= M2_FORECAST_MODEL_ACCEPTANCE.fullFailRateTargetMax &&
    highCoverage >= M2_FORECAST_MODEL_ACCEPTANCE.highConfidenceCoverageMin &&
    allCoverage >= M2_FORECAST_MODEL_ACCEPTANCE.allCoverageMin &&
    highSpreadP75 <= M2_FORECAST_MODEL_ACCEPTANCE.highConfidenceSpreadP75Max &&
    nonLowSpreadP75 <= M2_FORECAST_MODEL_ACCEPTANCE.nonLowConfidenceSpreadP75Max;

  if (hardPass) {
    return "PASS";
  }

  const conditional =
    p0 === 0 &&
    p1 <= 10 &&
    sampleFailRate <= 0.2 &&
    fullFailRate <= 0.35 &&
    allCoverage >= 0.35 &&
    highSpreadP75 <= 1.5 &&
    nonLowSpreadP75 <= 2;

  return conditional ? "CONDITIONAL PASS" : "FAIL";
}

export function assertScenarioSpreadNotFixed(ratios = []) {
  const clean = ratios.map(Number).filter((value) => Number.isFinite(value));
  if (clean.length < 10) {
    return true;
  }
  const rounded = new Set(clean.map((value) => value.toFixed(4)));
  if (rounded.size <= 3) {
    throw new Error("Scenario spread appears fixed rather than data-driven.");
  }
  return true;
}
