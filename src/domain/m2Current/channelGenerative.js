import {
  deterministicWorkFold
} from "./humanAnchored.js";

export const M2_CHANNEL_GENERATIVE_CORE_CANDIDATES = Object.freeze([
  "G0",
  "G1",
  "G2",
  "G3"
]);

export const M2_CHANNEL_GENERATIVE_RAW_CANDIDATES = Object.freeze([
  "G1",
  "G2"
]);

export const M2_CHANNEL_GENERATIVE_MECHANISMS = Object.freeze([
  "membership",
  "advertising",
  "transactional"
]);

const EPSILON = 1e-12;

export class M2ChannelGenerativeContractError extends Error {
  constructor(code) {
    super(code);
    this.name = "M2ChannelGenerativeContractError";
    this.code = code;
  }
}

export class M2ChannelGenerativeNumericError extends Error {
  constructor(code) {
    super(code);
    this.name = "M2ChannelGenerativeNumericError";
    this.code = code;
  }
}

export function expandM2ChannelGenerativePackedRows(
  packedRows,
  { frozenRows = null } = {}
) {
  const source = requireArray(packedRows, "packed_rows");
  const g0 = frozenRows === null
    ? null
    : buildFrozenG0Index(frozenRows);
  const output = [];
  const keys = new Set();
  for (const packed of source) {
    const standardWorkId = nonempty(
      packed?.standardWorkId,
      "standard_work_id"
    );
    const channelUid = nonempty(packed?.channelUid, "channel_uid");
    const origin = requireMonth(packed?.origin, "origin");
    const observedAtOrigin = packed?.observedAtOrigin === true;
    const mechanism = observedAtOrigin
      ? requireMechanismOrOther(packed?.mechanism)
      : "future_first_seen_label_only";
    const features = observedAtOrigin
      ? requireObject(packed?.features, "features")
      : null;
    const frozen = g0?.channels.get(channelOriginKey(
      standardWorkId,
      channelUid,
      origin
    ));
    if (observedAtOrigin && g0 !== null && frozen === undefined) {
      throw new M2ChannelGenerativeContractError(
        "m2_channel_generative_frozen_G0_channel_missing"
      );
    }
    for (const label of requireArray(
      packed?.futureMonthlyLabels,
      "future_monthly_labels"
    )) {
      const futureMonthIndex = positiveInteger(
        label?.futureMonthIndex,
        "future_month_index"
      );
      const key = monthlyKey(
        standardWorkId,
        channelUid,
        origin,
        futureMonthIndex
      );
      if (keys.has(key)) {
        throw new M2ChannelGenerativeContractError(
          "m2_channel_generative_monthly_label_duplicate"
        );
      }
      keys.add(key);
      const actualPositive = nonnegativeFinite(
        label?.actualPositive,
        "actual_positive"
      );
      const actualReversal = nonnegativeFinite(
        label?.actualReversal,
        "actual_reversal"
      );
      const actual = finite(label?.actual, "actual");
      if (!nearlyEqual(actual, actualPositive - actualReversal)) {
        throw new M2ChannelGenerativeContractError(
          "m2_channel_generative_monthly_cash_not_conserved"
        );
      }
      const includedHorizons = requireArray(
        label?.includedHorizons,
        "included_horizons"
      ).map((value) => positiveInteger(value, "included_horizon"))
        .sort((left, right) => left - right);
      if (
        includedHorizons.length === 0
        || includedHorizons.some((value) => value < futureMonthIndex)
      ) {
        throw new M2ChannelGenerativeContractError(
          "m2_channel_generative_monthly_horizon_membership_invalid"
        );
      }
      const explicitG0 = packed?.g0MonthlyPositive;
      const g0MonthlyPositive = observedAtOrigin
        ? (
          frozen?.monthlyPositive
          ?? nonnegativeFinite(explicitG0, "g0_monthly_positive")
        )
        : 0;
      const reversalRateByHorizon = Object.freeze(Object.fromEntries(
        includedHorizons.map((horizonMonths) => {
          const frozenWork = g0?.works.get(caseKey(
            standardWorkId,
            origin,
            horizonMonths
          ));
          const explicit = packed?.reversalRateByHorizon?.[
            String(horizonMonths)
          ] ?? packed?.reversalRate ?? 0;
          return [
            String(horizonMonths),
            frozenWork?.reversalRate
              ?? fractionInclusive(
                explicit,
                "reversal_rate",
                4
              )
          ];
        })
      ));
      output.push(Object.freeze({
        schema: "m2.current.channel_generative_monthly_row.v0.2",
        evaluationFamily: nonempty(
          packed?.evaluationFamily,
          "evaluation_family"
        ),
        standardWorkId,
        channelUid,
        origin,
        futureMonthIndex,
        futureMonth: requireMonth(label?.futureMonth, "future_month"),
        labelAvailableAsOf: requireMonth(
          label?.labelAvailableAsOf,
          "label_available_as_of"
        ),
        includedHorizons: Object.freeze(includedHorizons),
        observedAtOrigin,
        mechanism,
        features: features === null
          ? null
          : Object.freeze({ ...features }),
        actualPositive,
        actualReversal,
        actual,
        g0MonthlyPositive,
        reversalRateByHorizon,
        trainingWeight: 1,
        futureFirstSeenIdentityUsedAsFeature: false,
        unmaturedLabelZeroImputed: false,
        buyoutCashUsed: false
      }));
    }
  }
  output.sort(compareMonthlyRows);
  return Object.freeze(output);
}

export function verifyM2ChannelGenerativeG0(
  frozenRows,
  {
    expected = null,
    tolerance = 1e-8
  } = {}
) {
  const index = buildFrozenG0Index(frozenRows, tolerance);
  const workRows = [...index.workRows];
  const channelRows = [...index.channelRows];
  const channelsByCase = new Map();
  for (const row of channelRows) {
    const key = caseKey(
      row.standardWorkId,
      row.origin,
      row.horizonMonths
    );
    const values = channelsByCase.get(key) ?? [];
    values.push(row);
    channelsByCase.set(key, values);
  }
  let maximumPositiveConservationDifference = 0;
  let maximumReversalConservationDifference = 0;
  let maximumNetConservationDifference = 0;
  let maximumA0A1Difference = 0;
  let maximumMonthlyOverlapDifference = 0;
  let futureFirstSeenNonzeroPredictionCount = 0;
  let reversalPlacementDifference = 0;
  for (const work of workRows) {
    const channels = channelsByCase.get(caseKey(
      work.standardWorkId,
      work.origin,
      work.horizonMonths
    )) ?? [];
    const positive = sum(channels.map(
      (row) => Number(row.actualPositive)
    ));
    const reversal = sum(channels.map(
      (row) => Number(row.actualReversal)
    ));
    const net = sum(channels.map((row) => Number(row.actual)));
    const a1Positive = sum(channels.map(
      (row) => Number(row.ablationPositivePoints.A1)
    ));
    const a1Net = sum(channels.map(
      (row) => Number(row.ablationPoints.A1)
    ));
    maximumPositiveConservationDifference = Math.max(
      maximumPositiveConservationDifference,
      Math.abs(positive - Number(work.actualPositive)),
      Math.abs(
        a1Positive - Number(work.ablationPositivePoints.A1)
      )
    );
    maximumReversalConservationDifference = Math.max(
      maximumReversalConservationDifference,
      Math.abs(reversal - Number(work.actualReversal))
    );
    maximumNetConservationDifference = Math.max(
      maximumNetConservationDifference,
      Math.abs(net - Number(work.actual)),
      Math.abs(a1Net - Number(work.ablationPoints.A1))
    );
    maximumA0A1Difference = Math.max(
      maximumA0A1Difference,
      Math.abs(
        Number(work.ablationPositivePoints.A0)
          - Number(work.ablationPositivePoints.A1)
      ),
      Math.abs(
        Number(work.ablationPoints.A0)
          - Number(work.ablationPoints.A1)
      )
    );
    const expectedNet = a1Positive * (1 - Number(work.reversalRate));
    reversalPlacementDifference = Math.max(
      reversalPlacementDifference,
      Math.abs(expectedNet - a1Net)
    );
  }
  for (const row of channelRows) {
    if (
      row.observedAtOrigin === false
      && (
        Number(row.ablationPositivePoints.A1) !== 0
        || Number(row.ablationPoints.A1) !== 0
      )
    ) {
      futureFirstSeenNonzeroPredictionCount += 1;
    }
  }
  for (const values of index.overlapGroups.values()) {
    const monthly = values.map(
      (row) => Number(row.ablationPositivePoints.A1)
        / Number(row.horizonMonths)
    );
    maximumMonthlyOverlapDifference = Math.max(
      maximumMonthlyOverlapDifference,
      Math.max(...monthly) - Math.min(...monthly)
    );
  }
  const metrics = Object.freeze(Object.fromEntries(
    ["primary", "strict"].map((family) => {
      const rows = workRows.filter(
        (row) => normalizeEvaluationFamily(row.evaluationFamily) === family
      );
      return [family, scorePointRows(rows.map((row) => ({
        actual: row.actual,
        pointEstimate: row.ablationPoints.A1
      })))];
    })
  ));
  if (expected !== null) {
    for (const family of ["primary", "strict"]) {
      for (const field of ["wape", "signedBias", "absoluteError"]) {
        if (expected?.[family]?.[field] === undefined) continue;
        if (
          !nearlyEqual(
            metrics[family][field],
            Number(expected?.[family]?.[field]),
            tolerance
          )
        ) {
          throw new M2ChannelGenerativeContractError(
            `m2_channel_generative_G0_${family}_${field}_drift`
          );
        }
      }
    }
  }
  const valid = [
    maximumPositiveConservationDifference,
    maximumReversalConservationDifference,
    maximumNetConservationDifference,
    maximumA0A1Difference,
    maximumMonthlyOverlapDifference,
    reversalPlacementDifference
  ].every((value) => value <= tolerance)
    && futureFirstSeenNonzeroPredictionCount === 0;
  if (!valid) {
    throw new M2ChannelGenerativeContractError(
      "CONTRACT_SEMANTIC_BLOCKER"
    );
  }
  return Object.freeze({
    schema: "m2.current.channel_generative_G0_semantic_verifier.v0.2",
    status: "G0_SEMANTIC_EQUIVALENCE_PASS",
    workRowCount: workRows.length,
    channelRowCount: channelRows.length,
    maximumPositiveConservationDifference,
    maximumReversalConservationDifference,
    maximumNetConservationDifference,
    maximumA0A1Difference,
    maximumMonthlyOverlapDifference,
    reversalPlacementDifference,
    futureFirstSeenNonzeroPredictionCount,
    unsupportedChannelFallbackEquivalent: true,
    learnedGlobalRetrained: false,
    commonReversalRetrained: false,
    metrics
  });
}

