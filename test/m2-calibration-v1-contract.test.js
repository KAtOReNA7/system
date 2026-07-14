import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const SPEC_PATH = "src/domain/oldProductEvaluation/calibrationSpec.v1.json";
const KERNEL_PATH = "scripts/m2-real-data/m2_calibration_v1.py";
const PYTHON_RUNNER_PATH = "scripts/run-codex-python.mjs";

function readSpec() {
  return JSON.parse(readFileSync(SPEC_PATH, "utf8"));
}

function sorted(values) {
  return [...values].sort();
}

function runPython(args, options = {}) {
  return execFileSync(process.execPath, [PYTHON_RUNNER_PATH, ...args], options);
}

function monthOrdinal(month) {
  const [year, number] = month.split("-").map(Number);
  return year * 12 + number - 1;
}

function addMonths(month, offset) {
  const ordinal = monthOrdinal(month) + offset;
  return `${Math.floor(ordinal / 12).toString().padStart(4, "0")}-${String(
    (ordinal % 12) + 1
  ).padStart(2, "0")}`;
}

test("calibration-spec-v1 freezes the comparison protocol before final holdout", () => {
  const spec = readSpec();

  assert.equal(spec.schema, "m2.calibration_spec.v1");
  assert.equal(spec.version, "calibration-spec-v1");
  assert.equal(spec.preHoldoutRevision, 5);
  assert.equal(spec.supersedesPreHoldoutCommit, "80b6c40c7eaa90106ad64a2bdaebff0c7b8cd82d");
  assert.equal(
    spec.preHoldoutCorrectionReason,
    "define_strict_warmup_interval_residual_cold_start_and_as_of_rights_serving_contract_before_any_private_fit_replay_or_holdout_result_was_opened"
  );
  assert.equal(spec.decisionStatus, "not_for_formal_decision");
  assert.equal(spec.freeze.frozenBeforeFinalHoldout, true);
  assert.equal(spec.freeze.finalHoldout.originCount, 2);
  assert.equal(spec.freeze.finalHoldout.role, "final_evaluation_only");
  for (const selection of [
    "baseline_selection",
    "confidence_selection",
    "forecastability_selection",
    "gate_selection",
    "interval_selection",
    "model_selection",
    "parameter_selection",
    "route_selection",
    "strata_selection",
    "threshold_selection"
  ]) {
    assert.ok(
      spec.freeze.finalHoldout.excludedFrom.includes(selection),
      `final holdout must be excluded from ${selection}`
    );
  }

  for (const pointer of [
    "/freeze",
    "/publicOutput",
    "/origins",
    "/caseKeys",
    "/strata",
    "/models",
    "/internalInterval",
    "/metrics",
    "/bootstrap",
    "/gates"
  ]) {
    assert.ok(
      spec.freeze.immutableJsonPointers.includes(pointer),
      `${pointer} must be frozen before the final holdout is opened`
    );
  }
  assert.equal(Number.isInteger(spec.randomSeed), true);
  assert.equal(
    spec.freeze.fittedParametersArtifact.path,
    "src/domain/oldProductEvaluation/calibrationFittedParameters.v1.json"
  );
  assert.equal(
    spec.freeze.fittedParametersArtifact.schema,
    "m2.calibration_spec.v1.fitted_parameters"
  );
  assert.equal(spec.freeze.fittedParametersArtifact.requiredBeforeAnyFairB0bReplay, true);
  assert.equal(spec.freeze.fittedParametersArtifact.mustBeCommittedBeforeFinalHoldout, true);
  assert.equal(spec.freeze.fittedParametersArtifact.mayContainPrivateIdentifiers, false);
  assert.equal(spec.freeze.fittedParametersArtifact.mayUseEmbargoShadowOrHoldoutLabels, false);
  assert.deepEqual(spec.freeze.fittedParametersArtifact.requiredTopLevelFields, [
    "schema",
    "version",
    "decisionStatus",
    "specVersion",
    "specRevision",
    "specDigest",
    "parameterProvenance",
    "fit",
    "B0b"
  ]);
  assert.deepEqual(spec.freeze.fittedParametersArtifact.requiredFitFields, [
    "baselineId",
    "fitStatus",
    "caseRole",
    "maximumTargetEnd",
    "excludedRoles",
    "algorithm",
    "randomSeed",
    "factorGridDigest",
    "caseKeyFields",
    "caseFingerprintSerialization",
    "fitCaseFingerprint",
    "fitCaseCount",
    "fitCaseCountByHorizon",
    "fitOriginCount",
    "fitOriginCountByHorizon",
    "comparatorCaseFingerprint",
    "comparatorCaseCount",
    "comparatorCaseCountByHorizon",
    "comparatorOriginCount",
    "comparatorOriginCountByHorizon",
    "oofPredictionFingerprint",
    "intervalWarmupCaseFingerprint",
    "intervalWarmupPredictionFingerprint",
    "intervalWarmupCaseCount",
    "intervalWarmupCaseCountByHorizon",
    "intervalWarmupOriginCount",
    "intervalWarmupOriginCountByHorizon",
    "intervalWarmupPredictionLockedBeforeTruthJoin",
    "intervalWarmupUsesOutcomeLabelsForPrediction",
    "authoritativeInputSignatureSha256",
    "specCommit",
    "fitCodeCommit",
    "passes",
    "usesEmbargoShadowLabels",
    "usesFinalHoldoutLabels",
    "usesLongHorizonAuditLabels",
    "legacyFactorsReused",
    "developmentWape",
    "developmentSignedAggregateBias",
    "forwardValidationMethod",
    "foldUnit",
    "warmupOrigins",
    "scoreOrigins",
    "foldTrainingCaseCountsByScoreOrigin",
    "foldTrainingMaximumTargetEndByScoreOrigin",
    "trainingTargetEndRule",
    "usesOnlyStrictlyAvailableLabels",
    "oofComparatorScoreUsed",
    "minimumTrainingCasesPerLifecycleFactor",
    "minimumTrainingOriginsPerLifecycleFactor",
    "minimumActualRevenueSharePerLifecycleFactor",
    "unsupportedFactorValue",
    "finalFactorsFitScope"
  ]);
  assert.deepEqual(
    spec.freeze.fittedParametersArtifact.requiredFitFields.filter((field) =>
      field.startsWith("intervalWarmup")
    ),
    [
      "intervalWarmupCaseFingerprint",
      "intervalWarmupPredictionFingerprint",
      "intervalWarmupCaseCount",
      "intervalWarmupCaseCountByHorizon",
      "intervalWarmupOriginCount",
      "intervalWarmupOriginCountByHorizon",
      "intervalWarmupPredictionLockedBeforeTruthJoin",
      "intervalWarmupUsesOutcomeLabelsForPrediction"
    ]
  );
  assert.deepEqual(spec.freeze.fittedParametersArtifact.requiredB0bFields, [
    "lifecycleThresholds",
    "lifecycleFactors",
    "oofComparatorMetrics",
    "finalFitDiagnosticMetrics",
    "lifecycleSupport"
  ]);
  assert.deepEqual(spec.freeze.fittedParametersArtifact.requiredLifecycleSupportKeys, [
    "growth",
    "stable",
    "rebound",
    "declining",
    "long_tail",
    "inactive",
    "insufficient_history"
  ]);
  assert.deepEqual(spec.freeze.fittedParametersArtifact.requiredLifecycleSupportFields, [
    "componentCaseCount",
    "distinctOriginCount",
    "absoluteActualRevenueShare",
    "supported"
  ]);
  assert.deepEqual(spec.freeze.fittedParametersArtifact.forbiddenFitFields, [
    "passesByHorizon",
    "caseFingerprint",
    "caseCount",
    "caseCountByHorizon",
    "originCount",
    "originCountByHorizon",
    "oofProtocol",
    "oofFoldCount",
    "oofFoldOrigins",
    "oofCaseFingerprint"
  ]);
  assert.deepEqual(spec.freeze.fittedParametersArtifact.forbiddenB0bFields, [
    "lifecycleFactorsByHorizon",
    "oofComparatorMetricsByHorizon",
    "finalFitDiagnosticMetricsByHorizon",
    "lifecycleSupportByHorizon"
  ]);

  const baselines = Object.fromEntries(
    spec.models.baselines.map((baseline) => [baseline.id, baseline])
  );
  assert.equal(baselines.B0a.role, "audit_only");
  assert.equal(baselines.B0a.fairComparisonEligible, false);
  assert.equal(baselines.B0b.role, "leakage_free_comparator");
  assert.equal(baselines.B0b.fairComparisonEligible, true);
  assert.equal(
    baselines.B0b.fairComparisonEligibilityCondition,
    "committed_fitted_parameters_artifact_matches_spec_fit_case_forward_comparator_and_interval_warmup_case_prediction_fingerprints_and_intervalWarmupPredictionLockedBeforeTruthJoin_is_true_and_intervalWarmupUsesOutcomeLabelsForPrediction_is_false"
  );
  assert.equal(
    baselines.B0b.parameterProvenance,
    "semantic_thresholds_plus_cross_horizon_purged_development_only_deterministic_factor_fit_v1"
  );
  assert.equal(Object.hasOwn(baselines.B0b, "lifecycleFactors"), false);
  assert.deepEqual(baselines.B0b.lifecycleThresholds, {
    insufficientHistoryCompleteMonths: 6,
    inactiveRecent6RevenueMax: 0,
    longTailLast12RevenueMax: 10,
    growthRecent6Prior6Ratio: 1.5,
    decliningRecent6Prior6Ratio: 0.5,
    reboundRecent3Previous3Ratio: 1.5
  });
  assert.equal(baselines.B0b.legacyOutcomeExposedFactorsAuditOnly.fairReplayUseAllowed, false);
  assert.equal(baselines.B0b.developmentFit.caseRole, "development_only");
  assert.equal(baselines.B0b.developmentFit.maximumTargetEnd, "2023-06");
  assert.equal(baselines.B0b.developmentFit.fitAcrossCoreHorizons, true);
  assert.equal(baselines.B0b.developmentFit.fitSeparateByHorizon, false);
  assert.equal(
    baselines.B0b.developmentFit.oofComparatorProtocol.foldUnitReference,
    "origins.forwardValidation.foldUnit"
  );
  assert.equal(
    baselines.B0b.developmentFit.oofComparatorProtocol.minimumTrainingOriginsPerLifecycleFactor,
    3
  );
  assert.deepEqual(baselines.B0b.developmentFit.excludedRoles, [
    "embargo_shadow",
    "final_holdout",
    "long_horizon_audit"
  ]);
  assert.equal(
    baselines.B0b.developmentFit.fitCaseFingerprint,
    "sha256_of_sorted_full_purged_development_numeric_case_records_without_emitting_identifiers"
  );
  assert.equal(
    baselines.B0b.developmentFit.comparatorCaseFingerprint,
    "sha256_of_sorted_forward_score_numeric_case_records_without_emitting_identifiers"
  );
  assert.ok(baselines.B1);
  assert.ok(baselines.B2);
  assert.ok(baselines.B3);
  assert.deepEqual(spec.models.candidateTrainingOrder, ["C1", "C2-R", "C2", "C3"]);
  assert.equal(
    spec.models.selectionPolicy,
    "after_all_four_candidates_complete_choose_the_lowest_complexityRank_candidate_passing_all_development_forward_gates_then_commit_selectedCandidateId_before_final_holdout"
  );
  assert.equal(
    spec.models.finalHoldoutSelectionPolicy,
    "confirmation_only_for_precommitted_selectedCandidateId_with_no_candidate_substitution"
  );
});

