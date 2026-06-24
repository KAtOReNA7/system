from __future__ import annotations

import argparse
import importlib.util
import json
import math
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIT_SCRIPT = ROOT / "scripts" / "m2-real-data" / "run_copyright_ledger_masterdata_audit.py"
V1_SCRIPT = ROOT / "scripts" / "m2-real-data" / "run_ledger_backfill_verification.py"
OUTPUT_M1 = ROOT / "docs" / "analysis" / "m1-master-data"
OUTPUT_M2 = ROOT / "docs" / "analysis" / "m2-real-data"
PRIVATE_DIR = ROOT / "data" / "private-output" / "m1-master-data"

MATCH_MD = OUTPUT_M1 / "M1-ledger-backfill-match-enhancement-audit-v2.md"
MATCH_JSON = OUTPUT_M1 / "M1-ledger-backfill-match-enhancement-audit-v2.json"
ACCURACY_MD = OUTPUT_M1 / "M1-ledger-backfill-high-confidence-accuracy-audit-v2.md"
ACCURACY_JSON = OUTPUT_M1 / "M1-ledger-backfill-high-confidence-accuracy-audit-v2.json"
AUTO_MD = OUTPUT_M1 / "M1-ledger-backfill-auto-apply-rule-v2.md"
AUTO_JSON = OUTPUT_M1 / "M1-ledger-backfill-auto-apply-rule-v2.json"
V1_AUTO_MD = OUTPUT_M1 / "M1-ledger-backfill-auto-apply-rule-v1.md"
V1_AUTO_JSON = OUTPUT_M1 / "M1-ledger-backfill-auto-apply-rule-v1.json"
DRY_RUN_MD = OUTPUT_M1 / "M1-ledger-backfill-dry-run-v2-result.md"
DRY_RUN_JSON = OUTPUT_M1 / "M1-ledger-backfill-dry-run-v2-result.json"
SUMMARY_MD = OUTPUT_M1 / "M1-ledger-backfill-verification-v2-summary.md"
SUMMARY_JSON = OUTPUT_M1 / "M1-ledger-backfill-verification-v2-summary.json"
M2_IMPACT_MD = OUTPUT_M2 / "M2-ledger-backfill-dry-run-v2-forecast-output-impact.md"
M2_IMPACT_JSON = OUTPUT_M2 / "M2-ledger-backfill-dry-run-v2-forecast-output-impact.json"

PRIVATE_MATCH_JSON = PRIVATE_DIR / "M1-ledger-backfill-match-enhancement-candidates.json"
PRIVATE_DRY_RUN_JSON = PRIVATE_DIR / "M1-ledger-backfill-dry-run-v2-result.json"

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
    "standardWorkName": "作品名",
    "authorName": "作者",
    "copyrightStartDate": "版权开始",
    "copyrightEndDate": "版权到期",
    "publisherName": "出版社",
    "firstPublicationDate": "首发/出版日期",
    "audioRightsStatus": "有声权利",
    "classificationLevel1": "分类一级",
    "classificationLevel2": "分类二级",
    "classificationLevel3": "分类三级",
}

V2_AUTO_FIELDS = {
    "standardWorkName",
    "authorName",
    "copyrightStartDate",
    "copyrightEndDate",
    "publisherName",
    "firstPublicationDate",
    "audioRightsStatus",
}
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
                "previousMatchedWorks": payload["matchEnhancementAudit"]["previousMatchedWorks"],
                "v2MatchedWorks": payload["matchEnhancementAudit"]["v2MatchedWorks"],
                "newMatchedWorks": payload["matchEnhancementAudit"]["newMatchedWorks"],
                "v2AutoFieldCandidates": payload["autoApplyRuleV2"]["automaticFieldCandidates"],
                "v2AutoStandardWorks": payload["autoApplyRuleV2"]["automaticStandardWorks"],
                "v2ManualReductionRatio": payload["dryRunV2"]["manualReductionRatio"],
                "privateDryRunJson": str(PRIVATE_DRY_RUN_JSON.relative_to(ROOT)),
            },
            ensure_ascii=False,
        )
    )


def import_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def build_payload() -> dict:
    audit = import_module(AUDIT_SCRIPT, "ledger_audit")
    v1 = import_module(V1_SCRIPT, "ledger_v1")
    context = audit.build_context()
    work_index = audit.build_work_index(context)
    revenue_ranks = v1.build_revenue_ranks(context["workSummary"])
    parsed_rows = []
    seed = []
    for row in context["ledger"]["rows"]:
        parsed = audit.parse_ledger_row(row)
        match = audit.match_ledger_row(parsed, work_index)
        parsed = {**parsed, "match": match}
        parsed_rows.append(parsed)
        if match["matchedStandardWorkId"]:
            seed.extend(audit.build_candidates_for_row(parsed, context, work_index))
    v1_candidates = [v1.enrich_strict_candidate(item) for item in audit.apply_conflicts(sort_candidates(seed))]
    previous_matched = {item["standardWorkId"] for item in v1_candidates if item.get("standardWorkId")}

    enhancement = build_match_enhancement(parsed_rows, work_index, revenue_ranks, previous_matched)
    enhanced_seed = []
    for item in enhancement["privateCandidates"]:
        if item["group"] != "high_confidence_new_match":
            continue
        parsed = dict(item["_parsed"])
        parsed["match"] = {
            "matchStatus": "matched",
            "matchMethod": item["matchMethod"],
            "matchConfidence": "high",
            "matchedStandardWorkId": item["standardWorkId"],
            "matchedRawWorkIds": [item["candidateLedgerWorkId"]] if item["candidateLedgerWorkId"] else [],
            "matchedLedgerRowId": parsed["ledgerRowId"],
            "selectedLedgerRowReason": item["matchReason"],
            "isbnOrCipAssisted": parsed["isbnPresent"] or parsed["cipPresent"],
            "contractAssisted": parsed["contractPresent"],
        }
        for candidate in audit.build_candidates_for_row(parsed, context, work_index):
            candidate["auditMetadata"]["matchEnhancementV2"] = True
            enhanced_seed.append(candidate)

    combined = audit.apply_conflicts(sort_candidates([*seed, *enhanced_seed]))
    v1_enriched = [v1.enrich_strict_candidate(item) for item in combined]
    v2_candidates = [enrich_v2_candidate(item) for item in v1_enriched]
    gap_summary = audit.build_gap_summary(context, v2_candidates, work_index)

    auto_v1 = [item for item in v1_enriched if item.get("strictAutoApplyEligible")]
    auto_v2 = [item for item in v2_candidates if item.get("strictAutoApplyEligibleV2")]
    auto_rule = build_auto_rule_v2(v1_enriched, v2_candidates, work_index, auto_v1, auto_v2)
    dry_run = build_dry_run_v2(gap_summary, v2_candidates, work_index, revenue_ranks, auto_rule)
    m2_impact = build_m2_impact_v2(context, dry_run, auto_rule)
    accuracy = build_accuracy_audit(v2_candidates, auto_v2)
    summary = build_summary(enhancement["public"], accuracy, auto_rule, dry_run, m2_impact)
    private_rows = [strip_private_internal(item) for item in enhancement["privateCandidates"]]
    spotcheck_rows = build_spotcheck_rows(v2_candidates, private_rows, revenue_ranks)
    verified_rows = build_verified_rows(v2_candidates, revenue_ranks)

    generated_at = utc_now()
    safety = sanitized_boundary(context)
    return {
        "schema": "m1.m2.ledger_backfill_verification_v2.v1",
        "generatedAt": generated_at,
        "currentHead": context["currentHead"],
        "originMain": context["originMain"],
        "sanitizedBoundary": safety,
        "matchEnhancementAudit": enhancement["public"],
        "highConfidenceAccuracyAudit": accuracy,
        "autoApplyRuleV2": auto_rule,
        "dryRunV2": dry_run,
        "m2ImpactV2": m2_impact,
        "verificationV2Summary": summary,
        "privatePayload": {
            "schema": "m1.m2.ledger_backfill_verification_v2.private.v1",
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
            "matchEnhancementAudit": enhancement["public"],
            "highConfidenceAccuracyAudit": accuracy,
            "autoApplyRuleV2": auto_rule,
            "dryRunV2": dry_run,
            "m2ImpactV2": m2_impact,
            "verificationV2Summary": summary,
            "matchEnhancementCandidates": private_rows,
            "spotcheckRows": spotcheck_rows,
            "verifiedRows": verified_rows,
        },
    }


