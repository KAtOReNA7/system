# M3 fixture/prototype PRD 缺口闭环报告 v0.1

生成日期：2026-06-28

## 范围

本轮根据 M3 PRD 与 `M3-prd-contract-implementation-consistency-audit-v0.1` 的补强项，完成非正式 fixture/prototype 层缺口闭环。

本轮没有进入 M3 formal execution，没有连接数据库，没有写 migration，没有导入真实数据，没有提交 private Excel/CSV/JSON。

## 已闭环项

| PRD / 审计缺口 | 本轮处理 | 证据 |
|---|---|---|
| 同作者作品不占对标名额 | comparator 增加 `countsAgainstFinalComparatorCap=false`，同作者引用仍可保留为调整依据 | `src/domain/newProductEvaluation/fixtureEngine.js` |
| 系统对标与运营对标并列 | comparator 增加 `comparatorOrigin=system_selected/operator_suggested/same_author_adjustment` | `src/domain/newProductEvaluation/fixtureEngine.js` |
| S+/S/A/B/C/D/E 全评级样本 | synthetic topic 扩展到 10 条，覆盖 S+/S/A/B/C/D/E 与 blocked | `test/m3-new-product-fixture-engine.test.js` |
| M4 校准入口 | 增加 entry-only M4 candidate fixture 和只读 API `/api/m3/new-products/m4-calibration-candidates` | `src/repositories/newProductEvaluationFixtureRepository.js`、`src/http/app.js` |
| M4 不执行 | M4 candidate 保持 `entryOnly=true`、`m4Executed=false`、`syntheticOnly=true` | `test/m3-new-product-api.test.js` |

## 当前状态

- M3 fixture topics：10
- readiness ready：8
- readiness blocked：1
- readiness draft：1
- M4 calibration candidate：1
- formal execution allowed：false
- not for formal decision：true

## 验证结果

| 命令 | 结果 |
|---|---|
| `npm run check:no-real-data` | 通过 |
| `npm run lint` | 通过，检查 122 个 JavaScript 文件 |
| `npm run build` | 通过，检查 122 个 JavaScript 文件 |
| `npm test` | 通过，406 pass / 0 fail |
| `npm run smoke` | 通过，`mode=fixture`、`realDataImported=false`、`formalDatabaseConnected=false` |
| `npm run test:e2e` | 通过，14 pass / 0 fail |

## 仍不进入 formal M3 的原因

1. M2 formal readiness 仍需要单独 rerun 和授权。
2. 正式 M3 persistence、release/export、audit chain 尚未建立。
3. 原始材料保存策略、权限模型和正式任务写 API 尚未授权。
4. 当前 fixture 仍只用于工程形状、页面、API contract 和测试验证。

## 后续建议

下一步如继续 M3，应先由用户明确授权 formal execution 范围；否则继续限定在 synthetic fixture 和只读 prototype。
