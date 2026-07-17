import { performance } from "node:perf_hooks";
import { buildRelayRequestPayload, parseRelayResponse } from "./canaryCore.js";
import { canonicalJson, sha256 } from "./pilotCore.js";

const RESPONSE_LIMIT_BYTES = 2 * 1024 * 1024;

export class OpenAICompatibleRelayCanaryAdapter {
  constructor(options = {}) {
    this.providerId = "openai_compatible_relay";
    this.providerVersion = "canary-v0.1";
    this.mode = "web_search";
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.baseUrlDigest = sha256(this.baseUrl);
    this.apiKey = String(options.apiKey ?? "");
    this.model = String(options.model ?? "");
    this.compatibilityReceiptDigest = String(options.compatibilityReceiptDigest ?? "") || null;
    this.timeoutMs = Number(options.timeoutMs ?? 60_000);
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    if (!this.baseUrl || !this.apiKey || !this.model) throw new Error("canary_relay_configuration_incomplete");
    if (typeof this.fetchImpl !== "function") throw new Error("canary_fetch_unavailable");
  }

  async execute(task) {
    const payload = buildRelayRequestPayload(task, this.model);
    const requestBody = JSON.stringify(payload);
    const startedAt = new Date().toISOString();
    const started = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response = null;
    let responseBytes = Buffer.alloc(0);
    let responseJson = null;
    let transportError = null;

    try {
      response = await this.fetchImpl(`${this.baseUrl}/responses`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "m2-v2-evidence-canary/0.1",
        },
        body: requestBody,
        signal: controller.signal,
      });
      responseBytes = Buffer.from(await response.arrayBuffer());
      if (responseBytes.length <= RESPONSE_LIMIT_BYTES) {
        try {
          responseJson = JSON.parse(responseBytes.toString("utf8"));
        } catch {
          responseJson = null;
        }
      }
    } catch (error) {
      transportError = { name: safeToken(error?.name), code: safeToken(error?.cause?.code) };
    } finally {
      clearTimeout(timeout);
    }

    const latencyMs = Math.round(performance.now() - started);
    const parsed = parseRelayResponse(responseJson);
    const httpOk = response?.ok === true;
    const status = httpOk && parsed.responsesShapeValid && parsed.webSearchObserved && parsed.structuredValid
      ? "success"
      : transportError
        ? "transport_error"
        : !httpOk
          ? "http_error"
          : !parsed.responsesShapeValid
            ? "responses_shape_invalid"
            : !parsed.webSearchObserved
              ? "web_search_not_observed"
              : "strict_json_invalid";
    const receiptPayload = {
      schema: "m2.v2.canary-provider-receipt.v0.1",
      privateOnly: true,
      requestKey: task.requestKey,
      runKind: task.runKind,
      workReference: task.workReference,
      identityDigest: task.identityDigest,
      queryId: task.queryId,
      queryHash: task.queryHash,
      queryCategory: task.queryCategory,
      providerId: this.providerId,
      providerVersion: this.providerVersion,
      providerMode: this.mode,
      model: this.model,
      baseUrlDigest: this.baseUrlDigest,
      compatibilityReceiptDigest: this.compatibilityReceiptDigest,
      endpointPath: "/responses",
      startedAt,
      capturedAt: new Date().toISOString(),
      dispatched: true,
      status,
      httpStatus: response?.status ?? null,
      responseContentType: safeContentType(response?.headers?.get("content-type")),
      requestPayloadDigest: sha256(requestBody),
      responseDigest: responseBytes.length ? sha256(responseBytes) : null,
      responseByteLength: responseBytes.length,
      responseOverSizeLimit: responseBytes.length > RESPONSE_LIMIT_BYTES,
      requestIdDigest: hashOptional(response?.headers?.get("x-request-id")),
      transportError,
      semanticChecks: {
        responsesShapeValid: parsed.responsesShapeValid,
        webSearchObserved: parsed.webSearchObserved,
        strictJsonValid: parsed.structuredValid,
        validationIssues: parsed.validationIssues,
      },
      outputTextDigest: parsed.outputTextDigest,
      structuredResponse: parsed.structuredValid ? parsed.structured : null,
      citations: parsed.citations,
      citationCount: parsed.citations.length,
      resultCount: parsed.structuredValid ? parsed.structured.evidenceCandidates.length : 0,
      usage: parsed.usage,
      providerReportedCostCny: providerReportedCostCny(responseJson),
      pricingMethod: providerReportedCostCny(responseJson) === null ? "provider_pricing_unavailable" : "provider_reported",
      latencyMs,
      rawResponsePersisted: false,
      authorizationHeaderPersisted: false,
      apiKeyPersisted: false,
    };
    return { ...receiptPayload, receiptDigest: sha256(canonicalJson(receiptPayload)) };
  }
}

function providerReportedCostCny(json) {
  const value = Number(json?.usage?.cost_cny ?? json?.usage?.cost?.cny);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function normalizeBaseUrl(value) {
  return String(value ?? "").trim().replace(/\/+$/u, "");
}

function safeToken(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  return /^[A-Za-z0-9._:-]{1,80}$/u.test(value) ? value : `sha256:${sha256(value)}`;
}

function safeContentType(value) {
  return typeof value === "string" ? value.split(";", 1)[0].trim().slice(0, 80) : null;
}

function hashOptional(value) {
  return typeof value === "string" && value ? sha256(value) : null;
}
