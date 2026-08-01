# M2 出版行业渠道现金锚结果形成前合同消歧 v0.1

对象：出版行业渠道起点可见现金锚金额实验
（Publishing-Scale Channel Cash-Anchor Amount Experiment，
`M2-EXP-PUBLISHING-SCALE-CHANNEL-CASH-ANCHOR-02`）。

状态：结果形成前合同已消歧、真实 outcome 从未打开
（`M2_PSC02_PRE_OUTCOME_CONTRACT_CLARIFIED_NO_REAL_OUTCOME_OPENED`）。

## 决定

1. 现有 source authority 是 posting component 形态；必须先在同一合法 as-of revision
   snapshot 内聚合为
   `standardWorkId × channelUid × cashMonth × cashCategory × currency` 月度自然键，再计数和
   求算术均值。完全相同的 canonical component 重复行可确定性去重，金额、机制或时间
   冲突失败关闭。
2. 冻结 PSC01 与 PSC02 occurrence 两侧分别拒绝内部重复 case key，并比较原始行数、
   唯一 key 数、完整 key 集和每个概率的 IEEE-754 binary64 bit pattern。
3. 主设计月度 case keys 必须与冻结 PSC01 raw population 完全一致
   （`PSC02_EXACT_CASE_COVERAGE_EQUALS_FROZEN_PSC01_RAW`）。不得交集评分或将弃权填 0；
   冻结人口中存在 anchor unavailable case 时直接判为开发不支持
   （`PSC02_DEVELOPMENT_NOT_SUPPORTED`），不生成候选成绩。
4. 准 Gamma offset 主设计的 objective、gradient 和 Hessian 统一使用未截断的
   `mu=A×exp(xβ)`；log-domain 实现遇到非有限或不可表示值时显式失败
   （`PSC02_P_GAMMA_OFFSET_NUMERICAL_FAILURE_NO_CANDIDATE_OUTPUT`）。`[-30,30]` 只用于最终
   residual prediction，不进入拟合。

## 时间与权限证明

这四项是实现一致性消歧，不改变 anchor 窗口、fallback、18 个特征、层级、loss、
正则网格 `[1,3]` 或评价门限。形成本记录时：

- 未读取 private 输入（`privateInputRead=false`）；
- 未生成真实 PSC02 prediction（`realPredictionGenerated=false`）；
- 未执行真实拟合、评价或 bootstrap（`realOutcomeEverOpened=false`）；
- 未创建模型、候选或评价身份（`modelId=null`、`activeCandidate=null`）；
- 冻结 PSC01/HPSR02 artifact、digest、receipt、指标和历史状态均未改写。

本记录只消除预注册合同歧义，不授予 production、automation、release、独立评价、
later-origin、final holdout、数据库、API、provider 或财务使用权限。
