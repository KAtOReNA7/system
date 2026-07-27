# M2 当前状态索引 v0.27

截至 2026-07-28，本轮仅完成 M2 评价体系审计（M2 Evaluation System Audit，
`M2_EVALUATION_SYSTEM_AUDIT_COMPLETE_NO_METRIC_CHANGE`）。模型执行次数、训练次数、
候选选择次数、受控私有评价行读取次数和历史成绩修改次数均为 0。

## 本轮交付

- 中文审计报告：
  `docs/analysis/m2-current/M2-evaluation-system-audit-v1.md`。
- 机器可读审计：
  `docs/analysis/m2-current/M2-evaluation-system-audit-v1.json`。
- 未启用的评价合同草案：
  `docs/analysis/m2-current/M2-evaluation-contract-v2-proposal.md`。

评价合同 v2 仍是草案（Evaluation Contract v2 Proposal，
`DRAFT_NOT_ACTIVE`）。本轮没有修改现有 evaluator、gate、阈值、模型输出、模型角色
或历史成绩，也没有根据新指标重新计分。

## 评价审计结论

1. 当前 JavaScript 作品级主评价器的加权绝对百分比误差（WAPE）实现为
   `sum(abs(prediction-actual))/sum(abs(actual))`；有方向的总量偏差
   （signed bias）实现为
   `sum(prediction-actual)/sum(abs(actual))`。对当前定义而言实现正确，负数冲销
   进入绝对分母，零实际值仍贡献预测误差，全零实际值人口会 fail closed。
2. 历史 Python 归档的 `signedAggregateBias` 使用净实际总额
   `sum(actual)` 作为分母，不能与当前 JavaScript 的 signed bias 当作同一指标。
   历史 artifact 保持不可变；未来报告必须携带 metric definition/version。
3. 通用评价器的 `positiveAmount` 当前是“正实际值子集上的最终点预测误差”，
   不是独立条件金额输出的误差。只有显式保存 occurrence probability、
   conditional amount 和 reversal component 的模型才能评价完整两部件能力。
4. WAPE 与 signed bias 不能单独覆盖收入发生、作品均衡误差、排序/资源分配、
   风险区间、时间稳定性和业务非对称损失；也不能跨目标、人口、horizon、粒度或
   窗口排名。
5. 公开登记表包含 40 条评价记录、13 个可比组；39 条有 WAPE、33 条有
   signed bias，没有一条登记为独立验证证据。当前不能选出“总体最佳 M2 模型”。

## 当前角色保持不变

- 现行运行回退模型：作品发生-金额校准模型 v0.3
  （Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）。
- 研究比较基线：人工锚定可学习全局模型
  （Human-Anchored Learned Global，`M2-WORK-LG01`）。
- 组合级参考：组合现金 ETS/Holt-Winters 模型
  （Portfolio ETS/Holt-Winters，`M2-PORT-ETS01`）。
- 活动候选：无（`activeCandidate=null`）。
- 自动化批准模型：无（`approvedForAutomation=null`）。
- 渠道时间生成 v0.2（Channel Generative v0.2，
  `M2-EXP-CHANNEL-GENERATIVE-02`）仍为合同前置条件阻断
  （`GENERATIVE_V02_CORE_EXECUTION_BLOCKED`）；其核心候选臂
  `M2-EXP-CHANNEL-GENERATIVE-02/G1-G3` 未执行。

## 后续边界

若要验证评价合同 v2，应先单独授权“冻结预测受控重计分”，并确认 metric
definition、冻结行级最小数据合同和业务损失权重。该授权只允许对既有冻结预测重新
计分，不自动授权训练、调参、候选选择、模型晋升或 holdout。

现有公开聚合无法计算的指标登记为
`NOT_COMPUTABLE_FROM_PUBLIC_AGGREGATES`；不得从 WAPE 或 signed bias 反推行级
误差、排序、校准或区间指标。

production、loader、route、API、exact v0.3 预测、provider、数据库、final
holdout、Canary/full160、release 和 M3 formal 均未改变或打开。
