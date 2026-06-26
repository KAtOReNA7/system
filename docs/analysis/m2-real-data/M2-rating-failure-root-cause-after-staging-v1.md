# M2 rating failure root cause after staging v1

- Reviewable rows: `25`
- Rating unreasonable rows: `25`
- Current rating distribution: `{"B": 14, "C": 2, "D": 1, "E": 8}`
- New rating distribution: `{"A": 4, "B": 7, "C": 9, "E": 1, "S": 4}`
- Root cause distribution: `{"business_action_status_over_penalized_rating": 11, "calibrated_rule_changed_rating": 19, "forecastability_over_penalized_rating": 11, "high_revenue_low_rating": 10, "high_revenue_stable_under_rated": 10, "lifecycle_over_penalized_high_revenue": 8, "missing_expiry_should_be_readiness_warning_not_value_downgrade": 6, "operator_marked_rating_unreasonable": 25}`

## Rule Fixes
- 将历史收入/收入层级作为主价值信号
- forecastable 与 non-forecastable cohort 分开评级
- true_forecast_blocked 默认不超过 C，但高收入非长尾样本可到 B 且需人工复核
- 缺版权到期只作为 readiness warning
- 长剩余版权期与稳定/增长收入可上调评级

No real work names, author names, channel names, or row-level revenue details are included.
