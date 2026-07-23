import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  buildClosedAtomicTransactionManifest,
  createClosedAtomicRequestBinding,
  createReceiptEnvelope,
} from "../src/domain/m2V2EvidencePilot/integrityState.js";
import { sha256 } from "../src/domain/m2V2EvidencePilot/pilotCore.js";
import { appendRequestEvent, replayRequestEventLedger } from "../src/domain/m2V2EvidencePilot/requestEventLedger.js";
import { sourceIdForV2B5Url } from "../src/domain/m2V2EvidencePilot/sourceRecordV2B5.js";
import {
  recomputeV2B8CurrentRestatedEvaluation,
  recomputeV2B8HistoricalEvaluation,
  selectV2B8CurrentRestatementEvaluationDigest,
  verifyV2B8,
} from "../src/domain/m2V2EvidencePilot/v2b8Runtime.js";
import {
  V2B7_CANARY_MANIFEST_DIGEST,
  V2B7_REPEAT_DIGEST,
  V2B7_SOURCE_BUNDLE_DIGEST,
} from "../src/domain/m2V2EvidencePilot/v2b7Contract.js";
import { V2B8_CONFLICT_FAMILIES } from "../src/domain/m2V2EvidencePilot/v2b8Stability.js";

const roots = [];
const gitBoundary = Object.freeze({ auditSucceeded: true, b4Unchanged: true, holdoutSealed: true });
const publicReports = Object.freeze([
  "docs/analysis/m2-v2/M2-v2-claim-canonicalization-v0.1.json",
  "docs/analysis/m2-v2/M2-v2-claim-canonicalization-v0.1.md",
  "docs/analysis/m2-v2/M2-v2-event-time-conflict-audit-v0.1.json",
  "docs/analysis/m2-v2/M2-v2-event-time-conflict-audit-v0.1.md",
  "docs/analysis/m2-v2/M2-v2-source-classification-audit-v0.1.json",
  "docs/analysis/m2-v2/M2-v2-source-classification-audit-v0.1.md",
  "docs/analysis/m2-v2/M2-v2-canary-v3-1-execution-summary-v0.1.json",
  "docs/analysis/m2-v2/M2-v2-canary-v3-1-execution-summary-v0.1.md",
  "docs/analysis/m2-v2/M2-v2-canary-v3-1-reproducibility-v0.1.json",
  "docs/analysis/m2-v2/M2-v2-canary-v3-1-reproducibility-v0.1.md",
  "docs/analysis/m2-v2/M2-v2-canary-v3-1-decision-v0.1.json",
  "docs/analysis/m2-v2/M2-v2-canary-v3-1-decision-v0.1.md",
  "docs/analysis/m2-v2/M2-v2-v2b8-next-step-v0.1.json",
  "docs/analysis/m2-v2/M2-v2-v2b8-next-step-v0.1.md",
]);

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test("B8 verifier recomputes historical/current evaluations and returns explicit authority fields", () => {
  const fixture = buildFixture();
  const before = snapshotGoverned(fixture);
  const verdict = verifyFixture(fixture);
  assert.deepEqual(snapshotGoverned(fixture), before);
  assert.equal(verdict.allPassed, true, verdict.issues.join(","));
  assert.equal(verdict.historicalDecision, "CANARY_CONDITIONAL");
  assert.equal(verdict.historicalEvaluationVerified, true);
  assert.equal(verdict.currentRestatedDecision, "CANARY_FAIL");
  assert.equal(verdict.currentRestatementVerified, true);
  assert.equal(verdict.effectiveReceiptsVerified, true);
  assert.equal(verdict.currentAuthorityDigestVerified, true);
  assert.equal(verdict.transactionBindingVerified, true);
  assert.equal(verdict.full160Authorized, false);
});

test("B8 verifier accepts the exact v0.3 public-report index authority extension", () => {
  const fixture = buildFixture({ authorityGraph: true });
  const verdict = verifyFixture(fixture);
  assert.equal(verdict.allPassed, true, verdict.issues.join(","));
});

