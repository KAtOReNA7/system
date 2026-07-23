import { types as utilTypes } from "node:util";
import { canonicalJson, sha256 } from "./pilotCore.js";
import { V2B5_CLAIM_TYPES, V2B5_EXTRACTION_OUTPUT_SCHEMA_VERSION } from "./extractionV2B5.js";
import { parseV2B6StructuredResponse } from "./relayExtractionAdapterV2B6.js";

export const SAFE_CACHE_PROJECTION_SCHEMA_VERSION = "m2.v2.safe-cache-projection.v0.3";

export const SAFE_CACHE_PROFILE_IDS = Object.freeze({
  CAPABILITY_E0: "capability_e0_ok/v0.3",
  CAPABILITY_E1: "capability_e1_minimal/v0.3",
  CAPABILITY_E2: "capability_e2_entity/v0.3",
  CAPABILITY_E3: "capability_e3_claims/v0.3",
  EXTRACTION_FULL: "extraction_full/v0.3",
  NO_REPLAY: "no_replay/v0.3",
});

const ENTITY_STATUSES = Object.freeze(["high", "medium", "low", "unresolved", "ambiguous"]);
const AUTHOR_STATUSES = Object.freeze([...ENTITY_STATUSES, "not_applicable"]);
const CONTRADICTION_STATUSES = Object.freeze(["none", "possible", "confirmed", "unresolved", "resolved"]);
const SOURCE_ID = /^src_[a-f0-9]{32}$/u;
const CLAIM_ID = /^clm_[A-Za-z0-9_-]{1,80}$/u;
const CONTRADICTION_ID = /^ctr_[A-Za-z0-9_-]{1,80}$/u;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const PROTOTYPE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const FORBIDDEN_NAMES = /^(?:authorization|cookie|setcookie|apikey|api[_-]?key|password|secret|token|headers?|requestheaders?|responseheaders?|raw|rawbody|rawbytes|rawrequest|rawresponse|rawrequestbytes|rawresponsebytes|debug|debugpayload|trace|tracepayload|providerrequestid)$/iu;
const SECRET_VALUE = /(?:\bBearer\s+[A-Za-z0-9._~+/=-]{12,}|\bsk-[A-Za-z0-9_-]{16,}\b|\btvly-[A-Za-z0-9_-]{12,}\b|(?:api[_-]?key|password|secret)\s*[:=]\s*[^\s,;]{8,})/iu;

const profile = (input) => Object.freeze({
  schemaVersion: SAFE_CACHE_PROJECTION_SCHEMA_VERSION,
  normalizationRules: ["unicode_nfkc", "canonical_object_key_order", "preserve_array_order", "no_truncation"],
  forbiddenSemanticClasses: ["credentials", "cookies", "headers", "raw_request", "raw_response", "debug", "trace", "unclassified_metadata"],
  ...input,
});

