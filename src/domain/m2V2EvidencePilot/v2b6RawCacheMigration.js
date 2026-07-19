import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";

import { canonicalJson, sha256 } from "./pilotCore.js";
import { parseV2B6StructuredResponse } from "./relayExtractionAdapterV2B6.js";

export const V2B6_LEGACY_CACHE_RELATIVE = "data/private-output/m2-v2-evidence-pilot/v2-b6-extraction-remediation/v2b6-request-cache-private-v0.1.json";
export const V2B6_SAFE_CACHE_RELATIVE = "data/private-output/m2-v2-evidence-pilot/v2-b6-extraction-remediation/v2b6-request-cache-private-v0.2.json";
export const V2B6_RAW_CACHE_QUARANTINE_RELATIVE = "data/private-output/m2-v2-pr7-p1-remediation/raw-cache-quarantine/v2b6-request-cache-private-v0.1.json";
export const V2B6_RAW_CACHE_RECEIPT_RELATIVE = "data/private-output/m2-v2-pr7-p1-remediation/raw-cache-quarantine-private-v0.1.json";

const SYNTHETIC_PREFIX = "m2-v2-raw-cache-migration-";
const PRIVATE_VALUE_KEYS = new Set(["author", "authors", "query", "queryText", "snippet", "title", "work", "works"]);
const HEADER_KEYS = new Set(["authorization", "headers", "requestHeaders", "responseHeaders"]);
const KEY_KEYS = new Set(["apiKey", "key", "password", "secret", "token"]);
const SECRET_PATTERN = /(?:\bBearer\s+[A-Za-z0-9._~+/=-]{12,}|\bsk-[A-Za-z0-9_-]{16,}\b|\btvly-[A-Za-z0-9_-]{12,}\b|(?:api[_-]?key|password|secret)\s*[:=]\s*[^\s,;]{8,})/iu;

/**
 * Offline, rollback-capable migration for the historical v0.1 B6 cache. The
 * legacy bytes are moved verbatim into an ignored read-only quarantine; the
 * current path receives only independently validated v0.2 safe projections.
 */
