export const M2_PSC01_AMOUNT_AUDIT_STAGES = Object.freeze([
  "originVisibleEmpiricalParent",
  "globalPooledParent",
  "mechanism",
  "namedPlatform",
  "final"
]);

export const M2_PSC01_PUBLIC_PRIVACY = Object.freeze({
  minimumCaseCount: 30,
  minimumWorkCount: 20,
  suppressedStatus: "SUPPRESSED_PRIVACY_THRESHOLD"
});

const EPSILON = 1e-8;

export function createM2Psc01AmountAuditAccumulator({ namedPlatforms }) {
  const platformByChannel = new Map(namedPlatforms.map((platform) => [
    platform.channelUid,
    Object.freeze({
      platformId: platform.platformId,
      displayNameZh: platform.displayNameZh
    })
  ]));
  return {
    platformByChannel,
    channelCases: new Map(),
    rowCount: 0,
    familyRowCounts: { primary: 0, strict: 0 },
    invariantFailures: {
      identity: 0,
      cashConservation: 0,
      postingCashConservation: 0,
      pointEstimateAlias: 0,
      occurrenceAmountProduct: 0,
      layerOccurrenceAmountProduct: 0,
      nonfinite: 0,
      negativePrediction: 0,
      futureFirstNonzeroPrediction: 0,
      taxonomyFeatureUsed: 0,
      authorizationBackfillUsed: 0,
      rawCandidateNotPreserved: 0,
      fallbackOverwroteRaw: 0,
      caseMetadataDrift: 0
    },
    rowDiagnostics: {
      observedAtOriginRowCount: 0,
      futureFirstRowCount: 0,
      zeroFinalPredictionRowCount: 0,
      fallbackReasonRowCount: 0,
      conditionalAmountAtOrAboveExp30RowCount: 0,
      minimumOccurrenceProbability: 1,
      maximumOccurrenceProbability: 0,
      minimumConditionalPositiveAmount: Number.POSITIVE_INFINITY,
      maximumConditionalPositiveAmount: 0,
      occurrenceShrinkageWeight: rangeAccumulator(),
      conditionalAmountShrinkageWeight: rangeAccumulator()
    }
  };
}

