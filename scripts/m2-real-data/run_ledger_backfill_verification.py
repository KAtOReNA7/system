from __future__ import annotations

import argparse
import importlib.util
import json
import math
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT_SCRIPT = ROOT / "scripts" / "m2-real-data" / "run_copyright_ledger_masterdata_audit.py"
OUTPUT_M1 = ROOT / "docs" / "analysis" / "m1-master-data"
OUTPUT_M2 = ROOT / "docs" / "analysis" / "m2-real-data"
PRIVATE_DIR = ROOT / "data" / "private-output" / "m1-master-data"

COUNT_MD = OUTPUT_M1 / "M1-ledger-backfill-count-methodology-audit-v1.md"
COUNT_JSON = OUTPUT_M1 / "M1-ledger-backfill-count-methodology-audit-v1.json"
WORK_MD = OUTPUT_M1 / "M1-ledger-backfill-work-centric-match-audit-v1.md"
WORK_JSON = OUTPUT_M1 / "M1-ledger-backfill-work-centric-match-audit-v1.json"
AUTO_MD = OUTPUT_M1 / "M1-ledger-backfill-auto-apply-rule-v1.md"
AUTO_JSON = OUTPUT_M1 / "M1-ledger-backfill-auto-apply-rule-v1.json"
VERIFY_MD = OUTPUT_M1 / "M1-ledger-backfill-verification-summary-v1.md"
VERIFY_JSON = OUTPUT_M1 / "M1-ledger-backfill-verification-summary-v1.json"
DRY_RUN_MD = OUTPUT_M1 / "M1-ledger-backfill-dry-run-result-v1.md"
DRY_RUN_JSON = OUTPUT_M1 / "M1-ledger-backfill-dry-run-result-v1.json"
WORKLOAD_MD = OUTPUT_M1 / "M1-ledger-backfill-manual-workload-reduction-v1.md"
WORKLOAD_JSON = OUTPUT_M1 / "M1-ledger-backfill-manual-workload-reduction-v1.json"
M2_IMPACT_MD = OUTPUT_M2 / "M2-ledger-backfill-dry-run-forecast-output-impact-v1.md"
M2_IMPACT_JSON = OUTPUT_M2 / "M2-ledger-backfill-dry-run-forecast-output-impact-v1.json"

PRIVATE_DRY_RUN_JSON = PRIVATE_DIR / "M1-ledger-backfill-dry-run-result.json"

FIELD_TO_GAP = {
    "standardWorkName": "missingWorkName",
    "authorName": "missingAuthor",
    "copyrightStartDate": "missingCopyrightStart",
    "copyrightEndDate": "missingCopyrightEnd",
    "publisherName": "missingPublisher",
    "classificationLevel1": "missingClassification1",
    "classificationLevel2": "missingClassification2",
    "classificationLevel3": "missingClassification3",
    "audioRightsStatus": "missingAudioRights",
    "firstPublicationDate": "missingFirstPublicationDate",
}

FIELD_CN = {
    "standardWorkName": "标准作品名称",
    "authorName": "作者",
    "copyrightStartDate": "版权开始日期",
    "copyrightEndDate": "版权到期日期",
    "publisherName": "出版社",
    "classificationLevel1": "一级分类",
    "classificationLevel2": "二级分类",
    "classificationLevel3": "三级分类",
    "audioRightsStatus": "有声权利状态",
    "firstPublicationDate": "首发/出版日期",
}

STRICT_METHODS = {"exact_work_id", "mapping_work_id"}
DATE_FIELDS = {"copyrightStartDate", "copyrightEndDate", "firstPublicationDate"}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scope", choices=["all", "verify", "dry-run", "m2-impact"], default="all")
    args = parser.parse_args()

    payload = build_payload()
    write_outputs(payload)
    print(
        json.dumps(
            {
                "scope": args.scope,
                "standardWorkIdCount": payload["countMethodology"]["standardWorkIdCount"],
                "candidateRows": payload["countMethodology"]["candidateRows"],
                "strictAutoFieldCandidates": payload["autoApplyRule"]["automaticFieldCandidates"],
                "strictAutoStandardWorks": payload["autoApplyRule"]["automaticStandardWorks"],
                "manualReductionRatio": payload["manualWorkloadReduction"]["manualReductionRatio"],
                "privateDryRunJson": str(PRIVATE_DRY_RUN_JSON.relative_to(ROOT)),
            },
            ensure_ascii=False,
        )
    )


