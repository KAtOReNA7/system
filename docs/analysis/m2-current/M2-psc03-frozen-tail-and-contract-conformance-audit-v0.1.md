# PSC03 冻结尾部爆炸与合同一致性审计 v0.1

截至 2026-08-02，本报告只审计出版行业渠道直接现金尺度条件金额模型 v0.1
（Publishing-Scale Channel Direct-Cash Conditional Amount Model v0.1，
`M2-CHAN-PSC03`）的冻结准 Poisson 唯一原始候选
（Direct Quasi-Poisson Sole Raw Candidate，
`M2-EXP-PUBLISHING-SCALE-CHANNEL-DIRECT-CASH-03/P`；
`M2-CHAN-PSC03-RAW`）。本次没有拟合、交叉拟合、选择 lambda、生成预测、
计算反事实候选分数或改写模型算法。

机器可读结果见
`docs/analysis/m2-current/M2-psc03-frozen-tail-and-contract-conformance-audit-v0.1.json`。

## 审计结论

最终走分支 E1：实现合同不一致已确认
（Implementation Contract Mismatch Confirmed，
`PSC03_IMPLEMENTATION_CONTRACT_MISMATCH_CONFIRMED`）。

- 3,318,819 行冻结 raw、原评价、bootstrap、封存清单、seal、三次工程 attempt
  与历史决定均保持不变；冻结 raw 的真实性和完整性通过。
- 唯一一次只读流式扫描逐字节计算 SHA-256，并在同一字节流上重算指标。
  382 项公开冻结评价比较全部通过，最大 binary64 聚合差为
  `1.7319479184152442e-14`。
- 冻结实现只用作品数、正金额作品数和独立起点数判定层级可拟合；它没有执行
  已冻结统计支持合同要求的 grouped-CV 收敛、系数不稳定度、作品总额预测 CV、
  leave-one-work-out WAPE 变化、父层相对不确定性、父层收缩或连续条件金额收缩。
- `cashEffectiveWorkCount` 虽然被计算，却从未进入资格判断、收缩权重或预测调用链。
  子层使用父层 log-mean 作为 coefficient-one offset 后，完整残差系数以 100% 权重
  叠加；这不是合同规定的 log1p child-to-parent interpolation。
- 因此冻结 raw 必须保留，但不是有效候选性能证据
  （`PSC03_FROZEN_RAW_PRESERVED_BUT_NOT_VALID_CANDIDATE_PERFORMANCE_EVIDENCE`）。
  历史状态 `PSC03_DEVELOPMENT_NOT_SUPPORTED` 继续作为不可变历史结果保存，
  但不能再解释为“合同一致的直接现金尺度设计已经被科学否决”。
- 直接现金尺度假设没有被合同一致实现裁决
  （`DIRECT_CASH_SCALE_HYPOTHESIS_NOT_ADJUDICATED_BY_CONFORMING_IMPLEMENTATION`）。
  本审计不授权重放、后继模型或修正版
  （`NO_SUCCESSOR_OR_REPLAY_AUTHORIZED`）。

## 证据边界与只读完整性

| 对象 | 核验结果 |
|---|---|
| 冻结 raw | 3,318,819 行；3,845,043,997 bytes；SHA-256 `2c04ac66b47613fd70e4630582c79ea4de718800f0da267d7c431ca85f89c05b`；完整扫描次数为 1 |
| 冻结人口键 | SHA-256 `322256b7ac2bd674c7637e9f09d35f618e807af493a26487482aae14744865a9` |
| PSC01 occurrence 权威 | SHA-256 `e1e06d5a00d46689aff54d32ec55925e5f6dee02e28f7dd233fe1b3aea4ea5ba`；与 manifest 一致 |
| LG01 比较器 | SHA-256 `aee288069e2cee728d26797df24c48f186e9083c49235f9e4c77ccc0e74922fd`；与 manifest 一致 |
| raw 行内不变量 | 发生概率 binary64、乘法次数、actual 守恒、horizon 聚合次数、taxonomy/LG01 依赖、future-first-seen 弃权等均为 0 个失败 |
| 公开评价复算 | 382 项比较、0 项失败；primary、strict、horizon、origin、机制、平台和支持层均复现 |
| bootstrap | 3 个摘要与 6,000 个 draw 完整，冻结 seed、次数、观测量和 95% 区间一致 |
| 工程轨迹 | 3 个 attempt receipt 与两个失败 receipt 均存在；对应历史提交中的实现、config、预注册和 schema digest 均一致 |

