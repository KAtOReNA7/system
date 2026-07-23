import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runtimePaths = [
  "src/domain/m2V2EvidencePilot/v2b5Runtime.js",
  "src/domain/m2V2EvidencePilot/v2b6Runtime.js",
  "src/domain/m2V2EvidencePilot/v2b7Runtime.js",
  "src/domain/m2V2EvidencePilot/v2b8Runtime.js",
];

const contractPaths = [
  "src/domain/m2V2EvidencePilot/v2b7Contract.js",
  "src/domain/m2V2EvidencePilot/v2b8Contract.js",
];

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("B5-B8 live runtimes append lifecycle events and bind explicit ledger counters at every checkpoint", () => {
  for (const path of runtimePaths) {
    const content = source(path);
    assert.match(content, /assertRuntimeRequestLedgerState/u, `${path}: missing fail-closed state assertion`);
    assert.match(content, /appendRuntimeRequestEvent/u, `${path}: missing direct append`);
    assert.match(content, /requestLedger:\s*(?:context\.)?state\.requestEventLedger/u, `${path}: checkpoint derives ledger`);
    assert.match(content, /counters:\s*(?:context\.)?state\.requestCounters/u, `${path}: checkpoint derives counters`);
    for (const eventType of ["planned", "dispatched", "completed", "indeterminate", "cache_hit_observed"]) {
      assert.match(content, new RegExp(`["']${eventType}["']`, "u"), `${path}: ${eventType} not appended`);
    }
    assert.doesNotMatch(content, /deriveRequestLedgerFromState/u, `${path}: snapshot-derived ledger remains`);
    assert.doesNotMatch(content, /delete\s+[^;\n]*reservations/u, `${path}: reservation deletion remains`);
    assert.doesNotMatch(content, /physicalRequestCount\s*-=\s*1/u, `${path}: counter rollback remains`);
  }
});

test("all new B5-B8 execution states initialize the append-only request ledger and counters", () => {
  assert.match(source(runtimePaths[0]), /return initializeRuntimeRequestLedgerState\(\{/u);
  assert.match(source(runtimePaths[1]), /return initializeRuntimeRequestLedgerState\(\{/u);
  for (const path of contractPaths) {
    assert.match(source(path), /return initializeRuntimeRequestLedgerState\(\{/u, `${path}: state initialization missing`);
  }
});

test("compatibility retries reserve a distinct append-only ledger event", () => {
  assert.match(source(runtimePaths[0]), /compatibility_retry_reserved/u);
  assert.match(source(runtimePaths[1]), /compatibility_retry_reserved/u);
});
