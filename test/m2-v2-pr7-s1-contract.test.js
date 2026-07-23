import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  S1_BATCHES,
  S1_EXTERNAL_ENV_NAMES,
  S1_FALLBACK_EVENT_FIELDS,
  S1_FINDING_IDS,
  S1_HISTORICAL_PATHS,
  S1_LOCAL_VALIDATION_CHECK_FIELDS,
  S1_PREFLIGHT_FACT_FIELDS,
  assertNoHardcodedRemotePass,
  deriveS1AuditedTransportCounts,
  evaluateS1PreflightFacts,
  evaluateTrackedOnlySourcePolicy,
  parseJsonUtf8Strict,
  resolveRegisteredCommand,
  sha256PortableText,
  validateCaseRegistry,
  validateContractRegistry,
  validateContractSemanticClosure,
  validateHistoricalArtifactBindings,
  validateJsonSchema,
  validateS1CommandRegistry,
  validateS1FallbackEvent,
  validateS1Overlay,
  validateS1Receipt,
  validateS1SourceAuthenticityBinding,
  validateS1TaskManifest,
  validateVersionGraphAcyclic,
} from "../scripts/m2-v2-evidence-pilot/m2_v2_pr7_s1_contract.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const paths = Object.freeze({
  task: "config/m2-v2-pr7-s1-task.v0.1.json",
  command: "config/m2-v2-pr7-s1-command-registry.v0.1.json",
  receipt: "config/m2-v2-pr7-s1-receipt-schema.v0.1.json",
  contract: "config/m2-v2-pr7-s1-contract-registry.v0.1.json",
  cases: "config/m2-v2-pr7-s1-case-registry.v0.1.json",
  overlay: "docs/analysis/m2-v2/M2-v2-PR7-open-findings-status-v0.1.json",
});
const bytes = Object.fromEntries(Object.entries(paths).map(([id, path]) => [id, read(path)]));
const taskManifest = parseJsonUtf8Strict(bytes.task);
const commandRegistry = parseJsonUtf8Strict(bytes.command);
const receiptSchema = parseJsonUtf8Strict(bytes.receipt);
const contractRegistry = parseJsonUtf8Strict(bytes.contract);
const caseRegistry = parseJsonUtf8Strict(bytes.cases);
const overlay = parseJsonUtf8Strict(bytes.overlay);
const packageJson = parseJsonUtf8Strict(read("package.json"));
const workflowSource = read(".github/workflows/ci.yml").toString("utf8");
const historicalBytes = new Map(taskManifest.historicalImmutableArtifacts.map((binding) => [
  binding.path,
  read(binding.path),
]));
const baselineHistoricalBytes = new Map(taskManifest.historicalImmutableArtifacts.map((binding) => [
  binding.path,
  gitShow(binding.baselineHead, binding.path),
]));
const contractArtifactBytes = new Map(contractRegistry.contracts.flatMap((contract) => [
  [contract.machinePath, read(contract.machinePath)],
  [contract.narrativePath, read(contract.narrativePath)],
]));
const trackedPaths = new Set(gitNull(["ls-files", "-z"]));

const passingFacts = Object.freeze(Object.fromEntries(S1_PREFLIGHT_FACT_FIELDS.map((field) => [field, true])));

test("S1 task binds exact git anchors, B0-B7-only DAG, four source groups, registries, and immutable history", () => {
  assert.equal(validateS1TaskManifest(taskManifest, taskBindings()), true);
  assert.equal(taskManifest.startingHead, "badbf453e1e99ba87cc3064601e480a09ff1b149");
  assert.equal(taskManifest.findingHead, "627f74c6b9b2365ee4403c613ea9689748b76541");
  assert.equal(taskManifest.baseSha, "d81b952e37dd43365c0091cdd6665e69d8d39a7e");
  assert.deepEqual(taskManifest.authorizedBatches, S1_BATCHES);
  assert.equal(taskManifest.currentBatch, "B6");
  assert.equal(taskManifest.batchDag.independentReviewBatchAuthorized, true);
  assert.equal(taskManifest.requiredSourceEvidence.length, 4);
  assert.deepEqual(taskManifest.historicalImmutableArtifacts.map((binding) => binding.path), S1_HISTORICAL_PATHS);
  assert.equal(taskManifest.privateStatePolicy.newOutputRoot, "data/private-output/m2-v2-pr7-s1-remediation-badbf45");
  assert.equal(taskManifest.gitPolicy.maxCompletedAtomicCommitsUnpushed, 1);
  assert.equal(taskManifest.gitPolicy.perBatchLinuxWindowsCiRequired, true);
});

test("all portable registry and historical bindings are content-sensitive and CRLF-portable", () => {
  for (const [id, binding] of Object.entries(taskManifest.registries)) {
    assert.equal(binding.sha256, sha256PortableText(read(binding.path)), id);
    assert.equal(binding.sha256, sha256PortableText(withCrlf(read(binding.path))), `${id} CRLF`);
  }
  assert.equal(validateHistoricalArtifactBindings(taskManifest.historicalImmutableArtifacts, historicalBytes), true);
  assert.equal(validateHistoricalArtifactBindings(taskManifest.historicalImmutableArtifacts, baselineHistoricalBytes), true);
  const changed = new Map(historicalBytes);
  changed.set(S1_HISTORICAL_PATHS[0], Buffer.concat([changed.get(S1_HISTORICAL_PATHS[0]), Buffer.from(" ")]));
  assert.throws(
    () => validateHistoricalArtifactBindings(taskManifest.historicalImmutableArtifacts, changed),
    /historical_artifact_digest_mismatch/u,
  );
});

test("S1 command registry is exact, argv-based, provider-free, and rejects unknown commands", () => {
  const summary = validateS1CommandRegistry(commandRegistry);
  assert.deepEqual(summary.commandIds, [
    "s1.doctor", "s1.contracts", "s1.default.isolated", "s1.validate.local",
  ]);
  assert.equal(resolveRegisteredCommand(commandRegistry, "s1.doctor").executable, "node");
  assert.throws(() => resolveRegisteredCommand(commandRegistry, "s1.unknown"), /unknown_command_id/u);
  const unknownField = structuredClone(commandRegistry);
  unknownField.remoteState = "UNKNOWN";
  assert.throws(() => validateS1CommandRegistry(unknownField), /command_registry_fields_invalid/u);
  const shellControl = structuredClone(commandRegistry);
  shellControl.commands[0].argv.push("npm test && exit 0");
  assert.throws(() => validateS1CommandRegistry(shellControl), /command_shell_operator_forbidden/u);
});