export function fitM2ChannelGenerativeCandidate(
  rows,
  config,
  {
    candidateId,
    occurrenceL2,
    conditionalAmountL2,
    now = Date.now,
    deadlineMs = Infinity
  }
) {
  const source = requireMonthlyRows(rows);
  const candidate = requireRawCandidate(candidateId);
  const stateByMechanism = {};
  try {
    assertBeforeDeadline(now, deadlineMs);
    for (const mechanism of M2_CHANNEL_GENERATIVE_MECHANISMS) {
      const selected = source.filter((row) => (
        row.observedAtOrigin
        && row.mechanism === mechanism
      ));
      const works = new Set(
        selected.map((row) => row.standardWorkId)
      );
      const positive = selected.filter(
        (row) => row.actualPositive > 0
      );
      const eligibility = config.eligibility;
      if (
        works.size < Number(eligibility.minimumDistinctTrainingWorks)
        || selected.length < Number(
          eligibility.minimumMonthlyTrainingRows
        )
        || positive.length < Number(
          eligibility.minimumPositiveTrainingMonths
        )
      ) {
        stateByMechanism[mechanism] = Object.freeze({
          status: "UNSUPPORTED",
          fallbackReason: "insufficient_parent_training_support",
          trainingRowCount: selected.length,
          trainingWorkCount: works.size,
          positiveTrainingMonthCount: positive.length
        });
        continue;
      }
      const standardizer = fitStandardizer(
        selected,
        config.featureOrder
      );
      const occurrenceDesign = selected.map((row) => (
        designRow(row, standardizer, mechanism, config)
      ));
      const occurrence = fitLogistic(
        occurrenceDesign,
        selected.map((row) => row.actualPositive > 0 ? 1 : 0),
        Number(occurrenceL2),
        config.numerical,
        { now, deadlineMs }
      );
      if (positive.length === 0) {
        stateByMechanism[mechanism] = Object.freeze({
          status: "UNSUPPORTED",
          fallbackReason: "no_positive_amount_rows",
          trainingRowCount: selected.length,
          trainingWorkCount: works.size,
          positiveTrainingMonthCount: 0,
          occurrence,
          standardizer
        });
        continue;
      }
      const amountDesign = positive.map((row) => (
        designRow(row, standardizer, mechanism, config)
      ));
      const offsets = positive.map((row) => (
        candidate === "G2" ? Math.log1p(row.g0MonthlyPositive) : 0
      ));
      const amountTargets = positive.map((row, index) => (
        Math.log1p(row.actualPositive) - offsets[index]
      ));
      const amount = fitRidge(
        amountDesign,
        amountTargets,
        Number(conditionalAmountL2),
        config.numerical,
        { now, deadlineMs }
      );
      const smearing = mean(amountDesign.map((vector, index) => (
        Math.exp(
          amountTargets[index] - dot(vector, amount.coefficients)
        )
      )));
      if (!Number.isFinite(smearing) || smearing <= 0) {
        throw new M2ChannelGenerativeNumericError(
          "m2_channel_generative_smearing_invalid"
        );
      }
      stateByMechanism[mechanism] = Object.freeze({
        status: "FITTED",
        trainingRowCount: selected.length,
        trainingWorkCount: works.size,
        positiveTrainingMonthCount: positive.length,
        occurrence,
        amount: Object.freeze({
          ...amount,
          smearing
        }),
        standardizer
      });
    }
  } catch (error) {
    if (
      error instanceof M2ChannelGenerativeNumericError
      || error?.code === "m2_channel_generative_timeout"
    ) {
      return Object.freeze({
        schema: "m2.current.channel_generative_model_state.v0.2",
        candidateId: candidate,
        status: error?.code === "m2_channel_generative_timeout"
          ? "TIMEOUT"
          : "NUMERICAL_FAILURE",
        failureCode: String(error.code ?? error.message),
        occurrenceL2: Number(occurrenceL2),
        conditionalAmountL2: Number(conditionalAmountL2),
        candidateEligible: false
      });
    }
    throw error;
  }
  return Object.freeze({
    schema: "m2.current.channel_generative_model_state.v0.2",
    candidateId: candidate,
    status: "FITTED",
    occurrenceL2: Number(occurrenceL2),
    conditionalAmountL2: Number(conditionalAmountL2),
    stateByMechanism: Object.freeze(stateByMechanism),
    candidateEligible: true,
    G0UsedAsFeatureOrOffset: candidate === "G2",
    G0UsedForOccurrence: false,
    platformFeatureUsed: false,
    taxonomyFeatureUsed: false,
    scalarFactorUsed: false
  });
}

export function predictM2ChannelGenerativeMonthly(row, state, config) {
  requireMonthlyRow(row);
  if (!M2_CHANNEL_GENERATIVE_RAW_CANDIDATES.includes(
    String(state?.candidateId)
  )) {
    throw new M2ChannelGenerativeContractError(
      "m2_channel_generative_prediction_state_invalid"
    );
  }
  if (!row.observedAtOrigin) {
    return frozenPrediction({
      row,
      candidateId: state.candidateId,
      positivePoint: 0,
      reason: "future_first_seen",
      candidateEligible: state.candidateEligible !== false
    });
  }
  if (state.status !== "FITTED") {
    return frozenPrediction({
      row,
      candidateId: state.candidateId,
      positivePoint: row.g0MonthlyPositive,
      reason: state.status === "TIMEOUT"
        ? "timeout"
        : "numeric_failure",
      candidateEligible: false
    });
  }
  const mechanismState = state.stateByMechanism[row.mechanism];
  if (mechanismState?.status !== "FITTED") {
    return frozenPrediction({
      row,
      candidateId: state.candidateId,
      positivePoint: row.g0MonthlyPositive,
      reason: mechanismState?.fallbackReason
        ?? "insufficient_parent_training_support",
      candidateEligible: state.candidateEligible
    });
  }
  const vector = designRow(
    row,
    mechanismState.standardizer,
    row.mechanism,
    config
  );
  const occurrenceProbability = predictLogistic(
    vector,
    mechanismState.occurrence
  );
  const dynamicResidual = dot(
    vector,
    mechanismState.amount.coefficients
  );
  const offset = state.candidateId === "G2"
    ? Math.log1p(row.g0MonthlyPositive)
    : 0;
  const conditionalPositiveAmount = Math.max(
    0,
    Math.exp(offset + dynamicResidual)
      * mechanismState.amount.smearing - 1
  );
  return Object.freeze({
    candidateId: state.candidateId,
    positivePoint: Math.max(
      0,
      occurrenceProbability * conditionalPositiveAmount
    ),
    occurrenceProbability,
    conditionalPositiveAmount,
    frozenG0MonthlyOffset: row.g0MonthlyPositive,
    dynamicResidual,
    smearingFactor: mechanismState.amount.smearing,
    usedGenerator: true,
    fallbackReason: null,
    candidateEligible: state.candidateEligible,
    platformFeatureUsed: false,
    taxonomyFeatureUsed: false,
    scalarFactorUsed: false
  });
}

