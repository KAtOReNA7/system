const RATING_RANK = Object.freeze({
  "S+": 0,
  S: 1,
  A: 2,
  B: 3,
  C: 4,
  D: 5,
  E: 6
});

const LOW_VALUE_RATINGS = new Set(["D", "E"]);
const LOW_CONFIDENCE_LIFECYCLES = new Set(["inactive", "long_tail", "insufficient_history"]);
const SPIKE_RISKS = new Set(["abnormal_spike", "buyout_or_oneoff_income"]);
const READINESS_RISKS = new Set([
  "missing_copyright_end",
  "copyright_date_conflict",
  "aggregate_projection_gap",
  "insufficient_revenue_history",
  "insufficient_history"
]);

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function hasAny(values, targets) {
  return values.some((value) => targets.has(value));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function ratingAtOrBelow(rating, boundary) {
  return (RATING_RANK[rating] ?? 99) >= (RATING_RANK[boundary] ?? 99);
}

function remainingHorizonCapMultiplier(confidence, remainingMonths, lowEvidence) {
  if (remainingMonths <= 12) return 1.0;
  if (lowEvidence || confidence === "low" || confidence === "blocked_for_business_use") {
    return remainingMonths <= 24 ? 0.65 : 0.8;
  }
  if (confidence === "high") {
    return remainingMonths <= 24 ? 1.35 : 1.6;
  }
  return remainingMonths <= 24 ? 1.0 : 1.2;
}

export function calibrateForecastScenario(input) {
  const risks = Array.isArray(input.riskCodes) ? input.riskCodes : [];
  const reasons = [];
  const oldBase = Math.max(0, toNumber(input.baseForecast ?? input.forecastBase));
  const last12 = Math.max(0, toNumber(input.last12MonthRevenue));
  const last6 = Math.max(0, toNumber(input.last6MonthRevenue));
  const activeMonths = Math.max(0, toNumber(input.activeMonthCount));
  const remainingMonths = Math.max(0, toNumber(input.remainingMonthsForForecast, 12));
  const volatility = clamp(toNumber(input.last6CoefficientOfVariation), 0, 3);
  const wape = input.backtestWape == null ? null : Math.max(0, toNumber(input.backtestWape));
  const lifecycle = String(input.lifecycle ?? "");
  const rating = String(input.rating ?? "");
  const revenueScale = String(input.revenueScale ?? "");
  const fallbackUsed = Boolean(input.forecastFallbackUsed);
  const spikeRisk = hasAny(risks, SPIKE_RISKS);
  const readinessRisk = fallbackUsed || hasAny(risks, READINESS_RISKS);

  let base = oldBase;
  if (lifecycle === "inactive") {
    let cap = Math.max(last6 * 0.15, last12 * 0.08, last12 > 0 ? 0.5 : 0);
    if (last6 <= 0.01) {
      cap = 0;
    }
    base = Math.min(base, cap);
    reasons.push("inactive near-zero cap");
  } else if (lifecycle === "long_tail") {
    const cap = Math.max(last6 * 0.45, last12 * 0.3, last12 > 0 ? 1 : 0);
    base = Math.min(base, cap);
    reasons.push("long-tail low-revenue damping cap");
  } else if (lifecycle === "insufficient_history") {
    const cap = Math.max(last12 * 0.55, last6 * 0.9, last12 > 0 ? 1.5 : 0);
    base = Math.min(base, cap);
    reasons.push("insufficient-history conservative cap");
  } else if (lifecycle === "declining") {
    base = Math.min(base, Math.max(last12 * 0.32, last6 * 0.65));
    reasons.push("declining lifecycle damping");
  }

  if (ratingAtOrBelow(rating, "D") || revenueScale === "low" || revenueScale === "long_tail") {
    const cap = Math.max(last12 * 0.35, last6 * 0.6, last12 > 0 ? 1 : 0);
    base = Math.min(base, cap);
    reasons.push("D/E or low-value forecast cap");
  }
  if (spikeRisk) {
    base *= 0.35;
    reasons.push("abnormal-spike damping");
  }
  if (last12 > 0 && last6 / last12 <= 0.08) {
    base = Math.min(base, Math.max(last6 * 0.5, last12 * 0.04, last12 > 0 ? 0.5 : 0));
    reasons.push("recent-collapse damping");
  }
  if (activeMonths <= 2 && last12 <= 10) {
    base = Math.min(base, Math.max(last12, 1));
    reasons.push("sparse-near-zero floor/cap guard");
  }
  base = Math.max(0, base);

  let confidence = "medium";
  if (readinessRisk && (ratingAtOrBelow(rating, "C") || LOW_CONFIDENCE_LIFECYCLES.has(lifecycle))) {
    confidence = "blocked_for_business_use";
  } else if (
    fallbackUsed ||
    lifecycle === "insufficient_history" ||
    spikeRisk ||
    revenueScale === "low" ||
    revenueScale === "long_tail" ||
    LOW_CONFIDENCE_LIFECYCLES.has(lifecycle)
  ) {
    confidence = "low";
  } else if (
    activeMonths >= 12 &&
    volatility <= 0.6 &&
    (wape == null || wape <= 0.75) &&
    ["stable", "growth"].includes(lifecycle) &&
    ["top", "high"].includes(revenueScale)
  ) {
    confidence = "high";
  }

  const lowEvidence =
    LOW_CONFIDENCE_LIFECYCLES.has(lifecycle) ||
    revenueScale === "low" ||
    revenueScale === "long_tail" ||
    ratingAtOrBelow(rating, "D");
  if (last12 > 0) {
    const horizonCap = last12 * remainingHorizonCapMultiplier(confidence, remainingMonths, lowEvidence);
    if (base > horizonCap) {
      base = horizonCap;
      reasons.push("remaining-horizon overextension cap");
    }
  }

  let ratioTarget;
  if (confidence === "high") {
    ratioTarget = 1.35 + Math.min(0.08, volatility * 0.08);
  } else if (confidence === "medium") {
    ratioTarget = 1.55 + Math.min(0.25, volatility * 0.18);
  } else if (confidence === "low") {
    ratioTarget = 2.35 + Math.min(0.45, volatility * 0.22);
  } else {
    ratioTarget = 2.65 + Math.min(0.45, volatility * 0.18);
  }

  if (wape != null && wape > 1.5) {
    ratioTarget += 0.2;
    if (confidence === "high") confidence = "medium";
    reasons.push("high backtest residual widens interval and lowers confidence");
  }
  if (spikeRisk || fallbackUsed) {
    ratioTarget += 0.15;
  }
  const maxByConfidence = {
    high: 1.45,
    medium: 1.85,
    low: 2.9,
    blocked_for_business_use: 3.2
  };
  ratioTarget = clamp(ratioTarget, 1.15, maxByConfidence[confidence]);

  const side = Math.sqrt(ratioTarget);
  const pessimistic = base / side;
  const optimistic = base * side;

  return {
    baseForecast: round(base),
    pessimisticForecast: round(pessimistic),
    optimisticForecast: round(optimistic),
    confidence,
    intervalReason: reasons.length ? reasons : ["data-driven residual and volatility interval"],
    optimisticPessimisticRatio: round(ratioTarget, 4),
    scenarioSpread: base > 0 ? round((optimistic - pessimistic) / base, 4) : 0
  };
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(toNumber(value) * factor) / factor;
}
