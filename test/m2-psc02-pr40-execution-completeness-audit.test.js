import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  runM2Psc02ControlledDevelopmentReplay
} from "../scripts/m2-current/publishing_scale_cash_anchor_execution.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const auditPath = path.join(
  root,
  "docs",
  "analysis",
  "m2-current",
  "M2-psc02-pr40-execution-completeness-and-source-authority-recovery-audit-v0.1.json"
);
const audit = JSON.parse(await readFile(auditPath, "utf8"));

test("PSC02 current authority selects D1 and separates three status dimensions", () => {
  assert.equal(audit.decisionBranch, "D1");
  assert.deepEqual(audit.currentStatuses, {
    sourceAuthority:
      "PSC02_HISTORICAL_REPLAY_BLOCKED_NO_RECOVERABLE_ORIGIN_VISIBLE_CASH_AUTHORITY",
    modelPerformanceEvidence: "NO_MODEL_PERFORMANCE_EVIDENCE",
    executionCompleteness:
      "PSC02_EXECUTION_IMPLEMENTATION_INCOMPLETE_NO_CANDIDATE_RESULT"
  });
  assert.equal(audit.historicalAttempt.resultStatus, "PSC02_DEVELOPMENT_NOT_SUPPORTED");
  assert.equal(audit.historicalAttempt.receiptPreservedByteIdentical, true);
  assert.equal(audit.historicalAttempt.candidateFitStarted, false);
  assert.equal(audit.historicalAttempt.realPredictionGenerated, false);
  assert.equal(audit.historicalAttempt.predictionRowsProduced, 0);
  assert.equal(audit.historicalAttempt.outerOutcomeOpened, false);
  assert.equal(audit.historicalAttempt.candidateMetricsComputed, false);
  assert.equal(audit.historicalAttempt.bootstrapExecuted, false);
});

test("PSC02 machine matrix proves every real success stage incomplete", () => {
  assert.equal(audit.executionCompletenessMatrix.length, 16);
  assert.deepEqual(
    audit.executionCompletenessMatrix.map((entry) => entry.stage),
    Array.from({length: 16}, (_, index) => index + 1)
  );
  assert.ok(audit.executionCompletenessMatrix.every((entry) => (
    entry.complete === false
  )));
  assert.equal(audit.runnerFinding.completePrimaryRawResultPathReachable, false);
  assert.equal(
    audit.publicDiagnostic.implementation.realRunnerSuccessPathReachable,
    false
  );
  for (const required of [
    "component_authority_adapter",
    "origin_visible_component_revision_snapshot_selection",
    "P_nested_fit_and_prediction",
    "P_raw_prediction_atomic_freeze",
    "deferred_psc01_lg01_comparator_read",
    "complete_metrics_and_group_diagnostics",
    "paired_whole_work_bootstrap_2000",
    "private_manifest_receipt_digest_and_frozen_outputs"
  ]) {
    assert.ok(audit.executionCompletenessMatrix.some((entry) => (
      entry.name === required
    )));
  }
});

test("all four historical authority fields and all 24 origins are unrecoverable", () => {
  const fields = Object.fromEntries(
    audit.sourceAuthorityRecovery.fieldAssessments.map((entry) => (
      [entry.field, entry.classification]
    ))
  );
  assert.deepEqual(fields, {
    componentId: "NOT_RECOVERABLE",
    revisionId: "NOT_RECOVERABLE",
    effectiveAt: "NOT_RECOVERABLE",
    availableAt: "NOT_RECOVERABLE"
  });
  assert.equal(
    audit.sourceAuthorityRecovery.historicalSnapshots.immutableHistoricalSnapshotsFound,
    false
  );
  assert.equal(
    audit.sourceAuthorityRecovery.historicalSnapshots.revisionLineageFound,
    false
  );
  assert.equal(
    audit.sourceAuthorityRecovery.historicalSnapshots.availabilityLineageFound,
    false
  );
  assert.equal(audit.sourceAuthorityRecovery.originCoverage.primaryOrigins.length, 13);
  assert.equal(audit.sourceAuthorityRecovery.originCoverage.strictOrigins.length, 11);
  assert.equal(audit.sourceAuthorityRecovery.originCoverage.totalFrozenOrigins, 24);
  assert.equal(audit.sourceAuthorityRecovery.originCoverage.reconstructableOrigins, 0);
});

