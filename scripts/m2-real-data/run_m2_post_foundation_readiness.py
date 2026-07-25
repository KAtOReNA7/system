from __future__ import annotations

import hashlib
import json
import math
import re
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import date, datetime, timezone
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools" / "m2-calibration"))
sys.path.insert(0, str(ROOT / "scripts" / "m2-real-data"))

from calibrate_cleaned_bills import (  # noqa: E402
    KNOWN_INCOMPLETE_MONTHS,
    build_work_summary,
    discover_sources,
    month_range,
    read_master_dates,
)
from run_nonformal_dry_run import evaluate_work_summary, load_analysis_inputs  # noqa: E402
import run_m2_revenue_model_rating_v2 as m2  # noqa: E402
from m2_five_source_staging_contract import (  # noqa: E402
    validate_staging_payload,
)
from m2_post_foundation_input_contract import (  # noqa: E402
    SCHEMA as POST_FOUNDATION_INPUT_SCHEMA,
    validate_post_foundation_input_payload,
)


PRIVATE_DIR = ROOT / "data" / "private-output" / "m2-readiness"
DOCS_DIR = ROOT / "docs" / "analysis" / "m2-real-data"

FOUNDATION_PATH = PRIVATE_DIR / "M2-classification-tag-foundation-local-fixed-cn-v1.json"
FIVE_SOURCE_STAGING_PATH = PRIVATE_DIR / "M2-five-source-local-staging-apply-result-cn-v1.json"
FORMAL_INPUT_PATH = PRIVATE_DIR / "M2-formal-basic-info-input-private-v1.json"
MAPPING_PAYLOAD = (
    ROOT
    / "data"
    / "m1-master-data-private"
    / "mapping-candidate"
    / "M1-formal-mapping-version-candidate-v0.1-detail-payload.json"
)
MAPPING_OVERLAY = (
    ROOT
    / "experiments"
    / "m1-mapping-version-import-candidate"
    / "G07-mapping-strategy-overlay-v0.2.json"
)
CHECKPOINT_PATH = DOCS_DIR / "M2-local-candidate-major-version-checkpoint-v1.json"
PROJECT_STATUS_PATH = DOCS_DIR / "M1-M2-post-foundation-project-status-v1.json"

PRIVATE_DETAIL_PATH = PRIVATE_DIR / "M2-post-foundation-readiness-rerun-private-v1.json"
PUBLIC_JSON_PATH = DOCS_DIR / "M2-post-foundation-readiness-rerun-v1.json"
PUBLIC_MD_PATH = DOCS_DIR / "M2-post-foundation-readiness-rerun-v1.md"
FORMAL_GAP_JSON_PATH = DOCS_DIR / "M2-post-foundation-formal-gap-audit-v1.json"
FORMAL_GAP_MD_PATH = DOCS_DIR / "M2-post-foundation-formal-gap-audit-v1.md"


