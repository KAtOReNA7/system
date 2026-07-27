import {
  deterministicWorkFold,
  fitM2HumanAnchoredReversal,
  forecastM2HumanAnchoredBase,
  learnM2HumanAnchoredParameters,
  predictM2HumanAnchoredReversalRate
} from "./humanAnchored.js";
import { buildM2CurrentChannelUid } from "./channelMaster.js";
import { scoreM2CurrentPointRows } from "./metrics.js";

export const M2_CHANNEL_EXPERT_ABLATIONS = Object.freeze([
  "A0",
  "A1",
  "A2",
  "A3",
  "A4",
  "A5",
  "A6"
]);

export const M2_CHANNEL_MECHANISM_EXPERTS = Object.freeze([
  "membership",
  "advertising",
  "transactional"
]);

export function buildM2ChannelPlatformIndex(config) {
  const platforms = requireArray(config?.platformModels, "platform_models");
  const byUid = new Map();
  const byId = new Map();
  for (const platform of platforms) {
    const platformId = nonempty(platform?.platformId, "platform_id");
    const channelUid = buildM2CurrentChannelUid(
      nonempty(platform?.canonicalChannelName, "canonical_channel_name")
    );
    if (byUid.has(channelUid) || byId.has(platformId)) {
      throw new Error("m2_channel_expert_platform_duplicate");
    }
    const record = Object.freeze({ platformId, channelUid });
    byUid.set(channelUid, record);
    byId.set(platformId, record);
  }
  return Object.freeze({ byUid, byId });
}

export function decomposeM2LearnedGlobalByChannel(
  row,
  parameters,
  config
) {
  const base = forecastM2HumanAnchoredBase(row, parameters);
  const platformIndex = buildM2ChannelPlatformIndex(config);
  const historyByUid = new Map(
    requireArray(row?.canonicalChannels, "canonical_channels").map(
      (channel) => [String(channel.channelUid), channel]
    )
  );
  const category = categoryFor(row, config);
  const components = base.channelComponents.map((component) => {
    const channelUid = String(component.channelUid);
    const history = historyByUid.get(channelUid);
    if (!history) {
      throw new Error("m2_channel_expert_history_component_missing");
    }
    const platform = platformIndex.byUid.get(channelUid);
    const mechanism = mechanismFor(component.revenueMode, config);
    const basePositivePointEstimate = (
      Number(component.forecast36) * Number(base.horizonScale)
    );
    const rawFactor = mechanismRawFactor(mechanism, history);
    return Object.freeze({
      channelUid,
      platformId: platform?.platformId ?? "other_platform",
      isNamedPlatform: platform !== undefined,
      mechanism,
      revenueMode: String(component.revenueMode),
      category,
      basePositivePointEstimate,
      rawExpertPositivePointEstimate:
        basePositivePointEstimate * rawFactor,
      rawFactor,
      trailingAnnualPositive: finite(
        history.trailingAnnualPositive,
        "trailing_annual_positive"
      ),
      recent3AnnualPositive: finite(
        history.recent3AnnualPositive,
        "recent3_annual_positive"
      ),
      monthsSinceLastPositive: nonnegative(
        history.monthsSinceLastPositive,
        "months_since_last_positive"
      ),
      peerTrendRatio: nonnegative(
        history.peerTrendRatio,
        "peer_trend_ratio"
      ),
      observedAtOrigin: true
    });
  });
  const recomposed = sum(
    components.map((item) => item.basePositivePointEstimate)
  );
  if (!nearlyEqual(recomposed, base.positivePointEstimate)) {
    throw new Error("m2_channel_expert_decomposition_not_conserved");
  }
  return Object.freeze({
    learnedGlobalPositivePointEstimate: base.positivePointEstimate,
    recomposedPositivePointEstimate: recomposed,
    components: Object.freeze(components)
  });
}

export function fitM2ChannelExpertModel(rows, baseConfig, config) {
  const source = requireRows(rows, "training_rows");
  const training = requireObject(config?.training, "training");
  const minimum = positiveInteger(
    training.minimumStrictTrainingRows,
    "minimum_training_rows"
  );
  if (source.length < minimum) {
    throw new Error("m2_channel_expert_training_rows_insufficient");
  }
  const selection = selectShrinkageStrength(source, baseConfig, config);
  const state = fitCoreState(
    source,
    baseConfig,
    config,
    selection.selectedPriorStrength
  );
  return Object.freeze({
    schema: "m2.current.channel_expert_model_state.v0.1",
    candidateId: String(config.candidateId),
    ...state,
    selection,
    maximumLabelAvailableAsOf:
      source.map((row) => String(row.labelAvailableAsOf)).sort().at(-1),
    trainingRowCount: source.length,
    trainingWorkCount: uniqueWorkCount(source),
    exactV03UsedForSelection: false,
    laterOriginUsed: false,
    finalHoldoutUsed: false
  });
}

