import { performance } from "node:perf_hooks";
import { canonicalJson, sha256 } from "./pilotCore.js";
import {
  assertNoProviderRedirect,
  bindProviderSearchTransport,
} from "./providerTransportSecurity.js";
import {
  V2B5_SOURCE_RECORD_ADAPTER_VERSION,
  V2B5_SOURCE_RECORD_SCHEMA,
  normalizeTavilyResultToV2B5SourceRecord,
} from "./sourceRecordV2B5.js";

export const V2B5_TAVILY_PROVIDER_ID = "tavily_structured_search";
export const V2B5_TAVILY_ADAPTER_VERSION = "m2-v2-tavily-search-adapter-v0.1";
export const V2B5_TAVILY_RECEIPT_SCHEMA = "m2.v2.tavily-provider-receipt.v0.1";
export const V2B5_TAVILY_DEFAULTS = Object.freeze({
  baseUrl: "https://api.tavily.com",
  approvedHost: "api.tavily.com",
  topic: "general",
  searchDepth: "basic",
  maxResults: 6,
  includeAnswer: false,
  includeRawContent: false,
  country: "china",
  autoParameters: false,
  projectId: "m2-v2-evidence-pilot",
  maxRequests: 40,
  timeoutMs: 30_000,
});

const RESPONSE_LIMIT_BYTES = 2 * 1024 * 1024;

export class TavilyStructuredSearchProviderV2B5 {
  constructor(options = {}) {
    this.provider = V2B5_TAVILY_PROVIDER_ID;
    this.providerVersion = V2B5_TAVILY_ADAPTER_VERSION;
    this.mode = "structured_search";
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? V2B5_TAVILY_DEFAULTS.baseUrl);
    this.apiKey = String(options.apiKey ?? "");
    this.topic = options.topic ?? V2B5_TAVILY_DEFAULTS.topic;
    this.searchDepth = options.searchDepth ?? V2B5_TAVILY_DEFAULTS.searchDepth;
    this.maxResults = boundedInteger(options.maxResults, V2B5_TAVILY_DEFAULTS.maxResults, 1, 6);
    this.country = options.country ?? V2B5_TAVILY_DEFAULTS.country;
    this.projectId = options.projectId ?? V2B5_TAVILY_DEFAULTS.projectId;
    this.timeoutMs = boundedInteger(options.timeoutMs, V2B5_TAVILY_DEFAULTS.timeoutMs, 1_000, 60_000);
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    if (!this.apiKey) throw new Error("v2b5_tavily_api_key_missing");
    if (this.baseUrl !== V2B5_TAVILY_DEFAULTS.baseUrl) throw new Error("v2b5_tavily_base_url_invalid");
    if (typeof this.fetchImpl !== "function") throw new Error("v2b5_tavily_fetch_unavailable");
    if (this.topic !== "general" || this.searchDepth !== "basic" || this.country !== "china") {
      throw new Error("v2b5_tavily_parameter_contract_invalid");
    }
  }

  capabilities() {
    return {
      provider: this.provider,
      providerVersion: this.providerVersion,
      mode: this.mode,
      structuredResults: true,
      answerUsed: false,
      rawContentUsed: false,
      browserUsed: false,
      recursiveRetrievalUsed: false,
      maxResults: this.maxResults,
    };
  }

  buildPayload(queryText, options = {}) {
    return buildV2B5TavilySearchPayload({
      query: queryText,
      topic: this.topic,
      searchDepth: this.searchDepth,
      maxResults: options.maxResults ?? this.maxResults,
      country: this.country,
      includeUsage: options.includeUsage === true,
    });
  }

  async search(input) {
    const queryId = cleanText(input?.queryId, 160);
    const queryText = cleanQuery(input?.queryText);
    if (!queryId || !queryText) throw new Error("v2b5_tavily_query_invalid");
    assertV2B5TavilyOutboundQuery(queryText);
    const payload = this.buildPayload(queryText, {
      includeUsage: input?.includeUsage === true,
      maxResults: input?.maxResults,
    });
    const response = await dispatchV2B5TavilyRequest({
      fetchImpl: this.fetchImpl,
      baseUrl: this.baseUrl,
      apiKey: this.apiKey,
      projectId: this.projectId,
      payload,
      timeoutMs: this.timeoutMs,
    });
    const normalized = normalizeV2B5TavilySearchResponse(response.json, {
      queryId,
      requestStartedAt: response.requestStartedAt,
      responseReceivedAt: response.responseReceivedAt,
      responseTimeMs: response.responseTimeMs,
      httpStatus: response.httpStatus,
      cacheKey: input.cacheKey,
      retryCount: input.retryCount ?? 0,
      errorCode: response.errorCode,
      responseContentTypeClass: response.contentTypeClass,
      providerRequestId: response.providerRequestId,
      providerResponseTime: response.providerResponseTime,
      usageCredits: response.usageCredits,
      sourceTypeCandidate: input.sourceTypeCandidate,
    });
    return {
      ...normalized,
      dispatched: response.dispatchAttempted !== false,
      includeUsageUnsupported: response.includeUsageUnsupported,
      transportStatus: response.status,
      transportFailureCategory: response.transportFailureCategory,
      dnsAttempted: response.dnsAttempted,
      dnsSuccess: response.dnsSuccess,
      tlsSuccess: response.tlsSuccess,
      responseDigest: response.responseDigest,
      responseByteLength: response.responseByteLength,
    };
  }
}

