# M2 出版行业渠道起点可见现金锚金额设计 v0.1 预注册

状态：设计与公共合成合同已预注册、实现未授权
（Publishing-Scale Channel Origin-Visible Cash-Anchor Amount Design v0.1，
`M2-PREREG-PSC02-ORIGIN-VISIBLE-CASH-ANCHOR-01`；
`M2_PSC02_ORIGIN_VISIBLE_CASH_ANCHOR_PREREGISTERED_IMPLEMENTATION_NOT_AUTHORIZED`）。

本文件记录一个实验设计，不创建模型身份、候选成绩或评价行。机器合同是
`config/m2-current-publishing-scale-channel-origin-visible-cash-anchor-preregistration.v0.1.json`；
schema、语义 validator 与公共 reference harness 分别位于：

- `config/m2-current-publishing-scale-channel-origin-visible-cash-anchor-schema.v0.1.json`
- `src/domain/m2Current/publishingScaleCashAnchorPreregistration.js`

## 1. 唯一问题与证据起点

本预注册只回答如何检验下列问题，不产生真实候选结果：

> 在完全冻结出版行业适配渠道月度发生—条件金额核心
> （Publishing-Scale Channel Monthly Occurrence × Conditional Amount Core，
> `M2-CHAN-PSC01`）的 occurrence 子模型后，使用预测起点可见的作品现金尺度锚，
> 并在该尺度上估计条件正金额，能否消除 PSC01 的金额尺度收缩，同时保留渠道、
> 机制和时间结构？

冻结 PSC01 raw candidate（`M2-CHAN-PSC01-RAW`）的根因仍是“估计器尺度收缩已确认，
但实现正确”（`ESTIMATOR_SCALE_SHRINKAGE_CONFIRMED_IMPLEMENTATION_CORRECT`）。尺度塌缩
首先出现在 work-balanced `log1p` 经验父层，层级金额收缩继续放大该问题；没有确认
单位、逆变换、horizon 累加、发生概率乘法或比较器完整性缺陷。本设计不改写这项
历史结论或任何冻结 artifact。

## 2. 不可变范围

设计实验的稳定 ID 是出版行业渠道现金锚金额实验
（Publishing-Scale Channel Cash-Anchor Amount Experiment，
`M2-EXP-PUBLISHING-SCALE-CHANNEL-CASH-ANCHOR-02`）。它不是模型 ID。

以下维度与 PSC01 完全相同：

- 目标：未来开发可建模分成收入现金
  （`future_sales_share_development_modelable_cash`）；
- actual：开发可建模冲销重述
  （`M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01`）；
- case population、forecast origin、horizon、as-of/available-at、比较器和聚合口径；
- 月训练唯一键：
  `standardWorkId|channelUid|origin|futureMonthIndex`；
- primary 为 36 个月，strict rolling 分别为 3、6、12、18、24 个月；
- taxonomy 仅报告（`REPORT_ONLY`），不进入 prior、特征、fallback、金额修正或选择；
- LG01 prediction 不得充当特征、锚、倍率、offset 或校准目标。

PSC01 已打开的历史人口未来只能称为开发重放（`DEVELOPMENT_REPLAY`），不能形成新的
独立证据。任何新独立起点仍需单独授权。

## 3. 精确公式与单位

对作品 (w)、canonical 渠道 (c)、forecast origin (o) 和未来第 (m) 月：

\[
\widehat y^{+}_{w,c,o,m}
=p^{PSC01}_{w,c,o,m}\,A_{w,c,o}\exp\{g(x_{w,c,o,m})\}.
\]

其中：

- (p^{PSC01}) 是冻结 PSC01 occurrence probability；
- (A_{w,c,o}) 是人民币/正发生作品—渠道月的 origin-visible 算术现金锚；
- (g(x)) 只表示相对于现金锚的无量纲 log multiplier；
- 月点预测单位为人民币/作品—渠道月；
- horizon 结果只做一次月度求和：

  \[
  \widehat y_{w,c,o,h}=\sum_{m=1}^{h}\widehat y^{+}_{w,c,o,m}.
  \]

occurrence probability 只乘一次，现金锚只应用一次，exposure 固定为 1；不得再做全局、
逐作品或逐渠道的事后倍率校准。

## 4. occurrence 完全冻结

开发重放必须按精确月 case key 直接连接冻结 PSC01 occurrence probability，不重新拟合、
校准或变换。逐 case 比较使用 IEEE-754 binary64 bit pattern，绝对与相对容差都为 0。

冻结边界还包括：

