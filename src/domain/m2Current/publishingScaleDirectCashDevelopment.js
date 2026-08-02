import { deterministicWorkFold } from "./humanAnchored.js";
import {
  M2_CHANNEL_GENERATIVE_MECHANISMS,
  scoreM2ChannelGenerativeG1Predictions
} from "./channelGenerative.js";
import {
  M2_PSC03_EXPERIMENT_ID,
  M2_PSC03_MODEL_ID,
  M2_PSC03_PREREGISTRATION_ID,
  M2_PSC03_RAW_CANDIDATE_ID
} from "./publishingScaleDirectCashPreregistration.js";

export const M2_PSC03_ARMS = Object.freeze({
  D0: "ARITHMETIC_HIERARCHY_ONLY",
  D1: "DIRECT_QUASI_GAMMA_HIERARCHY",
  P: "DIRECT_QUASI_POISSON_HIERARCHY"
});

const ESTIMATOR_BY_ARM = Object.freeze({
  D1: "GAMMA",
  P: "POISSON"
});

export class M2Psc03ContractError extends Error {
  constructor(code) {
    super(code);
    this.name = "M2Psc03ContractError";
    this.code = code;
  }
}

export class M2Psc03NumericalError extends Error {
  constructor(code) {
    super(code);
    this.name = "M2Psc03NumericalError";
    this.code = code;
  }
}

export function validateM2Psc03DevelopmentConfig(
  config,
  psc01Config,
  support
) {
  const failures = [];
  equal(config?.modelId, M2_PSC03_MODEL_ID, "model", failures);
  equal(config?.rawCandidateId, M2_PSC03_RAW_CANDIDATE_ID, "candidate", failures);
  equal(config?.experimentId, M2_PSC03_EXPERIMENT_ID, "experiment", failures);
  equal(
    config?.preregistrationId,
    M2_PSC03_PREREGISTRATION_ID,
    "preregistration",
    failures
  );
  equal(config?.frozenPsc01?.modelId, "M2-CHAN-PSC01", "psc01", failures);
  equal(config?.frozenPsc01?.monthlyRowCount, 3318819, "population", failures);
  equal(psc01Config?.featureOrder?.length, 18, "features", failures);
  equal(support?.contractId, "M2-PUBLISHING-SCALE-SUPPORT-01", "support", failures);
  jsonEqual(config?.selection?.lambdaGrid, [1, 3], "lambda", failures);
  equal(config?.selection?.primaryOuterWorkFoldCount, 5, "outer", failures);
  equal(config?.selection?.primaryInnerWorkFoldCount, 3, "inner", failures);
  equal(config?.selection?.primaryInnerWorkFoldRepeats, 3, "repeat", failures);
  equal(config?.selection?.outerOutcomeUsedForSelection, false, "outer_use", failures);
  equal(config?.numerical?.maximumIterations, 200, "iterations", failures);
  equal(config?.numerical?.maximumStepHalvings, 20, "halvings", failures);
  equal(config?.numerical?.coefficientTolerance, 1e-10, "coef", failures);
  equal(config?.numerical?.relativeObjectiveTolerance, 1e-12, "objective", failures);
  equal(config?.numerical?.pivotTolerance, 1e-12, "pivot", failures);
  jsonEqual(config?.numerical?.finalPredictionEtaClip, [-30, 30], "clip", failures);
  equal(config?.numerical?.trainingEtaClip, null, "training_clip", failures);
  equal(config?.closedBoundaries?.activeCandidate, null, "active", failures);
  equal(config?.closedBoundaries?.approvedForAutomation, null, "automation", failures);
  for (const field of [
    "productionReady",
    "finalHoldoutOpened",
    "independentEvaluationOpened",
    "laterOriginOpened",
    "productionModified",
    "apiModified",
    "databaseUsed",
    "providerUsed"
  ]) {
    equal(config?.closedBoundaries?.[field], false, field, failures);
  }
  const platformIds = psc01Config?.nodes?.namedPlatforms?.map(
    (row) => row.platformId
  );
  jsonEqual(
    platformIds,
    ["ximalaya", "wechat_reading", "fanqie_audio", "missevan", "manbo"],
    "platforms",
    failures
  );
  if (failures.length > 0) {
    throw new M2Psc03ContractError(
      `m2_psc03_development_config_invalid:${failures.join(",")}`
    );
  }
  return true;
}

export function m2Psc03MonthlyKey(row) {
  return `${row.standardWorkId}\u001f${row.channelUid}`
    + `\u001f${row.origin}\u001f${row.futureMonthIndex}`;
}

export function m2Psc03Binary64Hex(value) {
  const number = finite(value, "binary64_value");
  const buffer = Buffer.allocUnsafe(8);
  buffer.writeDoubleBE(number, 0);
  return buffer.toString("hex");
}

export class M2Psc03OccurrenceProjectionBuilder {
  constructor() {
    this.map = new Map();
    this.bitPatterns = new Map();
    this.rowCount = 0;
  }

  add(row) {
    const key = m2Psc03MonthlyKey(row);
    if (this.map.has(key)) {
      throw new M2Psc03ContractError(
        "m2_psc03_occurrence_projection_duplicate"
      );
    }
    const probability = finite(
      row?.occurrenceProbability,
      "occurrence_probability"
    );
    if (probability < 0 || probability > 1) {
      throw new M2Psc03ContractError(
        "m2_psc03_occurrence_probability_out_of_range"
      );
    }
    this.map.set(key, probability);
    this.bitPatterns.set(key, m2Psc03Binary64Hex(probability));
    this.rowCount += 1;
  }

