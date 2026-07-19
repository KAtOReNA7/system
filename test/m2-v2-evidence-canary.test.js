import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  CANARY_REQUEST_CAP,
  CANARY_SLOT_RULES,
  CANARY_TOTAL_PLANNED_REQUESTS,
  assertOutboundPayload,
  buildCanaryTasks,
  buildRelayRequestPayload,
  compareCanaryReproducibility,
  evaluateCanaryCoverage,
  evaluateCanaryContradictions,
  evaluateCanaryDecision,
  materializeEvidenceCandidates,
  parseRelayResponse,
  resolveCanaryEntity,
  selectCanarySubset,
} from "../src/domain/m2V2EvidencePilot/canaryCore.js";
import { OpenAICompatibleRelayCanaryAdapter } from "../src/domain/m2V2EvidencePilot/openAiCompatibleRelayAdapter.js";
import {
  CANARY_PUBLIC_REPORTS,
  calibrationSealsAreClosed,
  renderDecisionMarkdown,
  renderExecutionMarkdown,
  renderQualityMarkdown,
} from "../src/domain/m2V2EvidencePilot/canaryRuntime.js";
import { assertPublicSanitized, sha256 } from "../src/domain/m2V2EvidencePilot/pilotCore.js";
import { requireRegisteredArtifacts } from "./helpers/m2V2RequiredArtifacts.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("canary subset is deterministic, derived from 160 and covers every frozen slot", () => {
  const parent = syntheticParentManifest();
  const first = selectCanarySubset(parent);
  const second = selectCanarySubset(parent);
  assert.equal(first.selected.length, 10);
  assert.equal(new Set(first.selected.map((item) => item.standardWorkId)).size, 10);
  assert.deepEqual(first.selected.map((item) => item.standardWorkId), second.selected.map((item) => item.standardWorkId));
  assert.equal(first.repeatWorks.length, 5);
  assert.ok(Object.values(evaluateCanaryCoverage(first.selected)).every(Boolean));
  assert.deepEqual(first.selected.map((item) => item.canarySlotId), CANARY_SLOT_RULES.map((item) => item.id));
});

test("canary plan freezes 40 primary plus 20 fresh-repeat requests within 8 per work and 100 total", () => {
  const manifest = syntheticCanaryManifest();
  const tasks = buildCanaryTasks(manifest);
  assert.equal(tasks.length, CANARY_TOTAL_PLANNED_REQUESTS);
  assert.ok(tasks.length <= CANARY_REQUEST_CAP);
  const byWork = Object.groupBy(tasks, (item) => item.workReference);
  assert.ok(Object.values(byWork).every((items) => items.length <= 8));
  assert.equal(tasks.filter((item) => item.runKind === "primary").length, 40);
  assert.equal(tasks.filter((item) => item.runKind === "repeat").length, 20);
  assert.ok(tasks.every((item) => item.prohibitedFieldsTransmitted === false));
});

test("relay payload contains only allowed identity inputs and excludes internal sentinel fields", () => {
  const task = {
    requestKey: "request-key",
    runKind: "primary",
    workReference: "internal-work-secret",
    identityDigest: "identity-digest-secret",
    title: "合成作品甲",
    author: "合成作者甲",
    sourceType: "publication",
    queryText: "合成作品甲 合成作者甲 官方",
  };
  const payload = buildRelayRequestPayload(task, "synthetic-model");
  assert.equal(assertOutboundPayload(payload, task), true);
  const serialized = JSON.stringify(payload);
  assert.match(serialized, /合成作品甲/u);
  assert.match(serialized, /合成作者甲/u);
  assert.match(serialized, /source_type: publication/u);
  assert.doesNotMatch(serialized, /internal-work-secret|identity-digest-secret/iu);
});

test("Responses web_search output requires strict JSON and extracts URL citation alignment inputs", () => {
  const parsed = parseRelayResponse(syntheticResponse());
  assert.equal(parsed.responsesShapeValid, true);
  assert.equal(parsed.webSearchObserved, true);
  assert.equal(parsed.structuredValid, true);
  assert.equal(parsed.citations.length, 1);
  assert.equal(parsed.citations[0].alignmentLevel, "same_output_text_item");
  assert.equal(typeof parsed.citations[0].annotationDigest, "string");
  assert.equal(parsed.citations[0].outputTextItemDigest, parsed.structuredOutputItemDigest);
  assert.equal(parsed.structured.evidenceCandidates.length, 1);
});

