import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { validateClosedAtomicRequestBinding } from "./integrityState.js";
import { resolveSafeDirectory } from "./migrationPathIdentity.js";
import { canonicalJson, sha256 } from "./pilotCore.js";
import { inspectV2B6ProviderCacheReadiness } from "./v2b6SafeCache.js";

const ROUTE_REGISTRY_PATH = fileURLToPath(new URL(
  "../../../config/m2-v2-pr7-b3-provider-route-registry.v0.1.json",
  import.meta.url,
));
const ROUTE_REGISTRY_SCHEMA = "m2.v2.pr7.b3-provider-route-registry.v0.1";
const ACTIVE_STATUS = "ACTIVE_CAPABILITY_REQUIRED";
const RETIRED_STATUS = "RETIRED_HARD_FAIL";
const capabilityState = new WeakMap();

/**
 * Re-read every governed authority and issue an opaque capability only inside
 * the logical dispatch callback. The capability cannot be constructed,
 * serialized or cloned by callers, and becomes stale when the callback exits.
 */
export async function withProviderDispatchCapability(options, invokeSink) {
  assertScopeInput(options);
  if (typeof invokeSink !== "function") throw fixedError("provider_sink_callback_invalid");
  if (typeof options.inMemoryTransport !== "function") {
    throw fixedError("provider_in_memory_transport_required");
  }
  const inspected = inspectDispatchScope(options);
  const capability = Object.freeze(Object.create(null));
  const guardedTransport = async (url, init) => options.inMemoryTransport(url, init);
  capabilityState.set(capability, {
    ...inspected,
    active: true,
    consumed: false,
    guardedTransport,
  });
  try {
    return await invokeSink(Object.freeze({ capability, fetchImpl: guardedTransport }));
  } finally {
    const state = capabilityState.get(capability);
    if (state) state.active = false;
  }
}

/** Consume at the lowest sink. Reinspection completes before the one-shot
 * transition, and the transition completes before bearer construction/fetch. */
export function consumeProviderDispatchCapability(capability, options) {
  if (capability === null || typeof capability !== "object") {
    throw fixedError("provider_execution_capability_missing");
  }
  const state = capabilityState.get(capability);
  if (!state) throw fixedError("provider_execution_capability_invalid");
  if (!state.active || state.consumed) {
    throw fixedError("provider_execution_capability_consumed_or_stale");
  }
  assertScopeInput(options, { consume: true });
  if (options.fetchImpl !== state.guardedTransport) {
    throw fixedError("provider_execution_capability_scope_mismatch");
  }
  const requestIdentityDigestSha256 = digestRequest(options.requestPayload);
  if (options.routeId !== state.routeId
      || options.sinkId !== state.sinkId
      || options.phase !== state.phase
      || requestIdentityDigestSha256 !== state.physicalRequestIdentityDigestSha256
      || options.root !== state.root) {
    throw fixedError("provider_execution_capability_scope_mismatch");
  }

  const current = inspectDispatchScope(options);
  if (current.canonicalRootIdentityDigestSha256 !== state.canonicalRootIdentityDigestSha256) {
    throw fixedError("provider_root_changed_after_capability");
  }
  if (current.transactionId !== state.transactionId
      || current.transactionBindingDigestSha256 !== state.transactionBindingDigestSha256) {
    throw fixedError("provider_transaction_changed_after_capability");
  }
  if (current.safeCacheDigestSha256 !== state.safeCacheDigestSha256) {
    throw fixedError("provider_cache_changed_after_capability");
  }
  if (current.transportPolicyDigestSha256 !== state.transportPolicyDigestSha256) {
    throw fixedError("provider_transport_policy_changed_after_capability");
  }
  state.consumed = true;
  return true;
}

export function rejectRetiredProviderRoute() {
  throw fixedError("historical_provider_execution_retired");
}

