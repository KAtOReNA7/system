import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const configPath = "config/m2-current-oa03-replication.v0.1.json";
const preregistrationPath =
  "docs/analysis/m2-current/"
  + "M2-oa03-current-scope-replication-preregistration-v0.1.json";
const config = readJson(configPath);
const preregistration = readJson(preregistrationPath);
const historicalConfig = readJson("config/m2-current.v0.3.json");
const capabilityCatalog = readJson(
  "config/development-capability-catalog.v0.1.json"
);

const experimentId = "M2-EXP-OA03-CURRENT-SCOPE-REPLICATION-01";

test("OA03 resolves one canonical formula without changing its identity", () => {
  assert.equal(config.schema, "m2.current.oa03_replication.v0.1");
  assert.equal(config.experiment.stableExperimentId, experimentId);
  assert.equal(
    config.experiment.phase,
    "P1_IMPLEMENTED_AWAITING_EXACT_HEAD_CI"
  );
  assert.equal(config.experiment.outerOutcomeRead, false);
  assert.equal(config.modelIdentity.stableModelId, "M2-WORK-OA03");
  assert.equal(
    config.modelIdentity.canonicalCoreEntrypoint,
    "src/domain/m2Current/candidate.js"
  );
  assert.equal(
    config.modelIdentity.canonicalFunction,
    "buildM2CurrentOccurrenceAmountCandidate"
  );
  assert.equal(
    config.modelIdentity.identityResolutionStatus,
    "CANONICAL_FORMULA_UNIQUELY_RESOLVED"
  );
  assert.equal(config.modelIdentity.productionExactV03MutationAllowed, false);

  assert.equal(historicalConfig.target, "future_bill_cash");
  assert.equal(
    historicalConfig.candidate.id,
    "M2-current-occurrence-amount-calibration-v0.3"
  );
  assert.deepEqual(historicalConfig.candidate.scaleFactors, [1]);
  assert.deepEqual(
    historicalConfig.candidate.occurrenceAmount,
    {
      baseCandidateId: "M2-current-hierarchical-robust-calibration-v0.2",
      eligibleSegments: ["dense", "intermittent"],
      minimumEarlierCaseCount: 80,
      minimumRelativeWapeImprovement: 0.01,
      trainingAbsoluteBiasMaximum: 0.15,
      priorStrength: 10,
      priorOccurrenceProbability: 0.5,
      minimumFactor: 0.3,
      maximumFactor: 1.5
    }
  );
});

test("OA03 P0 freezes current scope, v2.2 actual and origin-safe Core populations", () => {
  assert.equal(
    config.scope.actualDefinitionId,
    "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01"
  );
  assert.deepEqual(config.scope.horizonsMonths, [3, 6, 12]);
  assert.equal(config.scope.primaryPopulationId, "CORE80");
  assert.equal(config.scope.sensitivityPopulationId, "CORE90");
  assert.equal(config.scope.minimumWorkCompleteBillMonths, 3);
  assert.equal(config.scope.minimumWorkChannelCompleteBillMonths, 3);
  assert.equal(config.scope.coreSelection.originSafe, true);
  assert.equal(
    config.scope.coreSelection.recomputedAtEveryForecastOrigin,
    true
  );
  assert.deepEqual(
    config.scope.coreSelection.thresholds,
    {CORE80: 0.8, CORE90: 0.9}
  );
  assert.equal(
    config.scope.coreSelection.cutoffTiePolicy,
    "INCLUDE_ALL_EXACT_REFERENCE_REVENUE_TIES"
  );
  assert.equal(config.scope.coreSelection.futureActualTopNAllowed, false);
  assert.equal(config.scope.abstentions.outsideCore, "ABSTAIN_NOT_ZERO");
  assert.equal(
    config.scope.abstentions.futureFirstObservedChannel,
    "ABSTAIN_NOT_ZERO"
  );
  assert.equal(config.scope.reversalPolicy.rawReversalRowCountPreserved, 143);
  assert.equal(
    config.scope.reversalPolicy.wholeCaseExclusionAllowed,
    false
  );
  assert.equal(
    config.scope.reversalPolicy.futureReversalMayEnterEarlierOriginFeatures,
    false
  );
});