只读 raw 扫描耗时 48.8063 秒，完整审计耗时 56.8096 秒，近似峰值 RSS
787,845,120 bytes。扫描器使用只读文件句柄，输入前后文件元数据一致。私有明细、
定位器和运行 receipt 只写入 Git ignored private output，属于运行溯源
（Private Run Provenance，`PRIVATE_RUN_PROVENANCE`），不进入仓库。

冻结目录没有单独保存 private evaluation 文件；公开 tracked evaluation 是冻结评价
权威（`NOT_RECORDED_PUBLIC_TRACKED_EVALUATION_IS_FROZEN_AUTHORITY`）。这不构成结果
复现阻断，因为 raw 对该权威的全部 382 项比较已通过。

## 结果权威为何需要纠正

统计支持合同（`M2-PUBLISHING-SCALE-SUPPORT-01`）早于 PSC03 结果前预注册
（`M2-PREREG-PSC03-DIRECT-CASH-QUASI-POISSON-01`）和 outcome 形成，并被 PSC03
预注册与开发 config 明确引用。PSC03 预注册中的“父层 mean 作为 coefficient-one
offset”定义估计器的条件均值结构；统计支持合同中的父层收缩与连续收缩定义该子层
是否可用、以及子层相对父层的实际权重，两者不是互斥条款。

冻结实现的调用链是：

1. `supportProfile` 计算作品数、正金额作品数、独立起点数和
   `cashEffectiveWorkCount`；
2. `nodeEligible` 只检查前三项门槛；
3. `fitQuasiNode` 用父层 eta 作 offset 并拟合完整子层 residual；
4. `predictQuasiNodeRawEta` 直接返回
   `parentEta + dot(features, childCoefficients)`；
5. 非空 child model 一律被标记为 `SHRUNK_FIT`。

这条调用链没有任何位置读取
`continuousShrinkage.conditionalAmountWeight`，也没有执行
`log1p child-to-parent interpolation`。所以问题不是报告字段遗漏，而是会改变预测
数值的支持合同没有实现。

## 20 项合同一致性矩阵

| # | 合同项目 | 当前判定 | 证据 |
|---:|---|---|---|
| 1 | `SHRUNK_FIT` 完整含义 | `IMPLEMENTATION_OMITS_REQUIRED_CONTRACT` | 非空 child fit 即被标记，稳定性与父层收缩均未执行 |
| 2 | 最少 distinct works | `CONFORMS` | 实现 `max(8,effectiveParameterCount)` |
| 3 | 最少 positive distinct works | `CONFORMS` | 实现 `max(6,ceil(effectiveParameterCount/2))` |
| 4 | 最少 cash-effective works | `NOT_APPLICABLE_WITH_EXPLICIT_REASON` | frozen `SHRUNK_FIT` tier 没有独立最低阈值；但该量仍是连续收缩的必需输入 |
| 5 | 最少 independent origins | `CONFORMS` | frozen tier 门槛已执行 |
| 6 | grouped-CV convergence | `IMPLEMENTATION_OMITS_REQUIRED_CONTRACT` | 未计算、未门禁 |
| 7 | coefficient relative instability | `IMPLEMENTATION_OMITS_REQUIRED_CONTRACT` | 未计算、未门禁 |
| 8 | prediction work-total CV | `IMPLEMENTATION_OMITS_REQUIRED_CONTRACT` | 未计算、未门禁 |
| 9 | leave-one-work-out WAPE delta | `IMPLEMENTATION_OMITS_REQUIRED_CONTRACT` | 未计算、未门禁 |
| 10 | parent-relative validation uncertainty | `IMPLEMENTATION_OMITS_REQUIRED_CONTRACT` | 未计算、未门禁 |
| 11 | `parentShrinkageRequired` | `IMPLEMENTATION_OMITS_REQUIRED_CONTRACT` | child residual 以完整权重叠加 |
| 12 | continuous conditional-amount weight | `IMPLEMENTATION_OMITS_REQUIRED_CONTRACT` | `cashEffectiveWorkCount` 计算后未使用 |
| 13 | child-to-parent combination scale | `IMPLEMENTATION_OMITS_REQUIRED_CONTRACT` | 完整 log residual 取代 frozen log1p interpolation |
| 14 | fallback eligibility | `IMPLEMENTATION_OMITS_REQUIRED_CONTRACT` | fallback 资格只受三项简单门槛控制 |
| 15 | global/mechanism/platform residual 次数 | `CONFORMS` | 每层只应用一次，但都是未收缩完整 residual |
| 16 | positive-only standardizer 与完整预测人口 | `CONFORMS` | 符合 PSC03 明示预注册；同时构成可解释的外推风险 |
| 17 | final eta clip 角色 | `CONFORMS` | 仅预测时 `[-30,30]`；灾难单元没有命中或接近 clip |
| 18 | lambda 选择与单位 | `CONTRACT_CONFLICT_AMBIGUOUS_PRE_OUTCOME_AUTHORITY` | PSC03 `[1,3]` grid 与通用合同 node L2 并存；fold 选择值未封存 |
| 19 | 五个重点平台 frozen tier | `CONFORMS` | 映射和父层 fallback 身份保持 |
| 20 | 公开 `SHRUNK_FIT` 标签准确性 | `IMPLEMENTATION_OMITS_REQUIRED_CONTRACT` | 标签高估了实际支持合同的完成度 |

