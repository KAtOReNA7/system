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
  CALIBRATED_NON_FORMAL_PARAMETER_PROFILE,
  DEFAULT_EVALUATION_PARAMETER_PROFILE,
  resolveEvaluationParameterProfile
} from "../src/domain/oldProductEvaluation/evaluationParameters.js";
import { M2_C0_CLEANED_BILL_CALIBRATED_PARAMETERS } from "../src/domain/oldProductEvaluation/calibratedParameters.js";
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

test("M2-C-0 calibrated parameters are aggregate-only and non-formal", () => {
  assert.equal(M2_C0_CLEANED_BILL_CALIBRATED_PARAMETERS.nonFormalCalibration, true);
  assert.equal(M2_C0_CLEANED_BILL_CALIBRATED_PARAMETERS.realDataAggregated, true);
  assert.equal(M2_C0_CLEANED_BILL_CALIBRATED_PARAMETERS.notForFormalDecision, true);
  assert.equal(M2_C0_CLEANED_BILL_CALIBRATED_PARAMETERS.sourceBoundary.aggregateOnly, true);
  assert.equal(M2_C0_CLEANED_BILL_CALIBRATED_PARAMETERS.sourceBoundary.rawDetailIncluded, false);
  assert.equal(M2_C0_CLEANED_BILL_CALIBRATED_PARAMETERS.latestCompleteMonth, "2026-04");
  assert.ok(M2_C0_CLEANED_BILL_CALIBRATED_PARAMETERS.lifecycle.growthRecent6Prior6Ratio > 1);
  assert.ok(M2_C0_CLEANED_BILL_CALIBRATED_PARAMETERS.forecast.lifecycleFactors.growth > 0);
  assert.ok(M2_C0_CLEANED_BILL_CALIBRATED_PARAMETERS.rating.absoluteAmountThresholdCandidates["S+"] > 0);
});

test("M2-B-4 fixture engine API returns full generated dataset without real data", () => {
  const generated = buildFixtureOldProductEvaluationDataset();
  assert.equal(generated.evaluations.length, 7);
  assert.equal(generated.backtests.length, 1);
  assert.equal(generated.engineSummary.syntheticOnly, true);
  assert.equal(generated.engineSummary.parameterProfile, DEFAULT_EVALUATION_PARAMETER_PROFILE);
  assert.equal(generated.engineSummary.nonFormalCalibration, false);
  assert.equal(generated.engineSummary.realDataAggregated, false);
  assert.equal(generated.engineSummary.notForFormalDecision, true);
  assert.equal(generated.engineSummary.formalEvaluationAllowed, false);
  assertNoForbiddenOutput(generated);
});

test("M2-C-1 default profile remains fixture_baseline and matches explicit baseline", () => {
  const implicit = buildFixtureOldProductEvaluationDataset();
  const explicit = buildFixtureOldProductEvaluationDataset({
    profile: DEFAULT_EVALUATION_PARAMETER_PROFILE
  });

  assert.equal(implicit.engineSummary.parameterProfile, "fixture_baseline");
  assert.deepEqual(
    implicit.evaluations.map((item) => ({
      id: item.standardWorkId,
      lifecycle: item.lifecycle.type,
      rating: item.rating.rating,
      forecastTotalBase: item.forecast.scenarios.base.forecastTotal
    })),
    explicit.evaluations.map((item) => ({
      id: item.standardWorkId,
      lifecycle: item.lifecycle.type,
      rating: item.rating.rating,
      forecastTotalBase: item.forecast.scenarios.base.forecastTotal
    }))
  );
});

test("M2-C-1 calibrated profile is explicit guarded non-formal output", () => {
  const profile = resolveEvaluationParameterProfile(CALIBRATED_NON_FORMAL_PARAMETER_PROFILE);
  const generated = buildFixtureOldProductEvaluationDataset({
    profile: CALIBRATED_NON_FORMAL_PARAMETER_PROFILE
  });

  assert.equal(profile.sourceParameterVersion, M2_C0_CLEANED_BILL_CALIBRATED_PARAMETERS.version);
  assert.equal(generated.engineSummary.parameterProfile, CALIBRATED_NON_FORMAL_PARAMETER_PROFILE);
  assert.equal(generated.engineSummary.nonFormalCalibration, true);
  assert.equal(generated.engineSummary.realDataAggregated, true);
  assert.equal(generated.engineSummary.notForFormalDecision, true);
  assert.equal(generated.engineSummary.formalEvaluationAllowed, false);
  assert.equal(generated.evaluations.every((item) => item.parameterProfile === CALIBRATED_NON_FORMAL_PARAMETER_PROFILE), true);
  assert.equal(generated.evaluations.every((item) => item.nonFormalCalibration === true), true);
  assert.equal(generated.evaluations.every((item) => item.realDataAggregated === true), true);
  assert.equal(generated.evaluations.every((item) => item.formalEvaluationAllowed === false), true);
  assert.equal(generated.evaluations.every((item) => item.notForFormalDecision === true), true);
  assert.equal(generated.evaluations.every((item) => item.rating.ratingParameterMode === "calibrated_amount_threshold"), true);
  assertNoForbiddenOutput(generated);
});

