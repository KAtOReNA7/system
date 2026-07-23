import { canonicalJson, sha256 } from "./pilotCore.js";
import {
  REQUEST_COUNTER_FIELDS,
  projectCanonicalRequestAuthority,
  validateRequestEventLedger,
} from "./requestEventLedger.js";

export const CANONICAL_AUTHORITY_GRAPH_SCHEMA = "m2.v2.canonical-authority-graph.v0.3";
export const TRACKED_CORE_COMMITMENT_SCHEMA = "m2.v2.tracked-core-commitment-public.v0.1";

const V2B8_REQUEST_LEDGER_STAGE = "v2b8";
const V2B8_TAVILY_QUERY_SCHEMA = "m2.v2.v2b8-tavily-query-execution.v0.1";
const V2B5_TAVILY_RECEIPT_SCHEMA = "m2.v2.tavily-provider-receipt.v0.1";
const V2B5_TAVILY_PROVIDER_ID = "tavily_structured_search";
const V2B6_RELAY_RECEIPT_SCHEMA = "m2.v2.relay-extraction-receipt.v0.2";
const V2B6_RELAY_PROVIDER_ID = "openai_compatible_relay_extraction";

export const CANONICAL_AUTHORITY_NODE_IDS = Object.freeze([
  "immutable_inputs",
  "execution_contract",
  "request_event_ledger",
  "physical_receipt_envelopes",
  "receipt_index",
  "safe_cache",
  "effective_receipt_index",
  "counter_state_projection",
  "event_semantics_profile",
  "derived_evaluation",
  "public_remediation_summary",
  "public_merge_readiness",
  "tracked_core_commitment",
  "current_integrity_restatement",
  "current_state_index",
]);

export const CANONICAL_DERIVED_INPUT_ROLE_IDS = Object.freeze([
  "immutable_inputs",
  "request_event_ledger",
  "effective_receipt_index",
  "event_semantics_profile",
]);

const GRAPH_KEYS = Object.freeze([
  "schema",
  "nodes",
  "edges",
  "physicalMappings",
  "selectionDecisions",
  "runtimeConsumers",
  "publicReportRegistry",
  "runtimePopulationRules",
  "graphDigestSha256",
]);

// The tracked commitment must not hash the runtime mapping of its own file.
// This projection binds the complete normative graph while the per-instance
// graph digest separately binds physical mappings and selection decisions.
export const CANONICAL_AUTHORITY_GRAPH_CORE_FIELDS = Object.freeze([
  "schema",
  "nodes",
  "edges",
  "runtimeConsumers",
  "publicReportRegistry",
  "runtimePopulationRules",
]);

const PHYSICAL_MAPPING_KEYS = Object.freeze([
  "physicalObjectIdSha256",
  "nodeId",
  "repositoryRelativePath",
  "pathIdentityDigestSha256",
  "contentDigestSha256",
  "objectType",
]);

const SELECTION_DECISION_KEYS = Object.freeze([
  "logicalRequestIdentitySha256",
  "orderedCandidatePhysicalRequestIds",
  "selectedPhysicalRequestId",
  "decision",
  "reason",
  "selectedRank",
  "membershipDigestSha256",
  "decisionDigestSha256",
]);

const AUTHORITY_NODES = Object.freeze([
  node("immutable_inputs", "IMMUTABLE_INPUT", "EXACT_DECLARED_SET", "role_path_and_byte_digest", ["B5", "B6", "B7", "B8"], "ONE_ROLE_PER_PHYSICAL_OBJECT"),
  node("execution_contract", "TRACKED_CONTRACT", "EXACTLY_ONE", "schema_and_byte_digest", ["B5", "B6", "B7", "B8"], "TRACKED_SINGLETON"),
  node("request_event_ledger", "APPEND_ONLY_FACT", "EXACTLY_ONE", "ordered_event_identity", ["B5", "B6", "B7", "B8"], "ONE_ROLE_PER_PHYSICAL_OBJECT"),
  node("physical_receipt_envelopes", "APPEND_ONLY_FACT", "ONE_PER_COMPLETED_PHYSICAL_DISPATCH", "physical_request_identity", ["B5", "B6", "B7", "B8"], "ONE_ROLE_PER_PHYSICAL_OBJECT"),
  node("receipt_index", "DERIVED_PROJECTION", "EXACT_DECLARED_SET", "physical_request_identity_and_receipt_digest", ["B5", "B6", "B7", "B8"], "ONE_ROLE_PER_PHYSICAL_OBJECT"),
  node("safe_cache", "DERIVED_PROJECTION", "ONE_PER_REPLAYABLE_SUCCESSFUL_RECEIPT", "physical_request_identity_and_projection_profile", ["B5", "B6", "B7", "B8"], "ONE_ROLE_PER_PHYSICAL_OBJECT"),
  node("effective_receipt_index", "DERIVED_PROJECTION", "ONE_PER_LOGICAL_REQUEST", "logical_request_identity", ["B5", "B6", "B7", "B8"], "ONE_ROLE_PER_PHYSICAL_OBJECT"),
  node("counter_state_projection", "DERIVED_PROJECTION", "EXACTLY_ONE", "ordered_ledger_digest", ["B5", "B6", "B7", "B8"], "ONE_ROLE_PER_PHYSICAL_OBJECT"),
  node("event_semantics_profile", "TRACKED_CONTRACT", "EXACTLY_ONE", "schema_and_byte_digest", ["B6", "B7", "B8"], "TRACKED_SINGLETON"),
  node("derived_evaluation", "DERIVED_PROJECTION", "EXACTLY_ONE", "exact_input_set_digest", ["B6", "B7", "B8"], "ONE_ROLE_PER_PHYSICAL_OBJECT"),
  node("public_remediation_summary", "TRACKED_PUBLIC_AUTHORITY", "EXACTLY_ONE", "repository_relative_path_and_byte_digest", ["B6", "B7", "B8"], "TRACKED_SINGLETON"),
  node("public_merge_readiness", "TRACKED_PUBLIC_AUTHORITY", "EXACTLY_ONE", "repository_relative_path_and_byte_digest", ["B6", "B7", "B8"], "TRACKED_SINGLETON"),
  node("tracked_core_commitment", "TRACKED_PUBLIC_AUTHORITY", "EXACTLY_ONE", "repository_relative_path_and_byte_digest", ["B6", "B7", "B8"], "TRACKED_SINGLETON"),
  node("current_integrity_restatement", "TRACKED_PUBLIC_AUTHORITY", "EXACTLY_ONE", "repository_relative_path_and_byte_digest", ["B6", "B7", "B8"], "TRACKED_SINGLETON"),
  node("current_state_index", "TRACKED_PUBLIC_AUTHORITY", "EXACTLY_ONE", "repository_relative_path_and_byte_digest", ["B6", "B7", "B8"], "TRACKED_SINGLETON"),
]);

