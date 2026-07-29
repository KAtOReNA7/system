# M2 当前状态索引 v0.39

截至 2026-07-29，当前 M2 作品预测范围已纠偏为：在每个预测起点重新计算的核心成熟
老品（dynamic Core80 / Core90），以及这些作品在该起点已经出现并满足成熟条件的
canonical 渠道。预测实际值为未来分成收入开发可建模冲销重述现金
（`M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01`）。

本轮完成范围治理、冻结模型重评分，以及一次预注册训练人口消融
（`M2-EXP-CORE-LEGACY-POPULATION-01`）。结论是尾部干扰未确认
（`TAIL_INTERFERENCE_NOT_CONFIRMED`）：缩窄训练人口没有形成达到 1% 门槛、bootstrap
支持且跨时间块稳定的改善。本轮没有改变现行运行回退、production、自动化、留出集或
模型架构。

## 当前预测范围

纳入当前作品预测 actual：

- 起点时已经成熟的老作品；
- 上述作品在起点时已经出现且成熟的 canonical 渠道；
- 同一符合条件渠道对在 3、6、12、36 个月窗口内的未来分成收入开发可建模现金；
- 作品总额只能是同一符合条件渠道对的求和。

明确排除：

- 预测起点后的新增作品；
- 老作品在预测起点后首次出现的新渠道；
- 动态核心人口之外的长尾作品；
- 买断及其他非分成现金；
- 公司组合总额与上述作品范围之间的缺口。

人口资格不是按当前静态名单回填。作品和渠道均须从首次正分成入账月起至预测起点至少
有 3 个完整月；不成熟渠道对弃权并单独报告未来收入占比，不得按 0 计入候选误差。

## K0：范围与训练语义审计

范围治理阶段（scope governance，`M2-EXP-CORE-LEGACY-POPULATION-01/SCOPE_GOVERNANCE`）
确认，既有人工锚定可学习全局模型
（Human-Anchored Learned Global，`M2-WORK-LG01`）训练人口并不等于当前核心老品范围。
在 24 个冻结历史起点评价中：

- 每个起点平均核心 80% 作品数为 44.46，核心 90% 为 97.13，全部符合资格作品为
  1,374.92；
- 核心 80% 作品只占冻结训练行 2.89%，但承载 73.06% actual 和 56.10% 训练损失；
- 核心 80% 至核心 90% 区间占训练行 3.45%、actual 8.77% 和训练损失 12.07%；
- 核心 90% 之外的长尾占训练行 87.81%、actual 11.95% 和训练损失 18.58%；
- 不符合资格人口占训练行 5.85%、actual 6.22% 和训练损失 13.26%。

长尾显著主导行数，但这些描述性分解本身不能证明长尾造成模型干扰。

## K1：冻结模型正确人口重评分

正确人口冻结重评分
（frozen rescore，`M2-EXP-CORE-LEGACY-POPULATION-01/FROZEN_RESCORE`）
只使用既有冻结公式、参数和预测工件，没有训练、调参或补造预测。70 个合法起点的平均
核心 80% / 核心 90% 作品数分别为 21.13 / 40.51。

| horizon | 核心 80% 的未来绝对收入覆盖 | 核心 90% 的未来绝对收入覆盖 | 不成熟已有渠道未来收入占比 |
|---:|---:|---:|---:|
| 3 个月 | 76.59% | 87.88% | 11.81% |
| 6 个月 | 76.89% | 88.03% | 12.15% |
| 12 个月 | 77.99% | 88.57% | 11.85% |
| 36 个月 | 81.40% | 90.27% | 10.60% |

在主要滚动、核心 80%、作品总额、严格同案例窗口内，各 horizon 的最佳冻结模型分别为：

| horizon | 最佳冻结模型 | WAPE |
|---:|---|---:|
| 3 个月 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 0.262460 |
| 6 个月 | 核心收入人工规则模型 v0.1（Core Revenue Manual Rule Model v0.1，`M2-WORK-CRMR01`） | 0.265139 |
| 12 个月 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 0.248919 |
| 36 个月 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 0.284898 |

这些是四个不同 horizon 的局部同案例结论，不构成跨 horizon 冠军。作品发生—金额校准
模型 v0.3 没有可冻结重建的渠道分解，渠道粒度必须显示为不可比较，而不是填 0。

## K2：一次受控训练人口消融

受控训练人口消融
（controlled training-population ablation，`M2-EXP-CORE-LEGACY-POPULATION-01`）
固定人工锚定可学习全局模型的特征、架构、参数网格和 36 个月训练标签，只改变训练
人口；在 6 个共同季度外层起点上评价。有效训练评价次数为 1，结果后调参次数为 0。

