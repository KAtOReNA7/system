# M2 v2 EventTime Clause/Span Binding 合同 v0.3

状态：`frozen_before_implementation`；public sanitized；`not_for_formal_decision`。

每个 temporal claim 必须包含 eventTime、precision、basis、sourceId、clause digest、date span 和 event keyword span。日期与 event keyword 必须位于同一 clause、明确语法/标点邻域，或由 structured value 直接支持。

多个事件/日期按 event family 匹配；无法唯一匹配时返回 null，禁止“取第一日期”。必测 publication→award、adaptation→release、多 edition 日期、rating/publication 日期、范围、无日期、不同精度，以及否定/计划/实际事件。

修复后只使用既有 immutable evidence 离线 restate，`providerRequestDelta=0`。