export function selectM2ChannelGenerativeInsideTraining(
  rows,
  config,
  {
    now = Date.now,
    deadlineMs = Infinity
  } = {}
) {
  const source = requireMonthlyRows(rows);
  const foldCount = positiveInteger(
    config.selection.innerWorkFoldCount,
    "inner_work_fold_count"
  );
  const grid = gridConfigurations(config);
  const raw = {};
  for (const candidateId of M2_CHANNEL_GENERATIVE_RAW_CANDIDATES) {
    const scored = [];
    for (const parameters of grid) {
      const predictions = new Map();
      let valid = true;
      const foldReceipts = [];
      for (let fold = 0; fold < foldCount; fold += 1) {
        assertBeforeDeadline(now, deadlineMs);
        const training = source.filter((row) => (
          innerWorkFold(row.standardWorkId, foldCount, config) !== fold
        ));
        const validation = source.filter((row) => (
          innerWorkFold(row.standardWorkId, foldCount, config) === fold
        ));
        if (training.length === 0 || validation.length === 0) {
          throw new M2ChannelGenerativeContractError(
            "m2_channel_generative_inner_fold_empty"
          );
        }
        const state = fitM2ChannelGenerativeCandidate(
          training,
          config,
          {
            candidateId,
            occurrenceL2: parameters.occurrenceL2,
            conditionalAmountL2: parameters.conditionalAmountL2,
            now,
            deadlineMs
          }
        );
        if (state.candidateEligible === false) valid = false;
        for (const row of validation) {
          predictions.set(
            monthlyKeyFromRow(row),
            predictM2ChannelGenerativeMonthly(row, state, config)
          );
        }
        foldReceipts.push(Object.freeze({
          fold,
          trainingRowCount: training.length,
          trainingWorkCount: uniqueWorkCount(training),
          validationRowCount: validation.length,
          validationWorkCount: uniqueWorkCount(validation),
          status: state.status,
          outerValidationUsedForSelection: false
        }));
      }
      const evaluation = scoreM2ChannelGenerativePredictions(
        source,
        predictions,
        config,
        { candidateId }
      );
      scored.push(Object.freeze({
        ...parameters,
        candidateId,
        configurationId: configurationId(candidateId, parameters),
        candidateEligible: valid,
        metrics: evaluation.workTotal,
        predictions,
        foldReceipts: Object.freeze(foldReceipts)
      }));
    }
    const valid = scored.filter((item) => item.candidateEligible);
    raw[candidateId] = Object.freeze({
      selected: valid.length === 0
        ? null
        : [...valid].sort(compareConfigurationScore)[0],
      configurations: Object.freeze(scored)
    });
  }
  const blendCandidates = [];
  for (const candidateId of M2_CHANNEL_GENERATIVE_RAW_CANDIDATES) {
    const selected = raw[candidateId].selected;
    if (selected === null) continue;
    for (const alpha of config.grid.blendAlpha) {
      const predictions = new Map();
      for (const row of source) {
        const rawPrediction = selected.predictions.get(
          monthlyKeyFromRow(row)
        );
        predictions.set(monthlyKeyFromRow(row), Object.freeze({
          candidateId: "G3",
          positivePoint:
            Number(alpha) * row.g0MonthlyPositive
            + (1 - Number(alpha)) * rawPrediction.positivePoint,
          occurrenceProbability: null,
          conditionalPositiveAmount: null,
          frozenG0MonthlyOffset: row.g0MonthlyPositive,
          dynamicResidual: null,
          smearingFactor: null,
          usedGenerator: rawPrediction.usedGenerator,
          fallbackReason: rawPrediction.fallbackReason,
          candidateEligible: rawPrediction.candidateEligible,
          innerSelectedRawCandidate: candidateId,
          alpha: Number(alpha)
        }));
      }
      const evaluation = scoreM2ChannelGenerativePredictions(
        source,
        predictions,
        config,
        { candidateId: "G3" }
      );
      blendCandidates.push(Object.freeze({
        candidateId,
        alpha: Number(alpha),
        metrics: evaluation.workTotal,
        predictions
      }));
    }
  }
  const selectedBlend = blendCandidates.length === 0
    ? null
    : [...blendCandidates].sort(compareBlendScore)[0];
  return Object.freeze({
    schema: "m2.current.channel_generative_inner_selection.v0.2",
    raw: Object.freeze(raw),
    blendCandidates: Object.freeze(blendCandidates),
    selectedBlend,
    outerOutcomeUsedForSelection: false
  });
}

export function crossFitM2ChannelGenerative(rows, config, options = {}) {
  const source = requireMonthlyRows(rows).filter(
    (row) => row.evaluationFamily === "primary"
  );
  const foldCount = positiveInteger(
    config.selection.outerPrimaryWorkFoldCount,
    "outer_primary_fold_count"
  );
  const predictions = {
    G1: new Map(),
    G2: new Map(),
    G3: new Map()
  };
  const folds = [];
  for (let fold = 0; fold < foldCount; fold += 1) {
    const training = source.filter(
      (row) => deterministicWorkFold(row.standardWorkId, foldCount) !== fold
    );
    const validation = source.filter(
      (row) => deterministicWorkFold(row.standardWorkId, foldCount) === fold
    );
    if (training.length === 0 || validation.length === 0) {
      throw new M2ChannelGenerativeContractError(
        "m2_channel_generative_outer_primary_fold_empty"
      );
    }
    const deadlineMs = options.deadlineMs
      ?? Date.now() + Number(
        config.numerical.timeoutSecondsPerCandidateOuterFold
      ) * 1000;
    const selection = selectM2ChannelGenerativeInsideTraining(
      training,
      config,
      { ...options, deadlineMs }
    );
    const states = fitSelectedRawStates(
      training,
      selection,
      config,
      { ...options, deadlineMs }
    );
    for (const row of validation) {
      const key = monthlyKeyFromRow(row);
      for (const candidateId of M2_CHANNEL_GENERATIVE_RAW_CANDIDATES) {
        predictions[candidateId].set(
          key,
          predictM2ChannelGenerativeMonthly(
            row,
            states[candidateId],
            config
          )
        );
      }
      predictions.G3.set(
        key,
        blendOuterPrediction(
          row,
          predictions,
          selection.selectedBlend
        )
      );
    }
    folds.push(publicSelectionReceipt({
      id: fold,
      training,
      validation,
      selection,
      states
    }));
  }
  return finalizeOuterEvaluation(source, predictions, folds, config, {
    schema: "m2.current.channel_generative_primary_cross_fit.v0.2",
    evaluationFamily: "primary"
  });
}

export function strictRollingM2ChannelGenerative(
  rows,
  config,
  options = {}
) {
  const source = requireMonthlyRows(rows).filter(
    (row) => row.evaluationFamily === "strict"
  );
  const predictions = {
    G1: new Map(),
    G2: new Map(),
    G3: new Map()
  };
  const origins = [];
  for (const outerOrigin of config.selection.strictOrigins) {
    const training = source.filter((row) => (
      row.origin < outerOrigin
      && row.labelAvailableAsOf <= outerOrigin
    ));
    const validation = source.filter(
      (row) => row.origin === outerOrigin
    );
    if (training.length === 0 || validation.length === 0) {
      origins.push(Object.freeze({
        outerOrigin,
        status: "INSUFFICIENT_MATURE_EARLIER_ROWS",
        trainingRowCount: training.length,
        validationRowCount: validation.length
      }));
      continue;
    }
    const deadlineMs = options.deadlineMs
      ?? Date.now() + Number(
        config.numerical.timeoutSecondsPerCandidateOuterFold
      ) * 1000;
    const selection = selectM2ChannelGenerativeInsideTraining(
      training,
      config,
      { ...options, deadlineMs }
    );
    const states = fitSelectedRawStates(
      training,
      selection,
      config,
      { ...options, deadlineMs }
    );
    for (const row of validation) {
      const key = monthlyKeyFromRow(row);
      for (const candidateId of M2_CHANNEL_GENERATIVE_RAW_CANDIDATES) {
        predictions[candidateId].set(
          key,
          predictM2ChannelGenerativeMonthly(
            row,
            states[candidateId],
            config
          )
        );
      }
      predictions.G3.set(
        key,
        blendOuterPrediction(
          row,
          predictions,
          selection.selectedBlend
        )
      );
    }
    origins.push(Object.freeze({
      outerOrigin,
      status: "EVALUATED",
      ...publicSelectionReceipt({
        id: outerOrigin,
        training,
        validation,
        selection,
        states
      }),
      maximumTrainingLabelAvailableAsOf:
        training.map((row) => row.labelAvailableAsOf).sort().at(-1),
      sameOrLaterOuterTruthRead: false
    }));
  }
  const evaluatedRows = source.filter((row) => (
    predictions.G1.has(monthlyKeyFromRow(row))
  ));
  if (evaluatedRows.length === 0) {
    throw new M2ChannelGenerativeContractError(
      "m2_channel_generative_strict_output_empty"
    );
  }
  return finalizeOuterEvaluation(
    evaluatedRows,
    predictions,
    origins,
    config,
    {
      schema: "m2.current.channel_generative_strict_rolling.v0.2",
      evaluationFamily: "strict"
    }
  );
}

