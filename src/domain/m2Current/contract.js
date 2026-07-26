const SUPPORTED_SCHEMAS = new Set([
  "m2.current.config.v0.1",
  "m2.current.config.v0.2",
  "m2.current.config.v0.3",
  "m2.current.config.v0.4",
  "m2.current.config.v0.5",
  "m2.current.config.v0.6"
]);

export function buildM2CurrentContract(config) {
  if (!SUPPORTED_SCHEMAS.has(config?.schema)) {
    throw new Error("m2_current_config_schema_invalid");
  }

  const allowedHorizons = uniquePositiveIntegers(
    config.allowedHorizons,
    "allowed_horizons"
  );
  const activitySegments = uniqueStrings(
    config.activitySegments,
    "activity_segments"
  );
  const population = {
    libraryWorkCount: positiveInteger(
      config.frozenPopulation?.libraryWorkCount,
      "library_work_count"
    ),
    modelWorkCount: positiveInteger(
      config.frozenPopulation?.modelWorkCount,
      "model_work_count"
    ),
    modelCaseCount: positiveInteger(
      config.frozenPopulation?.modelCaseCount,
      "model_case_count"
    )
  };
  if (population.modelWorkCount > population.libraryWorkCount) {
    throw new Error("m2_current_model_population_exceeds_library");
  }

  const thresholds = {
    fullLibraryForecastableCashCoverageMinimum: unitInterval(
      config.thresholds?.fullLibraryForecastableCashCoverageMinimum,
      "full_library_cash_coverage_minimum"
    ),
    top10ForecastableCashCoverageMinimum: unitInterval(
      config.thresholds?.top10ForecastableCashCoverageMinimum,
      "top10_cash_coverage_minimum"
    ),
    developmentWapeMaximum: [
      "m2.current.config.v0.3",
      "m2.current.config.v0.4",
      "m2.current.config.v0.5",
      "m2.current.config.v0.6"
    ]
      .includes(config.schema)
      ? unitInterval(
        config.thresholds?.developmentWapeMaximum,
        "development_wape_maximum"
      )
      : null,
    overallAbsoluteBiasMaximum: unitInterval(
      config.thresholds?.overallAbsoluteBiasMaximum,
      "overall_absolute_bias_maximum"
    ),
    eachHorizonAbsoluteBiasMaximum: unitInterval(
      config.thresholds?.eachHorizonAbsoluteBiasMaximum,
      "each_horizon_absolute_bias_maximum"
    ),
    eachSegmentWapeMaximum:
      [
        "m2.current.config.v0.3",
        "m2.current.config.v0.4",
        "m2.current.config.v0.5",
        "m2.current.config.v0.6"
      ]
        .includes(config.schema)
      ? unitInterval(
        config.thresholds?.eachSegmentWapeMaximum,
        "each_segment_wape_maximum"
      )
      : null,
    eachSegmentAbsoluteBiasMaximum:
      [
        "m2.current.config.v0.3",
        "m2.current.config.v0.4",
        "m2.current.config.v0.5",
        "m2.current.config.v0.6"
      ]
        .includes(config.schema)
        ? unitInterval(
          config.thresholds?.eachSegmentAbsoluteBiasMaximum,
          "each_segment_absolute_bias_maximum"
        )
        : null,
    pairedCiRequired: config.thresholds?.pairedCiRequired === true,
    pairedRelativeWapeUpperMaximum: finiteNumber(
      config.thresholds?.pairedRelativeWapeUpperMaximum,
      "paired_relative_wape_upper_maximum"
    ),
    maximumClassificationUncertainCashShare:
      config.schema === "m2.current.config.v0.6"
        ? unitInterval(
          config.thresholds?.maximumClassificationUncertainCashShare,
          "maximum_classification_uncertain_cash_share"
        )
        : null,
    targetPartitionConservationTolerance:
      config.schema === "m2.current.config.v0.6"
        ? positiveFiniteNumber(
          config.thresholds?.targetPartitionConservationTolerance,
          "target_partition_conservation_tolerance"
        )
        : null
  };
  const pairedBootstrap = {
    method: exactString(
      config.evaluation?.pairedBootstrap?.method,
      "paired_bootstrap_method"
    ),
    confidence: unitInterval(
      config.evaluation?.pairedBootstrap?.confidence,
      "paired_bootstrap_confidence"
    ),
    iterations: positiveInteger(
      config.evaluation?.pairedBootstrap?.iterations,
      "paired_bootstrap_iterations"
    ),
    seed: positiveInteger(
      config.evaluation?.pairedBootstrap?.seed,
      "paired_bootstrap_seed"
    )
  };
  if (pairedBootstrap.method !== "paired_work_origin_pigeonhole") {
    throw new Error("m2_current_paired_bootstrap_method_invalid");
  }
  if (pairedBootstrap.confidence !== 0.95) {
    throw new Error("m2_current_paired_bootstrap_confidence_invalid");
  }
  const evaluationPolicy = config.schema !== "m2.current.config.v0.1"
    ? buildEvaluationPolicy(config.evaluationPolicy, config.schema)
    : null;
  const candidate = {
    id: exactString(config.candidate?.id, "candidate_id"),
    scaleFactors: uniqueFiniteNumbers(
      config.candidate?.scaleFactors,
      "candidate_scale_factors",
      { minimum: 0, maximum: 1 }
    ),
    trainingAbsoluteBiasMaximum: unitInterval(
      config.candidate?.trainingAbsoluteBiasMaximum,
      "candidate_training_absolute_bias_maximum"
    ),
    dormantReactivation: config.schema === "m2.current.config.v0.1"
      ? Object.freeze({
        blendFactors: uniqueFiniteNumbers(
          config.candidate?.dormantReactivation?.blendFactors,
          "candidate_dormant_blend_factors",
          { minimum: 0, maximum: 1 }
        ),
        minimumEarlierOriginCount: positiveInteger(
          config.candidate?.dormantReactivation?.minimumEarlierOriginCount,
          "candidate_dormant_minimum_earlier_origin_count"
        ),
        minimumEarlierCaseCount: positiveInteger(
          config.candidate?.dormantReactivation?.minimumEarlierCaseCount,
          "candidate_dormant_minimum_earlier_case_count"
        ),
        minimumRelativeWapeImprovement: unitInterval(
          config.candidate?.dormantReactivation?.minimumRelativeWapeImprovement,
          "candidate_dormant_minimum_relative_wape_improvement"
        )
      })
      : null,
    groupCalibration: config.schema === "m2.current.config.v0.2"
      ? buildGroupCalibration(config.candidate?.groupCalibration, activitySegments)
      : null,
    dormantPolicy: config.schema === "m2.current.config.v0.2"
      ? buildDormantPolicy(config.candidate?.dormantPolicy)
      : null,
    occurrenceAmount: config.schema === "m2.current.config.v0.3"
      ? buildOccurrenceAmountPolicy(
        config.candidate?.occurrenceAmount,
        activitySegments
      )
      : null
  };
  if (!candidate.scaleFactors.includes(1)) {
    throw new Error("m2_current_candidate_comparator_factor_required");
  }
  if (
    candidate.dormantReactivation
    && !candidate.dormantReactivation.blendFactors.includes(0)
  ) {
    throw new Error("m2_current_candidate_dormant_fallback_required");
  }
  const businessSample = config.schema === "m2.current.config.v0.2"
    ? Object.freeze({
      seed: positiveInteger(
        config.businessSample?.seed,
        "business_sample_seed"
      ),
      representativeWorkCountPerSegment: positiveInteger(
        config.businessSample?.representativeWorkCountPerSegment,
        "business_sample_representative_count"
      ),
      largestUnderpredictionWorkCountPerSegment: positiveInteger(
        config.businessSample?.largestUnderpredictionWorkCountPerSegment,
        "business_sample_underprediction_count"
      ),
      largestOverpredictionWorkCountPerSegment: positiveInteger(
        config.businessSample?.largestOverpredictionWorkCountPerSegment,
        "business_sample_overprediction_count"
      )
    })
    : null;
  const authorizations = {
    provider: config.authorizations?.provider === true,
    database: config.authorizations?.database === true,
    modelTraining: config.authorizations?.modelTraining === true,
    newCandidateFamilyDevelopment:
      config.authorizations?.newCandidateFamilyDevelopment === true,
    holdout: config.authorizations?.holdout === true,
    release: config.authorizations?.release === true,
    m3Formal: config.authorizations?.m3Formal === true
  };

  return Object.freeze({
    schema: config.schema,
    allowedHorizons: new Set(allowedHorizons),
    allowedHorizonValues: Object.freeze([...allowedHorizons]),
    activitySegments: new Set(activitySegments),
    activitySegmentValues: Object.freeze([...activitySegments]),
    population: Object.freeze(population),
    thresholds: Object.freeze(thresholds),
    pairedBootstrap: Object.freeze(pairedBootstrap),
    evaluationPolicy,
    candidate: Object.freeze(candidate),
    development: [
      "m2.current.config.v0.4",
      "m2.current.config.v0.5",
      "m2.current.config.v0.6"
    ].includes(config.schema)
      ? buildV04DevelopmentPolicy(config.development, config.schema)
      : null,
    businessSample,
    authorizations: Object.freeze(authorizations)
  });
}

