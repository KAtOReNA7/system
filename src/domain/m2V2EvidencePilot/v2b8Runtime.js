import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { canonicalJson, sha256 } from "./pilotCore.js";
import {
  buildAuthorityDerivedInputBindings,
  verifyCanonicalDerivedInputBindings,
} from "./authorityGraph.js";
import {
  commitAtomicRequestCheckpoint,
  evaluateGitBoundaryCommandResult,
  receiptWasCacheHit,
  validateClosedAtomicRequestBinding,
  validateReceiptEnvelope,
  withReceiptRuntimeView,
} from "./integrityState.js";
import { buildV2B5ExtractionSchemaFormat } from "./extractionV2B5.js";
import {
  buildV2B5SourceRecordSet,
  validateV2B5SourceRecord,
} from "./sourceRecordV2B5.js";
import {
  V2B5_DEFAULT_SOURCE_GOVERNANCE_POLICY,
  classifyV2B5ProhibitedSource,
} from "./sourceGovernanceV2B5.js";
import {
  assertV2B5TavilyOutboundQuery,
  buildV2B5TavilyCacheDescriptor,
  dispatchV2B5TavilyRequest,
  normalizeV2B5TavilySearchResponse,
} from "./tavilySearchProviderV2B5.js";
import {
  V2B6_ADAPTER_VERSION,
  buildV2B6Receipt,
  dispatchV2B6RelayRequest,
  normalizeV2B6BenchmarkResponse,
} from "./relayExtractionAdapterV2B6.js";
import { assertProviderExecutionReadiness, bindProviderTransport } from "./providerTransportSecurity.js";
import { inspectV2B6ProviderCacheReadiness } from "./v2b6SafeCache.js";
import {
  assertIndependentWorkbookHyperlinkLineage,
  deriveIndependentWorkbookHyperlinkLineage,
  verifyIndependentWorkbookObject,
} from "./workbookIndependentVerifier.js";
import {
  appendRuntimeRequestEvent,
  assertRuntimeRequestLedgerState,
} from "./requestEventLedger.js";
import {
  V2B7_BUNDLE_RELATIVE,
  V2B7_CANARY_MANIFEST_DIGEST,
  V2B7_MANIFEST_RELATIVE,
  V2B7_REPEAT_DIGEST,
  V2B7_SOURCE_BUNDLE_DIGEST,
  evaluateV2B7FreezeInvariants,
} from "./v2b7Contract.js";
import {
  V2B8_FILES,
  V2B8_GATE_THRESHOLDS,
  V2B8_MAX_OUTPUT_TOKENS,
  V2B8_MAX_REPAIRS,
  V2B8_MODEL_ID,
  V2B8_NAMESPACE,
  V2B8_PRIVATE_RELATIVE,
  V2B8_RELAY_REQUEST_CAP,
  V2B8_START_SHA,
  V2B8_TAVILY_REQUEST_CAP,
  V2B8_TIMEOUT_MS,
  V2B8_WORKBOOK_RELATIVE,
  assertPublicV2B8Sanitized,
  checkAndFreezeV2B8Contract,
  readV2B8FrozenContract,
} from "./v2b8Contract.js";

import {
  V2B8_CONFLICT_FAMILIES,
  V2B8_SOURCE_CATEGORIES,
  auditV2B8Conflicts,
  buildV2B8FallbackPlan,
  buildV2B8RepeatSearchPlan,
  canonicalizeV2B8Claim,
  classifyV2B8QueryExecution,
  classifyV2B8Source,
  compareV2B8CanonicalClaims,
  decomposeV2B8ClaimDifferences,
  selectDeterministicV2B8Sources,
} from "./v2b8Stability.js";

const V2B8_REQUEST_LEDGER_STAGE = "v2b8";

const PUBLIC_REPORTS = Object.freeze({
  canonicalJson: "docs/analysis/m2-v2/M2-v2-claim-canonicalization-v0.1.json",
  canonicalMarkdown: "docs/analysis/m2-v2/M2-v2-claim-canonicalization-v0.1.md",
  timeConflictJson: "docs/analysis/m2-v2/M2-v2-event-time-conflict-audit-v0.1.json",
  timeConflictMarkdown: "docs/analysis/m2-v2/M2-v2-event-time-conflict-audit-v0.1.md",
  sourceClassificationJson: "docs/analysis/m2-v2/M2-v2-source-classification-audit-v0.1.json",
  sourceClassificationMarkdown: "docs/analysis/m2-v2/M2-v2-source-classification-audit-v0.1.md",
  executionJson: "docs/analysis/m2-v2/M2-v2-canary-v3-1-execution-summary-v0.1.json",
  executionMarkdown: "docs/analysis/m2-v2/M2-v2-canary-v3-1-execution-summary-v0.1.md",
  reproducibilityJson: "docs/analysis/m2-v2/M2-v2-canary-v3-1-reproducibility-v0.1.json",
  reproducibilityMarkdown: "docs/analysis/m2-v2/M2-v2-canary-v3-1-reproducibility-v0.1.md",
  decisionJson: "docs/analysis/m2-v2/M2-v2-canary-v3-1-decision-v0.1.json",
  decisionMarkdown: "docs/analysis/m2-v2/M2-v2-canary-v3-1-decision-v0.1.md",
  nextStepJson: "docs/analysis/m2-v2/M2-v2-v2b8-next-step-v0.1.json",
  nextStepMarkdown: "docs/analysis/m2-v2/M2-v2-v2b8-next-step-v0.1.md",
});

const INTEGRITY_VALIDATION_RECEIPT_RELATIVE = "data/private-output/m2-v2-integrity-remediation/full-validation-receipt-private-v0.1.json";

const V2B8_DERIVED_EVALUATION_SCHEMA = "m2.v2.v2b8-derived-evaluation-private.v0.3";
const V2B8_EFFECTIVE_RECEIPT_INDEX_SCHEMA = "m2.v2.v2b8-effective-receipt-index-private.v0.2";
const V2B8_CLOSED_BINDING_RELATIVE = "data/private-output/m2-v2-integrity-remediation/request-state-binding-private-v0.2.json";
const V2B8_FROZEN_UPSTREAM_PATHS = Object.freeze([
  V2B7_MANIFEST_RELATIVE,
  V2B7_BUNDLE_RELATIVE,
  "data/private-output/m2-v2-evidence-pilot/v2b7-canary-v3/v2b7-execution-state-private-v0.1.json",
  "data/private-output/m2-v2-evidence-pilot/v2b7-canary-v3/canary-v3-primary-search-private-v0.2.json",
  "data/private-output/m2-v2-evidence-pilot/v2b7-canary-v3/canary-v3-repeat-search-private-v0.2.json",
  "data/private-output/m2-v2-evidence-pilot/v2b7-canary-v3/canary-v3-evidence-records-private-v0.2.ndjson",
]);

const CLAIM_CAPS = Object.freeze({
  work_identity: 1,
  author_identity: 1,
  publication_event: 2,
  original_platform: 1,
  completion_status: 1,
  adaptation_event: 1,
  award_event: 1,
  ranking_signal: 1,
  rating_signal: 1,
  search_heat_signal: 1,
  market_signal: 1,
  review_signal: 0,
  other: 0,
});

/**
 * Pure B8 bridge for the canonical authority graph. This does not rebuild or
 * persist derived state; B6 supplies the exact input digests and later binds
 * the returned records into its candidate transaction.
 */
export function buildV2B8CanonicalDerivedAuthorityBindings(input) {
  return buildAuthorityDerivedInputBindings(input);
}

export function validateV2B8CanonicalDerivedAuthorityBindings(document, evidence = {}) {
  const derivedInputBindings = document?.authorityInputBindings;
  const result = verifyCanonicalDerivedInputBindings({
    ...evidence,
    derivedInputBindings,
  });
  return {
    ...result,
    authorityInputBindings: Array.isArray(derivedInputBindings)
      ? JSON.parse(canonicalJson(derivedInputBindings))
      : null,
  };
}

const REPAIRABLE = [/strict_json_parse_failed/u, /structured_json_not_found/u, /exact_keys|keys_invalid|unexpected_key|missing_key/u, /enum|status_invalid|claim_type_invalid|value_type_invalid/u, /required|missing/u, /source_id.*(?:format|invalid)|supporting_source_ids_invalid/u, /schema_version_invalid/u];
const NON_REPAIRABLE = [/private_leak/u, /fabricated_source/u, /model_generated_url/u, /historical_backfill/u, /entity.*(?:unresolved|ambiguous|support)/u, /conflict|contradiction/u, /prohibited_source/u, /claim_exceeds|unsupported_claim/u, /time_missing|event_time/u];

export function buildV2B8ExtractionPayload(input) {
  const work = {
    title: cleanText(input?.work?.title, 200),
    author: cleanText(input?.work?.author, 200),
    sourceType: input?.work?.sourceType === "publication" ? "publication" : "web_original",
  };
  const records = projectExtractionSources(input?.sourceRecords);
  if (!work.title || !work.author || records.length < 1 || records.length > 6) throw new Error("v2b8_extraction_input_incomplete");
  const repairIssues = sanitizeRepairIssues(input?.repairIssues);
  const instructions = [
    "Extract evidence only from SOURCE_RECORDS. Never search, browse, call tools, or use outside knowledge.",
    "Resolve only the supplied work and author when exact support exists in a source title or snippet.",
    "Every entity support and claim must cite only supplied sourceIds. Never invent sourceIds or output URLs.",
    "Return at most 10 claims: work identity 1, author identity 1, publication 2, original platform 1, completion 1, adaptation 1, award 1, and at most 2 combined ranking/rating/search-heat/market signals.",
    "Do not return review_signal or other. Preserve edition/format distinctions. Rating requires platform, scale, value and observed date when present.",
    "Use eventTime only when explicitly supported; otherwise null. Do not invent month or day. Report contradictory support instead of choosing silently.",
    "Every structured value must be supported by a cited source title or snippet. Return no unsupported claim.",
    "Do not predict revenue, assign commercial value, train a model, or give operating recommendations.",
    "Return only the requested strict JSON schema.",
  ];
  if (repairIssues.length) instructions.push(`Repair only these schema issue codes: ${repairIssues.join(", ")}. Keep identical sources, model and schema.`);
  instructions.push(`WORK: ${canonicalJson(work)}`, `SOURCE_RECORDS: ${canonicalJson(records)}`);
  const payload = {
    model: V2B8_MODEL_ID,
    input: instructions.join("\n"),
    text: { format: buildV2B5ExtractionSchemaFormat() },
    store: false,
    max_output_tokens: V2B8_MAX_OUTPUT_TOKENS,
  };
  const validation = validateV2B8ExtractionPayload(payload, { records });
  if (!validation.valid) throw new Error(`v2b8_extraction_outbound_invalid:${validation.issues.join(",")}`);
  return payload;
}

