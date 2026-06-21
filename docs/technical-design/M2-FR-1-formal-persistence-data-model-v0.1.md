# M2-FR-1 formal persistence data model v0.1

## 1. 本轮边界

本设计进入 M2 formal readiness 技术实现第一步，只定义正式老品评估结果的持久化模型、状态边界、审计字段、migration 草案和测试骨架。

本轮不执行 formal evaluation，不写数据库，不执行 migration，不激活 `mapping_version`，不调用 `switch_mapping_version`，不新增 export API、evaluation task API、write API 或页面入口。

candidate-a 已冻结为 FR 阶段唯一非正式算法候选：

```text
m2-c3-cleaned-bill-nonformal-v0.2/candidate-a
```

该候选可以作为后续 formal readiness 实现的算法来源标识，但在 readiness 未完成前仍不得作为正式业务结论。

## 2. 设计原则

1. 结果快照不可覆盖：同一轮正式评估生成的结果以新记录保存，历史结果通过状态失效，不做原地重写。
2. 输入快照可追溯：评估结果必须记录当时使用的 `mapping_version_id`、`basic_info_version_id`、cutoff month、收入批次来源和输入 hash。
3. 金额保持精确十进制：所有金额字段继续使用 PostgreSQL `numeric(32,18)` 候选类型，不使用 float/double。
4. review 与 result 分离：blocking manual review 和 advisory review 独立持久化，避免把提示项误解释为正式阻断。
5. non-formal 边界显式保存：`not_for_formal_decision` 与 `formal_evaluation_allowed` 必须保留，防止 candidate-a 被误升级。
6. 不依赖作品级敏感明细：本模型记录正式评估必要快照和聚合解释，不存原始账单行。
7. 状态变更需审计：失效、review 决策、算法版本冻结/发布均必须有时间、操作者或审计元数据承载位。

## 3. 表清单

| 表 | 职责 | 数据属性 |
|---|---|---|
| `m2_evaluation_algorithm_versions` | 记录算法、候选、参数版本及发布状态 | 权威版本元数据 |
| `m2_evaluation_results` | 保存正式老品评估结果快照 | 权威结果快照 |
| `m2_evaluation_input_snapshots` | 保存生成结果时使用的输入聚合快照 | 权威输入快照 |
| `m2_evaluation_risks` | 保存结果风险项 | 结果子表 |
| `m2_evaluation_suggestions` | 保存结果建议项 | 结果子表 |
| `m2_evaluation_review_items` | 保存 blocking manual review 与 advisory review 状态 | 审核工作项 |

## 4. 状态与枚举

### 4.1 result status

`m2_evaluation_results.result_status`：

- `current`：当前有效结果。
- `historical`：被后续结果替代的历史结果。
- `invalidated`：因输入版本、算法版本、映射版本、基础信息版本或人工处理结果变化而失效。
- `failed`：正式评估尝试失败并持久化失败摘要。

建议约束：

- `invalidated` 必须有 `invalidated_at` 和 `invalidation_reason`。
- `current` 不允许有 `invalidated_at`。
- 同一 `standard_work_id + cutoff_month + mapping_version_id + basic_info_version_id + algorithm_version` 只允许一个 `current` 结果。

### 4.2 review status

`m2_evaluation_review_items.review_status`：

- `pending`
- `approved`
- `data_fix_required`
- `waiver_granted`
- `rejected_for_formal`
- `no_action_required`

含义：

- `pending`：尚未处理。
- `approved`：人工确认可进入后续正式评估流程。
- `data_fix_required`：需要先修正来源数据或主数据。
- `waiver_granted`：业务授予可审计豁免。
- `rejected_for_formal`：拒绝进入正式评估。
- `no_action_required`：确认无需处理，常用于 advisory review。

### 4.3 risk type

`m2_evaluation_risks.risk_type`：

- `blocking`：阻断 formal evaluation 或 formal release。
- `advisory`：提示运营或分析人员注意，但不阻断。
- `warning`：轻量警告或解释性提示。

`is_blocking` 与 `is_advisory` 是面向查询的显式布尔字段，权威语义仍由 `risk_type` 表达。

### 4.4 algorithm version status

`m2_evaluation_algorithm_versions.status`：

