import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { validateCurrentAuthorityDocuments } from "../src/domain/m2V2EvidencePilot/currentAuthority.js";
import { CURRENT_CLOSED_REQUEST_STATE_BINDING_RELATIVE } from "../src/domain/m2V2EvidencePilot/integrityState.js";
import { sha256 } from "../src/domain/m2V2EvidencePilot/pilotCore.js";
import {
  PR7_P1_OFFLINE_REMEDIATION_SCHEMA,
  buildPr7P1ClosedRecoveryMembers,
  buildPr7P1OfflineReceiptState,
  promotePreparedPr7P1OfflineRemediation,
} from "../src/domain/m2V2EvidencePilot/pr7P1OfflineRemediation.js";

const AT = "2026-07-18T12:00:00.000Z";

test("offline adapter migrates only physical receipts and records a cache hit without dispatch", () => {
  const input = syntheticReceiptInput();
  const state = buildPr7P1OfflineReceiptState(input);
  assert.equal(state.envelopeRows.length, 2);
  assert.equal(state.tavilyEnvelopes.length, 1);
  assert.equal(state.relayEnvelopes.length, 1);
  assert.equal(state.cacheHitCount, 1);
  assert.equal(state.ledger.length, 10);
  assert.deepEqual(state.counters, {
    cacheHit: 1,
    completed: 2,
    contractFailed: 0,
    dispatched: 2,
    indeterminate: 0,
    planned: 3,
    providerFailed: 0,
    reserved: 2,
  });
  assert.equal(state.ledgerValidation.valid, true);
  assert.equal(state.providerRequestDelta, 0);
  assert.equal(state.migration.entries.length, 2);
  assert.equal(state.migration.entries.every((entry) => !Object.hasOwn(entry, "receiptPayload")), true);
});