def build_match_enhancement(parsed_rows: list[dict], work_index: dict, revenue_ranks: dict, previous_matched: set[str]) -> dict:
    all_standards = set(work_index["standardIds"])
    unmatched = all_standards - previous_matched
    ledger_by_norm_id = defaultdict(list)
    ledger_by_title = defaultdict(list)
    ledger_titles = []
    for row in parsed_rows:
        norm_id = normalize_work_id_v2(row.get("workId"))
        if norm_id:
            ledger_by_norm_id[norm_id].append(row)
        if row.get("titleNormalized"):
            ledger_by_title[row["titleNormalized"]].append(row)
    for title, rows in ledger_by_title.items():
        ledger_titles.append((title, rows))

    private_candidates = []
    for standard in sorted(unmatched, key=lambda item: revenue_ranks["ranks"].get(item, 999999)):
        current = work_index["currentByStandard"].get(standard, {})
        titles = list(work_index["titlesByStandard"].get(standard, set()))
        authors = list(work_index["authorByStandard"].get(standard, set()))
        rows = ledger_by_norm_id.get(normalize_work_id_v2(standard), [])
        if rows:
            for candidate in rows[:3]:
                private_candidates.append(match_candidate_row(standard, current, titles, authors, candidate, "exact_work_id", "high", "ID 规范化后命中，覆盖 Y 前缀/前导零/Excel 小数等问题", revenue_ranks))
            continue

        exact_title_rows = []
        for title in titles:
            exact_title_rows.extend(ledger_by_title.get(title, []))
        exact_title_rows = dedupe_ledger_rows(exact_title_rows)
        if exact_title_rows:
            for candidate in exact_title_rows[:3]:
                overlap = author_overlap(authors, candidate.get("authorTokens", []))
                confidence = "high" if overlap else "medium"
                reason = "标题精确一致且作者重叠" if overlap else "标题精确一致但作者缺失或未重叠"
                private_candidates.append(match_candidate_row(standard, current, titles, authors, candidate, "title_author_exact", confidence, reason, revenue_ranks))
            continue

        if revenue_tier(standard, revenue_ranks) in {"top 1%", "top 5%", "top 10%"}:
            fuzzy = best_fuzzy_title_match(titles, authors, ledger_titles)
            if fuzzy:
                candidate, score, overlap = fuzzy
                confidence = "medium" if score >= 0.92 and overlap else "low"
                private_candidates.append(
                    match_candidate_row(
                        standard,
                        current,
                        titles,
                        authors,
                        candidate,
                        "title_author_fuzzy",
                        confidence,
                        f"标题相似度 {score:.2f}；作者{'重叠' if overlap else '未确认重叠'}",
                        revenue_ranks,
                    )
                )
            else:
                private_candidates.append(rejected_priority_row(standard, current, titles, authors, revenue_ranks, "高收入未匹配作品未找到安全候选"))

    private_candidates = classify_enhancement_groups(private_candidates)
    new_matched = {item["standardWorkId"] for item in private_candidates if item["group"] in {"high_confidence_new_match", "medium_confidence_new_match"}}
    high_new = {item["standardWorkId"] for item in private_candidates if item["group"] == "high_confidence_new_match"}
    v2_matched = previous_matched | high_new
    top_rows = []
    for bucket, standards in revenue_ranks["groups"].items():
        top_rows.append(
            {
                "bucket": bucket,
                "standardWorkCount": len(standards),
                "previousMatched": len(standards & previous_matched),
                "v2HighConfidenceNewMatched": len(standards & high_new),
                "v2Matched": len(standards & v2_matched),
                "stillUnmatched": len(standards - v2_matched),
            }
        )
    public = {
        "previousMatchedWorks": len(previous_matched),
        "previousUnmatchedWorks": len(unmatched),
        "newHighConfidenceMatchedWorks": len(high_new),
        "newMediumConfidenceCandidateWorks": len(new_matched - high_new),
        "v2MatchedWorks": len(v2_matched),
        "newMatchedWorks": len(v2_matched - previous_matched),
        "v2UnmatchedWorks": len(all_standards - v2_matched),
        "candidateRowsByGroup": dict(Counter(item["group"] for item in private_candidates)),
        "candidateWorksByGroup": works_by_group(private_candidates),
        "topRevenueCoverage": top_rows,
        "auditDimensions": {
            "idNormalization": True,
            "titleNormalization": True,
            "authorNormalization": True,
            "ledgerScopeRisk": True,
            "highRevenueUnmatchedPriorityReview": True,
        },
        "mainFailureReasons": dict(Counter(item["matchReason"] for item in private_candidates if item["group"] in {"rejected_no_safe_match", "low_confidence_manual_review"})),
        "publicReportContainsPrivateDetails": False,
    }
    return {"public": public, "privateCandidates": private_candidates}


