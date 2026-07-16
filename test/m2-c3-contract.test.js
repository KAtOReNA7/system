import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const python = "scripts/run-codex-python.mjs";
const runner = "scripts/m2-real-data/run_m2_c3_development_validation.py";
const corePath = path.join(root, "scripts/m2-real-data/m2_calibration_c3_v1.py");
const specRelative =
  "src/domain/oldProductEvaluation/calibrationSpec.c3.v1.amendment.json";
const specPath = path.join(root, specRelative);
const reportDir = path.join(root, "docs/analysis/m2-real-data");

const expectedGateConditions = [
  "formal_cash_target_and_c2_checkpoint_unchanged",
  "authority_population_frozen",
  "case_key_actual_and_state_parity_passed",
  "opportunity_regions_and_b4_fallback_frozen",
  "feature_manifest_as_of_boundary_frozen",
  "candidate_space_and_c3s_activation_rule_frozen",
  "inner_origin_only_training_passed",
  "cross_fit_and_fold_local_preprocessing_passed",
  "prediction_lock_future_perturbation_and_determinism_passed",
  "formal_cash_route_abstention_passed",
  "all_seals_closed",
  "full_validation_suite_passed",
  "phase_a_commit_pushed",
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

function git(args, options = {}) {
  return spawnSync("git", args, {
    cwd: root,
    encoding: options.encoding ?? "utf8",
    input: options.input,
  });
}

function lastJson(stdout) {
  return JSON.parse(stdout.trim().split(/\r?\n/u).at(-1));
}

test("C3 freezes the exact authority, B4 comparator, and formal-cash target", () => {
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  assert.equal(spec.version, "calibration-spec-c3-v1");
  assert.equal(spec.decisionStatus, "not_for_formal_decision");
  assert.equal(spec.formalDecisionAuthorized, false);
  assert.equal(spec.releaseAuthorized, false);
  assert.equal(spec.phaseABinding.primaryComparator, "B4");
  assert.deepEqual(spec.phaseABinding.fixedComparatorBundle, ["B0b", "B1", "B3", "B4"]);
  assert.equal(spec.authority.standardWorkCount, 3053);
  assert.equal(spec.authority.incomeFactCount, 192872);
  assert.equal(spec.authority.completeIncomeFactCount, 192869);
  assert.equal(spec.authority.developmentCaseCount, 18615);
  assert.equal(spec.authority.statisticallyScoreableCaseCount, 12223);
  assert.equal(spec.authority.formalModelPopulationCaseCount, 7851);
  assert.equal(spec.authority.formalModelPopulationWorkCount, 824);
  assert.deepEqual(spec.authority.horizonsMonths, [3, 6, 12, 18, 24]);
  assert.equal(spec.authority.caseUniverseMayChange, false);
  assert.equal(spec.authority.scoreabilityMayChange, false);
  assert.equal(spec.authority.businessServingEligibilityMayChange, false);
  assert.equal(spec.formalCashTarget.uncommittedFutureBuyoutIncluded, false);
  assert.equal(spec.formalCashTarget.futureBuyoutProbabilityModelIncluded, false);
  assert.equal(spec.formalCashTarget.historicalBuyoutCycleIncluded, false);
  assert.equal(spec.formalCashTarget.buyoutMonthlyEquivalentIncluded, false);
  assert.equal(spec.routes.pure_buyoutWithoutCutoffCommitment.rawModelPrediction, null);
  assert.equal(spec.routes.pure_buyoutWithoutCutoffCommitment.servedPrediction, null);
  assert.equal(spec.routes.pure_buyoutWithoutCutoffCommitment.routeAbstained, true);
  assert.equal(
    spec.routes.pure_buyoutWithoutCutoffCommitment.abstentionReason,
    "uncommitted_future_buyout_not_forecastable",
  );
  assert.equal(spec.routes.pure_buyoutWithoutCutoffCommitment.zeroMayReplaceNull, false);
});

test("C3 feature manifest permits only as-of aggregate signals and forbids identity/current/future fields", () => {
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  assert.deepEqual(spec.featureManifest.allowed, [
    "b4Prediction",
    "historyObservedMonths",
    "historyCashTotal",
    "trailing3Cash",
    "trailing6Cash",
    "trailing12Cash",
    "trailing24Cash",
    "zeroMonthCount",
    "zeroRate",
    "positiveMonthCount",
    "positiveRate",
    "positiveMonthCountTrailing6",
    "positiveMonthCountTrailing12",
    "trend12",
    "volatility12",
    "horizonMonths",
    "knownChannelCount",
    "knownChannelConcentration",
    "route",
    "activitySegment",
  ]);
  assert.deepEqual(spec.featureManifest.forbidden, [
    "standardWorkId",
    "workId",
    "title",
    "author",
    "channelIdentity",
    "channelKey",
    "sourceIdentity",
    "currentRating",
    "currentLifecycle",
    "currentRisk",
    "currentRights",
    "currentShelf",
    "actual",
    "outcome",
    "postCutoff",
    "futureIncome",
    "futureBuyout",
    "buyoutMonthlyEquivalent",
    "holdout",
    "embargo",
    "deferred60MonthLabels",
  ]);
  assert.match(JSON.stringify(spec.featureManifest), /inner[_ -]?origin/iu);
  assert.equal(spec.featureManifest.preprocessingFitScope, "inner_origin_fold_only");
});

test("C3 freezes 24 candidates and the conditional C3-S boundary", () => {
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  assert.equal(spec.candidateSpace.c3A.candidateCount, 8);
  assert.equal(spec.candidateSpace.c3B.candidateCount, 4);
  assert.equal(spec.candidateSpace.c3C.candidateCount, 8);
  assert.equal(spec.candidateSpace.c3S.candidateCount, 4);
  assert.equal(spec.candidateSpace.totalCandidateCount, 24);
  assert.equal(spec.candidateSpace.candidateSpaceMayChangeAfterResults, false);
  assert.equal(spec.candidateSpace.postHocOuterResultScalingAllowed, false);
  assert.match(JSON.stringify(spec.candidateSpace.c3A), /residual/iu);
  assert.match(JSON.stringify(spec.candidateSpace.c3A), /shrink/iu);
  assert.match(JSON.stringify(spec.candidateSpace.c3A), /cap/iu);
  assert.match(JSON.stringify(spec.candidateSpace.c3B), /hurdle/iu);
  assert.equal(spec.candidateSpace.c3B.twoStage, true);
  assert.match(JSON.stringify(spec.candidateSpace.c3C), /log1p/iu);
  assert.match(JSON.stringify(spec.candidateSpace.c3C), /shrink/iu);
  assert.match(JSON.stringify(spec.candidateSpace.c3C), /cap/iu);
  assert.equal(spec.candidateSpace.c3S.stableInnerOriginImprovementRequired, true);
  assert.equal(spec.candidateSpace.c3S.otherwise, "skip");
  assert.deepEqual(spec.selection.finalRoutePolicy, {
    primaryModel: "C3-A",
    conditionalReplacement: "C3-S",
    replacementCondition:
      "at_least_one_outer_origin_activated_by_frozen_strictly_earlier_oof_rule",
    outerActualMaySelectOrScale: false,
  });
  assert.equal(spec.selection.outerActualMaySelectOrScale, false);
  assert.deepEqual(spec.opportunityAudit.dimensions, [
    "origin",
    "horizon",
    "route",
    "activitySegment",
    "cutoffHistoryLength",
    "positiveMonthCount",
    "zeroMonthCount",
    "cutoffZeroRate",
    "cutoffPositiveRate",
    "cutoffTrend",
    "cutoffVolatility",
    "knownChannelCount",
    "knownChannelConcentration",
    "b4RevenueScale",
    "highValueBand",
  ]);
});

test("C3 preserves every C2 acceptance threshold and keeps all seals closed", () => {
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  assert.equal(spec.acceptance.overallWapeMaximum, 0.6);
  assert.equal(spec.acceptance.absoluteBiasMaximum.overall, 0.1);
  assert.equal(spec.acceptance.absoluteBiasMaximum.served, 0.1);
  assert.equal(spec.acceptance.absoluteBiasMaximum.highValue, 0.1);
  assert.equal(spec.acceptance.absoluteBiasMaximum.eachHorizon, 0.15);
  assert.equal(spec.acceptance.relativeToB4.horizon3ImprovementMinimum, 0.03);
  assert.equal(spec.acceptance.relativeToB4.horizon6ImprovementMinimum, 0.03);
  assert.equal(spec.acceptance.relativeToB4.horizon12ImprovementMinimum, 0.03);
  assert.equal(spec.acceptance.relativeToB4.horizon18RegressionMaximum, 0.02);
  assert.equal(spec.acceptance.relativeToB4.horizon24RegressionMaximum, 0.02);
  assert.equal(spec.acceptance.relativeToB4.top10ImprovementMinimum, 0.05);
  assert.equal(spec.acceptance.relativeToB4.top1RegressionMaximum, 0.05);
  assert.equal(spec.acceptance.relativeToB4.top5RegressionMaximum, 0.05);
  assert.equal(spec.acceptance.relativeToB4.outerOriginWinShareMinimum, 0.7);
  assert.equal(spec.acceptance.relativeToB4.internalWisImprovementMinimum, 0.05);
  assert.deepEqual(spec.acceptance.internal80CoverageInclusive, [0.75, 0.85]);
  assert.equal(spec.acceptance.populationReductionAllowed, false);
  assert.equal(spec.acceptance.thresholdsMayChangeAfterResults, false);
  assert.deepEqual(spec.gateD.conditions, expectedGateConditions);
  assert.equal(spec.gateD.requiredTrueCount, 14);
  assert.equal(Object.values(spec.seals).every((value) => value === false), true);
});

test("C3 synthetic preflight executes the Python core without reading private data", () => {
  const result = run(["--preflight"]);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const payload = lastJson(result.stdout);
  assert.equal(payload.status, "passed");
  assert.equal(payload.mode, "synthetic-only");
  assert.equal(payload.privateDataRead, false);
  assert.equal(payload.dataLoadCalls, 0);
  assert.deepEqual(payload.candidateCounts, { c3A: 8, c3B: 4, c3C: 8, c3S: 4 });
  assert.equal(payload.synthetic.status, "passed");
  const { zeroImputationUsed, ...positiveChecks } = payload.synthetic.checks;
  assert.equal(zeroImputationUsed, false);
  assert.equal(Object.values(positiveChecks).every(Boolean), true);
  assert.equal(payload.finalHoldoutOpened, false);
  assert.equal(payload.embargoShadowOpened, false);
  assert.equal(payload.deferred60MonthLabelsOpened, false);
});

test("C3 tracked-source guards use Git path-aware canonical blobs on Windows", () => {
  const runnerSource = fs.readFileSync(path.join(root, runner), "utf8");
  assert.match(runnerSource, /hash-object/u);
  assert.match(runnerSource, /--path/u);
  assert.match(
    runnerSource,
    /branch == "main"[\s\S]*origin\/main[\s\S]*not _status_entries\(\)/u,
  );

  if (git(["ls-files", "--error-unmatch", "--", specRelative]).status !== 0) return;
  const clean = git(["diff", "--quiet", "HEAD", "--", specRelative]);
  if (clean.status !== 0) return;
  const worktreeOid = git(["hash-object", `--path=${specRelative}`, specRelative]);
  const headOid = git(["rev-parse", `HEAD:${specRelative}`]);
  assert.equal(worktreeOid.status, 0, worktreeOid.stderr);
  assert.equal(headOid.status, 0, headOid.stderr);
  assert.equal(worktreeOid.stdout.trim(), headOid.stdout.trim());
});

test("C3 sealed-label commands fail closed before any data loader", () => {
  for (const [flag, label] of [
    ["--run-final-holdout", "final holdout"],
    ["--run-embargo-shadow", "embargo shadow"],
    ["--run-deferred-labels", "deferred"],
  ]) {
    const result = run([flag]);
    assert.notEqual(result.status, 0, flag);
    assert.match(result.stderr, new RegExp(`${label}.*sealed`, "iu"));
    assert.match(result.stderr.replaceAll(" ", ""), /dataLoadCalls=0/iu);
  }
});

test("Gate D preserves the exact 14-step order and never authorizes before push", (context) => {
  const gatePath = path.join(reportDir, "M2-calibration-gate-d-v1.json");
  if (!fs.existsSync(gatePath)) {
    context.skip("C3 Phase A has not been generated on this machine");
    return;
  }
  const gate = JSON.parse(fs.readFileSync(gatePath, "utf8"));
  assert.deepEqual(gate.conditionOrder, expectedGateConditions);
  assert.deepEqual(new Set(Object.keys(gate.conditions)), new Set(expectedGateConditions));
  assert.equal(gate.comparatorParityEvidence.allPassed, true);
  assert.equal(gate.comparatorParityEvidence.sameCaseKeys, true);
  assert.equal(gate.comparatorParityEvidence.sameActuals, true);
  assert.equal(gate.comparatorParityEvidence.sameCaseStates, true);
  assert.deepEqual(
    Object.values(gate.comparatorParityEvidence.forwardCaseCountByModel),
    [18615, 18615, 18615, 18615],
  );
  const opportunity = JSON.parse(
    fs.readFileSync(path.join(reportDir, "M2-C3-opportunity-audit-v1.json"), "utf8"),
  );
  for (const key of [
    "absoluteError",
    "signedErrorPredictionMinusActual",
    "residualActualMinusPrediction",
  ]) {
    assert.equal(Number.isFinite(opportunity.overallB4ErrorStructure[key]), true, key);
  }
  assert.equal(opportunity.dimensionContract.requiredDimensionsPresent, true);
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
    assert.equal(gate.C3AuthorizedByGateD, true);
    assert.match(gate.phaseACheckpoint, /^[0-9a-f]{40}$/u);
    assert.equal(gate.remoteHeadVerified, true);
  } else {
    assert.ok(failed.includes("phase_a_commit_pushed"));
    assert.equal(gate.allTrue, false);
    assert.equal(gate.C3AuthorizedByGateD, false);
  }
});
