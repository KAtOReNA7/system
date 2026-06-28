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
  groupPrimaryMaterials,
  isAllowedPrivatePath
} from "../scripts/m3-private-dry-run/check_m3_private_dry_run_safety.js";

test("M3 private dry-run safety accepts only private input and output roots", () => {
  assert.equal(isAllowedPrivatePath(DEFAULT_INPUT_DIR, "input"), true);
  assert.equal(isAllowedPrivatePath(DEFAULT_OUTPUT_DIR, "output"), true);
  assert.equal(isAllowedPrivatePath("docs/private-input/m3", "input"), false);
  assert.equal(isAllowedPrivatePath("data/private-input/m3-material-dry-run", "output"), false);
  assert.equal(isAllowedPrivatePath("data/private-output/m3-dry-run", "input"), false);
});

test("M3 private dry-run safety accepts 3 legacy doc primary materials", () => {
  withTempRepo(({ repoRoot, inputDir }) => {
    writeFileSync(path.join(inputDir, "private-a.doc"), "binary-placeholder", "utf8");
    writeFileSync(path.join(inputDir, "private-b.doc"), "binary-placeholder", "utf8");
    writeFileSync(path.join(inputDir, "private-c.doc"), "binary-placeholder", "utf8");

    const result = checkM3PrivateDryRunSafety({ repoRoot, skipGitChecks: true });

    assert.equal(result.ok, true);
    assert.equal(result.materialGroupCount, 3);
    assert.deepEqual(result.extensionDistribution, { ".doc": 3 });
    assert.equal(result.anonymousInputs.every((item) => item.plannedParseMode === "legacy_doc_metadata_only"), true);
  });
});

test("M3 private dry-run safety accepts jpg jpeg png primary materials", () => {
  withTempRepo(({ repoRoot, inputDir }) => {
    writeFileSync(path.join(inputDir, "private-a.jpg"), "binary-placeholder", "utf8");
    writeFileSync(path.join(inputDir, "private-b.jpeg"), "binary-placeholder", "utf8");
    writeFileSync(path.join(inputDir, "private-c.png"), "binary-placeholder", "utf8");

    const result = checkM3PrivateDryRunSafety({ repoRoot, skipGitChecks: true });

    assert.equal(result.ok, true);
    assert.equal(result.materialGroupCount, 3);
    assert.deepEqual(result.extensionDistribution, { ".jpg": 1, ".jpeg": 1, ".png": 1 });
    assert.equal(result.anonymousInputs.every((item) => item.plannedParseMode === "image_metadata_only"), true);
  });
});

test("M3 private dry-run safety counts companion text as enhancement only", () => {
  withTempRepo(({ repoRoot, inputDir }) => {
    writeFileSync(path.join(inputDir, "private-a.doc"), "binary-placeholder", "utf8");
    writeFileSync(path.join(inputDir, "private-a.txt"), "title: Secret Synthetic Title\n", "utf8");
    writeFileSync(path.join(inputDir, "private-b.jpg"), "binary-placeholder", "utf8");
    writeFileSync(path.join(inputDir, "private-c.png"), "binary-placeholder", "utf8");

    const result = checkM3PrivateDryRunSafety({ repoRoot, skipGitChecks: true });

    assert.equal(result.ok, true);
    assert.equal(result.inputFileCount, 4);
    assert.equal(result.materialGroupCount, 3);
    assert.equal(result.companionTextCount, 1);
    assert.equal(result.anonymousInputs[0].hasCompanionText, true);
    assert.equal(result.anonymousInputs[0].plannedParseMode, "companion_text_enhanced");
  });
});

test("M3 private dry-run safety marks image companion text as manual transcript", () => {
  withTempRepo(({ repoRoot, inputDir }) => {
    writeFileSync(path.join(inputDir, "private-a.jpg"), "binary-placeholder", "utf8");
    writeFileSync(path.join(inputDir, "private-a.txt"), "title: Secret Synthetic Title\n", "utf8");
    writeFileSync(path.join(inputDir, "private-b.png"), "binary-placeholder", "utf8");
    writeFileSync(path.join(inputDir, "private-b.md"), "title: Secret Synthetic Title\n", "utf8");
    writeFileSync(path.join(inputDir, "private-c.jpeg"), "binary-placeholder", "utf8");

    const result = checkM3PrivateDryRunSafety({ repoRoot, skipGitChecks: true });

    assert.equal(result.ok, true);
    assert.equal(result.materialGroupCount, 3);
    assert.equal(result.companionTextCount, 2);
    assert.equal(result.anonymousInputs[0].plannedParseMode, "image_manual_transcript");
    assert.equal(result.anonymousInputs[1].plannedParseMode, "image_manual_transcript");
    assert.equal(result.anonymousInputs[2].plannedParseMode, "image_metadata_only");
  });
});

test("M3 private dry-run safety stops when material group count is outside 3 to 5", () => {
  withTempRepo(({ repoRoot, inputDir }) => {
    writeFileSync(path.join(inputDir, "one.txt"), "title: synthetic\n", "utf8");
    writeFileSync(path.join(inputDir, "two.txt"), "title: synthetic\n", "utf8");

    const result = checkM3PrivateDryRunSafety({ repoRoot, skipGitChecks: true });

    assert.equal(result.ok, false);
    assert.ok(result.issues.some((issue) => issue.code === "material_group_count_out_of_range"));
    assert.equal(result.materialGroupCount, 2);
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
      anonymousFileId: "ANON-M3-FILE-003",
      extension: ".exe"
    }]);
    assert.equal(JSON.stringify(result).includes("c.exe"), false);
  });
});

test("M3 private dry-run inventory can build anonymous material groups", () => {
  withTempRepo(({ inputDir }) => {
    writeFileSync(path.join(inputDir, "private-real-title.txt"), "title: synthetic\n", "utf8");
    writeFileSync(path.join(inputDir, "private-real-author.md"), "title: synthetic\n", "utf8");
    writeFileSync(path.join(inputDir, "private-real-material.pdf"), "synthetic", "utf8");

    const groups = groupPrimaryMaterials(collectInputInventory(inputDir));
    const publicInventory = groups.map(({ anonymousMaterialId, extension, hasCompanionText, plannedParseMode }) => ({
      anonymousMaterialId,
      extension,
      hasCompanionText,
      plannedParseMode
    }));

    assert.equal(groups.length, 3);
    assert.deepEqual(publicInventory.map((item) => item.extension).sort(), [".md", ".pdf", ".txt"]);
    assert.equal(JSON.stringify(publicInventory).includes("private-real-title"), false);
  });
});

test("M3 private dry-run safety keeps allowed extension list explicit", () => {
  assert.deepEqual(ALLOWED_EXTENSIONS, [".doc", ".docx", ".pdf", ".pptx", ".jpg", ".jpeg", ".png", ".txt", ".md", ".xlsx"]);
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