  finalize(expectedRows) {
    const expected = requireRows(expectedRows, { requireFeatures: false });
    const expectedKeys = new Set();
    for (const row of expected) {
      const key = m2Psc03MonthlyKey(row);
      if (expectedKeys.has(key)) {
        throw new M2Psc03ContractError(
          "m2_psc03_prediction_population_duplicate"
        );
      }
      expectedKeys.add(key);
      if (!this.map.has(key)) {
        throw new M2Psc03ContractError(
          "m2_psc03_occurrence_projection_missing"
        );
      }
    }
    if (this.map.size !== expectedKeys.size) {
      throw new M2Psc03ContractError(
        "m2_psc03_occurrence_projection_extra"
      );
    }
    return Object.freeze({
      map: this.map,
      bitPatterns: this.bitPatterns,
      rowCount: this.rowCount,
      expectedRowCount: expected.length,
      exactCoverage: true,
      duplicateKeysRejectedOnBothSides: true,
      binary64AbsoluteTolerance: 0,
      binary64RelativeTolerance: 0
    });
  }
}

export function verifyM2Psc03OccurrenceProjection({
  expectedRows,
  occurrenceRows
}) {
  const builder = new M2Psc03OccurrenceProjectionBuilder();
  for (const row of occurrenceRows) builder.add(row);
  return builder.finalize(expectedRows);
}

export function verifyM2Psc03PopulationCoverage({ expectedRows, actualRows }) {
  const expected = new Set();
  for (const row of requireRows(expectedRows, { requireFeatures: false })) {
    const key = m2Psc03MonthlyKey(row);
    if (expected.has(key)) {
      throw new M2Psc03ContractError("m2_psc03_expected_population_duplicate");
    }
    expected.add(key);
  }
  const actual = new Set();
  for (const row of requireRows(actualRows, { requireFeatures: false })) {
    const key = m2Psc03MonthlyKey(row);
    if (actual.has(key)) {
      throw new M2Psc03ContractError("m2_psc03_actual_population_duplicate");
    }
    actual.add(key);
  }
  if (
    expected.size !== actual.size
    || [...expected].some((key) => !actual.has(key))
  ) {
    throw new M2Psc03ContractError("m2_psc03_population_not_exact");
  }
  return Object.freeze({ rowCount: expected.size, exactCoverage: true });
}

export function m2Psc03CaseBalancedWeights(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new M2Psc03ContractError("m2_psc03_weight_rows_required");
  }
  const keys = new Set();
  for (const row of rows) {
    const key = m2Psc03MonthlyKey(row);
    if (keys.has(key)) {
      throw new M2Psc03ContractError("m2_psc03_weight_duplicate_key");
    }
    keys.add(key);
  }
  const value = 1 / rows.length;
  return Object.freeze(rows.map(() => value));
}

export function evaluateM2Psc03QuasiObjective({
  family,
  design,
  targets,
  weights,
  offsets,
  coefficients,
  lambda
}) {
  requireQuasiInputs({ family, design, targets, weights, offsets, coefficients, lambda });
  const size = coefficients.length;
  const gradient = Array(size).fill(0);
  const hessian = Array.from({ length: size }, () => Array(size).fill(0));
  let objective = 0;
  for (let rowIndex = 0; rowIndex < design.length; rowIndex += 1) {
    const vector = design[rowIndex];
    const y = targets[rowIndex];
    const weight = weights[rowIndex];
    const eta = offsets[rowIndex] + dot(vector, coefficients);
    const mu = Math.exp(eta);
    if (!Number.isFinite(eta) || !Number.isFinite(mu) || mu <= 0) {
      throw new M2Psc03NumericalError("m2_psc03_nonfinite_training_mean");
    }
    const gradientScale = family === "POISSON"
      ? weight * (mu - y)
      : weight * (1 - y / mu);
    const hessianScale = family === "POISSON"
      ? weight * mu
      : weight * y / mu;
    objective += family === "POISSON"
      ? weight * (mu - y * eta)
      : weight * (y / mu + eta);
    for (let column = 0; column < size; column += 1) {
      gradient[column] += gradientScale * vector[column];
      for (let other = 0; other <= column; other += 1) {
        hessian[column][other] += (
          hessianScale * vector[column] * vector[other]
        );
      }
    }
  }
  for (let column = 0; column < size; column += 1) {
    if (column > 0) {
      objective += 0.5 * lambda * coefficients[column] ** 2;
      gradient[column] += lambda * coefficients[column];
      hessian[column][column] += lambda;
    }
    for (let other = 0; other < column; other += 1) {
      hessian[other][column] = hessian[column][other];
    }
  }
  if (
    !Number.isFinite(objective)
    || gradient.some((value) => !Number.isFinite(value))
    || hessian.some((row) => row.some((value) => !Number.isFinite(value)))
  ) {
    throw new M2Psc03NumericalError("m2_psc03_nonfinite_quasi_state");
  }
  return Object.freeze({
    objective,
    gradient: Object.freeze(gradient),
    hessian: Object.freeze(hessian.map(Object.freeze))
  });
}

