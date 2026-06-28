import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_INPUT_DIR,
  DEFAULT_OUTPUT_DIR,
  checkM3PrivateDryRunSafety,
  normalizeRelativePath
} from "./check_m3_private_dry_run_safety.js";
import {
  FIELD_COMPLETION_PACK_JSON,
  FIELD_COMPLETION_PACK_MARKDOWN,
  generateM3FieldCompletionPack
} from "./generate_m3_field_completion_pack.js";
import {
  PRIVATE_RESULT_JSON,
  runM3PrivateMaterialDryRun
} from "./run_m3_private_material_dry_run.js";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const IS_CLI = path.resolve(process.argv[1] ?? "") === path.resolve(SCRIPT_PATH);

export function bootstrapM3PrivateCompletionPack(options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const inputDir = normalizeRelativePath(options.inputDir ?? DEFAULT_INPUT_DIR);
  const outputDir = normalizeRelativePath(options.outputDir ?? DEFAULT_OUTPUT_DIR);
  const force = options.force === true;
  const outputPaths = completionPackPaths(repoRoot, outputDir);

  const safety = checkM3PrivateDryRunSafety({
    repoRoot,
    inputDir,
    outputDir,
    skipGitChecks: options.skipGitChecks === true
  });

  if (!safety.ok) {
    return {
      ok: false,
      bootstrapExecuted: false,
      dryRunExecuted: false,
      completionPackGenerated: false,
      reason: "private_input_not_ready",
      message: "Place 3 to 5 private topic materials in data/private-input/m3-material-dry-run/ before regenerating the M3 field completion pack.",
      inputDir,
      outputDir,
      allowedExtensions: safety.allowedExtensions,
      materialGroupCount: safety.materialGroupCount,
      issues: safety.issues,
      guardrails: buildGuardrails()
    };
  }

  const existingPacks = existingCompletionPacks(outputPaths);
  if (existingPacks.length > 0 && !force) {
    return {
      ok: true,
      bootstrapExecuted: true,
      dryRunExecuted: false,
      completionPackGenerated: false,
      completionPackAlreadyExists: true,
      existingPacks,
      message: "M3 field completion pack already exists; rerun with --force only when the user explicitly wants to overwrite local private output.",
      inputDir,
      outputDir,
      guardrails: buildGuardrails()
    };
  }

  const sourceResultPath = path.join(repoRoot, outputDir, PRIVATE_RESULT_JSON);
  let dryRunResult = null;
  if (force || !existsSync(sourceResultPath)) {
    dryRunResult = runM3PrivateMaterialDryRun({
      repoRoot,
      inputDir,
      outputDir,
      skipGitChecks: options.skipGitChecks === true,
      legacyDocConverter: options.legacyDocConverter
    });
    if (!dryRunResult.ok) {
      return {
        ok: false,
        bootstrapExecuted: true,
        dryRunExecuted: false,
        completionPackGenerated: false,
        reason: "private_dry_run_failed",
        safety: dryRunResult.safety,
        preparationGuidance: dryRunResult.preparationGuidance,
        guardrails: buildGuardrails()
      };
    }
  }

  const packResult = generateM3FieldCompletionPack({
    repoRoot,
    outputDir,
    sourceResultPath: path.join(outputDir, PRIVATE_RESULT_JSON)
  });

  return {
    ok: true,
    bootstrapExecuted: true,
    dryRunExecuted: dryRunResult?.dryRunExecuted === true,
    completionPackGenerated: true,
    force,
    inputDir,
    outputDir,
    outputJson: packResult.outputJson,
    outputMarkdown: packResult.outputMarkdown,
    materialCount: packResult.materialCount,
    aggregate: packResult.aggregate,
    guardrails: buildGuardrails()
  };
}

function completionPackPaths(repoRoot, outputDir) {
  return [
    path.join(outputDir, FIELD_COMPLETION_PACK_JSON),
    path.join(outputDir, FIELD_COMPLETION_PACK_MARKDOWN)
  ].map((relativePath) => ({
    relativePath: normalizeRelativePath(relativePath),
    absolutePath: path.join(repoRoot, normalizeRelativePath(relativePath))
  }));
}

function existingCompletionPacks(paths) {
  return paths
    .filter((item) => existsSync(item.absolutePath))
    .map((item) => item.relativePath);
}

function buildGuardrails() {
  return {
    privateInputCommitted: false,
    privateOutputCommitted: false,
    rawMaterialPrinted: false,
    realFileNamesPrinted: false,
    databaseConnected: false,
    migrationExecuted: false,
    ocrCalled: false,
    realSearchCalled: false,
    chatGptWebCalled: false,
    chromePluginCalled: false,
    formalExecution: false,
    notForFormalDecision: true
  };
}

function parseCliArgs(argv) {
  const options = {};
  for (const arg of argv) {
    if (arg === "--force") options.force = true;
    if (arg.startsWith("--input-dir=")) options.inputDir = arg.slice("--input-dir=".length);
    if (arg.startsWith("--output-dir=")) options.outputDir = arg.slice("--output-dir=".length);
  }
  return options;
}

if (IS_CLI) {
  const result = bootstrapM3PrivateCompletionPack(parseCliArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) {
    process.exitCode = 1;
  }
}