export function buildV2B5TavilySearchPayload(input) {
  const query = cleanQuery(input?.query);
  if (!query) throw new Error("v2b5_tavily_query_missing");
  assertV2B5TavilyOutboundQuery(query);
  const payload = {
    query,
    topic: input?.topic ?? "general",
    search_depth: input?.searchDepth ?? "basic",
    max_results: boundedInteger(input?.maxResults, 6, 1, 6),
    include_answer: false,
    include_raw_content: false,
    country: input?.country ?? "china",
    auto_parameters: false,
  };
  if (input?.includeUsage === true) payload.include_usage = true;
  return payload;
}

export function assertV2B5TavilyOutboundQuery(queryText) {
  const query = cleanQuery(queryText);
  if (!query) throw new Error("v2b5_tavily_query_empty");
  const prohibited = [
    /standard[_\s-]*work[_\s-]*id/iu,
    /raw[_\s-]*work[_\s-]*id/iu,
    /(?:收入|账单|revenue|forecast|B4)/iu,
    /(?:评级|rating|版权|合同|内部渠道|运营备注)/iu,
  ];
  if (prohibited.some((pattern) => pattern.test(query))) throw new Error("v2b5_tavily_query_private_field_detected");
  return true;
}

export function buildV2B5TavilyCacheDescriptor(input) {
  const descriptor = {
    provider: V2B5_TAVILY_PROVIDER_ID,
    baseUrl: normalizeBaseUrl(input?.baseUrl ?? V2B5_TAVILY_DEFAULTS.baseUrl),
    queryDigest: requireDigest(input?.queryDigest, "v2b5_tavily_query_digest_invalid"),
    searchDepth: input?.searchDepth ?? "basic",
    topic: input?.topic ?? "general",
    country: input?.country ?? "china",
    maxResults: boundedInteger(input?.maxResults, 6, 1, 6),
    includeUsage: input?.includeUsage === true,
    providerAdapterVersion: V2B5_TAVILY_ADAPTER_VERSION,
    sourceRecordAdapterVersion: V2B5_SOURCE_RECORD_ADAPTER_VERSION,
    sourceRecordSchemaVersion: V2B5_SOURCE_RECORD_SCHEMA,
    executionNamespace: cleanText(input?.executionNamespace, 200),
  };
  if (!descriptor.executionNamespace) throw new Error("v2b5_tavily_execution_namespace_missing");
  return { ...descriptor, cacheKey: sha256(descriptor) };
}

