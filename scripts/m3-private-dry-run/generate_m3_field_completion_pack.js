import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_OUTPUT_DIR,
  isAllowedPrivatePath,
  normalizeRelativePath
} from "./check_m3_private_dry_run_safety.js";
import {
  PRIVATE_RESULT_JSON,
  deriveMissingCoreFields
} from "./run_m3_private_material_dry_run.js";

export const FIELD_COMPLETION_PACK_JSON = "M3-private-material-field-completion-pack-v0.1.json";
export const FIELD_COMPLETION_PACK_MARKDOWN = "M3-private-material-field-completion-pack-v0.1.md";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const IS_CLI = path.resolve(process.argv[1] ?? "") === path.resolve(SCRIPT_PATH);

export function generateM3FieldCompletionPack(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const outputDir = normalizeRelativePath(options.outputDir ?? DEFAULT_OUTPUT_DIR);
  if (!isAllowedPrivatePath(outputDir, "output")) {
    throw new Error("field completion pack output must stay under data/private-output/");
  }

  const absoluteOutputDir = path.join(repoRoot, outputDir);
  mkdirSync(absoluteOutputDir, { recursive: true });
  const sourceResultPath = resolvePrivateOutputPath(
    repoRoot,
    options.sourceResultPath ?? path.join(outputDir, PRIVATE_RESULT_JSON)
  );
  if (!existsSync(sourceResultPath.absolutePath)) {
    throw new Error("private dry-run result is missing; run npm run m3:private-dry-run first");
  }

  const sourceResult = JSON.parse(readFileSync(sourceResultPath.absolutePath, "utf8"));
  const rows = (sourceResult.materialResults ?? []).map(buildCompletionRow);
  const pack = {
    version: "m3-private-field-completion-pack-v0.1",
    generatedAt: new Date().toISOString(),
    sourceResult: sourceResultPath.relativePath,
    outputDir,
    materialCount: rows.length,
    rows,
    aggregate: {
      materialCount: rows.length,
      readinessDistribution: countBy(rows, "readinessStatus"),
      parseStatusDistribution: countBy(rows, "parseStatus"),
      missingCoreFieldDistribution: countListValues(rows, "missingCoreFields"),
      completionPackRecommendedCount: rows.filter((row) => row.completionPackRecommended).length
    },
    guardrails: {
      privatePack: true,
      publicDoc: false,
      rawMaterialStored: false,
      realFileNamesPrinted: false,
      databaseConnected: false,
      migrationExecuted: false,
      formalExecution: false,
      notForFormalDecision: true
    }
  };

  const outputJson = path.join(absoluteOutputDir, FIELD_COMPLETION_PACK_JSON);
  const outputMarkdown = path.join(absoluteOutputDir, FIELD_COMPLETION_PACK_MARKDOWN);
  writeFileSync(outputJson, `${JSON.stringify(pack, null, 2)}\n`, "utf8");
  writeFileSync(outputMarkdown, buildCompletionPackMarkdown(pack), "utf8");

  return {
    ok: true,
    materialCount: pack.materialCount,
    outputJson: path.join(outputDir, FIELD_COMPLETION_PACK_JSON).replaceAll("\\", "/"),
    outputMarkdown: path.join(outputDir, FIELD_COMPLETION_PACK_MARKDOWN).replaceAll("\\", "/"),
    aggregate: pack.aggregate,
    guardrails: pack.guardrails
  };
}

export function buildCompletionRow(item) {
  const hardBlockerCodes = item.hardBlockers ?? [];
  const warningCodes = item.warnings ?? [];
  const missingCoreFields = item.missingCoreFields ?? deriveMissingCoreFields(hardBlockerCodes);
  return {
    anonymousMaterialId: item.anonymousMaterialId,
    inputExtension: item.inputExtension ?? item.extension,
    parseStatus: item.parseStatus,
    readinessStatus: item.readinessStatus,
    hardBlockerCodes,
    missingCoreFields,
    warningCodes,
    extractedCandidateSummary: {
      extractedTextAvailable: item.extractedTextAvailable === true,
      extractedTextLengthBucket: item.extractedTextLengthBucket ?? "none",
      extractedFieldKeys: item.extractedFieldKeys ?? [],
      extractedFieldCandidates: summarizeFieldCandidates(item.extractedFieldCandidates ?? [])
    },
    researchQuestions: (item.researchQuestions ?? []).map((question) => ({
      questionId: question.questionId,
      missingFieldOrRisk: question.missingFieldOrRisk,
      priority: question.priority,
      evidenceTypesExpected: question.evidenceTypesExpected ?? []
    })),
    completionPackRecommended: item.completionPackRecommended === true || missingCoreFields.length > 0,
    userFields: emptyUserFields()
  };
}

