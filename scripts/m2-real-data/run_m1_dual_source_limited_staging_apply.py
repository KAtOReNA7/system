from __future__ import annotations

import argparse
import importlib.util
import json
import re
import subprocess
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
OUTPUT_M1 = ROOT / "docs" / "analysis" / "m1-master-data"
OUTPUT_M2 = ROOT / "docs" / "analysis" / "m2-real-data"
PRIVATE_M1 = ROOT / "data" / "private-output" / "m1-master-data"
PRIVATE_M2 = ROOT / "data" / "private-output" / "m2-business-review"

PRIVATE_CANDIDATES_V2_JSON = PRIVATE_M1 / "M1-dual-source-masterdata-backfill-candidates-v2.json"
PRIVATE_OVERRIDES_JSON = PRIVATE_M1 / "M1-dual-source-user-confirmed-overrides-v1.json"
PRIVATE_DRY_RUN_V2_JSON = PRIVATE_M1 / "M1-dual-source-masterdata-backfill-dry-run-v2.json"

PRIVATE_PLAN_JSON = PRIVATE_M1 / "M1-dual-source-limited-staging-apply-plan-v1.json"
PRIVATE_PLAN_XLSX = PRIVATE_M1 / "M1-dual-source-limited-staging-apply-plan-v1.xlsx"
PUBLIC_PLAN_JSON = OUTPUT_M1 / "M1-dual-source-limited-staging-apply-plan-v1.json"
PUBLIC_PLAN_MD = OUTPUT_M1 / "M1-dual-source-limited-staging-apply-plan-v1.md"

PRIVATE_DRY_RUN_JSON = PRIVATE_M1 / "M1-dual-source-limited-staging-apply-dry-run-v1.json"
PRIVATE_DRY_RUN_XLSX = PRIVATE_M1 / "M1-dual-source-limited-staging-apply-dry-run-v1.xlsx"
PUBLIC_DRY_RUN_JSON = OUTPUT_M1 / "M1-dual-source-limited-staging-apply-dry-run-v1.json"
PUBLIC_DRY_RUN_MD = OUTPUT_M1 / "M1-dual-source-limited-staging-apply-dry-run-v1.md"

PRIVATE_RESULT_JSON = PRIVATE_M1 / "M1-dual-source-limited-staging-apply-result-v1.json"
PRIVATE_RESULT_XLSX = PRIVATE_M1 / "M1-dual-source-limited-staging-apply-result-v1.xlsx"
PRIVATE_STAGING_TABLE_JSON = PRIVATE_M1 / "M1-dual-source-limited-staging-table-v1.json"
PUBLIC_RESULT_JSON = OUTPUT_M1 / "M1-dual-source-limited-staging-apply-result-v1.json"
PUBLIC_RESULT_MD = OUTPUT_M1 / "M1-dual-source-limited-staging-apply-result-v1.md"

PUBLIC_GAP_JSON = OUTPUT_M1 / "M1-gap-after-dual-source-staging-apply-v1.json"
PUBLIC_GAP_MD = OUTPUT_M1 / "M1-gap-after-dual-source-staging-apply-v1.md"
PUBLIC_FORECAST_JSON = OUTPUT_M2 / "M2-forecast-output-type-after-dual-source-staging-v1.json"
PUBLIC_FORECAST_MD = OUTPUT_M2 / "M2-forecast-output-type-after-dual-source-staging-v1.md"
PUBLIC_READINESS_JSON = OUTPUT_M2 / "M2-business-readiness-after-dual-source-staging-v1.json"
PUBLIC_READINESS_MD = OUTPUT_M2 / "M2-business-readiness-after-dual-source-staging-v1.md"

SOURCE_OPERATOR_TASK_JSON = PRIVATE_M2 / "m2-v1.1-30-work-operator-task-pack-cn-source.json"
SOURCE_RANDOM_20_JSON = PRIVATE_M2 / "M2-v1.1-random-20-year-evaluation-cn-source.json"
PRIVATE_OPERATOR_AFTER_JSON = PRIVATE_M2 / "m2-v1.1-30-work-operator-task-pack-cn-after-dual-source-staging-source.json"
PRIVATE_OPERATOR_AFTER_XLSX = PRIVATE_M2 / "m2-v1.1-30-work-operator-task-pack-cn-after-dual-source-staging.xlsx"
PRIVATE_RANDOM_AFTER_JSON = PRIVATE_M2 / "M2-v1.1-random-20-year-evaluation-after-dual-source-staging-cn-source.json"
PRIVATE_RANDOM_AFTER_XLSX = PRIVATE_M2 / "M2-v1.1-random-20-year-evaluation-after-dual-source-staging-cn.xlsx"
PUBLIC_OPERATOR_SUMMARY_JSON = OUTPUT_M2 / "M2-operator-task-pack-after-dual-source-staging-summary-v1.json"
PUBLIC_OPERATOR_SUMMARY_MD = OUTPUT_M2 / "M2-operator-task-pack-after-dual-source-staging-summary-v1.md"
PUBLIC_RANDOM_SUMMARY_JSON = OUTPUT_M2 / "M2-random-20-year-evaluation-after-dual-source-staging-summary-v1.json"
PUBLIC_RANDOM_SUMMARY_MD = OUTPUT_M2 / "M2-random-20-year-evaluation-after-dual-source-staging-summary-v1.md"

