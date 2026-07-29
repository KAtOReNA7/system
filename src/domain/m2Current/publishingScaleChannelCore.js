import {
  deterministicWorkFold
} from "./humanAnchored.js";
import {
  buildM2ChannelGenerativeSyntheticRows,
  M2_CHANNEL_GENERATIVE_MECHANISMS,
  scoreM2ChannelGenerativeG1Predictions
} from "./channelGenerative.js";

export const M2_PUBLISHING_SCALE_MODEL_ID = "M2-CHAN-PSC01";
export const M2_PUBLISHING_SCALE_EXPERIMENT_ID =
  "M2-EXP-PUBLISHING-SCALE-CHANNEL-01";
export const M2_PUBLISHING_SCALE_ARM_ID =
  `${M2_PUBLISHING_SCALE_EXPERIMENT_ID}/CORE`;
export const M2_PUBLISHING_SCALE_RAW_CANDIDATE_ID =
  "M2-CHAN-PSC01-RAW";
export const M2_PUBLISHING_SCALE_MATERIALIZER_ID =
  "M2-MATERIALIZER-PUBLISHING-SCALE-CHANNEL-01";
export const M2_PUBLISHING_SCALE_RECEIPT_CONTROLLER_ID =
  "M2-RECEIPT-CONTROLLER-PUBLISHING-SCALE-CHANNEL-01";

const EPSILON = 1e-12;

export class M2PublishingScaleContractError extends Error {
  constructor(code) {
    super(code);
    this.name = "M2PublishingScaleContractError";
    this.code = code;
  }
}

export function validateM2PublishingScaleConfig(config, support) {
  if (
    config?.schema !== "m2.current.publishing_scale_channel_core.v0.1"
    || config?.modelId !== M2_PUBLISHING_SCALE_MODEL_ID
    || config?.experimentArmId !== M2_PUBLISHING_SCALE_ARM_ID
  ) {
    throw new M2PublishingScaleContractError(
      "m2_publishing_scale_identity_invalid"
    );
  }
  if (
    support?.contractId !== "M2-PUBLISHING-SCALE-SUPPORT-01"
    || support?.status
      !== "FROZEN_BEFORE_NEW_CANDIDATE_OUTER_OUTCOME"
  ) {
    throw new M2PublishingScaleContractError(
      "m2_publishing_scale_support_contract_not_frozen"
    );
  }
  if (
    config.supportContract !==
      "config/m2-publishing-scale-statistical-support.v1.json"
    || config.executionPolicy
      !== "config/m2-publishing-scale-execution-policy.v0.3.json"
    || config.materializerId !== M2_PUBLISHING_SCALE_MATERIALIZER_ID
    || config.receiptControllerId
      !== M2_PUBLISHING_SCALE_RECEIPT_CONTROLLER_ID
    || config.dataContract.trainingWeight
      !== "equal_total_weight_per_standard_work"
    || config.dataContract.taxonomyAsOfStatus !== "REPORT_ONLY"
    || config.dataContract.authorizationAsOfStatus !== "REPORT_ONLY"
  ) {
    throw new M2PublishingScaleContractError(
      "m2_publishing_scale_contract_binding_invalid"
    );
  }
  if (
    config.selection.outerPrimaryWorkFoldCount
      !== support.parameterFreeze.outerPrimaryWorkFoldCount
    || config.selection.innerWorkFoldCount
      !== support.parameterFreeze.innerWorkFoldCount
  ) {
    throw new M2PublishingScaleContractError(
      "m2_publishing_scale_fold_contract_drift"
    );
  }
  const serialized = JSON.stringify(config);
  if (
    /minimumDistinctTrainingWorks|minimumMonthlyTrainingRows|minimumPositiveTrainingMonths/
      .test(serialized)
  ) {
    throw new M2PublishingScaleContractError(
      "m2_publishing_scale_legacy_eligibility_reintroduced"
    );
  }
  const frozenGlobal = support.parameterFreeze.nodes.globalPooledParent;
  const activeGlobal = config.nodes.globalPooledParent;
  validateFrozenNodeSpec(
    activeGlobal,
    frozenGlobal,
    "global"
  );
  if (
    activeGlobal.basisMeaning
      !== "compact_linear_horizon_basis_alias_not_membership_routing"
    || frozenGlobal.basisMeaning !== activeGlobal.basisMeaning
  ) {
    throw new M2PublishingScaleContractError(
      "m2_publishing_scale_global_basis_alias_semantics_drift"
    );
  }
  for (const mechanism of M2_CHANNEL_GENERATIVE_MECHANISMS) {
    const frozen = support.parameterFreeze.nodes[mechanism];
    const active = config.nodes.mechanisms[mechanism];
    validateFrozenNodeSpec(active, frozen, mechanism);
  }
  for (const platform of config.nodes.namedPlatforms) {
    validateFrozenNodeSpec(
      platform,
      support.parameterFreeze.namedPlatforms[platform.displayNameZh],
      platform.platformId
    );
  }
  if (
    config.oneClassSmoothing.pseudoPositive
      !== support.parameterFreeze.oneClassSmoothing.pseudoPositive
    || config.oneClassSmoothing.pseudoNegative
      !== support.parameterFreeze.oneClassSmoothing.pseudoNegative
  ) {
    throw new M2PublishingScaleContractError(
      "m2_publishing_scale_one_class_smoothing_drift"
    );
  }
  for (const node of inspectM2PublishingScaleDesignContracts(config)) {
    if (node.actualDesignMatrixColumnCount !== node.effectiveParameterCount) {
      throw new M2PublishingScaleContractError(
        `m2_publishing_scale_${node.nodeId}_effective_parameter_count_drift`
      );
    }
  }
  return true;
}

