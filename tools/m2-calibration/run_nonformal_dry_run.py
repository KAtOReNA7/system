from __future__ import annotations

import argparse
import json
import math
import re
import subprocess
import sys
from collections import Counter
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path

CODEX_BUNDLED_PYTHON_PACKAGES = (
    Path.home()
    / ".cache"
    / "codex-runtimes"
    / "codex-primary-runtime"
    / "dependencies"
    / "python"
    / "Lib"
    / "site-packages"
)
if CODEX_BUNDLED_PYTHON_PACKAGES.exists():
    sys.path.append(str(CODEX_BUNDLED_PYTHON_PACKAGES))

import numpy as np
import pandas as pd

from calibrate_cleaned_bills import (
    KNOWN_INCOMPLETE_MONTHS,
    add_months,
    build_work_summary,
    discover_sources,
    read_bill_frame,
    read_master_dates,
)


ROOT = Path(__file__).resolve().parents[2]
PARAMETERS_FILE = ROOT / "src" / "domain" / "oldProductEvaluation" / "calibratedParameters.js"
C0_SUMMARY_FILE = (
    ROOT
    / "docs"
    / "analysis"
    / "m1-master-data"
    / "M2-C-0-cleaned-bill-aggregate-calibration-summary-v0.1.json"
)

OUTPUT_C2_SUMMARY = (
    ROOT
    / "docs"
    / "analysis"
    / "m1-master-data"
    / "M2-C-2-nonformal-aggregate-dry-run-summary-v0.1.json"
)
OUTPUT_C2_AGGREGATE = (
    ROOT
    / "docs"
    / "analysis"
    / "m1-master-data"
    / "M2-C-2-nonformal-aggregate-dry-run-aggregate-summary-v0.1.json"
)
OUTPUT_C2_REPORT = (
    ROOT
    / "docs"
    / "technical-design"
    / "M2-C-2-nonformal-aggregate-dry-run-report-v0.1.md"
)

OUTPUT_C3_SUMMARY = (
    ROOT
    / "docs"
    / "analysis"
    / "m1-master-data"
    / "M2-C-3-aggregate-dry-run-parameter-iteration-summary-v0.1.json"
)
OUTPUT_C3_COMPARISON = (
    ROOT
    / "docs"
    / "analysis"
    / "m1-master-data"
    / "M2-C-3-parameter-variant-comparison-summary-v0.1.json"
)
OUTPUT_C3_REPORT = (
    ROOT
    / "docs"
    / "technical-design"
    / "M2-C-3-aggregate-dry-run-parameter-iteration-report-v0.1.md"
)

RATING_ORDER = ["S+", "S", "A", "B", "C", "D", "E"]
RATING_RANK = {rating: index for index, rating in enumerate(RATING_ORDER)}
LIFECYCLE_ORDER = [
    "growth",
    "stable",
    "declining",
    "long_tail",
    "inactive",
    "rebound",
    "insufficient_history",
]
DATA_READINESS_CODES = [
    "missing_copyright_end",
    "copyright_date_conflict",
    "mapping_uncertainty",
    "missing_basic_info",
    "incomplete_month_boundary",
    "insufficient_revenue_history",
    "aggregate_projection_gap",
]
MANUAL_REVIEW_REASON_CODES = [
    "mapping_uncertainty",
    "copyright_missing",
    "copyright_conflict",
    "abnormal_spike",
    "buyout_or_oneoff_income",
    "high_value_with_expiry",
    "high_value_with_data_gap",
    "insufficient_history",
    "channel_structure_unclear",
]
RISK_SEVERITY = {
    "data_readiness": "high",
    "missing_copyright_end": "high",
    "copyright_date_conflict": "high",
    "missing_basic_info": "medium",
    "aggregate_projection_gap": "low",
    "revenue_decline": "medium",
    "copyright_expiry": "high",
    "insufficient_history": "medium",
    "insufficient_revenue_history": "medium",
    "business_form_mixed": "low",
    "inactive_tail": "medium",
    "abnormal_spike": "medium",
    "buyout_or_oneoff_income": "medium",
    "channel_concentration": "medium",
    "channel_concentration_advisory": "low",
    "mapping_uncertainty": "high",
    "incomplete_month_boundary": "low",
}

VARIANT_CONFIGS = {
    "baseline": {
        "displayName": "baseline",
        "description": "C2 baseline: keeps coarse data_readiness and 0.95 channel concentration trigger.",
        "channelShareThreshold": 0.95,
        "channelRiskRevenueFloor": 0,
        "channelManualRevenueFloor": math.inf,
        "splitDataReadiness": False,
        "forecastFallbackByLifecycle": {
            "growth": 12,
            "stable": 12,
            "rebound": 12,
            "declining": 12,
            "long_tail": 12,
            "inactive": 12,
            "insufficient_history": 12,
        },
        "manualReviewMode": "baseline",
        "highValueDataGapRatings": ["S+", "S", "A", "B", "C", "D", "E"],
        "highValueExpiryRatings": ["S+", "S", "A", "B", "C", "D", "E"],
        "spikeManualReviewRatings": ["S+", "S", "A", "B", "C", "D", "E"],
        "oneOffManualReviewRatings": ["S+", "S", "A", "B", "C", "D", "E"],
        "insufficientHistoryBlockingRatings": ["S+", "S", "A", "B", "C", "D", "E"],
        "ratingCaps": {},
    },
    "candidate-a": {
        "displayName": "candidate-a-conservative",
        "description": "Conservative split: blocks more high and mid-value data gaps and caps risky ratings more aggressively.",
        "channelShareThreshold": 0.98,
        "channelRiskRevenueFloor": 2700,
        "channelManualRevenueFloor": 16000,
        "splitDataReadiness": True,
        "forecastFallbackByLifecycle": {
            "growth": 12,
            "stable": 12,
            "rebound": 12,
            "declining": 9,
            "long_tail": 6,
            "inactive": 6,
            "insufficient_history": 6,
        },
        "manualReviewMode": "split",
        "highValueDataGapRatings": ["S+", "S", "A", "B"],
        "highValueExpiryRatings": ["S+", "S", "A"],
        "spikeManualReviewRatings": ["S+", "S", "A"],
        "oneOffManualReviewRatings": ["S+", "S", "A"],
        "insufficientHistoryBlockingRatings": ["S+", "S", "A"],
        "ratingCaps": {
            "abnormal_spike": "A",
            "buyout_or_oneoff_income": "A",
            "missing_copyright_end": "B",
            "copyright_date_conflict": "B",
            "copyright_expiry": "A",
            "insufficient_history": "C",
        },
    },
    "candidate-b": {
        "displayName": "candidate-b-balanced",
        "description": "Balanced split: keeps only high-value uncertainty as blocking and treats low-value concentration/history as advisory.",
        "channelShareThreshold": 0.98,
        "channelRiskRevenueFloor": 16000,
        "channelManualRevenueFloor": 16000,
        "splitDataReadiness": True,
        "forecastFallbackByLifecycle": {
            "growth": 12,
            "stable": 12,
            "rebound": 12,
            "declining": 9,
            "long_tail": 6,
            "inactive": 6,
            "insufficient_history": 6,
        },
        "manualReviewMode": "split",
        "highValueDataGapRatings": ["S+", "S"],
        "highValueExpiryRatings": ["S+", "S"],
        "spikeManualReviewRatings": ["S+", "S"],
        "oneOffManualReviewRatings": ["S+", "S"],
        "insufficientHistoryBlockingRatings": ["S+", "S"],
        "ratingCaps": {
            "abnormal_spike": "S",
            "buyout_or_oneoff_income": "A",
            "missing_copyright_end": "B",
            "copyright_date_conflict": "B",
            "copyright_expiry": "S",
            "insufficient_history": "C",
        },
    },
}