const AUTHORITY_EDGES = Object.freeze([
  edge("completed_ledger_to_receipts", "request_event_ledger", "physical_receipt_envelopes", "BIJECTION", "completed_physical_dispatch_events", "all_receipt_envelopes", "ONE_TO_ONE", "physical_request_identity"),
  edge("receipts_to_receipt_index", "physical_receipt_envelopes", "receipt_index", "BIJECTION", "all_receipt_envelopes", "all_receipt_index_rows", "ONE_TO_ONE", "physical_request_identity_and_receipt_digest"),
  edge("replayable_receipts_to_cache", "physical_receipt_envelopes", "safe_cache", "BIJECTION", "replayable_successful_receipts", "all_safe_cache_rows", "ONE_TO_ONE", "physical_request_identity_and_projection_profile"),
  edge("receipt_membership_to_effective", "receipt_index", "effective_receipt_index", "EXACT_SUBSET", "all_rows_grouped_by_logical_request", "selection_membership_rows", "ONE_TO_ZERO_OR_ONE", "logical_request_identity_and_physical_request_identity"),
  edge("ledger_to_counter", "request_event_ledger", "counter_state_projection", "EXACT_PROJECTION", "all_ordered_events", "single_counter_projection", "MANY_TO_ONE", "ordered_event_replay"),
  edge("immutable_inputs_to_evaluation", "immutable_inputs", "derived_evaluation", "REQUIRED_INPUT", "exact_declared_immutable_input_set", "bound_input_rows", "EXACT_SET_TO_ONE", "role_path_and_digest"),
  edge("ledger_to_evaluation", "request_event_ledger", "derived_evaluation", "REQUIRED_INPUT", "complete_ordered_ledger", "ledger_binding", "ONE_TO_ONE_REQUIRED", "ledger_digest"),
  edge("effective_to_evaluation", "effective_receipt_index", "derived_evaluation", "REQUIRED_INPUT", "all_logical_selection_decisions", "effective_binding", "EXACT_SET_TO_ONE", "selection_set_digest"),
  edge("profile_to_evaluation", "event_semantics_profile", "derived_evaluation", "REQUIRED_INPUT", "single_profile", "profile_binding", "ONE_TO_ONE_REQUIRED", "schema_and_digest"),
  edge("evaluation_to_restatement", "derived_evaluation", "current_integrity_restatement", "DERIVES", "recomputed_current_evaluation", "current_decision_computation", "ONE_TO_ONE_REQUIRED", "evaluation_and_decision_digest"),
  edge("evaluation_to_remediation_summary", "derived_evaluation", "public_remediation_summary", "DERIVES", "sanitized_summary_projection", "entire_public_report", "ONE_TO_EXACT_ROLE", "semantic_and_byte_digest"),
  edge("evaluation_to_merge_readiness", "derived_evaluation", "public_merge_readiness", "DERIVES", "sanitized_readiness_projection", "entire_public_report", "ONE_TO_EXACT_ROLE", "semantic_and_byte_digest"),
  edge("commitment_to_current_index", "tracked_core_commitment", "current_state_index", "BINDS", "entire_commitment", "current_authority_core_commitment", "ONE_TO_ONE_REQUIRED", "path_and_byte_digest"),
  edge("restatement_to_current_index", "current_integrity_restatement", "current_state_index", "BINDS", "entire_restatement", "current_authority_restatement", "ONE_TO_ONE_REQUIRED", "path_and_byte_digest"),
  edge("summary_to_current_index", "public_remediation_summary", "current_state_index", "BINDS", "entire_public_report", "report_binding_remediation_summary", "ONE_TO_ONE_REQUIRED", "role_path_identity_and_byte_digest"),
  edge("readiness_to_current_index", "public_merge_readiness", "current_state_index", "BINDS", "entire_public_report", "report_binding_merge_readiness", "ONE_TO_ONE_REQUIRED", "role_path_identity_and_byte_digest"),
  edge("contract_to_current_index", "execution_contract", "current_state_index", "BINDS", "entire_execution_contract", "contract_binding", "ONE_TO_ONE_REQUIRED", "schema_and_byte_digest"),
]);

const RUNTIME_CONSUMERS = Object.freeze([
  consumer("B5", "runV2B5FullValidation", CANONICAL_AUTHORITY_NODE_IDS.slice(0, 8)),
  consumer("B6", "runV2B6", CANONICAL_AUTHORITY_NODE_IDS.slice(0, 10)),
  consumer("B7", "runV2B7", CANONICAL_AUTHORITY_NODE_IDS.slice(0, 10)),
  consumer("B8", "runV2B8FullValidation", CANONICAL_AUTHORITY_NODE_IDS),
]);

const PUBLIC_REPORT_REGISTRY = Object.freeze([
  report("remediation_summary", "docs/analysis/m2-v2/M2-v2-PR7-P1-remediation-summary-v0.2.json"),
  report("merge_readiness", "docs/analysis/m2-v2/M2-v2-PR7-merge-readiness-v0.2.json"),
  report("current_integrity_restatement", "docs/analysis/m2-v2/M2-v2-canary-v3-1-integrity-restatement-v0.4.json"),
  report("current_state_index", "docs/analysis/m2-v2/M2-v2-current-state-index-v0.3.json"),
]);

const RUNTIME_POPULATION_RULES = Object.freeze({
  exactFields: [
    "physicalMappingsPopulatedAtRuntime",
    "selectionDecisionsPopulatedAtRuntime",
    "physicalMappingCoverage",
    "selectionCoverage",
    "graphDigestRequiredAtB6",
  ],
  unknownFieldsRejected: true,
  physicalMappingsPopulatedAtRuntime: true,
  selectionDecisionsPopulatedAtRuntime: true,
  physicalMappingCoverage: "EXACT_ALL_RUNTIME_CONSUMED_PHYSICAL_OBJECTS",
  selectionCoverage: "EXACT_ONE_DECISION_PER_LOGICAL_REQUEST",
  graphDigestRequiredAtB6: true,
});

const PUBLIC_NODE_BY_ROLE = Object.freeze({
  remediation_summary: "public_remediation_summary",
  merge_readiness: "public_merge_readiness",
  current_integrity_restatement: "current_integrity_restatement",
  current_state_index: "current_state_index",
});

