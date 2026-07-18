import assert from "node:assert/strict";
import test from "node:test";
import {
  buildV2B6SafeCacheEntry,
  newV2B6SafeCache,
  restoreV2B6SafeCacheEntry,
  validateV2B6SafeCache,
} from "../src/domain/m2V2EvidencePilot/v2b6SafeCache.js";
import { sha256 } from "../src/domain/m2V2EvidencePilot/pilotCore.js";

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
  receiptDigest: sha256("synthetic-receipt"),
});

test("V2-B.6 cache persists only a replay projection, never response.json", () => {
  const entry = buildV2B6SafeCacheEntry(response({
    id: "provider-envelope-must-not-persist",
    model: "synthetic-model",
    output_parsed: { ok: true },
    usage: { input_tokens: 10, output_tokens: 2 },
  }), receipt);
  const cache = newV2B6SafeCache();
  cache.entries["a".repeat(64)] = entry;
  const serialized = JSON.stringify(cache);
  assert.equal(validateV2B6SafeCache(cache).valid, true);
  assert.equal(/"response"\s*:/u.test(serialized), false);
  assert.equal(/"json"\s*:/u.test(serialized), false);
  assert.equal(serialized.includes("provider-envelope-must-not-persist"), false);
  const restored = restoreV2B6SafeCacheEntry(entry);
  assert.deepEqual(restored.response.json, { output_parsed: { ok: true } });
  assert.equal(restored.response.rawResponsePersisted, false);
});

test("V2-B.6 cache can replay only an exact OK capability carrier", () => {
  const entry = buildV2B6SafeCacheEntry(response({
    output: [{ type: "message", content: [{ type: "output_text", text: "OK" }] }],
  }), receipt);
  assert.equal(entry.safeReplay.kind, "capability_ok");
  assert.equal(restoreV2B6SafeCacheEntry(entry).response.json.output[0].content[0].text, "OK");
});

test("V2-B.6 cache verifier rejects raw response keys and secret-like values", () => {
  const syntheticSecretLike = `${["s", "k"].join("")}-${"a".repeat(16)}`;
  const cache = newV2B6SafeCache();
  cache.entries["b".repeat(64)] = {
    ...buildV2B6SafeCacheEntry(response({ output_parsed: { ok: true } }), receipt),
    response: { json: { secret: syntheticSecretLike } },
  };
  const validation = validateV2B6SafeCache(cache);
  assert.equal(validation.valid, false);
  assert.equal(validation.issues.some((issue) => issue.includes("forbidden_key:response")), true);
  assert.equal(validation.issues.some((issue) => issue.includes("secret_like_value")), true);
});
