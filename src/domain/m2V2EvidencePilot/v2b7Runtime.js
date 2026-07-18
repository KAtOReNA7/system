import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { canonicalJson, sha256 } from "./pilotCore.js";
import {
  commitAtomicRequestCheckpoint,
  evaluateGitBoundaryCommandResult,
  receiptWasCacheHit,
  validateVerifierRequestIntegrity,
  withReceiptRuntimeView,
} from "./integrityState.js";
import {
  buildV2B5ExtractionSchemaFormat,
} from "./extractionV2B5.js";
import {
  buildV2B5SourceRecordSet,
  mergeAndLimitV2B5SourceRecords,
  validateV2B5SourceRecord,
} from "./sourceRecordV2B5.js";
import {
  V2B5_DEFAULT_SOURCE_GOVERNANCE_POLICY,
  classifyV2B5ProhibitedSource,
} from "./sourceGovernanceV2B5.js";
import {
  TavilyStructuredSearchProviderV2B5,
  buildV2B5TavilyCacheDescriptor,
} from "./tavilySearchProviderV2B5.js";
import {
  V2B6_ADAPTER_VERSION,
  buildV2B6Receipt,
  dispatchV2B6RelayRequest,
  normalizeV2B6BenchmarkResponse,
} from "./relayExtractionAdapterV2B6.js";
import { assertProviderExecutionReadiness, bindProviderTransport } from "./providerTransportSecurity.js";
import { inspectV2B6ProviderCacheReadiness } from "./v2b6SafeCache.js";
import { verifyIndependentWorkbookObject } from "./workbookIndependentVerifier.js";
import {
  appendRuntimeRequestEvent,
  assertRuntimeRequestLedgerState,
} from "./requestEventLedger.js";
import {
  V2B7_BUNDLE_RELATIVE,
  V2B7_CANARY_MANIFEST_DIGEST,
  V2B7_GATE_THRESHOLDS,
  V2B7_MANIFEST_RELATIVE,
  V2B7_MAX_OUTPUT_TOKENS,
  V2B7_MAX_REPAIRS,
  V2B7_MODEL_ID,
  V2B7_NAMESPACE,
  V2B7_OVERLAP_MAPPING_DIGEST,
  V2B7_PRIVATE_RELATIVE,
  V2B7_RELAY_REQUEST_CAP,
  V2B7_REPEAT_DIGEST,
  V2B7_SOURCE_BUNDLE_DIGEST,
  V2B7_START_SHA,
  V2B7_TAVILY_REQUEST_CAP,
  V2B7_TIMEOUT_MS,
  assertPublicV2B7Sanitized,
  buildV2B7WorkQueries,
  checkAndFreezeV2B7Contract,
  evaluateV2B7FreezeInvariants,
  readV2B7FrozenContract,
  validateV2B7OutboundQueryPlans,
} from "./v2b7Contract.js";

const V2B7_REQUEST_LEDGER_STAGE = "v2b7";
const V2B7_VERIFIER_ATOMIC_ROLES = Object.freeze([
  "state",
  "cacheIndex",
  "receiptIndex",
  "requestLedger",
  "counters",
  "receiptEnvelopes",
  "recoveredDerivedState",
  "effectiveReceipts",
  "recoveredEvaluation",
]);

export const V2B7_WORKBOOK_RELATIVE = "data/private-output/m2-v2-evidence-pilot/canary-v3/M2-v2-canary-v3-private-review-workbook-v0.2.xlsx";

const PRIVATE_FILES = Object.freeze({
  state: "v2b7-execution-state-private-v0.1.json",
  tavilyCache: "v2b7-tavily-cache-private-v0.1.json",
  relayCache: "v2b7-relay-cache-private-v0.1.json",
  primarySearch: "canary-v3-primary-search-private-v0.2.json",
  repeatSearch: "canary-v3-repeat-search-private-v0.2.json",
  sourceRecords: "canary-v3-source-records-private-v0.2.ndjson",
  relayReceipts: "canary-v3-relay-receipts-private-v0.2.ndjson",
  evidenceRecords: "canary-v3-evidence-records-private-v0.2.ndjson",
  reproducibility: "canary-v3-reproducibility-private-v0.1.json",
  usage: "canary-v3-usage-ledger-private-v0.1.json",
  evaluation: "canary-v3-evaluation-private-v0.2.json",
  validation: "canary-v3-full-validation-receipt-private-v0.1.json",
  verification: "canary-v3-verification-receipt-private-v0.1.json",
  workbookVerification: "canary-v3-workbook-verification-private-v0.2.json",
});

const PUBLIC_REPORTS = Object.freeze({
  executionJson: "docs/analysis/m2-v2/M2-v2-canary-v3-execution-summary-v0.2.json",
  executionMarkdown: "docs/analysis/m2-v2/M2-v2-canary-v3-execution-summary-v0.2.md",
  qualityJson: "docs/analysis/m2-v2/M2-v2-canary-v3-quality-report-v0.2.json",
  qualityMarkdown: "docs/analysis/m2-v2/M2-v2-canary-v3-quality-report-v0.2.md",
  reproducibilityJson: "docs/analysis/m2-v2/M2-v2-canary-v3-reproducibility-report-v0.1.json",
  reproducibilityMarkdown: "docs/analysis/m2-v2/M2-v2-canary-v3-reproducibility-report-v0.1.md",
  costJson: "docs/analysis/m2-v2/M2-v2-canary-v3-cost-latency-report-v0.1.json",
  costMarkdown: "docs/analysis/m2-v2/M2-v2-canary-v3-cost-latency-report-v0.1.md",
  decisionJson: "docs/analysis/m2-v2/M2-v2-canary-v3-decision-v0.2.json",
  decisionMarkdown: "docs/analysis/m2-v2/M2-v2-canary-v3-decision-v0.2.md",
  nextStepJson: "docs/analysis/m2-v2/M2-v2-v2b7-next-step-v0.1.json",
  nextStepMarkdown: "docs/analysis/m2-v2/M2-v2-v2b7-next-step-v0.1.md",
});

const REPAIRABLE_ISSUE_PATTERNS = Object.freeze([
  /strict_json_parse_failed/u,
  /structured_json_not_found/u,
  /exact_keys|keys_invalid|unexpected_key|missing_key/u,
  /enum|status_invalid|claim_type_invalid|value_type_invalid/u,
  /required|missing/u,
  /source_id.*(?:format|invalid)|supporting_source_ids_invalid/u,
  /schema_version_invalid/u,
]);

const NON_REPAIRABLE_ISSUE_PATTERNS = Object.freeze([
  /private_leak/u,
  /fabricated_source/u,
  /model_generated_url/u,
  /historical_backfill/u,
  /entity.*(?:unresolved|ambiguous|support)/u,
  /conflict|contradiction/u,
  /prohibited_source/u,
  /claim_exceeds|unsupported_claim/u,
  /time_missing|event_time/u,
]);

export function buildV2B7ExtractionPayload(input) {
  const work = {
    title: cleanText(input?.work?.title, 200),
    author: cleanText(input?.work?.author, 200),
    sourceType: input?.work?.sourceType === "publication" ? "publication" : "web_original",
  };
  const records = projectV2B7ExtractionSources(input?.sourceRecords);
  if (!work.title || !work.author || records.length < 1 || records.length > 6) throw new Error("v2b7_extraction_input_incomplete");
  const repairIssues = sanitizeRepairIssues(input?.repairIssues);
  const instructions = [
    "Extract structured evidence only from SOURCE_RECORDS. Never search, browse, call tools, or use outside knowledge.",
    "Resolve the supplied work and author only when exact support exists in the supplied title or snippet.",
    "Every entity support and claim must use only supplied sourceIds. Never invent sourceIds and never output URLs.",
    "Every structured value must occur in a cited source title or snippet. Unknown eventTime must be null.",
    "Return no unsupported claim. Do not predict revenue, assign commercial value, or give operating recommendations.",
    "Return only the requested strict JSON schema.",
  ];
  if (repairIssues.length) instructions.push(`Repair only these local schema issue codes: ${repairIssues.join(", ")}. Keep the same sources, model, and schema.`);
  instructions.push(`WORK: ${canonicalJson(work)}`, `SOURCE_RECORDS: ${canonicalJson(records)}`);
  const payload = {
    model: V2B7_MODEL_ID,
    input: instructions.join("\n"),
    text: { format: buildV2B5ExtractionSchemaFormat() },
    store: false,
    max_output_tokens: V2B7_MAX_OUTPUT_TOKENS,
  };
  const validation = validateV2B7ExtractionPayload(payload, { work, records });
  if (!validation.valid) throw new Error(`v2b7_extraction_outbound_invalid:${validation.issues.join(",")}`);
  return payload;
}