ALLOWED_FIELDS = {"standardWorkName", "authorName", "copyrightStartDate", "copyrightEndDate"}
CLASSIFICATION_TAG_FIELDS = {"classificationLevel1", "classificationLevel2", "classificationLevel3", "requiredTags"}
FIELD_GAP_MAP = {
    "standardWorkName": "missingWorkName",
    "authorName": "missingAuthor",
    "copyrightStartDate": "missingCopyrightStart",
    "copyrightEndDate": "missingCopyrightEnd",
    "classificationLevel1": "missingClassification1",
    "classificationLevel2": "missingClassification2",
    "requiredTags": "missingRequiredTags",
}
FORECAST_OUTPUT_TYPES = [
    "copyright_term_forecast",
    "operating_window_forecast_pending_expiry",
    "formal_evaluation_blocked",
    "insufficient_masterdata_observation_only",
]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["dry-run", "apply", "m2-impact", "all"], default="all")
    parser.add_argument("--print-json", action="store_true")
    args = parser.parse_args()

    payload = build_payload()
    write_plan_outputs(payload)
    write_dry_run_outputs(payload)
    if args.mode in {"apply", "all"}:
        write_apply_outputs(payload)
    write_gap_outputs(payload)
    write_m2_outputs(payload)
    write_task_pack_outputs(payload)

    summary = cli_summary(args.mode, payload)
    print(json.dumps(summary, ensure_ascii=False))
    if args.print_json:
        print(json.dumps(summary, ensure_ascii=False, indent=2))


def load_v3_module():
    path = ROOT / "scripts" / "m2-real-data" / "run_cleaned_ledger_minimal_backfill_v3.py"
    spec = importlib.util.spec_from_file_location("cleaned_ledger_v3", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)  # type: ignore[union-attr]
    return module


v3 = load_v3_module()


def build_payload() -> dict:
    ensure_inputs()
    generated_at = now()
    candidates = read_json(PRIVATE_CANDIDATES_V2_JSON)["candidateRows"]
    overrides = read_json(PRIVATE_OVERRIDES_JSON)["overrides"]
    v2_dry_run = read_json(PRIVATE_DRY_RUN_V2_JSON)["dryRun"]
    candidate_by_key = {candidate_key(candidate): candidate for candidate in candidates}

    safe_records, safe_blocked = build_safe_auto_apply_records(candidates)
    override_records, override_blocked = build_override_records(overrides, candidate_by_key)
    staging_records, duplicate_summary = combine_records(safe_records, override_records)
    gap = build_gap(v2_dry_run, staging_records)
    m2_forecast = build_forecast_output_type(gap, staging_records)
    readiness = build_readiness(gap, m2_forecast, staging_records)
    task_pack = build_task_pack_payload(staging_records)

    summary = build_public_summary(
        generated_at,
        staging_records,
        safe_records,
        override_records,
        safe_blocked,
        override_blocked,
        duplicate_summary,
        gap,
        m2_forecast,
        readiness,
        task_pack,
    )
    return {
        "generatedAt": generated_at,
        "safeRecords": safe_records,
        "overrideRecords": override_records,
        "safeBlocked": safe_blocked,
        "overrideBlocked": override_blocked,
        "stagingRecords": staging_records,
        "duplicateSummary": duplicate_summary,
        "gap": gap,
        "m2Forecast": m2_forecast,
        "readiness": readiness,
        "taskPack": task_pack,
        "summary": summary,
    }


def ensure_inputs() -> None:
    missing = [
        rel(path)
        for path in [
            PRIVATE_CANDIDATES_V2_JSON,
            PRIVATE_OVERRIDES_JSON,
            PRIVATE_DRY_RUN_V2_JSON,
            SOURCE_OPERATOR_TASK_JSON,
            SOURCE_RANDOM_20_JSON,
        ]
        if not path.exists()
    ]
    if missing:
        raise SystemExit("Missing required private input files: " + ", ".join(missing))


def build_safe_auto_apply_records(candidates: list[dict]) -> tuple[list[dict], Counter]:
    records = []
    blocked: Counter[str] = Counter()
    for candidate in candidates:
        if not candidate.get("safeAutoApplyEligibleV2"):
            continue
        reasons = strict_safe_block_reasons(candidate)
        if reasons:
            for reason in reasons:
                blocked[reason] += 1
            continue
        records.append(
            staging_record(
                source_type="safe_auto_apply",
                candidate=candidate,
                apply_value=clean(candidate.get("proposedValueNormalized") or candidate.get("proposedValue")),
                user_action="",
                block_reasons=[],
            )
        )
    return records, blocked


def strict_safe_block_reasons(candidate: dict) -> list[str]:
    reasons = []
    field = candidate.get("fieldName", "")
    if field not in ALLOWED_FIELDS:
        reasons.append("field_not_in_limited_apply_scope")
    if has_value(candidate.get("currentValue")):
        reasons.append("current_authoritative_value_not_empty")
    if candidate.get("source") == "both_sources_conflict" or candidate.get("conflictStatus") == "dual_source_value_conflict":
        reasons.append("unresolved_dual_source_conflict")
    if "fuzzy" in clean(candidate.get("matchMethod")) or "title_only" in clean(candidate.get("matchMethod")):
        reasons.append("weak_match_blocked")
    if field in {"copyrightStartDate", "copyrightEndDate"} and complex_date_signal(candidate):
        reasons.append("complex_or_relative_date_signal")
    return sorted(set(reasons))