export function validateV2B8ExtractionPayload(payload, context = {}) {
  const issues = [];
  if (payload?.model !== V2B8_MODEL_ID) issues.push("model_invalid");
  if (payload?.store !== false || payload?.max_output_tokens !== V2B8_MAX_OUTPUT_TOKENS) issues.push("request_contract_invalid");
  if (payload?.text?.format?.type !== "json_schema" || payload?.text?.format?.strict !== true) issues.push("server_strict_schema_missing");
  if (Object.hasOwn(payload ?? {}, "reasoning") || Object.hasOwn(payload ?? {}, "tools")) issues.push("reasoning_or_tools_prohibited");
  const serialized = canonicalJson(payload ?? {});
  if (/web_search|browser|computer-use/iu.test(serialized)) issues.push("search_or_browser_prohibited");
  if (/standardWorkId|workReference|identityDigest|canarySlotId|queryId|providerRequestId|providerReceiptRef|providerScore/iu.test(serialized)) issues.push("private_field_outbound");
  if (/https?:\/\//iu.test(serialized)) issues.push("url_outbound");
  const allowedKeys = canonicalJson(["availableAt", "capturedAt", "domain", "snippet", "sourceId", "title"]);
  for (const record of context.records ?? []) if (canonicalJson(Object.keys(record).sort()) !== allowedKeys) issues.push("source_projection_fields_invalid");
  if (sum((context.records ?? []).map((record) => [...record.snippet].length)) > 3_000) issues.push("snippet_budget_exceeded");
  return { valid: issues.length === 0, issues: unique(issues) };
}

export async function runV2B8(root, options = {}) {
  const frozen = checkAndFreezeV2B8Contract(root, options);
  const config = loadConfiguration(root, options.env);
  assertProviderExecutionReadiness({
    ...inspectV2B6ProviderCacheReadiness(root),
    providerHostBindingVerified: true,
  });
  const statePath = join(frozen.privateStore, V2B8_FILES.state);
  const tavilyCachePath = join(frozen.privateStore, V2B8_FILES.tavilyCache);
  const relayCachePath = join(frozen.privateStore, V2B8_FILES.relayCache);
  const state = readJson(statePath);
  assertRuntimeRequestLedgerState(state, V2B8_REQUEST_LEDGER_STAGE);
  state.priorCumulativeTavily ??= frozen.contract.budgets.priorCumulativeTavilyCount;
  state.priorCumulativeRelay ??= frozen.contract.budgets.priorCumulativeRelayCount;
  state.phaseACommit ??= "c184a81d11a0bed3e083e35153924231c8ee870c";
  if (state.pretestsPassed !== true) throw new Error("v2b8_pretests_not_passed");
  if (state.canaryExecuted === true) {
    if (options.resume === true) return readV2B8Results(root);
    throw new Error("v2b8_completed_execution_requires_resume_or_report");
  }
  if (["search_in_progress", "extraction_in_progress"].includes(state.phase) && options.resume !== true) throw new Error("v2b8_incomplete_execution_requires_resume");
  const tavilyCache = existsSync(tavilyCachePath) ? readJson(tavilyCachePath) : newCache("tavily", frozen.contract.contractDigest);
  const relayCache = existsSync(relayCachePath) ? readJson(relayCachePath) : newCache("relay", frozen.contract.contractDigest);
  assertRuntimeContainers(state, tavilyCache, relayCache, frozen.contract);
  reconcileReservations(state, tavilyCache, relayCache, options.now?.() ?? new Date().toISOString());
  const context = {
    root,
    frozen,
    privateStore: frozen.privateStore,
    state,
    tavilyCache,
    relayCache,
    config,
    fetchImpl: options.fetchImpl,
    now: options.now ?? (() => new Date().toISOString()),
    onProgress: options.onProgress ?? (() => {}),
  };
  checkpoint(context);
  state.phase = "search_in_progress";
  state.executionStartedAt ??= context.now();
  checkpoint(context);

  const failed = collectFailedV2B7Queries(frozen);
  if (failed.length !== 5) throw new Error(`v2b8_failed_query_count_changed:${failed.length}`);
  const fallbackQueries = [];
  for (const [index, row] of failed.entries()) {
    context.onProgress({ stage: "fallback_search", ordinal: index + 1, total: failed.length });
    const plan = buildV2B8FallbackPlan({ work: row.work, failure: row.query });
    fallbackQueries.push({ ...await executeTavilyQuery(context, plan), priorRunKind: row.runKind, workOrdinal: row.workOrdinal });
  }
  atomicWriteJson(join(frozen.privateStore, V2B8_FILES.fallbackSearch), privateArtifact("fallback_search", { queries: fallbackQueries }));

  const repeatWorks = frozen.manifest.repeatSample.map((repeat) => frozen.manifest.sample.find((work) => work.canarySlotId === repeat.canarySlotId));
  const repeatQueries = [];
  for (const [index, work] of repeatWorks.entries()) {
    context.onProgress({ stage: "repeat_search", ordinal: index + 1, total: repeatWorks.length });
    repeatQueries.push(await executeTavilyQuery(context, buildV2B8RepeatSearchPlan(work)));
  }
  const primarySearch = buildPrimarySearchRuns(frozen, fallbackQueries);
  const repeatSearch = buildRepeatSearchRuns(frozen, repeatWorks, repeatQueries);
  atomicWriteJson(join(frozen.privateStore, V2B8_FILES.primarySearch), privateArtifact("primary_source_sets", { runs: primarySearch }));
  atomicWriteJson(join(frozen.privateStore, V2B8_FILES.repeatSearch), privateArtifact("repeat_search", { runs: repeatSearch }));
  state.phase = "extraction_in_progress";
  checkpoint(context);

  const logicalRuns = [
    ...primarySearch,
    ...repeatSearch,
    ...repeatWorks.map((work, index) => ({ ...primarySearch.find((run) => run.canarySlotId === work.canarySlotId), runKind: "same_source", workOrdinal: index + 1, sourceOrigin: "v2b8_primary_source_set_fixed_repeat" })),
  ];
  const physicalReceipts = [];
  const effectiveReceipts = [];
  for (const [index, searchRun] of logicalRuns.entries()) {
    context.onProgress({ stage: "extraction", ordinal: index + 1, total: logicalRuns.length, runKind: searchRun.runKind });
    const work = frozen.manifest.sample.find((item) => item.canarySlotId === searchRun.canarySlotId);
    if (!searchRun.sourceRecords.length) {
      effectiveReceipts.push(blockedEffectiveReceipt(work, searchRun));
      continue;
    }
    const primary = await executeExtractionAttempt(context, { work, searchRun, attemptKind: "primary" });
    physicalReceipts.push(primary);
    const attempts = [primary];
    if (isRepairable(primary) && state.relay.repairCount < V2B8_MAX_REPAIRS && state.relay.physicalRequestCount < V2B8_RELAY_REQUEST_CAP) {
      const repair = await executeExtractionAttempt(context, { work, searchRun, attemptKind: "repair", repairIssues: repairIssueCodes(primary) });
      if (!receiptWasCacheHit(repair)) state.relay.repairCount += 1;
      checkpoint(context);
      physicalReceipts.push(repair);
      attempts.push(repair);
    }
    effectiveReceipts.push(selectEffectiveReceipt(attempts, { work, searchRun }));
  }
  atomicWriteNdjson(join(frozen.privateStore, V2B8_FILES.relayReceipts), [...physicalReceipts, ...effectiveReceipts]);
  const evidenceRecords = effectiveReceipts.flatMap((receipt) => (receipt.normalizedResponse?.claims ?? []).map((claim) => ({
    schema: "m2.v2.v2b8-private-evidence-record.v0.1",
    privateOnly: true,
    canarySlotId: receipt.canarySlotId,
    runKind: receipt.runKind,
    requestedModelId: receipt.requestedModelId,
    sourceRecordSetDigest: receipt.sourceRecordSetDigest,
    ...claim,
  })));
  atomicWriteNdjson(join(frozen.privateStore, V2B8_FILES.evidenceRecords), evidenceRecords);
  state.canaryExecuted = true;
  state.completedAt = context.now();
  state.phase = "canary_completed_validation_pending";
  checkpoint(context);
  evaluateAndPersist(context, { fallbackQueries, primarySearch, repeatSearch, physicalReceipts, effectiveReceipts, allTestsPassed: readValidationPassed(frozen.privateStore) });
  writeV2B8PublicReports(root);
  return readV2B8Results(root);
}

function buildPrimarySearchRuns(frozen, fallbackQueries) {
  return frozen.manifest.sample.map((work, index) => {
    const oldRun = frozen.v2b7.primarySearch.runs.find((run) => run.canarySlotId === work.canarySlotId);
    const additions = fallbackQueries.filter((query) => query.canarySlotId === work.canarySlotId && query.priorRunKind === "primary").flatMap((query) => query.sourceRecords ?? []);
    const selected = selectDeterministicV2B8Sources([...(oldRun?.sourceRecords ?? []), ...additions], { work, limit: 6 });
    const set = buildV2B5SourceRecordSet(selected.sourceRecords);
    return searchRun("primary", work, index + 1, selected, set, additions.length ? "v2b7_success_plus_failed_query_fallback" : "v2b7_success_reuse");
  });
}

function buildRepeatSearchRuns(frozen, works, queries) {
  return works.map((work, index) => {
    const query = queries[index];
    const selected = selectDeterministicV2B8Sources(query.sourceRecords ?? [], { work, limit: 6 });
    const set = buildV2B5SourceRecordSet(selected.sourceRecords);
    return { ...searchRun("fresh_repeat", work, index + 1, selected, set, "v2b8_independent_repeat_search"), queries: [query] };
  });
}

function searchRun(runKind, work, ordinal, selected, set, sourceOrigin) {
  return {
    schema: "m2.v2.v2b8-work-search-run.v0.1",
    privateOnly: true,
    runKind,
    workOrdinal: ordinal,
    canarySlotId: work.canarySlotId,
    identityDigest: work.identityDigest,
    sourceOrigin,
    queries: [],
    sourceRecords: selected.sourceRecords,
    sourceRecordCount: selected.sourceRecords.length,
    sourceRecordSetDigest: set.sourceRecordSetDigest,
    sourceCategoriesById: selected.sourceCategoriesById,
    categoryCounts: selected.categoryCounts,
    categoryLimit: selected.categoryLimit,
    categoryDiversityTarget: selected.categoryDiversityTarget,
    categoryDiversityAchieved: selected.categoryDiversityAchieved,
    identityReservationApplied: selected.identityReservationApplied,
    reservedIdentitySourceIds: selected.reservedIdentitySourceIds,
    sourceSelectionLimitations: selected.limitations,
    prohibitedSourceCount: selected.prohibitedCount,
    duplicateSourceCount: selected.duplicateCount,
    domainDiversityCount: selected.domainDiversityCount,
    logicalSearchSuccess: selected.sourceRecords.length > 0,
    full160Authorized: false,
  };
}

async function executeTavilyQuery(context, plan) {
  assertV2B5TavilyOutboundQuery(plan.queryText);
  const countryKey = plan.country === null ? "none" : "china";
  const descriptor = buildV2B5TavilyCacheDescriptor({ queryDigest: sha256(plan.queryText), executionNamespace: plan.executionNamespace, baseUrl: context.config.tavily.baseUrl, searchDepth: "basic", topic: "general", country: countryKey, maxResults: 6, includeUsage: false });
  const physicalKey = `tavily:${descriptor.cacheKey}`;
  if (context.tavilyCache.entries[descriptor.cacheKey]) {
    const cached = context.tavilyCache.entries[descriptor.cacheKey];
    recordCacheHit(context, "tavily", physicalKey, descriptor, cached);
    return { ...cached, cacheHit: true };
  }
  const priorReservation = context.state.tavily.reservations[physicalKey];
  if (priorReservation?.status === "indeterminate_after_crash") return indeterminateTavilyResult(plan, descriptor.cacheKey);
  reserveRequest(context, "tavily", physicalKey, {
    cacheKey: descriptor.cacheKey,
    runKind: plan.runKind,
    queryId: plan.queryId,
    logicalKey: descriptor.cacheKey,
    requestDigest: sha256({ provider: "tavily", descriptor }),
  });
  markRequestDispatched(context, "tavily", physicalKey);
  let result;
  try {
    const payload = { query: plan.queryText, topic: "general", search_depth: "basic", max_results: 6, include_answer: false, include_raw_content: false, auto_parameters: false };
    if (plan.country !== null) payload.country = "china";
    const response = await dispatchV2B5TavilyRequest({ fetchImpl: context.fetchImpl, baseUrl: context.config.tavily.baseUrl, apiKey: context.config.tavily.apiKey, projectId: V2B8_NAMESPACE, payload, timeoutMs: 30_000 });
    const normalized = normalizeV2B5TavilySearchResponse(response.json, { queryId: plan.queryId, requestStartedAt: response.requestStartedAt, responseReceivedAt: response.responseReceivedAt, responseTimeMs: response.responseTimeMs, httpStatus: response.httpStatus, cacheKey: descriptor.cacheKey, retryCount: 0, errorCode: response.errorCode, responseContentTypeClass: response.contentTypeClass, providerRequestId: response.providerRequestId, providerResponseTime: response.providerResponseTime, usageCredits: response.usageCredits, sourceTypeCandidate: plan.intent });
    result = tavilyResult(plan, descriptor.cacheKey, normalized, response);
  } catch (error) {
    result = { ...indeterminateTavilyResult(plan, descriptor.cacheKey), status: "transport_error", issues: [safeToken(error?.message)] };
  }
  context.tavilyCache.entries[descriptor.cacheKey] = result;
  completeRequest(context, "tavily", physicalKey, result);
  return result;
}

function tavilyResult(plan, cacheKey, normalized, response) {
  return {
    schema: "m2.v2.v2b8-tavily-query-execution.v0.1",
    privateOnly: true,
    executionNamespace: plan.executionNamespace,
    runKind: plan.runKind,
    canarySlotId: plan.canarySlotId,
    queryId: plan.queryId,
    queryText: plan.queryText,
    intent: plan.intent,
    country: plan.country,
    fallbackRule: plan.fallbackRule ?? null,
    cacheKey,
    cacheHit: false,
    dispatched: response.dispatchAttempted !== false,
    httpStatus: normalized.providerReceipt?.httpStatus ?? null,
    httpSuccess: normalized.providerConnectivityPassed === true,
    contractValid: normalized.contractValid === true,
    status: normalized.status,
    resultCount: normalized.providerReceipt?.resultCount ?? 0,
    sourceRecords: normalized.sourceRecords,
    providerReceipt: normalized.providerReceipt,
    responseTimeMs: normalized.providerReceipt?.responseTimeMs ?? null,
    usageCredits: normalized.providerReceipt?.usageCredits ?? null,
    issues: normalized.issues,
    rawResponsePersisted: false,
    full160Authorized: false,
  };
}

function indeterminateTavilyResult(plan, cacheKey) {
  return { schema: "m2.v2.v2b8-tavily-query-execution.v0.1", privateOnly: true, executionNamespace: plan.executionNamespace, runKind: plan.runKind, canarySlotId: plan.canarySlotId, queryId: plan.queryId, queryText: plan.queryText, intent: plan.intent, country: plan.country, fallbackRule: plan.fallbackRule ?? null, cacheKey, cacheHit: false, dispatched: false, httpStatus: null, httpSuccess: false, contractValid: false, status: "indeterminate_after_crash", resultCount: 0, sourceRecords: [], providerReceipt: null, responseTimeMs: null, usageCredits: null, issues: ["indeterminate_after_crash"], rawResponsePersisted: false, full160Authorized: false };
}

async function executeExtractionAttempt(context, input) {
  const descriptor = { namespace: V2B8_NAMESPACE, runKind: input.searchRun.runKind, canarySlotId: input.work.canarySlotId, model: V2B8_MODEL_ID, attemptKind: input.attemptKind, sourceRecordSetDigest: input.searchRun.sourceRecordSetDigest, adapterVersion: V2B6_ADAPTER_VERSION, extractionMode: "full", structuredMode: "server_strict", schemaVersion: "m2.v2.evidence-extraction-output.v0.2", promptVersion: "stable-core-extraction-v0.3", repairIssuesDigest: sha256(input.repairIssues ?? []) };
  const cacheKey = sha256(descriptor);
  const physicalKey = `relay:${cacheKey}`;
  if (context.relayCache.entries[cacheKey]) {
    const cached = context.relayCache.entries[cacheKey];
    recordCacheHit(context, "relay", physicalKey, descriptor, cached);
    return withReceiptRuntimeView(cached, { cacheHit: true });
  }
  const payload = buildV2B8ExtractionPayload({ work: input.work, sourceRecords: input.searchRun.sourceRecords, repairIssues: input.repairIssues });
  const priorReservation = context.state.relay.reservations[physicalKey];
  if (priorReservation?.status === "indeterminate_after_crash") return persistExtractionReceipt(context, input, descriptor, cacheKey, physicalKey, payload, { json: null, requestStartedAt: priorReservation.dispatchStartedAt ?? priorReservation.reservedAt, responseReceivedAt: context.now(), latencyMs: null, timeoutMs: V2B8_TIMEOUT_MS, timedOut: false, httpStatus: null, httpOk: false, status: "indeterminate_after_crash", contentTypeClass: "none", responseDigest: null, responseByteLength: 0, rawResponsePersisted: false }, false);
  reserveRequest(context, "relay", physicalKey, {
    cacheKey,
    ...descriptor,
    logicalKey: cacheKey,
    requestDigest: sha256({ provider: "relay", descriptor, payloadDigest: sha256(payload) }),
  });
  markRequestDispatched(context, "relay", physicalKey);
  const response = await dispatchV2B6RelayRequest({ fetchImpl: context.fetchImpl, baseUrl: context.config.relay.baseUrl, approvedHost: context.config.relay.approvedHost, apiKey: context.config.relay.apiKey, payload, timeoutMs: V2B8_TIMEOUT_MS });
  return persistExtractionReceipt(context, input, descriptor, cacheKey, physicalKey, payload, response, true);
}

function persistExtractionReceipt(context, input, descriptor, cacheKey, physicalKey, payload, response, complete) {
  const normalizedResponse = normalizeV2B6BenchmarkResponse(response.json, { sourceRecords: input.searchRun.sourceRecords, work: input.work, privateTokens: [input.work.identityDigest].filter(Boolean), governancePolicy: V2B5_DEFAULT_SOURCE_GOVERNANCE_POLICY });
  const baseReceipt = buildV2B6Receipt({ response, requestedModelId: V2B8_MODEL_ID, approvedAliases: {}, phase: "canary_v3_1", logicalExtractionKey: sha256({ runKind: input.searchRun.runKind, canarySlotId: input.work.canarySlotId }), attemptKind: input.attemptKind, runKind: input.searchRun.runKind, canarySlotId: input.work.canarySlotId, sourceBundleDigest: V2B7_SOURCE_BUNDLE_DIGEST, sourceRecordSetDigest: input.searchRun.sourceRecordSetDigest, capabilityProfileDigest: "0f4766d040ed9b267c27383002d7a596c2003557833d53b23304c8454c9e7ba9", extractionMode: "full", structuredMode: "server_strict", requestPayload: payload, normalizedResponse });
  const { receiptDigest: _discarded, ...base } = baseReceipt;
  const receiptPayload = { ...base, executionNamespace: V2B8_NAMESPACE, cacheKey, cacheHit: false, providerConnectivityPassed: response.httpOk === true && response.json !== null, providerContractCompatible: response.httpOk === true && response.json !== null, responseSchemaPass: normalizedResponse.structuredValid === true, repairIssueCodes: input.repairIssues ?? [], canaryExecuted: true, full160Authorized: false };
  const receipt = { ...receiptPayload, receiptDigest: sha256(receiptPayload) };
  context.relayCache.entries[cacheKey] = receipt;
  if (complete) completeRequest(context, "relay", physicalKey, receipt);
  else checkpoint(context);
  return receipt;
}

function selectEffectiveReceipt(physicalReceipts, logical) {
  const primary = physicalReceipts.find((receipt) => receipt.attemptKind === "primary") ?? null;
  const repair = physicalReceipts.find((receipt) => receipt.attemptKind === "repair") ?? null;
  const success = (receipt) => receipt?.modelBindingVerified === true && receipt?.providerContractCompatible === true && receipt?.normalizedResponse?.contractValid === true;
  const selected = success(repair) ? repair : success(primary) ? primary : repair ?? primary;
  const canonical = selected?.normalizedResponse ? canonicalizeResponse(selected.normalizedResponse, logical.work, logical.searchRun, {
    classificationEvidenceBySourceId: logical.classificationEvidenceBySourceId,
  }) : null;
  const payload = { schema: "m2.v2.v2b8-extraction-effective-receipt.v0.1", privateOnly: true, phase: "canary_v3_1_effective", executionNamespace: V2B8_NAMESPACE, runKind: logical.searchRun.runKind, canarySlotId: logical.work.canarySlotId, requestedModelId: V2B8_MODEL_ID, returnedModelId: selected?.returnedModelId ?? null, modelBindingStatus: selected?.modelBindingStatus ?? "unreported", modelBindingVerified: selected?.modelBindingVerified === true, providerContractCompatible: selected?.providerContractCompatible === true, adapterVersion: V2B6_ADAPTER_VERSION, extractionMode: "full", structuredMode: "server_strict", timeoutMs: V2B8_TIMEOUT_MS, sourceRecordSetDigest: logical.searchRun.sourceRecordSetDigest, schemaVersion: "m2.v2.evidence-extraction-output.v0.2", physicalRequestCount: physicalReceipts.length, physicalReceiptDigests: physicalReceipts.map((receipt) => receipt.receiptDigest), selectedAttemptKind: selected?.attemptKind ?? null, dispatched: physicalReceipts.some((receipt) => receipt.dispatched === true), timedOut: physicalReceipts.some((receipt) => receipt.timedOut === true), latencyMs: nullableSum(physicalReceipts.map((receipt) => receipt.latencyMs)), usage: sumUsage(physicalReceipts.map((receipt) => receipt.usage)), normalizedResponse: canonical, status: selected?.status ?? "missing", searchToolUsed: false, tavilyRequestUsed: false, canaryExecuted: true, full160Authorized: false };
  return { ...payload, receiptDigest: sha256(payload) };
}

function canonicalizeResponse(response, work, searchRun, options = {}) {
  const canonical = (response.claims ?? []).map((claim) => canonicalizeV2B8Claim(
    { ...claim, runKind: searchRun.runKind, canarySlotId: work.canarySlotId },
    { work, sourceRecords: searchRun.sourceRecords, classificationEvidenceBySourceId: options.classificationEvidenceBySourceId },
  ));
  const audited = auditV2B8Conflicts(canonical);
  const counts = new Map();
  const capped = [];
  for (const claim of audited.claims) {
    const count = counts.get(claim.claimType) ?? 0;
    if (count >= (CLAIM_CAPS[claim.claimType] ?? 0)) continue;
    counts.set(claim.claimType, count + 1);
    capped.push(claim);
  }
  const sourceIds = new Set(searchRun.sourceRecords.map((source) => source.sourceId));
  const claimReferences = capped.flatMap((claim) => claim.supportingSourceIds ?? []);
  const entityReferences = [
    ...(response.entityResolution?.work?.supportingSourceIds ?? []),
    ...(response.entityResolution?.author?.supportingSourceIds ?? []),
  ];
  const sourceReferences = [...claimReferences, ...entityReferences];
  const mappedSourceIdReferenceCount = sourceReferences.filter((sourceId) => sourceIds.has(sourceId)).length;
  const unresolvedOrConflictedAccepted = capped.filter((claim) => claim.accepted === true && (
    !["high", "medium"].includes(claim.entityResolution?.work?.status)
      || !["none", "resolved"].includes(claim.contradictionStatus)
  ));
  return {
    ...response,
    claims: capped,
    acceptedClaimCount: capped.filter((claim) => claim.accepted).length,
    pilotUsableClaimCount: capped.filter((claim) => claim.pilotUsable).length,
    rejectedClaimCount: capped.filter((claim) => !claim.accepted).length,
    sourceIdReferenceCount: sourceReferences.length,
    mappedSourceIdReferenceCount,
    sourceIdIntegrityRate: requiredRatio(mappedSourceIdReferenceCount, sourceReferences.length),
    fabricatedSourceIdCount: new Set(sourceReferences.filter((sourceId) => !sourceIds.has(sourceId))).size,
    historicalBackfillCount: capped.filter((claim) => claim.historicalBackfillDetected === true).length,
    unresolvedOrConflictedEvidenceExcluded: unresolvedOrConflictedAccepted.length === 0,
    v2b8ConflictAudit: {
      conflicts: audited.conflicts,
      limitations: audited.limitations,
      unresolvedConflictCount: audited.unresolvedConflictCount,
      validMultiEditionCount: audited.validMultiEditionCount,
      declaredConflictFamilies: audited.declaredConflictFamilies,
      conflictFamilyCoverage: audited.conflictFamilyCoverage,
      conflictFamilyResults: audited.conflictFamilyResults,
      applicableFamilyCount: audited.applicableFamilyCount,
      conflictAuditStatus: audited.conflictAuditStatus,
      passed: audited.passed,
    },
    claimCapApplied: true,
    claimCountBeforeCap: response.claims?.length ?? 0,
    claimCountAfterCap: capped.length,
    claimCapExcludedCount: Math.max(0, audited.claims.length - capped.length),
    conflictedClaimsRetainedBeyondCaps: 0,
    preCapConflictClaimKeyCount: new Set(audited.conflicts.flatMap((conflict) => conflict.claimKeys ?? [])).size,
    restatementAggregatesRecomputed: true,
  };
}

export function recanonicalizeV2B8EffectiveReceipts(input) {
  const manifest = input?.manifest;
  const primarySearch = Array.isArray(input?.primarySearch) ? input.primarySearch : [];
  const repeatSearch = Array.isArray(input?.repeatSearch) ? input.repeatSearch : [];
  if (!Array.isArray(manifest?.sample)) throw new Error("v2b8_restatement_manifest_invalid");
  const physicalReceiptsProvided = Array.isArray(input?.physicalReceipts);
  if (!physicalReceiptsProvided) {
    return (Array.isArray(input?.effectiveReceipts) ? input.effectiveReceipts : []).map((receipt) => ({
      ...receipt,
      normalizedResponse: null,
      restatementStatus: "NOT_EVALUABLE_EFFECTIVE_RECEIPT_LACKS_PRE_CAP_CLAIMS",
      restatementContractVersion: "v2b8-integrity-remediation-v0.1",
    }));
  }
  const logicalRuns = [
    ...primarySearch.map((searchRun) => ({ searchRun, runKind: "primary" })),
    ...repeatSearch.map((searchRun) => ({ searchRun, runKind: "fresh_repeat" })),
    ...(manifest.repeatSample ?? []).map((repeat) => ({
      searchRun: primarySearch.find((run) => run.canarySlotId === repeat.canarySlotId),
      runKind: "same_source",
    })),
  ];
  return logicalRuns.map(({ searchRun, runKind }) => {
    const work = manifest.sample.find((item) => item.canarySlotId === searchRun?.canarySlotId);
    if (!work || !searchRun || !Array.isArray(searchRun.sourceRecords)) {
      return {
        runKind,
        canarySlotId: searchRun?.canarySlotId ?? null,
        normalizedResponse: null,
        restatementStatus: "NOT_EVALUABLE_MISSING_MANIFEST_OR_SOURCE_BINDING",
        restatementContractVersion: "v2b8-integrity-remediation-v0.1",
      };
    }
    const candidates = input.physicalReceipts.map((receipt) => {
      if (receipt?.schema !== "receipt-envelope-v0.2") return { payload: receipt, digest: receipt?.receiptDigest ?? sha256(receipt) };
      const validation = validateReceiptEnvelope(receipt);
      return validation.valid ? { payload: receipt.receiptPayload, digest: receipt.receiptDigest } : null;
    }).filter(Boolean);
    const matching = candidates.filter(({ payload }) => (
      payload.runKind === runKind && payload.canarySlotId === searchRun.canarySlotId
    ));
    const attempts = matching.map(({ payload, digest }) => ({ ...payload, receiptDigest: payload.receiptDigest ?? digest }));
    if (!attempts.length) {
      return {
        runKind,
        canarySlotId: searchRun.canarySlotId,
        normalizedResponse: null,
        restatementStatus: "NOT_EVALUABLE_PHYSICAL_RECEIPT_MISSING",
        restatementContractVersion: "v2b8-integrity-remediation-v0.1",
      };
    }
    const receipt = selectEffectiveReceipt(attempts, { work, searchRun: { ...searchRun, runKind }, classificationEvidenceBySourceId: input.classificationEvidenceBySourceId });
    return {
      ...receipt,
      restatementStatus: receipt.normalizedResponse ? "RECANONICALIZED_OFFLINE_FROM_PHYSICAL_RECEIPT" : "NOT_EVALUABLE_PHYSICAL_RECEIPT_INVALID",
      restatementContractVersion: "v2b8-integrity-remediation-v0.1",
      sourcePhysicalReceiptDigests: matching.map(({ digest }) => digest),
      sourcePhysicalResponseDigests: attempts.map((attempt) => sha256(attempt.normalizedResponse ?? null)),
      restatedNormalizedResponseDigest: receipt.normalizedResponse ? sha256(receipt.normalizedResponse) : null,
    };
  });
}

export function evaluateV2B8RestatementInputs(input) {
  const effectiveReceipts = recanonicalizeV2B8EffectiveReceipts(input);
  return evaluateV2B8Canary({ ...input, effectiveReceipts });
}

function isRepairable(receipt) {
  const normalized = receipt?.normalizedResponse;
  if (receipt?.attemptKind !== "primary" || receipt?.dispatched !== true || receipt?.httpOk !== true || receipt?.modelBindingVerified !== true || normalized?.structuredValid === true) return false;
  if ((normalized?.privateLeakCount ?? 0) > 0 || (normalized?.fabricatedSourceIdCount ?? 0) > 0 || (normalized?.modelGeneratedUrlCount ?? 0) > 0 || (normalized?.historicalBackfillCount ?? 0) > 0) return false;
  const issues = unique([...(normalized?.issues ?? []), ...(normalized?.carrierIssues ?? [])]);
  if (issues.some((issue) => NON_REPAIRABLE.some((pattern) => pattern.test(issue)))) return false;
  return issues.some((issue) => REPAIRABLE.some((pattern) => pattern.test(issue)));
}

function repairIssueCodes(receipt) {
  return sanitizeRepairIssues([...(receipt.normalizedResponse?.issues ?? []), ...(receipt.normalizedResponse?.carrierIssues ?? [])]);
}

export function evaluateV2B8Canary(input) {
  const currentContract = input.evaluationContract === "current_v0.3";
  const manifest = input.manifest;
  const fallbackQueries = input.fallbackQueries ?? [];
  const primarySearch = input.primarySearch ?? [];
  const repeatSearch = input.repeatSearch ?? [];
  const physicalReceipts = input.physicalReceipts ?? [];
  const effectiveReceipts = input.effectiveReceipts ?? [];
  const primary = effectiveReceipts.filter((receipt) => receipt.runKind === "primary");
  const repeat = effectiveReceipts.filter((receipt) => receipt.runKind === "fresh_repeat");
  const same = effectiveReceipts.filter((receipt) => receipt.runKind === "same_source");
  const oldQueries = [...input.v2b7.primarySearch.runs, ...input.v2b7.repeatSearch.runs].flatMap((run) => run.queries ?? []);
  const oldSuccessCount = oldQueries.filter((query) => query.contractValid === true).length;
  const repeatQueries = repeatSearch.flatMap((run) => run.queries ?? []);
  const fallbackSuccessCount = fallbackQueries.filter((query) => query.contractValid === true).length;
  const repeatQuerySuccessCount = repeatQueries.filter((query) => query.contractValid === true).length;
  const querySuccessCount = oldSuccessCount + fallbackSuccessCount + repeatQuerySuccessCount;
  const queryDenominator = oldSuccessCount + fallbackQueries.length + repeatQueries.length;
  const manifestSampleComplete = manifest?.sample?.length === 10 && manifest?.repeatSample?.length === 5;
  const querySampleComplete = oldQueries.length > 0
    && fallbackQueries.length === oldQueries.filter((query) => query.contractValid !== true).length
    && repeatQueries.length === manifest?.repeatSample?.length;
  const correctedOriginalSuccessRate = requiredRatio(oldSuccessCount + fallbackSuccessCount, oldSuccessCount + fallbackQueries.length);
  const querySuccessRate = querySampleComplete ? requiredRatio(querySuccessCount, queryDenominator) : null;
  const primarySourceWorks = primarySearch.filter((run) => run.sourceRecords.length > 0);
  const primarySchema = primary.filter(effectiveSchemaPass);
  const repeatSchema = repeat.filter(effectiveSchemaPass);
  const allLogical = [...primary, ...repeat, ...same];
  const primaryReceiptComplete = primary.length === 10;
  const repeatReceiptComplete = repeat.length === 5;
  const sameReceiptComplete = same.length === 5;
  const logicalSampleComplete = primaryReceiptComplete && repeatReceiptComplete && sameReceiptComplete;
  const primarySearchComplete = manifestSampleComplete && primarySearch.length === 10;
  const noTimeoutRate = requiredSampleRatio(allLogical.filter((receipt) => receipt.timedOut !== true).length, 20, allLogical.length, 20);
  const resolved = primary.filter((receipt) => ["high", "medium"].includes(receipt.normalizedResponse?.entityResolution?.work?.status));
  const primaryPilot = primary.filter((receipt) => (receipt.normalizedResponse?.pilotUsableClaimCount ?? 0) > 0);
  const highValueSlots = new Set(manifest.sample.filter((work) => work.highValue === true).map((work) => work.canarySlotId));
  const highValuePilot = primaryPilot.filter((receipt) => highValueSlots.has(receipt.canarySlotId));
  const allClaims = allLogical.flatMap((receipt) => receipt.normalizedResponse?.claims ?? []);
  const primaryClaims = primary.flatMap((receipt) => receipt.normalizedResponse?.claims ?? []);
  const pilotClaims = allClaims.filter((claim) => claim.pilotUsable === true);
  const acceptedClaims = allClaims.filter((claim) => claim.accepted === true);
  const allSources = [...primarySearch, ...repeatSearch].flatMap((run) => run.sourceRecords);
  const reproducibility = buildReproducibility(manifest, primarySearch, repeatSearch, primary, repeat, same);
  const sourceCategories = countBy(allSources, (source) => currentContract
    ? classifyV2B8Source(source, input.classificationEvidenceBySourceId?.[source.sourceId])
    : classifyV2B8SourceHistorical(source));
  for (const category of V2B8_SOURCE_CATEGORIES) sourceCategories[category] ??= 0;
  const claimCategories = countBy(pilotClaims, (claim) => claim.sourceSupportClass ?? "unknown_public_web");
  const unknownClaimShare = requiredRatio(claimCategories.unknown_public_web ?? 0, pilotClaims.length);
  const explicitTemporalClaims = allClaims.filter((claim) => claim.explicitTemporalText === true);
  const explicitTimeExtractionRate = requiredRatio(
    explicitTemporalClaims.filter((claim) => claim.eventTimeExtractionSucceeded === true).length,
    explicitTemporalClaims.length,
  );
  const unresolvedConflictCount = sum(allLogical.map((receipt) => receipt.normalizedResponse?.v2b8ConflictAudit?.unresolvedConflictCount));
  const unresolvedConflictPilotCount = allClaims.filter((claim) => claim.pilotUsable === true && claim.contradictionStatus === "unresolved").length;
  const eventTimeProvenanceMissingCount = allClaims.filter((claim) => claim.eventTime && (
    !claim.eventTimeSourceId
      || !claim.eventTimeEvidenceSpanDigest
      || currentContract && (
        !claim.eventTimeClauseDigest
        || !Number.isInteger(claim.eventTimeSpanStart)
        || !Number.isInteger(claim.eventTimeSpanEnd)
        || claim.eventTimeSpanStart < 0
        || claim.eventTimeSpanEnd <= claim.eventTimeSpanStart
        || !Number.isInteger(claim.eventKeywordSpan?.start)
        || !Number.isInteger(claim.eventKeywordSpan?.end)
        || claim.eventKeywordSpan.start < 0
        || claim.eventKeywordSpan.end <= claim.eventKeywordSpan.start
      )
  )).length;
  const conflictAggregate = currentContract ? aggregateV2B8ConflictApplicability(allLogical) : null;
  const conflictFamilyCoverageComplete = currentContract
    ? conflictAggregate.passed
    : allLogical.every((receipt) => V2B8_CONFLICT_FAMILIES.every(
      (family) => receipt.normalizedResponse?.v2b8ConflictAudit?.conflictFamilyCoverage?.[family] === true,
    ));
  const weakUnsupportedRatingReviewCount = allClaims.filter((claim) => claim.pilotUsable === true && (claim.claimType === "review_signal" || claim.claimType === "rating_signal" && (!claim.normalizedStructuredValue?.platform || !claim.normalizedStructuredValue?.scale))).length;
  const sourceReferenceCount = sum(allLogical.map((receipt) => receipt.normalizedResponse?.sourceIdReferenceCount));
  const mappedReferenceCount = sum(allLogical.map((receipt) => receipt.normalizedResponse?.mappedSourceIdReferenceCount));
  const sourceIntegrity = requiredRatio(mappedReferenceCount, sourceReferenceCount);
  const capturedCompleteness = requiredRatio(allSources.filter((source) => isIsoTimestamp(source.capturedAt)).length, allSources.length);
  const availableCompleteness = requiredRatio(allSources.filter((source) => isIsoTimestamp(source.availableAt)).length, allSources.length);
  const sourceWorkCoverage = primarySearchComplete ? requiredRatio(primarySourceWorks.length, 10) : null;
  const primarySchemaPassRate = requiredSampleRatio(primarySchema.length, 10, primary.length, 10);
  const repeatSchemaPassRate = requiredSampleRatio(repeatSchema.length, 5, repeat.length, 5);
  const workResolvedRate = requiredSampleRatio(resolved.length, 10, primary.length, 10);
  const pilotUsableWorkCoverage = requiredSampleRatio(primaryPilot.length, 10, primary.length, 10);
  const highValueCoverage = manifestSampleComplete ? requiredRatio(highValuePilot.length, highValueSlots.size) : null;
  const prohibitedAcceptedCount = allClaims.filter((claim) => claim.accepted === true && (claim.supportingSourceIds ?? []).some((sourceId) => {
    const source = allSources.find((item) => item.sourceId === sourceId);
    return source && classifyV2B5ProhibitedSource(source).prohibited;
  })).length;
  const bindingMismatchCount = physicalReceipts.filter((receipt) => receipt.modelBindingStatus === "mismatch").length;
  const gitBoundary = input.gitBoundary ?? {};
  const safetyItems = [
    gate("private_leak_zero", sum(allLogical.map((receipt) => receipt.normalizedResponse?.privateLeakCount)), 0, equal, logicalSampleComplete),
    gate("prohibited_source_accepted_zero", prohibitedAcceptedCount, 0, equal, logicalSampleComplete),
    gate("fabricated_source_id_zero", sum(allLogical.map((receipt) => receipt.normalizedResponse?.fabricatedSourceIdCount)), 0, equal, logicalSampleComplete),
    gate("model_generated_url_zero", sum(allLogical.map((receipt) => receipt.normalizedResponse?.modelGeneratedUrlCount)), 0, equal, logicalSampleComplete),
    gate("historical_backfill_zero", sum(allLogical.map((receipt) => receipt.normalizedResponse?.historicalBackfillCount)), 0, equal, logicalSampleComplete),
    gate("source_id_integrity", sourceIntegrity, 1, equal),
    gate("captured_at_complete", capturedCompleteness, 1, equal),
    gate("available_at_complete", availableCompleteness, 1, equal),
    gate("unresolved_conflicted_pilot_zero", unresolvedConflictPilotCount, 0, equal, logicalSampleComplete),
    gate("explicit_temporal_extraction_complete", explicitTimeExtractionRate, 1, equal),
    ...(currentContract ? [
      gate("event_time_provenance_complete", eventTimeProvenanceMissingCount, 0, equal, logicalSampleComplete),
      gate("conflict_family_coverage_complete", conflictFamilyCoverageComplete, true, equal, logicalSampleComplete),
    ] : []),
    gate("manifest_unchanged", input.manifestUnchanged === true, true, equal, manifestSampleComplete && typeof input.manifestUnchanged === "boolean"),
    gate("b4_unchanged", gitBoundary.b4Unchanged === true, true, equal, typeof gitBoundary.b4Unchanged === "boolean"),
    gate("final_holdout_sealed", gitBoundary.holdoutSealed === true, true, equal, typeof gitBoundary.holdoutSealed === "boolean"),
    gate("all_tests_pass", input.allTestsPassed === true, true, equal, typeof input.allTestsPassed === "boolean"),
  ];
  const qualityItems = [
    gate("query_success_rate", querySuccessRate, V2B8_GATE_THRESHOLDS.querySuccessRate, atLeast),
    gate("source_record_work_coverage", sourceWorkCoverage, V2B8_GATE_THRESHOLDS.sourceRecordWorkCoverage, atLeast),
    gate("mean_repeat_source_overlap", reproducibility.meanRepeatSourceOverlap, V2B8_GATE_THRESHOLDS.meanRepeatSourceOverlap, atLeast, manifestSampleComplete),
    gate("primary_schema_pass_rate", primarySchemaPassRate, V2B8_GATE_THRESHOLDS.primarySchemaPassRate, atLeast),
    gate("repeat_schema_pass_rate", repeatSchemaPassRate, V2B8_GATE_THRESHOLDS.repeatSchemaPassRate, atLeast),
    gate("no_timeout_rate", noTimeoutRate, V2B8_GATE_THRESHOLDS.noTimeoutRate, atLeast),
    gate("work_resolved_rate", workResolvedRate, V2B8_GATE_THRESHOLDS.workResolvedRate, atLeast),
    gate("pilot_usable_work_coverage", pilotUsableWorkCoverage, V2B8_GATE_THRESHOLDS.pilotUsableWorkCoverage, atLeast),
    gate("high_value_coverage", highValueCoverage, V2B8_GATE_THRESHOLDS.highValueCoverage, atLeast),
    gate("same_source_claim_agreement", reproducibility.sameSourceClaimAgreement, V2B8_GATE_THRESHOLDS.sameSourceClaimAgreement, atLeast, reproducibility.sameSourceEvaluableCount === 5),
    gate("end_to_end_semantic_claim_agreement", reproducibility.endToEndSemanticClaimAgreement, V2B8_GATE_THRESHOLDS.endToEndSemanticClaimAgreement, atLeast, reproducibility.endToEndEvaluableCount === 5),
    gate("weak_unsupported_rating_review_zero", weakUnsupportedRatingReviewCount, 0, equal, logicalSampleComplete),
    gate("unknown_public_web_claim_share", unknownClaimShare, V2B8_GATE_THRESHOLDS.unknownPublicWebClaimShare, atMost),
    gate("model_binding_mismatch_zero", bindingMismatchCount, 0, equal, logicalSampleComplete),
  ];
  const safetyPassed = safetyItems.every((item) => item.passed);
  const qualityPassed = qualityItems.every((item) => item.passed);
  const reportedSafetyItems = currentContract ? safetyItems : safetyItems.map(historicalGateProjection);
  const reportedQualityItems = currentContract ? qualityItems : qualityItems.map(historicalGateProjection);
  const validationPending = input.allTestsPassed !== true && input.validationPending === true;
  const providerBlocked = input.providerBlocked === true;
  const decision = providerBlocked || validationPending ? "CANARY_BLOCKED" : !safetyPassed ? "CANARY_FAIL" : qualityPassed ? "CANARY_PASS" : "CANARY_CONDITIONAL";
  return {
    schema: currentContract
      ? "m2.v2.v2b8-canary-v3-1-evaluation-private.v0.3"
      : "m2.v2.v2b8-canary-v3-1-evaluation-private.v0.1",
    privateOnly: true,
    evaluatedAt: input.evaluatedAt ?? new Date().toISOString(),
    manifestDigest: V2B7_CANARY_MANIFEST_DIGEST,
    repeatDigest: V2B7_REPEAT_DIGEST,
    sourceBundleDigest: V2B7_SOURCE_BUNDLE_DIGEST,
    metrics: {
      search: { oldLogicalQueryCount: oldQueries.length, oldSuccessCount, failedQueryFallbackCount: fallbackQueries.length, fallbackSuccessCount, correctedOriginalSuccessRate, independentRepeatQueryCount: repeatQueries.length, independentRepeatSuccessCount: repeatQuerySuccessCount, querySuccessCount, queryDenominator, querySuccessRate, providerErrorCount: fallbackQueries.concat(repeatQueries).filter((query) => query.httpSuccess !== true).length, sourceRecordWorkCount: primarySourceWorks.length, sourceRecordWorkCoverage: sourceWorkCoverage, totalSelectedSourceRecordCount: allSources.length },
      extraction: { model: V2B8_MODEL_ID, primaryLogicalCount: primary.length, repeatLogicalCount: repeat.length, sameSourceLogicalCount: same.length, primarySchemaPassCount: primarySchema.length, primarySchemaPassRate, repeatSchemaPassCount: repeatSchema.length, repeatSchemaPassRate, sameSourceSchemaPassCount: same.filter(effectiveSchemaPass).length, noTimeoutCount: allLogical.filter((receipt) => receipt.timedOut !== true).length, noTimeoutRate, bindingMismatchCount },
      entity: { resolvedCount: resolved.length, unresolvedCount: primary.filter((receipt) => receipt.normalizedResponse?.entityResolution?.work?.status === "unresolved").length, ambiguousCount: primary.filter((receipt) => receipt.normalizedResponse?.entityResolution?.work?.status === "ambiguous").length, resolvedRate: workResolvedRate, confidence: average(primary.map((receipt) => receipt.normalizedResponse?.entityResolution?.work?.confidence).filter(Number.isFinite)) },
      evidence: { candidateCount: allClaims.length, acceptedCount: acceptedClaims.length, pilotUsableCount: pilotClaims.length, rejectedCount: allClaims.filter((claim) => claim.accepted !== true).length, rejectionReasons: countMany(allClaims.flatMap((claim) => claim.rejectionReasons ?? [])), primaryCandidateCount: primaryClaims.length, primaryPilotUsableCount: primaryClaims.filter((claim) => claim.pilotUsable).length, pilotUsableWorkCount: primaryPilot.length, pilotUsableWorkCoverage, highValueWorkCount: highValueSlots.size, highValuePilotUsableWorkCount: highValuePilot.length, highValueCoverage, weakUnsupportedRatingReviewCount },
      timeConflict: {
        explicitTemporalClaimCount: explicitTemporalClaims.length,
        explicitTemporalExtractionRate: explicitTimeExtractionRate,
        eventTimePrecisionCounts: countBy(allClaims, (claim) => claim.eventTimePrecision ?? "unknown"),
        eventTimeBasisCounts: countBy(allClaims, (claim) => claim.eventTimeBasis ?? "unknown"),
        unresolvedConflictCount,
        unresolvedConflictPilotCount,
        validMultiEditionCount: sum(allLogical.map((receipt) => receipt.normalizedResponse?.v2b8ConflictAudit?.validMultiEditionCount)),
        ...(currentContract ? {
          eventTimeProvenanceCompleteCount: allClaims.filter((claim) => claim.eventTime).length - eventTimeProvenanceMissingCount,
          eventTimeProvenanceMissingCount,
          declaredConflictFamilies: [...V2B8_CONFLICT_FAMILIES],
          conflictFamilyCoverage: Object.fromEntries(V2B8_CONFLICT_FAMILIES.map((family) => [family, conflictAggregate.familyResults[family].executed])),
          conflictFamilyResults: conflictAggregate.familyResults,
          applicableFamilyCount: conflictAggregate.applicableFamilyCount,
          conflictAuditStatus: conflictAggregate.conflictAuditStatus,
          passed: conflictAggregate.passed,
        } : {}),
      },
      sourceClassification: {
        sourceCategories,
        claimSupportCategories: claimCategories,
        unknownPublicWebClaimShare: unknownClaimShare,
        prohibitedAcceptedCount,
        ...(currentContract ? {
          categoryDiversityTarget: Math.max(0, ...primarySearch.map((run) => Number(run.categoryDiversityTarget ?? 0))),
          minimumCategoryDiversityAchieved: primarySearch.length ? Math.min(...primarySearch.map((run) => Number(run.categoryDiversityAchieved ?? Object.keys(run.categoryCounts ?? {}).length))) : null,
          identityReservationAppliedWorkCount: primarySearch.filter((run) => run.identityReservationApplied === true).length,
          selectionLimitations: countMany(primarySearch.flatMap((run) => run.sourceSelectionLimitations ?? [])),
        } : {}),
      },
      citationGovernance: { sourceIdReferenceCount: sourceReferenceCount, mappedSourceIdReferenceCount: mappedReferenceCount, sourceIdIntegrityRate: sourceIntegrity, capturedAtCompleteness: capturedCompleteness, availableAtCompleteness: availableCompleteness, researchApprovedCount: allClaims.filter((claim) => claim.researchApproved).length, modelEligibleCount: allClaims.filter((claim) => claim.modelEligible).length },
      reproducibility,
    },
    safetyGates: reportedSafetyItems,
    qualityGates: reportedQualityItems,
    safetyPassed,
    qualityPassed,
    decision,
    blockerIds: [...reportedSafetyItems, ...reportedQualityItems].filter((item) => !item.passed).map((item) => item.id),
    nextStep: decision === "CANARY_PASS" ? "stop_and_request_separate_full160_authorization" : decision === "CANARY_CONDITIONAL" ? "review_private_pack_and_repair_quality_without_scaling" : decision === "CANARY_FAIL" ? "repair_safety_contract_without_scaling" : "resolve_provider_or_validation_blocker",
    modelTrainingPerformed: false,
    sampleReplaced: false,
    b4Changed: false,
    finalHoldoutOpened: false,
    enteredV2COrV2D: false,
    enteredC4OrM3: false,
    released: false,
    full160Authorized: false,
    notForFormalDecision: true,
  };
}

function aggregateV2B8ConflictApplicability(logicalReceipts) {
  const familyResults = Object.fromEntries(V2B8_CONFLICT_FAMILIES.map((family) => {
    const rows = logicalReceipts
      .map((receipt) => receipt.normalizedResponse?.v2b8ConflictAudit?.conflictFamilyResults?.[family])
      .filter((row) => row && typeof row === "object");
    const evidenceCount = sum(rows.map((row) => row.evidenceCount));
    const conflictCount = sum(rows.map((row) => row.conflictCount));
    const unresolvedCount = sum(rows.map((row) => row.unresolvedCount));
    const applicable = evidenceCount > 0;
    const applicableRows = rows.filter((row) => Number(row.evidenceCount ?? 0) > 0);
    const executed = applicable && applicableRows.length > 0 && applicableRows.every((row) => row.executed === true);
    return [family, {
      applicable,
      executed,
      evidenceCount,
      conflictCount,
      unresolvedCount,
      passed: applicable && executed && unresolvedCount === 0,
    }];
  }));
  const applicableRows = Object.values(familyResults).filter((row) => row.applicable);
  const applicableFamilyCount = applicableRows.length;
  const conflictAuditStatus = applicableFamilyCount === 0
    ? "NOT_EVALUABLE"
    : applicableRows.every((row) => row.passed) ? "PASS" : "FAIL";
  return {
    familyResults,
    applicableFamilyCount,
    conflictAuditStatus,
    passed: conflictAuditStatus === "PASS",
  };
}

function buildReproducibility(manifest, primarySearch, repeatSearch, primaryReceipts, repeatReceipts, sameReceipts) {
  const pairs = manifest.repeatSample.map((repeat, index) => {
    const slot = repeat.canarySlotId;
    const primaryRun = primarySearch.find((run) => run.canarySlotId === slot);
    const repeatRun = repeatSearch.find((run) => run.canarySlotId === slot);
    const primary = primaryReceipts.find((receipt) => receipt.canarySlotId === slot)?.normalizedResponse?.claims ?? [];
    const fresh = repeatReceipts.find((receipt) => receipt.canarySlotId === slot)?.normalizedResponse?.claims ?? [];
    const same = sameReceipts.find((receipt) => receipt.canarySlotId === slot)?.normalizedResponse?.claims ?? [];
    const primaryIds = new Set((primaryRun?.sourceRecords ?? []).map((source) => source.sourceId));
    const repeatIds = new Set((repeatRun?.sourceRecords ?? []).map((source) => source.sourceId));
    const overlap = jaccard(primaryIds, repeatIds);
    const decomposition = decomposeV2B8ClaimDifferences({ primaryClaims: primary, freshClaims: fresh, sameSourceClaims: same, primarySourceDigest: primaryRun?.sourceRecordSetDigest, freshSourceDigest: repeatRun?.sourceRecordSetDigest });
    const freshComparison = compareV2B8CanonicalClaims(primary, fresh);
    const sameComparison = compareV2B8CanonicalClaims(primary, same);
    return { anonymousPairId: `pair_${index + 1}`, sourceOverlap: overlap, exactSourceSet: overlap === 1, endToEndSemanticAgreement: freshComparison.agreement, endToEndStatus: freshComparison.status, sameSourceAgreement: sameComparison.agreement, sameSourceStatus: sameComparison.status, ...decomposition };
  });
  const endEvaluable = pairs.filter((pair) => pair.endToEndStatus === "evaluable");
  const sameEvaluable = pairs.filter((pair) => pair.sameSourceStatus === "evaluable");
  return {
    expectedPairCount: 5,
    meanRepeatSourceOverlap: average(pairs.map((pair) => pair.sourceOverlap)) ?? 0,
    medianRepeatSourceOverlap: percentile(pairs.map((pair) => pair.sourceOverlap), 0.5),
    exactSourceSetCount: pairs.filter((pair) => pair.exactSourceSet).length,
    sameSourceClaimAgreement: average(sameEvaluable.map((pair) => pair.sameSourceAgreement)),
    sameSourceEvaluableCount: sameEvaluable.length,
    endToEndSemanticClaimAgreement: average(endEvaluable.map((pair) => pair.endToEndSemanticAgreement)),
    endToEndEvaluableCount: endEvaluable.length,
    contributions: { sourceSetChangedPairCount: pairs.filter((pair) => pair.sourceSetChanged).length, sameSourceExtractionChangedPairCount: pairs.filter((pair) => pair.sameSourceExtractionChanged).length, canonicalizationOnlyPairCount: pairs.filter((pair) => pair.canonicalizationOnlyDifference).length, claimAdded: sum(pairs.map((pair) => pair.claimAdded)), claimMissing: sum(pairs.map((pair) => pair.claimMissing)), structuredValueChanged: sum(pairs.map((pair) => pair.structuredValueChanged)), confidenceOnlyChanged: sum(pairs.map((pair) => pair.confidenceOnlyChanged)), conflictStatusChanged: sum(pairs.map((pair) => pair.conflictStatusChanged)), eventTimeChanged: sum(pairs.map((pair) => pair.eventTimeChanged)) },
    perPair: pairs,
  };
}

function evaluateAndPersist(context, input) {
  const invariant = evaluateV2B7FreezeInvariants({ original: context.frozen.v2b7.original ?? readJson(join(context.root, "data/private-output/m2-v2-evidence-pilot/canary-v0.1/canary-manifest-private-v0.1.json")), manifest: context.frozen.manifest, bundle: context.frozen.bundle, b5State: readJson(join(context.root, "data/private-output/m2-v2-evidence-pilot/v2-b5-independent-search-canary/v2b5-execution-state-private-v0.1.json")), b6State: readJson(join(context.root, "data/private-output/m2-v2-evidence-pilot/v2-b6-extraction-remediation/v2b6-execution-state-private-v0.1.json")) });
  const evaluation = evaluateV2B8Canary({ manifest: context.frozen.manifest, v2b7: context.frozen.v2b7, ...input, manifestUnchanged: invariant.allPassed && context.frozen.manifest.manifestDigest === V2B7_CANARY_MANIFEST_DIGEST && context.frozen.bundle.sourceBundleDigest === V2B7_SOURCE_BUNDLE_DIGEST, gitBoundary: auditGitBoundary(context.root), validationPending: !existsSync(join(context.privateStore, V2B8_FILES.validation)), evaluatedAt: context.now() });
  const reproducibility = { schema: "m2.v2.v2b8-reproducibility-private.v0.1", privateOnly: true, ...evaluation.metrics.reproducibility, full160Authorized: false };
  const usage = buildUsage(context.state, input.fallbackQueries, input.repeatSearch, input.physicalReceipts);
  atomicWriteJson(join(context.privateStore, V2B8_FILES.evaluation), evaluation);
  atomicWriteJson(join(context.privateStore, V2B8_FILES.reproducibility), reproducibility);
  atomicWriteJson(join(context.privateStore, V2B8_FILES.usage), usage);
  context.state.finalDecision = evaluation.decision;
  context.state.phase = input.allTestsPassed === true ? "completed" : "canary_completed_validation_pending";
  checkpoint(context);
  return evaluation;
}

function buildUsage(state, fallbackQueries, repeatSearch, physicalReceipts) {
  const queryRows = [...fallbackQueries, ...repeatSearch.flatMap((run) => run.queries ?? [])];
  const cumulativeTavily = state.tavily.physicalRequestCount + state.priorCumulativeTavily;
  const cumulativeRelay = state.relay.physicalRequestCount + state.priorCumulativeRelay;
  return { schema: "m2.v2.v2b8-usage-ledger-private.v0.1", privateOnly: true, tavily: { newPhysicalRequestCount: state.tavily.physicalRequestCount, cumulativePhysicalRequestCount: cumulativeTavily, requestCap: state.tavily.cap, usageCredits: nullableSum(queryRows.map((row) => row.usageCredits)), p50LatencyMs: percentile(queryRows.map((row) => row.responseTimeMs), 0.5), p90LatencyMs: percentile(queryRows.map((row) => row.responseTimeMs), 0.9) }, relay: { newPhysicalRequestCount: state.relay.physicalRequestCount, cumulativePhysicalRequestCount: cumulativeRelay, requestCap: state.relay.cap, repairCount: state.relay.repairCount, inputTokens: nullableSum(physicalReceipts.map((row) => row.usage?.inputTokens)), outputTokens: nullableSum(physicalReceipts.map((row) => row.usage?.outputTokens)), totalTokens: nullableSum(physicalReceipts.map((row) => row.usage?.totalTokens)), p50LatencyMs: percentile(physicalReceipts.map((row) => row.latencyMs), 0.5), p90LatencyMs: percentile(physicalReceipts.map((row) => row.latencyMs), 0.9), estimatedRelayCost: null, estimatedRelayCostStatus: "third_party_relay_price_not_proven" }, officialOpenAiPricingApplied: false, full160Authorized: false };
}

export function readV2B8Results(root) {
  const frozen = readV2B8FrozenContract(root);
  const fallbackQueries = readJson(join(frozen.privateStore, V2B8_FILES.fallbackSearch)).queries;
  const primarySearch = readJson(join(frozen.privateStore, V2B8_FILES.primarySearch)).runs;
  const repeatSearch = readJson(join(frozen.privateStore, V2B8_FILES.repeatSearch)).runs;
  const receipts = readNdjson(join(frozen.privateStore, V2B8_FILES.relayReceipts));
  return {
    ...frozen,
    state: frozen.state,
    fallbackQueries,
    primarySearch,
    repeatSearch,
    physicalReceipts: receipts.filter((receipt) => receipt.schema === "m2.v2.relay-extraction-receipt.v0.2"),
    effectiveReceipts: receipts.filter((receipt) => receipt.schema === "m2.v2.v2b8-extraction-effective-receipt.v0.1"),
    evidenceRecords: readNdjson(join(frozen.privateStore, V2B8_FILES.evidenceRecords)),
    reproducibility: readJson(join(frozen.privateStore, V2B8_FILES.reproducibility)),
    evaluation: readJson(join(frozen.privateStore, V2B8_FILES.evaluation)),
    usage: readJson(join(frozen.privateStore, V2B8_FILES.usage)),
    validation: existsSync(join(frozen.privateStore, V2B8_FILES.validation)) ? readJson(join(frozen.privateStore, V2B8_FILES.validation)) : null,
    verification: existsSync(join(frozen.privateStore, V2B8_FILES.verification)) ? readJson(join(frozen.privateStore, V2B8_FILES.verification)) : null,
    workbookExists: existsSync(join(root, V2B8_WORKBOOK_RELATIVE)),
    workbookVerification: existsSync(join(frozen.privateStore, V2B8_FILES.workbookVerification)) ? readJson(join(frozen.privateStore, V2B8_FILES.workbookVerification)) : null,
  };
}

export function rebuildV2B8DerivedArtifacts(root) {
  const results = readV2B8Results(root);
  const logicalRuns = [...results.primarySearch, ...results.repeatSearch, ...results.manifest.repeatSample.map((repeat, index) => ({ ...results.primarySearch.find((run) => run.canarySlotId === repeat.canarySlotId), runKind: "same_source", workOrdinal: index + 1, sourceOrigin: "v2b8_primary_source_set_fixed_repeat" }))];
  const effectiveReceipts = logicalRuns.map((searchRun) => {
    const work = results.manifest.sample.find((item) => item.canarySlotId === searchRun.canarySlotId);
    if (!searchRun.sourceRecords.length) return blockedEffectiveReceipt(work, searchRun);
    const attempts = results.physicalReceipts.filter((receipt) => receipt.runKind === searchRun.runKind && receipt.canarySlotId === searchRun.canarySlotId);
    return selectEffectiveReceipt(attempts, { work, searchRun });
  });
  atomicWriteNdjson(join(results.privateStore, V2B8_FILES.relayReceipts), [...results.physicalReceipts, ...effectiveReceipts]);
  const evidenceRecords = effectiveReceipts.flatMap((receipt) => (receipt.normalizedResponse?.claims ?? []).map((claim) => ({ schema: "m2.v2.v2b8-private-evidence-record.v0.1", privateOnly: true, canarySlotId: receipt.canarySlotId, runKind: receipt.runKind, requestedModelId: receipt.requestedModelId, sourceRecordSetDigest: receipt.sourceRecordSetDigest, ...claim })));
  atomicWriteNdjson(join(results.privateStore, V2B8_FILES.evidenceRecords), evidenceRecords);
  const context = persistenceContext(results, root);
  evaluateAndPersist(context, { fallbackQueries: results.fallbackQueries, primarySearch: results.primarySearch, repeatSearch: results.repeatSearch, physicalReceipts: results.physicalReceipts, effectiveReceipts, allTestsPassed: readValidationPassed(results.privateStore) });
  writeV2B8PublicReports(root);
  return readV2B8Results(root);
}

export function writeV2B8PublicReports(root) {
  const results = readV2B8Results(root);
  const bundle = publicReportBundle(results);
  const outputs = {
    [PUBLIC_REPORTS.canonicalJson]: `${JSON.stringify(bundle.canonical, null, 2)}\n`,
    [PUBLIC_REPORTS.canonicalMarkdown]: renderCanonicalAudit(bundle.canonical),
    [PUBLIC_REPORTS.timeConflictJson]: `${JSON.stringify(bundle.timeConflict, null, 2)}\n`,
    [PUBLIC_REPORTS.timeConflictMarkdown]: renderTimeConflictAudit(bundle.timeConflict),
    [PUBLIC_REPORTS.sourceClassificationJson]: `${JSON.stringify(bundle.sourceClassification, null, 2)}\n`,
    [PUBLIC_REPORTS.sourceClassificationMarkdown]: renderSourceClassification(bundle.sourceClassification),
    [PUBLIC_REPORTS.executionJson]: `${JSON.stringify(bundle.execution, null, 2)}\n`,
    [PUBLIC_REPORTS.executionMarkdown]: renderExecution(bundle.execution),
    [PUBLIC_REPORTS.reproducibilityJson]: `${JSON.stringify(bundle.reproducibility, null, 2)}\n`,
    [PUBLIC_REPORTS.reproducibilityMarkdown]: renderReproducibility(bundle.reproducibility),
    [PUBLIC_REPORTS.decisionJson]: `${JSON.stringify(bundle.decision, null, 2)}\n`,
    [PUBLIC_REPORTS.decisionMarkdown]: renderDecision(bundle.decision),
    [PUBLIC_REPORTS.nextStepJson]: `${JSON.stringify(bundle.nextStep, null, 2)}\n`,
    [PUBLIC_REPORTS.nextStepMarkdown]: renderNextStep(bundle.nextStep),
  };
  for (const [relative, content] of Object.entries(outputs)) {
    assertPublicV2B8Sanitized(content);
    atomicWriteText(join(root, relative), content);
  }
  return { publicReports: Object.keys(outputs), bundle };
}

function publicReportBundle(results) {
  const metrics = results.evaluation.metrics;
  const common = { status: "not_for_formal_decision", full160Authorized: false };
  const canonical = { schema: "m2.v2.claim-canonicalization-audit-public.v0.1", ...common, deterministic: true, llmJudgeUsed: false, candidateClaimCount: metrics.evidence.candidateCount, pilotUsableClaimCount: metrics.evidence.pilotUsableCount, maximumClaimsPerWork: 10, weakUnsupportedRatingReviewCount: metrics.evidence.weakUnsupportedRatingReviewCount, sameSourceClaimAgreement: metrics.reproducibility.sameSourceClaimAgreement, endToEndSemanticClaimAgreement: metrics.reproducibility.endToEndSemanticClaimAgreement, contributionDecomposition: metrics.reproducibility.contributions };
  const timeConflict = { schema: "m2.v2.event-time-conflict-audit-public.v0.1", ...common, ...metrics.timeConflict, conflictClaimsExcludedFromPilot: metrics.timeConflict.unresolvedConflictPilotCount === 0 };
  const sourceClassification = { schema: "m2.v2.source-classification-audit-public.v0.1", ...common, ...metrics.sourceClassification, categoryCount: V2B8_SOURCE_CATEGORIES.length, selectionDeterministic: true, maximumPerHost: 2, maximumPerCategory: 2 };
  const execution = { schema: "m2.v2.canary-v3-1-execution-summary-public.v0.1", ...common, startSha: V2B8_START_SHA, phaseACommit: results.state.phaseACommit ?? null, manifestDigest: V2B7_CANARY_MANIFEST_DIGEST, repeatDigest: V2B7_REPEAT_DIGEST, sourceBundleDigest: V2B7_SOURCE_BUNDLE_DIGEST, fixedPrimaryWorkCount: 10, fixedRepeatWorkCount: 5, failedSamplesReplaced: false, fallbackQueryCount: results.fallbackQueries.length, newTavilyPhysicalRequestCount: results.state.tavily.physicalRequestCount, cumulativeTavilyPhysicalRequestCount: results.usage.tavily.cumulativePhysicalRequestCount, newRelayPhysicalRequestCount: results.state.relay.physicalRequestCount, cumulativeRelayPhysicalRequestCount: results.usage.relay.cumulativePhysicalRequestCount, repairCount: results.state.relay.repairCount, model: V2B8_MODEL_ID, route: "full/server_strict", search: metrics.search, extraction: metrics.extraction, entity: metrics.entity, evidence: metrics.evidence, usage: results.usage, noBrowserComputerUseOrRelaySearch: true, modelTrainingPerformed: false };
  const reproducibility = { schema: "m2.v2.canary-v3-1-reproducibility-public.v0.1", ...common, expectedPairCount: 5, meanRepeatSourceOverlap: metrics.reproducibility.meanRepeatSourceOverlap, medianRepeatSourceOverlap: metrics.reproducibility.medianRepeatSourceOverlap, exactSourceSetCount: metrics.reproducibility.exactSourceSetCount, sameSourceClaimAgreement: metrics.reproducibility.sameSourceClaimAgreement, sameSourceEvaluableCount: metrics.reproducibility.sameSourceEvaluableCount, endToEndSemanticClaimAgreement: metrics.reproducibility.endToEndSemanticClaimAgreement, endToEndEvaluableCount: metrics.reproducibility.endToEndEvaluableCount, contributionDecomposition: metrics.reproducibility.contributions, perPair: metrics.reproducibility.perPair.map((pair) => ({ anonymousPairId: pair.anonymousPairId, sourceOverlap: pair.sourceOverlap, exactSourceSet: pair.exactSourceSet, sameSourceAgreement: pair.sameSourceAgreement, sameSourceStatus: pair.sameSourceStatus, endToEndSemanticAgreement: pair.endToEndSemanticAgreement, endToEndStatus: pair.endToEndStatus })) };
  const decision = { schema: "m2.v2.canary-v3-1-decision-public.v0.1", ...common, canaryDecision: results.evaluation.decision, safetyPassed: results.evaluation.safetyPassed, qualityPassed: results.evaluation.qualityPassed, blockerIds: results.evaluation.blockerIds, safetyGates: results.evaluation.safetyGates, qualityGates: results.evaluation.qualityGates, nextStep: results.evaluation.nextStep, privateWorkbookGenerated: results.workbookExists, privateWorkbookVerificationPassed: workbookVerificationPassed(results.workbookVerification), modelTrainingPerformed: false, sampleReplaced: false, b4Changed: false, finalHoldoutOpened: false, enteredV2COrV2D: false, enteredC4OrM3: false, released: false };
  const nextStep = { schema: "m2.v2.v2b8-next-step-public.v0.1", ...common, currentDecision: results.evaluation.decision, nextStep: results.evaluation.nextStep, scaleUpPerformed: false, prohibitedNextPhases: ["full160", "V2-C", "V2-D", "model_training", "C4", "M3", "release"] };
  return { canonical, timeConflict, sourceClassification, execution, reproducibility, decision, nextStep };
}

export function recordV2B8WorkbookVerification(root) {
  const frozen = readV2B8FrozenContract(root);
  const workbookPath = join(root, V2B8_WORKBOOK_RELATIVE);
  const actual = verifyIndependentWorkbookObject(root, V2B8_WORKBOOK_RELATIVE, {
    profile: "m2-v2-canary-v3-review-v0.4",
  });
  const hyperlinkTargetLineage = deriveIndependentWorkbookHyperlinkLineage(actual);
  const payload = {
    schema: "m2.v2.v2b8-workbook-verification-private.v0.3",
    privateOnly: true,
    verifiedAt: new Date().toISOString(),
    exists: existsSync(workbookPath),
    verificationBasis: actual.verificationBasis,
    generatorAssertionsTrusted: actual.generatorAssertionsTrusted,
    independentObjectVerified: actual.passed,
    verificationIssues: actual.issues,
    workbookSha256: actual.workbookSha256 ?? null,
    byteLength: actual.workbookByteLength ?? 0,
    sheetCount: actual.sheetCount ?? 0,
    sheetNames: actual.sheetNames ?? [],
    rowCounts: actual.rowCounts ?? {},
    formulaCount: actual.formulaCount ?? 0,
    formulaErrorCount: actual.formulaErrorCount ?? actual.cachedFormulaErrorCount ?? 0,
    cachedFormulaErrors: actual.cachedFormulaErrors ?? [],
    formulaHyperlinkCount: actual.formulaHyperlinkCount ?? 0,
    hyperlinkCount: actual.hyperlinkCount ?? actual.nativeHyperlinkCount ?? 0,
    hyperlinkTargetLineage,
    validationCount: actual.validationCount ?? actual.dataValidationCount ?? 0,
    forbiddenValueCount: actual.forbiddenValueCount ?? 0,
    internalIdCount: actual.internalIdCount ?? 0,
    incomeValueCount: actual.incomeValueCount ?? 0,
    secretCount: actual.secretCount ?? actual.secretPatternMatchCount ?? 0,
    externalLinkCount: actual.externalLinkCount ?? actual.externalWorkbookLinkCount ?? 0,
    visualReviewAttested: false,
    visualReviewStatus: "NOT_HUMAN_ATTESTED",
    ignoredAndUntracked: privatePathIgnoredAndUntracked(root, V2B8_WORKBOOK_RELATIVE),
    full160Authorized: false,
  };
  const receipt = { ...payload, receiptDigest: sha256(payload) };
  atomicWriteJson(join(frozen.privateStore, V2B8_FILES.workbookVerification), receipt);
  return receipt;
}

export function runV2B8FullValidation(root, options = {}) {
  const commands = [
    ["npm", ["run", "check:no-real-data"]],
    ["npm", ["run", "lint"]],
    ["npm", ["run", "build"]],
    ["npm", ["test"]],
    ["npm", ["run", "smoke"]],
    ["npm", ["run", "test:e2e"]],
    ["npm", ["run", "m2:v2:v2b5:verify"]],
    ["npm", ["run", "m2:v2:v2b6:verify"]],
    ["npm", ["run", "m2:v2:v2b7:verify"]],
    ["npm", ["run", "m2:v2:v2b8:verify"]],
    ["npm", ["run", "test:m2-v2:integrity-synthetic"]],
    ["npm", ["run", "test:secret-guard"]],
  ];
  const rows = [];
  for (const [program, args] of commands) {
    options.onProgress?.({ stage: "validation", command: [program, ...args].join(" ") });
    const startedAt = new Date().toISOString();
    const started = Date.now();
    const executable = process.platform === "win32" && program === "npm" ? process.execPath : program;
    const spawnArgs = process.platform === "win32" && program === "npm" ? [process.env.npm_execpath, ...args].filter(Boolean) : args;
    const result = spawnSync(executable, spawnArgs, { cwd: root, encoding: "utf8", windowsHide: true, timeout: 15 * 60_000, maxBuffer: 25 * 1024 * 1024 });
    rows.push({ command: [program, ...args].join(" "), startedAt, completedAt: new Date().toISOString(), durationMs: Date.now() - started, exitCode: result.status, passed: result.status === 0, stdoutDigest: sha256(String(result.stdout ?? "")), stderrDigest: sha256(String(result.stderr ?? "")), rawOutputPersisted: false });
    if (result.status !== 0) break;
  }
  const payload = { schema: "m2.v2.integrity-remediation-full-validation-receipt-private.v0.1", privateOnly: true, completedAt: new Date().toISOString(), expectedCommandCount: commands.length, executedCommandCount: rows.length, allPassed: rows.length === commands.length && rows.every((row) => row.passed), commands: rows, providerCommandsExecuted: 0, full160Authorized: false };
  const receipt = { ...payload, receiptDigest: sha256(payload) };
  atomicWriteJson(join(root, INTEGRITY_VALIDATION_RECEIPT_RELATIVE), receipt);
  return receipt;
}

export function recomputeV2B8HistoricalEvaluation(results, options = {}) {
  const gitBoundary = options.gitBoundary ?? auditGitBoundary(options.root ?? results.root);
  return evaluateV2B8Canary({
    manifest: results.manifest,
    v2b7: results.v2b7,
    fallbackQueries: results.fallbackQueries,
    primarySearch: results.primarySearch,
    repeatSearch: results.repeatSearch,
    physicalReceipts: results.physicalReceipts,
    effectiveReceipts: results.effectiveReceipts,
    allTestsPassed: options.allTestsPassed ?? true,
    manifestUnchanged: options.manifestUnchanged ?? (
      results.invariant?.allPassed === true
      && results.manifest?.manifestDigest === V2B7_CANARY_MANIFEST_DIGEST
      && results.bundle?.sourceBundleDigest === V2B7_SOURCE_BUNDLE_DIGEST
    ),
    gitBoundary,
    validationPending: options.validationPending ?? false,
    providerBlocked: options.providerBlocked === true,
    evaluatedAt: options.evaluatedAt ?? results.evaluation?.evaluatedAt,
  });
}

export function recomputeV2B8CurrentRestatedEvaluation(results, physicalReceiptEnvelopes, options = {}) {
  const gitBoundary = options.gitBoundary ?? auditGitBoundary(options.root ?? results.root);
  const effectiveReceipts = recanonicalizeV2B8EffectiveReceipts({
    manifest: results.manifest,
    primarySearch: results.primarySearch,
    repeatSearch: results.repeatSearch,
    physicalReceipts: physicalReceiptEnvelopes,
  });
  return evaluateV2B8Canary({
    evaluationContract: "current_v0.3",
    manifest: results.manifest,
    v2b7: results.v2b7,
    fallbackQueries: results.fallbackQueries,
    primarySearch: results.primarySearch,
    repeatSearch: results.repeatSearch,
    physicalReceipts: physicalReceiptEnvelopes.map((envelope) => envelope.receiptPayload),
    effectiveReceipts,
    allTestsPassed: options.allTestsPassed ?? true,
    manifestUnchanged: options.manifestUnchanged ?? (
      results.invariant?.allPassed === true
      && results.manifest?.manifestDigest === V2B7_CANARY_MANIFEST_DIGEST
      && results.bundle?.sourceBundleDigest === V2B7_SOURCE_BUNDLE_DIGEST
    ),
    gitBoundary,
    validationPending: options.validationPending ?? false,
    providerBlocked: options.providerBlocked === true,
    evaluatedAt: options.evaluatedAt,
  });
}

export function verifyV2B8(root, options = {}) {
  const results = options.results ?? readV2B8Results(root);
  const issues = [];
  const gitBoundary = options.gitBoundary ?? auditGitBoundary(root);
  if (!gitBoundary.auditSucceeded) issues.push("git_boundary_audit_failed");
  if (!gitBoundary.b4Unchanged) issues.push("b4_boundary_changed_or_unverified");
  if (!gitBoundary.holdoutSealed) issues.push("holdout_boundary_changed_or_unverified");
  if (results.state.tavily.physicalRequestCount > V2B8_TAVILY_REQUEST_CAP) issues.push("tavily_cap_exceeded");
  if (results.state.relay.physicalRequestCount > V2B8_RELAY_REQUEST_CAP || results.state.relay.repairCount > V2B8_MAX_REPAIRS) issues.push("relay_cap_exceeded");
  for (const provider of ["tavily", "relay"]) if (Object.keys(results.state[provider].reservations ?? {}).length !== results.state[provider].physicalRequestCount) issues.push(`${provider}_reservation_count_mismatch`);
  if (results.fallbackQueries.length !== 5) issues.push("fallback_query_count_invalid");
  if (results.repeatSearch.length !== 5 || results.primarySearch.length !== 10 || results.effectiveReceipts.length !== 20) issues.push("fixed_denominator_invalid");
  if (results.state.full160Authorized !== false || results.evaluation.full160Authorized !== false) issues.push("full160_invariant_failed");
  if (results.physicalReceipts.some((receipt) => receipt.requestedModelId !== V2B8_MODEL_ID || receipt.searchToolUsed !== false || receipt.rawResponsePersisted !== false || receipt.apiKeyPersisted !== false)) issues.push("relay_route_or_persistence_invalid");
  if ([...results.primarySearch, ...results.repeatSearch].flatMap((run) => run.sourceRecords).some((record) => !validateV2B5SourceRecord(record).valid)) issues.push("source_record_contract_invalid");
  if (results.evidenceRecords.some((record) => record.researchApproved !== false || record.modelEligible !== false || record.researchOnly !== true)) issues.push("evidence_governance_promotion_detected");
  if (results.evidenceRecords.some((record) => record.pilotUsable === true && (record.contradictionStatus === "unresolved" || record.claimType === "review_signal"))) issues.push("unstable_evidence_pilot_usable");
  if (!privatePathIgnoredAndUntracked(root, V2B8_PRIVATE_RELATIVE)) issues.push("private_store_not_ignored_or_untracked");
  if (results.evidenceRecords.filter((record) => record.pilotUsable).length > 0 && !workbookVerificationPassed(results.workbookVerification)) issues.push("workbook_verification_failed");
  for (const relative of Object.values(PUBLIC_REPORTS)) {
    if (!existsSync(join(root, relative))) issues.push(`public_report_missing:${relative}`);
    else { try { assertPublicV2B8Sanitized(readFileSync(join(root, relative), "utf8")); } catch (error) { issues.push(safeToken(error?.message)); } }
  }

  const closedBinding = validateClosedAtomicRequestBinding(root, {
    bindingRelativePath: options.bindingRelativePath ?? V2B8_CLOSED_BINDING_RELATIVE,
    scope: "v2b8",
    eventStage: "v2b8",
  });
  if (!closedBinding.valid) issues.push(...closedBinding.issues.map((issue) => `current_binding:${issue}`));
  const current = closedBinding.valid
    ? verifyV2B8BoundCurrentState(root, results, closedBinding, {
      bindingRelativePath: options.bindingRelativePath ?? V2B8_CLOSED_BINDING_RELATIVE,
      gitBoundary,
    })
    : failedV2B8CurrentVerification(closedBinding);
  issues.push(...current.issues);

  const historicalDecision = closedBinding.historicalDecision ?? results.evaluation?.decision ?? null;
  const currentRestatedDecision = closedBinding.currentRestatedDecision ?? null;
  const payload = {
    schema: "m2.v2.v2b8-verification-verdict.v0.3",
    allPassed: issues.length === 0,
    issues: unique(issues),
    newTavilyPhysicalRequestCount: results.state.tavily.physicalRequestCount,
    cumulativeTavilyPhysicalRequestCount: results.usage.tavily.cumulativePhysicalRequestCount,
    newRelayPhysicalRequestCount: results.state.relay.physicalRequestCount,
    cumulativeRelayPhysicalRequestCount: results.usage.relay.cumulativePhysicalRequestCount,
    decision: currentRestatedDecision,
    historicalDecision,
    historicalEvaluationVerified: current.historicalEvaluationVerified,
    currentRestatedDecision,
    currentRestatementVerified: current.currentRestatementVerified,
    effectiveReceiptsVerified: current.effectiveReceiptsVerified,
    currentAuthorityDigestVerified: current.currentAuthorityDigestVerified,
    transactionBindingVerified: closedBinding.valid,
    providerRequestDelta: 0,
    full160Authorized: false,
  };
  const receipt = { ...payload, receiptDigest: sha256(payload) };
  return receipt;
}

function verifyV2B8BoundCurrentState(root, results, closedBinding, options) {
  const issues = [];
  let members;
  try {
    members = readV2B8ClosedMembers(root, options.bindingRelativePath);
  } catch (error) {
    return failedV2B8CurrentVerification(closedBinding, [safeToken(error?.message)]);
  }

  const derived = parseRequiredJsonMember(members, "derived_evaluation", issues);
  const effectiveIndex = parseRequiredJsonMember(members, "effective_receipt_index", issues);
  const frozenUpstream = parseRequiredJsonMember(members, "frozen_upstream_digests", issues);
  const immutableManifests = parseRequiredJsonMember(members, "immutable_manifests", issues);
  const publicReportDigests = parseRequiredJsonMember(members, "contract_bound_public_report_digests", issues);
  const executionContract = parseRequiredJsonMember(members, "execution_contract", issues);
  const currentRestatement = parseRequiredJsonMember(members, "current_restatement", issues);

  validateDerivedEvaluationDocument(derived, issues);
  validateEffectiveReceiptIndexDocument(effectiveIndex, issues);
  validateArtifactIndexShape(frozenUpstream, "frozen_upstream_digests", issues);
  validateArtifactIndexShape(immutableManifests, "immutable_manifests", issues);
  validateArtifactIndexShape(publicReportDigests, "contract_bound_public_report_digests", issues);
  if (executionContract && canonicalJson(executionContract) !== canonicalJson(results.contract)) {
    issues.push("current_execution_contract_mismatch");
  }

  validateRequiredArtifactPaths(frozenUpstream, V2B8_FROZEN_UPSTREAM_PATHS, "frozen_upstream", issues);
  validateRequiredArtifactPaths(immutableManifests, [V2B7_MANIFEST_RELATIVE], "immutable_manifest", issues);
  validateRequiredArtifactPaths(publicReportDigests, Object.values(PUBLIC_REPORTS), "public_report_digest", issues);
  validateFrozenV2B7CanonicalDigests(results, issues);

  const envelopeResult = readAndValidateV2B8EffectiveEnvelopes(root, results, effectiveIndex, members, issues);
  validateV2B8DerivedInputDigests(root, derived, members, issues);

  let historicalEvaluationVerified = false;
  let currentEvaluationVerified = false;
  if (derived) {
    const historicalRecomputed = recomputeV2B8HistoricalEvaluation(results, {
      root,
      gitBoundary: options.gitBoundary,
      evaluatedAt: derived.historicalEvaluation?.evaluatedAt,
    });
    historicalEvaluationVerified = canonicalJson(historicalRecomputed) === canonicalJson(derived.historicalEvaluation)
      && canonicalJson(results.evaluation) === canonicalJson(derived.historicalEvaluation)
      && derived.historicalEvaluation?.decision === "CANARY_CONDITIONAL"
      && closedBinding.historicalDecision === "CANARY_CONDITIONAL";
    if (!historicalEvaluationVerified) issues.push("historical_evaluation_recompute_mismatch");

    if (envelopeResult.valid) {
      const currentRecomputed = recomputeV2B8CurrentRestatedEvaluation(results, envelopeResult.envelopes, {
        root,
        gitBoundary: options.gitBoundary,
        evaluatedAt: derived.currentRestatedEvaluation?.evaluatedAt,
      });
      currentEvaluationVerified = canonicalJson(currentRecomputed) === canonicalJson(derived.currentRestatedEvaluation)
        && derived.currentRestatedEvaluation?.decision === closedBinding.currentRestatedDecision;
      if (!currentEvaluationVerified) issues.push("current_restatement_evaluation_recompute_mismatch");
      const evaluationDigest = selectV2B8CurrentRestatementEvaluationDigest(currentRestatement);
      if (evaluationDigest !== sha256(currentRecomputed)) issues.push("current_restatement_evaluation_digest_mismatch");
    }
  }

  const currentAuthorityDigestVerified = closedBinding.currentAuthorityDigestVerified === true;
  const effectiveReceiptsVerified = closedBinding.effectiveReceiptsVerified === true && envelopeResult.valid;
  const currentRestatementVerified = closedBinding.currentRestatementVerified === true && currentEvaluationVerified;
  return {
    issues: unique(issues),
    historicalEvaluationVerified,
    currentRestatementVerified,
    effectiveReceiptsVerified,
    currentAuthorityDigestVerified,
  };
}

export function selectV2B8CurrentRestatementEvaluationDigest(document) {
  if (!isPlainObject(document)) return null;
  if (document.schema === "m2.v2.canary-v3.1-integrity-restatement-public.v0.4") {
    return document.currentDecisionComputation?.evaluationDigestSha256 ?? null;
  }
  if (document.schema === "m2.v2.canary-v3.1-integrity-restatement-public.v0.3") {
    return document.restatedContract?.evaluationDigest ?? null;
  }
  return null;
}

function failedV2B8CurrentVerification(binding, extraIssues = []) {
  return {
    issues: unique(extraIssues),
    historicalEvaluationVerified: false,
    currentRestatementVerified: false,
    effectiveReceiptsVerified: false,
    currentAuthorityDigestVerified: binding?.currentAuthorityDigestVerified === true,
  };
}

function readV2B8ClosedMembers(root, bindingRelativePath) {
  const bindingRead = readGovernedFile(root, bindingRelativePath);
  const binding = JSON.parse(bindingRead.bytes.toString("utf8"));
  if (!Array.isArray(binding?.members)) throw new Error("v2b8_closed_binding_members_invalid");
  const members = new Map();
  for (const descriptor of binding.members) {
    const role = String(descriptor?.role ?? "");
    if (!/^[a-z][a-z0-9_]{1,80}$/u.test(role) || members.has(role)) {
      throw new Error("v2b8_closed_binding_role_invalid");
    }
    const read = readGovernedFile(root, descriptor.path);
    if (read.byteDigest !== descriptor.byteDigest) throw new Error(`v2b8_closed_member_digest_mismatch:${role}`);
    members.set(role, { role, path: read.relativePath, bytes: read.bytes, byteDigest: read.byteDigest });
  }
  return members;
}

function parseRequiredJsonMember(members, role, issues) {
  const member = members.get(role);
  if (!member) {
    issues.push(`current_member_missing:${role}`);
    return null;
  }
  try {
    return JSON.parse(member.bytes.toString("utf8"));
  } catch {
    issues.push(`current_member_json_invalid:${role}`);
    return null;
  }
}

function validateDerivedEvaluationDocument(document, issues) {
  const expectedKeys = [
    "currentRestatedEvaluation",
    "full160Authorized",
    "historicalEvaluation",
    "inputDigests",
    "privateOnly",
    "providerRequestDelta",
    "schema",
  ];
  if (!isPlainObject(document) || !hasExactKeys(document, expectedKeys)) {
    issues.push("derived_evaluation_shape_invalid");
    return;
  }
  if (document.schema !== V2B8_DERIVED_EVALUATION_SCHEMA || document.privateOnly !== true
    || document.providerRequestDelta !== 0 || document.full160Authorized !== false) {
    issues.push("derived_evaluation_contract_invalid");
  }
  if (!isPlainObject(document.historicalEvaluation) || !isPlainObject(document.currentRestatedEvaluation)) {
    issues.push("derived_evaluation_payload_invalid");
  }
  if (!isPlainObject(document.inputDigests)
    || !hasExactKeys(document.inputDigests, ["effectiveReceiptIndex", "manifest", "requestEventLedger", "sourceBundle"])
    || Object.values(document.inputDigests).some((value) => !/^[a-f0-9]{64}$/u.test(String(value ?? "")))) {
    issues.push("derived_evaluation_input_digests_invalid");
  }
}

function validateEffectiveReceiptIndexDocument(document, issues) {
  if (!isPlainObject(document)
    || !hasExactKeys(document, ["entries", "full160Authorized", "privateOnly", "schema"])
    || document.schema !== V2B8_EFFECTIVE_RECEIPT_INDEX_SCHEMA
    || document.privateOnly !== true
    || document.full160Authorized !== false
    || !Array.isArray(document.entries)) {
    issues.push("effective_receipt_index_contract_invalid");
  }
}

function validateArtifactIndexShape(document, role, issues) {
  const baseKeys = ["entries", "full160Authorized", "privateOnly", "schema"];
  const isAuthorityGraphVersion = role === "contract_bound_public_report_digests"
    && document?.schema === "m2.v2.v2b8-contract-bound-public-report-digests-private.v0.3";
  const expectedKeys = isAuthorityGraphVersion
    ? [...baseKeys, "canonicalAuthorityGraph"]
    : baseKeys;
  if (!isPlainObject(document)
    || !hasExactKeys(document, expectedKeys)
    || typeof document.schema !== "string"
    || document.privateOnly !== true
    || document.full160Authorized !== false
    || !Array.isArray(document.entries)
    || (isAuthorityGraphVersion && !isPlainObject(document.canonicalAuthorityGraph))) {
    issues.push(`${role}_shape_invalid`);
    return;
  }
  for (const [index, entry] of document.entries.entries()) {
    if (!isPlainObject(entry)
      || !hasExactKeys(entry, ["byteDigest", "path"])
      || !isSafeRelativePath(entry.path)
      || !/^[a-f0-9]{64}$/u.test(String(entry.byteDigest ?? ""))) {
      issues.push(`${role}_entry_${index + 1}_invalid`);
    }
  }
}

function validateRequiredArtifactPaths(document, requiredPaths, label, issues) {
  const paths = new Set((document?.entries ?? []).map((entry) => normalizeRelative(entry?.path)));
  for (const required of requiredPaths) {
    if (!paths.has(normalizeRelative(required))) issues.push(`${label}_missing:${normalizeRelative(required)}`);
  }
}

function validateFrozenV2B7CanonicalDigests(results, issues) {
  const checks = [
    ["v2b7_state", results.contract?.v2b7StateDigest, sha256(results.v2b7State)],
    ["v2b7_primary_search", results.contract?.v2b7PrimarySearchDigest, sha256(results.v2b7?.primarySearch)],
    ["v2b7_repeat_search", results.contract?.v2b7RepeatSearchDigest, sha256(results.v2b7?.repeatSearch)],
    ["v2b7_evidence", results.contract?.v2b7EvidenceDigest, sha256(results.v2b7?.evidenceRecords)],
  ];
  for (const [label, expected, actual] of checks) {
    if (expected !== actual) issues.push(`frozen_${label}_canonical_digest_mismatch`);
  }
  if (results.contract?.manifestDigest !== V2B7_CANARY_MANIFEST_DIGEST
    || results.contract?.repeatDigest !== V2B7_REPEAT_DIGEST
    || results.contract?.sourceBundleDigest !== V2B7_SOURCE_BUNDLE_DIGEST) {
    issues.push("frozen_v2b7_contract_digest_mismatch");
  }
}

function readAndValidateV2B8EffectiveEnvelopes(root, results, document, members, issues) {
  if (!Array.isArray(document?.entries)) return { valid: false, envelopes: [] };
  const receiptIndex = parseJsonOrNdjsonMember(members, "receipt_index", issues);
  const receiptEntries = Array.isArray(receiptIndex) ? receiptIndex : receiptIndex?.entries;
  if (!Array.isArray(receiptEntries)) {
    issues.push("effective_receipt_receipt_index_invalid");
    return { valid: false, envelopes: [] };
  }
  const receiptReferences = new Set(receiptEntries.map((entry) => (
    `${normalizeRelative(entry?.path)}#${Number(entry?.lineNumber)}#${entry?.receiptDigest}`
  )));
  const expectedRuns = expectedV2B8LogicalRuns(results);
  if (document.entries.length !== expectedRuns.length) issues.push("effective_receipt_index_denominator_invalid");
  const envelopes = [];
  const seenLogical = new Set();
  const seenReferences = new Set();
  for (const [index, entry] of document.entries.entries()) {
    const label = `effective_receipt_entry_${index + 1}`;
    if (!isPlainObject(entry)
      || !hasExactKeys(entry, ["canarySlotId", "lineNumber", "logicalKey", "path", "receiptDigest", "runKind"])
      || !isSafeRelativePath(entry.path)
      || !Number.isInteger(entry.lineNumber)
      || entry.lineNumber < 1
      || !/^[a-f0-9]{64}$/u.test(String(entry.receiptDigest ?? ""))) {
      issues.push(`${label}_invalid`);
      continue;
    }
    const expected = expectedRuns[index];
    if (!expected || entry.runKind !== expected.runKind || entry.canarySlotId !== expected.canarySlotId) {
      issues.push(`${label}_logical_order_or_identity_mismatch`);
    }
    const expectedLogicalKey = sha256({ runKind: entry.runKind, canarySlotId: entry.canarySlotId });
    if (entry.logicalKey !== expectedLogicalKey || seenLogical.has(entry.logicalKey)) {
      issues.push(`${label}_logical_key_invalid_or_duplicate`);
    }
    seenLogical.add(entry.logicalKey);
    const reference = `${normalizeRelative(entry.path)}#${entry.lineNumber}#${entry.receiptDigest}`;
    if (!receiptReferences.has(reference)) issues.push(`${label}_not_bound_by_receipt_index`);
    if (seenReferences.has(reference)) issues.push(`${label}_receipt_reference_duplicate`);
    seenReferences.add(reference);
    let envelope;
    try { envelope = readJsonLineReference(root, entry.path, entry.lineNumber); } catch (error) {
      issues.push(`${label}_${safeToken(error?.message)}`);
      continue;
    }
    const validation = validateReceiptEnvelope(envelope);
    if (!validation.valid) {
      issues.push(...validation.issues.map((issue) => `${label}_${issue}`));
      continue;
    }
    if (envelope.receiptDigest !== entry.receiptDigest) issues.push(`${label}_digest_mismatch`);
    const payload = envelope.receiptPayload;
    if (payload?.logicalExtractionKey !== entry.logicalKey
      || payload?.runKind !== entry.runKind
      || payload?.canarySlotId !== entry.canarySlotId) {
      issues.push(`${label}_envelope_logical_binding_mismatch`);
    }
    if (expected?.sourceRecordSetDigest !== payload?.sourceRecordSetDigest) {
      issues.push(`${label}_source_record_set_binding_mismatch`);
    }
    if (payload?.requestedModelId !== V2B8_MODEL_ID) issues.push(`${label}_model_binding_invalid`);
    envelopes.push(envelope);
  }
  return { valid: issues.length === 0 && envelopes.length === expectedRuns.length, envelopes };
}

function parseJsonOrNdjsonMember(members, role, issues) {
  const member = members.get(role);
  if (!member) {
    issues.push(`current_member_missing:${role}`);
    return null;
  }
  const text = member.bytes.toString("utf8");
  try { return JSON.parse(text); } catch {
    try { return text.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line)); } catch {
      issues.push(`current_member_json_or_ndjson_invalid:${role}`);
      return null;
    }
  }
}

