import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  assertM2LayeredRevenuePublicSafe,
  buildM2LayeredRevenueSyntheticDiagnostic,
  classifyM2LayeredRevenueActual,
  decomposeM2LayeredRevenueActual,
  validateM2LayeredRevenueCompositionConfig
} from "../src/domain/m2Current/layeredRevenueComposition.js";

const config = readJson(
  "config/m2-current-layered-revenue-composition.v0.1.json"
);
const fixture = readJson(
  "test/fixtures/m2-layered-revenue-composition.synthetic.v0.1.json"
);

test("layered revenue contract freezes identity and authorization", () => {
  assert.equal(validateM2LayeredRevenueCompositionConfig(config), true);
  assert.equal(config.model.stableModelId, "M2-PORT-LRC01");
  assert.equal(
    config.model.experimentId,
    "M2-EXP-LAYERED-REVENUE-COMPOSITION-01"
  );
  assert.equal(config.coreSelection.primaryPopulation, "CORE90");
  assert.equal(config.retention.workLevelGrowthCompoundingAllowed, false);
  assert.equal(config.retention.fixedWorkCountEligibilityAllowed, false);
  assert.equal(config.experiments.L5B.primary, true);
  assert.equal(config.experiments.L6A.primary, true);
  assert.equal(config.evaluation.bootstrap.iterations, 2000);
  assert.equal(config.authorization.privateDevelopmentEvaluation, true);
  assert.equal(config.authorization.formulaTuning, false);
  assert.equal(config.authorization.production, false);
  assert.equal(config.authorization.pullRequestMerge, false);
});

test("four future cash components are exclusive and conserve money", () => {
  const result = decomposeM2LayeredRevenueActual({
    futureRows: fixture.futureRows,
    coreWorkIds: fixture.coreWorkIds,
    originVisiblePositiveWorkIds:
      fixture.originVisiblePositiveWorkIds,
    originVisiblePositiveWorkChannels:
      fixture.originVisiblePositiveWorkChannels
  });
  assert.deepEqual(result.components, {
    EXISTING_CORE: "1000",
    EXISTING_TAIL: "300",
    FUTURE_NEW_WORK: "200",
    EXISTING_WORK_NEW_CHANNEL: "100"
  });
  assert.equal(result.companyTotalMinor, "1600");
  assert.equal(result.conservationDifferenceMinor, "0");
  assert.equal(
    new Set(result.classifiedRows.map((row) => row.componentId)).size,
    4
  );
});

test("future new work takes precedence over future channel entry", () => {
  const component = classifyM2LayeredRevenueActual({
    workId: "UNSEEN",
    channelId: "NEW",
    coreWorkIds: new Set(),
    originVisiblePositiveWorkIds: new Set(),
    originVisiblePositiveWorkChannels: new Set()
  });
  assert.equal(component, "FUTURE_NEW_WORK");
});

test("public synthetic diagnostic proves boundaries without identities", () => {
  const result = buildM2LayeredRevenueSyntheticDiagnostic(
    fixture,
    config
  );
  assert.equal(
    result.status,
    "PUBLIC_CONTRACT_AND_SYNTHETIC_DIAGNOSTIC_COMPLETE"
  );
  assert.equal(
    result.decomposition.conservationDifferenceMinor,
    "0"
  );
  assert.equal(result.privateEvaluation.executed, false);
  assert.equal(assertM2LayeredRevenuePublicSafe(result), true);
});

test("public safety blocks row identities and machine paths", () => {
  assert.throws(
    () => assertM2LayeredRevenuePublicSafe({
      workId: "W-1"
    }),
    /m2_layered_revenue_public_identity_leak/u
  );
  assert.throws(
    () => assertM2LayeredRevenuePublicSafe({
      path: "C:\\private\\rows.ndjson"
    }),
    /m2_layered_revenue_public_identity_leak/u
  );
});

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}