export function fitM2Psc03QuasiLikelihood({
  family,
  design,
  targets,
  weights,
  offsets = null,
  lambda,
  numerical
}) {
  const resolvedOffsets = offsets ?? design.map(() => 0);
  const coefficientCount = design[0]?.length ?? 0;
  if (coefficientCount === 0) {
    throw new M2Psc03ContractError("m2_psc03_empty_design");
  }
  const coefficients = Array(coefficientCount).fill(0);
  const weightedTarget = sum(targets.map((value, index) => weights[index] * value));
  const interceptScale = family === "POISSON"
    ? weightedTarget / sum(resolvedOffsets.map(
      (offset, index) => weights[index] * Math.exp(offset)
    ))
    : sum(targets.map(
      (value, index) => weights[index] * value / Math.exp(resolvedOffsets[index])
    ));
  if (!Number.isFinite(interceptScale) || interceptScale <= 0) {
    throw new M2Psc03NumericalError("m2_psc03_initial_intercept_invalid");
  }
  coefficients[0] = Math.log(interceptScale);
  let state = evaluateM2Psc03QuasiObjective({
    family,
    design,
    targets,
    weights,
    offsets: resolvedOffsets,
    coefficients,
    lambda
  });
  const history = [state.objective];
  let converged = false;
  let iterations = 0;
  for (let iteration = 0; iteration < numerical.maximumIterations; iteration += 1) {
    iterations = iteration + 1;
    const step = solveLinearSystem(
      state.hessian,
      state.gradient,
      numerical.pivotTolerance
    );
    if (step.some((value) => !Number.isFinite(value))) {
      throw new M2Psc03NumericalError("m2_psc03_nonfinite_newton_step");
    }
    let accepted = null;
    let factor = 1;
    for (let halving = 0; halving <= numerical.maximumStepHalvings; halving += 1) {
      const candidate = coefficients.map(
        (value, index) => value - factor * step[index]
      );
      if (candidate.every(Number.isFinite)) {
        try {
          const next = evaluateM2Psc03QuasiObjective({
            family,
            design,
            targets,
            weights,
            offsets: resolvedOffsets,
            coefficients: candidate,
            lambda
          });
          if (next.objective <= state.objective + 1e-14 * Math.max(1, Math.abs(state.objective))) {
            accepted = { candidate, next, factor };
            break;
          }
        } catch (error) {
          if (!(error instanceof M2Psc03NumericalError)) throw error;
        }
      }
      factor /= 2;
    }
    if (accepted === null) {
      throw new M2Psc03NumericalError("m2_psc03_step_halving_exhausted");
    }
    const coefficientChange = Math.max(...accepted.candidate.map(
      (value, index) => Math.abs(value - coefficients[index])
    ));
    const relativeObjectiveChange = Math.abs(
      state.objective - accepted.next.objective
    ) / Math.max(1, Math.abs(state.objective));
    coefficients.splice(0, coefficients.length, ...accepted.candidate);
    state = accepted.next;
    history.push(state.objective);
    if (
      coefficientChange <= numerical.coefficientTolerance
      && relativeObjectiveChange <= numerical.relativeObjectiveTolerance
    ) {
      converged = true;
      break;
    }
  }
  if (!converged) {
    throw new M2Psc03NumericalError("m2_psc03_solver_not_converged");
  }
  return Object.freeze({
    family,
    lambda,
    coefficients: Object.freeze([...coefficients]),
    objective: state.objective,
    objectiveHistory: Object.freeze(history),
    iterations,
    converged,
    interceptPenalized: false,
    trainingEtaClipped: false
  });
}

export function fitM2Psc03AmountHierarchy(
  rows,
  config,
  psc01Config,
  support,
  {
    arm,
    lambda,
    failureInjection = null
  }
) {
  validateM2Psc03DevelopmentConfig(config, psc01Config, support);
  const estimator = ESTIMATOR_BY_ARM[arm];
  if (estimator === undefined) {
    throw new M2Psc03ContractError("m2_psc03_quasi_arm_invalid");
  }
  const source = requireRows(rows).filter((row) => row.observedAtOrigin);
  const positive = source.filter((row) => row.actualPositive > 0);
  if (positive.length === 0) {
    throw new M2Psc03ContractError("m2_psc03_positive_training_rows_missing");
  }
  const globalSpec = psc01Config.nodes.globalPooledParent;
  const globalProfile = supportProfile(source, globalSpec.effectiveParameterCount);
  if (!nodeEligible(globalSpec, globalProfile, support)) {
    throw new M2Psc03ContractError("m2_psc03_global_support_ineligible");
  }
  if (failureInjected(failureInjection, "globalPooledParent")) {
    throw new M2Psc03NumericalError("m2_psc03_injected_global_failure");
  }
  const global = fitQuasiNode({
    rows: positive,
    allRows: source,
    spec: globalSpec,
    estimator,
    lambda,
    config,
    psc01Config,
    supportProfile: globalProfile,
    parentEta: () => 0,
    nodeId: "globalPooledParent"
  });

  const mechanisms = {};
  for (const mechanism of M2_CHANNEL_GENERATIVE_MECHANISMS) {
    const spec = psc01Config.nodes.mechanisms[mechanism];
    const selectedAll = source.filter((row) => row.mechanism === mechanism);
    const selected = positive.filter((row) => row.mechanism === mechanism);
    mechanisms[mechanism] = fitChildOrFallback({
      rows: selected,
      allRows: selectedAll,
      spec,
      estimator,
      lambda,
      config,
      psc01Config,
      support,
      nodeId: mechanism,
      parentNodeId: "globalPooledParent",
      parentEta: (row) => predictQuasiNodeRawEta(row, global, 0),
      failureInjection
    });
  }

  const platforms = {};
  for (const spec of psc01Config.nodes.namedPlatforms) {
    const selectedAll = source.filter((row) => row.channelUid === spec.channelUid);
    const selected = positive.filter((row) => row.channelUid === spec.channelUid);
    const mechanismNode = mechanisms[spec.mechanism];
    const mechanismEta = (row) => mechanismNode.model === null
      ? predictQuasiNodeRawEta(row, global, 0)
      : predictQuasiNodeRawEta(
        row,
        mechanismNode,
        predictQuasiNodeRawEta(row, global, 0)
      );
    platforms[spec.channelUid] = fitChildOrFallback({
      rows: selected,
      allRows: selectedAll,
      spec,
      estimator,
      lambda,
      config,
      psc01Config,
      support,
      nodeId: spec.platformId,
      parentNodeId: spec.mechanism,
      parentEta: mechanismEta,
      failureInjection
    });
  }
  return Object.freeze({
    schema: "m2.current.psc03.amount_hierarchy_state.v0.1",
    modelId: M2_PSC03_MODEL_ID,
    arm,
    estimator,
    lambda,
    global,
    mechanisms: Object.freeze(mechanisms),
    platforms: Object.freeze(platforms),
    trainingWeight: "equal_per_positive_monthly_case_normalized_within_node",
    taxonomyUsed: false,
    lg01Dependency: false
  });
}

