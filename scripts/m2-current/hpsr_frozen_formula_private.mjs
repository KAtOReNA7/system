import {
  fitM2CoreHorizonAmountModel,
  predictM2CoreHorizonAmount
} from "../../src/domain/m2Current/coreLegacyHorizonAmount.js";
import {
  addMonths
} from "../../src/domain/m2Current/headProtectedSegmentedRouter.js";

export function fitHpsrFrozenB3AtOrigin({
  origin,
  featureRows,
  coreAmountConfig,
  fixedFit
}) {
  const trainingRows = featureRows.filter((row) => (
    row.horizonMonths === 3
    && row.origin < origin
    && row.labelAvailableAsOf <= origin
    && Number.isFinite(row.features?.lg01PointEstimate)
  ));
  const validationRows = featureRows.filter((row) => (
    row.horizonMonths === 3
    && row.origin === origin
    && Number.isFinite(row.features?.lg01PointEstimate)
  ));
  if (trainingRows.length === 0 || validationRows.length === 0) {
    throw new Error("hpsr02_frozen_formula_cell_empty");
  }
  const state = fitM2CoreHorizonAmountModel(trainingRows, {
    armId: "B3",
    huberDelta: fixedFit.huberDelta,
    l2: fixedFit.l2,
    config: coreAmountConfig
  });
  if (state.maximumTrainingLabelAvailableAsOf > origin) {
    throw new Error("hpsr02_frozen_formula_future_label_read");
  }
  const predictions = validationRows.map(
    (row) => predictM2CoreHorizonAmount(row, state)
  );
  return Object.freeze({
    origin,
    trainingRows,
    validationRows,
    state,
    predictions
  });
}

export function monthRangeInclusive(from, through) {
  const months = [];
  let current = from;
  while (current <= through) {
    months.push(current);
    current = addMonths(current, 1);
  }
  if (months.length === 0 || months.at(-1) !== through) {
    throw new Error("hpsr02_bound_origin_range_invalid");
  }
  return Object.freeze(months);
}
