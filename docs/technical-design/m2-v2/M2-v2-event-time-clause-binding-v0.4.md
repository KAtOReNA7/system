# M2 v2 Canonical Event Tuple 与 Conflict Identity 合同 v0.4

状态：`PROPOSED_NOT_CURRENT`；public sanitized；`not_for_formal_decision`。本文件冻结 B4 设计，不声明实现、current metrics/restatement、exact-head CI、独立审查或 finding closure 已完成。v0.3 历史合同 immutable；evaluation/restatement v0.4 在 B6 前只可为 candidate。

## Exact event-local tuple

Tuple、span、predicate、identity、event date、ambiguity 与 limitation 都使用 exact fields/types/enums/nullability 并拒绝 unknown keys。Predicate 只含 canonical event family/kind；stage 与 status **只**位于 tuple top level，禁止 predicate 内重复，消除双重 authority。Tracked fixtures 不保存 raw private support text/identity。

Sentence/clause/predicate/date span 使用同一 source document 的 Unicode-code-point half-open offset，predicate 与 non-null date 必须位于 clause，clause 必须位于 sentence，source/span digest 全部重算。当前合同不编码 bounded cross-sentence relation，因此 cross-sentence input 一律 `UNSUPPORTED_FAIL_CLOSED`，不能借同句或跨句另一个 event 的 date。

`eventDate` 精确包含 value、interval start/end、precision 与 timezone basis。YEAR/MONTH/DAY 使用无 timezone 的 half-open calendar bounds；INSTANT 必须是带 `Z`/explicit offset 的 RFC3339 且 value/start/end 相等；INTERVAL 必须 start ≤ end；UNKNOWN 的 value/bounds 均 null。禁止推断 timezone。No/ambiguous date 为 `NOT_EVALUABLE`，禁止 first-date fallback。

Event role、date role、stage、status、identity status、ambiguity codes 和 limitation code/severity 都是封闭 enum。KNOWN identity 必须有 SHA-256，其他 identity status 必须为 null digest。Ambiguity 与 evaluable 必须一致。

## Stage/time precedence 与 conflict

Stage progression table 显式定义 publication、award、production 和 release 的 valid forward 与 invalid reverse pairs；相同 known stage 要求时间区间 overlap，unlisted/unknown pair 为 `NOT_EVALUABLE`。Planned ≠ actual、nominated ≠ won、published ≠ awarded。

Conflict decision table 以固定 priority first-match：different subject → separate scope；missing family/stage 或 required identity → not evaluable；different production/edition → no conflict；same identity/stage overlap → consistent；same stage disjoint → true conflict；valid stage/time progression → no conflict；invalid reverse/time order → true conflict；unsupported relation → not evaluable。Missing/ambiguous identity 永不自动变成 conflict。

`m2.v2.event-evaluation-private.v0.4` 在本合同内实际定义 exact fields/types/enums：tuple digests、decision/conflict/family-pass、reason/matched rule、identity/stage/time comparisons 与 evaluation digest。Nested comparison objects同样 exact，输出 decision/conflict/family-pass 必须与 matched rule 完全相等。Restatement v0.4 必须绑定 evaluation-set 与 event-contract digests；B6 前不能假定 current result。

## Authorization boundary

完整边界固定为：`currentDecision=CANARY_FAIL`、`providerDispatchAuthorized=false`、`databaseConnectionsAuthorized=false`、`canaryAuthorized=false`、`full160Authorized=false`、`modelTrainingAuthorized=false`、`holdoutAccessAuthorized=false`、`independentReviewBatchB8Authorized=false`、`markReadyAuthorized=false`、`mergeAuthorized=false`、`releaseAuthorized=false`、`nextDevelopmentReadiness=NOT_AUTHORIZED`。
