import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateNewProductMaterial } from "../../src/domain/newProductEvaluation/newProductEvaluationEngine.js";
import {
  DEFAULT_INPUT_DIR,
  DEFAULT_OUTPUT_DIR,
  checkM3PrivateDryRunSafety,
  collectInputInventory,
  groupPrimaryMaterials
} from "./check_m3_private_dry_run_safety.js";

export const PRIVATE_RESULT_JSON = "M3-private-material-dry-run-result-v0.1.json";
export const PRIVATE_RESULT_MARKDOWN = "M3-private-material-dry-run-result-v0.1.md";

const TEXT_EXTENSIONS = new Set([".txt", ".md"]);
const LEGACY_DOC_EXTENSIONS = new Set([".doc"]);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png"]);
const DOCUMENT_METADATA_EXTENSIONS = new Set([".docx", ".pdf", ".pptx"]);
const SPREADSHEET_EXTENSIONS = new Set([".xlsx"]);
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const IS_CLI = path.resolve(process.argv[1] ?? "") === path.resolve(SCRIPT_PATH);

const FIELD_KEY_MAP = new Map([
  ["title", "title"],
  ["workTitle", "title"],
  ["author", "author"],
  ["source", "source"],
  ["classification", "classificationCandidate"],
  ["classificationCandidate", "classificationCandidate"],
  ["confirmedClassification", "confirmedClassification"],
  ["synopsis", "synopsis"],
  ["wordCount", "wordCount"],
  ["audioVolumeEstimate", "audioVolumeEstimate"],
  ["completionStatus", "completionStatus"],
  ["reads", "reads"],
  ["collections", "collections"],
  ["ratingScore", "ratingScore"],
  ["commentCount", "commentCount"],
  ["rankings", "rankings"],
  ["searchHeat", "searchHeat"],
  ["socialHeat", "socialHeat"],
  ["platformHeat", "platformHeat"],
  ["sameNameAudioStatus", "sameNameAudioStatus"],
  ["sameNameAudioStatusCheckStatus", "sameNameAudioStatusCheckStatus"],
  ["adaptationSignals", "adaptationSignals"],
  ["externalHeat", "externalHeat"],
  ["targetChannels", "targetChannels"],
  ["copyrightTermRange", "copyrightTermRange"],
  ["operatorRecommendationReason", "operatorRecommendationReason"],
  ["operatorComparators", "operatorComparators"],
  ["materialSource", "materialSource"],
  ["materialUpdatedAt", "materialUpdatedAt"],
  ["inputConfirmedBy", "inputConfirmedBy"]
]);

export function runM3PrivateMaterialDryRun(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const inputDir = options.inputDir ?? DEFAULT_INPUT_DIR;
  const outputDir = options.outputDir ?? DEFAULT_OUTPUT_DIR;
  const safety = checkM3PrivateDryRunSafety({
    repoRoot,
    inputDir,
    outputDir,
    skipGitChecks: options.skipGitChecks === true
  });

  if (!safety.ok) {
    return {
      ok: false,
      safety,
      preparationGuidance: buildPreparationGuidance(safety),
      dryRunExecuted: false,
      privateMaterialRead: false,
      databaseConnected: false,
      dockerExecuted: false,
      formalExecution: false
    };
  }

  const absoluteInputDir = path.join(repoRoot, safety.inputDir);
  const absoluteOutputDir = path.join(repoRoot, safety.outputDir);
  mkdirSync(absoluteOutputDir, { recursive: true });
  const materialGroups = groupPrimaryMaterials(collectInputInventory(absoluteInputDir));
  const materialResults = materialGroups.map((item) => evaluatePrivateMaterialGroup(item));
  const result = {
    ok: true,
    version: "m3-private-material-dry-run-v0.2",
    generatedAt: new Date().toISOString(),
    inputDir: safety.inputDir,
    outputDir: safety.outputDir,
    safety: stripSensitiveSafety(safety),
    aggregate: buildAggregate(materialResults),
    sections: buildSections(materialResults),
    materialResults,
    guardrails: {
      privateMaterialRead: true,
      rawMaterialStored: false,
      rawTextPersisted: false,
      realFileNamesPrinted: false,
      publicMaterialValuesWritten: false,
      externalSearchCalled: false,
      chatGptWebCalled: false,
      browserAutomationCalled: false,
      ocrCalled: false,
      databaseConnected: false,
      dockerExecuted: false,
      migrationExecuted: false,
      formalExecution: false,
      notForFormalDecision: true
    }
  };

  const outputJson = path.join(absoluteOutputDir, PRIVATE_RESULT_JSON);
  const outputMarkdown = path.join(absoluteOutputDir, PRIVATE_RESULT_MARKDOWN);
  writeFileSync(outputJson, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdown, buildPrivateMarkdown(result), "utf8");

  return {
    ok: true,
    dryRunExecuted: true,
    privateMaterialRead: true,
    outputJson: path.join(safety.outputDir, PRIVATE_RESULT_JSON).replaceAll("\\", "/"),
    outputMarkdown: path.join(safety.outputDir, PRIVATE_RESULT_MARKDOWN).replaceAll("\\", "/"),
    aggregate: result.aggregate,
    guardrails: result.guardrails
  };
}