export function deriveCanonicalAuthorityGraphV0_3(input = {}) {
  const physicalMappings = normalizePhysicalMappings(input.physicalMappings ?? []);
  const selectionDecisions = normalizeSelectionDecisions(input.selectionDecisions ?? []);
  const payload = {
    schema: CANONICAL_AUTHORITY_GRAPH_SCHEMA,
    nodes: cloneJson(AUTHORITY_NODES),
    edges: cloneJson(AUTHORITY_EDGES),
    physicalMappings,
    selectionDecisions,
    runtimeConsumers: cloneJson(RUNTIME_CONSUMERS),
    publicReportRegistry: cloneJson(PUBLIC_REPORT_REGISTRY),
    runtimePopulationRules: cloneJson(RUNTIME_POPULATION_RULES),
  };
  return { ...payload, graphDigestSha256: sha256(payload) };
}

export function buildAuthorityPhysicalMapping(input) {
  if (!isPlainObject(input)) throw new Error("authority_physical_mapping_invalid");
  const nodeId = requiredNodeId(input.nodeId);
  const repositoryRelativePath = normalizeRepositoryRelativePath(input.repositoryRelativePath);
  const contentDigestSha256 = requiredDigest(input.contentDigestSha256, "authority_content_digest_invalid");
  const objectType = requiredEnum(input.objectType ?? "FILE", ["FILE", "ORDERED_FILE_SET", "VIRTUAL_DERIVED_SET"], "authority_object_type_invalid");
  const pathIdentityDigestSha256 = sha256(repositoryRelativePath);
  const physicalObjectIdSha256 = sha256({
    repositoryRelativePath,
    pathIdentityDigestSha256,
    contentDigestSha256,
    objectType,
  });
  return {
    physicalObjectIdSha256,
    nodeId,
    repositoryRelativePath,
    pathIdentityDigestSha256,
    contentDigestSha256,
    objectType,
  };
}

export function buildAuthoritySelectionDecision(input) {
  if (!isPlainObject(input)) throw new Error("authority_selection_decision_invalid");
  const logicalKey = requiredKey(input.logicalKey, "authority_logical_key_invalid");
  const candidatePhysicalKeys = requiredUniqueKeys(input.candidatePhysicalKeys ?? [], "authority_candidate_physical_keys_invalid");
  const selectedPhysicalKey = input.selectedPhysicalKey === null || input.selectedPhysicalKey === undefined
    ? null
    : requiredKey(input.selectedPhysicalKey, "authority_selected_physical_key_invalid");
  const decision = requiredEnum(input.decision, ["SELECTED", "EXPLICIT_BLOCKED", "NO_REPLAYABLE_RECEIPT"], "authority_selection_decision_invalid");
  const reason = requiredEnum(input.reason, ["UNIQUE_PERMITTED_RECEIPT", "POLICY_BLOCKED", "NO_COMPLETED_RECEIPT", "NO_REPLAYABLE_SUCCESS"], "authority_selection_reason_invalid");
  if (decision === "SELECTED" && !selectedPhysicalKey) throw new Error("authority_selected_physical_key_required");
  if (decision !== "SELECTED" && selectedPhysicalKey !== null) throw new Error("authority_selected_physical_key_forbidden");
  if (selectedPhysicalKey && !candidatePhysicalKeys.includes(selectedPhysicalKey)) throw new Error("authority_selected_physical_key_not_member");
  const logicalRequestIdentitySha256 = sha256(logicalKey);
  const orderedCandidatePhysicalRequestIds = candidatePhysicalKeys.map((value) => sha256(value));
  const selectedPhysicalRequestId = selectedPhysicalKey === null ? null : sha256(selectedPhysicalKey);
  const selectedRank = selectedPhysicalKey === null ? null : candidatePhysicalKeys.indexOf(selectedPhysicalKey);
  const membershipDigestSha256 = sha256({
    logicalRequestIdentitySha256,
    orderedCandidatePhysicalRequestIds,
  });
  const payload = {
    logicalRequestIdentitySha256,
    orderedCandidatePhysicalRequestIds,
    selectedPhysicalRequestId,
    decision,
    reason,
    selectedRank,
    membershipDigestSha256,
  };
  return { ...payload, decisionDigestSha256: sha256(payload) };
}

export function buildAuthorityDerivedInputBindings(input = {}) {
  const requestEventLedger = cloneJson(input.requestEventLedger ?? []);
  const effectiveReceiptIndexEntries = cloneJson(input.effectiveReceiptIndexEntries ?? []);
  return [
    { nodeId: "immutable_inputs", digestSha256: requiredDigest(input.immutableInputsDigestSha256, "immutable_inputs_digest_invalid") },
    { nodeId: "request_event_ledger", digestSha256: sha256(requestEventLedger) },
    { nodeId: "effective_receipt_index", digestSha256: sha256(effectiveReceiptIndexEntries) },
    { nodeId: "event_semantics_profile", digestSha256: requiredDigest(input.eventSemanticsProfileDigestSha256, "event_semantics_profile_digest_invalid") },
  ];
}

export function canonicalAuthorityRoleRegistryDigestSha256() {
  return sha256(AUTHORITY_NODES.map(({ nodeId, role, authorityKind, cardinality, identityKey, physicalMappingPolicy }) => ({
    nodeId,
    role,
    authorityKind,
    cardinality,
    identityKey,
    physicalMappingPolicy,
  })));
}

export function canonicalAuthorityGraphCoreDigestSha256(graph) {
  const check = checkStaticGraph(graph);
  if (!check.valid) throw new Error(`canonical_authority_graph_invalid:${check.issues.join(",")}`);
  return sha256(Object.fromEntries(CANONICAL_AUTHORITY_GRAPH_CORE_FIELDS.map((key) => [key, graph[key]])));
}

export function buildTrackedCoreCommitmentV0_1(input) {
  if (!isPlainObject(input)) throw new Error("tracked_core_commitment_input_invalid");
  const graph = input.graph;
  const graphCheck = checkStaticGraph(graph);
  if (!graphCheck.valid) throw new Error(`canonical_authority_graph_invalid:${graphCheck.issues.join(",")}`);
  const sourceExactHead = String(input.sourceExactHead ?? "");
  if (!/^[a-f0-9]{40}$/u.test(sourceExactHead)) throw new Error("tracked_core_commitment_source_head_invalid");
  const supersessionLineage = normalizeSupersessionLineage(input.supersessionLineage);
  return {
    schema: TRACKED_CORE_COMMITMENT_SCHEMA,
    graphSchemaVersion: CANONICAL_AUTHORITY_GRAPH_SCHEMA,
    roleRegistryDigestSha256: canonicalAuthorityRoleRegistryDigestSha256(),
    expectedGraphCoreDigestSha256: canonicalAuthorityGraphCoreDigestSha256(graph),
    sourceExactHead,
    supersessionLineage,
  };
}

