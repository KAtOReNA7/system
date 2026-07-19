import {
  FALLBACK_DISPOSITIONS,
  COMMAND_FIELDS,
  canonicalReceiptDigest,
  parseJsonUtf8Strict,
  sha256,
  sha256PortableText,
  stableStringify,
  validateJsonSchema,
} from "./m2_v2_pr7_s0_contract.mjs";

export {
  FALLBACK_DISPOSITIONS,
  canonicalReceiptDigest,
  parseJsonUtf8Strict,
  sha256,
  sha256PortableText,
  stableStringify,
  validateJsonSchema,
};

export const S1_BATCHES = Object.freeze([
  "B0", "B1", "B2", "B3", "B4", "B5", "B6", "B7",
]);

export const S1_FINDING_IDS = Object.freeze([
  "PR7-P1-003",
  "PR7-P2-009",
  "PR7-P1-006",
  "PR7-P2-008",
  "PR7-P1-008",
  "PR7-P2-016",
  "PR7-P1-009",
  "PR7-P2-013",
  "PR7-P1-013",
  "PR7-P2-006",
]);

export const S1_EXTERNAL_ENV_NAMES = Object.freeze([
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "TAVILY_API_KEY",
  "M2_V2_EVIDENCE_API_BASE_URL",
  "M2_V2_EVIDENCE_APPROVED_HOST",
  "M2_V2_APPROVED_RELAY_HOST",
  "M2_V2_EVIDENCE_PROVIDER",
  "M2_V2_SEARCH_PROVIDER",
  "M2_V2_TAVILY_BASE_URL",
  "M1_DATABASE_URL",
  "M1_DATABASE_READONLY_URL",
  "M1_DATABASE_BACKGROUND_URL",
  "DATABASE_URL",
  "PGHOST",
  "PGPORT",
  "PGDATABASE",
  "PGUSER",
  "PGPASSWORD",
]);

export const S1_FALLBACK_EVENT_FIELDS = Object.freeze([
  "eventId",
  "batchId",
  "timestamp",
  "task",
  "preferredExecutable",
  "preferredArgv",
  "failureClass",
  "failureMessageSanitized",
  "replacementExecutable",
  "replacementArgv",
  "semanticEquivalence",
  "coverageDifference",
  "sideEffectDifference",
  "securityDifference",
  "confidenceImpact",
  "disposition",
]);

export const S1_PREFLIGHT_FACT_FIELDS = Object.freeze([
  "expectedHeadMatches",
  "baseAncestorOfFindingHead",
  "findingHeadAncestorOfStartingHead",
  "startingHeadAncestorOfActualHead",
  "branchAllowed",
  "trackedSourceClean",
  "nonIgnoredUntrackedClean",
  "externalEnvironmentEmpty",
  "outputPathIgnored",
  "noPrivatePathStaged",
  "sourceEvidenceAuthentic",
  "commandRegistryValid",
  "receiptSchemaValid",
  "contractRegistryValid",
  "caseRegistryValid",
  "historicalImmutableArtifactsValid",
  "capabilitiesPresent",
  "currentGovernanceValid",
]);

export const S1_HISTORICAL_PATHS = Object.freeze([
  "config/m2-v2-test-artifact-registry.v0.1.json",
  "docs/technical-design/m2-v2/M2-v2-verifier-authority-binding-v0.2.json",
  "docs/technical-design/m2-v2/M2-v2-verifier-authority-binding-v0.2.md",
  "docs/technical-design/m2-v2/M2-v2-verifier-readonly-contract-v0.1.json",
  "docs/technical-design/m2-v2/M2-v2-verifier-readonly-contract-v0.1.md",
  "docs/technical-design/m2-v2/M2-v2-migration-set-integrity-v0.2.json",
  "docs/technical-design/m2-v2/M2-v2-migration-set-integrity-v0.2.md",
  "docs/technical-design/m2-v2/M2-v2-provider-transport-retention-v0.1.json",
  "docs/technical-design/m2-v2/M2-v2-provider-transport-retention-v0.1.md",
  "docs/technical-design/m2-v2/M2-v2-event-time-clause-binding-v0.3.json",
  "docs/technical-design/m2-v2/M2-v2-event-time-clause-binding-v0.3.md",
  "docs/technical-design/m2-v2/M2-v2-conflict-applicability-v0.3.json",
  "docs/technical-design/m2-v2/M2-v2-conflict-applicability-v0.3.md",
  "docs/technical-design/m2-v2/M2-v2-workbook-independent-verification-v0.1.json",
  "docs/technical-design/m2-v2/M2-v2-workbook-independent-verification-v0.1.md",
  "docs/analysis/m2-v2/M2-v2-current-state-index-v0.2.json",
  "docs/analysis/m2-v2/M2-v2-current-state-index-v0.2.md",
  "docs/analysis/m2-v2/M2-v2-canary-v3-1-integrity-restatement-v0.3.json",
  "docs/analysis/m2-v2/M2-v2-canary-v3-1-integrity-restatement-v0.3.md",
]);

const STARTING_HEAD = "badbf453e1e99ba87cc3064601e480a09ff1b149";
const FINDING_HEAD = "627f74c6b9b2365ee4403c613ea9689748b76541";
const BASE_SHA = "d81b952e37dd43365c0091cdd6665e69d8d39a7e";
const DIRECT_BRANCH = "codex/m2-v2-evidence-pilot-v1";
const CI_BRANCH = "codex/m2-ci-exact-head";
const OUTPUT_ROOT = "data/private-output/m2-v2-pr7-s1-remediation-badbf45";

const TASK_FIELDS = Object.freeze([
  "schema",
  "repository",
  "pullRequest",
  "startingHead",
  "findingHead",
  "baseSha",
  "branchPolicy",
  "authorizedBatches",
  "currentBatch",
  "batchDag",
  "allowedPathClasses",
  "prohibitedActions",
  "providerPolicy",
  "databasePolicy",
  "networkPolicy",
  "privateStatePolicy",
  "gitPolicy",
  "registries",
  "requiredSourceEvidence",
  "historicalImmutableArtifacts",
  "governance",
]);

const EXPECTED_SOURCES = Object.freeze([
  Object.freeze({
    sourceId: "independentReview",
    reportSha256: "e5ceba89d1b1fdd573f4f8296636ab9fb9c297eae7f28c8bd1c023abb2bfcc13",
    receiptDigest: "3a7d922b57d31547b2d6d646e186c42cc6b98c494d27922bb917af53f38febde",
  }),
  Object.freeze({
    sourceId: "planning",
    reportSha256: "2fc541e023e000901c7d55222b0d947ccc856835060fcf317a5fb604f01dc6f7",
    receiptDigest: "cf9d420ba667038f9a9f672f9ba8f75eca0ca667204bda886a97e268fbca479f",
  }),
  Object.freeze({
    sourceId: "supportAudit",
    reportSha256: "f79d625d695250230e11a2788637b6298daac86c456297c1ae4da769e25f0cd6",
    receiptDigest: "8d7e95e7ab88b56e0ea1bb6698e52887041ea7fecd9ce2167de30d7d2c11d872",
  }),
  Object.freeze({
    sourceId: "s0Implementation",
    reportSha256: "9c97aa423dd2297abedbcd9157d39a2cfb063f29e96fed8c9adaba63436bc51a",
    receiptDigest: "a63152d9656e365383476eb27fd4f714dbd7cccae73c052e324de62c5ebd35cc",
  }),
]);

const EXPECTED_REGISTRY_BINDINGS = Object.freeze({
  commandRegistry: "config/m2-v2-pr7-s1-command-registry.v0.1.json",
  receiptSchema: "config/m2-v2-pr7-s1-receipt-schema.v0.1.json",
  contractRegistry: "config/m2-v2-pr7-s1-contract-registry.v0.1.json",
  caseRegistry: "config/m2-v2-pr7-s1-case-registry.v0.1.json",
});

const EXPECTED_COMMAND_IDS = Object.freeze([
  "s1.doctor",
  "s1.contracts",
  "s1.default.isolated",
  "s1.validate.local",
]);

const EXPECTED_CATEGORY_COUNTS = Object.freeze({
  EXISTING_BYPASS: 14,
  ADJACENT_VARIANT: 23,
  FAIL_CLOSED_NEGATIVE: 38,
  POSITIVE_CONTROL: 14,
});

const EXPECTED_FINDING_COUNTS = Object.freeze({
  "PR7-P1-003": 9,
  "PR7-P2-009": 9,
  "PR7-P1-006": 7,
  "PR7-P2-008": 8,
  "PR7-P1-008": 9,
  "PR7-P2-016": 9,
  "PR7-P1-009": 8,
  "PR7-P2-013": 8,
  "PR7-P1-013": 12,
  "PR7-P2-006": 10,
});

const EXPECTED_COMMAND_SEMANTICS_SHA256 = "5d385864b2720d6b4f0d51f2f42082fccab3d401000d695186749e0cc8373ff0";
const EXPECTED_AUTHORITY_EDGES_SHA256 = "2e5da14b94e5e4d08a9c81b846a7b7758cb222da8ba0cb310b7e43e793a940de";
const EXPECTED_READONLY_ROLE_MAPPINGS_SHA256 = "756440668de003282521d7c625badbab071ff225d5fd91bc15299117a6cbaa13";
const EXPECTED_PROVIDER_SINKS_SHA256 = "2df3c73886173db09c9db71e0471ce019c693e32b1e2a99923375a625a4549f5";
const EXPECTED_PROVIDER_ROUTES_SHA256 = "f24e754f0cd00fcba3370420f7b53ea77d1f32dd4a5b51fa0a62ed236ba84bf5";
const EXPECTED_EVENT_DECISION_TABLE_SHA256 = "cc2aaf691c0ccdce1767b9612c687516ffdaef5b0b97521ca5d88bcdf1bc2289";
const EXPECTED_WORKBOOK_RELATIONSHIPS_SHA256 = "e9fe206d76ca7d7ec196488e9c8e8c0dca3527384b8c533e405499573b1581bc";
const EXPECTED_CONTRACT_ENTRIES_SHA256 = "d601a618fb559cd7144e36a89e16def1afaf941b082b41c1651b4424ea568fa8";
const EXPECTED_VERSION_GRAPH_EDGES_SHA256 = "88a6bbe0117d2b89607a8690cf1b01bc5268d3940fcb7b7c48b8e765c878d59b";
const EXPECTED_CONTRACT_REGISTRY_CANONICAL_SHA256 = "ec365942c20cfa1056081ccba6f0b18a65cd871cd577bf09827f1605e66bc99f";

const EXPECTED_ALLOWED_PATH_CLASSES = Object.freeze([
  "config/m2-v2-pr7-s1-*.json",
  "src/domain/m2V2EvidencePilot/**",
  "scripts/m2-v2-evidence-pilot/**",
  "test/helpers/m2V2*",
  "test/fixtures/m2-v2/**",
  "test/m2-v2*.test.js",
  "docs/technical-design/m2-v2/**",
  "docs/analysis/m2-v2/**",
  "package.json",
  ".github/workflows/ci.yml",
  "AGENTS.md",
  "NEXT-CODEX-INSTRUCTION.md",
  "new versioned ignored private output under the authorized S1 root during B6 only",
]);

const EXPECTED_PROHIBITED_ACTIONS = Object.freeze([
  "execute B8 or independently close any finding",
  "invoke a real provider or any non-loopback implementation/test transport",
  "connect to any database",
  "run Canary, full160, model training, or holdout",
  "add a dependency or install/upgrade a system tool",
  "overwrite historical tracked or governed-private immutable artifacts",
  "rebase, squash, amend, force push, git add dot, or git add -A",
  "mark PR ready, merge PR, or release",
  "continue after source evidence, remote, native-platform, workbook, promotion, or provider-counter failure",
]);

export const S1_LOCAL_VALIDATION_CHECK_FIELDS = Object.freeze([
  "preflightPassed",
  "isolationPassed",
  "actualHeadMatchesExpected",
  "defaultTestChainInvocationCount",
  "defaultTestTotalSkips",
  "defaultTestSkipSummaryPresent",
  "defaultTestSkipIdentityCountMatchesSummary",
  "providerRequestDelta",
  "databaseConnections",
  "actualExternalFetchCount",
  "trackedContentUnchanged",
  "trackedMetadataUnchanged",
  "governedPrivateContentUnchanged",
  "governedPrivateMetadataUnchanged",
  "gitStatusUnchanged",
  "nonIgnoredUntrackedContentUnchanged",
  "nonIgnoredUntrackedMetadataUnchanged",
  "userRefsUnchanged",
  "systemRefsUnchanged",
]);

export function validateS1CommandRegistry(registry) {
  assertPlainObject(registry, "command_registry_must_be_object");
  assertExactFields(registry, ["schema", "commands"], "command_registry");
  if (registry.schema !== "m2.v2.pr7.s1-command-registry.v0.1") {
    throw new Error("command_registry_schema_mismatch");
  }
  if (!Array.isArray(registry.commands) || registry.commands.length === 0) {
    throw new Error("command_registry_commands_required");
  }
  const ids = new Set();
  for (const command of registry.commands) {
    assertPlainObject(command, "command_must_be_object");
    assertExactFields(command, COMMAND_FIELDS, "command");
    for (const field of [
      "commandId", "purpose", "platform", "executable", "cwd", "networkPolicy",
      "providerPolicy", "databasePolicy", "mutability", "skipPolicy", "isolationGroup", "receiptRole",
    ]) assertNonemptyString(command[field], `${field}_must_be_nonempty_string`);
    for (const field of ["argv", "requiredInputs", "optionalInputs"]) {
      if (!Array.isArray(command[field]) || command[field].some((item) => typeof item !== "string")) {
        throw new Error(`${field}_must_be_string_array`);
      }
    }
    if (!Number.isSafeInteger(command.timeoutSeconds) || command.timeoutSeconds <= 0) {
      throw new Error("command_timeout_must_be_positive_integer");
    }
    if (ids.has(command.commandId)) throw new Error("duplicate_command_id");
    ids.add(command.commandId);
  }
  const summary = { commandCount: registry.commands.length, commandIds: [...ids] };
  assertExactArray(summary.commandIds, EXPECTED_COMMAND_IDS, "command_registry_ids_mismatch");
  for (const command of registry.commands) {
    assertExactFields(command, COMMAND_FIELDS, `command_${command.commandId}`);
    if (command.providerPolicy === "allowed" || command.databasePolicy !== "forbidden") {
      throw new Error(`command_external_policy_invalid_${command.commandId}`);
    }
    if (command.argv.some((argument) => /(?:&&|\|\||[|;<>])/u.test(argument))) {
      throw new Error(`command_shell_operator_forbidden_${command.commandId}`);
    }
  }
  if (sha256(stableStringify(registry.commands)) !== EXPECTED_COMMAND_SEMANTICS_SHA256) {
    throw new Error("command_registry_semantics_mismatch");
  }
  return summary;
}

export function resolveRegisteredCommand(registry, commandId, platform = process.platform) {
  validateS1CommandRegistry(registry);
  const command = registry.commands.find((candidate) => candidate.commandId === commandId);
  if (!command) throw new Error("unknown_command_id");
  const compatible = command.platform === "all"
    || (command.platform === "windows" && platform === "win32")
    || (command.platform === "linux" && platform === "linux");
  if (!compatible) throw new Error("command_not_supported_on_platform");
  return structuredClone(command);
}

export function validateS1TaskManifest(manifest, bindings = {}) {
  assertPlainObject(manifest, "task_manifest_must_be_object");
  assertExactFields(manifest, TASK_FIELDS, "task_manifest");
  if (manifest.schema !== "m2.v2.pr7.s1-task.v0.1") throw new Error("task_schema_mismatch");
  if (manifest.repository !== "KAtOReNA7/system" || manifest.pullRequest !== 7) {
    throw new Error("task_repository_or_pr_mismatch");
  }
  if (manifest.startingHead !== STARTING_HEAD
      || manifest.findingHead !== FINDING_HEAD
      || manifest.baseSha !== BASE_SHA) {
    throw new Error("task_git_anchor_mismatch");
  }
  validateBranchPolicy(manifest.branchPolicy);
  assertExactArray(manifest.authorizedBatches, S1_BATCHES, "authorized_batches_mismatch");
  if (manifest.currentBatch !== "B2") throw new Error("current_batch_must_be_b2");
  validateBatchDag(manifest.batchDag);
  assertExactArray(manifest.allowedPathClasses, EXPECTED_ALLOWED_PATH_CLASSES, "allowed_path_classes_invalid");
  assertExactArray(manifest.prohibitedActions, EXPECTED_PROHIBITED_ACTIONS, "prohibited_actions_invalid");
  validatePolicies(manifest);
  validateRegistryBindings(manifest.registries, bindings);
  if (bindings.commandRegistryBytes !== undefined) {
    validateS1CommandRegistry(parseJsonUtf8Strict(bindings.commandRegistryBytes));
  }
  validateRequiredSourceEvidence(manifest.requiredSourceEvidence);
  validateHistoricalArtifactBindings(
    manifest.historicalImmutableArtifacts,
    bindings.historicalArtifactBytesByPath,
  );
  validateGovernance(manifest.governance);
  return true;
}

