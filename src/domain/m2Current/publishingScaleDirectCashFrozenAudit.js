import {createHash} from "node:crypto";

export const M2_PSC03_AUDIT_PRIVACY = Object.freeze({
  minimumCaseCount: 30,
  minimumWorkCount: 20
});

export const M2_PSC03_AUDIT_QUANTILES = Object.freeze([
  0.5,
  0.9,
  0.95,
  0.99,
  0.999
]);

const HISTOGRAM_BIN_COUNT = 32768;
const HISTOGRAM_LOG_MAXIMUM = 31;
const EPSILON = 1e-9;

export function createM2Psc03FrozenAuditAccumulator({namedPlatforms}) {
  const platformByChannel = new Map(namedPlatforms.map((row) => [
    row.channelUid,
    row.platformId
  ]));
  return {
    platformByChannel,
    rowCount: 0,
    familyRowCounts: {primary: 0, strict: 0},
    populationDigest: createCommutativeKeyDigest(),
    invariants: {
      identity: 0,
      invalidNumber: 0,
      actualConservation: 0,
      pointAlias: 0,
      occurrenceProduct: 0,
      occurrenceBinary64: 0,
      occurrenceApplicationCount: 0,
      horizonAggregationCount: 0,
      invalidLayer: 0,
      futureFirstSeenNonzero: 0,
      taxonomyFeatureUsed: 0,
      lg01PredictionDependency: 0,
      postHocCalibrationUsed: 0,
      metadataDrift: 0
    },
    workCases: new Map(),
    channelCases: new Map(),
    supportCases: new Map(),
    nodeCases: new Map(),
    fallbackCases: new Map(),
    cells: new Map(),
    segmentRows: new Map(),
    categories: new Map(),
    conditional: {
      primary: createConditionalAccumulator(),
      strict: createConditionalAccumulator()
    }
  };
}

export function accumulateM2Psc03FrozenRow(accumulator, row) {
  accumulator.rowCount += 1;
  const family = row?.evaluationFamily;
  if (family !== "primary" && family !== "strict") {
    accumulator.invariants.identity += 1;
    return;
  }
  accumulator.familyRowCounts[family] += 1;
  validateIdentity(accumulator, row);
  const actualPositive = number(row.actualPositive);
  const actualReversal = number(row.actualReversal);
  const actual = number(row.actual);
  const point = number(row.pointEstimate);
  const positivePoint = number(row.positivePoint);
  const occurrence = number(row.occurrenceProbability);
  const conditional = number(row.conditionalPositiveAmount);
  const layers = layerValues(row.layerConditionalPositiveAmount);
  if ([
    actualPositive,
    actualReversal,
    actual,
    point,
    positivePoint,
    occurrence,
    conditional,
    ...Object.values(layers)
  ].some((value) => !Number.isFinite(value))) {
    accumulator.invariants.invalidNumber += 1;
    return;
  }
  if (!nearlyEqual(actual, actualPositive - actualReversal)) {
    accumulator.invariants.actualConservation += 1;
  }
  if (!nearlyEqual(point, positivePoint)) {
    accumulator.invariants.pointAlias += 1;
  }
  if (!nearlyEqual(point, occurrence * conditional)) {
    accumulator.invariants.occurrenceProduct += 1;
  }
  if (binary64Hex(occurrence) !== row.occurrenceBinary64) {
    accumulator.invariants.occurrenceBinary64 += 1;
  }
  if (row.occurrenceApplicationCount !== 1) {
    accumulator.invariants.occurrenceApplicationCount += 1;
  }
  if (row.horizonAggregationCount !== 0) {
    accumulator.invariants.horizonAggregationCount += 1;
  }
  if (
    point < 0
    || occurrence < 0
    || occurrence > 1
    || conditional < 0
    || Object.values(layers).some((value) => value < 0)
  ) {
    accumulator.invariants.invalidLayer += 1;
  }
  if (
    row.observedAtOrigin !== true
    && [point, conditional, ...Object.values(layers)].some(
      (value) => Math.abs(value) > EPSILON
    )
  ) {
    accumulator.invariants.futureFirstSeenNonzero += 1;
  }
  if (row.taxonomyFeatureUsed !== false) {
    accumulator.invariants.taxonomyFeatureUsed += 1;
  }
  if (row.lg01PredictionDependency !== false) {
    accumulator.invariants.lg01PredictionDependency += 1;
  }
  if (row.postHocCalibrationUsed !== false) {
    accumulator.invariants.postHocCalibrationUsed += 1;
  }

  const monthlyKey = `${row.standardWorkId}\u001f${row.channelUid}`
    + `\u001f${row.origin}\u001f${row.futureMonthIndex}`;
  accumulator.populationDigest.add(monthlyKey);
  accumulateCategory(accumulator, row, {
    actualPositive,
    actualReversal,
    actual,
    point
  });
  if (row.observedAtOrigin === true && actualPositive > 0) {
    addConditional(accumulator.conditional[family], {
      workId: row.standardWorkId,
      actual: actualPositive,
      prediction: conditional
    });
  }

  const horizons = Array.isArray(row.includedHorizons)
    ? row.includedHorizons.map(Number)
    : [];
  for (const horizon of horizons) {
    if (!Number.isFinite(horizon) || horizon < Number(row.futureMonthIndex)) {
      accumulator.invariants.identity += 1;
      continue;
    }
    const identity = {
      family,
      workId: row.standardWorkId,
      origin: row.origin,
      horizon
    };
    addCase(accumulator.workCases, caseKey(identity), identity, {
      actual,
      point,
      occurrence,
      layers
    });
    const channelIdentity = {
      ...identity,
      group: row.channelUid,
      mechanism: row.mechanism,
      platformId: accumulator.platformByChannel.get(row.channelUid) ?? null,
      observedAtOrigin: row.observedAtOrigin === true
    };
    if (addCase(
      accumulator.channelCases,
      groupedCaseKey(channelIdentity),
      channelIdentity,
      {actual, point, occurrence, layers}
    )) accumulator.invariants.metadataDrift += 1;
    for (const [dimension, group, target] of [
      ["supportTier", row.supportTier, accumulator.supportCases],
      ["selectedNodeId", row.selectedNodeId, accumulator.nodeCases],
      ["fallbackReason", row.fallbackReason ?? "NO_FALLBACK", accumulator.fallbackCases]
    ]) {
      const groupedIdentity = {...identity, group, dimension};
      if (addCase(
        target,
        groupedCaseKey(groupedIdentity),
        groupedIdentity,
        {actual, point, occurrence, layers}
      )) accumulator.invariants.metadataDrift += 1;
    }
    const cell = getCell(accumulator.cells, family, row.origin, horizon);
    cell.rowCount += 1;
    cell.works.add(row.standardWorkId);
    cell.point.add(point);
    cell.conditional.add(conditional);
    cell.actualPositive.add(actualPositive);
    cell.occurrence.add(occurrence);
    for (const layer of Object.keys(layers)) {
      cell.layers[layer].add(layers[layer]);
      cell.layerPointMass[layer] += occurrence * layers[layer];
    }
    for (const [dimension, group] of [
      ["mechanism", row.mechanism],
      ["platformId", accumulator.platformByChannel.get(row.channelUid) ?? "other"],
      ["supportTier", row.supportTier],
      ["selectedNodeId", row.selectedNodeId],
      ["fallbackReason", row.fallbackReason ?? "NO_FALLBACK"]
    ]) {
      addSegmentRow(accumulator.segmentRows, {
        family,
        origin: row.origin,
        horizon,
        dimension,
        group,
        workId: row.standardWorkId,
        occurrence,
        conditional,
        point,
        layers
      });
    }
  }
}