test("B8 restatement evaluation digest selection is schema-exact", () => {
  const oldDigest = "a".repeat(64);
  const nextDigest = "b".repeat(64);
  assert.equal(selectV2B8CurrentRestatementEvaluationDigest({
    schema: "m2.v2.canary-v3.1-integrity-restatement-public.v0.3",
    restatedContract: { evaluationDigest: oldDigest },
    currentDecisionComputation: { evaluationDigestSha256: nextDigest },
  }), oldDigest);
  assert.equal(selectV2B8CurrentRestatementEvaluationDigest({
    schema: "m2.v2.canary-v3.1-integrity-restatement-public.v0.4",
    restatedContract: { evaluationDigest: oldDigest },
    currentDecisionComputation: { evaluationDigestSha256: nextDigest },
  }), nextDigest);
  assert.equal(selectV2B8CurrentRestatementEvaluationDigest({
    schema: "m2.v2.canary-v3.1-integrity-restatement-public.v0.5",
    restatedContract: { evaluationDigest: oldDigest },
    currentDecisionComputation: { evaluationDigestSha256: nextDigest },
  }), null);
});

test("B8 public verifier fails closed on bound derived-evaluation tamper", () => {
  const fixture = buildFixture();
  writeFileSync(join(fixture.root, fixture.rolePaths.derived_evaluation), "tampered\n");
  const verdict = verifyFixture(fixture);
  assert.equal(verdict.allPassed, false);
  assert.equal(verdict.currentRestatementVerified, false);
  assert.ok(verdict.issues.some((issue) => issue.includes("closed_member_digest_mismatch:derived_evaluation")));
});

test("B8 public verifier fails closed when a current role is removed", () => {
  const fixture = buildFixture();
  rewriteBinding(fixture, (binding) => {
    binding.members = binding.members.filter((member) => member.role !== "current_restatement");
  });
  const verdict = verifyFixture(fixture);
  assert.equal(verdict.allPassed, false);
  assert.equal(verdict.currentRestatementVerified, false);
  assert.ok(verdict.issues.some((issue) => issue.includes("closed_atomic_roles_missing")));
});

test("B8 public verifier fails closed on effective receipt and frozen upstream tamper", () => {
  const receiptFixture = buildFixture();
  const receiptPath = join(receiptFixture.root, receiptFixture.receiptPath);
  const lines = readFileSync(receiptPath, "utf8").trimEnd().split(/\r?\n/u);
  lines[0] = JSON.stringify({ schema: "receipt-envelope-v0.2" });
  writeFileSync(receiptPath, `${lines.join("\n")}\n`);
  const receiptVerdict = verifyFixture(receiptFixture);
  assert.equal(receiptVerdict.allPassed, false);
  assert.equal(receiptVerdict.effectiveReceiptsVerified, false);

  const upstreamFixture = buildFixture();
  writeFileSync(join(upstreamFixture.root, upstreamFixture.upstreamPaths[2]), "tampered\n");
  const upstreamVerdict = verifyFixture(upstreamFixture);
  assert.equal(upstreamVerdict.allPassed, false);
  assert.ok(upstreamVerdict.issues.some((issue) => issue.includes("frozen_upstream_digests")));
});