export function inspectM2PublishingScaleDesignContracts(config) {
  const specs = [
    ["globalPooledParent", config.nodes.globalPooledParent],
    ...M2_CHANNEL_GENERATIVE_MECHANISMS.map(
      (mechanism) => [mechanism, config.nodes.mechanisms[mechanism]]
    ),
    ...config.nodes.namedPlatforms.map(
      (platform) => [platform.platformId, platform]
    )
  ];
  return Object.freeze(specs.map(([nodeId, spec]) => Object.freeze({
    nodeId,
    basisMechanism: spec.basisMechanism,
    basisProfile: spec.basisProfile,
    basisMeaning: spec.basisMeaning ?? null,
    occurrenceL2: spec.occurrenceL2,
    conditionalAmountL2: spec.conditionalAmountL2,
    effectiveParameterCount: spec.effectiveParameterCount,
    actualDesignMatrixColumnCount:
      actualDesignMatrixColumnCount(config, spec),
    frozenTier: spec.frozenTier,
    designCountMatches:
      actualDesignMatrixColumnCount(config, spec)
        === spec.effectiveParameterCount
  })));
}

function validateFrozenNodeSpec(active, frozen, nodeId) {
  if (
    active === undefined
    || frozen === undefined
    || active.basisMechanism !== frozen.basisMechanism
    || active.basisMeaning !== frozen.basisMeaning
    || active.basisProfile !== frozen.basisProfile
    || active.occurrenceL2 !== frozen.occurrenceL2
    || active.conditionalAmountL2 !== frozen.conditionalAmountL2
    || active.effectiveParameterCount !== frozen.effectiveParameterCount
    || active.frozenTier !== frozen.frozenTier
  ) {
    throw new M2PublishingScaleContractError(
      `m2_publishing_scale_${nodeId}_parameter_drift`
    );
  }
}

export function fitM2PublishingScaleChannelCore(
  rows,
  config,
  support
) {
  validateM2PublishingScaleConfig(config, support);
  const source = requireMonthlyRows(rows);
  const observed = source.filter((row) => (
    row.observedAtOrigin
    && M2_CHANNEL_GENERATIVE_MECHANISMS.includes(row.mechanism)
  ));
  if (observed.length === 0) {
    throw new M2PublishingScaleContractError(
      "m2_publishing_scale_no_origin_observed_training_rows"
    );
  }
  const empirical = fitEmpiricalParent(observed, config);
  const globalSpec = config.nodes.globalPooledParent;
  const globalSupport = supportProfile(
    observed,
    globalSpec.effectiveParameterCount
  );
  const globalModel = fitNodeModel(observed, globalSpec, config);
  const globalTier = resolveTier({
    frozenTier: globalSpec.frozenTier,
    profile: globalSupport,
    authorityAsOfValid: true,
    support
  });
  const global = freezeNode({
    nodeId: "globalPooledParent",
    nodeType: "global_parent",
    parentNodeId: "originVisibleEmpiricalParent",
    tier: globalTier,
    support: globalSupport,
    model: globalModel,
    fallbackReason: globalModel === null
      ? "global_model_fit_unavailable"
      : null
  });

  const mechanisms = {};
  for (const mechanism of M2_CHANNEL_GENERATIVE_MECHANISMS) {
    const spec = config.nodes.mechanisms[mechanism];
    const selected = observed.filter((row) => row.mechanism === mechanism);
    const profile = supportProfile(
      selected,
      spec.effectiveParameterCount
    );
    const tier = resolveTier({
      frozenTier: spec.frozenTier,
      profile,
      authorityAsOfValid: true,
      support
    });
    const model = tier === "POOLED_PARENT"
      ? null
      : fitNodeModel(selected, spec, config);
    mechanisms[mechanism] = freezeNode({
      nodeId: mechanism,
      nodeType: "mechanism",
      parentNodeId: "globalPooledParent",
      tier: model === null ? "POOLED_PARENT" : tier,
      support: profile,
      model,
      fallbackReason: model === null
        ? supportFallbackReason(tier, profile, support)
        : null
    });
  }

  const platforms = {};
  for (const spec of config.nodes.namedPlatforms) {
    const selected = observed.filter(
      (row) => row.channelUid === spec.channelUid
    );
    const profile = supportProfile(
      selected,
      spec.effectiveParameterCount
    );
    const tier = resolveTier({
      frozenTier: spec.frozenTier,
      profile,
      authorityAsOfValid: true,
      support
    });
    const model = tier === "POOLED_PARENT"
      ? null
      : fitNodeModel(selected, spec, config);
    platforms[spec.channelUid] = freezeNode({
      nodeId: spec.platformId,
      displayNameZh: spec.displayNameZh,
      nodeType: "platform",
      channelUid: spec.channelUid,
      mechanism: spec.mechanism,
      parentNodeId: spec.mechanism,
      tier: model === null ? "POOLED_PARENT" : tier,
      support: profile,
      model,
      fallbackReason: model === null
        ? (
          spec.frozenTier === "POOLED_PARENT"
            ? "training_side_contract_requires_parent_pooling"
            : supportFallbackReason(tier, profile, support)
        )
        : null
    });
  }

  return Object.freeze({
    schema: "m2.current.publishing_scale_channel_state.v0.1",
    modelId: M2_PUBLISHING_SCALE_MODEL_ID,
    experimentArmId: M2_PUBLISHING_SCALE_ARM_ID,
    candidateId: M2_PUBLISHING_SCALE_RAW_CANDIDATE_ID,
    status: "FITTED",
    empirical,
    global,
    mechanisms: Object.freeze(mechanisms),
    platforms: Object.freeze(platforms),
    taxonomy: Object.freeze({
      tier: "REPORT_ONLY",
      parametersEstimated: false,
      routingUsed: false,
      reason: "taxonomy_as_of_authority_unavailable"
    }),
    authorization: Object.freeze({
      tier: "REPORT_ONLY",
      parametersEstimated: false,
      routingUsed: false,
      reason: "authorization_as_of_authority_unavailable"
    }),
    trainingWeight: "equal_total_weight_per_standard_work",
    legacyFixedEligibilityUsed: false
  });
}

