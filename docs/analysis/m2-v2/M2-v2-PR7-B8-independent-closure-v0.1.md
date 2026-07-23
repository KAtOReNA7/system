# PR #7 B8 独立复审闭环 v0.1

## 结论

独立 reviewer 对 exact HEAD `d2f92cd03bc9d82672676298d04daed765c4ce8a` 的最终裁决为：

```text
B8_PASS_ALL_FINDINGS_CLOSABLE
```

reviewer 未参与本轮修复实现，复审期间没有修改、提交或推送仓库。残留 P0、P1、P2 均为 0；10 项 finding 全部允许由本版本化 successor 从 `OPEN` 迁移为 `CLOSED`。

本文件只记录独立复审裁决。它不表示 PR 已 ready/merged，也不授权 provider、数据库、Canary/full160、训练、holdout、release 或 M3 formal。

## Exact HEAD 与 CI

| 项目 | 结果 |
|---|---|
| reviewed HEAD | `d2f92cd03bc9d82672676298d04daed765c4ce8a` |
| local / origin branch / PR head | 一致 |
| PR #7 | Draft / open / unmerged |
| CI run | `30034932174`，`SUCCESS` |
| Linux job | `89300399550` |
| Windows job | `89300399537` |
| B7 registry union | 89/89 |
| secondary-verifier-required | 30/30 |

Linux 覆盖 87/87 个平台适用案例、161 tests、0 fail/skip；Windows 覆盖 88/88 个平台适用案例、162 tests、0 fail/skip。独立本地默认测试为 1185/1185、0 fail/skip。

## 首轮阻断修复

- canonical `npm run m2:v2:v2b8:verify` 现在默认读取 B6 current pointer，并验证 v0.3 current index、v0.4 restatement、current authority digest、transaction binding 与 effective receipts。
- 无参 `readCurrentAuthority(root)` 只选择 current authority；current 与 legacy 同时存在时不能选择 legacy，仅存在 legacy 时 fail-closed。
- canonical verifier 返回 `currentDecision=CANARY_FAIL`、`providerRequestDelta=0`，verification issues 为空。
- legacy authority 仅允许显式历史 replay，不再作为 current fallback。

## 正式 claimable readonly proof

| 项目 | 结果 |
|---|---|
| claimable / allPassed | `true` / `true` |
| canonical invocations | 2 |
| scope specifications / observed members | 140 / 145 |
| member-set digest | `82a0e9ec2df0feabdc9f6f9d42f3fd50e77271bbf85d2acaadab756e972ffd86` |
| source-graph digest | `085c08ad1f1032551ca47be46d0e38b743c89da6788347a5c79c79efd0901d2e` |
| transaction | `recovery-f15e033dc333e86e836d638c5578289f61bf9838` |
| current-binding digest | `a478bd515e8733428796348665c140523f1d4b5d8dbd8a5dd6cbb15653409168` |
| proof digest | `656bed1f2c903927f1d4a7a6861477c189eaf3f2a001f9e03ba9038ede0fcd7d` |
| provider / database delta | 0 / 0 |

Windows checkout 的 proof scope 有 121 个 tracked 唯一路径：111 个 raw-byte exact，10 个仅 CRLF/LF 差异且 portable digest exact，semantic/binary mismatch 为 0。换行差异不再制造假失败，真实语义或二进制漂移仍 fail-closed。

## Finding closure

| Finding | Cases | 独立裁决 |
|---|---:|---|
| `PR7-P1-003` | 9 | `CLOSED` |
| `PR7-P2-009` | 9 | `CLOSED` |
| `PR7-P1-006` | 7 | `CLOSED` |
| `PR7-P2-008` | 8 | `CLOSED` |
| `PR7-P1-008` | 9 | `CLOSED` |
| `PR7-P2-016` | 9 | `CLOSED` |
| `PR7-P1-009` | 8 | `CLOSED` |
| `PR7-P2-013` | 8 | `CLOSED` |
| `PR7-P1-013` | 12 | `CLOSED` |
| `PR7-P2-006` | 10 | `CLOSED` |

## 保持不变的边界

- historical decision：`CANARY_CONDITIONAL`
- current offline integrity restatement：`CANARY_FAIL`
- `nextDevelopmentReadiness=NOT_AUTHORIZED`
- `mergeAuthorized=false`
- `full160Authorized=false`
- `modelTrainingAuthorized=false`
- `releaseAuthorized=false`
- PR #7：Draft/open/unmerged

首轮失败报告、B6/B7 evidence 和旧 open-findings overlay 均保留为历史证据，不覆盖、不删除。当前 finding 状态由 `M2-v2-PR7-findings-closure-status-v0.2.*` 接续。
