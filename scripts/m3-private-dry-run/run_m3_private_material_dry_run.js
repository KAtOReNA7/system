import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateNewProductMaterial } from "../../src/domain/newProductEvaluation/newProductEvaluationEngine.js";
import {
  DEFAULT_INPUT_DIR,
  DEFAULT_OUTPUT_DIR,
  checkM3PrivateDryRunSafety,
  collectInputInventory
} from "./check_m3_private_dry_run_safety.js";

export const PRIVATE_RESULT_JSON = "M3-private-material-dry-run-result-v0.1.json";
export const PRIVATE_RESULT_MARKDOWN = "M3-private-material-dry-run-result-v0.1.md";

const TEXT_EXTENSIONS = new Set([".txt", ".md"]);
const METADATA_ONLY_EXTENSIONS = new Set([".docx", ".pdf", ".pptx"]);
const UNSUPPORTED_EXTENSIONS = new Set([".xlsx"]);
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const IS_CLI = path.resolve(process.argv[1] ?? "") === path.resolve(SCRIPT_PATH);

const FIELD_KEY_MAP = new Map([
  ["title", "title"],
  ["作品名", "title"],
  ["书名", "title"],
  ["名称", "title"],
  ["author", "author"],
  ["作者", "author"],
  ["source", "source"],
  ["来源", "source"],
  ["题材来源", "source"],
  ["classification", "classificationCandidate"],
  ["classificationCandidate", "classificationCandidate"],
  ["分类", "classificationCandidate"],
  ["题材", "classificationCandidate"],
  ["confirmedClassification", "confirmedClassification"],
  ["确认分类", "confirmedClassification"],
  ["synopsis", "synopsis"],
  ["简介", "synopsis"],
  ["梗概", "synopsis"],
  ["wordCount", "wordCount"],
  ["字数", "wordCount"],
  ["audioVolumeEstimate", "audioVolumeEstimate"],
  ["预计集数", "audioVolumeEstimate"],
  ["音频体量", "audioVolumeEstimate"],
  ["completionStatus", "completionStatus"],
  ["完结状态", "completionStatus"],
  ["reads", "reads"],
  ["阅读", "reads"],
  ["阅读量", "reads"],
  ["collections", "collections"],
  ["收藏", "collections"],
  ["收藏量", "collections"],
  ["ratingScore", "ratingScore"],
  ["评分", "ratingScore"],
  ["commentCount", "commentCount"],
  ["评论", "commentCount"],
  ["评论数", "commentCount"],
  ["rankings", "rankings"],
  ["榜单", "rankings"],
  ["searchHeat", "searchHeat"],
  ["搜索热度", "searchHeat"],
  ["socialHeat", "socialHeat"],
  ["社媒热度", "socialHeat"],
  ["platformHeat", "platformHeat"],
  ["平台热度", "platformHeat"],
  ["sameNameAudioStatus", "sameNameAudioStatus"],
  ["同名音频状态", "sameNameAudioStatus"],
  ["sameNameAudioStatusCheckStatus", "sameNameAudioStatusCheckStatus"],
  ["同名音频核查状态", "sameNameAudioStatusCheckStatus"],
  ["adaptationSignals", "adaptationSignals"],
  ["改编信号", "adaptationSignals"],
  ["externalHeat", "externalHeat"],
  ["外部热度", "externalHeat"],
  ["targetChannels", "targetChannels"],
  ["目标渠道", "targetChannels"],
  ["copyrightTermRange", "copyrightTermRange"],
  ["版权期", "copyrightTermRange"],
  ["operatorRecommendationReason", "operatorRecommendationReason"],
  ["运营判断理由", "operatorRecommendationReason"],
  ["operatorComparators", "operatorComparators"],
  ["运营对标", "operatorComparators"],
  ["materialSource", "materialSource"],
  ["物料来源", "materialSource"],
  ["materialUpdatedAt", "materialUpdatedAt"],
  ["物料更新时间", "materialUpdatedAt"],
  ["inputConfirmedBy", "inputConfirmedBy"],
  ["确认人", "inputConfirmedBy"]
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
  const inventory = collectInputInventory(absoluteInputDir);
  const materialResults = inventory.map((item) => evaluatePrivateInput(item));
  const result = {
    ok: true,
    version: "m3-private-material-dry-run-v0.1",
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

export function evaluatePrivateInput(input) {
  if (TEXT_EXTENSIONS.has(input.extension)) {
    const text = readFileSync(input.absolutePath, "utf8");
    const fields = extractFieldsFromText(text);
    const material = buildAnonymousMaterial(input, fields);
    const evaluation = evaluateNewProductMaterial(material, { externalEvidence: [] });
    return summarizeEvaluation({
      input,
      parseStatus: Object.keys(fields).length > 0 ? "text_parsed_partial" : "text_read_no_mapped_fields",
      fields,
      evaluation,
      unsupportedReason: null
    });
  }

  if (METADATA_ONLY_EXTENSIONS.has(input.extension)) {
    return summarizeUnsupportedInput(input, "metadata_only_manual_text_required");
  }

  if (UNSUPPORTED_EXTENSIONS.has(input.extension)) {
    return summarizeUnsupportedInput(input, "unsupported_in_current_runner");
  }

  return summarizeUnsupportedInput(input, "unsupported_extension");
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
    materialCount: result.aggregate?.materialCount ?? 0,
    extensionDistribution: result.aggregate?.extensionDistribution ?? {},
    parseStatusDistribution: result.aggregate?.parseStatusDistribution ?? {},
    readinessDistribution: result.aggregate?.readinessDistribution ?? {},
    forecastStatusDistribution: result.aggregate?.forecastStatusDistribution ?? {},
    ratingDistribution: result.aggregate?.ratingDistribution ?? {},
    rawMaterialStored: false,
    realFileNamesPrinted: false,
    notForFormalDecision: true
  };
}

function buildAnonymousMaterial(input, fields) {
  return {
    materialId: input.anonymousInputId,
    materialType: "private_material",
    inputMode: "material_first",
    fields,
    confidenceByField: Object.fromEntries(Object.keys(fields).map((key) => [key, 0.78])),
    materialMetadata: {
      anonymousInputId: input.anonymousInputId,
      inputExtension: input.extension,
      rawMaterialStored: false,
      rawTextPersisted: false
    }
  };
}

function summarizeUnsupportedInput(input, parseStatus) {
  const hardBlockers = parseStatus === "unsupported_in_current_runner"
    ? ["unsupported_spreadsheet_input_requires_text_companion"]
    : ["manual_text_required_for_binary_material"];
  return {
    anonymousMaterialId: input.anonymousInputId,
    inputExtension: input.extension,
    parseStatus,
    extractedFields: [],
    missingFields: [],
    readinessStatus: "blocked",
    hardBlockers,
    warnings: [],
    researchQuestions: [{
      questionId: `${input.anonymousInputId}-RQ-001`,
      missingFieldOrRisk: "manual_text_required",
      priority: "high",
      evidenceTypesExpected: ["manualEvidenceEntry"]
    }],
    externalEvidenceSummary: emptyCountSummary(),
    comparablesSummary: emptyComparableSummary(),
    authorRankingSummary: { enabled: false, disabledReason: "manual_text_required" },
    channelForecastSummary: { forecastStatus: "blocked", pointEstimateOnly: true, channelCount: 0 },
    ratingSummary: { ratingType: "new_product_candidate_rating", rating: "E", supportFactorCount: 0, warningFactorCount: 0, limitingFactorCount: 0 },
    workflowState: { currentState: "material_received", blockedReasons: hardBlockers },
    backtestAnchorStatus: "not_eligible_readiness_blocked",
    userFeedbackFields: buildUserFeedbackFields(),
    rawMaterialStored: false,
    rawTextPersisted: false,
    notForFormalDecision: true
  };
}

function summarizeEvaluation({ input, parseStatus, fields, evaluation }) {
  return {
    anonymousMaterialId: input.anonymousInputId,
    inputExtension: input.extension,
    parseStatus,
    extractedFields: summarizeExtractedFields(evaluation.parsedMaterial?.extractedFields ?? []),
    extractedFieldKeys: Object.keys(fields).sort(),
    missingFields: evaluation.parsedMaterial?.missingFields ?? [],
    readinessStatus: evaluation.readiness?.readinessStatus ?? "blocked",
    hardBlockers: evaluation.readiness?.hardBlockerCodes ?? [],
    warnings: evaluation.readiness?.warningCodes ?? [],
    researchQuestions: sanitizeResearchQuestions(evaluation.researchQuestions ?? []),
    externalEvidenceSummary: evaluation.evidenceSummary ?? emptyCountSummary(),
    comparablesSummary: summarizeComparables(evaluation.comparableWorks),
    authorRankingSummary: summarizeAuthorRanking(evaluation.authorRanking),
    channelForecastSummary: summarizeForecast(evaluation.forecast),
    ratingSummary: summarizeRating(evaluation.candidateRating),
    workflowState: summarizeWorkflow(evaluation.workflow),
    backtestAnchorStatus: evaluation.backtestAnchor?.anchorStatus ?? "not_created",
    userFeedbackFields: buildUserFeedbackFields(),
    rawMaterialStored: false,
    rawTextPersisted: false,
    notForFormalDecision: true
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
    "用户判断：字段抽取是否可用",
    "用户判断：readiness 阻断是否合理",
    "用户判断：外部证据问题是否完整",
    "用户判断：对标与作者解释是否有用",
    "用户判断：渠道点估预测是否可读",
    "用户判断：新品候选评级解释是否合理",
    "用户补充说明"
  ];
}

function buildSections(materialResults) {
  return {
    "00_说明": {
      purpose: "M3 private material local dry-run result; not a formal execution result.",
      inputFilesAreAnonymous: true,
      rawMaterialStored: false,
      realFileNamesPrinted: false,
      notForFormalDecision: true
    },
    "01_物料字段抽取": materialResults.map((item) => pick(item, ["anonymousMaterialId", "inputExtension", "parseStatus", "extractedFields", "missingFields"])),
    "02_readiness": materialResults.map((item) => pick(item, ["anonymousMaterialId", "readinessStatus", "hardBlockers", "warnings"])),
    "03_research_questions": materialResults.map((item) => pick(item, ["anonymousMaterialId", "researchQuestions"])),
    "04_external_evidence": materialResults.map((item) => pick(item, ["anonymousMaterialId", "externalEvidenceSummary"])),
    "05_comparables_author": materialResults.map((item) => pick(item, ["anonymousMaterialId", "comparablesSummary", "authorRankingSummary"])),
    "06_channel_forecast": materialResults.map((item) => pick(item, ["anonymousMaterialId", "channelForecastSummary"])),
    "07_rating_explanation": materialResults.map((item) => pick(item, ["anonymousMaterialId", "ratingSummary"])),
    "08_workflow": materialResults.map((item) => pick(item, ["anonymousMaterialId", "workflowState"])),
    "09_backtest_anchor": materialResults.map((item) => pick(item, ["anonymousMaterialId", "backtestAnchorStatus"])),
    "10_user_feedback": materialResults.map((item) => pick(item, ["anonymousMaterialId", "userFeedbackFields"]))
  };
}

function buildAggregate(materialResults) {
  return {
    materialCount: materialResults.length,
    extensionDistribution: countBy(materialResults, "inputExtension"),
    parseStatusDistribution: countBy(materialResults, "parseStatus"),
    readinessDistribution: countBy(materialResults, "readinessStatus"),
    forecastStatusDistribution: countBy(materialResults.map((item) => item.channelForecastSummary), "forecastStatus"),
    ratingDistribution: countBy(materialResults.map((item) => item.ratingSummary), "rating"),
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
    `- Material count: ${result.aggregate.materialCount}`,
    `- Parse status: ${JSON.stringify(result.aggregate.parseStatusDistribution)}`,
    `- Readiness: ${JSON.stringify(result.aggregate.readinessDistribution)}`,
    `- Forecast status: ${JSON.stringify(result.aggregate.forecastStatusDistribution)}`,
    `- Rating: ${JSON.stringify(result.aggregate.ratingDistribution)}`,
    "",
    "## Anonymous material results",
    ""
  ];
  for (const item of result.materialResults) {
    lines.push(`### ${item.anonymousMaterialId}`);
    lines.push(`- Extension: ${item.inputExtension}`);
    lines.push(`- Parse status: ${item.parseStatus}`);
    lines.push(`- Readiness: ${item.readinessStatus}`);
    lines.push(`- Hard blockers: ${item.hardBlockers.join(", ") || "none"}`);
    lines.push(`- Forecast status: ${item.channelForecastSummary.forecastStatus}`);
    lines.push(`- Rating: ${item.ratingSummary.rating ?? "none"}`);
    lines.push(`- Backtest anchor: ${item.backtestAnchorStatus}`);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function buildPreparationGuidance(safety) {
  return {
    requiredInputCount: "3 to 5 files",
    allowedExtensions: safety.allowedExtensions,
    inputDir: safety.inputDir,
    outputDir: safety.outputDir,
    guidance: [
      "Place 3 to 5 private materials in the configured private input directory.",
      "Use .txt or .md companion files when binary materials cannot be parsed safely.",
      "Keep private inputs and outputs under ignored data/private-* directories.",
      "Run the safety check again before dry-run."
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
    if (["出版物", "出版", "publication"].includes(value)) return "publication";
    if (["原创网文", "原创", "web_original", "original_web"].includes(value)) return "web_original";
  }
  if (key === "sameNameAudioStatus") {
    if (["有", "已有", "has", "yes"].includes(value)) return "has";
    if (["无", "没有", "none", "no"].includes(value)) return "none";
    return "unknown";
  }
  if (key === "sameNameAudioStatusCheckStatus") {
    if (["已核查", "checked", "yes"].includes(value)) return "checked";
    if (["未核查", "unchecked", "no"].includes(value)) return "unchecked";
  }
  return value;
}

function splitList(value) {
  return value.split(/[;,，、\n]/).map((item) => item.trim()).filter(Boolean);
}

function stripSensitiveSafety(safety) {
  return {
    ok: safety.ok,
    inputFileCount: safety.inputFileCount,
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
