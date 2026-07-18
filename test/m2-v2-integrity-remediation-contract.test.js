import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  sha256,
  syntheticReceiptEnvelope,
  syntheticTransactionManifest,
} from "./fixtures/m2V2IntegrityRemediation.fixture.js";

const root = process.cwd();
const designRoot = join(root, "docs/technical-design/m2-v2");
const analysisRoot = join(root, "docs/analysis/m2-v2");

const contractFiles = {
  verifier: join(designRoot, "M2-v2-verifier-readonly-contract-v0.1.json"),
  recovery: join(designRoot, "M2-v2-private-state-recovery-contract-v0.1.json"),
  atomic: join(designRoot, "M2-v2-request-state-atomic-binding-v0.1.json"),
  preregistration: join(analysisRoot, "M2-v2-integrity-remediation-pre-registration-v0.1.json"),
};

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

test("integrity remediation contracts are frozen as paired public Markdown and JSON artifacts", () => {
  for (const path of Object.values(contractFiles)) {
    assert.equal(existsSync(path), true, path);
    assert.equal(existsSync(path.replace(/\.json$/u, ".md")), true, path);
    assert.match(readJson(path).status, /^frozen_before_/u);
  }
});

test("verifier contract permits no filesystem, runtime, provider, or governed-state mutation", () => {
  const contract = readJson(contractFiles.verifier);
  assert.deepEqual(contract.commands, [
    "m2:v2:v2b5:verify",
    "m2:v2:v2b6:verify",
    "m2:v2:v2b7:verify",
    "m2:v2:v2b8:verify",
  ]);
  assert.equal(contract.auditReceiptBoundary.defaultVerifyWritesReceipt, false);
  assert.equal(contract.determinism.network, false);
  for (const effect of ["create_file", "modify_file", "mutate_cache", "mutate_receipt", "mutate_counter", "call_provider"]) {
    assert.equal(contract.forbiddenVerifyEffects.includes(effect), true, effect);
  }
  assert.equal(contract.proof.passRule, "all_three_snapshot_digests_and_member_manifests_are_identical");
});

test("recovery contract is offline, staged, idempotent, and preserves authoritative history", () => {
  const contract = readJson(contractFiles.recovery);
  assert.equal(contract.requiredBackup.beforeAnyRecoveryWrite, true);
  assert.equal(contract.staging.providerRequests, 0);
  assert.equal(contract.staging.sampleReplacement, false);
  assert.equal(contract.staging.counterReset, false);
  assert.equal(contract.commit.partialStateMayBecomeCurrent, false);
  assert.equal(contract.idempotency.secondRecoveryChangesGovernedHashes, false);
  assert.equal(contract.rollback.deleteAuditEvidence, false);
  assert.equal(contract.rollback.silentlyOverwriteHistoricalReport, false);
});

test("receipt-envelope v0.2 keeps runtime cache views outside the immutable receipt digest", () => {
  const first = syntheticReceiptEnvelope({ cacheHit: false, readAt: null });
  const second = syntheticReceiptEnvelope({ cacheHit: true, readAt: "2026-01-02T00:00:00.000Z" });
  assert.equal(first.receiptDigest, second.receiptDigest);
  assert.equal(first.receiptDigest, sha256(first.receiptPayload));
  assert.notEqual(sha256(first.runtimeView), sha256(second.runtimeView));

  const contract = readJson(contractFiles.atomic);
  assert.equal(contract.receiptEnvelope.schemaVersion, "receipt-envelope-v0.2");
  assert.equal(contract.receiptEnvelope.runtimeFieldsMayMutateReceiptPayload, false);
  assert.equal(contract.cacheHit.changeReceiptDigest, false);
  assert.equal(contract.requestLedger.countersMustRecomputeFromLedger, true);
});

test("synthetic transaction fixture contains every frozen atomic binding", () => {
  const manifest = syntheticTransactionManifest();
  const contract = readJson(contractFiles.atomic);
  for (const field of contract.transactionManifest.fields) {
    assert.equal(Object.hasOwn(manifest, field), true, field);
  }
  assert.equal(contract.failureSemantics.partialTransactionMayBecomeCurrent, false);
  assert.equal(contract.verification.noProviderRequired, true);
});

test("pre-registration freezes initial findings, baseline metrics, five B8 repairs, and zero-provider scope", () => {
  const preregistration = readJson(contractFiles.preregistration);
  assert.deepEqual(preregistration.startingAudit.findingCounts, { P0: 0, P1: 13, P2: 21, P3: 6 });
  assert.deepEqual(preregistration.startingAudit.trackedCoverage, { audited: 1555, total: 1555, rate: 1 });
  assert.equal(preregistration.frozenBaseline.search.successfulQueries, 26);
  assert.equal(preregistration.frozenBaseline.search.totalQueries, 27);
  assert.equal(preregistration.frozenBaseline.evidence.accepted, 52);
  assert.equal(preregistration.frozenBaseline.citation.postRepairAligned, 226);
  assert.equal(preregistration.frozenBaseline.decision, "CANARY_CONDITIONAL");
  assert.equal(preregistration.b8ContractRepairs.length, 5);
  assert.equal(preregistration.prohibitions.providerRequests, 0);
  assert.equal(preregistration.prohibitions.full160, false);
  assert.equal(preregistration.prohibitions.modelTraining, false);
  assert.equal(preregistration.startingAudit.nextDevelopmentReadiness, "NOT_AUTHORIZED");
});
