# M2 人工锚定 v1.0 FVA 语义修复 v0.1

日期：2026-07-26

状态：`IMPLEMENTED_WITHOUT_MODEL_RETUNING`

## 结论

历史 development 表中的两项 FVA=0 是安全回退后的 selected-pipeline 结果，
不能解释为四专家层和发生/冲销层的候选增量为 0。

冻结证据中的选择元数据显示：

| 层级 | selected-pipeline FVA | 选择口径 candidate FVA | 结论 |
|---|---:|---:|---|
| manualFaithful → learnedGlobal | 0.091183 | 0.091183 | 接受；相对改善 17.16% |
| learnedGlobal → hierarchicalPositive | 0.000000 | -0.015177 | 拒绝并回退；candidate WAPE 恶化 3.45% |
| selected hierarchy → occurrenceAndReversal | 0.000000 | -0.001034 | 拒绝并回退；candidate WAPE 恶化 0.23% |

旧 `rawHierarchyMetrics` 还包含各外层 fold 内部的安全选择，严格说并不是完全
未经回退的 raw ablation。本次代码修复因此不改写历史 development artifact，
而是为未来获授权的精确 replay 保存完整 raw、选前 candidate 和选后 pipeline
三种预测口径。

## 已修改

- `predictM2HumanAnchored` 同时保留：
  - `rawHierarchicalPointEstimate`；
  - `hierarchicalPointEstimate`；
  - `fullyRawOccurrenceReversalPointEstimate`；
  - `candidateOccurrenceReversalPointEstimate`；
  - 最终 `pointEstimate`。
- `scoreM2HumanAnchoredLayers` 分开输出：
  - `candidatePoint`；
  - `fullyRawPoint`；
  - `candidateFva`；
  - `selectedPipelineFva`；
  - 兼容字段 `fva` 继续表示 selected pipeline。
- development 门禁改为检查回退前的 `candidateFva`，不再检查回退后必然
  非负的 selected-pipeline FVA。
- strict rolling 输出新增连续月份时间块审计。相邻 calendar origin 只算一个
  时间证据块，并显式声明 case 数不能替代时间块数。
- 公共 development 报告模板同时显示 candidate FVA 与 selected-pipeline FVA。

## 明确未修改

- v1.0 人工阈值、参数空间、四专家结构、发生/冲销公式和专家权重学习方法；
- 2021—2025 development 选择结果和既有失败结论；
- exact v0.3 fallback；
- later-origin 资格结论；
- final holdout、provider、数据库、Canary、full160、release 或 M3 formal 边界。

本次没有运行 private development replay、没有读取新的 later-origin 指标，
也没有训练或调参。历史公开指标继续是冻结审计证据，不因报告语义修复而改写。

## 后续研究边界

发生 hazard、冲销发生/条件金额拆分、真实生命周期、专家逐个收缩和作品均衡
目标仍是未来研究方向。只有取得新的历史 as-of 信息并获得新模型开发授权后，
才能建立新候选；不得用本次失败结果直接在同一 development 窗口开发 v1.1。

## 当前 gate

- `currentDecision=CANARY_FAIL`
- `automationDecision=AUTOMATION_BLOCKED`
- `modelTrainingAuthorized=false`
- `candidateSelectionAuthorized=false`
- `finalHoldoutAuthorized=false`
- `releaseAuthorized=false`

代码合并只表示评估与报告语义得到修复，不等于模型发布。
