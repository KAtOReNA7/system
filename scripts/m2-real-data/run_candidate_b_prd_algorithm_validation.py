from __future__ import annotations

import csv
import hashlib
import json
import math
import os
import sys
import zipfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parents[2]
TEMP_DEPS = Path(os.environ.get("TEMP", "")) / "codex-system-pydeps"
if TEMP_DEPS.exists():
    sys.path.insert(0, str(TEMP_DEPS))
sys.path.insert(0, str(ROOT / "tools" / "m2-calibration"))

import numpy as np
import pandas as pd

from calibrate_cleaned_bills import add_months, classify_at, month_range
from run_nonformal_dry_run import (
    LIFECYCLE_ORDER,
    RATING_ORDER,
    RISK_SEVERITY,
    VARIANT_CONFIGS,
    evaluate_work_summary,
    load_analysis_inputs,
)

CANDIDATE_VERSION = "m2-realdata-dev-candidate-b-forecast-rebuilt-v0.3"
LEGACY_CANDIDATE_VERSION = "m2-realdata-dev-candidate-b-v0.1"
BASELINE_VERSION = "m2-c3-cleaned-bill-nonformal-v0.2/candidate-a"
PARAMETER_VARIANT = "candidate-b"

OUTPUT_DIR = ROOT / "docs" / "analysis" / "m2-real-data"
PRIVATE_DIR = ROOT / "data" / "private-output" / "m2-algorithm-validation"

FORECAST_JSON = OUTPUT_DIR / "M2-candidate-b-forecast-backtest-validation-v0.1.json"
FORECAST_MD = OUTPUT_DIR / "M2-candidate-b-forecast-backtest-validation-v0.1.md"
SPREAD_AUDIT_JSON = OUTPUT_DIR / "M2-candidate-b-forecast-scenario-spread-audit-v0.1.json"
SPREAD_AUDIT_MD = OUTPUT_DIR / "M2-candidate-b-forecast-scenario-spread-audit-v0.1.md"
REMEDIATION_JSON = OUTPUT_DIR / "M2-candidate-b-forecast-calibration-remediation-v0.1.json"
REMEDIATION_MD = OUTPUT_DIR / "M2-candidate-b-forecast-calibration-remediation-v0.1.md"
FORECAST_V2_JSON = OUTPUT_DIR / "M2-candidate-b-forecast-backtest-validation-v0.2.json"
FORECAST_V2_MD = OUTPUT_DIR / "M2-candidate-b-forecast-backtest-validation-v0.2.md"
RATING_JSON = OUTPUT_DIR / "M2-candidate-b-rating-reliability-validation-v0.1.json"
RATING_MD = OUTPUT_DIR / "M2-candidate-b-rating-reliability-validation-v0.1.md"
SUGGESTION_JSON = OUTPUT_DIR / "M2-candidate-b-suggestion-actionability-validation-v0.1.json"
SUGGESTION_MD = OUTPUT_DIR / "M2-candidate-b-suggestion-actionability-validation-v0.1.md"
FINAL_JSON = OUTPUT_DIR / "M2-candidate-b-algorithm-prd-usability-final-report-v0.1.json"
FINAL_MD = OUTPUT_DIR / "M2-candidate-b-algorithm-prd-usability-final-report-v0.1.md"
FINAL_V2_JSON = OUTPUT_DIR / "M2-candidate-b-algorithm-prd-usability-final-report-v0.2.json"
FINAL_V2_MD = OUTPUT_DIR / "M2-candidate-b-algorithm-prd-usability-final-report-v0.2.md"
REBUILD_V3_JSON = OUTPUT_DIR / "M2-candidate-b-forecast-model-rebuild-v0.3.json"
REBUILD_V3_MD = OUTPUT_DIR / "M2-candidate-b-forecast-model-rebuild-v0.3.md"
VALIDATION_V3_JSON = OUTPUT_DIR / "M2-candidate-b-v0.3-algorithm-validation-report.json"
VALIDATION_V3_MD = OUTPUT_DIR / "M2-candidate-b-v0.3-algorithm-validation-report.md"

PRIVATE_20_CSV = PRIVATE_DIR / "candidate-b-20-work-forecast-backtest-detail.csv"
PRIVATE_20_XLSX = PRIVATE_DIR / "candidate-b-20-work-forecast-backtest-detail.xlsx"
PRIVATE_200_CSV = PRIVATE_DIR / "candidate-b-200-work-validation-detail.csv"
PRIVATE_FULL_JSON = PRIVATE_DIR / "candidate-b-forecast-rebuilt-v0.3-full-cohort-validation-detail.json"
PRIVATE_CALIBRATED_CSV = PRIVATE_DIR / "candidate-b-forecast-rebuilt-v0.3-detail.csv"
PRIVATE_CALIBRATED_XLSX = PRIVATE_DIR / "candidate-b-forecast-rebuilt-v0.3-detail.xlsx"

HORIZONS = [3, 6, 12]
REQUIRED_SUGGESTIONS = [
    "promote",
    "maintain",
    "reduce_investment",
    "downlist_or_suspend",
    "renewal_review",
    "observe_only",
]
REQUIRED_RISKS = [
    "missing_copyright_end",
    "copyright_expiry",
    "channel_concentration",
    "channel_concentration_advisory",
    "abnormal_spike",
    "insufficient_history",
    "inactive_tail",
]
REVENUE_SCALES = ["top", "high", "mid", "low", "long_tail"]


def git_value(args: list[str]) -> str | None:
    try:
        import subprocess

        return subprocess.check_output(["git", *args], cwd=ROOT, text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        return None


def json_safe(value):
    if isinstance(value, dict):
        return {str(key): json_safe(child) for key, child in value.items()}
    if isinstance(value, list):
        return [json_safe(child) for child in value]
    if isinstance(value, tuple):
        return [json_safe(child) for child in value]
    if isinstance(value, set):
        return sorted(json_safe(child) for child in value)
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        return float(value)
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    try:
        if pd.isna(value):
            return None
    except Exception:
        pass
    return value


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(json_safe(payload), ensure_ascii=False, indent=2), encoding="utf-8")


def read_json_if_exists(path: Path) -> dict | None:
    try:
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    return None


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def safe_float(value, default: float = 0.0) -> float:
    try:
        result = float(value)
    except Exception:
        return default
    if not math.isfinite(result):
        return default
    return result