合计：7 项符合、11 项遗漏预测相关合同、1 项明确不适用、1 项存在结果前权威冲突。
任何一个会改变预测的必要合同遗漏都足以进入 E1；本次有多项相互独立的明确遗漏，
不需要通过重跑才能作出该判定。

## 数值追踪：爆炸从哪里开始

### 冻结总体结果

| 人口/视图 | case / work | WAPE | 预测/实际 | signed bias | 最大作品误差份额 | Top-10 作品误差份额 |
|---|---:|---:|---:|---:|---:|---:|
| primary H36 | 12,039 / 1,125 | 54.2647% | 0.8265 | -17.3494% | 17.9521% | 43.6607% |
| strict 全周期 | 74,320 / 2,650 | 297.0822% | 3.3527 | 235.2705% | 55.5486% | 84.5533% |

正实际月上的条件金额本身在总体聚合上没有同等规模的爆炸：primary 条件金额
预测/实际为 0.9326、WAPE 61.5187%；strict 为 0.9492、WAPE 57.1166%。严重错误
由特定晚起点、短周期、机制层和少数作品组合形成，不能用总体条件金额比率掩盖。

### 分周期

| Horizon | WAPE | 预测/实际 | signed bias | 最大作品误差份额 | Top-10 作品误差份额 |
|---:|---:|---:|---:|---:|---:|
| 3 | 2488.7672% | 25.4492 | 2444.9198% | 66.5890% | 97.8972% |
| 6 | 176.9284% | 2.2837 | 128.3698% | 45.2392% | 76.6790% |
| 12 | 54.0120% | 0.9836 | -1.6410% | 10.7962% | 38.3076% |
| 18 | 52.4409% | 0.8619 | -13.8145% | 15.4973% | 41.1484% |
| 24 | 59.4613% | 0.7985 | -20.1514% | 17.6898% | 44.8255% |

### 三个关键 origin × horizon 单元

| 起点 / 周期 | WAPE | 预测/实际 | 最大/Top-10 作品误差份额 | mechanism/global 预测质量比 | platform/mechanism 预测质量比 |
|---|---:|---:|---:|---:|---:|
| 2025-09 / H3 | 26,591.5300% | 266.6756 | 68.0316% / 99.4749% | 215.8916 | 0.8458 |
| 2025-06 / H3 | 1,381.9941% | 14.5314 | 59.6678% / 96.6064% | 16.9563 | 0.7357 |
| 2025-06 / H6 | 1,374.1634% | 14.4855 | 59.6900% / 96.6433% | 16.2586 | 0.7437 |

2025-09/H3 单元贡献 strict H3 总绝对误差的 93.4370%，并贡献该周期预测金额的
91.6366%。单一作品占该单元 68.0316% 误差，Top-10 占 99.4749%；Top-10 同时占
99.1913% 预测质量。因此这不是整个人口均匀偏高，而是高度集中的尾部失控。

### 层级与机制定位

2025-09/H3 中：

