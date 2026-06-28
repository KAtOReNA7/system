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
  assert.equal(result.guardrails.forecastRangeEmitted, false);
  assert.equal(result.forecast.totalForecast.firstYearForecast, sum(
    result.forecast.channelForecasts.map((channel) => channel.firstYearForecast)
  ));
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
  assert.equal(Object.hasOwn(result.forecast, "forecastRange"), false);
  assert.equal(text.includes("developmentRecommendation"), false);
  assert.equal(text.includes("resourceInvestmentLevel"), false);
  assert.equal(result.guardrails.developDecisionEmitted, false);
  assert.equal(result.guardrails.resourceLevelEmitted, false);
});

test("engine includes M3-2 comparable works and author ranking", () => {
  const result = evaluateNewProductMaterial(M3_NEW_PRODUCT_MATERIAL_FIXTURES[0]);

  assert.ok(result.comparableWorks.systemSelected.length <= 3);
  assert.equal(result.comparableWorks.operatorSpecified[0].notCountedAgainstSystemLimit, true);
  assert.ok(result.comparableWorks.sameAuthorReferenceWorks.length >= 3);
  assert.ok(result.comparableWorks.excluded.some((item) => item.excludedReasonCode));
  assert.equal(result.authorRanking.enabled, true);
  assert.equal(result.authorRanking.measurableWorkCount, 3);
  assert.equal(result.comparatorDisplay.displayTogether, true);
});

test("engine includes M3-3 forecast weighting and rating explanation", () => {
  const result = evaluateNewProductMaterial(M3_NEW_PRODUCT_MATERIAL_FIXTURES[0]);

  assert.equal(result.forecast.forecastShape, "point_estimate_only");
  assert.ok(result.forecast.forecastContributions.some((item) => item.signalCode === "comparable_works_strength"));
  assert.ok(result.forecast.forecastContributions.some((item) => item.signalCode === "author_ranking_tier"));
  assert.ok(result.forecast.forecastContributions.some((item) => item.signalCode === "adaptation_signal_boost"));
  assert.ok(result.forecast.channelForecasts.every((channel) => channel.channelContributionBreakdown.length > 0));
  assert.equal(result.candidateRating.ratingType, "new_product_candidate_rating");
  assert.ok(result.candidateRating.ratingExplanation);
  assert.ok(result.candidateRating.supportFactors.length > 0);
  assert.ok(result.candidateRating.warningFactors.length > 0);
});

test("engine includes M3-3.5 external evidence and research questions", () => {
  const result = evaluateNewProductMaterial(M3_NEW_PRODUCT_MATERIAL_FIXTURES[1]);

  assert.ok(result.externalEvidence.length > 0);
  assert.ok(result.evidenceSummary.gptWebAssistedSummaryCount > 0);
  assert.ok(result.researchQuestions.some((item) => item.missingFieldOrRisk === "missing_adaptation_signals"));
  assert.equal(result.guardrails.externalSearchCalled, false);
  assert.equal(result.guardrails.chatGptWebCalled, false);
  assert.equal(result.guardrails.browserAutomationCalled, false);
  assert.ok(result.candidateRating.gptWebAssistedEvidenceNotes.length > 0);
});

test("blocked material does not produce numeric channel forecast", () => {
  const result = evaluateNewProductMaterial(M3_NEW_PRODUCT_MATERIAL_FIXTURES[2]);

  assert.equal(result.readiness.readinessStatus, "blocked");
  assert.equal(result.forecast.forecastStatus, "blocked");
  assert.ok(result.forecast.blockedBy.includes("missing_heat_signal"));
});

function sum(values) {
  return Math.round(values.reduce((total, value) => total + value, 0) * 100) / 100;
}
