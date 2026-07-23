# M2 v2 Verifier Read-only Contract v0.1

Status: `frozen_before_remediation`.

This contract freezes the behavior of the V2-B.5, V2-B.6, V2-B.7, and V2-B.8 verifier commands before implementation changes. A verifier reads an already materialized state and returns a deterministic verdict. It does not build, freeze, repair, resume, report, or persist that state.

## Command boundary

The `verify`, `report`, and `run`/`resume` responsibilities are separate entry points. Default verification may read files, use memory, print a result, and set an exit code. It may not create, modify, delete, rename, or retimestamp any file; mutate a manifest, receipt, cache, request ledger, counter, decision artifact, or workbook input; call a provider; or invoke another mutating command.

If a durable verification receipt is required, it must be created by a separate explicit command. That command may write only to the `integrity_audit_receipt` role. Audit receipts are not part of the governed-state hash used to prove verifier read-only behavior.

## Determinism and proof

Verification is independent of wall-clock time, randomness, and network state. Identical inputs must produce identical stdout and exit status.

The proof snapshots every existing file in the governed private roles using repository-relative forward-slash paths, byte sizes, and SHA-256 digests. It records a snapshot before verification, after the first execution, and after the second execution. Passing requires identical aggregate digests and identical member manifests across all three snapshots.

The governed roles include immutable manifests, append-only receipts, Source Records, evidence records, derived state, cache and effective-receipt indexes, request ledgers and counters, decisions, and review-workbook inputs.

Any malformed, incomplete, or inconsistent input fails closed without writing.
