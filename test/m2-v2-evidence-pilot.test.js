import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  EVIDENCE_SCHEMA_VERSION,
  HARD_GATE_IDS,
  NoProviderAdapter,
  PILOT_SIZE,
  PROVIDER_MODES,
  QUERY_BUDGET,
  assertProviderContract,
  assertPublicSanitized,
  buildQueryPlan,
  compareReproducibility,
  evaluateHardGate,
  executePlanWithCache,
  executeProviderRequest,
  isAllowedPrivateArtifactPath,
  resolveContradictions,
  resolveEntity,
  validateEvidenceRecord,
  validateQueryPlan,
} from "../src/domain/m2V2EvidencePilot/pilotCore.js";
import {
  PRIVATE_STORE_RELATIVE,
  normalizeBillMonth,
  selectPilotSample,
} from "../src/domain/m2V2EvidencePilot/pilotRuntime.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function allowedSourcePolicy() {
  return {
    approvedDomainEntries: [
      {
        domain: "official.example",
        enabled: true,
        approvalStatus: "approved",
        sourceTier: "authoritative",
        sourceTermsClass: "structured_facts_allowed",
      },
    ],
  };
}

function evidence(overrides = {}) {
  const base = {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    evidenceId: "ev_synthetic_001",
    evidenceVersion: "v0.1",
    standardWorkId: "synthetic-work-001",
    evidenceType: "publication_event",
    claimKey: "publication.date",
    entityResolution: {
      work: { status: "resolved" },
      author: { status: "resolved" },
    },
    structuredValue: { valueType: "date", dateValue: "2026-07-01" },
    source: {
      sourceTier: "authoritative",
      sourceClass: "official_page",
      sourceTermsClass: "structured_facts_allowed",
      sourceDomain: "official.example",
      sourceLocator: "https://official.example/synthetic-record",
      sourceLineageDigest: "a".repeat(64),
    },
    provider: {
      providerId: "synthetic_provider",
      providerVersion: "v1",
      queryId: "query-1",
      retrievalId: "retrieval-1",
    },
    extraction: {
      extractorType: "deterministic",
      extractorVersion: "v1",
      schemaVersion: EVIDENCE_SCHEMA_VERSION,
    },
    timestamps: {
      eventTime: "2026-07-01T00:00:00.000Z",
      publishedAt: "2026-07-01T00:00:00.000Z",
      firstObservedAt: "2026-07-02T00:00:00.000Z",
      availableAtStatus: "known",
      availableAt: "2026-07-01T00:00:00.000Z",
      capturedAt: "2026-07-03T00:00:00.000Z",
    },
    confidence: {
      entityMatchConfidence: 0.95,
      sourceReliability: 0.9,
      extractionConfidence: 0.85,
      freshnessScore: 0.9,
      overall: 0.85,
      tier: "medium",
    },
    contradiction: { status: "none", currentClaimDisposition: "not_applicable" },
    predictiveUse: "prediction_allowed",
    admissibility: { status: "accepted_prediction_candidate", exclusionReason: null },
    governance: {
      evidenceAsOfAt: "2026-07-04T00:00:00.000Z",
      predictionLockedAt: "2026-07-05T00:00:00.000Z",
      historicalBackfill: false,
    },
  };
  return deepMerge(base, overrides);
}

test("provider abstraction declares all five required modes and fails closed", async () => {
  assert.deepEqual(PROVIDER_MODES, [
    "structured_search",
    "web_search",
    "official_page_fetch",
    "controlled_browser_fetch",
    "no_provider_available",
  ]);
  const provider = new NoProviderAdapter({ reason: "synthetic_no_provider" });
  assert.equal(assertProviderContract(provider), true);
  const query = buildQueryPlan({ title: "合成作品", author: "合成作者" })[0];
  const receipt = await executeProviderRequest(provider, query);
  assert.equal(receipt.status, "blocked_no_provider");
  assert.equal(receipt.dispatched, false);
  assert.equal(receipt.resultCount, 0);
  assert.equal(receipt.pageCount, 0);
  assert.equal(receipt.costAmount, 0);
  assert.equal(typeof receipt.capturedAt, "string");
});