export function predictM2ChannelExperts(row, state, baseConfig, config) {
  void baseConfig;
  verifyWorkChannelConservation(row);
  const decomposition = decomposeM2LearnedGlobalByChannel(
    row,
    state.baselineParameters,
    config
  );
  const labels = labelMap(row);
  const reversalRate = predictM2HumanAnchoredReversalRate(
    row,
    state.reversalState
  );
  const channelRows = decomposition.components.map((component) => {
    const label = labels.get(component.channelUid) ?? zeroLabel(component);
    const points = channelAblationPositivePoints(component, state, config);
    return Object.freeze({
      channelUid: component.channelUid,
      platformId: component.platformId,
      mechanism: component.mechanism,
      category: component.category,
      observedAtOrigin: true,
      actualPositive: Number(label.actualPositive),
      actualReversal: Number(label.actualReversal),
      actual: Number(label.actual),
      positivePoints: points,
      pointEstimates: applyReversal(points, reversalRate),
      fallback: fallbackTrace(component, state, config)
    });
  });
  for (const label of labels.values()) {
    if (
      label.observedAtOrigin === false
      && !channelRows.some((item) => item.channelUid === label.channelUid)
    ) {
      channelRows.push(Object.freeze({
        channelUid: String(label.channelUid),
        platformId: "future_first_seen_label_only",
        mechanism: "future_first_seen_label_only",
        category: "__label_only__",
        observedAtOrigin: false,
        actualPositive: Number(label.actualPositive),
        actualReversal: Number(label.actualReversal),
        actual: Number(label.actual),
        positivePoints: zeroAblations(),
        pointEstimates: zeroAblations(),
        fallback: Object.freeze({
          A3: "zero_prediction_future_identity_not_available_at_origin",
          A4: "zero_prediction_future_identity_not_available_at_origin",
          A5: "zero_prediction_future_identity_not_available_at_origin",
          A6: "zero_prediction_future_identity_not_available_at_origin"
        })
      }));
    }
  }
  channelRows.sort((left, right) => (
    left.channelUid.localeCompare(right.channelUid)
  ));
  const positivePoints = sumAblations(
    channelRows.map((item) => item.positivePoints)
  );
  const pointEstimates = sumAblations(
    channelRows.map((item) => item.pointEstimates)
  );
  if (!nearlyEqual(
    positivePoints.A0,
    decomposition.learnedGlobalPositivePointEstimate
  ) || !nearlyEqual(positivePoints.A0, positivePoints.A1)) {
    throw new Error("m2_channel_expert_A0_A1_conservation_failed");
  }
  return Object.freeze({
    ablationPositivePoints: positivePoints,
    ablationPoints: pointEstimates,
    pointEstimate: pointEstimates.A6,
    baselinePointEstimate: pointEstimates.A0,
    reversalRate,
    channelRows: Object.freeze(channelRows),
    learnedGlobalDecompositionConserved: true,
    selectedPriorStrength: state.selectedPriorStrength,
    trainingReadOwnWork: false
  });
}

export function crossFitM2ChannelExperts(rows, baseConfig, config) {
  const source = requireRows(rows, "cross_fit_rows");
  const foldCount = positiveInteger(
    config?.training?.crossWorkFoldCount,
    "cross_work_fold_count"
  );
  const output = [];
  const folds = [];
  for (let fold = 0; fold < foldCount; fold += 1) {
    const training = source.filter(
      (row) => deterministicWorkFold(row.standardWorkId, foldCount) !== fold
    );
    const validation = source.filter(
      (row) => deterministicWorkFold(row.standardWorkId, foldCount) === fold
    );
    if (training.length === 0 || validation.length === 0) {
      throw new Error("m2_channel_expert_cross_work_fold_empty");
    }
    const state = fitM2ChannelExpertModel(training, baseConfig, config);
    for (const row of validation) {
      output.push(Object.freeze({
        ...row,
        ...predictM2ChannelExperts(row, state, baseConfig, config),
        evaluationFold: fold
      }));
    }
    folds.push(Object.freeze({
      fold,
      trainingRowCount: training.length,
      trainingWorkCount: uniqueWorkCount(training),
      validationRowCount: validation.length,
      validationWorkCount: uniqueWorkCount(validation),
      selectedPriorStrength: state.selectedPriorStrength,
      innerSelection: state.selection.candidates,
      platformModels: state.platformModels,
      maximumLabelAvailableAsOf: state.maximumLabelAvailableAsOf,
      outerValidationUsedForSelection: false
    }));
  }
  output.sort(compareRows);
  return Object.freeze({
    schema: "m2.current.channel_expert_cross_work.v0.1",
    rows: Object.freeze(output),
    folds: Object.freeze(folds),
    metrics: scoreM2ChannelExpertRows(output, config),
    independentLaterOrigin: false
  });
}

