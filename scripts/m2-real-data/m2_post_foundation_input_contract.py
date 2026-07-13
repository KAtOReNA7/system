from __future__ import annotations

import argparse
import json
import re
from collections import Counter


SCHEMA = "m2.post_foundation_formal_basic_info_input.v1"
EXPECTED_WORK_COUNT = 3053
REQUIRED_FIELDS = (
    "作品编号",
    "书名",
    "作者",
    "版权开始",
    "版权到期",
    "作品状态",
    "音频版权状态",
    "一级分类",
    "二级分类",
    "三级分类",
)
WORK_STATUSES = {"已上架", "已下架"}
AUDIO_RIGHTS_STATUSES = {"版权有效", "无限期", "版权已到期"}
FORBIDDEN_OUTPUT_FIELDS = {
    "运营建议",
    "suggestions",
    "suggestionCodes",
    "primarySuggestion",
    "operatingSuggestion",
}


def clean(value) -> str:
    return "" if value is None else str(value).strip()


def canonical_work_id(value) -> str:
    text = clean(value)
    if text.upper().startswith("Y"):
        text = text[1:]
    match = re.search(r"\d+", text)
    return str(int(match.group(0))) if match else text


def copyright_value_type(value: str) -> str:
    if value == "无限期":
        return "perpetual"
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return "exact_date"
    if re.fullmatch(r"\d{4}年", value):
        return "year_only"
    if value in {"已到期", "已解约"}:
        return "expired_unknown_date"
    if re.search(r"(完结|出版|最后一部出版).*(加)?\d+年|\d+年.*(完结|出版)", value):
        return "relative_term"
    return "invalid"


def valid_copyright_value(value: str) -> bool:
    return copyright_value_type(value) != "invalid"


def validate_post_foundation_input_payload(
    payload: dict,
    expected_ids: set[str] | None = None,
    *,
    require_verified: bool = True,
) -> dict:
    issues: list[str] = []
    if payload.get("schema") != SCHEMA:
        issues.append("schema_mismatch")

    records = payload.get("records")
    if not isinstance(records, list):
        records = []
        issues.append("records_not_array")

    ids: list[str] = []
    missing_by_field = Counter()
    work_status = Counter()
    audio_status = Counter()
    copyright_term_types = Counter()
    blocker_count = 0
    forbidden_fields = Counter()
    invalid_copyright_count = 0
    invalid_copyright_chronology_count = 0

    for row in records:
        work_id = canonical_work_id(row.get("作品编号"))
        ids.append(work_id)
        for field in REQUIRED_FIELDS:
            if not clean(row.get(field)):
                missing_by_field[field] += 1
        work_value = clean(row.get("作品状态"))
        audio_value = clean(row.get("音频版权状态"))
        if work_value:
            work_status[work_value] += 1
        if audio_value:
            audio_status[audio_value] += 1
        blocker_count += len(row.get("正式输入阻断") or [])
        invalid_copyright_count += int(
            bool(clean(row.get("版权到期")))
            and not valid_copyright_value(clean(row.get("版权到期")))
        )
        start_value = clean(row.get("版权开始"))
        end_value = clean(row.get("版权到期"))
        invalid_copyright_chronology_count += int(
            bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", start_value))
            and bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", end_value))
            and end_value < start_value
        )
        declared_term_type = clean(row.get("版权到期类型"))
        if declared_term_type:
            copyright_term_types[declared_term_type] += 1
        if clean(row.get("版权到期")) and declared_term_type != copyright_value_type(
            clean(row.get("版权到期"))
        ):
            invalid_copyright_count += 1
        for field in FORBIDDEN_OUTPUT_FIELDS.intersection(row):
            forbidden_fields[field] += 1

    unique_ids = set(ids)
    duplicate_count = len(ids) - len(unique_ids)
    if duplicate_count:
        issues.append("duplicate_work_ids")
    if "" in unique_ids:
        issues.append("missing_work_id")

    if expected_ids is not None:
        normalized_expected = {canonical_work_id(value) for value in expected_ids}
        if unique_ids != normalized_expected:
            issues.append("work_scope_mismatch")
    elif len(unique_ids - {""}) != EXPECTED_WORK_COUNT:
        issues.append("work_count_mismatch")

    if missing_by_field:
        issues.append("required_fields_incomplete")
    if set(work_status) - WORK_STATUSES:
        issues.append("invalid_work_status")
    if set(audio_status) - AUDIO_RIGHTS_STATUSES:
        issues.append("invalid_audio_rights_status")
    if invalid_copyright_count:
        issues.append("invalid_copyright_end")
    if invalid_copyright_chronology_count:
        issues.append("invalid_copyright_chronology")
    if blocker_count:
        issues.append("formal_input_blockers_present")
    if forbidden_fields:
        issues.append("operating_suggestion_fields_present")

    review_summary = payload.get("reviewDecisionSummary") or {}
    if int(review_summary.get("total", 0)) != 238:
        issues.append("review_decision_scope_mismatch")
    if int(review_summary.get("pending", 0)) != 0:
        issues.append("review_decisions_pending")
    if payload.get("privateOnly") is not True:
        issues.append("private_boundary_missing")

    declared_verified = bool((payload.get("verification") or {}).get("verified"))
    declared_status = clean(payload.get("status"))
    if require_verified and not declared_verified:
        issues.append("artifact_not_declared_verified")
    if require_verified and declared_status != "verified_complete":
        issues.append("artifact_status_not_verified_complete")

    issues = list(dict.fromkeys(issues))
    return {
        "verified": not issues and declared_verified and declared_status == "verified_complete",
        "schema": payload.get("schema"),
        "declaredStatus": declared_status,
        "recordCount": len(records),
        "uniqueWorkCount": len(unique_ids - {""}),
        "duplicateWorkIdCount": duplicate_count,
        "missingByField": dict(missing_by_field),
        "workStatusDistribution": dict(work_status),
        "audioRightsStatusDistribution": dict(audio_status),
        "copyrightTermTypeDistribution": dict(copyright_term_types),
        "formalInputBlockerCount": blocker_count,
        "invalidCopyrightEndCount": invalid_copyright_count,
        "invalidCopyrightChronologyCount": invalid_copyright_chronology_count,
        "forbiddenOutputFields": dict(forbidden_fields),
        "reviewDecisionCount": int(review_summary.get("total", 0)),
        "reviewDecisionPendingCount": int(review_summary.get("pending", 0)),
        "issues": issues,
    }