test("query planner stays inside 8/10/6 budgets and records private exclusions", () => {
  const plan = buildQueryPlan({ title: "合成作品", author: "合成作者", standardWorkId: "internal-secret" });
  assert.equal(plan.length, QUERY_BUDGET.plannedQueriesPerWork);
  assert.ok(plan.length <= QUERY_BUDGET.maxQueriesPerWork);
  assert.ok(plan.every((query) => query.maxResults <= QUERY_BUDGET.maxResultsPerQuery));
  assert.ok(plan.every((query) => query.maxPages <= QUERY_BUDGET.maxPagesPerWork));
  assert.ok(plan.every((query) => query.excludedPrivateFields.includes("revenue")));
  assert.ok(plan.every((query) => !query.queryText.includes("internal-secret")));
  assert.deepEqual(validateQueryPlan(plan, 1), { valid: true, issues: [] });
});

test("entity resolution requires work and author and rejects same-name title-only match", () => {
  const work = { title: "同名作品", author: "作者甲" };
  const composite = resolveEntity({ work, candidate: { title: "同名作品", author: "作者甲" }, sameNameCount: 2 });
  assert.equal(composite.status, "resolved");
  assert.equal(composite.matchMethod, "deterministic_composite_match");

  const titleOnly = resolveEntity({ work, candidate: { title: "同名作品", author: "作者乙" }, sameNameCount: 2 });
  assert.equal(titleOnly.status, "ambiguous");
  assert.equal(titleOnly.matchMethod, "title_only_rejected");
  assert.equal(titleOnly.resolvedEntity, null);
});

test("entity resolution hashes alternate candidates and authoritative identifier wins", () => {
  const result = resolveEntity({
    work: { title: "合成作品", author: "合成作者" },
    candidate: { authoritativeIdentifier: "official:123", alternateCandidates: ["sensitive alternate"] },
  });
  assert.equal(result.status, "resolved");
  assert.equal(result.matchMethod, "authoritative_identifier");
  assert.equal(result.alternateCandidateHashes.length, 1);
  assert.equal(result.alternateCandidateHashes[0].length, 64);
  assert.ok(!result.alternateCandidateHashes.includes("sensitive alternate"));
});

test("evidence schema, allowlist, three clocks, confidence min rule and citation pass together", () => {
  const record = evidence();
  const result = validateEvidenceRecord(record, {
    sourceAllowlist: allowedSourcePolicy(),
    evidenceAsOfAt: "2026-07-04T00:00:00.000Z",
    predictionLockedAt: "2026-07-05T00:00:00.000Z",
    featureManifestPreRegistered: true,
  });
  assert.deepEqual(result.issues, []);
  assert.equal(result.valid, true);
  assert.equal(result.predictionEligible, true);
  assert.equal(result.confidenceOverall, 0.85);
  assert.equal(result.eligibleTime, "2026-07-03T00:00:00.000Z");
});

test("unknown availableAt and prospective clock violations cannot become prediction evidence", () => {
  const unknown = evidence({
    timestamps: { availableAtStatus: "unknown", availableAt: null },
  });
  const unknownResult = validateEvidenceRecord(unknown, {
    sourceAllowlist: allowedSourcePolicy(),
    evidenceAsOfAt: "2026-07-04T00:00:00.000Z",
    predictionLockedAt: "2026-07-05T00:00:00.000Z",
    featureManifestPreRegistered: true,
  });
  assert.equal(unknownResult.predictionEligible, false);
  assert.ok(unknownResult.issues.includes("prediction_allowed_without_all_gates"));

  const lateCapture = evidence({ timestamps: { capturedAt: "2026-07-06T00:00:00.000Z" } });
  const lateResult = validateEvidenceRecord(lateCapture, {
    sourceAllowlist: allowedSourcePolicy(),
    evidenceAsOfAt: "2026-07-04T00:00:00.000Z",
    predictionLockedAt: "2026-07-05T00:00:00.000Z",
    featureManifestPreRegistered: true,
  });
  assert.equal(lateResult.predictionEligible, false);
});