def build_override_records(overrides: list[dict], candidate_by_key: dict[str, dict]) -> tuple[list[dict], Counter]:
    records = []
    blocked: Counter[str] = Counter()
    for override in overrides:
        candidate = candidate_by_key.get(override.get("candidateKey", ""))
        reasons = strict_override_block_reasons(override, candidate)
        if reasons:
            for reason in reasons:
                blocked[reason] += 1
            continue
        apply_value = override_apply_value(override)
        records.append(
            staging_record(
                source_type="user_confirmed_override",
                candidate=candidate or override,
                apply_value=apply_value,
                user_action=override.get("userConfirmedAction", ""),
                block_reasons=[],
                override=override,
            )
        )
    return records, blocked


def strict_override_block_reasons(override: dict, candidate: dict | None) -> list[str]:
    reasons = []
    field = override.get("fieldName", "")
    if not override.get("canApplyToStaging"):
        reasons.append("not_user_confirmed_for_staging")
    if field not in ALLOWED_FIELDS:
        reasons.append("field_not_in_limited_apply_scope")
    if field in CLASSIFICATION_TAG_FIELDS:
        reasons.append("classification_or_tag_blocked")
    if not override_apply_value(override):
        reasons.append("missing_user_confirmed_value")
    if candidate is None:
        reasons.append("source_candidate_not_found")
    elif has_value(candidate.get("currentValue")):
        reasons.append("current_authoritative_value_not_empty")
    if candidate is not None and ("fuzzy" in clean(candidate.get("matchMethod")) or "title_only" in clean(candidate.get("matchMethod"))):
        reasons.append("weak_match_blocked")
    if candidate is not None and to_float(candidate.get("valueConfidence")) < 0.97:
        reasons.append("value_confidence_below_0_97")
    if override.get("userConfirmedAction") not in {"acceptCandidate", "applyCorrectedValue"}:
        reasons.append("unsupported_user_action")
    return sorted(set(reasons))


def combine_records(safe_records: list[dict], override_records: list[dict]) -> tuple[list[dict], dict]:
    seen: dict[tuple[str, str], dict] = {}
    duplicate_summary = {
        "safeSkippedBecauseOverrideWins": 0,
        "duplicateOverrideRecords": 0,
        "duplicateSafeRecords": 0,
    }
    combined = []
    for record in sorted(override_records, key=lambda item: (item["standardWorkId"], item["fieldName"], item["stagingRecordId"])):
        key = (record["standardWorkId"], record["fieldName"])
        if key in seen:
            duplicate_summary["duplicateOverrideRecords"] += 1
            continue
        seen[key] = record
        combined.append(record)
    for record in sorted(safe_records, key=lambda item: (item["standardWorkId"], item["fieldName"], item["stagingRecordId"])):
        key = (record["standardWorkId"], record["fieldName"])
        if key in seen:
            duplicate_summary["safeSkippedBecauseOverrideWins"] += 1
            continue
        seen[key] = record
        combined.append(record)
    for index, record in enumerate(combined, start=1):
        record["stagingRecordId"] = f"DSLSTA-{index:05d}"
    return combined, duplicate_summary


def staging_record(
    source_type: str,
    candidate: dict,
    apply_value: str,
    user_action: str,
    block_reasons: list[str],
    override: dict | None = None,
) -> dict:
    field = candidate.get("fieldName") or (override or {}).get("fieldName")
    work_id = candidate.get("standardWorkId") or (override or {}).get("standardWorkId")
    current_value = candidate.get("currentValue", "")
    source = candidate.get("source", "")
    match_method = candidate.get("matchMethod", "")
    conflict_status = candidate.get("conflictStatus", "")
    return {
        "stagingRecordId": "",
        "standardWorkId": clean(work_id),
        "rawWorkId": clean(candidate.get("rawWorkId")),
        "fieldName": clean(field),
        "fieldLabelCn": field_label(clean(field)),
        "currentValue": clean(current_value),
        "applyValue": clean(apply_value),
        "applySourceType": source_type,
        "candidateSource": clean(source),
        "matchMethod": clean(match_method),
        "valueConfidence": candidate.get("valueConfidence", ""),
        "parserStatus": candidate.get("parserStatus", ""),
        "conflictStatus": clean(conflict_status),
        "resolvedByUserOverride": source_type == "user_confirmed_override",
        "userConfirmedAction": clean(user_action),
        "candidateKey": candidate_key(candidate) if candidate else "",
        "totalHistoricalRevenue": candidate.get("totalHistoricalRevenue", ""),
        "notFormalMasterData": True,
        "databaseWritten": False,
        "formalMasterDataWritten": False,
        "rollbackMethod": "remove_private_file_level_staging_json_and_regenerate_reports",
        "blockReasons": block_reasons,
    }


def build_gap(v2_dry_run: dict, staging_records: list[dict]) -> dict:
    before = {key: value["before"] for key, value in v2_dry_run["fieldGapResults"].items()}
    reductions: dict[str, set[str]] = defaultdict(set)
    for record in staging_records:
        gap_key = FIELD_GAP_MAP.get(record["fieldName"])
        if gap_key:
            reductions[gap_key].add(record["standardWorkId"])
    fields = {}
    for gap_key, before_count in before.items():
        reduction = min(before_count, len(reductions[gap_key]))
        fields[gap_key] = {
            "before": before_count,
            "afterLocalStaging": max(0, before_count - reduction),
            "localStagingReduction": reduction,
            "formalMasterDataChanged": False,
        }
    return {
        "schema": "m1.gap_after_dual_source_limited_staging_apply.v1",
        "fieldGapResults": fields,
        "scope": "local_file_level_staging_only",
        "classificationAndTagsUnchanged": True,
        "formalMasterDataWritten": False,
        "databaseWritten": False,
    }


