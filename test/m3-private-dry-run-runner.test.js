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
    assert.equal(parsed.aggregate.parseStatusDistribution.accepted_pdf_metadata_only, 1);
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

test("M3 private dry-run feeds parsed docx text into field extraction without public raw text", () => {
  withTempRepo(({ repoRoot, inputDir, outputDir }) => {
    writeFileSync(path.join(inputDir, "material-a.docx"), makeDocxBuffer(syntheticText("DOCX")));
    writeFileSync(path.join(inputDir, "material-b.jpg"), "binary-placeholder", "utf8");
    writeFileSync(path.join(inputDir, "material-c.png"), "binary-placeholder", "utf8");

    const result = runM3PrivateMaterialDryRun({ repoRoot, skipGitChecks: true });
    const resultJsonText = readFileSync(path.join(outputDir, PRIVATE_RESULT_JSON), "utf8");
    const parsed = JSON.parse(resultJsonText);
    const docxResult = parsed.materialResults.find((item) => item.extension === ".docx");

    assert.equal(result.ok, true);
    assert.equal(result.aggregate.parseStatusDistribution.parsed_from_docx_text, 1);
    assert.equal(docxResult.extractionStatus, "extracted_from_docx_text");
    assert.equal(docxResult.extractedTextAvailable, true);
    assert.ok(docxResult.extractedFieldKeys.includes("title"));
    assert.ok(docxResult.extractedFieldKeys.includes("author"));
    assert.equal(resultJsonText.includes("Secret Synthetic Title DOCX"), false);
    assert.equal(resultJsonText.includes("Secret Synthetic Author DOCX"), false);
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
      extractionStatusDistribution: { metadata_only: 3 },
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
    "extractionStatusDistribution",
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

function makeDocxBuffer(text) {
  const escaped = String(text)
    .split(/\r?\n/)
    .map((line) => `<w:p><w:r><w:t>${escapeXml(line)}</w:t></w:r></w:p>`)
    .join("");
  const documentXml = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${escaped}</w:body></w:document>`;
  return makeStoredZip([{ name: "word/document.xml", data: Buffer.from(documentXml, "utf8") }]);
}

function makeStoredZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    localParts.push(local, data);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centralParts.push(central);
    offset += local.length + data.length;
  }

  const centralDirectoryOffset = offset;
  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(centralDirectoryOffset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