test("vNext contract registry binds every machine/narrative byte, 19 tracked baselines, and explicit safe-cache lineage", () => {
  const summary = validateContractRegistry(contractRegistry, {
    contractArtifactBytesByPath: contractArtifactBytes,
    historicalArtifactBytesByPath: historicalBytes,
    trackedPaths,
  });
  assert.deepEqual(summary, { contractCount: 7, findingCount: 10, edgeCount: 10 });
  assert.deepEqual(validateContractSemanticClosure(contractRegistry, contractArtifactBytes), {
    contractCount: 7,
    authorityNodeCount: 15,
  });
  assert.equal(contractRegistry.historicalBaselines.trackedArtifacts.length, 19);
  assert.equal(contractRegistry.historicalBaselines.safeCachePredecessor.trackedPublicArtifactPresent, false);
  assert.equal(contractRegistry.versionGraph.everyTargetResolvedByExactlyOneRegistryNode, true);
  assert.equal(contractRegistry.contracts.every((contract) => contract.declaredSchemas[0] === contract.schema), true);
  for (const baseline of contractRegistry.historicalBaselines.trackedArtifacts) {
    assert.equal(trackedPaths.has(baseline.path), true, baseline.path);
    assert.equal(sha256PortableText(read(baseline.path)), baseline.sha256, baseline.path);
  }
});

test("version graph is acyclic and every target resolves through exactly one declared current node", () => {
  assert.deepEqual(validateVersionGraphAcyclic(contractRegistry.versionGraph.edges), { edgeCount: 10, acyclic: true });
  const targetNodes = [
    ...contractRegistry.contracts.flatMap((contract) => contract.declaredSchemas),
    contractRegistry.plannedCurrentAuthority.currentStateIndex.schema,
    contractRegistry.plannedCurrentAuthority.integrityRestatement.schema,
  ];
  for (const edge of contractRegistry.versionGraph.edges) {
    assert.equal(targetNodes.filter((node) => node === edge.to).length, 1, edge.to);
  }
  assert.throws(
    () => validateVersionGraphAcyclic([{ from: "a", to: "b" }, { from: "b", to: "a" }]),
    /version_graph_cycle_detected/u,
  );
});

test("all 10 findings map to exactly 89 planned identities with frozen category, platform, and secondary totals", () => {
  const summary = validateCaseRegistry(caseRegistry);
  assert.deepEqual(summary, {
    total: 89,
    linux: 87,
    windows: 88,
    secondaryVerifierRequired: 30,
    correctionCount: 3,
  });
  assert.deepEqual(contractRegistry.findingIds, S1_FINDING_IDS);
  assert.equal(new Set(caseRegistry.cases.map((entry) => entry.caseId)).size, 89);
  assert.equal(caseRegistry.cases.every((entry) => entry.mustEnterDefaultNpmTest === true), true);
  assert.equal(caseRegistry.cases.every((entry) => entry.providerAllowed === false), true);
  assert.equal(caseRegistry.cases.every((entry) => entry.privateStateAllowed === "SYNTHETIC_TEMP_ONLY"), true);
  assert.equal(caseRegistry.status, "PLANNED_NOT_EXECUTED");
});

test("the three historical P2-008 field-shape errors are normalized without changing case semantics", () => {
  const expected = new Map([
    ["PR7-P2-008-short-case", "windows"],
    ["PR7-P2-008-unc-unstable", "windows"],
    ["PR7-P2-008-posix-link-mount", "linux"],
  ]);
  assert.equal(caseRegistry.corrections.length, expected.size);
  for (const correction of caseRegistry.corrections) {
    assert.equal(correction.normalizedFieldShape.proposedTestFile, "string");
    assert.equal(correction.normalizedFieldShape.platforms, "array");
    assert.equal(correction.proposedTestFile, "test/m2-v2-private-state-migration.test.js");
    assert.deepEqual(correction.platforms, [expected.get(correction.caseId)]);
  }
});

test("receipt schema enforces exact success and failure envelopes plus the S1 fallback batch identity", () => {
  const success = validSuccessReceipt();
  assert.equal(validateS1Receipt(success, receiptSchema), true);
  const unknown = { ...success, remoteState: "UNKNOWN" };
  assert.throws(() => validateS1Receipt(unknown, receiptSchema), /json_schema_unknown/u);
  const missing = structuredClone(success);
  delete missing.contractRegistrySha256;
  assert.throws(() => validateS1Receipt(missing, receiptSchema), /json_schema_required/u);
  const failure = {
    schema: "m2.v2.pr7.s1-preflight-receipt.v0.1",
    passed: false,
    generatedAt: "2026-07-19T00:00:00.000Z",
    batchId: taskManifest.currentBatch,
    actualHead: "0".repeat(40),
    checks: {},
    executions: [],
    fallbackEvents: [],
    failureStage: "synthetic_negative_gate",
    error: {
      name: "Error",
      code: "UNSPECIFIED",
      reasonCode: "synthetic_negative_gate",
      messageDigest: "0".repeat(64),
    },
  };
  assert.equal(validateS1Receipt(failure, receiptSchema), true);
  for (const [name, mutate, expected] of [
    ["arbitrary schema", (value) => { value.schema = "anything"; }, /json_schema_enum|s1_receipt_schema_unknown/u],
    ["empty success checks", (value) => { value.checks = {}; }, /s1_preflight_receipt_checks_fields_invalid/u],
    ["empty environment evidence", (value) => { value.externalEnvironment = []; }, /json_schema_min_items|s1_receipt_external_environment_count_mismatch/u],
    ["unavailable capability", (value) => { value.capabilities.node.available = false; }, /json_schema_const|s1_receipt_capability_unavailable/u],
    ["negative source count", (value) => { value.sourceEvidence.sourceCount = -9; }, /json_schema_const|s1_receipt_source_count_mismatch/u],
    ["source status/private contradiction", (value) => { value.sourceEvidence.privateEvidencePresent = true; }, /s1_receipt_source_status_private_binding_invalid/u],
    ["success with failure envelope", (value) => {
      value.failureStage = "synthetic";
      value.error = failure.error;
    }, /s1_success_receipt_fields_invalid/u],
  ]) {
    const invalid = structuredClone(success);
    mutate(invalid);
    assert.throws(() => validateS1Receipt(invalid, receiptSchema), expected, name);
  }

  const localSuccess = validLocalSuccessReceipt();
  assert.equal(validateS1Receipt(localSuccess, receiptSchema), true);
  const missingDatabaseCount = structuredClone(localSuccess);
  delete missingDatabaseCount.checks.databaseConnections;
  assert.throws(
    () => validateS1Receipt(missingDatabaseCount, receiptSchema),
    /s1_local_receipt_checks_fields_invalid/u,
  );
  const externalFetch = structuredClone(localSuccess);
  externalFetch.checks.actualExternalFetchCount = 1;
  assert.throws(
    () => validateS1Receipt(externalFetch, receiptSchema),
    /s1_local_receipt_count_invalid_actualExternalFetchCount/u,
  );
  const fallback = validFallback();
  assert.deepEqual(Object.keys(fallback).sort(), [...S1_FALLBACK_EVENT_FIELDS].sort());
  assert.equal(validateS1FallbackEvent(fallback), true);
  assert.equal(validateJsonSchema(fallback, receiptSchema.$defs.fallbackEvent, receiptSchema), true);
  assert.throws(
    () => validateS1FallbackEvent({ ...fallback, disposition: "SILENTLY_USED" }),
    /fallback_disposition_unknown/u,
  );
  assert.throws(
    () => validateS1FallbackEvent({ ...fallback, silent: true }),
    /fallback_event_fields_invalid/u,
  );
});

