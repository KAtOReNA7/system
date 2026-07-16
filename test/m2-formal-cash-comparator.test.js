import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const python = "scripts/run-codex-python.mjs";
const runner = "scripts/m2-real-data/run_m2_formal_cash_comparator_replay.py";
const reportDir = path.join(root, "docs", "analysis", "m2-real-data");
const spec = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      "src/domain/oldProductEvaluation/calibrationSpec.formalCashComparator.v1.json",
    ),
    "utf8",
  ),
);

const expectedGateConditions = [
  "formal_cash_comparator_replay_complete",
  "comparator_target_population_case_key_parity",
  "pure_buyout_null_never_scored_as_zero",
  "legacy_target_comparator_excluded_from_selection",
  "old_new_target_bridge_reconciles",
  "three_actuals_conserve_per_case_and_aggregate",
  "surprise_unique_audit_complete_or_fail_closed_unavailable",
  "population_and_coverage_report_complete",
  "future_perturbation_invariance_passed",
  "all_seals_closed",
  "formal_cash_calibration_spec_frozen",
  "full_validation_suite_passed",
  "phase_a_commit_pushed",
  "no_private_file_tracked",
];

function runPython(args) {
  return spawnSync(process.execPath, [python, runner, ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      M1_APP_ENV: "ci",
      M1_DATABASE_URL: "",
      M1_DATABASE_READONLY_URL: "",
      M1_DATABASE_BACKGROUND_URL: "",
    },
    maxBuffer: 64 * 1024 * 1024,
  });
}

function lastJson(stdout) {
  return JSON.parse(stdout.trim().split(/\r?\n/).at(-1));
}

function readReport(name) {
  const reportPath = path.join(reportDir, name);
  assert.equal(fs.existsSync(reportPath), true, `${name} must be generated`);
  return JSON.parse(fs.readFileSync(reportPath, "utf8"));
}

