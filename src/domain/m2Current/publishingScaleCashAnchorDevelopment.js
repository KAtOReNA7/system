import { createHash } from "node:crypto";

import {
  M2_PSC02_ANCHOR_AVAILABLE,
  M2_PSC02_EXPERIMENT_ID,
  M2_PSC02_GAMMA_NUMERICAL_FAILURE,
  assertM2Psc02OccurrenceParity,
  evaluateM2Psc02ExactCaseCoverage,
  m2Psc02ReferenceArmIds,
  predictM2Psc02MonthlyReference,
  validateM2Psc02Preregistration
} from "./publishingScaleCashAnchorPreregistration.js";
import {
  scoreM2ChannelGenerativeG1Predictions
} from "./channelGenerative.js";

export const M2_PSC02_MODEL_ID = "M2-CHAN-PSC02";
export const M2_PSC02_RAW_CANDIDATE_ID = "M2-CHAN-PSC02-RAW";
export const M2_PSC02_IMPLEMENTATION_SCHEMA =
  "m2.current.publishing_scale_channel_origin_visible_cash_anchor_development.v0.1";
export const M2_PSC02_IMPLEMENTATION_STATUS =
  "M2_PSC02_CORE_IMPLEMENTED_CONTROLLED_DEVELOPMENT_REPLAY_AUTHORIZED_NOT_EXECUTED";

const ARM_IDS = m2Psc02ReferenceArmIds();
const MECHANISMS = Object.freeze([
  "membership",
  "advertising",
  "transactional"
]);
const EPSILON = 1e-12;

export class M2Psc02DevelopmentContractError extends Error {
  constructor(message) {
    super(message);
    this.name = "M2Psc02DevelopmentContractError";
  }
}

export function validateM2Psc02DevelopmentConfig(
  implementation,
  {
    preregistration,
    psc01Config,
    supportContract,
    evaluationContract = null,
    businessAcceptanceContract = null
  }
) {
  validateM2Psc02Preregistration(preregistration, {
    psc01Config,
    evaluationContract,
    businessAcceptanceContract
  });
  const failures = [];
  equal(implementation?.schema, M2_PSC02_IMPLEMENTATION_SCHEMA, "schema", failures);
  equal(implementation?.status, M2_PSC02_IMPLEMENTATION_STATUS, "status", failures);
  equal(implementation?.modelId, M2_PSC02_MODEL_ID, "model_id", failures);
  equal(
    implementation?.rawCandidateId,
    M2_PSC02_RAW_CANDIDATE_ID,
    "raw_candidate_id",
    failures
  );
  equal(
    implementation?.experimentId,
    M2_PSC02_EXPERIMENT_ID,
    "experiment_id",
    failures
  );
  equal(implementation?.primaryArmId, ARM_IDS.P, "primary_arm", failures);
  jsonEqual(
    implementation?.diagnosticArmIds,
    [ARM_IDS.D0, ARM_IDS.D1],
    "diagnostic_arms",
    failures
  );
  jsonEqual(
    preregistration?.occurrenceFreeze?.featureOrder,
    psc01Config?.featureOrder,
    "feature_order_copy",
    failures
  );
  jsonEqual(
    preregistration?.occurrenceFreeze?.basisProfiles,
    psc01Config?.basisProfiles,
    "basis_profiles_copy",
    failures
  );
  equal(
    supportContract?.contractId,
    "M2-PUBLISHING-SCALE-SUPPORT-01",
    "support_contract",
    failures
  );
  equal(
    implementation?.executionWindow?.maximumCompletePrimaryRawResults,
    1,
    "single_complete_result",
    failures
  );
  equal(
    implementation?.runtimeBinding?.linuxAndWindowsExactHeadCiRequired,
    true,
    "dual_platform_ci",
    failures
  );
  for (const [field, expected] of Object.entries({
    taxonomy: "REPORT_ONLY",
    lg01ModelInputAllowed: false,
    independentEvaluationAuthorized: false,
    laterOriginAuthorized: false,
    finalHoldoutOpened: false,
    productionReady: false,
    productionModified: false,
    automationAuthorized: false,
    databaseAllowed: false,
    apiAllowed: false,
    providerAllowed: false,
    financialUseAllowed: false,
    activeCandidate: null,
    approvedForAutomation: null
  })) {
    equal(
      implementation?.boundaries?.[field],
      expected,
      `boundary_${field}`,
      failures
    );
  }
  if (failures.length > 0) {
    throw new M2Psc02DevelopmentContractError(
      `m2_psc02_development_config_invalid:${failures.join(",")}`
    );
  }
  return true;
}

