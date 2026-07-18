import assert from "node:assert/strict";
import test from "node:test";
import {
  assertResponsesRetention,
  bindProviderTransport,
  isForbiddenNetworkHost,
} from "../src/domain/m2V2EvidencePilot/providerTransportSecurity.js";
import { dispatchV2B6RelayRequest } from "../src/domain/m2V2EvidencePilot/relayExtractionAdapterV2B6.js";
import {
  buildV2B5TavilySearchPayload,
  dispatchV2B5TavilyRequest,
} from "../src/domain/m2V2EvidencePilot/tavilySearchProviderV2B5.js";

const SAFE_PAYLOAD = Object.freeze({ model: "synthetic-model", input: "synthetic", store: false });

test("provider transport requires a separately approved exact HTTPS host", () => {
  assert.throws(
    () => bindProviderTransport({ baseUrl: "http://relay.example/v1", approvedHost: "relay.example" }),
    /provider_https_required/u,
  );
  assert.throws(
    () => bindProviderTransport({ baseUrl: "https://relay.example/v1", approvedHost: "other.example" }),
    /provider_host_binding_mismatch/u,
  );
  assert.throws(
    () => bindProviderTransport({ baseUrl: "https://user:secret@relay.example/v1", approvedHost: "relay.example" }),
    /provider_url_userinfo_forbidden/u,
  );
  assert.throws(
    () => bindProviderTransport({ baseUrl: "https://relay.example/v1?redirect=evil", approvedHost: "relay.example" }),
    /provider_url_query_forbidden/u,
  );
  assert.throws(
    () => bindProviderTransport({ baseUrl: "https://relay.example/v1#fragment", approvedHost: "relay.example" }),
    /provider_url_fragment_forbidden/u,
  );
  assert.deepEqual(bindProviderTransport({
    baseUrl: "https://relay.example/v1/",
    approvedHost: "relay.example",
  }), {
    baseUrl: "https://relay.example/v1",
    approvedHost: "relay.example",
    endpointUrl: "https://relay.example/v1/responses",
    redirect: "manual",
  });
});

test("provider transport rejects local and private network destinations", () => {
  for (const host of [
    "localhost",
    "service.localhost",
    "127.0.0.1",
    "10.0.0.1",
    "169.254.1.1",
    "172.16.0.1",
    "192.168.1.1",
    "::1",
    "fd00::1",
    "fe80::1",
    "::ffff:7f00:1",
    "::ffff:a00:1",
    "::ffff:c0a8:101",
  ]) {
    assert.equal(isForbiddenNetworkHost(host), true, host);
  }
  assert.equal(isForbiddenNetworkHost("relay.example"), false);
  assert.equal(isForbiddenNetworkHost("2001:4860:4860::8888"), false);
  assert.equal(bindProviderTransport({
    baseUrl: "https://[2001:4860:4860::8888]/v1",
    approvedHost: "[2001:4860:4860::8888]",
  }).endpointUrl, "https://[2001:4860:4860::8888]/v1/responses");
  assert.throws(
    () => bindProviderTransport({ baseUrl: "https://127.0.0.1/v1", approvedHost: "127.0.0.1" }),
    /provider_local_or_private_host_forbidden/u,
  );
});

test("Responses payloads fail closed unless store is explicitly false", () => {
  assert.equal(assertResponsesRetention(SAFE_PAYLOAD), true);
  assert.throws(() => assertResponsesRetention({ model: "synthetic" }), /provider_responses_store_must_be_false/u);
  assert.throws(() => assertResponsesRetention({ model: "synthetic", store: true }), /provider_responses_store_must_be_false/u);
});

test("relay dispatch rejects unsafe configuration and retention before fetch", async () => {
  let fetchCount = 0;
  const fetchImpl = async () => {
    fetchCount += 1;
    throw new Error("fetch_must_not_run");
  };
  await assert.rejects(dispatchV2B6RelayRequest({
    fetchImpl,
    baseUrl: "http://relay.example/v1",
    approvedHost: "relay.example",
    apiKey: "synthetic-secret",
    payload: SAFE_PAYLOAD,
  }), /provider_https_required/u);
  await assert.rejects(dispatchV2B6RelayRequest({
    fetchImpl,
    baseUrl: "https://relay.example/v1",
    approvedHost: "relay.example",
    apiKey: "synthetic-secret",
    payload: { model: "synthetic" },
  }), /provider_responses_store_must_be_false/u);
  await assert.rejects(dispatchV2B6RelayRequest({
    fetchImpl,
    baseUrl: "https://[::ffff:7f00:1]/v1",
    approvedHost: "[::ffff:7f00:1]",
    apiKey: "synthetic-secret",
    payload: SAFE_PAYLOAD,
  }), /provider_local_or_private_host_forbidden/u);
  assert.equal(fetchCount, 0);
});

