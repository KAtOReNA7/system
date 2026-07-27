# M2 模型身份与编号全仓审计 v1

## 结论

本审计在 `481441f3c93126e442294092b8e84779a0c50e0e` 的公开仓库证据上完成，
没有训练、拟合、选择或执行模型，也没有读取受控私有数据。唯一当前机器权威是
`config/m2-model-registry.v1.json`；历史文件、历史 ID、digest 与冻结成绩保持原样。

审计识别出 27 个持久模型或模型族、12 个实验/评价活动、47 个非模型编号条目和
13 个成绩可比组。数字短码不再自行代表模型：它必须先落入模型、实验臂、评价阶段、
执行检查点、状态索引、schema/config/report 版本、业务状态或命令之一。

## 审计范围与方法

逐类检查了以下公开证据：

1. `README.md` 与根 `AGENTS.md`；
2. `src/domain/m2Current/AGENTS.md`；
3. `package.json` 与 `config/command-lifecycle.v0.1.json`；
4. `config/m2-current*.json`；
5. `docs/analysis/m2-current/**`；
6. `docs/analysis/m2-v2/**`；
7. `docs/prd/m2-v2/**`；
8. `src/domain/m2Current/**` canonical core；
9. `scripts/m2-current/**`；
10. `git log --all` 中与 M2、校准、组合、渠道、TSB 和生命周期有关的提交；
11. 状态索引 `v0.21` 至 `v0.25`；
12. `docs/analysis/m2-real-data/**` 中的历史不可变 C1–C3 结果；
13. 历史 B0–B8 与 calibration v1.x 的 archive-only 命令和证据。

证据提取只读取已提交的公开聚合报告。`output/`、`tmp/`、
`data/private-output/**` 未被移动、删除、提交或作为成绩来源。

## 持久模型与模型族

| 能力 | 稳定 ID | 中文名称 | 身份结论 |
|---|---|---|---|
| 作品 | `M2-WORK-B4` | 旧现金生命周期公式 | 持久旧模型；当前只作比较 |
| 作品 | `M2-WORK-SEG01` | 作品分群向下校准模型 v0.1 | 已执行、未接受 |
| 作品 | `M2-WORK-HRC02` | 作品层级稳健校准模型 v0.2 | 已执行、未接受 |
| 作品 | `M2-WORK-OA03` | 作品发生-金额校准模型 v0.3 | 现行运行回退，不是成熟 production champion |
| 作品 | `M2-WORK-GHG01` | 全局门槛广义线性模型 | 多粒度重构评价 / R3（复合候选阶段，`M2-EXP-R0-R5-01/R3`）内实际执行，已失败 |
| 作品 | `M2-WORK-TWD01` | 全局 Tweedie 提升树桩模型 | 多粒度重构评价 / R3（复合候选阶段，`M2-EXP-R0-R5-01/R3`）内实际执行，已失败 |
| 作品 | `M2-WORK-HGB01` | 门槛梯度提升树桩模型 | 多粒度重构评价 / R3（复合候选阶段，`M2-EXP-R0-R5-01/R3`）内实际执行，已失败 |
| 作品 | `M2-WORK-GDE04` | 全局分布组合安全回退管线 v0.4 | selected pipeline；0 增量只代表回退 |
| 组合 | `M2-PORT-ETS01` | 组合现金 ETS/Holt-Winters 模型 | 组合级参考；gate 未通过 |
| 基线 | `M2-BASE-CLASSIC01` | 经典时间序列比较基线族 | 多成员模型族，不统一覆盖成员成绩 |
| 作品 | `M2-WORK-HSC01` | 历史状态校准模型 | post-hoc 同窗候选，已拒绝 |
| 作品 | `M2-WORK-MCR01` | 人工渠道规则模型 | 379-case 比较模型，已拒绝 |
| 作品 | `M2-WORK-CCR01` | 统一渠道曲线模型 | v0.9 候选，改善不足且 bias 更差 |
| 作品 | `M2-WORK-MAN01` | 人工锚定忠实公式 | 人工公式比较模型 |
| 作品 | `M2-WORK-LG01` | 人工锚定可学习全局模型 | 当前研究比较基线 |
| 作品 | `M2-WORK-HP01` | 人工锚定层级正金额专家模型 | raw 候选已拒绝 |
| 作品 | `M2-WORK-OR01` | 人工锚定发生与冲销模型 | raw 候选已拒绝 |
| 作品 | `M2-WORK-TSB01` | TSB 间歇发生模型 | raw 候选已失败 |
| 作品 | `M2-WORK-TSBB01` | TSB 与全局模型混合候选 | blend 已失败，selected 回退 |
| 作品 | `M2-WORK-LC01` | 生命周期五状态模型 | raw 已失败，后验收益不实质 |
| 渠道 | `M2-CHAN-SCL01` | 渠道倍率专家模型 | A0–A6 已执行失败，倍率架构退役 |
| 渠道 | `M2-CHAN-GEN02` | 渠道时间生成模型 v0.2 | 合同语义阻断，不是模型失败 |
| 历史 | `M2-WORK-C1TE01` | C1 透明组合模型 | archive-only，失败 |
| 历史 | `M2-WORK-C2R01` | 旧买断收入路由模型 | archive-only，目标已废弃 |
| 历史 | `M2-WORK-C2R101` | 正式现金路由分治模型 | archive-only，失败 |
| 历史 | `M2-WORK-C2IM01` | C2 活跃度与间歇模型组合 | archive-only，失败 |
| 历史 | `M2-WORK-C3IR01` | C3 内部特征残差校正模型 | archive-only，失败 |