test("calibration-spec-v1 fixes horizons, routing, metrics, and anti-gaming gates", () => {
  const spec = readSpec();

  assert.deepEqual(spec.backtest.coreHorizonsMonths, [3, 6, 12, 18, 24]);
  assert.deepEqual(spec.backtest.longHorizonAuditMonths, [36, 60]);
  assert.equal(spec.backtest.extrapolatedAfterMonths, 24);

  assert.equal(spec.revenueRouting.pure_sales_share.strategy, "per_channel_then_sum");
  assert.equal(spec.revenueRouting.pure_buyout.strategy, "historical_cycle_monthly_equivalent");
  assert.equal(spec.revenueRouting.buyout_plus_sales.strategy, "future_sales_only");
  assert.equal(spec.revenueRouting.buyout_plus_sales.predictFutureBuyout, false);

  assert.equal(
    spec.metrics.signedAggregateBias.formula,
    "(sum(pred)-sum(actual))/sum(actual)"
  );
  assert.deepEqual(spec.metrics.signedAggregateBias.absoluteLimits, {
    overall: 0.1,
    forecastable: 0.1,
    high_value: 0.1,
    per_horizon: 0.15
  });

  assert.equal(spec.forecastability.eligibilityFrozenBeforeResults, true);
  assert.equal(spec.forecastability.legacyReferencesAreTargets, false);
  assert.equal(spec.forecastability.top10ForecastableRevenueCoverageMinimum, 0.9);
  assert.deepEqual(spec.caseKeys.aggregateFields, [
    "standard_work_id",
    "origin",
    "horizon_months",
    "route"
  ]);
  assert.equal(spec.caseKeys.channelComponentOptionalField, "channel_key");
  assert.equal(spec.caseKeys.parityRequiredAcrossComparatorsAndCandidates, true);
  assert.deepEqual(spec.bootstrap.clusterKeys, ["standard_work_id", "origin"]);
  assert.equal(spec.bootstrap.caseIidSamplingAllowed, false);

  for (const stratum of ["source", "revenue_model", "shelf_rights", "high_value"]) {
    assert.ok(spec.strata.required.includes(stratum), `missing required stratum: ${stratum}`);
  }
});

test("revision 5 freezes strict target-available forward folds and case membership", () => {
  const spec = readSpec();
  const forward = spec.origins.forwardValidation;

  assert.equal(forward.method, "expanding_origin_target_available");
  assert.equal(forward.foldUnit, "score_origin_date_across_all_available_core_horizons");
  assert.equal(
    forward.trainCasePredicate,
    "role==development_and_origin<score_origin_and_target_end<=score_origin"
  );
  assert.equal(forward.testCasePredicate, "role==development_and_origin==score_origin");
  assert.deepEqual(forward.warmupOrigins, ["2019-06", "2019-12", "2020-06"]);
  assert.deepEqual(forward.scoreOrigins, [
    "2020-12",
    "2021-06",
    "2021-12",
    "2022-06",
    "2022-12"
  ]);
  assert.equal(forward.minimumPriorDistinctOriginDates, 3);
  assert.equal(forward.sameScoreOriginAllAvailableHorizonsHeldTogether, true);
  assert.equal(forward.warmupMaySelectOrScoreComparator, false);
  assert.equal(forward.futurePerturbationRefitsFold, true);
  assert.deepEqual(
    forward.folds.map((fold) => fold.expectedTrainOriginHorizonBlockCount),
    [9, 14, 19, 24, 29]
  );

  for (const fold of forward.folds) {
    const derivedTestHorizons = spec.backtest.coreHorizonsMonths.filter((horizon) =>
      spec.origins.coreByHorizon[String(horizon)].development.includes(fold.scoreOrigin)
    );
    assert.deepEqual(fold.testHorizons, derivedTestHorizons);

    const derivedTrainBlockCount = spec.backtest.coreHorizonsMonths.reduce(
      (total, horizon) =>
        total +
        spec.origins.coreByHorizon[String(horizon)].development.filter(
          (origin) =>
            origin < fold.scoreOrigin && addMonths(origin, horizon) <= fold.scoreOrigin
        ).length,
      0
    );
    assert.equal(derivedTrainBlockCount, fold.expectedTrainOriginHorizonBlockCount);
  }

  assert.equal(
    spec.caseKeys.originEligibleWorkRule,
    "minimum_bill_month_with_an_observed_source_row_for_the_standard_work_id<=origin"
  );
  assert.equal(
    spec.caseKeys.futureCatalogEntrantBehavior,
    "absent_from_that_origin_case_universe_not_blocked_and_not_zero_scored"
  );
  assert.equal(spec.caseKeys.ineligibleCasesRetainedForCoverageDenominators, true);
  assert.equal(spec.caseKeys.intersectionOrCompleteCaseDropAllowed, false);
  assert.equal(spec.caseKeys.parityFailureBehavior, "integrity_failure_and_no_model_comparison");
  assert.equal(monthOrdinal("2021-01") <= monthOrdinal("2020-12"), false);
  assert.equal(monthOrdinal("2020-12") <= monthOrdinal("2020-12"), true);
});