- PSC01 的 weighted logistic IRLS 与 one-class smoothing；
- 18 个 origin-visible 特征及其顺序；
- compact/current 时间 basis 和 interaction；
- 全局、变现机制、五个重点平台的 occurrence L2、支持层级与 fallback；
- taxonomy 不使用、未观察渠道行为不改变。

公共 harness 只接收已经冻结的 probability 并原样传递。未来若另行授权新 origin，
必须使用 byte-identical PSC01 occurrence code/config/support/fallback；本预注册不授予该
执行权限。

## 5. 现金锚 (A_{w,c,o})

### 5.1 输入与 as-of

输入粒度是已经 canonical 化的
`work × channel × cashMonth × cashCategory × currency × as-of revision`。只接受人民币
分成现金（`sales_share`、`CNY`）。forecast cutoff 是上海时区 origin 月最后一刻。

一行只有同时满足以下条件才可见：

1. `cashMonth <= origin`；
2. `effectiveAt <= cutoff`；
3. `availableAt <= cutoff`。

同一自然键
`standardWorkId|channelUid|cashMonth|cashCategory|currency` 有多个修订时，只在可见修订
中依次按 `availableAt`、`effectiveAt`、`revisionId` 取最后一版。cutoff 后到达的新增行
或修订不能改变旧 origin 的 anchor。

### 5.2 金额口径

- anchor 只使用严格大于 0 的原入账分成现金 component；
- 0 只属于 occurrence exposure，不进入条件正金额分子或分母；
- 冲销继续单独保存，不从正现金 anchor 扣除；
- `positiveCash < 0` 是输入合同错误，负数必须在 reversal component；
- 无法分配的冲销残差继续留在财务对账中，不进入 anchor；
- 只有 origin 前可见的修订才能替换同一自然键，future revision 禁止倒灌；
- buyout、其他现金、公司收入补差和评价期 actual 均不可用。

### 5.3 窗口、尺度与支持

窗口固定为截至 origin 的最近 12 个完整账单月（含 origin），时间权重均为 1，不衰减。
anchor 是所选层级严格正月金额的普通算术均值：

\[
A=\frac{1}{n_+}\sum_{i:y_i^+>0}y_i^+.
\]

不得使用 geometric mean、`log1p` absolute center、work-balanced 几何中心或由评价 actual
反推的 scalar。作品自身三个层级要求至少 3 个完整账单月且至少 1 个正金额观测；这是
当前 M2 起点成熟渠道规则，而不是根据候选 WAPE 选择的阈值。

pool 层级要求至少 8 部独立作品和 6 部正金额作品。它来自冻结出版规模统计支持合同
（`M2-PUBLISHING-SCALE-SUPPORT-01`）对单一 scalar 参数的既有最低支持，而不是新候选
结果。

### 5.4 唯一 fallback

固定顺序为：

1. 作品×渠道（`WORK_CHANNEL`）；
2. 作品×变现机制（`WORK_MECHANISM`）；
3. 作品整体（`WORK`）；
4. 渠道池（`CHANNEL_POOL`）；
5. 变现机制池（`MECHANISM_POOL`）；
6. 全局池（`GLOBAL_POOL`）。

每层都只使用同一 12 个月窗口的 origin-visible 行。第一个满足支持门槛的层级唯一生效；
taxonomy 不参与路径。floor 固定为人民币 0.01 元，上限固定为同窗口全部 origin-visible
严格正月金额的最大值，不做 winsorization 或 outcome-derived quantile。

未来新增作品、起点时首次出现渠道或从未出现过正分成现金的作品—渠道一律弃权
（`ANCHOR_UNAVAILABLE_NO_ORIGIN_VISIBLE_POSITIVE_CASH`），不得以 0 冒充预测。所有层级
均不合格时同样弃权。

### 5.5 manifest

未来若另行授权物化，private manifest 必须记录：schema、预注册 ID、origin、配置与
schema digest、source-authority digest 引用、按 canonical 顺序排序后的可见输入 digest、
anchor 行 digest、代码 digest 和 runtime receipt。算法固定为 stable JSON UTF-8 SHA-256；
输入排列不改变 digest。private 路径、行、身份和 digest 不发布到公共报告。

## 6. 三个同案设计臂

### 6.1 现金锚单独诊断

现金锚单独诊断（Anchor Only Diagnostic，
`M2-EXP-PUBLISHING-SCALE-CHANNEL-CASH-ANCHOR-02/D0`；`ANCHOR_ONLY`）固定
(g(x)=0)，不拟合任何残差。它只归因“仅修复 absolute scale 能做多少”，不是候选。