export function scoreM2ChannelGenerativePredictions(
  rows,
  predictions,
  config,
  { candidateId }
) {
  const source = requireMonthlyRows(rows);
  const cases = aggregatePredictionCases(
    source,
    predictions,
    candidateId
  );
  const workTotal = scorePointRows(cases.map((row) => ({
    actual: row.actual,
    pointEstimate: row.pointEstimate
  })));
  const workChannel = scorePointRows(
    cases.flatMap((row) => row.channels).map((row) => ({
      actual: row.actual,
      pointEstimate: row.pointEstimate
    }))
  );
  const byHorizon = scoreSlices(cases, "horizonMonths");
  const byOrigin = scoreSlices(cases, "origin");
  const channelRows = cases.flatMap((row) => row.channels);
  const byMechanism = scoreSlices(
    channelRows.filter((row) => row.observedAtOrigin),
    "mechanism"
  );
  const topRevenue = scoreTopRevenue(
    cases,
    config.evaluation.topRevenueFractions
  );
  const observedMonthly = source.filter((row) => row.observedAtOrigin);
  const usedMonthly = observedMonthly.filter((row) => (
    predictions.get(monthlyKeyFromRow(row))?.usedGenerator === true
  ));
  const observedCash = sum(
    observedMonthly.map((row) => row.actualPositive)
  );
  const usedCash = sum(usedMonthly.map((row) => row.actualPositive));
  return Object.freeze({
    candidateId,
    workTotal,
    workChannel,
    byHorizon,
    byOrigin,
    byMechanism,
    topRevenue,
    coverage: Object.freeze({
      observedChannelMonthlyRowCount: observedMonthly.length,
      generatorMonthlyRowCount: usedMonthly.length,
      generatorObservedChannelRowUsage:
        observedMonthly.length === 0
          ? 0
          : usedMonthly.length / observedMonthly.length,
      observedChannelActualPositiveCash: observedCash,
      generatorActualPositiveCash: usedCash,
      generatorActualPositiveCashUsage:
        observedCash === 0 ? 0 : usedCash / observedCash
    }),
    cases: Object.freeze(cases)
  });
}

export function buildM2ChannelGenerativeSyntheticRows(fixture, config) {
  const source = requireObject(fixture, "fixture");
  const worksPerMechanism = positiveInteger(
    source.worksPerMechanism,
    "works_per_mechanism"
  );
  const origins = requireArray(source.origins, "origins");
  const horizons = requireArray(source.horizons, "horizons")
    .map((value) => positiveInteger(value, "horizon"));
  const maximumHorizon = Math.max(...horizons);
  const packed = [];
  for (
    let mechanismIndex = 0;
    mechanismIndex < M2_CHANNEL_GENERATIVE_MECHANISMS.length;
    mechanismIndex += 1
  ) {
    const mechanism = M2_CHANNEL_GENERATIVE_MECHANISMS[mechanismIndex];
    for (let workIndex = 0; workIndex < worksPerMechanism; workIndex += 1) {
      const standardWorkId = `SYN-${mechanism}-${String(
        workIndex
      ).padStart(3, "0")}`;
      for (let originIndex = 0; originIndex < origins.length; originIndex += 1) {
        const origin = String(origins[originIndex]);
        const history = syntheticHistory(
          mechanism,
          workIndex,
          originIndex,
          Number(source.historyMonths)
        );
        const g0MonthlyPositive = mean(history.slice(-12));
        const features = featureValuesFromHistory({
          channelPositiveSeries: history,
          observedSalesAgeMonths: history.length + 12,
          workTrailing12Positive: sum(history.slice(-12)),
          channelRankPercentile: 0
        });
        const labels = [];
        for (let futureMonthIndex = 1;
          futureMonthIndex <= maximumHorizon;
          futureMonthIndex += 1) {
          const actualPositive = workIndex === worksPerMechanism - 1
            ? 0
            : syntheticFuturePositive({
              mechanism,
              workIndex,
              futureMonthIndex,
              g0MonthlyPositive,
              topRevenueMultiplier: (
                workIndex === 0
                  ? Number(source.topRevenueMultiplier)
                  : 1
              )
            });
          const actualReversal = (
            futureMonthIndex === 2 && workIndex % 17 === 0
          ) ? actualPositive * 0.05 : 0;
          labels.push(Object.freeze({
            futureMonthIndex,
            futureMonth: addMonths(origin, futureMonthIndex),
            labelAvailableAsOf: addMonths(origin, futureMonthIndex),
            actualPositive,
            actualReversal,
            actual: actualPositive - actualReversal,
            includedHorizons: horizons.filter(
              (horizon) => horizon >= futureMonthIndex
            )
          }));
        }
        packed.push(Object.freeze({
          schema: "m2.current.channel_generative_synthetic_packed.v0.2",
          evaluationFamily: originIndex === origins.length - 1
            ? "strict"
            : "primary",
          standardWorkId,
          channelUid: `SYN-CHANNEL-${mechanism}`,
          origin,
          revenueMode: syntheticRevenueMode(mechanism),
          mechanism,
          observedAtOrigin: true,
          features,
          g0MonthlyPositive,
          reversalRateByHorizon: Object.fromEntries(
            horizons.map((horizon) => [String(horizon), 0.02])
          ),
          futureMonthlyLabels: Object.freeze(labels)
        }));
        if (workIndex <= 1) {
          packed.push(Object.freeze({
            schema: "m2.current.channel_generative_synthetic_packed.v0.2",
            evaluationFamily: originIndex === origins.length - 1
              ? "strict"
              : "primary",
            standardWorkId,
            channelUid: `SYN-FUTURE-${origin}`,
            origin,
            revenueMode: "future_first_seen_label_only",
            mechanism: "future_first_seen_label_only",
            observedAtOrigin: false,
            features: null,
            g0MonthlyPositive: 0,
            reversalRateByHorizon: Object.fromEntries(
              horizons.map((horizon) => [String(horizon), 0.02])
            ),
            futureMonthlyLabels: Object.freeze(labels.map((label) => ({
              ...label,
              actualPositive:
                workIndex === 0 && label.futureMonthIndex === 1
                  ? 5
                  : 0,
              actualReversal: 0,
              actual:
                workIndex === 0 && label.futureMonthIndex === 1
                  ? 5
                  : 0
            })))
          }));
        }
      }
    }
  }
  return expandM2ChannelGenerativePackedRows(packed);
}

export function buildM2ChannelGenerativeSyntheticDiagnostic(
  fixture,
  config
) {
  const rows = buildM2ChannelGenerativeSyntheticRows(fixture, config);
  const training = rows.filter(
    (row) => row.evaluationFamily === "primary"
  );
  const parameters = {
    occurrenceL2: config.grid.occurrenceL2[0],
    conditionalAmountL2: config.grid.conditionalAmountL2[0]
  };
  const states = Object.fromEntries(
    M2_CHANNEL_GENERATIVE_RAW_CANDIDATES.map((candidateId) => [
      candidateId,
      fitM2ChannelGenerativeCandidate(training, config, {
        candidateId,
        ...parameters
      })
    ])
  );
  const validation = rows.filter(
    (row) => row.evaluationFamily === "strict"
  );
  const evaluations = {};
  for (const candidateId of M2_CHANNEL_GENERATIVE_RAW_CANDIDATES) {
    const predictions = new Map(validation.map((row) => [
      monthlyKeyFromRow(row),
      predictM2ChannelGenerativeMonthly(
        row,
        states[candidateId],
        config
      )
    ]));
    evaluations[candidateId] = scoreM2ChannelGenerativePredictions(
      validation,
      predictions,
      config,
      { candidateId }
    );
  }
  const allMonthlyKeys = new Set(rows.map(monthlyKeyFromRow));
  if (allMonthlyKeys.size !== rows.length) {
    throw new M2ChannelGenerativeContractError(
      "m2_channel_generative_synthetic_monthly_duplicate"
    );
  }
  return Object.freeze({
    schema: "m2.current.channel_generative_public_diagnostic.v0.2",
    fixtureSchema: String(fixture.schema),
    packedTrainingGrainVerified: true,
    monthlyRowCount: rows.length,
    monthlyUniqueKeyCount: allMonthlyKeys.size,
    workCount: uniqueWorkCount(rows),
    sameWorkAcrossMultipleOrigins: true,
    overlappingHorizonNoDuplicate: true,
    evaluations: Object.freeze(Object.fromEntries(
      Object.entries(evaluations).map(([id, value]) => [
        id,
        publicEvaluation(value)
      ])
    )),
    boundaries: Object.freeze({
      publicSyntheticOnly: true,
      privateArtifactRead: false,
      G1UsesG0: states.G1.G0UsedAsFeatureOrOffset,
      G2UsesG0OnlyAsAmountOffset: true,
      platformFeatureUsed: false,
      taxonomyFeatureUsed: false,
      scalarFactorUsed: false,
      futureFirstSeenPrediction: 0,
      observedZeroMonthsIncluded: true,
      unobservedPreStartMonthsZeroFilled: false,
      immatureLabelsIncluded: false,
      productionLoaderModified: false,
      productionRouteModified: false,
      exactV03Modified: false,
      G4Implemented: false,
      G5Implemented: false,
      G6Implemented: false,
      finalHoldoutUsed: false,
      databaseUsed: false,
      providerUsed: false,
      releaseAuthorized: false
    })
  });
}