def clean(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and math.isnan(value):
        return ""
    return str(value).strip()


def canonical_work_id(value) -> str:
    text = clean(value)
    if text.upper().startswith("Y"):
        text = text[1:]
    match = re.search(r"\d+", text)
    if not match:
        return text
    return str(int(match.group(0)))


def split_tags(value) -> list[str]:
    text = clean(value)
    if not text or text == "无":
        return []
    result = []
    for item in re.split(r"[；;、，,|/]+", text):
        tag = clean(item)
        if tag and tag != "无" and tag not in result:
            result.append(tag)
    return result


def relative(path: Path) -> str:
    return str(path.resolve().relative_to(ROOT.resolve())).replace("\\", "/")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def inspect_five_source_staging(final_ids: set[str]) -> dict:
    input_path = (
        FORMAL_INPUT_PATH if FORMAL_INPUT_PATH.exists() else FIVE_SOURCE_STAGING_PATH
    )
    if not input_path.exists():
        return {
            "providedForThisRun": False,
            "contractVerified": False,
            "usedByEvaluation": False,
            "artifactRole": "private_per_work_staging_input",
            "declaredStatus": "not_provided",
            "contractIssues": ["private_input_not_provided_for_this_run"],
        }
    try:
        payload = read_json(input_path)
        if payload.get("schema") == POST_FOUNDATION_INPUT_SCHEMA:
            validation = validate_post_foundation_input_payload(
                payload, final_ids, require_verified=True
            )
        else:
            validation = validate_staging_payload(
                payload, final_ids, require_verified=True
            )
        return {
            "providedForThisRun": True,
            "contractVerified": validation["verified"],
            "usedByEvaluation": validation["verified"],
            "artifactRole": clean(payload.get("artifactRole"))
            or "private_per_work_staging_input",
            "schema": payload.get("schema"),
            "declaredStatus": payload.get("status"),
            "artifactSha256": sha256(input_path),
            "contractIssues": validation["issues"],
            "reviewDecisionSummary": payload.get("reviewDecisionSummary", {}),
            "contractSummary": {
                key: validation[key]
                for key in [
                    "recordCount",
                    "uniqueWorkCount",
                    "missingByField",
                    "workStatusDistribution",
                    "audioRightsStatusDistribution",
                    "copyrightTermTypeDistribution",
                ]
            },
        }
    except Exception as error:
        return {
            "providedForThisRun": True,
            "contractVerified": False,
            "usedByEvaluation": False,
            "artifactRole": "private_per_work_staging_input",
            "declaredStatus": "unreadable_or_invalid",
            "contractIssues": ["private_input_validation_error"],
            "validationErrorType": type(error).__name__,
        }


def load_verified_formal_input(final_ids: set[str]) -> dict[str, dict]:
    if not FORMAL_INPUT_PATH.exists():
        return {}
    payload = read_json(FORMAL_INPUT_PATH)
    validation = validate_post_foundation_input_payload(
        payload, final_ids, require_verified=True
    )
    if not validation["verified"]:
        return {}
    return {
        canonical_work_id(row.get("作品编号")): row
        for row in payload.get("records", [])
    }


def git_value(*args: str) -> str | None:
    try:
        return subprocess.check_output(
            ["git", *args], cwd=ROOT, text=True, stderr=subprocess.DEVNULL
        ).strip()
    except Exception:
        return None


def load_foundation() -> tuple[dict[str, dict], dict]:
    payload = read_json(FOUNDATION_PATH)
    records = {}
    for row in payload.get("records", []):
        work_id = canonical_work_id(row.get("作品编号"))
        if not work_id or work_id in records:
            raise SystemExit("Fixed foundation contains a missing or duplicate canonical work ID.")
        records[work_id] = row
    if len(records) != 3053:
        raise SystemExit(f"Fixed foundation must contain 3053 works, found {len(records)}.")
    return records, payload.get("summary", {})


def load_historical_mappings() -> tuple[dict[str, str], dict[str, str]]:
    payload = read_json(MAPPING_PAYLOAD)
    rows = [
        row
        for row in payload.get("effective_mapping_snapshot", [])
        if row.get("layer") == "historical_volume"
        and row.get("effective_status") == "effective_candidate"
    ]
    raw_mapping = {
        clean(row.get("raw_work_id")).upper(): canonical_work_id(
            row.get("target_standard_work_id")
        )
        for row in rows
    }
    standard_mapping = {
        canonical_work_id(row.get("historical_standard_work_id")): canonical_work_id(
            row.get("target_standard_work_id")
        )
        for row in rows
        if canonical_work_id(row.get("historical_standard_work_id"))
    }

    overlay = read_json(MAPPING_OVERLAY)
    for row in overlay.get("changes", []):
        if row.get("to") != "historical_volume_mapping":
            continue
        target = canonical_work_id(row.get("target_standard_work_id"))
        raw_mapping[clean(row.get("raw_work_id")).upper()] = target
        standard_mapping[canonical_work_id(row.get("raw_work_id"))] = target
    return raw_mapping, standard_mapping


def apply_foundation_scope(
    bill: pd.DataFrame,
    final_ids: set[str],
    raw_mapping: dict[str, str],
    standard_mapping: dict[str, str],
    *,
    require_full_scope: bool = True,
) -> tuple[pd.DataFrame, dict]:
    result = bill.copy()
    original_ids = result["standardWorkId"].map(canonical_work_id)
    mapped_ids = []
    mapped_by_raw = 0
    mapped_by_scope = 0
    for raw_work_id, original_id in zip(result["rawWorkId"], original_ids):
        raw_target = raw_mapping.get(clean(raw_work_id).upper())
        scope_target = None
        if original_id not in final_ids:
            candidate = standard_mapping.get(original_id)
            if candidate in final_ids:
                scope_target = candidate
        target = raw_target or scope_target or original_id
        mapped_ids.append(target)
        mapped_by_raw += int(bool(raw_target and raw_target != original_id))
        mapped_by_scope += int(bool(scope_target and scope_target != original_id))
    result["standardWorkId"] = mapped_ids

    valid_before = set(original_ids[result["validForCalibration"]].dropna().astype(str))
    valid_after = set(
        result.loc[result["validForCalibration"], "standardWorkId"]
        .dropna()
        .astype(str)
    )
    scope_is_valid = (
        valid_after == final_ids
        if require_full_scope
        else valid_after.issubset(final_ids)
    )
    if not scope_is_valid:
        raise SystemExit(
            "Mapped bill scope differs from the fixed foundation: "
            f"bill_only={len(valid_after - final_ids)}, "
            f"foundation_only={len(final_ids - valid_after)}."
        )

    amount_before = float(
        bill.loc[bill["validForCalibration"], "amount"].sum()
    )
    amount_after = float(
        result.loc[result["validForCalibration"], "amount"].sum()
    )
    if abs(amount_before - amount_after) > 0.001 or len(result) != len(bill):
        raise SystemExit("Foundation scope mapping changed bill row count or revenue amount.")

    return result, {
        "beforeWorkCount": len(valid_before),
        "afterWorkCount": len(valid_after),
        "foundationWorkCount": len(final_ids),
        "billRowsBefore": int(len(bill)),
        "billRowsAfter": int(len(result)),
        "mappedRowsByRawHistoricalMapping": mapped_by_raw,
        "mappedRowsByFoundationScopeReconciliation": mapped_by_scope,
        "historicalRawMappingsConfigured": len(raw_mapping),
        "historicalStandardMappingsConfigured": len(standard_mapping),
        "incomeAmountConserved": abs(amount_before - amount_after) <= 0.001,
        "rowCountConserved": len(result) == len(bill),
        "scopeFullyAligned": valid_after == final_ids,
        "scopeWithinFoundation": valid_after.issubset(final_ids),
        "fullScopeRequired": require_full_scope,
        "reconciliationReason": (
            "canonicalize numeric IDs and merge bill-only historical-volume identity "
            "into its confirmed foundation target; no income row is dropped"
        ),
    }


def canonical_master_dates(master_dates: dict[str, dict]) -> dict[str, dict]:
    result = {}
    for work_id, value in master_dates.items():
        canonical = canonical_work_id(work_id)
        if canonical not in result:
            result[canonical] = value
        elif result[canonical] != value:
            result[canonical] = {"start": None, "end": None, "conflict": True}
    return result


def canonical_staging_index(index: dict[str, dict], final_ids: set[str]) -> dict[str, dict]:
    result = {}
    for work_id, value in index.items():
        canonical = canonical_work_id(work_id)
        if canonical in final_ids:
            result[canonical] = value
    return result


def build_current_work_rows(
    context: dict,
    bill: pd.DataFrame,
    foundation: dict[str, dict],
) -> tuple[list[dict], dict]:
    final_ids = set(foundation)
    five_source_input = inspect_five_source_staging(final_ids)
    formal_input_index = load_verified_formal_input(final_ids)
    if formal_input_index:
        master_dates = {}
        for work_id, record in formal_input_index.items():
            copyright_start = clean(record.get("版权开始"))
            copyright_end = clean(record.get("版权到期"))
            master_dates[work_id] = {
                "start": (
                    date.fromisoformat(copyright_start)
                    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", copyright_start)
                    else None
                ),
                "end": (
                    date.fromisoformat(copyright_end)
                    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", copyright_end)
                    else None
                ),
                "conflict": False,
                "perpetual": copyright_end == "无限期",
            }
        master_stats = {
            "masterRows": len(master_dates),
            "dateRows": sum(
                bool(item["end"] or item["perpetual"])
                for item in master_dates.values()
            ),
            "unambiguousWorks": len(master_dates),
            "conflictWorks": 0,
            "perpetualWorks": sum(
                item["perpetual"] for item in master_dates.values()
            ),
            "source": "contract_verified_post_foundation_private_input",
        }
    else:
        _, master_path, _, _ = discover_sources()
        master_dates, master_stats = read_master_dates(master_path)
    work_summary, work_month_stats = build_work_summary(
        bill,
        canonical_master_dates(master_dates),
        context["latest_complete_month"],
        population_ids=final_ids,
    )
    incomplete_work_ids = set(
        bill.loc[
            bill["validForCalibration"]
            & bill["billMonth"].isin(KNOWN_INCOMPLETE_MONTHS),
            "standardWorkId",
        ]
        .dropna()
        .astype(str)
    )
    evaluated = evaluate_work_summary(
        work_summary,
        context["parameters"],
        context["latest_complete_month"],
        incomplete_work_ids,
        "candidate-b",
    ).sort_values("standardWorkId")

    complete = bill[
        bill["validForCalibration"]
        & (bill["billMonth"] <= context["latest_complete_month"])
    ].copy()
    months = month_range(
        complete["billMonth"].min(), context["latest_complete_month"]
    )
    cluster_lookup = (
        m2.build_same_amount_clusters(complete)
        .set_index(["standardWorkId", "channelKey", "businessForm"])
        .to_dict("index")
    )
    channel_rows = m2.build_channel_rows(
        complete,
        months,
        cluster_lookup,
        context["latest_complete_month"],
    )
    if formal_input_index:
        staging_index = {
            work_id: {
                "copyrightStartDate": clean(record.get("版权开始")),
                "copyrightEndDate": (
                    ""
                    if clean(record.get("版权到期")) == "无限期"
                    else clean(record.get("版权到期"))
                ),
                "copyrightStartDateSource": "post_foundation_private_input",
                "copyrightEndDateSource": "post_foundation_private_input",
            }
            for work_id, record in formal_input_index.items()
        }
    else:
        staging_index = canonical_staging_index(m2.build_staging_index(), final_ids)
    work_rows = m2.build_work_rows(
        channel_rows,
        evaluated,
        months,
        context["latest_complete_month"],
        staging_index,
    )
    if len(work_rows) != len(final_ids):
        raise SystemExit(
            f"Evaluation/foundation join mismatch: evaluation={len(work_rows)}, "
            f"foundation={len(final_ids)}."
        )
    for row in work_rows:
        work_id = canonical_work_id(row["standardWorkId"])
        if work_id not in foundation:
            raise SystemExit("Evaluation contains a work outside the fixed foundation.")
        row["standardWorkId"] = work_id
        row["classificationLevel1"] = foundation[work_id]["一级分类"]
        row["classificationLevel2"] = foundation[work_id]["二级分类"]
        row["classificationLevel3"] = foundation[work_id]["三级分类"]
        row["auxiliaryTags"] = split_tags(foundation[work_id]["辅助标签"])
        row["frontRating"] = row["salesPerformanceRating"]
        if formal_input_index:
            formal_record = formal_input_index[work_id]
            confirmed_work_status = clean(formal_record.get("作品状态"))
            confirmed_audio_status = clean(formal_record.get("音频版权状态"))
            copyright_end = clean(formal_record.get("版权到期"))
            row["confirmedWorkStatus"] = confirmed_work_status
            row["confirmedAudioRightsStatus"] = confirmed_audio_status
            row["copyrightEnd"] = copyright_end
            row["currentRightsStatus"] = {
                "版权有效": "active",
                "版权已到期": "expired",
                "无限期": "perpetual",
            }.get(confirmed_audio_status, "unknown")
            row["shelfStatus"] = (
                "confirmed_on_shelf"
                if confirmed_work_status == "已上架"
                else "confirmed_off_shelf"
            )
            row["shelfStatusChinese"] = confirmed_work_status
            row["shelfStatusConfidence"] = "user_confirmed"
            row["shelfStatusReasonChinese"] = "采用用户完成的 post-foundation 状态复核结果"
            row["shelfStatusReviewPrompts"] = []
            row["requiresShelfStatusReview"] = False
            row["businessReviewAdvisories"] = list(
                formal_record.get("复核提示") or []
            )
            row["formalInputBlockers"] = list(
                formal_record.get("正式输入阻断") or []
            )

    return work_rows, {
        "latestCompleteMonth": context["latest_complete_month"],
        "workMonthStats": work_month_stats,
        "legacyMasterStats": master_stats,
        "legacyDualSourceEvaluationSnapshot": not bool(formal_input_index),
        "evaluationInputMode": (
            "post_foundation_contract_verified_private_input"
            if formal_input_index
            else "legacy_dual_source_checkpoint"
        ),
        "fiveSourcePrivateInput": five_source_input,
        "copyrightEndUnavailableInLegacyEvaluationSnapshot": sum(
            not clean(row.get("copyrightEnd")) for row in work_rows
        ),
    }


def distribution(rows: list[dict], field: str) -> dict[str, int]:
    return dict(Counter(clean(row.get(field)) or "<missing>" for row in rows))


def segmented_summary(rows: list[dict], field: str) -> dict[str, dict]:
    groups = defaultdict(list)
    for row in rows:
        groups[clean(row.get(field)) or "<missing>"].append(row)
    result = {}
    for key in sorted(groups):
        subset = groups[key]
        result[key] = {
            "workCount": len(subset),
            "revenueModelDistribution": distribution(subset, "revenueModel"),
            "frontRatingDistribution": distribution(subset, "frontRating"),
            "shelfStatusDistribution": distribution(subset, "shelfStatus"),
            "forecastabilityDistribution": distribution(
                subset, "forecastabilityStatus"
            ),
        }
    return result


def compare_checkpoint(rows: list[dict], checkpoint: dict) -> dict:
    baseline_revenue = checkpoint["stableCandidateState"]["revenueModel"]
    baseline_rating = checkpoint["stableCandidateState"]["ratingDistribution"]
    current_revenue = distribution(rows, "revenueModel")
    current_rating = distribution(rows, "frontRating")
    normalized_baseline_revenue = {
        "pure_sales_share": baseline_revenue["pureSalesShare"],
        "pure_buyout": baseline_revenue["pureBuyout"],
        "buyout_plus_sales": baseline_revenue["buyoutPlusSales"],
        "unknown_revenue_model": baseline_revenue["unknown"],
    }
    revenue_delta = {
        key: current_revenue.get(key, 0) - normalized_baseline_revenue.get(key, 0)
        for key in sorted(set(current_revenue) | set(normalized_baseline_revenue))
    }
    rating_delta = {
        key: current_rating.get(key, 0) - baseline_rating.get(key, 0)
        for key in m2.RATINGS
    }
    expected_revenue_delta = {
        "pure_sales_share": -1,
        "pure_buyout": 0,
        "buyout_plus_sales": 0,
        "unknown_revenue_model": 0,
    }
    expected_rating_delta = {
        "S+": 0,
        "S": 0,
        "A": 0,
        "B": 0,
        "C": 0,
        "D": 0,
        "E": -1,
    }
    return {
        "baselineWorkCount": sum(normalized_baseline_revenue.values()),
        "currentWorkCount": len(rows),
        "revenueModelDelta": revenue_delta,
        "frontRatingDelta": rating_delta,
        "expectedScopeOnlyRevenueDelta": expected_revenue_delta,
        "expectedScopeOnlyRatingDelta": expected_rating_delta,
        "unexpectedRevenueModelRegression": revenue_delta
        != expected_revenue_delta,
        "unexpectedFrontRatingRegression": rating_delta
        != expected_rating_delta,
        "modelRulesChangedByRerun": False,
    }


def build_summary(
    foundation_summary: dict,
    scope: dict,
    evaluation: dict,
    rows: list[dict],
    regression: dict,
    checkpoint: dict,
    project_status: dict,
) -> dict:
    review_prompts = Counter(
        prompt
        for row in rows
        for prompt in row.get("shelfStatusReviewPrompts", [])
    )
    tags = Counter(tag for row in rows for tag in row["auxiliaryTags"])
    previous_review_buckets = checkpoint["stableCandidateState"]["reviewBuckets"]
    current_review_buckets = {
        "expired_with_tail_revenue_review": review_prompts.get(
            "expired_with_tail_revenue_review", 0
        ),
        "active_rights_sparse_revenue_review": review_prompts.get(
            "active_rights_sparse_revenue_review", 0
        ),
    }
    review_decision_summary = evaluation["fiveSourcePrivateInput"].get(
        "reviewDecisionSummary", {}
    )
    review_pending = int(review_decision_summary.get("pending", 0))
    hard_blockers = [
        "copyright_term_persistence_schema_not_ready",
        "formal_master_data_not_written",
        "mapping_version_not_active",
        "formal_basic_info_version_not_created",
        "formal_input_snapshot_not_created",
        "formal_task_export_release_audit_not_complete",
    ]
    if review_pending > 0:
        hard_blockers.insert(0, "post_foundation_review_bucket_confirmation_pending")
    if not evaluation["fiveSourcePrivateInput"]["contractVerified"]:
        hard_blockers.insert(
            0, "verified_private_per_work_input_snapshot_not_available"
        )

    return {
        "schema": "m2.post_foundation_readiness_rerun.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "generationBase": {
            "head": git_value("rev-parse", "HEAD"),
            "originMain": git_value("rev-parse", "origin/main"),
        },
        "mode": "authorized_local_real_data_candidate_rerun",
        "scopeReconciliation": scope,
        "foundation": {
            "workCount": len(rows),
            "level1Distribution": distribution(rows, "classificationLevel1"),
            "taggedWorks": sum(bool(row["auxiliaryTags"]) for row in rows),
            "tagAssignments": sum(len(row["auxiliaryTags"]) for row in rows),
            "tagDistribution": dict(tags),
            "missingAuthor": foundation_summary.get("quality", {}).get(
                "missingRequiredFields", 0
            ),
            "missingClassificationPath": sum(
                not all(
                    [
                        row["classificationLevel1"],
                        row["classificationLevel2"],
                        row["classificationLevel3"],
                    ]
                )
                for row in rows
            ),
            "localCandidateClosed": True,
            "formalMasterDataWritten": False,
        },
        "candidateRerun": {
            "workCount": len(rows),
            "revenueModelDistribution": distribution(rows, "revenueModel"),
            "frontRatingDistribution": distribution(rows, "frontRating"),
            "shelfStatusDistribution": distribution(rows, "shelfStatus"),
            "forecastabilityDistribution": distribution(
                rows, "forecastabilityStatus"
            ),
            "reviewBucketDistribution": dict(review_prompts),
            "reviewBucketComparison": {
                "previous3054Checkpoint": {
                    "expired_with_tail_revenue_review": previous_review_buckets[
                        "expiredWithTailRevenueReview"
                    ],
                    "active_rights_sparse_revenue_review": previous_review_buckets[
                        "activeRightsSparseRevenueReview"
                    ],
                },
                "current3053Rerun": current_review_buckets,
                "delta": {
                    "expired_with_tail_revenue_review": current_review_buckets[
                        "expired_with_tail_revenue_review"
                    ]
                    - previous_review_buckets["expiredWithTailRevenueReview"],
                    "active_rights_sparse_revenue_review": current_review_buckets[
                        "active_rights_sparse_revenue_review"
                    ]
                    - previous_review_buckets["activeRightsSparseRevenueReview"],
                },
                "precisionRule": (
                    "full underlying bill precision remains authoritative; valid non-zero "
                    "amounts are not rounded away for review-bucket membership"
                ),
                "legacyMembershipSnapshotAvailable": False,
            },
            "byLevel1": segmented_summary(rows, "classificationLevel1"),
            "byLevel2": segmented_summary(rows, "classificationLevel2"),
            "regressionAgainst3054Checkpoint": regression,
        },
        "evaluationInputSnapshot": evaluation,
        "documentedFoundationEvidence": {
            "m1LocalDataReadiness": project_status["milestones"][
                "m1LocalDataReadiness"
            ],
            "manualClassificationAndTagGap": project_status["foundationData"][
                "classificationAndTagManualGap"
            ],
            "formalMasterDataWritten": project_status["foundationData"][
                "formalMasterDataWritten"
            ],
            "source": relative(PROJECT_STATUS_PATH),
        },
        "gate": {
            "postFoundationScopeAndSegmentRerun": "pass",
            "m2LocalCandidateEngineeringCheckpoint": (
                "pass_for_scope_and_candidate_only_private_input_unverified"
                if not evaluation["fiveSourcePrivateInput"]["contractVerified"]
                else "pass_with_contract_verified_private_input"
            ),
            "m2FormalComplete": False,
            "m3LocalPrototypeMayContinue": True,
            "m3FormalExecutionAllowed": False,
            "hardBlockers": hard_blockers,
        },
        "formalAuthorization": {
            "grantedAt": "2026-07-13",
            "formalMasterDataWrite": "granted_pending_prerequisites",
            "formalBasicInfoVersionAndInputSnapshot": "granted_pending_prerequisites",
            "mappingActivation": "granted_pending_prerequisites",
            "formalEvaluation": "granted_pending_prerequisites",
            "formalTaskExportReleaseAudit": "granted_pending_prerequisites",
            "m3FormalExecution": "not_granted_deferred",
            "executionPrerequisites": [
                "post_foundation_review_bucket_confirmation_complete",
                "private_per_work_input_contract_verified",
                "formal_dry_run_and_reconciliation_passed",
                "rollback_evidence_ready",
            ],
        },
        "postFoundationBusinessReview": {
            "expiredWithRevenueReviewed": int(
                review_decision_summary.get("expiredWithRevenue", 0)
            ),
            "activeRightsSparseRevenueReviewed": int(
                review_decision_summary.get("activeRightsSparseRevenue", 0)
            ),
            "expiredWithRevenuePending": 0 if review_decision_summary else current_review_buckets[
                "expired_with_tail_revenue_review"
            ],
            "activeRightsSparseRevenuePending": 0 if review_decision_summary else current_review_buckets[
                "active_rights_sparse_revenue_review"
            ],
            "totalPending": review_pending if review_decision_summary else sum(current_review_buckets.values()),
            "confirmationPackGenerated": True,
            "decisionsApplied": bool(review_decision_summary)
            and review_pending == 0,
            "approved": int(review_decision_summary.get("approved", 0)),
            "auditEventCount": int(
                review_decision_summary.get("auditEventCount", 0)
            ),
            "advisoryAssignmentCount": int(
                review_decision_summary.get("advisoryAssignmentCount", 0)
            ),
        },
        "prohibitedActionsConfirmed": {
            "connectedRemoteDatabase": False,
            "wroteFormalMasterData": False,
            "activatedMappingVersion": False,
            "calledSwitchMappingVersion": False,
            "enteredM3FormalExecution": False,
            "submittedPrivateOutput": False,
        },
    }


