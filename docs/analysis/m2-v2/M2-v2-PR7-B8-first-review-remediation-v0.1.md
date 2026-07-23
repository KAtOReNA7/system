# PR #7 B8 first-review remediation v0.1

## Result

The first independent B8 review of exact HEAD `4663fce6b656a7269bb624b9e2d74629bab999df` returned `B8_FAIL_REMEDIATION_REQUIRED`. It found no P0, one canonical-routing P1, and one evidence gap for existing finding `PR7-P2-009`. No finding was changed from `OPEN` to `CLOSED`.

The canonical no-argument V2-B.8 verifier selected the superseded legacy private binding, while the B6 current transaction passed when addressed explicitly. The no-argument current-authority reader likewise selected the v0.2/v0.3 predecessor pair. Separately, the B1 status correctly recorded that a formal claimable readonly proof could not run before B6 graph population; B7's synthetic tests did not replace that proof.

## Implemented correction

- The B6 current pointer is now the canonical default closed binding. The predecessor binding remains available only through an explicit historical path.
- The no-argument authority reader now selects the v0.3 index and v0.4 restatement, reads the canonical graph from the digest-bound B6 transaction member, verifies the tracked core commitment and public report bindings, and fails closed rather than falling back to legacy authority.
- `npm run m2:v2:pr7:b8:readonly-proof` prepares an ignored, versioned proof attempt from the current B6 graph and executes the existing formal proof engine. The proof requires two canonical V2-B.8 verifier invocations, three host-native snapshots, `claimable=true`, zero issues, `providerRequestDelta=0`, and `databaseConnectionDelta=0`. Its detailed artifact remains Git ignored.
- Positive current-selection and negative legacy-only fallback tests cover both the V2-B.8 verifier and the current-authority reader.

The correction has passed focused local tests and canonical current verification. A clean exact-head execution of the formal proof, full repository validation, Linux/Windows exact-head CI, and repeated independent B8 review remain required before any finding may close.

## Boundaries

The current decision remains `CANARY_FAIL`. Provider, database, Canary/full160, model training, holdout, mark-ready, merge, release, and M3 formal actions were not performed or authorized. `nextDevelopmentReadiness=NOT_AUTHORIZED`.
