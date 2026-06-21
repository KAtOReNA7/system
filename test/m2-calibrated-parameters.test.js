import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";
import {
  CALIBRATED_NON_FORMAL_PARAMETER_PROFILE,
  DEFAULT_EVALUATION_PARAMETER_PROFILE,
  resolveEvaluationParameterProfile
} from "../src/domain/oldProductEvaluation/evaluationParameters.js";
import { M2_C0_CLEANED_BILL_CALIBRATED_PARAMETERS } from "../src/domain/oldProductEvaluation/calibratedParameters.js";
import { buildFixtureOldProductEvaluationDataset } from "../src/domain/oldProductEvaluation/fixtureEngine.js";
import { forbiddenM2OldProductOutputTokens } from "./fixtures/m2OldProductEvaluationFixtureCases.js";

const execFileAsync = promisify(execFile);

const requiredDataReadinessSubtypes = [
  "missing_copyright_end",
  "copyright_date_conflict",
  "mapping_uncertainty",
  "missing_basic_info",
  "incomplete_month_boundary",
  "insufficient_revenue_history",
  "aggregate_projection_gap"
];

const requiredManualReviewReasons = [
  "mapping_uncertainty",
  "copyright_missing",
  "copyright_conflict",
  "abnormal_spike",
  "buyout_or_oneoff_income",
  "high_value_with_expiry",
  "high_value_with_data_gap",
  "insufficient_history",
  "channel_structure_unclear"
];

function assertNoForbiddenOutput(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  for (const token of forbiddenM2OldProductOutputTokens) {
    assert.equal(text.includes(token), false, `output leaked forbidden token: ${token}`);
  }
}

test("M2-C-3 calibrated parameters retain non-formal aggregate markers", () => {
  const parameters = M2_C0_CLEANED_BILL_CALIBRATED_PARAMETERS;

  assert.equal(parameters.version, "m2-c3-cleaned-bill-nonformal-v0.2");
  assert.equal(parameters.nonFormalCalibration, true);
  assert.equal(parameters.realDataAggregated, true);
  assert.equal(parameters.notForFormalDecision, true);
  assert.equal(parameters.sourceBoundary.aggregateOnly, true);
  assert.equal(parameters.sourceBoundary.rawDetailIncluded, false);
  assert.equal(parameters.riskCalibration.stage, "M2-C-3");
  assert.equal(parameters.riskCalibration.aggregateOnly, true);
  assert.equal(parameters.riskCalibration.notForFormalDecision, true);
  assertNoForbiddenOutput(parameters);
});

test("M2-C-3 data_readiness subtypes and manual review layering are explicit", () => {
  const calibration = M2_C0_CLEANED_BILL_CALIBRATED_PARAMETERS.riskCalibration;

  assert.deepEqual(calibration.dataReadinessSubtypes, requiredDataReadinessSubtypes);
  for (const reason of requiredManualReviewReasons) {
    assert.equal(
      calibration.manualReviewLayering.blockingReasons.includes(reason) ||
        calibration.manualReviewLayering.advisoryReasons.includes(reason),
      true,
      `${reason} should be represented in blocking or advisory review layering`
    );
  }
  assert.equal(
    calibration.manualReviewLayering.blockingPolicy.includes("Advisory reasons"),
    true
  );
});

test("M2-C-3 channel concentration rules are business-form and revenue-tier aware", () => {
  const channel = M2_C0_CLEANED_BILL_CALIBRATED_PARAMETERS.riskCalibration.channelConcentration;

  assert.equal(channel.selectedVariant, "candidate-a");
  assert.equal(channel.conservative.businessFormAware, true);
  assert.equal(channel.balanced.businessFormAware, true);
  assert.equal(channel.conservative.shareThreshold, 0.98);
  assert.equal(channel.conservative.riskRevenueFloor, 2700);
  assert.equal(channel.conservative.blockingManualReviewRevenueFloor, 16000);
  assert.equal(channel.conservative.lowRevenueConcentrationTreatment, "advisory");
  assert.equal(channel.balanced.riskRevenueFloor, 16000);
});

