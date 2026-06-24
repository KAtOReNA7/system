import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTaskAcceptanceSummary,
  describeRiskCodes,
  describeSampleSource,
  describeSuggestionCodes,
  findOperatorMainReadingCodeLeaks,
  OPERATOR_FILL_OPTIONS_CN,
  translateModelCode,
  translateModelReason,
  translateBusinessActionStatus,
  translateForecastabilityStatus,
  translateFormalReadinessStatus,
  translateLifecycle,
  translateReasonCode,
  translateRevenueScale,
  translateSuggestionCode
} from "../src/domain/oldProductEvaluation/operatorTaskValidation.js";

test("operator task validation translates lifecycle and gate statuses to Chinese", () => {
  assert.equal(translateLifecycle("growth"), "增长期");
  assert.equal(translateLifecycle("stable"), "稳定期");
  assert.equal(translateLifecycle("rebound"), "回升期");
  assert.equal(translateLifecycle("declining"), "下滑期");
  assert.equal(translateLifecycle("long_tail"), "长尾期");
  assert.equal(translateLifecycle("inactive"), "沉寂期");
  assert.equal(translateLifecycle("insufficient_history"), "历史不足");

  assert.equal(translateForecastabilityStatus("numeric_forecast_eligible"), "可数值预测");
  assert.equal(translateForecastabilityStatus("conservative_numeric_forecast"), "可保守预测");
  assert.equal(
    translateForecastabilityStatus("observe_only_no_numeric_forecast"),
    "仅观察，不输出业务可用数值预测"
  );
  assert.equal(translateForecastabilityStatus("true_forecast_blocked"), "暂不可预测");

  assert.equal(translateFormalReadinessStatus("ready_for_local_algorithm_validation"), "可用于本地算法验证");
  assert.equal(translateFormalReadinessStatus("formal_release_blocked"), "暂不可正式发布");
  assert.equal(translateFormalReadinessStatus("waiver_required"), "需要业务豁免");
  assert.equal(translateFormalReadinessStatus("data_fix_required"), "需要数据修正");
  assert.equal(translateFormalReadinessStatus("mapping_activation_required"), "需要映射版本激活");

  assert.equal(translateBusinessActionStatus("action_allowed"), "可考虑业务动作");
  assert.equal(translateBusinessActionStatus("manual_confirmation_required"), "需要人工确认");
  assert.equal(translateBusinessActionStatus("action_blocked"), "暂不可执行业务动作");
  assert.equal(translateBusinessActionStatus("observe_only"), "仅观察");
});

test("operator task validation translates suggestions and risk reasons for user-facing review", () => {
  assert.equal(translateSuggestionCode("promote"), "加大推广或重点推荐");
  assert.equal(translateSuggestionCode("feature"), "加大推广或重点推荐");
  assert.equal(translateSuggestionCode("maintain"), "维持当前运营");
  assert.equal(translateSuggestionCode("reduce"), "降低运营投入");
  assert.equal(translateSuggestionCode("downlist_or_suspend"), "下架或暂停运营候选");
  assert.equal(translateSuggestionCode("renewal_review"), "版权续约复核");
  assert.equal(translateSuggestionCode("observe_only"), "仅观察");

  assert.equal(
    translateReasonCode("missing_copyright_end"),
    "版权到期日缺失，需要补齐或业务豁免"
  );
  assert.equal(
    describeRiskCodes(["abnormal_spike", "missing_basic_info"]),
    "存在异常峰值，需确认是否为一次性收入或特殊事件；基础信息缺失，正式发布前需补齐"
  );
  assert.equal(
    describeSuggestionCodes(["promote", "renewal_review", "promote"]),
    "加大推广或重点推荐；版权续约复核"
  );
});

test("operator task validation describes sample source and revenue scale in Chinese", () => {
  assert.equal(describeSampleSource("system_stratified"), "系统分层选择");
  assert.equal(describeSampleSource("user_reserved"), "用户预留");
  assert.equal(describeSampleSource("high_risk_boundary"), "高风险边界");
  assert.equal(translateRevenueScale("top_1_percent"), "头部1%");
  assert.equal(translateRevenueScale("middle_40_percent"), "中部40%");
});