export function fitM2Psc02ResidualHierarchy(
  rows,
  {
    armId,
    preregistration,
    psc01Config,
    supportContract,
    selection = {kind: "PRIMARY_WORK_FOLDS"}
  }
) {
  if (![ARM_IDS.D1, ARM_IDS.P].includes(armId)) {
    throw new M2Psc02DevelopmentContractError(
      "m2_psc02_residual_fit_arm_invalid"
    );
  }
  const source = requirePositiveTrainingRows(rows, psc01Config.featureOrder);
  const fitNode = (selected, spec, nodeId, parentNodeId, global = false) => {
    const support = supportProfile(selected, spec.effectiveParameterCount);
    if (!global && !nodeEligible(spec, support, supportContract)) {
      return frozenNode({
        nodeId,
        parentNodeId,
        tier: "POOLED_PARENT",
        support,
        model: null,
        selectedLambda: null,
        fallbackReason: "insufficient_preregistered_residual_support"
      });
    }
    const selectedLambda = selectM2Psc02Lambda(selected, {
      armId,
      spec,
      preregistration,
      psc01Config,
      selection
    });
    if (selectedLambda === null) {
      if (global) {
        return frozenNode({
          nodeId,
          parentNodeId,
          tier: "NUMERICAL_FAILURE",
          support,
          model: null,
          selectedLambda: null,
          fallbackReason: "global_nested_selection_has_no_valid_fit"
        });
      }
      return frozenNode({
        nodeId,
        parentNodeId,
        tier: "POOLED_PARENT",
        support,
        model: null,
        selectedLambda: null,
        fallbackReason: "child_nested_selection_has_no_valid_fit"
      });
    }
    const model = fitResidualNode(selected, {
      armId,
      spec,
      lambda: selectedLambda,
      preregistration,
      psc01Config
    });
    if (model.status !== "CONVERGED") {
      if (global) {
        return frozenNode({
          nodeId,
          parentNodeId,
          tier: "NUMERICAL_FAILURE",
          support,
          model: null,
          selectedLambda,
          fallbackReason: model.failureReason
        });
      }
      return frozenNode({
        nodeId,
        parentNodeId,
        tier: "POOLED_PARENT",
        support,
        model: null,
        selectedLambda,
        fallbackReason: model.failureReason
      });
    }
    return frozenNode({
      nodeId,
      parentNodeId,
      tier: spec.frozenTier,
      support,
      model,
      selectedLambda,
      fallbackReason: null
    });
  };

  const global = fitNode(
    source,
    psc01Config.nodes.globalPooledParent,
    "globalPooledParent",
    "anchorIdentityResidual",
    true
  );
  if (global.model === null) {
    return Object.freeze({
      schema: "m2.current.psc02.residual_hierarchy_state.v0.1",
      status: M2_PSC02_GAMMA_NUMERICAL_FAILURE,
      armId,
      modelId: M2_PSC02_MODEL_ID,
      candidateId: armId === ARM_IDS.P ? M2_PSC02_RAW_CANDIDATE_ID : null,
      global,
      mechanisms: Object.freeze({}),
      platforms: Object.freeze({}),
      estimatorSwitchUsed: false,
      diagnosticArmReplacementUsed: false
    });
  }
  const mechanisms = Object.fromEntries(MECHANISMS.map((mechanism) => [
    mechanism,
    fitNode(
      source.filter((row) => row.mechanism === mechanism),
      psc01Config.nodes.mechanisms[mechanism],
      mechanism,
      "globalPooledParent"
    )
  ]));
  const platforms = Object.fromEntries(
    psc01Config.nodes.namedPlatforms.map((spec) => [
      spec.channelUid,
      spec.frozenTier === "POOLED_PARENT"
        ? frozenNode({
          nodeId: spec.platformId,
          parentNodeId: spec.mechanism,
          tier: "POOLED_PARENT",
          support: supportProfile(
            source.filter((row) => row.channelUid === spec.channelUid),
            spec.effectiveParameterCount
          ),
          model: null,
          selectedLambda: null,
          fallbackReason: "frozen_platform_parent_pooling"
        })
        : fitNode(
          source.filter((row) => row.channelUid === spec.channelUid),
          spec,
          spec.platformId,
          spec.mechanism
        )
    ])
  );
  return Object.freeze({
    schema: "m2.current.psc02.residual_hierarchy_state.v0.1",
    status: "FITTED",
    armId,
    modelId: M2_PSC02_MODEL_ID,
    candidateId: armId === ARM_IDS.P ? M2_PSC02_RAW_CANDIDATE_ID : null,
    global,
    mechanisms: Object.freeze(mechanisms),
    platforms: Object.freeze(platforms),
    trainingWeight: "EQUAL_TOTAL_WEIGHT_PER_STANDARD_WORK_NORMALIZED_TO_SUM_ONE",
    taxonomy: "REPORT_ONLY",
    lg01PredictionUsed: false,
    estimatorSwitchUsed: false
  });
}

