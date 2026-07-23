import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, isAbsolute, resolve, sep } from "node:path";

import {
  CLOSED_ATOMIC_MEMBER_ROLES,
  CURRENT_CLOSED_REQUEST_STATE_BINDING_RELATIVE,
  buildClosedAtomicTransactionManifest,
  createClosedAtomicRequestBinding,
  createReceiptEnvelope,
  evaluateGitBoundaryCommandResult,
  migrateLegacyReceiptToEnvelopeV02,
  validateClosedAtomicRequestBinding,
  validateReceiptEnvelope,
} from "./integrityState.js";
import { validateCurrentAuthorityDocuments } from "./currentAuthority.js";
import {
  buildAuthorityDerivedInputBindings,
  buildAuthorityPhysicalMapping,
  buildAuthoritySelectionDecision,
  buildTrackedCoreCommitmentV0_1,
  deriveCanonicalAuthorityGraphV0_3,
  verifyCanonicalAuthorityGraph,
} from "./authorityGraph.js";
import { canonicalJson, sha256 } from "./pilotCore.js";
import {
  computeOfflineRecoverySourceSetDigest,
  deriveOfflineRecoveryTransactionId,
  promoteOfflineRecoveryGroup,
} from "./privateStateRecovery.js";
import {
  appendRequestEvent,
  projectCanonicalRequestAuthority,
  replayRequestEventLedger,
  validateRequestEventLedger,
} from "./requestEventLedger.js";
import {
  V2B7_BUNDLE_RELATIVE,
  V2B7_MANIFEST_RELATIVE,
} from "./v2b7Contract.js";
import {
  V2B8_START_SHA,
  V2B8_FILES,
  V2B8_PRIVATE_RELATIVE,
  V2B8_V2B7_PRIVATE_RELATIVE,
} from "./v2b8Contract.js";
import {
  recomputeV2B8CurrentRestatedEvaluation,
  recomputeV2B8HistoricalEvaluation,
  verifyV2B8,
} from "./v2b8Runtime.js";

export const PR7_P1_OFFLINE_REMEDIATION_SCHEMA = "m2.v2.pr7-p1-offline-remediation-private.v0.3";
export const PR7_P1_REMEDIATION_ROOT_RELATIVE = "data/private-output/m2-v2-pr7-p1-remediation";
export const PR7_P1_RECOVERY_TRANSACTION_ROOT_RELATIVE = `${PR7_P1_REMEDIATION_ROOT_RELATIVE}/recovery-transactions`;
export const PR7_P1_TRANSACTION_IDENTITY = "m2-v2-pr7-p1-offline-authority-v0.3";
export const PR7_S1_AUTHORIZED_PRIVATE_ROOT_RELATIVE =
  "data/private-output/m2-v2-pr7-s1-remediation-badbf45";
export const PR7_S1_B6_RECOVERY_TRANSACTION_ROOT_RELATIVE =
  `${PR7_S1_AUTHORIZED_PRIVATE_ROOT_RELATIVE}/b6-authority-recovery-v0.1/transactions`;
export const PR7_S1_B6_CURRENT_BINDING_RELATIVE =
  `${PR7_S1_AUTHORIZED_PRIVATE_ROOT_RELATIVE}/b6-authority-recovery-v0.1/current-binding-private-v0.2.json`;
export const PR7_S1_CANONICAL_AUTHORITY_CANDIDATE_SCHEMA = "m2.v2.pr7-s1-canonical-authority-candidate.private.v0.1";

export const PR7_P1_CURRENT_AUTHORITY_RELATIVE = "docs/analysis/m2-v2/M2-v2-current-state-index-v0.2.json";
export const PR7_P1_CURRENT_RESTATEMENT_RELATIVE = "docs/analysis/m2-v2/M2-v2-canary-v3-1-integrity-restatement-v0.3.json";

export const PR7_P1_V2B8_PUBLIC_REPORTS = Object.freeze([
  "docs/analysis/m2-v2/M2-v2-claim-canonicalization-v0.1.json",
  "docs/analysis/m2-v2/M2-v2-claim-canonicalization-v0.1.md",
  "docs/analysis/m2-v2/M2-v2-event-time-conflict-audit-v0.1.json",
  "docs/analysis/m2-v2/M2-v2-event-time-conflict-audit-v0.1.md",
  "docs/analysis/m2-v2/M2-v2-source-classification-audit-v0.1.json",
  "docs/analysis/m2-v2/M2-v2-source-classification-audit-v0.1.md",
  "docs/analysis/m2-v2/M2-v2-canary-v3-1-execution-summary-v0.1.json",
  "docs/analysis/m2-v2/M2-v2-canary-v3-1-execution-summary-v0.1.md",
  "docs/analysis/m2-v2/M2-v2-canary-v3-1-reproducibility-v0.1.json",
  "docs/analysis/m2-v2/M2-v2-canary-v3-1-reproducibility-v0.1.md",
  "docs/analysis/m2-v2/M2-v2-canary-v3-1-decision-v0.1.json",
  "docs/analysis/m2-v2/M2-v2-canary-v3-1-decision-v0.1.md",
  "docs/analysis/m2-v2/M2-v2-v2b8-next-step-v0.1.json",
  "docs/analysis/m2-v2/M2-v2-v2b8-next-step-v0.1.md",
]);

export const PR7_P1_FROZEN_UPSTREAM_PATHS = Object.freeze([
  V2B7_MANIFEST_RELATIVE,
  V2B7_BUNDLE_RELATIVE,
  `${V2B8_V2B7_PRIVATE_RELATIVE}/v2b7-execution-state-private-v0.1.json`,
  `${V2B8_V2B7_PRIVATE_RELATIVE}/canary-v3-primary-search-private-v0.2.json`,
  `${V2B8_V2B7_PRIVATE_RELATIVE}/canary-v3-repeat-search-private-v0.2.json`,
  `${V2B8_V2B7_PRIVATE_RELATIVE}/canary-v3-evidence-records-private-v0.2.ndjson`,
]);

const B8_PATHS = Object.freeze({
  contract: `${V2B8_PRIVATE_RELATIVE}/${V2B8_FILES.contract}`,
  fallbackSearch: `${V2B8_PRIVATE_RELATIVE}/${V2B8_FILES.fallbackSearch}`,
  primarySearch: `${V2B8_PRIVATE_RELATIVE}/${V2B8_FILES.primarySearch}`,
  repeatSearch: `${V2B8_PRIVATE_RELATIVE}/${V2B8_FILES.repeatSearch}`,
  relayReceipts: `${V2B8_PRIVATE_RELATIVE}/${V2B8_FILES.relayReceipts}`,
  historicalEvaluation: `${V2B8_PRIVATE_RELATIVE}/${V2B8_FILES.evaluation}`,
  v2b7PrimarySearch: `${V2B8_V2B7_PRIVATE_RELATIVE}/canary-v3-primary-search-private-v0.2.json`,
  v2b7RepeatSearch: `${V2B8_V2B7_PRIVATE_RELATIVE}/canary-v3-repeat-search-private-v0.2.json`,
  v2b7Evidence: `${V2B8_V2B7_PRIVATE_RELATIVE}/canary-v3-evidence-records-private-v0.2.ndjson`,
});

const GENERATED_CLOSED_ROLES = Object.freeze(CLOSED_ATOMIC_MEMBER_ROLES.filter((role) => ![
  "execution_contract",
  "current_authority",
  "current_restatement",
].includes(role)));

const RECOVERY_AUXILIARY_ROLES = Object.freeze(["receipt_envelopes", "receipt_migration"]);
const RECOVERY_ROLE_REGISTRY = Object.freeze({
  requiredRoles: [...GENERATED_CLOSED_ROLES, ...RECOVERY_AUXILIARY_ROLES],
  optionalRoles: [],
});

/**
 * Construct and verify the B6 authority candidate entirely in memory. The
 * caller remains responsible for versioned persistence and atomic promotion;
 * this function cannot mutate historical or governed-private state.
 */
export function buildPr7S1CanonicalAuthorityCandidate(input) {
  if (!isPlainObject(input)) throw new Error("pr7_s1_authority_candidate_input_invalid");
  const graph = deriveCanonicalAuthorityGraphV0_3({
    physicalMappings: input.physicalMappings,
    selectionDecisions: input.selectionDecisions,
  });
  const trackedCoreCommitment = buildTrackedCoreCommitmentV0_1({
    graph,
    sourceExactHead: input.sourceExactHead,
    supersessionLineage: input.supersessionLineage,
  });
  const verification = verifyCanonicalAuthorityGraph({
    graph,
    evidence: input.evidence,
    trackedCoreCommitment,
  });
  if (!verification.valid) {
    throw new Error(`pr7_s1_authority_candidate_invalid:${verification.issues.join(",")}`);
  }
  return {
    schema: PR7_S1_CANONICAL_AUTHORITY_CANDIDATE_SCHEMA,
    privateOnly: true,
    graph,
    trackedCoreCommitment,
    verification: {
      allPassed: true,
      graphDigestSha256: verification.graphDigestSha256,
      roleRegistryDigestSha256: verification.roleRegistryDigestSha256,
      expectedGraphCoreDigestSha256: verification.expectedGraphCoreDigestSha256,
    },
    providerRequestDelta: 0,
    promoted: false,
  };
}

