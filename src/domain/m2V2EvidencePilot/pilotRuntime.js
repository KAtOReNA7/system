import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createInterface } from "node:readline";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  EVIDENCE_TYPES,
  HARD_GATE_IDS,
  NoProviderAdapter,
  PILOT_SCHEMA_VERSION,
  PILOT_SEED,
  PILOT_SIZE,
  QUERY_BUDGET,
  assertPublicSanitized,
  buildQueryPlan,
  canonicalJson,
  evaluateHardGate,
  executeProviderRequest,
  normalizeEntityText,
  resolveEntity,
  sha256,
  validateQueryPlan,
} from "./pilotCore.js";

export const PRIVATE_STORE_RELATIVE = "data/private-output/m2-v2-evidence-pilot";

export const INPUT_ROLES = Object.freeze({
  formalExecutionPayload: "data/private-output/m2-formal-execution/m2-formal-execution-payload-v1.json",
  incomeFacts: "data/private-output/m2-formal-execution/m2-formal-income-facts-v1.ndjson",
  postFoundationReadiness: "data/private-output/m2-readiness/M2-post-foundation-readiness-rerun-private-v1.json",
});

export const PUBLIC_REPORTS = Object.freeze({
  summaryJson: "docs/analysis/m2-v2/M2-v2-evidence-pilot-summary-v0.1.json",
  summaryMarkdown: "docs/analysis/m2-v2/M2-v2-evidence-pilot-summary-v0.1.md",
  gateJson: "docs/analysis/m2-v2/M2-v2-evidence-pilot-gate-v0.1.json",
  nextStepJson: "docs/analysis/m2-v2/M2-v2-evidence-pilot-next-step-v0.1.json",
  nextStepMarkdown: "docs/analysis/m2-v2/M2-v2-evidence-pilot-next-step-v0.1.md",
});

const PRIVATE_FILES = Object.freeze({
  manifest: "pilot-manifest-private-v0.1.json",
  queryLog: "query-log-private-v0.1.ndjson",
  receipts: "provider-receipts-private-v0.1.ndjson",
  evidence: "evidence-records-private-v0.1.ndjson",
  entity: "entity-resolution-private-v0.1.ndjson",
  contradictions: "contradictions-private-v0.1.ndjson",
  cost: "cost-latency-ledger-private-v0.1.json",
  cache: "query-cache-private-v0.1.json",
  state: "execution-state-private-v0.1.json",
  review: "M2-v2-evidence-pilot-review-pack-private-v0.1.json",
  verification: "verification-receipt-private-v0.1.json",
  samplingCorrection: "sampling-correction-ledger-private-v0.1.json",
});

const SAMPLE_TARGETS = Object.freeze({
  "sourceType:publication": 60,
  "sourceType:web_original": 60,
  "revenueBand:top1": 12,
  "revenueBand:top5": 20,
  "revenueBand:top10": 20,
  "revenueBand:middle": 45,
  "revenueBand:long_tail": 55,
  "revenueModel:pure_sales_share": 60,
  "revenueModel:pure_buyout": 24,
  "revenueModel:buyout_plus_sales": 24,
  "revenueModel:unknown_revenue_model": 5,
  "activity:dense": 35,
  "activity:intermittent": 35,
  "activity:dormant": 35,
  "ambiguityRisk:high": 20,
  "evidencePrior:rich": 35,
  "evidencePrior:sparse": 35,
});

const USABILITY_THRESHOLDS = Object.freeze({
  validEvidenceWorkCoverage: 0.6,
  highValueValidEvidenceCoverage: 0.75,
  entityResolutionRate: 0.8,
  querySuccessRate: 0.8,
  citationCompleteness: 1,
  allowlistCompliance: 1,
  reproducibilityClaimAgreement: 0.8,
  reproducibilitySourceOverlap: 0.7,
});

export async function checkAndFreezePilot(root, options = {}) {
  const absoluteRoot = resolve(root);
  const privateStore = join(absoluteRoot, PRIVATE_STORE_RELATIVE);
  mkdirSync(privateStore, { recursive: true });
  assertPrivateStoreIgnored(absoluteRoot);
  const population = await loadPopulation(absoluteRoot);
  const manifestPath = join(privateStore, PRIVATE_FILES.manifest);

  if (existsSync(manifestPath)) {
    const existing = readJson(manifestPath);
    assertManifest(existing);
    if (existing.populationDigest !== population.populationDigest) throw new Error("frozen_manifest_population_digest_mismatch");
    if (existing.sourceRoleDigests.incomeFacts !== population.sourceRoleDigests.incomeFacts) {
      throw new Error("frozen_manifest_source_digest_mismatch");
    }
    const replayed = selectPilotSample(population.records, existing.targetSampleSize, existing.seed);
    const frozenIds = existing.sample.map((item) => item.standardWorkId);
    const replayedIds = replayed.sample.map((item) => item.standardWorkId);
    if (canonicalJson(frozenIds) !== canonicalJson(replayedIds)) throw new Error("frozen_manifest_selection_replay_mismatch");
    return { manifest: existing, created: false, population };
  }

  const selected = selectPilotSample(population.records, options.sampleSize ?? PILOT_SIZE, options.seed ?? PILOT_SEED);
  const createdAt = options.createdAt ?? new Date().toISOString();
  const correctionPath = join(privateStore, PRIVATE_FILES.samplingCorrection);
  const samplingCorrection = existsSync(correctionPath) ? readJson(correctionPath) : null;
  const payload = {
    schema: "m2.v2.evidence-pilot-private-manifest.v0.1",
    privateOnly: true,
    immutable: true,
    status: "frozen_before_retrieval",
    createdAt,
    seed: String(options.seed ?? PILOT_SEED),
    targetSampleSize: options.sampleSize ?? PILOT_SIZE,
    populationCount: population.records.length,
    completeIncomeFactCount: population.completeIncomeFactCount,
    populationDigest: population.populationDigest,
    sourceRoleDigests: population.sourceRoleDigests,
    selectionAlgorithmVersion: "m2-v2-balanced-greedy-v0.1",
    stratificationPolicyVersion: "m2-v2-pilot-strata-v0.1",
    sampleTargets: SAMPLE_TARGETS,
    targetAchievement: selected.targetAchievement,
    aggregateStrata: aggregateStrata(selected.sample),
    preRetrievalSamplingCorrection: samplingCorrection
      ? {
          priorManifestDigest: samplingCorrection.priorManifestDigest,
          reason: samplingCorrection.reason,
          retrievalObservedBeforeCorrection: samplingCorrection.retrievalObservedBeforeCorrection,
          providerDispatchCountBeforeCorrection: samplingCorrection.providerDispatchCountBeforeCorrection,
        }
      : null,
    sample: selected.sample.map((record) => ({
      standardWorkId: record.standardWorkId,
      title: record.title,
      author: record.author,
      identityDigest: record.identityDigest,
      sourceType: record.sourceType,
      revenueBand: record.revenueBand,
      revenueModel: record.revenueModel,
      activity: record.activity,
      ambiguityRisk: record.ambiguityRisk,
      evidencePrior: record.evidencePrior,
      highValue: record.highValue,
      sameNameCount: record.sameNameCount,
    })),
  };
  const manifest = { ...payload, manifestDigest: sha256(payload) };
  assertManifest(manifest);
  atomicWriteJson(manifestPath, manifest);
  if (samplingCorrection) {
    const finalizedCorrection = {
      ...samplingCorrection,
      finalManifestPending: false,
      finalManifestDigest: manifest.manifestDigest,
    };
    const { correctionDigest: _priorDigest, ...correctionPayload } = finalizedCorrection;
    atomicWriteJson(correctionPath, { ...correctionPayload, correctionDigest: sha256(correctionPayload) });
  }
  return { manifest, created: true, population };
}

