# M2-B-3 fixture/local-dry-run readiness 技术设计 v0.1

## 1. 设计结论

本文件只定义 M2-B-3 fixture/local-dry-run readiness 的技术方案，不执行任何实现。

结论如下：

- M2-B-3 不是正式评估；
- M2-B-3 不是 M2-C；
- M2-B-3 不是 M2-D；
- M2-B-3 不是 formal DB、staging、production、shared development DB 或 shared test DB 使用阶段；
- 本轮只设计 readiness，不实现 `local_dry_run`；
- 本轮不新增 mode；
- 本轮不新增 DB repository；
- 本轮不新增 migration；
- 本轮不新增 API、页面、任务、导出或写接口；
- 本轮不连接数据库、不执行 Docker、不读取 `data/**`、不读取 stage JSON、不读取运营确认结果、不读取数据库连接串。

M2-B-3 后续可行的最小路径是先做 no-db readiness checker 和 local dry-run design validation。任何进入数据库、Docker、stage JSON、候选 mapping、持久化、导出、任务写操作或正式评估的动作，都必须单独授权。

## 2. 当前基线

公开输入显示：

- M1 工程阶段性收口；
- M1 正式业务数据未收口；
- M1 mapping v0.2 仅完成本地 dry-run，未正式激活；
- M2-A 老品评估方案设计已完成；
- M2-B fixture-only 阶段已完成并收口；
- 运营线已完成 M2-B-3 前置授权与真实数据链路门禁定义；
- M2-B-3 允许进入技术设计授权环节；
- M2-B-3 不允许进入技术实现；
- M2-C / M2-D 继续阻断；
- 最新运营线门禁提交：`3dad2eaf6da1255f1dda4f36096b8b53a8c15705`。

本轮 Git 门禁：

- HEAD：`3dad2eaf6da1255f1dda4f36096b8b53a8c15705`；
- origin/main：`3dad2eaf6da1255f1dda4f36096b8b53a8c15705`；
- 工作区：clean。

## 3. M2-B-3 技术定位

M2-B-3 的定位是“readiness 设计层”，不是运行层：

| 项目 | 结论 |
| --- | --- |
| 是否正式评估 | 否。任何正式评估仍需 M2-C / M2-D 授权。 |
| 是否 M2-C | 否。M2-C 是正式数据 readiness 阶段，本轮不进入。 |
| 是否 M2-D | 否。M2-D 是正式老品评估阶段，本轮不进入。 |
| 是否使用 formal/staging/production/shared DB | 否，硬阻断。 |
| 是否实现 local_dry_run | 否，本轮只设计。 |
| 是否新增 mode | 否，不新增 `formal` 或 `local_dry_run` mode。 |
| 是否新增 DB repository | 否。 |
| 是否新增 migration | 否。 |
| 是否修改 API / 页面 / 测试 | 否。 |

M2-B-3 readiness 设计的核心问题不是“如何跑评估”，而是“后续若用户授权 local dry-run，哪些输入、环境、权限、回滚和禁止项必须先满足”。

## 4. local-dry-run readiness 设计

### 4.1 后续若授权 `local_dry_run`，需要的输入

后续若进入 local dry-run，至少需要下列输入分层：

| 输入 | 用途 | 当前状态 |
| --- | --- | --- |
| fixture / synthetic 老品评估样本 | 继续验证 UI、API、错误码、状态表达和非正式算法形状 | 当前允许 |
| 公开 summary JSON | 只用于 readiness 对齐和报告引用，不得还原明细 | 当前允许 |
| 公开报告 | 只用于设计依据和门禁说明 | 当前允许 |
| M1 local dry-run 环境说明 | 只读参考本地 dry-run 约束 | 当前允许读取公开文档 |
| stage JSON | 未来可能用于受控本地 dry-run，但当前禁止读取 | 需单独授权 |
| 运营确认结果 | 未来可能用于候选映射或 readiness 输入，但当前禁止读取 | 需单独授权 |
| 数据库连接串 | 未来只可通过本地、临时、隔离配置提供；当前禁止读取 | 需单独授权 |

### 4.2 可以继续来自 fixture / synthetic 的内容

以下内容可继续使用 fixture / synthetic：

- 老品评估列表样本；
- readiness gap 示例；
- lifecycle、rating、risk、suggestion 的非正式示例；
- backtest 批次和结果示例；
- 页面 empty / success / blocked / error / not_found 状态；
- 非正式算法版本示例；
- API contract 测试样本；
- E2E 页面交互样本。