def build_forecast_output_type(gap: dict, staging_records: list[dict]) -> dict:
    copyright_end_reduction = gap["fieldGapResults"]["missingCopyrightEnd"]["localStagingReduction"]
    impacted_works = {record["standardWorkId"] for record in staging_records if record["fieldName"] == "copyrightEndDate"}
    after_distribution = {
        "copyright_term_forecast": copyright_end_reduction,
        "operating_window_forecast_pending_expiry": gap["fieldGapResults"]["missingCopyrightEnd"]["afterLocalStaging"],
        "formal_evaluation_blocked": 0,
        "insufficient_masterdata_observation_only": gap["fieldGapResults"]["missingClassification1"]["afterLocalStaging"],
    }
    before_distribution = {
        "copyright_term_forecast": 0,
        "operating_window_forecast_pending_expiry": gap["fieldGapResults"]["missingCopyrightEnd"]["before"],
        "formal_evaluation_blocked": 0,
        "insufficient_masterdata_observation_only": gap["fieldGapResults"]["missingClassification1"]["before"],
    }
    return {
        "schema": "m2.forecast_output_type_after_dual_source_staging.v1",
        "scope": "estimated_after_local_file_level_staging",
        "forecastOutputTypes": FORECAST_OUTPUT_TYPES,
        "beforeDistribution": before_distribution,
        "afterDistribution": after_distribution,
        "copyrightTermForecastIncreaseWorks": copyright_end_reduction,
        "impactedWorksWithCopyrightEnd": len(impacted_works),
        "requiresForecastOutputTypeRerun": copyright_end_reduction > 0,
        "formalEvaluationAllowed": False,
        "formalMasterDataWritten": False,
        "databaseWritten": False,
    }


def build_readiness(gap: dict, m2_forecast: dict, staging_records: list[dict]) -> dict:
    field_counts = Counter(record["fieldName"] for record in staging_records)
    return {
        "schema": "m2.business_readiness_after_dual_source_staging.v1",
        "scope": "local_staging_only_not_formal_release",
        "m2ForecastOutputTypeRerunRecommended": m2_forecast["requiresForecastOutputTypeRerun"],
        "operatorTaskPackRefreshRecommended": True,
        "random20BusinessReviewRefreshRecommended": True,
        "formalEvaluationStillBlocked": True,
        "blockingReasons": [
            "local_staging_is_not_formal_master_data",
            "classification_and_tags_not_applied",
            "formal_masterdata_activation_not_authorized",
            "no_m3_entry_in_this_sprint",
        ],
        "localStagingFieldCounts": dict(sorted(field_counts.items())),
        "m1GapAfterLocalStaging": gap["fieldGapResults"],
        "prohibitedActionsConfirmed": prohibited_actions(),
    }


def build_task_pack_payload(staging_records: list[dict]) -> dict:
    staging_by_work: dict[str, list[dict]] = defaultdict(list)
    for record in staging_records:
        staging_by_work[record["standardWorkId"]].append(record)
    operator_source = read_json(SOURCE_OPERATOR_TASK_JSON)
    random_source = read_json(SOURCE_RANDOM_20_JSON)

    operator_sheets = []
    operator_rows = 0
    operator_matched = 0
    for sheet in operator_source["sheets"]:
        rows = []
        for source_row in sheet.get("rows", []):
            row = append_staging_columns(source_row, staging_by_work)
            rows.append(row)
            operator_rows += 1
            operator_matched += 1 if row["是否受本地staging影响"] == "是" else 0
        operator_sheets.append({"name": sheet["name"], "rows": rows})

    random_rows = [append_staging_columns(row, staging_by_work) for row in random_source["rows"]]
    random_matched = sum(1 for row in random_rows if row["是否受本地staging影响"] == "是")

    return {
        "operator": {
            "schema": "m2.operator_task_pack_after_dual_source_staging.v1.private_source",
            "sourceWorkbook": "m2-v1.1-30-work-operator-task-pack-cn.xlsx",
            "outputWorkbook": rel(PRIVATE_OPERATOR_AFTER_XLSX),
            "sheets": operator_sheets,
            "rowCount": operator_rows,
            "matchedRows": operator_matched,
            "containsRealDetail": True,
            "gitignored": True,
        },
        "random20": {
            "schema": "m2.random_20_after_dual_source_staging.v1.private_source",
            "sourceWorkbook": "M2-v1.1-random-20-year-evaluation-cn.xlsx",
            "outputWorkbook": rel(PRIVATE_RANDOM_AFTER_XLSX),
            "summary": random_source.get("summary", {}),
            "rows": random_rows,
            "rowCount": len(random_rows),
            "matchedRows": random_matched,
            "containsRealDetail": True,
            "gitignored": True,
        },
    }


def append_staging_columns(row: dict, staging_by_work: dict[str, list[dict]]) -> dict:
    item = dict(row)
    standard_id = extract_standard_work_id(item)
    records = staging_by_work.get(standard_id, []) if standard_id else []
    if records:
        item["是否受本地staging影响"] = "是"
        item["本地staging补全字段"] = "、".join(sorted({record["fieldLabelCn"] for record in records}))
        item["本地staging记录数"] = len(records)
    else:
        item["是否受本地staging影响"] = "否"
        item["本地staging补全字段"] = "无"
        item["本地staging记录数"] = 0
    item["正式主数据状态"] = "非正式主数据，仅本地staging"
    return item


def extract_standard_work_id(row: dict) -> str:
    for key in ["标准作品ID", "standardWorkId", "作品ID", "用户指定作品ID"]:
        value = clean(row.get(key))
        if value:
            return value
    return ""


