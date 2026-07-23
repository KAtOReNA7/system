# M2 v2 Append-only Request Event Ledger 合同 v0.1

状态：`IMPLEMENTED_AND_SYNTHETICALLY_VERIFIED`；public sanitized；`not_for_formal_decision`。

实现范围：append-only chain、replay counter 与 no-rollback 边界已由 synthetic tests 验证。本合同不声称真实 private migration、exact-head CI 或 public restatement 已完成；`full160Authorized=false`，`nextDevelopmentReadiness=NOT_AUTHORIZED`。

每个 request event 包含 eventId、sequence、timestamp、provider/stage、logical/physical key、eventType、request/receipt digest、previousEventDigest 和 eventDigest。事件至少覆盖 planned、reserved、dispatched、completed、indeterminate、cache-hit observed 与 compatibility retry reserved。

Sequence 严格单调，digest chain 必须连续；已 reserved 预算不得回滚，reservation 不得删除，cache hit 必须追加事件，crash 后 indeterminate 必须保留。Counter 只能由 ledger replay 导出，bound state counter 必须与 replay 一致。

Legacy migration 只使用既有 request/receipt 材料，不伪造 provider response、不清零 counter、不删除 indeterminate，并保留旧 snapshot 为 historical。Crash、duplicate、cache hit、retry、indeterminate、no rollback、replay、chain tamper 与 monotonic counter 均为必测项。
