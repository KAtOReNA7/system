import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const readJson = (relative) => JSON.parse(readFileSync(join(root, relative), "utf8"));

const preregistrationPath = "docs/analysis/m2-v2/M2-v2-PR7-P1-remediation-pre-registration-v0.1.json";
const contractPaths = [
  "docs/technical-design/m2-v2/M2-v2-verifier-authority-binding-v0.2.json",
  "docs/technical-design/m2-v2/M2-v2-append-only-request-ledger-v0.1.json",
  "docs/technical-design/m2-v2/M2-v2-group-atomic-private-recovery-v0.2.json",
  "docs/technical-design/m2-v2/M2-v2-migration-set-integrity-v0.2.json",
  "docs/technical-design/m2-v2/M2-v2-provider-transport-retention-v0.1.json",
  "docs/technical-design/m2-v2/M2-v2-workbook-independent-verification-v0.1.json",
  "docs/technical-design/m2-v2/M2-v2-event-time-clause-binding-v0.3.json",
  "docs/technical-design/m2-v2/M2-v2-conflict-applicability-v0.3.json",
];

test("PR7 P1 remediation preregistration freezes all 13 findings without downgrade", () => {
  const preregistration = readJson(preregistrationPath);
  assert.equal(preregistration.status, "frozen_before_implementation");
  assert.equal(preregistration.scope.p1Required, 13);
  assert.equal(preregistration.scope.p1MayBeMergedOrDowngraded, false);
  assert.deepEqual(
    preregistration.findings.map((finding) => finding.findingId),
    Array.from({ length: 13 }, (_, index) => `PR7-P1-${String(index + 1).padStart(3, "0")}`),
  );
  for (const finding of preregistration.findings) {
    assert.equal(finding.status, "planned");
    for (const field of ["affectedFiles", "rootCause", "plannedFix", "tests", "privateMigration", "publicArtifact", "acceptanceGate"]) {
      assert.ok(finding[field], `${finding.findingId}:${field}`);
    }
  }
});

test("PR7 P1 remediation contracts are frozen before implementation", () => {
  for (const relative of contractPaths) {
    const contract = readJson(relative);
    assert.equal(contract.status, "frozen_before_implementation", relative);
    assert.equal(contract.classification, "public_sanitized_not_for_formal_decision", relative);
  }
});

test("authority binding contract is exact, read-only and fault-injection complete", () => {
  const contract = readJson(contractPaths[0]);
  assert.equal(contract.currentAuthority.historicalDecisionMaySatisfyCurrent, false);
  assert.equal(contract.rules.exactRoleSet, true);
  assert.equal(contract.rules.verifierReadOnly, true);
  assert.equal(contract.rules.providerRequestDelta, 0);
  assert.equal(contract.faultInjectionRequired.length, 10);
  assert.equal(contract.authorization.full160Authorized, false);
});

test("ledger, recovery and migration contracts prohibit rollback and partial current state", () => {
  const ledger = readJson(contractPaths[1]);
  const recovery = readJson(contractPaths[2]);
  const migration = readJson(contractPaths[3]);
  assert.equal(ledger.invariants.reservedBudgetRollbackAllowed, false);
  assert.equal(ledger.invariants.reservationDeletionAllowed, false);
  assert.equal(ledger.invariants.countersDerivedOnlyByReplay, true);
  assert.equal(recovery.promotion.partialStateMayBecomeCurrent, false);
  assert.equal(recovery.idempotency.sameInputRerun, "verified_no_op");
  assert.equal(migration.setRule, "actual_file_set_equals_manifest_file_set");
  assert.equal(migration.copyRule, "copy_verified_manifest_members_only");
  assert.equal(migration.transaction.partialStateMayBecomeCurrent, false);
});

test("provider, workbook, EventTime and conflict contracts fail closed", () => {
  const provider = readJson(contractPaths[4]);
  const workbook = readJson(contractPaths[5]);
  const eventTime = readJson(contractPaths[6]);
  const conflict = readJson(contractPaths[7]);
  assert.equal(provider.endpointRules.protocol, "https:");
  assert.equal(provider.responsesRetention.store, false);
  assert.equal(provider.responsesRetention.missingOrTrue, "fail_before_dispatch");
  assert.equal(workbook.callerAssertionsAcceptedAsFacts, false);
  assert.equal(workbook.visualReview.structuralVerifierMaySetTrue, false);
  assert.equal(eventTime.bindingRules.firstDateFallbackAllowed, false);
  assert.equal(eventTime.bindingRules.ambiguousReturnsNull, true);
  assert.equal(conflict.modelContradictionKeyTrusted, false);
  assert.equal(conflict.emptyInput.requiredGatePassed, false);
});

test("remediation preregistration preserves all forbidden execution boundaries", () => {
  const boundaries = readJson(preregistrationPath).boundaries;
  assert.equal(boundaries.providerRequestDelta, 0);
  for (const key of ["canaryAuthorized", "full160Authorized", "modelTrainingAuthorized", "b4ChangeAuthorized", "formalCashChangeAuthorized", "holdoutOpenAuthorized", "releaseAuthorized", "mergeAuthorized"]) {
    assert.equal(boundaries[key], false, key);
  }
  assert.equal(boundaries.nextDevelopmentReadiness, "NOT_AUTHORIZED");
});