export function buildM2ChannelGenerativeForecastabilityDiagnostic(
  rows,
  candidatePredictions,
  config
) {
  const source = requireMonthlyRows(rows);
  const candidates = ["G0", "G1", "G2"];
  const output = {};
  for (const candidateId of candidates) {
    const predictions = candidateId === "G0"
      ? new Map(source.map((row) => [
        monthlyKeyFromRow(row),
        Object.freeze({
          candidateId: "G0",
          positivePoint: row.observedAtOrigin
            ? row.g0MonthlyPositive
            : 0,
          conditionalPositiveAmount: row.g0MonthlyPositive,
          occurrenceProbability: null,
          usedGenerator: false,
          fallbackReason: "frozen_G0"
        })
      ]))
      : candidatePredictions[candidateId];
    const base = scoreM2ChannelGenerativePredictions(
      source,
      predictions,
      config,
      { candidateId }
    );
    const oracleOccurrence = new Map(source.map((row) => {
      const prediction = predictions.get(monthlyKeyFromRow(row));
      return [monthlyKeyFromRow(row), Object.freeze({
        ...prediction,
        candidateId: `${candidateId}_ORACLE_OCCURRENCE`,
        positivePoint: row.actualPositive > 0
          ? Number(
            prediction.conditionalPositiveAmount
              ?? row.g0MonthlyPositive
          )
          : 0
      })];
    }));
    const oracle = scoreM2ChannelGenerativePredictions(
      source,
      oracleOccurrence,
      config,
      { candidateId: `${candidateId}_ORACLE_OCCURRENCE` }
    );
    output[candidateId] = Object.freeze({
      originalAbsoluteError: base.workTotal.absoluteError,
      oracleOccurrenceAbsoluteError: oracle.workTotal.absoluteError,
      maximumRemovableOccurrenceGap:
        base.workTotal.absoluteError - oracle.workTotal.absoluteError,
      remainingConditionalAmountAbsoluteError:
        oracle.workTotal.absoluteError,
      deployable: false,
      selectionEligible: false,
      futureInformationUsed: true
    });
  }
  const futureFirstSeen = source.filter(
    (row) => !row.observedAtOrigin
  );
  const totalActualPositiveCash = sum(
    source.map((row) => row.actualPositive)
  );
  const futureFirstSeenActualPositiveCash = sum(
    futureFirstSeen.map((row) => row.actualPositive)
  );
  return Object.freeze({
    schema: "m2.current.channel_generative_forecastability.v0.1",
    currentReachability: Object.freeze({
      totalActualPositiveCash,
      futureFirstSeenActualPositiveCash,
      futureFirstSeenShare: totalActualPositiveCash === 0
        ? 0
        : futureFirstSeenActualPositiveCash / totalActualPositiveCash,
      completeBayesErrorFloor: false
    }),
    oracleOccurrence: Object.freeze(output),
    participatesInTraining: false,
    participatesInSelection: false,
    participatesInGate: false,
    deployable: false
  });
}

function buildFrozenG0Index(rows, tolerance = 1e-8) {
  const source = requireArray(rows, "frozen_rows");
  const workRows = source.filter((row) => row?.rowKind === "work");
  const channelRows = source.filter(
    (row) => row?.rowKind === "work_channel"
  );
  if (workRows.length === 0 || channelRows.length === 0) {
    throw new M2ChannelGenerativeContractError(
      "m2_channel_generative_frozen_rows_incomplete"
    );
  }
  const works = new Map();
  const channels = new Map();
  const overlapGroups = new Map();
  for (const row of workRows) {
    validateFrozenWorkRow(row);
    const key = caseKey(
      row.standardWorkId,
      row.origin,
      row.horizonMonths
    );
    if (works.has(key)) {
      throw new M2ChannelGenerativeContractError(
        "m2_channel_generative_frozen_work_case_duplicate"
      );
    }
    works.set(key, Object.freeze({
      reversalRate: Number(row.reversalRate)
    }));
  }
  for (const row of channelRows) {
    validateFrozenChannelRow(row);
    const overlapKey = channelOriginKey(
      row.standardWorkId,
      row.channelUid,
      row.origin
    );
    const values = overlapGroups.get(overlapKey) ?? [];
    values.push(row);
    overlapGroups.set(overlapKey, values);
  }
  for (const [key, values] of overlapGroups) {
    const monthly = values.map(
      (row) => Number(row.ablationPositivePoints.A1)
        / Number(row.horizonMonths)
    );
    if (
      Math.max(...monthly) - Math.min(...monthly) > tolerance
    ) {
      throw new M2ChannelGenerativeContractError(
        "CONTRACT_SEMANTIC_BLOCKER"
      );
    }
    channels.set(key, Object.freeze({
      monthlyPositive: monthly[0]
    }));
  }
  return Object.freeze({
    workRows: Object.freeze(workRows),
    channelRows: Object.freeze(channelRows),
    works,
    channels,
    overlapGroups
  });
}

function fitSelectedRawStates(
  training,
  selection,
  config,
  options
) {
  const states = {};
  for (const candidateId of M2_CHANNEL_GENERATIVE_RAW_CANDIDATES) {
    const selected = selection.raw[candidateId].selected;
    states[candidateId] = selected === null
      ? Object.freeze({
        schema: "m2.current.channel_generative_model_state.v0.2",
        candidateId,
        status: "NUMERICAL_FAILURE",
        failureCode: "all_inner_configurations_ineligible",
        candidateEligible: false
      })
      : fitM2ChannelGenerativeCandidate(training, config, {
        candidateId,
        occurrenceL2: selected.occurrenceL2,
        conditionalAmountL2: selected.conditionalAmountL2,
        ...options
      });
  }
  return Object.freeze(states);
}

function blendOuterPrediction(row, predictions, selectedBlend) {
  if (selectedBlend === null) {
    return Object.freeze({
      candidateId: "G3",
      positivePoint: row.g0MonthlyPositive,
      candidateEligible: false,
      usedGenerator: false,
      fallbackReason: "raw_core_ineligible",
      innerSelectedRawCandidate: null,
      alpha: 1
    });
  }
  const raw = predictions[selectedBlend.candidateId].get(
    monthlyKeyFromRow(row)
  );
  return Object.freeze({
    ...raw,
    candidateId: "G3",
    positivePoint:
      selectedBlend.alpha * row.g0MonthlyPositive
      + (1 - selectedBlend.alpha) * raw.positivePoint,
    innerSelectedRawCandidate: selectedBlend.candidateId,
    alpha: selectedBlend.alpha
  });
}

function finalizeOuterEvaluation(
  rows,
  predictions,
  receipts,
  config,
  identity
) {
  const evaluations = Object.fromEntries(
    ["G1", "G2", "G3"].map((candidateId) => [
      candidateId,
      scoreM2ChannelGenerativePredictions(
        rows,
        predictions[candidateId],
        config,
        { candidateId }
      )
    ])
  );
  return Object.freeze({
    ...identity,
    rows: Object.freeze(rows),
    predictions: Object.freeze(predictions),
    receipts: Object.freeze(receipts),
    evaluations: Object.freeze(evaluations),
    rawOutputsPreserved: Object.freeze(["G1", "G2"]),
    blendOverwroteRaw: false,
    outerOutcomeUsedForSelection: false,
    G4Executed: false,
    G5Executed: false,
    G6Executed: false
  });
}

function publicSelectionReceipt({
  id,
  training,
  validation,
  selection,
  states
}) {
  return Object.freeze({
    id,
    trainingRowCount: training.length,
    trainingWorkCount: uniqueWorkCount(training),
    validationRowCount: validation.length,
    validationWorkCount: uniqueWorkCount(validation),
    selectedRawConfigurations: Object.freeze(Object.fromEntries(
      M2_CHANNEL_GENERATIVE_RAW_CANDIDATES.map((candidateId) => {
        const selected = selection.raw[candidateId].selected;
        return [candidateId, selected === null ? null : {
          occurrenceL2: selected.occurrenceL2,
          conditionalAmountL2: selected.conditionalAmountL2,
          configurationId: selected.configurationId,
          outerOutcomeUsedForSelection: false
        }];
      })
    )),
    selectedBlend: selection.selectedBlend === null ? null : {
      candidateId: selection.selectedBlend.candidateId,
      alpha: selection.selectedBlend.alpha,
      outerOutcomeUsedForSelection: false,
      theoryEvidenceEligible: false
    },
    stateStatus: Object.freeze(Object.fromEntries(
      Object.entries(states).map(([key, value]) => [key, value.status])
    )),
    outerValidationUsedForSelection: false
  });
}

