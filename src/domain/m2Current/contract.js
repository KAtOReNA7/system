const EXPECTED_SCHEMA = "m2.current.config.v0.1";

export function buildM2CurrentContract(config) {
  if (config?.schema !== EXPECTED_SCHEMA) {
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
    dormantReactivation: Object.freeze({
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
  };
  if (!candidate.scaleFactors.includes(1)) {
    throw new Error("m2_current_candidate_comparator_factor_required");
  }
  if (!candidate.dormantReactivation.blendFactors.includes(0)) {
    throw new Error("m2_current_candidate_dormant_fallback_required");
  }
  const authorizations = {
    provider: config.authorizations?.provider === true,
    database: config.authorizations?.database === true,
    modelTraining: config.authorizations?.modelTraining === true,
    holdout: config.authorizations?.holdout === true,
    release: config.authorizations?.release === true,
    m3Formal: config.authorizations?.m3Formal === true
  };

  return Object.freeze({
    allowedHorizons: new Set(allowedHorizons),
    allowedHorizonValues: Object.freeze([...allowedHorizons]),
    activitySegments: new Set(activitySegments),
    activitySegmentValues: Object.freeze([...activitySegments]),
    population: Object.freeze(population),
    thresholds: Object.freeze(thresholds),
    pairedBootstrap: Object.freeze(pairedBootstrap),
    candidate: Object.freeze(candidate),
    authorizations: Object.freeze(authorizations)
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
