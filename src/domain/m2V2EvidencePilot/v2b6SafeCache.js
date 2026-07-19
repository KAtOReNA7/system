import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { canonicalJson, sha256 } from "./pilotCore.js";
import {
  SAFE_CACHE_PROFILE_IDS,
  SAFE_CACHE_PROJECTION_SCHEMA_VERSION,
  projectSafeCacheResponse,
  snapshotOwnData,
  validateSafeCacheProjection,
} from "./safeCacheProjection.js";

export const V2B6_SAFE_CACHE_SCHEMA = "m2.v2.v2b6-request-cache.v0.3";
export const V2B6_SAFE_CACHE_ENTRY_SCHEMA = "m2.v2.v2b6-request-cache-entry.v0.3";

const ROOT_KEYS = Object.freeze(["entries", "privateOnly", "rawResponsePersisted", "schema"]);
const ENTRY_KEYS = Object.freeze(["entryDigest", "profileId", "projection", "projectionDigest", "projectionSchemaVersion", "rawResponsePersisted", "receipt", "responseMetadata", "schema"]);
const METADATA_KEYS = Object.freeze(["contentTypeClass", "httpOk", "httpStatus", "latencyMs", "requestStartedAt", "responseByteLength", "responseDigest", "responseReceivedAt", "status", "timedOut", "timeoutMs"]);
const RECEIPT_KEYS = Object.freeze(["apiKeyPersisted", "authorizationHeaderPersisted", "latencyMs", "modelBindingStatus", "rawResponsePersisted", "receiptDigest", "schema", "timedOut", "usage"]);
const USAGE_KEYS = Object.freeze(["inputTokens", "outputTokens", "totalTokens"]);

export function newV2B6SafeCache() {
  return { schema: V2B6_SAFE_CACHE_SCHEMA, privateOnly: true, rawResponsePersisted: false, entries: {} };
}

export function buildV2B6SafeCacheEntry(response, receipt, options = {}) {
  const projected = projectSafeCacheResponse(response?.json, options.profileId ?? null);
  const payload = {
    schema: V2B6_SAFE_CACHE_ENTRY_SCHEMA,
    rawResponsePersisted: false,
    profileId: projected.profileId,
    projectionSchemaVersion: projected.schemaVersion,
    projection: projected.projection,
    projectionDigest: projected.projectionDigest,
    responseMetadata: projectResponseMetadata(response),
    receipt: projectReceipt(receipt),
  };
  const entry = { ...payload, entryDigest: sha256(payload) };
  const validation = validateV2B6SafeCacheEntry(entry);
  if (!validation.valid) throw new Error(`v2b6_safe_cache_entry_invalid:${validation.issues.join(",")}`);
  return entry;
}

export function restoreV2B6SafeCacheEntry(entry) {
  const validation = validateV2B6SafeCacheEntry(entry);
  if (!validation.valid) throw new Error(`v2b6_safe_cache_entry_invalid:${validation.issues.join(",")}`);
  if (entry.profileId === SAFE_CACHE_PROFILE_IDS.NO_REPLAY) throw new Error("v2b6_safe_cache_entry_not_replayable");
  return {
    profileId: entry.profileId,
    projectionSchemaVersion: entry.projectionSchemaVersion,
    projectionDigest: entry.projectionDigest,
    projection: structuredClone(entry.projection),
    responseMetadata: structuredClone(entry.responseMetadata),
    receipt: structuredClone(entry.receipt),
    rawResponsePersisted: false,
  };
}