export function supersedeFrozenManifestBeforeRetrieval(root, options = {}) {
  const absoluteRoot = resolve(root);
  const privateStore = join(absoluteRoot, PRIVATE_STORE_RELATIVE);
  const manifestPath = join(privateStore, PRIVATE_FILES.manifest);
  if (!existsSync(manifestPath)) throw new Error("no_manifest_to_supersede");
  const retrievalArtifacts = [
    PRIVATE_FILES.queryLog,
    PRIVATE_FILES.receipts,
    PRIVATE_FILES.evidence,
    PRIVATE_FILES.entity,
    PRIVATE_FILES.contradictions,
    PRIVATE_FILES.state,
  ].filter((name) => existsSync(join(privateStore, name)));
  if (retrievalArtifacts.length) throw new Error("manifest_cannot_be_superseded_after_retrieval_artifacts_exist");
  const manifest = readJson(manifestPath);
  assertManifest(manifest);
  const reason = String(options.reason ?? "pre_retrieval_sampler_defect");
  const archiveName = `pilot-manifest-superseded-${manifest.manifestDigest.slice(0, 12)}-private-v0.1.json`;
  const archivePath = join(privateStore, archiveName);
  if (existsSync(archivePath)) throw new Error("superseded_manifest_archive_already_exists");
  renameSync(manifestPath, archivePath);
  const correctionPayload = {
    schema: "m2.v2.evidence-pilot-sampling-correction-ledger.v0.1",
    privateOnly: true,
    correctedAt: options.correctedAt ?? new Date().toISOString(),
    reason,
    priorManifestDigest: manifest.manifestDigest,
    archivedManifestFile: archiveName,
    retrievalObservedBeforeCorrection: false,
    providerDispatchCountBeforeCorrection: 0,
    searchResultCountBeforeCorrection: 0,
    finalManifestPending: true,
  };
  atomicWriteJson(join(privateStore, PRIVATE_FILES.samplingCorrection), {
    ...correctionPayload,
    correctionDigest: sha256(correctionPayload),
  });
  return correctionPayload;
}

export async function runPilot(root, options = {}) {
  const absoluteRoot = resolve(root);
  const checked = await checkAndFreezePilot(absoluteRoot, options);
  const manifest = checked.manifest;
  const privateStore = join(absoluteRoot, PRIVATE_STORE_RELATIVE);
  const provider = options.provider ?? new NoProviderAdapter({ reason: "no_authorized_provider_credentials_or_allowlist" });
  const runMode = options.runMode ?? "run";
  const capturedAt = options.capturedAt ?? new Date().toISOString();
  const cachePath = join(privateStore, PRIVATE_FILES.cache);
  const cache = existsSync(cachePath) ? readJson(cachePath) : { schema: "m2.v2.query-cache.v0.1", entries: {} };

  const queryLog = [];
  const receipts = [];
  let cacheHitCount = 0;
  for (const work of manifest.sample) {
    const plan = buildQueryPlan(work).map((query) => ({ ...query, workReference: work.standardWorkId }));
    const planCheck = validateQueryPlan(plan, 1);
    if (!planCheck.valid) throw new Error(`query_plan_invalid:${planCheck.issues.join(",")}`);
    for (const query of plan) {
      const queryLogEntry = {
        schema: "m2.v2.query-log.v0.1",
        workReference: work.standardWorkId,
        queryId: query.queryId,
        queryHash: query.queryHash,
        category: query.category,
        evidenceTypes: query.evidenceTypes,
        queryTemplateVersion: query.queryTemplateVersion,
        queryText: query.queryText,
        includedFields: query.includedFields,
        excludedPrivateFields: query.excludedPrivateFields,
        maxResults: query.maxResults,
        maxPages: query.maxPages,
        plannedAt: manifest.createdAt,
      };
      queryLog.push(queryLogEntry);
      let receipt = cache.entries[query.queryHash];
      if (receipt) {
        cacheHitCount += 1;
      } else {
        receipt = await executeProviderRequest(provider, query);
        receipt = { ...receipt, capturedAt };
        cache.entries[query.queryHash] = receipt;
      }
      receipts.push({ ...receipt, workReference: work.standardWorkId });
    }
  }

  const evidence = [];
  const contradictions = [];
  const entityResults = manifest.sample.map((work) => ({
    schema: "m2.v2.entity-resolution-result.v0.1",
    workReference: work.standardWorkId,
    identityDigest: work.identityDigest,
    preRegisteredAmbiguityRisk: work.ambiguityRisk,
    ...resolveEntity({ work, candidate: null, sameNameCount: work.sameNameCount }),
    reason: "not_attempted_no_provider",
  }));
  const costLedger = buildCostLedger(receipts, manifest.sample.length, cacheHitCount);
  const executionStatus = receipts.every((receipt) => receipt.status === "blocked_no_provider")
    ? "blocked_no_provider"
    : "completed";
  const statePayload = {
    schema: "m2.v2.evidence-pilot-execution-state.v0.1",
    privateOnly: true,
    runMode,
    executionStatus,
    manifestDigest: manifest.manifestDigest,
    providerId: provider.providerId,
    providerVersion: provider.providerVersion,
    providerMode: provider.mode,
    capturedAt,
    plannedQueryCount: queryLog.length,
    dispatchedQueryCount: receipts.filter((receipt) => receipt.dispatched).length,
    providerReceiptCount: receipts.length,
    resultCount: sum(receipts.map((receipt) => receipt.resultCount)),
    pageCount: sum(receipts.map((receipt) => receipt.pageCount)),
    evidenceCount: evidence.length,
    cacheHitCount,
    sampleCount: manifest.sample.length,
  };
  const state = { ...statePayload, stateDigest: sha256(statePayload) };

  atomicWriteNdjson(join(privateStore, PRIVATE_FILES.queryLog), queryLog);
  atomicWriteNdjson(join(privateStore, PRIVATE_FILES.receipts), receipts);
  atomicWriteNdjson(join(privateStore, PRIVATE_FILES.evidence), evidence);
  atomicWriteNdjson(join(privateStore, PRIVATE_FILES.entity), entityResults);
  atomicWriteNdjson(join(privateStore, PRIVATE_FILES.contradictions), contradictions);
  atomicWriteJson(join(privateStore, PRIVATE_FILES.cost), costLedger);
  atomicWriteJson(cachePath, cache);
  atomicWriteJson(join(privateStore, PRIVATE_FILES.state), state);
  atomicWriteJson(join(privateStore, PRIVATE_FILES.review), buildReviewPack(manifest, entityResults, executionStatus));

  return { manifest, state, costLedger, queryLog, receipts, entityResults, evidence, contradictions };
}

