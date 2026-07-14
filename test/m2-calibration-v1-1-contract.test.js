import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const BASE_SPEC_PATH = "src/domain/oldProductEvaluation/calibrationSpec.v1.json";
const AMENDMENT_PATH =
  "src/domain/oldProductEvaluation/calibrationSpec.v1.1.amendment.json";
const BASE_KERNEL_PATH = "scripts/m2-real-data/m2_calibration_v1.py";
const SCORING_KERNEL_PATH =
  "scripts/m2-real-data/m2_calibration_scoring_v1_1.py";
const ATTRIBUTION_KERNEL_PATH =
  "scripts/m2-real-data/m2_calibration_attribution_v1_1.py";
const CORRECTION_RUNNER_PATH =
  "scripts/m2-real-data/run_m2_calibration_scoring_correction.py";
const PYTHON_RUNNER_PATH = "scripts/run-codex-python.mjs";
const FROZEN_AMENDMENT_DIGEST =
  "5c7945571520b4f229f15c14b29320bf65d11880ae92770fe0513f2a21eb799b";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function runPython(args, options = {}) {
  return execFileSync(process.execPath, [PYTHON_RUNNER_PATH, ...args], {
    encoding: "utf8",
    ...options
  });
}

function canonicalDigest(path) {
  const program = [
    "import hashlib,json,unicodedata,pathlib",
    `value=json.loads(pathlib.Path(${JSON.stringify(path)}).read_text(encoding='utf-8'))`,
    "def normalize(value):",
    "    if isinstance(value,str): return unicodedata.normalize('NFC',value)",
    "    if isinstance(value,list): return [normalize(child) for child in value]",
    "    if isinstance(value,dict): return {unicodedata.normalize('NFC',str(key)):normalize(child) for key,child in value.items()}",
    "    return value",
    "payload=json.dumps(normalize(value),ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False).encode('utf-8')",
    "print(hashlib.sha256(payload).hexdigest())"
  ].join("\n");
  return runPython(["-c", program]).trim();
}

test("calibration-spec-v1.1 is a frozen amendment bound to the exact v1 base", () => {
  const amendment = readJson(AMENDMENT_PATH);

  assert.equal(amendment.schema, "m2.calibration_spec.v1_1.amendment");
  assert.equal(amendment.version, "calibration-spec-v1.1-amendment");
  assert.equal(amendment.frozenAt, "2026-07-14T00:00:00+08:00");
  assert.equal(amendment.decisionStatus, "not_for_formal_decision");
  assert.equal(amendment.baseBinding.path, BASE_SPEC_PATH);
  assert.equal(amendment.baseBinding.version, "calibration-spec-v1");
  assert.equal(amendment.baseBinding.preHoldoutRevision, 5);
  assert.equal(amendment.baseBinding.baseRemainsHistoricalCheckpoint, true);
  assert.equal(
    runPython([BASE_KERNEL_PATH, "--print-spec-digest"]).trim(),
    amendment.baseBinding.canonicalSpecDigestSha256
  );
  assert.equal(canonicalDigest(AMENDMENT_PATH), FROZEN_AMENDMENT_DIGEST);

  assert.equal(amendment.applicationContract.mode, "semantic_amendment_overlay");
  assert.equal(amendment.applicationContract.arrayMergeAllowed, false);
  assert.equal(
    amendment.applicationContract.precedence,
    "amendment_over_base_only_for_declared_pointers"
  );
  assert.equal(amendment.correctionBoundary.candidateTrainingStarted, false);
  assert.equal(amendment.correctionBoundary.candidateTrainingAuthorizedNow, false);
  assert.equal(amendment.correctionBoundary.finalHoldoutOpened, false);
  assert.equal(amendment.correctionBoundary.embargoShadowOpened, false);
  assert.equal(amendment.correctionBoundary.deferred60MonthLabelsOpened, false);
  assert.equal(amendment.correctionBoundary.resultDependentEditsAfterFreezeAllowed, false);
  for (const forbiddenChange of [
    "candidate_model_or_hyperparameter_change",
    "final_holdout_origin_change",
    "random_seed_change",
    "gate_threshold_relaxation",
    "use_of_final_holdout_embargo_or_deferred_60_month_labels",
    "release_or_M3_enablement"
  ]) {
    assert.ok(amendment.correctionBoundary.forbiddenChanges.includes(forbiddenChange));
  }
});

