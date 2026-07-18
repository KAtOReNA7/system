import { canonicalJson, sha256 } from "./pilotCore.js";

export const REQUEST_EVENT_SCHEMA = "m2.v2.request-event-private.v0.1";

export const REQUEST_EVENT_TYPES = Object.freeze([
  "planned",
  "reserved",
  "dispatched",
  "completed",
  "indeterminate",
  "cache_hit_observed",
  "compatibility_retry_reserved",
  "provider_failed",
  "contract_failed",
]);

export const REQUEST_COUNTER_FIELDS = Object.freeze([
  "planned",
  "reserved",
  "dispatched",
  "completed",
  "indeterminate",
  "providerFailed",
  "contractFailed",
  "cacheHit",
]);

const EVENT_KEYS = Object.freeze([
  "schema",
  "eventId",
  "sequence",
  "timestamp",
  "provider",
  "stage",
  "logicalKey",
  "physicalKey",
  "eventType",
  "requestDigest",
  "receiptDigest",
  "previousEventDigest",
  "eventDigest",
]);

const EVENT_TYPE_TO_COUNTER = Object.freeze({
  planned: "planned",
  reserved: "reserved",
  compatibility_retry_reserved: "reserved",
  dispatched: "dispatched",
  completed: "completed",
  indeterminate: "indeterminate",
  provider_failed: "providerFailed",
  contract_failed: "contractFailed",
  cache_hit_observed: "cacheHit",
});

/**
 * Append one immutable request event. The function returns a new array and
 * never changes an existing event. Callers commit the returned ledger with the
 * other transaction members.
 */
export function appendRequestEvent(ledgerInput, eventInput) {
  const ledger = cloneJson(ledgerInput ?? []);
  const prior = validateRequestEventLedger(ledger);
  if (!prior.valid) throw new Error(`request_event_ledger_invalid:${prior.issues.join(",")}`);
  if (!isPlainObject(eventInput)) throw new Error("request_event_input_invalid");

  const sequence = ledger.length + 1;
  const previousEventDigest = ledger.at(-1)?.eventDigest ?? null;
  const base = {
    schema: REQUEST_EVENT_SCHEMA,
    sequence,
    timestamp: requiredTimestamp(eventInput.timestamp),
    provider: requiredKey(eventInput.provider, "request_event_provider_invalid"),
    stage: requiredKey(eventInput.stage, "request_event_stage_invalid"),
    logicalKey: requiredKey(eventInput.logicalKey, "request_event_logical_key_invalid", 500),
    physicalKey: requiredKey(eventInput.physicalKey, "request_event_physical_key_invalid", 500),
    eventType: requiredEventType(eventInput.eventType),
    requestDigest: requiredDigest(eventInput.requestDigest, "request_event_request_digest_invalid"),
    receiptDigest: optionalDigest(eventInput.receiptDigest, "request_event_receipt_digest_invalid"),
    previousEventDigest,
  };
  const eventId = buildRequestEventId(base);
  const payload = { ...base, eventId };
  const event = { ...payload, eventDigest: sha256(payload) };
  const result = [...ledger, event];
  const validation = validateRequestEventLedger(result);
  if (!validation.valid) throw new Error(`request_event_append_invalid:${validation.issues.join(",")}`);
  return result;
}

