# M2 v2 Integrity Remediation Pre-registration v0.1

Status: `frozen_before_implementation` on 2026-07-18.

This pre-registration freezes the repair scope before production code or current private state is changed. The starting branch is `codex/m2-v2-evidence-pilot-v1`; starting HEAD is `cc15b134ae9b309081926940a530d0a1f0a13ddc`, based on `d81b952e37dd43365c0091cdd6665e69d8d39a7e`. PR #7 is Draft/open and is not authorized to merge.

## Starting audit

The prior audit covered 1555/1555 tracked files. It reported P0/P1/P2/P3 = 0/13/21/6, `auditCompletenessDecision=PASS`, `projectIntegrityDecision=FAIL`, `instructionDriftDecision=MATERIAL_DRIFT_REMEDIABLE`, pre-audit `metricIntegrityDecision=PASS`, current `privateStateIntegrityDecision=FAIL`, `pr7MergeReadiness=NOT_READY_REMEDIATION_REQUIRED`, and `nextDevelopmentReadiness=NOT_AUTHORIZED`.

Before any repair, the affected private state is preserved in a read-only, Git-ignored forensic backup with a per-file SHA-256 manifest. The implementation then makes the B5-B8 verifiers read-only and idempotent; separates immutable receipt payloads from runtime views; repairs runtime-only stale receipt digests; atomically binds state, cache, receipts, request ledger, and counters; repairs the five identified B8 contract gaps; and rebuilds only derived private state from authoritative offline inputs.

## Frozen baseline to reproduce

- Search: 26/27 successful (96.2963%), 10/10 works, 88 Source Records.
- Entity resolution: 9 resolved, 1 unresolved.
- Evidence: 85 candidates, 52 accepted, 33 rejected, 48% accepted-evidence coverage.
- Citation alignment: 230/230 before repair and 226/226 after repair.
- Temporal completeness: 32/32.
- Agreement: source overlap 0.345079, same-source claim agreement 0.673333, fresh claim agreement 0.2.
- Decision: `CANARY_CONDITIONAL`; `full160Authorized=false`.

The old-contract metrics must be exactly reproduced before a versioned restatement is computed. Historical reports are never silently overwritten; every contract-driven difference is explained.

## Frozen B8 repairs

The implementation will make a required zero-denominator gate `NOT_EVALUABLE` with `passed=false`; require positive evidence for source classification; enforce category as well as domain diversity; derive event time only from a claim's supporting source and supporting span while retaining source, span digest, basis, and precision; and audit all declared conflict families.

## Boundaries and commit plan

No provider request, Canary execution, full160, model training, sample replacement, counter reset, holdout access, release, merge, or next development phase is authorized. The provider request delta for this task is frozen at zero.

The two planned commits are:

1. `chore(m2-v2): freeze integrity remediation contracts`
2. `fix(m2-v2): make verifiers read-only and recover private state`