function inspectDispatchScope(options) {
  const registry = readAndValidateRouteRegistry();
  const route = registry.value.routes.find((entry) => entry.routeId === options.routeId);
  if (!route) throw fixedError("provider_route_unregistered");
  if (route.legacyStatus === RETIRED_STATUS) throw fixedError("historical_provider_execution_retired");
  if (route.legacyStatus !== ACTIVE_STATUS || route.phase !== options.phase
      || !asSinkList(route.lowestSink).includes(options.sinkId)) {
    throw fixedError("provider_execution_capability_scope_mismatch");
  }

  const rootSnapshot = resolveSafeDirectory({
    path: options.root,
    endpointRole: "REPOSITORY",
    stage: "BEFORE_KEY_WRITE",
  });
  const authority = validateClosedAtomicRequestBinding(options.root, {
    scope: options.phase,
    eventStage: options.phase,
  });
  if (!authority.valid) throw fixedError("provider_current_transaction_not_verified");
  const cache = inspectV2B6ProviderCacheReadiness(options.root);
  if (cache.legacyMutableCacheCount !== 0) {
    throw fixedError("provider_legacy_mutable_cache_not_zero");
  }
  if (cache.rawResponseCurrentCacheCount !== 0 || cache.safeCacheActualObjectVerified !== true
      || !isDigest(cache.safeCacheDigest)) {
    throw fixedError("provider_current_cache_not_safe_v0_3");
  }
  return {
    root: options.root,
    routeId: options.routeId,
    sinkId: options.sinkId,
    phase: options.phase,
    physicalRequestIdentityDigestSha256: digestRequest(options.requestPayload),
    canonicalRootIdentityDigestSha256: sha256(rootSnapshot),
    transactionId: authority.transactionId,
    transactionBindingDigestSha256: authority.bindingDigest,
    safeCacheDigestSha256: cache.safeCacheDigest,
    transportPolicyDigestSha256: registry.digest,
  };
}

function readAndValidateRouteRegistry() {
  let bytes;
  let value;
  try {
    bytes = readFileSync(ROUTE_REGISTRY_PATH);
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw fixedError("provider_route_registry_unreadable");
  }
  if (value?.schema !== ROUTE_REGISTRY_SCHEMA
      || value?.providerCapableExportCount !== 6
      || value?.lowestSinkCount !== 6
      || !Array.isArray(value?.routes)
      || !Array.isArray(value?.sinks)) {
    throw fixedError("provider_route_registry_invalid");
  }
  const sinkIds = new Set(value.sinks.map((entry) => entry?.sinkId));
  const routeIds = new Set(value.routes.map((entry) => entry?.routeId));
  if (sinkIds.size !== value.sinks.length || sinkIds.size !== value.lowestSinkCount
      || routeIds.size !== value.routes.length) {
    throw fixedError("provider_route_registry_invalid");
  }
  for (const sink of value.sinks) {
    if (!sink?.sinkId || !sink?.sourcePath || !sink?.symbol
        || ![ACTIVE_STATUS, RETIRED_STATUS].includes(sink?.legacyStatus)) {
      throw fixedError("provider_route_registry_invalid");
    }
  }
  for (const route of value.routes) {
    const lowestSinks = asSinkList(route?.lowestSink);
    if (!route?.routeId || !route?.providerClass || !route?.phase
        || !Array.isArray(route?.exportedEntrypoints) || route.exportedEntrypoints.length === 0
        || lowestSinks.length === 0 || lowestSinks.some((sinkId) => !sinkIds.has(sinkId))
        || !route?.transportKind || !route?.allowedHostPolicy || !route?.cacheReadinessRole
        || !route?.capabilityScopeFields
        || ![ACTIVE_STATUS, RETIRED_STATUS].includes(route?.legacyStatus)) {
      throw fixedError("provider_route_registry_invalid");
    }
  }
  return { value, digest: createHash("sha256").update(bytes).digest("hex") };
}

function assertScopeInput(options, settings = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw fixedError("provider_execution_scope_invalid");
  }
  for (const field of ["routeId", "sinkId", "phase", "root"]) {
    if (typeof options[field] !== "string" || options[field].length === 0) {
      throw fixedError("provider_execution_scope_invalid");
    }
  }
  if (!Object.hasOwn(options, "requestPayload")) {
    throw fixedError("provider_execution_scope_invalid");
  }
  if (settings.consume && typeof options.fetchImpl !== "function") {
    throw fixedError("provider_execution_scope_invalid");
  }
}

function digestRequest(value) {
  let canonical;
  try { canonical = canonicalJson(value); } catch {
    throw fixedError("provider_physical_request_identity_invalid");
  }
  if (typeof canonical !== "string") throw fixedError("provider_physical_request_identity_invalid");
  return sha256(canonical);
}

function asSinkList(value) {
  return Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
}

function isDigest(value) {
  return /^[a-f0-9]{64}$/u.test(String(value ?? ""));
}

function fixedError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