export function strictRollingM2ChannelExperts(rows, baseConfig, config) {
  const source = requireRows(rows, "strict_rolling_rows");
  const start = requireMonth(
    config?.training?.strictRollingStartsAt,
    "strict_rolling_starts_at"
  );
  const minimum = positiveInteger(
    config?.training?.minimumStrictTrainingRows,
    "minimum_strict_training_rows"
  );
  const origins = [...new Set(
    source.map((row) => requireMonth(row.origin, "origin"))
  )].sort().filter((origin) => origin >= start);
  const output = [];
  const audit = [];
  for (const outerOrigin of origins) {
    const training = source.filter((row) => (
      row.origin < outerOrigin
      && row.labelAvailableAsOf <= outerOrigin
    ));
    const validation = source.filter((row) => row.origin === outerOrigin);
    if (training.length < minimum || validation.length === 0) {
      audit.push(Object.freeze({
        outerOrigin,
        status: "insufficient_mature_earlier_rows",
        trainingRowCount: training.length,
        validationRowCount: validation.length
      }));
      continue;
    }
    const state = fitM2ChannelExpertModel(training, baseConfig, config);
    for (const row of validation) {
      output.push(Object.freeze({
        ...row,
        ...predictM2ChannelExperts(row, state, baseConfig, config),
        outerOrigin,
        maximumTrainingLabelAvailableAsOf:
          state.maximumLabelAvailableAsOf,
        sameOrLaterOuterTruthRead: false
      }));
    }
    audit.push(Object.freeze({
      outerOrigin,
      status: "evaluated",
      trainingRowCount: training.length,
      trainingWorkCount: uniqueWorkCount(training),
      validationRowCount: validation.length,
      selectedPriorStrength: state.selectedPriorStrength,
      platformModels: state.platformModels,
      maximumTrainingLabelAvailableAsOf:
        state.maximumLabelAvailableAsOf,
      sameOrLaterOuterTruthRead: false
    }));
  }
  if (output.length === 0) {
    throw new Error("m2_channel_expert_strict_rolling_output_empty");
  }
  output.sort(compareRows);
  return Object.freeze({
    schema: "m2.current.channel_expert_strict_rolling.v0.1",
    rows: Object.freeze(output),
    origins: Object.freeze(audit),
    metrics: scoreM2ChannelExpertRows(output, config),
    independentLaterOrigin: false
  });
}

export function scoreM2ChannelExpertRows(rows, config) {
  const source = requireRows(rows, "evaluation_rows");
  const ablations = Object.fromEntries(
    M2_CHANNEL_EXPERT_ABLATIONS.map((id) => [
      id,
      scoreM2CurrentPointRows(source.map((row) => ({
        actual: row.actual,
        pointEstimate: row.ablationPoints[id]
      })))
    ])
  );
  const relativeToA0 = Object.fromEntries(
    M2_CHANNEL_EXPERT_ABLATIONS.map((id) => [
      id,
      ablations[id].wape / ablations.A0.wape - 1
    ])
  );
  return Object.freeze({
    caseCount: source.length,
    workCount: uniqueWorkCount(source),
    ablations: Object.freeze(ablations),
    relativeWapeToA0: Object.freeze(relativeToA0),
    decompositionMaximumAbsoluteDifference: Math.max(
      ...source.map((row) => Math.abs(
        row.ablationPoints.A1 - row.ablationPoints.A0
      ))
    ),
    byMechanism: scoreChannelSlices(source, "mechanism"),
    byNamedPlatform: scoreChannelSlices(source, "platformId", {
      include: new Set(
        requireArray(config.platformModels, "platform_models").map(
          (value) => String(value.platformId)
        )
      )
    }),
    topRevenue: scoreTopRevenue(
      source,
      config?.evaluation?.topRevenueFractions
    )
  });
}

export function buildM2ChannelExpertsSyntheticDiagnostic(
  fixture,
  baseConfig,
  config
) {
  const source = buildSyntheticCases(fixture, config);
  const result = crossFitM2ChannelExperts(source, baseConfig, config);
  const platformIds = config.platformModels.map(
    (platform) => String(platform.platformId)
  );
  const platformCoverage = Object.fromEntries(platformIds.map((id) => [
    id,
    source.filter((row) => (
      row.workChannelLabels[0].platformId === id
    )).length
  ]));
  const fallbackCounts = {};
  for (const row of result.rows) {
    for (const channel of row.channelRows) {
      const key = channel.fallback.A6;
      fallbackCounts[key] = (fallbackCounts[key] ?? 0) + 1;
    }
  }
  if (
    Object.values(platformCoverage).some((count) => count === 0)
    || result.rows.some((row) => (
      !row.learnedGlobalDecompositionConserved
      || row.trainingReadOwnWork !== false
      || M2_CHANNEL_EXPERT_ABLATIONS.some(
        (id) => !Number.isFinite(row.ablationPoints[id])
      )
    ))
  ) {
    throw new Error("m2_channel_expert_synthetic_diagnostic_invalid");
  }
  return Object.freeze({
    schema: "m2.current.channel_experts_public_diagnostic.v0.1",
    candidateId: String(config.candidateId),
    fixtureSchema: String(fixture.schema),
    caseCount: source.length,
    workCount: uniqueWorkCount(source),
    ablations: M2_CHANNEL_EXPERT_ABLATIONS,
    mechanisms: M2_CHANNEL_MECHANISM_EXPERTS,
    platformCoverage: Object.freeze(platformCoverage),
    fallbackCounts: Object.freeze(fallbackCounts),
    evaluation: result.metrics,
    folds: result.folds,
    boundaries: Object.freeze({
      publicSyntheticOnly: true,
      privateArtifactRead: false,
      workChannelConservation: true,
      futureFirstSeenIdentityUsedAsFeature: false,
      exactV03Modified: false,
      productionLoaderModified: false,
      productionRouteModified: false,
      buyoutCashUsed: false,
      finalHoldoutUsed: false,
      providerUsed: false,
      databaseUsed: false,
      releaseAuthorized: false
    })
  });
}