export function normalizeV2B5TavilySearchResponse(json, meta = {}) {
  const issues = [];
  const jsonObject = isObject(json);
  if (!jsonObject) issues.push("response_not_json_object");
  const rawResults = Array.isArray(json?.results) ? json.results : [];
  if (rawResults.length === 0) issues.push("results_empty_or_missing");
  const requestStartedAt = canonicalTimestamp(meta.requestStartedAt);
  const responseReceivedAt = canonicalTimestamp(meta.responseReceivedAt);
  if (!requestStartedAt || !responseReceivedAt) issues.push("request_time_invalid");
  if (requestStartedAt && responseReceivedAt && Date.parse(requestStartedAt) > Date.parse(responseReceivedAt)) issues.push("request_time_order_invalid");
  const receiptBase = {
    schema: V2B5_TAVILY_RECEIPT_SCHEMA,
    privateOnly: true,
    provider: V2B5_TAVILY_PROVIDER_ID,
    providerVersion: V2B5_TAVILY_ADAPTER_VERSION,
    requestId: cleanNullableText(meta.providerRequestId ?? json?.request_id, 240),
    queryId: cleanText(meta.queryId, 160),
    requestStartedAt,
    responseReceivedAt,
    responseTimeMs: finiteNonnegative(meta.responseTimeMs),
    providerResponseTime: finiteNonnegative(meta.providerResponseTime ?? json?.response_time),
    httpStatus: Number.isInteger(meta.httpStatus) ? meta.httpStatus : null,
    resultCount: rawResults.length,
    acceptedResultCount: 0,
    usageCredits: finiteNonnegative(meta.usageCredits ?? extractUsageCredits(json)),
    cacheKey: requireDigest(meta.cacheKey, "v2b5_tavily_cache_key_invalid"),
    retryCount: boundedInteger(meta.retryCount, 0, 0, 1),
    errorCode: safeToken(meta.errorCode),
    responseContentTypeClass: safeToken(meta.responseContentTypeClass),
    schemaVersion: V2B5_SOURCE_RECORD_SCHEMA,
    rawResponsePersisted: false,
    authorizationHeaderPersisted: false,
    apiKeyPersisted: false,
  };
  if (!receiptBase.queryId) issues.push("query_id_invalid");
  const preDigest = sha256(receiptBase);
  const sourceRecords = [];
  const candidateObservations = [];
  rawResults.forEach((result, index) => {
    const observation = buildCandidateObservation(result, {
      firstSeenAt: responseReceivedAt,
      sourceTypeCandidate: meta.sourceTypeCandidate,
    });
    if (observation) candidateObservations.push(observation);
    try {
      sourceRecords.push(normalizeTavilyResultToV2B5SourceRecord(result, {
        queryId: receiptBase.queryId,
        capturedAt: responseReceivedAt,
        providerRequestId: receiptBase.requestId,
        providerReceiptRef: preDigest,
        sourceTypeCandidate: meta.sourceTypeCandidate,
      }));
    } catch (error) {
      issues.push(`result_${index}:${safeToken(error?.message) ?? "invalid"}`);
    }
  });
  receiptBase.acceptedResultCount = sourceRecords.length;
  const receiptPayload = { ...receiptBase, validationIssues: unique(issues) };
  const providerReceipt = { ...receiptPayload, receiptDigest: sha256(receiptPayload) };
  const correctedSourceRecords = sourceRecords.map((record) => ({
    ...record,
    providerReceiptRef: `sha256:${providerReceipt.receiptDigest}`,
  }));
  const httpSuccess = Number.isInteger(receiptBase.httpStatus) && receiptBase.httpStatus >= 200 && receiptBase.httpStatus < 300;
  const contractValid = httpSuccess && jsonObject && rawResults.length > 0
    && correctedSourceRecords.length === rawResults.length && issues.length === 0;
  return {
    schema: "m2.v2.tavily-search-result.v0.1",
    provider: V2B5_TAVILY_PROVIDER_ID,
    providerVersion: V2B5_TAVILY_ADAPTER_VERSION,
    status: contractValid ? "success" : httpSuccess ? "contract_failure" : "provider_failure",
    providerConnectivityPassed: httpSuccess && jsonObject,
    contractValid,
    sourceRecords: correctedSourceRecords,
    sourceRecordCount: correctedSourceRecords.length,
    candidateObservations,
    providerReceipt: {
      ...providerReceipt,
      acceptedResultCount: correctedSourceRecords.length,
    },
    requestIdObserved: providerReceipt.requestId !== null,
    providerResponseTimeObserved: providerReceipt.providerResponseTime !== null,
    usageCreditsObserved: providerReceipt.usageCredits !== null,
    issues: unique(issues),
  };
}

function buildCandidateObservation(result, meta = {}) {
  if (!isObject(result) || typeof result.url !== "string") return null;
  let url;
  try { url = new URL(result.url); } catch { return null; }
  const domain = url.hostname.toLocaleLowerCase("en-US").replace(/^www\./u, "");
  if (!domain) return null;
  return {
    schema: "m2.v2.research-source-domain-observation.v0.1",
    privateOnly: true,
    domain,
    firstSeenAt: canonicalTimestamp(meta.firstSeenAt),
    searchProvider: V2B5_TAVILY_PROVIDER_ID,
    sourceTypeCandidate: ["publication", "web_original", "other"].includes(meta.sourceTypeCandidate)
      ? meta.sourceTypeCandidate : "other",
    publicHttpsObserved: url.protocol === "https:",
    resultCount: 1,
  };
}

