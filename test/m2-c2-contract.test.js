import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const python = "scripts/run-codex-python.mjs";
const runner = "scripts/m2-real-data/run_m2_c2_development_validation.py";
const corePath = path.join(root, "scripts/m2-real-data/m2_calibration_c2_v1.py");
const specPath = path.join(
  root,
  "src/domain/oldProductEvaluation/calibrationSpec.c2.v1.amendment.json",
);
const reportDir = path.join(root, "docs/analysis/m2-real-data");
const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
const core = fs.readFileSync(corePath, "utf8");
const runnerSource = fs.readFileSync(path.join(root, runner), "utf8");

const expectedGateConditions = [
  "as_of_activity_segments_frozen",
  "candidate_space_frozen",
  "other_new_channel_residual_frozen",
  "high_value_guard_frozen",
  "selection_objective_frozen",
  "case_population_parity_passed",
  "pure_buyout_abstention_test_passed",
  "mixed_excludes_future_buyout_test_passed",
  "residual_no_leakage_test_passed",
  "future_perturbation_tests_passed",
  "all_seals_closed",
  "phase_a_commit_pushed",
  "full_validation_suite_passed",
  "no_private_file_tracked",
];

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

function lastJson(stdout) {
  return JSON.parse(stdout.trim().split(/\r?\n/u).at(-1));
}

test("C2 freezes authority, three as-of segments, 79 candidates, and B4 anchoring", () => {
  assert.equal(spec.version, "calibration-spec-c2-v1");
  assert.equal(spec.decisionStatus, "not_for_formal_decision");
  assert.equal(spec.formalDecisionAuthorized, false);
  assert.equal(spec.releaseAuthorized, false);
  assert.equal(spec.phaseABinding.primaryComparator, "B4");
  assert.deepEqual(spec.phaseABinding.fixedComparatorBundle, ["B0b", "B1", "B3", "B4"]);
  assert.equal(spec.authority.developmentCaseCount, 18615);
  assert.equal(spec.authority.statisticallyScoreableCaseCount, 12223);
  assert.equal(spec.authority.formalModelPopulationCaseCount, 7851);
  assert.equal(spec.authority.formalModelPopulationWorkCount, 824);
  assert.equal(spec.authority.pureBuyoutNoCommitmentScoreableCaseCount, 4358);
  assert.deepEqual(spec.authority.horizonsMonths, [3, 6, 12, 18, 24]);
  assert.equal(spec.authority.randomSeed, 20260714);
  assert.equal(spec.activitySegmentation.dense.minimumObservedCompleteMonths, 12);
  assert.equal(spec.activitySegmentation.dormant.minimumTrailingConsecutiveZeroMonths, 6);
  assert.equal(spec.activitySegmentation.intermeditent, undefined);
  assert.equal(spec.activitySegmentation.intermitent, undefined);
  assert.equal(spec.activitySegmentation.intermittent.definition, "not_dense_and_not_dormant");
  assert.equal(spec.activitySegmentation.currentRatingRiskRightsShelfFeatureAllowed, false);
  assert.equal(spec.activitySegmentation.thresholdsMayChangeAfterOuterResults, false);
  assert.equal(spec.candidateSpace.dense.candidateCount, 37);
  assert.equal(spec.candidateSpace.intermittent.candidateCount, 37);
  assert.equal(spec.candidateSpace.dormant.candidateCount, 5);
  assert.equal(spec.candidateSpace.totalSegmentCandidateCount, 79);
  assert.equal(spec.candidateSpace.candidateSpaceMayChangeAfterResults, false);
});

test("C2 freezes lexicographic selection, residual, high-value guard, and fixed gates", () => {
  assert.deepEqual(spec.selection.orderedObjective, [
    "signed_bias_feasibility",
    "minimum_wape",
    "high_value_safety",
    "horizon_safety",
    "minimum_complexity",
  ]);
  assert.equal(spec.selection.noFeasibleOrInsufficientEvidenceFallback, "B4");
  assert.equal(spec.selection.thresholdsMayMoveAfterResults, false);
  assert.equal(spec.otherOrNewChannelResidual.outerTruthAllowed, false);
  assert.equal(spec.otherOrNewChannelResidual.realChannelIdentityPredicted, false);
  assert.equal(spec.otherOrNewChannelResidual.workSpecificFutureChannelMemoryAllowed, false);
  assert.equal(spec.otherOrNewChannelResidual.sourceFeatureUsed, false);
  assert.equal(spec.highValueGuard.outerBandActualAllowed, false);
  assert.equal(spec.highValueGuard.insufficientOrFailedEvidenceFallback, "B4");
  assert.equal(spec.acceptance.conditionCount, 25);
  assert.equal(spec.acceptance.overallWapeMaximum, 0.6);
  assert.equal(spec.acceptance.absoluteBiasMaximum.overall, 0.1);
  assert.equal(spec.acceptance.absoluteBiasMaximum.eachHorizon, 0.15);
  assert.equal(spec.acceptance.relativeToB4.horizon3ImprovementMinimum, 0.03);
  assert.equal(spec.acceptance.relativeToB4.top10ImprovementMinimum, 0.05);
  assert.deepEqual(spec.acceptance.internal80CoverageInclusive, [0.75, 0.85]);
  assert.equal(spec.acceptance.populationReductionAllowed, false);
  assert.deepEqual(spec.gateC.conditions, expectedGateConditions);
});