export function evaluatePrivateMaterialGroup(group) {
  const companionText = readCompanionText(group);
  if (TEXT_EXTENSIONS.has(group.extension)) {
    const text = readFileSync(group.absolutePath, "utf8");
    return evaluateTextMaterial(group, text, "parsed_from_text");
  }

  if (companionText !== null) {
    return evaluateTextMaterial(group, companionText, "parsed_from_companion_text_enhanced");
  }

  if (LEGACY_DOC_EXTENSIONS.has(group.extension)) {
    return summarizeMetadataOnly(group, "accepted_legacy_doc_metadata_only");
  }
  if (IMAGE_EXTENSIONS.has(group.extension)) {
    return summarizeMetadataOnly(group, "accepted_image_metadata_only");
  }
  if (DOCUMENT_METADATA_EXTENSIONS.has(group.extension)) {
    return summarizeMetadataOnly(group, "accepted_document_metadata_only");
  }
  if (SPREADSHEET_EXTENSIONS.has(group.extension)) {
    return summarizeMetadataOnly(group, "accepted_spreadsheet_metadata_only");
  }

  return summarizeMetadataOnly(group, "unsupported_extension");
}

export function extractFieldsFromText(text) {
  const fields = {};
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const match = line.match(/^\s*([^:：]{1,48})\s*[:：]\s*(.+?)\s*$/);
    if (!match) continue;
    const mappedKey = FIELD_KEY_MAP.get(match[1].trim());
    if (!mappedKey) continue;
    fields[mappedKey] = normalizeParsedValue(mappedKey, match[2]);
  }
  return fields;
}

export function buildPublicAggregateSummary(result) {
  return {
    ok: result.ok === true,
    materialGroupCount: result.aggregate?.materialGroupCount ?? 0,
    extensionDistribution: result.aggregate?.extensionDistribution ?? {},
    parseStatusDistribution: result.aggregate?.parseStatusDistribution ?? {},
    readinessDistribution: result.aggregate?.readinessDistribution ?? {},
    forecastStatusDistribution: result.aggregate?.forecastStatusDistribution ?? {},
    ratingGeneratedCount: result.aggregate?.ratingGeneratedCount ?? 0,
    ratingNotGeneratedCount: result.aggregate?.ratingNotGeneratedCount ?? 0,
    rawMaterialStored: false,
    realFileNamesPrinted: false,
    notForFormalDecision: true
  };
}

function evaluateTextMaterial(group, text, parseStatus) {
  const fields = extractFieldsFromText(text);
  const material = buildAnonymousMaterial(group, fields);
  const evaluation = evaluateNewProductMaterial(material, { externalEvidence: [] });
  return summarizeEvaluation({
    group,
    parseStatus,
    fields,
    evaluation,
    manualExtractionRequired: Object.keys(fields).length === 0
  });
}