export function predictM2PublishingScaleChannelMonthly(
  row,
  state,
  config
) {
  requireMonthlyRow(row);
  if (state?.modelId !== M2_PUBLISHING_SCALE_MODEL_ID) {
    throw new M2PublishingScaleContractError(
      "m2_publishing_scale_prediction_state_invalid"
    );
  }
  if (!row.observedAtOrigin) {
    return Object.freeze({
      candidateId: M2_PUBLISHING_SCALE_RAW_CANDIDATE_ID,
      positivePoint: 0,
      occurrenceProbability: 0,
      conditionalPositiveAmount: 0,
      usedGenerator: false,
      fallbackReason: "future_first_seen_identity_not_available_at_origin",
      supportTier: "POOLED_PARENT",
      selectedNodeId: "originVisibleEmpiricalParent",
      hierarchyPath: Object.freeze(["originVisibleEmpiricalParent"]),
      layerPredictions: freezeLayerPredictions({
        originVisibleEmpiricalParent: zeroLayerPrediction(),
        globalPooledParent: zeroLayerPrediction(),
        mechanism: zeroLayerPrediction(),
        namedPlatform: zeroLayerPrediction()
      }),
      taxonomyFeatureUsed: false,
      authorizationBackfillUsed: false
    });
  }
  const empirical = predictEmpirical(state.empirical);
  const globalRaw = state.global.model === null
    ? empirical
    : predictNodeModel(row, state.global.model, config);
  const global = blendPrediction(
    globalRaw,
    empirical,
    state.global.support
  );
  const mechanismNode = state.mechanisms[row.mechanism];
  if (mechanismNode === undefined) {
    return predictionResult({
      prediction: global,
      node: state.global,
      path: ["originVisibleEmpiricalParent", "globalPooledParent"],
      fallbackReason: "unregistered_mechanism_uses_global_parent",
      layerPredictions: {
        originVisibleEmpiricalParent: empirical,
        globalPooledParent: global,
        mechanism: global,
        namedPlatform: global
      }
    });
  }
  const mechanismRaw = mechanismNode.model === null
    ? global
    : predictNodeModel(row, mechanismNode.model, config);
  const mechanism = mechanismNode.model === null
    ? global
    : blendPrediction(
      mechanismRaw,
      global,
      mechanismNode.support
    );
  const platformNode = state.platforms[row.channelUid];
  if (platformNode === undefined) {
    return predictionResult({
      prediction: mechanism,
      node: mechanismNode,
      path: [
        "originVisibleEmpiricalParent",
        "globalPooledParent",
        mechanismNode.nodeId
      ],
      fallbackReason: mechanismNode.fallbackReason,
      layerPredictions: {
        originVisibleEmpiricalParent: empirical,
        globalPooledParent: global,
        mechanism,
        namedPlatform: mechanism
      }
    });
  }
  const platformRaw = platformNode.model === null
    ? mechanism
    : predictNodeModel(row, platformNode.model, config);
  const platform = platformNode.model === null
    ? mechanism
    : blendPrediction(
      platformRaw,
      mechanism,
      platformNode.support
    );
  return predictionResult({
    prediction: platform,
    node: platformNode,
    path: [
      "originVisibleEmpiricalParent",
      "globalPooledParent",
      mechanismNode.nodeId,
      platformNode.nodeId
    ],
    fallbackReason: platformNode.fallbackReason,
    layerPredictions: {
      originVisibleEmpiricalParent: empirical,
      globalPooledParent: global,
      mechanism,
      namedPlatform: platform
    }
  });
}

export function predictM2PublishingScaleGlobalParentMonthly(
  row,
  state,
  config
) {
  requireMonthlyRow(row);
  if (!row.observedAtOrigin) {
    return Object.freeze({
      candidateId: `${M2_PUBLISHING_SCALE_RAW_CANDIDATE_ID}-GLOBAL-PARENT`,
      positivePoint: 0,
      occurrenceProbability: 0,
      conditionalPositiveAmount: 0,
      usedGenerator: false,
      fallbackReason: "future_first_seen_identity_not_available_at_origin",
      supportTier: "POOLED_PARENT",
      selectedNodeId: "originVisibleEmpiricalParent"
    });
  }
  const empirical = predictEmpirical(state.empirical);
  const globalRaw = state.global.model === null
    ? empirical
    : predictNodeModel(row, state.global.model, config);
  const global = blendPrediction(
    globalRaw,
    empirical,
    state.global.support
  );
  return Object.freeze({
    candidateId: `${M2_PUBLISHING_SCALE_RAW_CANDIDATE_ID}-GLOBAL-PARENT`,
    positivePoint: Math.max(
      0,
      global.occurrenceProbability * global.conditionalPositiveAmount
    ),
    occurrenceProbability: global.occurrenceProbability,
    conditionalPositiveAmount: global.conditionalPositiveAmount,
    usedGenerator: true,
    fallbackReason: state.global.fallbackReason,
    supportTier: state.global.tier,
    selectedNodeId: state.global.nodeId
  });
}