test("offline adapter builds an exact 14-role transaction and promotes it as a metadata-stable no-op", () => {
  const root = makeRoot();
  try {
    const prepared = makePrepared(root, "stable");
    const preview = buildPr7P1ClosedRecoveryMembers(prepared, {
      transactionId: "recovery-synthetic-preview",
      finalDirectoryRelative: "governed/recovery-synthetic-preview",
    });
    assert.equal(preview.closedDescriptors.length, 14);
    assert.equal(new Set(preview.closedDescriptors.map((entry) => entry.role)).size, 14);
    assert.equal(preview.documents.effectiveReceiptIndex.entries.length, 1);

    const options = {
      transactionRootRelative: "governed/transactions",
      pointerRelative: CURRENT_CLOSED_REQUEST_STATE_BINDING_RELATIVE,
      transactionIdentity: "synthetic-pr7-p1-v0.3",
    };
    const first = promotePreparedPr7P1OfflineRemediation(prepared, options);
    assert.equal(first.status, "PROMOTED");
    assert.equal(first.providerRequestDelta, 0);
    const pointer = join(root, ...CURRENT_CLOSED_REQUEST_STATE_BINDING_RELATIVE.split("/"));
    const before = { bytes: readFileSync(pointer), mtimeMs: statSync(pointer).mtimeMs };
    const second = promotePreparedPr7P1OfflineRemediation(prepared, options);
    assert.equal(second.status, "ALREADY_CURRENT_NOOP");
    assert.equal(readFileSync(pointer).equals(before.bytes), true);
    assert.equal(statSync(pointer).mtimeMs, before.mtimeMs);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const faultAt of ["transaction_rename_after", "pointer_swap_after"]) {
  test(`offline adapter preserves the prior 14-role pointer at ${faultAt}`, () => {
    const root = makeRoot();
    try {
      const options = {
        transactionRootRelative: "governed/transactions",
        pointerRelative: CURRENT_CLOSED_REQUEST_STATE_BINDING_RELATIVE,
        transactionIdentity: "synthetic-pr7-p1-baseline-v0.3",
      };
      promotePreparedPr7P1OfflineRemediation(makePrepared(root, "baseline"), options);
      const pointer = join(root, ...CURRENT_CLOSED_REQUEST_STATE_BINDING_RELATIVE.split("/"));
      const before = { bytes: readFileSync(pointer), mtimeMs: statSync(pointer).mtimeMs };

      const changed = makePrepared(root, `changed-${faultAt}`);
      assert.throws(() => promotePreparedPr7P1OfflineRemediation(changed, {
        ...options,
        transactionIdentity: `synthetic-pr7-p1-${faultAt}-v0.3`,
        faultAt,
      }), /synthetic_fault/u);
      assert.equal(readFileSync(pointer).equals(before.bytes), true);
      assert.equal(statSync(pointer).mtimeMs, before.mtimeMs);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

function syntheticReceiptInput() {
  const tavilyPayload = {
    schema: "m2.v2.tavily-provider-receipt.v0.1",
    privateOnly: true,
    provider: "tavily_structured_search",
    providerVersion: "synthetic-tavily-v0.1",
    queryId: "qry_synthetic",
    cacheKey: "a".repeat(64),
    requestStartedAt: "2026-07-18T10:00:00.000Z",
    responseReceivedAt: "2026-07-18T10:00:01.000Z",
    httpStatus: 200,
    rawResponsePersisted: false,
    authorizationHeaderPersisted: false,
    apiKeyPersisted: false,
  };
  const providerReceipt = legacyReceipt(tavilyPayload);
  const physicalQuery = {
    queryId: "qry_synthetic",
    queryText: "synthetic query",
    intent: "identity",
    country: "CN",
    runKind: "fresh_repeat",
    canarySlotId: "slot01",
    cacheHit: false,
    providerReceipt,
  };
  const cacheHit = { ...physicalQuery, cacheHit: true };
  const logicalExtractionKey = sha256({ runKind: "primary", canarySlotId: "slot01" });
  const relayPayload = {
    schema: "m2.v2.relay-extraction-receipt.v0.2",
    privateOnly: true,
    provider: "openai_compatible_relay_extraction",
    adapterVersion: "synthetic-relay-v0.2",
    logicalExtractionKey,
    cacheKey: "b".repeat(64),
    requestPayloadDigest: "c".repeat(64),
    requestStartedAt: "2026-07-18T10:01:00.000Z",
    responseReceivedAt: "2026-07-18T10:01:02.000Z",
    dispatched: true,
    cacheHit: false,
    runKind: "primary",
    canarySlotId: "slot01",
    requestedModelId: "gpt-5.6-terra",
    sourceRecordSetDigest: "d".repeat(64),
    full160Authorized: false,
  };
  return {
    relayReceipts: [legacyReceipt(relayPayload)],
    fallbackQueries: [physicalQuery, cacheHit],
    repeatSearch: [],
    migratedAt: AT,
  };
}

function makePrepared(root, marker) {
  const receiptState = buildPr7P1OfflineReceiptState(syntheticReceiptInput());
  const historicalEvaluation = { decision: "CANARY_CONDITIONAL", evaluatedAt: AT, marker };
  const currentRestatedEvaluation = { decision: "CANARY_FAIL", evaluatedAt: AT, marker };
  const restatement = {
    schema: "m2.v2.canary-v3.1-integrity-restatement-public.v0.3",
    historicalContract: { decision: "CANARY_CONDITIONAL" },
    restatedContract: {
      decision: "CANARY_FAIL",
      evaluatedAt: AT,
      evaluationDigest: sha256(currentRestatedEvaluation),
      full160Authorized: false,
    },
    providerRequestDelta: 0,
    nextDevelopmentReadiness: "NOT_AUTHORIZED",
  };
  writeJson(root, "docs/restatement.json", restatement);
  const restatementDigest = sha256File(join(root, "docs/restatement.json"));
  const currentAuthority = {
    schemaVersion: "m2-v2-current-state-index-v0.2",
    status: "current",
    currentAuthority: {
      currentRestatementArtifact: "docs/restatement.json",
      currentRestatementDigest: restatementDigest,
    },
    historicalV2B8Decision: "CANARY_CONDITIONAL",
    currentDecision: "CANARY_FAIL",
    historicalArtifacts: [{ artifact: "docs/historical.json", lifecycle: "historical" }],
    full160Authorized: false,
    nextDevelopmentReadiness: "NOT_AUTHORIZED",
  };
  writeJson(root, "docs/current.json", currentAuthority);
  writeJson(root, "private/contract.json", { schema: "synthetic-contract", marker, full160Authorized: false });
  writeJson(root, "sources/manifest.json", { immutable: true, marker });
  writeJson(root, "sources/bundle.json", { immutable: true, marker });
  writeJson(root, "sources/search.json", { appendOnly: true, marker });
  writeJson(root, "sources/contract.json", { immutable: true, marker });
  writeFile(root, "sources/receipt.ndjson", `${JSON.stringify({ appendOnly: true, marker })}\n`);

  const currentAuthorityRead = governedRead(root, "docs/current.json");
  const currentRestatementRead = governedRead(root, "docs/restatement.json");
  const authority = validateCurrentAuthorityDocuments({
    index: currentAuthority,
    restatement,
    indexRelativePath: currentAuthorityRead.relativePath,
    indexByteDigest: currentAuthorityRead.byteDigest,
    restatementRelativePath: currentRestatementRead.relativePath,
    restatementByteDigest: currentRestatementRead.byteDigest,
  });
  assert.equal(authority.valid, true);
  const artifactIndex = (schema, paths) => ({
    schema,
    privateOnly: true,
    entries: paths.map((path) => ({ path, byteDigest: sha256File(join(root, ...path.split("/"))) })),
    full160Authorized: false,
  });
  return {
    schema: PR7_P1_OFFLINE_REMEDIATION_SCHEMA,
    root,
    migratedAt: AT,
    createdAt: AT,
    contractDigest: sha256({ contract: "synthetic", marker }),
    executionContract: governedRead(root, "private/contract.json"),
    currentAuthority: currentAuthorityRead,
    currentRestatement: { ...currentRestatementRead, value: restatement },
    authority,
    results: {
      evaluation: historicalEvaluation,
      primarySearch: [{ canarySlotId: "slot01" }],
      repeatSearch: [],
      manifest: { repeatSample: [] },
    },
    historicalEvaluation,
    currentRestatedEvaluation,
    receiptState,
    immutableManifests: artifactIndex("synthetic-immutable-index", ["sources/manifest.json"]),
    frozenUpstreamDigests: artifactIndex("synthetic-upstream-index", ["sources/bundle.json"]),
    contractBoundPublicReportDigests: artifactIndex("synthetic-public-index", ["docs/historical.json"]),
    manifestByteDigest: sha256File(join(root, "sources/manifest.json")),
    sourceBundleByteDigest: sha256File(join(root, "sources/bundle.json")),
    sources: [
      { role: "immutable_manifest", relativePath: "sources/manifest.json", byteDigest: sha256File(join(root, "sources/manifest.json")) },
      { role: "immutable_manifest", relativePath: "sources/bundle.json", byteDigest: sha256File(join(root, "sources/bundle.json")) },
      { role: "source_record", relativePath: "sources/search.json", byteDigest: sha256File(join(root, "sources/search.json")) },
      { role: "append_only_provider_receipt", relativePath: "sources/receipt.ndjson", byteDigest: sha256File(join(root, "sources/receipt.ndjson")) },
      { role: "frozen_execution_contract", relativePath: "sources/contract.json", byteDigest: sha256File(join(root, "sources/contract.json")) },
    ],
    gitBoundary: { auditSucceeded: true, b4Unchanged: true, holdoutSealed: true, paths: [], issue: null },
    requireV2B8Verification: false,
    providerRequestDelta: 0,
    full160Authorized: false,
  };
}

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), "m2-v2-recovery-validation-"));
  writeJson(root, "docs/historical.json", { historical: true });
  return root;
}

function legacyReceipt(payload) {
  return { ...payload, receiptDigest: sha256(payload) };
}

function governedRead(root, relativePath) {
  const path = join(root, ...relativePath.split("/"));
  return { relativePath, bytes: readFileSync(path), byteDigest: sha256File(path) };
}

function writeJson(root, relativePath, value) {
  writeFile(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeFile(root, relativePath, content) {
  const path = join(root, ...relativePath.split("/"));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
  assert.equal(existsSync(path), true);
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