export function buildPr7S1B6AuthorityDocuments(prepared, input) {
  assertPrepared(prepared);
  const summary = requiredPublicDocument(input?.remediationSummary, "pr7_s1_b6_summary_invalid");
  const readiness = requiredPublicDocument(input?.mergeReadiness, "pr7_s1_b6_readiness_invalid");
  const commitment = requiredPublicDocument(input?.trackedCoreCommitment, "pr7_s1_b6_commitment_invalid");
  const commitmentPath = "docs/analysis/m2-v2/M2-v2-PR7-core-commitment-v0.1.json";
  const commitmentRead = readJsonGoverned(prepared.root, commitmentPath);
  if (canonicalJson(commitmentRead.value) !== canonicalJson(commitment)) {
    throw new Error("pr7_s1_b6_commitment_content_mismatch");
  }
  const commitmentDigest = commitmentRead.byteDigest;
  const transactionContext = buildB6TransactionContext(prepared);
  const provisionalPlan = buildPr7P1ClosedRecoveryMembers(prepared, transactionContext, {
    skipCanonicalAuthorityGraph: true,
  });
  const computation = buildCurrentDecisionComputation(prepared);
  const unchangedBoundaries = unchangedB6Boundaries();
  const restatementSemantic = {
    schema: "m2.v2.canary-v3.1-integrity-restatement-public.v0.4",
    sourceExactHead: commitment.sourceExactHead,
    historicalDecision: prepared.historicalEvaluation.decision,
    historicalEvaluationVerified: true,
    currentRestatedDecision: prepared.currentRestatedEvaluation.decision,
    currentRestatementVerified: true,
    currentDecisionComputation: computation,
    unchangedBoundaries,
  };
  const indexSemantic = {
    schemaVersion: "m2-v2-current-state-index-v0.3",
    sourceExactHead: commitment.sourceExactHead,
    historicalV2B8Decision: prepared.historicalEvaluation.decision,
    currentDecision: prepared.currentRestatedEvaluation.decision,
    currentDecisionComputation: computation,
    full160Authorized: false,
    modelTrainingAuthorized: false,
    nextDevelopmentReadiness: "NOT_AUTHORIZED",
    unchangedBoundaries,
  };
  const graph = buildB6CanonicalAuthorityGraph(prepared, provisionalPlan, {
    remediationSummary: summary,
    mergeReadiness: readiness,
    restatementSemantic,
    indexSemantic,
    trackedCoreCommitment: commitment,
  });
  const commitmentVerification = verifyCanonicalAuthorityGraph({
    graph,
    evidence: buildB6CanonicalAuthorityEvidence(prepared, provisionalPlan, graph),
    trackedCoreCommitment: commitment,
  });
  if (!commitmentVerification.valid) {
    const completed = new Set(documentsTupleKeys(
      projectCanonicalRequestAuthority(prepared.receiptState.ledger).completedPhysicalDispatches,
    ));
    const indexed = new Set(documentsTupleKeys(
      buildB6CanonicalAuthorityEvidence(prepared, provisionalPlan, graph).receiptIndexEntries,
    ));
    const envelopeDiagnostic = diagnoseB6EnvelopeBindings(
      prepared,
      buildB6CanonicalAuthorityEvidence(prepared, provisionalPlan, graph),
    );
    throw new Error(
      `pr7_s1_b6_authority_graph_invalid:${commitmentVerification.issues.join(",")}`
      + `:completed=${completed.size}:indexed=${indexed.size}`
      + `:missing=${[...completed].filter((key) => !indexed.has(key)).length}`
      + `:extra=${[...indexed].filter((key) => !completed.has(key)).length}`
      + `:envelope=${envelopeDiagnostic}`
      + `:checks=${Buffer.from(JSON.stringify(commitmentVerification.checks)).toString("base64url")}`,
    );
  }
  const supersessionBase = {
    transactionId: transactionContext.transactionId,
    transactionDigestSha256: sha256({
      transactionId: transactionContext.transactionId,
      sourceSetDigest: transactionContext.sourceSetDigest,
      contractDigest: prepared.contractDigest,
      transactionIdentity: transactionContext.transactionIdentity,
    }),
    reason: "B6_PROVIDER_FREE_ATOMIC_PROMOTION",
  };
  const restatementPayload = {
    ...restatementSemantic,
    status: "current_digest_bound",
    classification: "public_sanitized_not_for_formal_decision",
    authorityBindings: {
      graphDigestSha256: graph.graphDigestSha256,
      derivedEvaluationDigestSha256: sha256(prepared.currentRestatedEvaluation),
      executionContractDigestSha256: prepared.contractDigest,
      eventSemanticsProfileDigestSha256: b6EventSemanticsProfileDigest(prepared.root),
      trackedCoreCommitmentDigestSha256: commitmentDigest,
    },
    supersession: {
      predecessorPath: prepared.currentRestatement.relativePath,
      predecessorDigestSha256: prepared.currentRestatement.byteDigest,
      ...supersessionBase,
    },
    unchangedBoundaries,
  };
  const restatement = {
    ...restatementPayload,
    restatementDigestSha256: sha256(restatementPayload),
  };
  const bindings = [
    publicReportBinding("remediation_summary",
      "docs/analysis/m2-v2/M2-v2-PR7-P1-remediation-summary-v0.2.json", summary),
    publicReportBinding("merge_readiness",
      "docs/analysis/m2-v2/M2-v2-PR7-merge-readiness-v0.2.json", readiness),
    publicReportBinding("current_integrity_restatement",
      "docs/analysis/m2-v2/M2-v2-canary-v3-1-integrity-restatement-v0.4.json", restatement),
  ];
  const historicalArtifacts = [
    historicalAuthorityRecord(prepared.currentAuthority, "m2-v2-current-state-index-v0.2", prepared.authority.currentRestatedDecision),
    historicalAuthorityRecord(prepared.currentRestatement, "m2.v2.canary-v3.1-integrity-restatement-public.v0.3", prepared.authority.currentRestatedDecision),
  ];
  const indexPayload = {
    ...indexSemantic,
    status: "current_digest_bound",
    classification: "public_sanitized_not_for_formal_decision",
    updatedAt: prepared.createdAt,
    currentAuthority: {
      graphDigestSha256: graph.graphDigestSha256,
      trackedCoreCommitmentPath: "docs/analysis/m2-v2/M2-v2-PR7-core-commitment-v0.1.json",
      trackedCoreCommitmentDigestSha256: commitmentDigest,
      currentRestatementPath:
        "docs/analysis/m2-v2/M2-v2-canary-v3-1-integrity-restatement-v0.4.json",
      currentRestatementDigestSha256: sha256Buffer(jsonBytes(restatement)),
      publicReportBindings: bindings,
      promotionReceiptDigestSha256: supersessionBase.transactionDigestSha256,
    },
    supersession: {
      predecessorPath: prepared.currentAuthority.relativePath,
      predecessorDigestSha256: prepared.currentAuthority.byteDigest,
      ...supersessionBase,
    },
    historicalArtifacts,
    entries: [
      {
        artifact: "canary-v3.1 historical execution",
        version: "v0.1",
        stage: "V2-B8",
        status: "historical_verified",
        lifecycle: "historical",
        decision: prepared.historicalEvaluation.decision,
        safeNextAction: "none",
      },
      {
        artifact: "PR7 provider-free integrity restatement",
        version: "v0.4",
        stage: "B6",
        status: "current_digest_bound",
        lifecycle: "current",
        decision: prepared.currentRestatedEvaluation.decision,
        safeNextAction: "independent_B8_review",
      },
    ],
    unchangedBoundaries,
  };
  const currentStateIndex = {
    ...indexPayload,
    indexDigestSha256: sha256(indexPayload),
  };
  return {
    schema: "m2.v2.pr7-s1-b6-authority-documents.private.v0.1",
    privateOnly: true,
    transactionContext,
    graph,
    evidence: buildB6CanonicalAuthorityEvidence(prepared, provisionalPlan, graph),
    remediationSummary: summary,
    mergeReadiness: readiness,
    integrityRestatement: restatement,
    currentStateIndex,
    providerRequestDelta: 0,
  };
}

/**
 * Read and recompute the remediation inputs without mutating private state.
 * Historical derived output is used only as a parity reference; it is not
 * registered as an authoritative recovery source.
 */