test("citation on a different output_text item is auditable but fails closed", () => {
  const response = syntheticResponse();
  const message = response.output[1];
  const annotations = message.content[0].annotations;
  message.content[0].annotations = [];
  message.content.push({ type: "output_text", text: "Separate citation note", annotations });
  const parsed = parseRelayResponse(response);
  assert.equal(parsed.structuredValid, true);
  assert.equal(parsed.citations[0].alignmentLevel, "different_output_text_item");

  const receipt = receiptFromResponse(response);
  const records = materializeEvidenceCandidates({
    work: { standardWorkId: "synthetic-work", identityDigest: "digest", title: "合成作品甲", author: "合成作者甲" },
    receipts: [receipt],
    entityResolution: { resolutionStatus: "resolved", workIdentity: { status: "high" }, authorIdentity: { status: "high" } },
    sourceAllowlist: approvedSyntheticAllowlist(),
    runKind: "primary",
  });
  assert.equal(records[0].citationAlignment, false);
  assert.equal(records[0].citationAlignmentLevel, "different_output_text_item");
  assert.ok(records[0].rejectionReasons.includes("citation_not_bound_to_structured_output_item"));
  assert.equal(records[0].disposition, "rejected");
});

test("local strict schema rejects additional properties, invalid enum and mismatched structured value types", () => {
  const response = syntheticResponse();
  const content = response.output[1].content[0];
  const value = JSON.parse(content.text);
  value.unexpected = true;
  value.queryOutcome = "unsupported";
  value.authorWorkRelationshipConfirmed = "true";
  value.evidenceCandidates[0].unexpected = "extra";
  value.evidenceCandidates[0].structuredValue.numberValue = 1;
  content.text = JSON.stringify(value);
  const parsed = parseRelayResponse(response);
  assert.equal(parsed.structuredValid, false);
  assert.ok(parsed.validationIssues.includes("output_additional_property:unexpected"));
  assert.ok(parsed.validationIssues.includes("query_outcome_invalid"));
  assert.ok(parsed.validationIssues.includes("author_work_relationship_flag_invalid"));
  assert.ok(parsed.validationIssues.includes("candidate_0_additional_property:unexpected"));
  assert.ok(parsed.validationIssues.includes("candidate_0_structured_value_numberValue_must_be_null"));

  const receipt = receiptFromResponse(response);
  const work = { standardWorkId: "synthetic-work", identityDigest: "digest", title: "合成作品甲", author: "合成作者甲" };
  const entity = resolveCanaryEntity(work, [receipt]);
  assert.equal(entity.resolutionStatus, "unresolved");
  const records = materializeEvidenceCandidates({
    work,
    receipts: [receipt],
    entityResolution: { resolutionStatus: "resolved", workIdentity: { status: "high" }, authorIdentity: { status: "high" } },
    sourceAllowlist: approvedSyntheticAllowlist(),
    runKind: "primary",
  });
  assert.equal(records[0].localSchemaValidation.valid, false);
  assert.ok(records[0].rejectionReasons.includes("local_schema_validation_failed"));
  assert.equal(records[0].disposition, "rejected");
});

test("entity resolution keeps work and author bands separate and rejects title-only identity", () => {
  const work = { title: "合成作品甲", author: "合成作者甲", sameNameCount: 2 };
  const receipt = receiptFromResponse(syntheticResponse({
    workIdentity: { status: "high", matchedTitle: "合成作品甲", matchedAuthor: "另一个作者", basis: "title_only" },
    authorIdentity: { status: "unresolved", matchedAuthor: null, basis: null },
    authorWorkRelationshipConfirmed: false,
  }));
  const result = resolveCanaryEntity(work, [receipt]);
  assert.equal(result.resolutionStatus, "ambiguous");
  assert.equal(result.workIdentity.status, "low");
  assert.equal(result.authorIdentity.status, "unresolved");
  assert.equal(result.titleOnlyRejected, true);
});