test("revision 5 freezes nine warmup interval blocks and model cold starts", () => {
  const spec = readSpec();
  const forward = spec.origins.forwardValidation;
  const warmup = forward.warmupIntervalCalibration;

  assert.equal(warmup.role, "development_warmup_interval_calibration");
  assert.equal(warmup.originReference, "origins.forwardValidation.warmupOrigins");
  assert.equal(warmup.predictionMustBeMaterializedBeforeTruthJoin, true);
  assert.equal(warmup.mayCalibrateFrozenIntervalAndThereforeEnterIntervalGate, true);
  assert.equal(warmup.mayFitPointModelOrChooseHyperparameter, false);
  assert.equal(warmup.maySelectOrScoreComparator, false);
  assert.equal(warmup.mayEnterPointMetricGate, false);
  assert.equal(warmup.mayEnterBootstrap, false);
  assert.equal(warmup.mayTuneIntervalMethodCoverageGroupThresholdOrGate, false);
  assert.equal(warmup.earliestRequiredScoreOrigin, "2020-12");
  assert.deepEqual(warmup.expectedAvailableOriginHorizonBlocksAtEarliestRequiredScoreOrigin, {
    "2019-06": [3, 6, 12, 18],
    "2019-12": [3, 6, 12],
    "2020-06": [3, 6]
  });
  assert.equal(warmup.expectedAvailableOriginHorizonBlockCountAtEarliestRequiredScoreOrigin, 9);
  assert.equal(
    Object.values(warmup.expectedAvailableOriginHorizonBlocksAtEarliestRequiredScoreOrigin).flat()
      .length,
    9
  );
  for (const origin of forward.warmupOrigins) {
    const derived = spec.backtest.coreHorizonsMonths.filter(
      (horizon) =>
        spec.origins.coreByHorizon[String(horizon)].development.includes(origin) &&
        addMonths(origin, horizon) <= warmup.earliestRequiredScoreOrigin
    );
    assert.deepEqual(
      warmup.expectedAvailableOriginHorizonBlocksAtEarliestRequiredScoreOrigin[origin],
      derived
    );
  }
  assert.equal(warmup.predictionFingerprintRequiredBeforeTruthJoin, true);
  assert.equal(
    warmup.predictionFingerprintSerializationReference,
    "digestContract.intervalWarmupPredictionFingerprint"
  );
  assert.equal(warmup.caseFingerprintRequiredAfterTruthJoin, true);
  assert.equal(
    warmup.caseFingerprintSerializationReference,
    "digestContract.intervalWarmupCaseFingerprint"
  );
  assert.equal(
    spec.digestContract.intervalWarmupCaseFingerprint.includes("|label_available_as_of|"),
    true
  );
  assert.deepEqual(warmup.artifactCountContract, {
    intervalWarmupCaseCountPopulation:
      "digestContract.intervalWarmupCaseFingerprint_population",
    intervalWarmupCaseCountByHorizonKeys: ["3", "6", "12", "18", "24"],
    intervalWarmupOriginCountPopulation:
      "distinct_origin_in_digestContract.intervalWarmupCaseFingerprint_population",
    intervalWarmupOriginCountByHorizonKeys: ["3", "6", "12", "18", "24"],
    allCountsMustBeNonnegativeIntegers: true,
    intervalWarmupCaseCountMustEqualSumByHorizon: true,
    intervalWarmupOriginCountMustEqualCardinalityOfUnionAcrossHorizons: true,
    intervalWarmupOriginCountsByHorizonAreNonAdditive: true
  });

  assert.deepEqual(Object.keys(warmup.coldStartByModel), [
    "B0b",
    "B1",
    "B2",
    "B3",
    "C1",
    "C2-R",
    "C2",
    "C3"
  ]);
  assert.deepEqual(warmup.coldStartByModel.B0b, {
    mode: "pre_registered_no_fit",
    lifecycleFactorsReference: "models.baselines[id=B0b].developmentFit.initialFactors",
    mayReadAnyOutcomeLabel: false
  });
  for (const modelId of ["B1", "B2", "B3"]) {
    assert.equal(warmup.coldStartByModel[modelId].mode, "frozen_formula_no_label_fit");
  }
  for (const modelId of ["C1", "C2-R", "C2"]) {
    assert.deepEqual(warmup.coldStartByModel[modelId], {
      mode: "insufficient_fit_fallback",
      fallbackReference: "models.candidateFitProtocol.insufficientFitRowsFallback"
    });
  }
  assert.deepEqual(warmup.coldStartByModel.C3, {
    mode: "prior_member_oof_unavailable_default",
    weightsReference:
      "models.candidates[id=C3].defaultHyperparametersWhenPriorMemberOofUnavailable"
  });
  assert.equal(
    warmup.pureBuyoutBehavior,
    "always_use_revenueRouting.pure_buyout_without_point_model_fit"
  );
  assert.equal(
    warmup.unknownRouteBehavior,
    "blocked_and_excluded_from_prediction_interval_population"
  );
});

test("revision 5 freezes metric populations and one locked comparator per gate", () => {
  const spec = readSpec();
  const populations = spec.metrics.populations;
  const gates = spec.gates;

  assert.equal(populations.caseUniverse.definition, "caseKeys.caseUniverse");
  assert.equal(populations.caseUniverse.blockedCasesRetained, true);
  assert.equal(populations.caseUniverse.caseDropAllowed, false);
  for (const population of [
    populations.coverageAwareOverall,
    populations.highValueAll,
    populations.perHorizonAll
  ]) {
    assert.equal(population.nullPredictionEvaluationValue, 0);
    assert.equal(population.evaluationOnly, true);
  }
  assert.equal(populations.coverageAwareOverall.zeroMayBeExposedExternally, false);
  assert.equal(populations.forecastableNumeric.numericPredictionRequired, true);
  assert.equal(populations.forecastableNumeric.nullPrediction, "integrity_failure");
  assert.equal(populations.modelDeltaAndBootstrap.keyIntersectionDropAllowed, false);
  assert.equal(populations.modelDeltaAndBootstrap.missingNumericPrediction, "integrity_failure");
  assert.equal(populations.predictionInterval.completeCaseFilteringAllowed, false);
  assert.equal(populations.predictionInterval.missingInterval, "gate_failure");
  assert.equal(spec.publicOutput.blockedCaseOutput.pointForecast, null);
  assert.equal(spec.publicOutput.blockedCaseOutput.evaluationOnlyZeroMayBeExposed, false);

  assert.equal(
    gates.lockedComparatorSelection.populationReference,
    "metrics.populations.modelDeltaAndBootstrap"
  );
  assert.equal(
    gates.lockedComparatorRescoring,
    "after_baseline_id_is_locked_on_the_forecastable_forward_population_rescore_that_same_baseline_on_the_exact_population_of_each_gate; never_reselect_the_baseline_per_gate"
  );
  assert.equal(gates.overallPointAccuracy.population, "metrics.populations.coverageAwareOverall");
  assert.equal(gates.horizonNonRegression.population, "metrics.populations.perHorizonAll");
  assert.equal(
    gates.horizonNonRegression.comparatorMetric,
    "locked_comparator_rescored_on_the_same_exact_horizon_population"
  );
  assert.equal(
    gates.highValue.comparatorMetric,
    "locked_comparator_rescored_separately_on_the_exact_same_top1_top5_or_top10_population"
  );
  assert.equal(
    gates.importantStrata.comparatorMetric,
    "locked_comparator_rescored_on_the_same_exact_marginal_cell_population"
  );

  assert.deepEqual(gates.importantStrata.reportOnlyPostHocAxes, ["source", "shelf_rights"]);
  assert.deepEqual(gates.importantStrata.gateAxes, ["revenue_model", "high_value"]);
  assert.equal(gates.importantStrata.postHocAxesMayFailAcceptance, false);
  assert.equal(gates.importantStrata.postHocAxesMaySelectModelParameterThresholdOrFeature, false);
  for (const axis of spec.strata.postHocOnly) {
    assert.equal(gates.importantStrata.gateAxes.includes(axis), false);
  }
});

