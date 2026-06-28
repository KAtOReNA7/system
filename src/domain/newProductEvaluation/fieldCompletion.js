import { evaluateNewProductMaterial } from "./newProductEvaluationEngine.js";

export const M3_CORE_COMPLETION_FIELDS = Object.freeze([
  "title",
  "author",
  "source",
  "classification",
  "wordCountOrAudioVolumeEstimate",
  "heatSignal",
  "copyrightTermRange",
  "targetChannels",
  "sameNameAudioStatusCheckStatus",
  "completionStatus"
]);

const HARD_BLOCKER_TO_CORE_FIELDS = Object.freeze({
  missing_title: ["title"],
  missing_author: ["author"],
  missing_source: ["source"],
  unsupported_source: ["source"],
  missing_classification: ["classification"],
  missing_volume_estimate: ["wordCountOrAudioVolumeEstimate"],
  missing_heat_signal: ["heatSignal"],
  missing_copyright_term: ["copyrightTermRange"],
  missing_target_channels: ["targetChannels"],
  missing_same_name_audio_check_status: ["sameNameAudioStatusCheckStatus"],
  same_name_audio_not_checked: ["sameNameAudioStatusCheckStatus"],
  missing_completion_status_web_original: ["completionStatus"]
});

export function deriveMissingCoreFields(hardBlockers = []) {
  const fields = [];
  for (const blocker of hardBlockers) {
    for (const field of HARD_BLOCKER_TO_CORE_FIELDS[blocker] ?? []) {
      fields.push(field);
    }
  }
  return [...new Set(fields)].filter((field) => M3_CORE_COMPLETION_FIELDS.includes(field));
}

export function applyFieldCompletionRows(rows = [], options = {}) {
  const materialResults = rows.map((row) => applyFieldCompletionRow(row, options));
  return {
    ok: true,
    materialResults,
    aggregate: buildFieldCompletionAggregate(materialResults),
    guardrails: {
      rawMaterialStored: false,
      rawTextPersisted: false,
      realFileNamesPrinted: false,
      userFieldValuesPrinted: false,
      databaseConnected: false,
      dockerExecuted: false,
      migrationExecuted: false,
      formalExecution: false,
      notForFormalDecision: true
    }
  };
}

export function applyFieldCompletionRow(row, options = {}) {
  const fields = normalizeUserFields(row.userFields ?? {});
  const material = buildMaterialFromCompletionRow(row, fields);
  const evaluation = evaluateNewProductMaterial(material, evaluationOptionsFor(row, options));
  const hardBlockers = evaluation.readiness?.hardBlockerCodes ?? [];
  const missingCoreFields = deriveMissingCoreFields(hardBlockers);
  const readinessStatus = evaluation.readiness?.readinessStatus ?? "blocked";
  const ratingGenerated = readinessStatus !== "blocked" && hasValue(evaluation.candidateRating?.rating);

  return {
    anonymousMaterialId: row.anonymousMaterialId,
    inputExtension: row.inputExtension,
    sourceParseStatus: row.parseStatus,
    manualFieldKeys: Object.keys(fields).sort(),
    manualCoreFieldsCompleted: completedCoreFields(fields),
    completionApplied: Object.keys(fields).length > 0,
    readinessStatus,
    hardBlockers,
    missingCoreFields,
    warnings: evaluation.readiness?.warningCodes ?? [],
    researchQuestionCount: evaluation.researchQuestions?.length ?? 0,
    externalEvidenceCount: evaluation.externalEvidence?.length ?? 0,
    comparablesSummary: summarizeComparables(evaluation.comparableWorks),
    authorRankingSummary: summarizeAuthorRanking(evaluation.authorRanking),
    forecastSummary: summarizeForecast(evaluation.forecast),
    ratingSummary: ratingGenerated
      ? summarizeRating(evaluation.candidateRating)
      : suppressedRatingSummary(),
    ratingStatus: ratingGenerated ? "generated" : "not_generated_due_to_readiness_blocked",
    candidateRatingGenerated: Boolean(ratingGenerated),
    workflowState: summarizeWorkflow(evaluation.workflow),
    backtestAnchorStatus: evaluation.backtestAnchor?.anchorStatus ?? "not_created",
    rawMaterialStored: false,
    rawTextPersisted: false,
    notForFormalDecision: true
  };
}

