import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const specPath = path.join(
  root,
  "src",
  "domain",
  "oldProductEvaluation",
  "calibrationSpec.v1.2.amendment.json",
);
const runnerPath = path.join(
  root,
  "scripts",
  "m2-real-data",
  "run_m2_calibration_v1_2.py",
);
const corePath = path.join(
  root,
  "scripts",
  "m2-real-data",
  "m2_calibration_v1_2.py",
);

const spec = JSON.parse(readFileSync(specPath, "utf8"));
const runnerSource = readFileSync(runnerPath, "utf8");
const coreSource = readFileSync(corePath, "utf8");

function runPython(args) {
  return spawnSync(
    process.execPath,
    ["scripts/run-codex-python.mjs", "scripts/m2-real-data/run_m2_calibration_v1_2.py", ...args],
    { cwd: root, encoding: "utf8" },
  );
}

function runInlinePython(source) {
  return spawnSync("python", ["-c", source], {
    cwd: root,
    encoding: "utf8",
  });
}

async function hashAndCountLines(filePath) {
  const hash = createHash("sha256");
  let lineCount = 0;
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
    for (const byte of chunk) {
      if (byte === 10) lineCount += 1;
    }
  }
  return { sha256: hash.digest("hex"), lineCount };
}

function gitCanonicalLfSha256(filePath) {
  const canonical = readFileSync(filePath, "utf8").replace(/\r\n?/gu, "\n");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

test("v1.2 freezes faithful B0b and renames the switched formula to B4", () => {
  assert.equal(spec.modelIdentity.B0b.id, "B0b_v1_1_leakage_free_replay");
  assert.equal(spec.modelIdentity.B4.id, "B4_formula_switched_legacy_variant");
  assert.equal(spec.modelIdentity.B0a.selectionEligible, false);
  assert.equal(spec.modelIdentity.B0b.legacyNullToZeroUsed, false);
  assert.equal(
    spec.faithfulB0bFormula.legacyPeakShareAutomaticDamping,
    "enabled_only_for_cutoff_available_explicitly_confirmed_true_anomaly_when_peak_share_at_least_0_90",
  );
  assert.equal(
    spec.faithfulB0bFormula.spikeTypeTreatment.true_anomaly,
    "apply_legacy_0_40_peak_damping_only_when_explicit_confirmation_available_as_of_cutoff",
  );
  for (const type of ["buyout", "launch_burst", "batch_proration", "settlement_lag", "unconfirmed"]) {
    assert.match(spec.faithfulB0bFormula.spikeTypeTreatment[type], /never_automatic_spike_damping/);
  }
  assert.match(coreSource, /def predict_as_of\(/);
  assert.match(coreSource, /_select_legacy_point/);
  assert.match(coreSource, /unconfirmed_spike_candidate_not_damped/);
});

test("practical equivalence is a four-condition AND with relative bootstrap margins", () => {
  const rule = spec.practicalEquivalence;
  assert.equal(rule.allConditionsRequired, true);
  assert.equal(rule.relativePrimaryWapeDifferenceMaximumInclusive, 0.01);
  assert.deepEqual(rule.pairedBlockBootstrapRelativeDeltaCi.requiredEntireIntervalInclusive, [-0.01, 0.01]);
  assert.equal(rule.signedBiasDifferenceMaximumInclusive, 0.02);
  assert.equal(rule.top10AndEachCoreHorizonRelativeWapeRegressionMaximumInclusive, 0.02);
  assert.match(coreSource, /condition1 and condition2 and condition3 and condition4/);
  assert.doesNotMatch(coreSource, /relative_threshold_satisfied or ci_contains_zero/);
});

test("strict equivalence rejects a CI that contains zero but is wider than the margin", () => {
  const snippet = String.raw`
import sys
sys.path.insert(0, 'scripts/m2-real-data')
import m2_calibration_v1_2 as m
_,_,a=m.load_and_validate_contract()
def bundle(w,bias=0.0,top=0.4):
  return {'allScoreable':{'wape':w,'signedAggregateBias':bias},'topBands':{'top10':{'wape':top}},'horizons':{str(h):{'wape':0.4} for h in m.CORE_HORIZONS}}
metrics={'B0b':bundle(.5),'B1':bundle(.502),'B2':bundle(.7),'B3':bundle(.8),'B4':bundle(.9)}
boot={'comparisons':{x:{'percentileLower':0.0,'percentileUpper':0.0} for x in metrics}}
boot['comparisons']['B1']={'percentileLower':-.02,'percentileUpper':.02}
r=m.select_primary_comparator(metrics,boot,a)
print(r['evidence']['B1']['allFourConditions'])
`;
  const result = runInlinePython(snippet);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "False");
});

test("strict equivalence accepts every inclusive boundary and rejects either excess", () => {
  const snippet = String.raw`
import json, sys
sys.path.insert(0, 'scripts/m2-real-data')
import m2_calibration_v1_2 as m
_,_,a=m.load_and_validate_contract()
def bundle(w,bias=0.0,top=0.4,horizon=0.4):
  return {'allScoreable':{'wape':w,'signedAggregateBias':bias},'topBands':{'top10':{'wape':top}},'horizons':{str(h):{'wape':horizon} for h in m.CORE_HORIZONS}}
def decide(w=.505,bias=.02,top=.408,horizon=.408,lower=-.01,upper=.01):
  metrics={'B0b':bundle(.5),'B1':bundle(w,bias,top,horizon),'B2':bundle(.7),'B3':bundle(.8),'B4':bundle(.9)}
  boot={'comparisons':{x:{'percentileLower':0.0,'percentileUpper':0.0} for x in metrics}}
  boot['comparisons']['B1']={'percentileLower':lower,'percentileUpper':upper}
  return m.select_primary_comparator(metrics,boot,a)['evidence']['B1']['allFourConditions']
print(json.dumps({
  'inclusive': decide(),
  'wapeExcess': decide(w=.5050001),
  'biasExcess': decide(bias=.0200001),
  'topExcess': decide(top=.4080001),
  'horizonExcess': decide(horizon=.4080001),
  'ciExcess': decide(upper=.0100001),
}))
`;
  const result = runInlinePython(snippet);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout.trim());
  assert.deepEqual(payload, {
    inclusive: true,
    wapeExcess: false,
    biasExcess: false,
    topExcess: false,
    horizonExcess: false,
    ciExcess: false,
  });
});