function summarizeMetadataOnly(group, parseStatus) {
  const manualExtractionRequired = true;
  const visualExtractionRequired = IMAGE_EXTENSIONS.has(group.extension);
  const legacyDocExtractionRequired = LEGACY_DOC_EXTENSIONS.has(group.extension);
  const hardBlockers = [
    "missing_title",
    "missing_author",
    "missing_source",
    "missing_classification",
    "missing_volume_estimate",
    "missing_heat_signal",
    "missing_copyright_term",
    "missing_target_channels",
    "manual_extraction_required"
  ];
  if (visualExtractionRequired) hardBlockers.push("visual_extraction_required");
  if (legacyDocExtractionRequired) hardBlockers.push("legacy_doc_extraction_required");
  return {
    anonymousMaterialId: group.anonymousMaterialId,
    extension: group.extension,
    inputExtension: group.extension,
    parseStatus,
    acceptedAsPrimaryMaterial: true,
    hasCompanionText: group.hasCompanionText,
    manualExtractionRequired,
    visualExtractionRequired,
    legacyDocExtractionRequired,
    extractedFields: [],
    extractedFieldKeys: [],
    missingFields: hardBlockers.filter((code) => code.startsWith("missing_")),
    readinessStatus: "blocked",
    hardBlockers,
    warnings: [],
    researchQuestions: buildManualResearchQuestions(group, hardBlockers),
    externalEvidenceSummary: emptyCountSummary(),
    comparablesSummary: emptyComparableSummary(),
    authorRankingSummary: { enabled: false, disabledReason: "manual_extraction_required" },
    channelForecastSummary: { forecastStatus: "blocked", pointEstimateOnly: true, channelCount: 0 },
    ratingSummary: suppressedRatingSummary(),
    ratingStatus: "not_generated_due_to_readiness_blocked",
    candidateRatingGenerated: false,
    workflowState: { currentState: "readiness_blocked", blockedReasons: hardBlockers },
    backtestAnchorStatus: "not_eligible_readiness_blocked",
    userFeedbackFields: buildUserFeedbackFields(),
    rawMaterialStored: false,
    rawTextPersisted: false,
    notForFormalDecision: true
  };
}

function summarizeEvaluation({ group, parseStatus, fields, evaluation, manualExtractionRequired }) {
  const readinessStatus = evaluation.readiness?.readinessStatus ?? "blocked";
  const ratingSummary = readinessStatus === "blocked"
    ? suppressedRatingSummary()
    : summarizeRating(evaluation.candidateRating);
  return {
    anonymousMaterialId: group.anonymousMaterialId,
    extension: group.extension,
    inputExtension: group.extension,
    parseStatus,
    acceptedAsPrimaryMaterial: true,
    hasCompanionText: group.hasCompanionText,
    manualExtractionRequired,
    visualExtractionRequired: false,
    legacyDocExtractionRequired: false,
    extractedFields: summarizeExtractedFields(evaluation.parsedMaterial?.extractedFields ?? []),
    extractedFieldKeys: Object.keys(fields).sort(),
    missingFields: evaluation.parsedMaterial?.missingFields ?? [],
    readinessStatus,
    hardBlockers: evaluation.readiness?.hardBlockerCodes ?? [],
    warnings: evaluation.readiness?.warningCodes ?? [],
    researchQuestions: sanitizeResearchQuestions(evaluation.researchQuestions ?? []),
    externalEvidenceSummary: evaluation.evidenceSummary ?? emptyCountSummary(),
    comparablesSummary: summarizeComparables(evaluation.comparableWorks),
    authorRankingSummary: summarizeAuthorRanking(evaluation.authorRanking),
    channelForecastSummary: summarizeForecast(evaluation.forecast),
    ratingSummary,
    ratingStatus: ratingSummary.ratingStatus,
    candidateRatingGenerated: ratingSummary.candidateRatingGenerated,
    workflowState: summarizeWorkflow(evaluation.workflow),
    backtestAnchorStatus: evaluation.backtestAnchor?.anchorStatus ?? "not_created",
    userFeedbackFields: buildUserFeedbackFields(),
    rawMaterialStored: false,
    rawTextPersisted: false,
    notForFormalDecision: true
  };
}

function readCompanionText(group) {
  if (!group.hasCompanionText) return null;
  const companion = group.companionTextFiles[0];
  return readFileSync(companion.absolutePath, "utf8");
}