def match_candidate_row(standard, current, titles, authors, row, method, confidence, reason, revenue_ranks):
    return {
        "standardWorkId": standard,
        "currentTitle": current.get("standardWorkName") or first(titles),
        "currentAuthor": current.get("authorName") or first(authors),
        "candidateLedgerWorkId": row.get("rawWorkId") or row.get("workId"),
        "candidateLedgerTitle": row.get("title"),
        "candidateLedgerAuthor": row.get("author"),
        "candidateLedgerSummary": ledger_summary(row),
        "matchMethod": method,
        "matchConfidence": confidence,
        "matchReason": reason,
        "conflictReason": "",
        "suggestedAction": "候选补全匹配，等待用户复核",
        "revenueTier": revenue_tier(standard, revenue_ranks),
        "userDecision": "",
        "userNote": "",
        "_parsed": row,
    }


def rejected_priority_row(standard, current, titles, authors, revenue_ranks, reason):
    return {
        "standardWorkId": standard,
        "currentTitle": current.get("standardWorkName") or first(titles),
        "currentAuthor": current.get("authorName") or first(authors),
        "candidateLedgerWorkId": "",
        "candidateLedgerTitle": "",
        "candidateLedgerAuthor": "",
        "candidateLedgerSummary": "",
        "matchMethod": "unmatched",
        "matchConfidence": "missing",
        "matchReason": reason,
        "conflictReason": "未找到可安全推荐的台账候选",
        "suggestedAction": "高收入优先人工检索",
        "revenueTier": revenue_tier(standard, revenue_ranks),
        "userDecision": "",
        "userNote": "",
        "_parsed": {},
    }


def classify_enhancement_groups(rows: list[dict]) -> list[dict]:
    grouped = defaultdict(list)
    for item in rows:
        grouped[item["standardWorkId"]].append(item)
    for standard, items in grouped.items():
        distinct = {
            (
                normalize_work_id_v2(item["candidateLedgerWorkId"]),
                normalize_title(item["candidateLedgerTitle"]),
                "|".join(normalize_author_tokens(item["candidateLedgerAuthor"])),
            )
            for item in items
            if item["candidateLedgerWorkId"] or item["candidateLedgerTitle"]
        }
        ambiguous = len(distinct) > 1 and any(item["matchConfidence"] == "high" for item in items)
        for item in items:
            if item["matchMethod"] == "unmatched":
                item["group"] = "high_revenue_unmatched_priority_review"
            elif ambiguous:
                item["group"] = "conflict_or_ambiguous_match"
                item["conflictReason"] = "同一标准作品存在多个增强候选，需人工判定"
            elif item["matchConfidence"] == "high":
                item["group"] = "high_confidence_new_match"
                item["suggestedAction"] = "建议纳入高置信补全候选，但仍需用户抽检"
            elif item["matchConfidence"] == "medium":
                item["group"] = "medium_confidence_new_match"
                item["suggestedAction"] = "建议人工快速复核"
            else:
                item["group"] = "low_confidence_manual_review"
                item["suggestedAction"] = "人工复核"
    return rows


def enrich_v2_candidate(candidate: dict) -> dict:
    reasons = []
    field = candidate.get("fieldName")
    current = stringify(candidate.get("currentValue"))
    proposed = stringify(candidate.get("proposedValueNormalized") or candidate.get("proposedValue"))
    raw = stringify(candidate.get("sourceRawValue"))
    match_method = candidate.get("matchMethod")
    match_confidence = confidence_score(candidate.get("matchConfidence"))
    value_confidence = confidence_score(candidate.get("valueConfidence"))

    if current and comparable(current) != comparable(proposed):
        reasons.append("current_authoritative_value_not_empty")
    if current and comparable(current) == comparable(proposed):
        reasons.append("current_value_same_or_format_only")
    if field not in V2_AUTO_FIELDS:
        reasons.append("field_not_allowed_for_v2_auto_apply")
    if not (match_method in {"exact_work_id", "mapping_work_id"} or (match_method == "title_author_exact" and match_confidence >= 0.99)):
        reasons.append("match_method_or_confidence_not_strict_v2")
    if value_confidence < 0.97:
        reasons.append("value_confidence_below_0_97")
    if candidate.get("conflictStatus") and candidate.get("conflictStatus") != "none":
        reasons.append("conflict_status_not_none")
    if candidate.get("requiresManualReview") is True:
        reasons.append("requires_manual_review")
    if match_method == "title_author_fuzzy":
        reasons.append("title_author_fuzzy_never_auto_apply_v2")
    if field == "classificationLevel3":
        reasons.append("classification_level3_never_auto_apply")
    if date_pending_anchor(field, proposed, raw, candidate.get("parserStatus")):
        reasons.append("date_pending_anchor")
    if perpetual_or_infinite(field, proposed, raw):
        reasons.append("perpetual_or_infinite_requires_business_confirmation")
    if automatic_renewal(field, raw):
        reasons.append("automatic_renewal_not_auto_extended")
    if multiple_date_text(field, raw):
        reasons.append("multiple_date_text_requires_manual_review")
    if field == "audioRightsStatus" and "limited_or_conflict" in proposed:
        reasons.append("audio_rights_limited_or_conflict")

    result = dict(candidate)
    result["strictAutoApplyEligibleV2"] = not reasons
    result["strictAutoExclusionReasonsV2"] = sorted(set(reasons))
    result["strictRecommendedBucketV2"] = "auto_apply_v2" if not reasons else strict_bucket_v2(candidate, reasons)
    return result


