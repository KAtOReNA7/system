import assert from "node:assert/strict";
import test from "node:test";
import { evaluateNewProductMaterial } from "../src/domain/newProductEvaluation/newProductEvaluationEngine.js";
import { M3_NEW_PRODUCT_MATERIAL_FIXTURES } from "../src/domain/newProductEvaluation/fixtures/newProductMaterials.fixture.js";

test("M3 rating explanation includes support, limitation and warning factors", () => {
  const result = evaluateNewProductMaterial(M3_NEW_PRODUCT_MATERIAL_FIXTURES[0]);
  const rating = result.candidateRating;

  assert.equal(rating.ratingType, "new_product_candidate_rating");
  assert.equal(rating.rating, rating.value);
  assert.ok(rating.ratingExplanation.includes(`Candidate rating ${rating.value}`));
  assert.ok(rating.supportFactors.some((item) => item.code === "point_forecast_generated"));
  assert.ok(rating.supportFactors.some((item) => item.code === "system_comparable_support"));
  assert.ok(rating.supportFactors.some((item) => item.code === "author_ranking_support"));
  assert.ok(rating.warningFactors.some((item) => item.code === "classification_requires_user_confirmation"));
  assert.ok(rating.comparableInfluence.length > 0);
  assert.ok(rating.authorRankingInfluence.some((item) => item.enabled === true));
  assert.ok(rating.heatInfluence.length > 0);
  assert.ok(rating.adaptationInfluence.some((item) => item.direction === "support"));
});

test("rating explanation surfaces same-name audio risk and disabled author ranking", () => {
  const result = evaluateNewProductMaterial(M3_NEW_PRODUCT_MATERIAL_FIXTURES[1]);
  const rating = result.candidateRating;

  assert.ok(rating.limitingFactors.some((item) => item.code === "same_name_audio_unknown"));
  assert.ok(rating.limitingFactors.some((item) => item.code === "insufficient_measurable_author_works"));
  assert.ok(rating.sameNameAudioRiskInfluence.some((item) => item.direction === "warning"));
  assert.ok(rating.authorRankingInfluence.some((item) => item.enabled === false));
  assert.ok(rating.manualReviewNotes.some((item) => item.includes("Same-name audio")));
});

test("rating explanation does not output development recommendation or resource level", () => {
  const result = evaluateNewProductMaterial(M3_NEW_PRODUCT_MATERIAL_FIXTURES[0]);
  const text = JSON.stringify(result.candidateRating);

  assert.equal(Object.hasOwn(result.candidateRating, "recommendedDevelopmentDecision"), false);
  assert.equal(Object.hasOwn(result.candidateRating, "developmentRecommendation"), false);
  assert.equal(Object.hasOwn(result.candidateRating, "resourceInvestmentLevel"), false);
  assert.equal(text.includes("recommendedDevelopmentDecision"), false);
  assert.equal(text.includes("developmentRecommendation"), false);
  assert.equal(text.includes("resourceInvestmentLevel"), false);
});
