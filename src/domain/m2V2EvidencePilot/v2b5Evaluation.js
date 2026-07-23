import { canonicalJson, sha256 } from "./pilotCore.js";
import {
  compareV2B5ClaimSets,
  compareV2B5StructuredValues,
} from "./extractionV2B5.js";
import { classifyV2B5ProhibitedSource } from "./sourceGovernanceV2B5.js";

export const V2B5_MODELS = Object.freeze(["gpt-5.6-luna", "gpt-5.6-terra"]);
export const V2B5_BENCHMARK_WORK_COUNT = 4;
export const V2B5_BENCHMARK_REPEAT_COUNT = 2;
export const V2B5_CANARY_WORK_COUNT = 10;
export const V2B5_CANARY_REPEAT_COUNT = 5;

export function buildV2B5WorkQueries(work, runKind = "primary", executionNamespace = "canary") {
  const title = cleanIdentity(work?.title);
  const author = cleanIdentity(work?.author);
  const sourceType = work?.sourceType === "publication" ? "publication" : "web_original";
  const slotId = cleanSlot(work?.canarySlotId);
  if (!title || !author || !slotId || !["primary", "repeat"].includes(runKind)) {
    throw new Error("v2b5_query_work_invalid");
  }
  const suffix = sourceType === "publication" ? "出版社 出版" : "原作 连载 完结";
  const plans = [
    { intent: "identity", queryText: `\"${title}\" \"${author}\" 作品 作者` },
    { intent: "public_evidence", queryText: `\"${title}\" \"${author}\" 原作 平台 评分 榜单 热度 改编 出版 ${suffix}` },
  ];
  return plans.map((plan) => ({
    schema: "m2.v2.tavily-query-plan.v0.1",
    queryId: `qry_${sha256({ executionNamespace, slotId, runKind, ...plan }).slice(0, 32)}`,
    executionNamespace,
    canarySlotId: slotId,
    runKind,
    intent: plan.intent,
    sourceType,
    queryText: plan.queryText,
  }));
}

export function validateV2B5WorkQueries(queries) {
  const issues = [];
  if (!Array.isArray(queries) || queries.length !== 2) return { valid: false, issues: ["query_count_invalid"] };
  if (new Set(queries.map((query) => query.queryId)).size !== 2) issues.push("query_id_duplicate");
  if (canonicalJson(queries.map((query) => query.intent).sort()) !== canonicalJson(["identity", "public_evidence"])) {
    issues.push("query_intent_invalid");
  }
  const prohibited = /(?:standard[_\s-]*work[_\s-]*id|raw[_\s-]*work[_\s-]*id|收入|账单|revenue|forecast|B4|评级|rating|版权|合同|内部渠道|运营备注)/iu;
  if (queries.some((query) => typeof query.queryText !== "string" || prohibited.test(query.queryText))) {
    issues.push("query_private_field_detected");
  }
  return { valid: issues.length === 0, issues: unique(issues) };
}

export function selectV2B5BenchmarkSample(canaryManifest) {
  assertFrozenCanary(canaryManifest);
  const candidates = [...canaryManifest.sample].sort(compareSlot);
  const combinations = combinationsOf(candidates, V2B5_BENCHMARK_WORK_COUNT);
  const ranked = combinations.map((items) => ({
    items,
    score: benchmarkCoverageScore(items),
    tie: items.map((item) => item.canarySlotId).sort().join("|"),
  })).sort((left, right) => right.score - left.score || left.tie.localeCompare(right.tie));
  const selected = ranked[0]?.items;
  if (!selected || benchmarkCoverageScore(selected) < 600) throw new Error("v2b5_benchmark_coverage_unavailable");
  const publication = selected.filter((item) => item.sourceType === "publication").sort(compareSlot)[0];
  const webOriginal = selected.filter((item) => item.sourceType === "web_original").sort(compareSlot)[0];
  if (!publication || !webOriginal) throw new Error("v2b5_benchmark_repeat_strata_invalid");
  return {
    sample: [...selected].sort(compareSlot),
    repeatSample: [publication, webOriginal].sort(compareSlot),
    selectionRule: "exhaustive_pre_retrieval_metadata_coverage_then_slot_lexicographic_v1",
  };
}

export function buildV2B5BenchmarkManifest(canaryManifest, createdAt = new Date().toISOString()) {
  const selection = selectV2B5BenchmarkSample(canaryManifest);
  const payload = {
    schema: "m2.v2.luna-terra-extraction-benchmark-manifest.v0.1",
    privateOnly: true,
    immutable: true,
    selectedBeforeRetrieval: true,
    createdAt,
    parentCanaryManifestDigest: canaryManifest.canaryManifestDigest,
    selectionRule: selection.selectionRule,
    models: [...V2B5_MODELS],
    sampleCount: V2B5_BENCHMARK_WORK_COUNT,
    repeatSampleCount: V2B5_BENCHMARK_REPEAT_COUNT,
    sample: selection.sample.map(privateWorkProjection),
    repeatSample: selection.repeatSample.map((item) => ({
      canarySlotId: item.canarySlotId,
      identityDigest: item.identityDigest,
    })),
    requestPolicy: {
      queriesPerWork: 2,
      maxSourceRecordsPerWork: 6,
      maxOutputTokens: 1_200,
      reasoningEffort: "low",
      retryCount: 0,
      sameSourceRecordsRequired: true,
      repeatSearchAllowed: false,
    },
    full160Authorized: false,
  };
  const { createdAt: _createdAt, ...immutablePayload } = payload;
  return { ...payload, benchmarkManifestDigest: sha256(immutablePayload) };
}

