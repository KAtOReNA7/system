from __future__ import annotations

import json
import math
import os
import re
import sys
from collections import Counter
from datetime import datetime, timezone
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
import run_m2_forecast_model_bakeoff as bake

OUTPUT_DIR = ROOT / "docs" / "analysis" / "m2-real-data"
PRIVATE_DIR = ROOT / "data" / "private-output" / "m2-business-review"

SELECTION_MD = OUTPUT_DIR / "M2-v1.1-30-work-operator-task-selection-cn.md"
SELECTION_JSON = OUTPUT_DIR / "M2-v1.1-30-work-operator-task-selection-cn.json"
GUIDE_MD = OUTPUT_DIR / "M2-v1.1-operator-task-validation-guide-cn.md"
GUIDE_JSON = OUTPUT_DIR / "M2-v1.1-operator-task-validation-guide-cn.json"
ACCEPTANCE_MD = OUTPUT_DIR / "M2-v1.1-operator-task-acceptance-criteria-cn.md"
ACCEPTANCE_JSON = OUTPUT_DIR / "M2-v1.1-operator-task-acceptance-criteria-cn.json"

PRIVATE_XLSX = PRIVATE_DIR / "m2-v1.1-30-work-operator-task-pack-cn.xlsx"
PRIVATE_SOURCE_JSON = PRIVATE_DIR / "m2-v1.1-30-work-operator-task-pack-cn-source.json"

CANDIDATE_VERSION = "m2-realdata-dev-disentangled-forecast-v1.1-conditional"

NUMERIC_STATUSES = {
    v1.NUMERIC_STATUS,
    v1.CONSERVATIVE_STATUS,
}

LIFECYCLE_CN = {
    "growth": "增长期",
    "stable": "稳定期",
    "rebound": "回升期",
    "declining": "下滑期",
    "long_tail": "长尾期",
    "inactive": "沉寂期",
    "insufficient_history": "历史不足",
}

FORECASTABILITY_CN = {
    "numeric_forecast_eligible": "可数值预测",
    "conservative_numeric_forecast": "可保守预测",
    "observe_only_no_numeric_forecast": "仅观察，不输出业务可用数值预测",
    "true_forecast_blocked": "暂不可预测",
}

FORMAL_CN = {
    "ready_for_local_algorithm_validation": "可用于本地算法验证",
    "formal_release_blocked": "暂不可正式发布",
    "waiver_required": "需要业务豁免",
    "data_fix_required": "需要数据修正",
    "mapping_activation_required": "需要映射版本激活",
}

BUSINESS_ACTION_CN = {
    "action_allowed": "可考虑业务动作",
    "manual_confirmation_required": "需要人工确认",
    "action_blocked": "暂不可执行业务动作",
    "observe_only": "仅观察",
}

SUGGESTION_CN = {
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

RISK_REASON_CN = {
    "abnormal_spike": "存在异常峰值，需确认是否为一次性收入或特殊事件",
    "aggregate_projection_gap": "汇总口径与明细口径存在缺口，正式发布前需修正",
    "bounded_but_forecastable_with_conservative_interval": "历史表现可建模，但必须使用保守预测区间",
    "business_form_mixed": "业务形态混合，建议人工确认解释口径",
    "buyout_or_oneoff_income": "可能包含买断或一次性收入，预测需谨慎",
    "channel_concentration": "渠道集中度较高，需关注单一渠道波动风险",
    "channel_concentration_advisory": "存在渠道集中提示，运营复核时需留意",
    "copyright_date_conflict": "版权日期存在冲突，正式发布前需修正",
    "copyright_expiry": "版权已到期或接近到期，需续约复核",
    "formal_data_fix_required": "正式数据存在修正项，本地算法验证不等于正式可发布",
    "formal_readiness_not_blocking_local_algorithm_validation": "不阻塞本地算法验证",
    "formal_waiver_required": "正式发布前需要业务豁免或授权",
    "high_value_with_data_gap": "高价值作品存在数据缺口，需要人工确认",
    "high_value_with_expiry": "高价值作品存在版权到期风险",
    "inactive_tail": "长尾或沉寂作品，建议以保守动作处理",
    "incomplete_month_boundary": "存在不完整月份边界，需避免把未完整月份当成正式依据",
    "insufficient_history": "历史不足，不能直接形成稳定判断",
    "insufficient_revenue_history": "收入历史不足，需要更多月份验证",
    "insufficient_revenue_time_series": "可用于回测的收入时间序列不足",
    "low_materiality_or_zero_heavy_pattern": "收入规模低或零收入月份偏多，建议仅观察",
    "manual_confirmation_required": "需要人工确认后再执行运营动作",
    "mapping_activation_required": "需要映射版本激活后才能进入正式发布链路",
    "mapping_not_active": "映射版本尚未激活",
    "mapping_uncertainty": "映射关系存在不确定性",
    "mapping_version_inactive": "映射版本未激活",
    "material_stable_history": "收入规模和历史稳定性支持数值预测",
    "material_tail_or_zero_heavy_but_backtestable": "虽有长尾或零收入特征，但历史仍可回测，适合保守预测",
    "metadata_gap": "基础信息存在缺口",
    "missing_basic_info": "基础信息缺失，正式发布前需补齐",
    "missing_copyright_end": "版权到期日缺失，需要补齐或业务豁免",
    "no_backtestable_revenue_history": "没有可回测收入历史",
    "no_business_action_blocker": "未发现业务动作层面的直接阻断",
    "observe_only_forecastability_status": "预测状态要求仅观察，不能包装成直接决策依据",
    "promote": "推广建议需要人工确认，避免高估后直接投放",
    "renewal_review": "续约建议需要人工确认版权和收益依据",
    "revenue_decline": "收入下滑，需要关注生命周期和投入回收",
    "severe_data_gap_or_copyright_fallback": "存在严重数据缺口或版权兜底口径",
    "true_forecast_blocked_before_action": "预测已被阻断，不能直接执行业务动作",
    "unresolved_spike_or_oneoff_income": "异常峰值或一次性收入尚未解决，暂不适合数值预测",
    "v1_1_spike_damped_conservative_boundary": "v1.1 已把异常峰值样本压入保守边界",
}

REVENUE_CN = {
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
    "bottom_50_percent": "后50%",
    "data_gap_or_copyright_fallback": "数据缺口或版权兜底",
    "abnormal_spike": "异常峰值",
    "copyright_expiry": "版权到期风险",
}

CONFIDENCE_CN = {
    "high": "高",
    "medium": "中",
    "low": "低",
    "blocked_for_business_use": "业务使用阻断",
    "nan": "未提供",
    "None": "未提供",
}

INTERVAL_REASON_CN = {
    "high confidence interval from volatility, revenue scale, lifecycle, and model family": "基于波动、收入规模、生命周期和模型族生成高置信区间",
    "medium confidence interval from volatility, revenue scale, lifecycle, and model family": "基于波动、收入规模、生命周期和模型族生成中等置信区间",
    "low confidence interval from volatility, revenue scale, lifecycle, and model family": "基于波动、收入规模、生命周期和模型族生成低置信区间",
    "blocked_for_business_use confidence interval from volatility, revenue scale, lifecycle, and model family": "业务使用阻断，仅保留系统边界说明",
    "rolling_prior_residual_quantile_by_confidence_lifecycle_rating_scale": "按置信度、生命周期、评级和收入规模使用历史残差分位数校准",
    "bounded_by_confidence_cap": "受置信度上限约束",
}

SELECTION_REASON_CN = {
    "inactive, long-tail, D/E, or low-revenue guard": "沉寂、长尾、低评级或低收入保护",
    "established lifecycle signal": "生命周期信号较稳定",
    "spike-sensitive work uses robust trimmed signal": "异常峰值样本使用稳健截尾信号",
    "insufficient history shrinkage": "历史不足时使用收缩处理",
}

MODEL_CN = {
    "model_a_trailing_baseline": "历史滚动基线模型",
    "raw_trailing_baseline": "历史滚动基线模型",
    "model_b_lifecycle_robust": "生命周期稳健模型",
    "model_c_zero_inflated": "零收入/稀疏收入模型",
    "model_c_zero_inflated_sparse": "零收入/稀疏收入模型",
    "model_d_hierarchical_shrinkage": "分层收缩模型",
    "model_e_selector": "模型选择器",
    "model_f_forecastability_gated": "可预测性分流模型",
    "model_h_disentangled_forecast_v1_1": "v1.1 条件冻结预测模型",
    "no_business_numeric_forecast": "不输出业务可用数值预测",
    "observe_only_no_business_numeric_forecast": "仅观察，不输出业务可用数值预测",
    "observe_only_no_numeric_forecast": "仅观察，不输出业务可用数值预测",
    "true_forecast_blocked": "暂不可预测",
    "conservative_numeric_forecast": "可保守预测",
    "numeric_forecast_eligible": "可数值预测",
}

MODEL_REASON_CN = {
    "work-level signal shrunk toward lifecycle/revenue cohort prior": "单作品信号不足，预测向相同生命周期/收入层级的保守先验收缩",
    "lifecycle signal stable": "生命周期信号较稳定",
    "zero-heavy or sparse revenue": "零收入月份较多或收入稀疏",
    "spike damped": "已对异常峰值做降权处理",
    "inactive, long-tail, D/E, or low-revenue guard": "沉寂、长尾、低评级或低收入保护",
    "established lifecycle signal": "生命周期信号较稳定",
    "spike-sensitive work uses robust trimmed signal": "已对异常峰值做降权处理",
    "insufficient history shrinkage": "历史不足时使用收缩处理",
    "no_business_numeric_forecast": "该样本不适合输出普通业务数值预测，仅用于观察或人工复核。",
    "collect_more_revenue_history_before_numeric_forecast": "收入历史不足，需要补充更多完整收入月份后再做数值预测。",
    "observe_only_no_business_numeric_forecast": "仅观察，不输出业务可用数值预测。",
    "exclude_from_numeric_forecast_baseline": "该样本不纳入数值预测基线验收，需排除出预测基线统计。",
    "manual_review_or_spike_damped_backtest_required": "需要人工复核，或需要进行异常峰值降权后的回测验证。",
}

MAIN_READING_FORBIDDEN_PATTERNS = [
    "未映射",
    "model_",
    "_forecast",
    "_required",
    "_blocked",
    "_baseline",
    "_numeric",
    "no_business_numeric_forecast",
    "observe_only_no_business_numeric_forecast",
    "manual_review_or_spike_damped_backtest_required",
    "collect_more_revenue_history_before_numeric_forecast",
    "exclude_from_numeric_forecast_baseline",
]

AUXILIARY_RAW_CODE_HEADER = re.compile(r"^原始.*code$", re.IGNORECASE)

FILLING_OPTIONS = {
    "forecastTrust": ["可信", "基本可信", "不确定", "不可信", "不适用"],
    "ratingReasonable": ["合理", "基本合理", "不确定", "不合理", "不适用"],
    "suggestionExecutable": ["可执行", "需要人工确认", "仅供参考", "不可执行", "不适用"],
    "issueType": [
        "无明显问题",
        "预测偏高",
        "预测偏低",
        "评级偏高",
        "评级偏低",
        "建议不合理",
        "风险识别遗漏",
        "版权/数据问题",
        "业务常识冲突",
        "其他",
    ],
    "m4CalibrationCandidate": ["是", "否", "待定"],
    "userPriority": ["高", "中", "低"],
}


def safe_float(value, default: float = 0.0) -> float:
    return bake.safe_float(value, default)


def safe_int(value, default: int = 0) -> int:
    return bake.safe_int(value, default)


def rounded(value, digits: int = 4):
    return bake.rounded(value, digits)


def percent(part, total) -> float:
    total = safe_float(total)
    if total <= 0:
        return 0.0
    return rounded(safe_float(part) / total)


def json_default(value):
    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            pass
    if isinstance(value, Path):
        return str(value)
    return str(value)


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, default=json_default), encoding="utf-8")


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def markdown_table(rows: list[dict], columns: list[tuple[str, str]]) -> str:
    return bake.markdown_table(rows, columns)


