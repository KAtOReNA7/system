# M1 运营确认包 v2.3 聚合摘要

## 输出

- 本地私有工作簿：`data/m1-master-data-private/ops-confirmation/M1-运营确认包-v2.3.xlsx`
- 私有任务映射：`data/m1-master-data-private/ops-confirmation/ops-confirmation-v2.3-task-mapping.json`
- 公开逻辑审计：`docs/analysis/m1-master-data/ops-confirmation-v2.3-logic-audit.md`

## 核心数量

| 指标 | 数量 |
|---|---:|
| 正式导入阻断组 | 346 |
| 多名称冲突组 | 327 |
| 多授权分类冲突组 | 18 |
| 异常ID组 | 2 |
| 新增跨业务形态非阻断观察 | 427 |
| 非阻断观察总数 | 517 |
| M2 基础信息待补全作品 | 3099 |

## 规则变化

- 正常双业务形态不再作为正式导入阻断。
- 授权分类不决定业务形态。
- 任务ID改为稳定语义ID，不依赖 Excel 行号。
- 未迁移任何 v2.2 人工填写结果；当前可安全自动迁移数量为 0。