export function verifyTrackedCoreCommitmentV0_1(commitment, graph) {
  const issues = [];
  if (!hasExactKeys(commitment, [
    "schema",
    "graphSchemaVersion",
    "roleRegistryDigestSha256",
    "expectedGraphCoreDigestSha256",
    "sourceExactHead",
    "supersessionLineage",
  ])) issues.push("tracked_core_commitment_mismatch");
  if (commitment?.schema !== TRACKED_CORE_COMMITMENT_SCHEMA
    || commitment?.graphSchemaVersion !== CANONICAL_AUTHORITY_GRAPH_SCHEMA
    || commitment?.roleRegistryDigestSha256 !== canonicalAuthorityRoleRegistryDigestSha256()
    || commitment?.expectedGraphCoreDigestSha256 !== safeGraphCoreDigest(graph)
    || !/^[a-f0-9]{40}$/u.test(String(commitment?.sourceExactHead ?? ""))) {
    issues.push("tracked_core_commitment_mismatch");
  }
  try { normalizeSupersessionLineage(commitment?.supersessionLineage); } catch {
    issues.push("tracked_core_commitment_mismatch");
  }
  const staticCheck = checkStaticGraph(graph);
  if (!staticCheck.valid) issues.push("tracked_core_commitment_mismatch");
  return resultFromIssues(issues, {
    roleRegistryDigestSha256: canonicalAuthorityRoleRegistryDigestSha256(),
    expectedGraphCoreDigestSha256: safeGraphCoreDigest(graph),
  });
}

export function checkAuthorityGraphExactSets(input) {
  const graph = input?.graph;
  const evidence = isPlainObject(input?.evidence) ? input.evidence : {};
  const issues = [];
  const checks = {};

  const staticCheck = checkStaticGraph(graph);
  issues.push(...staticCheck.issues);
  checks.staticGraphExact = staticCheck.valid;

  const mappingCheck = checkPhysicalMappings(graph?.physicalMappings, evidence.consumedPhysicalObjectIds);
  issues.push(...mappingCheck.issues);
  checks.physicalMappingBijection = mappingCheck.valid;

  const tupleCheck = checkReceiptTupleSets(evidence);
  issues.push(...tupleCheck.issues);
  checks.completedReceiptBijection = tupleCheck.completedReceiptBijection;
  checks.receiptIndexBijection = tupleCheck.receiptIndexBijection;
  checks.safeCacheBijection = tupleCheck.safeCacheBijection;

  const effectiveCheck = checkEffectiveSelectionSets(graph?.selectionDecisions, evidence);
  issues.push(...effectiveCheck.issues);
  checks.effectiveIndexExactSubset = effectiveCheck.valid;

  const counterCheck = checkCounterProjection(evidence);
  issues.push(...counterCheck.issues);
  checks.counterProjectionReplay = counterCheck.valid;

  const derivedCheck = checkDerivedInputBindings(evidence);
  issues.push(...derivedCheck.issues);
  checks.derivedInputRoleSet = derivedCheck.valid;

  const publicCheck = checkPublicMirrorMappings(graph?.physicalMappings ?? []);
  issues.push(...publicCheck.issues);
  checks.publicMirrorsGraphBound = publicCheck.valid;

  const commitmentCheck = input?.trackedCoreCommitment === undefined
    ? null
    : verifyTrackedCoreCommitmentV0_1(input.trackedCoreCommitment, graph);
  if (commitmentCheck) issues.push(...commitmentCheck.issues);
  checks.trackedCoreCommitment = commitmentCheck?.valid ?? null;

  return resultFromIssues(issues, {
    checks,
    graphDigestSha256: isPlainObject(graph) ? recomputeGraphDigest(graph) : null,
    roleRegistryDigestSha256: canonicalAuthorityRoleRegistryDigestSha256(),
    expectedGraphCoreDigestSha256: safeGraphCoreDigest(graph),
  });
}

export function verifyCanonicalAuthorityGraph(input, options = {}) {
  const exact = checkAuthorityGraphExactSets(input);
  const issues = [...exact.issues];
  const requireCoreCommitment = options.requireCoreCommitment !== false;
  if (requireCoreCommitment && input?.trackedCoreCommitment === undefined) {
    issues.push("tracked_core_commitment_mismatch");
  }
  return resultFromIssues(issues, {
    ...exact,
    checks: {
      ...exact.checks,
      trackedCoreCommitment: requireCoreCommitment
        ? input?.trackedCoreCommitment !== undefined && exact.checks.trackedCoreCommitment === true
        : exact.checks.trackedCoreCommitment,
    },
  });
}

export function verifyCanonicalDerivedInputBindings(evidence) {
  return checkDerivedInputBindings(isPlainObject(evidence) ? evidence : {});
}

function checkStaticGraph(graph) {
  const issues = [];
  if (!hasExactKeys(graph, GRAPH_KEYS)) issues.push("canonical_authority_graph_key_set_invalid");
  if (graph?.schema !== CANONICAL_AUTHORITY_GRAPH_SCHEMA) issues.push("canonical_authority_graph_schema_invalid");
  if (canonicalJson(graph?.nodes) !== canonicalJson(AUTHORITY_NODES)
    || canonicalJson(graph?.edges) !== canonicalJson(AUTHORITY_EDGES)
    || canonicalJson(graph?.runtimeConsumers) !== canonicalJson(RUNTIME_CONSUMERS)
    || canonicalJson(graph?.publicReportRegistry) !== canonicalJson(PUBLIC_REPORT_REGISTRY)
    || canonicalJson(graph?.runtimePopulationRules) !== canonicalJson(RUNTIME_POPULATION_RULES)) {
    issues.push("canonical_authority_graph_static_mismatch");
  }
  if (!Array.isArray(graph?.physicalMappings) || !Array.isArray(graph?.selectionDecisions)) {
    issues.push("canonical_authority_graph_runtime_arrays_invalid");
  }
  if (!isDigest(graph?.graphDigestSha256) || graph.graphDigestSha256 !== recomputeGraphDigest(graph)) {
    issues.push("canonical_authority_graph_digest_invalid");
  }
  return resultFromIssues(issues);
}

