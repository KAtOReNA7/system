# M2 v2 V2-B.2 Relay Remediation Design v0.1

## 状态分层

运行时分别记录 transport、HTTP、provider response、search tool、citation adapter、strict extraction、lineage join 和 model binding；不再把它们压成一个 `success`。公开报告分为 provider connectivity、adapter/contract compatibility、pre-governance model evidence quality、source-governance admissibility 四层。

## Private artifacts

V2-B.2 只写 Git ignored 的 `data/private-output/m2-v2-evidence-pilot/v2-b2-relay-remediation/`。其中保存派生 manifest、物理请求 reservation/cache、逐臂 receipts、citation packet、paired rows、response-shape matrix 与 private review pack。raw response、Authorization、API key、完整页面与未脱敏错误正文均不保存。

旧 60 receipt 未保存 raw response，因此历史 output/content/tool/annotation/JSON/error/model/status 原始路径必须标为 `not_reconstructable_from_legacy_receipt`。新请求在 raw body 仍在内存时提取 shape-only fingerprint：路径模板、item type、字段存在性、计数、安全枚举和 digest；不保存正文、URL、query 或 snippet。

## Cache 与恢复

物理请求 key 绑定 parent/canary/benchmark manifest digest、logical task、requested model、stage、prompt/schema/adapter version，以及由 provider、`/responses` endpoint、base URL digest 和两模型列表构成的 relay runtime binding。每个 stage 发出前原子 reservation，完成后原子写 receipt/cache；search 成功而 extract 中断时只恢复 extract。模型、stage、版本或 relay binding 不同不得命中同一 cache。

## Citation lineage

可信 carrier 仅包括 Responses message content annotations、明确的 nested `url_citation`、Chat message annotations/citations，以及 completed web-search action sources。adapter 校验 HTTP(S) URL、annotation span 和 tool status，规范化去重后生成稳定 citationId。递归扫描未知路径得到的 citation-like 对象不得进入 registry。

Stage 2 candidate 携带 citationId 和不超过 240 字符的逐字 claimText。join 必须精确命中 Stage 1 registry，claimText 必须能在该 annotation span 的有界周边定位，structured value 必须能在 claimText 中核对，随后本地注入 source URL/title/domain；unknown/duplicate/invalid citationId 或未验证 claim-support 全部不得成为 usable evidence。source allowlist 在其后执行，空 allowlist 可以导致 governance accepted=0，但不能否决 pre-governance local-support quality evaluation。该评估不声称独立核实网页事实真伪。

## Model identity and full-pilot boundary

每个 stage 同时保存 requested model 与 provider returned model。任一臂缺失、错配或两臂实际返回同一模型时，paired benchmark 为 `NOT_EVALUATED`，不得冻结模型或重跑 canary。

full-160 runner 不读取 V2-B.2 technical pass 作为授权；本任务所有公开/私有 terminal receipt 均固定 `fullPilotAuthorized=false`。