- global 层最大条件金额仅为冻结评价正实际 p99.9 参考的 76.82 倍；
- advertising mechanism 层把 occurrence-weighted 预测质量放大到 global 的
  215.8916 倍，机制层最大条件金额达到同一参考的 106,601.57 倍；
- named platform 层相对机制层乘以 0.8458，最终最大条件金额仍为参考的
  87,018.43 倍；
- advertising 机制贡献该单元 99.4912% 预测质量；fanqie_audio 平台贡献
  99.4907%，两者落在同一批异常作品上；
- advertising 机制聚合 WAPE 为 345,552.24%，预测/实际为 3,456.15；
  fanqie_audio 平台 WAPE 为 345,644.20%，预测/实际为 3,457.07；
- 高质量异常段平均 occurrence probability 约为 0.80，并不会抵消条件金额尾部；
- global、mechanism、named-platform 三层的 upper/lower/near clip 计数全部为 0。

所以第一处灾难性放大是 advertising mechanism residual，而不是 occurrence、
future-first-seen、final eta clip 或 named-platform residual。fanqie_audio
平台 residual 略微回压机制层，但不足以消除已经形成的尾部。

### occurrence、弃权和零实际月

strict 月度归因中：

- future-first-seen 弃权有 307,983 行，预测质量为 0，只占月度绝对误差 1.1556%；
- 正实际且无 reversal 有 471,875 行，占预测质量 11.8037%，占月度绝对误差
  8.0372%；
- 零实际且无 reversal 有 415,465 行，占预测质量 88.1963%，占月度绝对误差
  90.8072%；
- 冻结 raw 中没有 `REVERSAL_RELATED` 行，因为 actual 已经是 development-modelable
  restatement 视图。

这说明 occurrence 没有被重复相乘，也不是主要放大器；完整子层条件金额尾部在许多
零实际月仍被高 occurrence 传递，构成 strict 短周期的大部分误差。

## 估计目标、现金单位与正则化风险

冻结准 Poisson data gradient 为 `w*(mu-y)`，data Hessian 为 `w*mu`；
非截距 L2 项则是 `lambda*beta` 和 `lambda`。当现金单位整体乘以常数时，
data term 随现金尺度改变，而固定的 unitless lambda 不同步改变，因此
`lambda in [1,3]` 相对于 data term 的正则强度不是现金单位不变量。

准 Gamma 诊断的 gradient/Hessian 使用 `w*(1-y/mu)` 与 `w*y/mu`，尺度行为
不同。这能解释“直接现金尺度 + 固定 L2 + 完整 residual”为什么具有理论风险，
但不能据此反推出冻结 fold 的实际 lambda、系数或 penalty/data ratio。那些状态没有
被 seal，任何恢复都需要重跑，而本任务禁止重跑。

PSC03-specific lambda grid 与通用支持合同的 node-specific
`conditionalAmountL2` 同时存在，是结果前合同权威冲突；本审计准确登记为
`CONTRACT_CONFLICT_AMBIGUOUS_PRE_OUTCOME_AUTHORITY`，不静默选择其中一方。

## 未能恢复、也不得补造的证据

| 项目 | 状态 |
|---|---|
| fold coefficient state | `NOT_RECORDED_CANNOT_RECOVER_WITHOUT_RERUN` |
| fold standardizers | `NOT_RECORDED_CANNOT_RECOVER_WITHOUT_RERUN` |
| fold selected lambdas | `NOT_RECORDED_CANNOT_RECOVER_WITHOUT_RERUN` |
| grouped-CV stability receipts | `NOT_RECORDED_CANNOT_RECOVER_WITHOUT_RERUN` |

因此可以确认“尾部远超冻结评价正实际参考范围”和“首个爆炸层为 advertising
mechanism”，但不能声称异常作品在训练特征空间之外，也不能发布训练 leverage、
系数或标准化后的逐特征外推距离。缺口不阻断 E1，因为 E1 由冻结合同与冻结实现的
静态调用链直接证明。

### 特征支持与 leverage 逐项状态

