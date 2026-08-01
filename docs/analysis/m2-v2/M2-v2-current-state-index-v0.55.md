# M2 当前状态索引 v0.55

截至 2026-08-01，本索引是 M2 用户阅读的最新状态入口。模型名称、别名、角色、
评价人口和可比组仍以 `config/m2-model-registry.v1.json` 为唯一机器权威；数值业务
门限仍以 `config/m2-business-acceptance-contract.v1.json` 为唯一权威。

## 当前结论

| 对象 | 当前状态 | 含义 |
|---|---|---|
| 兼容性现行运行回退 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 仅为兼容性回退；没有新增当前范围性能支持 |
| 研究比较基线 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 研究比较用途，不是 production 晋升 |
| 冻结失败渠道模型 | 出版行业适配的渠道月度发生—条件金额核心（Publishing-Scale Channel Monthly Occurrence × Conditional Amount Core，`M2-CHAN-PSC01`） | 首个 raw candidate 已冻结失败；根因是估计器尺度收缩，未确认实现或比较器缺陷 |
| 后续金额设计 | 出版行业渠道起点可见现金锚金额设计 v0.1（Publishing-Scale Channel Origin-Visible Cash-Anchor Amount Design v0.1，`M2-PREREG-PSC02-ORIGIN-VISIBLE-CASH-ANCHOR-01`） | 只完成数学预注册与公共 synthetic reference 验证；不是模型、候选或真实实现 |
| 头部保护尾段修正研究 | LG01 头部保护尾段修正模型 v0.2（LG01 Head-Protected Tail-Band Correction Model v0.2，`M2-WORK-HPSR02`）唯一独立结果证据不足 | 现金-only 相邻研究已结束；第二起点和后继模型未启动 |
| 活动候选 | `activeCandidate=null` | 没有活动候选 |
| 自动化批准 | `approvedForAutomation=null` | 没有自动化批准 |
| production ready | `false` | 没有生产权限 |
| final holdout | `finalHoldoutOpened=false` | 未打开 |

## 出版行业渠道金额证据链

冻结 PSC01 raw candidate 的只读根因审计保持不变：

- 冻结预测、评价、manifest、receipt、digest 与公开摘要一致，fallback 未覆盖 raw 结果；
- 正式比较全部 exact same-case、same-origin、same-horizon、same-target、
  same-actual-definition；
- 主评价预测总额只占实际的 11.0718%，严格滚动各 horizon 为 12.8979%–15.7112%；
- 塌缩在 origin-visible 经验父层已经出现，工作平衡 `log1p` 几何中心与现金总额目标
  错位，层级金额收缩继续保留低尺度；
- 条件金额 oracle 可移除主评价 78.1641% 的原始误差，occurrence oracle 仅为 0.2101%；
- 机制/时间信息仍有约 5% 的局部误差改善，但不足以修复 absolute scale；
- 单位、horizon 累加、Duan inverse、发生概率乘法、clip、冲销口径、权重和唯一键均
  通过，taxonomy 为 `REPORT_ONLY`。

最终根因仍为“估计器尺度收缩已确认，但实现正确”
（`ESTIMATOR_SCALE_SHRINKAGE_CONFIRMED_IMPLEMENTATION_CORRECT`）。冻结 PSC01 的预测、
评价、指标、digest、receipt、ID 和失败状态没有改写。

## 起点可见现金锚金额预注册

出版行业渠道起点可见现金锚金额实验
（Publishing-Scale Channel Cash-Anchor Amount Experiment，
`M2-EXP-PUBLISHING-SCALE-CHANNEL-CASH-ANCHOR-02`）只登记实验设计，不登记模型 ID。

月度预注册公式是：

\[
\widehat y^+_{w,c,o,m}
=p^{PSC01}_{w,c,o,m}\,A_{w,c,o}\exp\{g(x_{w,c,o,m})\},
\]

horizon 结果只对月预测求和一次。PSC01 occurrence probability 在 development replay
按 case key 原样连接，逐 case 要求 IEEE-754 bit-for-bit 相同；不重新拟合、校准或
变换。