export function validateContractRegistry(registry, {
  contractArtifactBytesByPath = undefined,
  historicalArtifactBytesByPath = undefined,
  trackedPaths = undefined,
} = {}) {
  assertPlainObject(registry, "contract_registry_must_be_object");
  assertExactFields(registry, [
    "schema", "status", "sourceExactHead", "classification", "historicalArtifactPolicy",
    "historicalBaselines", "caseRegistry", "findingIds", "contracts", "plannedCurrentAuthority",
    "versionGraph", "openFindingState", "authorization",
  ], "contract_registry");
  if (registry.schema !== "m2.v2.pr7-s1-contract-registry.v0.1"
      || registry.status !== "PROPOSED_NOT_CURRENT"
      || registry.sourceExactHead !== STARTING_HEAD
      || registry.classification !== "public_sanitized_not_for_formal_decision") {
    throw new Error("contract_registry_identity_mismatch");
  }
  assertExactFields(registry.historicalArtifactPolicy, [
    "immutable", "inPlaceOverwriteAllowed", "supersessionMustBeExplicit",
  ], "historical_artifact_policy");
  if (registry.historicalArtifactPolicy.immutable !== true
      || registry.historicalArtifactPolicy.inPlaceOverwriteAllowed !== false
      || registry.historicalArtifactPolicy.supersessionMustBeExplicit !== true) {
    throw new Error("historical_artifact_policy_invalid");
  }
  validateContractHistoricalBaselines(
    registry.historicalBaselines,
    historicalArtifactBytesByPath,
    trackedPaths,
  );
  assertExactFields(registry.caseRegistry, [
    "path", "schema", "statusRequiredAtB0", "requiredCaseCount", "defaultProfileCaseCount",
    "defaultSkips", "optionalPrivateProfileSeparate",
  ], "contract_case_registry");
  if (registry.caseRegistry.path !== EXPECTED_REGISTRY_BINDINGS.caseRegistry
      || registry.caseRegistry.schema !== "m2.v2.pr7-s1-case-registry.v0.1"
      || registry.caseRegistry.statusRequiredAtB0 !== "PLANNED_NOT_EXECUTED"
      || registry.caseRegistry.requiredCaseCount !== 89
      || registry.caseRegistry.defaultProfileCaseCount !== 89
      || registry.caseRegistry.defaultSkips !== 0
      || registry.caseRegistry.optionalPrivateProfileSeparate !== true) {
    throw new Error("contract_case_registry_policy_invalid");
  }
  assertExactArray(registry.findingIds, S1_FINDING_IDS, "contract_finding_ids_mismatch");
  if (!Array.isArray(registry.contracts) || registry.contracts.length !== 7) {
    throw new Error("contract_count_mismatch");
  }
  const mappedFindings = [];
  const paths = new Set();
  const ids = new Set();
  for (const contract of registry.contracts) {
    assertPlainObject(contract, "contract_entry_must_be_object");
    assertExactFields(contract, [
      "contractId", "machinePath", "narrativePath", "machineSha256", "narrativeSha256",
      "schema", "declaredSchemas", "schemaDefinitions", "status", "batch", "findingIds", "supersedes",
    ], `contract_${String(contract.contractId)}`);
    assertNonemptyString(contract.contractId, "contract_id_required");
    if (ids.has(contract.contractId)) throw new Error("contract_id_duplicate");
    ids.add(contract.contractId);
    for (const path of [contract.machinePath, contract.narrativePath]) {
      assertRepositoryRelativePath(path, "contract_path_invalid");
      if (paths.has(path)) throw new Error("contract_path_duplicate");
      paths.add(path);
    }
    assertSha(contract.machineSha256, `contract_machine_sha_invalid_${contract.contractId}`);
    assertSha(contract.narrativeSha256, `contract_narrative_sha_invalid_${contract.contractId}`);
    assertNonemptyStringArray(contract.declaredSchemas, `contract_declared_schemas_invalid_${contract.contractId}`);
    if (contract.declaredSchemas[0] !== contract.schema
        || new Set(contract.declaredSchemas).size !== contract.declaredSchemas.length) {
      throw new Error(`contract_declared_schemas_invalid_${contract.contractId}`);
    }
    validateContractSchemaDefinitions(contract, contractArtifactBytesByPath);
    if (contractArtifactBytesByPath !== undefined) {
      for (const [path, expectedDigest, role] of [
        [contract.machinePath, contract.machineSha256, "machine"],
        [contract.narrativePath, contract.narrativeSha256, "narrative"],
      ]) {
        const bytes = contractArtifactBytesByPath instanceof Map
          ? contractArtifactBytesByPath.get(path)
          : contractArtifactBytesByPath[path];
        if (bytes === undefined) throw new Error(`contract_${role}_bytes_missing_${contract.contractId}`);
        if (sha256PortableText(bytes) !== expectedDigest) {
          throw new Error(`contract_${role}_digest_mismatch_${contract.contractId}`);
        }
      }
    }
    if (contract.status !== "PROPOSED_NOT_CURRENT" || !/^B[1-5]$/u.test(contract.batch)) {
      throw new Error(`contract_status_or_batch_invalid_${contract.contractId}`);
    }
    assertNonemptyStringArray(contract.findingIds, "contract_finding_ids_invalid");
    assertNonemptyStringArray(contract.supersedes, "contract_supersedes_invalid");
    mappedFindings.push(...contract.findingIds);
  }
  if (sha256(stableStringify(registry.contracts)) !== EXPECTED_CONTRACT_ENTRIES_SHA256) {
    throw new Error("contract_registry_contract_entries_semantics_mismatch");
  }
  assertSameStringSet(mappedFindings, S1_FINDING_IDS, "contract_finding_mapping_incomplete");
  validatePlannedCurrentAuthority(registry.plannedCurrentAuthority, {
    contracts: registry.contracts,
    contractArtifactBytesByPath,
  });
  assertExactFields(registry.versionGraph, [
    "acyclicRequired", "nodeResolution", "everyTargetResolvedByExactlyOneRegistryNode", "edges",
  ], "version_graph");
  if (registry.versionGraph.acyclicRequired !== true
      || registry.versionGraph.nodeResolution !== "CONTRACT_DECLARED_SCHEMAS_PLUS_PLANNED_CURRENT_AUTHORITY_PLUS_EXPLICIT_HISTORICAL_SCHEMAS"
      || registry.versionGraph.everyTargetResolvedByExactlyOneRegistryNode !== true) {
    throw new Error("version_graph_resolution_policy_invalid");
  }
  validateVersionGraphAcyclic(registry.versionGraph.edges);
  validateVersionGraphResolution(registry);
  if (sha256(stableStringify(registry.versionGraph.edges)) !== EXPECTED_VERSION_GRAPH_EDGES_SHA256) {
    throw new Error("version_graph_edge_semantics_mismatch");
  }
  validateOpenFindingState(registry.openFindingState);
  validateContractAuthorization(registry.authorization);
  if (contractArtifactBytesByPath !== undefined) {
    validateContractSemanticClosure(registry, contractArtifactBytesByPath);
  }
  if (sha256(stableStringify(registry)) !== EXPECTED_CONTRACT_REGISTRY_CANONICAL_SHA256) {
    throw new Error("contract_registry_canonical_semantics_mismatch");
  }
  return {
    contractCount: registry.contracts.length,
    findingCount: new Set(mappedFindings).size,
    edgeCount: registry.versionGraph.edges.length,
  };
}

export function validateContractSemanticClosure(registry, contractArtifactBytesByPath) {
  assertPlainObject(registry, "semantic_contract_registry_must_be_object");
  if (!Array.isArray(registry.contracts) || registry.contracts.length !== 7) {
    throw new Error("semantic_contract_count_mismatch");
  }
  const documents = new Map();
  for (const contract of registry.contracts) {
    const bytes = contractArtifactBytesByPath instanceof Map
      ? contractArtifactBytesByPath.get(contract.machinePath)
      : contractArtifactBytesByPath?.[contract.machinePath];
    if (bytes === undefined) throw new Error(`semantic_contract_bytes_missing_${contract.contractId}`);
    documents.set(contract.contractId, parseJsonUtf8Strict(bytes));
  }

  const authorityNodeIds = validateAuthoritySemanticClosure(
    requireSemanticDocument(documents, "authority_binding_v0_3"),
  );
  validateReadonlySemanticClosure(
    requireSemanticDocument(documents, "verifier_readonly_v0_2"),
    authorityNodeIds,
  );
  validateMigrationSemanticClosure(requireSemanticDocument(documents, "migration_set_integrity_v0_3"));
  validateSafeCacheSemanticClosure(requireSemanticDocument(documents, "safe_cache_projection_v0_3"));
  validateProviderSemanticClosure(requireSemanticDocument(documents, "provider_transport_v0_2"));
  validateEventSemanticClosure(requireSemanticDocument(documents, "event_time_clause_binding_v0_4"));
  validateWorkbookSemanticClosure(
    requireSemanticDocument(documents, "workbook_independent_verification_v0_2"),
  );

  for (const [contractId, document] of documents) {
    validateContractAuthorization(document.authorization);
    if (stableStringify(document.authorization) !== stableStringify(registry.authorization)) {
      throw new Error(`semantic_authorization_mismatch_${contractId}`);
    }
  }
  return { contractCount: documents.size, authorityNodeCount: authorityNodeIds.size };
}

function validateAuthoritySemanticClosure(document) {
  assertExactFields(document, [
    "schema", "status", "classification", "sourceExactHead", "findingIds", "lineage",
    "canonicalAuthorityGraph", "trackedCoreCommitment", "currentStateIndexV0_3",
    "integrityRestatementV0_4", "currentDecisionComputation", "supersessionRules",
    "verificationScope", "authorization",
  ], "semantic_authority_document");
  if (document.schema !== "m2.v2.verifier-authority-binding-public.v0.3") {
    throw new Error("semantic_authority_schema_mismatch");
  }
  const graph = document.canonicalAuthorityGraph;
  assertPlainObject(graph, "semantic_authority_graph_must_be_object");
  if (graph.schema !== "m2.v2.canonical-authority-graph.v0.3"
      || graph.unknownFieldsRejected !== true) {
    throw new Error("semantic_authority_graph_policy_invalid");
  }
  assertExactArray(graph.exactFields, [
    "schema", "nodes", "edges", "physicalMappings", "selectionDecisions", "runtimeConsumers",
    "publicReportRegistry", "runtimePopulationRules", "graphDigestSha256",
  ], "semantic_authority_graph_exact_fields_invalid");
  assertRuntimeSchemaDescriptor(graph.nodeSchema, [
    "nodeId", "role", "authorityKind", "cardinality", "identityKey", "runtimeStages",
    "physicalMappingPolicy",
  ], "semantic_authority_node_schema");
  const expectedNodeIds = [
    "immutable_inputs", "execution_contract", "request_event_ledger", "physical_receipt_envelopes",
    "receipt_index", "safe_cache", "effective_receipt_index", "counter_state_projection",
    "event_semantics_profile", "derived_evaluation", "public_remediation_summary",
    "public_merge_readiness", "tracked_core_commitment", "current_integrity_restatement",
    "current_state_index",
  ];
  if (!Array.isArray(graph.nodes) || graph.nodes.length !== 15) {
    throw new Error("semantic_authority_node_count_mismatch");
  }
  assertSameStringSet(graph.nodeSchema.nodeIdEnum, expectedNodeIds, "semantic_authority_node_enum_mismatch");
  assertSameStringSet(graph.nodes.map((node) => node?.nodeId), expectedNodeIds, "semantic_authority_node_set_mismatch");
  const nodeIds = new Set(expectedNodeIds);
  for (const node of graph.nodes) {
    assertExactFields(node, graph.nodeSchema.exactFields, `semantic_authority_node_${String(node.nodeId)}`);
    if (node.role !== node.nodeId
        || !graph.nodeSchema.authorityKindEnum.includes(node.authorityKind)
        || !graph.nodeSchema.cardinalityEnum.includes(node.cardinality)
        || !graph.nodeSchema.physicalMappingPolicyEnum.includes(node.physicalMappingPolicy)) {
      throw new Error(`semantic_authority_node_value_invalid_${node.nodeId}`);
    }
    assertUniqueStringArray(node.runtimeStages, `semantic_authority_node_stages_invalid_${node.nodeId}`);
    if (node.runtimeStages.some((stage) => !graph.nodeSchema.runtimeStageEnum.includes(stage))) {
      throw new Error(`semantic_authority_node_stage_unknown_${node.nodeId}`);
    }
  }

  assertRuntimeSchemaDescriptor(graph.edgeSchema, [
    "edgeId", "fromNodeId", "toNodeId", "relation", "sourceSelector", "targetSelector",
    "cardinality", "semanticKey", "required",
  ], "semantic_authority_edge_schema");
  if (!Array.isArray(graph.edges) || graph.edges.length !== 17
      || new Set(graph.edges.map((edge) => edge?.edgeId)).size !== 17) {
    throw new Error("semantic_authority_edge_count_or_identity_mismatch");
  }
  for (const edge of graph.edges) {
    assertExactFields(edge, graph.edgeSchema.exactFields, `semantic_authority_edge_${String(edge.edgeId)}`);
    if (!nodeIds.has(edge.fromNodeId) || !nodeIds.has(edge.toNodeId)
        || !graph.edgeSchema.relationEnum.includes(edge.relation)
        || !graph.edgeSchema.cardinalityEnum.includes(edge.cardinality)
        || edge.required !== true) {
      throw new Error(`semantic_authority_edge_invalid_${edge.edgeId}`);
    }
  }
  if (sha256(stableStringify(graph.edges)) !== EXPECTED_AUTHORITY_EDGES_SHA256) {
    throw new Error("semantic_authority_edge_semantics_mismatch");
  }
  if (graph.edgeSchema.endpointsMustBeDeclaredNodeIds !== true
      || graph.edgeSchema.pseudoOrCompoundEndpointAllowed !== false) {
    throw new Error("semantic_authority_edge_closure_policy_invalid");
  }

  assertRuntimeSchemaDescriptor(graph.selectionDecisionSchema, [
    "logicalRequestIdentitySha256", "orderedCandidatePhysicalRequestIds", "selectedPhysicalRequestId",
    "decision", "reason", "selectedRank", "membershipDigestSha256", "decisionDigestSha256",
  ], "semantic_authority_selection_schema");
  if (!Array.isArray(graph.selectionDecisions)
      || graph.selectionDecisionSchema.selectedMustBeExactMember !== true
      || graph.selectionDecisionSchema.exactlyOneDecisionPerLogicalRequest !== true
      || graph.selectionDecisionSchema.allNonEffectiveCompletedReceiptsPreservedInReceiptIndex !== true
      || graph.selectionDecisionSchema.allNonEffectiveReplayableReceiptsPreservedInSafeCache !== true) {
    throw new Error("semantic_authority_selection_preservation_invalid");
  }
  assertRuntimeSchemaDescriptor(graph.runtimeConsumerSchema, [
    "stage", "consumerSymbol", "consumedNodeIds", "fallbackAllowed",
  ], "semantic_authority_runtime_consumer_schema");
  if (!Array.isArray(graph.runtimeConsumers) || graph.runtimeConsumers.length !== 4) {
    throw new Error("semantic_authority_runtime_consumer_count_mismatch");
  }
  assertSameStringSet(
    graph.runtimeConsumers.map((record) => record?.stage),
    ["B5", "B6", "B7", "B8"],
    "semantic_authority_runtime_stage_mismatch",
  );
  for (const consumer of graph.runtimeConsumers) {
    assertExactFields(consumer, graph.runtimeConsumerSchema.exactFields, `semantic_authority_consumer_${consumer.stage}`);
    assertUniqueStringArray(consumer.consumedNodeIds, `semantic_authority_consumer_nodes_invalid_${consumer.stage}`);
    if (consumer.consumedNodeIds.some((nodeId) => !nodeIds.has(nodeId)) || consumer.fallbackAllowed !== false) {
      throw new Error(`semantic_authority_consumer_invalid_${consumer.stage}`);
    }
  }

  assertRuntimeSchemaDescriptor(graph.publicReportRecordSchema, [
    "role", "repositoryRelativePath", "pathIdentity", "cardinality", "semanticDigestRequired",
    "byteDigestRequired",
  ], "semantic_authority_public_report_schema");
  if (!Array.isArray(graph.publicReportRegistry) || graph.publicReportRegistry.length !== 4) {
    throw new Error("semantic_authority_public_report_count_mismatch");
  }
  assertSameStringSet(
    graph.publicReportRegistry.map((record) => record?.role),
    ["remediation_summary", "merge_readiness", "current_integrity_restatement", "current_state_index"],
    "semantic_authority_public_report_role_mismatch",
  );
  for (const report of graph.publicReportRegistry) {
    assertExactFields(report, graph.publicReportRecordSchema.exactFields, `semantic_authority_report_${report.role}`);
    assertRepositoryRelativePath(report.repositoryRelativePath, `semantic_authority_report_path_invalid_${report.role}`);
    if (report.cardinality !== "EXACTLY_ONE"
        || report.semanticDigestRequired !== true
        || report.byteDigestRequired !== true) {
      throw new Error(`semantic_authority_report_binding_invalid_${report.role}`);
    }
  }

  validateAuthorityCurrentDefinitions(document);
  return nodeIds;
}

function validateAuthorityCurrentDefinitions(document) {
  const index = document.currentStateIndexV0_3;
  assertPlainObject(index, "semantic_current_index_definition_must_be_object");
  if (index.schemaVersion !== "m2-v2-current-state-index-v0.3"
      || index.status !== "PROPOSED_NOT_CURRENT"
      || index.unknownFieldsRejected !== true) {
    throw new Error("semantic_current_index_definition_invalid");
  }
  assertExactArray(index.exactFields, [
    "schemaVersion", "status", "classification", "updatedAt", "sourceExactHead",
    "historicalV2B8Decision", "currentDecision", "currentDecisionComputation", "full160Authorized",
    "modelTrainingAuthorized", "nextDevelopmentReadiness", "currentAuthority", "supersession",
    "historicalArtifacts", "entries", "unchangedBoundaries", "indexDigestSha256",
  ], "semantic_current_index_exact_fields_invalid");
  assertExactArray(index.currentAuthorityExactFields, [
    "graphDigestSha256", "trackedCoreCommitmentPath", "trackedCoreCommitmentDigestSha256",
    "currentRestatementPath", "currentRestatementDigestSha256", "publicReportBindings",
    "promotionReceiptDigestSha256",
  ], "semantic_current_index_authority_fields_invalid");
  assertRuntimeSchemaDescriptor(index.publicReportBindingSchema, [
    "role", "repositoryRelativePath", "pathIdentityDigestSha256", "semanticDigestSha256",
    "byteDigestSha256",
  ], "semantic_current_index_report_binding_schema");

  const restatement = document.integrityRestatementV0_4;
  assertPlainObject(restatement, "semantic_restatement_definition_must_be_object");
  if (restatement.schema !== "m2.v2.canary-v3.1-integrity-restatement-public.v0.4"
      || restatement.status !== "PROPOSED_NOT_CURRENT"
      || restatement.unknownFieldsRejected !== true) {
    throw new Error("semantic_restatement_definition_invalid");
  }
  assertExactArray(restatement.exactFields, [
    "schema", "status", "classification", "sourceExactHead", "historicalDecision",
    "historicalEvaluationVerified", "currentRestatedDecision", "currentRestatementVerified",
    "currentDecisionComputation", "authorityBindings", "supersession", "unchangedBoundaries",
    "restatementDigestSha256",
  ], "semantic_restatement_exact_fields_invalid");
  assertExactArray(restatement.authorityBindingsExactFields, [
    "graphDigestSha256", "derivedEvaluationDigestSha256", "executionContractDigestSha256",
    "eventSemanticsProfileDigestSha256", "trackedCoreCommitmentDigestSha256",
  ], "semantic_restatement_authority_fields_invalid");
  assertRuntimeSchemaDescriptor(document.currentDecisionComputation, [
    "evaluationDigestSha256", "arithmeticInputsDigestSha256", "semanticInputsDigestSha256",
    "thresholdProfileDigestSha256", "arithmeticRecomputed", "semanticGatesRecomputed",
    "recomputedDecision", "decisionRuleDigestSha256",
  ], "semantic_current_decision_computation");
  if (document.currentDecisionComputation.currentDecisionMustEqualRecomputedDecision !== true
      || document.currentDecisionComputation.historicalDecisionMayBeCopiedAsCurrent !== false
      || document.currentDecisionComputation.callerSuppliedDecisionTrusted !== false) {
    throw new Error("semantic_current_decision_computation_policy_invalid");
  }
}

