import assert from "node:assert/strict";
import test from "node:test";
import "./m2-v2-public-verifier-request-integrity.test.js";
import { sha256 } from "../src/domain/m2V2EvidencePilot/pilotCore.js";
import { buildRequestStateCheckpointProjection } from "../src/domain/m2V2EvidencePilot/integrityState.js";
import {
  appendRuntimeRequestEvent,
  appendRequestEvent,
  assertRuntimeRequestLedgerState,
  emptyRequestCounters,
  initializeRuntimeRequestLedgerState,
  migrateLegacyRequestEvents,
  replayRequestEventLedger,
  validateRequestEventLedger,
} from "../src/domain/m2V2EvidencePilot/requestEventLedger.js";

const timestamp = "2026-07-18T00:00:00.000Z";
const requestDigest = sha256({ request: "synthetic" });
const receiptDigest = sha256({ receipt: "synthetic" });

function append(ledger, eventType, overrides = {}) {
  return appendRequestEvent(ledger, {
    timestamp,
    provider: "synthetic-provider",
    stage: "synthetic-stage",
    logicalKey: "logical-1",
    physicalKey: "physical-1",
    eventType,
    requestDigest,
    receiptDigest: eventType === "completed" || eventType === "cache_hit_observed" ? receiptDigest : null,
    ...overrides,
  });
}

test("request events form a replayable append-only digest chain", () => {
  let ledger = [];
  for (const eventType of ["planned", "reserved", "dispatched", "completed"]) ledger = append(ledger, eventType);

  const validation = validateRequestEventLedger(ledger, { stage: "synthetic-stage" });
  assert.equal(validation.valid, true, validation.issues.join(","));
  assert.deepEqual(validation.replay.counters, {
    ...emptyRequestCounters(),
    planned: 1,
    reserved: 1,
    dispatched: 1,
    completed: 1,
  });
  assert.equal(validation.replay.physicalReservationCount, 1);
  assert.equal(validation.replay.reservations["synthetic-provider\u0000physical-1"].status, "completed");
  for (let index = 1; index < ledger.length; index += 1) {
    assert.equal(ledger[index].previousEventDigest, ledger[index - 1].eventDigest);
    assert.equal(ledger[index].sequence, index + 1);
  }
  assert.deepEqual(replayRequestEventLedger(ledger), validation.replay);
});

test("runtime ledger state initializes explicitly and missing or divergent migration fails closed", () => {
  assert.throws(
    () => assertRuntimeRequestLedgerState({}, "synthetic-stage"),
    /runtime_request_event_ledger_migration_required/u,
  );
  const state = initializeRuntimeRequestLedgerState({ schema: "synthetic-runtime-state" });
  appendRuntimeRequestEvent(state, {
    timestamp,
    provider: "synthetic-provider",
    stage: "synthetic-stage",
    logicalKey: "logical-runtime",
    physicalKey: "physical-runtime",
    eventType: "planned",
    requestDigest,
    receiptDigest: null,
  });
  assert.equal(assertRuntimeRequestLedgerState(state, "synthetic-stage").counters.planned, 1);
  state.requestCounters.planned = 0;
  assert.throws(
    () => assertRuntimeRequestLedgerState(state, "synthetic-stage"),
    /runtime_request_counter_replay_mismatch/u,
  );
});

test("atomic checkpoint projection replays cache hits and compatibility retries without counter drift", () => {
  let ledger = append([], "planned", { logicalKey: "logical-cache", physicalKey: "physical-cache" });
  ledger = append(ledger, "cache_hit_observed", { logicalKey: "logical-cache", physicalKey: "physical-cache" });
  ledger = append(ledger, "planned", { logicalKey: "logical-retry", physicalKey: "physical-retry" });
  ledger = append(ledger, "compatibility_retry_reserved", { logicalKey: "logical-retry", physicalKey: "physical-retry" });
  ledger = append(ledger, "dispatched", { logicalKey: "logical-retry", physicalKey: "physical-retry" });
  ledger = append(ledger, "completed", { logicalKey: "logical-retry", physicalKey: "physical-retry" });
  const counters = replayRequestEventLedger(ledger).counters;
  const projection = buildRequestStateCheckpointProjection({
    scope: "synthetic-stage",
    transactionId: "synthetic-transaction",
    state: { requestEventLedger: ledger, requestCounters: counters },
    caches: {},
    receipts: [],
    requestLedger: ledger,
    counters,
  });
  assert.deepEqual(projection.counters, counters);
  assert.equal(projection.counters.cacheHit, 1);
  assert.equal(projection.counters.reserved, 1);
});

test("cache hits are events and do not consume or roll back a reservation", () => {
  let ledger = append([], "planned");
  ledger = append(ledger, "cache_hit_observed");
  const replay = replayRequestEventLedger(ledger);
  assert.equal(replay.counters.planned, 1);
  assert.equal(replay.counters.cacheHit, 1);
  assert.equal(replay.counters.reserved, 0);
  assert.equal(replay.physicalReservationCount, 0);
});

test("crash indeterminate and compatibility retry preserve every reservation", () => {
  let ledger = append([], "planned");
  ledger = append(ledger, "reserved");
  ledger = append(ledger, "indeterminate");
  ledger = append(ledger, "compatibility_retry_reserved", { physicalKey: "physical-2" });
  ledger = append(ledger, "dispatched", { physicalKey: "physical-2" });
  ledger = append(ledger, "completed", { physicalKey: "physical-2" });

  const replay = replayRequestEventLedger(ledger);
  assert.equal(replay.counters.reserved, 2);
  assert.equal(replay.counters.indeterminate, 1);
  assert.equal(replay.counters.completed, 1);
  assert.equal(replay.physicalReservationCount, 2);
  assert.equal(replay.reservations["synthetic-provider\u0000physical-1"].status, "indeterminate");
  assert.equal(replay.reservations["synthetic-provider\u0000physical-2"].status, "completed");
});

