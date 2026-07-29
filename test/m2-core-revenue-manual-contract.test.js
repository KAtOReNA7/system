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

test("core-revenue manual contract freezes target, population and formula", () => {
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
        "run_m2_core_revenue_manual.mjs"
      ),
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
    /core-revenue manual public contract verified/u
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