function fitCoreState(rows, baseConfig, config, selectedPriorStrength) {
  const baselineFit = learnM2HumanAnchoredParameters(rows, baseConfig);
  const reversalState = fitM2HumanAnchoredReversal(rows, baseConfig);
  const observations = channelObservations(
    rows,
    baselineFit.parameters,
    config
  );
  const stats = fitGroupedStats(observations);
  const platformModels = platformModelAudit(stats, config);
  return {
    baselineParameters: baselineFit.parameters,
    reversalState,
    stats,
    platformModels,
    selectedPriorStrength
  };
}

function selectShrinkageStrength(rows, baseConfig, config) {
  const training = config.training;
  const foldCount = positiveInteger(
    training.innerSelectionFoldCount,
    "inner_selection_fold_count"
  );
  const validationFold = nonnegativeInteger(
    training.innerSelectionValidationFold,
    "inner_selection_validation_fold"
  );
  if (validationFold >= foldCount) {
    throw new Error("m2_channel_expert_inner_validation_fold_invalid");
  }
  const fitRows = rows.filter(
    (row) => deterministicWorkFold(
      `${row.standardWorkId}\u001fchannel-expert-inner`,
      foldCount
    )
      !== validationFold
  );
  const validationRows = rows.filter(
    (row) => deterministicWorkFold(
      `${row.standardWorkId}\u001fchannel-expert-inner`,
      foldCount
    )
      === validationFold
  );
  if (fitRows.length === 0 || validationRows.length === 0) {
    throw new Error("m2_channel_expert_inner_split_empty");
  }
  const baselineFit = learnM2HumanAnchoredParameters(fitRows, baseConfig);
  const reversalState = fitM2HumanAnchoredReversal(fitRows, baseConfig);
  const stats = fitGroupedStats(channelObservations(
    fitRows,
    baselineFit.parameters,
    config
  ));
  const strengths = requireArray(
    training.shrinkagePriorStrengthGrid,
    "shrinkage_prior_strength_grid"
  ).map((value) => positiveFinite(value, "shrinkage_prior_strength"));
  const candidates = strengths.map((strength) => {
    const state = {
      baselineParameters: baselineFit.parameters,
      reversalState,
      stats,
      platformModels: platformModelAudit(stats, config),
      selectedPriorStrength: strength
    };
    const predictions = validationRows.map((row) => ({
      actual: row.actual,
      pointEstimate: predictM2ChannelExperts(
        row,
        state,
        baseConfig,
        config
      ).ablationPoints.A6
    }));
    return Object.freeze({
      priorStrength: strength,
      metrics: Object.freeze(scoreM2CurrentPointRows(predictions))
    });
  }).sort((left, right) => (
    left.metrics.wape - right.metrics.wape
    || Math.abs(left.metrics.signedBias) - Math.abs(right.metrics.signedBias)
    || left.priorStrength - right.priorStrength
  ));
  return Object.freeze({
    design: "deterministic_inner_work_holdout_inside_outer_training",
    fitRowCount: fitRows.length,
    validationRowCount: validationRows.length,
    selectedPriorStrength: candidates[0].priorStrength,
    candidates: Object.freeze(candidates),
    outerValidationUsed: false,
    exactV03Used: false
  });
}

function channelObservations(rows, parameters, config) {
  const output = [];
  for (const row of rows) {
    verifyWorkChannelConservation(row);
    const labels = labelMap(row);
    const decomposition = decomposeM2LearnedGlobalByChannel(
      row,
      parameters,
      config
    );
    for (const component of decomposition.components) {
      const label = labels.get(component.channelUid) ?? zeroLabel(component);
      output.push({
        standardWorkId: String(row.standardWorkId),
        ...component,
        actualPositive: Number(label.actualPositive)
      });
    }
  }
  return output;
}