test("case keys accept serving H0/H17 but reject coercion, malformed fields, and invalid domains", () => {
  const snippet = String.raw`
import json, sys
sys.path.insert(0, 'scripts/m2-real-data')
import m2_calibration_v1_2 as m
def row(h=3):
  return {'case_key': {
    'standard_work_id': 'x',
    'origin': '2020-12',
    'horizon_months': h,
    'route': 'pure_sales_share',
  }}
accepted = [list(m.strict_case_key(row(h))) for h in (0, 17)]
bad = []
missing = row(); del missing['case_key']['route']; missing['route'] = 'pure_sales_share'
bad.append(missing)
extra = row(); extra['case_key']['extra'] = 'x'; bad.append(extra)
for field, value in (
  ('standard_work_id', 7),
  ('origin', 202012),
  ('route', 7),
  ('horizon_months', True),
  ('horizon_months', 3.0),
  ('horizon_months', '3'),
  ('horizon_months', -1),
  ('route', 'not_a_route'),
):
  item = row(); item['case_key'][field] = value; bad.append(item)
rejected = 0
for item in bad:
  try:
    m.strict_case_key(item)
  except (m.CalibrationV12Error, ValueError, TypeError):
    rejected += 1
print(json.dumps({'accepted': accepted, 'rejected': rejected, 'attempted': len(bad)}))
`;
  const result = runInlinePython(snippet);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout.trim());
  assert.deepEqual(payload.accepted, [
    ["x", "2020-12", 0, "pure_sales_share"],
    ["x", "2020-12", 17, "pure_sales_share"],
  ]);
  assert.equal(payload.rejected, payload.attempted);
  assert.equal(payload.attempted, 10);
});

test("state truth table accepts one valid universe and fails closed on every malformed state", () => {
  const snippet = String.raw`
import copy, json, sys
sys.path.insert(0, 'scripts/m2-real-data')
import m2_calibration_v1 as base
import m2_calibration_v1_2 as v12
import run_m2_calibration_v1_2 as runner

spec = copy.deepcopy(base.load_spec())
spec['origins']['forwardValidation']['folds'] = [
  {'scoreOrigin': '2021-06', 'testHorizons': [3]}
]
work = {
  'standard_work_id': 'STATE-TRUTH-TABLE-WORK',
  'channels': [{
    'channel_key': 'sales',
    'business_form': 'audio_product',
    'first_observed_month': '2020-01',
    'monthly': {month: float(index + 1) for index, month in enumerate(base.month_range('2020-01', '2021-06'))},
    'batch_cluster_sizes': {},
  }],
}
route = base.route_work_as_of(work, '2021-06', spec)['route']
def valid_rows():
  output = []
  for model in v12.BASELINE_IDS:
    output.append({
      'model_id': model,
      'case_key': {
        'standard_work_id': work['standard_work_id'],
        'origin': '2021-06',
        'horizon_months': 3,
        'route': route,
      },
      'actual': 2.0,
      'target_end': '2021-09',
      'label_available_as_of': '2021-09',
      '_bill_month_max': '2021-09',
      '_available_as_of': '2021-09',
      'statisticallyScoreable': True,
      'scoreabilityReason': None,
      'modelPredictionAvailable': True,
      'businessServingEligible': True,
      'rawModelPrediction': 1.0,
      'servedPrediction': 1.0,
      'abstained': False,
      'abstentionReason': None,
    })
  return output

positive = runner.verify_case_and_state_parity(valid_rows(), [work], spec)
def rejected(mutator):
  rows = valid_rows()
  for row in rows:
    mutator(row)
  try:
    runner.verify_case_and_state_parity(rows, [work], spec)
  except runner.ReplayV12Error:
    return True
  return False

checks = {
  'nonBoolean': rejected(lambda row: row.__setitem__('statisticallyScoreable', 1)),
  'availabilityMismatch': rejected(lambda row: row.__setitem__('rawModelPrediction', None)),
  'servedWhileIneligible': rejected(lambda row: row.__setitem__('businessServingEligible', False)),
  'abstainedMismatch': rejected(lambda row: (row.__setitem__('businessServingEligible', False), row.__setitem__('servedPrediction', None))),
  'missingAbstentionReason': rejected(lambda row: (row.__setitem__('businessServingEligible', False), row.__setitem__('servedPrediction', None), row.__setitem__('abstained', True))),
  'missingScoreabilityReason': rejected(lambda row: row.__setitem__('statisticallyScoreable', False)),
  'targetEndMismatch': rejected(lambda row: row.__setitem__('target_end', '2021-08')),
  'labelAvailabilityTooEarly': rejected(lambda row: row.__setitem__('label_available_as_of', '2021-08')),
}
print(json.dumps({
  'positive': all((
    positive['rawPredictionCompleteOnAllScoreable'],
    positive['modelPredictionAvailableIffRawFinite'],
    positive['servedPredictionNullWhenAbstained'],
    positive['abstainedIffServedPredictionNull'],
    positive['abstentionReasonPresentIffAbstained'],
  )),
  'negative': checks,
}))
`;
  const result = runInlinePython(snippet);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout.trim());
  assert.equal(payload.positive, true);
  assert.ok(Object.keys(payload.negative).length >= 8);
  assert.ok(Object.values(payload.negative).every(Boolean), JSON.stringify(payload));
});