test("unresolved entity, unresolved conflict, unapproved source and missing citation fail closed", () => {
  const record = evidence({
    entityResolution: { work: { status: "unresolved" }, author: { status: "resolved" } },
    contradiction: { status: "unresolved", currentClaimDisposition: "not_applicable" },
    source: { sourceDomain: "not-approved.example", sourceLocator: null },
    extraction: { extractorType: "llm_structured_extraction" },
  });
  const result = validateEvidenceRecord(record, {
    sourceAllowlist: allowedSourcePolicy(),
    evidenceAsOfAt: "2026-07-04T00:00:00.000Z",
    predictionLockedAt: "2026-07-05T00:00:00.000Z",
    featureManifestPreRegistered: true,
  });
  assert.equal(result.predictionEligible, false);
  assert.ok(result.issues.includes("citation_missing"));
  assert.ok(result.issues.includes("llm_without_source_rejected"));
  assert.ok(result.issues.includes("prediction_allowed_without_all_gates"));
  assert.equal(result.sourceEvaluation.reason, "domain_not_explicitly_allowlisted");
});

test("confidence labels cannot override the min-component rule", () => {
  const record = evidence({
    confidence: { entityMatchConfidence: 0.7, overall: 0.9, tier: "high" },
  });
  const result = validateEvidenceRecord(record, {
    sourceAllowlist: allowedSourcePolicy(),
    evidenceAsOfAt: "2026-07-04T00:00:00.000Z",
    predictionLockedAt: "2026-07-05T00:00:00.000Z",
    featureManifestPreRegistered: true,
  });
  assert.ok(result.issues.includes("confidence_min_rule_violated"));
  assert.equal(result.predictionEligible, false);
});

test("contradiction resolver uses source precedence and leaves equal-tier conflicts unresolved", () => {
  const authoritative = evidence({ evidenceId: "ev-a", structuredValue: { valueType: "category", textValue: "A" } });
  const weak = evidence({
    evidenceId: "ev-b",
    structuredValue: { valueType: "category", textValue: "B" },
    source: { sourceClass: "permitted_public_page" },
  });
  const resolved = resolveContradictions([authoritative, weak], "2026-07-06T00:00:00.000Z");
  assert.equal(resolved[0].status, "resolved");
  assert.equal(resolved[0].winnerEvidenceId, "ev-a");

  const equalTier = resolveContradictions([
    authoritative,
    evidence({ evidenceId: "ev-c", structuredValue: { valueType: "category", textValue: "C" } }),
  ]);
  assert.equal(equalTier[0].status, "unresolved");
  assert.equal(equalTier[0].winnerEvidenceId, null);
});

test("receipt cache makes resume deterministic without a second provider call", async () => {
  let calls = 0;
  const provider = {
    providerId: "synthetic_counting_provider",
    providerVersion: "v1",
    mode: "structured_search",
    async execute(request) {
      calls += 1;
      return {
        queryId: request.queryId,
        queryHash: request.queryHash,
        capturedAt: "2026-07-17T00:00:00.000Z",
        resultCount: 0,
        pageCount: 0,
        results: [],
        pages: [],
      };
    },
  };
  const plan = buildQueryPlan({ title: "缓存测试", author: "合成作者" }).slice(0, 2);
  const first = await executePlanWithCache(provider, plan);
  const second = await executePlanWithCache(provider, plan, first.cache);
  assert.equal(calls, 2);
  assert.equal(first.cacheHitCount, 0);
  assert.equal(second.cacheHitCount, 2);
  assert.deepEqual(second.receipts, first.receipts);
});

