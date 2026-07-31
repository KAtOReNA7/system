# M2 HCRC01 选择门禁归因 v0.1

## 结论

冻结的 LG01 头部现金残差校准实验（`M2-EXP-LG01-HEAD-CASH-RESIDUAL-01`）
仍保持 `M2_LG01_HEAD_CASH_RESIDUAL_FAIL`，本次没有重跑旧模型、旧 bootstrap
或旧评价。

现存冻结证据可以确认：16 个 outer selection 单元全部得到
`NO_ELIGIBLE_GLOBAL_ALPHA_FALLBACK_C0`；随后 H50、M30、L20 三个现金带均因
global alpha 不合格而短路为 `GLOBAL_ALPHA_INELIGIBLE_FALLBACK_C0`。因此，
HCRC01 证明的是“其可部署整体路由失败”，并没有证明 M30/L20 独立分段修正已经
形成 raw candidate、接受 outer 评价后失败。

## 可以恢复的事实

- outer selection 单元：16 个。
- 合格 global alpha：0 个。
- H50、M30、L20 各有 16 个单元因 global alpha 不合格而回退。
- C2/C3 的 raw candidate case 均为 0；selected 结果只是冻结 LG01。
- 选择没有使用 outer outcome，也没有使用固定作品数门槛。
- 合同把现金带锚定到 `C2_SELECTED_ALPHA`，实现又在 global
  `selectedAlpha` 非有限时直接返回三个现金带全回退；这是预注册合同与实现共同
  形成的依赖，不是本次新发现、可据此改写历史结果的工程错误。

## 无法可靠恢复的字段

原本 16 条 private selection 记录属于可重建派生缓存
（`PRIVATE_DERIVED_CACHE`），当前工作区、Git 历史和 PR 公开证据均未保留其逐
alpha 诊断。附件同时禁止重跑 HCRC01、旧 bootstrap 或读取旧 outer 行级 outcome
来做新选择，因此 alpha 0.25、0.50、0.75、1.00 分别被 bias、H50 absolute
error、最大单作品误差占比、top10 误差占比、数值稳定性和 Core90 相反退化拒绝的
次数不可恢复。

机器 JSON 将这些计数显式记录为 `null` 和
`NOT_RECOVERABLE_FROM_REMAINING_FROZEN_EVIDENCE`。这比用结果级失败原因反推
selection 级次数更严格，也避免伪造证据。

## 边界

- HCRC01 的历史 FAIL、公开数值和不可变工件均未改写。
- 缺少派生缓存不等于缺少权威源，也不要求用户恢复旧电脑。
- 本报告只支持设计归因，不授权训练、重评分、final holdout、生产或发布。