export function preparePr7P1OfflineRemediation(root, options = {}) {
  const absoluteRoot = resolve(root);
  const loaded = loadExistingB8Artifacts(absoluteRoot, options);
  const migratedAt = requiredTimestamp(
    options.migratedAt
      ?? loaded.currentRestatement?.restatedContract?.evaluatedAt
      ?? loaded.currentRestatement?.generatedAt
      ?? loaded.currentRestatement?.restatedAt,
    "pr7_p1_migration_timestamp_missing",
  );
  const receiptState = buildPr7P1OfflineReceiptState({
    relayReceipts: loaded.physicalReceipts,
    fallbackQueries: loaded.fallbackQueries,
    repeatSearch: loaded.repeatSearch,
    migratedAt,
  });
  const gitBoundary = options.gitBoundary ?? auditGitBoundary(absoluteRoot);
  if (!gitBoundary.auditSucceeded || !gitBoundary.b4Unchanged || !gitBoundary.holdoutSealed) {
    throw new Error("pr7_p1_git_boundary_invalid");
  }

  const historicalMatch = recomputeHistoricalExactly(loaded.results, loaded.historicalEvaluation, {
    root: absoluteRoot,
    gitBoundary,
  });
  const currentEvaluatedAt = requiredTimestamp(
    options.currentEvaluatedAt
      ?? loaded.currentRestatement?.restatedContract?.evaluatedAt
      ?? loaded.currentRestatement?.currentEvaluationEvaluatedAt
      ?? loaded.currentRestatement?.generatedAt
      ?? loaded.currentRestatement?.restatedAt,
    "pr7_p1_current_evaluated_at_missing",
  );
  const currentRestatedEvaluation = recomputeV2B8CurrentRestatedEvaluation(
    loaded.results,
    receiptState.relayEnvelopes,
    {
      root: absoluteRoot,
      gitBoundary,
      evaluatedAt: currentEvaluatedAt,
      allTestsPassed: historicalMatch.flags.allTestsPassed,
      manifestUnchanged: true,
      validationPending: historicalMatch.flags.validationPending,
      providerBlocked: historicalMatch.flags.providerBlocked,
    },
  );
  const predecessorRestatementBinding = inspectRestatementEvaluationBinding(
    loaded.currentRestatement,
    currentRestatedEvaluation,
  );

  const immutableManifests = buildArtifactIndex(absoluteRoot, {
    schema: "m2.v2.v2b8-immutable-manifests-private.v0.2",
    paths: [V2B7_MANIFEST_RELATIVE],
  });
  const frozenUpstreamDigests = buildArtifactIndex(absoluteRoot, {
    schema: "m2.v2.v2b8-frozen-upstream-digests-private.v0.2",
    paths: PR7_P1_FROZEN_UPSTREAM_PATHS,
  });
  const contractBoundPublicReportDigests = buildArtifactIndex(absoluteRoot, {
    schema: "m2.v2.v2b8-contract-bound-public-report-digests-private.v0.2",
    paths: PR7_P1_V2B8_PUBLIC_REPORTS,
  });

  const sources = buildRecoverySources(absoluteRoot);
  const prepared = {
    schema: PR7_P1_OFFLINE_REMEDIATION_SCHEMA,
    root: absoluteRoot,
    migratedAt,
    createdAt: currentEvaluatedAt,
    contractDigest: loaded.contract.contractDigest,
    executionContract: loaded.executionContractRead,
    currentAuthority: loaded.currentAuthorityRead,
    currentRestatement: loaded.currentRestatementRead,
    authority: loaded.authority,
    results: loaded.results,
    historicalEvaluation: historicalMatch.evaluation,
    currentRestatedEvaluation,
    predecessorRestatementBinding,
    receiptState,
    immutableManifests,
    frozenUpstreamDigests,
    contractBoundPublicReportDigests,
    manifestByteDigest: readGovernedFile(absoluteRoot, V2B7_MANIFEST_RELATIVE).byteDigest,
    sourceBundleByteDigest: readGovernedFile(absoluteRoot, V2B7_BUNDLE_RELATIVE).byteDigest,
    sources,
    gitBoundary,
    requireV2B8Verification: options.requireV2B8Verification !== false,
    providerRequestDelta: 0,
    full160Authorized: false,
  };
  return { prepared, summary: summarizePrepared(prepared, "INPUTS_VERIFIED_NO_WRITE") };
}

export function runPr7P1OfflineRemediation(root, options = {}) {
  const { prepared } = preparePr7S1B6Promotion(root, options);
  const promotion = promotePreparedPr7P1OfflineRemediation(prepared, options);
  return { ...summarizePrepared(prepared, promotion.status), promotion };
}

export function preparePr7S1B6Promotion(root, options = {}) {
  const { prepared } = preparePr7P1OfflineRemediation(root, options);
  const paths = {
    summary: "docs/analysis/m2-v2/M2-v2-PR7-P1-remediation-summary-v0.2.json",
    readiness: "docs/analysis/m2-v2/M2-v2-PR7-merge-readiness-v0.2.json",
    restatement: "docs/analysis/m2-v2/M2-v2-canary-v3-1-integrity-restatement-v0.4.json",
    index: "docs/analysis/m2-v2/M2-v2-current-state-index-v0.3.json",
    commitment: "docs/analysis/m2-v2/M2-v2-PR7-core-commitment-v0.1.json",
  };
  const reads = Object.fromEntries(
    Object.entries(paths).map(([role, path]) => [role, readJsonGoverned(prepared.root, path)]),
  );
  const expected = buildPr7S1B6AuthorityDocuments(prepared, {
    remediationSummary: reads.summary.value,
    mergeReadiness: reads.readiness.value,
    trackedCoreCommitment: reads.commitment.value,
  });
  for (const [role, expectedValue] of [
    ["restatement", expected.integrityRestatement],
    ["index", expected.currentStateIndex],
  ]) {
    if (canonicalJson(reads[role].value) !== canonicalJson(expectedValue)) {
      throw new Error(`pr7_s1_b6_${role}_document_drift`);
    }
  }
  const authority = validateCurrentAuthorityDocuments({
    index: reads.index.value,
    restatement: reads.restatement.value,
    root: prepared.root,
    indexRelativePath: reads.index.relativePath,
    indexByteDigest: reads.index.byteDigest,
    restatementRelativePath: reads.restatement.relativePath,
    restatementByteDigest: reads.restatement.byteDigest,
    graph: expected.graph,
    trackedCoreCommitment: reads.commitment.value,
    trackedCoreCommitmentRelativePath: reads.commitment.relativePath,
    trackedCoreCommitmentByteDigest: reads.commitment.byteDigest,
  });
  if (!authority.valid) {
    throw new Error(`pr7_s1_b6_current_authority_invalid:${authority.issues.join(",")}`);
  }
  prepared.currentAuthority = reads.index;
  prepared.currentRestatement = reads.restatement;
  prepared.authority = authority;
  prepared.canonicalAuthorityGraph = expected.graph;
  prepared.canonicalAuthorityEvidence = expected.evidence;
  prepared.b6AuthorityDocuments = expected;
  prepared.b6TransactionIdentity = expected.transactionContext.transactionIdentity;
  return { prepared, summary: summarizePrepared(prepared, "B6_AUTHORITY_INPUTS_VERIFIED_NO_WRITE") };
}

export function promotePreparedPr7P1OfflineRemediation(prepared, options = {}) {
  assertPrepared(prepared);
  const planByTransaction = new Map();
  const pointerRelative = options.pointerRelative ?? PR7_S1_B6_CURRENT_BINDING_RELATIVE;
  const recovery = promoteOfflineRecoveryGroup({
    root: prepared.root,
    sources: prepared.sources,
    roleRegistry: RECOVERY_ROLE_REGISTRY,
    contractDigest: prepared.contractDigest,
    transactionIdentity: options.transactionIdentity
      ?? prepared.b6TransactionIdentity
      ?? defaultTransactionIdentity(prepared),
    transactionRootRelative: options.transactionRootRelative ?? PR7_S1_B6_RECOVERY_TRANSACTION_ROOT_RELATIVE,
    pointerRelative,
    ...(options.faultAt ? { faultAt: options.faultAt } : {}),
    buildMembers: (context) => {
      const plan = buildPr7P1ClosedRecoveryMembers(prepared, context);
      planByTransaction.set(context.transactionId, plan);
      return plan.members;
    },
    buildCurrentPointer: (context) => {
      const plan = planByTransaction.get(context.transactionId);
      if (!plan) throw new Error("pr7_p1_recovery_plan_missing");
      const manifestMember = plan.members.find((member) => member.role === "transaction_manifest");
      const manifestPath = `${context.finalDirectoryRelative}/${manifestMember.relativePath}`;
      return createClosedAtomicRequestBinding({
        scope: "v2b8",
        transactionId: context.transactionId,
        members: [
          ...plan.closedManifest.members,
          { role: "transaction_manifest", path: manifestPath, byteDigest: sha256Buffer(manifestMember.bytes) },
        ],
      });
    },
    evaluateGates: ({ transactionId, providerRequestDelta }) => {
      const plan = planByTransaction.get(transactionId);
      const validation = validatePreparedPlan(prepared, plan, { phase: "in_memory" });
      return {
        authoritativeSourcesOnly: prepared.sources.every((source) => source.role !== "public_report"),
        currentAuthorityVerified: prepared.authority.valid === true,
        historicalEvaluationRecomputed: canonicalJson(prepared.historicalEvaluation) === canonicalJson(prepared.results.evaluation),
        currentEvaluationDigestBound:
          (prepared.currentRestatement.value?.currentDecisionComputation?.evaluationDigestSha256
            ?? prepared.currentRestatement.value?.restatedContract?.evaluationDigest)
          === sha256(prepared.currentRestatedEvaluation),
        requestLedgerReplays: prepared.receiptState.ledgerValidation.valid === true,
        closedRoleSetExact: plan?.closedDescriptors.length === CLOSED_ATOMIC_MEMBER_ROLES.length,
        candidateValid: validation.valid,
        providerDeltaZero: providerRequestDelta === 0,
        full160FailClosed: prepared.full160Authorized === false,
      };
    },
    validateCandidate: ({ phase, candidateRoot, transactionId, providerRequestDelta }) => {
      if (providerRequestDelta !== 0) return { valid: false, issues: ["provider_delta_nonzero"] };
      const plan = planByTransaction.get(transactionId);
      const validation = validatePreparedPlan(prepared, plan, { phase, candidateRoot });
      if (!validation.valid || phase !== "current") return validation;
      const closed = validateClosedAtomicRequestBinding(prepared.root, {
        bindingRelativePath: pointerRelative,
        scope: "v2b8",
        eventStage: "v2b8",
        canonicalAuthorityEvidence: prepared.canonicalAuthorityEvidence,
      });
      const issues = closed.valid ? [] : closed.issues.map((issue) => `closed:${issue}`);
      if (closed.valid && prepared.requireV2B8Verification) {
        const verdict = verifyV2B8(prepared.root, {
          bindingRelativePath: pointerRelative,
          gitBoundary: prepared.gitBoundary,
        });
        if (!verdict.allPassed) issues.push(...verdict.issues.map((issue) => `v2b8:${issue}`));
      }
      return { valid: issues.length === 0, issues };
    },
  });
  const closed = validateClosedAtomicRequestBinding(prepared.root, {
    bindingRelativePath: pointerRelative,
    scope: "v2b8",
    eventStage: "v2b8",
    canonicalAuthorityEvidence: prepared.canonicalAuthorityEvidence,
  });
  if (!closed.valid) throw new Error(`pr7_p1_promoted_binding_invalid:${closed.issues.join(",")}`);
  if (prepared.requireV2B8Verification) {
    const verdict = verifyV2B8(prepared.root, {
      bindingRelativePath: pointerRelative,
      gitBoundary: prepared.gitBoundary,
    });
    if (!verdict.allPassed) throw new Error(`pr7_p1_promoted_v2b8_invalid:${verdict.issues.join(",")}`);
  }
  return recovery;
}