test("reproducibility metrics compare claim/value/source and never invent evidence", () => {
  const first = [evidence()];
  const second = [evidence()];
  const result = compareReproducibility(first, second);
  assert.equal(result.evaluable, true);
  assert.equal(result.claimAgreement, 1);
  assert.equal(result.structuredValueAgreement, 1);
  assert.equal(result.sourceOverlap, 1);
  assert.equal(result.confidenceDrift, 0);
});

test("public sanitizer rejects identifiers, URLs, snippets and query text", () => {
  assert.equal(assertPublicSanitized({ aggregate: { count: 160 } }), true);
  assert.throws(() => assertPublicSanitized({ rows: [{ title: "private" }] }), /public_sanitization_failed/u);
  assert.throws(() => assertPublicSanitized({ sourceUrl: "https://example" }), /public_sanitization_failed/u);
  assert.throws(() => assertPublicSanitized({ queryText: "private query" }), /public_sanitization_failed/u);
});

test("private artifact paths are constrained to the ignored pilot role", () => {
  assert.equal(PRIVATE_STORE_RELATIVE, "data/private-output/m2-v2-evidence-pilot");
  assert.equal(isAllowedPrivateArtifactPath(`${PRIVATE_STORE_RELATIVE}/manifest.json`), true);
  assert.equal(isAllowedPrivateArtifactPath(`${PRIVATE_STORE_RELATIVE}/../escape.json`), false);
  assert.equal(isAllowedPrivateArtifactPath("docs/analysis/m2-v2/private.json"), false);
});

test("balanced sample is deterministic, unique and satisfies every feasible preregistered target", () => {
  const population = Array.from({ length: 400 }, (_, index) => {
    const revenueBands = ["top1", "top5", "top10", "middle", "long_tail"];
    const revenueModels = ["pure_sales_share", "pure_buyout", "buyout_plus_sales", "unknown_revenue_model"];
    const activities = ["dense", "intermittent", "dormant"];
    const evidencePriors = ["rich", "mixed", "sparse"];
    const revenueBand = revenueBands[index % revenueBands.length];
    return {
      standardWorkId: `synthetic-${String(index).padStart(4, "0")}`,
      identityDigest: `digest-${index}`,
      sourceType: index % 2 ? "publication" : "web_original",
      revenueBand,
      revenueModel: revenueModels[index % revenueModels.length],
      activity: activities[index % activities.length],
      ambiguityRisk: index % 5 === 0 ? "high" : index % 5 === 1 ? "medium" : "low",
      evidencePrior: evidencePriors[index % evidencePriors.length],
      highValue: ["top1", "top5", "top10"].includes(revenueBand),
    };
  });
  const first = selectPilotSample(population, PILOT_SIZE, "20260717");
  const second = selectPilotSample(population, PILOT_SIZE, "20260717");
  assert.equal(first.sample.length, PILOT_SIZE);
  assert.equal(new Set(first.sample.map((item) => item.standardWorkId)).size, PILOT_SIZE);
  assert.deepEqual(first.sample.map((item) => item.standardWorkId), second.sample.map((item) => item.standardWorkId));
  assert.ok(Object.values(first.targetAchievement).every((item) => item.achieved));
});

test("income fact dates are normalized to the authoritative YYYY-MM cutoff before comparison", () => {
  assert.equal(normalizeBillMonth("2026-04-01"), "2026-04");
  assert.equal(normalizeBillMonth("2026-05-01"), "2026-05");
  assert.throws(() => normalizeBillMonth("not-a-month"), /income_fact_month_invalid/u);
});

