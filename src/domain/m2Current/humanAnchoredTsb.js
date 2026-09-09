import {
  evaluateM2CurrentRiskCoverage,
  scoreM2CurrentBusinessLoss
} from "./automation.js";
import {
  fitM2CurrentTsbProcess,
  forecastM2CurrentBaselines
} from "./baselines.js";
import {
  buildM2HumanAnchoredResidualPools,
  calibrateM2HumanAnchoredQuantiles,
  deterministicWorkFold,
  fitM2HumanAnchoredReversal,
  forecastM2HumanAnchoredBase,
  learnM2HumanAnchoredParameters,
  predictM2HumanAnchoredReversalRate,
  workClusterBootstrap
} from "./humanAnchored.js";
import {
  scoreM2CurrentEvaluationRows,
  scoreM2CurrentProbabilisticRows
} from "./metrics.js";
import { evaluateM2CurrentResolution } from "./portfolio.js";

const CANDIDATE_ID =
  "M2-current-human-anchored-tsb-occurrence-challenger-v0.1";

export function buildM2HumanAnchoredTsbParameterGrid(config) {
  const parameterSpace = requireObject(
    config?.parameterSpace,
    "parameter_space"
  );
  const occurrence = smoothingGrid(
    parameterSpace.occurrenceSmoothing,
    "occurrence_smoothing"
  );
  const positiveAmount = smoothingGrid(
    parameterSpace.positiveAmountSmoothing,
    "positive_amount_smoothing"
  );
  const blends = fractionGrid(
    parameterSpace.learnedGlobalToTsbBlend,
    "learned_global_to_tsb_blend"
  );
  if (!blends.includes(0)) {
    throw new Error("m2_human_anchored_tsb_lambda_zero_fallback_required");
  }
  const grid = occurrence.flatMap((occurrenceSmoothing) => (
    positiveAmount.flatMap((positiveAmountSmoothing) => (
      blends.map((lambda) => Object.freeze({
        occurrenceSmoothing,
        positiveAmountSmoothing,
        lambda
      }))
    ))
  ));
  const expected = Number(parameterSpace.selectionCombinationCount);
  if (grid.length !== expected) {
    throw new Error("m2_human_anchored_tsb_grid_count_drift");
  }
  return Object.freeze(grid);
}

export function forecastM2HumanAnchoredTsbComponents(
  row,
  {
    learnedGlobalPositive,
    reversalRate,
    parameters
  }
) {
  const history = requireMonthlyHistory(row);
  const horizonMonths = positiveInteger(
    row?.horizonMonths,
    "horizon_months"
  );
  const lambda = fraction(parameters?.lambda, "lambda");
  const tsb = fitM2CurrentTsbProcess(history.positiveSeries, {
    occurrenceSmoothing: parameters?.occurrenceSmoothing,
    positiveAmountSmoothing: parameters?.positiveAmountSmoothing
  });
  const learnedPositive = nonnegative(
    learnedGlobalPositive,
    "learned_global_positive"
  );
  const reversal = nonnegative(reversalRate, "reversal_rate");
  const rawTsbPositive = tsb.expectedMonthlyPositiveCash * horizonMonths;
  const blendPositive = (
    (1 - lambda) * learnedPositive
    + lambda * rawTsbPositive
  );
  const learnedReversal = learnedPositive * reversal;
  const rawTsbReversal = rawTsbPositive * reversal;
  const blendReversal = blendPositive * reversal;
  const horizonOccurrenceProbability = clamp(
    1 - (1 - tsb.occurrenceProbability) ** horizonMonths,
    0,
    1
  );
  const conditionalPositiveAmount = horizonOccurrenceProbability > 0
    ? rawTsbPositive / horizonOccurrenceProbability
    : 0;
  return Object.freeze({
    observedMonthCount: tsb.observedMonthCount,
    positiveMonthCount: tsb.positiveMonthCount,
    monthlyOccurrenceProbability: tsb.occurrenceProbability,
    horizonOccurrenceProbability,
    positiveAmountLevel: tsb.positiveAmountLevel,
    conditionalPositiveAmount,
    learnedGlobalPositivePointEstimate: learnedPositive,
    learnedGlobalReversalPointEstimate: learnedReversal,
    learnedGlobalNetPointEstimate: learnedPositive - learnedReversal,
    rawTsbPositivePointEstimate: rawTsbPositive,
    rawTsbReversalPointEstimate: rawTsbReversal,
    rawTsbNetPointEstimate: rawTsbPositive - rawTsbReversal,
    blendPositivePointEstimate: blendPositive,
    blendReversalPointEstimate: blendReversal,
    blendNetPointEstimate: blendPositive - blendReversal
  });
}

