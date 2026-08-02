# M2 当前状态索引 v0.56

截至 2026-08-01，本索引记录出版行业渠道起点可见现金锚金额模型 v0.1
（Publishing-Scale Channel Origin-Visible Cash-Anchor Amount Model v0.1，
`M2-CHAN-PSC02`）的执行前实现状态。模型名称、变体、角色、实验映射和成绩人口以
`config/m2-model-registry.v1.json` 为唯一机器权威；业务门限以
`config/m2-business-acceptance-contract.v1.json` 为唯一数值权威。

## 当前结论

| 对象 | 当前状态 | 含义 |
|---|---|---|
| 兼容性现行运行回退 | 作品发生—金额校准模型 v0.3（Occurrence-Amount Calibration v0.3，`M2-WORK-OA03`） | 仅为兼容性回退，没有新增当前范围性能支持 |
| 研究比较基线 | 人工锚定可学习全局模型（Human-Anchored Learned Global，`M2-WORK-LG01`） | 只用于研究比较，不是 production 晋升 |
| 冻结失败渠道模型 | 出版行业适配的渠道月度发生—条件金额核心（Publishing-Scale Channel Monthly Occurrence × Conditional Amount Core，`M2-CHAN-PSC01`） | 首个原始候选已冻结失败；根因是估计器尺度收缩，未确认实现或比较器缺陷 |
| 新实现 | 出版行业渠道起点可见现金锚金额模型 v0.1（`M2-CHAN-PSC02`；原始候选变体 `M2-CHAN-PSC02-RAW`） | 已实现并通过公共 synthetic 合同，尚未拟合、预测或评价（`M2_PSC02_IMPLEMENTED_AWAITING_EXACT_HEAD_CI_AND_CONTROLLED_DEVELOPMENT_REPLAY`） |
| 活动候选 | `activeCandidate=null` | 没有活动候选 |
| 自动化批准 | `approvedForAutomation=null` | 没有自动化批准 |
| production ready | `productionReady=false` | 没有生产权限 |
| final holdout | `finalHoldoutOpened=false` | 未打开 |

## 模型、实验与三个实验臂

预注册设计（`M2-PREREG-PSC02-ORIGIN-VISIBLE-CASH-ANCHOR-01`）保持不可变历史记录；
本次另行授权创建模型 `M2-CHAN-PSC02`，不回写预注册时的 `modelId=null` 或授权边界。
父实验仍为出版行业渠道起点可见现金锚金额实验
（Publishing-Scale Channel Origin-Visible Cash-Anchor Amount Experiment，
`M2-EXP-PUBLISHING-SCALE-CHANNEL-CASH-ANCHOR-02`）。

- 现金锚单独诊断（Anchor Only Diagnostic，
  `M2-EXP-PUBLISHING-SCALE-CHANNEL-CASH-ANCHOR-02/D0`）只做尺度归因，不是候选；
- 锚定对数比率岭回归诊断（Anchored Log-Ratio Ridge Diagnostic，
  `M2-EXP-PUBLISHING-SCALE-CHANNEL-CASH-ANCHOR-02/D1`）只做 loss/link 归因，不是候选；
- 锚定准 Gamma offset 主设计（Anchored Quasi-Gamma Offset Primary Design，
  `M2-EXP-PUBLISHING-SCALE-CHANNEL-CASH-ANCHOR-02/P`）对应唯一原始候选变体
  `M2-CHAN-PSC02-RAW`。

月度公式固定为：

\[
\widehat y^+_{w,c,o,m}
=p^{PSC01}_{w,c,o,m}\,A_{w,c,o}\exp\{g(x_{w,c,o,m})\}.
\]

冻结 PSC01 occurrence、现金锚和 residual 各只应用一次，horizon 只把月预测求和一次。
taxonomy 继续 `REPORT_ONLY`；LG01 prediction 不进入特征、锚、offset 或拟合。

## 已实现与公共验证

- 复用 `src/domain/m2Current/**` canonical core、既有 human-anchored materializer 和
  runner mode；没有新增 production loader、route、API、数据库或 provider；
- 现金锚保持最近 12 个完整账单月、严格 origin-visible、严格正现金、普通算术尺度和
  固定回退顺序；从未出现 origin-visible 正现金的目标作品×渠道必须弃权；
- 冻结 PSC01 occurrence 连接要求两侧分别拒绝重复键、完整 key 集一致，并按
  IEEE-754 binary64 bit-for-bit 核验；
- 锚定准 Gamma objective、gradient 与 Hessian 共用未截断的
  `mu=A×exp(xβ)`；`[-30,30]` 只作用于最终 residual prediction；
- lambda grid 固定为 `[1,3]`，使用作品平衡权重、primary 嵌套作品折和 strict
  嵌套时间选择；numerical failure 不得切换两个诊断臂；
- 公共 synthetic/contract 覆盖 component/revision 月度归并、合法 fallback、冷启动
  弃权、逐位 occurrence、一致人口、有限差分、闭式最优、尺度等变、目标单调下降、
  确定性、单次应用、taxonomy 与 LG01 防泄漏。

公共验证状态为 `M2_PSC02_PUBLIC_SYNTHETIC_IMPLEMENTATION_VERIFIED`。它没有读取 private
row、真实 outcome 或比较器成绩，不能登记为候选成绩。

## 私有元数据预检

执行前元数据预检只读取文件存在性、Schema、manifest/receipt 与字段名。冻结 PSC01
receipt/manifest 可识别，但当前现金权威缺少不可事后推造的 `componentId`、`revisionId`、
`effectiveAt` 和 `availableAt`；因此预检状态为
`M2_PSC02_PRIVATE_METADATA_PRECHECK_SOURCE_AUTHORITY_BLOCKED`。

该状态不是模型效果失败。执行前 exact-head Linux/Windows CI 成功以前，禁止形成真实
PSC02 prediction、打开 outer outcome、计算 WAPE/FVA、读取 LG01 成绩或执行 bootstrap。

## 已实现、已验证、已授权与可发布

| 层次 | 当前状态 |
|---|---|
| 已实现 | 模型身份、三个实验臂、嵌套拟合、逐月预测、失败关闭执行控制器和元数据预检 |
| 已验证 | 预注册的公共 synthetic/contract 通过；private 元数据预检仅确认源权威缺口 |
| 已授权 | 仅授权一次 historical `DEVELOPMENT_REPLAY`，且必须先取得实现 exact-head 双平台 CI |
| 可发布 | 否；没有活动候选、automation、production、release、final holdout 或财务使用授权 |

## 保持关闭的能力

- 不执行独立评价、later-origin、prospective final holdout 或第二次开发结果；
- 不按 outcome 修改 anchor、feature、basis、loss、link、offset、clip、lambda、人口或门限；
- 不让诊断臂或 fallback 覆盖原始候选；
- 不修改 production loader、route、API，不连接数据库或 provider；
- 不启动 HPSR03 或第二次 HPSR02 评价；
- 不改写冻结 PSC01/HPSR02 预测、评价、指标、bootstrap、digest、receipt 或历史状态。

本索引取代 v0.55 作为当前阅读入口，但不改写 v0.55。执行前 exact-head 双平台 CI 与唯一
受控开发重放尚未完成；本索引不声称存在真实 PSC02 结果。
