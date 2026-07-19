import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { sha256 } from "../src/domain/m2V2EvidencePilot/pilotCore.js";
import {
  SAFE_CACHE_PROFILE_IDS,
  projectSafeCacheResponse,
  safeCacheProfileInventory,
} from "../src/domain/m2V2EvidencePilot/safeCacheProjection.js";
import {
  buildV2B6SafeCacheEntry,
  inspectV2B6ProviderCacheReadiness,
  newV2B6SafeCache,
  restoreV2B6SafeCacheEntry,
  validateV2B6SafeCache,
  validateV2B6SafeCacheEntry,
} from "../src/domain/m2V2EvidencePilot/v2b6SafeCache.js";
import { independentlyVerifyB3SafeCacheEntry } from "./helpers/m2V2Pr7B3SafeCacheSecondary.js";

const SOURCE_ID = `src_${"a".repeat(32)}`;

function response(json) {
  return {
    json,
    requestStartedAt: "2026-07-18T00:00:00.000Z",
    responseReceivedAt: "2026-07-18T00:00:01.000Z",
    latencyMs: 1000,
    timeoutMs: 120000,
    timedOut: false,
    httpStatus: 200,
    httpOk: true,
    status: "provider_response_received",
    contentTypeClass: "json",
    responseDigest: sha256("synthetic-response"),
    responseByteLength: 100,
  };
}

const receipt = Object.freeze({
  schema: "m2.v2.relay-extraction-receipt.v0.2",
  rawResponsePersisted: false,
  authorizationHeaderPersisted: false,
  apiKeyPersisted: false,
  modelBindingStatus: "exact",
  timedOut: false,
  latencyMs: 1000,
  usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 },
  receiptDigest: sha256("synthetic-receipt"),
});

function entityStage(limitations = []) {
  return {
    schemaVersion: "m2.v2.evidence-extraction-output.v0.2",
    entityResolution: {
      work: { status: "high", confidence: 1, supportingSourceIds: [SOURCE_ID] },
      author: { status: "not_applicable", confidence: 0, supportingSourceIds: [] },
    },
    limitations,
  };
}

function claimsStage(claims = [], contradictions = [], limitations = []) {
  return { schemaVersion: "m2.v2.evidence-extraction-output.v0.2", claims, contradictions, limitations };
}

function claim(index = 1, limitations = []) {
  return {
    claimId: `clm_${index}`,
    claimType: "work_identity",
    structuredValue: { valueType: "text", textValue: `Synthetic ${index}`, dateValue: null, numberValue: null, booleanValue: null },
    supportingSourceIds: [SOURCE_ID],
    confidence: 1,
    eventTime: null,
    contradictionKey: null,
    limitations,
  };
}

function fullOutput() {
  const entity = entityStage();
  const claims = claimsStage([claim()]);
  return { schemaVersion: entity.schemaVersion, entityResolution: entity.entityResolution, claims: claims.claims, contradictions: [], limitations: [] };
}

function entryFor(value, profileId = null) {
  return buildV2B6SafeCacheEntry(response({ output_parsed: value }), receipt, profileId ? { profileId } : {});
}

test("B3 safe-cache profiles are versioned, phase-specific, exact, and bounded", () => {
  const inventory = safeCacheProfileInventory();
  assert.equal(inventory.length, 6);
  assert.equal(new Set(inventory.map((item) => item.profileId)).size, 6);
  for (const item of inventory) {
    for (const key of ["profileId", "schemaVersion", "allowedTopLevelKeys", "allowedNestedKeys", "requiredKeys", "scalarTypes", "arrayItemTypes", "maxDepth", "maxStringBytes", "maxArrayItems", "maxObjectKeys", "maxSerializedBytes", "normalizationRules", "forbiddenSemanticClasses", "schemaDigest"]) {
      assert.equal(Object.hasOwn(item, key), true, `${item.profileId}:${key}`);
    }
  }
});