function buildAnonymousMaterial(group, fields) {
  return {
    materialId: group.anonymousMaterialId,
    materialType: "private_material",
    inputMode: "material_first",
    fields,
    confidenceByField: Object.fromEntries(Object.keys(fields).map((key) => [key, 0.78])),
    materialMetadata: {
      anonymousMaterialId: group.anonymousMaterialId,
      inputExtension: group.extension,
      hasCompanionText: group.hasCompanionText,
      rawMaterialStored: false,
      rawTextPersisted: false
    }
  };
}

function buildManualResearchQuestions(group, hardBlockers) {
  return [
    {
      questionId: `${group.anonymousMaterialId}-RQ-001`,
      missingFieldOrRisk: "manual_extraction_required",
      priority: "high",
      evidenceTypesExpected: ["manualEvidenceEntry"],
      hardBlockers
    }
  ];
}

function suppressedRatingSummary() {
  return {
    ratingType: "new_product_candidate_rating",
    rating: null,
    ratingStatus: "not_generated_due_to_readiness_blocked",
    candidateRatingGenerated: false,
    ratingExplanation: "readiness blocked; no valid new product candidate rating generated.",
    ratingBasis: null,
    supportFactorCount: 0,
    warningFactorCount: 0,
    limitingFactorCount: 0
  };
}

function summarizeExtractedFields(fields) {
  return fields.map((field) => ({
    key: field.key,
    confidence: field.confidence,
    confirmationStatus: field.confirmationStatus,
    valueState: "present"
  }));
}

function sanitizeResearchQuestions(questions) {
  return questions.map((question) => ({
    questionId: question.questionId,
    missingFieldOrRisk: question.missingFieldOrRisk,
    priority: question.priority,
    evidenceTypesExpected: question.evidenceTypesExpected ?? []
  }));
}

