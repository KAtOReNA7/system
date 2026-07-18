import { canonicalJson, sha256 } from "./pilotCore.js";
import { parseV2B6StructuredResponse } from "./relayExtractionAdapterV2B6.js";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const V2B6_SAFE_CACHE_SCHEMA = "m2.v2.v2b6-request-cache.v0.2";
export const V2B6_SAFE_CACHE_ENTRY_SCHEMA = "m2.v2.v2b6-request-cache-entry.v0.2";

const ROOT_KEYS = Object.freeze(["entries", "privateOnly", "rawResponsePersisted", "schema"]);
const ENTRY_KEYS = Object.freeze(["entryDigest", "rawResponsePersisted", "receipt", "responseMetadata", "safeReplay", "schema"]);
const FORBIDDEN_KEYS = new Set(["json", "raw", "rawBody", "rawResponse", "rawResponseBody", "response", "responseBody"]);
const SECRET_PATTERN = /(?:\bBearer\s+[A-Za-z0-9._~+/=-]{12,}|\bsk-[A-Za-z0-9_-]{16,}\b|(?:api[_-]?key|password|secret)\s*[:=]\s*[^\s,;]{8,})/iu;

export function newV2B6SafeCache() {
  return { schema: V2B6_SAFE_CACHE_SCHEMA, privateOnly: true, rawResponsePersisted: false, entries: {} };
}

export function buildV2B6SafeCacheEntry(response, receipt) {
  const parsed = parseV2B6StructuredResponse(response?.json);
  const safeReplay = parsed.value
    ? { kind: "structured_value", value: structuredClone(parsed.value) }
    : exactOkCarrier(response?.json) ? { kind: "capability_ok", value: "OK" }
      : { kind: "no_replay_value", value: null };
  const responseMetadata = {
    requestStartedAt: response?.requestStartedAt ?? null,
    responseReceivedAt: response?.responseReceivedAt ?? null,
    latencyMs: finiteOrNull(response?.latencyMs),
    timeoutMs: finiteOrNull(response?.timeoutMs),
    timedOut: response?.timedOut === true,
    httpStatus: finiteOrNull(response?.httpStatus),
    httpOk: response?.httpOk === true,
    status: safeToken(response?.status),
    contentTypeClass: safeToken(response?.contentTypeClass),
    responseDigest: digestOrNull(response?.responseDigest),
    responseByteLength: finiteOrNull(response?.responseByteLength),
  };
  const payload = {
    schema: V2B6_SAFE_CACHE_ENTRY_SCHEMA,
    rawResponsePersisted: false,
    responseMetadata,
    safeReplay,
    receipt: structuredClone(receipt),
  };
  const entry = { ...payload, entryDigest: sha256(payload) };
  const validation = validateV2B6SafeCacheEntry(entry);
  if (!validation.valid) throw new Error(`v2b6_safe_cache_entry_invalid:${validation.issues.join(",")}`);
  return entry;
}

export function restoreV2B6SafeCacheEntry(entry) {
  const validation = validateV2B6SafeCacheEntry(entry);
  if (!validation.valid) throw new Error(`v2b6_safe_cache_entry_invalid:${validation.issues.join(",")}`);
  if (entry.safeReplay.kind === "no_replay_value") throw new Error("v2b6_safe_cache_entry_not_replayable");
  const json = entry.safeReplay.kind === "structured_value"
    ? { output_parsed: structuredClone(entry.safeReplay.value) }
    : { output: [{ type: "message", content: [{ type: "output_text", text: "OK" }] }] };
  return { response: { ...entry.responseMetadata, json, rawResponsePersisted: false }, receipt: structuredClone(entry.receipt) };
}

export function validateV2B6SafeCache(cache) {
  const issues = [];
  if (!cache || typeof cache !== "object" || Array.isArray(cache)) return { valid: false, issues: ["cache_not_object"] };
  if (canonicalJson(Object.keys(cache).sort()) !== canonicalJson([...ROOT_KEYS])) issues.push("cache_root_keys_invalid");
  if (cache.schema !== V2B6_SAFE_CACHE_SCHEMA) issues.push("cache_schema_invalid");
  if (cache.privateOnly !== true || cache.rawResponsePersisted !== false) issues.push("cache_safety_flags_invalid");
  if (!cache.entries || typeof cache.entries !== "object" || Array.isArray(cache.entries)) issues.push("cache_entries_invalid");
  for (const [key, entry] of Object.entries(cache.entries ?? {})) {
    if (!/^[a-f0-9]{64}$/u.test(key)) issues.push("cache_key_invalid");
    issues.push(...validateV2B6SafeCacheEntry(entry).issues.map((issue) => `entry:${key}:${issue}`));
  }
  issues.push(...scanForbiddenCacheContent(cache));
  return { valid: issues.length === 0, issues: unique(issues) };
}

