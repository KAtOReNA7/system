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
const finalCiReceipt = readJson(
  "docs/analysis/m2-current/M2-publishing-scale-channel-direct-cash-final-ci-receipt-v0.1.json"
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
  assert.equal(model.currentRole, "failed_development_candidate");
  assert.equal(model.evaluations.length, 1);
  assert.equal(model.evaluations[0].evidenceClass, "DEVELOPMENT_REPLAY");
  assert.equal(model.evaluations[0].independentEvidence, false);
  assert.equal(
    model.evaluations[0].resultStatus,
    "PSC03_DEVELOPMENT_NOT_SUPPORTED"
  );
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
  assert.equal(registry.currentRoles.activeExperiment, null);
  assert.equal(experiment.resultStatus, "PSC03_DEVELOPMENT_NOT_SUPPORTED");
  assert.equal(experiment.realPredictionGenerated, true);
  assert.equal(experiment.rawCandidateRepeated, false);
});

test("PSC03 public synthetic evidence stays separate from frozen replay performance", () => {
  assert.equal(publicDiagnostic.status, "PSC03_PUBLIC_SYNTHETIC_FULL_PATH_PASSED");
  assert.equal(publicDiagnostic.boundaries.publicSyntheticOnly, true);
  assert.equal(publicDiagnostic.boundaries.privateArtifactRead, false);
  assert.equal(publicDiagnostic.boundaries.comparatorLoadedAfterPrimarySeal, true);
  assert.equal(publicDiagnostic.boundaries.taxonomyUsed, false);
  assert.equal(publicDiagnostic.boundaries.lg01PredictionDependency, false);
  assert.equal(
    publicEvaluation.modelPerformanceEvidenceStatus,
    "DEVELOPMENT_REPLAY_MODEL_PERFORMANCE_EVIDENCE"
  );
  assert.equal(publicEvaluation.status, "PSC03_DEVELOPMENT_NOT_SUPPORTED");
  assert.equal(publicEvaluation.predictionGenerated, true);
  assert.equal(publicEvaluation.evidenceClass, "DEVELOPMENT_REPLAY");
  assert.equal(publicEvaluation.execution.firstCompletePrimaryRawResultFormed, true);
  assert.equal(publicEvaluation.execution.primaryRawRepeated, false);
  assert.equal(publicEvaluation.execution.primaryRawRowCount, 3318819);
  assert.equal(publicEvaluation.execution.occurrenceBitForBitParity, true);
  assert.equal(publicEvaluation.execution.exactPsc01PopulationCoverage, true);
  assert.equal(publicEvaluation.execution.comparatorLoadedAfterPrimarySeal, true);
  assert.equal(publicEvaluation.boundaries.independentEvaluationOpened, false);
  assert.equal(publicEvaluation.boundaries.laterOriginOpened, false);
  assert.equal(publicEvaluation.boundaries.finalHoldoutOpened, false);
  assert.equal(publicEvaluation.boundaries.productionReady, false);
  assert.equal(publicEvaluation.scaleHypothesis.diagnostics.allPassed, false);
  assert.equal(
    publicEvaluation.scaleHypothesis.diagnostics.gates.strictRelativeFva,
    false
  );
  assert.equal(publicEvaluation.arms.P.primary.workTotal.wape, 0.5426465402440889);
  assert.equal(publicEvaluation.arms.P.strict.workTotal.wape, 2.9708217440793465);
  assert.equal(publicEvaluation.comparisons.integrity.sameTarget, true);
  assert.equal(publicEvaluation.comparisons.integrity.sameActualDefinition, true);
  for (const comparator of ["psc01Primary", "psc01Strict", "lg01Primary", "lg01Strict"]) {
    const integrity = publicEvaluation.comparisons.integrity[comparator];
    assert.equal(integrity.sameCase, true);
    assert.equal(integrity.sameOrigin, true);
    assert.equal(integrity.sameHorizon, true);
    assert.equal(integrity.sameActualValues, true);
  }
});

test("PSC03 public replay aggregates enforce the preregistered privacy threshold", () => {
  let published = 0;
  let suppressed = 0;
  const visit = (value) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    if (value.status === "PUBLISHED_AGGREGATE") {
      published += 1;
      assert.ok(value.metrics.caseCount >= 30);
      assert.ok(value.metrics.workCount >= 20);
    }
    if (value.status === "SUPPRESSED_PRIVACY_THRESHOLD") {
      suppressed += 1;
      assert.equal(value.metrics, null);
    }
    Object.values(value).forEach(visit);
  };
  visit(publicEvaluation);
  assert.equal(published, 215);
  assert.equal(suppressed, 9);
});

test("PSC03 result content has a first-attempt dual-platform exact-head CI receipt", () => {
  assert.equal(finalCiReceipt.status, "PSC03_FINAL_RESULT_EXACT_HEAD_CI_PASSED");
  assert.equal(finalCiReceipt.modelId, "M2-CHAN-PSC03");
  assert.equal(finalCiReceipt.resultStatus, "PSC03_DEVELOPMENT_NOT_SUPPORTED");
  assert.equal(finalCiReceipt.ci.headSha, finalCiReceipt.validatedResultHead);
  assert.equal(finalCiReceipt.ci.attempt, 1);
  assert.equal(finalCiReceipt.ci.linux, "SUCCESS");
  assert.equal(finalCiReceipt.ci.windows, "SUCCESS");
  assert.equal(finalCiReceipt.ci.sameShaRerunUsed, false);
  assert.equal(finalCiReceipt.integrity.primaryRawRepeated, false);
  assert.equal(finalCiReceipt.receiptBoundary.modelReplayAuthorized, false);
  assert.equal(finalCiReceipt.receiptBoundary.finalPrHeadCiRequiredAfterReceiptCommit, true);
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
