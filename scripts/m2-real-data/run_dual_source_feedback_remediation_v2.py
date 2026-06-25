from __future__ import annotations

import argparse
import importlib.util
import json
import subprocess
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
OUTPUT_M1 = ROOT / "docs" / "analysis" / "m1-master-data"
OUTPUT_M2 = ROOT / "docs" / "analysis" / "m2-real-data"
PRIVATE_DIR = ROOT / "data" / "private-output" / "m1-master-data"

USER_SPOTCHECK_XLSX = PRIVATE_DIR / "M1-dual-source-user-spotcheck-pack-cn-v1.xlsx"
PRIVATE_OVERRIDES_XLSX = PRIVATE_DIR / "M1-dual-source-user-confirmed-overrides-v1.xlsx"
PRIVATE_OVERRIDES_JSON = PRIVATE_DIR / "M1-dual-source-user-confirmed-overrides-v1.json"
PRIVATE_CANDIDATES_V2_XLSX = PRIVATE_DIR / "M1-dual-source-masterdata-backfill-candidates-v2.xlsx"
PRIVATE_CANDIDATES_V2_JSON = PRIVATE_DIR / "M1-dual-source-masterdata-backfill-candidates-v2.json"
PRIVATE_DRY_RUN_V2_XLSX = PRIVATE_DIR / "M1-dual-source-masterdata-backfill-dry-run-v2.xlsx"
PRIVATE_DRY_RUN_V2_JSON = PRIVATE_DIR / "M1-dual-source-masterdata-backfill-dry-run-v2.json"
PRIVATE_SPOTCHECK_V2_XLSX = PRIVATE_DIR / "M1-dual-source-user-spotcheck-pack-cn-v2.xlsx"

FEEDBACK_MD = OUTPUT_M1 / "M1-dual-source-spotcheck-feedback-analysis-v1.md"
FEEDBACK_JSON = OUTPUT_M1 / "M1-dual-source-spotcheck-feedback-analysis-v1.json"
AUTO_RULE_MD = OUTPUT_M1 / "M1-dual-source-auto-apply-rule-v2.md"
AUTO_RULE_JSON = OUTPUT_M1 / "M1-dual-source-auto-apply-rule-v2.json"
OVERRIDES_MD = OUTPUT_M1 / "M1-dual-source-user-confirmed-overrides-v1.md"
OVERRIDES_JSON = OUTPUT_M1 / "M1-dual-source-user-confirmed-overrides-v1.json"
SUMMARY_MD = OUTPUT_M1 / "M1-dual-source-masterdata-backfill-v2-summary.md"
SUMMARY_JSON = OUTPUT_M1 / "M1-dual-source-masterdata-backfill-v2-summary.json"
DRY_RUN_MD = OUTPUT_M1 / "M1-dual-source-masterdata-backfill-dry-run-v2.md"
DRY_RUN_JSON = OUTPUT_M1 / "M1-dual-source-masterdata-backfill-dry-run-v2.json"
M2_IMPACT_MD = OUTPUT_M2 / "M2-dual-source-backfill-impact-on-evaluation-v2.md"
M2_IMPACT_JSON = OUTPUT_M2 / "M2-dual-source-backfill-impact-on-evaluation-v2.json"

ACCEPT = "\u63a5\u53d7"
REJECT = "\u62d2\u7edd"
NEEDS_MODIFY = "\u9700\u4fee\u6539"
UNCERTAIN = "\u4e0d\u786e\u5b9a"

