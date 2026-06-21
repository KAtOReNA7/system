import {
  FIXTURE_EVALUATION_ALGORITHM_VERSION,
  buildFixtureOldProductEvaluationDataset
} from "../domain/oldProductEvaluation/fixtureEngine.js";

export const M2_OLD_PRODUCT_SYNTHETIC_MARKERS = Object.freeze([
  "SYN-WORK-0001",
  "SYN-WORK-0002",
  "SYN-WORK-0003",
  "SYN-WORK-0004",
  "SYN-WORK-0005",
  "SYN-WORK-0006",
  "SYN-WORK-0007",
  "SYN-AUTHOR-0001",
  "SYN-AUTHOR-0002",
  "SYN-AUTHOR-0003",
  "SYN-CHANNEL-ALPHA",
  "SYN-CHANNEL-BETA",
  "SYN-CHANNEL-GAMMA",
  "SYN-CLASS-L1-A",
  "SYN-CLASS-L2-A",
  "SYN-CLASS-L3-A",
  "SYN-TAG-READY",
  "SYN-TAG-BLOCKED",
  "SYN-BACKTEST-0001",
  "SYN-EVAL-RESULT"
]);

export const M2_OLD_PRODUCT_DATASET = Object.freeze({
  mode: "fixture",
  source: "m2-b-static-synthetic-fixture",
  formalDataAuthorized: false,
  formalEvaluationAllowed: false,
  syntheticValue: true,
  syntheticOnly: true,
  notForFormalDecision: true,
  cutoffMonth: "2026-04",
  incompleteMonths: ["2026-05"]
});

export const M2_OLD_PRODUCT_ALGORITHM_VERSIONS = Object.freeze([
  {
    id: "SYN-ALG-OLD-PRODUCT-0001",
    versionKey: FIXTURE_EVALUATION_ALGORITHM_VERSION,
    status: "fixture_only",
    effectiveFrom: "2026-04-01",
    retiredAt: null,
    usesAiModel: false,
    fixtureOnly: true,
    nonFormal: true,
    description: "Synthetic fixture-only old-product evaluation engine rules for M2-B-4."
  }
]);

const generatedFixture = buildFixtureOldProductEvaluationDataset();

export const M2_OLD_PRODUCT_EVALUATIONS = Object.freeze(generatedFixture.evaluations);
export const M2_OLD_PRODUCT_BACKTESTS = Object.freeze(generatedFixture.backtests);
export const M2_OLD_PRODUCT_ENGINE_SUMMARY = Object.freeze(generatedFixture.engineSummary);