function buildEvaluationPolicy(value, schema) {
  const finalHumanAcceptanceMode = exactString(
    value?.finalHumanAcceptanceMode,
    "evaluation_policy_final_human_acceptance_mode"
  );
  if (
    finalHumanAcceptanceMode
    !== "result_acceptance_after_technical_gates"
  ) {
    throw new Error(
      "m2_current_evaluation_policy_final_human_acceptance_mode_invalid"
    );
  }
  const nextDevelopmentReadiness = exactString(
    value?.nextDevelopmentReadiness,
    "evaluation_policy_next_development_readiness"
  );
  const expectedReadiness = schema === "m2.current.config.v0.6"
    ? "LATER_ORIGIN_NOT_QUALIFIED_2029_01_COMPLETE_LABELS_AND_ORIGINAL_FROZEN_STATE_REQUIRED"
    : schema === "m2.current.config.v0.5"
    ? "PORTFOLIO_INDEPENDENT_VALIDATION_AND_WORK_LEVEL_SIGNAL_REQUIRED"
    : schema === "m2.current.config.v0.4"
      ? "AUDITABLE_AS_OF_SIGNAL_AND_CASH_OBSERVABILITY_REQUIRED"
    : schema === "m2.current.config.v0.3"
      ? "BUSINESS_COVERAGE_AND_ABSOLUTE_QUALITY_REQUIRED"
      : "AUTOMATED_BACKTEST_AND_BUSINESS_COVERAGE_REQUIRED";
  if (
    nextDevelopmentReadiness
    !== expectedReadiness
  ) {
    throw new Error(
      "m2_current_evaluation_policy_next_development_readiness_invalid"
    );
  }
  if (value?.humanNumericBaselineRequired !== false) {
    throw new Error(
      "m2_current_evaluation_policy_human_numeric_baseline_must_be_false"
    );
  }
  if (value?.monthlyRollingOriginRequired !== true) {
    throw new Error(
      "m2_current_evaluation_policy_monthly_rolling_origin_required"
    );
  }
  if (value?.separateCashOccurrenceAndPositiveAmountRequired !== true) {
    throw new Error(
      "m2_current_evaluation_policy_two_part_diagnostic_required"
    );
  }
  const result = {
    humanNumericBaselineRequired: false,
    finalHumanAcceptanceMode,
    nextDevelopmentReadiness,
    monthlyRollingOriginRequired: true,
    separateCashOccurrenceAndPositiveAmountRequired: true,
    automatedComparators: Object.freeze(
      uniqueStrings(
        value?.automatedComparators,
        "evaluation_policy_automated_comparators"
      )
    ),
    requiredMetrics: Object.freeze(
      uniqueStrings(
        value?.requiredMetrics,
        "evaluation_policy_required_metrics"
      )
    ),
    requiredCoverageViews: Object.freeze(
      uniqueStrings(
        value?.requiredCoverageViews,
        "evaluation_policy_required_coverage_views"
      )
    )
  };
  if (schema === "m2.current.config.v0.2") {
    const businessSampleRole = exactString(
      value?.businessSampleRole,
      "evaluation_policy_business_sample_role"
    );
    if (businessSampleRole !== "post_hoc_error_diagnostic_only") {
      throw new Error(
        "m2_current_evaluation_policy_business_sample_role_invalid"
      );
    }
    result.businessSampleRole = businessSampleRole;
  } else {
    const humanRole = exactString(
      value?.humanRole,
      "evaluation_policy_human_role"
    );
    if (humanRole !== "post_gate_quality_assurance_only") {
      throw new Error("m2_current_evaluation_policy_human_role_invalid");
    }
    if (value?.businessSampleRequired !== false) {
      throw new Error(
        "m2_current_evaluation_policy_business_sample_must_be_false"
      );
    }
    result.humanRole = humanRole;
    result.businessSampleRequired = false;
    result.retiredArtifacts = Object.freeze(
      uniqueStrings(
        value?.retiredArtifacts,
        "evaluation_policy_retired_artifacts"
      )
    );
  }
  return Object.freeze(result);
}