- `draft`：草案。
- `frozen`：冻结为候选。
- `released`：正式发布。
- `retired`：退役。
- `failed`：版本构建或验证失败。

candidate-a 当前只允许进入 `frozen` 非正式候选，不允许标记为正式发布。

## 5. 表定义

### 5.1 `m2_evaluation_algorithm_versions`

用途：记录算法和参数版本，作为结果表的版本锚点。

| 字段 | 类型候选 | 空值 | 说明 |
|---|---|---:|---|
| `id` | `bigint identity` | 否 | 主键 |
| `version_key` | `text` | 否 | 算法版本唯一键 |
| `candidate_version` | `text` | 否 | 候选版本，例如 candidate-a |
| `parameter_version` | `text` | 否 | 参数版本 |
| `status` | `text` | 否 | `draft/frozen/released/retired/failed` |
| `is_formal` | `boolean` | 否 | 是否正式版本 |
| `source_candidate` | `text` | 是 | 来源候选 |
| `description` | `text` | 是 | 版本说明 |
| `frozen_at` | `timestamptz` | 是 | 冻结时间 |
| `released_at` | `timestamptz` | 是 | 发布时间 |
| `retired_at` | `timestamptz` | 是 | 退役时间 |
| `audit_metadata_json` | `jsonb` | 否 | 审计元数据 |
| `created_at` | `timestamptz` | 否 | 创建时间 |

关键约束：

- `version_key` 唯一。
- `status='released'` 时必须 `is_formal=true` 且 `released_at IS NOT NULL`。
- `status='frozen'` 时必须 `frozen_at IS NOT NULL`。
- `status='retired'` 时必须 `retired_at IS NOT NULL`。

### 5.2 `m2_evaluation_results`

用途：保存正式老品评估结果快照。

| 字段 | 类型候选 | 空值 | 说明 |
|---|---|---:|---|
| `id` | `bigint identity` | 否 | 主键 |
| `standard_work_id` | `text` | 否 | 标准作品 ID，引用 `standard_work` |
| `candidate_version` | `text` | 否 | 候选版本 |
| `algorithm_version` | `text` | 否 | 算法版本，引用 `m2_evaluation_algorithm_versions.version_key` |
| `parameter_version` | `text` | 否 | 参数版本 |
| `mapping_version_id` | `bigint` | 否 | 引用 `mapping_version` |
| `basic_info_version_id` | `bigint` | 否 | 引用 `basic_info_version` |
| `cutoff_month` | `date` | 否 | 数据截止自然月，使用月首日期 |
| `result_status` | `text` | 否 | `current/historical/invalidated/failed` |
| `rating` | `text` | 是 | `S+/S/A/B/C/D/E/not_rated` |
| `rating_score` | `numeric(10,4)` | 是 | 评分 |
| `lifecycle` | `text` | 是 | 生命周期分类 |
| `lifecycle_confidence` | `text` | 是 | 生命周期置信度 |
| `forecast_base_total` | `numeric(32,18)` | 是 | 基准预测 |
| `forecast_optimistic_total` | `numeric(32,18)` | 是 | 乐观预测 |
| `forecast_pessimistic_total` | `numeric(32,18)` | 是 | 悲观预测 |
| `forecast_range_lower` | `numeric(32,18)` | 是 | 预测下界 |
| `forecast_range_upper` | `numeric(32,18)` | 是 | 预测上界 |
| `risk_level` | `text` | 是 | `none/low/medium/high` |
| `primary_suggestion` | `text` | 是 | 主要建议 |
| `not_for_formal_decision` | `boolean` | 否 | 是否禁止正式决策 |
| `formal_evaluation_allowed` | `boolean` | 否 | 是否允许正式评估 |
| `generated_at` | `timestamptz` | 否 | 生成时间 |
| `invalidated_at` | `timestamptz` | 是 | 失效时间 |
| `invalidation_reason` | `text` | 是 | 失效原因 |
| `created_at` | `timestamptz` | 否 | 创建时间 |
| `updated_at` | `timestamptz` | 否 | 更新时间 |

关键约束：

- `cutoff_month` 必须是自然月月首。
- `not_for_formal_decision=true` 时 `formal_evaluation_allowed` 必须为 false。
- `forecast_range_lower <= forecast_range_upper`。
- `rating_score` 范围为 0 到 100。
- 通过部分唯一索引限制同一版本组合只有一个 `current` 结果。