export function validateV2B7ExtractionPayload(payload, context = {}) {
  const issues = [];
  if (payload?.model !== V2B7_MODEL_ID) issues.push("model_invalid");
  if (payload?.store !== false) issues.push("store_invalid");
  if (payload?.max_output_tokens !== V2B7_MAX_OUTPUT_TOKENS) issues.push("max_output_tokens_invalid");
  if (payload?.text?.format?.type !== "json_schema" || payload?.text?.format?.strict !== true) issues.push("server_strict_schema_missing");
  if (Object.hasOwn(payload ?? {}, "reasoning")) issues.push("reasoning_prohibited");
  if (Object.hasOwn(payload ?? {}, "tools")) issues.push("tools_prohibited");
  const serialized = canonicalJson(payload ?? {});
  if (/web_search|browser|computer-use/iu.test(serialized)) issues.push("search_or_browser_prohibited");
  if (/standardWorkId|workReference|identityDigest|canarySlotId|queryId|providerRequestId|providerReceiptRef|providerScore/iu.test(serialized)) issues.push("private_field_outbound");
  if (/https?:\/\//iu.test(serialized)) issues.push("url_outbound");
  const allowedRecordKeys = ["sourceId", "title", "domain", "snippet", "capturedAt", "availableAt"];
  for (const record of context.records ?? []) {
    if (canonicalJson(Object.keys(record).sort()) !== canonicalJson([...allowedRecordKeys].sort())) issues.push("source_projection_fields_invalid");
  }
  const snippetCharacters = (context.records ?? []).reduce((total, record) => total + [...record.snippet].length, 0);
  if (snippetCharacters > 3_000) issues.push("snippet_budget_exceeded");
  return { valid: issues.length === 0, issues: unique(issues) };
}

export function isV2B7Repairable(receipt) {
  const normalized = receipt?.normalizedResponse;
  if (receipt?.attemptKind !== "primary" || receipt?.dispatched !== true || receipt?.httpOk !== true
    || receipt?.modelBindingVerified !== true || normalized?.structuredValid === true) return false;
  if ((normalized?.privateLeakCount ?? 0) > 0 || (normalized?.fabricatedSourceIdCount ?? 0) > 0
    || (normalized?.modelGeneratedUrlCount ?? 0) > 0 || (normalized?.historicalBackfillCount ?? 0) > 0) return false;
  const issues = unique([...(normalized?.issues ?? []), ...(normalized?.carrierIssues ?? [])]);
  if (issues.some((issue) => NON_REPAIRABLE_ISSUE_PATTERNS.some((pattern) => pattern.test(issue)))) return false;
  return issues.some((issue) => REPAIRABLE_ISSUE_PATTERNS.some((pattern) => pattern.test(issue)));
}

export function selectV2B7EffectiveReceipt(physicalReceipts, logical) {
  const primary = physicalReceipts.find((receipt) => receipt.attemptKind === "primary") ?? null;
  const repair = physicalReceipts.find((receipt) => receipt.attemptKind === "repair") ?? null;
  const successful = (receipt) => receipt?.modelBindingVerified === true
    && receipt?.providerContractCompatible === true
    && receipt?.normalizedResponse?.contractValid === true;
  const selected = successful(repair) ? repair : successful(primary) ? primary : repair ?? primary;
  const timedOut = physicalReceipts.some((receipt) => receipt.timedOut === true);
  const payload = {
    schema: "m2.v2.v2b7-extraction-effective-receipt.v0.2",
    privateOnly: true,
    phase: "canary_v3_effective",
    executionNamespace: V2B7_NAMESPACE,
    runKind: logical.searchRun.runKind,
    canarySlotId: logical.work.canarySlotId,
    requestedModelId: V2B7_MODEL_ID,
    returnedModelId: selected?.returnedModelId ?? null,
    modelBindingStatus: selected?.modelBindingStatus ?? "unreported",
    modelBindingVerified: selected?.modelBindingVerified === true,
    providerContractCompatible: selected?.providerContractCompatible === true,
    adapterVersion: V2B6_ADAPTER_VERSION,
    extractionMode: "full",
    structuredMode: "server_strict",
    timeoutMs: V2B7_TIMEOUT_MS,
    sourceRecordSetDigest: logical.searchRun.sourceRecordSetDigest,
    schemaVersion: "m2.v2.evidence-extraction-output.v0.2",
    physicalRequestCount: physicalReceipts.length,
    physicalReceiptDigests: physicalReceipts.map((receipt) => receipt.receiptDigest),
    selectedAttemptKind: selected?.attemptKind ?? null,
    effectiveSelectionRule: "successful_repair_then_successful_primary_then_latest_explicit_failure_then_missing",
    dispatched: physicalReceipts.some((receipt) => receipt.dispatched === true),
    timedOut,
    latencyMs: timedOut ? null : nullableSum(physicalReceipts.map((receipt) => receipt.latencyMs)),
    usage: sumUsage(physicalReceipts.map((receipt) => receipt.usage)),
    normalizedResponse: selected?.normalizedResponse ?? null,
    status: selected?.status ?? "missing",
    searchToolUsed: false,
    tavilyRequestUsed: false,
    canaryExecuted: true,
    full160Authorized: false,
  };
  return { ...payload, receiptDigest: sha256(payload) };
}

export async function runV2B7(root, options = {}) {
  const frozen = checkAndFreezeV2B7Contract(root, options);
  const config = loadV2B7Configuration(root, options.env);
  assertProviderExecutionReadiness({
    ...inspectV2B6ProviderCacheReadiness(root),
    providerHostBindingVerified: true,
  });
  const privateStore = frozen.privateStore;
  const statePath = join(privateStore, PRIVATE_FILES.state);
  const tavilyCachePath = join(privateStore, PRIVATE_FILES.tavilyCache);
  const relayCachePath = join(privateStore, PRIVATE_FILES.relayCache);
  const state = readJson(statePath);
  assertRuntimeRequestLedgerState(state, V2B7_REQUEST_LEDGER_STAGE);
  if (state.pretestsPassed !== true) throw new Error("v2b7_pretests_not_passed");
  if (state.canaryExecuted === true && options.resume !== true) throw new Error("v2b7_completed_execution_requires_resume_or_report");
  if (["search_in_progress", "extraction_in_progress"].includes(state.phase) && options.resume !== true) throw new Error("v2b7_incomplete_execution_requires_resume");
  const tavilyCache = existsSync(tavilyCachePath) ? readJson(tavilyCachePath) : newCache("tavily", frozen.privateContract.contractDigest);
  const relayCache = existsSync(relayCachePath) ? readJson(relayCachePath) : newCache("relay", frozen.privateContract.contractDigest);
  assertRuntimeContainers(state, tavilyCache, relayCache, frozen.privateContract);
  reconcileIndeterminateReservations(state, tavilyCache, relayCache, options.now?.() ?? new Date().toISOString());
  const tavily = new TavilyStructuredSearchProviderV2B5({
    baseUrl: config.tavily.baseUrl,
    apiKey: config.tavily.apiKey,
    topic: "general",
    searchDepth: "basic",
    maxResults: 6,
    country: "china",
    projectId: V2B7_NAMESPACE,
    timeoutMs: 30_000,
    fetchImpl: options.fetchImpl,
  });
  const context = {
    root,
    privateStore,
    frozen,
    config,
    state,
    tavilyCache,
    relayCache,
    tavily,
    now: options.now ?? (() => new Date().toISOString()),
    onProgress: options.onProgress ?? (() => {}),
  };
  checkpoint(context);
  if (state.canaryExecuted === true && options.resume === true) return readV2B7Results(root);

  state.phase = "search_in_progress";
  state.executionStartedAt ??= context.now();
  checkpoint(context);
  const primarySearch = await runPrimarySearch(context);
  atomicWriteJson(join(privateStore, PRIVATE_FILES.primarySearch), searchArtifact("primary", primarySearch));
  const repeatSearch = await runRepeatSearch(context);
  atomicWriteJson(join(privateStore, PRIVATE_FILES.repeatSearch), searchArtifact("repeat", repeatSearch));
  state.phase = "extraction_in_progress";
  checkpoint(context);

  const physicalReceipts = [];
  const effectiveReceipts = [];
  for (const searchRun of [...primarySearch, ...repeatSearch]) {
    context.onProgress({ phase: "canary_v3", stage: "extraction", runKind: searchRun.runKind, workOrdinal: searchRun.workOrdinal });
    const work = frozen.manifest.sample.find((item) => item.canarySlotId === searchRun.canarySlotId);
    if (!searchRun.sourceRecords.length) {
      effectiveReceipts.push(blockedEffectiveReceipt(work, searchRun));
      continue;
    }
    const primary = await executeExtractionAttempt(context, { work, searchRun, attemptKind: "primary" });
    physicalReceipts.push(primary);
    const attempts = [primary];
    if (isV2B7Repairable(primary) && state.relay.repairCount < V2B7_MAX_REPAIRS
      && state.relay.physicalRequestCount < V2B7_RELAY_REQUEST_CAP) {
      const repairIssues = repairIssueCodes(primary);
      const repair = await executeExtractionAttempt(context, { work, searchRun, attemptKind: "repair", repairIssues });
      state.relay.repairCount += receiptWasCacheHit(repair) ? 0 : 1;
      checkpoint(context);
      physicalReceipts.push(repair);
      attempts.push(repair);
    }
    effectiveReceipts.push(selectV2B7EffectiveReceipt(attempts, { work, searchRun }));
  }
  const allReceipts = [...physicalReceipts, ...effectiveReceipts];
  atomicWriteNdjson(join(privateStore, PRIVATE_FILES.relayReceipts), allReceipts);
  const sourceRecords = [...primarySearch, ...repeatSearch].flatMap((run) => run.sourceRecords.map((record) => ({
    ...record,
    canarySlotId: run.canarySlotId,
    runKind: run.runKind,
    sourceOrigin: run.sourceOrigin,
  })));
  atomicWriteNdjson(join(privateStore, PRIVATE_FILES.sourceRecords), sourceRecords);
  const evidenceRecords = effectiveReceipts.flatMap((receipt) => (receipt.normalizedResponse?.claims ?? []).map((claim) => ({
    schema: "m2.v2.v2b7-private-evidence-record.v0.2",
    privateOnly: true,
    canarySlotId: receipt.canarySlotId,
    runKind: receipt.runKind,
    requestedModelId: receipt.requestedModelId,
    sourceRecordSetDigest: receipt.sourceRecordSetDigest,
    ...claim,
  })));
  atomicWriteNdjson(join(privateStore, PRIVATE_FILES.evidenceRecords), evidenceRecords);
  state.canaryExecuted = true;
  state.phase = "canary_completed_validation_pending";
  state.completedAt = context.now();
  checkpoint(context);
  const evaluation = evaluateAndPersist(context, {
    primarySearch,
    repeatSearch,
    physicalReceipts,
    effectiveReceipts,
    allTestsPassed: readValidationPassed(privateStore),
  });
  writeV2B7PublicReports(root, { ...readV2B7Results(root), evaluation });
  return readV2B7Results(root);
}

export function evaluateV2B7Canary(input) {
  const manifest = input.manifest;
  const primarySearch = input.primarySearch ?? [];
  const repeatSearch = input.repeatSearch ?? [];
  const physicalReceipts = input.physicalReceipts ?? [];
  const effectiveReceipts = input.effectiveReceipts ?? [];
  const primaryEffective = manifest.sample.map((work) => effectiveReceipts.find((receipt) => receipt.runKind === "primary" && receipt.canarySlotId === work.canarySlotId)).filter(Boolean);
  const repeatEffective = manifest.repeatSample.map((work) => effectiveReceipts.find((receipt) => receipt.runKind === "repeat" && receipt.canarySlotId === work.canarySlotId)).filter(Boolean);
  const queryExecutions = [...primarySearch, ...repeatSearch].flatMap((run) => run.queries ?? []);
  const primarySourceWorks = new Set(primarySearch.filter((run) => run.sourceRecords.length > 0).map((run) => run.canarySlotId));
  const primarySchemaPass = primaryEffective.filter(effectiveSchemaPass);
  const repeatSchemaPass = repeatEffective.filter(effectiveSchemaPass);
  const primaryResolved = primaryEffective.filter((receipt) => ["high", "medium"].includes(receipt.normalizedResponse?.entityResolution?.work?.status));
  const primaryPilotUsable = primaryEffective.filter((receipt) => (receipt.normalizedResponse?.pilotUsableClaimCount ?? 0) > 0);
  const highValueSlots = new Set(manifest.sample.filter((work) => work.highValue === true).map((work) => work.canarySlotId));
  const highValuePilot = primaryPilotUsable.filter((receipt) => highValueSlots.has(receipt.canarySlotId));
  const allSourceRecords = [...primarySearch, ...repeatSearch].flatMap((run) => run.sourceRecords);
  const allClaims = effectiveReceipts.flatMap((receipt) => receipt.normalizedResponse?.claims ?? []);
  const acceptedClaims = allClaims.filter((claim) => claim.accepted === true);
  const pilotUsableClaims = allClaims.filter((claim) => claim.pilotUsable === true);
  const sourceByRun = new Map([...primarySearch, ...repeatSearch].map((run) => [`${run.runKind}:${run.canarySlotId}`, new Map(run.sourceRecords.map((record) => [record.sourceId, record]))]));
  const reproducibility = evaluateV2B7Reproducibility({ manifest, primarySearch, repeatSearch, primaryEffective, repeatEffective, sourceByRun });
  const referenceCount = sum(effectiveReceipts.map((receipt) => receipt.normalizedResponse?.sourceIdReferenceCount));
  const mappedCount = sum(effectiveReceipts.map((receipt) => receipt.normalizedResponse?.mappedSourceIdReferenceCount));
  const unresolvedAcceptedCount = allClaims.filter((claim) => claim.accepted === true
    && (!['high', 'medium'].includes(claim.entityResolution?.work?.status)
      || !['none', 'resolved'].includes(claim.contradictionStatus))).length;
  const prohibitedAcceptedCount = allClaims.filter((claim) => claim.accepted === true && (claim.supportingSourceIds ?? []).some((id) => {
    const source = allSourceRecords.find((record) => record.sourceId === id);
    return source ? classifyV2B5ProhibitedSource(source).prohibited : false;
  })).length;
  const capturedCompleteness = ratio(allSourceRecords.filter((record) => isIsoTimestamp(record.capturedAt)).length, allSourceRecords.length);
  const availableCompleteness = ratio(allSourceRecords.filter((record) => isIsoTimestamp(record.availableAt)).length, allSourceRecords.length);
  const sourceIntegrity = referenceCount ? mappedCount / referenceCount : effectiveReceipts.length === 15 ? 1 : 0;
  const gitBoundary = input.gitBoundary ?? { b4Unchanged: true, holdoutSealed: true };
  const safetyItems = [
    gate("private_leak_zero", sum(effectiveReceipts.map((receipt) => receipt.normalizedResponse?.privateLeakCount)), 0, (actual) => actual === 0),
    gate("prohibited_source_accepted_zero", prohibitedAcceptedCount, 0, (actual) => actual === 0),
    gate("fabricated_source_id_zero", sum(effectiveReceipts.map((receipt) => receipt.normalizedResponse?.fabricatedSourceIdCount)), 0, (actual) => actual === 0),
    gate("model_generated_url_zero", sum(effectiveReceipts.map((receipt) => receipt.normalizedResponse?.modelGeneratedUrlCount)), 0, (actual) => actual === 0),
    gate("historical_backfill_zero", sum(effectiveReceipts.map((receipt) => receipt.normalizedResponse?.historicalBackfillCount)), 0, (actual) => actual === 0),
    gate("source_id_integrity", sourceIntegrity, 1, (actual) => actual === 1),
    gate("captured_at_complete", capturedCompleteness, 1, (actual) => actual === 1),
    gate("available_at_complete", availableCompleteness, 1, (actual) => actual === 1),
    gate("unresolved_conflicted_accepted_zero", unresolvedAcceptedCount, 0, (actual) => actual === 0),
    gate("manifest_unchanged", input.manifestUnchanged === true, true, Boolean),
    gate("frozen_bundle_unchanged", input.bundleUnchanged === true, true, Boolean),
    gate("b4_unchanged", gitBoundary.b4Unchanged === true, true, Boolean),
    gate("final_holdout_sealed", gitBoundary.holdoutSealed === true, true, Boolean),
    gate("all_tests_pass", input.allTestsPassed === true, true, Boolean),
  ];
  const logicalTavilySuccessRate = ratio(queryExecutions.filter((query) => query.contractValid === true).length, 22);
  const noTimeoutRate = ratio(effectiveReceipts.filter((receipt) => receipt.timedOut !== true).length, 15);
  const bindingMismatchCount = physicalReceipts.filter((receipt) => receipt.modelBindingStatus === "mismatch").length;
  const usabilityItems = [
    gate("logical_tavily_success_rate", logicalTavilySuccessRate, V2B7_GATE_THRESHOLDS.logicalTavilySuccessRate, atLeast),
    gate("source_record_work_coverage", ratio(primarySourceWorks.size, 10), V2B7_GATE_THRESHOLDS.sourceRecordWorkCoverage, atLeast),
    gate("primary_schema_pass_rate", ratio(primarySchemaPass.length, 10), V2B7_GATE_THRESHOLDS.primarySchemaPassRate, atLeast),
    gate("work_resolved_rate", ratio(primaryResolved.length, 10), V2B7_GATE_THRESHOLDS.workResolvedRate, atLeast),
    gate("pilot_usable_work_coverage", ratio(primaryPilotUsable.length, 10), V2B7_GATE_THRESHOLDS.pilotUsableWorkCoverage, atLeast),
    gate("high_value_coverage", ratio(highValuePilot.length, highValueSlots.size), V2B7_GATE_THRESHOLDS.highValueCoverage, atLeast),
    gate("repeat_claim_agreement", reproducibility.claimAgreement, V2B7_GATE_THRESHOLDS.repeatClaimAgreement,
      (actual, threshold) => reproducibility.claimAgreementEvaluableCount === 5 && Number.isFinite(actual) && actual >= threshold),
    gate("repeat_source_overlap", reproducibility.meanSourceOverlap, V2B7_GATE_THRESHOLDS.repeatSourceOverlap, atLeast),
    gate("no_timeout_rate", noTimeoutRate, V2B7_GATE_THRESHOLDS.noTimeoutRate, atLeast),
    gate("model_binding_mismatch_zero", bindingMismatchCount, 0, (actual) => actual === 0),
  ];
  const safetyPassed = safetyItems.every((item) => item.passed);
  const usabilityPassed = usabilityItems.every((item) => item.passed);
  const validationPending = input.allTestsPassed !== true && input.validationPending === true;
  const decision = validationPending ? "CANARY_BLOCKED"
    : !safetyPassed ? "CANARY_FAIL"
      : usabilityPassed ? "CANARY_PASS" : "CANARY_CONDITIONAL";
  const searchDecision = usabilityItems.slice(0, 2).every((item) => item.passed) ? "PASS" : "FAIL";
  const extractionDecision = [2, 3, 8, 9].every((index) => usabilityItems[index].passed) ? "PASS" : "FAIL";
  const evidenceItems = usabilityItems.slice(4, 8);
  const evidenceUsabilityDecision = safetyPassed && evidenceItems.every((item) => item.passed) ? "PASS"
    : safetyPassed ? "CONDITIONAL" : "FAIL";
  return {
    schema: "m2.v2.v2b7-canary-v3-evaluation.v0.2",
    privateOnly: true,
    evaluatedAt: input.evaluatedAt ?? new Date().toISOString(),
    manifestDigest: V2B7_CANARY_MANIFEST_DIGEST,
    repeatDigest: V2B7_REPEAT_DIGEST,
    sourceBundleDigest: V2B7_SOURCE_BUNDLE_DIGEST,
    executed: true,
    metrics: {
      search: {
        plannedNewQueryCount: 22,
        dispatchedQueryCount: queryExecutions.filter((query) => query.dispatched === true).length,
        querySuccessCount: queryExecutions.filter((query) => query.contractValid === true).length,
        logicalTavilySuccessRate,
        providerErrorCount: queryExecutions.filter((query) => query.contractValid !== true).length,
        resultCount: sum(queryExecutions.map((query) => query.resultCount)),
        sourceRecordWorkCount: primarySourceWorks.size,
        sourceRecordWorkCoverage: ratio(primarySourceWorks.size, 10),
        totalSourceRecordCount: allSourceRecords.length,
        frozenPrimaryReuseWorkCount: primarySearch.filter((run) => run.sourceOrigin === "frozen_benchmark_bundle_reuse").length,
      },
      extraction: {
        model: V2B7_MODEL_ID,
        primaryLogicalCount: 10,
        repeatLogicalCount: 5,
        primarySchemaPassCount: primarySchemaPass.length,
        primarySchemaPassRate: ratio(primarySchemaPass.length, 10),
        repeatSchemaPassCount: repeatSchemaPass.length,
        repeatSchemaPassRate: ratio(repeatSchemaPass.length, 5),
        bindingMismatchCount,
        noTimeoutCount: effectiveReceipts.filter((receipt) => receipt.timedOut !== true).length,
        noTimeoutRate,
      },
      entity: {
        resolvedCount: primaryResolved.length,
        unresolvedCount: primaryEffective.filter((receipt) => receipt.normalizedResponse?.entityResolution?.work?.status === "unresolved").length,
        ambiguousCount: primaryEffective.filter((receipt) => receipt.normalizedResponse?.entityResolution?.work?.status === "ambiguous").length,
        resolvedRate: ratio(primaryResolved.length, 10),
        confidence: average(primaryEffective.map((receipt) => receipt.normalizedResponse?.entityResolution?.work?.confidence).filter(Number.isFinite)),
      },
      evidence: {
        candidateCount: allClaims.length,
        acceptedCount: acceptedClaims.length,
        pilotUsableCount: pilotUsableClaims.length,
        rejectedCount: allClaims.filter((claim) => claim.accepted !== true).length,
        rejectionReasons: countMany(allClaims.flatMap((claim) => claim.rejectionReasons ?? [])),
        pilotUsableWorkCount: primaryPilotUsable.length,
        pilotUsableWorkCoverage: ratio(primaryPilotUsable.length, 10),
        highValueWorkCount: highValueSlots.size,
        highValuePilotUsableWorkCount: highValuePilot.length,
        highValueCoverage: ratio(highValuePilot.length, highValueSlots.size),
      },
      citationTimeGovernance: {
        sourceIdReferenceCount: referenceCount,
        mappedSourceIdReferenceCount: mappedCount,
        sourceIdIntegrityRate: sourceIntegrity,
        capturedAtCompleteness: capturedCompleteness,
        availableAtCompleteness: availableCompleteness,
        eventTimeCompleteness: ratio(allClaims.filter((claim) => isIsoTimestamp(claim.eventTime)).length, allClaims.length),
        eventTimeUnknownCount: allClaims.filter((claim) => claim.eventTime === null).length,
        unresolvedOrConflictedAcceptedCount: unresolvedAcceptedCount,
        prohibitedSourceAcceptedCount: prohibitedAcceptedCount,
        historicalBackfillCount: sum(effectiveReceipts.map((receipt) => receipt.normalizedResponse?.historicalBackfillCount)),
        researchApprovedCount: allClaims.filter((claim) => claim.researchApproved === true).length,
        modelEligibleCount: allClaims.filter((claim) => claim.modelEligible === true).length,
      },
      reproducibility,
    },
    safetyGates: safetyItems,
    usabilityGates: usabilityItems,
    safetyPassed,
    usabilityPassed,
    searchDecision,
    extractionDecision,
    evidenceUsabilityDecision,
    decision,
    blockerIds: [...safetyItems, ...usabilityItems].filter((item) => !item.passed).map((item) => item.id),
    nextStep: nextStepForDecision(decision),
    modelTrainingPerformed: false,
    b4Changed: false,
    finalHoldoutOpened: false,
    enteredV2COrV2D: false,
    enteredC4OrM3: false,
    released: false,
    full160Authorized: false,
    notForFormalDecision: true,
  };
}

export function evaluateV2B7Reproducibility(input) {
  const pairs = input.manifest.repeatSample.map((repeatItem, index) => {
    const primarySearch = input.primarySearch.find((run) => run.canarySlotId === repeatItem.canarySlotId);
    const repeatSearch = input.repeatSearch.find((run) => run.canarySlotId === repeatItem.canarySlotId);
    const primaryReceipt = input.primaryEffective.find((receipt) => receipt.canarySlotId === repeatItem.canarySlotId);
    const repeatReceipt = input.repeatEffective.find((receipt) => receipt.canarySlotId === repeatItem.canarySlotId);
    const primaryIds = new Set((primarySearch?.sourceRecords ?? []).map((record) => record.sourceId));
    const repeatIds = new Set((repeatSearch?.sourceRecords ?? []).map((record) => record.sourceId));
    const primaryClaims = primaryReceipt?.normalizedResponse?.claims ?? [];
    const repeatClaims = repeatReceipt?.normalizedResponse?.claims ?? [];
    const primarySourceMap = input.sourceByRun.get(`primary:${repeatItem.canarySlotId}`) ?? new Map();
    const repeatSourceMap = input.sourceByRun.get(`repeat:${repeatItem.canarySlotId}`) ?? new Map();
    const accepted = compareClaimSets(primaryClaims.filter((claim) => claim.accepted), repeatClaims.filter((claim) => claim.accepted), primarySourceMap, repeatSourceMap);
    const pilotUsable = compareClaimSets(primaryClaims.filter((claim) => claim.pilotUsable), repeatClaims.filter((claim) => claim.pilotUsable), primarySourceMap, repeatSourceMap);
    return {
      anonymousPairId: `repeat_${index + 1}`,
      sourceOverlap: jaccard(primaryIds, repeatIds),
      exactSourceSetMatch: canonicalJson([...primaryIds].sort()) === canonicalJson([...repeatIds].sort()),
      acceptedClaimAgreement: accepted.value,
      acceptedClaimAgreementStatus: accepted.status,
      pilotUsableClaimAgreement: pilotUsable.value,
      pilotUsableClaimAgreementStatus: pilotUsable.status,
      structuredValueAgreement: pilotUsable.structuredValueAgreement,
      confidenceDrift: claimConfidenceDrift(primaryClaims, repeatClaims, primarySourceMap, repeatSourceMap),
      contradictionDrift: contradictionDrift(primaryReceipt, repeatReceipt),
    };
  });
  const sourceValues = pairs.map((pair) => pair.sourceOverlap);
  const evaluableClaims = pairs.filter((pair) => pair.pilotUsableClaimAgreementStatus === "evaluable");
  return {
    expectedPairCount: 5,
    meanSourceOverlap: average(sourceValues) ?? 0,
    medianSourceOverlap: percentile(sourceValues, 0.5),
    exactSourceSetMatchCount: pairs.filter((pair) => pair.exactSourceSetMatch).length,
    claimAgreement: average(evaluableClaims.map((pair) => pair.pilotUsableClaimAgreement)),
    claimAgreementEvaluableCount: evaluableClaims.length,
    claimAgreementNotEvaluableCount: 5 - evaluableClaims.length,
    structuredValueAgreement: average(evaluableClaims.map((pair) => pair.structuredValueAgreement).filter(Number.isFinite)),
    confidenceDrift: average(pairs.map((pair) => pair.confidenceDrift).filter(Number.isFinite)),
    contradictionDriftCount: sum(pairs.map((pair) => pair.contradictionDrift)),
    perPair: pairs,
  };
}

export function readV2B7Results(root) {
  const frozen = readV2B7FrozenContract(root);
  const privateStore = frozen.privateStore;
  const primarySearch = readJson(join(privateStore, PRIVATE_FILES.primarySearch)).runs;
  const repeatSearch = readJson(join(privateStore, PRIVATE_FILES.repeatSearch)).runs;
  const receipts = readNdjson(join(privateStore, PRIVATE_FILES.relayReceipts));
  return {
    ...frozen,
    state: frozen.state,
    primarySearch,
    repeatSearch,
    physicalReceipts: receipts.filter((receipt) => receipt.schema === "m2.v2.relay-extraction-receipt.v0.2"),
    effectiveReceipts: receipts.filter((receipt) => receipt.schema === "m2.v2.v2b7-extraction-effective-receipt.v0.2"),
    evidenceRecords: readNdjson(join(privateStore, PRIVATE_FILES.evidenceRecords)),
    sourceRecords: readNdjson(join(privateStore, PRIVATE_FILES.sourceRecords)),
    reproducibility: readJson(join(privateStore, PRIVATE_FILES.reproducibility)),
    usage: readJson(join(privateStore, PRIVATE_FILES.usage)),
    evaluation: readJson(join(privateStore, PRIVATE_FILES.evaluation)),
    validation: existsSync(join(privateStore, PRIVATE_FILES.validation)) ? readJson(join(privateStore, PRIVATE_FILES.validation)) : null,
    workbookExists: existsSync(join(root, V2B7_WORKBOOK_RELATIVE)),
    workbookVerification: existsSync(join(privateStore, PRIVATE_FILES.workbookVerification)) ? readJson(join(privateStore, PRIVATE_FILES.workbookVerification)) : null,
  };
}

export function rebuildV2B7DerivedArtifacts(root) {
  const results = readV2B7Results(root);
  const searchRuns = [...results.primarySearch, ...results.repeatSearch];
  const effectiveReceipts = searchRuns.map((searchRun) => {
    const work = results.manifest.sample.find((item) => item.canarySlotId === searchRun.canarySlotId);
    if (!searchRun.sourceRecords.length) return blockedEffectiveReceipt(work, searchRun);
    const attempts = results.physicalReceipts.filter((receipt) => receipt.runKind === searchRun.runKind
      && receipt.canarySlotId === searchRun.canarySlotId);
    return selectV2B7EffectiveReceipt(attempts, { work, searchRun });
  });
  atomicWriteNdjson(join(results.privateStore, PRIVATE_FILES.relayReceipts), [...results.physicalReceipts, ...effectiveReceipts]);
  const evidenceRecords = effectiveReceipts.flatMap((receipt) => (receipt.normalizedResponse?.claims ?? []).map((claim) => ({
    schema: "m2.v2.v2b7-private-evidence-record.v0.2",
    privateOnly: true,
    canarySlotId: receipt.canarySlotId,
    runKind: receipt.runKind,
    requestedModelId: receipt.requestedModelId,
    sourceRecordSetDigest: receipt.sourceRecordSetDigest,
    ...claim,
  })));
  atomicWriteNdjson(join(results.privateStore, PRIVATE_FILES.evidenceRecords), evidenceRecords);
  const context = runtimeContextForPersistence({ ...results, effectiveReceipts, evidenceRecords }, root);
  evaluateAndPersist(context, {
    primarySearch: results.primarySearch,
    repeatSearch: results.repeatSearch,
    physicalReceipts: results.physicalReceipts,
    effectiveReceipts,
    allTestsPassed: readValidationPassed(results.privateStore),
  });
  const rebuilt = readV2B7Results(root);
  writeV2B7PublicReports(root, rebuilt);
  return rebuilt;
}

export function writeV2B7PublicReports(root, supplied = null) {
  const results = supplied ?? readV2B7Results(root);
  const bundle = buildPublicReportBundle(results);
  const outputs = {
    [PUBLIC_REPORTS.executionJson]: `${JSON.stringify(bundle.execution, null, 2)}\n`,
    [PUBLIC_REPORTS.executionMarkdown]: renderExecutionMarkdown(bundle.execution),
    [PUBLIC_REPORTS.qualityJson]: `${JSON.stringify(bundle.quality, null, 2)}\n`,
    [PUBLIC_REPORTS.qualityMarkdown]: renderQualityMarkdown(bundle.quality),
    [PUBLIC_REPORTS.reproducibilityJson]: `${JSON.stringify(bundle.reproducibility, null, 2)}\n`,
    [PUBLIC_REPORTS.reproducibilityMarkdown]: renderReproducibilityMarkdown(bundle.reproducibility),
    [PUBLIC_REPORTS.costJson]: `${JSON.stringify(bundle.cost, null, 2)}\n`,
    [PUBLIC_REPORTS.costMarkdown]: renderCostMarkdown(bundle.cost),
    [PUBLIC_REPORTS.decisionJson]: `${JSON.stringify(bundle.decision, null, 2)}\n`,
    [PUBLIC_REPORTS.decisionMarkdown]: renderDecisionMarkdown(bundle.decision),
    [PUBLIC_REPORTS.nextStepJson]: `${JSON.stringify(bundle.nextStep, null, 2)}\n`,
    [PUBLIC_REPORTS.nextStepMarkdown]: renderNextStepMarkdown(bundle.nextStep),
  };
  for (const [relative, content] of Object.entries(outputs)) {
    assertPublicV2B7Sanitized(content);
    atomicWriteText(join(root, relative), content);
  }
  return { publicReports: Object.keys(outputs), bundle };
}

export function recordV2B7WorkbookVerification(root) {
  const frozen = readV2B7FrozenContract(root);
  const workbookPath = join(root, V2B7_WORKBOOK_RELATIVE);
  const actual = verifyIndependentWorkbookObject(root, V2B7_WORKBOOK_RELATIVE);
  const payload = {
    schema: "m2.v2.v2b7-workbook-verification-private.v0.2",
    privateOnly: true,
    verifiedAt: new Date().toISOString(),
    exists: existsSync(workbookPath),
    verificationBasis: actual.verificationBasis,
    generatorAssertionsTrusted: actual.generatorAssertionsTrusted,
    independentObjectVerified: actual.passed,
    verificationIssues: actual.issues,
    workbookSha256: actual.workbookSha256 ?? null,
    zipSignatureValid: actual.verificationBasis === "xlsx_zip_xml_actual_object" && actual.workbookSha256 != null,
    byteLength: actual.workbookByteLength ?? 0,
    sheetCount: actual.sheetCount ?? 0,
    formulaCount: actual.formulaCount ?? 0,
    formulaHyperlinkCount: actual.formulaHyperlinkCount ?? 0,
    nativeHyperlinkCount: actual.nativeHyperlinkCount ?? actual.hyperlinkCount ?? 0,
    formulaErrorCount: actual.formulaErrorCount ?? actual.cachedFormulaErrorCount ?? 0,
    dataValidationCount: actual.dataValidationCount ?? actual.validationCount ?? 0,
    visualRenderVerified: false,
    visualReviewAttested: false,
    visualReviewStatus: "NOT_PERFORMED",
    ignoredAndUntracked: privatePathIgnoredAndUntracked(root, V2B7_WORKBOOK_RELATIVE),
    containsPrivateRows: null,
    full160Authorized: false,
  };
  const receipt = { ...payload, receiptDigest: sha256(payload) };
  atomicWriteJson(join(frozen.privateStore, PRIVATE_FILES.workbookVerification), receipt);
  return receipt;
}

export function verifyV2B7(root) {
  const requestIntegrity = validateVerifierRequestIntegrity(root, {
    scope: V2B7_REQUEST_LEDGER_STAGE,
    eventStage: V2B7_REQUEST_LEDGER_STAGE,
    requiredAtomicRoles: V2B7_VERIFIER_ATOMIC_ROLES,
    legacyStateRelativePath: `${V2B7_PRIVATE_RELATIVE}/${PRIVATE_FILES.state}`,
    requireClosedBinding: true,
  });
  if (!requestIntegrity.valid) return v2b7RequestIntegrityFailure(requestIntegrity);
  const results = readV2B7Results(root);
  const issues = [];
  const gitBoundary = auditGitBoundary(root);
  if (!gitBoundary.auditSucceeded) issues.push("git_boundary_audit_failed");
  if (!gitBoundary.b4Unchanged) issues.push("b4_boundary_changed_or_unverified");
  if (!gitBoundary.holdoutSealed) issues.push("holdout_boundary_changed_or_unverified");
  const invariant = evaluateV2B7FreezeInvariants({
    original: results.original,
    manifest: results.manifest,
    bundle: results.bundle,
    b5State: readJson(join(root, "data/private-output/m2-v2-evidence-pilot/v2-b5-independent-search-canary/v2b5-execution-state-private-v0.1.json")),
    b6State: readJson(join(root, "data/private-output/m2-v2-evidence-pilot/v2-b6-extraction-remediation/v2b6-execution-state-private-v0.1.json")),
  });
  if (!invariant.allPassed) issues.push(...invariant.issues);
  if (results.state.tavily.physicalRequestCount > V2B7_TAVILY_REQUEST_CAP) issues.push("tavily_cap_exceeded");
  if (results.state.relay.physicalRequestCount > V2B7_RELAY_REQUEST_CAP || results.state.relay.repairCount > V2B7_MAX_REPAIRS) issues.push("relay_cap_exceeded");
  for (const provider of ["tavily", "relay"]) {
    const reservations = Object.values(results.state[provider].reservations ?? {});
    if (reservations.length !== results.state[provider].physicalRequestCount) issues.push(`${provider}_reservation_count_mismatch`);
  }
  if (results.state.full160Authorized !== false || results.evaluation.full160Authorized !== false) issues.push("full160_invariant_failed");
  if (results.physicalReceipts.some((receipt) => receipt.requestedModelId !== V2B7_MODEL_ID || receipt.searchToolUsed !== false)) issues.push("model_or_tool_route_invalid");
  if (results.physicalReceipts.some((receipt) => receipt.rawResponsePersisted !== false || receipt.apiKeyPersisted !== false)) issues.push("secret_or_raw_persistence_invalid");
  if (results.sourceRecords.some((record) => !validateV2B5SourceRecord(stripRunFields(record)).valid)) issues.push("source_record_contract_invalid");
  if (results.evidenceRecords.some((record) => record.researchApproved !== false || record.modelEligible !== false || record.researchOnly !== true)) issues.push("evidence_governance_promotion_detected");
  const pilotCount = results.evidenceRecords.filter((record) => record.pilotUsable === true).length;
  if (pilotCount > 0) {
    if (!results.workbookExists) issues.push("required_workbook_missing");
    if (results.workbookVerification?.independentObjectVerified !== true
      || results.workbookVerification?.generatorAssertionsTrusted !== false
      || results.workbookVerification?.zipSignatureValid !== true || results.workbookVerification?.formulaErrorCount !== 0
      || results.workbookVerification?.ignoredAndUntracked !== true) issues.push("workbook_verification_failed");
  }
  if (!privateStoreIgnoredAndUntracked(root)) issues.push("private_store_not_ignored_or_untracked");
  for (const relative of Object.values(PUBLIC_REPORTS)) {
    if (!existsSync(join(root, relative))) issues.push(`public_report_missing:${relative}`);
    else {
      try { assertPublicV2B7Sanitized(readFileSync(join(root, relative), "utf8")); } catch (error) { issues.push(safeToken(error?.message)); }
    }
  }
  const payload = {
    schema: "m2.v2.v2b7-verification-verdict.v0.2",
    allPassed: issues.length === 0,
    issues: unique(issues),
    newTavilyPhysicalRequestCount: results.state.tavily.physicalRequestCount,
    cumulativeTavilyPhysicalRequestCount: results.state.priorCounters.cumulativeTavily + results.state.tavily.physicalRequestCount,
    newRelayPhysicalRequestCount: results.state.relay.physicalRequestCount,
    cumulativeRelayPhysicalRequestCount: results.state.priorCounters.cumulativeRelay + results.state.relay.physicalRequestCount,
    decision: results.evaluation.decision,
    requestStateBindingVerified: true,
    requestEventLedgerVerified: requestIntegrity.requestEventLedgerVerified,
    requestCounterReplayVerified: requestIntegrity.requestCounterReplayVerified,
    currentClosedBindingVerified: requestIntegrity.closedBindingPresent
      ? requestIntegrity.closedBindingVerified
      : null,
    full160Authorized: false,
  };
  const receipt = { ...payload, receiptDigest: sha256(payload) };
  return receipt;
}

function v2b7RequestIntegrityFailure(integrity) {
  const payload = {
    schema: "m2.v2.v2b7-verification-verdict.v0.2",
    allPassed: false,
    issues: integrity.issues.map((issue) => `request_integrity:${issue}`),
    newTavilyPhysicalRequestCount: null,
    cumulativeTavilyPhysicalRequestCount: null,
    newRelayPhysicalRequestCount: null,
    cumulativeRelayPhysicalRequestCount: null,
    decision: null,
    requestStateBindingVerified: false,
    requestEventLedgerVerified: integrity.requestEventLedgerVerified === true,
    requestCounterReplayVerified: integrity.requestCounterReplayVerified === true,
    currentClosedBindingVerified: integrity.closedBindingPresent
      ? integrity.closedBindingVerified
      : null,
    full160Authorized: false,
  };
  return { ...payload, receiptDigest: sha256(payload) };
}

function loadV2B7Configuration(root, suppliedEnv = null) {
  const env = suppliedEnv ?? { ...readEnvLocal(join(root, ".env.local")), ...process.env };
  const config = {
    tavily: {
      baseUrl: String(env.M2_V2_TAVILY_BASE_URL ?? "https://api.tavily.com").trim().replace(/\/+$/u, ""),
      apiKey: String(env.TAVILY_API_KEY ?? ""),
    },
    relay: {
      baseUrl: String(env.OPENAI_BASE_URL ?? env.M2_V2_EVIDENCE_API_BASE_URL ?? "").trim().replace(/\/+$/u, ""),
      approvedHost: String(env.M2_V2_APPROVED_RELAY_HOST ?? "").trim().toLocaleLowerCase("en-US"),
      apiKey: String(env.OPENAI_API_KEY ?? ""),
    },
  };
  if (env.M2_V2_SEARCH_PROVIDER !== "tavily_structured_search") throw new Error("v2b7_search_provider_invalid");
  if (config.tavily.baseUrl !== "https://api.tavily.com" || !config.tavily.apiKey) throw new Error("v2b7_tavily_configuration_incomplete");
  if (!config.relay.baseUrl || !config.relay.approvedHost || !config.relay.apiKey) throw new Error("v2b7_relay_configuration_incomplete");
  const transport = bindProviderTransport(config.relay);
  config.relay.baseUrl = transport.baseUrl;
  config.relay.approvedHost = transport.approvedHost;
  return config;
}

async function runPrimarySearch(context) {
  const bundleByIdentity = new Map(context.frozen.bundle.works.map((work) => [work.identityDigest, work]));
  const runs = [];
  for (const [index, work] of context.frozen.manifest.sample.entries()) {
    context.onProgress({ phase: "canary_v3", stage: "search", runKind: "primary", workOrdinal: index + 1 });
    const frozenWork = bundleByIdentity.get(work.identityDigest);
    if (frozenWork) {
      runs.push({
        schema: "m2.v2.v2b7-work-search-run.v0.2",
        privateOnly: true,
        runKind: "primary",
        workOrdinal: index + 1,
        canarySlotId: work.canarySlotId,
        identityDigest: work.identityDigest,
        sourceOrigin: "frozen_benchmark_bundle_reuse",
        physicalTavilyRequestCount: 0,
        queries: [],
        sourceRecords: frozenWork.sourceRecords,
        sourceRecordCount: frozenWork.sourceRecordCount,
        sourceRecordSetDigest: frozenWork.sourceRecordSetDigest,
        logicalSearchSuccess: true,
        prohibitedSourceCount: 0,
        full160Authorized: false,
      });
    } else {
      runs.push(await runLiveWorkSearch(context, work, "primary", index + 1));
    }
  }
  return runs;
}

async function runRepeatSearch(context) {
  const repeatSlots = new Set(context.frozen.manifest.repeatSample.map((item) => item.canarySlotId));
  const works = context.frozen.manifest.sample.filter((work) => repeatSlots.has(work.canarySlotId));
  const runs = [];
  for (const [index, work] of works.entries()) {
    context.onProgress({ phase: "canary_v3", stage: "search", runKind: "repeat", workOrdinal: index + 1 });
    runs.push(await runLiveWorkSearch(context, work, "repeat", index + 1));
  }
  return runs;
}

async function runLiveWorkSearch(context, work, runKind, workOrdinal) {
  const plans = buildV2B7WorkQueries(work, runKind);
  const queryValidation = validateV2B7OutboundQueryPlans(plans);
  if (!queryValidation.valid) throw new Error(`v2b7_query_plan_invalid:${queryValidation.issues.join(",")}`);
  const queries = [];
  for (const plan of plans) queries.push(await executeTavilyQuery(context, plan));
  const observed = queries.flatMap((query) => query.sourceRecords ?? []);
  const allowed = observed.filter((record) => !classifyV2B5ProhibitedSource(record).prohibited);
  const prohibitedSourceCount = observed.length - allowed.length;
  const sourceRecords = allowed.length ? mergeAndLimitV2B5SourceRecords(allowed, 6) : [];
  const set = buildV2B5SourceRecordSet(sourceRecords);
  return {
    schema: "m2.v2.v2b7-work-search-run.v0.2",
    privateOnly: true,
    runKind,
    workOrdinal,
    canarySlotId: work.canarySlotId,
    identityDigest: work.identityDigest,
    sourceOrigin: "v2b7_independent_tavily_search",
    physicalTavilyRequestCount: queries.filter((query) => query.cacheHit !== true && query.dispatched === true).length,
    queries,
    sourceRecords,
    sourceRecordCount: sourceRecords.length,
    sourceRecordSetDigest: set.sourceRecordSetDigest,
    logicalSearchSuccess: queries.some((query) => query.contractValid === true) && sourceRecords.length > 0,
    prohibitedSourceCount,
    full160Authorized: false,
  };
}

async function executeTavilyQuery(context, plan) {
  const descriptor = buildV2B5TavilyCacheDescriptor({
    queryDigest: sha256(plan.queryText),
    executionNamespace: plan.executionNamespace,
    baseUrl: context.config.tavily.baseUrl,
    searchDepth: "basic",
    topic: "general",
    country: "china",
    maxResults: 6,
    includeUsage: false,
  });
  const physicalKey = `tavily:${descriptor.cacheKey}`;
  const cached = context.tavilyCache.entries[descriptor.cacheKey];
  if (cached) {
    recordCacheHit(context, "tavily", physicalKey, descriptor, cached);
    return { ...cached, cacheHit: true };
  }
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
    const providerResult = await context.tavily.search({
      queryId: plan.queryId,
      queryText: plan.queryText,
      sourceTypeCandidate: plan.sourceType,
      includeUsage: false,
      maxResults: 6,
      cacheKey: descriptor.cacheKey,
      retryCount: 0,
    });
    result = {
      schema: "m2.v2.v2b7-tavily-query-execution.v0.2",
      privateOnly: true,
      executionNamespace: plan.executionNamespace,
      runKind: plan.runKind,
      canarySlotId: plan.canarySlotId,
      queryId: plan.queryId,
      queryText: plan.queryText,
      intent: plan.intent,
      cacheKey: descriptor.cacheKey,
      cacheHit: false,
      dispatched: providerResult.dispatched !== false,
      httpStatus: providerResult.providerReceipt?.httpStatus ?? null,
      httpSuccess: providerResult.providerConnectivityPassed === true,
      contractValid: providerResult.contractValid === true,
      status: providerResult.status,
      resultCount: providerResult.providerReceipt?.resultCount ?? 0,
      sourceRecords: providerResult.sourceRecords,
      providerReceipt: providerResult.providerReceipt,
      responseTimeMs: providerResult.providerReceipt?.responseTimeMs ?? null,
      usageCredits: providerResult.providerReceipt?.usageCredits ?? null,
      issues: providerResult.issues,
      rawResponsePersisted: false,
      full160Authorized: false,
    };
  } catch (error) {
    result = {
      schema: "m2.v2.v2b7-tavily-query-execution.v0.2",
      privateOnly: true,
      executionNamespace: plan.executionNamespace,
      runKind: plan.runKind,
      canarySlotId: plan.canarySlotId,
      queryId: plan.queryId,
      queryText: plan.queryText,
      intent: plan.intent,
      cacheKey: descriptor.cacheKey,
      cacheHit: false,
      dispatched: true,
      httpStatus: null,
      httpSuccess: false,
      contractValid: false,
      status: "transport_error",
      resultCount: 0,
      sourceRecords: [],
      providerReceipt: null,
      responseTimeMs: null,
      usageCredits: null,
      issues: [safeToken(error?.message)],
      rawResponsePersisted: false,
      full160Authorized: false,
    };
  }
  context.tavilyCache.entries[descriptor.cacheKey] = result;
  completeRequest(context, "tavily", physicalKey, result);
  return result;
}