export function finalizeM2Psc03FrozenAudit(accumulator) {
  const workCases = [...accumulator.workCases.values()];
  const channelCases = [...accumulator.channelCases.values()];
  const family = Object.fromEntries(["primary", "strict"].map((name) => [
    name,
    scoreCases(workCases.filter((row) => row.family === name))
  ]));
  const byHorizon = groupedScores(workCases, (row) => ({
    family: row.family,
    horizonMonths: row.horizon
  }));
  const byOrigin = groupedScores(workCases, (row) => ({
    family: row.family,
    origin: row.origin
  }));
  const originHorizon = groupedScores(workCases, (row) => ({
    family: row.family,
    origin: row.origin,
    horizonMonths: row.horizon
  }));
  const byMechanism = groupedScores(
    channelCases.filter((row) => row.observedAtOrigin),
    (row) => ({family: row.family, mechanism: row.mechanism})
  );
  const byNamedPlatform = groupedScores(
    channelCases.filter((row) => row.platformId !== null),
    (row) => ({family: row.family, platformId: row.platformId})
  );
  const bySupportTier = groupedScores(
    [...accumulator.supportCases.values()],
    (row) => ({family: row.family, supportTier: row.group})
  );
  const cellRows = originHorizon.map((row) => {
    const cell = accumulator.cells.get(cellKey(
      row.family,
      row.origin,
      row.horizonMonths
    ));
    return {
      ...row,
      rowDistribution: finalizeCell(cell),
      topPredictionWorkMassShare: predictionConcentration(
        workCases.filter((value) => (
          value.family === row.family
          && value.origin === row.origin
          && value.horizon === row.horizonMonths
        ))
      )
    };
  });
  const strictCells = cellRows.filter((row) => row.family === "strict");
  const worstCells = [...strictCells].sort((left, right) => (
    (right.metrics?.wape ?? -Infinity) - (left.metrics?.wape ?? -Infinity)
  )).slice(0, 5);
  const worstDetails = worstCells.map((cell) => buildWorstCellDetail({
    cell,
    workCases,
    channelCases,
    supportCases: [...accumulator.supportCases.values()],
    nodeCases: [...accumulator.nodeCases.values()],
    fallbackCases: [...accumulator.fallbackCases.values()],
    segmentRows: accumulator.segmentRows
  }));
  const invariantFailureCount = Object.values(accumulator.invariants)
    .reduce((total, value) => total + value, 0);
  return {
    summary: {
      rowCount: accumulator.rowCount,
      familyRowCounts: {...accumulator.familyRowCounts},
      populationKeySha256: accumulator.populationDigest.finalize(),
      invariantStatus: invariantFailureCount === 0 ? "PASS" : "FAIL",
      invariantFailureCount,
      invariants: {...accumulator.invariants},
      workCaseCount: workCases.length,
      channelCaseCount: channelCases.length
    },
    metrics: {
      family,
      byHorizon,
      byOrigin,
      originHorizon: cellRows,
      byMechanism,
      byNamedPlatform,
      bySupportTier,
      conditional: Object.fromEntries(Object.entries(accumulator.conditional).map(
        ([name, value]) => [name, finalizeConditional(value)]
      )),
      categories: finalizeCategories(accumulator.categories),
      worstCells: worstDetails,
      horizonOriginDrivers: horizonOriginDrivers(strictCells)
    },
    privateLocator: buildPrivateLocator(workCases, channelCases, worstCells)
  };
}

