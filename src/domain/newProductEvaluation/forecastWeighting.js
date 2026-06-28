import { usableHeatSignals } from "./materialFieldExtractor.js";

export const M3_FORECAST_WEIGHTING_VERSION = "m3-forecast-weighting-fixture-v1";

export function buildForecastWeighting(
  fields = {},
  readiness = {},
  comparableWorks = {},
  authorRanking = {},
  options = {}
) {
  const referenceAmount = positiveNumber(options.referenceAmount, 0);
  const externalEvidence = options.externalEvidence ?? [];
  const evidenceSummary = options.evidenceSummary ?? {};
  const drafts = [
    readinessContribution(readiness),
    heatContribution(fields),
    externalEvidenceContribution(externalEvidence, evidenceSummary),
    comparableContribution(comparableWorks),
    sameAuthorContribution(comparableWorks),
    authorRankingContribution(authorRanking),
    adaptationContribution(fields),
    sourceContribution(fields),
    targetChannelContribution(fields),
    sameNameAudioContribution(fields, externalEvidence),
    materialCompletenessContribution(readiness),
    buyoutTreatmentContribution(comparableWorks)
  ];
  const forecastMultiplier = clamp(
    1 + drafts.reduce((total, draft) => total + draft.factorDelta, 0),
    0.55,
    1.45
  );
  const forecastContributions = drafts.map((draft) => toContribution(draft, referenceAmount));

  return {
    weightingVersion: M3_FORECAST_WEIGHTING_VERSION,
    forecastShape: "point_estimate_only",
    pointEstimateOnly: true,
    forecastMultiplier: round(forecastMultiplier),
    forecastContributions,
    limitations: buildLimitations(comparableWorks, evidenceSummary),
    confidenceNotes: buildConfidenceNotes(readiness, comparableWorks, authorRanking, evidenceSummary),
    nonFormal: true,
    fixtureOnly: true,
    notForFormalDecision: true
  };
}

export function scaleForecastContributions(contributions = [], scale = 1) {
  const safeScale = Number.isFinite(scale) ? scale : 0;
  return contributions.map((contribution) => ({
    ...contribution,
    contributionAmount: round((contribution.contributionAmount ?? 0) * safeScale)
  }));
}

function readinessContribution(readiness = {}) {
  if (readiness.numericForecastAllowed === false) {
    return draft(
      "readiness_quality",
      "Readiness quality",
      "decrease",
      0.18,
      -0.18,
      "Hard blockers prevent numeric forecast use.",
      readiness.hardBlockerCodes ?? []
    );
  }
  const warningCount = readiness.warningCodes?.length ?? 0;
  if (warningCount > 0) {
    return draft(
      "readiness_quality",
      "Readiness quality",
      "decrease",
      0.12,
      -Math.min(0.08, warningCount * 0.015),
      "Readiness warnings reduce confidence but do not block the point estimate.",
      readiness.warningCodes ?? []
    );
  }
  return draft(
    "readiness_quality",
    "Readiness quality",
    "increase",
    0.08,
    0.03,
    "No readiness hard blockers or warnings are present.",
    []
  );
}

function heatContribution(fields) {
  const signals = usableHeatSignals(fields);
  if (signals.length >= 4) {
    return draft(
      "heat_signal_strength",
      "Heat signal strength",
      "increase",
      0.22,
      0.12,
      "Multiple heat signals support a stronger point estimate.",
      signals.map((signal) => signal.key)
    );
  }
  if (signals.length >= 1) {
    return draft(
      "heat_signal_strength",
      "Heat signal strength",
      "increase",
      0.16,
      0.05,
      "At least one heat signal is usable for the point estimate.",
      signals.map((signal) => signal.key)
    );
  }
  return draft(
    "heat_signal_strength",
    "Heat signal strength",
    "decrease",
    0.22,
    -0.12,
    "No usable heat signal is present.",
    []
  );
}