export function validateV2B6SafeCacheEntry(entry) {
  const issues = [];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return { valid: false, issues: ["entry_not_object"] };
  if (canonicalJson(Object.keys(entry).sort()) !== canonicalJson([...ENTRY_KEYS])) issues.push("entry_keys_invalid");
  if (entry.schema !== V2B6_SAFE_CACHE_ENTRY_SCHEMA || entry.rawResponsePersisted !== false) issues.push("entry_schema_or_flag_invalid");
  if (!entry.responseMetadata || typeof entry.responseMetadata !== "object" || Array.isArray(entry.responseMetadata)) issues.push("entry_response_metadata_invalid");
  if (!entry.receipt || typeof entry.receipt !== "object" || entry.receipt.rawResponsePersisted !== false) issues.push("entry_receipt_invalid");
  if (!["structured_value", "capability_ok", "no_replay_value"].includes(entry.safeReplay?.kind)) issues.push("entry_safe_replay_kind_invalid");
  const { entryDigest, ...payload } = entry;
  if (!/^[a-f0-9]{64}$/u.test(entryDigest ?? "") || entryDigest !== sha256(payload)) issues.push("entry_digest_invalid");
  issues.push(...scanForbiddenCacheContent(entry));
  return { valid: issues.length === 0, issues: unique(issues) };
}

/** Read the real current B6 cache object and return only fail-closed counts. */
export function inspectV2B6ProviderCacheReadiness(rootInput) {
  const root = resolve(rootInput);
  const directory = join(root, "data/private-output/m2-v2-evidence-pilot/v2-b6-extraction-remediation");
  const legacyPath = join(directory, "v2b6-request-cache-private-v0.1.json");
  const safePath = join(directory, "v2b6-request-cache-private-v0.2.json");
  let cache = null;
  let validation = { valid: false, issues: ["safe_cache_missing"] };
  if (existsSync(safePath)) {
    try {
      cache = JSON.parse(readFileSync(safePath, "utf8"));
      validation = validateV2B6SafeCache(cache);
    } catch {
      validation = { valid: false, issues: ["safe_cache_unreadable"] };
    }
  }
  const rawIssues = validation.issues.filter((issue) => (
    /forbidden_key|secret_like|safety_flags|schema|keys_invalid|unreadable|missing/u.test(issue)
  ));
  return {
    legacyMutableCacheCount: existsSync(legacyPath) ? 1 : 0,
    rawResponseCurrentCacheCount: validation.valid ? 0 : Math.max(1, rawIssues.length),
    safeCacheActualObjectVerified: validation.valid,
    issueCodes: [...new Set(validation.issues.map((issue) => String(issue).split(":")[0]))],
  };
}

export function scanForbiddenCacheContent(value) {
  const issues = [];
  walk(value, [], (item, path) => {
    const key = path.at(-1);
    if (typeof key === "string" && FORBIDDEN_KEYS.has(key)) issues.push(`forbidden_key:${key}`);
    if (typeof item === "string" && SECRET_PATTERN.test(item)) issues.push("secret_like_value");
  });
  return unique(issues);
}

function exactOkCarrier(value) {
  const roots = [value, value?.response, value?.data, value?.result].filter((item) => item && typeof item === "object");
  return roots.some((root) => {
    const texts = [root.output_text];
    for (const item of Array.isArray(root.output) ? root.output : []) {
      for (const content of Array.isArray(item?.content) ? item.content : []) {
        if (content?.type === "output_text") texts.push(content.text);
      }
    }
    return texts.some((text) => typeof text === "string" && /^OK[.!]?$/u.test(text.trim()));
  });
}

function walk(value, path, visitor) {
  visitor(value, path);
  if (Array.isArray(value)) value.forEach((item, index) => walk(item, [...path, index], visitor));
  else if (value && typeof value === "object") Object.entries(value).forEach(([key, item]) => walk(item, [...path, key], visitor));
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function digestOrNull(value) {
  return /^[a-f0-9]{64}$/u.test(String(value ?? "")) ? String(value) : null;
}

function safeToken(value) {
  const text = String(value ?? "").trim();
  return /^[A-Za-z0-9._:-]{1,80}$/u.test(text) ? text : null;
}

function unique(values) {
  return [...new Set(values)];
}