function checkPhysicalMappings(values, consumedPhysicalObjectIds) {
  const issues = [];
  if (!Array.isArray(values)) return resultFromIssues(["graph_physical_mapping_not_bijective"]);
  const ids = new Set();
  const paths = new Set();
  const caseFoldedPaths = new Set();
  const countsByNode = new Map(CANONICAL_AUTHORITY_NODE_IDS.map((nodeId) => [nodeId, 0]));
  const reachableNodes = new Set(RUNTIME_CONSUMERS.flatMap((value) => value.consumedNodeIds));
  for (const value of values) {
    if (!hasExactKeys(value, PHYSICAL_MAPPING_KEYS)) {
      issues.push("graph_physical_mapping_not_bijective");
      continue;
    }
    let expected;
    try {
      expected = buildAuthorityPhysicalMapping(value);
    } catch {
      issues.push("graph_physical_mapping_not_bijective");
      continue;
    }
    if (canonicalJson(expected) !== canonicalJson(value)) issues.push("graph_physical_mapping_not_bijective");
    if (ids.has(value.physicalObjectIdSha256)
      || paths.has(value.pathIdentityDigestSha256)
      || caseFoldedPaths.has(value.repositoryRelativePath.toLocaleLowerCase("en-US"))) {
      issues.push("graph_physical_mapping_not_bijective");
    }
    ids.add(value.physicalObjectIdSha256);
    paths.add(value.pathIdentityDigestSha256);
    caseFoldedPaths.add(value.repositoryRelativePath.toLocaleLowerCase("en-US"));
    countsByNode.set(value.nodeId, (countsByNode.get(value.nodeId) ?? 0) + 1);
    if (!reachableNodes.has(value.nodeId)) issues.push("authority_orphan_physical_mapping");
  }
  for (const nodeRecord of AUTHORITY_NODES) {
    const count = countsByNode.get(nodeRecord.nodeId) ?? 0;
    if (count === 0) issues.push(`authority_role_mapping_missing:${nodeRecord.nodeId}`);
    if (nodeRecord.physicalMappingPolicy === "TRACKED_SINGLETON" && count !== 1) {
      issues.push("graph_physical_mapping_not_bijective");
    }
  }
  if (!Array.isArray(consumedPhysicalObjectIds)) {
    issues.push("authority_consumed_object_set_missing");
  } else {
    const consumed = consumedPhysicalObjectIds.map(String);
    if (new Set(consumed).size !== consumed.length || consumed.some((value) => !isDigest(value))) {
      issues.push("authority_unclassified_consumed_object");
    }
    if (!sameSet(consumed, [...ids])) issues.push("authority_unclassified_consumed_object");
  }
  return resultFromIssues(issues);
}

function checkReceiptTupleSets(evidence) {
  const issues = [];
  const ledger = evidence.requestEventLedger;
  const ledgerValidation = validateRequestEventLedger(ledger);
  if (!ledgerValidation.valid) {
    return {
      ...resultFromIssues(["request_event_ledger_invalid"]),
      completedReceiptBijection: false,
      receiptIndexBijection: false,
      safeCacheBijection: false,
    };
  }
  let requestProjection;
  try { requestProjection = projectCanonicalRequestAuthority(ledger); } catch {
    return {
      ...resultFromIssues(["ledger_completed_receipt_set_mismatch"]),
      completedReceiptBijection: false,
      receiptIndexBijection: false,
      safeCacheBijection: false,
    };
  }
  const completed = requestProjection.completedPhysicalDispatches.map(({ logicalKey, physicalKey, receiptDigest }) => ({
    logicalKey,
    physicalKey,
    receiptDigest,
  }));
  if (completed.some((entry) => !isDigest(entry.receiptDigest))) issues.push("ledger_completed_receipt_set_mismatch");

  const completedEvents = ledger.filter((event) => event.eventType === "completed");
  const envelopes = normalizeEnvelopeEvidence(evidence.receiptEnvelopes, completedEvents, issues);
  const receiptIndex = normalizeTupleEntries(evidence.receiptIndexEntries, issues, "receipt_index");
  const safeCache = normalizeSafeCacheEntries(evidence.safeCacheEntries, issues);
  const replayable = envelopes.filter((entry) => entry.replayableSuccessful);

  const completedReceiptBijection = compareTupleCollections(completed, envelopes, issues, "ledger_completed_receipt_set_mismatch");
  const receiptIndexBijection = compareTupleCollections(envelopes, receiptIndex, issues, "ledger_completed_receipt_set_mismatch");
  const safeCacheBijection = compareCacheCollections(replayable, safeCache, issues);
  return {
    ...resultFromIssues(issues),
    completedReceiptBijection,
    receiptIndexBijection,
    safeCacheBijection,
  };
}

function checkEffectiveSelectionSets(selectionDecisions, evidence) {
  const issues = [];
  let decisions;
  try { decisions = normalizeSelectionDecisions(selectionDecisions ?? []); } catch {
    return resultFromIssues(["effective_index_not_unique_ordered_subset"]);
  }
  const ledger = Array.isArray(evidence.requestEventLedger) ? evidence.requestEventLedger : [];
  const receiptIndex = Array.isArray(evidence.receiptIndexEntries) ? evidence.receiptIndexEntries : [];
  const effective = Array.isArray(evidence.effectiveReceiptIndexEntries) ? evidence.effectiveReceiptIndexEntries : null;
  if (!effective) return resultFromIssues(["effective_index_not_unique_ordered_subset"]);
  const plannedLogicalKeys = unique(ledger.filter((event) => event?.eventType === "planned").map((event) => event.logicalKey));
  if (decisions.length !== plannedLogicalKeys.length
    || new Set(decisions.map((value) => value.logicalRequestIdentitySha256)).size !== decisions.length
    || !sameSet(decisions.map((value) => value.logicalRequestIdentitySha256), plannedLogicalKeys.map((value) => sha256(value)))) {
    issues.push("effective_index_not_unique_ordered_subset");
  }

  const logicalByDigest = new Map(plannedLogicalKeys.map((key) => [sha256(key), key]));
  const expectedEffective = [];
  for (const decision of decisions) {
    const logicalKey = logicalByDigest.get(decision.logicalRequestIdentitySha256);
    if (!logicalKey) {
      issues.push("effective_index_not_unique_ordered_subset");
      continue;
    }
    const candidates = receiptIndex.filter((entry) => entry?.logicalKey === logicalKey);
    const candidateIds = candidates.map((entry) => sha256(entry.physicalKey));
    const membershipDigest = sha256({
      logicalRequestIdentitySha256: decision.logicalRequestIdentitySha256,
      orderedCandidatePhysicalRequestIds: decision.orderedCandidatePhysicalRequestIds,
    });
    const { decisionDigestSha256, ...decisionPayload } = decision;
    if (canonicalJson(candidateIds) !== canonicalJson(decision.orderedCandidatePhysicalRequestIds)
      || decision.membershipDigestSha256 !== membershipDigest
      || decision.decisionDigestSha256 !== sha256(decisionPayload)) {
      issues.push("effective_index_not_unique_ordered_subset");
    }
    if (decision.decision === "SELECTED") {
      const selected = candidates.find((entry) => sha256(entry.physicalKey) === decision.selectedPhysicalRequestId);
      if (!selected || decision.selectedRank !== candidates.indexOf(selected)) {
        issues.push("effective_index_not_unique_ordered_subset");
      } else {
        expectedEffective.push({
          logicalKey: selected.logicalKey,
          physicalKey: selected.physicalKey,
          receiptDigest: selected.receiptDigest,
        });
      }
    } else if (decision.selectedPhysicalRequestId !== null || decision.selectedRank !== null) {
      issues.push("effective_index_not_unique_ordered_subset");
    }
  }

  const normalizedEffective = normalizeTupleEntries(effective, issues, "effective_index");
  if (!sameOrderedTuples(expectedEffective, normalizedEffective)
    || new Set(normalizedEffective.map(identityKey)).size !== normalizedEffective.length) {
    issues.push("effective_index_not_unique_ordered_subset");
  }
  return resultFromIssues(issues);
}

