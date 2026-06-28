import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyFieldCompletionRow,
  applyFieldCompletionRows,
  buildFieldCompletionAggregate,
  buildMaterialFromCompletionRow,
  normalizeUserFields
} from "../../src/domain/newProductEvaluation/fieldCompletion.js";
import { parseFieldCompletionPack } from "../../src/domain/newProductEvaluation/fieldCompletionPackParser.js";
import {
  assertValidFieldCompletionRows,
  summarizeValidationIssues
} from "../../src/domain/newProductEvaluation/fieldCompletionValidator.js";
import {
  DEFAULT_OUTPUT_DIR,
  isAllowedPrivatePath,
  normalizeRelativePath
} from "./check_m3_private_dry_run_safety.js";
import { FIELD_COMPLETION_PACK_JSON } from "./generate_m3_field_completion_pack.js";

export const FIELD_COMPLETION_APPLY_RESULT_JSON = "M3-private-material-dry-run-result-after-completion-v0.1.json";
export const FIELD_COMPLETION_APPLY_RESULT_MARKDOWN = "M3-private-material-dry-run-result-after-completion-v0.1.md";
export const FIELD_COMPLETION_PACK_MARKDOWN = "M3-private-material-field-completion-pack-v0.1.md";
export const FIELD_COMPLETION_PACK_XLSX = "M3-private-material-field-completion-pack-v0.1.xlsx";
export {
  applyFieldCompletionRow as applyCompletionRow,
  buildFieldCompletionAggregate,
  buildMaterialFromCompletionRow,
  normalizeUserFields
};

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
  const packPath = options.packPath
    ? resolvePrivateOutputPath(repoRoot, options.packPath)
    : discoverFieldCompletionPack(repoRoot, outputDir);
  const parsedPack = readAndValidatePack(packPath);

  const applied = applyFieldCompletionRows(parsedPack.rows, {
    disableFixtureEvidence: true,
    externalEvidenceByMaterialId: options.externalEvidenceByMaterialId
  });
  const result = {
    ok: true,
    version: "m3-private-field-completion-apply-v0.2",
    generatedAt: new Date().toISOString(),
    sourcePack: packPath.relativePath,
    sourcePackFormat: parsedPack.format,
    outputDir,
    materialResults: applied.materialResults,
    aggregate: applied.aggregate,
    guardrails: {
      privatePackRead: true,
      ...applied.guardrails
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

export function validateM3FieldCompletionPack(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const outputDir = normalizeRelativePath(options.outputDir ?? DEFAULT_OUTPUT_DIR);
  const packPath = options.packPath
    ? resolvePrivateOutputPath(repoRoot, options.packPath)
    : discoverFieldCompletionPack(repoRoot, outputDir);
  const parsedPack = readAndValidatePack(packPath);
  return {
    ok: true,
    sourcePack: packPath.relativePath,
    sourcePackFormat: parsedPack.format,
    materialCount: parsedPack.rows.length,
    validation: {
      ok: true,
      rowCount: parsedPack.rows.length,
      realFieldValuesPrinted: false
    },
    guardrails: {
      privatePackRead: true,
      userFieldValuesPrinted: false,
      databaseConnected: false,
      migrationExecuted: false,
      formalExecution: false,
      notForFormalDecision: true
    }
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

function discoverFieldCompletionPack(repoRoot, outputDir) {
  const candidates = [
    FIELD_COMPLETION_PACK_JSON,
    FIELD_COMPLETION_PACK_MARKDOWN,
    FIELD_COMPLETION_PACK_XLSX
  ].map((fileName) => resolvePrivateOutputPath(repoRoot, path.join(outputDir, fileName)))
    .filter((candidate) => existsSync(candidate.absolutePath));

  if (candidates.length === 0) {
    throw new Error("field completion pack is missing");
  }

  const supported = candidates.filter((candidate) => !candidate.relativePath.toLowerCase().endsWith(".xlsx"));
  if (supported.length === 0) {
    throw new Error("xlsx completion pack exists but xlsx parsing is not enabled; provide json or markdown pack");
  }
  const parsedCandidates = supported.map((candidate) => ({
    candidate,
    parsed: parsePackFile(candidate)
  }));
  const fingerprints = new Set(parsedCandidates.map((item) => fingerprintRows(item.parsed.rows)));
  if (fingerprints.size > 1) {
    const error = new Error("multiple field completion packs exist with conflicting user fields; specify the intended path");
    error.code = "field_completion_pack_conflict";
    error.candidates = parsedCandidates.map((item) => ({
      path: item.candidate.relativePath,
      format: item.parsed.format,
      materialCount: item.parsed.rows.length
    }));
    throw error;
  }
  return parsedCandidates[0].candidate;
}

function readAndValidatePack(packPath) {
  const parsedPack = parsePackFile(packPath);
  assertValidFieldCompletionRows(parsedPack.rows);
  return parsedPack;
}

function parsePackFile(packPath) {
  if (packPath.relativePath.toLowerCase().endsWith(".xlsx")) {
    return parseFieldCompletionPack("", {
      filePath: packPath.relativePath
    });
  }
  const content = readFileSync(packPath.absolutePath, "utf8");
  return parseFieldCompletionPack(content, {
    filePath: packPath.relativePath
  });
}

function fingerprintRows(rows = []) {
  return JSON.stringify(rows.map((row) => ({
    anonymousMaterialId: row.anonymousMaterialId,
    userFields: row.userFields
  })).sort((a, b) => a.anonymousMaterialId.localeCompare(b.anonymousMaterialId)));
}

function escapeMarkdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|");
}

if (IS_CLI) {
  try {
    const cliPath = process.argv[2];
    const result = applyM3FieldCompletionPack({ packPath: cliPath });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const payload = error.validation
      ? {
          ok: false,
          code: error.code,
          message: error.message,
          validation: summarizeValidationIssues(error.validation.issues)
        }
      : {
          ok: false,
          code: error.code ?? "field_completion_apply_failed",
          message: error.message,
          candidates: error.candidates
        };
    process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
    process.exitCode = 1;
  }
}
