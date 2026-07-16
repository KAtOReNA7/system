import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const python = "scripts/run-codex-python.mjs";
const runner = "scripts/m2-real-data/run_m2_c2r1_development_validation.py";
const spec = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      "src/domain/oldProductEvaluation/calibrationSpec.c2r1.v1.amendment.json",
    ),
    "utf8",
  ),
);

function run(args) {
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

test("C2-R.1 freezes 45 transparent candidates before development", () => {
  assert.equal(spec.version, "calibration-spec-c2r1-v1");
  assert.equal(spec.decisionStatus, "not_for_formal_decision");
  assert.equal(spec.formalDecisionAuthorized, false);
  assert.equal(spec.releaseAuthorized, false);
  assert.equal(spec.phaseABinding.checkpoint.length, 40);
  assert.equal(spec.phaseABinding.gateBRequiredTrueCount, 14);
  assert.equal(spec.phaseABinding.primaryComparator, "B4");
  assert.equal(spec.candidateSpace.singleComponents.length, 12);
  assert.equal(spec.candidateSpace.blendExpansion.partners.length, 11);
  assert.deepEqual(spec.candidateSpace.blendExpansion.anchorWeights, [0.25, 0.5, 0.75]);
  assert.equal(spec.candidateSpace.candidateCount, 45);
  assert.equal(spec.candidateSpace.candidateSpaceMayChangeAfterResults, false);
  assert.equal(spec.candidateSpace.postHocOuterResultScalingAllowed, false);
  assert.equal(spec.routes.pure_sales_share.zeroIncomeMonthsRetained, true);
  assert.equal(spec.routes.pure_sales_share.positiveOnlyMedianAllowed, false);
  assert.equal(spec.routes.pure_buyout.futureBuyoutModelAllowed, false);
  assert.equal(spec.routes.pure_buyout.zeroMayReplaceNull, false);
  assert.equal(spec.routes.unknown_revenue_model.bestPerformingRouteFallbackAllowed, false);
  assert.equal(spec.formalCashTarget.futureBuyoutProbabilityModelIncluded, false);
  assert.equal(spec.formalCashTarget.historicalBuyoutCycleIncluded, false);
  assert.equal(spec.formalCashTarget.buyoutMonthlyEquivalentIncluded, false);
  assert.deepEqual(spec.authority.horizonsMonths, [3, 6, 12, 18, 24]);
  assert.equal(spec.authority.developmentCaseCount, 18615);
  assert.equal(spec.authority.formalModelPopulationCaseCount, 7851);
  assert.equal(spec.selection.minimumEarlierOrigins, 2);
  assert.equal(spec.selection.thresholdsMayMoveAfterResults, false);
  assert.equal(spec.acceptance.overallWapeMaximum, 0.6);
  assert.deepEqual(spec.acceptance.internal80CoverageInclusive, [0.75, 0.85]);
  assert.equal(spec.acceptance.populationReductionToImproveMetricsAllowed, false);
  assert.equal(Object.values(spec.seals).every((value) => value === false), true);
});

test("C2-R.1 source excludes every legacy future-buyout predictor", () => {
  const source = fs.readFileSync(
    path.join(root, "scripts/m2-real-data/m2_calibration_c2r1_v1.py"),
    "utf8",
  );
  assert.doesNotMatch(source, /import\s+m2_calibration_c2r_v1/);
  assert.doesNotMatch(source, /_buyout_channel_forecast|buyout_probability/i);
  assert.doesNotMatch(source, /positive[_ -]?only[_ -]?median/i);
  assert.match(source, /uncommitted_future_buyout_not_forecastable/);
});

test("C2-R.1 synthetic preflight is Gate-B-bound and reads no private case", () => {
  const result = run(["--preflight"]);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const payload = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(payload.status, "passed");
  assert.equal(payload.gateBAllTrue, true);
  assert.equal(payload.candidateCount, 45);
  assert.equal(payload.privateDataRead, false);
  assert.equal(payload.dataLoadCalls, 0);
  assert.equal(payload.synthetic.status, "passed");
  assert.equal(payload.synthetic.checks.allZeroMonthsRetained, true);
  assert.equal(payload.synthetic.checks.shortHistoryUsesFrozenB4, true);
  assert.equal(payload.synthetic.checks.futureAsOfChannelHistoryInvariant, true);
  assert.equal(payload.synthetic.checks.futureCandidatePathInvariant, true);
  assert.equal(payload.synthetic.checks.noFutureBuyoutProbability, true);
  assert.equal(payload.runnerChecks.comparatorEqualityIsNotOriginWin, true);
  assert.equal(payload.runnerChecks.sameAndLaterOriginPerturbationInvariant, true);
  assert.equal(payload.runnerChecks.targetUsesTwoEarlierOrigins, true);
});

test("C2-R.1 final-holdout command fails closed before data load", () => {
  const result = run(["--run-final-holdout"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /final holdout is sealed/i);
  assert.match(result.stderr, /dataLoadCalls=0/);
});
