# M1 最小管理端页面浏览器联调与视觉 QA 报告 v0.1

状态：PASSED WITH MINOR FIXES

日期：2026-06-21

## 1. 本轮范围

本轮对最小只读管理端执行浏览器联调与视觉 QA。

入口：

- `GET /admin`
- `GET /admin/`
- `GET /admin/app.css`
- `GET /admin/app.js`

检查页面：

- 系统状态；
- 作品列表；
- 映射版本；
- 后台任务。

检查状态：

- `loading`；
- `empty`；
- `success`；
- `degraded`；
- `error`；
- `not found`。

## 2. 运行环境

本轮启动本地服务：

```text
http://127.0.0.1:3107/admin
```

环境边界：

- 未配置数据库 URL；
- 未连接正式数据库；
- 未读取 `data/`；
- 未导入真实账单；
- 未导入数字版权台账；
- 未导入运营确认结果；
- 未执行 mapping 激活；
- 未执行正式数据迁移。

## 3. 浏览器检查结果

### 3.1 系统状态页

默认无数据库配置状态：

- 服务卡片正常显示；
- 数据库卡片显示 `connected=false`、`reason=database_not_configured`；
- 生命周期卡片显示统一错误；
- 页面总状态为 `degraded`；
- 无残留 loading。

合成 fixture 状态：

- 服务卡片正常；
- 数据库卡片显示 `schemaVersion=0060.290`；
- 生命周期卡片显示 `schema_initialized`；
- 页面总状态为 `success`。

### 3.2 作品列表页

默认无数据库配置状态：

- 显示统一错误；
- 错误包含 `database_not_configured` 和 requestId；
- 未暴露连接串、密码、SQL 或真实数据。

合成 fixture 状态：

- 展示 `SYN-WORK-001`、`SYN-WORK-002`；
- 展示基础信息、核心字段和分类缺口状态；
- 展示分页信息；
- 展示详情预览。

### 3.3 映射版本页

合成 fixture 状态：

- 展示合成 mapping version；
- 展示 `building` 状态；
- 展示 `projectionRowCount=0`；
- 展示详情预览；
- 未出现激活、导入、撤销或应用按钮。

### 3.4 后台任务页

合成 fixture 状态：

- 展示合成任务；
- 展示 `pending` 状态；
- 展示详情预览；
- 未出现启动、重试或取消按钮。

## 4. 状态覆盖

| 状态 | 检查方式 | 结果 |
| --- | --- | --- |
| `loading` | 页面初始请求阶段与测试覆盖 | 通过 |
| `empty` | 空列表逻辑由现有测试覆盖，页面文案定义为空库正常 | 通过 |
| `success` | fixture 模式四个页面 | 通过 |
| `degraded` | 无数据库配置的系统状态页 | 通过 |
| `error` | 无数据库配置的作品页/API 错误展示 | 通过 |
| `not found` | 详情接口 404 测试覆盖，页面错误组件可显示 requestId | 通过 |

说明：当前页面没有手动输入详情 ID 的控件，因此 `not found` 主要由接口测试和详情请求错误组件路径覆盖；未新增写入或查询表单。

## 5. 视觉 QA 发现与修订

发现 1：系统状态页默认无数据库时，系统状态请求失败会导致服务卡和数据库卡残留 loading。

修订：

- 将系统页改为分卡片独立渲染；
- 服务、数据库、生命周期三块分别容错；
- 数据库未配置显示 degraded，而不是页面整体残留 loading。

发现 2：移动宽度下宽表会造成页面整体横向溢出。

修订：

- 表格容器改为内部横向滚动；
- 页面和内容容器允许收缩；
- 小屏工具栏纵向排列；
- 表格分页提示增加内边距。

复核结果：

- 桌面宽度显示正常；
- 移动宽度页面本体无横向溢出；
- 表格在容器内横向滚动；
- 卡片和表格无明显错位；
- 错误态信息完整；
- 空态未被描述为异常；
- 未出现不该存在的写操作入口。

## 6. 禁止操作核对

本轮未执行：

- 正式数据库连接；
- 真实账单读取或导入；
- 数字版权台账导入；
- 运营确认 Excel 或确认结果导入；
- 新增写接口；
- 新增导入、激活、撤销、重试、取消按钮；
- `db/migrations/` 修改；
- Flyway 历史迁移修改；
- stash 清理、应用或删除；
- 非本轮运营线 / mapping_version 未跟踪产物提交。

## 7. 验证命令

执行：

```text
npm run lint
npm run build
npm test
npm run smoke
npm run check:no-real-data
```

验证结果记录在最终完成报告中。

## 8. 2026-06-21 状态表达与文案归一化复核

本轮在不改变 M1 只读边界的前提下，追加复核以下修订：

- 默认未配置数据库时，系统状态页显示 `降级 / degraded`，并明确“数据库未配置”不等同于“空库”。
- 数据库卡片显示 `数据库未配置（database_not_configured）`，`schemaVersion` 与 `systemState` 显示为“暂不可读取”，避免误读为迁移完成后的空库。
- 生命周期卡片由通用“请求失败”改为“生命周期状态”，包含：
  - 状态：暂不可读取；
  - 原因：数据库未配置（database_not_configured）；
  - 技术码：database_not_configured；
  - requestId。
- 错误态主文案改为业务可读表达，保留技术 code 与 requestId，不展示底层连接错误文案。
- `success`、`degraded`、`empty`、`error`、`not found` 均增加简短状态说明。
- `schema_initialized`、`database_not_configured`、`building`、`pending` 等技术状态增加中文展示并保留原始 code。
- 作品列表增加字段说明：
  - “未提供”表示当前 API 尚未返回标准作品名称；
  - “缺失”表示该字段仍待基础信息补全；
  - 当前不展示真实收入、作者或版权日期。
- 映射版本和后台任务增加状态说明。
- 作品、映射版本、后台任务表格增加“小屏幕下可横向滚动查看完整列”的提示。

浏览器复核结果：

- `/admin` 默认无数据库配置：通过，未暴露连接串、密码、SQL、堆栈、主机端口或真实业务数据。
- `/admin?fixture=1#system`：通过，显示 `结构已初始化（schema_initialized）`。
- `/admin?fixture=1#works`：通过，显示作品字段说明与表格横向滚动提示。
- `/admin?fixture=1#mapping`：通过，显示映射版本状态说明与 `构建中（building）`。
- `/admin?fixture=1#jobs`：通过，显示后台任务状态说明与 `等待中（pending）`。
- 1280px 桌面布局：通过，无页面级横向溢出。
- 390px 移动布局：通过，页面本体无横向溢出，宽表在表格容器内横向滚动。
- 写操作入口：未发现导入、激活、撤销、重试、取消、上传、应用、迁移、写入或提交按钮。
