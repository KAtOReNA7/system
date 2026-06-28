import { usableHeatSignals } from "./materialFieldExtractor.js";

export function buildRatingExplanation({
  fields = {},
  forecast = {},
  readiness = {},
  rating,
  ratingBasis = null,
  comparableWorks = {},
  authorRanking = {},
  externalEvidence = [],
  evidenceSummary = {}
} = {}) {
  const heatSignals = usableHeatSignals(fields);
  const supportFactors = buildSupportFactors(fields, forecast, comparableWorks, authorRanking, heatSignals);
  const limitingFactors = buildLimitingFactors(fields, readiness, forecast, authorRanking);
  const warningFactors = buildWarningFactors(readiness);
  const comparableInfluence = buildComparableInfluence(comparableWorks);
  const authorRankingInfluence = buildAuthorRankingInfluence(authorRanking);
  const heatInfluence = heatSignals.map((signal) => ({
    code: signal.key,
    direction: "support",
    explanation: "Usable heat signal contributes to forecast weighting and candidate rating explanation."
  }));
  const adaptationInfluence = buildAdaptationInfluence(fields);
  const sameNameAudioRiskInfluence = buildSameNameAudioRiskInfluence(fields);
  const externalEvidenceInfluence = buildExternalEvidenceInfluence(externalEvidence);
  const gptWebAssistedEvidenceNotes = buildGptWebAssistedEvidenceNotes(externalEvidence);
  const sourceReliabilityWarnings = buildSourceReliabilityWarnings(externalEvidence);
  const missingEvidenceLimitations = buildMissingEvidenceLimitations(evidenceSummary);
  const manualConfirmationWarnings = buildManualConfirmationWarnings(externalEvidence);

  return {
    ratingExplanation: buildExplanationText(rating, ratingBasis, supportFactors, limitingFactors),
    supportFactors,
    limitingFactors,
    warningFactors,
    comparableInfluence,
    authorRankingInfluence,
    heatInfluence,
    adaptationInfluence,
    sameNameAudioRiskInfluence,
    externalEvidenceInfluence,
    gptWebAssistedEvidenceNotes,
    sourceReliabilityWarnings,
    missingEvidenceLimitations,
    manualConfirmationWarnings,
    riskFlags: buildRiskFlags(fields, readiness, authorRanking),
    limitationNotes: buildLimitationNotes(forecast, comparableWorks, evidenceSummary),
    uncertaintyNotes: buildUncertaintyNotes(readiness, authorRanking, evidenceSummary),
    manualReviewNotes: buildManualReviewNotes(readiness, fields, externalEvidence),
    nonFormal: true,
    fixtureOnly: true,
    notForFormalDecision: true
  };
}

function buildSupportFactors(fields, forecast, comparableWorks, authorRanking, heatSignals) {
  const factors = [];
  if (forecast.forecastStatus === "generated") {
    factors.push({
      code: "point_forecast_generated",
      explanation: "Channel-level point forecast is available and summed into total forecast."
    });
  }
  if (heatSignals.length > 0) {
    factors.push({
      code: "usable_heat_signals",
      explanation: `${heatSignals.length} usable heat signal(s) are available.`
    });
  }
  if ((comparableWorks.systemSelected ?? []).length > 0) {
    factors.push({
      code: "system_comparable_support",
      explanation: "Synthetic system comparables support the candidate rating explanation."
    });
  }
  if (authorRanking.enabled) {
    factors.push({
      code: "author_ranking_support",
      explanation: `Synthetic author ranking is enabled with tier ${authorRanking.authorTier}.`
    });
  }
  if (Array.isArray(fields.adaptationSignals) && fields.adaptationSignals.length > 0) {
    factors.push({
      code: "adaptation_signal_support",
      explanation: "Adaptation signals support a higher candidate rating explanation."
    });
  }
  return factors;
}

function buildLimitingFactors(fields, readiness, forecast, authorRanking) {
  const factors = [];
  for (const blocker of readiness.hardBlockers ?? []) {
    factors.push({
      code: blocker.code,
      explanation: blocker.message
    });
  }
  if (forecast.forecastStatus === "blocked") {
    factors.push({
      code: "numeric_forecast_blocked",
      explanation: "Numeric forecast is blocked by readiness and the candidate rating is capped."
    });
  }
  if (!authorRanking.enabled) {
    factors.push({
      code: authorRanking.disabledReason ?? "author_ranking_disabled",
      explanation: "Author ranking does not have enough measurable synthetic works."
    });
  }
  if (fields.sameNameAudioStatus === "has") {
    factors.push({
      code: "same_name_audio_present",
      explanation: "Same-name audio exists and limits rating confidence."
    });
  }
  if (fields.sameNameAudioStatus === "unknown") {
    factors.push({
      code: "same_name_audio_unknown",
      explanation: "Same-name audio status is checked but unknown."
    });
  }
  return factors;
}

