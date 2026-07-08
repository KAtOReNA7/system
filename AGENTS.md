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
- `data/private-output/**` 中的 private Excel/CSV/JSON 只供本地查看和用户填写，禁止提交。
- 当前 `main` 保留 M3 parallel planning 边界、实施方案摘要与非正式 fixture/prototype 测试能力；不代表 M3 formal execution 已开始，也不包含正式 M3 发布能力。
- 当前未进入 M3 formal execution；重新准备 M3 开发计划可以进行，但正式发布、生产数据连接、mapping activation、对外正式 task/export/write API、M3 formal execution 均需要用户后续单独明确授权。

## M2 后续补全信息提醒

任何 M3 设计、实现或评估前，必须先提醒用户当前 M2 local candidate 不是 formal complete，并核对以下 M2 后续补全项：

| 数据项 | 当前缺口/状态 | 影响 |
|---|---:|---|
| 作者 | 本地文件级 staging 候选已闭环，当前缺口 0；正式主数据尚未写入 | 可支撑后续本地 M2 readiness 重算，但不等于正式主数据验收 |
| 版权开始 | 本地文件级 staging 候选已闭环，当前缺口 0；正式主数据尚未写入 | 可支撑生命周期、版权期和回测解释的本地候选输入 |
| 版权到期 | 本地文件级 staging 候选已闭环，当前缺口 0；正式主数据尚未写入 | 可支撑剩余版权月数和版权期预测的本地候选输入 |
| 一级分类 | 基于当前账单口径仍有 3053 个待单独治理 | 全库缺失，阻断正式分层、页面筛选、解释和校准 |
| 二级分类 | 基于当前账单口径仍有 3053 个待单独治理 | 全库缺失，阻断细分策略和同类对标 |
| 必要标签 | 基于当前账单口径仍有 3053 个待单独治理 | 全库缺失，阻断策略解释、运营复核和 M4 校准 |
| 作品状态 | 基于当前账单口径仍有 3053 个待单独治理 | 全库缺失，阻断货架/下架 formal 判断 |
| 音频版权状态 | 基于当前账单口径仍有 3053 个待单独治理 | 全库缺失，阻断版权有效性 formal 判断 |
| 到期但仍有收入样本 | 142 个复核桶 | 需判断结算滞后、续约未入账、渠道滞后或异常 |
| 版权有效但收入稀疏样本 | 92 个复核桶 | 需运营/版权确认是否仍可运营、仅观察或无需动作 |

证据文件：

- `docs/analysis/m2-real-data/M2-local-candidate-closeout-v1.md`
- `docs/analysis/m2-real-data/M2-master-data-readiness-gap-v1.md`
- `docs/analysis/m2-real-data/M2-copyright-expiry-gap-readiness-v1.md`
- `docs/analysis/m3/M3-parallel-planning-boundary-v1.md`

## M3 当前门禁

- 本地和远端 M3 状态必须先确认 clean：`HEAD` 应等于 `origin/main`，工作区不能有非本轮变更。
- 当前允许准备 M3 开发计划、字段清单、接口依赖、fixture/prototype 方案和测试计划。
- 作者、版权开始、版权到期已在本地文件级 staging 候选中闭环；在分类、标签、作品状态、音频版权状态 formal 主数据缺口闭环前，禁止进入 M3 formal execution。
- 禁止把 M2 local candidate、v1.1 conditional、rating-standard-v3/v4/v4.2 或 private 任务包当作 formal M3 输入。
- 禁止开放 M3 正式 task/export/write API。
- 禁止绕过分类、标签、作品状态、音频版权状态缺口；这些字段必须与作者/版权日期分开单独治理。

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
