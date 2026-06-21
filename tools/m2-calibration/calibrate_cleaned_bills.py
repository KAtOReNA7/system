from __future__ import annotations

import json
import math
import re
import subprocess
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"
OUTPUT_SUMMARY = ROOT / "docs" / "analysis" / "m1-master-data" / "M2-C-0-cleaned-bill-aggregate-calibration-summary-v0.1.json"
PARAMETERS_FILE = ROOT / "src" / "domain" / "oldProductEvaluation" / "calibratedParameters.js"

REAL_BILL_COLUMNS = ["年月", "渠道ID", "文学库渠道名称", "授权分类", "我方作品ID", "作品名称", "实销金额"]
MASTER_COLUMNS = ["作品ID", "签订日期", "到期时间"]
KNOWN_INCOMPLETE_MONTHS = {"2026-05"}


@dataclass(frozen=True)
class SourceSelection:
    real_bill_files: int
    master_data_files: int
    mapping_files: int
    operations_files: int
    selected_mapping_rows: int


def git_value(args: list[str]) -> str | None:
    try:
        return subprocess.check_output(["git", *args], cwd=ROOT, text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        return None


def parse_month(value) -> str | None:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    if isinstance(value, pd.Timestamp):
        return f"{value.year:04d}-{value.month:02d}"
    if isinstance(value, datetime):
        return f"{value.year:04d}-{value.month:02d}"
    text = str(value).strip()
    if not text:
        return None
    if re.fullmatch(r"\d{6}(\.0)?", text):
        text = text.split(".")[0]
        return f"{text[:4]}-{text[4:6]}"
    match = re.match(r"^(\d{4})[-/年.](\d{1,2})", text)
    if match:
        return f"{int(match.group(1)):04d}-{int(match.group(2)):02d}"
    parsed = pd.to_datetime(text, errors="coerce")
    if pd.isna(parsed):
        return None
    return f"{parsed.year:04d}-{parsed.month:02d}"


def parse_date(value):
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    parsed = pd.to_datetime(value, errors="coerce")
    if pd.isna(parsed):
        return None
    return parsed.date()


def normalize_raw_work_id(value) -> str | None:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    text = str(value).strip()
    if text.endswith(".0"):
        text = text[:-2]
    return text or None


def derive_standard_work_id(raw_work_id: str | None) -> str | None:
    if not raw_work_id:
        return None
    if re.fullmatch(r"\d+", raw_work_id):
        return raw_work_id
    if re.fullmatch(r"Y\d+", raw_work_id):
        return raw_work_id[1:]
    return None


def derive_business_form(raw_work_id: str | None) -> str:
    if raw_work_id and re.fullmatch(r"\d+", raw_work_id):
        return "audio_copyright"
    if raw_work_id and re.fullmatch(r"Y\d+", raw_work_id):
        return "audio_product"
    return "invalid"


def month_range(start: str, end: str) -> list[str]:
    return [p.strftime("%Y-%m") for p in pd.period_range(start=start, end=end, freq="M")]


def add_months(month: str, delta: int) -> str:
    return (pd.Period(month, freq="M") + delta).strftime("%Y-%m")


def months_between(start_month: str, end_date) -> int | None:
    if end_date is None:
        return None
    start = pd.Period(start_month, freq="M")
    end = pd.Period(end_date, freq="M")
    return int(end.ordinal - start.ordinal + 1)


def quantile(values, q: float, default=0.0) -> float:
    clean = [float(v) for v in values if v is not None and not math.isnan(float(v))]
    if not clean:
        return float(default)
    return float(np.quantile(clean, q))


def round_bucket(value: float) -> float:
    if not math.isfinite(value):
        return 0.0
    value = max(0.0, float(value))
    if 0 < value < 10:
        return round(value, 2)
    if value < 1000:
        return max(10, round(value / 10) * 10)
    if value < 100000:
        return round(value / 100) * 100
    return round(value / 1000) * 1000


def ratio(numerator: float, denominator: float) -> float | None:
    if denominator is None or abs(denominator) < 1e-9:
        return None
    return float(numerator) / float(denominator)


def safe_mape(errors: list[float], actuals: list[float]) -> float | None:
    values = [abs(e) / abs(a) for e, a in zip(errors, actuals) if abs(a) > 1e-9]
    if not values:
        return None
    return float(np.mean(values))


def discover_sources() -> tuple[Path, Path, dict[str, str], SourceSelection]:
    real_bill_files = sorted((DATA_DIR / "real-bills").glob("*.xlsx"))
    master_data_files = sorted((DATA_DIR / "master-data").glob("*.xlsx"))
    if not real_bill_files:
        raise SystemExit("No real bill workbook found under the authorized data directory.")
    if not master_data_files:
        raise SystemExit("No master-data workbook found under the authorized data directory.")

    mapping_rows: list[dict] = []
    mapping_files = sorted((DATA_DIR / "m1-master-data-private" / "mapping-candidate").glob("*.json"))
    for path in mapping_files:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        rows = payload.get("effective_mapping_snapshot") or payload.get("mappings") or []
        if len(rows) > len(mapping_rows):
            mapping_rows = rows

    mapping: dict[str, str] = {}
    for row in mapping_rows:
        raw = normalize_raw_work_id(row.get("raw_work_id"))
        target = normalize_raw_work_id(row.get("target_standard_work_id"))
        if raw and target:
            mapping[raw] = target

    operations_files = list((DATA_DIR / "m1-master-data-private" / "ops-confirmation").glob("*"))

    selection = SourceSelection(
        real_bill_files=len(real_bill_files),
        master_data_files=len(master_data_files),
        mapping_files=len(mapping_files),
        operations_files=len(operations_files),
        selected_mapping_rows=len(mapping_rows),
    )
    return real_bill_files[0], master_data_files[0], mapping, selection


def read_bill_frame(path: Path, mapping: dict[str, str]) -> pd.DataFrame:
    frame = pd.read_excel(path, dtype={"渠道ID": "string", "我方作品ID": "string"})
    missing = [column for column in REAL_BILL_COLUMNS if column not in frame.columns]
    if missing:
        raise SystemExit(f"Real bill workbook missing required columns: {missing}")

    frame = frame[REAL_BILL_COLUMNS].copy()
    frame["billMonth"] = frame["年月"].map(parse_month)
    frame["rawWorkId"] = frame["我方作品ID"].map(normalize_raw_work_id)
    frame["derivedStandardWorkId"] = frame["rawWorkId"].map(derive_standard_work_id)
    frame["businessForm"] = frame["rawWorkId"].map(derive_business_form)
    frame["mappedStandardWorkId"] = frame["rawWorkId"].map(mapping)
    frame["standardWorkId"] = frame["mappedStandardWorkId"].fillna(frame["derivedStandardWorkId"])
    frame["mappingApplied"] = frame["mappedStandardWorkId"].notna()
    frame["amount"] = pd.to_numeric(frame["实销金额"], errors="coerce").fillna(0.0).astype(float)
    frame["channelIdPresent"] = frame["渠道ID"].notna() & (frame["渠道ID"].astype(str).str.strip() != "")
    frame["channelKey"] = frame["渠道ID"].astype(str).fillna("")
    frame["validForCalibration"] = (
        frame["billMonth"].notna()
        & frame["standardWorkId"].notna()
        & frame["businessForm"].isin(["audio_copyright", "audio_product"])
    )
    return frame


def read_master_dates(path: Path) -> tuple[dict[str, dict], dict[str, int]]:
    frame = pd.read_excel(path, dtype={"作品ID": "string"})
    missing = [column for column in MASTER_COLUMNS if column not in frame.columns]
    if missing:
        return {}, {"masterRows": int(len(frame)), "dateRows": 0, "unambiguousWorks": 0, "conflictWorks": 0}
    frame = frame[MASTER_COLUMNS].copy()
    frame["standardWorkId"] = frame["作品ID"].map(normalize_raw_work_id).map(derive_standard_work_id)
    frame["copyrightStartDate"] = frame["签订日期"].map(parse_date)
    frame["copyrightEndDate"] = frame["到期时间"].map(parse_date)
    frame = frame[frame["standardWorkId"].notna()]

    result: dict[str, dict] = {}
    conflict_count = 0
    for standard_id, group in frame.groupby("standardWorkId"):
        starts = {d for d in group["copyrightStartDate"].dropna().tolist()}
        ends = {d for d in group["copyrightEndDate"].dropna().tolist()}
        if len(starts) <= 1 and len(ends) <= 1:
            result[standard_id] = {
                "start": next(iter(starts), None),
                "end": next(iter(ends), None),
                "conflict": False,
            }
        else:
            conflict_count += 1
            result[standard_id] = {"start": None, "end": None, "conflict": True}
    stats = {
        "masterRows": int(len(frame)),
        "dateRows": int(frame["copyrightEndDate"].notna().sum()),
        "unambiguousWorks": int(sum(1 for item in result.values() if not item["conflict"] and item["end"] is not None)),
        "conflictWorks": int(conflict_count),
    }
    return result, stats


def build_work_summary(frame: pd.DataFrame, master_dates: dict[str, dict], latest_complete_month: str) -> tuple[pd.DataFrame, dict]:
    complete = frame[frame["validForCalibration"] & (frame["billMonth"] <= latest_complete_month)].copy()
    months = month_range(complete["billMonth"].min(), latest_complete_month)

    work_month = complete.groupby(["standardWorkId", "billMonth"], dropna=False)["amount"].sum().unstack(fill_value=0.0)
    work_month = work_month.reindex(columns=months, fill_value=0.0)

    business_form_counts = complete.groupby("standardWorkId")["businessForm"].nunique()
    business_form_breakdown = complete.groupby(["standardWorkId", "businessForm"])["amount"].sum().unstack(fill_value=0.0)

    positive = complete.copy()
    positive["positiveAmount"] = positive["amount"].clip(lower=0.0)
    channel_totals = positive.groupby(["standardWorkId", "channelKey"])["positiveAmount"].sum()
    total_positive_by_work = positive.groupby("standardWorkId")["positiveAmount"].sum()
    top_channel_by_work = channel_totals.groupby(level=0).max()
    channel_concentration = (top_channel_by_work / total_positive_by_work.replace(0.0, np.nan)).fillna(0.0)

    rows = []
    first_forecast_month = add_months(latest_complete_month, 1)
    for standard_id, series in work_month.iterrows():
        values = series.to_numpy(dtype=float)
        positive_positions = np.where(values > 0)[0]
        first_idx = int(positive_positions[0]) if len(positive_positions) else None
        latest_idx = int(positive_positions[-1]) if len(positive_positions) else None
        active_window = values[first_idx:] if first_idx is not None else np.array([], dtype=float)
        last3 = float(values[-3:].sum())
        last6 = float(values[-6:].sum())
        last12 = float(values[-12:].sum())
        last24 = float(values[-24:].sum())
        prev3_avg = float(values[-6:-3].mean()) if len(values) >= 6 else 0.0
        last3_avg = float(values[-3:].mean()) if len(values) >= 3 else 0.0
        prev6_avg = float(values[-12:-6].mean()) if len(values) >= 12 else 0.0
        recent6_avg = float(values[-6:].mean()) if len(values) >= 6 else 0.0
        last6_cv = float(np.std(values[-6:]) / (np.mean(values[-6:]) or 1.0)) if len(values) >= 6 else 0.0
        peak_idx = int(np.argmax(values)) if len(values) else None
        peak_value = float(values[peak_idx]) if peak_idx is not None else 0.0
        total = float(values.sum())
        master = master_dates.get(standard_id, {})
        remaining_months = months_between(first_forecast_month, master.get("end")) if master else None

        rows.append({
            "standardWorkId": standard_id,
            "historyMonthCount": int(len(active_window)),
            "activeMonthCount": int((active_window > 0).sum()) if len(active_window) else 0,
            "zeroRevenueMonthCount": int((active_window == 0).sum()) if len(active_window) else 0,
            "firstPositiveSalesMonth": months[first_idx] if first_idx is not None else None,
            "latestIncomeMonth": months[latest_idx] if latest_idx is not None else None,
            "last3MonthRevenue": last3,
            "last6MonthRevenue": last6,
            "last12MonthRevenue": last12,
            "last24MonthRevenue": last24,
            "totalHistoricalRevenue": total,
            "recent3Avg": last3_avg,
            "previous3Avg": prev3_avg,
            "recent6Avg": recent6_avg,
            "previous6Avg": prev6_avg,
            "recent6Prior6Ratio": ratio(recent6_avg, prev6_avg),
            "recent3Previous3Ratio": ratio(last3_avg, prev3_avg),
            "last6CoefficientOfVariation": last6_cv,
            "peakMonthRevenue": peak_value,
            "peakMonthShare": peak_value / total if total > 0 else 0.0,
            "businessFormCount": int(business_form_counts.get(standard_id, 0)),
            "channelConcentration": float(channel_concentration.get(standard_id, 0.0)),
            "remainingCopyrightMonths": remaining_months,
            "copyrightDateConflict": bool(master.get("conflict")) if master else False,
            "hasCopyrightEndDate": bool(master and master.get("end")),
            "audioCopyrightRevenue": float(business_form_breakdown.get("audio_copyright", pd.Series()).get(standard_id, 0.0)) if not business_form_breakdown.empty else 0.0,
            "audioProductRevenue": float(business_form_breakdown.get("audio_product", pd.Series()).get(standard_id, 0.0)) if not business_form_breakdown.empty else 0.0,
        })

    summary = pd.DataFrame(rows)
    return summary, {
        "workMonthRows": int(complete.groupby(["standardWorkId", "billMonth", "businessForm"]).ngroups),
        "completeRows": int(len(complete)),
        "monthColumns": len(months),
    }


def calibrate_lifecycle(summary: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    positive_last12 = summary.loc[summary["last12MonthRevenue"] > 0, "last12MonthRevenue"]
    ratios = summary["recent6Prior6Ratio"].dropna()
    cv_values = summary.loc[summary["last6MonthRevenue"] > 0, "last6CoefficientOfVariation"]

    thresholds = {
        "insufficientHistoryCompleteMonths": 6,
        "inactiveRecent6RevenueMax": 0.0,
        "longTailLast12RevenueMax": round_bucket(quantile(positive_last12, 0.25)),
        "growthRecent6Prior6Ratio": round(max(1.15, min(1.6, quantile(ratios, 0.75, 1.25))), 2),
        "decliningRecent6Prior6Ratio": round(max(0.45, min(0.85, quantile(ratios, 0.25, 0.65))), 2),
        "reboundRecent3Previous3Ratio": 1.5,
        "stableLast6CoefficientOfVariationMax": round(max(0.25, min(0.9, quantile(cv_values, 0.4, 0.5))), 2),
    }

    def classify(row) -> str:
        if row.historyMonthCount < thresholds["insufficientHistoryCompleteMonths"]:
            return "insufficient_history"
        if row.last6MonthRevenue <= thresholds["inactiveRecent6RevenueMax"] or row.latestIncomeMonth is None:
            return "inactive"
        if (
            row.recent3Previous3Ratio is not None
            and row.recent3Previous3Ratio >= thresholds["reboundRecent3Previous3Ratio"]
            and row.previous3Avg < row.previous6Avg * 0.8
        ):
            return "rebound"
        if row.recent6Prior6Ratio is not None and row.recent6Prior6Ratio >= thresholds["growthRecent6Prior6Ratio"]:
            return "growth"
        if row.recent6Prior6Ratio is not None and row.recent6Prior6Ratio <= thresholds["decliningRecent6Prior6Ratio"]:
            return "declining"
        if 0 < row.last12MonthRevenue <= thresholds["longTailLast12RevenueMax"]:
            return "long_tail"
        return "stable"

    calibrated = summary.copy()
    calibrated["lifecycle"] = calibrated.apply(classify, axis=1)
    counts = calibrated["lifecycle"].value_counts().to_dict()
    total = int(len(calibrated))
    lifecycle_summary = {
        "thresholds": thresholds,
        "counts": {key: int(value) for key, value in counts.items()},
        "shares": {key: round(float(value) / total, 4) for key, value in counts.items()} if total else {},
        "manualReviewRecommendedFor": [
            "borderline ratio cases within 10% of growth or declining thresholds",
            "works with copyright-date conflicts",
            "works with high channel concentration and abnormal spike signals",
        ],
    }
    return calibrated, lifecycle_summary


def classify_at(values: np.ndarray, thresholds: dict) -> str:
    active_positions = np.where(values > 0)[0]
    history_count = int(len(values[active_positions[0]:])) if len(active_positions) else 0
    if history_count < thresholds["insufficientHistoryCompleteMonths"]:
        return "insufficient_history"
    last6 = float(values[-6:].sum()) if len(values) >= 6 else float(values.sum())
    if last6 <= thresholds["inactiveRecent6RevenueMax"]:
        return "inactive"
    recent6_avg = float(values[-6:].mean()) if len(values) >= 6 else 0.0
    previous6_avg = float(values[-12:-6].mean()) if len(values) >= 12 else 0.0
    recent3_avg = float(values[-3:].mean()) if len(values) >= 3 else 0.0
    previous3_avg = float(values[-6:-3].mean()) if len(values) >= 6 else 0.0
    previous6_for_rebound = float(values[-12:-6].mean()) if len(values) >= 12 else 0.0
    if previous3_avg > 0 and recent3_avg / previous3_avg >= thresholds["reboundRecent3Previous3Ratio"] and previous3_avg < previous6_for_rebound * 0.8:
        return "rebound"
    if previous6_avg > 0 and recent6_avg / previous6_avg >= thresholds["growthRecent6Prior6Ratio"]:
        return "growth"
    if previous6_avg > 0 and recent6_avg / previous6_avg <= thresholds["decliningRecent6Prior6Ratio"]:
        return "declining"
    last12 = float(values[-12:].sum()) if len(values) >= 12 else float(values.sum())
    if 0 < last12 <= thresholds["longTailLast12RevenueMax"]:
        return "long_tail"
    return "stable"


def build_forecast_backtests(frame: pd.DataFrame, lifecycle_summary: dict, latest_complete_month: str) -> tuple[dict, dict]:
    complete = frame[frame["validForCalibration"] & (frame["billMonth"] <= latest_complete_month)].copy()
    months = month_range(complete["billMonth"].min(), latest_complete_month)
    matrix = complete.groupby(["standardWorkId", "billMonth"])["amount"].sum().unstack(fill_value=0.0)
    matrix = matrix.reindex(columns=months, fill_value=0.0)
    thresholds = lifecycle_summary["thresholds"]

    factor_samples: dict[str, list[float]] = defaultdict(list)
    raw_cases = []
    for horizon in [3, 6, 12]:
        train_end_idx = len(months) - horizon - 1
        if train_end_idx < 12:
            continue
        for standard_id, series in matrix.iterrows():
            values = series.to_numpy(dtype=float)
            history = values[: train_end_idx + 1]
            actual_window = values[train_end_idx + 1 : train_end_idx + 1 + horizon]
            if len(history) < 12 or len(actual_window) < horizon:
                continue
            base = float(history[-12:].mean() * horizon)
            last24 = float(history[-24:].mean() * horizon) if len(history) >= 24 else base
            actual = float(actual_window.sum())
            lifecycle = classify_at(history, thresholds)
            if base > 0 and actual > 0:
                factor_samples[lifecycle].append(actual / base)
            raw_cases.append({
                "horizon": horizon,
                "lifecycle": lifecycle,
                "base12": base,
                "base24": last24,
                "actual": actual,
            })

    lifecycle_factors = {
        lifecycle: round(max(0.2, min(2.5, quantile(values, 0.5, 1.0))), 2)
        for lifecycle, values in factor_samples.items()
    }
    for lifecycle in ["growth", "stable", "declining", "long_tail", "inactive", "rebound", "insufficient_history"]:
        lifecycle_factors.setdefault(lifecycle, 1.0)

    rows_by_model = defaultdict(list)
    residual_ratios = []
    for row in raw_cases:
        adjusted = row["base12"] * lifecycle_factors[row["lifecycle"]]
        predictions = {
            "last12_average": row["base12"],
            "last24_average": row["base24"],
            "lifecycle_adjusted": adjusted,
        }
        for model, predicted in predictions.items():
            rows_by_model[(row["horizon"], model)].append((predicted, row["actual"]))
        if adjusted > 0 and row["actual"] > 0:
            residual_ratios.append(row["actual"] / adjusted)

    metrics = []
    for (horizon, model), rows in sorted(rows_by_model.items()):
        errors = [predicted - actual for predicted, actual in rows]
        actuals = [actual for _, actual in rows]
        metrics.append({
            "horizonMonths": horizon,
            "model": model,
            "sampleCount": len(rows),
            "mae": round_bucket(float(np.mean([abs(error) for error in errors])) if errors else 0.0),
            "mape": round(safe_mape(errors, actuals) or 0.0, 4),
            "medianError": round_bucket(float(np.median(errors)) if errors else 0.0),
            "overCount": int(sum(1 for error in errors if error > 0)),
            "underCount": int(sum(1 for error in errors if error < 0)),
        })

    scenario_multipliers = {
        "base": 1.0,
        "pessimistic": round(max(0.2, min(1.0, quantile(residual_ratios, 0.25, 0.65))), 2),
        "optimistic": round(max(1.0, min(2.5, quantile(residual_ratios, 0.75, 1.25))), 2),
    }
    return {
        "lifecycleFactors": lifecycle_factors,
        "scenarioMultipliers": scenario_multipliers,
        "backtestMetrics": metrics,
        "sampleCount": len(raw_cases),
        "modelsTested": ["last12_average", "last24_average", "lifecycle_adjusted"],
    }, {
        "backtestCaseCount": len(raw_cases),
        "residualRatioCount": len(residual_ratios),
    }


def build_rating(summary: pd.DataFrame, forecast: dict) -> dict:
    factors = forecast["lifecycleFactors"]
    forecast12 = summary.apply(lambda row: (row.last12MonthRevenue / 12.0) * 12 * factors.get(row.lifecycle, 1.0), axis=1)
    score_amount = np.maximum(summary["last12MonthRevenue"].to_numpy(dtype=float), forecast12.to_numpy(dtype=float))
    score_amount = score_amount[score_amount > 0]

    percentile_breakpoints = {
        "S+": 0.99,
        "S": 0.95,
        "A": 0.85,
        "B": 0.65,
        "C": 0.40,
        "D": 0.20,
        "E": 0.0,
    }
    thresholds = {rating: round_bucket(quantile(score_amount, q)) for rating, q in percentile_breakpoints.items()}
    thresholds["E"] = 0.0

    def rating_for(value: float) -> str:
        for rating in ["S+", "S", "A", "B", "C", "D"]:
            if value >= thresholds[rating]:
                return rating
        return "E"

    labels = [rating_for(float(value)) for value in score_amount]
    counts = Counter(labels)
    total = len(labels)
    return {
        "method": "hybrid of last-12 historical revenue and 12-month lifecycle-adjusted forecast distribution",
        "absoluteAmountThresholdCandidates": thresholds,
        "percentileBreakpoints": percentile_breakpoints,
        "sampleShareByRating": {rating: round(counts.get(rating, 0) / total, 4) if total else 0.0 for rating in ["S+", "S", "A", "B", "C", "D", "E"]},
        "lowInvestmentBoundary": {"ratings": ["D", "E"], "thresholdUpperBound": thresholds["C"]},
        "highPriorityBoundary": {"ratings": ["S+", "S"], "thresholdLowerBound": thresholds["S"]},
        "newProductOldProductNote": "Old-product rating should not be treated as equivalent to new-product launch rating because it is driven by observed historical revenue and remaining-rights economics.",
        "externalEventLimit": "External event override should increase at most two rating levels and must require manual review.",
        "smallSampleFallback": "When history is below the insufficient-history threshold, use observe_only and manual_review_required instead of a high-confidence rating.",
    }


def build_risk_and_suggestion_rules(summary: pd.DataFrame, lifecycle_summary: dict) -> tuple[list[dict], list[dict]]:
    channel_threshold = round(max(0.6, min(0.95, quantile(summary["channelConcentration"], 0.9, 0.8))), 2)
    spike_share_threshold = round(max(0.45, min(0.9, quantile(summary["peakMonthShare"], 0.9, 0.7))), 2)
    expiring_count = int((summary["remainingCopyrightMonths"].fillna(9999) <= 12).sum())
    risk_rules = [
        {
            "code": "data_readiness",
            "trigger": "missing aggregate input, unresolved mapping, or incomplete master-data field required by the target evaluation",
            "severity": "high",
            "evidence": "M1 readiness and mapping confirmation status",
            "manualReviewRequired": True,
        },
        {
            "code": "revenue_decline",
            "trigger": f"recent6/prior6 ratio <= {lifecycle_summary['thresholds']['decliningRecent6Prior6Ratio']}",
            "severity": "medium",
            "evidence": "work-month aggregate trend",
            "manualReviewRequired": False,
        },
        {
            "code": "copyright_expiry",
            "trigger": "remaining copyright months <= 12",
            "severity": "high",
            "evidence": f"aggregate count={expiring_count}",
            "manualReviewRequired": True,
        },
        {
            "code": "insufficient_history",
            "trigger": f"history months < {lifecycle_summary['thresholds']['insufficientHistoryCompleteMonths']}",
            "severity": "medium",
            "evidence": "complete-month history count",
            "manualReviewRequired": True,
        },
        {
            "code": "business_form_mixed",
            "trigger": "standard work has both audio_copyright and audio_product revenue",
            "severity": "low",
            "evidence": f"aggregate count={int((summary['businessFormCount'] > 1).sum())}",
            "manualReviewRequired": False,
        },
        {
            "code": "inactive_tail",
            "trigger": "lifecycle in inactive or long_tail",
            "severity": "medium",
            "evidence": "calibrated lifecycle label",
            "manualReviewRequired": False,
        },
        {
            "code": "abnormal_spike",
            "trigger": f"peak month share >= {spike_share_threshold}",
            "severity": "medium",
            "evidence": f"aggregate count={int((summary['peakMonthShare'] >= spike_share_threshold).sum())}",
            "manualReviewRequired": True,
        },
        {
            "code": "buyout_or_oneoff_income",
            "trigger": f"peak month share >= {max(0.7, spike_share_threshold)} with otherwise sparse revenue",
            "severity": "medium",
            "evidence": "monthly concentration pattern; cannot confirm commercial type from bills alone",
            "manualReviewRequired": True,
        },
        {
            "code": "channel_concentration",
            "trigger": f"top channel share >= {channel_threshold}",
            "severity": "medium",
            "evidence": f"aggregate count={int((summary['channelConcentration'] >= channel_threshold).sum())}",
            "manualReviewRequired": False,
        },
        {
            "code": "mapping_uncertainty",
            "trigger": "raw work ID is invalid, unmapped, or belongs to a confirmed conflict group",
            "severity": "high",
            "evidence": "mapping candidate and operation confirmation material",
            "manualReviewRequired": True,
        },
        {
            "code": "incomplete_month_boundary",
            "trigger": "latest bill month is beyond latest confirmed complete month",
            "severity": "low",
            "evidence": "2026-05 is excluded from calibration cutoff",
            "manualReviewRequired": False,
        },
    ]
    suggestion_rules = [
        {
            "code": "promote",
            "trigger": "rating in S+/S or lifecycle=growth without high readiness risk",
            "priority": "high",
            "copyTemplate": "Prioritize additional operation resources after manual check confirms no one-off spike.",
            "manualReviewRequired": True,
        },
        {
            "code": "maintain",
            "trigger": "rating in A/B and lifecycle stable or modest growth",
            "priority": "medium",
            "copyTemplate": "Maintain baseline operation and monitor next complete-month trend.",
            "manualReviewRequired": False,
        },
        {
            "code": "reduce_investment",
            "trigger": "rating in C/D with declining or inactive signal",
            "priority": "medium",
            "copyTemplate": "Reduce incremental spend unless external event evidence is provided.",
            "manualReviewRequired": False,
        },
        {
            "code": "repackage",
            "trigger": "business_form_mixed or channel concentration risk with non-low revenue",
            "priority": "medium",
            "copyTemplate": "Review package positioning across business forms and top channels.",
            "manualReviewRequired": True,
        },
        {
            "code": "pricing_or_channel_adjustment",
            "trigger": "long_tail or rebound with channel concentration below risk threshold",
            "priority": "medium",
            "copyTemplate": "Test price or channel adjustment in a controlled non-formal plan.",
            "manualReviewRequired": True,
        },
        {
            "code": "renewal_review",
            "trigger": "copyright_expiry risk and rating not below C",
            "priority": "high",
            "copyTemplate": "Review renewal economics before further resource allocation.",
            "manualReviewRequired": True,
        },
        {
            "code": "observe_only",
            "trigger": "insufficient_history or incomplete_month_boundary dominates evidence",
            "priority": "low",
            "copyTemplate": "Observe until more complete months are available.",
            "manualReviewRequired": False,
        },
        {
            "code": "downlist_or_suspend",
            "trigger": "rating E, inactive lifecycle, and no renewal or event support",
            "priority": "medium",
            "copyTemplate": "Consider downlisting or suspension only after manual confirmation.",
            "manualReviewRequired": True,
        },
        {
            "code": "manual_review_required",
            "trigger": "mapping_uncertainty, abnormal_spike, buyout_or_oneoff_income, or copyright conflict",
            "priority": "high",
            "copyTemplate": "Route to operations review before any formal action.",
            "manualReviewRequired": True,
        },
    ]
    return risk_rules, suggestion_rules


def summarize_population(frame: pd.DataFrame, summary: pd.DataFrame, latest_complete_month: str, work_month_stats: dict, master_stats: dict, selection: SourceSelection) -> dict:
    valid = frame[frame["validForCalibration"]].copy()
    complete = valid[valid["billMonth"] <= latest_complete_month]
    amount = complete["amount"]
    positive_last12 = summary.loc[summary["last12MonthRevenue"] > 0, "last12MonthRevenue"]
    total_positive = summary["totalHistoricalRevenue"].clip(lower=0.0)
    long_tail_cutoff = quantile(positive_last12, 0.25)
    return {
        "sourceDictionary": {
            "realBillWorkbookCount": selection.real_bill_files,
            "masterDataWorkbookCount": selection.master_data_files,
            "mappingCandidateFileCount": selection.mapping_files,
            "operationsConfirmationRelatedFileCount": selection.operations_files,
            "selectedMappingRows": selection.selected_mapping_rows,
            "realBillColumns": REAL_BILL_COLUMNS,
            "masterDataColumnsUsed": MASTER_COLUMNS,
        },
        "dataScale": {
            "rawBillRowsRead": int(len(frame)),
            "validCalibrationRows": int(len(valid)),
            "completeCalibrationRows": int(len(complete)),
            "workCount": int(summary["standardWorkId"].nunique()),
            "workMonthBusinessFormRows": work_month_stats["workMonthRows"],
            "monthRange": [str(valid["billMonth"].min()), str(valid["billMonth"].max())],
            "latestCompleteMonthCandidate": latest_complete_month,
            "incompleteMonthsExcluded": sorted(m for m in valid["billMonth"].dropna().unique() if m in KNOWN_INCOMPLETE_MONTHS),
            "businessFormCount": int(valid["businessForm"].nunique()),
            "businessFormDistribution": {key: int(value) for key, value in valid["businessForm"].value_counts().to_dict().items()},
        },
        "dataQuality": {
            "invalidOrUnmappedRowCount": int((~frame["validForCalibration"]).sum()),
            "mappingAppliedRowCount": int(frame["mappingApplied"].sum()),
            "rowsWithChannelId": int(frame["channelIdPresent"].sum()),
            "copyrightEndDateUnambiguousWorkCount": master_stats["unambiguousWorks"],
            "copyrightDateConflictWorkCount": master_stats["conflictWorks"],
        },
        "distribution": {
            "totalHistoricalRevenueQuantiles": {
                "p20": round_bucket(quantile(total_positive, 0.20)),
                "p40": round_bucket(quantile(total_positive, 0.40)),
                "p65": round_bucket(quantile(total_positive, 0.65)),
                "p85": round_bucket(quantile(total_positive, 0.85)),
                "p95": round_bucket(quantile(total_positive, 0.95)),
                "p99": round_bucket(quantile(total_positive, 0.99)),
            },
            "last12RevenueQuantiles": {
                "p20": round_bucket(quantile(positive_last12, 0.20)),
                "p40": round_bucket(quantile(positive_last12, 0.40)),
                "p65": round_bucket(quantile(positive_last12, 0.65)),
                "p85": round_bucket(quantile(positive_last12, 0.85)),
                "p95": round_bucket(quantile(positive_last12, 0.95)),
                "p99": round_bucket(quantile(positive_last12, 0.99)),
            },
            "zeroRevenueWorkShare": round(float((summary["last12MonthRevenue"] <= 0).mean()), 4),
            "longTailWorkShareCandidate": round(float(((summary["last12MonthRevenue"] > 0) & (summary["last12MonthRevenue"] <= long_tail_cutoff)).mean()), 4),
            "channelConcentrationQuantiles": {
                "p50": round(float(quantile(summary["channelConcentration"], 0.50)), 4),
                "p75": round(float(quantile(summary["channelConcentration"], 0.75)), 4),
                "p90": round(float(quantile(summary["channelConcentration"], 0.90)), 4),
            },
            "remainingCopyrightMonthsQuantiles": {
                "p25": round(float(quantile(summary["remainingCopyrightMonths"].dropna(), 0.25)), 2),
                "p50": round(float(quantile(summary["remainingCopyrightMonths"].dropna(), 0.50)), 2),
                "p75": round(float(quantile(summary["remainingCopyrightMonths"].dropna(), 0.75)), 2),
            },
            "amountSignRowDistribution": {key: int(value) for key, value in pd.cut(amount, [-np.inf, -1e-9, 1e-9, np.inf], labels=["negative", "zero", "positive"]).value_counts().to_dict().items()},
        },
    }


def write_parameters(summary_payload: dict):
    parameters = {
        "version": "m2-c0-cleaned-bill-nonformal-v0.1",
        "nonFormalCalibration": True,
        "realDataAggregated": True,
        "notForFormalDecision": True,
        "sourceBoundary": {
            "aggregateOnly": True,
            "rawDetailIncluded": False,
            "realWorkNamesIncluded": False,
            "realAuthorNamesIncluded": False,
            "realChannelNamesIncluded": False,
        },
        "latestCompleteMonth": summary_payload["population"]["dataScale"]["latestCompleteMonthCandidate"],
        "lifecycle": summary_payload["lifecycleCalibration"]["thresholds"],
        "forecast": {
            "recommendedBaseModel": "lifecycle_adjusted",
            "modelsTested": summary_payload["forecastCalibration"]["modelsTested"],
            "lifecycleFactors": summary_payload["forecastCalibration"]["lifecycleFactors"],
            "scenarioMultipliers": summary_payload["forecastCalibration"]["scenarioMultipliers"],
        },
        "rating": summary_payload["ratingCalibration"],
        "riskRules": summary_payload["riskRules"],
        "suggestionRules": summary_payload["suggestionRules"],
    }
    js = (
        "// Non-formal M2-C-0 aggregate calibration parameters.\n"
        "// Generated from aggregate-only local analysis. Do not use as formal business rules.\n"
        "export const M2_C0_CLEANED_BILL_CALIBRATED_PARAMETERS = Object.freeze("
        + json.dumps(parameters, ensure_ascii=False, indent=2)
        + ");\n"
    )
    PARAMETERS_FILE.write_text(js, encoding="utf-8")


def main():
    bill_path, master_path, mapping, selection = discover_sources()
    bill = read_bill_frame(bill_path, mapping)
    valid_months = sorted(m for m in bill["billMonth"].dropna().unique())
    if not valid_months:
        raise SystemExit("No valid bill months found.")
    max_month = valid_months[-1]
    latest_complete_month = add_months(max_month, -1) if max_month in KNOWN_INCOMPLETE_MONTHS else max_month

    master_dates, master_stats = read_master_dates(master_path)
    work_summary, work_month_stats = build_work_summary(bill, master_dates, latest_complete_month)
    work_summary, lifecycle = calibrate_lifecycle(work_summary)
    forecast, forecast_internal = build_forecast_backtests(bill, lifecycle, latest_complete_month)
    rating = build_rating(work_summary, forecast)
    risk_rules, suggestion_rules = build_risk_and_suggestion_rules(work_summary, lifecycle)
    population = summarize_population(bill, work_summary, latest_complete_month, work_month_stats, master_stats, selection)

    payload = {
        "schema": "m2.c0.cleaned_bill.aggregate_calibration_summary.v0.1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "currentHead": git_value(["rev-parse", "HEAD"]),
        "originMain": (git_value(["ls-remote", "origin", "refs/heads/main"]) or "").split("\t")[0] or None,
        "worktreeCleanAtStart": True,
        "realCleanedBillRead": True,
        "copyrightLedgerRead": True,
        "operationsConfirmationRead": True,
        "dataDirectoryRead": True,
        "rawDataCommitted": False,
        "rawDetailWrittenToReport": False,
        "databaseConnected": False,
        "dockerExecuted": False,
        "migrationModified": False,
        "mappingVersionActivated": False,
        "switchMappingVersionCalled": False,
        "formalEvaluationExecuted": False,
        "aggregateOnlyReport": True,
        "population": population,
        "lifecycleCalibration": lifecycle,
        "forecastCalibration": forecast,
        "forecastInternal": forecast_internal,
        "ratingCalibration": rating,
        "riskRules": risk_rules,
        "suggestionRules": suggestion_rules,
        "calibratedParametersCreated": True,
        "fixtureEngineUpdated": False,
        "prohibitedActionsConfirmed": {
            "rawRealBillsCommitted": False,
            "rawLedgerCommitted": False,
            "operationsWorkbookCommitted": False,
            "databaseConnected": False,
            "dockerExecuted": False,
            "dbMigrationsModified": False,
            "writeApiAdded": False,
            "exportApiAdded": False,
            "evaluationTaskApiAdded": False,
            "formalModeAdded": False,
            "localDryRunModeAdded": False,
        },
    }
    OUTPUT_SUMMARY.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_SUMMARY.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    write_parameters(payload)
    print(json.dumps({
        "status": "pass",
        "aggregateSummary": OUTPUT_SUMMARY.as_posix(),
        "parametersFile": PARAMETERS_FILE.as_posix(),
        "workCount": population["dataScale"]["workCount"],
        "latestCompleteMonth": latest_complete_month,
        "rawDetailWritten": False,
        "databaseConnected": False,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
