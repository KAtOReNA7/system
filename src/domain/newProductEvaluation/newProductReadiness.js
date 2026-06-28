import {
  M3_SOURCE_VALUES,
  hasUsableHeatSignal
} from "./materialFieldExtractor.js";

export const M3_HARD_BLOCKER_CODES = Object.freeze([
  "missing_title",
  "missing_author",
  "missing_source",
  "unsupported_source",
  "missing_classification",
  "missing_heat_signal",
  "missing_copyright_term",
  "missing_target_channels"
]);

export const M3_WARNING_CODES = Object.freeze([
  "classification_requires_user_confirmation",
  "missing_synopsis",
  "missing_volume_estimate",
  "missing_completion_status",
  "missing_comment_count",
  "missing_same_name_audio_status",
  "missing_adaptation_signals",
  "missing_operator_reason",
  "missing_operator_comparators",
  "missing_material_source",
  "missing_material_updated_at",
  "missing_input_confirmed_by"
]);

export function evaluateNewProductReadiness(parsedMaterial) {
  const fields = parsedMaterial?.normalizedFields ?? parsedMaterial ?? {};
  const hardBlockers = [];
  const warnings = [];

  requireField(hardBlockers, fields.title, "missing_title", "title is required.");
  requireField(hardBlockers, fields.author, "missing_author", "author is required.");
  requireField(hardBlockers, fields.source, "missing_source", "source is required.");
  if (fields.source && !M3_SOURCE_VALUES.includes(fields.source)) {
    hardBlockers.push(reason("unsupported_source", "source must be publication or web_original."));
  }
  if (!hasListValue(fields.confirmedClassification) && !hasListValue(fields.classificationCandidate)) {
    hardBlockers.push(reason("missing_classification", "classification candidate or confirmed classification is required."));
  }
  if (!hasUsableHeatSignal(fields)) {
    hardBlockers.push(reason("missing_heat_signal", "at least one usable heat signal is required."));
  }
  requireField(hardBlockers, fields.copyrightTermRange, "missing_copyright_term", "copyright term range is required.");
  if (!hasListValue(fields.targetChannels)) {
    hardBlockers.push(reason("missing_target_channels", "target channels are required for channel-level forecast."));
  }

  if (hasListValue(fields.classificationCandidate) && !hasListValue(fields.confirmedClassification)) {
    warnings.push(reason("classification_requires_user_confirmation", "classification candidate must be confirmed by user."));
  }
  addWarningIfMissing(warnings, fields.synopsis, "missing_synopsis", "synopsis is missing.");
  if (!hasValue(fields.wordCount) && !hasValue(fields.audioVolumeEstimate)) {
    warnings.push(reason("missing_volume_estimate", "word count or audio volume estimate is missing."));
  }
  addWarningIfMissing(warnings, fields.completionStatus, "missing_completion_status", "completion status is missing.");
  addWarningIfMissing(warnings, fields.commentCount, "missing_comment_count", "comment count is missing.");
  addWarningIfMissing(warnings, fields.sameNameAudioStatus, "missing_same_name_audio_status", "same-name audio status is missing.");
  if (!hasListValue(fields.adaptationSignals)) {
    warnings.push(reason("missing_adaptation_signals", "adaptation signals are missing."));
  }
  addWarningIfMissing(warnings, fields.operatorRecommendationReason, "missing_operator_reason", "operator reason is missing.");
  if (!hasListValue(fields.operatorComparators)) {
    warnings.push(reason("missing_operator_comparators", "operator comparators are missing."));
  }
  addWarningIfMissing(warnings, fields.materialSource, "missing_material_source", "material source is missing.");
  addWarningIfMissing(warnings, fields.materialUpdatedAt, "missing_material_updated_at", "material update time is missing.");
  addWarningIfMissing(warnings, fields.inputConfirmedBy, "missing_input_confirmed_by", "input confirmer is missing.");

  const readinessStatus =
    hardBlockers.length > 0 ? "blocked" : warnings.length > 0 ? "warning_only" : "ready";

  return {
    readinessStatus,
    numericForecastAllowed: hardBlockers.length === 0,
    nonFormal: true,
    hardBlockers,
    warnings,
    hardBlockerCodes: hardBlockers.map((item) => item.code),
    warningCodes: warnings.map((item) => item.code),
    manualCompletionRequired: warnings
      .filter((item) => item.code === "classification_requires_user_confirmation")
      .map((item) => ({ code: "confirm_classification", sourceWarningCode: item.code })),
    notForFormalDecision: true
  };
}

function requireField(reasons, value, code, message) {
  if (!hasValue(value)) {
    reasons.push(reason(code, message));
  }
}

function addWarningIfMissing(reasons, value, code, message) {
  if (!hasValue(value)) {
    reasons.push(reason(code, message));
  }
}

function reason(code, message) {
  return { code, message };
}

function hasListValue(value) {
  return Array.isArray(value) && value.length > 0;
}

function hasValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}