### 6.2 锚定对数比率岭回归诊断

锚定对数比率岭回归诊断（Anchored Log-Ratio Ridge Diagnostic，
`M2-EXP-PUBLISHING-SCALE-CHANNEL-CASH-ANCHOR-02/D1`；
`ANCHORED_LOG_RATIO_RIDGE`）对 (log(y^+/A)) 做 ridge：

\[
\frac12\sum_i w_i\{\log(y_i^+/A_i)-x_i^T\beta\}^2
+\frac{\lambda}{2}\sum_{j>0}\beta_j^2.
\]

它只用于识别主设计改善是否来自 loss/link，而不是候选替代物。

### 6.3 锚定准 Gamma offset 主设计

唯一可在未来另行授权后取得候选资格的是锚定准 Gamma offset 主设计
（Anchored Quasi-Gamma Offset Primary Design，
`M2-EXP-PUBLISHING-SCALE-CHANNEL-CASH-ANCHOR-02/P`；
`ANCHORED_GAMMA_OFFSET`）。采用 variance proportional to (mu^2) 的 quasi-Gamma
log-link，固定 `log(A)` offset coefficient 为 1：

\[
\mu_i=A_i\exp(x_i^T\beta),
\]

\[
Q(\beta)=\sum_i w_i\left(\frac{y_i}{\mu_i}+\log\mu_i\right)
+\frac{\lambda}{2}\sum_{j>0}\beta_j^2.
\]

未正则化的 data loss 与加权 Gamma unit deviance 的一半只差一个仅由 (y) 决定的
常数。intercept 不处罚；每部作品的全部正训练行总权重相等，所有权重再归一化到和为 1。

求解器固定为 damped Newton/IRLS with step halving：最多 200 次迭代、每步最多 20 次
halving、pivot tolerance `1e-12`。必须同时满足最大 coefficient change `<=1e-10` 与
relative objective change `<=1e-12` 才算收敛。全局节点失败时状态为
`PSC02_P_GAMMA_OFFSET_NUMERICAL_FAILURE_NO_CANDIDATE_OUTPUT`；不得静默切换 Gamma、
log-ratio 或 anchor-only。稀疏/失败 child 只能带 receipt 明确回到最近 eligible residual
parent，不改变 estimator。

三个臂的 (lambda) grid 固定为 `[1, 3]`，沿用 PSC01 已冻结的 amount penalty 值域。
exact tie（差 `<=1e-12`）取较大的 (lambda)。

## 7. residual 结构与防泄漏

主设计与对数比率诊断复用 PSC01 的 18 个 origin-visible 特征、时间 basis、机制和重点
平台结构。层级只在无量纲 (g) 的 log-multiplier 尺度组合，不再在 `log1p` absolute
amount 上把作品现金锚拉向几何父层。taxonomy 仍为 `REPORT_ONLY`。

primary 保持 13 个 development origins 和 5 个 outer work folds；inner selection 仅在
outer training works 内使用 3 folds × 3 repeats。strict 保持 11 个 quarterly origins，
每个 outer origin 只能训练 `origin < outerOrigin` 且
`labelAvailableAsOf < outerOrigin` 的行。inner time validation 每次也执行同样规则，并取
outer origin 前最近三个合法 inner origins；至少需要两个，否则 child residual 明确回父层。

inner metric 是正金额行上的 work-balanced weighted mean Gamma unit deviance。禁止用 outer
WAPE 改 estimator、12 个月窗口、fallback、feature、fold 或 penalty grid。

## 8. 在真实 prediction 前冻结的评价

主比较必须是：

- 主设计 vs 冻结 PSC01 raw candidate，exact same-case；
- 主设计 vs 冻结 LG01，exact same-case；
- 两个诊断臂只作机制归因，不参加 candidate selection。

必报：cash WAPE、relative FVA、prediction/actual cash ratio、signed bias、occurrence
parity、条件正金额 WAPE/bias/MAE/log-MAE、各 horizon、strict time block、五个重点平台、
变现机制、support/anchor fallback、未来 actual top 1%/5%/10% cash works、统一作品总额后
的渠道构成 WAPE，以及 paired whole-work bootstrap。

未来 actual top-cash 分层仅为后验归因。统一作品总额的构成诊断必须标为
`POST_HOC_DIAGNOSTIC_NOT_MODEL_EVIDENCE_NOT_CANDIDATE_SCORE`；其 2 个百分点非劣 guardrail
只防止纯尺度修复严重破坏渠道构成，不能登记为候选成绩或单独宣称模型优越。

