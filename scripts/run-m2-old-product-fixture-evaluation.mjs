import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildFixtureOldProductEvaluationDataset
} from "../src/domain/oldProductEvaluation/fixtureEngine.js";
import {
  CALIBRATED_NON_FORMAL_PARAMETER_PROFILE,
  DEFAULT_EVALUATION_PARAMETER_PROFILE
} from "../src/domain/oldProductEvaluation/evaluationParameters.js";
import {
  M2_OLD_PRODUCT_BACKTESTS,
  M2_OLD_PRODUCT_DATASET,
  M2_OLD_PRODUCT_ENGINE_SUMMARY,
  M2_OLD_PRODUCT_EVALUATIONS
} from "../src/fixtures/m2OldProductEvaluationFixture.js";

function buildCliOutput({ profile = DEFAULT_EVALUATION_PARAMETER_PROFILE } = {}) {
  const generated =
    profile === DEFAULT_EVALUATION_PARAMETER_PROFILE
      ? {
          evaluations: M2_OLD_PRODUCT_EVALUATIONS,
          backtests: M2_OLD_PRODUCT_BACKTESTS,
          engineSummary: M2_OLD_PRODUCT_ENGINE_SUMMARY
        }
      : buildFixtureOldProductEvaluationDataset({ profile });
  const evaluations = generated.evaluations;
  const backtests = generated.backtests;
  const engineSummary = generated.engineSummary;

  return {
    status: "pass",
    mode: "fixture",
    stage: profile === DEFAULT_EVALUATION_PARAMETER_PROFILE ? "M2-B-4" : "M2-C-1",
    profile,
    parameterProfile: profile,
    syntheticOnly: true,
    nonFormalCalibration: engineSummary.nonFormalCalibration,
    realDataAggregated: engineSummary.realDataAggregated,
    notForFormalDecision: true,
    formalEvaluationAllowed: false,
    dataset: M2_OLD_PRODUCT_DATASET,
    engineSummary,
    resultCount: evaluations.length,
    backtestBatchCount: backtests.length,
    results: evaluations.map((result) => ({
      resultId: result.resultId,
      standardWorkId: result.standardWorkId,
      lifecycle: result.lifecycle.type,
      lifecycleConfidence: result.lifecycle.confidence,
      rating: result.rating.rating,
      ratingScore: result.rating.ratingScore,
      forecastTotalBase: result.forecast.scenarios.base.forecastTotal,
      riskCount: result.risks.length,
      suggestionCount: result.suggestions.length,
      parameterProfile: result.parameterProfile,
      syntheticOnly: result.syntheticOnly,
      nonFormalCalibration: result.nonFormalCalibration,
      realDataAggregated: result.realDataAggregated,
      notForFormalDecision: result.notForFormalDecision
    })),
    guards: {
      databaseConnected: false,
      dockerExecuted: false,
      realDataRead: false,
      dataDirectoryRead: false,
      stageJsonRead: false,
      operationsConfirmationBodyRead: false,
      dbConnectionStringRead: false,
      envLocalRead: false,
      localDryRunExecuted: false,
      mappingVersionActivated: false,
      switchMappingVersionCalled: false,
      formalDataMigrationExecuted: false,
      migrationModified: false,
      writeApiAdded: false,
      exportApiAdded: false,
      evaluationTaskApiAdded: false,
      formalModeAdded: false,
      localDryRunModeAdded: false,
      formalEvaluationAllowed: false
    }
  };
}