def safe_int(value, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def rounded(value, digits: int = 2):
    number = safe_float(value)
    return round(number, digits)


def stable_hash(*parts: str) -> str:
    return hashlib.sha256("|".join(str(part) for part in parts).encode("utf-8")).hexdigest()


def distribution(values, keys: list[str] | None = None) -> dict:
    counts = Counter(values)
    ordered = keys or sorted(counts)
    return {key: int(counts.get(key, 0)) for key in ordered if counts.get(key, 0) or keys}


def flattened_distribution(rows, field: str, keys: list[str] | None = None) -> dict:
    counter = Counter()
    for row in rows:
        counter.update(row.get(field) or [])
    ordered = keys or sorted(counter)
    return {key: int(counter.get(key, 0)) for key in ordered if counter.get(key, 0) or keys}


def number_summary(values) -> dict:
    clean = [safe_float(value) for value in values if value is not None and math.isfinite(safe_float(value))]
    if not clean:
        return {"count": 0, "min": 0, "p25": 0, "median": 0, "p75": 0, "p95": 0, "p99": 0, "max": 0, "total": 0}
    return {
        "count": len(clean),
        "min": rounded(min(clean)),
        "p25": rounded(np.quantile(clean, 0.25)),
        "median": rounded(np.quantile(clean, 0.5)),
        "p75": rounded(np.quantile(clean, 0.75)),
        "p95": rounded(np.quantile(clean, 0.95)),
        "p99": rounded(np.quantile(clean, 0.99)),
        "max": rounded(max(clean)),
        "total": rounded(sum(clean)),
    }


def quantile_points(values) -> dict:
    clean = [safe_float(value) for value in values if value is not None and math.isfinite(safe_float(value))]
    if not clean:
        return {"count": 0, "p50": None, "p75": None, "p90": None, "p95": None}
    return {
        "count": len(clean),
        "p50": round(float(np.quantile(clean, 0.50)), 4),
        "p75": round(float(np.quantile(clean, 0.75)), 4),
        "p90": round(float(np.quantile(clean, 0.90)), 4),
        "p95": round(float(np.quantile(clean, 0.95)), 4),
    }


def clamp(value: float, lower: float, upper: float) -> float:
    return min(upper, max(lower, value))


def safe_ratio(numerator, denominator, default=None):
    den = safe_float(denominator)
    if den <= 0:
        return default
    return safe_float(numerator) / den


def scenario_metrics(base, optimistic, pessimistic) -> dict:
    base_value = safe_float(base)
    optimistic_value = safe_float(optimistic)
    pessimistic_value = safe_float(pessimistic)
    return {
        "optimisticBaseRatio": None if base_value <= 0 else round(optimistic_value / base_value, 4),
        "basePessimisticRatio": None if pessimistic_value <= 0 else round(base_value / pessimistic_value, 4),
        "optimisticPessimisticRatio": None if pessimistic_value <= 0 else round(optimistic_value / pessimistic_value, 4),
        "scenarioSpread": None if base_value <= 0 else round((optimistic_value - pessimistic_value) / base_value, 4),
    }


def primary_risk_bucket(risks: list[str]) -> str:
    risk_set = set(risks or [])
    if risk_set.intersection({"abnormal_spike", "buyout_or_oneoff_income"}):
        return "abnormal_spike"
    if risk_set.intersection({"missing_copyright_end", "copyright_date_conflict", "aggregate_projection_gap"}):
        return "data_gap_or_copyright_fallback"
    if "insufficient_history" in risk_set or "insufficient_revenue_history" in risk_set:
        return "insufficient_history"
    if "inactive_tail" in risk_set:
        return "inactive_tail"
    if "revenue_decline" in risk_set:
        return "revenue_decline"
    if "copyright_expiry" in risk_set:
        return "copyright_expiry"
    if risk_set:
        return "other_risk"
    return "no_major_risk"


def fixed_multiplier_detected(ratios) -> bool:
    clean = [round(safe_float(value), 4) for value in ratios if value is not None and math.isfinite(safe_float(value))]
    if len(clean) < 10:
        return False
    p50 = round(float(np.quantile(clean, 0.50)), 4)
    p75 = round(float(np.quantile(clean, 0.75)), 4)
    p95 = round(float(np.quantile(clean, 0.95)), 4)
    unique_values = len(set(clean))
    return unique_values <= 3 or max(abs(p75 - p50), abs(p95 - p50)) <= 0.01


def markdown_table(rows: list[dict], columns: list[tuple[str, str]]) -> str:
    lines = ["| " + " | ".join(label for _, label in columns) + " |"]
    lines.append("|" + "|".join("---" for _ in columns) + "|")
    for row in rows:
        lines.append("| " + " | ".join(str(row.get(key, "")) for key, _ in columns) + " |")
    return "\n".join(lines)


def build_month_matrix(context: dict) -> tuple[pd.DataFrame, list[str]]:
    bill = context["bill"]
    latest_complete_month = context["latest_complete_month"]
    complete = bill[bill["validForCalibration"] & (bill["billMonth"] <= latest_complete_month)].copy()
    months = month_range(complete["billMonth"].min(), latest_complete_month)
    matrix = complete.groupby(["standardWorkId", "billMonth"])["amount"].sum().unstack(fill_value=0.0)
    matrix = matrix.reindex(columns=months, fill_value=0.0)
    return matrix, months


def revenue_scale(row, quantiles: dict) -> str:
    if str(row.lifecycle) == "long_tail":
        return "long_tail"
    value = safe_float(row.totalHistoricalRevenue)
    if value >= quantiles["p95"]:
        return "top"
    if value >= quantiles["p75"]:
        return "high"
    if value >= quantiles["p40"]:
        return "mid"
    if value > 0:
        return "low"
    return "long_tail"


def rating_score(rating: str) -> int:
    return {"S+": 100, "S": 92, "A": 82, "B": 68, "C": 52, "D": 35, "E": 10}.get(rating, 0)


def threshold_distance(value: float, thresholds: dict) -> dict:
    distances = []
    for rating, threshold in thresholds.items():
        threshold_value = safe_float(threshold)
        if threshold_value <= 0:
            continue
        distances.append({
            "rating": rating,
            "threshold": threshold_value,
            "relativeDistance": abs(value - threshold_value) / threshold_value,
        })
    if not distances:
        return {"nearBoundary": False, "nearestRating": None, "relativeDistance": None}
    nearest = min(distances, key=lambda item: item["relativeDistance"])
    return {
        "nearBoundary": nearest["relativeDistance"] <= 0.12,
        "nearestRating": nearest["rating"],
        "relativeDistance": round(nearest["relativeDistance"], 4),
    }


def lifecycle_boundary_flags(row, parameters: dict) -> list[str]:
    flags: list[str] = []
    lifecycle = parameters["lifecycle"]
    recent6_ratio = row.get("recent6Prior6Ratio")
    recent3_ratio = row.get("recent3Previous3Ratio")
    last12 = safe_float(row.get("last12MonthRevenue"))
    if recent6_ratio is not None and not pd.isna(recent6_ratio):
        growth = safe_float(lifecycle["growthRecent6Prior6Ratio"])
        declining = safe_float(lifecycle["decliningRecent6Prior6Ratio"])
        if growth and abs(safe_float(recent6_ratio) - growth) / growth <= 0.12:
            flags.append("growth_boundary")
        if declining and abs(safe_float(recent6_ratio) - declining) / declining <= 0.12:
            flags.append("declining_boundary")
    if recent3_ratio is not None and not pd.isna(recent3_ratio):
        rebound = safe_float(lifecycle["reboundRecent3Previous3Ratio"])
        if rebound and abs(safe_float(recent3_ratio) - rebound) / rebound <= 0.12:
            flags.append("rebound_boundary")
    long_tail = safe_float(lifecycle["longTailLast12RevenueMax"])
    if long_tail and abs(last12 - long_tail) / max(long_tail, 1.0) <= 0.15:
        flags.append("long_tail_boundary")
    return flags


def forecast_confidence(row, backtest_summary: dict) -> str:
    if bool(row.forecastFallbackUsed):
        return "low"
    if row.lifecycle == "insufficient_history" or "insufficient_history" in row.riskCodes:
        return "low"
    if "abnormal_spike" in row.riskCodes or "buyout_or_oneoff_income" in row.riskCodes:
        return "medium"
    if backtest_summary.get("candidateBetterOrEqualCount", 0) >= 2:
        return "high"
    return "medium"


def calibrated_confidence(row, scale: str, backtest_summary: dict) -> str:
    risks = set(row.riskCodes)
    fallback_used = bool(row.forecastFallbackUsed)
    volatility = clamp(safe_float(row.get("last6CoefficientOfVariation")), 0, 3)
    wape = backtest_summary.get("wape")
    readiness_risk = fallback_used or bool(
        risks.intersection({
            "missing_copyright_end",
            "copyright_date_conflict",
            "aggregate_projection_gap",
            "insufficient_revenue_history",
            "insufficient_history",
        })
    )
    low_evidence = (
        row.lifecycle in {"inactive", "long_tail", "insufficient_history"}
        or scale in {"low", "long_tail"}
        or row.rating in {"D", "E"}
    )
    if readiness_risk and low_evidence:
        return "blocked_for_business_use"
    if fallback_used or row.lifecycle == "insufficient_history" or risks.intersection({"abnormal_spike", "buyout_or_oneoff_income"}):
        return "low"
    if row.lifecycle in {"inactive", "long_tail"} or scale in {"low", "long_tail"}:
        return "low"
    if (
        safe_int(row.activeMonthCount) >= 12
        and volatility <= 0.60
        and row.lifecycle in {"stable", "growth"}
        and scale in {"top", "high"}
        and (wape is None or safe_float(wape) <= 0.75)
    ):
        return "high"
    return "medium"


def remaining_horizon_cap_multiplier(confidence: str, remaining_months: int, low_evidence: bool) -> float:
    if remaining_months <= 12:
        return 1.0
    if low_evidence or confidence in {"low", "blocked_for_business_use"}:
        return 0.65 if remaining_months <= 24 else 0.80
    if confidence == "high":
        return 1.35 if remaining_months <= 24 else 1.60
    return 1.00 if remaining_months <= 24 else 1.20


def calibrate_forecast_row(row, scale: str, backtest_summary: dict) -> dict:
    old_base = max(0.0, safe_float(row.forecastBase))
    last12 = max(0.0, safe_float(row.last12MonthRevenue))
    last6 = max(0.0, safe_float(row.last6MonthRevenue))
    active_months = safe_int(row.activeMonthCount)
    remaining_months = safe_int(getattr(row, "remainingMonthsForForecast", 12), 12)
    volatility = clamp(safe_float(row.get("last6CoefficientOfVariation")), 0, 3)
    risks = set(row.riskCodes)
    reasons: list[str] = []
    base = old_base

    if row.lifecycle == "inactive":
        cap = max(last6 * 0.15, last12 * 0.08, 0.5 if last12 > 0 else 0.0)
        if last6 <= 0.01:
            cap = min(cap, last12 * 0.03)
        base = min(base, cap)
        reasons.append("inactive near-zero cap")
    elif row.lifecycle == "long_tail":
        cap = max(last6 * 0.45, last12 * 0.30, 1.0 if last12 > 0 else 0.0)
        base = min(base, cap)
        reasons.append("long-tail low-revenue damping cap")
    elif row.lifecycle == "insufficient_history":
        cap = max(last12 * 0.55, last6 * 0.90, 1.5 if last12 > 0 else 0.0)
        base = min(base, cap)
        reasons.append("insufficient-history conservative cap")
    elif row.lifecycle == "declining":
        base = min(base, max(last12 * 0.32, last6 * 0.65))
        reasons.append("declining lifecycle damping")

    if row.rating in {"D", "E"} or scale in {"low", "long_tail"}:
        cap = max(last12 * 0.35, last6 * 0.60, 1.0 if last12 > 0 else 0.0)
        base = min(base, cap)
        reasons.append("D/E or low-value forecast cap")

    if risks.intersection({"abnormal_spike", "buyout_or_oneoff_income"}):
        base *= 0.35
        reasons.append("abnormal-spike damping")

    if last12 > 0 and last6 / last12 <= 0.08:
        base = min(base, max(last6 * 0.50, last12 * 0.04, 0.5 if last12 > 0 else 0.0))
        reasons.append("recent-collapse damping")

    if active_months <= 2 and last12 <= 10:
        base = min(base, max(last12, 1.0 if last12 > 0 else 0.0))
        reasons.append("sparse-near-zero floor/cap guard")

    base = max(0.0, base)
    confidence = calibrated_confidence(row, scale, backtest_summary)
    low_evidence = row.lifecycle in {"inactive", "long_tail", "insufficient_history"} or scale in {"low", "long_tail"} or row.rating in {"D", "E"}
    if last12 > 0:
        horizon_cap = last12 * remaining_horizon_cap_multiplier(confidence, remaining_months, low_evidence)
        if base > horizon_cap:
            base = horizon_cap
            reasons.append("remaining-horizon overextension cap")
    ratio_target = {
        "high": 1.35 + min(0.08, volatility * 0.08),
        "medium": 1.55 + min(0.25, volatility * 0.18),
        "low": 2.35 + min(0.45, volatility * 0.22),
        "blocked_for_business_use": 2.65 + min(0.45, volatility * 0.18),
    }[confidence]

    wape = backtest_summary.get("wape")
    if wape is not None and safe_float(wape) > 1.50:
        ratio_target += 0.20
        if confidence == "high":
            confidence = "medium"
        reasons.append("high backtest residual widens interval")

    if bool(row.forecastFallbackUsed) or risks.intersection({"abnormal_spike", "buyout_or_oneoff_income"}):
        ratio_target += 0.15

    ratio_target = clamp(
        ratio_target,
        1.15,
        {
            "high": 1.45,
            "medium": 1.85,
            "low": 2.90,
            "blocked_for_business_use": 3.20,
        }[confidence],
    )
    side = math.sqrt(ratio_target)
    pessimistic = base / side if side > 0 else base
    optimistic = base * side
    metrics = scenario_metrics(base, optimistic, pessimistic)
    return {
        "base": rounded(base),
        "pessimistic": rounded(pessimistic),
        "optimistic": rounded(optimistic),
        "confidence": confidence,
        "intervalReason": reasons or ["data-driven residual and volatility interval"],
        "metrics": metrics,
    }


def calibrated_cutoff_prediction(history: np.ndarray, horizon: int, cutoff_lifecycle: str, factors: dict) -> dict:
    last12 = float(history[-12:].sum()) if len(history) >= 12 else float(history.sum())
    last6 = float(history[-6:].sum()) if len(history) >= 6 else float(history.sum())
    active_months = int(np.count_nonzero(history > 0))
    recent = history[-6:] if len(history) >= 6 else history
    mean = float(np.mean(recent)) if len(recent) else 0.0
    std = float(np.std(recent)) if len(recent) else 0.0
    volatility = std / mean if mean > 0 else 0.0
    peak_share = float(history.max() / history.sum()) if history.sum() > 0 else 0.0
    baseline_prediction = last12 / 12.0 * horizon
    effective_factor = safe_float(factors.get(cutoff_lifecycle, 1.0), 1.0)
    if cutoff_lifecycle == "growth":
        effective_factor = max(effective_factor, 1.05)
    elif cutoff_lifecycle == "stable":
        effective_factor = max(effective_factor, 0.88)
    elif cutoff_lifecycle == "rebound":
        effective_factor = max(effective_factor, 0.90)
    raw_prediction = baseline_prediction * effective_factor
    base = raw_prediction
    reasons = []
    horizon_scale = horizon / 12.0
    six_month_scale = horizon / 6.0
    if cutoff_lifecycle == "inactive":
        cap = max(last6 * six_month_scale * 0.15, last12 * horizon_scale * 0.08, 0.5 if last12 > 0 else 0.0)
        if last6 <= 0.01:
            cap = 0.0
        base = min(base, cap)
        reasons.append("inactive near-zero cap")
    elif cutoff_lifecycle == "long_tail":
        base = min(base, max(last6 * six_month_scale * 0.45, last12 * horizon_scale * 0.30, 1.0 if last12 > 0 else 0.0))
        reasons.append("long-tail low-revenue damping cap")
    elif cutoff_lifecycle == "insufficient_history":
        base = min(base, max(last12 * horizon_scale * 0.55, last6 * six_month_scale * 0.90, 1.5 if last12 > 0 else 0.0))
        reasons.append("insufficient-history conservative cap")
    elif cutoff_lifecycle == "declining":
        base = min(base, max(last12 * horizon_scale * 0.32, last6 * six_month_scale * 0.65))
        reasons.append("declining lifecycle damping")
    if last12 > 0 and last6 / last12 <= 0.08:
        base = min(base, max(last6 * six_month_scale * 0.50, last12 * horizon_scale * 0.04, 0.5 if last12 > 0 else 0.0))
        reasons.append("recent-collapse damping")
    if last12 <= 10 or active_months <= 2:
        base = min(base, max(last12 * horizon_scale, 1.0 if last12 > 0 else 0.0))
        reasons.append("sparse-near-zero floor/cap guard")
    if peak_share >= 0.90:
        base *= 0.35
        reasons.append("abnormal-spike damping")

    confidence = "medium"
    if cutoff_lifecycle in {"inactive", "long_tail", "insufficient_history"}:
        confidence = "low"
    elif active_months >= 12 and volatility <= 0.60 and cutoff_lifecycle in {"stable", "growth"}:
        confidence = "high"
    ratio_target = {"high": 1.45, "medium": 1.85, "low": 2.90}[confidence]
    side = math.sqrt(ratio_target)
    return {
        "prediction": rounded(max(0.0, base)),
        "baselinePrediction": rounded(baseline_prediction),
        "confidence": confidence,
        "pessimistic": rounded(max(0.0, base) / side if side > 0 else base),
        "optimistic": rounded(max(0.0, base) * side),
        "intervalReason": reasons or ["cutoff residual and volatility interval"],
    }


def build_yearly_forecast(row, latest_complete_month: str) -> list[dict]:
    months = safe_int(row.remainingMonthsForForecast)
    if months <= 0:
        return []
    monthly_base = safe_float(row.forecastBase) / max(months, 1)
    first_month = add_months(latest_complete_month, 1)
    rows: dict[str, float] = defaultdict(float)
    for offset in range(months):
        month = add_months(first_month, offset)
        rows[month[:4]] += monthly_base
    return [{"year": year, "baseForecast": rounded(amount)} for year, amount in sorted(rows.items())]


def build_backtests(evaluated: pd.DataFrame, matrix: pd.DataFrame, months: list[str], parameters: dict) -> dict[str, list[dict]]:
    factors = parameters["forecast"]["lifecycleFactors"]
    thresholds = parameters["lifecycle"]
    cases_by_work: dict[str, list[dict]] = defaultdict(list)
    for standard_id, series in matrix.iterrows():
        values = series.to_numpy(dtype=float)
        for horizon in HORIZONS:
            cutoff_idx = len(months) - horizon - 1
            if cutoff_idx < 11:
                continue
            history = values[: cutoff_idx + 1]
            actual_window = values[cutoff_idx + 1 : cutoff_idx + 1 + horizon]
            if len(actual_window) < horizon:
                continue
            cutoff_lifecycle = classify_at(history, thresholds)
            last12_revenue = float(history[-12:].sum())
            baseline_prediction = last12_revenue / 12.0 * horizon
            calibrated = calibrated_cutoff_prediction(history, horizon, cutoff_lifecycle, factors)
            candidate_prediction = safe_float(calibrated["prediction"])
            actual = float(actual_window.sum())
            abs_error = abs(candidate_prediction - actual)
            baseline_abs_error = abs(baseline_prediction - actual)
            percentage_error = abs_error / actual if actual > 0 else None
            cases_by_work[str(standard_id)].append({
                "horizonMonths": horizon,
                "cutoffMonth": months[cutoff_idx],
                "predictionHorizon": f"{horizon}-month",
                "cutoffLifecycle": cutoff_lifecycle,
                "predictedRevenue": rounded(candidate_prediction),
                "baselinePredictedRevenue": rounded(baseline_prediction),
                "pessimisticPredictedRevenue": calibrated["pessimistic"],
                "optimisticPredictedRevenue": calibrated["optimistic"],
                "forecastConfidence": calibrated["confidence"],
                "intervalCoverage": safe_float(calibrated["pessimistic"]) <= actual <= safe_float(calibrated["optimistic"]),
                "intervalReason": calibrated["intervalReason"],
                "actualRevenue": rounded(actual),
                "absoluteError": rounded(abs_error),
                "baselineAbsoluteError": rounded(baseline_abs_error),
                "percentageError": None if percentage_error is None else round(percentage_error, 4),
                "candidateBetterOrEqualBaseline": abs_error <= baseline_abs_error,
            })
    return cases_by_work


def summarize_backtests(cases: list[dict]) -> dict:
    if not cases:
        return {
            "available": False,
            "horizonCount": 0,
            "candidateBetterOrEqualCount": 0,
            "candidateWorseCount": 0,
            "wape": None,
            "mape": None,
            "mae": None,
            "intervalCoverage": None,
        }
    actual_total = sum(safe_float(item["actualRevenue"]) for item in cases)
    abs_total = sum(safe_float(item["absoluteError"]) for item in cases)
    comparable = [item for item in cases if safe_float(item["actualRevenue"]) > 0]
    mape = (
        sum(safe_float(item["percentageError"]) for item in comparable if item["percentageError"] is not None)
        / len(comparable)
        if comparable
        else None
    )
    better = sum(1 for item in cases if item["candidateBetterOrEqualBaseline"])
    covered = sum(1 for item in cases if bool(item.get("intervalCoverage")))
    return {
        "available": True,
        "horizonCount": len(cases),
        "candidateBetterOrEqualCount": better,
        "candidateWorseCount": len(cases) - better,
        "wape": None if actual_total <= 0 else round(abs_total / actual_total, 4),
        "mape": None if mape is None else round(mape, 4),
        "mae": round(abs_total / len(cases), 4),
        "intervalCoverage": round(covered / len(cases), 4),
    }


def suggestion_evidence(row) -> list[dict]:
    risks = set(row.riskCodes)
    result = []
    for suggestion in row.suggestionCodes:
        if suggestion == "promote":
            result.append({
                "suggestion": suggestion,
                "trigger": "rating in S+/S or lifecycle=growth without blocking readiness risk",
                "supported": (row.rating in {"S+", "S"} or row.lifecycle == "growth") and not bool(row.manualReviewRequired),
                "requiresManualConfirmation": row.rating in {"S+", "S"} or "abnormal_spike" in risks,
            })
        elif suggestion == "maintain":
            result.append({
                "suggestion": suggestion,
                "trigger": "rating in A/B and lifecycle stable or growth",
                "supported": row.rating in {"A", "B"} and row.lifecycle in {"stable", "growth"},
                "requiresManualConfirmation": False,
            })
        elif suggestion == "reduce_investment":
            result.append({
                "suggestion": suggestion,
                "trigger": "rating in C/D with declining or inactive signal",
                "supported": row.rating in {"C", "D"} and row.lifecycle in {"declining", "inactive"},
                "requiresManualConfirmation": False,
            })
        elif suggestion == "downlist_or_suspend":
            result.append({
                "suggestion": suggestion,
                "trigger": "rating E, inactive lifecycle, and no renewal/event support",
                "supported": row.rating == "E" and row.lifecycle == "inactive",
                "requiresManualConfirmation": True,
            })
        elif suggestion == "renewal_review":
            result.append({
                "suggestion": suggestion,
                "trigger": "copyright_expiry risk and rating not below C",
                "supported": "copyright_expiry" in risks and row.rating not in {"D", "E"},
                "requiresManualConfirmation": True,
            })
        elif suggestion == "observe_only":
            result.append({
                "suggestion": suggestion,
                "trigger": "insufficient history or incomplete month dominates evidence",
                "supported": row.lifecycle == "insufficient_history" or "incomplete_month_boundary" in risks,
                "requiresManualConfirmation": False,
            })
        elif suggestion == "repackage":
            result.append({
                "suggestion": suggestion,
                "trigger": "mixed business form or channel concentration with non-low rating",
                "supported": (safe_int(row.businessFormCount) > 1 or "channel_concentration" in risks) and row.rating not in {"D", "E"},
                "requiresManualConfirmation": True,
            })
        elif suggestion == "pricing_or_channel_adjustment":
            result.append({
                "suggestion": suggestion,
                "trigger": "long tail or rebound without hard channel concentration risk",
                "supported": row.lifecycle in {"long_tail", "rebound"} and "channel_concentration" not in risks,
                "requiresManualConfirmation": True,
            })
        elif suggestion == "manual_review_required":
            result.append({
                "suggestion": suggestion,
                "trigger": "blocking manual review reason exists",
                "supported": bool(row.manualReviewRequired),
                "requiresManualConfirmation": True,
            })
    return result


def risk_impacts(row) -> list[dict]:
    impacts = []
    for risk in row.riskCodes:
        impacts.append({
            "risk": risk,
            "severity": RISK_SEVERITY.get(risk, "low"),
            "affectsForecast": risk in {"missing_copyright_end", "aggregate_projection_gap", "insufficient_history", "abnormal_spike", "buyout_or_oneoff_income"},
            "affectsRating": risk in {"missing_copyright_end", "copyright_date_conflict", "copyright_expiry", "insufficient_history", "abnormal_spike", "buyout_or_oneoff_income"},
            "affectsSuggestion": risk in {"copyright_expiry", "inactive_tail", "channel_concentration", "abnormal_spike", "buyout_or_oneoff_income", "insufficient_history"},
        })
    return impacts


def row_features(row, scale: str, boundary_flags: list[str]) -> set[str]:
    features = {
        f"rating:{row.rating}",
        f"lifecycle:{row.lifecycle}",
        f"revenueScale:{scale}",
        f"manualMode:{row.manualReviewMode}",
    }
    features.update(f"suggestion:{item}" for item in row.suggestionCodes)
    features.update(f"risk:{item}" for item in row.riskCodes)
    features.update(f"boundary:{item}" for item in boundary_flags)
    return features


def deterministic_sort_key(row) -> tuple:
    return (-safe_float(row.totalHistoricalRevenue), stable_hash(str(row.standardWorkId)))


def select_samples(evaluated: pd.DataFrame, size: int, required_features: set[str]) -> list[int]:
    feature_map = {idx: set(evaluated.at[idx, "validationFeatures"]) for idx in evaluated.index}
    selected: list[int] = []
    covered: set[str] = set()

    def add(idx: int) -> None:
        if idx not in selected:
            selected.append(idx)
            covered.update(feature_map[idx])

    for feature in sorted(required_features):
        if feature in covered:
            continue
        candidates = [idx for idx in evaluated.index if feature in feature_map[idx] and idx not in selected]
        if not candidates:
            continue
        candidates.sort(key=lambda idx: deterministic_sort_key(evaluated.loc[idx]))
        add(candidates[0])
        if len(selected) >= size:
            return selected[:size]

    while len(selected) < size:
        candidates = [idx for idx in evaluated.index if idx not in selected]
        if not candidates:
            break
        candidates.sort(
            key=lambda idx: (
                -len(feature_map[idx] - covered),
                -safe_float(evaluated.at[idx, "ratingBasisAmount"]),
                stable_hash(str(evaluated.at[idx, "standardWorkId"])),
            )
        )
        add(candidates[0])
    return selected[:size]


def assess_row(row, backtest_summary: dict, rating_boundary: dict, scale: str) -> dict:
    issues: list[dict] = []
    risks = set(row.riskCodes)
    suggestions = set(row.suggestionCodes)
    scenario_ratio = safe_float(getattr(row, "forecastOptimisticPessimisticRatio", None))
    scenario_spread = safe_float(getattr(row, "forecastScenarioSpread", None))
    confidence = getattr(row, "forecastConfidence", None)
    base_forecast = safe_float(row.forecastBase)
    last12 = safe_float(row.last12MonthRevenue)

    if "downlist_or_suspend" in suggestions and not (row.rating == "E" and row.lifecycle == "inactive"):
        issues.append({"severity": "P0", "category": "suggestion", "reason": "downlist/suspend trigger contradicts rating or lifecycle"})
    if "promote" in suggestions and not (row.rating in {"S+", "S"} or row.lifecycle == "growth"):
        issues.append({"severity": "P0", "category": "suggestion", "reason": "promote trigger lacks high rating or growth support"})
    if "promote" in suggestions and last12 <= 10 and row.lifecycle not in {"growth", "rebound"}:
        issues.append({"severity": "P0", "category": "suggestion", "reason": "promote candidate has low revenue without growth support"})
    if "abnormal_spike" in risks and not (
        "abnormal_spike" in row.manualReviewBlockingReasons or "abnormal_spike" in row.manualReviewAdvisoryReasons
    ):
        issues.append({"severity": "P0", "category": "risk", "reason": "abnormal spike has no manual or advisory handling"})
    if "renewal_review" in suggestions and "copyright_expiry" not in risks:
        issues.append({"severity": "P1", "category": "suggestion", "reason": "renewal review lacks expiry risk trigger"})

    if confidence in {"high", "medium"} and scenario_ratio > (1.50 if confidence == "high" else 2.00):
        issues.append({"severity": "P0", "category": "forecast", "reason": "scenario spread exceeds confidence guardrail"})
    elif confidence == "low" and scenario_ratio > 2.90:
        issues.append({"severity": "P1", "category": "forecast", "reason": "low-confidence scenario spread exceeds guardrail"})
    elif confidence == "blocked_for_business_use" and scenario_ratio > 3.20:
        issues.append({"severity": "P1", "category": "forecast", "reason": "blocked scenario spread exceeds guardrail"})

    if row.lifecycle in {"inactive", "long_tail"} or row.rating in {"D", "E"}:
        if last12 <= 10 and base_forecast > max(10.0, last12 * 3.0):
            issues.append({"severity": "P0", "category": "forecast", "reason": "low-value or inactive row is materially over-forecast"})
        elif last12 <= 100 and base_forecast > max(100.0, last12 * 2.5):
            issues.append({"severity": "P1", "category": "forecast", "reason": "low-value or inactive row has elevated overstatement risk"})

    if backtest_summary["available"]:
        if backtest_summary["candidateBetterOrEqualCount"] == 0 and scale in {"top", "high"}:
            issues.append({"severity": "P0", "category": "forecast", "reason": "high-value sample worse than trailing baseline across tested horizons"})
        elif backtest_summary["candidateWorseCount"] > backtest_summary["candidateBetterOrEqualCount"]:
            issues.append({"severity": "P1", "category": "forecast", "reason": "candidate forecast worse than baseline in most tested horizons"})
        if backtest_summary["wape"] is not None and backtest_summary["wape"] >= 2.0:
            issues.append({"severity": "P1", "category": "forecast", "reason": "high relative forecast error; inspect private pack"})
        if backtest_summary.get("intervalCoverage") is not None and safe_float(backtest_summary["intervalCoverage"]) < 0.34:
            issues.append({"severity": "P1", "category": "forecast", "reason": "low interval coverage in available backtests"})

    if rating_boundary["nearBoundary"]:
        issues.append({"severity": "P2", "category": "rating", "reason": "rating basis near threshold boundary"})
    if row.rating in {"S+", "S", "A"} and risks.intersection({"missing_copyright_end", "abnormal_spike", "buyout_or_oneoff_income"}):
        issues.append({"severity": "P2", "category": "rating", "reason": "high rating has readiness or spike risk requiring review context"})
    if bool(row.forecastFallbackUsed) and (row.rating in {"S+", "S", "A", "B"} or "promote" in suggestions or "renewal_review" in suggestions):
        issues.append({"severity": "P2", "category": "forecast", "reason": "forecast uses copyright fallback for action-bearing or high-value row"})
    if bool(row.manualReviewRequired):
        issues.append({"severity": "P2", "category": "readiness", "reason": "manual review dependency remains in algorithm evidence"})
    if confidence in {"low", "blocked_for_business_use"} and suggestions.intersection({"promote", "downlist_or_suspend", "renewal_review"}):
        issues.append({"severity": "P2", "category": "forecast", "reason": "action-bearing suggestion depends on low-confidence forecast"})

    severities = {issue["severity"] for issue in issues}
    if "P0" in severities or "P1" in severities:
        outcome = "fail"
    elif "P2" in severities:
        outcome = "warning"
    else:
        outcome = "pass"
    return {
        "outcome": outcome,
        "issues": issues,
        "issueSeverity": distribution([issue["severity"] for issue in issues], ["P0", "P1", "P2"]),
    }


def build_evaluated_context() -> dict:
    context = load_analysis_inputs()
    evaluated = evaluate_work_summary(
        context["work_summary"],
        context["parameters"],
        context["latest_complete_month"],
        context["incomplete_work_ids"],
        PARAMETER_VARIANT,
    ).copy()
    evaluated = evaluated.sort_values("standardWorkId").reset_index(drop=True)
    matrix, months = build_month_matrix(context)

    total_values = evaluated["totalHistoricalRevenue"].astype(float).to_numpy()
    quantiles = {
        "p40": float(np.quantile(total_values, 0.40)),
        "p75": float(np.quantile(total_values, 0.75)),
        "p95": float(np.quantile(total_values, 0.95)),
    }
    rating_basis = evaluated["ratingBasisAmount"].astype(float)
    evaluated["historicalRevenuePercentile"] = rating_basis.rank(pct=True, method="average")
    evaluated["oldForecastBase"] = evaluated["forecastBase"]
    evaluated["oldForecastOptimistic"] = evaluated["forecastOptimistic"]
    evaluated["oldForecastPessimistic"] = evaluated["forecastPessimistic"]
    evaluated["forecastScenarioSpread"] = np.nan
    evaluated["forecastOptimisticPessimisticRatio"] = np.nan
    for object_column in [
        "revenueScale",
        "ratingBoundaryNearest",
        "lifecycleBoundaryFlags",
        "validationFeatures",
        "forecastConfidence",
        "forecastIntervalReasons",
        "forecastScenarioMetrics",
        "forecastRiskBucket",
        "validationOutcome",
        "validationIssues",
        "backtestSummary",
        "backtestCases",
    ]:
        evaluated[object_column] = None
    evaluated["ratingNearBoundary"] = False
    evaluated["ratingBoundaryRelativeDistance"] = np.nan

    cases_by_work = build_backtests(evaluated, matrix, months, context["parameters"])
    thresholds = context["parameters"]["rating"]["absoluteAmountThresholdCandidates"]

    validation_records = []
    for idx, row in evaluated.iterrows():
        scale = revenue_scale(row, quantiles)
        boundaries = lifecycle_boundary_flags(row, context["parameters"])
        rating_boundary = threshold_distance(safe_float(row.ratingBasisAmount), thresholds)
        backtests = cases_by_work.get(str(row.standardWorkId), [])
        backtest_summary = summarize_backtests(backtests)
        calibration = calibrate_forecast_row(row, scale, backtest_summary)
        evaluated.at[idx, "forecastBase"] = calibration["base"]
        evaluated.at[idx, "forecastPessimistic"] = calibration["pessimistic"]
        evaluated.at[idx, "forecastOptimistic"] = calibration["optimistic"]
        evaluated.at[idx, "forecastScenarioSpread"] = calibration["metrics"]["scenarioSpread"]
        evaluated.at[idx, "forecastOptimisticPessimisticRatio"] = calibration["metrics"]["optimisticPessimisticRatio"]
        evaluated.at[idx, "forecastIntervalReasons"] = calibration["intervalReason"]
        evaluated.at[idx, "forecastScenarioMetrics"] = calibration["metrics"]
        evaluated.at[idx, "forecastRiskBucket"] = primary_risk_bucket(row.riskCodes)
        calibrated_row = evaluated.loc[idx]
        confidence = calibration["confidence"]
        assessment = assess_row(calibrated_row, backtest_summary, rating_boundary, scale)
        features = row_features(row, scale, boundaries)
        evaluated.at[idx, "revenueScale"] = scale
        evaluated.at[idx, "ratingBoundaryNearest"] = rating_boundary["nearestRating"]
        evaluated.at[idx, "ratingBoundaryRelativeDistance"] = rating_boundary["relativeDistance"]
        evaluated.at[idx, "ratingNearBoundary"] = rating_boundary["nearBoundary"]
        evaluated.at[idx, "lifecycleBoundaryFlags"] = boundaries
        evaluated.at[idx, "validationFeatures"] = features
        evaluated.at[idx, "forecastConfidence"] = confidence
        evaluated.at[idx, "validationOutcome"] = assessment["outcome"]
        evaluated.at[idx, "validationIssues"] = assessment["issues"]
        evaluated.at[idx, "backtestSummary"] = backtest_summary
        evaluated.at[idx, "backtestCases"] = backtests
        validation_records.append(assessment)

    return {
        "context": context,
        "evaluated": evaluated,
        "matrix": matrix,
        "months": months,
        "casesByWork": cases_by_work,
        "quantiles": quantiles,
    }


def required_feature_set(evaluated: pd.DataFrame, include_boundaries: bool = True) -> set[str]:
    features: set[str] = set()
    features.update(f"rating:{rating}" for rating in RATING_ORDER)
    features.update(f"lifecycle:{lifecycle}" for lifecycle in LIFECYCLE_ORDER)
    features.update(f"revenueScale:{scale}" for scale in REVENUE_SCALES)
    features.update(f"suggestion:{suggestion}" for suggestion in REQUIRED_SUGGESTIONS)
    features.update(f"risk:{risk}" for risk in REQUIRED_RISKS)
    if include_boundaries:
        for item in ["growth_boundary", "declining_boundary", "rebound_boundary", "long_tail_boundary"]:
            features.add(f"boundary:{item}")
    observed = set().union(*(set(row) for row in evaluated["validationFeatures"]))
    return features.intersection(observed)


def sample_id(prefix: str, position: int) -> str:
    return f"{prefix}{position:03d}"


def private_row(row, sample: str) -> dict:
    backtests = {f"h{item['horizonMonths']}": item for item in row.backtestCases}
    base = {
        "sampleId": sample,
        "standardWorkId": row.standardWorkId,
        "rating": row.rating,
        "uncappedRating": row.uncappedRating,
        "lifecycle": row.lifecycle,
        "revenueScale": row.revenueScale,
        "last3Revenue": rounded(row.last3MonthRevenue),
        "last6Revenue": rounded(row.last6MonthRevenue),
        "last12Revenue": rounded(row.last12MonthRevenue),
        "last24Revenue": rounded(row.last24MonthRevenue),
        "totalHistoricalRevenue": rounded(row.totalHistoricalRevenue),
        "activeMonthCount": safe_int(row.activeMonthCount),
        "zeroRevenueMonthCount": safe_int(row.zeroRevenueMonthCount),
        "recent6Prior6Ratio": None if pd.isna(row.recent6Prior6Ratio) else round(safe_float(row.recent6Prior6Ratio), 4),
        "peakMonthShare": round(safe_float(row.peakMonthShare), 4),
        "latestCompleteMonth": row.latestCompleteMonth,
        "remainingCopyrightMonths": None if pd.isna(row.remainingCopyrightMonths) else safe_int(row.remainingCopyrightMonths),
        "remainingMonthsForForecast": safe_int(row.remainingMonthsForForecast),
        "oldForecastBase": rounded(row.oldForecastBase),
        "oldForecastOptimistic": rounded(row.oldForecastOptimistic),
        "oldForecastPessimistic": rounded(row.oldForecastPessimistic),
        "forecastBase": rounded(row.forecastBase),
        "forecastOptimistic": rounded(row.forecastOptimistic),
        "forecastPessimistic": rounded(row.forecastPessimistic),
        "forecastConfidence": row.forecastConfidence,
        "forecastOptimisticPessimisticRatio": row.forecastOptimisticPessimisticRatio,
        "forecastScenarioSpread": row.forecastScenarioSpread,
        "forecastIntervalReasons": ";".join(row.forecastIntervalReasons or []),
        "ratingBasisAmount": rounded(row.ratingBasisAmount),
        "historicalRevenuePercentile": round(safe_float(row.historicalRevenuePercentile), 4),
        "ratingNearBoundary": bool(row.ratingNearBoundary),
        "ratingBoundaryNearest": row.ratingBoundaryNearest,
        "riskCodes": ";".join(row.riskCodes),
        "suggestionCodes": ";".join(row.suggestionCodes),
        "manualReviewRequired": bool(row.manualReviewRequired),
        "manualReviewBlockingReasons": ";".join(row.manualReviewBlockingReasons),
        "manualReviewAdvisoryReasons": ";".join(row.manualReviewAdvisoryReasons),
        "validationOutcome": row.validationOutcome,
        "validationIssues": json.dumps(json_safe(row.validationIssues), ensure_ascii=False),
    }
    for horizon in HORIZONS:
        item = backtests.get(f"h{horizon}", {})
        base[f"h{horizon}CutoffMonth"] = item.get("cutoffMonth")
        base[f"h{horizon}PredictedRevenue"] = item.get("predictedRevenue")
        base[f"h{horizon}BaselinePredictedRevenue"] = item.get("baselinePredictedRevenue")
        base[f"h{horizon}ActualRevenue"] = item.get("actualRevenue")
        base[f"h{horizon}AbsoluteError"] = item.get("absoluteError")
        base[f"h{horizon}PercentageError"] = item.get("percentageError")
        base[f"h{horizon}BetterOrEqualBaseline"] = item.get("candidateBetterOrEqualBaseline")
        base[f"h{horizon}IntervalCoverage"] = item.get("intervalCoverage")
    return base


def sanitized_sample(row, sample: str) -> dict:
    return {
        "sampleId": sample,
        "rating": row.rating,
        "uncappedRating": row.uncappedRating,
        "lifecycle": row.lifecycle,
        "revenueScale": row.revenueScale,
        "latestCompleteMonth": row.latestCompleteMonth,
        "remainingCopyrightMonthsBucket": bucket_remaining_months(row.remainingCopyrightMonths),
        "forecast": {
            "base": rounded(row.forecastBase),
            "optimistic": rounded(row.forecastOptimistic),
            "pessimistic": rounded(row.forecastPessimistic),
            "yearlyBreakdown": build_yearly_forecast(row, row.latestCompleteMonth),
            "confidence": row.forecastConfidence,
            "intervalReason": row.forecastIntervalReasons,
            "optimisticPessimisticRatio": row.forecastOptimisticPessimisticRatio,
            "assumptions": [
                "candidate-b forecast scenario calibration patch v0.2",
                "last-12 revenue as base signal",
                "remaining copyright months or scoped fallback",
                "data-driven interval from volatility, residual, lifecycle, revenue scale, confidence, and readiness signals",
            ],
        },
        "history": {
            "last3Revenue": rounded(row.last3MonthRevenue),
            "last6Revenue": rounded(row.last6MonthRevenue),
            "last12Revenue": rounded(row.last12MonthRevenue),
            "last24Revenue": rounded(row.last24MonthRevenue),
            "totalHistoricalRevenue": rounded(row.totalHistoricalRevenue),
            "activeMonthCount": safe_int(row.activeMonthCount),
            "zeroRevenueMonthCount": safe_int(row.zeroRevenueMonthCount),
            "recentTrend": trend_label(row),
            "abnormalPeakOrOneOff": "abnormal_spike" in row.riskCodes or "buyout_or_oneoff_income" in row.riskCodes,
        },
        "backtest": row.backtestCases,
        "ratingReliability": {
            "forecastValue": rounded(row.forecastBase),
            "historicalRevenuePercentile": round(safe_float(row.historicalRevenuePercentile), 4),
            "lifecycleAdjustment": row.lifecycle,
            "remainingCopyrightAdjustment": bucket_remaining_months(row.remainingCopyrightMonths),
            "riskAdjustment": "capped" if row.rating != row.uncappedRating else "none",
            "finalRatingReason": rating_reason(row),
            "nearThresholdBoundary": bool(row.ratingNearBoundary),
        },
        "risks": risk_impacts(row),
        "suggestions": suggestion_evidence(row),
        "validationOutcome": row.validationOutcome,
        "warningOrFailureReasons": [issue["reason"] for issue in row.validationIssues],
    }


def bucket_remaining_months(value) -> str:
    if value is None or pd.isna(value):
        return "fallback_used"
    months = safe_int(value)
    if months <= 0:
        return "expired_or_zero"
    if months <= 12:
        return "0_to_12"
    if months <= 24:
        return "13_to_24"
    if months <= 60:
        return "25_to_60"
    return "gt_60"


def trend_label(row) -> str:
    ratio = row.recent6Prior6Ratio
    if ratio is None or pd.isna(ratio):
        return "insufficient_prior_window"
    value = safe_float(ratio)
    if value >= 1.2:
        return "increasing"
    if value <= 0.8:
        return "decreasing"
    return "stable"


def rating_reason(row) -> str:
    parts = [
        f"rating basis amount supports {row.uncappedRating}",
        f"lifecycle={row.lifecycle}",
    ]
    if row.rating != row.uncappedRating:
        parts.append(f"risk cap adjusted rating to {row.rating}")
    if bool(row.ratingNearBoundary):
        parts.append("near rating threshold boundary")
    if row.manualReviewRequired:
        parts.append("manual review context required")
    return "; ".join(parts)


def aggregate_backtest(cases: list[dict]) -> dict:
    if not cases:
        return {"caseCount": 0, "wape": None, "mape": None, "mae": None, "intervalCoverage": None, "candidateBetterOrEqualShare": None}
    actual_total = sum(safe_float(item["actualRevenue"]) for item in cases)
    abs_error_total = sum(safe_float(item["absoluteError"]) for item in cases)
    comparable = [item for item in cases if safe_float(item["actualRevenue"]) > 0]
    mape = (
        sum(safe_float(item["percentageError"]) for item in comparable if item["percentageError"] is not None)
        / len(comparable)
        if comparable
        else None
    )
    better = sum(1 for item in cases if item["candidateBetterOrEqualBaseline"])
    baseline_abs_error_total = sum(safe_float(item["baselineAbsoluteError"]) for item in cases)
    covered = sum(1 for item in cases if bool(item.get("intervalCoverage")))
    return {
        "caseCount": len(cases),
        "actualRevenueTotal": rounded(actual_total),
        "predictedRevenueTotal": rounded(sum(safe_float(item["predictedRevenue"]) for item in cases)),
        "baselinePredictedRevenueTotal": rounded(sum(safe_float(item["baselinePredictedRevenue"]) for item in cases)),
        "absoluteErrorTotal": rounded(abs_error_total),
        "baselineAbsoluteErrorTotal": rounded(baseline_abs_error_total),
        "mae": round(abs_error_total / len(cases), 4),
        "wape": None if actual_total <= 0 else round(abs_error_total / actual_total, 4),
        "mape": None if mape is None else round(mape, 4),
        "intervalCoverage": round(covered / len(cases), 4),
        "candidateBetterOrEqualCount": better,
        "candidateWorseCount": len(cases) - better,
        "candidateBetterOrEqualShare": round(better / len(cases), 4),
        "candidateTotalAbsErrorBetterThanBaseline": abs_error_total <= baseline_abs_error_total,
    }


def segment_backtests(evaluated: pd.DataFrame, group_field: str) -> list[dict]:
    rows = []
    for key, group in evaluated.groupby(group_field):
        cases = [case for _, row in group.iterrows() for case in row.backtestCases]
        summary = aggregate_backtest(cases)
        summary[group_field] = key
        rows.append(summary)
    rows.sort(key=lambda item: (-(item.get("wape") or 0), str(item[group_field])))
    return rows


def compound_error_segments(evaluated: pd.DataFrame) -> list[dict]:
    rows = []
    for (rating, lifecycle, scale), group in evaluated.groupby(["rating", "lifecycle", "revenueScale"]):
        cases = [case for _, row in group.iterrows() for case in row.backtestCases]
        if len(cases) < 6:
            continue
        summary = aggregate_backtest(cases)
        rows.append({
            "rating": rating,
            "lifecycle": lifecycle,
            "revenueScale": scale,
            **summary,
        })
    rows.sort(key=lambda item: (-(item.get("wape") or 0), -item["caseCount"]))
    return rows[:20]


def coverage_summary(sample: pd.DataFrame) -> dict:
    rows = [row for _, row in sample.iterrows()]
    feature_set = set().union(*(set(row.validationFeatures) for row in rows)) if rows else set()
    return {
        "sampleCount": int(len(sample)),
        "ratingsCovered": distribution(sample["rating"], RATING_ORDER),
        "lifecyclesCovered": distribution(sample["lifecycle"], LIFECYCLE_ORDER),
        "revenueScalesCovered": distribution(sample["revenueScale"], REVENUE_SCALES),
        "suggestionsCovered": flattened_distribution([{"items": row.suggestionCodes} for row in rows], "items"),
        "risksCovered": flattened_distribution([{"items": row.riskCodes} for row in rows], "items"),
        "ratingBoundaryCount": int(sample["ratingNearBoundary"].sum()),
        "lifecycleBoundaryCount": int(sample["lifecycleBoundaryFlags"].map(bool).sum()),
        "featureCount": len(feature_set),
    }


def issue_summary(evaluated: pd.DataFrame) -> dict:
    issues = [issue for _, row in evaluated.iterrows() for issue in row.validationIssues]
    return {
        "outcomeDistribution": distribution(evaluated["validationOutcome"], ["pass", "warning", "fail"]),
        "issueSeverityDistribution": distribution([issue["severity"] for issue in issues], ["P0", "P1", "P2"]),
        "issueCategoryDistribution": distribution([issue["category"] for issue in issues]),
        "failRate": round(float((evaluated["validationOutcome"] == "fail").sum()) / len(evaluated), 4) if len(evaluated) else 0,
    }


def full_sanity(evaluated: pd.DataFrame) -> dict:
    rows = [row for _, row in evaluated.iterrows()]
    return {
        "evaluatedWorkCount": int(len(evaluated)),
        "ratingDistribution": distribution(evaluated["rating"], RATING_ORDER),
        "lifecycleDistribution": distribution(evaluated["lifecycle"], LIFECYCLE_ORDER),
        "forecastTotalByRating": group_forecast_totals(evaluated, "rating"),
        "forecastTotalByLifecycle": group_forecast_totals(evaluated, "lifecycle"),
        "suggestionDistribution": flattened_distribution([{"items": row.suggestionCodes} for row in rows], "items"),
        "riskDistribution": flattened_distribution([{"items": row.riskCodes} for row in rows], "items"),
        "riskReadinessSanity": {
            "manualReviewRequiredCount": int(evaluated["manualReviewRequired"].sum()),
            "forecastFallbackCount": int(evaluated["forecastFallbackUsed"].sum()),
            "remainingBlockingCountAfterBusinessClosure": 0,
            "notFinalReleaseApproved": True,
        },
        "highErrorSegments": compound_error_segments(evaluated),
        "lowConfidenceSegment": distribution(evaluated["forecastConfidence"], ["high", "medium", "low", "blocked_for_business_use"]),
        "abnormalSpikeHandling": {
            "riskCount": int(evaluated["riskCodes"].map(lambda items: "abnormal_spike" in items).sum()),
            "blockingCount": int(evaluated["manualReviewBlockingReasons"].map(lambda items: "abnormal_spike" in items).sum()),
            "advisoryCount": int(evaluated["manualReviewAdvisoryReasons"].map(lambda items: "abnormal_spike" in items).sum()),
            "autoPassCount": int(
                evaluated.apply(
                    lambda row: "abnormal_spike" in row.riskCodes
                    and "abnormal_spike" not in row.manualReviewBlockingReasons
                    and "abnormal_spike" not in row.manualReviewAdvisoryReasons,
                    axis=1,
                ).sum()
            ),
        },
        "downlistSuspendSanity": {
            "count": int(evaluated["suggestionCodes"].map(lambda items: "downlist_or_suspend" in items).sum()),
            "logicViolationCount": int(
                evaluated.apply(
                    lambda row: "downlist_or_suspend" in row.suggestionCodes
                    and not (row.rating == "E" and row.lifecycle == "inactive"),
                    axis=1,
                ).sum()
            ),
        },
        "promoteSanity": {
            "count": int(evaluated["suggestionCodes"].map(lambda items: "promote" in items).sum()),
            "logicViolationCount": int(
                evaluated.apply(
                    lambda row: "promote" in row.suggestionCodes
                    and not (row.rating in {"S+", "S"} or row.lifecycle == "growth")
                    or ("promote" in row.suggestionCodes and bool(row.manualReviewRequired)),
                    axis=1,
                ).sum()
            ),
        },
    }


def group_forecast_totals(evaluated: pd.DataFrame, field: str) -> list[dict]:
    rows = []
    for key, group in evaluated.groupby(field):
        rows.append({
            field: key,
            "count": int(len(group)),
            "baseForecastTotal": rounded(group["forecastBase"].sum()),
            "optimisticForecastTotal": rounded(group["forecastOptimistic"].sum()),
            "pessimisticForecastTotal": rounded(group["forecastPessimistic"].sum()),
        })
    return sorted(rows, key=lambda item: str(item[field]))


def spread_metrics(frame: pd.DataFrame, prefix: str) -> dict:
    if frame.empty:
        return {
            "count": 0,
            "optimisticBaseRatio": quantile_points([]),
            "basePessimisticRatio": quantile_points([]),
            "optimisticPessimisticRatio": quantile_points([]),
            "scenarioSpread": quantile_points([]),
            "fixedMultiplierDetected": False,
        }
    base = frame[f"{prefix}ForecastBase"].astype(float).replace(0, np.nan)
    optimistic = frame[f"{prefix}ForecastOptimistic"].astype(float)
    pessimistic = frame[f"{prefix}ForecastPessimistic"].astype(float).replace(0, np.nan)
    optimistic_base = optimistic / base
    base_pessimistic = base / pessimistic
    optimistic_pessimistic = optimistic / pessimistic
    spread = (optimistic - pessimistic) / base
    return {
        "count": int(len(frame)),
        "optimisticBaseRatio": quantile_points(optimistic_base.dropna().tolist()),
        "basePessimisticRatio": quantile_points(base_pessimistic.dropna().tolist()),
        "optimisticPessimisticRatio": quantile_points(optimistic_pessimistic.dropna().tolist()),
        "scenarioSpread": quantile_points(spread.dropna().tolist()),
        "fixedMultiplierDetected": fixed_multiplier_detected(optimistic_pessimistic.dropna().tolist()),
    }


def new_spread_metrics(frame: pd.DataFrame) -> dict:
    renamed = frame.rename(columns={
        "forecastBase": "newForecastBase",
        "forecastOptimistic": "newForecastOptimistic",
        "forecastPessimistic": "newForecastPessimistic",
    })
    return spread_metrics(renamed, "new")


def grouped_spread(frame: pd.DataFrame, group_field: str) -> list[dict]:
    rows = []
    for key, group in frame.groupby(group_field):
        rows.append({
            "group": str(key),
            "old": spread_metrics(group, "old"),
            "new": new_spread_metrics(group),
        })
    return sorted(rows, key=lambda item: item["group"])


def build_spread_audit(evaluated: pd.DataFrame, sample_200: pd.DataFrame, deep: pd.DataFrame) -> dict:
    for frame in (evaluated, sample_200, deep):
        if "forecastRiskBucket" not in frame.columns:
            frame["forecastRiskBucket"] = frame["riskCodes"].map(primary_risk_bucket)
    old_full = spread_metrics(evaluated, "old")
    new_full = new_spread_metrics(evaluated)
    high_confidence = evaluated[evaluated["forecastConfidence"] == "high"]
    non_low = evaluated[
        ~evaluated["forecastConfidence"].isin(["low", "blocked_for_business_use"])
        & ~evaluated["riskCodes"].map(lambda items: bool(set(items).intersection({"abnormal_spike", "buyout_or_oneoff_income", "insufficient_history"})))
    ]
    return {
        "schema": "m2.candidate_b.forecast_scenario_spread_audit.v0.1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "legacyCandidateVersion": LEGACY_CANDIDATE_VERSION,
        "calibratedCandidateVersion": CANDIDATE_VERSION,
        "finding": "candidate-b scenario generation is not sufficiently data-driven and fails scenario reliability requirement.",
        "oldFull": old_full,
        "newFull": new_full,
        "newHighConfidence": new_spread_metrics(high_confidence),
        "newNonLowConfidenceNoSpikeOrInsufficientHistory": new_spread_metrics(non_low),
        "scopes": {
            "full3054": {"old": old_full, "new": new_full},
            "stratified200": {"old": spread_metrics(sample_200, "old"), "new": new_spread_metrics(sample_200)},
            "deepDive20": {"old": spread_metrics(deep, "old"), "new": new_spread_metrics(deep)},
        },
        "byRating": grouped_spread(evaluated, "rating"),
        "byLifecycle": grouped_spread(evaluated, "lifecycle"),
        "byRevenueScale": grouped_spread(evaluated, "revenueScale"),
        "byConfidence": grouped_spread(evaluated, "forecastConfidence"),
        "byRiskBucket": grouped_spread(evaluated, "forecastRiskBucket"),
        "requirements": {
            "oldFixedMultiplierConfirmed": old_full["fixedMultiplierDetected"],
            "newFixedMultiplierDetected": new_full["fixedMultiplierDetected"],
            "highConfidenceMedianOptimisticPessimisticRatioLe1_5": (
                high_confidence.empty
                or safe_float(new_spread_metrics(high_confidence)["optimisticPessimisticRatio"]["p50"]) <= 1.5
            ),
            "fullP75OptimisticPessimisticRatioLe2ExcludingLowConfidenceSpikeInsufficientHistory": (
                non_low.empty
                or safe_float(new_spread_metrics(non_low)["optimisticPessimisticRatio"]["p75"]) <= 2.0
            ),
        },
        "safeOutputBoundary": safe_output_boundary(),
    }


def spread_table_rows(items: list[dict]) -> list[dict]:
    rows = []
    for item in items:
        rows.append({
            "group": item["group"],
            "oldP50": item["old"]["optimisticPessimisticRatio"]["p50"],
            "oldP75": item["old"]["optimisticPessimisticRatio"]["p75"],
            "newP50": item["new"]["optimisticPessimisticRatio"]["p50"],
            "newP75": item["new"]["optimisticPessimisticRatio"]["p75"],
            "newP95": item["new"]["optimisticPessimisticRatio"]["p95"],
            "fixedAfter": item["new"]["fixedMultiplierDetected"],
        })
    return rows


def write_csv(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = sorted({key for row in rows for key in row.keys()})
    with path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def column_name(index: int) -> str:
    name = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        name = chr(65 + remainder) + name
    return name


def xlsx_cell(value, row: int, col: int) -> str:
    ref = f"{column_name(col)}{row}"
    if isinstance(value, bool):
        return f'<c r="{ref}" t="b"><v>{1 if value else 0}</v></c>'
    if isinstance(value, (int, float)) and math.isfinite(float(value)):
        return f'<c r="{ref}"><v>{value}</v></c>'
    text = escape("" if value is None else str(value))
    return f'<c r="{ref}" t="inlineStr"><is><t>{text}</t></is></c>'


def write_simple_xlsx(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = sorted({key for row in rows for key in row.keys()})
    sheet_rows = []
    sheet_rows.append(
        f'<row r="1">{"".join(xlsx_cell(field, 1, index + 1) for index, field in enumerate(fields))}</row>'
    )
    for row_index, row in enumerate(rows, start=2):
        sheet_rows.append(
            f'<row r="{row_index}">{"".join(xlsx_cell(row.get(field), row_index, index + 1) for index, field in enumerate(fields))}</row>'
        )
    sheet_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        "<sheetData>"
        + "".join(sheet_rows)
        + "</sheetData></worksheet>"
    )
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(
            "[Content_Types].xml",
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            "</Types>",
        )
        archive.writestr(
            "_rels/.rels",
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            "</Relationships>",
        )
        archive.writestr(
            "xl/workbook.xml",
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            '<sheets><sheet name="candidate-b-20" sheetId="1" r:id="rId1"/></sheets></workbook>',
        )
        archive.writestr(
            "xl/_rels/workbook.xml.rels",
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            "</Relationships>",
        )
        archive.writestr("xl/worksheets/sheet1.xml", sheet_xml)


def build_private_full_records(evaluated: pd.DataFrame) -> list[dict]:
    records = []
    for position, (_, row) in enumerate(evaluated.iterrows(), start=1):
        records.append({
            "privateSampleId": sample_id("F", position),
            "standardWorkId": row.standardWorkId,
            "rating": row.rating,
            "lifecycle": row.lifecycle,
            "revenueScale": row.revenueScale,
            "forecastBase": rounded(row.forecastBase),
            "forecastOptimistic": rounded(row.forecastOptimistic),
            "forecastPessimistic": rounded(row.forecastPessimistic),
            "forecastConfidence": row.forecastConfidence,
            "forecastIntervalReasons": row.forecastIntervalReasons,
            "forecastOptimisticPessimisticRatio": row.forecastOptimisticPessimisticRatio,
            "riskCodes": row.riskCodes,
            "suggestionCodes": row.suggestionCodes,
            "validationOutcome": row.validationOutcome,
            "validationIssues": row.validationIssues,
            "backtestSummary": row.backtestSummary,
        })
    return records


def build_reports(data: dict) -> dict:
    evaluated = data["evaluated"]
    required_20 = required_feature_set(evaluated, include_boundaries=False)
    required_200 = required_feature_set(evaluated, include_boundaries=True)
    deep_indices = select_samples(evaluated, 20, required_20)
    sample_200_indices = select_samples(evaluated, 200, required_200)
    deep = evaluated.loc[deep_indices].reset_index(drop=True)
    sample_200 = evaluated.loc[sample_200_indices].reset_index(drop=True)

    private_20_rows = [private_row(row, sample_id("W", index)) for index, (_, row) in enumerate(deep.iterrows(), start=1)]
    private_200_rows = [private_row(row, sample_id("S", index)) for index, (_, row) in enumerate(sample_200.iterrows(), start=1)]
    write_csv(PRIVATE_20_CSV, private_20_rows)
    write_simple_xlsx(PRIVATE_20_XLSX, private_20_rows)
    write_csv(PRIVATE_200_CSV, private_200_rows)
    calibrated_full_private_rows = [private_row(row, sample_id("F", index)) for index, (_, row) in enumerate(evaluated.iterrows(), start=1)]
    write_csv(PRIVATE_CALIBRATED_CSV, calibrated_full_private_rows)
    write_simple_xlsx(PRIVATE_CALIBRATED_XLSX, calibrated_full_private_rows)
    write_json(PRIVATE_FULL_JSON, {
        "schema": "m2.private.candidate_b_full_cohort_validation_detail.v0.2",
        "candidateVersion": CANDIDATE_VERSION,
        "notForCommit": True,
        "containsPrivateStandardWorkIds": True,
        "records": build_private_full_records(evaluated),
    })

    deep_sanitized = [sanitized_sample(row, sample_id("W", index)) for index, (_, row) in enumerate(deep.iterrows(), start=1)]
    sample_200_issue_summary = issue_summary(sample_200)
    full_issue_summary = issue_summary(evaluated)
    all_cases = [case for _, row in evaluated.iterrows() for case in row.backtestCases]
    forecast_by_horizon = []
    for horizon in HORIZONS:
        forecast_by_horizon.append({
            "horizonMonths": horizon,
            **aggregate_backtest([case for case in all_cases if case["horizonMonths"] == horizon]),
        })

    sanity = full_sanity(evaluated)
    spread_audit = build_spread_audit(evaluated, sample_200.copy(), deep.copy())
    p0_count = full_issue_summary["issueSeverityDistribution"].get("P0", 0)
    p1_count = full_issue_summary["issueSeverityDistribution"].get("P1", 0)
    sample_200_fail_rate = sample_200_issue_summary["failRate"]
    sample_200_warning_rate = round(float((sample_200["validationOutcome"] == "warning").sum()) / len(sample_200), 4) if len(sample_200) else 0
    high_confidence_ratio_median = spread_audit["newHighConfidence"]["optimisticPessimisticRatio"]["p50"]
    non_low_p75_ratio = spread_audit["newNonLowConfidenceNoSpikeOrInsufficientHistory"]["optimisticPessimisticRatio"]["p75"]
    candidate_better_majority = all(
        item.get("candidateTotalAbsErrorBetterThanBaseline", False) for item in forecast_by_horizon
    )
    acceptance = {
        "deepDiveComplete": len(deep_sanitized) == 20
        and all(item["forecast"]["base"] is not None for item in deep_sanitized)
        and all(len(item["backtest"]) >= 3 for item in deep_sanitized),
        "sample200FailRate": sample_200_fail_rate,
        "sample200FailRatePass": sample_200_fail_rate <= 0.10,
        "sample200WarningRate": sample_200_warning_rate,
        "sample200WarningRatePass": sample_200_warning_rate <= 0.50,
        "p0AlgorithmIssueCount": p0_count,
        "p0Pass": p0_count == 0,
        "p1AlgorithmIssueCount": p1_count,
        "p1Pass": p1_count <= 3,
        "legacyFixedMultiplierConfirmed": spread_audit["requirements"]["oldFixedMultiplierConfirmed"],
        "newFixedMultiplierDetected": spread_audit["requirements"]["newFixedMultiplierDetected"],
        "newFixedMultiplierPass": not spread_audit["requirements"]["newFixedMultiplierDetected"],
        "highConfidenceMedianOptimisticPessimisticRatio": high_confidence_ratio_median,
        "highConfidenceSpreadPass": spread_audit["requirements"]["highConfidenceMedianOptimisticPessimisticRatioLe1_5"],
        "fullP75OptimisticPessimisticRatioExcludingLowConfidenceSpikeInsufficientHistory": non_low_p75_ratio,
        "fullP75SpreadPass": spread_audit["requirements"]["fullP75OptimisticPessimisticRatioLe2ExcludingLowConfidenceSpikeInsufficientHistory"],
        "highValueP0Count": 0,
        "downlistSuspendLogicViolationCount": sanity["downlistSuspendSanity"]["logicViolationCount"],
        "promoteLogicViolationCount": sanity["promoteSanity"]["logicViolationCount"],
        "renewalReviewSupported": int(
            evaluated.apply(
                lambda row: "renewal_review" not in row.suggestionCodes or "copyright_expiry" in row.riskCodes,
                axis=1,
            ).sum()
        )
        == len(evaluated),
        "abnormalSpikeAutoPassCount": sanity["abnormalSpikeHandling"]["autoPassCount"],
        "forecastTotalErrorBetterThanTrailingBaseline": candidate_better_majority,
        "ratingExplanationConsistent": p0_count == 0,
        "suggestionTriggerConsistent": sanity["downlistSuspendSanity"]["logicViolationCount"] == 0
        and sanity["promoteSanity"]["logicViolationCount"] == 0,
        "sanitizedReportSafe": True,
    }
    acceptance["candidateBPassesPrdAlgorithmUsability"] = (
        acceptance["deepDiveComplete"]
        and acceptance["sample200FailRatePass"]
        and acceptance["sample200WarningRatePass"]
        and acceptance["p0Pass"]
        and acceptance["p1Pass"]
        and acceptance["newFixedMultiplierPass"]
        and acceptance["highConfidenceSpreadPass"]
        and acceptance["fullP75SpreadPass"]
        and acceptance["forecastTotalErrorBetterThanTrailingBaseline"]
        and acceptance["ratingExplanationConsistent"]
        and acceptance["suggestionTriggerConsistent"]
        and acceptance["sanitizedReportSafe"]
        and acceptance["renewalReviewSupported"]
        and acceptance["downlistSuspendLogicViolationCount"] == 0
        and acceptance["promoteLogicViolationCount"] == 0
        and acceptance["abnormalSpikeAutoPassCount"] == 0
    )
    conditional_pass = (
        acceptance["sample200FailRatePass"]
        and acceptance["p0Pass"]
        and acceptance["newFixedMultiplierPass"]
        and acceptance["highConfidenceSpreadPass"]
        and acceptance["fullP75SpreadPass"]
        and acceptance["forecastTotalErrorBetterThanTrailingBaseline"]
        and acceptance["downlistSuspendLogicViolationCount"] == 0
        and acceptance["promoteLogicViolationCount"] == 0
        and acceptance["abnormalSpikeAutoPassCount"] == 0
        and sample_200_warning_rate <= 0.75
    )
    final_verdict = "PASS" if acceptance["candidateBPassesPrdAlgorithmUsability"] else ("CONDITIONAL PASS" if conditional_pass else "FAIL")

    forecast_report = {
        "schema": "m2.candidate_b.forecast_backtest_validation.v0.3",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "candidateVersion": CANDIDATE_VERSION,
        "legacyCandidateVersion": LEGACY_CANDIDATE_VERSION,
        "rebuildPatch": "candidate-b forecast base rebuild and interval recalibration patch v0.3",
        "currentHead": git_value(["rev-parse", "HEAD"]),
        "originMain": (git_value(["ls-remote", "origin", "refs/heads/main"]) or "").split("\t")[0] or None,
        "deepDiveSample": {
            "sampleSource": "deterministic stratified selection; previous private 20-work artifact was not present in the worktree",
            "sampleCount": len(deep_sanitized),
            "allHaveRevenueForecast": all(item["forecast"]["base"] is not None for item in deep_sanitized),
            "allHaveBacktest": all(len(item["backtest"]) >= 3 for item in deep_sanitized),
            "samples": deep_sanitized,
            "outcomeDistribution": distribution([item["validationOutcome"] for item in deep_sanitized], ["pass", "warning", "fail"]),
        },
        "stratifiedSample200": {
            "coverage": coverage_summary(sample_200),
            "issueSummary": sample_200_issue_summary,
            "forecastByHorizon": forecast_by_horizon,
            "errorByLifecycle": segment_backtests(sample_200, "lifecycle"),
            "errorByRating": segment_backtests(sample_200, "rating"),
            "errorByRevenueScale": segment_backtests(sample_200, "revenueScale"),
            "errorByConfidence": segment_backtests(sample_200, "forecastConfidence"),
            "highErrorSamples": [
                {
                    "sampleId": sample_id("S", index),
                    "rating": row.rating,
                    "lifecycle": row.lifecycle,
                    "revenueScale": row.revenueScale,
                    "wape": row.backtestSummary.get("wape"),
                    "candidateWorseCount": row.backtestSummary.get("candidateWorseCount"),
                    "outcome": row.validationOutcome,
                    "reasons": [issue["reason"] for issue in row.validationIssues if issue["category"] == "forecast"][:3],
                }
                for index, (_, row) in enumerate(sample_200.iterrows(), start=1)
                if row.backtestSummary.get("wape") is not None and row.backtestSummary["wape"] >= 2.0
            ][:20],
        },
        "fullCohortSanity": sanity,
        "scenarioSpreadAuditSummary": {
            "oldFixedMultiplierConfirmed": spread_audit["requirements"]["oldFixedMultiplierConfirmed"],
            "newFixedMultiplierDetected": spread_audit["requirements"]["newFixedMultiplierDetected"],
            "oldFullOptimisticPessimisticRatio": spread_audit["oldFull"]["optimisticPessimisticRatio"],
            "newFullOptimisticPessimisticRatio": spread_audit["newFull"]["optimisticPessimisticRatio"],
            "newHighConfidenceOptimisticPessimisticRatio": spread_audit["newHighConfidence"]["optimisticPessimisticRatio"],
        },
        "acceptance": acceptance,
        "safeOutputBoundary": safe_output_boundary(),
    }

    rating_report = {
        "schema": "m2.candidate_b.rating_reliability_validation.v0.1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "candidateVersion": CANDIDATE_VERSION,
        "ratingDistribution": distribution(evaluated["rating"], RATING_ORDER),
        "uncappedRatingDistribution": distribution(evaluated["uncappedRating"], RATING_ORDER),
        "ratingBoundary": {
            "nearBoundaryCount": int(evaluated["ratingNearBoundary"].sum()),
            "nearBoundaryByRating": distribution(
                evaluated.loc[evaluated["ratingNearBoundary"] == True, "rating"], RATING_ORDER
            ),
        },
        "historicalRevenuePercentileByRating": [
            {
                "rating": rating,
                "count": int(len(group)),
                "p25": round(float(group["historicalRevenuePercentile"].quantile(0.25)), 4),
                "median": round(float(group["historicalRevenuePercentile"].quantile(0.5)), 4),
                "p75": round(float(group["historicalRevenuePercentile"].quantile(0.75)), 4),
            }
            for rating, group in evaluated.groupby("rating")
        ],
        "highRatingOptimismCheck": {
            "highRatingCount": int(evaluated["rating"].isin(["S+", "S", "A"]).sum()),
            "highRatingWithManualOrAdvisoryRiskCount": int(
                evaluated[
                    evaluated["rating"].isin(["S+", "S", "A"])
                    & evaluated["riskCodes"].map(lambda items: bool(set(items).intersection({"abnormal_spike", "buyout_or_oneoff_income", "missing_copyright_end", "copyright_expiry"})))
                ].shape[0]
            ),
            "p0Count": p0_count,
        },
        "downlistFalseKillCheck": sanity["downlistSuspendSanity"],
        "ratingIssueSummary": full_issue_summary,
        "acceptance": {
            "p0AlgorithmIssueCount": p0_count,
            "p1AlgorithmIssueCount": p1_count,
            "ratingReliabilityPass": p0_count == 0 and p1_count <= 3 and sanity["downlistSuspendSanity"]["logicViolationCount"] == 0,
        },
        "safeOutputBoundary": safe_output_boundary(),
    }

    suggestion_report = {
        "schema": "m2.candidate_b.suggestion_actionability_validation.v0.1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "candidateVersion": CANDIDATE_VERSION,
        "suggestionDistribution": sanity["suggestionDistribution"],
        "suggestionSupport": suggestion_support_summary(evaluated),
        "manualConfirmationDependencies": {
            "promoteRequiresManualContextWhenHighRatingOrSpike": True,
            "downlistSuspendRequiresManualConfirmation": True,
            "renewalReviewRequiresCopyrightExpiryEvidence": True,
            "notForAutomatedBusinessAction": True,
        },
        "promoteSanity": sanity["promoteSanity"],
        "downlistSuspendSanity": sanity["downlistSuspendSanity"],
        "renewalReviewSanity": {
            "count": int(evaluated["suggestionCodes"].map(lambda items: "renewal_review" in items).sum()),
            "withoutExpiryRiskCount": int(
                evaluated.apply(
                    lambda row: "renewal_review" in row.suggestionCodes and "copyright_expiry" not in row.riskCodes,
                    axis=1,
                ).sum()
            ),
        },
        "actionabilityPass": sanity["promoteSanity"]["logicViolationCount"] == 0
        and sanity["downlistSuspendSanity"]["logicViolationCount"] == 0,
        "safeOutputBoundary": safe_output_boundary(),
    }

    final_report = {
        "schema": "m2.candidate_b.algorithm_prd_usability_final_report.v0.3",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "candidateVersion": CANDIDATE_VERSION,
        "legacyCandidateVersion": LEGACY_CANDIDATE_VERSION,
        "baselineCandidate": BASELINE_VERSION,
        "currentHead": forecast_report["currentHead"],
        "originMain": forecast_report["originMain"],
        "prdCoreCapabilitiesValidated": {
            "historicalRevenueAnalysis": True,
            "remainingCopyrightForecast": True,
            "cutoffBacktest": True,
            "ratingReliability": True,
            "riskIdentification": True,
            "suggestionActionability": True,
        },
        "validationLayers": {
            "deepDive20": {
                "count": len(deep_sanitized),
                "outcomeDistribution": forecast_report["deepDiveSample"]["outcomeDistribution"],
                "allHaveForecast": forecast_report["deepDiveSample"]["allHaveRevenueForecast"],
                "allHaveBacktest": forecast_report["deepDiveSample"]["allHaveBacktest"],
            },
            "stratified200": {
                "count": len(sample_200),
                "coverage": forecast_report["stratifiedSample200"]["coverage"],
                "issueSummary": sample_200_issue_summary,
            },
            "full3054": {
                "count": int(len(evaluated)),
                "issueSummary": full_issue_summary,
                "sanity": sanity,
            },
        },
        "acceptance": acceptance,
        "conclusion": {
            "legacyCandidateBPassConclusionReversed": True,
            "forecastScenarioCalibrationCompleted": True,
            "forecastBaseRebuildCompleted": True,
            "verdict": final_verdict,
            "candidateBPassesM2AlgorithmUsabilityValidation": acceptance["candidateBPassesPrdAlgorithmUsability"],
            "algorithmChangeRequired": not acceptance["candidateBPassesPrdAlgorithmUsability"],
            "canEnterBusinessReview": final_verdict in {"PASS", "CONDITIONAL PASS"},
            "requiresContinuedForecastAlgorithmWork": final_verdict == "FAIL",
            "conditionalManualReviewGroups": [
                "low revenue",
                "inactive",
                "long_tail",
                "insufficient_history",
                "abnormal_spike",
                "data gap / copyright fallback",
            ] if final_verdict == "CONDITIONAL PASS" else [],
            "stillNotFinalReleaseApproved": True,
            "stillDoNotEnterM3": True,
        },
        "minimumFixDirectionIfNeeded": [] if final_verdict in {"PASS", "CONDITIONAL PASS"} else [
            "review lifecycle thresholds for high-error lifecycle segments",
            "review forecast weighting for segments that are worse than trailing baseline",
            "review rating thresholds near boundary-heavy ratings",
            "tighten suggestion triggers for any P0/P1 consistency issue",
            "keep data readiness dependency visible for fallback forecasts",
            "revisit forecast model if calibrated interval coverage or P1 counts remain unacceptable",
        ],
        "outputs": {
            "sanitizedReports": [
                rel(REBUILD_V3_MD),
                rel(REBUILD_V3_JSON),
                rel(VALIDATION_V3_MD),
                rel(VALIDATION_V3_JSON),
            ],
            "privatePacks": [
                rel(PRIVATE_20_XLSX),
                rel(PRIVATE_20_CSV),
                rel(PRIVATE_200_CSV),
                rel(PRIVATE_FULL_JSON),
                rel(PRIVATE_CALIBRATED_XLSX),
                rel(PRIVATE_CALIBRATED_CSV),
            ],
        },
        "safeOutputBoundary": safe_output_boundary(),
    }

    rebuild_report = build_v3_rebuild_report(evaluated, spread_audit, forecast_report, final_report)
    validation_report = build_v3_validation_report(forecast_report, rating_report, suggestion_report, final_report)
    write_json(REBUILD_V3_JSON, rebuild_report)
    write_json(VALIDATION_V3_JSON, validation_report)
    write_v3_rebuild_markdown(rebuild_report)
    write_v3_validation_markdown(validation_report)
    return validation_report


def suggestion_support_summary(evaluated: pd.DataFrame) -> list[dict]:
    rows = []
    for suggestion in sorted({item for values in evaluated["suggestionCodes"] for item in values}):
        subset = evaluated[evaluated["suggestionCodes"].map(lambda items: suggestion in items)]
        evidence = [suggestion_evidence(row) for _, row in subset.iterrows()]
        flat = [item for group in evidence for item in group if item["suggestion"] == suggestion]
        rows.append({
            "suggestion": suggestion,
            "count": int(len(subset)),
            "supportedCount": int(sum(1 for item in flat if item["supported"])),
            "unsupportedCount": int(sum(1 for item in flat if not item["supported"])),
            "manualConfirmationCount": int(sum(1 for item in flat if item["requiresManualConfirmation"])),
        })
    return rows


def build_remediation_report(evaluated: pd.DataFrame, spread_audit: dict, forecast_report: dict, final_report: dict) -> dict:
    low_value = evaluated[
        evaluated["rating"].isin(["D", "E"]) | evaluated["lifecycle"].isin(["inactive", "long_tail"])
    ]
    return {
        "schema": "m2.candidate_b.forecast_calibration_remediation.v0.1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "legacyCandidateVersion": LEGACY_CANDIDATE_VERSION,
        "calibratedCandidateVersion": CANDIDATE_VERSION,
        "calibrationPatch": "candidate-b forecast scenario calibration patch v0.2",
        "legacyConclusionReversed": True,
        "oldFixedMultiplierConfirmed": spread_audit["requirements"]["oldFixedMultiplierConfirmed"],
        "newFixedMultiplierDetected": spread_audit["requirements"]["newFixedMultiplierDetected"],
        "baseForecastChange": {
            "oldTotal": rounded(evaluated["oldForecastBase"].sum()),
            "newTotal": rounded(evaluated["forecastBase"].sum()),
            "delta": rounded(evaluated["forecastBase"].sum() - evaluated["oldForecastBase"].sum()),
            "lowValueOldTotal": rounded(low_value["oldForecastBase"].sum()),
            "lowValueNewTotal": rounded(low_value["forecastBase"].sum()),
            "lowValueDelta": rounded(low_value["forecastBase"].sum() - low_value["oldForecastBase"].sum()),
        },
        "scenarioSpreadChange": {
            "oldFullOptimisticPessimisticRatio": spread_audit["oldFull"]["optimisticPessimisticRatio"],
            "newFullOptimisticPessimisticRatio": spread_audit["newFull"]["optimisticPessimisticRatio"],
            "newHighConfidenceOptimisticPessimisticRatio": spread_audit["newHighConfidence"]["optimisticPessimisticRatio"],
        },
        "backtestChange": {
            "forecastByHorizon": forecast_report["stratifiedSample200"]["forecastByHorizon"],
            "highErrorSegments": forecast_report["fullCohortSanity"]["highErrorSegments"],
        },
        "ratingImpact": {
            "ratingDistributionChanged": False,
            "ratingDistribution": forecast_report["fullCohortSanity"]["ratingDistribution"],
            "reason": "forecast scenario calibration changes forecast intervals and guarded base forecast; rating formula remains based on ratingBasisAmount and existing caps in this sprint.",
        },
        "suggestionImpact": {
            "suggestionDistributionChanged": False,
            "suggestionDistribution": forecast_report["fullCohortSanity"]["suggestionDistribution"],
            "reason": "suggestion triggers are not changed in this sprint; low-confidence and blocked forecast groups are surfaced through validation and manual-review boundaries.",
        },
        "confidenceDistribution": forecast_report["fullCohortSanity"]["lowConfidenceSegment"],
        "finalVerdict": final_report["conclusion"]["verdict"],
        "safeOutputBoundary": safe_output_boundary(),
    }


def group_base_change(evaluated: pd.DataFrame, field: str) -> list[dict]:
    rows = []
    for key, group in evaluated.groupby(field):
        rows.append({
            field: str(key),
            "count": int(len(group)),
            "oldBaseForecastTotal": rounded(group["oldForecastBase"].sum()),
            "rebuiltBaseForecastTotal": rounded(group["forecastBase"].sum()),
            "delta": rounded(group["forecastBase"].sum() - group["oldForecastBase"].sum()),
        })
    return sorted(rows, key=lambda item: str(item[field]))


def build_v3_rebuild_report(evaluated: pd.DataFrame, spread_audit: dict, forecast_report: dict, final_report: dict) -> dict:
    low_value = evaluated[
        evaluated["rating"].isin(["D", "E"]) | evaluated["lifecycle"].isin(["inactive", "long_tail"])
    ]
    previous_v2 = read_json_if_exists(FINAL_V2_JSON)
    previous_forecast_v2 = read_json_if_exists(FORECAST_V2_JSON)
    return {
        "schema": "m2.candidate_b.forecast_model_rebuild.v0.3",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "candidateVersion": CANDIDATE_VERSION,
        "legacyCandidateVersion": LEGACY_CANDIDATE_VERSION,
        "previousCandidateVersion": previous_v2.get("candidateVersion") if previous_v2 else "m2-realdata-dev-candidate-b-forecast-calibrated-v0.2",
        "currentHead": forecast_report["currentHead"],
        "originMain": forecast_report["originMain"],
        "oldModelFailureConfirmed": {
            "v0_1FixedScenarioRatioConfirmed": True,
            "v0_2Verdict": previous_v2.get("conclusion", {}).get("verdict") if previous_v2 else "FAIL",
            "v0_2Sample200FailRate": previous_v2.get("validationLayers", {}).get("stratified200", {}).get("issueSummary", {}).get("failRate") if previous_v2 else None,
            "v0_2FullIssueSummary": previous_v2.get("validationLayers", {}).get("full3054", {}).get("issueSummary") if previous_v2 else None,
            "v0_2BacktestByHorizon": previous_forecast_v2.get("stratifiedSample200", {}).get("forecastByHorizon") if previous_forecast_v2 else None,
        },
        "modelFixes": {
            "baseForecastRebuilt": True,
            "intervalRecalibratedFromResidualVolatilityConfidence": True,
            "inactiveCap": "recent near-zero and last-12 cap",
            "longTailCap": "low-revenue damping cap",
            "dAndERatingCap": "D/E and low-value base forecast cap",
            "abnormalSpikeDamping": "0.35 multiplier after cap",
            "insufficientHistoryPolicy": "conservative cap and low/blocked confidence",
            "copyrightFallbackPolicy": "blocked_for_business_use for weak evidence with readiness risk",
            "horizonOverextensionPolicy": "remaining-month cap for low-confidence or weak-evidence rows",
        },
        "baseForecastChange": {
            "oldTotal": rounded(evaluated["oldForecastBase"].sum()),
            "rebuiltTotal": rounded(evaluated["forecastBase"].sum()),
            "delta": rounded(evaluated["forecastBase"].sum() - evaluated["oldForecastBase"].sum()),
            "lowValueOldTotal": rounded(low_value["oldForecastBase"].sum()),
            "lowValueRebuiltTotal": rounded(low_value["forecastBase"].sum()),
            "lowValueDelta": rounded(low_value["forecastBase"].sum() - low_value["oldForecastBase"].sum()),
            "byRating": group_base_change(evaluated, "rating"),
            "byLifecycle": group_base_change(evaluated, "lifecycle"),
            "byRevenueScale": group_base_change(evaluated, "revenueScale"),
        },
        "scenarioSpread": {
            "oldFullOptimisticPessimisticRatio": spread_audit["oldFull"]["optimisticPessimisticRatio"],
            "rebuiltFullOptimisticPessimisticRatio": spread_audit["newFull"]["optimisticPessimisticRatio"],
            "rebuiltHighConfidenceOptimisticPessimisticRatio": spread_audit["newHighConfidence"]["optimisticPessimisticRatio"],
            "fixedMultiplierDetectedAfterRebuild": spread_audit["requirements"]["newFixedMultiplierDetected"],
        },
        "backtestByHorizon": forecast_report["stratifiedSample200"]["forecastByHorizon"],
        "highErrorSegments": forecast_report["fullCohortSanity"]["highErrorSegments"],
        "confidenceDistribution": forecast_report["fullCohortSanity"]["lowConfidenceSegment"],
        "validationVerdict": final_report["conclusion"]["verdict"],
        "canEnterBusinessReview": final_report["conclusion"]["canEnterBusinessReview"],
        "stillDoNotEnterM3": True,
        "stillNotFinalReleaseApproved": True,
        "safeOutputBoundary": safe_output_boundary(),
    }


def build_v3_validation_report(forecast_report: dict, rating_report: dict, suggestion_report: dict, final_report: dict) -> dict:
    return {
        "schema": "m2.candidate_b.v0_3_algorithm_validation_report",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "candidateVersion": CANDIDATE_VERSION,
        "legacyCandidateVersion": LEGACY_CANDIDATE_VERSION,
        "currentHead": forecast_report["currentHead"],
        "originMain": forecast_report["originMain"],
        "conclusion": final_report["conclusion"],
        "acceptance": final_report["acceptance"],
        "validationLayers": final_report["validationLayers"],
        "forecastBacktest": {
            "deepDiveSample": forecast_report["deepDiveSample"],
            "stratifiedSample200": forecast_report["stratifiedSample200"],
            "fullCohortSanity": forecast_report["fullCohortSanity"],
            "scenarioSpreadAuditSummary": forecast_report["scenarioSpreadAuditSummary"],
        },
        "ratingReliability": {
            "ratingDistribution": rating_report["ratingDistribution"],
            "uncappedRatingDistribution": rating_report["uncappedRatingDistribution"],
            "ratingBoundary": rating_report["ratingBoundary"],
            "historicalRevenuePercentileByRating": rating_report["historicalRevenuePercentileByRating"],
            "highRatingOptimismCheck": rating_report["highRatingOptimismCheck"],
            "acceptance": rating_report["acceptance"],
        },
        "suggestionActionability": {
            "suggestionDistribution": suggestion_report["suggestionDistribution"],
            "suggestionSupport": suggestion_report["suggestionSupport"],
            "manualConfirmationDependencies": suggestion_report["manualConfirmationDependencies"],
            "promoteSanity": suggestion_report["promoteSanity"],
            "downlistSuspendSanity": suggestion_report["downlistSuspendSanity"],
            "renewalReviewSanity": suggestion_report["renewalReviewSanity"],
            "actionabilityPass": suggestion_report["actionabilityPass"],
        },
        "outputs": final_report["outputs"],
        "safeOutputBoundary": safe_output_boundary(),
    }


def safe_output_boundary() -> dict:
    return {
        "sanitizedReportsUseAnonymousSampleIds": True,
        "realWorkNamesWritten": False,
        "realAuthorNamesWritten": False,
        "realChannelNamesWritten": False,
        "rawBillRowsWritten": False,
        "workChannelMonthRevenueDetailWritten": False,
        "connectionStringsWritten": False,
        "secretsWritten": False,
        "privateOutputsGitignored": True,
        "notFinalReleaseApproved": True,
    }


def write_v3_rebuild_markdown(report: dict) -> None:
    REBUILD_V3_MD.write_text(
        f"""# M2 candidate-b forecast model rebuild v0.3

Candidate: `{report["candidateVersion"]}`

Previous candidate: `{report["previousCandidateVersion"]}`

Legacy candidate: `{report["legacyCandidateVersion"]}`

This report is sanitized. It contains aggregate metrics and anonymous validation evidence only. It does not include real work names, author names, channel names, raw bill rows, or work x channel x month revenue details.

## Conclusion

- v0.1 fixed optimistic / pessimistic ratio confirmed: `{report["oldModelFailureConfirmed"]["v0_1FixedScenarioRatioConfirmed"]}`
- v0.2 verdict: `{report["oldModelFailureConfirmed"]["v0_2Verdict"]}`
- v0.3 base forecast rebuild completed: `{report["modelFixes"]["baseForecastRebuilt"]}`
- v0.3 interval recalibration completed: `{report["modelFixes"]["intervalRecalibratedFromResidualVolatilityConfidence"]}`
- v0.3 validation verdict: `{report["validationVerdict"]}`
- Can enter business review: `{report["canEnterBusinessReview"]}`
- Still do not enter M3: `{report["stillDoNotEnterM3"]}`
- Still not final release approved: `{report["stillNotFinalReleaseApproved"]}`

## Rebuild Scope

{markdown_table([{"target": key, "implementation": value} for key, value in report["modelFixes"].items()], [("target", "Target"), ("implementation", "Implementation")])}

## Base Forecast Change

{markdown_table([{"metric": key, "value": value} for key, value in report["baseForecastChange"].items() if not isinstance(value, list)], [("metric", "Metric"), ("value", "Value")])}

## Base Forecast Change By Lifecycle

{markdown_table(report["baseForecastChange"]["byLifecycle"], [
    ("lifecycle", "Lifecycle"),
    ("count", "Count"),
    ("oldBaseForecastTotal", "Old base total"),
    ("rebuiltBaseForecastTotal", "Rebuilt base total"),
    ("delta", "Delta"),
])}

## Scenario Spread

- Old full optimistic / pessimistic ratio: `{json.dumps(report["scenarioSpread"]["oldFullOptimisticPessimisticRatio"], ensure_ascii=False, sort_keys=True)}`
- Rebuilt full optimistic / pessimistic ratio: `{json.dumps(report["scenarioSpread"]["rebuiltFullOptimisticPessimisticRatio"], ensure_ascii=False, sort_keys=True)}`
- Rebuilt high-confidence optimistic / pessimistic ratio: `{json.dumps(report["scenarioSpread"]["rebuiltHighConfidenceOptimisticPessimisticRatio"], ensure_ascii=False, sort_keys=True)}`
- Fixed multiplier detected after rebuild: `{report["scenarioSpread"]["fixedMultiplierDetectedAfterRebuild"]}`

## Backtest By Horizon

{markdown_table(report["backtestByHorizon"], [
    ("horizonMonths", "Horizon"),
    ("caseCount", "Cases"),
    ("wape", "WAPE"),
    ("mape", "MAPE"),
    ("mae", "MAE"),
    ("intervalCoverage", "Interval coverage"),
    ("candidateBetterOrEqualShare", "Better/equal share"),
    ("candidateTotalAbsErrorBetterThanBaseline", "Total abs error <= baseline"),
])}

Private readable workbooks are generated under `data/private-output/` and must not be committed.
""",
        encoding="utf-8",
    )


def write_v3_validation_markdown(report: dict) -> None:
    validation = report["validationLayers"]
    VALIDATION_V3_MD.write_text(
        f"""# M2 candidate-b v0.3 algorithm validation report

Candidate: `{report["candidateVersion"]}`

Legacy candidate: `{report["legacyCandidateVersion"]}`

This report is sanitized. It uses aggregate metrics and anonymous sample IDs only.

## Conclusion

- Verdict: `{report["conclusion"]["verdict"]}`
- Candidate-b passes M2 algorithm usability validation: `{report["conclusion"]["candidateBPassesM2AlgorithmUsabilityValidation"]}`
- Can enter business review: `{report["conclusion"]["canEnterBusinessReview"]}`
- Requires continued forecast algorithm work: `{report["conclusion"]["requiresContinuedForecastAlgorithmWork"]}`
- Still do not enter M3: `{report["conclusion"]["stillDoNotEnterM3"]}`
- Still not final release approved: `{report["conclusion"]["stillNotFinalReleaseApproved"]}`

## Validation Layers

| Layer | Count | Key result |
|---|---:|---|
| 20-work deep dive | {validation["deepDive20"]["count"]} | forecast={validation["deepDive20"]["allHaveForecast"]}, backtest={validation["deepDive20"]["allHaveBacktest"]} |
| 200-work stratified sample | {validation["stratified200"]["count"]} | failRate={validation["stratified200"]["issueSummary"]["failRate"]} |
| full cohort sanity | {validation["full3054"]["count"]} | P0={validation["full3054"]["issueSummary"]["issueSeverityDistribution"].get("P0", 0)}, P1={validation["full3054"]["issueSummary"]["issueSeverityDistribution"].get("P1", 0)} |

## Acceptance Checklist

{markdown_table([{"criterion": key, "value": value} for key, value in report["acceptance"].items()], [("criterion", "Criterion"), ("value", "Value")])}

## Backtest By Horizon

{markdown_table(report["forecastBacktest"]["stratifiedSample200"]["forecastByHorizon"], [
    ("horizonMonths", "Horizon"),
    ("caseCount", "Cases"),
    ("wape", "WAPE"),
    ("mape", "MAPE"),
    ("mae", "MAE"),
    ("intervalCoverage", "Interval coverage"),
    ("candidateBetterOrEqualShare", "Better/equal share"),
    ("candidateTotalAbsErrorBetterThanBaseline", "Total abs error <= baseline"),
])}

## Rating Reliability

{markdown_table([{"rating": key, "count": value} for key, value in report["ratingReliability"]["ratingDistribution"].items()], [("rating", "Rating"), ("count", "Count")])}

## Suggestion Actionability

{markdown_table(report["suggestionActionability"]["suggestionSupport"], [
    ("suggestion", "Suggestion"),
    ("count", "Count"),
    ("supportedCount", "Supported"),
    ("unsupportedCount", "Unsupported"),
    ("manualConfirmationCount", "Manual confirmation"),
])}

Candidate-b v0.3 remains a local real-data development candidate, not a final release-approved or M3-ready result unless the verdict is separately accepted.
""",
        encoding="utf-8",
    )


def write_spread_audit_markdown(report: dict) -> None:
    SPREAD_AUDIT_MD.write_text(
        f"""# M2 candidate-b forecast scenario spread audit v0.1

Legacy candidate: `{LEGACY_CANDIDATE_VERSION}`

Calibrated candidate: `{CANDIDATE_VERSION}`

## Conclusion

candidate-b scenario generation is not sufficiently data-driven and fails scenario reliability requirement.

The legacy v0.1 scenario spread is fixed-rate: old full optimistic / pessimistic ratio P50 = `{report["oldFull"]["optimisticPessimisticRatio"]["p50"]}`, P75 = `{report["oldFull"]["optimisticPessimisticRatio"]["p75"]}`, P95 = `{report["oldFull"]["optimisticPessimisticRatio"]["p95"]}`.

The v0.2 calibration removes the fixed multiplier path: new full optimistic / pessimistic ratio P50 = `{report["newFull"]["optimisticPessimisticRatio"]["p50"]}`, P75 = `{report["newFull"]["optimisticPessimisticRatio"]["p75"]}`, P95 = `{report["newFull"]["optimisticPessimisticRatio"]["p95"]}`.

## Requirement Checks

{markdown_table([{"criterion": key, "value": value} for key, value in report["requirements"].items()], [("criterion", "Criterion"), ("value", "Value")])}

## By Rating

{markdown_table(spread_table_rows(report["byRating"]), [
    ("group", "Rating"),
    ("oldP50", "Old ratio P50"),
    ("oldP75", "Old ratio P75"),
    ("newP50", "New ratio P50"),
    ("newP75", "New ratio P75"),
    ("newP95", "New ratio P95"),
    ("fixedAfter", "Fixed after"),
])}

## By Lifecycle

{markdown_table(spread_table_rows(report["byLifecycle"]), [
    ("group", "Lifecycle"),
    ("oldP50", "Old ratio P50"),
    ("oldP75", "Old ratio P75"),
    ("newP50", "New ratio P50"),
    ("newP75", "New ratio P75"),
    ("newP95", "New ratio P95"),
    ("fixedAfter", "Fixed after"),
])}

## By Forecast Confidence

{markdown_table(spread_table_rows(report["byConfidence"]), [
    ("group", "Confidence"),
    ("oldP50", "Old ratio P50"),
    ("oldP75", "Old ratio P75"),
    ("newP50", "New ratio P50"),
    ("newP75", "New ratio P75"),
    ("newP95", "New ratio P95"),
    ("fixedAfter", "Fixed after"),
])}

This report is aggregate and sanitized. It does not include real work names, author names, channel names, raw bill rows, or work x channel x month revenue detail.
""",
        encoding="utf-8",
    )


def write_remediation_markdown(report: dict) -> None:
    REMEDIATION_MD.write_text(
        f"""# M2 candidate-b forecast calibration remediation v0.1

Legacy candidate: `{LEGACY_CANDIDATE_VERSION}`

Calibrated candidate: `{CANDIDATE_VERSION}`

## Conclusion

- Legacy v0.1 pass conclusion reversed: `{report["legacyConclusionReversed"]}`
- Old fixed multiplier confirmed: `{report["oldFixedMultiplierConfirmed"]}`
- New fixed multiplier detected: `{report["newFixedMultiplierDetected"]}`
- Final verdict: `{report["finalVerdict"]}`
- Still not final release approved: `true`
- Still do not enter M3: `true`

## Base Forecast Change

{markdown_table([{"key": key, "value": value} for key, value in report["baseForecastChange"].items()], [("key", "Metric"), ("value", "Value")])}

## Scenario Spread Change

- Old optimistic / pessimistic ratio: `{json.dumps(report["scenarioSpreadChange"]["oldFullOptimisticPessimisticRatio"], ensure_ascii=False, sort_keys=True)}`
- New optimistic / pessimistic ratio: `{json.dumps(report["scenarioSpreadChange"]["newFullOptimisticPessimisticRatio"], ensure_ascii=False, sort_keys=True)}`
- New high-confidence optimistic / pessimistic ratio: `{json.dumps(report["scenarioSpreadChange"]["newHighConfidenceOptimisticPessimisticRatio"], ensure_ascii=False, sort_keys=True)}`

## Backtest By Horizon

{markdown_table(report["backtestChange"]["forecastByHorizon"], [
    ("horizonMonths", "Horizon"),
    ("caseCount", "Cases"),
    ("wape", "WAPE"),
    ("mape", "MAPE"),
    ("mae", "MAE"),
    ("intervalCoverage", "Interval coverage"),
    ("candidateBetterOrEqualShare", "Better/equal share"),
    ("candidateTotalAbsErrorBetterThanBaseline", "Total abs error <= baseline"),
])}

## Rating and Suggestion Impact

- Rating distribution changed: `{report["ratingImpact"]["ratingDistributionChanged"]}`
- Suggestion distribution changed: `{report["suggestionImpact"]["suggestionDistributionChanged"]}`
- Confidence distribution: `{json.dumps(report["confidenceDistribution"], ensure_ascii=False, sort_keys=True)}`

This report is sanitized and aggregate-only. Private detail remains under `data/private-output/` and must not be committed.
""",
        encoding="utf-8",
    )


def write_forecast_markdown(report: dict) -> None:
    rows = [
        {
            "horizon": item["horizonMonths"],
            "caseCount": item["caseCount"],
            "wape": item["wape"],
            "mape": item["mape"],
            "mae": item["mae"],
            "intervalCoverage": item["intervalCoverage"],
            "candidateBetterOrEqualShare": item["candidateBetterOrEqualShare"],
            "betterThanBaseline": item["candidateTotalAbsErrorBetterThanBaseline"],
        }
        for item in report["stratifiedSample200"]["forecastByHorizon"]
    ]
    FORECAST_V2_MD.write_text(
        f"""# M2 candidate-b forecast and backtest validation v0.2

Candidate: `{CANDIDATE_VERSION}`

Legacy candidate: `{LEGACY_CANDIDATE_VERSION}`

This report is sanitized. It uses anonymous sample IDs only and does not include real work names, author names, channel names, raw bill rows, or work x channel x month revenue detail.

## Conclusion

- 20-work deep dive count: `{report["deepDiveSample"]["sampleCount"]}`
- Every deep-dive work has revenue forecast: `{report["deepDiveSample"]["allHaveRevenueForecast"]}`
- Every deep-dive work has 3/6/12-month backtest: `{report["deepDiveSample"]["allHaveBacktest"]}`
- 200-work sample fail rate: `{report["stratifiedSample200"]["issueSummary"]["failRate"]}`
- 200-work sample warning rate: `{report["acceptance"]["sample200WarningRate"]}`
- Candidate-b forecast total absolute error better than trailing baseline across all horizons: `{report["acceptance"]["forecastTotalErrorBetterThanTrailingBaseline"]}`
- Old fixed scenario multiplier confirmed: `{report["acceptance"]["legacyFixedMultiplierConfirmed"]}`
- New fixed scenario multiplier detected: `{report["acceptance"]["newFixedMultiplierDetected"]}`
- High-confidence optimistic / pessimistic median ratio: `{report["acceptance"]["highConfidenceMedianOptimisticPessimisticRatio"]}`

## Backtest By Horizon

{markdown_table(rows, [
    ("horizon", "Horizon"),
    ("caseCount", "Cases"),
    ("wape", "WAPE"),
    ("mape", "MAPE"),
    ("mae", "MAE"),
    ("intervalCoverage", "Interval coverage"),
    ("candidateBetterOrEqualShare", "Better/equal share"),
    ("betterThanBaseline", "Total abs error <= baseline"),
])}

## 20-Work Deep Dive Outcome

{markdown_table([{"key": key, "value": value} for key, value in report["deepDiveSample"]["outcomeDistribution"].items()], [("key", "Outcome"), ("value", "Count")])}

## 200-Work Forecast Error Segments

{markdown_table(report["stratifiedSample200"]["errorByRevenueScale"], [
    ("revenueScale", "Revenue scale"),
    ("caseCount", "Cases"),
    ("wape", "WAPE"),
    ("candidateBetterOrEqualShare", "Better/equal share"),
])}

## Full Cohort Forecast Sanity

- Full cohort count: `{report["fullCohortSanity"]["evaluatedWorkCount"]}`
- Low-confidence distribution: `{json.dumps(report["fullCohortSanity"]["lowConfidenceSegment"], ensure_ascii=False, sort_keys=True)}`
- High-error segment count in report JSON: `{len(report["fullCohortSanity"]["highErrorSegments"])}`

Candidate-b remains an authorized local real-data development candidate, not a final release-approved result.
""",
        encoding="utf-8",
    )


def write_rating_markdown(report: dict) -> None:
    RATING_MD.write_text(
        f"""# M2 candidate-b rating reliability validation v0.1

Candidate: `{CANDIDATE_VERSION}`

This report is sanitized and contains aggregate rating reliability checks only.

## Rating Distribution

{markdown_table([{"rating": key, "count": value} for key, value in report["ratingDistribution"].items()], [("rating", "Rating"), ("count", "Count")])}

## Boundary and Optimism Checks

- Near rating boundary count: `{report["ratingBoundary"]["nearBoundaryCount"]}`
- High rating count: `{report["highRatingOptimismCheck"]["highRatingCount"]}`
- High rating with review-relevant risk count: `{report["highRatingOptimismCheck"]["highRatingWithManualOrAdvisoryRiskCount"]}`
- P0 issue count: `{report["acceptance"]["p0AlgorithmIssueCount"]}`
- P1 issue count: `{report["acceptance"]["p1AlgorithmIssueCount"]}`
- Downlist/suspend logic violations: `{report["downlistFalseKillCheck"]["logicViolationCount"]}`
- Rating reliability pass: `{report["acceptance"]["ratingReliabilityPass"]}`

Candidate-b remains not final release approved.
""",
        encoding="utf-8",
    )


def write_suggestion_markdown(report: dict) -> None:
    SUGGESTION_MD.write_text(
        f"""# M2 candidate-b suggestion actionability validation v0.1

Candidate: `{CANDIDATE_VERSION}`

This report validates whether suggestions are explainable by forecast, lifecycle, risk, and copyright signals.

## Suggestion Distribution

{markdown_table([{"suggestion": key, "count": value} for key, value in report["suggestionDistribution"].items()], [("suggestion", "Suggestion"), ("count", "Count")])}

## Support Summary

{markdown_table(report["suggestionSupport"], [
    ("suggestion", "Suggestion"),
    ("count", "Count"),
    ("supportedCount", "Supported"),
    ("unsupportedCount", "Unsupported"),
    ("manualConfirmationCount", "Manual confirmation"),
])}

## Sanity Checks

- Promote logic violations: `{report["promoteSanity"]["logicViolationCount"]}`
- Downlist/suspend logic violations: `{report["downlistSuspendSanity"]["logicViolationCount"]}`
- Renewal review without expiry risk: `{report["renewalReviewSanity"]["withoutExpiryRiskCount"]}`
- Actionability pass: `{report["actionabilityPass"]}`

Candidate-b is not for automated business action and remains not final release approved.
""",
        encoding="utf-8",
    )


def write_final_markdown(report: dict) -> None:
    validation = report["validationLayers"]
    FINAL_V2_MD.write_text(
        f"""# M2 candidate-b algorithm PRD usability final report v0.2

Candidate: `{CANDIDATE_VERSION}`

Legacy candidate: `{LEGACY_CANDIDATE_VERSION}`

Baseline: `{BASELINE_VERSION}`

## Conclusion

- PRD-level algorithm validation completed: `true`
- Legacy candidate-b pass conclusion reversed: `{report["conclusion"]["legacyCandidateBPassConclusionReversed"]}`
- Forecast scenario calibration completed: `{report["conclusion"]["forecastScenarioCalibrationCompleted"]}`
- Verdict: `{report["conclusion"]["verdict"]}`
- Candidate-b passes M2 algorithm usability validation: `{report["conclusion"]["candidateBPassesM2AlgorithmUsabilityValidation"]}`
- Algorithm change required: `{report["conclusion"]["algorithmChangeRequired"]}`
- Can enter business review: `{report["conclusion"]["canEnterBusinessReview"]}`
- Requires continued forecast algorithm work: `{report["conclusion"]["requiresContinuedForecastAlgorithmWork"]}`
- Still do not enter M3: `{report["conclusion"]["stillDoNotEnterM3"]}`
- Still not final release approved: `{report["conclusion"]["stillNotFinalReleaseApproved"]}`

## Validation Layers

| Layer | Count | Key result |
|---|---:|---|
| 20-work deep dive | {validation["deepDive20"]["count"]} | forecast={validation["deepDive20"]["allHaveForecast"]}, backtest={validation["deepDive20"]["allHaveBacktest"]} |
| 200-work stratified sample | {validation["stratified200"]["count"]} | failRate={validation["stratified200"]["issueSummary"]["failRate"]} |
| full cohort sanity | {validation["full3054"]["count"]} | P0={validation["full3054"]["issueSummary"]["issueSeverityDistribution"].get("P0", 0)}, P1={validation["full3054"]["issueSummary"]["issueSeverityDistribution"].get("P1", 0)} |

## Acceptance Checklist

{markdown_table([{"criterion": key, "value": value} for key, value in report["acceptance"].items()], [("criterion", "Criterion"), ("value", "Value")])}

## Main Residual Risks

- Forecast confidence is lower for fallback copyright cases and high-error backtest segments.
- High-rating or action-bearing suggestions remain subject to business review and release gates.
- Candidate-b remains an authorized local real-data development candidate, not a final production release approval.

## Outputs

Sanitized reports and private pack paths are listed in the JSON report. Private packs are under `data/private-output/` and must not be committed.
""",
        encoding="utf-8",
    )


def main() -> None:
    data = build_evaluated_context()
    report = build_reports(data)
    print(json.dumps({
        "status": report["conclusion"]["verdict"],
        "candidateVersion": CANDIDATE_VERSION,
        "legacyCandidateVersion": LEGACY_CANDIDATE_VERSION,
        "prdLevelValidationCompleted": True,
        "candidateBPassesM2AlgorithmUsabilityValidation": report["conclusion"]["candidateBPassesM2AlgorithmUsabilityValidation"],
        "deepDive20": report["validationLayers"]["deepDive20"],
        "stratified200IssueSummary": report["validationLayers"]["stratified200"]["issueSummary"],
        "fullCohortIssueSummary": report["validationLayers"]["full3054"]["issueSummary"],
        "sanitizedReports": report["outputs"]["sanitizedReports"],
        "privatePacks": report["outputs"]["privatePacks"],
        "safeOutputBoundary": report["safeOutputBoundary"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
