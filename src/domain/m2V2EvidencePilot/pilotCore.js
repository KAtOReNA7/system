import { createHash } from "node:crypto";

export const PILOT_SCHEMA_VERSION = "m2.v2.evidence-pilot.v0.1";
export const EVIDENCE_SCHEMA_VERSION = "m2.v2.external-evidence.v0.1";
export const PILOT_SEED = "20260717";
export const PILOT_SIZE = 160;

export const PROVIDER_MODES = Object.freeze([
  "structured_search",
  "web_search",
  "official_page_fetch",
  "controlled_browser_fetch",
  "no_provider_available",
]);

export const QUERY_BUDGET = Object.freeze({
  maxQueriesPerWork: 8,
  maxResultsPerQuery: 10,
  maxPagesPerWork: 6,
  plannedQueriesPerWork: 4,
});

export const EVIDENCE_TYPES = Object.freeze([
  "author_identity",
  "original_work_performance",
  "search_interest",
  "social_signal",
  "ranking_signal",
  "adaptation_event",
  "publication_event",
  "award_event",
  "official_notice",
]);

export const HARD_GATE_IDS = Object.freeze([
  "no_private_identifiers_in_public_artifacts",
  "no_prohibited_source_accepted",
  "citation_present_for_every_accepted_evidence",
  "captured_at_present",
  "available_at_present_or_explicitly_unknown",
  "unknown_available_at_excluded_from_model_eligibility",
  "unresolved_entity_excluded",
  "unresolved_conflict_excluded",
  "no_historical_cutoff_backfill",
  "no_model_training",
  "provider_receipts_auditable",
  "manifest_immutable",
  "deterministic_schema_validation",
  "private_files_ignored_and_untracked",
  "final_holdout_sealed",
  "b4_unchanged",
  "all_tests_pass",
]);

const FORBIDDEN_PUBLIC_KEYS = new Set([
  "standardWorkId",
  "standard_work_id",
  "standardWorkName",
  "workId",
  "workName",
  "title",
  "author",
  "authorName",
  "sourceUrl",
  "sourceLocator",
  "queryText",
  "rawSnippet",
  "rawSnippetHash",
  "pageContent",
  "alternateCandidates",
]);

const FORBIDDEN_EVIDENCE_KEYS = new Set([
  "rawPage",
  "pageContent",
  "longExcerpt",
  "credential",
  "apiKey",
  "chainOfThought",
  "forecast",
  "revenuePrediction",
  "operatingAction",
]);

const SOURCE_PRECEDENCE = Object.freeze({
  official_structured_api: 6,
  official_page: 5,
  authorized_structured_api: 4,
  licensed_aggregate: 3,
  permitted_public_page: 2,
  search_index: 1,
});

export function canonicalJson(value) {
  return JSON.stringify(sortRecursively(value));
}

export function sha256(value) {
  return createHash("sha256").update(typeof value === "string" ? value : canonicalJson(value)).digest("hex");
}

export function normalizeEntityText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .trim();
}

export function buildQueryPlan(work, options = {}) {
  const title = cleanIdentity(work.title);
  const author = cleanIdentity(work.author);
  if (!title) throw new Error("query_plan_requires_title");

  const templates = [
    {
      category: "work_identity_and_source",
      evidenceTypes: ["publication_event", "official_notice"],
      queryText: author ? `\"${title}\" \"${author}\" 作品 官方` : `\"${title}\" 作品 官方`,
      includedFields: author ? ["title", "author"] : ["title"],
    },
    {
      category: "author_identity_and_recent_activity",
      evidenceTypes: ["author_identity", "official_notice"],
      queryText: author ? `\"${author}\" 作者 官方 近期` : `\"${title}\" 作者 官方`,
      includedFields: author ? ["author"] : ["title"],
    },
    {
      category: "adaptation_publication_award",
      evidenceTypes: ["adaptation_event", "publication_event", "award_event"],
      queryText: `\"${title}\" 改编 出版 获奖 官方`,
      includedFields: ["title"],
    },
    {
      category: "original_platform_and_ranking",
      evidenceTypes: ["original_work_performance", "ranking_signal"],
      queryText: `\"${title}\" 原作 平台 榜单`,
      includedFields: ["title"],
    },
  ];

  const maxQueries = Number(options.maxQueriesPerWork ?? QUERY_BUDGET.maxQueriesPerWork);
  if (templates.length > maxQueries) throw new Error("query_budget_exceeded");

  return templates.map((template, index) => {
    const queryHash = sha256({
      templateVersion: "m2-v2-query-template-v0.1",
      category: template.category,
      queryText: template.queryText,
    });
    return {
      queryId: `qry_${queryHash.slice(0, 24)}`,
      queryHash,
      queryTemplateVersion: "m2-v2-query-template-v0.1",
      ordinal: index + 1,
      category: template.category,
      evidenceTypes: template.evidenceTypes,
      queryText: template.queryText,
      includedFields: template.includedFields,
      excludedPrivateFields: ["standardWorkId", "revenue", "rating", "rights", "internalStatus"],
      maxResults: QUERY_BUDGET.maxResultsPerQuery,
      maxPages: QUERY_BUDGET.maxPagesPerWork,
    };
  });
}

