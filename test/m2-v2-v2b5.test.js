import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { canonicalJson, sha256 } from "../src/domain/m2V2EvidencePilot/pilotCore.js";
import {
  V2B5_SOURCE_RECORD_FIELDS,
  V2B5_SOURCE_RECORD_SCHEMA,
  adaptV2B3SourceRecordToV2B5,
  buildV2B5SourceRecordSet,
  canonicalizeV2B5SourceUrl,
  normalizeTavilyResultToV2B5SourceRecord,
  sourceIdForV2B5Url,
  validateV2B5SourceRecord,
} from "../src/domain/m2V2EvidencePilot/sourceRecordV2B5.js";
import {
  V2B5_DEFAULT_SOURCE_GOVERNANCE_POLICY,
  buildV2B5ResearchCandidateRegistry,
  classifyV2B5ProhibitedSource,
  evaluateV2B5PilotUsability,
  validateV2B5SourceGovernancePolicy,
} from "../src/domain/m2V2EvidencePilot/sourceGovernanceV2B5.js";
import {
  buildV2B5ExtractionPayload,
  compareV2B5ClaimSets,
  normalizeV2B5ExtractionResponse,
  validateV2B5ExtractionOutput,
} from "../src/domain/m2V2EvidencePilot/extractionV2B5.js";
import {
  TavilyStructuredSearchProviderV2B5,
  buildV2B5TavilyCacheDescriptor,
  buildV2B5TavilySearchPayload,
  classifyV2B5TavilyProviderDecision,
  dispatchV2B5TavilyRequest,
  normalizeV2B5TavilySearchResponse,
  validateV2B5TavilyCapabilityState,
} from "../src/domain/m2V2EvidencePilot/tavilySearchProviderV2B5.js";
import { OpenAICompatibleRelayExtractionProviderV2B5 } from "../src/domain/m2V2EvidencePilot/relayExtractionProviderV2B5.js";
import {
  buildV2B5BenchmarkManifest,
  buildV2B5WorkQueries,
  chooseV2B5ExtractionModels,
  evaluateV2B5Canary,
  evaluateV2B5ExtractionBenchmark,
  selectV2B5BenchmarkSample,
  shouldEscalateV2B5Extraction,
  validateV2B5WorkQueries,
} from "../src/domain/m2V2EvidencePilot/v2b5Evaluation.js";
import {
  V2B5_RELAY_REQUEST_CAP,
  V2B5_TAVILY_REQUEST_CAP,
  __test as runtimeTest,
  assertPublicV2B5Sanitized,
  buildV2B5PrivateWorkbookRows,
} from "../src/domain/m2V2EvidencePilot/v2b5Runtime.js";

const NOW = "2026-07-18T00:00:00.000Z";

test("Tavily provider missing key and invalid auth fail closed", () => {
  assert.throws(() => new TavilyStructuredSearchProviderV2B5({ apiKey: "" }), /api_key_missing/u);
  const result = normalizeV2B5TavilySearchResponse({ error: { message: "unauthorized" } }, {
    queryId: "synthetic",
    requestStartedAt: NOW,
    responseReceivedAt: NOW,
    responseTimeMs: 1,
    httpStatus: 401,
    cacheKey: "a".repeat(64),
  });
  assert.equal(classifyV2B5TavilyProviderDecision(result), "BLOCKED_AUTH");
});

test("Tavily capability response normalizes structured results and usage", () => {
  const result = normalizeV2B5TavilySearchResponse({
    request_id: "req_synthetic",
    response_time: 0.2,
    usage: { credits: 1 },
    results: [{
      title: "API documentation",
      url: "https://example.com/docs?utm_source=test&ref=kept",
      content: "Structured public documentation content.",
      score: 0.9,
    }],
  }, {
    queryId: "synthetic",
    requestStartedAt: NOW,
    responseReceivedAt: NOW,
    responseTimeMs: 200,
    httpStatus: 200,
    cacheKey: "b".repeat(64),
  });
  assert.equal(result.contractValid, true);
  assert.equal(result.sourceRecordCount, 1);
  assert.equal(result.providerReceipt.usageCredits, 1);
  assert.equal(result.providerReceipt.providerResponseTime, 0.2);
  assert.equal(result.sourceRecords[0].url, "https://example.com/docs?ref=kept");
  assert.equal(validateV2B5SourceRecord(result.sourceRecords[0]).valid, true);
  assert.equal(result.candidateObservations.length, 1);
  assert.equal(result.candidateObservations[0].domain, "example.com");
});

test("Tavily missing title, URL, content, or score fails the contract", () => {
  for (const missing of ["title", "url", "content", "score"]) {
    const row = { title: "T", url: "https://example.com/x", content: "C", score: 0.5 };
    delete row[missing];
    const result = normalizeV2B5TavilySearchResponse({ results: [row] }, {
      queryId: `missing_${missing}`,
      requestStartedAt: NOW,
      responseReceivedAt: NOW,
      responseTimeMs: 1,
      httpStatus: 200,
      cacheKey: "c".repeat(64),
    });
    assert.equal(result.contractValid, false, missing);
  }
  const nullScore = normalizeV2B5TavilySearchResponse({ results: [{ title: "T", url: "https://example.com/x", content: "C", score: null }] }, {
    queryId: "null_score", requestStartedAt: NOW, responseReceivedAt: NOW, responseTimeMs: 1, httpStatus: 200, cacheKey: "c".repeat(64),
  });
  assert.equal(nullScore.contractValid, false);
  assert.equal(nullScore.providerReceipt.usageCredits, null);
});

test("Tavily 400 is contract-blocked rather than transport-blocked", () => {
  const result = normalizeV2B5TavilySearchResponse({ error: { message: "bad parameter" } }, {
    queryId: "bad_contract", requestStartedAt: NOW, responseReceivedAt: NOW, responseTimeMs: 1, httpStatus: 400, cacheKey: "9".repeat(64),
  });
  assert.equal(classifyV2B5TavilyProviderDecision(result), "BLOCKED_CONTRACT");
});

