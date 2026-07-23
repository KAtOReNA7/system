# M2 v2 Source Governance Policy v0.2

## 双层治理

| 角色 | 用途 | 默认值 | 可否自动继承 |
|---|---|---:|---|
| Research allowlist | pilot research source discovery 与证据审阅 | 空 | 否 |
| Model allowlist | `modelEligible` 资格 | 空 | 否 |

域名条目必须逐项、显式、可审计批准。Research approval 不构成 Model approval；禁止自动提升。当前没有在本合同中批准任何真实域名。

## 判定

- source record 先通过 exact-field、canonical URL、domain、citation、capture time 与 provider receipt 校验。
- 所有来源域名都位于 research allowlist 时，evidence 才可标为 `researchEligible=true`。
- 所有来源域名还必须逐项位于 model allowlist，才具备模型资格的来源条件。
- 模型资格还要求：evidence 已接受、`availableAt` 有效、实体不为 unresolved、`contradictionStatus=none`。
- 缺失时间不删除可审计的 evidence，但必须使 `modelEligible=false`。

该策略 fail-closed，状态为 `not_for_formal_decision`，不授权 full160、canary、训练、release 或任何后续阶段。
