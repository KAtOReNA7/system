export class M2Psc03EvaluationError extends Error {
  constructor(code) {
    super(code);
    this.name = "M2Psc03EvaluationError";
    this.code = code;
  }
}

export function scoreM2Psc03CaseRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new M2Psc03EvaluationError("m2_psc03_evaluation_rows_required");
  }
  const absoluteErrors = [];
  const byWork = new Map();
  let actualDenominator = 0;
  let actualMass = 0;
  let predictionMass = 0;
  let absoluteError = 0;
  let signedError = 0;
  for (const row of rows) {
    const actual = finite(row?.actual, "actual");
    const prediction = nonnegative(row?.pointEstimate, "point_estimate");
    const error = Math.abs(prediction - actual);
    actualDenominator += Math.abs(actual);
    actualMass += actual;
    predictionMass += prediction;
    absoluteError += error;
    signedError += prediction - actual;
    absoluteErrors.push(error);
    const workId = requiredString(row?.standardWorkId, "standard_work_id");
    byWork.set(workId, (byWork.get(workId) ?? 0) + error);
  }
  absoluteErrors.sort((left, right) => left - right);
  const workErrors = [...byWork.values()].sort((left, right) => right - left);
  return Object.freeze({
    caseCount: rows.length,
    workCount: byWork.size,
    actualDenominator,
    actualMass,
    predictionMass,
    predictionActualCashRatio: actualMass === 0
      ? null
      : predictionMass / actualMass,
    absoluteError,
    signedError,
    wape: actualDenominator === 0 ? null : absoluteError / actualDenominator,
    signedBias: actualDenominator === 0 ? null : signedError / actualDenominator,
    mae: absoluteError / rows.length,
    medianAbsoluteError: medianSorted(absoluteErrors),
    errorConcentration: Object.freeze({
      maximumWorkShare: absoluteError === 0
        ? null
        : (workErrors[0] ?? 0) / absoluteError,
      top10WorkShare: absoluteError === 0
        ? null
        : sum(workErrors.slice(0, 10)) / absoluteError
    })
  });
}

export function scoreM2Psc03ConditionalRows(rows) {
  if (!Array.isArray(rows)) {
    throw new M2Psc03EvaluationError("m2_psc03_conditional_rows_invalid");
  }
  const selected = rows.filter((row) => Number(row.actualPositive) > 0);
  if (selected.length === 0) {
    return Object.freeze({
      rowCount: 0,
      workCount: 0,
      actualMass: 0,
      predictionMass: 0,
      absoluteError: 0,
      wape: null,
      signedBias: null,
      mae: null,
      medianAbsoluteError: null,
      logMae: null
    });
  }
  const absolute = [];
  const logAbsolute = [];
  const works = new Set();
  let actualMass = 0;
  let predictionMass = 0;
  for (const row of selected) {
    const actual = positive(row.actualPositive, "conditional_actual");
    const prediction = positive(
      row.conditionalPositiveAmount,
      "conditional_prediction"
    );
    actualMass += actual;
    predictionMass += prediction;
    absolute.push(Math.abs(prediction - actual));
    logAbsolute.push(Math.abs(Math.log(prediction) - Math.log(actual)));
    if (typeof row.standardWorkId === "string" && row.standardWorkId !== "") {
      works.add(row.standardWorkId);
    }
  }
  absolute.sort((left, right) => left - right);
  return Object.freeze({
    rowCount: selected.length,
    workCount: works.size,
    actualMass,
    predictionMass,
    absoluteError: sum(absolute),
    wape: sum(absolute) / actualMass,
    signedBias: (predictionMass - actualMass) / actualMass,
    mae: sum(absolute) / selected.length,
    medianAbsoluteError: medianSorted(absolute),
    logMae: sum(logAbsolute) / selected.length
  });
}

export function groupM2Psc03Scores(rows, field, privacy) {
  const groups = new Map();
  for (const row of rows) {
    const key = String(typeof field === "function" ? field(row) : row[field]);
    const selected = groups.get(key) ?? [];
    selected.push(row);
    groups.set(key, selected);
  }
  return Object.freeze(Object.fromEntries(
    [...groups.entries()].sort(([left], [right]) => left.localeCompare(right))
      .map(([key, selected]) => [
        key,
        protectM2Psc03Aggregate(scoreM2Psc03CaseRows(selected), privacy)
      ])
  ));
}

export function protectM2Psc03Aggregate(score, privacy) {
  const minimumCases = Number(privacy?.minimumCases);
  const minimumWorks = Number(privacy?.minimumWorks);
  if (
    !Number.isInteger(minimumCases)
    || minimumCases <= 0
    || !Number.isInteger(minimumWorks)
    || minimumWorks <= 0
  ) {
    throw new M2Psc03EvaluationError("m2_psc03_privacy_contract_invalid");
  }
  if (score.caseCount < minimumCases || score.workCount < minimumWorks) {
    return Object.freeze({
      status: "SUPPRESSED_PRIVACY_THRESHOLD",
      minimumCases,
      minimumWorks,
      metrics: null
    });
  }
  return Object.freeze({status: "PUBLISHED_AGGREGATE", metrics: score});
}

