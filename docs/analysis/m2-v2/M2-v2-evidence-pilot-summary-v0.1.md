# M2 v2 External Evidence Pilot 摘要 v0.1

## 结论

本轮判定为 **PILOT_CONDITIONAL**，实际执行状态为 `blocked_no_provider`。固定 160 部样本、provider/query/entity/source/time/conflict/private-store 框架和 fail-closed 审计已完成；由于当前没有获授权且可审计的 runtime provider，也没有经条款/法律批准的域名条目，未发出外部请求、未生成或伪造 evidence，当前不具备进入 V2-C 的条件。

## 固定样本

- population：3053；sample：160；seed：`20260717`；
- publication / web_original：74 / 86；
- top1 / top5 / top10 / middle / long-tail：12 / 20 / 20 / 53 / 55；
- pure-sales / mixed / pure-buyout / unknown：98 / 29 / 28 / 5；
- dense / intermittent / dormant：73 / 40 / 47；
- 高歧义风险预注册：68；预计 evidence rich / sparse：64 / 36。

## Provider 与检索

- provider mode：`no_provider_available`；availability：`unavailable`；
- planned / dispatched queries：640 / 0；
- results / pages / accepted evidence：0 / 0 / 0；
- 实体 resolved / unresolved / ambiguous：0 / 160 / 0；
- 有效 evidence coverage / 高价值 coverage：0.00% / 0.00%；
- cost：CNY 0；latency：不可评估；复现性：`not_evaluable_no_evidence`。

## Gate 与边界

- 安全/审计硬门：17/17；
- evidence usability：未通过（无 provider，coverage、实体解析、来源稳定性和真实复现性不可评估）；
- final holdout、embargo shadow、60-month labels 均保持 sealed；
- 未训练模型、未改变 B4、未进入 V2-C/V2-D/C4/M3、未 release；
- 全部结果保持 `not_for_formal_decision`。