`M2-current-multi-resolution-revenue-service-v0.5` 与
`M2-current-sales-share-revenue-service-v0.6` 是服务/目标合同包装，不另造一个
作品算法身份；它们的作品预测继续指向 exact v0.3，组合模型单独登记为
`M2-PORT-ETS01`。

## 非模型编号审计

| 编号 | 正确类型 | 用户可见解释 |
|---|---|---|
| B0–B8 | 历史证据治理阶段 | 必须写出“证据治理阶段”；B4 同时存在旧模型别名冲突 |
| C1–C3 | 历史实验臂/活动阶段 | 算法另用 stable model ID |
| R0–R5 | 多粒度重构评价活动阶段（`M2-EXP-R0-R5-01/R0-R5`） | 其中 R3 是复合候选阶段，不是一个模型 |
| K0–K2 | 执行检查点 | 必须写所属任务与检查点含义 |
| A0–A6 | 渠道倍率专家实验臂 | 必须写 `M2-EXP-CHANNEL-EXPERTS-01/Ax` |
| G0–G6 | 渠道生成实验臂/层 | 必须写 `M2-EXP-CHANNEL-GENERATIVE-02/Gx` |
| state index v0.xx | 状态索引版本 | 例如 v0.25 是状态页版本，不是模型 |
| config/report/schema v0.x | 合同或报告结构版本 | 不表示算法代际或成绩 |
| 英文大写状态码 | 机器状态 | 用户显示必须附中文解释 |

## 角色证据

- 现行运行回退模型（operational fallback）：
  作品发生-金额校准模型 v0.3（`M2-WORK-OA03`，legacy `exact v0.3`）。
- 研究比较基线（research baseline）：
  人工锚定可学习全局模型（`M2-WORK-LG01`，legacy
  `learnedGlobal + common reversal`）。
- 组合级参考（portfolio reference）：
  组合现金 ETS/Holt-Winters 模型（`M2-PORT-ETS01`）。
- 活动候选（active candidate）：无。
- 自动化批准模型（approved for automation）：无。
- 阻断实验：渠道时间生成 v0.2
  （`M2-EXP-CHANNEL-GENERATIVE-02`）。

状态索引 v0.25 把 exact v0.3 称为作品级 development champion，并把
learnedGlobal 称为该渠道生成谱系的 fallback；AGENTS.md 同时把 exact v0.3 定义为
全局现行回退。注册表按作用域解释：learnedGlobal 只在渠道生成实验内部承担 G0
回退，在全局角色中是研究比较基线，因此 `roleConflict=false`。

