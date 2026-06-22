# 有声书产品收入评估与年度目标系统 PRD v0.2

**状态：M1 工程冻结准备版**  
**确认日期：2026-06-20**  
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

当前仓库已经完成 M1+M2 staged engineering / fixture / non-formal candidate / formal-readiness prototype 阶段性收口，但这不等于 M1 正式真实数据验收完成，也不等于 M2 formal evaluation 完成。

M2 冻结候选为 `m2-c3-cleaned-bill-nonformal-v0.2/candidate-a`。该候选只能作为非正式算法候选基线，不能用于正式发布决策；授权本地真实数据开发已经产生新的开发候选 `m2-realdata-dev-candidate-b-v0.1`，可用于下一轮业务复核和继续开发，但不是最终正式发布审批结果。

当前策略已经进入 **authorized local real-data development mode**：允许读取用户提供的本地真实数据和 `data/**`，允许使用本地开发数据库、本地 Docker/PostgreSQL、本地 migration、真实数据导入、严格对账、回测和算法校准。仍禁止提交原始账单、台账、私有 Excel/CSV、`.env`、`.pgpass`、数据库 dump、临时数据库文件或敏感明细；仍禁止连接远端生产/共享数据库，除非用户未来单独授权。下一阶段入口见 `NEXT-CODEX-INSTRUCTION.md`。

本地 DB-backed import/reconciliation runner 和 candidate-b review workflow runner 已实现并通过本地 PostgreSQL 16（`postgres:16-bookworm`）开发验证；本地 schema 到 `0070.000`，candidate-b 聚合结果已写入本地开发库并完成 DB-backed reconciliation。该结果仍是授权本地开发证据，不是最终正式发布审批结果。

candidate-b 的 85 条 blocking review items 已进一步压缩为 4 个 group-level 决策组，并生成可提交的 group decision policy、中文 user decision brief，以及 gitignored 私有 group decision template。下一步应由用户/业务确认 group-level policy，而不是逐行手工填写 85 条；未确认的 group 和 item 仍保持 `pending`。

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
11. `docs/analysis/m2-real-data/M2-candidate-b-review-group-decision-policy-v0.1.md`
12. `docs/analysis/m2-real-data/M2-candidate-b-data-gap-remediation-summary-v0.1.md`
13. `docs/analysis/m2-real-data/M2-candidate-b-expiry-waiver-policy-draft-v0.1.md`
14. `docs/analysis/m2-real-data/M2-candidate-b-manual-exception-brief-v0.1.md`
15. `docs/analysis/m2-real-data/M2-candidate-b-review-user-decision-brief-v0.1.md`
16. `NEXT-CODEX-INSTRUCTION.md`

## Latest candidate-b local review note

The current candidate-b business-review work is in remediation/decision-prep, not final approval. The data-gap group has been diagnosed through local DB-backed aggregate evidence: 57 of 57 data-gap blockers still require source data correction or explicit business decision, with no safe auto-fix applied. The expiry group has a scoped waiver policy draft only, and the insufficient-history / abnormal-spike groups remain manual exceptions. All final review decisions remain unapplied until user/business confirmation.

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