export function predictM2Psc02MonthlyDevelopment(
  row,
  state,
  {preregistration, psc01Config}
) {
  requirePredictionRow(row, psc01Config.featureOrder);
  if (state === null) {
    return decoratePrediction(row, predictM2Psc02MonthlyReference({
      armId: ARM_IDS.D0,
      occurrenceProbability: row.occurrenceProbability,
      anchor: row.anchor,
      residualLogMultiplier: 0
    }), {
      selectedNodeId: "anchorIdentityResidual",
      hierarchyPath: ["anchorIdentityResidual"],
      fallbackReason: null,
      residualLayers: {anchorIdentityResidual: 0}
    });
  }
  if (state?.status !== "FITTED") {
    throw new M2Psc02DevelopmentContractError(
      "m2_psc02_prediction_state_not_fitted"
    );
  }
  let residual = blendedResidual(row, state.global, 0, psc01Config);
  const path = ["anchorIdentityResidual", "globalPooledParent"];
  const layers = {anchorIdentityResidual: 0, globalPooledParent: residual};
  let selected = state.global;
  const mechanism = state.mechanisms[row.mechanism];
  if (mechanism !== undefined) {
    residual = blendedResidual(row, mechanism, residual, psc01Config);
    path.push(mechanism.nodeId);
    layers.mechanism = residual;
    selected = mechanism.model === null ? selected : mechanism;
  }
  const platform = state.platforms[row.channelUid];
  if (platform !== undefined) {
    residual = blendedResidual(row, platform, residual, psc01Config);
    path.push(platform.nodeId);
    layers.namedPlatform = residual;
    selected = platform.model === null ? selected : platform;
  }
  const prediction = predictM2Psc02MonthlyReference({
    armId: state.armId,
    occurrenceProbability: row.occurrenceProbability,
    anchor: row.anchor,
    residualLogMultiplier: residual
  });
  return decoratePrediction(row, prediction, {
    selectedNodeId: selected.nodeId,
    hierarchyPath: path,
    fallbackReason: selected.fallbackReason,
    residualLayers: layers
  });
}

export function crossFitM2Psc02Primary(rows, options) {
  const source = requireEvaluationRows(rows, options.psc01Config.featureOrder);
  const foldCount = options.preregistration.trainingAndSelection
    .primaryOuterWorkFoldCount;
  const outputs = {D0: [], D1: [], P: [], receipts: []};
  for (let fold = 0; fold < foldCount; fold += 1) {
    const validation = source.filter(
      (row) => workFold(row.standardWorkId, foldCount, "outer") === fold
    );
    if (validation.length === 0) continue;
    const training = source.filter(
      (row) => workFold(row.standardWorkId, foldCount, "outer") !== fold
    );
    const selection = {kind: "PRIMARY_WORK_FOLDS", salt: `outer-${fold}`};
    const d1 = fitM2Psc02ResidualHierarchy(training, {
      ...options,
      armId: ARM_IDS.D1,
      selection
    });
    const primary = fitM2Psc02ResidualHierarchy(training, {
      ...options,
      armId: ARM_IDS.P,
      selection
    });
    if (primary.status !== "FITTED") {
      return failedCrossFit(primary, fold, "primary");
    }
    outputs.D0.push(...validation.map((row) => (
      predictM2Psc02MonthlyDevelopment(row, null, options)
    )));
    outputs.D1.push(...validation.map((row) => (
      predictM2Psc02MonthlyDevelopment(row, d1, options)
    )));
    outputs.P.push(...validation.map((row) => (
      predictM2Psc02MonthlyDevelopment(row, primary, options)
    )));
    outputs.receipts.push(Object.freeze({fold, d1, primary}));
  }
  return finalizeCrossFit(source, outputs, "PRIMARY_CROSS_WORK");
}

export function strictRollingM2Psc02(rows, options) {
  const source = requireEvaluationRows(rows, options.psc01Config.featureOrder);
  const outputs = {D0: [], D1: [], P: [], receipts: []};
  for (const origin of options.preregistration.trainingAndSelection.strictOrigins) {
    const validation = source.filter((row) => row.origin === origin);
    if (validation.length === 0) continue;
    const training = source.filter((row) => (
      row.origin < origin && row.labelAvailableAsOf < origin
    ));
    const selection = {kind: "STRICT_TIME_ORIGINS", outerOrigin: origin};
    const d1 = fitM2Psc02ResidualHierarchy(training, {
      ...options,
      armId: ARM_IDS.D1,
      selection
    });
    const primary = fitM2Psc02ResidualHierarchy(training, {
      ...options,
      armId: ARM_IDS.P,
      selection
    });
    if (primary.status !== "FITTED") {
      return failedCrossFit(primary, origin, "strict");
    }
    outputs.D0.push(...validation.map((row) => (
      predictM2Psc02MonthlyDevelopment(row, null, options)
    )));
    outputs.D1.push(...validation.map((row) => (
      predictM2Psc02MonthlyDevelopment(row, d1, options)
    )));
    outputs.P.push(...validation.map((row) => (
      predictM2Psc02MonthlyDevelopment(row, primary, options)
    )));
    outputs.receipts.push(Object.freeze({origin, d1, primary}));
  }
  return finalizeCrossFit(source.filter((row) => (
    options.preregistration.trainingAndSelection.strictOrigins.includes(row.origin)
  )), outputs, "STRICT_ROLLING_TIME");
}

export function verifyM2Psc02FrozenPopulation({psc01Rows, psc02Rows}) {
  assertM2Psc02OccurrenceParity(psc01Rows, psc02Rows);
  return evaluateM2Psc02ExactCaseCoverage(psc01Rows, psc02Rows);
}

