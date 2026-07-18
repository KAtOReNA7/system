import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { sha256 } from "../src/domain/m2V2EvidencePilot/pilotCore.js";
import {
  V2B6_LEGACY_CACHE_RELATIVE,
  V2B6_RAW_CACHE_QUARANTINE_RELATIVE,
  V2B6_RAW_CACHE_RECEIPT_RELATIVE,
  V2B6_SAFE_CACHE_RELATIVE,
  migrateV2B6RawCache,
} from "../src/domain/m2V2EvidencePilot/v2b6RawCacheMigration.js";
import { validateV2B6SafeCache } from "../src/domain/m2V2EvidencePilot/v2b6SafeCache.js";

test("B6 raw cache migration quarantines bytes and installs only safe projections", () => withRoot((root) => {
  seedLegacy(root);
  const first = migrateV2B6RawCache(root, { skipGitBoundary: true });
  assert.equal(first.status, "MIGRATED");
  assert.equal(first.legacyEntryCount, 1);
  assert.equal(first.legacyRawResponsePersisted, true);
  assert.equal(first.rawResponseCurrentCacheCountAfter, 0);
  assert.equal(first.providerRequestDelta, 0);
  const safe = readJson(root, V2B6_SAFE_CACHE_RELATIVE);
  assert.equal(validateV2B6SafeCache(safe).valid, true);
  assert.equal(hasForbiddenResponseKey(safe), false);
  assert.equal(readJson(root, V2B6_RAW_CACHE_RECEIPT_RELATIVE).legacyProviderJsonEntryCount, 1);
  assert.equal(readJson(root, V2B6_RAW_CACHE_QUARANTINE_RELATIVE).schema, "m2.v2.v2b6-request-cache.v0.1");
  const second = migrateV2B6RawCache(root, { skipGitBoundary: true });
  assert.equal(second.status, "ALREADY_MIGRATED_NOOP");
  assert.equal(second.wroteCurrentState, false);
}));

for (const faultAt of ["quarantine_before", "quarantine_after", "safe_promote_after", "receipt_before"]) {
  test(`B6 raw cache migration rolls back at ${faultAt}`, () => withRoot((root) => {
    const original = seedLegacy(root);
    assert.throws(
      () => migrateV2B6RawCache(root, { skipGitBoundary: true, faultAt }),
      /v2b6_raw_cache_migration_rolled_back/u,
    );
    assert.deepEqual(readFileSync(join(root, ...V2B6_LEGACY_CACHE_RELATIVE.split("/"))), original);
    assert.throws(() => readFileSync(join(root, ...V2B6_SAFE_CACHE_RELATIVE.split("/"))), /ENOENT/u);
  }));
}

function seedLegacy(root) {
  const key = "a".repeat(64);
  const receiptPayload = {
    schema: "m2.v2.relay-extraction-receipt.v0.2",
    rawResponsePersisted: false,
    requestedModelId: "model-a",
    returnedModelId: "model-a",
    modelBindingVerified: true,
    status: "ok",
    normalizedResponse: { structuredValid: true, claims: [] },
  };
  const receipt = { ...receiptPayload, receiptDigest: sha256(receiptPayload) };
  const legacy = {
    schema: "m2.v2.v2b6-request-cache.v0.1",
    privateOnly: true,
    entries: {
      [key]: {
        response: {
          json: { output_parsed: { schemaVersion: "v0.2", claims: [] } },
          requestStartedAt: "2026-07-18T00:00:00.000Z",
          responseReceivedAt: "2026-07-18T00:00:01.000Z",
          latencyMs: 1000,
          timeoutMs: 30000,
          timedOut: false,
          httpStatus: 200,
          httpOk: true,
          status: "ok",
          contentTypeClass: "json",
          responseDigest: "b".repeat(64),
          responseByteLength: 100,
          rawResponsePersisted: false,
        },
        receipt,
      },
    },
  };
  const bytes = Buffer.from(`${JSON.stringify(legacy, null, 2)}\n`, "utf8");
  const path = join(root, ...V2B6_LEGACY_CACHE_RELATIVE.split("/"));
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, bytes);
  return bytes;
}

function withRoot(callback) {
  const root = mkdtempSync(join(tmpdir(), "m2-v2-raw-cache-migration-"));
  try { return callback(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

function readJson(root, relative) {
  return JSON.parse(readFileSync(join(root, ...relative.split("/")), "utf8"));
}

function hasForbiddenResponseKey(value) {
  if (Array.isArray(value)) return value.some(hasForbiddenResponseKey);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) => (
    ["json", "raw", "rawBody", "rawResponse", "response", "responseBody"].includes(key)
      || hasForbiddenResponseKey(child)
  ));
}