export function protectM2Psc03AuditForPublic(audit) {
  return {
    summary: audit.summary,
    metrics: {
      family: mapScores(audit.metrics.family, publicScore),
      byHorizon: audit.metrics.byHorizon.map(protectGroupedScore),
      byOrigin: audit.metrics.byOrigin.map(protectGroupedScore),
      originHorizon: audit.metrics.originHorizon.map((row) => ({
        ...protectGroupedScore(row),
        rowDistribution: publicCellDistribution(row.rowDistribution),
        topPredictionWorkMassShare: row.topPredictionWorkMassShare
      })),
      byMechanism: audit.metrics.byMechanism.map(protectGroupedScore),
      byNamedPlatform: audit.metrics.byNamedPlatform.map(protectGroupedScore),
      bySupportTier: audit.metrics.bySupportTier.map(protectGroupedScore),
      conditional: mapScores(audit.metrics.conditional, publicConditional),
      categories: audit.metrics.categories,
      worstCells: audit.metrics.worstCells.map(protectWorstCell),
      horizonOriginDrivers: audit.metrics.horizonOriginDrivers
    }
  };
}

function validateIdentity(accumulator, row) {
  if (
    row?.schema !== "m2.current.psc03.monthly_raw_prediction.private.v0.1"
    || row?.tracked !== false
    || row?.evidenceClass !== "DEVELOPMENT_REPLAY"
    || row?.modelId !== "M2-CHAN-PSC03"
    || row?.candidateId !== "M2-CHAN-PSC03-RAW"
    || row?.experimentArmId
      !== "M2-EXP-PUBLISHING-SCALE-CHANNEL-DIRECT-CASH-03/P"
    || row?.arm !== "P"
    || row?.actualDefinitionId
      !== "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01"
  ) {
    accumulator.invariants.identity += 1;
  }
}

function layerValues(value) {
  return {
    global: number(value?.global),
    mechanism: number(value?.mechanism),
    namedPlatform: number(value?.namedPlatform)
  };
}

function createCase(identity) {
  return {
    ...identity,
    actual: 0,
    pointEstimate: 0,
    monthlyRowCount: 0,
    occurrenceMass: 0,
    layerPointMass: {global: 0, mechanism: 0, namedPlatform: 0}
  };
}

function addCase(target, key, identity, values) {
  let value = target.get(key);
  let metadataDrift = false;
  if (value === undefined) {
    value = createCase(identity);
    target.set(key, value);
  } else if (
    value.mechanism !== identity.mechanism
    || value.platformId !== identity.platformId
    || value.observedAtOrigin !== identity.observedAtOrigin
  ) {
    if (
      identity.mechanism !== undefined
      || identity.platformId !== undefined
      || identity.observedAtOrigin !== undefined
    ) {
      metadataDrift = true;
    }
  }
  value.actual += values.actual;
  value.pointEstimate += values.point;
  value.monthlyRowCount += 1;
  value.occurrenceMass += values.occurrence;
  for (const layer of Object.keys(values.layers)) {
    value.layerPointMass[layer] += values.occurrence * values.layers[layer];
  }
  return metadataDrift;
}

function createCell() {
  return {
    rowCount: 0,
    works: new Set(),
    point: createLogHistogram(),
    conditional: createLogHistogram(),
    actualPositive: createLogHistogram(),
    occurrence: createLinearHistogram(),
    layers: {
      global: createLogHistogram(),
      mechanism: createLogHistogram(),
      namedPlatform: createLogHistogram()
    },
    layerPointMass: {global: 0, mechanism: 0, namedPlatform: 0}
  };
}

