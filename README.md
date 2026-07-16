# 有声书产品收入评估与年度目标系统 PRD v0.2

**状态：M1/M2 本地真实数据开发 checkpoint**
**确认日期：2026-07-13**
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
- candidate-b 系列预测模型已不再作为 M2 算法基线。用户已于 2026-07-13 明确拒绝将 disentangled forecastability v1.1 conditional 作为最终上线算法；该版本只保留为历史校准证据，不得 release，也不得作为 M3 输入。
- M2 评级/建议已推进到 rating-standard-v3：包含收入模式识别、货架/版权状态推断、单一前台评级、风险/复核提示，并移除自动运营建议主输出。private 任务包只保存在 Git 忽略区域，不会进入版本控制。
- 2026-07-08 本地五源重清洗已完成：账单、数字版权台账、原创全库、原创全库2、授权汇总台账、授权关系仪表板合并后，作者、版权开始、版权到期三个核心字段已形成本地文件级 staging 候选。该候选覆盖 3053 个账单作品、9159 个核心字段，其中 8729 个字段为高置信直接通过，430 个字段为用户确认填写；仍未写正式主数据，private 输出不进入版本控制。
- 2026-07-09 状态类字段已完成本地文件级 staging：作品状态和音频版权状态覆盖 3053 个账单作品、6106 个状态字段；作品状态分布为已上架 2410、已下架 643；音频版权状态分布为版权有效 2238、无限期 487、版权已到期 328。该结果仍未写正式主数据。
- 2026-07-10 分类树和辅助标签口径已更新：历史三级分类新增先秦、汉、三国、南北朝、隋、唐、五代十国、宋、元、明、清、近代史；辅助标签新增国家组，仍与一级、二级、三级分类分开管理。
- 用户已完成分类与辅助标签人工核对：257 部人工分类和 51 部辅助标签核对均已应用到本地文件级 staging。3053 部作品分类路径全部有效，其中系统自动 2796 部、用户确认 257 部；正式主数据仍未写入。
- 用户已完成 19 条国家标签核对：采用 6 条、不采用 13 条；当前本地辅助标签结果覆盖 57 部作品、127 个标签赋值。
- 作者、版权开始、版权到期、作品状态和音频版权状态已按用户确认口径完成本地文件级 staging 收口，不再进入当前人工补表。历史基础字段补表入口已废弃。
- 2026-07-10 用户已完成并明确确认分类与标签最终基础大表。最终覆盖 3053 部作品，出版物 1195 部、网文 1858 部，分类路径和标签均有效，分类与标签人工缺口为 0。
- 最终大表相对系统预填基线修正 836 部作品；当前有 387 部作品包含 532 个辅助标签赋值。新增“科普、教辅、诗歌”三级分类及 11 个辅助标签已进入受控词表版本 `2026-07-10-user-confirmed-v2`。
- 用户已确认大表中的 2 个作者显示修改属于误操作；系统已恢复为此前已收口作者值，未进入固定结果，也不会进入提交。当前没有作者人工待办。
- 2026-07-10 已完成最终基础表接入后的 M2 重算：旧 3054 部口径中的 1 个历史分册身份已在内存中归并到已确认标准作品，192872 行账单和收入金额全部保留，账单/基础表/评估范围均统一为 3053 部。
- 重算后收入模式为纯实销 2578、纯买断 287、买断+实销 183、unknown 5；前台评级为 S+ 38、S 117、A 84、B 358、C 152、D 356、E 1948。相对旧 checkpoint 只减少被归并的 1 条纯实销/E 旧身份，没有模型规则回归。
- 按 PRD 的 Excel 底层完整金额精度重算后，到期但仍有收入复核桶为 146，版权有效但收入稀疏复核桶为 92。用户已完成全部 238 条确认，系统已校验并应用，形成 238 条审计事件、139 条事实型复核提示，待确认数为 0。
- 逐作品 private 正式基础信息输入已覆盖 3053 部作品并通过 schema、范围、必填字段、状态、复核决定、日期顺序和禁止运营建议字段的内容契约。当前作品状态为已上架 2298、已下架 755；音频版权状态为版权有效 2250、无限期 473、版权已到期 330；跨来源期限/当前权利状态冲突和到期早于开始均为 0。
- 2026-07-13 已在隔离本地 PostgreSQL 16 完成获授权的 M2 正式执行：Flyway schema `0071.020`、3053 部正式基础信息版本、192872 条收入事实及 projection、active mapping、3053 条 DB-backed evaluation/input snapshot、task/audit 和 3053 条 prepared export item 均已写入并严格对账通过。
- prepared export 当前仍未 released：预测候选 `m2-realdata-dev-disentangled-forecast-v1.1-conditional` 已被用户拒绝，算法继续保持 `is_formal=false`，评估结果保持 `not_for_formal_decision=true`，最终发布批准为 false。禁止把该 package 改为 approved/released。
- M2 正式口径已冻结为不输出自动运营建议或资源投入动作；只保留风险和事实型复核提示。正式导出不得包含运营建议字段。
- 当前 3053 部基础信息是用户能够提供的最终、最准确基础数据版本，后续最终上线预测算法必须以该版本和对应 192872 条收入事实为输入，不得退回旧补表或旧 3054 口径。
- 当前 M2 的隔离本地正式执行链已走到 prepared export，但 v1.1 已拒绝，最终 formal release 尚未完成。下一开发方向是基于已冻结基础数据校准并验证最终上线预测算法；本轮不直接开始开发。M3 formal execution 未获授权，3 至 5 份代表性选题材料继续暂缓。