test("Tavily capability classification preserves dispatch and HTTP invariants", () => {
  const result = (overrides = {}) => ({
    dispatched: true,
    contractValid: false,
    sourceRecordCount: 0,
    providerConnectivityPassed: false,
    providerReceipt: { httpStatus: null },
    ...overrides,
  });
  assert.equal(classifyV2B5TavilyProviderDecision(result({ dispatched: false })), "BLOCKED_EGRESS_PERMISSION");
  assert.equal(classifyV2B5TavilyProviderDecision(result({ transportFailureCategory: "dns" })), "BLOCKED_DNS");
  assert.equal(classifyV2B5TavilyProviderDecision(result({ transportFailureCategory: "tls" })), "BLOCKED_TLS");
  assert.equal(classifyV2B5TavilyProviderDecision(result()), "BLOCKED_TRANSPORT");
  assert.equal(classifyV2B5TavilyProviderDecision(result({ providerReceipt: { httpStatus: 403 } })), "BLOCKED_AUTH");
  assert.equal(classifyV2B5TavilyProviderDecision(result({ providerReceipt: { httpStatus: 429 } })), "BLOCKED_RATE_LIMIT");
  assert.equal(classifyV2B5TavilyProviderDecision(result({ providerReceipt: { httpStatus: 200 }, providerConnectivityPassed: true })), "BLOCKED_CONTRACT");
  assert.equal(classifyV2B5TavilyProviderDecision(result({ contractValid: true, sourceRecordCount: 1, providerReceipt: { httpStatus: 200 }, providerConnectivityPassed: true })), "READY");
});

test("all Tavily capability states have machine-verifiable invariants", () => {
  const valid = [
    ["BLOCKED_EGRESS_PERMISSION", { dispatched: false, httpStatus: null }],
    ["BLOCKED_DNS", { dispatched: true, dnsAttempted: true, dnsSuccess: false, httpStatus: null }],
    ["BLOCKED_TLS", { dispatched: true, tlsSuccess: false, httpStatus: null }],
    ["BLOCKED_TRANSPORT", { dispatched: true, httpStatus: null }],
    ["BLOCKED_AUTH", { dispatched: true, httpStatus: 401 }],
    ["BLOCKED_RATE_LIMIT", { dispatched: true, httpStatus: 429 }],
    ["BLOCKED_CONTRACT", { dispatched: true, httpStatus: 200, httpSuccess: true, contractValid: false }],
    ["READY", { dispatched: true, httpStatus: 200, httpSuccess: true, contractValid: true }],
  ];
  for (const [decision, finalResult] of valid) {
    assert.deepEqual(validateV2B5TavilyCapabilityState({ tavilyProviderDecision: decision, finalResult }), { valid: true, issues: [] }, decision);
  }
  assert.equal(validateV2B5TavilyCapabilityState({ tavilyProviderDecision: "BLOCKED_TRANSPORT", finalResult: { dispatched: false, httpStatus: null } }).valid, false);
  assert.equal(validateV2B5TavilyCapabilityState({ tavilyProviderDecision: "BLOCKED_AUTH", finalResult: { dispatched: true, httpStatus: 429 } }).valid, false);
});

test("Tavily transport diagnostics cannot bypass the lowest-sink capability", async () => {
  let fetchCount = 0;
  for (const code of ["ENOTFOUND", "CERT_HAS_EXPIRED", "EACCES"]) {
    await assert.rejects(dispatchV2B5TavilyRequest({
      fetchImpl: async () => { fetchCount += 1; const error = new Error("synthetic"); error.cause = { code }; throw error; },
      baseUrl: "https://api.tavily.com",
      apiKey: "synthetic-key",
      projectId: "synthetic",
      payload: buildV2B5TavilySearchPayload({ query: "OpenAI API documentation", maxResults: 3, includeUsage: true }),
      timeoutMs: 1_000,
    }), /provider_execution_capability_missing/u);
  }
  assert.equal(fetchCount, 0);
});

test("Tavily request payload is minimal and excludes answer/raw content", () => {
  const payload = buildV2B5TavilySearchPayload({ query: "OpenAI API documentation", maxResults: 3, includeUsage: true });
  assert.deepEqual(payload, {
    query: "OpenAI API documentation",
    topic: "general",
    search_depth: "basic",
    max_results: 3,
    include_answer: false,
    include_raw_content: false,
    country: "china",
    auto_parameters: false,
    include_usage: true,
  });
});

test("URL canonicalization removes safe tracking but retains identity-sensitive parameters", () => {
  const value = canonicalizeV2B5SourceUrl("https://EXAMPLE.com:443/book?utm_campaign=x&spm=abc&from=feed&gclid=y#frag");
  assert.equal(value, "https://example.com/book?from=feed&spm=abc");
  assert.equal(canonicalizeV2B5SourceUrl("http://example.com/book"), null);
  assert.equal(canonicalizeV2B5SourceUrl("https://user:pass@example.com/book"), null);
});

test("sourceId is stable over canonical URL and shorteners are rejected", () => {
  assert.equal(
    sourceIdForV2B5Url("https://example.com/a?utm_source=x&q=1"),
    sourceIdForV2B5Url("https://example.com/a?q=1"),
  );
  assert.throws(() => normalizeTavilyResultToV2B5SourceRecord({
    title: "short",
    url: "https://bit.ly/a",
    content: "content",
    score: 1,
  }, sourceContext()), /url_invalid/u);
});

test("Source Record v0.2 has exact fields and first-observed semantics", () => {
  const record = sourceRecord("https://example.com/a", "q1");
  assert.deepEqual(Object.keys(record).sort(), [...V2B5_SOURCE_RECORD_FIELDS].sort());
  assert.equal(record.schema, V2B5_SOURCE_RECORD_SCHEMA);
  assert.equal(record.capturedAt, record.availableAt);
  assert.equal(record.availableAtBasis, "first_observed_by_system");
  assert.equal(record.eventTime, null);
  assert.equal(record.researchOnly, true);
  assert.equal(record.modelEligible, false);
  assert.match(record.providerReceiptRef, /^sha256:/u);
});

