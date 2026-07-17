# M2 Forecast Intelligence v2 技术设计索引

## 状态

- 阶段：V2-B External Evidence Pilot
- 状态：`PILOT_CONDITIONAL_BLOCKED_NO_PROVIDER`
- decision：`not_for_formal_decision`
- migration：无
- runtime：仅本地 private file-store pilot；不含正式 API/DB
- model training：无

## 文档

| 文档 | 作用 |
|---|---|
| `M2-v2-system-architecture-v0.1.md` | 系统边界、组件、数据流、失败降级与非功能要求 |
| `M2-v2-external-evidence-layer-v0.1.md` | evidence schema、provider、timestamp、confidence、contradiction |
| `M2-v2-external-evidence.schema.json` | 单条 evidence claim 的 JSON Schema |
| `M2-v2-field-dictionary-v0.1.md` | PRD、schema、API、DB 与 export 的统一字段语义 |
| `M2-v2-api-contract-v0.1.md` | read-only V2 API 设计 |
| `M2-v2-db-contract-v0.1.md` | logical DB objects 和约束；不含 migration SQL |
| `M2-v2-export-contract-v0.1.md` | canonical JSON/Excel export 设计 |
| `M2-v2-result.schema.json` | V2 结果 JSON Schema |
| `M2-v2-v2a-contract-manifest.json` | V2-A 文档和边界 manifest |
| `M2-v2-evidence-pilot-design-v0.1.md/json` | V2-B sampler、query、entity、store、resume/report 设计 |
| `M2-v2-provider-policy-v0.1.md/json` | provider-neutral adapter、预算、fallback 和 browser 边界 |
| `M2-v2-source-allowlist-v0.1.md/json` | source tier/terms 与显式域名 fail-closed allowlist |

## 设计优先级

1. formal cash 不可绕过；
2. evidence as-of 与来源可追踪；
3. null/zero、scoreable/available/eligible/abstained 分离；
4. B4-only fallback；
5. Human baseline 与生产隔离；
6. point-only/no-action output；
7. future implementation 必须由新授权启动。

## 不得直接执行

这些文件不是 migration candidate、正式 API implementation ticket、model spec 或 release approval。V2-B 只可在独立 pilot 分支按预注册 provider/source policy、固定样本和 private ignored store 实施；任何模型、正式 DB/API 或 release 实现仍需新授权。
