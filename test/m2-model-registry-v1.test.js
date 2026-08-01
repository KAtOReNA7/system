import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  canonicalEvidenceSha256,
  compareM2ModelRegistryEntries,
  explainM2Identifier,
  findM2ModelsByAlias,
  loadM2ModelRegistry,
  renderM2ModelCatalog,
  validateM2ModelRegistry
} from "../src/domain/m2Current/modelRegistry.js";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const registry = loadM2ModelRegistry(
  path.join(root, "config", "m2-model-registry.v1.json")
);

test("registry schema, evidence paths and immutable digests validate", () => {
  const validation = validateM2ModelRegistry(registry, { repoRoot: root });
  assert.equal(validation.valid, true, validation.errors.join("\n"));
  assert.equal(
    registry.validationRules.historicalEvidenceDigestContract,
    "sha256_utf8_lf_v1"
  );
  assert.equal(
    canonicalEvidenceSha256("same\r\ncontent\r\n"),
    canonicalEvidenceSha256("same\ncontent\n")
  );
  assert.equal(validation.counts.modelCount, 35);
  assert.equal(validation.counts.experimentCount, 23);
  assert.equal(validation.counts.nonModelIdentifierCount, 129);
  assert.equal(validation.counts.evaluationCount, 115);
  assert.equal(validation.counts.comparabilityGroupCount, 59);
});

test("stable model IDs and model aliases are unique", () => {
  const ids = registry.models.map((model) => model.stableModelId);
  assert.equal(new Set(ids).size, ids.length);
  const aliases = registry.models.flatMap((model) => (
    [model.stableModelId, ...model.legacyIds, ...model.legacyAliases]
      .map((alias) => alias.normalize("NFKC").trim().toLowerCase())
  ));
  assert.equal(new Set(aliases).size, aliases.length);
  assert.equal(
    findM2ModelsByAlias(registry, "exact-v0.3")[0].stableModelId,
    "M2-WORK-OA03"
  );
});

test("model and non-model namespaces are separate and collisions are explicit", () => {
  const b4 = explainM2Identifier(registry, "B4");
  assert.equal(b4.models[0].stableModelId, "M2-WORK-B4");
  assert.equal(b4.nonModels.length, 1);
  assert.equal(b4.nonModels[0].type, "governance_stage_and_legacy_alias");
  const r3 = explainM2Identifier(registry, "R3");
  assert.equal(r3.models.length, 0);
  assert.equal(r3.nonModels[0].type, "evaluation_campaign_stage");
  assert.equal(
    registry.validationRules.aliasCollisionLedger.some(
      (entry) => entry.alias === "B4"
    ),
    true
  );
});

test("current roles retain fallback, research baseline and no automation promotion", () => {
  assert.equal(
    registry.currentRoles.operationalWorkFallback,
    "M2-WORK-OA03"
  );
  assert.equal(
    registry.currentRoles.researchWorkBaseline,
    "M2-WORK-LG01"
  );
  assert.equal(
    registry.currentRoles.portfolioReference,
    "M2-PORT-ETS01"
  );
  assert.equal(registry.currentRoles.activeCandidate, null);
  assert.equal(registry.currentRoles.approvedForAutomation, null);
  assert.equal(registry.currentRoles.roleConflict, false);
  assert.equal(
    registry.currentRoles.operationalWorkFallbackScope,
    "compatibility_operational_fallback_only_no_current_scope_performance_support"
  );
  assert.equal(
    registry.currentRoles.coreLegacyHorizonAmountResearchComparator,
    "M2-WORK-LG01"
  );
  assert.equal(registry.currentRoles.activeExperiment, null);
  assert.equal(registry.currentRoles.blockedExperiment, null);
  assert.equal(registry.currentRoles.pendingExperiment, null);
  assert.match(
    registry.currentRoles.roleInterpretationZh,
    /M2-WORK-HPSR02.*已完成唯一一次 2026-03 起点独立评价/u
  );
  assert.match(
    registry.currentRoles.roleInterpretationZh,
    /M2_HPSR02_FIRST_INDEPENDENT_INCONCLUSIVE_CASH_ONLY_RESEARCH_ENDED/u
  );
  assert.match(
    registry.currentRoles.roleInterpretationZh,
    /前瞻最终留出、第二独立起点、后继现金模型、活动候选、自动化与生产权限均为空/u
  );
  const historicalChampionAssertions = registry.currentRoles.sourceAssertions
    .filter((item) => /champion/u.test(item.assertion));
  assert.equal(historicalChampionAssertions.length, 2);
  assert.equal(
    historicalChampionAssertions.every(
      (item) => (
        item.historicalAssertion === true
        && item.currentAuthority === false
        && item.supersededBy
          === "docs/analysis/m2-current/M2-oa03-current-role-correction-v0.1.md"
      )
    ),
    true
  );
});

