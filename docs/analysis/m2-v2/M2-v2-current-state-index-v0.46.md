# M2 当前状态索引 v0.46

截至 2026-07-30，核心老品分周期金额模型 v0.1
（Core Legacy Horizon-Specific Amount Model v0.1，`M2-WORK-CHAM01`）
已完成首次真实 B0–B3 开发评价。首个完整结果已经冻结，3、6、12 月均未通过
各自的预注册门禁，总结状态为
`M2_CORE_HORIZON_AMOUNT_DEVELOPMENT_FAIL`。

## 当前结论

| 对象 | 当前状态 | 中文解释 |
|---|---|---|
| 冻结科学合同 | `UNCHANGED` | B0–B3、公式、特征、窗口、网格、fold、权重、人口、实际值、基线、指标和门禁均未变化 |
| 真实训练 | `EXECUTED` | 等作品权重 / B1、起点收入秩权重 / B2、冻结 LG01 输入 / B3 均已真实拟合 |
| 首个完整结果边界 | `COMPLETE_RESULT_FROZEN` | 完整 B0–B3 指标形成后已立即停止；禁止重跑、调参或增加实验臂 |
| 3 个月 | `M2_CORE_HORIZON_AMOUNT_HORIZON_FAIL` | 最佳原始实验臂为 B3；WAPE 点估计小幅改善，但 bootstrap 下界未超过 0，偏差护栏失败 |
| 6 个月 | `M2_CORE_HORIZON_AMOUNT_HORIZON_FAIL` | 最佳原始实验臂为 B3；Strict Core80 相对 LG01 退化，区间跨 0，时间块与偏差门禁未通过 |
| 12 个月 | `M2_CORE_HORIZON_AMOUNT_HORIZON_FAIL` | 最佳原始实验臂为 B3；Strict Core80 与 Core90 均相对 LG01 明显退化 |
| 活动实验 | `null` | 当前没有仍在执行的模型实验 |
| 活动候选 | `null` | 未晋升任何模型 |
| 自动化批准 | `null` | 未授权自动化 |
| 现行运行回退 | `M2-WORK-OA03` | 兼容性运行回退未改变 |

## Strict Core80 冻结主结果

| 周期 | 最佳原始实验臂 | 候选 WAPE | 候选 signed bias | LG01 WAPE | LG01 signed bias | 配对 FVA | 作品聚类 bootstrap 95% | 独立时间块改善率 | 结论 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| 3 月 | B3 | 0.251288 | -0.049848 | 0.258167 | -0.026902 | 2.66% | [-15.99%, 21.64%] | 54.55% | 失败 |
| 6 月 | B3 | 0.281704 | -0.068682 | 0.275076 | 0.009543 | -2.41% | [-28.43%, 22.56%] | 50.00% | 失败 |
| 12 月 | B3 | 0.391820 | -0.138431 | 0.315749 | 0.064270 | -24.09% | [-78.55%, 23.67%] | 33.33% | 失败 |

B3 是核心老品分周期金额模型开发实验
（`M2-EXP-CORE-HORIZON-AMOUNT-01`）内的“冻结 LG01 输入的分周期稳健金额模型”
实验臂，不是新的模型 ID，也不是获准上线的管线。最佳原始实验臂仍可能整体失败。

## Core90 敏感性

| 周期 | B3 WAPE / bias | LG01 WAPE / bias | 配对 FVA | 与 Core80 方向 |
|---|---:|---:|---:|---|
| 3 月 | 0.267361 / -0.060726 | 0.280318 / -0.042439 | 4.62% | 同为点估计改善，但不改变 3 月门禁失败 |
| 6 月 | 0.294478 / -0.075150 | 0.295041 / 0.000169 | 0.19% | 未出现相反的实质退化，但改善低于实质阈值 |
| 12 月 | 0.397761 / -0.139147 | 0.337889 / 0.064165 | -17.72% | 与 Core80 一致退化，且触发相反实质退化 |

Core90 不替代 Strict Core80 主决策，也不用于把失败结论改写为部分通过。

## OA03 与 LG01 起点可见同案例归因

作品发生—金额校准模型 v0.3
（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）在 Strict Core80 与
Core90 的 3、6、12 月均劣于人工锚定可学习全局模型
（Human-Anchored Learned Global，`M2-WORK-LG01`）。归因只使用 forecast
origin 可见信息，支持以下诊断：