function checkCounterProjection(evidence) {
  const ledgerValidation = validateRequestEventLedger(evidence.requestEventLedger);
  if (!ledgerValidation.valid) return resultFromIssues(["counter_projection_ledger_mismatch"]);
  const projection = isPlainObject(evidence.counterProjection?.counters)
    ? evidence.counterProjection.counters
    : evidence.counterProjection;
  if (!hasExactKeys(projection, REQUEST_COUNTER_FIELDS)
    || canonicalJson(projection) !== canonicalJson(ledgerValidation.replay.counters)) {
    return resultFromIssues(["counter_projection_ledger_mismatch"]);
  }
  return resultFromIssues([]);
}

function checkDerivedInputBindings(evidence) {
  const values = evidence.derivedInputBindings;
  if (!Array.isArray(values)) return resultFromIssues(["derived_input_role_set_invalid"]);
  const issues = [];
  const seen = new Set();
  for (const value of values) {
    if (!hasExactKeys(value, ["nodeId", "digestSha256"])
      || !CANONICAL_DERIVED_INPUT_ROLE_IDS.includes(value.nodeId)
      || !isDigest(value.digestSha256)
      || seen.has(value.nodeId)) {
      issues.push("derived_input_role_set_invalid");
    }
    seen.add(value?.nodeId);
  }
  if (canonicalJson([...seen].sort()) !== canonicalJson([...CANONICAL_DERIVED_INPUT_ROLE_IDS].sort())) {
    issues.push("derived_input_role_set_invalid");
  }
  const byRole = new Map(values.map((value) => [value.nodeId, value.digestSha256]));
  if (byRole.get("request_event_ledger") !== sha256(evidence.requestEventLedger ?? [])
    || byRole.get("effective_receipt_index") !== sha256(evidence.effectiveReceiptIndexEntries ?? [])) {
    issues.push("derived_input_role_set_invalid");
  }
  if (evidence.immutableInputsDigestSha256 !== undefined
    && byRole.get("immutable_inputs") !== evidence.immutableInputsDigestSha256) {
    issues.push("derived_input_role_set_invalid");
  }
  if (evidence.eventSemanticsProfileDigestSha256 !== undefined
    && byRole.get("event_semantics_profile") !== evidence.eventSemanticsProfileDigestSha256) {
    issues.push("derived_input_role_set_invalid");
  }
  return resultFromIssues(issues);
}

function checkPublicMirrorMappings(mappings) {
  const issues = [];
  for (const record of PUBLIC_REPORT_REGISTRY) {
    const matches = mappings.filter((mapping) => mapping.repositoryRelativePath === record.repositoryRelativePath);
    if (matches.length !== 1 || matches[0].nodeId !== PUBLIC_NODE_BY_ROLE[record.role]) {
      issues.push("public_mirror_authority_binding_invalid");
    }
  }
  return resultFromIssues(issues);
}

function normalizeEnvelopeEvidence(values, completedEvents, issues) {
  if (!Array.isArray(values)) {
    issues.push("ledger_completed_receipt_set_mismatch");
    return [];
  }
  const completedByIdentity = new Map();
  for (const event of completedEvents) {
    const key = identityKey(event);
    if (completedByIdentity.has(key)) completedByIdentity.set(key, null);
    else completedByIdentity.set(key, event);
  }
  const result = [];
  for (const value of values) {
    if (!hasExactKeys(value, ["envelope", "logicalKey", "physicalKey", "replayableSuccessful", "projectionProfileDigestSha256"])
      || typeof value.logicalKey !== "string"
      || typeof value.physicalKey !== "string"
      || typeof value.replayableSuccessful !== "boolean"
      || (value.projectionProfileDigestSha256 !== null && !isDigest(value.projectionProfileDigestSha256))
      || !isPlainObject(value.envelope)
      || value.envelope.schema !== "receipt-envelope-v0.2"
      || !isPlainObject(value.envelope.receiptPayload)
      || value.envelope.receiptDigest !== sha256(value.envelope.receiptPayload)
      || !isPlainObject(value.envelope.runtimeView)
      || value.envelope.runtimeViewDigest !== sha256(value.envelope.runtimeView)) {
      issues.push("graph_tuple_semantic_mismatch");
      continue;
    }
    const completedEvent = completedByIdentity.get(identityKey(value));
    const payloadAuthority = projectReceiptPayloadAuthority(value.envelope.receiptPayload);
    if (!completedEvent
      || !payloadAuthority
      || payloadAuthority.logicalKey !== value.logicalKey
      || payloadAuthority.physicalKey !== value.physicalKey
      || payloadAuthority.requestDigest !== completedEvent.requestDigest
      || payloadAuthority.provider !== completedEvent.provider
      || payloadAuthority.stage !== completedEvent.stage) {
      issues.push("graph_tuple_semantic_mismatch");
      continue;
    }
    result.push({
      logicalKey: value.logicalKey,
      physicalKey: value.physicalKey,
      receiptDigest: value.envelope.receiptDigest,
      replayableSuccessful: value.replayableSuccessful,
      projectionProfileDigestSha256: value.projectionProfileDigestSha256,
    });
  }
  return result;
}