export function evaluateV2B5ExtractionBenchmark(input) {
  const manifest = input?.manifest;
  const receipts = Array.isArray(input?.relayReceipts) ? input.relayReceipts : [];
  if (manifest?.sampleCount !== V2B5_BENCHMARK_WORK_COUNT || manifest?.repeatSampleCount !== V2B5_BENCHMARK_REPEAT_COUNT) {
    throw new Error("v2b5_benchmark_manifest_invalid");
  }
  const perModel = Object.fromEntries(V2B5_MODELS.map((model) => [model, evaluateBenchmarkModel(model, manifest, receipts)]));
  const sameSourceRecordsVerified = verifySameBenchmarkSources(manifest, receipts);
  const routing = sameSourceRecordsVerified ? chooseV2B5ExtractionModels(perModel) : {
    extractionBenchmarkDecision: "FAIL",
    defaultExtractionModel: null,
    escalationModel: null,
    lunaStatus: "fairness_gate_failed",
    selectionReasons: ["same_source_records_not_verified"],
  };
  return {
    schema: "m2.v2.luna-terra-extraction-benchmark-evaluation.v0.1",
    privateOnly: true,
    evaluatedAt: latestTimestamp(receipts.map((receipt) => receipt.responseReceivedAt)) ?? input?.evaluatedAt ?? null,
    benchmarkManifestDigest: manifest.benchmarkManifestDigest,
    sameSourceRecordsVerified,
    perModel,
    extractionBenchmarkDecision: routing.extractionBenchmarkDecision,
    defaultExtractionModel: routing.defaultExtractionModel,
    escalationModel: routing.escalationModel,
    lunaStatus: routing.lunaStatus,
    selectionReasons: routing.selectionReasons,
    full160Authorized: false,
  };
}

export function chooseV2B5ExtractionModels(perModel) {
  const luna = perModel?.["gpt-5.6-luna"];
  const terra = perModel?.["gpt-5.6-terra"];
  const lunaPassed = luna?.hardSafetyGate?.allPassed === true;
  const terraPassed = terra?.hardSafetyGate?.allPassed === true;
  if (!lunaPassed && !terraPassed) {
    return {
      extractionBenchmarkDecision: "FAIL",
      defaultExtractionModel: null,
      escalationModel: null,
      lunaStatus: "hard_gate_failed",
      selectionReasons: ["both_models_failed_hard_safety_gate"],
    };
  }
  if (lunaPassed && !terraPassed) {
    return {
      extractionBenchmarkDecision: "PASS",
      defaultExtractionModel: "gpt-5.6-luna",
      escalationModel: null,
      lunaStatus: "default_only_safe_model",
      selectionReasons: ["luna_only_model_passing_hard_safety_gate", "failed_terra_not_used_for_escalation"],
    };
  }
  if (!lunaPassed && terraPassed) {
    return {
      extractionBenchmarkDecision: "PASS",
      defaultExtractionModel: "gpt-5.6-terra",
      escalationModel: "gpt-5.6-terra",
      lunaStatus: "hard_gate_failed",
      selectionReasons: ["terra_only_model_passing_hard_safety_gate"],
    };
  }
  const qualityConditions = {
    resolvedNotMateriallyWorse: luna.entity.workResolvedCount >= terra.entity.workResolvedCount - 1,
    pilotCoverageNotMateriallyWorse: luna.evidence.pilotUsableWorkCoverage >= terra.evidence.pilotUsableWorkCoverage - 0.10,
    repeatAgreementNotMateriallyWorse: luna.reproducibility.claimAgreement >= terra.reproducibility.claimAgreement - 0.10,
    noMaterialClaimQualityRegression: luna.evidence.rejectedRate <= terra.evidence.rejectedRate + 0.20
      && luna.source.sourceIdIntegrityRate === 1,
  };
  const efficiencyConditions = {
    latencyImprovementAtLeast30Percent: luna.costLatency.efficiencyObservationComplete === true
      && terra.costLatency.efficiencyObservationComplete === true
      && finite(luna.costLatency.p50LatencyMs)
      && finite(terra.costLatency.p50LatencyMs)
      && luna.costLatency.p50LatencyMs <= terra.costLatency.p50LatencyMs * 0.70,
    tokenImprovementAtLeast30Percent: luna.costLatency.efficiencyObservationComplete === true
      && terra.costLatency.efficiencyObservationComplete === true
      && finite(luna.costLatency.totalTokens)
      && finite(terra.costLatency.totalTokens)
      && luna.costLatency.totalTokens <= terra.costLatency.totalTokens * 0.70,
  };
  const lunaQualifies = Object.values(qualityConditions).every(Boolean)
    && Object.values(efficiencyConditions).some(Boolean);
  return lunaQualifies ? {
    extractionBenchmarkDecision: "PASS",
    defaultExtractionModel: "gpt-5.6-luna",
    escalationModel: "gpt-5.6-terra",
    lunaStatus: "default_quality_and_efficiency_qualified",
    selectionReasons: ["both_models_passed_hard_safety_gate", "luna_quality_noninferiority_passed", "luna_efficiency_improvement_at_least_30_percent"],
    qualityConditions,
    efficiencyConditions,
  } : {
    extractionBenchmarkDecision: "PASS",
    defaultExtractionModel: "gpt-5.6-terra",
    escalationModel: "gpt-5.6-terra",
    lunaStatus: "capacity_candidate",
    selectionReasons: ["both_models_passed_hard_safety_gate", "luna_default_qualification_not_fully_met", "quality_precedes_speed"],
    qualityConditions,
    efficiencyConditions,
  };
}

export function shouldEscalateV2B5Extraction(receipt, work) {
  const response = receipt?.normalizedResponse;
  if (!response || response.contractValid !== true) return true;
  const workStatus = response.entityResolution?.work?.status;
  const authorStatus = response.entityResolution?.author?.status;
  if (["unresolved", "ambiguous"].includes(workStatus)) return true;
  if ((response.claims ?? []).some((claim) => claim.claimType === "author_identity")
    && ["unresolved", "ambiguous"].includes(authorStatus)) return true;
  if (work?.highValue === true && !["high", "medium"].includes(workStatus)) return true;
  if ((response.contradictions ?? []).some((item) => !["none", "resolved"].includes(item.status))) return true;
  return false;
}