function getCell(cells, family, origin, horizon) {
  const key = cellKey(family, origin, horizon);
  let value = cells.get(key);
  if (value === undefined) {
    value = createCell();
    cells.set(key, value);
  }
  return value;
}

function addSegmentRow(target, row) {
  const key = JSON.stringify([
    row.family,
    row.origin,
    row.horizon,
    row.dimension,
    row.group
  ]);
  let value = target.get(key);
  if (value === undefined) {
    value = {
      family: row.family,
      origin: row.origin,
      horizonMonths: row.horizon,
      dimension: row.dimension,
      group: row.group,
      rowCount: 0,
      works: new Set(),
      occurrenceMass: 0,
      pointMass: 0,
      conditional: createLogHistogram(),
      layerPointMass: {global: 0, mechanism: 0, namedPlatform: 0}
    };
    target.set(key, value);
  }
  value.rowCount += 1;
  value.works.add(row.workId);
  value.occurrenceMass += row.occurrence;
  value.pointMass += row.point;
  value.conditional.add(row.conditional);
  for (const layer of Object.keys(row.layers)) {
    value.layerPointMass[layer] += row.occurrence * row.layers[layer];
  }
}

function createConditionalAccumulator() {
  return {
    rowCount: 0,
    works: new Set(),
    actualMass: 0,
    predictionMass: 0,
    absoluteError: 0,
    logAbsoluteError: 0,
    absoluteErrorDistribution: createLogHistogram()
  };
}

function addConditional(value, row) {
  const error = Math.abs(row.prediction - row.actual);
  value.rowCount += 1;
  value.works.add(row.workId);
  value.actualMass += row.actual;
  value.predictionMass += row.prediction;
  value.absoluteError += error;
  value.logAbsoluteError += Math.abs(Math.log(row.prediction) - Math.log(row.actual));
  value.absoluteErrorDistribution.add(error);
}

function finalizeConditional(value) {
  return {
    rowCount: value.rowCount,
    workCount: value.works.size,
    actualMass: value.actualMass,
    predictionMass: value.predictionMass,
    predictionActualCashRatio: ratio(value.predictionMass, value.actualMass),
    absoluteError: value.absoluteError,
    wape: ratio(value.absoluteError, value.actualMass),
    signedBias: ratio(value.predictionMass - value.actualMass, value.actualMass),
    mae: ratio(value.absoluteError, value.rowCount),
    medianAbsoluteErrorApproximate: value.absoluteErrorDistribution.quantile(0.5),
    logMae: ratio(value.logAbsoluteError, value.rowCount)
  };
}

function accumulateCategory(accumulator, row, values) {
  const category = row.observedAtOrigin !== true
    ? "FUTURE_FIRST_SEEN_ABSTENTION"
    : Math.abs(values.actualReversal) > EPSILON
      ? "REVERSAL_RELATED"
      : values.actualPositive > 0
        ? "POSITIVE_NO_REVERSAL"
        : values.actualPositive === 0 && values.actual === 0
          ? "ZERO_NO_REVERSAL"
          : "OTHER_ACTUAL_STATE";
  const key = `${row.evaluationFamily}\u001f${category}`;
  let value = accumulator.categories.get(key);
  if (value === undefined) {
    value = {
      family: row.evaluationFamily,
      category,
      rowCount: 0,
      works: new Set(),
      actualAbsMass: 0,
      predictionMass: 0,
      absoluteError: 0,
      signedError: 0
    };
    accumulator.categories.set(key, value);
  }
  value.rowCount += 1;
  value.works.add(row.standardWorkId);
  value.actualAbsMass += Math.abs(values.actual);
  value.predictionMass += values.point;
  value.absoluteError += Math.abs(values.point - values.actual);
  value.signedError += values.point - values.actual;
}

function finalizeCategories(categories) {
  const rows = [...categories.values()];
  const totals = Object.fromEntries(["primary", "strict"].map((family) => {
    const selected = rows.filter((row) => row.family === family);
    return [family, {
      actualAbsMass: sum(selected.map((row) => row.actualAbsMass)),
      predictionMass: sum(selected.map((row) => row.predictionMass)),
      absoluteError: sum(selected.map((row) => row.absoluteError)),
      absoluteSignedError: Math.abs(sum(selected.map((row) => row.signedError)))
    }];
  }));
  return rows.map((row) => ({
    family: row.family,
    category: row.category,
    rowCount: row.rowCount,
    workCount: row.works.size,
    actualAbsMassShare: ratio(row.actualAbsMass, totals[row.family].actualAbsMass),
    predictionMassShare: ratio(row.predictionMass, totals[row.family].predictionMass),
    monthlyAbsoluteErrorShare: ratio(
      row.absoluteError,
      totals[row.family].absoluteError
    ),
    signedErrorDirection: Math.sign(row.signedError),
    absoluteSignedErrorShare: ratio(
      Math.abs(row.signedError),
      totals[row.family].absoluteSignedError
    ),
    errorGrain: "MONTHLY_ROW_ATTRIBUTION_NOT_HEADLINE_WORK_TOTAL_SCORE"
  })).sort(compareJson);
}