function externalEvidenceContribution(externalEvidence = [], evidenceSummary = {}) {
  const confirmedCount = evidenceSummary.manualConfirmedEvidenceCount ?? 0;
  const highCount = evidenceSummary.highConfidenceEvidenceCount ?? 0;
  if (confirmedCount > 0 && highCount > 0) {
    return draft(
      "external_evidence_strength",
      "External evidence strength",
      "increase",
      0.12,
      Math.min(0.08, confirmedCount * 0.02 + highCount * 0.01),
      "Manual-confirmed structured external evidence supports the point estimate.",
      externalEvidence.filter((item) => item.manualConfirmed).map((item) => item.evidenceId)
    );
  }
  if (externalEvidence.length > 0) {
    return draft(
      "external_evidence_strength",
      "External evidence strength",
      "neutral",
      0.12,
      0,
      "External evidence exists but is unconfirmed or low confidence.",
      externalEvidence.map((item) => item.evidenceId)
    );
  }
  return draft(
    "external_evidence_strength",
    "External evidence strength",
    "neutral",
    0.12,
    0,
    "No structured external evidence is available.",
    []
  );
}

function comparableContribution(comparableWorks = {}) {
  const selected = comparableWorks.systemSelected ?? [];
  if (selected.length === 0) {
    return draft(
      "comparable_works_strength",
      "Comparable works strength",
      "neutral",
      0.14,
      0,
      "No system comparable work is selected.",
      []
    );
  }
  const averageScore = selected.reduce((total, item) => total + (item.similarityScore ?? 0), 0) / selected.length;
  if (averageScore >= 55) {
    return draft(
      "comparable_works_strength",
      "Comparable works strength",
      "increase",
      0.14,
      0.08,
      "System comparable works have strong synthetic similarity.",
      selected.map((item) => item.comparableWorkId)
    );
  }
  return draft(
    "comparable_works_strength",
    "Comparable works strength",
    "neutral",
    0.14,
    0.02,
    "System comparable works are usable but limited.",
    selected.map((item) => item.comparableWorkId)
  );
}

function sameAuthorContribution(comparableWorks = {}) {
  const references = comparableWorks.sameAuthorReferenceWorks ?? [];
  if (references.length === 0) {
    return draft(
      "same_author_reference_strength",
      "Same-author reference strength",
      "neutral",
      0.08,
      0,
      "No same-author synthetic reference work is available.",
      []
    );
  }
  return draft(
    "same_author_reference_strength",
    "Same-author reference strength",
    "increase",
    0.08,
    Math.min(0.06, references.length * 0.015),
    "Same-author synthetic reference works support the point estimate.",
    references.map((item) => item.authorWorkId)
  );
}

function authorRankingContribution(authorRanking = {}) {
  if (!authorRanking.enabled) {
    return draft(
      "author_ranking_tier",
      "Author ranking tier",
      "neutral",
      0.1,
      0,
      `Author ranking is disabled: ${authorRanking.disabledReason ?? "unknown"}.`,
      [authorRanking.disabledReason ?? "unknown"]
    );
  }
  const deltaByTier = {
    author_tier_high: 0.09,
    author_tier_mid: 0.05,
    author_tier_watch: 0.02,
    author_tier_limited: -0.02
  };
  const factorDelta = deltaByTier[authorRanking.authorTier] ?? 0;
  return draft(
    "author_ranking_tier",
    "Author ranking tier",
    directionFor(factorDelta),
    0.1,
    factorDelta,
    "Synthetic author ranking is included as an explanation signal.",
    [authorRanking.authorTier ?? "none"]
  );
}

