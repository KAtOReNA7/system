import assert from "node:assert/strict";
import { mkdirSync, renameSync, rmSync } from "node:fs";
import test from "node:test";

import { OpenAICompatibleRelayCanaryAdapter } from "../src/domain/m2V2EvidencePilot/openAiCompatibleRelayAdapter.js";
import {
  withProviderDispatchCapability,
} from "../src/domain/m2V2EvidencePilot/providerDispatchCapability.js";
import {
  assertResponsesRetention,
  bindProviderTransport,
  isForbiddenNetworkHost,
} from "../src/domain/m2V2EvidencePilot/providerTransportSecurity.js";
import { dispatchV2B6RelayRequest } from "../src/domain/m2V2EvidencePilot/relayExtractionAdapterV2B6.js";
import { dispatchV2B5RelayExtractionRequest } from "../src/domain/m2V2EvidencePilot/relayExtractionProviderV2B5.js";
import {
  buildV2B5TavilySearchPayload,
  dispatchV2B5TavilyRequest,
} from "../src/domain/m2V2EvidencePilot/tavilySearchProviderV2B5.js";
import {
  makeB3ProviderFixture,
  populateB3ProviderFixture,
  writeB3SafeCache,
} from "./helpers/m2V2Pr7B3ProviderFixture.js";

const SAFE_PAYLOAD = Object.freeze({ model: "synthetic-model", input: "synthetic", store: false });
const roots = [];
test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test("provider transport requires a separately approved exact HTTPS host", () => {
  assert.throws(() => bindProviderTransport({ baseUrl: "http://relay.example/v1", approvedHost: "relay.example" }), /provider_https_required/u);
  assert.throws(() => bindProviderTransport({ baseUrl: "https://relay.example/v1", approvedHost: "other.example" }), /provider_host_binding_mismatch/u);
  assert.throws(() => bindProviderTransport({ baseUrl: "https://user:secret@relay.example/v1", approvedHost: "relay.example" }), /provider_url_userinfo_forbidden/u);
  assert.throws(() => bindProviderTransport({ baseUrl: "https://relay.example/v1?redirect=evil", approvedHost: "relay.example" }), /provider_url_query_forbidden/u);
  assert.deepEqual(bindProviderTransport({ baseUrl: "https://relay.example/v1/", approvedHost: "relay.example" }), {
    baseUrl: "https://relay.example/v1", approvedHost: "relay.example",
    endpointUrl: "https://relay.example/v1/responses", redirect: "manual",
  });
});

test("provider transport rejects local and private network destinations", () => {
  for (const host of ["localhost", "127.0.0.1", "10.0.0.1", "169.254.1.1", "172.16.0.1", "192.168.1.1", "::1", "fd00::1", "fe80::1", "::ffff:7f00:1"]) {
    assert.equal(isForbiddenNetworkHost(host), true, host);
  }
  assert.equal(isForbiddenNetworkHost("relay.example"), false);
});

test("Responses payloads fail closed unless store is explicitly false", () => {
  assert.equal(assertResponsesRetention(SAFE_PAYLOAD), true);
  assert.throws(() => assertResponsesRetention({ model: "synthetic" }), /provider_responses_store_must_be_false/u);
  assert.throws(() => assertResponsesRetention({ model: "synthetic", store: true }), /provider_responses_store_must_be_false/u);
});

test("registered relay, search and probe sinks reject missing capability before transport", async () => {
  let fetchCount = 0;
  const fetchImpl = async () => { fetchCount += 1; throw new Error("must_not_run"); };
  await assert.rejects(dispatchV2B6RelayRequest({ fetchImpl, payload: SAFE_PAYLOAD }), /provider_execution_capability_missing/u);
  await assert.rejects(dispatchV2B5RelayExtractionRequest({ fetchImpl, payload: SAFE_PAYLOAD }), /provider_execution_capability_missing/u);
  const searchPayload = buildV2B5TavilySearchPayload({ query: "Synthetic documentation" });
  await assert.rejects(dispatchV2B5TavilyRequest({ fetchImpl, payload: searchPayload }), /provider_execution_capability_missing/u);
  await assert.rejects(dispatchV2B5TavilyRequest({
    fetchImpl, payload: searchPayload,
    capabilityScope: { routeId: "v2b5_capability_audit_probe", phase: "v2b5", root: "synthetic" },
  }), /provider_execution_capability_missing/u);
  assert.equal(fetchCount, 0);
});

test("forged, serialized, cloned and prototype-cloned capabilities have no authority", async () => {
  let fetchCount = 0;
  const fetchImpl = async () => { fetchCount += 1; };
  const payload = buildV2B5TavilySearchPayload({ query: "Synthetic documentation" });
  for (const capability of [{}, JSON.parse("{}"), { fake: true }, Object.create({})]) {
    await assert.rejects(dispatchV2B5TavilyRequest({
      capability, fetchImpl, payload,
      capabilityScope: { routeId: "v2b8_search", phase: "v2b8", root: "synthetic" },
    }), /provider_execution_capability_invalid/u);
  }
  assert.equal(fetchCount, 0);
});

test("capability is route, phase, request and root scoped", async () => {
  const fixture = trackedFixture();
  const other = trackedFixture({ marker: "other" });
  const payload = buildV2B5TavilySearchPayload({ query: "Synthetic scoped request" });
  const variants = [
    { scope: { ...scope(fixture), routeId: "v2b5_runtime_search" }, payload, expected: /scope_mismatch/u },
    { scope: { ...scope(fixture), phase: "v2b7" }, payload, expected: /scope_mismatch/u },
    { scope: scope(fixture), payload: buildV2B5TavilySearchPayload({ query: "Different request" }), expected: /scope_mismatch/u },
    { scope: scope(other), payload, expected: /scope_mismatch/u },
  ];
  for (const variant of variants) {
    let fetchCount = 0;
    await withProviderDispatchCapability({
      ...scope(fixture), requestPayload: payload,
      inMemoryTransport: async () => { fetchCount += 1; return okSearchResponse(); },
    }, async ({ capability, fetchImpl }) => {
      await assert.rejects(dispatchV2B5TavilyRequest({
        capability, fetchImpl, capabilityScope: variant.scope,
        baseUrl: "https://api.tavily.com", apiKey: "synthetic", payload: variant.payload,
      }), variant.expected);
    });
    assert.equal(fetchCount, 0);
  }
});