export function crossFitM2PublishingScaleChannel(
  rows,
  config,
  support
) {
  const source = requireMonthlyRows(rows).filter(
    (row) => row.evaluationFamily === "primary"
  );
  const foldCount = config.selection.outerPrimaryWorkFoldCount;
  const predictions = new Map();
  const globalParentPredictions = new Map();
  const receipts = [];
  for (let fold = 0; fold < foldCount; fold += 1) {
    const training = source.filter(
      (row) => deterministicWorkFold(row.standardWorkId, foldCount) !== fold
    );
    const validation = source.filter(
      (row) => deterministicWorkFold(row.standardWorkId, foldCount) === fold
    );
    if (training.length === 0 || validation.length === 0) {
      throw new M2PublishingScaleContractError(
        "m2_publishing_scale_primary_fold_empty"
      );
    }
    const state = fitM2PublishingScaleChannelCore(
      training,
      config,
      support
    );
    for (const row of validation) {
      predictions.set(
        monthlyKey(row),
        predictM2PublishingScaleChannelMonthly(row, state, config)
      );
      globalParentPredictions.set(
        monthlyKey(row),
        predictM2PublishingScaleGlobalParentMonthly(row, state, config)
      );
    }
    receipts.push(buildFitReceipt({
      id: fold,
      training,
      validation,
      state
    }));
  }
  return finalizeOuter({
    source,
    predictions,
    globalParentPredictions,
    receipts,
    config,
    evaluationFamily: "primary",
    schema: "m2.current.publishing_scale_channel_primary_cross_fit.v0.1"
  });
}

export function strictRollingM2PublishingScaleChannel(
  rows,
  config,
  support
) {
  const source = requireMonthlyRows(rows).filter(
    (row) => row.evaluationFamily === "strict"
  );
  const predictions = new Map();
  const globalParentPredictions = new Map();
  const evaluatedRows = [];
  const receipts = [];
  for (const outerOrigin of config.selection.strictOrigins) {
    const training = source.filter((row) => (
      row.origin < outerOrigin
      && row.labelAvailableAsOf < outerOrigin
    ));
    const validation = source.filter((row) => row.origin === outerOrigin);
    if (training.length === 0 || validation.length === 0) {
      receipts.push(Object.freeze({
        id: outerOrigin,
        status: "INSUFFICIENT_MATURE_EARLIER_ROWS",
        trainingRowCount: training.length,
        validationRowCount: validation.length
      }));
      continue;
    }
    const state = fitM2PublishingScaleChannelCore(
      training,
      config,
      support
    );
    for (const row of validation) {
      predictions.set(
        monthlyKey(row),
        predictM2PublishingScaleChannelMonthly(row, state, config)
      );
      globalParentPredictions.set(
        monthlyKey(row),
        predictM2PublishingScaleGlobalParentMonthly(row, state, config)
      );
      evaluatedRows.push(row);
    }
    receipts.push(buildFitReceipt({
      id: outerOrigin,
      training,
      validation,
      state
    }));
  }
  if (evaluatedRows.length === 0) {
    throw new M2PublishingScaleContractError(
      "m2_publishing_scale_strict_no_evaluated_origin"
    );
  }
  return finalizeOuter({
    source: evaluatedRows,
    predictions,
    globalParentPredictions,
    receipts,
    config,
    evaluationFamily: "strict",
    schema: "m2.current.publishing_scale_channel_strict_rolling.v0.1"
  });
}

export function buildM2PublishingScaleSyntheticDiagnostic(
  fixture,
  config,
  support
) {
  validateM2PublishingScaleConfig(config, support);
  const rows = buildM2ChannelGenerativeSyntheticRows(fixture, config);
  const training = rows.filter(
    (row) => row.evaluationFamily === "primary"
  );
  const validation = rows.filter(
    (row) => row.evaluationFamily === "strict"
  );
  const state = fitM2PublishingScaleChannelCore(
    training,
    config,
    support
  );
  const predictions = new Map(validation.map((row) => [
    monthlyKey(row),
    predictM2PublishingScaleChannelMonthly(row, state, config)
  ]));
  const evaluation = scoreM2ChannelGenerativeG1Predictions(
    validation,
    predictions,
    config,
    { candidateId: M2_PUBLISHING_SCALE_RAW_CANDIDATE_ID }
  );
  return Object.freeze({
    schema: "m2.current.publishing_scale_channel_public_diagnostic.v0.1",
    displayNameZh: config.displayNameZh,
    displayNameEn: config.displayNameEn,
    modelId: M2_PUBLISHING_SCALE_MODEL_ID,
    experimentArmId: M2_PUBLISHING_SCALE_ARM_ID,
    status: "SYNTHETIC_DIAGNOSTIC_PASS",
    supportContractId: support.contractId,
    training: Object.freeze({
      monthlyRowCount: training.length,
      distinctWorkCount: distinctWorkCount(training),
      workBalanced: true
    }),
    support: publicStateSupport(state),
    evaluation: publicEvaluation(evaluation),
    boundaries: Object.freeze({
      publicSyntheticOnly: true,
      privateArtifactRead: false,
      candidateOuterOutcomeRead: false,
      taxonomyTier: "REPORT_ONLY",
      authorizationTier: "REPORT_ONLY",
      taxonomyFeatureUsed: false,
      authorizationBackfillUsed: false,
      legacyFixedEligibilityUsed: false,
      operationalFallbackModified: false,
      productionModified: false
    })
  });
}

function finalizeOuter({
  source,
  predictions,
  globalParentPredictions,
  receipts,
  config,
  evaluationFamily,
  schema
}) {
  const evaluation = scoreM2ChannelGenerativeG1Predictions(
    source,
    predictions,
    config,
    { candidateId: M2_PUBLISHING_SCALE_RAW_CANDIDATE_ID }
  );
  return Object.freeze({
    schema,
    modelId: M2_PUBLISHING_SCALE_MODEL_ID,
    experimentArmId: M2_PUBLISHING_SCALE_ARM_ID,
    candidateId: M2_PUBLISHING_SCALE_RAW_CANDIDATE_ID,
    evaluationFamily,
    rows: Object.freeze(source),
    predictions,
    globalParentPredictions,
    receipts: Object.freeze(receipts),
    evaluation,
    rawCandidatePreserved: true,
    fallbackOverwroteRaw: false,
    outerOutcomeUsedForSelection: false
  });
}