function projectReceiptPayloadAuthority(payload) {
  if (!isPlainObject(payload)) return null;
  if (payload.schema === V2B6_RELAY_RECEIPT_SCHEMA) {
    return relayPayloadAuthority(payload);
  }
  if (payload.schema === V2B8_TAVILY_QUERY_SCHEMA
    || payload.providerReceipt?.schema === V2B5_TAVILY_RECEIPT_SCHEMA) {
    return tavilyPayloadAuthority(payload);
  }
  return null;
}

function relayPayloadAuthority(payload) {
  if (!isAuthorityKey(payload.logicalExtractionKey)
    || !isAuthorityKey(payload.cacheKey)
    || !isDigest(payload.requestPayloadDigest)
    || payload.provider !== V2B6_RELAY_PROVIDER_ID
    || (Object.hasOwn(payload, "logicalKey") && payload.logicalKey !== payload.logicalExtractionKey)
    || (Object.hasOwn(payload, "physicalKey") && payload.physicalKey !== payload.cacheKey)
    || (Object.hasOwn(payload, "requestDigest") && payload.requestDigest !== payload.requestPayloadDigest)
    || (Object.hasOwn(payload, "stage") && payload.stage !== V2B8_REQUEST_LEDGER_STAGE)) return null;
  return {
    logicalKey: payload.logicalExtractionKey,
    physicalKey: payload.cacheKey,
    requestDigest: payload.requestPayloadDigest,
    provider: payload.provider,
    stage: V2B8_REQUEST_LEDGER_STAGE,
  };
}

function tavilyPayloadAuthority(payload) {
  const receipt = payload.providerReceipt;
  if (!isPlainObject(receipt)
    || receipt.schema !== V2B5_TAVILY_RECEIPT_SCHEMA
    || receipt.provider !== V2B5_TAVILY_PROVIDER_ID
    || !isAuthorityKey(receipt.cacheKey)
    || !isAuthorityKey(payload.runKind)
    || !isAuthorityKey(payload.canarySlotId)
    || !isAuthorityKey(payload.queryId)
    || !isAuthorityKey(payload.intent)
    || typeof payload.queryText !== "string"
    || typeof payload.country !== "string"
    || receipt.queryId !== payload.queryId
    || (Object.hasOwn(payload, "cacheKey") && payload.cacheKey !== receipt.cacheKey)
    || (Object.hasOwn(payload, "physicalKey") && payload.physicalKey !== receipt.cacheKey)
    || (Object.hasOwn(payload, "provider") && payload.provider !== receipt.provider)
    || (Object.hasOwn(payload, "stage") && payload.stage !== V2B8_REQUEST_LEDGER_STAGE)) return null;
  const logicalKey = sha256({
    provider: V2B5_TAVILY_PROVIDER_ID,
    observationKind: "physical_dispatch",
    runKind: payload.runKind,
    canarySlotId: payload.canarySlotId,
    queryId: payload.queryId,
    intent: payload.intent,
  });
  const requestDigest = sha256({
    provider: receipt.provider,
    queryId: payload.queryId,
    queryText: payload.queryText,
    intent: payload.intent,
    country: payload.country,
    runKind: payload.runKind,
    canarySlotId: payload.canarySlotId,
  });
  if ((Object.hasOwn(payload, "logicalKey") && payload.logicalKey !== logicalKey)
    || (Object.hasOwn(payload, "requestDigest") && payload.requestDigest !== requestDigest)) return null;
  return {
    logicalKey,
    physicalKey: receipt.cacheKey,
    requestDigest,
    provider: receipt.provider,
    stage: V2B8_REQUEST_LEDGER_STAGE,
  };
}

function normalizeTupleEntries(values, issues, label) {
  if (!Array.isArray(values)) {
    issues.push(label === "effective_index" ? "effective_index_not_unique_ordered_subset" : "ledger_completed_receipt_set_mismatch");
    return [];
  }
  const result = [];
  for (const value of values) {
    if (!hasExactKeys(value, ["logicalKey", "physicalKey", "receiptDigest"])
      || typeof value.logicalKey !== "string"
      || typeof value.physicalKey !== "string"
      || !isDigest(value.receiptDigest)) {
      issues.push(label === "effective_index" ? "effective_index_not_unique_ordered_subset" : "graph_tuple_semantic_mismatch");
      continue;
    }
    result.push(cloneJson(value));
  }
  return result;
}

function normalizeSafeCacheEntries(values, issues) {
  if (!Array.isArray(values)) {
    issues.push("ledger_completed_receipt_set_mismatch");
    return [];
  }
  const result = [];
  for (const value of values) {
    if (!hasExactKeys(value, ["logicalKey", "physicalKey", "receiptDigest", "projectionProfileDigestSha256"])
      || typeof value.logicalKey !== "string"
      || typeof value.physicalKey !== "string"
      || !isDigest(value.receiptDigest)
      || !isDigest(value.projectionProfileDigestSha256)) {
      issues.push("graph_tuple_semantic_mismatch");
      continue;
    }
    result.push(cloneJson(value));
  }
  return result;
}

function compareTupleCollections(left, right, issues, missingIssue) {
  const leftIdentities = left.map(identityKey);
  const rightIdentities = right.map(identityKey);
  if (new Set(leftIdentities).size !== leftIdentities.length
    || new Set(rightIdentities).size !== rightIdentities.length
    || !sameSet(leftIdentities, rightIdentities)) {
    issues.push(missingIssue);
    return false;
  }
  const rightByIdentity = new Map(right.map((value) => [identityKey(value), value]));
  if (left.some((value) => rightByIdentity.get(identityKey(value))?.receiptDigest !== value.receiptDigest)) {
    issues.push("graph_tuple_semantic_mismatch");
    return false;
  }
  return true;
}

function compareCacheCollections(envelopes, cache, issues) {
  const tupleMatch = compareTupleCollections(envelopes, cache, issues, "ledger_completed_receipt_set_mismatch");
  if (!tupleMatch) return false;
  const cacheByIdentity = new Map(cache.map((value) => [identityKey(value), value]));
  if (envelopes.some((value) => value.projectionProfileDigestSha256 !== cacheByIdentity.get(identityKey(value))?.projectionProfileDigestSha256)) {
    issues.push("graph_tuple_semantic_mismatch");
    return false;
  }
  return true;
}

