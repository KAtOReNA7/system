import { canonicalJson, sha256 } from "./pilotCore.js";

export const V2B5_SOURCE_RECORD_SCHEMA = "m2.v2.evidence-source-record.v0.2";
export const V2B5_SOURCE_RECORD_ADAPTER_VERSION = "m2-v2-source-record-adapter-v0.2";

export const V2B5_SOURCE_RECORD_FIELDS = Object.freeze([
  "schema",
  "sourceId",
  "queryId",
  "title",
  "url",
  "domain",
  "snippet",
  "providerScore",
  "searchProvider",
  "providerRequestId",
  "capturedAt",
  "availableAt",
  "availableAtBasis",
  "eventTime",
  "sourceTypeCandidate",
  "providerReceiptRef",
  "researchOnly",
  "modelEligible",
]);

export const V2B5_SOURCE_TYPE_CANDIDATES = Object.freeze([
  "publisher_or_official_candidate",
  "original_platform_candidate",
  "public_media_candidate",
  "community_or_catalog_candidate",
  "search_index_candidate",
  "mixed",
  "unknown_public_web",
]);

const SAFE_TRACKING_PARAMETERS = new Set([
  "_ga",
  "dclid",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "msclkid",
]);

export const V2B5_SHORTENER_DOMAINS = Object.freeze([
  "1url.com",
  "bit.do",
  "bit.ly",
  "buff.ly",
  "cutt.ly",
  "goo.gl",
  "is.gd",
  "ow.ly",
  "rebrand.ly",
  "shorturl.at",
  "t.co",
  "tiny.cc",
  "tinyurl.com",
  "url.cn",
  "url.ie",
  "v.gd",
]);

export function canonicalizeV2B5SourceUrl(value) {
  try {
    const url = new URL(String(value ?? "").trim());
    if (url.protocol !== "https:" || url.username || url.password) return null;
    url.hash = "";
    url.hostname = url.hostname.toLocaleLowerCase("en-US");
    if (url.port === "443") url.port = "";

    const retained = [];
    for (const [key, parameterValue] of url.searchParams.entries()) {
      const normalizedKey = key.toLocaleLowerCase("en-US");
      if (normalizedKey.startsWith("utm_") || SAFE_TRACKING_PARAMETERS.has(normalizedKey)) continue;
      retained.push([key, parameterValue]);
    }
    retained.sort(([leftKey, leftValue], [rightKey, rightValue]) => (
      leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue)
    ));
    url.search = "";
    for (const [key, parameterValue] of retained) url.searchParams.append(key, parameterValue);
    return url.toString();
  } catch {
    return null;
  }
}

export function isV2B5ShortenerDomain(domain) {
  const normalized = String(domain ?? "").trim().toLocaleLowerCase("en-US");
  return V2B5_SHORTENER_DOMAINS.some((candidate) => (
    normalized === candidate || normalized.endsWith(`.${candidate}`)
  ));
}

export function sourceIdForV2B5Url(value) {
  const canonicalUrl = canonicalizeV2B5SourceUrl(value);
  if (!canonicalUrl) throw new Error("v2b5_source_url_not_canonical_https");
  return `src_${sha256(canonicalUrl).slice(0, 32)}`;
}

export function normalizeTavilyResultToV2B5SourceRecord(result, context = {}) {
  const url = canonicalizeV2B5SourceUrl(result?.url);
  const capturedAt = canonicalTimestamp(context.capturedAt);
  const queryId = cleanText(context.queryId, 160);
  const title = cleanText(result?.title, 300);
  const snippet = cleanSnippet(result?.content);
  const providerScore = finiteNonnegative(result?.score);
  const providerReceiptRef = normalizeProviderReceiptRef(context.providerReceiptRef ?? context.receiptDigest);
  if (!url || isV2B5ShortenerDomain(new URL(url).hostname)) throw new Error("v2b5_tavily_result_url_invalid");
  if (!queryId || !title || !snippet || providerScore === null || !capturedAt || !providerReceiptRef) {
    throw new Error("v2b5_tavily_result_required_field_missing");
  }
  const sourceTypeCandidate = normalizeSourceTypeCandidate(
    context.sourceTypeCandidate ?? inferSourceTypeCandidate(url, title),
  );
  const sourceRecord = {
    schema: V2B5_SOURCE_RECORD_SCHEMA,
    sourceId: sourceIdForV2B5Url(url),
    queryId,
    title,
    url,
    domain: new URL(url).hostname.toLocaleLowerCase("en-US"),
    snippet,
    providerScore,
    searchProvider: "tavily_structured_search",
    providerRequestId: cleanNullableText(context.providerRequestId, 240),
    capturedAt,
    availableAt: capturedAt,
    availableAtBasis: "first_observed_by_system",
    eventTime: null,
    sourceTypeCandidate,
    providerReceiptRef,
    researchOnly: true,
    modelEligible: false,
  };
  const validation = validateV2B5SourceRecord(sourceRecord);
  if (!validation.valid) throw new Error(`v2b5_tavily_source_record_invalid:${validation.issues.join(",")}`);
  return sourceRecord;
}

