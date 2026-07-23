# M2 v2 External Evidence Pilot checkpoint - PR #7

## Current S1 boundary

PR #7 remains Draft/open/unmerged. The incremental independent review against product HEAD `627f74c6b9b2365ee4403c613ea9689748b76541` identified five P1 and five directly coupled P2 findings. All 10 findings remain `OPEN`.

- B0: `COMPLETE`
- B1: `COMPLETE_PENDING_B8`
- B2: `COMPLETE_PENDING_B8`
- B3: `COMPLETE_PENDING_B8`
- B4: `COMPLETE_PENDING_B8`
- B5: `COMPLETE_PENDING_B8`
- B6: `COMPLETE_PENDING_B8`
- B7: `CLOSING_CORRECTION_PENDING_EXACT_HEAD_CI`
- `currentBatch=B7`; B5–B8 were explicitly authorized on 2026-07-24
- Independent review: `FIRST_PASS_FAILED_CANONICAL_POINTER_ROUTING`; repeat review pending correction CI
- Independent B8 review authorized: `true`; self-review and self-closure remain forbidden
- Historical decision: `CANARY_CONDITIONAL`
- Current offline integrity restatement: `CANARY_FAIL`
- `full160Authorized=false`
- `modelTrainingAuthorized=false`
- `mergeAuthorized=false`
- `nextDevelopmentReadiness=NOT_AUTHORIZED`

B0-B7 implementation evidence may reach only `CANDIDATE_CLOSED_PENDING_INDEPENDENT_REVIEW`. Only a new independent B8 review may determine `CLOSED`.

The first independent B8 pass on `4663fce6b656a7269bb624b9e2d74629bab999df` returned `B8_FAIL_REMEDIATION_REQUIRED`: canonical no-argument consumers still selected predecessor authority and the post-B6 formal claimable readonly proof had not been recorded. The closing correction is implemented locally; exact-head CI, the formal proof, and a repeated independent review remain pending.

## Open findings

- P1: `PR7-P1-003`, `PR7-P1-006`, `PR7-P1-008`, `PR7-P1-009`, `PR7-P1-013`
- Direct P2: `PR7-P2-006`, `PR7-P2-008`, `PR7-P2-009`, `PR7-P2-013`, `PR7-P2-016`

## Phased checkpoints

| Batch | Exact evidence HEAD | Linux CI | Windows CI | Status |
|---|---|---|---|---|
| S0 | `badbf453e1e99ba87cc3064601e480a09ff1b149` | run `29680155024`, job `88174725443`, success | run `29680155024`, job `88174725459`, success | `COMPLETE` |
| B0 | `013b83a561ca02983e356e384d0a700934db5238` | run `29686443115`, job `88191400688`, success | run `29686443115`, job `88191400695`, success | `COMPLETE` |
| B1 | `66eecbc57c4186ad61df8152ef38b5f28300f130` | run `29692415607`, job `88207352223`, success | run `29692415607`, job `88207352209`, success | `COMPLETE_PENDING_B8` |
| B2 | `dbc2d5ccbebfc758cab0c1e155cd3d6c52fc2ef2` | run `29700040891`, job `88227447688`, success | run `29700040891`, job `88227447655`, success | `COMPLETE_PENDING_B8` |
| B3-A | `f64a08dba248374b581caf5e3c550401afb6785f` | run `29701357684`, job `88230837593`, success | run `29701357684`, job `88230837585`, success | `PASS` |
| B3-B | `149ce6264ed3c52c279144234f36c3182d8fc4ac` | run `29701847354`, job `88232081347`, success | run `29701847354`, job `88232081327`, success | `PASS` |
| B3-C | `a8eb73f3907a1b593d04cb6dcf0fbb90ace3d0ce` | run `29702460165`, job `88233712230`, success | run `29702460165`, job `88233712267`, success | `PASS` |
| B3-D | this tracked integration commit | exact-head CI bound in the private receipt and PR body | exact-head CI bound in the private receipt and PR body | `COMPLETE_PENDING_B8` after exact-head CI |
| B4-entry | `1107c2a15a39e1b035022c0810e296ff493f3e01` | run `30020602325`, job `89251992130`, success | run `30020602325`, job `89251992368`, success | `PASS` |
| B4-implementation | `65bee39e012e013d4e4347076fc24757f7bcc9f9` | run `30021984333`, job `89256777608`, success | run `30021984333`, job `89256777664`, success | `PASS` |
| B4-integration | this tracked integration commit | exact-head CI bound in the private receipt and PR body | exact-head CI bound in the private receipt and PR body | `COMPLETE_PENDING_B8` after exact-head CI |
| B5 | `8804cd508f8e30d90dfc6f429e0b49ab6cae647c` | run `30025925006`, job `89270240561`, success | run `30025925006`, job `89270240691`, success | `COMPLETE_PENDING_B8` |
| B6 | `3e79ce654cd335129005d3916f25f5bf8a2bef7d` | run `30030360312`, job `89285146244`, success | run `30030360312`, job `89285146296`, success | `COMPLETE_PENDING_B8` |
| B7 implementation | `4663fce6b656a7269bb624b9e2d74629bab999df` | run `30032162656`, job `89291086145`, success | run `30032162656`, job `89291086079`, success | `PASS` |
| B7 closing correction | this tracked correction commit | pending exact-head CI | pending exact-head CI | `CLOSING_CORRECTION_PENDING_EXACT_HEAD_CI` |
| B8 | - | - | - | `AUTHORIZED_PENDING_INDEPENDENT_REVIEW` |

B2 comprises two ordinary commits, five changed files, 15/15 registered acceptance cases, 31/31 migration tests, and 1130/1130 full tests. Its integration-only checkpoint commit is bound to a final exact-head CI receipt after ordinary push.

B3 implements exact safe-cache projections, a provider-free deterministic v0.3 candidate migration, and one-shot lowest-sink provider capabilities with all legacy routes retired. It covers 18/18 planning cases plus 3 bounded adjacent cases; no current promotion or external access occurred.

## Finding candidate status

| Findings | Batch | Finding status | Candidate status |
|---|---|---|---|
| `PR7-P1-003`, `PR7-P2-009` | B1 | `OPEN` | `CANDIDATE_CLOSED_PENDING_INDEPENDENT_REVIEW` |
| `PR7-P1-006`, `PR7-P2-008` | B2 | `OPEN` | `CANDIDATE_CLOSED_PENDING_INDEPENDENT_REVIEW` |
| `PR7-P1-008`, `PR7-P2-016` | B3 | `OPEN` | `CANDIDATE_CLOSED_PENDING_INDEPENDENT_REVIEW` |
| `PR7-P1-009`, `PR7-P2-013` | B4 | `OPEN` | `CANDIDATE_CLOSED_PENDING_INDEPENDENT_REVIEW` |
| `PR7-P1-013`, `PR7-P2-006` | B5/B6 | `OPEN` | `CANDIDATE_CLOSED_PENDING_INDEPENDENT_REVIEW` |

## Safety and governance boundary

Provider access, database access, Canary/full160, model training, holdout, mark-ready, merge, and release remain prohibited. B8 is authorized only as an independent review and does not authorize self-review, finding closure by the implementing agent, merge, or release. The current decision and downstream authorization gates remain unchanged.