export function accumulateM2Psc01EvaluationRow(accumulator, row) {
  accumulator.rowCount += 1;
  const family = row?.evaluationFamily;
  if (family === "primary" || family === "strict") {
    accumulator.familyRowCounts[family] += 1;
  } else {
    accumulator.invariantFailures.identity += 1;
    return;
  }
  if (
    row?.schema
      !== "m2.current.publishing_scale_channel_evaluation_private_row.v0.2"
    || row?.modelId !== "M2-CHAN-PSC01"
    || row?.experimentArmId
      !== "M2-EXP-PUBLISHING-SCALE-CHANNEL-01/CORE"
    || row?.candidateId !== "M2-CHAN-PSC01-RAW"
    || row?.actualDefinitionId
      !== "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01"
  ) {
    accumulator.invariantFailures.identity += 1;
  }
  const actualPositive = number(row.actualPositive);
  const actualReversal = number(row.actualReversal);
  const actual = number(row.actual);
  const postingPositive = number(row.postingTimeActualPositive);
  const postingReversal = number(row.postingTimeActualReversal);
  const postingActual = number(row.postingTimeActual);
  if (!nearlyEqual(actual, actualPositive - actualReversal)) {
    accumulator.invariantFailures.cashConservation += 1;
  }
  if (!nearlyEqual(postingActual, postingPositive - postingReversal)) {
    accumulator.invariantFailures.postingCashConservation += 1;
  }
  if (!nearlyEqual(number(row.pointEstimate), number(row.positivePoint))) {
    accumulator.invariantFailures.pointEstimateAlias += 1;
  }
  const stages = stageValues(row);
  if (!nearlyEqual(
    stages.final.positivePoint,
    stages.final.occurrenceProbability
      * stages.final.conditionalPositiveAmount
  )) {
    accumulator.invariantFailures.occurrenceAmountProduct += 1;
  }
  for (const stage of M2_PSC01_AMOUNT_AUDIT_STAGES.slice(0, -1)) {
    const value = stages[stage];
    if (!nearlyEqual(
      value.positivePoint,
      value.occurrenceProbability * value.conditionalPositiveAmount
    )) {
      accumulator.invariantFailures.layerOccurrenceAmountProduct += 1;
    }
  }
  for (const value of Object.values(stages)) {
    if (
      !Number.isFinite(value.positivePoint)
      || !Number.isFinite(value.occurrenceProbability)
      || !Number.isFinite(value.conditionalPositiveAmount)
    ) {
      accumulator.invariantFailures.nonfinite += 1;
    }
    if (
      value.positivePoint < 0
      || value.occurrenceProbability < 0
      || value.occurrenceProbability > 1
      || value.conditionalPositiveAmount < 0
    ) {
      accumulator.invariantFailures.negativePrediction += 1;
    }
  }
  if (
    row.observedAtOrigin !== true
    && M2_PSC01_AMOUNT_AUDIT_STAGES.some(
      (stage) => Math.abs(stages[stage].positivePoint) > EPSILON
    )
  ) {
    accumulator.invariantFailures.futureFirstNonzeroPrediction += 1;
  }
  if (row.taxonomyFeatureUsed !== false) {
    accumulator.invariantFailures.taxonomyFeatureUsed += 1;
  }
  if (row.authorizationBackfillUsed !== false) {
    accumulator.invariantFailures.authorizationBackfillUsed += 1;
  }
  if (row.rawCandidatePreserved !== true) {
    accumulator.invariantFailures.rawCandidateNotPreserved += 1;
  }
  if (row.fallbackOverwroteRaw !== false) {
    accumulator.invariantFailures.fallbackOverwroteRaw += 1;
  }

  const diagnostics = accumulator.rowDiagnostics;
  if (row.observedAtOrigin === true) diagnostics.observedAtOriginRowCount += 1;
  else diagnostics.futureFirstRowCount += 1;
  if (stages.final.positivePoint === 0) {
    diagnostics.zeroFinalPredictionRowCount += 1;
  }
  if (row.fallbackReason !== null) diagnostics.fallbackReasonRowCount += 1;
  if (stages.final.conditionalPositiveAmount >= Math.exp(30)) {
    diagnostics.conditionalAmountAtOrAboveExp30RowCount += 1;
  }
  diagnostics.minimumOccurrenceProbability = Math.min(
    diagnostics.minimumOccurrenceProbability,
    stages.final.occurrenceProbability
  );
  diagnostics.maximumOccurrenceProbability = Math.max(
    diagnostics.maximumOccurrenceProbability,
    stages.final.occurrenceProbability
  );
  diagnostics.minimumConditionalPositiveAmount = Math.min(
    diagnostics.minimumConditionalPositiveAmount,
    stages.final.conditionalPositiveAmount
  );
  diagnostics.maximumConditionalPositiveAmount = Math.max(
    diagnostics.maximumConditionalPositiveAmount,
    stages.final.conditionalPositiveAmount
  );
  addRange(
    diagnostics.occurrenceShrinkageWeight,
    number(row.occurrenceShrinkageWeight)
  );
  addRange(
    diagnostics.conditionalAmountShrinkageWeight,
    number(row.conditionalAmountShrinkageWeight)
  );

  const horizons = Array.isArray(row.includedHorizons)
    ? row.includedHorizons.map(Number)
    : [];
  for (const horizon of horizons) {
    const key = channelCaseKey({
      family,
      workId: row.standardWorkId,
      origin: row.origin,
      horizon,
      channelUid: row.channelUid
    });
    let value = accumulator.channelCases.get(key);
    const platform = accumulator.platformByChannel.get(row.channelUid) ?? null;
    if (value === undefined) {
      value = createCase({
        family,
        workId: row.standardWorkId,
        origin: row.origin,
        horizon,
        channelUid: row.channelUid,
        mechanism: row.mechanism,
        supportTier: row.supportTier,
        selectedNodeId: row.selectedNodeId,
        platform
      });
      accumulator.channelCases.set(key, value);
    } else if (
      value.mechanism !== row.mechanism
      || value.supportTier !== row.supportTier
      || value.selectedNodeId !== row.selectedNodeId
    ) {
      accumulator.invariantFailures.caseMetadataDrift += 1;
    }
    value.monthlyRowCount += 1;
    value.actualPositive += actualPositive;
    value.actualReversal += actualReversal;
    value.actual += actual;
    value.postingActual += postingActual;
    value.oracles.occurrenceOnly += (
      row.observedAtOrigin === true && actualPositive > 0
        ? stages.final.conditionalPositiveAmount
        : 0
    );
    value.oracles.amountOnly += row.observedAtOrigin === true
      ? stages.final.occurrenceProbability * actualPositive
      : 0;
    value.oracles.both += actualPositive;
    value.oracles.futureFirstEntry += row.observedAtOrigin === true
      ? stages.final.positivePoint
      : actualPositive;
    for (const stage of M2_PSC01_AMOUNT_AUDIT_STAGES) {
      value.stages[stage].point += stages[stage].positivePoint;
      value.stages[stage].occurrenceMass +=
        stages[stage].occurrenceProbability;
      if (row.observedAtOrigin === true) {
        value.stages[stage].observedOccurrenceMass +=
          stages[stage].occurrenceProbability;
      }
      if (row.observedAtOrigin === true && actualPositive > 0) {
        value.stages[stage].conditionalPredictionMass +=
          stages[stage].conditionalPositiveAmount;
      }
    }
    value.occurrenceActualCount += actualPositive > 0 ? 1 : 0;
    if (row.observedAtOrigin === true) {
      value.observedOccurrenceRowCount += 1;
      value.observedOccurrenceActualCount += actualPositive > 0 ? 1 : 0;
      if (actualPositive > 0) value.conditionalActualMass += actualPositive;
    }
  }
}

