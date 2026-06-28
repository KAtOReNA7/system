const RATING_THRESHOLDS = Object.freeze([
  ["S+", 300000],
  ["S", 180000],
  ["A", 120000],
  ["B", 70000],
  ["C", 35000],
  ["D", 15000],
  ["E", 0]
]);

export function buildNewProductCandidateRating(fields, forecast, readiness) {
  if (!forecast || forecast.forecastStatus === "blocked") {
    return {
      ratingType: "new_product_candidate_rating",
      value: "E",
      ratingScale: ["S+", "S", "A", "B", "C", "D", "E"],
      rationale: "Numeric forecast is blocked; fixture candidate rating is capped.",
      nonFormal: true,
      notForFormalDecision: true
    };
  }

  const adaptationBoost = Array.isArray(fields.adaptationSignals) && fields.adaptationSignals.length > 0 ? 1.12 : 1;
  const readinessPenalty = readiness?.readinessStatus === "warning_only" ? 0.92 : 1;
  const ratingBasis = forecast.totalForecast.fiveYearTotal * adaptationBoost * readinessPenalty;
  const value = RATING_THRESHOLDS.find(([, threshold]) => ratingBasis >= threshold)?.[0] ?? "E";

  return {
    ratingType: "new_product_candidate_rating",
    value,
    ratingScale: ["S+", "S", "A", "B", "C", "D", "E"],
    ratingBasis: round(ratingBasis),
    rationale: "Fixture candidate rating uses point forecast, heat strength, adaptation signals and readiness warnings.",
    adaptationSignalsAffectRating: Array.isArray(fields.adaptationSignals) && fields.adaptationSignals.length > 0,
    requiresManualReview: value === "S+" || readiness?.readinessStatus === "warning_only",
    nonFormal: true,
    notForFormalDecision: true
  };
}

export function buildNewProductRisks(fields, readiness, forecast) {
  const risks = [
    {
      code: "fixture_only_non_formal",
      severity: "medium",
      message: "Synthetic fixture result only; not for formal decision."
    }
  ];
  for (const warning of readiness?.warnings ?? []) {
    risks.push({
      code: warning.code,
      severity: warning.code === "classification_requires_user_confirmation" ? "high" : "medium",
      message: warning.message
    });
  }
  if (Array.isArray(fields.adaptationSignals) && fields.adaptationSignals.length > 0) {
    risks.push({
      code: "adaptation_signal_present",
      severity: "low",
      message: "Adaptation signal should be used in rating and risk explanation."
    });
  }
  if (forecast?.confidence === "limited") {
    risks.push({
      code: "forecast_confidence_limited",
      severity: "medium",
      message: "Point estimate has limited confidence and needs manual review."
    });
  }
  return risks;
}

function round(value) {
  return Math.round(value * 100) / 100;
}