function aggregatePredictionCases(rows, predictions, candidateId) {
  const groups = new Map();
  for (const row of rows) {
    const prediction = predictions.get(monthlyKeyFromRow(row));
    if (!prediction) {
      throw new M2ChannelGenerativeContractError(
        "m2_channel_generative_prediction_missing"
      );
    }
    for (const horizonMonths of row.includedHorizons) {
      const key = `${row.standardWorkId}\u001f${row.origin}`
        + `\u001f${horizonMonths}`;
      let value = groups.get(key);
      if (!value) {
        value = {
          standardWorkId: row.standardWorkId,
          origin: row.origin,
          horizonMonths,
          actualPositive: 0,
          actualReversal: 0,
          positivePoint: 0,
          g0PositivePoint: 0,
          reversalRate: finite(
            row.reversalRateByHorizon?.[String(horizonMonths)],
            "reversal_rate_by_horizon"
          ),
          channels: new Map()
        };
        groups.set(key, value);
      }
      const reversalRate = finite(
        row.reversalRateByHorizon?.[String(horizonMonths)],
        "reversal_rate_by_horizon"
      );
      if (!nearlyEqual(value.reversalRate, reversalRate)) {
        throw new M2ChannelGenerativeContractError(
          "m2_channel_generative_reversal_rate_case_drift"
        );
      }
      value.actualPositive += row.actualPositive;
      value.actualReversal += row.actualReversal;
      value.positivePoint += prediction.positivePoint;
      value.g0PositivePoint += row.observedAtOrigin
        ? row.g0MonthlyPositive
        : 0;
      let channel = value.channels.get(row.channelUid);
      if (!channel) {
        channel = {
          channelUid: row.channelUid,
          mechanism: row.mechanism,
          observedAtOrigin: row.observedAtOrigin,
          actualPositive: 0,
          actualReversal: 0,
          positivePoint: 0,
          g0PositivePoint: 0
        };
        value.channels.set(row.channelUid, channel);
      }
      channel.actualPositive += row.actualPositive;
      channel.actualReversal += row.actualReversal;
      channel.positivePoint += prediction.positivePoint;
      channel.g0PositivePoint += row.observedAtOrigin
        ? row.g0MonthlyPositive
        : 0;
    }
  }
  return [...groups.values()].map((value) => {
    const pointEstimate = value.positivePoint
      * (1 - value.reversalRate);
    const actual = value.actualPositive - value.actualReversal;
    const channels = [...value.channels.values()].map((channel) => (
      Object.freeze({
        ...channel,
        actual: channel.actualPositive - channel.actualReversal,
        pointEstimate:
          channel.positivePoint * (1 - value.reversalRate),
        g0PointEstimate:
          channel.g0PositivePoint * (1 - value.reversalRate)
      })
    ));
    return Object.freeze({
      standardWorkId: value.standardWorkId,
      origin: value.origin,
      horizonMonths: value.horizonMonths,
      actualPositive: value.actualPositive,
      actualReversal: value.actualReversal,
      actual,
      positivePoint: value.positivePoint,
      pointEstimate,
      g0PositivePoint: value.g0PositivePoint,
      g0PointEstimate:
        value.g0PositivePoint * (1 - value.reversalRate),
      candidateId,
      channels: Object.freeze(channels)
    });
  }).sort(compareCases);
}

function fitStandardizer(rows, featureOrder) {
  const values = featureOrder.map((field) => rows.map(
    (row) => finite(row.features?.[field], `feature_${field}`)
  ));
  const means = values.map(mean);
  const standardDeviations = values.map((column, index) => {
    const variance = mean(column.map(
      (value) => (value - means[index]) ** 2
    ));
    return Math.sqrt(variance);
  });
  return Object.freeze({
    featureOrder: Object.freeze([...featureOrder]),
    means: Object.freeze(means),
    standardDeviations: Object.freeze(standardDeviations),
    fitRowCount: rows.length,
    fitOnlyOnTraining: true
  });
}

function designRow(row, standardizer, mechanism, config) {
  const standardized = standardizer.featureOrder.map((field, index) => {
    const raw = finite(row.features?.[field], `feature_${field}`);
    const sd = standardizer.standardDeviations[index];
    return sd === 0 ? 0 : (raw - standardizer.means[index]) / sd;
  });
  const byFeature = Object.fromEntries(
    standardizer.featureOrder.map((field, index) => [
      field,
      standardized[index]
    ])
  );
  const basis = timeBasis(row.futureMonthIndex);
  const contract = config.timeBasis[mechanism];
  const output = [1, ...standardized];
  for (const field of contract.base) {
    output.push(finite(basis[field], `time_basis_${field}`));
  }
  for (const [timeField, featureField] of contract.interactions) {
    output.push(
      finite(basis[timeField], `time_basis_${timeField}`)
      * finite(byFeature[featureField], `feature_${featureField}`)
    );
  }
  return output;
}

function fitLogistic(
  design,
  labels,
  lambda,
  numerical,
  { now, deadlineMs }
) {
  if (design.length === 0 || design.length !== labels.length) {
    throw new M2ChannelGenerativeNumericError(
      "m2_channel_generative_logistic_rows_invalid"
    );
  }
  const positiveCount = sum(labels);
  const rowCount = labels.length;
  if (positiveCount === 0 || positiveCount === rowCount) {
    return Object.freeze({
      kind: "ONE_CLASS",
      constantProbability: (positiveCount + 0.5) / (rowCount + 1),
      coefficients: null,
      iterations: 0,
      converged: true
    });
  }
  const dimension = design[0].length;
  let coefficients = Array(dimension).fill(0);
  const rate = (positiveCount + 0.5) / (rowCount + 1);
  coefficients[0] = Math.log(rate / (1 - rate));
  let previous = logisticObjective(
    design,
    labels,
    coefficients,
    lambda
  );
  for (let iteration = 1;
    iteration <= Number(numerical.maximumIterations);
    iteration += 1) {
    assertBeforeDeadline(now, deadlineMs);
    const matrix = zeroMatrix(dimension);
    const vector = Array(dimension).fill(0);
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const x = design[rowIndex];
      const eta = dot(x, coefficients);
      const probability = sigmoid(eta);
      const weight = Math.max(
        probability * (1 - probability),
        EPSILON
      );
      const adjusted = eta + (labels[rowIndex] - probability) / weight;
      addOuterProduct(matrix, x, weight / rowCount);
      addScaled(vector, x, weight * adjusted / rowCount);
    }
    for (let index = 1; index < dimension; index += 1) {
      matrix[index][index] += lambda;
    }
    const proposal = solveLinearSystem(
      matrix,
      vector,
      Number(numerical.pivotTolerance)
    );
    let step = 1;
    let accepted = null;
    let acceptedObjective = Infinity;
    while (step >= Number(numerical.minimumStepMultiplier)) {
      const trial = coefficients.map(
        (value, index) => value + step * (proposal[index] - value)
      );
      const objective = logisticObjective(
        design,
        labels,
        trial,
        lambda
      );
      if (objective < previous) {
        accepted = trial;
        acceptedObjective = objective;
        break;
      }
      const proposalDifference = Math.max(...trial.map(
        (value, index) => Math.abs(value - coefficients[index])
      ));
      if (
        proposalDifference <= Number(numerical.coefficientTolerance)
        && objective <= previous + EPSILON
      ) {
        accepted = trial;
        acceptedObjective = objective;
        break;
      }
      step /= 2;
    }
    if (accepted === null) {
      throw new M2ChannelGenerativeNumericError(
        "m2_channel_generative_logistic_no_accepted_step"
      );
    }
    const difference = Math.max(...accepted.map(
      (value, index) => Math.abs(value - coefficients[index])
    ));
    coefficients = accepted;
    previous = acceptedObjective;
    if (difference <= Number(numerical.coefficientTolerance)) {
      return Object.freeze({
        kind: "LOGISTIC",
        coefficients: Object.freeze(coefficients),
        iterations: iteration,
        converged: true
      });
    }
  }
  throw new M2ChannelGenerativeNumericError(
    "m2_channel_generative_logistic_max_iterations"
  );
}

