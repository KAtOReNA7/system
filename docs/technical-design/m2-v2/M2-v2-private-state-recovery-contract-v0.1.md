# M2 v2 Private State Recovery Contract v0.1

Status: `frozen_before_remediation`.

This contract governs offline recovery of the V2-B private derived state after verifier-induced mutation. It does not authorize a provider call, Canary execution, full160, model training, a sample change, a request-counter reset, holdout access, release, or the next development phase.

## Evidence classes

Every relevant private artifact is classified as one of: `authoritative_immutable`, `authoritative_append_only`, `derived_rebuildable`, `derived_corrupted`, `audit_only`, or `secret_excluded`.

Before a recovery write, all in-scope private artifacts are copied to a Git-ignored, read-only forensic backup. Relative paths, sizes, and SHA-256 digests are recorded in an immutable backup manifest. Local environment files and credentials are excluded.

## Authoritative inputs and outputs

Recovery may consume only frozen immutable manifests, append-only provider receipts, Source Records, evidence records, the request ledger, frozen public contracts, and the prior integrity audit. It may not obtain new search or extraction results or trust an unverified derived state.

The rebuild may produce derived state, cache and effective-receipt indexes, a counter projection reconciled to the append-only ledger, decision projections, transaction bindings, a versioned restatement, and recovery receipts. All outputs are built in isolated staging and are not current until every gate passes.

## Commit, idempotency, and rollback

The recovery must preserve immutable manifests, append-only receipts, request history, the forensic backup, historical reports, and migration evidence. It must exactly reproduce the frozen baseline metrics and independently compute any restated metrics under the repaired contracts.

Only after every digest, ledger, metric, binding, synthetic-verifier, and staging-verifier gate passes may the recovered state become current through an atomic rename. The previous current state remains recoverable. A failure retains the previous current state and quarantines the partial staging output; it never promotes a partial state or deletes audit evidence.

Given the same authoritative inputs and contract versions, recovery must produce identical governed output hashes. A second recovery changes no governed state.
