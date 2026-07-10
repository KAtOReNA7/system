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
- 2026-07-08 本地五源重清洗已完成：账单、数字版权台账、原创全库、原创全库2、授权汇总台账、授权关系仪表板合并后，作者、版权开始、版权到期三个核心字段已形成本地文件级 staging 候选。该候选覆盖 3053 个账单作品、9159 个核心字段，其中 8729 个字段为高置信直接通过，430 个字段为用户确认填写；仍未写正式主数据，private 输出不进入版本控制。
- 2026-07-09 状态类字段已完成本地文件级 staging：作品状态和音频版权状态覆盖 3053 个账单作品、6106 个状态字段；作品状态分布为已上架 2410、已下架 643；音频版权状态分布为版权有效 2238、无限期 487、版权已到期 328。该结果仍未写正式主数据。
- 2026-07-10 分类树和辅助标签口径已更新：历史三级分类新增先秦、汉、三国、南北朝、隋、唐、五代十国、宋、元、明、清、近代史；辅助标签新增国家组，仍与一级、二级、三级分类分开管理。
- 用户已完成 `M2-classification-aux-tag-fill-pack-cn-v3.xlsx`：257 部人工分类和 51 部辅助标签核对均已应用到本地文件级 staging。3053 部作品分类路径全部有效，其中系统自动 2796 部、用户确认 257 部；正式主数据仍未写入。
- 用户已完成 19 条国家标签核对：采用 6 条、不采用 13 条；当前本地辅助标签结果覆盖 57 部作品、127 个标签赋值。
- 作者、版权开始、版权到期、作品状态和音频版权状态已按用户确认口径完成本地文件级 staging 收口，不再进入当前人工补表。此前生成的 `M2-foundation-data-final-human-review-pack-cn-v1.xlsx` 已废弃，禁止继续作为当前任务入口。
- 2026-07-10 用户已完成并明确确认分类与标签最终基础大表；系统已将其固定为 `data/private-output/m2-readiness/M2-classification-tag-foundation-local-fixed-cn-v1.xlsx/json`。最终覆盖 3053 部作品，出版物 1195 部、网文 1858 部，分类路径和标签均有效，分类与标签人工缺口为 0。
- 最终大表相对系统预填基线修正 836 部作品；当前有 387 部作品包含 532 个辅助标签赋值。新增“科普、教辅、诗歌”三级分类及 11 个辅助标签已进入受控词表版本 `2026-07-10-user-confirmed-v2`。
- 用户已确认大表中的 2 个作者显示修改属于误操作；系统已恢复为此前已收口作者值，未进入固定结果，也不会进入提交。当前没有作者人工待办。
- 较早 M2 聚合仍按 3054 部计算，而最终固定基础表为 3053 部；这是下一轮工程重算必须解释和统一的范围差异，不需要用户手工判断。
- 当前 M2 仍不是 formal completion；正式发布、映射激活、对外 task/export/write API、生产数据连接和 M3 formal execution 均需要用户后续单独授权。

## M2 后续补全信息提醒

在继续任何 M3 设计或实现前，必须先确认以下 M2 信息仍是后续补全项，不能把当前 M2 local candidate 当作 formal complete：