function fitNodeModel(rows, spec, config) {
  if (rows.length === 0) return null;
  const weights = workBalancedWeights(rows);
  const standardizer = fitStandardizer(
    rows,
    weights,
    config.featureOrder
  );
  const design = rows.map((row) => designRow(
    row,
    standardizer,
    spec.basisMechanism,
    spec.basisProfile,
    config
  ));
  const labels = rows.map((row) => row.actualPositive > 0 ? 1 : 0);
  const occurrence = fitWeightedLogistic(
    design,
    labels,
    weights,
    spec.occurrenceL2,
    config.numerical
  );
  const positiveRows = rows.filter((row) => row.actualPositive > 0);
  if (positiveRows.length === 0) return null;
  const positiveWeights = workBalancedWeights(positiveRows);
  const amountDesign = positiveRows.map((row) => designRow(
    row,
    standardizer,
    spec.basisMechanism,
    spec.basisProfile,
    config
  ));
  const targets = positiveRows.map(
    (row) => Math.log1p(row.actualPositive)
  );
  const amount = fitWeightedRidge(
    amountDesign,
    targets,
    positiveWeights,
    spec.conditionalAmountL2,
    config.numerical
  );
  const smearing = sum(amountDesign.map((vector, index) => (
    positiveWeights[index] * Math.exp(
      targets[index] - dot(vector, amount.coefficients)
    )
  )));
  if (!Number.isFinite(smearing) || smearing <= 0) return null;
  return Object.freeze({
    standardizer,
    occurrence,
    amount: Object.freeze({ ...amount, smearing }),
    basisMechanism: spec.basisMechanism,
    basisProfile: spec.basisProfile,
    occurrenceL2: spec.occurrenceL2,
    conditionalAmountL2: spec.conditionalAmountL2,
    effectiveParameterCount: spec.effectiveParameterCount
  });
}

function predictNodeModel(row, model, config) {
  const vector = designRow(
    row,
    model.standardizer,
    model.basisMechanism,
    model.basisProfile,
    config
  );
  const occurrenceProbability = model.occurrence.kind === "ONE_CLASS"
    ? model.occurrence.constantProbability
    : sigmoid(dot(vector, model.occurrence.coefficients));
  const amountLinear = clamp(
    dot(vector, model.amount.coefficients),
    -30,
    30
  );
  const conditionalPositiveAmount = Math.max(
    0,
    Math.exp(amountLinear) * model.amount.smearing - 1
  );
  return Object.freeze({
    occurrenceProbability,
    conditionalPositiveAmount
  });
}

function fitEmpiricalParent(rows, config) {
  const weights = workBalancedWeights(rows);
  const labels = rows.map((row) => row.actualPositive > 0 ? 1 : 0);
  const positiveWeight = sum(labels.map(
    (label, index) => label * weights[index]
  ));
  const effectiveRows = 1 / sum(weights.map((weight) => weight ** 2));
  const occurrenceProbability = (
    positiveWeight * effectiveRows
      + config.oneClassSmoothing.pseudoPositive
  ) / (
    effectiveRows
      + config.oneClassSmoothing.pseudoPositive
      + config.oneClassSmoothing.pseudoNegative
  );
  const positiveRows = rows.filter((row) => row.actualPositive > 0);
  const positiveWeights = workBalancedWeights(positiveRows);
  const logAmount = positiveRows.length === 0
    ? 0
    : sum(positiveRows.map((row, index) => (
      positiveWeights[index] * Math.log1p(row.actualPositive)
    )));
  return Object.freeze({
    nodeId: "originVisibleEmpiricalParent",
    tier: "SHRUNK_FIT",
    occurrenceProbability,
    conditionalPositiveAmount: Math.max(0, Math.expm1(logAmount)),
    trainingWorkCount: distinctWorkCount(rows),
    futureInformationUsed: false
  });
}

function predictEmpirical(empirical) {
  return Object.freeze({
    occurrenceProbability: empirical.occurrenceProbability,
    conditionalPositiveAmount: empirical.conditionalPositiveAmount
  });
}

function supportProfile(rows, effectiveParameterCount) {
  const works = [...new Set(rows.map((row) => row.standardWorkId))];
  const positiveWorks = new Set(
    rows.filter((row) => row.actualPositive > 0)
      .map((row) => row.standardWorkId)
  );
  const nonPositiveWorks = new Set(
    rows.filter((row) => row.actualPositive <= 0)
      .map((row) => row.standardWorkId)
  );
  const positiveCount = positiveWorks.size;
  const nonPositiveCount = nonPositiveWorks.size;
  const occurrenceClassEffectiveWorkCount = (
    positiveCount === 0 || nonPositiveCount === 0
  ) ? 0 : 2 / (1 / positiveCount + 1 / nonPositiveCount);
  const cashByWork = new Map();
  for (const row of rows) {
    cashByWork.set(
      row.standardWorkId,
      (cashByWork.get(row.standardWorkId) ?? 0)
        + Math.max(0, row.actualPositive)
    );
  }
  const cashValues = [...cashByWork.values()];
  const cashTotal = sum(cashValues);
  const cashHhi = cashTotal <= 0
    ? 1
    : sum(cashValues.map((value) => (value / cashTotal) ** 2));
  const sortedShares = cashTotal <= 0
    ? []
    : cashValues.map((value) => value / cashTotal)
      .sort((left, right) => right - left);
  const cashEffectiveWorkCount = cashHhi <= 0 ? 0 : 1 / cashHhi;
  const occurrenceWeight = clamp(
    occurrenceClassEffectiveWorkCount / (
      occurrenceClassEffectiveWorkCount + effectiveParameterCount
    ),
    0,
    1
  );
  const conditionalAmountWeight = clamp(
    cashEffectiveWorkCount / (
      cashEffectiveWorkCount + effectiveParameterCount
    ),
    0,
    1
  );
  return Object.freeze({
    distinctWorks: works.length,
    positiveDistinctWorks: positiveWorks.size,
    occurrenceClassEffectiveWorkCount,
    cashEffectiveWorkCount,
    monthlyRows: rows.length,
    positiveMonths: rows.filter((row) => row.actualPositive > 0).length,
    independentOrigins: new Set(rows.map((row) => row.origin)).size,
    cashHhi,
    top1WorkCashShare: sum(sortedShares.slice(0, 1)),
    top3WorkCashShare: sum(sortedShares.slice(0, 3)),
    effectiveParameterCount,
    occurrenceShrinkageWeight: occurrenceWeight,
    conditionalAmountShrinkageWeight: conditionalAmountWeight,
    monthlyRowsUsedAsIndependentSample: false
  });
}

