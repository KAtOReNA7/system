import { canonicalJson, sha256 } from "../../src/domain/m2V2EvidencePilot/pilotCore.js";

const ENTRY_KEYS = ["entryDigest", "profileId", "projection", "projectionDigest", "projectionSchemaVersion", "rawResponsePersisted", "receipt", "responseMetadata", "schema"];
const ROOT_KEYS = Object.freeze({
  "capability_e0_ok/v0.3": ["status"],
  "capability_e1_minimal/v0.3": ["ok"],
  "capability_e2_entity/v0.3": ["entityResolution", "limitations", "schemaVersion"],
  "capability_e3_claims/v0.3": ["claims", "contradictions", "limitations", "schemaVersion"],
  "extraction_full/v0.3": ["claims", "contradictions", "entityResolution", "limitations", "schemaVersion"],
  "no_replay/v0.3": ["reasonCode"],
});
const LIMITS = Object.freeze({
  "capability_e0_ok/v0.3": [1, 1, 0, 8, 64],
  "capability_e1_minimal/v0.3": [1, 1, 0, 0, 64],
  "capability_e2_entity/v0.3": [4, 40, 32, 500, 16_384],
  "capability_e3_claims/v0.3": [5, 600, 500, 500, 65_536],
  "extraction_full/v0.3": [5, 700, 600, 500, 65_536],
  "no_replay/v0.3": [1, 1, 0, 64, 128],
});
const FORBIDDEN = /^(?:authorization|cookie|setcookie|apikey|password|secret|token|headers?|requestheaders?|responseheaders?|raw|rawbody|rawbytes|rawrequest|rawresponse|rawrequestbytes|rawresponsebytes|debug|debugpayload|trace|tracepayload|providerrequestid)$/iu;

export function independentlyVerifyB3SafeCacheEntry(entry) {
  const issues = [];
  if (!plain(entry) || !sameKeys(entry, ENTRY_KEYS)) issues.push("secondary_entry_keys_invalid");
  const rootKeys = ROOT_KEYS[entry?.profileId];
  if (!rootKeys) issues.push("secondary_profile_invalid");
  if (entry?.projectionSchemaVersion !== "m2.v2.safe-cache-projection.v0.3") issues.push("secondary_schema_version_invalid");
  if (rootKeys && (!plain(entry.projection) || !sameKeys(entry.projection, rootKeys))) issues.push("secondary_projection_keys_invalid");
  const metrics = { depth: 0, keys: 0, items: 0, maxFieldBytes: 0 };
  if (plain(entry?.projection)) inspect(entry.projection, 0, metrics, issues);
  const [maxDepth, maxKeys, maxItems, maxFieldBytes, maxSerializedBytes] = LIMITS[entry?.profileId] ?? [0, 0, 0, 0, 0];
  if (metrics.depth > maxDepth || metrics.keys > maxKeys || metrics.items > maxItems || metrics.maxFieldBytes > maxFieldBytes
    || Buffer.byteLength(canonicalJson(entry?.projection), "utf8") > maxSerializedBytes) issues.push("secondary_projection_budget_exceeded");
  const projectionDigest = sha256({ profileId: entry?.profileId, schemaVersion: entry?.projectionSchemaVersion, projection: entry?.projection });
  if (entry?.projectionDigest !== projectionDigest) issues.push("secondary_projection_digest_invalid");
  const { entryDigest, ...payload } = entry ?? {};
  if (entryDigest !== sha256(payload)) issues.push("secondary_entry_digest_invalid");
  return { valid: issues.length === 0, issues: [...new Set(issues)], metrics, projectionDigest };
}

function inspect(value, depth, metrics, issues, key = null) {
  metrics.depth = Math.max(metrics.depth, depth);
  if (typeof key === "string" && FORBIDDEN.test(key.replace(/[-_]/gu, ""))) issues.push("secondary_forbidden_semantic_class");
  if (typeof value === "string") metrics.maxFieldBytes = Math.max(metrics.maxFieldBytes, Buffer.byteLength(value, "utf8"));
  if (Array.isArray(value)) {
    metrics.items += value.length;
    value.forEach((item) => inspect(item, depth + 1, metrics, issues));
  } else if (plain(value)) {
    const keys = Object.keys(value);
    metrics.keys += keys.length;
    for (const childKey of keys) inspect(value[childKey], depth + 1, metrics, issues, childKey);
  }
}

function sameKeys(value, expected) { return canonicalJson(Object.keys(value).sort()) === canonicalJson([...expected].sort()); }
function plain(value) { return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