function fitRidge(
  design,
  targets,
  lambda,
  numerical,
  { now, deadlineMs }
) {
  assertBeforeDeadline(now, deadlineMs);
  if (design.length === 0 || design.length !== targets.length) {
    throw new M2ChannelGenerativeNumericError(
      "m2_channel_generative_ridge_rows_invalid"
    );
  }
  const dimension = design[0].length;
  const matrix = zeroMatrix(dimension);
  const vector = Array(dimension).fill(0);
  for (let rowIndex = 0; rowIndex < design.length; rowIndex += 1) {
    addOuterProduct(matrix, design[rowIndex], 1 / design.length);
    addScaled(
      vector,
      design[rowIndex],
      targets[rowIndex] / design.length
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
      Number(numerical.pivotTolerance)
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
      if (Math.abs(augmented[row][column])
        > Math.abs(augmented[pivot][column])) {
        pivot = row;
      }
    }
    if (Math.abs(augmented[pivot][column]) <= pivotTolerance) {
      throw new M2ChannelGenerativeNumericError(
        "m2_channel_generative_linear_pivot_failure"
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
  const solution = augmented.map((row) => row[size]);
  if (solution.some((value) => !Number.isFinite(value))) {
    throw new M2ChannelGenerativeNumericError(
      "m2_channel_generative_linear_solution_nonfinite"
    );
  }
  return solution;
}

function logisticObjective(design, labels, coefficients, lambda) {
  let loss = 0;
  for (let index = 0; index < design.length; index += 1) {
    const eta = dot(design[index], coefficients);
    loss += softplus(eta) - labels[index] * eta;
  }
  const penalty = coefficients.slice(1).reduce(
    (total, value) => total + value ** 2,
    0
  );
  return loss / design.length + lambda / 2 * penalty;
}

function predictLogistic(vector, state) {
  return state.kind === "ONE_CLASS"
    ? state.constantProbability
    : sigmoid(dot(vector, state.coefficients));
}

function scorePointRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return Object.freeze({
      caseCount: 0,
      absoluteError: 0,
      signedError: 0,
      actualDenominator: 0,
      wape: null,
      signedBias: null
    });
  }
  let absoluteError = 0;
  let signedError = 0;
  let actualDenominator = 0;
  for (const row of rows) {
    const actual = finite(row.actual, "score_actual");
    const pointEstimate = finite(
      row.pointEstimate,
      "score_point_estimate"
    );
    absoluteError += Math.abs(pointEstimate - actual);
    signedError += pointEstimate - actual;
    actualDenominator += Math.abs(actual);
  }
  return Object.freeze({
    caseCount: rows.length,
    absoluteError,
    signedError,
    actualDenominator,
    wape: actualDenominator === 0
      ? null
      : absoluteError / actualDenominator,
    signedBias: actualDenominator === 0
      ? null
      : signedError / actualDenominator
  });
}

function scoreSlices(rows, field) {
  const keys = [...new Set(rows.map((row) => String(row[field])))].sort();
  return Object.freeze(Object.fromEntries(keys.map((key) => {
    const selected = rows.filter((row) => String(row[field]) === key);
    return [key, scorePointRows(selected.map((row) => ({
      actual: row.actual,
      pointEstimate: row.pointEstimate
    })))];
  })));
}

function scoreTopRevenue(cases, fractions) {
  const byWork = new Map();
  for (const row of cases) {
    const value = byWork.get(row.standardWorkId) ?? {
      standardWorkId: row.standardWorkId,
      actual: 0,
      pointEstimate: 0
    };
    value.actual += row.actual;
    value.pointEstimate += row.pointEstimate;
    byWork.set(row.standardWorkId, value);
  }
  const ordered = [...byWork.values()].sort((left, right) => (
    Math.abs(right.actual) - Math.abs(left.actual)
      || left.standardWorkId.localeCompare(right.standardWorkId)
  ));
  return Object.freeze(Object.fromEntries(fractions.map((fraction) => {
    const count = Math.max(1, Math.ceil(ordered.length * Number(fraction)));
    return [String(fraction), scorePointRows(ordered.slice(0, count))];
  })));
}

function publicEvaluation(value) {
  return Object.freeze({
    candidateId: value.candidateId,
    workTotal: value.workTotal,
    workChannel: value.workChannel,
    byHorizon: value.byHorizon,
    byMechanism: value.byMechanism,
    topRevenue: value.topRevenue,
    coverage: value.coverage
  });
}

function featureValuesFromHistory({
  channelPositiveSeries,
  observedSalesAgeMonths,
  workTrailing12Positive,
  channelRankPercentile
}) {
  const series = channelPositiveSeries.map(Number);
  const age = series.length;
  const last = (count) => series.slice(-Math.min(count, age));
  const recent3 = last(3);
  const previous3 = age >= 4
    ? series.slice(Math.max(0, age - 6), Math.max(0, age - 3))
    : [];
  const recent12 = last(12);
  const positiveIndexes = series.flatMap(
    (value, index) => value > 0 ? [index] : []
  );
  const peak = Math.max(...series);
  const latestPeakIndex = series.lastIndexOf(peak);
  const logSeries = recent12.map((value) => Math.log1p(value));
  const logMean = mean(logSeries);
  return Object.freeze({
    log_recent_1_positive: Math.log1p(sum(last(1))),
    log_recent_3_positive: Math.log1p(sum(recent3)),
    log_recent_12_positive: Math.log1p(sum(recent12)),
    log_cumulative_positive: Math.log1p(sum(series)),
    positive_rate_3: recent3.filter((value) => value > 0).length
      / recent3.length,
    positive_rate_12: recent12.filter((value) => value > 0).length
      / recent12.length,
    log_recent_3_vs_previous_3:
      age < 4
        ? 0
        : Math.log1p(sum(recent3)) - Math.log1p(sum(previous3)),
    previous_3_available: age >= 4 ? 1 : 0,
    log_positive_volatility_12: Math.sqrt(mean(
      logSeries.map((value) => (value - logMean) ** 2)
    )),
    months_since_last_positive_scaled: Math.min(
      age - 1 - positiveIndexes.at(-1),
      36
    ) / 36,
    log_historical_peak_positive: Math.log1p(peak),
    months_since_peak_scaled: Math.min(
      age - 1 - latestPeakIndex,
      36
    ) / 36,
    log_observed_channel_age: Math.log1p(age),
    log_observed_work_age: Math.log1p(observedSalesAgeMonths),
    trailing_12_work_share: workTrailing12Positive === 0
      ? 0
      : sum(recent12) / workTrailing12Positive,
    channel_rank_percentile: channelRankPercentile,
    available_month_fraction_3: Math.min(age, 3) / 3,
    available_month_fraction_12: Math.min(age, 12) / 12
  });
}

function syntheticHistory(mechanism, workIndex, originIndex, length) {
  const level = 10 + workIndex % 11 + originIndex;
  return Array.from({ length }, (_, index) => {
    if (mechanism === "membership") {
      return level * (0.85 + index / (length * 10));
    }
    if (mechanism === "advertising") {
      return index >= length - 3
        ? level * (1.4 + originIndex * 0.1)
        : level * (0.4 + (index % 4) * 0.2);
    }
    return index % 5 === workIndex % 5
      ? level * 2
      : (index % 7 === 0 ? level * 0.25 : 0);
  });
}

function syntheticFuturePositive({
  mechanism,
  workIndex,
  futureMonthIndex,
  g0MonthlyPositive,
  topRevenueMultiplier
}) {
  let value;
  if (mechanism === "membership") {
    value = g0MonthlyPositive * (1 - 0.008 * futureMonthIndex);
  } else if (mechanism === "advertising") {
    value = g0MonthlyPositive * (
      0.7 + 0.8 * Math.exp(-(futureMonthIndex - 1) / 3)
    );
  } else {
    value = (
      futureMonthIndex === 1 + workIndex % 3
        ? g0MonthlyPositive * 3
        : g0MonthlyPositive * 0.35
          * Math.exp(-(futureMonthIndex - 1) / 18)
    );
  }
  return Math.max(0, value * topRevenueMultiplier);
}

function gridConfigurations(config) {
  const output = [];
  for (const occurrenceL2 of config.grid.occurrenceL2) {
    for (const conditionalAmountL2 of config.grid.conditionalAmountL2) {
      output.push(Object.freeze({
        occurrenceL2: Number(occurrenceL2),
        conditionalAmountL2: Number(conditionalAmountL2)
      }));
    }
  }
  return Object.freeze(output);
}

function compareConfigurationScore(left, right) {
  return nullLast(left.metrics.wape, right.metrics.wape)
    || nullLast(
      Math.abs(left.metrics.signedBias),
      Math.abs(right.metrics.signedBias)
    )
    || right.occurrenceL2 - left.occurrenceL2
    || right.conditionalAmountL2 - left.conditionalAmountL2
    || left.configurationId.localeCompare(right.configurationId);
}

function compareBlendScore(left, right) {
  return nullLast(left.metrics.wape, right.metrics.wape)
    || nullLast(
      Math.abs(left.metrics.signedBias),
      Math.abs(right.metrics.signedBias)
    )
    || right.alpha - left.alpha
    || rawCandidatePriority(left.candidateId)
      - rawCandidatePriority(right.candidateId);
}

function nullLast(left, right) {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}

function rawCandidatePriority(value) {
  return value === "G1" ? 0 : 1;
}

function configurationId(candidateId, parameters) {
  return `${candidateId}-O${parameters.occurrenceL2}`
    + `-A${parameters.conditionalAmountL2}`;
}

function innerWorkFold(workId, foldCount, config) {
  return deterministicWorkFold(
    `${workId}${config.selection.innerWorkFoldSalt}`,
    foldCount
  );
}

function frozenPrediction({
  row,
  candidateId,
  positivePoint,
  reason,
  candidateEligible
}) {
  return Object.freeze({
    candidateId,
    positivePoint,
    occurrenceProbability: null,
    conditionalPositiveAmount: row.g0MonthlyPositive,
    frozenG0MonthlyOffset: row.g0MonthlyPositive,
    dynamicResidual: 0,
    smearingFactor: null,
    usedGenerator: false,
    fallbackReason: reason,
    candidateEligible,
    platformFeatureUsed: false,
    taxonomyFeatureUsed: false,
    scalarFactorUsed: false
  });
}

function validateFrozenWorkRow(row) {
  for (const field of [
    "A0",
    "A1"
  ]) {
    finite(row?.ablationPositivePoints?.[field], `frozen_positive_${field}`);
    finite(row?.ablationPoints?.[field], `frozen_point_${field}`);
  }
  finite(row?.actualPositive, "frozen_actual_positive");
  finite(row?.actualReversal, "frozen_actual_reversal");
  finite(row?.actual, "frozen_actual");
  positiveInteger(row?.horizonMonths, "frozen_horizon");
  fractionInclusive(row?.reversalRate, "frozen_reversal_rate", 4);
}

function validateFrozenChannelRow(row) {
  finite(row?.ablationPositivePoints?.A1, "frozen_channel_positive_A1");
  finite(row?.ablationPoints?.A1, "frozen_channel_point_A1");
  finite(row?.actualPositive, "frozen_channel_actual_positive");
  finite(row?.actualReversal, "frozen_channel_actual_reversal");
  finite(row?.actual, "frozen_channel_actual");
  positiveInteger(row?.horizonMonths, "frozen_channel_horizon");
  nonempty(row?.channelUid, "frozen_channel_uid");
}

function requireMonthlyRows(value) {
  const rows = requireArray(value, "monthly_rows");
  if (rows.length === 0) {
    throw new M2ChannelGenerativeContractError(
      "m2_channel_generative_monthly_rows_required"
    );
  }
  for (const row of rows) requireMonthlyRow(row);
  return rows;
}

function requireMonthlyRow(row) {
  if (
    row?.schema !== "m2.current.channel_generative_monthly_row.v0.2"
    || row?.trainingWeight !== 1
    || row?.futureFirstSeenIdentityUsedAsFeature !== false
    || row?.unmaturedLabelZeroImputed !== false
    || row?.buyoutCashUsed !== false
  ) {
    throw new M2ChannelGenerativeContractError(
      "m2_channel_generative_monthly_row_boundary_invalid"
    );
  }
}

function requireRawCandidate(value) {
  const candidate = String(value);
  if (!M2_CHANNEL_GENERATIVE_RAW_CANDIDATES.includes(candidate)) {
    throw new M2ChannelGenerativeContractError(
      "m2_channel_generative_raw_candidate_invalid"
    );
  }
  return candidate;
}

function requireMechanism(value) {
  const mechanism = String(value);
  if (!M2_CHANNEL_GENERATIVE_MECHANISMS.includes(mechanism)) {
    throw new M2ChannelGenerativeContractError(
      "m2_channel_generative_mechanism_invalid"
    );
  }
  return mechanism;
}

function requireMechanismOrOther(value) {
  const mechanism = String(value);
  return mechanism === "other"
    ? mechanism
    : requireMechanism(mechanism);
}

function timeBasis(futureMonthIndex) {
  const t = positiveInteger(futureMonthIndex, "future_month_index");
  const u = t / 36;
  return Object.freeze({
    u,
    u_squared: u ** 2,
    short: Math.exp(-(t - 1) / 3),
    short_spike: Math.exp(-(t - 1) / 3),
    long_tail: Math.exp(-(t - 1) / 18)
  });
}

function syntheticRevenueMode(mechanism) {
  return {
    membership: "membership_subscription",
    advertising: "advertising_or_free_share",
    transactional: "single_purchase_or_on_demand"
  }[mechanism];
}

function sameCase(left, right) {
  return left.evaluationFamily === right.evaluationFamily
    && left.standardWorkId === right.standardWorkId
    && left.origin === right.origin
    && Number(left.horizonMonths) === Number(right.horizonMonths);
}

function normalizeEvaluationFamily(value) {
  return String(value) === "strict_rolling"
    ? "strict"
    : String(value);
}

function monthlyKeyFromRow(row) {
  return monthlyKey(
    row.standardWorkId,
    row.channelUid,
    row.origin,
    row.futureMonthIndex
  );
}

function monthlyKey(workId, channelUid, origin, futureMonthIndex) {
  return `${workId}\u001f${channelUid}\u001f${origin}`
    + `\u001f${futureMonthIndex}`;
}

function workOriginKey(workId, origin) {
  return `${workId}\u001f${origin}`;
}

function caseKey(workId, origin, horizonMonths) {
  return `${workOriginKey(workId, origin)}\u001f${horizonMonths}`;
}

function channelOriginKey(workId, channelUid, origin) {
  return `${workId}\u001f${channelUid}\u001f${origin}`;
}

function compareMonthlyRows(left, right) {
  return left.standardWorkId.localeCompare(right.standardWorkId)
    || left.origin.localeCompare(right.origin)
    || left.channelUid.localeCompare(right.channelUid)
    || left.futureMonthIndex - right.futureMonthIndex;
}

function compareCases(left, right) {
  return left.standardWorkId.localeCompare(right.standardWorkId)
    || left.origin.localeCompare(right.origin)
    || left.horizonMonths - right.horizonMonths;
}

function uniqueWorkCount(rows) {
  return new Set(rows.map((row) => row.standardWorkId)).size;
}

function addMonths(month, count) {
  const [year, rawMonth] = String(month).split("-").map(Number);
  const date = new Date(Date.UTC(year, rawMonth - 1 + count, 1));
  return `${date.getUTCFullYear()}-${String(
    date.getUTCMonth() + 1
  ).padStart(2, "0")}`;
}

function zeroMatrix(size) {
  return Array.from({ length: size }, () => Array(size).fill(0));
}

function addOuterProduct(matrix, vector, scale) {
  for (let row = 0; row < vector.length; row += 1) {
    for (let column = 0; column < vector.length; column += 1) {
      matrix[row][column] += scale * vector[row] * vector[column];
    }
  }
}

function addScaled(target, vector, scale) {
  for (let index = 0; index < vector.length; index += 1) {
    target[index] += scale * vector[index];
  }
}

function dot(left, right) {
  let total = 0;
  for (let index = 0; index < left.length; index += 1) {
    total += left[index] * right[index];
  }
  return total;
}

function softplus(value) {
  if (value > 30) return value;
  if (value < -30) return Math.exp(value);
  return Math.log1p(Math.exp(value));
}

function sigmoid(value) {
  if (value >= 0) {
    const exp = Math.exp(-value);
    return 1 / (1 + exp);
  }
  const exp = Math.exp(value);
  return exp / (1 + exp);
}

function assertBeforeDeadline(now, deadlineMs) {
  if (Number(now()) > Number(deadlineMs)) {
    const error = new M2ChannelGenerativeNumericError(
      "m2_channel_generative_timeout"
    );
    error.code = "m2_channel_generative_timeout";
    throw error;
  }
}

function requireArray(value, name) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new M2ChannelGenerativeContractError(
      `m2_channel_generative_${name}_required`
    );
  }
  return value;
}