export const SAFE_CACHE_PROFILES = Object.freeze([
  profile({
    profileId: SAFE_CACHE_PROFILE_IDS.CAPABILITY_E0,
    allowedTopLevelKeys: ["status"], allowedNestedKeys: {}, requiredKeys: ["status"],
    scalarTypes: { status: "string:OK" }, arrayItemTypes: {},
    maxDepth: 1, maxStringBytes: 8, maxTotalStringBytes: 8, maxArrayItems: 0, maxObjectKeys: 1, maxSerializedBytes: 64,
  }),
  profile({
    profileId: SAFE_CACHE_PROFILE_IDS.CAPABILITY_E1,
    allowedTopLevelKeys: ["ok"], allowedNestedKeys: {}, requiredKeys: ["ok"],
    scalarTypes: { ok: "boolean:true" }, arrayItemTypes: {},
    maxDepth: 1, maxStringBytes: 0, maxTotalStringBytes: 0, maxArrayItems: 0, maxObjectKeys: 1, maxSerializedBytes: 64,
  }),
  profile({
    profileId: SAFE_CACHE_PROFILE_IDS.CAPABILITY_E2,
    allowedTopLevelKeys: ["entityResolution", "limitations", "schemaVersion"],
    allowedNestedKeys: { entityResolution: ["author", "work"], entity: ["confidence", "status", "supportingSourceIds"] },
    requiredKeys: ["schemaVersion", "entityResolution", "limitations"],
    scalarTypes: { schemaVersion: "string", status: "enum", confidence: "number" }, arrayItemTypes: { limitations: "string", supportingSourceIds: "string" },
    maxDepth: 4, maxStringBytes: 500, maxTotalStringBytes: 8_192, maxArrayItems: 32, maxObjectKeys: 40, maxSerializedBytes: 16_384,
  }),
  profile({
    profileId: SAFE_CACHE_PROFILE_IDS.CAPABILITY_E3,
    allowedTopLevelKeys: ["claims", "contradictions", "limitations", "schemaVersion"],
    allowedNestedKeys: { claim: ["claimId", "claimType", "confidence", "contradictionKey", "eventTime", "limitations", "structuredValue", "supportingSourceIds"], contradiction: ["claimIds", "contradictionKey", "reason", "status"], structuredValue: ["booleanValue", "dateValue", "numberValue", "textValue", "valueType"] },
    requiredKeys: ["schemaVersion", "claims", "contradictions", "limitations"],
    scalarTypes: { schemaVersion: "string", confidence: "number", eventTime: "string|null" }, arrayItemTypes: { claims: "object", contradictions: "object", limitations: "string" },
    maxDepth: 5, maxStringBytes: 500, maxTotalStringBytes: 65_536, maxArrayItems: 500, maxObjectKeys: 600, maxSerializedBytes: 65_536,
  }),
  profile({
    profileId: SAFE_CACHE_PROFILE_IDS.EXTRACTION_FULL,
    allowedTopLevelKeys: ["claims", "contradictions", "entityResolution", "limitations", "schemaVersion"],
    allowedNestedKeys: { entityResolution: ["author", "work"], entity: ["confidence", "status", "supportingSourceIds"], claim: ["claimId", "claimType", "confidence", "contradictionKey", "eventTime", "limitations", "structuredValue", "supportingSourceIds"], contradiction: ["claimIds", "contradictionKey", "reason", "status"], structuredValue: ["booleanValue", "dateValue", "numberValue", "textValue", "valueType"] },
    requiredKeys: ["schemaVersion", "entityResolution", "claims", "contradictions", "limitations"],
    scalarTypes: { schemaVersion: "string", status: "enum", confidence: "number", eventTime: "string|null" }, arrayItemTypes: { claims: "object", contradictions: "object", limitations: "string", supportingSourceIds: "string" },
    maxDepth: 5, maxStringBytes: 500, maxTotalStringBytes: 65_536, maxArrayItems: 600, maxObjectKeys: 700, maxSerializedBytes: 65_536,
  }),
  profile({
    profileId: SAFE_CACHE_PROFILE_IDS.NO_REPLAY,
    allowedTopLevelKeys: ["reasonCode"], allowedNestedKeys: {}, requiredKeys: ["reasonCode"],
    scalarTypes: { reasonCode: "string:structured_value_unavailable" }, arrayItemTypes: {},
    maxDepth: 1, maxStringBytes: 64, maxTotalStringBytes: 64, maxArrayItems: 0, maxObjectKeys: 1, maxSerializedBytes: 128,
  }),
]);

const PROFILE_BY_ID = new Map(SAFE_CACHE_PROFILES.map((item) => [item.profileId, item]));

export function safeCacheProfileInventory() {
  return SAFE_CACHE_PROFILES.map((item) => ({ ...item, schemaDigest: sha256(item) }));
}

export function projectSafeCacheResponse(json, requestedProfileId = null) {
  const carrier = snapshotOwnData(json, { maxDepth: 12, maxKeys: 2_048, maxArrayItems: 2_048, maxStringBytes: 2 * 1024 * 1024, maxSerializedBytes: 2 * 1024 * 1024 });
  rejectForbiddenSemantics(carrier);
  const parsed = parseV2B6StructuredResponse(carrier);
  const inferred = inferProfile(carrier, parsed.value);
  const profileId = requestedProfileId ?? inferred;
  if (!PROFILE_BY_ID.has(profileId)) throw projectionError("safe_projection_profile_unknown");
  if (requestedProfileId && requestedProfileId !== inferred) throw projectionError("safe_projection_profile_mismatch");
  const projection = normalizeProjection(buildProjection(profileId, parsed.value));
  const validation = validateSafeCacheProjection(profileId, projection);
  if (!validation.valid) throw projectionError(validation.issues[0]);
  return Object.freeze({
    profileId,
    schemaVersion: SAFE_CACHE_PROJECTION_SCHEMA_VERSION,
    projection,
    projectionDigest: sha256({ profileId, schemaVersion: SAFE_CACHE_PROJECTION_SCHEMA_VERSION, projection }),
  });
}

