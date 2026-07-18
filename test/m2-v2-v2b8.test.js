import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { sourceIdForV2B5Url } from "../src/domain/m2V2EvidencePilot/sourceRecordV2B5.js";
import {
  V2B8_GATE_THRESHOLDS,
  V2B8_MAX_REPAIRS,
  V2B8_MODEL_ID,
  V2B8_NAMESPACE,
  V2B8_RELAY_REQUEST_CAP,
  V2B8_TAVILY_REQUEST_CAP,
  checkAndFreezeV2B8Contract,
} from "../src/domain/m2V2EvidencePilot/v2b8Contract.js";
import {
  auditV2B8Conflicts,
  buildV2B8FallbackPlan,
  canonicalizeV2B8Claim,
  classifyV2B8QueryExecution,
  classifyV2B8Source,
  compareV2B8CanonicalClaims,
  decomposeV2B8ClaimDifferences,
  extractV2B8EventTime,
  normalizeV2B8Text,
  selectDeterministicV2B8Sources,
  validateV2B8FallbackPlan,
} from "../src/domain/m2V2EvidencePilot/v2b8Stability.js";

const root = process.cwd();

test("V2-B.8 freezes the existing manifest, repeat and bundle with new request caps", () => {
  const privateManifest = join(root, "data/private-output/m2-v2-evidence-pilot/v2-b5-independent-search-canary/canary-v3-manifest-private-v0.1.json");
  if (existsSync(privateManifest)) {
    const frozen = checkAndFreezeV2B8Contract(root, { now: () => "2026-07-18T09:00:00.000Z" });
    assert.equal(frozen.contract.manifestDigest, "4288ad6130fe34da6f56f361604d44f1124313b3b3f4fc98b870570333d65f23");
    assert.equal(frozen.contract.repeatDigest, "e3be6282451c02d6a630aeec322951d62fc477ca9e27d0f9cc2db0fc68e471fc");
    assert.equal(frozen.contract.sourceBundleDigest, "d68896763b2a7b63afd3580c623e06cd72eaa9432b396dd3e9e62b6a50f643df");
    assert.equal(frozen.contract.noSampleReplacement, true);
  } else {
    const contract = JSON.parse(readFileSync(join(root, "docs/technical-design/m2-v2/M2-v2-source-selection-contract-v0.1.json"), "utf8"));
    assert.equal(contract.sampleReplacementAllowed, false);
  }
  assert.equal(V2B8_NAMESPACE, "v2b8-canary-stability");
  assert.equal(V2B8_MODEL_ID, "gpt-5.6-terra");
  assert.equal(V2B8_TAVILY_REQUEST_CAP, 12);
  assert.equal(V2B8_RELAY_REQUEST_CAP, 24);
  assert.equal(V2B8_MAX_REPAIRS, 4);
});

test("V2-B.8 query failure classification distinguishes the authorized categories", () => {
  assert.equal(classifyV2B8QueryExecution({ contractValid: true }), "success_contract_valid");
  assert.equal(classifyV2B8QueryExecution({ httpSuccess: true, resultCount: 0 }), "http_success_zero_result");
  assert.equal(classifyV2B8QueryExecution({ httpSuccess: true, resultCount: 6 }), "http_success_contract_invalid");
  assert.equal(classifyV2B8QueryExecution({ httpSuccess: false, httpStatus: null, status: "transport_error" }), "transport");
  assert.equal(classifyV2B8QueryExecution({ httpStatus: 429 }), "auth_or_rate_limit");
  assert.equal(classifyV2B8QueryExecution({ status: "indeterminate_after_crash" }), "indeterminate_after_crash");
});

test("V2-B.8 deterministic fallback preserves title and author and never broadens search", () => {
  const work = { title: "测试作品", author: "测试作者", canarySlotId: "slot01" };
  const failure = { queryId: "qry_old", intent: "public_evidence", httpSuccess: true, resultCount: 0 };
  const left = buildV2B8FallbackPlan({ work, failure });
  const right = buildV2B8FallbackPlan({ work, failure });
  assert.deepEqual(left, right);
  assert.equal(left.queryText, '"测试作品" "测试作者"');
  assert.equal(left.country, null);
  assert.equal(validateV2B8FallbackPlan(left, work).valid, true);
  assert.equal(left.maxResults, 6);
});

