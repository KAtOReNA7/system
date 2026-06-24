# M2 Ledger Backfill Dry-Run Forecast Output Impact v1

本报告为文件级 forecastOutputType proxy，不是正式 DB 评估结果。

| forecastOutputType | before | after | 变化 |
|---|---|---|---|
| copyright_term_forecast | 847 | 1703 | 856 |
| operating_window_forecast_pending_expiry | 2206 | 1350 | -856 |
| relative_expiry_pending_anchor | 0 | 0 | 0 |
| copyright_conflict_manual_review | 0 | 0 | 0 |
| no_numeric_forecast | 1 | 1 | 0 |

## 关键转移
| 指标 | 数量 |
|---|---|
| operatingWindowPendingExpiryToCopyrightTermForecast | 856 |
| renewalReviewBecameReviewable | 856 |
| ratingRemainingCopyrightAdjustmentEnabled | 856 |
| manualReviewCanReduceByStrictAutoCandidates | 2012 |

## 重跑建议
| 项目 | 是否需要 |
|---|---|
| rerun30WorkOperatorPack | True |
| rerun20YearSample | True |
| rerunV11ForecastabilityGate | True |
| rerunBusinessReviewSampleSelection | True |

- formalCompleteAllowed: `False`
- notM3: `True`