test("empty frozen source allowlist rejects aligned evidence while an approved synthetic entry can accept it", () => {
  const work = { standardWorkId: "synthetic-work", identityDigest: "digest", title: "合成作品甲", author: "合成作者甲" };
  const receipt = receiptFromResponse(syntheticResponse());
  const entityResolution = {
    resolutionStatus: "resolved",
    workIdentity: { status: "high" },
    authorIdentity: { status: "high" },
  };
  const rejected = materializeEvidenceCandidates({ work, receipts: [receipt], entityResolution, sourceAllowlist: { approvedDomainEntries: [] }, runKind: "primary" });
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].citationAlignment, true);
  assert.equal(rejected[0].citationAlignmentLevel, "same_output_text_item_exact_url");
  assert.equal(rejected[0].historicalBackfill, false);
  assert.equal(rejected[0].timeProvenance.prospective, true);
  assert.equal(rejected[0].disposition, "rejected");
  assert.ok(rejected[0].rejectionReasons.includes("domain_not_explicitly_allowlisted"));

  const accepted = materializeEvidenceCandidates({
    work,
    receipts: [receipt],
    entityResolution,
    sourceAllowlist: approvedSyntheticAllowlist(),
    runKind: "primary",
  });
  assert.equal(accepted[0].disposition, "accepted");
  assert.deepEqual(accepted[0].rejectionReasons, []);
});

test("missing prospective receipt provenance is rejected and counted as historical-backfill risk", () => {
  const receipt = receiptFromResponse(syntheticResponse(), { receiptDigest: null });
  const records = materializeEvidenceCandidates({
    work: { standardWorkId: "synthetic-work", identityDigest: "digest", title: "合成作品甲", author: "合成作者甲" },
    receipts: [receipt],
    entityResolution: { resolutionStatus: "resolved", workIdentity: { status: "high" }, authorIdentity: { status: "high" } },
    sourceAllowlist: approvedSyntheticAllowlist(),
    runKind: "primary",
  });
  assert.equal(records[0].historicalBackfill, true);
  assert.equal(records[0].timeProvenance.prospective, false);
  assert.ok(records[0].rejectionReasons.includes("prospective_observation_not_proven"));
  assert.equal(records[0].disposition, "rejected");
});

test("contradiction audit separates raw from admissible and rejected claims cannot veto accepted evidence", () => {
  const accepted = contradictionRecord("accepted-a", "accepted", "A");
  const rejected = contradictionRecord("rejected-b", "rejected", "B");
  const groups = evaluateCanaryContradictions([accepted, rejected]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].rawStatus, "unresolved");
  assert.equal(groups[0].admissibleStatus, "none");
  assert.equal(groups[0].rejectedClaimsMayVetoAdmissible, false);
  assert.equal(accepted.disposition, "accepted");

  const acceptedOtherTime = contradictionRecord("accepted-other-time", "accepted", "B", { effectiveTime: "2026-07-16T00:00:00.000Z" });
  const timeGroups = evaluateCanaryContradictions([accepted, acceptedOtherTime]);
  assert.equal(timeGroups[0].segments.length, 2);
  assert.equal(timeGroups[0].admissibleStatus, "none");
  assert.equal(accepted.disposition, "accepted");
  assert.equal(acceptedOtherTime.disposition, "accepted");
});

test("admissible conflicts in the same subject and effective time are excluded without LLM winner selection", () => {
  const left = contradictionRecord("accepted-left", "accepted", "A");
  const right = contradictionRecord("accepted-right", "accepted", "B");
  const groups = evaluateCanaryContradictions([left, right]);
  assert.equal(groups[0].admissibleStatus, "unresolved_excluded_candidates");
  assert.equal(groups[0].status, "admissible_conflicts_excluded");
  assert.equal(groups[0].llmSelectedWinner, false);
  assert.equal(left.disposition, "rejected");
  assert.equal(right.disposition, "rejected");
  assert.ok(left.rejectionReasons.includes("unresolved_contradiction"));
});