function buildV04DevelopmentPolicy(value, schema) {
  const denseOrigins = value?.denseOrigins;
  const modelDevelopment = value?.modelDevelopment;
  const ensemble = value?.ensemble;
  const probabilistic = value?.probabilistic;
  const hierarchy = value?.hierarchy;
  const automation = value?.automation;
  if (
    denseOrigins?.stepMonths !== 1
    || denseOrigins?.decisionPopulationMoved !== false
    || denseOrigins?.role !== "secondary_development_diagnostic"
  ) {
    throw new Error("m2_current_dense_origin_policy_invalid");
  }
  if (
    !Array.isArray(modelDevelopment?.families)
    || modelDevelopment.families.length !== 3
    || modelDevelopment.families.some(
      (family) => !Array.isArray(family.parameters)
        || family.parameters.length === 0
    )
  ) {
    throw new Error("m2_current_global_model_policy_invalid");
  }
  if (
    hierarchy?.method !== "MinT"
    || hierarchy?.nonnegative !== true
    || probabilistic?.method
      !== "rolling_split_conformal_residual_quantiles"
  ) {
    throw new Error("m2_current_distributional_policy_invalid");
  }
  const result = {
    denseOrigins: Object.freeze({
      firstOrigin: exactString(denseOrigins.firstOrigin, "dense_first_origin"),
      lastOrigin: exactString(denseOrigins.lastOrigin, "dense_last_origin"),
      stepMonths: 1,
      horizons: Object.freeze(uniquePositiveIntegers(
        denseOrigins.horizons,
        "dense_horizons"
      )),
      labelAvailableThrough: exactString(
        denseOrigins.labelAvailableThrough,
        "dense_label_available_through"
      ),
      decisionPopulationMoved: false,
      role: denseOrigins.role
    }),
    modelDevelopment: Object.freeze({
      minimumTrainingRows: positiveInteger(
        modelDevelopment.minimumTrainingRows,
        "global_minimum_training_rows"
      ),
      minimumNestedRelativeWapeImprovement: unitInterval(
        modelDevelopment.minimumNestedRelativeWapeImprovement,
        "global_nested_relative_wape_improvement"
      ),
      maximumNestedAbsoluteBias: unitInterval(
        modelDevelopment.maximumNestedAbsoluteBias,
        "global_nested_absolute_bias"
      ),
      families: Object.freeze(modelDevelopment.families.map((family) => (
        Object.freeze({
          id: exactString(family.id, "global_family_id"),
          parameters: Object.freeze(family.parameters.map(
            (parameters) => Object.freeze({ ...parameters })
          ))
        })
      )))
    }),
    ensemble: Object.freeze({
      weights: Object.freeze(uniqueFiniteNumbers(
        ensemble.weights,
        "ensemble_weights",
        { minimum: 0, maximum: 1 }
      )),
      maximumTrainingAbsoluteBias: unitInterval(
        ensemble.maximumTrainingAbsoluteBias,
        "ensemble_training_absolute_bias"
      )
    }),
    probabilistic: Object.freeze({
      quantileProbabilities: Object.freeze(uniqueFiniteNumbers(
        probabilistic.quantileProbabilities,
        "probabilistic_quantiles",
        { minimum: 0, maximum: 1 }
      )),
      minimumCalibrationRows: positiveInteger(
        probabilistic.minimumCalibrationRows,
        "probabilistic_minimum_calibration_rows"
      ),
      method: probabilistic.method
    }),
    hierarchy: Object.freeze({ ...hierarchy }),
    automation: Object.freeze({
      ...automation,
      coverageLevels: Object.freeze([...automation.coverageLevels]),
      quantileProbabilities: Object.freeze(
        [...automation.quantileProbabilities]
      ),
      businessLoss: Object.freeze({ ...automation.businessLoss })
    }),
    portfolioReconstruction: [
      "m2.current.config.v0.5",
      "m2.current.config.v0.6"
    ].includes(schema)
      ? buildPortfolioReconstructionPolicy(value?.portfolioReconstruction)
      : null
  };
  return Object.freeze(result);
}