现金锚 (A_{w,c,o}) 只使用 forecast cutoff 前可见的最近 12 个完整账单月、严格正的
人民币分成现金月金额，取普通算术均值且不做时间衰减。冲销、无法分配残差、buyout、
其他现金、未来行、later revision 和评价 actual 不进入 anchor。fallback 唯一顺序是：

现有 source authority 已固定为 posting component 形态：必须在同一合法 as-of revision
snapshot 内先聚合到
`standardWorkId|channelUid|cashMonth|cashCategory|currency` 月度自然键，再统计正月份并求
均值；不得直接对 component 求均值。完全相同的 canonical component 重复行可确定性
去重，金额、机制或时间冲突失败关闭。

1. 作品×渠道；
2. 作品×变现机制；
3. 作品整体；
4. 渠道池；
5. 变现机制池；
6. 全局池。

未来新增作品、起点时首次出现渠道或没有 origin-visible 正现金的作品—渠道直接弃权
（`ANCHOR_UNAVAILABLE_NO_ORIGIN_VISIBLE_POSITIVE_CASH`），不填 0。taxonomy 继续只报告。

三个同案设计臂分别是：

- 现金锚单独诊断（Anchor Only Diagnostic，
  `M2-EXP-PUBLISHING-SCALE-CHANNEL-CASH-ANCHOR-02/D0`；`ANCHOR_ONLY`）：只做归因；
- 锚定对数比率岭回归诊断（Anchored Log-Ratio Ridge Diagnostic，
  `M2-EXP-PUBLISHING-SCALE-CHANNEL-CASH-ANCHOR-02/D1`；
  `ANCHORED_LOG_RATIO_RIDGE`）：只做 loss/link 归因；
- 锚定准 Gamma offset 主设计（Anchored Quasi-Gamma Offset Primary Design，
  `M2-EXP-PUBLISHING-SCALE-CHANNEL-CASH-ANCHOR-02/P`；
  `ANCHORED_GAMMA_OFFSET`）：未来另行授权后唯一可能取得候选资格的设计。

主设计固定 quasi-Gamma log-link、`log(A)` coefficient 1、work-balanced weights、
regularization grid `[1,3]` 和 damped Newton/IRLS；全局求解失败不得让两个诊断臂接管。
拟合 objective、gradient 和 Hessian 使用同一个未截断 `mu=A×exp(xβ)`；`[-30,30]` 只用于
最终 residual prediction，非有限或不可表示值显式进入
`PSC02_P_GAMMA_OFFSET_NUMERICAL_FAILURE_NO_CANDIDATE_OUTPUT`。

## 提前冻结的评价门限

未来若另行授权真实实现，历史 PSC01 人口只能作为开发重放（`DEVELOPMENT_REPLAY`）。
主设计必须 exact same-case 对比冻结 PSC01 raw 和冻结 LG01；两个诊断臂不参加选择。
月度人口还必须通过
`PSC02_EXACT_CASE_COVERAGE_EQUALS_FROZEN_PSC01_RAW`：两侧原始行数、唯一 key 数和完整 key
集完全一致。不得仅评 anchor-available 交集或将弃权填 0；冻结人口中存在 anchor
unavailable case 时直接判开发不支持，不生成候选成绩。

相对 PSC01 的尺度修复门限全部按 `AND`：primary 与 strict aggregate WAPE relative FVA
均至少 +10%；primary cash ratio 在 `[0.75,1.25]`；每个 strict horizon 在
`[0.67,1.50]`；统一作品总额后的后验渠道构成 WAPE 不得恶化超过 0.02。后者必须保持
`POST_HOC_DIAGNOSTIC_NOT_MODEL_EVIDENCE_NOT_CANDIDATE_SCORE`，不能登记为候选成绩。

相对健康冻结 LG01 不采用备用 2% 非劣门限，而使用
`config/m2-business-acceptance-contract.v1.json#/candidateSuperiority` 的九项 `AND`
规则。paired bootstrap 固定 2,000 次，以 `standardWorkId` 为 resampling unit。公共
cell 至少 30 cases、20 works。

结果状态预先冻结为且仅为：

