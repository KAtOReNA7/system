# M2-B fixture-only 老品评估阶段收口与 CI 证据归档报告 v0.1

## 1. 收口结论

本报告只归档技术线 M2-B fixture-only 老品评估阶段证据，不新增代码、不修改 API 实现、不修改页面、不修改测试、不连接数据库、不读取真实数据。

截至本轮核对，M2-B-1、M2-B-2、M2-B-2.1 均已完成各自 fixture-only 范围：

- M2-B-1：fixture-only 老品评估 API 与测试最小闭环已完成；
- M2-B-2：fixture-only 管理端页面与 E2E 最小闭环已完成；
- M2-B-2.1：fixture-only 页面交互细化与 API 契约补充已完成。

当前建议：M2-B fixture-only 阶段可以收口；M2-B-3、M2-C、M2-D 继续暂缓，直到运营线明确授权真实数据、正式评估、mapping/version 应用和相关写操作边界。

## 2. Git 与 CI 证据

本轮执行前门禁结果：

- `git status --branch --short --untracked-files=all`：`## main...origin/main`，无未提交或未跟踪文件；
- `git rev-parse HEAD`：`ee69528c3eee2fab91b74dc922a7575b2562e341`；
- `git ls-remote origin refs/heads/main`：`ee69528c3eee2fab91b74dc922a7575b2562e341`；
- `git diff --name-only`：空；
- `git diff --cached --name-only`：空。

远端 CI 证据：

- run id：`27908581792`；
- workflow：`CI`；
- branch：`main`；
- headSha：`ee69528c3eee2fab91b74dc922a7575b2562e341`；
- status：`completed`；
- conclusion：`success`；
- URL：https://github.com/KAtOReNA7/system/actions/runs/27908581792；
- job：`verify`；
- job conclusion：`success`。

通过的 CI step 包括：

- Checkout；
- Setup Node.js；
- Install dependencies；
- Install Playwright Chromium；
- Check for real data and secrets；
- Lint；
- Build；
- Test；
- Smoke；
- Admin E2E。

## 3. M2-B-1 完成范围

M2-B-1 完成了 7 个 fixture-only 老品评估只读 API：

1. `GET /api/m2/old-products/evaluations/overview`
2. `GET /api/m2/old-products/evaluations`
3. `GET /api/m2/old-products/evaluations/:standardWorkId`
4. `GET /api/m2/old-products/readiness-gaps`
5. `GET /api/m2/old-products/algorithm-versions`
6. `GET /api/m2/old-products/backtests`
7. `GET /api/m2/old-products/backtests/:backtestBatchId`

对应证据文件：

- `docs/technical-design/M2-B-1-old-product-fixture-api-implementation-report-v0.1.md`
- `docs/analysis/m1-master-data/M2-B-1-old-product-fixture-api-implementation-summary-v0.1.json`
- `docs/api/M2-old-product-evaluation-api-contract-v0.1.md`
- `src/fixtures/m2OldProductEvaluationFixture.js`
- `src/repositories/oldProductEvaluationFixtureRepository.js`
- `src/http/app.js`
- `test/m2-old-product-api.test.js`

测试覆盖包括：

- overview/list/detail/readiness gaps/algorithm versions/backtests/backtest detail；
- 分页、非法参数、not_found；
- `mode=formal` 与 formal header 阻断；
- task/export/write endpoints 不可用；
- mapping activation 与 `switch_mapping_version` 不可达；
- fixture-only 响应不读取真实数据。

## 4. M2-B-2 完成范围

M2-B-2 完成了 5 个 `/admin` fixture-only 页面：

1. `/admin#m2-overview`
2. `/admin#m2-list`
3. `/admin#m2-detail:SYN-WORK-0001`
4. `/admin#m2-gaps`
5. `/admin#m2-backtests`

对应证据文件：

- `docs/technical-design/M2-B-2-old-product-fixture-admin-implementation-report-v0.1.md`
- `docs/analysis/m1-master-data/M2-B-2-old-product-fixture-admin-implementation-summary-v0.1.json`
- `public/admin/index.html`
- `public/admin/app.js`
- `public/admin/app.css`
- `test/admin.test.js`
- `test/e2e/admin.e2e.test.js`

页面实现边界：

- 只消费 M2 fixture-only 只读 API；
- 保留 fixture-only 标识；
- 保留 formal blocked 提示；
- 保留不完整月份提示；
- 不提供导入、激活、撤销、重试、取消、导出、提交、写入等入口。

## 5. M2-B-2.1 完成范围

M2-B-2.1 完成页面交互细化与 API 契约补充：

- overview 分布项可跳转到带筛选条件的列表；
- list 支持 rating、lifecycle、businessForm、readiness、risk、resultStatus 等 fixture-only 筛选；
- list 支持筛选重置、当前筛选摘要和详情入口；
- detail 增加返回列表、当前/历史/失效状态摘要和 input snapshot fixture-only 标识；
- readiness gaps 支持 gapCode、severity、readiness 筛选；
- backtests 支持批次选择和批次详情展示；
- 修复空 option 值被渲染为“未提供”导致的 `bad_request` 问题；
- 新增 API 契约 addendum。

