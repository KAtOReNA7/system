# 出版行业渠道直接现金尺度条件金额模型 v0.1：实现与结果决策

唯一开发重放已经完成并冻结，科学状态为 `PSC03_DEVELOPMENT_NOT_SUPPORTED`。

1. 算术层级诊断（`M2-EXP-PUBLISHING-SCALE-CHANNEL-DIRECT-CASH-03/D0`）和准 Gamma 方差族诊断（`M2-EXP-PUBLISHING-SCALE-CHANNEL-DIRECT-CASH-03/D1`）只用于机制归因，不能接管候选身份。
2. 唯一原始候选为准 Poisson 层级设计（`M2-EXP-PUBLISHING-SCALE-CHANNEL-DIRECT-CASH-03/P`；`M2-CHAN-PSC03-RAW`），完整 raw 只形成一次，未重跑。
3. 尺度假设轴为 `DIRECT_CASH_SCALE_HYPOTHESIS_NOT_SUPPORTED`；候选竞争力轴为 `CANDIDATE_SUPERIORITY_CONTRACT_NOT_PASSED`，二者不得压缩成同一结论。
4. PSC02 的 componentId、revisionId、effectiveAt、availableAt 与 extra=3 均未成为本模型的输入或门禁。
5. 本结果不授权独立评价、later-origin、final holdout、taxonomy/category 模型、production、automation、release、API、数据库、provider 或财务使用。
6. 唯一开发重放授权已经消耗；不得重跑 PSC03，也不得依据已打开结果在本任务中创建 PSC04 或其他后继候选。
7. 首次完整 raw 原子封存后，公开 JSON 的顶层性能证据标志和尺度门禁诊断曾因纯报告序列化遗漏而未写出；本次只从同一冻结结果补齐 `modelPerformanceEvidenceStatus`、`predictionGenerated` 与既已计算的 scale diagnostics。私有 raw、预测值、指标、bootstrap、digest、参数与科学判定均未改变，也没有再次运行模型。