export function verifyPilot(root) {
  const absoluteRoot = resolve(root);
  const privateStore = join(absoluteRoot, PRIVATE_STORE_RELATIVE);
  assertPrivateStoreIgnored(absoluteRoot);
  const manifest = readJson(join(privateStore, PRIVATE_FILES.manifest));
  const state = readJson(join(privateStore, PRIVATE_FILES.state));
  const queryLog = readNdjson(join(privateStore, PRIVATE_FILES.queryLog));
  const receipts = readNdjson(join(privateStore, PRIVATE_FILES.receipts));
  const evidence = readNdjson(join(privateStore, PRIVATE_FILES.evidence));
  const entity = readNdjson(join(privateStore, PRIVATE_FILES.entity));
  const contradictions = readNdjson(join(privateStore, PRIVATE_FILES.contradictions));
  const issues = [];

  try {
    assertManifest(manifest);
  } catch (error) {
    issues.push(error.message);
  }
  if (state.manifestDigest !== manifest.manifestDigest) issues.push("state_manifest_digest_mismatch");
  if (manifest.sample.length !== PILOT_SIZE) issues.push("sample_count_invalid");
  if (new Set(manifest.sample.map((item) => item.standardWorkId)).size !== manifest.sample.length) issues.push("sample_not_unique");
  if (queryLog.length > manifest.sample.length * QUERY_BUDGET.maxQueriesPerWork) issues.push("query_budget_exceeded");
  if (receipts.length !== queryLog.length) issues.push("receipt_count_mismatch");
  if (receipts.some((receipt) => !receipt.queryId || !receipt.queryHash || !receipt.receiptDigest || !receipt.status)) {
    issues.push("provider_receipt_not_auditable");
  }
  if (receipts.some((receipt) => Number(receipt.resultCount) > QUERY_BUDGET.maxResultsPerQuery)) issues.push("result_budget_exceeded");
  if (entity.length !== manifest.sample.length) issues.push("entity_result_count_mismatch");
  if (entity.some((item) => item.status === "unresolved" && item.predictionEligible === true)) issues.push("unresolved_entity_eligible");
  if (contradictions.some((item) => item.status === "unresolved" && item.predictionEligible === true)) {
    issues.push("unresolved_conflict_eligible");
  }
  if (evidence.some((item) => item.timestamps?.availableAtStatus === "unknown" && item.predictiveUse === "prediction_allowed")) {
    issues.push("unknown_available_at_eligible");
  }
  if (evidence.some((item) => item.contradiction?.status === "unresolved" && item.predictiveUse === "prediction_allowed")) {
    issues.push("unresolved_conflict_prediction_allowed");
  }
  if (evidence.some((item) => !item.source?.sourceLocator && item.admissibility?.status !== "excluded")) {
    issues.push("accepted_evidence_without_citation");
  }
  if (evidence.some((item) => !item.timestamps?.capturedAt)) issues.push("captured_at_missing");
  if (evidence.some((item) => !['known', 'unknown'].includes(item.timestamps?.availableAtStatus))) {
    issues.push("available_at_status_missing");
  }

  const protectedDiff = git(absoluteRoot, [
    "diff",
    "--name-only",
    "d81b952e37dd43365c0091cdd6665e69d8d39a7e",
    "--",
    "src/domain/oldProductEvaluation",
    "scripts/m2-real-data",
    "docs/analysis/m2-real-data",
  ]);
  if (protectedDiff.status !== 0 || protectedDiff.stdout.trim()) issues.push("b4_or_existing_model_artifact_changed");

  const seals = readJson(join(absoluteRoot, "src/domain/oldProductEvaluation/calibrationSpec.c3.v1.amendment.json"));
  const sealed = checkSeals(seals);
  if (!sealed) issues.push("final_holdout_or_related_seal_open");

  const publicPreview = buildSummary({ manifest, state, queryLog, receipts, evidence, entity, contradictions });
  try {
    assertPublicSanitized(publicPreview);
  } catch (error) {
    issues.push(error.message);
  }

  const privateStatus = privateStoreStatus(absoluteRoot);
  if (!privateStatus.ignored || !privateStatus.untracked) issues.push("private_store_not_ignored_or_untracked");

  const baseConditions = {
    no_private_identifiers_in_public_artifacts: !issues.some((item) => item.startsWith("public_sanitization_failed")),
    no_prohibited_source_accepted: evidence.every((item) => item.source?.sourceTier !== "prohibited"),
    citation_present_for_every_accepted_evidence: evidence.every(
      (item) => item.admissibility?.status === "excluded" || Boolean(item.source?.sourceLocator)
    ),
    captured_at_present: evidence.every((item) => Boolean(item.timestamps?.capturedAt)),
    available_at_present_or_explicitly_unknown: evidence.every(
      (item) => item.timestamps?.availableAt || item.timestamps?.availableAtStatus === "unknown"
    ),
    unknown_available_at_excluded_from_model_eligibility: evidence.every(
      (item) => item.timestamps?.availableAtStatus !== "unknown" || item.predictiveUse !== "prediction_allowed"
    ),
    unresolved_entity_excluded: entity.every((item) => item.status === "resolved" || item.predictionEligible !== true),
    unresolved_conflict_excluded: contradictions.every(
      (item) => item.status !== "unresolved" || item.predictionEligible !== true
    ),
    no_historical_cutoff_backfill: evidence.every((item) => item.governance?.historicalBackfill !== true),
    no_model_training: protectedDiff.stdout.trim() === "",
    provider_receipts_auditable: receipts.length === queryLog.length && !issues.includes("provider_receipt_not_auditable"),
    manifest_immutable: !issues.some((item) => item.includes("manifest")),
    deterministic_schema_validation: !issues.some((item) => item.includes("schema")),
    private_files_ignored_and_untracked: privateStatus.ignored && privateStatus.untracked,
    final_holdout_sealed: sealed,
    b4_unchanged: !issues.includes("b4_or_existing_model_artifact_changed"),
    all_pilot_contract_checks_pass: issues.length === 0,
  };
  const hardGate = evaluateHardGate(baseConditions);
  const receiptPayload = {
    schema: "m2.v2.evidence-pilot-verification-receipt.v0.1",
    privateOnly: true,
    verifiedAt: new Date().toISOString(),
    manifestDigest: manifest.manifestDigest,
    stateDigest: state.stateDigest,
    issues,
    hardGate,
    privateStatus,
    protectedDiffPaths: protectedDiff.stdout.trim() ? protectedDiff.stdout.trim().split(/\r?\n/u) : [],
  };
  const verification = { ...receiptPayload, verificationDigest: sha256(receiptPayload) };
  atomicWriteJson(join(privateStore, PRIVATE_FILES.verification), verification);
  if (issues.length) throw new Error(`pilot_verification_failed:${issues.join(",")}`);
  return verification;
}

