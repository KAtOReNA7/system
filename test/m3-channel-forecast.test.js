import assert from "node:assert/strict";
import test from "node:test";
import { buildChannelForecast } from "../src/domain/newProductEvaluation/channelForecast.js";
import { extractMaterialFields } from "../src/domain/newProductEvaluation/materialFieldExtractor.js";
import { evaluateNewProductReadiness } from "../src/domain/newProductEvaluation/newProductReadiness.js";
import { M3_NEW_PRODUCT_MATERIAL_FIXTURES } from "../src/domain/newProductEvaluation/fixtures/newProductMaterials.fixture.js";

test("each target channel receives a separate point forecast", () => {
  const parsed = extractMaterialFields(M3_NEW_PRODUCT_MATERIAL_FIXTURES[0]);
  const readiness = evaluateNewProductReadiness(parsed);
  const forecast = buildChannelForecast(parsed.normalizedFields, readiness);

  assert.equal(forecast.forecastShape, "point_estimate_only");
  assert.equal(forecast.pointEstimateOnly, true);
  assert.equal(forecast.channelForecasts.length, 2);
  assert.equal(typeof forecast.channelForecasts[0].firstYearForecast, "number");
});

test("totalForecast equals sum of channelForecasts", () => {
  const parsed = extractMaterialFields(M3_NEW_PRODUCT_MATERIAL_FIXTURES[0]);
  const readiness = evaluateNewProductReadiness(parsed);
  const forecast = buildChannelForecast(parsed.normalizedFields, readiness);

  const firstYearSum = sum(forecast.channelForecasts.map((channel) => channel.firstYearForecast));
  const fiveYearSum = sum(forecast.channelForecasts.map((channel) => channel.fiveYearTotal));

  assert.equal(forecast.totalForecast.firstYearForecast, firstYearSum);
  assert.equal(forecast.totalForecast.fiveYearTotal, fiveYearSum);
  for (const yearly of forecast.totalForecast.year1To5Breakdown) {
    const channelYearSum = sum(
      forecast.channelForecasts.map((channel) =>
        channel.year1To5Breakdown.find((row) => row.year === yearly.year).forecast
      )
    );
    assert.equal(yearly.forecast, channelYearSum);
  }
});

test("forecast output does not emit range scenario fields", () => {
  const parsed = extractMaterialFields(M3_NEW_PRODUCT_MATERIAL_FIXTURES[0]);
  const readiness = evaluateNewProductReadiness(parsed);
  const forecast = buildChannelForecast(parsed.normalizedFields, readiness);

  assert.equal(Object.hasOwn(forecast, "forecastRange"), false);
  assert.equal(Object.hasOwn(forecast, "optimistic"), false);
  assert.equal(Object.hasOwn(forecast, "pessimistic"), false);
  assert.equal(Object.hasOwn(forecast, "high"), false);
  assert.equal(Object.hasOwn(forecast, "low"), false);
});

function sum(values) {
  return Math.round(values.reduce((total, value) => total + value, 0) * 100) / 100;
}
