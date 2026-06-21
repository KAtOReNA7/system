# M2-B-3 前置授权与真实数据链路门禁定义 v0.1

生成时间：2026-06-21

线路：运营线

## 1. 执行前门禁

本轮已在主工作区执行执行前 Git 门禁：

- `git status --branch --short --untracked-files=all`：clean；
- `git rev-parse HEAD`：`fe086f10cb05c93f40972607a8fa34d43463cb16`；
- `git ls-remote origin refs/heads/main`：`fe086f10cb05c93f40972607a8fa34d43463cb16`；
- `git diff --name-only`：空；
- `git diff --cached --name-only`：空。

结论：主工作区 clean，HEAD 等于 `origin/main`，允许仅新增本轮运营授权与门禁定义文档。

## 2. M2-B-3 定位

M2-B-3 当前不得被定义为正式评估阶段。

M2-B-3 只能是以下内容的前置授权边界：

- local non-formal readiness；
- dry-run 方案设计；
- persistence prototype 的前置授权边界；
- 技术线后续最小任务的范围定义。

M2-B-3 不是：

- formal evaluation；
- production / staging / shared DB 使用阶段；
- M2-C；
- M2-D；
- mapping_version 正式激活阶段；
- 正式数据迁移阶段。

是否执行 M2-B-3 技术实现，仍需要后续技术线单独授权。本轮不执行实现。

## 3. 当前状态基线

本轮门禁定义基于以下状态：

- M1 工程阶段性收口；
- M1 正式业务数据未收口；
- M1 mapping v0.2 仅完成本地 dry-run，未正式激活；
- v0.2 状态：PASS；
- G06：通过；
- G07：通过；
- raw_work_id_mapping：300；
- historical_volume_mapping：52；
- audit source record count：353；
- 161280 / 161284 / 161290 均进入 historical_volume_mapping；
- 未激活 mapping_version；
- 未调用 switch_mapping_version；
- 未连接正式库；
- 未执行正式数据迁移。

## 4. 数据读取授权分类

| 数据来源 | 本轮分类 | 说明 |
|---|---|---|
| 仓库内 fixture / synthetic 数据 | 允许 | 可继续用于 fixture-only 文档、测试和技术设计讨论。 |
| 仓库外归档 stage JSON | 待用户确认 | 本轮不读取；如后续需要，必须单独说明路径、用途和脱敏边界。 |
| `mapping_import_stage-v0.2.json` | 禁止 | 本轮不读取 stage JSON；后续如用于 local dry-run，也需单独授权。 |
| 运营确认结果 | 禁止 | 本轮不读取运营确认结果。 |
| 真实账单 | 禁止 | M1 正式业务数据尚未收口，不得进入 M2-B-3。 |
| 数字版权台账 | 禁止 | 不得读取或导入。 |
| 运营确认 Excel 原表 | 禁止 | 不得读取。 |
| `data/**` | 禁止 | 本轮不得读取 data 目录。 |
| 私有候选包本体 | 禁止 | 不得读取候选包本体。 |
| 本地环境变量文件 | 禁止 | 本轮不得读取。 |
| 数据库连接串 | 禁止 | 本轮不得读取。 |

## 5. 数据库与环境授权分类

| 环境 / 动作 | 本轮分类 | 说明 |
|---|---|---|
| `m1-local-dev` | 待用户确认 | 可在后续技术线作为非正式本地环境候选讨论；本轮不连接。 |
| `m1-local-dry-run` | 待用户确认 | 可在后续技术线作为 dry-run 环境候选讨论；本轮不连接。 |
| 创建 `m2-local-dry-run` | 待用户确认 | 推荐仅在后续技术线先做方案设计；本轮不创建。 |
| reset 本地 dry-run 容器 | 禁止 | 本轮不执行 Docker 或容器操作。 |
| 正式库 | 禁止 | 硬阻断。 |
| staging | 禁止 | 硬阻断。 |
| production | 禁止 | 硬阻断。 |
| 共享开发库 | 禁止 | 硬阻断。 |
| 共享测试库 | 禁止 | 硬阻断。 |
| Docker | 禁止 | 本轮不执行。 |
| Flyway migrate | 禁止 | 本轮不执行。 |
| forward-only migration | 禁止 | 后续需单独技术线授权。 |
| 修改 `db/migrations/` | 禁止 | 硬阻断。 |

## 6. mapping_version 授权分类