test("serialized or shallow-cloned issued capability is rejected and unused original becomes stale", async () => {
  const fixture = trackedFixture();
  const payload = buildV2B5TavilySearchPayload({ query: "Synthetic clone request" });
  let captured;
  let fetchImpl;
  await withProviderDispatchCapability({
    ...scope(fixture), requestPayload: payload, inMemoryTransport: async () => okSearchResponse(),
  }, async (issued) => {
    captured = issued.capability;
    fetchImpl = issued.fetchImpl;
    for (const clone of [JSON.parse(JSON.stringify(captured)), { ...captured }, Object.create(captured)]) {
      await assert.rejects(dispatchV2B5TavilyRequest({
        capability: clone, fetchImpl, capabilityScope: scope(fixture),
        baseUrl: "https://api.tavily.com", apiKey: "synthetic", payload,
      }), /provider_execution_capability_invalid/u);
    }
  });
  await assert.rejects(dispatchV2B5TavilyRequest({
    capability: captured, fetchImpl, capabilityScope: scope(fixture),
    baseUrl: "https://api.tavily.com", apiKey: "synthetic", payload,
  }), /provider_execution_capability_consumed_or_stale/u);
});

test("safe-cache mutation after issue rejects before fake transport", async () => {
  const fixture = trackedFixture();
  const payload = buildV2B5TavilySearchPayload({ query: "Synthetic cache mutation" });
  let fetchCount = 0;
  await withProviderDispatchCapability({
    ...scope(fixture), requestPayload: payload,
    inMemoryTransport: async () => { fetchCount += 1; return okSearchResponse(); },
  }, async ({ capability, fetchImpl }) => {
    writeB3SafeCache(fixture.root, "mutated");
    await assert.rejects(dispatchV2B5TavilyRequest({
      capability, fetchImpl, capabilityScope: scope(fixture),
      baseUrl: "https://api.tavily.com", apiKey: "synthetic", payload,
    }), /provider_cache_changed_after_capability/u);
  });
  assert.equal(fetchCount, 0);
});

test("physical root replacement after issue rejects before fake transport", async () => {
  const fixture = trackedFixture();
  const payload = buildV2B5TavilySearchPayload({ query: "Synthetic root replacement" });
  const priorRoot = `${fixture.root}-prior`;
  roots.push(priorRoot);
  let fetchCount = 0;
  await withProviderDispatchCapability({
    ...scope(fixture), requestPayload: payload,
    inMemoryTransport: async () => { fetchCount += 1; return okSearchResponse(); },
  }, async ({ capability, fetchImpl }) => {
    renameSync(fixture.root, priorRoot);
    mkdirSync(fixture.root, { recursive: true });
    populateB3ProviderFixture(fixture.root, { marker: "replacement" });
    await assert.rejects(dispatchV2B5TavilyRequest({
      capability, fetchImpl, capabilityScope: scope(fixture),
      baseUrl: "https://api.tavily.com", apiKey: "synthetic", payload,
    }), /provider_root_changed_after_capability/u);
  });
  assert.equal(fetchCount, 0);
});

test("valid capability is consumed before one fake transport and cannot be reused", async () => {
  const fixture = trackedFixture();
  const payload = buildV2B5TavilySearchPayload({ query: "Synthetic one shot" });
  let fetchCount = 0;
  await withProviderDispatchCapability({
    ...scope(fixture), requestPayload: payload,
    inMemoryTransport: async () => { fetchCount += 1; return okSearchResponse(); },
  }, async ({ capability, fetchImpl }) => {
    const options = {
      capability, fetchImpl, capabilityScope: scope(fixture),
      baseUrl: "https://api.tavily.com", apiKey: "synthetic", projectId: "synthetic", payload,
    };
    const response = await dispatchV2B5TavilyRequest(options);
    assert.equal(response.status, "provider_response_received");
    await assert.rejects(dispatchV2B5TavilyRequest(options), /provider_execution_capability_consumed_or_stale/u);
  });
  assert.equal(fetchCount, 1);
});

test("retired canary route hard-fails before caller transport", async () => {
  let fetchCount = 0;
  const adapter = new OpenAICompatibleRelayCanaryAdapter({
    baseUrl: "https://relay.example/v1", approvedHost: "relay.example",
    apiKey: "synthetic", model: "synthetic",
    fetchImpl: async () => { fetchCount += 1; return okSearchResponse(); },
  });
  await assert.rejects(adapter.execute({}), /historical_provider_execution_retired/u);
  assert.equal(fetchCount, 0);
});

function trackedFixture(options = {}) {
  const fixture = makeB3ProviderFixture(options);
  roots.push(fixture.root);
  return fixture;
}

function scope(fixture) {
  return { routeId: "v2b8_search", sinkId: "sink_v2b5_tavily_search", phase: "v2b8", root: fixture.root };
}

function okSearchResponse() {
  return {
    ok: true,
    status: 200,
    headers: { get: (name) => name.toLocaleLowerCase("en-US") === "content-type" ? "application/json" : null },
    arrayBuffer: async () => Buffer.from(JSON.stringify({ request_id: "synthetic-request", results: [] })),
  };
}
