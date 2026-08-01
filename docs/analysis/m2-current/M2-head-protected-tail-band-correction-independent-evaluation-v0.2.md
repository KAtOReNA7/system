# M2 LG01 头部保护尾段修正模型首次独立评价 v0.2

当前状态：**用户已明确把 outcome 打开前冻结的 positive base floor、q05 与 q95 定义为不可变冻结模型参数；当前等待私有参数完整性门禁，通过后继续唯一一次独立评价**（`M2_HPSR02_FROZEN_PARAMETER_AUTHORITY_DECIDED_PENDING_PRIVATE_INTEGRITY_GATE`）。

对象是 LG01 头部保护尾段修正模型 v0.2（LG01 Head-Protected Tail-Band Correction Model v0.2，`M2-WORK-HPSR02`），所属实验是 M2 LG01 头部保护尾段修正独立评价 v0.2（M2 LG01 Head-Protected Tail-Band Correction Independent Evaluation v0.2，`M2-EXP-LG01-HEAD-PROTECTED-TAIL-BAND-CORRECTION-02`）。同案例基线仍是冻结 LG01（`M2-WORK-LG01`）。

## 先前阻断检查点（完整保留）

先前检查点状态为因源权威不完整而阻断（`M2_HPSR02_BLOCKED_MISSING_SOURCE_AUTHORITY`）。当时只检查非金额元数据：2026-04 至 2026-06 月份齐全；2026-05 有 134 行、3 个未经确认的 canonical 渠道组合；组合分表比总表多 3 行。actual 金额单元格读取、候选运行、科学评价和 bootstrap 均为 0，未形成模型成绩。该检查点及原因继续作为历史审计记录，不改写。

## 范围感知来源权威复核

本次先检查评价关键字段的存在、精确相等性和金额符号，但没有汇总或打开 future outcome，没有公开金额值、作品身份、渠道身份或本机路径。

| 检查项 | 作品总额结论 |
| --- | --- |
| 权威账单窗口 | 2026-04、2026-05、2026-06 均存在；完整至 2026-06（`BILL_MONTH_WINDOW_COMPLETE`） |
| schema 与作品映射 | 均通过（`SCHEMA_VALID`、`WORK_MAPPING_VALID`） |
| 3 个未确认 canonical 渠道组合 | 134 行均有稳定原始来源身份，可判断起点发生性且非零重复风险为 0；只形成作品总额警告（`WORK_TOTAL_CANONICAL_MAPPING_WARNING_WORK_CHANNEL_REMAINS_PARTIAL`） |
| canonical 处理 | 没有猜测、反推或回填 canonical 映射；作品—渠道门禁继续 `PARTIAL_NOT_ACTIVE` |
| 总表/分表差异 | 分表确有 3 条总表不存在的 2026-05 非零事实，但对应作品均不在 2026-03 动态 Core80；本次作品总额相关差异为 0 行（`OUT_OF_WORK_TOTAL_SCOPE_FACT_DIFFERENCE_WARNING`） |
| 动态 Core80 范围核对 | 使用起点可见重述现金重算，共 43 部作品；没有读取 future outcome（`WORK_TOTAL_SCOPE_ASSESSMENT_COMPLETE`） |
| 可重建缓存 | 缺失但可从源权威与冻结代码自动重建（`CACHE_MISS_REBUILDABLE`） |
| 历史收据 | 缺失只告警，不阻断（`OPTIONAL_PROVENANCE_MISSING`） |

因此作品总额源权威可用（`SOURCE_AUTHORITY_AVAILABLE_FOR_WORK_TOTAL`）。这不表示作品—渠道门禁已激活，也不修复全账层面的 3 条差异；它只证明这些差异不会改变本次动态 Core80 的作品总额 actual、现金带或 R0/R2 同案例关系。

## 结果前工程失败与恢复

首次授权运行已经打开作品总额权威事实，但在构造预测、评分或 bootstrap 之前先后发生三次纯工程停止：第一次是请求起点与历史支持起点重复拼接（`m2_hpsr_rebuilt_work_case_duplicate`）；完成普通提交、精确提交 Linux/Windows CI 后继续同一次授权评价，第二次因历史冻结残差边界重建与当前作品总额评价错误共用了来源权威口径而停止（`hpsr02_residual_bound_rebuild_not_reconciled`）；再次完成提交与双平台 CI 后，第三次在历史全账渠道导出阶段被当前窗口 3 条范围外分表事实阻断（`m2_core_revenue_manual_command_failed:node.exe`；`HISTORICAL_GLOBAL_CHANNEL_EXPORT_BLOCKED_BY_THREE_CURRENT_WINDOW_OUT_OF_SCOPE_SPLIT_FACTS`）。三次尝试的候选预测、科学评价、bootstrap 和完整合法结果仍均为 0；receipt 状态均为结果前工程失败、可恢复（`INVALIDATED_PRE_RESULT_ENGINEERING_FAILURE_RECOVERY_ALLOWED`），没有冻结科学结果。

