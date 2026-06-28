# M3-2 comparable author ranking implementation plan v0.1

生成日期：2026-06-28

状态：M3-2 fixture/prototype implementation plan。

## 1. 实施范围

本轮实现：

- M3 comparable work selector；
- M3 author ranking；
- synthetic comparable/author fixture；
- evaluation engine 接入；
- fixture-only API；
- admin read-only 展示；
- 自动化测试；
- 脱敏 summary。

## 2. 不做范围

- 不进入 M3 formal execution；
- 不连接数据库；
- 不写 migration；
- 不读取或提交 private 物料；
- 不生成用户填写复核包；
- 不输出“是否建议开发”；
- 不输出资源投入等级；
- 不恢复 forecast range。

## 3. 实现路径

- `src/domain/newProductEvaluation/comparableWorkSelector.js`
- `src/domain/newProductEvaluation/authorRanking.js`
- `src/domain/newProductEvaluation/fixtures/newProductComparableWorks.fixture.js`
- `src/domain/newProductEvaluation/newProductEvaluationEngine.js`
- `src/repositories/newProductEvaluationFixtureRepository.js`
- `src/http/app.js`
- `public/admin/app.js`

## 4. API

新增只读 fixture API：

- `GET /api/m3/new-product/material-fixtures/:id/comparables`
- `GET /api/m3/new-product/material-fixtures/:id/author-ranking`

现有 evaluate API 同步返回 `comparableWorks` 和 `authorRanking`。

## 5. 测试

新增或更新：

- `test/m3-comparable-work-selector.test.js`
- `test/m3-author-ranking.test.js`
- `test/m3-new-product-evaluation-engine.test.js`
- `test/m3-api-fixture.test.js`
- `test/m3-admin-prototype.test.js`

本阶段不做人工测试，等 M3 主要开发链路完成后再统一人工验收。