test("every mandatory preflight fact fails closed independently", () => {
  assert.deepEqual(evaluateS1PreflightFacts(passingFacts), passingFacts);
  for (const field of S1_PREFLIGHT_FACT_FIELDS) {
    assert.throws(
      () => evaluateS1PreflightFacts({ ...passingFacts, [field]: false }),
      new RegExp(`preflight_gate_failed_${field}`, "u"),
      field,
    );
  }
  assert.throws(
    () => evaluateS1PreflightFacts({ ...passingFacts, unknownGate: true }),
    /preflight_facts_fields_invalid/u,
  );
});

test("local transport counts derive from scoped parent sentinel and child shared-counter evidence", () => {
  const fixture = validTransportEvidence();
  assert.deepEqual(deriveS1AuditedTransportCounts(fixture), {
    databaseConnections: 0,
    actualExternalFetchCount: 0,
  });
  for (const [name, mutate, expected] of [
    ["child provider delta", (value) => {
      value.isolation.providerCounterAfter = 1;
      value.isolation.providerRequestDelta = 1;
    }, /s1_transport_evidence_child_isolation_invalid/u],
    ["external environment nonempty", (value) => {
      value.preflight.externalEnvironment[0].empty = false;
    }, /s1_transport_evidence_external_environment_not_empty/u],
    ["parent external transport", (value) => {
      value.parentTransportSnapshot.actualExternalFetchCount = 1;
    }, /s1_transport_evidence_parent_snapshot_invalid/u],
    ["parent database transport", (value) => {
      value.parentTransportSnapshot.actualDbConnectCount = 1;
    }, /s1_transport_evidence_parent_snapshot_invalid/u],
    ["unbound isolation command", (value) => {
      value.isolationCommand.argv = ["replacement.mjs"];
    }, /s1_transport_evidence_isolation_command_unbound/u],
    ["synthetic child proof", (value) => {
      value.isolation.proofScope = "synthetic_fixture";
    }, /s1_transport_evidence_child_isolation_invalid/u],
  ]) {
    const invalid = structuredClone(fixture);
    mutate(invalid);
    assert.throws(() => deriveS1AuditedTransportCounts(invalid), expected, name);
  }
  const runnerSource = read("scripts/m2-v2-evidence-pilot/run_m2_v2_pr7_s1_validation.mjs").toString("utf8");
  assert.match(runnerSource, /deriveS1AuditedTransportCounts/u);
  assert.doesNotMatch(runnerSource, /databaseConnections:\s*0|actualExternalFetchCount:\s*0/u);
});

test("task gates reject each registry drift and all prohibited authority expansions", () => {
  for (const id of Object.keys(taskManifest.registries)) {
    const driftedBindings = taskBindings();
    driftedBindings[`${id}Bytes`] = Buffer.concat([driftedBindings[`${id}Bytes`], Buffer.from(" ")]);
    assert.throws(() => validateS1TaskManifest(taskManifest, driftedBindings), new RegExp(`registry_digest_mismatch_${id}`, "u"));
  }
  for (const mutate of [
    (value) => { value.authorizedBatches.push("B8"); },
    (value) => { value.batchDag.independentReviewBatchAuthorized = false; },
    (value) => { value.providerPolicy.mode = "allowed"; },
    (value) => { value.databasePolicy.allowedConnections = 1; },
    (value) => { value.privateStatePolicy.overwriteHistoricalAllowed = true; },
    (value) => { value.gitPolicy.fastForwardOnly = false; },
    (value) => { value.gitPolicy.maxCompletedAtomicCommitsUnpushed = 2; },
    (value) => { value.governance.independentReviewPerformed = true; },
    (value) => { value.governance.providerDispatchAuthorized = true; },
    (value) => { value.governance.databaseConnectionsAuthorized = true; },
    (value) => { value.governance.canaryAuthorized = true; },
    (value) => { value.governance.b8Authorized = false; },
    (value) => { value.governance.markReadyAuthorized = true; },
    (value) => { value.governance.mergeAuthorized = true; },
    (value) => { value.governance.full160Authorized = true; },
    (value) => { value.governance.modelTrainingAuthorized = true; },
    (value) => { value.governance.holdoutAuthorized = true; },
    (value) => { value.governance.releaseAuthorized = true; },
  ]) {
    const invalid = structuredClone(taskManifest);
    mutate(invalid);
    assert.throws(() => validateS1TaskManifest(invalid, taskBindings()));
  }
});

test("source evidence is four-way exact; tracked-only mode is CI-only and private mismatches fail closed", () => {
  assert.throws(
    () => validateS1SourceAuthenticityBinding(taskManifest.requiredSourceEvidence),
    /private_source_evidence_required_outside_ci/u,
  );
  const tracked = validateS1SourceAuthenticityBinding(
    taskManifest.requiredSourceEvidence,
    null,
    { trackedOnlyAllowed: true },
  );
  assert.equal(tracked.status, "BOUND_TO_TRACKED_MANIFEST_CI");
  assert.equal(tracked.privateEvidencePresent, false);
  const privateEvidence = validPrivateSourceEvidence();
  const verified = validateS1SourceAuthenticityBinding(taskManifest.requiredSourceEvidence, privateEvidence);
  assert.equal(verified.status, "RECOMPUTED_PRIVATE_EVIDENCE_VERIFIED");
  const mismatch = structuredClone(privateEvidence);
  mismatch.sources[3].receiptRecomputedDigest = "0".repeat(64);
  assert.throws(
    () => validateS1SourceAuthenticityBinding(taskManifest.requiredSourceEvidence, mismatch),
    /source_evidence_digest_mismatch_s0Implementation/u,
  );
  const manifestMismatch = structuredClone(privateEvidence);
  manifestMismatch.manifestDigestBindingSha256 = "0".repeat(64);
  assert.throws(
    () => validateS1SourceAuthenticityBinding(taskManifest.requiredSourceEvidence, manifestMismatch),
    /private_source_evidence_not_pass/u,
  );
  const unknown = structuredClone(privateEvidence);
  unknown.remoteClaim = true;
  assert.throws(
    () => validateS1SourceAuthenticityBinding(taskManifest.requiredSourceEvidence, unknown),
    /private_source_evidence_fields_invalid/u,
  );
  const missing = structuredClone(privateEvidence);
  delete missing.sources[0].receiptPath;
  assert.throws(
    () => validateS1SourceAuthenticityBinding(taskManifest.requiredSourceEvidence, missing),
    /private_source_record_independentReview_fields_invalid/u,
  );
  const duplicate = structuredClone(privateEvidence);
  duplicate.sources[3] = structuredClone(duplicate.sources[0]);
  assert.throws(
    () => validateS1SourceAuthenticityBinding(taskManifest.requiredSourceEvidence, duplicate),
    /private_source_id_duplicate_independentReview/u,
  );
});

