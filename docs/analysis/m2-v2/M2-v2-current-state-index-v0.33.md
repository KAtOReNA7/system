# M2 当前状态索引 v0.33

截至 2026-07-28，M2 评价合同 v2.2 的开发评价状态继续为：

`M2_EVALUATION_V2_2_ACTIVE_FOR_DEVELOPMENT_WITH_DISCLOSED_RESIDUAL_EXCLUSION`

出版行业真实规模适配的审计检查点 K7A（阈值谱系、真实人口和权威边界）已完成：

`M2_PUBLISHING_SCALE_K7A_AUDIT_COMPLETE_NO_MODEL_EXECUTION`

这表示支持合同可以进入训练侧设计，不表示模型已经实现、验证、授权或可发布。
本检查点没有训练或选择模型，没有读取新候选 outer outcome，也没有执行 private
模型。

## K7A 结论

- 历史机制层 `50` 部作品和平台/三级分类层 `100` 部作品门槛，是 outcome 前
  合规冻结的通用治理假设，不是从本出版社真实人口或学习曲线估计出的行业尺度。
- 当前 formal foundation 有 3,053 个标准作品；没有注册的 ISBN/SKU—作品—版本
  权威，所以不能把模型 distinct work 换算为年度新品 SKU。
- 完整分成账单有 190,663 行、2,718 个有现金历史的标准作品、39 个规范渠道和
  9,053 个已观察作品—渠道现金关系。现金关系不是授权关系。
- 当前三级分类有 2 个一级、9 个二级和 64 个三级节点，覆盖率 100%，但只有当前
  单值且没有 `effectiveAt/availableAt`；它只能用于当前描述性报告，不能回填
  strict forecast origin。
- 当前没有带起止时间、`effectiveAt`、`availableAt` 和版本的作品—平台授权
  关系权威，因此授权关系不能进入 strict origin 特征或路由。
- 历史交易型机制的 25–32 部作品来自可建模人口、outer 作品分组和 inner 作品分组
  的连续收缩；完整 `2021–2025` 分成窗口有 71 个交易型标准作品。

## 三级分类支持分布

primary 的 320 个“三级节点 × outer fold”训练组合，独立作品数中位数为 5；
93.44% 少于 50 部，97.81% 少于 100 部。strict 的 704 个“三级节点 × origin”
组合中位数为 9；85.37% 少于 50 部，92.90% 少于 100 部。

这证明固定 `50/100` 二元门不适合作为向前版本的唯一支持合同，但不授权无条件
独立拟合。下一阶段必须用作品聚类的有效样本量、集中度、时间正确的训练侧学习曲线、
系数与预测稳定性及 leave-one-work-out 共同确定分层支持。

## 当前模型角色

- 作品现行运行回退模型：作品发生-金额校准模型 v0.3
  （Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`）。
- 作品研究比较基线：人工锚定可学习全局模型
  （Human-Anchored Learned Global，`M2-WORK-LG01`）。
- 组合级参考：组合现金 ETS/Holt-Winters
  （Portfolio ETS/Holt-Winters，`M2-PORT-ETS01`）。
- 历史渠道时间生成模型 v0.2 的独立核心
  （Channel Generative v0.2 — Independent Monthly Occurrence ×
  Conditional Amount Core，`M2-CHAN-GEN02`，
  `M2-EXP-CHANNEL-GENERATIVE-02/G1`）仍为资格阻断，未生成候选。
- 活动候选：无（`activeCandidate=null`）。
- 自动化批准：无（`approvedForAutomation=null`）。

## 当前权威入口

- 机器模型权威：`config/m2-model-registry.v1.json`
- v2.2 机器合同：`config/m2-evaluation-contract.v2.2.json`
- 阈值与假设谱系：
  `docs/analysis/m2-current/M2-publishing-scale-threshold-and-assumption-lineage-v1.json`
- 真实规模与权威人口审计：
  `docs/analysis/m2-current/M2-publishing-scale-population-and-authority-audit-v1.json`
- K7A 中文报告：
  `docs/analysis/m2-current/M2-publishing-scale-population-and-authority-audit-v1.md`
- 历史独立核心结果：
  `docs/analysis/m2-current/M2-current-channel-generative-g1-development-v0.1.json`

各检查点的 exact HEAD、远端同步、Draft PR #29 和 Linux/Windows CI 状态必须在
运行时查询，不写死在长期状态索引中。

## 下一检查点与保持关闭

下一步是 K7B：在任何新候选 outer outcome 之前完成出版行业统计支持合同、PRD
amendment、training-side learning curve 和参数冻结。K7B 不授权模型执行。

K7C 实现和全仓影响闭合、K7D 的一次 private development execution 必须分别满足
前序普通提交、普通推送和 exact-head Linux/Windows CI。K7D 之前不得读取新候选
outer outcome。

production、automation、exact v0.3 改动、later-origin、final holdout、provider、
数据库、Canary/full160、release 和 M3 formal 均保持关闭。Draft PR #29 不合并。
