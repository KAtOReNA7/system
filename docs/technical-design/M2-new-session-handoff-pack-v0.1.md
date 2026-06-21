# M2 新会话迁移包 v0.1

以下内容可直接复制到新 ChatGPT / Codex 会话，用于接手项目。

```text
你正在接手“有声书收入评估系统”项目。

一、项目背景

项目目标是建设有声书收入评估与年度目标系统。M1 完成数据基础、mapping_version、最小管理端和工程门禁；M2 聚焦老品评估、非正式算法候选、fixture/productization、formal readiness 原型与下一阶段正式化准备。

二、当前 M2 总结论

M2 主开发已完成。
M2 可按“非正式算法候选 + formal readiness fixture prototype”阶段收口。
不要继续 M2-C5/C6。
不要开启 FR-7。
不要在旧会话继续新增 M2 功能。

当前冻结候选版本：

m2-c3-cleaned-bill-nonformal-v0.2/candidate-a

candidate-a 是非正式算法候选，不是 formal evaluation 结果，不可用于正式决策。

三、M2 已完成阶段清单

M2-B 已完成：
- fixture old-product evaluation API；
- fixture admin pages；
- admin interaction refinement；
- no-DB readiness tools；
- fixture evaluation engine；
- fixture productization and calibration preparation。

M2-C 已完成：
- cleaned-bill aggregate calibration exploration；
- calibrated parameters guarded integration；
- non-formal aggregate dry-run；
- aggregate parameter iteration；
- candidate-a non-formal acceptance；
- business acceptance with conditions。

M2-FR 已完成：
- FR-0 formal readiness scope freeze；
- FR-1 formal persistence data model and SQL candidate；
- FR-2 formal readiness gate fixture and contract；
- FR-3 blocking manual review workflow fixture prototype；
- FR-4 evaluation task fixture prototype；
- FR-5 advisory review display fixture integration；
- FR-6 export release gate fixture prototype。

四、当前 API/admin/fixture 能力

已具备 M2 old-product fixture read-only API：
- GET /api/m2/old-products/evaluations/overview
- GET /api/m2/old-products/evaluations
- GET /api/m2/old-products/evaluations/:standardWorkId
- GET /api/m2/old-products/readiness-gaps
- GET /api/m2/old-products/algorithm-versions
- GET /api/m2/old-products/backtests
- GET /api/m2/old-products/backtests/:backtestBatchId

已具备 fixture / prototype 能力：
- formal-readiness blocking review fixture API；
- fixture evaluation task API；
- advisory review fixture summary API；
- fixture export release gate API；
- old-product fixture evaluation engine；
- calibrated non-formal parameter profile；
- formal readiness gate；
- blocking review workflow；
- evaluation task workflow；
- advisory review display；
- export release gate。

已具备 admin 能力：
- M2 overview/list/detail/gaps/backtests；
- blocking review fixture admin；
- evaluation task fixture admin；
- advisory review display；
- fixture export release gate admin；
- synthetic / fixture / not-for-formal-decision 边界提示。

五、当前不能做的事

当前禁止：
- formal evaluation；
- 写数据库；
- 执行 migration；
- 修改 db/migrations/；
- 激活 mapping_version；
- 调用 switch_mapping_version；
- 读取或提交原始真实账单；
- 读取或提交数字版权台账原文；
- 读取或提交运营确认原文；
- 提交 data/** 原始文件；
- 输出真实作品级明细；
- 新增正式 export/task/write API；
- 继续 M2-C5/C6；
- 开启 FR-7。

六、为什么不能进入 formal evaluation

formal evaluation 当前仍被阻断：
- 正式库授权未开启；
- mapping_version 未激活；
- switch_mapping_version 未调用；
- candidate-a 是非正式候选；
- copyright end / basic info readiness 仍需补齐或可审计豁免；
- blocking manual review items 仍需业务闭环；
- formal persistence 仍停留在模型和 SQL candidate；
- runtime formal task API 未实现；
- runtime formal export API 未实现；
- audit/release/rollback 尚未 DB-backed。

七、下一阶段建议

建议新会话从以下方向之一开始：

1. M2 handoff review and next-stage planning：
   只读复核 M2-final-closeout-report 和本 handoff pack，确认下一阶段边界。

2. Formal DB-backed implementation planning：
   规划正式持久化、任务、导出、审计发布链路。仍需用户单独授权数据库、migration 和正式数据边界。

3. Formal evaluation readiness execution plan：
   拆解正式库授权、数据 readiness、mapping activation、人工复核、对账、发布审批步骤。

4. M3 scope planning：
   如果暂不进入 formal evaluation，则基于 M2 收口结果规划 M3。

八、已知风险

- candidate-a 不是正式评估结果。
- formal readiness 缺口不应被 fixture prototype 掩盖。
- 任何正式库、正式数据、migration、mapping activation、switch_mapping_version 都必须单独授权。
- export/task/write API 当前只有 fixture/prototype 能力，不能被误认为正式链路。
- advisory review 是提示/展示，不等于自动执行。
- downlist / suspend / renewal 等运营建议必须人工确认后才能进入正式链路。

九、Codex 行为约束

Codex 必须：
- 先执行 git status、HEAD 与 origin/main 门禁；
- 工作区不 clean 时停止；
- 只读审计时不得连接数据库；
- 不得读取 data/** 或原始真实数据；
- 不得执行 Docker；
- 不得执行 migration；
- 不得修改 db/migrations/；
- 不得激活 mapping_version；
- 不得调用 switch_mapping_version；
- 不得使用 git add .；
- 不得触碰 stash；
- 提交必须显式路径；
- 如只改文档，也至少运行 npm run check:no-real-data、npm run lint、npm run build、npm test。

十、下一会话启动提示词

你正在接手“有声书收入评估系统”项目，M2 主开发已完成，candidate-a 已冻结为 m2-c3-cleaned-bill-nonformal-v0.2/candidate-a。不要继续 M2-C5/C6 或 FR-7。当前禁止 formal evaluation、写数据库、执行 migration、激活 mapping_version、调用 switch_mapping_version、读取或提交原始真实数据。下一步应基于 docs/technical-design/M2-final-closeout-report-v0.1.md 和 docs/technical-design/M2-new-session-handoff-pack-v0.1.md 进行新会话 handoff review，并规划正式 DB-backed implementation、formal evaluation execution 或 M3。
```