export function crossFitM2HumanAnchoredTsb(
  rows,
  selectionRows,
  baseConfig,
  candidateConfig,
  { foldSelections = null } = {}
) {
  requireRows(rows, "primary_rows");
  requireRows(selectionRows, "selection_rows");
  const foldCount = positiveInteger(
    baseConfig?.learning?.crossWorkFoldCount,
    "cross_work_fold_count"
  );
  const output = [];
  const folds = [];
  for (let fold = 0; fold < foldCount; fold += 1) {
    const inTrainingFold = (row) => (
      deterministicWorkFold(row.standardWorkId, foldCount) !== fold
    );
    const training = rows.filter(inTrainingFold);
    const validation = rows.filter((row) => !inTrainingFold(row));
    const innerSelectionRows = selectionRows.filter(inTrainingFold);
    if (training.length === 0 || validation.length === 0) {
      throw new Error("m2_human_anchored_tsb_cross_work_fold_empty");
    }
    const reused = Array.isArray(foldSelections)
      ? foldSelections.find((value) => value.fold === fold)
      : null;
    const selection = reused === null || reused === undefined
      ? selectM2HumanAnchoredTsbParameters(
        innerSelectionRows,
        baseConfig,
        candidateConfig
      )
      : Object.freeze({
        status: "reused_same_fold_inner_selection",
        parameters: reused.parameters,
        innerEvidenceOriginCount: reused.innerEvidenceOriginCount,
        objective: null
      });
    const state = fitM2HumanAnchoredTsbState(
      training,
      baseConfig,
      candidateConfig,
      selection.parameters
    );
    for (const row of validation) {
      output.push({
        ...row,
        ...predictM2HumanAnchoredTsb(
          row,
          state,
          baseConfig,
          candidateConfig
        ),
        evaluationFold: fold,
        trainingReadOwnWork: false,
        selectionStatus: selection.status
      });
    }
    folds.push(Object.freeze({
      fold,
      trainingRowCount: training.length,
      trainingWorkCount: state.trainingWorkCount,
      validationRowCount: validation.length,
      validationWorkCount: new Set(
        validation.map((row) => String(row.standardWorkId))
      ).size,
      selectionStatus: selection.status,
      innerEvidenceOriginCount: selection.innerEvidenceOriginCount,
      parameters: selection.parameters,
      learnedGlobalParameters: state.learnedGlobalParameters
    }));
  }
  output.sort(compareCaseRows);
  return Object.freeze({
    schema: "m2.current.human_anchored_tsb_cross_work.v0.1",
    rows: Object.freeze(output),
    folds: Object.freeze(folds),
    candidateId: CANDIDATE_ID,
    design: "cross_work_outer_with_inner_earlier_origin_grid_selection",
    independentLaterOrigin: false
  });
}

export function strictRollingM2HumanAnchoredTsb(
  rows,
  baseConfig,
  candidateConfig
) {
  requireRows(rows, "strict_rolling_rows");
  const start = requireMonth(
    baseConfig?.dataContract?.strictAuxiliaryEvaluationStartsAt,
    "strict_auxiliary_start"
  );
  const origins = [...new Set(rows.map(
    (row) => requireMonth(row.origin, "origin")
  ))].sort().filter((origin) => origin >= start);
  const output = [];
  const selections = [];
  const innerStateCache = new Map();
  for (const outerOrigin of origins) {
    const training = rows.filter((row) => (
      row.origin < outerOrigin
      && row.labelAvailableAsOf <= outerOrigin
    ));
    const validation = rows.filter((row) => row.origin === outerOrigin);
    const minimum = Number(
      baseConfig?.learning?.minimumStrictAsOfTrainingRows
    );
    if (training.length < minimum) {
      selections.push(Object.freeze({
        outerOrigin,
        status: "insufficient_mature_earlier_rows",
        trainingRowCount: training.length,
        validationRowCount: validation.length
      }));
      continue;
    }
    const selection = selectM2HumanAnchoredTsbParameters(
      training,
      baseConfig,
      candidateConfig,
      innerStateCache
    );
    const state = fitM2HumanAnchoredTsbState(
      training,
      baseConfig,
      candidateConfig,
      selection.parameters
    );
    for (const row of validation) {
      output.push({
        ...row,
        ...predictM2HumanAnchoredTsb(
          row,
          state,
          baseConfig,
          candidateConfig
        ),
        outerOrigin,
        sameOrLaterOuterTruthRead: false,
        maximumTrainingLabelAvailableAsOf:
          state.maximumLabelAvailableAsOf,
        selectionStatus: selection.status
      });
    }
    selections.push(Object.freeze({
      outerOrigin,
      status: "evaluated",
      trainingRowCount: training.length,
      trainingWorkCount: state.trainingWorkCount,
      validationRowCount: validation.length,
      maximumTrainingLabelAvailableAsOf:
        state.maximumLabelAvailableAsOf,
      sameOrLaterOuterTruthRead: false,
      selectionStatus: selection.status,
      innerEvidenceOriginCount: selection.innerEvidenceOriginCount,
      parameters: selection.parameters,
      learnedGlobalParameters: state.learnedGlobalParameters
    }));
  }
  if (output.length === 0) {
    throw new Error("m2_human_anchored_tsb_strict_rolling_output_empty");
  }
  output.sort(compareCaseRows);
  return Object.freeze({
    schema: "m2.current.human_anchored_tsb_strict_rolling.v0.1",
    rows: Object.freeze(output),
    selections: Object.freeze(selections),
    candidateId: CANDIDATE_ID,
    design: "strict_as_of_outer_with_inner_earlier_origin_grid_selection",
    independentLaterOrigin: false
  });
}