/**
 * Convert only observed physical receipts. A cache observation reuses the
 * already migrated physical receipt and creates no reservation or dispatch.
 */
export function buildPr7P1OfflineReceiptState(input) {
  const migratedAt = requiredTimestamp(input.migratedAt, "pr7_p1_migrated_at_invalid");
  const relayReceipts = ensureArray(input.relayReceipts, "pr7_p1_relay_receipts_invalid");
  const searchQueries = [
    ...ensureArray(input.fallbackQueries, "pr7_p1_fallback_queries_invalid"),
    ...ensureArray(input.repeatSearch, "pr7_p1_repeat_search_invalid").flatMap((run) => ensureArray(run.queries ?? [], "pr7_p1_repeat_queries_invalid")),
  ];
  const physicalQueries = searchQueries.filter((query) => query?.cacheHit !== true);
  const cacheHits = searchQueries.filter((query) => query?.cacheHit === true);
  const seenLegacyDigests = new Set();
  const tavilyRows = physicalQueries.map((query) => {
    const legacy = query?.providerReceipt;
    if (!isPlainObject(legacy)) throw new Error("pr7_p1_tavily_provider_receipt_missing");
    if (seenLegacyDigests.has(legacy.receiptDigest)) throw new Error("pr7_p1_tavily_physical_receipt_duplicate");
    seenLegacyDigests.add(legacy.receiptDigest);
    const providerReceiptMigration = migrateLegacyReceiptToEnvelopeV02(legacy, { migratedAt });
    const artifactPayload = {
      ...omitKeys(query, ["cacheHit"]),
      country: typeof query.country === "string" ? query.country : "",
    };
    const envelope = createReceiptEnvelope(artifactPayload, {
      cacheHit: false,
      readAt: null,
      selectedAsEffective: true,
    });
    return {
      kind: "tavily",
    query: artifactPayload,
      envelope,
      migration: {
        schema: "m2.v2.tavily-query-artifact-envelope-migration.v0.2",
        oldDigest: providerReceiptMigration.migration.oldDigest,
        newDigest: envelope.receiptDigest,
        reason: "actual_query_artifact_enveloped",
        immutablePayloadDigest: envelope.receiptDigest,
        runtimeFieldsRemoved: ["cacheHit"],
        migratedAt,
        migrationVersion: "receipt-envelope-v0.2",
      },
    };
  });
  const relayRows = relayReceipts.map((legacy) => {
    const migrated = migrateLegacyReceiptToEnvelopeV02(legacy, { migratedAt });
    return { kind: "relay", legacy, ...migrated };
  });
  const oldToNewDigest = new Map([...tavilyRows, ...relayRows].map((row) => [row.migration.oldDigest, row.envelope.receiptDigest]));
  for (const hit of cacheHits) {
    if (!oldToNewDigest.has(hit?.providerReceipt?.receiptDigest)) {
      throw new Error("pr7_p1_cache_hit_without_physical_receipt");
    }
  }

  const tavilySorted = [...tavilyRows].sort(compareTavilyRows);
  const relaySorted = [...relayRows].sort(compareRelayRows);
  const envelopeRows = [...tavilySorted, ...relaySorted];
  let ledger = [];
  for (const row of tavilySorted) ledger = appendPhysicalLedgerEvents(ledger, tavilyEventFact(row));
  for (const row of relaySorted) ledger = appendPhysicalLedgerEvents(ledger, relayEventFact(row));
  for (const hit of [...cacheHits].sort(compareSearchQueries)) {
    const fact = tavilyCacheHitFact(hit, oldToNewDigest.get(hit.providerReceipt.receiptDigest));
    ledger = appendRequestEvent(ledger, { ...fact, eventType: "planned", receiptDigest: null });
    ledger = appendRequestEvent(ledger, { ...fact, eventType: "cache_hit_observed" });
  }
  const ledgerValidation = validateRequestEventLedger(ledger, { stage: "v2b8" });
  if (!ledgerValidation.valid) throw new Error(`pr7_p1_request_ledger_invalid:${ledgerValidation.issues.join(",")}`);
  const replay = replayRequestEventLedger(ledger, { stage: "v2b8" });
  const expected = {
    planned: envelopeRows.length + cacheHits.length,
    reserved: envelopeRows.length,
    dispatched: envelopeRows.length,
    completed: envelopeRows.length,
    indeterminate: 0,
    providerFailed: 0,
    contractFailed: 0,
    cacheHit: cacheHits.length,
  };
  if (canonicalJson(replay.counters) !== canonicalJson(expected)) {
    throw new Error("pr7_p1_request_counter_projection_unexpected");
  }
  return {
    envelopeRows,
    tavilyEnvelopes: tavilySorted.map((row) => row.envelope),
    relayEnvelopes: relaySorted.map((row) => row.envelope),
    cacheHitCount: cacheHits.length,
    ledger,
    ledgerValidation,
    counters: replay.counters,
    migration: {
      schema: "m2.v2.pr7-p1-receipt-envelope-migration-private.v0.2",
      privateOnly: true,
      migratedAt,
      physicalReceiptCount: envelopeRows.length,
      tavilyPhysicalReceiptCount: tavilySorted.length,
      relayPhysicalReceiptCount: relaySorted.length,
      cacheHitObservationCount: cacheHits.length,
      entries: envelopeRows.map((row) => ({
        providerClass: row.kind,
        oldDigest: row.migration.oldDigest,
        newDigest: row.migration.newDigest,
        reason: row.migration.reason,
        runtimeFieldsRemoved: row.migration.runtimeFieldsRemoved,
      })),
      ambiguityCount: 0,
      indeterminateCount: 0,
      providerRequestDelta: 0,
      full160Authorized: false,
    },
    providerRequestDelta: 0,
  };
}

export function buildPr7P1ClosedRecoveryMembers(prepared, context, options = {}) {
  assertPrepared(prepared);
  const transactionId = requiredToken(context.transactionId, "pr7_p1_transaction_id_invalid");
  const finalDirectoryRelative = normalizeRelativePath(context.finalDirectoryRelative);
  const receiptRelativePath = `${finalDirectoryRelative}/receipt-envelopes-private-v0.2.ndjson`;
  const receiptBytes = ndjsonBytes(prepared.receiptState.envelopeRows.map((row) => row.envelope));
  const receiptLines = prepared.receiptState.envelopeRows.map((row, index) => ({ row, lineNumber: index + 1 }));
  const receiptIndex = {
    schema: "m2.v2.request-receipt-index.v0.2",
    privateOnly: true,
    scope: "v2b8",
    transactionId,
    entries: receiptLines.map(({ row, lineNumber }) => ({
      receiptDigest: row.envelope.receiptDigest,
      path: receiptRelativePath,
      lineNumber,
    })),
  };
  const cacheIndex = {
    schema: "m2.v2.request-cache-index.v0.2",
    privateOnly: true,
    scope: "v2b8",
    transactionId,
    entries: receiptLines.map(({ row }) => cacheReference(row, transactionId)),
  };
  const effectiveReceiptIndex = buildEffectiveReceiptIndex(prepared, receiptLines, receiptRelativePath);
  const ledgerBytes = jsonBytes(prepared.receiptState.ledger);
  const effectiveReceiptIndexBytes = jsonBytes(effectiveReceiptIndex);
  const state = {
    schema: "m2.v2.v2b8-offline-remediated-state-private.v0.3",
    privateOnly: true,
    scope: "v2b8",
    transactionId,
    requestCounters: prepared.receiptState.counters,
    requestEventLedgerDigest: sha256Buffer(ledgerBytes),
    physicalReceiptCount: prepared.receiptState.envelopeRows.length,
    effectiveReceiptCount: effectiveReceiptIndex.entries.length,
    cacheHitObservationCount: prepared.receiptState.cacheHitCount,
    providerRequestDelta: 0,
    canaryExecutedDuringRecovery: false,
    modelTrainingPerformed: false,
    full160Authorized: false,
    nextDevelopmentReadiness: "NOT_AUTHORIZED",
  };
  const counterProjection = {
    schema: "m2.v2.request-counter-projection-private.v0.2",
    privateOnly: true,
    scope: "v2b8",
    transactionId,
    counters: prepared.receiptState.counters,
    requestEventLedgerDigest: sha256Buffer(ledgerBytes),
    requestCounterReset: false,
    providerRequestDelta: 0,
    full160Authorized: false,
  };
  const derivedEvaluation = {
    schema: "m2.v2.v2b8-derived-evaluation-private.v0.3",
    privateOnly: true,
    historicalEvaluation: prepared.historicalEvaluation,
    currentRestatedEvaluation: prepared.currentRestatedEvaluation,
    inputDigests: {
      manifest: prepared.manifestByteDigest,
      sourceBundle: prepared.sourceBundleByteDigest,
      effectiveReceiptIndex: sha256Buffer(effectiveReceiptIndexBytes),
      requestEventLedger: sha256Buffer(ledgerBytes),
    },
    providerRequestDelta: 0,
    full160Authorized: false,
  };

  const generated = new Map([
    ["state", { relativePath: "state-private-v0.3.json", bytes: jsonBytes(state) }],
    ["cache_index", { relativePath: "cache-index-private-v0.2.json", bytes: jsonBytes(cacheIndex) }],
    ["receipt_index", { relativePath: "receipt-index-private-v0.2.json", bytes: jsonBytes(receiptIndex) }],
    ["request_event_ledger", { relativePath: "request-event-ledger-private-v0.1.json", bytes: ledgerBytes }],
    ["counter_projection", { relativePath: "counter-projection-private-v0.2.json", bytes: jsonBytes(counterProjection) }],
    ["immutable_manifests", { relativePath: "immutable-manifests-private-v0.2.json", bytes: jsonBytes(prepared.immutableManifests) }],
    ["frozen_upstream_digests", { relativePath: "frozen-upstream-digests-private-v0.2.json", bytes: jsonBytes(prepared.frozenUpstreamDigests) }],
    ["derived_evaluation", { relativePath: "derived-evaluation-private-v0.3.json", bytes: jsonBytes(derivedEvaluation) }],
    ["effective_receipt_index", { relativePath: "effective-receipt-index-private-v0.2.json", bytes: effectiveReceiptIndexBytes }],
    ["receipt_envelopes", { relativePath: "receipt-envelopes-private-v0.2.ndjson", bytes: receiptBytes }],
    ["receipt_migration", { relativePath: "receipt-envelope-migration-private-v0.2.json", bytes: jsonBytes(prepared.receiptState.migration) }],
  ]);
  const includeCanonicalAuthorityGraph = options.skipCanonicalAuthorityGraph !== true
    && isPlainObject(prepared.canonicalAuthorityGraph);
  const contractBoundPublicReportDigests = includeCanonicalAuthorityGraph
    ? {
      ...prepared.contractBoundPublicReportDigests,
      schema: "m2.v2.v2b8-contract-bound-public-report-digests-private.v0.3",
      canonicalAuthorityGraph: prepared.canonicalAuthorityGraph,
    }
    : prepared.contractBoundPublicReportDigests;
  generated.set("contract_bound_public_report_digests", {
    relativePath: "contract-bound-public-report-digests-private-v0.2.json",
    bytes: jsonBytes(contractBoundPublicReportDigests),
  });

  const externalDescriptors = [
    descriptor("execution_contract", prepared.executionContract.relativePath, prepared.executionContract.byteDigest),
    descriptor("current_authority", prepared.currentAuthority.relativePath, prepared.currentAuthority.byteDigest),
    descriptor("current_restatement", prepared.currentRestatement.relativePath, prepared.currentRestatement.byteDigest),
  ];
  const generatedDescriptors = [...generated.entries()]
    .filter(([role]) => GENERATED_CLOSED_ROLES.includes(role) && role !== "transaction_manifest")
    .map(([role, member]) => descriptor(role, `${finalDirectoryRelative}/${member.relativePath}`, sha256Buffer(member.bytes)));
  const closedManifest = buildClosedAtomicTransactionManifest({
    scope: "v2b8",
    transactionId,
    createdAt: prepared.createdAt,
    members: [...generatedDescriptors, ...externalDescriptors],
  });
  generated.set("transaction_manifest", {
    relativePath: "closed-transaction-manifest-private-v0.2.json",
    bytes: jsonBytes(closedManifest),
  });
  const closedDescriptors = [
    ...closedManifest.members,
    descriptor(
      "transaction_manifest",
      `${finalDirectoryRelative}/closed-transaction-manifest-private-v0.2.json`,
      sha256Buffer(generated.get("transaction_manifest").bytes),
    ),
  ].sort((left, right) => left.role.localeCompare(right.role));
  if (canonicalJson(closedDescriptors.map((item) => item.role))
    !== canonicalJson([...CLOSED_ATOMIC_MEMBER_ROLES].sort())) {
    throw new Error("pr7_p1_closed_role_set_invalid");
  }
  const members = [...generated.entries()].map(([role, member]) => ({ role, ...member }));
  return {
    transactionId,
    members,
    closedManifest,
    closedDescriptors,
    documents: { state, cacheIndex, receiptIndex, counterProjection, effectiveReceiptIndex, derivedEvaluation },
  };
}

