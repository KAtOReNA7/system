import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = process.cwd();
const specPath = path.join(
  root,
  "src",
  "domain",
  "oldProductEvaluation",
  "calibrationSpec.v1.2.amendment.json",
);
const corePath = path.join(root, "scripts", "m2-real-data", "m2_calibration_v1_2.py");
const runnerPath = path.join(
  root,
  "scripts",
  "m2-real-data",
  "run_m2_c1_development_validation.py",
);
const reportPath = path.join(
  root,
  "docs",
  "analysis",
  "m2-real-data",
  "M2-C1-development-validation-v1.json",
);
const reportMarkdownPath = reportPath.replace(/\.json$/u, ".md");
const privateDir = path.join(
  root,
  "data",
  "private-output",
  "m2-calibration-v1-2",
);
const privateCasesPath = path.join(privateDir, "M2-C1-development-cases-private-v1.ndjson");
const privateManifestPath = path.join(
  privateDir,
  "M2-C1-development-manifest-private-v1.json",
);
const privateWorkbookPath = path.join(
  privateDir,
  "M2-C1-development-validation-private-v1.xlsx",
);
const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
const core = fs.readFileSync(corePath, "utf8");
const runner = fs.readFileSync(runnerPath, "utf8");

function runPython(...args) {
  return spawnSync(
    process.execPath,
    ["scripts/run-codex-python.mjs", "scripts/m2-real-data/run_m2_c1_development_validation.py", ...args],
    { cwd: root, encoding: "utf8" },
  );
}

