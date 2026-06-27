# M3 新品评估页面方案 v0.1

状态：fixture/prototype

当前只读管理端已经新增 M3 fixture 页面，不提供正式写入、材料上传、评估发布或导出能力。

## 页面

| 页面 | 管理端 hash | 内容 |
|---|---|---|
| 新品评估总览 | `#m3-overview` | 选题规模、readiness、来源、评级分布、formal 阻断提示 |
| 新品选题库 | `#m3-topics` | topic ID、标题、作者、来源、分类、状态、readiness、评级、五年/首年预测 |
| 新品评估详情 | `#m3-detail:SYN-TOPIC-0001` | 输入快照、材料元数据、对标、作者排位、外部信号、预测、评级、关联和回测计划 |
| 新品数据缺口 | `#m3-gaps` | readiness gap、字段、严重度、formal 阻断状态 |
| 新品回测 | `#m3-backtests` | fixture 算法版本、回测批次、首年/三年/五年 checkpoint |

## 页面边界

- 所有页面只读。
- 所有数据为 synthetic fixture。
- 不显示真实作品名、作者名、渠道名、原始材料或原始账单行。
- 不提供正式评估任务创建。
- 不提供正式导出或发布。