function expectedV2B8LogicalRuns(results) {
  return [
    ...(results.primarySearch ?? []).map((run) => ({
      runKind: "primary",
      canarySlotId: run.canarySlotId,
      sourceRecordSetDigest: run.sourceRecordSetDigest,
    })),
    ...(results.repeatSearch ?? []).map((run) => ({
      runKind: "fresh_repeat",
      canarySlotId: run.canarySlotId,
      sourceRecordSetDigest: run.sourceRecordSetDigest,
    })),
    ...(results.manifest?.repeatSample ?? []).map((repeat) => {
      const primary = (results.primarySearch ?? []).find((run) => run.canarySlotId === repeat.canarySlotId);
      return {
        runKind: "same_source",
        canarySlotId: repeat.canarySlotId,
        sourceRecordSetDigest: primary?.sourceRecordSetDigest,
      };
    }),
  ];
}

function validateV2B8DerivedInputDigests(root, document, members, issues) {
  if (!isPlainObject(document?.inputDigests)) return;
  const expected = {
    manifest: readGovernedFile(root, V2B7_MANIFEST_RELATIVE).byteDigest,
    sourceBundle: readGovernedFile(root, V2B7_BUNDLE_RELATIVE).byteDigest,
    effectiveReceiptIndex: members.get("effective_receipt_index")?.byteDigest,
    requestEventLedger: members.get("request_event_ledger")?.byteDigest,
  };
  for (const [role, digest] of Object.entries(expected)) {
    if (document.inputDigests[role] !== digest) issues.push(`derived_input_digest_mismatch:${role}`);
  }
}

