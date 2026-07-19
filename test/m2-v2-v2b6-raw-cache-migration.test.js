import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { sha256 } from "../src/domain/m2V2EvidencePilot/pilotCore.js";
import { SAFE_CACHE_PROFILE_IDS } from "../src/domain/m2V2EvidencePilot/safeCacheProjection.js";
import { buildV2B6SafeCacheEntry, newV2B6SafeCache } from "../src/domain/m2V2EvidencePilot/v2b6SafeCache.js";
import {
  V2B6_V02_CACHE_RELATIVE,
  buildV2B6CacheV03Candidate,
  migrateV2B6RawCache,
  verifyV2B6CacheV03CandidateDeterminism,
  writeV2B6CacheV03Candidate,
} from "../src/domain/m2V2EvidencePilot/v2b6RawCacheMigration.js";

const SOURCE_ID = `src_${"a".repeat(32)}`;
const OUTPUT_RELATIVE = "data/private-output/test-b3/b3-cache-v0.3-candidate";

test("PR7-P1-008-migration-noop: v0.2 to v0.3 candidate bytes and receipts are identical on a second run", () => {
  const source = v02Cache([v02Entry(fullOutput()), v02Entry(null, { kind: "no_replay_value", testId: "E1" })]);
  const first = buildV2B6CacheV03Candidate(source);
  const proof = verifyV2B6CacheV03CandidateDeterminism(source);
  assert.equal(first.receipt.status, "CANDIDATE_READY");
  assert.equal(first.receipt.migratedCount, 2);
  assert.equal(proof.status, "VERIFIED_IDENTICAL_CANDIDATE");
  assert.equal(proof.candidateDigest, sha256(first.candidateBytes));
  assert.equal(first.receipt.providerRequestDelta, 0);
  assert.equal(first.receipt.currentPromotionPerformed, false);
});

test("candidate exact-set receipt quarantines unknown and oversized rows without silent drop", () => {
  const unknown = fullOutput(); unknown.unknown = "synthetic";
  const oversized = fullOutput(); oversized.limitations = ["x".repeat(501)];
  const source = v02Cache([v02Entry(unknown), v02Entry(oversized)]);
  const result = buildV2B6CacheV03Candidate(source);
  assert.equal(result.receipt.sourceCount, 2);
  assert.equal(result.receipt.migratedCount, 0);
  assert.equal(result.receipt.quarantinedCount, 2);
  assert.deepEqual(result.manifest.classification.sourceRowIds, result.manifest.classification.quarantinedRowIds);
  assert.deepEqual(result.manifest.classification.missingIds, []);
  assert.deepEqual(result.manifest.classification.unexpectedIds, []);
});

test("candidate rejects digest mismatch and duplicate identity as explicit rejected sets", () => {
  const source = v02Cache([v02Entry(fullOutput())]);
  const [rowId, entry] = Object.entries(source.entries)[0];
  const badDigest = structuredClone(source); badDigest.entries[rowId].entryDigest = "f".repeat(64);
  const rejected = buildV2B6CacheV03Candidate(badDigest);
  assert.deepEqual(rejected.manifest.classification.rejectedRowIds, [rowId]);
  const duplicate = buildV2B6CacheV03Candidate(source, { sourceRows: [{ rowId, entry }, { rowId, entry }] });
  assert.deepEqual(duplicate.manifest.classification.duplicateIds, [rowId]);
  assert.deepEqual(duplicate.manifest.classification.rejectedRowIds, [rowId]);
});

test("candidate exact-set verifier rejects missing source and unexpected generated rows", () => {
  const source = v02Cache([v02Entry(fullOutput())]);
  const rowId = Object.keys(source.entries)[0];
  assert.throws(() => buildV2B6CacheV03Candidate(source, { injectMissingSourceRowId: rowId }), /cache_candidate_exact_set_mismatch/u);
  assert.throws(() => buildV2B6CacheV03Candidate(source, { injectUnexpectedGeneratedRowId: "f".repeat(64) }), /cache_candidate_exact_set_mismatch/u);
});

test("profile mismatch is quarantined and an already-v0.3 row is preserved", () => {
  const mismatch = v02Entry(fullOutput(), { testId: "E2" });
  const current = buildV2B6SafeCacheEntry(response({ output_parsed: fullOutput() }), receipt(), { profileId: SAFE_CACHE_PROFILE_IDS.EXTRACTION_FULL });
  const source = v02Cache([]);
  const result = buildV2B6CacheV03Candidate(source, { sourceRows: [
    { rowId: "a".repeat(64), entry: mismatch },
    { rowId: "b".repeat(64), entry: current },
  ] });
  assert.deepEqual(result.manifest.classification.quarantinedRowIds, ["a".repeat(64)]);
  assert.deepEqual(result.manifest.classification.migratedRowIds, ["b".repeat(64)]);
  assert.deepEqual(result.candidate.entries["b".repeat(64)], current);
});

