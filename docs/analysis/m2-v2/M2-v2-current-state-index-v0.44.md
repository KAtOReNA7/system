# M2 当前状态索引 v0.44

截至 2026-07-30，核心老品分周期金额模型 v0.1（Core Legacy
Horizon-Specific Amount Model v0.1，`M2-WORK-CHAM01`）已经完成公共合同、
实现和验证；正式私有执行以及合同允许的唯一一次基础设施重试均在形成任何预测前
失效。因此本轮没有新模型成绩，3、6、12 个月均未评价。

## 当前结论

| 对象 | 当前状态 | 中文解释 |
|---|---|---|
| 公共实现 | `IMPLEMENTED_AND_PUBLICLY_VERIFIED` | 分周期模型、固定实验臂、origin-safe 特征、独立参数、同案例评价与 2,000 次 bootstrap 已实现并通过公共测试 |
| 私有源权威 | `SOURCE_AUTHORITY_AVAILABLE` | 不是缺少不可替代数据源导致的阻断 |
| 正式私有执行 | `INVALIDATED_BEFORE_PREDICTION` | 首次执行在合法样本物化阶段因变量接线错误失效，没有训练或预测 |
| 唯一基础设施重试 | `INVALIDATED_BEFORE_PREDICTION_RETRY_EXHAUSTED` | 重试在 OA03 共享物化器的 capability 目录策略处失效，没有训练或预测；不得第三次执行 |
| 3 个月 | `NOT_EVALUATED_NO_VALID_CANDIDATE_OUTPUT` | 没有合法 raw candidate，不能判定通过或失败 |
| 6 个月 | `NOT_EVALUATED_NO_VALID_CANDIDATE_OUTPUT` | 没有合法 raw candidate，不能判定通过或失败 |
| 12 个月 | `NOT_EVALUATED_NO_VALID_CANDIDATE_OUTPUT` | 没有合法 raw candidate，不能判定通过或失败 |
| 总体 | `M2_CORE_HORIZON_AMOUNT_PRIVATE_EXECUTION_INVALIDATED_RETRY_EXHAUSTED` | 这是执行闭环状态，不是 `PASS`、`PARTIAL`、模型 `FAIL` 或缺少源权威 |

作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，
`M2-WORK-OA03`）的角色纠偏继续有效：同公式已在当前 Core 老品合同下重新执行，
但没有复现历史数值；Primary 的主要研究参考不可重建，Strict 的 3/6/12 月均不支持
OA03。`PERFORMANCE_MIXED` 只表示机器证据状态并存，不是业务整体通过。

## 已实现、已验证、已授权、可发布

| 层次 | 状态 | 说明 |
|---|---|---|
| 已实现 | 是 | 核心老品分周期金额模型及固定 B0–B3 实验合同已实现 |
| 已验证 | 公共工程是；私有模型结果否 | 公共门禁、synthetic 证明和双平台 CI 已通过；没有完整私有候选结果可验证 |
| 已授权 | 一次正式执行与一次基础设施重试均已消费 | 当前没有剩余私有执行授权 |
| 可发布 | 否 | 没有活动候选、自动化批准、production 或 release 权限 |

## 未生成的评价

作品发生—金额校准模型 v0.3 与人工锚定可学习全局模型（Human-Anchored
Learned Global，`M2-WORK-LG01`）的同案例误差归因没有生成。冻结研究基线臂以及
等作品权重、起点收入秩权重、冻结 LG01 输入三个候选臂均没有形成可评价输出。

因此以下字段必须保持 `null`：WAPE、signed bias、MAE、median AE、配对 FVA、
2,000 次作品聚类 bootstrap 区间、独立时间块胜率、Core90 方向和最佳原始实验臂。
不得把 `null` 写成 0，也不得把“未评价”改写为模型失败。

## 当前模型角色

- 兼容性现行运行回退：作品发生—金额校准模型 v0.3
  （Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）。
- 当前 Core 老品 3/6/12 月研究比较基线：人工锚定可学习全局模型
  （Human-Anchored Learned Global，`M2-WORK-LG01`）。
- 开发执行阻断且无候选结果：核心老品分周期金额模型 v0.1
  （Core Legacy Horizon-Specific Amount Model v0.1，`M2-WORK-CHAM01`）。
- 当前阻断实验：核心老品分周期金额模型开发 v0.1
  （`M2-EXP-CORE-HORIZON-AMOUNT-01`）。
- 活动候选：无（`activeCandidate=null`）。
- 自动化批准：无（`approvedForAutomation=null`）。

现行运行回退没有改变。核心老品分周期金额模型没有进入 loader、route、API、
automation 或 production。

## 修复后状态

共享 OA03 Python 物化器现在要求显式 capability ID，并只允许 OA03 当前范围复现和
核心老品分周期金额两个固定隔离目录；没有开放任意 private 路径。执行器也会把
“基础设施恢复机会已消费”识别为不可再次重试。修复没有改变模型、特征、参数、
fold、权重或评价门。

修复后只运行公共 synthetic 验证与公共门禁，没有再次训练或读取私有评价结果。
未来若要执行，必须由用户在新的任务中明确授权，并重新绑定新的精确提交
Linux/Windows CI。

## 当前证据

- `docs/analysis/m2-current/M2-oa03-current-role-correction-v0.1.md`
- `docs/analysis/m2-current/M2-core-legacy-horizon-amount-preregistration-v0.1.md`
- `docs/analysis/m2-current/M2-core-legacy-horizon-amount-execution-closure-v0.1.json`
- `docs/analysis/m2-current/M2-core-legacy-horizon-amount-execution-closure-v0.1.md`
- `config/m2-model-registry.v1.json`

本索引取代 v0.43 作为当前阅读入口，但不改写 v0.43 或任何历史成绩、收据、schema、
digest 与执行记录。

## Public / Private 与授权边界

- Git 只包含代码、合同、测试和脱敏聚合状态；没有私有行、作品身份、金额、路径、
  digest、缓存或收据。
- private source、derived cache 与 run provenance 继续留在 Git ignored 能力目录。
- 当前未授权渠道分配、taxonomy、36 个月、新作品、新渠道、later-origin、
  final holdout、Canary/full160、production、release、M3 formal 或 PR 合并。
- 当前机器权威：`config/m2-model-registry.v1.json`。
- 中文阅读视图：`docs/analysis/m2-current/M2-model-catalog-and-scorecard-v1.md`。
