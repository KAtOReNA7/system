# M2 v2 V2-B.3 Evidence Pipeline Contract Repair v0.1

## 结论

V2-B.3 已将 Evidence Pipeline 拆分为独立的 Search Layer 与 Evidence Extraction Layer。修复对象是跨层合同，不是模型选择；本轮未调用 provider，未重跑 benchmark/canary，也未改变 V2-B.2 的历史结果。

V2-B.2 的终止事实保持不变：Luna 与 Terra 的 Search contract 均为 9/10，Extraction contract 均为 0/10；Connectivity=`FAIL`、Contract compatibility=`FAIL`、Model quality=`NOT_EVALUATED`。这些结果不能解释为任一模型的搜索质量结论。

## 分层合同

```text
query planning -> web search -> source records
                                  |
                                  v
                         evidence extraction
                                  |
                                  v
                       accepted / modelEligible
```

- Search Layer 只生成 source records，不生成 claim、模型特征、模型资格或决策建议。
- Source record 的唯一字段是 `sourceId`、`title`、`url`、`domain`、`snippet`、`citation`、`capturedAt`、`providerReceipt`。
- Extraction Layer 只接收通过本地校验的 source records，不再接收 Search 阶段的 research note，也不调用 web search。
- Evidence 的唯一字段是 `claim`、`claimType`、`structuredValue`、`sourceIds`、`confidence`、`eventTime`、`availableAt`、`entityResolution`、`contradictionStatus`。
- `sourceId` 与 `citationId` 均由 canonical URL 确定性导出，并在进入 Extraction 前校验完整性。

## Citation Adapter

适配器支持 OpenAI Responses content/message annotations、web search action sources、relay 包装响应及 nested citation wrapper。citation 的可信载体和本地 source record 映射是合同依据；不要求 URL 出现在 output text 中。

无 `sourceId`、未知 `sourceId` 或来源 citation 无效的 evidence 均 fail-closed reject。`eventTime` 与 `availableAt` 都缺失时记录 `time_missing`；缺少 `availableAt` 时 evidence 可以保留为已接受的研究证据，但 `modelEligible=false`。

## Source Governance

Research allowlist 与 Model allowlist 是两个独立角色。默认策略中两者均为空；research approval 仅能用于 pilot research，不能自动继承或提升为 model approval。模型资格还要求有效 source/citation、显式 model allowlist、`availableAt`、已解析实体以及无未解决矛盾。

## 范围与边界

- full160：未执行
- canary rerun：未执行
- provider dispatch：0
- 模型训练/选择：未执行
- B4：未修改
- V2-C/V2-D/C4/M3：未进入
- final holdout：sealed
- release：未执行
- decision status：`not_for_formal_decision`

PR #7 必须保持 Draft/open，不得 merge。

## 验证

- `npm run check:no-real-data`：PASS
- `npm run lint`：PASS
- `npm run build`：PASS
- `npm test`：749/749 PASS
- `npm run test:e2e`：13/13 PASS
- `npm run smoke`：PASS（fixture mode；未导入真实数据，未连接正式数据库）