export function selectM2Psc03OriginVisiblePopulation({
  originWorkCash,
  fraction
}) {
  if (!(originWorkCash instanceof Map) || originWorkCash.size === 0) {
    throw new M2Psc03EvaluationError("m2_psc03_origin_cash_required");
  }
  if (!Number.isFinite(fraction) || fraction <= 0 || fraction > 1) {
    throw new M2Psc03EvaluationError("m2_psc03_population_fraction_invalid");
  }
  const byOrigin = new Map();
  for (const [key, rawCash] of originWorkCash) {
    const [origin, standardWorkId] = splitPairKey(key);
    const rows = byOrigin.get(origin) ?? [];
    rows.push({standardWorkId, cash: Math.max(0, finite(rawCash, "origin_cash"))});
    byOrigin.set(origin, rows);
  }
  const selected = new Set();
  for (const [origin, rows] of byOrigin) {
    rows.sort((left, right) => (
      right.cash - left.cash
      || left.standardWorkId.localeCompare(right.standardWorkId)
    ));
    const total = sum(rows.map((row) => row.cash));
    let cumulative = 0;
    for (const row of rows) {
      if (total > 0 && cumulative / total >= fraction) break;
      selected.add(pairKey(origin, row.standardWorkId));
      cumulative += row.cash;
    }
  }
  return Object.freeze({fraction, selected, originCount: byOrigin.size});
}

export function assignM2Psc03CashBands({cases, originWorkCash, core80}) {
  if (!(core80?.selected instanceof Set)) {
    throw new M2Psc03EvaluationError("m2_psc03_core80_selection_required");
  }
  const byOrigin = new Map();
  for (const key of core80.selected) {
    const [origin, standardWorkId] = splitPairKey(key);
    const rows = byOrigin.get(origin) ?? [];
    rows.push({
      standardWorkId,
      cash: Math.max(0, finite(originWorkCash.get(key) ?? 0, "band_cash"))
    });
    byOrigin.set(origin, rows);
  }
  const bandByOriginWork = new Map();
  for (const [origin, rows] of byOrigin) {
    rows.sort((left, right) => (
      right.cash - left.cash
      || left.standardWorkId.localeCompare(right.standardWorkId)
    ));
    const total = sum(rows.map((row) => row.cash));
    let cumulative = 0;
    for (const row of rows) {
      const shareBefore = total === 0 ? 0 : cumulative / total;
      const band = shareBefore < 0.5 ? "H50" : shareBefore < 0.8 ? "M30" : "L20";
      bandByOriginWork.set(pairKey(origin, row.standardWorkId), band);
      cumulative += row.cash;
    }
  }
  return Object.freeze(cases.flatMap((row) => {
    const key = pairKey(row.origin, row.standardWorkId);
    const cashBandId = bandByOriginWork.get(key);
    return cashBandId === undefined
      ? []
      : [Object.freeze({...row, populationId: "CORE80", cashBandId})];
  }));
}

export function pairedM2Psc03WholeWorkBootstrap({
  candidateRows,
  baselineRows,
  seed,
  iterations,
  includeDraws = false
}) {
  if (!Number.isInteger(seed) || !Number.isInteger(iterations) || iterations <= 0) {
    throw new M2Psc03EvaluationError("m2_psc03_bootstrap_contract_invalid");
  }
  verifyM2Psc03SameCaseComparator({candidateRows, baselineRows});
  const baseline = uniqueCaseMap(baselineRows, "bootstrap_baseline_duplicate");
  const byWork = new Map();
  for (const row of candidateRows) {
    const paired = baseline.get(caseKey(row));
    if (paired === undefined) {
      throw new M2Psc03EvaluationError("m2_psc03_bootstrap_case_missing");
    }
    const value = byWork.get(row.standardWorkId) ?? {
      actual: 0,
      improvement: 0
    };
    value.actual += Math.abs(finite(row.actual, "bootstrap_actual"));
    value.improvement += (
      Math.abs(finite(paired.pointEstimate, "bootstrap_baseline") - row.actual)
      - Math.abs(finite(row.pointEstimate, "bootstrap_candidate") - row.actual)
    );
    byWork.set(row.standardWorkId, value);
  }
  const clusters = [...byWork.values()];
  const random = mulberry32(seed);
  const draws = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let actual = 0;
    let improvement = 0;
    for (let index = 0; index < clusters.length; index += 1) {
      const selected = clusters[Math.floor(random() * clusters.length)];
      actual += selected.actual;
      improvement += selected.improvement;
    }
    draws.push(actual === 0 ? 0 : improvement / actual);
  }
  const orderedDraws = [...draws].sort((left, right) => left - right);
  const observedActual = sum(clusters.map((row) => row.actual));
  const observedImprovement = sum(clusters.map((row) => row.improvement));
  const result = {
    seed,
    iterations,
    clusterUnit: "standardWorkId",
    workCount: clusters.length,
    observedImprovement: observedActual === 0
      ? null
      : observedImprovement / observedActual,
    lower95: quantileLinear(orderedDraws, 0.025),
    upper95: quantileLinear(orderedDraws, 0.975)
  };
  if (includeDraws) result.draws = Object.freeze(draws);
  return Object.freeze(result);
}