test("PR7-P1-008-profile-pass: every exact profile returns only a canonical semantic projection", () => {
  const cases = [
    [SAFE_CACHE_PROFILE_IDS.CAPABILITY_E0, { output: [{ type: "message", content: [{ type: "output_text", text: "OK" }] }] }, { status: "OK" }],
    [SAFE_CACHE_PROFILE_IDS.CAPABILITY_E1, { output_parsed: { ok: true } }, { ok: true }],
    [SAFE_CACHE_PROFILE_IDS.CAPABILITY_E2, { output_parsed: entityStage() }, entityStage()],
    [SAFE_CACHE_PROFILE_IDS.CAPABILITY_E3, { output_parsed: claimsStage() }, claimsStage()],
    [SAFE_CACHE_PROFILE_IDS.EXTRACTION_FULL, { output_parsed: fullOutput() }, fullOutput()],
  ];
  for (const [profileId, json, expected] of cases) {
    const entry = buildV2B6SafeCacheEntry(response(json), receipt, { profileId });
    const restored = restoreV2B6SafeCacheEntry(entry);
    assert.equal(restored.profileId, profileId);
    assert.deepEqual(restored.projection, expected);
    assert.equal(Object.hasOwn(restored, "response"), false);
    assert.equal(JSON.stringify(entry).includes("output_parsed"), false);
  }
});

test("PR7-P1-008-unknown-top: unknown semantic top-level fields fail closed", () => {
  assert.throws(() => entryFor({ ...fullOutput(), extra: "synthetic" }), /safe_projection_unknown_field/u);
});

test("PR7-P1-008-unknown-nested: unknown nested fields fail closed", () => {
  const value = entityStage();
  value.entityResolution.work.extra = "synthetic";
  assert.throws(() => entryFor(value), /safe_projection_nested_keys_invalid/u);
});

test("PR7-P1-008-cross-profile: a projection cannot be stored under another phase profile", () => {
  assert.throws(() => entryFor(claimsStage(), SAFE_CACHE_PROFILE_IDS.CAPABILITY_E2), /safe_projection_profile_mismatch/u);
});

test("PR7-P1-008-oversize-depth: depth, item, field, and total byte budgets reject without truncation", () => {
  let deep = { leaf: "synthetic" };
  for (let index = 0; index < 14; index += 1) deep = { nested: deep };
  assert.throws(() => entryFor({ ...claimsStage(), extra: deep }), /safe_projection_budget_exceeded/u);
  assert.throws(() => entryFor(claimsStage(Array.from({ length: 21 }, (_, index) => claim(index + 1)))), /safe_projection_budget_exceeded/u);
  assert.throws(() => entryFor(entityStage(["x".repeat(501)])), /safe_projection_budget_exceeded/u);
  const many = Array.from({ length: 20 }, (_, index) => claim(index + 1, Array.from({ length: 10 }, () => "x".repeat(400))));
  assert.throws(() => entryFor(claimsStage(many)), /safe_projection_budget_exceeded/u);
});

test("PR7-P1-008-raw-alias: secret-shaped names and raw provider bytes reject", () => {
  const syntheticSecret = `${["s", "k"].join("")}-${"x".repeat(16)}`;
  assert.throws(() => entryFor({ ...claimsStage(), apiKey: syntheticSecret }), /safe_projection_forbidden_content/u);
  assert.throws(() => buildV2B6SafeCacheEntry(response({ output_parsed: claimsStage(), rawResponseBytes: "00010203" }), receipt), /safe_projection_forbidden_content/u);
});

