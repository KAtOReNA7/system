# M2 v2 Canary 决策 v0.1

## 决策

**CANARY_CONDITIONAL**。允许进入完整 160 pilot：**否**。

未通过或不可证明的 gate：`provider_request_success_rate`、`supplemental_provider_binding_proven`、`entity_resolution_rate`、`citation_alignment`、`accepted_evidence_positive`、`relay_cost_below_budget`、`repeat_claim_consistency`。

当前 full-160 readiness 为 `NOT_READY`，本轮不授权也不执行 full 160。全部结果为 `not_for_formal_decision`；未训练模型、未修改 B4/PRD、未进入 V2-C/V2-D/C4/M3、未 release。

模型建议：`NO_MODEL_SWITCH_DECISION_IN_THIS_CANARY; LUNA_SYNTHETIC_NOT_COMPARABLE; RETEST_REQUIRES_SEPARATE_FULL_CAPABILITY_AND_CITATION_GATE`。