test("tracked-only source binding requires the complete GitHub-hosted exact-head policy, not local CI flags", () => {
  const trusted = {
    CI: "true",
    GITHUB_ACTIONS: "true",
    GITHUB_REPOSITORY: "KAtOReNA7/system",
    GITHUB_EVENT_NAME: "pull_request",
    GITHUB_HEAD_REF: "codex/m2-v2-evidence-pilot-v1",
    RUNNER_ENVIRONMENT: "github-hosted",
    RUNNER_OS: process.platform === "win32" ? "Windows" : "Linux",
    EXPECTED_HEAD_SHA: taskManifest.startingHead,
    GITHUB_WORKSPACE: root,
  };
  const scope = {
    expectedHead: taskManifest.startingHead,
    actualHead: taskManifest.startingHead,
    repositoryRoot: root,
    workspaceRoot: root,
  };
  assert.equal(evaluateTrackedOnlySourcePolicy(trusted, scope), true);
  assert.equal(evaluateTrackedOnlySourcePolicy({ CI: "true", GITHUB_ACTIONS: "true" }, scope), false);
  for (const field of Object.keys(trusted)) {
    const incomplete = { ...trusted };
    delete incomplete[field];
    assert.equal(evaluateTrackedOnlySourcePolicy(incomplete, scope), false, field);
  }
  assert.equal(evaluateTrackedOnlySourcePolicy(trusted, { ...scope, actualHead: "0".repeat(40) }), false);
});

test("B6 promoted overlay remains OPEN and preserves independent B8 review", () => {
  assert.equal(validateS1Overlay(overlay), true);
  assert.equal(overlay.currentBatch, "B6");
  assert.deepEqual(overlay.batchStatuses, {
    B0: "COMPLETE",
    B1: "COMPLETE_PENDING_B8",
    B2: "COMPLETE_PENDING_B8",
    B3: "COMPLETE_PENDING_B8",
    B4: "COMPLETE_PENDING_B8",
    B5: "COMPLETE_PENDING_B8",
    B6: "PROMOTED_PENDING_EXACT_HEAD_CI",
  });
  assert.equal(overlay.nextBatch, "B7");
  assert.equal(overlay.nextAllowedPhase, "B7_AUTHORIZED_AFTER_B6_EXACT_HEAD_CI");
  for (const findingId of S1_FINDING_IDS) {
    assert.deepEqual(overlay.candidateFindingStatuses[findingId], {
      findingStatus: "OPEN",
      candidateStatus: "CANDIDATE_CLOSED_PENDING_INDEPENDENT_REVIEW",
    });
  }
  assert.equal(overlay.findingsRemainOpen, true);
  assert.equal(overlay.independentReviewPerformed, false);
  for (const [field, value] of [
    ["nextBatch", "B6"],
    ["findingsRemainOpen", false],
    ["findingClosureStatus", "CLOSED"],
    ["independentReviewPerformed", true],
    ["independentReviewStatus", "PASSED"],
    ["b8Authorized", false],
    ["mergeAuthorized", true],
    ["full160Authorized", true],
    ["modelTrainingAuthorized", true],
    ["releaseAuthorized", true],
    ["remediationComplete", true],
    ["currentDecision", "CANARY_CONDITIONAL"],
  ]) {
    const invalid = { ...overlay, [field]: value };
    assert.throws(() => validateS1Overlay(invalid), /overlay_governance_mismatch/u, field);
  }
  const invalidBatchStatuses = {
    ...overlay,
    batchStatuses: { ...overlay.batchStatuses, B4: "COMPLETE" },
  };
  assert.throws(() => validateS1Overlay(invalidBatchStatuses), /overlay_governance_mismatch/u);
  const unknown = { ...overlay, remotePass: true };
  assert.throws(() => validateS1Overlay(unknown), /overlay_fields_invalid/u);
});

test("authority and readonly semantic closure reject missing, unknown, and tampered graph scope", () => {
  for (const [name, contractId, mutate, expected] of [
    ["missing authority node", "authority_binding_v0_3", (value) => value.canonicalAuthorityGraph.nodes.pop(), /semantic_authority_node_count_mismatch/u],
    ["unknown authority edge field", "authority_binding_v0_3", (value) => { value.canonicalAuthorityGraph.edges[0].remotePass = true; }, /semantic_authority_edge_.*_fields_invalid/u],
    ["undeclared authority endpoint", "authority_binding_v0_3", (value) => { value.canonicalAuthorityGraph.edges[0].toNodeId = "compound_pseudo_node"; }, /semantic_authority_edge_invalid/u],
    ["selection history loss", "authority_binding_v0_3", (value) => { value.canonicalAuthorityGraph.selectionDecisionSchema.allNonEffectiveCompletedReceiptsPreservedInReceiptIndex = false; }, /semantic_authority_selection_preservation_invalid/u],
    ["missing public report role", "authority_binding_v0_3", (value) => value.canonicalAuthorityGraph.publicReportRegistry.pop(), /semantic_authority_public_report_count_mismatch/u],
    ["current index definition drift", "authority_binding_v0_3", (value) => value.currentStateIndexV0_3.currentAuthorityExactFields.pop(), /semantic_current_index_authority_fields_invalid/u],
    ["missing readonly role", "verifier_readonly_v0_2", (value) => value.scopeDerivation.roleToScopeMemberMapping.pop(), /semantic_readonly_role_mapping_count_mismatch/u],
    ["unknown readonly mapping field", "verifier_readonly_v0_2", (value) => { value.scopeDerivation.roleToScopeMemberMapping[0].remotePass = true; }, /semantic_readonly_mapping_.*_fields_invalid/u],
    ["unknown readonly role class", "verifier_readonly_v0_2", (value) => { value.scopeDerivation.roleToScopeMemberMapping[0].scopeMemberClasses.push("unknown_role_class"); }, /semantic_readonly_mapping_class_unknown/u],
    ["current pointer mapping removed", "verifier_readonly_v0_2", (value) => { value.scopeDerivation.roleToScopeMemberMapping.find((record) => record.authorityRole === "current_state_index").scopeMemberClasses = ["public_reports", "current_state_index"]; }, /semantic_readonly_role_mapping_semantics_mismatch|semantic_readonly_mapping_class_coverage_mismatch|semantic_readonly_current_pointer_not_bound/u],
    ["readonly invocation count drift", "verifier_readonly_v0_2", (value) => { value.proof.totalVerifierInvocations = 1; }, /semantic_readonly_proof_policy_invalid/u],
    ["readonly snapshot drift", "verifier_readonly_v0_2", (value) => value.proof.snapshotIds.pop(), /semantic_readonly_snapshot_ids_mismatch/u],
  ]) {
    const mutated = semanticBytesWithMutation(contractId, mutate);
    assert.throws(
      () => validateContractSemanticClosure(contractRegistry, mutated),
      expected,
      name,
    );
  }
});