### 5.3 `m2_evaluation_input_snapshots`

用途：保存生成评估结果时使用的输入快照。该表不保存原始账单行，只保存聚合输入、版本引用和输入 hash。

| 字段 | 类型候选 | 空值 | 说明 |
|---|---|---:|---|
| `id` | `bigint identity` | 否 | 主键 |
| `evaluation_result_id` | `bigint` | 否 | 引用 `m2_evaluation_results` |
| `standard_work_id` | `text` | 否 | 标准作品 ID |
| `cutoff_month` | `date` | 否 | 评估截止月 |
| `latest_complete_month` | `date` | 否 | 最新确认完整月份 |
| `income_fact_version` | `text` | 是 | 收入事实版本/校验标识 |
| `source_batch_ids` | `bigint[]` | 否 | 来源批次 ID 列表 |
| `mapping_version_id` | `bigint` | 否 | 映射版本 |
| `basic_info_version_id` | `bigint` | 否 | 基础信息版本 |
| `copyright_start` | `date` | 是 | 版权开始日期 |
| `copyright_end` | `date` | 是 | 版权到期日期 |
| `remaining_copyright_months` | `integer` | 是 | 剩余版权月数 |
| `last3_revenue` | `numeric(32,18)` | 否 | 近 3 月收入 |
| `last6_revenue` | `numeric(32,18)` | 否 | 近 6 月收入 |
| `last12_revenue` | `numeric(32,18)` | 否 | 近 12 月收入 |
| `last24_revenue` | `numeric(32,18)` | 否 | 近 24 月收入 |
| `total_historical_revenue` | `numeric(32,18)` | 否 | 历史累计收入 |
| `active_month_count` | `integer` | 否 | 正收入活跃月数 |
| `zero_revenue_month_count` | `integer` | 否 | 零收入月数 |
| `business_form_breakdown` | `jsonb` | 否 | 业务形态聚合分布 |
| `channel_concentration_summary` | `jsonb` | 否 | 渠道集中度聚合摘要 |
| `incomplete_months_excluded` | `date[]` | 否 | 被排除的不完整月份 |
| `input_hash` | `text` | 否 | 输入快照 hash |
| `created_at` | `timestamptz` | 否 | 创建时间 |

关键约束：

- 每个 `evaluation_result_id` 最多一个 input snapshot。
- `latest_complete_month <= cutoff_month`。
- `copyright_start <= copyright_end`，日期缺失时允许为空并由 review/risk 承接。

### 5.4 `m2_evaluation_risks`

用途：保存结果风险项。

| 字段 | 类型候选 | 空值 | 说明 |
|---|---|---:|---|
| `id` | `bigint identity` | 否 | 主键 |
| `evaluation_result_id` | `bigint` | 否 | 引用结果 |
| `risk_code` | `text` | 否 | 风险代码 |
| `severity` | `text` | 否 | `low/medium/high` |
| `risk_type` | `text` | 否 | `blocking/advisory/warning` |
| `is_blocking` | `boolean` | 否 | 是否阻断 |
| `is_advisory` | `boolean` | 否 | 是否提示 |
| `evidence_json` | `jsonb` | 否 | 聚合证据 |
| `mitigation_hint` | `text` | 是 | 缓解建议 |
| `created_at` | `timestamptz` | 否 | 创建时间 |

关键约束：

- 同一结果下 `risk_code + risk_type` 唯一。
- `risk_type='blocking'` 时 `is_blocking=true`。
- `risk_type='advisory'` 时 `is_advisory=true`。
- 不允许同一风险同时是 blocking 与 advisory。

### 5.5 `m2_evaluation_suggestions`

用途：保存建议项。

| 字段 | 类型候选 | 空值 | 说明 |
|---|---|---:|---|
| `id` | `bigint identity` | 否 | 主键 |
| `evaluation_result_id` | `bigint` | 否 | 引用结果 |
| `suggestion_code` | `text` | 否 | 建议代码 |
| `priority` | `integer` | 否 | 优先级，数值越小越优先 |
| `reason` | `text` | 否 | 原因 |
| `expected_impact` | `text` | 是 | 预期影响 |
| `requires_manual_confirmation` | `boolean` | 否 | 是否需要人工确认 |
| `created_at` | `timestamptz` | 否 | 创建时间 |