function resolveTier({
  frozenTier,
  profile,
  authorityAsOfValid,
  support
}) {
  if (!authorityAsOfValid) return "REPORT_ONLY";
  if (frozenTier === "REPORT_ONLY") return "REPORT_ONLY";
  if (frozenTier === "POOLED_PARENT") return "POOLED_PARENT";
  const rule = support.tierRules[frozenTier];
  const minimumWorks = frozenTier === "DIRECT_FIT"
    ? profile.effectiveParameterCount
    : Math.max(8, profile.effectiveParameterCount);
  const minimumPositive = frozenTier === "DIRECT_FIT"
    ? Math.ceil(profile.effectiveParameterCount / 2)
    : Math.max(6, Math.ceil(profile.effectiveParameterCount / 2));
  if (
    profile.distinctWorks < minimumWorks
    || profile.positiveDistinctWorks < minimumPositive
    || profile.independentOrigins < rule.minimumIndependentOrigins
  ) {
    return "POOLED_PARENT";
  }
  return frozenTier;
}

function supportFallbackReason(tier, profile, support) {
  if (tier === "POOLED_PARENT") {
    const rule = support.tierRules.SHRUNK_FIT;
    const minimumWorks = Math.max(8, profile.effectiveParameterCount);
    const minimumPositive = Math.max(
      6,
      Math.ceil(profile.effectiveParameterCount / 2)
    );
    if (profile.distinctWorks < minimumWorks) {
      return "distinct_work_support_below_effective_parameter_contract";
    }
    if (profile.positiveDistinctWorks < minimumPositive) {
      return "positive_work_support_below_effective_parameter_contract";
    }
    if (profile.independentOrigins < rule.minimumIndependentOrigins) {
      return "independent_origin_support_below_contract";
    }
  }
  return "node_fit_unavailable_uses_parent";
}

function blendPrediction(child, parent, support) {
  const occurrenceWeight = support.occurrenceShrinkageWeight;
  const amountWeight = support.conditionalAmountShrinkageWeight;
  const occurrenceProbability = sigmoid(
    occurrenceWeight * logit(child.occurrenceProbability)
      + (1 - occurrenceWeight) * logit(parent.occurrenceProbability)
  );
  const conditionalPositiveAmount = Math.expm1(
    amountWeight * Math.log1p(child.conditionalPositiveAmount)
      + (1 - amountWeight)
        * Math.log1p(parent.conditionalPositiveAmount)
  );
  return Object.freeze({
    occurrenceProbability,
    conditionalPositiveAmount: Math.max(0, conditionalPositiveAmount)
  });
}

function predictionResult({
  prediction,
  node,
  path,
  fallbackReason,
  layerPredictions
}) {
  return Object.freeze({
    candidateId: M2_PUBLISHING_SCALE_RAW_CANDIDATE_ID,
    positivePoint: Math.max(
      0,
      prediction.occurrenceProbability
        * prediction.conditionalPositiveAmount
    ),
    occurrenceProbability: prediction.occurrenceProbability,
    conditionalPositiveAmount: prediction.conditionalPositiveAmount,
    usedGenerator: true,
    fallbackReason,
    supportTier: node.tier,
    selectedNodeId: node.nodeId,
    hierarchyPath: Object.freeze(path),
    layerPredictions: freezeLayerPredictions(layerPredictions),
    occurrenceShrinkageWeight:
      node.support?.occurrenceShrinkageWeight ?? 0,
    conditionalAmountShrinkageWeight:
      node.support?.conditionalAmountShrinkageWeight ?? 0,
    taxonomyFeatureUsed: false,
    authorizationBackfillUsed: false
  });
}

function freezeLayerPredictions(values) {
  return Object.freeze(Object.fromEntries(Object.entries(values).map(
    ([key, value]) => [key, Object.freeze({
      positivePoint: Math.max(
        0,
        value.occurrenceProbability * value.conditionalPositiveAmount
      ),
      occurrenceProbability: value.occurrenceProbability,
      conditionalPositiveAmount: value.conditionalPositiveAmount
    })]
  )));
}

function zeroLayerPrediction() {
  return Object.freeze({
    occurrenceProbability: 0,
    conditionalPositiveAmount: 0
  });
}

function freezeNode(value) {
  return Object.freeze({
    ...value,
    parametersEstimated: value.model !== null,
    support: Object.freeze(value.support)
  });
}