def as_list(value) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value if str(item)]
    if isinstance(value, tuple):
        return [str(item) for item in value if str(item)]
    if value is None:
        return []
    if isinstance(value, float) and math.isnan(value):
        return []
    if isinstance(value, str) and value:
        return [value]
    return []


def translate(value, mapping: dict[str, str]) -> str:
    if value is None:
        return "未提供"
    text = str(value)
    if not text or text == "nan":
        return "未提供"
    return mapping.get(text, f"未映射：{text}")


def translate_model_code(value) -> str:
    return translate(value, MODEL_CN)


def translate_model_reason(value) -> str:
    return translate(value, MODEL_REASON_CN)


def describe_codes(values, mapping: dict[str, str], empty: str) -> str:
    labels = []
    for value in as_list(values):
        label = translate(value, mapping)
        if label not in labels:
            labels.append(label)
    return "；".join(labels) if labels else empty


def yes_no(value) -> str:
    if value is True:
        return "是"
    if value is False:
        return "否"
    if str(value).lower() in {"true", "yes", "1"}:
        return "是"
    if str(value).lower() in {"false", "no", "0"}:
        return "否"
    return "待确认"


def money(value):
    if value is None:
        return None
    value = safe_float(value, 0.0)
    return round(value, 2)


def amount_bucket(value: float) -> str:
    amount = safe_float(value)
    if amount <= 0:
        return "0"
    if amount < 100:
        return "0-100"
    if amount < 1000:
        return "100-1,000"
    if amount < 10000:
        return "1,000-10,000"
    if amount < 100000:
        return "10,000-100,000"
    return "100,000+"


def build_v1_1_frames() -> dict:
    prepared = v1.prepare_inputs()
    evaluated = prepared["evaluated"].copy()
    raw_cases = prepared["cases"].copy()
    final_outputs = prepared["finalOutputs"].copy()

    evaluated["workKey"] = evaluated["standardWorkId"].astype(str)
    final_outputs["workKey"] = final_outputs["workKey"].astype(str)

    gate = v1.build_current_gate_frame(evaluated, final_outputs)
    gate["workKey"] = gate["workKey"].astype(str)
    gate, gate_changes = v11.apply_v1_1_gate_boundary(gate, final_outputs)

    coverage = v1.build_coverage_report(gate)
    cases = v1.build_disentangled_cases(raw_cases, gate)
    cases, interval_rows = v11.apply_interval_calibration(cases)
    validation = v1.build_validation_report(cases, gate, coverage)
    validation = v11.enrich_validation(validation, cases, coverage)

    eval_columns = [
        "workKey",
        "last3MonthRevenue",
        "last6MonthRevenue",
        "last24MonthRevenue",
        "riskCodes",
        "suggestionCodes",
        "dataReadinessCodes",
        "manualReviewBlockingReasons",
        "manualReviewAdvisoryReasons",
        "peakMonthShare",
        "last6CoefficientOfVariation",
        "businessFormCount",
        "channelConcentration",
        "remainingCopyrightMonths",
    ]
    output_columns = [
        "workKey",
        "intervalReason",
        "selectionReason",
        "dataSufficiencyFlag",
        "spikeAdjustedFlag",
        "lowRevenueGuardFlag",
        "inactiveLongTailGuardFlag",
        "dataGapFlag",
        "abnormalSpikeFlag",
    ]
    enriched_gate = gate.merge(evaluated[eval_columns], on="workKey", how="left")
    enriched_gate = enriched_gate.merge(final_outputs[output_columns], on="workKey", how="left")
    enriched_gate = enriched_gate.sort_values(["totalHistoricalRevenue", "anonymousId"], ascending=[False, True])

    return {
        "gate": enriched_gate,
        "cases": cases,
        "coverage": coverage,
        "validation": validation,
        "gateChanges": gate_changes,
        "intervalRows": interval_rows,
    }


