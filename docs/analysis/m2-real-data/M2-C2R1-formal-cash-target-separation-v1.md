# M2 C2-R.1 正式现金目标拆分审计 v1

- 状态：`not_for_formal_decision`
- C2-R.1 训练：未开始
- final holdout / embargo / 60-month labels：全部 sealed

## 结论

正式点值已经冻结为“未来实销现金 + cutoff 时已确认且可审计的未来应收”。未承诺买断、历史周期推测、概率乘金额、已到账买断摊销和买断月均等效值均不进入正式现金预测。

历史 development 回测保持 18615 个原 case window，其中 statistically scoreable 为 12223 个。当前权威输入没有 as-of commitment 角色，因此纯买断无承诺 case 走 route abstention，null 不按 0 计分；既有 scoreability 和 business eligibility 未改写。

## 三套 actual（重叠 case-window 聚合，不是唯一账单总额）

| actual | 金额 |
|---|---:|
| forecastableCashActual | 82206415.70 |
| uncommittedBuyoutSurpriseActual | 5517115.15 |
| totalLedgerCashActual | 87723530.85 |

surprise 为 466 个正金额 case window，占 total ledger cash 的 6.2892%。金额逐 case 与聚合守恒均通过。

该 6.2892% surprise 不进入主要模型指标和候选 gate，但必须进入端到端业务差额；无 cutoff 承诺的纯买断路由继续 abstain。为防止与 route 小格做差分还原，served、结构可预测和 route-abstained 的互补边际总数均不公开。本轮没有重新训练、调参或计算 C2-R.1 候选指标。