async function executeExtractionAttempt(context, input) {
  const descriptor = {
    namespace: V2B7_NAMESPACE,
    runKind: input.searchRun.runKind,
    canarySlotId: input.work.canarySlotId,
    model: V2B7_MODEL_ID,
    attemptKind: input.attemptKind,
    sourceRecordSetDigest: input.searchRun.sourceRecordSetDigest,
    adapterVersion: V2B6_ADAPTER_VERSION,
    extractionMode: "full",
    structuredMode: "server_strict",
    schemaVersion: "m2.v2.evidence-extraction-output.v0.2",
    repairIssuesDigest: sha256(input.repairIssues ?? []),
  };
  const cacheKey = sha256(descriptor);
  const physicalKey = `relay:${cacheKey}`;
  const cached = context.relayCache.entries[cacheKey];
  if (cached) {
    recordCacheHit(context, "relay", physicalKey, descriptor, cached);
    return withReceiptRuntimeView(cached, { cacheHit: true });
  }
  const payload = buildV2B7ExtractionPayload({ work: input.work, sourceRecords: input.searchRun.sourceRecords, repairIssues: input.repairIssues });
  const existingReservation = context.state.relay.reservations[physicalKey];
  if (existingReservation?.status === "indeterminate_after_crash") {
    return persistExtractionReceipt(context, input, descriptor, cacheKey, physicalKey, payload, {
      json: null,
      requestStartedAt: existingReservation.dispatchStartedAt ?? existingReservation.reservedAt,
      responseReceivedAt: existingReservation.completedAt ?? context.now(),
      latencyMs: null,
      timeoutMs: V2B7_TIMEOUT_MS,
      timedOut: false,
      httpStatus: null,
      httpOk: false,
      status: "indeterminate_after_crash",
      contentTypeClass: "none",
      responseDigest: null,
      responseByteLength: 0,
      rawResponsePersisted: false,
    }, false);
  }
  reserveRequest(context, "relay", physicalKey, {
    cacheKey,
    ...descriptor,
    logicalKey: cacheKey,
    requestDigest: sha256({ provider: "relay", descriptor, payloadDigest: sha256(payload) }),
  });
  markRequestDispatched(context, "relay", physicalKey);
  const response = await dispatchV2B6RelayRequest({
    fetchImpl: context.fetchImpl,
    baseUrl: context.config.relay.baseUrl,
    approvedHost: context.config.relay.approvedHost,
    apiKey: context.config.relay.apiKey,
    payload,
    timeoutMs: V2B7_TIMEOUT_MS,
  });
  return persistExtractionReceipt(context, input, descriptor, cacheKey, physicalKey, payload, response);
}