test("scoreability, model availability, serving eligibility, and abstention are independent states", () => {
  const { caseStates } = readJson(AMENDMENT_PATH);

  assert.deepEqual(caseStates.independenceInvariants, [
    "statisticallyScoreable_does_not_imply_businessServingEligible",
    "businessServingEligible_does_not_imply_modelPredictionAvailable",
    "modelPredictionAvailable_does_not_imply_businessServingEligible",
    "legacyForecastabilityStatus_does_not_control_any_of_the_three_new_states"
  ]);
  assert.deepEqual(caseStates.legacyForecastabilityStatus, {
    mayFilterModelMetrics: false,
    mayRepresentModelCapability: false,
    mayRepresentBusinessServing: false,
    use: "historical_attribution_and_non_regression_reporting_only"
  });
  for (const condition of [
    "positive_income_at_or_before_origin",
    "resolved_revenue_model",
    "business_serving_eligibility",
    "model_prediction_availability"
  ]) {
    assert.ok(caseStates.statisticallyScoreable.doesNotRequire.includes(condition));
  }
  assert.equal(
    caseStates.modelPredictionAvailable.requiredForEveryStatisticallyScoreableFairComparatorOrCandidateCase,
    true
  );
  assert.equal(caseStates.modelPredictionAvailable.routeUnresolvedMaySilentlyDropCase, false);
  assert.equal(caseStates.businessServingEligible.modelIndependent, true);
  assert.equal(caseStates.businessServingEligible.evaluatedBeforeModelResult, true);
  assert.equal(caseStates.abstained.definition, "servedPrediction_is_null");
  assert.equal(caseStates.abstained.abstentionReasonRequiredWhenTrue, true);
  assert.equal(caseStates.abstained.abstentionReasonMustBeNullWhenFalse, true);
  assert.equal(caseStates.abstained.reasonMayDependOnCandidateError, false);
});

test("raw predictions score every scoreable case while served nulls are never zero-imputed into model WAPE", () => {
  const amendment = readJson(AMENDMENT_PATH);
  const semantics = amendment.predictionSemantics;
  const populations = amendment.metrics.populations;

  assert.equal(semantics.rawModelPrediction.internalOnly, true);
  assert.equal(
    semantics.rawModelPrediction.requiredWhen,
    "statisticallyScoreable_for_every_fair_comparator_or_candidate"
  );
  assert.equal(semantics.rawModelPrediction.lockedBeforeTruthJoin, true);
  assert.equal(
    semantics.servedPrediction.value,
    "rawModelPrediction_when_businessServingEligible_and_modelPredictionAvailable_else_null"
  );
  assert.equal(semantics.servedPrediction.nullWhenBusinessServingEligibleFalse, true);
  assert.equal(semantics.servedPrediction.nullWhenModelPredictionAvailableFalse, true);
  assert.equal(semantics.blockedOrAbstainedServedPredictionMayBeCoercedToZeroForModelMetric, false);
  assert.equal(semantics.rawAndServedMustMatchWhenServed, true);

  assert.equal(populations.allScoreable.predicate, "statisticallyScoreable");
  assert.equal(populations.allScoreable.predictionField, "rawModelPrediction");
  assert.equal(populations.allScoreable.zeroImputationAllowed, false);
  assert.equal(populations.allScoreable.caseDropAllowed, false);
  assert.equal(
    populations.servedCohort.predicate,
    "statisticallyScoreable_and_businessServingEligible"
  );
  assert.equal(populations.servedCohort.predictionField, "servedPrediction");
  assert.equal(populations.servedCohort.zeroImputationAllowed, false);
  assert.equal(populations.abstainedCohort.modelWapeAllowed, false);
  assert.equal(populations.modelDeltaAndBootstrap.keyIntersectionDropAllowed, false);
  assert.equal(amendment.metrics.endToEndBusinessLoss.mayBeNamedWape, false);
  assert.equal(amendment.metrics.endToEndBusinessLoss.maySelectComparatorOrCandidate, false);
});

test("eligibility uses only cutoff-available model-independent hard conditions", () => {
  const { caseStates } = readJson(AMENDMENT_PATH);
  const scoreable = caseStates.statisticallyScoreable;
  const serving = caseStates.businessServingEligible;
  const forbidden = [
    "current_rating",
    "current_shelf_status",
    "current_rights_status",
    "current_rights_term_type_without_as_of_snapshot",
    "current_risk_bucket",
    "current_businessActionStatus",
    "candidate_prediction_or_error",
    "embargo_shadow_result",
    "final_holdout_result",
    "deferred_60_month_result"
  ];

  assert.equal(serving.cutoffAvailableHardConditionsOnly, true);
  assert.equal(serving.modelIndependent, true);
  assert.equal(serving.positiveIncomeRequired, false);
  assert.equal(serving.historicalActualWindowCompletenessMayAffectServing, false);
  assert.equal(serving.currentStatusUseWhenHistoricalSnapshotMissing, "postHocSegmentOnly");
  assert.equal(serving.labelsMayMoveToMeetCoverageTarget, false);
  for (const field of forbidden) {
    assert.ok(scoreable.mustNotDependOn.includes(field), `scoreability used ${field}`);
    assert.ok(serving.forbiddenInputs.includes(field), `serving eligibility used ${field}`);
  }
  assert.ok(serving.forbiddenInputs.includes("model_id"));
  assert.ok(
    serving.allMustHold.includes("revenue_model_route_is_resolved_as_of_origin")
  );
});

