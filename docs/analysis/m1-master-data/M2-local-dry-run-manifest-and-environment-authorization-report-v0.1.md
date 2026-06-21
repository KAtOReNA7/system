# M2 local dry-run manifest 与环境授权确认 v0.1

生成时间：2026-06-22

线路：运营线

## 1. 执行前门禁

本轮已在主工作区执行 Git 前置门禁：

- `git status --branch --short --untracked-files=all`：clean；
- `git rev-parse HEAD`：`4c0acd6948fdb49877767e7796a7f606b8d6fef0`；
- `git ls-remote origin refs/heads/main`：`4c0acd6948fdb49877767e7796a7f606b8d6fef0`；
- `git diff --name-only`：空；
- `git diff --cached --name-only`：空。

结论：主工作区 clean，HEAD 等于 `origin/main`，允许仅新增本轮运营授权确认报告和 summary JSON。

## 2. 当前状态

- M1 工程阶段性收口；
- M1 正式业务数据未收口；
- M1 mapping v0.2 仅完成本地 dry-run，未正式激活；
- M2-A 老品评估方案设计已完成；
- M2-B fixture-only 阶段已完成并收口；
- M2-B-3 前置授权与真实数据链路门禁定义已完成；
- M2-B-3 readiness 设计已完成；
- M2-B-3.1 no-db readiness checker 已完成；
- M2-B-3.2 local dry-run design validation 已完成；
- M2-B-3.2a no-db validation report generator 已完成；
- M2-B-3 no-db readiness 工具阶段已收口；
- 最新技术线收口 commit：`4c0acd6948fdb49877767e7796a7f606b8d6fef0`；
- 最新远端 CI：run id `27910235465`，status `completed`，conclusion `success`。

本轮目标是运营授权确认，不是技术实现。

## 3. Manifest 授权结论

允许出现 local dry-run manifest，但必须满足最小披露原则。

| 项目 | 授权结论 | 边界 |
|---|---|---|
| local dry-run manifest | 允许 | 仅作为下一阶段输入元信息载体。 |
| 描述文件名 | 允许 | 不得包含敏感本机私有绝对路径。 |
| 描述文件 hash | 允许 | 用于完整性校验。 |
| 描述字段清单 | 允许 | 仅字段名和类型/用途，不含行级正文。 |
| 描述数据范围摘要 | 允许 | 只允许脱敏、聚合摘要。 |
| 描述记录数 | 允许 | 可用于 validator 校验。 |
| 描述月份范围 | 允许 | 仅范围摘要，不得包含真实金额或明细。 |
| 描述数据来源类型 | 允许 | 例如 synthetic / fixture / stage-summary / ops-summary。 |
| 描述脱敏统计 | 允许 | 只允许聚合统计。 |
| 包含 manifest 正文以外的源文件正文 | 禁止 | 不得嵌入源文件 body。 |
| 包含真实业务明细 | 禁止 | 硬阻断。 |
| 包含真实金额 | 禁止 | 硬阻断。 |
| 包含真实作品名、作者名、渠道名 | 禁止 | 硬阻断。 |
| 包含 stage JSON body | 禁止 | 硬阻断。 |
| 包含真实账单、台账或 Excel 内容 | 禁止 | 硬阻断。 |
| 进入 Git | 有条件允许 | 仅限 synthetic / sanitized manifest；如含真实路径、真实业务明细或敏感统计则不得进入 Git。 |
| 仅进入仓库外临时路径 | 有条件要求 | 若 manifest 含真实文件路径、真实来源标识或敏感统计，应只放仓库外临时路径。 |
| 技术线 validator 读取 manifest | 允许 | 仅允许读取 manifest 元信息。 |
| validator 跟随路径读取源文件 body | 禁止 | validator 不得读取 manifest 指向的源文件正文。 |

结论：允许进入下一阶段的是“manifest 元信息 validator”，不是源数据读取器。

## 4. Stage JSON 授权边界