export function validateV2B6SafeCache(cache) {
  const issues = [];
  let value;
  try { value = snapshotOwnData(cache, { maxDepth: 8, maxKeys: 100_000, maxArrayItems: 100_000, maxStringBytes: 32 * 1024 * 1024, maxSerializedBytes: 64 * 1024 * 1024 }); }
  catch (error) { return { valid: false, issues: [error?.code ?? "cache_plain_data_invalid"] }; }
  if (!sameKeys(value, ROOT_KEYS)) issues.push("cache_root_keys_invalid");
  if (value.schema !== V2B6_SAFE_CACHE_SCHEMA) issues.push("cache_schema_invalid");
  if (value.privateOnly !== true || value.rawResponsePersisted !== false) issues.push("cache_safety_flags_invalid");
  if (!isPlainObject(value.entries)) issues.push("cache_entries_invalid");
  for (const [key, entry] of Object.entries(value.entries ?? {})) {
    if (!/^[a-f0-9]{64}$/u.test(key)) issues.push("cache_key_invalid");
    issues.push(...validateV2B6SafeCacheEntry(entry).issues.map((issue) => `entry:${key}:${issue}`));
  }
  return { valid: issues.length === 0, issues: unique(issues) };
}

export function validateV2B6SafeCacheEntry(entry) {
  const issues = [];
  let value;
  try { value = snapshotOwnData(entry, { maxDepth: 8, maxKeys: 2_000, maxArrayItems: 2_000, maxStringBytes: 512 * 1024, maxSerializedBytes: 512 * 1024 }); }
  catch (error) { return { valid: false, issues: [error?.code ?? "entry_plain_data_invalid"] }; }
  if (!sameKeys(value, ENTRY_KEYS)) issues.push("entry_keys_invalid");
  if (value.schema !== V2B6_SAFE_CACHE_ENTRY_SCHEMA || value.rawResponsePersisted !== false) issues.push("entry_schema_or_flag_invalid");
  if (value.projectionSchemaVersion !== SAFE_CACHE_PROJECTION_SCHEMA_VERSION) issues.push("entry_projection_schema_invalid");
  const projection = validateSafeCacheProjection(value.profileId, value.projection);
  issues.push(...projection.issues);
  const expectedProjectionDigest = sha256({ profileId: value.profileId, schemaVersion: value.projectionSchemaVersion, projection: value.projection });
  if (value.projectionDigest !== expectedProjectionDigest) issues.push("entry_projection_digest_invalid");
  validateResponseMetadata(value.responseMetadata, issues);
  validateReceipt(value.receipt, issues);
  const { entryDigest, ...payload } = value;
  if (!/^[a-f0-9]{64}$/u.test(entryDigest ?? "") || entryDigest !== sha256(payload)) issues.push("entry_digest_invalid");
  if (issues.some((issue) => ["entry_projection_digest_invalid", "entry_digest_invalid"].includes(issue))) issues.push("safe_cache_digest_invalid");
  return { valid: issues.length === 0, issues: unique(issues) };
}

/** Read the real current cache object without mutating or promoting it. */
export function inspectV2B6ProviderCacheReadiness(rootInput) {
  const root = resolve(rootInput);
  const directory = join(root, "data/private-output/m2-v2-evidence-pilot/v2-b6-extraction-remediation");
  const legacyPath = join(directory, "v2b6-request-cache-private-v0.1.json");
  const v02Path = join(directory, "v2b6-request-cache-private-v0.2.json");
  const safePath = join(directory, "v2b6-request-cache-private-v0.3.json");
  let validation = { valid: false, issues: ["safe_cache_missing"] };
  if (existsSync(safePath)) {
    try { validation = validateV2B6SafeCache(JSON.parse(readFileSync(safePath, "utf8"))); }
    catch { validation = { valid: false, issues: ["safe_cache_unreadable"] }; }
  }
  return {
    legacyMutableCacheCount: Number(existsSync(legacyPath)) + Number(existsSync(v02Path)),
    rawResponseCurrentCacheCount: validation.valid ? 0 : Math.max(1, validation.issues.length),
    safeCacheActualObjectVerified: validation.valid,
    safeCacheSchema: validation.valid ? V2B6_SAFE_CACHE_SCHEMA : null,
    safeCacheDigest: validation.valid ? sha256(JSON.parse(readFileSync(safePath, "utf8"))) : null,
    issueCodes: unique([
      ...(existsSync(v02Path) ? ["provider_current_cache_schema_not_safe"] : []),
      ...validation.issues.map((issue) => String(issue).split(":")[0]),
    ]),
  };
}