test("all 17 V2-B hard gates are explicit and require true, never truthy", () => {
  const pass = evaluateHardGate(Object.fromEntries(HARD_GATE_IDS.map((id) => [id, true])));
  assert.equal(pass.totalCount, 17);
  assert.equal(pass.passedCount, 17);
  assert.equal(pass.allPassed, true);
  const fail = evaluateHardGate({ ...Object.fromEntries(HARD_GATE_IDS.map((id) => [id, true])), b4_unchanged: "true" });
  assert.equal(fail.allPassed, false);
  assert.equal(fail.passedCount, 16);
});

test("machine-readable PRD/provider/source/design/prereg contracts agree and source list is fail-closed", () => {
  const prd = read("docs/prd/m2-v2/M2-v2-evidence-pilot-prd-v0.1.json");
  const design = read("docs/technical-design/m2-v2/M2-v2-evidence-pilot-design-v0.1.json");
  const provider = read("docs/technical-design/m2-v2/M2-v2-provider-policy-v0.1.json");
  const allowlist = read("docs/technical-design/m2-v2/M2-v2-source-allowlist-v0.1.json");
  const prereg = read("docs/analysis/m2-v2/M2-v2-evidence-pilot-pre-registration-v0.1.json");
  assert.equal(prd.population.targetSampleCount, 160);
  assert.equal(design.sample.size, 160);
  assert.equal(prereg.sample.sampleCount, 160);
  assert.deepEqual(prd.providerModes, provider.precedence);
  assert.equal(provider.registry.find((item) => item.mode === "no_provider_available").enabled, true);
  assert.equal(provider.registry.filter((item) => item.mode !== "no_provider_available").every((item) => !item.enabled), true);
  assert.deepEqual(allowlist.approvedDomainEntries, []);
  assert.equal(allowlist.explicitDomainEntryRequired, true);
  assert.equal(prd.authority.modelTrainingAuthorized, false);
  assert.equal(prd.authority.finalHoldoutAuthorized, false);
});

test("V2-A evidence JSON Schema still exposes provider/time/confidence/conflict/admissibility", () => {
  const schema = read("docs/technical-design/m2-v2/M2-v2-external-evidence.schema.json");
  for (const key of ["provider", "timestamps", "confidence", "contradiction", "admissibility"]) {
    assert.ok(schema.required.includes(key), key);
    assert.ok(schema.properties[key], key);
  }
  assert.equal(schema.properties.schemaVersion.const, EVIDENCE_SCHEMA_VERSION);
});

test("public result artifacts, when generated, remain aggregate-only and non-formal", (context) => {
  const summaryPath = path.join(root, "docs/analysis/m2-v2/M2-v2-evidence-pilot-summary-v0.1.json");
  const gatePath = path.join(root, "docs/analysis/m2-v2/M2-v2-evidence-pilot-gate-v0.1.json");
  if (!fs.existsSync(summaryPath) || !fs.existsSync(gatePath)) {
    context.skip("pilot result reports are generated only after the frozen framework checkpoint");
    return;
  }
  const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  const gate = JSON.parse(fs.readFileSync(gatePath, "utf8"));
  assert.equal(assertPublicSanitized(summary), true);
  assert.equal(assertPublicSanitized(gate), true);
  assert.equal(summary.status, "not_for_formal_decision");
  assert.equal(summary.boundaries.modelTrainingPerformed, false);
  assert.equal(summary.boundaries.b4Changed, false);
  assert.equal(summary.boundaries.finalHoldoutOpened, false);
  assert.equal(gate.notForFormalDecision, true);
  assert.equal(gate.releaseAuthorized, false);
  assert.equal(gate.hardGate.conditions.at(-1).id, "all_tests_pass");
  assert.match(gate.hardGate.conditions.at(-1).evidence, /^commands=6;passed=6$/u);
});

function read(relative) {
  return JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
}

function deepMerge(base, overrides) {
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) return overrides ?? base;
  const result = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (value && typeof value === "object" && !Array.isArray(value) && base?.[key] && typeof base[key] === "object") {
      result[key] = deepMerge(base[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}