test("core-revenue manual candidate failed without promotion", () => {
  const model = registry.models.find(
    (item) => item.stableModelId === "M2-WORK-CRMR01"
  );
  const experiment = registry.experiments.find(
    (item) => (
      item.experimentId === "M2-EXP-CORE-REVENUE-MANUAL-01"
    )
  );
  assert.equal(
    model.evidenceStatus,
    "first_valid_development_evaluation_failed_long_term_compounding"
  );
  assert.equal(model.currentRole, "failed_development_candidate");
  assert.equal(model.evaluations.length, 6);
  assert.equal(
    model.evaluations.slice(0, 2).every(
      (item) => (
        item.resultStatus === "M2_CORE_REVENUE_MANUAL_BASELINE_FAIL"
      )
    ),
    true
  );
  assert.equal(model.automationAuthorized, false);
  assert.equal(model.productionImported, false);
  assert.deepEqual(
    experiment.modelIds,
    ["M2-WORK-CRMR01", "M2-WORK-LG01", "M2-WORK-OA03"]
  );
  assert.equal(
    experiment.arms.find(
      (item) => item.armId === "MANUAL_RULE"
    ).executionStatus,
    "EXECUTED_FAILED_LONG_TERM_COMPOUNDING"
  );
});

test("layered revenue composition failed without post-outcome replacement", () => {
  const model = registry.models.find(
    (item) => item.stableModelId === "M2-PORT-LRC01"
  );
  const experiment = registry.experiments.find(
    (item) => (
      item.experimentId === "M2-EXP-LAYERED-REVENUE-COMPOSITION-01"
    )
  );
  assert.equal(model.currentRole, "failed_development_candidate");
  assert.equal(model.evaluations.length, 2);
  assert.equal(
    model.evaluations.every(
      (item) => (
        item.resultStatus === "M2_LAYERED_REVENUE_COMPOSITION_FAIL"
      )
    ),
    true
  );
  assert.equal(model.automationAuthorized, false);
  assert.equal(model.productionImported, false);
  assert.equal(
    experiment.arms.find(
      (item) => item.armId === "L5B"
    ).executionStatus,
    "EXECUTED_PRIMARY_FAILED"
  );
  assert.equal(
    experiment.arms.find(
      (item) => item.armId === "L6B"
    ).executionStatus,
    "NOT_EXECUTED_DUPLICATES_L6A"
  );
});

test("core legacy population test records non-confirmation without promotion", () => {
  const experiment = registry.experiments.find(
    (item) => (
      item.experimentId === "M2-EXP-CORE-LEGACY-POPULATION-01"
    )
  );
  assert.equal(
    experiment.resultStatus,
    "TAIL_INTERFERENCE_NOT_CONFIRMED"
  );
  assert.equal(
    experiment.arms.find(
      (item) => item.armId === "T1_CORE90"
    ).executionStatus,
    "EXECUTED_TAIL_INTERFERENCE_NOT_CONFIRMED"
  );
  assert.equal(
    experiment.arms.find(
      (item) => item.armId === "T2_CORE80"
    ).executionStatus,
    "EXECUTED_DEGRADED_TAIL_INTERFERENCE_NOT_CONFIRMED"
  );
  assert.equal(
    experiment.arms.find(
      (item) => item.armId === "T3_REVENUE_WEIGHTED_FULL"
    ).executionStatus,
    "NOT_EXECUTED_REQUIRES_MODEL_CHANGE"
  );
  assert.equal(
    registry.currentRoles.latestStateIndex,
    "docs/analysis/m2-v2/M2-v2-current-state-index-v0.55.md"
  );
  assert.equal(registry.currentRoles.activeCandidate, null);
  assert.equal(registry.currentRoles.approvedForAutomation, null);
});

test("CHAM01 first complete result is failed, frozen and not promoted", () => {
  const model = registry.models.find(
    (item) => item.stableModelId === "M2-WORK-CHAM01"
  );
  const experiment = registry.experiments.find(
    (item) => (
      item.experimentId === "M2-EXP-CORE-HORIZON-AMOUNT-01"
    )
  );
  assert.equal(model.currentRole, "failed_development_candidate");
  assert.equal(
    model.operationalStatus,
    "development_failed_frozen_no_further_run_authorized"
  );
  assert.equal(model.evaluations.length, 12);
  assert.equal(
    model.evaluations.slice(1, 7).every(
      (item) => item.rawArmId === "B3"
    ),
    true
  );
  assert.equal(
    model.evaluations.slice(1, 7).every(
      (item) => (
        item.resultStatus === "M2_CORE_HORIZON_AMOUNT_HORIZON_FAIL"
        || item.resultStatus === "M2_CORE_HORIZON_AMOUNT_DEVELOPMENT_FAIL"
      )
    ),
    true
  );
  assert.equal(
    model.evaluations.slice(7).every(
      (item) => (
        item.resultStatus
          === "M2_CHAM01_PRIMARY_CORE90_NUMERIC_STABILITY_FAIL_"
            + "FINITE_EXTREME_EXTRAPOLATION"
        && item.numericStabilityStatus
          === "NUMERIC_STABILITY_FAIL_FINITE_EXTREME_EXTRAPOLATION"
      )
    ),
    true
  );
  assert.equal(
    model.evaluations.slice(7).every(
      (item) => item.maximumSingleWorkAbsoluteErrorShare > 0.9999999999999
    ),
    true
  );
  assert.equal(
    experiment.resultStatus,
    "M2_CORE_HORIZON_AMOUNT_DEVELOPMENT_FAIL"
  );
  assert.equal(experiment.candidateOutcomeProduced, true);
  assert.equal(experiment.firstValidCompleteOutcomeFrozen, true);
  assert.deepEqual(
    experiment.bestRawArms,
    { H3: "B3", H6: "B3", H12: "B3" }
  );
  assert.equal(
    Object.values(experiment.horizonDecisions).every(
      (status) => status === "M2_CORE_HORIZON_AMOUNT_HORIZON_FAIL"
    ),
    true
  );
  assert.equal(experiment.secondResultExecuted, false);
  assert.equal(registry.currentRoles.activeExperiment, null);
  assert.equal(registry.currentRoles.activeCandidate, null);
  assert.equal(registry.currentRoles.approvedForAutomation, null);
});

