# M1 Flyway 迁移候选清单 v0.1

状态：FORMAL MIGRATION CANDIDATE — NOT YET APPROVED FOR PRODUCTION。

- 生成目录：`experiments/m1-flyway-candidate/migrations/`
- 正式目录：未创建、未修改 `db/migrations/`
- 候选 SQL 文件数：80
- 命名格式：`V{layer4}_{seq3}__description.sql`
- 执行原则：Flyway SQL-only，forward-only，不生成 down migration。
- Flyway history：`flyway_history.flyway_schema_history`
- 业务对象 schema：`m1`
- 每个 SQL 文件顶部均包含候选声明 banner。
- 配置模板不保存密码、URL、主机端口或本地绝对路径；运行时显式传入 `flyway.url` 与 `flyway.locations`。

## 分层数量

| Layer | 文件数 |
|---|---:|
| 0000 | 2 |
| 0010 | 10 |
| 0020 | 7 |
| 0030 | 13 |
| 0040 | 12 |
| 0050 | 7 |
| 0060 | 29 |

## 候选文件

| 文件 | Layer | 大小 bytes | SHA-256 前缀 |
|---|---:|---:|---|
| `V0000_010__preflight_environment_roles_and_utc.sql` | 0000 | 1380 | `2345d0b7da97` |
| `V0000_020__create_system_state_control_table.sql` | 0000 | 849 | `7e7a2311ef79` |
| `V0010_010__table_background_task.sql` | 0010 | 1777 | `fee6f55b2111` |
| `V0010_020__table_background_task_event.sql` | 0010 | 1028 | `99bd0e3d9af8` |
| `V0010_030__table_file_fingerprint_registry.sql` | 0010 | 753 | `d6497365cee8` |
| `V0010_040__table_cleaning_rule_version.sql` | 0010 | 1118 | `ceaefb8ba6af` |
| `V0010_050__table_channel.sql` | 0010 | 837 | `88af9aa61948` |
| `V0010_060__table_standard_work.sql` | 0010 | 742 | `2aa47eaa4411` |
| `V0010_070__table_author.sql` | 0010 | 914 | `dfe8ae876a4f` |
| `V0010_080__table_classification_system.sql` | 0010 | 863 | `1731620100bc` |
| `V0010_090__table_classification_release.sql` | 0010 | 1078 | `79d074b2bfd6` |
| `V0010_100__table_tag_release.sql` | 0010 | 1045 | `62e8426e10af` |
| `V0020_010__table_import_file.sql` | 0020 | 1174 | `3ea85962cf99` |
| `V0020_020__table_bill_staging_session.sql` | 0020 | 1372 | `b6d197c27869` |
| `V0020_030__table_temp_bill_record.sql` | 0020 | 1364 | `f40089a6ab11` |
| `V0020_040__table_import_batch.sql` | 0020 | 2551 | `b02bdfb722e8` |
| `V0020_050__table_import_batch_file.sql` | 0020 | 907 | `68311dfe66aa` |
| `V0020_060__table_import_batch_month.sql` | 0020 | 914 | `94fa3f6b378f` |
| `V0020_070__table_income_fact.sql` | 0020 | 1792 | `aa5bc6e4673f` |
| `V0030_010__table_mapping_version.sql` | 0030 | 1577 | `fe154816ef18` |
| `V0030_020__alter_import_batch.sql` | 0030 | 654 | `c742473075c9` |
| `V0030_030__table_issue_run.sql` | 0030 | 1771 | `b1916f3f0390` |
| `V0030_040__table_data_issue.sql` | 0030 | 1313 | `c5294575d25f` |
| `V0030_050__table_data_issue_decision.sql` | 0030 | 1197 | `e0e8dff615c8` |
| `V0030_060__table_work_business_form.sql` | 0030 | 823 | `2b60f76f35b2` |
| `V0030_070__table_channel_alias.sql` | 0030 | 1357 | `9f502f9c5902` |
| `V0030_080__table_raw_work_id_mapping.sql` | 0030 | 1324 | `d1687d0c70b1` |
| `V0030_090__table_historical_volume_mapping.sql` | 0030 | 1364 | `17c937035364` |
| `V0030_100__table_income_projection.sql` | 0030 | 2027 | `e73f24c8f410` |
| `V0030_110__table_mapping_version_work_metric.sql` | 0030 | 1104 | `24c491143d01` |
| `V0030_120__table_mapping_version_work_form_metric.sql` | 0030 | 1344 | `f80f3d59365c` |
| `V0030_130__table_standard_work_status_history.sql` | 0030 | 1092 | `2305294d5ebf` |
| `V0040_010__table_author_alias.sql` | 0040 | 1253 | `dac3abd2eee2` |
| `V0040_020__table_classification_node.sql` | 0040 | 1598 | `5cf87e9809db` |
| `V0040_030__table_tag.sql` | 0040 | 1129 | `62f337db1d06` |
| `V0040_040__table_basic_info_version.sql` | 0040 | 1705 | `187ab3929671` |
| `V0040_050__table_basic_info_version_work.sql` | 0040 | 1432 | `05404b7ba60d` |
| `V0040_060__table_work_classification_assignment.sql` | 0040 | 1094 | `55cd4f608234` |
| `V0040_070__table_work_tag_assignment.sql` | 0040 | 1058 | `79389388719e` |
| `V0040_080__table_basic_info_export.sql` | 0040 | 1067 | `7a3656df96ec` |
| `V0040_090__table_basic_info_upload.sql` | 0040 | 1378 | `b3d15b4bde7d` |
| `V0040_100__table_basic_info_temp_record.sql` | 0040 | 1386 | `4495517c840a` |
| `V0040_110__table_basic_info_issue.sql` | 0040 | 1196 | `521ebf4d6fa9` |
| `V0040_120__table_basic_info_apply_batch.sql` | 0040 | 1316 | `ed579fc78e5f` |
| `V0050_010__table_month_completeness_confirmation.sql` | 0050 | 1327 | `d20d40b37ddf` |
| `V0050_020__table_batch_impact_record.sql` | 0050 | 1268 | `38ff01bcc605` |
| `V0050_030__table_batch_impact_consumption.sql` | 0050 | 1187 | `56ef6f412612` |
| `V0050_040__table_restore_point.sql` | 0050 | 1222 | `1846a4f4e772` |
| `V0050_050__alter_basic_info_apply_batch.sql` | 0050 | 651 | `16d895b3bf49` |
| `V0050_060__table_import_batch_undo.sql` | 0050 | 1449 | `8ac2dad46b87` |
| `V0050_070__table_mapping_change_record.sql` | 0050 | 1234 | `851e3a3a5a5f` |
| `V0060_010__function_derive_standard_work_id.sql` | 0060 | 813 | `8226396d9599` |
| `V0060_020__function_derive_business_form.sql` | 0060 | 798 | `cde30f06df22` |
| `V0060_030__function_begin_master_data_initialization.sql` | 0060 | 1249 | `96c42d689f9a` |
| `V0060_040__function_initialize_bootstrap_versions.sql` | 0060 | 3772 | `2d2946796847` |
| `V0060_050__function_assert_mapping_coverage.sql` | 0060 | 2307 | `72ccfc0af922` |
| `V0060_060__function_activate_bill_batch.sql` | 0060 | 2491 | `f6896df836a5` |
| `V0060_070__function_revoke_bill_batch.sql` | 0060 | 2045 | `f4800badb77a` |
| `V0060_080__function_switch_mapping_version.sql` | 0060 | 1738 | `fc23d53ed31c` |
| `V0060_090__function_switch_basic_info_version.sql` | 0060 | 3091 | `91d4aed93d5d` |
| `V0060_100__permission_grant_minimum_permissions.sql` | 0060 | 557 | `d14971fd703d` |
| `V0060_110__function_require_switch_context.sql` | 0060 | 1014 | `4a3faec7580d` |
| `V0060_120__function_guard_version_status.sql` | 0060 | 1951 | `ba3a5b62faa8` |
| `V0060_130__function_guard_batch_status.sql` | 0060 | 1175 | `95a13e732a20` |
| `V0060_140__function_assert_active_versions.sql` | 0060 | 2453 | `1370f1cd34eb` |
| `V0060_150__function_validate_work_mapping_identity.sql` | 0060 | 1731 | `d2729cd1b48f` |
| `V0060_160__function_enforce_mapping_table_mutex.sql` | 0060 | 1931 | `341c2128f08a` |
| `V0060_170__function_reject_income_fact_mutation.sql` | 0060 | 871 | `21ea84612896` |
| `V0060_180__function_validate_income_fact_insert.sql` | 0060 | 1049 | `14afdc23d792` |
| `V0060_190__function_guard_snapshot_child.sql` | 0060 | 3855 | `7f26e63d5794` |
| `V0060_200__function_validate_classification_parent.sql` | 0060 | 1149 | `3d62ad438aa5` |
| `V0060_210__function_validate_basic_assignment_release.sql` | 0060 | 1859 | `4fa0b4c41ed0` |
| `V0060_220__function_validate_projection_sources.sql` | 0060 | 1762 | `656186eda7a6` |
| `V0060_230__view_v_current_income.sql` | 0060 | 1116 | `fbb43c429568` |
| `V0060_240__view_v_basic_info_gap.sql` | 0060 | 1270 | `2fbd544b682b` |
| `V0060_250__view_v_basic_info_m2_completeness.sql` | 0060 | 1678 | `6b18c99d31e6` |
| `V0060_260__view_v_bill_cutoff_months.sql` | 0060 | 905 | `fddf9e8ed846` |
| `V0060_270__view_v_income_projection_monthly.sql` | 0060 | 911 | `540c65ad9d37` |
| `V0060_280__permission_grant_minimum_permissions.sql` | 0060 | 2465 | `c72813eb5a43` |
| `V0060_290__harden_default_privileges.sql` | 0060 | 687 | `225934d28a7d` |

完整 checksum 见：`experiments/m1-flyway-candidate/reports/candidate-generation-manifest.json`。