function groupedScores(rows, descriptor) {
  const groups = new Map();
  for (const row of rows) {
    const identity = descriptor(row);
    const key = JSON.stringify(identity);
    let value = groups.get(key);
    if (value === undefined) {
      value = {identity, rows: []};
      groups.set(key, value);
    }
    value.rows.push(row);
  }
  return [...groups.values()].map(({identity, rows: selected}) => ({
    ...identity,
    metrics: scoreCases(selected)
  })).sort(compareJson);
}

function scoreCases(rows) {
  const absolute = [];
  const errorByWork = new Map();
  let actualDenominator = 0;
  let actualMass = 0;
  let predictionMass = 0;
  let absoluteError = 0;
  let signedError = 0;
  for (const row of rows) {
    const error = Math.abs(row.pointEstimate - row.actual);
    actualDenominator += Math.abs(row.actual);
    actualMass += row.actual;
    predictionMass += row.pointEstimate;
    absoluteError += error;
    signedError += row.pointEstimate - row.actual;
    absolute.push(error);
    errorByWork.set(row.workId, (errorByWork.get(row.workId) ?? 0) + error);
  }
  absolute.sort((left, right) => left - right);
  const workErrors = [...errorByWork.values()].sort((left, right) => right - left);
  return {
    caseCount: rows.length,
    workCount: errorByWork.size,
    actualDenominator,
    actualMass,
    predictionMass,
    predictionActualCashRatio: ratio(predictionMass, actualMass),
    absoluteError,
    signedError,
    wape: ratio(absoluteError, actualDenominator),
    signedBias: ratio(signedError, actualDenominator),
    mae: ratio(absoluteError, rows.length),
    medianAbsoluteError: medianSorted(absolute),
    errorConcentration: {
      maximumWorkShare: ratio(workErrors[0] ?? 0, absoluteError),
      top10WorkShare: ratio(sum(workErrors.slice(0, 10)), absoluteError)
    }
  };
}

function predictionConcentration(rows) {
  const byWork = new Map();
  for (const row of rows) {
    byWork.set(
      row.workId,
      (byWork.get(row.workId) ?? 0) + row.pointEstimate
    );
  }
  const values = [...byWork.values()].sort((left, right) => right - left);
  const total = sum(values);
  return {
    top1: ratio(sum(values.slice(0, 1)), total),
    top5: ratio(sum(values.slice(0, 5)), total),
    top10: ratio(sum(values.slice(0, 10)), total)
  };
}

function finalizeCell(cell) {
  return {
    monthlyRowCount: cell.rowCount,
    workCount: cell.works.size,
    pointPrediction: cell.point.finalize(),
    conditionalPositiveAmount: cell.conditional.finalize(),
    evaluationPositiveActualReference: {
      ...cell.actualPositive.finalize(),
      status: "FROZEN_EVALUATION_POSITIVE_ACTUAL_REFERENCE_NOT_TRAINING_SUPPORT"
    },
    occurrenceProbability: cell.occurrence.finalize(),
    layers: mapScores(cell.layers, (value) => value.finalize()),
    occurrenceWeightedLayerMassRatios: {
      mechanismToGlobal: ratio(
        cell.layerPointMass.mechanism,
        cell.layerPointMass.global
      ),
      namedPlatformToMechanism: ratio(
        cell.layerPointMass.namedPlatform,
        cell.layerPointMass.mechanism
      ),
      namedPlatformToGlobal: ratio(
        cell.layerPointMass.namedPlatform,
        cell.layerPointMass.global
      )
    }
  };
}