function projectResponseMetadata(response) {
  return {
    requestStartedAt: isoOrNull(response?.requestStartedAt), responseReceivedAt: isoOrNull(response?.responseReceivedAt),
    latencyMs: finiteOrNull(response?.latencyMs), timeoutMs: finiteOrNull(response?.timeoutMs), timedOut: response?.timedOut === true,
    httpStatus: finiteOrNull(response?.httpStatus), httpOk: response?.httpOk === true,
    status: safeToken(response?.status), contentTypeClass: safeToken(response?.contentTypeClass),
    responseDigest: digestOrNull(response?.responseDigest), responseByteLength: finiteOrNull(response?.responseByteLength),
  };
}

function projectReceipt(receipt) {
  const safe = snapshotOwnData(receipt, { maxDepth: 12, maxKeys: 2_048, maxArrayItems: 2_048, maxStringBytes: 2 * 1024 * 1024, maxSerializedBytes: 2 * 1024 * 1024 });
  return {
    schema: safeToken(safe.schema), receiptDigest: digestOrNull(safe.receiptDigest),
    modelBindingStatus: safeToken(safe.modelBindingStatus), timedOut: safe.timedOut === true,
    latencyMs: finiteOrNull(safe.latencyMs), usage: projectUsage(safe.usage),
    rawResponsePersisted: false, authorizationHeaderPersisted: false, apiKeyPersisted: false,
  };
}

function projectUsage(value) {
  return { inputTokens: finiteOrNull(value?.inputTokens), outputTokens: finiteOrNull(value?.outputTokens), totalTokens: finiteOrNull(value?.totalTokens) };
}

function validateResponseMetadata(value, issues) {
  if (!isPlainObject(value) || !sameKeys(value, METADATA_KEYS)) { issues.push("entry_response_metadata_invalid"); return; }
  if (![value.latencyMs, value.timeoutMs, value.httpStatus, value.responseByteLength].every(nullableFinite)
    || typeof value.timedOut !== "boolean" || typeof value.httpOk !== "boolean"
    || !nullableToken(value.status) || !nullableToken(value.contentTypeClass)
    || !nullableDigest(value.responseDigest) || !nullableIso(value.requestStartedAt) || !nullableIso(value.responseReceivedAt)) issues.push("entry_response_metadata_invalid");
}

function validateReceipt(value, issues) {
  if (!isPlainObject(value) || !sameKeys(value, RECEIPT_KEYS) || !isPlainObject(value.usage) || !sameKeys(value.usage, USAGE_KEYS)) { issues.push("entry_receipt_invalid"); return; }
  if (!nullableToken(value.schema) || !nullableDigest(value.receiptDigest) || !nullableToken(value.modelBindingStatus)
    || typeof value.timedOut !== "boolean" || !nullableFinite(value.latencyMs)
    || !Object.values(value.usage).every(nullableFinite)
    || value.rawResponsePersisted !== false || value.authorizationHeaderPersisted !== false || value.apiKeyPersisted !== false) issues.push("entry_receipt_invalid");
}

function sameKeys(value, expected) { return canonicalJson(Object.keys(value ?? {}).sort()) === canonicalJson([...expected]); }
function isPlainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null); }
function finiteOrNull(value) { if (value === null || value === undefined || value === "") return null; return Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null; }
function digestOrNull(value) { return /^[a-f0-9]{64}$/u.test(String(value ?? "")) ? String(value) : null; }
function safeToken(value) { const text = String(value ?? "").trim(); return /^[A-Za-z0-9._:/-]{1,120}$/u.test(text) ? text : null; }
function isoOrNull(value) { return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(String(value ?? "")) ? String(value) : null; }
function nullableFinite(value) { return value === null || Number.isFinite(value) && value >= 0; }
function nullableToken(value) { return value === null || typeof value === "string" && /^[A-Za-z0-9._:/-]{1,120}$/u.test(value); }
function nullableDigest(value) { return value === null || /^[a-f0-9]{64}$/u.test(value); }
function nullableIso(value) { return value === null || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value); }
function unique(values) { return [...new Set(values)]; }
