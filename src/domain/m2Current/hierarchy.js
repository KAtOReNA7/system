const SEGMENTS = Object.freeze(["dense", "intermittent", "dormant"]);
const SUMMING_MATRIX = Object.freeze([
  Object.freeze([1, 1, 1]),
  Object.freeze([1, 0, 0]),
  Object.freeze([0, 1, 0]),
  Object.freeze([0, 0, 1])
]);

export function reconcileM2CurrentMinT(baseForecasts, covariance) {
  if (
    !Array.isArray(baseForecasts)
    || baseForecasts.length !== SUMMING_MATRIX.length
  ) {
    throw new Error("m2_current_mint_base_forecasts_invalid");
  }
  const forecasts = baseForecasts.map(
    (value) => finite(value, "mint_base_forecast")
  );
  const weights = validateCovariance(covariance);
  const inverseWeights = invertMatrix(weights);
  const summing = SUMMING_MATRIX.map((row) => [...row]);
  const transpose = transposeMatrix(summing);
  const middle = invertMatrix(
    multiplyMatrices(
      multiplyMatrices(transpose, inverseWeights),
      summing
    )
  );
  const projection = multiplyMatrices(
    multiplyMatrices(
      multiplyMatrices(summing, middle),
      transpose
    ),
    inverseWeights
  );
  const reconciled = multiplyMatrixVector(projection, forecasts);
  const bottom = reconciled.slice(1).map((value) => Math.max(0, value));
  return {
    reconciled: [bottom.reduce((sum, value) => sum + value, 0), ...bottom],
    coherent: true,
    nonnegativeConstraintApplied: reconciled.slice(1).some((value) => value < 0)
  };
}

export function reconcileM2CurrentSegmentHierarchy(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("m2_current_hierarchy_rows_required");
  }
  const origins = [...new Set(rows.map((row) => row.origin))].sort();
  const output = [];
  const cells = [];
  for (const origin of origins) {
    const earlier = rows.filter((row) => (
      row.origin < origin && row.labelAvailableAsOf <= origin
    ));
    const originRows = rows.filter((row) => row.origin === origin);
    const horizons = [...new Set(
      originRows.map((row) => Number(row.horizonMonths))
    )].sort((a, b) => a - b);
    for (const horizon of horizons) {
      const cellRows = originRows.filter(
        (row) => Number(row.horizonMonths) === horizon
      );
      const bottomBase = SEGMENTS.map((segment) => sumBy(
        cellRows.filter((row) => row.segment === segment),
        "pointEstimate"
      ));
      const globalScale = learnedScale(earlier, null);
      const segmentScales = SEGMENTS.map(
        (segment) => learnedScale(earlier, segment)
      );
      const baseForecasts = [
        bottomBase.reduce((sum, value) => sum + value, 0) * globalScale,
        ...bottomBase.map(
          (value, index) => value * segmentScales[index]
        )
      ];
      const covariance = diagonalCovariance(earlier);
      const reconciliation = reconcileM2CurrentMinT(
        baseForecasts,
        covariance
      );
      const factors = bottomBase.map((value, index) => (
        value > 0 ? reconciliation.reconciled[index + 1] / value : null
      ));
      for (const segment of SEGMENTS) {
        const segmentRows = cellRows.filter((row) => row.segment === segment);
        const segmentIndex = SEGMENTS.indexOf(segment);
        const reconciledTotal = reconciliation.reconciled[segmentIndex + 1];
        if (segmentRows.length === 0) {
          continue;
        }
        if (factors[segmentIndex] === null) {
          const perRow = reconciledTotal / segmentRows.length;
          output.push(...segmentRows.map((row) => ({
            ...row,
            pointEstimate: perRow,
            hierarchyAdjustmentFactor: null,
            hierarchyAllocation: "equal_when_base_segment_zero"
          })));
        } else {
          output.push(...segmentRows.map((row) => ({
            ...row,
            pointEstimate: Math.max(
              0,
              Number(row.pointEstimate) * factors[segmentIndex]
            ),
            hierarchyAdjustmentFactor: factors[segmentIndex],
            hierarchyAllocation: "proportional_within_segment"
          })));
        }
      }
      cells.push({
        origin,
        horizonMonths: horizon,
        baseForecasts,
        reconciledForecasts: reconciliation.reconciled,
        covarianceMode: earlier.length >= 20
          ? "as_of_diagonal_error_variance"
          : "cold_start_identity",
        sameOrLaterOuterTruthRead: false,
        coherentAfterReconciliation: nearlyEqual(
          reconciliation.reconciled[0],
          reconciliation.reconciled.slice(1)
            .reduce((sum, value) => sum + value, 0)
        ),
        nonnegativeConstraintApplied:
          reconciliation.nonnegativeConstraintApplied
      });
    }
  }
  return {
    schema: "m2.current.segment_hierarchy_reconciliation.v0.1",
    method: "MinT_diagonal_as_of_covariance_then_nonnegative_projection",
    hierarchy: "total_to_dense_intermittent_dormant",
    rows: output.sort(compareRows),
    cells,
    allCellsCoherent: cells.every(
      (cell) => cell.coherentAfterReconciliation
    )
  };
}