function buildWorstCellDetail({
  cell,
  workCases,
  channelCases,
  supportCases,
  nodeCases,
  fallbackCases,
  segmentRows
}) {
  const matches = (row) => (
    row.family === cell.family
    && row.origin === cell.origin
    && row.horizon === cell.horizonMonths
  );
  const selectedWork = workCases.filter(matches);
  const selectedChannel = channelCases.filter(matches);
  const groups = {
    mechanism: groupedScores(selectedChannel, (row) => ({group: row.mechanism})),
    platformId: groupedScores(
      selectedChannel.filter((row) => row.platformId !== null),
      (row) => ({group: row.platformId})
    ),
    supportTier: groupedScores(supportCases.filter(matches), (row) => ({group: row.group})),
    selectedNodeId: groupedScores(nodeCases.filter(matches), (row) => ({group: row.group})),
    fallbackReason: groupedScores(fallbackCases.filter(matches), (row) => ({group: row.group}))
  };
  const segment = [...segmentRows.values()].filter((row) => (
    row.family === cell.family
    && row.origin === cell.origin
    && row.horizonMonths === cell.horizonMonths
  )).map((row) => ({
    family: row.family,
    origin: row.origin,
    horizonMonths: row.horizonMonths,
    dimension: row.dimension,
    group: row.group,
    rowCount: row.rowCount,
    workCount: row.works.size,
    meanOccurrenceProbability: ratio(row.occurrenceMass, row.rowCount),
    conditionalPositiveAmount: row.conditional.finalize(),
    predictionMassShare: ratio(row.pointMass, cell.metrics.predictionMass),
    occurrenceWeightedLayerMassRatios: {
      mechanismToGlobal: ratio(
        row.layerPointMass.mechanism,
        row.layerPointMass.global
      ),
      namedPlatformToMechanism: ratio(
        row.layerPointMass.namedPlatform,
        row.layerPointMass.mechanism
      )
    }
  })).sort(compareJson);
  return {
    family: cell.family,
    origin: cell.origin,
    horizonMonths: cell.horizonMonths,
    metrics: cell.metrics,
    rowDistribution: cell.rowDistribution,
    topPredictionWorkMassShare: predictionConcentration(selectedWork),
    groups,
    segment
  };
}

function buildPrivateLocator(workCases, channelCases, worstCells) {
  const cells = worstCells.slice(0, 3).map((cell) => {
    const selected = workCases.filter((row) => (
      row.family === cell.family
      && row.origin === cell.origin
      && row.horizon === cell.horizonMonths
    )).sort((left, right) => (
      Math.abs(right.pointEstimate - right.actual)
        - Math.abs(left.pointEstimate - left.actual)
    )).slice(0, 10);
    return {
      family: cell.family,
      origin: cell.origin,
      horizonMonths: cell.horizonMonths,
      works: selected.map((row, index) => {
        const channels = channelCases.filter((channel) => (
          channel.family === row.family
          && channel.origin === row.origin
          && channel.horizon === row.horizon
          && channel.workId === row.workId
        )).sort((left, right) => right.pointEstimate - left.pointEstimate);
        return {
          rank: index + 1,
          standardWorkId: row.workId,
          actual: row.actual,
          pointEstimate: row.pointEstimate,
          absoluteError: Math.abs(row.pointEstimate - row.actual),
          layerPointMass: row.layerPointMass,
          channels: channels.map((channel) => ({
            channelUid: channel.group,
            mechanism: channel.mechanism,
            platformId: channel.platformId,
            pointEstimate: channel.pointEstimate,
            actual: channel.actual
          }))
        };
      })
    };
  });
  return {cells};
}

function horizonOriginDrivers(strictCells) {
  const output = {};
  for (const horizon of [3, 6, 12, 18, 24]) {
    const selected = strictCells.filter((row) => row.horizonMonths === horizon);
    const totalError = sum(selected.map((row) => row.metrics.absoluteError));
    const totalPrediction = sum(selected.map((row) => row.metrics.predictionMass));
    output[String(horizon)] = selected.map((row) => ({
      origin: row.origin,
      absoluteErrorShare: ratio(row.metrics.absoluteError, totalError),
      predictionMassShare: ratio(row.metrics.predictionMass, totalPrediction),
      wape: row.metrics.wape,
      predictionActualCashRatio: row.metrics.predictionActualCashRatio
    })).sort((left, right) => right.absoluteErrorShare - left.absoluteErrorShare);
  }
  return output;
}

function protectGroupedScore(row) {
  const reportable = (
    row.metrics.caseCount >= M2_PSC03_AUDIT_PRIVACY.minimumCaseCount
    && row.metrics.workCount >= M2_PSC03_AUDIT_PRIVACY.minimumWorkCount
  );
  const identity = Object.fromEntries(Object.entries(row).filter(
    ([key]) => !["metrics", "rowDistribution", "topPredictionWorkMassShare"].includes(key)
  ));
  return {
    ...identity,
    status: reportable ? "PUBLISHED_AGGREGATE" : "SUPPRESSED_PRIVACY_THRESHOLD",
    metrics: reportable ? publicScore(row.metrics) : null
  };
}

function publicScore(value) {
  return {
    caseCount: value.caseCount,
    workCount: value.workCount,
    predictionActualCashRatio: value.predictionActualCashRatio,
    wape: value.wape,
    signedBias: value.signedBias,
    errorConcentration: value.errorConcentration
  };
}

function publicConditional(value) {
  return {
    rowCount: value.rowCount,
    workCount: value.workCount,
    predictionActualCashRatio: value.predictionActualCashRatio,
    wape: value.wape,
    signedBias: value.signedBias,
    logMae: value.logMae
  };
}