export function finalizeM2HumanAnchoredTsbDevelopment(
  primaryResult,
  strictResult,
  candidateConfig
) {
  const primaryRows = requireRows(primaryResult?.rows, "primary_result_rows");
  const strictRows = requireRows(strictResult?.rows, "strict_result_rows");
  const preFallbackPrimary = scoreM2HumanAnchoredTsbRows(
    primaryRows,
    candidateConfig,
    {
      pointField: "blendCandidatePointEstimate",
      quantileField: "candidateQuantiles"
    }
  );
  const preFallbackStrict = scoreM2HumanAnchoredTsbRows(
    strictRows,
    candidateConfig,
    {
      pointField: "blendCandidatePointEstimate",
      quantileField: "candidateQuantiles"
    }
  );
  const bootstrap = Object.freeze({
    ...workClusterBootstrap(primaryRows, {
      iterations:
        candidateConfig.evaluation.workClusterBootstrap.iterations,
      seed: candidateConfig.evaluation.workClusterBootstrap.seed,
      candidateField: "blendCandidatePointEstimate",
      comparatorField: "learnedGlobalCommonReversalPointEstimate"
    }),
    candidateField: "blendCandidatePointEstimate",
    comparatorField: "learnedGlobalCommonReversalPointEstimate"
  });
  const timeBlockAudit = buildTimeBlockAudit(strictRows, candidateConfig);
  const gates = evaluateDevelopmentGates({
    primaryRows,
    primaryMetrics: preFallbackPrimary,
    strictMetrics: preFallbackStrict,
    bootstrap,
    timeBlockAudit,
    candidateConfig
  });
  const developmentAccepted = Object.values(gates).every(Boolean);
  const finalize = (row) => Object.freeze({
    ...row,
    selectedPipelinePointEstimate: developmentAccepted
      ? row.blendCandidatePointEstimate
      : row.learnedGlobalCommonReversalPointEstimate,
    selectedPipelineQuantiles: developmentAccepted
      ? row.candidateQuantiles
      : row.fallbackQuantiles,
    pointEstimate: developmentAccepted
      ? row.blendCandidatePointEstimate
      : row.learnedGlobalCommonReversalPointEstimate,
    quantiles: developmentAccepted
      ? row.candidateQuantiles
      : row.fallbackQuantiles,
    selectedPipelineLayer: developmentAccepted
      ? "pre_fallback_selected_blend"
      : "lambda_zero_learned_global_fallback"
  });
  const finalizedPrimaryRows = primaryRows.map(finalize);
  const finalizedStrictRows = strictRows.map(finalize);
  const selectedPrimary = scoreM2HumanAnchoredTsbRows(
    finalizedPrimaryRows,
    candidateConfig,
    {
      pointField: "selectedPipelinePointEstimate",
      quantileField: "selectedPipelineQuantiles"
    }
  );
  const selectedStrict = scoreM2HumanAnchoredTsbRows(
    finalizedStrictRows,
    candidateConfig,
    {
      pointField: "selectedPipelinePointEstimate",
      quantileField: "selectedPipelineQuantiles"
    }
  );
  return Object.freeze({
    schema: "m2.current.human_anchored_tsb_development.v0.1",
    candidateId: CANDIDATE_ID,
    developmentAccepted,
    decision: developmentAccepted
      ? "DEVELOPMENT_DIAGNOSTIC_NOT_INDEPENDENT"
      : "TSB_OCCURRENCE_DEVELOPMENT_FAIL",
    gates: Object.freeze(gates),
    primary: Object.freeze({
      ...primaryResult,
      rows: Object.freeze(finalizedPrimaryRows),
      preFallbackMetrics: preFallbackPrimary,
      selectedPipelineMetrics: selectedPrimary,
      bootstrap
    }),
    strictAuxiliary: Object.freeze({
      ...strictResult,
      rows: Object.freeze(finalizedStrictRows),
      preFallbackMetrics: preFallbackStrict,
      selectedPipelineMetrics: selectedStrict,
      timeBlockAudit
    }),
    fvaSemantics: Object.freeze({
      rawTsbCandidate:
        "pure_TSB_positive_process_with_common_reversal_before_blend",
      blendCandidate:
        "inner_selected_blend_before_development_gate_fallback",
      selectedPipeline:
        "blend_only_if_all_preregistered_gates_pass_otherwise_lambda_zero",
      selectedFallbackDoesNotOverwriteCandidateFva: true
    }),
    boundaries: Object.freeze({
      independentLaterOriginExists: false,
      earliestPossibleIndependentOrigin: "2026-01",
      completeLabelsRequiredThrough: "2029-01",
      originalFrozenV10StateRequired: true,
      exactV03FallbackRetained: true,
      currentDecision: "CANARY_FAIL",
      automationDecision: "AUTOMATION_BLOCKED",
      releaseAuthorized: false
    })
  });
}

export function scoreM2HumanAnchoredTsbRows(
  rows,
  candidateConfig,
  {
    pointField = "blendCandidatePointEstimate",
    quantileField = "candidateQuantiles"
  } = {}
) {
  requireRows(rows, "score_rows");
  const evaluationRows = rows.map((row) => ({
    ...row,
    pointEstimate: finite(row?.[pointField], pointField),
    quantiles: requireObject(row?.[quantileField], quantileField)
  }));
  const point = scoreM2CurrentEvaluationRows(evaluationRows);
  const probabilistic = scoreM2CurrentProbabilisticRows(
    evaluationRows,
    candidateConfig.evaluation.quantileProbabilities
  );
  const fallback = scoreField(
    rows,
    "learnedGlobalCommonReversalPointEstimate"
  );
  const rawTsb = scoreField(rows, "rawTsbPointEstimate");
  const blend = scoreField(rows, "blendCandidatePointEstimate");
  const selected = scoreField(rows, pointField);
  const businessLoss = scoreM2CurrentBusinessLoss(
    evaluationRows,
    candidateConfig.evaluation.businessLoss
  );
  const fallbackBusinessLoss = scoreM2CurrentBusinessLoss(
    rows.map((row) => ({
      ...row,
      pointEstimate: row.learnedGlobalCommonReversalPointEstimate
    })),
    candidateConfig.evaluation.businessLoss
  );
  return Object.freeze({
    point,
    probabilistic,
    component: scoreComponents(rows),
    businessLoss,
    riskCoverage: evaluateM2CurrentRiskCoverage(
      evaluationRows,
      {
        coverageLevels:
          candidateConfig.evaluation.riskCoverageLevels,
        quantileProbabilities:
          candidateConfig.evaluation.quantileProbabilities,
        businessLoss: candidateConfig.evaluation.businessLoss
      }
    ),
    resolutions: evaluateM2CurrentResolution(evaluationRows, {
      bootstrapIterations:
        candidateConfig.evaluation.originBootstrapIterations,
      bootstrapSeed:
        candidateConfig.evaluation.originBootstrapSeed
    }),
    bySegment: scoreSlices(rows, "segment", pointField),
    byRevenueMode: scoreSlices(
      rows,
      "dominantRevenueMode",
      pointField
    ),
    byWorkProfile: scoreSlices(rows, "workProfile", pointField),
    bySecondLevelCategory: scoreSlices(
      rows,
      "secondLevelCategoryReportingOnly",
      pointField
    ),
    comparators: Object.freeze({
      manualFaithful: scoreField(
        rows,
        "manualFaithfulPointEstimate"
      ),
      learnedGlobal: scoreField(rows, "learnedGlobalPointEstimate"),
      learnedGlobalCommonReversal: fallback,
      independentTsbBaseline: scoreField(
        rows,
        "independentTsbBaselinePointEstimate"
      ),
      rawTsbCandidate: rawTsb
    }),
    fva: Object.freeze({
      rawTsbCandidate: fva(fallback, rawTsb),
      blendCandidate: fva(fallback, blend),
      selectedPipeline: fva(fallback, selected),
      candidateBusinessLossFva: fallbackBusinessLoss === 0
        ? null
        : (fallbackBusinessLoss - businessLoss) / fallbackBusinessLoss
    })
  });
}

