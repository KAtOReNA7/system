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
import {
  DEFAULT_OUTPUT_DIR,
  isAllowedPrivatePath,
  normalizeRelativePath
} from "./check_m3_private_dry_run_safety.js";
import { FIELD_COMPLETION_PACK_JSON } from "./generate_m3_field_completion_pack.js";

export const FIELD_COMPLETION_APPLY_RESULT_JSON = "M3-private-material-dry-run-result-after-completion-v0.1.json";
export const FIELD_COMPLETION_APPLY_RESULT_MARKDOWN = "M3-private-material-dry-run-result-after-completion-v0.1.md";
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
  const packPath = resolvePrivateOutputPath(
    repoRoot,
    options.packPath ?? path.join(outputDir, FIELD_COMPLETION_PACK_JSON)
  );
  if (!existsSync(packPath.absolutePath)) {
    throw new Error("field completion pack is missing");
  }

  const pack = JSON.parse(readFileSync(packPath.absolutePath, "utf8"));
  const applied = applyFieldCompletionRows(pack.rows ?? [], {
    disableFixtureEvidence: true,
    externalEvidenceByMaterialId: options.externalEvidenceByMaterialId
  });
  const result = {
    ok: true,
    version: "m3-private-field-completion-apply-v0.2",
    generatedAt: new Date().toISOString(),
    sourcePack: packPath.relativePath,
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
