# M2 HPSR02 独立评价前预注册 v0.2

## 预注册身份

- 中文模型名：LG01 头部保护尾段修正模型 v0.2；
- 英文名：LG01 Head-Protected Tail-Band Correction Model v0.2；
- 稳定模型 ID：`M2-WORK-HPSR02`；
- 稳定实验 ID：
  `M2-EXP-LG01-HEAD-PROTECTED-TAIL-BAND-CORRECTION-02`；
- 预注册状态：
  `M2_HPSR02_POST_HOC_INSPIRED_PROSPECTIVELY_PREREGISTERED_AWAITING_INDEPENDENT_DATA`。

该结构的证据来源类别固定为：

`POST_HOC_INSPIRED_PROSPECTIVELY_PREREGISTERED`

中文含义：由回溯诊断启发，但在独立 outcome 打开前预注册。

HPSR01 的现金带事后归因只提供研究启发，不是 HPSR02 的模型成绩。HPSR02 当前
没有真实预测、真实评价、独立证据或活动候选身份。

## 严格预测范围

LG01 头部保护尾段修正模型 v0.2（`M2-WORK-HPSR02`）只允许：

- M2 未来分成收入现金；
- 三个月 horizon；
- 每个预测起点用当时可见 trailing-12 分成现金重算的动态 Core80；
- 起点时成熟老品；
- 起点时已有且成熟的 canonical 渠道范围。

明确不预测未来新增作品、未来首次渠道、公司未来总收入或 Core80 以外长尾；
不进入渠道分配、taxonomy、channel expert、Core90 选模、6/12/36 月或 production。

## 动态 Core80 与现金带

每个预测起点必须：

1. 只用该起点可见的 trailing-12 分成现金选择动态 Core80；
2. 在动态 Core80 内沿用 HPSR01 的 H50/M30/L20 划分规则；
3. cutoff tie 的整部作品进入较高现金带；
4. 不使用固定 50 部或 100 部作品门槛；
5. 不读取未来 actual 形成候选人口或现金带。

## 唯一冻结结构

在 M2 LG01 头部保护尾段修正独立评价实验
（`M2-EXP-LG01-HEAD-PROTECTED-TAIL-BAND-CORRECTION-02`）中：

| 实验臂 | 完整身份 | 冻结结构 | 评价角色 |
|---|---|---|---|
| R0 | 冻结 LG01 同案例基线（同实验 `R0`） | H50/M30/L20 全部使用冻结 LG01 | 同案例基线 |
| R1 | 冻结 HPSR01 v0.1 历史结构对照（同实验 `R1`） | H50 使用 LG01；M30/L20 使用 HPSR01 有界修正 | 历史结构对照，不是主候选 |
| R2 | HPSR02 v0.2 唯一主候选（同实验 `R2`，`M2-WORK-HPSR02`） | H50/M30 使用冻结 LG01；仅 L20 使用有界修正 | 唯一主候选 |

主候选实验臂 R2 的 L20 修正规则固定为：

- alpha 固定为 1；
- positive base floor、q05、q95 沿用 HPSR01 在旧 development rows 上
  已冻结并证明来源的边界；
- 不重新估计 residual bounds；
- 不搜索 alpha；
- 不按作品选择；
- 不使用 actual；
- 非有限 L20 输入回退冻结 LG01，并单独披露；
- 有限极端值先对标准化残差做冻结边界裁剪，最终结果必须有限。

H50 与 M30 必须逐行严格等于同案例冻结 LG01 基线。没有 global alpha，没有
跨现金带依赖，也没有 outcome 后 selected pipeline 或 fallback。

业务含义是保护动态 Core80 中约前 80% 的现金，让 H50+M30 保持成熟 LG01，只允许
动态 Core80 内最低约 20% 现金带接受有界修正。

## 独立后期起点评价检查点

未来只允许在同一个 first independent later-origin checkpoint 上比较三个冻结实验臂。
当前日期估计为：

- `maxActualValueOpenedOrigin=2026-02`；
- 首个独立后期起点预计为 `2026-03`；
- 三个月标签窗口要求完整账单至 `2026-06`；
- 当前完整权威账单只到 `2026-04`；
- 仍缺 `2026-05` 与 `2026-06`；
- prospective final holdout 起点预计为 `2026-06`，要求完整至 `2026-09`。

这些值只是依据当前公开 metadata 得到的估计。未来执行前必须动态重算，不得把它们
写死为运行结果。本任务不执行独立后期起点评价检查点，也不读取其 outcome。

未来只有账单成熟、outcome 未打开、三个实验臂及人口/参数/bounds/指标均已冻结、
prospective final holdout 未打开、private source authority 可用、公共门禁通过，
并且用户另行明确授权时，才允许执行一次独立评价。

## 三态评价合同

主要目标固定为 HPSR02 主候选实验臂 R2 相对冻结 LG01 基线实验臂 R0 的同案例
WAPE 与配对 FVA。

### SUPPORTED（独立检查点支持）

必须同时满足：

- 配对 FVA 不低于 1%；
- 整作品 cluster bootstrap 95% 下界严格大于 0；
- absolute bias 相对基线恶化不超过 1 个百分点；
- H50/M30 逐行相等、有限性、case key、origin visibility 和数据有效性全部通过。

### MIXED（证据混合）

包括但不限于：点 FVA 为正但低于 1%、bootstrap 跨 0、WAPE 改善但 absolute bias
恶化 1 至 2.5 个百分点、单一独立起点不足以证明跨时间稳定，或现金带方向冲突。

### UNSUPPORTED（独立检查点不支持）

满足任一：

- 配对 FVA 明确恶化至少 1%；
- absolute bias 恶化超过 2.5 个百分点且没有至少 1% 的 WAPE/FVA 改善；
- H50/M30 不再严格等于基线；
- 出现未隔离 nonfinite；
- 出现灾难性单作品误差主导；
- 数据、同案例或 origin 可见性失效。

灾难性误差集中阈值沿用 HPSR01 冻结定义：最大单作品绝对误差占比超过 35%，且
相对基线恶化超过 10 个百分点时作为结构性失败披露。

距离任一数值硬阈值 0.25 个百分点以内时必须标记
`THRESHOLD_SENSITIVE`。除非同时存在结构失败，否则归入 MIXED，不得直接永久停止
整个方向。

即使未来独立检查点为 SUPPORTED，也只代表该 checkpoint 获得支持，不建立
`approvedForAutomation`，不进入 production，继续保留 prospective final holdout，
并等待后续单独授权。

## 禁止增加的实验臂

不得增加 alpha 0.25/0.5/0.75、多套 L20 clip、逐作品 gate、taxonomy、
channel expert、Core90 选模、6/12/36 月、selected pipeline 或 outcome 后 fallback。

## 本轮审计边界

本轮没有重跑 HPSR01，没有读取新 actual，没有运行任何真实模型评价，没有训练、
拟合、调参或重新 bootstrap，没有搜索 alpha，没有重新估计 residual bounds，
没有打开 prospective final holdout，没有修改 production，也没有授权或执行独立
后期起点评价检查点。

当前角色保持：

- 活动候选：无（`activeCandidate=null`）；
- 自动化批准：无（`approvedForAutomation=null`）；
- production ready：否；
- final holdout opened：否。