test("M2-C-1 unknown parameter profile fails explicitly", () => {
  assert.throws(
    () => buildFixtureOldProductEvaluationDataset({ profile: "unknown_profile" }),
    /Unknown old-product evaluation parameter profile/
  );
});

test("M2-B-4 CLI outputs parseable fixture JSON", async () => {
  const { stdout, stderr } = await execFileAsync(process.execPath, [cliScript]);
  assert.equal(stderr, "");
  assertNoForbiddenOutput(stdout);
  const body = JSON.parse(stdout);
  assert.equal(body.status, "pass");
  assert.equal(body.mode, "fixture");
  assert.equal(body.stage, "M2-B-4");
  assert.equal(body.profile, DEFAULT_EVALUATION_PARAMETER_PROFILE);
  assert.equal(body.parameterProfile, DEFAULT_EVALUATION_PARAMETER_PROFILE);
  assert.equal(body.syntheticOnly, true);
  assert.equal(body.nonFormalCalibration, false);
  assert.equal(body.realDataAggregated, false);
  assert.equal(body.notForFormalDecision, true);
  assert.equal(body.formalEvaluationAllowed, false);
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

test("M2-C-1 CLI outputs explicit calibrated fixture JSON", async () => {
  const { stdout, stderr } = await execFileAsync(process.execPath, [
    cliScript,
    "--profile",
    CALIBRATED_NON_FORMAL_PARAMETER_PROFILE
  ]);
  assert.equal(stderr, "");
  assertNoForbiddenOutput(stdout);
  const body = JSON.parse(stdout);
  assert.equal(body.status, "pass");
  assert.equal(body.mode, "fixture");
  assert.equal(body.stage, "M2-C-1");
  assert.equal(body.profile, CALIBRATED_NON_FORMAL_PARAMETER_PROFILE);
  assert.equal(body.parameterProfile, CALIBRATED_NON_FORMAL_PARAMETER_PROFILE);
  assert.equal(body.nonFormalCalibration, true);
  assert.equal(body.realDataAggregated, true);
  assert.equal(body.notForFormalDecision, true);
  assert.equal(body.formalEvaluationAllowed, false);
  assert.equal(body.results.every((item) => item.parameterProfile === CALIBRATED_NON_FORMAL_PARAMETER_PROFILE), true);
  assert.equal(body.results.every((item) => item.nonFormalCalibration === true), true);
});

test("M2-C-1 CLI compares profiles with aggregate-only output", async () => {
  const { stdout, stderr } = await execFileAsync(process.execPath, [cliScript, "--compare-profiles"]);
  assert.equal(stderr, "");
  assertNoForbiddenOutput(stdout);
  const body = JSON.parse(stdout);
  assert.equal(body.status, "pass");
  assert.equal(body.stage, "M2-C-1");
  assert.equal(body.aggregateOnly, true);
  assert.equal(body.baselineProfile, DEFAULT_EVALUATION_PARAMETER_PROFILE);
  assert.equal(body.calibratedProfile, CALIBRATED_NON_FORMAL_PARAMETER_PROFILE);
  assert.equal(body.nonFormalCalibration, true);
  assert.equal(body.realDataAggregated, true);
  assert.equal(body.formalEvaluationAllowed, false);
  assert.ok(body.differences.ratingDistribution);
  assert.ok(body.differences.lifecycleDistribution);
  assert.ok(body.differences.forecastTotalDistribution);
  assert.ok(body.differences.riskDistribution);
  assert.ok(body.differences.suggestionDistribution);
  assert.equal(Object.hasOwn(body, "results"), false);
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
