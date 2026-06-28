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
  PRIVATE_RESULT_JSON,
  PRIVATE_RESULT_MARKDOWN,
  buildPublicAggregateSummary,
  extractFieldsFromText,
  runM3PrivateMaterialDryRun
} from "../scripts/m3-private-dry-run/run_m3_private_material_dry_run.js";

test("M3 private dry-run parses synthetic txt and md without storing raw values", () => {
  withTempRepo(({ repoRoot, inputDir, outputDir }) => {
    writeFileSync(path.join(inputDir, "material-a.txt"), syntheticText("A"), "utf8");
    writeFileSync(path.join(inputDir, "material-b.md"), syntheticText("B"), "utf8");
    writeFileSync(path.join(inputDir, "material-c.pdf"), "binary-placeholder", "utf8");

    const result = runM3PrivateMaterialDryRun({ repoRoot, skipGitChecks: true });
    const resultJsonPath = path.join(outputDir, PRIVATE_RESULT_JSON);
    const resultMarkdownPath = path.join(outputDir, PRIVATE_RESULT_MARKDOWN);
    const resultText = readFileSync(resultJsonPath, "utf8");
    const markdownText = readFileSync(resultMarkdownPath, "utf8");
    const parsed = JSON.parse(resultText);

    assert.equal(result.ok, true);
    assert.equal(existsSync(resultJsonPath), true);
    assert.equal(existsSync(resultMarkdownPath), true);
    assert.equal(parsed.aggregate.materialGroupCount, 3);
    assert.equal(parsed.aggregate.parseStatusDistribution.parsed_from_text, 2);
    assert.equal(parsed.aggregate.parseStatusDistribution.accepted_document_metadata_only, 1);
    assert.equal(parsed.guardrails.rawMaterialStored, false);
    assert.equal(resultText.includes("Secret Synthetic Title"), false);
    assert.equal(resultText.includes("Secret Synthetic Author"), false);
    assert.equal(markdownText.includes("Secret Synthetic Title"), false);
    assert.equal(markdownText.includes("material-a.txt"), false);
  });
});

test("M3 private dry-run accepts doc and image inputs as primary metadata-only materials", () => {
  withTempRepo(({ repoRoot, inputDir }) => {
    writeFileSync(path.join(inputDir, "private-one.doc"), "binary-placeholder", "utf8");
    writeFileSync(path.join(inputDir, "private-two.jpg"), "binary-placeholder", "utf8");
    writeFileSync(path.join(inputDir, "private-three.png"), "binary-placeholder", "utf8");

    const result = runM3PrivateMaterialDryRun({ repoRoot, skipGitChecks: true });

    assert.equal(result.ok, true);
    assert.equal(result.aggregate.materialGroupCount, 3);
    assert.equal(result.aggregate.acceptedPrimaryMaterialCount, 3);
    assert.deepEqual(result.aggregate.extensionDistribution, { ".doc": 1, ".jpg": 1, ".png": 1 });
    assert.equal(result.aggregate.parseStatusDistribution.accepted_legacy_doc_metadata_only, 1);
    assert.equal(result.aggregate.parseStatusDistribution.accepted_image_metadata_only, 2);
    assert.equal(result.aggregate.forecastStatusDistribution.blocked, 3);
    assert.equal(result.aggregate.ratingGeneratedCount, 0);
    assert.equal(result.aggregate.ratingNotGeneratedCount, 3);
    assert.equal(result.aggregate.blockedRatingSuppressedCount, 3);
    assert.equal(result.aggregate.ratingDistribution.E, undefined);
  });
});

test("M3 private dry-run handles jpg jpeg png parse statuses", () => {
  withTempRepo(({ repoRoot, inputDir }) => {
    writeFileSync(path.join(inputDir, "a.jpg"), "binary-placeholder", "utf8");
    writeFileSync(path.join(inputDir, "b.jpeg"), "binary-placeholder", "utf8");
    writeFileSync(path.join(inputDir, "c.png"), "binary-placeholder", "utf8");

    const result = runM3PrivateMaterialDryRun({ repoRoot, skipGitChecks: true });

    assert.equal(result.ok, true);
    assert.equal(result.aggregate.acceptedImageCount, 3);
    assert.equal(result.aggregate.visualExtractionRequiredCount, 3);
    assert.equal(result.aggregate.parseStatusDistribution.accepted_image_metadata_only, 3);
  });
});