export function fitM2Psc03ArithmeticHierarchy(rows, psc01Config, support) {
  const source = requireRows(rows).filter((row) => row.observedAtOrigin);
  const positive = source.filter((row) => row.actualPositive > 0);
  if (positive.length === 0) {
    throw new M2Psc03ContractError("m2_psc03_D0_positive_rows_missing");
  }
  const globalSpec = psc01Config.nodes.globalPooledParent;
  const globalProfile = supportProfile(source, globalSpec.effectiveParameterCount);
  if (!nodeEligible(globalSpec, globalProfile, support)) {
    throw new M2Psc03ContractError("m2_psc03_D0_global_support_ineligible");
  }
  const global = arithmeticNode(
    "globalPooledParent",
    null,
    positive,
    globalProfile
  );
  const mechanisms = {};
  for (const mechanism of M2_CHANNEL_GENERATIVE_MECHANISMS) {
    const spec = psc01Config.nodes.mechanisms[mechanism];
    const allRows = source.filter((row) => row.mechanism === mechanism);
    const values = positive.filter((row) => row.mechanism === mechanism);
    const profile = supportProfile(allRows, spec.effectiveParameterCount);
    mechanisms[mechanism] = nodeEligible(spec, profile, support) && values.length > 0
      ? arithmeticNode(mechanism, "globalPooledParent", values, profile)
      : fallbackNode(mechanism, "globalPooledParent", profile, "support_insufficient");
  }
  const platforms = {};
  for (const spec of psc01Config.nodes.namedPlatforms) {
    const allRows = source.filter((row) => row.channelUid === spec.channelUid);
    const values = positive.filter((row) => row.channelUid === spec.channelUid);
    const profile = supportProfile(allRows, spec.effectiveParameterCount);
    platforms[spec.channelUid] = nodeEligible(spec, profile, support) && values.length > 0
      ? arithmeticNode(spec.platformId, spec.mechanism, values, profile)
      : fallbackNode(spec.platformId, spec.mechanism, profile, "support_insufficient");
  }
  return Object.freeze({
    schema: "m2.current.psc03.arithmetic_hierarchy_state.v0.1",
    modelId: M2_PSC03_MODEL_ID,
    arm: "D0",
    global,
    mechanisms: Object.freeze(mechanisms),
    platforms: Object.freeze(platforms),
    featuresUsed: false,
    mayBecomeFallbackCandidate: false
  });
}

export function predictM2Psc03Monthly(
  row,
  state,
  occurrenceProbability,
  config,
  psc01Config
) {
  const probability = finite(occurrenceProbability, "frozen_occurrence");
  if (probability < 0 || probability > 1) {
    throw new M2Psc03ContractError("m2_psc03_frozen_occurrence_invalid");
  }
  if (!row.observedAtOrigin) {
    if (m2Psc03Binary64Hex(probability) !== m2Psc03Binary64Hex(0)) {
      throw new M2Psc03ContractError(
        "m2_psc03_future_first_seen_occurrence_not_zero"
      );
    }
    return predictionResult({
      state,
      probability,
      conditional: 0,
      selectedNodeId: "future_first_seen_abstention",
      supportTier: "POOLED_PARENT",
      fallbackReason: "future_first_seen_identity_not_available_at_origin",
      layers: { global: 0, mechanism: 0, namedPlatform: 0 }
    });
  }
  if (state.arm === "D0") {
    const global = state.global.mean;
    const mechanismNode = state.mechanisms[row.mechanism];
    const mechanism = mechanismNode?.mean ?? global;
    const platformNode = state.platforms[row.channelUid];
    const conditional = platformNode?.mean ?? mechanism;
    const selected = platformNode?.mean !== null && platformNode?.mean !== undefined
      ? platformNode
      : mechanismNode?.mean !== null && mechanismNode?.mean !== undefined
        ? mechanismNode
        : state.global;
    return predictionResult({
      state,
      probability,
      conditional,
      selectedNodeId: selected.nodeId,
      supportTier: selected.model === null ? "POOLED_PARENT" : "SHRUNK_FIT",
      fallbackReason: platformNode?.fallbackReason ?? mechanismNode?.fallbackReason ?? null,
      layers: { global, mechanism, namedPlatform: conditional }
    });
  }
  const globalEta = predictQuasiNodeRawEta(row, state.global, 0);
  const mechanismNode = state.mechanisms[row.mechanism];
  const mechanismEta = mechanismNode?.model === null || mechanismNode === undefined
    ? globalEta
    : predictQuasiNodeRawEta(row, mechanismNode, globalEta);
  const platformNode = state.platforms[row.channelUid];
  const platformEta = platformNode?.model === null || platformNode === undefined
    ? mechanismEta
    : predictQuasiNodeRawEta(row, platformNode, mechanismEta);
  const selected = platformNode?.model !== null && platformNode !== undefined
    ? platformNode
    : mechanismNode?.model !== null && mechanismNode !== undefined
      ? mechanismNode
      : state.global;
  const clip = config.numerical.finalPredictionEtaClip;
  const layers = {
    global: Math.exp(clamp(globalEta, clip[0], clip[1])),
    mechanism: Math.exp(clamp(mechanismEta, clip[0], clip[1])),
    namedPlatform: Math.exp(clamp(platformEta, clip[0], clip[1]))
  };
  return predictionResult({
    state,
    probability,
    conditional: layers.namedPlatform,
    selectedNodeId: selected.nodeId,
    supportTier: selected.model === null ? "POOLED_PARENT" : "SHRUNK_FIT",
    fallbackReason: platformNode?.fallbackReason ?? mechanismNode?.fallbackReason ?? null,
    layers
  });
}