要求：

- 必须标注 fixture-only / synthetic；
- 不得使用真实作品名、真实渠道名、真实作者、真实金额、真实版权日期；
- 不得将 fixture 结论表述为业务事实；
- 不得用不完整月份作为正式截止月。

### 4.3 必须单独授权的输入

以下输入必须等用户单独授权：

- `mapping_import_stage-v0.1.json`；
- `mapping_import_stage-v0.2.json`；
- 运营确认结果；
- 真实账单；
- 数字版权台账；
- 运营确认 Excel；
- `data/**`；
- `.env.local`；
- 数据库连接串；
- 私有候选包本体。

### 4.4 m1-local-dry-run / m2-local-dry-run 判断

后续 local dry-run 设计建议分离两个环境概念：

- `m1-local-dry-run`：用于验证 M1 mapping / 数据基础相关候选导入，不代表 M2 评估环境；
- `m2-local-dry-run`：若后续授权，可作为 M2 非正式评估结果生成和报告验证的隔离环境。

不建议在同一数据库内混合 M1 mapping dry-run 和 M2 old-product evaluation dry-run 的持久结果，除非后续任务明确授权并定义 schema、角色、reset、rollback 和清理规则。

### 4.5 reset、Flyway、migration 与 rollback

后续若授权 local dry-run：

- 是否需要 reset 本地 dry-run 容器：建议需要，确保可重复、可销毁、无历史污染；
- 是否需要 Flyway migrate：如使用数据库结构，应从 `db/migrations/` 初始化空库；
- 是否需要 forward-only migration：只有当 M2-B-3 实现需要新增持久化对象时才可能需要，且必须单独授权；
- 是否需要 rollback：需要。任何候选 mapping 导入、非正式评估结果生成或验证性写入，都必须具备事务级 rollback 或环境级销毁策略；
- 是否需要 dry-run 报告：需要，且只能公开摘要，不得包含真实明细；
- 是否需要禁止导出：需要，直到运营线明确授权 export；
- 是否需要禁止任务写操作：需要，直到运营线明确授权 evaluation task API；
- 是否需要禁止 formal result 发布：需要。local dry-run 永远不能发布 formal current/historical/invalidated 结果。

## 5. 数据输入矩阵

| 数据类别 | 当前是否允许 | 后续是否可申请授权 | 可用于什么 | 禁止用于什么 | 允许进入 Git | 允许出现在报告 | 允许出现在页面 | 允许出现在 fixture |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fixture / synthetic | 允许 | 已允许 | API、页面、测试、E2E、readiness 设计 | 作为正式业务证据 | 允许 | 允许 | 允许 | 允许 |
| 公开 summary | 允许 | 已允许 | 设计依据、门禁核对、公开摘要引用 | 还原私有明细或替代正式输入 | 允许 | 允许 | 仅可摘要展示 | 不建议作为 fixture 原始样本 |
| 公开报告 | 允许 | 已允许 | 设计依据、约束引用 | 替代正式业务数据 | 允许 | 允许 | 可展示非敏感结论 | 不建议作为 fixture 原始样本 |
| stage JSON | 禁止 | 可申请 | 后续受控 local dry-run 输入 | 本轮读取、提交、页面展示、fixture 拷贝 | 禁止 | 仅可出现脱敏摘要 | 禁止 | 禁止 |
| 运营确认结果 | 禁止 | 可申请 | 后续 readiness / mapping 候选输入 | 本轮读取、导入、自动应用 | 禁止 | 仅可出现脱敏摘要 | 禁止 | 禁止 |
| 真实账单 | 禁止 | 可申请，但需严格授权 | 后续正式 readiness 或受控分析 | 本轮读取、导入、页面展示、fixture 拷贝 | 禁止 | 仅可统计摘要 | 禁止 | 禁止 |
| 数字版权台账 | 禁止 | 可申请，但需严格授权 | 后续主数据 readiness | 本轮读取、导入、页面展示、fixture 拷贝 | 禁止 | 仅可统计摘要 | 禁止 | 禁止 |
| 运营确认 Excel | 禁止 | 可申请，但需严格授权 | 后续人工确认结果来源 | 本轮读取、提交、页面展示、fixture 拷贝 | 禁止 | 仅可统计摘要 | 禁止 | 禁止 |
| `data/**` | 禁止 | 可申请，但需路径和目的限定 | 后续受控本地分析或 dry-run | 本轮读取、提交、应用启动输入 | 禁止 | 禁止路径和明细 | 禁止 | 禁止 |
| `.env.local` | 禁止读取 | 可申请用于本地隔离环境 | 后续本地连接配置 | 提交、报告、页面展示 | 禁止 | 禁止 | 禁止 | 禁止 |
| 数据库连接串 | 禁止读取 | 可申请用于本地隔离环境 | 后续本地工具连接 | 提交、日志、报告、页面、fixture | 禁止 | 禁止 | 禁止 | 禁止 |