test("the pre-C1 top10 served-revenue gate is immutable at 90 percent", () => {
  const amendment = readJson(AMENDMENT_PATH);
  const gate =
    amendment.gates.candidateTrainingPreconditions.top10ServedRevenueCoverage;

  assert.equal(gate.minimum, 0.9);
  assert.equal(gate.modelIndependent, true);
  assert.equal(gate.evaluateBeforeC1, true);
  assert.equal(gate.thresholdMayBeLowered, false);
  assert.equal(gate.labelsMayBeMovedToPass, false);
  assert.equal(
    gate.failureBehavior,
    "stop_before_C1_and_report_each_frozen_hard_blocking_reason"
  );
  assert.equal(amendment.gates.gateMayBeRelaxedAfterSeeingCorrectedReplay, false);
});

test("the B0a to B0b bridge freezes seven ordered stages and one fixed stage-2-to-7 population", () => {
  const bridge = readJson(AMENDMENT_PATH).baselineAttributionBridge;
  const expectedStages = [
    "B0a_recorded_historical_metrics",
    "legacy_model_new_case_key_intersection",
    "legacy_model_as_of_quantiles_and_priors",
    "legacy_model_as_of_rating_lifecycle_and_features",
    "legacy_model_new_eligibility",
    "legacy_model_new_abstention_scoring",
    "complete_B0b"
  ];

  assert.deepEqual(bridge.stageOrder, expectedStages);
  assert.deepEqual(bridge.fixedIntersectionAppliesToStages, expectedStages.slice(1));
  assert.equal(bridge.selectionUseAllowed, false);
  assert.equal(
    bridge.stages.B0a_recorded_historical_metrics.sameCaseKeyComparisonAvailable,
    false
  );
  assert.equal(
    bridge.stages.legacy_model_new_case_key_intersection.freezesIntersectionForStages2Through7,
    true
  );
  assert.equal(
    bridge.stages.legacy_model_new_eligibility.expectedAllScoreableRawMetricInvariant,
    true
  );
  assert.equal(
    bridge.notReconstructableBehavior,
    "name_the_exact_missing_legacy_artifact_or_semantics_and_do_not_fabricate_a_stage_metric"
  );
});

test("baseline equivalence uses the frozen OR rule and the simplest equivalent comparator", () => {
  const tieBreak = readJson(AMENDMENT_PATH).baselineComparatorTieBreak;

  assert.deepEqual(tieBreak.eligibleBaselineIds, ["B0b", "B1", "B2", "B3"]);
  assert.deepEqual(tieBreak.excludedBaselineIds, ["B0a"]);
  assert.deepEqual(tieBreak.statisticallyEquivalentWhenAny, [
    "relativePrimaryDifference<0.01",
    "paired_two_way_block_bootstrap_95_percent_CI_for_baseline_wape_minus_provisional_best_wape_has_lower<=0_and_upper>=0"
  ]);
  assert.equal(tieBreak.relativeThresholdIsStrict, true);
  assert.equal(tieBreak.ciEndpointZeroCountsAsContainsZero, true);
  assert.deepEqual(tieBreak.complexityOrderSimplestFirst, ["B1", "B2", "B3", "B0b"]);
  assert.equal(
    tieBreak.selection,
    "choose_the_simplest_baseline_in_the_equivalence_set_containing_the_provisionalBest"
  );
  assert.equal(tieBreak.B0bAndB3MustBothRemainReported, true);
  assert.equal(tieBreak.lockedOnceAfterCorrectedB0bB3Replay, true);
  assert.equal(tieBreak.mayReselectPerGate, false);
});

test("external output stays at four fields and 80 percent PI stays internal", () => {
  const amendment = readJson(AMENDMENT_PATH);
  const boundary = amendment.internalIntervalAndPublicBoundary;

  assert.deepEqual(amendment.predictionSemantics.productContract.allowedFields, [
    "pointForecast",
    "annualBreakdown",
    "confidence",
    "limitation"
  ]);
  assert.deepEqual(boundary.externalForecast.allowedFields, [
    "pointForecast",
    "annualBreakdown",
    "confidence",
    "limitation"
  ]);
  for (const field of [
    "rawModelPrediction",
    "optimistic",
    "pessimistic",
    "high",
    "base",
    "low",
    "predictionIntervalLower",
    "predictionIntervalUpper",
    "PI_lower",
    "PI_upper"
  ]) {
    assert.ok(boundary.externalForecast.forbiddenFields.includes(field));
  }
  assert.equal(boundary.internal80PI.allowed, true);
  assert.equal(boundary.internal80PI.nominalCoverage, 0.8);
  assert.equal(boundary.internal80PI.pointField, "rawModelPrediction");
  assert.deepEqual(boundary.internal80PI.uses, [
    "coverage",
    "WIS",
    "overconfidence_audit"
  ]);
  assert.equal(boundary.internal80PI.endpointsExternalOutputAllowed, false);
  assert.equal(boundary.internal80PI.endpointsCommittablePublicReportAllowed, false);
  assert.equal(boundary.externalForecast.confidenceOrLimitationMayEncodeIntervalEndpoint, false);
});

