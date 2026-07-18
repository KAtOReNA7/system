import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  V2B6_ADAPTER_VERSION,
  buildV2B6CapabilityPayload,
  buildV2B6ClaimsPayload,
  buildV2B6EntityPayload,
  buildV2B6FullPayload,
  classifyV2B6ModelBinding,
  mergeV2B6SplitOutput,
  normalizeV2B6ExtractionOutput,
  parseV2B6StructuredResponse,
  resolveV2B6TimeoutMs,
} from "../src/domain/m2V2EvidencePilot/relayExtractionAdapterV2B6.js";
import { sourceIdForV2B5Url } from "../src/domain/m2V2EvidencePilot/sourceRecordV2B5.js";

const SOURCE_URL = "https://example.com/synthetic";
const SOURCE_ID = sourceIdForV2B5Url(SOURCE_URL);

test("V2-B.6 timeout defaults to 120 seconds and enforces configured range", () => {
  assert.equal(resolveV2B6TimeoutMs(undefined), 120_000);
  assert.equal(resolveV2B6TimeoutMs("30000"), 30_000);
  assert.equal(resolveV2B6TimeoutMs("180000"), 180_000);
  assert.throws(() => resolveV2B6TimeoutMs("25000"), /out_of_range/u);
  assert.throws(() => resolveV2B6TimeoutMs("180001"), /out_of_range/u);
});

test("V2-B.6 parser supports all approved response carriers", () => {
  const value = { ok: true };
  const fixtures = [
    { output_parsed: value },
    { output_text: JSON.stringify(value) },
    { output: [{ content: [{ type: "output_text", text: JSON.stringify(value) }] }] },
    { choices: [{ message: { content: JSON.stringify(value) } }] },
    { response: { output_text: JSON.stringify(value) } },
    { output_text: `\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\`\n` },
  ];
  for (const fixture of fixtures) assert.deepEqual(parseV2B6StructuredResponse(fixture).value, value);
});

test("V2-B.6 fenced JSON parser rejects surrounding prose or multiple fences", () => {
  assert.equal(parseV2B6StructuredResponse({ output_text: "prose\n```json\n{\"ok\":true}\n```" }).value, null);
  assert.equal(parseV2B6StructuredResponse({ output_text: "```json\n{\"ok\":true}\n```\n```json\n{\"ok\":true}\n```" }).value, null);
});

test("V2-B.6 binding is exact, approved alias, unreported, or mismatch without guessing", () => {
  assert.equal(classifyV2B6ModelBinding("gpt-5.6-luna", "gpt-5.6-luna").status, "exact");
  assert.equal(classifyV2B6ModelBinding("gpt-5.6-luna", "relay-luna", { "gpt-5.6-luna": ["relay-luna"] }).status, "approved_alias");
  assert.equal(classifyV2B6ModelBinding("gpt-5.6-luna", null).status, "unreported");
  assert.equal(classifyV2B6ModelBinding("gpt-5.6-luna", "terra").status, "mismatch");
});

test("V2-B.6 payloads omit reasoning and prohibit search tools", () => {
  const work = { title: "Synthetic Work", author: "Synthetic Author", sourceType: "publication" };
  const sourceRecords = [sourceRecord()];
  const payloads = [
    buildV2B6CapabilityPayload("E0", "gpt-5.6-luna"),
    buildV2B6EntityPayload({ model: "gpt-5.6-luna", mode: "local_json", work, sourceRecords }),
    buildV2B6ClaimsPayload({ model: "gpt-5.6-luna", mode: "server_strict", work, sourceRecords, entityResolution: resolvedEntities() }),
    buildV2B6FullPayload({ model: "gpt-5.6-luna", mode: "server_strict", work, sourceRecords }),
  ];
  for (const payload of payloads) {
    assert.equal(Object.hasOwn(payload, "reasoning"), false);
    assert.equal(Object.hasOwn(payload, "tools"), false);
    assert.equal(payload.store, false);
    assert.ok(payload.max_output_tokens <= 1_600);
  }
});

test("V2-B.6 split output merges entity and claim stages into the full contract", () => {
  const merged = mergeV2B6SplitOutput(
    { schemaVersion: "m2.v2.evidence-extraction-output.v0.2", entityResolution: resolvedEntities(), limitations: [] },
    { schemaVersion: "m2.v2.evidence-extraction-output.v0.2", claims: [claim()], contradictions: [], limitations: [] },
  );
  const normalized = normalizeV2B6ExtractionOutput(merged);
  assert.equal(normalized.value.claims.length, 1);
  assert.equal(normalized.value.entityResolution.work.status, "high");
  assert.equal(normalized.value.schemaVersion, "m2.v2.evidence-extraction-output.v0.2");
});

test("V2-B.6 carrier normalization repairs IDs and inactive structured-value fields only", () => {
  const value = {
    schemaVersion: "m2.v2.evidence-extraction-output.v0.2",
    entityResolution: resolvedEntities(),
    claims: [{ ...claim(), claimId: "1", structuredValue: { ...claim().structuredValue, booleanValue: false } }],
    contradictions: [], limitations: [],
  };
  const normalized = normalizeV2B6ExtractionOutput(value);
  assert.equal(normalized.value.claims[0].claimId, "clm_1");
  assert.equal(normalized.value.claims[0].structuredValue.booleanValue, null);
  assert.ok(normalized.coercions.includes("claim_id_carrier_normalized"));
});

test("V2-B.6 runtime has no Tavily provider import and adapter version is frozen", () => {
  const source = readFileSync(new URL("../src/domain/m2V2EvidencePilot/v2b6Runtime.js", import.meta.url), "utf8");
  assert.equal(/TavilyStructuredSearchProvider|tavilySearchProviderV2B5/u.test(source), false);
  assert.equal(V2B6_ADAPTER_VERSION, "m2-v2-relay-extraction-adapter-v0.2");
});

function sourceRecord() {
  return {
    schema: "m2.v2.evidence-source-record.v0.2",
    sourceId: SOURCE_ID,
    queryId: "synthetic",
    title: "Synthetic Work by Synthetic Author",
    url: SOURCE_URL,
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

function resolvedEntities() {
  return {
    work: { status: "high", confidence: 1, supportingSourceIds: [SOURCE_ID] },
    author: { status: "high", confidence: 1, supportingSourceIds: [SOURCE_ID] },
  };
}

function claim() {
  return {
    claimId: "clm_1",
    claimType: "work_identity",
    structuredValue: { valueType: "text", textValue: "Synthetic Work", dateValue: null, numberValue: null, booleanValue: null },
    supportingSourceIds: [SOURCE_ID],
    confidence: 0.9,
    eventTime: null,
    contradictionKey: null,
    limitations: [],
  };
}
