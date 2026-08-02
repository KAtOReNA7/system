import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {validateM2Psc03Preregistration} from "../src/domain/m2Current/publishingScaleDirectCashPreregistration.js";

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

const preregistration = readJson(
  "config/m2-current-publishing-scale-channel-direct-cash-preregistration.v0.1.json"
);
const development = readJson(
  "config/m2-current-publishing-scale-channel-direct-cash-development.v0.1.json"
);
const schema = readJson(
  "config/m2-current-publishing-scale-channel-direct-cash-schema.v0.1.json"
);
const psc01 = readJson("config/m2-current-publishing-scale-channel.v0.1.json");
const support = readJson("config/m2-publishing-scale-statistical-support.v1.json");
const businessAcceptance = readJson("config/m2-business-acceptance-contract.v1.json");
const registry = readJson("config/m2-model-registry.v1.json");
const publicPreregistration = readJson(
  "docs/analysis/m2-current/M2-publishing-scale-channel-direct-cash-quasi-poisson-preregistration-v0.1.json"
);
const publicDiagnostic = readJson(
  "docs/analysis/m2-current/M2-publishing-scale-channel-direct-cash-public-diagnostic-v0.1.json"
);
const publicEvaluation = readJson(
  "docs/analysis/m2-current/M2-publishing-scale-channel-direct-cash-development-evaluation-v0.1.json"
);

test("PSC03 public preregistration maps one stable model, candidate and experiment", () => {
  assert.doesNotThrow(() => validateM2Psc03Preregistration({
    preregistration,
    development,
    schema,
    psc01,
    support,
    businessAcceptance
  }));
  assert.equal(publicPreregistration.modelId, "M2-CHAN-PSC03");
  assert.equal(publicPreregistration.rawCandidateId, "M2-CHAN-PSC03-RAW");
  assert.equal(
    publicPreregistration.experimentId,
    "M2-EXP-PUBLISHING-SCALE-CHANNEL-DIRECT-CASH-03"
  );
  assert.equal(
    publicPreregistration.preregistrationId,
    "M2-PREREG-PSC03-DIRECT-CASH-QUASI-POISSON-01"
  );
  assert.deepEqual(
    publicPreregistration.arms.map((arm) => arm.armId),
    [
      "M2-EXP-PUBLISHING-SCALE-CHANNEL-DIRECT-CASH-03/D0",
      "M2-EXP-PUBLISHING-SCALE-CHANNEL-DIRECT-CASH-03/D1",
      "M2-EXP-PUBLISHING-SCALE-CHANNEL-DIRECT-CASH-03/P"
    ]
  );
});

test("PSC03 excludes every PSC02 authority field and keeps closed boundaries", () => {
  assert.deepEqual(publicPreregistration.psc02Dependencies, {
    componentId: false,
    revisionId: false,
    effectiveAt: false,
    availableAt: false,
    extraThreeLedgerRowsAsGate: false,
    psc02Replay: false
  });
  assert.equal(preregistration.closedBoundaries.activeCandidate, null);
  assert.equal(preregistration.closedBoundaries.approvedForAutomation, null);
  assert.equal(preregistration.closedBoundaries.productionReady, false);
  assert.equal(preregistration.closedBoundaries.finalHoldoutOpened, false);
  assert.equal(preregistration.closedBoundaries.independentEvaluationOpened, false);
  assert.equal(preregistration.closedBoundaries.laterOriginOpened, false);
});

test("PSC03 registry identity, lineage and diagnostic arm roles remain explicit", () => {
  const model = registry.models.find((row) => row.stableModelId === "M2-CHAN-PSC03");
  const experiment = registry.experiments.find(
    (row) => row.experimentId === "M2-EXP-PUBLISHING-SCALE-CHANNEL-DIRECT-CASH-03"
  );
  assert.ok(model);
  assert.ok(experiment);
  assert.equal(model.rawCandidateVariantId, "M2-CHAN-PSC03-RAW");
  assert.deepEqual(model.predecessorIds, ["M2-CHAN-PSC01"]);
  assert.deepEqual(model.relatedBlockedDesignIds, ["M2-CHAN-PSC02"]);
  assert.deepEqual(
    experiment.arms.map((arm) => `${experiment.experimentId}/${arm.armId}`),
    [
      "M2-EXP-PUBLISHING-SCALE-CHANNEL-DIRECT-CASH-03/D0",
      "M2-EXP-PUBLISHING-SCALE-CHANNEL-DIRECT-CASH-03/D1",
      "M2-EXP-PUBLISHING-SCALE-CHANNEL-DIRECT-CASH-03/P"
    ]
  );
  assert.equal(registry.currentRoles.activeCandidate, null);
  assert.equal(registry.currentRoles.approvedForAutomation, null);
});

test("PSC03 public synthetic evidence is not promoted to model performance", () => {
  assert.equal(publicDiagnostic.status, "PSC03_PUBLIC_SYNTHETIC_FULL_PATH_PASSED");
  assert.equal(publicDiagnostic.boundaries.publicSyntheticOnly, true);
  assert.equal(publicDiagnostic.boundaries.privateArtifactRead, false);
  assert.equal(publicDiagnostic.boundaries.comparatorLoadedAfterPrimarySeal, true);
  assert.equal(publicDiagnostic.boundaries.taxonomyUsed, false);
  assert.equal(publicDiagnostic.boundaries.lg01PredictionDependency, false);
  assert.ok([
    "NO_MODEL_PERFORMANCE_EVIDENCE",
    "DEVELOPMENT_REPLAY_MODEL_PERFORMANCE_EVIDENCE"
  ].includes(publicEvaluation.modelPerformanceEvidenceStatus));
  if (publicEvaluation.modelPerformanceEvidenceStatus === "NO_MODEL_PERFORMANCE_EVIDENCE") {
    assert.equal(publicEvaluation.metrics, null);
    assert.equal(publicEvaluation.predictionGenerated, false);
  }
});

test("PSC03 current public entrypoints retain Chinese-first identity and current-state mapping", () => {
  const files = [
    "README.md",
    "docs/analysis/m2-current/M2-model-catalog-and-scorecard-v1.md",
    registry.currentRoles.latestStateIndex,
    development.publicOutputs.preregistrationMarkdown,
    development.publicOutputs.developmentMarkdown,
    development.publicOutputs.decisionMarkdown
  ];
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    assert.match(text, /出版行业渠道直接现金尺度条件金额模型 v0\.1/);
    assert.match(text, /M2-CHAN-PSC03/);
  }
});