function learnedScale(rows, segment) {
  const selected = segment === null
    ? rows
    : rows.filter((row) => row.segment === segment);
  const prediction = sumBy(selected, "pointEstimate");
  const actual = sumBy(selected, "actual");
  if (selected.length < 20 || prediction <= 0 || actual < 0) {
    return 1;
  }
  return clamp(actual / prediction, 0.5, 1.5);
}

function diagonalCovariance(rows) {
  if (rows.length < 20) {
    return identityMatrix(4);
  }
  const errors = [
    rows.map((row) => Number(row.pointEstimate) - Number(row.actual)),
    ...SEGMENTS.map((segment) => rows
      .filter((row) => row.segment === segment)
      .map((row) => Number(row.pointEstimate) - Number(row.actual)))
  ];
  const variances = errors.map((values) => Math.max(1, variance(values)));
  return variances.map((value, row) => variances.map(
    (_, column) => row === column ? value : 0
  ));
}

function validateCovariance(value) {
  if (
    !Array.isArray(value)
    || value.length !== 4
    || value.some((row) => !Array.isArray(row) || row.length !== 4)
  ) {
    throw new Error("m2_current_mint_covariance_invalid");
  }
  const matrix = value.map((row) => row.map(
    (entry) => finite(entry, "mint_covariance")
  ));
  if (matrix.some((row, index) => row[index] <= 0)) {
    throw new Error("m2_current_mint_covariance_not_positive");
  }
  return matrix;
}

function variance(values) {
  if (values.length < 2) {
    return 1;
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce(
    (sum, value) => sum + (value - mean) ** 2,
    0
  ) / (values.length - 1);
}

function sumBy(rows, field) {
  return rows.reduce((sum, row) => sum + Number(row[field]), 0);
}

function invertMatrix(matrix) {
  const size = matrix.length;
  const augmented = matrix.map((row, index) => [
    ...row,
    ...Array.from({ length: size }, (_, column) => (
      index === column ? 1 : 0
    ))
  ]);
  for (let pivot = 0; pivot < size; pivot += 1) {
    let selected = pivot;
    for (let row = pivot + 1; row < size; row += 1) {
      if (
        Math.abs(augmented[row][pivot])
          > Math.abs(augmented[selected][pivot])
      ) {
        selected = row;
      }
    }
    if (Math.abs(augmented[selected][pivot]) < 1e-10) {
      throw new Error("m2_current_mint_matrix_singular");
    }
    [augmented[pivot], augmented[selected]] = [
      augmented[selected],
      augmented[pivot]
    ];
    const divisor = augmented[pivot][pivot];
    augmented[pivot] = augmented[pivot].map((value) => value / divisor);
    for (let row = 0; row < size; row += 1) {
      if (row === pivot) {
        continue;
      }
      const factor = augmented[row][pivot];
      augmented[row] = augmented[row].map(
        (value, column) => value - factor * augmented[pivot][column]
      );
    }
  }
  return augmented.map((row) => row.slice(size));
}

function multiplyMatrices(left, right) {
  return left.map((row) => right[0].map((_, column) => row.reduce(
    (sum, value, index) => sum + value * right[index][column],
    0
  )));
}

function multiplyMatrixVector(matrix, vector) {
  return matrix.map((row) => row.reduce(
    (sum, value, index) => sum + value * vector[index],
    0
  ));
}

function transposeMatrix(matrix) {
  return matrix[0].map((_, column) => matrix.map((row) => row[column]));
}

function identityMatrix(size) {
  return Array.from({ length: size }, (_, row) => Array.from(
    { length: size },
    (_, column) => row === column ? 1 : 0
  ));
}

function compareRows(a, b) {
  return (
    a.origin.localeCompare(b.origin)
    || a.standardWorkId.localeCompare(b.standardWorkId)
    || a.horizonMonths - b.horizonMonths
    || a.route.localeCompare(b.route)
  );
}

function finite(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`m2_current_${name}_invalid`);
  }
  return number;
}

function nearlyEqual(left, right) {
  return Math.abs(left - right) <= 1e-8 * Math.max(1, Math.abs(left));
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