test("OA03 P0 freezes full mature training support without tail service", () => {
  assert.equal(config.training.supportMode, "FULL_MATURE_TRAINING_SUPPORT");
  assert.equal(config.training.originSafe, true);
  assert.equal(config.training.tailServingAuthorized, false);
  assert.equal(config.training.coreOnlyClaimAllowed, false);
  assert.equal(config.training.newAblationAllowed, false);
  assert.deepEqual(
    config.training.forbiddenArms,
    [
      "CORE80_ONLY_TRAINING",
      "CORE90_ONLY_TRAINING",
      "REVENUE_WEIGHTED_TRAINING",
      "FULL_VS_CORE_NEW_ABLATION"
    ]
  );
  assert.equal(
    config.training.evidenceStatus,
    "TAIL_INTERFERENCE_NOT_CONFIRMED"
  );
  assert.equal(
    config.training.evidenceInterpretation.core90,
    "SMALL_UNSTABLE_IMPROVEMENT_BELOW_CONFIRMATION"
  );
  assert.equal(
    config.training.evidenceInterpretation.core80,
    "MATERIAL_DEGRADATION"
  );

  const rootAgents = readFileSync("AGENTS.md", "utf8");
  const localAgents = readFileSync(
    "src/domain/m2Current/AGENTS.md",
    "utf8"
  );
  for (const value of [rootAgents, localAgents]) {
    assert.match(value, /FULL_MATURE_TRAINING_SUPPORT/u);
    assert.match(value, /TAIL_INTERFERENCE_NOT_CONFIRMED/u);
    assert.match(value, /Core90/u);
    assert.match(value, /Core80/u);
  }
  assert.doesNotMatch(
    rootAgents,
    /同时约束训练、服务和评价人口/u
  );
  assert.doesNotMatch(
    localAgents,
    /service, training, and evaluation scope is dynamic Core80\/Core90/u
  );
});

test("OA03 P0 freezes all arms before private outer outcome access", () => {
  assert.deepEqual(
    config.arms.map((arm) => arm.armId),
    [
      `${experimentId}/R0`,
      `${experimentId}/R1`,
      `${experimentId}/C1`
    ]
  );
  assert.deepEqual(
    preregistration.arms.map((arm) => arm.status),
    Array(3).fill("PREREGISTERED_NOT_EXECUTED")
  );
  assert.equal(
    config.overlapValidation.differentContractStatus,
    "NOT_COMPARABLE_DIFFERENT_CONTRACT"
  );
  assert.equal(
    config.overlapValidation.currentActualMayNotBeRewrittenForHistoricalMatch,
    true
  );
  assert.equal(config.channelAllocation.windowMonths, 12);
  assert.equal(
    config.channelAllocation.canonicalFunction,
    "allocateM2CoreLegacyChannelShares"
  );
  assert.equal(
    config.channelAllocation.canonicalArmId,
    "C3_TRAILING_12"
  );
  assert.equal(
    config.channelAllocation.kind,
    "TRAILING_NONNEGATIVE_REVENUE_SHARE"
  );
  assert.equal(config.channelAllocation.resultBasedWindowSelectionAllowed, false);
  assert.equal(config.channelAllocation.equalSplitAllowed, false);
  assert.equal(config.channelAllocation.futureFirstChannelAllowed, false);
  assert.equal(config.channelAllocation.futureActualShareAllowed, false);
  assert.equal(
    config.channelAllocation.zeroDenominatorFallback,
    "LAST_NONZERO_MONTH_WITHIN_TRAILING_12"
  );
  assert.equal(
    config.channelAllocation.fallbackFailure,
    "ABSTAIN_CHANNEL_ALLOCATION"
  );
  assert.equal(config.channelAllocation.requiredConservationDifferenceMinor, 0);
});

