# PR #7 B6 provider-free authority promotion v0.1

Status: `COMPLETE_PENDING_B8`; public sanitized; `not_for_formal_decision`.

B6 rebuilt the private review workbook deterministically from existing immutable/append-only inputs and verified it with the strict package-complete profile. The vNext workbook has SHA-256 `ecb1fee2223d4315b1d91c61a237adead57e87e03c59ced577d34d299182f982`, 53 review rows and 18 external-hyperlink target digest records. A second build was byte-identical. The historical workbook was not overwritten, and no visual-review attestation is claimed.

The provider-free recomputation retained the historical `CANARY_CONDITIONAL` execution separately and produced the current `CANARY_FAIL` restatement with evaluation digest `f4036bc67d4aa0b42460f7f5934bdee7221c233be536943239dfa11edf7f416c`. It reconstructed 29 physical receipt envelopes, one cache-hit observation and 118 request events; the replayed counters are planned 30, reserved/dispatched/completed 29 and cache hit 1.

The complete 14-role group was atomically promoted as transaction `recovery-f15e033dc333e86e836d638c5578289f61bf9838`. The pointer and transaction manifest select the same ID. Repeating the identical command returned `ALREADY_CURRENT_NOOP` without rewriting current state.

Local validation passed 24/24 S1 contract tests, 42/42 B6 canonical tests and 1181/1181 default tests with zero skips. `check:no-real-data`, lint, build and fixture smoke also passed. Clean-worktree exact-head S1 validation passed at `3e79ce654cd335129005d3916f25f5bf8a2bef7d`; CI run `30030360312` then passed on Linux job `89285146244` and Windows job `89285146296`.

During fail-closed validation, four compatibility defects were corrected in the canonical implementations: transaction-ID serialization had diverged between preview and recovery; a v0.3 authority-graph extension was incorrectly labeled as the exact v0.2 artifact-index shape; the V2B8 verifier read only the v0.3 restatement digest field; and the proposed current-index contract implied an impossible byte self-hash. The resulting contracts keep historical v0.2/v0.3 behavior exact while making B6 v0.3/v0.4 selection schema-specific.

All activity remained offline: `providerRequestDelta=0`, database connections 0 and actual external fetches 0. No Canary/full160, training, holdout, product-runtime change, historical-private overwrite, merge or release occurred. All 10 findings remain `OPEN`; the maximum implementation status is `CANDIDATE_CLOSED_PENDING_INDEPENDENT_REVIEW`. B7 full-registry regression and independent B8 review remain required.
