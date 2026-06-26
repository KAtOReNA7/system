# M2 suggestion failure root cause after staging v1

- Reviewable rows: `25`
- Suggestion not executable rows: `8`
- Business common-sense conflict rows: `12`
- Current suggestion distribution: `{"仅观察，暂不作为投放、续约或下架的直接依据": 2, "先按运营窗口复核，待补版权到期后再生成版权期预测": 5, "先补齐预测阻断原因，不建议直接执行业务动作": 10, "包装或定位复核": 1, "维持当前运营": 7}`
- New suggestion distribution: `{"maintain": 8, "manual_review_required": 11, "observe_only": 2, "reduce_investment": 2, "renewal_review": 2}`
- Root cause distribution: `{"calibrated_rule_changed_suggestion": 18, "old_suggestion_did_not_explain_true_forecast_blocker": 10, "old_suggestion_not_actionable_under_business_action_block": 10, "operator_marked_business_common_sense_conflict": 12, "operator_marked_suggestion_not_executable": 8}`

## Rule Fixes
- action_blocked/true_forecast_blocked 统一转人工复核动作，不输出直接业务动作
- observe-only/历史不足保持仅观察
- promote 只允许高评级、增长/回升、置信度中高且 action_allowed
- downlist 只允许低收入长尾/沉寂，且必须人工确认
- renewal review 必须有版权期和收入价值支撑

No real work names, author names, channel names, or row-level revenue details are included.
