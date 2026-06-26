# 有声书产品收入评估与年度目标系统 PRD v0.2

**状态：M1/M2 本地真实数据开发 checkpoint**
**确认日期：2026-06-26**
**面向读者：运营、Codex、开发与测试**

## 本版本目的

v0.2 将 v0.1 的业务汇总稿改造成更适合 Codex 长期维护的文档结构：

- 每条正式规则只有一个权威定义位置；
- 使用稳定需求编号；
- 总体文档只摘要并引用专项规则；
- 冲突记录转为决策记录，不再永久充当最高优先级补丁；
- M1 需求与验收用例建立追踪关系；
- 真实数据分析后才能决定的内容继续保持待定。

## 当前工程进度提示

当前仓库处于 **authorized local real-data development mode**。允许读取用户提供的本地真实数据和 `data/**`，允许使用本地开发数据库、本地 Docker/PostgreSQL、本地 migration、真实数据导入、严格对账、回测和算法校准。仍禁止提交原始账单、台账、私有 Excel/CSV/JSON、`.env`、`.pgpass`、数据库 dump、临时数据库文件或敏感明细；仍禁止连接远端生产、共享、staging-like 或未明确授权的数据库。

当前远端 `main` 已包含 M1/M2 本地开发 checkpoint：

- M1 dual-source 主数据补全链路已形成文件级 limited local staging apply 证据；该 staging 不写正式主数据，不等同于正式主数据验收。
- M2 candidate-b DB-backed import/reconciliation、review workflow 和本地 business closure 证据已完成；这些结果是授权本地开发证据，不是最终生产发布审批结果。
- candidate-b 系列预测模型已不再作为 M2 算法基线；当前预测路线为 disentangled forecastability v1.1 conditional，仍只能作为有限 M2 业务复核候选，不允许直接进入正式发布或 M3。
- M2 评级/建议已推进到 rating-standard-v3：包含收入模式识别、货架/版权状态推断、单一前台评级、风险/复核提示，并移除自动运营建议主输出。private 任务包保存在 `data/private-output/**`，不会进入版本控制。
- 当前 M2 仍不是 formal completion；正式发布、映射激活、对外 task/export/write API、生产数据连接和 M3 均需要用户后续单独授权。

## 推荐阅读顺序

1. `docs/prd/README.md`
2. `docs/prd/00-governance/scope.md`
3. `docs/prd/00-governance/glossary.md`
4. `docs/prd/10-data-foundation/overview.md`
5. `docs/prd/10-data-foundation/bill-import.md`
6. `docs/prd/10-data-foundation/data-quality.md`
7. `docs/prd/10-data-foundation/work-master-data.md`
8. `docs/prd/70-acceptance/M1.md`
9. `docs/prd/00-governance/traceability.md`
10. `docs/technical-design/M2-next-stage-formalization-master-plan-v0.1.md`
11. `docs/analysis/m1-master-data/M1-dual-source-limited-staging-apply-result-v1.json`
12. `docs/analysis/m2-real-data/M2-disentangled-forecast-v1.1-validation.md`
13. `docs/analysis/m2-real-data/M2-rating-standard-v3-task-pack-summary.md`
14. `docs/analysis/m2-real-data/M2-revenue-model-business-rule-alignment-v1.md`
15. `docs/analysis/m2-real-data/M2-shelf-status-business-rule-alignment-v1.md`
16. `docs/analysis/m2-real-data/M2-front-rating-simplification-v1.md`
17. `docs/analysis/m2-real-data/M2-suggestion-removal-boundary-v1.md`
18. `AGENTS.md`
19. `NEXT-CODEX-INSTRUCTION.md`

## Latest M1/M2 checkpoint note

The current remote checkpoint is for local development continuity only. It includes sanitized aggregate reports, source code, scripts, tests, and package scripts for M1/M2 local validation. It intentionally excludes private workbooks, private JSON/CSV outputs, raw bills, raw ledgers, original library files, database dumps, environment files, and sensitive row-level details.

## M1 本地验证命令

当前 M1 应用和最小只读管理端使用 Node.js、原生 HTTP 服务和 PostgreSQL 驱动。

常规验证：

```bash
npm run lint
npm run build
npm test
npm run smoke
npm run check:no-real-data
```

管理端浏览器 E2E：

```bash
npm run test:e2e
```

E2E 使用 Playwright 启动本地临时 HTTP 服务和 Chromium 浏览器，仅访问 `/admin`、前端 fixture 和无数据库配置的降级态。首次在新机器运行前，如本地尚未安装 Playwright 浏览器，请执行：

```bash
npx playwright install chromium
```

CI/E2E 默认仍使用 fixture/no-DB 路径，不要求 GitHub Actions 访问真实数据。本地授权开发可另行读取真实数据、连接本地开发库、执行本地 migration 和回测脚本，但不得提交原始数据或敏感明细。

## CI 门禁

GitHub Actions 工作流位于 `.github/workflows/ci.yml`，使用 Node.js 24 和 `npm ci`。

CI 当前执行：

```bash
npm run check:no-real-data
npm run lint
npm run build
npm test
npm run smoke
npm run test:e2e
```

CI 会在运行 E2E 前执行：

```bash
npx playwright install chromium
```

CI 显式将 `M1_APP_ENV` 设为 `ci`，并将 `M1_DATABASE_URL`、`M1_DATABASE_READONLY_URL`、`M1_DATABASE_BACKGROUND_URL` 保持为空。CI 不应连接数据库、不应读取或导入真实数据，也不应执行 mapping_version 激活。本地授权真实数据开发脚本必须保持可选运行，不能让 CI 依赖私有数据。

## 版本边界

- 本包冻结 M1 开发前的业务语义、数据边界和验收框架。
- 具体数据库表、索引、框架和接口实现由后续技术设计决定。
- 评级门槛、生命周期阈值、预测算法、性能最终数值等继续保持待真实数据验证。
- v0.1 原文和 Codex 审阅报告保存在 `docs/archive/v0.1/`，仅用于历史追溯，不作为当前权威规则。