test("legacy v0.1 annotation source remains readable through the v0.2 adapter", () => {
  const record = adaptV2B3SourceRecordToV2B5({
    title: "Legacy title",
    url: "https://legacy.example.com/item",
    snippet: "Legacy public snippet.",
    capturedAt: NOW,
    providerReceipt: { receiptDigest: "d".repeat(64), providerId: "legacy_relay", responseId: "resp_1" },
  }, { queryId: "legacy_q" });
  assert.equal(validateV2B5SourceRecord(record).valid, true);
  assert.equal(record.availableAt, NOW);
  assert.equal(record.modelEligible, false);
});

test("Tavily cache invalidates on execution namespace and parameters", () => {
  const base = { queryDigest: "e".repeat(64), executionNamespace: "one" };
  const first = buildV2B5TavilyCacheDescriptor(base);
  const namespaceChanged = buildV2B5TavilyCacheDescriptor({ ...base, executionNamespace: "two" });
  const resultsChanged = buildV2B5TavilyCacheDescriptor({ ...base, maxResults: 3 });
  assert.notEqual(first.cacheKey, namespaceChanged.cacheKey);
  assert.notEqual(first.cacheKey, resultsChanged.cacheKey);
  assert.equal(first.cacheKey, buildV2B5TavilyCacheDescriptor(base).cacheKey);
  assert.equal(first.sourceRecordSchemaVersion, V2B5_SOURCE_RECORD_SCHEMA);
});

test("capability audit command is distinct from block and resume commands", () => {
  const scripts = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).scripts;
  assert.match(scripts["m2:v2:v2b5:probe"], /run_m2_v2_b5\.mjs probe/u);
  assert.doesNotMatch(scripts["m2:v2:v2b5:probe"], /block/u);
  assert.notEqual(scripts["m2:v2:v2b5:probe"], scripts["m2:v2:v2b5:resume"]);
});

test("completed pre-gate FAIL is terminal and reusable without provider retry", () => {
  const dir = mkdtempSync(join(tmpdir(), "v2b5-terminal-"));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "tavily-capability-receipt-private-v0.1.json"), JSON.stringify({ tavilyProviderDecision: "READY" }));
  writeFileSync(join(dir, "luna-terra-benchmark-evaluation-private-v0.1.json"), JSON.stringify({ extractionBenchmarkDecision: "FAIL" }));
  writeFileSync(join(dir, "canary-v3-evaluation-private-v0.1.json"), JSON.stringify({ executed: false, decision: "CANARY_BLOCKED" }));
  assert.equal(runtimeTest.canReuseV2B5TerminalPreGateResult({
    executionStatus: "blocked_canary_pre_gate",
    tavilyProviderDecision: "READY",
    canaryExecuted: false,
  }, dir), true);
  assert.equal(runtimeTest.canReuseV2B5TerminalPreGateResult({
    executionStatus: "blocked_canary_pre_gate",
    tavilyProviderDecision: "READY",
    canaryExecuted: true,
  }, dir), false);
});

test("hard request caps remain 40 for both providers", () => {
  assert.equal(V2B5_TAVILY_REQUEST_CAP, 40);
  assert.equal(V2B5_RELAY_REQUEST_CAP, 40);
});

test("Governance v0.3 permits pending pilot review but never promotes", () => {
  assert.equal(validateV2B5SourceGovernancePolicy(V2B5_DEFAULT_SOURCE_GOVERNANCE_POLICY).valid, true);
  const record = sourceRecord("https://example.com/evidence", "q2");
  const result = evaluateV2B5PilotUsability({
    accepted: true,
    sources: [record],
    entityResolution: resolvedEntities(record.sourceId),
    claimInvolvesAuthor: false,
    contradictionStatus: "none",
    citationAligned: true,
    privateLeakDetected: false,
    historicalBackfillDetected: false,
  });
  assert.equal(result.pilotUsable, true);
  assert.equal(result.termsReviewStatus, "pending");
  assert.equal(result.legalReviewStatus, "pending");
  assert.equal(result.researchApproved, false);
  assert.equal(result.modelEligible, false);
  assert.deepEqual(V2B5_DEFAULT_SOURCE_GOVERNANCE_POLICY.modelAllowlist.approvedDomainEntries, []);
  const missingAudits = evaluateV2B5PilotUsability({
    accepted: true,
    sources: [record],
    entityResolution: resolvedEntities(record.sourceId),
    claimInvolvesAuthor: false,
    contradictionStatus: "none",
    citationAligned: true,
  });
  assert.equal(missingAudits.pilotUsable, false);
});

test("prohibited sources and candidate registry remain fail closed", () => {
  const normal = sourceRecord("https://example.com/evidence", "q3");
  const sharing = { ...sourceRecord("https://pan.baidu.com/share", "q4"), sourceTypeCandidate: "unknown_public_web" };
  assert.equal(classifyV2B5ProhibitedSource(normal).prohibited, false);
  assert.equal(classifyV2B5ProhibitedSource(sharing).prohibited, true);
  const registry = buildV2B5ResearchCandidateRegistry([normal], [{ pilotUsable: true, supportingSourceIds: [normal.sourceId] }]);
  assert.equal(registry.uniqueDomainCount, 1);
  assert.equal(registry.entries[0].researchApproved, false);
  assert.equal(registry.entries[0].modelEligible, false);
  assert.equal(registry.automaticPromotionUsed, false);
  const observedRegistry = buildV2B5ResearchCandidateRegistry([], [], [{
    domain: "bit.ly", firstSeenAt: NOW, searchProvider: "tavily_structured_search",
    sourceTypeCandidate: "other", publicHttpsObserved: true, resultCount: 1,
  }]);
  assert.equal(observedRegistry.uniqueDomainCount, 1);
  assert.deepEqual(observedRegistry.entries[0].prohibitedCategories, ["url_shortener"]);
  assert.equal(classifyV2B5ProhibitedSource(sourceRecord("https://better.example.com/evidence", "q_boundary")).prohibited, false);
});

