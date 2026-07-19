# PR #7 open-finding status overlay v0.1

This overlay records the current S1 phased-remediation boundary. It does not supersede the versioned current-state index, independently close a finding, authorize B8, authorize PR merge, or authorize any downstream phase.

- Reviewed product head: `627f74c6b9b2365ee4403c613ea9689748b76541`
- S1 starting head after S0: `badbf453e1e99ba87cc3064601e480a09ff1b149`
- Direct branch: `codex/m2-v2-evidence-pilot-v1`
- Open P1 findings: 5
- Open directly coupled P2 findings: 5
- Historical decision: `CANARY_CONDITIONAL`
- Current decision: `CANARY_FAIL`
- S0 status: `COMPLETE`
- Finding closure status: `OPEN`
- Independent review status: `NOT_REVIEWED`
- B8, merge, full160, model training, and release authorized: `false`
- Next development readiness: `NOT_AUTHORIZED`
- PR state required: `Draft/open/unmerged`

## Batch closure matrix

| Batch | Exact evidence HEAD | Linux CI | Windows CI | Status |
|---|---|---|---|---|
| S0 | `badbf453e1e99ba87cc3064601e480a09ff1b149` | run `29680155024`, job `88174725443`, success | run `29680155024`, job `88174725459`, success | `COMPLETE` |
| B0 | `013b83a561ca02983e356e384d0a700934db5238` | run `29686443115`, job `88191400688`, success | run `29686443115`, job `88191400695`, success | `COMPLETE` |
| B1 | `66eecbc57c4186ad61df8152ef38b5f28300f130` | run `29692415607`, job `88207352223`, success | run `29692415607`, job `88207352209`, success | `COMPLETE_PENDING_B8` |
| B2 | `5cf20d9fb4af567763982f1f0882fbd29b7c6d25` | runs `29698400478` / `29699010272`, jobs `88223025635` / `88224732239`, success | runs `29698400478` / `29699010272`, jobs `88223025642` / `88224732234`, success | `COMPLETE_PENDING_B8` |

B2 comprises two ordinary commits, five changed files, 15/15 registered acceptance cases, 31/31 migration tests, and 1130/1130 full tests. The integration-only checkpoint commit is bound separately to its final exact-head CI receipt and the live PR body. `nextBatch=B3`, but B3 requires a new explicit start and has not begun.

## Finding candidate-status rows

| Findings | Batch | Finding status | Candidate status |
|---|---|---|---|
| `PR7-P1-003`, `PR7-P2-009` | B1 | `OPEN` | `CANDIDATE_CLOSED_PENDING_INDEPENDENT_REVIEW` |
| `PR7-P1-006`, `PR7-P2-008` | B2 | `OPEN` | `CANDIDATE_CLOSED_PENDING_INDEPENDENT_REVIEW` |
| `PR7-P1-008`, `PR7-P1-009`, `PR7-P1-013`, `PR7-P2-006`, `PR7-P2-013`, `PR7-P2-016` | B3-B7 | `OPEN` | `NOT_STARTED` |

All 10 findings remain `OPEN`. Only a new independent B8 review may determine `CLOSED`. Provider, database, Canary/full160, model training, holdout, B8, mark-ready, merge, and release remain prohibited.