function buildFixture(options = {}) {
  const root = mkdtempSync(join(tmpdir(), "m2-v2-v2b8-current-verifier-"));
  roots.push(root);
  spawnSync("git", ["init", "-q"], { cwd: root, windowsHide: true });
  writeText(join(root, ".gitignore"), "data/private-output/**\n");
  for (const path of publicReports) writeText(join(root, path), "sanitized\n");

  const manifestPath = "data/private-output/m2-v2-evidence-pilot/v2-b5-independent-search-canary/canary-v3-manifest-private-v0.1.json";
  const bundlePath = "data/private-output/m2-v2-evidence-pilot/v2-b6-extraction-remediation/benchmark-source-bundle-private-v0.2.json";
  const b7Root = "data/private-output/m2-v2-evidence-pilot/v2b7-canary-v3";
  const upstreamPaths = [
    manifestPath,
    bundlePath,
    `${b7Root}/v2b7-execution-state-private-v0.1.json`,
    `${b7Root}/canary-v3-primary-search-private-v0.2.json`,
    `${b7Root}/canary-v3-repeat-search-private-v0.2.json`,
    `${b7Root}/canary-v3-evidence-records-private-v0.2.ndjson`,
  ];
  const privateStore = join(root, "data/private-output/m2-v2-evidence-pilot/v2b8-canary-stability");
  const validationPath = join(privateStore, "canary-v3-1-full-validation-receipt-private-v0.1.json");

  const sample = Array.from({ length: 10 }, (_, index) => ({
    canarySlotId: `slot${String(index + 1).padStart(2, "0")}`,
    title: `synthetic work ${index + 1}`,
    author: `synthetic author ${index + 1}`,
    highValue: true,
  }));
  const manifest = {
    manifestDigest: V2B7_CANARY_MANIFEST_DIGEST,
    repeatDigest: V2B7_REPEAT_DIGEST,
    sample,
    repeatSample: sample.slice(0, 5).map(({ canarySlotId }) => ({ canarySlotId })),
  };
  const bundle = { sourceBundleDigest: V2B7_SOURCE_BUNDLE_DIGEST };
  const primarySearch = sample.map((work, index) => searchRun(work, index + 1));
  const repeatSearch = sample.slice(0, 5).map((work, index) => ({
    ...searchRun(work, index + 1),
    runKind: "fresh_repeat",
    queries: [{ contractValid: true, httpSuccess: true }],
  }));
  const v2b7 = {
    primarySearch: {
      runs: primarySearch.map((run, index) => ({
        ...run,
        queries: [{ contractValid: index >= 5 }],
      })),
    },
    repeatSearch: { runs: [] },
    evidenceRecords: [],
  };
  const v2b7State = { synthetic: true, canaryExecuted: true, full160Authorized: false };
  const historicalEffective = [
    ...primarySearch.map((run) => historicalEffectiveReceipt(run)),
    ...repeatSearch.map((run) => historicalEffectiveReceipt(run)),
    ...sample.slice(0, 5).map((work) => historicalEffectiveReceipt({
      ...primarySearch.find((run) => run.canarySlotId === work.canarySlotId),
      runKind: "same_source",
    })),
  ];
  const historicalPhysical = historicalEffective.map((receipt) => ({
    ...receipt,
    schema: "m2.v2.relay-extraction-receipt.v0.2",
    requestedModelId: "gpt-5.6-terra",
    searchToolUsed: false,
    rawResponsePersisted: false,
    apiKeyPersisted: false,
    modelBindingStatus: "match",
  }));
  const fallbackQueries = sample.slice(0, 5).map(() => ({ contractValid: true, httpSuccess: true }));
  const contract = {
    schema: "m2.v2.v2b8-stability-contract-private.v0.1",
    manifestDigest: V2B7_CANARY_MANIFEST_DIGEST,
    repeatDigest: V2B7_REPEAT_DIGEST,
    sourceBundleDigest: V2B7_SOURCE_BUNDLE_DIGEST,
    v2b7StateDigest: sha256(v2b7State),
    v2b7PrimarySearchDigest: sha256(v2b7.primarySearch),
    v2b7RepeatSearchDigest: sha256(v2b7.repeatSearch),
    v2b7EvidenceDigest: sha256(v2b7.evidenceRecords),
    full160Authorized: false,
  };
  const results = {
    root,
    privateStore,
    manifest,
    bundle,
    v2b7,
    v2b7State,
    contract,
    invariant: { allPassed: true },
    fallbackQueries,
    primarySearch,
    repeatSearch,
    physicalReceipts: historicalPhysical,
    effectiveReceipts: historicalEffective,
    evidenceRecords: [],
    state: {
      full160Authorized: false,
      tavily: { physicalRequestCount: 0, reservations: {} },
      relay: { physicalRequestCount: 0, repairCount: 0, reservations: {} },
    },
    usage: {
      tavily: { cumulativePhysicalRequestCount: 0 },
      relay: { cumulativePhysicalRequestCount: 0 },
    },
    workbookVerification: null,
  };

  writeJson(join(root, manifestPath), manifest);
  writeJson(join(root, bundlePath), bundle);
  writeJson(join(root, upstreamPaths[2]), v2b7State);
  writeJson(join(root, upstreamPaths[3]), v2b7.primarySearch);
  writeJson(join(root, upstreamPaths[4]), v2b7.repeatSearch);
  writeText(join(root, upstreamPaths[5]), "");
  writeJson(validationPath, { allPassed: true });

  results.evaluation = recomputeV2B8HistoricalEvaluation(results, {
    root,
    gitBoundary,
    allTestsPassed: true,
    validationPending: false,
    evaluatedAt: "2026-07-18T00:00:00.000Z",
  });
  assert.equal(results.evaluation.decision, "CANARY_CONDITIONAL");

  const expectedRuns = [
    ...primarySearch.map((run) => ({ ...run, runKind: "primary" })),
    ...repeatSearch.map((run) => ({ ...run, runKind: "fresh_repeat" })),
    ...sample.slice(0, 5).map((work) => ({
      ...primarySearch.find((run) => run.canarySlotId === work.canarySlotId),
      runKind: "same_source",
    })),
  ];
  const envelopes = expectedRuns.map((run) => createReceiptEnvelope(currentPhysicalPayload(run)));
  const receiptPath = "data/private-output/m2-v2-integrity-remediation/receipts-v0.2.ndjson";
  writeText(join(root, receiptPath), `${envelopes.map((row) => JSON.stringify(row)).join("\n")}\n`);

  const transactionId = "synthetic-v2b8-current-transaction";
  const effectiveIndex = {
    schema: "m2.v2.v2b8-effective-receipt-index-private.v0.2",
    privateOnly: true,
    entries: expectedRuns.map((run, index) => ({
      logicalKey: sha256({ runKind: run.runKind, canarySlotId: run.canarySlotId }),
      runKind: run.runKind,
      canarySlotId: run.canarySlotId,
      receiptDigest: envelopes[index].receiptDigest,
      path: receiptPath,
      lineNumber: index + 1,
    })),
    full160Authorized: false,
  };
  const effectiveIndexPath = "data/private-output/m2-v2-integrity-remediation/tx/effective-receipt-index.json";
  writeJson(join(root, effectiveIndexPath), effectiveIndex);

  let ledger = [];
  for (const [index, row] of effectiveIndex.entries.entries()) {
    const requestDigest = sha256({ request: index + 1 });
    for (const [offset, eventType] of ["planned", "reserved", "dispatched", "completed"].entries()) {
      ledger = appendRequestEvent(ledger, {
        timestamp: `2026-07-18T00:${String(index).padStart(2, "0")}:${String(offset).padStart(2, "0")}.000Z`,
        provider: "synthetic_relay",
        stage: "v2b8",
        logicalKey: row.logicalKey,
        physicalKey: `physical-${index + 1}`,
        eventType,
        requestDigest,
        receiptDigest: eventType === "completed" ? row.receiptDigest : null,
      });
    }
  }
  const counters = replayRequestEventLedger(ledger).counters;
  const ledgerPath = "data/private-output/m2-v2-integrity-remediation/tx/request-event-ledger.json";
  writeJson(join(root, ledgerPath), ledger);

  const currentEvaluation = recomputeV2B8CurrentRestatedEvaluation(results, envelopes, {
    root,
    gitBoundary,
    allTestsPassed: true,
    validationPending: false,
    evaluatedAt: "2026-07-18T00:00:01.000Z",
  });
  assert.equal(currentEvaluation.decision, "CANARY_FAIL");
  const restatementPath = "docs/analysis/m2-v2/M2-v2-canary-v3-1-integrity-restatement-v0.3.json";
  const restatement = {
    schema: "m2.v2.canary-v3.1-integrity-restatement-public.v0.3",
    providerRequestDelta: 0,
    historicalContract: { decision: "CANARY_CONDITIONAL" },
    restatedContract: {
      decision: "CANARY_FAIL",
      evaluationDigest: sha256(currentEvaluation),
      full160Authorized: false,
    },
    nextDevelopmentReadiness: "NOT_AUTHORIZED",
  };
  writeJson(join(root, restatementPath), restatement);
  const authorityPath = "docs/analysis/m2-v2/M2-v2-current-state-index-v0.2.json";
  const authority = {
    schemaVersion: "m2-v2-current-state-index-v0.2",
    status: "current",
    historicalV2B8Decision: "CANARY_CONDITIONAL",
    currentDecision: "CANARY_FAIL",
    full160Authorized: false,
    nextDevelopmentReadiness: "NOT_AUTHORIZED",
    currentAuthority: {
      currentRestatementArtifact: restatementPath,
      currentRestatementDigest: digestFile(join(root, restatementPath)),
    },
    entries: [],
  };
  writeJson(join(root, authorityPath), authority);

  const receiptIndex = {
    schema: "m2.v2.v2b8-receipt-index-private.v0.2",
    entries: effectiveIndex.entries.map((entry) => ({
      path: entry.path,
      lineNumber: entry.lineNumber,
      receiptDigest: entry.receiptDigest,
    })),
  };
  const cacheIndex = {
    schema: "m2.v2.v2b8-cache-index-private.v0.2",
    entries: effectiveIndex.entries.map((entry, index) => ({
      adapterVersion: "synthetic-v1",
      logicalKey: entry.logicalKey,
      physicalKey: `physical-${index + 1}`,
      receiptDigest: entry.receiptDigest,
      transactionId,
    })),
  };
  const artifactIndex = (schema, paths) => ({
    schema,
    privateOnly: true,
    entries: paths.map((path) => ({ path, byteDigest: digestFile(join(root, path)) })),
    full160Authorized: false,
  });
  const documents = {
    state: { schema: "synthetic-v2b8-state", requestCounters: counters },
    cache_index: cacheIndex,
    receipt_index: receiptIndex,
    request_event_ledger: ledger,
    counter_projection: { schema: "synthetic-counter-projection", counters },
    execution_contract: contract,
    immutable_manifests: artifactIndex("m2.v2.v2b8-immutable-manifests-private.v0.2", [manifestPath]),
    frozen_upstream_digests: artifactIndex("m2.v2.v2b8-frozen-upstream-digests-private.v0.2", upstreamPaths),
    derived_evaluation: {
      schema: "m2.v2.v2b8-derived-evaluation-private.v0.3",
      privateOnly: true,
      historicalEvaluation: results.evaluation,
      currentRestatedEvaluation: currentEvaluation,
      inputDigests: {
        manifest: digestFile(join(root, manifestPath)),
        sourceBundle: digestFile(join(root, bundlePath)),
        effectiveReceiptIndex: digestFile(join(root, effectiveIndexPath)),
        requestEventLedger: digestFile(join(root, ledgerPath)),
      },
      providerRequestDelta: 0,
      full160Authorized: false,
    },
    effective_receipt_index: effectiveIndex,
    current_authority: authority,
    current_restatement: restatement,
    contract_bound_public_report_digests: {
      ...artifactIndex(
        options.authorityGraph
          ? "m2.v2.v2b8-contract-bound-public-report-digests-private.v0.3"
          : "m2.v2.v2b8-public-report-digests-private.v0.2",
        publicReports,
      ),
      ...(options.authorityGraph ? {
        canonicalAuthorityGraph: { schema: "synthetic-canonical-authority-graph-v0.3" },
      } : {}),
    },
  };

  const rolePaths = {};
  for (const [role, document] of Object.entries(documents)) {
    const path = role === "effective_receipt_index" ? effectiveIndexPath
      : role === "request_event_ledger" ? ledgerPath
        : role === "current_authority" ? authorityPath
          : role === "current_restatement" ? restatementPath
            : `data/private-output/m2-v2-integrity-remediation/tx/${role}.json`;
    rolePaths[role] = path;
    if (!["effective_receipt_index", "request_event_ledger", "current_authority", "current_restatement"].includes(role)) {
      writeJson(join(root, path), document);
    }
  }
  const members = Object.entries(rolePaths).map(([role, path]) => ({
    role,
    path,
    byteDigest: digestFile(join(root, path)),
  }));
  const transactionManifest = buildClosedAtomicTransactionManifest({
    scope: "v2b8",
    transactionId,
    createdAt: "2026-07-18T00:01:00.000Z",
    members,
  });
  rolePaths.transaction_manifest = "data/private-output/m2-v2-integrity-remediation/tx/transaction-manifest.json";
  writeJson(join(root, rolePaths.transaction_manifest), transactionManifest);
  const binding = createClosedAtomicRequestBinding({
    scope: "v2b8",
    transactionId,
    members: [...members, {
      role: "transaction_manifest",
      path: rolePaths.transaction_manifest,
      byteDigest: digestFile(join(root, rolePaths.transaction_manifest)),
    }],
  });
  const bindingPath = "data/private-output/m2-v2-integrity-remediation/request-state-binding-private-v0.2.json";
  writeJson(join(root, bindingPath), binding);
  return {
    root,
    results,
    bindingPath,
    rolePaths,
    receiptPath,
    upstreamPaths,
    governedPaths: [...new Set([
      bindingPath,
      receiptPath,
      validationPath.slice(root.length + 1).replace(/\\/gu, "/"),
      ...upstreamPaths,
      ...publicReports,
      ...Object.values(rolePaths),
    ])].sort(),
  };
}