test("V2-B.8 source classifier is deterministic across governance categories", () => {
  assert.equal(classifyV2B8Source(source(1, "https://registry.gov.cn/item", "登记中心", "作品登记")), "government_or_registry");
  assert.equal(classifyV2B8Source(source(2, "https://press.example.com/item", "某出版社", "出版集团")), "official_publisher");
  assert.equal(classifyV2B8Source(source(3, "https://platform.example.com/item", "起点作品", "原作连载")), "official_platform");
  assert.equal(classifyV2B8Source(source(4, "https://unknown.example.com/item", "普通页面", "公开信息")), "unknown_public_web");
});

test("V2-B.8 source selection applies category priority, relevance, score and domain diversity", () => {
  const records = [
    source(1, "https://same.example.com/1", "普通", "普通", 0.99),
    source(2, "https://same.example.com/2", "普通", "普通", 0.98),
    source(3, "https://same.example.com/3", "普通", "普通", 0.97),
    source(4, "https://press.example.com/4", "测试作品 出版社", "测试作者", 0.5),
    source(5, "https://other.example.com/5", "测试作品", "测试作者", 0.4),
  ];
  const result = selectDeterministicV2B8Sources(records, { work: { title: "测试作品", author: "测试作者" }, limit: 4 });
  assert.equal(result.sourceRecords[0].sourceId, records[3].sourceId);
  assert.equal(result.sourceRecords.filter((record) => record.domain === "same.example.com").length, 2);
  assert.equal(result.domainDiversityCount, 3);
});

test("V2-B.8 canonical text normalizes Unicode width, punctuation, whitespace and book marks", () => {
  assert.equal(normalizeV2B8Text("《Ｔｅｓｔ， 作品》"), "test 作品");
});

test("V2-B.8 identity canonicalization preserves edition distinctions", () => {
  const base = claim("work_identity", "《作品》");
  const full = canonicalizeV2B8Claim(base, { work: { title: "作品" }, sourceRecords: [source(1)] });
  const edition = canonicalizeV2B8Claim({ ...base, structuredValue: structured("作品 大结局") }, { work: { title: "作品" }, sourceRecords: [source(1)] });
  assert.notEqual(full.canonicalClaimKey, edition.canonicalClaimKey);
});

test("V2-B.8 event time preserves day, month, year and range precision without fabricated dates", () => {
  assert.deepEqual(pickTime(extractV2B8EventTime({ claimType: "publication_event", structuredValue: structured("2000年") })), ["2000", "year"]);
  assert.deepEqual(pickTime(extractV2B8EventTime({ claimType: "publication_event", structuredValue: structured("2006年1月") })), ["2006-01", "month"]);
  assert.deepEqual(pickTime(extractV2B8EventTime({ claimType: "publication_event", structuredValue: structured("2020-03-01") })), ["2020-03-01", "day"]);
  assert.deepEqual(pickTime(extractV2B8EventTime({ claimType: "publication_event", structuredValue: structured("2001年至2003年") })), ["2001/2003", "range"]);
});

test("V2-B.8 extracts an explicit temporal date from supporting snippet", () => {
  const time = extractV2B8EventTime({ claimType: "adaptation_event", structuredValue: structured("启动改编") }, [source(1, undefined, "页面", "项目于2014年启动改编")]);
  assert.equal(time.eventTime, "2014");
  assert.equal(time.eventTimePrecision, "year");
  assert.equal(time.eventTimeBasis, "explicit_source_snippet");
  assert.equal(time.extractionSucceeded, true);
});

test("V2-B.8 completion contradiction is excluded from pilot usability", () => {
  const completed = canonicalizeV2B8Claim(claim("completion_status", "已完结", "c1"), { work: { title: "作品" }, sourceRecords: [source(1)] });
  const ongoing = canonicalizeV2B8Claim(claim("completion_status", "连载中", "c2"), { work: { title: "作品" }, sourceRecords: [source(1)] });
  const result = auditV2B8Conflicts([{ ...completed, runKind: "primary", canarySlotId: "slot01" }, { ...ongoing, runKind: "primary", canarySlotId: "slot01" }]);
  assert.equal(result.unresolvedConflictCount, 1);
  assert.equal(result.claims.every((item) => item.pilotUsable === false && item.contradictionStatus === "unresolved"), true);
});

