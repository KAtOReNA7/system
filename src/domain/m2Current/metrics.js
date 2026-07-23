export function scoreM2CurrentPointRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("m2_current_score_rows_required");
  }
  let absoluteError = 0;
  let signedError = 0;
  let actualDenominator = 0;
  for (const row of rows) {
    const actual = finite(row?.actual, "actual");
    const pointEstimate = finite(row?.pointEstimate, "point_estimate");
    absoluteError += Math.abs(pointEstimate - actual);
    signedError += pointEstimate - actual;
    actualDenominator += Math.abs(actual);
  }
  if (actualDenominator === 0) {
    throw new Error("m2_current_actual_denominator_zero");
  }
  return {
    caseCount: rows.length,
    wape: absoluteError / actualDenominator,
    signedBias: signedError / actualDenominator,
    zeroImputationUsed: false
  };
}

export function scoreM2CurrentSlices(rows, field) {
  const groups = new Map();
  for (const row of rows) {
    const key = String(row?.[field] ?? "");
    if (key === "") {
      throw new Error(`m2_current_slice_${field}_missing`);
    }
    const values = groups.get(key) ?? [];
    values.push(row);
    groups.set(key, values);
  }
  return Object.fromEntries(
    [...groups].sort(([a], [b]) => a.localeCompare(b))
      .map(([key, values]) => [key, scoreM2CurrentPointRows(values)])
  );
}

function finite(value, name) {
  if (value === null || value === undefined || value === "") {
    throw new Error(`m2_current_${name}_invalid`);
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`m2_current_${name}_invalid`);
  }
  return number;
}
