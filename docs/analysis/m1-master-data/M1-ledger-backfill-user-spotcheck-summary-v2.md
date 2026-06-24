# M1 Ledger Backfill User Spotcheck Summary v2

本报告只包含聚合审核结果，不包含真实作品名、作者名、渠道名或台账原文。本脚本不连接数据库、不写正式主数据、不进入 M3。

## 当前状态
- 状态：`waiting_for_user_spotcheck`
- ready_for_local_staging_apply：`false`
- 下一步：请用户填写极简中文抽检审核包后重新运行 npm run summarize:m1:ledger-spotcheck。

## 核心指标
| 指标 | 数值 |
|---|---:|
| 总行数 | 80 |
| 已填写行数 | 0 |
| 完成率 | 0.0% |
| 接受率 | 0.0% |
| 高置信候选接受率 | 0.0% |
| 拒绝行数 | 0 |
| 需修改行数 | 0 |
| 不确定行数 | 0 |

## Apply Readiness Gate
| 门槛 | 是否通过 |
|---|---|
| completionRateAtLeast90Percent | `false` |
| highConfidenceAcceptanceRateAtLeast95Percent | `false` |
| highRevenueErrorCountZero | `true` |
| copyrightEndSevereErrorCountZero | `true` |
| titleAuthorSevereErrorCountZero | `true` |
| audioRightsSevereErrorCountAtMostOne | `true` |
| allNeedsModifyHaveCorrectionValue | `true` |
| uncertainRowsExcludedFromAutoApply | `true` |
| lowOrMediumConfidenceRowsExcludedFromAutoApply | `true` |
| conflictRowsExcludedFromAutoApply | `true` |

## 阻断摘要
- 高收入样本错误数：`0`
- 版权到期严重错误数：`0`
- 作者/书名严重错误数：`0`
- 有声权利严重错误数：`0`
- 需修改但缺少修正值：`0`

未填写时状态应为 `waiting_for_user_spotcheck`；只有全部 gate 达标后，下一轮才可单独授权本地 staging apply。