| 项目 | 授权结论 | 边界 |
|---|---|---|
| 读取 `mapping_import_stage-v0.1.json` | 继续禁止 | 不读取 body。 |
| 读取 `mapping_import_stage-v0.2.json` | 继续禁止 | 不读取 body。 |
| 读取 stage JSON 文件名 | 允许，限 manifest 摘要 | 不直接读取 stage 文件。 |
| 读取 stage JSON hash | 允许，限 manifest 摘要 | 用于完整性校验。 |
| 读取字段清单 | 允许，限 manifest 摘要 | 不读取行级内容。 |
| 读取记录数摘要 | 允许，限 manifest 摘要 | 不读取 body。 |
| 读取 stage JSON body | 禁止 | 硬阻断。 |
| 将 stage JSON 内容写入报告 | 禁止 | 只允许写入元信息摘要。 |
| 将 stage JSON 内容写入 fixture | 禁止 | fixture 必须 synthetic。 |
| 将 stage JSON 内容提交 Git | 禁止 | 完整 stage 明细不得进 Git。 |

默认口径：禁止读取 stage JSON body；仅在用户后续明确授权后，允许通过 sanitized manifest 使用文件名、hash、字段清单、记录数和范围摘要。

## 5. 运营确认结果授权边界

| 项目 | 授权结论 | 边界 |
|---|---|---|
| 读取运营确认结果 | 禁止 | 本轮不读取正文或明细。 |
| 读取文件名 | 允许，限 manifest 摘要 | 需脱敏，不得暴露私有路径。 |
| 读取 hash | 允许，限 manifest 摘要 | 用于完整性校验。 |
| 读取字段清单 | 允许，限 manifest 摘要 | 不含明细。 |
| 读取记录数摘要 | 允许，限 manifest 摘要 | 只允许聚合数。 |
| 读取正文 | 禁止 | 硬阻断。 |
| 读取确认项明细 | 禁止 | 硬阻断。 |
| 写入报告 | 仅允许写入脱敏元信息 | 不得写入确认正文或任务级敏感明细。 |
| 进入 Git | 仅允许 sanitized manifest 元信息 | 原始确认结果不得进 Git。 |
| 进入 fixture | 禁止 | fixture 只能 synthetic。 |
| 用于 local dry-run | 待后续单独授权 | 仅可通过脱敏 manifest 元信息。 |
| 用于 formal evaluation | 禁止 | M1 正式业务数据未收口。 |

## 6. 环境授权结论

| 环境 | 允许连接 | 允许读取 | 允许写入 | 允许 reset | 必须 rollback | 允许 Docker | 允许 Flyway migrate | 允许新增 migration | local non-formal result | export | task | 页面/API 展示 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| no-db fixture mode | 否 | 是，仅 fixture/synthetic | 否 | 不适用 | 不适用 | 否 | 否 | 否 | 否 | 否 | 否 | 可在已有 fixture-only 范围展示 |
| m1-local-dev | 否，本轮禁止 | 否 | 否 | 否 | 后续若授权必须要求 | 否 | 否 | 否 | 否 | 否 | 否 | 否 |
| m1-local-dry-run | 否，本轮禁止 | 否 | 否 | 否 | 后续若授权必须要求 | 否 | 否 | 否 | 否 | 否 | 否 | 否 |
| m2-local-dry-run | 否，本轮禁止 | 否 | 否 | 否 | 后续若授权必须要求 | 否 | 否 | 否 | 否 | 否 | 否 | 否 |
| formal DB | 否 | 否 | 否 | 否 | 不适用 | 否 | 否 | 否 | 否 | 否 | 否 | 否 |
| staging | 否 | 否 | 否 | 否 | 不适用 | 否 | 否 | 否 | 否 | 否 | 否 | 否 |
| production | 否 | 否 | 否 | 否 | 不适用 | 否 | 否 | 否 | 否 | 否 | 否 | 否 |
| shared development DB | 否 | 否 | 否 | 否 | 不适用 | 否 | 否 | 否 | 否 | 否 | 否 | 否 |
| shared test DB | 否 | 否 | 否 | 否 | 不适用 | 否 | 否 | 否 | 否 | 否 | 否 | 否 |

结论：

- no-db fixture mode 继续允许；
- m1-local-dev / m1-local-dry-run / m2-local-dry-run 仅可作为后续授权候选；
- formal / staging / production / shared DB 全部继续禁止；
- 本轮不允许 Docker；
- 本轮不允许连接任何数据库；
- 本轮不允许写入。

## 7. local dry-run 能力授权结论