function verifyFixture(fixture) {
  return verifyV2B8(fixture.root, {
    results: fixture.results,
    bindingRelativePath: fixture.bindingPath,
    gitBoundary,
  });
}

function searchRun(work, ordinal) {
  const source = sourceRecord(ordinal, work.canarySlotId);
  return {
    runKind: "primary",
    workOrdinal: ordinal,
    canarySlotId: work.canarySlotId,
    sourceRecords: [source],
    sourceRecordSetDigest: sha256([source]),
    sourceCategoriesById: {},
    categoryCounts: { unknown_public_web: 1 },
    categoryDiversityTarget: 1,
    categoryDiversityAchieved: 1,
    identityReservationApplied: false,
    sourceSelectionLimitations: [],
    queries: [],
  };
}

function sourceRecord(index, slot) {
  const url = `https://example${index}.test/${slot}`;
  return {
    schema: "m2.v2.evidence-source-record.v0.2",
    sourceId: sourceIdForV2B5Url(url),
    queryId: `qry_${slot}`,
    title: `synthetic source ${index}`,
    url,
    domain: `example${index}.test`,
    snippet: "The work was published in 2020.",
    providerScore: 0.5,
    searchProvider: "tavily_structured_search",
    providerRequestId: null,
    capturedAt: "2026-07-18T00:00:00.000Z",
    availableAt: "2026-07-18T00:00:00.000Z",
    availableAtBasis: "first_observed_by_system",
    eventTime: null,
    sourceTypeCandidate: "unknown_public_web",
    providerReceiptRef: `sha256:${"a".repeat(64)}`,
    researchOnly: true,
    modelEligible: false,
  };
}

