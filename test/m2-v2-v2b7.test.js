import test from "node:test";
import assert from "node:assert/strict";
import {
  V2B7_MAX_OUTPUT_TOKENS,
  V2B7_MAX_REPAIRS,
  V2B7_MODEL_ID,
  V2B7_NAMESPACE,
  V2B7_RELAY_REQUEST_CAP,
  V2B7_TAVILY_REQUEST_CAP,
} from "../src/domain/m2V2EvidencePilot/v2b7Contract.js";
import {
  __test,
  buildV2B7ExtractionPayload,
  evaluateV2B7Canary,
  isV2B7Repairable,
  selectV2B7EffectiveReceipt,
  validateV2B7ExtractionPayload,
} from "../src/domain/m2V2EvidencePilot/v2b7Runtime.js";
import { sourceIdForV2B5Url } from "../src/domain/m2V2EvidencePilot/sourceRecordV2B5.js";

test("V2-B.7 extraction payload is Terra-only full/server_strict with no reasoning, tools, URL, or private IDs", () => {
  const payload = buildV2B7ExtractionPayload({ work: work(1), sourceRecords: [source("a", "2026-07-18T00:00:00.000Z")] });
  assert.equal(payload.model, V2B7_MODEL_ID);
  assert.equal(payload.store, false);
  assert.equal(payload.max_output_tokens, V2B7_MAX_OUTPUT_TOKENS);
  assert.equal(payload.text.format.type, "json_schema");
  assert.equal(payload.text.format.strict, true);
  assert.equal(Object.hasOwn(payload, "reasoning"), false);
  assert.equal(Object.hasOwn(payload, "tools"), false);
  assert.equal(/https?:\/\/|standardWorkId|identityDigest|canarySlotId|web_search/iu.test(JSON.stringify(payload)), false);
});

