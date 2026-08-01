# M2 当前状态索引 v0.57

截至 2026-08-01，本索引记录出版行业渠道起点可见现金锚金额模型 v0.1
（Publishing-Scale Channel Origin-Visible Cash-Anchor Amount Model v0.1，
`M2-CHAN-PSC02`）唯一受控开发重放后的状态。模型名称、变体、角色、实验映射和成绩人口
以 `config/m2-model-registry.v1.json` 为唯一机器权威；业务门限以
`config/m2-business-acceptance-contract.v1.json` 为唯一数值权威。

## 当前结论

| 对象 | 当前状态 | 含义 |
|---|---|---|
| 兼容性现行运行回退 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 仅为兼容性回退，没有新增当前范围性能支持 |
| 研究比较基线 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 只用于研究比较，不是 production 晋升 |
| 冻结失败渠道模型 | 出版行业适配的渠道月度发生—条件金额核心（Publishing-Scale Channel Monthly Occurrence × Conditional Amount Core，`M2-CHAN-PSC01`） | 首个原始候选已冻结失败；根因是估计器尺度收缩，未确认实现或比较器缺陷 |
| 本次模型 | 出版行业渠道起点可见现金锚金额模型 v0.1（`M2-CHAN-PSC02`；原始候选变体 `M2-CHAN-PSC02-RAW`） | 核心和公共 synthetic 合同已实现；唯一受控开发重放在拟合与预测前因私有源权威缺口失败关闭，开发不支持（`PSC02_DEVELOPMENT_NOT_SUPPORTED`） |
| 阻断类别 | 私有源权威阻断而非模型失败（`PRIVATE_SOURCE_AUTHORITY_BLOCKER_NOT_MODEL_FAILURE`） | 没有模型性能结果，不得写成候选 WAPE/FVA 失败 |
| 活动候选 | `activeCandidate=null` | 没有活动候选 |
| 自动化批准 | `approvedForAutomation=null` | 没有自动化批准 |
| production ready | `productionReady=false` | 没有生产权限 |
| final holdout | `finalHoldoutOpened=false` | 未打开 |

## 模型、实验与三个实验臂

预注册设计（`M2-PREREG-PSC02-ORIGIN-VISIBLE-CASH-ANCHOR-01`）保持不可变历史记录；
后续授权创建模型 `M2-CHAN-PSC02`，没有回写预注册时的 `modelId=null` 或历史授权边界。
父实验为出版行业渠道起点可见现金锚金额实验
（Publishing-Scale Channel Origin-Visible Cash-Anchor Amount Experiment，
`M2-EXP-PUBLISHING-SCALE-CHANNEL-CASH-ANCHOR-02`）。

- 现金锚单独诊断（Anchor Only Diagnostic，
  `M2-EXP-PUBLISHING-SCALE-CHANNEL-CASH-ANCHOR-02/D0`）是尺度归因诊断，不是候选；
- 锚定对数比率岭回归诊断（Anchored Log-Ratio Ridge Diagnostic，
  `M2-EXP-PUBLISHING-SCALE-CHANNEL-CASH-ANCHOR-02/D1`）是 loss/link 归因诊断，不是候选；
- 锚定准 Gamma offset 主设计（Anchored Quasi-Gamma Offset Primary Design，
  `M2-EXP-PUBLISHING-SCALE-CHANNEL-CASH-ANCHOR-02/P`）对应唯一原始候选变体
  `M2-CHAN-PSC02-RAW`。

三者本次均为私有源权威阻断、未执行
（`NOT_EXECUTED_PRIVATE_SOURCE_AUTHORITY_BLOCKED`）。不存在由诊断臂、fallback 或
selected pipeline 替换原始候选的结果。

## 已验证的实现边界

月度公式保持为：

\[
\widehat y^+_{w,c,o,m}
=p^{PSC01}_{w,c,o,m}\,A_{w,c,o}\exp\{g(x_{w,c,o,m})\}.
\]

公共 synthetic/contract 已验证冻结 PSC01 occurrence、现金锚和 residual 各只应用一次，
horizon 只对月预测求和一次；准 Gamma objective、gradient 与 Hessian 使用同一未截断目标，
`[-30,30]` 仅用于最终 residual prediction。taxonomy 继续 `REPORT_ONLY`，LG01 prediction
不进入特征、锚、offset 或拟合。这些是实现证据，不是 private 模型效果证据。

## 唯一受控开发重放

执行前实现 exact-head 的 Linux 与 Windows CI 均成功，随后只执行了一次历史开发重放
（`DEVELOPMENT_REPLAY`）。权威检查得到：

- 现金源文件存在，但缺少不可事后推造的 `componentId`、`revisionId`、`effectiveAt`
  和 `availableAt`；
- 总账与人工复核拆分账本的行多重集不一致：总账侧无缺失、拆分侧多 3 行
  （`missing=0, extra=3`）；
- 冻结 PSC01 receipt、manifest、3,318,819 行人口元数据和 digest 可识别；冻结 LG01
  比较器存在，但成绩未读取。

流程因此在候选拟合、真实预测和 outcome 打开以前失败关闭。一次私有 attempt receipt
保留在 Git ignored capability 目录；公开仓库不发布其文件身份、行级数据或 private digest。

## 没有形成的结果

- 候选拟合未开始，真实预测 0 行；
- occurrence binary64 parity 与 exact-case coverage 未执行，因为没有 PSC02 prediction；
- outer outcome、候选 WAPE/FVA、signed bias、cash ratio 和 conditional positive amount
  error 均未打开或计算；
- primary、strict、各 horizon、五个平台、变现机制、anchor/fallback 层、top cash works、
  统一作品总额后的渠道构成和 paired bootstrap 均无结果；
- 没有完整的 `M2-CHAN-PSC02-RAW` 原始候选结果，也没有模型 evaluation row。

因此不能依据本次私有 outcome 支持 PSC02 设计方向，也不支持提出独立评价请求。当前状态
只说明现有私有历史权威不足以合法执行冻结设计，不说明模型性能好坏。

## 已实现、已验证、已授权与可发布

| 层次 | 当前状态 |
|---|---|
| 已实现 | 模型身份、三个实验臂、嵌套拟合、逐月预测、失败关闭控制器和元数据预检 |
| 已验证 | 公共 synthetic/contract 通过；私有检查只验证源权威缺口和预测前停止 |
| 已授权 | 唯一一次 historical `DEVELOPMENT_REPLAY` 已消耗；没有重试、独立评价或其他 private execution 授权 |
| 可发布 | 否；没有活动候选、automation、production、release、final holdout 或财务使用授权 |

## 保持关闭的能力

- 不重试开发重放；补齐真实 component/revision/time 权威需要独立范围、明确授权和新的
  exact-head 双平台 CI；
- 不执行独立评价、later-origin、prospective final holdout 或第二次开发结果；
- 不按阻断或未来 outcome 修改 anchor、feature、basis、loss、link、offset、clip、lambda、
  人口或门限；
- 不让诊断臂或 fallback 覆盖原始候选；
- 不修改 production loader、route、API，不连接数据库或 provider；
- 不启动 HPSR03 或第二次 HPSR02 评价；
- 不改写冻结 PSC01/HPSR02 预测、评价、指标、bootstrap、digest、receipt 或历史状态。

本索引取代 v0.56 作为当前阅读入口，但不改写 v0.56。公开冻结结果见
`docs/analysis/m2-current/M2-publishing-scale-channel-origin-visible-cash-anchor-development-evaluation-v0.1.json`
及其中文报告；它们不包含行级私有数据或 private digest。