test("C2 preserves formal-cash routes, null abstention, and four-field public output", () => {
  assert.equal(spec.formalCashTarget.futureBuyoutProbabilityModelIncluded, false);
  assert.equal(spec.formalCashTarget.historicalBuyoutCycleIncluded, false);
  assert.equal(spec.formalCashTarget.buyoutMonthlyEquivalentIncluded, false);
  assert.equal(spec.routes.pure_buyoutWithoutCutoffCommitment.rawModelPrediction, null);
  assert.equal(spec.routes.pure_buyoutWithoutCutoffCommitment.servedPrediction, null);
  assert.equal(spec.routes.pure_buyoutWithoutCutoffCommitment.zeroMayReplaceNull, false);
  assert.equal(spec.routes.oneTimeSeriesModelAcrossAllRevenueModelsAllowed, false);
  assert.deepEqual(spec.productOutput.fields, [
    "pointForecast",
    "annualBreakdown",
    "confidence",
    "limitation",
  ]);
  assert.equal(spec.productOutput.scenarioFieldsAllowed, false);
  assert.equal(spec.productOutput.predictionIntervalEndpointsAllowed, false);
  assert.equal(Object.values(spec.seals).every((value) => value === false), true);
});

test("C2 core exposes one predict_as_of and excludes forbidden future-buyout machinery", () => {
  assert.match(core, /def predict_as_of\(/u);
  assert.match(runnerSource, /c2\.predict_as_of/u);
  assert.doesNotMatch(core, /buyout_probability|defaultCycleMonths|_buyout_channel_forecast/iu);
  assert.doesNotMatch(core, /positive[_ -]?only[_ -]?median/iu);
  assert.match(core, /GENERIC_RESIDUAL_KEY/u);
  assert.match(core, /highValueGuardFallbackToB4/u);
  assert.match(core, /prediction case state contains forbidden field/u);
});

test("C2 synthetic preflight covers segmentation, residual leakage, guard, and routes without data", () => {
  const result = run(["--preflight"]);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const payload = lastJson(result.stdout);
  assert.equal(payload.status, "passed");
  assert.equal(payload.mode, "synthetic-only");
  assert.equal(payload.privateDataRead, false);
  assert.equal(payload.dataLoadCalls, 0);
  assert.deepEqual(payload.candidateCounts, { dense: 37, dormant: 5, intermittent: 37 });
  assert.equal(Object.values(payload.synthetic.checks).every(Boolean), true);
  assert.equal(payload.synthetic.checks.futurePredictionInvariant, true);
  assert.equal(payload.synthetic.checks.residualFitRejectsSameOrLaterOrigin, true);
  assert.equal(payload.synthetic.checks.highValueGuardFallsBackToB4, true);
  assert.equal(payload.synthetic.checks.pureBuyoutNullAbstain, true);
  assert.equal(payload.synthetic.checks.legalDormantZeroIsNotAbstention, true);
  assert.equal(payload.finalHoldoutOpened, false);
});

test("C2 final-holdout command fails closed before any loader", () => {
  const result = run(["--run-final-holdout"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /final holdout is sealed/iu);
  assert.match(result.stderr.replaceAll(" ", ""), /dataLoadCalls=0/iu);
  assert.doesNotMatch(result.stderr, /loading locked|loading authorized/iu);
});

test("Gate C has exactly 14 frozen transitions when Phase A exists", (context) => {
  const gatePath = path.join(reportDir, "M2-calibration-gate-c-v1.json");
  if (!fs.existsSync(gatePath)) {
    context.skip("C2 Phase A has not been generated on this machine");
    return;
  }
  const gate = JSON.parse(fs.readFileSync(gatePath, "utf8"));
  assert.deepEqual(
    Object.keys(gate.conditions).sort(),
    [...expectedGateConditions].sort(),
  );
  assert.equal(gate.conditionCount, 14);
  assert.equal(gate.privateFilesTracked, false);
  assert.equal(gate.decisionStatus, "not_for_formal_decision");
  const failed = Object.entries(gate.conditions)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (gate.phaseACommitPushed) {
    assert.deepEqual(failed, []);
    assert.equal(gate.passedConditionCount, 14);
    assert.equal(gate.allTrue, true);
    assert.equal(gate.C2AuthorizedByGateC, true);
    assert.match(gate.phaseACheckpoint, /^[0-9a-f]{40}$/u);
    assert.equal(gate.remoteHeadVerified, true);
  } else {
    assert.ok(failed.length >= 1 && failed.length <= 2);
    assert.ok(failed.includes("phase_a_commit_pushed"));
    assert.ok(
      failed.every((condition) =>
        ["phase_a_commit_pushed", "full_validation_suite_passed"].includes(
          condition,
        ),
      ),
    );
    assert.equal(gate.allTrue, false);
    assert.equal(gate.C2AuthorizedByGateC, false);
  }
});

test("C2 Phase A public reports are Chinese, deidentified, and endpoint-free", (context) => {
  const names = ["M2-C2-opportunity-audit-v1", "M2-C2-model-design-v1"];
  if (!fs.existsSync(path.join(reportDir, `${names[0]}.json`))) {
    context.skip("C2 Phase A has not been generated on this machine");
    return;
  }
  for (const name of names) {
    const jsonText = fs.readFileSync(path.join(reportDir, `${name}.json`), "utf8");
    const markdown = fs.readFileSync(path.join(reportDir, `${name}.md`), "utf8");
    assert.match(markdown, /[\u4e00-\u9fff]/u);
    assert.doesNotMatch(jsonText + markdown, /data[\\/]private|private-output/iu);
    assert.doesNotMatch(jsonText, /"standard_work_id"|"channel_key"|rawChannel/iu);
    assert.doesNotMatch(jsonText, /"lower"|"upper"/u);
    assert.doesNotMatch(jsonText, /optimistic|pessimistic|high\/base\/low/iu);
  }
});
