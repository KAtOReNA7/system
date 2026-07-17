import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  CANARY_REQUEST_CAP,
  CANARY_SEED,
  CANARY_SIZE,
  CANARY_TOTAL_PLANNED_REQUESTS,
  assertTaskBudget,
  buildCanaryTasks,
  compareCanaryReproducibility,
  countBy,
  evaluateCanaryContradictions,
  evaluateCanaryCoverage,
  evaluateCanaryDecision,
  materializeEvidenceCandidates,
  percentile,
  ratio,
  resolveCanaryEntity,
  selectCanarySubset,
  validateStructuredRelayOutput,
} from "./canaryCore.js";
import { OpenAICompatibleRelayCanaryAdapter } from "./openAiCompatibleRelayAdapter.js";
import { assertPublicSanitized, canonicalJson, sha256 } from "./pilotCore.js";

export const PRIVATE_CANARY_RELATIVE = "data/private-output/m2-v2-evidence-pilot/canary-v0.1";
export const PARENT_MANIFEST_RELATIVE = "data/private-output/m2-v2-evidence-pilot/pilot-manifest-private-v0.1.json";
export const EXPECTED_PARENT_MANIFEST_DIGEST = "f85308436328bd056e27025407f45aa840cd5cc07e4e7ad9fe0eec4a2d8a3020";

export const CANARY_PUBLIC_REPORTS = Object.freeze({
  executionJson: "docs/analysis/m2-v2/M2-v2-canary-execution-summary-v0.1.json",
  executionMarkdown: "docs/analysis/m2-v2/M2-v2-canary-execution-summary-v0.1.md",
  qualityJson: "docs/analysis/m2-v2/M2-v2-canary-quality-report-v0.1.json",
  qualityMarkdown: "docs/analysis/m2-v2/M2-v2-canary-quality-report-v0.1.md",
  decisionJson: "docs/analysis/m2-v2/M2-v2-canary-decision-v0.1.json",
  decisionMarkdown: "docs/analysis/m2-v2/M2-v2-canary-decision-v0.1.md",
});

export const CANARY_PRIVATE_FILES = Object.freeze({
  manifest: "canary-manifest-private-v0.1.json",
  queryLog: "canary-query-log-private-v0.1.ndjson",
  receipts: "canary-provider-receipts-private-v0.1.ndjson",
  evidence: "canary-evidence-records-private-v0.1.ndjson",
  entity: "canary-entity-resolution-private-v0.1.ndjson",
  contradictions: "canary-contradictions-private-v0.1.ndjson",
  cost: "canary-cost-latency-ledger-private-v0.1.json",
  reproducibility: "canary-reproducibility-private-v0.1.json",
  cache: "canary-cache-private-v0.1.json",
  state: "canary-execution-state-private-v0.1.json",
  review: "canary-review-pack-private-v0.1.json",
  verification: "canary-verification-receipt-private-v0.1.json",
  fullValidation: "canary-full-validation-receipt-private-v0.1.json",
  workbook: "M2-v2-canary-review-workbook-private-v0.1.xlsx",
});

const COMPATIBILITY_RECEIPT_RELATIVE = "data/private-output/m2-v2-evidence-pilot/relay-compatibility/M2-v2-relay-compatibility-receipt-private-v0.1.json";
const LUNA_SYNTHETIC_RECEIPT_RELATIVE = "data/private-output/m2-v2-evidence-pilot/canary-v0.1/luna-synthetic-capability-receipt-private-v0.1.json";
const SOURCE_ALLOWLIST_RELATIVE = "docs/technical-design/m2-v2/M2-v2-source-allowlist-v0.1.json";
const C3_SPEC_RELATIVE = "src/domain/oldProductEvaluation/calibrationSpec.c3.v1.amendment.json";
const CANARY_START_COMMIT = "a3c1011c6eb6a62efd07d3ae01f66d6c10e1a4e7";
const FULL_VALIDATION_COMMANDS = Object.freeze([
  ["npm", "run", "check:no-real-data"],
  ["npm", "run", "lint"],
  ["npm", "run", "build"],
  ["npm", "test"],
  ["npm", "run", "smoke"],
  ["npm", "run", "test:e2e"],
]);

export function checkAndFreezeCanary(root, options = {}) {
  const absoluteRoot = resolve(root);
  const privateStore = join(absoluteRoot, PRIVATE_CANARY_RELATIVE);
  mkdirSync(privateStore, { recursive: true });
  assertPrivateStoreIgnored(absoluteRoot);
  const parentManifest = readJson(join(absoluteRoot, PARENT_MANIFEST_RELATIVE));
  if (parentManifest.manifestDigest !== EXPECTED_PARENT_MANIFEST_DIGEST) throw new Error("canary_parent_manifest_binding_mismatch");
  const selection = selectCanarySubset(parentManifest, { seed: options.seed ?? CANARY_SEED });
  const manifestPath = join(privateStore, CANARY_PRIVATE_FILES.manifest);

  if (existsSync(manifestPath)) {
    const existing = readJson(manifestPath);
    assertCanaryManifest(existing, parentManifest);
    assertReplaySelectionMatchesManifest(existing, selection);
    return { created: false, manifest: existing, parentManifest };
  }

  const createdAt = options.createdAt ?? new Date().toISOString();
  const payload = {
    schema: "m2.v2.evidence-canary-private-manifest.v0.1",
    privateOnly: true,
    immutable: true,
    derivedSubset: true,
    status: "frozen_before_canary_retrieval",
    selectedBeforeRetrieval: true,
    retrievalObservedBeforeFreeze: false,
    createdAt,
    seed: selection.seed,
    selectionVersion: "m2-v2-canary-fixed-slot-hash-v0.1",
    parentManifestDigest: parentManifest.manifestDigest,
    parentSampleCount: parentManifest.sample.length,
    sampleCount: CANARY_SIZE,
    coverage: selection.coverage,
    requestBudget: {
      maxQueriesPerWork: 8,
      maxTotalRequests: CANARY_REQUEST_CAP,
      plannedPrimaryRequests: 40,
      plannedRepeatRequests: 20,
      plannedTotalRequests: CANARY_TOTAL_PLANNED_REQUESTS,
      automaticRetry: false,
    },
    repeatPolicy: {
      workCount: 5,
      selection: "first_5_by_sha256(seed+repeat5+identity_digest)",
      cacheSharedWithPrimary: false,
      claimAgreementThreshold: 0.8,
    },
    sample: selection.selected.map((work) => ({ ...work })),
    repeatSample: selection.repeatWorks.map((work) => ({ standardWorkId: work.standardWorkId, identityDigest: work.identityDigest })),
  };
  const manifest = { ...payload, canaryManifestDigest: sha256(payload) };
  assertCanaryManifest(manifest, parentManifest);
  atomicWriteJson(manifestPath, manifest);
  return { created: true, manifest, parentManifest };
}

export async function runCanary(root, options = {}) {
  const absoluteRoot = resolve(root);
  const checked = checkAndFreezeCanary(absoluteRoot);
  const manifest = checked.manifest;
  const privateStore = join(absoluteRoot, PRIVATE_CANARY_RELATIVE);
  const tasks = buildCanaryTasks(manifest);
  const config = loadRelayConfiguration(absoluteRoot);
  const requestCap = Number(config.env.M2_V2_PILOT_MAX_REQUESTS);
  if (requestCap !== CANARY_REQUEST_CAP) throw new Error("canary_env_request_cap_must_equal_100");
  const adapter = options.adapter ?? new OpenAICompatibleRelayCanaryAdapter({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.model,
    compatibilityReceiptDigest: config.binding.compatibilityReceiptDigest,
    timeoutMs: 60_000,
  });
  assertAdapterMatchesBinding(adapter, config.binding);
  const runMode = options.runMode ?? "run";
  const cachePath = join(privateStore, CANARY_PRIVATE_FILES.cache);
  const statePath = join(privateStore, CANARY_PRIVATE_FILES.state);
  const cache = existsSync(cachePath)
    ? readJson(cachePath)
    : {
        schema: "m2.v2.canary-cache.v0.1",
        privateOnly: true,
        canaryManifestDigest: manifest.canaryManifestDigest,
        runtimeBinding: config.binding,
        runtimeBindingVerifiedAt: new Date().toISOString(),
        entries: {},
      };
  if (cache.canaryManifestDigest !== manifest.canaryManifestDigest) throw new Error("canary_cache_manifest_mismatch");
  const stateExisted = existsSync(statePath);
  const state = stateExisted
    ? readJson(statePath)
    : initialState(manifest, adapter, tasks.length, runMode, config.binding);
  if (state.canaryManifestDigest !== manifest.canaryManifestDigest) throw new Error("canary_state_manifest_mismatch");
  if (stateExisted) assertStateDigest(state);
  const bindingEstablished = establishRuntimeBinding({ cache, state, tasks, binding: config.binding });
  if (bindingEstablished) {
    atomicWriteJson(cachePath, cache);
    atomicWriteJson(statePath, withStateDigest(state));
  }

  const queryLog = buildPrivateQueryLog(tasks, manifest);
  atomicWriteNdjson(join(privateStore, CANARY_PRIVATE_FILES.queryLog), queryLog);

  for (const task of tasks) {
    const cachedReceipt = cache.entries[task.requestKey];
    if (cachedReceipt) {
      assertReceiptMatchesTask(cachedReceipt, task, config.binding, { allowLegacyBinding: true });
      const reconciled = reconcileCachedReceiptReservation({
        task,
        receipt: cachedReceipt,
        reservation: state.reservations[task.requestKey],
        reconciledAt: new Date().toISOString(),
      });
      if (reconciled.changed) {
        state.reservations[task.requestKey] = reconciled.reservation;
        checkpointExecution(privateStore, cache, state, tasks);
      }
      continue;
    }
    const priorReservation = state.reservations[task.requestKey];
    if (priorReservation?.status === "dispatch_started") {
      const receipt = interruptedReceipt(task, priorReservation, adapter);
      cache.entries[task.requestKey] = receipt;
      state.reservations[task.requestKey] = {
        ...priorReservation,
        status: "indeterminate_after_crash",
        completedAt: receipt.capturedAt,
        receiptDigest: receipt.receiptDigest,
      };
      checkpointExecution(privateStore, cache, state, tasks);
      continue;
    }

    const reservedCount = Object.keys(state.reservations).length;
    if (reservedCount >= CANARY_REQUEST_CAP) throw new Error("canary_request_cap_reached");
    const reservation = {
      ordinal: reservedCount + 1,
      status: "dispatch_started",
      requestKey: task.requestKey,
      runKind: task.runKind,
      identityDigest: task.identityDigest,
      reservedAt: new Date().toISOString(),
    };
    state.reservations[task.requestKey] = reservation;
    state.executionStatus = "running";
    state.updatedAt = new Date().toISOString();
    atomicWriteJson(statePath, withStateDigest(state));

    const receipt = await adapter.execute(task);
    assertReceiptMatchesTask(receipt, task, config.binding, { allowLegacyBinding: false });
    cache.entries[task.requestKey] = receipt;
    state.reservations[task.requestKey] = { ...reservation, status: "completed", completedAt: new Date().toISOString(), receiptDigest: receipt.receiptDigest };
    checkpointExecution(privateStore, cache, state, tasks);
  }

  const result = materializeCanaryArtifacts(absoluteRoot, manifest, tasks, cache, state, adapter);
  return result;
}