export function scoreM2Psc02Arm(rows, predictions, psc01Config) {
  return scoreM2ChannelGenerativeG1Predictions(
    rows,
    predictions,
    psc01Config,
    {candidateId: M2_PSC02_RAW_CANDIDATE_ID}
  );
}

export function buildM2Psc02SyntheticImplementationDiagnostic({
  implementation,
  preregistration,
  psc01Config,
  supportContract,
  evaluationContract = null,
  businessAcceptanceContract = null
}) {
  validateM2Psc02DevelopmentConfig(implementation, {
    preregistration,
    psc01Config,
    supportContract,
    evaluationContract,
    businessAcceptanceContract
  });
  const rows = syntheticRows(psc01Config.featureOrder);
  const options = {preregistration, psc01Config, supportContract};
  const d1 = fitM2Psc02ResidualHierarchy(rows, {
    ...options,
    armId: ARM_IDS.D1,
    selection: {kind: "PRIMARY_WORK_FOLDS", salt: "synthetic"}
  });
  const primary = fitM2Psc02ResidualHierarchy(rows, {
    ...options,
    armId: ARM_IDS.P,
    selection: {kind: "PRIMARY_WORK_FOLDS", salt: "synthetic"}
  });
  if (d1.status !== "FITTED" || primary.status !== "FITTED") {
    throw new M2Psc02DevelopmentContractError(
      "m2_psc02_synthetic_hierarchy_not_fitted"
    );
  }
  const sample = rows[0];
  const d0Prediction = predictM2Psc02MonthlyDevelopment(sample, null, options);
  const d1Prediction = predictM2Psc02MonthlyDevelopment(sample, d1, options);
  const primaryPrediction = predictM2Psc02MonthlyDevelopment(
    sample,
    primary,
    options
  );
  const scaledRows = rows.map((row) => ({
    ...row,
    anchor: {...row.anchor, value: row.anchor.value * 10},
    actualPositive: row.actualPositive * 10
  }));
  const scaled = fitM2Psc02ResidualHierarchy(scaledRows, {
    ...options,
    armId: ARM_IDS.P,
    selection: {kind: "PRIMARY_WORK_FOLDS", salt: "synthetic"}
  });
  const scaledPrediction = predictM2Psc02MonthlyDevelopment(
    scaledRows[0],
    scaled,
    options
  );
  if (Math.abs(
    scaledPrediction.positivePoint / primaryPrediction.positivePoint - 10
  ) > 1e-9) {
    throw new M2Psc02DevelopmentContractError(
      "m2_psc02_synthetic_scale_equivariance_failed"
    );
  }
  return Object.freeze({
    schema: "m2.current.psc02.implementation_diagnostic.v0.1",
    status: "M2_PSC02_PUBLIC_SYNTHETIC_IMPLEMENTATION_VERIFIED",
    modelId: M2_PSC02_MODEL_ID,
    rawCandidateId: M2_PSC02_RAW_CANDIDATE_ID,
    experimentId: M2_PSC02_EXPERIMENT_ID,
    arms: Object.freeze({
      anchorOnlyDiagnostic: d0Prediction.armId,
      logRatioDiagnostic: d1Prediction.armId,
      primary: primaryPrediction.armId
    }),
    scaleEquivarianceFactor: 10,
    occurrenceMultiplyCount: primaryPrediction.occurrenceMultiplyCount,
    anchorApplyCount: primaryPrediction.anchorApplyCount,
    taxonomyUsed: false,
    lg01PredictionUsed: false,
    estimatorSwitchUsed: false,
    privateRowsUsed: false,
    realOutcomeUsed: false,
    independentEvaluationOpened: false,
    finalHoldoutOpened: false,
    productionModified: false
  });
}

function selectM2Psc02Lambda(rows, options) {
  const splits = selectionSplits(rows, options.selection, options.preregistration);
  if (splits.length === 0) return null;
  const candidates = [];
  for (const lambda of options.preregistration.trainingAndSelection
    .hyperparameterGrid) {
    const losses = [];
    for (const split of splits) {
      const state = fitResidualNode(split.training, {...options, lambda});
      if (state.status !== "CONVERGED") continue;
      const loss = gammaUnitDeviance(split.validation, state, options);
      if (Number.isFinite(loss)) losses.push(loss);
    }
    if (losses.length === splits.length && losses.length > 0) {
      candidates.push({lambda, loss: mean(losses)});
    }
  }
  candidates.sort((left, right) => (
    Math.abs(left.loss - right.loss) <= EPSILON
      ? right.lambda - left.lambda
      : left.loss - right.loss
  ));
  return candidates[0]?.lambda ?? null;
}