function validateReadonlySemanticClosure(document, authorityNodeIds) {
  assertExactFields(document, [
    "schema", "status", "classification", "sourceExactHead", "findingIds", "lineage", "commands",
    "claim", "commandSeparation", "allowedVerifyEffects", "forbiddenVerifyEffects", "scopeDerivation",
    "selfExclusions", "proof", "failureMode", "verificationScope", "authorization",
  ], "semantic_readonly_document");
  if (document.schema !== "m2.v2.verifier-readonly-contract.v0.2") {
    throw new Error("semantic_readonly_schema_mismatch");
  }
  assertExactArray(document.commands, [
    "m2:v2:v2b5:verify", "m2:v2:v2b6:verify", "m2:v2:v2b7:verify", "m2:v2:v2b8:verify",
  ], "semantic_readonly_commands_mismatch");
  const scope = document.scopeDerivation;
  assertExactFields(scope, [
    "sourceSchema", "manualSubsetAllowed", "exactRoleAndMemberSetRequired", "roleToScopeMemberMapping",
    "mappingRecordExactFields", "authorityRoleSetMustEqualCanonicalGraphNodeIdSet",
    "scopeMemberClassesMustBeNonemptyUniqueKnownValues", "everyRequiredRoleClassMustBeCovered",
    "mappingUnknownFieldsRejected", "requiredRoleClasses", "requiredObservations", "scopeMemberRecord",
    "metadataSchemas", "linkPolicy", "unknownOrUnobservableMetadata",
  ], "semantic_readonly_scope");
  if (scope.sourceSchema !== "m2.v2.canonical-authority-graph.v0.3"
      || scope.manualSubsetAllowed !== false
      || scope.exactRoleAndMemberSetRequired !== true
      || scope.authorityRoleSetMustEqualCanonicalGraphNodeIdSet !== true
      || scope.scopeMemberClassesMustBeNonemptyUniqueKnownValues !== true
      || scope.everyRequiredRoleClassMustBeCovered !== true
      || scope.mappingUnknownFieldsRejected !== true) {
    throw new Error("semantic_readonly_scope_policy_invalid");
  }
  assertExactArray(scope.mappingRecordExactFields, [
    "authorityRole", "scopeMemberClasses", "cardinality",
  ], "semantic_readonly_mapping_fields_invalid");
  if (!Array.isArray(scope.roleToScopeMemberMapping) || scope.roleToScopeMemberMapping.length !== 15) {
    throw new Error("semantic_readonly_role_mapping_count_mismatch");
  }
  assertSameStringSet(
    scope.roleToScopeMemberMapping.map((mapping) => mapping?.authorityRole),
    [...authorityNodeIds],
    "semantic_readonly_authority_role_set_mismatch",
  );
  const expectedRoleClasses = [
    "transaction_roots", "current_pointer", "public_reports", "current_state_index",
    "current_integrity_restatement", "required_v0_2_and_vnext_paths", "tracked_verifier_sources",
    "private_derived_members", "user_repository_refs", "provider_counter",
  ];
  assertSameStringSet(scope.requiredRoleClasses, expectedRoleClasses, "semantic_readonly_required_role_classes_mismatch");
  const coveredRoleClasses = new Set();
  for (const mapping of scope.roleToScopeMemberMapping) {
    assertExactFields(mapping, scope.mappingRecordExactFields, `semantic_readonly_mapping_${String(mapping.authorityRole)}`);
    assertUniqueStringArray(mapping.scopeMemberClasses, `semantic_readonly_mapping_classes_invalid_${mapping.authorityRole}`);
    for (const roleClass of mapping.scopeMemberClasses) {
      if (!expectedRoleClasses.includes(roleClass)) {
        throw new Error(`semantic_readonly_mapping_class_unknown_${roleClass}`);
      }
      coveredRoleClasses.add(roleClass);
    }
    assertNonemptyString(mapping.cardinality, `semantic_readonly_mapping_cardinality_invalid_${mapping.authorityRole}`);
  }
  if (sha256(stableStringify(scope.roleToScopeMemberMapping)) !== EXPECTED_READONLY_ROLE_MAPPINGS_SHA256) {
    throw new Error("semantic_readonly_role_mapping_semantics_mismatch");
  }
  assertSameStringSet(
    [...coveredRoleClasses],
    expectedRoleClasses,
    "semantic_readonly_mapping_class_coverage_mismatch",
  );
  const currentIndexMapping = scope.roleToScopeMemberMapping.find(
    (mapping) => mapping.authorityRole === "current_state_index",
  );
  if (!currentIndexMapping?.scopeMemberClasses.includes("current_pointer")) {
    throw new Error("semantic_readonly_current_pointer_not_bound");
  }

  const proof = document.proof;
  assertExactFields(proof, [
    "schema", "hashAlgorithm", "canonicalPathForm", "totalVerifierInvocations", "snapshotIds",
    "requiredSequence", "passRule", "proofOutputMayEnterOwnScope", "providerRequestDeltaRequired",
    "databaseConnectionsRequired",
  ], "semantic_readonly_proof");
  if (proof.schema !== "m2.v2.verifier-readonly-proof-public.v0.2"
      || proof.totalVerifierInvocations !== 2
      || proof.proofOutputMayEnterOwnScope !== false
      || proof.providerRequestDeltaRequired !== 0
      || proof.databaseConnectionsRequired !== 0) {
    throw new Error("semantic_readonly_proof_policy_invalid");
  }
  assertExactArray(proof.snapshotIds, [
    "before", "after_invocation_1", "after_invocation_2",
  ], "semantic_readonly_snapshot_ids_mismatch");
  assertExactArray(proof.requiredSequence, [
    "derive_exact_scope_from_authority_graph", "declare_exact_self_exclusions", "snapshot_before",
    "invoke_verifier_1", "snapshot_after_invocation_1", "invoke_verifier_2",
    "snapshot_after_invocation_2", "compare_scope_content_metadata_path_ref_and_counter",
  ], "semantic_readonly_sequence_mismatch");
}

function validateMigrationSemanticClosure(document) {
  assertExactFields(document, [
    "schema", "status", "classification", "sourceExactHead", "findingIds", "lineage",
    "formatCompatibility", "v0_3Package", "pathIdentityPolicy", "identityReceipt",
    "nativeExecutionMatrix", "nativeExecutionMatrixRecordExactFields", "builderAndRestorer",
    "verificationScope", "authorization",
  ], "semantic_migration_document");
  if (document.schema !== "m2.v2.migration-set-integrity-public.v0.3") {
    throw new Error("semantic_migration_schema_mismatch");
  }
  if (!Array.isArray(document.formatCompatibility) || document.formatCompatibility.length !== 3) {
    throw new Error("semantic_migration_format_count_mismatch");
  }
  assertSameStringSet(
    document.formatCompatibility.map((record) => record?.format),
    ["v0.1", "v0.2", "v0.3"],
    "semantic_migration_format_set_mismatch",
  );
  for (const record of document.formatCompatibility) {
    assertExactFields(record, [
      "format", "inspectAllowed", "repackageToV0_3Allowed", "directRestoreAllowed",
      "autoPromotionAllowed", "reason",
    ], `semantic_migration_format_${record.format}`);
    if (record.inspectAllowed !== true || record.repackageToV0_3Allowed !== true
        || (record.format === "v0.3") !== record.directRestoreAllowed
        || (record.format === "v0.3") !== record.autoPromotionAllowed) {
      throw new Error(`semantic_migration_format_policy_invalid_${record.format}`);
    }
  }

  const packageDefinition = document.v0_3Package;
  assertPlainObject(packageDefinition, "semantic_migration_package_must_be_object");
  if (packageDefinition.schema !== "m2.v2.private-state-migration-package.v0.3"
      || packageDefinition.unknownManifestFieldsRejected !== true) {
    throw new Error("semantic_migration_package_schema_invalid");
  }
  assertExactArray(packageDefinition.manifestExactFields, [
    "schema", "packageId", "sourceExactHead", "policyDigestSha256", "archiveMembers",
    "payloadRoles", "identityReceiptDigestSha256", "createdAt", "manifestDigestSha256",
  ], "semantic_migration_manifest_fields_invalid");
  assertRuntimeSchemaDescriptor(packageDefinition.archiveMemberRecord, [
    "canonicalPath", "memberKind", "payloadRole", "compressionMethod", "crc32",
    "compressedBytes", "uncompressedBytes", "contentSha256", "unixMode",
  ], "semantic_migration_archive_member_schema");
  assertRuntimeSchemaDescriptor(packageDefinition.payloadRoleRecord, [
    "roleId", "required", "minimumCardinality", "maximumCardinality", "memberPaths",
  ], "semantic_migration_payload_role_schema");
  const exactSet = packageDefinition.wholeArchiveExactSet;
  assertExactFields(exactSet, [
    "manifestExpectedMembersEqualsArchiveActualMembers", "payloadAndControlMembersIncluded",
    "directoryEntriesIncludedWhenPresent", "extraControlMemberAllowed", "missingMemberAllowed",
    "temporaryResidueAllowed",
  ], "semantic_migration_archive_exact_set");
  if (exactSet.manifestExpectedMembersEqualsArchiveActualMembers !== true
      || exactSet.payloadAndControlMembersIncluded !== true
      || exactSet.directoryEntriesIncludedWhenPresent !== true
      || exactSet.extraControlMemberAllowed !== false
      || exactSet.missingMemberAllowed !== false
      || exactSet.temporaryResidueAllowed !== false) {
    throw new Error("semantic_migration_archive_exact_set_invalid");
  }
  const zip = packageDefinition.zipStructurePolicy;
  assertPlainObject(zip, "semantic_migration_zip_policy_must_be_object");
  for (const field of [
    "singleEndOfCentralDirectoryRequired", "centralDirectoryAndLocalHeaderExactAgreement",
    "duplicateRawFilenameBytesRejected", "utf8FlagRequired", "unicodePathExtraFieldMustMatchUtf8Name",
    "crc32MustMatchInflatedBytes", "contentSha256MustMatchInflatedBytes",
    "externalAttributesMustMatchDeclaredMemberKindAndUnixMode", "encryptedOrStrongEncryptionFlagsRejected",
    "multiDiskArchiveRejected",
  ]) {
    if (zip[field] !== true) throw new Error(`semantic_migration_zip_required_${field}`);
  }
  for (const field of [
    "archivePrefixBytesAllowed", "archiveTrailingBytesAllowed", "localRecordDataRangesMayOverlap",
    "legacyCodePageFilenameAllowed", "archiveCommentAllowed",
  ]) {
    if (zip[field] !== false) throw new Error(`semantic_migration_zip_forbidden_${field}`);
  }
  assertExactArray(zip.supportedCompressionMethods, ["STORE", "DEFLATE"], "semantic_migration_zip_methods_invalid");

  const identity = document.identityReceipt;
  assertPlainObject(identity, "semantic_migration_identity_receipt_must_be_object");
  if (identity.schema !== "m2.v2.migration-path-identity-receipt.private.v0.1"
      || identity.absolutePathsPersisted !== false
      || identity.keysOrSecretsPersisted !== false
      || identity.unknownFieldsRejected !== true) {
    throw new Error("semantic_migration_identity_receipt_policy_invalid");
  }
  assertExactArray(identity.exactFields, [
    "schema", "policyDigestSha256", "sourceIdentityDigestSha256", "destinationIdentityDigestSha256",
    "ancestorSetDigestSha256", "evidenceSetDigestSha256", "platformEvidence",
    "archiveMemberSetDigestSha256", "manifestDigestSha256", "platform", "result",
  ], "semantic_migration_identity_receipt_fields_invalid");
  assertRuntimeSchemaDescriptor(identity.platformEvidenceSchema, [
    "recordType", "records",
  ], "semantic_migration_platform_evidence_schema");
  if (identity.platformEvidenceSchema.recordTypeMustMatchReceiptPlatform !== true
      || identity.platformEvidenceSchema.recordsMustUseMatchingEvidenceRecordSchema !== true) {
    throw new Error("semantic_migration_platform_evidence_binding_invalid");
  }
  assertRuntimeSchemaDescriptor(identity.windowsEvidenceRecord, [
    "stage", "endpointRole", "ancestorIndex", "attributes", "reparseTag", "volumeSerialNumber",
    "fileId128", "finalPathDigestSha256",
  ], "semantic_migration_windows_evidence_schema");
  assertRuntimeSchemaDescriptor(identity.posixEvidenceRecord, [
    "stage", "endpointRole", "ancestorIndex", "device", "inode", "mode", "mountId",
    "resolvedPathDigestSha256", "noFollowVerified",
  ], "semantic_migration_posix_evidence_schema");
  if (identity.evidenceSetRules.everyAncestorAndFinalObjectAtEveryApplicableStage !== true
      || identity.evidenceSetRules.prePostIdentityTupleExactEqualityRequired !== true
      || identity.evidenceSetRules.platformEvidenceRecordsPersistedInReceipt !== true
      || identity.evidenceSetRules.evidenceSetDigestMustMatchCanonicalPlatformEvidence !== true
      || identity.evidenceSetRules.evidenceSetDigestIncludedInAncestorSetDigestSha256 !== true) {
    throw new Error("semantic_migration_platform_evidence_rules_invalid");
  }

  assertExactArray(document.nativeExecutionMatrixRecordExactFields, [
    "platform", "runner", "requiredCases", "missingDisposition",
  ], "semantic_migration_native_matrix_fields_invalid");
  if (!Array.isArray(document.nativeExecutionMatrix) || document.nativeExecutionMatrix.length !== 2) {
    throw new Error("semantic_migration_native_matrix_count_mismatch");
  }
  assertSameStringSet(
    document.nativeExecutionMatrix.map((record) => record?.platform),
    ["WINDOWS_POWERSHELL_5_1_NATIVE", "LINUX_NATIVE"],
    "semantic_migration_native_platforms_mismatch",
  );
  for (const record of document.nativeExecutionMatrix) {
    assertExactFields(record, document.nativeExecutionMatrixRecordExactFields, `semantic_migration_native_${record.platform}`);
    assertUniqueStringArray(record.requiredCases, `semantic_migration_native_cases_invalid_${record.platform}`);
    if (record.missingDisposition !== "FAIL") {
      throw new Error(`semantic_migration_native_missing_disposition_invalid_${record.platform}`);
    }
  }
  const windows = document.nativeExecutionMatrix.find((record) => record.platform === "WINDOWS_POWERSHELL_5_1_NATIVE");
  const linux = document.nativeExecutionMatrix.find((record) => record.platform === "LINUX_NATIVE");
  assertSameStringSet(windows.requiredCases, [
    "reparse_tag", "junction", "ancestor_alias", "short_name", "case_alias", "unc_alias",
    "replace_after_enumeration", "distinct_pass",
  ], "semantic_migration_windows_cases_mismatch");
  assertSameStringSet(linux.requiredCases, [
    "symlink", "ancestor_symlink", "bind_mount_alias", "mount_id_drift", "replace_after_enumeration",
    "no_follow", "distinct_pass",
  ], "semantic_migration_linux_cases_mismatch");
}