test("relay dispatch disables redirect following and never exposes bearer secret", async () => {
  const secret = "synthetic-secret-never-log";
  let observed = null;
  const response = await dispatchV2B6RelayRequest({
    fetchImpl: async (url, options) => {
      observed = { url, options };
      return {
        ok: false,
        status: 302,
        headers: { get: (name) => name.toLocaleLowerCase("en-US") === "location" ? "https://evil.example/steal" : null },
        arrayBuffer: async () => Buffer.alloc(0),
      };
    },
    baseUrl: "https://relay.example/v1",
    approvedHost: "relay.example",
    apiKey: secret,
    payload: SAFE_PAYLOAD,
  });
  assert.equal(observed.url, "https://relay.example/v1/responses");
  assert.equal(observed.options.redirect, "manual");
  assert.equal(JSON.parse(observed.options.body).store, false);
  assert.equal(response.status, "transport_error");
  assert.equal(JSON.stringify(response).includes(secret), false);
  assert.equal(response.rawResponsePersisted, false);
});

test("Tavily dispatch rejects unsafe transport bindings before fetch without exposing the key", async () => {
  const secret = "synthetic-tavily-secret-never-log";
  let fetchCount = 0;
  const fetchImpl = async () => {
    fetchCount += 1;
    throw new Error("fetch_must_not_run");
  };
  const payload = buildV2B5TavilySearchPayload({ query: "Synthetic public documentation" });
  const unsafeCases = [
    ["http://api.tavily.com", /provider_https_required/u],
    ["https://other.example", /provider_host_binding_mismatch/u],
    ["https://user:password@api.tavily.com", /provider_url_userinfo_forbidden/u],
    ["https://api.tavily.com?next=https://evil.example", /provider_url_query_forbidden/u],
  ];
  for (const [baseUrl, expected] of unsafeCases) {
    await assert.rejects(
      dispatchV2B5TavilyRequest({ fetchImpl, baseUrl, apiKey: secret, payload }),
      (error) => {
        assert.match(String(error?.message ?? error), expected);
        assert.equal(String(error?.message ?? error).includes(secret), false);
        return true;
      },
    );
  }
  assert.equal(fetchCount, 0);
});

test("Tavily approved HTTPS dispatch fixes the endpoint and disables redirect following", async () => {
  const secret = "synthetic-tavily-secret-never-log";
  let observed = null;
  const response = await dispatchV2B5TavilyRequest({
    fetchImpl: async (url, options) => {
      observed = { url, options };
      return {
        ok: true,
        status: 200,
        headers: { get: (name) => name.toLocaleLowerCase("en-US") === "content-type" ? "application/json" : null },
        arrayBuffer: async () => Buffer.from(JSON.stringify({ request_id: "synthetic-request", results: [] })),
      };
    },
    baseUrl: "https://api.tavily.com",
    apiKey: secret,
    projectId: "synthetic-project",
    payload: buildV2B5TavilySearchPayload({ query: "Synthetic public documentation" }),
  });
  assert.equal(observed.url, "https://api.tavily.com/search");
  assert.equal(observed.options.redirect, "manual");
  assert.equal(response.status, "provider_response_received");
  assert.equal(JSON.stringify(response).includes(secret), false);
  assert.equal(response.rawResponsePersisted, false);
});

test("Tavily dispatch rejects redirects before reading the response body", async () => {
  const secret = "synthetic-tavily-secret-never-log";
  let bodyReadCount = 0;
  let observedRedirect = null;
  const response = await dispatchV2B5TavilyRequest({
    fetchImpl: async (_url, options) => {
      observedRedirect = options.redirect;
      return {
        ok: false,
        status: 302,
        headers: { get: (name) => name.toLocaleLowerCase("en-US") === "location" ? "https://evil.example/steal" : null },
        arrayBuffer: async () => {
          bodyReadCount += 1;
          return Buffer.from(secret);
        },
      };
    },
    baseUrl: "https://api.tavily.com",
    apiKey: secret,
    payload: buildV2B5TavilySearchPayload({ query: "Synthetic public documentation" }),
  });
  assert.equal(observedRedirect, "manual");
  assert.equal(bodyReadCount, 0);
  assert.equal(response.status, "transport_error");
  assert.equal(response.errorCode, "provider_redirect_binding_mismatch");
  assert.equal(response.responseByteLength, 0);
  assert.equal(JSON.stringify(response).includes(secret), false);
});
