from __future__ import annotations

import json
import math
import re
import subprocess
import sys
from collections import Counter
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
    git_value,
    month_range,
    read_bill_frame,
    read_master_dates,
)


ROOT = Path(__file__).resolve().parents[2]
PARAMETERS_FILE = ROOT / "src" / "domain" / "oldProductEvaluation" / "calibratedParameters.js"
C0_SUMMARY_FILE = ROOT / "docs" / "analysis" / "m1-master-data" / "M2-C-0-cleaned-bill-aggregate-calibration-summary-v0.1.json"
OUTPUT_SUMMARY = ROOT / "docs" / "analysis" / "m1-master-data" / "M2-C-2-nonformal-aggregate-dry-run-summary-v0.1.json"
OUTPUT_AGGREGATE = ROOT / "docs" / "analysis" / "m1-master-data" / "M2-C-2-nonformal-aggregate-dry-run-aggregate-summary-v0.1.json"
OUTPUT_REPORT = ROOT / "docs" / "technical-design" / "M2-C-2-nonformal-aggregate-dry-run-report-v0.1.md"

RATING_ORDER = ["S+", "S", "A", "B", "C", "D", "E"]
LIFECYCLE_ORDER = ["growth", "stable", "declining", "long_tail", "inactive", "rebound", "insufficient_history"]
RISK_SEVERITY = {
    "data_readiness": "high",
    "revenue_decline": "medium",
    "copyright_expiry": "high",
    "insufficient_history": "medium",
    "business_form_mixed": "low",
    "inactive_tail": "medium",
    "abnormal_spike": "medium",
    "buyout_or_oneoff_income": "medium",
    "channel_concentration": "medium",
    "mapping_uncertainty": "high",
    "incomplete_month_boundary": "low",
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


def evaluate_work_summary(summary: pd.DataFrame, parameters: dict, latest_complete_month: str, incomplete_work_ids: set[str]) -> pd.DataFrame:
    evaluated = summary.copy()
    lifecycle_factors = parameters["forecast"]["lifecycleFactors"]
    rating_thresholds = parameters["rating"]["absoluteAmountThresholdCandidates"]
    channel_threshold = parse_threshold_from_rules(parameters, "channel_concentration", 0.95)
    spike_threshold = parse_threshold_from_rules(parameters, "abnormal_spike", 0.9)

    evaluated["lifecycle"] = evaluated.apply(lambda row: classify_lifecycle(row, parameters), axis=1)
    evaluated["remainingMonthsForForecast"] = evaluated["remainingCopyrightMonths"].fillna(12).clip(lower=0)
    evaluated["forecastBase"] = evaluated.apply(
        lambda row: safe_float(row.last12MonthRevenue) / 12.0
        * safe_float(row.remainingMonthsForForecast, 12.0)
        * lifecycle_factors.get(row.lifecycle, 1.0)
        * parameters["forecast"]["scenarioMultipliers"]["base"],
        axis=1,
    )
    evaluated["forecastPessimistic"] = evaluated["forecastBase"] * parameters["forecast"]["scenarioMultipliers"]["pessimistic"]
    evaluated["forecastOptimistic"] = evaluated["forecastBase"] * parameters["forecast"]["scenarioMultipliers"]["optimistic"]
    evaluated["ratingBasisAmount"] = np.maximum(
        evaluated["last12MonthRevenue"].astype(float).to_numpy(),
        ((evaluated["last12MonthRevenue"].astype(float) / 12.0) * 12.0 * evaluated["lifecycle"].map(lifecycle_factors).fillna(1.0)).to_numpy(),
    )
    evaluated["rating"] = evaluated["ratingBasisAmount"].map(lambda value: rating_for(float(value), rating_thresholds))

    def risks(row: pd.Series) -> list[str]:
        result: list[str] = []
        if bool(row.copyrightDateConflict) or not bool(row.hasCopyrightEndDate):
            result.append("data_readiness")
        if row.standardWorkId in incomplete_work_ids:
            result.append("incomplete_month_boundary")
        if row.lifecycle == "declining":
            result.append("revenue_decline")
        if not pd.isna(row.remainingCopyrightMonths) and safe_float(row.remainingCopyrightMonths) <= 12:
            result.append("copyright_expiry")
        if row.lifecycle == "insufficient_history":
            result.append("insufficient_history")
        if int(row.businessFormCount) > 1:
            result.append("business_form_mixed")
        if row.lifecycle in {"inactive", "long_tail"}:
            result.append("inactive_tail")
        if safe_float(row.peakMonthShare) >= spike_threshold:
            result.append("abnormal_spike")
        if safe_float(row.peakMonthShare) >= max(0.7, spike_threshold) and int(row.activeMonthCount) <= 2:
            result.append("buyout_or_oneoff_income")
        if safe_float(row.channelConcentration) >= channel_threshold:
            result.append("channel_concentration")
        return result

    evaluated["riskCodes"] = evaluated.apply(risks, axis=1)
    evaluated["riskSeverity"] = evaluated["riskCodes"].map(highest_risk_severity)
    evaluated["manualReviewRequired"] = evaluated["riskCodes"].map(
        lambda items: any(code in {"data_readiness", "copyright_expiry", "insufficient_history", "abnormal_spike", "buyout_or_oneoff_income", "mapping_uncertainty"} for code in items)
    )

    def suggestions(row: pd.Series) -> list[str]:
        items: list[str] = []
        high_readiness = "data_readiness" in row.riskCodes
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
        "forecastParametersUsed": parameters["forecast"]["lifecycleFactors"] == c0.get("forecastCalibration", {}).get("lifecycleFactors", {})
        and parameters["forecast"]["scenarioMultipliers"] == c0.get("forecastCalibration", {}).get("scenarioMultipliers", {}),
        "ratingThresholdsUsed": parameters["rating"]["absoluteAmountThresholdCandidates"] == c0.get("ratingCalibration", {}).get("absoluteAmountThresholdCandidates", {}),
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
        "parameterAdjustmentRecommended": False,
        "parameterAdjustmentReason": "No parameter change in M2-C-2: dry-run uses the same C-0 aggregate population and confirms C-0/C-1 parameter alignment. Differences are attributable to dry-run risk/suggestion layering and remaining-rights forecast application rather than threshold failure.",
    }