三次工程恢复均没有形成候选预测或模型结果。随后在新的精确提交 Linux/Windows CI 通过后，单独执行了不产生候选预测、评分或 bootstrap 的冻结边界复核。该复核把当前权威源限制到原开发最大可见截止月 2026-02，仍无法复现公开冻结 provenance 的 577 行输入门禁（`hpsr02_residual_bound_rebuild_not_reconciled`）。

## 冻结边界来源冲突与人工决策

只读多重集比较证明：截至 2026-02，旧冻结来源与当前来源的作品×月份行数和金额总额完全一致，但渠道行级拆分并不一致；两侧各有 732 行差异，涉及 421 部作品、82 个月、21 个渠道身份和 721 个作品×月份组合。由于当前模型人口要求起点时已有成熟来源渠道，这种拆分变化会影响冻结 HPSR01 边界的重建，不能再归类为只影响展示或只影响非活动作品—渠道评价的警告。

当前任务禁止重估 residual bound，也禁止把旧电脑派生缓存或历史 receipt 自动当成源权威，因此不能用结果导向方式选择旧或新拆分。已在 Git ignored private 目录生成一项中文决策表（`M2-hpsr02-source-authority-decision-table-private-v0.2.json`）；公开报告不包含原始身份、金额、digest 或本机路径。推荐提供与冻结谱系匹配的原分成权威账单快照；若无法提供，则需要在新任务中明确决定是否升格现存冻结事实为该谱系的私有源权威，或终止 HPSR02。

## 执行前冻结边界

- origin：2026-03；horizon：3 个月；actual window：2026-04 至 2026-06；
- H50/M30 逐行精确使用冻结 LG01；L20 使用 HPSR01 已冻结的有界残差修正；`alpha=1`；
- 不训练新模型、不调参、不搜索 alpha、不重估 residual bound、不选模；
- 不读取 2026-07 以后 actual，不打开 2026-06 前瞻最终留出，不执行第二起点或 HPSR03；
- actual outcome 已在结果前工程尝试中打开；候选预测、科学评价、bootstrap 和完整结果仍为 0；
- 首次独立评价当前由冻结边界来源冲突阻断；未获得明确来源决策前不得继续。

候选预测、科学评价、bootstrap 和完整合法结果均为 0；活动候选与自动化批准保持 `null`，生产就绪为 `false`，前瞻最终留出未打开，作品—渠道门禁保持 `PARTIAL_NOT_ACTIVE`。Draft PR 保持 Open / Draft / Unmerged。机器可读同源状态见 `M2-head-protected-tail-band-correction-independent-evaluation-v0.2.json`。

## 2026-08-01 参数权威修订（当前）

上述“等待来源权威决策”的第二个阻断检查点（`M2_HPSR02_BLOCKED_ACTIONABLE_SOURCE_AUTHORITY_DECISION_REQUIRED`）继续作为历史审计记录，不删除、不改写；本节记录用户随后作出的范围更窄决定：

- 当前人工复核分成账单仍是 2026-03 起点可见输入和 2026-04 至 2026-06 作品总额 actual 的源权威（Source Authority，`SOURCE_AUTHORITY`）。
- outcome 打开前已经冻结的 positive base floor、q05 与 q95 是 HPSR01/HPSR02 不可变冻结模型参数（Immutable Frozen Model Parameter，`IMMUTABLE_FROZEN_MODEL_PARAMETER`），推断时直接加载，不要求从当前账单重新生成。
- 旧 577 行摘要绑定输入只承担参数谱系快照（Parameter Lineage Snapshot，`PARAMETER_LINEAGE_SNAPSHOT`）与确定性恢复作用；它不替换当前 actual，也不升格为全项目原始账单权威。
- 参数文件缺失时只允许执行摘要绑定谱系的冻结参数恢复（`FROZEN_PARAMETER_RECONSTRUCTION_FROM_DIGEST_BOUND_LINEAGE_SNAPSHOT`）；这不是训练、调参或边界重估。
- 截至 2026-02 的作品×月份行数和金额守恒、渠道行级两侧各 732 行差异登记为 `HISTORICAL_CHANNEL_LINEAGE_DRIFT_WITH_WORK_MONTH_CASH_CONSERVED`。它构成冻结模型迁移限制，但不重新阻断作品总额评价。
- 独立 outcome 已经打开、三个结果前工程失败均保留；在参数门禁前仍不产生候选预测、评分或 bootstrap。参数门禁通过后，本任务已获明确授权继续唯一一次首个独立评价。

此修订不激活作品—渠道门禁，不授权第二独立起点、前瞻最终留出、HPSR03、production、automation 或 release。