function historicalEffectiveReceipt(run) {
  const source = run.sourceRecords[0];
  const claim = {
    claimType: "publication_event",
    canonicalClaimKey: "publication_event:2020",
    normalizedStructuredValue: { publicationDate: "2020" },
    supportingSourceIds: [source.sourceId],
    accepted: true,
    pilotUsable: true,
    sourceSupportClass: "unknown_public_web",
    explicitTemporalText: true,
    eventTimeExtractionSucceeded: true,
    eventTime: "2020",
    eventTimePrecision: "year",
    eventTimeBasis: "explicit_structured_value",
    eventTimeSourceId: source.sourceId,
    eventTimeEvidenceSpanDigest: "b".repeat(64),
    contradictionStatus: "none",
    rejectionReasons: [],
  };
  return {
    schema: "m2.v2.v2b8-extraction-effective-receipt.v0.1",
    runKind: run.runKind,
    canarySlotId: run.canarySlotId,
    sourceRecordSetDigest: run.sourceRecordSetDigest,
    requestedModelId: "gpt-5.6-terra",
    modelBindingVerified: true,
    providerContractCompatible: true,
    timedOut: false,
    normalizedResponse: {
      structuredValid: true,
      contractValid: true,
      entityResolution: { work: { status: "high", confidence: 0.9 } },
      claims: [claim],
      acceptedClaimCount: 1,
      pilotUsableClaimCount: 1,
      privateLeakCount: 0,
      fabricatedSourceIdCount: 0,
      modelGeneratedUrlCount: 0,
      historicalBackfillCount: 0,
      sourceIdReferenceCount: 1,
      mappedSourceIdReferenceCount: 1,
      v2b8ConflictAudit: {
        unresolvedConflictCount: 0,
        validMultiEditionCount: 0,
        conflictFamilyCoverage: Object.fromEntries(V2B8_CONFLICT_FAMILIES.map((family) => [family, true])),
      },
    },
  };
}

