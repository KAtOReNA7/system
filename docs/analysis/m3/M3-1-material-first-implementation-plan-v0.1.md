# M3-1 material-first implementation plan v0.1

生成日期：2026-06-28

状态：fixture/prototype implementation plan。

## 1. 本轮实现范围

- M3 material field extractor；
- M3 readiness engine；
- M3 channel point forecast；
- M3 new-product candidate rating；
- M3 fixture evaluation engine；
- M3 fixture-only API；
- M3 read-only admin prototype；
- M3 tests。

## 2. 明确不做

- 不写 migration；
- 不连接数据库；
- 不读取真实 private 物料；
- 不上传文件；
- 不保存 raw material；
- 不输出开发建议；
- 不输出资源投入等级；
- 不进入 M3 formal execution。

## 3. 代码路径

- `src/domain/newProductEvaluation/materialFieldExtractor.js`
- `src/domain/newProductEvaluation/newProductReadiness.js`
- `src/domain/newProductEvaluation/channelForecast.js`
- `src/domain/newProductEvaluation/newProductRating.js`
- `src/domain/newProductEvaluation/newProductEvaluationEngine.js`
- `src/domain/newProductEvaluation/fixtures/newProductMaterials.fixture.js`
- `src/repositories/newProductEvaluationFixtureRepository.js`

## 4. API 路径

- `GET /api/m3/new-product/material-fixtures`
- `GET /api/m3/new-product/material-fixtures/:id`
- `POST /api/m3/new-product/material-fixtures/:id/parse`
- `POST /api/m3/new-product/material-fixtures/:id/evaluate`

所有 API 仅处理 synthetic fixture，不接收真实文件上传，不写入数据库。

## 5. 测试路径

- `test/m3-material-field-extractor.test.js`
- `test/m3-new-product-readiness.test.js`
- `test/m3-channel-forecast.test.js`
- `test/m3-new-product-evaluation-engine.test.js`
- `test/m3-api-fixture.test.js`
- `test/m3-admin-prototype.test.js`

## 6. 验收

- material-first 是默认入口；
- structured topic table 仅 fallback；
- source 仅 publication / web_original；
- other source 被拒绝；
- 缺 hard blockers 时 blocked；
- 缺 warning 字段时不 blocked；
- 每个渠道独立 forecast；
- totalForecast 等于 channelForecasts 求和；
- 不输出 forecast range；
- 不输出开发建议和资源投入等级；
- response 包含 `nonFormal: true`。
