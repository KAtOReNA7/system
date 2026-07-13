# Codex 工作规则

## 当前模式

项目从 2026-06-22 起进入 **authorized local real-data development mode**。

本地开发允许：

- 读取用户提供的本地真实数据，包括 `data/**`。
- 使用本地开发数据库和本地 Docker/PostgreSQL。
- 为本地开发新增或修改 `db/migrations/`。
- 在本地执行 migration、导入、严格对账、回测和算法校准。

本地真实数据开发结果不自动等于正式发布审批结果。

## 当前项目状态快照

- 远端 `main` 已包含 M1/M2 本地开发 checkpoint：dual-source limited local staging、M2 v1.1 conditional forecastability、收入模式识别、货架/版权状态推断、rating-standard-v3 单一前台评级、风险/复核提示和自动运营建议主输出移除。
- M1 dual-source staging 是文件级本地 staging，不写正式主数据，不等于正式主数据验收完成。
- 用户已于 2026-07-13 明确拒绝 M2 v1.1 conditional 作为最终上线预测算法；该版本只能作为历史校准证据，不得 release，也不得作为 M3 输入。rating-standard-v3 仍是当前评级边界，但不改变预测算法被拒绝的事实。
- 2026-07-08 本地五源重清洗已完成：账单、数字版权台账、原创全库、原创全库2、授权汇总台账、授权关系仪表板合并后，作者、版权开始、版权到期三个核心字段已形成本地文件级 staging 候选。该候选覆盖 3053 个账单作品、9159 个核心字段，其中 8729 个字段为高置信直接通过，430 个字段为用户确认填写；仍未写正式主数据，private 输出不进入版本控制。
- 2026-07-09 状态类字段已完成本地文件级 staging：作品状态和音频版权状态覆盖 3053 个账单作品、6106 个状态字段；作品状态分布为已上架 2410、已下架 643；音频版权状态分布为版权有效 2238、无限期 487、版权已到期 328。该结果仍未写正式主数据。
- 2026-07-10 分类树和辅助标签口径已更新：历史三级分类新增先秦、汉、三国、南北朝、隋、唐、五代十国、宋、元、明、清、近代史；辅助标签新增国家组，仍与一级、二级、三级分类分开管理。
- 用户已完成分类与辅助标签人工核对：257 部人工分类和 51 部辅助标签核对均已应用到本地文件级 staging。3053 部作品分类路径全部有效，其中系统自动 2796 部、用户确认 257 部；正式主数据仍未写入。
- 用户已完成 19 条国家标签核对：采用 6 条、不采用 13 条；当前本地辅助标签结果覆盖 57 部作品、127 个标签赋值。
- 作者、版权开始、版权到期、作品状态和音频版权状态已按用户确认口径完成本地文件级 staging 收口，不再进入当前人工补表；历史基础字段补表入口已废弃，禁止继续使用。
- 用户已完成并明确确认分类与标签最终基础大表，覆盖 3053 部作品，出版物 1195、网文 1858，分类与标签人工缺口为 0。private 明细不进入版本控制。
- 最终大表相对系统预填基线修正 836 部作品，固定 387 部作品、532 个辅助标签赋值；新增科普、教辅、诗歌和 11 个辅助标签已进入受控词表 `2026-07-10-user-confirmed-v2`。
- 用户已确认表中 2 个作者显示变化属于误操作；系统已恢复此前已收口作者值，未进入固定结果，也不会进入提交。当前没有作者人工待办，禁止据此重开全量作者补表。
- 2026-07-10 已完成 3054/3053 范围对账：1 个账单独有身份是已确认标准作品的历史分册，已在内存中归并；192872 行账单和收入金额全部保留，账单/基础表/评估范围均为 3053 部。
- 最终基础表重算后，收入模式为纯实销 2578、纯买断 287、买断+实销 183、unknown 5；前台评级为 S+ 38、S 117、A 84、B 358、C 152、D 356、E 1948，无意外回归。
- 按 Excel 底层完整金额精度重算，到期但仍有收入复核桶为 146，版权有效但收入稀疏复核桶为 92；用户已完成全部 238 条确认，系统已校验并应用，待确认数为 0。
- 逐作品 private 正式基础信息输入覆盖 3053 部并通过内容契约；当前作品状态为已上架 2298、已下架 755，音频版权状态为版权有效 2250、无限期 473、版权已到期 330。238 条用户决定全部通过，保留 139 条事实型复核提示。
- 2026-07-13 已在隔离本地 PostgreSQL 16 执行 Flyway `0071.020`，完成 3053 部正式基础信息版本、192872 条收入事实/projection、active mapping、3053 条 evaluation/input snapshot、task/audit 和 prepared export；严格对账全部通过，运营建议数为 0。
- v1.1 仍是 `CONDITIONAL PASS`：WAPE 0.6409、baseline 0.7043、coverage 0.5769、P0/P1/P2=0/0/473、可预测收入覆盖 0.7788、true blocked 收入占比 0.2038。算法仍 `is_formal=false`，export 仍 `prepared`，最终 release 未批准。
- 用户已拒绝上述 v1.1 conditional 和 prepared export；禁止后续 Codex 自动批准、release 或通过改写状态绕过该决定。
- 当前 3053 部基础信息、分类标签、状态、238 条业务决定和 192872 条收入事实是后续 M2 最终上线算法的权威输入。不得退回旧补表、旧 3054 口径或较早 private candidate 覆盖该版本。
- M2 正式输出不再包含自动运营建议或资源投入动作；只允许风险和事实型复核提示。历史 fixture/prototype 建议字段不得进入当前正式结果、页面或导出。
- 146 个到期仍有收入样本和 92 个版权有效但收入稀疏样本已经完成中文 private 确认、校验和应用；不得依据旧报告重新生成这些人工待办。
- `data/private-output/**` 中的 private Excel/CSV/JSON 只供本地查看和用户填写，禁止提交。
- 当前 `main` 保留 M3 parallel planning 边界、实施方案摘要与非正式 fixture/prototype 测试能力；不代表 M3 formal execution 已开始，也不包含正式 M3 发布能力。
- 当前未进入 M3 formal execution；用户已明确暂缓 3 至 5 份代表性选题材料，待 M2 两类复核和正式链路彻底收口后再准备。M3 formal execution 仍需后续单独明确授权。