function buildCalibrationComparisonOutput() {
  const baseline = buildFixtureOldProductEvaluationDataset({
    profile: DEFAULT_EVALUATION_PARAMETER_PROFILE
  });
  const calibrated = buildFixtureOldProductEvaluationDataset({
    profile: CALIBRATED_NON_FORMAL_PARAMETER_PROFILE
  });

  return {
    status: "pass",
    mode: "fixture",
    stage: "M2-C-1",
    comparison: "fixture_baseline_vs_calibrated_non_formal",
    baselineProfile: DEFAULT_EVALUATION_PARAMETER_PROFILE,
    calibratedProfile: CALIBRATED_NON_FORMAL_PARAMETER_PROFILE,
    syntheticOnly: true,
    nonFormalCalibration: true,
    realDataAggregated: true,
    notForFormalDecision: true,
    formalEvaluationAllowed: false,
    resultCount: baseline.evaluations.length,
    aggregateOnly: true,
    differences: {
      ratingDistribution: compareDistribution(
        distribution(baseline.evaluations, (item) => item.rating.rating),
        distribution(calibrated.evaluations, (item) => item.rating.rating)
      ),
      lifecycleDistribution: compareDistribution(
        distribution(baseline.evaluations, (item) => item.lifecycle.type),
        distribution(calibrated.evaluations, (item) => item.lifecycle.type)
      ),
      forecastTotalDistribution: compareNumberSummary(
        numberSummary(baseline.evaluations.map((item) => Number.parseFloat(item.forecast.scenarios.base.forecastTotal))),
        numberSummary(calibrated.evaluations.map((item) => Number.parseFloat(item.forecast.scenarios.base.forecastTotal)))
      ),
      riskDistribution: compareDistribution(
        distribution(baseline.evaluations.flatMap((item) => item.risks.map((risk) => risk.severity))),
        distribution(calibrated.evaluations.flatMap((item) => item.risks.map((risk) => risk.severity)))
      ),
      suggestionDistribution: compareDistribution(
        distribution(baseline.evaluations.flatMap((item) => item.suggestions.map((suggestion) => suggestion.action))),
        distribution(calibrated.evaluations.flatMap((item) => item.suggestions.map((suggestion) => suggestion.action)))
      )
    },
    guards: {
      databaseConnected: false,
      dockerExecuted: false,
      realDataRead: false,
      dataDirectoryRead: false,
      stageJsonRead: false,
      operationsConfirmationBodyRead: false,
      dbConnectionStringRead: false,
      envLocalRead: false,
      localDryRunExecuted: false,
      mappingVersionActivated: false,
      switchMappingVersionCalled: false,
      formalDataMigrationExecuted: false,
      migrationModified: false,
      writeApiAdded: false,
      exportApiAdded: false,
      evaluationTaskApiAdded: false,
      formalModeAdded: false,
      localDryRunModeAdded: false,
      formalEvaluationAllowed: false
    }
  };
}

function distribution(items, accessor = (item) => item) {
  const counts = new Map();
  for (const item of items) {
    const key = accessor(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function compareDistribution(baseline, calibrated) {
  const keys = [...new Set([...Object.keys(baseline), ...Object.keys(calibrated)])].sort();
  return Object.fromEntries(
    keys.map((key) => [
      key,
      {
        baseline: baseline[key] ?? 0,
        calibrated: calibrated[key] ?? 0,
        delta: (calibrated[key] ?? 0) - (baseline[key] ?? 0)
      }
    ])
  );
}

function numberSummary(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    count: values.length,
    min: round(sorted[0] ?? 0),
    median: round(sorted[Math.floor(sorted.length / 2)] ?? 0),
    max: round(sorted.at(-1) ?? 0),
    total: round(total),
    bucketCounts: distribution(values, forecastBucket)
  };
}

function compareNumberSummary(baseline, calibrated) {
  return {
    baseline,
    calibrated,
    delta: {
      count: calibrated.count - baseline.count,
      min: round(calibrated.min - baseline.min),
      median: round(calibrated.median - baseline.median),
      max: round(calibrated.max - baseline.max),
      total: round(calibrated.total - baseline.total),
      bucketCounts: compareDistribution(baseline.bucketCounts, calibrated.bucketCounts)
    }
  };
}

function forecastBucket(value) {
  if (value < 1000) return "lt_1k";
  if (value < 10000) return "1k_to_10k";
  if (value < 100000) return "10k_to_100k";
  if (value < 1000000) return "100k_to_1m";
  return "gte_1m";
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function parseArgs(argv) {
  if (argv.includes("--compare-profiles")) {
    return { compareProfiles: true };
  }

  const profileIndex = argv.indexOf("--profile");
  if (profileIndex >= 0) {
    const profile = argv[profileIndex + 1];
    if (!profile) {
      throw new Error("--profile requires a profile key");
    }
    return { profile };
  }

  return { profile: DEFAULT_EVALUATION_PARAMETER_PROFILE };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const output = args.compareProfiles ? buildCalibrationComparisonOutput() : buildCliOutput({ profile: args.profile });
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  await main();
}

export { buildCalibrationComparisonOutput, buildCliOutput };