- 开发不支持（`PSC02_DEVELOPMENT_NOT_SUPPORTED`）；
- 开发有希望但独立评价尚未就绪（`PSC02_DEVELOPMENT_PROMISING_INDEPENDENT_NOT_READY`）；
- 支持提出首次独立评价申请但未授权
  （`PSC02_FIRST_INDEPENDENT_EVALUATION_REQUEST_SUPPORTED_NOT_AUTHORIZED`）。

## 公共 synthetic 验证

纯函数 reference harness 已覆盖全部 22 项要求：月度 component 聚合、月度正观测计数、
重复去重与冲突关闭、origin 后数据隔离、两侧 occurrence 重复拒绝及 bit parity、完整
评价人口、从未正现金弃权与合法 fallback、occurrence/anchor/horizon 单次应用、冲销与
taxonomy 边界、Gamma 有限差分与闭式值、尺度等变、objective 单调确定收敛、numerical
failure 不切换诊断臂，以及输入顺序与 digest 不变。

该验证没有 private 输入、真实 prediction、真实 fit、评价、bootstrap、production
runner、数据库或 provider。状态是公共合成 reference 合同已验证且无真实 outcome
（`PUBLIC_SYNTHETIC_REFERENCE_CONTRACT_VERIFIED_NO_REAL_OUTCOME`）。

详细证据：

- `config/m2-current-publishing-scale-channel-origin-visible-cash-anchor-preregistration.v0.1.json`
- `config/m2-current-publishing-scale-channel-origin-visible-cash-anchor-schema.v0.1.json`
- `docs/analysis/m2-current/M2-publishing-scale-channel-origin-visible-cash-anchor-preregistration-v0.1.json`
- `docs/analysis/m2-current/M2-publishing-scale-channel-origin-visible-cash-anchor-preregistration-v0.1.md`
- `docs/analysis/m2-current/M2-publishing-scale-channel-origin-visible-cash-anchor-design-decision-v0.1.md`
- `docs/analysis/m2-current/M2-publishing-scale-channel-origin-visible-cash-anchor-pre-outcome-contract-clarification-v0.1.md`

## HPSR02 研究证据状态

LG01 头部保护尾段修正模型 v0.2（`M2-WORK-HPSR02`）的唯一 2026-03 起点评价仍冻结为：
LG01 WAPE 64.4488%，HPSR02 WAPE 64.1150%，relative FVA 0.5179%，2,000 次作品聚类
bootstrap 95% 区间 `[-2.4406%, 3.8718%]`。最终状态仍为证据不足并结束现金-only
相邻研究（`M2_HPSR02_FIRST_INDEPENDENT_INCONCLUSIVE_CASH_ONLY_RESEARCH_ENDED`）。

## 已实现、已验证、已授权与可发布

| 层次 | 当前状态 |
|---|---|
| 已实现 | 现有 canonical 模型代码；PSC02 只有独立纯函数 reference harness，不是实际模型实现 |
| 已验证 | PSC01 根因证据保持冻结；PSC02 schema、validator 与 22 项公共 synthetic contract 通过 |
| 已授权 | 只授权 PSC02 数学设计、预注册和公共 synthetic reference；不授权真实模型能力 |
| 可发布 | 否；没有活动候选、automation、production、release 或财务使用授权 |

## 保持关闭的能力

- 不创建 PSC02 模型 ID，不连接现有 production/private runner；
- 不读取 private 账单，不拟合、训练、调参或生成真实 prediction；
- 不执行 development evaluation、bootstrap 或独立评价；
- 不打开 later-origin、prospective final holdout、Canary/full160 或 M3 formal；
- 不修改 production loader、route、API，不连接数据库或 provider；
- 不改写冻结 PSC01/HPSR02 证据，不恢复 HPSR03 或第二个 HPSR02 起点。

本索引取代 v0.54 作为当前阅读入口，但不改写 v0.54、冻结预测、评价、指标、bootstrap、
digest、receipt、历史阻断、历史 ID 或参数谱系。当前状态是“现金锚设计已预注册、实现
未授权”（`M2_PSC02_ORIGIN_VISIBLE_CASH_ANCHOR_PREREGISTERED_IMPLEMENTATION_NOT_AUTHORIZED`）。
