export const LIFECYCLE_LABELS_CN = Object.freeze({
  growth: "增长期",
  stable: "稳定期",
  rebound: "回升期",
  declining: "下滑期",
  long_tail: "长尾期",
  inactive: "沉寂期",
  insufficient_history: "历史不足"
});

export const FORECASTABILITY_STATUS_LABELS_CN = Object.freeze({
  numeric_forecast_eligible: "可数值预测",
  conservative_numeric_forecast: "可保守预测",
  observe_only_no_numeric_forecast: "仅观察，不输出业务可用数值预测",
  true_forecast_blocked: "暂不可预测"
});

export const FORMAL_READINESS_STATUS_LABELS_CN = Object.freeze({
  ready_for_local_algorithm_validation: "可用于本地算法验证",
  formal_release_blocked: "暂不可正式发布",
  waiver_required: "需要业务豁免",
  data_fix_required: "需要数据修正",
  mapping_activation_required: "需要映射版本激活"
});

export const BUSINESS_ACTION_STATUS_LABELS_CN = Object.freeze({
  action_allowed: "可考虑业务动作",
  manual_confirmation_required: "需要人工确认",
  action_blocked: "暂不可执行业务动作",
  observe_only: "仅观察"
});

export const SUGGESTION_LABELS_CN = Object.freeze({
  promote: "加大推广或重点推荐",
  feature: "加大推广或重点推荐",
  maintain: "维持当前运营",
  reduce: "降低运营投入",
  reduce_investment: "降低运营投入",
  downlist: "下架或暂停运营候选",
  suspend: "下架或暂停运营候选",
  downlist_or_suspend: "下架或暂停运营候选",
  "renewal review": "版权续约复核",
  renewal_review: "版权续约复核",
  observe: "仅观察",
  observe_only: "仅观察",
  repackage: "包装或定位复核",
  pricing_or_channel_adjustment: "价格或渠道策略复核",
  manual_review_required: "需要人工复核"
});

export const RISK_REASON_LABELS_CN = Object.freeze({
  abnormal_spike: "存在异常峰值，需确认是否为一次性收入或特殊事件",
  aggregate_projection_gap: "汇总口径与明细口径存在缺口，正式发布前需修正",
  bounded_but_forecastable_with_conservative_interval: "历史表现可建模，但必须使用保守预测区间",
  business_form_mixed: "业务形态混合，建议人工确认解释口径",
  buyout_or_oneoff_income: "可能包含买断或一次性收入，预测需谨慎",
  channel_concentration: "渠道集中度较高，需关注单一渠道波动风险",
  channel_concentration_advisory: "存在渠道集中提示，运营复核时需留意",
  copyright_date_conflict: "版权日期存在冲突，正式发布前需修正",
  copyright_expiry: "版权已到期或接近到期，需续约复核",
  data_fix_required: "需要数据修正后才能正式发布",
  formal_data_fix_required: "正式数据存在修正项，本地算法验证不等于正式可发布",
  formal_readiness_not_blocking_local_algorithm_validation: "不阻塞本地算法验证",
  formal_waiver_required: "正式发布前需要业务豁免或授权",
  high_value_with_data_gap: "高价值作品存在数据缺口，需要人工确认",
  high_value_with_expiry: "高价值作品存在版权到期风险",
  inactive_tail: "长尾或沉寂作品，建议以保守动作处理",
  incomplete_month_boundary: "存在不完整月份边界，需避免把未完整月份当成正式依据",
  insufficient_history: "历史不足，不能直接形成稳定判断",
  insufficient_revenue_history: "收入历史不足，需要更多月份验证",
  insufficient_revenue_time_series: "可用于回测的收入时间序列不足",
  low_materiality_or_zero_heavy_pattern: "收入规模低或零收入月份偏多，建议仅观察",
  manual_confirmation_required: "需要人工确认后再执行运营动作",
  mapping_activation_required: "需要映射版本激活后才能进入正式发布链路",
  mapping_not_active: "映射版本尚未激活",
  mapping_uncertainty: "映射关系存在不确定性",
  mapping_version_inactive: "映射版本未激活",
  material_stable_history: "收入规模和历史稳定性支持数值预测",
  material_tail_or_zero_heavy_but_backtestable: "虽有长尾或零收入特征，但历史仍可回测，适合保守预测",
  metadata_gap: "基础信息存在缺口",
  missing_basic_info: "基础信息缺失，正式发布前需补齐",
  missing_copyright_end: "版权到期日缺失，需要补齐或业务豁免",
  no_backtestable_revenue_history: "没有可回测收入历史",
  no_business_action_blocker: "未发现业务动作层面的直接阻断",
  observe_only_forecastability_status: "预测状态要求仅观察，不能包装成直接决策依据",
  revenue_decline: "收入下滑，需要关注生命周期和投入回收",
  severe_data_gap_or_copyright_fallback: "存在严重数据缺口或版权兜底口径",
  true_forecast_blocked_before_action: "预测已被阻断，不能直接执行业务动作",
  unresolved_spike_or_oneoff_income: "异常峰值或一次性收入尚未解决，暂不适合数值预测",
  v1_1_spike_damped_conservative_boundary: "v1.1 已把异常峰值样本压入保守边界"
});

