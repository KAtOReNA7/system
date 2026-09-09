# 出版行业渠道直接现金尺度条件金额模型 v0.1：结果前预注册

英文原名：Publishing-Scale Channel Direct-Cash Conditional Amount Model v0.1

模型稳定 ID：`M2-CHAN-PSC03`

原始候选 ID：`M2-CHAN-PSC03-RAW`

实验稳定 ID：`M2-EXP-PUBLISHING-SCALE-CHANNEL-DIRECT-CASH-03`

预注册稳定 ID：`M2-PREREG-PSC03-DIRECT-CASH-QUASI-POISSON-01`

证据类别：历史开发重放（Development Replay，`DEVELOPMENT_REPLAY`）

本文件在任何 PSC03 私有 outcome、候选预测和候选成绩形成前冻结。机器合同以
`config/m2-current-publishing-scale-channel-direct-cash-preregistration.v0.1.json`
为权威；schema 与语义验证分别位于
`config/m2-current-publishing-scale-channel-direct-cash-schema.v0.1.json` 和
`src/domain/m2Current/publishingScaleDirectCashPreregistration.js`。

## 唯一研究问题

在完全冻结出版行业适配渠道月度发生—条件金额核心
（Publishing-Scale Channel Monthly Occurrence × Conditional Amount Core，
`M2-CHAN-PSC01`）的 occurrence、人口、起点、horizon、actual、18 个起点可见特征和
渠道结构后，把 work-balanced log1p 条件金额估计器替换为普通现金算术尺度上的直接
log-link quasi-likelihood，能否修复条件正金额尺度塌缩，同时不破坏渠道构成，并达到
冻结人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`）同案例
比较的现行候选优越性要求？

## 冻结范围与权威

本模型只使用已经由 `M2-CHAN-PSC01` 冻结并证明为 origin-visible 的资料：

- 3,318,819 行月度预测人口和完整键
  `standardWorkId|channelUid|origin|futureMonthIndex`；
- 逐月逐 case 的冻结 occurrence probability；
- 固定顺序的 18 个特征、compact/current basis、canonical mechanism 和五个重点平台；
- 已冻结的训练起点、标签成熟规则、primary 五个作品外层 fold 与 strict 滚动时间规则；
- 开发可建模冲销重述 actual
  （`M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01`）；
- primary 13 个起点、36 个月、12,039 个作品级 case、1,125 部作品；
- strict 11 个季度起点、3/6/12/18/24 个月、74,320 个作品级 case、2,650 部作品；
- 动态 Core80 主人口、Core90 敏感性人口、成熟且起点已观察渠道及既有 future-first-seen
  处理规则。

出版行业渠道起点可见现金锚金额模型 v0.1
（Publishing-Scale Channel Origin-Visible Cash-Anchor Amount Model v0.1，
`M2-CHAN-PSC02`）的 `componentId`、`revisionId`、`effectiveAt`、`availableAt` 以及
`missing=0, extra=3` 账本差异不属于本模型输入、门禁或恢复前提。本模型不得重建
PSC02 历史 snapshot，也不得读取 PSC02 字段。

## occurrence 与完整人口合同

冻结 occurrence 必须按完整 case key 连接，两侧重复键分别失败关闭，并逐 case 比较
IEEE-754 binary64 bit pattern；绝对和相对容差均为 0。occurrence 不重新拟合、校准或
变换，只在最终月点预测中乘一次。主候选完整月度人口必须与冻结 PSC01 原始候选完全
一致；缺一行、多一行或只评可用交集都失败关闭。

金额模型只在冻结训练人口中 strictly positive conditional amount 行上拟合。每个合法
正金额月度 case 等权，并在每个拟合节点内归一化为权重和 1；不使用作品等总权重、
actual cash、未来 cash、未来 TopN 或外层 outcome 加权。

## 固定层级与实验臂

固定金额层级为：

`GLOBAL_POOLED_PARENT → MECHANISM → NAMED_PLATFORM`

五个重点平台仅为 `ximalaya`、`wechat_reading`、`fanqie_audio`、`missevan` 和
`manbo`。子层使用父层 log mean 作为 coefficient-one 固定 offset；支持不足或子层数值
失败只能回到同一 estimator 的最近 eligible parent。global 数值失败必须失败关闭。
taxonomy/category 全程仅报告（`REPORT_ONLY`），不得进入特征、prior、support、fallback、
penalty、offset 或 selection；LG01 prediction 不进入依赖图。

| 实验臂 | 完整身份 | 固定角色 |
|---|---|---|
| 算术层级诊断（Arithmetic Hierarchy Only） | `M2-EXP-PUBLISHING-SCALE-CHANNEL-DIRECT-CASH-03/D0` | 机制归因诊断（`DIAGNOSTIC_NOT_CANDIDATE`）；逐节点 case-balanced 正现金算术均值，不使用 18 个特征，不得成为 fallback |
| 直接准 Gamma 层级诊断（Direct Quasi-Gamma Hierarchy） | `M2-EXP-PUBLISHING-SCALE-CHANNEL-DIRECT-CASH-03/D1` | 方差族诊断（`VARIANCE_FAMILY_DIAGNOSTIC_NOT_CANDIDATE`）；与主候选共享特征、层级、fold、support、weight 和 offset，不得替代主候选 |
| 直接准 Poisson 层级主设计（Direct Quasi-Poisson Hierarchy） | `M2-EXP-PUBLISHING-SCALE-CHANNEL-DIRECT-CASH-03/P` | 唯一原始候选（`SOLE_RAW_CANDIDATE`），对应 `M2-CHAN-PSC03-RAW` |

主设计对连续正现金使用 quasi-Poisson estimating objective，不宣称金额是整数 Poisson：

```text
mu_i = exp(eta_i)
L = sum_i w_i * (mu_i - y_i * eta_i)
    + 0.5 * lambda * sum_nonintercept(beta_j^2)