function fitGroupedStats(observations) {
  return Object.freeze({
    mechanism: aggregateStats(observations, (row) => row.mechanism),
    platform: aggregateStats(observations, (row) => (
      row.isNamedPlatform ? row.platformId : null
    )),
    platformMechanism: aggregateStats(observations, (row) => (
      row.isNamedPlatform ? platformMechanismKey(row) : null
    )),
    taxonomy: aggregateStats(observations, (row) => (
      row.isNamedPlatform ? taxonomyKey(row) : null
    ))
  });
}

function aggregateStats(rows, keyFunction) {
  const result = new Map();
  for (const row of rows) {
    const key = keyFunction(row);
    if (key === null) continue;
    const current = result.get(key) ?? {
      rowCount: 0,
      works: new Set(),
      rawPrediction: 0,
      actualPositive: 0
    };
    current.rowCount += 1;
    current.works.add(row.standardWorkId);
    current.rawPrediction += row.rawExpertPositivePointEstimate;
    current.actualPositive += row.actualPositive;
    result.set(key, current);
  }
  return new Map([...result].map(([key, value]) => [key, Object.freeze({
    rowCount: value.rowCount,
    workCount: value.works.size,
    rawPrediction: value.rawPrediction,
    actualPositive: value.actualPositive
  })]));
}

function channelAblationPositivePoints(component, state, config) {
  const stats = state.stats;
  const fixedStrength = median(
    config.training.shrinkagePriorStrengthGrid.map(Number)
  );
  const mechanismScale = scaleForNode(
    stats.mechanism.get(component.mechanism),
    1,
    fixedStrength,
    config,
    "node"
  );
  const platformScale = component.isNamedPlatform
    ? scaleForNode(
      stats.platform.get(component.platformId),
      mechanismScale,
      fixedStrength,
      config,
      "platform"
    )
    : mechanismScale;
  const platformMechanismScale = component.isNamedPlatform
    ? scaleForNode(
      stats.platformMechanism.get(platformMechanismKey(component)),
      platformScale,
      fixedStrength,
      config,
      "node"
    )
    : mechanismScale;
  const taxonomyStats = component.isNamedPlatform
    ? stats.taxonomy.get(taxonomyKey(component))
    : null;
  const taxonomySupported = supported(taxonomyStats, config, "node");
  const unshrunkTaxonomyScale = taxonomySupported
    ? rawScale(taxonomyStats, config)
    : platformMechanismScale;
  const selectedMechanismScale = scaleForNode(
    stats.mechanism.get(component.mechanism),
    1,
    state.selectedPriorStrength,
    config,
    "node"
  );
  const selectedPlatformScale = component.isNamedPlatform
    ? scaleForNode(
      stats.platform.get(component.platformId),
      selectedMechanismScale,
      state.selectedPriorStrength,
      config,
      "platform"
    )
    : selectedMechanismScale;
  const selectedPlatformMechanismScale = component.isNamedPlatform
    ? scaleForNode(
      stats.platformMechanism.get(platformMechanismKey(component)),
      selectedPlatformScale,
      state.selectedPriorStrength,
      config,
      "node"
    )
    : selectedMechanismScale;
  const selectedTaxonomyScale = component.isNamedPlatform
    ? scaleForNode(
      taxonomyStats,
      selectedPlatformMechanismScale,
      state.selectedPriorStrength,
      config,
      "node"
    )
    : selectedMechanismScale;
  return Object.freeze({
    A0: component.basePositivePointEstimate,
    A1: component.basePositivePointEstimate,
    A2: component.rawExpertPositivePointEstimate,
    A3: component.rawExpertPositivePointEstimate * mechanismScale,
    A4:
      component.rawExpertPositivePointEstimate * platformMechanismScale,
    A5:
      component.rawExpertPositivePointEstimate * unshrunkTaxonomyScale,
    A6: component.rawExpertPositivePointEstimate * selectedTaxonomyScale
  });
}

function fallbackTrace(component, state, config) {
  const stats = state.stats;
  const mechanismSupported = supported(
    stats.mechanism.get(component.mechanism),
    config,
    "node"
  );
  const platformSupported = component.isNamedPlatform && supported(
    stats.platform.get(component.platformId),
    config,
    "platform"
  );
  const platformMechanismSupported = component.isNamedPlatform && supported(
    stats.platformMechanism.get(platformMechanismKey(component)),
    config,
    "node"
  );
  const taxonomySupported = component.isNamedPlatform && supported(
    stats.taxonomy.get(taxonomyKey(component)),
    config,
    "node"
  );
  return Object.freeze({
    A3: mechanismSupported ? "mechanism" : "learnedGlobal",
    A4: platformMechanismSupported
      ? "platform_x_mechanism"
      : platformSupported
        ? "platform"
        : mechanismSupported ? "mechanism" : "learnedGlobal",
    A5: taxonomySupported
      ? "platform_x_mechanism_x_intrinsic_category"
      : platformMechanismSupported
        ? "platform_x_mechanism"
        : platformSupported
          ? "platform"
          : mechanismSupported ? "mechanism" : "learnedGlobal",
    A6: taxonomySupported
      ? "hierarchically_shrunk_taxonomy"
      : platformMechanismSupported
        ? "hierarchically_shrunk_platform_x_mechanism"
        : platformSupported
          ? "hierarchically_shrunk_platform"
          : mechanismSupported
            ? "hierarchically_shrunk_mechanism"
            : "learnedGlobal"
  });
}