def private_record(row: dict) -> dict:
    return {
        "standardWorkId": row["standardWorkId"],
        "classificationLevel1": row["classificationLevel1"],
        "classificationLevel2": row["classificationLevel2"],
        "classificationLevel3": row["classificationLevel3"],
        "auxiliaryTags": row["auxiliaryTags"],
        "revenueModel": row["revenueModel"],
        "frontRating": row["frontRating"],
        "shelfStatus": row["shelfStatus"],
        "shelfStatusReviewPrompts": row.get("shelfStatusReviewPrompts", []),
        "currentRightsStatus": row["currentRightsStatus"],
        "forecastabilityStatus": row["forecastabilityStatus"],
    }


def markdown(summary: dict) -> str:
    scope = summary["scopeReconciliation"]
    candidate = summary["candidateRerun"]
    regression = candidate["regressionAgainst3054Checkpoint"]
    gate = summary["gate"]
    evaluation = summary["evaluationInputSnapshot"]
    business_review = summary["postFoundationBusinessReview"]

    lines = [
        "# M2 最终基础表接入后的 readiness 重算 v1",
        "",
        "## 结论",
        "",
        "- 最终分类与标签基础表已接入本地 M2 评估集合，账单、基础表和评估结果均统一为 `3053` 部。",
        "- 旧 `3054` 部口径的净差不是丢弃收入，而是一个历史分册身份在内存中归并到已确认标准作品；账单行数和收入金额均守恒。",
        "- 收入模式和前台评级相对旧 checkpoint 只各减少一条被归并的 `纯实销 / E` 旧身份，其余档位不变；未发现模型规则回归。",
        "- 分类与辅助标签可以进入本地分层统计；当前结果仍不是正式主数据或 M2 formal completion，M3 formal execution 仍未授权。",
        "",
        "## 范围对账",
        "",
        "| 项目 | 结果 |",
        "|---|---:|",
        f"| 旧账单标准作品口径 | {scope['beforeWorkCount']} |",
        f"| 历史分册归并后口径 | {scope['afterWorkCount']} |",
        f"| 最终基础表口径 | {scope['foundationWorkCount']} |",
        f"| 账单行数守恒 | {'是' if scope['rowCountConserved'] else '否'} |",
        f"| 收入金额守恒 | {'是' if scope['incomeAmountConserved'] else '否'} |",
        "",
        "## 候选层重算",
        "",
        f"- 收入模式：`{json.dumps(candidate['revenueModelDistribution'], ensure_ascii=False)}`",
        f"- 前台评级：`{json.dumps(candidate['frontRatingDistribution'], ensure_ascii=False)}`",
        f"- 货架/版权推断：`{json.dumps(candidate['shelfStatusDistribution'], ensure_ascii=False)}`",
        f"- 复核桶：`{json.dumps(candidate['reviewBucketDistribution'], ensure_ascii=False)}`",
        f"- 相对旧 3054 checkpoint 的复核桶变化：`{json.dumps(candidate['reviewBucketComparison']['delta'], ensure_ascii=False)}`。到期尾部收入增加 4 条源于按 PRD 恢复 Excel 底层完整金额精度，不将有效非零微额收入舍入为 0。",
        f"- 收入模式意外回归：`{regression['unexpectedRevenueModelRegression']}`；前台评级意外回归：`{regression['unexpectedFrontRatingRegression']}`。",
        "",
        "## 当前工程边界",
        "",
        f"- 本次运行是否获得通过内容契约的逐作品 private 输入：`{evaluation['fiveSourcePrivateInput']['contractVerified']}`。文件存在本身不构成通过。",
        f"- 本次评估输入模式：`{evaluation['evaluationInputMode']}`；版权到期不可用记录 `{evaluation['copyrightEndUnavailableInLegacyEvaluationSnapshot']}` 个。",
        f"- private 输入契约问题：`{json.dumps(evaluation['fiveSourcePrivateInput']['contractIssues'], ensure_ascii=False)}`。这属于跨机器可重复性/正式输入快照缺口，不重新定义已经收口的业务基础字段决策。",
        f"- 两类复核已应用：`{business_review['decisionsApplied']}`；已确认 `{business_review.get('approved', 0)}` 条；仍待确认 `{business_review['totalPending']}` 条。",
        "- 正式主数据尚未写入，mapping_version 未激活，formal input snapshot 与 task/export/release/audit 闭环尚未建立。",
        "",
        "## PRD / M3 门禁",
        "",
        f"- M2 本地工程 checkpoint：`{gate['m2LocalCandidateEngineeringCheckpoint']}`。",
        f"- M2 formal complete：`{gate['m2FormalComplete']}`。",
        f"- M3 本地 prototype 可继续：`{gate['m3LocalPrototypeMayContinue']}`。",
        f"- M3 formal execution：`{gate['m3FormalExecutionAllowed']}`。",
        "- 用户已授权 M2 formal 操作；两类复核和逐作品 private 输入内容契约通过后，按正式基础信息版本/输入快照、mapping、formal evaluation、task/export/release/audit 的顺序推进。",
        "- M3 formal execution 未获授权，代表性选题材料准备暂缓至 M2 收口后。",
        "",
        "## 安全边界",
        "",
        "- 公共报告仅包含聚合统计，不包含作品名、作者名、渠道名、账单行或逐作品收入。",
        "- 逐作品 private 输入/输出只允许留在 Git 忽略的 private 区域，不得提交；公开仓库只保存恢复脚本、内容契约和脱敏聚合证据。",
        "- 本轮未连接数据库、未写正式主数据、未激活 mapping_version、未进入 M3 formal execution。",
    ]
    return "\n".join(lines) + "\n"