test("Extraction payload is strict, source-bound, and has no search tools", () => {
  const record = sourceRecord("https://example.com/work", "q5");
  const payload = buildV2B5ExtractionPayload({
    model: "gpt-5.6-terra",
    work: { title: "Synthetic Work", author: "Synthetic Author", sourceType: "publication" },
    sourceRecords: [record],
  });
  assert.equal(payload.store, false);
  assert.equal(payload.text.format.type, "json_schema");
  assert.equal(payload.text.format.strict, true);
  assert.equal(payload.max_output_tokens, 1_200);
  assert.equal(Object.hasOwn(payload, "tools"), false);
  assert.doesNotMatch(canonicalJson(payload), /web_search|computer-use|browser/iu);
  const prohibited = { ...sourceRecord("https://pan.baidu.com/share", "q5p"), sourceTypeCandidate: "unknown_public_web" };
  assert.throws(() => buildV2B5ExtractionPayload({
    model: "gpt-5.6-terra",
    work: { title: "Synthetic Work", author: "Synthetic Author", sourceType: "publication" },
    sourceRecords: [prohibited],
  }), /source_prohibited/u);
});

test("strict Extraction schema requires source support for resolved entities", () => {
  const record = sourceRecord("https://example.com/work", "q6");
  const value = extractionOutput(record.sourceId);
  assert.equal(validateV2B5ExtractionOutput(value).valid, true);
  value.entityResolution.work.supportingSourceIds = [];
  assert.equal(validateV2B5ExtractionOutput(value).valid, false);
});

test("Extraction accepts mapped claims and derives prospective availableAt locally", () => {
  const record = sourceRecord("https://example.com/work", "q7", "Synthetic Work Synthetic Author was published in 2024.");
  const normalized = normalizeV2B5ExtractionResponse(relayResponse(extractionOutput(record.sourceId)), {
    sourceRecords: [record],
    work: { title: "Synthetic Work", author: "Synthetic Author", sourceType: "publication" },
  });
  assert.equal(normalized.contractValid, true);
  assert.equal(normalized.sourceIdIntegrityRate, 1);
  assert.equal(normalized.pilotUsableClaimCount, 1);
  assert.equal(normalized.claims[0].availableAt, NOW);
  assert.equal(normalized.claims[0].eventTime, null);
  assert.equal(normalized.claims[0].modelEligible, false);
});

test("fabricated sourceId, model URL, unresolved entity, and conflict are rejected", () => {
  const record = sourceRecord("https://example.com/work", "q8", "Synthetic Work Synthetic Author public evidence.");
  const baseContext = { sourceRecords: [record], work: { title: "Synthetic Work", author: "Synthetic Author", sourceType: "publication" } };

  const fabricated = extractionOutput(`src_${"f".repeat(32)}`);
  const fabricatedResult = normalizeV2B5ExtractionResponse(relayResponse(fabricated), baseContext);
  assert.equal(fabricatedResult.contractValid, false);
  assert.equal(fabricatedResult.fabricatedSourceIdCount > 0, true);

  const urlOutput = extractionOutput(record.sourceId);
  urlOutput.claims[0].claim = "See https://example.com/work";
  const urlResult = normalizeV2B5ExtractionResponse(relayResponse(urlOutput), baseContext);
  assert.equal(urlResult.contractValid, false);
  assert.equal(urlResult.modelGeneratedUrlCount, 1);

  const unresolved = extractionOutput(record.sourceId);
  unresolved.entityResolution.work = { status: "unresolved", confidence: 0.2, supportingSourceIds: [] };
  const unresolvedResult = normalizeV2B5ExtractionResponse(relayResponse(unresolved), baseContext);
  assert.equal(unresolvedResult.claims[0].accepted, false);
  assert.ok(unresolvedResult.claims[0].rejectionReasons.includes("work_entity_unresolved_or_ambiguous"));

  const conflicted = extractionOutput(record.sourceId);
  conflicted.claims[0].contradictionKey = "ctr_1";
  conflicted.contradictions.push({ contradictionKey: "ctr_1", claimIds: ["clm_1"], status: "unresolved", reason: "Sources conflict." });
  const conflictResult = normalizeV2B5ExtractionResponse(relayResponse(conflicted), baseContext);
  assert.equal(conflictResult.claims[0].accepted, false);
  assert.ok(conflictResult.claims[0].rejectionReasons.includes("conflict_unresolved"));

  const fabricatedEntity = extractionOutput(record.sourceId);
  fabricatedEntity.entityResolution.work.supportingSourceIds = [`src_${"e".repeat(32)}`];
  const fabricatedEntityResult = normalizeV2B5ExtractionResponse(relayResponse(fabricatedEntity), baseContext);
  assert.equal(fabricatedEntityResult.contractValid, false);
  assert.equal(fabricatedEntityResult.fabricatedSourceIdCount > 0, true);
  assert.equal(fabricatedEntityResult.claims[0].accepted, false);

  const inventedTime = extractionOutput(record.sourceId);
  inventedTime.claims[0].eventTime = "2035-01-01T00:00:00.000Z";
  const inventedTimeResult = normalizeV2B5ExtractionResponse(relayResponse(inventedTime), baseContext);
  assert.equal(inventedTimeResult.claims[0].accepted, false);
  assert.ok(inventedTimeResult.claims[0].rejectionReasons.includes("event_time_not_supported_by_source"));
});

test("relay Extraction provider advertises no search or browser capability", () => {
  const provider = new OpenAICompatibleRelayExtractionProviderV2B5({
    baseUrl: "https://relay.example.com/v1", approvedHost: "relay.example.com", apiKey: "synthetic",
    fetchImpl: async () => { throw new Error("must_not_run"); },
  });
  assert.deepEqual(provider.capabilities(), {
    provider: "openai_compatible_relay_extraction",
    providerVersion: "m2-v2-relay-extraction-adapter-v0.1",
    mode: "evidence_extraction_only",
    searchAllowed: false,
    webSearchAllowed: false,
    browserAllowed: false,
    strictJsonSchemaRequested: true,
    rawResponsePersisted: false,
  });
});

test("fixed queries are deterministic, exactly two, and contain no private fields", () => {
  const work = fixtureCanary().sample[0];
  const first = buildV2B5WorkQueries(work, "primary", "test");
  const second = buildV2B5WorkQueries(work, "primary", "test");
  assert.deepEqual(first, second);
  assert.equal(validateV2B5WorkQueries(first).valid, true);
  assert.equal(first.length, 2);
});

