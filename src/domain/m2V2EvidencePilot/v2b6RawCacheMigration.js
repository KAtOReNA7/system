import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { canonicalJson, sha256 } from "./pilotCore.js";
import { SAFE_CACHE_PROFILE_IDS } from "./safeCacheProjection.js";
import { buildV2B6SafeCacheEntry, newV2B6SafeCache, validateV2B6SafeCache, validateV2B6SafeCacheEntry } from "./v2b6SafeCache.js";

export const V2B6_V02_CACHE_RELATIVE = "data/private-output/m2-v2-evidence-pilot/v2-b6-extraction-remediation/v2b6-request-cache-private-v0.2.json";
export const V2B6_CACHE_V03_CANDIDATE_SCHEMA = "m2.v2.v2b6-cache-v0.3-migration-candidate.v0.1";
export const V2B6_CACHE_V03_MANIFEST_SCHEMA = "m2.v2.v2b6-cache-v0.3-candidate-manifest.v0.1";
const V02_CACHE_SCHEMA = "m2.v2.v2b6-request-cache.v0.2";
const V02_ENTRY_SCHEMA = "m2.v2.v2b6-request-cache-entry.v0.2";
const OLD_ENTRY_KEYS = ["entryDigest", "rawResponsePersisted", "receipt", "responseMetadata", "safeReplay", "schema"];
const CANDIDATE_FILES = Object.freeze({ cache: "v2b6-request-cache-private-v0.3.json", manifest: "manifest-private-v0.1.json", receipt: "receipt-private-v0.1.json" });

/** Historical current-state promotion is retired. B3 permits candidate output only. */
export function migrateV2B6RawCache() {
  throw fixedError("v2b6_historical_current_promotion_retired");
}

export function buildV2B6CacheV03Candidate(sourceInput, options = {}) {
  const rows = sourceRows(sourceInput, options.sourceRows);
  const sourceIds = unique(rows.map((row) => row.rowId)).sort();
  const duplicateIds = duplicates(rows.map((row) => row.rowId));
  const migrated = [];
  const quarantined = [];
  const rejected = [];
  const candidate = newV2B6SafeCache();

  for (const rowId of sourceIds) {
    const row = rows.find((item) => item.rowId === rowId);
    if (!/^[a-f0-9]{64}$/u.test(rowId) || duplicateIds.includes(rowId)) {
      rejected.push(resultRow(rowId, "source_identity_invalid"));
      continue;
    }
    try {
      const entry = migrateEntry(row.entry);
      candidate.entries[rowId] = entry;
      migrated.push(resultRow(rowId, entry.schema === row.entry?.schema ? "already_v0.3_valid" : "projected_v0.2_to_v0.3"));
    } catch (error) {
      const reasonCode = String(error?.code ?? error?.message ?? "migration_row_invalid").split(":")[0];
      if (isIntegrityRejection(reasonCode)) rejected.push(resultRow(rowId, reasonCode));
      else quarantined.push(resultRow(rowId, reasonCode));
    }
  }

  if (options.injectMissingSourceRowId) {
    delete candidate.entries[options.injectMissingSourceRowId];
    removeResult(migrated, options.injectMissingSourceRowId);
  }
  if (options.injectUnexpectedGeneratedRowId) {
    candidate.entries[options.injectUnexpectedGeneratedRowId] = Object.values(candidate.entries)[0] ?? null;
  }

  candidate.entries = sortObject(candidate.entries);
  const classification = {
    sourceRowIds: sourceIds,
    migratedRowIds: migrated.map((row) => row.rowId).sort(),
    quarantinedRowIds: quarantined.map((row) => row.rowId).sort(),
    rejectedRowIds: rejected.map((row) => row.rowId).sort(),
    duplicateIds,
    missingIds: [],
    unexpectedIds: [],
  };
  const generatedIds = Object.keys(candidate.entries).sort();
  classification.missingIds = classification.migratedRowIds.filter((id) => !generatedIds.includes(id));
  classification.unexpectedIds = generatedIds.filter((id) => !classification.migratedRowIds.includes(id));
  assertExactPartition(classification);
  const validation = validateV2B6SafeCache(candidate);
  if (!validation.valid) throw fixedError(`cache_candidate_invalid:${validation.issues.join(",")}`);

  const sourceDigest = sha256(sourceInput);
  const candidateBytes = bytes(candidate);
  const targetDigest = sha256(candidateBytes);
  const manifest = {
    schema: V2B6_CACHE_V03_MANIFEST_SCHEMA,
    sourceSchema: sourceInput?.schema ?? "row-array",
    targetSchema: candidate.schema,
    sourceDigest,
    targetDigest,
    profileSchemaVersion: "m2.v2.safe-cache-projection.v0.3",
    classification,
    results: [...migrated, ...quarantined, ...rejected].sort((left, right) => compareText(left.rowId, right.rowId)),
    providerRequestDelta: 0,
    currentPromotionPerformed: false,
  };
  const manifestBytes = bytes(manifest);
  const receiptPayload = {
    schema: V2B6_CACHE_V03_CANDIDATE_SCHEMA,
    status: quarantined.length || rejected.length ? "CANDIDATE_READY_WITH_EXACT_QUARANTINE" : "CANDIDATE_READY",
    sourceDigest,
    targetDigest,
    manifestDigest: sha256(manifestBytes),
    sourceCount: sourceIds.length,
    migratedCount: migrated.length,
    quarantinedCount: quarantined.length,
    rejectedCount: rejected.length,
    duplicateCount: duplicateIds.length,
    missingCount: 0,
    unexpectedCount: 0,
    providerCalls: 0,
    providerRequestDelta: 0,
    databaseConnections: 0,
    currentPromotionPerformed: false,
  };
  const receipt = { ...receiptPayload, receiptDigest: sha256(receiptPayload) };
  return Object.freeze({ candidate, candidateBytes, manifest, manifestBytes, receipt, receiptBytes: bytes(receipt) });
}