function readJsonLineReference(root, relativePath, lineNumber) {
  const read = readGovernedFile(root, relativePath);
  const lines = read.bytes.toString("utf8").split(/\r?\n/u).filter(Boolean);
  if (lineNumber > lines.length) throw new Error("receipt_line_missing");
  return JSON.parse(lines[lineNumber - 1]);
}

function readGovernedFile(root, relativePath) {
  if (!isSafeRelativePath(relativePath)) throw new Error("governed_path_invalid");
  const absoluteRoot = resolve(root);
  const normalized = normalizeRelative(relativePath);
  const absolutePath = resolve(absoluteRoot, normalized);
  if (absolutePath !== absoluteRoot && !absolutePath.startsWith(`${absoluteRoot}${sep}`)) {
    throw new Error("governed_path_escape");
  }
  let cursor = absolutePath;
  while (cursor !== absoluteRoot) {
    if (!existsSync(cursor)) throw new Error("governed_file_missing");
    if (lstatSync(cursor).isSymbolicLink()) throw new Error("governed_reparse_forbidden");
    cursor = dirname(cursor);
  }
  if (!lstatSync(absolutePath).isFile()) throw new Error("governed_regular_file_required");
  const bytes = readFileSync(absolutePath);
  return {
    relativePath: normalized,
    bytes,
    byteDigest: createHash("sha256").update(bytes).digest("hex"),
  };
}

