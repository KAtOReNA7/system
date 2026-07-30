# M2 OA03 当前角色纠偏报告 v0.1

截至 2026-07-30，本报告修正作品发生—金额校准模型 v0.3
（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）在当前动态核心老品
范围内的用户侧表述和机器角色解释。历史模型 ID、历史成绩、schema、digest 和冻结
证据均未改写。

## 一句话结论

**OA03 同公式在当前 Core 老品合同下重新执行完成；没有复现历史数值，因为
actual、训练支持和人口合同不同。**

这里的“重新执行完成”只表示 canonical 公式完成了一次当前合同下的技术执行，
不表示历史成绩复现成功，也不表示当前范围性能通过。

## 当前业务判断

- Primary rolling 的主要研究参考无法按原合同重建，因此 OA03 在 Primary
  3/6/12 月均不可评价；`null` 保持为不可评价，不写成 0。
- Strict rolling 的 3/6/12 月均不支持 OA03。动态 Core80 的同案例 WAPE FVA
  分别为 -48.99%、-42.62%、-42.50%，时间块改善占比均为 0。
- 动态 Core90 没有改变结论；Strict 3/6/12 月的同案例 WAPE FVA 分别为
  -44.81%、-40.22%、-40.29%，时间块改善占比均为 0。
- 因此 OA03 在当前 Core 老品范围内没有获得新的性能支持。
- `M2_OA03_CURRENT_SCOPE_REPLICATION_COMPLETE_PERFORMANCE_MIXED` 中的
  `PERFORMANCE_MIXED` 是机器证据完整性状态：不可评价、混合和不支持证据同时
  存在。它不是业务整体通过状态。

## occurrence 与金额能力

当前动态核心老品几乎都继续产生收入，发生判断不是主要困难：

| 评价 cell | 正例 / 非正例 | ROC-AUC | PR-AUC 解释 |
|---|---:|---:|---|
| Primary / Core80 | 194 / 0 | `null` | 全正例使 ROC-AUC 不可定义，PR-AUC=1 由 prevalence 主导 |
| Primary / Core90（3 月） | 394 / 2 | 0.440990 | 近乎全正例，PR-AUC 0.995028 不能单独证明业务区分力 |
| Strict / Core80（3、6 月） | 572 / 5 | 0.934266 | 近乎全正例，PR-AUC 0.999467 主要受 prevalence 影响 |
| Strict / Core90（3、6 月） | 1,281 / 7 | 0.946247 | 近乎全正例，PR-AUC 0.999718 主要受 prevalence 影响 |

OA03 的当前结果没有原生保存条件正金额预测，机器状态为
`CAPABILITY_NOT_STORED`，也没有从点预测反推该能力。结合金额 WAPE、偏差和同案例
FVA，当前 Core 老品的主要问题是未来金额，不是是否继续发生收入。

## 当前角色

- `M2-WORK-OA03` 仅保留为**兼容性现行运行回退**
  （compatibility operational fallback）。它不是当前开发冠军，不是当前范围最优
  模型，也没有得到 production 晋升。
- 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`）
  是当前 Core 老品 3/6/12 月分周期金额实验的主要研究比较基线。
- 现行运行路由没有改变。
- `activeCandidate=null`，`approvedForAutomation=null`。

模型登记表中来自状态索引 v0.25 和旧仓库治理文本的 champion 断言继续作为历史来源
保留，但已明确标记为 `historicalAssertion=true`、`currentAuthority=false`，并由
本报告取代其当前角色解释。当前机器权威为
`config/m2-model-registry.v1.json`。

## 冻结预注册与当前完成状态

`config/m2-current-oa03-replication.v0.1.json` 中
`P1_IMPLEMENTED_AWAITING_EXACT_HEAD_CI` 是不可变的预注册快照，不会为了显示后来完成
状态而回填。当前完成状态由下列结果表达：

- 私有结果 manifest（Git ignored）；
- Model Registry；
- `docs/analysis/m2-v2/M2-v2-current-state-index-v0.43.md`。

## 权限边界

本次角色纠偏不改模型、不训练模型、不改变生产代码路由，不授权自动化、production、
later-origin、final holdout、渠道分配、release 或 PR 合并。