export function adaptV2B3SourceRecordToV2B5(record, context = {}) {
  const url = canonicalizeV2B5SourceUrl(record?.url);
  const capturedAt = canonicalTimestamp(record?.capturedAt);
  const queryId = cleanText(context.queryId, 160);
  const receiptDigest = record?.providerReceipt?.receiptDigest;
  const providerReceiptRef = normalizeProviderReceiptRef(context.providerReceiptRef ?? receiptDigest);
  const title = cleanText(record?.title, 300);
  const snippet = cleanSnippet(record?.snippet);
  if (!url || isV2B5ShortenerDomain(new URL(url).hostname)) throw new Error("v2b5_legacy_source_url_invalid");
  if (!capturedAt || !queryId || !providerReceiptRef || !title || !snippet) {
    throw new Error("v2b5_legacy_source_required_field_missing");
  }
  const sourceRecord = {
    schema: V2B5_SOURCE_RECORD_SCHEMA,
    sourceId: sourceIdForV2B5Url(url),
    queryId,
    title,
    url,
    domain: new URL(url).hostname.toLocaleLowerCase("en-US"),
    snippet,
    providerScore: null,
    searchProvider: cleanText(context.searchProvider ?? record?.providerReceipt?.providerId, 120) || "legacy_annotation_adapter",
    providerRequestId: cleanNullableText(record?.providerReceipt?.responseId, 240),
    capturedAt,
    availableAt: capturedAt,
    availableAtBasis: "first_observed_by_system",
    eventTime: null,
    sourceTypeCandidate: normalizeSourceTypeCandidate(context.sourceTypeCandidate ?? "unknown_public_web"),
    providerReceiptRef,
    researchOnly: true,
    modelEligible: false,
  };
  const validation = validateV2B5SourceRecord(sourceRecord);
  if (!validation.valid) throw new Error(`v2b5_legacy_source_record_invalid:${validation.issues.join(",")}`);
  return sourceRecord;
}

export function validateV2B5SourceRecord(value) {
  const issues = [];
  if (!isObject(value)) return { valid: false, issues: ["source_record_not_object"] };
  exactKeys(value, V2B5_SOURCE_RECORD_FIELDS, "source_record", issues);
  if (value.schema !== V2B5_SOURCE_RECORD_SCHEMA) issues.push("source_record_schema_invalid");
  const canonicalUrl = canonicalizeV2B5SourceUrl(value.url);
  if (!canonicalUrl || canonicalUrl !== value.url) issues.push("source_url_not_canonical_https");
  if (canonicalUrl && isV2B5ShortenerDomain(new URL(canonicalUrl).hostname)) issues.push("source_url_shortener_prohibited");
  if (typeof value.sourceId !== "string" || !/^src_[a-f0-9]{32}$/u.test(value.sourceId)) issues.push("source_id_invalid");
  if (canonicalUrl && value.sourceId !== sourceIdForV2B5Url(canonicalUrl)) issues.push("source_id_url_mismatch");
  const expectedDomain = canonicalUrl ? new URL(canonicalUrl).hostname.toLocaleLowerCase("en-US") : null;
  if (!expectedDomain || value.domain !== expectedDomain) issues.push("source_domain_invalid");
  if (!cleanText(value.queryId, 160) || cleanText(value.queryId, 160) !== value.queryId) issues.push("source_query_id_invalid");
  if (!cleanText(value.title, 300) || cleanText(value.title, 300) !== value.title) issues.push("source_title_invalid");
  if (!cleanSnippet(value.snippet) || cleanSnippet(value.snippet) !== value.snippet) issues.push("source_snippet_invalid");
  if (value.providerScore !== null && finiteNonnegative(value.providerScore) === null) issues.push("source_provider_score_invalid");
  if (!cleanText(value.searchProvider, 120) || cleanText(value.searchProvider, 120) !== value.searchProvider) issues.push("source_search_provider_invalid");
  if (value.providerRequestId !== null && cleanNullableText(value.providerRequestId, 240) !== value.providerRequestId) issues.push("source_provider_request_id_invalid");
  if (!canonicalTimestamp(value.capturedAt) || canonicalTimestamp(value.capturedAt) !== value.capturedAt) issues.push("source_captured_at_invalid");
  if (!canonicalTimestamp(value.availableAt) || canonicalTimestamp(value.availableAt) !== value.availableAt) issues.push("source_available_at_invalid");
  if (value.availableAt !== value.capturedAt) issues.push("source_available_at_not_first_observed");
  if (value.availableAtBasis !== "first_observed_by_system") issues.push("source_available_at_basis_invalid");
  if (value.eventTime !== null) issues.push("source_event_time_must_be_null_before_extraction");
  if (!V2B5_SOURCE_TYPE_CANDIDATES.includes(value.sourceTypeCandidate)) issues.push("source_type_candidate_invalid");
  if (!/^sha256:[a-f0-9]{64}$/u.test(value.providerReceiptRef ?? "")) issues.push("source_provider_receipt_ref_invalid");
  if (value.researchOnly !== true) issues.push("source_research_only_must_be_true");
  if (value.modelEligible !== false) issues.push("source_model_eligible_must_be_false");
  return { valid: issues.length === 0, issues: unique(issues) };
}

