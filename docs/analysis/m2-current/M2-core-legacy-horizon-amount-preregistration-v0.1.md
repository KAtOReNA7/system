# M2 核心老品分周期金额模型预注册 v0.1

本预注册冻结核心老品分周期金额模型 v0.1
（Core Legacy Horizon-Specific Amount Model v0.1，`M2-WORK-CHAM01`）及实验
`M2-EXP-CORE-HORIZON-AMOUNT-01`。开始本文件时没有读取本实验 outer outcome，
没有训练新模型，也没有形成候选预测。

机器合同为
`config/m2-current-core-legacy-horizon-amount.v0.1.json`；本文件是中文阅读视图。

## 范围

- 目标：预测起点已成熟老作品、起点已有成熟渠道上的未来开发可建模分成收入现金。
- 周期：3、6、12 月，分别拟合、分别评价、分别决定。
- Core80 是 Strict rolling 主评价人口；Core90 是敏感性人口。
- 使用全部起点成熟作品作为训练支持，不做 hard Core-only exclusion。
- 只预测作品总额，不做渠道份额分配。
- 不预测 36 个月、新作品、未来首次渠道、Core90 以外长尾、买断或公司整体收入。

## K1 固定归因

先在完全相同 actual、origin、horizon、人口与 case key 下比较
`M2-WORK-OA03` 与冻结 `M2-WORK-LG01`。Strict rolling 是主要证据；Primary
rolling 只作补充，而且 LG01 的 canonical Primary 是 36 个月跨作品合同，不能伪造
3/6/12 月主要参考。

分组只能使用预测起点已知的收入窗、趋势、同比、峰值距离、历史长度、成熟渠道数、
波动、零收入占比、作品年龄与动态 Core 排名。未来真实排名、未来渠道、评价期收入、
结果后阈值、三级分类和公司缺口禁止进入分组、训练、选择或路由。

## 固定实验臂

- B0：冻结人工锚定可学习全局研究基线（Human-Anchored Learned Global，
  `M2-WORK-LG01`），完全同 case，不按候选结果改变。
- B1：3/6/12 月独立稳健 signed-log1p 金额回归，作品等权。
- B2：与 B1 相同，但训练 fold 内按起点最近 12 月收入百分位使用
  `1 + 3 × percentile²` 权重，范围固定为 [1, 4]。
- B3：与 B2 相同，并把同周期冻结 LG01 预测作为一个输入；不得退化为单一全局倍率。

Strict 主决策中，B1、B2、B3 与 B0 必须先取四者共有且 actual 完全一致的
same-case intersection；三个 raw arm 只能在这一份共同案例上比较和排序，不能
各自在不同交集上产生“最佳”。

现金特征和目标使用可逆 signed-log1p，以保留负值。缺失历史窗保持 `null` 并增加
明确 missing indicator，不能用 0 冒充。标准化、百分位和权重只在当前训练 fold
内计算。

## 固定特征和参数网格

特征只包括最近 1/3/6/12 月现金、6 月趋势及相对趋势、6/此前 6 与 12/此前 12
比值、当前/历史峰值、距峰值月份、有效历史月数、成熟渠道数、最近 12 月零收入占比
和变异系数、作品年龄、动态 Core80/Core90 标记，以及 B3 的同周期冻结 LG01 预测。

每个周期只在 inner rolling 中选择：

- Huber delta：1.0、1.5；
- L2：0.1、1、10。

inner 与 outer 训练都只能使用更早起点且在相应起点已经成熟的标签。outer outcome
不得用于调参、增删特征、改变权重或改变 transform。

## 评价与通过门

主要 cell 是 Strict rolling × Core80 × 作品总额，并分别对 3、6、12 月决策。
每个 raw candidate 必须同时满足：

1. 相对 LG01 同案例 WAPE FVA 至少 1%；
2. 2,000 次作品 cluster bootstrap 的 FVA 95% 下界大于 0；
3. 超过 50% 的贪心非重叠 forecast-window 时间块改善；
4. 绝对 bias 相对 LG01 恶化不超过 0.02；
5. 候选绝对 bias 不超过 0.15；
6. Core90 不出现方向相反的实质退化；
7. 结论来自 raw candidate，不得由 fallback 或 selected pipeline 形成。

三个周期全通过、部分通过、全部不通过分别使用
`M2_CORE_HORIZON_AMOUNT_DEVELOPMENT_PASS`、
`M2_CORE_HORIZON_AMOUNT_DEVELOPMENT_PARTIAL` 和
`M2_CORE_HORIZON_AMOUNT_DEVELOPMENT_FAIL`。只有不可替代 source authority
缺失才可使用 `M2_CORE_HORIZON_AMOUNT_BLOCKED_SOURCE_AUTHORITY`。

## 执行与授权边界

公共实现和测试必须先在 exact-head Linux/Windows CI 通过，之后只允许一次受控
private development execution。首个完整、可解释 raw 结果立即冻结；只有在任何
预测形成前的纯基础设施失败才允许一次不改变规格的恢复。

即使通过，本模型也只可能是 development candidate。本任务不改变
`M2-WORK-OA03` 的兼容性现行运行回退，不写 `activeCandidate` 或
`approvedForAutomation`，不授权 production、later/final holdout、渠道分配、
Canary/full160、release、M3 formal、PR merge 或数据库连接。