test("OA03 P0 freezes independent rolling families and current evaluation gates", () => {
  assert.deepEqual(
    config.rollingEvaluation.families,
    ["PRIMARY_ROLLING", "STRICT_ROLLING"]
  );
  assert.equal(
    config.rollingEvaluation.familiesMustTrainSelectAndEvaluateIndependently,
    true
  );
  assert.equal(config.rollingEvaluation.horizonIsolationRequired, true);
  assert.equal(config.rollingEvaluation.sameCaseComparabilityRequired, true);
  assert.deepEqual(
    config.rollingEvaluation.comparators.map((row) => row.modelId),
    ["M2-WORK-LG01", "M2-WORK-CRMR01"]
  );
  assert.equal(
    config.rollingEvaluation.materialRelativeWapeImprovement,
    0.01
  );
  assert.equal(
    config.rollingEvaluation.maximumAbsoluteBiasWorsening,
    0.02
  );
  assert.deepEqual(
    config.rollingEvaluation.bootstrap,
    {
      iterations: 2000,
      seed: 20260728,
      clusterUnit: "standardWorkId",
      paired: true,
      recomputeMetricsEveryIteration: true,
      confidenceLevel: 0.95
    }
  );
  assert.equal(
    config.formula.nativeStoredOutputs
      .conditionalPositiveAmountPredictionStatus,
    "CAPABILITY_NOT_STORED"
  );
  assert.equal(
    config.decisionPolicy.wapeImprovementWithMaterialBiasWorsening,
    "MIXED"
  );
  assert.equal(
    config.decisionPolicy.technicalCompletionDoesNotImplyPerformanceSupport,
    true
  );
});

test("OA03 P0 freezes exact machine state enumerations", () => {
  assert.deepEqual(
    config.decisionPolicy.technicalReplicationStates,
    [
      "OA03_CURRENT_SCOPE_REPLICATION_COMPLETE",
      "OA03_CURRENT_SCOPE_REPLICATION_SEMANTIC_MISMATCH",
      "OA03_CURRENT_SCOPE_REPLICATION_BLOCKED_SOURCE_AUTHORITY",
      "OA03_CURRENT_SCOPE_REPLICATION_BLOCKED_NO_LEGAL_ORIGIN",
      "OA03_CURRENT_SCOPE_REPLICATION_BLOCKED_MODEL_IDENTITY_AMBIGUOUS",
      "OA03_CURRENT_SCOPE_REPLICATION_INFRASTRUCTURE_FAILURE_BEFORE_RESULT"
    ]
  );
  assert.deepEqual(
    config.decisionPolicy.workTotalStatesByHorizon,
    [
      "OA03_CURRENT_SCOPE_PERFORMANCE_SUPPORTED",
      "OA03_CURRENT_SCOPE_PERFORMANCE_MIXED",
      "OA03_CURRENT_SCOPE_PERFORMANCE_NOT_SUPPORTED",
      "OA03_CURRENT_SCOPE_PERFORMANCE_NOT_EVALUABLE"
    ]
  );
  assert.deepEqual(
    config.decisionPolicy.channelAllocationStatesByHorizon,
    [
      "OA03_TRAILING12_CHANNEL_ALLOCATION_SUPPORTED",
      "OA03_TRAILING12_CHANNEL_ALLOCATION_MIXED",
      "OA03_TRAILING12_CHANNEL_ALLOCATION_NOT_SUPPORTED",
      "OA03_TRAILING12_CHANNEL_ALLOCATION_NOT_EVALUABLE"
    ]
  );
  assert.deepEqual(
    config.decisionPolicy.summaryStates,
    [
      "M2_OA03_CURRENT_SCOPE_REPLICATION_COMPLETE_PERFORMANCE_SUPPORTED",
      "M2_OA03_CURRENT_SCOPE_REPLICATION_COMPLETE_PERFORMANCE_MIXED",
      "M2_OA03_CURRENT_SCOPE_REPLICATION_COMPLETE_PERFORMANCE_NOT_SUPPORTED",
      "M2_OA03_CURRENT_SCOPE_REPLICATION_BLOCKED"
    ]
  );
});