export function validateRequestEventLedger(ledgerInput, options = {}) {
  const issues = [];
  if (!Array.isArray(ledgerInput)) return { valid: false, issues: ["ledger_not_array"], replay: null };
  const events = ledgerInput;
  let previousEventDigest = null;
  const eventIds = new Set();
  const logicalPlans = new Set();
  const physical = new Map();
  const counters = emptyRequestCounters();

  for (const [index, event] of events.entries()) {
    const label = `event_${index + 1}`;
    if (!isPlainObject(event)) {
      issues.push(`${label}:not_object`);
      continue;
    }
    const keys = Object.keys(event).sort();
    if (canonicalJson(keys) !== canonicalJson([...EVENT_KEYS].sort())) issues.push(`${label}:key_set_invalid`);
    if (event.schema !== REQUEST_EVENT_SCHEMA) issues.push(`${label}:schema_invalid`);
    if (event.sequence !== index + 1) issues.push(`${label}:sequence_invalid`);
    if (!isTimestamp(event.timestamp)) issues.push(`${label}:timestamp_invalid`);
    if (!validKey(event.provider, 200)) issues.push(`${label}:provider_invalid`);
    if (!validKey(event.stage, 200)) issues.push(`${label}:stage_invalid`);
    if (options.stage && event.stage !== options.stage) issues.push(`${label}:stage_mismatch`);
    if (!validKey(event.logicalKey, 500)) issues.push(`${label}:logical_key_invalid`);
    if (!validKey(event.physicalKey, 500)) issues.push(`${label}:physical_key_invalid`);
    if (!REQUEST_EVENT_TYPES.includes(event.eventType)) issues.push(`${label}:event_type_invalid`);
    if (!isDigest(event.requestDigest)) issues.push(`${label}:request_digest_invalid`);
    if (event.receiptDigest !== null && !isDigest(event.receiptDigest)) issues.push(`${label}:receipt_digest_invalid`);
    if (event.previousEventDigest !== previousEventDigest) issues.push(`${label}:previous_event_digest_invalid`);
    if (!validEventId(event.eventId)) issues.push(`${label}:event_id_invalid`);
    else if (eventIds.has(event.eventId)) issues.push(`${label}:event_id_duplicate`);
    else eventIds.add(event.eventId);

    const { eventDigest, ...payload } = event;
    if (!isDigest(eventDigest) || eventDigest !== sha256(payload)) issues.push(`${label}:event_digest_invalid`);
    if (validEventId(event.eventId) && event.eventId !== buildRequestEventId(omitKeys(payload, ["eventId"]))) {
      issues.push(`${label}:event_id_content_mismatch`);
    }
    previousEventDigest = isDigest(eventDigest) ? eventDigest : null;

    const counter = EVENT_TYPE_TO_COUNTER[event.eventType];
    if (counter) counters[counter] += 1;
    validateTransition(event, { logicalPlans, physical, issues, label });
  }

  const reservations = Object.fromEntries([...physical.entries()].sort(([left], [right]) => left.localeCompare(right)));
  const replay = {
    counters,
    physicalReservationCount: Object.keys(reservations).length,
    reservations,
    lastEventDigest: events.at(-1)?.eventDigest ?? null,
  };
  return { valid: issues.length === 0, issues: [...new Set(issues)], replay };
}

export function replayRequestEventLedger(ledgerInput, options = {}) {
  const validation = validateRequestEventLedger(ledgerInput, options);
  if (!validation.valid) throw new Error(`request_event_ledger_invalid:${validation.issues.join(",")}`);
  return cloneJson(validation.replay);
}

export function emptyRequestCounters() {
  return Object.fromEntries(REQUEST_COUNTER_FIELDS.map((field) => [field, 0]));
}

export function initializeRuntimeRequestLedgerState(state) {
  if (!isPlainObject(state)) throw new Error("runtime_request_state_invalid");
  state.requestEventLedger = [];
  state.requestCounters = emptyRequestCounters();
  return state;
}

export function assertRuntimeRequestLedgerState(state, stage) {
  if (!isPlainObject(state) || !Array.isArray(state.requestEventLedger) || !isPlainObject(state.requestCounters)) {
    throw new Error("runtime_request_event_ledger_migration_required");
  }
  const validation = validateRequestEventLedger(state.requestEventLedger, { stage });
  if (!validation.valid) throw new Error(`runtime_request_event_ledger_invalid:${validation.issues.join(",")}`);
  if (canonicalJson(state.requestCounters) !== canonicalJson(validation.replay.counters)) {
    throw new Error("runtime_request_counter_replay_mismatch");
  }
  return validation.replay;
}

export function appendRuntimeRequestEvent(state, event) {
  assertRuntimeRequestLedgerState(state, event.stage);
  state.requestEventLedger = appendRequestEvent(state.requestEventLedger, event);
  state.requestCounters = replayRequestEventLedger(state.requestEventLedger, { stage: event.stage }).counters;
  return state.requestEventLedger.at(-1);
}

export function buildRequestEventId(eventWithoutId) {
  const identity = {
    sequence: eventWithoutId.sequence,
    timestamp: eventWithoutId.timestamp,
    provider: eventWithoutId.provider,
    stage: eventWithoutId.stage,
    logicalKey: eventWithoutId.logicalKey,
    physicalKey: eventWithoutId.physicalKey,
    eventType: eventWithoutId.eventType,
    requestDigest: eventWithoutId.requestDigest,
    receiptDigest: eventWithoutId.receiptDigest,
    previousEventDigest: eventWithoutId.previousEventDigest,
  };
  return `evt_${sha256(identity).slice(0, 32)}`;
}

