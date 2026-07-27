# M2 当前状态索引 v0.28

截至 2026-07-28，本轮完成 M2 评价合同第二版冻结预测受控重计分
（M2 Evaluation Contract v2 frozen rescore）：
`M2_EVALUATION_V2_FROZEN_RESCORE_COMPLETE_NO_MODEL_CHANGE`。

## 本轮交付

- 重计分预注册：
  `config/m2-evaluation-v2-rescore-preregistration.v1.json`
- 冻结工件准备度：
  `docs/analysis/m2-current/M2-evaluation-v2-frozen-artifact-readiness-v1.md`
- 公开重计分报告：
  `docs/analysis/m2-current/M2-evaluation-v2-frozen-rescore-v1.md`
- 机器可读重计分：
  `docs/analysis/m2-current/M2-evaluation-v2-frozen-rescore-v1.json`
- 合同验证：
  `docs/analysis/m2-current/M2-evaluation-contract-v2-validation-v1.md`

行级库存与重计分回执保持在 capability-scoped Git ignored private output。

## 当前结论

五个当前分成现金可比组完成重计分：

- `CG-WORK-SS-CURRENT-7083`
- `CG-WORK-SS-HA-PRIMARY-12039-H36`
- `CG-WORK-SS-HA-STRICT-74320`
- `CG-WORK-SS-OVERLAP-5203-H36`
- `CG-PORT-SS-30CELLS`

第一版 WAPE/bias 全部在 `1e-8` 绝对容差内复现。第二版指标确认误差重尾、头部现金
掩盖长尾、发生分类与点预测可分离、组合表现随 horizon 反转。它也确认 raw TSB、
生命周期和渠道倍率候选的核心点预测仍失败。

人工锚定层级正金额专家模型（Human-Anchored Hierarchical Positive-Amount
Experts，`M2-WORK-HP01`）因没有可识别 raw 行而未重计分；MASE、origin 时收入
规模带和多数模型的区间输出仍是 capability gap，没有补造。

## 评价合同状态

评价合同第二版建议为“已验证、需修订、未激活”
（`DRAFT_VALIDATED_REVISION_REQUIRED`）。激活前必须固化 occurrence actual、
conditional amount、原生分位网格、零分母、作品/组合 bootstrap、时间块、隐私和
variant ID 语义。

## 模型角色保持

- 现行运行 fallback：作品发生-金额校准模型 v0.3
  （Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）。
- 研究基线：人工锚定可学习全局模型
  （Human-Anchored Learned Global，`M2-WORK-LG01`）。
- 组合参考：组合现金 ETS/Holt-Winters
  （Portfolio ETS/Holt-Winters，`M2-PORT-ETS01`）。
- 活动候选：无（`activeCandidate=null`）。
- 自动化批准：无（`approvedForAutomation=null`）。

历史失败结论没有改变。模型执行、训练、拟合、调参、选择、预测生成、预测修改及
production 变更次数均为 0。

## 保持 sealed

production、exact v0.3 预测路径、provider、数据库、final holdout、
Canary/full160、release 与 M3 formal 均未修改、授权或打开。PR #28 保持
Draft/Open/Unmerged。