function loadExistingB8Artifacts(root, options) {
  const manifest = readJsonGoverned(root, V2B7_MANIFEST_RELATIVE).value;
  const bundle = readJsonGoverned(root, V2B7_BUNDLE_RELATIVE).value;
  const v2b7PrimarySearch = readJsonGoverned(root, B8_PATHS.v2b7PrimarySearch).value;
  const v2b7RepeatSearch = readJsonGoverned(root, B8_PATHS.v2b7RepeatSearch).value;
  const v2b7Evidence = readNdjsonGoverned(root, B8_PATHS.v2b7Evidence).value;
  const fallbackQueries = readJsonGoverned(root, B8_PATHS.fallbackSearch).value.queries;
  const primarySearch = readJsonGoverned(root, B8_PATHS.primarySearch).value.runs;
  const repeatSearch = readJsonGoverned(root, B8_PATHS.repeatSearch).value.runs;
  const relayRows = readNdjsonGoverned(root, B8_PATHS.relayReceipts).value;
  const physicalReceipts = relayRows.filter((row) => row.schema === "m2.v2.relay-extraction-receipt.v0.2");
  const effectiveReceipts = relayRows.filter((row) => row.schema === "m2.v2.v2b8-extraction-effective-receipt.v0.1");
  const contractRead = readJsonGoverned(root, B8_PATHS.contract);
  const historicalRead = readJsonGoverned(root, B8_PATHS.historicalEvaluation);
  const currentAuthorityRead = readJsonGoverned(root, options.currentAuthorityRelative ?? PR7_P1_CURRENT_AUTHORITY_RELATIVE);
  const currentRestatementRead = readJsonGoverned(root, options.currentRestatementRelative ?? PR7_P1_CURRENT_RESTATEMENT_RELATIVE);
  if (contractRead.value.contractDigest !== sha256(omitKeys(contractRead.value, ["contractDigest"]))) {
    throw new Error("pr7_p1_execution_contract_digest_invalid");
  }
  const authority = validateCurrentAuthorityDocuments({
    index: currentAuthorityRead.value,
    restatement: currentRestatementRead.value,
    indexRelativePath: currentAuthorityRead.relativePath,
    indexByteDigest: currentAuthorityRead.byteDigest,
    restatementRelativePath: currentRestatementRead.relativePath,
    restatementByteDigest: currentRestatementRead.byteDigest,
  });
  if (!authority.valid) throw new Error(`pr7_p1_current_authority_invalid:${authority.issues.join(",")}`);
  const results = {
    root,
    manifest,
    bundle,
    v2b7: {
      primarySearch: v2b7PrimarySearch,
      repeatSearch: v2b7RepeatSearch,
      evidenceRecords: v2b7Evidence,
    },
    fallbackQueries,
    primarySearch,
    repeatSearch,
    physicalReceipts,
    effectiveReceipts,
    evaluation: historicalRead.value,
    privateStore: resolve(root, V2B8_PRIVATE_RELATIVE),
    contract: contractRead.value,
  };
  return {
    results,
    contract: contractRead.value,
    executionContractRead: contractRead,
    historicalEvaluation: historicalRead.value,
    currentAuthorityRead,
    currentRestatementRead,
    currentRestatement: currentRestatementRead.value,
    authority,
    fallbackQueries,
    primarySearch,
    repeatSearch,
    physicalReceipts,
    effectiveReceipts,
  };
}

function recomputeHistoricalExactly(results, reference, options) {
  const candidates = [];
  for (const allTestsPassed of [true, false]) {
    for (const validationPending of [false, true]) {
      for (const providerBlocked of [false, true]) {
        const evaluation = recomputeV2B8HistoricalEvaluation(results, {
          root: options.root,
          gitBoundary: options.gitBoundary,
          evaluatedAt: reference.evaluatedAt,
          allTestsPassed,
          manifestUnchanged: true,
          validationPending,
          providerBlocked,
        });
        if (canonicalJson(evaluation) === canonicalJson(reference)) {
          candidates.push({ evaluation, flags: { allTestsPassed, validationPending, providerBlocked } });
        }
      }
    }
  }
  if (candidates.length === 0) throw new Error("pr7_p1_historical_recompute_match_count_0");
  if (candidates[0].evaluation.decision !== "CANARY_CONDITIONAL") {
    throw new Error("pr7_p1_historical_decision_changed");
  }
  return { ...candidates[0], equivalentFlagCombinationCount: candidates.length };
}

function inspectRestatementEvaluationBinding(restatement, evaluation) {
  const expectedDigest = restatement?.restatedContract?.evaluationDigest;
  if (!/^[a-f0-9]{64}$/u.test(String(expectedDigest ?? ""))) {
    throw new Error("pr7_p1_restatement_evaluation_digest_invalid");
  }
  const recomputedDigest = sha256(evaluation);
  const decision = restatement?.restatedContract?.decision ?? restatement?.currentRestatedDecision;
  if (restatement?.providerRequestDelta !== 0
    || (restatement?.restatedContract?.full160Authorized ?? restatement?.full160Authorized) !== false) {
    throw new Error("pr7_p1_restatement_boundary_invalid");
  }
  return {
    predecessorEvaluationDigestSha256: expectedDigest,
    recomputedEvaluationDigestSha256: recomputedDigest,
    evaluationDigestMatches: expectedDigest === recomputedDigest,
    predecessorDecision: decision,
    recomputedDecision: evaluation.decision,
    decisionMatches: decision === evaluation.decision,
    requiresVersionedSupersession: expectedDigest !== recomputedDigest || decision !== evaluation.decision,
  };
}

function buildRecoverySources(root) {
  const rows = [
    ["immutable_manifest", V2B7_MANIFEST_RELATIVE],
    ["immutable_manifest", V2B7_BUNDLE_RELATIVE],
    ["source_record", B8_PATHS.v2b7PrimarySearch],
    ["source_record", B8_PATHS.v2b7RepeatSearch],
    ["evidence_record", B8_PATHS.v2b7Evidence],
    ["source_record", B8_PATHS.fallbackSearch],
    ["source_record", B8_PATHS.primarySearch],
    ["source_record", B8_PATHS.repeatSearch],
    ["append_only_provider_receipt", B8_PATHS.relayReceipts],
    ["frozen_execution_contract", B8_PATHS.contract],
  ];
  return rows.map(([role, relativePath]) => ({
    role,
    relativePath,
    byteDigest: readGovernedFile(root, relativePath).byteDigest,
  }));
}