| mapping 动作 | 本轮分类 | 说明 |
|---|---|---|
| 生成候选 mapping_version | 禁止 | M1 mapping v0.2 已完成本地 dry-run，但未正式激活；本轮不生成新版本。 |
| 导入候选 mapping_version 到本地 dry-run | 待用户确认 | 可作为后续技术线 M2-B-3 local dry-run 设计项；本轮不导入。 |
| 激活 mapping_version | 禁止 | 硬阻断。 |
| 调用 `switch_mapping_version` | 禁止 | 硬阻断。 |
| 比较 mapping v0.2 与 fixture evaluation 输入 | 允许，限公开摘要和设计层 | 仅允许使用公开报告 / summary 做设计层对齐，不读取私有 stage 明细。 |
| 将 mapping_version 作为正式评估依据 | 禁止 | M1 正式业务数据未收口，v0.2 未正式激活。 |
| 写入 mapping_version 相关表 | 禁止 | 本轮不连接数据库。 |
| rollback | 待用户确认 | 仅在后续本地 dry-run 授权中作为强制要求；本轮无数据库事务。 |

## 7. 老品评估授权分类

| 老品评估动作 | 本轮分类 | 说明 |
|---|---|---|
| fixture-only 评估继续存在 | 允许 | M2-B fixture-only 阶段已收口，可作为基线继续保留。 |
| local_dry_run mode | 待用户确认 | 本轮只定义授权边界，不新增 mode。 |
| 生成本地非正式 evaluation result | 待用户确认 | 需后续技术线授权。 |
| 持久化本地非正式 evaluation result | 待用户确认 | 需先明确本地库、schema、回滚和审计策略。 |
| 创建 evaluation task | 禁止 | 本轮不新增 task API，不执行写操作。 |
| cancel / retry task | 禁止 | 本轮不新增 task API。 |
| export | 禁止 | 本轮不新增 export API。 |
| formal evaluation | 禁止 | 硬阻断。 |
| 发布 current / historical / invalidated 结果 | 禁止 | 需正式评估和数据收口后再授权。 |
| AI 模型参与判断 | 禁止 | 本轮不引入 AI 判断链路。 |
| 使用不完整月份 | 禁止作为正式截止月 | 可在设计中列为风险，不得作为正式结论。 |
| 真实业务金额出现在页面或报告 | 禁止 | 只能使用 synthetic / fixture。 |

## 8. M2-B-3 推荐最小授权范围

推荐最小授权，不默认全开：

允许：

- 继续保留 fixture / synthetic 数据链路；
- 设计 local_dry_run 方案，但不实现；
- 只读检查公开本地 Docker 环境文档；
- 生成 M2-B-3 技术实施计划；
- 使用公开 M1 / M2 summary 做状态对齐；
- 定义本地 dry-run 必须 rollback、可销毁、非正式、不可导出的约束。

暂不允许：

- 读取真实账单；
- 读取数字版权台账；
- 读取运营确认 Excel；
- 读取 `data/**`；
- 读取 stage JSON；
- 连接正式库 / staging / production / 共享库；
- 激活 mapping_version；
- 调用 `switch_mapping_version`；
- export；
- evaluation task 写操作；
- formal evaluation；
- 修改 `db/migrations/`。

## 9. 技术线后续可执行任务边界

推荐下一步线路：技术线。

推荐下一步任务标题：

```text
技术线：M2-B-3 fixture/local-dry-run readiness 设计，不执行实现
```

任务边界：

- 只做方案设计；
- 不连接数据库；
- 不执行 Docker；
- 不读取真实数据；
- 不读取 stage JSON；
- 不新增 API；
- 不新增页面；
- 不新增测试；
- 不修改 `db/migrations/`；
- 不实现 local_dry_run mode；
- 不执行 persistence prototype。

如后续需要进入实现，应另开技术线任务并显式授权本地环境、凭据来源、允许动作范围、回滚要求和审计要求。

## 10. 硬阻断清单

以下事项继续硬阻断：

- 正式库连接；
- staging / production 连接；
- 共享开发 / 测试库连接；
- 真实数据导入；
- mapping_version 激活；
- `switch_mapping_version`；
- 正式评估；
- 导出正式结果；
- 任务写操作；
- 修改 `db/migrations/`；
- 使用真实金额作为页面 fixture；
- 使用不完整月份作为正式截止月。

## 11. M2-C / M2-D 状态

M2-C：未就绪，继续阻断。

M2-D：未就绪，继续阻断。

原因：

- M1 正式业务数据未收口；
- M1 mapping v0.2 仅完成本地 dry-run，未正式激活；
- M2-B-3 尚未完成前置授权后的技术设计；
- 未形成可进入正式评估或正式数据链路的授权闭环。

## 12. 本轮安全边界确认

本轮未执行：

- 数据库连接；
- Docker；
- `data/**` 读取；
- 真实数据读取；
- stage JSON 读取；
- 运营确认结果读取；
- 数据库连接串读取；
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
- `git add .`；
- stash 操作。