export function crossFitM2Psc03Arm({
  rows,
  occurrence,
  config,
  psc01Config,
  support,
  arm,
  evaluationFamily,
  failureInjection = null
}) {
  const source = requireRows(rows).filter(
    (row) => m2Psc03EvaluationFamily(row) === evaluationFamily
  );
  if (source.length === 0) {
    throw new M2Psc03ContractError("m2_psc03_outer_source_empty");
  }
  const predictions = new Map();
  const receipts = [];
  const evaluatedRows = [];
  if (evaluationFamily === "primary") {
    const foldCount = config.selection.primaryOuterWorkFoldCount;
    for (let fold = 0; fold < foldCount; fold += 1) {
      const training = source.filter(
        (row) => deterministicWorkFold(row.standardWorkId, foldCount) !== fold
      );
      const validation = source.filter(
        (row) => deterministicWorkFold(row.standardWorkId, foldCount) === fold
      );
      const fitted = fitOuterArm({
        training,
        config,
        psc01Config,
        support,
        arm,
        selectionFamily: "primary",
        selectionId: fold,
        failureInjection
      });
      predictValidation({
        validation,
        fitted,
        occurrence,
        predictions,
        config,
        psc01Config
      });
      evaluatedRows.push(...validation);
      receipts.push(outerReceipt(fold, training, validation, fitted));
    }
  } else if (evaluationFamily === "strict") {
    for (const outerOrigin of config.selection.strictOrigins) {
      const training = source.filter((row) => (
        row.origin < outerOrigin && row.labelAvailableAsOf < outerOrigin
      ));
      const validation = source.filter((row) => row.origin === outerOrigin);
      if (training.length === 0 || validation.length === 0) {
        throw new M2Psc03ContractError(
          `m2_psc03_strict_outer_rows_missing:${outerOrigin}`
        );
      }
      const fitted = fitOuterArm({
        training,
        config,
        psc01Config,
        support,
        arm,
        selectionFamily: "strict",
        selectionId: outerOrigin,
        failureInjection
      });
      predictValidation({
        validation,
        fitted,
        occurrence,
        predictions,
        config,
        psc01Config
      });
      evaluatedRows.push(...validation);
      receipts.push(outerReceipt(outerOrigin, training, validation, fitted));
    }
  } else {
    throw new M2Psc03ContractError("m2_psc03_evaluation_family_invalid");
  }
  if (predictions.size !== evaluatedRows.length) {
    throw new M2Psc03ContractError("m2_psc03_outer_prediction_coverage_invalid");
  }
  return Object.freeze({
    schema: "m2.current.psc03.outer_predictions.v0.1",
    modelId: M2_PSC03_MODEL_ID,
    candidateId: arm === "P" ? M2_PSC03_RAW_CANDIDATE_ID : null,
    arm,
    evaluationFamily,
    rows: Object.freeze(evaluatedRows),
    predictions,
    receipts: Object.freeze(receipts),
    outerOutcomeUsedForSelection: false,
    rawCandidatePreserved: arm === "P",
    diagnosticMayReplaceCandidate: false
  });
}

export function scoreM2Psc03OuterResult(result, psc01Config) {
  return scoreM2ChannelGenerativeG1Predictions(
    result.rows,
    result.predictions,
    psc01Config,
    { candidateId: result.arm === "P" ? M2_PSC03_RAW_CANDIDATE_ID : result.arm }
  );
}

export function selectM2Psc03Lambda({
  rows,
  config,
  psc01Config,
  support,
  arm,
  selectionFamily,
  selectionId,
  failureInjection = null
}) {
  if (!Object.hasOwn(ESTIMATOR_BY_ARM, arm)) {
    throw new M2Psc03ContractError("m2_psc03_lambda_arm_invalid");
  }
  const splits = selectionFamily === "primary"
    ? primaryInnerSplits(rows, config)
    : strictInnerSplits(rows, config, psc01Config, support);
  const candidates = [];
  for (const lambda of config.selection.lambdaGrid) {
    const metrics = [];
    for (const split of splits) {
      try {
        const state = fitM2Psc03AmountHierarchy(
          split.training,
          config,
          psc01Config,
          support,
          { arm, lambda, failureInjection }
        );
        metrics.push(conditionalUnitDeviance(
          split.validation,
          state,
          arm,
          config,
          psc01Config
        ));
      } catch (error) {
        if (
          !(error instanceof M2Psc03NumericalError)
          && !(error instanceof M2Psc03ContractError)
        ) throw error;
        metrics.push(Infinity);
      }
    }
    const finiteMetrics = metrics.filter(Number.isFinite);
    candidates.push(Object.freeze({
      lambda,
      metric: finiteMetrics.length === metrics.length && metrics.length > 0
        ? mean(metrics)
        : Infinity,
      splitMetrics: Object.freeze(metrics)
    }));
  }
  const eligible = candidates.filter((row) => Number.isFinite(row.metric));
  if (eligible.length === 0) {
    throw new M2Psc03NumericalError(
      `m2_psc03_all_lambda_failed:${selectionFamily}:${selectionId}`
    );
  }
  eligible.sort((left, right) => {
    const difference = left.metric - right.metric;
    return Math.abs(difference) <= config.selection.tieTolerance
      ? right.lambda - left.lambda
      : difference;
  });
  return Object.freeze({
    selectedLambda: eligible[0].lambda,
    selectedMetric: eligible[0].metric,
    candidates: Object.freeze(candidates),
    selectionFamily,
    selectionId,
    outerOutcomeUsedForSelection: false,
    tieBreak: "LARGER_LAMBDA"
  });
}