function buildArtifactIndex(root, input) {
  return {
    schema: input.schema,
    privateOnly: true,
    entries: input.paths.map((path) => {
      const read = readGovernedFile(root, path);
      return { path: read.relativePath, byteDigest: read.byteDigest };
    }),
    full160Authorized: false,
  };
}

function buildEffectiveReceiptIndex(prepared, receiptLines, receiptRelativePath) {
  const relayLineByLogical = new Map();
  for (const { row, lineNumber } of receiptLines.filter(({ row }) => row.kind === "relay")) {
    const payload = row.envelope.receiptPayload;
    const key = `${payload.runKind}\u0000${payload.canarySlotId}`;
    if (relayLineByLogical.has(key)) throw new Error("pr7_p1_effective_receipt_duplicate");
    relayLineByLogical.set(key, { row, lineNumber });
  }
  const expected = [
    ...prepared.results.primarySearch.map((run) => ({ runKind: "primary", canarySlotId: run.canarySlotId })),
    ...prepared.results.repeatSearch.map((run) => ({ runKind: "fresh_repeat", canarySlotId: run.canarySlotId })),
    ...prepared.results.manifest.repeatSample.map((repeat) => ({ runKind: "same_source", canarySlotId: repeat.canarySlotId })),
  ];
  const entries = expected.map(({ runKind, canarySlotId }) => {
    const match = relayLineByLogical.get(`${runKind}\u0000${canarySlotId}`);
    if (!match) throw new Error("pr7_p1_effective_receipt_missing");
    const logicalKey = sha256({ runKind, canarySlotId });
    if (match.row.envelope.receiptPayload.logicalExtractionKey !== logicalKey) {
      throw new Error("pr7_p1_effective_receipt_logical_key_mismatch");
    }
    return {
      logicalKey,
      runKind,
      canarySlotId,
      receiptDigest: match.row.envelope.receiptDigest,
      path: receiptRelativePath,
      lineNumber: match.lineNumber,
    };
  });
  return {
    schema: "m2.v2.v2b8-effective-receipt-index-private.v0.2",
    privateOnly: true,
    entries,
    full160Authorized: false,
  };
}

function validatePreparedPlan(prepared, plan, options) {
  const issues = [];
  if (!plan) return { valid: false, issues: ["plan_missing"] };
  if (plan.closedDescriptors.length !== CLOSED_ATOMIC_MEMBER_ROLES.length) issues.push("closed_member_count_invalid");
  const roles = plan.closedDescriptors.map((item) => item.role).sort();
  if (canonicalJson(roles) !== canonicalJson([...CLOSED_ATOMIC_MEMBER_ROLES].sort())) issues.push("closed_roles_invalid");
  const ledger = plan.documents?.state ? prepared.receiptState.ledger : null;
  const ledgerValidation = validateRequestEventLedger(ledger, { stage: "v2b8" });
  if (!ledgerValidation.valid) issues.push(...ledgerValidation.issues.map((issue) => `ledger:${issue}`));
  if (ledgerValidation.valid
    && canonicalJson(ledgerValidation.replay.counters) !== canonicalJson(plan.documents.state.requestCounters)) {
    issues.push("state_counter_replay_mismatch");
  }
  if (ledgerValidation.valid) {
    const reservationsByPhysicalKey = new Map();
    for (const reservation of Object.values(ledgerValidation.replay.reservations)) {
      if (reservationsByPhysicalKey.has(reservation.physicalKey)) issues.push("physical_key_cross_provider_collision");
      reservationsByPhysicalKey.set(reservation.physicalKey, reservation);
    }
    for (const entry of plan.documents.cacheIndex.entries) {
      const reservation = reservationsByPhysicalKey.get(entry.physicalKey);
      if (!reservation || reservation.status !== "completed" || reservation.receiptDigest !== entry.receiptDigest
        || reservation.logicalKey !== entry.logicalKey) {
        issues.push("cache_index_ledger_binding_mismatch");
      }
    }
  }
  if (canonicalJson(plan.documents.counterProjection.counters) !== canonicalJson(prepared.receiptState.counters)) {
    issues.push("counter_projection_mismatch");
  }
  for (const row of prepared.receiptState.envelopeRows) {
    const validation = validateReceiptEnvelope(row.envelope);
    if (!validation.valid) issues.push(...validation.issues.map((issue) => `envelope:${issue}`));
  }
  if (plan.documents.receiptIndex.entries.length !== prepared.receiptState.envelopeRows.length) issues.push("receipt_index_count_invalid");
  if (plan.documents.cacheIndex.entries.length !== prepared.receiptState.envelopeRows.length) issues.push("cache_index_count_invalid");
  if (plan.documents.effectiveReceiptIndex.entries.length !== prepared.receiptState.relayEnvelopes.length) issues.push("effective_index_count_invalid");
  if (prepared.providerRequestDelta !== 0 || plan.documents.state.providerRequestDelta !== 0) issues.push("provider_delta_nonzero");
  if (options.phase !== "in_memory") {
    if (!options.candidateRoot) issues.push("candidate_root_missing");
    else {
      for (const member of plan.members) {
        const path = resolveInside(options.candidateRoot, member.relativePath);
        if (!existsSync(path) || !readFileSync(path).equals(member.bytes)) issues.push(`persisted_member_mismatch:${member.role}`);
      }
    }
  }
  return { valid: issues.length === 0, issues };
}

function appendPhysicalLedgerEvents(ledgerInput, fact) {
  let ledger = ledgerInput;
  ledger = appendRequestEvent(ledger, { ...fact, timestamp: fact.requestStartedAt, eventType: "planned", receiptDigest: null });
  ledger = appendRequestEvent(ledger, { ...fact, timestamp: fact.requestStartedAt, eventType: "reserved", receiptDigest: null });
  ledger = appendRequestEvent(ledger, { ...fact, timestamp: fact.requestStartedAt, eventType: "dispatched", receiptDigest: null });
  ledger = appendRequestEvent(ledger, { ...fact, timestamp: fact.responseReceivedAt, eventType: "completed" });
  return ledger;
}

function tavilyEventFact(row) {
  const query = row.envelope.receiptPayload;
  const receipt = query.providerReceipt;
  return {
    provider: String(receipt.provider),
    stage: "v2b8",
    logicalKey: tavilyLogicalKey(query, "physical_dispatch"),
    physicalKey: String(receipt.cacheKey),
    requestDigest: sha256({
      provider: receipt.provider,
      queryId: query.queryId,
      queryText: query.queryText,
      intent: query.intent,
      country: query.country,
      runKind: query.runKind,
      canarySlotId: query.canarySlotId,
    }),
    receiptDigest: row.envelope.receiptDigest,
    requestStartedAt: requiredTimestamp(receipt.requestStartedAt, "pr7_p1_tavily_started_at_invalid"),
    responseReceivedAt: requiredTimestamp(receipt.responseReceivedAt, "pr7_p1_tavily_received_at_invalid"),
  };
}

function relayEventFact(row) {
  const receipt = row.envelope.receiptPayload;
  return {
    provider: String(receipt.provider),
    stage: "v2b8",
    logicalKey: String(receipt.logicalExtractionKey),
    physicalKey: String(receipt.cacheKey),
    requestDigest: requiredDigest(receipt.requestPayloadDigest, "pr7_p1_relay_request_digest_invalid"),
    receiptDigest: row.envelope.receiptDigest,
    requestStartedAt: requiredTimestamp(receipt.requestStartedAt, "pr7_p1_relay_started_at_invalid"),
    responseReceivedAt: requiredTimestamp(receipt.responseReceivedAt, "pr7_p1_relay_received_at_invalid"),
  };
}

function tavilyCacheHitFact(query, receiptDigest) {
  const receipt = query.providerReceipt;
  return {
    timestamp: requiredTimestamp(receipt.responseReceivedAt, "pr7_p1_cache_hit_timestamp_invalid"),
    provider: String(receipt.provider),
    stage: "v2b8",
    logicalKey: tavilyLogicalKey(query, "cache_hit_observation"),
    physicalKey: String(receipt.cacheKey),
    requestDigest: sha256({
      provider: receipt.provider,
      queryId: query.queryId,
      queryText: query.queryText,
      intent: query.intent,
      country: query.country,
      runKind: query.runKind,
      canarySlotId: query.canarySlotId,
    }),
    receiptDigest,
  };
}

function tavilyLogicalKey(query, observationKind) {
  return sha256({
    provider: "tavily_structured_search",
    observationKind,
    runKind: query.runKind,
    canarySlotId: query.canarySlotId,
    queryId: query.queryId,
    intent: query.intent,
  });
}

function cacheReference(row, transactionId) {
  const payload = row.envelope.receiptPayload;
  const receipt = row.kind === "tavily" ? payload.providerReceipt : payload;
  return {
    adapterVersion: String(receipt.adapterVersion ?? receipt.providerVersion),
    logicalKey: row.kind === "relay"
      ? String(payload.logicalExtractionKey)
      : tavilyLogicalKey(payload, "physical_dispatch"),
    physicalKey: String(receipt.cacheKey ?? payload.cacheKey),
    receiptDigest: row.envelope.receiptDigest,
    transactionId,
  };
}

function compareTavilyRows(left, right) {
  return compareSearchQueries(left.query, right.query);
}

