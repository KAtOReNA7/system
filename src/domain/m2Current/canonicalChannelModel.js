import {
  scoreM2CurrentPointRows,
  scoreM2CurrentSlices
} from "./metrics.js";

const TERMINAL_ROLE = "terminal_sales_platform";
const MEMBERSHIP_LIKE_MODES = new Set([
  "membership_subscription",
  "advertising_or_free_share"
]);
const DEFAULT_WEIGHTS = Object.freeze([0, 0.25, 0.5, 0.75, 1]);

export function forecastM2CurrentCanonicalChannelCase(
  row,
  {
    seasonalLookbackYears = 2,
    trendDamping = 0.5
  } = {}
) {
  const horizonMonths = requirePositiveInteger(
    row?.horizonMonths,
    "horizon"
  );
  const channels = Array.isArray(row?.canonicalChannels)
    ? row.canonicalChannels
    : [];
  let terminalForecast = 0;
  let terminalHistoryAmount = 0;
  let totalHistoryAmount = 0;
  let supportedChannelCount = 0;
  const blockedModes = new Set();
  for (const channel of channels) {
    const values = finiteSeries(channel?.historySeries);
    const historyAmount = values.reduce(
      (sum, value) => sum + Math.abs(value),
      0
    );
    totalHistoryAmount += historyAmount;
    if (channel?.channelRole !== TERMINAL_ROLE) {
      blockedModes.add("non_terminal_channel");
      continue;
    }
    terminalHistoryAmount += historyAmount;
    if (!MEMBERSHIP_LIKE_MODES.has(channel?.revenueMode)) {
      blockedModes.add(
        channel?.revenueMode === "single_purchase_or_on_demand"
          ? "single_purchase_unit_economics_missing"
          : "unsupported_revenue_mode"
      );
      continue;
    }
    terminalForecast += forecastMembershipLikeSeries(
      values,
      horizonMonths,
      {
        seasonalLookbackYears,
        trendDamping
      }
    );
    supportedChannelCount += 1;
  }
  const directCoverage = totalHistoryAmount === 0
    ? 0
    : terminalHistoryAmount / totalHistoryAmount;
  return Object.freeze({
    channelPointEstimate: Math.max(0, terminalForecast),
    supportedChannelCount,
    canonicalChannelCount: channels.length,
    directCoverage,
    blockedModes: Object.freeze([...blockedModes].sort()),
    singlePurchaseUnitConversionUsed: false,
    launchAgeUsed: false,
    observedSalesAgeUsed: true
  });
}

export function buildM2CurrentCanonicalChannelChallenger(
  rows,
  {
    weights = DEFAULT_WEIGHTS,
    minimumEarlierRows = 80,
    minimumRelativeWapeImprovement = 0.01,
    maximumTrainingAbsoluteBias = 0.15,
    postHocFeatureRead = false
  } = {}
) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("m2_current_canonical_channel_rows_required");
  }
  const allowedWeights = [...new Set(weights.map(Number))]
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 1)
    .sort((a, b) => a - b);
  if (allowedWeights.length === 0 || !allowedWeights.includes(0)) {
    throw new Error("m2_current_canonical_channel_weights_invalid");
  }
  const source = rows.map((input) => {
    const basePointEstimate = Number(input?.basePointEstimate);
    const actual = Number(input?.actual);
    if (!Number.isFinite(basePointEstimate) || !Number.isFinite(actual)) {
      throw new Error("m2_current_canonical_channel_case_value_invalid");
    }
    const channel = forecastM2CurrentCanonicalChannelCase(input);
    return {
      ...input,
      basePointEstimate,
      actual,
      channelPointEstimate: channel.channelPointEstimate,
      channelEvidence: channel
    };
  }).sort(compareRows);
  const origins = [...new Set(source.map((row) => requireMonth(row.origin)))]
    .sort();
  const output = [];
  const selections = [];
  for (const origin of origins) {
    const groups = [...new Set(source
      .filter((row) => row.origin === origin)
      .map(groupKey))]
      .sort();
    for (const group of groups) {
      const training = source.filter((row) => (
        groupKey(row) === group
        && row.origin < origin
        && requireMonth(row.labelAvailableAsOf) <= origin
      ));
      const outer = source.filter((row) => (
        groupKey(row) === group && row.origin === origin
      ));
      const selection = selectWeight(training, {
        allowedWeights,
        minimumEarlierRows,
        minimumRelativeWapeImprovement,
        maximumTrainingAbsoluteBias
      });
      selections.push({
        outerOrigin: origin,
        group,
        matureEarlierRowCount: training.length,
        matureEarlierOriginCount:
          new Set(training.map((row) => row.origin)).size,
        maximumLabelAvailableAsOf:
          training.map((row) => row.labelAvailableAsOf).sort().at(-1) ?? null,
        selectedChannelWeight: selection.weight,
        selectionReason: selection.reason,
        trainingMetrics: selection.metrics,
        relativeWapeToBase: selection.relativeWape,
        sameOrLaterOuterTruthRead: false,
        postHocFeatureRead
      });
      for (const row of outer) {
        output.push({
          ...row,
          pointEstimate: blendPoint(row, selection.weight),
          selectedChannelWeight: selection.weight,
          selectedCandidateId: selection.weight === 0
            ? "base_fallback"
            : `canonical_channel_blend_${selection.weight}`
        });
      }
    }
  }
  output.sort(compareRows);
  return Object.freeze({
    schema: "m2.current.canonical_channel_challenger.v0.1",
    rows: Object.freeze(output),
    selections: Object.freeze(selections),
    overall: scoreM2CurrentPointRows(output),
    byOrigin: scoreM2CurrentSlices(output, "origin"),
    byHorizon: scoreM2CurrentSlices(output, "horizonMonths"),
    bySegment: scoreM2CurrentSlices(output, "segment")
  });
}

