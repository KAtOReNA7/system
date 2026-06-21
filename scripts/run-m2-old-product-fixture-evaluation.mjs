import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  M2_OLD_PRODUCT_BACKTESTS,
  M2_OLD_PRODUCT_DATASET,
  M2_OLD_PRODUCT_ENGINE_SUMMARY,
  M2_OLD_PRODUCT_EVALUATIONS
} from "../src/fixtures/m2OldProductEvaluationFixture.js";

function buildCliOutput() {
  return {
    status: "pass",
    mode: "fixture",
    stage: "M2-B-4",
    syntheticOnly: true,
    notForFormalDecision: true,
    dataset: M2_OLD_PRODUCT_DATASET,
    engineSummary: M2_OLD_PRODUCT_ENGINE_SUMMARY,
    resultCount: M2_OLD_PRODUCT_EVALUATIONS.length,
    backtestBatchCount: M2_OLD_PRODUCT_BACKTESTS.length,
    results: M2_OLD_PRODUCT_EVALUATIONS.map((result) => ({
      resultId: result.resultId,
      standardWorkId: result.standardWorkId,
      lifecycle: result.lifecycle.type,
      lifecycleConfidence: result.lifecycle.confidence,
      rating: result.rating.rating,
      ratingScore: result.rating.ratingScore,
      forecastTotalBase: result.forecast.scenarios.base.forecastTotal,
      riskCount: result.risks.length,
      suggestionCount: result.suggestions.length,
      syntheticOnly: result.syntheticOnly,
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
      localDryRunModeAdded: false
    }
  };
}

async function main() {
  process.stdout.write(`${JSON.stringify(buildCliOutput(), null, 2)}\n`);
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  await main();
}

export { buildCliOutput };