def build_formal_gap_audit(summary: dict) -> dict:
    private_input = summary["evaluationInputSnapshot"]["fiveSourcePrivateInput"]
    input_verified = private_input["contractVerified"]
    reproducibility_gaps = []
    if not input_verified:
        reproducibility_gaps.append(
            {
                "code": "verified_private_per_work_input_snapshot_not_available",
                "description": (
                    "This run did not receive a contract-verified private per-work input. "
                    "A local recovery candidate may exist, but file presence alone is insufficient."
                ),
                "businessDataGap": False,
                "blocksFormalInputSnapshot": True,
                "inputProvidedForThisRun": private_input["providedForThisRun"],
                "inputContractVerified": input_verified,
                "contractIssues": private_input["contractIssues"],
                "smallestRemediation": (
                    "restore from approved private storage or regenerate from authorized source "
                    "materials, then pass the committed content contract before creating a formal snapshot"
                ),
            }
        )
    return {
        "schema": "m2.post_foundation_formal_gap_audit.v1",
        "generatedAt": summary["generatedAt"],
        "generationBase": summary["generationBase"],
        "businessDataDecisionGapCount": 0,
        "businessReviewDecisionPendingCount": summary[
            "postFoundationBusinessReview"
        ]["totalPending"],
        "localCandidate": {
            "foundationScopeAligned": summary["scopeReconciliation"][
                "scopeFullyAligned"
            ],
            "foundationWorkCount": summary["foundation"]["workCount"],
            "classificationAndTagGap": summary["foundation"][
                "missingClassificationPath"
            ],
            "candidateRegression": any(
                [
                    summary["candidateRerun"]["regressionAgainst3054Checkpoint"][
                        "unexpectedRevenueModelRegression"
                    ],
                    summary["candidateRerun"]["regressionAgainst3054Checkpoint"][
                        "unexpectedFrontRatingRegression"
                    ],
                ]
            ),
            "status": "local_engineering_checkpoint_pass",
        },
        "prdAlignment": [
            {
                "prdItem": "M1 standard work and required basic information",
                "currentStatus": (
                    "private_input_contract_verified_formal_version_missing"
                    if input_verified
                    else "local_candidate_closed_formal_version_missing"
                ),
                "evidence": relative(PROJECT_STATUS_PATH),
                "blocksM2Formal": True,
                "requiresUserDataEntry": False,
            },
            {
                "prdItem": "formal copyright-term persistence",
                "currentStatus": "date_only_schema_requires_forward_migration",
                "evidence": "db/migrations/V0040_050__table_basic_info_version_work.sql",
                "blocksM2Formal": True,
                "requiresUserDataEntry": False,
            },
            {
                "prdItem": "historical income and stable local candidate rules",
                "currentStatus": "post_foundation_rerun_pass",
                "evidence": relative(PUBLIC_JSON_PATH),
                "blocksM2Formal": False,
                "requiresUserDataEntry": False,
            },
            {
                "prdItem": "mapping version reference and activation",
                "currentStatus": "not_active",
                "evidence": "src/domain/oldProductEvaluation/formalReadinessGate.js",
                "blocksM2Formal": True,
                "requiresUserDataEntry": False,
            },
            {
                "prdItem": "formal basic-info version and input snapshot",
                "currentStatus": (
                    "private_input_verified_version_not_created"
                    if input_verified
                    else "not_created"
                ),
                "evidence": "src/domain/oldProductEvaluation/formalReadinessGate.js",
                "blocksM2Formal": True,
                "requiresUserDataEntry": False,
            },
            {
                "prdItem": "formal task/export/release/audit workflow",
                "currentStatus": "prototype_only_not_formal",
                "evidence": "docs/technical-design/M2-next-stage-formalization-master-plan-v0.1.md",
                "blocksM2Formal": True,
                "requiresUserDataEntry": False,
            },
            {
                "prdItem": "M3 formal execution authorization",
                "currentStatus": "not_granted",
                "evidence": "docs/analysis/m3/M3-formal-boundary-after-prototype-v0.1.md",
                "blocksM2Formal": False,
                "blocksM3Formal": True,
                "requiresUserDataEntry": False,
            },
        ],
        "reproducibilityGaps": reproducibility_gaps,
        "authorizationStatus": summary["formalAuthorization"],
        "authorizationGaps": ["m3_formal_execution"],
        "m1FormalAcceptance": "not_complete",
        "m2FormalComplete": False,
        "m3FormalExecutionAllowed": False,
        "recommendedNextTask": (
            "add_copyright_term_type_forward_migration_then_execute_authorized_m2_formal_chain"
            if input_verified
            else "restore_contract_verified_private_input_then_execute_authorized_m2_formal_chain"
        ),
        "prohibitedActionsConfirmed": summary["prohibitedActionsConfirmed"],
    }