export function emptyUserFields() {
  return {
    title: "",
    author: "",
    source: "",
    classification: "",
    wordCount: "",
    audioVolumeEstimate: "",
    heatSignalType: "",
    heatSignalValue: "",
    copyrightTermRange: "",
    targetChannels: "",
    sameNameAudioStatusCheckStatus: "",
    sameNameAudioStatus: "",
    completionStatus: "",
    notes: ""
  };
}

function summarizeFieldCandidates(candidates) {
  return candidates.map((candidate) => ({
    key: candidate.key,
    valueState: candidate.valueState,
    source: candidate.source,
    valueLengthBucket: candidate.valueLengthBucket
  }));
}

function buildCompletionPackMarkdown(pack) {
  const lines = [
    "# M3 private material field completion pack v0.1",
    "",
    "This file is private local output. Do not commit it.",
    "",
    "## Fill Instructions",
    "",
    "- Fill either this Markdown file or the JSON file. You do not need to keep both in sync manually.",
    "- Apply can read JSON or Markdown. If both exist and conflict, specify the intended path.",
    "- Do not paste material full text, webpage full text, private file names, secrets, or database connection strings.",
    "- Allowed `source`: `publication` or `web_original`.",
    "- Allowed `sameNameAudioStatusCheckStatus`: `checked`.",
    "- Allowed `sameNameAudioStatus`: `has`, `none`, or `unknown`.",
    "- `targetChannels`: comma-separated values.",
    "- Allowed `heatSignalType`: `reads`, `collections`, `rating`, `ranking`, `searchHeat`, `socialHeat`, `platformHeat`, or `manualHeat`.",
    "- `web_original` rows must include `completionStatus`.",
    "",
    `- Material count: ${pack.materialCount}`,
    `- Readiness: ${JSON.stringify(pack.aggregate.readinessDistribution)}`,
    `- Missing core fields: ${JSON.stringify(pack.aggregate.missingCoreFieldDistribution)}`,
    "",
    "## Fillable Table",
    "",
    "| anonymousMaterialId | inputExtension | parseStatus | readinessStatus | missingCoreFields | title | author | source | classification | wordCount | audioVolumeEstimate | heatSignalType | heatSignalValue | copyrightTermRange | targetChannels | sameNameAudioStatusCheckStatus | sameNameAudioStatus | completionStatus | notes |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |"
  ];
  for (const row of pack.rows) {
    const cells = [
      row.anonymousMaterialId,
      row.inputExtension,
      row.parseStatus,
      row.readinessStatus,
      row.missingCoreFields.join(", ") || "none",
      row.userFields.title,
      row.userFields.author,
      row.userFields.source,
      row.userFields.classification,
      row.userFields.wordCount,
      row.userFields.audioVolumeEstimate,
      row.userFields.heatSignalType,
      row.userFields.heatSignalValue,
      row.userFields.copyrightTermRange,
      row.userFields.targetChannels,
      row.userFields.sameNameAudioStatusCheckStatus,
      row.userFields.sameNameAudioStatus,
      row.userFields.completionStatus,
      row.userFields.notes
    ].map(escapeMarkdownCell);
    lines.push(`| ${cells.join(" | ")} |`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function resolvePrivateOutputPath(repoRoot, value) {
  const absolutePath = path.isAbsolute(value) ? path.resolve(value) : path.join(repoRoot, normalizeRelativePath(value));
  const relativePath = normalizeRelativePath(path.relative(repoRoot, absolutePath));
  if (!isAllowedPrivatePath(relativePath, "output")) {
    throw new Error("field completion pack may only read or write data/private-output/ paths");
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
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

if (IS_CLI) {
  try {
    const result = generateM3FieldCompletionPack();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