export function mergeAndLimitV2B5SourceRecords(records, maximum = 6) {
  const limit = Number(maximum);
  if (!Number.isInteger(limit) || limit < 1 || limit > 6) throw new Error("v2b5_source_record_limit_invalid");
  const candidates = Array.isArray(records) ? records : [];
  for (const record of candidates) {
    const validation = validateV2B5SourceRecord(record);
    if (!validation.valid) throw new Error(`v2b5_source_record_merge_input_invalid:${validation.issues.join(",")}`);
  }
  const sorted = [...candidates].sort((left, right) => (
    compareNullableScoreDescending(left.providerScore, right.providerScore)
      || left.queryId.localeCompare(right.queryId)
      || left.sourceId.localeCompare(right.sourceId)
  ));
  const bySourceId = new Map();
  for (const record of sorted) if (!bySourceId.has(record.sourceId)) bySourceId.set(record.sourceId, structuredClone(record));
  return [...bySourceId.values()]
    .sort((left, right) => (
      compareNullableScoreDescending(left.providerScore, right.providerScore)
        || left.sourceId.localeCompare(right.sourceId)
    ))
    .slice(0, limit);
}

export function digestV2B5SourceRecordSet(records) {
  const normalized = mergeAndLimitV2B5SourceRecords(records, Math.min(6, Math.max(1, records?.length ?? 0)));
  return sha256(normalized);
}

export function buildV2B5SourceRecordSet(records) {
  const normalized = records?.length ? mergeAndLimitV2B5SourceRecords(records, Math.min(6, records.length)) : [];
  return {
    schema: "m2.v2.source-record-set.v0.2",
    sourceRecordSchema: V2B5_SOURCE_RECORD_SCHEMA,
    sourceRecordCount: normalized.length,
    sourceRecords: normalized,
    sourceRecordSetDigest: sha256(normalized),
  };
}

export function cleanV2B5Snippet(value) {
  return cleanSnippet(value);
}

function inferSourceTypeCandidate(url, title) {
  const hostname = new URL(url).hostname.toLocaleLowerCase("en-US");
  const text = `${hostname} ${title}`.toLocaleLowerCase("zh-CN");
  if (/出版社|出版|press|publisher/u.test(text)) return "publisher_or_official_candidate";
  if (/起点|晋江|纵横|番茄|webnovel|novel|read/u.test(text)) return "original_platform_candidate";
  if (/news|日报|周刊|媒体|报/u.test(text)) return "public_media_candidate";
  if (/豆瓣|百科|catalog|book|书城/u.test(text)) return "community_or_catalog_candidate";
  return "search_index_candidate";
}

function normalizeSourceTypeCandidate(value) {
  const candidate = cleanText(value, 120);
  return V2B5_SOURCE_TYPE_CANDIDATES.includes(candidate) ? candidate : "unknown_public_web";
}

function normalizeProviderReceiptRef(value) {
  const text = cleanText(value, 80).replace(/^sha256:/u, "");
  return /^[a-f0-9]{64}$/u.test(text) ? `sha256:${text}` : null;
}

function cleanSnippet(value) {
  if (typeof value !== "string") return "";
  const withoutControls = value
    .normalize("NFKC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return [...withoutControls].slice(0, 500).join("");
}

function cleanText(value, limit) {
  if (typeof value !== "string") return "";
  return [...value.normalize("NFKC").replace(/\s+/gu, " ").trim()].slice(0, limit).join("");
}

function cleanNullableText(value, limit) {
  if (value === null || value === undefined || value === "") return null;
  return cleanText(value, limit) || null;
}

function finiteNonnegative(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function canonicalTimestamp(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  const timestamp = new Date(value).toISOString();
  return timestamp === value ? timestamp : null;
}

function exactKeys(value, expected, prefix, issues) {
  if (!isObject(value)) return;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (canonicalJson(actual) !== canonicalJson(wanted)) issues.push(`${prefix}_keys_invalid`);
}

function compareNullableScoreDescending(left, right) {
  const leftScore = Number.isFinite(left) ? left : -1;
  const rightScore = Number.isFinite(right) ? right : -1;
  return rightScore - leftScore;
}

function unique(values) {
  return [...new Set(values)];
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
