# M3 fixture/prototype 文件范围审计 v0.1

生成日期：2026-06-28

审计基准：

- 当前 HEAD：`4b32ef8275af9795581c087081f1db45d3c88cee`
- 当前 origin/main：`4b32ef8275af9795581c087081f1db45d3c88cee`
- 工作区状态：审计开始时 clean
- 审计范围：M3-0 到 M3-7 fixture/prototype 三次提交后的仓库状态

## 结论

当前 M3 变更范围可以作为 fixture/prototype baseline。文件范围集中在 PRD/契约/设计文档、synthetic fixture engine、只读 API repository/routes、只读 admin 页面和测试。未发现 `db/migrations/` 变更，未新增正式数据库写入路径，未新增 private data 依赖。

存在一个可接受但需要记录的命名风险：M3 API 路径使用 `/api/m3/new-products/...`，路径本身未包含 `fixture` 字样。该风险已由 dataset 标记、formal mode guard、文档和测试缓解；正式 M3 前建议增加更显性的 fixture-only 命名或版本门禁。

## M3 提交范围

| 提交 | 主题 | 范围 |
|---|---|---|
| `bc1a5438b664576ef4b56084e22b0ef22ccbd1fc` | define new product evaluation contracts | M3 PRD、API contract、data model、page plan、test plan |
| `5002fae41307054fbc4a8f82bbd5e73c14b10415` | add new product fixture APIs | fixture engine、fixture repository、API route、unit/API tests |
| `4b32ef8275af9795581c087081f1db45d3c88cee` | add new product admin prototype | admin 只读页面、E2E、交接 summary |

## 文件分类

### 文档

- `docs/prd/30-new-product-evaluation/M3-new-product-evaluation-prd-v0.1.md`
- `docs/api/M3-new-product-evaluation-api-contract-v0.1.md`
- `docs/technical-design/M3-new-product-evaluation-data-model-v0.1.md`
- `docs/product/M3-new-product-evaluation-pages-v0.1.md`
- `docs/validation/M3-new-product-evaluation-test-plan-v0.1.md`
- `docs/analysis/m3/M3-0-to-M3-7-development-summary-v0.1.json`

判断：均为 fixture/prototype 说明或 summary，不包含正式执行授权。

### API route / server

- `src/http/app.js`
- `src/errors.js`

判断：新增 M3 GET 路由和 `formalM3DataBlocked` 错误；未新增 M3 POST/PUT/PATCH/DELETE 正式写入路径。

### domain / engine

- `src/domain/newProductEvaluation/fixtureEngine.js`

判断：只生成 synthetic fixture 数据结构，包含 forecast/rating/risk/link/backtest 形状；不连接数据库。

### fixture

- `src/fixtures/m3NewProductEvaluationFixture.js`

判断：dataset 显式标记 `mode=fixture`、`syntheticOnly=true`、`notForFormalDecision=true`、`m3FormalExecutionAllowed=false`、`dependsOnM2FormalReadiness=true`。

### repository

- `src/repositories/newProductEvaluationFixtureRepository.js`

判断：只从内存 fixture 常量读取并分页/筛选/排序；没有 DB client、SQL 或持久化写入。

### admin 页面

- `public/admin/index.html`
- `public/admin/app.js`

判断：新增 M3 只读页面：总览、选题库、详情、数据缺口、回测。页面显示 fixture-only 与 formal blocked 提示，不提供上传、正式任务创建、发布或导出控件。

### tests / E2E

- `test/m3-new-product-api.test.js`
- `test/m3-new-product-fixture-engine.test.js`
- `test/e2e/admin.e2e.test.js`
- `package.json`

判断：覆盖 fixture dataset 标记、formal mode blocked、write-like routes unavailable、无敏感输出、admin M3 页面渲染。

## 禁止范围核对

| 项目 | 结果 | 证据 |
|---|---|---|
| 修改 `db/migrations/` | 否 | M3 diff 未包含 `db/migrations/` |
| 新增数据库依赖 | 否 | M3 repository 使用 fixture 常量；`package.json` 无 M3 新 DB 依赖 |
| 新增 private data 依赖 | 否 | fixture 使用 `SYN-*` 标识；未引用 `data/private-output/**` |
| 提交 private Excel/CSV/JSON | 否 | M3 diff 未包含 private output 文件 |
| 提交真实作品/作者/渠道/账单行 | 否 | M3 fixture 使用 synthetic markers |
| 新增 formal API | 否 | M3 API contract 当前只定义 GET fixture endpoints；write routes 不可用 |
| formal-like 命名风险 | 有，低到中 | `/api/m3/new-products/...` 未带 fixture 字样，但返回和 guard 均标记 fixture |

## 后续建议

1. 正式 M3 前将 fixture/prototype API 与 formal API 做路径或版本层隔离。
2. 正式 M3 前补齐 M2 formal readiness rerun 和用户单独授权。
3. 若后续新增 M3 写入、导出、发布或材料上传，必须新开授权任务，不得基于当前 prototype 直接延伸。
