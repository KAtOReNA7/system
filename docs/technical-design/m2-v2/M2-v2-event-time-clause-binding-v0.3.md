# M2 v2 EventTime Clause/Span Binding 合同 v0.3

状态：`IMPLEMENTED_AND_SYNTHETICALLY_VERIFIED`；public sanitized；`not_for_formal_decision`。

实现范围：clause/span/event-family binding、歧义返回 null 与多事件 adversarial cases 已由 synthetic tests 验证。本合同不声称真实 private migration、exact-head CI 或 public restatement 已完成；`full160Authorized=false`，`nextDevelopmentReadiness=NOT_AUTHORIZED`。

每个 temporal claim 必须包含 eventTime、precision、basis、sourceId、clause digest、date span 和 event keyword span。日期与 event keyword 必须位于同一 clause、明确语法/标点邻域，或由 structured value 直接支持。

多个事件/日期按 event family 匹配；无法唯一匹配时返回 null，禁止“取第一日期”。必测 publication→award、adaptation→release、多 edition 日期、rating/publication 日期、范围、无日期、不同精度，以及否定/计划/实际事件。

修复后只使用既有 immutable evidence 离线 restate，`providerRequestDelta=0`。