test("benchmark manifest selection is deterministic and pre-retrieval", () => {
  const canary = fixtureCanary();
  const first = selectV2B5BenchmarkSample(canary);
  const second = selectV2B5BenchmarkSample(canary);
  assert.deepEqual(first, second);
  assert.equal(first.sample.length, 4);
  assert.equal(first.repeatSample.length, 2);
  const manifest = buildV2B5BenchmarkManifest(canary, NOW);
  const crossMachine = buildV2B5BenchmarkManifest(canary, "2026-07-19T00:00:00.000Z");
  assert.equal(manifest.benchmarkManifestDigest, crossMachine.benchmarkManifestDigest);
  assert.equal(manifest.selectedBeforeRetrieval, true);
  assert.equal(manifest.requestPolicy.sameSourceRecordsRequired, true);
  assert.equal(manifest.requestPolicy.repeatSearchAllowed, false);
  assert.equal(manifest.full160Authorized, false);
});

test("benchmark verifies same Source Records and evaluates fixed denominators", () => {
  const canary = fixtureCanary();
  const manifest = buildV2B5BenchmarkManifest(canary, NOW);
  const receipts = benchmarkReceipts(manifest);
  const evaluation = evaluateV2B5ExtractionBenchmark({ manifest, relayReceipts: receipts, evaluatedAt: NOW });
  assert.equal(evaluation.sameSourceRecordsVerified, true);
  assert.equal(evaluation.perModel["gpt-5.6-luna"].expectedRequestCount, 6);
  assert.equal(evaluation.perModel["gpt-5.6-terra"].expectedRequestCount, 6);
  assert.equal(evaluation.extractionBenchmarkDecision, "PASS");
  assert.equal(evaluation.full160Authorized, false);
});

test("benchmark fairness and model binding are hard gates", () => {
  const manifest = buildV2B5BenchmarkManifest(fixtureCanary(), NOW);
  const mismatched = benchmarkReceipts(manifest);
  mismatched.find((receipt) => receipt.requestedModelId === "gpt-5.6-luna" && receipt.runKind === "repeat").sourceRecordSetDigest = "f".repeat(64);
  const fairness = evaluateV2B5ExtractionBenchmark({ manifest, relayReceipts: mismatched, evaluatedAt: NOW });
  assert.equal(fairness.extractionBenchmarkDecision, "FAIL");
  const wrongModel = benchmarkReceipts(manifest);
  wrongModel[0].modelBindingVerified = false;
  wrongModel[0].providerContractCompatible = false;
  const binding = evaluateV2B5ExtractionBenchmark({ manifest, relayReceipts: wrongModel, evaluatedAt: NOW });
  assert.equal(binding.perModel["gpt-5.6-luna"].hardSafetyGate.allPassed, false);
});

test("quality precedes speed in Luna/Terra model selection", () => {
  const luna = selectionMetrics({ p50: 20, tokens: 200, resolved: 1, coverage: 0.25, agreement: 0.5 });
  const terra = selectionMetrics({ p50: 100, tokens: 1_000, resolved: 4, coverage: 1, agreement: 1 });
  const selection = chooseV2B5ExtractionModels({ "gpt-5.6-luna": luna, "gpt-5.6-terra": terra });
  assert.equal(selection.defaultExtractionModel, "gpt-5.6-terra");
  assert.equal(selection.lunaStatus, "capacity_candidate");
});

test("Luna becomes default only with hard safety, quality noninferiority, and 30% efficiency", () => {
  const luna = selectionMetrics({ p50: 60, tokens: 600, resolved: 4, coverage: 1, agreement: 1 });
  const terra = selectionMetrics({ p50: 100, tokens: 1_000, resolved: 4, coverage: 1, agreement: 1 });
  const selection = chooseV2B5ExtractionModels({ "gpt-5.6-luna": luna, "gpt-5.6-terra": terra });
  assert.equal(selection.defaultExtractionModel, "gpt-5.6-luna");
  assert.equal(selection.escalationModel, "gpt-5.6-terra");
});

test("failed Terra is never used as escalation when Luna alone passes", () => {
  const luna = selectionMetrics({});
  const terra = selectionMetrics({ hardPassed: false });
  const selection = chooseV2B5ExtractionModels({ "gpt-5.6-luna": luna, "gpt-5.6-terra": terra });
  assert.equal(selection.defaultExtractionModel, "gpt-5.6-luna");
  assert.equal(selection.escalationModel, null);
});

test("escalation is requested only for contract/entity/conflict conditions", () => {
  const normal = { normalizedResponse: normalizedReceiptBody("src_" + "a".repeat(32)) };
  assert.equal(shouldEscalateV2B5Extraction(normal, { highValue: false }), false);
  const unresolved = structuredClone(normal);
  unresolved.normalizedResponse.entityResolution.work.status = "unresolved";
  assert.equal(shouldEscalateV2B5Extraction(unresolved, { highValue: true }), true);
});

test("Canary PASS uses fixed denominators and never authorizes full160", () => {
  const fixture = canaryExecutionFixture();
  const result = evaluateV2B5Canary({ ...fixture, executed: true, allTestsPassed: true, defaultExtractionModel: "gpt-5.6-terra", escalationModel: "gpt-5.6-terra" });
  assert.equal(result.decision, "CANARY_PASS");
  assert.equal(result.metrics.search.querySuccessRate, 1);
  assert.equal(result.metrics.search.sourceRecordWorkCount, 10);
  assert.equal(result.metrics.entity.workResolvedRate, 1);
  assert.equal(result.metrics.extraction.schemaPassRate, 1);
  assert.equal(result.metrics.reproducibility.claimAgreement, 1);
  assert.equal(result.metrics.reproducibility.sourceOverlap, 1);
  assert.equal(result.full160Authorized, false);
  assert.equal(result.canaryManifestDigest, fixture.manifest.manifestDigest);
});