export function verifyCanary(root, options = {}) {
  const absoluteRoot = resolve(root);
  const privateStore = join(absoluteRoot, PRIVATE_CANARY_RELATIVE);
  assertPrivateStoreIgnored(absoluteRoot);
  const parentManifest = readJson(join(absoluteRoot, PARENT_MANIFEST_RELATIVE));
  const manifest = readJson(join(privateStore, CANARY_PRIVATE_FILES.manifest));
  assertCanaryManifest(manifest, parentManifest);
  const tasks = buildCanaryTasks(manifest);
  const config = loadRelayConfiguration(absoluteRoot, { requireApiKey: false });
  const state = readJson(join(privateStore, CANARY_PRIVATE_FILES.state));
  const cache = readJson(join(privateStore, CANARY_PRIVATE_FILES.cache));
  const queryLog = readNdjson(join(privateStore, CANARY_PRIVATE_FILES.queryLog));
  const receipts = readNdjson(join(privateStore, CANARY_PRIVATE_FILES.receipts));
  const evidence = readNdjson(join(privateStore, CANARY_PRIVATE_FILES.evidence));
  const entity = readNdjson(join(privateStore, CANARY_PRIVATE_FILES.entity));
  const contradictions = readNdjson(join(privateStore, CANARY_PRIVATE_FILES.contradictions));
  const reproducibility = readJson(join(privateStore, CANARY_PRIVATE_FILES.reproducibility));
  const cost = readJson(join(privateStore, CANARY_PRIVATE_FILES.cost));
  const sourceAllowlist = readJson(join(absoluteRoot, SOURCE_ALLOWLIST_RELATIVE));
  const derived = deriveCanaryBundle({ manifest, receipts, sourceAllowlist });
  const issues = [];

  try {
    validateCanaryRuntimeIntegrity({
      manifest,
      tasks,
      state,
      cache,
      queryLog,
      receipts,
      binding: config.binding,
      allowLegacyBinding: true,
    });
  } catch (error) {
    issues.push(error instanceof Error ? error.message : "canary_runtime_integrity_invalid");
  }
  try {
    validateDerivedBundleIntegrity({
      derived,
      stored: { entity, evidence, contradictions, reproducibility, cost },
    });
    if (state.derivedBundleDigest !== derived.bundleDigest) throw new Error("canary_state_derived_bundle_digest_mismatch");
  } catch (error) {
    issues.push(error instanceof Error ? error.message : "canary_derived_bundle_integrity_invalid");
  }

  if (state.executionStatus !== "completed") issues.push("canary_execution_not_completed");
  if (state.canaryManifestDigest !== manifest.canaryManifestDigest) issues.push("canary_state_manifest_mismatch");
  if (queryLog.length !== CANARY_TOTAL_PLANNED_REQUESTS || receipts.length !== queryLog.length) issues.push("canary_query_receipt_count_mismatch");
  if (receipts.filter((item) => item.dispatched).length > CANARY_REQUEST_CAP) issues.push("canary_request_cap_exceeded");
  const perWork = countBy(queryLog, (item) => item.workReference);
  if (Object.values(perWork).some((count) => count > 8)) issues.push("canary_per_work_budget_exceeded");
  if (queryLog.some((item) => item.prohibitedFieldsTransmitted !== false)) issues.push("canary_private_field_transmitted");
  if (queryLog.some((item) => !sameStringSet(item.outboundDataFields, ["work_title", "author_byline", "source_type"]))) {
    issues.push("canary_outbound_field_contract_invalid");
  }
  if (receipts.some((item) => !item.receiptDigest || !item.requestKey || !item.status || item.rawResponsePersisted !== false)) {
    issues.push("canary_receipt_not_auditable");
  }
  if (receipts.some((item) => item.authorizationHeaderPersisted !== false || item.apiKeyPersisted !== false)) issues.push("canary_secret_persistence_flag_invalid");
  if (entity.length !== CANARY_SIZE) issues.push("canary_entity_count_invalid");
  if (evidence.some((item) => item.disposition === "accepted" && !acceptedEvidenceContractPassed(item))) {
    issues.push("canary_accepted_evidence_contract_failed");
  }
  if (evidence.some((item) => item.historicalBackfill === true)) issues.push("canary_historical_backfill_detected");
  if (evidence.some((item) => item.disposition === "accepted" && item.sourceQuality?.prohibited === true)) issues.push("canary_prohibited_source_accepted");
  if (evidence.some((item) => item.disposition === "accepted" && item.sourceQuality?.allowlistAccepted !== true)) issues.push("canary_unapproved_source_accepted");
  if (contradictions.some((item) => item.admissibleStatus?.startsWith("unresolved") && item.predictionEligible === true)) {
    issues.push("canary_unresolved_contradiction_eligible");
  }
  if (reproducibility.repeatWorkCount !== 5) issues.push("canary_repeat_population_invalid");
  if (cost.requestCount > CANARY_REQUEST_CAP) issues.push("canary_cost_ledger_request_count_invalid");

  const taskRequestAccounting = buildTaskRequestAccounting(absoluteRoot, derived.cost);
  if (!taskRequestAccounting.contentIntegrityPassed) issues.push("canary_supplemental_probe_receipt_invalid");
  if (!taskRequestAccounting.withinTaskRequestCap) issues.push("canary_total_task_request_cap_exceeded");
  if (!taskRequestAccounting.realWorkCallsWithinApproval) issues.push("canary_real_work_disclosure_cap_exceeded");
  if (!taskRequestAccounting.supplementalSyntheticOnly) issues.push("canary_supplemental_probe_real_work_data_detected");

  const protectedDiff = git(absoluteRoot, [
    "diff", "--name-only", CANARY_START_COMMIT, "--",
    "src/domain/oldProductEvaluation",
    "scripts/m2-real-data",
    "docs/analysis/m2-real-data",
    "docs/prd/m2-v2",
    "db/migrations",
  ]);
  const protectedUntracked = git(absoluteRoot, [
    "ls-files", "--others", "--exclude-standard", "--",
    "src/domain/oldProductEvaluation",
    "scripts/m2-real-data",
    "docs/analysis/m2-real-data",
    "docs/prd/m2-v2",
    "db/migrations",
  ]);
  if (
    protectedDiff.status !== 0 || protectedDiff.stdout.trim()
    || protectedUntracked.status !== 0 || protectedUntracked.stdout.trim()
  ) issues.push("canary_protected_scope_changed");
  const seals = readJson(join(absoluteRoot, C3_SPEC_RELATIVE));
  if (!calibrationSealsAreClosed(seals)) issues.push("canary_final_holdout_or_related_seal_open");
  const privateStatus = privateStoreStatus(absoluteRoot);
  if (!privateStatus.ignored || !privateStatus.untracked) issues.push("canary_private_store_not_ignored_or_untracked");
  const reviewWorkbook = inspectPrivateReviewWorkbook(privateStore);
  if (!reviewWorkbook.containerValid) issues.push("canary_private_review_workbook_container_invalid");

  const fullValidation = options.skipFullValidation === true
    ? { commandCount: 0, passedCount: 0, allPassed: false, skipped: true, results: [] }
    : runFullProjectValidation(absoluteRoot);
  atomicWriteJson(join(privateStore, CANARY_PRIVATE_FILES.fullValidation), fullValidation);
  if (!fullValidation.allPassed) issues.push("canary_full_project_validation_failed");

  const metrics = buildCanaryMetrics({ manifest, state, queryLog, receipts, ...derived, taskRequestAccounting });
  const preliminaryVerification = {
    allTestsPassed: fullValidation.allPassed,
    privacyLeakCount: 0,
    hardInvariantFailureCount: issues.length,
    allHardInvariantsPassed: issues.length === 0,
  };
  const decision = evaluateCanaryDecision(metrics, preliminaryVerification);
  const reportAudit = {
    privateArtifactsIgnoredAndUntracked: privateStatus.ignored && privateStatus.untracked,
    publicPrivacyLeakCount: null,
    reviewWorkbookPresentAndXlsxContainerValid: reviewWorkbook.containerValid,
    taskRequestAccounting,
  };
  const reports = buildPublicReportPayloads(absoluteRoot, metrics, decision, fullValidation, reportAudit);
  const privacyScan = scanPublicPayloads({
    root: absoluteRoot,
    reports,
    manifest,
    queryLog,
    evidence: derived.evidence,
  });
  if (privacyScan.leakCount) issues.push("canary_public_privacy_scan_failed");
  const finalDecision = evaluateCanaryDecision(metrics, {
    allTestsPassed: fullValidation.allPassed,
    privacyLeakCount: privacyScan.leakCount,
    hardInvariantFailureCount: issues.length,
    allHardInvariantsPassed: issues.length === 0,
  });
  const finalReports = buildPublicReportPayloads(absoluteRoot, metrics, finalDecision, fullValidation, {
    ...reportAudit,
    publicPrivacyLeakCount: privacyScan.leakCount,
  });
  scanPublicPayloads({ root: absoluteRoot, reports: finalReports, manifest, queryLog, evidence: derived.evidence, throwOnLeak: true });

  const payload = {
    schema: "m2.v2.canary-verification-receipt.v0.1",
    privateOnly: true,
    verifiedAt: new Date().toISOString(),
    canaryManifestDigest: manifest.canaryManifestDigest,
    stateDigest: state.stateDigest,
    issues,
    requestBudgetPassed: receipts.filter((item) => item.dispatched).length <= CANARY_REQUEST_CAP,
    perWorkBudgetPassed: Object.values(perWork).every((count) => count <= 8),
    immutableManifestPassed: true,
    protectedScopePassed: !issues.includes("canary_protected_scope_changed"),
    sealsPassed: !issues.includes("canary_final_holdout_or_related_seal_open"),
    privateStatus,
    reviewWorkbook,
    taskRequestAccounting,
    derivedBundleDigest: derived.bundleDigest,
    privacyScan,
    fullValidation,
    metricsDigest: sha256(metrics),
    decision: finalDecision,
  };
  const verification = { ...payload, verificationDigest: sha256(payload) };
  atomicWriteJson(join(privateStore, CANARY_PRIVATE_FILES.verification), verification);
  if (issues.length) throw new Error(`canary_verification_failed:${issues.join(",")}`);
  return { verification, reports: finalReports, metrics, decision: finalDecision };
}