export function validateSafeCacheProjection(profileId, projection) {
  const issues = [];
  const descriptor = PROFILE_BY_ID.get(profileId);
  if (!descriptor) return { valid: false, issues: ["safe_projection_profile_unknown"] };
  let value;
  try {
    value = snapshotOwnData(projection, {
      maxDepth: descriptor.maxDepth,
      maxKeys: descriptor.maxObjectKeys,
      maxArrayItems: descriptor.maxArrayItems,
      maxStringBytes: descriptor.maxTotalStringBytes,
      maxSerializedBytes: descriptor.maxSerializedBytes,
    });
    rejectForbiddenSemantics(value);
    validateProfileShape(profileId, value, issues);
    enforceBudget(value, descriptor);
  } catch (error) {
    issues.push(error?.code ?? "safe_projection_invalid");
  }
  return { valid: issues.length === 0, issues: unique(issues) };
}

export function snapshotOwnData(value, limits = {}) {
  const state = { keys: 0, items: 0, stringBytes: 0 };
  const copy = ownData(value, 0, state, {
    maxDepth: limits.maxDepth ?? 8,
    maxKeys: limits.maxKeys ?? 1_024,
    maxArrayItems: limits.maxArrayItems ?? 1_024,
    maxStringBytes: limits.maxStringBytes ?? 1_048_576,
  });
  const serializedBytes = Buffer.byteLength(canonicalJson(copy), "utf8");
  if (serializedBytes > (limits.maxSerializedBytes ?? 1_048_576)) throw projectionError("safe_projection_budget_exceeded");
  return copy;
}

function ownData(value, depth, state, limits) {
  if (depth > limits.maxDepth) throw projectionError("safe_projection_budget_exceeded");
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw projectionError("safe_projection_scalar_invalid");
    return value;
  }
  if (typeof value === "string") {
    state.stringBytes += Buffer.byteLength(value, "utf8");
    if (state.stringBytes > limits.maxStringBytes) throw projectionError("safe_projection_budget_exceeded");
    return value;
  }
  if (typeof value !== "object" || utilTypes.isProxy(value)) throw projectionError("safe_projection_plain_data_required");
  if (Object.getOwnPropertySymbols(value).length) throw projectionError("safe_projection_symbol_key_forbidden");
  if (Array.isArray(value)) {
    state.items += value.length;
    if (state.items > limits.maxArrayItems) throw projectionError("safe_projection_budget_exceeded");
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (key === "length") continue;
      if (!/^\d+$/u.test(key) || descriptor.get || descriptor.set || !descriptor.enumerable) throw projectionError("safe_projection_plain_data_required");
    }
    return value.map((item) => ownData(item, depth + 1, state, limits));
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw projectionError("safe_projection_plain_data_required");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const output = {};
  for (const key of Object.keys(descriptors).sort()) {
    const descriptor = descriptors[key];
    state.keys += 1;
    if (state.keys > limits.maxKeys) throw projectionError("safe_projection_budget_exceeded");
    if (PROTOTYPE_KEYS.has(key)) throw projectionError("safe_projection_prototype_key_forbidden");
    if (descriptor.get || descriptor.set || !descriptor.enumerable) throw projectionError("safe_projection_plain_data_required");
    output[key] = ownData(descriptor.value, depth + 1, state, limits);
  }
  return output;
}

function inferProfile(carrier, value) {
  if (value === null) return exactOkCarrier(carrier) ? SAFE_CACHE_PROFILE_IDS.CAPABILITY_E0 : SAFE_CACHE_PROFILE_IDS.NO_REPLAY;
  if (!isPlainObject(value)) throw projectionError("safe_projection_plain_data_required");
  const keys = Object.keys(value).sort().join(",");
  if (keys === "ok") return SAFE_CACHE_PROFILE_IDS.CAPABILITY_E1;
  if (keys === "entityResolution,limitations,schemaVersion") return SAFE_CACHE_PROFILE_IDS.CAPABILITY_E2;
  if (keys === "claims,contradictions,limitations,schemaVersion") return SAFE_CACHE_PROFILE_IDS.CAPABILITY_E3;
  if (keys === "claims,contradictions,entityResolution,limitations,schemaVersion") return SAFE_CACHE_PROFILE_IDS.EXTRACTION_FULL;
  throw projectionError("safe_projection_unknown_field");
}

function buildProjection(profileId, value) {
  if (profileId === SAFE_CACHE_PROFILE_IDS.CAPABILITY_E0) return { status: "OK" };
  if (profileId === SAFE_CACHE_PROFILE_IDS.NO_REPLAY) return { reasonCode: "structured_value_unavailable" };
  return value;
}