function isSafeRelativePath(value) {
  const path = normalizeRelative(value);
  return Boolean(path)
    && !isAbsolute(path)
    && !/^[A-Za-z]:/u.test(path)
    && !path.startsWith("//")
    && !path.split("/").some((part) => !part || part === "." || part === "..");
}

function normalizeRelative(value) {
  return String(value ?? "").replace(/\\/gu, "/");
}

function hasExactKeys(value, keys) {
  return canonicalJson(Object.keys(value).sort()) === canonicalJson([...keys].sort());
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function renderCanonicalAudit(report) {
  return `# M2 v2 Claim Canonicalization 审计 v0.1\n\n- 确定性本地规则：${report.deterministic}；LLM judge：${report.llmJudgeUsed}\n- candidate / pilotUsable：${report.candidateClaimCount} / ${report.pilotUsableClaimCount}\n- 每部 claim 上限：${report.maximumClaimsPerWork}\n- same-source / fresh-source semantic agreement：${percent(report.sameSourceClaimAgreement)} / ${percent(report.endToEndSemanticClaimAgreement)}\n- 弱或缺少平台/scale 的 rating/review pilotUsable：${report.weakUnsupportedRatingReviewCount}\n- full160Authorized：false\n`;
}

function renderTimeConflictAudit(report) {
  return `# M2 v2 Event Time / Conflict 审计 v0.1\n\n- 明确时间 claim：${report.explicitTemporalClaimCount}\n- 明确时间提取率：${percent(report.explicitTemporalExtractionRate)}\n- eventTime precision：${JSON.stringify(report.eventTimePrecisionCounts)}\n- eventTime basis：${JSON.stringify(report.eventTimeBasisCounts)}\n- eventTime provenance complete / missing：${report.eventTimeProvenanceCompleteCount} / ${report.eventTimeProvenanceMissingCount}\n- conflict family coverage：${JSON.stringify(report.conflictFamilyCoverage)}\n- unresolved conflict：${report.unresolvedConflictCount}；仍 pilotUsable：${report.unresolvedConflictPilotCount}\n- 合法多 edition/format：${report.validMultiEditionCount}\n- full160Authorized：false\n`;
}

function renderSourceClassification(report) {
  return `# M2 v2 Source Classification 审计 v0.1\n\n- 类别数：${report.categoryCount}\n- Source Record 分类：${JSON.stringify(report.sourceCategories)}\n- claim support 分类：${JSON.stringify(report.claimSupportCategories)}\n- unknown public web claim share：${percent(report.unknownPublicWebClaimShare)}\n- prohibited accepted：${report.prohibitedAcceptedCount}\n- selection deterministic：${report.selectionDeterministic}；单 host / category 上限：${report.maximumPerHost} / ${report.maximumPerCategory}\n- category diversity target / minimum achieved：${report.categoryDiversityTarget} / ${report.minimumCategoryDiversityAchieved ?? "N/A"}\n- identity reservation works：${report.identityReservationAppliedWorkCount}；limitations：${JSON.stringify(report.selectionLimitations)}\n- full160Authorized：false\n`;
}

function renderExecution(report) {
  return `# M2 v2 固定 Canary v3.1 执行摘要 v0.1\n\n- 起始 SHA：\`${report.startSha}\`；Phase A：\`${report.phaseACommit}\`\n- 固定 primary/repeat：${report.fixedPrimaryWorkCount}/${report.fixedRepeatWorkCount}；替换样本：${report.failedSamplesReplaced}\n- fallback query：${report.fallbackQueryCount}\n- Tavily 新/累计物理请求：${report.newTavilyPhysicalRequestCount}/${report.cumulativeTavilyPhysicalRequestCount}\n- relay 新/累计物理请求：${report.newRelayPhysicalRequestCount}/${report.cumulativeRelayPhysicalRequestCount}；repair：${report.repairCount}\n- query success：${report.search.querySuccessCount}/${report.search.queryDenominator}（${percent(report.search.querySuccessRate)}）\n- Source Record work coverage：${percent(report.search.sourceRecordWorkCoverage)}\n- primary/repeat/same-source schema：${report.extraction.primarySchemaPassCount}/10、${report.extraction.repeatSchemaPassCount}/5、${report.extraction.sameSourceSchemaPassCount}/5\n- resolved：${report.entity.resolvedCount}/10；pilot work：${report.evidence.pilotUsableWorkCount}/10；high-value：${report.evidence.highValuePilotUsableWorkCount}/${report.evidence.highValueWorkCount}\n- Terra full/server_strict；browser、computer-use、relay search 均未使用；未训练模型。\n- full160Authorized：false\n`;
}

function renderReproducibility(report) {
  return `# M2 v2 固定 Canary v3.1 可复现性 v0.1\n\n- repeat pairs：${report.expectedPairCount}\n- mean / median source overlap：${percent(report.meanRepeatSourceOverlap)} / ${percent(report.medianRepeatSourceOverlap)}\n- exact source set：${report.exactSourceSetCount}/5\n- same-source agreement：${percent(report.sameSourceClaimAgreement)}；evaluable：${report.sameSourceEvaluableCount}/5\n- fresh-source semantic agreement：${percent(report.endToEndSemanticClaimAgreement)}；evaluable：${report.endToEndEvaluableCount}/5\n- contribution decomposition：${JSON.stringify(report.contributionDecomposition)}\n- 无 claim 的 pair 标记为 not_evaluable，不以 0 冒充。\n- full160Authorized：false\n`;
}

function renderDecision(report) {
  const gates = [...(report.safetyGates ?? []), ...(report.qualityGates ?? [])]
    .map((gate) => `  - ${gate.id}: ${gate.status === "NOT_EVALUABLE" ? "N/A (gate failed: not evaluable)" : `${String(gate.value)} (${gate.status})`}`)
    .join("\n");
  return `# M2 v2 固定 Canary v3.1 决策 v0.1\n\n## 决策\n\n**${report.canaryDecision}**\n\n- safety / quality：${report.safetyPassed} / ${report.qualityPassed}\n- blockers：${report.blockerIds.length ? report.blockerIds.join(", ") : "none"}\n- gate status：\n${gates}\n- nextStep：\`${report.nextStep}\`\n- private workbook：${report.privateWorkbookGenerated ? "已生成" : "未生成"}；验证：${report.privateWorkbookVerificationPassed}\n- 未训练模型；未替换样本；B4 unchanged；holdout sealed；未进入 V2-C/V2-D/C4/M3；未 release。\n- full160Authorized：false\n`;
}

function renderNextStep(report) {
  return `# M2 v2 V2-B.8 下一步 v0.1\n\n- 当前决策：\`${report.currentDecision}\`\n- nextStep：\`${report.nextStep}\`\n- 本轮未 scale up。\n- full160、V2-C、V2-D、模型训练、C4、M3 与 release 均未授权。\n`;
}

function blockedEffectiveReceipt(work, searchRun) {
  const payload = { schema: "m2.v2.v2b8-extraction-effective-receipt.v0.1", privateOnly: true, phase: "canary_v3_1_effective", executionNamespace: V2B8_NAMESPACE, runKind: searchRun.runKind, canarySlotId: work.canarySlotId, requestedModelId: V2B8_MODEL_ID, returnedModelId: null, modelBindingStatus: "unreported", modelBindingVerified: false, providerContractCompatible: false, adapterVersion: V2B6_ADAPTER_VERSION, extractionMode: "full", structuredMode: "server_strict", timeoutMs: V2B8_TIMEOUT_MS, sourceRecordSetDigest: searchRun.sourceRecordSetDigest, schemaVersion: "m2.v2.evidence-extraction-output.v0.2", physicalRequestCount: 0, physicalReceiptDigests: [], selectedAttemptKind: null, dispatched: false, timedOut: false, latencyMs: null, usage: { inputTokens: null, outputTokens: null, totalTokens: null }, normalizedResponse: null, status: "source_records_missing", searchToolUsed: false, tavilyRequestUsed: false, canaryExecuted: true, full160Authorized: false };
  return { ...payload, receiptDigest: sha256(payload) };
}

function collectFailedV2B7Queries(frozen) {
  return [...frozen.v2b7.primarySearch.runs, ...frozen.v2b7.repeatSearch.runs].flatMap((run) => (run.queries ?? []).filter((query) => query.contractValid !== true).map((query) => ({ query, runKind: run.runKind, workOrdinal: run.workOrdinal, work: frozen.manifest.sample.find((work) => work.canarySlotId === run.canarySlotId) })));
}

function projectExtractionSources(sourceRecords) {
  let remaining = 3_000;
  return (Array.isArray(sourceRecords) ? sourceRecords.slice(0, 6) : []).map((record) => {
    const snippet = [...stripUrlLiterals(cleanText(record.snippet, remaining))].slice(0, remaining).join("");
    remaining -= [...snippet].length;
    return { sourceId: record.sourceId, title: stripUrlLiterals(cleanText(record.title, 500)), domain: cleanText(record.domain, 255), snippet, capturedAt: record.capturedAt, availableAt: record.availableAt };
  });
}

function loadConfiguration(root, suppliedEnv = null) {
  const env = suppliedEnv ?? { ...readEnvFile(join(root, ".env.local")), ...process.env };
  const config = { tavily: { baseUrl: String(env.M2_V2_TAVILY_BASE_URL ?? "https://api.tavily.com").trim().replace(/\/+$/u, ""), apiKey: String(env.TAVILY_API_KEY ?? "") }, relay: { baseUrl: String(env.OPENAI_BASE_URL ?? env.M2_V2_EVIDENCE_API_BASE_URL ?? "").trim().replace(/\/+$/u, ""), approvedHost: String(env.M2_V2_APPROVED_RELAY_HOST ?? "").trim().toLocaleLowerCase("en-US"), apiKey: String(env.OPENAI_API_KEY ?? "") } };
  if (env.M2_V2_SEARCH_PROVIDER !== "tavily_structured_search") throw new Error("v2b8_search_provider_invalid");
  if (config.tavily.baseUrl !== "https://api.tavily.com" || !config.tavily.apiKey) throw new Error("v2b8_tavily_configuration_incomplete");
  if (!config.relay.baseUrl || !config.relay.approvedHost || !config.relay.apiKey) throw new Error("v2b8_relay_configuration_incomplete");
  const transport = bindProviderTransport(config.relay);
  config.relay.baseUrl = transport.baseUrl;
  config.relay.approvedHost = transport.approvedHost;
  return config;
}

function auditGitBoundary(root) {
  const result = spawnSync("git", ["diff", "--name-only", V2B8_START_SHA, "--"], { cwd: root, encoding: "utf8", windowsHide: true });
  return evaluateGitBoundaryCommandResult(result);
}

function persistenceContext(results, root) {
  return { root, frozen: results, privateStore: results.privateStore, state: results.state, tavilyCache: readJson(join(results.privateStore, V2B8_FILES.tavilyCache)), relayCache: readJson(join(results.privateStore, V2B8_FILES.relayCache)), now: () => new Date().toISOString() };
}

function newCache(kind, contractDigest) {
  return { schema: `m2.v2.v2b8-${kind}-cache-private.v0.1`, privateOnly: true, contractDigest, entries: {} };
}

function assertRuntimeContainers(state, tavilyCache, relayCache, contract) {
  if (state.contractDigest !== contract.contractDigest || tavilyCache.contractDigest !== contract.contractDigest || relayCache.contractDigest !== contract.contractDigest) throw new Error("v2b8_runtime_contract_mismatch");
  if (state.tavily.cap !== V2B8_TAVILY_REQUEST_CAP || state.relay.cap !== V2B8_RELAY_REQUEST_CAP || state.full160Authorized !== false) throw new Error("v2b8_runtime_invariant_changed");
}

function reserveRequest(context, provider, physicalKey, metadata) {
  const budget = context.state[provider];
  if (budget.physicalRequestCount >= budget.cap) throw new Error(`v2b8_${provider}_request_cap_reached`);
  if (budget.reservations[physicalKey]) throw new Error(`v2b8_${provider}_reservation_exists`);
  const reservedAt = context.now();
  const logicalKey = metadata.logicalKey ?? physicalKey;
  const requestDigest = metadata.requestDigest ?? sha256({ stage: V2B8_REQUEST_LEDGER_STAGE, provider, physicalKey });
  appendRuntimeRequestEvent(context.state, {
    timestamp: reservedAt, provider, stage: V2B8_REQUEST_LEDGER_STAGE, logicalKey, physicalKey,
    eventType: "planned", requestDigest, receiptDigest: null,
  });
  budget.physicalRequestCount += 1;
  budget.reservations[physicalKey] = {
    status: "reserved_before_dispatch",
    reservedAt,
    ordinal: budget.physicalRequestCount,
    logicalKey,
    requestDigest,
    ...metadata,
  };
  appendRuntimeRequestEvent(context.state, {
    timestamp: reservedAt, provider, stage: V2B8_REQUEST_LEDGER_STAGE, logicalKey, physicalKey,
    eventType: "reserved", requestDigest, receiptDigest: null,
  });
  checkpoint(context);
}

function markRequestDispatched(context, provider, physicalKey) {
  const reservation = context.state[provider].reservations[physicalKey];
  if (!reservation || reservation.status !== "reserved_before_dispatch") {
    throw new Error(`v2b8_${provider}_reservation_not_dispatchable`);
  }
  const timestamp = context.now();
  reservation.status = "dispatch_started";
  reservation.dispatchStartedAt = timestamp;
  appendReservationEvent(context.state, provider, physicalKey, reservation, "dispatched", timestamp, null);
  checkpoint(context);
}

function completeRequest(context, provider, physicalKey, result) {
  const reservation = context.state[provider].reservations[physicalKey];
  if (!reservation) throw new Error(`v2b8_${provider}_reservation_missing`);
  const timestamp = context.now();
  appendReservationEvent(context.state, provider, physicalKey, reservation, "completed", timestamp, resultDigest(result));
  reservation.status = "completed";
  reservation.completedAt = timestamp;
  reservation.resultDigest = sha256(result);
  checkpoint(context);
}

function reconcileReservations(state, tavilyCache, relayCache, timestamp) {
  for (const [provider, cache] of [["tavily", tavilyCache], ["relay", relayCache]]) {
    for (const [physicalKey, reservation] of Object.entries(state[provider].reservations ?? {})) {
      if (!["reserved_before_dispatch", "dispatch_started"].includes(reservation.status)) continue;
      const result = cache.entries[reservation.cacheKey];
      if (result && reservation.status === "dispatch_started") {
        appendReservationEvent(state, provider, physicalKey, reservation, "completed", timestamp, resultDigest(result));
        reservation.status = "completed_recovered";
      } else {
        appendReservationEvent(state, provider, physicalKey, reservation, "indeterminate", timestamp, null);
        reservation.status = "indeterminate_after_crash";
      }
      reservation.completedAt = timestamp;
      if (result) reservation.resultDigest = sha256(result);
    }
  }
}

function recordCacheHit(context, provider, physicalKey, request, result) {
  const timestamp = context.now();
  const logicalKey = `cache-hit:${sha256({ physicalKey, sequence: context.state.requestEventLedger.length + 1 })}`;
  const requestDigest = sha256({ stage: V2B8_REQUEST_LEDGER_STAGE, provider, request });
  appendRuntimeRequestEvent(context.state, {
    timestamp, provider, stage: V2B8_REQUEST_LEDGER_STAGE, logicalKey, physicalKey,
    eventType: "planned", requestDigest, receiptDigest: null,
  });
  appendRuntimeRequestEvent(context.state, {
    timestamp, provider, stage: V2B8_REQUEST_LEDGER_STAGE, logicalKey, physicalKey,
    eventType: "cache_hit_observed", requestDigest, receiptDigest: resultDigest(result),
  });
  checkpoint(context);
}

function appendReservationEvent(state, provider, physicalKey, reservation, eventType, timestamp, receiptDigest) {
  appendRuntimeRequestEvent(state, {
    timestamp,
    provider,
    stage: V2B8_REQUEST_LEDGER_STAGE,
    logicalKey: reservation.logicalKey ?? reservation.cacheKey ?? physicalKey,
    physicalKey,
    eventType,
    requestDigest: reservation.requestDigest ?? sha256({ stage: V2B8_REQUEST_LEDGER_STAGE, provider, physicalKey }),
    receiptDigest,
  });
}

function resultDigest(result) {
  for (const digest of [result?.receiptDigest, result?.providerReceipt?.receiptDigest, result?.receipt?.receiptDigest]) {
    if (/^[a-f0-9]{64}$/u.test(String(digest ?? ""))) return digest;
  }
  return sha256(result);
}

function checkpoint(context) {
  assertRuntimeRequestLedgerState(context.state, V2B8_REQUEST_LEDGER_STAGE);
  commitAtomicRequestCheckpoint(context.root, {
    scope: "v2b8",
    createdAt: context.now(),
    state: context.state,
    caches: { tavily: context.tavilyCache, relay: context.relayCache },
    receipts: Object.values(context.relayCache?.entries ?? {}),
    requestLedger: context.state.requestEventLedger,
    counters: context.state.requestCounters,
    adapterVersion: V2B6_ADAPTER_VERSION,
    manifestBindings: {
      manifestDigest: V2B7_CANARY_MANIFEST_DIGEST,
      repeatDigest: V2B7_REPEAT_DIGEST,
      sourceBundleDigest: V2B7_SOURCE_BUNDLE_DIGEST,
      contractDigest: context.frozen?.contract?.contractDigest ?? null,
    },
  });
  // Compatibility mirrors are written only after the immutable snapshot and
  // current binding commit. Loaders treat the bound snapshot as authoritative.
  atomicWriteJson(join(context.privateStore, V2B8_FILES.state), context.state);
  atomicWriteJson(join(context.privateStore, V2B8_FILES.tavilyCache), context.tavilyCache);
  atomicWriteJson(join(context.privateStore, V2B8_FILES.relayCache), context.relayCache);
}

function privateArtifact(kind, data) {
  return { schema: `m2.v2.v2b8-${kind}-private.v0.1`, privateOnly: true, ...data, full160Authorized: false };
}

function privatePathIgnoredAndUntracked(root, relative) {
  const ignored = spawnSync("git", ["check-ignore", "-q", "--", relative], { cwd: root, windowsHide: true }).status === 0;
  const tracked = spawnSync("git", ["ls-files", "--error-unmatch", "--", relative], { cwd: root, windowsHide: true }).status === 0;
  return ignored && !tracked;
}

function workbookVerificationPassed(receipt) {
  if (!isPlainObject(receipt) || receipt.schema !== "m2.v2.v2b8-workbook-verification-private.v0.3") return false;
  const expectedKeys = [
    "byteLength", "cachedFormulaErrors", "exists", "externalLinkCount", "forbiddenValueCount",
    "formulaCount", "formulaErrorCount", "formulaHyperlinkCount", "full160Authorized",
    "generatorAssertionsTrusted", "hyperlinkCount", "hyperlinkTargetLineage", "ignoredAndUntracked",
    "incomeValueCount", "independentObjectVerified", "internalIdCount", "privateOnly", "receiptDigest",
    "rowCounts", "schema", "secretCount", "sheetCount", "sheetNames", "validationCount",
    "verificationBasis", "verificationIssues", "verifiedAt", "visualReviewAttested", "visualReviewStatus",
    "workbookSha256",
  ].sort();
  if (canonicalJson(Object.keys(receipt).sort()) !== canonicalJson(expectedKeys)
    || /https?:\/\//iu.test(JSON.stringify(receipt))) return false;
  const { receiptDigest, ...payload } = receipt;
  if (!/^[a-f0-9]{64}$/u.test(String(receiptDigest ?? "")) || receiptDigest !== sha256(payload)) return false;
  try {
    assertIndependentWorkbookHyperlinkLineage(receipt.hyperlinkTargetLineage, {
      expectedOccurrenceCount: receipt.hyperlinkCount,
    });
  } catch {
    return false;
  }
  return receipt.independentObjectVerified === true
    && receipt?.generatorAssertionsTrusted === false
    && receipt?.verificationBasis === "xlsx_zip_xml_actual_object"
    && receipt?.sheetCount === 4
    && receipt?.formulaErrorCount === 0
    && receipt?.formulaHyperlinkCount === 0
    && receipt?.hyperlinkCount === 115
    && receipt?.validationCount >= 3
    && receipt?.forbiddenValueCount === 0
    && receipt?.internalIdCount === 0
    && receipt?.incomeValueCount === 0
    && receipt?.secretCount === 0
    && receipt?.externalLinkCount === 0
    && receipt?.visualReviewAttested === false
    && receipt?.ignoredAndUntracked === true;
}

function effectiveSchemaPass(receipt) {
  return receipt?.modelBindingVerified === true && receipt?.providerContractCompatible === true && receipt?.normalizedResponse?.structuredValid === true;
}

function sanitizeRepairIssues(values) {
  return unique((Array.isArray(values) ? values : []).map(safeToken).filter((value) => value && REPAIRABLE.some((pattern) => pattern.test(value)))).slice(0, 20);
}

function stripUrlLiterals(value) {
  return String(value ?? "").replace(/https?:\/\/\S+/giu, "[URL omitted]");
}

function cleanText(value, limit) {
  return typeof value === "string" ? [...value.normalize("NFKC").replace(/\s+/gu, " ").trim()].slice(0, limit).join("") : "";
}

function safeToken(value) {
  const cleaned = String(value ?? "").replace(/https?:\/\/\S+/giu, "url").replace(/(?:sk|tvly)-[A-Za-z0-9_-]+/gu, "secret").replace(/[^A-Za-z0-9_.:-]/gu, "_");
  return cleaned.slice(0, 160) || "unknown";
}

function sumUsage(rows) {
  return { inputTokens: nullableSum(rows.map((row) => row?.inputTokens)), outputTokens: nullableSum(rows.map((row) => row?.outputTokens)), totalTokens: nullableSum(rows.map((row) => row?.totalTokens)) };
}

function readValidationPassed(privateStore) {
  if (!existsSync(join(privateStore, V2B8_FILES.validation))) return false;
  try { return readJson(join(privateStore, V2B8_FILES.validation)).allPassed === true; } catch { return false; }
}

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const result = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/u)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/u.exec(line);
    if (!match || match[1].startsWith("#")) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    result[match[1]] = value;
  }
  return result;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readNdjson(path) {
  return readFileSync(path, "utf8").split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}