def feature_set(row) -> set[str]:
    features = {
        f"rating:{row.get('rating')}",
        f"lifecycle:{row.get('lifecycle')}",
        f"revenue:{row.get('revenueBucket')}",
        f"materiality:{row.get('materialityBucket')}",
        f"forecastability:{row.get('forecastabilityStatus')}",
        f"formal:{row.get('formalReadinessStatus')}",
        f"action:{row.get('businessActionStatus')}",
        f"riskBucket:{row.get('riskBucket')}",
        f"suggestionBucket:{row.get('suggestionBucket')}",
    }
    for code in as_list(row.get("riskCodes")) + as_list(row.get("forecastabilityReasonCodes")):
        features.add(f"risk:{code}")
    for code in as_list(row.get("suggestionCodes")):
        features.add(f"suggestion:{code}")
    return {feature for feature in features if not feature.endswith(":None") and not feature.endswith(":nan")}


def required_features() -> set[str]:
    required = set()
    for rating in ["S+", "S", "A", "B", "C", "D", "E"]:
        required.add(f"rating:{rating}")
    for lifecycle in ["growth", "stable", "rebound", "declining", "long_tail", "inactive", "insufficient_history"]:
        required.add(f"lifecycle:{lifecycle}")
    for revenue in ["high", "mid", "low", "long_tail"]:
        required.add(f"revenue:{revenue}")
    for status in [
        v1.NUMERIC_STATUS,
        v1.CONSERVATIVE_STATUS,
        v1.OBSERVE_STATUS,
        v1.TRUE_BLOCKED_STATUS,
    ]:
        required.add(f"forecastability:{status}")
    for suggestion in [
        "promote",
        "maintain",
        "reduce_investment",
        "downlist_or_suspend",
        "renewal_review",
        "observe_only",
    ]:
        required.add(f"suggestion:{suggestion}")
    for risk in [
        "abnormal_spike",
        "buyout_or_oneoff_income",
        "insufficient_history",
        "insufficient_revenue_history",
        "missing_copyright_end",
        "missing_basic_info",
        "aggregate_projection_gap",
        "revenue_decline",
    ]:
        required.add(f"risk:{risk}")
    return required


def row_priority(row) -> tuple:
    risk_score = len(as_list(row.get("riskCodes"))) + len(as_list(row.get("forecastabilityReasonCodes")))
    manual_bonus = 1 if row.get("businessActionStatus") == v1.MANUAL_CONFIRMATION_STATUS else 0
    return (
        safe_float(row.get("totalHistoricalRevenue")),
        risk_score,
        manual_bonus,
        str(row.get("anonymousId")),
    )


def select_system_samples(frame: pd.DataFrame, count: int = 20) -> list[dict]:
    rows = frame.to_dict(orient="records")
    uncovered = required_features()
    selected: list[dict] = []
    selected_keys: set[str] = set()

    while len(selected) < count and len(selected_keys) < len(rows):
        best = None
        best_key = None
        for row in rows:
            key = str(row["workKey"])
            if key in selected_keys:
                continue
            features = feature_set(row)
            coverage_gain = len(features.intersection(uncovered))
            diversity_gain = len(features.difference(set().union(*(feature_set(item) for item in selected)) if selected else set()))
            priority = row_priority(row)
            candidate_key = (coverage_gain, diversity_gain, *priority)
            if best is None or candidate_key > best_key:
                best = row
                best_key = candidate_key
        if best is None:
            break
        selected.append(best)
        selected_keys.add(str(best["workKey"]))
        uncovered.difference_update(feature_set(best))

    if len(selected) < count:
        for row in rows:
            if str(row["workKey"]) in selected_keys:
                continue
            selected.append(row)
            selected_keys.add(str(row["workKey"]))
            if len(selected) >= count:
                break
    return selected


def select_boundary_samples(frame: pd.DataFrame, excluded_keys: set[str], count: int = 5) -> list[dict]:
    rows = frame.to_dict(orient="records")
    categories = [
        (
            "高收入但预测置信度不高",
            lambda row: row.get("materialityBucket") in {"top_1_percent", "top_5_percent", "top_10_percent"}
            and str(row.get("forecastConfidence")) != "high",
        ),
        (
            "低收入但评级偏高",
            lambda row: row.get("materialityBucket") in {"bottom_50_percent", "near_zero"}
            and row.get("rating") in {"S+", "S", "A", "B"},
        ),
        (
            "下架或暂停候选但历史收入不低",
            lambda row: "downlist_or_suspend" in as_list(row.get("suggestionCodes"))
            and row.get("materialityBucket") in {"top_10_percent", "middle_40_percent", "top_5_percent", "top_1_percent"},
        ),
        (
            "推广候选但预测需要提醒",
            lambda row: "promote" in as_list(row.get("suggestionCodes"))
            and (
                str(row.get("forecastConfidence")) != "high"
                or row.get("formalReadinessStatus") != v1.READY_STATUS
                or row.get("businessActionStatus") == v1.MANUAL_CONFIRMATION_STATUS
            ),
        ),
        (
            "续约候选但版权或收入证据不强",
            lambda row: "renewal_review" in as_list(row.get("suggestionCodes"))
            and (
                row.get("remainingCopyrightBucket") in {"fallback", "expired_or_zero", "0_to_12"}
                or any(code in as_list(row.get("riskCodes")) for code in ["missing_copyright_end", "copyright_expiry", "missing_basic_info"])
            ),
        ),
        (
            "异常峰值或历史不足",
            lambda row: any(
                code in as_list(row.get("riskCodes")) + as_list(row.get("forecastabilityReasonCodes"))
                for code in [
                    "abnormal_spike",
                    "buyout_or_oneoff_income",
                    "insufficient_history",
                    "insufficient_revenue_time_series",
                    "unresolved_spike_or_oneoff_income",
                ]
            ),
        ),
    ]
    selected: list[dict] = []
    selected_keys = set(excluded_keys)

    for label, predicate in categories:
        candidates = [row for row in rows if str(row["workKey"]) not in selected_keys and predicate(row)]
        candidates.sort(key=row_priority, reverse=True)
        if candidates:
            chosen = dict(candidates[0])
            chosen["boundaryCategory"] = label
            selected.append(chosen)
            selected_keys.add(str(chosen["workKey"]))
        if len(selected) >= count:
            break

    if len(selected) < count:
        fallback = [
            row
            for row in rows
            if str(row["workKey"]) not in selected_keys
            and (
                row.get("formalReadinessStatus") != v1.READY_STATUS
                or row.get("businessActionStatus") != v1.ACTION_ALLOWED_STATUS
                or len(as_list(row.get("riskCodes"))) >= 2
            )
        ]
        fallback.sort(key=row_priority, reverse=True)
        for row in fallback:
            chosen = dict(row)
            chosen["boundaryCategory"] = "综合高风险边界"
            selected.append(chosen)
            selected_keys.add(str(chosen["workKey"]))
            if len(selected) >= count:
                break
    return selected[:count]


def latest_case_lookup(cases: pd.DataFrame) -> dict[tuple[str, int], dict]:
    subset = cases[cases["horizonMonths"].isin([3, 6, 12])].copy()
    subset["workKey"] = subset["workKey"].astype(str)
    subset = subset.sort_values(["workKey", "horizonMonths", "cutoffMonth"])
    lookup: dict[tuple[str, int], dict] = {}
    for (work_key, horizon), group in subset.groupby(["workKey", "horizonMonths"]):
        lookup[(str(work_key), int(horizon))] = group.iloc[-1].to_dict()
    return lookup


def system_limit(row) -> str:
    parts = []
    status = row.get("forecastabilityStatus")
    if status == v1.TRUE_BLOCKED_STATUS:
        parts.append("暂不可预测，仅供人工复核，不能作为业务决策预测")
    elif status == v1.OBSERVE_STATUS:
        parts.append("仅观察，不输出业务可用数值预测")
    elif status == v1.CONSERVATIVE_STATUS:
        parts.append("可保守预测，必须结合人工复核")
    else:
        parts.append("可用于有限M2业务复核，仍不是正式发布审批")
    if row.get("formalReadinessStatus") != v1.READY_STATUS:
        parts.append("正式发布仍受数据修正、授权或版权口径限制")
    if row.get("businessActionStatus") != v1.ACTION_ALLOWED_STATUS:
        parts.append("业务动作执行前需要人工确认或继续观察")
    return "；".join(parts)


