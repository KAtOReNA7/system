const FEATURE_NAMES = Object.freeze([
  "logBasePoint",
  "logTrailing3",
  "logTrailing6",
  "logTrailing12",
  "logTrailing24",
  "occurrence3",
  "occurrence6",
  "occurrence12",
  "occurrence24",
  "logMeanPositive",
  "monthsSincePositive",
  "recentToPriorRatio",
  "historyMonths",
  "logHorizon",
  "segmentDense",
  "segmentIntermittent",
  "segmentDormant",
  "routeMixed"
]);

export const M2_CURRENT_GLOBAL_MODEL_FAMILIES = Object.freeze([
  "regularized_hurdle_glm",
  "tweedie_gradient_boosted_stumps",
  "hurdle_gradient_boosted_stumps"
]);

export function fitM2CurrentGlobalModel(family, rows, parameters = {}) {
  if (!M2_CURRENT_GLOBAL_MODEL_FAMILIES.includes(family)) {
    throw new Error("m2_current_global_model_family_invalid");
  }
  if (!Array.isArray(rows) || rows.length < 20) {
    throw new Error("m2_current_global_model_training_rows_insufficient");
  }
  const featureSpace = fitFeatureSpace(rows);
  const samples = rows.map((row) => ({
    x: transformFeatures(row.features, featureSpace),
    actual: Math.max(0, finite(row.actual, "model_actual"))
  }));
  const occurrence = fitLogisticRidge(
    samples.map((sample) => ({
      x: sample.x,
      y: sample.actual > 0 ? 1 : 0
    })),
    Number(parameters.ridge ?? 1)
  );
  if (family === "regularized_hurdle_glm") {
    const positives = samples.filter((sample) => sample.actual > 0);
    const amount = fitLinearRidge(
      positives.map((sample) => ({
        x: sample.x,
        y: Math.log1p(sample.actual)
      })),
      Number(parameters.ridge ?? 1)
    );
    return freezeModel({
      family,
      parameters,
      featureSpace,
      predict: (features) => {
        const x = transformFeatures(features, featureSpace);
        const probability = predictLogistic(occurrence, x);
        const conditionalAmount = Math.max(
          0,
          Math.expm1(predictLinear(amount, x))
        );
        return {
          pointEstimate: probability * conditionalAmount,
          occurrenceProbability: probability,
          conditionalAmount
        };
      }
    });
  }
  if (family === "hurdle_gradient_boosted_stumps") {
    const positives = samples.filter((sample) => sample.actual > 0);
    const amount = fitSquaredErrorBoostedStumps(
      positives.map((sample) => ({
        x: sample.x,
        y: Math.log1p(sample.actual)
      })),
      parameters
    );
    return freezeModel({
      family,
      parameters,
      featureSpace,
      predict: (features) => {
        const x = transformFeatures(features, featureSpace);
        const probability = predictLogistic(occurrence, x);
        const conditionalAmount = Math.max(
          0,
          Math.expm1(predictBoostedStumps(amount, x))
        );
        return {
          pointEstimate: probability * conditionalAmount,
          occurrenceProbability: probability,
          conditionalAmount
        };
      }
    });
  }
  const tweedie = fitTweedieBoostedStumps(samples, parameters);
  return freezeModel({
    family,
    parameters,
    featureSpace,
    predict: (features) => {
      const x = transformFeatures(features, featureSpace);
      const probability = predictLogistic(occurrence, x);
      return {
        pointEstimate: predictTweedie(tweedie, x),
        occurrenceProbability: probability,
        conditionalAmount: null
      };
    }
  });
}

export function m2CurrentModelFeatureNames() {
  return [...FEATURE_NAMES];
}

function fitFeatureSpace(rows) {
  const vectors = rows.map((row) => featureVector(row.features));
  const means = FEATURE_NAMES.map((_, index) => (
    vectors.reduce((sum, vector) => sum + vector[index], 0) / vectors.length
  ));
  const scales = FEATURE_NAMES.map((_, index) => {
    const variance = vectors.reduce(
      (sum, vector) => sum + (vector[index] - means[index]) ** 2,
      0
    ) / vectors.length;
    return Math.sqrt(variance) || 1;
  });
  return Object.freeze({
    means: Object.freeze(means),
    scales: Object.freeze(scales)
  });
}