function adaptationContribution(fields) {
  const signals = Array.isArray(fields.adaptationSignals) ? fields.adaptationSignals : [];
  if (signals.length === 0) {
    return draft(
      "adaptation_signal_boost",
      "Adaptation signal boost",
      "neutral",
      0.08,
      0,
      "No adaptation signal is present.",
      []
    );
  }
  return draft(
    "adaptation_signal_boost",
    "Adaptation signal boost",
    "increase",
    0.08,
    Math.min(0.08, signals.length * 0.03),
    "Adaptation signals raise candidate rating and point estimate explanation.",
    signals
  );
}

function sourceContribution(fields) {
  if (fields.source === "publication") {
    return draft(
      "source_type",
      "Source type",
      "increase",
      0.06,
      0.02,
      "Publication source is slightly favored in the synthetic fixture.",
      [fields.source]
    );
  }
  if (fields.source === "web_original") {
    return draft(
      "source_type",
      "Source type",
      "neutral",
      0.06,
      0,
      "Web original source remains eligible when readiness is satisfied.",
      [fields.source]
    );
  }
  return draft(
    "source_type",
    "Source type",
    "decrease",
    0.06,
    -0.05,
    "Unsupported or missing source weakens the point estimate.",
    [fields.source ?? "missing"]
  );
}

function targetChannelContribution(fields) {
  const channels = Array.isArray(fields.targetChannels) ? fields.targetChannels : [];
  if (channels.length === 0) {
    return draft(
      "target_channel_suitability",
      "Target channel suitability",
      "decrease",
      0.1,
      -0.08,
      "No target channel is available.",
      []
    );
  }
  const averageFit =
    channels.reduce((total, channel) => total + positiveNumber(channel.channelFit, 1), 0) / channels.length;
  const factorDelta = averageFit > 1.02 ? 0.04 : averageFit < 0.9 ? -0.03 : 0;
  return draft(
    "target_channel_suitability",
    "Target channel suitability",
    directionFor(factorDelta),
    0.1,
    factorDelta,
    "Target channel fit is applied before channels are summed.",
    channels.map((channel) => channel.channelId ?? channel.channelName ?? "synthetic_channel")
  );
}

function sameNameAudioContribution(fields, externalEvidence = []) {
  const sameNameEvidenceCount = externalEvidence.filter((item) => item.evidenceType === "sameNameAudioEvidence").length;
  if (fields.sameNameAudioStatus === "has") {
    return draft(
      "same_name_audio_risk",
      "Same-name audio risk",
      "decrease",
      0.12,
      -0.12,
      "Existing same-name audio creates a candidate risk.",
      ["has"]
    );
  }
  if (fields.sameNameAudioStatus === "unknown") {
    return draft(
      "same_name_audio_risk",
      "Same-name audio risk",
      "decrease",
      0.08,
      -0.05,
      "Same-name audio status is checked but unknown.",
      ["unknown"]
    );
  }
  return draft(
    "same_name_audio_risk",
    "Same-name audio risk",
    "neutral",
    0.08,
    0,
    sameNameEvidenceCount > 0
      ? "Structured same-name audio evidence is present and does not indicate a risk."
      : "No same-name audio risk is present in the synthetic fixture.",
    [fields.sameNameAudioStatus ?? "missing", `evidence_count:${sameNameEvidenceCount}`]
  );
}

function materialCompletenessContribution(readiness = {}) {
  const warnings = readiness.warningCodes ?? [];
  if (warnings.length === 0) {
    return draft(
      "material_completeness_warning",
      "Material completeness warning",
      "neutral",
      0.08,
      0,
      "No material completeness warning is present.",
      []
    );
  }
  return draft(
    "material_completeness_warning",
    "Material completeness warning",
    "decrease",
    0.08,
    -Math.min(0.08, warnings.length * 0.012),
    "Material warnings reduce confidence and are surfaced for review.",
    warnings
  );
}

