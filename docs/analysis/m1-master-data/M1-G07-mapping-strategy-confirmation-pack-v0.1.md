# M1 G07 映射策略确认包 v0.1

生成时间：2026-06-21T17:26:49+08:00

## 结论

G07 当前保持 `BLOCKED_DATA_OR_MODEL`，分类为 `physical_model_identity_rule_conflict`。该阻断不是 Docker、Flyway 或数据库环境问题；Docker PostgreSQL 16.14 隔离演练已完成，G06 已通过，事务已回滚。

本轮只读分析确认：当前候选计划把 `161280`、`161284`、`161290` 作为 `161260/audio_copyright` 的常规 `raw_work_id_mapping`，但这 3 条不符合正式模型的 identity 规则，因此不得直接进入 `raw_work_id_mapping`。

推荐策略：不要让规则自动选择主常规 raw ID。若业务确认这 3 个 ID 是 `161260` 的历史分册、历史登记或别名关系，应调整为 `historical_volume_mapping` 或仅保留为审计来源；若业务要求“常规 raw ID 可指向非自身 standard_work_id”，才需要另提 forward-only 物理模型迁移。

## 来源与只读范围

本确认包基于以下已生成结果做只读分析：

- Docker 本地隔离演练 summary/report；
- 候选映射 stage 数据中的 G07 相关物理计划、有效快照和来源任务；
- 当前仓库内正式模型函数与表约束定义。

本轮未连接正式库、未执行数据库写入演练、未导入真实账单、未修改候选 mapping_version 包本体、未修改 `db/migrations/`。

## G07 对象

| 项目 | 值 |
| --- | --- |
| 目标标准作品 ID | `161260` |
| 业务形态 | `audio_copyright` |
| 当前候选 raw IDs | `161280`, `161284`, `161290` |
| 当前计划表 | `raw_work_id_mapping` |
| 当前阻断码 | `BLOCKED_DATA_OR_MODEL` |
| G07 分类 | `physical_model_identity_rule_conflict` |

## 当前候选计划关系

| raw_work_id | 当前计划 | target_standard_work_id | business_form | 来源任务 | 当前判定 |
| --- | --- | --- | --- | --- | --- |
| `161280` | `raw_work_id_mapping` | `161260` | `audio_copyright` | `IMPORT-BLOCK::161280` | 不可直接写入常规映射 |
| `161284` | `raw_work_id_mapping` | `161260` | `audio_copyright` | `IMPORT-BLOCK::161284` | 不可直接写入常规映射 |
| `161290` | `raw_work_id_mapping` | `161260` | `audio_copyright` | `IMPORT-BLOCK::161290` | 不可直接写入常规映射 |

这 3 条来源依据均包含“ID规则、运营确认、专项复核”，但来源依据不能绕过当前物理模型的 identity trigger。

## 为什么不能进入 raw_work_id_mapping

正式模型对常规映射有硬约束：

```text
derive_standard_work_id(raw_work_id) = standard_work_id
```

当前派生规则为：

| raw_work_id | derive_standard_work_id | derive_business_form | 计划 target_standard_work_id | 计划 business_form | 结果 |
| --- | --- | --- | --- | --- | --- |
| `161280` | `161280` | `audio_copyright` | `161260` | `audio_copyright` | standard ID 不一致 |
| `161284` | `161284` | `audio_copyright` | `161260` | `audio_copyright` | standard ID 不一致 |
| `161290` | `161290` | `audio_copyright` | `161260` | `audio_copyright` | standard ID 不一致 |

因此，直接插入 `161280/161284/161290 -> 161260` 会先被 identity trigger 拒绝；同一 `mapping_version_id + standard_work_id + business_form` 的唯一约束冲突还未到达执行阶段。

## 是否存在符合 identity 规则的主常规 raw ID 候选

就 `161260/audio_copyright` 而言，当前候选物理计划中没有可直接作为主常规 `raw_work_id_mapping` 的 raw ID。

- `161260 -> 161260/audio_copyright` 理论上符合 identity 规则，但当前 G07 相关候选计划中没有这条常规映射记录；
- `Y161260 -> 161260` 在当前计划中存在，但其派生业务形态是 `audio_product`，不是 G07 的 `audio_copyright`；
- `161280`、`161284`、`161290` 均只能派生到自身 standard ID，不能常规映射到 `161260`。