function currentPhysicalPayload(run) {
  return {
    schema: "m2.v2.relay-extraction-receipt.v0.2",
    logicalExtractionKey: sha256({ runKind: run.runKind, canarySlotId: run.canarySlotId }),
    runKind: run.runKind,
    canarySlotId: run.canarySlotId,
    sourceRecordSetDigest: run.sourceRecordSetDigest,
    requestedModelId: "gpt-5.6-terra",
    returnedModelId: "gpt-5.6-terra",
    attemptKind: "primary",
    modelBindingVerified: true,
    providerContractCompatible: true,
    dispatched: true,
    timedOut: false,
    status: "ok",
    normalizedResponse: {
      structuredValid: true,
      contractValid: true,
      entityResolution: { work: { status: "high", confidence: 0.9, supportingSourceIds: [] } },
      claims: [],
      privateLeakCount: 0,
      modelGeneratedUrlCount: 0,
    },
  };
}

function rewriteBinding(fixture, mutate) {
  const path = join(fixture.root, fixture.bindingPath);
  const binding = JSON.parse(readFileSync(path, "utf8"));
  mutate(binding);
  const { bindingDigest: ignored, ...payload } = binding;
  void ignored;
  writeJson(path, { ...payload, bindingDigest: sha256(payload) });
}

function writeJson(path, value) {
  writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
}

function digestFile(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function snapshotGoverned(fixture) {
  return fixture.governedPaths.map((path) => ({ path, byteDigest: digestFile(join(fixture.root, path)) }));
}