def rating_reason(row) -> str:
    lifecycle = translate(row.get("lifecycle"), LIFECYCLE_CN)
    revenue = translate(row.get("revenueBucket"), REVENUE_CN)
    materiality = translate(row.get("materialityBucket"), REVENUE_CN)
    return f"评级为 {row.get('rating')}，主要参考收入规模（{revenue}/{materiality}）、生命周期（{lifecycle}）和近12月收入表现。"


def primary_secondary_suggestions(row) -> tuple[str, str]:
    codes = as_list(row.get("suggestionCodes"))
    labels = [translate(code, SUGGESTION_CN) for code in codes]
    labels = [label for index, label in enumerate(labels) if label not in labels[:index]]
    if not labels:
        return "无明确运营建议", ""
    if len(labels) == 1:
        return labels[0], ""
    return labels[0], "；".join(labels[1:])


def task_row(row: dict, source: str, sample_number: str, cases_lookup: dict[tuple[str, int], dict]) -> dict:
    primary, secondary = primary_secondary_suggestions(row)
    result = {
        "样本编号": sample_number,
        "样本来源": source,
        "匿名作品引用": str(row.get("anonymousId") or ""),
        "是否可数值预测": yes_no(row.get("forecastabilityStatus") in NUMERIC_STATUSES),
        "正式发布状态": translate(row.get("formalReadinessStatus"), FORMAL_CN),
        "业务动作状态": translate(row.get("businessActionStatus"), BUSINESS_ACTION_CN),
        "评级": str(row.get("rating") or ""),
        "生命周期": translate(row.get("lifecycle"), LIFECYCLE_CN),
        "收入规模": translate(row.get("revenueBucket"), REVENUE_CN),
        "最近3月收入": money(row.get("last3MonthRevenue")),
        "最近6月收入": money(row.get("last6MonthRevenue")),
        "最近12月收入": money(row.get("last12MonthRevenue")),
        "最近24月收入": money(row.get("last24MonthRevenue")),
        "历史累计收入区间": amount_bucket(safe_float(row.get("totalHistoricalRevenue"))),
        "活跃月份数": safe_int(row.get("activeMonthCount")),
        "零收入月份数": safe_int(row.get("zeroRevenueMonthCount")),
        "是否存在异常峰值": yes_no(
            "abnormal_spike" in as_list(row.get("riskCodes"))
            or "buyout_or_oneoff_income" in as_list(row.get("riskCodes"))
            or str(row.get("abnormalSpikeFlag")) == "yes"
        ),
        "是否存在版权或数据缺口": yes_no(
            any(
                code in as_list(row.get("riskCodes"))
                for code in ["missing_copyright_end", "missing_basic_info", "aggregate_projection_gap", "copyright_expiry"]
            )
            or str(row.get("dataGapFlag")) == "yes"
        ),
        "基准预测": money(row.get("baseForecast")),
        "乐观预测": money(row.get("optimisticForecast")),
        "保守预测": money(row.get("pessimisticForecast")),
        "预测置信度": translate(row.get("forecastConfidence"), CONFIDENCE_CN),
        "预测区间原因": translate(row.get("intervalReason"), INTERVAL_REASON_CN),
    }

    for horizon in [3, 6, 12]:
        case = cases_lookup.get((str(row.get("workKey")), horizon), {})
        result[f"{horizon}个月回测：预测值"] = money(case.get("predicted"))
        result[f"{horizon}个月回测：实际值"] = money(case.get("actual"))
        result[f"{horizon}个月回测：误差"] = money(case.get("absoluteError"))
        result[f"{horizon}个月回测：是否优于基线"] = yes_no(case.get("betterThanBaseline"))

    result.update(
        {
        "评级理由": rating_reason(row),
        "风险摘要": describe_codes(
            as_list(row.get("riskCodes")) + as_list(row.get("forecastabilityReasonCodes")) + as_list(row.get("formalReadinessReasonCodes")),
            RISK_REASON_CN,
            "未发现主要风险",
        ),
        "主要运营建议": primary,
        "次要运营建议": secondary,
        "建议触发依据": describe_codes(as_list(row.get("businessActionReasonCodes")), RISK_REASON_CN, "未发现业务动作阻断"),
        "是否需要人工确认": yes_no(
            row.get("businessActionStatus") != v1.ACTION_ALLOWED_STATUS
            or row.get("formalReadinessStatus") != v1.READY_STATUS
            or row.get("forecastabilityStatus") != v1.NUMERIC_STATUS
        ),
        "系统限制说明": system_limit(row),
        "运营判断：预测是否可信": "",
        "运营判断：评级是否合理": "",
        "运营判断：建议是否可执行": "",
        "运营发现的问题类型": "",
        "运营建议修正": "",
        "是否应进入M4校准案例池": "",
        "原始生命周期code": str(row.get("lifecycle") or ""),
        "原始预测状态code": str(row.get("forecastabilityStatus") or ""),
        "原始正式发布状态code": str(row.get("formalReadinessStatus") or ""),
        "原始业务动作状态code": str(row.get("businessActionStatus") or ""),
        "原始建议code": ";".join(as_list(row.get("suggestionCodes"))),
        "原始风险code": ";".join(as_list(row.get("riskCodes"))),
        }
    )
    return result


def blank_user_rows() -> list[dict]:
    return [
        {
            "样本编号": f"USR-{index:03d}",
            "样本来源": "用户预留",
            "用户指定作品ID": "",
            "指定原因": "",
            "优先级": "",
            "用户备注": "",
            "运营判断：预测是否可信": "",
            "运营判断：评级是否合理": "",
            "运营判断：建议是否可执行": "",
            "运营发现的问题类型": "",
            "运营建议修正": "",
            "是否应进入M4校准案例池": "",
        }
        for index in range(1, 6)
    ]


def backtest_rows(selected_rows: list[dict], cases: pd.DataFrame) -> list[dict]:
    selected_keys = {str(row["workKey"]): row for row in selected_rows}
    rows = []
    subset = cases[cases["workKey"].astype(str).isin(selected_keys.keys()) & cases["horizonMonths"].isin([3, 6, 12])].copy()
    subset = subset.sort_values(["workKey", "horizonMonths", "cutoffMonth"])
    latest = subset.groupby(["workKey", "horizonMonths"]).tail(1)
    for case in latest.to_dict(orient="records"):
        row = selected_keys[str(case["workKey"])]
        raw_model_code = str(case.get("selectedModel") or "")
        rows.append(
            {
                "样本编号": row["sampleNumber"],
                "样本来源": row["sampleSource"],
                "匿名作品引用": row["anonymousId"],
                "回测窗口（月）": safe_int(case["horizonMonths"]),
                "回测截止月份": str(case["cutoffMonth"]),
                "预测值": money(case["predicted"]),
                "实际值": money(case["actual"]),
                "绝对误差": money(case["absoluteError"]),
                "基线预测值": money(case["baselinePredicted"]),
                "是否优于基线": yes_no(case["betterThanBaseline"]),
                "是否落入预测区间": yes_no(case["intervalCoverage"]),
                "预测置信度": translate(case.get("confidence"), CONFIDENCE_CN),
                "评级": str(row.get("rating") or ""),
                "生命周期": translate(row.get("lifecycle"), LIFECYCLE_CN),
                "收入规模": translate(row.get("revenueBucket"), REVENUE_CN),
                "模型选择（中文）": translate_model_code(raw_model_code),
                "模型选择原因（中文）": translate_model_reason(case.get("selectionReason")),
                "原始模型code": raw_model_code,
            }
        )
    return rows


