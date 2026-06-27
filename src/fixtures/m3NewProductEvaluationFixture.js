import {
  M3_FIXTURE_ALGORITHM_VERSION,
  buildM3NewProductFixtureDataset
} from "../domain/newProductEvaluation/fixtureEngine.js";

export const M3_NEW_PRODUCT_SYNTHETIC_MARKERS = Object.freeze([
  "SYN-TOPIC-0001",
  "SYN-TOPIC-0002",
  "SYN-TOPIC-0003",
  "SYN-TOPIC-0004",
  "SYN-TOPIC-0005",
  "SYN-TOPIC-0006",
  "SYN-TOPIC-0007",
  "SYN-TOPIC-0008",
  "SYN-TOPIC-0009",
  "SYN-TOPIC-0010",
  "SYN-TITLE-PUBLICATION-GROWTH",
  "SYN-TITLE-SUPER-HIGH-M4-CANDIDATE",
  "SYN-TITLE-WEB-STABLE",
  "SYN-AUTHOR-ALPHA",
  "SYN-AUTHOR-BETA",
  "SYN-COMPARATOR",
  "SYN-M3-BACKTEST-0001"
]);

export const M3_NEW_PRODUCT_DATASET = Object.freeze({
  mode: "fixture",
  source: "m3-new-product-static-synthetic-fixture",
  formalDataAuthorized: false,
  formalEvaluationAllowed: false,
  syntheticValue: true,
  syntheticOnly: true,
  notForFormalDecision: true,
  m3FormalExecutionAllowed: false,
  dependsOnM2FormalReadiness: true
});

const generatedFixture = buildM3NewProductFixtureDataset();

export const M3_NEW_PRODUCT_TOPICS = Object.freeze(generatedFixture.topics);
export const M3_NEW_PRODUCT_ALGORITHM_VERSIONS = Object.freeze(
  generatedFixture.algorithmVersions.map((version) => ({
    ...version,
    versionKey: version.versionKey || M3_FIXTURE_ALGORITHM_VERSION
  }))
);
export const M3_NEW_PRODUCT_BACKTESTS = Object.freeze(generatedFixture.backtests);
export const M3_NEW_PRODUCT_M4_CALIBRATION_CANDIDATES = Object.freeze(
  generatedFixture.m4CalibrationCandidates
);
export const M3_NEW_PRODUCT_ENGINE_SUMMARY = Object.freeze(generatedFixture.engineSummary);