test("V2-B.7 extraction projection permits only six approved fields and a 3000-character snippet budget", () => {
  const sources = Array.from({ length: 6 }, (_, index) => ({
    ...source(String(index), "2026-07-18T00:00:00.000Z"),
    title: index === 0 ? "source https://example.invalid/title" : `source-${index}`,
    snippet: index === 0 ? `prefix https://example.invalid/path ${"x".repeat(1_000)}` : "x".repeat(1_000),
  }));
  const rows = __test.projectV2B7ExtractionSources(sources);
  assert.equal(rows.length, 6);
  assert.equal(rows.reduce((total, row) => total + row.snippet.length, 0), 3_000);
  assert.deepEqual(Object.keys(rows[0]).sort(), ["availableAt", "capturedAt", "domain", "snippet", "sourceId", "title"]);
  assert.equal(/https?:\/\//u.test(JSON.stringify(rows)), false);
  const payload = buildV2B7ExtractionPayload({ work: work(1), sourceRecords: sources });
  assert.equal(validateV2B7ExtractionPayload(payload, { records: rows }).valid, true);
});

test("V2-B.7 permits one schema repair trigger but rejects safety, entity, conflict, source, and time failures", () => {
  assert.equal(isV2B7Repairable(physicalReceipt({ issues: ["strict_json_parse_failed"], structuredValid: false })), true);
  for (const issue of ["private_leak_detected", "fabricated_source_id", "model_generated_url", "work_entity_unresolved", "conflict_unresolved", "prohibited_source", "claim_exceeds_snippet_support", "source_time_missing"]) {
    assert.equal(isV2B7Repairable(physicalReceipt({ issues: [issue], structuredValid: false })), false, issue);
  }
});

test("V2-B.7 effective selection prefers a successful repair, then a successful primary", () => {
  const searchRun = { runKind: "primary", sourceRecordSetDigest: "f".repeat(64) };
  const logical = { runKind: "primary", work: work(1), searchRun };
  const primary = physicalReceipt({ attemptKind: "primary", contractValid: false, structuredValid: false, issues: ["strict_json_parse_failed"] });
  const repair = physicalReceipt({ attemptKind: "repair", contractValid: true, structuredValid: true });
  const repaired = selectV2B7EffectiveReceipt([primary, repair], logical);
  assert.equal(repaired.selectedAttemptKind, "repair");
  assert.equal(repaired.runKind, "primary");
  assert.equal(selectV2B7EffectiveReceipt([{ ...primary, normalizedResponse: { ...primary.normalizedResponse, contractValid: true, structuredValid: true } }], logical).selectedAttemptKind, "primary");
});

test("V2-B.7 hard budgets retain a 15-logical denominator plus at most five repairs", () => {
  assert.equal(V2B7_TAVILY_REQUEST_CAP, 24);
  assert.equal(V2B7_RELAY_REQUEST_CAP, 20);
  assert.equal(V2B7_MAX_REPAIRS, 5);
  assert.equal(V2B7_NAMESPACE, "v2b7-canary-v3");
});

test("V2-B.7 complete synthetic execution passes safety and usability without authorizing full160", () => {
  const input = passingEvaluationInput();
  const result = evaluateV2B7Canary(input);
  assert.equal(result.safetyPassed, true, JSON.stringify(result.safetyGates));
  assert.equal(result.usabilityPassed, true);
  assert.equal(result.searchDecision, "PASS");
  assert.equal(result.extractionDecision, "PASS");
  assert.equal(result.evidenceUsabilityDecision, "PASS");
  assert.equal(result.decision, "CANARY_PASS");
  assert.equal(result.full160Authorized, false);
});

test("V2-B.7 usability misses are CONDITIONAL when all 14 safety gates pass", () => {
  const input = passingEvaluationInput();
  for (const receipt of input.effectiveReceipts.filter((item) => item.runKind === "primary").slice(0, 5)) {
    receipt.normalizedResponse.claims = [];
    receipt.normalizedResponse.pilotUsableClaimCount = 0;
    receipt.normalizedResponse.acceptedClaimCount = 0;
  }
  const result = evaluateV2B7Canary(input);
  assert.equal(result.safetyPassed, true);
  assert.equal(result.usabilityPassed, false);
  assert.equal(result.decision, "CANARY_CONDITIONAL");
  assert.equal(result.full160Authorized, false);
});

test("V2-B.7 any safety failure is CANARY_FAIL", () => {
  const input = passingEvaluationInput();
  input.effectiveReceipts[0].normalizedResponse.fabricatedSourceIdCount = 1;
  const result = evaluateV2B7Canary(input);
  assert.equal(result.safetyPassed, false);
  assert.equal(result.decision, "CANARY_FAIL");
});

test("V2-B.7 repeat pair without claims is not_evaluable rather than zero agreement", () => {
  const input = passingEvaluationInput();
  const repeat = input.effectiveReceipts.find((item) => item.runKind === "repeat");
  repeat.normalizedResponse.claims = [];
  repeat.normalizedResponse.pilotUsableClaimCount = 0;
  repeat.normalizedResponse.acceptedClaimCount = 0;
  const result = evaluateV2B7Canary(input);
  assert.equal(result.metrics.reproducibility.claimAgreementEvaluableCount, 4);
  assert.equal(result.metrics.reproducibility.claimAgreementNotEvaluableCount, 1);
  assert.equal(result.metrics.reproducibility.perPair[0].pilotUsableClaimAgreementStatus, "not_evaluable");
  assert.notEqual(result.metrics.reproducibility.perPair[0].pilotUsableClaimAgreement, 0);
  assert.equal(result.decision, "CANARY_CONDITIONAL");
});

function passingEvaluationInput() {
  const manifestWorks = Array.from({ length: 10 }, (_, index) => ({ ...work(index + 1), highValue: index < 4 }));
  const repeatSample = manifestWorks.slice(0, 5).map((item) => ({ canarySlotId: item.canarySlotId, identityDigest: item.identityDigest }));
  const manifest = { sample: manifestWorks, repeatSample };
  const primarySearch = manifestWorks.map((item, index) => searchRun(item, "primary", index < 4, index));
  const repeatSearch = manifestWorks.slice(0, 5).map((item, index) => searchRun(item, "repeat", false, index));
  const effectiveReceipts = [
    ...manifestWorks.map((item, index) => effectiveReceipt(item, "primary", primarySearch[index])),
    ...manifestWorks.slice(0, 5).map((item, index) => effectiveReceipt(item, "repeat", repeatSearch[index])),
  ];
  const physicalReceipts = effectiveReceipts.map((receipt) => ({
    ...physicalReceipt({ attemptKind: "primary", contractValid: true, structuredValid: true }),
    runKind: receipt.runKind,
    canarySlotId: receipt.canarySlotId,
  }));
  return {
    manifest,
    primarySearch,
    repeatSearch,
    physicalReceipts,
    effectiveReceipts,
    manifestUnchanged: true,
    bundleUnchanged: true,
    gitBoundary: { b4Unchanged: true, holdoutSealed: true },
    allTestsPassed: true,
    evaluatedAt: "2026-07-18T00:00:00.000Z",
  };
}

function work(index) {
  return {
    title: `Synthetic Work ${index}`,
    author: `Synthetic Author ${index}`,
    sourceType: index % 2 ? "publication" : "web_original",
    canarySlotId: `slot${String(index).padStart(2, "0")}`,
    identityDigest: String(index).padStart(64, "0"),
    highValue: true,
  };
}

function source(seed, capturedAt) {
  const suffix = String(seed).replace(/[^a-f0-9]/giu, "a").toLowerCase().padEnd(32, "a").slice(0, 32);
  const url = `https://public-source.cn/${suffix}`;
  return {
    schema: "m2.v2.evidence-source-record.v0.2",
    sourceId: sourceIdForV2B5Url(url),
    queryId: `qry_${suffix}`,
    title: "Synthetic Work Synthetic Author",
    url,
    domain: "public-source.cn",
    snippet: "Synthetic Work Synthetic Author",
    providerScore: 1,
    searchProvider: "tavily_structured_search",
    providerRequestId: "synthetic",
    capturedAt,
    availableAt: capturedAt,
    availableAtBasis: "first_observed_by_system",
    eventTime: null,
    sourceTypeCandidate: "publisher_or_official_candidate",
    providerReceiptRef: `sha256:${"a".repeat(64)}`,
    researchOnly: true,
    modelEligible: false,
  };
}

function searchRun(item, runKind, reused, index) {
  const src = source(String(index + 1), "2026-07-18T00:00:00.000Z");
  const queries = reused ? [] : Array.from({ length: 2 }, (_, queryIndex) => ({
    dispatched: true,
    contractValid: true,
    resultCount: 1,
    responseTimeMs: 100 + queryIndex,
  }));
  return {
    runKind,
    canarySlotId: item.canarySlotId,
    sourceOrigin: reused ? "frozen_benchmark_bundle_reuse" : "v2b7_independent_tavily_search",
    sourceRecordSetDigest: String(index + 1).padStart(64, "a").slice(0, 64),
    sourceRecords: [src],
    queries,
  };
}

function effectiveReceipt(item, runKind, run) {
  const src = run.sourceRecords[0];
  const claim = {
    claimId: "clm_1",
    claimType: "work_identity",
    structuredValue: { valueType: "text", textValue: item.title, dateValue: null, numberValue: null, booleanValue: null },
    supportingSourceIds: [src.sourceId],
    confidence: 0.9,
    eventTime: null,
    entityResolution: {
      work: { status: "high", confidence: 0.9, supportingSourceIds: [src.sourceId] },
      author: { status: "high", confidence: 0.9, supportingSourceIds: [src.sourceId] },
    },
    contradictionStatus: "none",
    accepted: true,
    pilotUsable: true,
    researchApproved: false,
    modelEligible: false,
    researchOnly: true,
    rejectionReasons: [],
  };
  return {
    schema: "m2.v2.v2b7-extraction-effective-receipt.v0.2",
    runKind,
    canarySlotId: item.canarySlotId,
    modelBindingVerified: true,
    providerContractCompatible: true,
    timedOut: false,
    normalizedResponse: {
      structuredValid: true,
      contractValid: true,
      entityResolution: claim.entityResolution,
      claims: [claim],
      contradictions: [],
      acceptedClaimCount: 1,
      pilotUsableClaimCount: 1,
      sourceIdReferenceCount: 3,
      mappedSourceIdReferenceCount: 3,
      privateLeakCount: 0,
      fabricatedSourceIdCount: 0,
      modelGeneratedUrlCount: 0,
      historicalBackfillCount: 0,
    },
  };
}

function physicalReceipt(options = {}) {
  return {
    attemptKind: options.attemptKind ?? "primary",
    dispatched: true,
    httpOk: true,
    modelBindingVerified: true,
    modelBindingStatus: "exact",
    providerContractCompatible: true,
    normalizedResponse: {
      structuredValid: options.structuredValid ?? false,
      contractValid: options.contractValid ?? false,
      issues: options.issues ?? [],
      carrierIssues: [],
      privateLeakCount: 0,
      fabricatedSourceIdCount: 0,
      modelGeneratedUrlCount: 0,
      historicalBackfillCount: 0,
    },
    receiptDigest: "a".repeat(64),
    latencyMs: 100,
    usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
    returnedModelId: V2B7_MODEL_ID,
    status: "provider_response_received",
  };
}