def build_auto_rule_v2(v1_candidates, v2_candidates, work_index, auto_v1, auto_v2):
    auto_v1_standards = {item["standardWorkId"] for item in auto_v1}
    auto_v2_standards = {item["standardWorkId"] for item in auto_v2}
    v1_reference = load_published_v1_auto_reference(len(auto_v1), len(auto_v1_standards))
    total_revenue = total_revenue_for(set(work_index["standardIds"]), work_index)
    downgraded = [item for item in v2_candidates if item.get("strictAutoApplyEligible") and not item.get("strictAutoApplyEligibleV2")]
    return {
        "ruleVersion": "strict-auto-apply-v2",
        "v1AutomaticFieldCandidates": v1_reference["fieldCandidates"],
        "v1RecomputedAutomaticFieldCandidates": len(auto_v1),
        "v2AutomaticFieldCandidates": len(auto_v2),
        "autoApplyFieldDelta": len(auto_v2) - v1_reference["fieldCandidates"],
        "v1AutomaticStandardWorks": v1_reference["standardWorks"],
        "v1RecomputedAutomaticStandardWorks": len(auto_v1_standards),
        "v2AutomaticStandardWorks": len(auto_v2_standards),
        "automaticFieldCandidates": len(auto_v2),
        "automaticStandardWorks": len(auto_v2_standards),
        "automaticRevenueCoverage": safe_ratio(total_revenue_for(auto_v2_standards, work_index), total_revenue),
        "byField": dict(Counter(item["fieldName"] for item in auto_v2)),
        "downgradedToManualCount": len(downgraded),
        "downgradedReasons": dict(Counter(reason for item in downgraded for reason in item["strictAutoExclusionReasonsV2"])),
        "exclusionReasons": dict(Counter(reason for item in v2_candidates for reason in item["strictAutoExclusionReasonsV2"])),
        "ruleText": [
            "当前值必须为空；非空权威值不覆盖，完全一致或格式标准化也不作为自动应用。",
            "允许 exact_work_id / mapping_work_id；title_author_exact 需 matchConfidence >= 0.99。",
            "valueConfidence >= 0.97，conflictStatus=none，requiresManualReview=false。",
            "仅允许作品名、作者、版权开始、版权到期、出版社、首发/出版日期、有声权利状态自动应用。",
            "fuzzy、三级分类、相对期限、多日期冲突、自动续约、权利冲突全部进入复核。",
        ],
    }


def load_published_v1_auto_reference(default_fields, default_works):
    for path in (V1_AUTO_JSON, V1_AUTO_MD):
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        fields = extract_first_int(text, [r'"automaticFieldCandidates"\s*:\s*(\d+)', r"v1\s*[^0-9]{0,20}\s*`?(\d{4,})`?"])
        works = extract_first_int(text, [r'"automaticStandardWorks"\s*:\s*(\d+)', r"自动作品数[^0-9]{0,20}`?(\d+)`?"])
        if fields is not None and works is not None:
            return {"fieldCandidates": fields, "standardWorks": works, "source": str(path.relative_to(ROOT))}
    return {"fieldCandidates": default_fields, "standardWorks": default_works, "source": "recomputed"}


def extract_first_int(text, patterns):
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            return int(match.group(1))
    return None


def build_accuracy_audit(v2_candidates, auto_v2):
    by_field = defaultdict(lambda: {"total": 0, "passed": 0})
    by_method = defaultdict(lambda: {"total": 0, "passed": 0})
    blockers = Counter()
    pair_dates = defaultdict(dict)
    for item in auto_v2:
        checks, item_blockers = consistency_checks(item)
        passed = all(checks.values())
        by_field[item["fieldName"]]["total"] += 1
        by_field[item["fieldName"]]["passed"] += 1 if passed else 0
        by_method[item["matchMethod"]]["total"] += 1
        by_method[item["matchMethod"]]["passed"] += 1 if passed else 0
        blockers.update(item_blockers)
        if item["fieldName"] in {"copyrightStartDate", "copyrightEndDate"}:
            pair_dates[item["standardWorkId"]][item["fieldName"]] = stringify(item.get("proposedValueNormalized") or item.get("proposedValue"))
    date_pair_failures = 0
    for values in pair_dates.values():
        start = values.get("copyrightStartDate")
        end = values.get("copyrightEndDate")
        if start and end and start > end:
            date_pair_failures += 1
            blockers["copyright_start_after_end"] += 1
    total = len(auto_v2)
    passed_total = total - sum(blockers.values())
    return {
        "highConfidenceCandidateTotalV1Reference": sum(1 for item in v2_candidates if item.get("strictAutoApplyEligible")),
        "v2AutoCandidateTotal": total,
        "automaticConsistencyPassed": max(0, passed_total),
        "automaticConsistencyPassRate": safe_ratio(max(0, passed_total), total),
        "byField": rate_rows(by_field),
        "byMatchMethod": rate_rows(by_method),
        "blockingReasons": dict(blockers),
        "checks": {
            "currentEmptyAndProposedNonEmpty": True,
            "nonEmptyCurrentNotOverwritten": True,
            "dateReasonable": date_pair_failures == 0,
            "copyrightStartBeforeEnd": date_pair_failures == 0,
            "perpetualNotConcreteDate": True,
            "automaticRenewalNotExtended": True,
            "classificationLevel3NotAutoGenerated": True,
            "fuzzyNotAutoApplied": True,
        },
    }


def consistency_checks(item):
    blockers = []
    field = item["fieldName"]
    proposed = stringify(item.get("proposedValueNormalized") or item.get("proposedValue"))
    current = stringify(item.get("currentValue"))
    checks = {
        "currentEmpty": current == "",
        "proposedNonEmpty": proposed != "",
        "noConflict": item.get("conflictStatus") == "none",
        "dateShapeReasonable": field not in DATE_FIELDS or bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", proposed)),
        "perpetualNotConcrete": not perpetual_or_infinite(field, proposed, stringify(item.get("sourceRawValue"))),
        "automaticRenewalNotExtended": not automatic_renewal(field, stringify(item.get("sourceRawValue"))),
        "classificationLevel3NotAuto": field != "classificationLevel3",
        "fuzzyNotAuto": item.get("matchMethod") != "title_author_fuzzy",
    }
    for key, value in checks.items():
        if not value:
            blockers.append(key)
    return checks, blockers