def load_audit_module():
    spec = importlib.util.spec_from_file_location("copyright_ledger_masterdata_audit", AUDIT_SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def build_payload() -> dict:
    audit = load_audit_module()
    context = audit.build_context()
    work_index = audit.build_work_index(context)
    parsed_rows = []
    candidate_seed = []
    for row in context["ledger"]["rows"]:
        parsed = audit.parse_ledger_row(row)
        match = audit.match_ledger_row(parsed, work_index)
        parsed = {**parsed, "match": match}
        parsed_rows.append(parsed)
        if match["matchedStandardWorkId"]:
            candidate_seed.extend(audit.build_candidates_for_row(parsed, context, work_index))
    candidates = audit.apply_conflicts(candidate_seed)
    enriched_candidates = [enrich_strict_candidate(candidate) for candidate in candidates]

    ledger_structure = audit.build_structure_audit(context["ledger"])
    matching_summary = audit.build_matching_summary(parsed_rows, work_index)
    gap_summary = audit.build_gap_summary(context, enriched_candidates, work_index)
    category_summary = audit.build_category_author_rights_summary(context, enriched_candidates, parsed_rows)
    base_m2_impact = audit.build_m2_impact(context, enriched_candidates, work_index)

    revenue_ranks = build_revenue_ranks(context["workSummary"])
    count_methodology = build_count_methodology(context, matching_summary, enriched_candidates, work_index)
    work_centric = build_work_centric_audit(enriched_candidates, work_index, revenue_ranks, matching_summary)
    auto_apply_rule = build_auto_apply_rule(enriched_candidates, work_index)
    dry_run = build_dry_run(gap_summary, enriched_candidates, work_index, revenue_ranks)
    m2_impact = build_m2_dry_run_impact(context, dry_run, auto_apply_rule, base_m2_impact)
    workload = build_manual_workload_reduction(gap_summary, auto_apply_rule, dry_run, enriched_candidates)
    sample = build_verification_sample(enriched_candidates, parsed_rows, work_index, revenue_ranks)
    verification = build_verification_summary(sample, count_methodology, work_centric, auto_apply_rule, dry_run, m2_impact, workload)

    generated_at = utc_now()
    safety = sanitized_boundary(context)
    return {
        "schema": "m1.m2.ledger_backfill_verification.v1",
        "generatedAt": generated_at,
        "currentHead": context["currentHead"],
        "originMain": context["originMain"],
        "sanitizedBoundary": safety,
        "ledgerStructure": ledger_structure,
        "matchingSummary": matching_summary,
        "candidateSummary": audit.summarize_candidates(enriched_candidates),
        "gapSummary": gap_summary,
        "categoryAuthorRightsSummary": category_summary,
        "countMethodology": count_methodology,
        "workCentricMatchAudit": work_centric,
        "autoApplyRule": auto_apply_rule,
        "dryRunResult": dry_run,
        "m2DryRunImpact": m2_impact,
        "manualWorkloadReduction": workload,
        "verificationSummary": verification,
        "privatePayload": {
            "schema": "m1.m2.ledger_backfill_private_dry_run.v1",
            "generatedAt": generated_at,
            "currentHead": context["currentHead"],
            "originMain": context["originMain"],
            "safetyBoundary": {
                "containsRealWorkIds": True,
                "containsRealTitlesAuthorsLedgerSnippets": True,
                "gitignoredPrivateOutput": True,
                "databaseConnected": False,
                "dockerExecuted": False,
                "formalMasterDataWritten": False,
                "m3Entered": False,
            },
            "countMethodology": count_methodology,
            "workCentricMatchAudit": work_centric,
            "autoApplyRule": auto_apply_rule,
            "dryRunResult": dry_run,
            "m2DryRunImpact": m2_impact,
            "manualWorkloadReduction": workload,
            "verificationSummary": verification,
            "verificationSampleRows": sample["rows"],
            "verifiedCandidateRows": build_verified_candidate_rows(enriched_candidates, work_index, revenue_ranks),
        },
    }


def build_count_methodology(context: dict, matching_summary: dict, candidates: list[dict], work_index: dict) -> dict:
    raw_work_ids = {
        normalize_id(row.get("rawWorkId") or row.get("我方作品ID"))
        for row in context["bill"]
        if normalize_id(row.get("rawWorkId") or row.get("我方作品ID"))
    }
    business_form_rows = {
        (normalize_id(row.get("standardWorkId")), row.get("businessForm") or "unknown")
        for row in context["bill"]
        if normalize_id(row.get("standardWorkId"))
    }
    field_candidate_count = len(candidates)
    return {
        "standardWorkIdCount": len(work_index["standardIds"]),
        "rawWorkIdCount": len(raw_work_ids),
        "businessFormRows": len(business_form_rows),
        "basicInfoGapViewRows": len(context["opsBasic"]),
        "matchedLedgerRows": matching_summary["matchedLedgerRows"],
        "candidateRows": field_candidate_count,
        "fieldCandidateRows": field_candidate_count,
        "candidateStandardWorks": len({item["standardWorkId"] for item in candidates if item.get("standardWorkId")}),
        "whyGapCanExceedStandardWorkCount": [
            "standard_work_id 口径统计唯一标准作品；basic info gap view 来自运营确认/补全视图，可能包含历史 ID、业务形态或补全视图行。",
            "candidate row 与 field candidate 均按字段候选计数，同一标准作品可同时产生名称、作者、版权起止、出版社、分类、权利等多个候选。",
            "后续评估补全效果必须同时报告 standard_work_id、candidate row 和 field candidate 口径，不能混用单一总数。",
        ],
        "authoritativeEvaluationObject": "standard_work_id",
        "mixedCountingDisallowed": True,
    }


def build_work_centric_audit(candidates: list[dict], work_index: dict, revenue_ranks: dict, matching_summary: dict) -> dict:
    by_standard = defaultdict(list)
    for item in candidates:
        by_standard[item["standardWorkId"]].append(item)
    all_standards = set(work_index["standardIds"])
    method_counts = Counter()
    for standard in all_standards.intersection(by_standard):
        for method in {item["matchMethod"] for item in by_standard[standard]}:
            method_counts[method] += 1
    matched_standards = set(by_standard)
    no_match = len(all_standards - matched_standards)
    conflict_standards = {item["standardWorkId"] for item in candidates if item["conflictStatus"] != "none"}
    strict_auto_standards = {item["standardWorkId"] for item in candidates if item["strictAutoApplyEligible"]}

    total_revenue = total_revenue_for(all_standards, work_index)
    revenue = {
        "matchedRevenueShare": safe_ratio(total_revenue_for(matched_standards, work_index), total_revenue),
        "unmatchedRevenueShare": safe_ratio(total_revenue_for(all_standards - matched_standards, work_index), total_revenue),
        "highConfidenceBackfillableRevenueShare": safe_ratio(total_revenue_for(strict_auto_standards, work_index), total_revenue),
        "conflictRevenueShare": safe_ratio(total_revenue_for(conflict_standards, work_index), total_revenue),
    }
    top_rows = []
    for label, standards in revenue_ranks["groups"].items():
        matched = standards.intersection(matched_standards)
        top_rows.append(
            {
                "bucket": label,
                "standardWorkCount": len(standards),
                "matched": len(matched),
                "unmatched": len(standards - matched_standards),
                "highConfidenceBackfillable": len(standards.intersection(strict_auto_standards)),
                "conflict": len(standards.intersection(conflict_standards)),
            }
        )
    return {
        "totalStandardWorks": len(all_standards),
        "exactIdMatched": method_counts.get("exact_work_id", 0),
        "mappingIdMatched": method_counts.get("mapping_work_id", 0),
        "titleAuthorExactMatched": method_counts.get("title_author_exact", 0),
        "titleAuthorFuzzyMatched": method_counts.get("title_author_fuzzy", 0),
        "noLedgerMatch": no_match,
        "conflictStandardWorks": len(conflict_standards),
        "revenueShares": revenue,
        "topRevenueCoverage": top_rows,
        "ledgerUnmatchedExplanation": {
            "ledgerRows": matching_summary["ledgerRows"],
            "unmatchedLedgerRows": matching_summary["unmatchedLedgerRows"],
            "mainReason": "台账 12033 行覆盖合同/版权台账全量范围，明显大于当前 M2 评估标准作品集合；因此 ledger-row unmatched 不能直接等价为 M2 作品未覆盖。",
            "needsMatchStrategyEnhancement": any(row["unmatched"] > 0 for row in top_rows),
        },
    }


def enrich_strict_candidate(candidate: dict) -> dict:
    reasons = []
    match_confidence = confidence_score(candidate.get("matchConfidence"))
    value_confidence = confidence_score(candidate.get("valueConfidence"))
    match_method = candidate.get("matchMethod")
    field = candidate.get("fieldName")
    proposed = stringify(candidate.get("proposedValueNormalized") or candidate.get("proposedValue"))
    raw = stringify(candidate.get("sourceRawValue"))

    if not (match_method in STRICT_METHODS or (match_method == "title_author_exact" and match_confidence >= 0.98)):
        reasons.append("match_method_or_confidence_not_strict")
    if value_confidence < 0.95:
        reasons.append("value_confidence_below_0_95")
    if candidate.get("conflictStatus") and candidate.get("conflictStatus") != "none":
        reasons.append("conflict_status_not_none")
    if candidate.get("requiresManualReview") is True:
        reasons.append("requires_manual_review")
    if field == "classificationLevel3":
        reasons.append("classification_level3_never_auto_apply")
    if date_pending_anchor(field, proposed, raw, candidate.get("parserStatus")):
        reasons.append("date_pending_anchor")
    if perpetual_or_infinite(field, proposed, raw):
        reasons.append("perpetual_or_infinite_requires_business_confirmation")
    if automatic_renewal(field, raw):
        reasons.append("automatic_renewal_not_auto_extended")
    if field == "audioRightsStatus" and "limited_or_conflict" in proposed:
        reasons.append("audio_rights_limited_or_conflict")

    enriched = dict(candidate)
    enriched["strictAutoApplyEligible"] = len(reasons) == 0
    enriched["strictAutoExclusionReasons"] = reasons
    enriched["strictRecommendedBucket"] = "auto_apply" if not reasons else strict_bucket(candidate, reasons)
    return enriched


def build_auto_apply_rule(candidates: list[dict], work_index: dict) -> dict:
    auto = [item for item in candidates if item["strictAutoApplyEligible"]]
    auto_standards = {item["standardWorkId"] for item in auto}
    total_revenue = total_revenue_for(work_index["standardIds"], work_index)
    return {
        "ruleVersion": "strict-auto-apply-v1",
        "automaticFieldCandidates": len(auto),
        "automaticStandardWorks": len(auto_standards),
        "automaticRevenueCoverage": safe_ratio(total_revenue_for(auto_standards, work_index), total_revenue),
        "byField": dict(Counter(item["fieldName"] for item in auto)),
        "byFieldStandardWorks": {
            field: len({item["standardWorkId"] for item in auto if item["fieldName"] == field})
            for field in sorted({item["fieldName"] for item in auto})
        },
        "exclusionReasons": dict(Counter(reason for item in candidates for reason in item["strictAutoExclusionReasons"])),
        "recommendedBucket": dict(Counter(item["strictRecommendedBucket"] for item in candidates)),
        "mediumAndFuzzyAutoApplyAllowed": False,
        "formalMasterDataWritten": False,
        "ruleText": [
            "exact_work_id / mapping_work_id 可进入自动应用候选；title_author_exact 仅在匹配置信度 >= 0.98 时可进入。",
            "valueConfidence 必须 >= 0.95，且 conflictStatus=none、requiresManualReview=false。",
            "classificationLevel3、相对期限锚点、无限期、自动续约、limited_or_conflict 有声权利均不得自动应用。",
        ],
    }


def build_dry_run(gap_summary: dict, candidates: list[dict], work_index: dict, revenue_ranks: dict) -> dict:
    before = dict(gap_summary["currentGapCounts"])
    auto = [item for item in candidates if item["strictAutoApplyEligible"]]
    auto_by_field = defaultdict(set)
    for item in auto:
        auto_by_field[item["fieldName"]].add(item["standardWorkId"])
    field_rows = []
    for candidate_field, gap_field in FIELD_TO_GAP.items():
        before_count = int(before.get(gap_field, 0))
        reduction = min(before_count, len(auto_by_field.get(candidate_field, set())))
        field_rows.append(
            {
                "field": gap_field,
                "candidateField": candidate_field,
                "fieldCn": FIELD_CN.get(candidate_field, candidate_field),
                "before": before_count,
                "after": max(0, before_count - reduction),
                "reduction": reduction,
            }
        )
    top_rows = []
    for label, standards in revenue_ranks["groups"].items():
        bucket_auto = [item for item in auto if item["standardWorkId"] in standards]
        top_rows.append(
            {
                "bucket": label,
                "autoFieldCandidates": len(bucket_auto),
                "autoStandardWorks": len({item["standardWorkId"] for item in bucket_auto}),
                "copyrightEndReductions": len({item["standardWorkId"] for item in bucket_auto if item["fieldName"] == "copyrightEndDate"}),
                "manualReviewRemainingCandidates": sum(
                    1 for item in candidates if item["standardWorkId"] in standards and not item["strictAutoApplyEligible"]
                ),
            }
        )
    automatic_candidate_rows = len(auto)
    remaining_manual = len(candidates) - automatic_candidate_rows
    return {
        "mode": "file-level-dry-run",
        "databaseConnected": False,
        "dockerExecuted": False,
        "formalMasterDataWritten": False,
        "fieldGapBeforeAfter": field_rows,
        "automaticCandidateRows": automatic_candidate_rows,
        "automaticStandardWorks": len({item["standardWorkId"] for item in auto}),
        "remainingManualCandidateRows": remaining_manual,
        "nonAutoReasonGroups": dict(Counter(item["strictRecommendedBucket"] for item in candidates if not item["strictAutoApplyEligible"])),
        "topRevenueBeforeAfter": top_rows,
        "cannotAutoApplyFields": [
            "中置信建议补全",
            "低置信补全",
            "冲突候选",
            "需要出版日期锚点的相对期限",
            "需要业务确认的无限期/自动续约",
            "分类三级",
            "limited_or_conflict 有声权利",
        ],
    }


def build_m2_dry_run_impact(context: dict, dry_run: dict, auto_rule: dict, base_m2_impact: dict) -> dict:
    before = forecast_output_type_proxy(context["workSummary"])
    copyright_end_reduction = field_reduction(dry_run, "missingCopyrightEnd")
    conflict_reduction = min(before["copyright_conflict_manual_review"], auto_rule["automaticStandardWorks"])
    after = {
        "copyright_term_forecast": before["copyright_term_forecast"] + copyright_end_reduction,
        "operating_window_forecast_pending_expiry": max(
            0, before["operating_window_forecast_pending_expiry"] - copyright_end_reduction
        ),
        "relative_expiry_pending_anchor": before["relative_expiry_pending_anchor"],
        "copyright_conflict_manual_review": max(0, before["copyright_conflict_manual_review"] - conflict_reduction),
        "no_numeric_forecast": before["no_numeric_forecast"],
    }
    return {
        "methodology": "file-level forecastOutputType proxy; not a formal DB evaluation result",
        "before": before,
        "after": after,
        "delta": {key: after[key] - before[key] for key in before},
        "transitions": {
            "operatingWindowPendingExpiryToCopyrightTermForecast": copyright_end_reduction,
            "renewalReviewBecameReviewable": copyright_end_reduction,
            "ratingRemainingCopyrightAdjustmentEnabled": copyright_end_reduction,
            "manualReviewCanReduceByStrictAutoCandidates": field_reduction(dry_run, "missingCopyrightStart") + copyright_end_reduction,
        },
        "rerunRecommendations": {
            "rerun30WorkOperatorPack": copyright_end_reduction > 0,
            "rerun20YearSample": copyright_end_reduction > 0,
            "rerunV11ForecastabilityGate": copyright_end_reduction > 0,
            "rerunBusinessReviewSampleSelection": copyright_end_reduction > 0,
        },
        "previousBroadImpactReference": base_m2_impact,
        "formalCompleteAllowed": False,
        "notM3": True,
    }


def build_manual_workload_reduction(gap_summary: dict, auto_rule: dict, dry_run: dict, candidates: list[dict]) -> dict:
    original_gap_total = sum(int(value) for value in gap_summary["currentGapCounts"].values())
    auto_reduction = sum(row["reduction"] for row in dry_run["fieldGapBeforeAfter"])
    medium_quick_review = sum(1 for item in candidates if item["strictRecommendedBucket"] == "suggested_quick_review")
    low_or_conflict = sum(
        1 for item in candidates if item["strictRecommendedBucket"] in {"manual_review", "conflict_manual_review", "date_manual_review"}
    )
    return {
        "originalManualGapTotal": original_gap_total,
        "afterStrictAutoApplyManualGapTotal": max(0, original_gap_total - auto_reduction),
        "autoApplyGapReduction": auto_reduction,
        "mediumQuickReviewCandidateCount": medium_quick_review,
        "lowOrConflictManualCandidateCount": low_or_conflict,
        "manualReductionRatio": safe_ratio(auto_reduction, original_gap_total),
        "fieldsStillManual": [
            "分类三级",
            "多作者冲突",
            "相对期限缺出版日期锚点",
            "多日期冲突",
            "权利冲突",
        ],
        "suggestedReviewOrder": [
            "高收入作品",
            "版权到期",
            "作者",
            "有声权利",
            "分类一级/二级",
            "分类三级",
        ],
        "automaticFieldCandidates": auto_rule["automaticFieldCandidates"],
    }


def build_verification_summary(
    sample: dict,
    count_methodology: dict,
    work_centric: dict,
    auto_rule: dict,
    dry_run: dict,
    m2_impact: dict,
    workload: dict,
) -> dict:
    return {
        "candidateVerificationCompleted": True,
        "verificationSampleWorkbookRequired": True,
        "sampleRows": sample["sampleRows"],
        "highConfidenceSampleRows": sample["highConfidenceSampleRows"],
        "fieldCoverage": sample["fieldCoverage"],
        "matchMethodCoverage": sample["matchMethodCoverage"],
        "revenueTierCoverage": sample["revenueTierCoverage"],
        "dateParseTypeCoverage": sample["dateParseTypeCoverage"],
        "conflictCoverage": sample["conflictCoverage"],
        "expectedAccuracyStatement": "机器规则只能给出严格一致性校验和高置信优先级，最终准确率仍需用户在 private 样本包中人工验证。",
        "countMethodologyCorrected": True,
        "workCentricCoverageCompleted": True,
        "strictAutoApplyRuleCompleted": True,
        "dryRunCompleted": True,
        "m2ImpactRecalculated": True,
        "canEnterUserConfirmationHighConfidenceBackfill": auto_rule["automaticFieldCandidates"] > 0,
        "notM3": True,
        "headline": {
            "standardWorkIdCount": count_methodology["standardWorkIdCount"],
            "candidateRows": count_methodology["candidateRows"],
            "matchedStandardWorks": work_centric["totalStandardWorks"] - work_centric["noLedgerMatch"],
            "strictAutoFieldCandidates": auto_rule["automaticFieldCandidates"],
            "strictAutoStandardWorks": auto_rule["automaticStandardWorks"],
            "manualReductionRatio": workload["manualReductionRatio"],
            "forecastCopyrightTermIncrease": m2_impact["transitions"]["operatingWindowPendingExpiryToCopyrightTermForecast"],
        },
    }


def build_verification_sample(candidates: list[dict], parsed_rows: list[dict], work_index: dict, revenue_ranks: dict) -> dict:
    title_by_standard, author_by_standard = display_maps(candidates)
    selected = []
    seen = set()

    high = [item for item in candidates if item["valueConfidence"] == "high"]
    for item in sorted(high, key=sample_sort_key):
        add_sample_row(selected, seen, item, title_by_standard, author_by_standard, work_index, revenue_ranks, "高置信抽样")
        if len([row for row in selected if row["样本类型"] == "高置信抽样"]) >= 220:
            break

    for field in [
        "standardWorkName",
        "authorName",
        "copyrightStartDate",
        "copyrightEndDate",
        "firstPublicationDate",
        "publisherName",
        "audioRightsStatus",
        "classificationLevel1",
        "classificationLevel2",
    ]:
        add_first_matching(selected, seen, candidates, title_by_standard, author_by_standard, work_index, revenue_ranks, "字段覆盖", fieldName=field)
    for method in ["exact_work_id", "mapping_work_id", "title_author_exact", "title_author_fuzzy"]:
        add_first_matching(selected, seen, candidates, title_by_standard, author_by_standard, work_index, revenue_ranks, "匹配方法覆盖", matchMethod=method)
    for tier in ["top 1%", "top 5%", "top 10%", "middle", "low"]:
        add_first_matching(selected, seen, candidates, title_by_standard, author_by_standard, work_index, revenue_ranks, "收入分层覆盖", revenueTier=tier)
    for conflict in ["none", "conflict"]:
        add_first_matching(selected, seen, candidates, title_by_standard, author_by_standard, work_index, revenue_ranks, "冲突覆盖", conflictStatus=conflict)

    date_coverage = build_date_coverage_rows(parsed_rows, title_by_standard, author_by_standard, work_index, revenue_ranks)
    for row in date_coverage:
        key = ("date", row["标准作品ID"], row["日期解析类型"], row["来源字段"], row["台账原文摘要"])
        if key not in seen:
            seen.add(key)
            selected.append(row)

    return {
        "sampleRows": len(selected),
        "highConfidenceSampleRows": sum(1 for row in selected if row["样本类型"] == "高置信抽样"),
        "fieldCoverage": dict(Counter(row["候选字段"] for row in selected if row.get("候选字段"))),
        "matchMethodCoverage": dict(Counter(row["匹配方法"] for row in selected if row.get("匹配方法"))),
        "revenueTierCoverage": dict(Counter(row["收入分层"] for row in selected if row.get("收入分层"))),
        "dateParseTypeCoverage": dict(Counter(row["日期解析类型"] for row in selected if row.get("日期解析类型"))),
        "conflictCoverage": dict(Counter(row["冲突状态"] for row in selected if row.get("冲突状态"))),
        "rows": selected,
    }


def add_first_matching(selected, seen, candidates, title_by_standard, author_by_standard, work_index, revenue_ranks, sample_type, **criteria):
    for item in candidates:
        if criteria.get("fieldName") and item["fieldName"] != criteria["fieldName"]:
            continue
        if criteria.get("matchMethod") and item["matchMethod"] != criteria["matchMethod"]:
            continue
        if criteria.get("conflictStatus") and item["conflictStatus"] != criteria["conflictStatus"]:
            continue
        if criteria.get("revenueTier") and revenue_tier(item["standardWorkId"], revenue_ranks) != criteria["revenueTier"]:
            continue
        if add_sample_row(selected, seen, item, title_by_standard, author_by_standard, work_index, revenue_ranks, sample_type):
            return


def add_sample_row(selected, seen, item, title_by_standard, author_by_standard, work_index, revenue_ranks, sample_type):
    key = (item["standardWorkId"], item["fieldName"], item["ledgerRowIds"][0] if item.get("ledgerRowIds") else "")
    if key in seen:
        return False
    seen.add(key)
    selected.append(candidate_to_sample_row(item, title_by_standard, author_by_standard, work_index, revenue_ranks, sample_type))
    return True


def candidate_to_sample_row(item, title_by_standard, author_by_standard, work_index, revenue_ranks, sample_type):
    standard = item.get("standardWorkId")
    return {
        "样本类型": sample_type,
        "标准作品ID": standard,
        "作品名": title_by_standard.get(standard, ""),
        "作者": author_by_standard.get(standard, ""),
        "候选字段": item.get("fieldName"),
        "当前值": item.get("currentValue") or "",
        "候选值": item.get("proposedValue") or "",
        "来源字段": item.get("sourceField") or "",
        "台账原文摘要": item.get("sourceRawValue") or "",
        "匹配方法": item.get("matchMethod") or "",
        "匹配置信度": item.get("matchConfidence") or "",
        "值置信度": item.get("valueConfidence") or "",
        "冲突状态": item.get("conflictStatus") or "none",
        "严格自动应用": "是" if item.get("strictAutoApplyEligible") else "否",
        "严格排除原因": "；".join(item.get("strictAutoExclusionReasons") or []),
        "建议动作": action_cn(item.get("strictRecommendedBucket")),
        "收入分层": revenue_tier(standard, revenue_ranks),
        "日期解析类型": date_parse_type(item),
        "用户验证结果": "",
        "用户备注": "",
    }


def build_date_coverage_rows(parsed_rows, title_by_standard, author_by_standard, work_index, revenue_ranks):
    wanted = ["Excel serial date", "标准日期", "无限期", "相对期限", "多日期文本", "自动续约", "无法解析"]
    rows = []
    seen_types = set()
    for parsed in parsed_rows:
        standard = parsed["match"].get("matchedStandardWorkId") or ""
        for field_name, parsed_date, source_field in [
            ("copyrightStartDate", parsed["signedDate"], "签订日期"),
            ("copyrightEndDate", parsed["expiryDate"], "到期时间/续约前到期日期"),
            ("firstPublicationDate", parsed["firstPublicationDate"], "首发时间/CIP出版时间"),
        ]:
            dtype = date_parse_type_from_parsed(parsed_date)
            if dtype not in wanted or dtype in seen_types:
                continue
            seen_types.add(dtype)
            rows.append(
                {
                    "样本类型": "日期解析覆盖",
                    "标准作品ID": standard or "未命中当前M2标准作品",
                    "作品名": title_by_standard.get(standard, parsed.get("title") or ""),
                    "作者": author_by_standard.get(standard, parsed.get("author") or ""),
                    "候选字段": field_name,
                    "当前值": "",
                    "候选值": parsed_date.get("normalizedDate") or parsed_date.get("expiryType") or "",
                    "来源字段": source_field,
                    "台账原文摘要": parsed_date.get("rawValue") or "",
                    "匹配方法": parsed["match"].get("matchMethod") or "",
                    "匹配置信度": parsed["match"].get("matchConfidence") or "",
                    "值置信度": "需复核" if parsed_date.get("requiresManualReview") else "解析通过",
                    "冲突状态": "none",
                    "严格自动应用": "否" if parsed_date.get("requiresManualReview") or dtype != "标准日期" else "需结合候选规则",
                    "严格排除原因": "日期解析覆盖样本，不直接应用",
                    "建议动作": "人工复核",
                    "收入分层": revenue_tier(standard, revenue_ranks),
                    "日期解析类型": dtype,
                    "用户验证结果": "",
                    "用户备注": "",
                }
            )
            if len(seen_types) == len(wanted):
                return rows
    for dtype in wanted:
        if dtype not in seen_types:
            rows.append(
                {
                    "样本类型": "日期解析覆盖",
                    "标准作品ID": "本轮候选未发现",
                    "作品名": "",
                    "作者": "",
                    "候选字段": "日期字段",
                    "当前值": "",
                    "候选值": "",
                    "来源字段": "",
                    "台账原文摘要": "本轮候选/解析行未发现该类型；保留为口径检查占位",
                    "匹配方法": "",
                    "匹配置信度": "",
                    "值置信度": "",
                    "冲突状态": "none",
                    "严格自动应用": "否",
                    "严格排除原因": "无可应用候选",
                    "建议动作": "无需导入",
                    "收入分层": "",
                    "日期解析类型": dtype,
                    "用户验证结果": "",
                    "用户备注": "",
                }
            )
    return rows


def build_verified_candidate_rows(candidates, work_index, revenue_ranks):
    title_by_standard, author_by_standard = display_maps(candidates)
    rows = []
    for item in candidates:
        rows.append(candidate_to_sample_row(item, title_by_standard, author_by_standard, work_index, revenue_ranks, "候选明细"))
    return rows


def write_outputs(payload: dict) -> None:
    OUTPUT_M1.mkdir(parents=True, exist_ok=True)
    OUTPUT_M2.mkdir(parents=True, exist_ok=True)
    PRIVATE_DIR.mkdir(parents=True, exist_ok=True)

    write_json(COUNT_JSON, public_section(payload, "countMethodology"))
    write_json(WORK_JSON, public_section(payload, "workCentricMatchAudit"))
    write_json(AUTO_JSON, public_section(payload, "autoApplyRule"))
    write_json(VERIFY_JSON, public_section(payload, "verificationSummary"))
    write_json(DRY_RUN_JSON, public_section(payload, "dryRunResult"))
    write_json(WORKLOAD_JSON, public_section(payload, "manualWorkloadReduction"))
    write_json(M2_IMPACT_JSON, public_section(payload, "m2DryRunImpact"))
    write_json(PRIVATE_DRY_RUN_JSON, payload["privatePayload"])

    COUNT_MD.write_text(render_count_md(payload), encoding="utf-8")
    WORK_MD.write_text(render_work_md(payload), encoding="utf-8")
    AUTO_MD.write_text(render_auto_md(payload), encoding="utf-8")
    VERIFY_MD.write_text(render_verify_md(payload), encoding="utf-8")
    DRY_RUN_MD.write_text(render_dry_run_md(payload), encoding="utf-8")
    WORKLOAD_MD.write_text(render_workload_md(payload), encoding="utf-8")
    M2_IMPACT_MD.write_text(render_m2_impact_md(payload), encoding="utf-8")


def public_section(payload: dict, section: str) -> dict:
    return {
        "schema": f"m1.m2.ledger_backfill.{section}.v1",
        "generatedAt": payload["generatedAt"],
        "currentHead": payload["currentHead"],
        "originMain": payload["originMain"],
        "sanitizedBoundary": payload["sanitizedBoundary"],
        section: payload[section],
    }


def render_count_md(payload: dict) -> str:
    data = payload["countMethodology"]
    rows = [
        {"metric": "standard_work_id 数", "value": data["standardWorkIdCount"]},
        {"metric": "raw work id 数", "value": data["rawWorkIdCount"]},
        {"metric": "business form 行数", "value": data["businessFormRows"]},
        {"metric": "basic info gap view 行数", "value": data["basicInfoGapViewRows"]},
        {"metric": "matched ledger rows", "value": data["matchedLedgerRows"]},
        {"metric": "candidate rows", "value": data["candidateRows"]},
        {"metric": "field candidate rows", "value": data["fieldCandidateRows"]},
        {"metric": "candidate standard works", "value": data["candidateStandardWorks"]},
    ]
    return "\n".join(
        [
            "# M1 Ledger Backfill Count Methodology Audit v1",
            "",
            "本报告只包含统计口径说明，不包含真实作品名、作者名、渠道名或台账原文。",
            "",
            markdown_table(rows, [("metric", "口径"), ("value", "数量")]),
            "",
            "## 口径修正结论",
            "- 权威评估对象口径为 `standard_work_id`。",
            "- `candidate row` / `field candidate` 是字段候选口径，同一作品可有多个字段候选。",
            "- 上一轮缺口数可超过 3054，是因为 basic info gap view 与字段候选不是唯一标准作品口径。",
            "- 后续补全效果必须同时给出 standard_work_id、candidate row 和 field candidate 三种口径。",
            "- 禁止继续用混合口径判断补全效果。",
        ]
    )


def render_work_md(payload: dict) -> str:
    data = payload["workCentricMatchAudit"]
    method_rows = [
        {"method": "exact ID matched", "count": data["exactIdMatched"]},
        {"method": "mapping ID matched", "count": data["mappingIdMatched"]},
        {"method": "title_author_exact matched", "count": data["titleAuthorExactMatched"]},
        {"method": "title_author_fuzzy matched", "count": data["titleAuthorFuzzyMatched"]},
        {"method": "no ledger match", "count": data["noLedgerMatch"]},
        {"method": "conflict", "count": data["conflictStandardWorks"]},
    ]
    revenue_rows = [{"metric": key, "value": pct(value)} for key, value in data["revenueShares"].items()]
    return "\n".join(
        [
            "# M1 Ledger Backfill Work-Centric Match Audit v1",
            "",
            "本报告以 M2 当前标准作品集合为中心，不输出真实作品明细。",
            "",
            f"- M2 标准作品数：`{data['totalStandardWorks']}`",
            "",
            "## 作品中心匹配覆盖",
            markdown_table(method_rows, [("method", "匹配类型"), ("count", "作品数")]),
            "",
            "## 收入贡献覆盖",
            markdown_table(revenue_rows, [("metric", "指标"), ("value", "占比")]),
            "",
            "## Top 收入作品覆盖",
            markdown_table(
                data["topRevenueCoverage"],
                [
                    ("bucket", "收入层"),
                    ("standardWorkCount", "作品数"),
                    ("matched", "matched"),
                    ("unmatched", "unmatched"),
                    ("highConfidenceBackfillable", "strict auto works"),
                    ("conflict", "conflict"),
                ],
            ),
            "",
            "结论：ledger-row unmatched 主要反映台账覆盖范围大于当前 M2 作品集合，不能直接等价为 M2 作品未覆盖；M2 判断必须使用作品中心口径。",
        ]
    )


def render_auto_md(payload: dict) -> str:
    data = payload["autoApplyRule"]
    rows = [{"field": key, "count": value} for key, value in sorted(data["byField"].items())]
    exclusion_rows = [{"reason": key, "count": value} for key, value in sorted(data["exclusionReasons"].items(), key=lambda item: (-item[1], item[0]))]
    return "\n".join(
        [
            "# M1 Ledger Backfill Auto Apply Rule v1",
            "",
            "本报告定义本地 dry-run 的严格自动应用规则；不写正式主数据。",
            "",
            f"- 自动应用字段候选数：`{data['automaticFieldCandidates']}`",
            f"- 自动应用标准作品数：`{data['automaticStandardWorks']}`",
            f"- 自动应用收入覆盖：`{pct(data['automaticRevenueCoverage'])}`",
            "- 中置信和 fuzzy：不得自动应用。",
            "",
            "## 各字段自动应用数",
            markdown_table(rows, [("field", "字段"), ("count", "数量")]),
            "",
            "## 排除原因分布",
            markdown_table(exclusion_rows, [("reason", "排除原因"), ("count", "数量")]),
            "",
            "## 规则",
            "\n".join(f"- {line}" for line in data["ruleText"]),
        ]
    )


def render_verify_md(payload: dict) -> str:
    data = payload["verificationSummary"]
    headline = data["headline"]
    return "\n".join(
        [
            "# M1 Ledger Backfill Verification Summary v1",
            "",
            "本报告为脱敏聚合摘要。真实作品 ID/书名/作者/台账摘录仅在 gitignored private 工作簿中。",
            "",
            "## 结论",
            f"- 候选验证完成：`{data['candidateVerificationCompleted']}`",
            f"- 抽样包样本行：`{data['sampleRows']}`",
            f"- 高置信样本行：`{data['highConfidenceSampleRows']}`",
            f"- 严格自动应用字段候选：`{headline['strictAutoFieldCandidates']}`",
            f"- 严格自动应用标准作品：`{headline['strictAutoStandardWorks']}`",
            f"- forecast copyright term 增量：`{headline['forecastCopyrightTermIncrease']}`",
            f"- 仍不进入 M3：`{data['notM3']}`",
            "",
            "## 覆盖",
            markdown_table(counter_dict_rows(data["fieldCoverage"]), [("key", "字段"), ("count", "样本数")]),
            "",
            "## 说明",
            data["expectedAccuracyStatement"],
        ]
    )


def render_dry_run_md(payload: dict) -> str:
    data = payload["dryRunResult"]
    return "\n".join(
        [
            "# M1 Ledger Backfill Dry-Run Result v1",
            "",
            "本报告为文件级 dry-run 聚合结果，不连接数据库、不写正式主数据。",
            "",
            f"- 自动应用候选数：`{data['automaticCandidateRows']}`",
            f"- 自动应用作品数：`{data['automaticStandardWorks']}`",
            f"- 剩余人工复核候选数：`{data['remainingManualCandidateRows']}`",
            "",
            "## 字段缺口 before / after",
            markdown_table(
                data["fieldGapBeforeAfter"],
                [
                    ("fieldCn", "字段"),
                    ("before", "before"),
                    ("after", "after"),
                    ("reduction", "reduction"),
                ],
            ),
            "",
            "## 高收入层影响",
            markdown_table(
                data["topRevenueBeforeAfter"],
                [
                    ("bucket", "收入层"),
                    ("autoFieldCandidates", "自动字段候选"),
                    ("autoStandardWorks", "自动作品数"),
                    ("copyrightEndReductions", "版权到期补全"),
                    ("manualReviewRemainingCandidates", "剩余复核候选"),
                ],
            ),
        ]
    )


def render_workload_md(payload: dict) -> str:
    data = payload["manualWorkloadReduction"]
    rows = [
        {"metric": "原始人工缺口总量", "value": data["originalManualGapTotal"]},
        {"metric": "自动应用后剩余人工缺口", "value": data["afterStrictAutoApplyManualGapTotal"]},
        {"metric": "自动减少缺口", "value": data["autoApplyGapReduction"]},
        {"metric": "中置信快速复核候选", "value": data["mediumQuickReviewCandidateCount"]},
        {"metric": "低置信/冲突人工候选", "value": data["lowOrConflictManualCandidateCount"]},
        {"metric": "人工工作量减少比例", "value": pct(data["manualReductionRatio"])},
    ]
    return "\n".join(
        [
            "# M1 Ledger Backfill Manual Workload Reduction v1",
            "",
            "本报告为聚合工作量评估，不包含真实作品明细。",
            "",
            markdown_table(rows, [("metric", "指标"), ("value", "值")]),
            "",
            "## 仍需人工字段",
            "\n".join(f"- {item}" for item in data["fieldsStillManual"]),
            "",
            "## 建议复核顺序",
            "\n".join(f"{index + 1}. {item}" for index, item in enumerate(data["suggestedReviewOrder"])),
        ]
    )


def render_m2_impact_md(payload: dict) -> str:
    data = payload["m2DryRunImpact"]
    before_rows = [{"type": key, "before": value, "after": data["after"][key], "delta": data["delta"][key]} for key, value in data["before"].items()]
    rerun_rows = [{"item": key, "required": value} for key, value in data["rerunRecommendations"].items()]
    return "\n".join(
        [
            "# M2 Ledger Backfill Dry-Run Forecast Output Impact v1",
            "",
            "本报告为文件级 forecastOutputType proxy，不是正式 DB 评估结果。",
            "",
            markdown_table(before_rows, [("type", "forecastOutputType"), ("before", "before"), ("after", "after"), ("delta", "变化")]),
            "",
            "## 关键转移",
            markdown_table(counter_dict_rows(data["transitions"]), [("key", "指标"), ("count", "数量")]),
            "",
            "## 重跑建议",
            markdown_table(rerun_rows, [("item", "项目"), ("required", "是否需要")]),
            "",
            "- formalCompleteAllowed: `False`",
            "- notM3: `True`",
        ]
    )


def build_revenue_ranks(work_summary: list[dict]) -> dict:
    sorted_rows = sorted(work_summary, key=lambda row: safe_float(row.get("totalHistoricalRevenue")), reverse=True)
    total = len(sorted_rows) or 1
    ranks = {}
    groups = {
        "top 1%": set(),
        "top 5%": set(),
        "top 10%": set(),
        "middle": set(),
        "low": set(),
    }
    for index, row in enumerate(sorted_rows, start=1):
        standard = normalize_id(row.get("standardWorkId"))
        if not standard:
            continue
        pct_rank = index / total
        ranks[standard] = index
        if pct_rank <= 0.01:
            groups["top 1%"].add(standard)
        if pct_rank <= 0.05:
            groups["top 5%"].add(standard)
        if pct_rank <= 0.10:
            groups["top 10%"].add(standard)
        if 0.10 < pct_rank <= 0.50:
            groups["middle"].add(standard)
        if pct_rank > 0.50:
            groups["low"].add(standard)
    return {"ranks": ranks, "groups": groups, "total": total}


def forecast_output_type_proxy(work_summary: list[dict]) -> dict:
    counts = {
        "copyright_term_forecast": 0,
        "operating_window_forecast_pending_expiry": 0,
        "relative_expiry_pending_anchor": 0,
        "copyright_conflict_manual_review": 0,
        "no_numeric_forecast": 0,
    }
    for row in work_summary:
        if truthy(row.get("copyrightDateConflict")):
            counts["copyright_conflict_manual_review"] += 1
        elif truthy(row.get("hasCopyrightEndDate")):
            counts["copyright_term_forecast"] += 1
        elif safe_float(row.get("totalHistoricalRevenue")) <= 0:
            counts["no_numeric_forecast"] += 1
        else:
            counts["operating_window_forecast_pending_expiry"] += 1
    return counts


def display_maps(candidates: list[dict]):
    title_by_standard = {}
    author_by_standard = {}
    for item in candidates:
        standard = item.get("standardWorkId")
        if not standard:
            continue
        if item.get("fieldName") == "standardWorkName" and item.get("proposedValue"):
            title_by_standard.setdefault(standard, item["proposedValue"])
        if item.get("fieldName") == "authorName" and item.get("proposedValue"):
            author_by_standard.setdefault(standard, item["proposedValue"])
    return title_by_standard, author_by_standard


def date_parse_type(item: dict) -> str:
    raw = stringify(item.get("sourceRawValue"))
    proposed = stringify(item.get("proposedValueNormalized") or item.get("proposedValue"))
    if item.get("fieldName") not in DATE_FIELDS:
        return ""
    if re.fullmatch(r"\d{4,6}(?:\.0)?", raw):
        return "Excel serial date"
    if proposed == "infinite" or re.search(r"无限期|无期限|永久|长期有效", raw):
        return "无限期"
    if re.search(r"publication_date\+|last_publication_date\+|出版之日|最后一部出版", proposed + " " + raw):
        return "相对期限"
    if re.search(r"自动续约|自动延续|顺延", raw):
        return "自动续约"
    if len(re.findall(r"(?:20\d{2}|19\d{2})[/-]\d{1,2}[/-]\d{1,2}|(?:20\d{2}|19\d{2})年\d{1,2}月\d{1,2}", raw)) > 1:
        return "多日期文本"
    if re.search(r"\d{4}-\d{2}-\d{2}", proposed):
        return "标准日期"
    return "无法解析"


def date_parse_type_from_parsed(parsed_date: dict) -> str:
    raw = stringify(parsed_date.get("rawValue"))
    if re.fullmatch(r"\d{4,6}(?:\.0)?", raw):
        return "Excel serial date"
    if parsed_date.get("expiryType") == "infinite":
        return "无限期"
    if parsed_date.get("expiryType") == "relative_term":
        return "相对期限"
    if parsed_date.get("expiryType") == "auto_renewal":
        return "自动续约"
    if len(parsed_date.get("extractedDates") or []) > 1:
        return "多日期文本"
    if parsed_date.get("parserStatus") == "parsed" and parsed_date.get("normalizedDate"):
        return "标准日期"
    if parsed_date.get("parserStatus") in {"manual_review", "unparsed"}:
        return "无法解析"
    return "无法解析"


def sample_sort_key(item):
    return (
        item.get("fieldName") or "",
        item.get("matchMethod") or "",
        item.get("standardWorkId") or "",
        item.get("ledgerRowIds", [""])[0],
    )


def field_reduction(dry_run: dict, field: str) -> int:
    for row in dry_run["fieldGapBeforeAfter"]:
        if row["field"] == field:
            return row["reduction"]
    return 0


def dry_run_ratio(dry_run: dict) -> float:
    before = sum(row["before"] for row in dry_run["fieldGapBeforeAfter"])
    reduction = sum(row["reduction"] for row in dry_run["fieldGapBeforeAfter"])
    return safe_ratio(reduction, before)


def total_revenue_for(standards: set[str], work_index: dict) -> float:
    total = 0.0
    for standard in standards:
        total += safe_float(work_index["workSummaryByStandard"].get(standard, {}).get("totalHistoricalRevenue"))
    return total


def confidence_score(value) -> float:
    if isinstance(value, (int, float)) and math.isfinite(float(value)):
        return float(value)
    return {"high": 1.0, "medium": 0.8, "low": 0.5, "missing": 0.0}.get(str(value), 0.0)


def date_pending_anchor(field: str, proposed: str, raw: str, parser_status: str) -> bool:
    return field in DATE_FIELDS and (
        parser_status == "relative" or re.search(r"\b(?:publication_date|last_publication_date)\+\d+y\b|出版之日|最后一部出版", proposed + " " + raw)
    )


def perpetual_or_infinite(field: str, proposed: str, raw: str) -> bool:
    return field in DATE_FIELDS and (proposed == "infinite" or bool(re.search(r"无限期|无期限|永久|长期有效", raw)))


def automatic_renewal(field: str, raw: str) -> bool:
    return field in DATE_FIELDS and bool(re.search(r"自动续约|自动延续|顺延", raw))


def strict_bucket(candidate: dict, reasons: list[str]) -> str:
    if candidate.get("conflictStatus") and candidate.get("conflictStatus") != "none":
        return "conflict_manual_review"
    if any("pending_anchor" in reason or "automatic_renewal" in reason for reason in reasons):
        return "date_manual_review"
    if candidate.get("valueConfidence") == "medium" and candidate.get("matchMethod") != "title_author_fuzzy":
        return "suggested_quick_review"
    return "manual_review"


def action_cn(bucket: str) -> str:
    return {
        "auto_apply": "自动应用候选",
        "suggested_quick_review": "建议快速复核",
        "manual_review": "人工复核",
        "conflict_manual_review": "冲突复核",
        "date_manual_review": "日期锚点/续约复核",
    }.get(bucket or "", "人工复核")


def revenue_tier(standard: str, revenue_ranks: dict) -> str:
    if not standard or standard not in revenue_ranks["ranks"]:
        return ""
    total = revenue_ranks["total"] or 1
    pct_rank = revenue_ranks["ranks"][standard] / total
    if pct_rank <= 0.01:
        return "top 1%"
    if pct_rank <= 0.05:
        return "top 5%"
    if pct_rank <= 0.10:
        return "top 10%"
    if pct_rank <= 0.50:
        return "middle"
    return "low"


def truthy(value) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"true", "1", "yes", "y"}


