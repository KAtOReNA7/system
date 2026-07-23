# M2 v2 Conflict Applicability 合同 v0.3

状态：`IMPLEMENTED_AND_SYNTHETICALLY_VERIFIED`；public sanitized；`not_for_formal_decision`。

实现范围：applicability/execution、本地独立检测、空输入 fail-closed 与 edition-aware adversarial cases 已由 synthetic tests 验证。本合同不声称真实 private migration、exact-head CI 或 public restatement 已完成；`full160Authorized=false`，`nextDevelopmentReadiness=NOT_AUTHORIZED`。

每个 conflict family 都必须输出 applicable、executed、evidenceCount、conflictCount、unresolvedCount 和 passed。只有存在相关 claims 才 applicable；空输入为 0 applicable、coverage=`NOT_EVALUABLE`，Gate 要求 coverage 时必须 fail closed，不能自然得到 9/9。

检测不得信任模型 contradictionKey，必须按本地 canonical entity/event/value 检测 identity、platform、completion、publication edition、adaptation、rating、award 与 mutually-exclusive status。

不同 edition/format/date 不自动冲突；必须记录 edition relation 与 limitation，无法区分时标为 unresolved。跨日期/阶段的 adaptation adversarial fixtures 必须避免假阳性。