test("Canary is CONDITIONAL for usability misses and FAIL for any safety miss", () => {
  const fixture = canaryExecutionFixture();
  const conditionalSearch = structuredClone(fixture.searchRuns);
  conditionalSearch.slice(0, 9).forEach((run) => run.queries.forEach((query) => { query.contractValid = false; }));
  const conditional = evaluateV2B5Canary({ ...fixture, searchRuns: conditionalSearch, executed: true, allTestsPassed: true, defaultExtractionModel: "gpt-5.6-terra", escalationModel: "gpt-5.6-terra" });
  assert.equal(conditional.decision, "CANARY_CONDITIONAL");
  const failed = evaluateV2B5Canary({ ...fixture, executed: true, allTestsPassed: false, defaultExtractionModel: "gpt-5.6-terra", escalationModel: "gpt-5.6-terra" });
  assert.equal(failed.decision, "CANARY_FAIL");
  assert.equal(failed.full160Authorized, false);
});

test("zero evidence suppresses a misleading workbook decision input", () => {
  const fixture = canaryExecutionFixture();
  fixture.relayReceipts.forEach((receipt) => {
    receipt.normalizedResponse.claims = [];
    receipt.normalizedResponse.pilotUsableClaimCount = 0;
  });
  const result = evaluateV2B5Canary({ ...fixture, executed: true, allTestsPassed: true, defaultExtractionModel: "gpt-5.6-terra", escalationModel: "gpt-5.6-terra" });
  assert.equal(result.metrics.evidence.pilotUsableClaimCount, 0);
  assert.equal(result.metrics.evidence.pilotUsableEvidenceWorkCoverage, 0);
  assert.equal(result.decision, "CANARY_CONDITIONAL");
  assert.deepEqual(buildV2B5PrivateWorkbookRows([], []), []);
});

test("pilot-usable evidence produces private Chinese-workbook row data without URL fields", () => {
  const source = sourceRecord("https://example.com/review", "workbook_q");
  const evidence = {
    ...normalizedReceiptBody(source.sourceId).claims[0],
    canarySlotId: "slot01",
    claim: "work_identity: Synthetic Work",
  };
  const rows = buildV2B5PrivateWorkbookRows([evidence], [source]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].anonymousSampleId, "slot01");
  assert.equal(rows[0].sourceTitle, source.title);
  assert.equal(rows[0].userDecision, "");
  assert.equal(Object.hasOwn(rows[0], "url"), false);
});

test("public sanitizer rejects private fields, external URLs, and secret markers", () => {
  assert.equal(assertPublicV2B5Sanitized('{"decision":"CANARY_PASS","full160Authorized":false}'), true);
  assert.throws(() => assertPublicV2B5Sanitized('{"queryText":"private"}'), /privacy_token/u);
  assert.throws(() => assertPublicV2B5Sanitized("https://example.com"), /external_url/u);
  assert.throws(() => assertPublicV2B5Sanitized("TAVILY_API_KEY"), /privacy_token/u);
  assert.throws(() => assertPublicV2B5Sanitized("tvly-synthetic-secret"), /privacy_token/u);
  assert.throws(() => assertPublicV2B5Sanitized("bare-secret.example.com"), /bare_domain/u);
  assert.throws(() => assertPublicV2B5Sanitized("/home/user/private.json"), /absolute_path/u);
  assert.throws(() => assertPublicV2B5Sanitized('{"summary":"Synthetic Secret Work"}', ["Synthetic Secret Work"]), /runtime_private_token/u);
});

test("blocked public reports preserve manifest verification and explicitly avoid model-quality inference", () => {
  const canaryManifestDigest = "c".repeat(64);
  const bundle = runtimeTest.buildPublicReportBundle({
    capability: {
      tavilyProviderDecision: "BLOCKED_EGRESS_PERMISSION",
      executionBlockedBeforeDispatch: true,
      providerConnectivity: "NOT_EVALUATED",
      providerContractCompatibility: "NOT_EVALUATED",
      finalResult: { dispatched: false, httpStatus: null },
    },
    benchmarkEvaluation: null,
    canaryEvaluation: runtimeTest.blockedCanaryEvaluation(
      { manifestDigest: canaryManifestDigest },
      "external_dispatch_not_permitted_by_execution_environment",
    ),
    state: {
      canaryManifestDigest,
      tavily: { physicalRequestCount: 0 },
      relay: { physicalRequestCount: 0 },
    },
    usageLedger: null,
    registry: null,
    privateWorkbookExists: false,
  });
  assert.equal(bundle.execution.fixedManifestUnchanged, true);
  assert.equal(bundle.benchmark.modelEvidenceQuality, "NOT_EVALUATED");
  assert.equal(bundle.benchmark.executed, false);
  assert.equal(bundle.benchmark.extractionBenchmarkDecision, "BLOCKED");
  assert.equal(bundle.capability.tavilyProviderDecision, "BLOCKED_EGRESS_PERMISSION");
  assert.equal(bundle.capability.dispatchAttempted, false);
  assert.equal(bundle.capability.providerConnectivity, "NOT_EVALUATED");
  assert.equal(bundle.capability.providerContract, "NOT_EVALUATED");
  assert.equal(bundle.capability.providerContractCompatibility, "NOT_EVALUATED");
});

test("block capability can only record pre-dispatch egress permission", () => {
  const capability = runtimeTest.buildV2B5ExecutionBlockCapability(
    { tavily: "a".repeat(64) },
    "external_dispatch_not_permitted_by_execution_environment",
  );
  assert.equal(capability.tavilyProviderDecision, "BLOCKED_EGRESS_PERMISSION");
  assert.equal(capability.finalResult.dispatched, false);
  assert.equal(capability.finalResult.httpStatus, null);
  assert.equal(capability.providerConnectivity, "NOT_EVALUATED");
  assert.equal(capability.providerContract, "NOT_EVALUATED");
  assert.equal(capability.providerContractCompatibility, "NOT_EVALUATED");
  assert.deepEqual(capability.stateInvariantValidation, { valid: true, issues: [] });
  assert.throws(() => runtimeTest.buildV2B5ExecutionBlockCapability({}, "transport_error"), /block_reason_invalid/u);
});