export function buildMaterialFromCompletionRow(row, fields = normalizeUserFields(row.userFields ?? {})) {
  return {
    materialId: row.anonymousMaterialId,
    materialType: "field_completion_material",
    inputMode: "material_first",
    fields,
    confidenceByField: Object.fromEntries(Object.keys(fields).map((key) => [key, 0.92])),
    materialMetadata: {
      anonymousMaterialId: row.anonymousMaterialId,
      inputExtension: row.inputExtension,
      completionPackApplied: true,
      rawMaterialStored: false,
      rawTextPersisted: false
    }
  };
}

export function normalizeUserFields(userFields) {
  const fields = {};
  assignString(fields, "title", userFields.title);
  assignString(fields, "author", userFields.author);
  assignString(fields, "source", userFields.source);
  assignList(fields, "confirmedClassification", userFields.classification);
  assignNumber(fields, "wordCount", userFields.wordCount);
  assignNumber(fields, "audioVolumeEstimate", userFields.audioVolumeEstimate);
  assignHeatSignal(fields, userFields.heatSignalType, userFields.heatSignalValue);
  assignString(fields, "copyrightTermRange", userFields.copyrightTermRange);
  assignList(fields, "targetChannels", userFields.targetChannels);
  assignString(fields, "sameNameAudioStatusCheckStatus", userFields.sameNameAudioStatusCheckStatus);
  assignString(fields, "sameNameAudioStatus", userFields.sameNameAudioStatus);
  assignString(fields, "completionStatus", userFields.completionStatus);
  return fields;
}

export function buildFieldCompletionAggregate(materialResults) {
  return {
    materialCount: materialResults.length,
    readinessDistribution: countBy(materialResults, "readinessStatus"),
    forecastStatusDistribution: countBy(materialResults.map((item) => item.forecastSummary), "forecastStatus"),
    ratingStatusDistribution: countBy(materialResults, "ratingStatus"),
    backtestAnchorDistribution: countBy(materialResults, "backtestAnchorStatus"),
    missingCoreFieldDistribution: countListValues(materialResults, "missingCoreFields"),
    completionAppliedCount: materialResults.filter((item) => item.completionApplied).length,
    forecastGeneratedCount: materialResults.filter((item) => item.forecastSummary.forecastStatus === "generated").length,
    ratingGeneratedCount: materialResults.filter((item) => item.candidateRatingGenerated).length,
    workflowCompletedCount: materialResults.filter((item) =>
      ["fixture_evaluation_completed", "backtest_anchor_candidate", "backtest_anchor_locked_fixture"].includes(
        item.workflowState.currentState
      )
    ).length,
    backtestAnchorCandidateCount: materialResults.filter((item) =>
      ["candidate", "eligible_anchor_candidate", "locked_fixture"].includes(item.backtestAnchorStatus)
    ).length,
    rawMaterialStored: false,
    realFileNamesPrinted: false,
    notForFormalDecision: true
  };
}

function evaluationOptionsFor(row, options) {
  if (options.externalEvidenceByMaterialId && Object.hasOwn(options.externalEvidenceByMaterialId, row.anonymousMaterialId)) {
    return { externalEvidence: options.externalEvidenceByMaterialId[row.anonymousMaterialId] };
  }
  if (options.externalEvidence !== undefined) {
    return { externalEvidence: options.externalEvidence };
  }
  if (options.disableFixtureEvidence === true) {
    return { externalEvidence: [] };
  }
  return {};
}

function assignString(fields, key, value) {
  if (typeof value === "string" && value.trim()) {
    fields[key] = value.trim();
  }
}

function assignNumber(fields, key, value) {
  if (value === null || value === undefined || value === "") return;
  const numberValue = Number(String(value).replace(/,/g, ""));
  if (Number.isFinite(numberValue)) {
    fields[key] = numberValue;
  }
}

function assignList(fields, key, value) {
  if (Array.isArray(value) && value.length > 0) {
    fields[key] = value.filter(Boolean);
    return;
  }
  if (typeof value === "string" && value.trim()) {
    fields[key] = value.split(/[;,\n]/).map((item) => item.trim()).filter(Boolean);
  }
}

function assignHeatSignal(fields, type, value) {
  const signalType = String(type ?? "").trim();
  const signalValue = String(value ?? "").trim();
  if (!signalType || !signalValue) return;
  if (["reads", "collections", "ratingScore", "commentCount"].includes(signalType)) {
    const numberValue = Number(signalValue.replace(/,/g, ""));
    if (Number.isFinite(numberValue)) {
      fields[signalType] = numberValue;
    }
    return;
  }
  if (["rankings", "searchHeat", "socialHeat", "platformHeat", "externalHeat"].includes(signalType)) {
    fields[signalType] = { summary: signalValue };
  }
}

