import { performance } from "node:perf_hooks";
import { sha256 } from "./pilotCore.js";
import { consumeProviderDispatchCapability } from "./providerDispatchCapability.js";
import {
  assertNoProviderRedirect,
  assertResponsesRetention,
  bindProviderTransport,
} from "./providerTransportSecurity.js";
import {
  V2B5_EXTRACTION_ADAPTER_VERSION,
  buildV2B5ExtractionPayload,
  extractV2B5ResponseStatus,
  extractV2B5ReturnedModelId,
  extractV2B5Usage,
  normalizeV2B5ExtractionResponse,
} from "./extractionV2B5.js";

export const V2B5_RELAY_EXTRACTION_PROVIDER_ID = "openai_compatible_relay_extraction";
export const V2B5_RELAY_RECEIPT_SCHEMA = "m2.v2.relay-extraction-receipt.v0.1";

const RESPONSE_LIMIT_BYTES = 2 * 1024 * 1024;

export class OpenAICompatibleRelayExtractionProviderV2B5 {
  constructor(options = {}) {
    this.provider = V2B5_RELAY_EXTRACTION_PROVIDER_ID;
    this.providerVersion = V2B5_EXTRACTION_ADAPTER_VERSION;
    this.mode = "evidence_extraction_only";
    this.transport = bindProviderTransport({ baseUrl: options.baseUrl, approvedHost: options.approvedHost });
    this.baseUrl = this.transport.baseUrl;
    this.approvedHost = this.transport.approvedHost;
    this.apiKey = String(options.apiKey ?? "");
    this.timeoutMs = boundedInteger(options.timeoutMs, 25_000, 1_000, 60_000);
    this.fetchImpl = options.fetchImpl;
    if (!this.baseUrl || !this.apiKey) throw new Error("v2b5_relay_configuration_incomplete");
    if (typeof this.fetchImpl !== "function") throw new Error("v2b5_relay_fetch_unavailable");
  }

  capabilities() {
    return {
      provider: this.provider,
      providerVersion: this.providerVersion,
      mode: this.mode,
      searchAllowed: false,
      webSearchAllowed: false,
      browserAllowed: false,
      strictJsonSchemaRequested: true,
      rawResponsePersisted: false,
    };
  }

  async extract(input) {
    const payload = buildV2B5ExtractionPayload({
      model: input.model,
      work: input.work,
      sourceRecords: input.sourceRecords,
      maxOutputTokens: input.maxOutputTokens,
      reasoningEffort: input.reasoningEffort,
      includeReasoning: input.includeReasoning,
      repairIssues: input.repairIssues,
    });
    const response = await dispatchV2B5RelayExtractionRequest({
      fetchImpl: this.fetchImpl,
      baseUrl: this.baseUrl,
      approvedHost: this.approvedHost,
      apiKey: this.apiKey,
      payload,
      timeoutMs: this.timeoutMs,
    });
    const returnedModelId = extractV2B5ReturnedModelId(response.json);
    const modelBindingVerified = returnedModelId === input.model;
    const normalizedResponse = normalizeV2B5ExtractionResponse(response.json, {
      sourceRecords: input.sourceRecords,
      work: input.work,
      privateTokens: input.privateTokens,
      governancePolicy: input.governancePolicy,
    });
    const providerConnectivityPassed = response.httpOk && response.json !== null;
    const providerContractCompatible = providerConnectivityPassed
      && modelBindingVerified
      && normalizedResponse.contractValid;
    const receiptPayload = {
      schema: V2B5_RELAY_RECEIPT_SCHEMA,
      privateOnly: true,
      provider: this.provider,
      providerVersion: this.providerVersion,
      providerMode: this.mode,
      physicalRequestKey: String(input.physicalRequestKey ?? ""),
      logicalExtractionKey: String(input.logicalExtractionKey ?? ""),
      phase: String(input.phase ?? ""),
      runKind: String(input.runKind ?? ""),
      attemptKind: String(input.attemptKind ?? "primary"),
      requestedModelId: String(input.model ?? ""),
      returnedModelId,
      modelBindingVerified,
      sourceRecordSetDigest: String(input.sourceRecordSetDigest ?? ""),
      requestStartedAt: response.requestStartedAt,
      responseReceivedAt: response.responseReceivedAt,
      latencyMs: response.latencyMs,
      timeoutMs: this.timeoutMs,
      dispatched: true,
      retryCount: boundedInteger(input.retryCount, 0, 0, 1),
      httpStatus: response.httpStatus,
      responseStatus: extractV2B5ResponseStatus(response.json),
      status: providerContractCompatible
        ? "success"
        : !providerConnectivityPassed
          ? response.status
          : !modelBindingVerified
            ? "model_binding_mismatch"
            : "extraction_contract_failure",
      responseContentTypeClass: response.contentTypeClass,
      responseDigest: response.responseDigest,
      responseByteLength: response.responseByteLength,
      requestPayloadDigest: sha256(JSON.stringify(payload)),
      providerConnectivityPassed,
      providerContractCompatible,
      reasoningParameterIncluded: Object.hasOwn(payload, "reasoning"),
      reasoningParameterUnsupported: response.reasoningParameterUnsupported,
      normalizedResponse,
      usage: extractV2B5Usage(response.json),
      rawResponsePersisted: false,
      authorizationHeaderPersisted: false,
      apiKeyPersisted: false,
      searchToolUsed: false,
      full160Authorized: false,
    };
    return { ...receiptPayload, receiptDigest: sha256(receiptPayload) };
  }
}

export async function dispatchV2B5RelayExtractionRequest(options) {
  const fetchImpl = options.fetchImpl;
  consumeProviderDispatchCapability(options.capability, {
    ...(options.capabilityScope ?? {}),
    sinkId: "sink_v2b5_relay_extraction",
    requestPayload: options.payload,
    fetchImpl,
  });
  const transport = bindProviderTransport({ baseUrl: options.baseUrl, approvedHost: options.approvedHost });
  assertResponsesRetention(options.payload);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 25_000);
  const requestStartedAt = new Date().toISOString();
  const started = performance.now();
  let response = null;
  let bytes = Buffer.alloc(0);
  let json = null;
  let transportError = null;
  try {
    response = await fetchImpl(transport.endpointUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "m2-v2-v2b5-relay-extraction/0.1",
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
  } finally {
    clearTimeout(timeout);
  }
  const responseReceivedAt = new Date().toISOString();
  const contentTypeClass = classifyContentType(response?.headers?.get?.("content-type"));
  const errorText = safeErrorText(json);
  const reasoningParameterUnsupported = response?.status === 400
    && /reasoning|effort/iu.test(errorText)
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
    latencyMs: Math.round(performance.now() - started),
    httpStatus: response?.status ?? null,
    httpOk: response?.ok === true,
    status,
    errorCode: transportError ?? (!response?.ok ? `http_${response?.status ?? "unknown"}` : status === "provider_response_received" ? null : status),
    contentTypeClass,
    responseDigest: bytes.length ? sha256(bytes.toString("base64")) : null,
    responseByteLength: bytes.length,
    reasoningParameterUnsupported,
    rawResponsePersisted: false,
  };
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

function safeToken(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return /^[A-Za-z0-9._:-]{1,160}$/u.test(text) ? text : `sha256:${sha256(text)}`;
}

function boundedInteger(value, fallback, minimum, maximum) {
  const number = Number(value ?? fallback);
  return Number.isInteger(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
}