test("sealed truth guard rejects explicit and development-looking roles before invoking builders", () => {
  const snippet = String.raw`
import json, sys
sys.path.insert(0, 'scripts/m2-real-data')
import m2_calibration_v1 as base
import run_m2_calibration_v1_2 as runner
spec = base.load_spec()
horizon_text, split = next(iter(spec['origins']['coreByHorizon'].items()))
sealed_origin = split['finalHoldout'][0]
calls = {'count': 0}
def trap():
  calls['count'] += 1
  return 'should_not_run'
results = {}
for name, role, origin, horizon in (
  ('explicit', 'final_holdout:negative_test', sealed_origin, int(horizon_text)),
  ('masquerade', 'development_forward_score:masquerade', sealed_origin, int(horizon_text)),
  ('nonFrozenH17', 'development_forward_score:non_frozen', spec['origins']['forwardValidation']['folds'][0]['scoreOrigin'], 17),
):
  try:
    runner.guarded_truth_builder(role, origin, horizon, trap, spec)
  except runner.ReplayV12Error:
    results[name] = True
  else:
    results[name] = False
matrix = runner.sealed_block_evidence(spec)
print(json.dumps({'results': results, 'calls': calls['count'], 'matrix': matrix}))
`;
  const result = runInlinePython(snippet);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout.trim());
  assert.deepEqual(payload.results, {
    explicit: true,
    masquerade: true,
    nonFrozenH17: true,
  });
  assert.equal(payload.calls, 0);
  assert.equal(payload.matrix.truthBuilderCallsForThoseBlocks, 0);
  assert.equal(
    payload.matrix.sealedRoleRejectionCount,
    payload.matrix.sealedBlockAttemptCount,
  );
  assert.equal(
    payload.matrix.developmentRoleMasqueradeRejectionCount,
    payload.matrix.sealedBlockAttemptCount,
  );
});

test("faithful formula preserves Model A fallback, inclusive lifecycle boundaries, and unconfirmed-spike invariance", () => {
  const snippet = String.raw`
import copy, json, math, sys
sys.path.insert(0, 'scripts/m2-real-data')
import m2_calibration_v1_2 as m

signed = [-20.0] * 12 + [10.0] * 12
stats_a = {
  'last3': sum(signed[-3:]), 'last6': sum(signed[-6:]),
  'last12': sum(signed[-12:]), 'last24': sum(signed[-24:]),
  'lifecycle': 'stable', 'recentZero': False,
}
model_a = m._legacy_model_a(stats_a, 12)
thresholds = {
  'insufficientHistoryCompleteMonths': 12,
  'inactiveRecent6RevenueMax': -1,
  'reboundRecent3Previous3Ratio': 2.0,
  'growthRecent6Prior6Ratio': 1.5,
  'decliningRecent6Prior6Ratio': 0.5,
  'longTailLast12RevenueMax': 0,
}
growth = m._legacy_lifecycle([10.0] * 6 + [15.0] * 6, thresholds)
declining = m._legacy_lifecycle([10.0] * 6 + [5.0] * 6, thresholds)
rebound = m._legacy_lifecycle([10.0] * 6 + [1.0] * 3 + [2.0] * 3, thresholds)
base_stats = {
  'history': [10.0] * 24,
  'lifecycle': 'stable',
  'last3': 30.0, 'last6': 60.0, 'last12': 120.0, 'last24': 240.0,
  'activeMonths': 24, 'total': 240.0, 'positiveMedian': 10.0,
  'volatility': 1.0, 'peakShare': 0.1, 'recentZero': False,
}
high_peak = copy.deepcopy(base_stats); high_peak['peakShare'] = 0.95
result = {
  'modelA': model_a,
  'growth': growth,
  'declining': declining,
  'rebound': rebound,
  'bUnconfirmedSame': math.isclose(
    m._legacy_model_b(base_stats, 12, confirmed_spike=False),
    m._legacy_model_b(high_peak, 12, confirmed_spike=False), abs_tol=1e-12),
  'dUnconfirmedSame': math.isclose(
    m._legacy_model_d(base_stats, 12, 8.0),
    m._legacy_model_d(high_peak, 12, 8.0), abs_tol=1e-12),
  'confirmedCanDamp': m._legacy_model_b(high_peak, 12, confirmed_spike=True) < m._legacy_model_b(high_peak, 12, confirmed_spike=False),
}
print(json.dumps(result))
`;
  const result = runInlinePython(snippet);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()), {
    modelA: 114,
    growth: "growth",
    declining: "declining",
    rebound: "rebound",
    bUnconfirmedSame: true,
    dUnconfirmedSame: true,
    confirmedCanDamp: true,
  });
});