export function validateQueryPlan(plan, workCount = 1) {
  const issues = [];
  const byWork = new Map();
  for (const query of plan) {
    const key = String(query.workReference ?? "single");
    byWork.set(key, (byWork.get(key) ?? 0) + 1);
    if (Number(query.maxResults) > QUERY_BUDGET.maxResultsPerQuery) issues.push("max_results_exceeded");
    if (Number(query.maxPages) > QUERY_BUDGET.maxPagesPerWork) issues.push("max_pages_exceeded");
    if (!Array.isArray(query.excludedPrivateFields) || !query.excludedPrivateFields.includes("revenue")) {
      issues.push("private_field_provenance_missing");
    }
  }
  for (const count of byWork.values()) {
    if (count > QUERY_BUDGET.maxQueriesPerWork) issues.push("max_queries_per_work_exceeded");
  }
  if (byWork.size > workCount) issues.push("unexpected_work_count");
  return { valid: issues.length === 0, issues: [...new Set(issues)] };
}

export function assertProviderContract(provider) {
  const issues = [];
  if (!provider || typeof provider !== "object") issues.push("provider_missing");
  if (!provider?.providerId) issues.push("provider_id_missing");
  if (!provider?.providerVersion) issues.push("provider_version_missing");
  if (!PROVIDER_MODES.includes(provider?.mode)) issues.push("provider_mode_invalid");
  if (typeof provider?.execute !== "function") issues.push("provider_execute_missing");
  if (issues.length) throw new Error(`provider_contract_invalid:${issues.join(",")}`);
  return true;
}

export class NoProviderAdapter {
  constructor({ reason = "no_authorized_runtime_provider" } = {}) {
    this.providerId = "no_provider_available";
    this.providerVersion = "v0.1";
    this.mode = "no_provider_available";
    this.reason = reason;
  }

  async execute(request) {
    const receiptDigest = sha256({
      providerId: this.providerId,
      providerVersion: this.providerVersion,
      queryId: request.queryId,
      queryHash: request.queryHash,
      status: "blocked_no_provider",
      reason: this.reason,
    });
    return {
      schema: "m2.v2.provider-receipt.v0.1",
      providerId: this.providerId,
      providerVersion: this.providerVersion,
      providerMode: this.mode,
      requestId: `req_${receiptDigest.slice(0, 24)}`,
      queryId: request.queryId,
      queryHash: request.queryHash,
      status: "blocked_no_provider",
      errorClass: "provider_unavailable",
      reason: this.reason,
      capturedAt: new Date().toISOString(),
      dispatched: false,
      resultCount: 0,
      pageCount: 0,
      costAmount: 0,
      costCurrency: "CNY",
      latencyMs: null,
      results: [],
      pages: [],
      receiptDigest,
    };
  }
}

export async function executeProviderRequest(provider, request) {
  assertProviderContract(provider);
  const response = await provider.execute(request);
  const issues = [];
  if (response?.queryId !== request.queryId) issues.push("query_id_mismatch");
  if (response?.queryHash !== request.queryHash) issues.push("query_hash_mismatch");
  if (!Array.isArray(response?.results)) issues.push("results_not_array");
  if (!Array.isArray(response?.pages)) issues.push("pages_not_array");
  if (!response?.capturedAt) issues.push("captured_at_missing");
  if (Number(response?.resultCount ?? 0) > QUERY_BUDGET.maxResultsPerQuery) issues.push("result_budget_exceeded");
  if (Number(response?.pageCount ?? 0) > QUERY_BUDGET.maxPagesPerWork) issues.push("page_budget_exceeded");
  if (issues.length) throw new Error(`provider_response_invalid:${issues.join(",")}`);
  return response;
}

