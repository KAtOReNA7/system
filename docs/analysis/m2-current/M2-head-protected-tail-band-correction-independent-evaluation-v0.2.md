# M2 LG01 头部保护尾段修正模型首次独立评价 v0.2

## 首页结论

- 最终科学状态：`M2_HPSR02_FIRST_INDEPENDENT_INCONCLUSIVE_CASH_ONLY_RESEARCH_ENDED`（首个独立起点证据不足，现金-only 相邻研究结束）。
- 对象：LG01 头部保护尾段修正模型 v0.2（LG01 Head-Protected Tail-Band Correction Model v0.2，`M2-WORK-HPSR02`）。
- 所属实验：M2 LG01 头部保护尾段修正独立评价 v0.2（M2 LG01 Head-Protected Tail-Band Correction Independent Evaluation v0.2，`M2-EXP-LG01-HEAD-PROTECTED-TAIL-BAND-CORRECTION-02`）。
- 本次是 2026-03 起点、3 个月 horizon 的首个且唯一完整独立结果；结果已冻结。
- 活动候选与自动化批准均为 `null`；生产就绪为 `false`；前瞻最终留出未打开。

## 来源权威复核

此前金额读取前检查点因 3 个 canonical 渠道组合和 3 条总表/分表差异而停止，状态为 `M2_HPSR02_BLOCKED_MISSING_SOURCE_AUTHORITY`；该历史检查点、0 次候选运行、0 次评价和 0 次 bootstrap 保持完整，不改写。

随后冻结参数与当前账单源权威被错误混为一类，形成第二个阻断检查点（`M2_HPSR02_BLOCKED_ACTIONABLE_SOURCE_AUTHORITY_DECISION_REQUIRED`）。该检查点、两侧各 732 行渠道拆分差异和“独立 outcome 已打开但尚无完整结果”的事实同样保留；本轮只修正权威类别，不回写历史。

字段级复核后的结论如下：

- 134 行、3 个未确认 canonical 渠道组合都有稳定原始来源身份，能够判断起点前发生性且没有非零重复风险；它们只形成作品总额警告（`WORK_TOTAL_CANONICAL_MAPPING_WARNING_WORK_CHANNEL_REMAINS_PARTIAL`），没有猜测或回填 canonical 映射。
- 分表比总表多出的 3 条 2026-05 非零事实确实影响全账守恒，但对应作品均不在 2026-03 动态 Core80；本次作品总额评价相关差异为 0 行（`OUT_OF_WORK_TOTAL_SCOPE_FACT_DIFFERENCE_WARNING`）。
- 作品总额源权威可用（`SOURCE_AUTHORITY_AVAILABLE_FOR_WORK_TOTAL`）；作品—渠道门禁继续部分且未激活（`PARTIAL_NOT_ACTIVE`）。
- 作品总额可重建缓存已由权威源与冻结代码重建；该缓存的历史 receipt 缺失不构成阻断。冻结参数谱系的历史 provenance 则已核验可用。

## 结果前工程恢复

首次独立评价在形成候选预测、科学评分或 bootstrap 前共有 7 次纯工程停止：

1. 请求起点与历史支持起点重复拼接（`m2_hpsr_rebuilt_work_case_duplicate`）
2. 历史冻结边界与当前作品总额评价错误共用了来源权威口径（`hpsr02_residual_bound_rebuild_not_reconciled`）
3. 历史全账渠道导出被当前窗口三条范围外分表事实阻断（`m2_core_revenue_manual_command_failed:node.exe`）
4. 不可变冻结参数尚未形成可验证加载工件（`M2_HPSR02_BLOCKED_MISSING_IMMUTABLE_FROZEN_PARAMETER`）
5. 错误尝试从当前原始事实重建历史冻结参数谱系（`hpsr02_parameter_lineage_snapshot_invalid`）
6. 完整私有参数谱系对象越过了推理入口的路径隔离门禁（`hpsr02_private_or_absolute_path_forbidden`）
7. 独立评价来源门禁字段语义与实际 outcome 状态不一致（`hpsr02_independent_source_gate_invalid`）

其中 2 次参数完整性门禁在读取新 future actual 前停止；其余 5 次虽已进入授权的作品总额事实处理，但候选预测、科学评价、bootstrap 和完整结果仍均为 0。审计状态保持结果前工程失败、可恢复（`INVALIDATED_PRE_RESULT_ENGINEERING_FAILURE_RECOVERY_ALLOWED`）。恢复先消除重复起点，再把不可变冻结模型参数与当前账单源权威解耦：评价入口只加载经过摘要与既有冻结运行记录核验的参数，不再从当前账单重算边界。模型、人口、基线、门限和已打开 outcome 均未被改写。


## 不可变冻结参数与渠道谱系漂移

