import assert from "node:assert/strict";
import test from "node:test";
import { buildBacktestAnchorPrototype } from "../src/domain/newProductEvaluation/backtestAnchor.js";
import { evaluateNewProductMaterial } from "../src/domain/newProductEvaluation/newProductEvaluationEngine.js";
import { M3_NEW_PRODUCT_MATERIAL_FIXTURES } from "../src/domain/newProductEvaluation/fixtures/newProductMaterials.fixture.js";

test("backtest anchor prototype contains forecast rating input evidence and comparable snapshots", () => {
  const result = evaluateNewProductMaterial(M3_NEW_PRODUCT_MATERIAL_FIXTURES[0]);
  const anchor = result.backtestAnchor;

  assert.equal(anchor.anchorStatus, "candidate");
  assert.equal(anchor.forecastSnapshot.forecastStatus, "generated");
  assert.equal(anchor.forecastSnapshot.pointEstimateOnly, true);
  assert.equal(anchor.ratingSnapshot.ratingType, "new_product_candidate_rating");
  assert.ok(anchor.inputSnapshot.extractedFieldKeys.includes("title"));
  assert.ok(anchor.evidenceSnapshot.evidenceIds.length > 0);
  assert.ok(anchor.comparableSnapshot.systemComparableIds.length > 0);
});

test("backtest anchor future windows include year1 year3 and year5", () => {
  const result = evaluateNewProductMaterial(M3_NEW_PRODUCT_MATERIAL_FIXTURES[0]);

  assert.equal(result.backtestAnchor.futureBacktestWindows.year1.monthsAfterLaunch, 12);
  assert.equal(result.backtestAnchor.futureBacktestWindows.year3.monthsAfterLaunch, 36);
  assert.equal(result.backtestAnchor.futureBacktestWindows.year5.monthsAfterLaunch, 60);
});

test("backtest anchor is prototype-only and does not run real backtest", () => {
  const result = evaluateNewProductMaterial(M3_NEW_PRODUCT_MATERIAL_FIXTURES[0]);

  assert.equal(result.backtestAnchor.realBacktestExecuted, false);
  assert.equal(result.backtestAnchor.postLaunchRevenueRead, false);
  assert.equal(result.backtestAnchor.databaseWritten, false);
  assert.equal(result.backtestAnchor.nonFormal, true);
  assert.equal(result.backtestAnchor.fixtureOnly, true);
  assert.equal(result.backtestAnchor.notForFormalDecision, true);
});

test("locked fixture anchor remains in-memory and non-formal", () => {
  const result = evaluateNewProductMaterial(M3_NEW_PRODUCT_MATERIAL_FIXTURES[0]);
  const anchor = buildBacktestAnchorPrototype(result, { lockFixture: true });

  assert.equal(anchor.anchorStatus, "locked_fixture");
  assert.equal(anchor.anchorType, "locked_fixture_snapshot");
  assert.equal(anchor.lockedAtSynthetic, "2026-06-28T00:00:00Z");
  assert.equal(anchor.databaseWritten, false);
});

test("blocked evaluation cannot become an eligible backtest anchor", () => {
  const result = evaluateNewProductMaterial(M3_NEW_PRODUCT_MATERIAL_FIXTURES[2]);

  assert.equal(result.backtestAnchor.anchorStatus, "not_eligible_readiness_blocked");
  assert.equal(result.backtestAnchor.forecastSnapshot.forecastStatus, "blocked");
  assert.ok(result.backtestAnchor.forecastSnapshot.blockedBy.includes("missing_heat_signal"));
});
