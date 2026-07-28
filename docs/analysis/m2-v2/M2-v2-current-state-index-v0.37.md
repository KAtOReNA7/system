# M2 当前状态索引 v0.37

截至 2026-07-28，出版行业适配的渠道月度发生—条件金额核心
（Publishing-Scale Channel Monthly Occurrence × Conditional Amount Core，
`M2-CHAN-PSC01`）已经产出第一份完整、同人口、可解释的原始候选评价。冻结门结论为
失败（`M2_PUBLISHING_SCALE_CORE_FAIL`），不是实现阻断，也不是未执行。

作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，
`M2-WORK-OA03`）继续作为作品级现行运行回退；人工锚定可学习全局模型
（Human-Anchored Learned Global，`M2-WORK-LG01`）继续作为研究比较基线。
活动候选与自动化批准均为空（`activeCandidate=null`，
`approvedForAutomation=null`）。

## 先说结论

- 原始候选（raw candidate，`M2-CHAN-PSC01-RAW`）已真正拟合并冻结
  3,318,819 行预测，随后才进行评价和不可选模的 forecastability/oracle 诊断。
- 实际使用评价合同 v2.2 的开发可建模冲销重述
  （`M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01`），没有启用
  development-only positive-cash 后备口径；primary 与 strict 的整数守恒差均为 0。
- 主评价（primary）WAPE 为 0.92408663，严格滚动（strict）WAPE 为
  0.91533339；相对同人口冻结研究基线分别恶化 108.55% 与 121.73%。
- 2,000 次 `standardWorkId` 作品聚类配对 bootstrap 的相对 WAPE 95% 区间分别为
  [-2.48939466, -0.30710745] 与 [-2.06232324, -0.55150692]，均整体低于 0；
  伤害不是少数作品造成的偶然波动。
- 条件正金额严重低估是主要限制。真实条件金额 oracle 最多可移除约 3.252 亿 /
  3.664 亿绝对误差，真实发生 oracle 仅约 87 万 / 263 万。future-first 新渠道进入
  有非零影响，但不是首要根因。
- 当前 cash-only 路线不值得在同一开发窗口继续调参。若未来获得独立授权，最有价值
  的方向是补充 forecast-origin 可得的历史商业状态、可用量与消费、曝光与 eCPM、
  订单与退款、合同及运营动作；本索引不授权该后续开发。

## 私有输入与跨电脑修复

此前缺失的三个 Git ignored 文件已按长期合同重新分类：

| 原文件 | 当前类别 | 缺失语义 |
|---|---|---|
| reversal-scope-reconciliation | 可重建私有派生缓存（`PRIVATE_DERIVED_CACHE`） | 缓存未命中，自动重建（`CACHE_MISS_REBUILDABLE`） |
| reversal-allocation-ledger | 可重建私有派生缓存（`PRIVATE_DERIVED_CACHE`） | 缓存未命中，自动重建（`CACHE_MISS_REBUILDABLE`） |
| evaluation-v2.2-execution-receipt | 私有运行溯源（`PRIVATE_RUN_PROVENANCE`） | 可选历史溯源缺失（`OPTIONAL_PROVENANCE_MISSING`） |

不可推导的原始账单、用户确认成员关系和标准作品映射保持私有来源权威
（`PRIVATE_SOURCE_AUTHORITY`）。准备命令从这些权威输入与冻结代码确定性重建
版本化派生目录；历史收据不再作为训练输入或运行硬门禁。本轮重建得到 primary
58,986 个 packed rows、strict 102,743 个 packed rows，并生成新的真实收据。

公开能力盘点现在分别报告 `sourceAuthorityStatus`、`derivedCacheStatus`、
`historicalReceiptStatus`、`rebuildPlan`、`safeToRebuildDerivedCache` 和
`safeToStartModelAfterRebuild`。私有来源真正缺失仍会 fail closed；派生缓存或历史
收据缺失不会再返回已废弃的 `BLOCKED_MISSING_PRIVATE_ARTIFACT`。

## 同人口成绩

下表只比较相同 target、actual definition、case、origin、horizon 和评价族。旧
v2.1/v2.2 历史成绩、不同粒度渠道行以及其他人口不进入该排名。

| 对象 | 主评价 cases / WAPE / signed bias | 严格滚动 cases / WAPE / signed bias |
|---|---:|---:|
| 冻结研究基线（Frozen learnedGlobal，`M2-WORK-LG01-FROZEN-G0`） | 12,039 / 0.44310049 / -0.12165171 | 74,320 / 0.41281268 / -0.03786001 |
| 原始候选（`M2-CHAN-PSC01-RAW`） | 12,039 / 0.92408663 / -0.88928240 | 74,320 / 0.91533339 / -0.85410647 |
| 现行运行回退同案例交集（`M2-WORK-OA03`） | 12,039 / 1.00000000 / -1.00000000 | 74,320 / 1.00000000 / -1.00000000 |