export function finalizeM2Psc01AmountAudit(accumulator) {
  const workCases = new Map();
  for (const channelCase of accumulator.channelCases.values()) {
    const key = workCaseKey(channelCase);
    let value = workCases.get(key);
    if (value === undefined) {
      value = createCase({
        family: channelCase.family,
        workId: channelCase.workId,
        origin: channelCase.origin,
        horizon: channelCase.horizon,
        channelUid: null,
        mechanism: null,
        supportTier: null,
        selectedNodeId: null,
        platform: null
      });
      value.channels = [];
      workCases.set(key, value);
    }
    value.channels.push(channelCase);
    mergeCase(value, channelCase);
  }
  const workValues = [...workCases.values()];
  const channelValues = [...accumulator.channelCases.values()];
  const horizon = groupedReport(
    workValues,
    (row) => ({
      family: row.family,
      horizonMonths: row.horizon
    })
  );
  const strictTimeBlocks = groupedReport(
    workValues.filter((row) => row.family === "strict"),
    (row) => ({
      family: row.family,
      origin: row.origin,
      horizonMonths: row.horizon
    })
  );
  const mechanisms = groupedReport(
    channelValues,
    (row) => ({
      family: row.family,
      horizonMonths: row.horizon,
      mechanism: row.mechanism
    })
  );
  const namedPlatforms = groupedReport(
    channelValues.filter((row) => row.platform !== null),
    (row) => ({
      family: row.family,
      horizonMonths: row.horizon,
      platformId: row.platform.platformId,
      displayNameZh: row.platform.displayNameZh
    })
  );
  const supportTiers = groupedReport(
    channelValues,
    (row) => ({
      family: row.family,
      horizonMonths: row.horizon,
      supportTier: row.supportTier
    })
  );
  const composition = horizon.map((cell) => {
    const selectedWork = workValues.filter((row) => (
      row.family === cell.family
      && row.horizon === cell.horizonMonths
    ));
    const selectedChannel = channelValues.filter((row) => (
      row.family === cell.family
      && row.horizon === cell.horizonMonths
    ));
    return buildCompositionDiagnostic(selectedWork, selectedChannel);
  });
  const failures = Object.values(accumulator.invariantFailures)
    .reduce((total, value) => total + value, 0);
  return {
    public: Object.freeze({
      rowCount: accumulator.rowCount,
      familyRowCounts: Object.freeze({ ...accumulator.familyRowCounts }),
      channelCaseCount: channelValues.length,
      workCaseCount: workValues.length,
      invariantStatus: failures === 0 ? "PASS" : "FAIL",
      invariantFailures: Object.freeze({
        ...accumulator.invariantFailures
      }),
      rowDiagnostics: finalizeRowDiagnostics(accumulator.rowDiagnostics),
      privacy: M2_PSC01_PUBLIC_PRIVACY,
      aggregates: Object.freeze({
        horizon: Object.freeze(horizon),
        strictTimeBlocks: Object.freeze(strictTimeBlocks),
        mechanisms: Object.freeze(mechanisms),
        namedPlatforms: Object.freeze(namedPlatforms),
        supportTiers: Object.freeze(supportTiers)
      }),
      normalizedComposition: Object.freeze(composition)
    }),
    privateIndex: { workCases, channelCases: accumulator.channelCases }
  };
}