## M2 后续补全信息提醒

在继续任何 M3 设计或实现前，必须先确认以下 M2 信息仍是后续补全项，不能把当前 M2 local candidate 当作 formal complete：

| 数据项 | 当前缺口/状态 | 对 M2/M3 的影响 |
|---|---:|---|
| 作者 | 缺口 0；已写入隔离本地 active 正式基础信息版本 | 非生产发布，不再生成作者补表 |
| 版权开始 | 人工缺口 0；已写入隔离本地 active 正式基础信息版本和 evaluation snapshot | 不再进入分类与标签核对表 |
| 版权到期 | 人工缺口 0；无限期/相对期限/仅年份/到期日未知语义由 `0071.020` 保真持久化 | 不再静默改为空日期，不再生成旧补表 |
| 一级分类 | 出版物 1195、网文 1858；人工缺口 0 | 已写入隔离本地 active 分类版本 |
| 二级分类 | 3053 部均已固定；人工缺口 0 | 已写入隔离本地 active 分类版本 |
| 三级分类 | 3053 部均已固定；新增科普、教辅、诗歌已进入受控词表 | 已写入隔离本地 active 分类版本 |
| 辅助标签 | 387 部作品、532 个标签赋值已固定；人工缺口 0 | 已写入隔离本地正式基础信息关联 |
| 特殊属性标签 | 当前 M1/M2 人工收口不再启用独立字段；后续只有在明确新增规则和版本时才单独治理 | 不阻断本轮分类与标签人工收口 |
| 作品状态 | 已上架 2298、已下架 755；已写入隔离本地 active 正式基础信息版本 | 可支撑当前 DB-backed M2 评估 |
| 音频版权状态 | 版权有效 2250、无限期 473、版权已到期 330；已写入隔离本地 active 正式基础信息版本 | 期限与当前状态分别保真，冲突计数 0 |
| 到期但仍有收入样本 | 146 条已全部确认并应用，待确认 0 | 保留事实型审计/复核提示，不再构成人工数据阻断 |
| 版权有效但收入稀疏样本 | 92 条已全部确认并应用，待确认 0 | 状态决定已进入 private 输入候选，不再构成人工数据阻断 |

当前状态证据见：

- `docs/analysis/m2-real-data/M2-local-candidate-closeout-v1.md`
- `docs/analysis/m2-real-data/M2-classification-tag-foundation-local-closeout-v1.md`
- `docs/analysis/m2-real-data/M1-M2-post-foundation-project-status-v1.md`
- `docs/analysis/m3/M3-parallel-planning-boundary-v1.md`

早期 master-data/copyright gap 报告仅用于历史追溯，不再作为当前人工补表入口。

## M3 当前状态提醒

当前 `main` 的 M3 状态为：`prototype complete / user-deferred until M2 closure / formal blocked`。本地 fixture/synthetic 主链已覆盖 material-first、字段补全、readiness、外部证据结构、对标、作者排位、渠道点预测、候选评级、workflow 和 backtest anchor；不代表 M3 formal execution 已开始，也不包含正式 M3 发布能力。

M3 private 材料准备、dry-run 和 human acceptance 当前均按用户决定暂缓。M2 已完成隔离本地持久化、mapping activation、formal-evaluation run、task/audit 和 prepared export，但用户已拒绝当前 v1.1 conditional 算法与对应 release。新算法通过回测、业务抽检和 release gate 前，不得进入 M3 formal execution，不得开放正式 M3 task/export/write API。

截至 2026-07-13，作者、版权日期、作品状态、音频版权状态、分类、标签和 146/92 两类业务复核均已收口；隔离本地正式执行与严格对账已通过，DB-backed export 状态为 `prepared`。v1.1 已明确拒绝，下一步只推进基于最终基础数据的 M2 上线预测算法校准、回测和新一轮业务验收；M3 formal execution 仍未授权。

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
21. `docs/analysis/m2-real-data/M2-post-foundation-readiness-rerun-v1.md`
22. `docs/analysis/m2-real-data/M2-post-foundation-formal-gap-audit-v1.md`
23. `docs/analysis/m2-real-data/M2-formal-local-execution-summary-v1.md`
24. `docs/analysis/m3/M3-next-execution-roadmap-v1.md`
25. `docs/analysis/m3/M3-local-prototype-closeout-v0.1.md`
26. `docs/analysis/m3/M3-formal-boundary-after-prototype-v0.1.md`
27. `docs/technical-design/M3-restart-development-plan-v0.1.md`（历史设计背景）
28. `AGENTS.md`
29. `NEXT-CODEX-INSTRUCTION.md`

