import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ALLOWED_EXTENSIONS,
  DEFAULT_INPUT_DIR,
  DEFAULT_OUTPUT_DIR,
  checkM3PrivateDryRunSafety,
  collectInputInventory,
  isAllowedPrivatePath
} from "../scripts/m3-private-dry-run/check_m3_private_dry_run_safety.js";

test("M3 private dry-run safety accepts only private input and output roots", () => {
  assert.equal(isAllowedPrivatePath(DEFAULT_INPUT_DIR, "input"), true);
  assert.equal(isAllowedPrivatePath(DEFAULT_OUTPUT_DIR, "output"), true);
  assert.equal(isAllowedPrivatePath("docs/private-input/m3", "input"), false);
  assert.equal(isAllowedPrivatePath("data/private-input/m3-material-dry-run", "output"), false);
  assert.equal(isAllowedPrivatePath("data/private-output/m3-dry-run", "input"), false);
});

test("M3 private dry-run safety stops when input count is outside 3 to 5", () => {
  withTempRepo(({ repoRoot, inputDir }) => {
    writeFileSync(path.join(inputDir, "one.txt"), "title: synthetic\n", "utf8");
    writeFileSync(path.join(inputDir, "two.txt"), "title: synthetic\n", "utf8");

    const result = checkM3PrivateDryRunSafety({ repoRoot, skipGitChecks: true });

    assert.equal(result.ok, false);
    assert.ok(result.issues.some((issue) => issue.code === "input_file_count_out_of_range"));
    assert.equal(result.inputFileCount, 2);
  });
});

test("M3 private dry-run safety reports unsupported extensions with anonymous ids only", () => {
  withTempRepo(({ repoRoot, inputDir }) => {
    writeFileSync(path.join(inputDir, "a.txt"), "title: synthetic\n", "utf8");
    writeFileSync(path.join(inputDir, "b.md"), "title: synthetic\n", "utf8");
    writeFileSync(path.join(inputDir, "c.exe"), "synthetic", "utf8");

    const result = checkM3PrivateDryRunSafety({ repoRoot, skipGitChecks: true });
    const issue = result.issues.find((item) => item.code === "unsupported_input_extension");

    assert.equal(result.ok, false);
    assert.ok(issue);
    assert.deepEqual(issue.unsupportedInputs, [{
      anonymousInputId: "ANON-M3-PRIVATE-003",
      extension: ".exe"
    }]);
    assert.equal(JSON.stringify(result).includes("c.exe"), false);
  });
});

test("M3 private dry-run inventory omits real filenames", () => {
  withTempRepo(({ inputDir }) => {
    writeFileSync(path.join(inputDir, "private-real-title.txt"), "title: synthetic\n", "utf8");
    writeFileSync(path.join(inputDir, "private-real-author.md"), "title: synthetic\n", "utf8");
    writeFileSync(path.join(inputDir, "private-real-material.pdf"), "synthetic", "utf8");

    const inventory = collectInputInventory(inputDir);
    const publicInventory = inventory.map(({ anonymousInputId, extension }) => ({ anonymousInputId, extension }));

    assert.equal(inventory.length, 3);
    assert.deepEqual(publicInventory.map((item) => item.extension).sort(), [".md", ".pdf", ".txt"]);
    assert.equal(JSON.stringify(publicInventory).includes("private-real-title"), false);
  });
});

test("M3 private dry-run safety keeps allowed extension list explicit", () => {
  assert.deepEqual(ALLOWED_EXTENSIONS, [".docx", ".pdf", ".pptx", ".txt", ".md", ".xlsx"]);
});

function withTempRepo(callback) {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), "m3-private-dry-run-safety-"));
  const inputDir = path.join(repoRoot, DEFAULT_INPUT_DIR);
  const outputDir = path.join(repoRoot, DEFAULT_OUTPUT_DIR);
  mkdirSync(inputDir, { recursive: true });
  mkdirSync(outputDir, { recursive: true });
  try {
    callback({ repoRoot, inputDir, outputDir });
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
}