test("operator task validation translates forecast model codes and reasons to Chinese", () => {
  assert.equal(translateModelCode("model_a_trailing_baseline"), "历史滚动基线模型");
  assert.equal(translateModelCode("model_b_lifecycle_robust"), "生命周期稳健模型");
  assert.equal(translateModelCode("model_c_zero_inflated"), "零收入/稀疏收入模型");
  assert.equal(translateModelCode("model_c_zero_inflated_sparse"), "零收入/稀疏收入模型");
  assert.equal(translateModelCode("model_d_hierarchical_shrinkage"), "分层收缩模型");
  assert.equal(translateModelCode("model_e_selector"), "模型选择器");
  assert.equal(translateModelCode("model_f_forecastability_gated"), "可预测性分流模型");
  assert.equal(translateModelCode("no_business_numeric_forecast"), "不输出业务可用数值预测");
  assert.equal(
    translateModelCode("observe_only_no_business_numeric_forecast"),
    "仅观察，不输出业务可用数值预测"
  );
  assert.equal(translateModelCode("true_forecast_blocked"), "暂不可预测");
  assert.equal(translateModelCode("conservative_numeric_forecast"), "可保守预测");
  assert.equal(translateModelCode("numeric_forecast_eligible"), "可数值预测");

  assert.equal(
    translateModelReason("work-level signal shrunk toward lifecycle/revenue cohort prior"),
    "单作品信号不足，预测向相同生命周期/收入层级的保守先验收缩"
  );
  assert.equal(translateModelReason("lifecycle signal stable"), "生命周期信号较稳定");
  assert.equal(translateModelReason("zero-heavy or sparse revenue"), "零收入月份较多或收入稀疏");
  assert.equal(translateModelReason("spike damped"), "已对异常峰值做降权处理");
  assert.equal(
    translateModelReason("no_business_numeric_forecast"),
    "该样本不适合输出普通业务数值预测，仅用于观察或人工复核。"
  );
  assert.equal(
    translateModelReason("collect_more_revenue_history_before_numeric_forecast"),
    "收入历史不足，需要补充更多完整收入月份后再做数值预测。"
  );
  assert.equal(
    translateModelReason("observe_only_no_business_numeric_forecast"),
    "仅观察，不输出业务可用数值预测。"
  );
  assert.equal(
    translateModelReason("manual_review_or_spike_damped_backtest_required"),
    "需要人工复核，或需要进行异常峰值降权后的回测验证。"
  );
  assert.equal(
    translateModelReason("exclude_from_numeric_forecast_baseline"),
    "该样本不纳入数值预测基线验收，需排除出预测基线统计。"
  );
});

test("operator task validation exposes stable Chinese dropdown options", () => {
  assert.deepEqual(OPERATOR_FILL_OPTIONS_CN.forecastTrust, [
    "可信",
    "基本可信",
    "不确定",
    "不可信",
    "不适用"
  ]);
  assert.deepEqual(OPERATOR_FILL_OPTIONS_CN.suggestionExecutable, [
    "可执行",
    "需要人工确认",
    "仅供参考",
    "不可执行",
    "不适用"
  ]);
  assert.deepEqual(OPERATOR_FILL_OPTIONS_CN.m4CalibrationCandidate, ["是", "否", "待定"]);
  assert.deepEqual(OPERATOR_FILL_OPTIONS_CN.userPriority, ["高", "中", "低"]);
});

test("operator task validation fails raw codes in main reading columns", () => {
  const leaks = findOperatorMainReadingCodeLeaks({
    sheets: [
      {
        name: "02_预测与回测明细",
        rows: [
          {
            "模型选择（中文）": "未映射：no_business_numeric_forecast",
            "模型选择原因（中文）": "manual_review_or_spike_damped_backtest_required"
          }
        ]
      }
    ]
  });

  assert.equal(leaks.length, 2);
  assert.equal(leaks[0].column, "模型选择（中文）");
  assert.ok(leaks[0].patterns.includes("未映射"));
});

test("operator task validation allows raw codes only in auxiliary original code columns", () => {
  assert.deepEqual(
    findOperatorMainReadingCodeLeaks({
      sheets: [
        {
          name: "01_运营任务卡",
          rows: [
            {
              "预测状态": "仅观察，不输出业务可用数值预测",
              "原始预测状态code": "observe_only_no_business_numeric_forecast",
              "原始模型code": "model_d_hierarchical_shrinkage"
            }
          ]
        }
      ]
    }),
    []
  );
});

test("operator task validation summarizes acceptance criteria without real data", () => {
  assert.deepEqual(
    buildTaskAcceptanceSummary({
      severeBusinessContradictions: 2,
      highIncomeP0: 0,
      recommendationTriggerErrors: 0,
      unexplainedForecastDirectionConflicts: 0
    }),
    {
      passed: true,
      verdict: "通过",
      summary: "30部运营任务验证未触发硬性不通过条件，可作为有限M2业务复核依据。"
    }
  );

  assert.equal(
    buildTaskAcceptanceSummary({
      severeBusinessContradictions: 3,
      highIncomeP0: 0,
      recommendationTriggerErrors: 0,
      unexplainedForecastDirectionConflicts: 0
    }).verdict,
    "不通过"
  );
});