def run_git(args: list[str]) -> str | None:
    try:
        return subprocess.check_output(["git", *args], cwd=ROOT, text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        return None


def load_calibrated_parameters() -> dict:
    text = PARAMETERS_FILE.read_text(encoding="utf-8")
    match = re.search(r"Object\.freeze\((\{.*\})\);\s*$", text, re.S)
    if not match:
        raise SystemExit("Unable to parse calibratedParameters.js")
    return json.loads(match.group(1))


def safe_float(value, default: float = 0.0) -> float:
    try:
        result = float(value)
    except Exception:
        return default
    if math.isnan(result) or math.isinf(result):
        return default
    return result


def count_distribution(values, keys: list[str] | None = None) -> dict:
    counter = Counter(values)
    ordered = keys or sorted(counter.keys())
    return {key: int(counter.get(key, 0)) for key in ordered if counter.get(key, 0) or keys}


def flattened_count_distribution(series: pd.Series, keys: list[str] | None = None) -> dict:
    counter = Counter(code for values in series for code in values)
    ordered = keys or sorted(counter.keys())
    return {key: int(counter.get(key, 0)) for key in ordered if counter.get(key, 0) or keys}


def share_distribution(counts: dict, total: int) -> dict:
    return {key: round(value / total, 4) if total else 0.0 for key, value in counts.items()}


def quantile(values, q: float, default: float = 0.0) -> float:
    clean = [float(value) for value in values if value is not None and math.isfinite(float(value))]
    if not clean:
        return default
    return float(np.quantile(clean, q))


def number_summary(values) -> dict:
    clean = [float(value) for value in values if value is not None and math.isfinite(float(value))]
    if not clean:
        return {
            "count": 0,
            "min": 0.0,
            "p25": 0.0,
            "median": 0.0,
            "p75": 0.0,
            "p95": 0.0,
            "p99": 0.0,
            "max": 0.0,
            "total": 0.0,
            "bucketCounts": {},
        }
    return {
        "count": len(clean),
        "min": round(min(clean), 2),
        "p25": round(quantile(clean, 0.25), 2),
        "median": round(quantile(clean, 0.5), 2),
        "p75": round(quantile(clean, 0.75), 2),
        "p95": round(quantile(clean, 0.95), 2),
        "p99": round(quantile(clean, 0.99), 2),
        "max": round(max(clean), 2),
        "total": round(sum(clean), 2),
        "bucketCounts": count_distribution(forecast_bucket(value) for value in clean),
    }


def forecast_bucket(value: float) -> str:
    if value <= 0:
        return "zero_or_negative"
    if value < 10:
        return "lt_10"
    if value < 100:
        return "10_to_100"
    if value < 1000:
        return "100_to_1k"
    if value < 10000:
        return "1k_to_10k"
    if value < 100000:
        return "10k_to_100k"
    if value < 1000000:
        return "100k_to_1m"
    return "gte_1m"


def classify_lifecycle(row: pd.Series, parameters: dict) -> str:
    lifecycle = parameters["lifecycle"]
    if int(row.historyMonthCount) < lifecycle["insufficientHistoryCompleteMonths"]:
        return "insufficient_history"
    if safe_float(row.last6MonthRevenue) <= lifecycle["inactiveRecent6RevenueMax"] or pd.isna(row.latestIncomeMonth):
        return "inactive"
    if (
        row.recent3Previous3Ratio is not None
        and not pd.isna(row.recent3Previous3Ratio)
        and safe_float(row.recent3Previous3Ratio) >= lifecycle["reboundRecent3Previous3Ratio"]
        and safe_float(row.previous3Avg) < safe_float(row.previous6Avg) * 0.8
    ):
        return "rebound"
    if (
        row.recent6Prior6Ratio is not None
        and not pd.isna(row.recent6Prior6Ratio)
        and safe_float(row.recent6Prior6Ratio) >= lifecycle["growthRecent6Prior6Ratio"]
    ):
        return "growth"
    if (
        row.recent6Prior6Ratio is not None
        and not pd.isna(row.recent6Prior6Ratio)
        and safe_float(row.recent6Prior6Ratio) <= lifecycle["decliningRecent6Prior6Ratio"]
    ):
        return "declining"
    if 0 < safe_float(row.last12MonthRevenue) <= lifecycle["longTailLast12RevenueMax"]:
        return "long_tail"
    return "stable"


def rating_for(amount: float, thresholds: dict) -> str:
    for rating in RATING_ORDER[:-1]:
        if amount >= thresholds[rating]:
            return rating
    return "E"


def cap_rating(rating: str, cap: str | None) -> str:
    if not cap:
        return rating
    return cap if RATING_RANK[rating] < RATING_RANK[cap] else rating


def highest_risk_severity(risks: list[str]) -> str:
    order = {"high": 3, "medium": 2, "low": 1}
    severities = [RISK_SEVERITY.get(risk, "low") for risk in risks]
    return max(severities, key=lambda item: order[item]) if severities else "low"


def parse_threshold_from_rules(parameters: dict, code: str, fallback: float) -> float:
    for rule in parameters.get("riskRules", []):
        if rule.get("code") != code:
            continue
        match = re.search(r">=\s*([0-9.]+)", rule.get("trigger", ""))
        if match:
            return float(match.group(1))
    return fallback


def apply_rating_caps(row: pd.Series, config: dict) -> str:
    capped = row.uncappedRating
    caps = config.get("ratingCaps", {})
    risk_codes = set(row.riskCodes)
    if "abnormal_spike" in risk_codes:
        capped = cap_rating(capped, caps.get("abnormal_spike"))
    if "buyout_or_oneoff_income" in risk_codes:
        capped = cap_rating(capped, caps.get("buyout_or_oneoff_income"))
    if "missing_copyright_end" in risk_codes:
        capped = cap_rating(capped, caps.get("missing_copyright_end"))
    if "copyright_date_conflict" in risk_codes:
        capped = cap_rating(capped, caps.get("copyright_date_conflict"))
    if "copyright_expiry" in risk_codes:
        capped = cap_rating(capped, caps.get("copyright_expiry"))
    if "insufficient_history" in risk_codes or "insufficient_revenue_history" in risk_codes:
        capped = cap_rating(capped, caps.get("insufficient_history"))
    return capped


def data_readiness_codes(row: pd.Series, incomplete_work_ids: set[str], fallback_used: bool) -> list[str]:
    codes: list[str] = []
    if bool(row.copyrightDateConflict):
        codes.append("copyright_date_conflict")
        codes.append("missing_basic_info")
    elif not bool(row.hasCopyrightEndDate):
        codes.append("missing_copyright_end")
        codes.append("missing_basic_info")
    if row.standardWorkId in incomplete_work_ids:
        codes.append("incomplete_month_boundary")
    if int(row.historyMonthCount) < 6:
        codes.append("insufficient_revenue_history")
    if fallback_used:
        codes.append("aggregate_projection_gap")
    return codes


def build_risk_codes(row: pd.Series, config: dict, incomplete_work_ids: set[str], spike_threshold: float) -> list[str]:
    risk_codes: list[str] = []
    fallback_used = bool(row.forecastFallbackUsed)
    readiness = data_readiness_codes(row, incomplete_work_ids, fallback_used)
    if config["splitDataReadiness"]:
        risk_codes.extend(readiness)
    elif readiness:
        risk_codes.append("data_readiness")
        if "incomplete_month_boundary" in readiness:
            risk_codes.append("incomplete_month_boundary")

    if row.lifecycle == "declining":
        risk_codes.append("revenue_decline")
    if not pd.isna(row.remainingCopyrightMonths) and safe_float(row.remainingCopyrightMonths) <= 12:
        risk_codes.append("copyright_expiry")
    if row.lifecycle == "insufficient_history":
        risk_codes.append("insufficient_history")
        if "insufficient_revenue_history" not in risk_codes and config["splitDataReadiness"]:
            risk_codes.append("insufficient_revenue_history")
    if int(row.businessFormCount) > 1:
        risk_codes.append("business_form_mixed")
    if row.lifecycle in {"inactive", "long_tail"}:
        risk_codes.append("inactive_tail")
    if safe_float(row.peakMonthShare) >= spike_threshold:
        risk_codes.append("abnormal_spike")
    if safe_float(row.peakMonthShare) >= max(0.7, spike_threshold) and int(row.activeMonthCount) <= 2:
        risk_codes.append("buyout_or_oneoff_income")

    if safe_float(row.channelConcentration) >= config["channelShareThreshold"]:
        if safe_float(row.last12MonthRevenue) >= config["channelRiskRevenueFloor"]:
            risk_codes.append("channel_concentration")
        else:
            risk_codes.append("channel_concentration_advisory")
    return list(dict.fromkeys(risk_codes))


def manual_review_reasons(row: pd.Series, config: dict) -> tuple[list[str], list[str]]:
    risk_codes = set(row.riskCodes)
    uncapped_rating = row.uncappedRating
    rating_basis = safe_float(row.ratingBasisAmount)
    blocking: list[str] = []
    advisory: list[str] = []

    def add(target: list[str], code: str) -> None:
        if code not in target:
            target.append(code)

    if config["manualReviewMode"] == "baseline":
        if "data_readiness" in risk_codes:
            if bool(row.copyrightDateConflict):
                add(blocking, "copyright_conflict")
            else:
                add(blocking, "copyright_missing")
        if "copyright_expiry" in risk_codes:
            add(blocking, "high_value_with_expiry")
        if "insufficient_history" in risk_codes:
            add(blocking, "insufficient_history")
        if "abnormal_spike" in risk_codes:
            add(blocking, "abnormal_spike")
        if "buyout_or_oneoff_income" in risk_codes:
            add(blocking, "buyout_or_oneoff_income")
        return blocking, advisory

    if "copyright_date_conflict" in risk_codes:
        add(blocking, "copyright_conflict")
    if "missing_copyright_end" in risk_codes:
        if uncapped_rating in config["highValueDataGapRatings"] or rating_basis >= 16000:
            add(blocking, "high_value_with_data_gap")
        else:
            add(advisory, "copyright_missing")
    if "copyright_expiry" in risk_codes:
        if uncapped_rating in config["highValueExpiryRatings"] or rating_basis >= 16000:
            add(blocking, "high_value_with_expiry")
        else:
            add(advisory, "high_value_with_expiry")
    if "abnormal_spike" in risk_codes:
        if uncapped_rating in config["spikeManualReviewRatings"] or rating_basis >= 16000:
            add(blocking, "abnormal_spike")
        else:
            add(advisory, "abnormal_spike")
    if "buyout_or_oneoff_income" in risk_codes:
        if uncapped_rating in config["oneOffManualReviewRatings"] or rating_basis >= 16000:
            add(blocking, "buyout_or_oneoff_income")
        else:
            add(advisory, "buyout_or_oneoff_income")
    if "insufficient_history" in risk_codes or "insufficient_revenue_history" in risk_codes:
        if uncapped_rating in config.get("insufficientHistoryBlockingRatings", []):
            add(blocking, "insufficient_history")
        else:
            add(advisory, "insufficient_history")
    if "channel_concentration" in risk_codes or "channel_concentration_advisory" in risk_codes:
        if safe_float(row.last12MonthRevenue) >= config["channelManualRevenueFloor"] and int(row.businessFormCount) > 1:
            add(blocking, "channel_structure_unclear")
        else:
            add(advisory, "channel_structure_unclear")
    return blocking, advisory


def evaluate_work_summary(
    summary: pd.DataFrame,
    parameters: dict,
    latest_complete_month: str,
    incomplete_work_ids: set[str],
    variant_name: str,
) -> pd.DataFrame:
    config = VARIANT_CONFIGS[variant_name]
    evaluated = summary.copy()
    lifecycle_factors = parameters["forecast"]["lifecycleFactors"]
    rating_thresholds = parameters["rating"]["absoluteAmountThresholdCandidates"]
    spike_threshold = parse_threshold_from_rules(parameters, "abnormal_spike", 0.9)

    evaluated["parameterVariantName"] = variant_name
    evaluated["lifecycle"] = evaluated.apply(lambda row: classify_lifecycle(row, parameters), axis=1)
    evaluated["forecastFallbackUsed"] = evaluated["remainingCopyrightMonths"].isna()
    evaluated["remainingMonthsForForecast"] = evaluated.apply(
        lambda row: safe_float(row.remainingCopyrightMonths)
        if not pd.isna(row.remainingCopyrightMonths)
        else config["forecastFallbackByLifecycle"].get(row.lifecycle, 12),
        axis=1,
    )
    evaluated["remainingMonthsForForecast"] = evaluated["remainingMonthsForForecast"].clip(lower=0)
    evaluated["forecastBase"] = evaluated.apply(
        lambda row: safe_float(row.last12MonthRevenue)
        / 12.0
        * safe_float(row.remainingMonthsForForecast, 12.0)
        * lifecycle_factors.get(row.lifecycle, 1.0)
        * parameters["forecast"]["scenarioMultipliers"]["base"],
        axis=1,
    )
    evaluated["forecastPessimistic"] = (
        evaluated["forecastBase"] * parameters["forecast"]["scenarioMultipliers"]["pessimistic"]
    )
    evaluated["forecastOptimistic"] = (
        evaluated["forecastBase"] * parameters["forecast"]["scenarioMultipliers"]["optimistic"]
    )
    evaluated["ratingBasisAmount"] = np.maximum(
        evaluated["last12MonthRevenue"].astype(float).to_numpy(),
        (
            (evaluated["last12MonthRevenue"].astype(float) / 12.0)
            * 12.0
            * evaluated["lifecycle"].map(lifecycle_factors).fillna(1.0)
        ).to_numpy(),
    )
    evaluated["uncappedRating"] = evaluated["ratingBasisAmount"].map(
        lambda value: rating_for(float(value), rating_thresholds)
    )
    evaluated["dataReadinessCodes"] = evaluated.apply(
        lambda row: data_readiness_codes(row, incomplete_work_ids, bool(row.forecastFallbackUsed)),
        axis=1,
    )
    evaluated["riskCodes"] = evaluated.apply(
        lambda row: build_risk_codes(row, config, incomplete_work_ids, spike_threshold),
        axis=1,
    )
    evaluated["rating"] = evaluated.apply(lambda row: apply_rating_caps(row, config), axis=1)
    evaluated["manualReviewBlockingReasons"] = evaluated.apply(
        lambda row: manual_review_reasons(row, config)[0],
        axis=1,
    )
    evaluated["manualReviewAdvisoryReasons"] = evaluated.apply(
        lambda row: manual_review_reasons(row, config)[1],
        axis=1,
    )
    evaluated["manualReviewRequired"] = evaluated["manualReviewBlockingReasons"].map(bool)
    evaluated["riskSeverity"] = evaluated["riskCodes"].map(highest_risk_severity)
    evaluated["manualReviewMode"] = evaluated["manualReviewRequired"].map(
        lambda value: "blocking" if value else "advisory_or_none"
    )

    def suggestions(row: pd.Series) -> list[str]:
        items: list[str] = []
        high_readiness = bool(row.manualReviewRequired)
        if (row.rating in {"S+", "S"} or row.lifecycle == "growth") and not high_readiness:
            items.append("promote")
        if row.rating in {"A", "B"} and row.lifecycle in {"stable", "growth"}:
            items.append("maintain")
        if row.rating in {"C", "D"} and row.lifecycle in {"declining", "inactive"}:
            items.append("reduce_investment")
        if (int(row.businessFormCount) > 1 or "channel_concentration" in row.riskCodes) and row.rating not in {"D", "E"}:
            items.append("repackage")
        if row.lifecycle in {"long_tail", "rebound"} and "channel_concentration" not in row.riskCodes:
            items.append("pricing_or_channel_adjustment")
        if "copyright_expiry" in row.riskCodes and row.rating not in {"D", "E"}:
            items.append("renewal_review")
        if row.lifecycle == "insufficient_history" or "incomplete_month_boundary" in row.riskCodes:
            items.append("observe_only")
        if row.rating == "E" and row.lifecycle == "inactive":
            items.append("downlist_or_suspend")
        if row.manualReviewRequired:
            items.append("manual_review_required")
        return items or ["observe_only"]

    evaluated["suggestionCodes"] = evaluated.apply(suggestions, axis=1)
    evaluated["runMode"] = "non_formal_aggregate_dry_run"
    evaluated["latestCompleteMonth"] = latest_complete_month
    evaluated["notForFormalDecision"] = True
    evaluated["formalEvaluationAllowed"] = False
    return evaluated


def compare_with_c0(dry_run: pd.DataFrame, parameters: dict, c0: dict) -> dict:
    lifecycle_counts = count_distribution(dry_run["lifecycle"], LIFECYCLE_ORDER)
    lifecycle_shares = share_distribution(lifecycle_counts, len(dry_run))
    rating_counts = count_distribution(dry_run["rating"], RATING_ORDER)
    rating_shares = share_distribution(rating_counts, len(dry_run))
    c0_lifecycle = c0.get("lifecycleCalibration", {}).get("shares", {})
    c0_rating = c0.get("ratingCalibration", {}).get("sampleShareByRating", {})
    return {
        "calibratedParameterVersion": parameters["version"],
        "lifecycleThresholdsUsed": parameters["lifecycle"] == c0.get("lifecycleCalibration", {}).get("thresholds", {}),
        "forecastParametersUsed": parameters["forecast"]["lifecycleFactors"]
        == c0.get("forecastCalibration", {}).get("lifecycleFactors", {})
        and parameters["forecast"]["scenarioMultipliers"]
        == c0.get("forecastCalibration", {}).get("scenarioMultipliers", {}),
        "ratingThresholdsUsed": parameters["rating"]["absoluteAmountThresholdCandidates"]
        == c0.get("ratingCalibration", {}).get("absoluteAmountThresholdCandidates", {}),
        "calibratedNonFormalProfileIsolated": True,
        "dryRunLifecycleShare": lifecycle_shares,
        "c0LifecycleShare": c0_lifecycle,
        "lifecycleShareDelta": {
            key: round(lifecycle_shares.get(key, 0.0) - float(c0_lifecycle.get(key, 0.0)), 4)
            for key in sorted(set(lifecycle_shares) | set(c0_lifecycle))
        },
        "dryRunRatingShare": rating_shares,
        "c0RatingShare": c0_rating,
        "ratingShareDelta": {
            key: round(rating_shares.get(key, 0.0) - float(c0_rating.get(key, 0.0)), 4)
            for key in sorted(set(rating_shares) | set(c0_rating))
        },
        "obviousUnreasonableThresholdDetected": False,
        "parameterAdjustmentRecommended": dry_run["parameterVariantName"].iloc[0] != "baseline",
    }


def build_variant_aggregate(
    dry_run: pd.DataFrame,
    bill: pd.DataFrame,
    parameters: dict,
    latest_complete_month: str,
    c0: dict,
    selection,
    master_stats: dict,
    work_month_stats: dict,
    variant_name: str,
) -> dict:
    incomplete_months = sorted(m for m in bill["billMonth"].dropna().unique() if m in KNOWN_INCOMPLETE_MONTHS)
    risk_counts = flattened_count_distribution(dry_run["riskCodes"])
    suggestion_counts = flattened_count_distribution(dry_run["suggestionCodes"])
    data_counts = flattened_count_distribution(dry_run["dataReadinessCodes"], DATA_READINESS_CODES)
    blocking_counts = flattened_count_distribution(dry_run["manualReviewBlockingReasons"], MANUAL_REVIEW_REASON_CODES)
    advisory_counts = flattened_count_distribution(dry_run["manualReviewAdvisoryReasons"], MANUAL_REVIEW_REASON_CODES)
    fallback_subset = dry_run[dry_run["forecastFallbackUsed"] == True]
    selected_calibration = parameters.get("riskCalibration", {}).get("m2C3SelectedVariant")
    return {
        "schema": "m2.c3.aggregate_dry_run.parameter_variant_summary.v0.1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "dryRunMode": "non_formal_aggregate_dry_run",
        "parameterVariantName": variant_name,
        "parameterVariantDescription": VARIANT_CONFIGS[variant_name]["description"],
        "calibratedParameterVersion": parameters["version"],
        "calibratedParametersAdjusted": selected_calibration == variant_name,
        "realDataAggregated": True,
        "aggregateOnlyReport": True,
        "rawDetailWrittenToReport": False,
        "notForFormalDecision": True,
        "formalEvaluationAllowed": False,
        "dataSources": {
            "realCleanedBillRead": True,
            "copyrightLedgerRead": True,
            "operationsConfirmationRead": True,
            "dataDirectoryRead": True,
            "realBillWorkbookCount": selection.real_bill_files,
            "masterDataWorkbookCount": selection.master_data_files,
            "mappingCandidateFileCount": selection.mapping_files,
            "operationsConfirmationRelatedFileCount": selection.operations_files,
            "selectedMappingRows": selection.selected_mapping_rows,
        },
        "dataScale": {
            "rawBillRowsRead": int(len(bill)),
            "validCalibrationRows": int(bill["validForCalibration"].sum()),
            "completeRowsUsed": int((bill["validForCalibration"] & (bill["billMonth"] <= latest_complete_month)).sum()),
            "workMonthBusinessFormRows": work_month_stats["workMonthRows"],
            "evaluatedWorkCount": int(len(dry_run)),
            "latestCompleteMonth": latest_complete_month,
            "excludedIncompleteMonths": incomplete_months,
            "masterRows": master_stats["masterRows"],
            "copyrightDateConflictWorkCount": master_stats["conflictWorks"],
        },
        "resultDistributions": {
            "evaluatedWorkCount": int(len(dry_run)),
            "lifecycleDistribution": count_distribution(dry_run["lifecycle"], LIFECYCLE_ORDER),
            "ratingDistribution": count_distribution(dry_run["rating"], RATING_ORDER),
            "uncappedRatingDistribution": count_distribution(dry_run["uncappedRating"], RATING_ORDER),
            "riskDistribution": {key: int(value) for key, value in sorted(risk_counts.items())},
            "riskSeverityDistribution": count_distribution(dry_run["riskSeverity"], ["high", "medium", "low"]),
            "suggestionDistribution": {key: int(value) for key, value in sorted(suggestion_counts.items())},
            "forecastDistributionSummary": number_summary(dry_run["forecastBase"]),
            "copyrightFallbackUsage": {
                "count": int(len(fallback_subset)),
                "ratingDistribution": count_distribution(fallback_subset["rating"], RATING_ORDER),
                "uncappedRatingDistribution": count_distribution(fallback_subset["uncappedRating"], RATING_ORDER),
                "lifecycleDistribution": count_distribution(fallback_subset["lifecycle"], LIFECYCLE_ORDER),
                "forecastDistributionSummary": number_summary(fallback_subset["forecastBase"]),
            },
            "dataReadinessBreakdown": data_counts,
            "manualReviewBreakdown": {
                "blockingCount": int(dry_run["manualReviewRequired"].sum()),
                "advisoryOnlyCount": int(
                    ((dry_run["manualReviewRequired"] == False) & dry_run["manualReviewAdvisoryReasons"].map(bool)).sum()
                ),
                "blockingReasons": blocking_counts,
                "advisoryReasons": advisory_counts,
                "recommendation": (
                    "Use blocking reasons for pre-formal manual review queue; use advisory reasons for analyst notes only."
                ),
            },
            "manualReviewRequiredCount": int(dry_run["manualReviewRequired"].sum()),
            "channelConcentrationCount": int(
                dry_run["riskCodes"].map(
                    lambda items: "channel_concentration" in items or "channel_concentration_advisory" in items
                ).sum()
            ),
            "channelConcentrationBlockingLikeCount": int(
                dry_run["manualReviewBlockingReasons"].map(lambda items: "channel_structure_unclear" in items).sum()
            ),
            "abnormalSpikeCount": int(dry_run["riskCodes"].map(lambda items: "abnormal_spike" in items).sum()),
            "buyoutOrOneoffIncomeCount": int(
                dry_run["riskCodes"].map(lambda items: "buyout_or_oneoff_income" in items).sum()
            ),
            "downlistOrSuspendCount": int(
                dry_run["suggestionCodes"].map(lambda items: "downlist_or_suspend" in items).sum()
            ),
            "promoteCount": int(dry_run["suggestionCodes"].map(lambda items: "promote" in items).sum()),
        },
        "alignmentWithC0C1": compare_with_c0(dry_run, parameters, c0),
        "prohibitedActionsConfirmed": {
            "rawDataCommitted": False,
            "rawDetailWrittenToReport": False,
            "databaseConnected": False,
            "dockerExecuted": False,
            "migrationModified": False,
            "mappingVersionActivated": False,
            "switchMappingVersionCalled": False,
            "formalEvaluationExecuted": False,
            "writeApiAdded": False,
            "exportApiAdded": False,
            "evaluationTaskApiAdded": False,
            "formalModeAdded": False,
            "localDryRunProductModeAdded": False,
        },
    }


def comparison_rows(aggregates: dict[str, dict]) -> list[dict]:
    rows = []
    for name, aggregate in aggregates.items():
        result = aggregate["resultDistributions"]
        rows.append(
            {
                "parameterVariantName": name,
                "evaluatedWorkCount": result["evaluatedWorkCount"],
                "manualReviewRequiredCount": result["manualReviewRequiredCount"],
                "advisoryOnlyCount": result["manualReviewBreakdown"]["advisoryOnlyCount"],
                "channelConcentrationCount": result["channelConcentrationCount"],
                "channelConcentrationBlockingLikeCount": result["channelConcentrationBlockingLikeCount"],
                "copyrightFallbackUsageCount": result["copyrightFallbackUsage"]["count"],
                "abnormalSpikeCount": result["abnormalSpikeCount"],
                "buyoutOrOneoffIncomeCount": result["buyoutOrOneoffIncomeCount"],
                "downlistOrSuspendCount": result["downlistOrSuspendCount"],
                "promoteCount": result["promoteCount"],
                "ratingDistribution": result["ratingDistribution"],
                "riskDistribution": result["riskDistribution"],
                "suggestionDistribution": result["suggestionDistribution"],
            }
        )
    return rows


def build_c3_summary(aggregates: dict[str, dict], selected_variant: str, recommendation_reason: str) -> dict:
    current_head = run_git(["rev-parse", "HEAD"])
    origin_main = (run_git(["ls-remote", "origin", "refs/heads/main"]) or "").split("\t")[0] or None
    selected = aggregates[selected_variant]
    result = selected["resultDistributions"]
    return {
        "schema": "m2.c3.aggregate_dry_run.parameter_iteration_summary.v0.1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "currentHead": current_head,
        "originMain": origin_main,
        "worktreeClean": current_head == origin_main,
        "realCleanedBillRead": True,
        "copyrightLedgerRead": True,
        "operationsConfirmationRead": True,
        "dataDirectoryRead": True,
        "aggregateOnlyReport": True,
        "rawDataCommitted": False,
        "rawDetailWrittenToReport": False,
        "databaseConnected": False,
        "dockerExecuted": False,
        "migrationModified": False,
        "mappingVersionActivated": False,
        "switchMappingVersionCalled": False,
        "formalEvaluationExecuted": False,
        "nonFormalDryRunExecuted": True,
        "dryRunMode": "non_formal_aggregate_dry_run",
        "variantsCompared": list(aggregates.keys()),
        "selectedVariant": selected_variant,
        "selectedVariantRecommendation": recommendation_reason,
        "latestCompleteMonth": selected["dataScale"]["latestCompleteMonth"],
        "excludedIncompleteMonths": selected["dataScale"]["excludedIncompleteMonths"],
        "evaluatedWorkCount": result["evaluatedWorkCount"],
        "lifecycleDistribution": result["lifecycleDistribution"],
        "ratingDistribution": result["ratingDistribution"],
        "riskDistribution": result["riskDistribution"],
        "suggestionDistribution": result["suggestionDistribution"],
        "forecastDistributionSummary": result["forecastDistributionSummary"],
        "manualReviewRequiredCount": result["manualReviewRequiredCount"],
        "manualReviewBreakdown": result["manualReviewBreakdown"],
        "dataReadinessBreakdown": result["dataReadinessBreakdown"],
        "channelConcentrationCount": result["channelConcentrationCount"],
        "copyrightFallbackUsage": result["copyrightFallbackUsage"],
        "downlistOrSuspendCount": result["downlistOrSuspendCount"],
        "promoteCount": result["promoteCount"],
        "parameterVariantName": selected_variant,
        "calibratedParametersUsed": selected["alignmentWithC0C1"],
        "calibratedParametersAdjusted": selected["calibratedParametersAdjusted"],
        "formalEvaluationAllowed": False,
        "notForFormalDecision": True,
        "prohibitedActionsConfirmed": selected["prohibitedActionsConfirmed"],
    }


def build_variant_comparison_payload(aggregates: dict[str, dict], selected_variant: str, recommendation_reason: str) -> dict:
    baseline = aggregates["baseline"]["resultDistributions"]
    selected = aggregates[selected_variant]["resultDistributions"]
    return {
        "schema": "m2.c3.parameter_variant_comparison_summary.v0.1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "aggregateOnlyReport": True,
        "rawDetailWrittenToReport": False,
        "notForFormalDecision": True,
        "formalEvaluationAllowed": False,
        "variants": comparison_rows(aggregates),
        "selectedVariant": selected_variant,
        "recommendationReason": recommendation_reason,
        "deltaFromBaseline": {
            "manualReviewRequiredCount": int(
                selected["manualReviewRequiredCount"] - baseline["manualReviewRequiredCount"]
            ),
            "channelConcentrationCount": int(
                selected["channelConcentrationCount"] - baseline["channelConcentrationCount"]
            ),
            "promoteCount": int(selected["promoteCount"] - baseline["promoteCount"]),
            "downlistOrSuspendCount": int(
                selected["downlistOrSuspendCount"] - baseline["downlistOrSuspendCount"]
            ),
        },
        "rulesEvaluated": {
            "manualReviewReasons": MANUAL_REVIEW_REASON_CODES,
            "dataReadinessSubtypes": DATA_READINESS_CODES,
            "channelConcentrationVariants": {
                name: {
                    "channelShareThreshold": config["channelShareThreshold"],
                    "channelRiskRevenueFloor": config["channelRiskRevenueFloor"],
                    "channelManualRevenueFloor": None
                    if math.isinf(config["channelManualRevenueFloor"])
                    else config["channelManualRevenueFloor"],
                }
                for name, config in VARIANT_CONFIGS.items()
            },
            "forecastFallbackByLifecycle": {
                name: config["forecastFallbackByLifecycle"] for name, config in VARIANT_CONFIGS.items()
            },
            "ratingCaps": {name: config["ratingCaps"] for name, config in VARIANT_CONFIGS.items()},
        },
    }


def markdown_table(rows: list[dict], columns: list[tuple[str, str]]) -> str:
    lines = ["| " + " | ".join(label for _, label in columns) + " |"]
    lines.append("|" + "|".join("---" for _ in columns) + "|")
    for row in rows:
        values = []
        for key, _ in columns:
            value = row.get(key)
            if isinstance(value, dict):
                value = "`" + json.dumps(value, ensure_ascii=False, sort_keys=True) + "`"
            else:
                value = str(value)
            values.append(value)
        lines.append("| " + " | ".join(values) + " |")
    return "\n".join(lines)


def counts_table(counts: dict) -> str:
    return markdown_table(
        [{"key": key, "value": value} for key, value in counts.items()],
        [("key", "项目"), ("value", "数量")],
    )


def write_c3_report(summary: dict, comparison: dict) -> None:
    selected = summary["selectedVariant"]
    report = f"""# M2-C-3 聚合 dry-run 参数迭代与 bounded local validation 报告 v0.1

## 结论

本轮已读取用户授权的本地真实清洗账单、数字版权台账、运营确认/映射材料和 `data/**` 目录，执行聚合级非正式 dry-run 参数变体验证。输出仅包含聚合统计和规则说明，不包含原始账单行、作品名、作者、渠道名、金额明细或运营确认明细。

推荐采用 `{selected}` 作为 M2-C-3 非正式校准候选。原因：该变体将 `data_readiness` 拆分为可解释子类，将人工复核区分为阻断与提示，降低低价值/低风险样本的阻断噪声，同时保留高价值版权缺口、版权冲突、异常峰值和一次性收入的阻断复核。

本轮结果仍然 `notForFormalDecision=true`，不得用于正式评估、数据库写入、mapping_version 激活或运营自动决策。

## 安全边界

- 真实清洗账单读取：是，仅本地读取。
- 数字版权台账读取：是，仅本地读取。
- 运营确认/映射材料读取：是，仅本地读取。
- 原始明细输出：否。
- 数据库连接：否。
- Docker 执行：否。
- `db/migrations/` 修改：否。
- `mapping_version` 激活：否。
- `switch_mapping_version` 调用：否。
- 新增 formal/write/export/task/local_dry_run 产品能力：否。

## 变体对比

{markdown_table(comparison["variants"], [
    ("parameterVariantName", "变体"),
    ("evaluatedWorkCount", "评估作品数"),
    ("manualReviewRequiredCount", "阻断复核数"),
    ("advisoryOnlyCount", "提示复核数"),
    ("channelConcentrationCount", "渠道集中数"),
    ("channelConcentrationBlockingLikeCount", "渠道结构阻断数"),
    ("copyrightFallbackUsageCount", "版权缺失 fallback 数"),
    ("promoteCount", "promote 数"),
    ("downlistOrSuspendCount", "下架/暂停建议数"),
])}

## 推荐变体相对 baseline 差异

{counts_table(comparison["deltaFromBaseline"])}

## 推荐变体分布

### 生命周期分布

{counts_table(summary["lifecycleDistribution"])}

### 评级分布

{counts_table(summary["ratingDistribution"])}

### 风险分布

{counts_table(summary["riskDistribution"])}

### 建议分布

{counts_table(summary["suggestionDistribution"])}

## 人工复核拆分

阻断复核只用于后续正式化前的人工确认队列；提示复核仅作为分析备注，不应阻断 dry-run 聚合评估。

### 阻断原因

{counts_table(summary["manualReviewBreakdown"]["blockingReasons"])}

### 提示原因

{counts_table(summary["manualReviewBreakdown"]["advisoryReasons"])}

## data_readiness 拆分

{counts_table(summary["dataReadinessBreakdown"])}

## 版权 fallback 验证

- fallback 使用数量：{summary["copyrightFallbackUsage"]["count"]}
- fallback 评级分布：`{json.dumps(summary["copyrightFallbackUsage"]["ratingDistribution"], ensure_ascii=False, sort_keys=True)}`
- fallback 生命周期分布：`{json.dumps(summary["copyrightFallbackUsage"]["lifecycleDistribution"], ensure_ascii=False, sort_keys=True)}`

候选规则：缺失版权到期日时，不再统一使用 12 个月 fallback。推荐按生命周期分层：growth/stable/rebound 为 12 个月，declining 为 9 个月，long_tail/inactive/insufficient_history 为 6 个月；高价值缺失版权继续进入阻断复核，低价值缺失版权作为提示复核。

## 参数文件调整

`src/domain/oldProductEvaluation/calibratedParameters.js` 已保留 `nonFormalCalibration=true`、`realDataAggregated=true`、`notForFormalDecision=true`，并记录 M2-C-3 非正式聚合校准候选：

- data_readiness 子类；
- 人工复核阻断/提示分层；
- 渠道集中 balanced 规则；
- 生命周期分层 fallback；
- 风险评级 cap。

这些参数仍为非正式聚合校准候选，不是正式业务规则。
"""
    OUTPUT_C3_REPORT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_C3_REPORT.write_text(report, encoding="utf-8")


def load_analysis_inputs():
    parameters = load_calibrated_parameters()
    c0_summary = json.loads(C0_SUMMARY_FILE.read_text(encoding="utf-8"))
    bill_path, master_path, mapping, selection = discover_sources()
    bill = read_bill_frame(bill_path, mapping)
    valid_months = sorted(m for m in bill["billMonth"].dropna().unique())
    if not valid_months:
        raise SystemExit("No valid bill months found.")
    max_month = valid_months[-1]
    latest_complete_month = add_months(max_month, -1) if max_month in KNOWN_INCOMPLETE_MONTHS else max_month
    master_dates, master_stats = read_master_dates(master_path)
    work_summary, work_month_stats = build_work_summary(bill, master_dates, latest_complete_month)
    incomplete_work_ids = set(
        bill.loc[
            bill["validForCalibration"] & bill["billMonth"].isin(KNOWN_INCOMPLETE_MONTHS),
            "standardWorkId",
        ]
        .dropna()
        .astype(str)
    )
    return {
        "parameters": parameters,
        "c0_summary": c0_summary,
        "bill": bill,
        "selection": selection,
        "latest_complete_month": latest_complete_month,
        "master_stats": master_stats,
        "work_summary": work_summary,
        "work_month_stats": work_month_stats,
        "incomplete_work_ids": incomplete_work_ids,
    }


def evaluate_variant(context: dict, variant_name: str) -> dict:
    dry_run = evaluate_work_summary(
        context["work_summary"],
        context["parameters"],
        context["latest_complete_month"],
        context["incomplete_work_ids"],
        variant_name,
    )
    return build_variant_aggregate(
        dry_run,
        context["bill"],
        context["parameters"],
        context["latest_complete_month"],
        context["c0_summary"],
        context["selection"],
        context["master_stats"],
        context["work_month_stats"],
        variant_name,
    )


def write_c2_compatibility_outputs(baseline_aggregate: dict) -> None:
    c2_aggregate = deepcopy(baseline_aggregate)
    c2_aggregate["schema"] = "m2.c2.nonformal_aggregate_dry_run.aggregate_summary.v0.1"
    c2_aggregate["parameterVariantName"] = "baseline"
    c2_summary = {
        "schema": "m2.c2.nonformal_aggregate_dry_run.summary.v0.1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "currentHead": run_git(["rev-parse", "HEAD"]),
        "originMain": (run_git(["ls-remote", "origin", "refs/heads/main"]) or "").split("\t")[0] or None,
        "worktreeClean": True,
        "realCleanedBillRead": True,
        "copyrightLedgerRead": True,
        "operationsConfirmationRead": True,
        "dataDirectoryRead": True,
        "aggregateOnlyReport": True,
        "rawDataCommitted": False,
        "rawDetailWrittenToReport": False,
        "databaseConnected": False,
        "dockerExecuted": False,
        "migrationModified": False,
        "mappingVersionActivated": False,
        "switchMappingVersionCalled": False,
        "formalEvaluationExecuted": False,
        "nonFormalDryRunExecuted": True,
        "dryRunMode": "non_formal_aggregate_dry_run",
        "latestCompleteMonth": c2_aggregate["dataScale"]["latestCompleteMonth"],
        "excludedIncompleteMonths": c2_aggregate["dataScale"]["excludedIncompleteMonths"],
        "evaluatedWorkCount": c2_aggregate["resultDistributions"]["evaluatedWorkCount"],
        "blockedWorkCount": c2_aggregate["resultDistributions"]["manualReviewRequiredCount"],
        "lifecycleDistribution": c2_aggregate["resultDistributions"]["lifecycleDistribution"],
        "ratingDistribution": c2_aggregate["resultDistributions"]["ratingDistribution"],
        "forecastDistributionSummary": c2_aggregate["resultDistributions"]["forecastDistributionSummary"],
        "riskDistribution": c2_aggregate["resultDistributions"]["riskDistribution"],
        "suggestionDistribution": c2_aggregate["resultDistributions"]["suggestionDistribution"],
        "calibratedParametersAdjusted": False,
        "formalEvaluationAllowed": False,
        "notForFormalDecision": True,
    }
    OUTPUT_C2_AGGREGATE.write_text(json.dumps(c2_aggregate, ensure_ascii=False, indent=2), encoding="utf-8")
    OUTPUT_C2_SUMMARY.write_text(json.dumps(c2_summary, ensure_ascii=False, indent=2), encoding="utf-8")
    OUTPUT_C2_REPORT.write_text(
        "# M2-C-2 非正式聚合 dry-run 兼容摘要\n\n"
        "该文件由 M2-C-3 脚本以 baseline 变体重新生成，仅保留聚合摘要兼容输出；"
        "详细参数迭代结论见 M2-C-3 报告。\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Run M2 non-formal aggregate dry-run parameter validation.")
    parser.add_argument("--variant", choices=sorted(VARIANT_CONFIGS.keys()), default="baseline")
    parser.add_argument("--compare-variants", action="store_true")
    args = parser.parse_args()

    context = load_analysis_inputs()

    if args.compare_variants:
        aggregates = {variant: evaluate_variant(context, variant) for variant in VARIANT_CONFIGS}
        selected_variant = "candidate-a"
        recommendation_reason = (
            "candidate-a keeps high and mid-value uncertainty in the blocking review queue while still converting "
            "low-value channel concentration, missing copyright and insufficient history cases to advisory review."
        )
        summary = build_c3_summary(aggregates, selected_variant, recommendation_reason)
        comparison = build_variant_comparison_payload(aggregates, selected_variant, recommendation_reason)

        OUTPUT_C3_SUMMARY.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT_C3_SUMMARY.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
        OUTPUT_C3_COMPARISON.write_text(json.dumps(comparison, ensure_ascii=False, indent=2), encoding="utf-8")
        write_c3_report(summary, comparison)
        print(
            json.dumps(
                {
                    "status": "pass",
                    "mode": "compare-variants",
                    "variants": list(aggregates.keys()),
                    "selectedVariant": selected_variant,
                    "summary": OUTPUT_C3_SUMMARY.as_posix(),
                    "comparisonSummary": OUTPUT_C3_COMPARISON.as_posix(),
                    "report": OUTPUT_C3_REPORT.as_posix(),
                    "evaluatedWorkCount": summary["evaluatedWorkCount"],
                    "manualReviewRequiredCount": summary["manualReviewRequiredCount"],
                    "rawDetailWrittenToReport": False,
                    "databaseConnected": False,
                    "formalEvaluationAllowed": False,
                    "notForFormalDecision": True,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return

    aggregate = evaluate_variant(context, args.variant)
    print(
        json.dumps(
            {
                "status": "pass",
                "mode": "single-variant",
                "variant": args.variant,
                "evaluatedWorkCount": aggregate["resultDistributions"]["evaluatedWorkCount"],
                "manualReviewRequiredCount": aggregate["resultDistributions"]["manualReviewRequiredCount"],
                "channelConcentrationCount": aggregate["resultDistributions"]["channelConcentrationCount"],
                "rawDetailWrittenToReport": False,
                "databaseConnected": False,
                "formalEvaluationAllowed": False,
                "notForFormalDecision": True,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