export function evaluateV2B5Canary(input) {
  const manifest = input?.manifest;
  const searchRuns = Array.isArray(input?.searchRuns) ? input.searchRuns : [];
  const relayReceipts = Array.isArray(input?.relayReceipts) ? input.relayReceipts : [];
  const executed = input?.executed === true;
  if (manifest?.sampleCount !== V2B5_CANARY_WORK_COUNT || manifest?.repeatSampleCount !== V2B5_CANARY_REPEAT_COUNT) {
    throw new Error("v2b5_canary_manifest_invalid");
  }
  const primarySlots = manifest.sample.map((work) => work.canarySlotId);
  const repeatSlots = manifest.repeatSample.map((work) => work.canarySlotId);
  const primaryRuns = primarySlots.map((slot) => searchRuns.find((run) => run.runKind === "primary" && run.canarySlotId === slot)).filter(Boolean);
  const repeatRuns = repeatSlots.map((slot) => searchRuns.find((run) => run.runKind === "repeat" && run.canarySlotId === slot)).filter(Boolean);
  const primaryReceipts = primarySlots.map((slot) => selectEffectiveCanaryReceipt(relayReceipts, "primary", slot)).filter(Boolean);
  const repeatReceipts = repeatSlots.map((slot) => selectEffectiveCanaryReceipt(relayReceipts, "repeat", slot)).filter(Boolean);
  const allCanaryAttempts = relayReceipts.filter((receipt) => receipt.phase === "canary");
  const auditableAttempts = allCanaryAttempts.filter((receipt) => receipt.attemptKind !== "compatibility_probe");
  const evaluablePrimaryReceipts = primaryReceipts.filter(receiptEvaluable);
  const evaluableRepeatReceipts = repeatReceipts.filter(receiptEvaluable);
  const allSourceRecords = searchRuns.flatMap((run) => run.observedSourceRecords ?? run.sourceRecords ?? []);
  const extractionSourceRecords = searchRuns.flatMap((run) => run.sourceRecords ?? []);
  const allClaims = [...evaluablePrimaryReceipts, ...evaluableRepeatReceipts].flatMap((receipt) => receipt.normalizedResponse?.claims ?? []);
  const allAttemptClaims = auditableAttempts.flatMap((receipt) => receipt.normalizedResponse?.claims ?? []);
  const pilotUsableClaims = allClaims.filter((claim) => claim.pilotUsable === true);
  const queryReceipts = [...primaryRuns, ...repeatRuns].flatMap((run) => run.queries ?? []);
  const executionAudit = auditCanaryExecution({ manifest, searchRuns, relayReceipts, defaultExtractionModel: input?.defaultExtractionModel, escalationModel: input?.escalationModel });
  const primaryWorkWithSources = new Set(primaryRuns.filter((run) => (run.sourceRecords?.length ?? 0) > 0).map((run) => run.canarySlotId));
  const primaryResolved = new Set(evaluablePrimaryReceipts.filter((receipt) => ["high", "medium"].includes(receipt.normalizedResponse?.entityResolution?.work?.status)).map((receipt) => receipt.canarySlotId));
  const primarySchemaPassed = new Set(primaryReceipts.filter((receipt) => receipt.modelBindingVerified === true && receipt.normalizedResponse?.structuredValid === true).map((receipt) => receipt.canarySlotId));
  const primaryPilotWorks = new Set(evaluablePrimaryReceipts.filter((receipt) => (receipt.normalizedResponse?.pilotUsableClaimCount ?? 0) > 0).map((receipt) => receipt.canarySlotId));
  const highValueSlots = new Set(manifest.sample.filter((work) => work.highValue === true).map((work) => work.canarySlotId));
  const highValuePilot = [...primaryPilotWorks].filter((slot) => highValueSlots.has(slot));
  const repeatPairs = manifest.repeatSample.map((repeat) => {
    const slot = repeat.canarySlotId;
    const primarySearch = primaryRuns.find((run) => run.canarySlotId === slot);
    const repeatSearch = repeatRuns.find((run) => run.canarySlotId === slot);
    const primaryExtraction = evaluablePrimaryReceipts.find((receipt) => receipt.canarySlotId === slot);
    const repeatExtraction = evaluableRepeatReceipts.find((receipt) => receipt.canarySlotId === slot);
    return {
      canarySlotId: slot,
      sourceOverlap: jaccard(
        new Set((primarySearch?.sourceRecords ?? []).map((record) => record.sourceId)),
        new Set((repeatSearch?.sourceRecords ?? []).map((record) => record.sourceId)),
      ),
      claimAgreement: primaryExtraction && repeatExtraction
        ? compareV2B5ClaimSets(primaryExtraction.normalizedResponse?.claims, repeatExtraction.normalizedResponse?.claims)
        : 0,
      structuredValueAgreement: primaryExtraction && repeatExtraction
        ? compareV2B5StructuredValues(primaryExtraction.normalizedResponse?.claims, repeatExtraction.normalizedResponse?.claims)
        : 0,
      confidenceDrift: primaryExtraction && repeatExtraction
        ? confidenceDrift(primaryExtraction.normalizedResponse?.claims, repeatExtraction.normalizedResponse?.claims)
        : null,
      contradictionDrift: primaryExtraction && repeatExtraction
        ? contradictionDrift(primaryExtraction.normalizedResponse, repeatExtraction.normalizedResponse)
        : null,
    };
  });
  const mappedReferences = sum(auditableAttempts.map((receipt) => receipt.normalizedResponse?.mappedSourceIdReferenceCount));
  const references = sum(auditableAttempts.map((receipt) => receipt.normalizedResponse?.sourceIdReferenceCount));
  const acceptedWithProhibited = allAttemptClaims.filter((claim) => claim.accepted === true && (claim.supportingSourceIds ?? []).some((sourceId) => {
    const source = allSourceRecords.find((record) => record.sourceId === sourceId);
    return source && classifyV2B5ProhibitedSource(source).prohibited;
  })).length;
  const unresolvedAccepted = allAttemptClaims.filter((claim) => claim.accepted === true
    && (!["high", "medium"].includes(claim.entityResolution?.work?.status)
      || !["none", "resolved"].includes(claim.contradictionStatus))).length;
  const sourceBackfillCount = allSourceRecords.filter((record) => record.availableAt !== record.capturedAt
    || record.availableAtBasis !== "first_observed_by_system").length;
  const receiptRefs = new Map(queryReceipts.map((query) => [`sha256:${query.providerReceipt?.receiptDigest}`, query.providerReceipt]));
  const lineageValidCount = allSourceRecords.filter((record) => {
    const receipt = receiptRefs.get(record.providerReceiptRef);
    return receipt && receipt.queryId === record.queryId && receipt.provider === record.searchProvider
      && receipt.responseReceivedAt === record.capturedAt
      && isIsoTimestamp(receipt.requestStartedAt) && Date.parse(receipt.requestStartedAt) <= Date.parse(receipt.responseReceivedAt);
  }).length;
  const metrics = {
    search: {
      plannedRequestCount: 30,
      dispatchedRequestCount: queryReceipts.filter((query) => query.dispatched === true).length,
      httpSuccessCount: queryReceipts.filter((query) => query.httpSuccess === true).length,
      querySuccessRate: ratio(queryReceipts.filter((query) => query.contractValid === true).length, 30),
      resultCount: sum(queryReceipts.map((query) => query.resultCount)),
      sourceRecordWorkCoverage: ratio(primaryWorkWithSources.size, V2B5_CANARY_WORK_COUNT),
      sourceRecordWorkCount: primaryWorkWithSources.size,
      uniqueSourceCount: new Set(allSourceRecords.map((record) => record.sourceId)).size,
      providerErrorCount: queryReceipts.filter((query) => query.contractValid !== true).length,
      usageCredits: nullableSum(queryReceipts.map((query) => query.usageCredits)),
      p50LatencyMs: percentile(queryReceipts.map((query) => query.responseTimeMs).filter(finite), 0.50),
      p90LatencyMs: percentile(queryReceipts.map((query) => query.responseTimeMs).filter(finite), 0.90),
      cacheHitCount: queryReceipts.filter((query) => query.cacheHit === true).length,
    },
    entity: {
      workResolvedCount: primaryResolved.size,
      workResolvedRate: ratio(primaryResolved.size, V2B5_CANARY_WORK_COUNT),
      workStatusCounts: countBy(primaryReceipts, (receipt) => receipt.normalizedResponse?.entityResolution?.work?.status ?? "missing"),
      authorStatusCounts: countBy(primaryReceipts, (receipt) => receipt.normalizedResponse?.entityResolution?.author?.status ?? "missing"),
    },
    evidence: {
      candidateClaimCount: allClaims.length,
      acceptedClaimCount: allClaims.filter((claim) => claim.accepted === true).length,
      pilotUsableClaimCount: pilotUsableClaims.length,
      rejectedClaimCount: allClaims.filter((claim) => claim.accepted !== true).length,
      rejectionReasons: countMany(allClaims.flatMap((claim) => claim.rejectionReasons ?? [])),
      pilotUsableEvidenceWorkCount: primaryPilotWorks.size,
      pilotUsableEvidenceWorkCoverage: ratio(primaryPilotWorks.size, V2B5_CANARY_WORK_COUNT),
      highValuePilotUsableWorkCount: highValuePilot.length,
      highValueWorkCount: highValueSlots.size,
      highValueCoverage: ratio(highValuePilot.length, highValueSlots.size),
      categoryCount: new Set(pilotUsableClaims.map((claim) => claim.claimType)).size,
      categoryDistribution: countBy(pilotUsableClaims, (claim) => claim.claimType ?? "other"),
    },
    sourceGovernance: {
      httpsCompleteness: ratio(allSourceRecords.filter((record) => String(record.url).startsWith("https://")).length, allSourceRecords.length),
      prohibitedSourceCount: allSourceRecords.filter((record) => classifyV2B5ProhibitedSource(record).prohibited).length,
      prohibitedSourceAcceptedCount: acceptedWithProhibited,
      termsReviewPendingCount: new Set(allSourceRecords.map((record) => record.domain)).size,
      legalReviewPendingCount: new Set(allSourceRecords.map((record) => record.domain)).size,
      sourceTypeCandidateDistribution: countBy(allSourceRecords, (record) => record.sourceTypeCandidate ?? "other"),
      researchApprovedCount: allAttemptClaims.filter((claim) => claim.researchApproved === true).length,
      modelEligibleCount: allAttemptClaims.filter((claim) => claim.modelEligible === true).length,
    },
    time: {
      capturedAtCompleteness: ratio(allSourceRecords.filter((record) => isIsoTimestamp(record.capturedAt)).length, allSourceRecords.length),
      availableAtCompleteness: ratio(allSourceRecords.filter((record) => isIsoTimestamp(record.availableAt)).length, allSourceRecords.length),
      firstObservedBasisCompleteness: ratio(allSourceRecords.filter((record) => record.availableAtBasis === "first_observed_by_system").length, allSourceRecords.length),
      sourceReceiptLineageCompleteness: ratio(lineageValidCount, allSourceRecords.length),
      eventTimeCompleteness: ratio(allClaims.filter((claim) => isIsoTimestamp(claim.eventTime)).length, allClaims.length),
      historicalBackfillCount: sourceBackfillCount + allAttemptClaims.filter((claim) => claim.historicalBackfillDetected === true).length,
    },
    sourceId: {
      referenceCount: references,
      mappedReferenceCount: mappedReferences,
      integrityRate: references ? mappedReferences / references : 1,
      fabricatedSourceIdCount: sum(auditableAttempts.map((receipt) => receipt.normalizedResponse?.fabricatedSourceIdCount)),
      modelGeneratedUrlCount: sum(auditableAttempts.map((receipt) => receipt.normalizedResponse?.modelGeneratedUrlCount)),
    },
    reproducibility: {
      pairCount: repeatPairs.length,
      claimAgreement: average(repeatPairs.map((pair) => pair.claimAgreement)) ?? 0,
      sourceOverlap: average(repeatPairs.map((pair) => pair.sourceOverlap)) ?? 0,
      structuredValueAgreement: average(repeatPairs.map((pair) => pair.structuredValueAgreement)) ?? 0,
      averageConfidenceDrift: average(repeatPairs.map((pair) => pair.confidenceDrift).filter(finite)),
      contradictionDriftCount: sum(repeatPairs.map((pair) => pair.contradictionDrift)),
      pairs: repeatPairs,
    },
    extraction: {
      expectedPrimaryCount: V2B5_CANARY_WORK_COUNT,
      effectivePrimaryCount: primaryReceipts.length,
      schemaPassCount: primarySchemaPassed.size,
      schemaPassRate: ratio(primarySchemaPassed.size, V2B5_CANARY_WORK_COUNT),
      privateLeakCount: sum(auditableAttempts.map((receipt) => receipt.normalizedResponse?.privateLeakCount)),
      unresolvedOrConflictedAcceptedCount: unresolvedAccepted,
      executionPopulationAndRouteValid: executionAudit.valid,
      executionAuditIssues: executionAudit.issues,
      dispatchedModelBindingFailureCount: auditableAttempts.filter((receipt) => receipt.dispatched === true && receipt.modelBindingVerified !== true).length,
      requestCountByModel: countBy(relayReceipts.filter((receipt) => receipt.dispatched === true), (receipt) => receipt.requestedModelId ?? "unknown"),
      tokenTotalsByModel: tokenTotalsByModel(relayReceipts),
      latencyByModel: latencyByModel(relayReceipts),
      relayMonetaryCostStatus: "not_estimable_no_provider_pricing",
    },
  };
  const safetyGates = [
    gate("private_leak_zero", metrics.extraction.privateLeakCount, 0, (value) => value === 0),
    gate("prohibited_source_accepted_zero", metrics.sourceGovernance.prohibitedSourceAcceptedCount, 0, (value) => value === 0),
    gate("fabricated_source_id_zero", metrics.sourceId.fabricatedSourceIdCount, 0, (value) => value === 0),
    gate("model_generated_url_zero", metrics.sourceId.modelGeneratedUrlCount, 0, (value) => value === 0),
    gate("historical_backfill_zero", metrics.time.historicalBackfillCount, 0, (value) => value === 0),
    gate("source_id_integrity", metrics.sourceId.integrityRate, 1, (value) => value === 1),
    gate("captured_at_completeness", metrics.time.capturedAtCompleteness, 1, (value) => value === 1),
    gate("available_at_completeness", metrics.time.availableAtCompleteness, 1, (value) => value === 1),
    gate("first_observed_time_basis", metrics.time.firstObservedBasisCompleteness, 1, (value) => value === 1),
    gate("source_receipt_lineage", metrics.time.sourceReceiptLineageCompleteness, 1, (value) => value === 1),
    gate("unresolved_conflicted_evidence_excluded", metrics.extraction.unresolvedOrConflictedAcceptedCount, 0, (value) => value === 0),
    gate("research_and_model_promotion_zero", metrics.sourceGovernance.researchApprovedCount + metrics.sourceGovernance.modelEligibleCount, 0, (value) => value === 0),
    gate("execution_population_route_and_model_binding", metrics.extraction.executionPopulationAndRouteValid && metrics.extraction.dispatchedModelBindingFailureCount === 0, true, (value) => value === true),
    gate("all_tests_pass", input?.allTestsPassed === true, true, (value) => value === true),
  ];
  const usabilityGates = [
    gate("tavily_query_success", metrics.search.querySuccessRate, 0.80, (value, threshold) => value >= threshold),
    gate("source_record_work_coverage", metrics.search.sourceRecordWorkCount, 8, (value, threshold) => value >= threshold),
    gate("work_entity_resolution", metrics.entity.workResolvedRate, 0.80, (value, threshold) => value >= threshold),
    gate("extraction_schema_pass", metrics.extraction.schemaPassRate, 0.90, (value, threshold) => value >= threshold),
    gate("pilot_usable_evidence_work_coverage", metrics.evidence.pilotUsableEvidenceWorkCoverage, 0.60, (value, threshold) => value >= threshold),
    gate("high_value_pilot_usable_coverage", metrics.evidence.highValueCoverage, 0.75, (value, threshold) => value >= threshold),
    gate("repeat_claim_agreement", metrics.reproducibility.claimAgreement, 0.80, (value, threshold) => value >= threshold),
    gate("repeat_source_overlap", metrics.reproducibility.sourceOverlap, 0.70, (value, threshold) => value >= threshold),
  ];
  const safetyPassed = safetyGates.every((item) => item.passed);
  const usabilityPassed = usabilityGates.every((item) => item.passed);
  const decision = !executed ? "CANARY_BLOCKED" : !safetyPassed ? "CANARY_FAIL" : usabilityPassed ? "CANARY_PASS" : "CANARY_CONDITIONAL";
  return {
    schema: "m2.v2.canary-v3-evaluation.v0.1",
    privateOnly: true,
    evaluatedAt: latestTimestamp([
      ...queryReceipts.map((query) => query.responseReceivedAt),
      ...relayReceipts.map((receipt) => receipt.responseReceivedAt),
    ]) ?? input?.evaluatedAt ?? null,
    canaryManifestDigest: manifest.manifestDigest,
    executed,
    defaultExtractionModel: input?.defaultExtractionModel ?? null,
    escalationModel: input?.escalationModel ?? null,
    metrics,
    safetyGates,
    usabilityGates,
    safetyPassed,
    usabilityPassed,
    decision,
    nextStep: decision === "CANARY_PASS" ? "user_reviews_private_workbook" : "remediate_failed_or_conditional_gates_before_any_new_authorization",
    full160Authorized: false,
    notForFormalDecision: true,
  };
}