export function buildM2Psc03SyntheticDiagnostic({
  primaryRows,
  strictRows,
  occurrenceRows,
  config,
  psc01Config,
  support
}) {
  validateM2Psc03DevelopmentConfig(config, psc01Config, support);
  const expected = [
    ...primaryRows.filter((row) => m2Psc03EvaluationFamily(row) === "primary"),
    ...strictRows.filter(
      (row) => config.selection.strictOrigins.includes(row.origin)
    )
  ];
  const occurrence = verifyM2Psc03OccurrenceProjection({
    expectedRows: expected,
    occurrenceRows
  });
  const outputs = {};
  for (const arm of ["D0", "D1", "P"]) {
    const primary = crossFitM2Psc03Arm({
      rows: primaryRows,
      occurrence: occurrence.map,
      config,
      psc01Config,
      support,
      arm,
      evaluationFamily: "primary"
    });
    const strict = crossFitM2Psc03Arm({
      rows: strictRows,
      occurrence: occurrence.map,
      config,
      psc01Config,
      support,
      arm,
      evaluationFamily: "strict"
    });
    outputs[arm] = Object.freeze({
      primary: scoreM2Psc03OuterResult(primary, psc01Config),
      strict: scoreM2Psc03OuterResult(strict, psc01Config),
      primaryPredictionCount: primary.predictions.size,
      strictPredictionCount: strict.predictions.size
    });
  }
  return Object.freeze({
    schema: "m2.current.psc03.public_synthetic_diagnostic.v0.1",
    status: "PSC03_PUBLIC_SYNTHETIC_FULL_PATH_PASSED",
    modelId: M2_PSC03_MODEL_ID,
    rawCandidateId: M2_PSC03_RAW_CANDIDATE_ID,
    experimentId: M2_PSC03_EXPERIMENT_ID,
    preregistrationId: M2_PSC03_PREREGISTRATION_ID,
    arms: Object.freeze(outputs),
    occurrenceParity: Object.freeze({
      rowCount: occurrence.rowCount,
      exactCoverage: occurrence.exactCoverage,
      binary64Tolerance: 0
    }),
    boundaries: Object.freeze({
      publicSyntheticOnly: true,
      privateArtifactRead: false,
      comparatorLoadedAfterPrimarySeal: true,
      taxonomyUsed: false,
      lg01PredictionDependency: false,
      productionModified: false
    })
  });
}

export function m2Psc03EvaluationFamily(row) {
  if (row?.evaluationFamily === "primary") return "primary";
  if (["strict", "strict_rolling"].includes(row?.evaluationFamily)) {
    return "strict";
  }
  throw new M2Psc03ContractError("m2_psc03_evaluation_family_invalid");
}

function fitOuterArm({
  training,
  config,
  psc01Config,
  support,
  arm,
  selectionFamily,
  selectionId,
  failureInjection
}) {
  if (arm === "D0") {
    return Object.freeze({
      state: fitM2Psc03ArithmeticHierarchy(training, psc01Config, support),
      selection: null
    });
  }
  const selection = selectM2Psc03Lambda({
    rows: training,
    config,
    psc01Config,
    support,
    arm,
    selectionFamily,
    selectionId,
    failureInjection
  });
  return Object.freeze({
    state: fitM2Psc03AmountHierarchy(
      training,
      config,
      psc01Config,
      support,
      {
        arm,
        lambda: selection.selectedLambda,
        failureInjection
      }
    ),
    selection
  });
}

function predictValidation({
  validation,
  fitted,
  occurrence,
  predictions,
  config,
  psc01Config
}) {
  for (const row of validation) {
    const key = m2Psc03MonthlyKey(row);
    if (predictions.has(key)) {
      throw new M2Psc03ContractError("m2_psc03_outer_prediction_duplicate");
    }
    if (!occurrence.has(key)) {
      throw new M2Psc03ContractError("m2_psc03_outer_occurrence_missing");
    }
    predictions.set(key, predictM2Psc03Monthly(
      row,
      fitted.state,
      occurrence.get(key),
      config,
      psc01Config
    ));
  }
}

function outerReceipt(id, training, validation, fitted) {
  return Object.freeze({
    id,
    trainingRowCount: training.length,
    trainingPositiveRowCount: training.filter(
      (row) => row.observedAtOrigin && row.actualPositive > 0
    ).length,
    validationRowCount: validation.length,
    selectedLambda: fitted.selection?.selectedLambda ?? null,
    selection: fitted.selection,
    nodeFallbacks: nodeFallbackReceipts(fitted.state),
    outerOutcomeUsedForSelection: false
  });
}

function nodeFallbackReceipts(state) {
  return Object.freeze([
    state.global,
    ...Object.values(state.mechanisms),
    ...Object.values(state.platforms)
  ].filter((node) => node?.fallbackReason !== null).map((node) => Object.freeze({
    nodeId: node.nodeId,
    parentNodeId: node.parentNodeId,
    fallbackReason: node.fallbackReason,
    sameEstimatorParent: state.arm !== "D0"
  })));
}

function primaryInnerSplits(rows, config) {
  const splits = [];
  const foldCount = config.selection.primaryInnerWorkFoldCount;
  for (let repeat = 0; repeat < config.selection.primaryInnerWorkFoldRepeats; repeat += 1) {
    for (let fold = 0; fold < foldCount; fold += 1) {
      const assignment = (row) => deterministicWorkFold(
        `${row.standardWorkId}|${config.selection.innerWorkFoldSalt}|${repeat}`,
        foldCount
      );
      const training = rows.filter((row) => assignment(row) !== fold);
      const validation = rows.filter((row) => assignment(row) === fold);
      if (training.length > 0 && validation.length > 0) {
        splits.push(Object.freeze({ training, validation, repeat, fold }));
      }
    }
  }
  if (splits.length !== foldCount * config.selection.primaryInnerWorkFoldRepeats) {
    throw new M2Psc03ContractError("m2_psc03_primary_inner_split_incomplete");
  }
  return splits;
}

function strictInnerSplits(rows, config, psc01Config, support) {
  const origins = [...new Set(rows.map((row) => row.origin))].sort();
  const legal = origins.flatMap((innerOrigin) => {
    const training = rows.filter((row) => (
      row.origin < innerOrigin && row.labelAvailableAsOf < innerOrigin
    ));
    const validation = rows.filter((row) => row.origin === innerOrigin);
    const globalSpec = psc01Config.nodes.globalPooledParent;
    const eligible = training.length > 0
      && validation.length > 0
      && nodeEligible(
        globalSpec,
        supportProfile(training, globalSpec.effectiveParameterCount),
        support
      );
    return eligible
      ? [Object.freeze({ training, validation, innerOrigin })]
      : [];
  });
  const splits = legal.slice(-config.selection.strictInnerLatestOriginCount);
  if (splits.length < config.selection.strictInnerMinimumOriginCount) {
    throw new M2Psc03ContractError("m2_psc03_strict_inner_origins_insufficient");
  }
  return splits;
}