function buildFitReceipt({ id, training, validation, state }) {
  const trainingWorks = new Set(
    training.map((row) => row.standardWorkId)
  );
  const validationWorks = new Set(
    validation.map((row) => row.standardWorkId)
  );
  const overlap = [...trainingWorks].filter(
    (workId) => validationWorks.has(workId)
  );
  const strictOrigin = typeof id === "string" && /^\d{4}-\d{2}$/u.test(id)
    ? id
    : null;
  const labelAvailabilityByHorizon = Object.freeze(Object.fromEntries(
    [...new Set(training.flatMap((row) => row.includedHorizons))]
      .sort((left, right) => left - right)
      .map((horizon) => {
        const rows = training.filter(
          (row) => row.includedHorizons.includes(horizon)
        );
        const maximum = rows.map((row) => row.labelAvailableAsOf)
          .sort().at(-1) ?? null;
        return [String(horizon), Object.freeze({
          trainingRowCount: rows.length,
          maximumLabelAvailableAsOf: maximum,
          allLabelsAvailableBeforeStrictOuterOrigin: strictOrigin === null
            ? null
            : rows.every(
              (row) => row.labelAvailableAsOf < strictOrigin
            )
        })];
      })
  ));
  return Object.freeze({
    id,
    status: "EVALUATED",
    trainingRowCount: training.length,
    trainingWorkCount: trainingWorks.size,
    validationRowCount: validation.length,
    validationWorkCount: validationWorks.size,
    trainingValidationWorkOverlapCount: overlap.length,
    primaryWorkFoldIsolationPassed:
      strictOrigin === null ? overlap.length === 0 : null,
    strictEarlierOriginTrainingPassed: strictOrigin === null
      ? null
      : training.every((row) => (
        row.origin < strictOrigin
        && row.labelAvailableAsOf < strictOrigin
      )),
    labelAvailabilityByHorizon,
    sampleIdentity: Object.freeze({
      worksAreStandardWorks: true,
      workChannelScopesAreIndependentWorks: false,
      monthlyRowsAreIndependentWorks: false
    }),
    support: publicStateSupport(state),
    taxonomyTier: "REPORT_ONLY",
    authorizationTier: "REPORT_ONLY",
    outerOutcomeUsedForSelection: false
  });
}

function publicStateSupport(state) {
  return Object.freeze({
    globalPooledParent: publicNode(state.global),
    mechanisms: Object.freeze(Object.fromEntries(
      Object.entries(state.mechanisms).map(
        ([key, value]) => [key, publicNode(value)]
      )
    )),
    namedPlatforms: Object.freeze(Object.fromEntries(
      Object.values(state.platforms).map(
        (value) => [value.nodeId, publicNode(value)]
      )
    )),
    taxonomy: state.taxonomy,
    authorization: state.authorization
  });
}

function publicNode(node) {
  return Object.freeze({
    nodeId: node.nodeId,
    displayNameZh: node.displayNameZh ?? null,
    nodeType: node.nodeType,
    parentNodeId: node.parentNodeId,
    tier: node.tier,
    parametersEstimated: node.parametersEstimated,
    fallbackReason: node.fallbackReason,
    support: node.support
  });
}

function publicEvaluation(evaluation) {
  return Object.freeze({
    candidateId: evaluation.candidateId,
    workTotal: evaluation.workTotal,
    workChannel: evaluation.workChannel,
    byHorizon: evaluation.byHorizon,
    byOrigin: evaluation.byOrigin,
    byMechanism: evaluation.byMechanism,
    topRevenue: evaluation.topRevenue,
    occurrence: evaluation.occurrence,
    conditionalAmount: evaluation.conditionalAmount,
    coverage: evaluation.coverage,
    privateCaseRowsIncluded: false
  });
}

function fitStandardizer(rows, weights, featureOrder) {
  const means = featureOrder.map((field) => sum(rows.map(
    (row, index) => weights[index] * finite(row.features?.[field])
  )));
  const standardDeviations = featureOrder.map((field, fieldIndex) => {
    const variance = sum(rows.map((row, rowIndex) => (
      weights[rowIndex]
        * (finite(row.features?.[field]) - means[fieldIndex]) ** 2
    )));
    const value = Math.sqrt(Math.max(0, variance));
    return value === 0 ? 1 : value;
  });
  return Object.freeze({
    featureOrder: Object.freeze([...featureOrder]),
    means: Object.freeze(means),
    standardDeviations: Object.freeze(standardDeviations),
    fitOnlyOnTraining: true,
    workBalanced: true
  });
}

function designRow(
  row,
  standardizer,
  basisMechanism,
  basisProfile,
  config
) {
  const standardized = standardizer.featureOrder.map((field, index) => (
    (finite(row.features?.[field]) - standardizer.means[index])
      / standardizer.standardDeviations[index]
  ));
  const featureIndex = Object.fromEntries(
    standardizer.featureOrder.map(
      (field, index) => [field, index]
    )
  );
  const basis = timeBasis(row.futureMonthIndex);
  const contract = config.basisProfiles[basisProfile][basisMechanism];
  const output = [1, ...standardized];
  for (const field of contract.base) {
    output.push(finite(basis[field]));
  }
  for (const [timeField, featureField] of contract.interactions) {
    output.push(
      finite(basis[timeField]) * standardized[featureIndex[featureField]]
    );
  }
  return output;
}

function actualDesignMatrixColumnCount(config, spec) {
  const standardizer = {
    featureOrder: config.featureOrder,
    means: config.featureOrder.map(() => 0),
    standardDeviations: config.featureOrder.map(() => 1)
  };
  const row = {
    futureMonthIndex: 1,
    features: Object.fromEntries(
      config.featureOrder.map((field) => [field, 0])
    )
  };
  return designRow(
    row,
    standardizer,
    spec.basisMechanism,
    spec.basisProfile,
    config
  ).length;
}