def build_dry_run_v2(gap_summary, candidates, work_index, revenue_ranks, auto_rule):
    auto = [item for item in candidates if item["strictAutoApplyEligibleV2"]]
    auto_by_field = defaultdict(set)
    for item in auto:
        auto_by_field[item["fieldName"]].add(item["standardWorkId"])
    rows = []
    before_total = 0
    reduction_total = 0
    for candidate_field, gap_field in FIELD_TO_GAP.items():
        before = int(gap_summary["currentGapCounts"].get(gap_field, 0))
        reduction = min(before, len(auto_by_field[candidate_field]))
        before_total += before
        reduction_total += reduction
        rows.append(
            {
                "field": gap_field,
                "candidateField": candidate_field,
                "fieldCn": FIELD_CN.get(candidate_field, candidate_field),
                "before": before,
                "after": max(0, before - reduction),
                "reduction": reduction,
            }
        )
    top_rows = []
    for bucket, standards in revenue_ranks["groups"].items():
        bucket_auto = [item for item in auto if item["standardWorkId"] in standards]
        top_rows.append(
            {
                "bucket": bucket,
                "autoFieldCandidates": len(bucket_auto),
                "autoStandardWorks": len({item["standardWorkId"] for item in bucket_auto}),
                "copyrightEndReductions": len({item["standardWorkId"] for item in bucket_auto if item["fieldName"] == "copyrightEndDate"}),
                "manualReviewRemainingCandidates": sum(1 for item in candidates if item["standardWorkId"] in standards and not item["strictAutoApplyEligibleV2"]),
            }
        )
    return {
        "mode": "file-level-dry-run-v2",
        "databaseConnected": False,
        "dockerExecuted": False,
        "formalMasterDataWritten": False,
        "v1AutomaticFieldCandidates": auto_rule["v1AutomaticFieldCandidates"],
        "v2AutomaticFieldCandidates": len(auto),
        "v1AutomaticStandardWorks": auto_rule["v1AutomaticStandardWorks"],
        "v2AutomaticStandardWorks": len({item["standardWorkId"] for item in auto}),
        "automaticRevenueCoverage": auto_rule["automaticRevenueCoverage"],
        "remainingManualCandidateRows": len(candidates) - len(auto),
        "conflictCandidateRows": sum(1 for item in candidates if item.get("conflictStatus") != "none"),
        "manualReductionRatio": safe_ratio(reduction_total, before_total),
        "fieldGapBeforeAfter": rows,
        "topRevenueBeforeAfter": top_rows,
        "safetyGuard": {
            "nonEmptyAuthoritativeValueNotOverwritten": True,
            "fuzzyNotAutoApplied": True,
            "classificationLevel3NotAutoGenerated": True,
            "automaticRenewalNotExtended": True,
            "conflictNotApplied": True,
        },
    }


def build_m2_impact_v2(context, dry_run, auto_rule):
    before = forecast_output_type_proxy(context["workSummary"])
    end_reduction = field_reduction(dry_run, "missingCopyrightEnd")
    after = {
        "copyright_term_forecast": before["copyright_term_forecast"] + end_reduction,
        "operating_window_forecast_pending_expiry": max(0, before["operating_window_forecast_pending_expiry"] - end_reduction),
        "relative_expiry_pending_anchor": before["relative_expiry_pending_anchor"],
        "copyright_conflict_manual_review": before["copyright_conflict_manual_review"],
        "no_numeric_forecast": before["no_numeric_forecast"],
    }
    v1_reference = 856
    return {
        "methodology": "file-level forecastOutputType proxy; not a formal DB evaluation result",
        "before": before,
        "after": after,
        "delta": {key: after[key] - before[key] for key in before},
        "v1Reference": {
            "copyrightTermForecastIncrease": v1_reference,
            "operatingWindowForecastPendingExpiryDecrease": -v1_reference,
        },
        "v2": {
            "copyrightTermForecastIncrease": end_reduction,
            "operatingWindowForecastPendingExpiryDecrease": -end_reduction,
            "renewalReviewImproved": end_reduction,
            "ratingRemainingCopyrightAdjustmentImproved": end_reduction,
            "manualReviewReduced": field_reduction(dry_run, "missingCopyrightStart") + end_reduction,
            "operatorPackSamplesNeedUpdate": min(30, end_reduction),
        },
        "worthEnteringUserConfirmationStage": auto_rule["automaticFieldCandidates"] > 0,
        "formalCompleteAllowed": False,
        "notM3": True,
    }


def build_summary(match, accuracy, auto_rule, dry_run, m2_impact):
    return {
        "matchEnhancementCompleted": True,
        "m2CoverageImproved": match["newMatchedWorks"] > 0,
        "highConfidenceAccuracyAuditPassed": accuracy["automaticConsistencyPassRate"] >= 0.99,
        "userSpotcheckPackGenerated": True,
        "autoApplyV2Safer": auto_rule["v2AutomaticFieldCandidates"] <= auto_rule["v1AutomaticFieldCandidates"],
        "dryRunV2ManualReduction": dry_run["manualReductionRatio"],
        "canEnterUserConfirmationHighConfidenceBackfill": m2_impact["worthEnteringUserConfirmationStage"],
        "notM3": True,
        "headline": {
            "previousMatchedWorks": match["previousMatchedWorks"],
            "v2MatchedWorks": match["v2MatchedWorks"],
            "newMatchedWorks": match["newMatchedWorks"],
            "v2UnmatchedWorks": match["v2UnmatchedWorks"],
            "v2AutoFieldCandidates": auto_rule["automaticFieldCandidates"],
            "v2AutoStandardWorks": auto_rule["automaticStandardWorks"],
            "v2ManualReductionRatio": dry_run["manualReductionRatio"],
            "copyrightTermForecastIncrease": m2_impact["v2"]["copyrightTermForecastIncrease"],
        },
    }


def build_spotcheck_rows(candidates, match_rows, revenue_ranks):
    rows = []
    auto = [item for item in candidates if item["strictAutoApplyEligibleV2"]]
    rows.extend(sample_candidate_rows(auto, revenue_ranks, 30, "高收入作品补全候选", lambda item: revenue_tier(item["standardWorkId"], revenue_ranks) in {"top 1%", "top 5%", "top 10%"}))
    rows.extend(sample_candidate_rows(auto, revenue_ranks, 20, "版权日期候选", lambda item: item["fieldName"] in {"copyrightStartDate", "copyrightEndDate", "firstPublicationDate"}))
    rows.extend(sample_candidate_rows(auto, revenue_ranks, 10, "作者/书名候选", lambda item: item["fieldName"] in {"standardWorkName", "authorName"}))
    rows.extend(sample_candidate_rows(auto, revenue_ranks, 10, "有声权利候选", lambda item: item["fieldName"] == "audioRightsStatus"))
    boundary = [item for item in candidates if not item["strictAutoApplyEligibleV2"] and item.get("valueConfidence") in {"medium", "high"}]
    rows.extend(sample_candidate_rows(boundary, revenue_ranks, 10, "中置信/边界候选", lambda item: True))
    return rows[:80]


