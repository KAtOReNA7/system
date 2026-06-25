import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { isObsoleteV2Field } from "../src/domain/oldProductEvaluation/cleanedLedgerMinimalBackfill.js";

const script = "scripts/m2-real-data/run_m1_ledger_spotcheck_summary.py";

function row(overrides = {}) {
  return {
    审核编号: "SC-001",
    优先级: "中",
    字段类型: "版权到期日期",
    当前值: "",
    候选值: "2030-12-31",
    来源台账字段: "到期时间",
    台账摘要: "sanitized ledger summary",
    匹配方式: "精确作品ID匹配",
    匹配置信度: "高",
    值置信度: "高",
    Codex建议: "可自动应用候选",
    为什么建议这样处理: "空值且高置信，无冲突。",
    用户判断: "接受",
    用户修正值: "",
    用户备注: "",
    ...overrides
  };
}

function runSummary(rows) {
  const dir = mkdtempSync(join(tmpdir(), "m1-ledger-spotcheck-"));
  try {
    const input = join(dir, "rows.json");
    const privateOutput = join(dir, "private.json");
    const publicJson = join(dir, "public.json");
    const publicMd = join(dir, "public.md");
    writeFileSync(input, JSON.stringify(rows), "utf8");

    execFileSync(
      process.execPath,
      [
        "scripts/run-codex-python.mjs",
        script,
        "--rows-json",
        input,
        "--private-output",
        privateOutput,
        "--public-json",
        publicJson,
        "--public-md",
        publicMd
      ],
      { cwd: process.cwd(), stdio: "pipe", encoding: "utf8" }
    );
    return JSON.parse(readFileSync(publicJson, "utf8"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function rows(count, makeRow = (index) => row({ 审核编号: `SC-${String(index + 1).padStart(3, "0")}` })) {
  return Array.from({ length: count }, (_, index) => makeRow(index));
}

test("spotcheck summary calculates completion rate", () => {
  const summary = runSummary([
    ...rows(9),
    row({ 审核编号: "SC-010", 用户判断: "" })
  ]);

  assert.equal(summary.metrics.totalRows, 10);
  assert.equal(summary.metrics.completedRows, 9);
  assert.equal(summary.metrics.completionRate, 0.9);
});

test("v3 minimal spotcheck treats old v2-only fields as obsolete", () => {
  assert.equal(isObsoleteV2Field("audioRightsStatus"), true);
  assert.equal(isObsoleteV2Field("publisherName"), true);
  assert.equal(isObsoleteV2Field("firstPublicationDate"), true);
  assert.equal(isObsoleteV2Field("classificationLevel3"), true);
});

test("spotcheck summary calculates high-confidence acceptance rate", () => {
  const summary = runSummary([
    ...rows(18),
    row({ 审核编号: "SC-019", 用户判断: "拒绝" }),
    row({ 审核编号: "SC-020", 用户判断: "需修改", 用户修正值: "corrected" })
  ]);

  assert.equal(summary.metrics.highConfidenceRows, 20);
  assert.equal(summary.metrics.highConfidenceAcceptedRows, 18);
  assert.equal(summary.metrics.highConfidenceAcceptanceRate, 0.9);
  assert.equal(summary.status, "needs_rule_fix");
});

test("needs modify without correction value blocks readiness", () => {
  const summary = runSummary([
    ...rows(19),
    row({ 审核编号: "SC-020", 用户判断: "需修改", 用户修正值: "" })
  ]);

  assert.equal(summary.metrics.needsModifyMissingCorrectionCount, 1);
  assert.equal(summary.gateChecks.allNeedsModifyHaveCorrectionValue, false);
  assert.equal(summary.status, "needs_rule_fix");
});

test("high revenue error blocks apply", () => {
  const summary = runSummary([
    ...rows(19),
    row({ 审核编号: "SC-020", 优先级: "高", 用户判断: "拒绝" })
  ]);

  assert.equal(summary.metrics.highRevenueErrorCount, 1);
  assert.equal(summary.gateChecks.highRevenueErrorCountZero, false);
  assert.equal(summary.status, "needs_rule_fix");
});

test("uncertain rows are not automatic apply candidates", () => {
  const summary = runSummary([
    ...rows(19),
    row({ 审核编号: "SC-020", 用户判断: "不确定" })
  ]);

  assert.equal(summary.metrics.uncertainRows, 1);
  assert.equal(summary.metrics.uncertainExcludedFromAutoApply, true);
  assert.equal(summary.gateChecks.uncertainRowsExcludedFromAutoApply, true);
});

test("low and medium confidence rows remain excluded from automatic apply", () => {
  const summary = runSummary([
    ...rows(19),
    row({
      审核编号: "SC-020",
      匹配置信度: "中",
      值置信度: "中",
      Codex建议: "建议快速复核",
      用户判断: "接受"
    })
  ]);

  assert.equal(summary.metrics.lowOrMediumConfidenceRowCount, 1);
  assert.equal(summary.metrics.lowOrMediumConfidenceExcludedFromAutoApply, true);
  assert.equal(summary.gateChecks.lowOrMediumConfidenceRowsExcludedFromAutoApply, true);
});

test("ready and waiting states are explicit", () => {
  const ready = runSummary(rows(20));
  assert.equal(ready.status, "ready_for_local_staging_apply");
  assert.equal(ready.readyForLocalStagingApply, true);

  const waiting = runSummary(rows(20, (index) => row({ 审核编号: `SC-${index}`, 用户判断: "" })));
  assert.equal(waiting.status, "waiting_for_user_spotcheck");
  assert.equal(waiting.readyForLocalStagingApply, false);
});