test("V2-B.8 rating requires platform and scale, while review remains a weak signal", () => {
  const rating = canonicalizeV2B8Claim(claim("rating_signal", "7.6"), { work: { title: "作品" }, sourceRecords: [source(1)] });
  const review = canonicalizeV2B8Claim(claim("review_signal", "很好"), { work: { title: "作品" }, sourceRecords: [source(1)] });
  assert.equal(rating.pilotUsable, false);
  assert.equal(rating.rejectionReasons.includes("rating_platform_or_scale_missing"), true);
  assert.equal(review.pilotUsable, false);
  assert.equal(review.rejectionReasons.includes("review_signal_weak_subjective"), true);
});

test("V2-B.8 semantic agreement is distinct from raw source-bound agreement", () => {
  const a = canonicalizeV2B8Claim(claim("work_identity", "《作品》"), { work: { title: "作品" }, sourceRecords: [source(1)] });
  const b = canonicalizeV2B8Claim({ ...claim("work_identity", "作品"), supportingSourceIds: [source(2).sourceId] }, { work: { title: "作品" }, sourceRecords: [source(2)] });
  const comparison = compareV2B8CanonicalClaims([a], [b]);
  const decomposition = decomposeV2B8ClaimDifferences({ primaryClaims: [a], freshClaims: [b], sameSourceClaims: [a], primarySourceDigest: "a", freshSourceDigest: "b" });
  assert.equal(comparison.status, "evaluable");
  assert.equal(comparison.agreement, 1);
  assert.equal(decomposition.sourceSetChanged, true);
  assert.equal(decomposition.canonicalizationOnlyDifference, true);
});

test("V2-B.8 no-claim comparison is N/A rather than zero", () => {
  const result = compareV2B8CanonicalClaims([], []);
  assert.equal(result.status, "not_evaluable");
  assert.equal(result.agreement, null);
});

test("V2-B.8 gates retain frozen quality thresholds and never authorize full160", () => {
  assert.equal(V2B8_GATE_THRESHOLDS.querySuccessRate, 0.8);
  assert.equal(V2B8_GATE_THRESHOLDS.sameSourceClaimAgreement, 0.8);
  assert.equal(V2B8_GATE_THRESHOLDS.endToEndSemanticClaimAgreement, 0.8);
  assert.equal(V2B8_GATE_THRESHOLDS.unknownPublicWebClaimShare, 0.4);
  const timeContract = JSON.parse(readFileSync(join(root, "docs/technical-design/m2-v2/M2-v2-event-time-conflict-contract-v0.2.json"), "utf8"));
  assert.equal(timeContract.full160Authorized, false);
});

function source(index, url = `https://example${index}.com/item`, title = "测试作品", snippet = "测试作者 公开内容", score = 0.5) {
  const parsed = new URL(url);
  return {
    schema: "m2.v2.evidence-source-record.v0.2",
    sourceId: sourceIdForV2B5Url(url),
    queryId: "qry_test",
    title,
    url,
    domain: parsed.hostname,
    snippet,
    providerScore: score,
    searchProvider: "tavily_structured_search",
    providerRequestId: null,
    capturedAt: "2026-07-18T00:00:00.000Z",
    availableAt: "2026-07-18T00:00:00.000Z",
    availableAtBasis: "first_observed_by_system",
    eventTime: null,
    sourceTypeCandidate: "unknown_public_web",
    providerReceiptRef: `sha256:${"a".repeat(64)}`,
    researchOnly: true,
    modelEligible: false,
  };
}

function structured(text) {
  return { valueType: "text", textValue: text, dateValue: null, numberValue: null, booleanValue: null };
}

function claim(claimType, value, claimId = "c1") {
  return {
    claimId,
    claim: `${claimType}: ${value}`,
    claimType,
    structuredValue: structured(value),
    supportingSourceIds: [source(1).sourceId],
    confidence: 0.9,
    eventTime: null,
    availableAt: "2026-07-18T00:00:00.000Z",
    entityResolution: { work: { status: "high", confidence: 0.9 }, author: { status: "high", confidence: 0.9 } },
    contradictionStatus: "none",
    limitations: [],
    accepted: true,
    pilotUsable: true,
    rejectionReasons: [],
  };
}

function pickTime(value) {
  return [value.eventTime, value.eventTimePrecision];
}
