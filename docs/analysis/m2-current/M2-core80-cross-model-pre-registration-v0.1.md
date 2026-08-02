# 2020–2025 Core80 全模型真实业务横评预注册 v0.1

> 英文原名：M2 Core80 Cross-Model Real-Business Evaluation v0.1；稳定活动 ID：`M2-CMX01`；机器状态码：`M2_CMX01_PREREGISTERED_BEFORE_NEW_OUTCOME_READ`。

## 决策边界

这是结果打开前冻结的历史横评合同，不是模型开发、激活或生产授权。生成本文件时，新横评结果尚未读取（`outcomeReadAtGeneration=false`）。只允许模型原算法固有的逐起点拟合；禁止调参、新模型、按作品事后选模、未来实际 Core80、final holdout、production、automation、release 与 M3 formal。

## 权威与快照

- 模型名称、角色与可比人口唯一权威：`config/m2-model-registry.v1.json`。
- 业务门槛唯一数值权威：`config/m2-business-acceptance-contract.v1.json`。
- actual：开发可建模冲销重述分成现金（`M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01`）。
- Registry 共 37 项，已逐项裁决；正式可排名登记项 14 项。
- 私有源快照 ID：`M2-CMX01-SOURCE-SNAPSHOT-2026-08-02`；只公开 SHA-256，不公开路径、身份或金额。
- 三条 2026-05 分成附加行保留，不删除；它们在 2020-01 至 2025-12 的评价 actual 窗口外。任何 target end 超过 2025-12 都必须失败关闭。

## 起点、周期与人口

- H3：70 个完整月度起点；H6：67；H12：61；H36：37；合计 235 个起点×周期单元，不做季度抽样。
- 年度 H12 起点：`2019-12`、`2020-12`、`2021-12`、`2022-12`、`2023-12`、`2024-12`。
- 正式排名人口：起点可见动态 Core80（`ORIGIN_VISIBLE_DYNAMIC_CORE80`）。
- 补充诊断：年度实际 Core80（`ANNUAL_ACTUAL_CORE80_HINDSIGHT_DIAGNOSTIC`）与全部合格作品（`ALL_ELIGIBLE_WORKS_DIAGNOSTIC`），两者均不能单独选冠军。
- 每个起点按当时可见分成现金重算 Core80，保留阈值并列；作品及作品×渠道都至少有 3 个完整账单月。未来新作品、未来首次渠道和 Core 外尾部均弃权，不计作 0。

## 同案、渠道与缺失

同案必须同时匹配 origin、target start/end、horizon、work、population、actual、actual definition、canonical channel identity 与 feature cutoff。输出共同覆盖主榜、自身覆盖成绩和两两配对比较；缺失预测不补 0，也不允许不同覆盖率 WAPE 直接宣称冠军。

作品×渠道是强制交付。原生渠道、登记组合与公共分配器诊断分榜。公共分配器固定为当前范围复现实验的最近 12 月渠道份额分配臂（`M2-EXP-OA03-CURRENT-SCOPE-REPLICATION-01/C1`）；所有作品模型使用同一分配器，必须精确回到作品总额，结果只标记组合诊断（`COMPOSITE_DIAGNOSTIC`）。

## 指标、门槛与统计

- 主要排序：WAPE；并列依次看绝对 signed bias、灾难窗数量、稳定变体 ID；不得临时加权成总分。
- 同时报告 predicted/actual、MAE、RMSE、sMAPE、非零 actual median APE、覆盖率、失败率、灾难数与误差集中度。
- 失败诊断：非零 actual 的 APE ≥100%；灾难诊断：APE ≥300%。两者不是新增淘汰门槛。
- 正式门槛只来自现行业务验收合同；H3/H6/H12/H36 的 WAPE 与绝对偏差上限不得事后修改。
- 配对 bootstrap：作品×forecast origin 联合分块，固定种子 20260802，5000 次；必要时使用 Holm 多重比较修正。

## 公私边界与停止条件

Git 只保存满足隐私阈值（至少 30 案、20 部）的匿名聚合。逐书、逐渠道、绝对金额、私有 ID、标题和本机路径只进入 Git ignored 能力目录。完成后只允许形成历史结论；即使识别出历史冠军，也必须同时标记 `HISTORICAL_ONLY_NOT_ACTIVATED`，不得修改 activeCandidate、approvedForAutomation、productionReady 或 finalHoldoutOpened。

## 内容绑定

- 预注册合同 SHA-256：`cb0fc9f20d94a63c10e3e3f99069073ae59073226a098533d7b7d9bdb76a6333`
- Model Registry SHA-256：`c3be0ae2745b25495f4a4700e76b2886c82ab812a20c2ee15c30633e010a4048`
- 评价核心 SHA-256：`504d15762713d90fce19ab8827172f962db44cd12a4af26a195760c9c7d61ce8`
- canonical payload SHA-256：`57c04a2d3642090fedd67748e731abdb53ecd5c9bb12d8c9d315c990b09dc35a`