function protectWorstCell(row) {
  const protectGroups = (values) => values.map(protectGroupedScore);
  const publicDistribution = publicCellDistribution(row.rowDistribution);
  return {
    family: row.family,
    origin: row.origin,
    horizonMonths: row.horizonMonths,
    metrics: publicScore(row.metrics),
    rowDistribution: publicDistribution,
    topPredictionWorkMassShare: row.topPredictionWorkMassShare,
    groups: mapScores(row.groups, protectGroups),
    segment: row.segment.map((value) => {
      const reportable = (
        value.rowCount >= M2_PSC03_AUDIT_PRIVACY.minimumCaseCount
        && value.workCount >= M2_PSC03_AUDIT_PRIVACY.minimumWorkCount
      );
      return reportable
        ? {
          family: value.family,
          origin: value.origin,
          horizonMonths: value.horizonMonths,
          dimension: value.dimension,
          group: value.group,
          rowCount: value.rowCount,
          workCount: value.workCount,
          meanOccurrenceProbability: value.meanOccurrenceProbability,
          conditionalPositiveAmount: publicAmountDistribution(
            value.conditionalPositiveAmount,
            row.rowDistribution.evaluationPositiveActualReference
          ),
          predictionMassShare: value.predictionMassShare,
          occurrenceWeightedLayerMassRatios:
            value.occurrenceWeightedLayerMassRatios,
          status: "PUBLISHED_AGGREGATE"
        }
        : {
          family: value.family,
          origin: value.origin,
          horizonMonths: value.horizonMonths,
          dimension: value.dimension,
          group: value.group,
          rowCount: value.rowCount,
          workCount: value.workCount,
          status: "SUPPRESSED_PRIVACY_THRESHOLD"
        };
    })
  };
}

function publicCellDistribution(value) {
  const reference = value.evaluationPositiveActualReference;
  return {
    monthlyRowCount: value.monthlyRowCount,
    workCount: value.workCount,
    pointPrediction: publicAmountDistribution(value.pointPrediction, reference),
    conditionalPositiveAmount: publicAmountDistribution(
      value.conditionalPositiveAmount,
      reference
    ),
    evaluationPositiveActualReference: {
      status: reference.status,
      count: reference.count,
      zeroCount: reference.zeroCount,
      absoluteCashQuantilesPublished: false
    },
    occurrenceProbability: value.occurrenceProbability,
    layers: mapScores(
      value.layers,
      (row) => publicAmountDistribution(row, reference)
    ),
    occurrenceWeightedLayerMassRatios:
      value.occurrenceWeightedLayerMassRatios
  };
}

function publicAmountDistribution(value, reference) {
  const referenceP99 = reference.quantiles.p99;
  const referenceP99_9 = reference.quantiles.p99_9;
  return {
    method: value.method,
    count: value.count,
    zeroCount: value.zeroCount,
    relativeToEvaluationPositiveActual: {
      p50ToReferenceP99: ratio(value.quantiles.p50, referenceP99),
      p90ToReferenceP99: ratio(value.quantiles.p90, referenceP99),
      p95ToReferenceP99: ratio(value.quantiles.p95, referenceP99),
      p99ToReferenceP99: ratio(value.quantiles.p99, referenceP99),
      p99_9ToReferenceP99_9: ratio(value.quantiles.p99_9, referenceP99_9),
      maximumToReferenceP99_9: ratio(value.maximum, referenceP99_9)
    },
    upperEtaClipCount: value.upperEtaClipCount,
    lowerEtaClipCount: value.lowerEtaClipCount,
    nearUpperEtaClipCount: value.nearUpperEtaClipCount,
    nearLowerEtaClipCount: value.nearLowerEtaClipCount,
    recoveredEtaIsClippedOnly: value.recoveredEtaIsClippedOnly,
    absoluteCashQuantilesPublished: false
  };
}