function evaluateBenchmarkModel(model, manifest, receipts) {
  const expectedPrimary = manifest.sample.map((work) => `${work.canarySlotId}:primary`);
  const expectedRepeat = manifest.repeatSample.map((work) => `${work.canarySlotId}:repeat`);
  const expected = [...expectedPrimary, ...expectedRepeat];
  const modelReceipts = expected.map((key) => {
    const [slot, runKind] = key.split(":");
    return effectiveBenchmarkReceipt(receipts, model, slot, runKind);
  });
  const present = modelReceipts.filter(Boolean);
  const allModelAttempts = receipts.filter((receipt) => receipt.requestedModelId === model && receipt.phase === "benchmark");
  const auditableAttempts = allModelAttempts.filter((receipt) => receipt.attemptKind !== "compatibility_probe");
  const primary = modelReceipts.slice(0, expectedPrimary.length);
  const repeat = modelReceipts.slice(expectedPrimary.length);
  const normalized = present.map((receipt) => receipt.normalizedResponse).filter(Boolean);
  const safetyNormalized = auditableAttempts.map((receipt) => receipt.normalizedResponse).filter(Boolean);
  const claims = normalized.flatMap((response) => response.claims ?? []);
  const references = sum(normalized.map((response) => response.sourceIdReferenceCount));
  const mapped = sum(normalized.map((response) => response.mappedSourceIdReferenceCount));
  const repeatPairs = manifest.repeatSample.map((repeatItem, index) => {
    const main = primary.find((receipt) => receipt?.canarySlotId === repeatItem.canarySlotId);
    const again = repeat[index];
    return main && again ? compareV2B5ClaimSets(main.normalizedResponse?.claims, again.normalizedResponse?.claims) : 0;
  });
  const primaryPilotSlots = new Set(primary.filter((receipt) => (receipt?.normalizedResponse?.pilotUsableClaimCount ?? 0) > 0).map((receipt) => receipt.canarySlotId));
  const workResolvedCount = primary.filter((receipt) => ["high", "medium"].includes(receipt?.normalizedResponse?.entityResolution?.work?.status)).length;
  const authorResolvedCount = primary.filter((receipt) => ["high", "medium", "not_applicable"].includes(receipt?.normalizedResponse?.entityResolution?.author?.status)).length;
  const schemaPassCount = present.filter((receipt) => receipt.normalizedResponse?.structuredValid === true).length;
  const unresolvedAccepted = claims.filter((claim) => claim.accepted === true
    && (!["high", "medium"].includes(claim.entityResolution?.work?.status)
      || !["none", "resolved"].includes(claim.contradictionStatus))).length;
  const allSourceTimesComplete = present.length === expected.length
    && normalized.every((response) => response.capturedAtCompleteness === 1 && response.availableAtCompleteness === 1);
  const modelBindingAndProviderContractPassed = present.length === expected.length && present.every((receipt) => (
    receipt.requestedModelId === model
      && receipt.modelBindingVerified === true
      && receipt.providerContractCompatible === true
  ));
  const hardGates = [
    gate("private_leak_zero", sum(safetyNormalized.map((response) => response.privateLeakCount)), 0, (value) => value === 0),
    gate("fabricated_source_id_zero", sum(safetyNormalized.map((response) => response.fabricatedSourceIdCount)), 0, (value) => value === 0),
    gate("model_generated_url_zero", sum(safetyNormalized.map((response) => response.modelGeneratedUrlCount)), 0, (value) => value === 0),
    gate("source_id_integrity", references ? mapped / references : present.length === expected.length ? 1 : 0, 1, (value) => value === 1),
    gate("unresolved_conflicted_evidence_excluded", unresolvedAccepted, 0, (value) => value === 0),
    gate("historical_backfill_zero", sum(safetyNormalized.map((response) => response.historicalBackfillCount)), 0, (value) => value === 0),
    gate("schema_pass", ratio(schemaPassCount, expected.length), 0.75, (value, threshold) => value >= threshold),
    gate("captured_available_pipeline_complete", allSourceTimesComplete, true, (value) => value === true),
    gate("model_binding_and_provider_contract", modelBindingAndProviderContractPassed, true, (value) => value === true),
  ];
  const totalClaims = claims.length;
  const rejectedCount = claims.filter((claim) => claim.accepted !== true).length;
  const costRows = auditableAttempts.filter((receipt) => receipt.dispatched === true);
  const physicalCostRows = allModelAttempts.filter((receipt) => receipt.dispatched === true);
  const latencies = costRows.map((receipt) => receipt.latencyMs).filter(finite);
  const tokenTotals = costRows.map((receipt) => receipt.usage?.totalTokens).filter(finite);
  const efficiencyObservationComplete = present.length === expected.length
    && present.every((receipt) => finite(receipt.latencyMs) && finite(receipt.usage?.totalTokens));
  return {
    model,
    expectedRequestCount: expected.length,
    dispatchedCount: physicalCostRows.length,
    providerSuccessCount: allModelAttempts.filter((receipt) => receipt.providerConnectivityPassed === true).length,
    effectiveDispatchedCount: present.filter((receipt) => receipt.dispatched === true).length,
    compatibilitySetupRequestCount: allModelAttempts.filter((receipt) => receipt.attemptKind === "compatibility_probe" && receipt.dispatched === true).length,
    schemaPassCount,
    schemaPassRate: ratio(schemaPassCount, expected.length),
    entity: { workResolvedCount, authorResolvedCount },
    evidence: {
      claimCount: totalClaims,
      acceptedClaimCount: claims.filter((claim) => claim.accepted === true).length,
      pilotUsableClaimCount: claims.filter((claim) => claim.pilotUsable === true).length,
      rejectedClaimCount: rejectedCount,
      rejectedRate: ratio(rejectedCount, totalClaims),
      rejectionReasons: countMany(claims.flatMap((claim) => claim.rejectionReasons ?? [])),
      pilotUsableWorkCount: primaryPilotSlots.size,
      pilotUsableWorkCoverage: ratio(primaryPilotSlots.size, V2B5_BENCHMARK_WORK_COUNT),
    },
    source: {
      sourceIdReferenceCount: references,
      mappedSourceIdReferenceCount: mapped,
      sourceIdIntegrityRate: references ? mapped / references : present.length === expected.length ? 1 : 0,
      fabricatedSourceIdCount: sum(normalized.map((response) => response.fabricatedSourceIdCount)),
      modelGeneratedUrlCount: sum(normalized.map((response) => response.modelGeneratedUrlCount)),
    },
    contradiction: {
      unresolvedOrConflictedAcceptedCount: unresolvedAccepted,
    },
    time: {
      eventTimeCompleteness: ratio(claims.filter((claim) => isIsoTimestamp(claim.eventTime)).length, claims.length),
      capturedAvailablePipelineComplete: allSourceTimesComplete,
      historicalBackfillCount: sum(normalized.map((response) => response.historicalBackfillCount)),
    },
    reproducibility: {
      expectedPairCount: V2B5_BENCHMARK_REPEAT_COUNT,
      claimAgreement: average(repeatPairs) ?? 0,
      perPair: repeatPairs,
    },
    costLatency: {
      p50LatencyMs: percentile(latencies, 0.50),
      p90LatencyMs: percentile(latencies, 0.90),
      inputTokens: nullableSum(costRows.map((receipt) => receipt.usage?.inputTokens)),
      outputTokens: nullableSum(costRows.map((receipt) => receipt.usage?.outputTokens)),
      totalTokens: nullableSum(tokenTotals),
      tokenObservationCount: tokenTotals.length,
      efficiencyObservationComplete,
      physicalRequestCount: physicalCostRows.length,
      physicalInputTokens: nullableSum(physicalCostRows.map((receipt) => receipt.usage?.inputTokens)),
      physicalOutputTokens: nullableSum(physicalCostRows.map((receipt) => receipt.usage?.outputTokens)),
      physicalTotalTokens: nullableSum(physicalCostRows.map((receipt) => receipt.usage?.totalTokens)),
      physicalP50LatencyMs: percentile(physicalCostRows.map((receipt) => receipt.latencyMs).filter(finite), 0.50),
      physicalP90LatencyMs: percentile(physicalCostRows.map((receipt) => receipt.latencyMs).filter(finite), 0.90),
    },
    hardSafetyGate: {
      items: hardGates,
      passedCount: hardGates.filter((item) => item.passed).length,
      totalCount: hardGates.length,
      allPassed: hardGates.every((item) => item.passed),
    },
  };
}