function conditionalUnitDeviance(rows, state, arm, config, psc01Config) {
  const positive = rows.filter(
    (row) => row.observedAtOrigin && row.actualPositive > 0
  );
  if (positive.length === 0) return Infinity;
  let total = 0;
  for (const row of positive) {
    const prediction = predictM2Psc03Monthly(
      row,
      state,
      1,
      config,
      psc01Config
    );
    const y = row.actualPositive;
    const mu = prediction.conditionalPositiveAmount;
    const value = arm === "P"
      ? 2 * (y * Math.log(y / mu) - (y - mu))
      : 2 * (y / mu - 1 - Math.log(y / mu));
    if (!Number.isFinite(value) || value < -1e-10) return Infinity;
    total += Math.max(0, value);
  }
  return total / positive.length;
}

function fitChildOrFallback({
  rows,
  allRows,
  spec,
  estimator,
  lambda,
  config,
  psc01Config,
  support,
  nodeId,
  parentNodeId,
  parentEta,
  failureInjection
}) {
  const profile = supportProfile(allRows, spec.effectiveParameterCount);
  if (!nodeEligible(spec, profile, support) || rows.length === 0) {
    return fallbackNode(nodeId, parentNodeId, profile, "support_insufficient");
  }
  try {
    if (failureInjected(failureInjection, nodeId)) {
      throw new M2Psc03NumericalError(`m2_psc03_injected_child_failure:${nodeId}`);
    }
    return fitQuasiNode({
      rows,
      allRows,
      spec,
      estimator,
      lambda,
      config,
      psc01Config,
      supportProfile: profile,
      parentEta,
      nodeId,
      parentNodeId
    });
  } catch (error) {
    if (!(error instanceof M2Psc03NumericalError)) throw error;
    return fallbackNode(
      nodeId,
      parentNodeId,
      profile,
      `same_estimator_parent_after_numerical_failure:${error.code}`
    );
  }
}

function fitQuasiNode({
  rows,
  spec,
  estimator,
  lambda,
  config,
  psc01Config,
  supportProfile: profile,
  parentEta,
  nodeId,
  parentNodeId = null
}) {
  const weights = m2Psc03CaseBalancedWeights(rows);
  const standardizer = fitStandardizer(rows, weights, psc01Config.featureOrder);
  const design = rows.map((row) => designRow(row, standardizer, spec, psc01Config));
  const expectedColumns = spec.effectiveParameterCount;
  if (design.some((row) => row.length !== expectedColumns)) {
    throw new M2Psc03ContractError(`m2_psc03_design_width_invalid:${nodeId}`);
  }
  const offsets = rows.map(parentEta);
  const model = fitM2Psc03QuasiLikelihood({
    family: estimator,
    design,
    targets: rows.map((row) => finite(row.actualPositive, "positive_target")),
    weights,
    offsets,
    lambda,
    numerical: config.numerical
  });
  return Object.freeze({
    nodeId,
    parentNodeId,
    model,
    standardizer,
    spec: Object.freeze({
      basisMechanism: spec.basisMechanism,
      basisProfile: spec.basisProfile,
      effectiveParameterCount: spec.effectiveParameterCount
    }),
    basisProfiles: psc01Config.basisProfiles,
    support: profile,
    fallbackReason: null,
    offsetCoefficient: parentNodeId === null ? null : 1
  });
}

function predictQuasiNodeRawEta(row, node, parentEta) {
  if (node.model === null) return parentEta;
  const vector = designRow(row, node.standardizer, node.spec, {
    featureOrder: node.standardizer.featureOrder,
    basisProfiles: node.basisProfiles
  });
  return parentEta + dot(vector, node.model.coefficients);
}

function arithmeticNode(nodeId, parentNodeId, rows, profile) {
  return Object.freeze({
    nodeId,
    parentNodeId,
    model: Object.freeze({ kind: "ARITHMETIC_MEAN" }),
    mean: mean(rows.map((row) => row.actualPositive)),
    support: profile,
    fallbackReason: null
  });
}

function fallbackNode(nodeId, parentNodeId, profile, reason) {
  return Object.freeze({
    nodeId,
    parentNodeId,
    model: null,
    mean: null,
    support: profile,
    fallbackReason: reason,
    offsetCoefficient: 1
  });
}

function predictionResult({
  state,
  probability,
  conditional,
  selectedNodeId,
  supportTier,
  fallbackReason,
  layers
}) {
  const amount = finite(conditional, "conditional_positive_amount");
  const point = probability * amount;
  if (!Number.isFinite(point) || point < 0) {
    throw new M2Psc03NumericalError("m2_psc03_prediction_nonfinite");
  }
  return Object.freeze({
    candidateId: state.arm === "P" ? M2_PSC03_RAW_CANDIDATE_ID : state.arm,
    arm: state.arm,
    positivePoint: point,
    pointEstimate: point,
    occurrenceProbability: probability,
    occurrenceBinary64: m2Psc03Binary64Hex(probability),
    conditionalPositiveAmount: amount,
    selectedNodeId,
    supportTier,
    fallbackReason,
    layerConditionalPositiveAmount: Object.freeze({ ...layers }),
    occurrenceApplicationCount: 1,
    horizonAggregationCount: 0,
    taxonomyFeatureUsed: false,
    lg01PredictionDependency: false,
    postHocCalibrationUsed: false
  });
}

function fitStandardizer(rows, weights, featureOrder) {
  const means = featureOrder.map((field) => sum(rows.map(
    (row, index) => weights[index] * finite(row.features?.[field], field)
  )));
  const standardDeviations = featureOrder.map((field, fieldIndex) => {
    const variance = sum(rows.map((row, rowIndex) => (
      weights[rowIndex]
        * (finite(row.features?.[field], field) - means[fieldIndex]) ** 2
    )));
    const value = Math.sqrt(Math.max(0, variance));
    return value === 0 ? 1 : value;
  });
  return Object.freeze({
    featureOrder: Object.freeze([...featureOrder]),
    means: Object.freeze(means),
    standardDeviations: Object.freeze(standardDeviations),
    equalCaseWeights: true,
    workBalanced: false
  });
}