test("revision 5 freezes forward intervals, WIS, two-way bootstrap, and rights serving", () => {
  const spec = readSpec();
  const interval = spec.internalInterval;
  const intervalMetrics = spec.metrics.internalInterval;

  assert.equal(interval.method, "rolling_absolute_residual_conformal");
  assert.equal(
    interval.residualPredictionSource,
    "strict_forward_out_of_fold_prediction_made_at_each_residual_case_origin_without_that_case_label_or_any_later_label"
  );
  assert.equal(interval.inSampleResidualAllowed, false);
  assert.equal(
    interval.quantileFiniteSampleRule,
    "sort_residuals_ascending_then_k=min(n,ceil((n+1)*0.8))_and_q=sorted_residuals[k-1]_with_no_interpolation"
  );
  assert.equal(
    interval.calibrationAvailability,
    "residual_case_origin<score_origin_and_residual_case_target_end<=score_origin"
  );
  assert.deepEqual(interval.residualCaseProtocol.allowedOriginRoles, [
    "development_warmup_interval_calibration",
    "development_forward_score"
  ]);
  assert.equal(
    interval.residualCaseProtocol.warmupProtocolReference,
    "origins.forwardValidation.warmupIntervalCalibration"
  );
  assert.equal(
    interval.residualCaseProtocol.predicateAtScoreOrigin,
    "residual_case_origin<score_origin_and_residual_case_target_end<=score_origin_and_label_available_as_of<=score_origin_and_eligibility_status==forecastable_numeric_and_pointForecast_is_numeric"
  );
  assert.equal(interval.residualCaseProtocol.predictionMustBeMaterializedBeforeTruthJoin, true);
  assert.equal(interval.residualCaseProtocol.warmupUse, "interval_calibration_only");
  assert.equal(interval.residualCaseProtocol.warmupMayEnterComparatorPointMetricOrBootstrap, false);
  assert.equal(interval.residualCaseProtocol.futurePerturbationMustRefitResidualPredictionFold, true);
  assert.deepEqual(interval.requiredPopulation, {
    reference: "metrics.populations.modelDeltaAndBootstrap",
    firstRequiredScoreOrigin: "2020-12",
    burnInScoreOrigins: [],
    burnInExclusionAllowed: false,
    completeCaseFilteringAllowed: false,
    missingInterval: "gate_failure"
  });
  assert.deepEqual(interval.residualValueContract, {
    finite: true,
    nonnegative: true,
    invalidOrMissingResidual: "integrity_failure_no_silent_drop"
  });
  assert.equal(interval.holdoutMayCalibrateInterval, false);
  assert.equal(interval.missingIntervalOnRequiredPopulation, "gate_failure");
  assert.equal(interval.externalOutputAllowed, false);
  assert.equal(intervalMetrics.wisAlpha, 0.2);
  assert.equal(
    intervalMetrics.intervalScoreFormula,
    "IS_alpha=(upper-lower)+(2/alpha)*(lower-actual)*I(actual<lower)+(2/alpha)*(actual-upper)*I(actual>upper)"
  );
  assert.equal(
    intervalMetrics.wisFormula,
    "WIS=(0.5*abs(actual-point)+0.1*IS_0.2)/1.5"
  );
  assert.equal(
    intervalMetrics.standardizedWidthFormula,
    "sum(upper-lower)/sum(abs(actual))"
  );
  const alpha = 0.2;
  const actual = 15;
  const point = 10;
  const lower = 8;
  const upper = 12;
  const intervalScore =
    upper -
    lower +
    (2 / alpha) * (lower - actual) * Number(actual < lower) +
    (2 / alpha) * (actual - upper) * Number(actual > upper);
  const wis = (0.5 * Math.abs(actual - point) + 0.1 * intervalScore) / 1.5;
  assert.equal(intervalScore, 34);
  assert.ok(Math.abs(wis - 3.933333333333333) < 1e-12);

  assert.equal(spec.bootstrap.method, "paired_two_way_pigeonhole_cluster_bootstrap");
  assert.deepEqual(spec.bootstrap.clusterKeys, ["standard_work_id", "origin"]);
  assert.equal(spec.bootstrap.rng, "numpy.random.Generator(numpy.random.PCG64(seed))");
  assert.equal(
    spec.bootstrap.drawOrderWithinReplicate,
    "draw_work_cluster_indices_first_then_draw_origin_cluster_indices"
  );
  assert.equal(
    spec.bootstrap.sampling,
    "sample_standard_work_ids_with_replacement_and_origins_with_replacement_independently_then_weight_each_paired_case_by_product_of_multiplicities"
  );
  assert.equal(spec.bootstrap.pairedAcrossModels, true);
  assert.equal(spec.bootstrap.horizonsWithinWorkOriginRemainTogether, true);
  assert.equal(spec.bootstrap.caseIidSamplingAllowed, false);
  assert.equal(
    spec.bootstrap.comparisonStatistic,
    "candidate_wape_minus_locked_comparator_wape"
  );

  assert.deepEqual(spec.publicOutput.forecastHorizon.rightsTermTypePolicy, {
    exact_date: "H=max(0,month_ordinal(rights_end_month)-month_ordinal(origin))",
    perpetual: "H=60_with_perpetual_rights_60_month_planning_horizon",
    relative_term:
      "derive_end_month_only_when_start_month_and_numeric_term_are_both_as_of_known_otherwise_H=24_with_rights_horizon_not_exact",
    year_only:
      "H=min(24,max(0,month_ordinal(December_of_confirmed_end_year)-month_ordinal(origin)))_with_rights_horizon_not_exact",
    expired_unknown_date:
      "H=0_pointForecast=0_annualBreakdown_empty_with_rights_expired_unknown_date"
  });
  const rightsContract = spec.publicOutput.forecastHorizon.servingRightsSnapshotContract;
  assert.equal(rightsContract.resolver, "resolve_serving_horizon_as_of");
  assert.equal(rightsContract.servingPredictor, "predict_for_serving_as_of");
  assert.equal(rightsContract.resolverInput, "nonempty_sequence_of_rights_snapshot_objects");
  assert.deepEqual(rightsContract.requiredFields, ["rights_term_type", "available_as_of"]);
  assert.deepEqual(rightsContract.conditionalFields.relative_term, []);
  assert.deepEqual(rightsContract.relativeTermDerivationFields, [
    "rights_start_month",
    "relative_term_months"
  ]);
  assert.equal(rightsContract.relativeTermDerivationFieldsMustBePresentTogether, true);
  assert.equal(
    rightsContract.relativeTermMissingDerivationFieldsBehavior,
    "horizon_24_with_rights_horizon_not_exact"
  );
  assert.equal(
    rightsContract.relativeTermOnlyOneDerivationFieldBehavior,
    "integrity_failure_no_serving_prediction"
  );
  assert.equal(rightsContract.relativeTermUnit, "integer_calendar_months");
  assert.equal(
    rightsContract.relativeEndMonthFormula,
    "add_months(rights_start_month,relative_term_months)"
  );
  assert.equal(rightsContract.availableAsOfPredicate, "available_as_of<=origin");
  assert.deepEqual(rightsContract.selectionAlgorithm, [
    "validate_every_input_snapshot_and_fail_if_available_as_of_is_missing_or_not_YYYY-MM",
    "filter_available_as_of<=origin",
    "fail_if_no_eligible_snapshot",
    "select_the_maximum_available_as_of",
    "canonical_JSON_deduplicate_payloads_at_that_maximum_available_as_of",
    "fail_if_more_than_one_distinct_payload_remains",
    "use_the_single_remaining_payload"
  ]);
  assert.equal(rightsContract.validateAllSnapshotFieldsBeforeSelection, true);
  assert.equal(
    rightsContract.conflictingLatestPayloadBehavior,
    "integrity_failure_no_serving_prediction"
  );
  assert.equal(rightsContract.noEligibleSnapshotBehavior, "integrity_failure_no_serving_prediction");
  assert.equal(rightsContract.callerSuppliedServingHorizonAllowed, false);
  assert.equal(rightsContract.historicalBacktestUsesExplicitFrozenHorizon, true);
  assert.equal(rightsContract.historicalBacktestMayUseCurrentRightsSnapshot, false);
  assert.equal(
    rightsContract.historicalBacktestRightsUse,
    "post_hoc_slice_only_when_no_as_of_snapshot_exists"
  );
  assert.equal(rightsContract.output, "exactly_publicOutput.allowedFields");
});

