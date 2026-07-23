# M2 v2 PR #7 P1 合并阻断修复预注册 v0.1

状态：`frozen_before_implementation`

分类：public sanitized；`not_for_formal_decision`

基线：`a472d1092a0c9184f45cea3dad5e6bfb9b95a3e9`；base `d81b952e37dd43365c0091cdd6665e69d8d39a7e`。

## 目的

本预注册冻结独立外审确认的 13 项 P1 及直接耦合 P2。13 项不得合并、隐藏或降级；只有修复、真实边界测试、离线重算、P0/P1=0、Linux/Windows exact-head CI 和新 HEAD 增量独立外审准备全部完成后，才可把本轮标为完成。

| Finding | 根因 | 冻结修复方向 | Acceptance gate | 当前状态 |
|---|---|---|---|---|
| PR7-P1-001 | 历史 conditional 被当作 current predicate | current authority 只绑定版本化 current index/restatement | historical/current 分离且 digest-bound | planned |
| PR7-P1-002 | B8 verifier 只验历史 evaluation | 同时验证 restatement/effective receipts/current authority/upstream | `currentRestatementVerified=true` | planned |
| PR7-P1-003 | transaction 不是 closed member set | 精确角色集合并重算所有 derived binding | 十类 fault injection 全部失败 | planned |
| PR7-P1-004 | ledger 来自 mutable reservation snapshot | chained append-only event ledger + replay counters | no rollback、chain/replay 一致 | planned |
| PR7-P1-005 | recovery 逐文件提升并自报 gate | 完整 staging + 真实 gate + group atomic rollback | first run、no-op rerun、全故障点通过 | planned |
| PR7-P1-006 | manifest 重复路径可掩盖额外 payload | unique normalized path + exact set + verified-member copy | duplicate/unlisted/reparse 均拒绝 | planned |
| PR7-P1-007 | promotion 后置失败无 rollback | private/env 统一可回滚事务 | 每个故障点恢复原 current | planned |
| PR7-P1-008 | B6 cache 保存 raw JSON、receipt 不实 | safe projection + legacy quarantine + stored-object verify | current raw/legacy mutable cache 均为 0 | planned |
| PR7-P1-009 | EventTime 取同句首个日期 | clause/span/event-family binding | 多事件歧义返回 null | planned |
| PR7-P1-010 | conflict coverage 自报 9/9 | applicability/execution 本地推导 | 空输入 NOT_EVALUABLE/fail-closed | planned |
| PR7-P1-011 | 默认测试命中真实 private/tracked 路径 | 所有写测试使用 synthetic temp root | `npm test` 内容和 mtime 零变化 | planned |
| PR7-P1-012 | endpoint/retention 未强制 | approved HTTPS host、redirect 绑定、`store=false` | unsafe request 在 fetch 前失败 | planned |
| PR7-P1-013 | workbook facts 由 caller 自证 | 独立 ZIP/XML 解析，视觉 attestation 分离 | 所有结构/隐私事实由 verifier 计算 | planned |

完整逐项 affected files、tests、private migration、public artifact 与 acceptance gate 见同名 JSON。

## 直接耦合 P2

本轮同时关闭 P2-001/002/003/004/005/006/008/009/013/016。CI immutable pinning、parent-directory fsync portability、PR 规模、真实 private verifier 仅本地及历史低风险格式问题继续作为文档化限制，除非低风险修复可安全并入。

## 绝对边界

`providerRequestDelta=0`；不执行 Canary/full160/模型训练；不修改 B4/formal-cash；不打开 holdout；不进入 V2-C/V2-D/C4/M3；不 release；不 merge 或 mark ready PR #7。`full160Authorized=false`，`nextDevelopmentReadiness=NOT_AUTHORIZED`。

完成后的唯一下一步为：`NEW_HEAD_INCREMENTAL_INDEPENDENT_REVIEW_REQUIRED`。