function persistExtractionReceipt(context, input, descriptor, cacheKey, physicalKey, payload, response, complete = true) {
  const normalizedResponse = normalizeV2B6BenchmarkResponse(response.json, {
    sourceRecords: input.searchRun.sourceRecords,
    work: input.work,
    privateTokens: [input.work.identityDigest].filter(Boolean),
    governancePolicy: V2B5_DEFAULT_SOURCE_GOVERNANCE_POLICY,
  });
  const baseReceipt = buildV2B6Receipt({
    response,
    requestedModelId: V2B7_MODEL_ID,
    approvedAliases: {},
    phase: "canary_v3",
    logicalExtractionKey: sha256({ runKind: input.searchRun.runKind, canarySlotId: input.work.canarySlotId }),
    attemptKind: input.attemptKind,
    runKind: input.searchRun.runKind,
    canarySlotId: input.work.canarySlotId,
    sourceBundleDigest: V2B7_SOURCE_BUNDLE_DIGEST,
    sourceRecordSetDigest: input.searchRun.sourceRecordSetDigest,
    capabilityProfileDigest: "0f4766d040ed9b267c27383002d7a596c2003557833d53b23304c8454c9e7ba9",
    extractionMode: "full",
    structuredMode: "server_strict",
    requestPayload: payload,
    normalizedResponse,
  });
  const { receiptDigest: _discarded, ...basePayload } = baseReceipt;
  const receiptPayload = {
    ...basePayload,
    executionNamespace: V2B7_NAMESPACE,
    cacheKey,
    cacheHit: false,
    providerConnectivityPassed: response.httpOk === true && response.json !== null,
    providerContractCompatible: response.httpOk === true && response.json !== null,
    responseSchemaPass: normalizedResponse.structuredValid === true,
    repairIssueCodes: input.repairIssues ?? [],
    canaryExecuted: true,
    full160Authorized: false,
  };
  const receipt = { ...receiptPayload, receiptDigest: sha256(receiptPayload) };
  context.relayCache.entries[cacheKey] = receipt;
  if (complete) completeRequest(context, "relay", physicalKey, receipt);
  else checkpoint(context);
  return receipt;
}

