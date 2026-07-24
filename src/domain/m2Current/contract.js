const SUPPORTED_SCHEMAS = new Set([
  "m2.current.config.v0.1",
  "m2.current.config.v0.2"
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
    overallAbsoluteBiasMaximum: unitInterval(
      config.thresholds?.overallAbsoluteBiasMaximum,
      "overall_absolute_bias_maximum"
    ),
    eachHorizonAbsoluteBiasMaximum: unitInterval(
      config.thresholds?.eachHorizonAbsoluteBiasMaximum,
      "each_horizon_absolute_bias_maximum"
    ),
    pairedCiRequired: config.thresholds?.pairedCiRequired === true,
    pairedRelativeWapeUpperMaximum: finiteNumber(
      config.thresholds?.pairedRelativeWapeUpperMaximum,
      "paired_relative_wape_upper_maximum"
    )
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
  const evaluationPolicy = config.schema === "m2.current.config.v0.2"
    ? buildEvaluationPolicy(config.evaluationPolicy)
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
    businessSample,
    authorizations: Object.freeze(authorizations)
  });
}

function buildEvaluationPolicy(value) {
  const businessSampleRole = exactString(
    value?.businessSampleRole,
    "evaluation_policy_business_sample_role"
  );
  if (businessSampleRole !== "post_hoc_error_diagnostic_only") {
    throw new Error("m2_current_evaluation_policy_business_sample_role_invalid");
  }
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
  if (
    nextDevelopmentReadiness
    !== "AUTOMATED_BACKTEST_AND_BUSINESS_COVERAGE_REQUIRED"
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
  return Object.freeze({
    humanNumericBaselineRequired: false,
    businessSampleRole,
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

function unitInterval(value, name) {
  const number = finiteNumber(value, name);
  if (number < 0 || number > 1) {
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