def fixture_self_test() -> dict:
    records = []
    for index in range(1, 4):
        records.append(
            {
                "作品编号": str(index),
                "书名": f"合成作品{index}",
                "作者": f"合成作者{index}",
                "版权开始": "2020-01-01",
                "版权到期": "无限期" if index == 3 else "2030-01-01",
                "版权到期类型": "perpetual" if index == 3 else "exact_date",
                "作品状态": "已上架",
                "音频版权状态": "无限期" if index == 3 else "版权有效",
                "一级分类": "出版物",
                "二级分类": "小说",
                "三级分类": "中国当代小说",
                "辅助标签": "无",
                "正式输入阻断": [],
            }
        )
    payload = {
        "schema": SCHEMA,
        "status": "verified_complete",
        "privateOnly": True,
        "verification": {"verified": True},
        "reviewDecisionSummary": {"total": 238, "pending": 0},
        "records": records,
    }
    valid = validate_post_foundation_input_payload(
        payload, {"1", "2", "3"}, require_verified=True
    )
    invalid = json.loads(json.dumps(payload, ensure_ascii=False))
    invalid["records"][0]["运营建议"] = "不允许出现"
    rejected = validate_post_foundation_input_payload(
        invalid, {"1", "2", "3"}, require_verified=True
    )
    return {
        "fixtureSelfTest": True,
        "verifiedFixtureAccepted": valid["verified"],
        "perpetualRightsAccepted": valid["invalidCopyrightEndCount"] == 0,
        "operatingSuggestionRejected": "operating_suggestion_fields_present"
        in rejected["issues"],
        "noDatabaseWrite": True,
        "noFormalMasterDataWrite": True,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture-self-test", action="store_true")
    args = parser.parse_args()
    if args.fixture_self_test:
        print(json.dumps(fixture_self_test(), ensure_ascii=False))
        return
    raise SystemExit("Use this module through the post-foundation decision runner.")


if __name__ == "__main__":
    main()
