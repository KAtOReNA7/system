import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runner = "scripts/m2-real-data/run_m2_c2r_development_validation.py";
const python = "scripts/run-codex-python.mjs";
const reportPath = path.join(
  root,
  "docs/analysis/m2-real-data/M2-C2R-development-validation-v1.json",
);
const routingPath = path.join(
  root,
  "docs/analysis/m2-real-data/M2-C2R-revenue-model-routing-manifest-v1.json",
);
const channelPath = path.join(
  root,
  "docs/analysis/m2-real-data/M2-C2R-channel-reconciliation-v1.json",
);

const preflightProcess = spawnSync(
  process.execPath,
  [python, runner, "--preflight"],
  { cwd: root, encoding: "utf8" },
);
assert.equal(preflightProcess.status, 0, preflightProcess.stderr);
const preflight = JSON.parse(preflightProcess.stdout.trim().split(/\r?\n/).at(-1));

test("C2-R route-as-of preflight covers all four isolated routes", () => {
  assert.equal(preflight.checks.candidateCount38, true);
  assert.equal(preflight.checks.allFourRoutesCovered, true);
  assert.equal(preflight.checks.zeroAwareMedianIncludesZeroMonths, true);
});

test("C2-R buyout-event route never assumes a future renewal", () => {
  assert.equal(preflight.checks.pureBuyoutDoesNotAssumeRenewal, true);
});

test("C2-R mixed route explicitly excludes future buyout", () => {
  assert.equal(preflight.checks.mixedExcludesFutureBuyout, true);
});

test("C2-R channel forecasts reconcile to the work point", () => {
  assert.equal(preflight.checks.channelAggregationReconciles, true);
  assert.equal(
    preflight.checks.shortHistorySelectedCandidateReconcilesWithEffectiveB4,
    true,
  );
  assert.equal(
    preflight.checks.seasonalNaive12UsesB4WhenTrueLag12Unavailable,
    true,
  );
  assert.equal(
    preflight.checks.seasonalNaive12UsesExactLag12WhenAvailable,
    true,
  );
});

test("C2-R future perturbation leaves every as-of prediction unchanged", () => {
  assert.equal(preflight.checks.futurePerturbationInvariant, true);
  assert.equal(preflight.checks.allCandidatesFuturePerturbationCovered, true);
  assert.equal(preflight.checks.allRouteHorizonFuturePerturbationCovered, true);
});

test("C2-R blocked serving is null, unavailable, and explained", () => {
  assert.equal(
    preflight.checks.blockedServingIsNullUnavailableAndExplained,
    true,
  );
  assert.equal(preflight.checks.unknownProductPointIsNull, true);
  assert.equal(preflight.checks.publicFieldsExact, true);
});

test("C2-R final-holdout entry remains fail-closed", () => {
  const result = spawnSync(
    process.execPath,
    [python, runner, "--run-final-holdout"],
    { cwd: root, encoding: "utf8" },
  );
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /sealed|fail-closed/i);
});

test("legacy-target C2-R development write entry remains fail-closed", () => {
  const result = spawnSync(
    process.execPath,
    [python, runner, "--run-development"],
    { cwd: root, encoding: "utf8" },
  );
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /superseded|fail-closed/i);
});

test("C2-R report preserves case keys, scoring states, and sealed truth", (t) => {
  if (!fs.existsSync(reportPath)) {
    t.skip("C2-R development report has not been generated on this machine");
    return;
  }
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  assert.equal(report.decisionStatus, "not_for_formal_decision");
  assert.equal(report.structuralValidation.caseKeysAndActualsMatchB4, true);
  assert.equal(report.structuralValidation.scoreabilityAndServingStateMatchB4, true);
  assert.equal(report.structuralValidation.rawPredictionCompleteOnAllScoreable, true);
  assert.equal(report.structuralValidation.servedNullIffAbstained, true);
  assert.equal(report.channelReconciliation.allWorkForecastsStrictlyReconciled, true);
  assert.equal(
    report.structuralValidation.C2ROwnFrozenIntervalProtocolPassed,
    true,
  );
  assert.equal(
    report.internalIntervalProtocol.candidateOwnResidualsOnly,
    true,
  );
  assert.ok(
    report.internalIntervalProtocol.observedMinimumCalibrationCount >=
      report.internalIntervalProtocol.configuredMinimumCalibrationCount,
  );
  assert.equal(report.seals.finalHoldoutOpened, false);
  assert.equal(report.seals.embargoShadowOpened, false);
  assert.equal(report.seals.deferred60MonthLabelsOpened, false);
  assert.equal(report.releaseAuthorized, false);
});

test("C2-R public route cells apply primary and complementary suppression", (t) => {
  if (!fs.existsSync(routingPath)) {
    t.skip("C2-R routing report has not been generated on this machine");
    return;
  }
  const routing = JSON.parse(fs.readFileSync(routingPath, "utf8"));
  for (const grid of [
    routing.perOriginRouteDistribution,
    routing.perOriginRouteMetrics,
  ]) {
    for (const cells of Object.values(grid)) {
      const suppressed = Object.values(cells).filter((cell) => cell.suppressed);
      assert.ok(suppressed.length === 0 || suppressed.length >= 2);
      for (const cell of Object.values(cells)) {
        if (cell.suppressed) {
          assert.equal(cell.caseCount, null);
          assert.equal(cell.uniqueWorkCount, null);
        } else {
          assert.ok(cell.caseCount >= 10);
          assert.ok(cell.uniqueWorkCount >= 10);
        }
      }
    }
  }
});

test("C2-R public channel report is deidentified and coverage-qualified", (t) => {
  if (!fs.existsSync(channelPath)) {
    t.skip("C2-R channel report has not been generated on this machine");
    return;
  }
  const channel = JSON.parse(fs.readFileSync(channelPath, "utf8"));
  assert.equal(channel.trueChannelNamesPresent, false);
  assert.equal(
    channel.knownComponentTruthIsAReconciliationAuditNotACompletenessClaim,
    true,
  );
  assert.ok(channel.perOriginChannelAudit);
  assert.ok(channel.deidentifiedPerChannelSignedBiasDistribution);
});
