# M1 G07 映射策略调整报告 v0.1

生成时间：2026-06-21T17:30:00+08:00

## 结论

已按用户确认口径生成 v0.2 派生候选导入 stage 和 overlay，未修改原始候选 mapping_version 包本体，未修改 `db/migrations/`。

G07 的 `161280`、`161284`、`161290` 已从常规 `raw_work_id_mapping` 计划移出，并调整为 `historical_volume_mapping`，目标仍为 `161260/audio_copyright`。三条来源任务和审计来源均保留，不作为通用规则，不允许规则引擎学习或复用。

## 产物

- v0.2 派生 stage：`experiments/m1-mapping-version-import-candidate/mapping_import_stage-v0.2.json`
- overlay：`experiments/m1-mapping-version-import-candidate/G07-mapping-strategy-overlay-v0.2.json`

## 数量变化

| item | before | after | delta |
| --- | --- | --- | --- |
| raw_work_id_mapping rows | 303 | 300 | -3 |
| historical_volume_mapping rows | 49 | 52 | 3 |
| audit source record count | 353 | 353 | 0 |
| raw table identity conflict count | 3 | 0 | -3 |
| raw table unique conflict group count | 1 | 0 | -1 |

## G07 新归属

| raw_work_id | new_table | target_standard_work_id | business_form | source_task_ids | audit_source_count | is_general_rule |
| --- | --- | --- | --- | --- | --- | --- |
| 161280 | historical_volume_mapping | 161260 | audio_copyright | IMPORT-BLOCK::161280 | 1 | false |
| 161284 | historical_volume_mapping | 161260 | audio_copyright | IMPORT-BLOCK::161284 | 1 | false |
| 161290 | historical_volume_mapping | 161260 | audio_copyright | IMPORT-BLOCK::161290 | 1 | false |

## 冲突状态

- `RAW_TABLE_IDENTITY_COMPATIBILITY`：调整后预计不再因 G07 三条 ID 失败。
- `RAW_TABLE_UNIQUE_COMPATIBILITY`：调整后预计不再因 `161260/audio_copyright` 重复目标/形态失败。
- forward-only 物理模型迁移：不需要。
- 主常规 raw ID 自动选择：禁止；本轮不补充主常规 raw ID。

## 安全边界

| 项目 | 结果 |
| --- | --- |
| 修改原候选包本体 | 否 |
| 修改 `db/migrations/` | 否 |
| 连接正式库 | 否 |
| 导入真实数据 | 否 |
| 激活 mapping_version | 否 |
| 调用 `switch_mapping_version` | 否 |
| 执行正式数据迁移 | 否 |
| 使用 `git add .` | 否 |
| 触碰 stash | 否 |