function evaluateAndPersist(context, input) {
  const original = context.frozen.original;
  const manifest = context.frozen.manifest;
  const bundle = context.frozen.bundle;
  const invariant = evaluateV2B7FreezeInvariants({
    original,
    manifest,
    bundle,
    b5State: readJson(join(context.root, "data/private-output/m2-v2-evidence-pilot/v2-b5-independent-search-canary/v2b5-execution-state-private-v0.1.json")),
    b6State: readJson(join(context.root, "data/private-output/m2-v2-evidence-pilot/v2-b6-extraction-remediation/v2b6-execution-state-private-v0.1.json")),
  });
  const gitBoundary = auditGitBoundary(context.root);
  const evaluation = evaluateV2B7Canary({
    manifest,
    ...input,
    manifestUnchanged: invariant.allPassed && manifest.manifestDigest === V2B7_CANARY_MANIFEST_DIGEST,
    bundleUnchanged: invariant.allPassed && bundle.sourceBundleDigest === V2B7_SOURCE_BUNDLE_DIGEST,
    gitBoundary,
    validationPending: !existsSync(join(context.privateStore, PRIVATE_FILES.validation)),
    evaluatedAt: context.now(),
  });
  const reproducibility = {
    schema: "m2.v2.v2b7-reproducibility-private.v0.1",
    privateOnly: true,
    ...evaluation.metrics.reproducibility,
    full160Authorized: false,
  };
  const usage = buildUsageLedger(context.state, input.primarySearch, input.repeatSearch, input.physicalReceipts);
  atomicWriteJson(join(context.privateStore, PRIVATE_FILES.evaluation), evaluation);
  atomicWriteJson(join(context.privateStore, PRIVATE_FILES.reproducibility), reproducibility);
  atomicWriteJson(join(context.privateStore, PRIVATE_FILES.usage), usage);
  context.state.finalDecision = evaluation.decision;
  context.state.phase = input.allTestsPassed === true ? "completed" : "canary_completed_validation_pending";
  checkpoint(context);
  return evaluation;
}

