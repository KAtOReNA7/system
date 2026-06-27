# 下一步交给 Codex 的指令

当前入口不是继续改 M2 算法，不是连接正式数据库，不是进入 M3 formal execution。

当前入口是：

`M3 fixture/prototype review and next authorization decision`

## 当前状态

- M2 本地候选阶段已保存为大版本 checkpoint。
- M3-0 到 M3-7 已完成 fixture/prototype 开发：
  - M3-0 PRD/API/data/page/test contract pack。
  - M3-1 选题库与输入 readiness fixture。
  - M3-2 材料元数据与结构化确认 fixture。
  - M3-3 对标与作者排位 fixture。
  - M3-4 五年/首年预测 fixture。
  - M3-5 新品评级与风险 fixture。
  - M3-6 选题与老品关联 fixture。
  - M3-7 回测与校准入口 fixture。
- 当前实现为 synthetic fixture/prototype，`notForFormalDecision=true`。
- M3 formal execution 仍未授权。

## 优先读取文件

1. `docs/prd/30-new-product-evaluation/M3-new-product-evaluation-prd-v0.1.md`
2. `docs/api/M3-new-product-evaluation-api-contract-v0.1.md`
3. `docs/technical-design/M3-new-product-evaluation-data-model-v0.1.md`
4. `docs/product/M3-new-product-evaluation-pages-v0.1.md`
5. `docs/validation/M3-new-product-evaluation-test-plan-v0.1.md`
6. `docs/analysis/m3/M3-0-to-M3-7-development-summary-v0.1.json`
7. `src/domain/newProductEvaluation/fixtureEngine.js`
8. `src/repositories/newProductEvaluationFixtureRepository.js`
9. `src/http/app.js`
10. `public/admin/app.js`
11. `test/m3-new-product-api.test.js`
12. `test/m3-new-product-fixture-engine.test.js`
13. `test/e2e/admin.e2e.test.js`

## 当前允许做的事

- 审阅 M3 fixture/prototype 的 PRD 符合性。
- 调整 M3 fixture 页面或 API contract。
- 增补 fixture 测试。
- 准备用户确认表或下一步授权清单。

## 当前禁止做的事

- 禁止 M3 formal execution。
- 禁止连接远端生产、共享、staging-like 或未明确授权数据库。
- 禁止写正式主数据。
- 禁止提交 `data/private-output/**`、private Excel/CSV/JSON、原始账单、原始台账、完整作品明细、`.env`、`.pgpass`、dump、sqlite/db 文件。
- 禁止使用 `git add .`。
- 禁止触碰 stash。
- 禁止 force push。

## 推荐下一步

先让用户审阅 M3 fixture/prototype 页面与 API 输出。若通过，再单独决定是否进入 M3 local non-formal implementation hardening；formal M3 仍需 M2 readiness rerun、正式主数据闭环和用户单独授权。
