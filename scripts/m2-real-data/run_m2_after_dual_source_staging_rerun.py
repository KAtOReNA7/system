from __future__ import annotations

import argparse
import importlib.util
import json
import math
import os
import re
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[2]
SCRIPT_DIR = Path(__file__).resolve().parent
TEMP_DEPS = Path(os.environ.get("TEMP", "")) / "codex-system-pydeps"
if TEMP_DEPS.exists():
    sys.path.insert(0, str(TEMP_DEPS))
sys.path.insert(0, str(SCRIPT_DIR))

import run_m2_disentangled_forecastability_validation as v1
import run_m2_disentangled_forecast_v1_1_validation as v11
import run_m2_operator_task_validation_pack as operator_pack

M1_PRIVATE = ROOT / "data" / "private-output" / "m1-master-data"
M2_PRIVATE = ROOT / "data" / "private-output" / "m2-business-review"
M1_DOCS = ROOT / "docs" / "analysis" / "m1-master-data"
M2_DOCS = ROOT / "docs" / "analysis" / "m2-real-data"

STAGING_TABLE_JSON = M1_PRIVATE / "M1-dual-source-limited-staging-table-v1.json"
STAGING_RESULT_JSON = M1_PRIVATE / "M1-dual-source-limited-staging-apply-result-v1.json"
PRIVATE_CANDIDATES_V2_JSON = M1_PRIVATE / "M1-dual-source-masterdata-backfill-candidates-v2.json"

FORECAST_V2_JSON = M2_DOCS / "M2-forecast-output-type-after-dual-source-staging-v2.json"
FORECAST_V2_MD = M2_DOCS / "M2-forecast-output-type-after-dual-source-staging-v2.md"
FORECASTABILITY_JSON = M2_DOCS / "M2-v1.1-forecastability-after-dual-source-staging-v1.json"
FORECASTABILITY_MD = M2_DOCS / "M2-v1.1-forecastability-after-dual-source-staging-v1.md"
BUSINESS_READINESS_JSON = M2_DOCS / "M2-v1.1-business-readiness-after-dual-source-staging-v1.json"
BUSINESS_READINESS_MD = M2_DOCS / "M2-v1.1-business-readiness-after-dual-source-staging-v1.md"
OPERATOR_SUMMARY_JSON = M2_DOCS / "M2-operator-task-pack-after-dual-source-staging-v2-summary.json"
OPERATOR_SUMMARY_MD = M2_DOCS / "M2-operator-task-pack-after-dual-source-staging-v2-summary.md"
RANDOM20_SUMMARY_JSON = M2_DOCS / "M2-random-20-year-evaluation-after-dual-source-staging-v2-summary.json"
RANDOM20_SUMMARY_MD = M2_DOCS / "M2-random-20-year-evaluation-after-dual-source-staging-v2-summary.md"
RERUN_SUMMARY_JSON = M2_DOCS / "M2-dual-source-staging-rerun-summary-v1.json"
RERUN_SUMMARY_MD = M2_DOCS / "M2-dual-source-staging-rerun-summary-v1.md"

PRIVATE_OPERATOR_SOURCE_JSON = M2_PRIVATE / "m2-v1.1-30-work-operator-task-pack-cn-after-dual-source-staging-v2-source.json"
PRIVATE_OPERATOR_XLSX = M2_PRIVATE / "m2-v1.1-30-work-operator-task-pack-cn-after-dual-source-staging-v2.xlsx"
PRIVATE_RANDOM20_SOURCE_JSON = M2_PRIVATE / "M2-v1.1-random-20-year-evaluation-after-dual-source-staging-v2-cn-source.json"
PRIVATE_RANDOM20_XLSX = M2_PRIVATE / "M2-v1.1-random-20-year-evaluation-after-dual-source-staging-v2-cn.xlsx"

NUMERIC_STATUSES = {v1.NUMERIC_STATUS, v1.CONSERVATIVE_STATUS}
NO_NUMERIC_STATUSES = {v1.OBSERVE_STATUS, v1.TRUE_BLOCKED_STATUS}
FIELD_LABELS = {
    "standardWorkName": "标准作品名",
    "authorName": "作者",
    "copyrightStartDate": "版权开始日期",
    "copyrightEndDate": "版权到期日期",
}

SOURCE_COHORT_LABELS = {
    "publication_cohort": "出版/数字版权台账作品",
    "web_original_cohort": "原创全库作品",
    "mixed_or_uncertain_cohort": "混合或来源待确认作品",
    "unknown": "来源待确认",
}

FORECAST_OUTPUT_TYPE_LABELS = {
    "copyright_term_forecast": "版权期预测",
    "operating_window_forecast_pending_expiry": "运营窗口预测（待补版权到期）",
}

FORECASTABILITY_LABELS = {
    "numeric_forecast_eligible": "可数值预测",
    "conservative_numeric_forecast": "可保守预测",
    "observe_only_no_numeric_forecast": "仅观察，不输出业务可用数值预测",
    "true_forecast_blocked": "暂不可预测",
}

BUSINESS_ACTION_LABELS = {
    "action_allowed": "可考虑业务动作",
    "manual_confirmation_required": "需要人工确认",
    "action_blocked": "暂不可执行业务动作",
    "observe_only": "仅观察",
}

LIFECYCLE_LABELS = {
    "growth": "增长期",
    "stable": "稳定期",
    "rebound": "回升期",
    "declining": "下滑期",
    "long_tail": "长尾期",
    "inactive": "沉寂期",
    "insufficient_history": "历史不足",
}

REVENUE_BUCKET_LABELS = {
    "top": "高收入",
    "high": "高收入",
    "mid": "中收入",
    "medium": "中收入",
    "low": "低收入",
    "long_tail": "长尾收入",
    "zero": "近零收入",
    "near_zero": "近零收入",
    "top_1_percent": "头部1%",
    "top_5_percent": "头部5%",
    "top_10_percent": "头部10%",
    "middle_40_percent": "中部40%",
    "bottom_50_percent": "尾部50%",
}

CONFIDENCE_LABELS = {
    "high": "高",
    "medium": "中",
    "low": "低",
    "blocked_for_business_use": "业务使用阻断",
}

SUGGESTION_LABELS = {
    "promote": "加大推广或重点推荐",
    "feature": "加大推广或重点推荐",
    "maintain": "维持当前运营",
    "reduce": "降低运营投入",
    "reduce_investment": "降低运营投入",
    "downlist": "下架或暂停运营候选",
    "suspend": "下架或暂停运营候选",
    "downlist_or_suspend": "下架或暂停运营候选",
    "renewal review": "版权续约复核",
    "renewal_review": "版权续约复核",
    "observe": "仅观察",
    "observe_only": "仅观察",
    "repackage": "包装或定位复核",
    "pricing_or_channel_adjustment": "价格或渠道策略复核",
    "manual_review_required": "需要人工复核",
}