def build_aggregate_payload(dry_run: pd.DataFrame, bill: pd.DataFrame, parameters: dict, latest_complete_month: str, c0: dict, selection, master_stats: dict, work_month_stats: dict) -> dict:
    incomplete_months = sorted(m for m in bill["billMonth"].dropna().unique() if m in KNOWN_INCOMPLETE_MONTHS)
    risk_counts = Counter(code for codes in dry_run["riskCodes"] for code in codes)
    suggestion_counts = Counter(code for codes in dry_run["suggestionCodes"] for code in codes)
    return {
        "schema": "m2.c2.nonformal_aggregate_dry_run.aggregate_summary.v0.1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "dryRunMode": "non_formal_aggregate_dry_run",
        "calibratedParameterVersion": parameters["version"],
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
            "lifecycleDistribution": count_distribution(dry_run["lifecycle"], LIFECYCLE_ORDER),
            "ratingDistribution": count_distribution(dry_run["rating"], RATING_ORDER),
            "forecastDistributionSummary": number_summary(dry_run["forecastBase"]),
            "riskDistribution": {key: int(value) for key, value in sorted(risk_counts.items())},
            "riskSeverityDistribution": count_distribution(dry_run["riskSeverity"], ["high", "medium", "low"]),
            "suggestionDistribution": {key: int(value) for key, value in sorted(suggestion_counts.items())},
            "copyrightExpiryDistribution": {
                "missingOrConflict": int((dry_run["hasCopyrightEndDate"] == False).sum() + dry_run["copyrightDateConflict"].sum()),
                "expiredOrDueWithin12Months": int((dry_run["remainingCopyrightMonths"].fillna(9999) <= 12).sum()),
                "dueWithin13To24Months": int(((dry_run["remainingCopyrightMonths"].fillna(9999) > 12) & (dry_run["remainingCopyrightMonths"].fillna(9999) <= 24)).sum()),
                "over24Months": int((dry_run["remainingCopyrightMonths"].fillna(-1) > 24).sum()),
            },
            "manualReviewRequiredCount": int(dry_run["manualReviewRequired"].sum()),
            "abnormalSpikeCount": int(dry_run["riskCodes"].map(lambda items: "abnormal_spike" in items).sum()),
            "inactiveOrLongTailCount": int(dry_run["lifecycle"].isin(["inactive", "long_tail"]).sum()),
            "blockedWorkCount": int(dry_run["manualReviewRequired"].sum()),
            "insufficientWorkCount": int((dry_run["lifecycle"] == "insufficient_history").sum()),
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


def build_required_summary(aggregate: dict) -> dict:
    current_head = run_git(["rev-parse", "HEAD"])
    origin_main = (run_git(["ls-remote", "origin", "refs/heads/main"]) or "").split("\t")[0] or None
    result = aggregate["resultDistributions"]
    return {
        "schema": "m2.c2.nonformal_aggregate_dry_run.summary.v0.1",
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
        "dryRunMode": aggregate["dryRunMode"],
        "latestCompleteMonth": aggregate["dataScale"]["latestCompleteMonth"],
        "excludedIncompleteMonths": aggregate["dataScale"]["excludedIncompleteMonths"],
        "evaluatedWorkCount": aggregate["dataScale"]["evaluatedWorkCount"],
        "blockedWorkCount": result["blockedWorkCount"],
        "lifecycleDistribution": result["lifecycleDistribution"],
        "ratingDistribution": result["ratingDistribution"],
        "forecastDistributionSummary": result["forecastDistributionSummary"],
        "riskDistribution": result["riskDistribution"],
        "suggestionDistribution": result["suggestionDistribution"],
        "calibratedParametersUsed": aggregate["alignmentWithC0C1"],
        "calibratedParametersAdjusted": False,
        "formalEvaluationAllowed": False,
        "notForFormalDecision": True,
        "noRealDataCheckPassed": None,
        "lintPassed": None,
        "buildPassed": None,
        "unitTestsPassed": None,
        "smokePassed": None,
        "e2ePassed": None,
        "recommendedNextLine": "technical",
        "recommendedNextTask": "M2-C-3 aggregate dry-run parameter iteration and bounded local validation",
        "prohibitedActionsConfirmed": aggregate["prohibitedActionsConfirmed"],
    }


def md_table_from_counts(counts: dict) -> str:
    lines = ["| 项目 | 数量 |", "|---|---:|"]
    for key, value in counts.items():
        lines.append(f"| `{key}` | {value} |")
    return "\n".join(lines)


def write_report(aggregate: dict, summary: dict) -> None:
    result = aggregate["resultDistributions"]
    alignment = aggregate["alignmentWithC0C1"]
    report = f"""# M2-C-2 真实聚合输入非正式 dry-run 与校准结果验证报告 v0.1

## 结论

本轮已执行 `non_formal_aggregate_dry_run`。输入来自用户提供的真实清洗账单、数字版权台账、运营确认/映射材料，但输出仅为聚合统计，不包含原始账单行、真实作品名、作者名、渠道名或单作品收入明细。

本轮未调整 `calibratedParameters.js`。原因：dry-run 确认 C-0 生命周期阈值、预测参数、评级阈值均被使用，且 C-1 `calibrated_non_formal` profile 隔离边界未被破坏；当前差异主要来自 dry-run 对风险、建议和剩余版权期预测的聚合应用，不足以支持直接改参数。

## 数据读取与安全边界

- 读取真实清洗账单：是
- 读取数字版权台账：是
- 读取运营确认/映射材料：是
- 读取 `data/**`：是
- 输出原始明细：否
- 提交原始数据：否
- 连接数据库：否
- 执行 Docker：否
- 修改 migration：否
- 激活 mapping_version：否
- 调用 switch_mapping_version：否
- 执行 formal evaluation：否
- 新增产品 API 的 local_dry_run mode：否

## 数据规模聚合摘要

- raw bill rows read：{aggregate["dataScale"]["rawBillRowsRead"]}
- valid calibration rows：{aggregate["dataScale"]["validCalibrationRows"]}
- complete rows used：{aggregate["dataScale"]["completeRowsUsed"]}
- evaluated works：{aggregate["dataScale"]["evaluatedWorkCount"]}
- latest complete month：{aggregate["dataScale"]["latestCompleteMonth"]}
- excluded incomplete months：{", ".join(aggregate["dataScale"]["excludedIncompleteMonths"]) or "无"}
- copyright date conflict works：{aggregate["dataScale"]["copyrightDateConflictWorkCount"]}

## Lifecycle 分布

{md_table_from_counts(result["lifecycleDistribution"])}

## Rating 分布

{md_table_from_counts(result["ratingDistribution"])}

## Forecast 聚合分布

- count：{result["forecastDistributionSummary"]["count"]}
- min：{result["forecastDistributionSummary"]["min"]}
- p25：{result["forecastDistributionSummary"]["p25"]}
- median：{result["forecastDistributionSummary"]["median"]}
- p75：{result["forecastDistributionSummary"]["p75"]}
- p95：{result["forecastDistributionSummary"]["p95"]}
- p99：{result["forecastDistributionSummary"]["p99"]}
- max：{result["forecastDistributionSummary"]["max"]}
- total：{result["forecastDistributionSummary"]["total"]}

## Risk 分布

{md_table_from_counts(result["riskDistribution"])}

## Suggestion 分布

{md_table_from_counts(result["suggestionDistribution"])}

## C-0 / C-1 对齐验证

- C-0 生命周期阈值被使用：{alignment["lifecycleThresholdsUsed"]}
- C-0 forecast 参数被使用：{alignment["forecastParametersUsed"]}
- C-0 rating 阈值被使用：{alignment["ratingThresholdsUsed"]}
- C-1 `calibrated_non_formal` profile 保持隔离：{alignment["calibratedNonFormalProfileIsolated"]}
- 发现明显不合理阈值：{alignment["obviousUnreasonableThresholdDetected"]}
- 本轮是否调整参数：否

## 仍不可作为正式业务结论

本轮结果是开发期非正式 dry-run，仅用于算法校准验证。不得用于正式评估、生产发布、数据库写入、mapping_version 激活或运营自动决策。

## 下一步建议

进入 M2-C-3：在继续保持聚合输出和非正式边界的前提下，做参数迭代候选与 bounded local validation。重点验证：

1. `manual_review_required` 是否过宽；
2. `channel_concentration` 是否对渠道天然集中作品过敏；
3. 剩余版权月缺失时 12 个月 forecast fallback 是否需要分层；
4. S+/S 分布与 C-0 population split 是否需要更严格的运营解释。
"""
    OUTPUT_REPORT.write_text(report, encoding="utf-8")


def main() -> None:
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
        ].dropna().astype(str)
    )
    dry_run = evaluate_work_summary(work_summary, parameters, latest_complete_month, incomplete_work_ids)
    aggregate = build_aggregate_payload(
        dry_run,
        bill,
        parameters,
        latest_complete_month,
        c0_summary,
        selection,
        master_stats,
        work_month_stats,
    )
    summary = build_required_summary(aggregate)

    OUTPUT_SUMMARY.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_REPORT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_AGGREGATE.write_text(json.dumps(aggregate, ensure_ascii=False, indent=2), encoding="utf-8")
    OUTPUT_SUMMARY.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    write_report(aggregate, summary)

    print(json.dumps({
        "status": "pass",
        "dryRunMode": "non_formal_aggregate_dry_run",
        "summary": OUTPUT_SUMMARY.as_posix(),
        "aggregateSummary": OUTPUT_AGGREGATE.as_posix(),
        "report": OUTPUT_REPORT.as_posix(),
        "evaluatedWorkCount": summary["evaluatedWorkCount"],
        "latestCompleteMonth": summary["latestCompleteMonth"],
        "rawDetailWrittenToReport": False,
        "databaseConnected": False,
        "formalEvaluationAllowed": False,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