function platformModelAudit(stats, config) {
  return Object.freeze(Object.fromEntries(
    config.platformModels.map((platform) => {
      const id = String(platform.platformId);
      const value = stats.platform.get(id);
      return [id, Object.freeze({
        status: supported(value, config, "platform")
          ? "fitted_with_hierarchical_pooling"
          : "sparse_fallback_to_mechanism_or_learnedGlobal",
        trainingRowCount: value?.rowCount ?? 0,
        trainingWorkCount: value?.workCount ?? 0
      })];
    })
  ));
}

function scaleForNode(stats, parentScale, strength, config, kind) {
  if (!supported(stats, config, kind)) return parentScale;
  const meanPrediction = stats.rawPrediction / Math.max(1, stats.rowCount);
  const priorExposure = strength * Math.max(meanPrediction, 1e-9);
  const scale = (
    stats.actualPositive + priorExposure * parentScale
  ) / (stats.rawPrediction + priorExposure);
  return clampScale(scale, config);
}

function rawScale(stats, config) {
  if (!stats || stats.rawPrediction <= 0) return 1;
  return clampScale(stats.actualPositive / stats.rawPrediction, config);
}

function supported(stats, config, kind) {
  if (!stats) return false;
  const rowMinimum = kind === "platform"
    ? Number(config.training.minimumPlatformRows)
    : Number(config.training.minimumNodeRows);
  const workMinimum = kind === "platform"
    ? Number(config.training.minimumPlatformWorks)
    : Number(config.training.minimumNodeWorks);
  return stats.rowCount >= rowMinimum && stats.workCount >= workMinimum;
}

function clampScale(value, config) {
  return Math.min(
    Number(config.training.scaleMaximum),
    Math.max(Number(config.training.scaleMinimum), value)
  );
}

function mechanismRawFactor(mechanism, history) {
  if (mechanism === "membership") {
    const trailing = Math.max(0, Number(history.trailingAnnualPositive));
    const recent = Math.max(0, Number(history.recent3AnnualPositive));
    const ratio = trailing > 0 ? recent / trailing : 1;
    return clamp(0.75 + 0.25 * ratio, 0.25, 2);
  }
  if (mechanism === "advertising") {
    return clamp(
      Math.sqrt(Math.max(0, Number(history.peerTrendRatio))),
      0.25,
      2
    );
  }
  if (mechanism === "transactional") {
    return clamp(
      Math.exp(-Math.max(0, Number(history.monthsSinceLastPositive)) / 12),
      0.1,
      1
    );
  }
  return 1;
}

function mechanismFor(revenueMode, config) {
  const mode = String(revenueMode);
  for (const expert of config.mechanismExperts) {
    if (expert.revenueModes.map(String).includes(mode)) {
      return String(expert.expertId);
    }
  }
  return "learnedGlobal";
}

function categoryFor(row, config) {
  const field = String(config.platformTaxonomy.categoryFeature);
  const value = String(row?.[field] ?? "").trim();
  return value || String(config.platformTaxonomy.unknownCategoryToken);
}

function platformMechanismKey(row) {
  return `${row.platformId}\u001f${row.mechanism}`;
}

function taxonomyKey(row) {
  return `${platformMechanismKey(row)}\u001f${row.category}`;
}

function labelMap(row) {
  return new Map(
    requireArray(row?.workChannelLabels, "work_channel_labels").map(
      (label) => [String(label.channelUid), label]
    )
  );
}

function verifyWorkChannelConservation(row) {
  const labels = requireArray(
    row?.workChannelLabels,
    "work_channel_labels"
  );
  const positive = sum(labels.map((label) => finite(
    label.actualPositive,
    "channel_actual_positive"
  )));
  const reversal = sum(labels.map((label) => finite(
    label.actualReversal,
    "channel_actual_reversal"
  )));
  const net = sum(labels.map((label) => finite(
    label.actual,
    "channel_actual"
  )));
  if (
    !nearlyEqual(positive, Number(row.actualPositive))
    || !nearlyEqual(reversal, Number(row.actualReversal))
    || !nearlyEqual(net, Number(row.actual))
    || labels.some((label) => (
      !nearlyEqual(
        Number(label.actual),
        Number(label.actualPositive) - Number(label.actualReversal)
      )
    ))
  ) {
    throw new Error("m2_channel_expert_work_channel_label_not_conserved");
  }
}

function zeroLabel(component) {
  return Object.freeze({
    channelUid: component.channelUid,
    observedAtOrigin: true,
    actualPositive: 0,
    actualReversal: 0,
    actual: 0
  });
}