test("migration, safe-cache, and provider semantic closure reject nested schema and registry drift", () => {
  for (const [name, contractId, mutate, expected] of [
    ["migration archive member schema missing", "migration_set_integrity_v0_3", (value) => value.v0_3Package.archiveMemberRecord.exactFields.pop(), /semantic_migration_archive_member_schema_exact_fields_invalid/u],
    ["migration ZIP structural gate disabled", "migration_set_integrity_v0_3", (value) => { value.v0_3Package.zipStructurePolicy.singleEndOfCentralDirectoryRequired = false; }, /semantic_migration_zip_required/u],
    ["migration evidence digest field missing", "migration_set_integrity_v0_3", (value) => { value.identityReceipt.exactFields = value.identityReceipt.exactFields.filter((field) => field !== "evidenceSetDigestSha256"); }, /semantic_migration_identity_receipt_fields_invalid/u],
    ["migration platform evidence unbound", "migration_set_integrity_v0_3", (value) => { value.identityReceipt.platformEvidenceSchema.recordTypeMustMatchReceiptPlatform = false; }, /semantic_migration_platform_evidence_binding_invalid/u],
    ["migration native row unknown field", "migration_set_integrity_v0_3", (value) => { value.nativeExecutionMatrix[0].remotePass = true; }, /semantic_migration_native_.*_fields_invalid/u],
    ["migration native case omitted", "migration_set_integrity_v0_3", (value) => value.nativeExecutionMatrix[1].requiredCases.pop(), /semantic_migration_linux_cases_mismatch/u],
    ["safe-cache E2 nested schema missing", "safe_cache_projection_v0_3", (value) => { delete value.profiles.find((profile) => profile.profile === "capability_e2_entity/v1").entityResolutionExactKeys; }, /semantic_safe_cache_e2_profile_fields_invalid/u],
    ["safe-cache E3 variant unknown field", "safe_cache_projection_v0_3", (value) => { value.profiles.find((profile) => profile.profile === "capability_e3_claims/v1").structuredValueVariants[0].remotePass = true; }, /semantic_safe_cache_e3_variant_.*_fields_invalid/u],
    ["safe-cache E4 digest tamper", "safe_cache_projection_v0_3", (value) => { value.profiles.find((profile) => profile.profile === "extraction_full_v0.2").exactContractPortableSha256 = "0".repeat(64); }, /semantic_safe_cache_e4_binding_invalid/u],
    ["safe-cache partition schema drift", "safe_cache_projection_v0_3", (value) => value.offlineMigration.partitionManifest.exactFields.pop(), /semantic_safe_cache_partition_schema_exact_fields_invalid/u],
    ["safe-cache quarantine raw persistence", "safe_cache_projection_v0_3", (value) => { value.offlineMigration.quarantineRecord.rawContentPersistedRequired = true; }, /semantic_safe_cache_quarantine_policy_invalid/u],
    ["provider sink omitted", "provider_transport_v0_2", (value) => value.sinkRegistry.pop(), /semantic_provider_sink_count_mismatch/u],
    ["provider sink unknown field", "provider_transport_v0_2", (value) => { value.sinkRegistry[0].remotePass = true; }, /semantic_provider_sink_.*_fields_invalid/u],
    ["provider route unknown sink", "provider_transport_v0_2", (value) => { value.routeRegistry[0].sinkIds = ["sink_unknown"]; }, /semantic_provider_route_sink_unknown/u],
    ["provider unregistered sink fail-open", "provider_transport_v0_2", (value) => { value.registryClosureRules.anyUnregisteredFetchOrConnectSink = "ALLOW"; }, /semantic_provider_registry_closure_invalid/u],
  ]) {
    const mutated = semanticBytesWithMutation(contractId, mutate);
    assert.throws(
      () => validateContractSemanticClosure(contractRegistry, mutated),
      expected,
      name,
    );
  }
});

test("event and workbook semantic closure reject typed-time, precedence, OPC, XML, ZIP, and receipt drift", () => {
  for (const [name, contractId, mutate, expected] of [
    ["event interval field missing", "event_time_clause_binding_v0_4", (value) => value.canonicalEventTuple.eventDateSchema.exactFields.pop(), /semantic_event_date_schema_exact_fields_invalid/u],
    ["event timezone inference enabled", "event_time_clause_binding_v0_4", (value) => { value.canonicalEventTuple.eventDateSchema.timezoneInferenceAllowed = true; }, /semantic_event_date_binding_policy_invalid/u],
    ["event cross-sentence fail-close removed", "event_time_clause_binding_v0_4", (value) => { value.dateBindingRules.crossSentenceInputAction = "BORROW_NEAREST"; }, /semantic_event_date_binding_rules_invalid/u],
    ["event progression omitted", "event_time_clause_binding_v0_4", (value) => value.stageProgressionTable.pop(), /semantic_event_progression_count_mismatch/u],
    ["event precedence tampered", "event_time_clause_binding_v0_4", (value) => { value.conflictApplicability.relationDecisionTable[0].priority = 2; }, /semantic_event_conflict_priorities_mismatch/u],
    ["event evaluation unknown field", "event_time_clause_binding_v0_4", (value) => value.eventEvaluationV0_4.exactFields.push("remotePass"), /semantic_event_evaluation_fields_invalid/u],
    ["workbook OPC root omitted", "workbook_independent_verification_v0_2", (value) => value.opcRegistry.requiredRoots.pop(), /semantic_workbook_required_roots_mismatch/u],
    ["workbook relationship URI tampered", "workbook_independent_verification_v0_2", (value) => { value.opcRegistry.relationshipTypes[0].uri = "https://example.invalid/relation"; }, /semantic_workbook_relationship_binding_invalid/u],
    ["workbook ZIP Unicode gate disabled", "workbook_independent_verification_v0_2", (value) => { value.zipStructurePolicy.unicodePathExtraFieldMustMatchUtf8Name = false; }, /semantic_workbook_zip_required/u],
    ["workbook XML namespace alias omitted", "workbook_independent_verification_v0_2", (value) => { delete value.xmlPolicy.namespaceAliases.spreadsheetml; }, /semantic_workbook_root_namespace_alias_unknown|semantic_workbook_namespace_rule_alias_unknown/u],
    ["workbook XML registry unknown field", "workbook_independent_verification_v0_2", (value) => { value.xmlPolicy.elementAttributeRegistries[0].remotePass = true; }, /semantic_workbook_element_registry_.*_fields_invalid/u],
    ["workbook derived-fact constraint missing", "workbook_independent_verification_v0_2", (value) => { delete value.verificationReceipt.derivedFactsRecord.valueConstraints.DIGEST; }, /semantic_workbook_derived_fact_constraints_fields_invalid/u],
  ]) {
    const mutated = semanticBytesWithMutation(contractId, mutate);
    assert.throws(
      () => validateContractSemanticClosure(contractRegistry, mutated),
      expected,
      name,
    );
  }
});

test("all seven machine contracts carry the exact common authorization boundary", () => {
  for (const contract of contractRegistry.contracts) {
    const mutated = semanticBytesWithMutation(contract.contractId, (value) => {
      value.authorization.mergeAuthorized = true;
    });
    assert.throws(
      () => validateContractSemanticClosure(contractRegistry, mutated),
      /contract_authorization_invalid/u,
      contract.contractId,
    );
  }
});

