import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const resultPath =
  "docs/analysis/m2-current/"
    + "M2-publishing-scale-channel-origin-visible-cash-anchor-"
    + "development-evaluation-v0.1.json";
const reportPath = resultPath.replace(/\.json$/u, ".md");
const decisionPath =
  "docs/analysis/m2-current/"
    + "M2-publishing-scale-channel-origin-visible-cash-anchor-"
    + "implementation-and-result-decision-v0.1.md";
const statePath = "docs/analysis/m2-v2/M2-v2-current-state-index-v0.60.md";

const result = await readJson(resultPath);
const registry = await readJson("config/m2-model-registry.v1.json");
const capabilityCatalog = await readJson(
  "config/development-capability-catalog.v0.1.json"
);
const [report, decision, state, readme] = await Promise.all([
  readText(reportPath),
  readText(decisionPath),
  readText(statePath),
  readText("README.md")
]);

test("PSC02 controlled replay froze a source-authority blocker before any candidate result", () => {
  assert.equal(result.status, "PSC02_DEVELOPMENT_NOT_SUPPORTED");
  assert.equal(
    result.decisionClass,
    "PRIVATE_SOURCE_AUTHORITY_BLOCKER_NOT_MODEL_FAILURE"
  );
  assert.equal(result.evidenceClass, "DEVELOPMENT_REPLAY");
  assert.deepEqual(result.execution, {
    attemptCount: 1,
    resultBeforeEngineeringAttemptCount: 1,
    firstCompletePrimaryRawResultFormed: false,
    frozenPrimaryRawResultExists: false,
    receiptSchema: "m2.current.psc02.development_replay_receipt.private.v0.1",
    receiptFilePublished: false,
    receiptIdentityRecordedPrivately: true,
    candidateFitStarted: false,
    realPredictionGenerated: false,
    predictionRowsProduced: 0,
    outerOutcomeOpened: false,
    candidateMetricsComputed: false,
    bootstrapExecuted: false
  });
  assert.match(result.preExecution.exactHead, /^[0-9a-f]{40}$/u);
  assert.equal(result.preExecution.linuxCheck, "SUCCESS");
  assert.equal(result.preExecution.windowsCheck, "SUCCESS");
  for (const field of [
    "codeSha256",
    "configSha256",
    "preregistrationSha256",
    "anchorSchemaSha256"
  ]) {
    assert.match(result.preExecution[field], /^[0-9a-f]{64}$/u);
  }
});

test("PSC02 public blocker identifies the missing non-derivable authority without leaking private evidence", () => {
  assert.equal(result.privateAuthority.sourceFilesPresent, true);
  assert.equal(
    result.privateAuthority.componentRevisionTimeSchemaReady,
    false
  );
  assert.deepEqual(result.privateAuthority.missingNonDerivableFields, [
    "componentId",
    "revisionId",
    "effectiveAt",
    "availableAt"
  ]);
  assert.equal(
    result.privateAuthority.ledgerPartitionReconciliationStatus,
    "FAILED_CLOSED"
  );
  assert.match(
    result.privateAuthority.ledgerPartitionReconciliationError,
    /missing=0, extra=3/u
  );
  assert.equal(result.privateAuthority.frozenPsc01ReceiptCount, 1);
  assert.equal(result.privateAuthority.frozenPsc01ManifestValid, true);
  assert.equal(result.privateAuthority.frozenPsc01RowCount, 3318819);
  assert.equal(result.privateAuthority.frozenLg01ComparatorPresent, true);
  assert.equal(result.privateAuthority.frozenLg01ScoresRead, false);
  assert.equal(result.privateAuthority.rowLevelPrivateDataPublished, false);
  assert.equal(result.privateAuthority.privateDigestPublished, false);
  assert.doesNotMatch(
    JSON.stringify(result),
    /data[\\/]+private-(?:input|output)|[A-Z]:[\\/]|\.xlsx/iu
  );
});

