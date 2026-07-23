import assert from "node:assert/strict";
import test from "node:test";
import {
  V2B2_ADAPTER_VERSION,
  V2B2_PROMPT_VERSION,
  V2B2_SCHEMA_VERSION,
  buildV2B2ExtractionPayload,
  buildV2B2PhysicalRequestKey,
  buildV2B2SearchPayload,
  classifyLegacyCanaryReceipts,
  joinV2B2CitationLineage,
  normalizeV2B2ExtractionResponse,
  normalizeV2B2SearchResponse,
  profileV2B2ResponseShape,
  validateV2B2StructuredOutput,
} from "../src/domain/m2V2EvidencePilot/relayV2B2Core.js";
import { createRelayStageExecutor } from "../src/domain/m2V2EvidencePilot/v2b2Runtime.js";

test("search and strict extraction are separate bounded Responses requests", () => {
  const input = {
    model: "gpt-5.6-terra",
    workTitle: "Synthetic Work",
    authorByline: "Synthetic Author",
    sourceType: "publication",
    queryIntent: "verify public evidence",
  };
  const search = buildV2B2SearchPayload(input);
  assert.deepEqual(search.tools, [{ type: "web_search" }]);
  assert.equal(search.text, undefined);
  assert.equal(search.max_output_tokens, 700);

  const normalized = normalizeV2B2SearchResponse(responsesSearchFixture());
  assert.equal(normalized.valid, true);
  const extraction = buildV2B2ExtractionPayload({ ...input, search: normalized, citationRegistry: normalized.citationRegistry });
  assert.equal(extraction.tools, undefined);
  assert.equal(extraction.text.format.type, "json_schema");
  assert.equal(extraction.text.format.strict, true);
  assert.equal(extraction.max_output_tokens, 1200);
  assert.match(extraction.input, new RegExp(normalized.citationRegistry[0].citationId, "u"));
});

test("direct, nested, message and completed-tool citations normalize only from trusted carriers", () => {
  const response = responsesSearchFixture();
  response.output[1].content[0].annotations.push({
    type: "url_citation",
    url_citation: { url: "https://nested.example/two", title: "Nested", start_index: 0, end_index: 4 },
  });
  response.output[1].annotations = [{ type: "url_citation", url: "https://message.example/three", title: "Message" }];
  response.output[0].action.sources = [{ url: "https://tool.example/four", title: "Tool" }];
  response.untrusted = { type: "url_citation", url: "https://untrusted.example/five" };

  const normalized = normalizeV2B2SearchResponse(response);
  assert.equal(normalized.valid, true);
  assert.equal(normalized.citationRegistry.length, 4);
  assert.equal(normalized.citationRegistry.some((item) => item.url.includes("untrusted.example")), false);
  assert.equal(new Set(normalized.citationRegistry.map((item) => item.citationId)).size, 4);
});

test("invalid citation spans fail closed and shape profile never persists response content", () => {
  const response = responsesSearchFixture();
  response.output[1].content[0].annotations[0].end_index = 10_000;
  const normalized = normalizeV2B2SearchResponse(response);
  assert.equal(normalized.valid, false);
  assert.ok(normalized.issues.includes("citation_span_invalid"));

  const profile = profileV2B2ResponseShape(response, {
    httpStatus: 200,
    contentType: "text/plain; charset=utf-8",
    rawByteLength: 1234,
    parseStatus: "json",
  });
  assert.equal(profile.rawResponsePersisted, false);
  assert.deepEqual(profile.annotationLocationTemplates, ["output[*].action.sources[*]", "output[*].content[*].annotations[*]"]);
  assert.equal(JSON.stringify(profile).includes("Synthetic factual note"), false);
  assert.equal(JSON.stringify(profile).includes("direct.example"), false);
  assert.match(profile.shapeDigest, /^[a-f0-9]{64}$/u);
});

test("strict extraction uses citationId and local join injects source lineage", () => {
  const search = normalizeV2B2SearchResponse(responsesSearchFixture());
  const citationId = search.citationRegistry[0].citationId;
  const structured = structuredFixture(citationId);
  const extraction = normalizeV2B2ExtractionResponse({
    model: "gpt-5.6-terra",
    status: "completed",
    output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(structured) }] }],
    usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 },
  });
  assert.equal(extraction.valid, true);
  assert.equal(extraction.usage.totalTokens, 30);
  const lineage = joinV2B2CitationLineage({ search, extraction });
  assert.equal(lineage.valid, true);
  assert.equal(lineage.boundCandidateCount, 1);
  assert.equal(lineage.supportedCandidateCount, 1);
  assert.equal(lineage.claimSupportUnverifiedCount, 0);
  assert.equal(lineage.joinedCandidates[0].sourceDomain, "direct.example");
  assert.equal(lineage.joinedCandidates[0].sourceUrl, "https://direct.example/one");

  extraction.structuredOutput.evidenceCandidates[0].citationId = "cit_00000000000000000000";
  assert.equal(joinV2B2CitationLineage({ search, extraction }).valid, false);
});

test("discriminated structuredValue rejects every non-null inactive field", () => {
  const value = structuredFixture("cit_0123456789abcdef0123");
  assert.equal(validateV2B2StructuredOutput(value).valid, true);
  value.evidenceCandidates[0].structuredValue.dateValue = "2026-01-01";
  const invalid = validateV2B2StructuredOutput(value);
  assert.equal(invalid.valid, false);
  assert.ok(invalid.issues.some((item) => item.endsWith("dateValue_must_be_null")));
});