export function normalizedM2Psc03ChannelCompositionWape({
  candidateChannelRows,
  baselineChannelRows
}) {
  const candidate = uniqueChannelCaseMap(
    candidateChannelRows,
    "composition_candidate_duplicate"
  );
  const baseline = uniqueChannelCaseMap(
    baselineChannelRows,
    "composition_baseline_duplicate"
  );
  if (candidate.size !== baseline.size) {
    throw new M2Psc03EvaluationError("m2_psc03_composition_channel_mismatch");
  }
  for (const key of candidate.keys()) {
    if (!baseline.has(key)) {
      throw new M2Psc03EvaluationError("m2_psc03_composition_channel_missing");
    }
  }
  const candidateByWorkCase = groupChannelRows(candidateChannelRows);
  const baselineByWorkCase = groupChannelRows(baselineChannelRows);
  if (candidateByWorkCase.size !== baselineByWorkCase.size) {
    throw new M2Psc03EvaluationError("m2_psc03_composition_case_mismatch");
  }
  const evaluate = (rows, sourceByKey) => {
    let absolute = 0;
    let denominator = 0;
    for (const [workKey, channels] of rows) {
      const actualTotal = sum(channels.map((row) => row.actual));
      const predictionTotal = sum(channels.map((row) => row.pointEstimate));
      for (const row of channels) {
        const paired = sourceByKey.get(channelCaseKey(row));
        if (paired === undefined) {
          throw new M2Psc03EvaluationError("m2_psc03_composition_channel_missing");
        }
        const normalized = predictionTotal === 0
          ? 0
          : row.pointEstimate * actualTotal / predictionTotal;
        absolute += Math.abs(normalized - row.actual);
        denominator += Math.abs(row.actual);
      }
      if (!baselineByWorkCase.has(workKey)) {
        throw new M2Psc03EvaluationError("m2_psc03_composition_work_missing");
      }
    }
    return denominator === 0 ? null : absolute / denominator;
  };
  return Object.freeze({
    status: "POST_HOC_DIAGNOSTIC_NOT_MODEL_EVIDENCE_NOT_CANDIDATE_SCORE",
    candidateWape: evaluate(candidateByWorkCase, candidate),
    baselineWape: evaluate(baselineByWorkCase, baseline),
    scalarUsesEvaluationActual: true
  });
}

export function evaluateM2Psc03ScaleRecovery({
  primary,
  strict,
  psc01Primary,
  psc01Strict,
  strictByHorizon,
  composition,
  contract
}) {
  const relativeFva = (candidate, baseline) => (
    baseline.wape === 0 ? null : (baseline.wape - candidate.wape) / baseline.wape
  );
  const gates = Object.freeze({
    primaryRelativeFva: relativeFva(primary, psc01Primary)
      >= contract.primaryRelativeFvaMinimum,
    strictRelativeFva: relativeFva(strict, psc01Strict)
      >= contract.strictRelativeFvaMinimum,
    primaryPredictionActualRatio:
      primary.predictionActualCashRatio >= contract.primaryPredictionActualRatioMinimum
      && primary.predictionActualCashRatio <= contract.primaryPredictionActualRatioMaximum,
    eachStrictHorizonPredictionActualRatio: Object.values(strictByHorizon)
      .every((value) => (
        value.predictionActualCashRatio
          >= contract.strictHorizonPredictionActualRatioMinimum
        && value.predictionActualCashRatio
          <= contract.strictHorizonPredictionActualRatioMaximum
      )),
    normalizedComposition: composition.candidateWape
      <= composition.baselineWape
        + contract.normalizedCompositionWapeDeteriorationMaximum
  });
  return Object.freeze({
    relativeFva: Object.freeze({
      primary: relativeFva(primary, psc01Primary),
      strict: relativeFva(strict, psc01Strict)
    }),
    gates,
    allPassed: Object.values(gates).every(Boolean)
  });
}