function createLogHistogram() {
  const counts = new Uint32Array(HISTOGRAM_BIN_COUNT);
  let count = 0;
  let maximum = 0;
  let minimumPositive = Number.POSITIVE_INFINITY;
  let zeroCount = 0;
  let upperClipCount = 0;
  let lowerClipCount = 0;
  let nearUpperClipCount = 0;
  let nearLowerClipCount = 0;
  return {
    add(raw) {
      const value = number(raw);
      if (!Number.isFinite(value) || value < 0) return;
      count += 1;
      maximum = Math.max(maximum, value);
      if (value === 0) zeroCount += 1;
      else minimumPositive = Math.min(minimumPositive, value);
      const transformed = Math.min(
        HISTOGRAM_LOG_MAXIMUM,
        Math.log1p(value)
      );
      const index = Math.min(
        counts.length - 1,
        Math.floor(transformed / HISTOGRAM_LOG_MAXIMUM * counts.length)
      );
      counts[index] += 1;
      if (value > 0) {
        const eta = Math.log(value);
        if (Math.abs(eta - 30) <= 1e-10) upperClipCount += 1;
        if (Math.abs(eta + 30) <= 1e-10) lowerClipCount += 1;
        if (eta >= 29.9) nearUpperClipCount += 1;
        if (eta <= -29.9) nearLowerClipCount += 1;
      }
    },
    quantile(probability) {
      if (count === 0) return null;
      if (probability >= 1) return maximum;
      const target = Math.max(1, Math.ceil(probability * count));
      let cumulative = 0;
      for (let index = 0; index < counts.length; index += 1) {
        cumulative += counts[index];
        if (cumulative >= target) {
          const transformed = (index + 0.5) / counts.length
            * HISTOGRAM_LOG_MAXIMUM;
          return Math.expm1(transformed);
        }
      }
      return maximum;
    },
    finalize() {
      return {
        method: "DETERMINISTIC_LOG_HISTOGRAM_32768_BINS",
        count,
        zeroCount,
        minimumPositive: Number.isFinite(minimumPositive) ? minimumPositive : null,
        quantiles: Object.fromEntries(M2_PSC03_AUDIT_QUANTILES.map(
          (probability) => [quantileName(probability), this.quantile(probability)]
        )),
        maximum,
        upperEtaClipCount: upperClipCount,
        lowerEtaClipCount: lowerClipCount,
        nearUpperEtaClipCount: nearUpperClipCount,
        nearLowerEtaClipCount: nearLowerClipCount,
        recoveredEtaIsClippedOnly: true
      };
    }
  };
}

function createLinearHistogram() {
  const counts = new Uint32Array(10001);
  let count = 0;
  let sumValue = 0;
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  return {
    add(raw) {
      const value = number(raw);
      if (!Number.isFinite(value) || value < 0 || value > 1) return;
      count += 1;
      sumValue += value;
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
      counts[Math.min(10000, Math.floor(value * 10000))] += 1;
    },
    finalize() {
      const quantiles = {};
      for (const probability of M2_PSC03_AUDIT_QUANTILES) {
        const target = Math.max(1, Math.ceil(probability * count));
        let cumulative = 0;
        let result = null;
        for (let index = 0; index < counts.length; index += 1) {
          cumulative += counts[index];
          if (cumulative >= target) {
            result = index / 10000;
            break;
          }
        }
        quantiles[quantileName(probability)] = result;
      }
      return {
        method: "DETERMINISTIC_LINEAR_HISTOGRAM_10001_BINS",
        count,
        mean: ratio(sumValue, count),
        minimum: count === 0 ? null : minimum,
        quantiles,
        maximum: count === 0 ? null : maximum
      };
    }
  };
}

function createCommutativeKeyDigest() {
  let xor = 0n;
  let sumValue = 0n;
  let count = 0;
  const mask = (1n << 128n) - 1n;
  return {
    add(value) {
      const hex = sha256(String(value)).slice(0, 32);
      const numberValue = BigInt(`0x${hex}`);
      xor ^= numberValue;
      sumValue = (sumValue + numberValue) & mask;
      count += 1;
    },
    finalize() {
      return sha256(`${count}|${xor.toString(16).padStart(32, "0")}`
        + `|${sumValue.toString(16).padStart(32, "0")}`);
    }
  };
}

function binary64Hex(value) {
  const buffer = Buffer.allocUnsafe(8);
  buffer.writeDoubleBE(value, 0);
  return buffer.toString("hex");
}

function caseKey(row) {
  return `${row.family}\u001f${row.workId}\u001f${row.origin}\u001f${row.horizon}`;
}

function groupedCaseKey(row) {
  return `${caseKey(row)}\u001f${row.dimension ?? "group"}\u001f${row.group}`;
}

function cellKey(family, origin, horizon) {
  return `${family}\u001f${origin}\u001f${horizon}`;
}

function mapScores(value, transform) {
  return Object.fromEntries(Object.entries(value).map(
    ([key, row]) => [key, transform(row)]
  ));
}

function medianSorted(values) {
  if (values.length === 0) return null;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 1
    ? values[middle]
    : (values[middle - 1] + values[middle]) / 2;
}

function quantileName(probability) {
  return probability === 0.999 ? "p99_9" : `p${Math.round(probability * 100)}`;
}

function number(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : Number.NaN;
}

function nearlyEqual(left, right) {
  return Number.isFinite(left)
    && Number.isFinite(right)
    && Math.abs(left - right) <= EPSILON * Math.max(1, Math.abs(left), Math.abs(right));
}

function ratio(numerator, denominator) {
  return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0
    ? numerator / denominator
    : null;
}

function sum(values) {
  let total = 0;
  for (const value of values) total += Number(value);
  return total;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function compareJson(left, right) {
  return JSON.stringify(left).localeCompare(JSON.stringify(right));
}