export const REVENUE_SCALE_LABELS_CN = Object.freeze({
  top: "高收入",
  high: "高收入",
  mid: "中收入",
  medium: "中收入",
  low: "低收入",
  long_tail: "长尾收入",
  zero: "近零收入",
  near_zero: "近零收入",
  top_1_percent: "头部1%",
  top_5_percent: "头部5%",
  top_10_percent: "头部10%",
  middle_40_percent: "中部40%",
  bottom_50_percent: "后50%",
  data_gap_or_copyright_fallback: "数据缺口或版权兜底",
  abnormal_spike: "异常峰值",
  copyright_expiry: "版权到期风险"
});

export const MODEL_LABELS_CN = Object.freeze({
  model_a_trailing_baseline: "历史滚动基线模型",
  raw_trailing_baseline: "历史滚动基线模型",
  model_b_lifecycle_robust: "生命周期稳健模型",
  model_c_zero_inflated: "零收入/稀疏收入模型",
  model_c_zero_inflated_sparse: "零收入/稀疏收入模型",
  model_d_hierarchical_shrinkage: "分层收缩模型",
  model_e_selector: "模型选择器",
  model_f_forecastability_gated: "可预测性分流模型",
  model_h_disentangled_forecast_v1_1: "v1.1 条件冻结预测模型",
  no_business_numeric_forecast: "不输出业务可用数值预测",
  observe_only_no_business_numeric_forecast: "仅观察，不输出业务可用数值预测",
  observe_only_no_numeric_forecast: "仅观察，不输出业务可用数值预测",
  true_forecast_blocked: "暂不可预测",
  conservative_numeric_forecast: "可保守预测",
  numeric_forecast_eligible: "可数值预测"
});

export const MODEL_REASON_LABELS_CN = Object.freeze({
  "work-level signal shrunk toward lifecycle/revenue cohort prior":
    "单作品信号不足，预测向相同生命周期/收入层级的保守先验收缩",
  "lifecycle signal stable": "生命周期信号较稳定",
  "zero-heavy or sparse revenue": "零收入月份较多或收入稀疏",
  "spike damped": "已对异常峰值做降权处理",
  "inactive, long-tail, D/E, or low-revenue guard": "沉寂、长尾、低评级或低收入保护",
  "established lifecycle signal": "生命周期信号较稳定",
  "spike-sensitive work uses robust trimmed signal": "已对异常峰值做降权处理",
  "insufficient history shrinkage": "历史不足时使用收缩处理",
  no_business_numeric_forecast:
    "该样本不适合输出普通业务数值预测，仅用于观察或人工复核。",
  collect_more_revenue_history_before_numeric_forecast:
    "收入历史不足，需要补充更多完整收入月份后再做数值预测。",
  observe_only_no_business_numeric_forecast: "仅观察，不输出业务可用数值预测。",
  exclude_from_numeric_forecast_baseline:
    "该样本不纳入数值预测基线验收，需排除出预测基线统计。",
  manual_review_or_spike_damped_backtest_required:
    "需要人工复核，或需要进行异常峰值降权后的回测验证。"
});

export const OPERATOR_MAIN_READING_FORBIDDEN_PATTERNS = Object.freeze([
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
  "exclude_from_numeric_forecast_baseline"
]);

export const OPERATOR_FILL_OPTIONS_CN = Object.freeze({
  forecastTrust: ["可信", "基本可信", "不确定", "不可信", "不适用"],
  ratingReasonable: ["合理", "基本合理", "不确定", "不合理", "不适用"],
  suggestionExecutable: ["可执行", "需要人工确认", "仅供参考", "不可执行", "不适用"],
  issueType: [
    "无明显问题",
    "预测偏高",
    "预测偏低",
    "评级偏高",
    "评级偏低",
    "建议不合理",
    "风险识别遗漏",
    "版权/数据问题",
    "业务常识冲突",
    "其他"
  ],
  m4CalibrationCandidate: ["是", "否", "待定"],
  userPriority: ["高", "中", "低"]
});

