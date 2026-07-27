# M2 评价合同第二版冻结预测重计分准备度（M2 Evaluation Contract v2 frozen-rescore readiness）

## 结论

冻结预测重计分准备检查点（`M2-EVAL-V2-K0`）结论为 **就绪**（`READY`）。
任务开始前已经存在的六份 Git ignored 冻结工件通过摘要、行数、schema、案例键、
实际值一致性和第一版登记成绩复现核验。至少五个当前目标可比组
（comparability group）具备同案例的多模型冻结预测，因此允许只对已通过部分进入
受控重计分。

这不是模型成功、模型选择、角色变更或评价合同激活。

## 冻结来源证据

| 工件稳定标识 | SHA-256 | 行数 | schema/字段覆盖 | 来源状态 |
|---|---:|---:|---|---|
| `ART-CURRENT-CANONICAL-51384` | `f4377698…83240d` | 51,384 | actual、raw/selected point、origin、horizon、population | `SOURCE_VERIFIED` |
| `ART-HUMAN-ANCHORED-91562` | `620ac096…b6501` | 91,562 | actual、多个 point、quantiles、segment、origin、horizon | `SOURCE_VERIFIED` |
| `ART-TSB-86359` | `c6dc529d…a9f7` | 86,359 | actual、raw TSB、blend、selected、occurrence probability | `SOURCE_VERIFIED` |
| `ART-LIFECYCLE-91562` | `d0327389…5038` | 91,562 | actual、raw/selected point、occurrence、conditional amount、reversal、lifecycle | `SOURCE_VERIFIED` |
| `ART-CHANNEL-SCALAR-395904` | `aee28806…22fd` | 395,904 | work/channel row type、冻结消融 point、actual、origin、horizon | `SOURCE_VERIFIED` |
| `ART-PORTFOLIO-30` | `d38a3305…4504` | 30 | origin、horizon、actual、候选与基线 point | `SOURCE_VERIFIED` |

文件修改时间均早于本任务库存起点
`2026-07-28T00:52:24.9555500+08:00`；冻结摘要同时由任务前既有 manifest
支持。本任务未生成、改写或补全任何预测行。

## 可比组准备度

| 可比组稳定 ID | 冻结案例 | 准备度 | 说明 |
|---|---:|---|---|
| `CG-WORK-SS-CURRENT-7083` | 7,083 | `READY` | 作品发生-金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）与统一渠道曲线模型（Canonical Channel Curve，`M2-WORK-CCR01`）同案例 |
| `CG-WORK-SS-HA-PRIMARY-12039-H36` | 12,039 | `READY` | 人工锚定主评估的多个 raw candidate、selected pipeline 与研究基线可分离 |
| `CG-WORK-SS-HA-STRICT-74320` | 74,320 | `READY` | strict rolling 同案例与 actual 完全一致 |
| `CG-WORK-SS-OVERLAP-5203-H36` | 5,203 | `READY` | exact v0.3 与人工锚定模型的相同案例交集 |
| `CG-PORT-SS-30CELLS` | 30 | `READY` | 当前分成现金组合候选与冻结季节朴素比较臂同 cell |

跨工件使用 `(standardWorkId, origin, horizonMonths)` 作为作品案例键。主评估、
严格滚动与交集人口的键集合分别完全相等，重复键和 actual 不一致均为 0。

## 第一版成绩复现

在预注册绝对容差 `1e-8` 内复现了 Model Registry 当前登记的 WAPE/bias，包括：

- 当前人工权威 7,083 案例中的作品发生-金额校准模型 v0.3
  （`M2-WORK-OA03`）：WAPE `0.4907589423671863`，bias
  `0.0737810668178361`；
- 人工锚定可学习全局模型（Human-Anchored Learned Global，
  `M2-WORK-LG01`）主评估：WAPE `0.4402249501995911`，bias
  `-0.1237710583135561`；
- TSB 间歇发生模型（TSB Occurrence Model，`M2-WORK-TSB01`）主评估：
  WAPE `0.5434623063391253`，bias `0.2206812229383297`；
- 生命周期五状态模型（Lifecycle-Aware Five-State Model，
  `M2-WORK-LC01`）主评估 raw candidate：WAPE
  `0.5013929755304328`；
- 渠道倍率专家模型（Channel Scalar Experts v0.1，
  `M2-CHAN-SCL01`）主评估 raw full stack：WAPE
  `0.5377668290047714`；
- 组合现金 ETS/Holt-Winters 模型（Portfolio ETS/Holt-Winters，
  `M2-PORT-ETS01`）：WAPE `0.1279495570962878`，bias
  `0.1004825195634307`。

## 预注册能力边界

- 行内没有稳定 ID；本轮通过冻结摘要、evaluation family、字段绑定及登记成绩精确
  复现建立 stable model/evaluation/comparability-group 绑定，不能声称这些 ID
  是原始行原生字段。
- 人工锚定层级正金额专家模型（Human-Anchored Hierarchical Positive-Amount
  Experts，`M2-WORK-HP01`）的可识别行是 selected fallback，不是登记的 raw
  candidate，因此该 raw 模型标记为 `UNAVAILABLE_RAW_ROWS`，不得补造。
- 未保存严格 origin 前尺度，MASE 登记为
  `CAPABILITY_GAP_NO_STRICT_ORIGIN_PRIOR_MASE_SCALE`。
- 未保存 origin 时已知收入规模带，该分层登记为
  `CAPABILITY_GAP_NO_ORIGIN_VISIBLE_REVENUE_SCALE_BAND`；不得用未来 actual
  代替。
- 只有确实保存 probability 的工件才计算发生指标；只有同时保存条件金额和独立
  reversal 的生命周期工件才计算条件金额指标。
- 未来 actual 定义的 top-revenue 仅作后验误差归因，不参与选择。

## 检查点约束

预注册冻结于
`config/m2-evaluation-v2-rescore-preregistration.v1.json`。在本检查点提交、普通
push 及 exact-head Linux/Windows CI 通过前，不读取第二版 outcome。

机器结论：`M2_EVALUATION_V2_FROZEN_RESCORE_K0_READY`
