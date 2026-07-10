# Codex 工作规则

项目路径：`E:\project\system`

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
- M2 v1.1 conditional 与 rating-standard-v3 只能作为本地真实数据开发和有限业务复核候选，不是最终正式发布审批结果。
- 2026-07-08 本地五源重清洗已完成：账单、数字版权台账、原创全库、原创全库2、授权汇总台账、授权关系仪表板合并后，作者、版权开始、版权到期三个核心字段已形成本地文件级 staging 候选。该候选覆盖 3053 个账单作品、9159 个核心字段，其中 8729 个字段为高置信直接通过，430 个字段为用户确认填写；仍未写正式主数据，private 输出不进入版本控制。
- 2026-07-09 状态类字段已完成本地文件级 staging：作品状态和音频版权状态覆盖 3053 个账单作品、6106 个状态字段；作品状态分布为已上架 2410、已下架 643；音频版权状态分布为版权有效 2238、无限期 487、版权已到期 328。该结果仍未写正式主数据。
- 2026-07-10 分类树和辅助标签口径已更新：历史三级分类新增先秦、汉、三国、南北朝、隋、唐、五代十国、宋、元、明、清、近代史；辅助标签新增国家组，仍与一级、二级、三级分类分开管理。
- 用户已完成 `M2-classification-aux-tag-fill-pack-cn-v3.xlsx`：257 部人工分类和 51 部辅助标签核对均已应用到本地文件级 staging。3053 部作品分类路径全部有效，其中系统自动 2796 部、用户确认 257 部；正式主数据仍未写入。
- 用户已完成 19 条国家标签核对：采用 6 条、不采用 13 条；当前本地辅助标签结果覆盖 57 部作品、127 个标签赋值。
- 作者、版权开始、版权到期、作品状态和音频版权状态已按用户确认口径完成本地文件级 staging 收口，不再进入当前人工补表；旧 `M2-foundation-data-final-human-review-pack-cn-v1.xlsx` 已废弃，禁止作为当前入口。
- 用户已完成并明确确认分类与标签最终基础大表；固定结果为 `data/private-output/m2-readiness/M2-classification-tag-foundation-local-fixed-cn-v1.xlsx/json`，覆盖 3053 部作品，出版物 1195、网文 1858，分类与标签人工缺口为 0。该 private 文件禁止提交。
- 最终大表相对系统预填基线修正 836 部作品，固定 387 部作品、532 个辅助标签赋值；新增科普、教辅、诗歌和 11 个辅助标签已进入受控词表 `2026-07-10-user-confirmed-v2`。
- 用户已确认表中 2 个作者显示变化属于误操作；系统已恢复此前已收口作者值，未进入固定结果，也不会进入提交。当前没有作者人工待办，禁止据此重开全量作者补表。
- 较早 M2 聚合使用 3054 部范围，最终固定基础表为 3053 部；下一轮必须通过脱敏工程对账解释并统一，禁止让用户手工猜测或直接丢弃记录。
- `data/private-output/**` 中的 private Excel/CSV/JSON 只供本地查看和用户填写，禁止提交。
- 当前 `main` 保留 M3 parallel planning 边界、实施方案摘要与非正式 fixture/prototype 测试能力；不代表 M3 formal execution 已开始，也不包含正式 M3 发布能力。
- 当前未进入 M3 formal execution；重新准备 M3 开发计划可以进行，但正式发布、生产数据连接、mapping activation、对外正式 task/export/write API、M3 formal execution 均需要用户后续单独明确授权。

## M2 后续补全信息提醒

任何 M3 设计、实现或评估前，必须先提醒用户当前 M2 local candidate 不是 formal complete，并核对以下 M2 后续补全项：