test("full contract validation rejects synchronized machine-digest semantic rebinding", () => {
  for (const [name, contractId, mutate, expected] of [
    ["authority edge rewire", "authority_binding_v0_3", (value) => {
      value.canonicalAuthorityGraph.edges[0].toNodeId = "current_state_index";
    }, /semantic_authority_edge_semantics_mismatch|contract_registry_contract_entries_semantics_mismatch/u],
    ["readonly role-class swap", "verifier_readonly_v0_2", (value) => {
      const mappings = value.scopeDerivation.roleToScopeMemberMapping;
      [mappings[0].scopeMemberClasses, mappings[1].scopeMemberClasses]
        = [mappings[1].scopeMemberClasses, mappings[0].scopeMemberClasses];
    }, /semantic_readonly_role_mapping_semantics_mismatch|contract_registry_contract_entries_semantics_mismatch/u],
    ["provider sink identity replacement", "provider_transport_v0_2", (value) => {
      value.sinkRegistry[0].sourcePath = "package.json";
      value.sinkRegistry[0].symbol = "replacementSymbol";
      value.sinkRegistry[0].fetchExpression = "replacementFetch(endpoint)";
    }, /semantic_provider_sink_semantics_mismatch|contract_registry_contract_entries_semantics_mismatch/u],
    ["event priority-condition swap", "event_time_clause_binding_v0_4", (value) => {
      const table = value.conflictApplicability.relationDecisionTable;
      [table[0].conditionKey, table[1].conditionKey] = [table[1].conditionKey, table[0].conditionKey];
    }, /semantic_event_conflict_table_semantics_mismatch|contract_registry_contract_entries_semantics_mismatch/u],
    ["workbook office relation externalized", "workbook_independent_verification_v0_2", (value) => {
      value.opcRegistry.relationshipTypes.find((record) => record.relationId === "office_document").targetMode = "External";
    }, /semantic_workbook_relationship_semantics_mismatch|contract_registry_contract_entries_semantics_mismatch/u],
  ]) {
    const fixture = fullContractMutation(contractId, mutate);
    assert.throws(
      () => validateContractRegistry(fixture.registry, {
        contractArtifactBytesByPath: fixture.bytes,
        historicalArtifactBytesByPath: historicalBytes,
        trackedPaths,
      }),
      expected,
      name,
    );
  }
});

test("task and registry semantics cannot be widened while synchronizing their digests", () => {
  const commandMutation = structuredClone(commandRegistry);
  const doctor = commandMutation.commands.find((command) => command.commandId === "s1.doctor");
  doctor.executable = "curl";
  doctor.argv = ["https://example.invalid"];
  assert.throws(() => validateS1CommandRegistry(commandMutation), /command_registry_semantics_mismatch/u);
  const commandBytes = Buffer.from(`${JSON.stringify(commandMutation)}\n`, "utf8");
  const synchronizedTask = structuredClone(taskManifest);
  synchronizedTask.registries.commandRegistry.sha256 = sha256PortableText(commandBytes);
  assert.throws(
    () => validateS1TaskManifest(synchronizedTask, { ...taskBindings(), commandRegistryBytes: commandBytes }),
    /command_registry_semantics_mismatch/u,
  );

  for (const [name, mutate, expected] of [
    ["wildcard allowed paths", (value) => { value.allowedPathClasses = ["**"]; }, /allowed_path_classes_invalid/u],
    ["empty prohibition semantics", (value) => { value.prohibitedActions = ["none"]; }, /prohibited_actions_invalid/u],
    ["version edge targets swapped", (value) => {
      [value.versionGraph.edges[0].to, value.versionGraph.edges[1].to]
        = [value.versionGraph.edges[1].to, value.versionGraph.edges[0].to];
    }, /version_graph_edge_semantics_mismatch/u],
    ["contract finding and batch mappings swapped", (value) => {
      [value.contracts[0].findingIds, value.contracts[1].findingIds]
        = [value.contracts[1].findingIds, value.contracts[0].findingIds];
      [value.contracts[0].batch, value.contracts[1].batch]
        = [value.contracts[1].batch, value.contracts[0].batch];
    }, /contract_registry_contract_entries_semantics_mismatch/u],
  ]) {
    if (name.includes("paths") || name.includes("prohibition")) {
      const invalidTask = structuredClone(taskManifest);
      mutate(invalidTask);
      assert.throws(() => validateS1TaskManifest(invalidTask, taskBindings()), expected, name);
    } else {
      const invalidRegistry = structuredClone(contractRegistry);
      mutate(invalidRegistry);
      assert.throws(() => validateContractRegistry(invalidRegistry), expected, name);
    }
  }
});

test("contract and case registries reject unknown keys, in-place-history drift, cycles, and aggregate tampering", () => {
  const unknownContract = { ...contractRegistry, remoteState: "UNKNOWN" };
  assert.throws(() => validateContractRegistry(unknownContract), /contract_registry_fields_invalid/u);

  const contractDigestDrift = new Map(contractArtifactBytes);
  contractDigestDrift.set(
    contractRegistry.contracts[0].machinePath,
    Buffer.concat([contractDigestDrift.get(contractRegistry.contracts[0].machinePath), Buffer.from(" ")]),
  );
  assert.throws(
    () => validateContractRegistry(contractRegistry, {
      contractArtifactBytesByPath: contractDigestDrift,
      historicalArtifactBytesByPath: historicalBytes,
      trackedPaths,
    }),
    /contract_machine_digest_mismatch/u,
  );

  const duplicateTarget = structuredClone(contractRegistry);
  duplicateTarget.contracts[1].declaredSchemas[1] = duplicateTarget.contracts[0].declaredSchemas[0];
  duplicateTarget.contracts[1].schemaDefinitions[1].schema = duplicateTarget.contracts[0].declaredSchemas[0];
  assert.throws(
    () => validateContractRegistry(duplicateTarget),
    /contract_registry_contract_entries_semantics_mismatch|version_graph_target_resolution_invalid/u,
  );

  const caseUnknown = { ...caseRegistry, executed: true };
  assert.throws(() => validateCaseRegistry(caseUnknown), /case_registry_fields_invalid/u);
  for (const mutate of [
    (value) => { value.counts.linux = 88; },
    (value) => { value.counts.categories.EXISTING_BYPASS = 15; },
    (value) => { value.cases[0].platforms = []; },
    (value) => { value.cases[0].providerAllowed = true; },
    (value) => { value.cases[0].mustEnterDefaultNpmTest = false; },
    (value) => { value.cases[0].caseId = value.cases[1].caseId; },
    (value) => { value.corrections[0].platforms = ["linux"]; },
  ]) {
    const invalid = structuredClone(caseRegistry);
    mutate(invalid);
    assert.throws(() => validateCaseRegistry(invalid));
  }
});