test("repeat population gate requires all five works to be evaluable on both runs", () => {
  const repeatWorks = Array.from({ length: 5 }, (_, index) => ({ standardWorkId: `work-${index}`, identityDigest: `digest-${index}` }));
  const primary = repeatWorks.map((work, index) => reproducibilityRecord(work.standardWorkId, `claim-${index}`));
  const repeat = repeatWorks.slice(0, 4).map((work, index) => reproducibilityRecord(work.standardWorkId, `claim-${index}`));
  const result = compareCanaryReproducibility(primary, repeat, repeatWorks);
  assert.equal(result.basis, "raw_candidate_claims_including_rejected");
  assert.equal(result.evaluableWorkCount, 4);
  assert.equal(result.admissibleEvaluableWorkCount, 0);
  assert.equal(result.admissibleClaimAgreement, null);
  assert.equal(result.perWork.filter((item) => item.evaluable).length, 4);

  const metrics = decisionMetrics();
  metrics.reproducibility = { evaluableWorkCount: 4, claimAgreement: 1 };
  const decision = evaluateCanaryDecision(metrics, { allTestsPassed: true, privacyLeakCount: 0 });
  assert.ok(decision.blockers.includes("repeat_population_evaluable"));
  assert.equal(decision.allowFull160Pilot, false);
});

test("canary decision is conditional for governance or cost gaps and fail for a safety leak", () => {
  const metrics = decisionMetrics();
  const conditional = evaluateCanaryDecision(metrics, { allTestsPassed: true, privacyLeakCount: 0 });
  assert.equal(conditional.decision, "CANARY_CONDITIONAL");
  assert.equal(conditional.allowFull160Pilot, false);
  assert.equal(conditional.allHardInvariantsPassed, true);
  assert.equal(conditional.hardInvariantFailureCount, 0);
  assert.ok(!conditional.blockers.includes("all_hard_invariants_pass"));
  assert.ok(conditional.blockers.includes("accepted_evidence_positive"));
  assert.ok(conditional.blockers.includes("relay_cost_below_budget"));

  const unboundSupplemental = evaluateCanaryDecision({
    ...metrics,
    taskRequestAccounting: {
      supplementalSyntheticRequestCount: 3,
      supplementalProviderBindingProven: false,
    },
  }, { allTestsPassed: true, privacyLeakCount: 0 });
  assert.ok(unboundSupplemental.blockers.includes("supplemental_provider_binding_proven"));

  const fail = evaluateCanaryDecision(metrics, { allTestsPassed: true, privacyLeakCount: 1 });
  assert.equal(fail.decision, "CANARY_FAIL");
  assert.equal(fail.allowFull160Pilot, false);

  const invariantFail = evaluateCanaryDecision(metrics, {
    allTestsPassed: true,
    privacyLeakCount: 0,
    hardInvariantFailureCount: 1,
    allHardInvariantsPassed: false,
  });
  assert.equal(invariantFail.decision, "CANARY_FAIL");
  assert.equal(invariantFail.hardInvariantFailureCount, 1);
  assert.ok(invariantFail.blockers.includes("all_hard_invariants_pass"));
});

test("relay adapter persists neither API key nor Authorization header nor raw response", async () => {
  const secret = "synthetic-secret-not-a-real-key";
  let observedBody = null;
  const adapter = new OpenAICompatibleRelayCanaryAdapter({
    baseUrl: "https://relay.example/v1",
    approvedHost: "relay.example",
    apiKey: secret,
    model: "synthetic-model",
    fetchImpl: async (_url, options) => {
      observedBody = options.body;
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        arrayBuffer: async () => Buffer.from(JSON.stringify(syntheticResponse())),
      };
    },
  });
  const task = {
    requestKey: "request-key",
    runKind: "primary",
    workReference: "internal-work-secret",
    identityDigest: "identity-secret",
    queryId: "query-id",
    queryHash: "query-hash",
    queryCategory: "work_identity_and_source",
    title: "合成作品甲",
    author: "合成作者甲",
    sourceType: "publication",
    queryText: "合成作品甲 合成作者甲 官方",
  };
  const receipt = await adapter.execute(task);
  const serializedReceipt = JSON.stringify(receipt);
  assert.equal(receipt.status, "success");
  assert.equal(receipt.rawResponsePersisted, false);
  assert.equal(receipt.authorizationHeaderPersisted, false);
  assert.equal(receipt.apiKeyPersisted, false);
  assert.doesNotMatch(serializedReceipt, new RegExp(secret, "u"));
  assert.doesNotMatch(observedBody, /internal-work-secret|identity-secret/iu);
  assert.equal(JSON.parse(observedBody).store, false);
});

