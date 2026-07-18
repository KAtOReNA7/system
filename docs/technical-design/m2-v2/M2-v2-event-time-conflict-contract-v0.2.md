# M2 v2 Event Time / Conflict 合同 v0.2

- 时间精度：day、month、year、range、unknown。
- 明确日期文本提取率必须 100%；不虚构月日。任何 required gate 的分母为 0 时，结果必须为 `NOT_EVALUABLE` 且 `passed=false`，不得把空集当作 100%。
- EventTime 只能来自该 claim 的 supporting source 与同一 supporting clause/span；EventTime 非空时必须保留 sourceId、clause digest、date span、event-keyword span、basis 与 precision。无法唯一绑定时返回 null，禁止首日期 fallback。
- 对 work/author identity、original platform、completion、publication/publisher/date/edition/format、adaptation type/stage/date、rating platform/scale/value、award event 与 mutually-exclusive status 全部声明 family 做审计。
- Conflict applicability/execution 必须从本地 canonical claims 推导；只有 applicable 且 executed 的 family 可计为 covered。空输入为 `NOT_EVALUABLE`/fail-closed，不信任模型 contradiction key。
- 多 edition 不自动判冲突；unresolved conflict 不可 pilotUsable。
- full160Authorized：false