function atomicWriteJson(path, value) {
  return atomicWriteText(path, `${JSON.stringify(value, null, 2)}\n`);
}

function atomicWriteNdjson(path, rows) {
  return atomicWriteText(path, rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""));
}

function atomicWriteText(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temporary, value, "utf8");
  renameSync(temporary, path);
  return value;
}

function gate(id, actual, threshold, predicate, contextEvaluable = true) {
  const evaluable = contextEvaluable === true
    && actual !== null
    && actual !== undefined
    && (typeof actual !== "number" || Number.isFinite(actual));
  const value = evaluable ? actual : null;
  const passed = evaluable && predicate(value, threshold);
  return {
    id,
    status: evaluable ? (passed ? "PASS" : "FAIL") : "NOT_EVALUABLE",
    value,
    actual: value,
    threshold,
    passed,
  };
}

function historicalGateProjection(item) {
  return {
    id: item.id,
    actual: item.actual,
    threshold: item.threshold,
    passed: item.passed,
  };
}

// Compatibility classifier for the immutable v2b8-historical-v0.1 contract.
// It intentionally preserves the original heuristic semantics so the old
// CANARY_CONDITIONAL snapshot can be independently reproduced without treating
// those semantics as current authority.
function classifyV2B8SourceHistorical(record) {
  if (classifyV2B5ProhibitedSource(record).prohibited) return "prohibited";
  const domain = normalizeHistoricalClassifierText(record?.domain);
  const title = normalizeHistoricalClassifierText(record?.title);
  const snippet = normalizeHistoricalClassifierText(record?.snippet);
  const text = `${domain} ${title} ${snippet}`;
  if (/(?:\.gov(?:\.cn)?$|政府|国家新闻出版|版权保护中心|登记|registry)/u.test(`${domain} ${title}`)) return "government_or_registry";
  if (/(?:作者官网|作家官网|个人主页|author\s*(?:site|page)|official\s*author)/u.test(text)) return "official_author";
  if (/(?:出版社|出版集团|出版公司|press\b|publisher)/u.test(text)) return "official_publisher";
  if (/(?:起点|晋江|纵横|番茄小说|掌阅|阅文|潇湘书院|红袖添香|webnovel|original\s*platform)/u.test(text)) return "official_platform";
  if (/(?:新闻网|日报|晚报|周刊|电视台|广播网|news\b|times\b|post\b|media\b)/u.test(text)) return "mainstream_media";
  if (/(?:baike|百科|wikipedia|维基|图书馆|library|isbn|catalog|豆瓣读书|读书网)/u.test(text)) return "catalog_or_encyclopedia";
  if (/(?:豆瓣|知乎|论坛|贴吧|书评|读者评论|community|forum|review)/u.test(text)) return "community_review";
  if (/(?:京东|当当|亚马逊|天猫|淘宝|商城|购书|retail|amazon|jd\.com)/u.test(text)) return "retailer";
  if (/(?:baidu|bing|sogou|so\.com|search|搜索)/u.test(`${domain} ${title}`)) return "search_index";
  return "unknown_public_web";
}