test("HCRC01 first complete failure is frozen without promotion", () => {
  const model = registry.models.find(
    (item) => item.stableModelId === "M2-WORK-HCRC01"
  );
  const experiment = registry.experiments.find(
    (item) => (
      item.experimentId === "M2-EXP-LG01-HEAD-CASH-RESIDUAL-01"
    )
  );

  assert.equal(
    model.currentRole,
    "failed_development_candidate"
  );
  assert.equal(
    model.operationalStatus,
    "development_failed_frozen_no_second_evaluation_not_selected_not_production"
  );
  assert.deepEqual(
    model.predecessorIds,
    ["M2-WORK-LG01", "M2-WORK-CHAM01"]
  );
  assert.equal(model.evaluations.length, 4);
  assert.equal(
    model.evaluations.every((evaluation) => (
      evaluation.caseCount === 0
      && evaluation.WAPE === null
      && evaluation.relativeWape === null
      && evaluation.rawCoverage === 0
      && evaluation.resultStatus === "M2_LG01_HEAD_CASH_RESIDUAL_FAIL"
      && evaluation.selectedPipelineModelId === "M2-WORK-LG01"
      && evaluation.selectedPipelineStatus
        === "FALLBACK_ONLY_NOT_RAW_CANDIDATE_EVIDENCE"
    )),
    true
  );
  assert.equal(model.automationAuthorized, false);
  assert.equal(model.productionImported, false);
  assert.deepEqual(
    experiment.arms.map((arm) => arm.armId),
    ["C0", "C1", "C2", "C3"]
  );
  assert.equal(
    experiment.resultStatus,
    "M2_LG01_HEAD_CASH_RESIDUAL_FAIL"
  );
  assert.equal(experiment.candidateOutcomeProduced, true);
  assert.equal(experiment.rawCandidateEvidenceProduced, false);
  assert.equal(experiment.firstCompleteOutcomeFrozen, true);
  assert.equal(experiment.outerOutcomeRead, true);
  assert.equal(experiment.qualifiedOuterSelectionCount, 0);
  assert.equal(
    experiment.selectedPipelineUniversalFallbackModelId,
    "M2-WORK-LG01"
  );
  assert.equal(experiment.secondResultAuthorized, false);
  assert.equal(experiment.secondResultExecuted, false);
  assert.equal(registry.currentRoles.activeCandidate, null);
  assert.equal(registry.currentRoles.approvedForAutomation, null);
});

test("HPSR01 frozen result is preserved while interpretation is amended", () => {
  const model = registry.models.find(
    (item) => item.stableModelId === "M2-WORK-HPSR01"
  );
  const experiment = registry.experiments.find(
    (item) => (
      item.experimentId
        === "M2-EXP-LG01-HEAD-PROTECTED-SEGMENTED-ROUTER-01"
    )
  );

  assert.equal(
    model.currentRole,
    "contract_unsupported_scientifically_inconclusive_interpretation_amended"
  );
  assert.equal(
    model.operationalStatus,
    "original_contract_unsupported_not_selected_not_production_hpsr02_preregistered"
  );
  assert.deepEqual(
    model.predecessorIds,
    ["M2-WORK-LG01", "M2-WORK-CHAM01", "M2-WORK-HCRC01"]
  );
  assert.deepEqual(model.successorIds, ["M2-WORK-HPSR02"]);
  assert.equal(model.evaluations.length, 2);
  assert.equal(
    model.evaluations[0].comparableGroupId,
    "CG-HPSR01-RETROSPECTIVE-CORE80-STRICT-WORK-H3-2025-11"
  );
  assert.equal(model.evaluations[0].caseCount, 57);
  assert.equal(model.evaluations[0].workCount, 57);
  assert.equal(model.evaluations[0].originCount, 1);
  assert.equal(model.evaluations[0].WAPE, 0.14201942459219122);
  assert.equal(model.evaluations[0].signedBias, -0.08733276491879227);
  assert.equal(model.evaluations[0].relativeWape, 0.00847712522619727);
  assert.equal(model.evaluations[0].independentEvidence, false);
  assert.equal(
    model.evaluations[0].resultStatus,
    "M2_HPSR01_RETROSPECTIVE_DEVELOPMENT_UNSUPPORTED_STOP_BEFORE_K2"
  );
  assert.equal(model.automationAuthorized, false);
  assert.equal(model.productionImported, false);
  assert.equal(model.finalHoldoutOpened, false);
  assert.deepEqual(
    experiment.arms.map((arm) => arm.armId),
    ["R0", "D1", "R1", "R2"]
  );
  assert.equal(
    experiment.resultStatus,
    "M2_HPSR01_RETROSPECTIVE_DEVELOPMENT_UNSUPPORTED_STOP_BEFORE_K2"
  );
  assert.equal(
    experiment.scientificInterpretationStatus,
    "M2_HPSR01_CONTRACT_UNSUPPORTED_SCIENTIFICALLY_INCONCLUSIVE"
  );
  assert.equal(experiment.interpretationAmended, true);
  assert.equal(experiment.k1CanonicalImplementationComplete, true);
  assert.equal(experiment.k1PublicSyntheticValidationComplete, true);
  assert.equal(experiment.k2PrivateEvaluationAuthorized, false);
  assert.equal(experiment.k2ConditionallyAuthorizedByCurrentTask, true);
  assert.equal(experiment.k2Executed, false);
  assert.equal(experiment.k2StoppedByRetrospectiveUnsupported, true);
  assert.equal(
    experiment.arms.find((arm) => arm.armId === "R1").executionStatus,
    "RETROSPECTIVE_DEVELOPMENT_EVALUATED_UNSUPPORTED_STOP_BEFORE_K2"
  );
  assert.equal(
    experiment.arms
      .filter((arm) => ["R0", "D1"].includes(arm.armId))
      .every(
        (arm) => (
          /RETROSPECTIVE_DEVELOPMENT_EVALUATED/u.test(arm.executionStatus)
        )
      ),
    true
  );
  assert.equal(experiment.candidateOutcomeProduced, true);
  assert.equal(experiment.rawCandidateEvidenceProduced, true);
  assert.equal(experiment.firstCompleteOutcomeFrozen, true);
  assert.equal(experiment.retrospectiveDevelopmentEvaluationExecuted, true);
  assert.deepEqual(experiment.retrospectiveOrigins, ["2025-11"]);
  assert.equal(experiment.retrospectiveIndependentEvidence, false);
  assert.equal(experiment.outerOutcomeRead, false);
  assert.equal(experiment.eligibleLaterOriginCount, 0);
  assert.equal(experiment.newFinalHoldoutOpened, false);
  assert.equal(registry.currentRoles.activeExperiment, null);
  assert.equal(registry.currentRoles.activeCandidate, null);
  assert.equal(registry.currentRoles.approvedForAutomation, null);
});