test("independent expected universe, scoreable raw, served null, and no-zero rules are executable contracts", () => {
  assert.match(runnerSource, /def expected_forward_keys\(/);
  assert.match(runnerSource, /eachModelEqualsIndependentExpectedUniverse/);
  assert.match(runnerSource, /rawPredictionCompleteOnAllScoreable/);
  assert.match(runnerSource, /servedPredictionNullWhenAbstained/);
  assert.match(runnerSource, /zeroImputationUsed/);
  assert.equal(spec.stateModel.blockedOrAbstainedNullToZeroAllowedInModelMetrics, false);
  assert.equal(spec.stateModel.zeroImputationUsed, false);
  assert.doesNotMatch(coreSource, /scoreability_decoupled/);
});

test("changing only scoring eligibility cannot alter a cutoff-only raw prediction", () => {
  const snippet = String.raw`
import copy, json, sys
sys.path.insert(0, 'scripts/m2-real-data')
import m2_calibration_v1 as base
import m2_calibration_v1_2 as v12
import run_m2_calibration_v1_2 as runner
spec=base.load_spec()
origin='2021-06'
work={
  'standard_work_id':'SCORING-INVARIANCE',
  'channels':[{
    'channel_key':'sales', 'business_form':'audio_product',
    'first_observed_month':'2021-01',
    'monthly':{m:10.0 for m in base.month_range('2021-01',origin)},
    'batch_cluster_sizes':{},
  }],
}
prediction=v12.predict_as_of(work,origin,3,'B1',spec)
key=v12.strict_case_key(prediction)
common={
  'case_key':copy.deepcopy(prediction['case_key']),
  'target_end':base.add_months(origin,3),
  'businessServingEligible':False,
  'abstained':True,
  'abstentionReason':'insufficient_history',
}
scoreable={**common,'statisticallyScoreable':True,'scoreabilityReason':None}
unscoreable={**common,'statisticallyScoreable':False,'scoreabilityReason':'incomplete_actual_window'}
a=runner._decorate_v12_prediction(prediction,scoreable,'development_forward_score:2021-06','B1')
b=runner._decorate_v12_prediction(prediction,unscoreable,'development_forward_score:2021-06','B1')
print(json.dumps({
  'rawA':a['rawModelPrediction'], 'rawB':b['rawModelPrediction'],
  'pointA':a['point_forecast'], 'pointB':b['point_forecast'],
  'servedA':a['servedPrediction'], 'servedB':b['servedPrediction'],
}))
`;
  const result = runInlinePython(snippet);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout.trim());
  assert.equal(payload.rawA, payload.rawB);
  assert.equal(payload.pointA, payload.pointB);
  assert.equal(payload.servedA, null);
  assert.equal(payload.servedB, null);
});

test("population denominator is 3053 with 192872 authority and 192869 complete facts", () => {
  assert.equal(spec.populationCoverage.workDenominator, 3053);
  assert.equal(spec.populationCoverage.authorityFactDenominator, 192872);
  assert.equal(spec.populationCoverage.completeMonthFactCount, 192869);
  assert.equal(spec.populationCoverage.totalDenominatorsMayBeSuppressed, false);
  assert.match(runnerSource, /build_population_coverage/);
  assert.match(runnerSource, /overlappingBacktestActualUsedAsPopulationDenominator/);
});

test("small abstention cells suppress both the primary cell and its served complement", () => {
  const snippet = String.raw`
import json, sys
sys.path.insert(0, 'scripts/m2-real-data')
import run_m2_calibration_v1_2 as runner

small = {
  'B1': {
    'served': {'caseCount': 99, 'uniqueWorkCount': 99, 'wape': 0.5},
    'highValueServed': {'caseCount': 9, 'uniqueWorkCount': 9, 'wape': 0.4},
    'abstention': {
      'scoreableCaseCount': 100,
      'servedCaseCount': 99,
      'abstainedCaseCount': 1,
      'abstainedUniqueWorkCount': 1,
      'servedActualRevenueShareOfScoreableCases': 0.99,
      'abstentionReasonDistribution': {
        'one_reason': {'caseCount': 1, 'uniqueWorkCount': 1},
      },
      'servedPredictionNullOnEveryAbstention': True,
      'zeroImputationUsed': False,
    },
  },
}
protected = runner.public_metrics_bundle(small)['B1']
reason_cells = {
  'B1': {
    'served': {'caseCount': 80, 'uniqueWorkCount': 80, 'wape': 0.5},
    'highValueServed': None,
    'abstention': {
      'scoreableCaseCount': 100,
      'servedCaseCount': 80,
      'abstainedCaseCount': 20,
      'abstainedUniqueWorkCount': 20,
      'servedActualRevenueShareOfScoreableCases': 0.8,
      'abstentionReasonDistribution': {
        'small_reason': {'caseCount': 2, 'uniqueWorkCount': 2},
        'another_small_reason': {'caseCount': 0, 'uniqueWorkCount': 0},
        'otherwise_visible_complement': {'caseCount': 18, 'uniqueWorkCount': 18},
      },
      'servedPredictionNullOnEveryAbstention': True,
      'zeroImputationUsed': False,
    },
  },
}
reason_output = runner.public_metrics_bundle(reason_cells)['B1']['abstention']['abstentionReasonDistribution']
print(json.dumps({
  'wholeSuppressed': protected['abstention']['suppressed'],
  'servedMetricSuppressed': protected['served']['suppressed'] and all(protected['served'][key] is None for key in ('caseCount','uniqueWorkCount','wape','mae','smape','signedAggregateBias')),
  'highValueMetricSuppressed': protected['highValueServed']['suppressed'] and all(protected['highValueServed'][key] is None for key in ('caseCount','uniqueWorkCount','wape','mae','smape','signedAggregateBias')),
  'smallReason': reason_output['small_reason'],
  'anotherSmallReason': reason_output['another_small_reason'],
  'complement': reason_output['otherwise_visible_complement'],
}))
`;
  const result = runInlinePython(snippet);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout.trim());
  assert.equal(payload.wholeSuppressed, true);
  assert.equal(payload.servedMetricSuppressed, true);
  assert.equal(payload.highValueMetricSuppressed, true);
  assert.equal(payload.smallReason.suppressed, true);
  assert.equal(payload.smallReason.suppressionReason, "primary_small_cell");
  assert.equal(payload.anotherSmallReason.suppressed, true);
  assert.equal(payload.anotherSmallReason.suppressionReason, "primary_small_cell");
  assert.equal(payload.complement.suppressed, true);
  assert.equal(payload.complement.suppressionReason, "complementary_suppression");
  assert.equal(payload.complement.caseCount, null);
  assert.equal(payload.complement.uniqueWorkCount, null);
});