export function buildM2HumanAnchoredTsbSyntheticDiagnostic(
  fixture,
  candidateConfig
) {
  if (
    fixture?.schema
    !== "m2.current.human_anchored_tsb_synthetic_fixture.v0.1"
  ) {
    throw new Error("m2_human_anchored_tsb_synthetic_fixture_invalid");
  }
  const parameters = Object.freeze({
    occurrenceSmoothing: 0.1,
    positiveAmountSmoothing: 0.1,
    lambda: 0.5
  });
  const rows = requireRows(fixture.cases, "synthetic_cases").map((item) => {
    const row = {
      ...item,
      salesShareMonthlyHistory: item.salesShareMonthlyHistory
    };
    const component = forecastM2HumanAnchoredTsbComponents(row, {
      learnedGlobalPositive: item.learnedGlobalPositive,
      reversalRate: item.reversalRate,
      parameters
    });
    return {
      ...row,
      actual: Number(item.actualPositive) - Number(item.actualReversal),
      ...component,
      occurrenceProbability:
        component.horizonOccurrenceProbability,
      pointEstimate: component.blendNetPointEstimate
    };
  });
  const fallbackChecks = rows.map((row) => {
    const fallback = forecastM2HumanAnchoredTsbComponents(row, {
      learnedGlobalPositive: row.learnedGlobalPositive,
      reversalRate: row.reversalRate,
      parameters: { ...parameters, lambda: 0 }
    });
    return fallback.blendNetPointEstimate
      === fallback.learnedGlobalNetPointEstimate;
  });
  const zeroTail = fitM2CurrentTsbProcess([10, 0, 0, 0], {
    occurrenceSmoothing: 0.1,
    positiveAmountSmoothing: 0.1
  });
  const withoutZeroTail = fitM2CurrentTsbProcess([10], {
    occurrenceSmoothing: 0.1,
    positiveAmountSmoothing: 0.1
  });
  const reversalInvariantLeft = forecastM2HumanAnchoredTsbComponents(
    fixture.cases[0],
    {
      learnedGlobalPositive: fixture.cases[0].learnedGlobalPositive,
      reversalRate: fixture.cases[0].reversalRate,
      parameters
    }
  );
  const reversalInvariantRight = forecastM2HumanAnchoredTsbComponents(
    {
      ...fixture.cases[0],
      salesShareMonthlyHistory: {
        ...fixture.cases[0].salesShareMonthlyHistory,
        reversalSeries:
          fixture.cases[0].salesShareMonthlyHistory.reversalSeries
            .map((value) => Number(value) + 999)
      }
    },
    {
      learnedGlobalPositive: fixture.cases[0].learnedGlobalPositive,
      reversalRate: fixture.cases[0].reversalRate,
      parameters
    }
  );
  const checks = Object.freeze({
    lambdaZeroExactlyRestoresLearnedGlobal:
      fallbackChecks.every(Boolean),
    observedZeroMonthsReduceOccurrenceProbability:
      zeroTail.occurrenceProbability
      < withoutZeroTail.occurrenceProbability,
    zeroMonthsDoNotUpdatePositiveAmount:
      zeroTail.positiveAmountLevel
      === withoutZeroTail.positiveAmountLevel,
    reversalSeriesDoesNotEnterPositiveTsbState:
      reversalInvariantLeft.rawTsbPositivePointEstimate
      === reversalInvariantRight.rawTsbPositivePointEstimate,
    noPrivateInputRequired: true,
    noUnobservedOrUnmaturedZeroImputation: true
  });
  if (!Object.values(checks).every(Boolean)) {
    throw new Error("m2_human_anchored_tsb_synthetic_check_failed");
  }
  const point = scoreM2CurrentEvaluationRows(rows);
  return Object.freeze({
    schema:
      "m2.current.human_anchored_tsb_public_diagnostic.v0.1",
    candidateId: CANDIDATE_ID,
    target: "future_sales_share_cash",
    privateCapabilityUsed: false,
    syntheticCaseCount: rows.length,
    parameterGridCount:
      buildM2HumanAnchoredTsbParameterGrid(candidateConfig).length,
    checks,
    point,
    boundaries: Object.freeze({
      frozenV10Modified: false,
      exactV03FallbackRetained: true,
      independentLaterOriginOpened: false,
      finalHoldoutOpened: false,
      currentDecision: "CANARY_FAIL",
      automationDecision: "AUTOMATION_BLOCKED",
      releaseAuthorized: false
    })
  });
}