function fitWeightedLogistic(
  design,
  labels,
  weights,
  lambda,
  numerical
) {
  const positive = sum(labels.map(
    (label, index) => label * weights[index]
  ));
  const effectiveRows = 1 / sum(weights.map((weight) => weight ** 2));
  if (positive <= EPSILON || positive >= 1 - EPSILON) {
    return Object.freeze({
      kind: "ONE_CLASS",
      constantProbability: (
        positive * effectiveRows
          + numerical.oneClassPseudoPositive
      ) / (
        effectiveRows
          + numerical.oneClassPseudoPositive
          + numerical.oneClassPseudoNegative
      ),
      coefficients: null,
      converged: true,
      iterations: 0
    });
  }
  const dimension = design[0].length;
  let coefficients = Array(dimension).fill(0);
  coefficients[0] = logit(positive);
  let converged = false;
  let iterations = 0;
  for (
    let iteration = 1;
    iteration <= numerical.maximumIterations;
    iteration += 1
  ) {
    const matrix = zeroMatrix(dimension);
    const vector = Array(dimension).fill(0);
    for (let rowIndex = 0; rowIndex < design.length; rowIndex += 1) {
      const x = design[rowIndex];
      const eta = dot(x, coefficients);
      const probability = sigmoid(eta);
      const variance = Math.max(
        probability * (1 - probability),
        numerical.minimumLogisticVariance
      );
      const adjusted = eta
        + (labels[rowIndex] - probability) / variance;
      const combined = weights[rowIndex] * variance;
      addOuterProduct(matrix, x, combined);
      addScaled(vector, x, combined * adjusted);
    }
    for (let index = 1; index < dimension; index += 1) {
      matrix[index][index] += lambda;
    }
    let proposal;
    try {
      proposal = solveLinearSystem(
        matrix,
        vector,
        numerical.pivotTolerance
      );
    } catch {
      break;
    }
    const difference = Math.max(...proposal.map(
      (value, index) => Math.abs(value - coefficients[index])
    ));
    coefficients = proposal;
    iterations = iteration;
    if (difference <= numerical.coefficientTolerance) {
      converged = true;
      break;
    }
  }
  return Object.freeze({
    kind: "LOGISTIC",
    coefficients: Object.freeze(coefficients),
    converged,
    iterations
  });
}

function fitWeightedRidge(
  design,
  targets,
  weights,
  lambda,
  numerical
) {
  const dimension = design[0].length;
  const matrix = zeroMatrix(dimension);
  const vector = Array(dimension).fill(0);
  for (let rowIndex = 0; rowIndex < design.length; rowIndex += 1) {
    addOuterProduct(matrix, design[rowIndex], weights[rowIndex]);
    addScaled(
      vector,
      design[rowIndex],
      targets[rowIndex] * weights[rowIndex]
    );
  }
  for (let index = 1; index < dimension; index += 1) {
    matrix[index][index] += lambda;
  }
  return Object.freeze({
    kind: "RIDGE",
    coefficients: Object.freeze(solveLinearSystem(
      matrix,
      vector,
      numerical.pivotTolerance
    )),
    converged: true
  });
}

function solveLinearSystem(matrix, vector, pivotTolerance) {
  const size = vector.length;
  const augmented = matrix.map(
    (row, index) => [...row, vector[index]]
  );
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (
        Math.abs(augmented[row][column])
          > Math.abs(augmented[pivot][column])
      ) {
        pivot = row;
      }
    }
    if (Math.abs(augmented[pivot][column]) <= pivotTolerance) {
      throw new M2PublishingScaleContractError(
        "m2_publishing_scale_linear_pivot_failure"
      );
    }
    if (pivot !== column) {
      [augmented[column], augmented[pivot]] = [
        augmented[pivot],
        augmented[column]
      ];
    }
    const divisor = augmented[column][column];
    for (let index = column; index <= size; index += 1) {
      augmented[column][index] /= divisor;
    }
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let index = column; index <= size; index += 1) {
        augmented[row][index] -= factor * augmented[column][index];
      }
    }
  }
  return augmented.map((row) => row[size]);
}

function workBalancedWeights(rows) {
  if (rows.length === 0) return [];
  const counts = new Map();
  for (const row of rows) {
    counts.set(
      row.standardWorkId,
      (counts.get(row.standardWorkId) ?? 0) + 1
    );
  }
  const raw = rows.map(
    (row) => 1 / counts.get(row.standardWorkId)
  );
  const total = sum(raw);
  return raw.map((value) => value / total);
}

function timeBasis(index) {
  const value = Number(index);
  const u = value / 36;
  return Object.freeze({
    u,
    u_squared: u ** 2,
    short: Math.exp(-(value - 1) / 3),
    short_spike: Math.exp(-(value - 1) / 3),
    long_tail: Math.exp(-(value - 1) / 18)
  });
}

function monthlyKey(row) {
  return `${row.standardWorkId}\u001f${row.channelUid}`
    + `\u001f${row.origin}\u001f${row.futureMonthIndex}`;
}

function distinctWorkCount(rows) {
  return new Set(rows.map((row) => row.standardWorkId)).size;
}

function requireMonthlyRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new M2PublishingScaleContractError(
      "m2_publishing_scale_monthly_rows_invalid"
    );
  }
  for (const row of rows) requireMonthlyRow(row);
  return rows;
}

function requireMonthlyRow(row) {
  if (
    typeof row?.standardWorkId !== "string"
    || typeof row?.channelUid !== "string"
    || typeof row?.origin !== "string"
    || !Number.isInteger(Number(row?.futureMonthIndex))
    || !Number.isFinite(Number(row?.actualPositive))
  ) {
    throw new M2PublishingScaleContractError(
      "m2_publishing_scale_monthly_row_invalid"
    );
  }
  return row;
}

function finite(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new M2PublishingScaleContractError(
      "m2_publishing_scale_numeric_value_invalid"
    );
  }
  return number;
}

function sigmoid(value) {
  const bounded = clamp(value, -35, 35);
  return 1 / (1 + Math.exp(-bounded));
}

function logit(value) {
  const bounded = clamp(Number(value), 1e-9, 1 - 1e-9);
  return Math.log(bounded / (1 - bounded));
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function dot(left, right) {
  return sum(left.map((value, index) => value * right[index]));
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value), 0);
}

function zeroMatrix(size) {
  return Array.from({ length: size }, () => Array(size).fill(0));
}

function addOuterProduct(matrix, vector, weight) {
  for (let row = 0; row < vector.length; row += 1) {
    for (let column = 0; column < vector.length; column += 1) {
      matrix[row][column] += weight * vector[row] * vector[column];
    }
  }
}

function addScaled(target, vector, weight) {
  for (let index = 0; index < vector.length; index += 1) {
    target[index] += weight * vector[index];
  }
}
