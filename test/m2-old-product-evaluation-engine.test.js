import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";
import {
  FIXTURE_ONLY_THRESHOLDS,
  buildFixtureOldProductEvaluationDataset
} from "../src/domain/oldProductEvaluation/fixtureEngine.js";
import {
  M2_OLD_PRODUCT_BACKTESTS,
  M2_OLD_PRODUCT_DATASET,
  M2_OLD_PRODUCT_EVALUATIONS
} from "../src/fixtures/m2OldProductEvaluationFixture.js";
import { forbiddenM2OldProductOutputTokens } from "./fixtures/m2OldProductEvaluationFixtureCases.js";

const execFileAsync = promisify(execFile);
const cliScript = "scripts/run-m2-old-product-fixture-evaluation.mjs";

function assertNoForbiddenOutput(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  for (const token of forbiddenM2OldProductOutputTokens) {
    assert.equal(text.includes(token), false, `output leaked forbidden token: ${token}`);
  }
}

test("M2-B-4 engine builds fixture input snapshots", () => {
  const first = M2_OLD_PRODUCT_EVALUATIONS[0];
  assert.equal(first.inputSnapshot.standardWorkId, "SYN-WORK-0001");
  assert.equal(first.inputSnapshot.workTitle, "SYN-WORK-NAME-0001");
  assert.equal(first.inputSnapshot.author, "SYN-AUTHOR-0001");
  assert.equal(first.inputSnapshot.cutoffMonth, "2026-04");
  assert.deepEqual(first.inputSnapshot.incompleteMonths, ["2026-05"]);
  assert.equal(first.inputSnapshot.datasetBoundary, "fixture-synthetic-only");
  assert.equal(first.inputSnapshot.notForFormalDecision, true);
  assert.equal(first.syntheticOnly, true);
  assert.equal(first.notForFormalDecision, true);
});

test("M2-B-4 engine covers lifecycle labels and transparent non-formal thresholds", () => {
  const lifecycles = new Set(M2_OLD_PRODUCT_EVALUATIONS.map((item) => item.lifecycle.type));
  for (const lifecycle of [
    "growth",
    "stable",
    "declining",
    "long_tail",
    "inactive",
    "rebound",
    "insufficient_history"
  ]) {
    assert.equal(lifecycles.has(lifecycle), true, `${lifecycle} should be covered`);
  }
  assert.equal(FIXTURE_ONLY_THRESHOLDS.growthRatio > 1, true);
  assert.equal(M2_OLD_PRODUCT_EVALUATIONS.every((item) => item.lifecycle.fixtureThresholds), true);
});

test("M2-B-4 engine builds income summaries and excludes incomplete months", () => {
  for (const item of M2_OLD_PRODUCT_EVALUATIONS) {
    assert.equal(item.incomeSummary.incompleteMonthExcluded, true);
    assert.equal(typeof item.incomeSummary.last12MonthRevenue, "string");
    assert.equal(typeof item.incomeSummary.last24MonthRevenue, "string");
    assert.equal(typeof item.incomeSummary.totalHistoricalRevenue, "string");
    assert.equal(["up", "down", "flat", "inactive", "growth"].includes(item.incomeSummary.recentTrend), true);
    assert.equal(typeof item.incomeSummary.peakMonth, "string");
    assert.equal(Number.isInteger(item.incomeSummary.activeMonthCount), true);
    assert.equal(Number.isInteger(item.incomeSummary.zeroRevenueMonthCount), true);
    assert.ok(item.incomeSummary.businessFormBreakdown);
  }
});

test("M2-B-4 engine builds three forecast scenarios", () => {
  for (const item of M2_OLD_PRODUCT_EVALUATIONS) {
    assert.deepEqual(Object.keys(item.forecast.scenarios), ["base", "optimistic", "pessimistic"]);
    for (const scenario of Object.values(item.forecast.scenarios)) {
      assert.equal(typeof scenario.forecastTotal, "string");
      assert.equal(Array.isArray(scenario.annualBreakdown), true);
      assert.equal(Number.isInteger(scenario.remainingMonthCount), true);
      assert.equal(Array.isArray(scenario.assumptions), true);
      assert.ok(scenario.range.lower);
      assert.ok(scenario.range.upper);
      assert.equal(scenario.notForFormalDecision, true);
    }
  }
});

