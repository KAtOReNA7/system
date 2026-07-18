# M2 v2 Group-atomic Private Recovery 合同 v0.2

状态：`frozen_before_implementation`；public sanitized；`not_for_formal_decision`。

Recovery source 仅限 immutable manifests、append-only provider receipts、Source Records、evidence records、request event ledger 和 frozen execution contracts；public 报告不得作为恢复源。

Staging 必须先形成 exact role set，重算全部 digest，真实执行 gates，验证 transaction binding 与 stage verifier，并确认 provider delta=0、Git tracking 和 env 目标安全。随后先备份 current，再在可回滚事务中组级提升；任何失败都必须恢复原 current，partial state 永不成为 current。

首次执行必须成功，相同输入第二次必须 verified no-op，counter delta=0。每个 staging gate、promotion step、binding/receipt write 与 rollback 都需要故障注入证明。