export function scoreM2Psc01CaseRows(rows, predictionField = "final") {
  let absoluteError = 0;
  let signedError = 0;
  let actualDenominator = 0;
  let actualTotal = 0;
  let predictionTotal = 0;
  for (const row of rows) {
    const prediction = predictionField === "comparatorPoint"
      ? number(row.comparatorPoint)
      : number(row.stages[predictionField].point);
    absoluteError += Math.abs(prediction - row.actual);
    signedError += prediction - row.actual;
    actualDenominator += Math.abs(row.actual);
    actualTotal += row.actual;
    predictionTotal += prediction;
  }
  return Object.freeze({
    caseCount: rows.length,
    absoluteError,
    signedError,
    actualDenominator,
    actualTotal,
    predictionTotal,
    predictionToActualRatio: actualTotal === 0
      ? null
      : predictionTotal / actualTotal,
    wape: actualDenominator === 0 ? null : absoluteError / actualDenominator,
    signedBias: actualDenominator === 0 ? null : signedError / actualDenominator
  });
}

function createCase({
  family,
  workId,
  origin,
  horizon,
  channelUid,
  mechanism,
  supportTier,
  selectedNodeId,
  platform
}) {
  return {
    family,
    workId,
    origin,
    horizon,
    channelUid,
    mechanism,
    supportTier,
    selectedNodeId,
    platform,
    monthlyRowCount: 0,
    actualPositive: 0,
    actualReversal: 0,
    actual: 0,
    postingActual: 0,
    occurrenceActualCount: 0,
    observedOccurrenceRowCount: 0,
    observedOccurrenceActualCount: 0,
    conditionalActualMass: 0,
    oracles: {
      occurrenceOnly: 0,
      amountOnly: 0,
      both: 0,
      futureFirstEntry: 0
    },
    stages: Object.fromEntries(M2_PSC01_AMOUNT_AUDIT_STAGES.map(
      (stage) => [stage, {
        point: 0,
        occurrenceMass: 0,
        observedOccurrenceMass: 0,
        conditionalPredictionMass: 0
      }]
    ))
  };
}