- 统一金额 scale 是已确认的结构限制，金额误差占主导；
- 共用 3/6/12 拟合结构存在周期错配证据；
- Strict Core80 三个周期均表现为系统性低估；
- 少数高误差作品贡献超过一半绝对误差；
- 起点收入带、趋势、同比和峰值距离形成可重复的误差分层；
- Core80 与 Core90 对 OA03 相对 LG01 的退化方向一致。

Primary rolling 的 canonical LG01 仍是 36 个月跨作品合同，因此缺失的 3/6/12
比较继续为 `null`，没有写成 0 或伪造替代参考。

## 已实现、已验证、已授权、可发布

| 层次 | 状态 | 说明 |
|---|---|---|
| 已实现 | 是 | 正式链路、能力隔离、首个完整结果边界与公开脱敏聚合均已实现 |
| 已验证 | 是 | R0 正式链路合成烟测、执行前完整公共门禁与精确 HEAD Linux/Windows CI 均通过；真实执行形成完整结果 |
| 已授权 | 仅本次开发评价 | 授权在首个完整结果形成时已经耗尽；不再授权训练、调参或第二结果 |
| 可发布 | 否 | 结果是失败的 development evidence；没有活动候选、production、automation、release 或 M3 formal 权限 |

公开结果中的 `executionEvidence` 在运行时绑定真实执行提交与当次 Linux/Windows
CI，不依赖本机路径或预先抄录的 SHA。最终公开提交仍须通过 PR 的精确 HEAD
双平台 CI，但不得因此重跑模型。

## 基础设施恢复审计

- 历史关闭记录继续保留此前两次训练前基础设施失败；固定重试次数不再是本次权威。
- 本轮 R0 正式链路合成验证先后发现并修复 4 个完整结果前工程缺陷：空的更早训练
  选择、合成方差导致的非有限预测、公开 bootstrap 方法名的隐私词误报，以及审计
  布尔字段的全真检查误报。
- 本轮正式私有执行没有失败或重试，首个尝试直接形成完整结果。
- 外层命令观察器曾达到等待时限，但主计算进程未退出、收据仍为执行中且 CPU 持续
  增长，因此没有被误计为执行失败，也没有启动第二进程。
- 全程未根据部分指标修改科学合同，`partialOutcomeInspected=false`。

## 当前模型角色

- 兼容性现行运行回退：作品发生—金额校准模型 v0.3
  （Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）。
- Core 老品 3/6/12 月研究比较基线：人工锚定可学习全局模型
  （Human-Anchored Learned Global，`M2-WORK-LG01`）。
- 已执行失败且冻结的开发候选：核心老品分周期金额模型 v0.1
  （Core Legacy Horizon-Specific Amount Model v0.1，`M2-WORK-CHAM01`）。
- 已关闭实验：核心老品分周期金额模型开发 v0.1
  （`M2-EXP-CORE-HORIZON-AMOUNT-01`）。
- 当前实验、活动候选与自动化批准：均为空。

## 当前证据

- `config/m2-current-core-legacy-horizon-amount.v0.1.json`
- `config/m2-current-core-legacy-horizon-amount-recovery.v0.1.json`
- `docs/analysis/m2-current/M2-core-legacy-horizon-amount-development-v0.1.json`
- `docs/analysis/m2-current/M2-core-legacy-horizon-amount-development-v0.1.md`
- `docs/analysis/m2-current/M2-oa03-lg01-core-legacy-error-attribution-v0.1.json`
- `docs/analysis/m2-current/M2-oa03-lg01-core-legacy-error-attribution-v0.1.md`
- `docs/analysis/m2-current/M2-core-legacy-horizon-amount-recovery-readiness-v0.1.json`
- `docs/analysis/m2-current/M2-core-legacy-horizon-amount-execution-closure-v0.1.json`
- `config/m2-model-registry.v1.json`

本索引取代 v0.45 作为当前阅读入口，但不改写 v0.45、历史执行关闭记录、历史状态码、
schema、digest 或冻结成绩。

## Public / Private 与授权边界

- Git 只包含代码、合同、测试与脱敏聚合状态，不包含私有行、身份、逐行金额、路径、
  transport hash、缓存、收据或凭据。
- private source、derived cache 与 run provenance 继续留在 Git ignored 能力目录。
- 未执行渠道分配、taxonomy、36 个月、新作品、新渠道、later-origin、final
  holdout、Canary/full160、production、release、M3 formal 或 PR 合并。