def review_rows(task_rows: list[dict]) -> list[dict]:
    rows = []
    for row in task_rows:
        if row["样本来源"] == "用户预留":
            continue
        rows.append(
            {
                "样本编号": row["样本编号"],
                "样本来源": row["样本来源"],
                "匿名作品引用": row["匿名作品引用"],
                "评级": row["评级"],
                "生命周期": row["生命周期"],
                "主要运营建议": row["主要运营建议"],
                "次要运营建议": row["次要运营建议"],
                "评级理由": row["评级理由"],
                "风险摘要": row["风险摘要"],
                "运营复核：评级是否合理": "",
                "运营复核：建议是否合理": "",
                "运营复核：需修正说明": "",
            }
        )
    return rows


def manual_rows(task_rows: list[dict]) -> list[dict]:
    rows = []
    for row in task_rows:
        if row["样本来源"] == "用户预留":
            continue
        needs_manual = row["是否需要人工确认"] == "是" or row["样本来源"] == "高风险边界"
        if needs_manual:
            rows.append(
                {
                    "样本编号": row["样本编号"],
                    "样本来源": row["样本来源"],
                    "匿名作品引用": row["匿名作品引用"],
                    "正式发布状态": row["正式发布状态"],
                    "业务动作状态": row["业务动作状态"],
                    "风险摘要": row["风险摘要"],
                    "系统限制说明": row["系统限制说明"],
                    "人工确认结论": "",
                    "确认人备注": "",
                }
            )
    return rows


def m4_rows(task_rows: list[dict]) -> list[dict]:
    return [
        {
            "样本编号": row["样本编号"],
            "样本来源": row["样本来源"],
            "匿名作品引用": row["匿名作品引用"],
            "评级": row["评级"],
            "生命周期": row["生命周期"],
            "主要运营建议": row["主要运营建议"],
            "候选原因": row["风险摘要"] if row["样本来源"] == "高风险边界" else "待运营判断",
            "是否应进入M4校准案例池": "",
            "M4校准候选说明": "",
        }
        for row in task_rows
        if row["样本来源"] != "用户预留"
    ]


def acceptance_rows(validation: dict, sample_summary: dict) -> list[dict]:
    score = validation["forecastableCohortScore"]
    issue = validation["issueSummary"]
    spread = validation["spreadSummary"]
    return [
        {"项目": "冻结候选", "当前值": CANDIDATE_VERSION, "验收说明": "仅限 forecastable cohort 的有限M2业务复核"},
        {"项目": "是否进入M3", "当前值": "否", "验收说明": "本轮不进入M3"},
        {"项目": "v1.1 WAPE", "当前值": score["wape"], "验收说明": "已优于同 cohort baseline"},
        {"项目": "baseline WAPE", "当前值": score["baselineWape"], "验收说明": "同 cohort 对比基线"},
        {"项目": "区间覆盖率", "当前值": score["intervalCoverage"], "验收说明": "仍需业务关注高价值覆盖"},
        {"项目": "P0", "当前值": issue["p0"], "验收说明": "高收入样本不得出现P0"},
        {"项目": "P1", "当前值": issue["p1"], "验收说明": "严重问题应保持为0"},
        {"项目": "P2", "当前值": issue["p2"], "验收说明": "可解释告警仍需运营复核"},
        {"项目": "高置信spread P75", "当前值": spread["highConfidenceSpreadP75"], "验收说明": "冻结条件之一"},
        {"项目": "非低置信spread P75", "当前值": spread["nonLowConfidenceSpreadP75"], "验收说明": "冻结条件之一"},
        {"项目": "系统分层样本数", "当前值": sample_summary["system"], "验收说明": "必须为20"},
        {"项目": "用户预留样本数", "当前值": sample_summary["userReserved"], "验收说明": "必须为5"},
        {"项目": "高风险边界样本数", "当前值": sample_summary["highRisk"], "验收说明": "必须为5"},
        {"项目": "运营填报状态", "当前值": "待填写", "验收说明": "用户填写后再生成 operator validation summary"},
    ]


def instruction_rows() -> list[dict]:
    return [
        {"项目": "任务目的", "说明": "用30部匿名作品任务卡验证 v1.1 conditional 是否可作为有限M2业务复核基线。"},
        {"项目": "适用范围", "说明": "仅适用于本地真实数据开发模式下的 forecastable cohort，非正式发布审批。"},
        {"项目": "样本构成", "说明": "20部系统分层样本、5行用户预留、5部高风险边界样本。"},
        {"项目": "填写要求", "说明": "用户只需要重点填写：运营判断：预测是否可信、运营判断：评级是否合理、运营判断：建议是否可执行、运营发现的问题类型、运营建议修正、是否应进入M4校准案例池。"},
        {"项目": "用户指定作品", "说明": "用户先填写作品 ID；后续再由 Codex 读取并补生成任务卡。当前 5 行为空是正常状态，不需要伪造样本。"},
        {"项目": "暂不可预测/仅观察", "说明": "不要按普通预测准确率评价，应判断系统是否正确阻止业务使用。"},
        {"项目": "可保守预测", "说明": "重点判断预测方向是否合理，不要求精确数值。"},
        {"项目": "安全边界", "说明": "任务包不含真实作品名、作者名、渠道名，不提交私有Excel。"},
        {"项目": "评级值", "说明": "评级值保留 S+ / S / A / B / C / D / E，不做汉化。"},
        {"项目": "M4说明", "说明": "M4校准案例池仅做候选沉淀，本轮不实现自学习。"},
    ]


def build_samples(frames: dict) -> dict:
    gate = frames["gate"]
    cases = frames["cases"]
    cases_lookup = latest_case_lookup(cases)
    system = select_system_samples(gate, 20)
    excluded = {str(row["workKey"]) for row in system}
    high_risk = select_boundary_samples(gate, excluded, 5)

    real_rows: list[dict] = []
    task_rows: list[dict] = []
    for index, row in enumerate(system, start=1):
        row = dict(row)
        row["sampleNumber"] = f"SYS-{index:03d}"
        row["sampleSource"] = "系统分层选择"
        real_rows.append(row)
        task_rows.append(task_row(row, "系统分层选择", row["sampleNumber"], cases_lookup))
    for index, row in enumerate(high_risk, start=1):
        row = dict(row)
        row["sampleNumber"] = f"RISK-{index:03d}"
        row["sampleSource"] = "高风险边界"
        real_rows.append(row)
        task_rows.append(task_row(row, "高风险边界", row["sampleNumber"], cases_lookup))

    user_rows = blank_user_rows()
    for row in user_rows:
        task_rows.append(
            {
                "样本编号": row["样本编号"],
                "样本来源": "用户预留",
                "匿名作品引用": "",
                "是否可数值预测": "",
                "正式发布状态": "",
                "业务动作状态": "",
                "评级": "",
                "生命周期": "",
                "收入规模": "",
                "最近3月收入": "",
                "最近6月收入": "",
                "最近12月收入": "",
                "最近24月收入": "",
                "历史累计收入区间": "",
                "活跃月份数": "",
                "零收入月份数": "",
                "是否存在异常峰值": "",
                "是否存在版权或数据缺口": "",
                "基准预测": "",
                "乐观预测": "",
                "保守预测": "",
                "预测置信度": "",
                "预测区间原因": "",
                "3个月回测：预测值": "",
                "3个月回测：实际值": "",
                "3个月回测：误差": "",
                "3个月回测：是否优于基线": "",
                "6个月回测：预测值": "",
                "6个月回测：实际值": "",
                "6个月回测：误差": "",
                "6个月回测：是否优于基线": "",
                "12个月回测：预测值": "",
                "12个月回测：实际值": "",
                "12个月回测：误差": "",
                "12个月回测：是否优于基线": "",
                "评级理由": "",
                "风险摘要": "",
                "主要运营建议": "",
                "次要运营建议": "",
                "建议触发依据": "",
                "是否需要人工确认": "",
                "系统限制说明": "请填写用户指定作品ID后再生成复核结果，本行不伪造样本。",
                "运营判断：预测是否可信": "",
                "运营判断：评级是否合理": "",
                "运营判断：建议是否可执行": "",
                "运营发现的问题类型": "",
                "运营建议修正": "",
                "是否应进入M4校准案例池": "",
                "原始生命周期code": "",
                "原始预测状态code": "",
                "原始正式发布状态code": "",
                "原始业务动作状态code": "",
                "原始建议code": "",
                "原始风险code": "",
            }
        )

    summary = {
        "system": len(system),
        "userReserved": len(user_rows),
        "highRisk": len(high_risk),
        "actualWorkSamples": len(real_rows),
        "taskRows": len(task_rows),
    }
    assert summary["system"] == 20
    assert summary["userReserved"] == 5
    assert summary["highRisk"] == 5
    assert summary["taskRows"] == 30

    return {
        "system": system,
        "highRisk": high_risk,
        "userReserved": user_rows,
        "realRows": real_rows,
        "taskRows": task_rows,
        "backtestRows": backtest_rows(real_rows, cases),
        "summary": summary,
    }