test("calibration seal contract reads the frozen C3 boolean fields without opening them", () => {
  const spec = JSON.parse(fs.readFileSync(path.join(root, "src/domain/oldProductEvaluation/calibrationSpec.c3.v1.amendment.json"), "utf8"));
  assert.equal(calibrationSealsAreClosed(spec), true);
  assert.equal(calibrationSealsAreClosed({ seals: { ...spec.seals, finalHoldoutOpened: true } }), false);
  assert.equal(calibrationSealsAreClosed({}), false);
});

test("generated public canary reports, when present, are aggregate-only and never authorize full 160", () => {
  const paths = Object.values(CANARY_PUBLIC_REPORTS).filter((item) => item.endsWith(".json"));
  requireRegisteredArtifacts(root, ["CANARY_EXECUTION_JSON", "CANARY_QUALITY_JSON", "CANARY_DECISION_JSON"]);
  const reports = paths.map((item) => JSON.parse(fs.readFileSync(path.join(root, item), "utf8")));
  for (const report of reports) assert.equal(assertPublicSanitized(report), true);
  const decision = reports.find((item) => item.schema === "m2.v2.canary-decision.v0.1");
  assert.equal(decision.full160ExecutionAuthorizedByThisRun, false);
  assert.equal(decision.boundaries.modelTrainingPerformed, false);
  assert.equal(decision.boundaries.b4Changed, false);
  assert.equal(decision.boundaries.finalHoldoutOpened, false);
  assert.equal(decision.taskRequestAccounting.totalProviderRequestCountThisTask, 63);
  assert.equal(decision.taskRequestAccounting.withinTaskRequestCap, true);
  assert.equal(decision.taskRequestAccounting.supplementalProviderBindingProven, false);
  assert.ok(decision.blockers.includes("supplemental_provider_binding_proven"));
  assert.equal(decision.auditStatus.privateArtifactsIgnoredAndUntracked, true);
  assert.equal(decision.auditStatus.publicPrivacyLeakCount, 0);
  assert.equal(decision.auditStatus.reviewWorkbookPresentAndXlsxContainerValid, true);

  const bySchema = new Map(reports.map((report) => [report.schema, report]));
  const markdownPairs = [
    [CANARY_PUBLIC_REPORTS.executionMarkdown, renderExecutionMarkdown(bySchema.get("m2.v2.canary-execution-summary.v0.1"))],
    [CANARY_PUBLIC_REPORTS.qualityMarkdown, renderQualityMarkdown(bySchema.get("m2.v2.canary-quality-report.v0.1"))],
    [CANARY_PUBLIC_REPORTS.decisionMarkdown, renderDecisionMarkdown(bySchema.get("m2.v2.canary-decision.v0.1"))],
  ];
  for (const [relativePath, expected] of markdownPairs) {
    const actualCanonicalLf = fs
      .readFileSync(path.join(root, relativePath), "utf8")
      .replace(/\r\n?/gu, "\n");
    const expectedCanonicalLf = expected.replace(/\r\n?/gu, "\n");
    assert.equal(actualCanonicalLf, expectedCanonicalLf);
  }
});

function syntheticParentManifest() {
  const sample = CANARY_SLOT_RULES.map((slot, index) => syntheticWork(index, slot));
  for (let index = sample.length; index < 160; index += 1) {
    sample.push(syntheticWork(index, {
      sourceType: index % 2 ? "publication" : "web_original",
      revenueModel: "pure_sales_share",
      highValue: false,
      ambiguityRisk: "medium",
      evidencePrior: "mixed",
    }));
  }
  const payload = {
    schema: "m2.v2.evidence-pilot-private-manifest.v0.1",
    privateOnly: true,
    immutable: true,
    status: "frozen_before_retrieval",
    sample,
  };
  return { ...payload, manifestDigest: sha256(payload) };
}

function syntheticCanaryManifest() {
  const selection = selectCanarySubset(syntheticParentManifest());
  return {
    canaryManifestDigest: "c".repeat(64),
    sample: selection.selected,
    repeatSample: selection.repeatWorks.map((item) => ({ standardWorkId: item.standardWorkId, identityDigest: item.identityDigest })),
  };
}