function normalizePhysicalMappings(values) {
  if (!Array.isArray(values)) throw new Error("authority_physical_mappings_invalid");
  return values.map((value) => {
    const normalized = buildAuthorityPhysicalMapping(value);
    if (canonicalJson(normalized) !== canonicalJson(value)) throw new Error("authority_physical_mapping_noncanonical");
    return normalized;
  });
}

function normalizeSelectionDecisions(values) {
  if (!Array.isArray(values)) throw new Error("authority_selection_decisions_invalid");
  return values.map((value) => {
    if (!hasExactKeys(value, SELECTION_DECISION_KEYS)
      || !isDigest(value.logicalRequestIdentitySha256)
      || !Array.isArray(value.orderedCandidatePhysicalRequestIds)
      || value.orderedCandidatePhysicalRequestIds.some((item) => !isDigest(item))
      || new Set(value.orderedCandidatePhysicalRequestIds).size !== value.orderedCandidatePhysicalRequestIds.length
      || (value.selectedPhysicalRequestId !== null && !isDigest(value.selectedPhysicalRequestId))
      || !["SELECTED", "EXPLICIT_BLOCKED", "NO_REPLAYABLE_RECEIPT"].includes(value.decision)
      || !["UNIQUE_PERMITTED_RECEIPT", "POLICY_BLOCKED", "NO_COMPLETED_RECEIPT", "NO_REPLAYABLE_SUCCESS"].includes(value.reason)
      || (value.selectedRank !== null && (!Number.isInteger(value.selectedRank) || value.selectedRank < 0))
      || !isDigest(value.membershipDigestSha256)
      || !isDigest(value.decisionDigestSha256)) {
      throw new Error("authority_selection_decision_invalid");
    }
    return cloneJson(value);
  });
}

function normalizeSupersessionLineage(values) {
  if (!Array.isArray(values) || values.length === 0) throw new Error("tracked_core_commitment_lineage_invalid");
  const roles = new Set();
  return values.map((value) => {
    if (!hasExactKeys(value, ["role", "predecessorPath", "predecessorDigestSha256", "successorPath"])) {
      throw new Error("tracked_core_commitment_lineage_invalid");
    }
    const role = String(value.role ?? "");
    if (!/^[a-z][a-z0-9_]{1,80}$/u.test(role) || roles.has(role)) throw new Error("tracked_core_commitment_lineage_invalid");
    roles.add(role);
    return {
      role,
      predecessorPath: normalizeRepositoryRelativePath(value.predecessorPath),
      predecessorDigestSha256: requiredDigest(value.predecessorDigestSha256, "tracked_core_commitment_lineage_invalid"),
      successorPath: normalizeRepositoryRelativePath(value.successorPath),
    };
  });
}

function recomputeGraphDigest(graph) {
  if (!isPlainObject(graph)) return null;
  const { graphDigestSha256: _digest, ...payload } = graph;
  return sha256(payload);
}

function safeGraphCoreDigest(graph) {
  try { return canonicalAuthorityGraphCoreDigestSha256(graph); } catch { return null; }
}

function node(nodeId, authorityKind, cardinality, identityKey, runtimeStages, physicalMappingPolicy) {
  return { nodeId, role: nodeId, authorityKind, cardinality, identityKey, runtimeStages, physicalMappingPolicy };
}

function edge(edgeId, fromNodeId, toNodeId, relation, sourceSelector, targetSelector, cardinality, semanticKey) {
  return { edgeId, fromNodeId, toNodeId, relation, sourceSelector, targetSelector, cardinality, semanticKey, required: true };
}

function consumer(stage, consumerSymbol, consumedNodeIds) {
  return { stage, consumerSymbol, consumedNodeIds, fallbackAllowed: false };
}

function report(role, repositoryRelativePath) {
  return {
    role,
    repositoryRelativePath,
    pathIdentity: "REPOSITORY_RELATIVE_NFC_FORWARD_SLASH_CASE_EXACT",
    cardinality: "EXACTLY_ONE",
    semanticDigestRequired: true,
    byteDigestRequired: true,
  };
}

function normalizeRepositoryRelativePath(value) {
  const raw = String(value ?? "");
  const path = raw.normalize("NFC");
  if (!path || path !== raw || path.includes("\\") || path.startsWith("/") || path.startsWith("//")
    || /^[A-Za-z]:/u.test(path)
    || path.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("authority_repository_path_invalid");
  }
  return path;
}

function requiredNodeId(value) {
  if (!CANONICAL_AUTHORITY_NODE_IDS.includes(value)) throw new Error("authority_node_id_invalid");
  return value;
}

function requiredDigest(value, error) {
  if (!isDigest(value)) throw new Error(error);
  return value;
}

function requiredKey(value, error) {
  const key = String(value ?? "");
  if (!key || key.length > 500 || /[\u0000\r\n]/u.test(key)) throw new Error(error);
  return key;
}

function requiredUniqueKeys(values, error) {
  if (!Array.isArray(values)) throw new Error(error);
  const keys = values.map((value) => requiredKey(value, error));
  if (new Set(keys).size !== keys.length) throw new Error(error);
  return keys;
}

function requiredEnum(value, allowed, error) {
  if (!allowed.includes(value)) throw new Error(error);
  return value;
}

function hasExactKeys(value, keys) {
  return isPlainObject(value)
    && canonicalJson(Object.keys(value).sort()) === canonicalJson([...keys].sort());
}

function identityKey(value) {
  return `${String(value?.logicalKey ?? "")}\u0000${String(value?.physicalKey ?? "")}`;
}

function sameOrderedTuples(left, right) {
  return canonicalJson(left.map(tupleKey)) === canonicalJson(right.map(tupleKey));
}

function tupleKey(value) {
  return `${identityKey(value)}\u0000${String(value?.receiptDigest ?? "")}`;
}

function sameSet(left, right) {
  return canonicalJson([...new Set(left)].sort()) === canonicalJson([...new Set(right)].sort());
}

function unique(values) {
  return [...new Set(values)];
}

function isDigest(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function isAuthorityKey(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 500 && !/[\u0000\r\n]/u.test(value);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(canonicalJson(value));
}

function resultFromIssues(values, extra = {}) {
  const issues = [...new Set(values)];
  return {
    ...extra,
    allPassed: issues.length === 0,
    valid: issues.length === 0,
    issues,
  };
}

export const __test = Object.freeze({
  AUTHORITY_EDGES,
  AUTHORITY_NODES,
  PUBLIC_REPORT_REGISTRY,
  RUNTIME_CONSUMERS,
  RUNTIME_POPULATION_RULES,
  recomputeGraphDigest,
});
