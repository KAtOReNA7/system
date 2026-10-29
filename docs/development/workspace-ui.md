# XG 版业务工作台

本轮交付工作台、作品列表、作品详情和研究结果四页。设计依据是用户确认的
[Figma v0.2](https://www.figma.com/design/KBxjmG0RJdwd3OirHHLpuk?node-id=20-2)。
页面采用 React 与 Vite，沿用现有 Node HTTP composition，没有新增平行业务服务器。

## 使用

先运行 `npm ci` 和 `npm run build`，然后选择一种组合启动：

- `npm run start:fixture`：128 条显式合成作品，提供搜索、分类与状态筛选、分页、详情、历史现金和空预测。
- `npm start`：正式只读作品接口；缺少数据库时明确返回 503，未接入字段保持 null。

两种组合均访问 `http://127.0.0.1:3000/workspace/`。端口由既有 `M1_HTTP_PORT` 配置。
研究页 `#/research` 在两种组合中均可无数据库读取。旧管理工具 `/admin` 保留原有功能。
查询参数不能更改服务器组合；前端不会因请求失败而自动加载 fixture。

本地前端开发可另开 `npm run dev:workspace`；Vite 仅提供前端热更新，并向同机 3000 端口代理 API。
构建输出 `public/workspace/` 是可再生、Git ignored 的产物。正式与演示服务共享静态处理器；
未构建时 `/workspace` 返回明确 503，但 `/health` 仍能独立启动。

## 代码与数据来源

| 范围 | 入口 |
|---|---|
| 四页、组件、数据读取和样式 | `web/workspace/src/` |
| 两张原创图、字体与许可 | `web/workspace/assets/` |
| 构建配置 | `vite.config.mjs` |
| 受限目录的静态服务 | `src/http/staticWorkspace.js` |
| 正式只读投影、共享过滤与汇总 | `src/repositories/workspaceRepository.js` |
| 显式合成仓库与确定性数据 | `src/repositories/workspaceFixtureRepository.js`、`src/fixtures/workspaceFixture.js` |
| 公共研究投影 | `src/repositories/publicResearchRepository.js` |

可用读取接口：`/api/workspace/context`、`/api/workspace/overview`、
`/api/workspace/works`、`/api/workspace/works/:id`、
`/api/m2/public/research-summary` 与白名单 `/api/m2/public/research-sources/:id`。
作品列表支持 `search/category/dataStatus/businessStatus/page/pageSize`，搜索条件保存在 URL，
详情返回会恢复筛选。资料记录与完整研究来源可展开查看。

正式 M1 作品源目前只提供作品 ID 和三项完整性标记。名称、作者、分类、渠道、
完整月数与分成现金尚未接入；本轮不通过账单实销推定分成现金，也没有进行真实数据库验收。
正式过滤范围受当前字段可用性限制。合成数据单独说明演示身份，汇总从同一 128 条记录计算。
月现金与近 12 月总额守恒，未观察月份保持空值，纯买断现金及预测均为 null。

研究摘要动态读取 Model Registry、业务验收合同、全模型历史横评公开聚合、唯一独立评价，
并引用登记表指向的当前状态索引。只显示明确的公共字段，不运行模型、不读取 private。
3/6/12/36 月分别关联合同阈值，案例覆盖不能替代金额覆盖；两项数值在限额内不代表完整验收通过。
作品总额与作品×渠道门禁分别显示，36 月保留历史非前瞻警示，60 月不进入本轮输出。

## 相对于设计图的必要变化

- 设计预览标识改为服务器实际的“合成演示”或“正式数据·只读”。
- 首页完整账单作品与待处理数量使用可核对的合成记录统计，替代设计阶段示意常数；主数据零缺项不显示待补全。
- 列表分类、买断历史月数和详情资料按所选记录显示；全部作品可查看详情。
- 为可用交互增加搜索提交、清除筛选、空/错/加载与越界页码状态、来源展开。
- 设计整理日期不作为研究结果更新日期；来源文件自己的日期显示在完整来源中。
- 保留原管理工具入口；没有制作或发布 Sites 托管版，没有接入模型执行或上传写入功能。

## 验证入口

遵循根目录完整公共门禁。`npm run build` 现在包含 Vite 编译，已有 CI 的 Linux 与 Windows
构建步骤会执行同一入口；新增测试由现有 registry 自动发现，不维护重复测试命令清单。
`test/workspace-api.test.js` 覆盖组合边界、筛选与月现金守恒；
`test/public-research.test.js` 覆盖权威关联和来源限制；
`test/static-workspace.test.js` 覆盖路径边界与静态响应；
`test/e2e/workspace.e2e.test.js` 覆盖四页交互、无数据库状态和手机布局。

已实现、已验证、已授权与可发布分别判断。前端通过不代表 M1 真实业务链或 M2 模型验收完成。