test("revision 5 locks selectedCandidateId before final and forbids substitution", () => {
  const spec = readSpec();
  const contract = spec.freeze.candidateFittedParametersArtifact;
  const finalHoldout = spec.freeze.finalHoldout;

  assert.equal(
    contract.path,
    "src/domain/oldProductEvaluation/calibrationCandidateParameters.v1.json"
  );
  assert.equal(contract.schema, "m2.calibration_spec.v1.candidate_parameters");
  assert.deepEqual(contract.requiredCandidateIds, ["C1", "C2-R", "C2", "C3"]);
  assert.equal(contract.requiredBeforeFinalHoldout, true);
  assert.equal(contract.generatedOnlyAfterExplicitUserAuthorization, true);
  for (const field of [
    "completedCandidateIds",
    "selectedCandidateId",
    "selectionCaseFingerprint",
    "selectionGateResults",
    "selectionLockedBeforeFinalHoldout"
  ]) {
    assert.ok(contract.requiredTopLevelFields.includes(field));
  }
  assert.deepEqual(contract.requiredPerCandidateFields, [
    "id",
    "definitionDigest",
    "featureSchemaDigest",
    "selectionCaseFingerprint",
    "finalFitCaseFingerprint",
    "selectedHyperparametersByRouteHorizon",
    "fittedParametersByRouteHorizon",
    "fallbackRouteHorizons",
    "prequentialOofMetrics",
    "developmentForwardSelectionMetrics",
    "intervalWarmupPredictionFingerprint",
    "intervalWarmupCaseFingerprint",
    "intervalWarmupCaseCount",
    "intervalWarmupCaseCountByHorizon",
    "intervalWarmupOriginCount",
    "intervalWarmupOriginCountByHorizon",
    "intervalWarmupPredictionLockedBeforeTruthJoin",
    "intervalWarmupUsesOutcomeLabelsForPrediction",
    "usesEmbargoShadowLabels",
    "usesFinalHoldoutLabels",
    "usesLongHorizonAuditLabels",
    "status"
  ]);
  assert.deepEqual(
    contract.requiredPerCandidateFields.filter((field) => field.startsWith("intervalWarmup")),
    [
      "intervalWarmupPredictionFingerprint",
      "intervalWarmupCaseFingerprint",
      "intervalWarmupCaseCount",
      "intervalWarmupCaseCountByHorizon",
      "intervalWarmupOriginCount",
      "intervalWarmupOriginCountByHorizon",
      "intervalWarmupPredictionLockedBeforeTruthJoin",
      "intervalWarmupUsesOutcomeLabelsForPrediction"
    ]
  );
  assert.equal(
    contract.selectedCandidateRule,
    "selectedCandidateId_must_equal_the_requiredCandidateId_with_the_lowest_models.candidates.complexityRank_among_candidates_passing_all_development_forward_gates_after_all_required_candidates_complete"
  );
  assert.equal(
    contract.finalHoldoutReadyCondition,
    "completedCandidateIds_exactly_equal_requiredCandidateIds_in_order_and_selectedCandidateId_is_a_requiredCandidateId_and_satisfies_selectedCandidateRule_and_selectionLockedBeforeFinalHoldout_is_true_and_every_candidate_intervalWarmupPredictionLockedBeforeTruthJoin_is_true_and_every_candidate_intervalWarmupUsesOutcomeLabelsForPrediction_is_false_and_all_forbidden_label_flags_are_false_and_artifact_bytes_match_the_frozen_commit"
  );
  assert.equal(finalHoldout.baselineOnlyRunnerMayOpen, false);
  assert.ok(
    finalHoldout.openingPrerequisites.includes(
      "candidate_fitted_parameters_artifact_committed_complete_and_selectedCandidateId_locked"
    )
  );
  assert.equal(
    finalHoldout.evaluationScope,
    "exactly_the_precommitted_selectedCandidateId_and_lockedComparator_only"
  );
  assert.equal(finalHoldout.candidateFallbackAfterFailureAllowed, false);
  assert.equal(
    finalHoldout.failureMeaning,
    "selected_candidate_not_confirmed_and_no_other_candidate_may_be_substituted_without_a_new_spec_and_new_untouched_holdout"
  );
  assert.equal(spec.gates.selectionUsesFinalHoldout, false);
  assert.equal(spec.gates.roleMapping.finalConfirmation.maySelectCandidate, false);
});

test("calibration-spec-v1 exposes one public point forecast and keeps PI internal", () => {
  const spec = readSpec();

  assert.deepEqual(
    sorted(spec.publicOutput.allowedFields),
    sorted(["annualBreakdown", "confidence", "limitation", "pointForecast"])
  );
  for (const field of ["optimistic", "pessimistic", "high", "base", "low"]) {
    assert.ok(spec.publicOutput.forbiddenFields.includes(field));
  }
  assert.equal(spec.publicOutput.internalPredictionInterval.nominalCoverage, 0.8);
  assert.equal(spec.publicOutput.internalPredictionInterval.externalOutputAllowed, false);
});

test("calibration-spec-v1 makes spike damping and current-status leakage impossible by policy", () => {
  const spec = readSpec();

  assert.deepEqual(
    sorted(spec.spikePolicy.candidateTypes),
    sorted([
      "batch_proration",
      "buyout",
      "launch_burst",
      "settlement_lag",
      "true_anomaly"
    ])
  );
  assert.equal(spec.spikePolicy.unconfirmedMayBeDamped, false);
  assert.equal(
    spec.historicalStatusPolicy.currentShelfRightsFeatureUseWithoutAsOfSnapshot,
    "prohibited"
  );
  assert.equal(
    spec.historicalStatusPolicy.currentShelfRightsSliceUseWithoutAsOfSnapshot,
    "post_hoc_only"
  );
});

test("revision 5 Python primitives are exact, deterministic, and preserve case boundaries", () => {
  const output = runPython(["-"], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    input: String.raw`
import importlib.util
import json

import numpy as np

module_spec = importlib.util.spec_from_file_location(
    "m2_calibration_v1",
    "scripts/m2-real-data/m2_calibration_v1.py",
)
module = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(module)
spec = module.load_spec()

bootstrap_cases = [
    {"standard_work_id": "A", "origin": "2020-06", "horizon": 3},
    {"standard_work_id": "A", "origin": "2020-06", "horizon": 6},
    {"standard_work_id": "A", "origin": "2020-12", "horizon": 3},
    {"standard_work_id": "B", "origin": "2020-06", "horizon": 3},
    {"standard_work_id": "B", "origin": "2020-12", "horizon": 3},
]
weights = module.paired_two_way_bootstrap_weights(bootstrap_cases, 5, 20260714)

existing = module._synthetic_work()
future = {
    "standard_work_id": "SYNTH-FUTURE",
    "channels": [
        {
            "channel_key": "future-sales",
            "business_form": "audio_product",
            "first_observed_month": "2023-01",
            "monthly": {"2023-01": 100.0},
            "batch_cluster_sizes": {},
        }
    ],
}
origin = "2022-12"
case_universe_ids = [
    work["standard_work_id"]
    for work in (existing, future)
    if module.work_exists_as_of(work, origin)
]
future_predict_raised = False
try:
    module.predict_as_of(future, origin, 6, "B1", spec)
except ValueError as exc:
    future_predict_raised = str(exc) == "work is a future catalog entrant at this origin"

heuristic_work = module._synthetic_work()
heuristic_work["channels"][0]["batch_cluster_sizes"] = {"2021-01": 3}
heuristic_prediction = module.predict_as_of(heuristic_work, origin, 6, "B1", spec)
heuristic_candidate = next(
    item for item in heuristic_prediction["spike_candidates"] if item["month"] == "2021-01"
)

print(json.dumps({
    "quantileFour": module.finite_sample_conformal_quantile([9.0, 1.0, 7.0, 3.0], 0.8),
    "quantileNine": module.finite_sample_conformal_quantile(
        [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0], 0.8
    ),
    "conformalInterval": module.conformal_interval(2.0, [1.0, 3.0, 4.0, 9.0]),
    "intervalScore": module.interval_score_80(15.0, 8.0, 12.0),
    "wis": module.wis_80(15.0, 10.0, 8.0, 12.0),
    "standardizedWidth": module.standardized_interval_width(
        [0.0, 8.0], [6.0, 12.0], [5.0, -5.0]
    ),
    "zeroActualWidth": module.standardized_interval_width([0.0], [1.0], [0.0]),
    "bitGenerator": np.random.Generator(np.random.PCG64(20260714)).bit_generator.__class__.__name__,
    "weights": weights,
    "weightsRepeatEqual": weights == module.paired_two_way_bootstrap_weights(
        bootstrap_cases, 5, 20260714
    ),
    "sameWorkOriginHorizonsTogether": all(row[0] == row[1] for row in weights),
    "futureExistsAtOrigin": module.work_exists_as_of(future, origin),
    "futureAbsentFromCaseUniverse": "SYNTH-FUTURE" not in case_universe_ids,
    "existingPresentInCaseUniverse": "SYNTH-001" in case_universe_ids,
    "futurePredictRaised": future_predict_raised,
    "heuristicSpike": {
        "type": heuristic_candidate["type"],
        "heuristicType": heuristic_candidate["heuristicType"],
        "evidenceConfirmed": heuristic_candidate["evidenceConfirmed"],
        "appliedDamping": heuristic_candidate["appliedDamping"],
    },
}, sort_keys=True))
`
  });
  const result = JSON.parse(output);

  assert.equal(result.quantileFour, 9);
  assert.equal(result.quantileNine, 8);
  assert.deepEqual(result.conformalInterval, [0, 11]);
  assert.equal(result.intervalScore, 34);
  assert.ok(Math.abs(result.wis - 3.933333333333333) < 1e-12);
  assert.equal(result.standardizedWidth, 1);
  assert.equal(result.zeroActualWidth, null);
  assert.equal(result.bitGenerator, "PCG64");
  assert.deepEqual(result.weights, [
    [1, 1, 1, 1, 1],
    [2, 2, 0, 2, 0],
    [0, 0, 0, 0, 4],
    [0, 0, 0, 0, 4],
    [1, 1, 1, 1, 1]
  ]);
  assert.equal(result.weightsRepeatEqual, true);
  assert.equal(result.sameWorkOriginHorizonsTogether, true);
  assert.equal(result.futureExistsAtOrigin, false);
  assert.equal(result.futureAbsentFromCaseUniverse, true);
  assert.equal(result.existingPresentInCaseUniverse, true);
  assert.equal(result.futurePredictRaised, true);
  assert.deepEqual(result.heuristicSpike, {
    appliedDamping: false,
    evidenceConfirmed: false,
    heuristicType: "batch_proration",
    type: "batch_proration"
  });
});