function validateProfileShape(profileId, value, issues) {
  if (!isPlainObject(value)) { issues.push("safe_projection_not_object"); return; }
  if (profileId === SAFE_CACHE_PROFILE_IDS.CAPABILITY_E0) {
    exactKeys(value, ["status"], issues); if (value.status !== "OK") issues.push("safe_projection_scalar_invalid"); return;
  }
  if (profileId === SAFE_CACHE_PROFILE_IDS.CAPABILITY_E1) {
    exactKeys(value, ["ok"], issues); if (value.ok !== true) issues.push("safe_projection_scalar_invalid"); return;
  }
  if (profileId === SAFE_CACHE_PROFILE_IDS.NO_REPLAY) {
    exactKeys(value, ["reasonCode"], issues); if (value.reasonCode !== "structured_value_unavailable") issues.push("safe_projection_scalar_invalid"); return;
  }
  if (profileId === SAFE_CACHE_PROFILE_IDS.CAPABILITY_E2) validateEntityStage(value, issues);
  else if (profileId === SAFE_CACHE_PROFILE_IDS.CAPABILITY_E3) validateClaimsStage(value, issues);
  else validateFull(value, issues);
}

function validateEntityStage(value, issues) {
  exactKeys(value, ["schemaVersion", "entityResolution", "limitations"], issues);
  validateSchemaVersion(value, issues); validateEntityResolution(value.entityResolution, issues); validateLimitations(value.limitations, issues);
}

function validateClaimsStage(value, issues) {
  exactKeys(value, ["schemaVersion", "claims", "contradictions", "limitations"], issues);
  validateSchemaVersion(value, issues); validateClaims(value.claims, issues); validateContradictions(value.contradictions, value.claims, issues); validateLimitations(value.limitations, issues);
}

function validateFull(value, issues) {
  exactKeys(value, ["schemaVersion", "entityResolution", "claims", "contradictions", "limitations"], issues);
  validateSchemaVersion(value, issues); validateEntityResolution(value.entityResolution, issues); validateClaims(value.claims, issues); validateContradictions(value.contradictions, value.claims, issues); validateLimitations(value.limitations, issues);
}

function validateSchemaVersion(value, issues) {
  if (value.schemaVersion !== V2B5_EXTRACTION_OUTPUT_SCHEMA_VERSION) issues.push("safe_projection_profile_mismatch");
}

function validateEntityResolution(value, issues) {
  if (!isPlainObject(value)) { issues.push("safe_projection_nested_keys_invalid"); return; }
  exactKeys(value, ["work", "author"], issues);
  validateEntity(value.work, ENTITY_STATUSES, issues); validateEntity(value.author, AUTHOR_STATUSES, issues);
}

function validateEntity(value, statuses, issues) {
  if (!isPlainObject(value)) { issues.push("safe_projection_nested_keys_invalid"); return; }
  exactKeys(value, ["status", "confidence", "supportingSourceIds"], issues);
  if (!statuses.includes(value.status) || !finiteUnit(value.confidence)) issues.push("safe_projection_scalar_invalid");
  validateIds(value.supportingSourceIds, SOURCE_ID, ["high", "medium"].includes(value.status), issues);
}

function validateClaims(value, issues) {
  if (!Array.isArray(value) || value.length > 20) { issues.push("safe_projection_budget_exceeded"); return; }
  const ids = [];
  for (const claim of value) {
    if (!isPlainObject(claim)) { issues.push("safe_projection_nested_keys_invalid"); continue; }
    exactKeys(claim, ["claimId", "claimType", "structuredValue", "supportingSourceIds", "confidence", "eventTime", "contradictionKey", "limitations"], issues);
    if (!CLAIM_ID.test(claim.claimId ?? "") || !V2B5_CLAIM_TYPES.includes(claim.claimType) || !finiteUnit(claim.confidence)
      || claim.eventTime !== null && !ISO_TIME.test(claim.eventTime ?? "") || claim.contradictionKey !== null && !CONTRADICTION_ID.test(claim.contradictionKey ?? "")) issues.push("safe_projection_scalar_invalid");
    ids.push(claim.claimId); validateStructuredValue(claim.structuredValue, issues); validateIds(claim.supportingSourceIds, SOURCE_ID, true, issues); validateLimitations(claim.limitations, issues);
  }
  if (new Set(ids).size !== ids.length) issues.push("safe_projection_duplicate_semantic_alias");
}