function validateSafeCacheSemanticClosure(document) {
  assertExactFields(document, [
    "schema", "status", "classification", "sourceExactHead", "findingIds", "lineage", "entrySchema",
    "profiles", "commonProjectionPolicy", "forbiddenContent", "offlineMigration", "migrationReceipt",
    "verificationScope", "authorization",
  ], "semantic_safe_cache_document");
  if (document.schema !== "m2.v2.safe-cache-projection-public.v0.3") {
    throw new Error("semantic_safe_cache_schema_mismatch");
  }
  const entry = document.entrySchema;
  if (entry.schema !== "m2.v2.v2b6-safe-cache-private.v0.3"
      || entry.receiptReferenceOnly !== true
      || entry.rawReceiptOrProviderObjectAllowed !== false) {
    throw new Error("semantic_safe_cache_entry_policy_invalid");
  }
  assertRuntimeSchemaDescriptor(entry, [
    "schema", "physicalRequestIdentityDigestSha256", "receiptDigestSha256", "projectionProfile",
    "projectionValue", "projectionDigestSha256", "replayable", "sourceContractDigestSha256",
  ], "semantic_safe_cache_entry_schema");
  if (!Array.isArray(document.profiles) || document.profiles.length !== 6) {
    throw new Error("semantic_safe_cache_profile_count_mismatch");
  }
  const profiles = new Map(document.profiles.map((profile) => [profile.profile, profile]));
  assertSameStringSet([...profiles.keys()], [
    "capability_e0_ok/v1", "capability_e1_minimal/v1", "capability_e2_entity/v1",
    "capability_e3_claims/v1", "extraction_full_v0.2", "no_replay/v1",
  ], "semantic_safe_cache_profile_set_mismatch");
  const e2 = profiles.get("capability_e2_entity/v1");
  assertExactFields(e2, [
    "profile", "phases", "exactTopLevelKeys", "entityResolutionExactKeys", "schemaVersionExactValue",
    "resolutionStatusValues", "confidenceClassValues", "digestFieldsFormat", "limitationsExactRecord",
    "unknownPolicy",
  ], "semantic_safe_cache_e2_profile");
  assertExactArray(e2.exactTopLevelKeys, [
    "schemaVersion", "entityResolution", "limitations",
  ], "semantic_safe_cache_e2_top_fields_invalid");
  assertExactArray(e2.entityResolutionExactKeys, [
    "queryIdentityDigestSha256", "canonicalEntityIdentityDigestSha256", "resolutionStatus",
    "confidenceClass",
  ], "semantic_safe_cache_e2_entity_fields_invalid");
  assertRuntimeSchemaDescriptor(e2.limitationsExactRecord, [
    "code", "scope", "detailSafe",
  ], "semantic_safe_cache_e2_limitation_schema");
  if (e2.unknownPolicy !== "REJECT") throw new Error("semantic_safe_cache_e2_unknown_policy_invalid");

  const e3 = profiles.get("capability_e3_claims/v1");
  assertExactFields(e3, [
    "profile", "phases", "exactTopLevelKeys", "claimExactKeys", "claimFieldPolicy",
    "structuredValueVariants", "structuredValueUnknownFieldsRejected", "contradictionRecord",
    "limitationsExactRecord", "unknownPolicy",
  ], "semantic_safe_cache_e3_profile");
  assertExactArray(e3.exactTopLevelKeys, [
    "claims", "contradictions", "limitations",
  ], "semantic_safe_cache_e3_top_fields_invalid");
  assertExactArray(e3.claimExactKeys, [
    "claimType", "subjectIdentityDigestSha256", "predicate", "structuredValue",
    "sourceBindingDigestSha256", "limitations",
  ], "semantic_safe_cache_e3_claim_fields_invalid");
  if (!Array.isArray(e3.structuredValueVariants) || e3.structuredValueVariants.length !== 6
      || e3.structuredValueUnknownFieldsRejected !== true) {
    throw new Error("semantic_safe_cache_e3_value_variants_invalid");
  }
  assertSameStringSet(
    e3.structuredValueVariants.map((variant) => variant?.kind),
    ["NULL", "BOOLEAN", "NUMBER", "STRING", "STRING_ARRAY", "EXACT_OBJECT"],
    "semantic_safe_cache_e3_value_variant_set_mismatch",
  );
  for (const variant of e3.structuredValueVariants) {
    assertExactFields(variant, ["kind", "exactFields", "valueConstraint"], `semantic_safe_cache_e3_variant_${variant.kind}`);
    const expectedFields = variant.kind === "EXACT_OBJECT" ? ["kind", "schemaId", "value"] : ["kind", "value"];
    assertExactArray(variant.exactFields, expectedFields, `semantic_safe_cache_e3_variant_fields_invalid_${variant.kind}`);
  }
  assertRuntimeSchemaDescriptor(e3.contradictionRecord, [
    "leftClaimDigestSha256", "rightClaimDigestSha256", "relation", "limitationCodes",
  ], "semantic_safe_cache_e3_contradiction_schema");
  assertRuntimeSchemaDescriptor(e3.limitationsExactRecord, [
    "code", "scope", "detailSafe",
  ], "semantic_safe_cache_e3_limitation_schema");
  if (e3.unknownPolicy !== "REJECT") throw new Error("semantic_safe_cache_e3_unknown_policy_invalid");

  const e4 = profiles.get("extraction_full_v0.2");
  assertExactFields(e4, [
    "profile", "phases", "exactContract", "exactContractPath", "exactContractPortableSha256",
    "portableDigestNormalization", "canonicalizedBeforePersistence", "unknownPolicy",
  ], "semantic_safe_cache_e4_profile");
  if (e4.exactContract !== "m2.v2.extraction-contract.v0.2"
      || e4.exactContractPath !== "docs/technical-design/m2-v2/M2-v2-extraction-contract-v0.2.json"
      || e4.exactContractPortableSha256 !== "a8ca34642d958c7fc03753b82b8c9de6f8eb777b199f864f61a51f1815bfe4d2"
      || e4.canonicalizedBeforePersistence !== true
      || e4.unknownPolicy !== "REJECT") {
    throw new Error("semantic_safe_cache_e4_binding_invalid");
  }

  const migration = document.offlineMigration;
  if (migration.sourceFormat !== "v0.2" || migration.targetFormat !== "v0.3"
      || migration.providerFree !== true || migration.rollbackOnAnyFailure !== true
      || migration.promotionBeforeB6Allowed !== false || migration.providerRequestDeltaRequired !== 0) {
    throw new Error("semantic_safe_cache_migration_policy_invalid");
  }
  const partition = migration.partitionManifest;
  if (partition.schema !== "m2.v2.safe-cache-migration-partition.private.v0.3") {
    throw new Error("semantic_safe_cache_partition_schema_mismatch");
  }
  assertRuntimeSchemaDescriptor(partition, [
    "schema", "sourceCacheDigestSha256", "sourceEntrySetDigestSha256", "outcomes",
    "outcomeSetDigestSha256",
  ], "semantic_safe_cache_partition_schema");
  assertExactArray(partition.outcomeRecordExactFields, [
    "sourceEntryDigestSha256", "sourcePhysicalRequestIdentityDigestSha256", "outcome",
    "projectionProfile", "targetEntryDigestSha256", "quarantineRecordDigestSha256", "reasonCode",
  ], "semantic_safe_cache_partition_outcome_fields_invalid");
  if (partition.everySourceEntryExactlyOnce !== true
      || partition.sourceEntrySetExactEqualityRequired !== true
      || partition.oppositeOutcomeFieldsMustBeNull !== true
      || partition.unknownFieldsRejected !== true) {
    throw new Error("semantic_safe_cache_partition_policy_invalid");
  }
  const quarantine = migration.quarantineRecord;
  if (quarantine.schema !== "m2.v2.safe-cache-quarantine-record.private.v0.3") {
    throw new Error("semantic_safe_cache_quarantine_schema_mismatch");
  }
  assertRuntimeSchemaDescriptor(quarantine, [
    "schema", "sourceEntryDigestSha256", "reasonCode", "detectedProfile",
    "safeMetadataDigestSha256", "rawContentPersisted", "recordDigestSha256",
  ], "semantic_safe_cache_quarantine_schema");
  if (quarantine.rawContentPersistedRequired !== false || quarantine.unknownFieldsRejected !== true) {
    throw new Error("semantic_safe_cache_quarantine_policy_invalid");
  }
  const receipt = document.migrationReceipt;
  if (receipt.schema !== "m2.v2.safe-cache-migration-receipt.private.v0.3"
      || receipt.unknownFieldsRejected !== true || receipt.rawProviderBytesPersisted !== false) {
    throw new Error("semantic_safe_cache_receipt_policy_invalid");
  }
  assertExactArray(receipt.exactFields, [
    "schema", "sourceCacheDigestSha256", "targetCacheDigestSha256", "profileRegistryDigestSha256",
    "sourceEntryCount", "projectedEntryCount", "quarantinedEntryCount", "quarantineDigestSha256",
    "partitionManifestDigestSha256", "sourceEntrySetDigestSha256", "outcomeSetDigestSha256",
    "providerRequestDelta", "result",
  ], "semantic_safe_cache_receipt_fields_invalid");
}

function validateProviderSemanticClosure(document) {
  assertExactFields(document, [
    "schema", "status", "classification", "sourceExactHead", "findingIds", "lineage",
    "sinkRegistrySchema", "sinkRegistry", "routeRegistrySchema", "routeRegistry",
    "registryClosureRules", "oneShotCapability", "endpointAndRetentionRules", "testTransportPolicy",
    "futureProviderHardGate", "verificationScope", "authorization",
  ], "semantic_provider_document");
  if (document.schema !== "m2.v2.provider-transport-retention-public.v0.2") {
    throw new Error("semantic_provider_schema_mismatch");
  }
  assertRuntimeSchemaDescriptor(document.sinkRegistrySchema, [
    "sinkId", "sourcePath", "symbol", "fetchExpression", "status", "allowedRouteIds",
  ], "semantic_provider_sink_schema");
  const expectedSinkIds = [
    "sink_openai_compatible_canary_execute", "sink_v2b2_dispatch_relay_response",
    "sink_v2b4_dispatch_relay_response", "sink_v2b5_relay_extraction",
    "sink_v2b5_tavily_search", "sink_v2b6_relay_request",
  ];
  if (!Array.isArray(document.sinkRegistry) || document.sinkRegistry.length !== 6) {
    throw new Error("semantic_provider_sink_count_mismatch");
  }
  assertSameStringSet(document.sinkRegistry.map((sink) => sink?.sinkId), expectedSinkIds, "semantic_provider_sink_set_mismatch");
  const sinks = new Map();
  for (const sink of document.sinkRegistry) {
    assertExactFields(sink, document.sinkRegistrySchema.exactFields, `semantic_provider_sink_${sink.sinkId}`);
    assertRepositoryRelativePath(sink.sourcePath, `semantic_provider_sink_path_invalid_${sink.sinkId}`);
    assertUniqueStringArray(sink.allowedRouteIds, `semantic_provider_sink_routes_invalid_${sink.sinkId}`);
    if (!document.sinkRegistrySchema.statusEnum.includes(sink.status)) {
      throw new Error(`semantic_provider_sink_status_invalid_${sink.sinkId}`);
    }
    sinks.set(sink.sinkId, sink);
  }
  if (sha256(stableStringify(document.sinkRegistry)) !== EXPECTED_PROVIDER_SINKS_SHA256) {
    throw new Error("semantic_provider_sink_semantics_mismatch");
  }
  const statuses = document.sinkRegistry.map((sink) => sink.status);
  if (statuses.filter((status) => status === "ACTIVE_CAPABILITY_REQUIRED").length !== 3
      || statuses.filter((status) => status === "RETIRED_HARD_FAIL").length !== 3) {
    throw new Error("semantic_provider_sink_status_count_mismatch");
  }

  assertRuntimeSchemaDescriptor(document.routeRegistrySchema, [
    "routeId", "entrypoints", "sinkIds", "status",
  ], "semantic_provider_route_schema");
  if (!Array.isArray(document.routeRegistry) || document.routeRegistry.length !== 11
      || new Set(document.routeRegistry.map((route) => route?.routeId)).size !== 11) {
    throw new Error("semantic_provider_route_count_or_identity_mismatch");
  }
  const referencedSinkIds = new Set();
  const routeIds = new Set(document.routeRegistry.map((route) => route.routeId));
  for (const route of document.routeRegistry) {
    assertExactFields(route, document.routeRegistrySchema.exactFields, `semantic_provider_route_${route.routeId}`);
    assertUniqueStringArray(route.entrypoints, `semantic_provider_route_entrypoints_invalid_${route.routeId}`);
    assertUniqueStringArray(route.sinkIds, `semantic_provider_route_sinks_invalid_${route.routeId}`);
    if (!document.routeRegistrySchema.statusEnum.includes(route.status)) {
      throw new Error(`semantic_provider_route_status_invalid_${route.routeId}`);
    }
    for (const sinkId of route.sinkIds) {
      const sink = sinks.get(sinkId);
      if (!sink) throw new Error(`semantic_provider_route_sink_unknown_${sinkId}`);
      if (route.status === "ACTIVE_CAPABILITY_REQUIRED" && sink.status !== "ACTIVE_CAPABILITY_REQUIRED") {
        throw new Error(`semantic_provider_active_route_retired_sink_${route.routeId}`);
      }
      if (!sink.allowedRouteIds.includes(route.routeId)) {
        throw new Error(`semantic_provider_sink_route_reverse_binding_missing_${sinkId}_${route.routeId}`);
      }
      referencedSinkIds.add(sinkId);
    }
  }
  if (sha256(stableStringify(document.routeRegistry)) !== EXPECTED_PROVIDER_ROUTES_SHA256) {
    throw new Error("semantic_provider_route_semantics_mismatch");
  }
  assertSameStringSet([...referencedSinkIds], expectedSinkIds, "semantic_provider_unreferenced_sink");
  for (const sink of document.sinkRegistry) {
    if (sink.allowedRouteIds.some((routeId) => !routeIds.has(routeId))) {
      throw new Error(`semantic_provider_sink_route_unknown_${sink.sinkId}`);
    }
    const reverseRoutes = document.routeRegistry
      .filter((route) => route.sinkIds.includes(sink.sinkId))
      .map((route) => route.routeId);
    assertSameStringSet(sink.allowedRouteIds, reverseRoutes, `semantic_provider_bidirectional_mismatch_${sink.sinkId}`);
  }
  const closure = document.registryClosureRules;
  assertExactFields(closure, [
    "exactSinkCount", "sourceScanCovers", "anyUnregisteredFetchOrConnectSink",
    "anyActiveRouteReferencingRetiredSink", "anyRetiredRouteReachingFetchOrConnect",
    "anyActiveSinkWithoutCapabilityConsumption", "routeAndSinkRegistriesMustBeBidirectionallyConsistent",
  ], "semantic_provider_registry_closure");
  if (closure.exactSinkCount !== 6
      || closure.anyUnregisteredFetchOrConnectSink !== "FAIL_CLOSED"
      || closure.anyActiveRouteReferencingRetiredSink !== "FAIL_CLOSED"
      || closure.anyRetiredRouteReachingFetchOrConnect !== "FAIL_CLOSED"
      || closure.anyActiveSinkWithoutCapabilityConsumption !== "FAIL_CLOSED"
      || closure.routeAndSinkRegistriesMustBeBidirectionallyConsistent !== true) {
    throw new Error("semantic_provider_registry_closure_invalid");
  }
  assertSameStringSet(closure.sourceScanCovers, [
    "globalThis.fetch", "fetchImpl", "this.fetchImpl", "http_request", "https_request",
    "net_connect", "tls_connect",
  ], "semantic_provider_source_scan_mismatch");
  const capability = document.oneShotCapability;
  assertExactFields(capability, [
    "schema", "serializationAllowed", "ownership", "forgableFromPlainObject", "singleUse",
    "issuedImmediatelyBeforeSink", "consumedByLowestSink", "scopeBindings", "sinkReinspection",
    "reject", "rejectionOccursBeforeFetchOrConnect",
  ], "semantic_provider_capability");
  if (capability.schema !== "m2.v2.provider-transport-capability.v0.2"
      || capability.serializationAllowed !== false
      || capability.forgableFromPlainObject !== false
      || capability.singleUse !== true
      || capability.issuedImmediatelyBeforeSink !== true
      || capability.consumedByLowestSink !== true
      || capability.rejectionOccursBeforeFetchOrConnect !== true
      || !capability.scopeBindings.includes("routeId")
      || !capability.scopeBindings.includes("sinkId")) {
    throw new Error("semantic_provider_capability_policy_invalid");
  }
}