function buildWarningFactors(readiness) {
  return (readiness.warnings ?? []).map((warning) => ({
    code: warning.code,
    explanation: warning.message
  }));
}

function buildComparableInfluence(comparableWorks) {
  return (comparableWorks.systemSelected ?? []).map((item) => ({
    comparableWorkId: item.comparableWorkId,
    direction: item.similarityScore >= 55 ? "support" : "limited_support",
    similarityScore: item.similarityScore,
    buyoutTreatment: item.buyoutTreatment,
    explanation: "Comparable influence is explanation-only and non-formal."
  }));
}

function buildAuthorRankingInfluence(authorRanking) {
  if (!authorRanking.enabled) {
    return [{
      enabled: false,
      disabledReason: authorRanking.disabledReason ?? "unknown",
      explanation: "Author ranking is disabled and only shown as a limitation."
    }];
  }
  return [{
    enabled: true,
    authorTier: authorRanking.authorTier,
    measurableWorkCount: authorRanking.measurableWorkCount,
    medianMonthlyEquivalent: authorRanking.medianMonthlyEquivalent,
    explanation: "Author tier is used as an explanation signal for candidate rating."
  }];
}

function buildAdaptationInfluence(fields) {
  const signals = Array.isArray(fields.adaptationSignals) ? fields.adaptationSignals : [];
  if (signals.length === 0) {
    return [{
      direction: "neutral",
      explanation: "No adaptation signal is available."
    }];
  }
  return signals.map((signal) => ({
    signal,
    direction: "support",
    explanation: "Adaptation signal affects rating explanation and risk context."
  }));
}

function buildSameNameAudioRiskInfluence(fields) {
  if (fields.sameNameAudioStatus === "has") {
    return [{
      status: "has",
      direction: "risk",
      explanation: "Existing same-name audio is a rating limitation."
    }];
  }
  if (fields.sameNameAudioStatus === "unknown") {
    return [{
      status: "unknown",
      direction: "warning",
      explanation: "Same-name audio status was checked but remains unknown."
    }];
  }
  return [{
    status: fields.sameNameAudioStatus ?? "missing",
    direction: "neutral",
    explanation: "No same-name audio limitation is applied."
  }];
}

function buildExternalEvidenceInfluence(externalEvidence = []) {
  return externalEvidence.map((item) => ({
    evidenceId: item.evidenceId,
    evidenceType: item.evidenceType,
    direction: influenceDirection(item),
    confidence: item.confidence,
    manualConfirmed: item.manualConfirmed,
    mappedFields: item.mappedFields,
    explanation: item.manualConfirmed
      ? "Structured external evidence can influence forecast/rating explanation."
      : "Unconfirmed external evidence remains explanation-only."
  }));
}

function buildGptWebAssistedEvidenceNotes(externalEvidence = []) {
  return externalEvidence
    .filter((item) => item.evidenceType === "gptWebAssistedSummary")
    .map((item) => ({
      evidenceId: item.evidenceId,
      confidence: item.confidence,
      hasSource: Boolean(item.sourceUrl || item.sourceDescription),
      manualConfirmed: item.manualConfirmed,
      note: item.sourceUrl || item.sourceDescription
        ? "GPT web-assisted summary has a recorded source but still requires manual confirmation."
        : "GPT web-assisted summary has no recorded source and must remain low-confidence operator research note."
    }));
}

function buildSourceReliabilityWarnings(externalEvidence = []) {
  return externalEvidence
    .filter((item) => item.sourceReliability === "low" || item.confidence === "low")
    .map((item) => ({
      evidenceId: item.evidenceId,
      evidenceType: item.evidenceType,
      sourceReliability: item.sourceReliability,
      confidence: item.confidence,
      warning: "Low reliability or low confidence evidence cannot fill hard blockers."
    }));
}

function buildMissingEvidenceLimitations(evidenceSummary = {}) {
  const limitations = [];
  if ((evidenceSummary.heatSignalEvidenceCount ?? 0) === 0) {
    limitations.push({ code: "missing_external_heat_evidence", explanation: "No structured external heat evidence is available." });
  }
  if ((evidenceSummary.sameNameAudioEvidenceCount ?? 0) === 0) {
    limitations.push({ code: "missing_same_name_audio_evidence", explanation: "No structured same-name audio evidence is available." });
  }
  if ((evidenceSummary.adaptationEvidenceCount ?? 0) === 0) {
    limitations.push({ code: "missing_adaptation_evidence", explanation: "No structured adaptation evidence is available." });
  }
  return limitations;
}