def build_public_summary(
    generated_at: str,
    staging_records: list[dict],
    safe_records: list[dict],
    override_records: list[dict],
    safe_blocked: Counter,
    override_blocked: Counter,
    duplicate_summary: dict,
    gap: dict,
    m2_forecast: dict,
    readiness: dict,
    task_pack: dict,
) -> dict:
    field_counts = Counter(record["fieldName"] for record in staging_records)
    source_counts = Counter(record["applySourceType"] for record in staging_records)
    return {
        "schema": "m1.m2.dual_source_limited_staging_apply.v1.summary",
        "generatedAt": generated_at,
        "currentHead": git(["rev-parse", "HEAD"]),
        "originMain": git(["rev-parse", "origin/main"]),
        "worktreeScope": "local_private_staging_outputs_plus_sanitized_public_reports",
        "applyScope": {
            "allowedSources": ["safe_auto_apply", "user_confirmed_override"],
            "allowedFields": sorted(ALLOWED_FIELDS),
            "blockedFields": sorted(CLASSIFICATION_TAG_FIELDS),
            "formalMasterDataWritten": False,
            "databaseWritten": False,
            "m3Entered": False,
        },
        "counts": {
            "safeAutoApplyRecords": len(safe_records),
            "userConfirmedOverrideRecords": len(override_records),
            "totalStagingRecords": len(staging_records),
            "totalImpactedWorks": len({record["standardWorkId"] for record in staging_records}),
            "fieldCounts": dict(sorted(field_counts.items())),
            "sourceCounts": dict(sorted(source_counts.items())),
            "safeBlocked": dict(sorted(safe_blocked.items())),
            "overrideBlocked": dict(sorted(override_blocked.items())),
            "duplicateSummary": duplicate_summary,
        },
        "m1Gap": gap["fieldGapResults"],
        "m2ForecastOutputType": {
            "requiresForecastOutputTypeRerun": m2_forecast["requiresForecastOutputTypeRerun"],
            "copyrightTermForecastIncreaseWorks": m2_forecast["copyrightTermForecastIncreaseWorks"],
            "formalEvaluationAllowed": False,
        },
        "m2TaskPacks": {
            "operatorTaskPackGenerated": task_pack["operator"]["rowCount"] > 0,
            "operatorTaskRows": task_pack["operator"]["rowCount"],
            "operatorRowsMatchedToStaging": task_pack["operator"]["matchedRows"],
            "random20PackGenerated": task_pack["random20"]["rowCount"] > 0,
            "random20Rows": task_pack["random20"]["rowCount"],
            "random20RowsMatchedToStaging": task_pack["random20"]["matchedRows"],
        },
        "rollback": {
            "fileLevelStaging": rel(PRIVATE_STAGING_TABLE_JSON),
            "clearMethod": "delete the private file-level staging JSON/XLSX outputs and regenerate reports; no database rollback is required because no database was written",
        },
        "safeOutputBoundary": public_boundary(),
        "prohibitedActionsConfirmed": prohibited_actions(),
    }


def write_plan_outputs(payload: dict) -> None:
    private_payload = {
        "schema": "m1.dual_source_limited_staging_apply_plan.v1.private",
        "generatedAt": payload["generatedAt"],
        "summary": payload["summary"],
        "stagingRecords": payload["stagingRecords"],
    }
    write_json(PRIVATE_PLAN_JSON, private_payload)
    v3.write_xlsx(
        PRIVATE_PLAN_XLSX,
        {
            "00_readme": readme_rows("plan"),
            "01_staging_plan": private_record_rows(payload["stagingRecords"]),
            "02_summary": dict_to_rows(payload["summary"]["counts"]),
        },
    )
    write_public(PUBLIC_PLAN_JSON, "m1.dual_source_limited_staging_apply_plan.v1.public", payload["summary"])
    write_md(PUBLIC_PLAN_MD, plan_md(payload["summary"]))


def write_dry_run_outputs(payload: dict) -> None:
    dry_run = {
        "schema": "m1.dual_source_limited_staging_apply_dry_run.v1.private",
        "generatedAt": payload["generatedAt"],
        "wouldWriteDatabase": False,
        "wouldWriteFormalMasterData": False,
        "summary": payload["summary"],
        "safetyChecks": safety_checks(payload),
        "stagingRecords": payload["stagingRecords"],
    }
    write_json(PRIVATE_DRY_RUN_JSON, dry_run)
    v3.write_xlsx(
        PRIVATE_DRY_RUN_XLSX,
        {
            "00_readme": readme_rows("dry-run"),
            "01_dry_run_records": private_record_rows(payload["stagingRecords"]),
            "02_safety_checks": dict_to_rows(dry_run["safetyChecks"]),
        },
    )
    public = {
        **payload["summary"],
        "dryRunSafetyChecks": dry_run["safetyChecks"],
        "dryRunResult": "pass",
    }
    write_public(PUBLIC_DRY_RUN_JSON, "m1.dual_source_limited_staging_apply_dry_run.v1.public", public)
    write_md(PUBLIC_DRY_RUN_MD, dry_run_md(public))