/**
 * Deterministically migrate facts that already exist locally. Ambiguous
 * receipt matches are reported and conservatively become indeterminate; the
 * function never invents dispatch or completion evidence.
 */
export function migrateLegacyRequestEvents(input) {
  if (!isPlainObject(input)) throw new Error("legacy_request_migration_input_invalid");
  const stage = requiredKey(input.stage, "legacy_request_migration_stage_invalid");
  const observedAt = requiredTimestamp(input.observedAt);
  const receipts = normalizeReceiptFacts(input.receipts ?? []);
  const reservations = flattenReservations(input.reservationsByProvider ?? {});
  const cacheHits = Array.isArray(input.cacheHits) ? cloneJson(input.cacheHits) : [];
  let ledger = [];
  const ambiguities = [];

  for (const row of reservations) {
    const { provider, physicalKey, reservation } = row;
    const logicalKey = legacyLogicalKey(stage, provider, physicalKey, reservation);
    const requestDigest = legacyRequestDigest(stage, provider, physicalKey, reservation);
    const reservedAt = isTimestamp(reservation.reservedAt) ? reservation.reservedAt : observedAt;
    ledger = appendRequestEvent(ledger, {
      timestamp: reservedAt, provider, stage, logicalKey, physicalKey,
      eventType: "planned", requestDigest, receiptDigest: null,
    });
    ledger = appendRequestEvent(ledger, {
      timestamp: reservedAt, provider, stage, logicalKey, physicalKey,
      eventType: reservation.compatibilityRetry === true ? "compatibility_retry_reserved" : "reserved",
      requestDigest, receiptDigest: null,
    });

    const matches = receipts.filter((receipt) => receiptMatchesReservation(receipt.payload, physicalKey, reservation));
    if (matches.length !== 1) {
      ambiguities.push({ provider, physicalKeyDigest: sha256(physicalKey), matchCount: matches.length });
      ledger = appendRequestEvent(ledger, {
        timestamp: legacyTerminalTimestamp(reservation, observedAt), provider, stage, logicalKey, physicalKey,
        eventType: "indeterminate", requestDigest, receiptDigest: null,
      });
      continue;
    }
    const match = matches[0];
    if (!receiptProvesDispatch(match.payload)) {
      ambiguities.push({ provider, physicalKeyDigest: sha256(physicalKey), matchCount: 1, issue: "dispatch_not_proven" });
      ledger = appendRequestEvent(ledger, {
        timestamp: legacyTerminalTimestamp(reservation, observedAt), provider, stage, logicalKey, physicalKey,
        eventType: "indeterminate", requestDigest, receiptDigest: null,
      });
      continue;
    }
    ledger = appendRequestEvent(ledger, {
      timestamp: isTimestamp(match.payload.requestStartedAt) ? match.payload.requestStartedAt : reservedAt,
      provider, stage, logicalKey, physicalKey, eventType: "dispatched", requestDigest, receiptDigest: null,
    });
    const terminalType = legacyTerminalEventType(reservation, match.payload);
    ledger = appendRequestEvent(ledger, {
      timestamp: legacyReceiptTimestamp(match.payload, reservation, observedAt),
      provider, stage, logicalKey, physicalKey, eventType: terminalType,
      requestDigest, receiptDigest: terminalType === "completed" ? match.receiptDigest : optionalDigest(match.receiptDigest),
    });
  }

  for (const [index, hit] of cacheHits.sort(compareLegacyCacheHits).entries()) {
    const provider = requiredKey(hit.provider, "legacy_cache_hit_provider_invalid");
    const logicalKey = requiredKey(hit.logicalKey ?? `cache-hit-${index + 1}`, "legacy_cache_hit_logical_key_invalid", 500);
    const physicalKey = requiredKey(hit.physicalKey, "legacy_cache_hit_physical_key_invalid", 500);
    const requestDigest = requiredDigest(hit.requestDigest, "legacy_cache_hit_request_digest_invalid");
    const receiptDigest = requiredDigest(hit.receiptDigest, "legacy_cache_hit_receipt_digest_invalid");
    const timestamp = isTimestamp(hit.timestamp) ? hit.timestamp : observedAt;
    ledger = appendRequestEvent(ledger, {
      timestamp, provider, stage, logicalKey, physicalKey, eventType: "planned", requestDigest, receiptDigest: null,
    });
    ledger = appendRequestEvent(ledger, {
      timestamp, provider, stage, logicalKey, physicalKey, eventType: "cache_hit_observed", requestDigest, receiptDigest,
    });
  }

  const validation = validateRequestEventLedger(ledger, { stage });
  return {
    ledger,
    validation,
    ambiguities,
    migrationComplete: validation.valid && ambiguities.length === 0,
    providerRequestDelta: 0,
    requestCounterReset: false,
    ledgerDigest: sha256(ledger),
  };
}