function mergeCase(target, source) {
  target.monthlyRowCount += source.monthlyRowCount;
  target.actualPositive += source.actualPositive;
  target.actualReversal += source.actualReversal;
  target.actual += source.actual;
  target.postingActual += source.postingActual;
  target.occurrenceActualCount += source.occurrenceActualCount;
  target.observedOccurrenceRowCount += source.observedOccurrenceRowCount;
  target.observedOccurrenceActualCount +=
    source.observedOccurrenceActualCount;
  target.conditionalActualMass += source.conditionalActualMass;
  target.oracles.occurrenceOnly += source.oracles.occurrenceOnly;
  target.oracles.amountOnly += source.oracles.amountOnly;
  target.oracles.both += source.oracles.both;
  target.oracles.futureFirstEntry += source.oracles.futureFirstEntry;
  for (const stage of M2_PSC01_AMOUNT_AUDIT_STAGES) {
    target.stages[stage].point += source.stages[stage].point;
    target.stages[stage].occurrenceMass +=
      source.stages[stage].occurrenceMass;
    target.stages[stage].observedOccurrenceMass +=
      source.stages[stage].observedOccurrenceMass;
    target.stages[stage].conditionalPredictionMass +=
      source.stages[stage].conditionalPredictionMass;
  }
}

function groupedReport(rows, identity) {
  const groups = new Map();
  for (const row of rows) {
    const descriptor = identity(row);
    const key = JSON.stringify(descriptor);
    let value = groups.get(key);
    if (value === undefined) {
      value = { descriptor, rows: [], works: new Set() };
      groups.set(key, value);
    }
    value.rows.push(row);
    value.works.add(row.workId);
  }
  return [...groups.values()].map(({ descriptor, rows: cases, works }) => {
    const reportable = (
      cases.length >= M2_PSC01_PUBLIC_PRIVACY.minimumCaseCount
      && works.size >= M2_PSC01_PUBLIC_PRIVACY.minimumWorkCount
    );
    return Object.freeze({
      ...descriptor,
      caseCount: cases.length,
      workCount: works.size,
      status: reportable
        ? "REPORTED"
        : M2_PSC01_PUBLIC_PRIVACY.suppressedStatus,
      metrics: reportable ? aggregateMetrics(cases) : null
    });
  }).sort((left, right) => JSON.stringify(left).localeCompare(
    JSON.stringify(right)
  ));
}