export function translateLifecycle(value) {
  return translateWithFallback(value, LIFECYCLE_LABELS_CN);
}

export function translateForecastabilityStatus(value) {
  return translateWithFallback(value, FORECASTABILITY_STATUS_LABELS_CN);
}

export function translateFormalReadinessStatus(value) {
  return translateWithFallback(value, FORMAL_READINESS_STATUS_LABELS_CN);
}

export function translateBusinessActionStatus(value) {
  return translateWithFallback(value, BUSINESS_ACTION_STATUS_LABELS_CN);
}

export function translateSuggestionCode(value) {
  return translateWithFallback(value, SUGGESTION_LABELS_CN);
}

export function translateRiskCode(value) {
  return translateWithFallback(value, RISK_REASON_LABELS_CN);
}

export function translateReasonCode(value) {
  return translateRiskCode(value);
}

export function translateRevenueScale(value) {
  return translateWithFallback(value, REVENUE_SCALE_LABELS_CN);
}

export function translateModelCode(value) {
  return translateWithFallback(value, MODEL_LABELS_CN);
}

export function translateModelReason(value) {
  return translateWithFallback(value, MODEL_REASON_LABELS_CN);
}

export function describeBoolean(value) {
  if (value === true) return "是";
  if (value === false) return "否";
  return "待确认";
}

export function describeSampleSource(value) {
  const labels = {
    system_stratified: "系统分层选择",
    user_reserved: "用户预留",
    high_risk_boundary: "高风险边界"
  };
  return labels[value] ?? translateWithFallback(value, labels);
}

export function describeRiskCodes(values = []) {
  return describeCodes(values, translateRiskCode, "未发现主要风险");
}

export function describeReasonCodes(values = []) {
  return describeCodes(values, translateReasonCode, "无额外原因");
}

export function describeSuggestionCodes(values = []) {
  return describeCodes(values, translateSuggestionCode, "无明确运营建议");
}

export function buildTaskAcceptanceSummary(result = {}) {
  const severeContradictions = numberValue(result.severeBusinessContradictions);
  const highIncomeP0 = numberValue(result.highIncomeP0);
  const recommendationErrors = numberValue(result.recommendationTriggerErrors);
  const unexplainedForecastConflicts = numberValue(result.unexplainedForecastDirectionConflicts);
  const passed =
    severeContradictions <= 2 &&
    highIncomeP0 === 0 &&
    recommendationErrors === 0 &&
    unexplainedForecastConflicts === 0;

  return {
    passed,
    verdict: passed ? "通过" : "不通过",
    summary: passed
      ? "30部运营任务验证未触发硬性不通过条件，可作为有限M2业务复核依据。"
      : "运营任务验证触发硬性不通过条件，需要回到M2修正或补充复核。"
  };
}

export function isAuxiliaryRawCodeHeader(header) {
  return /^原始.*code$/i.test(String(header ?? "").trim());
}

export function findOperatorMainReadingCodeLeaks(workbookSource = {}) {
  const sheets = Array.isArray(workbookSource.sheets) ? workbookSource.sheets : [];
  const leaks = [];

  for (const sheet of sheets) {
    const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
    rows.forEach((row, rowIndex) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return;
      for (const [header, value] of Object.entries(row)) {
        if (isAuxiliaryRawCodeHeader(header)) continue;
        if (value == null || value === "") continue;
        const text = String(value);
        const patterns = OPERATOR_MAIN_READING_FORBIDDEN_PATTERNS.filter((pattern) =>
          text.includes(pattern)
        );
        if (patterns.length > 0) {
          leaks.push({
            sheetName: sheet.name ?? "",
            rowNumber: rowIndex + 1,
            column: header,
            patterns
          });
        }
      }
    });
  }

  return leaks;
}

function translateWithFallback(value, dictionary) {
  if (value == null || value === "") return "未提供";
  const key = String(value);
  return dictionary[key] ?? `未映射：${key}`;
}

function describeCodes(values, translator, emptyLabel) {
  if (!Array.isArray(values) || values.length === 0) return emptyLabel;
  return [...new Set(values.map((value) => translator(value)))].join("；");
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