function compareSearchQueries(left, right) {
  return `${left?.runKind ?? ""}:${left?.canarySlotId ?? ""}:${left?.queryId ?? ""}`
    .localeCompare(`${right?.runKind ?? ""}:${right?.canarySlotId ?? ""}:${right?.queryId ?? ""}`);
}

function compareRelayRows(left, right) {
  const order = { primary: 0, fresh_repeat: 1, same_source: 2 };
  const leftPayload = left.envelope.receiptPayload;
  const rightPayload = right.envelope.receiptPayload;
  return `${order[leftPayload.runKind] ?? 9}:${leftPayload.canarySlotId}`
    .localeCompare(`${order[rightPayload.runKind] ?? 9}:${rightPayload.canarySlotId}`);
}

function summarizePrepared(prepared, status) {
  return {
    schema: "m2.v2.pr7-p1-offline-remediation-summary.v0.3",
    status,
    historicalDecision: prepared.historicalEvaluation.decision,
    currentRestatedDecision: prepared.currentRestatedEvaluation.decision,
    physicalReceiptCount: prepared.receiptState.envelopeRows.length,
    tavilyPhysicalReceiptCount: prepared.receiptState.tavilyEnvelopes.length,
    relayPhysicalReceiptCount: prepared.receiptState.relayEnvelopes.length,
    cacheHitObservationCount: prepared.receiptState.cacheHitCount,
    requestEventCount: prepared.receiptState.ledger.length,
    requestCounters: prepared.receiptState.counters,
    currentEvaluationDigest: sha256(prepared.currentRestatedEvaluation),
    providerRequestDelta: 0,
    canaryExecutedDuringRecovery: false,
    modelTrainingPerformed: false,
    full160Authorized: false,
    nextDevelopmentReadiness: "NOT_AUTHORIZED",
  };
}

function defaultTransactionIdentity(prepared) {
  const authorityDigest = sha256({
    currentAuthority: prepared.currentAuthority.byteDigest,
    currentRestatement: prepared.currentRestatement.byteDigest,
    currentEvaluation: sha256(prepared.currentRestatedEvaluation),
    manifest: prepared.manifestByteDigest,
    sourceBundle: prepared.sourceBundleByteDigest,
  });
  return `${PR7_P1_TRANSACTION_IDENTITY}:${authorityDigest}`;
}

function buildB6TransactionContext(prepared) {
  const transactionIdentity = defaultTransactionIdentity(prepared);
  const sources = prepared.sources
    .map(({ role, relativePath, byteDigest }) => ({ role, relativePath, byteDigest }))
    .sort((left, right) => (
      `${left.role}:${left.relativePath}`.localeCompare(`${right.role}:${right.relativePath}`)
    ));
  const sourceSetDigest = computeOfflineRecoverySourceSetDigest(sources);
  const transactionId = deriveOfflineRecoveryTransactionId({
    sourceSetDigest,
    contractDigest: prepared.contractDigest,
    transactionIdentity,
  });
  const transactionRootRelative = PR7_S1_B6_RECOVERY_TRANSACTION_ROOT_RELATIVE;
  return {
    root: prepared.root,
    transactionId,
    transactionIdentity,
    transactionRootRelative,
    finalDirectoryRelative: `${transactionRootRelative}/${transactionId}`,
    sources,
    sourceSetDigest,
    contractDigest: prepared.contractDigest,
    providerRequestDelta: 0,
  };
}

function buildCurrentDecisionComputation(prepared) {
  const evaluation = prepared.currentRestatedEvaluation;
  return {
    evaluationDigestSha256: sha256(evaluation),
    arithmeticInputsDigestSha256: sha256({
      metrics: evaluation.metrics ?? null,
      arithmetic: evaluation.arithmetic ?? null,
      counts: evaluation.counts ?? null,
    }),
    semanticInputsDigestSha256: sha256({
      safetyGates: evaluation.safetyGates ?? null,
      qualityGates: evaluation.qualityGates ?? null,
      blockerIds: evaluation.blockerIds ?? null,
      nextStep: evaluation.nextStep ?? null,
    }),
    thresholdProfileDigestSha256: sha256({
      contractDigest: prepared.contractDigest,
      thresholds: prepared.results.contract?.thresholds ?? null,
    }),
    arithmeticRecomputed: true,
    semanticGatesRecomputed: true,
    recomputedDecision: evaluation.decision,
    decisionRuleDigestSha256: sha256({
      decision: evaluation.decision,
      safetyPassed: evaluation.safetyPassed ?? null,
      qualityPassed: evaluation.qualityPassed ?? null,
      blockerIds: evaluation.blockerIds ?? null,
    }),
  };
}

function unchangedB6Boundaries() {
  return {
    providerRequestDelta: 0,
    databaseConnections: 0,
    actualExternalFetchCount: 0,
    canaryExecuted: false,
    full160Executed: false,
    modelTrainingPerformed: false,
    holdoutOpened: false,
    releasePerformed: false,
    prMerged: false,
  };
}

function buildB6CanonicalAuthorityGraph(prepared, plan, publicDocuments) {
  const memberByRole = new Map(plan.members.map((member) => [member.role, member]));
  const memberMapping = (nodeId, role) => {
    const member = memberByRole.get(role);
    if (!member) throw new Error(`pr7_s1_b6_member_missing:${role}`);
    return buildAuthorityPhysicalMapping({
      nodeId,
      repositoryRelativePath: `${plan.closedManifest.members[0].path.split("/").slice(0, -1).join("/")}/${member.relativePath}`,
      contentDigestSha256: sha256Buffer(member.bytes),
      objectType: "FILE",
    });
  };
  const mappings = [
    memberMapping("immutable_inputs", "immutable_manifests"),
    buildAuthorityPhysicalMapping({
      nodeId: "execution_contract",
      repositoryRelativePath: prepared.executionContract.relativePath,
      contentDigestSha256: prepared.executionContract.byteDigest,
      objectType: "FILE",
    }),
    memberMapping("request_event_ledger", "request_event_ledger"),
    memberMapping("physical_receipt_envelopes", "receipt_envelopes"),
    memberMapping("receipt_index", "receipt_index"),
    memberMapping("safe_cache", "cache_index"),
    memberMapping("effective_receipt_index", "effective_receipt_index"),
    memberMapping("counter_state_projection", "counter_projection"),
    buildAuthorityPhysicalMapping({
      nodeId: "event_semantics_profile",
      repositoryRelativePath: "docs/technical-design/m2-v2/M2-v2-event-time-clause-binding-v0.4.json",
      contentDigestSha256: b6EventSemanticsProfileDigest(prepared.root),
      objectType: "FILE",
    }),
    memberMapping("derived_evaluation", "derived_evaluation"),
    semanticPublicMapping(
      "public_remediation_summary",
      "docs/analysis/m2-v2/M2-v2-PR7-P1-remediation-summary-v0.2.json",
      publicDocuments.remediationSummary,
    ),
    semanticPublicMapping(
      "public_merge_readiness",
      "docs/analysis/m2-v2/M2-v2-PR7-merge-readiness-v0.2.json",
      publicDocuments.mergeReadiness,
    ),
    buildAuthorityPhysicalMapping({
      nodeId: "tracked_core_commitment",
      repositoryRelativePath: "docs/analysis/m2-v2/M2-v2-PR7-core-commitment-v0.1.json",
      contentDigestSha256: readGovernedFile(
        prepared.root,
        "docs/analysis/m2-v2/M2-v2-PR7-core-commitment-v0.1.json",
      ).byteDigest,
      objectType: "FILE",
    }),
    semanticPublicMapping(
      "current_integrity_restatement",
      "docs/analysis/m2-v2/M2-v2-canary-v3-1-integrity-restatement-v0.4.json",
      publicDocuments.restatementSemantic,
    ),
    semanticPublicMapping(
      "current_state_index",
      "docs/analysis/m2-v2/M2-v2-current-state-index-v0.3.json",
      publicDocuments.indexSemantic,
    ),
  ];
  return deriveCanonicalAuthorityGraphV0_3({
    physicalMappings: mappings,
    selectionDecisions: buildB6SelectionDecisions(plan, prepared),
  });
}

function buildB6CanonicalAuthorityEvidence(prepared, plan, graph) {
  const cacheEntries = plan.documents.cacheIndex.entries;
  const cacheByReceipt = new Map(cacheEntries.map((entry) => [entry.receiptDigest, entry]));
  const projectionProfileDigestSha256 = sha256({
    schema: "m2.v2.safe-cache-projection-runtime-profile.v0.3",
    contractDigest: prepared.contractDigest,
  });
  const receiptIndexEntries = cacheEntries.map(({ logicalKey, physicalKey, receiptDigest }) => ({
    logicalKey,
    physicalKey,
    receiptDigest,
  }));
  const effectiveReceiptIndexEntries = plan.documents.effectiveReceiptIndex.entries.map((entry) => {
    const cached = cacheByReceipt.get(entry.receiptDigest);
    if (!cached) throw new Error("pr7_s1_b6_effective_receipt_cache_binding_missing");
    return {
      logicalKey: cached.logicalKey,
      physicalKey: cached.physicalKey,
      receiptDigest: cached.receiptDigest,
    };
  });
  const evidence = {
    requestEventLedger: prepared.receiptState.ledger,
    receiptEnvelopes: prepared.receiptState.envelopeRows.map((row, index) => ({
      envelope: row.envelope,
      logicalKey: cacheEntries[index].logicalKey,
      physicalKey: cacheEntries[index].physicalKey,
      replayableSuccessful: true,
      projectionProfileDigestSha256,
    })),
    receiptIndexEntries,
    safeCacheEntries: receiptIndexEntries.map((entry) => ({
      ...entry,
      projectionProfileDigestSha256,
    })),
    effectiveReceiptIndexEntries,
    counterProjection: plan.documents.counterProjection.counters,
    immutableInputsDigestSha256: sha256(prepared.immutableManifests),
    eventSemanticsProfileDigestSha256: b6EventSemanticsProfileDigest(prepared.root),
    consumedPhysicalObjectIds: graph.physicalMappings.map((entry) => entry.physicalObjectIdSha256),
  };
  evidence.derivedInputBindings = buildAuthorityDerivedInputBindings(evidence);
  return evidence;
}