function designRow(row, standardizer, spec, psc01Config) {
  const standardized = standardizer.featureOrder.map((field, index) => (
    (finite(row.features?.[field], field) - standardizer.means[index])
      / standardizer.standardDeviations[index]
  ));
  const featureIndex = Object.fromEntries(
    standardizer.featureOrder.map((field, index) => [field, index])
  );
  const basis = timeBasis(row.futureMonthIndex);
  const profiles = psc01Config.basisProfiles;
  if (profiles === undefined) {
    throw new M2Psc03ContractError("m2_psc03_basis_profiles_missing");
  }
  const contract = profiles[spec.basisProfile][spec.basisMechanism];
  const output = [1, ...standardized];
  for (const field of contract.base) output.push(finite(basis[field], field));
  for (const [timeField, featureField] of contract.interactions) {
    output.push(
      finite(basis[timeField], timeField) * standardized[featureIndex[featureField]]
    );
  }
  return output;
}

function supportProfile(rows, effectiveParameterCount) {
  const works = new Set(rows.map((row) => row.standardWorkId));
  const positiveRows = rows.filter((row) => row.actualPositive > 0);
  const positiveWorks = new Set(positiveRows.map((row) => row.standardWorkId));
  const origins = new Set(rows.map((row) => row.origin));
  const cashByWork = new Map();
  for (const row of positiveRows) {
    cashByWork.set(
      row.standardWorkId,
      (cashByWork.get(row.standardWorkId) ?? 0) + row.actualPositive
    );
  }
  const total = sum([...cashByWork.values()]);
  const hhi = total <= 0 ? 1 : sum(
    [...cashByWork.values()].map((value) => (value / total) ** 2)
  );
  return Object.freeze({
    distinctWorks: works.size,
    positiveDistinctWorks: positiveWorks.size,
    positiveMonths: positiveRows.length,
    independentOrigins: origins.size,
    cashEffectiveWorkCount: hhi <= 0 ? 0 : 1 / hhi,
    effectiveParameterCount
  });
}

function nodeEligible(spec, profile, support) {
  if (spec.frozenTier === "POOLED_PARENT" || spec.frozenTier === "REPORT_ONLY") {
    return false;
  }
  const rule = support.tierRules[spec.frozenTier];
  if (rule === undefined) return false;
  const minimumWorks = spec.frozenTier === "SHRUNK_FIT"
    ? Math.max(8, spec.effectiveParameterCount)
    : spec.effectiveParameterCount;
  const minimumPositive = spec.frozenTier === "SHRUNK_FIT"
    ? Math.max(6, Math.ceil(spec.effectiveParameterCount / 2))
    : Math.ceil(spec.effectiveParameterCount / 2);
  return profile.distinctWorks >= minimumWorks
    && profile.positiveDistinctWorks >= minimumPositive
    && profile.independentOrigins >= Number(rule.minimumIndependentOrigins ?? 0);
}

function failureInjected(value, nodeId) {
  if (value === null || value === undefined) return false;
  if (value === true) return true;
  if (value instanceof Set) return value.has(nodeId);
  if (Array.isArray(value)) return value.includes(nodeId);
  return value[nodeId] === true;
}

function requireRows(rows, { requireFeatures = true } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new M2Psc03ContractError("m2_psc03_monthly_rows_required");
  }
  for (const row of rows) {
    if (
      typeof row?.standardWorkId !== "string"
      || typeof row?.channelUid !== "string"
      || typeof row?.origin !== "string"
      || !Number.isInteger(Number(row?.futureMonthIndex))
      || !Number.isFinite(Number(row?.actualPositive))
      || !Number.isFinite(Number(row?.actual))
      || (requireFeatures && row.observedAtOrigin && typeof row.features !== "object")
    ) {
      throw new M2Psc03ContractError("m2_psc03_monthly_row_invalid");
    }
  }
  return rows;
}

function requireQuasiInputs({
  family,
  design,
  targets,
  weights,
  offsets,
  coefficients,
  lambda
}) {
  if (!["POISSON", "GAMMA"].includes(family)) {
    throw new M2Psc03ContractError("m2_psc03_quasi_family_invalid");
  }
  if (
    !Array.isArray(design)
    || design.length === 0
    || targets.length !== design.length
    || weights.length !== design.length
    || offsets.length !== design.length
    || !Number.isFinite(lambda)
    || lambda < 0
    || design.some((row) => row.length !== coefficients.length)
    || targets.some((value) => !Number.isFinite(value) || value <= 0)
    || weights.some((value) => !Number.isFinite(value) || value <= 0)
    || offsets.some((value) => !Number.isFinite(value))
    || coefficients.some((value) => !Number.isFinite(value))
  ) {
    throw new M2Psc03ContractError("m2_psc03_quasi_input_invalid");
  }
}

function solveLinearSystem(matrix, vector, pivotTolerance) {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) {
        pivot = row;
      }
    }
    if (Math.abs(augmented[pivot][column]) <= pivotTolerance) {
      throw new M2Psc03NumericalError("m2_psc03_singular_hessian");
    }
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
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

function timeBasis(index) {
  const value = finite(index, "future_month_index");
  const u = value / 36;
  return Object.freeze({
    u,
    u_squared: u ** 2,
    short: Math.exp(-(value - 1) / 3),
    short_spike: Math.exp(-(value - 1) / 3),
    long_tail: Math.exp(-(value - 1) / 18)
  });
}

function finite(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new M2Psc03ContractError(`m2_psc03_nonfinite:${field}`);
  }
  return number;
}

function dot(left, right) {
  let total = 0;
  for (let index = 0; index < left.length; index += 1) {
    total += left[index] * right[index];
  }
  return total;
}

function sum(values) {
  let total = 0;
  for (const value of values) total += Number(value);
  return total;
}

function mean(values) {
  return values.length === 0 ? null : sum(values) / values.length;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function equal(actual, expected, field, failures) {
  if (actual !== expected) failures.push(field);
}

function jsonEqual(actual, expected, field, failures) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) failures.push(field);
}