function syntheticWork(index, overrides) {
  return {
    standardWorkId: `synthetic-work-${String(index).padStart(3, "0")}`,
    title: `合成作品${index}`,
    author: `合成作者${index}`,
    identityDigest: sha256(`identity-${index}`),
    sourceType: "publication",
    revenueBand: overrides.highValue ? "top10" : "middle",
    revenueModel: "pure_sales_share",
    activity: "dense",
    ambiguityRisk: "medium",
    evidencePrior: "mixed",
    highValue: false,
    sameNameCount: 1,
    ...overrides,
  };
}

function syntheticResponse(overrides = {}) {
  const structured = {
    queryOutcome: "success",
    workIdentity: { status: "high", matchedTitle: "合成作品甲", matchedAuthor: "合成作者甲", basis: "title_author_composite" },
    authorIdentity: { status: "high", matchedAuthor: "合成作者甲", basis: "author_page" },
    authorWorkRelationshipConfirmed: true,
    evidenceCandidates: [{
      sourceUrl: "https://official.example/work/1",
      sourceTitle: "Synthetic official record",
      sourceDomain: "official.example",
      availableAt: "2026-07-16T00:00:00.000Z",
      eventTime: "2026-07-15T00:00:00.000Z",
      claimType: "work_identity",
      structuredValue: { valueType: "text", textValue: "synthetic", dateValue: null, numberValue: null, booleanValue: null },
      confidence: 0.95,
      entitySupport: "both",
      sourceQualityHint: "official",
    }],
    ...overrides,
  };
  return {
    output: [
      { type: "web_search_call", status: "completed" },
      { type: "message", content: [{
        type: "output_text",
        text: JSON.stringify(structured),
        annotations: [{ type: "url_citation", url: "https://official.example/work/1", title: "Synthetic official record" }],
      }] },
    ],
    usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
  };
}

function receiptFromResponse(response, overrides = {}) {
  const parsed = parseRelayResponse(response);
  return {
    requestKey: "request-key",
    runKind: "primary",
    queryId: "query-id",
    status: "success",
    dispatched: true,
    capturedAt: "2026-07-17T00:00:00.000Z",
    receiptDigest: sha256("synthetic-receipt"),
    structuredResponse: parsed.structured,
    citations: parsed.citations,
    ...overrides,
  };
}

function approvedSyntheticAllowlist() {
  return {
    approvedDomainEntries: [{
      domain: "official.example",
      enabled: true,
      approvalStatus: "approved",
      sourceTier: "authoritative",
      sourceTermsClass: "structured_facts_allowed",
    }],
  };
}

function contradictionRecord(evidenceId, disposition, value, overrides = {}) {
  return {
    evidenceId,
    workReference: "synthetic-work",
    claimType: "ranking_signal",
    claimSubject: "work",
    effectiveTime: "2026-07-15T00:00:00.000Z",
    eventTime: "2026-07-15T00:00:00.000Z",
    availableAt: "2026-07-15T00:00:00.000Z",
    structuredValue: { valueType: "text", textValue: value, dateValue: null, numberValue: null, booleanValue: null },
    disposition,
    rejectionReasons: disposition === "accepted" ? [] : ["synthetic_rejection"],
    ...overrides,
  };
}

function reproducibilityRecord(workReference, value) {
  return {
    workReference,
    claimType: "ranking_signal",
    structuredValue: { valueType: "text", textValue: value, dateValue: null, numberValue: null, booleanValue: null },
    sourceUrl: `https://official.example/${workReference}`,
  };
}

function decisionMetrics() {
  return {
    retrieval: { successRate: 0.9 },
    entity: { resolutionRate: 0.9 },
    evidence: { acceptedCount: 0, historicalBackfillCount: 0 },
    citation: { acceptedAlignmentRate: null },
    source: { prohibitedAcceptedCount: 0 },
    cost: { estimatedRelayCostCny: null, budgetCny: 25, costProven: false, withinBudget: false },
    reproducibility: { evaluableWorkCount: 5, claimAgreement: 0.9 },
  };
}