def safe_float(value) -> float:
    try:
        result = float(value)
    except Exception:
        return 0.0
    return result if math.isfinite(result) else 0.0


def safe_ratio(part: float, total: float) -> float:
    return round(part / total, 4) if total else 0.0


def pct(value: float) -> str:
    return f"{value * 100:.1f}%"


def normalize_id(value) -> str:
    text = stringify(value)
    if re.fullmatch(r"\d+\.0", text):
        return text[:-2]
    return text


def stringify(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def public_value(value):
    if isinstance(value, set):
        return sorted(value)
    if isinstance(value, dict):
        return {str(key): public_value(child) for key, child in value.items()}
    if isinstance(value, list):
        return [public_value(child) for child in value]
    return value


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(public_value(payload), ensure_ascii=False, indent=2), encoding="utf-8")


def markdown_table(rows: list[dict], columns: list[tuple[str, str]]) -> str:
    lines = ["| " + " | ".join(label for _, label in columns) + " |"]
    lines.append("|" + "|".join("---" for _ in columns) + "|")
    for row in rows:
        lines.append("| " + " | ".join(str(row.get(key, "")) for key, _ in columns) + " |")
    return "\n".join(lines)


def counter_dict_rows(values: dict) -> list[dict]:
    return [{"key": key, "count": value} for key, value in values.items()]


def sanitized_boundary(context: dict) -> dict:
    return {
        "sanitizedAggregateOnly": True,
        "realTitlesIncluded": False,
        "authorNamesIncluded": False,
        "channelNamesIncluded": False,
        "rawLedgerRowsIncluded": False,
        "privateDetailsStoredOnlyInGitignoredOutput": True,
        "databaseConnected": False,
        "dockerExecuted": False,
        "formalMasterDataWritten": False,
        "m3Entered": False,
        "currentHead": context["currentHead"],
        "originMain": context["originMain"],
    }


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


if __name__ == "__main__":
    main()