test("legacy pre-dispatch transport state migrates once without changing budgets or manifests", () => {
  const state = {
    tavilyProviderDecision: "BLOCKED_TRANSPORT",
    externalDispatchBlockedBeforeExecution: true,
    benchmarkManifestDigest: "a".repeat(64),
    canaryManifestDigest: "b".repeat(64),
    tavily: { cap: 40, physicalRequestCount: 0, reservations: {} },
    relay: { cap: 40, physicalRequestCount: 0, reservations: {} },
  };
  const capability = {
    tavilyProviderDecision: "BLOCKED_TRANSPORT",
    executionBlockedBeforeDispatch: true,
    finalResult: { dispatched: false, httpSuccess: false, providerConnectivityPassed: false, contractValid: false },
  };
  const migrated = runtimeTest.migrateV2B5LegacyCapabilityState(state, capability, NOW);
  assert.equal(migrated.migrated, true);
  assert.equal(migrated.state.tavilyProviderDecision, "BLOCKED_EGRESS_PERMISSION");
  assert.equal(migrated.capability.legacyTavilyProviderDecision, "BLOCKED_TRANSPORT");
  assert.equal(migrated.capability.providerConnectivity, "NOT_EVALUATED");
  assert.equal(migrated.capability.providerContractCompatibility, "NOT_EVALUATED");
  assert.equal(migrated.capability.finalResult.dispatched, false);
  assert.equal(migrated.capability.finalResult.httpStatus, null);
  assert.deepEqual(migrated.state.tavily, state.tavily);
  assert.deepEqual(migrated.state.relay, state.relay);
  assert.equal(migrated.state.benchmarkManifestDigest, state.benchmarkManifestDigest);
  assert.equal(migrated.state.canaryManifestDigest, state.canaryManifestDigest);
  const repeated = runtimeTest.migrateV2B5LegacyCapabilityState(migrated.state, migrated.capability, "2026-07-18T01:00:00.000Z");
  assert.equal(repeated.migrated, false);
  assert.deepEqual(repeated.state, migrated.state);
  assert.deepEqual(repeated.capability, migrated.capability);
});

test("runtime configuration is fail closed and keeps both request caps", () => {
  const env = validRuntimeEnv();
  const config = runtimeTest.loadV2B5Configuration(".", env);
  assert.equal(config.tavily.maxResults, 6);
  assert.equal(config.relay.reasoningEffort, "low");
  assert.throws(() => runtimeTest.loadV2B5Configuration(".", { ...env, TAVILY_API_KEY: "" }), /tavily_configuration_incomplete/u);
  assert.throws(() => runtimeTest.loadV2B5Configuration(".", { ...env, M2_V2_TAVILY_MAX_REQUESTS: "41" }), /request_cap_config_invalid/u);
});

test("claim agreement treats missing repeat evidence as zero", () => {
  const record = sourceRecord("https://example.com/a", "q9");
  const claim = normalizeV2B5ExtractionResponse(relayResponse(extractionOutput(record.sourceId)), {
    sourceRecords: [record],
    work: { title: "Synthetic Work", author: "Synthetic Author", sourceType: "publication" },
  }).claims;
  assert.equal(compareV2B5ClaimSets(claim, []), 0);
  assert.equal(compareV2B5ClaimSets([], []), 0);
});

function sourceContext(queryId = "q") {
  return {
    queryId,
    capturedAt: NOW,
    providerRequestId: "req_1",
    providerReceiptRef: sha256(queryId),
  };
}

function sourceRecord(url, queryId, content = "Synthetic Work Synthetic Author public evidence.") {
  return normalizeTavilyResultToV2B5SourceRecord({ title: "Synthetic Work public source", url, content, score: 0.9 }, sourceContext(queryId));
}

function resolvedEntities(sourceId) {
  return {
    work: { status: "high", confidence: 0.95, supportingSourceIds: [sourceId] },
    author: { status: "high", confidence: 0.95, supportingSourceIds: [sourceId] },
  };
}

function extractionOutput(sourceId) {
  return {
    schemaVersion: "m2.v2.evidence-extraction-output.v0.2",
    entityResolution: resolvedEntities(sourceId),
    claims: [{
      claimId: "clm_1",
      claimType: "work_identity",
      structuredValue: { valueType: "text", textValue: "Synthetic Work", dateValue: null, numberValue: null, booleanValue: null },
      supportingSourceIds: [sourceId],
      confidence: 0.9,
      eventTime: null,
      contradictionKey: null,
      limitations: [],
    }],
    contradictions: [],
    limitations: [],
  };
}

function relayResponse(output, model = "gpt-5.6-terra") {
  return {
    id: "resp_1",
    model,
    status: "completed",
    output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(output) }] }],
    usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
  };
}

function fixtureCanary() {
  const sample = Array.from({ length: 10 }, (_, index) => ({
    standardWorkId: `private-work-${index + 1}`,
    title: `Synthetic Work ${index + 1}`,
    author: `Synthetic Author ${index + 1}`,
    identityDigest: sha256(`identity-${index + 1}`),
    sourceType: index < 5 ? "publication" : "web_original",
    revenueBand: index < 2 ? "top5" : index < 4 ? "top10" : "middle",
    revenueModel: "sales",
    activity: "active",
    ambiguityRisk: index % 3 === 0 ? "medium" : "high",
    evidencePrior: index % 3 === 0 ? "rich" : index % 3 === 1 ? "sparse" : "mixed",
    highValue: index < 6,
    sameNameCount: 1,
    canarySlotId: `slot${String(index + 1).padStart(2, "0")}`,
  }));
  const payload = {
    schema: "fixture.canary",
    privateOnly: true,
    immutable: true,
    derivedSubset: true,
    status: "frozen",
    selectedBeforeRetrieval: true,
    retrievalObservedBeforeFreeze: false,
    createdAt: NOW,
    seed: "20260717",
    selectionVersion: "fixture",
    parentManifestDigest: "b".repeat(64),
    parentSampleCount: 160,
    sampleCount: 10,
    coverage: {},
    requestBudget: {},
    repeatPolicy: {},
    sample,
    repeatSample: [sample[0], sample[3], sample[5], sample[6], sample[9]].map((item) => ({ standardWorkId: item.standardWorkId, identityDigest: item.identityDigest })),
  };
  return { ...payload, canaryManifestDigest: sha256(payload) };
}

