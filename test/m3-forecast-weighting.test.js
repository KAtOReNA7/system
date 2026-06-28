import assert from "node:assert/strict";
import test from "node:test";
import { buildAuthorRanking } from "../src/domain/newProductEvaluation/authorRanking.js";
import { buildComparableWorks } from "../src/domain/newProductEvaluation/comparableWorkSelector.js";
import { buildChannelForecast } from "../src/domain/newProductEvaluation/channelForecast.js";
import { buildForecastWeighting } from "../src/domain/newProductEvaluation/forecastWeighting.js";
import { extractMaterialFields } from "../src/domain/newProductEvaluation/materialFieldExtractor.js";
import { evaluateNewProductReadiness } from "../src/domain/newProductEvaluation/newProductReadiness.js";
import { M3_NEW_PRODUCT_MATERIAL_FIXTURES } from "../src/domain/newProductEvaluation/fixtures/newProductMaterials.fixture.js";

function contextForFixture(index = 0) {
  const parsed = extractMaterialFields(M3_NEW_PRODUCT_MATERIAL_FIXTURES[index]);
  const readiness = evaluateNewProductReadiness(parsed);
  const comparableWorks = buildComparableWorks(parsed.normalizedFields);
  const authorRanking = buildAuthorRanking(parsed.normalizedFields);
  return { fields: parsed.normalizedFields, readiness, comparableWorks, authorRanking };
}

test("M3 forecast weighting emits required explanation signals", () => {
  const context = contextForFixture(0);
  const weighting = buildForecastWeighting(
    context.fields,
    context.readiness,
    context.comparableWorks,
    context.authorRanking,
    { referenceAmount: 100000 }
  );
  const signalCodes = weighting.forecastContributions.map((item) => item.signalCode);

  for (const expected of [
    "readiness_quality",
    "heat_signal_strength",
    "comparable_works_strength",
    "same_author_reference_strength",
    "author_ranking_tier",
    "adaptation_signal_boost",
    "source_type",
    "target_channel_suitability",
    "same_name_audio_risk",
    "material_completeness_warning",
    "buyout_treatment_limitation"
  ]) {
    assert.ok(signalCodes.includes(expected));
  }
  for (const contribution of weighting.forecastContributions) {
    assert.ok(["increase", "decrease", "neutral"].includes(contribution.direction));
    assert.equal(typeof contribution.weight, "number");
    assert.equal(typeof contribution.contributionAmount, "number");
    assert.ok(contribution.explanation);
  }
});

test("channel forecasts include channel contribution breakdown and remain point-only", () => {
  const context = contextForFixture(0);
  const forecast = buildChannelForecast(context.fields, context.readiness, {
    comparableWorks: context.comparableWorks,
    authorRanking: context.authorRanking
  });

  assert.equal(forecast.forecastShape, "point_estimate_only");
  assert.equal(forecast.pointEstimateOnly, true);
  assert.ok(forecast.forecastContributions.length >= 10);
  for (const channel of forecast.channelForecasts) {
    assert.ok(channel.channelContributionBreakdown.length >= 10);
    assert.ok(channel.channelContributionBreakdown.some((item) => item.signalCode === "heat_signal_strength"));
  }
  assert.equal(forecast.totalForecast.firstYearForecast, sum(
    forecast.channelForecasts.map((channel) => channel.firstYearForecast)
  ));
});

test("forecast weighting output does not restore range or scenario fields", () => {
  const context = contextForFixture(0);
  const forecast = buildChannelForecast(context.fields, context.readiness, {
    comparableWorks: context.comparableWorks,
    authorRanking: context.authorRanking
  });

  assert.equal(Object.hasOwn(forecast, "forecastRange"), false);
  assert.equal(Object.hasOwn(forecast, "lowerBound"), false);
  assert.equal(Object.hasOwn(forecast, "upperBound"), false);
  assert.equal(Object.hasOwn(forecast, "optimistic"), false);
  assert.equal(Object.hasOwn(forecast, "pessimistic"), false);
  assert.equal(Object.hasOwn(forecast, "high"), false);
  assert.equal(Object.hasOwn(forecast, "low"), false);
  assert.equal(Object.hasOwn(forecast, "recommendedDevelopmentDecision"), false);
  assert.equal(Object.hasOwn(forecast, "resourceInvestmentLevel"), false);
});

function sum(values) {
  return Math.round(values.reduce((total, value) => total + value, 0) * 100) / 100;
}