function aggregateMetrics(rows) {
  const actualPositiveTotal = sum(rows.map((row) => row.actualPositive));
  const actualReversalTotal = sum(rows.map((row) => row.actualReversal));
  const actualNetTotal = sum(rows.map((row) => row.actual));
  const postingActualNetTotal = sum(rows.map((row) => row.postingActual));
  const actualAbsDenominator = sum(rows.map((row) => Math.abs(row.actual)));
  const conditionalActualMass = sum(
    rows.map((row) => row.conditionalActualMass)
  );
  const occurrenceActualCount = sum(
    rows.map((row) => row.occurrenceActualCount)
  );
  const observedOccurrenceActualCount = sum(
    rows.map((row) => row.observedOccurrenceActualCount)
  );
  const stages = Object.fromEntries(M2_PSC01_AMOUNT_AUDIT_STAGES.map(
    (stage) => {
      const predictedTotal = sum(rows.map((row) => row.stages[stage].point));
      const absoluteError = sum(rows.map(
        (row) => Math.abs(row.stages[stage].point - row.actual)
      ));
      const conditionalPredictionMass = sum(rows.map(
        (row) => row.stages[stage].conditionalPredictionMass
      ));
      const occurrenceMass = sum(rows.map(
        (row) => row.stages[stage].occurrenceMass
      ));
      const observedOccurrenceMass = sum(rows.map(
        (row) => row.stages[stage].observedOccurrenceMass
      ));
      return [stage, Object.freeze({
        predictedTotal,
        predictionToActualNetRatio: ratio(predictedTotal, actualNetTotal),
        predictionToActualPositiveRatio:
          ratio(predictedTotal, actualPositiveTotal),
        wape: ratio(absoluteError, actualAbsDenominator),
        signedBias: ratio(predictedTotal - actualNetTotal, actualAbsDenominator),
        conditionalPredictionMass,
        conditionalAmountMassRatio:
          ratio(conditionalPredictionMass, conditionalActualMass),
        occurrenceProbabilityMass: occurrenceMass,
        occurrenceMassRatio: ratio(occurrenceMass, occurrenceActualCount),
        observedOccurrenceProbabilityMass: observedOccurrenceMass,
        observedOccurrenceMassRatio:
          ratio(observedOccurrenceMass, observedOccurrenceActualCount)
      })];
    }
  ));
  const baseAbsoluteError = sum(rows.map(
    (row) => Math.abs(row.stages.final.point - row.actual)
  ));
  const oracles = Object.fromEntries(Object.keys(rows[0]?.oracles ?? {}).map(
    (oracle) => {
      const absoluteError = sum(rows.map(
        (row) => Math.abs(row.oracles[oracle] - row.actual)
      ));
      return [oracle, Object.freeze({
        absoluteError,
        maximumRemovableError: baseAbsoluteError - absoluteError,
        removableErrorShare: ratio(
          baseAbsoluteError - absoluteError,
          baseAbsoluteError
        ),
        wape: ratio(absoluteError, actualAbsDenominator)
      })];
    }
  ));
  return Object.freeze({
    monthlyRowCount: sum(rows.map((row) => row.monthlyRowCount)),
    actualPositiveTotal,
    actualReversalTotal,
    actualNetTotal,
    actualAbsDenominator,
    positiveToNetActualRatio: ratio(actualPositiveTotal, actualNetTotal),
    postingActualNetTotal,
    developmentModelableRestatementDelta:
      actualNetTotal - postingActualNetTotal,
    occurrenceActualCount,
    observedOccurrenceActualCount,
    conditionalActualMass,
    stages: Object.freeze(stages),
    oracles: Object.freeze(oracles)
  });
}

function buildCompositionDiagnostic(workRows, channelRows) {
  const family = workRows[0]?.family ?? null;
  const horizonMonths = workRows[0]?.horizon ?? null;
  const reportable = (
    workRows.length >= M2_PSC01_PUBLIC_PRIVACY.minimumCaseCount
    && new Set(workRows.map((row) => row.workId)).size
      >= M2_PSC01_PUBLIC_PRIVACY.minimumWorkCount
  );
  if (!reportable) {
    return Object.freeze({
      family,
      horizonMonths,
      status: M2_PSC01_PUBLIC_PRIVACY.suppressedStatus,
      diagnosticLabel: "POST_HOC_DIAGNOSTIC_NOT_MODEL_EVIDENCE",
      metrics: null
    });
  }
  const actualTotal = sum(workRows.map((row) => row.actual));
  const predictionTotal = sum(
    workRows.map((row) => row.stages.final.point)
  );
  const scalar = predictionTotal === 0 ? null : actualTotal / predictionTotal;
  const denominator = sum(channelRows.map((row) => Math.abs(row.actual)));
  const rawAbsoluteError = sum(channelRows.map(
    (row) => Math.abs(row.stages.final.point - row.actual)
  ));
  const globallyNormalizedAbsoluteError = scalar === null
    ? null
    : sum(channelRows.map((row) => (
      Math.abs(scalar * row.stages.final.point - row.actual)
    )));
  let perWorkAbsoluteError = 0;
  let perWorkDenominator = 0;
  let includedWorkCount = 0;
  let excludedWorkCount = 0;
  for (const work of workRows) {
    const predicted = work.stages.final.point;
    if (!(predicted > 0) || !(work.actual > 0)) {
      excludedWorkCount += 1;
      continue;
    }
    const workScalar = work.actual / predicted;
    includedWorkCount += 1;
    for (const channel of work.channels) {
      perWorkAbsoluteError += Math.abs(
        workScalar * channel.stages.final.point - channel.actual
      );
      perWorkDenominator += Math.abs(channel.actual);
    }
  }
  return Object.freeze({
    family,
    horizonMonths,
    status: "REPORTED",
    diagnosticLabel: "POST_HOC_DIAGNOSTIC_NOT_MODEL_EVIDENCE",
    metrics: Object.freeze({
      actualTotal,
      rawPredictionTotal: predictionTotal,
      actualDerivedGlobalScalar: scalar,
      rawWorkChannelWape: ratio(rawAbsoluteError, denominator),
      globallyNormalizedWorkChannelWape:
        ratio(globallyNormalizedAbsoluteError, denominator),
      perWorkActualDerivedScalarWorkChannelWape:
        ratio(perWorkAbsoluteError, perWorkDenominator),
      perWorkScalarIncludedWorkCount: includedWorkCount,
      perWorkScalarExcludedWorkCount: excludedWorkCount,
      participatesInTraining: false,
      participatesInSelection: false,
      participatesInGate: false,
      registeredAsCandidateScore: false
    })
  });
}

