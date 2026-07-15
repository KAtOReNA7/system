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
  "440eef4bb9120c8dadac038f6a2ebe8ede38ddab4c381948b6e9574af5547375";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function runPython(args, options = {}) {
  return execFileSync(process.execPath, [PYTHON_RUNNER_PATH, ...args], {
    encoding: "utf8",
    ...options
  });
}

function runPythonJson(program) {
  return JSON.parse(runPython(["-c", program]));
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
    bridge.stages.legacy_model_new_eligibility.expectedRawPredictionInvariant,
    true
  );
  assert.equal(
    bridge.stages.legacy_model_new_eligibility.scoringSemantics,
    "legacy_served_prediction_with_null_to_zero_business_coverage_mixture"
  );
  assert.equal(
    bridge.stages.legacy_model_new_eligibility.metricName,
    "legacyCoverageAwareLoss"
  );
  assert.equal(
    bridge.stages.legacy_model_new_eligibility.mayBeNamedModelWape,
    false
  );
  assert.equal(
    bridge.stages.legacy_model_new_abstention_scoring.scoringSemantics,
    "all_scoreable_raw_model_metrics_plus_served_cohort_plus_abstention_metrics"
  );
  assert.equal(
    bridge.stages.legacy_model_new_abstention_scoring.rawModelPredictionUsedForAllScoreableWape,
    true
  );
  assert.equal(
    bridge.stages.legacy_model_new_abstention_scoring.servedNullCoercedToZeroForModelWape,
    false
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

test("prediction locks reject truth fields and detect every public prediction fingerprint mutation", () => {
  const result = runPythonJson(
    [
      "import copy,json,pathlib,sys",
      "sys.path.insert(0,str(pathlib.Path('scripts/m2-real-data').resolve()))",
      "import m2_calibration_scoring_v1_1 as scoring",
      "contract=scoring.load_contract()",
      "row={",
      " 'case_key':{'standard_work_id':'SYNTH-LOCK-1','origin':'2020-12','horizon_months':3,'route':'pure_sales_share'},",
      " 'model_id':'B0b',",
      " 'statisticallyScoreable':True,",
      " 'scoreabilityReason':None,",
      " 'rawModelPrediction':12.5,",
      " 'modelPredictionAvailable':True,",
      " 'businessServingEligible':True,",
      " 'servedPrediction':12.5,",
      " 'abstained':False,",
      " 'abstentionReason':None,",
      " 'rawAnnualBreakdown':[{'year':2021,'value':12.5}],",
      " 'servedAnnualBreakdown':[{'year':2021,'value':12.5}],",
      " 'confidence':'low',",
      " 'limitation':[],",
      " 'public_output':{'pointForecast':12.5,'annualBreakdown':[{'year':2021,'value':12.5}],'confidence':'low','limitation':[]}",
      "}",
      "lock=scoring.create_prediction_lock([row],'development_forward_score',contract)",
      "truth_rejected=False",
      "try:",
      " scoring.create_prediction_lock([{**row,'actual':7.0}],'development_forward_score',contract)",
      "except scoring.ScoringContractError:",
      " truth_rejected=True",
      "joined={**copy.deepcopy(row),'actual':7.0}",
      "post_join_verified=False",
      "try:",
      " scoring.verify_prediction_lock([joined],lock,contract)",
      " post_join_verified=True",
      "except scoring.ScoringContractError:",
      " pass",
      "mutations=[",
      " ('rawModelPrediction',13.5),",
      " ('servedPrediction',13.5),",
      " ('rawAnnualBreakdown',[{'year':2021,'value':13.5}]),",
      " ('servedAnnualBreakdown',[{'year':2021,'value':13.5}]),",
      " ('confidence','high'),",
      " ('limitation',['mutated']),",
      " ('businessServingEligible',False),",
      " ('abstained',True),",
      "]",
      "mutation_results={}",
      "for field,value in mutations:",
      " mutated={**copy.deepcopy(joined),field:value}",
      " rejected=False",
      " try:",
      "  scoring.verify_prediction_lock([mutated],lock,contract)",
      " except scoring.ScoringContractError:",
      "  rejected=True",
      " mutation_results[field]=rejected",
      "print(json.dumps({'truthRejected':truth_rejected,'postJoinVerified':post_join_verified,'mutationRejected':mutation_results},sort_keys=True))"
    ].join("\n")
  );

  assert.equal(result.truthRejected, true);
  assert.equal(result.postJoinVerified, true);
  assert.deepEqual(result.mutationRejected, {
    abstained: true,
    businessServingEligible: true,
    confidence: true,
    limitation: true,
    rawAnnualBreakdown: true,
    rawModelPrediction: true,
    servedAnnualBreakdown: true,
    servedPrediction: true
  });
});

test("scoreability fingerprints are order invariant and bind every frozen scoreability field", () => {
  const result = runPythonJson(
    [
      "import copy,json,pathlib,sys",
      "sys.path.insert(0,str(pathlib.Path('scripts/m2-real-data').resolve()))",
      "import m2_calibration_scoring_v1_1 as scoring",
      "rows=[",
      " {'case_key':{'standard_work_id':'SYNTH-SCORE-1','origin':'2020-12','horizon_months':3,'route':'pure_sales_share'},'statisticallyScoreable':True,'scoreabilityReason':None,'target_end':'2021-03','label_available_as_of':'2021-03','actual':10.0},",
      " {'case_key':{'standard_work_id':'SYNTH-SCORE-2','origin':'2021-06','horizon_months':6,'route':'pure_buyout'},'statisticallyScoreable':False,'scoreabilityReason':'insufficient_observed_calendar_history','target_end':'2021-12','label_available_as_of':'2021-12','actual':0.0},",
      "]",
      "expected=scoring.scoreability_fingerprint(rows)",
      "order_invariant=scoring.scoreability_fingerprint(list(reversed(rows)))==expected",
      "mutations=[",
      " ('case_key',{'standard_work_id':'SYNTH-SCORE-X','origin':'2020-12','horizon_months':3,'route':'pure_sales_share'}),",
      " ('statisticallyScoreable',False),",
      " ('scoreabilityReason','income_fact_integrity_failure'),",
      " ('target_end','2021-04'),",
      " ('label_available_as_of','2021-04'),",
      " ('actual',10.25),",
      "]",
      "mutation_results={}",
      "for field,value in mutations:",
      " changed=copy.deepcopy(rows)",
      " changed[0][field]=value",
      " try:",
      "  mutation_results[field]=scoring.scoreability_fingerprint(changed)!=expected",
      " except scoring.ScoringContractError:",
      "  mutation_results[field]=True",
      "print(json.dumps({'orderInvariant':order_invariant,'mutationChanged':mutation_results},sort_keys=True))"
    ].join("\n")
  );

  assert.equal(result.orderInvariant, true);
  assert.deepEqual(result.mutationChanged, {
    actual: true,
    case_key: true,
    label_available_as_of: true,
    scoreabilityReason: true,
    statisticallyScoreable: true,
    target_end: true
  });
});

test("a zero-WAPE provisional best does not make positive-WAPE baselines equivalent", () => {
  const result = runPythonJson(
    [
      "import json,pathlib,sys",
      "sys.path.insert(0,str(pathlib.Path('scripts/m2-real-data').resolve()))",
      "import m2_calibration_scoring_v1_1 as scoring",
      "selection=scoring.select_equivalent_comparator(",
      " {'B0b':{'wape':0.0},'B1':{'wape':0.5},'B2':{'wape':0.0},'B3':{'wape':0.1}},",
      " {'B0b':{'percentileLower':0.0,'percentileUpper':0.0},'B1':{'percentileLower':0.1,'percentileUpper':0.9},'B2':{'percentileLower':0.0,'percentileUpper':0.0},'B3':{'percentileLower':0.01,'percentileUpper':0.2}},",
      " ['B1','B2','B3','B0b']",
      ")",
      "print(json.dumps(selection,sort_keys=True))"
    ].join("\n")
  );

  assert.equal(result.provisionalBest, "B0b");
  assert.deepEqual(result.equivalentBaselineIds, ["B0b", "B2"]);
  assert.equal(result.evidence.B1.statisticallyEquivalent, false);
  assert.equal(result.evidence.B3.statisticallyEquivalent, false);
  assert.equal(result.lockedComparator, "B2");
});

test("a sub-threshold aggregate is suppressed as one whole cell before any model metric is exposed", () => {
  const result = runPythonJson(
    [
      "import json,pathlib,sys",
      "sys.path.insert(0,str(pathlib.Path('scripts/m2-real-data').resolve()))",
      "import run_m2_calibration_scoring_correction as runner",
      "spec=json.loads(pathlib.Path('src/domain/oldProductEvaluation/calibrationSpec.v1.json').read_text(encoding='utf-8'))",
      "rows=[]",
      "for model in ('B0b','B1','B2','B3'):",
      " rows.append({'model_id':model,'case_key':{'standard_work_id':'SYNTH-SMALL-1','origin':'2020-12','horizon_months':36,'route':'pure_sales_share'}})",
      "print(json.dumps(runner.aggregate_models(rows,spec),sort_keys=True))"
    ].join("\n")
  );

  assert.deepEqual(result, {
    allCellMetricsWithheld: true,
    caseCount: "<10",
    suppressed: true,
    suppressionReason: "case_or_unique_work_count_below_public_minimum",
    uniqueWorkCount: "<10"
  });
});

test("public sanitization prevents complement inference, row identifiers, local paths, and PI endpoints", () => {
  const result = runPythonJson(
    [
      "import json,pathlib,sys",
      "sys.path.insert(0,str(pathlib.Path('scripts/m2-real-data').resolve()))",
      "import run_m2_calibration_scoring_correction as runner",
      "payload={",
      " 'allScoreableModelMetrics':{'caseCount':20,'uniqueWorkCount':10,'workCountDefinition':'distinct_standard_work_id_x_origin','actualTotal':100.0,'predictedTotal':90.0,'wape':0.2,'mae':1.0,'smape':0.3,'signedAggregateBias':-0.1,'horizonStability':{}},",
      " 'servedCohortMetrics':{'caseCount':19,'uniqueWorkCount':10,'actualTotal':99.0,'predictedTotal':89.0,'wape':0.2,'mae':1.0,'smape':0.3,'signedAggregateBias':-0.1,'highValuePerformance':{'caseCount':10,'uniqueWorkCount':10,'actualTotal':80.0,'predictedTotal':70.0,'wape':0.2,'mae':1.0,'smape':0.3,'signedAggregateBias':-0.1}},",
      " 'abstentionMetrics':{'scoreableCaseCount':20,'servedCaseCount':19,'servedWorkShare':0.9,'servedActualRevenueShare':0.99,'top1ServedRevenueShare':1.0,'top5ServedRevenueShare':1.0,'top10ServedRevenueShare':1.0,'abstainedCaseCount':1,'abstainedWorkCount':1,'abstainedActualRevenueShare':0.01,'highValueAbstainedWorkCount':1,'abstentionReasonDistribution':{}},",
      " 'internal80PredictionInterval':{'requiredCaseCount':20,'availableCaseCount':20,'missingCaseCount':0,'completeOnAllScoreablePopulation':True,'internal80Coverage':0.8,'meanWis':1.0,'endpointsPresentInPublicReport':False}",
      "}",
      "sanitized=runner.sanitize_score_payload(payload,10)",
      "runner.assert_public_privacy(sanitized)",
      "attribution_sanitized=runner.sanitize_attribution_report({'stages':[{'endToEndBusinessLoss':{'workCountDefinition':'distinct_standard_work_id_x_origin'}}]},10)",
      "runner.assert_public_privacy(attribution_sanitized)",
      "cells=[{'modelId':'B0b','value':'rare','suppressed':True,'caseCount':'<10','uniqueWorkCount':'<10'},{'modelId':'B0b','value':'common','suppressed':False,'allScoreableModelMetrics':{'caseCount':20,'uniqueWorkCount':10}}]",
      "secondary=runner._apply_complementary_axis_suppression(cells)",
      "negative=[{'caseKey':['PRIVATE-WORK','2020-12',3,'pure_sales_share']},{'workKey':'PRIVATE-WORK'},{'raw_income_row':{'amount':1}},{'definition':'distinct_standard_work_id_x_origin'},{'path':'C:/Users/Other/secret/source.xlsx'},{'p10':1,'p90':2},{'caseCount':1},{'uniqueWorkCount':1}]",
      "rejected=[]",
      "for candidate in negative:",
      " try: runner.assert_public_privacy(candidate)",
      " except runner.CorrectionError: rejected.append(True)",
      " else: rejected.append(False)",
      "markdown_rejected=False",
      "try: runner.assert_public_markdown_privacy('`predictionIntervalLower`: 1')",
      "except runner.CorrectionError: markdown_rejected=True",
      "long_receipt=runner._public_lock_receipt({'role':'development_long_horizon_audit','predictionFingerprint':'a'*64,'predictionRowCount':1,'caseKeyCount':1},suppress_counts=True)",
      "print(json.dumps({'allTotalsRemoved':'actualTotal' not in sanitized['allScoreableModelMetrics'] and 'predictedTotal' not in sanitized['allScoreableModelMetrics'],'semanticDefinitionSanitized':sanitized['allScoreableModelMetrics']['workCountDefinition']=='distinct_work_origin_block' and attribution_sanitized['stages'][0]['endToEndBusinessLoss']['workCountDefinition']=='distinct_work_x_origin','servedTotalsRemoved':'actualTotal' not in sanitized['servedCohortMetrics'] and 'predictedTotal' not in sanitized['servedCohortMetrics'],'servedCountHidden':sanitized['servedCohortMetrics']['caseCount'] is None,'abstentionSuppressed':sanitized['abstentionMetrics']['suppressed'],'coverageRetainedAsLargeDenominator':sanitized['servingCoverageMetrics']['top10ServedRevenueShare']==1.0,'secondarySuppression':len(secondary)==2 and all(cell['suppressed'] for cell in secondary) and any(cell.get('secondarySuppression') for cell in secondary),'negativeRejected':all(rejected),'markdownRejected':markdown_rejected,'longFingerprintWithheld':'predictionFingerprint' not in long_receipt and long_receipt.get('predictionFingerprintWithheldForSmallCell') is True},sort_keys=True))"
    ].join("\n")
  );

  assert.deepEqual(result, {
    abstentionSuppressed: true,
    allTotalsRemoved: true,
    coverageRetainedAsLargeDenominator: true,
    longFingerprintWithheld: true,
    markdownRejected: true,
    negativeRejected: true,
    secondarySuppression: true,
    semanticDefinitionSanitized: true,
    servedCountHidden: true,
    servedTotalsRemoved: true
  });
});

test("forward pre-truth boundary binds scoreOrigin, all four baselines, and sealed case blocks", () => {
  const result = runPythonJson(
    [
      "import copy,json,pathlib,sys",
      "sys.path.insert(0,str(pathlib.Path('scripts/m2-real-data').resolve()))",
      "import run_m2_calibration_scoring_correction as runner",
      "import m2_calibration_scoring_v1_1 as scoring",
      "contract=scoring.load_contract(); spec=contract.base_spec; origin=spec['origins']['forwardValidation']['scoreOrigins'][0]",
      "horizon=next(item for item in spec['origins']['forwardValidation']['folds'] if item['scoreOrigin']==origin)['testHorizons'][0]",
      "work={'standard_work_id':'SYNTH-PARITY','channels':[{'channel_key':'SYNTH','business_form':'synthetic','first_observed_month':'2019-01','monthly':{f'2019-{month:02d}':float(month) for month in range(1,13)},'batch_cluster_sizes':{}}]}",
      "rows=[{'model_id':model,'case_key':{'standard_work_id':'SYNTH-PARITY','origin':origin,'horizon_months':horizon,'route':'pure_sales_share'},'point_forecast':1.0,'annual_breakdown':[],'confidence':'low','limitation':[]} for model in ('B0b','B1','B2','B3')]",
      "join_called=False; original=runner.legacy.join_truth",
      "def forbidden(*args,**kwargs):",
      " global join_called; join_called=True; raise AssertionError('truth join must not run')",
      "runner.legacy.join_truth=forbidden",
      "missing_model_rejected=False",
      "try:",
      " try: runner._materialize_annotate_lock_join(rows[:-1],[work],spec,contract,role=f'development_forward_score:{origin}',b0b_role='development_forward_fold',score_origin=origin)",
      " except runner.CorrectionError: missing_model_rejected=True",
      "finally: runner.legacy.join_truth=original",
      "annotated=runner.annotate_rows(rows,[work],contract,role=f'development_forward_score:{origin}')",
      "mixed=copy.deepcopy(annotated); mixed[0]['case_key']['origin']='2021-06'",
      "mixed_origin_rejected=False",
      "try: scoring.lock_prediction_population(mixed,role=f'development_forward_score:{origin}',score_origin=origin,contract=contract)",
      "except scoring.ScoringContractError: mixed_origin_rejected=True",
      "second=copy.deepcopy(annotated)",
      "for row in second: row['case_key']['standard_work_id']='SYNTH-PARITY-2'",
      "missing_key=[*copy.deepcopy(annotated),*second[:-1]]",
      "missing_key_rejected=False",
      "try: scoring.prediction_fingerprint(missing_key,contract)",
      "except scoring.ScoringContractError: missing_key_rejected=True",
      "interval_projection=runner._interval_compatible(annotated)",
      "interval_role_compatible=all(row['_residual_case_role']=='development_forward_score' for row in interval_projection) and all(row['_interval_role_projected_from']==f'development_forward_score:{origin}' for row in interval_projection) and all(row['_residual_case_role']==f'development_forward_score:{origin}' for row in annotated)",
      "preflight=runner.preflight(contract)",
      "print(json.dumps({'missingModelRejectedBeforeJoin':missing_model_rejected and not join_called,'mixedOriginRejected':mixed_origin_rejected,'missingKeyRejected':missing_key_rejected,'intervalRoleCompatibleWithoutLockMutation':interval_role_compatible,'runnerOrder':preflight['checks']['runnerPredictionLockTruthOrder'],'futureInvariant':preflight['checks']['runnerFutureTruthPerturbationInvariant'],'sealedGuard':preflight['checks']['sealedTruthJoinGuard'],'availabilityGuard':preflight['checks']['canonicalFoldAvailabilityBoundaries']},sort_keys=True))"
    ].join("\n")
  );

  assert.deepEqual(result, {
    availabilityGuard: true,
    futureInvariant: true,
    intervalRoleCompatibleWithoutLockMutation: true,
    missingKeyRejected: true,
    missingModelRejectedBeforeJoin: true,
    mixedOriginRejected: true,
    runnerOrder: true,
    sealedGuard: true
  });
});

test("private evidence manifest binds contract, code, inputs, locks, cases, and every report", () => {
  const result = runPythonJson(
    [
      "import copy,hashlib,json,pathlib,sys,tempfile",
      "sys.path.insert(0,str(pathlib.Path('scripts/m2-real-data').resolve()))",
      "import run_m2_calibration_scoring_correction as runner",
      "import m2_calibration_scoring_v1_1 as scoring",
      "import m2_calibration_v1 as calibration",
      "import run_m2_calibration_baseline_replay as legacy",
      "contract=scoring.load_contract()",
      "def case_payload(model,role,work,origin,horizon):",
      " target=calibration.add_months(origin,horizon)",
      " return {'modelId':model,'caseKey':{'standard_work_id':work,'origin':origin,'horizon_months':horizon,'route':'pure_sales_share'},'actual':7.0,'targetEnd':target,'labelAvailableAsOf':target,'billMonthMax':target,'sourceAvailableAsOf':target,'statisticallyScoreable':True,'scoreabilityReason':None,'modelPredictionAvailable':True,'businessServingEligible':True,'rawModelPrediction':5.0,'servedPrediction':5.0,'abstained':False,'abstentionReason':None,'rawAnnualBreakdown':[],'servedAnnualBreakdown':[],'confidence':'low','limitation':[],'predictionRole':role,'internal80PredictionInterval':None,'strata':None}",
      "def reconstructed(payload):",
      " return {'model_id':payload['modelId'],'case_key':copy.deepcopy(payload['caseKey']),'actual':payload['actual'],'target_end':payload['targetEnd'],'label_available_as_of':payload['labelAvailableAsOf'],'_bill_month_max':payload['billMonthMax'],'_available_as_of':payload['sourceAvailableAsOf'],'statisticallyScoreable':payload['statisticallyScoreable'],'scoreabilityReason':payload['scoreabilityReason'],'modelPredictionAvailable':payload['modelPredictionAvailable'],'businessServingEligible':payload['businessServingEligible'],'rawModelPrediction':payload['rawModelPrediction'],'servedPrediction':payload['servedPrediction'],'abstained':payload['abstained'],'abstentionReason':payload['abstentionReason'],'rawAnnualBreakdown':payload['rawAnnualBreakdown'],'servedAnnualBreakdown':payload['servedAnnualBreakdown'],'confidence':payload['confidence'],'limitation':payload['limitation'],'public_output':{'pointForecast':payload['servedPrediction'],'annualBreakdown':payload['servedAnnualBreakdown'],'confidence':payload['confidence'],'limitation':payload['limitation']},'_residual_case_role':payload['predictionRole']}",
      "models=('B0b','B1','B2','B3')",
      "payloads=[]",
      "payloads += [case_payload(model,'development_warmup_interval_calibration','SYNTH-MANIFEST-WARM','2019-06',3) for model in models]",
      "payloads += [case_payload('B0b','development_fold_training_seed','SYNTH-MANIFEST-SEED','2019-12',3)]",
      "for origin in contract.base_spec['origins']['forwardValidation']['scoreOrigins']:",
      " payloads += [case_payload(model,f'development_forward_score:{origin}',f'SYNTH-MANIFEST-FWD-{origin}',origin,3) for model in models]",
      "payloads += [case_payload(model,'development_long_horizon_audit','SYNTH-MANIFEST-LONG','2019-06',36) for model in models]",
      "rows=[reconstructed(payload) for payload in payloads]",
      "def encoded_cases(values,newline=b'\\n'):",
      " return b''.join(json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False).encode('utf-8')+newline for value in values)",
      "by_role={} ",
      "for row in rows: by_role.setdefault(row['_residual_case_role'],[]).append(row)",
      "origins=[str(value) for value in contract.base_spec['origins']['forwardValidation']['scoreOrigins']]",
      "forward_rows=[row for origin in origins for row in by_role[f'development_forward_score:{origin}']]",
      "locks={'warmup':scoring.prediction_fingerprint(by_role['development_warmup_interval_calibration'],contract,allow_outcome_projection=True),'developmentTrainingSeed':scoring.prediction_fingerprint(by_role['development_fold_training_seed'],contract,allow_outcome_projection=True),'forwardCombined':scoring.prediction_fingerprint(forward_rows,contract,allow_outcome_projection=True),'forwardByScoreOrigin':{origin:scoring.prediction_fingerprint(by_role[f'development_forward_score:{origin}'],contract,allow_outcome_projection=True) for origin in origins},'longAudit':scoring.prediction_fingerprint(by_role['development_long_horizon_audit'],contract,allow_outcome_projection=True)}",
      "with tempfile.TemporaryDirectory() as directory:",
      " root=pathlib.Path(directory)",
      " case_path=root/'cases.ndjson'",
      " manifest_path=root/'manifest.json'",
      " report_path=root/'report.json'",
      " report_path.write_bytes(b'{}\\n')",
      " encoded=encoded_cases(payloads)",
      " case_path.write_bytes(encoded)",
      " manifest={'schema':'m2.calibration-baseline-replay.private-manifest.v1_1','decisionStatus':'not_for_formal_decision','baseSpecDigest':contract.base_digest,'amendmentDigest':contract.amendment_digest,'combinedContractDigest':contract.combined_digest,'correctionCodeCommit':legacy.latest_exact_commit(runner.CORRECTION_CODE_PATHS),'inputFingerprint':'1'*64,'scoreabilityFingerprint':scoring.scoreability_fingerprint(rows,contract),'foldTrainingPopulationFingerprints':runner._fold_training_population_fingerprints(rows,contract.base_spec),'predictionLockFingerprints':locks,'fittedArtifactSha256':'2'*64,'privateCaseRowCount':len(payloads),'caseEvidenceSha256':hashlib.sha256(encoded).hexdigest(),'privateCaseSerialization':'canonical_compact_JSON_UTF8_LF_one_object_per_line','publicReportSha256':{'report.json':hashlib.sha256(report_path.read_bytes()).hexdigest()},'caseKeyAndStateParity':True,'finalHoldoutOpened':False,'candidateTrainingStarted':False}",
      " trusted={key:manifest[key] for key in ('schema','decisionStatus','baseSpecDigest','amendmentDigest','combinedContractDigest','correctionCodeCommit','inputFingerprint','scoreabilityFingerprint','foldTrainingPopulationFingerprints','predictionLockFingerprints','fittedArtifactSha256','caseKeyAndStateParity','finalHoldoutOpened','candidateTrainingStarted')}",
      " manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,sort_keys=True),encoding='utf-8')",
      " paths={'report.json':report_path}",
      " verified=runner.verify_private_evidence_manifest(case_path,manifest_path,expected_bindings=trusted,public_report_paths=paths)",
      " checks={}",
      " def rejected(candidate_manifest,candidate_bytes=encoded):",
      "  case_path.write_bytes(candidate_bytes)",
      "  manifest_path.write_text(json.dumps(candidate_manifest,ensure_ascii=False,sort_keys=True),encoding='utf-8')",
      "  try: runner.verify_private_evidence_manifest(case_path,manifest_path,expected_bindings=trusted,public_report_paths=paths)",
      "  except runner.CorrectionError: return True",
      "  return False",
      " missing=copy.deepcopy(manifest); missing.pop('baseSpecDigest'); checks['missingBinding']=rejected(missing)",
      " changed_input=copy.deepcopy(manifest); changed_input['inputFingerprint']='3'*64; checks['trustedInputTamper']=rejected(changed_input)",
      " report_path.write_bytes(b'{\"changed\":true}\\n')",
      " checks['reportTamper']=rejected(manifest)",
      " report_path.write_bytes(b'{}\\n')",
      " raw_changed=copy.deepcopy(payloads); raw_changed[0]['rawModelPrediction']=9.0; raw_changed[0]['servedPrediction']=9.0; raw_bytes=encoded_cases(raw_changed); raw_manifest=copy.deepcopy(manifest); raw_manifest['caseEvidenceSha256']=hashlib.sha256(raw_bytes).hexdigest(); checks['predictionLockTamper']=rejected(raw_manifest,raw_bytes)",
      " actual_changed=copy.deepcopy(payloads); actual_changed[0]['actual']=99.0; actual_bytes=encoded_cases(actual_changed); actual_manifest=copy.deepcopy(manifest); actual_manifest['caseEvidenceSha256']=hashlib.sha256(actual_bytes).hexdigest(); checks['scoreabilityTamper']=rejected(actual_manifest,actual_bytes)",
      " availability_changed=copy.deepcopy(payloads); availability_changed[4]['billMonthMax']='2026-01'; availability_bytes=encoded_cases(availability_changed); availability_manifest=copy.deepcopy(manifest); availability_manifest['caseEvidenceSha256']=hashlib.sha256(availability_bytes).hexdigest(); checks['foldAvailabilityTamper']=rejected(availability_manifest,availability_bytes)",
      " crlf_bytes=encoded_cases(payloads,b'\\r\\n'); crlf_manifest=copy.deepcopy(manifest); crlf_manifest['caseEvidenceSha256']=hashlib.sha256(crlf_bytes).hexdigest(); checks['nonCanonicalNdjson']=rejected(crlf_manifest,crlf_bytes)",
      " print(json.dumps({'verified':verified,'checks':checks},sort_keys=True))"
    ].join("\n")
  );

  assert.equal(result.verified.privateCaseRowCount, 29);
  assert.equal(result.verified.manifestEvidenceBound, true);
  assert.equal(result.verified.manifestRoundTripVerified, true);
  assert.equal(result.verified.predictionLocksRecomputedFromCases, true);
  assert.equal(result.verified.scoreabilityFingerprintRecomputedFromCases, true);
  assert.equal(result.verified.foldTrainingFingerprintsRecomputedFromCases, true);
  assert.equal(result.verified.codeCommitBytesVerified, true);
  assert.equal(result.verified.allPublicReportDigestsVerified, true);
  assert.deepEqual(result.checks, {
    foldAvailabilityTamper: true,
    missingBinding: true,
    nonCanonicalNdjson: true,
    predictionLockTamper: true,
    reportTamper: true,
    scoreabilityTamper: true,
    trustedInputTamper: true
  });
});

test("synthetic attribution separates Stage 5 legacy coverage loss from Stage 6 raw-model WAPE", () => {
  const result = runPythonJson(
    [
      "import json,pathlib,sys",
      "sys.path.insert(0,str(pathlib.Path('scripts/m2-real-data').resolve()))",
      "import m2_calibration_attribution_v1_1 as attribution",
      "print(json.dumps(attribution.synthetic_self_test(),sort_keys=True))"
    ].join("\n")
  );

  assert.equal(result.ok, true);
  for (const check of [
    "stage2ProxyDidNotReadPostPurgeAmount",
    "stage2ProxyStopsAtDevelopmentPurge",
    "fixedPopulation",
    "workCountUsesWorkOrigin",
    "stage5LegacyLossAvailable",
    "stage5LegacyLossNotModelWape",
    "stage5LegacyLossUsesServedNullAsZero",
    "stage6UsesRawAllScoreableWape",
    "stage5To6PredictionUnchanged",
    "stage5To6ScoringSemanticsChanged",
    "integrityNamesSemanticTransition",
    "perOriginDevelopmentRoleAccepted",
    "perOriginDevelopmentRoleMismatchRejected"
  ]) {
    assert.equal(result.checks[check], true, `failed synthetic attribution check: ${check}`);
  }
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
