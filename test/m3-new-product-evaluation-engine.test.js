import assert from "node:assert/strict";
import test from "node:test";
import { evaluateNewProductMaterial } from "../src/domain/newProductEvaluation/newProductEvaluationEngine.js";
import { M3_NEW_PRODUCT_MATERIAL_FIXTURES } from "../src/domain/newProductEvaluation/fixtures/newProductMaterials.fixture.js";

test("M3 fixture engine produces non-formal material-first evaluation", () => {
  const result = evaluateNewProductMaterial(M3_NEW_PRODUCT_MATERIAL_FIXTURES[0]);

  assert.equal(result.inputMode, "material_first");
  assert.equal(result.structuredTopicTableRole, "fallback_only");
  assert.equal(result.nonFormal, true);
  assert.equal(result.guardrails.formalExecutionAllowed, false);
  assert.equal(result.guardrails.databaseWritten, false);
  assert.equal(result.guardrails.rawMaterialStored, false);
});

test("adaptation signals affect rating and risk explanation", () => {
  const result = evaluateNewProductMaterial(M3_NEW_PRODUCT_MATERIAL_FIXTURES[0]);

  assert.equal(result.candidateRating.adaptationSignalsAffectRating, true);
  assert.ok(result.risks.some((risk) => risk.code === "adaptation_signal_present"));
});

test("engine does not output development recommendation or resource investment level", () => {
  const result = evaluateNewProductMaterial(M3_NEW_PRODUCT_MATERIAL_FIXTURES[0]);
  const text = JSON.stringify(result);

  assert.equal(Object.hasOwn(result, "developmentRecommendation"), false);
  assert.equal(Object.hasOwn(result, "resourceInvestmentLevel"), false);
  assert.equal(text.includes("developmentRecommendation"), false);
  assert.equal(text.includes("resourceInvestmentLevel"), false);
  assert.equal(result.guardrails.developDecisionEmitted, false);
  assert.equal(result.guardrails.resourceLevelEmitted, false);
});

test("blocked material does not produce numeric channel forecast", () => {
  const result = evaluateNewProductMaterial(M3_NEW_PRODUCT_MATERIAL_FIXTURES[2]);

  assert.equal(result.readiness.readinessStatus, "blocked");
  assert.equal(result.forecast.forecastStatus, "blocked");
  assert.ok(result.forecast.blockedBy.includes("missing_heat_signal"));
});
