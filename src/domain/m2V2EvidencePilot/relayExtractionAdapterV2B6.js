import { performance } from "node:perf_hooks";
import { canonicalJson, sha256 } from "./pilotCore.js";
import {
  V2B5_CLAIM_TYPES,
  V2B5_EXTRACTION_OUTPUT_SCHEMA_VERSION,
  buildV2B5ExtractionPayload,
  extractV2B5ResponseStatus,
  extractV2B5ReturnedModelId,
  extractV2B5Usage,
  normalizeV2B5ExtractionResponse,
  validateV2B5ExtractionOutput,
} from "./extractionV2B5.js";
import { sourceIdForV2B5Url } from "./sourceRecordV2B5.js";

export const V2B6_ADAPTER_VERSION = "m2-v2-relay-extraction-adapter-v0.2";
export const V2B6_RECEIPT_SCHEMA = "m2.v2.relay-extraction-receipt.v0.2";
export const V2B6_DEFAULT_TIMEOUT_MS = 120_000;
export const V2B6_MIN_TIMEOUT_MS = 30_000;
export const V2B6_MAX_TIMEOUT_MS = 180_000;
export const V2B6_MAX_OUTPUT_TOKENS = 1_600;
export const V2B6_STRUCTURED_MODES = Object.freeze(["server_strict", "local_json"]);

const RESPONSE_LIMIT_BYTES = 2 * 1024 * 1024;
const ENTITY_STATUSES = ["high", "medium", "low", "unresolved", "ambiguous"];
const AUTHOR_STATUSES = [...ENTITY_STATUSES, "not_applicable"];
const CONTRADICTION_STATUSES = ["none", "possible", "confirmed", "unresolved", "resolved"];

export function resolveV2B6TimeoutMs(value) {
  if (value === undefined || value === null || value === "") return V2B6_DEFAULT_TIMEOUT_MS;
  const number = Number(value);
  if (!Number.isInteger(number) || number < V2B6_MIN_TIMEOUT_MS || number > V2B6_MAX_TIMEOUT_MS) {
    throw new Error("v2b6_extraction_timeout_out_of_range");
  }
  return number;
}

export function parseV2B6StructuredResponse(json) {
  const roots = responseRoots(json);
  const parsed = roots.map((root) => root?.output_parsed).find(isObject) ?? null;
  if (parsed) return { value: parsed, carrier: "output_parsed", issues: [] };
  const carriers = extractTextCarriers(roots);
  for (const carrier of carriers) {
    const direct = parseJsonObject(carrier.text);
    if (direct) return { value: direct, carrier: carrier.path, issues: [] };
    const fenced = parseSingleFencedJsonObject(carrier.text);
    if (fenced) return { value: fenced, carrier: `${carrier.path}:single_fenced_json`, issues: [] };
  }
  return { value: null, carrier: null, issues: ["structured_json_not_found"] };
}

export function buildV2B6ResponseShapeSkeleton(json) {
  const roots = responseRoots(json);
  return {
    rootCount: roots.length,
    rootKeySets: roots.map((root) => Object.keys(root).sort()),
    rootTypes: roots.map((root) => String(root?.object ?? root?.type ?? "object").slice(0, 80)),
    outputItemTypes: unique(roots.flatMap((root) => (Array.isArray(root.output) ? root.output : []))
      .map((item) => String(item?.type ?? "unreported").slice(0, 80))),
    contentItemTypes: unique(roots.flatMap((root) => (Array.isArray(root.output) ? root.output : []))
      .flatMap((item) => Array.isArray(item?.content) ? item.content : [])
      .map((item) => String(item?.type ?? "unreported").slice(0, 80))),
    carriers: unique(extractTextCarriers(roots).map((item) => item.path)),
    outputParsedObserved: roots.some((root) => isObject(root.output_parsed)),
    usageObserved: roots.some((root) => isObject(root.usage)),
    returnedModelObserved: roots.some((root) => typeof root.model === "string"),
    statusObserved: roots.some((root) => typeof root.status === "string"),
    errorShapeObserved: roots.some((root) => isObject(root.error) || typeof root.message === "string"),
  };
}

