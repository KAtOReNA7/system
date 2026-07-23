# PR #7 B7 full-registry regression v0.1

Status: `REGRESSION_COMPLETE_PENDING_EXACT_HEAD_CI`; public sanitized; `not_for_formal_decision`.

B7 replaces the prior registry-count-only claim with an executable identity proof. The canonical command is `npm run test:m2-v2:b7-full-regression`. It runs the nine test entrypoints covering authority, verifier read-only behavior, migration/archive/path identity, safe-cache migration, provider transport, event tuples and conflict applicability, workbook verification, and required-artifact/zero-skip policy.

The runner reads the frozen 89-case registry, accepts only passing test names containing exact registered case IDs, rejects missing, unexpected, out-of-platform, failed or skipped identities, and applies the native platform matrix. The frozen matrix contains 87 Linux cases and 88 Windows cases; their required union is all 89 cases.

The local Windows execution passed 88/88 applicable case identities across 161 passing tests with zero failures and zero skips. There were no missing, out-of-platform or unexpected case IDs. The repository validation also passed 24/24 S1 contract tests and 1182/1182 default tests with zero skips, plus `check:no-real-data`, lint, build and fixture smoke. The exact-head Linux/Windows CI checkpoint remains pending until the clean B7 commit is pushed.

The regression authorizes no provider, database, Canary/full160, model training, holdout or product-runtime action. All 10 findings remain `OPEN`, with maximum implementation status `CANDIDATE_CLOSED_PENDING_INDEPENDENT_REVIEW`. B8 is authorized but must be performed by an independent reviewer.
