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
  applyM3FieldCompletionPack
} from "../scripts/m3-private-dry-run/apply_m3_field_completion_pack.js";
import {
  FIELD_COMPLETION_PACK_JSON,
  FIELD_COMPLETION_PACK_MARKDOWN,
  generateM3FieldCompletionPack
} from "../scripts/m3-private-dry-run/generate_m3_field_completion_pack.js";
import {
  PRIVATE_RESULT_JSON,
  runM3PrivateMaterialDryRun
} from "../scripts/m3-private-dry-run/run_m3_private_material_dry_run.js";

test("M3 field completion pack includes hard-blocker core fields without filenames or raw text", () => {
  withTempRepo(({ repoRoot, inputDir, outputDir }) => {
    writeFileSync(path.join(inputDir, "real-looking-private-a.doc"), "binary-placeholder", "utf8");
    writeFileSync(path.join(inputDir, "real-looking-private-b.jpg"), "binary-placeholder", "utf8");
    writeFileSync(path.join(inputDir, "real-looking-private-c.png"), "binary-placeholder", "utf8");
    runM3PrivateMaterialDryRun({ repoRoot, skipGitChecks: true, legacyDocConverter: null });

    const result = generateM3FieldCompletionPack({ repoRoot });
    const packText = readFileSync(path.join(outputDir, FIELD_COMPLETION_PACK_JSON), "utf8");
    const markdownText = readFileSync(path.join(outputDir, FIELD_COMPLETION_PACK_MARKDOWN), "utf8");
    const pack = JSON.parse(packText);

    assert.equal(result.ok, true);
    assert.equal(existsSync(path.join(outputDir, FIELD_COMPLETION_PACK_JSON)), true);
    assert.equal(pack.materialCount, 3);
    assert.equal(pack.rows.every((row) => row.hardBlockerCodes.includes("missing_title")), true);
    assert.equal(pack.rows.every((row) => row.missingCoreFields.includes("title")), true);
    assert.equal(pack.rows.every((row) => Object.hasOwn(row.userFields, "title")), true);
    assert.equal(pack.rows.every((row) => Object.hasOwn(row.userFields, "sameNameAudioStatusCheckStatus")), true);
    assert.equal(packText.includes("real-looking-private"), false);
    assert.equal(markdownText.includes("Fill Instructions"), true);
    assert.equal(markdownText.includes("source`: `publication` or `web_original`"), true);
    assert.equal(markdownText.includes("| anonymousMaterialId | inputExtension | parseStatus"), true);
    assert.equal(packText.includes("Secret Synthetic"), false);
    assert.equal(result.outputJson.startsWith(DEFAULT_OUTPUT_DIR.replaceAll("\\", "/")), true);
  });
});

test("M3 field completion apply merges manual fields and can unblock forecast and rating", () => {
  withTempRepo(({ repoRoot, inputDir, outputDir }) => {
    writeFileSync(path.join(inputDir, "material-a.doc"), "binary-placeholder", "utf8");
    writeFileSync(path.join(inputDir, "material-b.jpg"), "binary-placeholder", "utf8");
    writeFileSync(path.join(inputDir, "material-c.png"), "binary-placeholder", "utf8");
    runM3PrivateMaterialDryRun({ repoRoot, skipGitChecks: true, legacyDocConverter: null });
    generateM3FieldCompletionPack({ repoRoot });

    const packPath = path.join(outputDir, FIELD_COMPLETION_PACK_JSON);
    const pack = JSON.parse(readFileSync(packPath, "utf8"));
    pack.rows = pack.rows.map((row, index) => ({
      ...row,
      userFields: {
        ...row.userFields,
        title: `Synthetic Filled Title ${index + 1}`,
        author: `Synthetic Filled Author ${index + 1}`,
        source: "publication",
        classification: "suspense",
        wordCount: "320000",
        heatSignalType: "reads",
        heatSignalValue: "50000",
        copyrightTermRange: "3 years",
        targetChannels: "channel-a, channel-b",
        sameNameAudioStatusCheckStatus: "checked",
        sameNameAudioStatus: "none"
      }
    }));
    writeFileSync(packPath, `${JSON.stringify(pack, null, 2)}\n`, "utf8");

    const result = applyM3FieldCompletionPack({
      repoRoot,
      packPath: path.join(DEFAULT_OUTPUT_DIR, FIELD_COMPLETION_PACK_JSON)
    });
    const resultText = readFileSync(path.join(outputDir, "M3-private-material-dry-run-result-after-completion-v0.1.json"), "utf8");
    const applied = JSON.parse(resultText);

    assert.equal(result.ok, true);
    assert.equal(result.aggregate.readinessDistribution.blocked, undefined);
    assert.equal(result.aggregate.forecastGeneratedCount, 3);
    assert.equal(result.aggregate.ratingGeneratedCount, 3);
    assert.equal(result.aggregate.ratingStatusDistribution.generated, 3);
    assert.equal(applied.materialResults.every((row) => row.missingCoreFields.length === 0), true);
    assert.equal(resultText.includes("Synthetic Filled Title"), false);
    assert.equal(resultText.includes("Synthetic Filled Author"), false);
  });
});