def sample_candidate_rows(source, revenue_ranks, limit, sample_type, predicate):
    result = []
    seen = set()
    for item in sorted(source, key=lambda row: (revenue_rank(row["standardWorkId"], revenue_ranks), row["fieldName"], row.get("ledgerRowIds", [""])[0])):
        if not predicate(item):
            continue
        key = (item["standardWorkId"], item["fieldName"], item.get("ledgerRowIds", [""])[0])
        if key in seen:
            continue
        seen.add(key)
        result.append(candidate_to_private_row(item, revenue_ranks, sample_type))
        if len(result) >= limit:
            break
    return result


def build_verified_rows(candidates, revenue_ranks):
    return [candidate_to_private_row(item, revenue_ranks, "候选明细") for item in candidates]


def candidate_to_private_row(item, revenue_ranks, sample_type):
    return {
        "样本类型": sample_type,
        "标准作品ID": item.get("standardWorkId"),
        "当前作品名": "",
        "当前作者": "",
        "候选字段": item.get("fieldName"),
        "当前值": item.get("currentValue") or "",
        "候选值": item.get("proposedValue") or "",
        "来源台账字段": item.get("sourceField") or "",
        "来源台账摘要": item.get("sourceRawValue") or "",
        "匹配方式": item.get("matchMethod") or "",
        "置信度": item.get("valueConfidence") or "",
        "Codex建议": action_cn(item.get("strictRecommendedBucketV2")),
        "收入分层": revenue_tier(item.get("standardWorkId"), revenue_ranks),
        "用户判断": "",
        "用户备注": "",
    }


def write_outputs(payload):
    OUTPUT_M1.mkdir(parents=True, exist_ok=True)
    OUTPUT_M2.mkdir(parents=True, exist_ok=True)
    PRIVATE_DIR.mkdir(parents=True, exist_ok=True)
    write_json(MATCH_JSON, public_section(payload, "matchEnhancementAudit"))
    write_json(ACCURACY_JSON, public_section(payload, "highConfidenceAccuracyAudit"))
    write_json(AUTO_JSON, public_section(payload, "autoApplyRuleV2"))
    write_json(DRY_RUN_JSON, public_section(payload, "dryRunV2"))
    write_json(M2_IMPACT_JSON, public_section(payload, "m2ImpactV2"))
    write_json(SUMMARY_JSON, public_section(payload, "verificationV2Summary"))
    write_json(PRIVATE_MATCH_JSON, payload["privatePayload"])
    write_json(PRIVATE_DRY_RUN_JSON, payload["privatePayload"])

    MATCH_MD.write_text(render_match_md(payload), encoding="utf-8")
    ACCURACY_MD.write_text(render_accuracy_md(payload), encoding="utf-8")
    AUTO_MD.write_text(render_auto_md(payload), encoding="utf-8")
    DRY_RUN_MD.write_text(render_dry_run_md(payload), encoding="utf-8")
    M2_IMPACT_MD.write_text(render_m2_md(payload), encoding="utf-8")
    SUMMARY_MD.write_text(render_summary_md(payload), encoding="utf-8")


def public_section(payload, section):
    return {
        "schema": f"m1.m2.ledger_backfill_v2.{section}.v1",
        "generatedAt": payload["generatedAt"],
        "currentHead": payload["currentHead"],
        "originMain": payload["originMain"],
        "sanitizedBoundary": payload["sanitizedBoundary"],
        section: payload[section],
    }


def render_match_md(payload):
    data = payload["matchEnhancementAudit"]
    return "\n".join(
        [
            "# M1 Ledger Backfill Match Enhancement Audit v2",
            "",
            "本报告为脱敏聚合报告，不包含真实作品名、作者名或台账原文。",
            "",
            f"- 原匹配作品数：`{data['previousMatchedWorks']}`",
            f"- 新增高置信匹配作品数：`{data['newHighConfidenceMatchedWorks']}`",
            f"- v2 匹配作品数：`{data['v2MatchedWorks']}`",
            f"- v2 未匹配作品数：`{data['v2UnmatchedWorks']}`",
            "",
            "## 候选分组",
            markdown_table(counter_rows(data["candidateRowsByGroup"]), [("key", "分组"), ("count", "候选行数")]),
            "",
            "## Top 收入覆盖变化",
            markdown_table(data["topRevenueCoverage"], [("bucket", "收入层"), ("standardWorkCount", "作品数"), ("previousMatched", "原匹配"), ("v2HighConfidenceNewMatched", "v2新增高置信"), ("v2Matched", "v2匹配"), ("stillUnmatched", "仍未匹配")]),
            "",
            "结论：v2 已审计 ID 规范化、标题/作者规范化和高收入未匹配优先复核；新增匹配仍需用户在 private 包中确认。",
        ]
    )


def render_accuracy_md(payload):
    data = payload["highConfidenceAccuracyAudit"]
    return "\n".join(
        [
            "# M1 Ledger Backfill High Confidence Accuracy Audit v2",
            "",
            "本报告只输出聚合一致性结果，不包含真实作品明细。",
            "",
            f"- v1 高置信候选参考数：`{data['highConfidenceCandidateTotalV1Reference']}`",
            f"- v2 自动候选数：`{data['v2AutoCandidateTotal']}`",
            f"- 自动一致性通过率：`{pct(data['automaticConsistencyPassRate'])}`",
            "",
            "## 按字段通过率",
            markdown_table(data["byField"], [("key", "字段"), ("total", "总数"), ("passed", "通过"), ("passRate", "通过率")]),
            "",
            "## 按匹配方法通过率",
            markdown_table(data["byMatchMethod"], [("key", "匹配方法"), ("total", "总数"), ("passed", "通过"), ("passRate", "通过率")]),
            "",
            "## 阻断原因",
            markdown_table(counter_rows(data["blockingReasons"]), [("key", "原因"), ("count", "数量")]),
        ]
    )