test("HPSR02 first independent result freezes inconclusive without promotion", () => {
  const model = registry.models.find(
    (item) => item.stableModelId === "M2-WORK-HPSR02"
  );
  const experiment = registry.experiments.find(
    (item) => (
      item.experimentId
        === "M2-EXP-LG01-HEAD-PROTECTED-TAIL-BAND-CORRECTION-02"
    )
  );
  const predecessorExperiment = registry.experiments.find(
    (item) => (
      item.experimentId
        === "M2-EXP-LG01-HEAD-PROTECTED-SEGMENTED-ROUTER-01"
    )
  );

  assert.equal(
    model.currentRole,
    "first_independent_inconclusive_cash_only_research_ended_not_active"
  );
  assert.equal(
    model.evidenceStatus,
    "first_independent_complete_result_frozen_inconclusive"
  );
  assert.equal(
    model.currentExperimentId,
    "M2-EXP-LG01-HEAD-PROTECTED-TAIL-BAND-CORRECTION-02"
  );
  assert.equal(model.evaluations.length, 1);
  assert.equal(
    model.evaluations[0].resultStatus,
    "M2_HPSR02_FIRST_INDEPENDENT_INCONCLUSIVE_"
      + "CASH_ONLY_RESEARCH_ENDED"
  );
  assert.equal(model.evaluations[0].WAPE, 0.6411499149761899);
  assert.equal(model.evaluations[0].relativeWape, 0.0051793719874129816);
  assert.equal(model.automationAuthorized, false);
  assert.equal(model.productionImported, false);
  assert.equal(model.finalHoldoutOpened, false);
  const hpsr02Arm = experiment.arms.find((arm) => arm.armId === "R2");
  assert.equal(
    hpsr02Arm.executionStatus,
    "FIRST_INDEPENDENT_EXECUTED_RESULT_FROZEN"
  );
  assert.equal(
    predecessorExperiment.hpsr02IndependentEvaluation.status,
    "M2_HPSR02_FIRST_INDEPENDENT_INCONCLUSIVE_"
      + "CASH_ONLY_RESEARCH_ENDED"
  );
  assert.equal(
    predecessorExperiment.hpsr02IndependentEvaluation.priorStatus,
    "M2_HPSR02_BLOCKED_ACTIONABLE_SOURCE_AUTHORITY_DECISION_REQUIRED"
  );
  assert.equal(
    predecessorExperiment.hpsr02IndependentEvaluation
      .priorStatusHistoryRewritten,
    false
  );
  assert.equal(
    predecessorExperiment.hpsr02IndependentEvaluation.sourceAuthorityStatus,
    "SOURCE_AUTHORITY_AVAILABLE_FOR_WORK_TOTAL"
  );
  assert.equal(
    predecessorExperiment.hpsr02IndependentEvaluation.workTotalScopeRelevantDifferenceRowCount,
    0
  );
  assert.equal(
    predecessorExperiment.hpsr02IndependentEvaluation.workChannelGateStatus,
    "PARTIAL_NOT_ACTIVE"
  );
  assert.equal(
    predecessorExperiment.hpsr02IndependentEvaluation.outcomeValueAccessOccurred,
    true
  );
  assert.equal(
    predecessorExperiment.hpsr02IndependentEvaluation.preResultEngineeringAttemptCount,
    7
  );
  assert.deepEqual(
    predecessorExperiment.hpsr02IndependentEvaluation.preResultEngineeringErrorCodes,
    [
      "m2_hpsr_rebuilt_work_case_duplicate",
      "hpsr02_residual_bound_rebuild_not_reconciled",
      "m2_core_revenue_manual_command_failed:node.exe",
      "M2_HPSR02_BLOCKED_MISSING_IMMUTABLE_FROZEN_PARAMETER",
      "hpsr02_parameter_lineage_snapshot_invalid",
      "hpsr02_private_or_absolute_path_forbidden",
      "hpsr02_independent_source_gate_invalid"
    ]
  );
  assert.equal(
    predecessorExperiment.hpsr02IndependentEvaluation.frozenBoundSourceStatus,
    "IMMUTABLE_FROZEN_MODEL_PARAMETER_VALIDATED"
  );
  assert.equal(
    predecessorExperiment.hpsr02IndependentEvaluation.historicalOnlyRowCount,
    732
  );
  assert.equal(
    predecessorExperiment.hpsr02IndependentEvaluation.currentOnlyRowCount,
    732
  );
  assert.equal(
    predecessorExperiment.hpsr02IndependentEvaluation.workMonthAmountTotalEqual,
    true
  );
  assert.equal(
    predecessorExperiment.hpsr02IndependentEvaluation.sourceAuthorityDecisionRequired,
    false
  );
  assert.equal(
    predecessorExperiment.hpsr02IndependentEvaluation.scientificEvaluationsExecuted,
    1
  );
  assert.equal(
    predecessorExperiment.hpsr02IndependentEvaluation.prospectiveFinalHoldoutOpened,
    false
  );
  assert.equal(experiment.currentAuthority, true);
  assert.equal(
    experiment.predecessorExperimentId,
    "M2-EXP-LG01-HEAD-PROTECTED-SEGMENTED-ROUTER-01"
  );
  assert.equal(experiment.k2PrivateEvaluationAuthorized, false);
  assert.equal(experiment.k2AuthorizationConsumed, true);
  assert.equal(experiment.k2Executed, true);
  assert.equal(experiment.completeIndependentResultCount, 1);
  assert.equal(experiment.resultFrozen, true);
  assert.equal(experiment.cashOnlyResearchEnded, true);
  assert.equal(experiment.independentOutcomeRead, true);
  assert.equal(registry.currentRoles.activeExperiment, null);
  assert.equal(registry.currentRoles.activeCandidate, null);
  assert.equal(registry.currentRoles.approvedForAutomation, null);
});

