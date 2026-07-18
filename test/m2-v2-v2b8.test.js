import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { sourceIdForV2B5Url } from "../src/domain/m2V2EvidencePilot/sourceRecordV2B5.js";
import { createReceiptEnvelope } from "../src/domain/m2V2EvidencePilot/integrityState.js";
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
  V2B8_CONFLICT_FAMILIES,
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
import {
  __test as v2b8RuntimeTest,
  buildV2B8ExtractionPayload,
  evaluateV2B8Canary,
  recanonicalizeV2B8EffectiveReceipts,
  validateV2B8ExtractionPayload,
} from "../src/domain/m2V2EvidencePilot/v2b8Runtime.js";

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
  const publisher = source(2, "https://press.example.com/item", "某出版社", "出版集团");
  const platform = source(3, "https://platform.example.com/item", "起点作品", "原作连载");
  const registry = source(1, "https://registry.gov.cn/item", "登记中心", "作品登记");
  assert.equal(classifyV2B8Source(registry), "unknown_public_web");
  assert.equal(classifyV2B8Source(registry, officialEvidence(registry, "government_or_registry")), "government_or_registry");
  assert.equal(classifyV2B8Source(publisher), "unknown_public_web");
  assert.equal(classifyV2B8Source(publisher, officialEvidence(publisher, "official_publisher")), "official_publisher");
  assert.equal(classifyV2B8Source(platform, officialEvidence(platform, "official_platform", "providerMetadata")), "official_platform");
  assert.equal(classifyV2B8Source(source(4, "https://unknown.example.com/item", "普通页面", "公开信息")), "unknown_public_web");
});

test("V2-B.8 source selection applies category priority, relevance, score and domain diversity", () => {
  const publisher = source(4, "https://press.example.com/4", "测试作品 出版社", "测试作者", 0.5);
  const records = [
    source(1, "https://same.example.com/1", "普通", "普通", 0.99),
    source(2, "https://same.example.com/2", "普通", "普通", 0.98),
    source(3, "https://same.example.com/3", "普通", "普通", 0.97),
    publisher,
    source(5, "https://other.example.com/5", "测试作品 ISBN catalog", "测试作者", 0.4),
  ];
  const result = selectDeterministicV2B8Sources(records, { work: { title: "测试作品", author: "测试作者" }, limit: 4, classificationEvidenceBySourceId: { [publisher.sourceId]: officialEvidence(publisher, "official_publisher") } });
  assert.equal(result.sourceRecords[0].sourceId, records[3].sourceId);
  assert.equal(result.sourceRecords.filter((record) => record.domain === "same.example.com").length, 2);
  assert.equal(result.domainDiversityCount, 3);
  assert.equal(result.categoryDiversityAchieved, 3);
  assert.equal(result.identityReservationApplied, true);
});

test("V2-B.8 source diversity uses normalized domains and cannot be inflated by casing", () => {
  const records = [
    source(10, "https://same.example.com/1", "普通页面", "公开信息", 0.9),
    { ...source(11, "https://same.example.com/2", "普通页面", "公开信息", 0.8), domain: "SAME.EXAMPLE.COM" },
  ];
  const result = selectDeterministicV2B8Sources(records, {
    work: { title: "测试作品", author: "测试作者" },
    limit: 2,
    categoryDiversityTarget: 2,
  });
  assert.equal(result.domainDiversityCount, 1);
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
  assert.deepEqual(pickTime(extractV2B8EventTime({ claimType: "publication_event", structuredValue: structured("2000年") }, [source(1, undefined, "出版信息", "作品于2000年出版")])), ["2000", "year"]);
  assert.deepEqual(pickTime(extractV2B8EventTime({ claimType: "publication_event", structuredValue: structured("2006年1月") }, [source(1, undefined, "出版信息", "作品于2006年1月出版")])), ["2006-01", "month"]);
  assert.deepEqual(pickTime(extractV2B8EventTime({ claimType: "publication_event", structuredValue: structured("2020-03-01") }, [source(1, undefined, "出版信息", "作品于2020-03-01出版")])), ["2020-03-01", "day"]);
  assert.deepEqual(pickTime(extractV2B8EventTime({ claimType: "publication_event", structuredValue: structured("2001年至2003年") }, [source(1, undefined, "出版信息", "作品于2001年至2003年出版")])), ["2001/2003", "range"]);
});

test("V2-B.8 extracts an explicit temporal date from supporting snippet", () => {
  const time = extractV2B8EventTime({ claimType: "adaptation_event", structuredValue: structured("启动改编") }, [source(1, undefined, "页面", "项目于2014年启动改编")]);
  assert.equal(time.eventTime, "2014");
  assert.equal(time.eventTimePrecision, "year");
  assert.equal(time.eventTimeBasis, "explicit_source_snippet");
  assert.equal(time.extractionSucceeded, true);
});