test("final holdout, embargo, 60-month labels, and every candidate remain sealed", () => {
  const amendment = readJson(AMENDMENT_PATH);
  const { seals } = amendment;

  assert.deepEqual(seals.candidateTraining, {
    C1Started: false,
    C2RStarted: false,
    C2Started: false,
    C3Started: false,
    mayStartOnlyAfterAllCandidateTrainingPreconditionsPassAndExplicitUserAuthorization: true
  });
  assert.equal(seals.finalHoldout.opened, false);
  assert.equal(seals.finalHoldout.truthRead, false);
  assert.equal(seals.finalHoldout.predictionRunAllowed, false);
  assert.equal(seals.finalHoldout.baselineRunnerMustFailClosed, true);
  assert.equal(seals.embargoShadow.opened, false);
  assert.equal(seals.embargoShadow.truthRead, false);
  assert.equal(seals.embargoShadow.fitSelectionOrThresholdUseAllowed, false);
  assert.equal(seals.deferred60Month.opened, false);
  assert.equal(seals.deferred60Month.truthRead, false);
  assert.equal(seals.deferred60Month.fitSelectionOrThresholdUseAllowed, false);
  assert.equal(amendment.releaseBoundary.formalDecisionAllowed, false);
  assert.equal(amendment.releaseBoundary.releaseAllowed, false);
  assert.equal(amendment.releaseBoundary.m3Allowed, false);
});

test("package scripts expose only the frozen correction preflight, development, and sealed holdout modes", () => {
  const { scripts } = readJson("package.json");

  assert.equal(
    scripts["validate:m2:calibration-v1-1-contract"],
    "node --test test/m2-calibration-v1-1-contract.test.js"
  );
  assert.equal(
    scripts["replay:m2:calibration-scoring-correction:preflight"],
    `node ${PYTHON_RUNNER_PATH} ${CORRECTION_RUNNER_PATH} --preflight`
  );
  assert.equal(
    scripts["replay:m2:calibration-scoring-correction:development"],
    `node ${PYTHON_RUNNER_PATH} ${CORRECTION_RUNNER_PATH} --run-development`
  );
  assert.equal(
    scripts["replay:m2:calibration-scoring-correction:final-holdout"],
    `node ${PYTHON_RUNNER_PATH} ${CORRECTION_RUNNER_PATH} --run-final-holdout`
  );
  assert.match(scripts.test, /test\/m2-calibration-v1-1-contract\.test\.js/);
});

test("v1.1 kernels compile, synthetic preflight passes, and final holdout fails closed", () => {
  for (const path of [
    SCORING_KERNEL_PATH,
    ATTRIBUTION_KERNEL_PATH,
    CORRECTION_RUNNER_PATH
  ]) {
    assert.equal(existsSync(path), true, `${path} must exist`);
  }
  runPython([
    "-m",
    "py_compile",
    SCORING_KERNEL_PATH,
    ATTRIBUTION_KERNEL_PATH,
    CORRECTION_RUNNER_PATH
  ]);
  const selfTest = JSON.parse(runPython([SCORING_KERNEL_PATH, "--self-test"]));
  assert.equal(selfTest.ok, true);
  assert.deepEqual(
    Object.entries(selfTest.checks)
      .filter(([, passed]) => passed !== true)
      .map(([name]) => name),
    []
  );
  assert.equal(
    selfTest.baseSpecDigest,
    readJson(AMENDMENT_PATH).baseBinding.canonicalSpecDigestSha256
  );
  assert.equal(selfTest.amendmentDigest, FROZEN_AMENDMENT_DIGEST);
  runPython([CORRECTION_RUNNER_PATH, "--preflight"]);

  const sealed = spawnSync(
    process.execPath,
    [PYTHON_RUNNER_PATH, CORRECTION_RUNNER_PATH, "--run-final-holdout"],
    { encoding: "utf8" }
  );
  assert.notEqual(sealed.status, 0, "final holdout command must fail closed");
  assert.match(
    `${sealed.stdout ?? ""}\n${sealed.stderr ?? ""}`,
    /final[-_ ]?holdout|sealed|fail[-_ ]?closed/i
  );
});