function validateEventSemanticClosure(document) {
  assertExactFields(document, [
    "schema", "status", "classification", "sourceExactHead", "findingIds", "lineage",
    "canonicalEventTuple", "stageStatusCompatibilityTable", "stageStatusCompatibilityRule",
    "dateBindingRules", "stageProgressionTableSchema", "stageProgressionTable",
    "stageProgressionDefaults", "conflictApplicability", "eventEvaluationV0_4",
    "restatementBinding", "offlinePolicy", "verificationScope", "authorization",
  ], "semantic_event_document");
  if (document.schema !== "m2.v2.event-time-clause-binding-public.v0.4") {
    throw new Error("semantic_event_schema_mismatch");
  }
  const tuple = document.canonicalEventTuple;
  if (tuple.schema !== "m2.v2.canonical-event-tuple.v0.1"
      || tuple.unknownFieldsRejected !== true) {
    throw new Error("semantic_event_tuple_schema_mismatch");
  }
  assertExactArray(tuple.exactFields, [
    "tupleVersion", "parserProfileVersion", "sourceDocumentIdSafe", "sentenceSpan", "clauseSpan",
    "predicateSpan", "dateSpan", "eventPredicate", "eventRole", "eventDate", "dateRole",
    "organizationIdentity", "productionIdentity", "editionIdentity", "stage", "status",
    "subjectIdentity", "ambiguity", "limitation", "sourceDigest", "tupleDigest",
  ], "semantic_event_tuple_fields_invalid");
  assertRuntimeSchemaDescriptor(tuple.spanSchema, [
    "start", "end", "digestSha256",
  ], "semantic_event_span_schema");
  assertRuntimeSchemaDescriptor(tuple.eventPredicateSchema, [
    "family", "kind",
  ], "semantic_event_predicate_schema");
  if (tuple.eventPredicateSchema.stageOrStatusAllowedInsidePredicate !== false
      || tuple.eventPredicateSchema.canonicalStageLocation !== "tuple.stage"
      || tuple.eventPredicateSchema.canonicalStatusLocation !== "tuple.status") {
    throw new Error("semantic_event_predicate_stage_status_binding_invalid");
  }
  assertRuntimeSchemaDescriptor(tuple.identitySchema, [
    "status", "canonicalIdentityDigestSha256",
  ], "semantic_event_identity_schema");
  assertRuntimeSchemaDescriptor(tuple.eventDateSchema, [
    "value", "intervalStart", "intervalEnd", "precision", "timezoneBasis",
  ], "semantic_event_date_schema");
  assertExactArray(tuple.eventDateSchema.precisionEnum, [
    "YEAR", "MONTH", "DAY", "INSTANT", "INTERVAL", "UNKNOWN",
  ], "semantic_event_date_precision_mismatch");
  assertExactArray(tuple.eventDateSchema.timezoneBasisEnum, [
    "UTC", "SOURCE_EXPLICIT_OFFSET", "CALENDAR_DATE_NO_TIMEZONE", "UNKNOWN",
  ], "semantic_event_timezone_basis_mismatch");
  assertExactArray(tuple.eventDateSchema.nullabilityRules, [
    "UNKNOWN_requires_value_intervalStart_intervalEnd_null_and_timezoneBasis_UNKNOWN",
    "YEAR_MONTH_DAY_require_value_and_closed_calendar_interval_and_CALENDAR_DATE_NO_TIMEZONE",
    "INSTANT_requires_rfc3339_value_equal_intervalStart_equal_intervalEnd_and_explicit_timezone",
    "INTERVAL_requires_nonnull_intervalStart_intervalEnd_with_start_not_after_end",
  ], "semantic_event_date_interval_rules_mismatch");
  if (tuple.eventDateSchema.timezoneInferenceAllowed !== false
      || tuple.dateSpanConsistency.knownEventDateRequiresNonNullDateSpan !== true
      || tuple.dateSpanConsistency.unknownEventDateRequiresNullDateSpan !== true
      || tuple.dateSpanConsistency.dateSpanDigestMustBindEventDateLexeme !== true) {
    throw new Error("semantic_event_date_binding_policy_invalid");
  }
  assertRuntimeSchemaDescriptor(tuple.ambiguitySchema, [
    "status", "codes", "evaluable",
  ], "semantic_event_ambiguity_schema");
  assertRuntimeSchemaDescriptor(tuple.limitationRecordSchema, [
    "code", "severity", "detailDigestSha256",
  ], "semantic_event_limitation_schema");
  if (!tuple.ambiguitySchema.codeEnum.includes("CROSS_SENTENCE_UNSUPPORTED")
      || !tuple.limitationRecordSchema.codeEnum.includes("CROSS_SENTENCE_UNSUPPORTED")) {
    throw new Error("semantic_event_cross_sentence_code_missing");
  }

  const statusRule = document.stageStatusCompatibilityRule;
  assertExactArray(statusRule.rowSchemaExactFields, [
    "status", "allowedStages", "allowedEventRoles",
  ], "semantic_event_status_row_fields_invalid");
  if (!Array.isArray(document.stageStatusCompatibilityTable)
      || document.stageStatusCompatibilityTable.length !== 6
      || statusRule.unknownFieldsRejected !== true
      || statusRule.exactlyOneRowPerStatus !== true
      || statusRule.unlistedCombination !== "FAIL_CLOSED") {
    throw new Error("semantic_event_status_table_policy_invalid");
  }
  assertSameStringSet(
    document.stageStatusCompatibilityTable.map((row) => row?.status),
    tuple.statusSchema.values,
    "semantic_event_status_table_coverage_mismatch",
  );
  for (const row of document.stageStatusCompatibilityTable) {
    assertExactFields(row, statusRule.rowSchemaExactFields, `semantic_event_status_row_${row.status}`);
    assertUniqueStringArray(row.allowedStages, `semantic_event_status_stages_invalid_${row.status}`);
    assertUniqueStringArray(row.allowedEventRoles, `semantic_event_status_roles_invalid_${row.status}`);
    if (row.allowedStages.some((value) => !tuple.stageSchema.values.includes(value))
        || row.allowedEventRoles.some((value) => !tuple.eventRoleSchema.values.includes(value))) {
      throw new Error(`semantic_event_status_value_unknown_${row.status}`);
    }
  }
  const dateBinding = document.dateBindingRules;
  assertExactFields(dateBinding, [
    "sameEventClauseAndPredicateRequired", "borrowDateFromOtherEventInSentenceAllowed",
    "coordinationAndPunctuationResolvedExplicitly", "crossSentenceBindingSupported",
    "crossSentenceInputAction", "noDateResult", "ambiguousDateResult", "firstDateFallbackAllowed",
    "semanticDistinctions", "spanDigestRecomputed", "spanTamperAction",
  ], "semantic_event_date_binding_rules");
  if (dateBinding.sameEventClauseAndPredicateRequired !== true
      || dateBinding.borrowDateFromOtherEventInSentenceAllowed !== false
      || dateBinding.crossSentenceBindingSupported !== false
      || dateBinding.crossSentenceInputAction !== "UNSUPPORTED_FAIL_CLOSED"
      || dateBinding.firstDateFallbackAllowed !== false
      || dateBinding.spanDigestRecomputed !== true
      || dateBinding.spanTamperAction !== "FAIL_CLOSED") {
    throw new Error("semantic_event_date_binding_rules_invalid");
  }

  assertRuntimeSchemaDescriptor(document.stageProgressionTableSchema, [
    "eventFamily", "fromStage", "toStage", "relation", "timeRequirement",
  ], "semantic_event_progression_schema");
  if (!Array.isArray(document.stageProgressionTable) || document.stageProgressionTable.length !== 11) {
    throw new Error("semantic_event_progression_count_mismatch");
  }
  const progressionKeys = new Set();
  for (const row of document.stageProgressionTable) {
    assertExactFields(row, document.stageProgressionTableSchema.exactFields,
      `semantic_event_progression_${row.eventFamily}_${row.fromStage}_${row.toStage}`);
    const key = `${row.eventFamily}:${row.fromStage}:${row.toStage}`;
    if (progressionKeys.has(key)
        || !tuple.eventPredicateSchema.eventFamilyEnum.includes(row.eventFamily)
        || !tuple.stageSchema.values.includes(row.fromStage)
        || !tuple.stageSchema.values.includes(row.toStage)
        || !document.stageProgressionTableSchema.relationEnum.includes(row.relation)
        || !document.stageProgressionTableSchema.timeRequirementEnum.includes(row.timeRequirement)) {
      throw new Error(`semantic_event_progression_invalid_${key}`);
    }
    progressionKeys.add(key);
  }

  const conflict = document.conflictApplicability;
  if (conflict.schema !== "m2.v2.conflict-applicability-public.v0.4"
      || conflict.statusUntilB6Promotion !== "PROPOSED_NOT_CURRENT") {
    throw new Error("semantic_event_conflict_schema_mismatch");
  }
  assertRuntimeSchemaDescriptor(conflict.relationRuleSchema, [
    "priority", "ruleId", "conditionKey", "decision", "conflict", "requiredFamilyPass",
  ], "semantic_event_conflict_rule_schema");
  if (!Array.isArray(conflict.relationDecisionTable) || conflict.relationDecisionTable.length !== 10
      || conflict.firstMatchingPriorityRuleWins !== true
      || conflict.noMatchingRule !== "NOT_EVALUABLE") {
    throw new Error("semantic_event_conflict_precedence_policy_invalid");
  }
  assertExactArray(
    conflict.relationDecisionTable.map((row) => row?.priority),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    "semantic_event_conflict_priorities_mismatch",
  );
  assertSameStringSet(
    conflict.relationDecisionTable.map((row) => row?.conditionKey),
    conflict.relationRuleSchema.conditionKeyEnum,
    "semantic_event_conflict_condition_coverage_mismatch",
  );
  for (const row of conflict.relationDecisionTable) {
    assertExactFields(row, conflict.relationRuleSchema.exactFields, `semantic_event_conflict_rule_${row.priority}`);
    if (!conflict.relationRuleSchema.decisionEnum.includes(row.decision)
        || typeof row.conflict !== "boolean" || typeof row.requiredFamilyPass !== "boolean") {
      throw new Error(`semantic_event_conflict_rule_invalid_${row.priority}`);
    }
  }
  if (sha256(stableStringify(conflict.relationDecisionTable)) !== EXPECTED_EVENT_DECISION_TABLE_SHA256) {
    throw new Error("semantic_event_conflict_table_semantics_mismatch");
  }

  const evaluation = document.eventEvaluationV0_4;
  if (evaluation.schema !== "m2.v2.event-evaluation-private.v0.4"
      || evaluation.unknownFieldsRejected !== true) {
    throw new Error("semantic_event_evaluation_schema_mismatch");
  }
  assertExactArray(evaluation.exactFields, [
    "schema", "evaluationIdSha256", "leftTupleDigestSha256", "rightTupleDigestSha256", "decision",
    "conflict", "requiredFamilyPass", "reasonCode", "matchedRuleId", "identityComparison",
    "stageComparison", "timeComparison", "evaluationDigestSha256",
  ], "semantic_event_evaluation_fields_invalid");
  assertRuntimeSchemaDescriptor(evaluation.identityComparisonSchema, [
    "subject", "organization", "production", "edition",
  ], "semantic_event_identity_comparison_schema");
  assertRuntimeSchemaDescriptor(evaluation.stageComparisonSchema, [
    "eventFamily", "leftStage", "rightStage", "relation",
  ], "semantic_event_stage_comparison_schema");
  assertRuntimeSchemaDescriptor(evaluation.timeComparisonSchema, [
    "relation", "leftPrecision", "rightPrecision",
  ], "semantic_event_time_comparison_schema");
  if (!evaluation.reasonCodeEnum.includes("CROSS_SENTENCE_UNSUPPORTED")
      || evaluation.decisionConflictAndRequiredFamilyPassMustEqualMatchedRule !== true) {
    throw new Error("semantic_event_evaluation_policy_invalid");
  }
}