function normalizedReceiptBody(sourceId) {
  return {
    contractValid: true,
    structuredValid: true,
    entityResolution: resolvedEntities(sourceId),
    claims: [{
      claimId: "clm_1",
      claim: "Synthetic public evidence",
      claimType: "work_identity",
      structuredValue: { valueType: "text", textValue: "Synthetic Work", dateValue: null, numberValue: null, booleanValue: null },
      supportingSourceIds: [sourceId],
      confidence: 0.9,
      eventTime: null,
      contradictionStatus: "none",
      accepted: true,
      pilotUsable: true,
      researchApproved: false,
      modelEligible: false,
      historicalBackfillDetected: false,
      rejectionReasons: [],
      entityResolution: resolvedEntities(sourceId),
    }],
    contradictions: [],
    acceptedClaimCount: 1,
    pilotUsableClaimCount: 1,
    rejectedClaimCount: 0,
    sourceIdReferenceCount: 1,
    mappedSourceIdReferenceCount: 1,
    sourceIdIntegrityRate: 1,
    fabricatedSourceIdCount: 0,
    modelGeneratedUrlCount: 0,
    privateLeakCount: 0,
    historicalBackfillCount: 0,
    unresolvedOrConflictedEvidenceExcluded: true,
    capturedAtCompleteness: 1,
    availableAtCompleteness: 1,
    issues: [],
  };
}

function benchmarkReceipts(manifest) {
  const rows = [];
  for (const model of ["gpt-5.6-luna", "gpt-5.6-terra"]) {
    for (const work of manifest.sample) rows.push(benchmarkReceipt(model, work.canarySlotId, "primary"));
    for (const work of manifest.repeatSample) rows.push(benchmarkReceipt(model, work.canarySlotId, "repeat"));
  }
  return rows;
}

function benchmarkReceipt(model, slot, runKind) {
  const sourceId = `src_${sha256(slot).slice(0, 32)}`;
  return {
    phase: "benchmark",
    runKind,
    attemptKind: "primary",
    canarySlotId: slot,
    requestedModelId: model,
    sourceRecordSetDigest: sha256(slot),
    dispatched: true,
    providerConnectivityPassed: true,
    modelBindingVerified: true,
    providerContractCompatible: true,
    responseReceivedAt: NOW,
    latencyMs: model.endsWith("luna") ? 50 : 100,
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: model.endsWith("luna") ? 100 : 200 },
    normalizedResponse: normalizedReceiptBody(sourceId),
  };
}

function selectionMetrics(options = {}) {
  return {
    hardSafetyGate: { allPassed: options.hardPassed ?? true },
    entity: { workResolvedCount: options.resolved ?? 4 },
    evidence: { pilotUsableWorkCoverage: options.coverage ?? 1, rejectedRate: 0 },
    reproducibility: { claimAgreement: options.agreement ?? 1 },
    source: { sourceIdIntegrityRate: 1 },
    costLatency: { p50LatencyMs: options.p50 ?? 100, totalTokens: options.tokens ?? 1_000, efficiencyObservationComplete: true },
  };
}

function canaryExecutionFixture() {
  const frozen = fixtureCanary();
  const manifest = runtimeTest.buildCanaryV3Manifest(frozen, NOW);
  const searchRuns = [];
  const relayReceipts = [];
  const repeatSlots = new Set(manifest.repeatSample.map((item) => item.canarySlotId));
  for (const work of manifest.sample) {
    addCanaryRun(searchRuns, relayReceipts, work, "primary");
    if (repeatSlots.has(work.canarySlotId)) addCanaryRun(searchRuns, relayReceipts, work, "repeat");
  }
  return { manifest, searchRuns, relayReceipts };
}

function addCanaryRun(searchRuns, relayReceipts, work, runKind) {
  const record = sourceRecord(`https://example.com/${work.canarySlotId}`, `${work.canarySlotId}_${runKind}`, `${work.title} ${work.author} public evidence.`);
  const sourceSet = buildV2B5SourceRecordSet([record]);
  searchRuns.push({
    phase: "canary",
    runKind,
    canarySlotId: work.canarySlotId,
    highValue: work.highValue,
    sourceRecords: [record],
    sourceRecordSetDigest: sourceSet.sourceRecordSetDigest,
    queries: [0, 1].map((index) => ({
      dispatched: true,
      httpSuccess: true,
      contractValid: true,
      resultCount: 1,
      usageCredits: 1,
      responseTimeMs: 10 + index,
      responseReceivedAt: NOW,
      cacheHit: false,
      providerReceipt: {
        receiptDigest: sha256(`${work.canarySlotId}_${runKind}`),
        queryId: `${work.canarySlotId}_${runKind}`,
        provider: "tavily_structured_search",
        requestStartedAt: NOW,
        responseReceivedAt: NOW,
      },
    })),
  });
  relayReceipts.push({
    phase: "canary",
    runKind,
    attemptKind: "primary",
    canarySlotId: work.canarySlotId,
    requestedModelId: "gpt-5.6-terra",
    sourceRecordSetDigest: sourceSet.sourceRecordSetDigest,
    dispatched: true,
    modelBindingVerified: true,
    providerContractCompatible: true,
    responseReceivedAt: NOW,
    latencyMs: 100,
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
    normalizedResponse: normalizedReceiptBody(record.sourceId),
  });
}

function validRuntimeEnv() {
  return {
    M2_V2_SEARCH_PROVIDER: "tavily_structured_search",
    M2_V2_TAVILY_BASE_URL: "https://api.tavily.com",
    M2_V2_TAVILY_TOPIC: "general",
    M2_V2_TAVILY_SEARCH_DEPTH: "basic",
    M2_V2_TAVILY_MAX_RESULTS: "6",
    M2_V2_TAVILY_COUNTRY: "china",
    M2_V2_TAVILY_PROJECT: "m2-v2-evidence-pilot",
    M2_V2_TAVILY_MAX_REQUESTS: "40",
    M2_V2_RELAY_EXTRACTION_MAX_REQUESTS: "40",
    M2_V2_EXTRACTION_REASONING_EFFORT: "low",
    TAVILY_API_KEY: "synthetic-tavily",
    OPENAI_BASE_URL: "https://relay.example.com/v1",
    M2_V2_APPROVED_RELAY_HOST: "relay.example.com",
    OPENAI_API_KEY: "synthetic-relay",
  };
}