test("generated population ledger is exhaustive and full-library top bands are nested", () => {
  const reportPath = path.join(
    root,
    "docs",
    "analysis",
    "m2-real-data",
    "M2-calibration-population-coverage-v1.json",
  );
  if (!existsSync(reportPath)) return;
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  assert.equal(report.authority.standardWorkCount, 3053);
  assert.equal(report.authority.incomeFactCount, 192872);
  assert.equal(report.authority.completeMonthIncomeFactCount, 192869);
  assert.equal(
    report.population.scoreableWorkCount + report.population.unscoreableWorkCount,
    3053,
  );
  if (report.population.servedAndAbstainedComplementarilySuppressed) {
    assert.equal(report.population.servedWorkCount, null);
    assert.equal(report.population.servedWorksShareOfScoreable, null);
    assert.equal(report.population.servedWorksShareOf3053, null);
    assert.equal(report.population.servedFullHistoryRevenueShareOfScoreable, null);
    assert.equal(report.population.servedFullHistoryRevenueShareOfLibrary, null);
    assert.ok(report.population.servedWorkCountRange.minimumInclusive <= report.population.scoreableWorkCount);
    assert.equal(report.population.servedWorkCountRange.maximumInclusive, report.population.scoreableWorkCount);
    assert.doesNotMatch(JSON.stringify(report), /"servedWorkCount"\s*:\s*1043/);
  } else {
    assert.ok(report.population.servedWorkCount <= report.population.scoreableWorkCount);
  }
  assert.equal(report.unscoreableReasons.mutuallyExclusive, true);
  assert.equal(report.unscoreableReasons.exhaustive, true);
  assert.equal(report.forwardPathsForHistoricallyUnscoreableWorks.mutuallyExclusive, true);
  assert.equal(report.forwardPathsForHistoricallyUnscoreableWorks.exhaustive, true);
  assert.equal(report.fullLibraryTopBands.top1.fullLibraryBucketWorkCount, 31);
  assert.equal(report.fullLibraryTopBands.top5.fullLibraryBucketWorkCount, 153);
  assert.equal(report.fullLibraryTopBands.top10.fullLibraryBucketWorkCount, 306);
  for (const band of ["top1", "top5", "top10"]) {
    const cell = report.fullLibraryTopBands[band];
    assert.ok(cell.scoreableRevenueCoverage >= 0 && cell.scoreableRevenueCoverage <= 1);
    assert.equal(cell.rankingUniverseWorkCount, 3053);
    assert.equal(cell.denominatorBuiltBeforeScoreableServedFilter, true);
    if (cell.servedCoverageComplementarilySuppressed) {
      assert.equal(cell.servedRevenueCoverage, null);
    } else {
      assert.ok(cell.servedRevenueCoverage >= 0 && cell.servedRevenueCoverage <= 1);
      assert.ok(cell.servedRevenueCoverage <= cell.scoreableRevenueCoverage);
    }
  }
  const forward = report.forwardPathsForHistoricallyUnscoreableWorks;
  assert.deepEqual(forward.allowedPathEnum, [
    "deterministic_fallback",
    "low_confidence_output",
    "insufficient_history_route",
    "abstain",
  ]);
  assert.deepEqual(Object.keys(forward.distribution).sort(), [
    "abstain",
    "deterministic_fallback",
    "insufficient_history_route",
    "low_confidence_output",
  ]);
  assert.equal(forward.insufficientHistoryRouteServedPrediction, null);
  assert.equal(forward.abstentionReasonRequiredWheneverServedPredictionIsNull, true);
});