test("mixed old/new input yields one deterministic v0.3 candidate", () => {
  const old = v02Entry(fullOutput());
  const current = buildV2B6SafeCacheEntry(response({ output_parsed: { ok: true } }), receipt({ testId: "E1" }), { profileId: SAFE_CACHE_PROFILE_IDS.CAPABILITY_E1 });
  const source = v02Cache([]);
  const result = buildV2B6CacheV03Candidate(source, { sourceRows: [
    { rowId: "a".repeat(64), entry: old },
    { rowId: "b".repeat(64), entry: current },
  ] });
  assert.equal(result.candidate.schema, newV2B6SafeCache().schema);
  assert.equal(Object.keys(result.candidate.entries).length, 2);
});

test("candidate writer is provider-free, never writes current state, and verifies identical existing bytes", () => withRoot((root) => {
  writeSource(root, v02Cache([v02Entry(fullOutput())]));
  const first = writeV2B6CacheV03Candidate(root, { outputRelativePath: OUTPUT_RELATIVE });
  assert.equal(first.writeStatus, "CANDIDATE_WRITTEN");
  const before = readFileSync(join(root, ...V2B6_V02_CACHE_RELATIVE.split("/")));
  const second = writeV2B6CacheV03Candidate(root, { outputRelativePath: OUTPUT_RELATIVE });
  assert.equal(second.writeStatus, "VERIFIED_IDENTICAL_CANDIDATE");
  assert.equal(readFileSync(join(root, ...V2B6_V02_CACHE_RELATIVE.split("/"))).equals(before), true);
  assert.equal(second.providerRequestDelta, 0);
  assert.equal(second.currentPromotionPerformed, false);
}));

test("candidate writer rejects quarantine-path collisions and current-state output paths", () => withRoot((root) => {
  writeSource(root, v02Cache([v02Entry(fullOutput())]));
  const output = join(root, ...OUTPUT_RELATIVE.split("/"));
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, "manifest-private-v0.1.json"), "{}\n", "utf8");
  assert.throws(() => writeV2B6CacheV03Candidate(root, { outputRelativePath: OUTPUT_RELATIVE }), /cache_candidate_path_collision/u);
  assert.throws(() => writeV2B6CacheV03Candidate(root, { outputRelativePath: "data/private-output/m2-v2-evidence-pilot/v2-b6-extraction-remediation/b3-cache-v0.3-candidate" }), /cache_candidate_output_scope_invalid/u);
}));

test("historical current-state migration API is retired before any write", () => {
  assert.throws(() => migrateV2B6RawCache(), /v2b6_historical_current_promotion_retired/u);
});

function v02Cache(entries) {
  return {
    schema: "m2.v2.v2b6-request-cache.v0.2",
    privateOnly: true,
    rawResponsePersisted: false,
    entries: Object.fromEntries(entries.map((entry, index) => [sha256(`row-${index}`), entry])),
  };
}

function v02Entry(value, options = {}) {
  const kind = options.kind ?? "structured_value";
  const payload = {
    schema: "m2.v2.v2b6-request-cache-entry.v0.2",
    rawResponsePersisted: false,
    responseMetadata: response(null),
    safeReplay: { kind, value: kind === "structured_value" ? value : null },
    receipt: receipt({ testId: options.testId ?? null, phase: options.phase ?? (options.testId ? "capability" : "benchmark") }),
  };
  delete payload.responseMetadata.json;
  return { ...payload, entryDigest: sha256(payload) };
}

function response(json) {
  return {
    json, requestStartedAt: "2026-07-18T00:00:00.000Z", responseReceivedAt: "2026-07-18T00:00:01.000Z",
    latencyMs: 1000, timeoutMs: 120000, timedOut: false, httpStatus: 200, httpOk: true,
    status: "provider_response_received", contentTypeClass: "json", responseDigest: sha256("synthetic-response"), responseByteLength: 100,
  };
}

function receipt(overrides = {}) {
  const payload = {
    schema: "m2.v2.relay-extraction-receipt.v0.2", privateOnly: true, phase: "benchmark", testId: null,
    modelBindingStatus: "exact", timedOut: false, latencyMs: 1000,
    usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 },
    rawResponsePersisted: false, authorizationHeaderPersisted: false, apiKeyPersisted: false,
    ...overrides,
  };
  return { ...payload, receiptDigest: sha256(payload) };
}

function fullOutput() {
  return {
    schemaVersion: "m2.v2.evidence-extraction-output.v0.2",
    entityResolution: {
      work: { status: "high", confidence: 1, supportingSourceIds: [SOURCE_ID] },
      author: { status: "not_applicable", confidence: 0, supportingSourceIds: [] },
    },
    claims: [], contradictions: [], limitations: [],
  };
}

function writeSource(root, source) {
  const path = join(root, ...V2B6_V02_CACHE_RELATIVE.split("/"));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(source)}\n`, "utf8");
}

function withRoot(callback) {
  const root = mkdtempSync(join(tmpdir(), "m2-v2-b3-cache-candidate-"));
  try {
    mkdirSync(join(root, "data/private-output/test-b3"), { recursive: true });
    return callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