test("revision 5 rejects invalid residuals and unequal metric vector lengths", () => {
  const output = runPython(["-"], {
    encoding: "utf8",
    input: String.raw`
import importlib.util
import json
import math

module_spec = importlib.util.spec_from_file_location(
    "m2_calibration_v1",
    "scripts/m2-real-data/m2_calibration_v1.py",
)
module = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(module)
spec = module.load_spec()
synthetic_work = module._synthetic_work()

def rejected(call):
    try:
        call()
    except ValueError:
        return True
    return False

print(json.dumps({
    "negativeResidualRejected": rejected(
        lambda: module.finite_sample_conformal_quantile([1.0, -1.0, 2.0], 0.8)
    ),
    "nanResidualRejected": rejected(
        lambda: module.finite_sample_conformal_quantile([1.0, math.nan], 0.8)
    ),
    "missingResidualRejected": rejected(
        lambda: module.finite_sample_conformal_quantile([1.0, None], 0.8)
    ),
    "conformalIntervalInvalidResidualRejected": rejected(
        lambda: module.conformal_interval(10.0, [1.0, -1.0])
    ),
    "signedBiasLengthMismatchRejected": rejected(
        lambda: module.signed_aggregate_bias([1.0, 2.0], [1.0])
    ),
    "wapeLengthMismatchRejected": rejected(
        lambda: module.wape([1.0, 2.0], [1.0])
    ),
    "standardizedWidthLengthMismatchRejected": rejected(
        lambda: module.standardized_interval_width([0.0, 1.0], [2.0], [1.0, 1.0])
    ),
    "invertedZeroDenominatorIntervalRejected": rejected(
        lambda: module.standardized_interval_width([5.0], [1.0], [0.0])
    ),
    "emptyBootstrapDrawRejected": rejected(
        lambda: module.paired_two_way_bootstrap_weights(
            [
                {"standard_work_id": "A", "origin": "2020-06"},
                {"standard_work_id": "B", "origin": "2020-12"},
            ],
            100,
            1,
        )
    ),
    "unregisteredModelRejectedBeforeRouting": rejected(
        lambda: module.predict_as_of(synthetic_work, "2022-12", 6, "B0a", spec)
    ),
    "b0bMissingParameterRoleRejected": rejected(
        lambda: module.predict_as_of(synthetic_work, "2022-12", 6, "B0b", spec)
    ),
}, sort_keys=True))
`
  });

  assert.deepEqual(JSON.parse(output), {
    b0bMissingParameterRoleRejected: true,
    conformalIntervalInvalidResidualRejected: true,
    emptyBootstrapDrawRejected: true,
    invertedZeroDenominatorIntervalRejected: true,
    missingResidualRejected: true,
    nanResidualRejected: true,
    negativeResidualRejected: true,
    signedBiasLengthMismatchRejected: true,
    standardizedWidthLengthMismatchRejected: true,
    unregisteredModelRejectedBeforeRouting: true,
    wapeLengthMismatchRejected: true
  });
});

test("revision 5 resolves rights snapshots and serves only the four public fields", () => {
  const output = runPython(["-"], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    input: String.raw`
import importlib.util
import json

module_spec = importlib.util.spec_from_file_location(
    "m2_calibration_v1",
    "scripts/m2-real-data/m2_calibration_v1.py",
)
module = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(module)
spec = module.load_spec()
origin = "2022-12"
work = module._synthetic_work()

snapshots = {
    "exact": {
        "rights_term_type": "exact_date",
        "available_as_of": origin,
        "rights_end_month": "2023-06",
    },
    "perpetual": {
        "rights_term_type": "perpetual",
        "available_as_of": origin,
    },
    "relativeKnown": {
        "rights_term_type": "relative_term",
        "available_as_of": origin,
        "rights_start_month": "2021-01",
        "relative_term_months": 36,
    },
    "relativeFallback": {
        "rights_term_type": "relative_term",
        "available_as_of": origin,
    },
    "yearOnly": {
        "rights_term_type": "year_only",
        "available_as_of": origin,
        "rights_end_year": 2024,
    },
    "expiredUnknown": {
        "rights_term_type": "expired_unknown_date",
        "available_as_of": origin,
    },
}
resolved = {
    key: module.resolve_serving_horizon_as_of([snapshot], origin, spec)
    for key, snapshot in snapshots.items()
}
served = {
    key: module.predict_for_serving_as_of(work, origin, "B1", [snapshot], spec)
    for key, snapshot in snapshots.items()
}
future_snapshot = {
    "rights_term_type": "perpetual",
    "available_as_of": "2023-01",
}
future_resolver_failed = False
future_serving_failed = False
try:
    module.resolve_serving_horizon_as_of([future_snapshot], origin, spec)
except ValueError:
    future_resolver_failed = True
try:
    module.predict_for_serving_as_of(work, origin, "B1", [future_snapshot], spec)
except ValueError:
    future_serving_failed = True

def rejected(candidate_snapshots):
    try:
        module.resolve_serving_horizon_as_of(candidate_snapshots, origin, spec)
    except ValueError:
        return True
    return False

rights_integrity = {
    "identicalLatestDuplicateAccepted": (
        module.resolve_serving_horizon_as_of(
            [snapshots["perpetual"], dict(snapshots["perpetual"])], origin, spec
        ) == resolved["perpetual"]
    ),
    "conflictingLatestRejected": rejected([
        snapshots["perpetual"],
        {
            "rights_term_type": "exact_date",
            "available_as_of": origin,
            "rights_end_month": "2023-06",
        },
    ]),
    "malformedFutureSnapshotRejectedBeforeFilter": rejected([
        snapshots["perpetual"],
        {"rights_term_type": "perpetual", "available_as_of": "2023-99"},
    ]),
    "relativeSingleFieldRejected": rejected([{
        "rights_term_type": "relative_term",
        "available_as_of": origin,
        "rights_start_month": "2021-01",
    }]),
    "relativeBooleanTermRejected": rejected([{
        "rights_term_type": "relative_term",
        "available_as_of": origin,
        "rights_start_month": "2021-01",
        "relative_term_months": True,
    }]),
    "exactMissingEndRejected": rejected([{
        "rights_term_type": "exact_date",
        "available_as_of": origin,
    }]),
    "yearMissingEndRejected": rejected([{
        "rights_term_type": "year_only",
        "available_as_of": origin,
    }]),
    "unsupportedTypeRejected": rejected([{
        "rights_term_type": "current_status_guess",
        "available_as_of": origin,
    }]),
}

print(json.dumps({
    "resolved": resolved,
    "served": served,
    "futureResolverFailed": future_resolver_failed,
    "futureServingFailed": future_serving_failed,
    "rightsIntegrity": rights_integrity,
}, sort_keys=True))
`
  });
  const result = JSON.parse(output);

  assert.deepEqual(result.resolved, {
    exact: { horizon_months: 6, limitations: [] },
    expiredUnknown: {
      horizon_months: 0,
      limitations: ["rights_expired_unknown_date"]
    },
    perpetual: {
      horizon_months: 60,
      limitations: ["perpetual_rights_60_month_planning_horizon"]
    },
    relativeFallback: {
      horizon_months: 24,
      limitations: ["rights_horizon_not_exact"]
    },
    relativeKnown: { horizon_months: 13, limitations: [] },
    yearOnly: {
      horizon_months: 24,
      limitations: ["rights_horizon_not_exact"]
    }
  });
  for (const publicOutput of Object.values(result.served)) {
    assert.deepEqual(sorted(Object.keys(publicOutput)), [
      "annualBreakdown",
      "confidence",
      "limitation",
      "pointForecast"
    ]);
  }
  assert.equal(result.served.exact.pointForecast > 0, true);
  assert.equal(
    result.served.perpetual.limitation.includes(
      "perpetual_rights_60_month_planning_horizon"
    ),
    true
  );
  assert.equal(
    result.served.relativeFallback.limitation.includes("rights_horizon_not_exact"),
    true
  );
  assert.equal(result.served.expiredUnknown.pointForecast, 0);
  assert.deepEqual(result.served.expiredUnknown.annualBreakdown, []);
  assert.equal(
    result.served.expiredUnknown.limitation.includes("rights_expired_unknown_date"),
    true
  );
  assert.equal(result.futureResolverFailed, true);
  assert.equal(result.futureServingFailed, true);
  assert.deepEqual(
    Object.entries(result.rightsIntegrity)
      .filter(([, passed]) => passed !== true)
      .map(([name]) => name),
    []
  );
});