function verifySameBenchmarkSources(manifest, receipts) {
  return manifest.sample.every((work) => {
    const primaryDigests = V2B5_MODELS.map((model) => effectiveBenchmarkReceipt(receipts, model, work.canarySlotId, "primary")?.sourceRecordSetDigest);
    if (!primaryDigests.every(Boolean) || new Set(primaryDigests).size !== 1) return false;
    const repeatExpected = manifest.repeatSample.some((item) => item.canarySlotId === work.canarySlotId);
    if (!repeatExpected) return true;
    const repeatDigests = V2B5_MODELS.map((model) => effectiveBenchmarkReceipt(receipts, model, work.canarySlotId, "repeat")?.sourceRecordSetDigest);
    return repeatDigests.every(Boolean) && new Set(repeatDigests).size === 1 && repeatDigests[0] === primaryDigests[0];
  });
}

function effectiveBenchmarkReceipt(receipts, model, slot, runKind) {
  const rows = receipts.filter((receipt) => receipt.requestedModelId === model
    && receipt.canarySlotId === slot && receipt.runKind === runKind && receipt.phase === "benchmark");
  return rows.find((receipt) => receipt.attemptKind === "repair")
    ?? rows.find((receipt) => receipt.attemptKind === "transport_retry")
    ?? rows.find((receipt) => receipt.attemptKind === "primary")
    ?? null;
}

