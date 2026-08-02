# M2 PSC02 实现与首次结果决策记录 v0.1

对象：出版行业渠道起点可见现金锚金额模型 v0.1
（Publishing-Scale Channel Origin-Visible Cash-Anchor Amount Model v0.1，
`M2-CHAN-PSC02`；raw variant `M2-CHAN-PSC02-RAW`）。

## 决策

1. 预注册核心已经实现并通过公共 synthetic/contract 验证；这只证明公式与失败关闭路径
   可执行，不是候选成绩。
2. 唯一受控开发重放在源权威门禁停止；没有完整主设计原始结果可冻结，也没有发生
   outcome-driven 调整或第二次科学运行。
3. 最终状态登记为开发不支持（`PSC02_DEVELOPMENT_NOT_SUPPORTED`），原因类别固定为
   `PRIVATE_SOURCE_AUTHORITY_BLOCKER_NOT_MODEL_FAILURE`；不得写成“模型 WAPE 失败”。
4. 冻结 PSC01、LG01、历史 receipt、digest、预测与评价均只读，未被覆盖、重命名或回填。
5. 模型保持 inactive：`activeCandidate=null`、`approvedForAutomation=null`、
   `productionReady=false`、`finalHoldoutOpened=false`。

未授权事项包括独立评价、later-origin、prospective final holdout、重试、taxonomy 入模、
production、automation、release、API、数据库、provider 和财务使用。
