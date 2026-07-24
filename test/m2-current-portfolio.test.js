import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildM2CurrentContract } from "../src/domain/m2Current/contract.js";
import {
  buildM2CurrentPortfolioReconstruction,
  evaluateM2CurrentResolution
} from "../src/domain/m2Current/portfolio.js";
import {
  loadM2CurrentConfigSync
} from "../scripts/m2-current/load_m2_current_config.mjs";

test("v0.5 separates portfolio development evidence from full M2 maturity", () => {
  const config = readJson("config/m2-current.v0.5.json");
  const contract = buildM2CurrentContract(config);

  assert.equal(contract.schema, "m2.current.config.v0.5");
  assert.equal(
    contract.evaluationPolicy.nextDevelopmentReadiness,
    "PORTFOLIO_INDEPENDENT_VALIDATION_AND_WORK_LEVEL_SIGNAL_REQUIRED"
  );
  assert.equal(
    contract.development.portfolioReconstruction
      .sameOrLaterEvaluationTruthRead,
    false
  );
  assert.equal(contract.authorizations.modelTraining, true);
  assert.equal(contract.authorizations.newCandidateFamilyDevelopment, false);
  assert.equal(contract.authorizations.holdout, false);
  assert.equal(contract.authorizations.release, false);
});

test("v0.6 migrates the target to sales-share cash without opening authority", () => {
  const config = loadM2CurrentConfigSync(
    process.cwd(),
    "config/m2-current.v0.6.json"
  );
  const contract = buildM2CurrentContract(config);
  const candidate = readJson(
    "docs/analysis/m2-current/M2-current-sales-share-candidate-v0.6.json"
  );

  assert.equal(contract.schema, "m2.current.config.v0.6");
  assert.equal(config.target, "future_sales_share_cash");
  assert.equal(
    contract.evaluationPolicy.nextDevelopmentReadiness,
    "SALES_SHARE_TARGET_VALIDATION_AND_WORK_LEVEL_SIGNAL_REQUIRED"
  );
  assert.equal(
    contract.thresholds.maximumClassificationUncertainCashShare,
    0
  );
  assert.equal(candidate.targetMigration.frozenTargetIsolation.caseCount, 7851);
  assert.equal(
    candidate.targetMigration.frozenTargetIsolation.targetChangedCaseCount,
    0
  );
  assert.equal(
    candidate.acceptance.allBuyoutExcludedFromTrainingLabels,
    true
  );
  assert.equal(candidate.acceptance.targetClassificationPassed, false);
  assert.equal(candidate.acceptance.fullM2MaturityPassed, false);
  assert.equal(contract.authorizations.holdout, false);
  assert.equal(contract.authorizations.release, false);
});

test("current config inheritance is confined to JSON under config", () => {
  assert.throws(
    () => loadM2CurrentConfigSync(process.cwd(), "../package.json"),
    /m2_current_config_path_invalid/u
  );
});

test("resolution scoring exposes cancellation instead of hiding work error", () => {
  const rows = [
    forecastRow({ standardWorkId: "SYN-A", pointEstimate: 50 }),
    forecastRow({ standardWorkId: "SYN-B", pointEstimate: 150 })
  ];
  const result = evaluateM2CurrentResolution(rows);

  assert.equal(result.workCase.wape, 0.5);
  assert.equal(result.portfolioOriginHorizon.wape, 0);
  assert.equal(result.portfolioOrigin.wape, 0);
  assert.equal(result.portfolioHorizon.wape, 0);
  assert.equal(result.originClusterBootstrap.wape.upper95, 0);
});