## M2 后续补全信息提醒

任何 M3 设计、实现或评估前，必须先提醒用户：M2 隔离本地正式执行已完成，但 v1.1 conditional 已被用户拒绝；新的最终上线预测算法尚未完成校准、验收和 release。

| 数据项 | 当前缺口/状态 | 影响 |
|---|---:|---|
| 作者 | 缺口 0；已写入隔离本地 active 正式基础信息版本 | 不再生成作者补表 |
| 版权开始 | 缺口 0；已写入 active 正式基础信息版本与 input snapshot | 不再进入分类与标签核对表 |
| 版权到期 | 缺口 0；受控期限语义已由 `0071.020` 保真持久化 | 不得改回 date-only 或静默置空 |
| 一级分类 | 出版物 1195、网文 1858；人工缺口 0 | 已写入隔离本地 active 分类版本 |
| 二级分类 | 3053 部均已固定；人工缺口 0 | 已写入隔离本地 active 分类版本 |
| 三级分类 | 3053 部均已固定；新增科普、教辅、诗歌已进入受控词表 | 已写入隔离本地 active 分类版本 |
| 辅助标签 | 387 部作品、532 个标签赋值已固定；人工缺口 0 | 已写入隔离本地正式基础信息关联 |
| 特殊属性标签 | 当前 M1/M2 人工收口不启用独立字段；只有后续明确新增规则和版本时才单独治理 | 不阻断本轮分类与标签人工收口 |
| 作品状态 | 已上架 2298、已下架 755；已写入隔离本地 active 正式基础信息版本 | 可支撑 DB-backed M2 评估 |
| 音频版权状态 | 版权有效 2250、无限期 473、版权已到期 330；期限/状态冲突 0 | 已写入隔离本地 active 正式基础信息版本 |
| 到期但仍有收入样本 | 146 条已全部确认并应用，待确认 0 | 保留事实型审计/复核提示，不再构成人工数据阻断 |
| 版权有效但收入稀疏样本 | 92 条已全部确认并应用，待确认 0 | 状态决定已进入 private 输入候选，不再构成人工数据阻断 |