function git(...args) {
  return spawnSync("git", args, { cwd: root, encoding: "utf8" });
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

test("C1 uses the shared v1.2 predict_as_of entry for held and forward points", () => {
  assert.match(core, /if model_id == "C1":/u);
  assert.match(core, /def _predict_c1_as_of\(/u);
  assert.match(runner, /v12\.predict_as_of\([\s\S]*?"C1"/u);
  assert.match(runner, /samePredictAsOfEntryUsed/u);
  assert.doesNotMatch(core, /statisticallyScoreable[^\n]*predict_as_of\(/u);
});

test("the eight transparent components and 148-candidate grid remain frozen", () => {
  assert.equal(spec.C1.allowedComponents.length, 8);
  assert.equal(spec.C1.componentCap, 3);
  assert.equal(spec.C1.candidateEnumeration.expectedTotalCandidateCount, 148);
  assert.equal(spec.C1.candidateEnumeration.singleComponentCount, 8);
  assert.equal(spec.C1.candidateEnumeration.twoComponentCandidateCount, 84);
  assert.equal(spec.C1.candidateEnumeration.equalWeightThreeComponentCount, 56);
  assert.match(core, /def enumerate_c1_candidates\(/u);
  assert.match(core, /def c1_component_monthly_values\(/u);
});

test("nested selection is earlier-origin only and applies bias feasibility first", () => {
  assert.equal(spec.C1.training.method, "nested_expanding_origin");
  assert.equal(spec.C1.training.minimumInnerScoreOrigins, 2);
  assert.equal(spec.C1.training.minimumInnerCaseCount, 200);
  assert.equal(spec.C1.training.biasFeasibilityGuard.applyBeforeObjectiveRanking, true);
  assert.match(runner, /v12\.strict_case_key\(row\)\[1\] < outer_origin/u);
  assert.match(runner, /label_available_as_of[^\n]*<= outer_origin/u);
  assert.match(runner, /prior_candidate_selection_complete[\s\S]*held_prediction_lock_created[\s\S]*held_truth_join_complete/u);
});

test("C1 routing keeps buyout fixed and ensembles sales by component", () => {
  assert.equal(spec.C1.routePolicy.pure_sales_share, "component_ensemble_per_channel_then_sum");
  assert.equal(spec.C1.routePolicy.pure_buyout, "frozen_historical_cycle_monthly_equivalent_no_ensemble_fit");
  assert.equal(spec.C1.routePolicy.buyout_plus_sales, "component_ensemble_on_sales_only");
  assert.equal(spec.C1.routePolicy.unknown_revenue_model, "never_served");
  assert.match(core, /buyoutMonthsExcludedFromSalesHistory/u);
});

test("C1 acceptance thresholds are immutable and include strict bootstrap superiority", () => {
  const gates = spec.C1AcceptanceGates;
  assert.equal(gates.overallWapeMaximum, 0.6);
  assert.equal(gates.overallServedAndHighValueAbsoluteSignedBiasMaximum, 0.1);
  assert.equal(gates.eachCoreHorizonAbsoluteSignedBiasMaximum, 0.15);
  assert.equal(gates.top1Top5WapeRelativeRegressionVsPrimaryMaximum, 0.05);
  assert.deepEqual(gates.internal80CoverageInclusive, [0.75, 0.85]);
  assert.equal(gates.pairedBootstrapSuperiorityVsPrimary.requiredUpperBoundExclusive, 0);
  assert.equal(gates.thresholdsMayBeChangedAfterResults, false);
  assert.match(runner, /thresholdsChangedAfterResults": False/u);
});

test("C1 intervals use only C1 earlier residuals and never expose endpoints", () => {
  assert.equal(spec.C1.internal80Interval.modelOwnResidualsOnly, true);
  assert.equal(spec.C1.internal80Interval.baselineResidualMayBeReused, false);
  assert.equal(spec.C1.internal80Interval.publicEndpointOutputAllowed, false);
  assert.match(runner, /correction\.apply_corrected_internal_intervals\([\s\S]*?\[\*warmup, \*forward\]/u);
  assert.match(runner, /"baselineResidualReused": False/u);
});

test("synthetic C1 preflight covers every candidate, route, and core horizon", () => {
  const result = runPython("--preflight");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout.trim().split(/\r?\n/u)[0]);
  assert.equal(payload.status, "passed");
  assert.equal(payload.privateDataRead, false);
  assert.equal(payload.GateReceiptRead, false);
  assert.equal(payload.futurePerturbation.candidateParameterCaseCount, 148);
  assert.equal(payload.futurePerturbation.routeHorizonCaseCount, 20);
  assert.equal(payload.futurePerturbation.allRevenueRoutesCovered, true);
  assert.equal(payload.finalHoldoutOpened, false);
});

test("C1 final-holdout mode fails closed before a data load", () => {
  const result = runPython("--run-final-holdout");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /final holdout/iu);
  assert.match(result.stderr.replaceAll(" ", ""), /dataLoadCalls=0/iu);
  assert.doesNotMatch(result.stderr, /loading the authorized/iu);
});

test("development report stays non-formal, sealed, and aggregate-only", (context) => {
  if (!fs.existsSync(reportPath)) {
    context.skip("C1 development report has not been generated yet");
    return;
  }
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  assert.equal(report.schema, "m2.c1_development_validation.v1");
  assert.equal(report.decisionStatus, "not_for_formal_decision");
  assert.equal(report.formalDecisionAuthorized, false);
  assert.equal(report.releaseAuthorized, false);
  assert.ok(["PASS", "FAIL"].includes(report.C1DevelopmentResult));
  assert.deepEqual(report.seals, {
    deferred60MonthLabelsOpened: false,
    embargoShadowOpened: false,
    finalHoldoutOpened: false,
  });
  assert.equal(report.privacy.aggregateOnly, true);
  assert.equal(report.privacy.predictionIntervalEndpointsPresent, false);
});

test("generated C1 report uses the exact frozen case populations", (context) => {
  if (!fs.existsSync(reportPath)) {
    context.skip("C1 development report has not been generated yet");
    return;
  }
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  assert.equal(report.developmentPopulation.expectedCaseCount, 18615);
  assert.equal(report.developmentPopulation.scoreableCaseCount, 12223);
  assert.equal(report.developmentPopulation.scoreableWorkCount, 1044);
  assert.equal(report.structuralValidation.caseKeysAndActualsMatchPrimary, true);
  assert.equal(report.structuralValidation.rawPredictionCompleteOnAllScoreable, true);
  assert.equal(report.structuralValidation.zeroImputationDisabled, true);
});

test("all five outer origins have one preregistered global candidate", (context) => {
  if (!fs.existsSync(reportPath)) {
    context.skip("C1 development report has not been generated yet");
    return;
  }
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  assert.equal(report.outerOriginCandidateSelection.length, 5);
  for (const selection of report.outerOriginCandidateSelection) {
    assert.equal(selection.candidateSpaceCount, 148);
    assert.equal(selection.sameOrLaterOuterTruthRead, false);
    assert.equal(selection.warmupUsedForCandidateSelection, false);
    assert.equal(selection.finalHoldoutRead, false);
    if (selection.maximumInnerLabelAvailableAsOf !== null) {
      assert.ok(selection.maximumInnerLabelAvailableAsOf <= selection.outerOrigin);
    }
  }
});

test("served metrics remain complementarily suppressed in the public report", (context) => {
  if (!fs.existsSync(reportPath)) {
    context.skip("C1 development report has not been generated yet");
    return;
  }
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  assert.equal(report.metrics.C1.served.suppressed, true);
  assert.equal(report.metrics.C1.served.wape, null);
  assert.equal(report.metrics.C1.abstention.suppressed, true);
  assert.equal(report.acceptance.evidence.absoluteBias.served, null);
  assert.equal(report.acceptance.evidence.servedBiasProtectedByComplementarySuppression, true);
});

test("public C1 artifacts contain no identifiers, private paths, or PI endpoints", (context) => {
  if (!fs.existsSync(reportPath)) {
    context.skip("C1 development report has not been generated yet");
    return;
  }
  const text = `${fs.readFileSync(reportPath, "utf8")}\n${fs.readFileSync(reportMarkdownPath, "utf8")}`.toLowerCase();
  for (const forbidden of [
    "data/private",
    "private-output",
    "standard_work_id",
    "channel_key",
    ".xlsx",
    "optimistic",
    "pessimistic",
    "high/base/low",
    '"internalinterval"',
  ]) {
    assert.equal(text.includes(forbidden), false, forbidden);
  }
  assert.doesNotMatch(text, /[a-z]:[\\/]/u);
});

test("C1 public outputs retain one point, annual breakdown, confidence, and limitations only", (context) => {
  if (!fs.existsSync(reportPath)) {
    context.skip("C1 development report has not been generated yet");
    return;
  }
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  assert.equal(report.issueAndProductBoundary.publicOutputFieldsExact, true);
  assert.equal(report.issueAndProductBoundary.singlePointForecastOnly, true);
  assert.equal(report.issueAndProductBoundary.publicPredictionIntervalEndpointsAbsent, true);
  assert.equal(report.issueAndProductBoundary.automaticOperatingActionFieldCount, 0);
});

test("C1 acceptance reports every fixed gate without relaxing thresholds", (context) => {
  if (!fs.existsSync(reportPath)) {
    context.skip("C1 development report has not been generated yet");
    return;
  }
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  assert.equal(Object.keys(report.acceptance.conditions).length, 19);
  assert.equal(report.acceptance.thresholdsChangedAfterResults, false);
  assert.equal(report.contractBinding.candidateSpaceOrThresholdChangedAfterResults, false);
  const expected = Object.values(report.acceptance.conditions).every(Boolean) && report.allStructuralValidationPassed;
  assert.equal(report.C1DevelopmentResult, expected ? "PASS" : "FAIL");
});

test("ignored C1 cases and manifest round-trip and remain untracked", (context) => {
  if (!fs.existsSync(privateManifestPath)) {
    context.skip("ignored C1 evidence is unavailable on this machine");
    return;
  }
  const manifest = JSON.parse(fs.readFileSync(privateManifestPath, "utf8"));
  assert.equal(manifest.schema, "m2.c1_development_private_manifest.v1");
  assert.equal(manifest.privateCaseRowCount, 18615);
  assert.equal(manifest.scoreableCaseCount, 12223);
  assert.equal(manifest.caseEvidenceSha256, sha256(privateCasesPath));
  assert.equal(manifest.publicReportSha256, sha256(reportPath));
  assert.equal(manifest.privateWorkbookSha256, sha256(privateWorkbookPath));
  assert.equal(manifest.tracked, false);
  for (const file of [privateCasesPath, privateManifestPath, privateWorkbookPath]) {
    assert.equal(git("check-ignore", "--quiet", "--", file).status, 0, file);
    assert.equal(git("ls-files", "--error-unmatch", "--", file).status, 1, file);
  }
});

test("the C1 verifier independently recomputes metrics and acceptance", () => {
  assert.match(runner, /def verify_development_evidence\(/u);
  assert.match(runner, /phase\.metrics_for_model\(rows\)/u);
  assert.match(runner, /v12\.paired_relative_block_bootstrap\(/u);
  assert.match(runner, /evaluate_acceptance\(/u);
  assert.match(runner, /acceptanceEvidenceDigest[\s\S]*?_public_value\(acceptance\)/u);
  assert.match(runner, /C1 acceptance decision does not independently recompute/u);
});

test("C1 does not authorize C2-R, C2, C3, release, or M3", (context) => {
  if (!fs.existsSync(reportPath)) {
    context.skip("C1 development report has not been generated yet");
    return;
  }
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  assert.match(report.nextBoundary, /^stop_after_C1_/u);
  assert.equal(report.releaseAuthorized, false);
  assert.equal(report.formalDecisionAuthorized, false);
});
