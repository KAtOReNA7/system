# M2 v2 Request/State Atomic Binding Contract v0.1

Status: `frozen_before_remediation`.

This contract binds request state, cache references, immutable receipts, the append-only request ledger, counters, and a committed state transaction.

## Receipt envelope v0.2

`receipt-envelope-v0.2` separates an immutable provider payload from a runtime view. The immutable payload carries request identity and request/response digests, provider outcome, optional provider request identity, usage, and its original creation time. Its canonical bytes alone define the receipt digest.

`cacheHit`, `readAt`, and `selectedAsEffective` belong only to `runtimeView`. A cache hit returns the immutable `receiptRef` plus a runtime view; it does not copy and modify a receipt, rewrite the payload, or change the receipt digest. Cache entries reference receipt digests rather than embedding mutable receipt variants. Legacy receipts remain auditable.

Migration is automatic only when the proven difference is limited to runtime-view fields. Each migration records the old and new digests, reason, immutable-payload digest, removed runtime fields, migration time, and migration version. Any provider payload, response, source, or metric difference stops recovery and raises an integrity finding.

## Ledger and counters

The request ledger is append-only. Planned, reserved, dispatched, completed, indeterminate, provider-failed, contract-failed, and cache-hit counters are recomputed from or reconciled bidirectionally against that ledger. A cumulative number in state is never the sole authority. Reserved budget and indeterminate attempts are not erased during recovery.

## Atomic transaction

A committed transaction manifest binds the state, cache index, receipt index, request ledger, counters, and immutable manifest references by digest. Members are written to temporary files, flushed and closed, verified, atomically renamed, and only then referenced by the transaction manifest committed last.

If any step fails, the previous transaction remains current, the partial transaction is ineligible, the request ledger retains indeterminate work, and counters are not reset. Verification requires every member digest and manifest binding, counter/ledger parity, cache/receipt-reference parity, and no provider access.