function buyoutTreatmentContribution(comparableWorks = {}) {
  const selected = comparableWorks.systemSelected ?? [];
  const excluded = comparableWorks.excluded ?? [];
  const hasSeparatedBuyout =
    selected.some((item) => item.buyoutTreatment === "sales_component_used_buyout_component_reported_separately") ||
    excluded.some((item) => item.excludedReasonCode === "pure_buyout_historical_value_only");
  if (!hasSeparatedBuyout) {
    return draft(
      "buyout_treatment_limitation",
      "Buyout treatment limitation",
      "neutral",
      0.06,
      0,
      "No buyout treatment limitation is triggered by selected comparables.",
      []
    );
  }
  return draft(
    "buyout_treatment_limitation",
    "Buyout treatment limitation",
    "decrease",
    0.06,
    -0.02,
    "Buyout evidence is separated and not mixed into direct sales-curve comparison.",
    ["buyout_separated"]
  );
}

function buildLimitations(comparableWorks = {}, evidenceSummary = {}) {
  const limitations = [
    "Synthetic fixture weighting only.",
    "Point estimate only; no forecast range is emitted.",
    "No direct development recommendation is emitted.",
    "No resource investment level is emitted."
  ];
  if ((comparableWorks.excluded ?? []).some((item) => item.excludedReasonCode === "pure_buyout_historical_value_only")) {
    limitations.push("Pure buyout comparables are separated as historical value references.");
  }
  if ((evidenceSummary.lowConfidenceEvidenceCount ?? 0) > 0) {
    limitations.push("Low-confidence external evidence is explanation-only.");
  }
  if ((evidenceSummary.gptWebAssistedSummaryCount ?? 0) > 0) {
    limitations.push("GPT web-assisted summaries are not automatic facts and require structured sources.");
  }
  return limitations;
}

function buildConfidenceNotes(readiness = {}, comparableWorks = {}, authorRanking = {}, evidenceSummary = {}) {
  const notes = [];
  if ((readiness.warningCodes ?? []).length > 0) {
    notes.push(`Readiness warnings: ${(readiness.warningCodes ?? []).join(", ")}`);
  }
  notes.push(`System comparable count: ${(comparableWorks.systemSelected ?? []).length}`);
  if (authorRanking.enabled) {
    notes.push(`Author ranking enabled: ${authorRanking.authorTier}`);
  } else {
    notes.push(`Author ranking disabled: ${authorRanking.disabledReason ?? "unknown"}`);
  }
  notes.push(`External evidence count: ${sumEvidenceCount(evidenceSummary)}`);
  notes.push(`Manual-confirmed evidence count: ${evidenceSummary.manualConfirmedEvidenceCount ?? 0}`);
  return notes;
}

function sumEvidenceCount(evidenceSummary = {}) {
  return (
    (evidenceSummary.heatSignalEvidenceCount ?? 0) +
    (evidenceSummary.sameNameAudioEvidenceCount ?? 0) +
    (evidenceSummary.adaptationEvidenceCount ?? 0) +
    (evidenceSummary.publicationEvidenceCount ?? 0) +
    (evidenceSummary.reviewReputationEvidenceCount ?? 0) +
    (evidenceSummary.operatorResearchNoteCount ?? 0) +
    (evidenceSummary.gptWebAssistedSummaryCount ?? 0)
  );
}

function draft(signalCode, signalName, direction, weight, factorDelta, explanation, limitations) {
  return {
    signalCode,
    signalName,
    direction,
    weight,
    factorDelta,
    explanation,
    limitations
  };
}

function toContribution(draftValue, referenceAmount) {
  return {
    signalCode: draftValue.signalCode,
    signalName: draftValue.signalName,
    direction: draftValue.direction,
    weight: round(draftValue.weight),
    contributionAmount: round(referenceAmount * draftValue.factorDelta),
    explanation: draftValue.explanation,
    limitations: draftValue.limitations ?? []
  };
}

function directionFor(factorDelta) {
  if (factorDelta > 0) return "increase";
  if (factorDelta < 0) return "decrease";
  return "neutral";
}

function positiveNumber(value, fallback) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value) {
  return Math.round(value * 100) / 100;
}
