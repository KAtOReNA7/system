# M2 v2 PR #7 P1 remediation summary v0.1

## 结论

针对独立外审 `a472d1092a0c9184f45cea3dad5e6bfb9b95a3e9` 列出的 13 项 P1 及 10 项直接耦合 P2，修复实现均已闭合。当前状态不是合并授权：PR #7 必须继续保持 Draft、open、unmerged，下一步只能是对新 HEAD 的增量独立外审。

历史 V2-B.8 原始结论仍为 `CANARY_CONDITIONAL`；按完整性修复合同对既有 immutable/append-only 材料做离线重述后的当前结论为 `CANARY_FAIL`。两者属于不同版本和不同权威角色，不得用 OR 条件互相替代。

## 13 项 P1 闭合

1. 当前权威只接受版本化 current-state index 与 current restatement 的 digest 绑定。
2. B8 verifier 同时验证历史 evaluation、当前 restatement、effective receipts、current authority 与冻结上游绑定。
3. B5–B8 使用 exact-role closed binding，缺失、额外、陈旧或派生 digest 漂移均 fail closed。
4. 请求状态改为 chained append-only event ledger，所有 counters 由 replay 派生，reservation 不再删除或回滚。
5. 离线恢复先构建并验证完整 staging group，再做可回滚 group promotion；第二次运行是 metadata-stable no-op。
6. migration 规范化并去重路径，要求实际文件集合与 manifest 精确相等，只复制已验证成员。
7. migration 的环境、跟踪与集合检查全部在 promotion 前完成；故障注入覆盖 private/env/Git/receipt 边界并回滚。
8. B6 current cache 仅保存 normalized safe projection；legacy mutable 与 raw-response current cache 均为 0。
9. EventTime 绑定局部 clause/span；多事件、计划/实际、范围和歧义场景无法唯一绑定时返回 null。
10. conflict family 的 applicability/execution 由本地 canonical claims 派生，独立检测考虑 edition、date 与 stage。
11. 写能力测试全部使用 synthetic temporary roots；默认 `npm test` 纳入全仓 content、metadata 与 Git-status 不变证明。
12. 所有可执行 provider 路径在 dispatch 前强制 approved HTTPS host/redirect 绑定，并对 Responses 强制 `store=false`。
13. workbook verifier 独立解析 OOXML/ZIP 并派生结构与隐私事实；人工视觉确认始终独立且默认 false。

## 直接耦合 P2

`PR7-P2-001`、`002`、`003`、`004`、`005`、`006`、`008`、`009`、`013`、`016` 均已闭合：包括预注册口径勘误、历史 v0.1 恢复、五项公开合同、历史授权本地 supersession、public-data guard fail-closed、required-artifact 缺失失败、migration/key-separation 诚实陈述、read-only proof 扩围、冲突误报修正和 legacy mutable cache 退役。

## 离线恢复与当前状态

- 仅使用既有 immutable/append-only 本地材料：29 个 physical request envelopes、1 个 cache hit、118 个 ledger events。
- replay counters：planned 30、reserved 29、dispatched 29、completed 29、cacheHit 1、indeterminate 0。
- current closed binding 精确包含 14 个角色；完成后的第二次执行返回 `ALREADY_CURRENT_NOOP`。
- 当前 evaluation digest：`4d506076b0da438bc5a90f40bec6e52d559a3c18b31eedd1c48647f1203536c3`。
- 当前 restatement：`M2-v2-canary-v3-1-integrity-restatement-v0.3`；导航入口：`M2-v2-current-state-index-v0.2`。

## 安全与授权边界

本轮 provider request delta 为 0；未执行 Canary、full160 或模型训练；未修改 B4/formal-cash，未打开 holdout，未进入 V2-C/V2-D/C4/M3，未 release、未 merge。`full160Authorized=false`，`nextDevelopmentReadiness=NOT_AUTHORIZED`。

private receipts、state、cache、workbook 与审计明细只保存在 Git ignored 角色，不进入提交。公开文件不包含 private 明细、密钥、环境值或 provider 响应。

## 合并门禁

本摘要记录修复实现闭合，不构成自审合并建议。新 HEAD 必须通过 Linux 与 Windows exact-head CI，并接受增量独立外审；在该外审给出新的合并判断前，`mergeReadiness=NOT_READY_PENDING_INCREMENTAL_INDEPENDENT_REVIEW`。