test("preflight and local runner contain no hardcoded remote PASS claim", () => {
  const preflightSource = read("scripts/m2-v2-evidence-pilot/check_m2_v2_pr7_s1_preflight.mjs").toString("utf8");
  const runnerSource = read("scripts/m2-v2-evidence-pilot/run_m2_v2_pr7_s1_validation.mjs").toString("utf8");
  const sources = [preflightSource, runnerSource];
  assert.equal(assertNoHardcodedRemotePass(sources), true);
  assert.equal(runnerSource.indexOf('resolveRegisteredCommand(registry, "s1.doctor")')
    < runnerSource.indexOf('resolveRegisteredCommand(registry, "s1.default.isolated")'), true);
  assert.equal((runnerSource.match(/executeRegistered\(isolationCommand/gu) ?? []).length, 1);
  assert.equal(preflightSource.includes('batchId: "B2"'), false);
  assert.equal(preflightSource.includes('let batchId = "B2"'), false);
  assert.equal(runnerSource.includes('batchId: "B2"'), false);
  assert.equal(runnerSource.includes('?? "B2"'), false);
  assert.equal(runnerSource.includes('`--batch-id=${options.batchId}`'), true);
  assert.throws(
    () => assertNoHardcodedRemotePass(["verify" + "Windows=success"]),
    /hardcoded_remote_pass_forbidden/u,
  );
});

test("B6 batch identity is explicit and missing or stale batch IDs fail at runtime", () => {
  const head = gitText(["rev-parse", "HEAD"]);
  const b6 = runJson("scripts/m2-v2-evidence-pilot/check_m2_v2_pr7_s1_preflight.mjs", [
    `--expected-head=${head}`, "--batch-id=B6",
  ]);
  assert.equal(b6.receipt.batchId, "B6");
  assert.notEqual(b6.receipt.error?.reasonCode, "batch_id_does_not_match_frozen_task_batch");

  const b5 = runJson("scripts/m2-v2-evidence-pilot/check_m2_v2_pr7_s1_preflight.mjs", [
    `--expected-head=${head}`, "--batch-id=B5",
  ]);
  assert.equal(b5.status, 1);
  assert.equal(b5.receipt.passed, false);
  assert.equal(b5.receipt.error.reasonCode, "batch_id_does_not_match_frozen_task_batch");

  const missingPreflight = runJson("scripts/m2-v2-evidence-pilot/check_m2_v2_pr7_s1_preflight.mjs", [
    `--expected-head=${head}`,
  ]);
  assert.equal(missingPreflight.status, 1);
  assert.equal(missingPreflight.receipt.batchId, "B6");
  assert.equal(missingPreflight.receipt.error.reasonCode, "batch_id_is_required");

  const missingValidation = runJson("scripts/m2-v2-evidence-pilot/run_m2_v2_pr7_s1_validation.mjs", [
    `--expected-head=${head}`,
  ]);
  assert.equal(missingValidation.status, 1);
  assert.equal(missingValidation.receipt.batchId, "B6");
  assert.equal(missingValidation.receipt.error.reasonCode, "batch_id_is_required");
});

test("canonical B3-B6 commands remain wired while both CI jobs bind B6", () => {
  const canonical = [
    "node --test --test-concurrency=1",
    "test/m2-v2-pr7-b3-provider-route-registry.test.js",
    "test/m2-v2-provider-transport-security.test.js",
    "test/m2-v2-v2b6-safe-cache.test.js",
    "test/m2-v2-v2b6-raw-cache-migration.test.js",
  ].join(" ");
  assert.equal(packageJson.scripts["test:m2-v2:b3-safe-cache-provider"], canonical);
  assert.equal(packageJson.scripts["test:m2-v2:provider-security"], "npm run test:m2-v2:b3-safe-cache-provider");
  assert.equal(
    packageJson.scripts["test:m2-v2:b4-event-tuple"],
    "node --test --test-concurrency=1 test/m2-v2-event-tuple.test.js test/m2-v2-v2b8.test.js",
  );
  assert.equal(
    packageJson.scripts.pretest,
    "npm run test:m2-v2:s0-default-extension && npm run test:m2-v2:b4-event-tuple && npm run test:m2-v2:b5-workbook-artifact",
  );
  assert.equal(
    packageJson.scripts["test:m2-v2:b5-workbook-artifact"],
    "node --test --test-concurrency=1 test/m2-v2-workbook-independent-verifier.test.js test/test-artifact-policy.test.js",
  );
  assert.equal(
    packageJson.scripts["test:m2-v2:b6-offline-authority"],
    "node --test --test-concurrency=1 test/m2-v2-pr7-p1-offline-remediation.test.js test/m2-v2-v2b8-current-verifier.test.js test/m2-v2-current-authority.test.js test/m2-v2-integrity-state.test.js test/m2-v2-closed-atomic-binding.test.js",
  );
  assert.equal((packageJson.scripts["test:m2-v2:s0-default-extension"].match(/test\/m2-v2-pr7-b3-provider-route-registry\.test\.js/gu) ?? []).length, 1);
  assert.equal((workflowSource.match(/--batch-id=B6/gu) ?? []).length, 2);
  assert.equal((workflowSource.match(/--batch-id=B5/gu) ?? []).length, 0);
  assert.equal((workflowSource.match(/--batch-id=B4/gu) ?? []).length, 0);
  assert.equal((workflowSource.match(/--batch-id=B3/gu) ?? []).length, 0);
  assert.equal((workflowSource.match(/name: B3 safe-cache and provider-boundary validation/gu) ?? []).length, 2);
  assert.equal((workflowSource.match(/run: npm run test:m2-v2:b3-safe-cache-provider/gu) ?? []).length, 2);
  assert.equal((workflowSource.match(/name: B4 event tuple and conflict applicability validation/gu) ?? []).length, 2);
  assert.equal((workflowSource.match(/run: npm run test:m2-v2:b4-event-tuple/gu) ?? []).length, 2);
  assert.equal((workflowSource.match(/name: B5 workbook and required-artifact policy validation/gu) ?? []).length, 2);
  assert.equal((workflowSource.match(/run: npm run test:m2-v2:b5-workbook-artifact/gu) ?? []).length, 2);
  assert.equal((workflowSource.match(/name: B6 provider-free authority and atomic promotion validation/gu) ?? []).length, 2);
  assert.equal((workflowSource.match(/run: npm run test:m2-v2:b6-offline-authority/gu) ?? []).length, 2);
});

function taskBindings() {
  return {
    commandRegistryBytes: bytes.command,
    receiptSchemaBytes: bytes.receipt,
    contractRegistryBytes: bytes.contract,
    caseRegistryBytes: bytes.cases,
    historicalArtifactBytesByPath: historicalBytes,
  };
}

function semanticBytesWithMutation(contractId, mutate) {
  const contract = contractRegistry.contracts.find((entry) => entry.contractId === contractId);
  if (!contract) throw new Error(`unknown_test_contract_${contractId}`);
  const mutated = new Map(contractArtifactBytes);
  const document = parseJsonUtf8Strict(mutated.get(contract.machinePath));
  mutate(document);
  mutated.set(contract.machinePath, Buffer.from(`${JSON.stringify(document)}\n`, "utf8"));
  return mutated;
}

function fullContractMutation(contractId, mutate) {
  const registry = structuredClone(contractRegistry);
  const contract = registry.contracts.find((entry) => entry.contractId === contractId);
  if (!contract) throw new Error(`unknown_test_contract_${contractId}`);
  const bytesByPath = new Map(contractArtifactBytes);
  const document = parseJsonUtf8Strict(bytesByPath.get(contract.machinePath));
  mutate(document);
  const machineBytes = Buffer.from(`${JSON.stringify(document)}\n`, "utf8");
  bytesByPath.set(contract.machinePath, machineBytes);
  contract.machineSha256 = sha256PortableText(machineBytes);
  return { registry, bytes: bytesByPath };
}

function validSuccessReceipt() {
  return {
    schema: "m2.v2.pr7.s1-preflight-receipt.v0.1",
    passed: true,
    generatedAt: "2026-07-19T00:00:00.000Z",
    batchId: taskManifest.currentBatch,
    actualHead: taskManifest.startingHead,
    actualBranch: taskManifest.branchPolicy.directImplementationBranch,
    startingHead: taskManifest.startingHead,
    findingHead: taskManifest.findingHead,
    baseSha: taskManifest.baseSha,
    selectedCommandId: "s1.doctor",
    taskManifestSha256: sha256PortableText(bytes.task),
    commandRegistrySha256: sha256PortableText(bytes.command),
    contractRegistrySha256: sha256PortableText(bytes.contract),
    caseRegistrySha256: sha256PortableText(bytes.cases),
    receiptSchemaSha256: sha256PortableText(bytes.receipt),
    sourceEvidence: validateS1SourceAuthenticityBinding(
      taskManifest.requiredSourceEvidence,
      null,
      { trackedOnlyAllowed: true },
    ),
    externalEnvironment: S1_EXTERNAL_ENV_NAMES.map((name) => ({
      name,
      present: false,
      empty: true,
    })),
    capabilities: Object.fromEntries(["node", "git", "python", "powershell"].map((name) => [
      name,
      { available: true, version: "synthetic" },
    ])),
    checks: Object.fromEntries(S1_PREFLIGHT_FACT_FIELDS.map((field) => [field, true])),
    executions: [],
    fallbackEvents: [],
  };
}

function validLocalSuccessReceipt() {
  const receipt = validSuccessReceipt();
  receipt.schema = "m2.v2.pr7.s1-local-validation-receipt.v0.1";
  receipt.selectedCommandId = "s1.validate.local";
  receipt.checks = Object.fromEntries(S1_LOCAL_VALIDATION_CHECK_FIELDS.map((field) => [field, true]));
  Object.assign(receipt.checks, {
    defaultTestChainInvocationCount: 1,
    defaultTestTotalSkips: 0,
    providerRequestDelta: 0,
    databaseConnections: 0,
    actualExternalFetchCount: 0,
  });
  receipt.executions = [
    validExecution("s1.doctor"),
    validExecution("s1.default.isolated"),
  ];
  return receipt;
}

function validExecution(commandId) {
  return {
    commandId,
    passed: true,
    exitCode: 0,
    durationMs: 1,
    stdoutBytes: 0,
    stdoutSha256: "0".repeat(64),
    stderrBytes: 0,
    stderrSha256: "0".repeat(64),
    failureSummary: {},
  };
}

function validTransportEvidence() {
  return {
    preflight: validSuccessReceipt(),
    isolation: {
      schema: "m2.v2.default-test-isolation-proof.v0.3",
      passed: true,
      proofScope: "full_npm_test",
      childPassed: true,
      defaultTestChainInvocationCount: 1,
      providerCounterBefore: 0,
      providerCounterAfter: 0,
      providerRequestDelta: 0,
    },
    parentTransportSnapshot: {
      actualExternalFetchCount: 0,
      actualDbConnectCount: 0,
    },
    isolationCommand: structuredClone(commandRegistry.commands.find(
      (command) => command.commandId === "s1.default.isolated",
    )),
  };
}

function validPrivateSourceEvidence() {
  return {
    schema: "m2.v2.pr7.s1-source-evidence-authenticity.private.v0.1",
    privateOnly: true,
    generatedAt: "2026-07-19T00:00:00.000Z",
    canonicalization: "recursive-key-sorted compact JSON; array order preserved; UTF-8 SHA-256",
    manifestDigestBindingSha256: validateS1SourceAuthenticityBinding(
      taskManifest.requiredSourceEvidence,
      null,
      { trackedOnlyAllowed: true },
    ).manifestDigestBindingSha256,
    status: "PASS",
    sources: taskManifest.requiredSourceEvidence.map((source) => ({
      sourceId: source.sourceId,
      reportExpectedSha256: source.reportSha256,
      reportActualSha256: source.reportSha256,
      reportPath: `data/private-output/synthetic/${source.sourceId}-report.md`,
      receiptExpectedDigest: source.receiptDigest,
      receiptClaimedDigest: source.receiptDigest,
      receiptRecomputedDigest: source.receiptDigest,
      receiptPath: `data/private-output/synthetic/${source.sourceId}-receipt.json`,
      matches: true,
    })),
  };
}

function validFallback() {
  return {
    eventId: "S1-FB-TEST-001",
    batchId: taskManifest.currentBatch,
    timestamp: "2026-07-19T00:00:00.000Z",
    task: "synthetic fallback contract validation",
    preferredExecutable: "rg",
    preferredArgv: ["--files"],
    failureClass: "OUTPUT_TRUNCATED",
    failureMessageSanitized: "Output exceeded the bounded display budget.",
    replacementExecutable: "rg",
    replacementArgv: ["--files", "bounded-root"],
    semanticEquivalence: "Same candidate set in bounded chunks.",
    coverageDifference: "None.",
    sideEffectDifference: "None.",
    securityDifference: "None.",
    confidenceImpact: "NONE",
    disposition: "USED_SEMANTICALLY_EQUIVALENT",
  };
}

function read(path) {
  return readFileSync(resolve(root, path));
}

function gitNull(argv) {
  const child = spawnSync("git", argv, { cwd: root, encoding: "utf8", windowsHide: true });
  if (child.status !== 0) throw new Error("git_ls_files_failed");
  return child.stdout.split("\0").filter(Boolean).map((path) => path.replaceAll("\\", "/"));
}

function gitText(argv) {
  const child = spawnSync("git", argv, { cwd: root, encoding: "utf8", windowsHide: true });
  if (child.status !== 0) throw new Error("git_command_failed");
  return child.stdout.trim();
}

function runJson(path, argv) {
  const child = spawnSync(process.execPath, [path, ...argv], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  return { status: child.status, receipt: JSON.parse(child.stdout) };
}

function gitShow(head, path) {
  const child = spawnSync("git", ["show", `${head}:${path}`], { cwd: root, encoding: null, windowsHide: true });
  if (child.status !== 0 || !Buffer.isBuffer(child.stdout)) throw new Error("git_show_failed");
  return child.stdout;
}

function withCrlf(value) {
  return Buffer.from(value.toString("utf8").replace(/(?<!\r)\n/gu, "\r\n"), "utf8");
}
