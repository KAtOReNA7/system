# M2 当前状态索引 v0.31

截至 2026-07-28，M2 评价合同 v2.2 已在保留完整财务对账的前提下，把无法归属的
冲销残差从开发可建模目标中透明隔离。当前开发评价状态为：

`M2_EVALUATION_V2_2_ACTIVE_FOR_DEVELOPMENT_WITH_DISCLOSED_RESIDUAL_EXCLUSION`

该状态只授权开发评价，不是完整财务 final restatement，不是 production 或
automation gate，也不授予模型晋升。

## Git 与阶段状态

- 当前活动分支与 Draft PR #29 的 exact HEAD、远端同步、ahead/behind 和
  Linux/Windows CI 必须在运行时查询，不写入长期状态文件。
- K4（v2.2 残差隔离、四视图和冻结标签重评分）只有在当前 exact-head 双平台 CI
  成功后才完成。
- 后续任何模型执行必须同时满足当前用户的独立授权与对应模型的 arm-specific
  prerequisite；v2.2 激活本身不授予通用训练权限。

## 当前权威入口

- 机器模型权威：`config/m2-model-registry.v1.json`
- v2.2 机器合同：`config/m2-evaluation-contract.v2.2.json`
- 冲销追溯配置：`config/m2-reversal-restatement.v1.json`
- 开发激活说明：
  `docs/analysis/m2-current/M2-evaluation-contract-v2.2-development-activation-v1.md`
- 开发激活验证：
  `docs/analysis/m2-current/M2-evaluation-contract-v2.2-development-activation-validation-v1.md`
- 四视图精确对账：
  `docs/analysis/m2-current/M2-reversal-four-view-reconciliation-v1.json`
- 冻结标签重评分：
  `docs/analysis/m2-current/M2-evaluation-v2.2-development-modelable-rescore-v1.json`

v2.1、v2.2 上一版阻断报告及全部历史冻结结果继续保留，不重命名、不回写。

## 四视图与精确现金

| 视图 | 状态 |
| --- | --- |
| 原入账财务视图（`POSTING_TIME_ACCOUNTING_VIEW`） | 143 条冲销原样保留，删除 0 |
| 截止时点重述视图（`AS_OF_RESTATED_VIEW`） | 只使用 origin 当时可见的冲销 |
| 最终财务对账视图（`FINAL_ACCOUNTING_RECONCILIATION_VIEW`） | 完整保留未分配残差，未声称解决 |
| 开发可建模重述视图（`DEVELOPMENT_MODELABLE_RESTATEMENT_VIEW`） | 只隔离 residual component |

| 项目 | 权威货币单位 |
| --- | ---: |
| 正收入 | 83,821,498.165600000018517939 |
| 冲销入账 | -1,228,913.283699999995685150 |
| 已追溯抵消 | 1,228,645.514699999995355150 |
| 开发可建模重述现金 | 82,592,852.650900000023162789 |
| 隔离的未分配冲销残差 | -267.769000000000330000 |
| 精确整数守恒差 | 0 |

未分配残差继续在财务 reconciliation 中可见，状态为
`UNALLOCATED_REVERSAL_RESIDUAL_EXCLUDED_FROM_MODELABLE_TARGET`。它没有被舍入、
抹零或跨 scope 吸收。

## 冻结标签重评分

- 6 个冻结 artifact 共 716,801 行，摘要全部匹配，预测修改和新预测生成为 0。
- 98,675 个唯一 case 中，430 个受冲销影响；残差整案阻断为 0，292 个非组合 case
  恢复开发标签。
- 30 个组合 cell 仍因独立的人口成员不匹配而不可重评分，不归因于残差。
- 两次执行的 7 个 private 输出逐字节一致；public 只含聚合。
- 原入账与开发可建模 actual 使用不同可比组。跨 actual definition 的分数变化只表示
  标签影响，不表示模型改善或退化。

## 当前模型角色

- 作品现行运行回退模型：`M2-WORK-OA03`。
- 作品研究比较基线：`M2-WORK-LG01`。
- 组合级参考：`M2-PORT-ETS01`。
- 活动候选：无（`activeCandidate=null`）。
- 自动化批准：无（`approvedForAutomation=null`）。

K4 不执行模型。模型执行、训练、拟合、调参、选择、预测生成、预测修改和
production 变更计数均为 0。

## 保持关闭

production、automation、later-origin、final holdout、provider、数据库、
Canary/full160、release 和 M3 formal 均保持关闭。任何后续实验臂必须等待当前任务
明确授权及前序检查点门禁成功。