## 6. 环境矩阵

| 环境 | 当前是否允许 | 后续是否可申请授权 | 是否允许连接 | 是否允许写入 | 是否允许 reset | 是否必须 rollback | 是否允许导出 | 是否允许生成 current/historical/invalidated 结果 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| no-db fixture mode | 允许 | 已允许 | 不需要 DB | 不写 DB | 不适用 | 不适用 | 禁止正式导出 | 仅 fixture 非正式展示 |
| m1-local-dev | 本轮禁止连接 | 可申请 | 仅后续授权后本地连接 | 默认不写，除授权 | 一般不 reset | 写入需 rollback 或清理 | 禁止 | 禁止作为 M2 正式结果 |
| m1-local-dry-run | 本轮禁止连接 | 可申请 | 仅后续授权后本地连接 | 可在授权内写入并 rollback | 建议允许 reset | 必须 rollback 或环境销毁 | 禁止 | 禁止作为 M2 正式结果 |
| m2-local-dry-run | 本轮未创建 | 可申请 | 仅后续授权后本地连接 | 可在授权内写入非正式结果 | 建议允许 reset | 必须 rollback 或环境销毁 | 禁止，除非另行授权非正式报告 | 仅 local non-formal，不得发布 formal |
| formal DB | 禁止 | 暂不建议 | 禁止 | 禁止 | 禁止 | 不适用 | 禁止 | 禁止 |
| staging | 禁止 | 暂不建议 | 禁止 | 禁止 | 禁止 | 不适用 | 禁止 | 禁止 |
| production | 禁止 | 不应在 M2-B-3 使用 | 禁止 | 禁止 | 禁止 | 不适用 | 禁止 | 禁止 |
| shared development DB | 禁止 | 暂不建议 | 禁止 | 禁止 | 禁止 | 不适用 | 禁止 | 禁止 |
| shared test DB | 禁止 | 暂不建议 | 禁止 | 禁止 | 禁止 | 不适用 | 禁止 | 禁止 |

## 7. migration 判断

本轮不得新增 migration，不得修改 `db/migrations/`。

后续判断：

1. 如果 M2-B-3 只做 no-db readiness checker，可以不新增 migration；
2. 如果 M2-B-3 只做 local dry-run design validation，可以不新增 migration；
3. 如果 M2-B-3 要持久化 local non-formal evaluation 结果，可能需要 forward-only migration；
4. 如果新增持久化对象，必须单独授权，不能借本轮设计自动进入实现；
5. 任何 `db/migrations/` 修改都必须单独授权；
6. forward-only 仍应作为正式迁移原则，不生成 down migration。

可能进入未来 migration 候选的对象：

- `old_product_evaluation_batch`；
- `old_product_evaluation_attempt`；
- `old_product_evaluation_result`；
- `old_product_income_summary`；
- `old_product_lifecycle_judgment`；
- `old_product_forecast_result`；
- `old_product_rating_result`；
- `old_product_risk_result`；
- `old_product_suggestion_result`；
- `old_product_backtest_batch`；
- `old_product_backtest_result`；
- `old_product_algorithm_version`；
- `old_product_input_snapshot`；
- `old_product_result_invalidation`；
- readiness gap view 或本地投影对象。

必须等正式数据 readiness 后再设计或激活的内容：

- formal result status 激活；
- formal algorithm version 激活；
- formal backtest over real history；
- automatic re-evaluation tasks；
- export over real evaluation results；
- 使用 active mapping_version 作为正式评估依据；
- 与 M4 或后续模块联动的自动重评。

## 8. API / 页面 / 任务边界

本轮边界：

- 不新增 API；
- 不新增页面；
- 不新增 write API；
- 不新增 evaluation task API；
- 不新增 export API；
- 不新增 formal mode；
- 不新增 `local_dry_run` mode；
- 不新增 DB repository；
- 不新增 migration。

后续如要新增 `local_dry_run`：