test("fitted B0b parameters require strict development-only provenance", () => {
  const output = runPython(["-"], {
    encoding: "utf8",
    input: String.raw`
import copy
import importlib.util
import json

module_spec = importlib.util.spec_from_file_location(
    "m2_calibration_v1",
    "scripts/m2-real-data/m2_calibration_v1.py",
)
module = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(module)
spec = module.load_spec()
baseline = next(item for item in spec["models"]["baselines"] if item["id"] == "B0b")
fit_spec = baseline["developmentFit"]
core_horizons = [str(value) for value in spec["backtest"]["coreHorizonsMonths"]]
oof_spec = fit_spec["oofComparatorProtocol"]
forward = spec["origins"]["forwardValidation"]
fit_counts_by_horizon = {"3": 800, "6": 800, "12": 700, "18": 600, "24": 500}
fit_origins_by_horizon = {"3": 8, "6": 8, "12": 7, "18": 6, "24": 5}
comparator_counts_by_horizon = {"3": 500, "6": 500, "12": 400, "18": 300, "24": 200}
comparator_origins_by_horizon = {"3": 5, "6": 5, "12": 4, "18": 3, "24": 2}
interval_warmup_counts_by_horizon = {"3": 300, "6": 300, "12": 300, "18": 300, "24": 300}
interval_warmup_origins_by_horizon = {"3": 3, "6": 3, "12": 3, "18": 3, "24": 3}

def metric_block_for_counts(counts_by_horizon):
    case_count = sum(counts_by_horizon.values())
    return {
        "overall": {
            "caseCount": case_count,
            "wape": 0.5,
            "signedAggregateBias": 0.05,
            "actualTotal": float(case_count),
            "predictedTotal": float(case_count) * 1.05,
        },
        "byHorizon": {
            horizon: {
                "caseCount": count,
                "wape": 0.5,
                "signedAggregateBias": 0.05,
                "actualTotal": float(count),
                "predictedTotal": float(count) * 1.05,
            }
            for horizon, count in counts_by_horizon.items()
        },
    }

oof_metric_block = metric_block_for_counts(comparator_counts_by_horizon)
final_metric_block = metric_block_for_counts(fit_counts_by_horizon)

artifact = {
    "schema": spec["freeze"]["fittedParametersArtifact"]["schema"],
    "version": "calibration-fitted-parameters-v1",
    "decisionStatus": "not_for_formal_decision",
    "specVersion": spec["version"],
    "specRevision": spec["preHoldoutRevision"],
    "specDigest": module.spec_digest(spec),
    "parameterProvenance": baseline["parameterProvenance"],
    "fit": {
        "baselineId": "B0b",
        "fitStatus": "complete",
        "caseRole": fit_spec["caseRole"],
        "maximumTargetEnd": fit_spec["maximumTargetEnd"],
        "excludedRoles": fit_spec["excludedRoles"],
        "algorithm": fit_spec["algorithm"],
        "randomSeed": spec["randomSeed"],
        "factorGridDigest": module.sha256_canonical_json(fit_spec["factorGrid"]),
        "caseKeyFields": spec["caseKeys"]["aggregateFields"],
        "caseFingerprintSerialization": fit_spec["caseFingerprintSerialization"],
        "fitCaseFingerprint": "1" * 64,
        "fitCaseCount": sum(fit_counts_by_horizon.values()),
        "fitCaseCountByHorizon": fit_counts_by_horizon,
        "fitOriginCount": 8,
        "fitOriginCountByHorizon": fit_origins_by_horizon,
        "comparatorCaseFingerprint": "2" * 64,
        "comparatorCaseCount": sum(comparator_counts_by_horizon.values()),
        "comparatorCaseCountByHorizon": comparator_counts_by_horizon,
        "comparatorOriginCount": len(forward["scoreOrigins"]),
        "comparatorOriginCountByHorizon": comparator_origins_by_horizon,
        "oofPredictionFingerprint": "3" * 64,
        "intervalWarmupCaseFingerprint": "4" * 64,
        "intervalWarmupPredictionFingerprint": "5" * 64,
        "intervalWarmupCaseCount": sum(interval_warmup_counts_by_horizon.values()),
        "intervalWarmupCaseCountByHorizon": interval_warmup_counts_by_horizon,
        "intervalWarmupOriginCount": 3,
        "intervalWarmupOriginCountByHorizon": interval_warmup_origins_by_horizon,
        "intervalWarmupPredictionLockedBeforeTruthJoin": True,
        "intervalWarmupUsesOutcomeLabelsForPrediction": False,
        "authoritativeInputSignatureSha256": "2" * 64,
        "specCommit": "a" * 40,
        "fitCodeCommit": "b" * 40,
        "passes": 1,
        "usesEmbargoShadowLabels": False,
        "usesFinalHoldoutLabels": False,
        "usesLongHorizonAuditLabels": False,
        "legacyFactorsReused": False,
        "developmentWape": 0.5,
        "developmentSignedAggregateBias": 0.05,
        "forwardValidationMethod": forward["method"],
        "foldUnit": forward["foldUnit"],
        "warmupOrigins": forward["warmupOrigins"],
        "scoreOrigins": forward["scoreOrigins"],
        "foldTrainingCaseCountsByScoreOrigin": {
            fold["scoreOrigin"]: fold["expectedTrainOriginHorizonBlockCount"] * 100
            for fold in forward["folds"]
        },
        "foldTrainingMaximumTargetEndByScoreOrigin": {
            score_origin: score_origin for score_origin in forward["scoreOrigins"]
        },
        "trainingTargetEndRule": forward["trainCasePredicate"],
        "usesOnlyStrictlyAvailableLabels": True,
        "oofComparatorScoreUsed": True,
        "minimumTrainingCasesPerLifecycleFactor": oof_spec[
            "minimumTrainingCasesPerLifecycleFactor"
        ],
        "minimumTrainingOriginsPerLifecycleFactor": oof_spec[
            "minimumTrainingOriginsPerLifecycleFactor"
        ],
        "minimumActualRevenueSharePerLifecycleFactor": oof_spec[
            "minimumActualRevenueSharePerLifecycleFactor"
        ],
        "unsupportedFactorValue": oof_spec["unsupportedFactorValue"],
        "finalFactorsFitScope": oof_spec["finalFactorsFitAfterOofScoring"],
    },
    "B0b": {
        "lifecycleThresholds": baseline["lifecycleThresholds"],
        "lifecycleFactors": {key: 1.0 for key in fit_spec["initialFactors"]},
        "oofComparatorMetrics": copy.deepcopy(oof_metric_block),
        "finalFitDiagnosticMetrics": copy.deepcopy(final_metric_block),
        "lifecycleSupport": {
            stage: {
                "componentCaseCount": 250,
                "distinctOriginCount": 4,
                "absoluteActualRevenueShare": 1.0 / len(fit_spec["initialFactors"]),
                "supported": True,
            }
            for stage in fit_spec["initialFactors"]
        },
    },
}

bound = module.apply_fitted_parameters(spec, artifact)
bound_baseline = next(item for item in bound["models"]["baselines"] if item["id"] == "B0b")

def rejected(mutator):
    candidate = copy.deepcopy(artifact)
    mutator(candidate)
    try:
        module.apply_fitted_parameters(spec, candidate)
    except ValueError:
        return True
    return False

legacy = {
    key: baseline["legacyOutcomeExposedFactorsAuditOnly"][key]
    for key in fit_spec["initialFactors"]
}
checks = {
    "goodArtifactBinds": (
        bound_baseline["lifecycleFactors"] == artifact["B0b"]["lifecycleFactors"]
    ),
    "oldByHorizonFieldsNotBound": all(
        field not in bound_baseline
        for field in (
            "lifecycleFactorsByHorizon",
            "oofComparatorMetricsByHorizon",
            "finalFitDiagnosticMetricsByHorizon",
            "lifecycleSupportByHorizon",
        )
    ),
    "bindingDigestPresent": len(bound_baseline.get("boundFittedParameterDigest", "")) == 64,
    "missingFitCaseFingerprintRejected": rejected(
        lambda value: value["fit"].pop("fitCaseFingerprint")
    ),
    "missingComparatorCaseFingerprintRejected": rejected(
        lambda value: value["fit"].pop("comparatorCaseFingerprint")
    ),
    "missingIntervalWarmupCaseFingerprintRejected": rejected(
        lambda value: value["fit"].pop("intervalWarmupCaseFingerprint")
    ),
    "missingIntervalWarmupPredictionFingerprintRejected": rejected(
        lambda value: value["fit"].pop("intervalWarmupPredictionFingerprint")
    ),
    "invalidIntervalWarmupCaseFingerprintRejected": rejected(
        lambda value: value["fit"].update({"intervalWarmupCaseFingerprint": "bad"})
    ),
    "invalidIntervalWarmupPredictionFingerprintRejected": rejected(
        lambda value: value["fit"].update({"intervalWarmupPredictionFingerprint": "bad"})
    ),
    "intervalWarmupPredictionMustBeLockedRejected": rejected(
        lambda value: value["fit"].update(
            {"intervalWarmupPredictionLockedBeforeTruthJoin": False}
        )
    ),
    "intervalWarmupOutcomeLabelUseRejected": rejected(
        lambda value: value["fit"].update(
            {"intervalWarmupUsesOutcomeLabelsForPrediction": True}
        )
    ),
    "intervalWarmupCaseCountMismatchRejected": rejected(
        lambda value: value["fit"].update({"intervalWarmupCaseCount": 901})
    ),
    "intervalWarmupNegativeHorizonCountRejected": rejected(
        lambda value: value["fit"]["intervalWarmupCaseCountByHorizon"].update(
            {"24": -1}
        )
    ),
    "intervalWarmupStringCountRejected": rejected(
        lambda value: value["fit"]["intervalWarmupCaseCountByHorizon"].update(
            {"24": "300"}
        )
    ),
    "intervalWarmupOriginUnionMismatchRejected": rejected(
        lambda value: value["fit"].update({"intervalWarmupOriginCount": 2})
    ),
    "intervalWarmupUnequalHorizonPopulationRejected": rejected(
        lambda value: (
            value["fit"]["intervalWarmupCaseCountByHorizon"].update({"24": 299}),
            value["fit"].update({"intervalWarmupCaseCount": 1499}),
        )
    ),
    "fitCaseCountMismatchRejected": rejected(
        lambda value: value["fit"].update({"fitCaseCount": 3401})
    ),
    "comparatorCaseCountMismatchRejected": rejected(
        lambda value: value["fit"].update({"comparatorCaseCount": 1901})
    ),
    "wrongParameterProvenanceRejected": rejected(
        lambda value: value.update({"parameterProvenance": "legacy_outcome_exposed"})
    ),
    "oldPassesByHorizonRejected": rejected(
        lambda value: value["fit"].update(
            {"passesByHorizon": {key: 1 for key in core_horizons}}
        )
    ),
    "nonScalarPassesRejected": rejected(
        lambda value: value["fit"].update(
            {"passes": {key: 1 for key in core_horizons}}
        )
    ),
    "oldB0bByHorizonFieldRejected": rejected(
        lambda value: value["B0b"].update({"lifecycleFactorsByHorizon": {}})
    ),
    "oldCaseFingerprintFieldRejected": rejected(
        lambda value: value["fit"].update({"caseFingerprint": "4" * 64})
    ),
    "oldOofProtocolFieldRejected": rejected(
        lambda value: value["fit"].update({"oofProtocol": "leave_one_origin_out"})
    ),
    "legacyVectorRejected": rejected(
        lambda value: value["B0b"].update({"lifecycleFactors": legacy})
    ),
    "outOfGridFactorRejected": rejected(
        lambda value: value["B0b"]["lifecycleFactors"].update({"stable": 1.01})
    ),
    "nonMonotonicGlobalVectorRejected": rejected(
        lambda value: value["B0b"]["lifecycleFactors"].update({"inactive": 1.1})
    ),
    "minimumTrainingOriginsMismatchRejected": rejected(
        lambda value: value["fit"].update(
            {
                "minimumTrainingOriginsPerLifecycleFactor": (
                    oof_spec["minimumTrainingOriginsPerLifecycleFactor"] + 1
                )
            }
        )
    ),
    "wrongForwardMethodRejected": rejected(
        lambda value: value["fit"].update({"forwardValidationMethod": "leave_one_origin_out"})
    ),
    "wrongWarmupOriginsRejected": rejected(
        lambda value: value["fit"].update({"warmupOrigins": ["2019-06"]})
    ),
    "wrongScoreOriginsRejected": rejected(
        lambda value: value["fit"].update({"scoreOrigins": ["2022-12"]})
    ),
    "futureTrainingTargetEndRejected": rejected(
        lambda value: value["fit"]["foldTrainingMaximumTargetEndByScoreOrigin"].update(
            {"2020-12": "2021-01"}
        )
    ),
    "nonStrictAvailableLabelsRejected": rejected(
        lambda value: value["fit"].update({"usesOnlyStrictlyAvailableLabels": False})
    ),
    "inconsistentSupportFlagRejected": rejected(
        lambda value: value["B0b"]["lifecycleSupport"]["inactive"].update(
            {"componentCaseCount": 199}
        )
    ),
    "unsupportedStageNonFallbackRejected": rejected(
        lambda value: (
            value["B0b"]["lifecycleSupport"]["inactive"].update(
                {"componentCaseCount": 199, "supported": False}
            ),
            value["B0b"]["lifecycleFactors"].update({"inactive": 0.9}),
        )
    ),
    "oofMetricHorizonShapeRejected": rejected(
        lambda value: value["B0b"]["oofComparatorMetrics"]["byHorizon"].pop("24")
    ),
    "oofMetricBlockShapeRejected": rejected(
        lambda value: value["B0b"]["oofComparatorMetrics"]["overall"].pop(
            "actualTotal"
        )
    ),
    "oofMetricBindingMismatchRejected": rejected(
        lambda value: value["fit"].update({"developmentWape": 0.4})
    ),
    "metricBiasTotalsMismatchRejected": rejected(
        lambda value: value["B0b"]["oofComparatorMetrics"]["overall"].update(
            {"predictedTotal": 999999.0}
        )
    ),
    "metricCaseCountMismatchRejected": rejected(
        lambda value: value["B0b"]["finalFitDiagnosticMetrics"]["overall"].update(
            {"caseCount": 1}
        )
    ),
    "wrongSpecDigestRejected": rejected(lambda value: value.update({"specDigest": "0" * 64})),
    "holdoutUseRejected": rejected(
        lambda value: value["fit"].update({"usesFinalHoldoutLabels": True})
    ),
    "inSampleComparatorRejected": rejected(
        lambda value: value["fit"].update({"oofComparatorScoreUsed": False})
    ),
}
print(json.dumps(checks, sort_keys=True))
`
  });
  const checks = JSON.parse(output);

  assert.deepEqual(
    Object.entries(checks)
      .filter(([, passed]) => passed !== true)
      .map(([name]) => name),
    [],
    "fitted-parameter contract checks must all pass"
  );
});