test("safe-cache own-data snapshot rejects prototype keys, accessors, and proxies without invoking them", () => {
  const polluted = claimsStage();
  Object.defineProperty(polluted, "__proto__", { value: { synthetic: true }, enumerable: true });
  assert.throws(() => entryFor(polluted), /safe_projection_prototype_key_forbidden/u);
  let getterCalls = 0;
  const accessor = {};
  Object.defineProperty(accessor, "output_parsed", { enumerable: true, get() { getterCalls += 1; return claimsStage(); } });
  assert.throws(() => buildV2B6SafeCacheEntry(response(accessor), receipt), /safe_projection_plain_data_required/u);
  assert.equal(getterCalls, 0);
  assert.throws(() => buildV2B6SafeCacheEntry(response(new Proxy({ output_parsed: claimsStage() }, {})), receipt), /safe_projection_plain_data_required/u);
});

test("PR7-P1-008-digest-tamper: projection and entry digest mismatches reject", () => {
  const entry = entryFor(fullOutput());
  const tamperedProjection = { ...entry, projectionDigest: "f".repeat(64) };
  assert.equal(validateV2B6SafeCacheEntry(tamperedProjection).issues.includes("entry_projection_digest_invalid"), true);
  assert.equal(validateV2B6SafeCacheEntry(tamperedProjection).issues.includes("safe_cache_digest_invalid"), true);
  const tamperedEntry = { ...entry, entryDigest: "f".repeat(64) };
  assert.equal(validateV2B6SafeCacheEntry(tamperedEntry).issues.includes("entry_digest_invalid"), true);
});

test("secondary safe-cache checker independently confirms exact keys, budgets, and canonical digests", () => {
  const entry = entryFor(fullOutput());
  assert.equal(independentlyVerifyB3SafeCacheEntry(entry).valid, true);
  const tampered = { ...entry, projectionDigest: "f".repeat(64) };
  assert.equal(independentlyVerifyB3SafeCacheEntry(tampered).issues.includes("secondary_projection_digest_invalid"), true);
  const unknown = { ...entry, projection: { ...entry.projection, unknown: "synthetic" } };
  assert.equal(independentlyVerifyB3SafeCacheEntry(unknown).issues.includes("secondary_projection_keys_invalid"), true);
});

test("valid boundary projection is accepted exactly and never truncated", () => {
  const limitations = Array.from({ length: 10 }, (_, index) => `${index}:${"界".repeat(160)}`);
  const value = entityStage(limitations);
  const projected = projectSafeCacheResponse({ output_parsed: value }, SAFE_CACHE_PROFILE_IDS.CAPABILITY_E2);
  assert.deepEqual(projected.projection, value);
  assert.equal(projected.projection.limitations.length, 10);
});

test("cache root accepts only v0.3 exact entries and no legacy/current raw cache", () => {
  const cache = newV2B6SafeCache();
  cache.entries["a".repeat(64)] = entryFor(fullOutput());
  assert.equal(validateV2B6SafeCache(cache).valid, true);
  assert.equal(validateV2B6SafeCache({ ...cache, schema: "m2.v2.v2b6-request-cache.v0.2" }).valid, false);
});

test("PR7-P1-008-legacy-current: a v0.2 current cache fails readiness with the registered reason", () => {
  const root = mkdtempSync(join(tmpdir(), "m2-v2-b3-safe-cache-"));
  try {
    const directory = join(root, "data/private-output/m2-v2-evidence-pilot/v2-b6-extraction-remediation");
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "v2b6-request-cache-private-v0.2.json"), "{}\n", "utf8");
    const readiness = inspectV2B6ProviderCacheReadiness(root);
    assert.equal(readiness.safeCacheActualObjectVerified, false);
    assert.equal(readiness.issueCodes.includes("provider_current_cache_schema_not_safe"), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("no-replay profile remains non-replayable and persists only a fixed reason", () => {
  const entry = buildV2B6SafeCacheEntry(response({ status: "synthetic-no-structured-output" }), receipt);
  assert.equal(entry.profileId, SAFE_CACHE_PROFILE_IDS.NO_REPLAY);
  assert.deepEqual(entry.projection, { reasonCode: "structured_value_unavailable" });
  assert.throws(() => restoreV2B6SafeCacheEntry(entry), /v2b6_safe_cache_entry_not_replayable/u);
});