export async function executePlanWithCache(provider, plan, cache = {}) {
  const entries = { ...(cache.entries ?? {}) };
  const receipts = [];
  let cacheHitCount = 0;
  for (const request of plan) {
    let receipt = entries[request.queryHash];
    if (receipt) {
      cacheHitCount += 1;
    } else {
      receipt = await executeProviderRequest(provider, request);
      entries[request.queryHash] = receipt;
    }
    receipts.push(receipt);
  }
  return {
    receipts,
    cache: { schema: "m2.v2.query-cache.v0.1", entries },
    cacheHitCount,
  };
}

export function isAllowedPrivateArtifactPath(path) {
  const normalized = String(path ?? "").replaceAll("\\", "/");
  return (
    normalized.startsWith("data/private-output/m2-v2-evidence-pilot/") &&
    !normalized.split("/").includes("..") &&
    !normalized.endsWith("/")
  );
}

export function resolveEntity({ work, candidate, sameNameCount = 1 }) {
  if (!candidate) {
    return unresolvedEntity("no_external_candidate", sameNameCount);
  }

  const workTitle = normalizeEntityText(work?.title);
  const candidateTitle = normalizeEntityText(candidate?.title);
  const workAuthor = normalizeEntityText(work?.author);
  const candidateAuthor = normalizeEntityText(candidate?.author);
  const titleExact = Boolean(workTitle && candidateTitle && workTitle === candidateTitle);
  const authorExact = Boolean(workAuthor && candidateAuthor && workAuthor === candidateAuthor);
  const authoritativeIdentifier = Boolean(candidate.authoritativeIdentifier);
  const alternateCandidates = (candidate.alternateCandidates ?? []).map((value) => sha256(String(value)));

  if (authoritativeIdentifier) {
    return resolvedEntity("authoritative_identifier", 0.98, alternateCandidates);
  }
  if (titleExact && authorExact) {
    return resolvedEntity("deterministic_composite_match", sameNameCount > 1 ? 0.9 : 0.95, alternateCandidates);
  }
  if (titleExact && !authorExact && sameNameCount > 1) {
    return {
      status: "ambiguous",
      resolvedEntity: null,
      matchMethod: "title_only_rejected",
      matchConfidence: 0.4,
      ambiguityReason: "same_name_requires_author_or_authoritative_identifier",
      alternateCandidateHashes: alternateCandidates,
      workStatus: "ambiguous",
      authorStatus: "unresolved",
    };
  }
  return unresolvedEntity(titleExact ? "author_not_resolved" : "title_not_resolved", sameNameCount, alternateCandidates);
}

export function evaluateSource(source, allowlist) {
  const entries = Array.isArray(allowlist?.approvedDomainEntries) ? allowlist.approvedDomainEntries : [];
  const domain = String(source?.sourceDomain ?? "").toLocaleLowerCase("en-US");
  const entry = entries.find((item) => String(item.domain).toLocaleLowerCase("en-US") === domain);
  if (!entry) {
    return { allowed: false, reason: "domain_not_explicitly_allowlisted", entry: null };
  }
  if (!entry.enabled || entry.approvalStatus !== "approved") {
    return { allowed: false, reason: "domain_entry_not_approved", entry };
  }
  if (!['authoritative', 'reliable_secondary'].includes(entry.sourceTier)) {
    return { allowed: false, reason: "source_tier_not_prediction_eligible", entry };
  }
  if (!['structured_facts_allowed', 'short_excerpt_allowed'].includes(entry.sourceTermsClass)) {
    return { allowed: false, reason: "source_terms_not_prediction_eligible", entry };
  }
  return { allowed: true, reason: null, entry };
}