export function writeCanaryReports(root) {
  const absoluteRoot = resolve(root);
  const privateStore = join(absoluteRoot, PRIVATE_CANARY_RELATIVE);
  const verification = readJson(join(privateStore, CANARY_PRIVATE_FILES.verification));
  const { verificationDigest, ...verificationPayload } = verification;
  if (!verificationDigest || verificationDigest !== sha256(verificationPayload)) throw new Error("canary_verification_digest_invalid");
  if (verification.issues?.length) throw new Error("canary_verification_has_issues");
  if (verification.fullValidation?.allPassed !== true) throw new Error("canary_full_validation_not_passed");
  const manifest = readJson(join(privateStore, CANARY_PRIVATE_FILES.manifest));
  const state = readJson(join(privateStore, CANARY_PRIVATE_FILES.state));
  const queryLog = readNdjson(join(privateStore, CANARY_PRIVATE_FILES.queryLog));
  const receipts = readNdjson(join(privateStore, CANARY_PRIVATE_FILES.receipts));
  const evidence = readNdjson(join(privateStore, CANARY_PRIVATE_FILES.evidence));
  const entity = readNdjson(join(privateStore, CANARY_PRIVATE_FILES.entity));
  const contradictions = readNdjson(join(privateStore, CANARY_PRIVATE_FILES.contradictions));
  const reproducibility = readJson(join(privateStore, CANARY_PRIVATE_FILES.reproducibility));
  const cost = readJson(join(privateStore, CANARY_PRIVATE_FILES.cost));
  const sourceAllowlist = readJson(join(absoluteRoot, SOURCE_ALLOWLIST_RELATIVE));
  const derived = deriveCanaryBundle({ manifest, receipts, sourceAllowlist });
  validateDerivedBundleIntegrity({
    derived,
    stored: { entity, evidence, contradictions, reproducibility, cost },
  });
  assertStateDigest(state);
  if (state.derivedBundleDigest !== derived.bundleDigest || verification.derivedBundleDigest !== derived.bundleDigest) {
    throw new Error("canary_report_derived_bundle_digest_mismatch");
  }
  const currentPrivateStatus = privateStoreStatus(absoluteRoot);
  const currentReviewWorkbook = inspectPrivateReviewWorkbook(privateStore);
  const currentTaskRequestAccounting = buildTaskRequestAccounting(absoluteRoot, derived.cost);
  if (canonicalJson(verification.taskRequestAccounting) !== canonicalJson(currentTaskRequestAccounting)) {
    throw new Error("canary_report_task_request_accounting_mismatch");
  }
  const metrics = buildCanaryMetrics({
    manifest,
    state,
    queryLog,
    receipts,
    ...derived,
    taskRequestAccounting: currentTaskRequestAccounting,
  });
  if (verification.metricsDigest !== sha256(metrics)) throw new Error("canary_report_metrics_digest_mismatch");
  const decision = evaluateCanaryDecision(metrics, {
    allTestsPassed: verification.fullValidation.allPassed,
    privacyLeakCount: verification.privacyScan.leakCount,
    hardInvariantFailureCount: verification.issues.length,
    allHardInvariantsPassed: verification.issues.length === 0,
  });
  const reports = buildPublicReportPayloads(absoluteRoot, metrics, decision, verification.fullValidation, {
    privateArtifactsIgnoredAndUntracked: verification.privateStatus
      ? verification.privateStatus.ignored === true && verification.privateStatus.untracked === true
      : currentPrivateStatus.ignored && currentPrivateStatus.untracked,
    publicPrivacyLeakCount: verification.privacyScan?.leakCount ?? null,
    reviewWorkbookPresentAndXlsxContainerValid: verification.reviewWorkbook?.containerValid ?? currentReviewWorkbook.containerValid,
    taskRequestAccounting: currentTaskRequestAccounting,
  });
  scanPublicPayloads({ root: absoluteRoot, reports, manifest, queryLog, evidence: derived.evidence, throwOnLeak: true });

  atomicWriteJson(join(absoluteRoot, CANARY_PUBLIC_REPORTS.executionJson), reports.execution);
  atomicWriteText(join(absoluteRoot, CANARY_PUBLIC_REPORTS.executionMarkdown), renderExecutionMarkdown(reports.execution));
  atomicWriteJson(join(absoluteRoot, CANARY_PUBLIC_REPORTS.qualityJson), reports.quality);
  atomicWriteText(join(absoluteRoot, CANARY_PUBLIC_REPORTS.qualityMarkdown), renderQualityMarkdown(reports.quality));
  atomicWriteJson(join(absoluteRoot, CANARY_PUBLIC_REPORTS.decisionJson), reports.decision);
  atomicWriteText(join(absoluteRoot, CANARY_PUBLIC_REPORTS.decisionMarkdown), renderDecisionMarkdown(reports.decision));
  return reports;
}

