import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DEFAULT_INPUT_DIR,
  DEFAULT_OUTPUT_DIR
} from "../scripts/m3-private-dry-run/check_m3_private_dry_run_safety.js";
import {
  FIELD_COMPLETION_PACK_JSON,
  FIELD_COMPLETION_PACK_MARKDOWN
} from "../scripts/m3-private-dry-run/generate_m3_field_completion_pack.js";
import {
  bootstrapM3PrivateCompletionPack
} from "../scripts/m3-private-dry-run/bootstrap_m3_private_completion_pack.js";

test("M3 private completion bootstrap stops when private input directory is missing", () => {
  withTempRepo(({ repoRoot }) => {
    const result = bootstrapM3PrivateCompletionPack({ repoRoot, skipGitChecks: true });

    assert.equal(result.ok, false);
    assert.equal(result.reason, "private_input_not_ready");
    assert.equal(result.dryRunExecuted, false);
    assert.equal(result.completionPackGenerated, false);
    assert.match(result.message, /Place 3 to 5 private topic materials/);
  }, { createInputDir: false });
});

test("M3 private completion bootstrap stops when fewer than three material groups exist", () => {
  withTempRepo(({ repoRoot, inputDir }) => {
    writeFileSync(path.join(inputDir, "private-real-a.doc"), "synthetic", "utf8");
    writeFileSync(path.join(inputDir, "private-real-b.jpg"), "synthetic", "utf8");

    const result = bootstrapM3PrivateCompletionPack({ repoRoot, skipGitChecks: true });

    assert.equal(result.ok, false);
    assert.equal(result.reason, "private_input_not_ready");
    assert.equal(result.materialGroupCount, 2);
    assert.equal(result.issues.some((issue) => issue.code === "material_group_count_out_of_range"), true);
  });
});

test("M3 private completion bootstrap generates completion pack from three synthetic materials", () => {
  withTempRepo(({ repoRoot, inputDir, outputDir }) => {
    writeThreeSyntheticMaterials(inputDir);

    const result = bootstrapM3PrivateCompletionPack({ repoRoot, skipGitChecks: true });

    assert.equal(result.ok, true);
    assert.equal(result.dryRunExecuted, true);
    assert.equal(result.completionPackGenerated, true);
    assert.equal(result.materialCount, 3);
    assert.equal(existsSync(path.join(outputDir, FIELD_COMPLETION_PACK_JSON)), true);
    assert.equal(existsSync(path.join(outputDir, FIELD_COMPLETION_PACK_MARKDOWN)), true);
    assert.equal(result.outputJson.startsWith(DEFAULT_OUTPUT_DIR.replaceAll("\\", "/")), true);
  });
});

test("M3 private completion bootstrap does not overwrite existing pack by default", () => {
  withTempRepo(({ repoRoot, inputDir, outputDir }) => {
    writeThreeSyntheticMaterials(inputDir);
    const existingPath = path.join(outputDir, FIELD_COMPLETION_PACK_JSON);
    writeFileSync(existingPath, "existing private pack marker", "utf8");

    const result = bootstrapM3PrivateCompletionPack({ repoRoot, skipGitChecks: true });

    assert.equal(result.ok, true);
    assert.equal(result.completionPackAlreadyExists, true);
    assert.equal(result.completionPackGenerated, false);
    assert.equal(readFileSync(existingPath, "utf8"), "existing private pack marker");
  });
});

test("M3 private completion bootstrap overwrites synthetic test output only with force", () => {
  withTempRepo(({ repoRoot, inputDir, outputDir }) => {
    writeThreeSyntheticMaterials(inputDir);
    const existingPath = path.join(outputDir, FIELD_COMPLETION_PACK_JSON);
    writeFileSync(existingPath, "existing private pack marker", "utf8");

    const result = bootstrapM3PrivateCompletionPack({ repoRoot, skipGitChecks: true, force: true });

    assert.equal(result.ok, true);
    assert.equal(result.force, true);
    assert.equal(result.completionPackGenerated, true);
    assert.notEqual(readFileSync(existingPath, "utf8"), "existing private pack marker");
  });
});

test("M3 private completion bootstrap output does not print real file names", () => {
  withTempRepo(({ repoRoot, inputDir }) => {
    writeFileSync(path.join(inputDir, "real-title-alpha.doc"), "synthetic", "utf8");
    writeFileSync(path.join(inputDir, "real-title-beta.jpg"), "synthetic", "utf8");
    writeFileSync(path.join(inputDir, "real-title-gamma.png"), "synthetic", "utf8");

    const result = bootstrapM3PrivateCompletionPack({ repoRoot, skipGitChecks: true });
    const text = JSON.stringify(result);

    assert.equal(text.includes("real-title-alpha"), false);
    assert.equal(text.includes("real-title-beta"), false);
    assert.equal(text.includes("real-title-gamma"), false);
    assert.equal(result.guardrails.realFileNamesPrinted, false);
  });
});

function writeThreeSyntheticMaterials(inputDir) {
  writeFileSync(path.join(inputDir, "private-a.doc"), "synthetic", "utf8");
  writeFileSync(path.join(inputDir, "private-b.jpg"), "synthetic", "utf8");
  writeFileSync(path.join(inputDir, "private-c.png"), "synthetic", "utf8");
}

function withTempRepo(callback, options = {}) {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), "m3-private-completion-bootstrap-"));
  const inputDir = path.join(repoRoot, DEFAULT_INPUT_DIR);
  const outputDir = path.join(repoRoot, DEFAULT_OUTPUT_DIR);
  if (options.createInputDir !== false) {
    mkdirSync(inputDir, { recursive: true });
  }
  mkdirSync(outputDir, { recursive: true });
  try {
    callback({ repoRoot, inputDir, outputDir });
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
}