function transformFeatures(features, featureSpace) {
  const values = featureVector(features);
  return [
    1,
    ...values.map(
      (value, index) => (
        value - featureSpace.means[index]
      ) / featureSpace.scales[index]
    )
  ];
}

function featureVector(features) {
  if (features === null || typeof features !== "object") {
    throw new Error("m2_current_model_features_required");
  }
  return FEATURE_NAMES.map(
    (name) => finite(features[name], `model_feature_${name}`)
  );
}

function fitLinearRidge(samples, ridge) {
  if (samples.length === 0) {
    return { coefficients: [0] };
  }
  const width = samples[0].x.length;
  const matrix = zeroMatrix(width, width);
  const vector = Array(width).fill(0);
  for (const sample of samples) {
    for (let row = 0; row < width; row += 1) {
      vector[row] += sample.x[row] * sample.y;
      for (let column = 0; column < width; column += 1) {
        matrix[row][column] += sample.x[row] * sample.x[column];
      }
    }
  }
  addRidge(matrix, ridge);
  return { coefficients: solveLinearSystem(matrix, vector) };
}

function fitLogisticRidge(samples, ridge) {
  const width = samples[0].x.length;
  let coefficients = Array(width).fill(0);
  const observedRate = (
    samples.reduce((sum, sample) => sum + sample.y, 0) + 0.5
  ) / (samples.length + 1);
  coefficients[0] = Math.log(observedRate / (1 - observedRate));
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const matrix = zeroMatrix(width, width);
    const vector = Array(width).fill(0);
    for (const sample of samples) {
      const eta = dot(coefficients, sample.x);
      const probability = clamp(sigmoid(eta), 1e-6, 1 - 1e-6);
      const weight = Math.max(1e-5, probability * (1 - probability));
      const adjusted = eta + (sample.y - probability) / weight;
      for (let row = 0; row < width; row += 1) {
        vector[row] += weight * sample.x[row] * adjusted;
        for (let column = 0; column < width; column += 1) {
          matrix[row][column] += (
            weight * sample.x[row] * sample.x[column]
          );
        }
      }
    }
    addRidge(matrix, ridge);
    const next = solveLinearSystem(matrix, vector);
    const delta = Math.max(
      ...next.map((value, index) => Math.abs(value - coefficients[index]))
    );
    coefficients = next;
    if (delta < 1e-7) {
      break;
    }
  }
  return { coefficients };
}

function fitSquaredErrorBoostedStumps(samples, parameters) {
  const learningRate = finite(
    parameters.learningRate ?? 0.05,
    "gbm_learning_rate"
  );
  const rounds = positiveInteger(parameters.rounds ?? 40, "gbm_rounds");
  const initial = samples.reduce((sum, sample) => sum + sample.y, 0)
    / samples.length;
  const predictions = Array(samples.length).fill(initial);
  const stumps = [];
  for (let round = 0; round < rounds; round += 1) {
    const residuals = samples.map(
      (sample, index) => sample.y - predictions[index]
    );
    const stump = bestStump(samples, residuals);
    if (stump === null) {
      break;
    }
    stumps.push(stump);
    for (let index = 0; index < samples.length; index += 1) {
      predictions[index] += learningRate * stumpValue(
        stump,
        samples[index].x
      );
    }
  }
  return { initial, learningRate, stumps };
}

function fitTweedieBoostedStumps(samples, parameters) {
  const learningRate = finite(
    parameters.learningRate ?? 0.03,
    "tweedie_learning_rate"
  );
  const rounds = positiveInteger(parameters.rounds ?? 50, "tweedie_rounds");
  const power = finite(parameters.power ?? 1.5, "tweedie_power");
  if (power <= 1 || power >= 2) {
    throw new Error("m2_current_tweedie_power_invalid");
  }
  const mean = Math.max(
    1e-6,
    samples.reduce((sum, sample) => sum + sample.actual, 0) / samples.length
  );
  const initial = Math.log(mean);
  const eta = Array(samples.length).fill(initial);
  const stumps = [];
  for (let round = 0; round < rounds; round += 1) {
    const gradients = samples.map((sample, index) => {
      const mu = Math.exp(clamp(eta[index], -20, 20));
      return sample.actual * mu ** (1 - power) - mu ** (2 - power);
    });
    const stump = bestStump(samples, gradients);
    if (stump === null) {
      break;
    }
    stumps.push(stump);
    for (let index = 0; index < samples.length; index += 1) {
      eta[index] += learningRate * clamp(
        stumpValue(stump, samples[index].x),
        -5,
        5
      );
    }
  }
  return { initial, learningRate, power, stumps };
}