function buildPortfolioReconstructionPolicy(value) {
  if (
    value?.method !== "as_of_aggregate_additive_holt_winters_ensemble"
    || value?.populationPolicy !== "served_works_frozen_at_each_origin"
    || value?.sameOrLaterEvaluationTruthRead !== false
  ) {
    throw new Error("m2_current_portfolio_reconstruction_policy_invalid");
  }
  const selectionLabelsAvailableAsOf = exactString(
    value.selectionLabelsAvailableAsOf,
    "portfolio_selection_labels_available_as_of"
  );
  const evaluationFirstOrigin = exactString(
    value.evaluationFirstOrigin,
    "portfolio_evaluation_first_origin"
  );
  if (selectionLabelsAvailableAsOf > evaluationFirstOrigin) {
    throw new Error("m2_current_portfolio_selection_after_evaluation");
  }
  return Object.freeze({
    method: value.method,
    populationPolicy: value.populationPolicy,
    sameOrLaterEvaluationTruthRead: false,
    selectionLabelsAvailableAsOf,
    evaluationFirstOrigin,
    minimumEvaluationOriginCount: positiveInteger(
      value.minimumEvaluationOriginCount,
      "portfolio_minimum_evaluation_origin_count"
    ),
    seasonLength: positiveInteger(
      value.seasonLength,
      "portfolio_season_length"
    ),
    selectedModelCount: positiveInteger(
      value.selectedModelCount,
      "portfolio_selected_model_count"
    ),
    scalePriorCellCount: nonnegativeInteger(
      value.scalePriorCellCount,
      "portfolio_scale_prior_cell_count"
    ),
    dampingFactors: Object.freeze(uniqueFiniteNumbers(
      value.dampingFactors,
      "portfolio_damping_factors",
      { minimum: 0, maximum: 1 }
    )),
    alphaValues: Object.freeze(uniqueFiniteNumbers(
      value.alphaValues,
      "portfolio_alpha_values",
      { minimum: 0, maximum: 1 }
    )),
    betaValues: Object.freeze(uniqueFiniteNumbers(
      value.betaValues,
      "portfolio_beta_values",
      { minimum: 0, maximum: 1 }
    )),
    seasonalDampingFactors: Object.freeze(uniqueFiniteNumbers(
      value.seasonalDampingFactors,
      "portfolio_seasonal_damping_factors",
      { minimum: 0, maximum: 1 }
    )),
    seasonalAlphaValues: Object.freeze(uniqueFiniteNumbers(
      value.seasonalAlphaValues,
      "portfolio_seasonal_alpha_values",
      { minimum: 0, maximum: 1 }
    )),
    seasonalBetaValues: Object.freeze(uniqueFiniteNumbers(
      value.seasonalBetaValues,
      "portfolio_seasonal_beta_values",
      { minimum: 0, maximum: 1 }
    )),
    gammaValues: Object.freeze(uniqueFiniteNumbers(
      value.gammaValues,
      "portfolio_gamma_values",
      { minimum: 0, maximum: 1 }
    )),
    maximumPortfolioWape: unitInterval(
      value.maximumPortfolioWape,
      "portfolio_maximum_wape"
    ),
    maximumAbsoluteBias: unitInterval(
      value.maximumAbsoluteBias,
      "portfolio_maximum_absolute_bias"
    ),
    maximumP90CellAbsolutePercentageError: unitInterval(
      value.maximumP90CellAbsolutePercentageError,
      "portfolio_maximum_p90_cell_absolute_percentage_error"
    ),
    minimumForecastValueAdded: unitInterval(
      value.minimumForecastValueAdded,
      "portfolio_minimum_forecast_value_added"
    )
  });
}