function selectionSplits(rows, selection, preregistration) {
  if (selection.kind === "STRICT_TIME_ORIGINS") {
    const candidates = preregistration.trainingAndSelection
      .strictInnerOriginCandidates.filter((origin) => (
        origin < selection.outerOrigin
        && rows.some((row) => row.origin === origin)
      )).slice(-3);
    if (candidates.length < preregistration.trainingAndSelection
      .minimumStrictInnerOrigins) return [];
    return candidates.flatMap((origin) => {
      const training = rows.filter((row) => (
        row.origin < origin && row.labelAvailableAsOf < origin
      ));
      const validation = rows.filter((row) => row.origin === origin);
      return training.length > 0 && validation.length > 0
        ? [{training, validation}]
        : [];
    });
  }
  const foldCount = preregistration.trainingAndSelection
    .primaryInnerWorkFoldCount;
  const repeats = preregistration.trainingAndSelection
    .primaryInnerWorkFoldRepeats;
  const splits = [];
  for (let repeat = 0; repeat < repeats; repeat += 1) {
    for (let fold = 0; fold < foldCount; fold += 1) {
      const salt = `${selection.salt ?? "inner"}-${repeat}`;
      const training = rows.filter(
        (row) => workFold(row.standardWorkId, foldCount, salt) !== fold
      );
      const validation = rows.filter(
        (row) => workFold(row.standardWorkId, foldCount, salt) === fold
      );
      if (training.length > 0 && validation.length > 0) {
        splits.push({training, validation});
      }
    }
  }
  return splits;
}

function fitResidualNode(rows, {
  armId,
  spec,
  lambda,
  preregistration,
  psc01Config
}) {
  const source = requirePositiveTrainingRows(rows, psc01Config.featureOrder);
  const weights = workBalancedWeights(source);
  const standardizer = fitFeatureStandardizer(
    source,
    weights,
    psc01Config.featureOrder
  );
  const design = source.map((row) => designRow(
    row,
    standardizer,
    spec,
    psc01Config
  ));
  if (armId === ARM_IDS.D1) {
    const response = source.map((row) => Math.log(
      row.actualPositive / row.anchor.value
    ));
    try {
      return Object.freeze({
        status: "CONVERGED",
        armId,
        lambda,
        coefficients: Object.freeze(fitWeightedRidge(
          design,
          response,
          weights,
          lambda,
          preregistration.amountDesign.estimators.P.pivotTolerance
        )),
        standardizer,
        spec: Object.freeze({...spec}),
        objectiveTrace: Object.freeze([]),
        estimatorSwitchUsed: false
      });
    } catch (error) {
      return residualFailure(armId, "RIDGE_LINEAR_SOLVE_FAILED", error);
    }
  }
  return fitWeightedGammaOffset({
    source,
    design,
    weights,
    lambda,
    standardizer,
    spec,
    numerical: preregistration.amountDesign.estimators.P
  });
}

function fitWeightedGammaOffset({
  source,
  design,
  weights,
  lambda,
  standardizer,
  spec,
  numerical
}) {
  let coefficients = Array(design[0].length).fill(0);
  let current;
  try {
    current = gammaEvaluation(source, design, weights, coefficients, lambda);
  } catch (error) {
    return residualFailure(ARM_IDS.P, "INITIAL_UNCLIPPED_TARGET_NONFINITE", error);
  }
  const trace = [current.objective];
  for (let iteration = 1; iteration <= numerical.maximumIterations; iteration += 1) {
    let delta;
    try {
      delta = solveLinear(
        current.hessian,
        current.gradient,
        numerical.pivotTolerance
      );
    } catch (error) {
      return residualFailure(ARM_IDS.P, "SINGULAR_UNCLIPPED_TARGET_HESSIAN", error);
    }
    let accepted = null;
    let scale = 1;
    for (let halving = 0; halving <= numerical.maximumStepHalvings; halving += 1) {
      const candidate = coefficients.map(
        (value, index) => value - scale * delta[index]
      );
      try {
        const evaluated = gammaEvaluation(
          source,
          design,
          weights,
          candidate,
          lambda
        );
        if (evaluated.objective <= current.objective + 1e-15) {
          accepted = {coefficients: candidate, evaluated};
          break;
        }
      } catch {
        // The frozen contract requires step halving on non-finite proposals.
      }
      scale /= 2;
    }
    if (accepted === null) {
      return residualFailure(ARM_IDS.P, "OBJECTIVE_STEP_HALVING_EXHAUSTED");
    }
    const coefficientChange = Math.max(...accepted.coefficients.map(
      (value, index) => Math.abs(value - coefficients[index])
    ));
    const relativeObjectiveChange = Math.abs(
      accepted.evaluated.objective - current.objective
    ) / Math.max(1, Math.abs(current.objective));
    coefficients = accepted.coefficients;
    current = accepted.evaluated;
    trace.push(current.objective);
    if (coefficientChange <= numerical.coefficientTolerance
        && relativeObjectiveChange <= numerical.relativeObjectiveTolerance) {
      return Object.freeze({
        status: "CONVERGED",
        armId: ARM_IDS.P,
        lambda,
        coefficients: Object.freeze(coefficients),
        standardizer,
        spec: Object.freeze({...spec}),
        objective: current.objective,
        objectiveTrace: Object.freeze(trace),
        iterations: iteration,
        fitLinearPredictorClipUsed: false,
        estimatorSwitchUsed: false
      });
    }
  }
  return residualFailure(ARM_IDS.P, "MAXIMUM_ITERATIONS_WITHOUT_CONVERGENCE");
}