function selectEffectiveCanaryReceipt(receipts, runKind, slot) {
  const candidates = receipts.filter((receipt) => receipt.phase === "canary" && receipt.runKind === runKind && receipt.canarySlotId === slot);
  return candidates.find((receipt) => receipt.attemptKind === "escalation" && receiptEvaluable(receipt))
    ?? candidates.find((receipt) => receipt.attemptKind === "repair" && receiptEvaluable(receipt))
    ?? candidates.find((receipt) => receipt.attemptKind === "transport_retry" && receiptEvaluable(receipt))
    ?? candidates.find((receipt) => receipt.attemptKind === "primary")
    ?? null;
}

function receiptEvaluable(receipt) {
  return receipt?.modelBindingVerified === true
    && receipt?.providerContractCompatible === true
    && receipt?.normalizedResponse?.contractValid === true;
}

function auditCanaryExecution(input) {
  const issues = [];
  const expectedSearch = new Set([
    ...input.manifest.sample.map((work) => `primary:${work.canarySlotId}`),
    ...input.manifest.repeatSample.map((work) => `repeat:${work.canarySlotId}`),
  ]);
  const actualSearchKeys = input.searchRuns.map((run) => `${run.runKind}:${run.canarySlotId}`);
  if (actualSearchKeys.length !== expectedSearch.size || new Set(actualSearchKeys).size !== actualSearchKeys.length) issues.push("search_population_or_duplicate_invalid");
  if (actualSearchKeys.some((key) => !expectedSearch.has(key))) issues.push("unexpected_search_slot");
  if (input.searchRuns.some((run) => !Array.isArray(run.queries) || run.queries.length !== 2)) issues.push("search_query_population_invalid");

  const attempts = input.relayReceipts.filter((receipt) => receipt.phase === "canary" && receipt.attemptKind !== "compatibility_probe");
  for (const key of expectedSearch) {
    const [runKind, slot] = key.split(":");
    const rows = attempts.filter((receipt) => receipt.runKind === runKind && receipt.canarySlotId === slot);
    const primary = rows.filter((receipt) => receipt.attemptKind === "primary");
    const repair = rows.filter((receipt) => receipt.attemptKind === "repair");
    const escalation = rows.filter((receipt) => receipt.attemptKind === "escalation");
    const transportRetry = rows.filter((receipt) => receipt.attemptKind === "transport_retry");
    if (primary.length !== 1 || transportRetry.length > 1 || repair.length > 1 || escalation.length > 1) issues.push(`attempt_population_invalid:${key}`);
    if (transportRetry.length && primary[0]?.providerConnectivityPassed === true) issues.push(`transport_retry_trigger_invalid:${key}`);
    const searchRun = input.searchRuns.find((run) => run.runKind === runKind && run.canarySlotId === slot);
    if (rows.some((receipt) => receipt.sourceRecordSetDigest !== searchRun?.sourceRecordSetDigest)) issues.push(`source_digest_mismatch:${key}`);
    if (primary.some((receipt) => receipt.requestedModelId !== input.defaultExtractionModel)) issues.push(`primary_model_invalid:${key}`);
    if (repair.some((receipt) => receipt.requestedModelId !== input.defaultExtractionModel)) issues.push(`repair_model_invalid:${key}`);
    if (repair.length && !(primary[0]?.providerConnectivityPassed === true
      && primary[0]?.modelBindingVerified === true
      && primary[0]?.normalizedResponse?.structuredValid !== true)) issues.push(`repair_trigger_invalid:${key}`);
    if (escalation.length) {
      if (input.defaultExtractionModel !== "gpt-5.6-luna" || input.escalationModel !== "gpt-5.6-terra"
        || escalation[0].requestedModelId !== "gpt-5.6-terra") issues.push(`escalation_model_invalid:${key}`);
      const effectiveBeforeEscalation = repair.find(receiptEvaluable) ?? transportRetry.find(receiptEvaluable) ?? primary[0];
      const work = input.manifest.sample.find((item) => item.canarySlotId === slot);
      if (!shouldEscalateV2B5Extraction(effectiveBeforeEscalation, work)) issues.push(`escalation_trigger_invalid:${key}`);
    }
  }
  const expectedKeys = new Set(expectedSearch);
  if (attempts.some((receipt) => !expectedKeys.has(`${receipt.runKind}:${receipt.canarySlotId}`)
    || !["primary", "transport_retry", "repair", "escalation"].includes(receipt.attemptKind))) issues.push("unexpected_extraction_attempt");
  return { valid: issues.length === 0, issues: unique(issues) };
}

