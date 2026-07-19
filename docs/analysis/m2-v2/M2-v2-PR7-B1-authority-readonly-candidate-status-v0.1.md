# PR #7 B1 authority / readonly candidate status v0.1

## Result

B1 has an implementation candidate for `PR7-P1-003` and its directly coupled `PR7-P2-009`. Both findings remain `OPEN`. The maximum status is `IMPLEMENTED_NOT_CLOSED_PENDING_B7_AND_INDEPENDENT_REVIEW`; neither vNext contract is current authority.

The implementation evidence head is `29d3f3f871c0e5fedc995f33f9e64ffd61deae44`. The canonical authority source first entered tracked history at `350ecbd434831a517d97ef7f15ea3e4f9f34bf72`.

## Tracked core commitment

The tracked commitment is `docs/analysis/m2-v2/M2-v2-PR7-core-commitment-v0.1.json`, byte SHA-256 `f1d8a52250296f044e894a63caeff4e1625b244f36c7279875bfe61322899d26`.

- graph schema: `m2.v2.canonical-authority-graph.v0.3`
- role-registry digest: `4d2e31ce31b207ab952ca0bea754424bfcecd8ecd8682933bf6cd45293a46a4c`
- static graph-core digest: `0ab337288066343cb7ceae7804847c84b334ae5e8249a3717a6140801969c190`
- predecessor authority contract digest: `080994f6ec8c8a4d236be09873de206ed9f452225df6190e27bb3e366e13e120`

The graph-core digest covers only `schema`, `nodes`, `edges`, `runtimeConsumers`, `publicReportRegistry`, and `runtimePopulationRules`. Runtime mappings, selection decisions, and the runtime graph digest are intentionally excluded from this non-self-referential commitment.

## Case and validation evidence

The B1 registry contains 18 cases: nine for each finding. All 18 are registered for the default profile, Linux, Windows, and a secondary verifier; unexpected/default skips are zero. The two Windows-alias repair regressions are auxiliary proof-engine tests and do not alter the registered finding-case count.

Exact implementation-head local evidence obtained before this candidate record:

- focused B1 suite: 45/45 passed, zero skip/todo;
- default pretest: 50/50 passed, zero skip/todo;
- default main test: 1113/1113 passed, zero skip/todo;
- lint and build: 273 JavaScript files passed each;
- no-real-data guard: 1697 paths passed;
- secret guard: 7/7 passed;
- smoke: fixture mode, `realDataImported=false`, `formalDatabaseConnected=false`;
- independent readonly quality gate: `READY`; the Windows root-canonicalization repair does not relax containment, reparse, or identity-alias checks and preserves injected-observer lexical-root semantics.

The earlier expanded verifier/domain run passed 145/145 at `b65f379d5ec7b11660bd54f5529eec5d720d0c4c`. Its exact command and file scope were not recorded and cannot be uniquely reconstructed from tracked or private evidence, so it is retained only as historical evidence and is not promoted to exact-head evidence. The known focused and default commands above were rerun against the exact implementation bytes.

No provider request or database connection occurred. Provider request delta and database connection count remain zero.

## Checkpoint CI history

The first B1 checkpoint candidate at `07b92ac1155d643df5a25387f1e32ff22f0fa6c3` ran as GitHub Actions run `29691288926`. Linux job `88204375867` succeeded. Windows job `88204375873` failed because the native collector expanded a system-temp short path to its long-path identity before a lexical containment check, producing a false `scope member escapes repository root` result.

That failed run is not a completed checkpoint. The fail-closed repair is tracked at `29d3f3f871c0e5fedc995f33f9e64ffd61deae44`; final B1 checkpoint status remains pending until this candidate record is ordinary-pushed and both Linux and Windows CI succeed on that new exact remote HEAD.

## Deliberate non-claims

The formal claimable readonly proof is not recorded in this candidate document. Its loader requires the core commitment and every control/source byte to exist at the tracked HEAD, and the canonical graph additionally requires four graph-bound vNext public authority paths. Those public paths are intentionally not populated before the separately gated B6 offline regeneration and atomic promotion. B1 must not create placeholders, substitute predecessor paths, or claim a smaller scope.

B6 private offline rebuild and atomic promotion are `NOT_RUN`; B7 is `NOT_RUN`; B8 is `NOT_AUTHORIZED_NOT_RUN`; independent closure review is `NOT_RUN`. No current-authority activation, Canary, full160, model training, holdout opening, mark-ready, PR merge, or release is claimed or authorized.
