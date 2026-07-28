# M2 评价合同 v2.2 开发激活说明 v1

## 结论

M2 评价合同 v2.2 的当前开发状态为：

`M2_EVALUATION_V2_2_ACTIVE_FOR_DEVELOPMENT_WITH_DISCLOSED_RESIDUAL_EXCLUSION`

该状态只授权使用开发可建模冲销重述标签开展开发评价。它不是完整财务最终重述，
不是 production 或 automation gate，不授予模型晋升、发布、Canary、final
holdout 或数据库写入。

## 四个视图

1. `POSTING_TIME_ACCOUNTING_VIEW` 保留原始入账财务事实，143 条冲销没有删除。
2. `AS_OF_RESTATED_VIEW` 在每个 forecast origin 只使用当时已经 recorded 的冲销。
3. `FINAL_ACCOUNTING_RECONCILIATION_VIEW` 保留正收入、全部冲销、已分配冲销和
   未分配残差的完整财务桥接；不得声称残差已经解决。
4. `DEVELOPMENT_MODELABLE_RESTATEMENT_VIEW` 使用正现金减去已成功分配的冲销作为
   开发标签，只把无法归属的 residual component 记入
   `excludedUnallocatedReversalResidual`。

开发 actual 的稳定身份是
`M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01`。原入账 actual 与开发可建模
actual 使用不同 `comparabilityGroupId`，不得跨 actual definition 评选模型赢家。

## 精确残差隔离

未分配冲销残差为 `-267.769000000000330000` 权威货币单位，对应精确整数
`-267769000000000330000`（尺度 `10^18`）。精确守恒式为：

`posting positive cash + posted reversal = modelable restated cash + excluded unallocated reversal residual`

守恒差为 0。残差仍在财务 reconciliation 中可见；没有物理删除原始冲销，没有删除
已正确分配的冲销部分，也没有把残差舍入或伪装成 0。

## 冻结预测重评分

既有 6 个冻结 artifact、716,801 行预测保持原摘要，预测修改和新预测生成为 0。
重评分只替换标签定义。所有模型比较只允许在相同 actual definition 和相同 paired
population 内进行；原入账与开发可建模分数的变化只解释为标签影响。

v2.1 及上一版 v2.2 阻断结果继续作为历史证据保留，不回写历史 raw failure。
