# M2-B-2 老品评估 fixture-only 管理端页面与 E2E 最小闭环实现报告 v0.1

## 1. 本轮范围

本轮实现 M2-B-2 老品评估 fixture-only 管理端页面与页面级自动化测试闭环。

实现严格基于 M2-B-1 已完成的只读 fixture API：

- `GET /api/m2/old-products/evaluations/overview`
- `GET /api/m2/old-products/evaluations`
- `GET /api/m2/old-products/evaluations/:standardWorkId`
- `GET /api/m2/old-products/readiness-gaps`
- `GET /api/m2/old-products/algorithm-versions`
- `GET /api/m2/old-products/backtests`
- `GET /api/m2/old-products/backtests/:backtestBatchId`

本轮未实现、未启用、未预留任何写操作入口：

- 未实现正式评估模式；
- 未实现 `local_dry_run` 模式；
- 未实现导出 API；
- 未实现评估任务创建、取消、重试；
- 未实现导入、激活、撤销、应用等页面操作；
- 未激活 `mapping_version`；
- 未调用 `switch_mapping_version`。

## 2. 页面实现

在现有 `/admin` 最小只读管理端中新增 5 个 M2 页面：

| 页面 | 路由 hash | 说明 |
| --- | --- | --- |
| 老品评估总览 | `#m2-overview` | 展示 fixture 数据集边界、评估规模、评级/生命周期/风险分布、最新完整月与不完整月提醒。 |
| 老品评估列表 | `#m2-list` | 展示老品评估列表、分页、最小筛选、评级、生命周期、readiness 和主要建议。 |
| 老品评估详情 | `#m2-detail:SYN-WORK-0001` | 展示单个合成作品的评估结论、预测情景、收入输入快照、建议、算法版本和回测摘要。 |
| 老品数据缺口 | `#m2-gaps` | 展示 readiness gap、阻断字段、建议 owner/action，明确正式评估仍被阻断。 |
| 回测与算法版本 | `#m2-backtests` | 展示 fixture-only 算法版本、回测批次和回测样本结果。 |

所有 M2 页面均显示：

- `fixture-only` 标识；
- `synthetic marker` 标识；
- `dataset.mode`；
- `formalDataAuthorized=false`；
- `formalEvaluationAllowed=false`；
- 最新已确认完整月份 `2026-04`；
- 不完整月份 `2026-05 excluded`；
- 正式老品评估阻断说明；
- “不得用于正式业务决策”的提示。

## 3. 状态覆盖

页面和 E2E 覆盖以下状态：

| 状态 | 覆盖方式 |
| --- | --- |
| success | M2 五个页面正常读取 fixture API。 |
| empty | 列表 API 返回空 `items` 时展示正常空态。 |
| blocked | API 返回 `formal_data_blocked` 时展示阻断态。 |
| error | API 返回 `internal_error` 时展示安全错误态。 |
| not found | 详情页请求不存在的 `standardWorkId` 时展示统一未找到状态。 |
| mobile contained | 390px 视口下页面级无横向溢出，表格容器保持 `overflow-x:auto` 并显示横向滚动提示。 |

错误态仅展示业务可读文案、技术 code 和 requestId，不展示连接串、密码、SQL、堆栈、主机端口或真实业务数据。

## 4. 数据与安全边界

本轮只使用仓库内 M2-B-1 synthetic fixture API。

明确未发生：

- 未连接任何数据库；
- 未执行 Docker；
- 未读取 `data/**`；
- 未读取真实账单；
- 未读取数字版权台账；
- 未读取运营确认 Excel 或运营确认结果；
- 未读取 `mapping_import_stage-v0.1.json`；
- 未读取 `mapping_import_stage-v0.2.json`；
- 未修改 `db/migrations/`；
- 未新增数据库迁移；
- 未新增业务写接口；
- 未新增写操作 UI；
- 未触碰 stash。

## 5. 修改文件

| 文件 | 变更 |
| --- | --- |
| `public/admin/index.html` | 新增 M2 老品评估页面导航和 5 个页面容器。 |
| `public/admin/app.js` | 新增 M2 fixture API 调用、页面渲染、筛选、状态表达和错误态处理。 |
| `public/admin/app.css` | 新增 M2 安全边界面板、筛选面板、阻断态、分布卡片和移动端布局修正。 |
| `test/admin.test.js` | 增加静态页面和静态资源断言，确认 M2 页面入口、API 路径和禁写边界。 |
| `test/e2e/admin.e2e.test.js` | 增加 M2 页面 E2E，覆盖 success / empty / blocked / error / not found / mobile / 禁写入口。 |

## 6. 验证结论

本轮应执行并通过：

- `npm run check:no-real-data`
- `npm run lint`
- `npm run build`
- `npm test`
- `npm run smoke`
- `npm run test:e2e`

验证重点：

- M2 页面只消费 M2-B-1 fixture API；
- 页面不存在导入、激活、撤销、重试、取消、上传、应用、迁移、写入、提交等写操作入口；
- E2E 覆盖 M2 五页正常态；
- E2E 覆盖 blocked / empty / error / not found；
- E2E 覆盖 390px 移动端；
- `check:no-real-data` 未发现真实数据或敏感明细进入本轮产物。

## 7. 阶段结论

M2-B-2 fixture-only 管理端页面与 E2E 最小闭环已完成。

当前可以进入下一步 M2-B-3，但 M2-B-3 仍必须保持：

- fixture-only；
- 不连接正式库；
- 不导入真实数据；
- 不启用 formal old-product evaluation；
- 不激活 mapping version；
- 不新增正式迁移。