function applyReversal(points, reversalRate) {
  return Object.freeze(Object.fromEntries(
    M2_CHANNEL_EXPERT_ABLATIONS.map((id) => [
      id,
      points[id] * (1 - reversalRate)
    ])
  ));
}

function zeroAblations() {
  return Object.freeze(Object.fromEntries(
    M2_CHANNEL_EXPERT_ABLATIONS.map((id) => [id, 0])
  ));
}

function sumAblations(values) {
  return Object.freeze(Object.fromEntries(
    M2_CHANNEL_EXPERT_ABLATIONS.map((id) => [
      id,
      sum(values.map((value) => Number(value[id])))
    ])
  ));
}

function scoreChannelSlices(rows, field, { include = null } = {}) {
  const channelRows = rows.flatMap((row) => row.channelRows);
  const keys = [...new Set(channelRows.map((row) => String(row[field])))]
    .filter((key) => include === null || include.has(key))
    .sort();
  return Object.freeze(Object.fromEntries(keys.map((key) => {
    const selected = channelRows.filter(
      (row) => String(row[field]) === key
    );
    const actualDenominator = sum(
      selected.map((row) => Math.abs(Number(row.actual)))
    );
    if (actualDenominator === 0) {
      return [key, Object.freeze({
        channelCaseCount: selected.length,
        metricsAvailable: false
      })];
    }
    return [key, Object.freeze({
      channelCaseCount: selected.length,
      metricsAvailable: true,
      ablations: Object.freeze(Object.fromEntries(
        M2_CHANNEL_EXPERT_ABLATIONS.map((id) => [
          id,
          scoreM2CurrentPointRows(selected.map((row) => ({
            actual: row.actual,
            pointEstimate: row.pointEstimates[id]
          })))
        ])
      ))
    })];
  })));
}

function scoreTopRevenue(rows, fractions) {
  const grouped = new Map();
  for (const row of rows) {
    const key = String(row.standardWorkId);
    const value = grouped.get(key) ?? {
      standardWorkId: key,
      actual: 0,
      points: Object.fromEntries(
        M2_CHANNEL_EXPERT_ABLATIONS.map((id) => [id, 0])
      )
    };
    value.actual += Number(row.actual);
    for (const id of M2_CHANNEL_EXPERT_ABLATIONS) {
      value.points[id] += Number(row.ablationPoints[id]);
    }
    grouped.set(key, value);
  }
  const ordered = [...grouped.values()].sort((left, right) => (
    Math.abs(right.actual) - Math.abs(left.actual)
    || left.standardWorkId.localeCompare(right.standardWorkId)
  ));
  return Object.freeze(Object.fromEntries(
    requireArray(fractions, "top_revenue_fractions").map((raw) => {
      const fraction = fractionValue(raw, "top_revenue_fraction");
      const count = Math.max(1, Math.ceil(ordered.length * fraction));
      const selected = ordered.slice(0, count);
      return [String(fraction), Object.freeze({
        fraction,
        workCount: count,
        ablations: Object.freeze(Object.fromEntries(
          M2_CHANNEL_EXPERT_ABLATIONS.map((id) => [
            id,
            scoreM2CurrentPointRows(selected.map((row) => ({
              actual: row.actual,
              pointEstimate: row.points[id]
            })))
          ])
        ))
      })];
    })
  ));
}

function buildSyntheticCases(fixture, config) {
  if (
    fixture?.schema
      !== "m2.current.channel_experts_synthetic_fixture.v0.1"
  ) {
    throw new Error("m2_channel_expert_synthetic_fixture_invalid");
  }
  const origin = requireMonth(fixture.origin, "synthetic_origin");
  const horizon = positiveInteger(
    fixture.horizonMonths,
    "synthetic_horizon"
  );
  const replications = positiveInteger(
    fixture.replicationsPerPlatformMechanism,
    "synthetic_replications"
  );
  const positiveSeries = requireArray(
    fixture.historyPositiveSeries,
    "synthetic_positive_series"
  ).map(Number);
  const reversalSeries = requireArray(
    fixture.historyReversalSeries,
    "synthetic_reversal_series"
  ).map(Number);
  const categories = requireArray(
    fixture.categories,
    "synthetic_categories"
  ).map(String);
  const rows = [];
  for (const platform of config.platformModels) {
    const channelUid = buildM2CurrentChannelUid(
      platform.canonicalChannelName
    );
    for (const expert of config.mechanismExperts) {
      const revenueMode = String(expert.revenueModes[0]);
      for (let index = 0; index < replications; index += 1) {
        const scale = 0.7 + (index % 7) * 0.1;
        const historyPositive = positiveSeries.map(
          (value) => value * scale
        );
        const historyReversal = reversalSeries.map(
          (value) => value * scale
        );
        const channel = syntheticChannel(
          channelUid,
          revenueMode,
          historyPositive,
          historyReversal
        );
        const baseAnnual = sum(historyPositive);
        const actualPositive = (
          baseAnnual
          * horizon / 12
          * Number(
            fixture.mechanismActualMultipliers[revenueMode]
          )
          * Number(
            fixture.platformActualMultipliers[platform.platformId]
          )
          * (1 + (index % 3 - 1) * 0.04)
        );
        const actualReversal = actualPositive * 0.025;
        const workId = (
          `SYN-CHANNEL-${platform.platformId}-`
          + `${expert.expertId}-${index + 1}`
        );
        const category = categories[index % categories.length];
        rows.push({
          standardWorkId: workId,
          origin,
          horizonMonths: horizon,
          labelAvailableAsOf: addMonths(origin, horizon),
          segment: "active",
          dominantRevenueMode: revenueMode,
          secondLevelCategoryReportingOnly: category,
          actualPositive,
          actualReversal,
          actual: actualPositive - actualReversal,
          observedSalesAgeMonths: historyPositive.length,
          canonicalChannels: [channel],
          salesShareMonthlyHistory: {
            startsAt: addMonths(origin, 1 - historyPositive.length),
            through: origin,
            positiveSeries: historyPositive,
            reversalSeries: historyReversal,
            observedZeroMonthsIncluded: true,
            unobservedMonthsZeroFilled: false
          },
          workChannelLabels: [{
            channelUid,
            platformId: String(platform.platformId),
            observedAtOrigin: true,
            actualPositive,
            actualReversal,
            actual: actualPositive - actualReversal
          }],
          unmaturedLabelZeroImputed: false,
          buyoutCashUsed: false
        });
      }
    }
  }
  return rows;
}