function validateTransition(event, context) {
  const { logicalPlans, physical, issues, label } = context;
  const logicalIdentity = `${event.provider}\u0000${event.logicalKey}`;
  const physicalIdentity = `${event.provider}\u0000${event.physicalKey}`;
  const current = physical.get(physicalIdentity);
  switch (event.eventType) {
    case "planned":
      if (logicalPlans.has(logicalIdentity)) issues.push(`${label}:logical_plan_duplicate`);
      else logicalPlans.add(logicalIdentity);
      break;
    case "reserved":
      if (!logicalPlans.has(logicalIdentity)) issues.push(`${label}:reservation_without_plan`);
      if (current) issues.push(`${label}:physical_reservation_duplicate`);
      else physical.set(physicalIdentity, { status: "reserved", provider: event.provider, physicalKey: event.physicalKey, logicalKey: event.logicalKey, receiptDigest: null });
      break;
    case "compatibility_retry_reserved":
      if (!logicalPlans.has(logicalIdentity)) issues.push(`${label}:compatibility_retry_without_plan`);
      if (current) issues.push(`${label}:physical_reservation_duplicate`);
      else physical.set(physicalIdentity, { status: "compatibility_retry_reserved", provider: event.provider, physicalKey: event.physicalKey, logicalKey: event.logicalKey, receiptDigest: null });
      break;
    case "dispatched":
      if (!current || !["reserved", "compatibility_retry_reserved"].includes(current.status)) issues.push(`${label}:dispatch_without_open_reservation`);
      else current.status = "dispatched";
      break;
    case "completed":
      if (!current || current.status !== "dispatched") issues.push(`${label}:completion_without_dispatch`);
      if (!isDigest(event.receiptDigest)) issues.push(`${label}:completion_receipt_required`);
      if (current) { current.status = "completed"; current.receiptDigest = event.receiptDigest; }
      break;
    case "indeterminate":
    case "provider_failed":
    case "contract_failed":
      if (!current || !["reserved", "compatibility_retry_reserved", "dispatched"].includes(current.status)) {
        issues.push(`${label}:terminal_without_open_reservation`);
      } else {
        current.status = event.eventType;
        current.receiptDigest = event.receiptDigest;
      }
      break;
    case "cache_hit_observed":
      if (!logicalPlans.has(logicalIdentity)) issues.push(`${label}:cache_hit_without_plan`);
      if (!isDigest(event.receiptDigest)) issues.push(`${label}:cache_hit_receipt_required`);
      break;
    default:
      break;
  }
}

function normalizeReceiptFacts(values) {
  if (!Array.isArray(values)) throw new Error("legacy_receipts_invalid");
  return values.map((value, index) => {
    const envelope = value?.schema === "receipt-envelope-v0.2" ? value : value?.envelope;
    if (envelope?.schema !== "receipt-envelope-v0.2" || !isPlainObject(envelope.receiptPayload)) {
      throw new Error(`legacy_receipt_envelope_required:${index + 1}`);
    }
    if (envelope.receiptDigest !== sha256(envelope.receiptPayload)) throw new Error(`legacy_receipt_digest_invalid:${index + 1}`);
    return { payload: envelope.receiptPayload, receiptDigest: envelope.receiptDigest, runtimeView: envelope.runtimeView ?? {} };
  });
}

function receiptProvesDispatch(receipt) {
  if (receipt.dispatched === true) return true;
  if (!isTimestamp(receipt.requestStartedAt)) return false;
  const responseObserved = isTimestamp(receipt.responseReceivedAt) || Number.isInteger(receipt.httpStatus);
  if (!responseObserved) return false;
  if (isTimestamp(receipt.responseReceivedAt)
    && Date.parse(receipt.requestStartedAt) > Date.parse(receipt.responseReceivedAt)) return false;
  return true;
}