function gammaEvaluation(rows, design, weights, coefficients, lambda) {
  let objective = 0;
  const gradient = Array(coefficients.length).fill(0);
  const hessian = zeroMatrix(coefficients.length);
  for (let index = 0; index < rows.length; index += 1) {
    const eta = dot(design[index], coefficients);
    const logRatio = Math.log(rows[index].actualPositive)
      - Math.log(rows[index].anchor.value) - eta;
    const ratio = Math.exp(logRatio);
    const rowObjective = ratio + Math.log(rows[index].anchor.value) + eta;
    if (![eta, logRatio, ratio, rowObjective].every(Number.isFinite)) {
      throw new M2Psc02DevelopmentContractError(
        `m2_psc02_gamma_nonfinite:${index}`
      );
    }
    const weight = weights[index];
    objective += weight * rowObjective;
    for (let left = 0; left < coefficients.length; left += 1) {
      gradient[left] += weight * (1 - ratio) * design[index][left];
      for (let right = 0; right < coefficients.length; right += 1) {
        hessian[left][right] += weight * ratio
          * design[index][left] * design[index][right];
      }
    }
  }
  for (let index = 1; index < coefficients.length; index += 1) {
    objective += 0.5 * lambda * coefficients[index] ** 2;
    gradient[index] += lambda * coefficients[index];
    hessian[index][index] += lambda;
  }
  if (!Number.isFinite(objective)
      || gradient.some((value) => !Number.isFinite(value))
      || hessian.some((row) => row.some((value) => !Number.isFinite(value)))) {
    throw new M2Psc02DevelopmentContractError(
      "m2_psc02_gamma_derivative_nonfinite"
    );
  }
  return {objective, gradient, hessian};
}

function gammaUnitDeviance(rows, state, {psc01Config}) {
  const weights = workBalancedWeights(rows);
  return sum(rows.map((row, index) => {
    const residual = rawResidual(row, state, psc01Config);
    const meanValue = row.anchor.value * Math.exp(residual);
    const ratio = row.actualPositive / meanValue;
    return weights[index] * 2 * (ratio - Math.log(ratio) - 1);
  }));
}

function fitFeatureStandardizer(rows, weights, featureOrder) {
  const means = featureOrder.map((field) => sum(rows.map(
    (row, index) => weights[index] * finite(row.features[field], field)
  )));
  const standardDeviations = featureOrder.map((field, fieldIndex) => {
    const variance = sum(rows.map((row, rowIndex) => (
      weights[rowIndex]
        * (finite(row.features[field], field) - means[fieldIndex]) ** 2
    )));
    const value = Math.sqrt(Math.max(0, variance));
    return value === 0 ? 1 : value;
  });
  return Object.freeze({
    featureOrder: Object.freeze([...featureOrder]),
    means: Object.freeze(means),
    standardDeviations: Object.freeze(standardDeviations),
    fitOnlyOnTraining: true
  });
}

function designRow(row, standardizer, spec, config) {
  const standardized = standardizer.featureOrder.map((field, index) => (
    (finite(row.features[field], field) - standardizer.means[index])
      / standardizer.standardDeviations[index]
  ));
  const featureIndex = Object.fromEntries(standardizer.featureOrder.map(
    (field, index) => [field, index]
  ));
  const basis = timeBasis(row.futureMonthIndex);
  const contract = config.basisProfiles[spec.basisProfile][spec.basisMechanism];
  return [
    1,
    ...standardized,
    ...contract.base.map((field) => basis[field]),
    ...contract.interactions.map(([timeField, featureField]) => (
      basis[timeField] * standardized[featureIndex[featureField]]
    ))
  ];
}

function rawResidual(row, model, config) {
  const value = dot(
    designRow(row, model.standardizer, model.spec, config),
    model.coefficients
  );
  if (!Number.isFinite(value)) {
    throw new M2Psc02DevelopmentContractError(
      "m2_psc02_residual_prediction_nonfinite"
    );
  }
  return value;
}

function blendedResidual(row, node, parentResidual, config) {
  if (node.model === null) return parentResidual;
  const child = rawResidual(row, node.model, config);
  const weight = node.support.conditionalAmountShrinkageWeight;
  return weight * child + (1 - weight) * parentResidual;
}

function supportProfile(rows, effectiveParameterCount) {
  const workCash = new Map();
  for (const row of rows) {
    workCash.set(
      row.standardWorkId,
      (workCash.get(row.standardWorkId) ?? 0) + row.actualPositive
    );
  }
  const cash = [...workCash.values()];
  const total = sum(cash);
  const hhi = total <= 0 ? 1 : sum(cash.map((value) => (value / total) ** 2));
  const effective = hhi <= 0 ? 0 : 1 / hhi;
  return Object.freeze({
    distinctWorks: workCash.size,
    positiveDistinctWorks: workCash.size,
    independentOrigins: new Set(rows.map((row) => row.origin)).size,
    positiveMonths: rows.length,
    cashEffectiveWorkCount: effective,
    effectiveParameterCount,
    conditionalAmountShrinkageWeight: clamp(
      effective / (effective + effectiveParameterCount),
      0,
      1
    )
  });
}