function buildB6SelectionDecisions(plan, prepared) {
  const cacheEntries = plan.documents.cacheIndex.entries;
  const effectiveReceipts = new Set(
    plan.documents.effectiveReceiptIndex.entries.map((entry) => entry.receiptDigest),
  );
  const plannedKeys = unique(prepared.receiptState.ledger
    .filter((event) => event.eventType === "planned")
    .map((event) => event.logicalKey));
  return plannedKeys.map((logicalKey) => {
    const candidates = cacheEntries.filter((entry) => entry.logicalKey === logicalKey);
    const selected = candidates.find((entry) => effectiveReceipts.has(entry.receiptDigest)) ?? null;
    return buildAuthoritySelectionDecision({
      logicalKey,
      candidatePhysicalKeys: candidates.map((entry) => entry.physicalKey),
      selectedPhysicalKey: selected?.physicalKey ?? null,
      decision: selected ? "SELECTED" : (candidates.length ? "EXPLICIT_BLOCKED" : "NO_REPLAYABLE_RECEIPT"),
      reason: selected
        ? "UNIQUE_PERMITTED_RECEIPT"
        : (candidates.length ? "POLICY_BLOCKED" : "NO_COMPLETED_RECEIPT"),
    });
  });
}

function semanticPublicMapping(nodeId, repositoryRelativePath, semanticPayload) {
  return buildAuthorityPhysicalMapping({
    nodeId,
    repositoryRelativePath,
    contentDigestSha256: sha256(semanticPayload),
    objectType: "FILE",
  });
}

function publicReportBinding(role, repositoryRelativePath, value) {
  return {
    role,
    repositoryRelativePath,
    pathIdentityDigestSha256: sha256(repositoryRelativePath),
    semanticDigestSha256: sha256(value),
    byteDigestSha256: sha256Buffer(jsonBytes(value)),
  };
}

function historicalAuthorityRecord(read, version, decision) {
  return {
    artifact: read.relativePath,
    version,
    decision,
    lifecycle: "superseded_immutable",
    byteDigestSha256: read.byteDigest,
  };
}

function b6EventSemanticsProfileDigest(root) {
  return readGovernedFile(
    root,
    "docs/technical-design/m2-v2/M2-v2-event-time-clause-binding-v0.4.json",
  ).byteDigest;
}

function requiredPublicDocument(value, code) {
  if (!isPlainObject(value)) throw new Error(code);
  return cloneJson(value);
}

function assertPrepared(value) {
  if (!isPlainObject(value) || value.schema !== PR7_P1_OFFLINE_REMEDIATION_SCHEMA) {
    throw new Error("pr7_p1_prepared_input_invalid");
  }
  if (value.providerRequestDelta !== 0 || value.full160Authorized !== false) {
    throw new Error("pr7_p1_prepared_boundary_invalid");
  }
  requiredDigest(value.contractDigest, "pr7_p1_prepared_contract_digest_invalid");
}

function auditGitBoundary(root) {
  return evaluateGitBoundaryCommandResult(spawnSync(
    "git",
    ["diff", "--name-only", V2B8_START_SHA, "--"],
    { cwd: root, encoding: "utf8", windowsHide: true },
  ));
}

function readJsonGoverned(root, path) {
  const read = readGovernedFile(root, path);
  try { return { ...read, value: JSON.parse(read.bytes.toString("utf8")) }; } catch {
    throw new Error("pr7_p1_governed_json_invalid");
  }
}

function readNdjsonGoverned(root, path) {
  const read = readGovernedFile(root, path);
  try {
    return { ...read, value: read.bytes.toString("utf8").split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line)) };
  } catch {
    throw new Error("pr7_p1_governed_ndjson_invalid");
  }
}

function readGovernedFile(root, input) {
  const relativePath = normalizeRelativePath(input);
  const absoluteRoot = resolve(root);
  const path = resolve(absoluteRoot, ...relativePath.split("/"));
  if (path !== absoluteRoot && !path.startsWith(`${absoluteRoot}${sep}`)) throw new Error("pr7_p1_path_escape");
  let cursor = path;
  while (cursor !== absoluteRoot) {
    if (!existsSync(cursor) || lstatSync(cursor).isSymbolicLink()) throw new Error("pr7_p1_governed_file_missing_or_reparse");
    cursor = dirname(cursor);
  }
  if (!lstatSync(path).isFile()) throw new Error("pr7_p1_governed_regular_file_required");
  const bytes = readFileSync(path);
  return { relativePath, bytes, byteDigest: sha256Buffer(bytes) };
}

function resolveInside(root, input) {
  const relativePath = normalizeRelativePath(input);
  const absoluteRoot = resolve(root);
  const path = resolve(absoluteRoot, ...relativePath.split("/"));
  if (path !== absoluteRoot && !path.startsWith(`${absoluteRoot}${sep}`)) throw new Error("pr7_p1_candidate_path_escape");
  return path;
}

function descriptor(role, path, byteDigest) {
  return { role, path: normalizeRelativePath(path), byteDigest: requiredDigest(byteDigest, "pr7_p1_descriptor_digest_invalid") };
}

function normalizeRelativePath(value) {
  const path = String(value ?? "").replace(/\\/gu, "/");
  if (!path || isAbsolute(path) || /^[A-Za-z]:/u.test(path) || path.startsWith("//")
    || path.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("pr7_p1_relative_path_invalid");
  }
  return path;
}

function requiredDigest(value, code) {
  if (!/^[a-f0-9]{64}$/u.test(String(value ?? ""))) throw new Error(code);
  return String(value);
}

function requiredToken(value, code) {
  const token = String(value ?? "");
  if (!/^[A-Za-z0-9._:-]{1,200}$/u.test(token)) throw new Error(code);
  return token;
}

function requiredTimestamp(value, code) {
  const timestamp = String(value ?? "");
  if (!Number.isFinite(Date.parse(timestamp))) throw new Error(code);
  return timestamp;
}

function ensureArray(value, code) {
  if (!Array.isArray(value)) throw new Error(code);
  return value;
}

function omitKeys(value, keys) {
  const denied = new Set(keys);
  return Object.fromEntries(Object.entries(value).filter(([key]) => !denied.has(key)));
}

function jsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function ndjsonBytes(values) {
  return Buffer.from(`${values.map((value) => JSON.stringify(value)).join("\n")}\n`, "utf8");
}

function sha256Buffer(value) {
  return createHash("sha256").update(value).digest("hex");
}

function unique(values) {
  return [...new Set(values)];
}

function documentsTupleKeys(values) {
  return values.map((value) => (
    `${value.logicalKey}\u0000${value.physicalKey}\u0000${value.receiptDigest}`
  ));
}

function diagnoseB6EnvelopeBindings(prepared, evidence) {
  const completed = new Map(prepared.receiptState.ledger
    .filter((event) => event.eventType === "completed")
    .map((event) => [`${event.logicalKey}\u0000${event.physicalKey}`, event]));
  let mismatches = 0;
  for (const value of evidence.receiptEnvelopes) {
    const payload = value.envelope.receiptPayload;
    const event = completed.get(`${value.logicalKey}\u0000${value.physicalKey}`);
    if (!event) {
      mismatches += 1;
      continue;
    }
    if (payload.schema === "m2.v2.relay-extraction-receipt.v0.2") {
      if (payload.logicalExtractionKey !== value.logicalKey
        || payload.cacheKey !== value.physicalKey
        || payload.requestPayloadDigest !== event.requestDigest
        || payload.provider !== event.provider
        || (Object.hasOwn(payload, "logicalKey") && payload.logicalKey !== payload.logicalExtractionKey)
        || (Object.hasOwn(payload, "physicalKey") && payload.physicalKey !== payload.cacheKey)
        || (Object.hasOwn(payload, "requestDigest") && payload.requestDigest !== payload.requestPayloadDigest)
        || (Object.hasOwn(payload, "stage") && payload.stage !== "v2b8")) mismatches += 1;
    } else {
      const receipt = payload.providerReceipt;
      const logicalKey = tavilyLogicalKey(payload, "physical_dispatch");
      const requestDigest = sha256({
        provider: receipt?.provider,
        queryId: payload.queryId,
        queryText: payload.queryText,
        intent: payload.intent,
        country: payload.country,
        runKind: payload.runKind,
        canarySlotId: payload.canarySlotId,
      });
      if (logicalKey !== value.logicalKey
        || receipt?.cacheKey !== value.physicalKey
        || requestDigest !== event.requestDigest
        || receipt?.provider !== event.provider
        || receipt?.schema !== "m2.v2.tavily-provider-receipt.v0.1"
        || receipt?.queryId !== payload.queryId
        || typeof payload.runKind !== "string"
        || typeof payload.canarySlotId !== "string"
        || typeof payload.queryId !== "string"
        || typeof payload.intent !== "string"
        || typeof payload.queryText !== "string"
        || typeof payload.country !== "string"
        || (Object.hasOwn(payload, "logicalKey") && payload.logicalKey !== logicalKey)
        || (Object.hasOwn(payload, "physicalKey") && payload.physicalKey !== receipt?.cacheKey)
        || (Object.hasOwn(payload, "cacheKey") && payload.cacheKey !== receipt?.cacheKey)
        || (Object.hasOwn(payload, "provider") && payload.provider !== receipt?.provider)
        || (Object.hasOwn(payload, "stage") && payload.stage !== "v2b8")) mismatches += 1;
    }
  }
  return mismatches;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