| 训练人口臂 | 对应评价人口 | 3 个月作品总额 WAPE | 6 个月作品总额 WAPE | 相对全量训练 |
|---|---|---:|---:|---|
| 原始全量训练人口（`M2-EXP-CORE-LEGACY-POPULATION-01/T0_FULL`） | 核心 90% | 0.400193 | 0.390883 | 受控参照 |
| 动态核心 90% 训练人口（`M2-EXP-CORE-LEGACY-POPULATION-01/T1_CORE90`） | 核心 90% | 0.400060 | 0.389917 | 改善 0.033% / 0.247%，低于 1% 门槛 |
| 原始全量训练人口（`M2-EXP-CORE-LEGACY-POPULATION-01/T0_FULL`） | 核心 80% | 0.378171 | 0.365917 | 受控参照 |
| 动态核心 80% 训练人口（`M2-EXP-CORE-LEGACY-POPULATION-01/T2_CORE80`） | 核心 80% | 0.395021 | 0.383132 | 退化 4.456% / 4.705% |

动态核心 90% 训练的微小作品总额改善没有 bootstrap 支持，6 个“时间块 × horizon”
单元中只有 2 个改善；其对应渠道 WAPE 反而退化 0.312% / 0.322%。动态核心 80% 训练
在作品总额和渠道层均退化，bootstrap 支持退化，6 个时间块单元中没有改善。

核心 80% 的误差变化较集中于极端作品：3 / 6 个月最大单一作品分别贡献 49.08% /
50.03% 的绝对误差变化，前五作品分别贡献 59.12% / 60.05%。但这种集中性没有改变
整体退化方向，也不能把结果解释为“已证实的均值回归修复”。

起点可见收入加权全量训练人口
（`M2-EXP-CORE-LEGACY-POPULATION-01/T3_REVENUE_WEIGHTED_FULL`）因现有训练器没有原生
样本权重而未执行（`NOT_EXECUTED_REQUIRES_MODEL_CHANGE`）；不得用重复采样或模型改动
替代预注册定义。

## 结论与架构边界

- 尾部干扰未确认（`TAIL_INTERFERENCE_NOT_CONFIRMED`）。
- 当前证据不足以授权“核心作品总额 + 渠道份额”独立架构
  （`NOT_ENOUGH_EVIDENCE_TO_AUTHORIZE_CORE_TOTAL_PLUS_CHANNEL_SHARE_MODEL`）。
- 作品总额与渠道粒度在动态核心 90% 训练下出现方向分歧，说明它可以作为未来单独
  预注册架构研究的问题，但本轮不实现、不训练、不授权该架构。
- 现行运行回退仍是作品发生—金额校准模型 v0.3
  （Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）。
- 研究比较基线仍是人工锚定可学习全局模型
  （Human-Anchored Learned Global，`M2-WORK-LG01`）。
- 活动候选与自动化批准模型仍为空（`activeCandidate=null`；
  `approvedForAutomation=null`）。
- 任务状态为 M2 核心老品范围纠偏与尾部测试完成
  （`M2_CORE_LEGACY_SCOPE_AND_TAIL_TEST_COMPLETE`）。

## 执行与边界

- K0 普通提交：`71d035e3e6b23bac53256c7cb851565f7f09682e`；Linux/Windows
  exact-HEAD CI run `30452941270` 均成功。
- K1 普通提交与 K2 执行基线：`fd73c6dd6202e077327cf951314bffd55e0e2a48`；
  Linux/Windows exact-HEAD CI run `30454254542` 均成功。
- 分支：`codex/m2-core-revenue-manual-v0-1`；Draft PR
  [#32](https://github.com/KAtOReNA7/system/pull/32)，未合并。
- 本轮未读取 later-origin 或 final holdout，未连接 provider、production 或共享
  数据库，未运行 Canary/full160，未改变 production、release 或 M3 formal。

最终收敛提交及其 Linux/Windows exact-HEAD CI 由 PR #32 与本轮最终复盘记录；避免
为了把 CI run 编号写回仓库而制造无穷后继提交。

## 当前权威入口

- 机器模型权威：`config/m2-model-registry.v1.json`
- 范围与一次性消融合同：`config/m2-current-core-legacy-population.v0.1.json`
- 范围合同：
  `docs/analysis/m2-current/M2-core-legacy-observed-channel-scope-contract-v0.1.md`
- 训练人口与损失审计：
  `docs/analysis/m2-current/M2-core-legacy-training-population-and-loss-audit-v0.1.json`
- 冻结重评分：
  `docs/analysis/m2-current/M2-core-legacy-frozen-rescore-v0.1.json`
- 尾部干扰测试：
  `docs/analysis/m2-current/M2-core-legacy-tail-interference-test-v0.1.json`
- 中文模型目录：
  `docs/analysis/m2-current/M2-model-catalog-and-scorecard-v1.md`