function nodeEligible(spec, profile, supportContract) {
  if (spec.frozenTier === "POOLED_PARENT") return false;
  const rule = supportContract.tierRules[spec.frozenTier];
  return profile.distinctWorks >= Math.max(8, spec.effectiveParameterCount)
    && profile.positiveDistinctWorks >= Math.max(
      6,
      Math.ceil(spec.effectiveParameterCount / 2)
    )
    && profile.independentOrigins >= rule.minimumIndependentOrigins;
}

function frozenNode(value) {
  return Object.freeze({...value});
}

function decoratePrediction(row, prediction, details) {
  return Object.freeze({
    ...prediction,
    candidateId: prediction.armId === ARM_IDS.P
      ? M2_PSC02_RAW_CANDIDATE_ID
      : prediction.armId,
    caseKey: row.caseKey,
    selectedNodeId: details.selectedNodeId,
    hierarchyPath: Object.freeze(details.hierarchyPath),
    fallbackReason: details.fallbackReason,
    residualLayers: Object.freeze(details.residualLayers),
    anchorStatus: row.anchor?.status ?? null,
    anchorLevel: row.anchor?.level ?? null,
    taxonomyFeatureUsed: false,
    lg01PredictionUsed: false,
    rawCandidatePreserved: true,
    fallbackOverwroteRaw: false
  });
}

function finalizeCrossFit(rows, output, evaluationFamily) {
  for (const key of ["D0", "D1", "P"]) {
    if (output[key].length !== rows.length) {
      throw new M2Psc02DevelopmentContractError(
        `m2_psc02_crossfit_row_count_mismatch:${key}`
      );
    }
  }
  assertM2Psc02OccurrenceParity(rows, output.P);
  const coverage = evaluateM2Psc02ExactCaseCoverage(rows, output.P);
  return Object.freeze({
    schema: "m2.current.psc02.crossfit_result.v0.1",
    status: coverage.passed ? "COMPLETE" : coverage.developmentDecision,
    evaluationFamily,
    rows: Object.freeze(rows),
    predictions: Object.freeze({
      D0: Object.freeze(output.D0),
      D1: Object.freeze(output.D1),
      P: Object.freeze(output.P)
    }),
    receipts: Object.freeze(output.receipts),
    coverage,
    rawCandidatePreserved: true,
    fallbackOverwroteRaw: false,
    outerOutcomeUsedForSelection: false
  });
}

function failedCrossFit(state, unit, family) {
  return Object.freeze({
    schema: "m2.current.psc02.crossfit_result.v0.1",
    status: state.status,
    family,
    unit,
    state,
    predictions: null,
    estimatorSwitchUsed: false,
    diagnosticArmReplacementUsed: false
  });
}

function requireEvaluationRows(rows, featureOrder) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new M2Psc02DevelopmentContractError(
      "m2_psc02_evaluation_rows_required"
    );
  }
  const seen = new Set();
  return rows.map((row) => {
    requirePredictionRow(row, featureOrder);
    finite(row.actualPositive, "actualPositive");
    if (typeof row.labelAvailableAsOf !== "string") {
      throw new M2Psc02DevelopmentContractError(
        "m2_psc02_label_availability_required"
      );
    }
    if (seen.has(row.caseKey)) {
      throw new M2Psc02DevelopmentContractError(
        `m2_psc02_duplicate_case_key:${row.caseKey}`
      );
    }
    seen.add(row.caseKey);
    return row;
  });
}

function requirePositiveTrainingRows(rows, featureOrder) {
  const selected = rows.filter((row) => row.actualPositive > 0);
  if (selected.length === 0) {
    throw new M2Psc02DevelopmentContractError(
      "m2_psc02_positive_training_rows_required"
    );
  }
  for (const row of selected) requirePredictionRow(row, featureOrder);
  return selected;
}

function requirePredictionRow(row, featureOrder) {
  for (const field of [
    "caseKey",
    "standardWorkId",
    "channelUid",
    "origin",
    "mechanism"
  ]) {
    if (typeof row?.[field] !== "string" || row[field].length === 0) {
      throw new M2Psc02DevelopmentContractError(
        `m2_psc02_prediction_${field}_invalid`
      );
    }
  }
  if (!MECHANISMS.includes(row.mechanism)) {
    throw new M2Psc02DevelopmentContractError(
      "m2_psc02_prediction_mechanism_invalid"
    );
  }
  if (!Number.isInteger(row.futureMonthIndex) || row.futureMonthIndex <= 0) {
    throw new M2Psc02DevelopmentContractError(
      "m2_psc02_prediction_future_month_invalid"
    );
  }
  finite(row.occurrenceProbability, "occurrenceProbability");
  if (row.occurrenceProbability < 0 || row.occurrenceProbability > 1) {
    throw new M2Psc02DevelopmentContractError(
      "m2_psc02_prediction_occurrence_invalid"
    );
  }
  if (row.anchor?.status !== M2_PSC02_ANCHOR_AVAILABLE
      || !Number.isFinite(row.anchor?.value)
      || row.anchor.value <= 0) {
    throw new M2Psc02DevelopmentContractError(
      "m2_psc02_prediction_anchor_unavailable"
    );
  }
  for (const field of featureOrder) finite(row.features?.[field], field);
}