- 三项边界属于不可变冻结模型参数（Immutable Frozen Model Parameter，`IMMUTABLE_FROZEN_MODEL_PARAMETER`），恰好包括 positive base floor、q05 与 q95；具体数值不公开。
- 参数来源状态为 `IMMUTABLE_FROZEN_MODEL_PARAMETER_VALIDATED`，本次加载方式为 `DIRECT_VALIDATED_ARTIFACT_LOAD`；参数谱系快照状态为 `PARAMETER_LINEAGE_SNAPSHOT_VALIDATED`。
- 参数推导范围仍为 2023-03 至 2025-09，最大已打开开发起点为 2026-02；输入与有限支持均为 577 行。
- 参数恢复身份为 `FROZEN_PARAMETER_RECONSTRUCTION_FROM_DIGEST_BOUND_LINEAGE_SNAPSHOT`。它是摘要绑定谱系的确定性恢复，不是训练、调参或边界重估；当前账单、later-origin outcome 与前瞻最终留出均未参与参数生成。
- 当前环境没有面向该 capability 的用户托管加密备份机制；未创建未加密备份（`NOT_AVAILABLE_FOR_THIS_CAPABILITY_NO_UNENCRYPTED_BACKUP_CREATED`）。
- 历史与当前作品×月份行数及金额守恒，但渠道行级多重集两侧各有 732 行差异，登记为 `HISTORICAL_CHANNEL_LINEAGE_DRIFT_WITH_WORK_MONTH_CASH_CONSERVED`。涉及 421 部作品、82 个月、21 个渠道身份和 721 个作品×月份。
- 2026-03 输入与 2026-04 至 2026-06 作品总额 actual 继续使用当前人工复核账单；旧谱系不替换当前 actual。本结果因此是冻结模型在渠道身份漂移下的真实独立迁移检验。

## 人口与实际现金

- origin：2026-03；actual window：2026-04、2026-05、2026-06。
- 全部成熟可评价作品：2692；动态 Core80：43。
- Core80 实际现金覆盖：78.7891%。

| 现金带 | 作品数 | actual cash | actual share | R0 absolute error | HPSR01 历史结构 absolute error | HPSR02 absolute error | HPSR02 paired reduction | HPSR02 方向 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| H50 | 3 | 949905.8980 | 53.7874% | 592122.1792 | 592122.1792 | 592122.1792 | 0.0000 | TIED |
| M30 | 12 | 344557.0653 | 19.5102% | 340236.8538 | 382941.3013 | 340236.8538 | 0.0000 | TIED |
| L20 | 28 | 471576.3422 | 26.7025% | 205832.0325 | 199936.9176 | 199936.9176 | 5895.1149 | IMPROVED |

## 同案例成绩

| 对象 | WAPE | signed bias | absolute bias | MAE | median AE |
| --- | ---: | ---: | ---: | ---: | ---: |
| 冻结 LG01 同案例基线（`M2-WORK-LG01`） | 64.4488% | 61.9824% | 61.9824% | 26469.5597 | 7580.3600 |
| LG01 头部保护分段路由模型 v0.1 历史结构对照（`M2-WORK-HPSR01`） | 66.5331% | 61.4728% | 61.4728% | 27325.5907 | 6879.6656 |
| LG01 头部保护尾段修正模型 v0.2（`M2-WORK-HPSR02`） | 64.1150% | 61.1152% | 61.1152% | 26332.4640 | 6879.6656 |

- 配对绝对误差减少：5895.1149；占 actual cash：0.3338%。
- relative FVA：0.5179%。
- 2,000 次作品 cluster bootstrap 95% 区间：[-2.4406%, 3.8718%]。
- HPSR01 历史结构对照相对 R0 的配对绝对误差减少 / relative FVA / 2,000 次 bootstrap 95% 区间：-36809.3326 / -3.2340% / [-14.8035%, 4.3101%]。
- absolute bias 相对 R0 变化：-0.8673%。
- 最大单作品误差集中度（R0/HPSR02）：37.9941% / 38.1919%。
- Top5：68.4552% / 68.8116%；Top10：82.1906% / 82.7539%。

## 数值与结构门禁

- H50/M30 逐行精确等于冻结 LG01：通过。
- clip / fallback / nonfinite raw L20：0 / 0 / 0。
- L20 raw coverage：100.0000%；最终预测全部有限：是。
- HPSR01 历史结构对照的 clip / fallback / nonfinite / raw coverage：2 / 0 / 0 / 100.0000%。
- 没有训练新模型、调参、alpha 搜索、残差边界重估或结果后选模；评价只加载不可变冻结参数，并执行冻结公式的 origin-faithful 确定性重建。

## 冻结结果的报告修订

冻结私有结果的逐文件摘要与 43 行预测、43 行评价记录已经复核一致（`FROZEN_RESULT_PUBLIC_REPORTING_CORRECTION_APPLIED`）。历史结构对照的原始有限性应从冻结诊断字段 `cham01B3RawFinite` 读取；43 行均为有限值，因此 raw coverage 从冻结输出中的错误展示 0.0000% 校正为 100.0000%。这只是数值诊断展示修订：最终科学状态、评分指标、现金带指标和结果摘要均未改变；模型、科学评价与 bootstrap 均未重跑。

## 治理与停止

Draft PR #36 保持 Open / Draft / Unmerged。作品总额开发评价不等于 production、automation、release 或财务承诺。第二独立起点未执行，前瞻最终留出未打开；本任务到此停止。