function syntheticChannel(
  channelUid,
  revenueMode,
  positive,
  reversal
) {
  const trailing = positive.slice(-12);
  const recent3 = trailing.slice(-3);
  const positiveIndexes = positive
    .map((value, index) => value > 0 ? index : -1)
    .filter((index) => index >= 0);
  return {
    channelUid,
    channelRole: "terminal_sales_platform",
    revenueMode,
    trailingAnnualPositive: sum(trailing),
    latestMonthPositive: trailing.at(-1),
    recent3AnnualPositive: sum(recent3) / recent3.length * 12,
    cumulativePositive: sum(positive),
    cumulativeReversal: sum(reversal),
    cumulativeNet: sum(positive) - sum(reversal),
    monthsSinceLastPositive: positive.length - 1 - positiveIndexes.at(-1),
    peerRecent6Positive: sum(positive.slice(-6)) * 3,
    peerPrevious6Positive: sum(positive.slice(-12, -6)) * 3,
    peerTrendRatio: (
      sum(positive.slice(-12, -6)) > 0
        ? sum(positive.slice(-6)) / sum(positive.slice(-12, -6))
        : 1
    )
  };
}

function compareRows(left, right) {
  return String(left.origin).localeCompare(String(right.origin))
    || Number(left.horizonMonths) - Number(right.horizonMonths)
    || String(left.standardWorkId).localeCompare(
      String(right.standardWorkId)
    );
}

function uniqueWorkCount(rows) {
  return new Set(rows.map((row) => String(row.standardWorkId))).size;
}

function nearlyEqual(left, right) {
  return Math.abs(left - right) <= 1e-7 * Math.max(1, Math.abs(right));
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value), 0);
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function addMonths(month, count) {
  const [year, value] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, value - 1 + count, 1));
  return `${date.getUTCFullYear()}-${String(
    date.getUTCMonth() + 1
  ).padStart(2, "0")}`;
}

function requireRows(value, name) {
  const rows = requireArray(value, name);
  if (rows.length === 0) {
    throw new Error(`m2_channel_expert_${name}_required`);
  }
  return rows;
}

function requireArray(value, name) {
  if (!Array.isArray(value)) {
    throw new Error(`m2_channel_expert_${name}_required`);
  }
  return value;
}

function requireObject(value, name) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`m2_channel_expert_${name}_required`);
  }
  return value;
}

function nonempty(value, name) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`m2_channel_expert_${name}_required`);
  return text;
}

function requireMonth(value, name) {
  const text = nonempty(value, name);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/u.test(text)) {
    throw new Error(`m2_channel_expert_${name}_invalid`);
  }
  return text;
}

function finite(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`m2_channel_expert_${name}_invalid`);
  }
  return number;
}

function nonnegative(value, name) {
  const number = finite(value, name);
  if (number < 0) {
    throw new Error(`m2_channel_expert_${name}_invalid`);
  }
  return number;
}

function positiveFinite(value, name) {
  const number = finite(value, name);
  if (number <= 0) {
    throw new Error(`m2_channel_expert_${name}_invalid`);
  }
  return number;
}

function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`m2_channel_expert_${name}_invalid`);
  }
  return number;
}

function nonnegativeInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`m2_channel_expert_${name}_invalid`);
  }
  return number;
}

function fractionValue(value, name) {
  const number = finite(value, name);
  if (number <= 0 || number > 1) {
    throw new Error(`m2_channel_expert_${name}_invalid`);
  }
  return number;
}