function requireObject(value, name) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new M2ChannelGenerativeContractError(
      `m2_channel_generative_${name}_required`
    );
  }
  return value;
}

function nonempty(value, name) {
  const result = String(value ?? "").trim();
  if (result === "") {
    throw new M2ChannelGenerativeContractError(
      `m2_channel_generative_${name}_required`
    );
  }
  return result;
}

function requireMonth(value, name) {
  const month = nonempty(value, name);
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/u.test(month)) {
    throw new M2ChannelGenerativeContractError(
      `m2_channel_generative_${name}_invalid`
    );
  }
  return month;
}

function finite(value, name) {
  const result = Number(value);
  if (!Number.isFinite(result)) {
    throw new M2ChannelGenerativeContractError(
      `m2_channel_generative_${name}_invalid`
    );
  }
  return result;
}

function nonnegativeFinite(value, name) {
  const result = finite(value, name);
  if (result < 0) {
    throw new M2ChannelGenerativeContractError(
      `m2_channel_generative_${name}_negative`
    );
  }
  return result;
}

function positiveInteger(value, name) {
  const result = finite(value, name);
  if (!Number.isInteger(result) || result <= 0) {
    throw new M2ChannelGenerativeContractError(
      `m2_channel_generative_${name}_invalid`
    );
  }
  return result;
}

function fractionInclusive(value, name, maximum = 1) {
  const result = finite(value, name);
  if (result < 0 || result > maximum) {
    throw new M2ChannelGenerativeContractError(
      `m2_channel_generative_${name}_invalid`
    );
  }
  return result;
}

function nearlyEqual(left, right, tolerance = 1e-8) {
  return Math.abs(Number(left) - Number(right)) <= tolerance;
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value), 0);
}

function mean(values) {
  return values.length === 0 ? 0 : sum(values) / values.length;
}