export function writePublicReports(root) {
  const absoluteRoot = resolve(root);
  const privateStore = join(absoluteRoot, PRIVATE_STORE_RELATIVE);
  const manifest = readJson(join(privateStore, PRIVATE_FILES.manifest));
  const state = readJson(join(privateStore, PRIVATE_FILES.state));
  const queryLog = readNdjson(join(privateStore, PRIVATE_FILES.queryLog));
  const receipts = readNdjson(join(privateStore, PRIVATE_FILES.receipts));
  const evidence = readNdjson(join(privateStore, PRIVATE_FILES.evidence));
  const entity = readNdjson(join(privateStore, PRIVATE_FILES.entity));
  const contradictions = readNdjson(join(privateStore, PRIVATE_FILES.contradictions));
  const verification = readJson(join(privateStore, PRIVATE_FILES.verification));
  const summary = buildSummary({ manifest, state, queryLog, receipts, evidence, entity, contradictions });
  const hardGate = verification.hardGate;
  const usability = evaluateUsability(summary);
  const decision = !hardGate.allPassed
    ? "PILOT_FAIL"
    : state.executionStatus === "blocked_no_provider" || !usability.allPassed
      ? "PILOT_CONDITIONAL"
      : "PILOT_PASS";
  const gate = {
    schema: "m2.v2.evidence-pilot-gate.v0.1",
    decision,
    pilotExecutionStatus: state.executionStatus,
    hardGate,
    usabilityThresholds: USABILITY_THRESHOLDS,
    usability,
    prospectiveShadowReadiness: decision === "PILOT_PASS" ? "READY_FOR_SEPARATE_V2_C_AUTHORIZATION" : "NOT_READY",
    notForFormalDecision: true,
    finalHoldoutSealed: true,
    b4Unchanged: true,
    modelTrainingPerformed: false,
    releaseAuthorized: false,
  };
  const nextStep = {
    schema: "m2.v2.evidence-pilot-next-step.v0.1",
    decision,
    recommendation: "DO_NOT_START_V2_C",
    blockers: state.executionStatus === "blocked_no_provider"
      ? [
          "provide_an_authorized_auditable_runtime_search_provider",
          "approve_at_least_one_domain_entry_after_terms_and_legal_review",
          "rerun_the_same_immutable_sample_without_resampling",
        ]
      : usability.failed,
    permittedNextAction: "provider_and_source_governance_only_then_resume_same_manifest",
    prohibitedNextActions: ["model_training", "B4_change", "final_holdout_open", "V2_C", "V2_D", "C4", "M3", "release"],
    humanInputRequiredNow: false,
    futureHumanReviewScope: ["entity_match", "evidence_accuracy", "source_trust", "conflict_handling"],
  };
  assertPublicSanitized(summary);
  assertPublicSanitized(gate);
  assertPublicSanitized(nextStep);

  atomicWriteJson(join(absoluteRoot, PUBLIC_REPORTS.summaryJson), summary);
  atomicWriteText(join(absoluteRoot, PUBLIC_REPORTS.summaryMarkdown), renderSummaryMarkdown(summary, gate));
  atomicWriteJson(join(absoluteRoot, PUBLIC_REPORTS.gateJson), gate);
  atomicWriteJson(join(absoluteRoot, PUBLIC_REPORTS.nextStepJson), nextStep);
  atomicWriteText(join(absoluteRoot, PUBLIC_REPORTS.nextStepMarkdown), renderNextStepMarkdown(nextStep));
  return { summary, gate, nextStep };
}

