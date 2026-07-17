import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_V2B3_SOURCE_GOVERNANCE_POLICY,
  V2B3_EVIDENCE_FIELDS,
  V2B3_SOURCE_RECORD_FIELDS,
  buildV2B3ExtractionPayload,
  buildV2B3SearchPayload,
  createV2B3SourceGovernancePolicy,
  evaluateV2B3SourceGovernance,
  normalizeV2B3ExtractionResponse,
  normalizeV2B3SearchResponse,
  parseV2B3Citations,
  validateV2B3SourceGovernancePolicy,
  validateV2B3SourceRecord,
} from "../src/domain/m2V2EvidencePilot/evidencePipelineV2B3.js";
import {
  extractionResponseFixture,
  relayNestedAnnotationFixture,
  responsesDirectAnnotationFixture,
  syntheticSearchMeta,
} from "./fixtures/m2V2EvidencePipelineV2B3Fixtures.js";

function normalizeDirectSearch() {
  return normalizeV2B3SearchResponse(responsesDirectAnnotationFixture(), syntheticSearchMeta());
}

test("search layer plans discovery and returns source records without final claims", () => {
  const payload = buildV2B3SearchPayload({
    model: "synthetic-search-model",
    title: "Synthetic Work",
    author: "Synthetic Author",
    sourceType: "publication",
    intent: "find a public publication record",
  });
  assert.deepEqual(payload.tools, [{ type: "web_search" }]);
  assert.equal(payload.store, false);
  assert.equal(payload.text, undefined);
  assert.match(payload.input, /Do not synthesize final claims/u);

  const result = normalizeDirectSearch();
  assert.equal(result.valid, true);
  assert.equal(result.finalClaimGenerated, false);
  assert.equal(result.sourceRecordCount, 1);
  assert.deepEqual(Object.keys(result.sourceRecords[0]), V2B3_SOURCE_RECORD_FIELDS);
  assert.equal("claim" in result.sourceRecords[0], false);
  assert.equal(result.rawResponsePersisted, false);
});

test("citation parser supports direct Responses annotations without URL-in-text alignment", () => {
  const response = responsesDirectAnnotationFixture();
  const text = response.output[1].content[0].text;
  assert.equal(text.includes("https://research.example/article-one"), false);
  const parsed = parseV2B3Citations(response);
  assert.equal(parsed.issues.length, 0);
  assert.equal(parsed.citations.length, 1);
  assert.equal(parsed.citations[0].url, "https://research.example/article-one");
  assert.equal(parsed.citations[0].citation.carrier, "responses_content_annotation");
});

test("citation parser supports relay-nested annotations and maps deterministic sourceIds", () => {
  const first = normalizeV2B3SearchResponse(relayNestedAnnotationFixture(), syntheticSearchMeta());
  const second = normalizeV2B3SearchResponse(relayNestedAnnotationFixture(), syntheticSearchMeta());
  assert.equal(first.valid, true);
  assert.equal(first.sourceRecords[0].citation.carrier, "relay_nested_citation");
  assert.equal(first.sourceRecords[0].sourceId, second.sourceRecords[0].sourceId);
  assert.equal(first.sourceRecords[0].providerReceipt.responseId, "resp_synthetic_nested");
});

test("web search action sources map directly to source records", () => {
  const response = responsesDirectAnnotationFixture();
  response.output[0].action.sources = [{
    url: "https://tool-source.example/source-three",
    title: "Synthetic Tool Source",
    snippet: "Synthetic source mapping fixture.",
  }];
  response.output[1].content[0].annotations = [];
  const result = normalizeV2B3SearchResponse(response, syntheticSearchMeta());
  assert.equal(result.valid, true);
  assert.equal(result.sourceRecordCount, 1);
  assert.equal(result.sourceRecords[0].citation.carrier, "web_search_action_source");
  assert.equal(result.sourceRecords[0].domain, "tool-source.example");
});

test("sourceId and citationId are bound to the canonical source URL", () => {
  const source = structuredClone(normalizeDirectSearch().sourceRecords[0]);
  assert.equal(validateV2B3SourceRecord(source).valid, true);
  source.sourceId = "src_00000000000000000000";
  assert.ok(validateV2B3SourceRecord(source).issues.includes("source_id_url_mismatch"));
  source.sourceId = normalizeDirectSearch().sourceRecords[0].sourceId;
  source.citation.citationId = "cit_00000000000000000000";
  assert.ok(validateV2B3SourceRecord(source).issues.includes("citation_id_url_mismatch"));
});