def write_apply_outputs(payload: dict) -> None:
    staging_table = {
        "schema": "m1.dual_source_limited_file_level_staging_table.v1.private",
        "generatedAt": payload["generatedAt"],
        "tableKind": "file_level_staging_only",
        "databaseWritten": False,
        "formalMasterDataWritten": False,
        "clearMethod": "delete this JSON file and regenerate downstream public reports",
        "records": payload["stagingRecords"],
    }
    write_json(PRIVATE_STAGING_TABLE_JSON, staging_table)
    result = {
        "schema": "m1.dual_source_limited_staging_apply_result.v1.private",
        "generatedAt": payload["generatedAt"],
        "stagingTablePath": rel(PRIVATE_STAGING_TABLE_JSON),
        "summary": payload["summary"],
        "stagingRecords": payload["stagingRecords"],
    }
    write_json(PRIVATE_RESULT_JSON, result)
    v3.write_xlsx(
        PRIVATE_RESULT_XLSX,
        {
            "00_readme": readme_rows("apply-result"),
            "01_applied_staging": private_record_rows(payload["stagingRecords"]),
            "02_gap_after": dict_to_rows(payload["gap"]["fieldGapResults"]),
        },
    )
    public = {**payload["summary"], "applyResult": "file_level_staging_written", "stagingTablePrivatePath": rel(PRIVATE_STAGING_TABLE_JSON)}
    write_public(PUBLIC_RESULT_JSON, "m1.dual_source_limited_staging_apply_result.v1.public", public)
    write_md(PUBLIC_RESULT_MD, result_md(public))


def write_gap_outputs(payload: dict) -> None:
    public = {**payload["gap"], "summary": payload["summary"]["counts"], "safeOutputBoundary": public_boundary()}
    write_public(PUBLIC_GAP_JSON, "m1.gap_after_dual_source_staging_apply.v1.public", public)
    write_md(PUBLIC_GAP_MD, gap_md(public))


def write_m2_outputs(payload: dict) -> None:
    forecast_public = {**payload["m2Forecast"], "safeOutputBoundary": public_boundary()}
    readiness_public = {**payload["readiness"], "safeOutputBoundary": public_boundary()}
    write_public(PUBLIC_FORECAST_JSON, "m2.forecast_output_type_after_dual_source_staging.v1.public", forecast_public)
    write_md(PUBLIC_FORECAST_MD, forecast_md(forecast_public))
    write_public(PUBLIC_READINESS_JSON, "m2.business_readiness_after_dual_source_staging.v1.public", readiness_public)
    write_md(PUBLIC_READINESS_MD, readiness_md(readiness_public))


def write_task_pack_outputs(payload: dict) -> None:
    operator = payload["taskPack"]["operator"]
    random20 = payload["taskPack"]["random20"]
    write_json(PRIVATE_OPERATOR_AFTER_JSON, operator)
    write_json(PRIVATE_RANDOM_AFTER_JSON, random20)
    v3.write_xlsx(PRIVATE_OPERATOR_AFTER_XLSX, {sheet["name"]: sheet["rows"] for sheet in operator["sheets"]})
    v3.write_xlsx(
        PRIVATE_RANDOM_AFTER_XLSX,
        {
            "00_说明": [
                {"项目": "用途", "说明": "M2 v1.1 20 部跨年份样本在本地 staging 后的可读复核包"},
                {"项目": "边界", "说明": "非正式发布审批，不进入 M3，不写正式主数据"},
            ],
            "01_样本评估": random20["rows"],
        },
    )
    operator_summary = {
        "sourceWorkbook": operator["sourceWorkbook"],
        "outputWorkbook": operator["outputWorkbook"],
        "rowCount": operator["rowCount"],
        "matchedRows": operator["matchedRows"],
        "privateWorkbookGitignored": True,
        "formalMasterDataWritten": False,
        "m3Entered": False,
        "safeOutputBoundary": public_boundary(),
    }
    random_summary = {
        "sourceWorkbook": random20["sourceWorkbook"],
        "outputWorkbook": random20["outputWorkbook"],
        "rowCount": random20["rowCount"],
        "matchedRows": random20["matchedRows"],
        "privateWorkbookGitignored": True,
        "formalMasterDataWritten": False,
        "m3Entered": False,
        "safeOutputBoundary": public_boundary(),
    }
    write_public(PUBLIC_OPERATOR_SUMMARY_JSON, "m2.operator_task_pack_after_dual_source_staging_summary.v1.public", operator_summary)
    write_md(PUBLIC_OPERATOR_SUMMARY_MD, task_pack_md("M2 Operator Task Pack After Dual-Source Staging Summary v1", operator_summary))
    write_public(PUBLIC_RANDOM_SUMMARY_JSON, "m2.random_20_after_dual_source_staging_summary.v1.public", random_summary)
    write_md(PUBLIC_RANDOM_SUMMARY_MD, task_pack_md("M2 Random 20-Year Evaluation After Dual-Source Staging Summary v1", random_summary))


def safety_checks(payload: dict) -> dict:
    fields = {record["fieldName"] for record in payload["stagingRecords"]}
    non_empty_overwrites = sum(1 for record in payload["stagingRecords"] if has_value(record["currentValue"]))
    weak_matches = sum(1 for record in payload["stagingRecords"] if "fuzzy" in record["matchMethod"] or "title_only" in record["matchMethod"])
    unresolved_conflicts = sum(
        1
        for record in payload["stagingRecords"]
        if record["candidateSource"] == "both_sources_conflict" and not record["resolvedByUserOverride"]
    )
    return {
        "onlyAllowedFields": fields.issubset(ALLOWED_FIELDS),
        "classificationAndTagsApplied": bool(fields.intersection(CLASSIFICATION_TAG_FIELDS)),
        "nonEmptyAuthoritativeOverwriteCount": non_empty_overwrites,
        "weakMatchAppliedCount": weak_matches,
        "unresolvedDualSourceConflictAppliedCount": unresolved_conflicts,
        "formalMasterDataWritten": False,
        "databaseWritten": False,
        "m3Entered": False,
    }