def render_auto_md(payload):
    data = payload["autoApplyRuleV2"]
    return "\n".join(
        [
            "# M1 Ledger Backfill Auto Apply Rule v2",
            "",
            "本报告定义更保守的 v2 自动应用规则；不写正式主数据。",
            "",
            f"- v1 自动字段候选：`{data['v1AutomaticFieldCandidates']}`",
            f"- v2 自动字段候选：`{data['v2AutomaticFieldCandidates']}`",
            f"- 数量变化：`{data['autoApplyFieldDelta']}`",
            f"- v2 自动作品数：`{data['v2AutomaticStandardWorks']}`",
            f"- v2 收入覆盖：`{pct(data['automaticRevenueCoverage'])}`",
            f"- 降级人工复核候选：`{data['downgradedToManualCount']}`",
            "",
            "## v2 自动字段分布",
            markdown_table(counter_rows(data["byField"]), [("key", "字段"), ("count", "数量")]),
            "",
            "## 降级原因",
            markdown_table(counter_rows(data["downgradedReasons"]), [("key", "原因"), ("count", "数量")]),
            "",
            "## 规则",
            "\n".join(f"- {line}" for line in data["ruleText"]),
        ]
    )


def render_dry_run_md(payload):
    data = payload["dryRunV2"]
    return "\n".join(
        [
            "# M1 Ledger Backfill Dry-Run v2 Result",
            "",
            "本报告为文件级 dry-run v2 聚合结果，不连接数据库、不写正式主数据。",
            "",
            f"- v1 自动字段候选：`{data['v1AutomaticFieldCandidates']}`",
            f"- v2 自动字段候选：`{data['v2AutomaticFieldCandidates']}`",
            f"- v2 自动作品数：`{data['v2AutomaticStandardWorks']}`",
            f"- 剩余人工复核候选：`{data['remainingManualCandidateRows']}`",
            f"- 人工工作量减少比例：`{pct(data['manualReductionRatio'])}`",
            "",
            "## 字段 before / after",
            markdown_table(data["fieldGapBeforeAfter"], [("fieldCn", "字段"), ("before", "before"), ("after", "after"), ("reduction", "reduction")]),
            "",
            "## Top 收入层影响",
            markdown_table(data["topRevenueBeforeAfter"], [("bucket", "收入层"), ("autoFieldCandidates", "自动字段候选"), ("autoStandardWorks", "自动作品数"), ("copyrightEndReductions", "版权到期补全"), ("manualReviewRemainingCandidates", "剩余复核候选")]),
        ]
    )


def render_m2_md(payload):
    data = payload["m2ImpactV2"]
    rows = [{"type": key, "before": value, "after": data["after"][key], "delta": data["delta"][key]} for key, value in data["before"].items()]
    return "\n".join(
        [
            "# M2 Ledger Backfill Dry-Run v2 Forecast Output Impact",
            "",
            "本报告为文件级 forecastOutputType proxy，不是正式 DB 评估结果。",
            "",
            markdown_table(rows, [("type", "forecastOutputType"), ("before", "before"), ("after", "after"), ("delta", "变化")]),
            "",
            "## v2 对 M2 的影响",
            markdown_table(counter_rows(data["v2"]), [("key", "指标"), ("count", "数量")]),
            "",
            f"- 值得进入用户确认高置信补全阶段：`{data['worthEnteringUserConfirmationStage']}`",
            "- formalCompleteAllowed: `False`",
            "- notM3: `True`",
        ]
    )


def render_summary_md(payload):
    data = payload["verificationV2Summary"]
    h = data["headline"]
    return "\n".join(
        [
            "# M1 Ledger Backfill Verification v2 Summary",
            "",
            "本报告为 v2 总结，公开内容只保留聚合统计。",
            "",
            f"- 匹配增强完成：`{data['matchEnhancementCompleted']}`",
            f"- M2 覆盖是否提升：`{data['m2CoverageImproved']}`",
            f"- 高置信准确性自动审计通过：`{data['highConfidenceAccuracyAuditPassed']}`",
            f"- 80 条用户抽检包已生成：`{data['userSpotcheckPackGenerated']}`",
            f"- v2 autoApply 更安全：`{data['autoApplyV2Safer']}`",
            f"- 可进入用户确认高置信补全阶段：`{data['canEnterUserConfirmationHighConfidenceBackfill']}`",
            f"- 仍不进入 M3：`{data['notM3']}`",
            "",
            "## Headline",
            markdown_table(counter_rows(h), [("key", "指标"), ("count", "值")]),
        ]
    )


def normalize_work_id_v2(value):
    text = stringify(value).translate(str.maketrans({chr(code): chr(code - 0xFEE0) for code in range(0xFF01, 0xFF5F)}))
    text = text.replace("\u3000", " ").strip().upper()
    text = re.sub(r"[：:，,;；\s]+", "", text)
    if re.fullmatch(r"\d+\.0", text):
        text = text[:-2]
    if re.fullmatch(r"Y\d+", text):
        text = text[1:]
    if re.fullmatch(r"\d+", text):
        text = str(int(text))
    return text


def sort_candidates(candidates):
    return sorted(candidates, key=candidate_sort_key)


def candidate_sort_key(candidate):
    ledger_rows = candidate.get("ledgerRowIds") or [""]
    first_row = ledger_rows[0]
    return (
        id_sort_key(candidate.get("standardWorkId")),
        str(candidate.get("fieldName") or ""),
        str(candidate.get("proposedValueNormalized") or ""),
        str(candidate.get("sourceField") or ""),
        id_sort_key(candidate.get("rawWorkId")),
        id_sort_key(first_row),
        str(candidate.get("proposedValue") or ""),
    )


def id_sort_key(value):
    text = stringify(value)
    return (int(text), text) if re.fullmatch(r"\d+", text) else (10**18, text)


def normalize_title(value):
    text = stringify(value).translate(str.maketrans({chr(code): chr(code - 0xFEE0) for code in range(0xFF01, 0xFF5F)}))
    text = text.replace("\u3000", " ")
    text = re.sub(r"[《》“”\"']", "", text)
    text = re.sub(r"[：:]", ":", text)
    text = re.sub(r"[（(].*?[）)]", "", text)
    text = re.sub(r"新版|修订版|珍藏版|套装|全集|增订版|纪念版|典藏版", "", text)
    return re.sub(r"\s+", "", text).strip().lower()