对应证据文件：

- `docs/technical-design/M2-B-2.1-old-product-fixture-admin-interaction-report-v0.1.md`
- `docs/analysis/m1-master-data/M2-B-2.1-old-product-fixture-admin-interaction-summary-v0.1.json`
- `docs/api/M2-old-product-evaluation-api-contract-addendum-v0.1.md`
- `public/admin/app.js`
- `public/admin/app.css`
- `src/repositories/oldProductEvaluationFixtureRepository.js`
- `test/admin.test.js`
- `test/e2e/admin.e2e.test.js`
- `test/m2-old-product-api.test.js`

状态覆盖包括：

- loading；
- success；
- empty；
- blocked；
- degraded；
- error；
- not_found。

## 6. 当前仍未实现范围

以下能力仍未实现，且不得通过 fixture-only 阶段绕过：

- formal mode；
- `local_dry_run` mode；
- export API；
- evaluation task create/cancel/retry API；
- write API；
- DB repository；
- 真实数据读取或导入；
- `mapping_version` 激活；
- `switch_mapping_version` 调用；
- 正式数据迁移；
- 修改 `db/migrations/`。

## 7. M2-B-3 为什么继续暂缓

M2-B-3 涉及从 fixture-only 进入真实数据或受控候选链路的前置判断。当前技术线尚未获得运营线对以下事项的正式授权：

- 是否允许读取或导入真实账单、数字版权台账或运营确认结果；
- 是否允许生成、导入或激活候选/正式 `mapping_version`；
- 是否允许创建评估任务或执行任务状态流转；
- 是否允许导出评估结果；
- 是否允许启用 formal 或 `local_dry_run` 模式；
- 是否允许连接任何数据库并执行持久化操作。

因此，M2-B-3 当前不建议启动。

## 8. M2-C / M2-D 为什么继续阻断

M2-C / M2-D 通常会进一步依赖正式数据、正式评估、运营确认、映射版本和可能的写入/导出/任务能力。当前这些能力均未被授权，也未进入技术线实现边界。

因此：

- M2-C 当前不 ready；
- M2-D 当前不 ready；
- 任何进入 M2-C / M2-D 的指令都应先由运营线明确授权数据来源、写操作、正式评估范围和门禁。

## 9. 必须由运营线正式授权的动作

以下动作必须由运营线另行正式授权，不得由技术线自行推断：

- 读取 `data/**`；
- 读取真实账单；
- 读取数字版权台账；
- 读取运营确认 Excel 或运营确认结果；
- 读取 `mapping_import_stage-v0.1.json` 或 `mapping_import_stage-v0.2.json`；
- 导入真实数据；
- 启用 formal mode；
- 启用 `local_dry_run` mode；
- 新增 export API；
- 新增 evaluation task API；
- 新增 write API；
- 生成、导入或激活 `mapping_version`；
- 调用 `switch_mapping_version`；
- 执行正式数据迁移；
- 连接任何数据库；
- 修改 `db/migrations/`。

## 10. 本轮禁止项确认

本轮仅新增本报告和 summary JSON。确认：

- 未连接数据库；
- 未执行 Docker；
- 未读取 `data/**`；
- 未读取真实数据；
- 未读取 stage JSON；
- 未导入真实数据；
- 未激活 `mapping_version`；
- 未调用 `switch_mapping_version`；
- 未执行正式数据迁移；
- 未修改 `db/migrations/`；
- 未修改代码、API、页面或测试；
- 未新增 write API；
- 未新增 formal mode；
- 未新增 `local_dry_run` mode；
- 未新增 export API；
- 未新增 evaluation task API；
- 未使用 `git add .`；
- 未触碰 stash。

## 11. 验证范围

本轮按文档归档变更执行以下验证：

- `npm run check:no-real-data`：通过；
- `npm run lint`：通过；
- `npm run build`：通过；
- `npm test`：通过，60 tests passed。

本轮未执行 `npm run smoke` 和 `npm run test:e2e`，原因是本轮只新增收口文档和 summary JSON，未修改代码、API、页面、测试或运行时配置；且上一阶段对应 E2E 与远端 CI 已在 run `27908581792` 通过。

## 12. 推荐下一步

推荐下一步不是直接进入 M2-B-3 / M2-C / M2-D，而是先由运营线发起授权与门禁确认：

> 运营线：确认是否允许 M2-B-3 使用受控非正式数据链路，明确是否可读取运营确认结果、是否可生成候选 mapping_version、是否可连接本地/测试数据库、是否可执行 dry-run，以及仍禁止哪些正式写入和正式迁移动作。

在该授权完成前，M2-B fixture-only 阶段可以收口，但不得进入真实数据链路。
