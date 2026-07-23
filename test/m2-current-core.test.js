import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildM2CurrentCaseKey,
  summarizeM2CurrentCaseUniverse
} from "../src/domain/m2Current/case.js";
import {
  compareM2CurrentCandidateToB4
} from "../src/domain/m2Current/comparator.js";
import {
  evaluateM2CurrentDiagnosticGate
} from "../src/domain/m2Current/gate.js";
import {
  loadM2CurrentPublicEvidence
} from "../src/domain/m2Current/loader.js";
import {
  scoreM2CurrentPointRows,
  scoreM2CurrentSlices
} from "../src/domain/m2Current/metrics.js";
import {
  buildM2CurrentFormalCashTarget,
  serveM2CurrentPointForecast
} from "../src/domain/m2Current/target.js";

function publicSources() {
  const config = readJson("config/m2-current.v0.1.json");
  return Object.fromEntries(
    Object.entries(config.publicSources)
      .map(([role, file]) => [role, readJson(file)])
  );
}

function row(overrides = {}) {
  return {
    standardWorkId: "SYN-WORK-1",
    origin: "2022-12",
    horizonMonths: 3,
    route: "sales_share",
    actual: 100,
    pointEstimate: 90,
    segment: "dense",
    ...overrides
  };
}

test("public loader freezes population, coverage, segments, decisions and seals", () => {
  const evidence = loadM2CurrentPublicEvidence(publicSources());

  assert.deepEqual(evidence.population, {
    libraryWorkCount: 3053,
    modelWorkCount: 824,
    modelCaseCount: 7851,
    modelWorkShare: 824 / 3053
  });
  assert.equal(evidence.coverage.fullLibrary, 0.7396468495203204);
  assert.equal(evidence.coverage.top10, 0.7594125279899511);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(evidence.segments).map(([key, value]) => [key, value.caseCount])
    ),
    { dense: 5174, dormant: 833, intermittent: 1844 }
  );
  assert.equal(evidence.modelQualityDecision, "FAIL");
  assert.equal(evidence.businessCoverageDecision, "CONDITIONAL");
  assert.equal(Object.values(evidence.seals).some(Boolean), false);
});

test("case universe is unique and limited to frozen horizons", () => {
  assert.equal(
    buildM2CurrentCaseKey(row()),
    "SYN-WORK-1|2022-12|3|sales_share"
  );
  assert.deepEqual(
    summarizeM2CurrentCaseUniverse([
      row(),
      row({
        standardWorkId: "SYN-WORK-2",
        horizonMonths: 24
      })
    ]),
    {
      caseCount: 2,
      uniqueWorkCount: 2,
      horizons: { 3: 1, 24: 1 }
    }
  );
  assert.throws(
    () => buildM2CurrentCaseKey(row({ horizonMonths: 60 })),
    /horizon_not_allowed/u
  );
  assert.throws(
    () => summarizeM2CurrentCaseUniverse([row(), row()]),
    /duplicate_case_key/u
  );
});

test("formal cash target conserves three actual roles", () => {
  assert.deepEqual(
    buildM2CurrentFormalCashTarget({
      salesCashActual: 80,
      committedCashActual: 20,
      uncommittedBuyoutSurpriseActual: 15
    }),
    {
      forecastableCashActual: 100,
      uncommittedBuyoutSurpriseActual: 15,
      totalLedgerCashActual: 115
    }
  );
});

test("pure buyout without an as-of commitment abstains instead of serving zero", () => {
  const forecast = serveM2CurrentPointForecast({
    businessForm: "pure_buyout",
    commitmentKnownAsOfCutoff: false
  });

  assert.equal(forecast.pointEstimate, null);
  assert.equal(forecast.abstained, true);
  assert.equal(forecast.pointEstimateOnly, true);
  assert.equal(forecast.scenarioFieldsIncluded, false);
  assert.equal(forecast.predictionIntervalEndpointsIncluded, false);
});

