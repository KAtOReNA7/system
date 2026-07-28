# 出版行业适配渠道核心：R0 接线与静态合同审计 v0.2

审计对象是出版行业适配的渠道月度发生—条件金额核心
（Publishing-Scale Channel Monthly Occurrence × Conditional Amount Core，
`M2-CHAN-PSC01`）以及出版行业规模适配渠道核心开发的核心实验臂
（`M2-EXP-PUBLISHING-SCALE-CHANNEL-01/CORE`）。

本报告只记录公开代码、synthetic fixture 和真实 npm 入口的无 private 预演。
`privateArtifactRowsRead=0`，候选拟合、预测和评价均未开始。

## 静态核验

| 核验项 | 结论 | 机器事实 |
|---|---|---|
| 历史 50/100 门槛 | 通过 | 当前配置和 core 不含历史固定资格字段 |
| 月度行与作品数 | 通过 | `monthlyRowsUsedAsIndependentWorks=false` |
| 支持统计 | 通过 | distinct/positive works、发生类别有效作品数、现金有效作品数、现金 HHI、独立 origin、实际参数数均进入节点收据 |
| 稀疏节点 | 通过 | 节点降级为 `POOLED_PARENT`，不阻断整个 raw candidate |
| 独立拟合节点 | 通过 | 当前 `DIRECT_FIT` 节点数为 0 |
| 冻结收缩节点 | 通过 | global、会员、广告、交易及喜马拉雅、微信读书、番茄畅听为 `SHRUNK_FIT` |
| 稀疏重点平台 | 通过 | 猫耳、克拉漫播为 `POOLED_PARENT` |
| taxonomy | 通过 | `REPORT_ONLY`，不估参、不路由 |
| 授权关系 | 通过 | `REPORT_ONLY`，不回填、不路由 |
| 训练权重 | 通过 | 每个 `standardWorkId` 的总权重相等 |
| Primary 外层折 | 通过 | 按 `standardWorkId` 五折隔离 |
| Strict 时序 | 通过 | 训练行必须满足 `origin < outerOrigin` 且 `labelAvailableAsOf < outerOrigin` |
| actual 与冲销 | 通过 | 绑定开发可建模冲销重述 actual；未分配残差只保留在财务对账并从标签隔离 |

## basis 与参数数

global pooled parent 的 `basisMechanism=membership` 只是 compact 线性 horizon
basis 的历史别名（`compact_linear_horizon_basis_alias_not_membership_routing`），
不表示 global parent 被路由成会员机制。校验器同时冻结 `basisMechanism`、
`basisProfile`、`occurrenceL2`、`conditionalAmountL2`、
`effectiveParameterCount` 和 `frozenTier`。

| 节点 | basis | L2（发生/金额） | 实际矩阵列数 | 冻结参数数 | tier |
|---|---|---:|---:|---:|---|
| global pooled parent | membership/compact alias | 1 / 1 | 20 | 20 | `SHRUNK_FIT` |
| 会员机制 | membership/current | 1 / 1 | 23 | 23 | `SHRUNK_FIT` |
| 广告机制 | advertising/compact | 1 / 1 | 21 | 21 | `SHRUNK_FIT` |
| 交易机制 | transactional/compact | 1 / 3 | 21 | 21 | `SHRUNK_FIT` |
| 喜马拉雅、微信读书 | membership/current | 1 / 1 | 23 | 23 | `SHRUNK_FIT` |
| 番茄畅听 | advertising/compact | 1 / 1 | 21 | 21 | `SHRUNK_FIT` |
| 猫耳、克拉漫播 | transactional/compact | 1 / 3 | 21 | 21 | `POOLED_PARENT` |

所有实际矩阵列数与冻结 `effectiveParameterCount` 逐节点一致。

## 真实命令入口

依赖方向为：

```text
publishing-scale npm command
→ canonical human-anchored command dispatcher
→ publishing-scale execution controller
→ publishing-scale private materializer
→ publishing-scale core
→ publishing-scale raw outputs / evaluation
```

真实命令
`npm run develop:m2:current:publishing-scale-channel -- --preflight-only`
实际调用 publishing-scale materializer preflight 1 次，历史渠道时间生成模型 v0.2
materializer 0 次，历史一次性授权检查 0 次。preflight 走过 package script、参数解析、
runner dispatch、config/support、模型与实验臂身份、materializer、receipt controller
和输出规划后，在任何 private capability read 或写入前停止。

## 工件与授权解耦

- 历史渠道时间生成模型 v0.2 工件只允许作为显式 `sourceArtifact=true` 的只读比较来源。
- 新 primary、strict、manifest、receipt、预测和评价均使用
  `M2-current-publishing-scale-channel-*v0.2-<exact-head>-attempt-<n>`
  专属名称和独立 Git ignored 目录；所有本轮行级文件以 create-new 模式写入，
  同名碰撞立即失败，基础设施恢复重试也必须使用新文件，不能覆盖第一次收据或输出。
- 历史 consumed authorization、closure 和失败收据不改写；本轮授权由
  `M2-PSC01-CONTROLLED-RETRY-20260728-01` 追加表达，并在 private 命令启动时绑定
  当前 Draft PR 的 exact HEAD。
- 任一模型 ID、实验臂、materializer、receipt controller、配置、支持合同或 exact-head
  CI 不一致都会 fail-closed。

当前机器状态为可进入公共门禁准备
（`READY_FOR_AUTHORIZED_PRIVATE_EXECUTION`），不是已经获准立即读取 private。
只有新 Draft PR 的 exact-head Linux/Windows CI、clean-clone 和本地完整公共门禁全部
通过后，单一逻辑 private 执行窗口才可开启。