def coverage_summary(samples: list[dict]) -> dict:
    def count(field: str) -> dict:
        return dict(Counter(str(row.get(field)) for row in samples))

    risk_counter = Counter()
    suggestion_counter = Counter()
    for row in samples:
        risk_counter.update(as_list(row.get("riskCodes")))
        risk_counter.update(as_list(row.get("forecastabilityReasonCodes")))
        suggestion_counter.update(as_list(row.get("suggestionCodes")))
    return {
        "ratings": count("rating"),
        "lifecycles": count("lifecycle"),
        "revenueBuckets": count("revenueBucket"),
        "forecastabilityStatuses": count("forecastabilityStatus"),
        "formalReadinessStatuses": count("formalReadinessStatus"),
        "businessActionStatuses": count("businessActionStatus"),
        "suggestions": dict(suggestion_counter),
        "risksAndReasons": dict(risk_counter),
    }


def sanitized_sample_rows(samples: list[dict]) -> list[dict]:
    rows = []
    for row in samples:
        primary, secondary = primary_secondary_suggestions(row)
        rows.append(
            {
                "sampleNumber": row["sampleNumber"],
                "sampleSource": row["sampleSource"],
                "anonymousId": row["anonymousId"],
                "rating": row["rating"],
                "lifecycle": translate(row["lifecycle"], LIFECYCLE_CN),
                "revenueScale": translate(row["revenueBucket"], REVENUE_CN),
                "forecastabilityStatus": translate(row["forecastabilityStatus"], FORECASTABILITY_CN),
                "formalReadinessStatus": translate(row["formalReadinessStatus"], FORMAL_CN),
                "businessActionStatus": translate(row["businessActionStatus"], BUSINESS_ACTION_CN),
                "primarySuggestion": primary,
                "secondarySuggestion": secondary,
                "riskSummary": describe_codes(
                    as_list(row.get("riskCodes")) + as_list(row.get("forecastabilityReasonCodes")),
                    RISK_REASON_CN,
                    "未发现主要风险",
                ),
            }
        )
    return rows


def write_selection_report(payload: dict) -> None:
    sample_rows = sanitized_sample_rows(payload["samples"]["realRows"])
    coverage = coverage_summary(payload["samples"]["realRows"])
    json_payload = {
        "schema": "m2.v1_1.operator_task_selection.cn.v1",
        "generatedAt": payload["generatedAt"],
        "candidateVersion": CANDIDATE_VERSION,
        "workbookPath": "data/private-output/m2-business-review/m2-v1.1-30-work-operator-task-pack-cn.xlsx",
        "summary": payload["samples"]["summary"],
        "coverage": coverage,
        "selectedSamples": sample_rows,
        "safeOutputBoundary": payload["safeOutputBoundary"],
    }
    write_json(SELECTION_JSON, json_payload)
    rows = [
        {
            "样本编号": row["sampleNumber"],
            "来源": row["sampleSource"],
            "匿名ID": row["anonymousId"],
            "评级": row["rating"],
            "生命周期": row["lifecycle"],
            "收入规模": row["revenueScale"],
            "预测状态": row["forecastabilityStatus"],
            "主要建议": row["primarySuggestion"],
        }
        for row in sample_rows
    ]
    content = f"""# M2 v1.1 30部运营任务选择说明（中文）

生成时间：{payload["generatedAt"]}

冻结候选：`{CANDIDATE_VERSION}`

本任务包用于让运营人工复核当前 v1.1 conditional 是否可作为有限 M2 业务复核基线。它不是正式发布审批，不进入 M3，不包含真实作品名、作者名、渠道名或原始账单明细。

## 样本构成

- 系统分层选择：{payload["samples"]["summary"]["system"]} 部
- 用户预留：{payload["samples"]["summary"]["userReserved"]} 行空白输入
- 高风险边界样本：{payload["samples"]["summary"]["highRisk"]} 部
- 实际匿名作品样本：{payload["samples"]["summary"]["actualWorkSamples"]} 部
- 任务卡总行数：{payload["samples"]["summary"]["taskRows"]} 行

## 选择方法

系统分层样本使用确定性贪心覆盖，不随机抽样，优先覆盖评级、生命周期、收入规模、预测状态、正式发布状态、业务动作状态、建议和风险原因。高风险边界样本覆盖高收入低置信、低收入高评级、下架候选但历史收入不低、推广候选但预测需提醒、续约候选但证据不强、异常峰值或历史不足等边界。

## 覆盖摘要

- 评级覆盖：{json.dumps(coverage["ratings"], ensure_ascii=False)}
- 生命周期覆盖：{json.dumps(coverage["lifecycles"], ensure_ascii=False)}
- 收入规模覆盖：{json.dumps(coverage["revenueBuckets"], ensure_ascii=False)}
- 预测状态覆盖：{json.dumps(coverage["forecastabilityStatuses"], ensure_ascii=False)}
- 建议覆盖：{json.dumps(coverage["suggestions"], ensure_ascii=False)}

## 样本清单（匿名）

{markdown_table(rows, [
    ("样本编号", "样本编号"),
    ("来源", "来源"),
    ("匿名ID", "匿名ID"),
    ("评级", "评级"),
    ("生命周期", "生命周期"),
    ("收入规模", "收入规模"),
    ("预测状态", "预测状态"),
    ("主要建议", "主要建议"),
])}

## 安全边界

- 不输出真实作品名、作者名、渠道名。
- 不输出原始账单行或完整作品 x 渠道 x 月份 x 收入明细。
- 私有 Excel 位于 Git 忽略路径，不得提交。
- 本轮仅生成运营任务包，不调模型、不重做 bake-off、不进入 M3。
"""
    write_text(SELECTION_MD, content)