function validateWorkbookSemanticClosure(document) {
  assertExactFields(document, [
    "schema", "status", "classification", "sourceExactHead", "findingIds", "lineage",
    "packageInventory", "candidateWorkbookBinding", "opcRegistry", "partDecisionEnum",
    "defaultDecision", "unknownButAllowedDecisionExists", "partPolicy", "worksheetChannelPolicy",
    "externalHyperlinkPolicy", "resourceBudgets", "xmlPolicy", "zipStructurePolicy",
    "verificationReceipt", "currentWorkbookPolicy", "testArtifactPolicy", "verificationScope",
    "authorization",
  ], "semantic_workbook_document");
  if (document.schema !== "m2.v2.workbook-independent-verification-public.v0.2") {
    throw new Error("semantic_workbook_schema_mismatch");
  }
  const binding = document.candidateWorkbookBinding;
  assertExactFields(binding, [
    "exactFields", "authorityRole", "repositoryRelativePathDigestSha256", "workbookSha256",
    "pathDigestBasis", "workbookSha256Format", "pathAndDigestMustMatchSingleGraphMember",
    "callerOverrideAllowed", "unknownFieldsRejected",
  ], "semantic_workbook_candidate_binding");
  assertExactArray(binding.exactFields, [
    "authorityRole", "repositoryRelativePathDigestSha256", "workbookSha256",
  ], "semantic_workbook_candidate_fields_invalid");
  if (binding.authorityRole !== "current_governed_private_review_workbook"
      || !/^[0-9a-f]{64}$/u.test(binding.repositoryRelativePathDigestSha256)
      || !/^[0-9a-f]{64}$/u.test(binding.workbookSha256)
      || binding.pathAndDigestMustMatchSingleGraphMember !== true
      || binding.callerOverrideAllowed !== false
      || binding.unknownFieldsRejected !== true) {
    throw new Error("semantic_workbook_candidate_binding_invalid");
  }
  const opc = document.opcRegistry;
  assertPlainObject(opc, "semantic_workbook_opc_registry_must_be_object");
  assertExactArray(opc.contentTypeRecordExactFields, [
    "partClass", "nameRule", "contentType", "cardinality",
  ], "semantic_workbook_content_type_fields_invalid");
  if (!Array.isArray(opc.contentTypes) || opc.contentTypes.length !== 10
      || new Set(opc.contentTypes.map((record) => record?.partClass)).size !== 10) {
    throw new Error("semantic_workbook_content_type_registry_invalid");
  }
  for (const record of opc.contentTypes) {
    assertExactFields(record, opc.contentTypeRecordExactFields, `semantic_workbook_content_type_${record.partClass}`);
    assertNonemptyString(record.nameRule, `semantic_workbook_name_rule_invalid_${record.partClass}`);
    assertNonemptyString(record.contentType, `semantic_workbook_content_type_invalid_${record.partClass}`);
    assertNonemptyString(record.cardinality, `semantic_workbook_content_type_cardinality_invalid_${record.partClass}`);
  }
  assertExactArray(opc.relationshipTypeRecordExactFields, [
    "relationId", "uri", "sourceClass", "targetClass", "cardinality", "targetMode",
  ], "semantic_workbook_relationship_fields_invalid");
  const expectedRelationshipUris = new Map([
    ["office_document", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"],
    ["core_properties", "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties"],
    ["extended_properties", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties"],
    ["worksheet", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"],
    ["shared_strings", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings"],
    ["styles", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"],
    ["theme", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme"],
    ["table", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/table"],
    ["hyperlink", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink"],
  ]);
  if (!Array.isArray(opc.relationshipTypes) || opc.relationshipTypes.length !== expectedRelationshipUris.size) {
    throw new Error("semantic_workbook_relationship_registry_count_mismatch");
  }
  assertSameStringSet(
    opc.relationshipTypes.map((record) => record?.relationId),
    [...expectedRelationshipUris.keys()],
    "semantic_workbook_relationship_registry_set_mismatch",
  );
  for (const record of opc.relationshipTypes) {
    assertExactFields(record, opc.relationshipTypeRecordExactFields, `semantic_workbook_relationship_${record.relationId}`);
    if (record.uri !== expectedRelationshipUris.get(record.relationId)
        || !["Internal", "External"].includes(record.targetMode)) {
      throw new Error(`semantic_workbook_relationship_binding_invalid_${record.relationId}`);
    }
  }
  if (sha256(stableStringify(opc.relationshipTypes)) !== EXPECTED_WORKBOOK_RELATIONSHIPS_SHA256) {
    throw new Error("semantic_workbook_relationship_semantics_mismatch");
  }
  const expectedRoots = [
    { member: "[Content_Types].xml", cardinality: "EXACTLY_ONE" },
    { member: "_rels/.rels", cardinality: "EXACTLY_ONE" },
    { member: "xl/workbook.xml", cardinality: "EXACTLY_ONE" },
    { relationId: "office_document", cardinality: "EXACTLY_ONE" },
  ];
  assertExactArray(opc.requiredRoots, expectedRoots, "semantic_workbook_required_roots_mismatch");
  if (opc.targetResolution.targetMustResolveToExactlyOneRegisteredPart !== true
      || opc.targetResolution.relationshipIdUniqueWithinPart !== true
      || opc.targetResolution.orphanPartAllowed !== false
      || opc.unknownContentTypeRelationPartOrCardinality !== "REJECTED") {
    throw new Error("semantic_workbook_opc_closure_policy_invalid");
  }
  if (document.defaultDecision !== "REJECTED"
      || document.unknownButAllowedDecisionExists !== false
      || !Array.isArray(document.partPolicy) || document.partPolicy.length !== 12) {
    throw new Error("semantic_workbook_part_policy_invalid");
  }
  for (const policy of document.partPolicy) {
    assertExactFields(policy, ["category", "decision", "requirements"], `semantic_workbook_part_policy_${policy.category}`);
    if (!document.partDecisionEnum.includes(policy.decision)) {
      throw new Error(`semantic_workbook_part_decision_unknown_${policy.category}`);
    }
    assertUniqueStringArray(policy.requirements, `semantic_workbook_part_requirements_invalid_${policy.category}`);
  }

  const zip = document.zipStructurePolicy;
  for (const field of [
    "singleEndOfCentralDirectoryRequired", "centralDirectoryAndLocalHeaderExactAgreement",
    "duplicateRawFilenameBytesRejected", "utf8FlagRequired", "unicodePathExtraFieldMustMatchUtf8Name",
    "absoluteDriveUncBackslashDotDotOrNulMemberNameRejected", "caseFoldOrNfcMemberCollisionRejected",
    "crc32MustMatchInflatedBytes", "encryptedOrStrongEncryptionFlagsRejected",
  ]) {
    if (zip[field] !== true) throw new Error(`semantic_workbook_zip_required_${field}`);
  }
  for (const field of [
    "archivePrefixBytesAllowed", "archiveTrailingBytesAllowed", "archiveCommentAllowed",
    "multiDiskArchiveAllowed", "localRecordDataRangesMayOverlap", "legacyCodePageFilenameAllowed",
    "externalAttributesMayEncodeLinkDeviceOrSpecial",
  ]) {
    if (zip[field] !== false) throw new Error(`semantic_workbook_zip_forbidden_${field}`);
  }
  if (zip.canonicalMemberPathForm !== "nfc_posix_relative_no_leading_slash_no_dot_segments") {
    throw new Error("semantic_workbook_zip_canonical_path_invalid");
  }
  assertExactArray(zip.supportedCompressionMethods, ["STORE", "DEFLATE"], "semantic_workbook_zip_methods_invalid");

  const xml = document.xmlPolicy;
  for (const field of [
    "dtdAllowed", "entityDeclarationAllowed", "externalEntityAllowed", "processingInstructionAllowed",
    "networkResolverAllowed", "xincludeAllowed", "namespaceUndeclarationAllowed",
    "duplicateExpandedAttributeAllowed",
  ]) {
    if (xml[field] !== false) throw new Error(`semantic_workbook_xml_forbidden_${field}`);
  }
  if (xml.bomAndDeclarationMustAgree !== true
      || xml.boundedStreamingOrPreflightRequired !== true
      || xml.rootExpandedNameAliasMustResolveExactly !== true
      || xml.exactlyOneNamespaceRulePerElementAttributeRegistryPartClass !== true
      || xml.unknownNamespaceElementOrAttribute !== "REJECTED"
      || xml.knownButWrongPartNamespaceElementOrAttribute !== "REJECTED"
      || xml.allTextTailAndAttributeValuesScanned !== true) {
    throw new Error("semantic_workbook_xml_namespace_policy_invalid");
  }
  assertUniqueStringArray(xml.namespaceRegistry, "semantic_workbook_xml_namespace_registry_invalid");
  assertPlainObject(xml.namespaceAliases, "semantic_workbook_namespace_aliases_must_be_object");
  if (new Set(Object.values(xml.namespaceAliases)).size !== Object.keys(xml.namespaceAliases).length
      || Object.values(xml.namespaceAliases).some((uri) => !xml.namespaceRegistry.includes(uri))) {
    throw new Error("semantic_workbook_namespace_alias_binding_invalid");
  }
  assertExactArray(xml.elementAttributeRegistryRecordExactFields, [
    "partClass", "rootExpandedName", "allowedElementLocalNames", "allowedAttributeLocalNames",
  ], "semantic_workbook_element_registry_fields_invalid");
  if (!Array.isArray(xml.elementAttributeRegistries) || xml.elementAttributeRegistries.length !== 10) {
    throw new Error("semantic_workbook_element_registry_count_mismatch");
  }
  const partClasses = [];
  for (const record of xml.elementAttributeRegistries) {
    assertExactFields(record, xml.elementAttributeRegistryRecordExactFields,
      `semantic_workbook_element_registry_${record.partClass}`);
    assertUniqueStringArray(record.allowedElementLocalNames,
      `semantic_workbook_element_names_invalid_${record.partClass}`);
    if (!Array.isArray(record.allowedAttributeLocalNames)
        || new Set(record.allowedAttributeLocalNames).size !== record.allowedAttributeLocalNames.length) {
      throw new Error(`semantic_workbook_attribute_names_invalid_${record.partClass}`);
    }
    const [alias] = record.rootExpandedName.split(":", 1);
    if (!Object.hasOwn(xml.namespaceAliases, alias)) {
      throw new Error(`semantic_workbook_root_namespace_alias_unknown_${record.partClass}`);
    }
    partClasses.push(record.partClass);
  }
  assertExactArray(xml.partNamespaceRuleRecordExactFields, [
    "partClass", "allowedElementNamespaceAliases", "allowedAttributeNamespaceAliases",
  ], "semantic_workbook_namespace_rule_fields_invalid");
  if (!Array.isArray(xml.partNamespaceRules) || xml.partNamespaceRules.length !== partClasses.length) {
    throw new Error("semantic_workbook_namespace_rule_count_mismatch");
  }
  assertSameStringSet(
    xml.partNamespaceRules.map((record) => record?.partClass),
    partClasses,
    "semantic_workbook_namespace_rule_coverage_mismatch",
  );
  for (const rule of xml.partNamespaceRules) {
    assertExactFields(rule, xml.partNamespaceRuleRecordExactFields,
      `semantic_workbook_namespace_rule_${rule.partClass}`);
    assertUniqueStringArray(rule.allowedElementNamespaceAliases,
      `semantic_workbook_element_aliases_invalid_${rule.partClass}`);
    assertUniqueStringArray(rule.allowedAttributeNamespaceAliases,
      `semantic_workbook_attribute_aliases_invalid_${rule.partClass}`);
    for (const alias of [...rule.allowedElementNamespaceAliases, ...rule.allowedAttributeNamespaceAliases]) {
      if (alias !== "UNQUALIFIED" && !Object.hasOwn(xml.namespaceAliases, alias)) {
        throw new Error(`semantic_workbook_namespace_rule_alias_unknown_${rule.partClass}_${alias}`);
      }
    }
  }

  const receipt = document.verificationReceipt;
  if (receipt.schema !== "m2.v2.independent-workbook-verification.v0.2"
      || receipt.unknownFieldsRejected !== true) {
    throw new Error("semantic_workbook_receipt_schema_mismatch");
  }
  assertExactArray(receipt.exactFields, [
    "schema", "workbookSha256", "profileVersion", "policyDigestSha256",
    "packageMemberSetDigestSha256", "contentTypeGraphDigestSha256", "relationshipGraphDigestSha256",
    "partDecisionDigestSha256", "partDecisions", "derivedFacts", "hyperlinkLineage", "issues", "passed",
    "visualReviewAttested", "providerRequestDelta", "actualExternalFetchCount",
  ], "semantic_workbook_receipt_fields_invalid");
  assertRuntimeSchemaDescriptor(receipt.derivedFactsRecord, [
    "factId", "factType", "valueType", "value", "sourcePartSetDigestSha256",
  ], "semantic_workbook_derived_fact_schema");
  assertExactArray(receipt.derivedFactsRecord.valueTypeValues, [
    "BOOLEAN", "INTEGER", "SAFE_STRING", "DIGEST",
  ], "semantic_workbook_derived_fact_types_invalid");
  assertExactFields(receipt.derivedFactsRecord.valueConstraints, [
    "BOOLEAN", "INTEGER", "SAFE_STRING", "DIGEST",
  ], "semantic_workbook_derived_fact_constraints");
  if (receipt.derivedFactsRecord.valueConstraints.BOOLEAN !== "boolean"
      || receipt.derivedFactsRecord.valueConstraints.INTEGER !== "safe_integer"
      || receipt.derivedFactsRecord.valueConstraints.SAFE_STRING !== "nfc_utf8_max_4096_bytes"
      || receipt.derivedFactsRecord.valueConstraints.DIGEST !== "lowercase_hex_64") {
    throw new Error("semantic_workbook_derived_fact_constraints_invalid");
  }
  assertRuntimeSchemaDescriptor(receipt.issueRecord, [
    "issueId", "severity", "reasonCode", "partNameDigestSha256", "relationIdDigestSha256", "safeDetail",
  ], "semantic_workbook_issue_schema");
  assertRuntimeSchemaDescriptor(receipt.partDecisionRecord, [
    "partNameDigestSha256", "partClass", "contentType", "decision", "justificationCode",
    "handlerId", "contentSha256",
  ], "semantic_workbook_part_decision_schema");
  assertExactArray(receipt.hyperlinkLineageExactFields, [
    "protocol", "targetMode", "relationshipType", "targetDigest", "occurrenceCount",
  ], "semantic_workbook_hyperlink_fields_invalid");
  if (receipt.generatorAssertionsTrusted !== false
      || receipt.visualReviewDefault !== false
      || receipt.structuralVerifierMayAttestVisualReview !== false
      || receipt.rawTargetsOrHostsPersisted !== false
      || receipt.providerRequestDeltaRequired !== 0
      || receipt.actualExternalFetchCountRequired !== 0) {
    throw new Error("semantic_workbook_receipt_policy_invalid");
  }
}

function validateContractSchemaDefinitions(contract, contractArtifactBytesByPath) {
  if (!Array.isArray(contract.schemaDefinitions)
      || contract.schemaDefinitions.length !== contract.declaredSchemas.length) {
    throw new Error(`contract_schema_definition_count_mismatch_${contract.contractId}`);
  }
  const machineBytes = contractArtifactBytesByPath === undefined
    ? undefined
    : contractArtifactBytesByPath instanceof Map
      ? contractArtifactBytesByPath.get(contract.machinePath)
      : contractArtifactBytesByPath[contract.machinePath];
  const machineDocument = machineBytes === undefined ? undefined : parseJsonUtf8Strict(machineBytes);
  for (let index = 0; index < contract.schemaDefinitions.length; index += 1) {
    const definition = contract.schemaDefinitions[index];
    assertExactFields(definition, [
      "schema", "definitionPointer", "discriminatorPointer", "definitionKind",
    ], `contract_schema_definition_${contract.contractId}_${index}`);
    if (definition.schema !== contract.declaredSchemas[index]
        || !["TOP_LEVEL_CONTRACT", "NESTED_EXACT_SCHEMA"].includes(definition.definitionKind)
        || typeof definition.definitionPointer !== "string"
        || typeof definition.discriminatorPointer !== "string"
        || !definition.discriminatorPointer.startsWith("/")) {
      throw new Error(`contract_schema_definition_invalid_${contract.contractId}_${index}`);
    }
    if ((index === 0) !== (definition.definitionKind === "TOP_LEVEL_CONTRACT")
        || (index === 0) !== (definition.definitionPointer === "")) {
      throw new Error(`contract_schema_definition_kind_invalid_${contract.contractId}_${index}`);
    }
    if (machineDocument !== undefined) {
      const schemaNode = resolveJsonPointer(machineDocument, definition.definitionPointer);
      if (!schemaNode || typeof schemaNode !== "object" || Array.isArray(schemaNode)) {
        throw new Error(`contract_schema_definition_node_invalid_${contract.contractId}_${index}`);
      }
      if (resolveJsonPointer(machineDocument, definition.discriminatorPointer) !== definition.schema) {
        throw new Error(`contract_schema_discriminator_mismatch_${contract.contractId}_${index}`);
      }
    }
  }
}

function validateVersionGraphResolution(registry) {
  const currentNodes = [
    ...registry.contracts.flatMap((contract) => contract.declaredSchemas),
    registry.plannedCurrentAuthority.currentStateIndex.schema,
    registry.plannedCurrentAuthority.integrityRestatement.schema,
  ];
  const historicalNodes = [
    ...registry.contracts.flatMap((contract) => contract.supersedes),
    registry.plannedCurrentAuthority.preB6CurrentStateIndex,
    registry.plannedCurrentAuthority.preB6IntegrityRestatement,
  ];
  const targetCounts = new Map();
  for (const node of currentNodes) targetCounts.set(node, (targetCounts.get(node) ?? 0) + 1);
  for (const edge of registry.versionGraph.edges) {
    if (targetCounts.get(edge.to) !== 1) throw new Error(`version_graph_target_resolution_invalid_${edge.to}`);
  }
  assertSameStringSet(
    registry.versionGraph.edges.map((edge) => edge.from),
    historicalNodes,
    "version_graph_historical_source_resolution_mismatch",
  );
  assertSameStringSet(
    registry.versionGraph.edges.map((edge) => edge.to),
    registry.versionGraph.edges.map((edge) => edge.to),
    "version_graph_target_duplicate",
  );
}

function validateContractHistoricalBaselines(baselines, artifactBytesByPath, trackedPaths) {
  assertPlainObject(baselines, "historical_baselines_must_be_object");
  assertExactFields(baselines, [
    "digestAlgorithm", "trackedArtifacts", "safeCachePredecessor",
  ], "historical_baselines");
  if (baselines.digestAlgorithm !== "sha256") throw new Error("historical_digest_algorithm_mismatch");
  if (!Array.isArray(baselines.trackedArtifacts)
      || baselines.trackedArtifacts.length !== S1_HISTORICAL_PATHS.length) {
    throw new Error("contract_historical_artifact_count_mismatch");
  }
  assertExactArray(
    baselines.trackedArtifacts.map((entry) => entry?.path),
    S1_HISTORICAL_PATHS,
    "contract_historical_paths_mismatch",
  );
  for (const entry of baselines.trackedArtifacts) {
    assertExactFields(entry, ["path", "sha256"], `contract_historical_${entry.path}`);
    assertSha(entry.sha256, `contract_historical_sha_invalid_${entry.path}`);
    if (trackedPaths !== undefined && !trackedPaths.has(entry.path)) {
      throw new Error(`contract_historical_path_not_tracked_${entry.path}`);
    }
    if (artifactBytesByPath !== undefined) {
      const bytes = artifactBytesByPath instanceof Map
        ? artifactBytesByPath.get(entry.path)
        : artifactBytesByPath[entry.path];
      if (bytes === undefined) throw new Error(`contract_historical_bytes_missing_${entry.path}`);
      if (sha256PortableText(bytes) !== entry.sha256) {
        throw new Error(`contract_historical_digest_mismatch_${entry.path}`);
      }
    }
  }
  assertExactFields(baselines.safeCachePredecessor, [
    "schema", "trackedPublicArtifactPresent", "disposition",
  ], "safe_cache_predecessor");
  if (baselines.safeCachePredecessor.schema !== "m2.v2.v2b6-safe-cache-private.v0.2"
      || baselines.safeCachePredecessor.trackedPublicArtifactPresent !== false
      || baselines.safeCachePredecessor.disposition !== "IDENTIFIER_ONLY_NO_TRACKED_PUBLIC_BASELINE") {
    throw new Error("safe_cache_predecessor_policy_invalid");
  }
}

export function validateCaseRegistry(registry) {
  assertPlainObject(registry, "case_registry_must_be_object");
  assertExactFields(registry, [
    "schema", "status", "sourcePlanSha256", "normalizedCasesCanonicalSha256",
    "canonicalization", "counts", "findingCounts", "corrections", "executionPolicy", "cases",
  ], "case_registry");
  if (registry.schema !== "m2.v2.pr7-s1-case-registry.v0.1"
      || registry.status !== "PLANNED_NOT_EXECUTED"
      || registry.sourcePlanSha256 !== "62684bc4ff1f2be98f51ac2f661e7e416698c02c278dc43a0eafefa6fb6a2525"
      || registry.normalizedCasesCanonicalSha256 !== "1559a40b1b10c7b9a87a9e93637a9640b720087c4b916637e2243d59096ecd70"
      || registry.canonicalization !== "sha256(JSON.stringify(recursive-key-sorted normalized cases))") {
    throw new Error("case_registry_identity_mismatch");
  }
  assertExactFields(registry.counts, [
    "total", "default", "linux", "windows", "categories", "secondaryVerifierRequired", "corrections",
  ], "case_counts");
  assertExactFields(registry.counts.categories, Object.keys(EXPECTED_CATEGORY_COUNTS), "case_category_counts");
  assertExactFields(registry.findingCounts, S1_FINDING_IDS, "case_finding_counts");
  assertExactFields(registry.executionPolicy, [
    "caseStatus", "providerAllowed", "privateStateAllowed", "mustEnterDefaultNpmTest",
  ], "case_execution_policy");
  if (registry.executionPolicy.caseStatus !== "PLANNED_NOT_EXECUTED"
      || registry.executionPolicy.providerAllowed !== false
      || registry.executionPolicy.privateStateAllowed !== "SYNTHETIC_TEMP_ONLY"
      || registry.executionPolicy.mustEnterDefaultNpmTest !== true) {
    throw new Error("case_execution_policy_invalid");
  }
  if (!Array.isArray(registry.cases) || registry.cases.length !== 89) throw new Error("case_total_mismatch");
  const ids = new Set();
  const categoryCounts = Object.fromEntries(Object.keys(EXPECTED_CATEGORY_COUNTS).map((key) => [key, 0]));
  const findingCounts = Object.fromEntries(S1_FINDING_IDS.map((key) => [key, 0]));
  let linux = 0;
  let windows = 0;
  let defaultCount = 0;
  let secondary = 0;
  for (const entry of registry.cases) {
    assertPlainObject(entry, "case_entry_must_be_object");
    assertExactFields(entry, [
      "caseId", "findingId", "category", "fixtureSource", "mutationOrInput", "expectedResult",
      "expectedErrorOrReason", "existingTestGap", "proposedTestFile", "platforms", "providerAllowed",
      "privateStateAllowed", "isolationRequirement", "mustEnterDefaultNpmTest", "secondaryVerifierRequired",
    ], `case_${String(entry.caseId)}`);
    assertNonemptyString(entry.caseId, "case_id_required");
    if (ids.has(entry.caseId)) throw new Error("case_id_duplicate");
    ids.add(entry.caseId);
    if (!Object.hasOwn(findingCounts, entry.findingId)) throw new Error(`case_finding_unknown_${entry.caseId}`);
    if (!Object.hasOwn(categoryCounts, entry.category)) throw new Error(`case_category_unknown_${entry.caseId}`);
    assertRepositoryRelativePath(entry.proposedTestFile, "case_test_path_invalid");
    if (!Array.isArray(entry.platforms)
        || entry.platforms.length === 0
        || entry.platforms.some((platform) => !["linux", "windows"].includes(platform))
        || new Set(entry.platforms).size !== entry.platforms.length) {
      throw new Error(`case_platforms_invalid_${entry.caseId}`);
    }
    if (entry.providerAllowed !== false
        || entry.privateStateAllowed !== "SYNTHETIC_TEMP_ONLY"
        || entry.mustEnterDefaultNpmTest !== true
        || typeof entry.secondaryVerifierRequired !== "boolean") {
      throw new Error(`case_boundary_invalid_${entry.caseId}`);
    }
    categoryCounts[entry.category] += 1;
    findingCounts[entry.findingId] += 1;
    if (entry.platforms.includes("linux")) linux += 1;
    if (entry.platforms.includes("windows")) windows += 1;
    if (entry.mustEnterDefaultNpmTest) defaultCount += 1;
    if (entry.secondaryVerifierRequired) secondary += 1;
  }
  if (sha256(stableStringify(registry.cases)) !== registry.normalizedCasesCanonicalSha256) {
    throw new Error("case_canonical_digest_mismatch");
  }
  assertCountObject(categoryCounts, EXPECTED_CATEGORY_COUNTS, "computed_category_counts_mismatch");
  assertCountObject(findingCounts, EXPECTED_FINDING_COUNTS, "computed_finding_counts_mismatch");
  assertCountObject(registry.counts.categories, EXPECTED_CATEGORY_COUNTS, "declared_category_counts_mismatch");
  assertCountObject(registry.findingCounts, EXPECTED_FINDING_COUNTS, "declared_finding_counts_mismatch");
  if (registry.counts.total !== 89
      || registry.counts.default !== 89
      || registry.counts.linux !== 87
      || registry.counts.windows !== 88
      || registry.counts.secondaryVerifierRequired !== 30
      || registry.counts.corrections !== 3
      || defaultCount !== 89
      || linux !== 87
      || windows !== 88
      || secondary !== 30) {
    throw new Error("case_aggregate_counts_mismatch");
  }
  validateCorrections(registry.corrections, registry.cases);
  return {
    total: 89,
    linux,
    windows,
    secondaryVerifierRequired: secondary,
    correctionCount: registry.corrections.length,
  };
}

export function validateHistoricalArtifactBindings(bindings, artifactBytesByPath = undefined) {
  if (!Array.isArray(bindings) || bindings.length !== S1_HISTORICAL_PATHS.length) {
    throw new Error("historical_artifact_binding_count_mismatch");
  }
  const paths = bindings.map((binding) => binding?.path);
  assertExactArray(paths, S1_HISTORICAL_PATHS, "historical_artifact_paths_mismatch");
  for (const binding of bindings) {
    assertPlainObject(binding, "historical_artifact_binding_must_be_object");
    assertExactFields(binding, ["path", "sha256", "baselineHead", "immutable"], `historical_${binding.path}`);
    assertSha(binding.sha256, "historical_artifact_sha_invalid");
    if (binding.baselineHead !== STARTING_HEAD || binding.immutable !== true) {
      throw new Error(`historical_artifact_policy_invalid_${binding.path}`);
    }
    if (artifactBytesByPath !== undefined) {
      const bytes = artifactBytesByPath instanceof Map
        ? artifactBytesByPath.get(binding.path)
        : artifactBytesByPath[binding.path];
      if (bytes === undefined) throw new Error(`historical_artifact_bytes_missing_${binding.path}`);
      if (sha256PortableText(bytes) !== binding.sha256) {
        throw new Error(`historical_artifact_digest_mismatch_${binding.path}`);
      }
    }
  }
  return true;
}

export function validateVersionGraphAcyclic(edges) {
  if (!Array.isArray(edges) || edges.length === 0) throw new Error("version_graph_edges_required");
  const adjacency = new Map();
  const edgeIds = new Set();
  for (const edge of edges) {
    assertPlainObject(edge, "version_graph_edge_must_be_object");
    assertExactFields(edge, ["from", "to"], "version_graph_edge");
    assertNonemptyString(edge.from, "version_graph_from_required");
    assertNonemptyString(edge.to, "version_graph_to_required");
    if (edge.from === edge.to) throw new Error("version_graph_self_cycle");
    const edgeId = `${edge.from}\0${edge.to}`;
    if (edgeIds.has(edgeId)) throw new Error("version_graph_edge_duplicate");
    edgeIds.add(edgeId);
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    adjacency.get(edge.from).push(edge.to);
  }
  const visiting = new Set();
  const visited = new Set();
  const visit = (node) => {
    if (visiting.has(node)) throw new Error("version_graph_cycle_detected");
    if (visited.has(node)) return;
    visiting.add(node);
    for (const next of adjacency.get(node) ?? []) visit(next);
    visiting.delete(node);
    visited.add(node);
  };
  for (const node of adjacency.keys()) visit(node);
  return { edgeCount: edges.length, acyclic: true };
}

export function resolveJsonPointer(document, pointer) {
  if (pointer === "") return document;
  if (typeof pointer !== "string" || !pointer.startsWith("/")) throw new Error("json_pointer_invalid");
  let current = document;
  for (const rawSegment of pointer.slice(1).split("/")) {
    if (/~(?:[^01]|$)/u.test(rawSegment)) throw new Error("json_pointer_escape_invalid");
    const segment = rawSegment.replaceAll("~1", "/").replaceAll("~0", "~");
    if (!current || typeof current !== "object" || !Object.hasOwn(current, segment)) {
      throw new Error(`json_pointer_missing_${pointer}`);
    }
    current = current[segment];
  }
  return current;
}

export function validateS1Overlay(overlay) {
  assertPlainObject(overlay, "overlay_must_be_object");
  assertExactFields(overlay, [
    "schema", "reviewedHead", "s1StartingHead", "branch", "openP1", "openDirectP2",
    "openFindingIds", "historicalDecision", "currentDecision", "s0Status",
    "supportSharpeningStopCriteriaReached", "findingRemediationAuthorized", "authorizedBatches",
    "currentBatch", "batchStatuses", "nextBatch", "nextAllowedPhase", "candidateFindingStatuses", "openFindings",
    "findingsRemainOpen", "findingClosureStatus", "independentReviewPerformed",
    "independentReviewStatus", "b8Authorized", "mergeAuthorized", "full160Authorized",
    "modelTrainingAuthorized", "releaseAuthorized", "nextDevelopmentReadiness",
    "remediationComplete", "pullRequestState",
  ], "overlay");
  assertPlainObject(overlay.batchStatuses, "overlay_batch_statuses_must_be_object");
  assertExactFields(overlay.batchStatuses, ["B0", "B1", "B2", "B3"], "overlay_batch_statuses");
  assertPlainObject(overlay.candidateFindingStatuses, "overlay_candidate_statuses_must_be_object");
  assertExactFields(overlay.candidateFindingStatuses, ["PR7-P1-008", "PR7-P2-016"], "overlay_candidate_statuses");
  for (const findingId of ["PR7-P1-008", "PR7-P2-016"]) {
    assertPlainObject(overlay.candidateFindingStatuses[findingId], `overlay_${findingId}_candidate_status_must_be_object`);
    assertExactFields(overlay.candidateFindingStatuses[findingId], ["findingStatus", "candidateStatus"], `overlay_${findingId}_candidate_status`);
  }
  assertSameStringSet(overlay.openFindingIds, S1_FINDING_IDS, "overlay_finding_ids_mismatch");
  assertExactArray(overlay.authorizedBatches, S1_BATCHES, "overlay_authorized_batches_mismatch");
  const valid = overlay.schema === "m2.v2.pr7.open-findings-status.v0.1"
    && overlay.reviewedHead === FINDING_HEAD
    && overlay.s1StartingHead === STARTING_HEAD
    && overlay.branch === DIRECT_BRANCH
    && overlay.openP1 === 5
    && overlay.openDirectP2 === 5
    && overlay.historicalDecision === "CANARY_CONDITIONAL"
    && overlay.currentDecision === "CANARY_FAIL"
    && overlay.s0Status === "COMPLETE"
    && overlay.supportSharpeningStopCriteriaReached === true
    && overlay.findingRemediationAuthorized === true
    && overlay.currentBatch === "B3"
    && overlay.batchStatuses.B0 === "COMPLETE"
    && overlay.batchStatuses.B1 === "COMPLETE_PENDING_B8"
    && overlay.batchStatuses.B2 === "COMPLETE_PENDING_B8"
    && overlay.batchStatuses.B3 === "COMPLETE_PENDING_B8"
    && overlay.nextBatch === "B4"
    && overlay.nextAllowedPhase === "B4_REQUIRES_EXPLICIT_START"
    && ["PR7-P1-008", "PR7-P2-016"].every((findingId) => (
      overlay.candidateFindingStatuses[findingId].findingStatus === "OPEN"
      && overlay.candidateFindingStatuses[findingId].candidateStatus === "CANDIDATE_CLOSED_PENDING_INDEPENDENT_REVIEW"
    ))
    && overlay.openFindings === 10
    && overlay.findingsRemainOpen === true
    && overlay.findingClosureStatus === "OPEN"
    && overlay.independentReviewPerformed === false
    && overlay.independentReviewStatus === "NOT_REVIEWED"
    && overlay.b8Authorized === false
    && overlay.mergeAuthorized === false
    && overlay.full160Authorized === false
    && overlay.modelTrainingAuthorized === false
    && overlay.releaseAuthorized === false
    && overlay.nextDevelopmentReadiness === "NOT_AUTHORIZED"
    && overlay.remediationComplete === false
    && overlay.pullRequestState === "DRAFT_OPEN_UNMERGED";
  if (!valid) throw new Error("overlay_governance_mismatch");
  return true;
}

export function validateS1SourceAuthenticityBinding(
  manifestSources,
  privateEvidence = null,
  { trackedOnlyAllowed = false } = {},
) {
  validateRequiredSourceEvidence(manifestSources);
  const manifestDigestBindingSha256 = sha256(stableStringify(manifestSources));
  if (privateEvidence === null) {
    if (!trackedOnlyAllowed) throw new Error("private_source_evidence_required_outside_ci");
    return {
      status: "BOUND_TO_TRACKED_MANIFEST_CI",
      sourceCount: 4,
      manifestDigestBindingSha256,
      privateEvidencePresent: false,
    };
  }
  assertPlainObject(privateEvidence, "private_source_evidence_must_be_object");
  assertExactFields(privateEvidence, [
    "schema", "privateOnly", "generatedAt", "canonicalization",
    "manifestDigestBindingSha256", "status", "sources",
  ], "private_source_evidence");
  if (privateEvidence.schema !== "m2.v2.pr7.s1-source-evidence-authenticity.private.v0.1"
      || privateEvidence.privateOnly !== true
      || typeof privateEvidence.generatedAt !== "string"
      || Number.isNaN(Date.parse(privateEvidence.generatedAt))
      || typeof privateEvidence.canonicalization !== "string"
      || privateEvidence.canonicalization.trim() === ""
      || privateEvidence.manifestDigestBindingSha256 !== manifestDigestBindingSha256
      || privateEvidence.status !== "PASS"
      || !Array.isArray(privateEvidence.sources)) {
    throw new Error("private_source_evidence_not_pass");
  }
  if (privateEvidence.sources.length !== 4) throw new Error("private_source_evidence_count_mismatch");
  const sourceIds = new Set();
  for (const source of privateEvidence.sources) {
    assertPlainObject(source, "private_source_record_must_be_object");
    assertExactFields(source, [
      "sourceId", "reportExpectedSha256", "reportActualSha256", "reportPath",
      "receiptExpectedDigest", "receiptClaimedDigest", "receiptRecomputedDigest", "receiptPath", "matches",
    ], `private_source_record_${String(source.sourceId)}`);
    assertNonemptyString(source.sourceId, "private_source_id_required");
    if (sourceIds.has(source.sourceId)) throw new Error(`private_source_id_duplicate_${source.sourceId}`);
    sourceIds.add(source.sourceId);
    for (const field of [
      "reportExpectedSha256", "reportActualSha256", "receiptExpectedDigest",
      "receiptClaimedDigest", "receiptRecomputedDigest",
    ]) assertSha(source[field], `private_source_digest_invalid_${source.sourceId}_${field}`);
    for (const field of ["reportPath", "receiptPath"]) {
      assertRepositoryRelativePath(source[field], `private_source_path_invalid_${source.sourceId}_${field}`);
      if (!source[field].startsWith("data/private-output/")) {
        throw new Error(`private_source_path_role_invalid_${source.sourceId}_${field}`);
      }
    }
    if (source.matches !== true) throw new Error(`private_source_matches_false_${source.sourceId}`);
  }
  for (const expected of manifestSources) {
    const matches = privateEvidence.sources.filter((source) => source?.sourceId === expected.sourceId);
    if (matches.length !== 1) throw new Error(`source_evidence_identity_mismatch_${expected.sourceId}`);
    const actual = matches[0];
    if (actual.reportExpectedSha256 !== expected.reportSha256
        || actual.reportActualSha256 !== expected.reportSha256
        || actual.receiptExpectedDigest !== expected.receiptDigest
        || actual.receiptClaimedDigest !== expected.receiptDigest
        || actual.receiptRecomputedDigest !== expected.receiptDigest
        || actual.matches !== true) {
      throw new Error(`source_evidence_digest_mismatch_${expected.sourceId}`);
    }
  }
  return {
    status: "RECOMPUTED_PRIVATE_EVIDENCE_VERIFIED",
    sourceCount: 4,
    manifestDigestBindingSha256,
    privateEvidencePresent: true,
  };
}

export function evaluateTrackedOnlySourcePolicy(env, { expectedHead, actualHead, repositoryRoot, workspaceRoot }) {
  if (!env || typeof env !== "object" || Array.isArray(env)) throw new Error("ci_environment_must_be_object");
  const runnerOs = process.platform === "win32" ? "Windows" : "Linux";
  return env.CI === "true"
    && env.GITHUB_ACTIONS === "true"
    && env.GITHUB_REPOSITORY === "KAtOReNA7/system"
    && env.GITHUB_EVENT_NAME === "pull_request"
    && env.GITHUB_HEAD_REF === DIRECT_BRANCH
    && env.RUNNER_ENVIRONMENT === "github-hosted"
    && env.RUNNER_OS === runnerOs
    && env.EXPECTED_HEAD_SHA === expectedHead
    && expectedHead === actualHead
    && typeof env.GITHUB_WORKSPACE === "string"
    && normalizeComparablePath(env.GITHUB_WORKSPACE) === normalizeComparablePath(workspaceRoot)
    && normalizeComparablePath(repositoryRoot) === normalizeComparablePath(workspaceRoot);
}

export function evaluateS1PreflightFacts(facts) {
  assertPlainObject(facts, "preflight_facts_must_be_object");
  assertExactFields(facts, S1_PREFLIGHT_FACT_FIELDS, "preflight_facts");
  for (const field of S1_PREFLIGHT_FACT_FIELDS) {
    if (facts[field] !== true) throw new Error(`preflight_gate_failed_${field}`);
  }
  return Object.fromEntries(S1_PREFLIGHT_FACT_FIELDS.map((field) => [field, true]));
}

export function validateS1FallbackEvent(event) {
  assertPlainObject(event, "fallback_event_must_be_object");
  assertExactFields(event, S1_FALLBACK_EVENT_FIELDS, "fallback_event");
  for (const field of [
    "eventId", "timestamp", "task", "preferredExecutable", "failureClass",
    "failureMessageSanitized", "replacementExecutable", "semanticEquivalence",
    "coverageDifference", "sideEffectDifference", "securityDifference", "confidenceImpact",
  ]) assertNonemptyString(event[field], `${field}_must_be_nonempty_string`);
  if (!S1_BATCHES.includes(event.batchId)) throw new Error("fallback_batch_unknown");
  if (!Array.isArray(event.preferredArgv) || event.preferredArgv.some((item) => typeof item !== "string")) {
    throw new Error("preferred_argv_must_be_string_array");
  }
  if (!Array.isArray(event.replacementArgv) || event.replacementArgv.some((item) => typeof item !== "string")) {
    throw new Error("replacement_argv_must_be_string_array");
  }
  if (!FALLBACK_DISPOSITIONS.includes(event.disposition)) throw new Error("fallback_disposition_unknown");
  if (Number.isNaN(Date.parse(event.timestamp))) throw new Error("fallback_timestamp_invalid");
  return true;
}

export function validateS1Receipt(receipt, receiptSchema) {
  validateJsonSchema(receipt, receiptSchema);
  assertPlainObject(receipt, "s1_receipt_must_be_object");
  if (![
    "m2.v2.pr7.s1-preflight-receipt.v0.1",
    "m2.v2.pr7.s1-local-validation-receipt.v0.1",
  ].includes(receipt.schema)) throw new Error("s1_receipt_schema_unknown");
  if (receipt.passed === true) validateS1SuccessReceipt(receipt);
  else if (receipt.passed === false) validateS1FailureReceipt(receipt);
  else throw new Error("s1_receipt_passed_must_be_boolean");
  return true;
}

export function deriveS1AuditedTransportCounts({
  preflight,
  isolation,
  parentTransportSnapshot,
  isolationCommand,
}) {
  if (preflight?.checks?.externalEnvironmentEmpty !== true
      || !Array.isArray(preflight.externalEnvironment)
      || preflight.externalEnvironment.length !== S1_EXTERNAL_ENV_NAMES.length
      || preflight.externalEnvironment.some((entry) => entry?.empty !== true)) {
    throw new Error("s1_transport_evidence_external_environment_not_empty");
  }
  if (isolationCommand?.commandId !== "s1.default.isolated"
      || isolationCommand.executable !== "node"
      || stableStringify(isolationCommand.argv) !== stableStringify([
        "scripts/m2-v2-evidence-pilot/verify_m2_v2_test_isolation.mjs",
      ])) {
    throw new Error("s1_transport_evidence_isolation_command_unbound");
  }
  if (isolation?.schema !== "m2.v2.default-test-isolation-proof.v0.3"
      || isolation.passed !== true
      || isolation.proofScope !== "full_npm_test"
      || isolation.childPassed !== true
      || isolation.defaultTestChainInvocationCount !== 1
      || !Number.isSafeInteger(isolation.providerCounterBefore)
      || !Number.isSafeInteger(isolation.providerCounterAfter)
      || isolation.providerCounterBefore < 0
      || isolation.providerCounterAfter !== isolation.providerCounterBefore
      || isolation.providerRequestDelta !== 0) {
    throw new Error("s1_transport_evidence_child_isolation_invalid");
  }
  if (!parentTransportSnapshot
      || !Number.isSafeInteger(parentTransportSnapshot.actualExternalFetchCount)
      || !Number.isSafeInteger(parentTransportSnapshot.actualDbConnectCount)
      || parentTransportSnapshot.actualExternalFetchCount !== 0
      || parentTransportSnapshot.actualDbConnectCount !== 0) {
    throw new Error("s1_transport_evidence_parent_snapshot_invalid");
  }
  // Scope is deliberate: the parent snapshot measures the S1 runner. The pinned
  // child isolation proof supplies the shared provider counter and runs the exact
  // deny-before-connect sentinel under an empty external/DB environment.
  return {
    databaseConnections: parentTransportSnapshot.actualDbConnectCount,
    actualExternalFetchCount: parentTransportSnapshot.actualExternalFetchCount,
  };
}

function validateS1SuccessReceipt(receipt) {
  assertExactFields(receipt, [
    "schema", "passed", "generatedAt", "batchId", "actualHead", "actualBranch", "startingHead",
    "findingHead", "baseSha", "selectedCommandId", "taskManifestSha256", "commandRegistrySha256",
    "contractRegistrySha256", "caseRegistrySha256", "receiptSchemaSha256", "sourceEvidence",
    "externalEnvironment", "capabilities", "checks", "executions", "fallbackEvents",
  ], "s1_success_receipt");
  validateS1ReceiptSourceEvidence(receipt.sourceEvidence);
  validateS1ReceiptExternalEnvironment(receipt.externalEnvironment);
  validateS1ReceiptCapabilities(receipt.capabilities);
  if (!Array.isArray(receipt.fallbackEvents)) throw new Error("s1_receipt_fallback_events_must_be_array");
  for (const event of receipt.fallbackEvents) validateS1FallbackEvent(event);

  if (receipt.schema === "m2.v2.pr7.s1-preflight-receipt.v0.1") {
    if (receipt.selectedCommandId !== "s1.doctor") throw new Error("s1_preflight_receipt_command_mismatch");
    assertExactFields(receipt.checks, S1_PREFLIGHT_FACT_FIELDS, "s1_preflight_receipt_checks");
    if (Object.values(receipt.checks).some((value) => value !== true)) {
      throw new Error("s1_preflight_receipt_check_not_true");
    }
    if (!Array.isArray(receipt.executions) || receipt.executions.length !== 0) {
      throw new Error("s1_preflight_receipt_execution_cardinality_invalid");
    }
    return;
  }

  if (receipt.selectedCommandId !== "s1.validate.local") {
    throw new Error("s1_local_receipt_command_mismatch");
  }
  assertExactFields(receipt.checks, S1_LOCAL_VALIDATION_CHECK_FIELDS, "s1_local_receipt_checks");
  for (const field of S1_LOCAL_VALIDATION_CHECK_FIELDS) {
    if ([
      "defaultTestChainInvocationCount", "defaultTestTotalSkips", "providerRequestDelta",
      "databaseConnections", "actualExternalFetchCount",
    ].includes(field)) continue;
    if (receipt.checks[field] !== true) throw new Error(`s1_local_receipt_check_not_true_${field}`);
  }
  for (const [field, expected] of [
    ["defaultTestChainInvocationCount", 1],
    ["defaultTestTotalSkips", 0],
    ["providerRequestDelta", 0],
    ["databaseConnections", 0],
    ["actualExternalFetchCount", 0],
  ]) {
    if (receipt.checks[field] !== expected) throw new Error(`s1_local_receipt_count_invalid_${field}`);
  }
  if (!Array.isArray(receipt.executions) || receipt.executions.length !== 2) {
    throw new Error("s1_local_receipt_execution_cardinality_invalid");
  }
  assertExactArray(
    receipt.executions.map((execution) => execution?.commandId),
    ["s1.doctor", "s1.default.isolated"],
    "s1_local_receipt_execution_order_invalid",
  );
  for (const execution of receipt.executions) validateS1Execution(execution, { successRequired: true });
}

function validateS1FailureReceipt(receipt) {
  assertExactFields(receipt, [
    "schema", "passed", "generatedAt", "batchId", "actualHead", "checks", "executions",
    "fallbackEvents", "failureStage", "error",
  ], "s1_failure_receipt");
  assertPlainObject(receipt.checks, "s1_failure_receipt_checks_must_be_object");
  const knownChecks = new Set([...S1_PREFLIGHT_FACT_FIELDS, ...S1_LOCAL_VALIDATION_CHECK_FIELDS]);
  for (const [field, value] of Object.entries(receipt.checks)) {
    if (!knownChecks.has(field)) throw new Error(`s1_failure_receipt_check_unknown_${field}`);
    if (typeof value !== "boolean" && !Number.isSafeInteger(value)) {
      throw new Error(`s1_failure_receipt_check_type_invalid_${field}`);
    }
  }
  if (!Array.isArray(receipt.executions) || receipt.executions.length > 2) {
    throw new Error("s1_failure_receipt_execution_cardinality_invalid");
  }
  for (const execution of receipt.executions) validateS1Execution(execution, { successRequired: false });
  if (!Array.isArray(receipt.fallbackEvents)) throw new Error("s1_receipt_fallback_events_must_be_array");
  for (const event of receipt.fallbackEvents) validateS1FallbackEvent(event);
}

function validateS1ReceiptSourceEvidence(sourceEvidence) {
  assertExactFields(sourceEvidence, [
    "status", "sourceCount", "manifestDigestBindingSha256", "privateEvidencePresent",
  ], "s1_receipt_source_evidence");
  if (sourceEvidence.sourceCount !== 4) throw new Error("s1_receipt_source_count_mismatch");
  const expectedPrivateEvidence = sourceEvidence.status === "RECOMPUTED_PRIVATE_EVIDENCE_VERIFIED"
    ? true
    : sourceEvidence.status === "BOUND_TO_TRACKED_MANIFEST_CI"
      ? false
      : null;
  if (expectedPrivateEvidence === null || sourceEvidence.privateEvidencePresent !== expectedPrivateEvidence) {
    throw new Error("s1_receipt_source_status_private_binding_invalid");
  }
}

function validateS1ReceiptExternalEnvironment(externalEnvironment) {
  if (!Array.isArray(externalEnvironment) || externalEnvironment.length !== S1_EXTERNAL_ENV_NAMES.length) {
    throw new Error("s1_receipt_external_environment_count_mismatch");
  }
  assertExactArray(
    externalEnvironment.map((entry) => entry?.name),
    S1_EXTERNAL_ENV_NAMES,
    "s1_receipt_external_environment_names_mismatch",
  );
  for (const entry of externalEnvironment) {
    assertExactFields(entry, ["name", "present", "empty"], `s1_receipt_environment_${entry.name}`);
    if (typeof entry.present !== "boolean" || entry.empty !== true) {
      throw new Error(`s1_receipt_environment_not_empty_${entry.name}`);
    }
  }
}

function validateS1ReceiptCapabilities(capabilities) {
  assertExactFields(capabilities, ["node", "git", "python", "powershell"], "s1_receipt_capabilities");
  for (const name of ["node", "git", "python", "powershell"]) {
    const capability = capabilities[name];
    assertExactFields(capability, ["available", "version"], `s1_receipt_capability_${name}`);
    if (capability.available !== true || typeof capability.version !== "string" || capability.version === "") {
      throw new Error(`s1_receipt_capability_unavailable_${name}`);
    }
  }
}

function validateS1Execution(execution, { successRequired }) {
  assertExactFields(execution, [
    "commandId", "passed", "exitCode", "durationMs", "stdoutBytes", "stdoutSha256",
    "stderrBytes", "stderrSha256", "failureSummary",
  ], `s1_receipt_execution_${String(execution?.commandId)}`);
  if (typeof execution.passed !== "boolean"
      || !Number.isSafeInteger(execution.exitCode) || execution.exitCode < -1
      || !Number.isSafeInteger(execution.durationMs) || execution.durationMs < 0
      || !Number.isSafeInteger(execution.stdoutBytes) || execution.stdoutBytes < 0
      || !Number.isSafeInteger(execution.stderrBytes) || execution.stderrBytes < 0) {
    throw new Error(`s1_receipt_execution_count_invalid_${execution.commandId}`);
  }
  assertSha(execution.stdoutSha256, `s1_receipt_execution_stdout_sha_invalid_${execution.commandId}`);
  assertSha(execution.stderrSha256, `s1_receipt_execution_stderr_sha_invalid_${execution.commandId}`);
  assertPlainObject(execution.failureSummary, `s1_receipt_execution_failure_summary_invalid_${execution.commandId}`);
  if (successRequired && (execution.passed !== true || execution.exitCode !== 0
      || Object.keys(execution.failureSummary).length !== 0)) {
    throw new Error(`s1_receipt_execution_success_invalid_${execution.commandId}`);
  }
}

export function assertNoHardcodedRemotePass(sources) {
  if (!Array.isArray(sources) || sources.length === 0) throw new Error("source_texts_required");
  const forbidden = [
    /verifyWindows\s*[:=]\s*["']?success/iu,
    /verify-windows\s*[:=]\s*["']?success/iu,
    /ci(?:Linux|Windows|RunId)\s*[:=]\s*["']?(?:success|\d+)/iu,
    /hardcodedRemoteSuccess/iu,
    /remote[^\n]{0,80}\bsuccess\b/iu,
  ];
  for (const source of sources) {
    const text = String(source);
    if (forbidden.some((pattern) => pattern.test(text))) throw new Error("hardcoded_remote_pass_forbidden");
  }
  return true;
}

function validateBranchPolicy(policy) {
  assertPlainObject(policy, "branch_policy_must_be_object");
  assertExactFields(policy, [
    "directImplementationBranch", "ciAttachAlias", "allowedBranches",
  ], "branch_policy");
  if (policy.directImplementationBranch !== DIRECT_BRANCH || policy.ciAttachAlias !== CI_BRANCH) {
    throw new Error("branch_policy_identity_mismatch");
  }
  assertExactArray(policy.allowedBranches, [DIRECT_BRANCH, CI_BRANCH], "allowed_branches_mismatch");
}

function validateBatchDag(dag) {
  assertPlainObject(dag, "batch_dag_must_be_object");
  assertExactFields(dag, ["nodes", "edges", "independentReviewBatchAuthorized"], "batch_dag");
  assertExactArray(dag.nodes, S1_BATCHES, "batch_dag_nodes_mismatch");
  if (dag.independentReviewBatchAuthorized !== false) throw new Error("b8_must_not_be_authorized");
  if (!Array.isArray(dag.edges) || dag.edges.length !== 7) throw new Error("batch_dag_edge_count_mismatch");
  const expectedEdges = S1_BATCHES.slice(0, -1).map((from, index) => ({ from, to: S1_BATCHES[index + 1] }));
  if (stableStringify(dag.edges) !== stableStringify(expectedEdges)) throw new Error("batch_dag_edges_mismatch");
  validateVersionGraphAcyclic(dag.edges);
}

function validatePolicies(manifest) {
  assertExactFields(manifest.providerPolicy, ["mode", "allowedTransport", "requiredRequestDelta"], "provider_policy");
  if (manifest.providerPolicy.mode !== "forbidden"
      || manifest.providerPolicy.allowedTransport !== "deterministic_fake_and_loopback_only"
      || manifest.providerPolicy.requiredRequestDelta !== 0) throw new Error("provider_policy_invalid");
  assertExactFields(manifest.databasePolicy, ["mode", "allowedConnections"], "database_policy");
  if (manifest.databasePolicy.mode !== "forbidden" || manifest.databasePolicy.allowedConnections !== 0) {
    throw new Error("database_policy_invalid");
  }
  assertExactFields(manifest.networkPolicy, ["implementationAndTests", "gitRemote", "github"], "network_policy");
  if (manifest.networkPolicy.implementationAndTests !== "no_non_loopback_network"
      || manifest.networkPolicy.gitRemote !== "ordinary_non_force_fast_forward_push_only"
      || manifest.networkPolicy.github !== "pr_body_sync_and_exact_head_ci_verification_only") {
    throw new Error("network_policy_invalid");
  }
  assertExactFields(manifest.privateStatePolicy, [
    "existingHistorical", "newOutputRoot", "newOutputMustBeIgnored", "b6NewVersionedDerivedOnly",
    "atomicPromotionRequired", "overwriteHistoricalAllowed",
  ], "private_state_policy");
  if (manifest.privateStatePolicy.existingHistorical !== "content_and_file_metadata_immutable"
      || manifest.privateStatePolicy.newOutputRoot !== OUTPUT_ROOT
      || manifest.privateStatePolicy.newOutputMustBeIgnored !== true
      || manifest.privateStatePolicy.b6NewVersionedDerivedOnly !== true
      || manifest.privateStatePolicy.atomicPromotionRequired !== true
      || manifest.privateStatePolicy.overwriteHistoricalAllowed !== false) {
    throw new Error("private_state_policy_invalid");
  }
  assertExactFields(manifest.gitPolicy, [
    "directBranch", "pushMode", "fastForwardOnly", "maxCompletedAtomicCommitsUnpushed",
    "perAtomicCommitPushRequired", "perBatchRemoteExactHeadRequired",
    "perBatchLinuxWindowsCiRequired", "stashPolicy", "prohibitedHistoryRewrites",
  ], "git_policy");
  if (manifest.gitPolicy.directBranch !== DIRECT_BRANCH
      || manifest.gitPolicy.pushMode !== "ordinary_non_force"
      || manifest.gitPolicy.fastForwardOnly !== true
      || manifest.gitPolicy.maxCompletedAtomicCommitsUnpushed !== 1
      || manifest.gitPolicy.perAtomicCommitPushRequired !== true
      || manifest.gitPolicy.perBatchRemoteExactHeadRequired !== true
      || manifest.gitPolicy.perBatchLinuxWindowsCiRequired !== true
      || manifest.gitPolicy.stashPolicy !== "untouched") {
    throw new Error("git_policy_invalid");
  }
  assertExactArray(
    manifest.gitPolicy.prohibitedHistoryRewrites,
    ["force_push", "rebase", "squash", "amend"],
    "git_prohibited_history_rewrites_mismatch",
  );
}

function validateRegistryBindings(registries, bindings) {
  assertPlainObject(registries, "registries_must_be_object");
  assertExactFields(registries, Object.keys(EXPECTED_REGISTRY_BINDINGS), "registries");
  for (const [id, expectedPath] of Object.entries(EXPECTED_REGISTRY_BINDINGS)) {
    const binding = registries[id];
    assertPlainObject(binding, `registry_binding_${id}_must_be_object`);
    assertExactFields(binding, ["path", "sha256"], `registry_binding_${id}`);
    if (binding.path !== expectedPath) throw new Error(`registry_path_mismatch_${id}`);
    assertSha(binding.sha256, `registry_sha_invalid_${id}`);
    const bytes = bindings[`${id}Bytes`];
    if (bytes !== undefined && sha256PortableText(bytes) !== binding.sha256) {
      throw new Error(`registry_digest_mismatch_${id}`);
    }
  }
}

function validateRequiredSourceEvidence(sources) {
  if (!Array.isArray(sources) || sources.length !== EXPECTED_SOURCES.length) {
    throw new Error("required_source_evidence_count_mismatch");
  }
  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    assertPlainObject(source, "source_evidence_entry_must_be_object");
    assertExactFields(source, ["sourceId", "reportSha256", "receiptDigest"], "source_evidence_entry");
    if (stableStringify(source) !== stableStringify(EXPECTED_SOURCES[index])) {
      throw new Error(`source_evidence_binding_mismatch_${EXPECTED_SOURCES[index].sourceId}`);
    }
  }
}

function validateGovernance(governance) {
  assertPlainObject(governance, "governance_must_be_object");
  assertExactFields(governance, [
    "historicalDecision", "currentDecision", "openFindings", "findingRemediationAuthorized",
    "maximumImplementationStatus", "independentReviewPerformed", "providerDispatchAuthorized",
    "databaseConnectionsAuthorized", "canaryAuthorized", "b8Authorized", "markReadyAuthorized",
    "mergeAuthorized", "full160Authorized", "modelTrainingAuthorized", "holdoutAuthorized",
    "releaseAuthorized", "nextDevelopmentReadiness",
  ], "governance");
  if (governance.historicalDecision !== "CANARY_CONDITIONAL"
      || governance.currentDecision !== "CANARY_FAIL"
      || governance.openFindings !== 10
      || governance.findingRemediationAuthorized !== true
      || governance.maximumImplementationStatus !== "CANDIDATE_CLOSED_PENDING_INDEPENDENT_REVIEW"
      || governance.independentReviewPerformed !== false
      || governance.providerDispatchAuthorized !== false
      || governance.databaseConnectionsAuthorized !== false
      || governance.canaryAuthorized !== false
      || governance.b8Authorized !== false
      || governance.markReadyAuthorized !== false
      || governance.mergeAuthorized !== false
      || governance.full160Authorized !== false
      || governance.modelTrainingAuthorized !== false
      || governance.holdoutAuthorized !== false
      || governance.releaseAuthorized !== false
      || governance.nextDevelopmentReadiness !== "NOT_AUTHORIZED") {
    throw new Error("governance_policy_invalid");
  }
}

function validatePlannedCurrentAuthority(authority, { contracts, contractArtifactBytesByPath }) {
  assertPlainObject(authority, "planned_current_authority_must_be_object");
  assertExactFields(authority, [
    "activationBatch", "activationCondition", "currentStateIndex", "integrityRestatement",
    "preB6CurrentStateIndex", "preB6IntegrityRestatement", "historicalVersionsRemainImmutable",
  ], "planned_current_authority");
  for (const [field, schema, path] of [
    ["currentStateIndex", "m2-v2-current-state-index-v0.3", "docs/analysis/m2-v2/M2-v2-current-state-index-v0.3.json"],
    ["integrityRestatement", "m2.v2.canary-v3.1-integrity-restatement-public.v0.4", "docs/analysis/m2-v2/M2-v2-canary-v3-1-integrity-restatement-v0.4.json"],
  ]) {
    assertExactFields(authority[field], [
      "schema", "path", "status", "definitionContractId", "definitionPointer", "discriminatorPointer",
    ], `planned_${field}`);
    if (authority[field].schema !== schema || authority[field].path !== path || authority[field].status !== "PROPOSED_NOT_CURRENT") {
      throw new Error(`planned_current_authority_invalid_${field}`);
    }
    const contract = contracts.filter((entry) => entry.contractId === authority[field].definitionContractId);
    if (contract.length !== 1 || typeof authority[field].definitionPointer !== "string"
        || typeof authority[field].discriminatorPointer !== "string") {
      throw new Error(`planned_current_authority_definition_invalid_${field}`);
    }
    if (contractArtifactBytesByPath !== undefined) {
      const machineBytes = contractArtifactBytesByPath instanceof Map
        ? contractArtifactBytesByPath.get(contract[0].machinePath)
        : contractArtifactBytesByPath[contract[0].machinePath];
      if (machineBytes === undefined) throw new Error(`planned_current_authority_machine_missing_${field}`);
      const machineDocument = parseJsonUtf8Strict(machineBytes);
      const definitionNode = resolveJsonPointer(machineDocument, authority[field].definitionPointer);
      if (!definitionNode || typeof definitionNode !== "object" || Array.isArray(definitionNode)
          || resolveJsonPointer(machineDocument, authority[field].discriminatorPointer) !== authority[field].schema) {
        throw new Error(`planned_current_authority_pointer_mismatch_${field}`);
      }
    }
  }
  if (authority.activationBatch !== "B6"
      || authority.activationCondition !== "provider_free_candidate_validated_and_atomically_promoted"
      || authority.preB6CurrentStateIndex !== "m2-v2-current-state-index-v0.2"
      || authority.preB6IntegrityRestatement !== "m2.v2.canary-v3.1-integrity-restatement-public.v0.3"
      || authority.historicalVersionsRemainImmutable !== true) {
    throw new Error("planned_current_authority_invalid");
  }
}

function validateOpenFindingState(state) {
  assertPlainObject(state, "open_finding_state_must_be_object");
  assertExactFields(state, [
    "implementationAgentMaximumStatus", "currentStatusAtB0", "independentStatus", "closedClaimsAllowed",
  ], "open_finding_state");
  if (state.implementationAgentMaximumStatus !== "CANDIDATE_CLOSED_PENDING_INDEPENDENT_REVIEW"
      || state.currentStatusAtB0 !== "OPEN"
      || state.independentStatus !== "NOT_REVIEWED"
      || state.closedClaimsAllowed !== false) throw new Error("open_finding_state_invalid");
}

function validateContractAuthorization(authorization) {
  assertPlainObject(authorization, "contract_authorization_must_be_object");
  assertExactFields(authorization, [
    "currentDecision", "providerDispatchAuthorized", "databaseConnectionsAuthorized", "canaryAuthorized",
    "full160Authorized", "modelTrainingAuthorized", "holdoutAccessAuthorized",
    "independentReviewBatchB8Authorized", "markReadyAuthorized", "nextDevelopmentReadiness",
    "mergeAuthorized", "releaseAuthorized",
  ], "contract_authorization");
  if (authorization.currentDecision !== "CANARY_FAIL"
      || authorization.providerDispatchAuthorized !== false
      || authorization.databaseConnectionsAuthorized !== false
      || authorization.canaryAuthorized !== false
      || authorization.full160Authorized !== false
      || authorization.modelTrainingAuthorized !== false
      || authorization.holdoutAccessAuthorized !== false
      || authorization.independentReviewBatchB8Authorized !== false
      || authorization.markReadyAuthorized !== false
      || authorization.nextDevelopmentReadiness !== "NOT_AUTHORIZED"
      || authorization.mergeAuthorized !== false
      || authorization.releaseAuthorized !== false) throw new Error("contract_authorization_invalid");
}

function validateCorrections(corrections, cases) {
  if (!Array.isArray(corrections) || corrections.length !== 3) throw new Error("correction_count_mismatch");
  const expected = [
    ["PR7-P2-008-short-case", "windows"],
    ["PR7-P2-008-unc-unstable", "windows"],
    ["PR7-P2-008-posix-link-mount", "linux"],
  ];
  for (let index = 0; index < corrections.length; index += 1) {
    const correction = corrections[index];
    const [caseId, platform] = expected[index];
    assertExactFields(correction, [
      "caseId", "sourceFieldShape", "normalizedFieldShape", "proposedTestFile", "platforms",
    ], `correction_${caseId}`);
    assertExactFields(correction.sourceFieldShape, ["proposedTestFile", "platforms"], "correction_source_shape");
    assertExactFields(correction.normalizedFieldShape, ["proposedTestFile", "platforms"], "correction_normalized_shape");
    if (correction.caseId !== caseId
        || correction.sourceFieldShape.proposedTestFile !== "array"
        || correction.sourceFieldShape.platforms !== "string"
        || correction.normalizedFieldShape.proposedTestFile !== "string"
        || correction.normalizedFieldShape.platforms !== "array"
        || correction.proposedTestFile !== "test/m2-v2-private-state-migration.test.js"
        || stableStringify(correction.platforms) !== stableStringify([platform])) {
      throw new Error(`correction_invalid_${caseId}`);
    }
    const normalizedCase = cases.find((entry) => entry.caseId === caseId);
    if (!normalizedCase
        || normalizedCase.proposedTestFile !== correction.proposedTestFile
        || stableStringify(normalizedCase.platforms) !== stableStringify(correction.platforms)) {
      throw new Error(`correction_case_not_applied_${caseId}`);
    }
  }
}

function assertCountObject(actual, expected, message) {
  if (stableStringify(actual) !== stableStringify(expected)) throw new Error(message);
}

function requireSemanticDocument(documents, contractId) {
  const document = documents.get(contractId);
  if (document === undefined) throw new Error(`semantic_contract_missing_${contractId}`);
  return document;
}

function assertRuntimeSchemaDescriptor(schema, exactFields, prefix) {
  assertPlainObject(schema, `${prefix}_must_be_object`);
  assertExactArray(schema.exactFields, exactFields, `${prefix}_exact_fields_invalid`);
  if (schema.unknownFieldsRejected !== true) throw new Error(`${prefix}_unknown_fields_not_rejected`);
}

function assertUniqueStringArray(value, message) {
  if (!Array.isArray(value)
      || value.length === 0
      || value.some((item) => typeof item !== "string" || item.trim() === "")
      || new Set(value).size !== value.length) {
    throw new Error(message);
  }
}

function assertSameStringSet(actual, expected, message) {
  if (!Array.isArray(actual)
      || actual.some((value) => typeof value !== "string")
      || new Set(actual).size !== actual.length
      || stableStringify([...actual].sort()) !== stableStringify([...expected].sort())) {
    throw new Error(message);
  }
}

function assertExactArray(actual, expected, message) {
  if (!Array.isArray(actual) || stableStringify(actual) !== stableStringify(expected)) throw new Error(message);
}

function assertRepositoryRelativePath(value, message) {
  if (typeof value !== "string"
      || value === ""
      || value.includes("\\")
      || value.startsWith("/")
      || /^[A-Za-z]:/u.test(value)
      || value.split("/").includes("..")) throw new Error(message);
}

function assertExactFields(value, fields, prefix) {
  assertPlainObject(value, `${prefix}_must_be_object`);
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (stableStringify(actual) !== stableStringify(expected)) throw new Error(`${prefix}_fields_invalid`);
}

function assertPlainObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(message);
  }
}

function assertNonemptyString(value, message) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(message);
}

function assertNonemptyStringArray(value, message) {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new Error(message);
  }
}

function assertSha(value, message) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value)) throw new Error(message);
}

function normalizeComparablePath(value) {
  const normalized = String(value ?? "").replaceAll("\\", "/").replace(/\/$/u, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}
