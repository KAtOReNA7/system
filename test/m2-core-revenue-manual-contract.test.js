import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  evaluateCapability,
  loadCapabilityCatalog
} from "../scripts/check-development-capability.mjs";
import {
  addMonths,
  buildM2CoreRevenueManualSyntheticDiagnostic,
  runCoreRevenueManualRolling,
  validateM2CoreRevenueManualConfig
} from "../src/domain/m2Current/coreRevenueManual.js";
import {
  determineCoreRevenueManualDecision,
  scoreCoreRevenuePairedComparison,
  scoreCoreRevenuePublicCell
} from "../src/domain/m2Current/coreRevenueManualEvaluation.js";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const config = readJson(
  "config/m2-current-core-revenue-manual.v0.1.json"
);
const fixture = readJson(
  "test/fixtures/m2-core-revenue-manual.synthetic.v0.1.json"
);
const diagnostic = readJson(
  "docs/analysis/m2-current/"
    + "M2-core-revenue-manual-public-diagnostic-v0.1.json"
);

test("core-revenue manual contract freezes target, population and formula", () => {
  assert.equal(validateM2CoreRevenueManualConfig(config), true);
  assert.equal(config.model.stableModelId, "M2-WORK-CRMR01");
  assert.equal(
    config.model.experimentId,
    "M2-EXP-CORE-REVENUE-MANUAL-01"
  );
  assert.equal(config.target.calendarField, "billMonth");
  assert.equal(
    config.target.actualDefinitionId,
    "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01"
  );
  assert.deepEqual(
    config.coreSelection.populations.map((item) => [
      item.id,
      item.minimumCumulativeReferenceRevenueShare
    ]),
    [
      ["CORE80", 0.8],
      ["CORE90", 0.9]
    ]
  );
  assert.equal(config.eligibility.minimumCompleteMonths, 3);
  assert.equal(config.formula.forecasts.F3, "M1 * 3");
  assert.equal(config.formula.forecasts.F6, "S6");
  assert.equal(config.longTermMultiplier.hardClampAllowed, false);
  assert.equal(config.longTermMultiplier.fixedSupportThresholdAllowed, false);
  assert.deepEqual(
    config.evaluation.horizonsMonths,
    [3, 6, 12, 36]
  );
  assert.equal(config.evaluation.bootstrap.iterations, 2000);
});

test("canonical synthetic diagnostic matches every frozen expectation", () => {
  const generated = buildM2CoreRevenueManualSyntheticDiagnostic(
    fixture,
    config
  );
  assert.deepEqual(generated, diagnostic);
  assert.equal(generated.status, "SYNTHETIC_DIAGNOSTIC_PASS");
  assert.equal(generated.boundaries.privateArtifactRead, false);
  assert.equal(generated.boundaries.modelTrained, false);
  assert.equal(generated.boundaries.parameterTuned, false);
  for (const expected of fixture.forecastCases) {
    const actual = generated.forecasts.find(
      (item) => item.id === expected.id
    );
    assert.equal(actual.status, expected.expectedStatus);
    for (const [field, value] of Object.entries(
      expected.expected ?? {}
    )) {
      assert.equal(actual[field], value, `${expected.id}:${field}`);
    }
  }
});

test("rolling runner is input-order deterministic and excludes future features", () => {
  const rows = buildRollingRows(1);
  const forward = runCoreRevenueManualRolling({
    monthlyRows: rows,
    origins: ["2024-12"],
    config
  });
  const reversed = runCoreRevenueManualRolling({
    monthlyRows: [...rows].reverse(),
    origins: ["2024-12"],
    config
  });
  assert.deepEqual(reversed, forward);
  assert.equal(forward.caseRows.length, 20);
  assert.equal(forward.annualComponentRows.length, 15);
  assert.equal(forward.portfolioRows.length, 16);
  assert.equal(forward.portfolioAnnualRows.length, 12);
  assert.equal(
    forward.caseRows.every(
      (row) => (
        row.targetStartMonth === "2025-01"
        && row.channelUid !== "CH-FUTURE"
      )
    ),
    true
  );
  const changedFuture = runCoreRevenueManualRolling({
    monthlyRows: buildRollingRows(7),
    origins: ["2024-12"],
    config
  });
  assert.deepEqual(
    withoutActual(changedFuture.caseRows),
    withoutActual(forward.caseRows)
  );
  assert.notDeepEqual(
    changedFuture.caseRows.map((row) => row.actual),
    forward.caseRows.map((row) => row.actual)
  );
  const core80Portfolio = forward.portfolioRows.filter(
    (row) => row.populationId === "CORE80"
  );
  for (const horizon of config.evaluation.horizonsMonths) {
    const core = core80Portfolio.find((row) => (
      row.variant === "CORE_ONLY"
      && row.horizonMonths === horizon
    ));
    const full = core80Portfolio.find((row) => (
      row.variant === "CORE_PLUS_POOLED_TAIL"
      && row.horizonMonths === horizon
    ));
    assert.equal(full.actual, core.actual);
    assert.ok(full.servedEligibleActual > core.servedEligibleActual);
    assert.ok(full.pointEstimate > core.pointEstimate);
  }
});