export function migrateV2B6RawCache(rootInput, options = {}) {
  const root = resolve(rootInput);
  if (options.faultAt) assertSyntheticRoot(root);
  const legacyPath = governedPath(root, options.legacyRelativePath ?? V2B6_LEGACY_CACHE_RELATIVE);
  const safePath = governedPath(root, options.safeRelativePath ?? V2B6_SAFE_CACHE_RELATIVE);
  const quarantinePath = governedPath(root, options.quarantineRelativePath ?? V2B6_RAW_CACHE_QUARANTINE_RELATIVE);
  const receiptPath = governedPath(root, options.receiptRelativePath ?? V2B6_RAW_CACHE_RECEIPT_RELATIVE);
  if (options.skipGitBoundary !== true) assertPrivateGitBoundary(root, [legacyPath, safePath, quarantinePath, receiptPath]);
  else assertSyntheticRoot(root);

  if (!existsSync(legacyPath)) {
    if (!existsSync(safePath) || !existsSync(quarantinePath) || !existsSync(receiptPath)) {
      throw new Error("v2b6_raw_cache_migration_incomplete");
    }
    const cache = readJson(safePath);
    const validation = validateHistoricalV02Cache(cache);
    if (!validation.valid) throw new Error(`v2b6_safe_cache_invalid:${validation.issues.join(",")}`);
    const receipt = readJson(receiptPath);
    if (receipt.oldDigest !== sha256File(quarantinePath)
      || receipt.newDigest !== sha256File(safePath)
      || receipt.legacyMutableCacheCountAfter !== 0
      || receipt.rawResponseCurrentCacheCountAfter !== 0) {
      throw new Error("v2b6_raw_cache_migration_receipt_invalid");
    }
    return { ...receipt, status: "ALREADY_MIGRATED_NOOP", wroteCurrentState: false };
  }
  if (existsSync(safePath) || existsSync(quarantinePath) || existsSync(receiptPath)) {
    throw new Error("v2b6_raw_cache_migration_destination_conflict");
  }
  assertRegularFile(root, legacyPath);
  const legacyBytes = readFileSync(legacyPath);
  const legacy = parseLegacyCache(legacyBytes);
  const safeCache = buildSafeCache(legacy);
  const validation = validateHistoricalV02Cache(safeCache);
  if (!validation.valid) throw new Error(`v2b6_safe_cache_invalid:${validation.issues.join(",")}`);
  const safeBytes = jsonBytes(safeCache);
  const classification = classifyLegacyCache(legacy);
  const oldDigest = sha256Buffer(legacyBytes);
  const newDigest = sha256Buffer(safeBytes);
  const transactionId = `v2b6-cache-${oldDigest.slice(0, 24)}-${newDigest.slice(0, 24)}`;
  const safeCandidate = `${safePath}.${transactionId}.candidate`;
  const receiptCandidate = `${receiptPath}.${transactionId}.candidate`;
  const rollbackCandidate = `${legacyPath}.${transactionId}.rollback`;
  mkdirSync(dirname(safePath), { recursive: true });
  mkdirSync(dirname(quarantinePath), { recursive: true });
  mkdirSync(dirname(receiptPath), { recursive: true });

  const receiptPayload = {
    schema: "m2.v2.v2b6-raw-cache-quarantine-receipt-private.v0.1",
    privateOnly: true,
    status: "MIGRATED",
    transactionId,
    sourceRelativePath: relativePath(root, legacyPath),
    quarantineRelativePath: relativePath(root, quarantinePath),
    currentSafeCacheRelativePath: relativePath(root, safePath),
    legacyEntryCount: Object.keys(legacy.entries).length,
    currentSafeEntryCount: Object.keys(safeCache.entries).length,
    legacyRawResponsePersisted: true,
    legacyProviderJsonEntryCount: classification.providerJsonEntryCount,
    legacySensitiveClassification: classification,
    oldDigest,
    newDigest,
    legacyMutableCacheCountBefore: 1,
    legacyMutableCacheCountAfter: 0,
    rawResponseCurrentCacheCountBefore: classification.providerJsonEntryCount,
    rawResponseCurrentCacheCountAfter: 0,
    providerRequestDelta: 0,
    evidenceQueriesExecuted: 0,
    full160Authorized: false,
  };
  const receipt = { ...receiptPayload, receiptDigest: sha256Buffer(Buffer.from(JSON.stringify(receiptPayload), "utf8")) };
  durableWriteNew(safeCandidate, safeBytes);
  durableWriteNew(receiptCandidate, jsonBytes(receipt));
  let quarantined = false;
  let safePromoted = false;
  try {
    injectFault(options, "quarantine_before");
    renameSync(legacyPath, quarantinePath);
    quarantined = true;
    injectFault(options, "quarantine_after");
    renameSync(safeCandidate, safePath);
    safePromoted = true;
    injectFault(options, "safe_promote_after");
    if (sha256File(quarantinePath) !== oldDigest || sha256File(safePath) !== newDigest) {
      throw new Error("v2b6_raw_cache_post_promotion_digest_mismatch");
    }
    const currentValidation = validateHistoricalV02Cache(readJson(safePath));
    if (!currentValidation.valid) throw new Error("v2b6_raw_cache_post_promotion_validation_failed");
    markReadOnly(quarantinePath);
    injectFault(options, "receipt_before");
    renameSync(receiptCandidate, receiptPath);
    return { ...receipt, wroteCurrentState: true, quarantineReadOnly: isReadOnly(quarantinePath) };
  } catch (error) {
    if (safePromoted && existsSync(safePath)) renameSync(safePath, safeCandidate);
    if (quarantined && existsSync(quarantinePath)) {
      clearReadOnly(quarantinePath);
      renameSync(quarantinePath, rollbackCandidate);
      renameSync(rollbackCandidate, legacyPath);
    }
    throw new Error(`v2b6_raw_cache_migration_rolled_back:${safeCode(error)}`);
  } finally {
    for (const path of [safeCandidate, receiptCandidate, rollbackCandidate]) {
      if (existsSync(path)) rmSync(path, { force: true });
    }
  }
}

export function buildSafeV2B6CacheFromLegacy(legacyInput) {
  return buildSafeCache(normalizeLegacyObject(legacyInput));
}

export function classifyLegacyV2B6Cache(legacyInput) {
  return classifyLegacyCache(normalizeLegacyObject(legacyInput));
}