test("Python calibration kernel passes synthetic leakage and contract tests", () => {
  const output = runPython([KERNEL_PATH, "--contract-self-test"], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024
  });
  const result = JSON.parse(output);

  assert.equal(result.fixtureSelfTest, true);
  assert.deepEqual(result.fixtureBoundary, {
    databaseRead: false,
    privateDataRead: false,
    syntheticOnly: true
  });
  assert.deepEqual(
    sorted(result.evidence.futurePerturbation.comparedPredictionFields),
    sorted([
      "case_key",
      "confidence",
      "eligibility",
      "features",
      "limitation",
      "point_forecast",
      "route",
      "spike_candidates"
    ])
  );
  assert.deepEqual(
    result.evidence.futurePerturbation.baselines,
    ["B0b", "B1", "B2", "B3"]
  );
  assert.deepEqual(
    sorted(result.evidence.futurePerturbation.alsoComparedForEveryBaseline),
    sorted(["annual_breakdown", "channel_components", "public_output"])
  );
  assert.deepEqual(result.evidence.caseKeyParity, {
    aggregateKeysUnique: true,
    channelComponentsReconcile: true,
    keySetsEqual: true
  });

  for (const check of [
    "baselineDefinitions",
    "specFrozenBeforeHoldout",
    "holdoutOriginIsolation",
    "futurePerturbationInvariant",
    "caseKeyParity",
    "signedBiasFormula",
    "clusterBootstrapUnit",
    "publicOutputContract",
    "revenueRouting",
    "spikeCandidateOnly",
    "currentStatusPostHocOnly",
    "longHorizonLimitation"
  ]) {
    assert.equal(result.checks[check], true, `contract self-test failed: ${check}`);
  }
});