test("authorization permits one development evaluation but no promotion", () => {
  assert.equal(config.authorization.publicContractAndImplementation, true);
  assert.equal(config.authorization.privateDevelopmentEvaluation, true);
  assert.equal(config.authorization.deterministicComparatorRebuild, true);
  for (const key of [
    "formulaTuning",
    "modelSelection",
    "activeCandidateChange",
    "automation",
    "production",
    "laterOrigin",
    "finalHoldout",
    "provider",
    "database",
    "canary",
    "full160",
    "release",
    "m3Formal",
    "pullRequestMerge"
  ]) {
    assert.equal(config.authorization[key], false, key);
  }
});

test("paired evaluation is deterministic and clusters complete works", () => {
  const pairs = Array.from({ length: 24 }, (_, index) => ({
    standardWorkId: `W-${String(index % 6).padStart(2, "0")}`,
    actual: 100 + index,
    candidatePointEstimate: 100 + index,
    baselinePointEstimate: 110 + index
  }));
  const first = scoreCoreRevenuePairedComparison(pairs, {
    iterations: 2000,
    seed: 20260728
  });
  const second = scoreCoreRevenuePairedComparison([...pairs].reverse(), {
    iterations: 2000,
    seed: 20260728
  });
  assert.equal(first.status, "COMPUTED");
  assert.equal(first.caseCount, 24);
  assert.equal(first.workCount, 6);
  assert.equal(first.bootstrap.clusterCount, 6);
  assert.equal(first.bootstrap.iterations, 2000);
  assert.deepEqual(second, first);
  assert.equal(first.candidate.wape, 0);
  assert.ok(first.relativeWapeFva > 0.99);
});

test("public cells suppress small populations without leaking metrics", () => {
  const rows = Array.from({ length: 29 }, (_, index) => ({
    standardWorkId: `W-${index}`,
    origin: "2024-01",
    actual: 10,
    pointEstimate: 9
  }));
  assert.deepEqual(scoreCoreRevenuePublicCell(rows), {
    status: "SUPPRESSED_PRIVACY_THRESHOLD",
    caseCount: 29,
    workCount: 29,
    originCount: 1,
    metrics: null
  });
  const computed = scoreCoreRevenuePublicCell([
    ...rows,
    {
      standardWorkId: "W-29",
      origin: "2024-01",
      actual: 10,
      pointEstimate: 9
    }
  ]);
  assert.equal(computed.status, "COMPUTED");
  assert.equal(computed.metrics.wape, 0.1);
});

test("decision states preserve pass, mixed and fail semantics", () => {
  const improved = {
    status: "COMPUTED",
    relativeWapeFva: 0.02,
    absoluteBiasDelta: 0
  };
  assert.equal(determineCoreRevenueManualDecision({
    populationComparisons: [{
      primary: improved,
      strict: improved,
      timeStability: {
        improvedYearCount: 2,
        singleYearDriven: false
      }
    }],
    anyMaterialSliceImprovement: true,
    longTermUncontrolled: false
  }).status, "M2_CORE_REVENUE_MANUAL_BASELINE_PASS");
  assert.equal(determineCoreRevenueManualDecision({
    populationComparisons: [],
    anyMaterialSliceImprovement: true,
    longTermUncontrolled: false
  }).status, "M2_CORE_REVENUE_MANUAL_BASELINE_MIXED");
  assert.equal(determineCoreRevenueManualDecision({
    populationComparisons: [],
    anyMaterialSliceImprovement: false,
    longTermUncontrolled: false
  }).status, "M2_CORE_REVENUE_MANUAL_BASELINE_FAIL");
  assert.equal(determineCoreRevenueManualDecision({
    populationComparisons: [],
    anyMaterialSliceImprovement: true,
    longTermUncontrolled: true
  }).reason,
  "valid_evaluation_completed_long_term_compounding_uncontrolled");
});