function flattenReservations(value) {
  if (!isPlainObject(value)) throw new Error("legacy_reservations_invalid");
  const rows = [];
  for (const provider of Object.keys(value).sort()) {
    if (!isPlainObject(value[provider])) throw new Error("legacy_provider_reservations_invalid");
    for (const physicalKey of Object.keys(value[provider]).sort()) {
      const reservation = value[provider][physicalKey];
      if (!isPlainObject(reservation)) throw new Error("legacy_reservation_invalid");
      rows.push({ provider, physicalKey, reservation: cloneJson(reservation) });
    }
  }
  return rows;
}

function receiptMatchesReservation(receipt, physicalKey, reservation) {
  const candidates = [
    receipt.physicalKey,
    receipt.physicalRequestKey,
    receipt.requestKey,
    receipt.cacheKey,
    receipt.logicalExtractionKey,
  ].filter((value) => value !== undefined && value !== null).map(String);
  const reservationKeys = [physicalKey, reservation.cacheKey, reservation.requestKey, reservation.logicalKey]
    .filter((value) => value !== undefined && value !== null).map(String);
  return candidates.some((candidate) => reservationKeys.includes(candidate));
}

function legacyLogicalKey(stage, provider, physicalKey, reservation) {
  const supplied = reservation.logicalKey ?? reservation.queryId ?? reservation.requestIdentity ?? reservation.cacheKey;
  return validKey(supplied, 500) ? String(supplied) : `legacy:${sha256({ stage, provider, physicalKey }).slice(0, 48)}`;
}

function legacyRequestDigest(stage, provider, physicalKey, reservation) {
  for (const candidate of [reservation.requestDigest, reservation.requestPayloadDigest, reservation.descriptor?.requestPayloadDigest]) {
    if (isDigest(candidate)) return candidate;
  }
  return sha256({ stage, provider, physicalKeyDigest: sha256(physicalKey), reservation: omitKeys(reservation, ["result", "response", "rawResponse"]) });
}

function legacyTerminalEventType(reservation, receipt) {
  if (reservation.status === "indeterminate_after_crash") return "indeterminate";
  if (receipt.status === "provider_failed" || receipt.status === "transport_error") return "provider_failed";
  if (receipt.status === "contract_failed") return "contract_failed";
  return "completed";
}

function legacyReceiptTimestamp(receipt, reservation, observedAt) {
  return [receipt.responseReceivedAt, receipt.completedAt, reservation.completedAt, observedAt].find(isTimestamp);
}

function legacyTerminalTimestamp(reservation, observedAt) {
  return [reservation.completedAt, reservation.dispatchStartedAt, reservation.reservedAt, observedAt].find(isTimestamp);
}

function compareLegacyCacheHits(left, right) {
  return `${left.timestamp ?? ""}:${left.provider ?? ""}:${left.physicalKey ?? ""}:${left.logicalKey ?? ""}`
    .localeCompare(`${right.timestamp ?? ""}:${right.provider ?? ""}:${right.physicalKey ?? ""}:${right.logicalKey ?? ""}`);
}

function requiredEventType(value) {
  const type = String(value ?? "");
  if (!REQUEST_EVENT_TYPES.includes(type)) throw new Error("request_event_type_invalid");
  return type;
}

function requiredDigest(value, code) {
  if (!isDigest(value)) throw new Error(code);
  return String(value);
}

function optionalDigest(value, code = "request_event_optional_digest_invalid") {
  if (value === null || value === undefined) return null;
  return requiredDigest(value, code);
}

function requiredTimestamp(value) {
  if (!isTimestamp(value)) throw new Error("request_event_timestamp_invalid");
  return String(value);
}

function requiredKey(value, code, maxLength = 200) {
  if (!validKey(value, maxLength)) throw new Error(code);
  return String(value);
}

function validKey(value, maxLength) {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength && !/[\r\n\u0000]/u.test(value);
}

function validEventId(value) {
  return typeof value === "string" && /^evt_[a-f0-9]{32}$/u.test(value);
}

function isDigest(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function isTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function omitKeys(value, keys) {
  const denied = new Set(keys);
  return Object.fromEntries(Object.entries(value).filter(([key]) => !denied.has(key)));
}

function cloneJson(value) {
  return JSON.parse(canonicalJson(value));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