test("M3 private dry-run uses companion text as enhancement without adding a material group", () => {
  withTempRepo(({ repoRoot, inputDir }) => {
    writeFileSync(path.join(inputDir, "material-a.doc"), "binary-placeholder", "utf8");
    writeFileSync(path.join(inputDir, "material-a.txt"), syntheticText("A"), "utf8");
    writeFileSync(path.join(inputDir, "material-b.jpg"), "binary-placeholder", "utf8");
    writeFileSync(path.join(inputDir, "material-c.png"), "binary-placeholder", "utf8");

    const result = runM3PrivateMaterialDryRun({ repoRoot, skipGitChecks: true });

    assert.equal(result.ok, true);
    assert.equal(result.aggregate.materialGroupCount, 3);
    assert.equal(result.aggregate.companionTextCount, 1);
    assert.equal(result.aggregate.parseStatusDistribution.parsed_from_companion_text_enhanced, 1);
    assert.equal(result.aggregate.parseStatusDistribution.accepted_image_metadata_only, 2);
  });
});

test("M3 private dry-run metadata-only blocked results suppress candidate E rating", () => {
  withTempRepo(({ repoRoot, inputDir, outputDir }) => {
    writeFileSync(path.join(inputDir, "private-one.doc"), "binary-placeholder", "utf8");
    writeFileSync(path.join(inputDir, "private-two.jpg"), "binary-placeholder", "utf8");
    writeFileSync(path.join(inputDir, "private-three.jpeg"), "binary-placeholder", "utf8");

    runM3PrivateMaterialDryRun({ repoRoot, skipGitChecks: true });
    const parsed = JSON.parse(readFileSync(path.join(outputDir, PRIVATE_RESULT_JSON), "utf8"));

    for (const material of parsed.materialResults) {
      assert.equal(material.readinessStatus, "blocked");
      assert.equal(material.ratingSummary.rating, null);
      assert.equal(material.ratingStatus, "not_generated_due_to_readiness_blocked");
      assert.equal(material.candidateRatingGenerated, false);
    }
  });
});

test("M3 private dry-run public aggregate summary stays sanitized", () => {
  const summary = buildPublicAggregateSummary({
    ok: true,
    aggregate: {
      materialGroupCount: 3,
      extensionDistribution: { ".doc": 1, ".jpg": 1, ".png": 1 },
      parseStatusDistribution: { accepted_image_metadata_only: 2, accepted_legacy_doc_metadata_only: 1 },
      readinessDistribution: { blocked: 3 },
      forecastStatusDistribution: { blocked: 3 },
      ratingGeneratedCount: 0,
      ratingNotGeneratedCount: 3
    }
  });

  assert.deepEqual(Object.keys(summary), [
    "ok",
    "materialGroupCount",
    "extensionDistribution",
    "parseStatusDistribution",
    "readinessDistribution",
    "forecastStatusDistribution",
    "ratingGeneratedCount",
    "ratingNotGeneratedCount",
    "rawMaterialStored",
    "realFileNamesPrinted",
    "notForFormalDecision"
  ]);
  assert.equal(JSON.stringify(summary).includes("Secret Synthetic"), false);
});

test("M3 private dry-run rejects missing material group count before reading private material", () => {
  withTempRepo(({ repoRoot, inputDir }) => {
    writeFileSync(path.join(inputDir, "only-one.txt"), "title: Secret Synthetic Title\n", "utf8");

    const result = runM3PrivateMaterialDryRun({ repoRoot, skipGitChecks: true });

    assert.equal(result.ok, false);
    assert.equal(result.dryRunExecuted, false);
    assert.equal(result.privateMaterialRead, false);
    assert.ok(result.safety.issues.some((issue) => issue.code === "material_group_count_out_of_range"));
  });
});

test("M3 private dry-run parser maps expected English keys", () => {
  const fields = extractFieldsFromText([
    "title: Secret Synthetic Title",
    "author: Secret Synthetic Author",
    "source: publication",
    "classification: urban, suspense",
    "wordCount: 450000",
    "targetChannels: channel-a, channel-b",
    "sameNameAudioStatusCheckStatus: checked"
  ].join("\n"));

  assert.equal(fields.title, "Secret Synthetic Title");
  assert.equal(fields.author, "Secret Synthetic Author");
  assert.equal(fields.source, "publication");
  assert.deepEqual(fields.classificationCandidate, ["urban", "suspense"]);
  assert.equal(fields.wordCount, 450000);
  assert.deepEqual(fields.targetChannels, ["channel-a", "channel-b"]);
  assert.equal(fields.sameNameAudioStatusCheckStatus, "checked");
});

function syntheticText(suffix) {
  return [
    `title: Secret Synthetic Title ${suffix}`,
    `author: Secret Synthetic Author ${suffix}`,
    "source: publication",
    "classification: suspense",
    "wordCount: 320000",
    "reads: 50000",
    "collections: 6000",
    "ratingScore: 8.2",
    "commentCount: 1200",
    "targetChannels: channel-a, channel-b",
    "copyrightTermRange: 3 years",
    "sameNameAudioStatusCheckStatus: checked",
    "sameNameAudioStatus: none"
  ].join("\n");
}

function withTempRepo(callback) {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), "m3-private-dry-run-runner-"));
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