function buildUsageLedger(state, primarySearch, repeatSearch, physicalReceipts) {
  const queryRows = [...primarySearch, ...repeatSearch].flatMap((run) => run.queries ?? []);
  const tavilyLatencies = queryRows.map((row) => row.responseTimeMs).filter(Number.isFinite);
  const relayLatencies = physicalReceipts.map((row) => row.latencyMs).filter(Number.isFinite);
  return {
    schema: "m2.v2.v2b7-usage-ledger-private.v0.1",
    privateOnly: true,
    tavily: {
      newPhysicalRequestCount: state.tavily.physicalRequestCount,
      cumulativePhysicalRequestCount: state.priorCounters.cumulativeTavily + state.tavily.physicalRequestCount,
      requestCap: state.tavily.cap,
      usageCredits: nullableSum(queryRows.map((row) => row.usageCredits)),
      p50LatencyMs: percentile(tavilyLatencies, 0.5),
      p90LatencyMs: percentile(tavilyLatencies, 0.9),
    },
    relay: {
      newPhysicalRequestCount: state.relay.physicalRequestCount,
      cumulativePhysicalRequestCount: state.priorCounters.cumulativeRelay + state.relay.physicalRequestCount,
      requestCap: state.relay.cap,
      repairCount: state.relay.repairCount,
      inputTokens: nullableSum(physicalReceipts.map((row) => row.usage?.inputTokens)),
      outputTokens: nullableSum(physicalReceipts.map((row) => row.usage?.outputTokens)),
      totalTokens: nullableSum(physicalReceipts.map((row) => row.usage?.totalTokens)),
      p50LatencyMs: percentile(relayLatencies, 0.5),
      p90LatencyMs: percentile(relayLatencies, 0.9),
      estimatedRelayCost: null,
      estimatedRelayCostStatus: "third_party_relay_price_not_proven",
    },
    officialOpenAiPricingApplied: false,
    full160Authorized: false,
  };
}

function buildPublicReportBundle(results) {
  const metrics = results.evaluation.metrics;
  const common = { status: "not_for_formal_decision", full160Authorized: false };
  const execution = {
    schema: "m2.v2.canary-v3-execution-summary-public.v0.2",
    ...common,
    startSha: V2B7_START_SHA,
    manifestDigest: V2B7_CANARY_MANIFEST_DIGEST,
    repeatDigest: V2B7_REPEAT_DIGEST,
    sourceBundleDigest: V2B7_SOURCE_BUNDLE_DIGEST,
    benchmarkCanaryOverlapCount: 4,
    fixedPrimaryWorkCount: 10,
    fixedRepeatWorkCount: 5,
    failedSamplesReplaced: false,
    frozenPrimaryReuseWorkCount: metrics.search.frozenPrimaryReuseWorkCount,
    newTavilyPhysicalRequestCount: results.state.tavily.physicalRequestCount,
    cumulativeTavilyPhysicalRequestCount: results.usage.tavily.cumulativePhysicalRequestCount,
    newRelayPhysicalRequestCount: results.state.relay.physicalRequestCount,
    cumulativeRelayPhysicalRequestCount: results.usage.relay.cumulativePhysicalRequestCount,
    repairCount: results.state.relay.repairCount,
    defaultModel: V2B7_MODEL_ID,
    escalationModel: V2B7_MODEL_ID,
    lunaStatus: "blocked_not_used",
    canaryExecuted: true,
    noBrowserComputerUseOrRelaySearch: true,
  };
  const quality = {
    schema: "m2.v2.canary-v3-quality-report-public.v0.2",
    ...common,
    search: metrics.search,
    extraction: metrics.extraction,
    entity: metrics.entity,
    evidence: metrics.evidence,
    citationTimeGovernance: metrics.citationTimeGovernance,
    safetyGates: results.evaluation.safetyGates,
    usabilityGates: results.evaluation.usabilityGates,
    searchDecision: results.evaluation.searchDecision,
    extractionDecision: results.evaluation.extractionDecision,
    evidenceUsabilityDecision: results.evaluation.evidenceUsabilityDecision,
    privateWorkbookGenerated: results.workbookExists === true,
    privateWorkbookVerificationPassed: results.workbookVerification?.independentObjectVerified === true
      && results.workbookVerification?.generatorAssertionsTrusted === false
      && results.workbookVerification?.zipSignatureValid === true
      && results.workbookVerification?.formulaErrorCount === 0
      && results.workbookVerification?.ignoredAndUntracked === true,
    researchApprovedCount: 0,
    modelEligibleCount: 0,
  };
  const reproducibility = {
    schema: "m2.v2.canary-v3-reproducibility-report-public.v0.1",
    ...common,
    expectedPairCount: 5,
    meanSourceOverlap: metrics.reproducibility.meanSourceOverlap,
    medianSourceOverlap: metrics.reproducibility.medianSourceOverlap,
    exactSourceSetMatchCount: metrics.reproducibility.exactSourceSetMatchCount,
    claimAgreement: metrics.reproducibility.claimAgreement,
    claimAgreementEvaluableCount: metrics.reproducibility.claimAgreementEvaluableCount,
    claimAgreementNotEvaluableCount: metrics.reproducibility.claimAgreementNotEvaluableCount,
    structuredValueAgreement: metrics.reproducibility.structuredValueAgreement,
    confidenceDrift: metrics.reproducibility.confidenceDrift,
    contradictionDriftCount: metrics.reproducibility.contradictionDriftCount,
    perPair: metrics.reproducibility.perPair.map((pair) => ({
      anonymousPairId: pair.anonymousPairId,
      sourceOverlap: pair.sourceOverlap,
      exactSourceSetMatch: pair.exactSourceSetMatch,
      pilotUsableClaimAgreement: pair.pilotUsableClaimAgreement,
      pilotUsableClaimAgreementStatus: pair.pilotUsableClaimAgreementStatus,
      structuredValueAgreement: pair.structuredValueAgreement,
      confidenceDrift: pair.confidenceDrift,
      contradictionDrift: pair.contradictionDrift,
    })),
  };
  const cost = {
    schema: "m2.v2.canary-v3-cost-latency-report-public.v0.1",
    ...common,
    tavily: results.usage.tavily,
    relay: results.usage.relay,
    officialOpenAiPricingApplied: false,
  };
  const decision = {
    schema: "m2.v2.canary-v3-decision-public.v0.2",
    ...common,
    searchDecision: results.evaluation.searchDecision,
    extractionDecision: results.evaluation.extractionDecision,
    evidenceUsabilityDecision: results.evaluation.evidenceUsabilityDecision,
    canaryDecision: results.evaluation.decision,
    safetyPassed: results.evaluation.safetyPassed,
    usabilityPassed: results.evaluation.usabilityPassed,
    blockerIds: results.evaluation.blockerIds,
    nextStep: results.evaluation.nextStep,
    privateWorkbookGenerated: results.workbookExists === true,
    modelTrainingPerformed: false,
    b4Changed: false,
    finalHoldoutOpened: false,
    enteredV2COrV2D: false,
    enteredC4OrM3: false,
    released: false,
  };
  const nextStep = {
    schema: "m2.v2.v2b7-next-step-public.v0.1",
    ...common,
    currentDecision: results.evaluation.decision,
    nextStep: results.evaluation.nextStep,
    scaleUpPerformed: false,
    prohibitedNextPhases: ["full160", "V2-C", "V2-D", "C4", "M3", "release"],
  };
  return { execution, quality, reproducibility, cost, decision, nextStep };
}