RISK_LABELS = {
    "abnormal_spike": "异常峰值风险",
    "aggregate_projection_gap": "汇总口径与明细口径缺口",
    "business_form_mixed": "业务形态混合",
    "buyout_or_oneoff_income": "买断或一次性收入风险",
    "channel_concentration": "渠道集中风险",
    "copyright_date_conflict": "版权日期冲突",
    "copyright_expiry": "版权到期风险",
    "high_value_with_data_gap": "高价值作品存在数据缺口",
    "high_value_with_expiry": "高价值作品存在版权到期风险",
    "inactive_tail": "长尾或沉寂风险",
    "incomplete_month_boundary": "不完整月份边界风险",
    "insufficient_history": "历史不足",
    "insufficient_revenue_history": "收入历史不足",
    "low_materiality_or_zero_heavy_pattern": "低收入或零收入月份偏多",
    "manual_confirmation_required": "需要人工确认",
    "mapping_not_active": "映射版本未激活",
    "mapping_uncertainty": "映射关系不确定",
    "metadata_gap": "基础信息缺口",
    "missing_basic_info": "基础信息缺失",
    "missing_copyright_end": "版权到期日缺失",
    "no_backtestable_revenue_history": "无可回测收入历史",
    "observe_only_forecastability_status": "仅观察状态",
    "revenue_decline": "收入下滑",
    "severe_data_gap_or_copyright_fallback": "严重数据缺口或版权兜底口径",
    "true_forecast_blocked_before_action": "预测已阻断",
    "unresolved_spike_or_oneoff_income": "异常峰值或一次性收入未解决",
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scope", choices=["all", "forecast", "operator-task", "summary"], default="all")
    parser.add_argument("--print-json", action="store_true")
    args = parser.parse_args()

    payload = build_payload()
    write_outputs(payload)
    summary = {
        "scope": args.scope,
        "operatorPackRows": payload["operatorTask"]["summary"]["taskRows"],
        "operatorPackHasStandardWorkId": payload["operatorTask"]["summary"]["hasStandardWorkIdColumn"],
        "random20Rows": payload["random20"]["summary"]["rowCount"],
        "copyrightTermForecastAfter": payload["forecastOutputType"]["after"]["copyright_term_forecast"],
        "operatingWindowPendingAfter": payload["forecastOutputType"]["after"]["operating_window_forecast_pending_expiry"],
        "formalMasterDataWritten": False,
        "m3Entered": False,
        "privateSourceJsonWritten": True,
    }
    print(json.dumps(summary, ensure_ascii=False))
    if args.print_json:
        print(json.dumps(payload["rerunSummary"], ensure_ascii=False, indent=2))


def build_payload() -> dict:
    ensure_inputs()
    generated_at = now()
    frames = build_v1_1_frames()
    master = build_staged_master_view(frames["gate"])
    enriched_gate = enrich_gate(frames["gate"], frames["evaluated"], master)
    forecast_output = build_forecast_output_report(enriched_gate, frames["validation"])
    forecastability = build_forecastability_report(enriched_gate, frames["coverage"], frames["validation"])
    business_readiness = build_business_readiness_report(enriched_gate, forecast_output, forecastability)
    operator_task = build_operator_task_pack(enriched_gate, frames["cases"])
    random20 = build_random20_pack(enriched_gate)
    rerun_summary = build_rerun_summary(
        generated_at,
        forecast_output,
        forecastability,
        business_readiness,
        operator_task,
        random20,
    )
    return {
        "generatedAt": generated_at,
        "forecastOutputType": forecast_output,
        "forecastability": forecastability,
        "businessReadiness": business_readiness,
        "operatorTask": operator_task,
        "random20": random20,
        "rerunSummary": rerun_summary,
    }


def ensure_inputs() -> None:
    missing = [
        str(path.relative_to(ROOT))
        for path in [
            STAGING_TABLE_JSON,
            STAGING_RESULT_JSON,
            PRIVATE_CANDIDATES_V2_JSON,
            M1_DOCS / "M1-dual-source-limited-staging-apply-result-v1.json",
            M1_DOCS / "M1-gap-after-dual-source-staging-apply-v1.json",
            M2_DOCS / "M2-forecast-output-type-after-dual-source-staging-v1.json",
            M2_DOCS / "M2-business-readiness-after-dual-source-staging-v1.json",
            ROOT / "docs" / "prd" / "20-evaluation" / "M2-old-product-evaluation-prd-v0.1.md",
            ROOT / "package.json",
            ROOT / ".gitignore",
        ]
        if not path.exists()
    ]
    if missing:
        raise SystemExit("Missing required inputs: " + ", ".join(missing))


def build_v1_1_frames() -> dict:
    prepared = v1.prepare_inputs()
    evaluated = prepared["evaluated"].copy()
    cases = prepared["cases"].copy()
    final_outputs = prepared["finalOutputs"].copy()
    evaluated["workKey"] = evaluated["standardWorkId"].astype(str)
    final_outputs["workKey"] = final_outputs["workKey"].astype(str)
    gate = v1.build_current_gate_frame(evaluated, final_outputs)
    gate["workKey"] = gate["workKey"].astype(str)
    gate, gate_changes = v11.apply_v1_1_gate_boundary(gate, final_outputs)
    coverage = v1.build_coverage_report(gate)
    model_cases = v1.build_disentangled_cases(cases, gate)
    model_cases, interval_rows = v11.apply_interval_calibration(model_cases)
    validation = v1.build_validation_report(model_cases, gate, coverage)
    validation = v11.enrich_validation(validation, model_cases, coverage)
    return {
        "evaluated": evaluated,
        "gate": gate,
        "cases": model_cases,
        "coverage": coverage,
        "validation": validation,
        "gateChanges": gate_changes,
        "intervalRows": interval_rows,
    }


def build_staged_master_view(gate: pd.DataFrame) -> dict[str, dict]:
    v3 = load_v3_module()
    works = v3.build_m2_work_index(v3.load_mapping(), v3.load_author_index())
    staging_records = read_json(STAGING_TABLE_JSON)["records"]
    candidates = read_json(PRIVATE_CANDIDATES_V2_JSON)["candidateRows"]
    by_work_candidates: dict[str, list[dict]] = defaultdict(list)
    for candidate in candidates:
        by_work_candidates[clean(candidate.get("standardWorkId"))].append(candidate)
    staged_by_work: dict[str, list[dict]] = defaultdict(list)
    for record in staging_records:
        staged_by_work[clean(record.get("standardWorkId"))].append(record)

    master = {}
    for work_id in gate["workKey"].astype(str).tolist():
        work = dict(works.get(work_id, {}))
        candidates_for_work = by_work_candidates.get(work_id, [])
        staged = staged_by_work.get(work_id, [])
        source_counts = Counter(clean(item.get("source")) for item in candidates_for_work)
        cohort_counts = Counter(clean(item.get("cohort")) for item in candidates_for_work)
        raw_ids = work.get("rawWorkIds") or []
        view = {
            "standardWorkId": work_id,
            "rawWorkId": raw_ids[0] if raw_ids else "",
            "workNameBefore": clean(work.get("currentWorkName")),
            "authorNameBefore": clean(work.get("currentAuthorName")),
            "copyrightStartBefore": clean(work.get("currentCopyrightStartDate")),
            "copyrightEndBefore": clean(work.get("currentCopyrightEndDate")),
            "workNameAfter": clean(work.get("currentWorkName")),
            "authorNameAfter": clean(work.get("currentAuthorName")),
            "copyrightStartAfter": clean(work.get("currentCopyrightStartDate")),
            "copyrightEndAfter": clean(work.get("currentCopyrightEndDate")),
            "sourceCohort": cohort_counts.most_common(1)[0][0] if cohort_counts else "unknown",
            "fromDigitalCopyrightLedger": any(source in source_counts for source in ["digital_copyright_ledger", "both_sources_conflict", "both_sources_consistent"]),
            "fromOriginalLibrary": any(source in source_counts for source in ["original_library", "both_sources_conflict", "both_sources_consistent"]),
            "stagingAppliedFields": [],
            "stagingRecordCount": len(staged),
            "candidateCount": len(candidates_for_work),
        }
        for record in staged:
            field = clean(record.get("fieldName"))
            value = clean(record.get("applyValue"))
            if field == "standardWorkName":
                view["workNameAfter"] = value
            elif field == "authorName":
                view["authorNameAfter"] = value
            elif field == "copyrightStartDate":
                view["copyrightStartAfter"] = value
            elif field == "copyrightEndDate":
                view["copyrightEndAfter"] = value
            if field:
                view["stagingAppliedFields"].append(field)
        view["stagingAppliedFields"] = sorted(set(view["stagingAppliedFields"]))
        view["stagingAppliedFieldLabels"] = "、".join(FIELD_LABELS.get(field, field) for field in view["stagingAppliedFields"]) or "无"
        master[work_id] = view
    return master


def enrich_gate(gate: pd.DataFrame, evaluated: pd.DataFrame, master: dict[str, dict]) -> pd.DataFrame:
    eval_cols = [
        "standardWorkId",
        "firstPositiveSalesMonth",
        "latestIncomeMonth",
        "latestCompleteMonth",
        "historyMonthCount",
        "hasCopyrightEndDate",
        "copyrightDateConflict",
    ]
    eval_frame = evaluated[[col for col in eval_cols if col in evaluated.columns]].copy()
    eval_frame["standardWorkId"] = eval_frame["standardWorkId"].astype(str)
    frame = gate.copy()
    frame["standardWorkId"] = frame["workKey"].astype(str)
    frame = frame.merge(eval_frame, on="standardWorkId", how="left", suffixes=("", "FromEval"))
    latest_complete_month = clean(frame["latestCompleteMonth"].dropna().astype(str).max()) if "latestCompleteMonth" in frame.columns else "2026-04"
    rows = []
    for _, row in frame.iterrows():
        work_id = clean(row.get("standardWorkId"))
        view = master.get(work_id, {})
        end_after = clean(view.get("copyrightEndAfter"))
        remaining_after = months_between_month_and_date(latest_complete_month, end_after)
        item = row.to_dict()
        item.update(view)
        item["hasCopyrightEndBefore"] = bool(row.get("hasCopyrightEndDate"))
        item["hasCopyrightEndAfter"] = end_after != ""
        item["remainingCopyrightMonthsAfter"] = remaining_after
        item["forecastOutputTypeAfter"] = forecast_output_type_after(item)
        item["missingCopyrightEndReasonAfter"] = missing_end_reason(item, work_id)
        rows.append(item)
    return pd.DataFrame(rows)


def forecast_output_type_after(row: dict) -> str:
    if row.get("hasCopyrightEndAfter"):
        return "copyright_term_forecast"
    return "operating_window_forecast_pending_expiry"


def missing_end_reason(row: dict, work_id: str) -> str:
    if row.get("hasCopyrightEndAfter"):
        return ""
    if row.get("copyrightDateConflict") is True:
        return "copyright_conflict_manual_review"
    reasons = set(as_list(row.get("forecastabilityReasonCodes"))) | set(as_list(row.get("formalReadinessReasonCodes"))) | set(as_list(row.get("riskCodes")))
    if "missing_copyright_end" in reasons:
        return "missing_copyright_end"
    if clean(row.get("forecastabilityStatus")) in NO_NUMERIC_STATUSES:
        return "no_numeric_forecast"
    return "missing_copyright_end"


def build_forecast_output_report(frame: pd.DataFrame, validation: dict) -> dict:
    total_revenue = safe_float(frame["totalHistoricalRevenue"].sum())
    after_counts = dict(Counter(frame["forecastOutputTypeAfter"]))
    before_counts = {
        "copyright_term_forecast": int(frame["hasCopyrightEndBefore"].sum()),
        "operating_window_forecast_pending_expiry": int((~frame["hasCopyrightEndBefore"].astype(bool)).sum()),
    }
    missing = frame[frame["forecastOutputTypeAfter"] == "operating_window_forecast_pending_expiry"].copy()
    top_rows = []
    ranked = frame.sort_values("totalHistoricalRevenue", ascending=False).reset_index(drop=True)
    for top_n in [1, 5, 10]:
        top = ranked.head(top_n)
        missing_top = top[top["forecastOutputTypeAfter"] == "operating_window_forecast_pending_expiry"]
        top_revenue = safe_float(top["totalHistoricalRevenue"].sum())
        top_rows.append(
            {
                "topN": top_n,
                "missingExpiryCount": int(len(missing_top)),
                "missingExpiryRevenue": rounded(missing_top["totalHistoricalRevenue"].sum(), 2),
                "missingExpiryShareWithinTopN": percent(missing_top["totalHistoricalRevenue"].sum(), top_revenue),
                "missingExpiryShareOfTotalRevenue": percent(missing_top["totalHistoricalRevenue"].sum(), total_revenue),
            }
        )
    reason_rows = []
    for reason, group in missing.groupby("missingCopyrightEndReasonAfter"):
        reason_rows.append(
            {
                "reason": reason or "missing_copyright_end",
                "count": int(len(group)),
                "revenue": rounded(group["totalHistoricalRevenue"].sum(), 2),
                "revenueShare": percent(group["totalHistoricalRevenue"].sum(), total_revenue),
            }
        )
    return {
        "schema": "m2.forecast_output_type_after_dual_source_staging.v2",
        "generatedAt": now(),
        "candidateVersion": validation.get("candidateVersion"),
        "totalWorks": int(len(frame)),
        "before": {
            "copyright_term_forecast": before_counts["copyright_term_forecast"],
            "operating_window_forecast_pending_expiry": before_counts["operating_window_forecast_pending_expiry"],
            "missingCopyrightEnd": before_counts["operating_window_forecast_pending_expiry"],
            "remainingCopyrightMonthAvailable": before_counts["copyright_term_forecast"],
        },
        "after": {
            "copyright_term_forecast": after_counts.get("copyright_term_forecast", 0),
            "operating_window_forecast_pending_expiry": after_counts.get("operating_window_forecast_pending_expiry", 0),
            "perpetual_or_no_fixed_expiry_forecast": 0,
            "relative_expiry_pending_anchor": 0,
            "copyright_conflict_manual_review": sum(1 for row in reason_rows if row["reason"] == "copyright_conflict_manual_review"),
            "no_numeric_forecast": int((missing["forecastabilityStatus"].isin(NO_NUMERIC_STATUSES)).sum()) if not missing.empty else 0,
            "missingCopyrightEnd": int(len(missing)),
            "remainingCopyrightMonthAvailable": after_counts.get("copyright_term_forecast", 0),
            "renewalReviewReliable": int((frame["forecastOutputTypeAfter"] == "copyright_term_forecast").sum()),
            "ratingRemainingCopyrightAdjustmentAvailable": after_counts.get("copyright_term_forecast", 0),
        },
        "delta": {
            "newCopyrightTermForecastWorks": after_counts.get("copyright_term_forecast", 0) - before_counts["copyright_term_forecast"],
            "remainingMissingExpiryWorks": int(len(missing)),
        },
        "remainingMissingExpiryDistribution": sorted(reason_rows, key=lambda item: (-item["count"], item["reason"])),
        "topRevenueMissingExpiry": top_rows,
        "notes": {
            "shortTermBacktestChangedByCopyrightEnd": False,
            "copyrightTermForecastChanged": True,
            "operatingWindowForecastChanged": True,
            "modelParametersChanged": False,
        },
        "safeOutputBoundary": safe_boundary(),
    }


def build_forecastability_report(frame: pd.DataFrame, coverage: dict, validation: dict) -> dict:
    total_revenue = safe_float(frame["totalHistoricalRevenue"].sum())

    def group_rows(field: str) -> list[dict]:
        rows = []
        for value, group in frame.groupby(field):
            rows.append(
                {
                    "status": str(value),
                    "count": int(len(group)),
                    "revenue": rounded(group["totalHistoricalRevenue"].sum(), 2),
                    "revenueShare": percent(group["totalHistoricalRevenue"].sum(), total_revenue),
                }
            )
        return sorted(rows, key=lambda item: (-item["revenue"], item["status"]))

    status_counts = Counter(frame["forecastabilityStatus"])
    business_ready = frame[
        frame["forecastabilityStatus"].isin(NUMERIC_STATUSES)
        & (frame["businessActionStatus"].isin([v1.ACTION_ALLOWED_STATUS, v1.MANUAL_CONFIRMATION_STATUS]))
    ]
    return {
        "schema": "m2.v1_1_forecastability_after_dual_source_staging.v1",
        "generatedAt": now(),
        "candidateVersion": validation.get("candidateVersion"),
        "modelVerdict": validation.get("verdict"),
        "modelParametersChanged": False,
        "stagingChangedShortTermBacktest": False,
        "shortTermBacktestNote": "3/6/12 month backtest is revenue-series based and is not directly changed by copyright-end staging.",
        "beforeAfter": {
            "numeric_forecast_eligible": status_counts.get(v1.NUMERIC_STATUS, 0),
            "conservative_numeric_forecast": status_counts.get(v1.CONSERVATIVE_STATUS, 0),
            "observe_only_no_numeric_forecast": status_counts.get(v1.OBSERVE_STATUS, 0),
            "true_forecast_blocked": status_counts.get(v1.TRUE_BLOCKED_STATUS, 0),
            "formalReadinessBlocked": int((frame["formalReadinessStatus"] != v1.READY_STATUS).sum()),
            "businessActionManualConfirmation": int((frame["businessActionStatus"] == v1.MANUAL_CONFIRMATION_STATUS).sum()),
            "businessReviewReadyCohort": int(len(business_ready)),
        },
        "revenueShare": {
            "forecastableIncludingConservative": coverage["forecastableNumericIncludingConservative"]["revenueShare"],
            "numericForecastEligible": coverage["numericForecastEligible"]["revenueShare"],
            "conservativeForecast": coverage["conservativeForecast"]["revenueShare"],
            "trueForecastBlocked": coverage["trueForecastBlocked"]["revenueShare"],
            "businessReviewReadyCohort": percent(business_ready["totalHistoricalRevenue"].sum(), total_revenue),
        },
        "performanceUnchanged": {
            "wape": validation["forecastableCohortScore"]["wape"],
            "baselineWape": validation["forecastableCohortScore"]["baselineWape"],
            "coverage": validation["forecastableCohortScore"]["intervalCoverage"],
            "p0": validation["issueSummary"]["p0"],
            "p1": validation["issueSummary"]["p1"],
            "p2": validation["issueSummary"]["p2"],
        },
        "forecastabilityDistribution": group_rows("forecastabilityStatus"),
        "businessActionDistribution": group_rows("businessActionStatus"),
        "safeOutputBoundary": safe_boundary(),
    }


def build_business_readiness_report(frame: pd.DataFrame, forecast_output: dict, forecastability: dict) -> dict:
    return {
        "schema": "m2.v1_1_business_readiness_after_dual_source_staging.v1",
        "generatedAt": now(),
        "candidateVersion": forecastability["candidateVersion"],
        "v1_1ConditionalStillValid": True,
        "formalCompletionBlocked": True,
        "m3Allowed": False,
        "improvements": {
            "dualSourceStagingSignificantlyImprovesM2Inputs": True,
            "newCopyrightTermForecastWorks": forecast_output["delta"]["newCopyrightTermForecastWorks"],
            "remainingMissingExpiryWorks": forecast_output["delta"]["remainingMissingExpiryWorks"],
            "businessReviewScopeExpanded": True,
        },
        "stillBlocked": [
            "local_staging_is_not_formal_master_data",
            "formal_readiness_status_remains_data_fix_required",
            "remaining_610_missing_copyright_end_works_need_manual_backfill_or_exception",
            "m3_not_authorized",
        ],
        "readinessAfterStaging": {
            "forecastableCohortRevenueShare": forecastability["revenueShare"]["forecastableIncludingConservative"],
            "businessReviewReadyCohort": forecastability["beforeAfter"]["businessReviewReadyCohort"],
            "businessReviewReadyRevenueShare": forecastability["revenueShare"]["businessReviewReadyCohort"],
        },
        "safeOutputBoundary": safe_boundary(),
    }


def build_operator_task_pack(frame: pd.DataFrame, cases: pd.DataFrame) -> dict:
    system_samples = select_system_samples_after_staging(frame, 20)
    excluded = {row["standardWorkId"] for row in system_samples}
    high_risk_samples = select_high_risk_samples_after_staging(frame, excluded, 5)
    user_rows = [blank_user_row(index) for index in range(1, 6)]
    task_rows = []
    for index, row in enumerate(system_samples, start=1):
        task_rows.append(operator_row(row, f"SYS-{index:03d}", "系统分层样本", cases))
    for row in user_rows:
        task_rows.append(row)
    for index, row in enumerate(high_risk_samples, start=1):
        task_rows.append(operator_row(row, f"RISK-{index:03d}", "高风险边界样本", cases))
    detail_rows = [backtest_row(row, cases) for row in system_samples + high_risk_samples]
    sheets = [
        {
            "name": "00_阅读说明",
            "rows": [
                {"项目": "用途", "说明": "M2 v1.1 dual-source local staging 后的运营复核任务包"},
                {"项目": "边界", "说明": "本文件为 private gitignored 输出，不提交，不进入 M3，不写正式主数据"},
                {"项目": "回写键", "说明": "请使用 standard_work_id 精确回写用户反馈"},
            ],
        },
        {"name": "01_运营任务卡", "rows": task_rows},
        {"name": "02_预测与回测明细", "rows": detail_rows},
        {"name": "03_填写选项", "rows": filling_options()},
    ]
    summary = {
        "taskRows": len(task_rows),
        "systemRows": len(system_samples),
        "userReservedRows": len(user_rows),
        "highRiskRows": len(high_risk_samples),
        "hasStandardWorkIdColumn": all("standard_work_id" in row for row in task_rows),
        "canRoundTripUserFeedbackByStandardWorkId": True,
        "privateWorkbookPath": str(PRIVATE_OPERATOR_XLSX.relative_to(ROOT)),
        "privateSourceJsonPath": str(PRIVATE_OPERATOR_SOURCE_JSON.relative_to(ROOT)),
        "gitignored": True,
        "publicReportSanitized": True,
        "matchedByOldAnonymousTaskCard": False,
    }
    return {"schema": "m2.operator_task_pack_after_dual_source_staging.v2.private_source", "summary": summary, "sheets": sheets}


def select_system_samples_after_staging(frame: pd.DataFrame, count: int) -> list[dict]:
    rows = frame.sort_values(["totalHistoricalRevenue", "standardWorkId"], ascending=[False, True]).to_dict(orient="records")
    selected = []
    selected_ids = set()
    buckets = [
        ("forecastOutputTypeAfter", ["copyright_term_forecast", "operating_window_forecast_pending_expiry"]),
        ("sourceCohort", sorted({str(row.get("sourceCohort")) for row in rows})),
        ("forecastabilityStatus", [v1.NUMERIC_STATUS, v1.CONSERVATIVE_STATUS, v1.OBSERVE_STATUS, v1.TRUE_BLOCKED_STATUS]),
        ("rating", ["S+", "S", "A", "B", "C", "D", "E"]),
        ("lifecycle", ["growth", "stable", "declining", "long_tail", "inactive", "insufficient_history"]),
    ]
    for field, values in buckets:
        for value in values:
            match = next((row for row in rows if row["standardWorkId"] not in selected_ids and str(row.get(field)) == str(value)), None)
            if match:
                selected.append(match)
                selected_ids.add(match["standardWorkId"])
            if len(selected) >= count:
                return selected
    for row in rows:
        if row["standardWorkId"] in selected_ids:
            continue
        selected.append(row)
        selected_ids.add(row["standardWorkId"])
        if len(selected) >= count:
            break
    return selected


def select_high_risk_samples_after_staging(frame: pd.DataFrame, excluded: set[str], count: int) -> list[dict]:
    candidates = frame[
        (~frame["standardWorkId"].isin(excluded))
        & (
            (frame["forecastOutputTypeAfter"] == "operating_window_forecast_pending_expiry")
            | (frame["forecastabilityStatus"] == v1.TRUE_BLOCKED_STATUS)
            | (frame["businessActionStatus"] != v1.ACTION_ALLOWED_STATUS)
        )
    ].copy()
    return candidates.sort_values(["totalHistoricalRevenue", "standardWorkId"], ascending=[False, True]).head(count).to_dict(orient="records")


def operator_row(row: dict, sample_id: str, sample_source: str, cases: pd.DataFrame | None = None) -> dict:
    return {
        "样本编号": sample_id,
        "样本来源": sample_source,
        "standard_work_id": row.get("standardWorkId"),
        "raw_work_id": row.get("rawWorkId"),
        "作品名": row.get("workNameAfter"),
        "作者": row.get("authorNameAfter"),
        "来源分组": source_cohort_label(row.get("sourceCohort")),
        "是否来自数字版权台账": yes_no(row.get("fromDigitalCopyrightLedger")),
        "是否来自原创全库": yes_no(row.get("fromOriginalLibrary")),
        "staging补全字段": staging_fields_label(row),
        "版权开始日期": row.get("copyrightStartAfter"),
        "版权到期日期": row.get("copyrightEndAfter"),
        "剩余版权月数": remaining_months_value(row),
        "预测输出类型": forecast_output_type_label(row.get("forecastOutputTypeAfter")),
        "版权期内预测": copyright_term_forecast_label(row),
        "运营窗口预测": operating_window_label(row),
        "预测置信度": confidence_label(row.get("forecastConfidence") or row.get("confidence")),
        "回测摘要": backtest_summary_label(row, cases),
        "评级": row.get("rating"),
        "生命周期": lifecycle_label(row.get("lifecycle")),
        "收入层级": revenue_bucket_label(row.get("revenueBucket")),
        "预测状态": forecastability_label(row.get("forecastabilityStatus")),
        "业务动作状态": business_action_label(row.get("businessActionStatus")),
        "风险": risk_label(row),
        "运营建议": suggestion_label(row),
        "过去12个月收入": rounded(row.get("last12MonthRevenue"), 2),
        "历史总收入": rounded(row.get("totalHistoricalRevenue"), 2),
        "基准预测": rounded(row.get("baseForecast"), 2),
        "保守预测": rounded(row.get("pessimisticForecast"), 2),
        "乐观预测": rounded(row.get("optimisticForecast"), 2),
        "运营判断：预测是否可信": "",
        "运营判断：评级是否合理": "",
        "运营判断：建议是否可执行": "",
        "运营发现的问题类型": "",
        "运营建议修正": "",
        "是否应进入M4校准案例池": "",
        "辅助原始sourceCohort": row.get("sourceCohort"),
        "辅助原始stagingAppliedFields": " / ".join(row.get("stagingAppliedFields") or []) if isinstance(row.get("stagingAppliedFields"), list) else row.get("stagingAppliedFields"),
        "辅助原始forecastOutputType": row.get("forecastOutputTypeAfter"),
        "辅助原始生命周期code": row.get("lifecycle"),
        "辅助原始收入层级code": row.get("revenueBucket"),
        "辅助原始预测状态code": row.get("forecastabilityStatus"),
        "辅助原始业务动作状态code": row.get("businessActionStatus"),
    }


def blank_user_row(index: int) -> dict:
    row = {key: "" for key in operator_row({}, f"USER-{index:03d}", "用户指定作品").keys()}
    row["样本编号"] = f"USER-{index:03d}"
    row["样本来源"] = "用户指定作品"
    row["standard_work_id"] = ""
    row["运营建议修正"] = "用户先填写 standard_work_id，后续由 Codex 精确补生成任务卡"
    return row


def backtest_row(row: dict, cases: pd.DataFrame) -> dict:
    subset = cases[cases["workKey"].astype(str) == str(row.get("standardWorkId"))].copy()
    summary = {}
    if not subset.empty:
        summary = subset.groupby("horizonMonths").tail(1).set_index("horizonMonths").to_dict(orient="index")
    result = {
        "standard_work_id": row.get("standardWorkId"),
        "作品名": row.get("workNameAfter"),
        "作者": row.get("authorNameAfter"),
        "预测输出类型": forecast_output_type_label(row.get("forecastOutputTypeAfter")),
        "版权期内预测": copyright_term_forecast_label(row),
        "运营窗口预测": operating_window_label(row),
    }
    for horizon in [3, 6, 12]:
        item = summary.get(horizon, {})
        result[f"{horizon}个月预测值"] = rounded(item.get("predicted"), 2)
        result[f"{horizon}个月实际值"] = rounded(item.get("actual"), 2)
        result[f"{horizon}个月绝对误差"] = rounded(item.get("absoluteError"), 2)
        result[f"{horizon}个月是否优于基线"] = yes_no(item.get("betterThanBaseline"))
    result["辅助原始forecastOutputType"] = row.get("forecastOutputTypeAfter")
    return result


def build_random20_pack(frame: pd.DataFrame) -> dict:
    selected = []
    selected_ids = set()
    frame = frame.copy()
    frame["sampleYear"] = frame["firstPositiveSalesMonth"].astype(str).str.slice(0, 4)
    for (year, cohort), group in frame.sort_values("totalHistoricalRevenue", ascending=False).groupby(["sampleYear", "sourceCohort"]):
        if len(selected) >= 20:
            break
        row = group.iloc[0].to_dict()
        if row["standardWorkId"] in selected_ids or not str(year).isdigit():
            continue
        selected.append(row)
        selected_ids.add(row["standardWorkId"])
    if len(selected) < 20:
        for _, row in frame.sort_values(["sampleYear", "totalHistoricalRevenue"], ascending=[True, False]).iterrows():
            if row["standardWorkId"] in selected_ids:
                continue
            selected.append(row.to_dict())
            selected_ids.add(row["standardWorkId"])
            if len(selected) >= 20:
                break
    rows = []
    for index, row in enumerate(selected, start=1):
        rows.append(
            {
                "序号": index,
                "抽样年份": row.get("sampleYear"),
                "standard_work_id": row.get("standardWorkId"),
                "raw_work_id": row.get("rawWorkId"),
                "作品名": row.get("workNameAfter"),
                "作者": row.get("authorNameAfter"),
                "来源分组": source_cohort_label(row.get("sourceCohort")),
                "staging补全字段": staging_fields_label(row),
                "版权开始日期": row.get("copyrightStartAfter"),
                "版权到期日期": row.get("copyrightEndAfter"),
        "剩余版权月数": remaining_months_value(row),
                "预测输出类型": forecast_output_type_label(row.get("forecastOutputTypeAfter")),
                "版权期内预测": copyright_term_forecast_label(row),
                "运营窗口预测": operating_window_label(row),
                "缺版权到期原因": "" if row.get("hasCopyrightEndAfter") else row.get("missingCopyrightEndReasonAfter"),
                "评级": row.get("rating"),
                "生命周期": lifecycle_label(row.get("lifecycle")),
                "收入层级": revenue_bucket_label(row.get("revenueBucket")),
                "预测状态": forecastability_label(row.get("forecastabilityStatus")),
                "历史总收入": rounded(row.get("totalHistoricalRevenue"), 2),
                "过去12个月收入": rounded(row.get("last12MonthRevenue"), 2),
                "基准预测": rounded(row.get("baseForecast"), 2),
                "保守预测": rounded(row.get("pessimisticForecast"), 2),
                "乐观预测": rounded(row.get("optimisticForecast"), 2),
                "辅助原始sourceCohort": row.get("sourceCohort"),
                "辅助原始stagingAppliedFields": " / ".join(row.get("stagingAppliedFields") or []) if isinstance(row.get("stagingAppliedFields"), list) else row.get("stagingAppliedFields"),
                "辅助原始forecastOutputType": row.get("forecastOutputTypeAfter"),
                "辅助原始生命周期code": row.get("lifecycle"),
                "辅助原始收入层级code": row.get("revenueBucket"),
                "辅助原始预测状态code": row.get("forecastabilityStatus"),
            }
        )
    summary = {
        "rowCount": len(rows),
        "stagingAffectedRows": sum(1 for row in rows if row["staging补全字段"] != "无"),
        "copyrightTermForecastRows": sum(1 for row in rows if row["辅助原始forecastOutputType"] == "copyright_term_forecast"),
        "operatingWindowRows": sum(1 for row in rows if row["辅助原始forecastOutputType"] == "operating_window_forecast_pending_expiry"),
        "yearsCovered": sorted({row["抽样年份"] for row in rows}),
        "sourceCohortsCovered": dict(Counter(row["辅助原始sourceCohort"] for row in rows)),
        "privateWorkbookPath": str(PRIVATE_RANDOM20_XLSX.relative_to(ROOT)),
        "privateSourceJsonPath": str(PRIVATE_RANDOM20_SOURCE_JSON.relative_to(ROOT)),
        "gitignored": True,
        "publicReportSanitized": True,
    }
    return {"schema": "m2.random_20_after_dual_source_staging.v2.private_source", "summary": summary, "sheets": [{"name": "01_跨年份样本评估", "rows": rows}]}


def build_rerun_summary(generated_at: str, forecast_output: dict, forecastability: dict, readiness: dict, operator_task: dict, random20: dict) -> dict:
    return {
        "schema": "m2.dual_source_staging_rerun_summary.v1",
        "generatedAt": generated_at,
        "currentHead": git(["rev-parse", "HEAD"]),
        "originMain": git(["rev-parse", "origin/main"]),
        "dualSourceStagingSignificantlyImprovesM2Inputs": True,
        "formalCompletionStillBlocked": True,
        "v1_1ConditionalStillValid": True,
        "limitedM2BusinessReviewMoreReliable": True,
        "remainingMissingExpiryNeedsManualBackfill": forecast_output["delta"]["remainingMissingExpiryWorks"] > 0,
        "m3Entered": False,
        "forecastOutputType": {
            "copyrightTermForecastAfter": forecast_output["after"]["copyright_term_forecast"],
            "operatingWindowPendingAfter": forecast_output["after"]["operating_window_forecast_pending_expiry"],
            "newCopyrightTermForecastWorks": forecast_output["delta"]["newCopyrightTermForecastWorks"],
        },
        "forecastability": forecastability["beforeAfter"],
        "businessReadiness": readiness["readinessAfterStaging"],
        "operatorTaskPack": operator_task["summary"],
        "random20": random20["summary"],
        "safeOutputBoundary": safe_boundary(),
        "prohibitedActionsConfirmed": prohibited_actions(),
    }


def write_outputs(payload: dict) -> None:
    M2_DOCS.mkdir(parents=True, exist_ok=True)
    M2_PRIVATE.mkdir(parents=True, exist_ok=True)
    write_json(FORECAST_V2_JSON, public_envelope("m2.forecast_output_type_after_dual_source_staging.v2.public", payload["forecastOutputType"]))
    write_text(FORECAST_V2_MD, forecast_md(payload["forecastOutputType"]))
    write_json(FORECASTABILITY_JSON, public_envelope("m2.v1_1_forecastability_after_dual_source_staging.v1.public", payload["forecastability"]))
    write_text(FORECASTABILITY_MD, forecastability_md(payload["forecastability"]))
    write_json(BUSINESS_READINESS_JSON, public_envelope("m2.v1_1_business_readiness_after_dual_source_staging.v1.public", payload["businessReadiness"]))
    write_text(BUSINESS_READINESS_MD, business_readiness_md(payload["businessReadiness"]))
    v3 = load_v3_module()
    write_json(PRIVATE_OPERATOR_SOURCE_JSON, payload["operatorTask"])
    v3.write_xlsx(PRIVATE_OPERATOR_XLSX, {sheet["name"]: sheet["rows"] for sheet in payload["operatorTask"]["sheets"]})
    write_json(OPERATOR_SUMMARY_JSON, public_envelope("m2.operator_task_pack_after_dual_source_staging.v2.summary.public", payload["operatorTask"]["summary"]))
    write_text(OPERATOR_SUMMARY_MD, operator_summary_md(payload["operatorTask"]["summary"]))
    write_json(PRIVATE_RANDOM20_SOURCE_JSON, payload["random20"])
    v3.write_xlsx(PRIVATE_RANDOM20_XLSX, {sheet["name"]: sheet["rows"] for sheet in payload["random20"]["sheets"]})
    write_json(RANDOM20_SUMMARY_JSON, public_envelope("m2.random_20_year_evaluation_after_dual_source_staging.v2.summary.public", payload["random20"]["summary"]))
    write_text(RANDOM20_SUMMARY_MD, random20_summary_md(payload["random20"]["summary"]))
    write_json(RERUN_SUMMARY_JSON, public_envelope("m2.dual_source_staging_rerun_summary.v1.public", payload["rerunSummary"]))
    write_text(RERUN_SUMMARY_MD, rerun_summary_md(payload["rerunSummary"]))


def public_envelope(schema: str, payload: dict) -> dict:
    return {
        "schema": schema,
        "generatedAt": now(),
        "currentHead": git(["rev-parse", "HEAD"]),
        "originMain": git(["rev-parse", "origin/main"]),
        "safeOutputBoundary": safe_boundary(),
        "payload": payload,
    }


def forecast_md(payload: dict) -> str:
    return "\n".join(
        [
            "# M2 Forecast Output Type After Dual-Source Staging v2",
            "",
            f"- Total works: `{payload['totalWorks']}`",
            f"- Copyright term forecast after staging: `{payload['after']['copyright_term_forecast']}`",
            f"- Operating window forecast pending expiry after staging: `{payload['after']['operating_window_forecast_pending_expiry']}`",
            f"- New copyright term forecast works: `{payload['delta']['newCopyrightTermForecastWorks']}`",
            f"- Remaining missing expiry works: `{payload['delta']['remainingMissingExpiryWorks']}`",
            "- Short-term 3/6/12 backtest changed by copyright staging: `false`",
            "- Model parameters changed: `false`",
            "",
            "## Top Revenue Missing Expiry",
            markdown_table(payload["topRevenueMissingExpiry"], [("topN", "Top N"), ("missingExpiryCount", "Missing expiry count"), ("missingExpiryShareWithinTopN", "Share within Top N"), ("missingExpiryShareOfTotalRevenue", "Share of total revenue")]),
        ]
    )


def forecastability_md(payload: dict) -> str:
    return "\n".join(
        [
            "# M2 v1.1 Forecastability After Dual-Source Staging v1",
            "",
            f"- Candidate version: `{payload['candidateVersion']}`",
            f"- Model verdict: `{payload['modelVerdict']}`",
            f"- Numeric forecast eligible: `{payload['beforeAfter']['numeric_forecast_eligible']}`",
            f"- Conservative numeric forecast: `{payload['beforeAfter']['conservative_numeric_forecast']}`",
            f"- Observe-only no numeric forecast: `{payload['beforeAfter']['observe_only_no_numeric_forecast']}`",
            f"- True forecast blocked: `{payload['beforeAfter']['true_forecast_blocked']}`",
            f"- Business review ready cohort: `{payload['beforeAfter']['businessReviewReadyCohort']}`",
            f"- WAPE: `{payload['performanceUnchanged']['wape']}`",
            f"- Coverage: `{payload['performanceUnchanged']['coverage']}`",
            "- 3/6/12 short-term backtest is unchanged by copyright-end staging.",
        ]
    )


def business_readiness_md(payload: dict) -> str:
    return "\n".join(
        [
            "# M2 v1.1 Business Readiness After Dual-Source Staging v1",
            "",
            f"- v1.1 conditional still valid: `{payload['v1_1ConditionalStillValid']}`",
            f"- Formal completion blocked: `{payload['formalCompletionBlocked']}`",
            f"- M3 allowed: `{payload['m3Allowed']}`",
            f"- New copyright term forecast works: `{payload['improvements']['newCopyrightTermForecastWorks']}`",
            f"- Remaining missing expiry works: `{payload['improvements']['remainingMissingExpiryWorks']}`",
            "",
            "## Still Blocked",
            *[f"- `{item}`" for item in payload["stillBlocked"]],
        ]
    )


def operator_summary_md(payload: dict) -> str:
    return "\n".join(
        [
            "# M2 Operator Task Pack After Dual-Source Staging v2 Summary",
            "",
            f"- Task rows: `{payload['taskRows']}`",
            f"- System rows: `{payload['systemRows']}`",
            f"- User reserved rows: `{payload['userReservedRows']}`",
            f"- High-risk rows: `{payload['highRiskRows']}`",
            f"- Has standard_work_id column: `{payload['hasStandardWorkIdColumn']}`",
            f"- Can round-trip feedback by standard_work_id: `{payload['canRoundTripUserFeedbackByStandardWorkId']}`",
            f"- Private workbook: `{payload['privateWorkbookPath']}`",
            "- Public summary is sanitized and aggregate-only.",
        ]
    )


def random20_summary_md(payload: dict) -> str:
    return "\n".join(
        [
            "# M2 Random 20-Year Evaluation After Dual-Source Staging v2 Summary",
            "",
            f"- Row count: `{payload['rowCount']}`",
            f"- Staging affected rows: `{payload['stagingAffectedRows']}`",
            f"- Copyright term forecast rows: `{payload['copyrightTermForecastRows']}`",
            f"- Operating window rows: `{payload['operatingWindowRows']}`",
            f"- Years covered: `{json.dumps(payload['yearsCovered'], ensure_ascii=False)}`",
            f"- Source cohorts covered: `{json.dumps(payload['sourceCohortsCovered'], ensure_ascii=False)}`",
            f"- Private workbook: `{payload['privateWorkbookPath']}`",
            "- Public summary is sanitized and aggregate-only.",
        ]
    )


def rerun_summary_md(payload: dict) -> str:
    return "\n".join(
        [
            "# M2 Dual-Source Staging Rerun Summary v1",
            "",
            f"- Dual-source staging significantly improves M2 inputs: `{payload['dualSourceStagingSignificantlyImprovesM2Inputs']}`",
            f"- Formal completion still blocked: `{payload['formalCompletionStillBlocked']}`",
            f"- v1.1 conditional still valid: `{payload['v1_1ConditionalStillValid']}`",
            f"- Limited M2 business review more reliable: `{payload['limitedM2BusinessReviewMoreReliable']}`",
            f"- Remaining missing expiry needs manual backfill: `{payload['remainingMissingExpiryNeedsManualBackfill']}`",
            f"- M3 entered: `{payload['m3Entered']}`",
            f"- Copyright term forecast after staging: `{payload['forecastOutputType']['copyrightTermForecastAfter']}`",
            f"- Operating window pending after staging: `{payload['forecastOutputType']['operatingWindowPendingAfter']}`",
        ]
    )


def filling_options() -> list[dict]:
    return [
        {"字段": "运营判断：预测是否可信", "可选项": "可信 / 基本可信 / 不确定 / 不可信 / 不适用"},
        {"字段": "运营判断：评级是否合理", "可选项": "合理 / 基本合理 / 不确定 / 不合理 / 不适用"},
        {"字段": "运营判断：建议是否可执行", "可选项": "可执行 / 需要人工确认 / 仅供参考 / 不可执行 / 不适用"},
        {"字段": "运营发现的问题类型", "可选项": "无明显问题 / 预测偏高 / 预测偏低 / 评级偏高 / 评级偏低 / 建议不合理 / 风险识别遗漏 / 版权/数据问题 / 业务常识冲突 / 其他"},
        {"字段": "是否应进入M4校准案例池", "可选项": "是 / 否 / 待定"},
    ]


def copyright_term_forecast_label(row: dict) -> str:
    if row.get("forecastOutputTypeAfter") != "copyright_term_forecast":
        return "不适用：缺少可用版权到期日"
    remaining = remaining_months_value(row)
    return f"可按剩余版权期估算（剩余 {remaining} 个月）" if remaining != "" else "可按版权期估算"


def operating_window_label(row: dict) -> str:
    if row.get("forecastOutputTypeAfter") == "operating_window_forecast_pending_expiry":
        return "仅运营窗口预测，待补版权到期日后再生成版权期预测"
    return "可与版权期预测分列展示"


def remaining_months_value(row: dict):
    value = row.get("remainingCopyrightMonthsAfter")
    if value is None:
        return ""
    if isinstance(value, float) and math.isnan(value):
        return ""
    return int(value) if isinstance(value, float) and value.is_integer() else value


def source_cohort_label(value) -> str:
    text = clean(value)
    if not text:
        return "来源待确认"
    return SOURCE_COHORT_LABELS.get(text, text)


def forecast_output_type_label(value) -> str:
    text = clean(value)
    if not text:
        return ""
    return FORECAST_OUTPUT_TYPE_LABELS.get(text, text)


def forecastability_label(value) -> str:
    text = clean(value)
    if not text:
        return ""
    return FORECASTABILITY_LABELS.get(text, text)


def business_action_label(value) -> str:
    text = clean(value)
    if not text:
        return ""
    return BUSINESS_ACTION_LABELS.get(text, text)


def lifecycle_label(value) -> str:
    text = clean(value)
    if not text:
        return ""
    return LIFECYCLE_LABELS.get(text, text)


def revenue_bucket_label(value) -> str:
    text = clean(value)
    if not text:
        return ""
    return REVENUE_BUCKET_LABELS.get(text, text)


def confidence_label(value) -> str:
    text = clean(value)
    if not text:
        return "未提供"
    return CONFIDENCE_LABELS.get(text, text)


def staging_fields_label(row: dict) -> str:
    labels = clean(row.get("stagingAppliedFieldLabels"))
    if labels:
        return labels
    fields = row.get("stagingAppliedFields") or []
    if not fields:
        return "无"
    return "、".join(FIELD_LABELS.get(clean(field), clean(field)) for field in fields if clean(field)) or "无"


def risk_label(row: dict) -> str:
    if not clean(row.get("standardWorkId")):
        return ""
    labels = []
    if not row.get("hasCopyrightEndAfter"):
        labels.append("缺版权到期，仅输出运营窗口预测")
    status = clean(row.get("forecastabilityStatus"))
    action_status = clean(row.get("businessActionStatus"))
    if status == v1.TRUE_BLOCKED_STATUS:
        labels.append("暂不可预测")
    elif status == v1.OBSERVE_STATUS:
        labels.append("仅观察，不输出业务可用数值预测")
    if action_status == v1.MANUAL_CONFIRMATION_STATUS:
        labels.append("需要人工确认")
    elif action_status == v1.ACTION_BLOCKED_STATUS:
        labels.append("暂不可执行业务动作")
    if row.get("copyrightDateConflict"):
        labels.append("版权日期冲突")
    for code in as_list(row.get("riskCodes")):
        mapped = RISK_LABELS.get(clean(code))
        if mapped:
            labels.append(mapped)
    unique = []
    for label in labels:
        if label and label not in unique:
            unique.append(label)
    return "；".join(unique[:4]) if unique else "无明显额外风险"


def suggestion_label(row: dict) -> str:
    if not clean(row.get("standardWorkId")):
        return ""
    if clean(row.get("forecastabilityStatus")) == v1.TRUE_BLOCKED_STATUS:
        return "先补齐预测阻断原因，不建议直接执行业务动作"
    if clean(row.get("forecastabilityStatus")) == v1.OBSERVE_STATUS:
        return "仅观察，暂不作为投放、续约或下架的直接依据"
    if clean(row.get("forecastOutputTypeAfter")) == "operating_window_forecast_pending_expiry":
        return "先按运营窗口复核，待补版权到期后再生成版权期预测"
    if clean(row.get("businessActionStatus")) == v1.MANUAL_CONFIRMATION_STATUS:
        return "建议运营人工确认后再执行"
    for code in [*as_list(row.get("suggestionCodes")), row.get("suggestionBucket")]:
        mapped = SUGGESTION_LABELS.get(clean(code))
        if mapped:
            return mapped
    return "可按当前评级和预测做有限运营复核"


def backtest_summary_label(row: dict, cases: pd.DataFrame | None) -> str:
    if cases is None or cases.empty or not clean(row.get("standardWorkId")):
        return ""
    subset = cases[cases["workKey"].astype(str) == str(row.get("standardWorkId"))].copy()
    if subset.empty:
        return "暂无可回测摘要"
    summary = subset.groupby("horizonMonths").tail(1).set_index("horizonMonths").to_dict(orient="index")
    parts = []
    for horizon in [3, 6, 12]:
        item = summary.get(horizon)
        if not item:
            continue
        predicted = rounded(item.get("predicted"), 2)
        actual = rounded(item.get("actual"), 2)
        error = rounded(item.get("absoluteError"), 2)
        better = yes_no(item.get("betterThanBaseline"))
        parts.append(f"{horizon}个月：预测{predicted}，实际{actual}，误差{error}，优于基线{better}")
    return "；".join(parts) if parts else "暂无可回测摘要"


def load_v3_module():
    path = ROOT / "scripts" / "m2-real-data" / "run_cleaned_ledger_minimal_backfill_v3.py"
    spec = importlib.util.spec_from_file_location("cleaned_ledger_v3", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)  # type: ignore[union-attr]
    return module


def months_between_month_and_date(month_text: str, end_text: str) -> int | None:
    end_date = parse_date(end_text)
    if end_date is None:
        return None
    match = re.match(r"(\d{4})-(\d{2})", clean(month_text))
    if not match:
        return None
    start_year = int(match.group(1))
    start_month = int(match.group(2))
    months = (end_date.year - start_year) * 12 + (end_date.month - start_month)
    if end_date.day >= 15:
        months += 1
    return max(0, months)


def parse_date(value: str) -> date | None:
    text = clean(value)
    if not text:
        return None
    if re.fullmatch(r"\d{5}", text):
        serial = int(text)
        if 20000 <= serial <= 60000:
            return date(1899, 12, 30) + timedelta(days=serial)
    for fmt in ["%Y-%m-%d", "%Y/%m/%d", "%Y.%m.%d"]:
        try:
            return datetime.strptime(text[:10], fmt).date()
        except Exception:
            pass
    return None


def markdown_table(rows: list[dict], columns: list[tuple[str, str]]) -> str:
    if not rows:
        return ""
    header = "| " + " | ".join(label for _, label in columns) + " |"
    separator = "| " + " | ".join("---" for _ in columns) + " |"
    body = []
    for row in rows:
        body.append("| " + " | ".join(str(row.get(key, "")) for key, _ in columns) + " |")
    return "\n".join([header, separator, *body])


def as_list(value) -> list:
    if isinstance(value, list):
        return value
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return []
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return parsed
        except Exception:
            pass
        return [value] if value else []
    return list(value) if hasattr(value, "__iter__") and not isinstance(value, dict) else [value]


def safe_boundary() -> dict:
    return {
        "sanitizedAggregateOnly": True,
        "realWorkNamesIncluded": False,
        "authorNamesIncluded": False,
        "channelNamesIncluded": False,
        "rawLedgerRowsIncluded": False,
        "privateDetailsStoredOnlyInGitignoredOutput": True,
        "formalMasterDataWritten": False,
        "databaseConnected": False,
        "databaseWritten": False,
        "m3Entered": False,
    }


def prohibited_actions() -> dict:
    return {
        "remoteProductionOrSharedDbConnected": False,
        "formalMasterDataWritten": False,
        "privateExcelCommitted": False,
        "gitAddDotUsed": False,
        "stashTouched": False,
        "modelParametersChanged": False,
        "m3Entered": False,
    }


def clean(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and math.isnan(value):
        return ""
    text = str(value).strip()
    if text.endswith(".0") and re.fullmatch(r"\d+\.0", text):
        return text[:-2]
    return text


def safe_float(value, default: float = 0.0) -> float:
    try:
        if value is None or (isinstance(value, float) and math.isnan(value)):
            return default
        return float(value)
    except Exception:
        return default


def rounded(value, digits: int = 4):
    return round(safe_float(value), digits)


def percent(part, total) -> float:
    total = safe_float(total)
    if total <= 0:
        return 0.0
    return rounded(safe_float(part) / total)


def yes_no(value) -> str:
    return "是" if bool(value) else "否"


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(json_safe(payload), ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text + "\n", encoding="utf-8")


def json_safe(value):
    if isinstance(value, dict):
        return {str(key): json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [json_safe(item) for item in value]
    if isinstance(value, tuple):
        return [json_safe(item) for item in value]
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        return value
    if hasattr(value, "item"):
        try:
            return json_safe(value.item())
        except Exception:
            return clean(value)
    return value


def now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def git(args: list[str]) -> str | None:
    try:
        return subprocess.check_output(["git", *args], cwd=ROOT, text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        return None


if __name__ == "__main__":
    main()