bootstrap 固定 2,000 次、seed `20260728`、resampling unit 为 `standardWorkId`，所有模型
成对重采样。公共 cell 至少 30 cases、20 works，否则
`SUPPRESSED_PRIVACY_THRESHOLD`。

### 8.1 相对 PSC01 的尺度修复门禁

仓库没有适用于 PSC01 absolute-scale collapse 的既有数值门限，因此本任务默认值在结果
前冻结，全部按 `AND`：

- primary WAPE relative FVA 至少 `+10%`；
- strict aggregate WAPE relative FVA 至少 `+10%`；
- primary prediction/actual cash ratio 在 `[0.75, 1.25]`；
- 每个 strict horizon 的 ratio 在 `[0.67, 1.50]`；
- 后验统一作品总额的渠道构成 WAPE 不得比 PSC01 恶化超过 0.02。

### 8.2 相对 LG01 的现有门禁

LG01 是健康冻结 same-case research baseline，因此不采用任务的备用“最多恶化 2%”。
直接使用唯一现行数值权威
`config/m2-business-acceptance-contract.v1.json#/candidateSuperiority` 的九项 `AND` 规则：
至少 1% paired absolute-error reduction、2,000 次 whole-work bootstrap 下界大于 0、
horizon bias cap、Core80 H50 不恶化、maximum-work 与 top-10 error share 不恶化、L20
不能掩盖 H50 损失、per-origin improvement median 大于 0、满足非重叠时间证据。业务绝对
可用性门禁继续与候选优越性分开。

### 8.3 三个互斥状态

1. 任何 correctness gate、相对 PSC01 尺度修复门禁失败，或完整可判定的 LG01 非时间
   guardrail 材料性失败：开发不支持（`PSC02_DEVELOPMENT_NOT_SUPPORTED`）。
2. correctness 与 PSC01 尺度修复全部通过、没有 LG01 材料性伤害，但业务可用性或完整
   LG01 `AND`/time evidence 不足：开发有希望但独立评价尚未就绪
   （`PSC02_DEVELOPMENT_PROMISING_INDEPENDENT_NOT_READY`）。
3. correctness、尺度修复、业务可用性、LG01 九项 `AND`、privacy 和 support 全部通过：
   支持提出首次独立评价申请但仍未授权
   （`PSC02_FIRST_INDEPENDENT_EVALUATION_REQUEST_SUPPORTED_NOT_AUTHORIZED`）。

## 9. 公共 synthetic reference 验证

公共 reference harness 已用纯合成数据验证 14 项合同：

1. 现金整体乘 (k)，anchor 与 prediction 同步乘 (k)；
2. 常量正金额恢复算术现金尺度；
3. 高金额 observation 不回缩到几何中心；
4. origin 后新增行或修订不改变旧 anchor；
5. occurrence IEEE-754 bit-for-bit parity；
6. occurrence probability 只乘一次；
7. offset/anchor 只应用一次；
8. monthly 到 horizon 只求和一次；
9. cold-start 弃权及六层 fallback 均唯一、有限、确定；
10. 0、负数、冲销与 as-of restatement 符合 target 合同；
11. taxonomy 改变不影响 anchor 或 prediction；
12. allowed model inputs 不包含 LG01 prediction；
13. quasi-Gamma 主设计和 log-ratio ridge 诊断在合成数据上可区分；
14. 输入顺序不改变结果或 digest。

状态是公共合成 reference 合同已验证且没有真实 outcome
（`PUBLIC_SYNTHETIC_REFERENCE_CONTRACT_VERIFIED_NO_REAL_OUTCOME`）。这些测试没有连接
private loader、billing、provider、数据库、production runner 或真实 prediction。

## 10. 授权与停止边界

当前仍为：

- 活动候选：`activeCandidate=null`；
- 自动化批准：`approvedForAutomation=null`；
- production ready：`productionReady=false`；
- final holdout：`finalHoldoutOpened=false`。

没有授权创建 PSC02 模型 ID、实现真实 runner、读取 private 输入、拟合、训练、调参、
生成真实 prediction、development evaluation、bootstrap、独立评价、later-origin、final
holdout、模型激活、production、automation、release、数据库、API、provider 或财务使用。

因此本轮最终状态只能是“起点可见现金锚设计已预注册、实现未授权”
（`M2_PSC02_ORIGIN_VISIBLE_CASH_ANCHOR_PREREGISTERED_IMPLEMENTATION_NOT_AUTHORIZED`）。