export function classifyV2B5TavilyProviderDecision(result) {
  if (result?.dispatched === false) return "BLOCKED_EGRESS_PERMISSION";
  if (result?.contractValid === true && result?.sourceRecordCount > 0) return "READY";
  const status = result?.providerReceipt?.httpStatus;
  if ([401, 403].includes(status)) return "BLOCKED_AUTH";
  if (status === 429) return "BLOCKED_RATE_LIMIT";
  if (Number.isInteger(status) && status >= 400 && status < 500 && ![408, 429].includes(status)) return "BLOCKED_CONTRACT";
  if (Number.isInteger(status) && status >= 200 && status < 300) return "BLOCKED_CONTRACT";
  if (result?.transportFailureCategory === "dns") return "BLOCKED_DNS";
  if (result?.transportFailureCategory === "tls") return "BLOCKED_TLS";
  if (result?.providerConnectivityPassed !== true) return "BLOCKED_TRANSPORT";
  return "BLOCKED_CONTRACT";
}

export function validateV2B5TavilyCapabilityState(capability) {
  const decision = capability?.tavilyProviderDecision;
  const result = capability?.finalResult ?? {};
  const httpStatus = Number.isInteger(result.httpStatus)
    ? result.httpStatus : result.providerReceipt?.httpStatus ?? null;
  const issues = [];
  if (decision === "BLOCKED_EGRESS_PERMISSION" && result.dispatched !== false) issues.push("egress_dispatch_must_be_false");
  if (decision === "BLOCKED_DNS" && !(result.dnsAttempted === true && result.dnsSuccess === false)) issues.push("dns_attempt_or_result_invalid");
  if (decision === "BLOCKED_TLS" && !(result.dispatched === true && result.tlsSuccess === false)) issues.push("tls_dispatch_or_result_invalid");
  if (decision === "BLOCKED_TRANSPORT" && !(result.dispatched === true && httpStatus === null)) issues.push("transport_dispatch_or_http_status_invalid");
  if (decision === "BLOCKED_AUTH" && !(result.dispatched === true && [401, 403].includes(httpStatus))) issues.push("auth_dispatch_or_http_status_invalid");
  if (decision === "BLOCKED_RATE_LIMIT" && !(result.dispatched === true && httpStatus === 429)) issues.push("rate_limit_dispatch_or_http_status_invalid");
  if (decision === "BLOCKED_CONTRACT" && !(result.dispatched === true && result.httpSuccess === true && result.contractValid === false)) issues.push("contract_dispatch_or_result_invalid");
  if (decision === "READY" && !(result.dispatched === true && result.httpSuccess === true && result.contractValid === true)) issues.push("ready_dispatch_or_result_invalid");
  if (!["BLOCKED_EGRESS_PERMISSION", "BLOCKED_DNS", "BLOCKED_TLS", "BLOCKED_TRANSPORT", "BLOCKED_AUTH", "BLOCKED_RATE_LIMIT", "BLOCKED_CONTRACT", "READY"].includes(decision)) {
    issues.push("capability_state_unknown");
  }
  return { valid: issues.length === 0, issues };
}