function buildOccurrenceAmountPolicy(value, activitySegments) {
  const eligibleSegments = uniqueStrings(
    value?.eligibleSegments,
    "occurrence_amount_eligible_segments"
  );
  if (
    eligibleSegments.some(
      (segment) => !activitySegments.includes(segment) || segment === "dormant"
    )
  ) {
    throw new Error("m2_current_occurrence_amount_segments_invalid");
  }
  const minimumFactor = unitInterval(
    value?.minimumFactor,
    "occurrence_amount_minimum_factor"
  );
  const maximumFactor = finiteNumber(
    value?.maximumFactor,
    "occurrence_amount_maximum_factor"
  );
  if (maximumFactor < minimumFactor || maximumFactor > 2) {
    throw new Error("m2_current_occurrence_amount_factor_range_invalid");
  }
  return Object.freeze({
    baseCandidateId: exactString(
      value?.baseCandidateId,
      "occurrence_amount_base_candidate_id"
    ),
    eligibleSegments: Object.freeze(eligibleSegments),
    minimumEarlierCaseCount: positiveInteger(
      value?.minimumEarlierCaseCount,
      "occurrence_amount_minimum_earlier_case_count"
    ),
    minimumRelativeWapeImprovement: unitInterval(
      value?.minimumRelativeWapeImprovement,
      "occurrence_amount_minimum_relative_wape_improvement"
    ),
    trainingAbsoluteBiasMaximum: unitInterval(
      value?.trainingAbsoluteBiasMaximum,
      "occurrence_amount_training_absolute_bias_maximum"
    ),
    priorStrength: positiveInteger(
      value?.priorStrength,
      "occurrence_amount_prior_strength"
    ),
    priorOccurrenceProbability: unitInterval(
      value?.priorOccurrenceProbability,
      "occurrence_amount_prior_occurrence_probability"
    ),
    minimumFactor,
    maximumFactor
  });
}