yhat_month_i = frozen_occurrence_probability_i * mu_i
```

直接准 Gamma 层级诊断的目标函数为
`sum_i w_i*(y_i/mu_i + log(mu_i)) + 0.5*lambda*sum_nonintercept(beta_j^2)`。
算术层级诊断和直接准 Gamma 层级诊断都不能在主设计失败时接管候选身份。

## 选择、求解与一次应用

- 正则网格固定为 `[1, 3]`；1e-12 内并列选择更大的 lambda。
- primary 复用五个 outer work folds；inner 固定为 3 folds × 3 repeats。
- strict 只使用 `training.origin < outerOrigin` 且
  `labelAvailableAsOf < outerOrigin`，inner 取外层起点前最近三个合法起点、至少两个。
- 主设计使用 case-balanced mean quasi-Poisson unit deviance；准 Gamma 诊断使用
  case-balanced mean Gamma unit deviance；outer outcome 不参与选择。
- damped Newton/IRLS 最多 200 次迭代、20 次 step halving；coefficient tolerance
  `1e-10`、relative objective tolerance `1e-12`、pivot tolerance `1e-12`，且 objective
  必须单调不增。
- `[-30,30]` 只用于最终 total eta 的 prediction clip，不进入训练 objective、gradient
  或 Hessian。
- occurrence、每层父 offset/子 residual multiplier 与月到 horizon 聚合都只能应用一次；
  不允许 exposure 重复、anchor、后验全局/作品/渠道校准或 LG01 fallback。

## 唯一开发重放与结果前门槛

私有执行只能在同一 campaign 中依次形成不可覆盖 attempt receipt、冻结输入物化、三个
实验臂、完整 parity/coverage、主候选原始预测原子封存、比较器延后读取、指标、seed
`20260728` 的 2,000 次 whole-work paired bootstrap、门禁与冻结决策。任何比较器成绩只能
在 `M2-CHAN-PSC03-RAW` 原子封存之后读取。

相对 `M2-CHAN-PSC01` 的尺度修复门槛全部按 AND：primary 与 strict aggregate relative
FVA 均至少 10%；primary prediction/actual ratio 在 `[0.75,1.25]`；每个 strict horizon
ratio 在 `[0.67,1.50]`；统一作品实际总额后的渠道构成 WAPE 不得恶化超过 0.02。后者
使用评价 actual 得到 scalar，只能标记为
`POST_HOC_DIAGNOSTIC_NOT_MODEL_EVIDENCE_NOT_CANDIDATE_SCORE`。

相对 `M2-WORK-LG01` 不另造宽松门槛，直接使用
`config/m2-business-acceptance-contract.v1.json#/candidateSuperiority` 的九项 AND。
业务绝对可用性、尺度假说和候选竞争力必须分别报告。

## 科学状态与关闭边界

形成完整候选结果后，主状态只能是：

1. 开发不支持（`PSC03_DEVELOPMENT_NOT_SUPPORTED`）；
2. 开发有希望但独立评价未就绪（`PSC03_DEVELOPMENT_PROMISING_INDEPENDENT_NOT_READY`）；
3. 支持请求首次独立评价但尚未授权
   （`PSC03_FIRST_INDEPENDENT_EVALUATION_REQUEST_SUPPORTED_NOT_AUTHORIZED`）。

若在任何真实预测前因冻结输入或 parity 阻断，只能登记执行输入不可用
（`PSC03_EXECUTION_INPUT_UNAVAILABLE_NO_MODEL_EVIDENCE`）与无模型性能证据
（`NO_MODEL_PERFORMANCE_EVIDENCE`），不得伪造候选状态或 evaluation row。

始终保持 `activeCandidate=null`、`approvedForAutomation=null`、
`productionReady=false`、`finalHoldoutOpened=false`、
`independentEvaluationOpened=false`、`laterOriginOpened=false`。本预注册不授权再次执行
PSC02、第二次 PSC03 replay、独立评价、later-origin、final holdout、taxonomy/category
模型、production、automation、release、API、数据库、provider 或财务使用。