function bestStump(samples, targets) {
  let best = null;
  for (let feature = 1; feature < samples[0].x.length; feature += 1) {
    const values = samples.map((sample) => sample.x[feature])
      .sort((a, b) => a - b);
    const thresholds = [0.2, 0.4, 0.6, 0.8].map(
      (quantile) => values[Math.min(
        values.length - 1,
        Math.floor(quantile * values.length)
      )]
    );
    for (const threshold of new Set(thresholds)) {
      const left = [];
      const right = [];
      for (let index = 0; index < samples.length; index += 1) {
        (samples[index].x[feature] <= threshold ? left : right)
          .push(targets[index]);
      }
      if (left.length < 5 || right.length < 5) {
        continue;
      }
      const leftValue = mean(left);
      const rightValue = mean(right);
      const loss = left.reduce(
        (sum, value) => sum + (value - leftValue) ** 2,
        0
      ) + right.reduce(
        (sum, value) => sum + (value - rightValue) ** 2,
        0
      );
      if (
        best === null
        || loss < best.loss
        || (
          loss === best.loss
          && (
            feature < best.feature
            || feature === best.feature && threshold < best.threshold
          )
        )
      ) {
        best = { feature, threshold, leftValue, rightValue, loss };
      }
    }
  }
  return best;
}

function predictLinear(model, x) {
  return dot(model.coefficients, x);
}

function predictLogistic(model, x) {
  return clamp(sigmoid(predictLinear(model, x)), 0, 1);
}

function predictBoostedStumps(model, x) {
  return model.stumps.reduce(
    (value, stump) => value + model.learningRate * stumpValue(stump, x),
    model.initial
  );
}

function predictTweedie(model, x) {
  return Math.max(
    0,
    Math.exp(clamp(predictBoostedStumps(model, x), -20, 20))
  );
}

function stumpValue(stump, x) {
  return x[stump.feature] <= stump.threshold
    ? stump.leftValue
    : stump.rightValue;
}

function solveLinearSystem(matrix, vector) {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
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
      augmented[selected][pivot] = 1e-10;
    }
    [augmented[pivot], augmented[selected]] = [
      augmented[selected],
      augmented[pivot]
    ];
    const divisor = augmented[pivot][pivot];
    for (let column = pivot; column <= size; column += 1) {
      augmented[pivot][column] /= divisor;
    }
    for (let row = 0; row < size; row += 1) {
      if (row === pivot) {
        continue;
      }
      const factor = augmented[row][pivot];
      for (let column = pivot; column <= size; column += 1) {
        augmented[row][column] -= factor * augmented[pivot][column];
      }
    }
  }
  return augmented.map((row) => row[size]);
}

function addRidge(matrix, ridge) {
  const penalty = Math.max(1e-8, finite(ridge, "ridge"));
  for (let index = 1; index < matrix.length; index += 1) {
    matrix[index][index] += penalty;
  }
  matrix[0][0] += 1e-8;
}

function zeroMatrix(rows, columns) {
  return Array.from({ length: rows }, () => Array(columns).fill(0));
}

function dot(left, right) {
  return left.reduce(
    (sum, value, index) => sum + value * right[index],
    0
  );
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sigmoid(value) {
  if (value >= 0) {
    return 1 / (1 + Math.exp(-value));
  }
  const exponential = Math.exp(value);
  return exponential / (1 + exponential);
}

function freezeModel({ family, parameters, featureSpace, predict }) {
  return Object.freeze({
    family,
    parameters: Object.freeze({ ...parameters }),
    featureSpace,
    predict
  });
}

function finite(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`m2_current_${name}_invalid`);
  }
  return number;
}

function positiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`m2_current_${name}_invalid`);
  }
  return number;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