| 所需证据 | 当前状态 |
|---|---|
| Top-error 行的 18 个标准化特征绝对 z-score | `NOT_RECORDED_CANNOT_VERIFY_WITHOUT_RERUN` |
| positive-training 与全部预测行的 support range | `NOT_RECORDED_CANNOT_VERIFY_WITHOUT_RERUN` |
| 超出训练 min/max 或 p0.1/p99.9 的特征数 | `NOT_RECORDED_CANNOT_VERIFY_WITHOUT_RERUN` |
| time basis / interaction 的逐项贡献 | `NOT_RECORDED_CANNOT_VERIFY_WITHOUT_RERUN` |
| Top-error 作品是否出现在正金额训练集及其月数 | `NOT_RECORDED_CANNOT_VERIFY_WITHOUT_RERUN` |
| 各 fold 的 cash-effective-work count 与 HHI | `NOT_RECORDED_CANNOT_VERIFY_WITHOUT_RERUN` |
| 训练正金额分布 p99/p99.9 | `NOT_RECORDED_CANNOT_VERIFY_WITHOUT_RERUN` |

公开尾部倍数使用的是冻结评价正实际参考
（`FROZEN_EVALUATION_POSITIVE_ACTUAL_REFERENCE_NOT_TRAINING_SUPPORT`），不是训练
support 的替代品。由此不能把“极端于评价实际”升级为“已证明超出训练特征范围”。

### 原始现金量纲与正则强度逐项状态

| 审计问题 | 结论 |
|---|---|
| `w_i=1/n` 后 data objective/gradient/Hessian 是否仍随现金单位缩放 | 是；由冻结公式和代码直接证明 |
| `lambda=1/3` 相对 data term 的实际数量级 | `NOT_RECORDED_CANNOT_VERIFY_WITHOUT_RERUN`；fold objective state 与系数未 seal |
| 相同 lambda 在准 Poisson 与准 Gamma 中是否具有相同有效强度 | 否；两类 gradient/Hessian 的现金尺度行为不同 |
| inner CV 是否只有 `[1,3]` | 是；但各 outer fold/origin 的选择结果未记录 |
| 最坏起点三层 coefficient norm、最大系数、penalty/data ratio | `NOT_RECORDED_CANNOT_VERIFY_WITHOUT_RERUN` |
| 是否已证明“数值收敛但统计上近似未正则化” | 未证明；现有证据只支持单位风险与严重尾部并存 |

## 下一次独立立项前必须回答的问题

本节只登记问题和证据需求，不选择 estimator、参数、clip、lambda 或候选身份：

1. 是否应研究“作品总额预测 × origin-safe 渠道构成”，而不是继续直接回归
   work×channel 现金？需要结果前定义守恒、构成误差和作品总额误差的独立门禁。
2. PSC03 使用评价 actual 统一作品总额后的渠道构成 WAPE 29.4707%，只能作为
   `POST_HOC_DIAGNOSTIC_NOT_MODEL_EVIDENCE` 的研究动机；下一立项如何避免把它当成
   候选成绩或选模依据？
3. 是否需要分别建立 membership、advertising、transactional 的真正独立生成过程，
   而不是三层完整特征 residual 叠加？需要哪些 origin-safe 样本和独立支持证据？
4. taxonomy/category 的历史 authority 不完整时是否继续 `REPORT_ONLY`？若改变，
   必须先形成可审计的 `effectiveAt/availableAt` 权威，而不是结果后回填。
5. 后继设计如何在 outcome 打开前冻结 target units、effective penalty、
   out-of-support、tail leverage、zero-row application 和失败关闭规则？

这些问题不构成 PSC04 或任何后继模型的预注册、支持证据或开发授权。

## 当前治理与停止边界

- 原冻结 raw、评价 JSON/Markdown、bootstrap、digest、seal、receipt、历史失败和
  `PSC03_DEVELOPMENT_NOT_SUPPORTED` 均不改写。
- Model Registry 中原评价行保留原指标，但标记
  `validForCandidateDecision=false`，当前解释指向结果权威纠正记录。
- 模型保持 inactive：`activeCandidate=null`、
  `approvedForAutomation=null`、`productionReady=false`、
  `finalHoldoutOpened=false`。
- 本审计不支持在本任务内设计或实现 PSC04/PSC03 修正版，也不授权 PSC03 replay、
  独立评价、later-origin、final holdout、taxonomy、production、automation、
  release 或财务使用。

结论是：已审计并验证冻结 evidence 和根因调用链；已确认实现合同不一致；没有由
合同一致实现形成的候选性能结论；没有后继模型或重放授权。
