# PR #7 B4 event tuple remediation checkpoint

## Outcome

B4 implements the candidate remediation for `PR7-P1-009` and `PR7-P2-013` in the existing canonical `v2b8Stability.js`; it does not add a parallel runtime. Both findings remain `OPEN`, with candidate status `CANDIDATE_CLOSED_PENDING_INDEPENDENT_REVIEW`. B8 independent review was not performed.

Event dates now bind to the nearest event-local predicate before they may satisfy a claim. A publication date cannot satisfy an award claim merely because both occur in one coordinated clause; planned/actual and nominated/won ambiguity fail closed; an unbound structured date remains null. The result carries a stable sanitized failure reason without persisting source text.

The candidate v0.4 tuple builder and validator reject unknown fields, bind Unicode-code-point spans and source bytes by SHA-256, enforce exact stage/status/role compatibility, and verify event-date intervals. The conflict evaluator follows the frozen ten-rule priority table: different subjects are separate scope; missing identity is not evaluable; distinct production/edition identities do not conflict; same identity/stage with disjoint time intervals conflicts; valid progression passes; invalid stage/time order conflicts.

## Coverage and boundary

- Frozen B4 planning cases: 16/16 passed; canonical B4 command: 52/52 passed; skips: 0.
- Default `npm test` pretest and both CI jobs execute `npm run test:m2-v2:b4-event-tuple`.
- B4 entry checkpoint `1107c2a15a39e1b035022c0810e296ff493f3e01`: run `30020602325`; Linux job `89251992130` and Windows job `89251992368` succeeded.
- B4 implementation checkpoint `65bee39e012e013d4e4347076fc24757f7bcc9f9`: run `30021984333`; Linux job `89256777608` and Windows job `89256777664` succeeded.
- This tracked integration commit remains bound to its own exact-head CI receipt; it does not change the verified implementation.
- `providerCalls=0`, `providerRequestDelta=0`, `actualExternalFetchCount=0`, `databaseConnections=0`.
- No provider, database, Canary/full160, model training, holdout, B8, mark-ready, merge, release, or B5 work is authorized.
- `currentDecision=CANARY_FAIL`, `full160Authorized=false`, `modelTrainingAuthorized=false`, `mergeAuthorized=false`, `nextDevelopmentReadiness=NOT_AUTHORIZED`.

The v0.4 event/evaluation contract remains `PROPOSED_NOT_CURRENT`; B4 does not promote a current restatement. That promotion boundary remains reserved for the separately authorized B6 flow.
