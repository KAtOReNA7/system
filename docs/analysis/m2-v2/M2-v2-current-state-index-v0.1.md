# M2 v2 状态索引 v0.1（历史，已被 v0.2 替代）

状态：`historical / superseded / not authorization`

分类：public sanitized；`not_for_formal_decision`

更新日期：2026-07-18

本文件只保留 v0.1 时点的状态快照，不再是 current authority，也不授权 provider、resume、Canary、full160 或任何新开发。当前唯一索引为 `docs/analysis/m2-v2/M2-v2-current-state-index-v0.2.md`；以下“当前”与 lifecycle=`current` 均仅表示 v0.1 快照当时的标记。

## v0.1 快照结论（历史）

- V2-A：完成并作为冻结架构基础。
- V2-B.1–B.8：均保留为历史 checkpoint，不得删除或改写为当前授权。
- V2-B.8 原始 Canary v3.1：`CANARY_CONDITIONAL`；历史原报告保留且未被静默覆盖。
- 完整性修复：verifier/atomic binding/B8 fail-closed 合同、private derived state 离线恢复与全量验证已经收口；修复合同的离线 restatement 当前结论为 `CANARY_FAIL`。
- 收口证据：100% 全项目复审与 PR body UTF-8 roundtrip 记录在 Git ignored private 审计角色中；PR #7 保持 Draft/open/unmerged，等待外部审查。
- `full160Authorized=false`；`nextDevelopmentReadiness=NOT_AUTHORIZED`。

当前权威顺序由 v0.2 index 给出；本文件中的旧顺序只作历史追溯。

## 状态映射

| artifact | version | stage | status | current / superseded / historical | supersededBy | decision | safeNextAction |
|---|---|---|---|---|---|---|---|
| V2-A contract manifest | v0.1 | V2-A | complete | current | — | architecture contract complete | 保持冻结 |
| Evidence pilot initial checkpoint | v0.1 | V2-B.1 | historical checkpoint | superseded | B.2–B.8 | `PILOT_CONDITIONAL` | 仅追溯 |
| Relay remediation | v0.1 | V2-B.2 | historical checkpoint | superseded | B.3 | 当时 contract compatibility fail | 仅追溯 |
| Evidence pipeline repair | v0.1 | V2-B.3 | historical checkpoint | superseded | B.4 | pipeline contract repaired | 仅追溯 |
| Real evidence Canary v2 | v0.1 | V2-B.4 | historical checkpoint | superseded | B.5 | `CANARY_CONDITIONAL` | 仅追溯 |
| Provider separation checkpoint | v0.1 | V2-B.5 | historical checkpoint | superseded | B.6 | historical capability/resume | 仅追溯 |
| Extraction remediation benchmark | v0.1 | V2-B.6 | historical checkpoint | superseded | B.7 | benchmark gate passed at checkpoint | 仅追溯 |
| Fixed Canary v3 | v0.2 | V2-B.7 | historical checkpoint | superseded | B.8 | `CANARY_CONDITIONAL` | 仅追溯 |
| Canary v3.1 original decision | v0.1 | V2-B.8 | original retained | historical | integrity restatement v0.2 | `CANARY_CONDITIONAL` | 只做完整性 restatement，不扩量 |
| Integrity remediation pre-registration | v0.1 | remediation | fulfilled | current | — | remediation scope completed | 保留合同证据 |
| Verifier/recovery/atomic contracts | v0.1 | remediation | implemented and verified | current | — | contract verification complete | 保持冻结 |
| Canary v3.1 integrity restatement | v0.2 | remediation | complete | current | — | `CANARY_FAIL` | 禁止扩量，停止 |
| Integrity remediation summary | v0.1 | remediation | complete pending external review | current | — | remediation complete | 等待外部审查 |
| Whole-project audit and PR roundtrip | v0.2 | remediation | private closeout evidence | current | — | recorded in Git ignored audit role | 不公开 private 明细 |

## 不变边界

- B4 与 formal-cash target 未改变，B4 未 release。
- final holdout、embargo shadow 与 deferred labels 仍 sealed。
- 本轮 `providerRequestDelta=0`，未执行 Canary；未授权 full160、模型训练、V2-C/V2-D、C4、M3 formal、release 或 PR merge。
- 历史报告不能作为恢复数据源；private 恢复只能使用冻结合同规定的权威 immutable/append-only 输入。