test("OA03 P0 capability inventory distinguishes sources, caches and receipts", () => {
  const capability = capabilityCatalog.capabilities.find(
    (row) => row.id === "m2-oa03-current-scope-replication"
  );
  assert.ok(capability);
  assert.equal(
    capability.privateArtifactClassificationVersion,
    "private-artifact-classification.v0.1"
  );
  const byClass = Object.groupBy(
    capability.requiredPrivateArtifacts,
    (row) => row.artifactClass
  );
  assert.equal(byClass.PRIVATE_SOURCE_AUTHORITY.length, 5);
  assert.equal(byClass.PRIVATE_DERIVED_CACHE.length, 15);
  assert.equal(byClass.PRIVATE_RUN_PROVENANCE.length, 2);
  assert.deepEqual(
    capability.canonicalValidationCommands,
    [
      "npm run doctor:capability -- m2-oa03-current-scope-replication",
      "npm run diagnose:m2:oa03-current-scope-replication",
      "npm run prepare:m2:current:oa03-current-scope-replication",
      "npm run develop:m2:current:oa03-current-scope-replication"
    ]
  );
  assert.equal(
    config.privateCapability.derivedCacheMissingStatus,
    "CACHE_MISS_REBUILDABLE"
  );
  assert.equal(
    config.privateCapability.historicalReceiptMissingStatus,
    "OPTIONAL_PROVENANCE_MISSING"
  );
  assert.equal(config.privateCapability.historicalReceiptMayBlock, false);
  assert.deepEqual(
    preregistration.capabilityDoctor,
    {
      capabilityId: "m2-oa03-current-scope-replication",
      status: "DERIVED_CACHE_MISS_REBUILD_REQUIRED",
      sourceAuthorityStatus: "SOURCE_AUTHORITY_AVAILABLE",
      sourceAuthorityRoleCount: 5,
      sourceAuthorityPresentCount: 5,
      derivedCacheStatus: "CACHE_MISS_REBUILDABLE",
      derivedCacheRoleCount: 10,
      derivedCachePresentCount: 6,
      derivedCacheMissingCount: 4,
      historicalReceiptStatus: "OPTIONAL_PROVENANCE_MISSING",
      historicalReceiptRoleCount: 1,
      safeToRebuildDerivedCache: true,
      safeToStartModelAfterRebuild: true,
      privateContentsRead: false
    }
  );
  assert.deepEqual(
    preregistration.p1ImplementationFreeze
      .privateArtifactInventoryAfterImplementation,
    {
      sourceAuthorityRoleCount: 5,
      derivedCacheRoleCount: 15,
      runProvenanceRoleCount: 2
    }
  );
  assert.equal(
    preregistration.p1ImplementationFreeze.newExperimentOuterOutcomeRead,
    false
  );
  assert.equal(
    preregistration.p1ImplementationFreeze.modelExecutionCount,
    0
  );
});

test("OA03 P0 authorizes one scoped replication but no expansive capability", () => {
  const authorization = config.authorization;
  assert.equal(authorization.privateSourceRead, true);
  assert.equal(authorization.derivedCacheRebuild, true);
  assert.equal(authorization.oa03TrainingAndFittingForStrictReplication, true);
  assert.equal(authorization.primaryAndStrictRolling, true);
  assert.equal(authorization.bootstrap2000, true);
  for (const field of [
    "laterOrFinalHoldout",
    "provider",
    "productionSharedOrStagingDatabase",
    "productionExactV03LoaderRouteApiMutation",
    "canary",
    "full160",
    "automation",
    "release",
    "m3Formal",
    "pullRequestMerge"
  ]) {
    assert.equal(authorization[field], false, field);
  }
  assert.equal(preregistration.outcomes.modelExecutionCount, 0);
  assert.equal(preregistration.outcomes.outerOutcomeRead, false);
  assert.equal(preregistration.outcomes.performanceMetrics, null);
  assert.equal(preregistration.outcomes.channelAllocationMetrics, null);
});

test("OA03 P0 portable contracts contain no absolute machine path", () => {
  for (const file of [
    configPath,
    preregistrationPath,
    "docs/analysis/m2-current/"
      + "M2-oa03-current-scope-replication-preregistration-v0.1.md"
  ]) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /[A-Za-z]:[\\/]/u, file);
    assert.doesNotMatch(
      text,
      /\/(?:home|Users|private|tmp|var)(?:\/|\\)/u,
      file
    );
  }
  for (const value of [
    ...Object.values(config.privateOutputs),
    ...Object.values(config.publicOutputs)
  ]) {
    assert.equal(path.isAbsolute(value), false, value);
  }
  assert.match(
    config.auditBaseline.dynamicStartHead,
    /^[0-9a-f]{40}$/u
  );
  assert.equal(
    config.auditBaseline.dynamicStartHeadRole,
    "AUDIT_ONLY_NOT_A_PORTABLE_EXECUTION_PRECONDITION"
  );
});

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}