export function classifyV2B6ModelBinding(requestedModelId, returnedModelId, approvedAliases = {}) {
  if (!returnedModelId) return { status: "unreported", verified: false, aliasUsed: false };
  if (returnedModelId === requestedModelId) return { status: "exact", verified: true, aliasUsed: false };
  const aliases = Array.isArray(approvedAliases?.[requestedModelId]) ? approvedAliases[requestedModelId] : [];
  if (aliases.includes(returnedModelId)) return { status: "approved_alias", verified: true, aliasUsed: true };
  return { status: "mismatch", verified: false, aliasUsed: false };
}

export function buildV2B6CapabilityPayload(testId, model, mode = "server_strict") {
  const base = { model, store: false, max_output_tokens: testId === "E0" ? 64 : 1_000 };
  if (testId === "E0") return { ...base, input: "Return exactly OK and nothing else." };
  if (testId === "E1") return withFormat({
    ...base,
    input: "Return only JSON with ok=true. Do not use markdown.",
  }, mode, minimalSchemaFormat());
  if (testId === "E2") return withFormat({
    ...base,
    input: [
      "Resolve the synthetic work and author using only sourceId src_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.",
      "Return only the requested JSON. Do not use markdown.",
    ].join("\n"),
  }, mode, entitySchemaFormat());
  if (testId === "E3") return withFormat({
    ...base,
    input: [
      "Create one work_identity claim for Synthetic Work using only sourceId src_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.",
      "Use claimId clm_1, confidence 0.9, eventTime null, contradictionKey null, and empty limitations.",
      "Return only the requested JSON. Do not use markdown.",
    ].join("\n"),
  }, mode, claimsSchemaFormat());
  if (testId === "E4") {
    const payload = buildV2B6FullPayload({
      model,
      mode,
      work: { title: "Synthetic Work", author: "Synthetic Author", sourceType: "publication" },
      sourceRecords: [syntheticSourceRecord()],
      maxOutputTokens: 1_200,
    });
    return payload;
  }
  throw new Error("v2b6_capability_test_unknown");
}

export function evaluateV2B6CapabilityResponse(testId, response) {
  if (testId === "E0") {
    const text = extractTextCarriers(responseRoots(response)).map((item) => item.text).join("\n").trim();
    return { passed: /^OK[.!]?$/u.test(text), carrier: text ? "text" : null, issues: text ? [] : ["plain_text_missing"] };
  }
  const parsed = parseV2B6StructuredResponse(response);
  let validation;
  if (testId === "E1") validation = { valid: parsed.value?.ok === true && Object.keys(parsed.value ?? {}).length === 1, issues: ["minimal_json_invalid"] };
  else if (testId === "E2") validation = validateEntityStage(parsed.value);
  else if (testId === "E3") validation = validateClaimsStage(parsed.value);
  else validation = validateV2B5ExtractionOutput(parsed.value);
  return {
    passed: parsed.value !== null && validation.valid,
    carrier: parsed.carrier,
    issues: parsed.value === null ? parsed.issues : validation.valid ? [] : validation.issues,
  };
}

export function buildV2B6FullPayload(input) {
  const payload = buildV2B5ExtractionPayload({
    model: input.model,
    work: input.work,
    sourceRecords: input.sourceRecords,
    maxOutputTokens: Math.min(1_200, input.maxOutputTokens ?? 1_200),
    includeReasoning: false,
    repairIssues: input.repairIssues,
  });
  payload.input = `${payload.input}\nUse claim IDs clm_1, clm_2, ... and contradiction IDs ctr_1, ctr_2, ... . Prefer a supported work_identity claim whose exact value occurs in a supplied title or snippet. Return no unsupported claim.`;
  if (input.mode === "local_json") delete payload.text;
  return payload;
}

export function buildV2B6EntityPayload(input) {
  const records = projectSources(input.sourceRecords);
  return withFormat({
    model: input.model,
    store: false,
    max_output_tokens: Math.min(800, input.maxOutputTokens ?? 800),
    input: [
      "Resolve work and author only from SOURCE_RECORDS. Never search or use outside knowledge.",
      "Use only supplied sourceIds. A high/medium status requires that the exact work title or author occurs in the cited source title/snippet.",
      "If unsupported, use unresolved with confidence 0 and an empty sourceId list.",
      "Return JSON only; no URLs, markdown, claims, predictions, or recommendations.",
      `WORK: ${canonicalJson(projectWork(input.work))}`,
      `SOURCE_RECORDS: ${canonicalJson(records)}`,
    ].join("\n"),
  }, input.mode, entitySchemaFormat());
}

