# M3 新品评估数据模型 v0.1

状态：fixture/prototype design

本轮未新增 migration。本模型描述 M3 fixture/prototype 的对象边界，并为后续正式建模提供草案。

## 对象

| 对象 | 说明 |
|---|---|
| `m3_topic` | 选题主体，保存书名、作者、来源、分类、流程状态、目标渠道 |
| `m3_topic_input_snapshot` | 结构化输入快照和 readiness 结果 |
| `m3_material_file_metadata` | 材料文件元数据 |
| `m3_material_chunk` | 材料分块索引和结构化抽取结果 |
| `m3_comparator_candidate` | 对标候选、最终对标、排除原因 |
| `m3_author_rank_signal` | 作者排位信号 |
| `m3_external_signal_snapshot` | 外部热度信号和采集时间 |
| `m3_forecast_attempt` | 新品评估尝试 |
| `m3_forecast_result` | 当前/历史/失效评估结果 |
| `m3_backtest_checkpoint` | 首年、三年、五年回测 |
| `m3_topic_work_link` | 选题与标准作品一对一关联 |

## Fixture Implementation

当前实现文件：

- `src/domain/newProductEvaluation/fixtureEngine.js`
- `src/fixtures/m3NewProductEvaluationFixture.js`
- `src/repositories/newProductEvaluationFixtureRepository.js`

当前路由只读接入：

- `src/http/app.js`

## 正式建模前置

后续写 migration 前必须确认：

- M3 formal 范围和授权。
- M2 readiness rerun 或 formal exception。
- 原始材料保存策略。
- 外部数据采集版本策略。
- 选题与标准作品关联的唯一性约束。
- 评估任务、评估尝试、正式结果状态与 `REQ-EVAL-001` 至 `REQ-EVAL-004` 一致。