function closeTo(actual, expected, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

test("formal-cash comparator spec freezes target, cases, selection, and Gate B", () => {
  assert.deepEqual(spec.comparators.replayed, ["B0b", "B1", "B3", "B4"]);
  assert.equal(spec.comparators.B0aSelectionEligible, false);
  assert.equal(spec.comparators.legacyTargetMetricsMaySelectComparator, false);
  assert.equal(spec.caseContract.developmentCaseCountPerComparator, 18615);
  assert.equal(spec.caseContract.statisticallyScoreableCaseCount, 12223);
  assert.deepEqual(spec.caseContract.horizonsMonths, [3, 6, 12, 18, 24]);
  assert.equal(spec.caseContract.origins.length, 5);
  assert.equal(spec.caseContract.randomSeed, 20260714);
  assert.equal(
    spec.formalCashTarget.formula,
    "futureSalesCashForecast + cutoffConfirmedFutureReceivables",
  );
  for (const key of [
    "uncommittedFutureBuyoutIncluded",
    "historicalBuyoutCycleIncluded",
    "futureBuyoutProbabilityModelIncluded",
    "receivedBuyoutAmortizationIncluded",
    "buyoutMonthlyEquivalentIncluded",
  ]) {
    assert.equal(spec.formalCashTarget[key], false);
  }
  assert.deepEqual(spec.formalCashTarget.buyoutMonthlyEquivalentBoundary, {
    ratingContextOnly: true,
    historicalValueOnly: true,
    notCashForecast: true,
    notIncludedInFutureCashRevenue: true,
  });
  assert.equal(spec.modelPopulation.nullToZeroAllowed, false);
  assert.equal(
    spec.routeContract.pure_buyoutWithoutCutoffCommitment.rawModelPrediction,
    null,
  );
  assert.equal(
    spec.routeContract.pure_buyoutWithoutCutoffCommitment.servedPrediction,
    null,
  );
  assert.deepEqual(spec.gateB.conditions, expectedGateConditions);
  assert.equal(Object.values(spec.seals).every((value) => value === false), true);
  assert.equal(spec.decisionStatus, "not_for_formal_decision");
  assert.equal(spec.releaseAuthorized, false);
});

test("synthetic preflight proves formal route state and future invariance without data load", () => {
  const result = runPython(["--preflight"]);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const payload = lastJson(result.stdout);
  assert.equal(payload.status, "passed");
  assert.equal(payload.privateDataRead, false);
  assert.equal(payload.dataLoadCalls, 0);
  assert.equal(payload.synthetic.checks.pureBuyoutNull, true);
  assert.equal(payload.synthetic.checks.pureBuyoutNotZero, true);
  assert.equal(payload.synthetic.checks.pureBuyoutRouteAbstained, true);
  assert.equal(payload.synthetic.checks.businessIneligibleRawRetained, true);
  assert.equal(payload.synthetic.checks.businessIneligibleServedNull, true);
  assert.equal(payload.futurePerturbation.passed, true);
  assert.equal(payload.formalProjectionFuturePerturbation.status, "passed");
  assert.equal(
    payload.formalProjectionFuturePerturbation.checks.postCutoffFieldsInvariant,
    true,
  );
  assert.equal(Object.values(payload.seals).every((value) => value === false), true);
});

test("final-holdout entry fails closed before every loader", () => {
  const result = runPython(["--run-final-holdout"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /final holdout is sealed/i);
  assert.match(result.stderr, /dataLoadCalls=0/);
});

test("formal comparator replay and bundle use one frozen model population", () => {
  const replay = readReport("M2-formal-cash-comparator-replay-v1.json");
  const bundle = readReport("M2-formal-cash-comparator-bundle-v1.json");
  assert.equal(replay.decisionStatus, "not_for_formal_decision");
  assert.equal(replay.scopeAndDefinitions.developmentCaseCountPerComparator, 18615);
  assert.equal(replay.scopeAndDefinitions.statisticallyScoreableCaseCount, 12223);
  assert.equal(replay.scopeAndDefinitions.formalModelPopulationCaseCount, 7851);
  assert.equal(replay.scopeAndDefinitions.sameCaseKeysAcrossComparators, true);
  assert.equal(replay.scopeAndDefinitions.sameModelPopulationKeysAcrossComparators, true);
  assert.equal(replay.routeAbstentionAudit.rawAndServedNullOnEveryCase, true);
  assert.equal(replay.routeAbstentionAudit.zeroImputationUsed, false);
  assert.equal(replay.routeAbstentionAudit.pureBuyoutWithoutCommitmentScoreableCaseCount, 4358);
  assert.equal(bundle.primaryComparator, "B4");
  assert.equal(bundle.B0aSelectionEligible, false);
  assert.equal(bundle.legacyTargetMetricsSelectionEligible, false);
  assert.equal(bundle.bootstrap.caseIidSampling, false);
  assert.equal(bundle.bootstrap.clusterDefinition, "deidentified_work_x_origin");
  assert.equal(bundle.bootstrap.replicatesCompleted, 2000);
  assert.equal(bundle.bootstrap.seed, 20260714);
  const expected = {
    B0b: [0.58984794, -0.0054679],
    B1: [0.79419701, 0.37499219],
    B3: [0.58968291, 0.12812424],
    B4: [0.55648454, 0.08911106],
  };
  for (const [model, [wape, bias]] of Object.entries(expected)) {
    const metrics = replay.comparatorMetrics[model];
    assert.equal(metrics.caseState.frozenCaseCount, 18615);
    assert.equal(metrics.caseState.statisticallyScoreableCaseCount, 12223);
    assert.equal(metrics.modelPopulation.caseCount, 7851);
    assert.equal(metrics.modelPopulation.zeroImputationUsed, false);
    closeTo(metrics.modelPopulation.wape, wape);
    closeTo(metrics.modelPopulation.signedAggregateBias, bias);
    assert.deepEqual(
      Object.keys(metrics.horizons).map(Number).sort((a, b) => a - b),
      [3, 6, 12, 18, 24],
    );
    assert.equal(metrics.internal80.completeOnModelPopulation, true);
    assert.equal(metrics.internal80.requiredCaseCount, 7851);
    assert.equal(metrics.internal80.availableCaseCount, 7851);
    assert.equal(Object.hasOwn(metrics.internal80, "lower"), false);
    assert.equal(Object.hasOwn(metrics.internal80, "upper"), false);
    assert.equal(metrics.channel.overall.workCaseCount, 7851);
    assert.equal(metrics.channel.overall.allWorkPointsStrictlyReconciled, true);
    assert.equal(metrics.channel.overall.allWorkActualsStrictlyReconciled, true);
    assert.ok(
      metrics.channel.overall.maximumChannelSumToWorkPointAbsoluteDifference <= 0.000001,
    );
  }
});

test("surprise audit preserves overlap exposure and deduplicates only by authority identity", () => {
  const report = readReport("M2-surprise-buyout-unique-impact-audit-v1.json");
  const overlap = report.overlappingBacktestWindows;
  const unique = report.uniqueFactUnion;
  closeTo(overlap.forecastableCashActual, 82206415.7, 0.01);
  closeTo(overlap.uncommittedBuyoutSurpriseActual, 5517115.15, 0.01);
  closeTo(overlap.totalLedgerCashActual, 87723530.85, 0.01);
  assert.equal(overlap.positiveSurpriseWindowCount, 466);
  closeTo(overlap.surpriseShareOfWindowLedgerCash, 0.06289208);
  assert.equal(overlap.scopeLabel, "backtest_window_exposure_only");
  assert.equal(overlap.overlappingWindowsMayBeNamedUniqueLedgerFacts, false);
  assert.equal(unique.status, "available");
  assert.equal(unique.uniqueSurpriseLedgerFactCount, 168);
  assert.equal(unique.uniqueSurpriseEventCellCount, 154);
  assert.equal(unique.involvedWorkCount, 114);
  closeTo(unique.uniqueSurpriseAmount, 1442698, 0.01);
  closeTo(unique.uniqueCompleteMonthLedgerCash, 126794638.17, 0.01);
  closeTo(unique.uniqueSurpriseShareOfUniqueCompleteMonthLedgerCash, 0.01137823);
  assert.equal(unique.unsafeDedupCellCount, 0);
  assert.equal(unique.unsafeDedupAmount, 0);
  assert.equal(unique.workMonthAmountIdentityUsed, false);
  assert.equal(report.technicalSummary.overlappingWindowShareIsFullLibraryBusinessShare, false);
});

test("complete population report separates model quality from business cash coverage", () => {
  const report = readReport("M2-formal-cash-population-business-coverage-v1.json");
  assert.equal(report.scope.standardWorkCount, 3053);
  assert.equal(report.scope.completeIncomeFactCount, 192869);
  assert.equal(report.scope.nonOverlappingWorkLevelAggregation, true);
  closeTo(report.cashCoverage.amountConservationDifference, 0, 0.01);
  assert.equal(report.topBands.top1.workCount, 31);
  assert.equal(report.topBands.top5.workCount, 153);
  assert.equal(report.topBands.top10.workCount, 306);
  assert.equal(report.observationGates.mayAuthorizeRelease, false);
  assert.equal(report.observationGates.forecastableCashShareMinimumRecommended, 0.9);
  assert.equal(report.observationGates.top10ForecastableCashCoverageMinimum, 0.9);
  assert.equal(report.decisionStatus, "not_for_formal_decision");
  assert.equal(Object.values(report.seals).every((value) => value === false), true);
});

test("Gate B keys and runtime transitions exactly match the frozen machine contract", () => {
  const gate = readReport("M2-calibration-gate-b-v1.json");
  assert.deepEqual(
    Object.keys(gate.conditions).sort(),
    [...expectedGateConditions].sort(),
  );
  assert.equal(gate.conditionCount, 14);
  assert.equal(gate.privateFilesTracked, false);
  assert.equal(gate.decisionStatus, "not_for_formal_decision");
  if (gate.phaseACommitPushed) {
    assert.equal(gate.conditions.full_validation_suite_passed, true);
    assert.equal(gate.conditions.phase_a_commit_pushed, true);
    assert.equal(gate.passedConditionCount, 14);
    assert.equal(gate.allTrue, true);
    assert.equal(gate.C2R1AuthorizedByGateB, true);
    assert.match(gate.phaseACheckpoint, /^[0-9a-f]{40}$/);
    assert.equal(gate.remoteHeadVerified, true);
    assert.ok(gate.validationEvidence.commandResults.length >= 8);
    for (const result of gate.validationEvidence.commandResults) {
      assert.equal(result.exitCode, 0);
      assert.match(result.stdoutSha256, /^[0-9a-f]{64}$/);
      assert.match(result.stderrSha256, /^[0-9a-f]{64}$/);
      assert.ok(result.stdoutBytes + result.stderrBytes > 0);
    }
  } else {
    const failed = Object.entries(gate.conditions)
      .filter(([, value]) => !value)
      .map(([key]) => key);
    assert.deepEqual(
      failed,
      gate.conditions.full_validation_suite_passed
        ? ["phase_a_commit_pushed"]
        : ["full_validation_suite_passed", "phase_a_commit_pushed"],
    );
    assert.equal(gate.allTrue, false);
    assert.equal(gate.C2R1AuthorizedByGateB, false);
  }
});

test("public reports are Chinese, aggregate-only, and omit identifiers and PI endpoints", () => {
  const names = [
    "M2-formal-cash-comparator-replay-v1",
    "M2-formal-cash-comparator-bundle-v1",
    "M2-surprise-buyout-unique-impact-audit-v1",
    "M2-formal-cash-population-business-coverage-v1",
  ];
  for (const name of names) {
    const jsonText = fs.readFileSync(path.join(reportDir, `${name}.json`), "utf8");
    const markdown = fs.readFileSync(path.join(reportDir, `${name}.md`), "utf8");
    assert.match(markdown, /[\u4e00-\u9fff]/);
    assert.doesNotMatch(jsonText + markdown, /data[\\/]private-output/i);
    assert.doesNotMatch(jsonText, /"standard_work_id"|"channel_key"|"rawChannel/i);
    assert.doesNotMatch(jsonText, /optimistic|pessimistic|highScenario|lowScenario/i);
  }
});