function materializeCanaryArtifacts(root, manifest, tasks, cache, state, adapter) {
  const privateStore = join(root, PRIVATE_CANARY_RELATIVE);
  const receipts = tasks.map((task) => ({ ...cache.entries[task.requestKey] }));
  if (receipts.some((item) => !item)) throw new Error("canary_receipt_missing_after_execution");
  const sourceAllowlist = readJson(join(root, SOURCE_ALLOWLIST_RELATIVE));
  const derived = deriveCanaryBundle({ manifest, receipts, sourceAllowlist });
  const { entity, evidence, contradictions, reproducibility, cost } = derived;

  const completedState = {
    ...state,
    schema: "m2.v2.canary-execution-state.v0.1",
    privateOnly: true,
    executionStatus: "completed",
    providerId: adapter.providerId,
    providerVersion: adapter.providerVersion,
    providerMode: adapter.mode,
    selectedModel: adapter.model,
    plannedRequestCount: tasks.length,
    requestCount: receipts.filter((item) => item.dispatched).length,
    successCount: receipts.filter((item) => item.status === "success").length,
    contractSuccessCount: receipts.filter(
      (item) => item.status === "success" && validateStructuredRelayOutput(item.structuredResponse).valid
    ).length,
    primaryRequestCount: receipts.filter((item) => item.runKind === "primary").length,
    repeatRequestCount: receipts.filter((item) => item.runKind === "repeat").length,
    candidateEvidenceCount: evidence.length,
    acceptedEvidenceCount: evidence.filter((item) => item.disposition === "accepted").length,
    derivedBundleDigest: derived.bundleDigest,
    completedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const finalState = withStateDigest(completedState);

  atomicWriteNdjson(join(privateStore, CANARY_PRIVATE_FILES.receipts), receipts);
  atomicWriteNdjson(join(privateStore, CANARY_PRIVATE_FILES.entity), entity);
  atomicWriteNdjson(join(privateStore, CANARY_PRIVATE_FILES.evidence), evidence);
  atomicWriteNdjson(join(privateStore, CANARY_PRIVATE_FILES.contradictions), contradictions);
  atomicWriteJson(join(privateStore, CANARY_PRIVATE_FILES.reproducibility), reproducibility);
  atomicWriteJson(join(privateStore, CANARY_PRIVATE_FILES.cost), cost);
  atomicWriteJson(join(privateStore, CANARY_PRIVATE_FILES.state), finalState);
  atomicWriteJson(join(privateStore, CANARY_PRIVATE_FILES.review), buildPrivateReviewPack(manifest, entity, evidence, finalState));
  return { manifest, state: finalState, receipts, entity, evidence, contradictions, reproducibility, cost };
}

export function deriveCanaryBundle({ manifest, receipts, sourceAllowlist }) {
  const repeatIds = new Set(manifest.repeatSample.map((item) => item.standardWorkId));
  const entity = manifest.sample.map((work) => {
    const primaryReceipts = receipts.filter((item) => item.workReference === work.standardWorkId && item.runKind === "primary");
    const resolved = resolveCanaryEntity(work, primaryReceipts);
    return {
      schema: "m2.v2.canary-entity-resolution.v0.1",
      privateOnly: true,
      workReference: work.standardWorkId,
      identityDigest: work.identityDigest,
      preRegisteredAmbiguityRisk: work.ambiguityRisk,
      ...resolved,
    };
  });
  const entityByWork = new Map(entity.map((item) => [item.workReference, item]));
  const evidence = [];
  for (const work of manifest.sample) {
    const workReceipts = receipts.filter((item) => item.workReference === work.standardWorkId);
    evidence.push(...materializeEvidenceCandidates({
      work,
      receipts: workReceipts,
      entityResolution: entityByWork.get(work.standardWorkId),
      sourceAllowlist,
      runKind: "primary",
    }));
    if (repeatIds.has(work.standardWorkId)) {
      const repeatResolution = resolveCanaryEntity(work, workReceipts.filter((item) => item.runKind === "repeat"));
      evidence.push(...materializeEvidenceCandidates({
        work,
        receipts: workReceipts,
        entityResolution: repeatResolution,
        sourceAllowlist,
        runKind: "repeat",
      }));
    }
  }
  const primaryEvidence = evidence.filter((item) => item.runKind === "primary");
  const repeatEvidence = evidence.filter((item) => item.runKind === "repeat");
  const contradictions = evaluateCanaryContradictions(primaryEvidence);
  const contradictionBySegment = new Map();
  for (const group of contradictions) {
    for (const segment of group.segments ?? []) {
      contradictionBySegment.set(
        `${group.workReference}\u001f${group.claimType}\u001f${segment.claimSubject}\u001f${segment.effectiveTime}`,
        { group, segment }
      );
    }
  }
  for (const item of evidence) {
    if (item.runKind !== "primary") continue;
    const key = `${item.workReference}\u001f${item.claimType}\u001f${item.claimSubject ?? "unknown"}\u001f${item.effectiveTime ?? "unknown"}`;
    const contradiction = contradictionBySegment.get(key);
    item.contradiction = {
      rawStatus: contradiction?.segment.rawStatus ?? "none",
      admissibleStatus: contradiction?.segment.admissibleStatus ?? "none",
      groupDigest: contradiction?.group.groupDigest ?? null,
      segmentKeyDigest: contradiction?.segment.segmentKeyDigest ?? null,
    };
  }
  const reproducibility = compareCanaryReproducibility(
    primaryEvidence,
    repeatEvidence,
    manifest.sample.filter((work) => repeatIds.has(work.standardWorkId))
  );
  const cost = buildCostLedger(receipts, manifest.sample.length);
  const payload = { entity, evidence, contradictions, reproducibility, cost };
  return { ...payload, bundleDigest: sha256(payload) };
}

export function validateDerivedBundleIntegrity({ derived, stored }) {
  const fields = ["entity", "evidence", "contradictions", "reproducibility", "cost"];
  for (const field of fields) {
    if (canonicalJson(stored?.[field]) !== canonicalJson(derived?.[field])) {
      throw new Error(`canary_derived_${field}_parity_mismatch`);
    }
  }
  const payload = Object.fromEntries(fields.map((field) => [field, derived[field]]));
  if (derived.bundleDigest !== sha256(payload)) throw new Error("canary_derived_bundle_digest_invalid");
  return { valid: true, bundleDigest: derived.bundleDigest };
}

function checkpointExecution(privateStore, cache, state, tasks) {
  const receipts = tasks.map((task) => cache.entries[task.requestKey]).filter(Boolean);
  state.updatedAt = new Date().toISOString();
  state.requestCount = Object.keys(state.reservations).length;
  state.completedReceiptCount = receipts.length;
  state.successCount = receipts.filter((item) => item.status === "success").length;
  atomicWriteJson(join(privateStore, CANARY_PRIVATE_FILES.cache), cache);
  atomicWriteNdjson(join(privateStore, CANARY_PRIVATE_FILES.receipts), receipts);
  atomicWriteJson(join(privateStore, CANARY_PRIVATE_FILES.state), withStateDigest(state));
}

function initialState(manifest, adapter, plannedRequestCount, runMode, runtimeBinding) {
  return {
    schema: "m2.v2.canary-execution-state.v0.1",
    privateOnly: true,
    runMode,
    executionStatus: "initialized",
    canaryManifestDigest: manifest.canaryManifestDigest,
    providerId: adapter.providerId,
    providerVersion: adapter.providerVersion,
    providerMode: adapter.mode,
    selectedModel: adapter.model,
    runtimeBinding,
    runtimeBindingVerifiedAt: new Date().toISOString(),
    requestCap: CANARY_REQUEST_CAP,
    plannedRequestCount,
    requestCount: 0,
    completedReceiptCount: 0,
    successCount: 0,
    reservations: {},
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function assertAdapterMatchesBinding(adapter, binding) {
  if (
    adapter?.providerId !== binding.providerId
    || adapter?.providerVersion !== binding.providerVersion
    || adapter?.mode !== binding.providerMode
    || adapter?.model !== binding.model
    || adapter?.baseUrlDigest !== binding.baseUrlDigest
    || adapter?.compatibilityReceiptDigest !== binding.compatibilityReceiptDigest
  ) throw new Error("canary_adapter_runtime_binding_mismatch");
}

function establishRuntimeBinding({ cache, state, tasks, binding }) {
  const taskByKey = new Map(tasks.map((task) => [task.requestKey, task]));
  for (const [requestKey, receipt] of Object.entries(cache.entries ?? {})) {
    const task = taskByKey.get(requestKey);
    if (!task) throw new Error("canary_cache_unexpected_request_key");
    assertReceiptMatchesTask(receipt, task, binding, { allowLegacyBinding: true });
  }
  if (
    state.providerId !== binding.providerId
    || state.providerVersion !== binding.providerVersion
    || state.providerMode !== binding.providerMode
    || state.selectedModel !== binding.model
  ) throw new Error("canary_state_provider_binding_mismatch");

  let changed = false;
  for (const container of [cache, state]) {
    if (container.runtimeBinding) {
      if (canonicalJson(container.runtimeBinding) !== canonicalJson(binding)) {
        throw new Error("canary_runtime_binding_mismatch");
      }
    } else {
      container.runtimeBinding = { ...binding };
      container.runtimeBindingVerifiedAt = new Date().toISOString();
      changed = true;
    }
  }
  return changed;
}

export function reconcileCachedReceiptReservation({ task, receipt, reservation, reconciledAt }) {
  if (!reservation) throw new Error("canary_cached_receipt_reservation_missing");
  if (
    reservation.requestKey !== task.requestKey
    || reservation.runKind !== task.runKind
    || reservation.identityDigest !== task.identityDigest
  ) throw new Error("canary_cached_receipt_reservation_parity_mismatch");
  if (reservation.status === "completed") {
    if (reservation.receiptDigest !== receipt.receiptDigest) throw new Error("canary_reservation_receipt_digest_mismatch");
    return { changed: false, reservation };
  }
  if (!new Set(["dispatch_started", "indeterminate_after_crash"]).has(reservation.status)) {
    throw new Error("canary_cached_receipt_reservation_status_invalid");
  }
  const indeterminate = receipt.status === "indeterminate_after_crash";
  return {
    changed: true,
    reservation: {
      ...reservation,
      status: indeterminate ? "indeterminate_after_crash" : "completed",
      completedAt: receipt.capturedAt ?? null,
      receiptDigest: receipt.receiptDigest,
      reconciledFromCache: true,
      reconciledAt,
      completionTimeSource: receipt.capturedAt ? "receipt_captured_at" : "unknown",
    },
  };
}

function assertReceiptMatchesTask(receipt, task, binding, options = {}) {
  const { receiptDigest, ...payload } = receipt ?? {};
  if (!receiptDigest || receiptDigest !== sha256(canonicalJson(payload))) throw new Error("canary_receipt_digest_invalid");
  if (receipt.schema !== "m2.v2.canary-provider-receipt.v0.1" || receipt.privateOnly !== true) {
    throw new Error("canary_receipt_schema_invalid");
  }
  const expected = {
    requestKey: task.requestKey,
    runKind: task.runKind,
    workReference: task.workReference,
    identityDigest: task.identityDigest,
    queryId: task.queryId,
    queryHash: task.queryHash,
    queryCategory: task.queryCategory,
  };
  if (Object.entries(expected).some(([key, value]) => receipt[key] !== value)) {
    throw new Error("canary_receipt_task_parity_mismatch");
  }
  if (
    receipt.providerId !== binding.providerId
    || receipt.providerVersion !== binding.providerVersion
    || receipt.providerMode !== binding.providerMode
    || receipt.model !== binding.model
  ) throw new Error("canary_receipt_provider_binding_mismatch");
  const bindingFieldsPresent = receipt.baseUrlDigest != null || receipt.compatibilityReceiptDigest != null;
  if (bindingFieldsPresent) {
    if (
      receipt.baseUrlDigest !== binding.baseUrlDigest
      || receipt.compatibilityReceiptDigest !== binding.compatibilityReceiptDigest
    ) throw new Error("canary_receipt_compatibility_binding_mismatch");
  } else if (options.allowLegacyBinding !== true) {
    throw new Error("canary_receipt_compatibility_binding_missing");
  }
  return true;
}

function assertStateDigest(state) {
  const { stateDigest, ...payload } = state ?? {};
  if (!stateDigest || stateDigest !== sha256(payload)) throw new Error("canary_state_digest_invalid");
  return true;
}

export function validateCanaryRuntimeIntegrity({
  manifest,
  tasks,
  state,
  cache,
  queryLog,
  receipts,
  binding,
  allowLegacyBinding = false,
}) {
  assertStateDigest(state);
  if (state.schema !== "m2.v2.canary-execution-state.v0.1" || state.privateOnly !== true) {
    throw new Error("canary_state_schema_invalid");
  }
  if (cache?.schema !== "m2.v2.canary-cache.v0.1" || cache?.privateOnly !== true) {
    throw new Error("canary_cache_schema_invalid");
  }
  if (state.canaryManifestDigest !== manifest.canaryManifestDigest) throw new Error("canary_state_manifest_mismatch");
  if (cache?.canaryManifestDigest !== manifest.canaryManifestDigest) throw new Error("canary_cache_manifest_mismatch");
  if (state.executionStatus !== "completed") throw new Error("canary_execution_not_completed");
  if (
    state.providerId !== binding.providerId
    || state.providerVersion !== binding.providerVersion
    || state.providerMode !== binding.providerMode
    || state.selectedModel !== binding.model
  ) throw new Error("canary_state_provider_binding_mismatch");

  const allLegacyReceipts = receipts.every((receipt) => (
    receipt.baseUrlDigest == null && receipt.compatibilityReceiptDigest == null
  ));
  for (const container of [state, cache]) {
    if (container.runtimeBinding) {
      if (canonicalJson(container.runtimeBinding) !== canonicalJson(binding)) throw new Error("canary_runtime_binding_mismatch");
    } else if (!(allowLegacyBinding && allLegacyReceipts)) {
      throw new Error("canary_runtime_binding_missing");
    }
  }

  const expectedKeys = tasks.map((task) => task.requestKey);
  assertUniqueKeys(expectedKeys, "canary_task_request_key_duplicate");
  assertExactOrderedKeys(queryLog.map((item) => item.requestKey), expectedKeys, "canary_query_task_key_parity_mismatch");
  assertExactOrderedKeys(receipts.map((item) => item.requestKey), expectedKeys, "canary_receipt_task_key_parity_mismatch");
  assertExactKeySet(Object.keys(cache.entries ?? {}), expectedKeys, "canary_cache_task_key_parity_mismatch");
  assertExactKeySet(Object.keys(state.reservations ?? {}), expectedKeys, "canary_reservation_task_key_parity_mismatch");

  for (let index = 0; index < tasks.length; index += 1) {
    const task = tasks[index];
    const query = queryLog[index];
    const receipt = receipts[index];
    const cachedReceipt = cache.entries[task.requestKey];
    const reservation = state.reservations[task.requestKey];
    const queryExpected = {
      schema: "m2.v2.canary-query-log.v0.1",
      privateOnly: true,
      ordinal: index + 1,
      canaryManifestDigest: manifest.canaryManifestDigest,
      requestKey: task.requestKey,
      runKind: task.runKind,
      workReference: task.workReference,
      identityDigest: task.identityDigest,
      workTitle: task.title,
      authorByline: task.author,
      sourceType: task.sourceType,
      queryId: task.queryId,
      queryHash: task.queryHash,
      queryCategory: task.queryCategory,
      queryText: task.queryText,
      queryTemplateVersion: task.queryTemplateVersion,
      prohibitedFieldsTransmitted: false,
      automaticRetry: false,
    };
    if (Object.entries(queryExpected).some(([key, value]) => query[key] !== value)) {
      throw new Error("canary_query_task_field_parity_mismatch");
    }
    if (canonicalJson(query.outboundDataFields) !== canonicalJson(task.outboundDataFields)) {
      throw new Error("canary_query_outbound_field_parity_mismatch");
    }
    assertReceiptMatchesTask(receipt, task, binding, { allowLegacyBinding });
    if (canonicalJson(cachedReceipt) !== canonicalJson(receipt)) throw new Error("canary_cache_receipt_parity_mismatch");
    if (
      reservation.requestKey !== task.requestKey
      || reservation.runKind !== task.runKind
      || reservation.identityDigest !== task.identityDigest
      || reservation.ordinal !== index + 1
      || reservation.receiptDigest !== receipt.receiptDigest
    ) throw new Error("canary_reservation_receipt_parity_mismatch");
    const expectedReservationStatus = receipt.status === "indeterminate_after_crash"
      ? "indeterminate_after_crash"
      : "completed";
    if (reservation.status !== expectedReservationStatus) throw new Error("canary_reservation_status_parity_mismatch");
  }

  const dispatchedCount = receipts.filter((item) => item.dispatched === true).length;
  const successCount = receipts.filter((item) => item.status === "success").length;
  if (
    state.requestCap !== CANARY_REQUEST_CAP
    || state.plannedRequestCount !== tasks.length
    || state.requestCount !== dispatchedCount
    || state.completedReceiptCount !== receipts.length
    || state.successCount !== successCount
  ) throw new Error("canary_state_count_parity_mismatch");
  return {
    taskCount: tasks.length,
    receiptCount: receipts.length,
    stateDigestValid: true,
    runtimeBindingMode: state.runtimeBinding && cache.runtimeBinding ? "explicit" : "legacy_inferred",
  };
}

function assertUniqueKeys(keys, errorCode) {
  if (new Set(keys).size !== keys.length) throw new Error(errorCode);
}

function assertExactOrderedKeys(actual, expected, errorCode) {
  assertUniqueKeys(actual, errorCode);
  if (canonicalJson(actual) !== canonicalJson(expected)) throw new Error(errorCode);
}

function assertExactKeySet(actual, expected, errorCode) {
  assertUniqueKeys(actual, errorCode);
  if (canonicalJson([...actual].sort()) !== canonicalJson([...expected].sort())) throw new Error(errorCode);
}

function interruptedReceipt(task, reservation, adapter) {
  const payload = {
    schema: "m2.v2.canary-provider-receipt.v0.1",
    privateOnly: true,
    requestKey: task.requestKey,
    runKind: task.runKind,
    workReference: task.workReference,
    identityDigest: task.identityDigest,
    queryId: task.queryId,
    queryHash: task.queryHash,
    queryCategory: task.queryCategory,
    providerId: adapter.providerId,
    providerVersion: adapter.providerVersion,
    providerMode: adapter.mode,
    model: adapter.model,
    baseUrlDigest: adapter.baseUrlDigest ?? null,
    compatibilityReceiptDigest: adapter.compatibilityReceiptDigest ?? null,
    endpointPath: "/responses",
    startedAt: reservation.reservedAt,
    capturedAt: new Date().toISOString(),
    dispatched: true,
    status: "indeterminate_after_crash",
    httpStatus: null,
    requestPayloadDigest: null,
    responseDigest: null,
    responseByteLength: 0,
    responseOverSizeLimit: false,
    requestIdDigest: null,
    transportError: { name: "process_interrupted_after_budget_reservation", code: null },
    semanticChecks: { responsesShapeValid: false, webSearchObserved: false, strictJsonValid: false, validationIssues: ["indeterminate_after_crash"] },
    outputTextDigest: null,
    structuredResponse: null,
    citations: [],
    citationCount: 0,
    resultCount: 0,
    usage: { inputTokens: null, outputTokens: null, totalTokens: null },
    providerReportedCostCny: null,
    pricingMethod: "provider_pricing_unavailable",
    latencyMs: null,
    rawResponsePersisted: false,
    authorizationHeaderPersisted: false,
    apiKeyPersisted: false,
  };
  return { ...payload, receiptDigest: sha256(payload) };
}

function buildPrivateQueryLog(tasks, manifest) {
  return tasks.map((task, index) => ({
    schema: "m2.v2.canary-query-log.v0.1",
    privateOnly: true,
    ordinal: index + 1,
    canaryManifestDigest: manifest.canaryManifestDigest,
    requestKey: task.requestKey,
    runKind: task.runKind,
    workReference: task.workReference,
    identityDigest: task.identityDigest,
    workTitle: task.title,
    authorByline: task.author,
    sourceType: task.sourceType,
    queryId: task.queryId,
    queryHash: task.queryHash,
    queryCategory: task.queryCategory,
    queryText: task.queryText,
    queryTemplateVersion: task.queryTemplateVersion,
    outboundDataFields: task.outboundDataFields,
    prohibitedFieldsTransmitted: task.prohibitedFieldsTransmitted,
    excludedFields: ["internal_id", "income", "rating", "channel", "rights", "internal_note"],
    automaticRetry: false,
  }));
}

function buildCostLedger(receipts, workCount) {
  const dispatched = receipts.filter((item) => item.dispatched);
  const reportedCosts = dispatched.map((item) => item.providerReportedCostCny);
  const costProven = dispatched.length > 0 && reportedCosts.every(Number.isFinite);
  const totalCost = costProven ? sum(reportedCosts) : null;
  const usageObserved = dispatched.filter((item) => (
    Number.isFinite(item.usage?.inputTokens)
    && Number.isFinite(item.usage?.outputTokens)
    && Number.isFinite(item.usage?.totalTokens)
  ));
  const usageObservedRequestCount = usageObserved.length;
  const usageMissingRequestCount = dispatched.length - usageObservedRequestCount;
  const tokenUsageComplete = dispatched.length > 0 && usageMissingRequestCount === 0;
  const observedInputTokens = sum(usageObserved.map((item) => item.usage.inputTokens));
  const observedOutputTokens = sum(usageObserved.map((item) => item.usage.outputTokens));
  const observedTotalTokens = sum(usageObserved.map((item) => item.usage.totalTokens));
  const inputTokens = tokenUsageComplete ? observedInputTokens : null;
  const outputTokens = tokenUsageComplete ? observedOutputTokens : null;
  const totalTokens = tokenUsageComplete ? observedTotalTokens : null;
  const latencies = dispatched.map((item) => item.latencyMs).filter(Number.isFinite);
  const budgetCny = workCount * 2.5;
  const perWorkCost = costProven ? ratio(totalCost, workCount) : null;
  const perQueryCost = costProven ? ratio(totalCost, dispatched.length) : null;
  const withinBudget = costProven && totalCost <= budgetCny && perWorkCost <= 2.5 && perQueryCost <= 0.3;
  return {
    schema: "m2.v2.canary-cost-latency-ledger.v0.1",
    privateOnly: true,
    requestCount: dispatched.length,
    usageObservedRequestCount,
    usageMissingRequestCount,
    tokenUsageComplete,
    observedInputTokens,
    observedOutputTokens,
    observedTotalTokens,
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedRelayCostCny: totalCost,
    pricingStatus: costProven ? "provider_reported" : "provider_pricing_unavailable",
    officialOpenAiPricingAssumed: false,
    budgetCny,
    maxCostPerWorkCny: 2.5,
    maxCostPerQueryCny: 0.3,
    perWorkCostCny: perWorkCost,
    perQueryCostCny: perQueryCost,
    costProven,
    withinBudget,
    latencyP50Ms: percentile(latencies, 0.5),
    latencyP90Ms: percentile(latencies, 0.9),
  };
}

function buildCanaryMetrics({
  manifest,
  state,
  queryLog,
  receipts,
  evidence,
  entity,
  contradictions,
  reproducibility,
  cost,
  taskRequestAccounting = null,
}) {
  const primaryEvidence = evidence.filter((item) => item.runKind === "primary");
  const accepted = primaryEvidence.filter((item) => item.disposition === "accepted");
  const rejected = primaryEvidence.filter((item) => item.disposition === "rejected");
  const dispatched = receipts.filter((item) => item.dispatched);
  const relayDeclaredSuccessful = dispatched.filter((item) => item.status === "success");
  const successful = relayDeclaredSuccessful.filter((item) => validateStructuredRelayOutput(item.structuredResponse).valid);
  const localStrictSchemaInvalidCount = relayDeclaredSuccessful.length - successful.length;
  const resolved = entity.filter((item) => item.resolutionStatus === "resolved");
  const candidateAligned = primaryEvidence.filter((item) => item.citationAlignment);
  const acceptedAligned = accepted.filter((item) => item.citationAlignment);
  const rejectionReasons = countBy(rejected.flatMap((item) => item.rejectionReasons), (item) => item);
  const providerErrors = countBy(dispatched.filter((item) => item.status !== "success"), (item) => item.status);
  if (localStrictSchemaInvalidCount > 0) providerErrors.local_strict_schema_invalid = localStrictSchemaInvalidCount;
  const citationAnnotationObservedCount = sum(dispatched.map((item) => item.citationCount ?? item.citations?.length ?? 0));
  const sourceAllowlistRejected = primaryEvidence.filter((item) => item.sourceQuality?.allowlistAccepted !== true).length;
  const prohibitedAccepted = accepted.filter((item) => item.sourceQuality?.prohibited === true).length;
  const confidenceBands = (selector) => {
    const observed = countBy(entity, selector);
    return Object.fromEntries(["high", "medium", "low", "unresolved"].map((band) => [band, observed[band] ?? 0]));
  };
  const primaryCandidateCount = primaryEvidence.length;
  const acceptedCandidateCount = accepted.length;
  const rawConflictGroups = contradictions.filter((item) => item.rawStatus === "unresolved");
  const admissibleConflictGroups = contradictions.filter((item) => item.admissibleStatus?.startsWith("unresolved"));
  return {
    schema: "m2.v2.canary-metrics.v0.1",
    canary: {
      count: manifest.sample.length,
      uniqueCount: new Set(manifest.sample.map((item) => item.standardWorkId)).size,
      parentManifestDigest: manifest.parentManifestDigest,
      canaryManifestDigest: manifest.canaryManifestDigest,
      seed: manifest.seed,
      coverage: manifest.coverage,
    },
    retrieval: {
      plannedCount: queryLog.length,
      requestCount: dispatched.length,
      primaryRequestCount: receipts.filter((item) => item.runKind === "primary").length,
      repeatRequestCount: receipts.filter((item) => item.runKind === "repeat").length,
      successCount: successful.length,
      successRate: ratio(successful.length, dispatched.length),
      relayDeclaredSuccessCount: relayDeclaredSuccessful.length,
      relayDeclaredSuccessRate: ratio(relayDeclaredSuccessful.length, dispatched.length),
      localStrictSchemaInvalidCount,
      providerErrors,
      requestCap: CANARY_REQUEST_CAP,
      maxQueriesPerWork: Math.max(...Object.values(countBy(queryLog, (item) => item.workReference))),
    },
    entity: {
      resolvedCount: resolved.length,
      unresolvedCount: entity.filter((item) => item.resolutionStatus === "unresolved").length,
      ambiguousCount: entity.filter((item) => item.resolutionStatus === "ambiguous").length,
      resolutionRate: ratio(resolved.length, entity.length),
      workConfidenceBands: confidenceBands((item) => item.workIdentity.status),
      authorConfidenceBands: confidenceBands((item) => item.authorIdentity.status),
      titleOnlyRejectedCount: entity.filter((item) => item.titleOnlyRejected).length,
    },
    evidence: {
      candidateCount: primaryEvidence.length,
      acceptedCount: accepted.length,
      rejectedCount: rejected.length,
      rejectionReasons,
      historicalBackfillCount: primaryEvidence.filter((item) => item.historicalBackfill === true).length,
    },
    citation: {
      candidateAlignedCount: candidateAligned.length,
      candidateAlignmentRate: ratio(candidateAligned.length, primaryEvidence.length),
      acceptedAlignedCount: acceptedAligned.length,
      acceptedAlignmentRate: ratio(acceptedAligned.length, accepted.length),
      providerAnnotationObservedCount: citationAnnotationObservedCount,
      requiredAlignmentLevel: "same_output_text_item_exact_url",
    },
    time: {
      primaryCandidateDenominator: primaryCandidateCount,
      capturedAtCompleteness: ratio(primaryEvidence.filter((item) => item.capturedAt).length, primaryEvidence.length),
      availableAtCompleteness: ratio(primaryEvidence.filter((item) => item.availableAt).length, primaryEvidence.length),
      eventTimeCompleteness: ratio(primaryEvidence.filter((item) => item.eventTime).length, primaryEvidence.length),
      acceptedCandidateDenominator: acceptedCandidateCount,
      acceptedCapturedAtCompleteness: ratio(accepted.filter((item) => item.capturedAt).length, acceptedCandidateCount),
      acceptedAvailableAtCompleteness: ratio(accepted.filter((item) => item.availableAt).length, acceptedCandidateCount),
      acceptedEventTimeCompleteness: ratio(accepted.filter((item) => item.eventTime).length, acceptedCandidateCount),
    },
    source: {
      approvedDomainEntryCount: 0,
      allowlistRejectedCandidateCount: sourceAllowlistRejected,
      prohibitedAcceptedCount: prohibitedAccepted,
      acceptedAllowlistCompliance: ratio(accepted.filter((item) => item.sourceQuality?.allowlistAccepted).length, accepted.length),
    },
    contradiction: {
      groupCount: contradictions.length,
      rawConflictGroupCount: rawConflictGroups.length,
      rawConflictSegmentCount: sum(rawConflictGroups.map((item) => (item.segments ?? []).filter((segment) => segment.rawStatus === "unresolved").length)),
      admissibleConflictGroupCount: admissibleConflictGroups.length,
      admissibleConflictSegmentCount: sum(admissibleConflictGroups.map((item) => (item.segments ?? []).filter((segment) => segment.admissibleStatus?.startsWith("unresolved")).length)),
      rejectedClaimsMayVetoAdmissible: false,
      llmSelectedWinnerCount: contradictions.filter((item) => item.llmSelectedWinner === true).length,
    },
    reproducibility: {
      repeatWorkCount: reproducibility.repeatWorkCount,
      evaluableWorkCount: reproducibility.evaluableWorkCount,
      claimAgreement: reproducibility.claimAgreement,
      sourceOverlap: reproducibility.sourceOverlap,
      basis: reproducibility.basis,
      admissibleEvaluableWorkCount: reproducibility.admissibleEvaluableWorkCount,
      admissibleClaimAgreement: reproducibility.admissibleClaimAgreement,
    },
    cost: {
      requestCount: cost.requestCount,
      usageObservedRequestCount: cost.usageObservedRequestCount,
      usageMissingRequestCount: cost.usageMissingRequestCount,
      tokenUsageComplete: cost.tokenUsageComplete,
      observedInputTokens: cost.observedInputTokens,
      observedOutputTokens: cost.observedOutputTokens,
      observedTotalTokens: cost.observedTotalTokens,
      inputTokens: cost.inputTokens,
      outputTokens: cost.outputTokens,
      totalTokens: cost.totalTokens,
      estimatedRelayCostCny: cost.estimatedRelayCostCny,
      pricingStatus: cost.pricingStatus,
      officialOpenAiPricingAssumed: false,
      budgetCny: cost.budgetCny,
      costProven: cost.costProven,
      withinBudget: cost.withinBudget,
      latencyP50Ms: cost.latencyP50Ms,
      latencyP90Ms: cost.latencyP90Ms,
    },
    taskRequestAccounting,
    execution: {
      status: state.executionStatus,
      providerId: state.providerId,
      providerVersion: state.providerVersion,
      selectedModel: state.selectedModel,
      runtimeBindingMode: state.runtimeBinding?.bindingMode ?? "legacy_inferred",
    },
  };
}

function buildPublicReportPayloads(root, metrics, decision, fullValidation, audit = {}) {
  const modelAssessment = buildModelAssessment(root, metrics, audit.taskRequestAccounting);
  const auditStatus = {
    privateArtifactsIgnoredAndUntracked: audit.privateArtifactsIgnoredAndUntracked === true,
    publicPrivacyLeakCount: Number.isInteger(audit.publicPrivacyLeakCount) ? audit.publicPrivacyLeakCount : null,
    reviewWorkbookPresentAndXlsxContainerValid: audit.reviewWorkbookPresentAndXlsxContainerValid === true,
  };
  const commonBoundaries = {
    notForFormalDecision: true,
    full160Executed: false,
    modelTrainingPerformed: false,
    b4Changed: false,
    prdChanged: false,
    finalHoldoutOpened: false,
    v2CStarted: false,
    v2DStarted: false,
    c4Started: false,
    m3Started: false,
    released: false,
  };
  const execution = {
    schema: "m2.v2.canary-execution-summary.v0.1",
    status: "not_for_formal_decision",
    executionBaseCommit: CANARY_START_COMMIT,
    canary: {
      count: metrics.canary.count,
      uniqueCount: metrics.canary.uniqueCount,
      parentManifestDigest: metrics.canary.parentManifestDigest,
      canaryManifestDigest: metrics.canary.canaryManifestDigest,
      seed: metrics.canary.seed,
      requiredCoverageAchieved: Object.values(metrics.canary.coverage).every(Boolean),
      coverageDimensions: metrics.canary.coverage,
    },
    provider: { status: "READY_FOR_CANARY_EXECUTED", thirdPartyRelay: true, officialOpenAiService: false },
    retrieval: metrics.retrieval,
    taskRequestAccounting: audit.taskRequestAccounting,
    entity: metrics.entity,
    evidence: metrics.evidence,
    citation: metrics.citation,
    time: metrics.time,
    sourceQuality: metrics.source,
    contradiction: metrics.contradiction,
    reproducibility: metrics.reproducibility,
    costLatency: metrics.cost,
    modelAssessment,
    auditStatus,
    boundaries: commonBoundaries,
  };
  const quality = {
    schema: "m2.v2.canary-quality-report.v0.1",
    status: "not_for_formal_decision",
    acceptanceContract: {
      version: "m2.v2.canary-evidence-envelope.v0.1",
      requiredFields: ["sourceUrl", "sourceTitle", "sourceDomain", "capturedAt", "availableAt", "eventTime", "claimType", "structuredValue", "confidence", "citationAlignment"],
      missingCitationIdentityOrTimestampRejected: true,
      titleOnlyResolutionAllowed: false,
      emptyDenominatorTreatedAsPerfect: false,
    },
    retrieval: metrics.retrieval,
    entityResolution: metrics.entity,
    evidenceFunnel: metrics.evidence,
    citationAlignment: metrics.citation,
    timestampCompleteness: metrics.time,
    sourceGovernance: {
      ...metrics.source,
      allowlistStatus: "empty_fail_closed",
      unapprovedDomainAccepted: false,
    },
    contradictionHandling: metrics.contradiction,
    reproducibility: metrics.reproducibility,
    costLatency: metrics.cost,
    modelAssessment,
    auditStatus,
    taskRequestAccounting: audit.taskRequestAccounting,
    validation: {
      commandCount: fullValidation.commandCount,
      passedCount: fullValidation.passedCount,
      allPassed: fullValidation.allPassed,
    },
    boundaries: commonBoundaries,
  };
  const decisionReport = {
    schema: "m2.v2.canary-decision.v0.1",
    status: "not_for_formal_decision",
    decision: decision.decision,
    conditions: decision.conditions,
    hardSafetyAllPassed: decision.hardSafetyAllPassed,
    allConditionsPassed: decision.allPassed,
    blockers: decision.blockers,
    allowFull160Pilot: decision.allowFull160Pilot,
    full160Readiness: decision.allowFull160Pilot ? "READY_FOR_SEPARATE_USER_AUTHORIZATION" : "NOT_READY",
    full160ExecutionAuthorizedByThisRun: false,
    recommendation: decision.allowFull160Pilot ? "WAIT_FOR_EXPLICIT_FULL_160_AUTHORIZATION" : "STOP_BEFORE_FULL_160",
    modelRecommendation: modelAssessment.recommendation,
    auditStatus,
    taskRequestAccounting: audit.taskRequestAccounting,
    boundaries: commonBoundaries,
  };
  return { execution, quality, decision: decisionReport };
}

function buildTaskRequestAccounting(root, canaryCost) {
  const path = join(root, LUNA_SYNTHETIC_RECEIPT_RELATIVE);
  const luna = existsSync(path) ? readJson(path) : null;
  return buildTaskRequestAccountingFromReceipt(canaryCost, luna);
}

export function buildTaskRequestAccountingFromReceipt(canaryCost, luna) {
  const supplementalRequestCount = Number.isInteger(luna?.requestCount) && luna.requestCount >= 0 ? luna.requestCount : 0;
  const supplementalResults = Array.isArray(luna?.results) ? luna.results : [];
  const supplementalUsageObserved = supplementalResults.filter((item) => (
    Number.isFinite(item.inputTokens) && Number.isFinite(item.outputTokens) && Number.isFinite(item.totalTokens)
  ));
  const supplementalUsageObservedRequestCount = supplementalUsageObserved.length;
  const supplementalUsageMissingRequestCount = Math.max(0, supplementalRequestCount - supplementalUsageObservedRequestCount);
  const supplementalInputTokens = sum(supplementalUsageObserved.map((item) => item.inputTokens));
  const supplementalOutputTokens = sum(supplementalUsageObserved.map((item) => item.outputTokens));
  const supplementalTotalTokens = sum(supplementalUsageObserved.map((item) => item.totalTokens));
  const supplementalTokenUsageComplete = supplementalResults.length === supplementalRequestCount
    && supplementalUsageMissingRequestCount === 0;
  const receiptPayload = luna ? Object.fromEntries(Object.entries(luna).filter(([key]) => key !== "receiptDigest")) : null;
  const contentIntegrityPassed = !luna || (
    luna.schema === "m2.v2.luna-synthetic-capability-receipt.v0.1"
    && luna.privateOnly === true
    && luna.rawResponsesPersisted === false
    && luna.apiKeyPersisted === false
    && luna.authorizationHeaderPersisted === false
    && luna.syntheticOnly === true
    && luna.realWorkDataTransmitted === false
    && supplementalResults.length === supplementalRequestCount
    && typeof luna.receiptDigest === "string"
    && sha256(JSON.stringify(receiptPayload)) === luna.receiptDigest
  );
  const totalProviderRequestCountThisTask = canaryCost.requestCount + supplementalRequestCount;
  const canaryTokensComplete = canaryCost.tokenUsageComplete === true;
  const providerBindingProven = supplementalRequestCount === 0;
  const eligibleForModelDecision = supplementalRequestCount === 0;
  const taskTokenUsageComplete = canaryTokensComplete && supplementalTokenUsageComplete;
  return {
    evidenceCanaryRequestCount: canaryCost.requestCount,
    realWorkRequestCount: canaryCost.requestCount,
    supplementalSyntheticRequestCount: supplementalRequestCount,
    totalProviderRequestCountThisTask,
    taskRequestCap: CANARY_REQUEST_CAP,
    withinTaskRequestCap: totalProviderRequestCountThisTask <= CANARY_REQUEST_CAP,
    realWorkDisclosureApprovalCap: CANARY_TOTAL_PLANNED_REQUESTS,
    realWorkCallsWithinApproval: canaryCost.requestCount <= CANARY_TOTAL_PLANNED_REQUESTS,
    supplementalSyntheticOnly: !luna || (luna.syntheticOnly === true && luna.realWorkDataTransmitted === false),
    contentIntegrityPassed,
    providerBindingProven,
    supplementalProviderBindingProven: providerBindingProven,
    providerBindingLimitation: providerBindingProven ? null : "supplemental_receipt_lacks_provider_base_url_and_compatibility_binding",
    eligibleForModelDecision,
    canaryUsageObservedRequestCount: canaryCost.usageObservedRequestCount,
    canaryUsageMissingRequestCount: canaryCost.usageMissingRequestCount,
    canaryTokenUsageComplete: canaryTokensComplete,
    canaryObservedInputTokens: canaryCost.observedInputTokens,
    canaryObservedOutputTokens: canaryCost.observedOutputTokens,
    canaryObservedTotalTokens: canaryCost.observedTotalTokens,
    canaryInputTokens: canaryCost.inputTokens,
    canaryOutputTokens: canaryCost.outputTokens,
    canaryTotalTokens: canaryCost.totalTokens,
    supplementalUsageObservedRequestCount,
    supplementalUsageMissingRequestCount,
    supplementalTokenUsageComplete,
    supplementalInputTokens,
    supplementalOutputTokens,
    supplementalTotalTokens,
    taskUsageObservedRequestCount: canaryCost.usageObservedRequestCount + supplementalUsageObservedRequestCount,
    taskUsageMissingRequestCount: canaryCost.usageMissingRequestCount + supplementalUsageMissingRequestCount,
    taskTokenUsageComplete,
    taskObservedInputTokens: canaryCost.observedInputTokens + supplementalInputTokens,
    taskObservedOutputTokens: canaryCost.observedOutputTokens + supplementalOutputTokens,
    taskObservedTotalTokens: canaryCost.observedTotalTokens + supplementalTotalTokens,
    taskInputTokens: taskTokenUsageComplete ? canaryCost.inputTokens + supplementalInputTokens : null,
    taskOutputTokens: taskTokenUsageComplete ? canaryCost.outputTokens + supplementalOutputTokens : null,
    taskTotalTokens: taskTokenUsageComplete ? canaryCost.totalTokens + supplementalTotalTokens : null,
    taskEstimatedRelayCostCny: null,
    taskPricingStatus: "provider_pricing_unavailable",
    officialOpenAiPricingAssumed: false,
  };
}

function inspectPrivateReviewWorkbook(privateStore) {
  const path = join(privateStore, CANARY_PRIVATE_FILES.workbook);
  if (!existsSync(path)) return { present: false, containerValid: false, byteLength: 0, digest: null, xlsxZipMagic: false };
  const bytes = readFileSync(path);
  const xlsxZipMagic = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  const byteLength = statSync(path).size;
  return {
    present: true,
    containerValid: xlsxZipMagic && byteLength >= 4096,
    byteLength,
    digest: sha256(bytes.toString("base64")),
    xlsxZipMagic,
  };
}

function buildModelAssessment(root, metrics, taskRequestAccounting = null) {
  const path = join(root, LUNA_SYNTHETIC_RECEIPT_RELATIVE);
  const luna = existsSync(path) ? readJson(path) : null;
  const lunaWebSearchPassed = luna?.results?.every((item) => item.webSearchObserved === true) === true;
  const lunaStrictJsonPassed = luna?.results?.every((item) => item.strictJsonValid === true) === true;
  const lunaCitationPassed = luna?.results?.every((item) => item.urlCitationCount > 0) === true;
  return {
    canaryModel: metrics.execution.selectedModel,
    canaryMetricsRemainSingleModel: true,
    lunaProbeSeparatedFromCanaryMetrics: true,
    lunaProbeSyntheticOnly: luna?.syntheticOnly === true,
    lunaRealWorkDataTransmitted: false,
    lunaContentIntegrityPassed: taskRequestAccounting?.contentIntegrityPassed ?? false,
    lunaProviderBindingProven: taskRequestAccounting?.providerBindingProven ?? false,
    lunaEligibleForModelDecision: taskRequestAccounting?.eligibleForModelDecision ?? false,
    lunaRequestCount: luna?.requestCount ?? 0,
    lunaSuccessCount: luna?.successCount ?? 0,
    lunaWebSearchPassed,
    lunaStrictJsonPassed,
    lunaCitationPassed,
    lunaLatencyP50Ms: luna?.latencyP50Ms ?? null,
    lunaLatencyP90Ms: luna?.latencyP90Ms ?? null,
    terraLatencyP50Ms: metrics.cost.latencyP50Ms,
    terraLatencyP90Ms: metrics.cost.latencyP90Ms,
    latencyComparisonValid: false,
    latencyComparisonLimitation: "different_sample_size_and_synthetic_vs_real_work_load",
    totalProviderRequestCountThisTask: taskRequestAccounting?.totalProviderRequestCountThisTask ?? metrics.retrieval.requestCount,
    switchedDuringCanary: false,
    recommendation: "NO_MODEL_SWITCH_DECISION_IN_THIS_CANARY; LUNA_SYNTHETIC_NOT_COMPARABLE; RETEST_REQUIRES_SEPARATE_FULL_CAPABILITY_AND_CITATION_GATE",
  };
}

function scanPublicPayloads({ root, reports, manifest, queryLog, evidence, throwOnLeak = false }) {
  const serialized = [
    JSON.stringify(reports),
    renderExecutionMarkdown(reports.execution),
    renderQualityMarkdown(reports.quality),
    renderDecisionMarkdown(reports.decision),
  ].join("\n");
  const violations = [];
  for (const report of Object.values(reports)) {
    try {
      assertPublicSanitized(report);
    } catch (error) {
      violations.push(error.message);
    }
  }
  const privateValues = new Set();
  for (const work of manifest.sample) {
    for (const value of [work.standardWorkId, work.title, work.author, work.identityDigest]) if (value) privateValues.add(String(value));
  }
  for (const query of queryLog) if (query.queryText) privateValues.add(String(query.queryText));
  for (const item of evidence) {
    for (const value of [item.sourceUrl, item.sourceTitle, item.sourceDomain]) if (value) privateValues.add(String(value));
  }
  for (const value of privateValues) if (value.length >= 2 && serialized.includes(value)) violations.push(`private_value:${sha256(value)}`);
  if (/authorization\s*[:=]|bearer\s+[a-z0-9._-]+|openai_api_key\s*[:=]|sk-[a-z0-9_-]{8,}/iu.test(serialized)) violations.push("secret_pattern");
  const env = readEnvLocal(join(root, ".env.local"));
  if (env.OPENAI_API_KEY && serialized.includes(env.OPENAI_API_KEY)) violations.push("exact_api_key");
  const result = { leakCount: [...new Set(violations)].length, violationDigests: [...new Set(violations)].map((item) => sha256(item)) };
  if (throwOnLeak && result.leakCount) throw new Error("canary_public_privacy_scan_failed");
  return result;
}

function buildPrivateReviewPack(manifest, entity, evidence, state) {
  const entityByWork = new Map(entity.map((item) => [item.workReference, item]));
  return {
    schema: "m2.v2.canary-private-review-pack.v0.1",
    privateOnly: true,
    canaryManifestDigest: manifest.canaryManifestDigest,
    executionStatus: state.executionStatus,
    instructions: [
      "仅核对实体、证据、来源、时间和矛盾；不得填写收入、评级、渠道、版权或内部备注。",
      "所有人工反馈只用于 canary 质量复核，不自动批准来源或 full 160。",
    ],
    workReview: manifest.sample.map((work) => ({
      workReference: work.standardWorkId,
      workTitle: work.title,
      authorByline: work.author,
      sourceType: work.sourceType,
      entityStatus: entityByWork.get(work.standardWorkId)?.resolutionStatus ?? "unresolved",
      workIdentityConfidence: entityByWork.get(work.standardWorkId)?.workIdentity?.status ?? "unresolved",
      authorIdentityConfidence: entityByWork.get(work.standardWorkId)?.authorIdentity?.status ?? "unresolved",
      reviewerEntityDecision: "待抽检",
      reviewerNote: "",
    })),
    evidenceReview: evidence.filter((item) => item.runKind === "primary").map((item) => ({
      workReference: item.workReference,
      evidenceId: item.evidenceId,
      sourceUrl: item.sourceUrl,
      sourceTitle: item.sourceTitle,
      sourceDomain: item.sourceDomain,
      claimType: item.claimType,
      capturedAt: item.capturedAt,
      availableAt: item.availableAt,
      eventTime: item.eventTime,
      citationAlignment: item.citationAlignment,
      confidence: item.confidence,
      disposition: item.disposition,
      rejectionReasons: item.rejectionReasons.join(";"),
      reviewerAccuracyDecision: "待抽检",
      reviewerSourceDecision: "待抽检",
      reviewerNote: "",
    })),
  };
}

function loadRelayConfiguration(root, options = {}) {
  const env = readEnvLocal(join(root, ".env.local"));
  const compatibility = readJson(join(root, COMPATIBILITY_RECEIPT_RELATIVE));
  const binding = validateCompatibilityReceipt(compatibility, env);
  const baseUrl = binding.baseUrl;
  const apiKey = String(env.OPENAI_API_KEY ?? "");
  if (options.requireApiKey !== false && !apiKey) throw new Error("canary_relay_env_incomplete");
  return { env, compatibility, binding, baseUrl, apiKey, model: binding.model };
}

export function validateCompatibilityReceipt(receipt, env = {}) {
  if (receipt?.schema !== "m2.v2.openai-compatible-relay-compatibility-receipt.v0.1") {
    throw new Error("canary_compatibility_receipt_schema_invalid");
  }
  const { receiptDigest, ...payload } = receipt;
  if (!receiptDigest || receiptDigest !== sha256(canonicalJson(payload))) {
    throw new Error("canary_compatibility_receipt_digest_invalid");
  }
  if (
    receipt.privateOnly !== true
    || receipt.thirdPartyRelay !== true
    || receipt.officialOpenAIService !== false
    || receipt.scope !== "synthetic_capability_probe_only"
    || receipt.readiness !== "READY"
    || !Array.isArray(receipt.blockers)
    || receipt.blockers.length !== 0
  ) throw new Error("canary_compatibility_receipt_not_ready");
  if (
    receipt.rawResponsesPersisted !== false
    || receipt.authorizationHeaderPersisted !== false
    || receipt.apiKeyPersistedInReceipt !== false
  ) throw new Error("canary_compatibility_receipt_security_contract_invalid");

  const model = String(receipt.selectedModel ?? "");
  const capabilities = receipt.modelCapabilities?.[model];
  const requiredCapabilities = [
    "responsesHttpAccepted",
    "responsesShapeCompatible",
    "responsesOutputTextObserved",
    "basicResponsesCompatible",
    "webSearchHttpAccepted",
    "webSearchToolCallObserved",
    "webSearchSupported",
    "urlCitationAnnotationSupported",
    "strictJsonSchemaRequestAccepted",
    "strictJsonOutputParseable",
    "strictJsonOutputValid",
  ];
  if (
    !model
    || receipt.models?.endpointSupported !== true
    || receipt.responses?.endpointObserved !== true
    || !receipt.models?.returnedModelIds?.includes(model)
    || !receipt.models?.probedModelIds?.includes(model)
    || !capabilities
    || requiredCapabilities.some((key) => capabilities[key] !== true)
    || !capabilities.citationAnnotationTypes?.includes("url_citation")
    || !(Number(capabilities.urlCitationAnnotationCount) > 0)
  ) throw new Error("canary_compatibility_capability_contract_invalid");

  if (env.M2_V2_EVIDENCE_PROVIDER !== "openai_compatible_relay") throw new Error("canary_provider_mode_invalid");
  const receiptBaseUrl = normalizeBaseUrl(receipt.baseUrl);
  const configuredBaseUrls = [env.OPENAI_BASE_URL, env.M2_V2_EVIDENCE_API_BASE_URL]
    .filter((value) => String(value ?? "").trim())
    .map(normalizeBaseUrl);
  if (!receiptBaseUrl || configuredBaseUrls.length === 0 || configuredBaseUrls.some((value) => value !== receiptBaseUrl)) {
    throw new Error("canary_compatibility_base_url_binding_mismatch");
  }
  return Object.freeze({
    providerId: "openai_compatible_relay",
    providerVersion: "canary-v0.1",
    providerMode: "web_search",
    baseUrl: receiptBaseUrl,
    baseUrlDigest: sha256(receiptBaseUrl),
    model,
    compatibilityReceiptDigest: receiptDigest,
  });
}

export function assertCanaryManifest(manifest, parentManifest, options = {}) {
  if (manifest?.schema !== "m2.v2.evidence-canary-private-manifest.v0.1") throw new Error("canary_manifest_schema_invalid");
  if (manifest?.immutable !== true || manifest?.derivedSubset !== true || manifest?.status !== "frozen_before_canary_retrieval") {
    throw new Error("canary_manifest_not_frozen");
  }
  const expectedParentManifestDigest = options.expectedParentManifestDigest ?? EXPECTED_PARENT_MANIFEST_DIGEST;
  const { manifestDigest: parentDigest, ...parentPayload } = parentManifest ?? {};
  if (!parentDigest || parentDigest !== sha256(parentPayload)) throw new Error("canary_parent_manifest_digest_invalid");
  if (parentDigest !== expectedParentManifestDigest) throw new Error("canary_parent_manifest_binding_mismatch");
  if (manifest.parentManifestDigest !== parentDigest) throw new Error("canary_manifest_parent_digest_mismatch");
  if (!Array.isArray(manifest.sample) || manifest.sample.length !== CANARY_SIZE) throw new Error("canary_manifest_sample_count_invalid");
  if (!Array.isArray(manifest.repeatSample) || manifest.repeatSample.length !== 5) throw new Error("canary_manifest_repeat_count_invalid");
  const parentIds = new Set(parentManifest.sample.map((item) => item.standardWorkId));
  if (manifest.sample.some((item) => !parentIds.has(item.standardWorkId))) throw new Error("canary_manifest_not_parent_subset");
  const { canaryManifestDigest, ...payload } = manifest;
  if (canaryManifestDigest !== sha256(payload)) throw new Error("canary_manifest_digest_invalid");
  const replayed = selectCanarySubset(parentManifest, { seed: manifest.seed });
  assertReplaySelectionMatchesManifest(manifest, replayed);
  if (!Object.values(evaluateCanaryCoverage(manifest.sample)).every(Boolean)) throw new Error("canary_manifest_coverage_invalid");
  assertTaskBudget(buildCanaryTasks(manifest));
}

function assertReplaySelectionMatchesManifest(manifest, selection) {
  const replayedSample = selection.selected.map((item) => ({ ...item }));
  if (canonicalJson(manifest.sample) !== canonicalJson(replayedSample)) throw new Error("canary_selection_replay_mismatch");
  const replayedRepeats = selection.repeatWorks.map((item) => ({
    standardWorkId: item.standardWorkId,
    identityDigest: item.identityDigest,
  }));
  if (canonicalJson(manifest.repeatSample) !== canonicalJson(replayedRepeats)) {
    throw new Error("canary_repeat_selection_replay_mismatch");
  }
}

function acceptedEvidenceContractPassed(item) {
  return Boolean(
    item.sourceUrl && item.sourceTitle && item.sourceDomain && item.capturedAt && item.availableAt && item.eventTime &&
    item.claimType && item.structuredValue && Number.isFinite(item.confidence) && item.citationAlignment === true &&
    item.citationAlignmentLevel === "same_output_text_item_exact_url" && item.timeProvenance?.prospective === true &&
    item.entityResolution?.overall === "resolved" && item.sourceQuality?.allowlistAccepted === true &&
    item.sourceQuality?.prohibited !== true && item.historicalBackfill === false && item.rejectionReasons?.length === 0
  );
}

function assertPrivateStoreIgnored(root) {
  const ignored = git(root, ["check-ignore", "-q", PRIVATE_CANARY_RELATIVE]);
  if (ignored.status !== 0) throw new Error("canary_private_store_not_ignored");
  const tracked = git(root, ["ls-files", "--", PRIVATE_CANARY_RELATIVE]);
  if (tracked.status !== 0 || tracked.stdout.trim()) throw new Error("canary_private_store_tracked");
}

function privateStoreStatus(root) {
  return {
    ignored: git(root, ["check-ignore", "-q", PRIVATE_CANARY_RELATIVE]).status === 0,
    untracked: git(root, ["ls-files", "--", PRIVATE_CANARY_RELATIVE]).stdout.trim() === "",
  };
}

export function calibrationSealsAreClosed(spec) {
  const seals = spec?.seals;
  return seals?.finalHoldoutOpened === false
    && seals?.embargoShadowOpened === false
    && seals?.deferred60MonthLabelsOpened === false;
}

function runFullProjectValidation(root) {
  const npmEntrypoint = process.env.npm_execpath;
  if (!npmEntrypoint) throw new Error("npm_execpath_required_for_canary_validation");
  const results = FULL_VALIDATION_COMMANDS.map((command) => {
    const started = Date.now();
    const result = spawnSync(process.execPath, [npmEntrypoint, ...command.slice(1)], {
      cwd: root,
      encoding: "utf8",
      env: process.env,
      maxBuffer: 50 * 1024 * 1024,
      windowsHide: true,
    });
    return {
      command: command.join(" "),
      exitCode: result.status ?? -1,
      signal: result.signal ?? null,
      spawnErrorCode: result.error?.code ?? null,
      durationMs: Date.now() - started,
      stdoutDigest: sha256(result.stdout ?? ""),
      stderrDigest: sha256(result.stderr ?? ""),
      passed: result.status === 0,
    };
  });
  const payload = {
    schema: "m2.v2.canary-full-validation-receipt.v0.1",
    privateOnly: true,
    commandCount: results.length,
    passedCount: results.filter((item) => item.passed).length,
    allPassed: results.every((item) => item.passed),
    results,
  };
  return { ...payload, validationDigest: sha256(payload) };
}

export function renderExecutionMarkdown(report) {
  return `# M2 v2 Canary 执行摘要 v0.1

## 结论

本轮严格执行 10 部 canary，不执行完整 160。Provider contract success rate 为 ${formatRate(report.retrieval.successRate)}（relay 旧口径 ${formatRate(report.retrieval.relayDeclaredSuccessRate)}），实体联合解析率为 ${formatRate(report.entity.resolutionRate)}；primary evidence candidate / accepted / rejected 为 ${report.evidence.candidateCount} / ${report.evidence.acceptedCount} / ${report.evidence.rejectedCount}。

## 执行与质量

- canary：${report.canary.count} 部，全部来自冻结 160 manifest，固定 seed，要求的覆盖维度均已满足；
- 真实作品 canary 请求：planned / dispatched / contract-success = ${report.retrieval.plannedCount} / ${report.retrieval.requestCount} / ${report.retrieval.successCount}（relay 旧口径 success ${report.retrieval.relayDeclaredSuccessCount}），单作品最多 ${report.retrieval.maxQueriesPerWork}；
- 本任务 provider 总调用：${report.taskRequestAccounting.totalProviderRequestCountThisTask}（真实作品 ${report.taskRequestAccounting.realWorkRequestCount} + 独立 synthetic ${report.taskRequestAccounting.supplementalSyntheticRequestCount}），总上限 ${report.taskRequestAccounting.taskRequestCap}；
- citation：provider annotation observed ${report.citation.providerAnnotationObservedCount}；同一 output_text item 的 candidate alignment ${formatRate(report.citation.candidateAlignmentRate)}；accepted alignment ${formatRate(report.citation.acceptedAlignmentRate)}；
- availableAt / eventTime 完整率：${formatRate(report.time.availableAtCompleteness)} / ${formatRate(report.time.eventTimeCompleteness)}；
- token usage（已观测下界）：${formatNullable(report.taskRequestAccounting.taskObservedTotalTokens)}；usage 已观测/缺失请求 ${report.taskRequestAccounting.taskUsageObservedRequestCount}/${report.taskRequestAccounting.taskUsageMissingRequestCount}，完整性=${report.taskRequestAccounting.taskTokenUsageComplete}，完整总量=${formatNullable(report.taskRequestAccounting.taskTotalTokens)}；relay 成本：${report.taskRequestAccounting.taskPricingStatus}；
- latency p50 / p90：${formatNullable(report.costLatency.latencyP50Ms)} / ${formatNullable(report.costLatency.latencyP90Ms)} ms；
- repeat-5 raw-claim agreement：${formatRate(report.reproducibility.claimAgreement)}；admissible evaluable works=${report.reproducibility.admissibleEvaluableWorkCount}。
- model assessment：本轮未中途换模型；Luna 的 3 次 synthetic 与真实 canary 负载不可比，不能据此作模型切换决定，且 citation pass=${report.modelAssessment.lunaCitationPassed}。

## 边界

公开报告不含作品、作者、URL、域名、query 或内部标识。未执行 full 160，未训练模型，未修改 B4/PRD，未打开 final holdout，未进入 V2-C/V2-D/C4/M3，未 release；全部结果保持 \`not_for_formal_decision\`。
`;
}

export function renderQualityMarkdown(report) {
  return `# M2 v2 Canary 质量报告 v0.1

## 质量结论

Provider contract success ${formatRate(report.retrieval.successRate)}（relay 旧口径 ${formatRate(report.retrieval.relayDeclaredSuccessRate)}）；entity resolution ${formatRate(report.entityResolution.resolutionRate)}；evidence accepted ${report.evidenceFunnel.acceptedCount}。空分母不会被记为 100%。

## Evidence 漏斗

- candidate / accepted / rejected：${report.evidenceFunnel.candidateCount} / ${report.evidenceFunnel.acceptedCount} / ${report.evidenceFunnel.rejectedCount}；
- citation candidate alignment：${formatRate(report.citationAlignment.candidateAlignmentRate)}；
- capturedAt / availableAt / eventTime（primary candidate 分母 ${report.timestampCompleteness.primaryCandidateDenominator}）：${formatRate(report.timestampCompleteness.capturedAtCompleteness)} / ${formatRate(report.timestampCompleteness.availableAtCompleteness)} / ${formatRate(report.timestampCompleteness.eventTimeCompleteness)}；
- source allowlist：\`${report.sourceGovernance.allowlistStatus}\`，未批准域名不会成为 accepted evidence；
- contradiction raw conflict groups / admissible conflict groups：${report.contradictionHandling.rawConflictGroupCount} / ${report.contradictionHandling.admissibleConflictGroupCount}；rejected claim 不得否决 admissible claim；
- repeat raw-claim consistency：${formatRate(report.reproducibility.claimAgreement)}（5 个样本的 raw/rejected candidate 口径）；admissible evaluable works=${report.reproducibility.admissibleEvaluableWorkCount}，admissible consistency=${formatRate(report.reproducibility.admissibleClaimAgreement)}。
- Luna synthetic 对照与 canary 指标严格分离且不可直接比较；建议为 \`${report.modelAssessment.recommendation}\`。

## 验证

项目验证 ${report.validation.passedCount}/${report.validation.commandCount} 通过；private ignored/untracked=${report.auditStatus.privateArtifactsIgnoredAndUntracked}，review workbook present/XLSX-container-valid=${report.auditStatus.reviewWorkbookPresentAndXlsxContainerValid}，public privacy leak count=${report.auditStatus.publicPrivacyLeakCount}。未使用官方 OpenAI 价格估算第三方 relay 成本；价格不可得时成本 gate 不作通过处理。
`;
}

export function renderDecisionMarkdown(report) {
  const failed = report.conditions.filter((item) => !item.passed).map((item) => `\`${item.id}\``).join("、") || "无";
  return `# M2 v2 Canary 决策 v0.1

## 决策

**${report.decision}**。允许进入完整 160 pilot：**${report.allowFull160Pilot ? "是（仍需单独授权）" : "否"}**。

未通过或不可证明的 gate：${failed}。

当前 full-160 readiness 为 \`${report.full160Readiness}\`，本轮不授权也不执行 full 160。全部结果为 \`not_for_formal_decision\`；未训练模型、未修改 B4/PRD、未进入 V2-C/V2-D/C4/M3、未 release。

模型建议：\`${report.modelRecommendation}\`。
`;
}

function readEnvLocal(path) {
  if (!existsSync(path)) return {};
  const result = {};
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const normalized = line.startsWith("export ") ? line.slice(7).trimStart() : line;
    const separator = normalized.indexOf("=");
    if (separator <= 0) continue;
    const key = normalized.slice(0, separator).trim();
    let value = normalized.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    result[key] = value;
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
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, value, "utf8");
  renameSync(temporary, path);
}

function withStateDigest(state) {
  const { stateDigest: _prior, ...payload } = state;
  return { ...payload, stateDigest: sha256(payload) };
}

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
  return { status: result.status ?? -1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function sameStringSet(left, right) {
  return canonicalJson([...(left ?? [])].sort()) === canonicalJson([...right].sort());
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

function sumNullable(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? sum(finite) : null;
}

function normalizeBaseUrl(value) {
  return String(value ?? "").trim().replace(/\/+$/u, "");
}

function formatRate(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : "不可评估";
}

function formatNullable(value) {
  return Number.isFinite(value) ? String(value) : "不可评估";
}
