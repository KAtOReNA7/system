# M2 当前状态索引 v0.30

截至 2026-07-28，M2 评价合同 v2.2 已完成公共统计修正、冲销权威审计、冲销追溯重述和冻结预测标签重评分。当前结论为：

`M2_EVALUATION_V2_2_BLOCKED_UNRESOLVED_REVERSAL`

最终重述视图存在非零未分配冲销残差，因此 v2.2 不激活。v2.1 仍是最近一个已完成激活条件的开发评价合同；两者都不是 production 或 automation gate。

## Git 与阶段状态

- 当前活动分支：`codex/m2-evaluation-contract-v2-1`。
- 当前 Draft PR：#29，base 为 `main`，保持未合并。
- Git 起点、当前 HEAD、PR head、远端同步和 ahead/behind 必须在执行时查询，不写入长期状态文档。
- K3A 公共语义与统计修正：普通提交、普通推送、Linux/Windows CI run `30333013207` 成功。
- K3B 私有冲销重述与冻结标签重评分：普通提交、普通推送、Linux/Windows CI run `30337283094` 成功。
- K3C 治理收口的最终 exact-head CI 以 GitHub 实时状态为准。

## 当前权威入口

- 机器模型权威：`config/m2-model-registry.v1.json`
- v2.2 机器合同：`config/m2-evaluation-contract.v2.2.json`
- 冲销追溯配置：`config/m2-reversal-restatement.v1.json`
- v2.2 中文合同：`docs/analysis/m2-current/M2-evaluation-contract-v2.2.md`
- v2.2 验证：`docs/analysis/m2-current/M2-evaluation-contract-v2.2-validation.md`
- 权威审计：`docs/analysis/m2-current/M2-reversal-restatement-authority-audit-v1.md`
- 聚合影响：`docs/analysis/m2-current/M2-reversal-restatement-impact-v1.md`
- 诊断复核：`docs/analysis/m2-current/M2-evaluation-v2.2-diagnostic-recheck.md`
- 对应机器可读聚合 JSON 与上述 Markdown 同目录、同 basename。

v2.1 合同、验证、诊断复核和全部历史冻结结果继续保留，不回写、不重命名，也不重新解释为 v2.2 结果。

## 冲销权威与重述

- 现金类型唯一权威：人工复核账单成员关系（`user_reviewed_workbook_membership`）。
- 分成账单行数：190,663；负数冲销行数：143。
- 冲销 scope：`cashCategory + standardWorkId + channelMemberId + currencyScope`。
- 时间字段：`billMonth` 为入账月，`recordedAt` 为可得时间，均以月为粒度。
- 渠道 scope 使用经确认的 canonical 渠道映射；不使用公司级汇总回退。
- 金额按 10^18 精确整数累计，不使用浮点现金守恒或舍入。

冲销从发生月开始按月向过去追溯，只抵消同 scope 尚未被消费的正收入。不能跨作品、canonical 渠道、币种范围或现金类型。

## 聚合现金影响

| 项目 | 权威货币单位 |
| --- | ---: |
| 正收入 | 83,821,498.165600000018517939 |
| 冲销入账 | -1,228,913.283699999995685150 |
| 已追溯抵消 | 1,228,645.514699999995355150 |
| 重述收入 | 82,592,852.650900000023162789 |
| 未分配冲销残差 | -267.769000000000330000 |
| 守恒差 | 0.000000000000000000 |

影响 101 个 scope、85 个作品、11 个 canonical 渠道和 590 个 scope-month；其中 499 个 scope-month 被完全抵消，91 个保留部分正收入。最大向后追溯深度为 62 个月。

## 三个时间视图

- 原入账视图：通过；历史冻结 actual 保留，不被当前权威差异覆盖。
- 截止时点重述视图：通过；只使用该时点可见的冲销。
- 最终重述视图：阻断；原因是未分配冲销残差不为 0。
- 未发现未来泄漏；forecast origin 截止后冲销进入特征的行数为 0。

## 统计与冻结标签重评分

- v2.1 的 200 次排序 bootstrap 已在 v2.2 修正为 2,000 次完整作品 cluster 重采样；每次在 origin×horizon cell 内重算 rank、Spearman、Kendall tau-b 和 top 1%/5%/10% capture。
- 人工锚定主评价人口只有 1 个独立时间块，排序结论保持 `WORK_CLUSTER_RANKING_SIGNAL_TIME_INDEPENDENCE_UNCONFIRMED`；严格人口有 11 个独立时间块。
- 梯形 PR-AUC 与 Average Precision 分开报告，ROC-AUC 仅为辅助。
- 条件正金额和冲销只在存在对应冻结输出时实际评分；生命周期原始输出 `M2-WORK-LC01` 的发生、条件金额与冲销均已评分，其他缺失输出保留精确 `NOT_COMPUTABLE_*` 状态。
- top revenue 已拆为正收入、绝对现金规模、冲销规模三种后验归因，均不得进入拟合、选择或 gate。
- 716,801 行冻结预测未修改；两次完整执行的 7 个输出文件逐字节一致。
- 受未解决残差影响的 case 被阻断；组合 30 个 cell 没有完整权威 case，不发布部分组合成绩。

原入账与冲销重述是不同 actual definition。只允许报告同一冻结预测在两种标签下的配对影响，不允许跨 actual definition 评选模型改善或退化。历史 raw failure 和 v2.1 数字继续保留。

## 模型角色与授权

- 作品现行运行回退模型：`M2-WORK-OA03`。
- 作品研究比较基线：`M2-WORK-LG01`。
- 组合级参考：`M2-PORT-ETS01`。
- 活动候选：无（`activeCandidate=null`）。
- 自动化批准：无（`approvedForAutomation=null`）。

模型执行、训练、拟合、调参、选择、预测生成、预测修改和 production 变更次数全部为 0。private 逐笔 allocation ledger、scope reconciliation、标签重评分行和 execution receipt 只存在于 capability-scoped Git ignored 输出，未提交。

## 保持关闭

v2.2 当前不是开发评价激活合同，更不是 production 或 automation gate。渠道时间生成、later-origin、final holdout、provider、数据库、Canary/full160、release、M3 formal 和任何新模型继续未授权。本轮结束后停止，不自动进入后续模型工作。