export function verifyV2B6CacheV03CandidateDeterminism(sourceInput, options = {}) {
  const first = buildV2B6CacheV03Candidate(sourceInput, options);
  const second = buildV2B6CacheV03Candidate(sourceInput, options);
  const identical = first.candidateBytes.equals(second.candidateBytes)
    && first.manifestBytes.equals(second.manifestBytes)
    && first.receiptBytes.equals(second.receiptBytes);
  if (!identical) throw fixedError("cache_candidate_not_deterministic");
  return {
    schema: "m2.v2.v2b6-cache-v0.3-idempotence.v0.1",
    status: "VERIFIED_IDENTICAL_CANDIDATE",
    candidateDigest: sha256(first.candidateBytes),
    manifestDigest: sha256(first.manifestBytes),
    receiptDigest: sha256(first.receiptBytes),
    providerRequestDelta: 0,
    currentPromotionPerformed: false,
  };
}

export function writeV2B6CacheV03Candidate(rootInput, options = {}) {
  const root = resolve(rootInput);
  const sourcePath = governedPath(root, options.sourceRelativePath ?? V2B6_V02_CACHE_RELATIVE);
  const outputPath = candidateOutputPath(root, options.outputRelativePath);
  assertRegularFile(root, sourcePath);
  const source = JSON.parse(readFileSync(sourcePath, "utf8"));
  const built = buildV2B6CacheV03Candidate(source);
  const expected = { [CANDIDATE_FILES.cache]: built.candidateBytes, [CANDIDATE_FILES.manifest]: built.manifestBytes, [CANDIDATE_FILES.receipt]: built.receiptBytes };
  if (existsSync(outputPath)) {
    for (const [name, value] of Object.entries(expected)) {
      const path = join(outputPath, name);
      if (!existsSync(path) || !readFileSync(path).equals(value)) throw fixedError("cache_candidate_path_collision");
    }
    return { ...built.receipt, writeStatus: "VERIFIED_IDENTICAL_CANDIDATE", outputRelativePath: relativePath(root, outputPath) };
  }
  const temporary = `${outputPath}.candidate-${built.receipt.receiptDigest.slice(0, 16)}`;
  if (existsSync(temporary)) throw fixedError("cache_candidate_path_collision");
  mkdirSync(temporary, { recursive: false });
  try {
    for (const [name, value] of Object.entries(expected)) durableWriteNew(join(temporary, name), value);
    renameSync(temporary, outputPath);
  } catch (error) {
    if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
  return { ...built.receipt, writeStatus: "CANDIDATE_WRITTEN", outputRelativePath: relativePath(root, outputPath) };
}

function sourceRows(source, providedRows) {
  if (Array.isArray(providedRows)) return providedRows.map((row) => ({ rowId: String(row.rowId), entry: structuredClone(row.entry) }));
  if (!source || ![V02_CACHE_SCHEMA, "m2.v2.v2b6-request-cache.v0.3"].includes(source.schema)
    || source.privateOnly !== true || source.rawResponsePersisted !== false || !plain(source.entries)) throw fixedError("cache_candidate_source_invalid");
  return Object.entries(source.entries).sort(([left], [right]) => compareText(left, right)).map(([rowId, entry]) => ({ rowId, entry }));
}

function migrateEntry(entry) {
  if (entry?.schema === "m2.v2.v2b6-request-cache-entry.v0.3") {
    const validation = validateV2B6SafeCacheEntry(entry);
    if (!validation.valid) throw fixedError(`cache_candidate_v03_entry_invalid:${validation.issues.join(",")}`);
    return structuredClone(entry);
  }
  validateV02Entry(entry);
  const kind = entry.safeReplay?.kind;
  let json;
  let profileId = profileForV02Entry(entry);
  if (kind === "structured_value") json = { output_parsed: entry.safeReplay.value };
  else if (kind === "capability_ok") json = { output: [{ type: "message", content: [{ type: "output_text", text: "OK" }] }] };
  else if (kind === "no_replay_value" && entry.safeReplay.value === null) { json = { status: "no_structured_value" }; profileId = SAFE_CACHE_PROFILE_IDS.NO_REPLAY; }
  else throw fixedError("cache_candidate_safe_replay_kind_invalid");
  return buildV2B6SafeCacheEntry({ ...entry.responseMetadata, json }, entry.receipt, { profileId });
}

function validateV02Entry(entry) {
  if (!plain(entry) || canonicalJson(Object.keys(entry).sort()) !== canonicalJson([...OLD_ENTRY_KEYS])
    || entry.schema !== V02_ENTRY_SCHEMA || entry.rawResponsePersisted !== false || !plain(entry.responseMetadata)
    || !plain(entry.safeReplay) || !plain(entry.receipt)) throw fixedError("cache_candidate_v02_entry_invalid");
  const { entryDigest, ...payload } = entry;
  if (entryDigest !== sha256(payload)) throw fixedError("cache_candidate_source_digest_mismatch");
}

function profileForV02Entry(entry) {
  if (entry.safeReplay?.kind === "capability_ok") return SAFE_CACHE_PROFILE_IDS.CAPABILITY_E0;
  const testId = entry.receipt?.testId;
  if (testId === "E1") return SAFE_CACHE_PROFILE_IDS.CAPABILITY_E1;
  if (testId === "E2") return SAFE_CACHE_PROFILE_IDS.CAPABILITY_E2;
  if (testId === "E3") return SAFE_CACHE_PROFILE_IDS.CAPABILITY_E3;
  if (testId === "E4" || entry.receipt?.phase === "benchmark") return SAFE_CACHE_PROFILE_IDS.EXTRACTION_FULL;
  return null;
}

function assertExactPartition(value) {
  const sets = [value.migratedRowIds, value.quarantinedRowIds, value.rejectedRowIds];
  const union = unique(sets.flat()).sort();
  const overlaps = sets.some((left, index) => sets.slice(index + 1).some((right) => left.some((id) => right.includes(id))));
  if (overlaps || canonicalJson(union) !== canonicalJson(value.sourceRowIds)
    || value.missingIds.length || value.unexpectedIds.length) throw fixedError("cache_candidate_exact_set_mismatch");
}

function candidateOutputPath(root, relativeValue) {
  const normalized = String(relativeValue ?? "").replace(/\\/gu, "/");
  if (!normalized.includes("/b3-cache-v0.3-candidate") || normalized.includes("/m2-v2-evidence-pilot/v2-b6-extraction-remediation/")
    || normalized.endsWith("current") || normalized.includes("/current/")) throw fixedError("cache_candidate_output_scope_invalid");
  return governedPath(root, normalized);
}

function governedPath(root, relativeValue) {
  const normalized = String(relativeValue ?? "").replace(/\\/gu, "/");
  if (!normalized.startsWith("data/private-output/") || normalized.startsWith("/") || /^[A-Za-z]:/u.test(normalized)
    || normalized.split("/").some((part) => !part || part === "." || part === "..")) throw fixedError("cache_candidate_path_invalid");
  const absolute = resolve(root, ...normalized.split("/"));
  if (!absolute.startsWith(`${root.replace(/[\\/]+$/u, "")}${sep}`)) throw fixedError("cache_candidate_path_escape");
  return absolute;
}

function assertRegularFile(root, path) {
  if (!path.startsWith(`${root.replace(/[\\/]+$/u, "")}${sep}`) || !existsSync(path) || !lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw fixedError("cache_candidate_source_not_regular_file");
}

function durableWriteNew(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const handle = openSync(path, "wx", 0o600);
  try { writeFileSync(handle, value); fsyncSync(handle); } finally { closeSync(handle); }
}

function bytes(value) { return Buffer.from(`${canonicalJson(value)}\n`, "utf8"); }
function resultRow(rowId, reasonCode) { return { rowId, reasonCode }; }
function removeResult(rows, rowId) { const index = rows.findIndex((row) => row.rowId === rowId); if (index >= 0) rows.splice(index, 1); }
function isIntegrityRejection(code) { return ["cache_candidate_source_digest_mismatch", "cache_candidate_v02_entry_invalid", "cache_candidate_v03_entry_invalid", "source_identity_invalid"].some((prefix) => code.startsWith(prefix)); }
function duplicates(values) { return unique(values.filter((value, index) => values.indexOf(value) !== index)).sort(); }
function unique(values) { return [...new Set(values)]; }
function sortObject(value) { return Object.fromEntries(Object.entries(value).sort(([left], [right]) => compareText(left, right))); }
function plain(value) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function compareText(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function relativePath(root, path) { return relative(root, path).replace(/\\/gu, "/"); }
function fixedError(code) { const error = new Error(code); error.code = code.split(":")[0]; return error; }