test("extraction layer receives only source records and emits the strict evidence schema", () => {
  const source = normalizeDirectSearch().sourceRecords[0];
  const payload = buildV2B3ExtractionPayload({ model: "synthetic-extraction-model", sourceRecords: [source] });
  assert.equal(payload.tools, undefined);
  assert.equal(payload.store, false);
  assert.match(payload.input, /Extract evidence only from SOURCE_RECORDS/u);
  assert.equal(payload.text.format.type, "json_schema");
  assert.deepEqual(payload.text.format.schema.properties.evidence.items.required, V2B3_EVIDENCE_FIELDS);
});

test("extraction rejects missing and unknown sourceIds", () => {
  const source = normalizeDirectSearch().sourceRecords[0];
  const missing = extractionResponseFixture(source.sourceId, { sourceIds: [] });
  const missingResult = normalizeV2B3ExtractionResponse(missing, { sourceRecords: [source] });
  assert.equal(missingResult.contractValid, false);
  assert.equal(missingResult.rejectedEvidenceCount, 1);

  const unknown = extractionResponseFixture("src_00000000000000000000");
  const unknownResult = normalizeV2B3ExtractionResponse(unknown, { sourceRecords: [source] });
  assert.equal(unknownResult.contractValid, false);
  assert.ok(unknownResult.evaluatedEvidence[0].rejectionReasons.includes("source_id_unknown"));
});

test("source record without a valid citation is rejected before extraction", () => {
  const source = structuredClone(normalizeDirectSearch().sourceRecords[0]);
  source.citation = null;
  assert.throws(
    () => buildV2B3ExtractionPayload({ model: "synthetic-extraction-model", sourceRecords: [source] }),
    /source_citation_missing/u,
  );
});

test("missing evidence time remains accepted research evidence but is never model eligible", () => {
  const source = normalizeDirectSearch().sourceRecords[0];
  const policy = createV2B3SourceGovernancePolicy({
    researchDomains: [source.domain],
    modelDomains: [source.domain],
  });
  const response = extractionResponseFixture(source.sourceId, { eventTime: null, availableAt: null });
  const result = normalizeV2B3ExtractionResponse(response, { sourceRecords: [source], governancePolicy: policy });
  assert.equal(result.contractValid, true);
  assert.equal(result.evaluatedEvidence[0].accepted, true);
  assert.equal(result.evaluatedEvidence[0].researchEligible, true);
  assert.equal(result.evaluatedEvidence[0].modelEligible, false);
  assert.ok(result.evaluatedEvidence[0].modelEligibilityReasons.includes("time_missing"));
  assert.ok(result.evaluatedEvidence[0].modelEligibilityReasons.includes("available_at_missing"));
});

test("research and model allowlists are separate and model allowlist defaults empty", () => {
  assert.equal(validateV2B3SourceGovernancePolicy(DEFAULT_V2B3_SOURCE_GOVERNANCE_POLICY).valid, true);
  assert.deepEqual(DEFAULT_V2B3_SOURCE_GOVERNANCE_POLICY.researchAllowlist.approvedDomainEntries, []);
  assert.deepEqual(DEFAULT_V2B3_SOURCE_GOVERNANCE_POLICY.modelAllowlist.approvedDomainEntries, []);

  const source = normalizeDirectSearch().sourceRecords[0];
  const researchOnly = createV2B3SourceGovernancePolicy({ researchDomains: [source.domain] });
  const governance = evaluateV2B3SourceGovernance([source], researchOnly);
  assert.equal(governance.researchAllowed, true);
  assert.equal(governance.modelAllowed, false);
  assert.equal(governance.implicitPromotionUsed, false);

  const researchResult = normalizeV2B3ExtractionResponse(extractionResponseFixture(source.sourceId), {
    sourceRecords: [source],
    governancePolicy: researchOnly,
  });
  assert.equal(researchResult.evaluatedEvidence[0].researchEligible, true);
  assert.equal(researchResult.evaluatedEvidence[0].modelEligible, false);

  const explicitlyApproved = createV2B3SourceGovernancePolicy({
    researchDomains: [source.domain],
    modelDomains: [source.domain],
  });
  const approvedResult = normalizeV2B3ExtractionResponse(extractionResponseFixture(source.sourceId), {
    sourceRecords: [source],
    governancePolicy: explicitlyApproved,
  });
  assert.equal(approvedResult.evaluatedEvidence[0].modelEligible, true);
});