function buildSafeCache(legacy) {
  const cache = { schema: "m2.v2.v2b6-request-cache.v0.2", privateOnly: true, rawResponsePersisted: false, entries: {} };
  for (const [key, entry] of Object.entries(legacy.entries).sort(([left], [right]) => left.localeCompare(right))) {
    if (!/^[a-f0-9]{64}$/u.test(key)) throw new Error("v2b6_legacy_cache_key_invalid");
    cache.entries[key] = buildHistoricalV02Entry(entry.response, entry.receipt);
  }
  return cache;
}

// Historical v0.1 -> v0.2 compatibility is retained only until B3-B retires
// this promotion route. Provider readiness treats every v0.2 current cache as
// unsafe; no B3 authority is issued from this representation.
function buildHistoricalV02Entry(response, receipt) {
  const parsed = parseV2B6StructuredResponse(response?.json);
  const safeReplay = parsed.value
    ? { kind: "structured_value", value: structuredClone(parsed.value) }
    : { kind: "no_replay_value", value: null };
  const payload = {
    schema: "m2.v2.v2b6-request-cache-entry.v0.2",
    rawResponsePersisted: false,
    responseMetadata: {
      requestStartedAt: response?.requestStartedAt ?? null,
      responseReceivedAt: response?.responseReceivedAt ?? null,
      latencyMs: response?.latencyMs ?? null,
      timeoutMs: response?.timeoutMs ?? null,
      timedOut: response?.timedOut === true,
      httpStatus: response?.httpStatus ?? null,
      httpOk: response?.httpOk === true,
      status: response?.status ?? null,
      contentTypeClass: response?.contentTypeClass ?? null,
      responseDigest: response?.responseDigest ?? null,
      responseByteLength: response?.responseByteLength ?? null,
    },
    safeReplay,
    receipt: structuredClone(receipt),
  };
  return { ...payload, entryDigest: sha256(payload) };
}

function validateHistoricalV02Cache(cache) {
  const issues = [];
  const rootKeys = ["entries", "privateOnly", "rawResponsePersisted", "schema"];
  if (!cache || typeof cache !== "object" || Array.isArray(cache)
    || canonicalJson(Object.keys(cache).sort()) !== canonicalJson(rootKeys)
    || cache.schema !== "m2.v2.v2b6-request-cache.v0.2"
    || cache.privateOnly !== true || cache.rawResponsePersisted !== false
    || !cache.entries || typeof cache.entries !== "object" || Array.isArray(cache.entries)) {
    issues.push("historical_v02_cache_invalid");
  }
  for (const entry of Object.values(cache?.entries ?? {})) {
    if (entry?.schema !== "m2.v2.v2b6-request-cache-entry.v0.2" || entry?.rawResponsePersisted !== false) issues.push("historical_v02_entry_invalid");
    const { entryDigest, ...payload } = entry ?? {};
    if (entryDigest !== sha256(payload)) issues.push("historical_v02_entry_digest_invalid");
  }
  return { valid: issues.length === 0, issues };
}

function parseLegacyCache(bytes) {
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { throw new Error("v2b6_legacy_cache_unreadable"); }
  return normalizeLegacyObject(value);
}

function normalizeLegacyObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || value.schema !== "m2.v2.v2b6-request-cache.v0.1"
    || value.privateOnly !== true
    || !value.entries || typeof value.entries !== "object" || Array.isArray(value.entries)) {
    throw new Error("v2b6_legacy_cache_contract_invalid");
  }
  for (const entry of Object.values(value.entries)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)
      || !entry.response || typeof entry.response !== "object"
      || !entry.receipt || typeof entry.receipt !== "object") {
      throw new Error("v2b6_legacy_cache_entry_invalid");
    }
  }
  return structuredClone(value);
}

