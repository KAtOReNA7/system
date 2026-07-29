import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  assertM2LayeredRevenuePublicSafe,
  buildM2LayeredRevenueSyntheticDiagnostic,
  classifyM2LayeredRevenueActual,
  composeM2LayeredRevenuePrediction,
  decomposeM2LayeredRevenueActual,
  estimateM2DirectCatalogRetention,
  estimateM2LayeredPortfolioRatio,
  forecastM2LayeredPortfolioAmount,
  selectM2LayeredRatioEstimator,
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

test("portfolio ratios use only mature pre-origin pseudo-origins", () => {
  const history = [
    ratioRow("2021-01", 12, 10, 100),
    ratioRow("2022-01", 12, 20, 100),
    ratioRow("2023-01", 12, 30, 100),
    ratioRow("2024-01", 12, 90, 100)
  ];
  const estimate = estimateM2LayeredPortfolioRatio({
    history,
    origin: "2024-01",
    horizonMonths: 12
  });
  assert.equal(estimate.status, "COMPUTED");
  assert.equal(estimate.maturePseudoOriginCount, 3);
  assert.equal(
    estimate.estimators.SAME_MONTH_PRIOR_YEAR,
    0.3
  );
  assert.equal(
    estimate.estimators.RECENT_3_MATURE_MEDIAN,
    0.2
  );
  assert.equal(
    selectM2LayeredRatioEstimator(
      estimate,
      "RECENT_3_MATURE_MEDIAN"
    ).ratio,
    0.2
  );
  assert.deepEqual(
    forecastM2LayeredPortfolioAmount({
      preOrigin12MonthCashMinor: "1000",
      estimate: {
        status: "COMPUTED",
        ratio: 0.2
      }
    }),
    { status: "COMPUTED", amountMinor: "200" }
  );
});

test("direct retention estimates each year without recursive compounding", () => {
  const history = [
    retentionRow("2018-01", "Y2", 70, 100, "B1"),
    retentionRow("2019-01", "Y2", 60, 100, "B2"),
    retentionRow("2020-01", "Y2", 50, 100, "B3")
  ];
  const result = estimateM2DirectCatalogRetention({
    history,
    origin: "2024-01",
    annualComponent: "Y2"
  });
  assert.equal(result.status, "COMPUTED");
  assert.equal(result.maturePseudoOriginCount, 3);
  assert.equal(result.independentTimeBlockCount, 3);
  assert.equal(result.supportStatus, "DIRECT_SUPPORT");
  assert.equal(
    result.estimators.RECENT_3_MATURE_MEDIAN,
    0.6
  );
});

test("fixed composition sums cash and requires every component", () => {
  assert.deepEqual(
    composeM2LayeredRevenuePrediction({
      EXISTING_CORE: "100",
      EXISTING_TAIL: "20",
      FUTURE_NEW_WORK: "10",
      EXISTING_WORK_NEW_CHANNEL: "5"
    }),
    {
      components: {
        EXISTING_CORE: "100",
        EXISTING_TAIL: "20",
        FUTURE_NEW_WORK: "10",
        EXISTING_WORK_NEW_CHANNEL: "5"
      },
      companyTotalMinor: "135"
    }
  );
  assert.throws(
    () => composeM2LayeredRevenuePrediction({
      EXISTING_CORE: "100"
    }),
    /m2_layered_revenue_component_missing/u
  );
});

function ratioRow(pseudoOrigin, horizonMonths, numeratorMinor, denominatorMinor) {
  return {
    pseudoOrigin,
    horizonMonths,
    numeratorMinor: String(numeratorMinor),
    denominatorMinor: String(denominatorMinor)
  };
}

function retentionRow(
  pseudoOrigin,
  annualComponent,
  numeratorMinor,
  denominatorMinor,
  timeBlockId
) {
  return {
    pseudoOrigin,
    annualComponent,
    numeratorMinor: String(numeratorMinor),
    denominatorMinor: String(denominatorMinor),
    timeBlockId
  };
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}