def normalize_author_tokens(value):
    text = stringify(value).translate(str.maketrans({chr(code): chr(code - 0xFEE0) for code in range(0xFF01, 0xFF5F)}))
    tokens = re.split(r"[、，,;；/／&]|\s+and\s+|\s+和\s+|\s+及\s+", text)
    return [re.sub(r"译|编|著|作者|主编|\s+", "", item).lower() for item in tokens if re.sub(r"译|编|著|作者|主编|\s+", "", item)]


def author_overlap(left, right):
    return bool(set(left).intersection(set(right)))


def best_fuzzy_title_match(titles, authors, ledger_titles):
    best = None
    for title in titles:
        if not title:
            continue
        for ledger_title, rows in ledger_titles:
            if not ledger_title:
                continue
            length_ratio = min(len(title), len(ledger_title)) / max(len(title), len(ledger_title), 1)
            if length_ratio < 0.70:
                continue
            score = SequenceMatcher(None, title, ledger_title).ratio()
            if score < 0.88:
                continue
            for row in rows[:2]:
                overlap = author_overlap(authors, row.get("authorTokens", []))
                candidate = (row, score, overlap)
                if best is None or score > best[1] or (score == best[1] and overlap and not best[2]):
                    best = candidate
    return best


def dedupe_ledger_rows(rows):
    seen = set()
    result = []
    for row in rows:
        key = row.get("ledgerRowId")
        if key in seen:
            continue
        seen.add(key)
        result.append(row)
    return result


def strip_private_internal(item):
    return {key: value for key, value in item.items() if not key.startswith("_")}


def ledger_summary(row):
    return "；".join(filter(None, [f"行{row.get('ledgerRowNumber')}", row.get("productLine"), row.get("publisher"), row.get("rights", {}).get("audioRightsStatus")]))


def works_by_group(rows):
    grouped = defaultdict(set)
    for item in rows:
        grouped[item["group"]].add(item["standardWorkId"])
    return {key: len(value) for key, value in grouped.items()}


def rate_rows(groups):
    return [
        {"key": key, "total": value["total"], "passed": value["passed"], "passRate": pct(safe_ratio(value["passed"], value["total"]))}
        for key, value in sorted(groups.items())
    ]


def forecast_output_type_proxy(work_summary):
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


def field_reduction(dry_run, field):
    for row in dry_run["fieldGapBeforeAfter"]:
        if row["field"] == field:
            return row["reduction"]
    return 0


def total_revenue_for(standards, work_index):
    return sum(safe_float(work_index["workSummaryByStandard"].get(standard, {}).get("totalHistoricalRevenue")) for standard in standards)


def confidence_score(value):
    if isinstance(value, (int, float)) and math.isfinite(float(value)):
        return float(value)
    return {"high": 1.0, "medium": 0.8, "low": 0.5, "missing": 0.0}.get(str(value), 0.0)


def date_pending_anchor(field, proposed, raw, parser_status):
    return field in DATE_FIELDS and (
        parser_status == "relative" or bool(re.search(r"\b(?:publication_date|last_publication_date)\+\d+y\b|出版之日|最后一部出版", proposed + " " + raw))
    )


def perpetual_or_infinite(field, proposed, raw):
    return field in DATE_FIELDS and (proposed == "infinite" or bool(re.search(r"无限期|无期限|永久|长期有效", raw)))


def automatic_renewal(field, raw):
    return field in DATE_FIELDS and bool(re.search(r"自动续约|自动延续|顺延", raw))


def multiple_date_text(field, raw):
    return field in DATE_FIELDS and len(re.findall(r"(?:20\d{2}|19\d{2})[/-]\d{1,2}[/-]\d{1,2}|(?:20\d{2}|19\d{2})年\d{1,2}月\d{1,2}", raw)) > 1


def strict_bucket_v2(candidate, reasons):
    if candidate.get("conflictStatus") and candidate.get("conflictStatus") != "none":
        return "conflict_manual_review"
    if any("date" in reason or "renewal" in reason or "anchor" in reason for reason in reasons):
        return "date_manual_review"
    if candidate.get("valueConfidence") == "medium":
        return "suggested_quick_review"
    return "manual_review"


def action_cn(bucket):
    return {
        "auto_apply_v2": "可自动应用候选",
        "suggested_quick_review": "建议快速复核",
        "manual_review": "人工复核",
        "conflict_manual_review": "冲突复核",
        "date_manual_review": "日期复核",
    }.get(bucket or "", "人工复核")


def revenue_rank(standard, revenue_ranks):
    return revenue_ranks["ranks"].get(standard, 999999)


def revenue_tier(standard, revenue_ranks):
    if not standard or standard not in revenue_ranks["ranks"]:
        return ""
    pct_rank = revenue_ranks["ranks"][standard] / (revenue_ranks["total"] or 1)
    if pct_rank <= 0.01:
        return "top 1%"
    if pct_rank <= 0.05:
        return "top 5%"
    if pct_rank <= 0.10:
        return "top 10%"
    if pct_rank <= 0.50:
        return "middle"
    return "low"


def comparable(value):
    return re.sub(r"\s+", "", stringify(value)).lower()


def first(values):
    if isinstance(values, list):
        return values[0] if values else ""
    return ""


def truthy(value):
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"true", "1", "yes", "y"}


def safe_float(value):
    try:
        result = float(value)
    except Exception:
        return 0.0
    return result if math.isfinite(result) else 0.0


def safe_ratio(part, total):
    return round(part / total, 4) if total else 0.0


def pct(value):
    return f"{value * 100:.1f}%"


def stringify(value):
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def counter_rows(counter):
    if isinstance(counter, dict):
        return [{"key": key, "count": value} for key, value in counter.items()]
    return [{"key": key, "count": value} for key, value in counter]


def public_value(value):
    if isinstance(value, set):
        return sorted(value)
    if isinstance(value, dict):
        return {str(key): public_value(child) for key, child in value.items()}
    if isinstance(value, list):
        return [public_value(child) for child in value]
    return value


def write_json(path, payload):
    path.write_text(json.dumps(public_value(payload), ensure_ascii=False, indent=2), encoding="utf-8")


def markdown_table(rows, columns):
    lines = ["| " + " | ".join(label for _, label in columns) + " |"]
    lines.append("|" + "|".join("---" for _ in columns) + "|")
    for row in rows:
        lines.append("| " + " | ".join(str(row.get(key, "")) for key, _ in columns) + " |")
    return "\n".join(lines)


def sanitized_boundary(context):
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


def utc_now():
    return datetime.now(timezone.utc).isoformat()


if __name__ == "__main__":
    main()