export async function dispatchV2B5TavilyRequest(options) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("v2b5_tavily_fetch_unavailable");
  const transport = bindProviderSearchTransport({
    baseUrl: options.baseUrl,
    approvedHost: V2B5_TAVILY_DEFAULTS.approvedHost,
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
  const requestStartedAt = new Date().toISOString();
  const started = performance.now();
  let response = null;
  let bytes = Buffer.alloc(0);
  let json = null;
  let transportError = null;
  let transportFailureCategory = null;
  try {
    response = await fetchImpl(transport.endpointUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "m2-v2-v2b5-tavily-search/0.1",
        "X-Project-ID": options.projectId ?? "m2-v2-evidence-pilot",
      },
      body: JSON.stringify(options.payload),
      signal: controller.signal,
      redirect: transport.redirect,
    });
    assertNoProviderRedirect(response, transport.endpointUrl);
    bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length <= RESPONSE_LIMIT_BYTES) {
      try { json = JSON.parse(bytes.toString("utf8")); } catch { json = null; }
    }
  } catch (error) {
    transportError = safeToken(error?.code ?? error?.name ?? error?.message) ?? "transport_error";
    transportFailureCategory = classifyTransportFailure(error);
  } finally {
    clearTimeout(timeout);
  }
  const responseReceivedAt = new Date().toISOString();
  const contentTypeClass = classifyContentType(response?.headers?.get?.("content-type"));
  const errorText = safeErrorText(json);
  const includeUsageUnsupported = response?.status === 400
    && /include[_\s-]*usage/iu.test(errorText)
    && /(?:unsupported|unknown|extra|unexpected|not allowed|unrecognized)/iu.test(errorText);
  const status = transportError
    ? "transport_error"
    : !response?.ok
      ? "http_error"
      : bytes.length > RESPONSE_LIMIT_BYTES
        ? "response_oversize"
        : !json
          ? contentTypeClass === "html" ? "html_error" : "non_json_error"
          : "provider_response_received";
  return {
    json,
    requestStartedAt,
    responseReceivedAt,
    responseTimeMs: Math.round(performance.now() - started),
    httpStatus: response?.status ?? null,
    status,
    errorCode: transportError ?? (!response?.ok ? `http_${response?.status ?? "unknown"}` : status === "provider_response_received" ? null : status),
    contentTypeClass,
    responseDigest: bytes.length ? sha256(bytes.toString("base64")) : null,
    responseByteLength: bytes.length,
    providerRequestId: cleanNullableText(json?.request_id ?? response?.headers?.get?.("x-request-id"), 240),
    providerResponseTime: finiteNonnegative(json?.response_time),
    usageCredits: extractUsageCredits(json),
    includeUsageUnsupported,
    dispatchAttempted: transportFailureCategory !== "egress_permission",
    transportFailureCategory,
    dnsAttempted: transportFailureCategory !== "egress_permission",
    dnsSuccess: transportFailureCategory === "dns" ? false
      : transportFailureCategory === "egress_permission" ? null : true,
    tlsSuccess: transportFailureCategory === "tls" ? false
      : transportFailureCategory === "dns" || transportFailureCategory === "egress_permission" ? null : true,
    rawResponsePersisted: false,
  };
}

function classifyTransportFailure(error) {
  const code = String(error?.cause?.code ?? error?.code ?? "").toLocaleUpperCase("en-US");
  const name = String(error?.name ?? "").toLocaleUpperCase("en-US");
  if (["EACCES", "EPERM"].includes(code) || name === "SECURITYERROR") return "egress_permission";
  if (["ENOTFOUND", "EAI_AGAIN", "EAI_FAIL", "WSAHOST_NOT_FOUND"].includes(code)) return "dns";
  if (/(?:TLS|SSL|CERT|CERTIFICATE|UNABLE_TO_VERIFY|SELF_SIGNED)/u.test(code)
    || /(?:TLS|SSL|CERTIFICATE)/u.test(name)) return "tls";
  return "transport";
}

function extractUsageCredits(json) {
  const candidates = [json?.usage?.credits, json?.usage?.total_credits, json?.usage, json?.credits];
  return candidates.map(finiteNonnegative).find((value) => value !== null) ?? null;
}

function safeErrorText(json) {
  const value = json?.error?.message ?? json?.message ?? json?.detail ?? "";
  return typeof value === "string" ? value.slice(0, 1_000) : "";
}

function classifyContentType(value) {
  const type = String(value ?? "").split(";", 1)[0].trim().toLocaleLowerCase("en-US");
  if (type.includes("json")) return "json";
  if (type.includes("html")) return "html";
  return type ? "other" : "unavailable";
}

function normalizeBaseUrl(value) {
  return String(value ?? "").trim().replace(/\/+$/u, "");
}

function cleanQuery(value) {
  if (typeof value !== "string") return "";
  return [...value.normalize("NFKC").replace(/\s+/gu, " ").trim()].slice(0, 1_200).join("");
}

function cleanText(value, limit) {
  if (typeof value !== "string") return "";
  return [...value.normalize("NFKC").replace(/\s+/gu, " ").trim()].slice(0, limit).join("");
}

function cleanNullableText(value, limit) {
  if (value === null || value === undefined || value === "") return null;
  return cleanText(value, limit) || null;
}

function safeToken(value) {
  const text = cleanText(value, 160);
  if (!text) return null;
  return /^[A-Za-z0-9._:-]{1,160}$/u.test(text) ? text : `sha256:${sha256(text)}`;
}

function requireDigest(value, error) {
  const text = String(value ?? "");
  if (!/^[a-f0-9]{64}$/u.test(text)) throw new Error(error);
  return text;
}

function boundedInteger(value, fallback, minimum, maximum) {
  const number = Number(value ?? fallback);
  return Number.isInteger(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
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

function unique(values) {
  return [...new Set(values)];
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