test("M2-B-4 engine builds ratings, risks and suggestions", () => {
  const ratings = new Set(M2_OLD_PRODUCT_EVALUATIONS.map((item) => item.rating.rating));
  assert.deepEqual([...ratings], ["S+", "S", "A", "B", "C", "D", "E"]);
  for (const item of M2_OLD_PRODUCT_EVALUATIONS) {
    assert.equal(typeof item.rating.ratingScore, "number");
    assert.equal(item.rating.fixtureThresholds, true);
    assert.equal(Array.isArray(item.rating.upgradeReasons), true);
    assert.equal(Array.isArray(item.rating.downgradeReasons), true);
    assert.equal(item.risks.some((risk) => risk.code === "synthetic_fixture_boundary"), true);
    assert.equal(item.risks.every((risk) => risk.code && risk.severity && risk.message && risk.mitigationHint), true);
    assert.equal(item.suggestions.length > 0, true);
    assert.equal(item.suggestions.every((suggestion) => suggestion.action && suggestion.notForFormalDecision), true);
  }
});

test("M2-B-4 engine builds synthetic backtest shape", () => {
  const [batch] = M2_OLD_PRODUCT_BACKTESTS;
  assert.equal(batch.batchId, "SYN-BACKTEST-0001");
  assert.equal(batch.algorithmVersion, "fixture-old-product-v1");
  assert.equal(batch.syntheticOnly, true);
  assert.equal(batch.covered, 1);
  assert.equal(batch.missed, 1);
  assert.equal(batch.over, 1);
  assert.equal(batch.under, 1);
  assert.ok(batch.summary);
});

test("M2-B-4 fixture engine API returns full generated dataset without real data", () => {
  const generated = buildFixtureOldProductEvaluationDataset();
  assert.equal(generated.evaluations.length, 7);
  assert.equal(generated.backtests.length, 1);
  assert.equal(generated.engineSummary.syntheticOnly, true);
  assert.equal(generated.engineSummary.notForFormalDecision, true);
  assertNoForbiddenOutput(generated);
});

test("M2-B-4 CLI outputs parseable fixture JSON", async () => {
  const { stdout, stderr } = await execFileAsync(process.execPath, [cliScript]);
  assert.equal(stderr, "");
  assertNoForbiddenOutput(stdout);
  const body = JSON.parse(stdout);
  assert.equal(body.status, "pass");
  assert.equal(body.mode, "fixture");
  assert.equal(body.stage, "M2-B-4");
  assert.equal(body.syntheticOnly, true);
  assert.equal(body.notForFormalDecision, true);
  assert.equal(body.dataset.mode, M2_OLD_PRODUCT_DATASET.mode);
  assert.equal(body.guards.databaseConnected, false);
  assert.equal(body.guards.dockerExecuted, false);
  assert.equal(body.guards.dataDirectoryRead, false);
  assert.equal(body.guards.formalModeAdded, false);
  assert.equal(body.guards.localDryRunModeAdded, false);
  assert.equal(body.guards.writeApiAdded, false);
  assert.equal(body.guards.exportApiAdded, false);
  assert.equal(body.guards.evaluationTaskApiAdded, false);
});

test("M2-B-4 CLI source has no database Docker network or subprocess entrypoint", async () => {
  const source = await readFile(cliScript, "utf8");
  assert.equal(source.includes("node:child_process"), false);
  assert.equal(source.includes("execFile"), false);
  assert.equal(source.includes("spawn("), false);
  assert.equal(source.includes("connect("), false);
  assert.equal(source.includes("new Pool"), false);
  assert.equal(source.includes("new Client"), false);
  assert.equal(source.includes("fetch("), false);
  assert.equal(source.includes("http.request"), false);
  assert.equal(source.includes("https.request"), false);
  assert.equal(source.includes("data/"), false);
});