所以本轮不能由规则自动选择 `161280`、`161284` 或 `161290` 作为 `161260/audio_copyright` 的主常规 raw ID。

## historical_volume_mapping 调整建议

如果业务确认 `161280`、`161284`、`161290` 确实是 `161260` 的历史分册、历史登记或别名关系，推荐将它们从常规 `raw_work_id_mapping` 调整为 `historical_volume_mapping`：

| raw_work_id | 推荐处理 | target_standard_work_id | business_form | 原因 |
| --- | --- | --- | --- | --- |
| `161280` | 调整为 `historical_volume_mapping` | `161260` | `audio_copyright` | 可保留归并关系，但不违反常规映射 identity 规则 |
| `161284` | 调整为 `historical_volume_mapping` | `161260` | `audio_copyright` | 可保留归并关系，但不违反常规映射 identity 规则 |
| `161290` | 调整为 `historical_volume_mapping` | `161260` | `audio_copyright` | 可保留归并关系，但不违反常规映射 identity 规则 |

说明：`historical_volume_mapping` 当前模型不要求 `derive_standard_work_id(raw_work_id)` 等于目标标准作品 ID，只要求 raw ID 可派生且业务形态匹配。因此这一路径更符合“历史分册/历史登记/别名归并”的语义。

## 仅保留审计来源的情况

若业务不能确认上述 3 个 ID 与 `161260` 是历史分册、历史登记或别名关系，则不应生成物理映射；可仅保留为审计来源或待确认事项：

- 保留 `IMPORT-BLOCK::161280`、`IMPORT-BLOCK::161284`、`IMPORT-BLOCK::161290` 的确认链路；
- 不进入 `raw_work_id_mapping`；
- 不进入 `historical_volume_mapping`；
- 不由规则引擎学习为通用归并规则；
- 后续需人工补充业务结论后再构建候选映射。

## 是否需要用户补充确认

需要。用户下一步需明确选择以下策略之一：

1. 确认 `161280`、`161284`、`161290` 都是 `161260/audio_copyright` 的历史分册、历史登记或别名关系，并授权将它们调整为 `historical_volume_mapping`；
2. 确认仅其中部分 ID 属于上述关系，其余仅保留审计来源或保持为独立标准作品；
3. 补充一个符合 identity 规则、可作为 `161260/audio_copyright` 主常规映射的 raw ID，例如明确是否存在 `161260 -> 161260/audio_copyright`；
4. 明确业务要求允许常规 raw ID 指向非自身 standard ID，此时才进入 forward-only 物理模型迁移设计讨论。

## 是否需要 forward-only 物理模型迁移

当前不建议立即提出 forward-only 物理模型迁移。

理由：

- 当前 G07 更像候选导入策略问题：历史归并关系被放入了常规 `raw_work_id_mapping`；
- 现有模型已经提供 `historical_volume_mapping` 表来表达“raw ID 可归并到其他目标标准作品”的关系；
- 直接放宽 `raw_work_id_mapping` identity 规则会扩大常规映射语义，影响范围高于 G07 个案。

只有当业务明确要求“常规 raw ID 可指向非自身 standard_work_id，并且这不是历史分册/历史登记/别名关系”时，才建议另起 forward-only 物理模型迁移方案。

## 推荐确认口径

建议用户确认以下口径：

```text
G07 中 161280、161284、161290 不作为 161260/audio_copyright 的常规 raw_work_id_mapping 写入。
若业务确认其与 161260 为历史分册、历史登记或别名关系，则调整为 historical_volume_mapping；
否则仅保留审计来源并继续阻断。
不得由规则自动选择主常规 raw ID。
本确认不授权修改 db/migrations，不授权写正式库，不授权激活 mapping_version，不授权正式数据迁移。
```

## 安全边界确认

| 项目 | 结果 |
| --- | --- |
| 修改候选包本体 | 否 |
| 修改 `db/migrations/` | 否 |
| 连接正式库 | 否 |
| 写正式库 | 否 |
| 导入真实账单/台账/运营确认结果 | 否 |
| 激活 mapping_version | 否 |
| 调用 `switch_mapping_version` | 否 |
| 执行正式数据迁移 | 否 |
| 使用 `git add .` | 否 |
| 触碰 stash | 否 |

## 当前状态

G07 仍保持 `BLOCKED_DATA_OR_MODEL`。在用户完成策略确认前，不允许进入下一步受控导入准备。