export function validateEvidenceRecord(record, context = {}) {
  const issues = [];
  const required = [
    "schemaVersion",
    "evidenceId",
    "evidenceVersion",
    "standardWorkId",
    "evidenceType",
    "claimKey",
    "entityResolution",
    "structuredValue",
    "source",
    "provider",
    "extraction",
    "timestamps",
    "confidence",
    "contradiction",
    "predictiveUse",
    "admissibility",
    "governance",
  ];
  for (const key of required) if (!(key in (record ?? {}))) issues.push(`required:${key}`);
  if (record?.schemaVersion !== EVIDENCE_SCHEMA_VERSION) issues.push("schema_version_invalid");
  if (!EVIDENCE_TYPES.includes(record?.evidenceType)) issues.push("evidence_type_invalid");
  for (const key of Object.keys(record ?? {})) if (FORBIDDEN_EVIDENCE_KEYS.has(key)) issues.push(`forbidden:${key}`);

  const sourceEvaluation = evaluateSource(record?.source, context.sourceAllowlist ?? {});
  if (!record?.source?.sourceLocator) issues.push("citation_missing");
  if (!record?.timestamps?.capturedAt) issues.push("captured_at_missing");
  if (!['known', 'unknown'].includes(record?.timestamps?.availableAtStatus)) issues.push("available_at_status_invalid");
  if (record?.timestamps?.availableAtStatus === "known" && !record?.timestamps?.availableAt) issues.push("available_at_missing");
  if (record?.timestamps?.availableAtStatus === "unknown" && record?.timestamps?.availableAt !== null) {
    issues.push("unknown_available_at_must_be_null");
  }

  const eligibleTime = latestTimestamp([
    record?.timestamps?.availableAt,
    record?.timestamps?.firstObservedAt,
    record?.timestamps?.capturedAt,
  ]);
  const evidenceAsOfAt = context.evidenceAsOfAt ?? record?.governance?.evidenceAsOfAt;
  const predictionLockedAt = context.predictionLockedAt ?? record?.governance?.predictionLockedAt;
  const timeEligible = Boolean(
    record?.timestamps?.availableAtStatus === "known" &&
      eligibleTime &&
      evidenceAsOfAt &&
      Date.parse(eligibleTime) <= Date.parse(evidenceAsOfAt) &&
      predictionLockedAt &&
      Date.parse(evidenceAsOfAt) <= Date.parse(predictionLockedAt)
  );
  if (record?.timestamps?.capturedAt && record?.timestamps?.availableAt) {
    if (Date.parse(record.timestamps.capturedAt) < Date.parse(record.timestamps.availableAt)) {
      issues.push("captured_before_available");
    }
  }

  const confidenceValues = [
    record?.confidence?.entityMatchConfidence,
    record?.confidence?.sourceReliability,
    record?.confidence?.extractionConfidence,
    record?.confidence?.freshnessScore,
  ];
  const confidenceComplete = confidenceValues.every((value) => Number.isFinite(value));
  const expectedOverall = confidenceComplete ? Math.min(...confidenceValues) : null;
  if (confidenceComplete && Math.abs(Number(record?.confidence?.overall) - expectedOverall) > 1e-12) {
    issues.push("confidence_min_rule_violated");
  }

  const entityEligible =
    record?.entityResolution?.work?.status === "resolved" &&
    ['resolved', 'not_applicable'].includes(record?.entityResolution?.author?.status);
  const conflictEligible = ['none', 'resolved'].includes(record?.contradiction?.status);
  const confidenceEligible = confidenceComplete && expectedOverall >= 0.8 && ['high', 'medium'].includes(record?.confidence?.tier);
  const featureManifestEligible = context.featureManifestPreRegistered === true;
  const schemaValid = issues.length === 0;
  const predictionEligible = Boolean(
    schemaValid &&
      sourceEvaluation.allowed &&
      entityEligible &&
      timeEligible &&
      confidenceEligible &&
      conflictEligible &&
      featureManifestEligible
  );

  if (record?.predictiveUse === "prediction_allowed" && !predictionEligible) {
    issues.push("prediction_allowed_without_all_gates");
  }
  if (record?.extraction?.extractorType === "llm_structured_extraction" && !record?.source?.sourceLocator) {
    issues.push("llm_without_source_rejected");
  }

  return {
    valid: issues.length === 0,
    issues: [...new Set(issues)],
    predictionEligible: predictionEligible && issues.length === 0,
    sourceEvaluation,
    eligibleTime,
    confidenceOverall: expectedOverall,
  };
}