function workBalancedWeights(rows) {
  const counts = new Map();
  for (const row of rows) {
    counts.set(row.standardWorkId, (counts.get(row.standardWorkId) ?? 0) + 1);
  }
  const raw = rows.map((row) => 1 / counts.get(row.standardWorkId));
  const total = sum(raw);
  return raw.map((value) => value / total);
}

function fitWeightedRidge(design, response, weights, lambda, tolerance) {
  const matrix = zeroMatrix(design[0].length);
  const vector = Array(design[0].length).fill(0);
  for (let row = 0; row < design.length; row += 1) {
    for (let left = 0; left < design[row].length; left += 1) {
      vector[left] += weights[row] * design[row][left] * response[row];
      for (let right = 0; right < design[row].length; right += 1) {
        matrix[left][right] += weights[row]
          * design[row][left] * design[row][right];
      }
    }
  }
  for (let index = 1; index < matrix.length; index += 1) {
    matrix[index][index] += lambda;
  }
  return solveLinear(matrix, vector, tolerance);
}

function solveLinear(matrix, vector, tolerance) {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) {
        pivot = row;
      }
    }
    if (Math.abs(augmented[pivot][column]) <= tolerance) {
      throw new M2Psc02DevelopmentContractError(
        "m2_psc02_linear_pivot_failure"
      );
    }
    [augmented[column], augmented[pivot]] = [
      augmented[pivot],
      augmented[column]
    ];
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

function residualFailure(armId, failureReason, error = null) {
  return Object.freeze({
    status: armId === ARM_IDS.P
      ? M2_PSC02_GAMMA_NUMERICAL_FAILURE
      : "PSC02_D1_LOG_RATIO_RIDGE_NUMERICAL_FAILURE",
    armId,
    failureReason,
    errorCode: error?.message ?? null,
    coefficients: null,
    estimatorSwitchUsed: false,
    diagnosticArmReplacementUsed: false
  });
}

function timeBasis(index) {
  const u = index / 36;
  return {
    u,
    u_squared: u ** 2,
    short: Math.exp(-(index - 1) / 3),
    short_spike: Math.exp(-(index - 1) / 3),
    long_tail: Math.exp(-(index - 1) / 18)
  };
}

function workFold(workId, foldCount, salt) {
  const digest = createHash("sha256")
    .update(`${salt}\u001f${workId}`, "utf8")
    .digest();
  return digest.readUInt32BE(0) % foldCount;
}

function syntheticRows(featureOrder) {
  const rows = [];
  for (let work = 0; work < 36; work += 1) {
    for (let originIndex = 0; originIndex < 3; originIndex += 1) {
      for (let futureMonthIndex = 1; futureMonthIndex <= 3; futureMonthIndex += 1) {
        const origin = `2022-${String(originIndex + 1).padStart(2, "0")}`;
        const base = 20 + work * 2 + originIndex;
        const features = Object.fromEntries(featureOrder.map((field, index) => [
          field,
          Math.log1p(base + index) / (index + 1)
        ]));
        rows.push(Object.freeze({
          caseKey: `w${work}|channel|${origin}|${futureMonthIndex}`,
          standardWorkId: `w${work}`,
          channelUid: "chn_846e11f634e4e518364a",
          origin,
          futureMonthIndex,
          labelAvailableAsOf: `2022-${String(originIndex + 4).padStart(2, "0")}`,
          mechanism: "membership",
          features: Object.freeze(features),
          anchor: Object.freeze({
            status: M2_PSC02_ANCHOR_AVAILABLE,
            level: "WORK_CHANNEL",
            value: base
          }),
          occurrenceProbability: 0.65,
          actualPositive: base * Math.exp(0.03 * futureMonthIndex),
          observedAtOrigin: true,
          actual: base * Math.exp(0.03 * futureMonthIndex),
          actualReversal: 0,
          includedHorizons: [3]
        }));
      }
    }
  }
  return rows;
}

function zeroMatrix(size) {
  return Array.from({length: size}, () => Array(size).fill(0));
}

function finite(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new M2Psc02DevelopmentContractError(
      `m2_psc02_nonfinite:${field}`
    );
  }
  return number;
}

function dot(left, right) {
  return sum(left.map((value, index) => value * right[index]));
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function mean(values) {
  return sum(values) / values.length;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function equal(actual, expected, field, failures) {
  if (!Object.is(actual, expected)) failures.push(field);
}

function jsonEqual(actual, expected, field, failures) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) failures.push(field);
}