function selectM2HumanAnchoredTsbParameters(
  rows,
  baseConfig,
  candidateConfig,
  innerStateCache = null
) {
  const grid = buildM2HumanAnchoredTsbParameterGrid(candidateConfig);
  const minimumRows = positiveInteger(
    candidateConfig.selection.minimumInnerTrainingRows,
    "minimum_inner_training_rows"
  );
  const minimumOrigins = positiveInteger(
    candidateConfig.selection.minimumValidationOrigins,
    "minimum_validation_origins"
  );
  const origins = [...new Set(rows.map(
    (row) => requireMonth(row.origin, "inner_origin")
  ))].sort();
  const byGrid = new Map(grid.map((parameters) => [
    choiceId(parameters),
    {
      parameters,
      absoluteError: 0,
      signedError: 0,
      actualDenominator: 0,
      businessLossTotal: 0,
      rowCount: 0,
      origins: new Set()
    }
  ]));
  for (const innerOrigin of origins) {
    const training = rows.filter((row) => (
      row.origin < innerOrigin
      && row.labelAvailableAsOf <= innerOrigin
    ));
    const validation = rows.filter((row) => row.origin === innerOrigin);
    if (training.length < minimumRows || validation.length === 0) {
      continue;
    }
    let cached = innerStateCache?.get(innerOrigin);
    if (cached !== undefined && cached.trainingRowCount !== training.length) {
      throw new Error("m2_human_anchored_tsb_inner_cache_scope_drift");
    }
    if (cached === undefined) {
      try {
        cached = Object.freeze({
          trainingRowCount: training.length,
          learnedGlobalParameters: learnM2HumanAnchoredParameters(
            training,
            baseConfig
          ).parameters,
          reversalState: fitM2HumanAnchoredReversal(training, baseConfig)
        });
      } catch {
        cached = Object.freeze({
          trainingRowCount: training.length,
          unavailable: true
        });
      }
      innerStateCache?.set(innerOrigin, cached);
    }
    if (cached.unavailable === true) {
      continue;
    }
    const learnedGlobalParameters = cached.learnedGlobalParameters;
    const reversalState = cached.reversalState;
    const prepared = validation.map((row) => {
      const learned = forecastM2HumanAnchoredBase(
        row,
        learnedGlobalParameters
      );
      const reversalRate = predictM2HumanAnchoredReversalRate(
        row,
        reversalState
      );
      return { row, learned, reversalRate };
    });
    for (const parameters of grid) {
      const bucket = byGrid.get(choiceId(parameters));
      for (const item of prepared) {
        const component = forecastM2HumanAnchoredTsbComponents(
          item.row,
          {
            learnedGlobalPositive:
              item.learned.positivePointEstimate,
            reversalRate: item.reversalRate,
            parameters
          }
        );
        accumulateSelectionScore(
          bucket,
          Number(item.row.actual),
          component.blendNetPointEstimate,
          candidateConfig.evaluation.businessLoss
        );
      }
      bucket.origins.add(innerOrigin);
    }
  }
  const eligible = [...byGrid.values()].filter(
    (value) => (
      value.origins.size >= minimumOrigins
      && value.rowCount > 0
      && value.actualDenominator > 0
    )
  );
  if (eligible.length === 0) {
    return Object.freeze({
      status: "lambda_zero_fallback_insufficient_inner_origin_evidence",
      parameters: fallbackParameters(grid),
      innerEvidenceOriginCount: 0,
      objective: null
    });
  }
  const scored = eligible.map((value) => ({
    ...value,
    point: Object.freeze({
      caseCount: value.rowCount,
      wape: value.absoluteError / value.actualDenominator,
      signedBias: value.signedError / value.actualDenominator,
      zeroImputationUsed: false
    }),
    businessLoss: value.businessLossTotal / value.rowCount
  })).sort(compareSelectionObjective);
  const winner = scored[0];
  return Object.freeze({
    status: "selected_by_inner_earlier_origin_folds",
    parameters: winner.parameters,
    innerEvidenceOriginCount: winner.origins.size,
    objective: Object.freeze({
      businessLoss: winner.businessLoss,
      wape: winner.point.wape,
      signedBias: winner.point.signedBias
    })
  });
}

function fitM2HumanAnchoredTsbState(
  training,
  baseConfig,
  candidateConfig,
  parameters
) {
  const learnedFit = learnM2HumanAnchoredParameters(training, baseConfig);
  const reversalState = fitM2HumanAnchoredReversal(training, baseConfig);
  const prepared = training.map((row) => {
    const learned = forecastM2HumanAnchoredBase(
      row,
      learnedFit.parameters
    );
    const reversalRate = predictM2HumanAnchoredReversalRate(
      row,
      reversalState
    );
    const component = forecastM2HumanAnchoredTsbComponents(row, {
      learnedGlobalPositive: learned.positivePointEstimate,
      reversalRate,
      parameters
    });
    return { row, component };
  });
  const candidateResiduals = buildM2HumanAnchoredResidualPools(
    prepared.map(({ row, component }) => ({
      ...row,
      pointEstimate: component.blendNetPointEstimate
    }))
  );
  const fallbackResiduals = buildM2HumanAnchoredResidualPools(
    prepared.map(({ row, component }) => ({
      ...row,
      pointEstimate: component.learnedGlobalNetPointEstimate
    }))
  );
  return Object.freeze({
    schema: "m2.current.human_anchored_tsb_model_state.v0.1",
    candidateId: CANDIDATE_ID,
    parameters,
    learnedGlobalParameters: learnedFit.parameters,
    learnedGlobalParameterFit: learnedFit,
    reversalState,
    candidateResiduals,
    fallbackResiduals,
    trainingRowCount: training.length,
    trainingWorkCount: new Set(
      training.map((row) => String(row.standardWorkId))
    ).size,
    maximumLabelAvailableAsOf:
      training.map((row) => String(row.labelAvailableAsOf))
        .sort().at(-1),
    fourExpertLayerEnabled: false,
    hierarchyLayerEnabled: false
  });
}

