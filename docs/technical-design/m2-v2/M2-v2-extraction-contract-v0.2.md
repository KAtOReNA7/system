# M2 v2 Evidence Extraction Contract v0.2

## 输入边界

Extraction Layer 的唯一事实输入是 Search Layer 生成并通过本地校验的 source records。它不得执行搜索，不得使用 Search 阶段生成的自由文本 research note，也不得使用未出现在 source records 中的知识。

Source record schema：

```json
{
  "sourceId": "deterministic canonical-URL identifier",
  "title": "string or null",
  "url": "canonical http(s) URL",
  "domain": "canonical hostname",
  "snippet": "bounded string or null",
  "citation": "validated citation lineage",
  "capturedAt": "ISO timestamp",
  "providerReceipt": "content-free receipt metadata"
}
```

## 输出边界

每条 Evidence 只能包含：

```json
{
  "claim": "bounded claim",
  "claimType": "controlled enum",
  "structuredValue": "discriminated value",
  "sourceIds": ["one or more supplied source IDs"],
  "confidence": 0.0,
  "eventTime": null,
  "availableAt": null,
  "entityResolution": "structured resolution",
  "contradictionStatus": "controlled enum"
}
```

严格规则：

- `sourceIds` 为空或引用未知 source record：reject。
- 任一被引用 source record 缺少有效 citation：reject。
- Citation 可以来自 Responses annotation、relay nested citation 或 web search source mapping；不要求 URL 出现在 output text。
- `eventTime`/`availableAt` 未知时必须为 `null`，禁止猜测。
- 缺少 `availableAt`：保留 accepted/research evidence，但 `modelEligible=false`。
- Research/Model allowlist 独立；research approval 不会提升模型资格。

本合同只完成 V2-B.3 pipeline repair，不构成模型质量评价或后续阶段授权。