test("M3 field completion apply can read a filled Markdown pack", () => {
  withTempRepo(({ repoRoot, outputDir }) => {
    writeFileSync(path.join(outputDir, FIELD_COMPLETION_PACK_MARKDOWN), markdownPack(), "utf8");

    const result = applyM3FieldCompletionPack({
      repoRoot,
      packPath: path.join(DEFAULT_OUTPUT_DIR, FIELD_COMPLETION_PACK_MARKDOWN)
    });

    assert.equal(result.ok, true);
    assert.equal(result.aggregate.materialCount, 1);
    assert.equal(result.aggregate.readinessDistribution.blocked, undefined);
    assert.equal(result.aggregate.forecastGeneratedCount, 1);
    assert.equal(result.aggregate.ratingGeneratedCount, 1);
  });
});

test("M3 field completion auto-discovery stops when JSON and Markdown packs conflict", () => {
  withTempRepo(({ repoRoot, outputDir }) => {
    const jsonPack = {
      version: "conflict-json",
      rows: [completionRow("ANON-CONFLICT-001", "Synthetic JSON Title")]
    };
    writeFileSync(path.join(outputDir, FIELD_COMPLETION_PACK_JSON), `${JSON.stringify(jsonPack, null, 2)}\n`, "utf8");
    writeFileSync(path.join(outputDir, FIELD_COMPLETION_PACK_MARKDOWN), markdownPack("ANON-CONFLICT-001", "Synthetic Markdown Title"), "utf8");

    assert.throws(
      () => applyM3FieldCompletionPack({ repoRoot }),
      /conflicting user fields/
    );
  });
});

test("M3 field completion apply rejects packs outside private output", () => {
  withTempRepo(({ repoRoot }) => {
    assert.throws(
      () => applyM3FieldCompletionPack({ repoRoot, packPath: "docs/not-private.json" }),
      /data\/private-output/
    );
  });
});

test("M3 field completion pack generation requires private dry-run result", () => {
  withTempRepo(({ repoRoot }) => {
    assert.throws(
      () => generateM3FieldCompletionPack({ repoRoot }),
      /private dry-run result is missing/
    );
  });
});

test("M3 private dry-run result exposes completion recommendation fields", () => {
  withTempRepo(({ repoRoot, inputDir, outputDir }) => {
    writeFileSync(path.join(inputDir, "material-a.doc"), "binary-placeholder", "utf8");
    writeFileSync(path.join(inputDir, "material-b.jpg"), "binary-placeholder", "utf8");
    writeFileSync(path.join(inputDir, "material-c.png"), "binary-placeholder", "utf8");
    runM3PrivateMaterialDryRun({ repoRoot, skipGitChecks: true, legacyDocConverter: null });
    const parsed = JSON.parse(readFileSync(path.join(outputDir, PRIVATE_RESULT_JSON), "utf8"));

    assert.equal(parsed.aggregate.canGenerateFieldCompletionPackCount, 3);
    assert.equal(parsed.aggregate.completionPackRecommendedCount, 3);
    assert.equal(parsed.materialResults.every((row) => row.canGenerateFieldCompletionPack), true);
    assert.equal(parsed.materialResults.every((row) => row.completionPackRecommended), true);
    assert.equal(parsed.materialResults.every((row) => row.ratingSummary.rating === null), true);
  });
});

function withTempRepo(callback) {
  const repoRoot = mkdtempSync(path.join(os.tmpdir(), "m3-private-field-completion-"));
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

function markdownPack(materialId = "ANON-MD-APPLY-001", title = "Synthetic Markdown Title") {
  return [
    "# M3 private material field completion pack v0.1",
    "",
    "| anonymousMaterialId | inputExtension | parseStatus | readinessStatus | missingCoreFields | title | author | source | classification | wordCount | audioVolumeEstimate | heatSignalType | heatSignalValue | copyrightTermRange | targetChannels | sameNameAudioStatusCheckStatus | sameNameAudioStatus | completionStatus | notes |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    `| ${materialId} | .md | parsed | blocked | title | ${title} | Synthetic Markdown Author | publication | class-a | 320000 |  | reads | 50000 | 3 years | channel-a, channel-b | checked | none |  | note |`
  ].join("\n");
}

function completionRow(materialId, title) {
  return {
    anonymousMaterialId: materialId,
    inputExtension: ".json",
    parseStatus: "parsed",
    readinessStatus: "blocked",
    missingCoreFields: ["title"],
    userFields: {
      title,
      author: "Synthetic JSON Author",
      source: "publication",
      classification: "class-a",
      wordCount: "320000",
      heatSignalType: "reads",
      heatSignalValue: "50000",
      copyrightTermRange: "3 years",
      targetChannels: "channel-a, channel-b",
      sameNameAudioStatusCheckStatus: "checked",
      sameNameAudioStatus: "none"
    }
  };
}