function runV2B7FullValidation(root, options = {}) {
  const commands = [
    ["npm", ["run", "check:no-real-data"]],
    ["npm", ["run", "lint"]],
    ["npm", ["run", "build"]],
    ["npm", ["test"]],
    ["npm", ["run", "smoke"]],
    ["npm", ["run", "test:e2e"]],
    ["npm", ["run", "m2:v2:v2b5:verify"]],
    ["npm", ["run", "m2:v2:v2b7:check"]],
  ];
  const rows = [];
  for (const [program, args] of commands) {
    options.onProgress?.({ stage: "validation", command: [program, ...args].join(" ") });
    const startedAt = new Date().toISOString();
    const started = Date.now();
    const executable = process.platform === "win32" && program === "npm" ? process.execPath : program;
    const spawnArgs = process.platform === "win32" && program === "npm"
      ? [process.env.npm_execpath, ...args].filter(Boolean) : args;
    const result = spawnSync(executable, spawnArgs, {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      timeout: 15 * 60_000,
      maxBuffer: 25 * 1024 * 1024,
    });
    rows.push({
      command: [program, ...args].join(" "),
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      exitCode: result.status,
      passed: result.status === 0,
      stdoutDigest: sha256(String(result.stdout ?? "")),
      stderrDigest: sha256(String(result.stderr ?? "")),
      rawOutputPersisted: false,
    });
    if (result.status !== 0) break;
  }
  const payload = {
    schema: "m2.v2.v2b7-full-validation-receipt-private.v0.1",
    privateOnly: true,
    completedAt: new Date().toISOString(),
    expectedCommandCount: commands.length,
    executedCommandCount: rows.length,
    allPassed: rows.length === commands.length && rows.every((row) => row.passed),
    commands: rows,
    full160Authorized: false,
  };
  const receipt = { ...payload, receiptDigest: sha256(payload) };
  const privateStore = join(root, V2B7_PRIVATE_RELATIVE);
  atomicWriteJson(join(privateStore, PRIVATE_FILES.validation), receipt);
  return receipt;
}

function runtimeContextForPersistence(results, root) {
  return {
    root,
    privateStore: results.privateStore,
    frozen: results,
    state: results.state,
    tavilyCache: readJson(join(results.privateStore, PRIVATE_FILES.tavilyCache)),
    relayCache: readJson(join(results.privateStore, PRIVATE_FILES.relayCache)),
    now: () => new Date().toISOString(),
  };
}

function projectV2B7ExtractionSources(sourceRecords) {
  const rows = Array.isArray(sourceRecords) ? sourceRecords.slice(0, 6) : [];
  let remaining = 3_000;
  return rows.map((record) => {
    const snippet = [...stripUrlLiterals(cleanText(record.snippet, remaining))].slice(0, remaining).join("");
    remaining -= [...snippet].length;
    return {
      sourceId: record.sourceId,
      title: stripUrlLiterals(cleanText(record.title, 500)),
      domain: cleanText(record.domain, 255),
      snippet,
      capturedAt: record.capturedAt,
      availableAt: record.availableAt,
    };
  });
}

function sanitizeRepairIssues(values) {
  return unique((Array.isArray(values) ? values : [])
    .map((value) => safeToken(value))
    .filter((value) => value && REPAIRABLE_ISSUE_PATTERNS.some((pattern) => pattern.test(value))))
    .slice(0, 20);
}

function repairIssueCodes(receipt) {
  return sanitizeRepairIssues([...(receipt.normalizedResponse?.issues ?? []), ...(receipt.normalizedResponse?.carrierIssues ?? [])]);
}

function compareClaimSets(primaryClaims, repeatClaims, primarySources, repeatSources) {
  if (!primaryClaims.length || !repeatClaims.length) return { status: "not_evaluable", value: null, structuredValueAgreement: null };
  const primary = new Set(primaryClaims.map((claim) => claimComparisonSignature(claim, primarySources)));
  const repeat = new Set(repeatClaims.map((claim) => claimComparisonSignature(claim, repeatSources)));
  const primaryValues = new Set(primaryClaims.map((claim) => structuredValueSignature(claim)));
  const repeatValues = new Set(repeatClaims.map((claim) => structuredValueSignature(claim)));
  return { status: "evaluable", value: jaccard(primary, repeat), structuredValueAgreement: jaccard(primaryValues, repeatValues) };
}

function claimComparisonSignature(claim, sourceMap) {
  const categories = unique((claim.supportingSourceIds ?? []).map((id) => domainCategory(sourceMap.get(id))).filter(Boolean)).sort();
  return sha256({ claimType: claim.claimType, structuredValue: claim.structuredValue, domainCategories: categories });
}

function structuredValueSignature(claim) {
  return sha256({ claimType: claim.claimType, structuredValue: claim.structuredValue });
}

function domainCategory(source) {
  if (!source) return "unknown";
  const domain = String(source.domain ?? "").toLowerCase();
  if (domain.endsWith(".gov.cn") || domain.endsWith(".gov")) return "government_or_public";
  if (domain.endsWith(".edu.cn") || domain.endsWith(".edu")) return "education_or_research";
  if (/publisher|press|book|出版/u.test(`${domain} ${source.sourceTypeCandidate ?? ""}`)) return "publisher_or_book";
  if (/platform|original|web|novel/u.test(String(source.sourceTypeCandidate ?? ""))) return "content_platform";
  return "public_web_other";
}

function claimConfidenceDrift(primaryClaims, repeatClaims, primarySources, repeatSources) {
  const primary = new Map(primaryClaims.filter((claim) => claim.pilotUsable).map((claim) => [claimComparisonSignature(claim, primarySources), claim.confidence]));
  const values = repeatClaims.filter((claim) => claim.pilotUsable)
    .map((claim) => primary.has(claimComparisonSignature(claim, repeatSources))
      ? Math.abs(Number(claim.confidence) - Number(primary.get(claimComparisonSignature(claim, repeatSources)))) : null)
    .filter(Number.isFinite);
  return average(values);
}

function contradictionDrift(primaryReceipt, repeatReceipt) {
  const signature = (receipt) => canonicalJson((receipt?.normalizedResponse?.contradictions ?? [])
    .map((item) => ({ status: item.status, claimCount: item.claimIds?.length ?? 0 }))
    .sort((left, right) => left.status.localeCompare(right.status)));
  return signature(primaryReceipt) === signature(repeatReceipt) ? 0 : 1;
}

function blockedEffectiveReceipt(work, searchRun) {
  const payload = {
    schema: "m2.v2.v2b7-extraction-effective-receipt.v0.2",
    privateOnly: true,
    phase: "canary_v3_effective",
    executionNamespace: V2B7_NAMESPACE,
    runKind: searchRun.runKind,
    canarySlotId: work.canarySlotId,
    requestedModelId: V2B7_MODEL_ID,
    returnedModelId: null,
    modelBindingStatus: "unreported",
    modelBindingVerified: false,
    providerContractCompatible: false,
    adapterVersion: V2B6_ADAPTER_VERSION,
    extractionMode: "full",
    structuredMode: "server_strict",
    timeoutMs: V2B7_TIMEOUT_MS,
    sourceRecordSetDigest: searchRun.sourceRecordSetDigest,
    schemaVersion: "m2.v2.evidence-extraction-output.v0.2",
    physicalRequestCount: 0,
    physicalReceiptDigests: [],
    selectedAttemptKind: null,
    effectiveSelectionRule: "source_records_missing_blocks_extraction",
    dispatched: false,
    timedOut: false,
    latencyMs: null,
    usage: { inputTokens: null, outputTokens: null, totalTokens: null },
    normalizedResponse: null,
    status: "source_records_missing",
    searchToolUsed: false,
    tavilyRequestUsed: false,
    canaryExecuted: true,
    full160Authorized: false,
  };
  return { ...payload, receiptDigest: sha256(payload) };
}

function effectiveSchemaPass(receipt) {
  return receipt?.modelBindingVerified === true && receipt?.providerContractCompatible === true
    && receipt?.normalizedResponse?.structuredValid === true;
}

function newCache(kind, contractDigest) {
  return { schema: `m2.v2.v2b7-${kind}-cache-private.v0.1`, privateOnly: true, contractDigest, entries: {} };
}

function assertRuntimeContainers(state, tavilyCache, relayCache, contract) {
  if (state.contractDigest !== contract.contractDigest || tavilyCache.contractDigest !== contract.contractDigest || relayCache.contractDigest !== contract.contractDigest) {
    throw new Error("v2b7_runtime_contract_mismatch");
  }
  if (state.tavily.cap !== V2B7_TAVILY_REQUEST_CAP || state.relay.cap !== V2B7_RELAY_REQUEST_CAP) throw new Error("v2b7_runtime_cap_changed");
  if (state.full160Authorized !== false) throw new Error("v2b7_runtime_full160_changed");
}

function reserveRequest(context, provider, physicalKey, metadata) {
  const budget = context.state[provider];
  if (budget.physicalRequestCount >= budget.cap) throw new Error(`v2b7_${provider}_request_cap_reached`);
  if (budget.reservations[physicalKey]) throw new Error(`v2b7_${provider}_reservation_exists`);
  const reservedAt = context.now();
  const logicalKey = metadata.logicalKey ?? physicalKey;
  const requestDigest = metadata.requestDigest ?? sha256({ stage: V2B7_REQUEST_LEDGER_STAGE, provider, physicalKey });
  appendRuntimeRequestEvent(context.state, {
    timestamp: reservedAt, provider, stage: V2B7_REQUEST_LEDGER_STAGE, logicalKey, physicalKey,
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
    timestamp: reservedAt, provider, stage: V2B7_REQUEST_LEDGER_STAGE, logicalKey, physicalKey,
    eventType: "reserved", requestDigest, receiptDigest: null,
  });
  checkpoint(context);
}

function markRequestDispatched(context, provider, physicalKey) {
  const reservation = context.state[provider].reservations[physicalKey];
  if (!reservation || reservation.status !== "reserved_before_dispatch") {
    throw new Error(`v2b7_${provider}_reservation_not_dispatchable`);
  }
  const timestamp = context.now();
  reservation.status = "dispatch_started";
  reservation.dispatchStartedAt = timestamp;
  appendReservationEvent(context.state, provider, physicalKey, reservation, "dispatched", timestamp, null);
  checkpoint(context);
}

function completeRequest(context, provider, physicalKey, result) {
  const reservation = context.state[provider].reservations[physicalKey];
  if (!reservation) throw new Error(`v2b7_${provider}_reservation_missing`);
  const timestamp = context.now();
  appendReservationEvent(context.state, provider, physicalKey, reservation, "completed", timestamp, resultDigest(result));
  reservation.status = "completed";
  reservation.completedAt = timestamp;
  reservation.resultDigest = sha256(result);
  checkpoint(context);
}