def private_record_rows(records: list[dict]) -> list[dict]:
    rows = []
    for record in records:
        rows.append(
            {
                "stagingRecordId": record["stagingRecordId"],
                "standardWorkId": record["standardWorkId"],
                "rawWorkId": record["rawWorkId"],
                "fieldName": record["fieldName"],
                "fieldLabelCn": record["fieldLabelCn"],
                "currentValue": record["currentValue"],
                "applyValue": record["applyValue"],
                "applySourceType": record["applySourceType"],
                "candidateSource": record["candidateSource"],
                "matchMethod": record["matchMethod"],
                "valueConfidence": record["valueConfidence"],
                "parserStatus": record["parserStatus"],
                "resolvedByUserOverride": record["resolvedByUserOverride"],
                "userConfirmedAction": record["userConfirmedAction"],
                "notFormalMasterData": record["notFormalMasterData"],
                "databaseWritten": record["databaseWritten"],
                "rollbackMethod": record["rollbackMethod"],
            }
        )
    return rows


def readme_rows(stage: str) -> list[dict]:
    return [
        {"项目": "阶段", "说明": stage},
        {"项目": "范围", "说明": "仅 safe_auto_apply 和 user_confirmed_override 的本地有限 staging"},
        {"项目": "禁止项", "说明": "不写正式主数据，不进入 M3，不应用分类/标签，不覆盖非空权威值"},
        {"项目": "回滚方式", "说明": "删除 private file-level staging JSON/XLSX 后重新生成报告"},
    ]


def dict_to_rows(payload) -> list[dict]:
    rows = []
    if isinstance(payload, dict):
        for key, value in payload.items():
            if isinstance(value, dict):
                for child_key, child_value in value.items():
                    rows.append({"section": key, "key": child_key, "value": json.dumps(child_value, ensure_ascii=False)})
            else:
                rows.append({"section": "", "key": key, "value": json.dumps(value, ensure_ascii=False)})
    return rows or [{"section": "", "key": "empty", "value": ""}]


def plan_md(summary: dict) -> str:
    counts = summary["counts"]
    return "\n".join(
        [
            "# M1 Dual-Source Limited Staging Apply Plan v1",
            "",
            "This public report is aggregate-only. Private row details are stored only in gitignored private output.",
            "",
            f"- Total staging records: `{counts['totalStagingRecords']}`",
            f"- Safe auto-apply records: `{counts['safeAutoApplyRecords']}`",
            f"- User-confirmed override records: `{counts['userConfirmedOverrideRecords']}`",
            f"- Impacted works: `{counts['totalImpactedWorks']}`",
            f"- Field counts: `{json.dumps(counts['fieldCounts'], ensure_ascii=False)}`",
            "- Classification and tag fields are blocked.",
            "- Formal master data written: `false`",
            "- Database written: `false`",
            "- M3 entered: `false`",
        ]
    )


def dry_run_md(public: dict) -> str:
    checks = public["dryRunSafetyChecks"]
    return "\n".join(
        [
            "# M1 Dual-Source Limited Staging Apply Dry Run v1",
            "",
            f"- Dry-run result: `{public['dryRunResult']}`",
            f"- Only allowed fields: `{checks['onlyAllowedFields']}`",
            f"- Classification/tags applied: `{checks['classificationAndTagsApplied']}`",
            f"- Non-empty overwrite count: `{checks['nonEmptyAuthoritativeOverwriteCount']}`",
            f"- Weak match applied count: `{checks['weakMatchAppliedCount']}`",
            f"- Unresolved conflict applied count: `{checks['unresolvedDualSourceConflictAppliedCount']}`",
            "- Formal master data written: `false`",
            "- Database written: `false`",
        ]
    )


def result_md(public: dict) -> str:
    return "\n".join(
        [
            "# M1 Dual-Source Limited Staging Apply Result v1",
            "",
            f"- Apply result: `{public['applyResult']}`",
            f"- Private file-level staging path: `{public['stagingTablePrivatePath']}`",
            f"- Total staging records: `{public['counts']['totalStagingRecords']}`",
            f"- Safe auto-apply records: `{public['counts']['safeAutoApplyRecords']}`",
            f"- User-confirmed override records: `{public['counts']['userConfirmedOverrideRecords']}`",
            f"- Rollback: `{public['rollback']['clearMethod']}`",
            "- Formal master data written: `false`",
            "- Database written: `false`",
            "- M3 entered: `false`",
        ]
    )


def gap_md(public: dict) -> str:
    lines = ["# M1 Gap After Dual-Source Staging Apply v1", "", "| Gap | Before | After local staging | Reduction |", "| --- | ---: | ---: | ---: |"]
    for key, value in public["fieldGapResults"].items():
        lines.append(f"| `{key}` | {value['before']} | {value['afterLocalStaging']} | {value['localStagingReduction']} |")
    lines.extend(["", "- Classification and tags are unchanged.", "- Formal master data written: `false`"])
    return "\n".join(lines)


def forecast_md(public: dict) -> str:
    return "\n".join(
        [
            "# M2 Forecast Output Type After Dual-Source Staging v1",
            "",
            f"- Scope: `{public['scope']}`",
            f"- Copyright-term forecast increase works: `{public['copyrightTermForecastIncreaseWorks']}`",
            f"- Requires forecastOutputType rerun: `{public['requiresForecastOutputTypeRerun']}`",
            f"- Formal evaluation allowed: `{public['formalEvaluationAllowed']}`",
            "- Formal master data written: `false`",
        ]
    )