test("evaluations preserve population and comparability contracts", () => {
  const oa03 = registry.models.find(
    (model) => model.stableModelId === "M2-WORK-OA03"
  );
  assert.equal(oa03.evaluations.length, 19);
  assert.notEqual(
    oa03.evaluations[0].comparableGroupId,
    oa03.evaluations[1].comparableGroupId
  );
  const sameCase = compareM2ModelRegistryEntries(
    registry,
    "M2-WORK-OA03",
    "M2-WORK-CCR01"
  );
  assert.equal(sameCase.comparable, true);
  const differentPopulation = compareM2ModelRegistryEntries(
    registry,
    "M2-WORK-OA03",
    "M2-WORK-LG01"
  );
  assert.equal(differentPopulation.comparable, true);
  assert.deepEqual(
    new Set(differentPopulation.pairs.map(
      (pair) => pair.left.comparableGroupId
    )),
    new Set([
      "CG-WORK-SS-OVERLAP-5203-H36",
      "CG-PSC01-V22-PRIMARY-12039-H36",
      "CG-PSC01-V22-STRICT-74320"
    ])
  );
  const differentGrain = compareM2ModelRegistryEntries(
    registry,
    "M2-WORK-OA03",
    "M2-PORT-ETS01"
  );
  assert.equal(differentGrain.comparable, false);
  assert.equal(differentGrain.winnerByWape, null);
  assert.equal(
    differentGrain.differences.some((item) => item.field === "grain"),
    true
  );
});