test("generated baseline replay proves every comparator used the v1.2 entry", () => {
  const reportPath = path.join(
    root,
    "docs",
    "analysis",
    "m2-real-data",
    "M2-baseline-comparator-identity-correction-v1.json",
  );
  if (!existsSync(reportPath)) return;
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const evidence = report.integrity.allBaselineMaterialization;
  assert.equal(evidence.allBaselinePredictionsMaterializedThroughV12Entry, true);
  assert.equal(evidence.oldNumericPredictionFieldsUsed, false);
  assert.equal(evidence.predictionLockedBeforeTruthJoin, true);
  assert.equal(evidence.guardedTruthRebuiltFromAuthorizedWorks, true);
  assert.deepEqual(
    Object.keys(evidence.predictionFingerprintsByModel).sort(),
    ["B0b", "B1", "B2", "B3", "B4"],
  );
  assert.deepEqual(report.pairedRelativeBlockBootstrap.clusterKeys, [
    "standard_work_id",
    "origin",
  ]);
  assert.equal(report.pairedRelativeBlockBootstrap.caseIidSampling, false);
  assert.equal(
    report.integrity.priorPrivateCheckpointSealEvidence
      .sealedOriginHorizonIntersectionCount,
    0,
  );
});

test("C1 design and absolute gates are pre-registered before candidate training", () => {
  assert.equal(spec.C1.authorizedOnlyWhenEveryGateAItemTrue, true);
  assert.equal(spec.C1.allowedComponents.length, 8);
  assert.equal(spec.C1.componentCap, 3);
  assert.deepEqual(spec.C1.weightGrid, [0.25, 0.5, 0.75]);
  assert.equal(spec.C1.candidateEnumeration.singleComponentCount, 8);
  assert.equal(spec.C1.candidateEnumeration.twoComponentPairCount, 28);
  assert.equal(spec.C1.candidateEnumeration.weightsPerTwoComponentPair, 3);
  assert.equal(spec.C1.candidateEnumeration.twoComponentCandidateCount, 84);
  assert.equal(spec.C1.candidateEnumeration.equalWeightThreeComponentCount, 56);
  assert.equal(spec.C1.candidateEnumeration.expectedTotalCandidateCount, 148);
  assert.equal(spec.C1.candidateEnumeration.canonicalComponentOrderRequired, true);
  assert.equal(spec.C1.componentDefinitions.minimumHistoryMonths, 12);
  assert.equal(spec.C1.training.minimumInnerScoreOrigins, 2);
  assert.equal(spec.C1.training.minimumInnerCaseCount, 200);
  assert.equal(spec.C1.training.warmupMaySelectCandidate, false);
  assert.equal(spec.C1.training.outerResultsMayAlterCandidateSpace, false);
  assert.equal(spec.C1.training.seed, 20260714);
  assert.equal(spec.C1AcceptanceGates.overallWapeMaximum, 0.6);
  assert.deepEqual(spec.C1AcceptanceGates.internal80CoverageInclusive, [0.75, 0.85]);
  assert.equal(
    spec.C1AcceptanceGates.pairedBootstrapSuperiorityVsPrimary.method,
    "paired_two_way_pigeonhole_cluster_bootstrap",
  );
  assert.equal(
    spec.C1AcceptanceGates.pairedBootstrapSuperiorityVsPrimary.requiredUpperBoundExclusive,
    0,
  );
  assert.equal(
    spec.C1AcceptanceGates.pairedBootstrapSuperiorityVsPrimary.replicates,
    2000,
  );
  assert.equal(
    spec.C1AcceptanceGates.pairedBootstrapSuperiorityVsPrimary.seed,
    20260714,
  );
  assert.equal(
    Object.hasOwn(spec.C1AcceptanceGates, "pairedBlockBootstrapSuperiorityVsPrimary"),
    false,
  );
  assert.equal(
    spec.C1AcceptanceGates.metricPopulationContract.highValuePopulation,
    "all_scoreable_raw_cases_in_the_origin_as_of_top10_band",
  );
  assert.equal(
    spec.C1AcceptanceGates.metricPopulationContract.full3053CurrentHistoryPopulationRankingMayEnterCandidateSelectionComparatorOrAcceptanceGate,
    false,
  );
  assert.equal(spec.C1AcceptanceGates.thresholdsMayBeChangedAfterResults, false);
  assert.equal(spec.correctionBoundary.C2RAuthorized, false);
  assert.equal(spec.correctionBoundary.C2Authorized, false);
  assert.equal(spec.correctionBoundary.C3Authorized, false);
});

test("synthetic preflight covers future perturbation and sealed matrices without private reads", () => {
  const result = runPython(["--preflight"]);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout.trim());
  assert.equal(payload.status, "passed");
  assert.equal(payload.privateDataRead, false);
  assert.equal(payload.futurePerturbation.passed, true);
  assert.equal(payload.futurePerturbation.allCoreHorizonsCovered, true);
  assert.equal(payload.futurePerturbation.allBaselineModelsCovered, true);
  assert.equal(payload.futurePerturbation.allRevenueRoutesCovered, true);
  assert.equal(payload.futurePerturbation.matrixCaseCount, 5 * 4 * 5);
  assert.equal(payload.futurePerturbation.fullPredictionAndStateProjectionInvariant, true);
  assert.equal(payload.futurePerturbation.expectedCaseUniverseInvariant, true);
  assert.equal(payload.futurePerturbation.futureOnlyWholeWorkRejectedByEveryModel, true);
  assert.equal(payload.futurePerturbation.scoreabilityStateIsNotAPredictorInput, true);
  assert.equal(payload.futurePerturbation.B4AllParameterRolesFutureInvariant, true);
  assert.deepEqual(payload.futurePerturbation.B4ParameterRolesCovered, [
    "committed_development_fit",
    "development_forward_fold",
    "prefit_development_template",
  ]);
  assert.equal(
    payload.synthetic.checks.spikeTypesDistinguishedAndOnlyConfirmedTrueAnomalyDamped,
    true,
  );
  assert.equal(payload.seals.finalHoldoutOpened, false);
  assert.equal(payload.seals.embargoShadowOpened, false);
  assert.equal(payload.seals.deferred60MonthLabelsOpened, false);
});