export async function loadPopulation(root) {
  const formalPath = join(root, INPUT_ROLES.formalExecutionPayload);
  const factPath = join(root, INPUT_ROLES.incomeFacts);
  const readinessPath = join(root, INPUT_ROLES.postFoundationReadiness);
  for (const path of [formalPath, factPath, readinessPath]) {
    if (!existsSync(path)) throw new Error(`missing_private_input_role:${path.split(/[\\/]/u).at(-1)}`);
  }
  const formal = readJson(formalPath);
  const readiness = readJson(readinessPath);
  if (!Array.isArray(formal.records) || formal.records.length !== 3053) throw new Error("formal_population_count_mismatch");
  if (!Array.isArray(readiness.records) || readiness.records.length !== 3053) throw new Error("readiness_population_count_mismatch");
  const readinessById = new Map(readiness.records.map((record) => [String(record.standardWorkId), record]));
  const last12Months = monthWindow(formal.latestCompleteMonth, 12);
  const completeRevenue = new Map();
  const recentMonthly = new Map();
  let factCount = 0;
  let completeIncomeFactCount = 0;
  const reader = createInterface({ input: createReadStream(factPath, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const line of reader) {
    if (!line.trim()) continue;
    factCount += 1;
    const row = JSON.parse(line);
    const billMonth = normalizeBillMonth(row.billMonth);
    if (billMonth > String(formal.latestCompleteMonth)) continue;
    completeIncomeFactCount += 1;
    const id = String(row.standardWorkId);
    const amount = Number(row.actualSalesAmount) || 0;
    completeRevenue.set(id, (completeRevenue.get(id) ?? 0) + amount);
    if (last12Months.has(billMonth)) {
      if (!recentMonthly.has(id)) recentMonthly.set(id, new Map());
      const months = recentMonthly.get(id);
      months.set(billMonth, (months.get(billMonth) ?? 0) + amount);
    }
  }
  if (factCount !== 192872) throw new Error(`income_fact_count_mismatch:${factCount}`);
  if (completeIncomeFactCount !== 192869) throw new Error(`complete_income_fact_count_mismatch:${completeIncomeFactCount}`);

  const titleCounts = new Map();
  for (const record of formal.records) {
    const key = normalizeEntityText(record.standardWorkName);
    titleCounts.set(key, (titleCounts.get(key) ?? 0) + 1);
  }
  const rankOrder = formal.records
    .map((record) => ({ id: String(record.standardWorkId), amount: completeRevenue.get(String(record.standardWorkId)) ?? 0 }))
    .sort((a, b) => b.amount - a.amount || sha256(`${PILOT_SEED}:${a.id}`).localeCompare(sha256(`${PILOT_SEED}:${b.id}`)));
  const rankById = new Map(rankOrder.map((record, index) => [record.id, index + 1]));

  const records = formal.records.map((record) => {
    const id = String(record.standardWorkId);
    const readinessRecord = readinessById.get(id);
    if (!readinessRecord) throw new Error("readiness_identity_set_mismatch");
    const title = String(record.standardWorkName ?? "").trim();
    const author = String(record.authorName ?? "").trim();
    const normalizedTitle = normalizeEntityText(title);
    const sameNameCount = titleCounts.get(normalizedTitle) ?? 1;
    const activeMonthCount12 = [...(recentMonthly.get(id)?.values() ?? [])].filter((amount) => amount > 0).length;
    const activity = activeMonthCount12 >= 9 ? "dense" : activeMonthCount12 >= 1 ? "intermittent" : "dormant";
    const revenueBand = revenueBandForRank(rankById.get(id), formal.records.length);
    const sourceType = sourceTypeFromClassification(readinessRecord.classificationLevel1 ?? record.classificationPath?.[0]);
    const ambiguityRisk = ambiguityRiskFor({ title, author, sameNameCount });
    const highValue = ["top1", "top5", "top10"].includes(revenueBand);
    const evidencePrior = evidencePriorFor({ sourceType, revenueBand, activity, ambiguityRisk });
    return {
      standardWorkId: id,
      title,
      author,
      identityDigest: sha256([id, title, author]),
      sourceType,
      revenueBand,
      revenueModel: readinessRecord.revenueModel ?? "unknown_revenue_model",
      activity,
      activeMonthCount12,
      ambiguityRisk,
      evidencePrior,
      highValue,
      sameNameCount,
      totalCompleteRevenue: completeRevenue.get(id) ?? 0,
    };
  });

  const identitySet = new Set(records.map((record) => record.standardWorkId));
  if (identitySet.size !== 3053) throw new Error("population_identity_not_unique");
  const sourceRoleDigests = {
    formalExecutionPayload: await hashFile(formalPath),
    incomeFacts: await hashFile(factPath),
    postFoundationReadiness: await hashFile(readinessPath),
  };
  return {
    records,
    completeIncomeFactCount,
    sourceRoleDigests,
    populationDigest: sha256(
      records.map((record) => ({
        identityDigest: record.identityDigest,
        sourceType: record.sourceType,
        revenueBand: record.revenueBand,
        revenueModel: record.revenueModel,
        activity: record.activity,
        ambiguityRisk: record.ambiguityRisk,
        evidencePrior: record.evidencePrior,
      }))
    ),
  };
}

export function selectPilotSample(population, sampleSize = PILOT_SIZE, seed = PILOT_SEED) {
  if (!Array.isArray(population) || population.length < sampleSize) throw new Error("sample_population_too_small");
  const populationCounts = countTags(population);
  const effectiveTargets = Object.fromEntries(
    Object.entries(SAMPLE_TARGETS).map(([tag, desired]) => [tag, Math.min(desired, populationCounts[tag] ?? 0)])
  );
  const current = Object.fromEntries(Object.keys(effectiveTargets).map((tag) => [tag, 0]));
  const remaining = new Map(population.map((record) => [record.standardWorkId, record]));
  const sample = [];

  while (sample.length < sampleSize) {
    let best = null;
    let bestScore = -1;
    let bestTie = null;
    for (const record of remaining.values()) {
      const remainingSlotsAfterSelection = sampleSize - sample.length - 1;
      if (!preservesTargetCapacity(record, current, effectiveTargets, remainingSlotsAfterSelection)) continue;
      let score = 0;
      for (const tag of tagsFor(record)) {
        const target = effectiveTargets[tag] ?? 0;
        const actual = current[tag] ?? 0;
        if (target > actual) score += (target - actual) / target;
      }
      const tie = sha256(`${seed}:${record.standardWorkId}`);
      if (score > bestScore + 1e-12 || (Math.abs(score - bestScore) <= 1e-12 && (bestTie === null || tie < bestTie))) {
        best = record;
        bestScore = score;
        bestTie = tie;
      }
    }
    if (!best) throw new Error("deterministic_sample_selection_stalled");
    sample.push(best);
    remaining.delete(best.standardWorkId);
    for (const tag of tagsFor(best)) if (tag in current) current[tag] += 1;
  }

  const targetAchievement = Object.fromEntries(
    Object.entries(SAMPLE_TARGETS).map(([tag, desired]) => [
      tag,
      {
        desired,
        populationAvailable: populationCounts[tag] ?? 0,
        effectiveTarget: effectiveTargets[tag],
        actual: current[tag] ?? 0,
        achieved: (current[tag] ?? 0) >= effectiveTargets[tag],
      },
    ])
  );
  if (Object.values(targetAchievement).some((value) => !value.achieved)) {
    const failed = Object.entries(targetAchievement).filter(([, value]) => !value.achieved).map(([tag]) => tag);
    throw new Error(`sample_targets_not_achieved:${failed.join(",")}`);
  }
  return { sample, targetAchievement };
}

export function normalizeBillMonth(value) {
  const month = String(value ?? "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/u.test(month)) throw new Error("income_fact_month_invalid");
  return month;
}

function preservesTargetCapacity(record, current, targets, remainingSlots) {
  const groups = [
    ["sourceType:publication", "sourceType:web_original"],
    ["revenueBand:top1", "revenueBand:top5", "revenueBand:top10", "revenueBand:middle", "revenueBand:long_tail"],
    [
      "revenueModel:pure_sales_share",
      "revenueModel:pure_buyout",
      "revenueModel:buyout_plus_sales",
      "revenueModel:unknown_revenue_model",
    ],
    ["activity:dense", "activity:intermittent", "activity:dormant"],
    ["evidencePrior:rich", "evidencePrior:sparse"],
    ["ambiguityRisk:high"],
  ];
  const recordTags = new Set(tagsFor(record));
  return groups.every((group) => {
    const deficitAfter = group.reduce((total, tag) => {
      const nextActual = (current[tag] ?? 0) + (recordTags.has(tag) ? 1 : 0);
      return total + Math.max(0, (targets[tag] ?? 0) - nextActual);
    }, 0);
    return deficitAfter <= remainingSlots;
  });
}

function buildSummary({ manifest, state, queryLog, receipts, evidence, entity, contradictions }) {
  const accepted = evidence.filter((item) => item.admissibility?.status === "accepted_prediction_candidate");
  const worksWithEvidence = new Set(accepted.map((item) => item.workReferenceHash).filter(Boolean));
  const highValueSampleCount = Number(manifest.aggregateStrata.highValue?.true ?? 0);
  const entityCounts = countBy(entity, (item) => item.status ?? "unknown");
  const evidenceTypeCounts = Object.fromEntries(EVIDENCE_TYPES.map((type) => [type, 0]));
  for (const item of accepted) evidenceTypeCounts[item.evidenceType] = (evidenceTypeCounts[item.evidenceType] ?? 0) + 1;
  const dispatched = receipts.filter((item) => item.dispatched);
  const successful = receipts.filter((item) => item.status === "success");
  const latencies = dispatched.map((item) => Number(item.latencyMs)).filter(Number.isFinite).sort((a, b) => a - b);
  const costs = receipts.map((item) => Number(item.costAmount) || 0);

  return {
    schema: "m2.v2.evidence-pilot-summary.v0.1",
    status: "not_for_formal_decision",
    pilotExecutionStatus: state.executionStatus,
    branchScope: "V2_B_EXTERNAL_EVIDENCE_PILOT_ONLY",
    sample: {
      target: manifest.targetSampleSize,
      actual: manifest.sample.length,
      population: manifest.populationCount,
      unique: true,
      seed: manifest.seed,
      selectionAlgorithmVersion: manifest.selectionAlgorithmVersion,
      manifestDigest: manifest.manifestDigest,
      aggregateStrata: manifest.aggregateStrata,
      allEffectiveTargetsAchieved: Object.values(manifest.targetAchievement).every((value) => value.achieved),
    },
    provider: {
      mode: state.providerMode,
      providerId: state.providerId,
      providerVersion: state.providerVersion,
      availability: state.executionStatus === "blocked_no_provider" ? "unavailable" : "available",
      fallbackUsed: state.providerMode === "no_provider_available",
      fallbackReason: state.executionStatus === "blocked_no_provider" ? "no_authorized_runtime_provider_or_approved_domain_entry" : null,
    },
    retrieval: {
      plannedQueryCount: queryLog.length,
      dispatchedQueryCount: dispatched.length,
      providerReceiptCount: receipts.length,
      successfulQueryCount: successful.length,
      resultCount: sum(receipts.map((item) => item.resultCount)),
      pageCount: sum(receipts.map((item) => item.pageCount)),
      querySuccessRate: ratio(successful.length, dispatched.length),
      providerFailureRate: dispatched.length ? ratio(dispatched.length - successful.length, dispatched.length) : null,
      providerUnavailableRate: ratio(receipts.filter((item) => item.status === "blocked_no_provider").length, receipts.length),
      pageFetchSuccessRate: null,
      cacheHitCount: state.cacheHitCount,
      cacheHitRate: ratio(state.cacheHitCount, receipts.length),
    },
    entityResolution: {
      resolved: entityCounts.resolved ?? 0,
      unresolved: entityCounts.unresolved ?? 0,
      ambiguous: entityCounts.ambiguous ?? 0,
      resolutionRate: ratio(entityCounts.resolved ?? 0, entity.length),
      confidence: { high: 0, medium: 0, low: 0, unavailable: entity.length },
      aliasMatchCount: 0,
      sameNameConflictCount: 0,
      preRegisteredHighAmbiguityCount: Number(manifest.aggregateStrata.ambiguityRisk?.high ?? 0),
    },
    evidence: {
      acceptedCount: accepted.length,
      evidencePerWork: ratio(accepted.length, manifest.sample.length),
      validEvidenceWorkCount: worksWithEvidence.size,
      validEvidenceWorkCoverage: ratio(worksWithEvidence.size, manifest.sample.length),
      highValueSampleCount,
      highValueValidEvidenceWorkCount: 0,
      highValueValidEvidenceCoverage: ratio(0, highValueSampleCount),
      categoryCounts: evidenceTypeCounts,
      categoryCoverage: Object.fromEntries(EVIDENCE_TYPES.map((type) => [type, 0])),
    },
    quality: {
      citationCompleteness: accepted.length ? ratio(accepted.filter((item) => item.source?.sourceLocator).length, accepted.length) : null,
      availableAtCompleteness: accepted.length ? ratio(accepted.filter((item) => item.timestamps?.availableAt).length, accepted.length) : null,
      eventTimeCompleteness: accepted.length ? ratio(accepted.filter((item) => item.timestamps?.eventTime).length, accepted.length) : null,
      allowlistCompliance: accepted.length ? ratio(accepted.filter((item) => item.source?.allowlistAccepted).length, accepted.length) : null,
      conflictRate: evidence.length ? ratio(contradictions.length, evidence.length) : null,
      unresolvedConflictRate: evidence.length
        ? ratio(contradictions.filter((item) => item.status === "unresolved").length, evidence.length)
        : null,
      staleEvidenceRate: evidence.length ? ratio(evidence.filter((item) => item.freshness?.status === "stale").length, evidence.length) : null,
      prohibitedSourceCount: evidence.filter((item) => item.source?.sourceTier === "prohibited").length,
      historicalBackfillCount: evidence.filter((item) => item.governance?.historicalBackfill === true).length,
    },
    reproducibility: {
      status: evidence.length ? "not_run" : "not_evaluable_no_evidence",
      fixedSubsampleCount: 20,
      queryPlanAgreement: 1,
      claimAgreement: null,
      structuredValueAgreement: null,
      sourceOverlap: null,
      confidenceDrift: null,
      contradictionDrift: null,
    },
    costLatency: {
      totalCostCny: round(sum(costs), 4),
      perWorkCostCny: round(ratio(sum(costs), manifest.sample.length), 4),
      perQueryCostCny: round(ratio(sum(costs), dispatched.length), 4),
      p50LatencyMs: percentile(latencies, 0.5),
      p90LatencyMs: percentile(latencies, 0.9),
      estimatedFullLibraryRefreshCostCny: null,
      estimatedMonthlyRefreshCostCny: null,
      estimationStatus: "not_evaluable_no_provider",
    },
    boundaries: {
      modelTrainingPerformed: false,
      b4Changed: false,
      finalHoldoutOpened: false,
      embargoShadowOpened: false,
      deferred60MonthLabelsOpened: false,
      v2CStarted: false,
      v2DStarted: false,
      c4Started: false,
      m3Started: false,
      released: false,
    },
  };
}

function evaluateUsability(summary) {
  const values = {
    validEvidenceWorkCoverage: summary.evidence.validEvidenceWorkCoverage,
    highValueValidEvidenceCoverage: summary.evidence.highValueValidEvidenceCoverage,
    entityResolutionRate: summary.entityResolution.resolutionRate,
    querySuccessRate: summary.retrieval.querySuccessRate,
    citationCompleteness: summary.quality.citationCompleteness,
    allowlistCompliance: summary.quality.allowlistCompliance,
    reproducibilityClaimAgreement: summary.reproducibility.claimAgreement,
    reproducibilitySourceOverlap: summary.reproducibility.sourceOverlap,
  };
  const conditions = Object.fromEntries(
    Object.entries(USABILITY_THRESHOLDS).map(([key, threshold]) => [key, Number.isFinite(values[key]) && values[key] >= threshold])
  );
  return {
    values,
    conditions,
    failed: Object.entries(conditions).filter(([, passed]) => !passed).map(([key]) => key),
    allPassed: Object.values(conditions).every(Boolean),
  };
}

function buildCostLedger(receipts, workCount, cacheHitCount) {
  const costs = receipts.map((item) => Number(item.costAmount) || 0);
  const latencies = receipts.map((item) => Number(item.latencyMs)).filter(Number.isFinite).sort((a, b) => a - b);
  return {
    schema: "m2.v2.evidence-pilot-cost-ledger.v0.1",
    privateOnly: true,
    workCount,
    receiptCount: receipts.length,
    totalCostCny: round(sum(costs), 4),
    perWorkCostCny: round(ratio(sum(costs), workCount), 4),
    perQueryCostCny: round(ratio(sum(costs), receipts.filter((item) => item.dispatched).length), 4),
    p50LatencyMs: percentile(latencies, 0.5),
    p90LatencyMs: percentile(latencies, 0.9),
    providerDistribution: countBy(receipts, (item) => item.providerId),
    statusDistribution: countBy(receipts, (item) => item.status),
    cacheHitCount,
    cacheHitRate: ratio(cacheHitCount, receipts.length),
  };
}

function buildReviewPack(manifest, entityResults, executionStatus) {
  const entityById = new Map(entityResults.map((item) => [item.workReference, item]));
  const selected = [...manifest.sample]
    .sort((a, b) => reviewScore(b) - reviewScore(a) || a.identityDigest.localeCompare(b.identityDigest))
    .slice(0, 30);
  return {
    schema: "m2.v2.evidence-pilot-private-review-pack.v0.1",
    privateOnly: true,
    executionStatus,
    reviewNotRequiredUntilProviderAvailable: executionStatus === "blocked_no_provider",
    instruction: "后续仅核对实体匹配、证据准确性、来源可信度和冲突处理；不要求补写搜索结果。",
    recordCount: selected.length,
    records: selected.map((work) => ({
      作品编号: work.standardWorkId,
      作品名: work.title,
      作者: work.author,
      抽检分层: {
        来源类型: work.sourceType,
        历史价值层: work.revenueBand,
        收入模式: work.revenueModel,
        活跃度: work.activity,
        身份歧义风险: work.ambiguityRisk,
      },
      实体解析状态: entityById.get(work.standardWorkId)?.status ?? "unresolved",
      当前阻断: executionStatus,
      是否匹配正确作品: "待后续 provider 运行后抽检",
      证据是否准确: "待后续 provider 运行后抽检",
      来源是否可信: "待后续 provider 运行后抽检",
      冲突处理是否合理: "待后续 provider 运行后抽检",
    })),
  };
}

function assertManifest(manifest) {
  if (manifest?.schema !== "m2.v2.evidence-pilot-private-manifest.v0.1") throw new Error("manifest_schema_invalid");
  if (manifest?.immutable !== true || manifest?.status !== "frozen_before_retrieval") throw new Error("manifest_not_frozen");
  if (!Array.isArray(manifest?.sample) || manifest.sample.length !== Number(manifest.targetSampleSize)) {
    throw new Error("manifest_sample_count_invalid");
  }
  const { manifestDigest, ...payload } = manifest;
  if (manifestDigest !== sha256(payload)) throw new Error("manifest_digest_invalid");
  if (new Set(manifest.sample.map((item) => item.standardWorkId)).size !== manifest.sample.length) {
    throw new Error("manifest_sample_not_unique");
  }
}

function selectPilotAggregateKeys() {
  return ["sourceType", "revenueBand", "revenueModel", "activity", "ambiguityRisk", "evidencePrior", "highValue"];
}

function aggregateStrata(records) {
  return Object.fromEntries(
    selectPilotAggregateKeys().map((key) => [key, countBy(records, (record) => String(record[key]))])
  );
}

function tagsFor(record) {
  return [
    `sourceType:${record.sourceType}`,
    `revenueBand:${record.revenueBand}`,
    `revenueModel:${record.revenueModel}`,
    `activity:${record.activity}`,
    `ambiguityRisk:${record.ambiguityRisk}`,
    `evidencePrior:${record.evidencePrior}`,
  ];
}

function countTags(records) {
  const counts = {};
  for (const record of records) for (const tag of tagsFor(record)) counts[tag] = (counts[tag] ?? 0) + 1;
  return counts;
}

function revenueBandForRank(rank, populationCount) {
  if (rank <= Math.ceil(populationCount * 0.01)) return "top1";
  if (rank <= Math.ceil(populationCount * 0.05)) return "top5";
  if (rank <= Math.ceil(populationCount * 0.1)) return "top10";
  if (rank <= Math.ceil(populationCount * 0.5)) return "middle";
  return "long_tail";
}

function sourceTypeFromClassification(value) {
  if (value === "出版物") return "publication";
  if (value === "网文") return "web_original";
  return "unknown_source";
}

function ambiguityRiskFor({ title, author, sameNameCount }) {
  const normalizedTitle = normalizeEntityText(title);
  const normalizedAuthor = normalizeEntityText(author);
  if (sameNameCount > 1 || normalizedTitle.length <= 4 || !normalizedAuthor || /佚名|不详|多人|合集/gu.test(author)) return "high";
  if (normalizedTitle.length <= 8 || /[、,&，和]/gu.test(author)) return "medium";
  return "low";
}

function evidencePriorFor({ sourceType, revenueBand, activity, ambiguityRisk }) {
  if (sourceType === "publication" && (["top1", "top5", "top10"].includes(revenueBand) || activity !== "dormant")) return "rich";
  if (sourceType === "web_original" && revenueBand === "long_tail" && activity === "dormant") return "sparse";
  if (ambiguityRisk === "high" && activity === "dormant") return "sparse";
  return "mixed";
}

function monthWindow(latestMonth, count) {
  const [year, month] = String(latestMonth).split("-").map(Number);
  const result = new Set();
  for (let offset = 0; offset < count; offset += 1) {
    const date = new Date(Date.UTC(year, month - 1 - offset, 1));
    result.add(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return result;
}

function reviewScore(work) {
  return (work.highValue ? 4 : 0) + (work.ambiguityRisk === "high" ? 3 : 0) + (work.evidencePrior === "sparse" ? 2 : 0) + (work.revenueModel !== "pure_sales_share" ? 1 : 0);
}

function checkSeals(spec) {
  const serialized = JSON.stringify(spec);
  return (
    !/"finalHoldoutOpened"\s*:\s*true/iu.test(serialized) &&
    !/"embargoShadowOpened"\s*:\s*true/iu.test(serialized) &&
    !/"deferred60MonthLabelsOpened"\s*:\s*true/iu.test(serialized) &&
    !/"releaseAuthorized"\s*:\s*true/iu.test(serialized)
  );
}

function privateStoreStatus(root) {
  const ignored = git(root, ["check-ignore", "--quiet", "--", `${PRIVATE_STORE_RELATIVE}/.sentinel`]).status === 0;
  const tracked = git(root, ["ls-files", "--", PRIVATE_STORE_RELATIVE]);
  return { ignored, untracked: tracked.status === 0 && tracked.stdout.trim() === "" };
}

function assertPrivateStoreIgnored(root) {
  const status = privateStoreStatus(root);
  if (!status.ignored || !status.untracked) throw new Error("private_store_must_be_ignored_and_untracked");
}

function git(root, args) {
  return spawnSync("git", args, { cwd: root, encoding: "utf8" });
}

function renderSummaryMarkdown(summary, gate) {
  const strata = summary.sample.aggregateStrata;
  return `# M2 v2 External Evidence Pilot 摘要 v0.1

## 结论

本轮判定为 **${gate.decision}**，实际执行状态为 \`${summary.pilotExecutionStatus}\`。固定 160 部样本、provider/query/entity/source/time/conflict/private-store 框架和 fail-closed 审计已完成；由于当前没有获授权且可审计的 runtime provider，也没有经条款/法律批准的域名条目，未发出外部请求、未生成或伪造 evidence，当前不具备进入 V2-C 的条件。

## 固定样本

- population：${summary.sample.population}；sample：${summary.sample.actual}；seed：\`${summary.sample.seed}\`；
- publication / web_original：${strata.sourceType.publication ?? 0} / ${strata.sourceType.web_original ?? 0}；
- top1 / top5 / top10 / middle / long-tail：${strata.revenueBand.top1 ?? 0} / ${strata.revenueBand.top5 ?? 0} / ${strata.revenueBand.top10 ?? 0} / ${strata.revenueBand.middle ?? 0} / ${strata.revenueBand.long_tail ?? 0}；
- pure-sales / mixed / pure-buyout / unknown：${strata.revenueModel.pure_sales_share ?? 0} / ${strata.revenueModel.buyout_plus_sales ?? 0} / ${strata.revenueModel.pure_buyout ?? 0} / ${strata.revenueModel.unknown_revenue_model ?? 0}；
- dense / intermittent / dormant：${strata.activity.dense ?? 0} / ${strata.activity.intermittent ?? 0} / ${strata.activity.dormant ?? 0}；
- 高歧义风险预注册：${strata.ambiguityRisk.high ?? 0}；预计 evidence rich / sparse：${strata.evidencePrior.rich ?? 0} / ${strata.evidencePrior.sparse ?? 0}。

## Provider 与检索

- provider mode：\`${summary.provider.mode}\`；availability：\`${summary.provider.availability}\`；
- planned / dispatched queries：${summary.retrieval.plannedQueryCount} / ${summary.retrieval.dispatchedQueryCount}；
- results / pages / accepted evidence：${summary.retrieval.resultCount} / ${summary.retrieval.pageCount} / ${summary.evidence.acceptedCount}；
- 实体 resolved / unresolved / ambiguous：${summary.entityResolution.resolved} / ${summary.entityResolution.unresolved} / ${summary.entityResolution.ambiguous}；
- 有效 evidence coverage / 高价值 coverage：${formatRate(summary.evidence.validEvidenceWorkCoverage)} / ${formatRate(summary.evidence.highValueValidEvidenceCoverage)}；
- cost：CNY ${summary.costLatency.totalCostCny}；latency：不可评估；复现性：\`${summary.reproducibility.status}\`。

## Gate 与边界

- 安全/审计硬门：${gate.hardGate.passedCount}/${gate.hardGate.totalCount}；
- evidence usability：未通过（无 provider，coverage、实体解析、来源稳定性和真实复现性不可评估）；
- final holdout、embargo shadow、60-month labels 均保持 sealed；
- 未训练模型、未改变 B4、未进入 V2-C/V2-D/C4/M3、未 release；
- 全部结果保持 \`not_for_formal_decision\`。
`;
}

function renderNextStepMarkdown(nextStep) {
  return `# M2 v2 External Evidence Pilot 下一步 v0.1

## 决策

当前为 **${nextStep.decision}**，建议 **DO NOT START V2-C**。

## 解除阻断的最小动作

1. 提供一个具备查询审计、receipt、成本和 resume/cache 能力的授权 runtime provider；
2. 对至少一个实际域名完成条款与法律评审，并把批准记录写入 versioned allowlist；
3. 在同一 immutable manifest 上执行 \`resume\`，不得重新抽样；
4. 运行完整验证并重新生成聚合报告；
5. 只有达到预注册 usability 阈值后，才可另行申请 V2-C prospective shadow 授权。

本轮不要求用户逐作品补外部信息，也不得让人工补写搜索结果。模型训练、B4 修改、final holdout、V2-C/V2-D/C4/M3 与 release 均不在授权范围内。
`;
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

function atomicWriteNdjson(path, records) {
  atomicWriteText(path, records.length ? `${records.map((record) => JSON.stringify(record)).join("\n")}\n` : "");
}

function atomicWriteText(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, text, "utf8");
  renameSync(temporary, path);
}

async function hashFile(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function countBy(records, selector) {
  const result = {};
  for (const record of records) {
    const key = String(selector(record) ?? "unknown");
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

function percentile(sorted, quantile) {
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * quantile) - 1));
  return sorted[index];
}

function ratio(numerator, denominator) {
  return denominator ? numerator / denominator : null;
}

function sum(values) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

function round(value, digits = 6) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatRate(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : "不可评估";
}