function summarizeComparables(comparableWorks = {}) {
  return {
    systemComparableCount: comparableWorks.systemSelected?.length ?? 0,
    operatorComparatorCount: comparableWorks.operatorSpecified?.length ?? 0,
    sameAuthorReferenceCount: comparableWorks.sameAuthorReferenceWorks?.length ?? 0,
    excludedComparableCount: comparableWorks.excluded?.length ?? 0,
    limitationCount: comparableWorks.limitations?.length ?? 0
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

function summarizeWorkflow(workflow = {}) {
  return {
    currentState: workflow.currentState ?? null,
    completedStepCount: workflow.completedSteps?.length ?? 0,
    pendingStepCount: workflow.pendingSteps?.length ?? 0,
    blockedReasons: workflow.blockedReasons ?? [],
    warnings: workflow.warnings ?? []
  };
}

function buildUserFeedbackFields() {
  return [
    "fieldExtractionUsable",
    "readinessBlockersReasonable",
    "researchQuestionsActionable",
    "manualExtractionNotes",
    "operatorFeedback"
  ];
}

function buildSections(materialResults) {
  return {
    "00_instructions": {
      purpose: "M3 private material local dry-run result; not a formal execution result.",
      inputFilesAreAnonymous: true,
      rawMaterialStored: false,
      realFileNamesPrinted: false,
      notForFormalDecision: true
    },
    "01_material_field_extraction": materialResults.map((item) => pick(item, [
      "anonymousMaterialId",
      "extension",
      "parseStatus",
      "acceptedAsPrimaryMaterial",
      "hasCompanionText",
      "manualExtractionRequired",
      "visualExtractionRequired",
      "legacyDocExtractionRequired",
      "extractedFields",
      "missingFields"
    ])),
    "02_readiness": materialResults.map((item) => pick(item, ["anonymousMaterialId", "readinessStatus", "hardBlockers", "warnings"])),
    "03_research_questions": materialResults.map((item) => pick(item, ["anonymousMaterialId", "researchQuestions"])),
    "04_external_evidence": materialResults.map((item) => pick(item, ["anonymousMaterialId", "externalEvidenceSummary"])),
    "05_comparables_author": materialResults.map((item) => pick(item, ["anonymousMaterialId", "comparablesSummary", "authorRankingSummary"])),
    "06_channel_forecast": materialResults.map((item) => pick(item, ["anonymousMaterialId", "channelForecastSummary"])),
    "07_rating_explanation": materialResults.map((item) => pick(item, ["anonymousMaterialId", "ratingSummary", "ratingStatus", "candidateRatingGenerated"])),
    "08_workflow": materialResults.map((item) => pick(item, ["anonymousMaterialId", "workflowState"])),
    "09_backtest_anchor": materialResults.map((item) => pick(item, ["anonymousMaterialId", "backtestAnchorStatus"])),
    "10_user_feedback": materialResults.map((item) => pick(item, ["anonymousMaterialId", "userFeedbackFields"]))
  };
}

function buildAggregate(materialResults) {
  const ratingGeneratedCount = materialResults.filter((item) => item.candidateRatingGenerated).length;
  const ratingNotGeneratedCount = materialResults.length - ratingGeneratedCount;
  return {
    materialCount: materialResults.length,
    materialGroupCount: materialResults.length,
    extensionDistribution: countBy(materialResults, "extension"),
    acceptedPrimaryMaterialCount: materialResults.filter((item) => item.acceptedAsPrimaryMaterial).length,
    acceptedDocCount: materialResults.filter((item) => item.extension === ".doc").length,
    acceptedImageCount: materialResults.filter((item) => IMAGE_EXTENSIONS.has(item.extension)).length,
    companionTextCount: materialResults.filter((item) => item.hasCompanionText).length,
    metadataOnlyCount: materialResults.filter((item) => item.parseStatus.includes("metadata_only")).length,
    manualExtractionRequiredCount: materialResults.filter((item) => item.manualExtractionRequired).length,
    visualExtractionRequiredCount: materialResults.filter((item) => item.visualExtractionRequired).length,
    legacyDocExtractionRequiredCount: materialResults.filter((item) => item.legacyDocExtractionRequired).length,
    ratingGeneratedCount,
    ratingNotGeneratedCount,
    blockedRatingSuppressedCount: materialResults.filter((item) =>
      item.readinessStatus === "blocked" &&
      item.ratingStatus === "not_generated_due_to_readiness_blocked"
    ).length,
    parseStatusDistribution: countBy(materialResults, "parseStatus"),
    readinessDistribution: countBy(materialResults, "readinessStatus"),
    forecastStatusDistribution: countBy(materialResults.map((item) => item.channelForecastSummary), "forecastStatus"),
    ratingDistribution: countNonNullRatings(materialResults),
    ratingStatusDistribution: countBy(materialResults, "ratingStatus"),
    backtestAnchorDistribution: countBy(materialResults, "backtestAnchorStatus"),
    hardBlockerDistribution: countListValues(materialResults, "hardBlockers"),
    warningDistribution: countListValues(materialResults, "warnings"),
    rawMaterialStored: false,
    realFileNamesPrinted: false,
    notForFormalDecision: true
  };
}

function buildPrivateMarkdown(result) {
  const lines = [
    "# M3 private material dry-run result v0.1",
    "",
    "This private report is local-only and not for formal decision.",
    "",
    `- Material group count: ${result.aggregate.materialGroupCount}`,
    `- Extension distribution: ${JSON.stringify(result.aggregate.extensionDistribution)}`,
    `- Parse status: ${JSON.stringify(result.aggregate.parseStatusDistribution)}`,
    `- Readiness: ${JSON.stringify(result.aggregate.readinessDistribution)}`,
    `- Forecast status: ${JSON.stringify(result.aggregate.forecastStatusDistribution)}`,
    `- Rating status: ${JSON.stringify(result.aggregate.ratingStatusDistribution)}`,
    "",
    "## Anonymous material results",
    ""
  ];
  for (const item of result.materialResults) {
    lines.push(`### ${item.anonymousMaterialId}`);
    lines.push(`- Extension: ${item.extension}`);
    lines.push(`- Parse status: ${item.parseStatus}`);
    lines.push(`- Accepted as primary material: ${item.acceptedAsPrimaryMaterial}`);
    lines.push(`- Has companion text: ${item.hasCompanionText}`);
    lines.push(`- Manual extraction required: ${item.manualExtractionRequired}`);
    lines.push(`- Readiness: ${item.readinessStatus}`);
    lines.push(`- Forecast status: ${item.channelForecastSummary.forecastStatus}`);
    lines.push(`- Rating status: ${item.ratingStatus}`);
    lines.push(`- Backtest anchor: ${item.backtestAnchorStatus}`);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function buildPreparationGuidance(safety) {
  return {
    requiredMaterialGroups: "3 to 5 primary material groups",
    allowedExtensions: safety.allowedExtensions,
    inputDir: safety.inputDir,
    outputDir: safety.outputDir,
    guidance: [
      "Place 3 to 5 private primary materials in the configured private input directory.",
      "Optional .txt or .md files with matching stem are treated as companion text enhancements.",
      "Companion text is not required for .doc/.jpg/.jpeg/.png acceptance.",
      "Keep private inputs and outputs under ignored data/private-* directories."
    ],
    issues: safety.issues
  };
}

function normalizeParsedValue(key, rawValue) {
  const value = String(rawValue ?? "").trim();
  if (["wordCount", "audioVolumeEstimate", "reads", "collections", "ratingScore", "commentCount"].includes(key)) {
    const numeric = Number(value.replace(/,/g, ""));
    return Number.isFinite(numeric) ? numeric : value;
  }
  if (["classificationCandidate", "confirmedClassification", "adaptationSignals", "targetChannels", "operatorComparators"].includes(key)) {
    return splitList(value);
  }
  if (["rankings", "searchHeat", "socialHeat", "platformHeat", "externalHeat"].includes(key)) {
    return { summary: value };
  }
  if (key === "source") {
    if (["publication", "published"].includes(value)) return "publication";
    if (["web_original", "original_web"].includes(value)) return "web_original";
  }
  if (key === "sameNameAudioStatus") {
    if (["has", "yes", "true"].includes(value)) return "has";
    if (["none", "no", "false"].includes(value)) return "none";
    return "unknown";
  }
  if (key === "sameNameAudioStatusCheckStatus") {
    if (["checked", "yes", "true"].includes(value)) return "checked";
    if (["unchecked", "no", "false"].includes(value)) return "unchecked";
  }
  return value;
}

function splitList(value) {
  return value.split(/[;,\n]/).map((item) => item.trim()).filter(Boolean);
}

function stripSensitiveSafety(safety) {
  return {
    ok: safety.ok,
    materialGroupCount: safety.materialGroupCount,
    acceptedPrimaryMaterialCount: safety.acceptedPrimaryMaterialCount,
    companionTextCount: safety.companionTextCount,
    allowedExtensions: safety.allowedExtensions,
    anonymousInputs: safety.anonymousInputs,
    extensionDistribution: safety.extensionDistribution,
    issues: safety.issues,
    rawMaterialPrinted: false,
    realFileNamesPrinted: false
  };
}

function countBy(values, key) {
  return values.reduce((counts, value) => {
    const group = value?.[key] ?? "unknown";
    counts[group] = (counts[group] ?? 0) + 1;
    return counts;
  }, {});
}

function countNonNullRatings(values) {
  return values.reduce((counts, value) => {
    const rating = value.ratingSummary?.rating;
    if (!rating) return counts;
    counts[rating] = (counts[rating] ?? 0) + 1;
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

function pick(value, keys) {
  return Object.fromEntries(keys.map((key) => [key, value[key]]));
}

function emptyCountSummary() {
  return {
    heatSignalEvidenceCount: 0,
    sameNameAudioEvidenceCount: 0,
    adaptationEvidenceCount: 0,
    publicationEvidenceCount: 0,
    reviewReputationEvidenceCount: 0,
    operatorResearchNoteCount: 0,
    gptWebAssistedSummaryCount: 0,
    manualConfirmedEvidenceCount: 0,
    notForFormalDecision: true
  };
}

function emptyComparableSummary() {
  return {
    systemComparableCount: 0,
    operatorComparatorCount: 0,
    sameAuthorReferenceCount: 0,
    excludedComparableCount: 0,
    limitationCount: 0
  };
}

if (IS_CLI) {
  const result = runM3PrivateMaterialDryRun();
  const output = result.ok
    ? {
        ok: true,
        dryRunExecuted: result.dryRunExecuted,
        outputJson: result.outputJson,
        outputMarkdown: result.outputMarkdown,
        aggregate: buildPublicAggregateSummary(result),
        guardrails: result.guardrails
      }
    : result;
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!result.ok) {
    process.exitCode = 1;
  }
}