function benchmarkCoverageScore(items) {
  const has = (predicate) => items.some(predicate);
  const required = [
    has((item) => item.sourceType === "publication"),
    has((item) => item.sourceType === "web_original"),
    has((item) => item.highValue === true),
    has((item) => String(item.ambiguityRisk).toLocaleLowerCase("en-US") === "high"),
    has((item) => String(item.evidencePrior).toLocaleLowerCase("en-US") === "rich"),
    has((item) => String(item.evidencePrior).toLocaleLowerCase("en-US") === "sparse"),
  ];
  const diversity = new Set(items.map((item) => item.sourceType)).size
    + new Set(items.map((item) => String(item.ambiguityRisk))).size
    + new Set(items.map((item) => String(item.evidencePrior))).size;
  return required.filter(Boolean).length * 100 + diversity;
}

function privateWorkProjection(item) {
  return {
    standardWorkId: item.standardWorkId,
    title: item.title,
    author: item.author,
    identityDigest: item.identityDigest,
    sourceType: item.sourceType,
    revenueBand: item.revenueBand,
    ambiguityRisk: item.ambiguityRisk,
    evidencePrior: item.evidencePrior,
    highValue: item.highValue,
    sameNameCount: item.sameNameCount,
    canarySlotId: item.canarySlotId,
  };
}