function validateStructuredValue(value, issues) {
  if (!isPlainObject(value)) { issues.push("safe_projection_nested_keys_invalid"); return; }
  const keys = ["valueType", "textValue", "dateValue", "numberValue", "booleanValue"];
  exactKeys(value, keys, issues);
  const active = { text: "textValue", date: "dateValue", number: "numberValue", boolean: "booleanValue" }[value.valueType];
  if (!active) { issues.push("safe_projection_scalar_invalid"); return; }
  for (const key of keys.slice(1)) {
    const item = value[key];
    if (key !== active && item !== null) issues.push("safe_projection_scalar_invalid");
    if (key === active && ((key === "numberValue" && !Number.isFinite(item)) || (key === "booleanValue" && typeof item !== "boolean") || (["textValue", "dateValue"].includes(key) && !validText(item)))) issues.push("safe_projection_scalar_invalid");
  }
}

function validateContradictions(value, claims, issues) {
  if (!Array.isArray(value) || value.length > 20) { issues.push("safe_projection_budget_exceeded"); return; }
  const claimIds = new Set(Array.isArray(claims) ? claims.map((item) => item?.claimId) : []); const ids = [];
  for (const item of value) {
    if (!isPlainObject(item)) { issues.push("safe_projection_nested_keys_invalid"); continue; }
    exactKeys(item, ["contradictionKey", "claimIds", "status", "reason"], issues);
    if (!CONTRADICTION_ID.test(item.contradictionKey ?? "") || !CONTRADICTION_STATUSES.includes(item.status) || !validText(item.reason)) issues.push("safe_projection_scalar_invalid");
    validateIds(item.claimIds, CLAIM_ID, false, issues, claimIds); ids.push(item.contradictionKey);
  }
  if (new Set(ids).size !== ids.length) issues.push("safe_projection_duplicate_semantic_alias");
}

function validateLimitations(value, issues) {
  if (!Array.isArray(value) || value.length > 10 || value.some((item) => !validText(item))) issues.push("safe_projection_budget_exceeded");
}

function validateIds(value, pattern, requireOne, issues, allowed = null) {
  if (!Array.isArray(value) || requireOne && value.length === 0 || new Set(value).size !== value.length
    || value.some((item) => !pattern.test(item ?? "") || allowed && !allowed.has(item))) issues.push("safe_projection_scalar_invalid");
}

function enforceBudget(value, descriptor) {
  snapshotOwnData(value, { maxDepth: descriptor.maxDepth, maxKeys: descriptor.maxObjectKeys, maxArrayItems: descriptor.maxArrayItems, maxStringBytes: descriptor.maxTotalStringBytes, maxSerializedBytes: descriptor.maxSerializedBytes });
  walk(value, (item) => { if (typeof item === "string" && Buffer.byteLength(item, "utf8") > descriptor.maxStringBytes) throw projectionError("safe_projection_budget_exceeded"); });
}

function rejectForbiddenSemantics(value) {
  walk(value, (item, key) => {
    if (typeof key === "string" && FORBIDDEN_NAMES.test(key.replace(/[-_]/gu, ""))) throw projectionError("safe_projection_forbidden_content");
    if (typeof item === "string" && SECRET_VALUE.test(item)) throw projectionError("safe_projection_forbidden_content");
  });
}

function exactOkCarrier(value) {
  const roots = [value, value?.response, value?.data, value?.result].filter(isPlainObject);
  return roots.some((root) => {
    const texts = [root.output_text];
    for (const item of Array.isArray(root.output) ? root.output : []) for (const content of Array.isArray(item?.content) ? item.content : []) if (content?.type === "output_text") texts.push(content.text);
    return texts.some((text) => typeof text === "string" && /^OK[.!]?$/u.test(text.trim()));
  });
}

function normalizeProjection(value) {
  if (Array.isArray(value)) return value.map(normalizeProjection);
  if (isPlainObject(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalizeProjection(value[key])]));
  return typeof value === "string" ? value.normalize("NFKC") : value;
}

function exactKeys(value, expected, issues) {
  const actual = Object.keys(value).sort(); const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) issues.push(actual.some((key) => !wanted.includes(key)) ? "safe_projection_nested_keys_invalid" : "safe_projection_required_key_missing");
}

function walk(value, visitor, key = null) {
  visitor(value, key);
  if (Array.isArray(value)) value.forEach((item) => walk(item, visitor));
  else if (isPlainObject(value)) Object.entries(value).forEach(([childKey, item]) => walk(item, visitor, childKey));
}

function isPlainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null); }
function finiteUnit(value) { return Number.isFinite(value) && value >= 0 && value <= 1; }
function validText(value) { return typeof value === "string" && value.length > 0 && Buffer.byteLength(value, "utf8") <= 500 && value === value.normalize("NFKC"); }
function unique(value) { return [...new Set(value)]; }
function projectionError(code) { const error = new Error(code); error.code = code; return error; }