候选相对现行运行回退的同案例交集改善 7.59% / 8.47%，但这不能掩盖它相对强研究
基线的大幅退化。现行运行回退的角色来自独立当前合同，不因这两个交集分数改变。

主评价候选绝对误差为 416,029,696.41、MAE 为 34,556.83、绝对误差中位数为
948.11；严格滚动对应为 458,012,200.67、6,162.70 和 141.61。所有 strict horizon
（3、6、12、18、24 个月）以及主评价 36 个月 horizon 相对冻结研究基线均未改善，
严格滚动 11 个时间块也没有满足冻结改善门。

## 发生、金额、结构与支持

- 主评价 occurrence：2,123,496 行、941,160 个正例；Brier 0.25234024、
  log loss 5.05660224、PR-AUC 0.73754706、Average Precision 0.73754724。
- 严格滚动 occurrence：1,195,323 行、579,661 个正例；Brier 0.22202674、
  log loss 2.88605772、PR-AUC 0.80771272、Average Precision 0.80771300。
- 主评价条件正金额 WAPE 0.94971401、signed bias -0.87717583；严格滚动 WAPE
  0.94809218、signed bias -0.84310076。预测金额质量而非发生排序是主要失败面。
- top 1%/5%/10% 收入作品的 WAPE 仍约为 0.91–0.97，头部现金严重低估；排序和
  top capture 只属于后验诊断，不能替代作品点预测。
- 机制时间 basis 相对全局父层消融带来约 4.999% / 5.259% 的局部 WAPE 增益，说明
  mechanism 有信息，但不足以形成合格独立核心。

全局父层、会员、广告、交易机制、喜马拉雅和番茄畅听在各自有支持的 outer fit 中
使用连续收缩拟合（`SHRUNK_FIT`）。猫耳和克拉漫播始终池化到父层
（`POOLED_PARENT`）；微信读书在 primary 的 5/5 个 outer folds 以及 strict 的
5/11 个早期 origins 因支持不足使用 `POOLED_PARENT`，其余 strict origins 使用
`SHRUNK_FIT`。没有节点使用直接拟合（`DIRECT_FIT`）。三级分类和授权关系继续只
报告（`REPORT_ONLY`），不估参、不路由、不做历史回填。

## 不参与选模的可预测性诊断

| 诊断 | 主评价最多可移除绝对误差 | 严格滚动最多可移除绝对误差 |
|---|---:|---:|
| 真实发生替换（`ORACLE_OCCURRENCE_ONLY`） | 874,261.26 | 2,631,667.92 |
| 真实条件金额替换（`ORACLE_AMOUNT_ONLY`） | 325,185,835.39 | 366,379,653.11 |
| 发生与金额同时替换（`ORACLE_BOTH`） | 416,029,696.41 | 458,012,200.67 |
| future-first 新渠道上限（`FUTURE_FIRST_ENTRY_CEILING`） | 47,230,846.93 | 26,425,839.94 |

origin 时尚未观察的新渠道正现金占比分别为 11.4801% 和 7.4178%。上述诊断均在候选
冻结后执行，使用未来信息，仅用于解释；机器属性保持 `participatesInTraining=false`、
`participatesInSelection=false`、`participatesInGate=false`、`deployable=false`。

## 执行与冻结边界

评价实现提交为 `4ef137246360097bd3debe427d1421a7d76c2b19`。此前四次无效尝试分别
暴露内存上限、同人口渠道比较接线、收据排序和大文件序列化问题；每次均在第一份有效
评价前保留独立 attempt receipt。第五次尝试产生首个有效结果后立即冻结，未根据
outer outcome 修改特征、参数、层级、fold 或评价门，也没有运行第二个参数版本。

raw candidate 没有被 fallback 或 selected pipeline 覆盖。final/later-origin
holdout、provider、数据库、production loader/route/API、exact v0.3、taxonomy
建模、授权历史回填、Canary/full160、automation、release、M3 formal 和 PR merge
均未打开。

## 当前权威入口

- 模型机器权威：`config/m2-model-registry.v1.json`
- 中文模型目录与成绩总账：
  `docs/analysis/m2-current/M2-model-catalog-and-scorecard-v1.md`
- 原始候选聚合评价：
  `docs/analysis/m2-current/M2-current-publishing-scale-channel-development-v0.1.json`
- 中文开发报告：
  `docs/analysis/m2-current/M2-current-publishing-scale-channel-development-v0.1.md`
- 聚合 forecastability/oracle：
  `docs/analysis/m2-current/M2-current-publishing-scale-channel-forecastability-v0.1.json`
- 中文诊断报告：
  `docs/analysis/m2-current/M2-current-publishing-scale-channel-forecastability-v0.1.md`

所有公开 artifact 只包含聚合证据；作品/渠道行级 identity、actual、prediction、
private receipt 与 digest 留在 capability-scoped Git ignored 目录。