test("OA03 current-scope replication closes without conflating allocation with a model", () => {
  const oa03 = registry.models.find(
    (model) => model.stableModelId === "M2-WORK-OA03"
  );
  const experiment = registry.experiments.find(
    (item) => (
      item.experimentId === "M2-EXP-OA03-CURRENT-SCOPE-REPLICATION-01"
    )
  );
  const evaluations = oa03.evaluations.filter(
    (item) => (
      item.datasetVersion === "M2-oa03-current-scope-replication-v0.1"
    )
  );
  const primary = evaluations.filter(
    (item) => item.comparableGroupId.includes("-PRIMARY-WORK-")
  );
  const strict = evaluations.filter(
    (item) => item.comparableGroupId.includes("-STRICT-WORK-")
  );
  const groups = registry.comparabilityGroups.filter(
    (item) => item.comparableGroupId.startsWith("CG-OA03-CS-")
  );

  assert.equal(evaluations.length, 12);
  assert.equal(primary.length, 6);
  assert.equal(
    primary.every(
      (item) => (
        item.resultStatus === "OA03_CURRENT_SCOPE_PERFORMANCE_NOT_EVALUABLE"
        && item.baselineModelId === null
        && item.primaryReferenceModelId === "M2-WORK-LG01"
      )
    ),
    true
  );
  assert.equal(strict.length, 6);
  assert.equal(
    strict.every(
      (item) => (
        item.resultStatus === "OA03_CURRENT_SCOPE_PERFORMANCE_NOT_SUPPORTED"
        && item.baselineModelId === "M2-WORK-LG01"
      )
    ),
    true
  );
  assert.equal(groups.length, 24);
  assert.equal(
    groups.filter((item) => item.grain === "work_origin_horizon").length,
    12
  );
  assert.equal(
    groups.filter(
      (item) => item.grain === "work_origin_channel_horizon"
    ).length,
    12
  );
  assert.equal(
    evaluations.some(
      (item) => item.grain === "work_origin_channel_horizon"
    ),
    false
  );
  assert.equal(
    experiment.technicalReplicationStatus,
    "OA03_CURRENT_SCOPE_REPLICATION_COMPLETE"
  );
  assert.equal(
    experiment.summaryStatus,
    "M2_OA03_CURRENT_SCOPE_REPLICATION_COMPLETE_PERFORMANCE_MIXED"
  );
  assert.equal(
    oa03.evidenceStatus,
    "current_scope_formula_reexecution_complete_no_new_performance_support"
  );
  assert.equal(oa03.currentScopeChampion, false);
  assert.equal(oa03.nativeConditionalPositiveAmountStored, false);
  assert.equal(
    oa03.operationalStatus,
    "compatibility_operational_fallback_not_current_scope_champion"
  );
  assert.equal(experiment.modelRolesChanged, false);
  assert.equal(experiment.secondResultExecuted, false);
  assert.equal(
    experiment.arms.find((arm) => arm.armId === "C1").modelId,
    null
  );
  assert.equal(registry.currentRoles.activeCandidate, null);
  assert.equal(registry.currentRoles.approvedForAutomation, null);
});

test("horizon router and observed-channel allocation close without promotion", () => {
  const model = registry.models.find(
    (item) => item.stableModelId === "M2-WORK-HR01"
  );
  const experiment = registry.experiments.find(
    (item) => (
      item.experimentId === "M2-EXP-CORE-LEGACY-HORIZON-ROUTER-01"
    )
  );
  assert.equal(model.entityType, "model_pipeline");
  assert.equal(model.currentRole, "failed_development_candidate");
  assert.equal(model.evaluations.length, 4);
  assert.equal(
    model.evaluations.every(
      (item) => item.resultStatus === "HORIZON_ROUTER_NOT_CONFIRMED"
    ),
    true
  );
  assert.equal(
    experiment.sameCaseEvidenceStatus,
    "SAME_CASE_EVIDENCE_COMPLETE_FOR_LEGAL_MODEL_INTERSECTIONS"
  );
  assert.equal(
    experiment.horizonRouterStatus,
    "HORIZON_ROUTER_NOT_CONFIRMED"
  );
  assert.equal(
    experiment.channelAllocationStatus,
    "CHANNEL_ALLOCATION_MIXED"
  );
  assert.equal(registry.currentRoles.activeCandidate, null);
  assert.equal(registry.currentRoles.approvedForAutomation, null);
});

test("channel generative G1 execution is eligibility-blocked rather than failed", () => {
  const experiment = registry.experiments.find(
    (item) => item.experimentId === "M2-EXP-CHANNEL-GENERATIVE-02"
  );
  assert.equal(
    experiment.arms.find((arm) => arm.armId === "G1").executionStatus,
    "EXECUTION_STARTED_BLOCKED_INNER_ELIGIBILITY_NO_CANDIDATE_OUTCOME"
  );
  const model = registry.models.find(
    (item) => item.stableModelId === "M2-CHAN-GEN02"
  );
  assert.equal(model.operationalStatus, "blocked_not_failed");
  assert.equal(model.evaluations.at(-1).WAPE, null);
  assert.equal(
    model.evaluations.at(-1).resultStatus,
    "M2_CHANNEL_GENERATIVE_G1_CORE_BLOCKED"
  );
});

