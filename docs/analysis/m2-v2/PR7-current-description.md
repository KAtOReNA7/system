# M2 v2 External Evidence Pilot checkpoint — PR #7

## 当前 S1 边界

本 PR 保留 V2-A 完成后的 V2-B.1–B.8 历史 checkpoint 和既有修复证据。针对 exact product HEAD `627f74c6b9b2365ee4403c613ea9689748b76541` 的增量独立外审识别出 5 项 P1 与 5 项直接耦合 P2；这 10 项 finding 当前全部为 `OPEN`。

- S0：`COMPLETE`，exact HEAD `badbf453e1e99ba87cc3064601e480a09ff1b149`
- S1：仅授权 B0–B7 分阶段实施；当前 batch 为 `B0`
- Finding closure status：`OPEN`
- Independent review status：`NOT_REVIEWED`
- B8：未执行，且不属于本轮代理授权
- V2-B.8 Canary v3.1 历史结论：`CANARY_CONDITIONAL`
- 当前离线 integrity restatement：`CANARY_FAIL`；这不是新 Canary
- `full160Authorized=false`
- `modelTrainingAuthorized=false`
- `mergeAuthorized=false`
- `nextDevelopmentReadiness=NOT_AUTHORIZED`

B0–B7 的实现结果即使通过本地与远端检查，最高也只能记录为 `CANDIDATE_CLOSED_PENDING_INDEPENDENT_REVIEW`。只有新的独立 B8 外审可以把 finding 判定为 `CLOSED`。

## Open findings

- P1：`PR7-P1-003`、`PR7-P1-006`、`PR7-P1-008`、`PR7-P1-009`、`PR7-P1-013`
- Direct P2：`PR7-P2-006`、`PR7-P2-008`、`PR7-P2-009`、`PR7-P2-013`、`PR7-P2-016`

## Phased checkpoints

| Batch | Exact HEAD | Linux CI | Windows CI | Status |
|---|---|---|---|---|
| S0 | `badbf453e1e99ba87cc3064601e480a09ff1b149` | run `29680155024`, job `88174725443`, success | run `29680155024`, job `88174725459`, success | `COMPLETE` |
| B0 | pending ordinary push | `PENDING` | `PENDING` | `IN_PROGRESS` |
| B1–B7 | — | — | — | `NOT_STARTED` |

Each B0–B7 row must bind the ordinary-pushed exact remote HEAD and its own Linux/Windows CI. A prior batch's CI cannot be reused for a later batch.

## B0–B7 implementation scope

- B0 freezes shared authority, migration, cache/provider, event/conflict, workbook/test, and current-authority contracts.
- B1–B5 implement the five paired remediation groups and their planned adversarial cases.
- B6 performs provider-free offline regeneration and atomic supersession from existing immutable/append-only material only.
- B7 runs the full regression, boundary, artifact, and handoff gates.

The 89 planned cases must enter the default synthetic test profile with zero unexpected/default skips. Native-only cases remain explicit: Linux 87 cases, Windows 88 cases, with 86 shared across both platforms.

## 安全与治理边界

本轮不得调用 provider、连接数据库、执行 Canary/full160、训练模型、打开 holdout、执行 B8、mark ready、merge 或 release。不得新增第三方依赖，不得 rebase、squash、amend、force push，且不得覆盖历史或 private immutable artifacts。

PR #7 必须保持 `Draft/open/unmerged`，merge 状态保持 `WITHHELD`。本轮分阶段修复不构成模型训练、下一开发阶段或发布授权。