function stageValues(row) {
  const layers = row?.layerPredictions ?? {};
  return Object.freeze({
    originVisibleEmpiricalParent: normalizedStage(
      layers.originVisibleEmpiricalParent
    ),
    globalPooledParent: normalizedStage(layers.globalPooledParent),
    mechanism: normalizedStage(layers.mechanism),
    namedPlatform: normalizedStage(layers.namedPlatform),
    final: normalizedStage({
      positivePoint: row.positivePoint,
      occurrenceProbability: row.occurrenceProbability,
      conditionalPositiveAmount: row.conditionalPositiveAmount
    })
  });
}

function normalizedStage(value) {
  return Object.freeze({
    positivePoint: number(value?.positivePoint),
    occurrenceProbability: number(value?.occurrenceProbability),
    conditionalPositiveAmount: number(value?.conditionalPositiveAmount)
  });
}

function finalizeRowDiagnostics(value) {
  return Object.freeze({
    ...value,
    minimumConditionalPositiveAmount:
      Number.isFinite(value.minimumConditionalPositiveAmount)
        ? value.minimumConditionalPositiveAmount
        : null,
    occurrenceShrinkageWeight:
      Object.freeze(finalizeRange(value.occurrenceShrinkageWeight)),
    conditionalAmountShrinkageWeight:
      Object.freeze(finalizeRange(value.conditionalAmountShrinkageWeight))
  });
}

function rangeAccumulator() {
  return { count: 0, sum: 0, minimum: Number.POSITIVE_INFINITY, maximum: 0 };
}

function addRange(range, value) {
  range.count += 1;
  range.sum += value;
  range.minimum = Math.min(range.minimum, value);
  range.maximum = Math.max(range.maximum, value);
}

function finalizeRange(range) {
  return {
    count: range.count,
    minimum: range.count === 0 ? null : range.minimum,
    maximum: range.count === 0 ? null : range.maximum,
    mean: range.count === 0 ? null : range.sum / range.count
  };
}

function workCaseKey(row) {
  return `${row.family}\u001f${row.workId}\u001f${row.origin}`
    + `\u001f${row.horizon}`;
}

function channelCaseKey({
  family,
  workId,
  origin,
  horizon,
  channelUid
}) {
  return `${family}\u001f${workId}\u001f${origin}\u001f${horizon}`
    + `\u001f${channelUid}`;
}

function number(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : Number.NaN;
}

function nearlyEqual(left, right) {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return Math.abs(left - right) <= EPSILON * Math.max(
    1,
    Math.abs(left),
    Math.abs(right)
  );
}

function ratio(numerator, denominator) {
  if (!Number.isFinite(numerator) || denominator === 0) return null;
  return numerator / denominator;
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value), 0);
}
