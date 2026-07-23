# M2 v2 Verifier Authority 与 Canonical Binding 合同 v0.3

状态：`PROPOSED_NOT_CURRENT`；public sanitized；`not_for_formal_decision`。本文件在 B0 冻结设计，不声明实现、private regeneration、exact-head CI、独立审查或 finding closure 已完成。v0.2 与全部历史 artifacts 保持 immutable；只有 B6 provider-free validation 和 atomic promotion 成功后，v0.3 才可成为 current candidate。

## Exact graph schema

Canonical graph 顶层、node、edge、physical mapping、selection decision、runtime consumer 与 public-report row 都使用 exact fields 并拒绝 unknown keys。Node ID、authority kind、cardinality、runtime stage、mapping policy、edge relation 和 edge cardinality 均有封闭 enum。每条 edge 的 `fromNodeId`/`toNodeId` 必须直接引用 declared node ID；禁止 `a+b`、selector fragment 或其他 pseudo endpoint。

Exact nodes 覆盖 immutable inputs、execution contract、request ledger、physical receipt envelopes、receipt index、safe cache、effective index、counter projection、event profile、derived evaluation、remediation summary、merge readiness、tracked core commitment、current restatement 和 current-state index。B5–B8 每个 runtime consumer 都列出 exact consumed node set，`fallbackAllowed=false`。每个 physical object/path identity 只可映射一个 node/role；unclassified mirror、hidden fallback、duplicate physical mapping 和 orphan 均拒绝。

Public report role set 精确为 remediation summary、merge readiness、current integrity restatement 与 current-state index；每个 role 在 canonical graph 中绑定唯一 repository-relative NFC/forward-slash/case-exact path、path identity 与 authority-independent semantic digest。前三个非 self role 还由 current-state index 的 `publicReportBindings` 绑定 byte digest。`current_state_index` 不要求不可能收敛的自身 byte-hash；它改由自身 `indexDigestSha256`、closed transaction member byte digest 与 canonical graph 的 authority-independent semantic mapping 三重绑定。

## Exact relations 与 selection

Completed ledger events、immutable receipt envelopes 和 receipt-index rows 按 physical request identity/digest 双向一一对应；每个 replayable success 恰有一个 safe-cache projection。Counter 只能由完整 ordered ledger replay 派生。Derived evaluation 分别绑定 exact immutable set、ledger、effective selection set 与 event profile，不使用 compound pseudo edge。

每个 logical request 恰有一个 selection decision：`SELECTED`、`EXPLICIT_BLOCKED` 或 `NO_REPLAYABLE_RECEIPT`。Candidate physical IDs 必须是 deterministic、unique、total order；selected ID 必须是 exact member，rank 与 membership/decision digest 必须一致。所有 non-effective completed receipt 仍保留在 receipt index，所有 non-effective replayable receipt 仍保留在 safe cache；禁止通过只保留 effective row 伪造闭包。

## Tracked anchor 与 current schemas

Tracked non-sensitive core commitment 的 exact fields 为 schema、graph version、role-registry digest、expected graph-core digest、source exact HEAD 与 supersession lineage。未来独立 B8 receipt 当前不存在，不得伪造。若 threat model 要抵抗同时改写 repository 与独立 evidence 的主体，需要另行 reviewer-controlled key；本合同不引入长期 key。

本合同实际定义 current-state index v0.3 与 integrity restatement v0.4 的 exact top-level fields、types、nested authority/supersession bindings、unknown-key rejection 和 digest basis。两者都保持 `PROPOSED_NOT_CURRENT` 到 B6。Current index 的 `publicReportBindings` 精确包含三个非 self public roles；`current_state_index` 的自身 byte binding 只存在于 closed atomic transaction，禁止构造递归 self-hash。Current decision 必须从 bound derived evaluation 重新计算 arithmetic inputs、semantic gates 与 threshold profile；字段值必须等于 recomputed decision。缺失计算输入时 `INDETERMINATE` 并 fail closed；historical decision 或 caller assertion 不得复制为 current。Supersession 必须绑定 predecessor path/digest 与新 transaction/promotion receipt，保留旧 artifact，禁止 OR fallback。

## Authorization boundary

完整边界固定为：`currentDecision=CANARY_FAIL`、`providerDispatchAuthorized=false`、`databaseConnectionsAuthorized=false`、`canaryAuthorized=false`、`full160Authorized=false`、`modelTrainingAuthorized=false`、`holdoutAccessAuthorized=false`、`independentReviewBatchB8Authorized=false`、`markReadyAuthorized=false`、`mergeAuthorized=false`、`releaseAuthorized=false`、`nextDevelopmentReadiness=NOT_AUTHORIZED`。