| 数据项 | 当前缺口/状态 | 影响 |
|---|---:|---|
| 作者 | 本地文件级 staging 候选已闭环，当前缺口 0；正式主数据尚未写入 | 可支撑后续本地 M2 readiness 重算，但不等于正式主数据验收 |
| 版权开始 | 本地文件级 staging 已按用户确认口径收口，当前人工缺口 0；正式主数据尚未写入 | 不再进入分类与标签核对表 |
| 版权到期 | 本地文件级 staging 已按用户确认口径收口；“无限期”直接作为有效值，当前人工缺口 0；正式主数据尚未写入 | 不再进入分类与标签核对表 |
| 一级分类 | 用户最终基础大表已固定：出版物 1195、网文 1858；人工缺口 0 | 可作为后续本地 M2 readiness 输入；尚未写正式主数据 |
| 二级分类 | 3053 部均已由最终基础大表固定；人工缺口 0 | 可支撑本地细分策略和同类对标 |
| 三级分类 | 3053 部均已固定；新增科普、教辅、诗歌已进入受控词表 | 可支撑本地完整分类路径和分层回测 |
| 辅助标签 | 387 部作品、532 个标签赋值已固定；人工缺口 0 | 可支撑本地特殊项目解释和校准 |
| 特殊属性标签 | 当前 M1/M2 人工收口不启用独立字段；只有后续明确新增规则和版本时才单独治理 | 不阻断本轮分类与标签人工收口 |
| 作品状态 | 本地文件级 staging 已闭环：已上架 2410、已下架 643；正式主数据尚未写入 | 可支撑本地货架/下架判断，但不等于 formal 主数据验收 |
| 音频版权状态 | 本地文件级 staging 已闭环：版权有效 2238、无限期 487、版权已到期 328；正式主数据尚未写入 | 可支撑本地版权有效性判断，但不等于 formal 主数据验收 |
| 到期但仍有收入样本 | 142 个复核桶 | 需判断结算滞后、续约未入账、渠道滞后或异常 |
| 版权有效但收入稀疏样本 | 92 个复核桶 | 需运营/版权确认是否仍可运营、仅观察或无需动作 |

证据文件：

- `docs/analysis/m2-real-data/M2-local-candidate-closeout-v1.md`
- `docs/analysis/m2-real-data/M2-classification-aux-tag-local-staging-summary-v1.md`
- `docs/analysis/m2-real-data/M2-classification-tag-foundation-local-closeout-v1.md`
- `docs/analysis/m2-real-data/M1-M2-post-foundation-project-status-v1.md`
- `docs/analysis/m3/M3-parallel-planning-boundary-v1.md`

早期 master-data/copyright gap 报告只用于历史追溯，不得据此重新生成当前人工任务。

## M3 当前门禁

- 本地和远端 M3 状态必须先确认 clean：`HEAD` 应等于 `origin/main`，工作区不能有非本轮变更。
- 当前允许准备 M3 开发计划、字段清单、接口依赖、fixture/prototype 方案和测试计划。
- 作者、版权日期、作品状态、音频版权状态、分类和辅助标签已在本地文件级候选中收口；下一步先基于固定基础表重跑 M2 readiness。在 formal 主数据和其他 M2 formal gate 闭环前，禁止进入 M3 formal execution。
- 禁止把 M2 local candidate、v1.1 conditional、rating-standard-v3/v4/v4.2 或 private 任务包当作 formal M3 输入。
- 禁止开放 M3 正式 task/export/write API。
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

M3 private field completion packs are private local output under `data/private-output/**` and must not be committed. To restore the workflow after cloning or pulling on a new machine, use:

```bash
git pull origin main
npm ci
npm run check:no-real-data
npm run m3:private-completion-bootstrap
```

The bootstrap reads only `data/private-input/m3-material-dry-run/` and writes only `data/private-output/m3-dry-run/`. It requires 3 to 5 private materials. If the private input directory is missing or incomplete, it must stop and tell the user to place materials there; it must not fabricate private material or completion fields.

Do not commit private input, private output, completion packs, original Word/PDF/PPT/image/spreadsheet materials, true titles, authors, material text, webpage full text, database credentials, `.env`, `.pgpass`, dumps or temporary database files. Applying a filled pack with `npm run m3:field-completion-apply` requires separate user authorization and is not M3 formal execution.