function predictM2HumanAnchoredTsb(
  row,
  state,
  baseConfig,
  candidateConfig
) {
  const manual = forecastM2HumanAnchoredBase(
    row,
    baseConfig.humanPrior,
    { faithful: true }
  );
  const learned = forecastM2HumanAnchoredBase(
    row,
    state.learnedGlobalParameters
  );
  const reversalRate = predictM2HumanAnchoredReversalRate(
    row,
    state.reversalState
  );
  const component = forecastM2HumanAnchoredTsbComponents(row, {
    learnedGlobalPositive: learned.positivePointEstimate,
    reversalRate,
    parameters: state.parameters
  });
  const baseline = forecastM2CurrentBaselines(
    requireMonthlyHistory(row).positiveSeries,
    row.horizonMonths
  ).TSB.pointEstimate;
  const baselineNet = baseline * (1 - reversalRate);
  const manualNet = manual.positivePointEstimate * (1 - reversalRate);
  const candidateQuantiles = calibrateM2HumanAnchoredQuantiles(
    component.blendNetPointEstimate,
    row,
    state.candidateResiduals,
    candidateConfig.evaluation.quantileProbabilities
  );
  const fallbackQuantiles = calibrateM2HumanAnchoredQuantiles(
    component.learnedGlobalNetPointEstimate,
    row,
    state.fallbackResiduals,
    candidateConfig.evaluation.quantileProbabilities
  );
  const workProfile = (
    learned.top2TrailingRevenueShare
    >= Number(baseConfig.humanPrior.dominantTopTwoBoundary)
  ) ? "platform_dominant" : "ordinary_work";
  return Object.freeze({
    manualFaithfulPointEstimate: manualNet,
    learnedGlobalPointEstimate: learned.positivePointEstimate,
    learnedGlobalCommonReversalPointEstimate:
      component.learnedGlobalNetPointEstimate,
    independentTsbBaselinePointEstimate: baselineNet,
    rawTsbPointEstimate: component.rawTsbNetPointEstimate,
    blendCandidatePointEstimate: component.blendNetPointEstimate,
    rawTsbPositivePointEstimate:
      component.rawTsbPositivePointEstimate,
    rawTsbReversalPointEstimate:
      component.rawTsbReversalPointEstimate,
    blendPositivePointEstimate:
      component.blendPositivePointEstimate,
    blendReversalPointEstimate:
      component.blendReversalPointEstimate,
    tsbMonthlyOccurrenceProbability:
      component.monthlyOccurrenceProbability,
    occurrenceProbability:
      component.horizonOccurrenceProbability,
    tsbPositiveAmountLevel: component.positiveAmountLevel,
    tsbConditionalPositiveAmount:
      component.conditionalPositiveAmount,
    reversalRate,
    candidateQuantiles,
    fallbackQuantiles,
    quantiles: candidateQuantiles,
    pointEstimate: component.blendNetPointEstimate,
    workProfile,
    selectedTsbParameters: state.parameters,
    selectedPointLayer: "pre_fallback_selected_blend",
    fourExpertLayerEnabled: false,
    learnedBase: learned
  });
}

function scoreComponents(rows) {
  let brier = 0;
  let logLoss = 0;
  for (const row of rows) {
    const actual = Number(Number(row.actualPositive) > 0);
    const probability = clamp(
      Number(row.occurrenceProbability),
      1e-12,
      1 - 1e-12
    );
    brier += (probability - actual) ** 2;
    logLoss -= (
      actual * Math.log(probability)
      + (1 - actual) * Math.log(1 - probability)
    );
  }
  const positiveRows = rows.filter(
    (row) => Number(row.actualPositive) > 0
  );
  const reversalRows = rows.filter(
    (row) => Number(row.actualReversal) > 0
  );
  return Object.freeze({
    occurrence: Object.freeze({
      caseCount: rows.length,
      observedPositiveCaseCount: positiveRows.length,
      observedRate: positiveRows.length / rows.length,
      brier: brier / rows.length,
      logLoss: logLoss / rows.length
    }),
    positiveAmountConditional: scoreComponentRows(
      positiveRows,
      "actualPositive",
      "tsbConditionalPositiveAmount"
    ),
    reversal: scoreComponentRows(
      reversalRows,
      "actualReversal",
      "blendReversalPointEstimate"
    )
  });
}

function scoreComponentRows(rows, actualField, pointField) {
  if (rows.length === 0) {
    return Object.freeze({
      caseCount: 0,
      wape: null,
      signedBias: null,
      mae: null
    });
  }
  const normalized = rows.map((row) => ({
    actual: finite(row?.[actualField], actualField),
    pointEstimate: finite(row?.[pointField], pointField)
  }));
  const point = scoreM2CurrentEvaluationRows(normalized);
  return Object.freeze({
    caseCount: point.caseCount,
    wape: point.wape,
    signedBias: point.signedBias,
    mae: point.mae
  });
}

