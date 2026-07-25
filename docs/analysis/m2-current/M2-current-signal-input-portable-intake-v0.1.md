# M2 分成信号可移植导入与来源审计 v0.1

## 当前结论

现有正式收入事实、逐月 history、标签成熟时间和派生渠道状态都已完成字段级审计。它们可以继续作为历史模型与账单对账材料，但都不能证明某条记录或某个完整快照在历史 origin 时已经可得。因此，当前合规 `observed_as_of` 覆盖仍为零，新 two-part 模型不得启动。

这不是要求把 private 数据提交到 GitHub。仓库现在提供公开、可移植的输入合同和诊断入口；每台电脑都可以在没有 private、数据库和凭据时运行 synthetic 验证。有权限的电脑只需把受控输入放在 Git ignored capability 目录内，并传入文件路径。

## 现有来源为什么不合格

- 正式收入事实保留作品、渠道、金额、账单月份、来源行号和行摘要，但缺少逐记录 `postingTime` 与 `availableAt`；`billMonth` 不能同时充当三个时间。
- 逐月 history 是从完整缓存按 `billMonth <= origin` 事后切片生成的。`historyThroughOriginOnly=true` 是变换结果声明，不是当时已经保存完整快照的证据。
- `labelAvailableAsOf` 只描述预测目标何时成熟，不描述预测特征何时可用。
- 渠道 route 与 activity segment 来自完整账单缓存的派生结果，没有历史版本和可用时间，不能作为历史合同或渠道状态快照。

聚合审计见 `M2-current-as-of-source-inventory-v0.1.json`。

## 输入包

小型 synthetic 输入可以直接把 `facts` 和 `snapshots` 放在 bundle JSON 内。受控大规模输入应使用同目录、摘要绑定的 NDJSON：

```json
{
  "schema": "m2.current.signal_input_bundle.v0.1",
  "bundleId": "<capability-scoped-id>",
  "populationId": "<frozen-population-id>",
  "target": "future_sales_share_cash",
  "currency": "CNY",
  "sourceMode": "capability_scoped_private",
  "currentStateBackfillUsed": false,
  "caseFileSha256": "<sha256>",
  "caseRowCount": 0,
  "casePopulationSha256": "<canonical-population-sha256>",
  "factFile": "facts.ndjson",
  "factFileSha256": "<sha256>",
  "factRowCount": 0,
  "snapshotFile": "snapshots.ndjson",
  "snapshotFileSha256": "<sha256>",
  "snapshotRowCount": 0
}
```

每条 fact 必须符合 `m2.current.revenue_share_fact.v0.1`；每条 snapshot 使用 `factIds` 引用 fact，并明确声明 `currentStateBackfillUsed=false`。如果没有历史完整性权威，snapshot 必须是 `unknown_at_origin`，不能提供事实或 authority，也不能把缺失金额写成零。

snapshot 中的 `occurrence` 与 `positiveAmount` 只表示“该完整历史快照中的净分成现金是否为正/正金额是否可读”，用于覆盖与缺失机制诊断。它们不是已经批准的预测特征，也不能替代按 `economicTime` 构造的月度动态序列。后续 two-part 候选必须另行预注册窗口、滞后和变换。

## 命令

公共 synthetic 诊断：

```bash
npm run diagnose:m2:signal-input
npm run verify:m2:signal-input
```

受控输入诊断：

```bash
npm run diagnose:m2:signal-input -- \
  --fingerprint-cases \
  --case-file <cases.ndjson>

npm run diagnose:m2:signal-input -- \
  --bundle-file <bundle.json> \
  --case-file <cases.ndjson>
```

第一条命令生成 cases 文件摘要、行数和 canonical population fingerprint，供 bundle 填写。第二条命令只向标准输出返回聚合覆盖率、segment/origin 缺口和 missing reason，不返回作品、事实、来源记录或快照标识。facts/snapshots NDJSON 必须与 bundle 位于同一目录树内；另行传入的 cases NDJSON 也必须由 bundle 中的 SHA-256、行数和 canonical population fingerprint 绑定，以防移动冻结人口。三个输入角色都必须摘要和行数完全一致。

## 下一门禁

导入成功只表示信号库存通过结构和时间边界校验，不授予模型开发、holdout、Canary 或 release 权限。首先要在 25 个 origin 与 dense/intermittent/dormant 三个 segment 上量化覆盖和缺失机制。只有覆盖不再为零、分布足以支持稳定估计并完成预注册后，才申请最小动态 two-part nested challenger。