test("physical request keys isolate model, stage and adapter versions", () => {
  const base = {
    parentManifestDigest: "a".repeat(64),
    canaryManifestDigest: "b".repeat(64),
    logicalTaskKey: "c".repeat(64),
    model: "gpt-5.6-luna",
    stage: "search",
    adapterVersion: V2B2_ADAPTER_VERSION,
    promptVersion: V2B2_PROMPT_VERSION,
    schemaVersion: V2B2_SCHEMA_VERSION,
  };
  const keys = [
    buildV2B2PhysicalRequestKey(base),
    buildV2B2PhysicalRequestKey({ ...base, model: "gpt-5.6-terra" }),
    buildV2B2PhysicalRequestKey({ ...base, stage: "extraction" }),
    buildV2B2PhysicalRequestKey({ ...base, promptVersion: "next" }),
  ];
  assert.equal(new Set(keys).size, 4);
  assert.ok(keys.every((key) => /^[a-f0-9]{64}$/u.test(key)));
});

test("legacy relay success is revalidated instead of treated as model evidence quality", () => {
  const valid = legacyStructuredFixture();
  const invalid = structuredClone(valid);
  invalid.evidenceCandidates[0].structuredValue.dateValue = "2026-01-01";
  assert.deepEqual(classifyLegacyCanaryReceipts([
    { status: "success", structuredResponse: valid },
    { status: "success", structuredResponse: invalid },
    { status: "transport_error", structuredResponse: null },
  ]), ["local_strict_success", "relay_success_local_schema_failure", "provider_or_request_failure"]);
});

test("legacy V2B2 stage executor is retired before caller transport", async () => {
  const bodies = [responsesSearchFixture()];
  let fetchCount = 0;
  const executor = createRelayStageExecutor({
    root: ".",
    env: {
      M2_V2_EVIDENCE_PROVIDER: "openai_compatible_relay",
      OPENAI_BASE_URL: "https://relay.example/v1",
      M2_V2_APPROVED_RELAY_HOST: "relay.example",
      OPENAI_API_KEY: "synthetic-test-key",
    },
    fetchImpl: async () => { fetchCount += 1; return responseFrom(bodies.shift()); },
  });
  const baseItem = {
    requestKey: "a".repeat(64),
    logicalTaskKey: "b".repeat(64),
    workReference: "private-work-reference",
    identityDigest: "c".repeat(64),
    runKind: "benchmark",
    queryId: "combined_1",
    model: "gpt-5.6-terra",
    title: "Synthetic Work",
    author: "Synthetic Author",
    sourceType: "publication",
    queryText: "verify public evidence",
  };
  await assert.rejects(
    executor({ item: { ...baseItem, stage: "search" }, manifestDigest: "d".repeat(64) }),
    /historical_provider_execution_retired/u,
  );
  assert.equal(fetchCount, 0);
});

function responsesSearchFixture() {
  return {
    model: "gpt-5.6-terra",
    status: "completed",
    output: [
      { type: "web_search_call", status: "completed", action: { type: "search", sources: [] } },
      {
        type: "message",
        content: [{
          type: "output_text",
          text: "Synthetic factual note",
          annotations: [{
            type: "url_citation",
            url: "https://direct.example/one",
            title: "Direct",
            start_index: 0,
            end_index: 9,
          }],
        }],
      },
    ],
    usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 },
  };
}

function responseFrom(body) {
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  return {
    ok: true,
    status: 200,
    headers: { get: (name) => name.toLocaleLowerCase("en-US") === "content-type" ? "text/plain; charset=utf-8" : null },
    arrayBuffer: async () => bytes.buffer,
  };
}

function structuredFixture(citationId) {
  return {
    queryOutcome: "success",
    workIdentity: { status: "high", matchedTitle: "Synthetic Work", matchedAuthor: "Synthetic Author", citationIds: [citationId] },
    authorIdentity: { status: "high", matchedAuthor: "Synthetic Author", citationIds: [citationId] },
    authorWorkRelationshipConfirmed: true,
    evidenceCandidates: [{
      citationId,
      claimText: "Synthetic factual note",
      availableAt: "2026-01-01T00:00:00.000Z",
      eventTime: null,
      claimType: "work_identity",
      structuredValue: { valueType: "text", textValue: "Synthetic factual note", dateValue: null, numberValue: null, booleanValue: null },
      confidence: 0.9,
      entitySupport: "both",
      sourceQualityHint: "official",
    }],
  };
}

function legacyStructuredFixture() {
  return {
    queryOutcome: "success",
    workIdentity: { status: "high", matchedTitle: "Synthetic Work", matchedAuthor: "Synthetic Author", basis: "public source" },
    authorIdentity: { status: "high", matchedAuthor: "Synthetic Author", basis: "public source" },
    authorWorkRelationshipConfirmed: true,
    evidenceCandidates: [{
      sourceUrl: "https://example.test/source",
      sourceTitle: "Source",
      sourceDomain: "example.test",
      availableAt: null,
      eventTime: null,
      claimType: "work_identity",
      structuredValue: { valueType: "text", textValue: "verified", dateValue: null, numberValue: null, booleanValue: null },
      confidence: 0.9,
      entitySupport: "both",
      sourceQualityHint: "official",
    }],
  };
}
