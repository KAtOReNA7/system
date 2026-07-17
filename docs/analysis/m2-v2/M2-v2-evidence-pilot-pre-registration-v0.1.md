# M2 v2 External Evidence Pilot 预注册 v0.1

## Freeze

本预注册在任何外部 retrieval 前冻结。base commit 为 `d81b952e37dd43365c0091cdd6665e69d8d39a7e`，样本量 160，seed `20260717`。检索结果不得改变样本、provider、阈值或分层标签。

## 抽样

从 3053 部权威人口按以下维度做 deterministic balanced-greedy minimum coverage：source、五档完整历史收入排名、revenue model、最近 12 个完整月 activity、身份歧义风险和检索前 evidence rich/sparse prior。各维度目标见同名 JSON；如果某层全库数量低于预注册目标，则 effective target 等于全库可用数，全部选入并公开披露，不允许伪造补足。

Top 分层互斥：top1、1–5%、5–10%、10–50% middle、bottom50 long-tail。高价值固定为前三档。Activity：dense ≥9 个正收入月、intermittent 1–8、dormant 0。所有计算只使用截至 2026-04 的完整收入事实与既有权威业务分类。

最终 private manifest digest 为 `f85308436328bd056e27025407f45aa840cd5cc07e4e7ad9fe0eec4a2d8a3020`，160 部、192869 条完整事实口径和全部 effective target 已锁定。检索前 aggregate QA 曾发现持续 stress bonus 使首个 attempt 的高歧义样本异常集中；在 **0 次 provider dispatch、0 条 search result** 状态下移除该 bonus，原 digest `8a890849...` 作为 private superseded attempt 保留。最终 manifest 冻结后禁止再次更换。

## Retrieval 与成本

默认每部 4 个模板 query，上限 8；每 query 10 results；每部 6 pages。成本停止线为总 CNY 400、单部 2.5、单 query 0.3。Provider 或域名未获批准时必须 `blocked_no_provider`，不得转用浏览器或手工结果。

## 最低 usability

`PILOT_PASS` 除 17 个硬门全过外，还需：有效 evidence work coverage ≥60%、高价值 coverage ≥75%、实体解析 ≥80%、query success ≥80%、citation/allowlist 100%、固定 20 部重复检索 claim agreement ≥80%、source overlap ≥70%。这些是 evidence pilot 阈值，不是模型 gate。

硬门全过但 provider 不可用、coverage/成本/来源稳定性/复现性不足，判 `PILOT_CONDITIONAL`；任何安全、泄漏、实体、来源或审计硬门失败，判 `PILOT_FAIL`。

本轮不训练模型，不测 uplift，不改变 B4，不打开 sealed roles，不进入 V2-C/V2-D/C4/M3，不 release。