test("portfolio reconstruction keeps model selection before evaluation", () => {
  const monthly = Array.from(
    { length: 72 },
    (_, index) => 100 + index * 2 + (index % 12 === 0 ? 25 : 0)
  );
  const rows = [];
  for (let originIndex = 35; originIndex <= 59; originIndex += 1) {
    const origin = monthFromIndex(2020 * 12 + originIndex);
    for (const horizonMonths of [3, 6, 12]) {
      if (originIndex + horizonMonths >= monthly.length) {
        continue;
      }
      rows.push({
        standardWorkId: "SYN-WORK",
        historyKey: `SYN-WORK|${origin}`,
        origin,
        horizonMonths,
        actual: monthly.slice(
          originIndex + 1,
          originIndex + horizonMonths + 1
        ).reduce((sum, value) => sum + value, 0),
        served: true,
        abstained: false,
        historyFirstObservedMonth: "2020-01",
        historySeries: monthly.slice(0, originIndex + 1)
      });
    }
  }
  const result = buildM2CurrentPortfolioReconstruction(rows, {
    method: "as_of_aggregate_additive_holt_winters_ensemble",
    populationPolicy: "served_works_frozen_at_each_origin",
    sameOrLaterEvaluationTruthRead: false,
    selectionLabelsAvailableAsOf: "2023-12",
    evaluationFirstOrigin: "2023-12",
    minimumEvaluationOriginCount: 1,
    seasonLength: 12,
    selectedModelCount: 1,
    scalePriorCellCount: 2,
    dampingFactors: [0.98],
    alphaValues: [0.1],
    betaValues: [0.01],
    seasonalDampingFactors: [0.98],
    seasonalAlphaValues: [0.1],
    seasonalBetaValues: [0.01],
    gammaValues: [0.05],
    maximumPortfolioWape: 1,
    maximumAbsoluteBias: 1,
    maximumP90CellAbsolutePercentageError: 1,
    minimumForecastValueAdded: 0
  });

  assert.equal(
    result.asOfBoundary.sameOrLaterEvaluationTruthUsedForSelection,
    false
  );
  assert.ok(
    result.privateValidationRows.every(
      (row) => row.origin >= result.asOfBoundary.evaluationFirstOrigin
    )
  );
  assert.equal(result.search.selectedModels.length, 1);
  assert.ok(result.candidate.originHorizonCellCount > 0);
  assert.ok(result.gates.wapeUpper95Passed);
  assert.ok(result.gates.absoluteBiasIntervalPassed);
});

test("tracked v0.5 evidence allows only the portfolio development claim", () => {
  const candidate = readJson(
    "docs/analysis/m2-current/M2-current-multi-resolution-candidate-v0.5.json"
  );
  const evaluation = readJson(
    "docs/analysis/m2-current/M2-current-automated-evaluation-v0.3.json"
  );
  const text = JSON.stringify({ candidate, evaluation });

  assert.equal(
    candidate.status,
    "PORTFOLIO_DEVELOPMENT_BACKTEST_PASS_WORK_LEVEL_BLOCKED"
  );
  assert.equal(
    candidate.acceptance.portfolioDevelopmentBacktestPassed,
    true
  );
  assert.equal(candidate.acceptance.workLevelDevelopmentPassed, false);
  assert.equal(candidate.acceptance.fullM2MaturityPassed, false);
  assert.equal(
    candidate.multiResolution.portfolioReconstruction
      .candidate.overall.wape,
    0.11681933893326385
  );
  assert.equal(
    candidate.multiResolution.portfolioReconstruction
      .candidate.originClusterBootstrap.wape.upper95,
    0.13717580709819285
  );
  assert.equal(
    evaluation.retiredHumanPredictionSample.skippedByUserDecision,
    true
  );
  assert.equal(evaluation.boundaries.finalHoldoutOpened, false);
  assert.doesNotMatch(text, /standardWorkId/u);
  assert.doesNotMatch(text, /data\/private-/u);
});

function forecastRow(overrides = {}) {
  return {
    standardWorkId: "SYN",
    origin: "2022-01",
    horizonMonths: 3,
    actual: 100,
    pointEstimate: 100,
    ...overrides
  };
}

function monthFromIndex(value) {
  const year = Math.floor(value / 12);
  const month = value % 12 + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}