export function resolveContradictions(records, resolvedAt = null) {
  const groups = new Map();
  for (const record of records) {
    const interval = canonicalJson(record?.structuredValue?.effectiveInterval ?? null);
    const key = `${record.standardWorkId}\u001f${record.claimKey}\u001f${interval}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }

  return [...groups.entries()].map(([groupKey, claims]) => {
    const valueDigests = new Set(claims.map((claim) => sha256(claim.structuredValue)));
    if (valueDigests.size <= 1) {
      return { groupKey: sha256(groupKey), status: "none", winnerEvidenceId: null, claimCount: claims.length };
    }
    const ranked = [...claims].sort((a, b) => {
      const delta = (SOURCE_PRECEDENCE[b.source?.sourceClass] ?? 0) - (SOURCE_PRECEDENCE[a.source?.sourceClass] ?? 0);
      return delta || String(a.evidenceId).localeCompare(String(b.evidenceId));
    });
    const firstRank = SOURCE_PRECEDENCE[ranked[0].source?.sourceClass] ?? 0;
    const secondRank = SOURCE_PRECEDENCE[ranked[1].source?.sourceClass] ?? 0;
    const resolved = firstRank > secondRank && firstRank >= SOURCE_PRECEDENCE.authorized_structured_api;
    return {
      groupKey: sha256(groupKey),
      status: resolved ? "resolved" : "unresolved",
      winnerEvidenceId: resolved ? ranked[0].evidenceId : null,
      claimCount: claims.length,
      resolvedAt: resolved ? resolvedAt : null,
      resolutionVersion: resolved ? "m2-v2-contradiction-v0.1" : null,
    };
  });
}

export function compareReproducibility(first, second) {
  const firstClaims = new Set((first ?? []).map((item) => sha256([item.claimKey, item.structuredValue])));
  const secondClaims = new Set((second ?? []).map((item) => sha256([item.claimKey, item.structuredValue])));
  const firstSources = new Set((first ?? []).map((item) => item.source?.sourceLineageDigest).filter(Boolean));
  const secondSources = new Set((second ?? []).map((item) => item.source?.sourceLineageDigest).filter(Boolean));
  return {
    evaluable: firstClaims.size > 0 || secondClaims.size > 0,
    claimAgreement: jaccard(firstClaims, secondClaims),
    structuredValueAgreement: jaccard(firstClaims, secondClaims),
    sourceOverlap: jaccard(firstSources, secondSources),
    confidenceDrift: meanAbsoluteDifference(first, second, (item) => item.confidence?.overall),
    contradictionDrift: meanAbsoluteDifference(first, second, (item) => contradictionCode(item.contradiction?.status)),
  };
}

export function assertPublicSanitized(value) {
  const violations = [];
  walk(value, [], (key, path) => {
    if (FORBIDDEN_PUBLIC_KEYS.has(key)) violations.push(path.join("."));
  });
  if (violations.length) throw new Error(`public_sanitization_failed:${violations.join(",")}`);
  return true;
}

export function evaluateHardGate(conditions) {
  const normalized = HARD_GATE_IDS.map((id) => ({
    id,
    passed: conditions?.[id] === true,
    evidence: conditions?.[`${id}Evidence`] ?? null,
  }));
  return {
    conditions: normalized,
    passedCount: normalized.filter((item) => item.passed).length,
    totalCount: normalized.length,
    allPassed: normalized.every((item) => item.passed),
  };
}

function sortRecursively(value) {
  if (Array.isArray(value)) return value.map(sortRecursively);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortRecursively(value[key])])
    );
  }
  return value;
}

function cleanIdentity(value) {
  return String(value ?? "").replace(/[\r\n\t]+/gu, " ").replace(/\s+/gu, " ").trim();
}

function unresolvedEntity(reason, sameNameCount, alternateCandidates = []) {
  return {
    status: "unresolved",
    resolvedEntity: null,
    matchMethod: "none",
    matchConfidence: 0,
    ambiguityReason: reason,
    alternateCandidateHashes: alternateCandidates,
    sameNameCount,
    workStatus: "unresolved",
    authorStatus: "unresolved",
  };
}

function resolvedEntity(method, confidence, alternateCandidates) {
  return {
    status: "resolved",
    resolvedEntity: "external_entity_reference",
    matchMethod: method,
    matchConfidence: confidence,
    ambiguityReason: null,
    alternateCandidateHashes: alternateCandidates,
    workStatus: "resolved",
    authorStatus: "resolved",
  };
}

function latestTimestamp(values) {
  const parsed = values.filter(Boolean).map((value) => ({ value, time: Date.parse(value) })).filter((item) => Number.isFinite(item.time));
  if (!parsed.length) return null;
  parsed.sort((a, b) => b.time - a.time);
  return parsed[0].value;
}

function walk(value, path, visitor) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, [...path, String(index)], visitor));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    visitor(key, [...path, key]);
    walk(child, [...path, key], visitor);
  }
}

function jaccard(left, right) {
  if (left.size === 0 && right.size === 0) return null;
  const intersection = [...left].filter((value) => right.has(value)).length;
  const union = new Set([...left, ...right]).size;
  return union ? intersection / union : null;
}

function meanAbsoluteDifference(first, second, selector) {
  const left = new Map((first ?? []).map((item) => [item.evidenceId, selector(item)]));
  const differences = [];
  for (const item of second ?? []) {
    const before = left.get(item.evidenceId);
    const after = selector(item);
    if (Number.isFinite(before) && Number.isFinite(after)) differences.push(Math.abs(before - after));
  }
  return differences.length ? differences.reduce((sum, value) => sum + value, 0) / differences.length : null;
}

function contradictionCode(status) {
  return { none: 0, resolved: 1, superseded: 2, detected: 3, unresolved: 4 }[status] ?? null;
}