export function buildV2B6ClaimsPayload(input) {
  const records = projectSources(input.sourceRecords);
  return withFormat({
    model: input.model,
    store: false,
    max_output_tokens: Math.min(1_200, input.maxOutputTokens ?? 1_200),
    input: [
      "Extract claims only from SOURCE_RECORDS. Never search or use outside knowledge.",
      "Use only supplied sourceIds and never output URLs.",
      "Use claim IDs clm_1, clm_2, ... . Use contradiction IDs ctr_1, ctr_2, ... only when needed.",
      "Every structured value must occur exactly in a cited source title or snippet. Unknown eventTime must be null.",
      "Prefer one work_identity claim with the exact WORK title when supported. Return no unsupported claim.",
      "Return JSON only; no markdown, predictions, commercial value, or operating recommendations.",
      `WORK: ${canonicalJson(projectWork(input.work))}`,
      `ENTITY_RESOLUTION: ${canonicalJson(input.entityResolution)}`,
      `SOURCE_RECORDS: ${canonicalJson(records)}`,
    ].join("\n"),
  }, input.mode, claimsSchemaFormat());
}

export function mergeV2B6SplitOutput(entityStage, claimsStage) {
  return {
    schemaVersion: V2B5_EXTRACTION_OUTPUT_SCHEMA_VERSION,
    entityResolution: entityStage?.entityResolution,
    claims: Array.isArray(claimsStage?.claims) ? claimsStage.claims : [],
    contradictions: Array.isArray(claimsStage?.contradictions) ? claimsStage.contradictions : [],
    limitations: unique([...(entityStage?.limitations ?? []), ...(claimsStage?.limitations ?? [])]).slice(0, 10),
  };
}

export function normalizeV2B6ExtractionOutput(value) {
  if (!isObject(value)) return { value, coercions: [] };
  const coercions = [];
  const entityResolution = normalizeEntityResolution(value.entityResolution, coercions);
  const claims = (Array.isArray(value.claims) ? value.claims : []).slice(0, 20).map((claim, index) => {
    const originalId = claim?.claimId;
    const claimId = /^clm_[A-Za-z0-9_-]{1,80}$/u.test(originalId ?? "") ? originalId : `clm_${index + 1}`;
    if (claimId !== originalId) coercions.push("claim_id_carrier_normalized");
    const structuredValue = normalizeStructuredValue(claim?.structuredValue, coercions);
    const eventTime = isIsoTimestamp(claim?.eventTime) ? claim.eventTime : null;
    if (eventTime !== (claim?.eventTime ?? null)) coercions.push("unsupported_event_time_cleared");
    const contradictionKey = /^ctr_[A-Za-z0-9_-]{1,80}$/u.test(claim?.contradictionKey ?? "") ? claim.contradictionKey : null;
    if (contradictionKey !== (claim?.contradictionKey ?? null)) coercions.push("invalid_contradiction_reference_cleared");
    return {
      claimId,
      claimType: V2B5_CLAIM_TYPES.includes(claim?.claimType) ? claim.claimType : "other",
      structuredValue,
      supportingSourceIds: validSourceIds(claim?.supportingSourceIds, false),
      confidence: boundedNumber(claim?.confidence, 0),
      eventTime,
      contradictionKey,
      limitations: safeStrings(claim?.limitations),
    };
  });
  const claimIds = new Set(claims.map((item) => item.claimId));
  const contradictions = (Array.isArray(value.contradictions) ? value.contradictions : []).slice(0, 20).map((item, index) => ({
    contradictionKey: /^ctr_[A-Za-z0-9_-]{1,80}$/u.test(item?.contradictionKey ?? "") ? item.contradictionKey : `ctr_${index + 1}`,
    claimIds: unique((Array.isArray(item?.claimIds) ? item.claimIds : []).filter((id) => claimIds.has(id))),
    status: CONTRADICTION_STATUSES.includes(item?.status) ? item.status : "unresolved",
    reason: cleanText(item?.reason, 500) || "unresolved",
  }));
  return {
    value: {
      schemaVersion: V2B5_EXTRACTION_OUTPUT_SCHEMA_VERSION,
      entityResolution,
      claims,
      contradictions,
      limitations: safeStrings(value.limitations),
    },
    coercions: unique(coercions),
  };
}