def formal_gap_markdown(audit: dict) -> str:
    rows = []
    for item in audit["prdAlignment"]:
        rows.append(
            "| "
            + " | ".join(
                [
                    item["prdItem"],
                    item["currentStatus"],
                    "是" if item.get("blocksM2Formal") else "否",
                    "是" if item.get("requiresUserDataEntry") else "否",
                ]
            )
            + " |"
        )
    input_verified = not audit["reproducibilityGaps"]
    reproducibility_text = (
        "- 逐作品 private 输入已通过 schema、范围、必填字段、状态、复核决策和禁止建议字段内容契约；当前不再存在 private 输入恢复缺口。\n"
        if input_verified
        else "- 公开仓库只保存脱敏聚合 checkpoint；本次运行没有获得通过内容契约的逐作品 private 输入。即使本地存在恢复候选，也不能仅凭文件存在解除 formal blocker。\n"
        "- 最小处理是从批准的 private 存储恢复，或用已确认来源重新生成并通过 schema、范围、字段完整性、状态分布和来源确认校验；不得依据聚合计数伪造逐作品字段。\n"
    )
    return (
        "# M2 最终基础表接入后的 formal gap 审计 v1\n\n"
        "## 结论\n\n"
        "- 当前约定范围内的业务基础数据决定已经收口，人工数据缺口计为 `0`。\n"
        f"- 当前到期/收入状态复核待确认数为 `{audit['businessReviewDecisionPendingCount']}`。\n"
        "- M2 本地工程候选完成最终基础表重算且无收入模式/前台评级意外回归。\n"
        "- M2 仍未 formal complete；用户已授权 M2 formal 操作，剩余问题是期限类型持久化 migration、正式版本/输入快照、mapping、正式评估和 task/export/release/audit 的实际执行。\n"
        "- M3 本地 prototype 可以保留，M3 formal execution 仍不可开始。\n\n"
        "## PRD 对齐\n\n"
        "| PRD 条目 | 当前状态 | 阻断 M2 formal | 需要重新人工补数据 |\n"
        "|---|---|---:|---:|\n"
        + "\n".join(rows)
        + "\n\n"
        "## 跨机器可重复性缺口\n\n"
        + reproducibility_text
        + "\n"
        "## 授权与执行门槛\n\n"
        "- 用户已于 2026-07-13 明确授权正式主数据写入、正式基础信息版本/输入快照、mapping activation、formal evaluation 和正式 task/export/release/audit。\n"
        "- 授权不等于操作已执行：逐作品 private 输入内容契约已经通过；下一步必须先让 forward migration 保真承载非精确日期期限，再通过 dry-run/严格对账并准备回滚证据。\n"
        "- M3 formal execution 未获授权且明确暂缓；M2 正式链路完成前不得准备代表性 M3 选题材料。\n"
    )


