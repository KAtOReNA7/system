# M3 fixture/prototype 文件范围审计 v0.1

生成日期：2026-06-28

审计基准：

- 当前 HEAD：`670d6b50b93fc951b291d58f249a6b7da563c34c`
- 当前 origin/main：`670d6b50b93fc951b291d58f249a6b7da563c34c`
- 工作区状态：审计开始时 clean
- 审计范围：M3-0 到 M3-7 fixture/prototype 及后续边界审计、PRD 缺口闭环提交

## 结论

当前 M3 文件范围仍符合 fixture/prototype 边界。M3 变更集中在 PRD/契约/设计文档、synthetic fixture engine、内存 fixture repository、只读 API routes、只读 admin 页面、测试和脱敏审计报告。

未发现 `db/migrations/` 变更，未新增数据库写入路径，未新增 private data 依赖，未提交原始材料或真实作品明细。

## M3 相关提交范围

| 提交 | 主题 | 范围 |
|---|---|---|
| `bc1a5438b664576ef4b56084e22b0ef22ccbd1fc` | define new product evaluation contracts | M3 PRD、API contract、data model、page plan、test plan |
| `5002fae41307054fbc4a8f82bbd5e73c14b10415` | add new product fixture APIs | fixture engine、fixture repository、API route、unit/API tests |
| `4b32ef8275af9795581c087081f1db45d3c88cee` | add new product admin prototype | admin 只读页面、E2E、交接 summary |
| `fa298582dd057cf80f6cbfbb5996120ac65e309a` | audit fixture prototype boundaries | 文件范围、PRD 一致性、formal boundary、测试覆盖审计 |
| `670d6b50b93fc951b291d58f249a6b7da563c34c` | close fixture prototype PRD gaps | 同作者不计名额、对标来源、全评级 synthetic 覆盖、M4 entry-only fixture |

## 文件分类

### 文档

- `docs/prd/30-new-product-evaluation/M3-new-product-evaluation-prd-v0.1.md`
- `docs/api/M3-new-product-evaluation-api-contract-v0.1.md`
- `docs/technical-design/M3-new-product-evaluation-data-model-v0.1.md`
- `docs/product/M3-new-product-evaluation-pages-v0.1.md`
- `docs/validation/M3-new-product-evaluation-test-plan-v0.1.md`
- `docs/analysis/m3/M3-0-to-M3-7-development-summary-v0.1.json`
- `docs/analysis/m3/M3-fixture-prototype-gap-closure-report-v0.1.md`
- `docs/analysis/m3/M3-fixture-prototype-gap-closure-report-v0.1.json`
- 本审计报告四组 md/json

判断：均为 fixture/prototype 说明、审计或 summary，不包含正式执行授权。

### API route / server

- `src/http/app.js`
- `src/errors.js`

判断：M3 仅新增 GET 路由和 formal mode blocked guard；`/api/m3/new-products/m4-calibration-candidates` 为只读 entry-only fixture，不执行 M4。

### domain / engine

- `src/domain/newProductEvaluation/fixtureEngine.js`

判断：只生成 synthetic fixture 数据结构。当前 synthetic topics 为 10 条，覆盖 S+/S/A/B/C/D/E 和 blocked；不连接数据库。

### fixture

- `src/fixtures/m3NewProductEvaluationFixture.js`

判断：dataset 显式标记 `mode=fixture`、`syntheticOnly=true`、`notForFormalDecision=true`、`m3FormalExecutionAllowed=false`、`dependsOnM2FormalReadiness=true`。

### repository

- `src/repositories/newProductEvaluationFixtureRepository.js`

判断：只从内存 fixture 常量读取并分页/筛选/排序；没有 DB client、SQL 或持久化写入。

### admin 页面

- `public/admin/index.html`
- `public/admin/app.js`

判断：M3 页面为只读展示：总览、选题库、详情、数据缺口、回测。页面显示 fixture-only 与 formal blocked 提示，不提供上传、正式任务创建、发布或导出控件。

### tests / E2E

- `test/m3-new-product-api.test.js`
- `test/m3-new-product-fixture-engine.test.js`
- `test/e2e/admin.e2e.test.js`
- `package.json`

判断：覆盖 fixture dataset 标记、formal mode blocked、write-like routes unavailable、无敏感输出、同作者不计名额、系统/运营对标来源、全评级、M4 entry-only 和 admin M3 页面渲染。

## 禁止范围核对

| 项目 | 结果 | 证据 |
|---|---|---|
| 修改 `db/migrations/` | 否 | M3 diff 未包含 `db/migrations/` |
| 新增数据库依赖 | 否 | M3 repository 使用 fixture 常量；`package.json` 无 M3 新 DB 依赖 |
| 新增 private data 依赖 | 否 | fixture 使用 `SYN-*` 标识；未引用 `data/private-output/**` |
| 提交 private Excel/CSV/JSON | 否 | M3 diff 未包含 private output 文件 |
| 提交真实作品/作者/渠道/账单行 | 否 | M3 fixture 使用 synthetic markers |
| 新增 formal API | 否 | M3 API 当前只定义 GET fixture endpoints；write routes 不可用 |
| formal-like 命名风险 | 低 | `/api/m3/new-products/...` 路径未带 fixture 字样，但 dataset、guard、文档和测试均明确 fixture-only |

## 后续建议

1. 正式 M3 前必须单独设计正式 persistence、migration、task/write API、release/export/audit chain。
2. 正式 M3 前必须完成 M2 formal readiness rerun 和用户单独授权。
3. 若后续接入真实材料，必须单独确认原始 Word/PPT/PDF 或其他材料的保存策略、权限和脱敏规则。