## Latest M1/M2 checkpoint note

The current remote checkpoint is for local development continuity only. It includes sanitized aggregate reports, source code, scripts, tests, and package scripts for M1/M2 local validation. It intentionally excludes private workbooks, private JSON/CSV outputs, raw bills, raw ledgers, original library files, database dumps, environment files, and sensitive row-level details.

### 2026-07-15 M2 正式现金目标校正

M2 正式 point forecast 已冻结为未来账单现金：未来实销现金，加 cutoff 时已确认且可审计的未来应收。未承诺未来买断、历史周期推测、买断概率乘金额、已到账买断未来摊销及 `buyoutMonthlyEquivalent` 均不进入正式现金预测；买断月均等效值只用于历史价值和评级。

当前权威输入没有历史 cutoff commitment as-of 数据角色，因此后来发生的买断只能进入 `uncommittedBuyoutSurpriseActual`，不能事后恢复为已承诺。冻结 development universe 的 scoreable 重叠 case-window 聚合为：`forecastableCashActual=82206415.70`、`uncommittedBuyoutSurpriseActual=5517115.15`、`totalLedgerCashActual=87723530.85`。case key、eligibility 和所有 sealed labels 未改变。

legacy-target C2-R development 已完成但结论为 `FAIL`，其结果继续作为历史目标口径证据，不是 formal-cash 指标，也不得与 C2-R.1 直接比较；旧 development 写入口现已 fail-closed，只保留历史验证入口。2026-07-16 formal-cash comparator replay 已在 7851 个固定模型人口 case 上冻结 B4 为 primary，Gate B 经远端 checkpoint 后验证为 14/14；随后获授权的 C2-R.1 development 使用 45 个预冻结透明候选完成训练与验证，overall WAPE 0.5838、signed bias +2.93%，23 项验收通过 13 项，结论为 `FAIL`。C2/C3 未开始；所有结果仍为 `not_for_formal_decision`，final holdout、embargo shadow 和 deferred 60-month labels 仍 sealed，未 release，未进入 M3。

正式现金口径证据：

- `docs/analysis/m2-real-data/M2-formal-cash-forecast-target-decision-v1.md`
- `src/domain/oldProductEvaluation/calibrationSpec.c2r.v1.1.amendment.json`
- `docs/analysis/m2-real-data/M2-C2R1-formal-cash-target-separation-v1.md`
- `docs/analysis/m2-real-data/M2-C2R1-buyout-commitment-as-of-audit-v1.md`
- `docs/analysis/m2-real-data/M2-C2R1-old-target-new-target-bridge-v1.md`
- `docs/analysis/m2-real-data/M2-C2R-legacy-target-supersession-v1.md`
- `docs/analysis/m2-real-data/M2-formal-cash-comparator-replay-v1.md`
- `docs/analysis/m2-real-data/M2-surprise-buyout-unique-impact-audit-v1.md`
- `docs/analysis/m2-real-data/M2-calibration-gate-b-v1.json`
- `docs/analysis/m2-real-data/M2-C2R1-development-validation-v1.md`

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

- PRD v0.2 保留稳定业务语义、数据边界和验收框架；当前工程状态以最新脱敏 checkpoint、closeout 和 formal-boundary 证据为准。
- local candidate、private dry-run 和 fixture prototype 均不自动转为 formal approval。
- M2 本地正式持久化、审计和 prepared export 已实现；v1.1 conditional 已被用户拒绝，必须完成新算法校准和新一轮验收后才能重新申请 release，且任何本地执行都不代表生产部署或生产审批。
- v0.1 原文和早期 gap 报告仅用于历史追溯，不得重新作为当前人工待办入口。

# M3 Private Completion Pack Recovery

After a new machine runs `git pull origin main`, ignored private materials and completion packs are intentionally absent. README/AGENTS never record machine-specific absolute paths and never promise that ignored artifacts exist on every computer.

Use this local recovery flow:

```bash
git pull origin main
npm ci
npm run check:no-real-data
npm run m3:private-completion-bootstrap
```

Provide 3 to 5 private topic materials through the Git-ignored private input role before running the bootstrap command. Supported primary formats are `.doc`, `.docx`, `.pdf`, `.pptx`, `.jpg`, `.jpeg`, `.png`, `.txt`, `.md`, and `.xlsx`.

If no private input materials are present, the command stops with guidance and does not fabricate a completion pack. If private input materials are present, it regenerates the ignored local completion pack. Only the bootstrap code, format contract, safety tests and sanitized evidence are committed.

The private completion pack is not committed. After the user fills it, apply requires separate authorization and can be run with `npm run m3:field-completion-apply`. This remains local private execution, not M3 formal execution.