export function pairM2Psc03Cases(candidateRows, baselineRows) {
  verifyM2Psc03SameCaseComparator({candidateRows, baselineRows});
  const baseline = uniqueCaseMap(baselineRows, "pair_baseline_duplicate");
  const output = candidateRows.map((row) => {
    const paired = baseline.get(caseKey(row));
    if (paired === undefined) {
      throw new M2Psc03EvaluationError("m2_psc03_pair_case_missing");
    }
    return Object.freeze({candidate: row, baseline: paired});
  });
  return Object.freeze(output);
}

export function verifyM2Psc03SameCaseComparator({
  candidateRows,
  baselineRows
}) {
  const candidate = uniqueCaseMap(candidateRows, "comparator_candidate_duplicate");
  const baseline = uniqueCaseMap(baselineRows, "comparator_baseline_duplicate");
  if (candidate.size !== baseline.size) {
    throw new M2Psc03EvaluationError("m2_psc03_comparator_population_mismatch");
  }
  for (const [key, row] of candidate) {
    const paired = baseline.get(key);
    if (paired === undefined) {
      throw new M2Psc03EvaluationError("m2_psc03_comparator_case_missing");
    }
    if (!Object.is(Number(row.actual), Number(paired.actual))) {
      throw new M2Psc03EvaluationError("m2_psc03_comparator_actual_mismatch");
    }
  }
  return Object.freeze({
    caseCount: candidate.size,
    sameCase: true,
    sameOrigin: true,
    sameHorizon: true,
    sameActualValues: true
  });
}

export function combineM2Psc03EvaluationFamilies(primaryRows, strictRows) {
  const primary = uniqueCaseMap(primaryRows, "primary_family_duplicate");
  const strict = uniqueCaseMap(strictRows, "strict_family_duplicate");
  for (const key of primary.keys()) {
    if (strict.has(key)) {
      throw new M2Psc03EvaluationError("m2_psc03_family_case_overlap");
    }
  }
  return Object.freeze([...primary.values(), ...strict.values()]);
}

export function m2Psc03CaseKey(row) {
  return caseKey(row);
}

export function m2Psc03ChannelCaseKey(row) {
  return channelCaseKey(row);
}

function groupChannelRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = caseKey(row);
    const selected = groups.get(key) ?? [];
    selected.push(row);
    groups.set(key, selected);
  }
  return groups;
}

function uniqueCaseMap(rows, code) {
  if (!Array.isArray(rows)) {
    throw new M2Psc03EvaluationError("m2_psc03_comparator_rows_invalid");
  }
  const result = new Map();
  for (const row of rows) {
    const key = caseKey(row);
    if (result.has(key)) {
      throw new M2Psc03EvaluationError(`m2_psc03_${code}`);
    }
    result.set(key, row);
  }
  return result;
}

function uniqueChannelCaseMap(rows, code) {
  if (!Array.isArray(rows)) {
    throw new M2Psc03EvaluationError("m2_psc03_composition_rows_invalid");
  }
  const result = new Map();
  for (const row of rows) {
    const key = channelCaseKey(row);
    if (result.has(key)) {
      throw new M2Psc03EvaluationError(`m2_psc03_${code}`);
    }
    result.set(key, row);
  }
  return result;
}

function caseKey(row) {
  return `${requiredString(row?.standardWorkId, "case_work")}\u001f`
    + `${requiredString(row?.origin, "case_origin")}\u001f`
    + `${Number(row?.horizonMonths)}`;
}

function channelCaseKey(row) {
  return `${caseKey(row)}\u001f${requiredString(row?.channelUid, "case_channel")}`;
}

function pairKey(origin, standardWorkId) {
  return `${origin}\u001f${standardWorkId}`;
}

function splitPairKey(value) {
  const parts = String(value).split("\u001f");
  if (parts.length !== 2 || parts.some((part) => part.length === 0)) {
    throw new M2Psc03EvaluationError("m2_psc03_origin_work_key_invalid");
  }
  return parts;
}

function requiredString(value, field) {
  if (typeof value !== "string" || value.length === 0) {
    throw new M2Psc03EvaluationError(`m2_psc03_${field}_invalid`);
  }
  return value;
}

function finite(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new M2Psc03EvaluationError(`m2_psc03_${field}_nonfinite`);
  }
  return number;
}

function nonnegative(value, field) {
  const number = finite(value, field);
  if (number < 0) {
    throw new M2Psc03EvaluationError(`m2_psc03_${field}_negative`);
  }
  return number;
}

function positive(value, field) {
  const number = finite(value, field);
  if (number <= 0) {
    throw new M2Psc03EvaluationError(`m2_psc03_${field}_not_positive`);
  }
  return number;
}

function medianSorted(values) {
  if (values.length === 0) return null;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0
    ? (values[middle - 1] + values[middle]) / 2
    : values[middle];
}

function quantileLinear(sorted, probability) {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value), 0);
}