关键约束：

- 同一结果下 `suggestion_code` 唯一。
- `priority >= 1`。

### 5.6 `m2_evaluation_review_items`

用途：保存 blocking manual review 和 advisory review。

| 字段 | 类型候选 | 空值 | 说明 |
|---|---|---:|---|
| `id` | `bigint identity` | 否 | 主键 |
| `evaluation_result_id` | `bigint` | 否 | 引用结果 |
| `standard_work_id` | `text` | 否 | 标准作品 ID |
| `review_type` | `text` | 否 | `blocking_manual_review/advisory_review` |
| `review_reason_code` | `text` | 否 | 复核原因代码 |
| `review_status` | `text` | 否 | 复核状态 |
| `review_priority` | `integer` | 否 | 优先级 |
| `is_blocking` | `boolean` | 否 | 是否阻断 formal evaluation |
| `assigned_to` | `text` | 是 | 分配人 |
| `reviewed_by` | `text` | 是 | 复核人 |
| `reviewed_at` | `timestamptz` | 是 | 复核时间 |
| `decision` | `text` | 是 | 决策结果 |
| `decision_reason` | `text` | 是 | 决策原因 |
| `audit_metadata_json` | `jsonb` | 否 | 审计元数据 |
| `created_at` | `timestamptz` | 否 | 创建时间 |
| `updated_at` | `timestamptz` | 否 | 更新时间 |

关键约束：

- 同一结果下 `review_type + review_reason_code` 唯一。
- `review_type='blocking_manual_review'` 时 `is_blocking=true`。
- `review_status='pending'` 时不得有 `reviewed_at`。
- 非 pending 状态建议保留 `reviewed_by` 与 `decision`。

## 6. 索引建议

必须索引：

- `standard_work_id`
- `cutoff_month`
- `candidate_version`
- `algorithm_version`
- `mapping_version_id`
- `result_status`
- `rating`
- `lifecycle`
- `risk_code`
- `review_status`
- `is_blocking`
- `created_at`

补充建议：

- `m2_evaluation_results`：`(standard_work_id, cutoff_month DESC)`。
- `m2_evaluation_results`：`(mapping_version_id, basic_info_version_id, cutoff_month)`。
- `m2_evaluation_results`：部分唯一索引限制 `current`。
- `m2_evaluation_risks`：`(risk_code, severity, risk_type)`。
- `m2_evaluation_review_items`：`(review_status, is_blocking, review_priority, created_at)`。

## 7. 失效与重算边界

以下变化必须使相关正式评估结果进入可失效流程：

- `mapping_version` 变化；
- `basic_info_version` 变化；
- 最新确认完整月份或 cutoff month 变化；
- 算法版本或参数版本变化；
- blocking review 决策变化；
- 版权开始/到期日期、基础信息、分类或标签的正式版本变化；
- 正式评估输入 hash 与原记录不一致。

本轮只定义持久化模型，不实现失效函数、不执行重算、不新增 task API。

## 8. 与 M1 表的关系

- `standard_work_id` 引用 M1 `standard_work(standard_work_id)`。
- `mapping_version_id` 引用 M1 `mapping_version(id)`。
- `basic_info_version_id` 引用 M1 `basic_info_version(id)`。
- 输入快照通过 `source_batch_ids` 记录来源批次集合；数组元素的逐项 FK 可在正式迁移阶段通过约束触发器或独立关联表进一步强化。

## 9. 非本轮范围

- 不生成正式 Flyway migration。
- 不把 SQL candidate 放入 `db/migrations/`。
- 不执行 SQL。
- 不连接任何数据库。
- 不实现 formal evaluation。
- 不实现 export API。
- 不实现 evaluation task API。
- 不实现 write API。
- 不修改 admin 页面。

## 10. 后续实现建议

推荐下一步进入 `M2-FR-2 mapping/basic-info/copyright readiness gate`：

1. 基于本轮结果模型定义 readiness gate 的输入与阻断输出。
2. 明确哪些 blocking review item 来源于 readiness gate，哪些来源于算法风险。
3. 只在 readiness gate 能输出稳定阻断原因后，再进入 task API 与 formal evaluation 执行能力。