function completedCoreFields(fields) {
  const completed = [];
  if (fields.title) completed.push("title");
  if (fields.author) completed.push("author");
  if (fields.source) completed.push("source");
  if (fields.confirmedClassification?.length > 0 || fields.classificationCandidate?.length > 0) completed.push("classification");
  if (fields.wordCount || fields.audioVolumeEstimate) completed.push("wordCountOrAudioVolumeEstimate");
  if (hasHeatSignal(fields)) completed.push("heatSignal");
  if (fields.copyrightTermRange) completed.push("copyrightTermRange");
  if (fields.targetChannels?.length > 0) completed.push("targetChannels");
  if (fields.sameNameAudioStatusCheckStatus) completed.push("sameNameAudioStatusCheckStatus");
  if (fields.completionStatus) completed.push("completionStatus");
  return completed;
}

function hasHeatSignal(fields) {
  return ["reads", "collections", "ratingScore", "commentCount", "rankings", "searchHeat", "socialHeat", "platformHeat", "externalHeat"]
    .some((key) => fields[key] !== undefined);
}

function summarizeForecast(forecast = {}) {
  return {
    forecastStatus: forecast.forecastStatus ?? "not_generated",
    forecastShape: forecast.forecastShape ?? "point_estimate_only",
    pointEstimateOnly: forecast.pointEstimateOnly === true,
    channelCount: forecast.channelForecasts?.length ?? 0,
    firstYearForecast: forecast.totalForecast?.firstYearForecast ?? null,
    fiveYearTotal: forecast.totalForecast?.fiveYearTotal ?? null,
    confidence: forecast.confidence ?? null,
    blockedBy: forecast.blockedBy ?? []
  };
}

function summarizeRating(candidateRating = {}) {
  return {
    ratingType: candidateRating.ratingType ?? "new_product_candidate_rating",
    rating: candidateRating.rating ?? candidateRating.value ?? null,
    ratingStatus: "generated",
    candidateRatingGenerated: true,
    ratingBasis: candidateRating.ratingBasis ?? null,
    supportFactorCount: candidateRating.supportFactors?.length ?? 0,
    warningFactorCount: candidateRating.warningFactors?.length ?? 0,
    limitingFactorCount: candidateRating.limitingFactors?.length ?? 0
  };
}

function suppressedRatingSummary() {
  return {
    ratingType: "new_product_candidate_rating",
    rating: null,
    ratingStatus: "not_generated_due_to_readiness_blocked",
    candidateRatingGenerated: false,
    ratingBasis: null,
    supportFactorCount: 0,
    warningFactorCount: 0,
    limitingFactorCount: 0
  };
}

function summarizeWorkflow(workflow = {}) {
  return {
    currentState: workflow.currentState ?? null,
    completedStepCount: workflow.completedSteps?.length ?? 0,
    pendingStepCount: workflow.pendingSteps?.length ?? 0,
    blockedReasons: workflow.blockedReasons ?? [],
    warnings: workflow.warnings ?? []
  };
}

function summarizeComparables(comparableWorks = {}) {
  return {
    systemComparableCount: comparableWorks.systemSelected?.length ?? 0,
    operatorComparatorCount: comparableWorks.operatorSpecified?.length ?? 0,
    sameAuthorReferenceCount: comparableWorks.sameAuthorReferenceWorks?.length ?? 0,
    excludedComparableCount: comparableWorks.excluded?.length ?? 0
  };
}

function summarizeAuthorRanking(authorRanking = {}) {
  return {
    enabled: authorRanking.enabled === true,
    disabledReason: authorRanking.disabledReason ?? null,
    measurableWorkCount: authorRanking.measurableWorkCount ?? 0,
    authorTier: authorRanking.authorTier ?? null
  };
}

function countBy(values, key) {
  return values.reduce((counts, value) => {
    const group = value?.[key] ?? "unknown";
    counts[group] = (counts[group] ?? 0) + 1;
    return counts;
  }, {});
}

function countListValues(values, key) {
  return values.reduce((counts, value) => {
    for (const item of value[key] ?? []) {
      counts[item] = (counts[item] ?? 0) + 1;
    }
    return counts;
  }, {});
}

function hasValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}
