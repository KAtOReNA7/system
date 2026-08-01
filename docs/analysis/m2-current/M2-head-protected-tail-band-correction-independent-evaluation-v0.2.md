# M2 LG01 头部保护尾段修正模型首次独立评价 v0.2

当前状态：**作品总额来源权威已复核；首次授权运行发生结果前工程故障，恢复已获授权且尚未形成完整结果**（`M2_HPSR02_PRE_RESULT_ENGINEERING_FAILURE_RECOVERY_AUTHORIZED`）。

对象是 LG01 头部保护尾段修正模型 v0.2（LG01 Head-Protected Tail-Band Correction Model v0.2，`M2-WORK-HPSR02`），所属实验是 M2 LG01 头部保护分段路由与独立后期起点验证 v0.1（M2 LG01 Head-Protected Segmented Router and Independent Later-Origin Validation v0.1，`M2-EXP-LG01-HEAD-PROTECTED-SEGMENTED-ROUTER-01`）。同案例基线仍是冻结 LG01（`M2-WORK-LG01`）。

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

首次授权运行已经打开作品总额权威事实，但在构造预测、评分或 bootstrap 之前先后发生两次纯工程停止：第一次是请求起点与历史支持起点重复拼接（`m2_hpsr_rebuilt_work_case_duplicate`）；完成普通提交、精确提交 Linux/Windows CI 后继续同一次授权评价，第二次因历史冻结残差边界重建与当前作品总额评价错误共用了来源权威口径而停止（`hpsr02_residual_bound_rebuild_not_reconciled`）。两次尝试的候选预测、科学评价、bootstrap 和完整合法结果仍均为 0；receipt 状态均为结果前工程失败、可恢复（`INVALIDATED_PRE_RESULT_ENGINEERING_FAILURE_RECOVERY_ALLOWED`），没有冻结科学结果。

恢复先排除历史支持集合中已由请求集合显式物化的重复起点，再把 HPSR01 历史冻结残差边界重建固定在原渠道权威口径（`CANONICAL_WORK_CHANNEL_AUTHORITY`），只让 2026-03 当前评价人口使用作品总额范围感知权威口径（`HPSR02_WORK_TOTAL_SCOPE_AWARE_AUTHORITY`）。模型、人口、actual、现金带、基线、门限和评价规则均不改变。按照预注册边界，本次修复仍须先普通提交并通过新的精确提交 Linux/Windows CI，之后才允许继续同一首次独立评价；这不是第二次科学运行。

## 执行前冻结边界

- origin：2026-03；horizon：3 个月；actual window：2026-04 至 2026-06；
- H50/M30 逐行精确使用冻结 LG01；L20 使用 HPSR01 已冻结的有界残差修正；`alpha=1`；
- 不训练新模型、不调参、不搜索 alpha、不重估 residual bound、不选模；
- 不读取 2026-07 以后 actual，不打开 2026-06 前瞻最终留出，不执行第二起点或 HPSR03；
- actual outcome 已在结果前工程尝试中打开；候选预测、科学评价、bootstrap 和完整结果仍为 0；
- 先提交工程恢复修订并通过新的 exact-head Linux/Windows CI，再继续同一首次独立评价。

活动候选与自动化批准保持 `null`，生产就绪为 `false`，Draft PR 保持 Open / Draft / Unmerged。机器可读同源状态见 `M2-head-protected-tail-band-correction-independent-evaluation-v0.2.json`。
