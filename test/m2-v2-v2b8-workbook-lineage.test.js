import assert from "node:assert/strict";
import test from "node:test";

import { sha256 } from "../src/domain/m2V2EvidencePilot/pilotCore.js";
import {
  assertIndependentWorkbookHyperlinkLineage,
  deriveIndependentWorkbookHyperlinkLineage,
} from "../src/domain/m2V2EvidencePilot/workbookIndependentVerifier.js";
import { __test as v2b8Test } from "../src/domain/m2V2EvidencePilot/v2b8Runtime.js";

test("hyperlink lineage is derived, hostless, order-stable, and occurrence-bound", () => {
  const first = independentVerification([
    targetFact("1".repeat(64), 70),
    targetFact("2".repeat(64), 45),
  ]);
  const second = independentVerification([...first.hyperlinkTargets].reverse());
  const left = deriveIndependentWorkbookHyperlinkLineage(first);
  const right = deriveIndependentWorkbookHyperlinkLineage(second);
  assert.deepEqual(left, right);
  assert.equal(left.occurrenceCount, 115);
  assert.equal(left.uniqueTargetFactCount, 2);
  assert.equal(left.rawTargetsPersisted, false);
  assert.equal(left.hostValuesPersisted, false);
  assert.equal(JSON.stringify(left).includes("://"), false);
  assert.equal(assertIndependentWorkbookHyperlinkLineage(left, { expectedOccurrenceCount: 115 }), true);
});

test("B8 workbook receipt requires independently derived hyperlink lineage", () => {
  const lineage = deriveIndependentWorkbookHyperlinkLineage(independentVerification([
    targetFact("3".repeat(64), 115),
  ]));
  const receipt = signedReceipt(lineage);
  assert.equal(v2b8Test.workbookVerificationPassed(receipt), true);

  const aggregateOnly = structuredClone(receipt);
  delete aggregateOnly.hyperlinkTargetLineage;
  resign(aggregateOnly);
  assert.equal(v2b8Test.workbookVerificationPassed(aggregateOnly), false);

  const tamperedFact = structuredClone(receipt);
  tamperedFact.hyperlinkTargetLineage.targetFacts[0].targetDigest = "4".repeat(64);
  resign(tamperedFact);
  assert.equal(v2b8Test.workbookVerificationPassed(tamperedFact), false);

  const rawTargetInjected = structuredClone(receipt);
  rawTargetInjected.hyperlinkTarget = "https://example.test/private";
  resign(rawTargetInjected);
  assert.equal(v2b8Test.workbookVerificationPassed(rawTargetInjected), false);

  const tamperedOccurrence = structuredClone(receipt);
  tamperedOccurrence.hyperlinkTargetLineage.targetFacts[0].occurrenceCount = 114;
  tamperedOccurrence.hyperlinkTargetLineage.occurrenceCount = 114;
  const { lineageDigest: ignored, ...lineagePayload } = tamperedOccurrence.hyperlinkTargetLineage;
  void ignored;
  tamperedOccurrence.hyperlinkTargetLineage.lineageDigest = sha256(lineagePayload);
  resign(tamperedOccurrence);
  assert.equal(v2b8Test.workbookVerificationPassed(tamperedOccurrence), false);
});

function independentVerification(hyperlinkTargets) {
  return {
    schema: "m2.v2.independent-workbook-verification.v0.1",
    verificationBasis: "xlsx_zip_xml_actual_object",
    generatorAssertionsTrusted: false,
    workbookSha256: "a".repeat(64),
    passed: true,
    issues: [],
    sheetNames: ["Review"],
    rowCounts: [1],
    formulaCount: 0,
    formulaErrorCount: 0,
    hyperlinkCount: hyperlinkTargets.reduce((total, target) => total + target.occurrenceCount, 0),
    validationCount: 3,
    forbiddenValueCount: 0,
    internalIdCount: 0,
    incomeValueCount: 0,
    secretCount: 0,
    externalLinkCount: 0,
    cachedFormulaErrors: [],
    hyperlinkTargets,
  };
}

function targetFact(targetDigest, occurrenceCount) {
  return {
    protocol: "https",
    targetMode: "External",
    relationshipType: "hyperlink",
    targetDigest,
    occurrenceCount,
  };
}

function signedReceipt(hyperlinkTargetLineage) {
  const payload = {
    schema: "m2.v2.v2b8-workbook-verification-private.v0.3",
    privateOnly: true,
    verifiedAt: "2026-07-19T00:00:00.000Z",
    exists: true,
    verificationBasis: "xlsx_zip_xml_actual_object",
    generatorAssertionsTrusted: false,
    independentObjectVerified: true,
    verificationIssues: [],
    workbookSha256: "a".repeat(64),
    byteLength: 1,
    sheetCount: 4,
    sheetNames: ["A", "B", "C", "D"],
    rowCounts: [1, 1, 1, 1],
    formulaCount: 2,
    formulaErrorCount: 0,
    cachedFormulaErrors: [],
    formulaHyperlinkCount: 0,
    hyperlinkCount: 115,
    hyperlinkTargetLineage,
    validationCount: 3,
    forbiddenValueCount: 0,
    internalIdCount: 0,
    incomeValueCount: 0,
    secretCount: 0,
    externalLinkCount: 0,
    visualReviewAttested: false,
    visualReviewStatus: "NOT_HUMAN_ATTESTED",
    ignoredAndUntracked: true,
    full160Authorized: false,
  };
  return { ...payload, receiptDigest: sha256(payload) };
}

function resign(receipt) {
  const { receiptDigest: ignored, ...payload } = receipt;
  void ignored;
  receipt.receiptDigest = sha256(payload);
}
