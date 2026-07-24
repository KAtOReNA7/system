import { alignM2CurrentCandidateToB4 } from "./comparator.js";

export function pairedWorkOriginBootstrap(
  candidateRows,
  comparatorRows,
  contract,
  options = {}
) {
  const pairs = alignM2CurrentCandidateToB4(
    candidateRows,
    comparatorRows,
    contract
  );
  const iterations = options.iterations
    ?? contract?.pairedBootstrap?.iterations;
  const seed = options.seed ?? contract?.pairedBootstrap?.seed;
  if (!Number.isSafeInteger(iterations) || iterations <= 0) {
    throw new Error("m2_current_bootstrap_iterations_invalid");
  }
  if (!Number.isSafeInteger(seed) || seed <= 0) {
    throw new Error("m2_current_bootstrap_seed_invalid");
  }

  const workIds = [...new Set(pairs.map((pair) => pair.standardWorkId))].sort();
  const origins = [...new Set(pairs.map((pair) => pair.origin))].sort();
  const random = mulberry32(seed);
  const relativeDeltas = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const workWeights = sampleMultiplicities(workIds, random);
    const originWeights = sampleMultiplicities(origins, random);
    let actualDenominator = 0;
    let candidateAbsoluteError = 0;
    let comparatorAbsoluteError = 0;
    for (const pair of pairs) {
      const weight = (
        workWeights.get(pair.standardWorkId)
        * originWeights.get(pair.origin)
      );
      if (weight === 0) {
        continue;
      }
      const actual = finite(pair.candidate.actual, "actual");
      const candidatePoint = finite(
        pair.candidate.pointEstimate,
        "candidate_point_estimate"
      );
      const comparatorPoint = finite(
        pair.comparator.pointEstimate,
        "comparator_point_estimate"
      );
      actualDenominator += Math.abs(actual) * weight;
      candidateAbsoluteError += Math.abs(candidatePoint - actual) * weight;
      comparatorAbsoluteError += Math.abs(comparatorPoint - actual) * weight;
    }
    if (actualDenominator === 0 || comparatorAbsoluteError === 0) {
      throw new Error("m2_current_bootstrap_denominator_zero");
    }
    relativeDeltas.push(
      candidateAbsoluteError / comparatorAbsoluteError - 1
    );
  }
  relativeDeltas.sort((a, b) => a - b);

  return {
    schema: "m2.current.paired_bootstrap.v0.1",
    method: contract.pairedBootstrap.method,
    confidence: contract.pairedBootstrap.confidence,
    iterations,
    seed,
    workCount: workIds.length,
    originCount: origins.length,
    caseCount: pairs.length,
    lower95: quantile(relativeDeltas, 0.025),
    median: quantile(relativeDeltas, 0.5),
    upper95: quantile(relativeDeltas, 0.975)
  };
}

function sampleMultiplicities(values, random) {
  const counts = new Map(values.map((value) => [value, 0]));
  for (let draw = 0; draw < values.length; draw += 1) {
    const selected = values[Math.floor(random() * values.length)];
    counts.set(selected, counts.get(selected) + 1);
  }
  return counts;
}

function quantile(sorted, probability) {
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) {
    return sorted[lower];
  }
  const fraction = index - lower;
  return sorted[lower] * (1 - fraction) + sorted[upper] * fraction;
}

function finite(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`m2_current_bootstrap_${name}_invalid`);
  }
  return number;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}