function evaluateDevelopmentGates({
  primaryRows,
  primaryMetrics,
  strictMetrics,
  bootstrap,
  timeBlockAudit,
  candidateConfig
}) {
  const gates = candidateConfig.developmentAcceptance;
  const fallback = primaryMetrics.comparators
    .learnedGlobalCommonReversal;
  const raw = primaryMetrics.comparators.rawTsbCandidate;
  const candidate = primaryMetrics.point;
  const fallbackLossRows = primaryRows.map((row) => ({
    ...row,
    pointEstimate: row.learnedGlobalCommonReversalPointEstimate
  }));
  const fallbackLoss = scoreM2CurrentBusinessLoss(
    fallbackLossRows,
    candidateConfig.evaluation.businessLoss
  );
  const intermittentCandidate =
    primaryMetrics.bySegment.intermittent ?? null;
  const intermittentFallback = scoreSliceField(
    primaryRows,
    "segment",
    "intermittent",
    "learnedGlobalCommonReversalPointEstimate"
  );
  const activeCandidate = primaryMetrics.bySegment.active ?? null;
  const activeFallback = scoreSliceField(
    primaryRows,
    "segment",
    "active",
    "learnedGlobalCommonReversalPointEstimate"
  );
  const dormantCandidate = primaryMetrics.bySegment.dormant ?? null;
  const dormantPositiveActual = primaryRows.filter(
    (row) => row.segment === "dormant" && Number(row.actualPositive) > 0
  );
  const dormantRecall = dormantPositiveActual.length === 0
    ? 0
    : dormantPositiveActual.filter(
      (row) => Number(row.blendPositivePointEstimate) > 0
    ).length / dormantPositiveActual.length;
  const positiveBlocks = timeBlockAudit.blocks.filter(
    (block) => block.candidateRelativeWape < 0
  ).length;
  return {
    rawCandidateFvaStrictlyPositive:
      fallback.wape - raw.wape > 0,
    blendCandidateFvaStrictlyPositive:
      fallback.wape - candidate.wape > 0,
    overallWapeImproved: candidate.wape < fallback.wape,
    overallBusinessLossImproved:
      primaryMetrics.businessLoss < fallbackLoss,
    strictAuxiliaryWapeImproved:
      strictMetrics.point.wape
      < strictMetrics.comparators.learnedGlobalCommonReversal.wape,
    biasNotMateriallyWorse:
      Math.abs(candidate.signedBias)
      <= Math.abs(fallback.signedBias)
        + Number(gates.maximumAbsoluteBiasDeterioration),
    intermittentMateriallyImproved:
      intermittentCandidate !== null
      && intermittentFallback !== null
      && intermittentCandidate.wape / intermittentFallback.wape - 1
        <= -Number(gates.minimumIntermittentRelativeWapeImprovement),
    activeNotUnacceptablyDegraded:
      activeCandidate !== null
      && activeFallback !== null
      && activeCandidate.wape / activeFallback.wape - 1
        <= Number(gates.maximumActiveRelativeWapeDegradation),
    dormantSystematicMissGuardPassed:
      dormantCandidate !== null
      && dormantCandidate.signedBias
        >= Number(gates.dormantSystematicMissGuard.minimumSignedBias)
      && dormantRecall > 0,
    workClusterBootstrapStable:
      bootstrap.relativeWapeToManual95.upper
      < Number(gates.workClusterBootstrapMaximumUpper95),
    enoughTimeBlocks:
      timeBlockAudit.independentTimeBlockCount
      >= Number(gates.timeBlockSensitivity.minimumEvaluatedBlockCount),
    timeBlockMajorityImproved:
      positiveBlocks / timeBlockAudit.independentTimeBlockCount
      >= Number(
        gates.timeBlockSensitivity.minimumPositiveImprovementBlockShare
      ),
    improvementNotSingleBlockOnly: positiveBlocks >= 2,
    lambdaZeroFallbackRecoverable: primaryRows.every((row) => (
      Number.isFinite(
        Number(row.learnedGlobalCommonReversalPointEstimate)
      )
      && row.fallbackQuantiles !== null
    ))
  };
}

function buildTimeBlockAudit(rows, candidateConfig) {
  const origins = [...new Set(rows.map(
    (row) => requireMonth(row.outerOrigin ?? row.origin, "outer_origin")
  ))].sort();
  const groups = [];
  for (const origin of origins) {
    const previous = groups.at(-1);
    const previousOrigin = previous?.origins.at(-1);
    if (
      previousOrigin !== undefined
      && monthOrdinal(origin) - monthOrdinal(previousOrigin) === 1
    ) {
      previous.origins.push(origin);
    } else {
      groups.push({ origins: [origin] });
    }
  }
  const blocks = groups.map(({ origins: blockOrigins }, index) => {
    const originSet = new Set(blockOrigins);
    const blockRows = rows.filter((row) => originSet.has(
      row.outerOrigin ?? row.origin
    ));
    const candidate = scoreField(
      blockRows,
      "blendCandidatePointEstimate"
    );
    const comparator = scoreField(
      blockRows,
      "learnedGlobalCommonReversalPointEstimate"
    );
    return Object.freeze({
      blockId: `tsb_time_block_${String(index + 1).padStart(2, "0")}`,
      startsAt: blockOrigins[0],
      endsAt: blockOrigins.at(-1),
      originCount: blockOrigins.length,
      caseCount: blockRows.length,
      comparatorWape: comparator.wape,
      candidateWape: candidate.wape,
      candidateRelativeWape: candidate.wape / comparator.wape - 1,
      candidateFva: fva(comparator, candidate)
    });
  });
  return Object.freeze({
    schema: "m2.current.human_anchored_tsb_time_block_audit.v0.1",
    method: candidateConfig.evaluation.timeBlockSensitivity.method,
    independentTimeBlockCount: blocks.length,
    evaluatedOriginCount: origins.length,
    caseCount: rows.length,
    adjacentCalendarOriginsCountAsOneBlock: true,
    workOrCaseCountCannotSubstituteForTimeBlockCount: true,
    blocks: Object.freeze(blocks)
  });
}

function scoreField(rows, field) {
  return scoreM2CurrentEvaluationRows(rows.map((row) => ({
    actual: row.actual,
    pointEstimate: finite(row?.[field], field)
  })));
}

function scoreSlices(rows, sliceField, pointField) {
  const keys = [...new Set(rows.map((row) => String(row?.[sliceField] ?? "")))]
    .filter(Boolean).sort();
  return Object.freeze(Object.fromEntries(keys.map((key) => [
    key,
    scoreSliceField(rows, sliceField, key, pointField)
  ])));
}