test("ledger partition finding is aggregate-only and identifies additive sales-share variants", () => {
  assert.equal(audit.ledgerPartitionAudit.missingFromPartition, 0);
  assert.equal(audit.ledgerPartitionAudit.extraInPartition, 3);
  assert.equal(
    audit.ledgerPartitionAudit.classification,
    "SALES_SHARE_ONLY_ADDITIVE_AMOUNT_VARIANTS_ABSENT_FROM_TOTAL_LEDGER"
  );
  assert.equal(audit.ledgerPartitionAudit.exactDuplicates, false);
  assert.equal(audit.ledgerPartitionAudit.legitimateSplitOrReplacement, false);
  assert.equal(audit.ledgerPartitionAudit.classificationDrift, false);
  assert.equal(audit.ledgerPartitionAudit.comparisonKeyOmission, false);
  assert.equal(audit.ledgerPartitionAudit.reversalInvolved, false);
  assert.equal(audit.ledgerPartitionAudit.buyoutInvolved, false);
  assert.equal(audit.ledgerPartitionAudit.unallocatedResidualInvolved, false);
  assert.equal(audit.ledgerPartitionAudit.deletingExtraRowsWouldChangeCash, true);
  assert.match(audit.ledgerPartitionAudit.extraMultisetSha256, /^[0-9a-f]{64}$/u);
  assert.doesNotMatch(
    JSON.stringify(audit),
    /data[\\/]+private-(?:input|output)|[A-Z]:[\\/]|\.xlsx/iu
  );
});

test("PSC02 replay command fails before Git, private directories, or receipts", async () => {
  await assert.rejects(
    runM2Psc02ControlledDevelopmentReplay({root}),
    /m2_psc02_historical_replay_not_authorized_execution_incomplete/u
  );
  const source = await readFile(
    path.join(
      root,
      "scripts",
      "m2-current",
      "publishing_scale_cash_anchor_execution.mjs"
    ),
    "utf8"
  );
  const guard = source.indexOf(
    "m2_psc02_historical_replay_not_authorized_execution_incomplete"
  );
  const gitPreflight = source.indexOf(
    "const gitPreflight = verifyM2PublishingScaleGitAndCiPreflight"
  );
  assert.ok(guard >= 0);
  assert.ok(gitPreflight > guard);
});

test("registry keeps PSC02 scoreless and current public diagnostic is audit-bound", async () => {
  const registry = JSON.parse(await readFile(
    path.join(root, "config", "m2-model-registry.v1.json"),
    "utf8"
  ));
  const model = registry.models.find((entry) => (
    entry.stableModelId === "M2-CHAN-PSC02"
  ));
  assert.deepEqual(model.evaluations, []);
  assert.equal(registry.currentRoles.activeCandidate, null);
  assert.equal(registry.currentRoles.approvedForAutomation, null);
  assert.equal(
    registry.currentRoles.latestStateIndex,
    "docs/analysis/m2-v2/M2-v2-current-state-index-v0.59.md"
  );
  assert.equal(
    audit.publicDiagnostic.status,
    "PSC02_EXECUTION_IMPLEMENTATION_INCOMPLETE_NO_CANDIDATE_RESULT"
  );
  assert.equal(audit.publicDiagnostic.execution.modelPerformanceEvaluated, false);
  assert.equal(audit.publicDiagnostic.execution.controlledDevelopmentReplayAuthorized, false);
});