def write_guide_report(payload: dict) -> None:
    guide = {
        "schema": "m2.v1_1.operator_task_validation_guide.cn.v1",
        "generatedAt": payload["generatedAt"],
        "candidateVersion": CANDIDATE_VERSION,
        "reviewWorkflow": [
            "先阅读 00_阅读说明，确认任务边界。",
            "在 01_运营任务卡 中逐行判断预测是否可信、评级是否合理、建议是否可执行。",
            "在 02_预测与回测明细 中核对 3/6/12 个月回测方向、误差和是否优于基线。",
            "在 03_评级与建议复核 中记录评级或建议修正。",
            "在 04_需要人工确认 中优先处理阻断、仅观察、人工确认和高风险边界样本。",
            "用户如有指定作品，填写 05_用户指定作品 的 5 行预留输入。",
            "认为可沉淀为校准案例的样本，在 06_M4校准案例候选 中标记，但本轮不实现自学习。",
            "最后查看 07_验收汇总 并汇总不通过原因。",
        ],
        "forecastReviewRules": [
            "可数值预测样本应重点看预测方向是否与最近趋势一致。",
            "可保守预测样本必须接受更宽区间和人工确认，不得直接包装成确定性决策。",
            "仅观察或暂不可预测样本不能被用于直接推广、下架或续约决策。",
            "高收入样本不得出现无法解释的 P0 类严重问题。",
        ],
        "ratingReviewRules": [
            "评级值保留 S+ / S / A / B / C / D / E。",
            "复核评级时同时看收入规模、生命周期、近12月收入、异常峰值和版权风险。",
            "低收入高评级、下滑但高推广、沉寂但高投入等情况需要写明问题类型。",
        ],
        "suggestionReviewRules": [
            "推广建议必须有收入、生命周期或增长证据支持。",
            "下架或暂停建议不得误杀仍有中高历史收入且仍可解释的作品。",
            "续约复核必须能追溯到版权期或收益价值证据。",
            "仅观察建议不得被升级为直接业务动作。",
        ],
        "requiredUserInputFields": [
            "运营判断：预测是否可信",
            "运营判断：评级是否合理",
            "运营判断：建议是否可执行",
            "运营发现的问题类型",
            "运营建议修正",
            "是否应进入M4校准案例池",
        ],
        "dropdownOptions": FILLING_OPTIONS,
        "userReservedRowsInstruction": "用户先填写作品 ID；后续再由 Codex 读取并补生成任务卡。当前 5 行为空是正常状态。",
        "blockedOrObserveInstruction": "暂不可预测或仅观察样本不要按普通预测准确率评价，应判断系统是否正确阻止业务使用。",
        "conservativeForecastInstruction": "可保守预测样本重点判断方向是否合理，不要求精确数值。",
        "auxiliaryRawCodeColumnInstruction": "末尾“原始...code”列仅供 Codex 后续解析使用，不需要用户填写；用户主阅读和判断以中文列为准。",
        "safeOutputBoundary": payload["safeOutputBoundary"],
    }
    write_json(GUIDE_JSON, guide)
    content = """# M2 v1.1 运营任务验证指南（中文）

本指南用于填写 `m2-v1.1-30-work-operator-task-pack-cn.xlsx`。当前候选只能作为 forecastable cohort 的有限 M2 业务复核基线，不是正式发布审批结果，也不进入 M3。

## 复核步骤

1. 阅读 `00_阅读说明`，确认任务边界。
2. 在 `01_运营任务卡` 中填写预测可信度、评级合理性、建议可执行性、问题类型、修正建议和 M4 候选判断。
3. 在 `02_预测与回测明细` 中核对 3/6/12 个月回测方向、误差和是否优于基线。
4. 在 `03_评级与建议复核` 中记录评级或建议是否需要修正。
5. 在 `04_需要人工确认` 中优先处理阻断、仅观察、人工确认和高风险边界样本。
6. 如需补充用户指定作品，填写 `05_用户指定作品` 的 5 行预留输入。
7. 在 `06_M4校准案例候选` 中标记校准案例候选；本轮只沉淀候选，不实现自学习。
8. 最后查看 `07_验收汇总`，形成通过或不通过结论。

## 预测复核规则

- 可数值预测样本：重点判断预测方向是否与最近趋势、生命周期和回测结果一致。
- 可保守预测样本：可以进入复核，但必须保留不确定性，不得作为确定性动作依据。
- 仅观察或暂不可预测样本：不能被包装成直接推广、下架或续约决策。
- 高收入样本：不得出现无法解释的 P0 类严重问题。

## 评级复核规则

- 评级值保留 `S+ / S / A / B / C / D / E`。
- 评级判断应同时看收入规模、生命周期、近12月收入、异常峰值和版权风险。
- 低收入高评级、下滑但推广、沉寂但高投入等情况需要写明问题类型。

## 建议复核规则

- 推广建议必须有收入、生命周期或增长证据支持。
- 下架或暂停建议不得误杀仍有中高历史收入且仍可解释的作品。
- 续约复核必须能追溯到版权期或收益价值证据。
- 仅观察建议不得被升级为直接业务动作。

## 安全边界

任务包不输出真实作品名、作者名、渠道名，不输出原始账单行，不提交私有 Excel。用户填写后的私有结果也不得直接提交入仓库。
"""
    content += f"""

## 用户重点填写字段

- 运营判断：预测是否可信。下拉选项：{'、'.join(FILLING_OPTIONS['forecastTrust'])}。
- 运营判断：评级是否合理。下拉选项：{'、'.join(FILLING_OPTIONS['ratingReasonable'])}。
- 运营判断：建议是否可执行。下拉选项：{'、'.join(FILLING_OPTIONS['suggestionExecutable'])}。
- 运营发现的问题类型。下拉选项：{'、'.join(FILLING_OPTIONS['issueType'])}。
- 运营建议修正。自由填写，用于记录原因和修正建议。
- 是否应进入M4校准案例池。下拉选项：{'、'.join(FILLING_OPTIONS['m4CalibrationCandidate'])}。

## 用户指定作品

`05_用户指定作品` 中 5 行为空是正常状态。用户先填写作品 ID、指定原因、优先级和备注；后续再由 Codex 读取并补生成任务卡，不在本轮伪造这 5 部作品。

## 特殊预测状态填写规则

- 暂不可预测或仅观察：不要按普通预测准确率评价，应判断系统是否正确阻止业务使用。
- 可保守预测：重点判断预测方向是否合理，不要求精确数值。
- M4校准案例候选：只做候选沉淀，本轮不实现自学习，也不进入 M3。

## 辅助原始 code 列

表格末尾的 `原始...code` 列仅供 Codex 后续读取和生成 operator validation summary 使用。用户不需要填写这些列，主阅读和人工判断以中文列为准。
"""
    write_text(GUIDE_MD, content)


def write_acceptance_report(payload: dict) -> None:
    criteria = {
        "schema": "m2.v1_1.operator_task_acceptance_criteria.cn.v1",
        "generatedAt": payload["generatedAt"],
        "candidateVersion": CANDIDATE_VERSION,
        "passCriteria": [
            "严重违背业务常识 <= 2 部。",
            "高收入样本无 P0。",
            "下架或暂停无明显误杀。",
            "推广建议无明显高估。",
            "续约复核有版权期或收益价值支撑。",
            "可预测样本的预测方向大体合理。",
            "仅观察或人工复核样本没有被包装成可直接决策。",
            "运营建议能追溯到收入、生命周期、版权或风险证据。",
            "人工指定5部样本中不得出现高优先级业务反例。",
            "M4校准案例池只做候选沉淀，本轮不实现自学习。",
        ],
        "failCriteria": [
            "高收入样本出现 P0。",
            "多个建议明显违背业务常识。",
            "下架、推广或续约触发逻辑明显错误。",
            "预测方向与历史趋势明显冲突且无解释。",
            "系统无法解释某作品为何可预测或不可预测。",
        ],
        "m4Boundary": "M4校准案例候选只做沉淀，不在M2实现自学习。",
        "dropdownOptions": FILLING_OPTIONS,
        "operatorSummaryInputRequirement": "用户填写 Excel 后，Codex 才读取填写结果生成 operator validation summary。",
        "m3Boundary": "本轮不进入M3，除非用户另行明确授权平行规划。",
        "safeOutputBoundary": payload["safeOutputBoundary"],
    }
    write_json(ACCEPTANCE_JSON, criteria)
    content = """# M2 v1.1 运营任务验收标准（中文）

30部运营任务验证通过后，才允许说 v1.1 conditional 可以进入有限 M2 业务复核。它仍不是正式发布审批结果，也不进入 M3。

## 通过标准

1. 严重违背业务常识 <= 2 部。
2. 高收入样本无 P0。
3. 下架或暂停无明显误杀。
4. 推广建议无明显高估。
5. 续约复核有版权期或收益价值支撑。
6. 可预测样本的预测方向大体合理。
7. 仅观察或人工复核样本没有被包装成可直接决策。
8. 运营建议都能追溯到收入、生命周期、版权或风险证据。
9. 人工指定 5 部样本中不得出现高优先级业务反例。
10. 如果运营标记“应进入M4校准案例池”，只作为 M4 候选案例沉淀，本轮不实现自学习。

## 不通过标准

- 高收入样本出现 P0。
- 多个建议明显违背业务常识。
- 下架、推广或续约触发逻辑明显错误。
- 预测方向与历史趋势明显冲突且无解释。
- 系统无法解释为什么某作品可预测或不可预测。

## M4 与 M3 边界

M4 校准案例候选只做沉淀，不在 M2 实现自学习。本轮不进入 M3，除非用户另行明确授权平行规划。
"""
    content += f"""

## 填写选项验收口径

- 预测是否可信：{'、'.join(FILLING_OPTIONS['forecastTrust'])}。
- 评级是否合理：{'、'.join(FILLING_OPTIONS['ratingReasonable'])}。
- 建议是否可执行：{'、'.join(FILLING_OPTIONS['suggestionExecutable'])}。
- 问题类型：{'、'.join(FILLING_OPTIONS['issueType'])}。
- M4校准案例候选：{'、'.join(FILLING_OPTIONS['m4CalibrationCandidate'])}。
- 用户指定作品优先级：{'、'.join(FILLING_OPTIONS['userPriority'])}。

用户填写 Excel 后，Codex 才读取填写结果生成 operator validation summary。本轮不进入 M3。
"""
    write_text(ACCEPTANCE_MD, content)