function assertFrozenCanary(manifest) {
  if (!manifest || manifest.privateOnly !== true || manifest.immutable !== true
    || manifest.sampleCount !== V2B5_CANARY_WORK_COUNT || manifest.sample?.length !== V2B5_CANARY_WORK_COUNT
    || manifest.repeatSample?.length !== V2B5_CANARY_REPEAT_COUNT) {
    throw new Error("v2b5_frozen_canary_invalid");
  }
  const { canaryManifestDigest: _ignored, ...payload } = manifest;
  if (sha256(payload) !== manifest.canaryManifestDigest) throw new Error("v2b5_frozen_canary_digest_invalid");
}

function combinationsOf(items, size) {
  const result = [];
  const visit = (start, current) => {
    if (current.length === size) {
      result.push([...current]);
      return;
    }
    for (let index = start; index <= items.length - (size - current.length); index += 1) {
      current.push(items[index]);
      visit(index + 1, current);
      current.pop();
    }
  };
  visit(0, []);
  return result;
}

function tokenTotalsByModel(receipts) {
  return Object.fromEntries(V2B5_MODELS.map((model) => {
    const rows = receipts.filter((receipt) => receipt.requestedModelId === model);
    return [model, {
      inputTokens: nullableSum(rows.map((receipt) => receipt.usage?.inputTokens)),
      outputTokens: nullableSum(rows.map((receipt) => receipt.usage?.outputTokens)),
      totalTokens: nullableSum(rows.map((receipt) => receipt.usage?.totalTokens)),
    }];
  }));
}

function latencyByModel(receipts) {
  return Object.fromEntries(V2B5_MODELS.map((model) => {
    const values = receipts.filter((receipt) => receipt.requestedModelId === model).map((receipt) => receipt.latencyMs).filter(finite);
    return [model, { p50LatencyMs: percentile(values, 0.50), p90LatencyMs: percentile(values, 0.90) }];
  }));
}

function confidenceDrift(firstClaims, secondClaims) {
  const first = new Map((firstClaims ?? []).filter((claim) => claim.pilotUsable).map((claim) => [claimSignature(claim), claim.confidence]));
  const differences = (secondClaims ?? []).filter((claim) => claim.pilotUsable && first.has(claimSignature(claim)))
    .map((claim) => Math.abs(Number(claim.confidence) - Number(first.get(claimSignature(claim))))).filter(finite);
  return average(differences);
}

function contradictionDrift(first, second) {
  const signature = (value) => canonicalJson((value?.contradictions ?? []).map((item) => ({ key: item.contradictionKey, status: item.status })).sort((a, b) => a.key.localeCompare(b.key)));
  return signature(first) === signature(second) ? 0 : 1;
}

function claimSignature(claim) {
  return sha256({ claimType: claim.claimType, structuredValue: claim.structuredValue });
}

function gate(id, actual, threshold, predicate) {
  return { id, actual, threshold, passed: predicate(actual, threshold) };
}

function jaccard(left, right) {
  const union = new Set([...left, ...right]);
  if (union.size === 0) return 0;
  let overlap = 0;
  for (const item of left) if (right.has(item)) overlap += 1;
  return overlap / union.size;
}

function compareSlot(left, right) {
  return String(left.canarySlotId).localeCompare(String(right.canarySlotId));
}

function cleanSlot(value) {
  const text = String(value ?? "");
  return /^slot\d{2}$/u.test(text) ? text : "";
}

function cleanIdentity(value) {
  return typeof value === "string" ? [...value.normalize("NFKC").replace(/\s+/gu, " ").trim()].slice(0, 240).join("") : "";
}

function isIsoTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function latestTimestamp(values) {
  const parsed = values.filter(isIsoTimestamp).map(Date.parse);
  return parsed.length ? new Date(Math.max(...parsed)).toISOString() : null;
}

function percentile(values, probability) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(probability * sorted.length) - 1)];
}

function ratio(numerator, denominator) {
  return denominator ? numerator / denominator : 0;
}

function sum(values) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

function nullableSum(values) {
  const observed = values.filter(finite);
  return observed.length ? sum(observed) : null;
}

function average(values) {
  return values.length ? sum(values) / values.length : null;
}

function countBy(values, selector) {
  const counts = {};
  for (const value of values) {
    const key = String(selector(value) ?? "unknown");
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function countMany(values) {
  return countBy(values, (value) => value);
}

function unique(values) {
  return [...new Set(values)];
}

function finite(value) {
  return Number.isFinite(value);
}