function forecastMembershipLikeSeries(
  rawValues,
  horizonMonths,
  {
    seasonalLookbackYears,
    trendDamping
  }
) {
  if (rawValues.length === 0) return 0;
  const values = rawValues.map((value) => Math.max(0, value));
  const recent = mean(values.slice(-Math.min(6, values.length)));
  const previous = values.length >= 12
    ? mean(values.slice(-12, -6))
    : recent;
  const rawTrend = previous > 0 ? recent / previous : 1;
  const dampedTrend = clamp(
    1 + (rawTrend - 1) * trendDamping,
    0.5,
    1.5
  );
  let total = 0;
  for (let offset = 1; offset <= horizonMonths; offset += 1) {
    const seasonal = seasonalValue(
      values,
      offset,
      seasonalLookbackYears
    );
    const trend = dampedTrend ** (offset / 6);
    total += Math.max(0, seasonal * trend);
  }
  return total;
}

function seasonalValue(values, offset, years) {
  const positions = [];
  for (let year = 0; year < years; year += 1) {
    const index = values.length - 12 * (year + 1) + (offset - 1) % 12;
    if (index >= 0 && index < values.length) positions.push(values[index]);
  }
  if (positions.length > 0) return mean(positions);
  return mean(values.slice(-Math.min(6, values.length)));
}

function selectWeight(rows, policy) {
  const actualDenominator = rows.reduce(
    (sum, row) => sum + Math.abs(Number(row.actual)),
    0
  );
  const base = rows.length > 0 && actualDenominator > 0
    ? scoreM2CurrentPointRows(rows.map((row) => ({
      ...row,
      pointEstimate: row.basePointEstimate
    })))
    : null;
  if (rows.length < policy.minimumEarlierRows || !base || base.wape === 0) {
    return {
      weight: 0,
      reason: "mature_earlier_evidence_below_minimum",
      metrics: base,
      relativeWape: null
    };
  }
  const feasible = policy.allowedWeights.map((weight) => {
    const metrics = scoreM2CurrentPointRows(rows.map((row) => ({
      ...row,
      pointEstimate: blendPoint(row, weight)
    })));
    return {
      weight,
      metrics,
      relativeWape: metrics.wape / base.wape - 1
    };
  }).filter(({ metrics }) => (
    Math.abs(metrics.signedBias) <= policy.maximumTrainingAbsoluteBias
  )).sort((a, b) => (
    a.metrics.wape - b.metrics.wape
    || Math.abs(a.metrics.signedBias) - Math.abs(b.metrics.signedBias)
    || a.weight - b.weight
  ));
  const selected = feasible[0];
  if (
    !selected
    || selected.weight === 0
    || selected.relativeWape > -policy.minimumRelativeWapeImprovement
  ) {
    return {
      weight: 0,
      reason: "channel_signal_did_not_clear_nested_improvement_and_bias_gates",
      metrics: base,
      relativeWape: selected?.relativeWape ?? null
    };
  }
  return {
    ...selected,
    reason: "channel_signal_cleared_nested_improvement_and_bias_gates"
  };
}

function blendPoint(row, weight) {
  return Math.max(
    0,
    row.basePointEstimate * (1 - weight)
      + row.channelPointEstimate * weight
  );
}

function groupKey(row) {
  return [
    row.segment ?? "unknown",
    row.horizonMonths,
    row.dominantRevenueMode ?? "unknown"
  ].join("|");
}

function finiteSeries(value) {
  if (!Array.isArray(value)) {
    throw new Error("m2_current_canonical_channel_history_required");
  }
  return value.map(Number).map((item) => {
    if (!Number.isFinite(item)) {
      throw new Error("m2_current_canonical_channel_history_invalid");
    }
    return item;
  });
}

function mean(values) {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function requireMonth(value) {
  if (
    typeof value !== "string"
    || !/^\d{4}-(?:0[1-9]|1[0-2])$/u.test(value)
  ) {
    throw new Error("m2_current_canonical_channel_month_invalid");
  }
  return value;
}

function requirePositiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(`m2_current_canonical_channel_${name}_invalid`);
  }
  return number;
}

function compareRows(a, b) {
  return (
    requireMonth(a.origin).localeCompare(requireMonth(b.origin))
    || String(a.standardWorkId).localeCompare(String(b.standardWorkId))
    || Number(a.horizonMonths) - Number(b.horizonMonths)
  );
}