function classifyLegacyCache(legacy) {
  const totals = {
    providerJsonEntryCount: 0,
    privateValueKeyCount: 0,
    urlValueCount: 0,
    headerKeyCount: 0,
    credentialKeyCount: 0,
    secretLikeValueCount: 0,
  };
  for (const entry of Object.values(legacy.entries)) {
    if (Object.hasOwn(entry.response ?? {}, "json")) totals.providerJsonEntryCount += 1;
    walk(entry, [], (value, path) => {
      const key = String(path.at(-1) ?? "");
      if (PRIVATE_VALUE_KEYS.has(key)) totals.privateValueKeyCount += 1;
      if (HEADER_KEYS.has(key)) totals.headerKeyCount += 1;
      if (KEY_KEYS.has(key)) totals.credentialKeyCount += 1;
      if (typeof value === "string") {
        if (/https?:\/\//iu.test(value)) totals.urlValueCount += 1;
        if (SECRET_PATTERN.test(value)) totals.secretLikeValueCount += 1;
      }
    });
  }
  return totals;
}

function walk(value, path, visitor) {
  visitor(value, path);
  if (Array.isArray(value)) value.forEach((item, index) => walk(item, [...path, index], visitor));
  else if (value && typeof value === "object") Object.entries(value).forEach(([key, item]) => walk(item, [...path, key], visitor));
}

function assertPrivateGitBoundary(root, paths) {
  for (const path of paths) {
    const relative = relativePath(root, path);
    const ignored = spawnSync("git", ["-C", root, "check-ignore", "-q", "--no-index", "--", relative], { windowsHide: true });
    if (ignored.status !== 0) throw new Error("v2b6_raw_cache_path_not_ignored");
    const tracked = spawnSync("git", ["-C", root, "ls-files", "--error-unmatch", "--", relative], { windowsHide: true });
    if (tracked.status === 0) throw new Error("v2b6_raw_cache_path_tracked");
  }
}

function governedPath(root, relativeValue) {
  const normalized = String(relativeValue ?? "").replace(/\\/gu, "/");
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:/u.test(normalized)
    || normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("v2b6_raw_cache_path_invalid");
  }
  const absolute = resolve(root, ...normalized.split("/"));
  const prefix = `${root.replace(/[\\/]+$/u, "")}${sep}`;
  if (!absolute.startsWith(prefix)) throw new Error("v2b6_raw_cache_path_escape");
  return absolute;
}

function assertRegularFile(root, path) {
  const prefix = `${root.replace(/[\\/]+$/u, "")}${sep}`;
  if (!path.startsWith(prefix)) throw new Error("v2b6_raw_cache_path_escape");
  let cursor = path;
  while (cursor !== root) {
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error("v2b6_raw_cache_reparse_rejected");
    cursor = dirname(cursor);
  }
  if (!lstatSync(path).isFile()) throw new Error("v2b6_legacy_cache_not_file");
}

function durableWriteNew(path, bytes) {
  mkdirSync(dirname(path), { recursive: true });
  const handle = openSync(path, "wx", 0o600);
  try {
    writeFileSync(handle, bytes);
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
}

function markReadOnly(path) {
  chmodSync(path, 0o444);
  if (process.platform === "win32") spawnSync("attrib", ["+R", path], { windowsHide: true });
}

function clearReadOnly(path) {
  if (process.platform === "win32") spawnSync("attrib", ["-R", path], { windowsHide: true });
  chmodSync(path, 0o600);
}

function isReadOnly(path) {
  if (process.platform !== "win32") return (lstatSync(path).mode & 0o222) === 0;
  const result = spawnSync("attrib", [path], { encoding: "utf8", windowsHide: true });
  return result.status === 0 && /^\s*[^\r\n]*R/imu.test(result.stdout ?? "");
}

function injectFault(options, point) {
  if (options.faultAt === point) throw new Error(`synthetic_fault_${point}`);
}

function assertSyntheticRoot(root) {
  const prefix = `${resolve(tmpdir()).replace(/[\\/]+$/u, "")}${sep}`;
  if (!root.startsWith(prefix) || !basename(root).startsWith(SYNTHETIC_PREFIX)) {
    throw new Error("v2b6_raw_cache_fault_requires_synthetic_root");
  }
}

function relativePath(root, path) {
  return relative(root, path).replace(/\\/gu, "/");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256File(path) {
  return sha256Buffer(readFileSync(path));
}

function sha256Buffer(value) {
  return createHash("sha256").update(value).digest("hex");
}

function safeCode(error) {
  return String(error?.message ?? "migration_failed").replace(/[^A-Za-z0-9_.:-]/gu, "_").slice(0, 160);
}
