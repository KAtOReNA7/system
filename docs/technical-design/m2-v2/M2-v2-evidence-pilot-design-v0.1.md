# M2 v2 External Evidence Pilot 技术设计 v0.1

## 架构

V2-B 使用独立 evidence plane：授权 private 身份/历史事实 → 固定样本 manifest → 受控 query plan → provider receipt → 作品/作者消歧 → source/time/confidence/conflict/schema gate → private snapshot → 脱敏聚合报告。Provider response 绝不直接等于 evidence，也不写现金预测。

## 抽样与数据边界

Loader 只读取三个本地授权角色：3053 部 formal identity/history、192872 条收入事实（排名和近 12 月 activity 使用截至 2026-04 的 192869 条完整事实）、3053 部 post-foundation classification/revenue model。固定 seed 和 greedy minimum-coverage 算法先满足各层目标，再用 `SHA-256(seed + work reference)` 打破平局。manifest 在任何 retrieval 前 immutable；resume 必须复用同一 digest。

抽样不使用 forecastability、候选预测、C1/C2/C3 结果、final holdout 或搜索结果。top/middle/long-tail 由完整历史现金排序确定；dense/intermittent/dormant 由最近完整 12 月正收入月份确定；同名风险由重复规范名、短名和缺失/多作者署名等检索前身份事实确定。

## Provider 与恢复

Adapter contract 固定 provider ID/version/mode、query/hash、budget、status、results/pages、cost/latency 和 receipt digest。每个 query 完成后保存 cache；所有输出采用同目录临时文件后原子 rename。`resume` 验证 manifest digest 后复用 receipt，不重抽样、不改变 query。

当前没有授权 runtime provider 时，`no_provider_available` 为唯一启用 adapter：为每个计划 query 产生可审计的未派发 receipt，results/pages/cost 均为 0，execution status 为 `blocked_no_provider`。这不是成功率，也不允许把空结果转换为“没有外部信号”。

## Entity、时间与 evidence

作品和作者分别解析；同名 title-only match 必须 ambiguous；alternate candidate 只存 hash。`eventTime`、`availableAt`、`firstObservedAt`、`capturedAt` 不得互相回填，当前采集只可 prospective 使用。

Prediction candidate 必须同时通过：显式域名 allowlist、允许的 source terms、entity resolved、known availableAt、`max(availableAt, firstObservedAt, capturedAt) <= evidenceAsOfAt <= predictionLockedAt`、confidence min-rule ≥0.80、无 unresolved conflict、schema valid 和 feature manifest pre-registered。V2-B 不创建模型 prediction lock，因此 evidence 不能在本轮进入模型。

## Store 与公开边界

Private store 至少包含 manifest、query log、provider receipts、evidence、entity、contradiction、cost ledger、cache/state、verification receipt 和中文 review pack。默认不存网页全文，public report 不得含作品、作者、内部 ID、URL、query 或 snippet。

本设计不写 migration/正式 DB/API，不训练模型，不修改 B4，也不打开任何 sealed evaluation role。