function scoreSliceField(rows, sliceField, key, pointField) {
  const selected = rows.filter(
    (row) => String(row?.[sliceField] ?? "") === key
  );
  if (
    selected.length === 0
    || selected.reduce(
      (total, row) => total + Math.abs(Number(row.actual)),
      0
    ) === 0
  ) {
    return null;
  }
  return scoreField(selected, pointField);
}

function fva(comparator, candidate) {
  return Object.freeze({
    comparatorWape: comparator.wape,
    candidateWape: candidate.wape,
    valueAdded: comparator.wape - candidate.wape,
    relativeWape: candidate.wape / comparator.wape - 1
  });
}

function accumulateSelectionScore(bucket, actual, pointEstimate, policy) {
  const point = finite(pointEstimate, "inner_point_estimate");
  const truth = finite(actual, "inner_actual");
  const error = point - truth;
  bucket.absoluteError += Math.abs(error);
  bucket.signedError += error;
  bucket.actualDenominator += Math.abs(truth);
  bucket.businessLossTotal += error < 0
    ? Number(policy.underForecastWeight) * -error
    : Number(policy.overForecastWeight) * error;
  bucket.rowCount += 1;
}

function compareSelectionObjective(left, right) {
  return (
    left.businessLoss - right.businessLoss
    || left.point.wape - right.point.wape
    || Math.abs(left.point.signedBias)
      - Math.abs(right.point.signedBias)
    || left.parameters.lambda - right.parameters.lambda
    || left.parameters.occurrenceSmoothing
      - right.parameters.occurrenceSmoothing
    || left.parameters.positiveAmountSmoothing
      - right.parameters.positiveAmountSmoothing
  );
}

function fallbackParameters(grid) {
  return grid.filter((value) => value.lambda === 0).sort(
    (left, right) => (
      left.occurrenceSmoothing - right.occurrenceSmoothing
      || left.positiveAmountSmoothing - right.positiveAmountSmoothing
    )
  )[0];
}

function choiceId(value) {
  return [
    value.occurrenceSmoothing,
    value.positiveAmountSmoothing,
    value.lambda
  ].join("|");
}

function requireMonthlyHistory(row) {
  const history = requireObject(
    row?.salesShareMonthlyHistory,
    "sales_share_monthly_history"
  );
  const positiveSeries = finiteSeries(
    history.positiveSeries,
    "positive_series"
  );
  const reversalSeries = finiteSeries(
    history.reversalSeries,
    "reversal_series"
  );
  if (
    positiveSeries.length === 0
    || positiveSeries.length !== reversalSeries.length
    || positiveSeries.some((value) => value < 0)
    || reversalSeries.some((value) => value < 0)
  ) {
    throw new Error("m2_human_anchored_tsb_monthly_history_invalid");
  }
  const startsAt = requireMonth(history.startsAt, "history_starts_at");
  const through = requireMonth(history.through, "history_through");
  if (
    through !== requireMonth(row?.origin, "row_origin")
    || monthOrdinal(through) - monthOrdinal(startsAt) + 1
      !== positiveSeries.length
    || history.observedZeroMonthsIncluded !== true
    || history.unobservedMonthsZeroFilled !== false
  ) {
    throw new Error("m2_human_anchored_tsb_history_boundary_invalid");
  }
  return Object.freeze({
    startsAt,
    through,
    positiveSeries,
    reversalSeries
  });
}

function smoothingGrid(values, name) {
  const output = finiteSeries(values, name);
  if (
    output.length === 0
    || output.some((value) => value <= 0 || value > 1)
    || new Set(output).size !== output.length
  ) {
    throw new Error(`m2_human_anchored_tsb_${name}_invalid`);
  }
  return output.sort((a, b) => a - b);
}

function fractionGrid(values, name) {
  const output = finiteSeries(values, name);
  if (
    output.length === 0
    || output.some((value) => value < 0 || value > 1)
    || new Set(output).size !== output.length
  ) {
    throw new Error(`m2_human_anchored_tsb_${name}_invalid`);
  }
  return output.sort((a, b) => a - b);
}

function finiteSeries(values, name) {
  if (!Array.isArray(values)) {
    throw new Error(`m2_human_anchored_tsb_${name}_required`);
  }
  return values.map((value) => finite(value, name));
}

function requireRows(rows, name) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`m2_human_anchored_tsb_${name}_required`);
  }
  return rows;
}

function requireObject(value, name) {
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
  ) {
    throw new Error(`m2_human_anchored_tsb_${name}_required`);
  }
  return value;
}

function requireMonth(value, name) {
  const text = String(value ?? "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/u.test(text)) {
    throw new Error(`m2_human_anchored_tsb_${name}_invalid`);
  }
  return text;
}

function monthOrdinal(month) {
  const [year, number] = requireMonth(month, "month_ordinal")
    .split("-").map(Number);
  return year * 12 + number - 1;
}

function compareCaseRows(left, right) {
  return (
    String(left.standardWorkId).localeCompare(
      String(right.standardWorkId)
    )
    || String(left.origin).localeCompare(String(right.origin))
    || Number(left.horizonMonths) - Number(right.horizonMonths)
  );
}

function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`m2_human_anchored_tsb_${name}_invalid`);
  }
  return number;
}

function nonnegative(value, name) {
  const number = finite(value, name);
  if (number < 0) {
    throw new Error(`m2_human_anchored_tsb_${name}_invalid`);
  }
  return number;
}

function fraction(value, name) {
  const number = finite(value, name);
  if (number < 0 || number > 1) {
    throw new Error(`m2_human_anchored_tsb_${name}_invalid`);
  }
  return number;
}

function finite(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`m2_human_anchored_tsb_${name}_invalid`);
  }
  return number;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
