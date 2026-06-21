# M1 mapping_version v0.2 local Docker dry-run report

- status: ok
- environment: m1-local-dry-run
- database: m1_local_dry_run
- host: 127.0.0.1
- port: 55433
- stage artifact: mapping_import_stage-v0.2.json
- preflight passed: True
- controlled import rolled back: True
- G06/G07 passed: True
- active mapping count: 0
- background_worker can switch mapping version: False
- formal database connected: false
- staging / production / shared database connected: false
- real data imported: false
- db/migrations modified: false
- mapping version activated: false
- switch_mapping_version called: false

## Preflight output

```text
BEGIN
SET
SET
SELECT 352
CREATE TABLE
INSERT 0 1
INSERT 0 1
INSERT 0 1
INSERT 0 1
INSERT 0 1
INSERT 0 1
INSERT 0 1
gate_id|status|detail
COUNT_PHYSICAL_ROWS|PASS|expected 352, actual 352
HISTORICAL_TABLE_IDENTITY_COMPATIBILITY|PASS|historical_volume_mapping rows incompatible with derive_standard_work_id/derive_business_form=0
HISTORICAL_TABLE_UNIQUE_COMPATIBILITY|PASS|historical_raw_work_id duplicate groups=0
NO_RAW_TARGET_CONFLICT|PASS|same raw_work_id mapped to multiple target_standard_work_id count=0
RAW_TABLE_IDENTITY_COMPATIBILITY|PASS|raw_work_id_mapping rows incompatible with derive_standard_work_id/derive_business_form=0
RAW_TABLE_UNIQUE_COMPATIBILITY|PASS|raw_work_id_mapping target/form duplicate groups=0
VALID_BUSINESS_FORM|PASS|invalid business_form rows=0
(7 rows)
ROLLBACK
```

## Controlled import dry-run output

```text
SET
SET
BEGIN
SELECT 352
DO
raw_work_id_mapping_inserted|historical_volume_mapping_inserted|rehearsal_mapping_version_id
300|52|1
(1 row)
ROLLBACK
```

## G06/G07 output

```text
SET
SET
BEGIN
SELECT 352
SELECT 353
CREATE TABLE
INSERT 0 1
INSERT 0 1
INSERT 0 1
INSERT 0 1
gate_id|status|detail
G06_Y167972_FOLD|PASS|effective_source_records=2, physical_rows=1, audit_source_records=2, has_exception=t, source_task_ids=MERGE::167972\n169792; MERGE::167972\n167996
G07_RAW_IDENTITY_COMPATIBILITY|PASS|raw_work_id_mapping identity incompatible rows=0
G07_RAW_UNIQUE_COMPATIBILITY|PASS|raw_work_id_mapping duplicate target/form groups=0
G07_REVISED_STRATEGY|PASS|raw_rows=0, historical_rows=3, audit_source_records=3, general_rule_rows=0, source_task_ids=IMPORT-BLOCK::161280; IMPORT-BLOCK::161284; IMPORT-BLOCK::161290
(4 rows)
ROLLBACK
```
