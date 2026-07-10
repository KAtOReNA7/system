from __future__ import annotations

import argparse
import json
from collections import Counter


SCHEMA = "m2.five_source_local_staging_recovery.v1"
EXPECTED_WORK_COUNT = 3053
CORE_FIELDS = ("作者", "版权开始", "版权到期")
STATUS_FIELDS = ("作品状态", "音频版权状态")
EXPECTED_WORK_STATUS = {"已上架": 2410, "已下架": 643}
EXPECTED_AUDIO_RIGHTS_STATUS = {"版权有效": 2238, "无限期": 487, "版权已到期": 328}
EXPECTED_CONFIRMATION_MODE = {"high_confidence_direct": 8729, "user_confirmed": 430}


def clean(value) -> str:
    return "" if value is None else str(value).strip()


def canonical_work_id(value) -> str:
    text = clean(value)
    if text.upper().startswith("Y"):
        text = text[1:]
    digits = "".join(character for character in text if character.isdigit())
    return str(int(digits)) if digits else text


def validate_staging_payload(
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
    confirmation_modes = Counter()

    for row in records:
        work_id = canonical_work_id(row.get("作品编号"))
        ids.append(work_id)
        for field in CORE_FIELDS:
            if not clean(row.get(field)):
                missing_by_field[field] += 1
            source = (row.get("字段来源") or {}).get(field) or {}
            mode = clean(source.get("confirmationMode"))
            if mode:
                confirmation_modes[mode] += 1
        for field in STATUS_FIELDS:
            if not clean(row.get(field)):
                missing_by_field[field] += 1
        if clean(row.get("作品状态")):
            work_status[clean(row.get("作品状态"))] += 1
        if clean(row.get("音频版权状态")):
            audio_status[clean(row.get("音频版权状态"))] += 1

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
    elif len(unique_ids) != EXPECTED_WORK_COUNT:
        issues.append("work_count_mismatch")

    if missing_by_field:
        issues.append("required_fields_incomplete")
    if dict(work_status) != EXPECTED_WORK_STATUS:
        issues.append("work_status_distribution_mismatch")
    if dict(audio_status) != EXPECTED_AUDIO_RIGHTS_STATUS:
        issues.append("audio_rights_status_distribution_mismatch")
    if dict(confirmation_modes) != EXPECTED_CONFIRMATION_MODE:
        issues.append("confirmation_mode_distribution_mismatch")

    declared_verified = bool((payload.get("verification") or {}).get("verified"))
    declared_status = clean(payload.get("status"))
    if require_verified and not declared_verified:
        issues.append("artifact_not_declared_verified")
    if require_verified and declared_status != "verified_complete":
        issues.append("artifact_status_not_verified_complete")

    verified = not issues and declared_verified and declared_status == "verified_complete"
    return {
        "verified": verified,
        "schema": payload.get("schema"),
        "declaredStatus": declared_status,
        "recordCount": len(records),
        "uniqueWorkCount": len(unique_ids - {""}),
        "duplicateWorkIdCount": duplicate_count,
        "missingByField": dict(missing_by_field),
        "workStatusDistribution": dict(work_status),
        "audioRightsStatusDistribution": dict(audio_status),
        "confirmationModeDistribution": dict(confirmation_modes),
        "issues": list(dict.fromkeys(issues)),
    }


def fixture_self_test() -> dict:
    records = []
    for index in range(1, 4):
        records.append(
            {
                "作品编号": str(index),
                "作者": f"作者{index}",
                "版权开始": "2020-01-01",
                "版权到期": "2030-01-01",
                "作品状态": "已上架",
                "音频版权状态": "版权有效",
                "字段来源": {
                    field: {"confirmationMode": "high_confidence_direct"}
                    for field in CORE_FIELDS
                },
            }
        )
    incomplete = {
        "schema": SCHEMA,
        "status": "blocked_incomplete_recovery",
        "verification": {"verified": False},
        "records": records,
    }
    result = validate_staging_payload(
        incomplete, {"1", "2", "3"}, require_verified=True
    )
    return {
        "fixtureSelfTest": True,
        "incompleteArtifactRejected": result["verified"] is False,
        "declarationGuardPresent": "artifact_not_declared_verified" in result["issues"],
        "distributionGuardPresent": any(
            issue.endswith("distribution_mismatch") for issue in result["issues"]
        ),
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
    raise SystemExit("Use this module through the recovery/readiness scripts.")


if __name__ == "__main__":
    main()