function reconcileIndeterminateReservations(state, tavilyCache, relayCache, timestamp) {
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
  const requestDigest = sha256({ stage: V2B7_REQUEST_LEDGER_STAGE, provider, request });
  appendRuntimeRequestEvent(context.state, {
    timestamp, provider, stage: V2B7_REQUEST_LEDGER_STAGE, logicalKey, physicalKey,
    eventType: "planned", requestDigest, receiptDigest: null,
  });
  appendRuntimeRequestEvent(context.state, {
    timestamp, provider, stage: V2B7_REQUEST_LEDGER_STAGE, logicalKey, physicalKey,
    eventType: "cache_hit_observed", requestDigest, receiptDigest: resultDigest(result),
  });
  checkpoint(context);
}

function appendReservationEvent(state, provider, physicalKey, reservation, eventType, timestamp, receiptDigest) {
  appendRuntimeRequestEvent(state, {
    timestamp,
    provider,
    stage: V2B7_REQUEST_LEDGER_STAGE,
    logicalKey: reservation.logicalKey ?? reservation.cacheKey ?? physicalKey,
    physicalKey,
    eventType,
    requestDigest: reservation.requestDigest ?? sha256({ stage: V2B7_REQUEST_LEDGER_STAGE, provider, physicalKey }),
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
  assertRuntimeRequestLedgerState(context.state, V2B7_REQUEST_LEDGER_STAGE);
  commitAtomicRequestCheckpoint(context.root, {
    scope: "v2b7",
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
      contractDigest: context.frozen?.privateContract?.contractDigest ?? null,
    },
  });
  atomicWriteJson(join(context.privateStore, PRIVATE_FILES.state), context.state);
  atomicWriteJson(join(context.privateStore, PRIVATE_FILES.tavilyCache), context.tavilyCache);
  atomicWriteJson(join(context.privateStore, PRIVATE_FILES.relayCache), context.relayCache);
}

function searchArtifact(runKind, runs) {
  return {
    schema: `m2.v2.v2b7-canary-v3-${runKind}-search-private.v0.2`,
    privateOnly: true,
    runKind,
    workCount: runs.length,
    runs,
    full160Authorized: false,
  };
}

function auditGitBoundary(root) {
  const result = spawnSync("git", ["diff", "--name-only", V2B7_START_SHA, "--"], { cwd: root, encoding: "utf8", windowsHide: true });
  return evaluateGitBoundaryCommandResult(result);
}

function nextStepForDecision(decision) {
  return {
    CANARY_PASS: "user_reviews_private_workbook_and_separately_authorizes_full160",
    CANARY_CONDITIONAL: "review_failure_modes_before_any_scale_up",
    CANARY_FAIL: "repair_safety_or_evidence_contract",
    CANARY_BLOCKED: "resolve_runtime_or_budget_blocker",
  }[decision];
}

function renderExecutionMarkdown(report) {
  return `# M2 v2 固定 Canary v3 执行摘要 v0.2\n\n## 结论\n\n固定 10-work primary 与 5-work repeat 已执行；4 个 overlap primary 复用冻结 Source Bundle，未替换样本。\n\n- 新 Tavily 物理请求：${report.newTavilyPhysicalRequestCount}；累计：${report.cumulativeTavilyPhysicalRequestCount}\n- 新 relay 物理请求：${report.newRelayPhysicalRequestCount}；累计：${report.cumulativeRelayPhysicalRequestCount}\n- schema repair：${report.repairCount}\n- 路由：Terra full/server_strict；Luna 未使用\n- browser、computer-use、relay search：未使用\n- full160Authorized：false\n- status：\`not_for_formal_decision\`\n`;
}

function renderQualityMarkdown(report) {
  return `# M2 v2 固定 Canary v3 质量报告 v0.2\n\n## 分层结论\n\n- Search：${report.searchDecision}\n- Extraction：${report.extractionDecision}\n- Evidence usability：${report.evidenceUsabilityDecision}\n\n## 核心质量\n\n- Search success：${rate(report.search.logicalTavilySuccessRate)}\n- Source Record work coverage：${rate(report.search.sourceRecordWorkCoverage)}；总记录：${report.search.totalSourceRecordCount}\n- primary / repeat schema：${report.extraction.primarySchemaPassCount}/10、${report.extraction.repeatSchemaPassCount}/5\n- resolved：${report.entity.resolvedCount}/10；平均置信度：${nullable(report.entity.confidence)}\n- accepted / pilotUsable：${report.evidence.acceptedCount} / ${report.evidence.pilotUsableCount}\n- pilotUsable work coverage：${rate(report.evidence.pilotUsableWorkCoverage)}\n- high-value coverage：${rate(report.evidence.highValueCoverage)}\n- sourceId / capturedAt / availableAt：${rate(report.citationTimeGovernance.sourceIdIntegrityRate)} / ${rate(report.citationTimeGovernance.capturedAtCompleteness)} / ${rate(report.citationTimeGovernance.availableAtCompleteness)}\n- unresolved/conflicted accepted：${report.citationTimeGovernance.unresolvedOrConflictedAcceptedCount}\n- private workbook：${report.privateWorkbookGenerated ? "已生成" : "未生成"}\n- researchApproved / modelEligible：0 / 0\n- full160Authorized：false\n`;
}

function renderReproducibilityMarkdown(report) {
  return `# M2 v2 固定 Canary v3 可复现性报告 v0.1\n\n- repeat pairs：${report.expectedPairCount}\n- mean / median source overlap：${rate(report.meanSourceOverlap)} / ${rate(report.medianSourceOverlap)}\n- exact source set：${report.exactSourceSetMatchCount}/5\n- claim agreement：${nullableRate(report.claimAgreement)}\n- evaluable / not evaluable：${report.claimAgreementEvaluableCount} / ${report.claimAgreementNotEvaluableCount}\n- structured value agreement：${nullableRate(report.structuredValueAgreement)}\n- confidence drift：${nullable(report.confidenceDrift)}\n- contradiction drift：${report.contradictionDriftCount}\n- 无 claim 的 pair 标记为 not_evaluable，不以 0 冒充。\n- full160Authorized：false\n`;
}

function renderCostMarkdown(report) {
  return `# M2 v2 固定 Canary v3 成本与延迟报告 v0.1\n\n- Tavily 新/累计请求：${report.tavily.newPhysicalRequestCount} / ${report.tavily.cumulativePhysicalRequestCount}\n- Tavily p50/p90：${nullable(report.tavily.p50LatencyMs)} / ${nullable(report.tavily.p90LatencyMs)} ms\n- relay 新/累计请求：${report.relay.newPhysicalRequestCount} / ${report.relay.cumulativePhysicalRequestCount}\n- relay tokens：${nullable(report.relay.totalTokens)}\n- relay p50/p90：${nullable(report.relay.p50LatencyMs)} / ${nullable(report.relay.p90LatencyMs)} ms\n- estimated relay cost：不可证明第三方价格，保持 null\n- full160Authorized：false\n`;
}

function renderDecisionMarkdown(report) {
  return `# M2 v2 固定 Canary v3 决策 v0.2\n\n## 决策\n\n**${report.canaryDecision}**\n\n- Search：${report.searchDecision}\n- Extraction：${report.extractionDecision}\n- Evidence usability：${report.evidenceUsabilityDecision}\n- safety / usability：${report.safetyPassed} / ${report.usabilityPassed}\n- blockers：${report.blockerIds.length ? report.blockerIds.join(", ") : "none"}\n- nextStep：\`${report.nextStep}\`\n- private workbook：${report.privateWorkbookGenerated ? "已生成" : "未生成"}\n- 未训练模型；B4 unchanged；holdout sealed；未进入 V2-C/V2-D/C4/M3；未 release。\n- full160Authorized：false\n`;
}

function renderNextStepMarkdown(report) {
  return `# M2 v2 V2-B.7 下一步 v0.1\n\n- 当前决策：\`${report.currentDecision}\`\n- nextStep：\`${report.nextStep}\`\n- 本轮未 scale up。\n- full160、V2-C、V2-D、C4、M3 与 release 均未授权。\n`;
}

function stripRunFields(record) {
  const { canarySlotId: _slot, runKind: _run, sourceOrigin: _origin, ...source } = record;
  return source;
}

function readValidationPassed(privateStore) {
  if (!existsSync(join(privateStore, PRIVATE_FILES.validation))) return false;
  try { return readJson(join(privateStore, PRIVATE_FILES.validation)).allPassed === true; } catch { return false; }
}

function privateStoreIgnoredAndUntracked(root) {
  return privatePathIgnoredAndUntracked(root, V2B7_PRIVATE_RELATIVE);
}

function privatePathIgnoredAndUntracked(root, relative) {
  const ignored = spawnSync("git", ["check-ignore", "--quiet", "--", relative], { cwd: root, windowsHide: true }).status === 0;
  const tracked = spawnSync("git", ["ls-files", "--error-unmatch", "--", relative], { cwd: root, windowsHide: true }).status === 0;
  const staged = spawnSync("git", ["diff", "--cached", "--quiet", "--", relative], { cwd: root, windowsHide: true }).status !== 0;
  return ignored && !tracked && !staged;
}

function readEnvLocal(path) {
  if (!existsSync(path)) return {};
  const result = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/u)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/u);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    result[match[1]] = value;
  }
  return result;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readNdjson(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}

function atomicWriteJson(path, value) {
  atomicWriteText(path, `${JSON.stringify(value, null, 2)}\n`);
}

function atomicWriteNdjson(path, values) {
  atomicWriteText(path, values.length ? `${values.map((value) => JSON.stringify(value)).join("\n")}\n` : "");
}

function atomicWriteText(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temporary, value, "utf8");
  renameSync(temporary, path);
}

function gate(id, actual, threshold, predicate) {
  return { id, actual, threshold, passed: predicate(actual, threshold) };
}

function atLeast(actual, threshold) {
  return Number.isFinite(actual) && actual >= threshold;
}

function jaccard(left, right) {
  const union = new Set([...left, ...right]);
  if (!union.size) return 0;
  let overlap = 0;
  for (const value of left) if (right.has(value)) overlap += 1;
  return overlap / union.size;
}

function sumUsage(rows) {
  return {
    inputTokens: nullableSum(rows.map((row) => row?.inputTokens)),
    outputTokens: nullableSum(rows.map((row) => row?.outputTokens)),
    totalTokens: nullableSum(rows.map((row) => row?.totalTokens)),
  };
}

function sum(values) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

function nullableSum(values) {
  const observed = values.filter(Number.isFinite);
  return observed.length ? sum(observed) : null;
}

function ratio(numerator, denominator) {
  return denominator ? numerator / denominator : 0;
}

function average(values) {
  return values.length ? sum(values) / values.length : null;
}

function percentile(values, probability) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(probability * sorted.length) - 1)];
}

function countMany(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function cleanText(value, limit) {
  return typeof value === "string" ? [...value.normalize("NFKC").replace(/\s+/gu, " ").trim()].slice(0, limit).join("") : "";
}

function stripUrlLiterals(value) {
  return cleanText(String(value ?? "").replace(/https?:\/\/[^\s)\]}>"']+/giu, " "), 3_000);
}

function safeToken(value) {
  const text = cleanText(String(value ?? ""), 160);
  if (!text) return null;
  return /^[A-Za-z0-9._:-]{1,160}$/u.test(text) ? text : `sha256:${sha256(text)}`;
}

function isIsoTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function rate(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : "n/a";
}

function nullableRate(value) {
  return Number.isFinite(value) ? rate(value) : "not_evaluable";
}

function nullable(value) {
  return Number.isFinite(value) ? String(value) : "n/a";
}

function unique(values) {
  return [...new Set(values)];
}

export const __test = Object.freeze({
  buildPublicReportBundle,
  compareClaimSets,
  domainCategory,
  projectV2B7ExtractionSources,
  repairIssueCodes,
  sanitizeRepairIssues,
});
