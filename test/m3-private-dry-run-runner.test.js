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
    writeFileSync(path.join(inputDir, "material-a.txt"), [
      "作品名：Secret Synthetic Title A",
      "作者：Secret Synthetic Author A",
      "来源：原创网文",
      "分类：玄幻，成长",
      "字数：800000",
      "完结状态：completed",
      "阅读量：120000",
      "收藏量：22000",
      "评分：8.6",
      "评论数：1500",
      "目标渠道：channel-a, channel-b",
      "版权期：5 years",
      "同名音频核查状态：已核查",
      "同名音频状态：无",
      "改编信号：漫画",
      "运营对标：operator-comparator-a"
    ].join("\n"), "utf8");
    writeFileSync(path.join(inputDir, "material-b.md"), [
      "title: Secret Synthetic Title B",
      "author: Secret Synthetic Author B",
      "source: publication",
      "classification: suspense",
      "wordCount: 320000",
      "reads: 50000",
      "targetChannels: channel-c",
      "copyrightTermRange: 3 years",
      "sameNameAudioStatusCheckStatus: checked",
      "sameNameAudioStatus: none"
    ].join("\n"), "utf8");
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
    assert.equal(parsed.aggregate.materialCount, 3);
    assert.equal(parsed.aggregate.parseStatusDistribution.text_parsed_partial, 2);
    assert.equal(parsed.aggregate.parseStatusDistribution.metadata_only_manual_text_required, 1);
    assert.equal(parsed.guardrails.rawMaterialStored, false);
    assert.equal(resultText.includes("Secret Synthetic Title"), false);
    assert.equal(resultText.includes("Secret Synthetic Author"), false);
    assert.equal(markdownText.includes("Secret Synthetic Title"), false);
    assert.equal(markdownText.includes("material-a.txt"), false);
  });
});

test("M3 private dry-run public aggregate summary stays sanitized", () => {
  const summary = buildPublicAggregateSummary({
    ok: true,
    aggregate: {
      materialCount: 3,
      extensionDistribution: { ".txt": 1, ".md": 1, ".pdf": 1 },
      parseStatusDistribution: { text_parsed_partial: 2, metadata_only_manual_text_required: 1 },
      readinessDistribution: { blocked: 1, warning_only: 2 },
      forecastStatusDistribution: { generated: 2, blocked: 1 },
      ratingDistribution: { A: 1, B: 1, E: 1 }
    }
  });

  assert.deepEqual(Object.keys(summary), [
    "ok",
    "materialCount",
    "extensionDistribution",
    "parseStatusDistribution",
    "readinessDistribution",
    "forecastStatusDistribution",
    "ratingDistribution",
    "rawMaterialStored",
    "realFileNamesPrinted",
    "notForFormalDecision"
  ]);
  assert.equal(JSON.stringify(summary).includes("Secret Synthetic"), false);
});

test("M3 private dry-run rejects missing input count before reading private material", () => {
  withTempRepo(({ repoRoot, inputDir }) => {
    writeFileSync(path.join(inputDir, "only-one.txt"), "title: Secret Synthetic Title\n", "utf8");

    const result = runM3PrivateMaterialDryRun({ repoRoot, skipGitChecks: true });

    assert.equal(result.ok, false);
    assert.equal(result.dryRunExecuted, false);
    assert.equal(result.privateMaterialRead, false);
    assert.ok(result.safety.issues.some((issue) => issue.code === "input_file_count_out_of_range"));
  });
});

test("M3 private dry-run parser maps expected Chinese and English keys", () => {
  const fields = extractFieldsFromText([
    "作品名：Secret Synthetic Title",
    "作者：Secret Synthetic Author",
    "来源：出版物",
    "分类：都市，悬疑",
    "字数：450000",
    "targetChannels: channel-a, channel-b",
    "sameNameAudioStatusCheckStatus: checked"
  ].join("\n"));

  assert.equal(fields.title, "Secret Synthetic Title");
  assert.equal(fields.author, "Secret Synthetic Author");
  assert.equal(fields.source, "publication");
  assert.deepEqual(fields.classificationCandidate, ["都市", "悬疑"]);
  assert.equal(fields.wordCount, 450000);
  assert.deepEqual(fields.targetChannels, ["channel-a", "channel-b"]);
  assert.equal(fields.sameNameAudioStatusCheckStatus, "checked");
});

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