test("long-term reporting rules are placed at the minimal AGENTS scope", async () => {
  const [rootRules, scopedRules] = await Promise.all([
    readFile(path.join(root, "AGENTS.md"), "utf8"),
    readFile(path.join(root, "src", "domain", "m2Current", "AGENTS.md"), "utf8")
  ]);
  assert.match(rootRules, /用户可见的阶段反馈、结论和复盘必须中文优先/u);
  assert.match(rootRules, /历史文件名、历史 ID[\s\S]+不得因此被重命名、改写或回填/u);
  assert.match(scopedRules, /m2-model-registry\.v1\.json/u);
  assert.match(scopedRules, /G1.*A5.*R3.*K1/u);
  assert.match(scopedRules, /Rank evaluations only when target/u);
  assert.match(scopedRules, /raw candidate metrics or raw FVA/u);
  assert.doesNotMatch(scopedRules, /481441f|30276695120|PR #28/u);
});

test("registry contains no private path and performs no model execution", () => {
  const serialized = JSON.stringify(registry);
  assert.doesNotMatch(serialized, /data[\\/]+private-(input|output)/iu);
  assert.equal(
    registry.models.some((model) => model.productionImported),
    false
  );
  assert.equal(
    registry.models.some((model) => model.automationAuthorized),
    false
  );
  assert.equal(
    registry.models.some((model) => model.finalHoldoutOpened),
    false
  );
});

test("reader catalog is a deterministic complete rendering of the registry", async () => {
  const catalog = await readFile(
    path.join(
      root,
      "docs",
      "analysis",
      "m2-current",
      "M2-model-catalog-and-scorecard-v1.md"
    ),
    "utf8"
  );
  assert.equal(catalog, renderM2ModelCatalog(registry));
  assert.match(catalog, /M2-WORK-OA03/u);
  assert.match(catalog, /M2-EXP-OA03-CURRENT-SCOPE-REPLICATION-01/u);
  assert.match(catalog, /CG-OA03-CS-CORE80-PRIMARY-WORK-H3/u);
  assert.match(catalog, /OA03_CURRENT_SCOPE_PERFORMANCE_NOT_EVALUABLE/u);
  assert.match(catalog, /CG-G1-BLOCKED-NO-CANDIDATE-OUTCOME/u);
  assert.match(catalog, /M2_CHANNEL_GENERATIVE_G1_CORE_BLOCKED/u);
  assert.match(catalog, /M2_PUBLISHING_SCALE_IMPLEMENTATION_BLOCKED/u);
  assert.match(
    catalog,
    /ESTIMATOR_SCALE_SHRINKAGE_CONFIRMED_IMPLEMENTATION_CORRECT/u
  );
  assert.match(
    catalog,
    /M2_PSC02_ORIGIN_VISIBLE_CASH_ANCHOR_PREREGISTERED_IMPLEMENTATION_NOT_AUTHORIZED/u
  );
  assert.match(catalog, /M2-PORT-LRC01/u);
  assert.match(catalog, /M2_LAYERED_REVENUE_COMPOSITION_FAIL/u);
  assert.match(catalog, /TAIL_INTERFERENCE_NOT_CONFIRMED/u);
  assert.match(catalog, /CG-CORE-LEGACY-K2-CORE80-WORK-H3/u);
  assert.match(catalog, /M2-WORK-HR01/u);
  assert.match(catalog, /HORIZON_ROUTER_NOT_CONFIRMED/u);
  assert.match(catalog, /M2_PUBLISHING_SCALE_CORE_FAIL/u);
  assert.match(catalog, /CG-PSC01-V22-PRIMARY-12039-H36/u);
  assert.match(catalog, /CG-PSC01-V22-STRICT-74320/u);
  assert.match(catalog, /M2-WORK-CHAM01/u);
  assert.match(catalog, /M2-EXP-CORE-HORIZON-AMOUNT-01/u);
  assert.match(catalog, /M2-WORK-HCRC01/u);
  assert.match(catalog, /M2-EXP-LG01-HEAD-CASH-RESIDUAL-01/u);
  assert.match(catalog, /M2-WORK-HPSR01/u);
  assert.match(
    catalog,
    /M2-EXP-LG01-HEAD-PROTECTED-SEGMENTED-ROUTER-01/u
  );
  assert.match(
    catalog,
    /M2_HPSR01_RETROSPECTIVE_DEVELOPMENT_UNSUPPORTED_STOP_BEFORE_K2/u
  );
  assert.match(
    catalog,
    /CG-HPSR01-RETROSPECTIVE-CORE80-STRICT-WORK-H3-2025-11/u
  );
  assert.match(catalog, /M2-WORK-HPSR02/u);
  assert.match(
    catalog,
    /M2-EXP-LG01-HEAD-PROTECTED-TAIL-BAND-CORRECTION-02/u
  );
  assert.match(
    catalog,
    /M2_HPSR01_CONTRACT_UNSUPPORTED_SCIENTIFICALLY_INCONCLUSIVE/u
  );
  assert.match(
    catalog,
    /CG-HPSR02-INDEPENDENT-LATER-ORIGIN-DYNAMIC-CORE80-WORK-H3/u
  );
  assert.match(catalog, /eval-hcrc01-c2-core80-strict-h3-raw/u);
  assert.match(
    catalog,
    /FALLBACK_ONLY_NOT_RAW_CANDIDATE_EVIDENCE/u
  );
  assert.match(
    catalog,
    /M2_CHAM01_PRIMARY_CORE90_NUMERIC_STABILITY_FAIL_FINITE_EXTREME_EXTRAPOLATION/u
  );
  assert.match(
    catalog,
    /M2_CORE_HORIZON_AMOUNT_PRIVATE_EXECUTION_INVALIDATED_RETRY_EXHAUSTED/u
  );
});

test("read-only query exposes scoped identities and refuses invalid ranking", () => {
  const list = runQuery("list");
  assert.equal(list.status, 0, list.stderr);
  assert.match(list.stdout, /M2 持久模型与模型族：35 个/u);
  assert.match(list.stdout, /M2-CHAN-GEN02/u);
  assert.match(list.stdout, /M2-WORK-CHAM01/u);
  assert.match(list.stdout, /M2-WORK-HPSR01/u);
  assert.match(list.stdout, /M2-WORK-HPSR02/u);

  const status = runQuery("status");
  assert.equal(status.status, 0, status.stderr);
  assert.match(status.stdout, /本次只读查询模型执行次数：0/u);
  assert.match(status.stdout, /当前实验：无（null）/u);
  assert.match(status.stdout, /兼容性现行运行回退模型/u);
  assert.match(status.stdout, /已完成唯一一次 2026-03 起点独立评价/u);
  assert.match(status.stdout, /结束现金-only 相邻研究/u);
  assert.match(status.stdout, /M2-WORK-OA03/u);
  assert.match(status.stdout, /原 v0\.1 合同结果继续是回溯开发不支持/u);
  assert.match(
    status.stdout,
    /科学解释状态为 M2_HPSR01_CONTRACT_UNSUPPORTED_SCIENTIFICALLY_INCONCLUSIVE/u
  );
  assert.match(
    status.stdout,
    /当前待门禁实验：无（null）/u
  );
  assert.match(
    status.stdout,
    /M2_HPSR02_FIRST_INDEPENDENT_INCONCLUSIVE_CASH_ONLY_RESEARCH_ENDED/u
  );

  const horizonAmount = runQuery("show", "M2-WORK-CHAM01");
  assert.equal(horizonAmount.status, 0, horizonAmount.stderr);
  assert.match(horizonAmount.stdout, /已执行失败候选/u);
  assert.match(
    horizonAmount.stdout,
    /development_failed_frozen_no_further_run_authorized/u
  );

  const headCashResidual = runQuery("show", "M2-WORK-HCRC01");
  assert.equal(headCashResidual.status, 0, headCashResidual.stderr);
  assert.match(headCashResidual.stdout, /已执行失败候选/u);
  assert.match(headCashResidual.stdout, /已执行但未通过/u);
  assert.match(headCashResidual.stdout, /eval-hcrc01-c2-core80-strict-h3-raw/u);
  assert.match(headCashResidual.stdout, /WAPE 未登记（null）/u);
  assert.match(
    headCashResidual.stdout,
    /M2_LG01_HEAD_CASH_RESIDUAL_FAIL/u
  );

  const tailBandCorrection = runQuery("show", "M2-WORK-HPSR02");
  assert.equal(
    tailBandCorrection.status,
    0,
    tailBandCorrection.stderr
  );
  assert.match(
    tailBandCorrection.stdout,
    /首个独立起点证据不足，现金相邻研究结束且未激活/u
  );
  assert.match(
    tailBandCorrection.stdout,
    /现金相邻研究已结束，未激活且未进入生产/u
  );

  const publishingScale = runQuery("show", "M2-CHAN-PSC01");
  assert.equal(publishingScale.status, 0, publishingScale.stderr);
  assert.match(publishingScale.stdout, /模型修订（model_revision）/u);
  assert.match(
    publishingScale.stdout,
    /未来分成收入开发可建模现金/u
  );

  const show = runQuery("show", "M2-WORK-OA03");
  assert.equal(show.status, 0, show.stderr);
  assert.match(show.stdout, /公式：/u);
  assert.match(show.stdout, /证据路径：/u);
  assert.match(show.stdout, /current-human-authority-served-758w-7083c/u);

  const aliases = runQuery("aliases", "exact-v0.3");
  assert.equal(aliases.status, 0, aliases.stderr);
  assert.match(aliases.stdout, /M2-WORK-OA03/u);
  assert.match(aliases.stdout, /exact v0\.3/u);

  const experiment = runQuery(
    "experiment",
    "M2-EXP-CHANNEL-GENERATIVE-02"
  );
  assert.equal(experiment.status, 0, experiment.stderr);
  assert.match(experiment.stdout, /M2-EXP-CHANNEL-GENERATIVE-02\/G1/u);
  assert.match(
    experiment.stdout,
    /EXECUTION_STARTED_BLOCKED_INNER_ELIGIBILITY_NO_CANDIDATE_OUTCOME/u
  );

  const g1 = runQuery("explain", "G1");
  assert.equal(g1.status, 0, g1.stderr);
  assert.match(g1.stdout, /M2-EXP-CHANNEL-GENERATIVE-02\/G1/u);
  assert.match(g1.stdout, /独立渠道发生-条件金额生成器/u);

  const k1 = runQuery("explain", "K1");
  assert.equal(k1.status, 0, k1.stderr);
  assert.match(k1.stdout, /M2-EXP-CHANNEL-GENERATIVE-02/u);
  assert.match(k1.stdout, /M2-MODEL-REGISTRY-V1/u);

  const scoped = runQuery(
    "compare",
    "M2-WORK-OA03",
    "M2-WORK-LG01"
  );
  assert.equal(scoped.status, 0, scoped.stderr);
  assert.match(scoped.stdout, /只能在下列明确相同可比组内比较/u);
  assert.match(scoped.stdout, /CG-WORK-SS-OVERLAP-5203-H36/u);

  const refused = runQuery(
    "compare",
    "M2-WORK-OA03",
    "M2-PORT-ETS01"
  );
  assert.equal(refused.status, 0, refused.stderr);
  assert.match(refused.stdout, /不能直接排名/u);
  assert.match(refused.stdout, /grain 不同/u);
});

test("current user-facing query is Chinese-first and never leaves G1 bare", () => {
  const result = runQuery("explain", "G1");
  assert.equal(result.status, 0, result.stderr);
  const linesWithG1 = result.stdout
    .split(/\r?\n/u)
    .filter((line) => /\bG1\b/u.test(line));
  assert.ok(linesWithG1.length > 0);
  assert.equal(
    linesWithG1.every((line) => (
      /渠道时间生成/u.test(line)
      && /M2-EXP-CHANNEL-GENERATIVE-02/u.test(line)
    )),
    true
  );
});

function runQuery(...args) {
  return spawnSync(
    process.execPath,
    [
      path.join(
        root,
        "scripts",
        "m2-current",
        "query_m2_model_registry.mjs"
      ),
      ...args
    ],
    {
      cwd: root,
      encoding: "utf8"
    }
  );
}