function buildManualConfirmationWarnings(externalEvidence = []) {
  return externalEvidence
    .filter((item) => !item.manualConfirmed)
    .map((item) => ({
      evidenceId: item.evidenceId,
      evidenceType: item.evidenceType,
      warning: "Manual confirmation is required before this evidence can affect hard blockers."
    }));
}

function buildRiskFlags(fields, readiness, authorRanking) {
  const flags = [];
  if ((readiness.warningCodes ?? []).length > 0) {
    flags.push({
      code: "readiness_warning_present",
      severity: "medium",
      explanation: "Readiness warnings should be reviewed before formal use."
    });
  }
  if (fields.sameNameAudioStatus === "has" || fields.sameNameAudioStatus === "unknown") {
    flags.push({
      code: "same_name_audio_risk",
      severity: fields.sameNameAudioStatus === "has" ? "high" : "medium",
      explanation: "Same-name audio status affects candidate interpretation."
    });
  }
  if (!authorRanking.enabled) {
    flags.push({
      code: "author_ranking_limited",
      severity: "low",
      explanation: "Author ranking has insufficient measurable synthetic works."
    });
  }
  return flags;
}

function buildLimitationNotes(forecast, comparableWorks, evidenceSummary = {}) {
  const notes = [
    "Fixture-only rating explanation; not for formal decision.",
    "Rating is not a development recommendation.",
    "Rating is not a resource investment level."
  ];
  if ((forecast.limitations ?? []).length > 0) {
    notes.push(...forecast.limitations);
  }
  if ((comparableWorks.excluded ?? []).some((item) => item.excludedReasonCode === "pure_buyout_historical_value_only")) {
    notes.push("Pure buyout comparables are separated from direct sales-curve comparison.");
  }
  if ((evidenceSummary.lowConfidenceEvidenceCount ?? 0) > 0) {
    notes.push("Low-confidence external evidence is not used to fill hard blockers.");
  }
  if ((evidenceSummary.gptWebAssistedSummaryCount ?? 0) > 0) {
    notes.push("GPT web-assisted summaries require cited sources and manual confirmation before influencing forecast or rating.");
  }
  return [...new Set(notes)];
}

function buildUncertaintyNotes(readiness, authorRanking, evidenceSummary = {}) {
  const notes = [];
  if ((readiness.warningCodes ?? []).length > 0) {
    notes.push(`Readiness warnings remain: ${(readiness.warningCodes ?? []).join(", ")}`);
  }
  if (!authorRanking.enabled) {
    notes.push(`Author ranking disabled: ${authorRanking.disabledReason ?? "unknown"}`);
  }
  if ((evidenceSummary.manualConfirmedEvidenceCount ?? 0) === 0) {
    notes.push("No manual-confirmed external evidence is available.");
  }
  return notes;
}

function buildManualReviewNotes(readiness, fields, externalEvidence = []) {
  const notes = [];
  if ((readiness.warningCodes ?? []).includes("classification_requires_user_confirmation")) {
    notes.push("Classification candidate still requires user confirmation.");
  }
  if (fields.sameNameAudioStatus === "unknown") {
    notes.push("Same-name audio status is unknown after check and should be reviewed.");
  }
  if (externalEvidence.some((item) => !item.manualConfirmed)) {
    notes.push("Some external evidence is not manually confirmed and cannot fill hard blockers.");
  }
  return notes;
}

function influenceDirection(item) {
  if (!item.manualConfirmed || item.confidence === "low") return "limitation";
  if (["originalPlatformStats", "rankingSignal", "searchHeatSignal", "socialHeatSignal", "reviewReputationEvidence"].includes(item.evidenceType)) {
    return "support";
  }
  if (item.evidenceType === "sameNameAudioEvidence") return "risk_or_clearance";
  if (item.evidenceType === "adaptationEvidence") return "support";
  return "context";
}

function buildExplanationText(rating, ratingBasis, supportFactors, limitingFactors) {
  const supportText = supportFactors.map((factor) => factor.code).join(", ") || "no strong support factor";
  const limitText = limitingFactors.map((factor) => factor.code).join(", ") || "no hard limitation";
  const basisText = typeof ratingBasis === "number" ? ` with fixture rating basis ${ratingBasis}` : "";
  return `Candidate rating ${rating}${basisText}. Support: ${supportText}. Limitations: ${limitText}.`;
}