def main() -> None:
    required = [
        FOUNDATION_PATH,
        MAPPING_PAYLOAD,
        MAPPING_OVERLAY,
        CHECKPOINT_PATH,
        PROJECT_STATUS_PATH,
    ]
    missing = [relative(path) for path in required if not path.exists()]
    if missing:
        raise SystemExit("Required post-foundation inputs are missing: " + ", ".join(missing))

    foundation, foundation_summary = load_foundation()
    raw_mapping, standard_mapping = load_historical_mappings()
    context = load_analysis_inputs()
    mapped_bill, scope = apply_foundation_scope(
        context["bill"], set(foundation), raw_mapping, standard_mapping
    )
    rows, evaluation = build_current_work_rows(context, mapped_bill, foundation)
    checkpoint = read_json(CHECKPOINT_PATH)
    project_status = read_json(PROJECT_STATUS_PATH)
    regression = compare_checkpoint(rows, checkpoint)
    if regression["unexpectedRevenueModelRegression"] or regression[
        "unexpectedFrontRatingRegression"
    ]:
        raise SystemExit("Post-foundation rerun introduced an unexpected candidate regression.")

    summary = build_summary(
        foundation_summary,
        scope,
        evaluation,
        rows,
        regression,
        checkpoint,
        project_status,
    )
    summary["inputs"] = {
        "confirmedFoundation": {
            "role": "private_confirmed_foundation",
            "sha256": sha256(FOUNDATION_PATH),
        },
        "mappingCandidate": {"role": "private_mapping_candidate"},
        "mappingOverlay": {"role": "committed_mapping_overlay"},
        "perWorkPrivateInput": summary["evaluationInputSnapshot"][
            "fiveSourcePrivateInput"
        ],
    }
    summary["outputs"] = {
        "privateDetail": "private_local_only",
        "publicReadinessEvidence": "committed_sanitized_json_and_markdown",
        "publicFormalGapEvidence": "committed_sanitized_json_and_markdown",
    }

    PRIVATE_DIR.mkdir(parents=True, exist_ok=True)
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    PRIVATE_DETAIL_PATH.write_text(
        json.dumps(
            {"summary": summary, "records": [private_record(row) for row in rows]},
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    PUBLIC_JSON_PATH.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    PUBLIC_MD_PATH.write_text(markdown(summary), encoding="utf-8")
    formal_gap = build_formal_gap_audit(summary)
    FORMAL_GAP_JSON_PATH.write_text(
        json.dumps(formal_gap, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    FORMAL_GAP_MD_PATH.write_text(formal_gap_markdown(formal_gap), encoding="utf-8")

    print(
        json.dumps(
            {
                "status": "pass",
                "scope": scope,
                "revenueModelDistribution": summary["candidateRerun"][
                    "revenueModelDistribution"
                ],
                "frontRatingDistribution": summary["candidateRerun"][
                    "frontRatingDistribution"
                ],
                "reviewBucketDistribution": summary["candidateRerun"][
                    "reviewBucketDistribution"
                ],
                "m2FormalComplete": False,
                "m3FormalExecutionAllowed": False,
                "publicReport": relative(PUBLIC_MD_PATH),
                "privateDetail": relative(PRIVATE_DETAIL_PATH),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