- 只能在单独技术线任务中授权；
- 必须明确输入来源、环境、rollback、报告边界；
- 必须明确是否允许读取 stage JSON 或运营确认结果；
- 必须明确是否允许连接本地 DB；
- 必须继续禁止 formal result 发布。

后续如要新增 task 或 export：

- 必须由运营线先授权；
- 必须明确 task 创建、取消、重试、失败恢复、幂等和审计规则；
- 必须明确 export 是否只允许非正式本地报告；
- 不得默认开放正式导出。

## 9. M2-B-3 后续最小实现路径建议

| 阶段 | 内容 | 需要 DB | 需要 Docker | 需要 migration | 读取真实数据 | 读取 stage JSON | 允许写入 | 必须 rollback | 需要用户授权 | 推荐程度 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M2-B-3.1 no-db readiness checker | 基于公开文档、fixture、summary 做静态 readiness 检查 | 否 | 否 | 否 | 否 | 否 | 否 | 不适用 | 需要明确任务授权 | 推荐作为下一步 |
| M2-B-3.2 local dry-run design validation | 验证 local dry-run 流程设计、输入清单、失败恢复、报告形状 | 可不需要；若验证环境则需要单独授权 | 可不需要；若验证容器则需要单独授权 | 否 | 否 | 默认否；如需读取需单独授权 | 默认否 | 如有写入则必须 | 需要 | 推荐，但应在 B-3.1 后 |
| M2-B-3.3 local non-formal persistence prototype | 在本地隔离 DB 持久化非正式评估结果原型 | 是 | 可能需要 | 可能需要 forward-only migration | 否，除非另行授权 | 可能需要单独授权 | 仅本地非正式 | 必须 | 强授权后才可做 | 暂不推荐立即进入 |
| M2-B-3.4 local dry-run report page / API | 展示本地 dry-run 报告或 API | 可能需要 | 可能需要 | 可能需要 | 否，除非另行授权 | 可能需要单独授权 | 可能需要 | 必须 | 强授权后才可做 | 暂不推荐立即进入 |
| M2-C formal readiness checklist | 正式数据 readiness 清单和验收门禁 | 可能需要 | 可能需要 | 可能需要 | 需正式授权 | 需正式授权 | 需正式授权 | 需正式回滚/恢复策略 | 必须 | 当前不 ready |

推荐顺序：

1. 先执行 M2-B-3.1 no-db readiness checker；
2. 再按用户授权执行 M2-B-3.2 local dry-run design validation；
3. 暂不进入 M2-B-3.3 / M2-B-3.4；
4. 暂不进入 M2-C / M2-D。

## 10. 硬阻断清单

以下事项继续硬阻断：

- 正式库连接；
- staging / production；
- shared development / shared test；
- 真实数据导入；
- 真实账单读取；
- 数字版权台账读取；
- 运营确认 Excel 读取；
- stage JSON 读取；
- 运营确认结果读取；
- 数据库连接串读取；
- `mapping_version` 激活；
- `switch_mapping_version`；
- 正式评估；
- export；
- evaluation task 写操作；
- 修改 `db/migrations/`；
- 使用真实金额作为页面 fixture；
- 使用不完整月份作为正式截止月。

## 11. 本轮验证计划

本轮只新增设计文档和 summary JSON，执行：

- `npm run check:no-real-data`：通过；
- `npm run lint`：通过；
- `npm run build`：通过；
- `npm test`：通过，60 tests passed。

本轮可不执行 smoke 和 E2E，原因：

- 不修改代码；
- 不修改 API；
- 不修改页面；
- 不修改测试；
- 不修改运行时配置；
- 不连接数据库；
- 不执行 Docker；
- 不新增任何用户可见行为。

## 12. 本轮禁止项确认

本轮设计不执行实现。确认：

- 不连接数据库；
- 不执行 Docker；
- 不读取 `data/**`；
- 不读取真实数据；
- 不读取 stage JSON；
- 不读取运营确认结果；
- 不读取数据库连接串；
- 不导入真实数据；
- 不激活 `mapping_version`；
- 不调用 `switch_mapping_version`；
- 不执行正式数据迁移；
- 不修改 `db/migrations/`；
- 不修改代码、API、页面或测试；
- 不新增 write API；
- 不新增 formal mode；
- 不新增 `local_dry_run` mode；
- 不新增 export API；
- 不新增 evaluation task API；
- 不使用 `git add .`；
- 不触碰 stash。
