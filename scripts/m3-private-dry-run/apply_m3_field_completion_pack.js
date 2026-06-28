import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateNewProductMaterial } from "../../src/domain/newProductEvaluation/newProductEvaluationEngine.js";
import {
  DEFAULT_OUTPUT_DIR,
  isAllowedPrivatePath,
  normalizeRelativePath
} from "./check_m3_private_dry_run_safety.js";
import {
  FIELD_COMPLETION_PACK_JSON
} from "./generate_m3_field_completion_pack.js";
import { deriveMissingCoreFields } from "./run_m3_private_material_dry_run.js";

export const FIELD_COMPLETION_APPLY_RESULT_JSON = "M3-private-material-dry-run-result-after-completion-v0.1.json";
export const FIELD_COMPLETION_APPLY_RESULT_MARKDOWN = "M3-private-material-dry-run-result-after-completion-v0.1.md";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const IS_CLI = path.resolve(process.argv[1] ?? "") === path.resolve(SCRIPT_PATH);

export function applyM3FieldCompletionPack(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const outputDir = normalizeRelativePath(options.outputDir ?? DEFAULT_OUTPUT_DIR);
  if (!isAllowedPrivatePath(outputDir, "output")) {
    throw new Error("field completion apply output must stay under data/private-output/");
  }

  const absoluteOutputDir = path.join(repoRoot, outputDir);
  mkdirSync(absoluteOutputDir, { recursive: true });
  const packPath = resolvePrivateOutputPath(
    repoRoot,
    options.packPath ?? path.join(outputDir, FIELD_COMPLETION_PACK_JSON)
  );
  if (!existsSync(packPath.absolutePath)) {
    throw new Error("field completion pack is missing");
  }

  const pack = JSON.parse(readFileSync(packPath.absolutePath, "utf8"));
  const materialResults = (pack.rows ?? []).map(applyCompletionRow);
  const result = {
    ok: true,
    version: "m3-private-field-completion-apply-v0.1",
    generatedAt: new Date().toISOString(),
    sourcePack: packPath.relativePath,
    outputDir,
    materialResults,
    aggregate: buildAggregate(materialResults),
    guardrails: {
      privatePackRead: true,
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

  const outputJson = path.join(absoluteOutputDir, FIELD_COMPLETION_APPLY_RESULT_JSON);
  const outputMarkdown = path.join(absoluteOutputDir, FIELD_COMPLETION_APPLY_RESULT_MARKDOWN);
  writeFileSync(outputJson, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdown, buildApplyMarkdown(result), "utf8");

  return {
    ok: true,
    outputJson: path.join(outputDir, FIELD_COMPLETION_APPLY_RESULT_JSON).replaceAll("\\", "/"),
    outputMarkdown: path.join(outputDir, FIELD_COMPLETION_APPLY_RESULT_MARKDOWN).replaceAll("\\", "/"),
    aggregate: result.aggregate,
    guardrails: result.guardrails
  };
}

export function applyCompletionRow(row) {
  const fields = normalizeUserFields(row.userFields ?? {});
  const material = {
    materialId: row.anonymousMaterialId,
    materialType: "private_material_completion",
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
  const evaluation = evaluateNewProductMaterial(material, { externalEvidence: [] });
  const hardBlockers = evaluation.readiness?.hardBlockerCodes ?? [];
  const missingCoreFields = deriveMissingCoreFields(hardBlockers);
  const readinessStatus = evaluation.readiness?.readinessStatus ?? "blocked";
  const ratingGenerated = readinessStatus !== "blocked" && evaluation.candidateRating?.rating;

  return {
    anonymousMaterialId: row.anonymousMaterialId,
    inputExtension: row.inputExtension,
    sourceParseStatus: row.parseStatus,
    manualFieldKeys: Object.keys(fields).sort(),
    manualCoreFieldsCompleted: completedCoreFields(fields),
    readinessStatus,
    hardBlockers,
    missingCoreFields,
    warnings: evaluation.readiness?.warningCodes ?? [],
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

function buildAggregate(materialResults) {
  return {
    materialCount: materialResults.length,
    readinessDistribution: countBy(materialResults, "readinessStatus"),
    forecastStatusDistribution: countBy(materialResults.map((item) => item.forecastSummary), "forecastStatus"),
    ratingStatusDistribution: countBy(materialResults, "ratingStatus"),
    backtestAnchorDistribution: countBy(materialResults, "backtestAnchorStatus"),
    missingCoreFieldDistribution: countListValues(materialResults, "missingCoreFields"),
    forecastGeneratedCount: materialResults.filter((item) => item.forecastSummary.forecastStatus === "generated").length,
    ratingGeneratedCount: materialResults.filter((item) => item.candidateRatingGenerated).length,
    workflowCompletedCount: materialResults.filter((item) => item.workflowState.currentState === "completed").length,
    backtestAnchorCandidateCount: materialResults.filter((item) => item.backtestAnchorStatus === "eligible_anchor_candidate").length,
    rawMaterialStored: false,
    realFileNamesPrinted: false,
    notForFormalDecision: true
  };
}

function buildApplyMarkdown(result) {
  const lines = [
    "# M3 private material after-completion result v0.1",
    "",
    "This file is private local output. Do not commit it.",
    "",
    `- Material count: ${result.aggregate.materialCount}`,
    `- Readiness: ${JSON.stringify(result.aggregate.readinessDistribution)}`,
    `- Forecast status: ${JSON.stringify(result.aggregate.forecastStatusDistribution)}`,
    `- Rating status: ${JSON.stringify(result.aggregate.ratingStatusDistribution)}`,
    "",
    "| anonymousMaterialId | readinessStatus | missingCoreFields | forecastStatus | ratingStatus | backtestAnchorStatus |",
    "| --- | --- | --- | --- | --- | --- |"
  ];
  for (const item of result.materialResults) {
    lines.push([
      item.anonymousMaterialId,
      item.readinessStatus,
      item.missingCoreFields.join(", ") || "none",
      item.forecastSummary.forecastStatus,
      item.ratingStatus,
      item.backtestAnchorStatus
    ].map(escapeMarkdownCell).join(" | "));
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function resolvePrivateOutputPath(repoRoot, value) {
  const absolutePath = path.isAbsolute(value) ? path.resolve(value) : path.join(repoRoot, normalizeRelativePath(value));
  const relativePath = normalizeRelativePath(path.relative(repoRoot, absolutePath));
  if (!isAllowedPrivatePath(relativePath, "output")) {
    throw new Error("field completion apply may only read or write data/private-output/ paths");
  }
  return { absolutePath, relativePath };
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

function escapeMarkdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|");
}

if (IS_CLI) {
  try {
    const result = applyM3FieldCompletionPack();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