test("v1.2 final holdout command fails closed before a data load", () => {
  const result = runPython(["--run-final-holdout"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /final holdout is unavailable/);
  assert.match(result.stderr, /dataLoadCalls=0/);
});

test("generated formula manifest binds every cited source to its historical Git blob", () => {
  const reportPath = path.join(
    root,
    "docs",
    "analysis",
    "m2-real-data",
    "M2-v1.1-formula-difference-manifest-v1.json",
  );
  if (!existsSync(reportPath)) return;
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  assert.ok(report.sources.length >= 5);
  for (const source of report.sources) {
    assert.match(source.sourceCommit, /^[0-9a-f]{40}$/);
    assert.match(source.historicalBlobSha256, /^[0-9a-f]{64}$/);
    assert.equal(source.currentMatchesSourceCommit, true);
    const shown = spawnSync(
      "git",
      ["show", `${source.sourceCommit}:${source.path}`],
      { cwd: root, encoding: null, maxBuffer: 32 * 1024 * 1024 },
    );
    assert.equal(shown.status, 0, shown.stderr?.toString("utf8"));
    assert.equal(
      createHash("sha256").update(shown.stdout).digest("hex"),
      source.historicalBlobSha256,
    );
    assert.equal(gitCanonicalLfSha256(path.join(root, source.path)), source.historicalBlobSha256);
  }
});

test("ignored Phase A manifest round-trips case rows and every public report digest", async () => {
  const privateDir = path.join(root, "data", "private-output", "m2-calibration-v1-2");
  const manifestPath = path.join(
    privateDir,
    "M2-calibration-v1.2-baseline-manifest-private.json",
  );
  const casesPath = path.join(
    privateDir,
    "M2-calibration-v1.2-baseline-cases-private.ndjson",
  );
  if (!existsSync(manifestPath) && !existsSync(casesPath)) return;
  assert.equal(existsSync(manifestPath), true);
  assert.equal(existsSync(casesPath), true);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const evidence = await hashAndCountLines(casesPath);
  assert.equal(evidence.sha256, manifest.caseEvidenceSha256);
  assert.equal(evidence.lineCount, manifest.privateCaseRowCount);
  assert.equal(manifest.tracked, false);
  assert.equal(manifest.finalHoldoutOpened, false);
  assert.equal(manifest.embargoShadowOpened, false);
  assert.equal(manifest.deferred60MonthLabelsOpened, false);
  assert.match(manifest.specDigest, /^[0-9a-f]{64}$/);
  assert.ok(manifest.privateCaseRowCount > 0);
  assert.equal(typeof manifest.derivedBindings, "object");
  assert.deepEqual(
    Object.keys(manifest.derivedBindings.predictionFingerprintsByModel).sort(),
    ["B0b", "B1", "B2", "B3", "B4"],
  );
  const digest = runInlinePython(String.raw`
import json, sys
sys.path.insert(0, 'scripts/m2-real-data')
import m2_calibration_v1_2 as v12
print(v12.canonical_digest(json.loads(open('src/domain/oldProductEvaluation/calibrationSpec.v1.2.amendment.json', encoding='utf-8').read())))
`);
  assert.equal(digest.status, 0, digest.stderr);
  assert.equal(
    manifest.specDigest,
    digest.stdout.trim(),
    "private manifest must use a verifiable canonical spec digest",
  );
  for (const [relativePath, expected] of Object.entries(manifest.publicReportSha256)) {
    const absolutePath = path.join(root, ...relativePath.split("/"));
    assert.equal(existsSync(absolutePath), true, relativePath);
    assert.equal(
      gitCanonicalLfSha256(absolutePath),
      expected,
      relativePath,
    );
  }
  const tracked = spawnSync(
    "git",
    [
      "ls-files",
      "--",
      path.relative(root, manifestPath).replaceAll("\\", "/"),
      path.relative(root, casesPath).replaceAll("\\", "/"),
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(tracked.status, 0, tracked.stderr);
  assert.equal(tracked.stdout.trim(), "");
});

test("tracked Gate anchors ignored cases, role counts, projections, sources, and non-self reports", () => {
  const gatePath = path.join(
    root,
    "docs",
    "analysis",
    "m2-real-data",
    "M2-calibration-gate-a-v1.json",
  );
  if (!existsSync(gatePath)) return;
  const gate = JSON.parse(readFileSync(gatePath, "utf8"));
  const binding = gate.evidenceBindings;
  if (!binding) return;
  assert.match(binding.privateCaseEvidenceSha256, /^[0-9a-f]{64}$/);
  assert.ok(binding.privateCaseRowCount > 0);
  assert.equal(typeof binding.roleModelCounts, "object");
  assert.deepEqual(Object.keys(binding.predictionFingerprintsByModel).sort(), [
    "B0b",
    "B1",
    "B2",
    "B3",
    "B4",
  ]);
  for (const key of [
    "expectedUniverseFingerprint",
    "scoreableUniverseFingerprint",
    "actualFingerprint",
    "targetAvailabilityFingerprint",
    "strataFingerprint",
    "internalIntervalFingerprint",
    "materializationEvidenceDigest",
    "conditionEvidenceDigest",
  ]) {
    assert.match(binding[key], /^[0-9a-f]{64}$/, key);
  }
  assert.ok(Object.keys(binding.sourceSha256).length >= 9);
  assert.ok(Object.keys(binding.nonSelfPublicEvidenceSha256).length >= 7);
  assert.equal(binding.trackedPrivateArtifactCount, 0);
});

test("Gate A validation receipt contains process evidence, not self-reported command names", () => {
  const gatePath = path.join(
    root,
    "docs",
    "analysis",
    "m2-real-data",
    "M2-calibration-gate-a-v1.json",
  );
  if (!existsSync(gatePath)) return;
  const gate = JSON.parse(readFileSync(gatePath, "utf8"));
  if (!gate.validationReceipt) return;
  const normal =
    gate.validationReceipt.commandResults ?? gate.validationReceipt.results?.successful;
  const failClosed =
    gate.validationReceipt.expectedFailClosedCommandResults ??
    gate.validationReceipt.results?.expectedFailClosed;
  assert.ok(Array.isArray(normal) && normal.length >= 9);
  assert.ok(Array.isArray(failClosed) && failClosed.length === 3);
  for (const item of [...normal, ...failClosed]) {
    assert.equal(typeof item, "object");
    assert.equal(typeof item.command, "string");
    assert.equal(Number.isInteger(item.exitCode), true);
    assert.match(item.stdoutSha256, /^[0-9a-f]{64}$/);
    assert.match(item.stderrSha256, /^[0-9a-f]{64}$/);
    assert.equal(Number.isInteger(item.stdoutBytes), true);
    assert.equal(Number.isInteger(item.stderrBytes), true);
  }
  assert.ok(normal.every((item) => item.exitCode === 0));
  assert.ok(failClosed.every((item) => item.exitCode !== 0));
  assert.equal(gate.gateAContentConditions.allPhaseAValidationPassed, true);
  assert.match(gate.validationReceipt.validatedIndexTree, /^[0-9a-f]{40}$/);
  assert.match(gate.validationReceipt.phaseAStartHead, /^[0-9a-f]{40}$/);
});

test("Gate A content conditions are backed by executable evidence and the exact spec set", () => {
  const gatePath = path.join(
    root,
    "docs",
    "analysis",
    "m2-real-data",
    "M2-calibration-gate-a-v1.json",
  );
  if (!existsSync(gatePath)) return;
  const gate = JSON.parse(readFileSync(gatePath, "utf8"));
  const expected = spec.GateA.requiredTrueItems.filter(
    (item) => item !== "phaseACheckpointCommittedAndPushed",
  );
  assert.deepEqual(Object.keys(gate.gateAContentConditions).sort(), expected.sort());
  const evidenceNames = expected.filter(
    (item) => item !== "allPhaseAValidationPassed",
  );
  assert.deepEqual(Object.keys(gate.conditionEvidence).sort(), evidenceNames.sort());
  for (const name of evidenceNames) {
    const checks = gate.conditionEvidence[name];
    assert.equal(typeof checks, "object", `${name} must have evidence`);
    assert.ok(Object.keys(checks).length > 0, `${name} evidence may not be empty`);
    assert.ok(
      Object.values(checks).every((value) => value === true),
      `${name} may not be raised by a partial or self-reported check`,
    );
    assert.equal(gate.gateAContentConditions[name], true);
  }
  assert.equal(gate.C1MayStartNow, false);
  assert.equal(gate.runtimeReceiptRequired, true);
  assert.equal(gate.seals.truthBuilderCallsForThoseBlocks, 0);
  assert.equal(
    gate.seals.sealedRoleRejectionCount,
    gate.seals.sealedBlockAttemptCount,
  );
  assert.equal(
    gate.seals.developmentRoleMasqueradeRejectionCount,
    gate.seals.sealedBlockAttemptCount,
  );
});

test("post-push verifier requires remote SHA, reruns validation, and independently recomputes Gate evidence", () => {
  assert.match(runnerSource, /git[\s\S]*ls-remote/);
  assert.match(runnerSource, /execute_phase_a_validation_suite\(\)/);
  assert.match(runnerSource, /recompute_phase_a_runtime_evidence\(\)/);
  assert.match(runnerSource, /runtimeValidationReexecuted/);
  assert.match(runnerSource, /runtimeEvidenceIndependentlyRecomputed/);
  assert.match(runnerSource, /privateCaseEvidenceSha256/);
  assert.match(runnerSource, /predictionFingerprintsByModel/);
});

test("generated public reports remain deidentified and exclude interval endpoints", () => {
  const paths = [
    "M2-baseline-comparator-identity-correction-v1.json",
    "M2-calibration-population-coverage-v1.json",
    "M2-calibration-ready-for-modeling-v1.json",
    "M2-calibration-gate-a-v1.json",
  ].map((name) => path.join(root, "docs", "analysis", "m2-real-data", name));
  for (const reportPath of paths) {
    if (!existsSync(reportPath)) continue;
    const text = readFileSync(reportPath, "utf8").toLowerCase();
    assert.doesNotMatch(text, /data[\\/]private|private-output/);
    assert.doesNotMatch(text, /predictionintervalendpoint|internalintervalendpointspresent\"\s*:\s*true/);
    assert.doesNotMatch(text, /optimistic|pessimistic/);
  }
});
