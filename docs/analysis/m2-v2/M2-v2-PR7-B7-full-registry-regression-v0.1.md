# PR #7 B7 full-registry regression v0.1

Status: `REGRESSION_COMPLETE_PENDING_EXACT_HEAD_CI`; public sanitized; `not_for_formal_decision`.

B7 replaces the prior registry-count-only claim with an executable identity proof. The canonical command is `npm run test:m2-v2:b7-full-regression`. It runs the nine test entrypoints covering authority, verifier read-only behavior, migration/archive/path identity, safe-cache migration, provider transport, event tuples and conflict applicability, workbook verification, and required-artifact/zero-skip policy.

The runner reads the frozen 89-case registry, accepts only passing test names containing exact registered case IDs, rejects missing, unexpected, out-of-platform, failed or skipped identities, and applies the native platform matrix. The frozen matrix contains 87 Linux cases and 88 Windows cases; their required union is all 89 cases.

The local Windows execution passed 88/88 applicable case identities across 161 passing tests with zero failures and zero skips. There were no missing, out-of-platform or unexpected case IDs. The repository validation also passed 24/24 S1 contract tests and 1182/1182 default tests with zero skips, plus `check:no-real-data`, lint, build and fixture smoke. Exact HEAD `4663fce6b656a7269bb624b9e2d74629bab999df` passed CI run `30032162656`: Linux job `89291086145` passed 87/87 native cases and Windows job `89291086079` passed 88/88.

The first independent B8 pass then found a canonical-routing defect and an evidence gap. The no-argument `m2:v2:v2b8:verify` command and current-authority reader still selected predecessor authority, although the B6 transaction passed when addressed explicitly. B1 also truthfully recorded that its formal claimable readonly proof was pending B6 graph population; B7 synthetic tests did not replace that proof. The correction makes the B6 pointer and v0.3/v0.4 authority the only canonical defaults, preserves legacy inputs for explicit historical replay, adds no-fallback tests, and provides a clean-exact-head command that executes the existing formal proof engine twice against the current graph. Canonical verifier and authority checks now pass locally. B7 remains pending the correction exact-head CI, formal proof, and repeated independent review.

The regression authorizes no provider, database, Canary/full160, model training, holdout or product-runtime action. All 10 findings remain `OPEN`, with maximum implementation status `CANDIDATE_CLOSED_PENDING_INDEPENDENT_REVIEW`. B8 is authorized but must be performed by an independent reviewer.
