import assert from "node:assert/strict";
import test from "node:test";
import { evaluateNewProductMaterial } from "../src/domain/newProductEvaluation/newProductEvaluationEngine.js";
import { M3_NEW_PRODUCT_MATERIAL_FIXTURES } from "../src/domain/newProductEvaluation/fixtures/newProductMaterials.fixture.js";

test("new product rating remains S+/S/A/B/C/D/E candidate rating", () => {
  const result = evaluateNewProductMaterial(M3_NEW_PRODUCT_MATERIAL_FIXTURES[0]);

  assert.equal(result.candidateRating.ratingType, "new_product_candidate_rating");
  assert.ok(["S+", "S", "A", "B", "C", "D", "E"].includes(result.candidateRating.rating));
  assert.deepEqual(result.candidateRating.ratingScale, ["S+", "S", "A", "B", "C", "D", "E"]);
  assert.equal(result.candidateRating.nonFormal, true);
  assert.equal(result.candidateRating.fixtureOnly, true);
  assert.equal(result.candidateRating.notForFormalDecision, true);
});

test("new product rating uses comparable and author ranking explanation signals", () => {
  const result = evaluateNewProductMaterial(M3_NEW_PRODUCT_MATERIAL_FIXTURES[0]);

  assert.equal(result.candidateRating.comparableWorksAffectRatingExplanation, true);
  assert.equal(result.candidateRating.authorRankingAffectsRatingExplanation, true);
  assert.ok(result.candidateRating.comparableInfluence.length > 0);
  assert.ok(result.candidateRating.authorRankingInfluence.length > 0);
});

test("blocked forecast does not emit E placeholder rating and explains readiness blockers", () => {
  const result = evaluateNewProductMaterial(M3_NEW_PRODUCT_MATERIAL_FIXTURES[2]);

  assert.equal(result.forecast.forecastStatus, "blocked");
  assert.equal(result.candidateRating.rating, null);
  assert.equal(result.candidateRating.value, null);
  assert.equal(result.candidateRating.ratingStatus, "not_generated_due_to_readiness_blocked");
  assert.equal(result.candidateRating.candidateRatingGenerated, false);
  assert.ok(result.candidateRating.limitingFactors.some((item) => item.code === "numeric_forecast_blocked"));
  assert.equal(result.candidateRating.nonFormal, true);
});