| 阶段 | 当前是否允许 | 是否需单独授权 | 是否需要 DB | 是否需要 Docker | 是否需要读取 stage JSON | 是否需要读取运营确认结果 | 是否需要读取真实数据 | 是否需要 migration | 是否允许写入 | 是否允许导出 | 是否允许新增 API/页面 | 是否允许新增 task/export/write API |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| M2-B-3.2b local dry-run input manifest validator | 允许 | 是，技术线任务授权 | 否 | 否 | 否，仅 manifest 元信息 | 否，仅 manifest 元信息 | 否 | 否 | 否 | 否 | 否 | 否 |
| M2-B-3.2c environment authorization checker | 暂不允许 | 是 | 否，除非后续授权 | 否，除非后续授权 | 否 | 否 | 否 | 否 | 否 | 否 | 否 | 否 |
| M2-B-3.3 local non-formal persistence prototype | 暂不允许 | 是 | 可能需要 | 可能需要 | 可能需要 manifest 元信息 | 可能需要 manifest 元信息 | 否 | 可能需要，需单独授权 | 可能需要，需单独授权 | 否 | 可能需要，需单独授权 | 禁止默认新增 |
| M2-B-3.4 local dry-run report page / API | 暂不允许 | 是 | 可能需要 | 可能需要 | 否 | 否 | 否 | 否 | 否 | 否 | 可能需要，需单独授权 | 禁止默认新增 |
| M2-C formal readiness checklist | 继续阻断 | 是 | 否 | 否 | 否 | 否 | 否 | 否 | 否 | 否 | 否 | 否 |
| M2-D formal evaluation | 继续阻断 | 是 | 是 | 可能需要 | 是 | 是 | 是 | 可能需要 | 是 | 可能需要 | 可能需要 | 可能需要 |

结论：

- 允许进入 B-3.2b；
- 暂不进入 B-3.2c；
- 暂不进入 B-3.3 / B-3.4；
- M2-C / M2-D 继续阻断。

## 8. 下一步技术线最小授权建议

推荐下一条线路：技术线。

推荐任务：

```text
技术线：M2-B-3.2b local dry-run input manifest validator
```

最小边界：

- 只允许读取 manifest 文件本身；
- manifest 只能包含文件名、hash、字段清单、范围摘要、记录数、月份范围、数据来源类型；
- 不允许读取 manifest 指向的源文件 body；
- 不允许读取 stage JSON body；
- 不允许读取运营确认结果正文；
- 不允许读取 `data/**`；
- 不允许读取本地环境变量文件；
- 不允许读取数据库连接串；
- 不连接数据库；
- 不执行 Docker；
- 不新增 API；
- 不新增页面；
- 不新增 write API；
- 不新增 export API；
- 不新增 evaluation task API；
- 不新增 formal mode；
- 不新增 local_dry_run mode；
- 不修改 `db/migrations/`；
- 只输出 validator、测试、报告和 summary JSON。

## 9. 继续硬阻断清单

以下事项继续硬阻断：

- 正式库连接；
- staging；
- production；
- shared development DB；
- shared test DB；
- 真实数据导入；
- 真实账单读取；
- 数字版权台账读取；
- 运营确认 Excel 读取；
- 运营确认结果正文读取；
- stage JSON body 读取；
- `data/**` 读取；
- 环境变量文件 / pgpass 文件读取；
- 数据库连接串读取；
- Docker 执行；
- mapping_version 激活；
- `switch_mapping_version`；
- 正式评估；
- export；
- evaluation task 写操作；
- 修改 `db/migrations/`；
- 使用真实金额作为页面 fixture；
- 使用不完整月份作为正式截止月。

## 10. 本轮安全边界确认

本轮未执行：

- 数据库连接；
- Docker；
- `data/**` 读取；
- 真实数据读取；
- stage JSON body 读取；
- 运营确认结果正文读取；
- 数据库连接串读取；
- 本地环境变量文件读取；
- 真实数据导入；
- mapping_version 激活；
- `switch_mapping_version`；
- 正式数据迁移；
- `db/migrations/` 修改；
- 代码 / API / 页面 / 测试修改；
- write API 新增；
- formal mode 新增；
- local_dry_run mode 新增；
- export API 新增；
- evaluation task API 新增；
- CI 修改；
- `git add .`；
- stash 操作。