test("V2-B.8 does not borrow publication dates for non-temporal identity claims", () => {
  const time = extractV2B8EventTime({ claimType: "work_identity", structuredValue: structured("测试作品"), eventTime: null }, [source(1, undefined, "测试作品", "测试作者 2014年出版")]);
  assert.deepEqual(pickTime(time), [null, "unknown"]);
  assert.equal(time.eventTimeBasis, "unknown");
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

test("V2-B.8 extraction payload is Terra-only, strict, source-bound and stable-core capped", () => {
  const payload = buildV2B8ExtractionPayload({
    work: { title: "测试作品", author: "测试作者", sourceType: "publication" },
    sourceRecords: [source(1)],
  });
  assert.equal(payload.model, "gpt-5.6-terra");
  assert.equal(payload.text.format.type, "json_schema");
  assert.equal(payload.text.format.strict, true);
  assert.equal(payload.store, false);
  assert.equal(Object.hasOwn(payload, "reasoning"), false);
  assert.equal(Object.hasOwn(payload, "tools"), false);
  assert.match(payload.input, /at most 10 claims/u);
  assert.doesNotMatch(payload.input, /https?:\/\//u);
});

test("V2-B.8 extraction projection rejects URLs and private runtime identifiers", () => {
  const projected = [{ sourceId: source(1).sourceId, title: "标题", domain: "example1.com", snippet: "摘要", capturedAt: "2026-07-18T00:00:00.000Z", availableAt: "2026-07-18T00:00:00.000Z" }];
  const payload = buildV2B8ExtractionPayload({ work: { title: "测试作品", author: "测试作者", sourceType: "publication" }, sourceRecords: [source(1)] });
  assert.equal(validateV2B8ExtractionPayload(payload, { records: projected }).valid, true);
  assert.doesNotMatch(JSON.stringify(payload), /canarySlotId|identityDigest|providerReceiptRef|providerScore/iu);
});

test("V2-B.8 required gates fail closed when a denominator or sample is missing", () => {
  const zeroDenominator = v2b8RuntimeTest.gate(
    "synthetic_required_ratio",
    v2b8RuntimeTest.requiredRatio(0, 0),
    1,
    (actual, threshold) => actual >= threshold,
  );
  assert.deepEqual(
    { status: zeroDenominator.status, value: zeroDenominator.value, passed: zeroDenominator.passed },
    { status: "NOT_EVALUABLE", value: null, passed: false },
  );
  const missingSample = v2b8RuntimeTest.gate(
    "synthetic_missing_sample",
    v2b8RuntimeTest.requiredSampleRatio(5, 5, 4, 5),
    1,
    (actual, threshold) => actual >= threshold,
  );
  assert.equal(missingSample.status, "NOT_EVALUABLE");
  assert.equal(missingSample.passed, false);

  const evaluation = evaluateV2B8Canary({
    manifest: { sample: [], repeatSample: [] },
    v2b7: { primarySearch: { runs: [] }, repeatSearch: { runs: [] } },
    primarySearch: [],
    repeatSearch: [],
    effectiveReceipts: [],
    physicalReceipts: [],
  });
  for (const gateId of [
    "query_success_rate",
    "source_record_work_coverage",
    "primary_schema_pass_rate",
    "high_value_coverage",
    "same_source_claim_agreement",
    "explicit_temporal_extraction_complete",
  ]) {
    const gate = [...evaluation.safetyGates, ...evaluation.qualityGates].find((item) => item.id === gateId);
    assert.equal(gate.status, "NOT_EVALUABLE", gateId);
    assert.equal(gate.value, null, gateId);
    assert.equal(gate.passed, false, gateId);
  }
});

test("V2-B.8 source selection enforces category caps and records scarcity limitations", () => {
  const records = Array.from({ length: 6 }, (_, index) => source(
    index + 20,
    `https://single-category-${index}.example.com/item`,
    "ordinary result",
    "ordinary public content",
    1 - index / 10,
  ));
  const selected = selectDeterministicV2B8Sources(records, {
    work: { title: "synthetic work", author: "synthetic author" },
    limit: 6,
  });
  assert.equal(selected.sourceRecords.length, 2);
  assert.equal(selected.categoryCounts.unknown_public_web, 2);
  assert.equal(selected.limitations.includes("selection_capacity_not_filled_within_domain_and_category_caps"), true);
  assert.equal(selected.limitations.includes("positive_evidence_identity_source_unavailable"), true);
});

test("V2-B.8 event time is bound to a cited source span and never borrowed from another source", () => {
  const unsupported = source(30, undefined, "identity page", "no event date in this supporting record");
  const unrelated = source(31, undefined, "publication page", "published in 2018");
  const base = {
    ...claim("publication_event", "2018", "temporal-1"),
    supportingSourceIds: [unsupported.sourceId],
  };
  const rejected = canonicalizeV2B8Claim(base, {
    work: { title: "synthetic work" },
    sourceRecords: [unsupported, unrelated],
  });
  assert.equal(rejected.eventTime, null);
  assert.equal(rejected.eventTimeSourceId, null);
  assert.equal(rejected.eventTimeEvidenceSpanDigest, null);
  assert.equal(rejected.pilotUsable, false);

  const supported = canonicalizeV2B8Claim({ ...base, supportingSourceIds: [unrelated.sourceId] }, {
    work: { title: "synthetic work" },
    sourceRecords: [unsupported, unrelated],
  });
  assert.equal(supported.eventTime, "2018");
  assert.equal(supported.eventTimeSourceId, unrelated.sourceId);
  assert.match(supported.eventTimeEvidenceSpanDigest, /^[a-f0-9]{64}$/u);
  assert.equal(supported.eventTimeBasis, "explicit_structured_value");
  assert.equal(supported.eventTimePrecision, "year");

  const mixedDates = source(
    32,
    undefined,
    "publication history",
    "The website was founded in 2018; the work was published in 2020.",
  );
  const unrelatedDate = canonicalizeV2B8Claim({ ...base, supportingSourceIds: [mixedDates.sourceId] }, {
    work: { title: "synthetic work" },
    sourceRecords: [mixedDates],
  });
  assert.equal(unrelatedDate.eventTime, null);
  assert.equal(unrelatedDate.pilotUsable, false);
  const relatedDate = canonicalizeV2B8Claim({
    ...base,
    structuredValue: structured("2020"),
    supportingSourceIds: [mixedDates.sourceId],
  }, {
    work: { title: "synthetic work" },
    sourceRecords: [mixedDates],
  });
  assert.equal(relatedDate.eventTime, "2020");
  assert.equal(relatedDate.eventTimeSourceId, mixedDates.sourceId);
});

test("V2-B.8 conflict audit covers every declared family and rejects unresolved claims", () => {
  const rows = [
    conflictClaim("work_identity", { title: "work-a" }, "w1"),
    conflictClaim("work_identity", { title: "work-b" }, "w2"),
    conflictClaim("author_identity", { author: "author-a" }, "a1"),
    conflictClaim("author_identity", { author: "author-b" }, "a2"),
    conflictClaim("original_platform", { value: "platform-a" }, "o1"),
    conflictClaim("original_platform", { value: "platform-b" }, "o2"),
    conflictClaim("completion_status", { status: "completed" }, "c1"),
    conflictClaim("completion_status", { status: "ongoing" }, "c2"),
    conflictClaim("publication_event", { publisher: "publisher-a", publicationDate: "2020", edition: "first", format: "print" }, "p1"),
    conflictClaim("publication_event", { publisher: "publisher-b", publicationDate: "2020", edition: "first", format: "print" }, "p2"),
    conflictClaim("adaptation_event", { adaptationType: "film", stage: "started", eventTime: "2021" }, "d1"),
    conflictClaim("adaptation_event", { adaptationType: "film", stage: "released", eventTime: "2021" }, "d2"),
    conflictClaim("rating_signal", { platform: "ratings", scale: 10, value: 7 }, "r1", { eventTime: "2022" }),
    conflictClaim("rating_signal", { platform: "ratings", scale: 10, value: 8 }, "r2", { eventTime: "2022" }),
    conflictClaim("award_event", { value: "award winner" }, "g1", { contradictionKey: "award-2023" }),
    conflictClaim("award_event", { value: "award nominee" }, "g2", { contradictionKey: "award-2023" }),
    conflictClaim("market_signal", { value: "active" }, "m1", { contradictionKey: "exclusive-status" }),
    conflictClaim("search_heat_signal", { value: "inactive" }, "m2", { contradictionKey: "exclusive-status" }),
  ];
  const result = auditV2B8Conflicts(rows);
  assert.deepEqual(result.declaredConflictFamilies, [...V2B8_CONFLICT_FAMILIES]);
  assert.equal(V2B8_CONFLICT_FAMILIES.every((family) => result.conflictFamilyCoverage[family] === true), true);
  assert.equal(result.conflicts.length >= V2B8_CONFLICT_FAMILIES.length, true);
  assert.equal(result.claims.every((item) => item.accepted === false && item.pilotUsable === false), true);
});

test("V2-B.8 keeps distinct editions as a limitation instead of an automatic conflict", () => {
  const result = auditV2B8Conflicts([
    conflictClaim("publication_event", { publisher: "publisher", publicationDate: "2020", edition: "first", format: "print" }, "e1"),
    conflictClaim("publication_event", { publisher: "publisher", publicationDate: "2021", edition: "second", format: "print" }, "e2"),
  ]);
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.limitations.some((item) => item.reason === "valid_multi_edition_or_format"), true);
});

test("V2-B.8 audits conflicts before caps while applying the frozen post-audit claim cap", () => {
  const supporting = source(39);
  const response = {
    claims: [
      { ...claim("completion_status", "completed", "cap-conflict-1"), supportingSourceIds: [supporting.sourceId] },
      { ...claim("completion_status", "ongoing", "cap-conflict-2"), supportingSourceIds: [supporting.sourceId] },
    ],
  };
  const canonical = v2b8RuntimeTest.canonicalizeResponse(
    response,
    { canarySlotId: "slot01", title: "synthetic work", author: "synthetic author" },
    { runKind: "primary", sourceRecords: [supporting] },
  );
  assert.equal(canonical.claims.length, 1);
  assert.equal(canonical.v2b8ConflictAudit.unresolvedConflictCount, 1);
  assert.equal(canonical.claims.every((item) => item.accepted === false && item.pilotUsable === false), true);
  assert.equal(canonical.v2b8ConflictAudit.conflicts[0].claimKeys.length, 2);
  assert.equal(canonical.preCapConflictClaimKeyCount, 2);
  assert.equal(canonical.claimCapExcludedCount, 1);
  assert.equal(canonical.conflictedClaimsRetainedBeyondCaps, 0);
});

test("V2-B.8 can recanonicalize effective receipts offline without mutating inputs", () => {
  const supporting = source(40, undefined, "publication record", "published in 2019");
  const physicalReceipts = [createReceiptEnvelope({
    runKind: "primary",
    canarySlotId: "slot01",
    attemptKind: "primary",
    modelBindingVerified: true,
    providerContractCompatible: true,
    normalizedResponse: {
      contractValid: true,
      sourceIdReferenceCount: 230,
      mappedSourceIdReferenceCount: 230,
      claims: [{ ...claim("publication_event", "2019", "offline-1"), supportingSourceIds: [supporting.sourceId] }],
    },
  })];
  const before = JSON.stringify(physicalReceipts);
  const restated = recanonicalizeV2B8EffectiveReceipts({
    manifest: { sample: [{ canarySlotId: "slot01", title: "synthetic work", author: "synthetic author" }], repeatSample: [] },
    primarySearch: [{ canarySlotId: "slot01", runKind: "primary", sourceRecords: [supporting] }],
    repeatSearch: [],
    physicalReceipts,
  });
  assert.equal(JSON.stringify(physicalReceipts), before);
  assert.equal(restated[0].restatementStatus, "RECANONICALIZED_OFFLINE_FROM_PHYSICAL_RECEIPT");
  assert.equal(restated[0].normalizedResponse.claims[0].eventTimeSourceId, supporting.sourceId);
  assert.match(restated[0].normalizedResponse.claims[0].eventTimeEvidenceSpanDigest, /^[a-f0-9]{64}$/u);
  assert.equal(restated[0].normalizedResponse.sourceIdReferenceCount, 1);
  assert.equal(restated[0].normalizedResponse.mappedSourceIdReferenceCount, 1);
  assert.equal(restated[0].normalizedResponse.sourceIdIntegrityRate, 1);
  assert.equal(restated[0].normalizedResponse.restatementAggregatesRecomputed, true);
});

test("V2-B.8 effective-only restatement fallback is explicitly not evaluable", () => {
  const result = recanonicalizeV2B8EffectiveReceipts({
    manifest: { sample: [{ canarySlotId: "slot01" }], repeatSample: [] },
    primarySearch: [],
    repeatSearch: [],
    effectiveReceipts: [{ runKind: "primary", canarySlotId: "slot01", normalizedResponse: { claims: [] } }],
  });
  assert.equal(result[0].restatementStatus, "NOT_EVALUABLE_EFFECTIVE_RECEIPT_LACKS_PRE_CAP_CLAIMS");
  assert.equal(result[0].normalizedResponse, null);
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

function officialEvidence(record, category, kind = "approvedDomainRule") {
  return kind === "providerMetadata"
    ? { providerMetadata: { category, verified: true, field: "synthetic_provider_category" } }
    : { approvedDomainRule: { category, matched: true, domain: record.domain, ruleId: "synthetic-rule-v1" } };
}

function conflictClaim(claimType, normalizedStructuredValue, canonicalClaimKey, extra = {}) {
  return {
    claimType,
    normalizedStructuredValue,
    canonicalClaimKey,
    runKind: "primary",
    canarySlotId: "slot01",
    accepted: true,
    pilotUsable: true,
    contradictionStatus: "none",
    rejectionReasons: [],
    ...extra,
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