证据文件：

- `docs/analysis/m2-real-data/M2-local-candidate-closeout-v1.md`
- `docs/analysis/m2-real-data/M2-classification-aux-tag-local-staging-summary-v1.md`
- `docs/analysis/m2-real-data/M2-classification-tag-foundation-local-closeout-v1.md`
- `docs/analysis/m2-real-data/M1-M2-post-foundation-project-status-v1.md`
- `docs/analysis/m2-real-data/M2-formal-local-execution-summary-v1.md`
- `docs/analysis/m3/M3-parallel-planning-boundary-v1.md`

早期 master-data/copyright gap 报告只用于历史追溯，不得据此重新生成当前人工任务。

## M3 当前门禁

- 本地和远端 M3 状态必须先确认 clean：`HEAD` 应等于 `origin/main`，工作区不能有非本轮变更。
- 当前允许准备 M3 开发计划、字段清单、接口依赖、fixture/prototype 方案和测试计划。
- M2 隔离本地正式执行与严格对账已完成；旧 export 仅为 `prepared` 且已被用户拒绝。下一步是基于最终 3053 部权威输入完成 M2 上线预测算法校准、滚动回测、脱敏报告和新一轮业务抽检；通过前禁止进入 M3 formal execution。
- 禁止把 M2 local candidate、v1.1 conditional、rating-standard-v3/v4/v4.2 或 private 任务包当作 formal M3 输入。
- 禁止开放 M3 正式 task/export/write API；M2 正式 task/export/release/audit 已获授权，但只能在前置门禁通过后实施。
- 禁止退回较早分类候选覆盖用户最终固定基础表；当前未启用独立特殊属性标签字段，不得在没有新规则的情况下重新制造人工阻断。

## 禁止事项

- 禁止连接远端生产、共享、staging-like 或未明确授权的数据库。
- 禁止提交原始账单、台账、私有 Excel/CSV、候选包、临时数据库文件、数据库 dump 或敏感明细。
- 禁止打印或提交 `.env`、`.pgpass`、密钥、连接串密码。
- 禁止 `git add .`。
- 禁止触碰 stash，包含清理、应用、删除或改写 stash。
- 禁止把本地真实数据开发候选、v1.1 conditional、rating-standard-v3 或 private 任务包表述为最终正式发布审批结果。

## 提交规则

- 所有提交必须显式路径，禁止使用隐式批量添加。
- 技术线与运营线产物不得混提交。
- 工作区有非本轮文件时，必须报告；提交前必须确认范围，不能混入无关文件。

## 验证规则

修改代码后必须运行：

```bash
npm run check:no-real-data
npm run lint
npm run build
npm test
npm run smoke
```

如只改文档，也至少运行：

```bash
npm run check:no-real-data
npm run lint
npm run build
npm test
```

任何失败不得伪造通过，必须如实报告失败命令、失败原因和未验证项。
# M3 Private Completion Pack Recovery Rule

M3 private field completion packs are ignored local output and must not be committed. README/AGENTS must not record machine-specific absolute paths or promise that ignored private artifacts exist on every computer. To restore the workflow after cloning or pulling on a new machine, use:

```bash
git pull origin main
npm ci
npm run check:no-real-data
npm run m3:private-completion-bootstrap
```

The bootstrap reads only from the Git-ignored private input role and writes only to the Git-ignored private output role. It requires 3 to 5 private materials. If the private input is missing or incomplete, it must stop and tell the user to provide materials; it must not fabricate private material or completion fields.

Do not commit private input, private output, completion packs, original Word/PDF/PPT/image/spreadsheet materials, true titles, authors, material text, webpage full text, database credentials, `.env`, `.pgpass`, dumps or temporary database files. Applying a filled pack with `npm run m3:field-completion-apply` requires separate user authorization and is not M3 formal execution.