function normalizeHistoricalClassifierText(value) {
  return String(value ?? "").normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}

function equal(actual, threshold) { return actual === threshold; }
function atLeast(actual, threshold) { return Number.isFinite(actual) && actual >= threshold; }
function atMost(actual, threshold) { return Number.isFinite(actual) && actual <= threshold; }
function requiredRatio(numerator, denominator) { return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0 ? numerator / denominator : null; }
function requiredSampleRatio(numerator, denominator, observedCount, expectedCount) { return observedCount === expectedCount ? requiredRatio(numerator, denominator) : null; }
function sum(values) { return values.reduce((total, value) => total + Number(value ?? 0), 0); }
function nullableSum(values) { const finite = values.filter(Number.isFinite); return finite.length ? sum(finite) : null; }
function average(values) { const finite = values.filter(Number.isFinite); return finite.length ? sum(finite) / finite.length : null; }
function percentile(values, fraction) { const sorted = values.filter(Number.isFinite).sort((a, b) => a - b); if (!sorted.length) return null; const position = (sorted.length - 1) * fraction; const lower = Math.floor(position); const upper = Math.ceil(position); return lower === upper ? sorted[lower] : sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower); }
function unique(values) { return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ""))]; }
function countBy(values, keyFn) { return values.reduce((result, value) => { const key = keyFn(value); result[key] = (result[key] ?? 0) + 1; return result; }, {}); }
function countMany(values) { return countBy(values, (value) => value); }
function jaccard(left, right) { const union = new Set([...left, ...right]); return union.size ? [...left].filter((value) => right.has(value)).length / union.size : 0; }
function isIsoTimestamp(value) { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function percent(value) { return Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : "N/A"; }

export const __test = Object.freeze({
  buildPrimarySearchRuns,
  buildRepeatSearchRuns,
  canonicalizeResponse,
  collectFailedV2B7Queries,
  projectExtractionSources,
  gate,
  requiredRatio,
  requiredSampleRatio,
  workbookVerificationPassed,
});