def build_private_workbook_source(payload: dict) -> dict:
    task_rows = payload["samples"]["taskRows"]
    user_rows = payload["samples"]["userReserved"]
    workbook = {
        "schema": "m2.v1_1.operator_task_pack_workbook_source.cn.v1",
        "generatedAt": payload["generatedAt"],
        "candidateVersion": CANDIDATE_VERSION,
        "expectedWorkbookPath": "data/private-output/m2-business-review/m2-v1.1-30-work-operator-task-pack-cn.xlsx",
        "privateGitignored": True,
        "notFormalReleaseApproval": True,
        "m3Started": False,
        "fillingOptions": FILLING_OPTIONS,
        "sheets": [
            {"name": "00_阅读说明", "rows": instruction_rows()},
            {"name": "01_运营任务卡", "rows": task_rows},
            {"name": "02_预测与回测明细", "rows": payload["samples"]["backtestRows"]},
            {"name": "03_评级与建议复核", "rows": review_rows(task_rows)},
            {"name": "04_需要人工确认", "rows": manual_rows(task_rows)},
            {"name": "05_用户指定作品", "rows": user_rows},
            {"name": "06_M4校准案例候选", "rows": m4_rows(task_rows)},
            {"name": "07_验收汇总", "rows": acceptance_rows(payload["validation"], payload["samples"]["summary"])},
        ],
        "safeOutputBoundary": payload["safeOutputBoundary"],
    }
    write_json(PRIVATE_SOURCE_JSON, workbook)
    return workbook


def is_auxiliary_raw_code_header(header: str) -> bool:
    return bool(AUXILIARY_RAW_CODE_HEADER.match(str(header or "").strip()))


def scan_main_reading_code_leaks(workbook: dict) -> dict:
    hits = []
    pattern_counts = Counter()
    grouped_counts = {
        "未映射": 0,
        "model_": 0,
        "_forecast/_required/_blocked/_baseline/_numeric": 0,
    }

    for sheet in workbook.get("sheets", []):
        for row_index, row in enumerate(sheet.get("rows", []), start=1):
            if not isinstance(row, dict):
                continue
            for header, value in row.items():
                if is_auxiliary_raw_code_header(header):
                    continue
                if value is None or value == "":
                    continue
                text = str(value)
                matched = [pattern for pattern in MAIN_READING_FORBIDDEN_PATTERNS if pattern in text]
                if not matched:
                    continue
                for pattern in matched:
                    pattern_counts[pattern] += 1
                if "未映射" in matched:
                    grouped_counts["未映射"] += 1
                if "model_" in matched:
                    grouped_counts["model_"] += 1
                if any(pattern in matched for pattern in ["_forecast", "_required", "_blocked", "_baseline", "_numeric"]):
                    grouped_counts["_forecast/_required/_blocked/_baseline/_numeric"] += 1
                hits.append(
                    {
                        "sheet": sheet.get("name", ""),
                        "rowNumber": row_index,
                        "column": header,
                        "patterns": matched,
                    }
                )

    return {
        "totalHits": len(hits),
        "patternCounts": dict(pattern_counts),
        "groupedCounts": grouped_counts,
        "hits": hits,
    }


def validate_workbook_source(workbook: dict) -> dict:
    expected_names = [
        "00_阅读说明",
        "01_运营任务卡",
        "02_预测与回测明细",
        "03_评级与建议复核",
        "04_需要人工确认",
        "05_用户指定作品",
        "06_M4校准案例候选",
        "07_验收汇总",
    ]
    actual_names = [sheet["name"] for sheet in workbook["sheets"]]
    if actual_names != expected_names:
        raise RuntimeError(f"sheet names mismatch: {actual_names}")
    task_sheet = next(sheet for sheet in workbook["sheets"] if sheet["name"] == "01_运营任务卡")
    if len(task_sheet["rows"]) != 30:
        raise RuntimeError("operator task sheet must contain 30 rows")
    if sum(1 for row in task_sheet["rows"] if row["样本来源"] == "系统分层选择") != 20:
        raise RuntimeError("system stratified samples must contain 20 rows")
    if sum(1 for row in task_sheet["rows"] if row["样本来源"] == "用户预留") != 5:
        raise RuntimeError("user reserved rows must contain 5 rows")
    if sum(1 for row in task_sheet["rows"] if row["样本来源"] == "高风险边界") != 5:
        raise RuntimeError("high risk boundary samples must contain 5 rows")
    main_reading_scan = scan_main_reading_code_leaks(workbook)
    if main_reading_scan["totalHits"] > 0:
        summary = {
            "totalHits": main_reading_scan["totalHits"],
            "patternCounts": main_reading_scan["patternCounts"],
            "firstHits": main_reading_scan["hits"][:10],
        }
        raise RuntimeError(f"main reading columns contain unmapped or raw code values: {json.dumps(summary, ensure_ascii=False)}")
    return main_reading_scan


def build_payload() -> dict:
    frames = build_v1_1_frames()
    samples = build_samples(frames)
    generated_at = datetime.now(timezone.utc).isoformat()
    return {
        "generatedAt": generated_at,
        "frames": frames,
        "samples": samples,
        "validation": frames["validation"],
        "safeOutputBoundary": {
            "sanitizedReportsUseAnonymousIdsOnly": True,
            "privateWorkbookGitignored": True,
            "realWorkNamesIncluded": False,
            "realAuthorNamesIncluded": False,
            "realChannelNamesIncluded": False,
            "sourceBillRowsIncluded": False,
            "connectionStringsIncluded": False,
            "formalReleaseApproved": False,
            "m3Started": False,
        },
    }


def main() -> None:
    payload = build_payload()
    write_selection_report(payload)
    write_guide_report(payload)
    write_acceptance_report(payload)
    workbook = build_private_workbook_source(payload)
    main_reading_scan = validate_workbook_source(workbook)
    print(
        json.dumps(
            {
                "generated": True,
                "candidateVersion": CANDIDATE_VERSION,
                "selectionReport": str(SELECTION_MD.relative_to(ROOT)),
                "validationGuide": str(GUIDE_MD.relative_to(ROOT)),
                "acceptanceCriteria": str(ACCEPTANCE_MD.relative_to(ROOT)),
                "privateWorkbookSource": str(PRIVATE_SOURCE_JSON.relative_to(ROOT)),
                "expectedPrivateWorkbook": str(PRIVATE_XLSX.relative_to(ROOT)),
                "systemSamples": payload["samples"]["summary"]["system"],
                "userReservedRows": payload["samples"]["summary"]["userReserved"],
                "highRiskBoundarySamples": payload["samples"]["summary"]["highRisk"],
                "actualWorkSamples": payload["samples"]["summary"]["actualWorkSamples"],
                "taskRows": payload["samples"]["summary"]["taskRows"],
                "privateWorkbookGitignored": True,
                "mainReadingCodeScan": {
                    "totalHits": main_reading_scan["totalHits"],
                    "groupedCounts": main_reading_scan["groupedCounts"],
                    "patternCounts": main_reading_scan["patternCounts"],
                },
                "m3Started": False,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
