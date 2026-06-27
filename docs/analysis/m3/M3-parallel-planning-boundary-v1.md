# M3 parallel planning boundary v1

生成日期：2026-06-28

本报告定义当前允许的 M3 并行规划边界。当前项目只允许做 M3 PRD/方案准备，不允许进入 M3 formal execution，不允许绕过 M2 formal readiness，不允许写正式主数据或生成正式评估结果。

## 当前边界结论

| 项目 | 是否允许 | 说明 |
|---|---|---|
| M3 parallel planning | 允许 | 可做 PRD 框架、输入字段、接口依赖、数据需求、fixture/prototype 设计 |
| M3 formal execution | 禁止 | M2 formal readiness 未闭环 |
| M3 正式 API / export / release | 禁止 | formal task/export/release/audit 机制未完成且未授权 |
| 写正式主数据 | 禁止 | 版权、分类、标签、状态等仍需公司基础表补齐 |
| 使用 M2 local candidate 作为 formal input | 禁止 | 当前 M2 只是本地候选收口，不是 formal complete |

## 当前允许做的 M3 工作

| 工作项 | 边界 |
|---|---|
| PRD 框架 | 可定义新品评估的业务目标、范围、不做什么、验收标准 |
| 新品评估输入字段设计 | 可列字段和来源要求，不读取或提交 private 明细 |
| 新品预测思路讨论 | 可讨论算法方向、窗口、置信度和评估指标，不生成 formal 结果 |
| 与 M2 的接口依赖 | 可列依赖字段、状态、版本、readiness 前置条件 |
| 数据需求清单 | 可列需要公司补齐的数据源、字段、口径和验收要求 |
| fixture/prototype 设计 | 可用 synthetic/fixture 设计页面、API contract 和测试，不冒充真实 formal 结果 |
| 本地文档设计 | 可新增文档和 summary JSON，不改正式数据 |

## 当前禁止做的 M3 工作

| 禁止项 | 原因 |
|---|---|
| 正式 M3 任务执行 | M2 formal readiness 未通过 |
| 正式 M3 API / write API / export API | 未获得 formal 授权，且 M2 formal 输入未闭环 |
| formal release/export/audit | 正式发布链路尚未完成 |
| 使用缺失主数据绕过 readiness | 会违反 M1/M2 PRD 对主数据完整性的要求 |
| 把 M2 local candidate 当作 formal input | 当前候选只用于本地开发和有限业务复核 |
| 写正式主数据 | 需要公司基础表和用户授权 |
| 连接远端生产/共享/staging-like 数据库 | 当前仍禁止 |
| 输出真实作品名、作者名、渠道名或原始行级明细 | 公开报告必须脱敏 |

## M3 formal 启动前置门槛

| 门槛 | 当前状态 |
|---|---|
| M2 formal readiness 通过 | 未通过 |
| 版权到期闭环 | 仍有 522 个在部分填写后未闭环 |
| 作者和版权开始闭环 | 作者缺 75，版权开始缺 85 |
| 分类/标签闭环 | 一级分类、二级分类、必要标签均为 3054 缺口 |
| 作品状态/音频版权状态闭环 | 两项均为 3054 缺口 |
| 142 个到期仍有收入样本复核 | 未完成 |
| 92 个版权有效但收入稀疏样本复核 | 未完成 |
| formal task/export/release/audit 机制 | 未完成 |
| 用户明确授权 M3 formal | 未授权 |

## 与 M2 的衔接要求

M3 规划可以把当前 M2 local candidate 作为工程参考，但不能作为 formal 输入。正式 M3 前必须先回到 M2 readiness rerun：

1. 公司基础表补齐或形成 formal waiver。
2. 重新运行 M2 主数据 readiness 和 PRD 对齐审计。
3. 明确 M2 formal complete 或可审计的 formal exception。
4. 用户单独授权 M3 formal。

## 下一轮建议

优先做两条并行但互不混淆的线：

1. M2 readiness closure：继续补公司基础表、复核到期/收入异常和版权有效但收入稀疏样本。
2. M3 parallel planning：只写 PRD、字段、接口依赖、fixture/prototype 和测试计划，不实现 formal API，不写正式数据。

## 安全声明

- 本报告没有进入 M3 formal execution。
- 本报告没有写正式主数据。
- 本报告没有连接远端生产、共享或 staging-like 数据库。
- 本报告没有提交 private Excel、`data/private-output/**`、原始账单、原始台账、完整作品明细、连接串或密码。
- 本报告没有修改 M2 收入模式、评级、预测或建议规则。