test("synthetic fixture covers the frozen contract edge families", () => {
  assert.equal(fixture.coreSelectionCases.length, 2);
  assert.match(
    fixture.coreSelectionCases[0].id,
    /cross_year/u
  );
  assert.equal(
    fixture.forecastCases.some((item) => (
      item.id === "not_eligible_two_months"
    )),
    true
  );
  for (const slope of ["positive", "negative", "zero"]) {
    assert.equal(
      fixture.forecastCases.some((item) => item.id.includes(slope)),
      true
    );
  }
  assert.equal(
    fixture.kFallbackCases.map((item) => item.expectedSource).join(","),
    "CHANNEL_LEVEL2_CATEGORY,CHANNEL,ONE"
  );
  assert.equal(
    fixture.tailConservationCase.expectedCoreCash
      + fixture.tailConservationCase.expectedTailCash,
    fixture.tailConservationCase.expectedTotalCash
  );
});

test("public diagnostic validates without private execution", () => {
  const result = spawnSync(
    process.execPath,
    [
      path.join(
        root,
        "scripts",
        "m2-current",
        "run_m2_human_anchored_development.mjs"
      ),
      "--core-revenue-manual-public",
      "--verify"
    ],
    {
      cwd: root,
      encoding: "utf8"
    }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /core-revenue manual public diagnostic verified/u
  );
});

test("missing authority sources block only the private evaluation capability", () => {
  const catalog = loadCapabilityCatalog(
    path.join(
      root,
      "config",
      "development-capability-catalog.v0.1.json"
    )
  );
  const result = evaluateCapability(
    catalog,
    "m2-core-revenue-manual",
    {
      repoRoot: root,
      artifactExists: () => false,
      toolProbe: () => ({ present: true, versionText: "test" })
    }
  );
  assert.equal(result.status, "BLOCKED_MISSING_PRIVATE_ARTIFACT");
  assert.equal(result.coreDevelopmentUnaffected, true);
  assert.deepEqual(result.missingPrivateRoles, [
    "total-ledger-authority",
    "sales-share-ledger-authority",
    "buyout-ledger-authority",
    "m1-work-mapping-authority",
    "user-reviewed-channel-master"
  ]);
  assert.match(
    result.recovery,
    /derived caches and historical receipts must be rebuilt or warned/u
  );
});

function readJson(relativePath) {
  return JSON.parse(
    readFileSync(path.join(root, relativePath), "utf8")
  );
}

function buildRollingRows(futureMultiplier) {
  const works = [
    {
      standardWorkId: "W-A",
      channelUid: "CH-1",
      level2Category: "CAT-A",
      settlementMechanism: "membership",
      cash: 10
    },
    {
      standardWorkId: "W-B",
      channelUid: "CH-1",
      level2Category: "CAT-A",
      settlementMechanism: "membership",
      cash: 4
    },
    {
      standardWorkId: "W-C",
      channelUid: "CH-2",
      level2Category: "CAT-B",
      settlementMechanism: "transactional",
      cash: 2
    }
  ];
  const rows = [];
  for (let offset = 0; offset < 60; offset += 1) {
    const month = addMonths("2023-01", offset);
    const multiplier = month > "2024-12" ? futureMultiplier : 1;
    for (const work of works) {
      rows.push({
        ...work,
        month,
        cash: work.cash * multiplier
      });
    }
    if (month > "2024-12") {
      rows.push({
        standardWorkId: "W-A",
        channelUid: "CH-FUTURE",
        level2Category: "CAT-A",
        settlementMechanism: "membership",
        month,
        cash: 1000 * multiplier
      });
    }
  }
  return rows;
}

function withoutActual(rows) {
  return rows.map(({ actual: _actual, ...row }) => row);
}