def readiness_md(public: dict) -> str:
    return "\n".join(
        [
            "# M2 Business Readiness After Dual-Source Staging v1",
            "",
            f"- Scope: `{public['scope']}`",
            f"- Operator task pack refresh recommended: `{public['operatorTaskPackRefreshRecommended']}`",
            f"- Random 20 business review refresh recommended: `{public['random20BusinessReviewRefreshRecommended']}`",
            f"- Formal evaluation still blocked: `{public['formalEvaluationStillBlocked']}`",
            "- Blocking reasons:",
            *[f"  - `{reason}`" for reason in public["blockingReasons"]],
        ]
    )


def task_pack_md(title: str, summary: dict) -> str:
    return "\n".join(
        [
            f"# {title}",
            "",
            f"- Source workbook: `{summary['sourceWorkbook']}`",
            f"- Output workbook: `{summary['outputWorkbook']}`",
            f"- Row count: `{summary['rowCount']}`",
            f"- Rows matched to local staging: `{summary['matchedRows']}`",
            f"- Private workbook gitignored: `{summary['privateWorkbookGitignored']}`",
            "- Formal master data written: `false`",
            "- M3 entered: `false`",
        ]
    )


def write_public(path: Path, schema: str, payload: dict) -> None:
    write_json(
        path,
        {
            "schema": schema,
            "generatedAt": now(),
            "currentHead": git(["rev-parse", "HEAD"]),
            "originMain": git(["rev-parse", "origin/main"]),
            "safeOutputBoundary": public_boundary(),
            "payload": payload,
        },
    )


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_md(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text + "\n", encoding="utf-8")


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def candidate_key(candidate: dict) -> str:
    return "|".join(
        [
            clean(candidate.get("standardWorkId")),
            clean(candidate.get("fieldName")),
            clean(candidate.get("proposedValueNormalized") or candidate.get("proposedValue")),
            clean(candidate.get("source")),
            clean(candidate.get("matchMethod")),
        ]
    )


def override_apply_value(override: dict) -> str:
    if override.get("userConfirmedAction") == "applyCorrectedValue":
        return clean(override.get("userCorrectedValue"))
    if override.get("userConfirmedAction") == "acceptCandidate":
        return clean(override.get("originalCandidateValue"))
    return ""


def complex_date_signal(candidate: dict) -> bool:
    text = " ".join(
        [
            clean(candidate.get("sourceRawValue")),
            clean(candidate.get("proposedValue")),
            clean(candidate.get("reason")),
            clean(candidate.get("conflictReason")),
        ]
    )
    complex_markers = [
        "|",
        "relative",
        "renew",
        "auto",
        "出版",
        "签订",
        "上线",
        "最后",
        "自动",
        "续",
        "顺延",
    ]
    return any(marker in text for marker in complex_markers)


def clean(value) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if text.endswith(".0") and re.fullmatch(r"\d+\.0", text):
        return text[:-2]
    return text


def has_value(value) -> bool:
    return clean(value) != ""


def to_float(value) -> float:
    try:
        return float(value)
    except Exception:
        return 0.0


def field_label(field: str) -> str:
    return {
        "standardWorkName": "标准作品名",
        "authorName": "作者名",
        "copyrightStartDate": "版权开始日期",
        "copyrightEndDate": "版权到期日期",
        "classificationLevel1": "一级分类",
        "classificationLevel2": "二级分类",
        "classificationLevel3": "三级分类",
        "requiredTags": "必需标签",
    }.get(field, field)


def public_boundary() -> dict:
    return {
        "sanitizedAggregateOnly": True,
        "realWorkNamesIncluded": False,
        "authorNamesIncluded": False,
        "channelNamesIncluded": False,
        "rawLedgerRowsIncluded": False,
        "privateDetailsStoredOnlyInGitignoredOutput": True,
        "databaseConnected": False,
        "databaseWritten": False,
        "formalMasterDataWritten": False,
        "m3Entered": False,
    }


def prohibited_actions() -> dict:
    return {
        "enteredM3": False,
        "formalMasterDataWritten": False,
        "databaseConnected": False,
        "databaseWritten": False,
        "migrationExecuted": False,
        "classificationOrTagsApplied": False,
        "nonEmptyAuthoritativeValueOverwritten": False,
        "gitAddDotUsed": False,
        "stashTouched": False,
    }


def cli_summary(mode: str, payload: dict) -> dict:
    counts = payload["summary"]["counts"]
    return {
        "mode": mode,
        "totalStagingRecords": counts["totalStagingRecords"],
        "safeAutoApplyRecords": counts["safeAutoApplyRecords"],
        "userConfirmedOverrideRecords": counts["userConfirmedOverrideRecords"],
        "totalImpactedWorks": counts["totalImpactedWorks"],
        "formalMasterDataWritten": False,
        "databaseWritten": False,
        "m3Entered": False,
        "publicReportsWritten": [
            rel(PUBLIC_PLAN_JSON),
            rel(PUBLIC_DRY_RUN_JSON),
            rel(PUBLIC_RESULT_JSON) if mode in {"apply", "all"} else None,
            rel(PUBLIC_GAP_JSON),
            rel(PUBLIC_FORECAST_JSON),
            rel(PUBLIC_READINESS_JSON),
        ],
    }


def now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def git(args: list[str]) -> str | None:
    try:
        return subprocess.check_output(["git", *args], cwd=ROOT, text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        return None


if __name__ == "__main__":
    main()