export function normalizeV2B6BenchmarkResponse(json, context) {
  const parsed = parseV2B6StructuredResponse(json);
  const normalizedCarrier = normalizeV2B6ExtractionOutput(parsed.value);
  const syntheticResponse = normalizedCarrier.value ? { output_parsed: normalizedCarrier.value } : json;
  const result = normalizeV2B5ExtractionResponse(syntheticResponse, context);
  return {
    ...result,
    adapterVersion: V2B6_ADAPTER_VERSION,
    responseCarrier: parsed.carrier,
    carrierIssues: parsed.issues,
    carrierCoercions: normalizedCarrier.coercions,
  };
}

export async function dispatchV2B6RelayRequest(options) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("v2b6_relay_fetch_unavailable");
  const timeoutMs = resolveV2B6TimeoutMs(options.timeoutMs);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const requestStartedAt = new Date().toISOString();
  const started = performance.now();
  let response;
  let bytes = Buffer.alloc(0);
  let json = null;
  let transportError = null;
  try {
    response = await fetchImpl(`${normalizeBaseUrl(options.baseUrl)}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "m2-v2-v2b6-relay-extraction/0.2",
      },
      body: JSON.stringify(options.payload),
      signal: controller.signal,
    });
    bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length <= RESPONSE_LIMIT_BYTES) {
      try { json = JSON.parse(bytes.toString("utf8")); } catch { json = null; }
    }
  } catch (error) {
    transportError = safeToken(error?.name ?? error?.message) ?? "transport_error";
  } finally {
    clearTimeout(timeout);
  }
  const latencyMs = Math.round(performance.now() - started);
  const contentTypeClass = classifyContentType(response?.headers?.get?.("content-type"));
  const timedOut = transportError === "AbortError" || (latencyMs >= timeoutMs - 250 && !response);
  const status = timedOut ? "timeout"
    : transportError ? "transport_error"
      : !response?.ok ? "http_error"
        : bytes.length > RESPONSE_LIMIT_BYTES ? "response_oversize"
          : !json ? contentTypeClass === "html" ? "html_error" : "non_json_error"
            : "provider_response_received";
  return {
    json,
    requestStartedAt,
    responseReceivedAt: new Date().toISOString(),
    latencyMs,
    timeoutMs,
    timedOut,
    httpStatus: response?.status ?? null,
    httpOk: response?.ok === true,
    status,
    contentTypeClass,
    responseDigest: bytes.length ? sha256(bytes.toString("base64")) : null,
    responseByteLength: bytes.length,
    rawResponsePersisted: false,
  };
}

export function buildV2B6Receipt(input) {
  const response = input.response;
  const returnedModelId = extractV2B5ReturnedModelId(response.json);
  const binding = classifyV2B6ModelBinding(input.requestedModelId, returnedModelId, input.approvedAliases);
  const payload = {
    schema: V2B6_RECEIPT_SCHEMA,
    privateOnly: true,
    provider: "openai_compatible_relay_extraction",
    providerVersion: V2B6_ADAPTER_VERSION,
    phase: input.phase,
    testId: input.testId ?? null,
    logicalExtractionKey: input.logicalExtractionKey,
    attemptKind: input.attemptKind ?? "primary",
    runKind: input.runKind ?? null,
    canarySlotId: input.canarySlotId ?? null,
    requestedModelId: input.requestedModelId,
    returnedModelId,
    modelBindingStatus: binding.status,
    modelBindingVerified: binding.verified,
    sourceBundleDigest: input.sourceBundleDigest ?? null,
    sourceRecordSetDigest: input.sourceRecordSetDigest ?? null,
    adapterVersion: V2B6_ADAPTER_VERSION,
    capabilityProfileDigest: input.capabilityProfileDigest ?? null,
    extractionMode: input.extractionMode ?? null,
    structuredMode: input.structuredMode ?? null,
    timeoutMs: response.timeoutMs,
    requestStartedAt: response.requestStartedAt,
    responseReceivedAt: response.responseReceivedAt,
    latencyMs: response.latencyMs,
    timedOut: response.timedOut,
    dispatched: true,
    httpStatus: response.httpStatus,
    httpOk: response.httpOk,
    status: response.status,
    responseStatus: extractV2B5ResponseStatus(response.json),
    responseContentTypeClass: response.contentTypeClass,
    responseDigest: response.responseDigest,
    responseByteLength: response.responseByteLength,
    requestPayloadDigest: sha256(input.requestPayload),
    responseShapeSkeleton: buildV2B6ResponseShapeSkeleton(response.json),
    usage: extractV2B5Usage(response.json),
    normalizedResponse: input.normalizedResponse ?? null,
    rawResponsePersisted: false,
    authorizationHeaderPersisted: false,
    apiKeyPersisted: false,
    searchToolUsed: false,
    tavilyRequestUsed: false,
    canaryExecuted: false,
    full160Authorized: false,
  };
  return { ...payload, receiptDigest: sha256(payload) };
}

function withFormat(payload, mode, format) {
  if (!V2B6_STRUCTURED_MODES.includes(mode)) throw new Error("v2b6_structured_mode_invalid");
  return mode === "server_strict" ? { ...payload, text: { format } } : payload;
}

function projectWork(work) {
  return {
    title: cleanText(work?.title, 200),
    author: cleanText(work?.author, 200),
    sourceType: work?.sourceType === "publication" ? "publication" : "web_original",
  };
}

function projectSources(sourceRecords) {
  const records = Array.isArray(sourceRecords) ? sourceRecords : [];
  if (records.length < 1 || records.length > 6) throw new Error("v2b6_source_record_count_invalid");
  return records.map((record) => ({
    sourceId: record.sourceId,
    title: record.title,
    snippet: record.snippet,
    capturedAt: record.capturedAt,
    availableAt: record.availableAt,
    sourceTypeCandidate: record.sourceTypeCandidate,
  }));
}

function minimalSchemaFormat() {
  return {
    type: "json_schema", name: "m2_v2_v2b6_minimal", strict: true,
    schema: { type: "object", additionalProperties: false, properties: { ok: { type: "boolean" } }, required: ["ok"] },
  };
}

function entitySchemaFormat() {
  const entity = (statuses) => ({
    type: "object", additionalProperties: false,
    properties: {
      status: { type: "string", enum: statuses },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      supportingSourceIds: { type: "array", uniqueItems: true, items: { type: "string", pattern: "^src_[a-f0-9]{32}$" } },
    },
    required: ["status", "confidence", "supportingSourceIds"],
  });
  return {
    type: "json_schema", name: "m2_v2_v2b6_entity", strict: true,
    schema: {
      type: "object", additionalProperties: false,
      properties: {
        schemaVersion: { type: "string", enum: [V2B5_EXTRACTION_OUTPUT_SCHEMA_VERSION] },
        entityResolution: {
          type: "object", additionalProperties: false,
          properties: { work: entity(ENTITY_STATUSES), author: entity(AUTHOR_STATUSES) },
          required: ["work", "author"],
        },
        limitations: { type: "array", maxItems: 10, items: { type: "string", minLength: 1, maxLength: 500 } },
      },
      required: ["schemaVersion", "entityResolution", "limitations"],
    },
  };
}

function claimsSchemaFormat() {
  return {
    type: "json_schema", name: "m2_v2_v2b6_claims", strict: true,
    schema: {
      type: "object", additionalProperties: false,
      properties: {
        schemaVersion: { type: "string", enum: [V2B5_EXTRACTION_OUTPUT_SCHEMA_VERSION] },
        claims: {
          type: "array", maxItems: 20,
          items: {
            type: "object", additionalProperties: false,
            properties: {
              claimId: { type: "string", pattern: "^clm_[A-Za-z0-9_-]{1,80}$" },
              claimType: { type: "string", enum: V2B5_CLAIM_TYPES },
              structuredValue: structuredValueSchema(),
              supportingSourceIds: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string", pattern: "^src_[a-f0-9]{32}$" } },
              confidence: { type: "number", minimum: 0, maximum: 1 },
              eventTime: { type: ["string", "null"] },
              contradictionKey: { type: ["string", "null"] },
              limitations: { type: "array", maxItems: 10, items: { type: "string", minLength: 1, maxLength: 500 } },
            },
            required: ["claimId", "claimType", "structuredValue", "supportingSourceIds", "confidence", "eventTime", "contradictionKey", "limitations"],
          },
        },
        contradictions: {
          type: "array", maxItems: 20,
          items: {
            type: "object", additionalProperties: false,
            properties: {
              contradictionKey: { type: "string", pattern: "^ctr_[A-Za-z0-9_-]{1,80}$" },
              claimIds: { type: "array", uniqueItems: true, items: { type: "string", pattern: "^clm_[A-Za-z0-9_-]{1,80}$" } },
              status: { type: "string", enum: CONTRADICTION_STATUSES },
              reason: { type: "string", minLength: 1, maxLength: 500 },
            },
            required: ["contradictionKey", "claimIds", "status", "reason"],
          },
        },
        limitations: { type: "array", maxItems: 10, items: { type: "string", minLength: 1, maxLength: 500 } },
      },
      required: ["schemaVersion", "claims", "contradictions", "limitations"],
    },
  };
}

function structuredValueSchema() {
  return {
    type: "object", additionalProperties: false,
    properties: {
      valueType: { type: "string", enum: ["text", "date", "number", "boolean"] },
      textValue: { type: ["string", "null"] },
      dateValue: { type: ["string", "null"] },
      numberValue: { type: ["number", "null"] },
      booleanValue: { type: ["boolean", "null"] },
    },
    required: ["valueType", "textValue", "dateValue", "numberValue", "booleanValue"],
  };
}

function validateEntityStage(value) {
  if (!isObject(value) || !isObject(value.entityResolution)) return { valid: false, issues: ["entity_stage_invalid"] };
  const entities = [value.entityResolution.work, value.entityResolution.author];
  const valid = entities.every((item) => isObject(item) && typeof item.status === "string"
    && Number.isFinite(item.confidence) && Array.isArray(item.supportingSourceIds));
  return { valid, issues: valid ? [] : ["entity_stage_invalid"] };
}

function validateClaimsStage(value) {
  if (!isObject(value) || !Array.isArray(value.claims) || !Array.isArray(value.contradictions)) {
    return { valid: false, issues: ["claims_stage_invalid"] };
  }
  const synthetic = {
    schemaVersion: V2B5_EXTRACTION_OUTPUT_SCHEMA_VERSION,
    entityResolution: {
      work: { status: "high", confidence: 1, supportingSourceIds: ["src_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"] },
      author: { status: "high", confidence: 1, supportingSourceIds: ["src_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"] },
    },
    claims: value.claims,
    contradictions: value.contradictions,
    limitations: value.limitations,
  };
  return validateV2B5ExtractionOutput(synthetic);
}

function syntheticSourceRecord() {
  const url = "https://example.com/synthetic-work";
  return {
    schema: "m2.v2.evidence-source-record.v0.2",
    sourceId: sourceIdForV2B5Url(url),
    queryId: "v2b6_synthetic",
    title: "Synthetic Work by Synthetic Author",
    url,
    domain: "example.com",
    snippet: "Synthetic Work is written by Synthetic Author.",
    providerScore: 1,
    searchProvider: "tavily_structured_search",
    providerRequestId: "synthetic",
    capturedAt: "2026-07-18T00:00:00.000Z",
    availableAt: "2026-07-18T00:00:00.000Z",
    availableAtBasis: "first_observed_by_system",
    eventTime: null,
    sourceTypeCandidate: "publisher_or_official_candidate",
    providerReceiptRef: `sha256:${"a".repeat(64)}`,
    researchOnly: true,
    modelEligible: false,
  };
}

function normalizeEntityResolution(value, coercions) {
  const normalize = (item, statuses) => {
    const status = statuses.includes(item?.status) ? item.status : "unresolved";
    if (status !== item?.status) coercions.push("entity_status_normalized");
    const evidenceRequired = ["high", "medium"].includes(status);
    return {
      status,
      confidence: boundedNumber(item?.confidence, 0),
      supportingSourceIds: validSourceIds(item?.supportingSourceIds, !evidenceRequired),
    };
  };
  return {
    work: normalize(value?.work, ENTITY_STATUSES),
    author: normalize(value?.author, AUTHOR_STATUSES),
  };
}

function normalizeStructuredValue(value, coercions) {
  const type = ["text", "date", "number", "boolean"].includes(value?.valueType) ? value.valueType : "text";
  const source = {
    text: value?.textValue ?? value?.value ?? "",
    date: value?.dateValue ?? value?.value ?? "",
    number: value?.numberValue ?? value?.value,
    boolean: value?.booleanValue ?? value?.value,
  }[type];
  if (value?.valueType !== type) coercions.push("structured_value_type_normalized");
  return {
    valueType: type,
    textValue: type === "text" ? cleanText(String(source ?? ""), 500) || "unknown" : null,
    dateValue: type === "date" ? cleanText(String(source ?? ""), 500) || "unknown" : null,
    numberValue: type === "number" && Number.isFinite(Number(source)) ? Number(source) : type === "number" ? 0 : null,
    booleanValue: type === "boolean" ? source === true || String(source).toLowerCase() === "true" : null,
  };
}

function validSourceIds(value, allowEmpty) {
  const ids = unique((Array.isArray(value) ? value : []).filter((id) => /^src_[a-f0-9]{32}$/u.test(id ?? "")));
  return allowEmpty ? ids : ids;
}

function safeStrings(value) {
  return unique((Array.isArray(value) ? value : []).map((item) => cleanText(item, 500)).filter(Boolean)).slice(0, 10);
}

function boundedNumber(value, fallback) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}

function responseRoots(json) {
  if (!isObject(json)) return [];
  const values = [json];
  let current = json;
  for (let depth = 0; depth < 4; depth += 1) {
    const nested = [current.response, current.data].find(isObject);
    if (!nested || values.includes(nested)) break;
    values.push(nested);
    current = nested;
  }
  return values;
}

function extractTextCarriers(roots) {
  const values = [];
  for (const [rootIndex, root] of roots.entries()) {
    if (typeof root.output_text === "string") values.push({ path: `root[${rootIndex}].output_text`, text: root.output_text });
    for (const [outputIndex, output] of (Array.isArray(root.output) ? root.output : []).entries()) {
      for (const [contentIndex, content] of (Array.isArray(output?.content) ? output.content : []).entries()) {
        if (typeof content?.text === "string") values.push({ path: `root[${rootIndex}].output[${outputIndex}].content[${contentIndex}].text`, text: content.text });
      }
    }
    for (const [choiceIndex, choice] of (Array.isArray(root.choices) ? root.choices : []).entries()) {
      if (typeof choice?.message?.content === "string") values.push({ path: `root[${rootIndex}].choices[${choiceIndex}].message.content`, text: choice.message.content });
    }
  }
  return values.filter((item) => item.text.trim());
}

function parseJsonObject(text) {
  try {
    const value = JSON.parse(String(text).trim());
    return isObject(value) ? value : null;
  } catch { return null; }
}

function parseSingleFencedJsonObject(text) {
  const value = String(text ?? "");
  const match = value.match(/^\s*```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```\s*$/iu);
  if (!match || (value.match(/```/gu) ?? []).length !== 2) return null;
  return parseJsonObject(match[1]);
}

function isIsoTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
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

function cleanText(value, limit) {
  if (typeof value !== "string") return "";
  return [...value.normalize("NFKC").replace(/\s+/gu, " ").trim()].slice(0, limit).join("");
}

function safeToken(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return /^[A-Za-z0-9._:-]{1,160}$/u.test(text) ? text : `sha256:${sha256(text)}`;
}

function unique(values) {
  return [...new Set(values)];
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