test("duplicate, deletion, reordering and chain mutation fail validation", () => {
  let ledger = [];
  for (const eventType of ["planned", "reserved", "dispatched", "completed"]) ledger = append(ledger, eventType);

  const duplicate = [...ledger, ledger.at(-1)];
  assert.equal(validateRequestEventLedger(duplicate).valid, false);

  const deleted = [ledger[0], ledger[2], ledger[3]];
  assert.equal(validateRequestEventLedger(deleted).valid, false);

  const reordered = [ledger[1], ledger[0], ledger[2], ledger[3]];
  assert.equal(validateRequestEventLedger(reordered).valid, false);

  const mutated = structuredClone(ledger);
  mutated[1].logicalKey = "mutated";
  assert.equal(validateRequestEventLedger(mutated).valid, false);
});

test("legacy migration is deterministic, offline and receipt-evidence conservative", () => {
  const receiptPayload = {
    physicalKey: "physical-legacy",
    dispatched: true,
    requestStartedAt: timestamp,
    responseReceivedAt: "2026-07-18T00:00:01.000Z",
    status: "completed",
  };
  const input = {
    stage: "legacy-stage",
    observedAt: "2026-07-18T00:00:02.000Z",
    reservationsByProvider: {
      relay: {
        "physical-legacy": {
          status: "completed",
          logicalKey: "logical-legacy",
          requestDigest,
          reservedAt: timestamp,
          completedAt: "2026-07-18T00:00:01.000Z",
        },
      },
    },
    receipts: [{
      schema: "receipt-envelope-v0.2",
      receiptPayload,
      receiptDigest: sha256(receiptPayload),
      runtimeView: { cacheHit: false, readAt: null, selectedAsEffective: false },
      runtimeViewDigest: sha256({ cacheHit: false, readAt: null, selectedAsEffective: false }),
    }],
    cacheHits: [],
  };
  const first = migrateLegacyRequestEvents(input);
  const second = migrateLegacyRequestEvents(input);
  assert.deepEqual(first, second);
  assert.equal(first.validation.valid, true, first.validation.issues.join(","));
  assert.equal(first.migrationComplete, true);
  assert.equal(first.providerRequestDelta, 0);
  assert.equal(first.requestCounterReset, false);
  assert.deepEqual(first.ledger.map((event) => event.eventType), ["planned", "reserved", "dispatched", "completed"]);
});

test("legacy migration never invents dispatch when receipt mapping is absent or ambiguous", () => {
  const base = {
    stage: "legacy-stage",
    observedAt: timestamp,
    reservationsByProvider: {
      relay: {
        "physical-legacy": { status: "reserved_before_dispatch", logicalKey: "logical-legacy", requestDigest },
      },
    },
    cacheHits: [],
  };
  const noReceipt = migrateLegacyRequestEvents({ ...base, receipts: [] });
  assert.equal(noReceipt.migrationComplete, false);
  assert.deepEqual(noReceipt.ledger.map((event) => event.eventType), ["planned", "reserved", "indeterminate"]);
  assert.equal(noReceipt.validation.replay.counters.dispatched, 0);
  assert.equal(noReceipt.validation.replay.counters.indeterminate, 1);
  assert.equal(noReceipt.providerRequestDelta, 0);

  const payload = { physicalKey: "physical-legacy", dispatched: true };
  const envelope = {
    schema: "receipt-envelope-v0.2",
    receiptPayload: payload,
    receiptDigest: sha256(payload),
  };
  const ambiguous = migrateLegacyRequestEvents({ ...base, receipts: [envelope, envelope] });
  assert.equal(ambiguous.migrationComplete, false);
  assert.equal(ambiguous.validation.replay.counters.dispatched, 0);
  assert.equal(ambiguous.validation.replay.counters.indeterminate, 1);
});

test("legacy envelope migration output and timestamped immutable receipt prove dispatch offline", () => {
  const payload = {
    physicalKey: "physical-legacy",
    requestStartedAt: timestamp,
    responseReceivedAt: "2026-07-18T00:00:01.000Z",
    httpStatus: 200,
  };
  const migratedEnvelope = {
    envelope: {
      schema: "receipt-envelope-v0.2",
      receiptPayload: payload,
      receiptDigest: sha256(payload),
      runtimeView: { cacheHit: false },
    },
    migration: { reason: "runtime_only_stale_digest" },
  };
  const result = migrateLegacyRequestEvents({
    stage: "legacy-stage",
    observedAt: "2026-07-18T00:00:02.000Z",
    reservationsByProvider: {
      relay: {
        "physical-legacy": { logicalKey: "logical-legacy", requestDigest, reservedAt: timestamp },
      },
    },
    receipts: [migratedEnvelope],
    cacheHits: [{
      provider: "relay",
      logicalKey: "logical-cache",
      physicalKey: "physical-cache",
      requestDigest: sha256({ request: "cache" }),
      receiptDigest: sha256(payload),
      timestamp,
    }],
  });
  assert.equal(result.migrationComplete, true, JSON.stringify(result.ambiguities));
  assert.equal(result.providerRequestDelta, 0);
  assert.equal(result.validation.replay.counters.dispatched, 1);
  assert.equal(result.validation.replay.counters.completed, 1);
  assert.equal(result.validation.replay.counters.cacheHit, 1);
});