test("point metrics and slice metrics do not use zero imputation", () => {
  const rows = [
    row(),
    row({
      standardWorkId: "SYN-WORK-2",
      actual: 50,
      pointEstimate: 60,
      segment: "intermittent"
    })
  ];
  const metrics = scoreM2CurrentPointRows(rows);
  const slices = scoreM2CurrentSlices(rows, "segment");

  assert.equal(metrics.wape, 20 / 150);
  assert.equal(metrics.signedBias, 0);
  assert.equal(metrics.zeroImputationUsed, false);
  assert.deepEqual(Object.keys(slices), ["dense", "intermittent"]);
  assert.throws(
    () => scoreM2CurrentPointRows([row({ pointEstimate: null })]),
    /point_estimate_invalid/u
  );
});

test("candidate comparison requires exact case and actual parity", () => {
  const comparison = compareM2CurrentCandidateToB4(
    [row({ pointEstimate: 90 })],
    [row({ pointEstimate: 80 })]
  );

  assert.equal(comparison.caseKeyParity, true);
  assert.equal(comparison.actualParity, true);
  assert.equal(comparison.candidate.wape, 0.1);
  assert.equal(comparison.b4.wape, 0.2);
  assert.equal(comparison.relativeWape, -0.5);
  assert.throws(
    () => compareM2CurrentCandidateToB4(
      [row({ actual: 99 })],
      [row({ actual: 100 })]
    ),
    /actual_mismatch/u
  );
});

test("baseline diagnostic is blocked by coverage, failed quality and sealed holdout", () => {
  const gate = evaluateM2CurrentDiagnosticGate(
    loadM2CurrentPublicEvidence(publicSources())
  );

  assert.equal(gate.status, "BASELINE_ONLY_BLOCKED");
  assert.ok(gate.blockers.includes("full_library_cash_coverage_below_90pct"));
  assert.ok(gate.blockers.includes("top10_cash_coverage_below_90pct"));
  assert.ok(gate.blockers.includes("latest_model_quality_failed"));
  assert.ok(gate.blockers.includes("final_holdout_sealed"));
  assert.equal(gate.modelTrainingAuthorized, false);
  assert.equal(gate.releaseAuthorized, false);
});

test("public diagnostic CLI is reproducible and aggregate-only", () => {
  const report = JSON.parse(
    execFileSync(
      process.execPath,
      ["scripts/m2-current/run_m2_current_public_diagnostics.mjs"],
      { encoding: "utf8", windowsHide: true }
    )
  );
  const text = JSON.stringify(report);

  assert.equal(report.schema, "m2.current.public_diagnostic_report.v0.1");
  assert.equal(report.directionAssessment.engineeringSequenceDrifted, true);
  assert.equal(report.gate.releaseAuthorized, false);
  assert.doesNotMatch(text, /data\/private-/u);
  assert.doesNotMatch(text, /postgres(?:ql)?:\/\//u);
  assert.doesNotMatch(text, /standardWorkId/u);

  assert.equal(
    execFileSync(
      process.execPath,
      ["scripts/m2-current/run_m2_current_public_diagnostics.mjs", "--verify"],
      { encoding: "utf8", windowsHide: true }
    ).trim(),
    "M2 current public diagnostic output verified."
  );
});

test("current config archives failed routes and grants no downstream authority", () => {
  const config = readJson("config/m2-current.v0.1.json");

  assert.deepEqual(
    config.archiveOnlyDevelopmentRoutes,
    ["C1", "C2-R", "C2-R.1", "C2", "C3"]
  );
  assert.equal(Object.values(config.authorizations).some(Boolean), false);
  assert.equal(config.primaryComparator, "B4_formula_switched_legacy_variant");
  assert.equal(config.publicOutput, "docs/analysis/m2-current/M2-current-public-diagnostic-baseline-v0.1.json");
});

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}