test("M2-C-3 forecast fallback and rating caps are bounded non-formal candidates", () => {
  const calibration = M2_C0_CLEANED_BILL_CALIBRATED_PARAMETERS.riskCalibration;

  assert.deepEqual(calibration.forecastFallback.missingCopyrightEndFallbackMonthsByLifecycle, {
    growth: 12,
    stable: 12,
    rebound: 12,
    declining: 9,
    long_tail: 6,
    inactive: 6,
    insufficient_history: 6
  });
  assert.equal(calibration.forecastFallback.highValueMissingCopyrightTreatment, "blocking_manual_review");
  assert.equal(calibration.forecastFallback.lowValueMissingCopyrightTreatment, "advisory_review");
  assert.deepEqual(calibration.ratingCaps.caps, {
    abnormal_spike: "A",
    buyout_or_oneoff_income: "A",
    missing_copyright_end: "B",
    copyright_date_conflict: "B",
    copyright_expiry: "A",
    insufficient_history: "C"
  });
  assert.equal(calibration.ratingCaps.capMeaning.includes("never upgrades"), true);
});

test("M2-C-3 fixture baseline remains isolated from calibrated profile", () => {
  const baseline = buildFixtureOldProductEvaluationDataset({
    profile: DEFAULT_EVALUATION_PARAMETER_PROFILE
  });
  const calibrated = buildFixtureOldProductEvaluationDataset({
    profile: CALIBRATED_NON_FORMAL_PARAMETER_PROFILE
  });
  const calibratedProfile = resolveEvaluationParameterProfile(CALIBRATED_NON_FORMAL_PARAMETER_PROFILE);

  assert.equal(baseline.engineSummary.parameterProfile, DEFAULT_EVALUATION_PARAMETER_PROFILE);
  assert.equal(baseline.engineSummary.realDataAggregated, false);
  assert.equal(calibrated.engineSummary.parameterProfile, CALIBRATED_NON_FORMAL_PARAMETER_PROFILE);
  assert.equal(calibrated.engineSummary.realDataAggregated, true);
  assert.equal(
    calibratedProfile.sourceParameterVersion,
    M2_C0_CLEANED_BILL_CALIBRATED_PARAMETERS.version
  );
  assertNoForbiddenOutput(baseline);
  assertNoForbiddenOutput(calibrated);
});

test("M2-C-3 dry-run CLI exposes variant and comparison flags without requiring product mode", async () => {
  const { stdout, stderr } = await execFileAsync("python", [
    "tools/m2-calibration/run_nonformal_dry_run.py",
    "--help"
  ]);

  assert.equal(stderr, "");
  assert.equal(stdout.includes("--variant"), true);
  assert.equal(stdout.includes("--compare-variants"), true);
  assert.equal(stdout.includes("baseline"), true);
  assert.equal(stdout.includes("candidate-a"), true);
  assert.equal(stdout.includes("candidate-b"), true);
  assertNoForbiddenOutput(stdout);
});

test("M2-C-3 non-formal implementation does not add write export task or formal product entrypoints", async () => {
  const [scriptSource, packageJson, parameterSource] = await Promise.all([
    readFile("tools/m2-calibration/run_nonformal_dry_run.py", "utf8"),
    readFile("package.json", "utf8"),
    readFile("src/domain/oldProductEvaluation/calibratedParameters.js", "utf8")
  ]);

  assert.equal(scriptSource.includes("connect("), false);
  assert.equal(scriptSource.includes("new Pool"), false);
  assert.equal(scriptSource.includes("new Client"), false);
  assert.equal(packageJson.includes("formal:evaluate"), false);
  assert.equal(parameterSource.includes("local_dry_run"), false);
  assertNoForbiddenOutput(scriptSource);
  assertNoForbiddenOutput(packageJson);
  assertNoForbiddenOutput(parameterSource);
});
