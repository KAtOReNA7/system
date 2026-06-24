import assert from "node:assert/strict";
import test from "node:test";
import {
  assertScenarioSpreadNotFixed,
  classifyBakeoffVerdict,
  selectForecastModel
} from "../src/domain/oldProductEvaluation/forecastModelBakeoff.js";

test("forecast model selector routes sparse and inactive works to zero-inflated model", () => {
  assert.equal(
    selectForecastModel({
      lifecycle: "inactive",
      rating: "E",
      revenueScale: "low",
      activeMonthCount: 4
    }).selectedModel,
    "model_c_zero_inflated_sparse"
  );

  assert.equal(
    selectForecastModel({
      lifecycle: "insufficient_history",
      rating: "B",
      revenueScale: "high",
      activeMonthCount: 3
    }).selectedModel,
    "model_d_hierarchical_shrinkage"
  );
});

test("forecast bakeoff verdict distinguishes pass conditional pass and fail", () => {
  assert.equal(
    classifyBakeoffVerdict({
      p0: 0,
      p1: 2,
      sample200FailRate: 0.08,
      sample200WarningRate: 0.4,
      fullFailRate: 0.18,
      highConfidenceCoverage: 0.62,
      allCoverage: 0.5,
      highConfidenceSpreadP75: 1.42,
      nonLowConfidenceSpreadP75: 1.8
    }),
    "PASS"
  );

  assert.equal(
    classifyBakeoffVerdict({
      p0: 0,
      p1: 8,
      sample200FailRate: 0.16,
      sample200WarningRate: 0.6,
      fullFailRate: 0.3,
      highConfidenceCoverage: 0.45,
      allCoverage: 0.38,
      highConfidenceSpreadP75: 1.45,
      nonLowConfidenceSpreadP75: 1.9
    }),
    "CONDITIONAL PASS"
  );

  assert.equal(classifyBakeoffVerdict({ p0: 1 }), "FAIL");
});

test("scenario spread guard rejects fixed multipliers", () => {
  assert.equal(assertScenarioSpreadNotFixed([1.1, 1.2, 1.35, 1.4, 1.6, 1.8, 2, 2.2, 2.4, 2.6]), true);
  assert.throws(
    () => assertScenarioSpreadNotFixed(Array.from({ length: 20 }, () => 4.4667)),
    /fixed/
  );
});
