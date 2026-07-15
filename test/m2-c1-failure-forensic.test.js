import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = process.cwd();
const reportPath = path.join(
  root,
  "docs",
  "analysis",
  "m2-real-data",
  "M2-C1-failure-root-cause-v1.json",
);

function runPython(...args) {
  return spawnSync(
    process.execPath,
    [
      "scripts/run-codex-python.mjs",
      "scripts/m2-real-data/run_m2_c1_failure_forensic.py",
      ...args,
    ],
    { cwd: root, encoding: "utf8" },
  );
}

test("C1 forensic preflight proves units, weights, and sparse positive-median inflation", () => {
  const result = runPython("--preflight");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout.trim());
  assert.equal(payload.status, "passed");
  assert.equal(payload.privateDataRead, false);
  assert.equal(payload.finalHoldoutOpened, false);
  assert.equal(payload.syntheticSparseMonthlyInflationRobustVsTrailingMean, 12);
  assert.equal(Object.values(payload.checks).every(Boolean), true);
});

test("C1 forensic report freezes FAIL without changing the candidate or gate", (context) => {
  if (!fs.existsSync(reportPath)) {
    context.skip("C1 forensic report has not been generated on this machine");
    return;
  }
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  assert.equal(report.schema, "m2.c1_failure_root_cause.v1");
  assert.equal(report.engineeringErrorFound, false);
  assert.equal(report.C1RerunPerformed, false);
  assert.equal(report.C1FinalStatus, "FAIL");
  assert.equal(report.rootCause.gateOrPopulationChanged, false);
  assert.equal(report.implementationChecks.monthlyToHorizonScalingBugFound, false);
  assert.equal(report.implementationChecks.channelWorkDoubleCountingFound, false);
});

test("C1 fallback attribution covers all origins and all 148 candidates", (context) => {
  if (!fs.existsSync(reportPath)) {
    context.skip("C1 forensic report has not been generated on this machine");
    return;
  }
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  assert.equal(report.fallbackAttribution.length, 5);
  for (const origin of report.fallbackAttribution) {
    const rejected = Object.values(origin.primaryRejectionReasonDistribution).reduce(
      (total, value) => total + value,
      0,
    );
    assert.equal(rejected, 148);
    assert.equal(origin.recordedBiasFeasibleCandidateCount, 0);
  }
});

test("C1 forensic public report is aggregate-only and all seals remain closed", (context) => {
  if (!fs.existsSync(reportPath)) {
    context.skip("C1 forensic report has not been generated on this machine");
    return;
  }
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  assert.equal(report.decisionStatus, "not_for_formal_decision");
  assert.deepEqual(report.seals, {
    deferred60MonthLabelsOpened: false,
    embargoShadowOpened: false,
    finalHoldoutOpened: false,
  });
  assert.equal(report.privacy.aggregateOnly, true);
  assert.equal(report.privacy.predictionIntervalEndpointsPresent, false);
});