test("all PSC02 experiment arms and all score families remain not executed", () => {
  const arms = Object.values(result.arms);
  assert.deepEqual(arms.map((arm) => arm.armId), [
    "M2-EXP-PUBLISHING-SCALE-CHANNEL-CASH-ANCHOR-02/D0",
    "M2-EXP-PUBLISHING-SCALE-CHANNEL-CASH-ANCHOR-02/D1",
    "M2-EXP-PUBLISHING-SCALE-CHANNEL-CASH-ANCHOR-02/P"
  ]);
  assert.ok(arms.every((arm) => (
    arm.status === "NOT_EXECUTED_PRIVATE_SOURCE_AUTHORITY_BLOCKED"
    && arm.metrics === null
  )));
  assert.equal(result.arms.primary.pairedBootstrap, null);
  assert.ok(Object.values(result.metrics).every((value) => (
    value === null || value === "NO_CANDIDATE_RESULT_SOURCE_AUTHORITY_BLOCKED"
  )));
  assert.equal(
    result.correctnessGates.occurrenceBinary64Parity,
    "NOT_EXECUTED_BEFORE_PREDICTION"
  );
  assert.equal(
    result.correctnessGates.exactPsc01CaseCoverage,
    "NOT_EXECUTED_BEFORE_PREDICTION"
  );
  assert.equal(result.interpretation.modelPerformanceEvaluated, false);
  assert.equal(result.interpretation.candidateFailedOnMetrics, false);
  assert.equal(result.interpretation.independentEvaluationRequestSupported, false);
});

test("Model Registry and capability catalog close PSC02 without inventing an evaluation row", () => {
  const model = registry.models.find(
    (value) => value.stableModelId === "M2-CHAN-PSC02"
  );
  const experiment = registry.experiments.find(
    (value) => value.experimentId
      === "M2-EXP-PUBLISHING-SCALE-CHANNEL-CASH-ANCHOR-02"
  );
  assert.equal(model.currentRole, "blocked_execution_incomplete_no_candidate_outcome");
  assert.deepEqual(model.evaluations, []);
  assert.equal(
    experiment.resultStatus,
    "PSC02_HISTORICAL_REPLAY_BLOCKED_NO_RECOVERABLE_ORIGIN_VISIBLE_CASH_AUTHORITY"
  );
  assert.equal(
    experiment.historicalAttemptStatus,
    "PSC02_DEVELOPMENT_NOT_SUPPORTED"
  );
  assert.equal(
    experiment.executionCompletenessStatus,
    "PSC02_EXECUTION_IMPLEMENTATION_INCOMPLETE_NO_CANDIDATE_RESULT"
  );
  assert.equal(
    experiment.modelPerformanceEvidenceStatus,
    "NO_MODEL_PERFORMANCE_EVIDENCE"
  );
  assert.equal(experiment.realPredictionGenerated, false);
  assert.equal(experiment.evaluationExecuted, false);
  assert.ok(experiment.arms.every((arm) => (
    arm.executionStatus === "NOT_EXECUTED_PRIVATE_SOURCE_AUTHORITY_BLOCKED"
  )));
  assert.equal(registry.currentRoles.latestStateIndex, statePath);
  assert.equal(registry.currentRoles.activeCandidate, null);
  assert.equal(registry.currentRoles.approvedForAutomation, null);
  const statusIds = new Set(registry.nonModelIdentifiers.map(
    (value) => value.identifier
  ));
  for (const status of [
    "PSC02_DEVELOPMENT_NOT_SUPPORTED",
    "PRIVATE_SOURCE_AUTHORITY_BLOCKER_NOT_MODEL_FAILURE",
    "NOT_EXECUTED_PRIVATE_SOURCE_AUTHORITY_BLOCKED"
  ]) {
    assert.ok(statusIds.has(status));
  }
  const capability = capabilityCatalog.capabilities.find(
    (value) => value.id === "m2-current-publishing-scale-cash-anchor-development"
  );
  assert.match(
    capability.authorization,
    /AUDIT_ONLY_HISTORICAL_REPLAY_BLOCKED_SOURCE_AUTHORITY_NOT_RECOVERABLE/u
  );
  assert.ok(!capability.canonicalValidationCommands.includes(
    "npm run develop:m2:current:publishing-scale-cash-anchor"
  ));
});

test("Chinese-first public surfaces distinguish the blocker from model failure and preserve closed boundaries", () => {
  for (const value of [report, decision, state, readme]) {
    assert.match(value, /PSC02_DEVELOPMENT_NOT_SUPPORTED/u);
    assert.match(value, /PRIVATE_SOURCE_AUTHORITY_BLOCKER_NOT_MODEL_FAILURE/u);
  }
  assert.match(report, /不是模型性能失败/u);
  assert.match(state, /没有模型性能结果/u);
  assert.equal(result.boundaries.activeCandidate, null);
  assert.equal(result.boundaries.approvedForAutomation, null);
  assert.equal(result.boundaries.productionReady, false);
  assert.equal(result.boundaries.finalHoldoutOpened, false);
  assert.equal(result.boundaries.independentEvaluationOpened, false);
  assert.equal(result.boundaries.laterOriginOpened, false);
});

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function readText(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}
