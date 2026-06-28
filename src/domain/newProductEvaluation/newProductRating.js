import { buildRatingExplanation } from "./ratingExplanation.js";

const RATING_THRESHOLDS = Object.freeze([
  ["S+", 300000],
  ["S", 180000],
  ["A", 120000],
  ["B", 70000],
  ["C", 35000],
  ["D", 15000],
  ["E", 0]
]);

export function buildNewProductCandidateRating(fields, forecast, readiness, context = {}) {
  if (!forecast || forecast.forecastStatus === "blocked") {
    const explanation = buildRatingExplanation({
      fields,
      forecast: forecast ?? { forecastStatus: "blocked" },
      readiness,
      rating: "not_generated",
      ratingBasis: null,
      comparableWorks: context.comparableWorks,
      authorRanking: context.authorRanking,
      externalEvidence: context.externalEvidence,
      evidenceSummary: context.evidenceSummary
    });
    return {
      ratingType: "new_product_candidate_rating",
      rating: null,
      value: null,
      ratingStatus: "not_generated_due_to_readiness_blocked",
      candidateRatingGenerated: false,
      ratingScale: ["S+", "S", "A", "B", "C", "D", "E"],
      rationale: "Numeric forecast is blocked; candidate rating is not generated.",
      ...explanation,
      nonFormal: true,
      fixtureOnly: true,
      notForFormalDecision: true
    };
  }

  const adaptationBoost = Array.isArray(fields.adaptationSignals) && fields.adaptationSignals.length > 0 ? 1.12 : 1;
  const readinessPenalty = readiness?.readinessStatus === "warning_only" ? 0.92 : 1;
  const comparableBoost = comparableRatingFactor(context.comparableWorks);
  const authorRankingBoost = authorRankingFactor(context.authorRanking);
  const sameNameAudioPenalty = sameNameAudioFactor(fields);
  const ratingBasis =
    forecast.totalForecast.fiveYearTotal *
    adaptationBoost *
    readinessPenalty *
    comparableBoost *
    authorRankingBoost *
    sameNameAudioPenalty;
  const value = RATING_THRESHOLDS.find(([, threshold]) => ratingBasis >= threshold)?.[0] ?? "E";
  const explanation = buildRatingExplanation({
    fields,
    forecast,
    readiness,
    rating: value,
    ratingBasis: round(ratingBasis),
    comparableWorks: context.comparableWorks,
    authorRanking: context.authorRanking,
    externalEvidence: context.externalEvidence,
    evidenceSummary: context.evidenceSummary
  });

  return {
    ratingType: "new_product_candidate_rating",
    rating: value,
    value,
    ratingScale: ["S+", "S", "A", "B", "C", "D", "E"],
    ratingBasis: round(ratingBasis),
    rationale: "Fixture candidate rating uses point forecast, heat strength, adaptation signals and readiness warnings.",
    adaptationSignalsAffectRating: Array.isArray(fields.adaptationSignals) && fields.adaptationSignals.length > 0,
    comparableWorksAffectRatingExplanation: (context.comparableWorks?.systemSelected ?? []).length > 0,
    authorRankingAffectsRatingExplanation: context.authorRanking?.enabled === true,
    requiresManualReview: value === "S+" || readiness?.readinessStatus === "warning_only",
    ...explanation,
    nonFormal: true,
    fixtureOnly: true,
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

function comparableRatingFactor(comparableWorks = {}) {
  const selected = comparableWorks.systemSelected ?? [];
  if (selected.length === 0) return 1;
  const averageScore = selected.reduce((total, item) => total + (item.similarityScore ?? 0), 0) / selected.length;
  if (averageScore >= 60) return 1.06;
  if (averageScore >= 45) return 1.03;
  return 1;
}

function authorRankingFactor(authorRanking = {}) {
  if (!authorRanking.enabled) return 1;
  if (authorRanking.authorTier === "author_tier_high") return 1.08;
  if (authorRanking.authorTier === "author_tier_mid") return 1.05;
  if (authorRanking.authorTier === "author_tier_watch") return 1.02;
  if (authorRanking.authorTier === "author_tier_limited") return 0.98;
  return 1;
}

function sameNameAudioFactor(fields = {}) {
  if (fields.sameNameAudioStatus === "has") return 0.88;
  if (fields.sameNameAudioStatus === "unknown") return 0.95;
  return 1;
}
