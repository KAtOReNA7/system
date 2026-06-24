# M2 Ledger Backfill Dry-Run v2 Forecast Output Impact

本报告为文件级 forecastOutputType proxy，不是正式 DB 评估结果。

| forecastOutputType | before | after | 变化 |
|---|---|---|---|
| copyright_term_forecast | 847 | 1653 | 806 |
| operating_window_forecast_pending_expiry | 2206 | 1400 | -806 |
| relative_expiry_pending_anchor | 0 | 0 | 0 |
| copyright_conflict_manual_review | 0 | 0 | 0 |
| no_numeric_forecast | 1 | 1 | 0 |

## v2 对 M2 的影响
| 指标 | 数量 |
|---|---|
| copyrightTermForecastIncrease | 806 |
| operatingWindowForecastPendingExpiryDecrease | -806 |
| renewalReviewImproved | 806 |
| ratingRemainingCopyrightAdjustmentImproved | 806 |
| manualReviewReduced | 1958 |
| operatorPackSamplesNeedUpdate | 30 |

- 值得进入用户确认高置信补全阶段：`True`
- formalCompleteAllowed: `False`
- notM3: `True`