## 成绩人口和可比性

以下成绩已从当前 HEAD 的公开证据重新提取：

- 当前人工账单 served 7,083 cases：B4 WAPE `0.5492937504`；exact v0.3
  WAPE/bias `0.4907589424 / +0.0737810668`；统一渠道曲线
  `0.4907011029 / +0.0770527828`。三者是 same-case 可比，但 v0.9 的相对改善
  `0.0118%` 低于 1% 实质阈值且 bias 更差。
- 人工锚定 primary 12,039 cases：人工锚定可学习全局模型
  （Human-Anchored Learned Global，`M2-WORK-LG01`）当前复算 WAPE/bias
  `0.4402249502 / -0.1237710583`；TSB 全局混合候选
  （TSB Blend Candidate，`M2-WORK-TSBB01`）WAPE `0.45348237`；
  生命周期五状态模型 raw 候选（Lifecycle-Aware Five-State Model，
  `M2-WORK-LC01`）WAPE `0.50139298`；渠道倍率专家 / A6（nested 层级
  shrinkage 选择，`M2-EXP-CHANNEL-EXPERTS-01/A6`，模型
  `M2-CHAN-SCL01`）WAPE `0.53776683`。
- strict rolling 74,320 cases：人工锚定可学习全局模型
  （`M2-WORK-LG01`）WAPE `0.4119187843`；TSB 全局混合候选
  （`M2-WORK-TSBB01`）WAPE `0.4448705050`；生命周期五状态模型 raw 候选
  （`M2-WORK-LC01`）WAPE `0.62275977`；渠道倍率专家 / A6
  （`M2-EXP-CHANNEL-EXPERTS-01/A6`，模型 `M2-CHAN-SCL01`）WAPE
  `0.65865324`。
- 作品发生-金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，
  `M2-WORK-OA03`）与人工锚定可学习全局模型（`M2-WORK-LG01`）只能在
  5,203-case、36 个月相同案例交集中直接比较；
  该交集仍是同一开发窗口，不是独立 later-origin。
- 组合级 30 cells：ETS/Holt-Winters WAPE/bias
  `0.1279495571 / +0.1004825196`。它与作品级 WAPE 粒度不同，不可统一排名。
- 渠道时间生成 v0.2 / G0（冻结基线复算，
  `M2-EXP-CHANNEL-GENERATIVE-02/G0`）只是人工锚定可学习全局模型的语义等价复算；
  渠道时间生成 v0.2 / G1、G2、G3（核心候选臂，
  `M2-EXP-CHANNEL-GENERATIVE-02/G1-G3`）均未执行，所有 candidate outcome
  仍为 `null`。

learnedGlobal 原始 v1.0 报告的 primary WAPE `0.4402270694` 与后续共用冲销语义修订
后的 `0.4402249502` 均保留为不同 evaluationId，没有覆盖旧数值。差异已有 evidence
revision 解释，不是未解决冲突。

## 冲突和复核标记

- 已解决：B4 同时是 PR #7 治理阶段短码和旧模型别名。查询必须列出两个作用域。
- 已解决：C1/C2/C3 是历史实验臂短码，算法身份另有 stable ID。
- 已解决：exact v0.3 的 development champion 与 operational fallback 是不同表述
  层级；当前无 production promotion。
- 已解决：learnedGlobal 的原始与修订数值按 evaluationId 分开。
- 未解决证据冲突：无。
- 仍需人工 registry review 的持久模型：无；archive-only workflow
  `calibration-v1.x` 因不是一个独立当前算法，仅登记为历史命令族。

## 边界证明

- model fit count：0；
- private evaluation row read count：0；
- 渠道时间生成 v0.2 / G1、G2、G3（核心候选臂，
  `M2-EXP-CHANNEL-GENERATIVE-02/G1-G3`）execution count：0；
- historical prediction change count：0；
- production surface change count：0；
- exact v0.3 prediction change count：0；
- loader/route/API import change count：0；
- final holdout opened：false；
- provider/database used：false。