| 数据项 | 当前缺口/状态 | 对 M2/M3 的影响 |
|---|---:|---|
| 作者 | 本地文件级 staging 候选已闭环，当前缺口 0；正式主数据尚未写入 | 可支撑后续本地 M2 readiness 重算，但不等于正式主数据验收 |
| 版权开始 | 本地文件级 staging 已按用户确认口径收口，当前人工缺口 0；正式主数据尚未写入 | 不再进入分类与标签核对表 |
| 版权到期 | 本地文件级 staging 已按用户确认口径收口；“无限期”直接作为有效值，当前人工缺口 0；正式主数据尚未写入 | 不再进入分类与标签核对表 |
| 一级分类 | 用户最终基础大表已固定：出版物 1195、网文 1858；人工缺口 0 | 可作为后续本地 M2 readiness 输入；尚未写正式主数据 |
| 二级分类 | 3053 部均已由最终基础大表固定；人工缺口 0 | 可支撑本地细分策略和同类对标 |
| 三级分类 | 3053 部均已固定；新增科普、教辅、诗歌已进入受控词表 | 可支撑本地完整分类路径和分层回测 |
| 辅助标签 | 387 部作品、532 个标签赋值已固定；人工缺口 0 | 可支撑本地特殊项目解释和校准 |
| 特殊属性标签 | 当前 M1/M2 人工收口不再启用独立字段；后续只有在明确新增规则和版本时才单独治理 | 不阻断本轮分类与标签人工收口 |
| 作品状态 | 本地文件级 staging 已闭环：已上架 2410、已下架 643；正式主数据尚未写入 | 可支撑本地货架/下架判断，但不等于 formal 主数据验收 |
| 音频版权状态 | 本地文件级 staging 已闭环：版权有效 2238、无限期 487、版权已到期 328；正式主数据尚未写入 | 可支撑本地版权有效性判断，但不等于 formal 主数据验收 |
| 到期但仍有收入样本 | 142 个复核桶 | 需判断结算滞后、续约未入账、渠道滞后或异常 |
| 版权有效但收入稀疏样本 | 92 个复核桶 | 需运营/版权确认是否仍可运营、仅观察或无需动作 |

当前状态证据见：

- `docs/analysis/m2-real-data/M2-local-candidate-closeout-v1.md`
- `docs/analysis/m2-real-data/M2-classification-tag-foundation-local-closeout-v1.md`
- `docs/analysis/m2-real-data/M1-M2-post-foundation-project-status-v1.md`
- `docs/analysis/m3/M3-parallel-planning-boundary-v1.md`

早期 master-data/copyright gap 报告仅用于历史追溯，不再作为当前人工补表入口。

## M3 当前状态提醒

当前 `main` 保留 M3 parallel planning 边界、实施方案摘要与非正式 fixture/prototype 测试能力；不代表 M3 formal execution 已开始，也不包含正式 M3 发布能力。

允许继续准备 M3 开发计划、字段清单、接口依赖、fixture/prototype 方案和测试计划；但在 M2 readiness 未重新闭环前，不得进入 M3 formal execution，不得开放正式 task/export/write API，不得把 M2 local candidate 作为 formal M3 输入。

截至 2026-07-10，作者、版权日期、作品状态、音频版权状态、一级/二级/三级分类和辅助标签均已在本地文件级候选层收口，当前基础字段不再需要逐条人工补表，2 个作者误操作也已恢复。下一工程动作是使用固定基础 JSON 重跑 M2 readiness、分层统计和本地评估一致性；正式主数据写入、M2 formal gate 和 M3 formal execution 仍需后续单独授权。

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
18. `docs/analysis/m2-real-data/M2-classification-aux-tag-local-staging-summary-v1.md`
19. `docs/analysis/m2-real-data/M2-classification-tag-foundation-local-closeout-v1.md`
20. `docs/analysis/m2-real-data/M1-M2-post-foundation-project-status-v1.md`
21. `docs/technical-design/M3-restart-development-plan-v0.1.md`
22. `AGENTS.md`
23. `NEXT-CODEX-INSTRUCTION.md`

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
# M3 Private Completion Pack Recovery

After a new machine runs `git pull origin main`, the M3 private field completion pack is not restored from Git because it lives under `data/private-output/**` and must remain private.

Use this local recovery flow:

```bash
git pull origin main
npm ci
npm run check:no-real-data
npm run m3:private-completion-bootstrap
```

Place 3 to 5 private topic materials in `data/private-input/m3-material-dry-run/` before running the bootstrap command. Supported primary formats are `.doc`, `.docx`, `.pdf`, `.pptx`, `.jpg`, `.jpeg`, `.png`, `.txt`, `.md`, and `.xlsx`.

If no private input materials are present, the command stops with guidance and does not fabricate a completion pack. If private input materials are present, it runs the local private dry-run and regenerates:

- `data/private-output/m3-dry-run/M3-private-material-field-completion-pack-v0.1.json`
- `data/private-output/m3-dry-run/M3-private-material-field-completion-pack-v0.1.md`

The private completion pack is not committed. After the user fills it, apply requires separate authorization and can be run with `npm run m3:field-completion-apply`. This remains local private execution, not M3 formal execution.
