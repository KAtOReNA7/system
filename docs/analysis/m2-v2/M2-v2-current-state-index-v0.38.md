# M2 当前状态索引 v0.38

截至 2026-07-29，分层收入组合模型 v0.1
（Layered Revenue Composition Model v0.1，`M2-PORT-LRC01`）已完成首个有效
真实账单组合级滚动开发评价。验证结论为失败
（`M2_LAYERED_REVENUE_COMPOSITION_FAIL`）：3/6 个月只有无同案比较的绝对成绩；
12 个月主方案明显高估；36 个月直接目录保留严重高估，并存在年度分量与辅助实验臂
未完整执行的协议缺口。

这是一项开发窗证据，不是训练、选模或生产晋升。现行运行回退、研究比较基线、
组合参考、活动候选、自动化和 production 均未改变。

## 执行与冻结

- 评价执行 HEAD：`82e160d4a3305f0b408582eaeb0527c26005e555`。
- 执行分支：`codex/m2-core-revenue-manual-v0-1`。
- Draft PR：[#32](https://github.com/KAtOReNA7/system/pull/32)，执行时为
  Open/Unmerged。
- exact-HEAD CI：GitHub Actions run `30438943191`，Linux `verify` 与 Windows
  `verify-windows` 均成功。
- 有效收据：`VALID_EVALUATION_COMPLETE`；冻结预测行 840；合法 origin 70。
- 模型训练 0；按外层结果选模 0；有效收据后候选重跑 0。
- 有效评价前两个实现中止均发生在指标形成前，状态为
  `INVALIDATED_EXECUTION_RETRY_ALLOWED` 且没有模型结论；修复了超大 minor-unit
  的科学计数法 Number/BigInt 边界，没有修改预注册公式或参数。

## 权威与四分量守恒

- 分成账权威行 190,663；作品 2,719；canonical 渠道 39；冲销行 143。
- actual 为分成收入开发可建模冲销重述
  （`M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01`）。
- 权威起始月 2017-06；标签成熟截止月 2026-05；原始冲销删除数 0。
- 冲销重述守恒差为 0，四分量最大守恒差为 0。
- 主路线 actual 构成：现有核心 45.36%、现有长尾 7.69%、未来新增作品
  41.36%、现有作品新增渠道 5.59%；四类互斥且合计为 100%。
- 买断及其他非分成现金没有进入模型输入、actual 或评价。

## 主路线分 horizon 结果

| horizon | WAPE | signed bias | 2,000 次 origin bootstrap 95% 区间 | 判定 |
|---:|---:|---:|---:|---|
| 3 月 | 0.180339 | -0.040729 | [0.139867, 0.227678] | 仅绝对成绩，无同案比较 |
| 6 月 | 0.218944 | -0.003830 | [0.162838, 0.285756] | 仅绝对成绩，无同案比较 |
| 12 月 | 0.552720 | +0.278809 | [0.458096, 0.668187] | 失败 |
| 36 月 | 1.963796 | +0.942953 | [1.701657, 2.248894] | 失败 |

四 horizon 合并 WAPE 为 1.505570、signed bias 为 +0.711745。合并值只用于登记，
不能掩盖 horizon 差异。

分层收入组合实验（`M2-EXP-LAYERED-REVENUE-COMPOSITION-01`）的阶段 L5B
（12 个月直接目录组合主臂）WAPE 为 0.552720；阶段 L5A（12 个月核心规则诊断臂）
为 0.359818。预注册禁止结果后替换，主结果保持阶段 L5B 并判失败。

## 长期故障与协议缺口

- 36 个月未来新增作品分量占 actual 51.03%，分量 WAPE 3.280588、bias
  +1.914057，是长期高估的主要来源。
- 36 个月前半窗 WAPE/bias 为 1.000000/-1.000000，后半窗为
  2.310174/+1.641230，方向反转且不稳定。
- 阶段 L6B（年龄带收缩辅助臂）与阶段 L6A（公司目录直接保留主臂）逐行相同；
  阶段 L6B 记为 `NOT_EXECUTED_DUPLICATES_L6A`，不能宣称年龄带方案已评价。
- Y1/Y2/Y3 没有单独评分；声明的 component rows、evaluation rows 与 top-revenue
  后验切片没有物化。缺失项不以 0 或其他 horizon 结果填补。
- 当前 actual 定义下没有同案例公司组合比较行，比较状态为 `NOT_COMPARABLE`；
  不计算相对 FVA，也不与组合现金 ETS/Holt-Winters
  （`M2-PORT-ETS01`）跨人口或跨窗口排名。

## 当前角色与封闭边界

- 现行运行回退：作品发生—金额校准模型 v0.3
  （Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）。
- 研究比较基线：人工锚定可学习全局模型
  （Human-Anchored Learned Global，`M2-WORK-LG01`）。
- 组合级参考：组合现金 ETS/Holt-Winters
  （Portfolio ETS/Holt-Winters，`M2-PORT-ETS01`）。
- 本轮失败开发候选：分层收入组合模型 v0.1（`M2-PORT-LRC01`）。
- 活动候选：无（`activeCandidate=null`）。
- 自动化批准：无（`approvedForAutomation=null`）。

本轮没有训练、调参、外层选模、final holdout、later-origin、provider、数据库、
Canary/full160、production、release、M3 formal 或 PR 合并。

## 当前权威入口

- 机器模型权威：`config/m2-model-registry.v1.json`
- 评价合同：`config/m2-evaluation-contract.v2.2.json`
- 分层收入组合预注册：`config/m2-current-layered-revenue-composition.v0.1.json`
- 机器评价结果：
  `docs/analysis/m2-current/M2-layered-revenue-composition-development-v0.1.json`
- 中文评价报告：
  `docs/analysis/m2-current/M2-layered-revenue-composition-development-v0.1.md`
- 四分量守恒：
  `docs/analysis/m2-current/M2-layered-revenue-four-component-conservation-v0.1.md`
- 未来新增作品：
  `docs/analysis/m2-current/M2-layered-revenue-future-new-work-v0.1.md`
- 现有作品新增渠道：
  `docs/analysis/m2-current/M2-layered-revenue-existing-work-new-channel-v0.1.md`
- 36 个月保留：
  `docs/analysis/m2-current/M2-layered-revenue-36-month-retention-v0.1.md`