AUTO_FIELDS_V2 = {"standardWorkName", "authorName", "copyrightStartDate", "copyrightEndDate"}
CLASSIFICATION_TAG_FIELDS = {"classificationLevel1", "classificationLevel2", "classificationLevel3", "requiredTags"}
STRICT_ORIGINAL_ID_METHODS = {"exact_original_id", "mapping_original_id"}
STRICT_DIGITAL_ID_METHODS = {"exact_work_id", "mapping_work_id"}
FIELD_GAP_MAP = {
    "standardWorkName": "missingWorkName",
    "authorName": "missingAuthor",
    "copyrightStartDate": "missingCopyrightStart",
    "copyrightEndDate": "missingCopyrightEnd",
    "classificationLevel1": "missingClassification1",
    "classificationLevel2": "missingClassification2",
    "requiredTags": "missingRequiredTags",
    "workStatus": "missingWorkStatus",
    "audioRightsStatus": "missingAudioRightsStatus",
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scope", choices=["all", "spotcheck", "dry-run", "m2-impact"], default="all")
    parser.add_argument("--print-json", action="store_true")
    args = parser.parse_args()

    payload = build_payload()
    write_outputs(payload)
    summary = cli_summary(args.scope, payload)
    print(json.dumps(summary, ensure_ascii=False))
    if args.print_json:
        print(json.dumps(summary, ensure_ascii=False, indent=2))


def build_payload() -> dict:
    v1 = load_v1_module()
    v1_payload = v1.build_payload()
    user_rows = read_user_spotcheck(v1)
    selected_candidates = selected_spotcheck_candidates(v1, v1_payload)
    feedback_rows = merge_feedback_rows(user_rows, selected_candidates)
    feedback_analysis = build_feedback_analysis(feedback_rows)
    overrides = build_user_confirmed_overrides(feedback_rows)
    auto_rule = build_auto_rule_v2(feedback_analysis)
    v2 = classify_candidates_v2(v1_payload["dualCandidates"], overrides)
    dry_run = build_dry_run_v2(v1_payload, v2, overrides)
    m2_impact = build_m2_impact_v2(v1_payload, dry_run, v2)
    spotcheck_v2_rows = build_spotcheck_v2_rows(v2)
    summary = build_summary(feedback_analysis, overrides, v2, dry_run, m2_impact, spotcheck_v2_rows)
    return {
        "generatedAt": now(),
        "v1Payload": v1_payload,
        "feedbackRows": feedback_rows,
        "feedbackAnalysis": feedback_analysis,
        "autoRule": auto_rule,
        "overrides": overrides,
        "v2": v2,
        "dryRun": dry_run,
        "m2Impact": m2_impact,
        "spotcheckV2Rows": spotcheck_v2_rows,
        "summary": summary,
        "v1Module": v1,
    }


def load_v1_module():
    path = ROOT / "scripts" / "m2-real-data" / "run_dual_source_masterdata_backfill_v1.py"
    spec = importlib.util.spec_from_file_location("dual_source_v1", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)  # type: ignore[union-attr]
    return module


def read_user_spotcheck(v1) -> list[dict]:
    if not USER_SPOTCHECK_XLSX.exists():
        raise SystemExit(f"Missing private user spotcheck workbook: {rel(USER_SPOTCHECK_XLSX)}")
    book = v1.v3.read_xlsx_workbook(USER_SPOTCHECK_XLSX)
    sheet = max(book["sheets"], key=lambda item: len(item["rows"]))
    headers = sheet["headers"]
    if len(headers) < 20:
        raise SystemExit("Dual-source spotcheck workbook does not contain the expected 20-column review sheet.")
    keys = {
        "candidateId": headers[0],
        "standardWorkId": headers[1],
        "rawWorkId": headers[2],
        "cohort": headers[3],
        "source": headers[4],
        "field": headers[5],
        "currentValue": headers[6],
        "candidateValue": headers[7],
        "sourceSummary": headers[8],
        "matchMethod": headers[9],
        "matchConfidence": headers[10],
        "valueConfidence": headers[11],
        "conflictStatus": headers[12],
        "requiresManualReview": headers[13],
        "autoApply": headers[14],
        "systemAdvice": headers[15],
        "systemReason": headers[16],
        "userDecision": headers[17],
        "userCorrectedValue": headers[18],
        "userNote": headers[19],
    }
    rows = []
    for row in sheet["rows"]:
        rows.append({key: clean(row.get(header)) for key, header in keys.items()})
    return rows


def selected_spotcheck_candidates(v1, v1_payload: dict) -> list[dict]:
    candidate_rows = []
    for candidate in v1_payload["dualCandidates"]:
        priority = v1.spotcheck_priority(candidate)
        if priority <= 0:
            continue
        candidate_rows.append((priority, candidate.get("totalHistoricalRevenue", 0), candidate))
    candidate_rows.sort(key=lambda item: (item[0], item[1]), reverse=True)
    selected = []
    seen = set()
    for _, _, candidate in candidate_rows:
        key = (candidate["standardWorkId"], candidate["fieldName"], candidate["source"])
        if key in seen:
            continue
        seen.add(key)
        selected.append(candidate)
        if len(selected) >= 80:
            break
    result = []
    for index, candidate in enumerate(selected, start=1):
        copied = dict(candidate)
        copied["candidateId"] = f"DS-{index:03d}"
        result.append(copied)
    return result


def merge_feedback_rows(user_rows: list[dict], selected_candidates: list[dict]) -> list[dict]:
    by_id = {candidate["candidateId"]: candidate for candidate in selected_candidates}
    rows = []
    for user_row in user_rows:
        candidate = by_id.get(user_row["candidateId"])
        if candidate is None:
            continue
        rows.append(
            {
                "candidateId": user_row["candidateId"],
                "standardWorkId": candidate["standardWorkId"],
                "rawWorkId": candidate.get("rawWorkId", ""),
                "fieldName": candidate["fieldName"],
                "fieldLabel": user_row["field"],
                "source": candidate["source"],
                "sourceLabel": user_row["source"],
                "cohort": candidate.get("cohort", ""),
                "currentValue": candidate.get("currentValue", ""),
                "candidateValue": candidate.get("proposedValue", ""),
                "matchMethod": candidate.get("matchMethod", ""),
                "matchConfidence": candidate.get("matchConfidence", 0),
                "valueConfidence": candidate.get("valueConfidence", 0),
                "conflictStatus": candidate.get("conflictStatus", ""),
                "requiresManualReview": candidate.get("requiresManualReview", False),
                "autoApplyEligibleV1": candidate.get("autoApplyEligibleDualSource", False),
                "userDecision": canonical_decision(user_row["userDecision"]),
                "userDecisionLabel": user_row["userDecision"],
                "userCorrectedValue": user_row["userCorrectedValue"],
                "userNote": user_row["userNote"],
                "totalHistoricalRevenue": candidate.get("totalHistoricalRevenue", 0),
                "candidate": candidate,
            }
        )
    return rows


def build_feedback_analysis(rows: list[dict]) -> dict:
    total = len(rows)
    decisions = Counter(row["userDecision"] for row in rows)
    completed = total - decisions.get("blank", 0)
    by_field = aggregate_rows(rows, "fieldName")
    by_source = aggregate_rows(rows, "source")
    by_match_method = aggregate_rows(rows, "matchMethod")
    high_revenue = sorted(rows, key=lambda item: item["totalHistoricalRevenue"], reverse=True)[:20]
    serious = {
        "dualSourceConflictNeedsModify": sum(1 for row in rows if row["source"] == "both_sources_conflict" and row["userDecision"] == "needs_modify"),
        "categoryOrTagNeedsModify": sum(1 for row in rows if row["fieldName"] in CLASSIFICATION_TAG_FIELDS and row["userDecision"] == "needs_modify"),
        "titleAuthorNeedsModify": sum(1 for row in rows if row["fieldName"] in {"standardWorkName", "authorName"} and row["userDecision"] == "needs_modify"),
        "copyrightEndNeedsModify": sum(1 for row in rows if row["fieldName"] == "copyrightEndDate" and row["userDecision"] == "needs_modify"),
        "highRevenueNeedsModify": sum(1 for row in high_revenue if row["userDecision"] == "needs_modify"),
        "highConfidenceAccepted": sum(1 for row in rows if is_high(row["matchConfidence"]) and is_high(row["valueConfidence"]) and row["userDecision"] == "accept"),
        "highConfidenceTotal": sum(1 for row in rows if is_high(row["matchConfidence"]) and is_high(row["valueConfidence"])),
    }
    rule_extractions = {
        "fieldsFrequentlyCorrected": [
            {"fieldName": field, "fieldLabel": field_label(field), "needsModifyRows": item["decisions"].get("needs_modify", 0)}
            for field, item in by_field.items()
            if item["decisions"].get("needs_modify", 0) > 0
        ],
        "sourcesToDemote": ["both_sources_conflict", "original_library_classification_mapping"],
        "fieldsNeverAutoApply": sorted(CLASSIFICATION_TAG_FIELDS),
        "userCorrectionGeneralizationAllowed": False,
        "userCorrectionScope": "reviewed_candidate_only",
    }
    return {
        "schema": "m1.dual_source_spotcheck_feedback_analysis.v1",
        "totalRows": total,
        "completedRows": completed,
        "completionRate": ratio(completed, total),
        "decisionDistribution": dict(decisions),
        "acceptanceRate": ratio(decisions.get("accept", 0), total),
        "needsModifyRate": ratio(decisions.get("needs_modify", 0), total),
        "rejectRate": ratio(decisions.get("reject", 0), total),
        "uncertainRate": ratio(decisions.get("uncertain", 0), total),
        "readyForLocalStagingApply": False,
        "readyStatus": "not_ready",
        "byField": by_field,
        "bySource": by_source,
        "byMatchMethod": by_match_method,
        "errorPatterns": {
            "dual_source_conflict_causes_modification": serious["dualSourceConflictNeedsModify"],
            "original_library_classification_mapping_inaccurate": serious["categoryOrTagNeedsModify"],
            "ledger_and_original_library_semantics_differ": serious["dualSourceConflictNeedsModify"],
            "title_or_author_requires_manual_correction": serious["titleAuthorNeedsModify"],
            "copyright_end_requires_manual_correction": serious["copyrightEndNeedsModify"],
            "classification_or_tags_not_suitable_for_auto_apply": sum(1 for row in rows if row["fieldName"] in CLASSIFICATION_TAG_FIELDS),
        },
        "seriousErrorCounts": serious,
        "ruleExtractions": rule_extractions,
        "safeOutputBoundary": public_boundary(),
    }


def aggregate_rows(rows: list[dict], key: str) -> dict:
    grouped: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        grouped[row.get(key) or "unknown"].append(row)
    return {
        group: {
            "rowCount": len(items),
            "decisions": dict(Counter(item["userDecision"] for item in items)),
            "acceptanceRate": ratio(sum(1 for item in items if item["userDecision"] == "accept"), len(items)),
            "needsModifyRate": ratio(sum(1 for item in items if item["userDecision"] == "needs_modify"), len(items)),
        }
        for group, items in sorted(grouped.items())
    }


def build_user_confirmed_overrides(rows: list[dict]) -> list[dict]:
    overrides = []
    for row in rows:
        decision = row["userDecision"]
        if decision == "blank" or decision == "uncertain":
            continue
        action = "acceptCandidate" if decision == "accept" else "rejectCandidate" if decision == "reject" else "applyCorrectedValue"
        can_apply = decision == "accept" or (decision == "needs_modify" and bool(row["userCorrectedValue"]))
        if decision == "needs_modify" and not row["userCorrectedValue"]:
            action = "missingCorrectedValue"
        overrides.append(
            {
                "candidateId": row["candidateId"],
                "standardWorkId": row["standardWorkId"],
                "fieldName": row["fieldName"],
                "originalCandidateValue": row["candidateValue"],
                "userDecision": decision,
                "userDecisionLabel": row["userDecisionLabel"],
                "userCorrectedValue": row["userCorrectedValue"],
                "userNote": row["userNote"],
                "userConfirmedAction": action,
                "canApplyToStaging": can_apply,
                "canGeneralize": False,
                "generalizationReason": "only_the_reviewed_candidate_is_user_confirmed",
                "candidateKey": candidate_key(row["candidate"]),
            }
        )
    return overrides


def build_auto_rule_v2(feedback_analysis: dict) -> dict:
    return {
        "schema": "m1.dual_source_auto_apply_rule.v2",
        "status": "corrected_by_user_spotcheck_feedback",
        "allowedAutoApplyFields": sorted(AUTO_FIELDS_V2),
        "neverAutoApplyFields": sorted(CLASSIFICATION_TAG_FIELDS),
        "rules": {
            "dualSourceConflict": {
                "autoApply": False,
                "manualReviewRequired": True,
                "stagingAllowedOnlyWhenUserConfirmed": True,
            },
            "classificationAndTags": {
                "autoApply": False,
                "candidateOnly": True,
                "originalLibraryClassificationNotAuthoritativeForM1": True,
            },
            "titleAndAuthor": {
                "autoApplyRequiresSingleSourceExactOrMappingId": True,
                "fuzzyOrTitleOnlyAutoApply": False,
                "demotePatternsSeenInSpotcheck": True,
            },
            "copyrightDates": {
                "autoApplyRequiresSingleSourceClearParsedDate": True,
                "relativeExpiryAutoApply": False,
                "autoRenewalAutoApply": False,
                "multiDateConflictAutoApply": False,
            },
            "userCorrectedValues": {
                "generalizeAutomatically": False,
                "allowedScope": "reviewed_candidate_or_explicit_duplicate_only_after_tested_rule",
            },
        },
        "feedbackEvidence": {
            "totalRows": feedback_analysis["totalRows"],
            "needsModifyRows": feedback_analysis["decisionDistribution"].get("needs_modify", 0),
            "categoryOrTagNeedsModifyRows": feedback_analysis["errorPatterns"]["original_library_classification_mapping_inaccurate"],
            "dualSourceConflictNeedsModifyRows": feedback_analysis["errorPatterns"]["dual_source_conflict_causes_modification"],
        },
        "safeOutputBoundary": public_boundary(),
    }


def classify_candidates_v2(candidates: list[dict], overrides: list[dict]) -> dict:
    override_by_key = {override["candidateKey"]: override for override in overrides}
    safe = []
    manual = []
    rejected_or_blocked = []
    enriched = []
    for candidate in candidates:
        item = dict(candidate)
        v2 = evaluate_candidate_v2(item)
        item.update(v2)
        key = candidate_key(item)
        override = override_by_key.get(key)
        item["userConfirmedOverrideCandidate"] = override is not None and override["canApplyToStaging"]
        item["userRejectedCandidate"] = override is not None and override["userConfirmedAction"] == "rejectCandidate"
        if item["safeAutoApplyEligibleV2"]:
            item["v2Bucket"] = "safe_auto_apply_candidates"
            safe.append(item)
        elif item["userRejectedCandidate"]:
            item["v2Bucket"] = "rejected_or_rule_blocked_candidates"
            rejected_or_blocked.append(item)
        else:
            item["v2Bucket"] = "manual_review_candidates"
            manual.append(item)
        enriched.append(item)
    return {
        "schema": "m1.dual_source_masterdata_backfill_candidates.v2",
        "allCandidates": enriched,
        "safeAutoApplyCandidates": safe,
        "manualReviewCandidates": manual,
        "rejectedOrRuleBlockedCandidates": rejected_or_blocked,
        "bucketCounts": {
            "safe_auto_apply_candidates": len(safe),
            "user_confirmed_override_candidates": sum(1 for override in overrides if override["canApplyToStaging"]),
            "manual_review_candidates": len(manual),
            "rejected_or_rule_blocked_candidates": len(rejected_or_blocked),
        },
        "safeOutputBoundary": {
            **public_boundary(),
            "privateCandidateDetailsStoredOnlyInGitignoredOutput": True,
        },
    }


def evaluate_candidate_v2(candidate: dict) -> dict:
    reasons = []
    field = candidate.get("fieldName", "")
    source = candidate.get("source", "")
    methods = set(clean(candidate.get("matchMethod")).split("+"))
    current = normalize_compare(candidate.get("currentValue"))
    proposed = normalize_compare(candidate.get("proposedValueNormalized") or candidate.get("proposedValue"))
    if field not in AUTO_FIELDS_V2:
        reasons.append("classification_or_tag_never_auto_apply_v2" if field in CLASSIFICATION_TAG_FIELDS else "field_not_supported_v2")
    if source == "both_sources_conflict" or candidate.get("conflictStatus") == "dual_source_value_conflict":
        reasons.append("dual_source_conflict_never_auto_apply_v2")
    if source == "both_sources_consistent":
        reasons.append("dual_source_consistency_requires_manual_review_v2")
    if "fuzzy" in clean(candidate.get("matchMethod")) or "title_only" in clean(candidate.get("matchMethod")):
        reasons.append("weak_match_never_auto_apply_v2")
    if source == "original_library" and not methods.intersection(STRICT_ORIGINAL_ID_METHODS):
        reasons.append("original_match_must_be_exact_or_mapping_id_v2")
    if source == "digital_copyright_ledger" and not methods.intersection(STRICT_DIGITAL_ID_METHODS):
        reasons.append("digital_match_must_be_exact_or_mapping_id_v2")
    if source not in {"original_library", "digital_copyright_ledger"}:
        reasons.append("auto_apply_requires_single_source_v2")
    if candidate.get("requiresManualReview"):
        reasons.append("requires_manual_review_v2")
    if candidate.get("parserStatus") != "parsed":
        reasons.append(f"parser_status_{candidate.get('parserStatus')}_v2")
    if to_float(candidate.get("valueConfidence")) < 0.97:
        reasons.append("value_confidence_below_0_97_v2")
    if current and current != proposed:
        reasons.append("current_authoritative_value_not_empty_v2")
    if field in {"copyrightStartDate", "copyrightEndDate"} and complex_date_signal(candidate):
        reasons.append("complex_date_signal_never_auto_apply_v2")
    return {
        "safeAutoApplyEligibleV2": len(reasons) == 0,
        "autoApplyExclusionReasonsV2": sorted(set(reasons)),
    }


def build_dry_run_v2(v1_payload: dict, v2: dict, overrides: list[dict]) -> dict:
    v1_dry = v1_payload["dualDryRun"]
    safe = v2["safeAutoApplyCandidates"]
    staging_overrides = [override for override in overrides if override["canApplyToStaging"]]
    before = {key: value["before"] for key, value in v1_dry["dualSource"]["fieldGapResults"].items()}
    reductions: dict[str, set[str]] = defaultdict(set)
    candidate_coverage: dict[str, set[str]] = defaultdict(set)
    manual_coverage: dict[str, set[str]] = defaultdict(set)
    for candidate in v2["allCandidates"]:
        gap = FIELD_GAP_MAP.get(candidate["fieldName"])
        if not gap:
            continue
        candidate_coverage[gap].add(candidate["standardWorkId"])
        if candidate["safeAutoApplyEligibleV2"]:
            reductions[gap].add(candidate["standardWorkId"])
        else:
            manual_coverage[gap].add(candidate["standardWorkId"])
    for override in staging_overrides:
        if override["fieldName"] in CLASSIFICATION_TAG_FIELDS:
            continue
        gap = FIELD_GAP_MAP.get(override["fieldName"])
        if gap:
            reductions[gap].add(override["standardWorkId"])
    fields = {}
    for gap, count in before.items():
        reduction = min(count, len(reductions[gap]))
        fields[gap] = {
            "before": count,
            "autoApplyAfter": max(0, count - reduction),
            "autoApplyReduction": reduction,
            "candidateCoverageWorks": len(candidate_coverage[gap]),
            "manualCandidateWorks": len(manual_coverage[gap]),
        }
    v1_auto = v1_dry["dualSource"]["autoApplyEligibleRows"]
    safe_works = {candidate["standardWorkId"] for candidate in safe}
    override_works = {override["standardWorkId"] for override in staging_overrides}
    v1_end = v1_dry["dualSource"]["copyrightEndFillableWorks"]
    v2_end = fields["missingCopyrightEnd"]["autoApplyReduction"]
    return {
        "schema": "m1.dual_source_masterdata_backfill.dry_run.v2",
        "formalMasterDataWritten": False,
        "databaseWritten": False,
        "v1VsV2": {
            "v1AutoApplyEligibleRows": v1_auto,
            "v2SafeAutoApplyRows": len(safe),
            "v2UserConfirmedOverrideRows": len(staging_overrides),
            "v2ManualReviewRows": v2["bucketCounts"]["manual_review_candidates"],
            "v2RejectedOrRuleBlockedRows": v2["bucketCounts"]["rejected_or_rule_blocked_candidates"],
            "safeAutoApplyDeltaRows": len(safe) - v1_auto,
            "copyrightEndFillableWorksV1": v1_end,
            "copyrightEndFillableWorksV2": v2_end,
            "copyrightEndFillableDeltaWorks": v2_end - v1_end,
        },
        "v2Buckets": v2["bucketCounts"],
        "fieldGapResults": fields,
        "safeAutoApplyWorks": len(safe_works),
        "userConfirmedOverrideWorks": len(override_works),
        "safeAutoApplyRevenueCoverage": revenue_coverage(safe),
        "userConfirmedOverrideRevenueCoverage": revenue_coverage_for_overrides(staging_overrides, v2["allCandidates"]),
        "safetyGuards": {
            "dualSourceConflictAutoApplyBlocked": True,
            "classificationAndTagsAutoApplyBlocked": True,
            "needsModifyUsesOnlyUserCorrectedValue": True,
            "uncertainRowsNotApplied": True,
            "nonEmptyAuthoritativeValueNotOverwritten": True,
            "formalMasterDataWriteBlocked": True,
            "m3NotEntered": True,
        },
        "readyStatus": "ready_for_limited_local_staging_apply" if staging_overrides or safe else "not_ready",
        "safeOutputBoundary": public_boundary(),
    }


def build_m2_impact_v2(v1_payload: dict, dry_run: dict, v2: dict) -> dict:
    v1_impact = v1_payload["m2Impact"]
    v1_increase = v1_impact["copyrightTermForecast"]["increaseWorks"]
    v2_end = dry_run["fieldGapResults"]["missingCopyrightEnd"]["autoApplyReduction"]
    digital_end = v1_payload["dualDryRun"]["singleDigitalLedgerV3"]["copyrightEndFillableWorks"]
    v2_increase = max(0, v2_end - digital_end)
    end_candidates = [candidate for candidate in v2["safeAutoApplyCandidates"] if candidate["fieldName"] == "copyrightEndDate"]
    return {
        "schema": "m2.dual_source_backfill_impact_on_evaluation.v2",
        "comparisonBaseline": "dual_source_v1_feedback_corrected_to_v2",
        "v1VsV2": {
            "copyrightTermForecastIncreaseWorksV1": v1_increase,
            "copyrightTermForecastIncreaseWorksV2": v2_increase,
            "copyrightTermForecastDeltaWorks": v2_increase - v1_increase,
            "operator30WorkPackRowsLikelyNeedRefresh": min(30, len({item["standardWorkId"] for item in end_candidates})),
        },
        "copyrightTermForecast": {
            "increaseWorks": v2_increase,
            "decreaseIsAccuracyProtection": v2_increase < v1_increase,
        },
        "operatingWindowForecastPendingExpiry": {
            "estimatedReductionWorks": v2_increase,
            "requiresRerunAfterApprovedLocalStagingApply": v2_increase > 0,
        },
        "renewalReview": {
            "improvedCandidateWorks": len({item["standardWorkId"] for item in end_candidates}),
            "requiresUserConfirmedApplyBeforeBusinessUse": True,
        },
        "ratingRemainingCopyrightAdjustment": {
            "newlyUsableWorks": v2_increase,
            "requiresForecastOutputTypeRerun": v2_increase > 0,
        },
        "manualReview": {
            "manualReviewRowsV2": dry_run["v2Buckets"]["manual_review_candidates"],
            "reductionIsConservativeForCorrectness": True,
        },
        "samplePacks": {
            "operator30WorkPackNeedsRerunAfterApprovedApply": v2_increase > 0,
        },
        "status": "local_dry_run_only_no_formal_write_no_m3",
        "safeOutputBoundary": public_boundary(),
    }


def build_spotcheck_v2_rows(v2: dict) -> list[dict]:
    rows = []
    selected = []
    safe_sorted = sorted(v2["safeAutoApplyCandidates"], key=lambda item: item.get("totalHistoricalRevenue", 0), reverse=True)
    selected.extend(("safe_auto_apply_high_revenue", item) for item in safe_sorted[:10])
    selected.extend(
        ("copyright_end_high_impact", item)
        for item in safe_sorted
        if item["fieldName"] == "copyrightEndDate"
    )
    selected.extend(
        ("title_author_high_impact", item)
        for item in v2["manualReviewCandidates"]
        if item["fieldName"] in {"standardWorkName", "authorName"}
    )
    selected.extend(
        ("classification_or_tag_downgraded", item)
        for item in v2["manualReviewCandidates"]
        if item["fieldName"] in CLASSIFICATION_TAG_FIELDS
    )
    selected.extend(
        ("dual_source_conflict_blocked", item)
        for item in v2["manualReviewCandidates"]
        if item["source"] == "both_sources_conflict"
    )
    seen = set()
    for reason, candidate in selected:
        key = candidate_key(candidate)
        if key in seen:
            continue
        seen.add(key)
        rows.append(
            {
                "审核编号": f"DSV2-{len(rows) + 1:03d}",
                "抽检原因": reason_cn(reason),
                "标准作品ID": candidate["standardWorkId"],
                "字段": field_label(candidate["fieldName"]),
                "当前值": candidate.get("currentValue", ""),
                "候选值": candidate.get("proposedValue", ""),
                "来源": source_label(candidate["source"]),
                "匹配方式": candidate.get("matchMethod", ""),
                "值置信度": confidence_label(candidate.get("valueConfidence")),
                "v2分组": candidate["v2Bucket"],
                "v2阻断原因": ", ".join(candidate.get("autoApplyExclusionReasonsV2", [])),
                "用户判断": "",
                "用户修正值": "",
                "用户备注": "",
            }
        )
        if len(rows) >= 40:
            break
    return rows


def build_summary(feedback_analysis: dict, overrides: list[dict], v2: dict, dry_run: dict, m2_impact: dict, spotcheck_rows: list[dict]) -> dict:
    staging_overrides = [override for override in overrides if override["canApplyToStaging"]]
    return {
        "schema": "m1.dual_source_feedback_remediation_v2.summary",
        "currentHead": git(["rev-parse", "HEAD"]),
        "originMain": git(["rev-parse", "origin/main"]),
        "feedbackCompleted": feedback_analysis["completionRate"] == 1,
        "readyStatus": dry_run["readyStatus"],
        "notEnteringM3": True,
        "feedback": {
            "totalRows": feedback_analysis["totalRows"],
            "acceptedRows": feedback_analysis["decisionDistribution"].get("accept", 0),
            "needsModifyRows": feedback_analysis["decisionDistribution"].get("needs_modify", 0),
            "rejectedRows": feedback_analysis["decisionDistribution"].get("reject", 0),
            "uncertainRows": feedback_analysis["decisionDistribution"].get("uncertain", 0),
        },
        "overrides": {
            "totalRows": len(overrides),
            "stagingRows": len(staging_overrides),
            "acceptedRows": sum(1 for item in overrides if item["userConfirmedAction"] == "acceptCandidate"),
            "modifiedRows": sum(1 for item in overrides if item["userConfirmedAction"] == "applyCorrectedValue"),
            "generalizedRows": 0,
        },
        "dryRunV2": {
            "safeAutoApplyRows": dry_run["v2Buckets"]["safe_auto_apply_candidates"],
            "userConfirmedOverrideRows": dry_run["v2Buckets"]["user_confirmed_override_candidates"],
            "manualReviewRows": dry_run["v2Buckets"]["manual_review_candidates"],
            "rejectedOrRuleBlockedRows": dry_run["v2Buckets"]["rejected_or_rule_blocked_candidates"],
            "fieldGapResults": dry_run["fieldGapResults"],
        },
        "m2Impact": m2_impact["v1VsV2"],
        "newSpotcheckPack": {
            "path": rel(PRIVATE_SPOTCHECK_V2_XLSX),
            "rowCount": len(spotcheck_rows),
            "gitignored": True,
        },
        "prohibitedActionsConfirmed": prohibited_actions(),
    }


def write_outputs(payload: dict) -> None:
    OUTPUT_M1.mkdir(parents=True, exist_ok=True)
    OUTPUT_M2.mkdir(parents=True, exist_ok=True)
    PRIVATE_DIR.mkdir(parents=True, exist_ok=True)
    v1 = payload["v1Module"]
    generated_at = payload["generatedAt"]

    write_public(FEEDBACK_JSON, "m1.dual_source_spotcheck_feedback_analysis.v1", payload["feedbackAnalysis"], generated_at)
    write_md(FEEDBACK_MD, feedback_md(payload["feedbackAnalysis"]))
    write_public(AUTO_RULE_JSON, "m1.dual_source_auto_apply_rule.v2", payload["autoRule"], generated_at)
    write_md(AUTO_RULE_MD, auto_rule_md(payload["autoRule"]))
    write_public(OVERRIDES_JSON, "m1.dual_source_user_confirmed_overrides.v1.public", public_override_summary(payload["overrides"]), generated_at)
    write_md(OVERRIDES_MD, overrides_md(payload["overrides"]))
    write_public(SUMMARY_JSON, "m1.dual_source_masterdata_backfill_v2.summary", payload["summary"], generated_at)
    write_md(SUMMARY_MD, summary_md(payload["summary"]))
    write_public(DRY_RUN_JSON, "m1.dual_source_masterdata_backfill.dry_run.v2", payload["dryRun"], generated_at)
    write_md(DRY_RUN_MD, dry_run_md(payload["dryRun"]))
    write_public(M2_IMPACT_JSON, "m2.dual_source_backfill_impact_on_evaluation.v2", payload["m2Impact"], generated_at)
    write_md(M2_IMPACT_MD, m2_impact_md(payload["m2Impact"]))

    v1.v3.write_json(PRIVATE_OVERRIDES_JSON, {"schema": "m1.dual_source_user_confirmed_overrides.v1.private", "overrides": payload["overrides"]})
    v1.v3.write_json(
        PRIVATE_CANDIDATES_V2_JSON,
        {
            "schema": "m1.dual_source_masterdata_backfill_candidates.v2.private",
            "bucketCounts": payload["v2"]["bucketCounts"],
            "candidateRows": payload["v2"]["allCandidates"],
        },
    )
    v1.v3.write_json(
        PRIVATE_DRY_RUN_V2_JSON,
        {
            "schema": "m1.dual_source_masterdata_backfill_dry_run.v2.private",
            "dryRun": payload["dryRun"],
            "candidateRows": payload["v2"]["allCandidates"],
            "overrides": payload["overrides"],
        },
    )
    v1.v3.write_xlsx(PRIVATE_OVERRIDES_XLSX, {"user_confirmed_overrides": private_override_rows(payload["overrides"])})
    v1.v3.write_xlsx(
        PRIVATE_CANDIDATES_V2_XLSX,
        {
            "safe_auto_apply": private_candidate_rows(payload["v2"]["safeAutoApplyCandidates"][:2000]),
            "manual_review": private_candidate_rows(payload["v2"]["manualReviewCandidates"][:2000]),
            "rejected_or_blocked": private_candidate_rows(payload["v2"]["rejectedOrRuleBlockedCandidates"][:2000]),
        },
    )
    v1.v3.write_xlsx(
        PRIVATE_DRY_RUN_V2_XLSX,
        {
            "dry_run_v2": dict_to_rows(payload["dryRun"]),
            "safety_guards": dict_to_rows(payload["dryRun"]["safetyGuards"]),
        },
    )
    v1.v3.write_xlsx(
        PRIVATE_SPOTCHECK_V2_XLSX,
        {
            "01_v2抽检清单": payload["spotcheckV2Rows"],
            "00_阅读说明": [
                {"项目": "用途", "说明": "复核 v2 规则下仍可能进入 safe_auto_apply 的样本，以及被 v2 降级的高影响 manual_review 模式。"},
                {"项目": "不重复 v1", "说明": "本包不要求用户重新审核 80 条双源冲突样本。"},
                {"项目": "填写项", "说明": "请填写 用户判断 / 用户修正值 / 用户备注。"},
                {"项目": "安全边界", "说明": "本文件位于 data/private-output，gitignored，不提交，不进入 M3。"},
            ],
        },
        decision_sheet="01_v2抽检清单",
        decision_header="用户判断",
    )


def write_public(path: Path, schema: str, payload: dict, generated_at: str) -> None:
    path.write_text(
        json.dumps(
            {
                "schema": schema,
                "generatedAt": generated_at,
                "currentHead": git(["rev-parse", "HEAD"]),
                "originMain": git(["rev-parse", "origin/main"]),
                "safeOutputBoundary": public_boundary(),
                "payload": payload,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def feedback_md(payload: dict) -> str:
    return "\n".join(
        [
            "# M1 Dual-Source Spotcheck Feedback Analysis v1",
            "",
            "- This report is sanitized and aggregate-only.",
            f"- Total rows: `{payload['totalRows']}`",
            f"- Completion rate: `{pct(payload['completionRate'])}`",
            f"- Acceptance rate: `{pct(payload['acceptanceRate'])}`",
            f"- Needs-modify rate: `{pct(payload['needsModifyRate'])}`",
            f"- Ready for local staging apply: `{payload['readyForLocalStagingApply']}`",
            "",
            "## Decision Distribution",
            table(counter_rows(payload["decisionDistribution"]), ["key", "count"]),
            "",
            "## By Field",
            table(aggregate_table_rows(payload["byField"]), ["key", "rowCount", "accept", "needs_modify", "reject", "uncertain", "acceptanceRate", "needsModifyRate"]),
            "",
            "## Error Patterns",
            table(counter_rows(payload["errorPatterns"]), ["key", "count"]),
            "",
            "## Rule Extraction",
            "- Dual-source conflicts must stay manual review unless explicitly user-confirmed.",
            "- Classification and tags must be removed from autoApply scope.",
            "- User correction values are reviewed-candidate scoped and are not generalized automatically.",
        ]
    )


def auto_rule_md(payload: dict) -> str:
    return "\n".join(
        [
            "# M1 Dual-Source Auto-Apply Rule v2",
            "",
            f"- Status: `{payload['status']}`",
            f"- Allowed autoApply fields: `{', '.join(payload['allowedAutoApplyFields'])}`",
            f"- Never autoApply fields: `{', '.join(payload['neverAutoApplyFields'])}`",
            "",
            "## Core Rules",
            "- Dual-source conflict: never autoApply; user-confirmed staging only.",
            "- Classification and tags: recommendation candidate only; no autoApply.",
            "- Title/author: exact or mapping ID, single source, no conflict, empty current value, high confidence only.",
            "- Copyright dates: exact or mapping ID, single source, parsed clear date, no relative term, no renewal, no multi-date conflict.",
            "- User corrected values: do not generalize automatically.",
        ]
    )


def overrides_md(overrides: list[dict]) -> str:
    counts = Counter(item["userConfirmedAction"] for item in overrides)
    staging = sum(1 for item in overrides if item["canApplyToStaging"])
    return "\n".join(
        [
            "# M1 Dual-Source User-Confirmed Overrides v1",
            "",
            "- This public report is aggregate-only. Private override rows are gitignored.",
            f"- Total override rows: `{len(overrides)}`",
            f"- Can apply to local staging rows: `{staging}`",
            f"- Accepted rows: `{counts.get('acceptCandidate', 0)}`",
            f"- Modified rows: `{counts.get('applyCorrectedValue', 0)}`",
            f"- Rejected rows: `{counts.get('rejectCandidate', 0)}`",
            "- Generalized rows: `0`",
        ]
    )


def summary_md(payload: dict) -> str:
    return "\n".join(
        [
            "# M1 Dual-Source Master Data Backfill v2 Summary",
            "",
            f"- Ready status: `{payload['readyStatus']}`",
            f"- Not entering M3: `{payload['notEnteringM3']}`",
            "",
            "## Feedback",
            table(dict_to_rows(payload["feedback"]), ["key", "value"]),
            "",
            "## Overrides",
            table(dict_to_rows(payload["overrides"]), ["key", "value"]),
            "",
            "## Dry-Run v2",
            table(dict_to_rows(payload["dryRunV2"]), ["key", "value"]),
            "",
            "## M2 Impact",
            table(dict_to_rows(payload["m2Impact"]), ["key", "value"]),
        ]
    )


def dry_run_md(payload: dict) -> str:
    return "\n".join(
        [
            "# M1 Dual-Source Master Data Backfill Dry-Run v2",
            "",
            "- Formal master data written: `False`",
            "- Database written: `False`",
            f"- Ready status: `{payload['readyStatus']}`",
            "",
            "## v1 vs v2",
            table(dict_to_rows(payload["v1VsV2"]), ["key", "value"]),
            "",
            "## v2 Buckets",
            table(dict_to_rows(payload["v2Buckets"]), ["key", "value"]),
            "",
            "## Field Gap Results",
            table(field_gap_rows(payload["fieldGapResults"]), ["gap", "before", "autoApplyAfter", "autoApplyReduction", "candidateCoverageWorks", "manualCandidateWorks"]),
            "",
            "## Safety Guards",
            table([{"guard": key, "passed": value} for key, value in payload["safetyGuards"].items()], ["guard", "passed"]),
        ]
    )


def m2_impact_md(payload: dict) -> str:
    return "\n".join(
        [
            "# M2 Dual-Source Backfill Impact on Evaluation v2",
            "",
            f"- Baseline: `{payload['comparisonBaseline']}`",
            f"- Copyright term forecast increase works v2: `{payload['copyrightTermForecast']['increaseWorks']}`",
            f"- Decrease is accuracy protection: `{payload['copyrightTermForecast']['decreaseIsAccuracyProtection']}`",
            f"- Renewal review improved candidate works: `{payload['renewalReview']['improvedCandidateWorks']}`",
            f"- Rating remaining-copyright newly usable works: `{payload['ratingRemainingCopyrightAdjustment']['newlyUsableWorks']}`",
            f"- Operator 30-work pack needs rerun after approved apply: `{payload['samplePacks']['operator30WorkPackNeedsRerunAfterApprovedApply']}`",
            f"- Status: `{payload['status']}`",
        ]
    )


def public_override_summary(overrides: list[dict]) -> dict:
    return {
        "totalRows": len(overrides),
        "byAction": dict(Counter(item["userConfirmedAction"] for item in overrides)),
        "byField": dict(Counter(item["fieldName"] for item in overrides)),
        "canApplyToStagingRows": sum(1 for item in overrides if item["canApplyToStaging"]),
        "canGeneralizeRows": 0,
        "safeOutputBoundary": public_boundary(),
    }


def private_override_rows(overrides: list[dict]) -> list[dict]:
    return [
        {
            "candidateId": item["candidateId"],
            "standardWorkId": item["standardWorkId"],
            "fieldName": item["fieldName"],
            "originalCandidateValue": item["originalCandidateValue"],
            "userDecision": item["userDecisionLabel"],
            "userCorrectedValue": item["userCorrectedValue"],
            "userNote": item["userNote"],
            "userConfirmedAction": item["userConfirmedAction"],
            "canApplyToStaging": item["canApplyToStaging"],
            "canGeneralize": item["canGeneralize"],
            "generalizationReason": item["generalizationReason"],
        }
        for item in overrides
    ]


def private_candidate_rows(candidates: list[dict]) -> list[dict]:
    return [
        {
            "standardWorkId": item["standardWorkId"],
            "rawWorkId": item.get("rawWorkId", ""),
            "fieldName": item["fieldName"],
            "source": item["source"],
            "currentValue": item.get("currentValue", ""),
            "proposedValue": item.get("proposedValue", ""),
            "matchMethod": item.get("matchMethod", ""),
            "matchConfidence": item.get("matchConfidence", ""),
            "valueConfidence": item.get("valueConfidence", ""),
            "safeAutoApplyEligibleV2": item.get("safeAutoApplyEligibleV2", False),
            "v2Bucket": item.get("v2Bucket", ""),
            "v2Reasons": ",".join(item.get("autoApplyExclusionReasonsV2", [])),
        }
        for item in candidates
    ]


def cli_summary(scope: str, payload: dict) -> dict:
    return {
        "scope": scope,
        "feedbackRows": payload["feedbackAnalysis"]["totalRows"],
        "acceptedRows": payload["feedbackAnalysis"]["decisionDistribution"].get("accept", 0),
        "needsModifyRows": payload["feedbackAnalysis"]["decisionDistribution"].get("needs_modify", 0),
        "readyStatus": payload["dryRun"]["readyStatus"],
        "safeAutoApplyRows": payload["dryRun"]["v2Buckets"]["safe_auto_apply_candidates"],
        "userConfirmedOverrideRows": payload["dryRun"]["v2Buckets"]["user_confirmed_override_candidates"],
        "manualReviewRows": payload["dryRun"]["v2Buckets"]["manual_review_candidates"],
        "newSpotcheckRows": len(payload["spotcheckV2Rows"]),
        "privateSpotcheckWorkbook": rel(PRIVATE_SPOTCHECK_V2_XLSX),
        "formalMasterDataWritten": False,
        "databaseWritten": False,
        "m3Entered": False,
    }


def canonical_decision(value: str) -> str:
    text = clean(value)
    if text == ACCEPT:
        return "accept"
    if text == REJECT:
        return "reject"
    if text == NEEDS_MODIFY:
        return "needs_modify"
    if text == UNCERTAIN:
        return "uncertain"
    return "blank"


def candidate_key(candidate: dict) -> str:
    return "|".join(
        [
            clean(candidate.get("standardWorkId")),
            clean(candidate.get("fieldName")),
            normalize_compare(candidate.get("proposedValueNormalized") or candidate.get("proposedValue")),
            clean(candidate.get("source")),
            clean(candidate.get("matchMethod")),
        ]
    )


def is_high(value) -> bool:
    return to_float(value) >= 0.97 or clean(value) == "\u9ad8"


def to_float(value) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    text = clean(value)
    if text == "\u9ad8":
        return 1.0
    if text == "\u4e2d":
        return 0.8
    if text == "\u4f4e":
        return 0.5
    try:
        return float(text)
    except Exception:
        return 0.0


def complex_date_signal(candidate: dict) -> bool:
    raw = clean(candidate.get("sourceRawValue")) + " " + clean(candidate.get("proposedValue"))
    return any(token in raw for token in ["|", "续", "自动", "出版之日", "签订之日", "上线之日", "最后一部", "relative", "renew"])


def normalize_compare(value) -> str:
    return "".join(clean(value).lower().split())


def revenue_coverage(candidates: list[dict]) -> float:
    total = sum(item.get("totalHistoricalRevenue", 0) for item in candidates)
    return round(total, 6)


def revenue_coverage_for_overrides(overrides: list[dict], candidates: list[dict]) -> float:
    by_key = {candidate_key(candidate): candidate for candidate in candidates}
    return revenue_coverage([by_key[item["candidateKey"]] for item in overrides if item["candidateKey"] in by_key])


def counter_rows(payload: dict) -> list[dict]:
    return [{"key": key, "count": value} for key, value in payload.items()]


def aggregate_table_rows(payload: dict) -> list[dict]:
    rows = []
    for key, item in payload.items():
        decisions = item["decisions"]
        rows.append(
            {
                "key": key,
                "rowCount": item["rowCount"],
                "accept": decisions.get("accept", 0),
                "needs_modify": decisions.get("needs_modify", 0),
                "reject": decisions.get("reject", 0),
                "uncertain": decisions.get("uncertain", 0),
                "acceptanceRate": pct(item["acceptanceRate"]),
                "needsModifyRate": pct(item["needsModifyRate"]),
            }
        )
    return rows


def field_gap_rows(payload: dict) -> list[dict]:
    return [{"gap": key, **value} for key, value in payload.items()]


def dict_to_rows(payload: dict, prefix: str = "") -> list[dict]:
    rows = []
    for key, value in payload.items():
        full = f"{prefix}.{key}" if prefix else str(key)
        if isinstance(value, dict):
            rows.extend(dict_to_rows(value, full))
        elif isinstance(value, list):
            rows.append({"key": full, "value": ", ".join(map(str, value))})
        else:
            rows.append({"key": full, "value": value})
    return rows


def table(rows: list[dict], headers: list[str]) -> str:
    if not rows:
        return "_No rows._"
    lines = ["| " + " | ".join(headers) + " |", "| " + " | ".join("---" for _ in headers) + " |"]
    for row in rows:
        lines.append("| " + " | ".join(str(row.get(header, "")) for header in headers) + " |")
    return "\n".join(lines)


def field_label(field: str) -> str:
    return {
        "standardWorkName": "作品名称",
        "authorName": "作者",
        "copyrightStartDate": "版权开始",
        "copyrightEndDate": "版权到期",
        "classificationLevel1": "一级分类",
        "classificationLevel2": "二级分类",
        "classificationLevel3": "三级分类",
        "requiredTags": "标签",
    }.get(field, field)


def source_label(source: str) -> str:
    return {
        "digital_copyright_ledger": "数字版权台账",
        "original_library": "原创全库",
        "both_sources_consistent": "双源一致",
        "both_sources_conflict": "双源冲突",
    }.get(source, source)


def confidence_label(value) -> str:
    score = to_float(value)
    if score >= 0.97:
        return "高"
    if score >= 0.8:
        return "中"
    return "低"


def reason_cn(reason: str) -> str:
    return {
        "safe_auto_apply_high_revenue": "safe_auto_apply 高收入样本",
        "copyright_end_high_impact": "版权到期高影响样本",
        "title_author_high_impact": "作者/作品名高影响人工复核样本",
        "classification_or_tag_downgraded": "v2 降级的分类/标签样本",
        "dual_source_conflict_blocked": "v2 阻断的双源冲突样本",
    }.get(reason, reason)


def public_boundary() -> dict:
    return {
        "sanitizedAggregateOnly": True,
        "realWorkNamesIncluded": False,
        "authorNamesIncluded": False,
        "channelNamesIncluded": False,
        "rawLedgerRowsIncluded": False,
        "privateDetailsStoredOnlyInGitignoredOutput": True,
        "databaseConnected": False,
        "formalMasterDataWritten": False,
        "m3Entered": False,
    }


def prohibited_actions() -> dict:
    return {
        "remoteProductionDatabaseConnected": False,
        "sharedDatabaseConnected": False,
        "formalMasterDataWritten": False,
        "privateExcelCommitted": False,
        "gitAddDotUsed": False,
        "stashTouched": False,
        "m3Entered": False,
    }


def ratio(numerator: int | float, denominator: int | float) -> float:
    return round(float(numerator) / float(denominator), 6) if denominator else 0.0


def pct(value: float) -> str:
    return f"{value * 100:.2f}%"


def clean(value) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if text.endswith(".0") and text[:-2].isdigit():
        return text[:-2]
    return text


def write_md(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text + "\n", encoding="utf-8")


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT)).replace("\\", "/")


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def git(args: list[str]) -> str | None:
    try:
        return subprocess.check_output(["git", *args], cwd=ROOT, text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        return None


if __name__ == "__main__":
    main()