function buildGroupCalibration(value, activitySegments) {
  const featureEntries = Object.entries(value?.featureBySegment ?? {});
  const requiredSegments = activitySegments.filter(
    (segment) => segment !== "dormant"
  );
  if (
    featureEntries.length !== requiredSegments.length
    || requiredSegments.some(
      (segment) => typeof value?.featureBySegment?.[segment] !== "string"
    )
  ) {
    throw new Error("m2_current_group_calibration_features_invalid");
  }
  const allowedFeatures = new Set(["spike_candidate", "value_band"]);
  if (featureEntries.some(([, feature]) => !allowedFeatures.has(feature))) {
    throw new Error("m2_current_group_calibration_feature_not_allowed");
  }
  return Object.freeze({
    minimumEarlierCaseCount: positiveInteger(
      value?.minimumEarlierCaseCount,
      "group_calibration_minimum_case_count"
    ),
    minimumRelativeWapeImprovement: unitInterval(
      value?.minimumRelativeWapeImprovement,
      "group_calibration_minimum_relative_wape_improvement"
    ),
    featureBySegment: Object.freeze({ ...value.featureBySegment }),
    allowedValueBands: Object.freeze(
      uniqueStrings(value?.allowedValueBands, "allowed_value_bands")
    )
  });
}

function buildDormantPolicy(value) {
  const mode = exactString(value?.mode, "dormant_policy_mode");
  if (mode !== "b4_fallback_until_identifiable_as_of_signal") {
    throw new Error("m2_current_dormant_policy_mode_invalid");
  }
  return Object.freeze({
    mode,
    minimumEarlierOriginCount: positiveInteger(
      value?.minimumEarlierOriginCount,
      "dormant_policy_minimum_origin_count"
    ),
    minimumEarlierCaseCount: positiveInteger(
      value?.minimumEarlierCaseCount,
      "dormant_policy_minimum_case_count"
    )
  });
}

function uniquePositiveIntegers(values, name) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`m2_current_${name}_required`);
  }
  const normalized = values.map((value) => positiveInteger(value, name));
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`m2_current_${name}_duplicate`);
  }
  return normalized;
}

function uniqueStrings(values, name) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`m2_current_${name}_required`);
  }
  const normalized = values.map((value) => exactString(value, name));
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`m2_current_${name}_duplicate`);
  }
  return normalized;
}

function uniqueFiniteNumbers(values, name, { minimum, maximum }) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`m2_current_${name}_required`);
  }
  const normalized = values.map((value) => finiteNumber(value, name));
  if (
    normalized.some((value) => value < minimum || value > maximum)
    || new Set(normalized).size !== normalized.length
  ) {
    throw new Error(`m2_current_${name}_invalid`);
  }
  return normalized;
}

function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`m2_current_${name}_invalid`);
  }
  return number;
}

function nonnegativeInteger(value, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`m2_current_${name}_invalid`);
  }
  return number;
}

function unitInterval(value, name) {
  const number = finiteNumber(value, name);
  if (number < 0 || number > 1) {
    throw new Error(`m2_current_${name}_invalid`);
  }
  return number;
}

function positiveFiniteNumber(value, name) {
  const number = finiteNumber(value, name);
  if (number <= 0) {
    throw new Error(`m2_current_${name}_invalid`);
  }
  return number;
}

function finiteNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`m2_current_${name}_invalid`);
  }
  return number;
}

function exactString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`m2_current_${name}_required`);
  }
  return value.trim();
}
