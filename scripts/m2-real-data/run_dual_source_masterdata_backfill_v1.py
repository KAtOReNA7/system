from __future__ import annotations

import argparse
import importlib.util
import json
import math
import re
import subprocess
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
OUTPUT_M1 = ROOT / "docs" / "analysis" / "m1-master-data"
OUTPUT_M2 = ROOT / "docs" / "analysis" / "m2-real-data"
PRIVATE_DIR = ROOT / "data" / "private-output" / "m1-master-data"

ORIGINAL_STRUCTURE_MD = OUTPUT_M1 / "M1-original-library-structure-audit-v1.md"
ORIGINAL_STRUCTURE_JSON = OUTPUT_M1 / "M1-original-library-structure-audit-v1.json"
COHORT_MD = OUTPUT_M1 / "M1-M2-work-source-cohort-classification-v1.md"
COHORT_JSON = OUTPUT_M1 / "M1-M2-work-source-cohort-classification-v1.json"
DUAL_DRY_RUN_MD = OUTPUT_M1 / "M1-dual-source-masterdata-backfill-dry-run-v1.md"
DUAL_DRY_RUN_JSON = OUTPUT_M1 / "M1-dual-source-masterdata-backfill-dry-run-v1.json"
SUMMARY_MD = OUTPUT_M1 / "M1-dual-source-masterdata-backfill-summary-v1.md"
SUMMARY_JSON = OUTPUT_M1 / "M1-dual-source-masterdata-backfill-summary-v1.json"
MATCH_COVERAGE_MD = OUTPUT_M1 / "M1-original-library-match-coverage-v1.md"
MATCH_COVERAGE_JSON = OUTPUT_M1 / "M1-original-library-match-coverage-v1.json"
SPOTCHECK_GUIDE_MD = OUTPUT_M1 / "M1-dual-source-user-spotcheck-guide-v1.md"
SPOTCHECK_GUIDE_JSON = OUTPUT_M1 / "M1-dual-source-user-spotcheck-guide-v1.json"
M2_IMPACT_MD = OUTPUT_M2 / "M2-dual-source-backfill-impact-on-evaluation-v1.md"
M2_IMPACT_JSON = OUTPUT_M2 / "M2-dual-source-backfill-impact-on-evaluation-v1.json"

PRIVATE_CANDIDATES_XLSX = PRIVATE_DIR / "M1-dual-source-masterdata-backfill-candidates-v1.xlsx"
PRIVATE_CANDIDATES_JSON = PRIVATE_DIR / "M1-dual-source-masterdata-backfill-candidates-v1.json"
PRIVATE_DRY_RUN_XLSX = PRIVATE_DIR / "M1-dual-source-masterdata-backfill-dry-run-v1.xlsx"
PRIVATE_DRY_RUN_JSON = PRIVATE_DIR / "M1-dual-source-masterdata-backfill-dry-run-v1.json"
PRIVATE_SPOTCHECK_XLSX = PRIVATE_DIR / "M1-dual-source-user-spotcheck-pack-cn-v1.xlsx"

AUTO_FIELDS = {"standardWorkName", "authorName", "copyrightStartDate", "copyrightEndDate"}
MANUAL_ONLY_FIELDS = {"classificationLevel1", "classificationLevel2", "requiredTags", "workStatus", "audioRightsStatus"}
STRICT_ORIGINAL_METHODS = {"exact_original_id", "mapping_original_id", "title_author_exact"}
STRICT_DIGITAL_METHODS = {"exact_work_id", "mapping_work_id", "title_author_exact"}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--scope",
        choices=["all", "original-library", "dry-run", "m2-impact", "spotcheck"],
        default="all",
    )
    parser.add_argument("--print-json", action="store_true")
    args = parser.parse_args()

    if args.scope == "spotcheck" and PRIVATE_SPOTCHECK_XLSX.exists():
        summary = summarize_spotcheck_pack()
        print(json.dumps(summary, ensure_ascii=False))
        if args.print_json:
            print(json.dumps(summary, ensure_ascii=False, indent=2))
        return

    payload = build_payload()
    write_outputs(payload)
    summary = public_cli_summary(args.scope, payload)
    print(json.dumps(summary, ensure_ascii=False))
    if args.print_json:
        print(json.dumps(payload["public"], ensure_ascii=False, indent=2))


def load_v3_module():
    path = ROOT / "scripts" / "m2-real-data" / "run_cleaned_ledger_minimal_backfill_v3.py"
    spec = importlib.util.spec_from_file_location("cleaned_ledger_v3", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)  # type: ignore[union-attr]
    return module


v3 = load_v3_module()


def build_payload() -> dict:
    generated_at = now()
    mapping = v3.load_mapping()
    author_index = v3.load_author_index()
    works = v3.build_m2_work_index(mapping, author_index)

    digital_path = v3.locate_cleaned_ledger()
    digital_book = v3.read_xlsx_workbook(digital_path)
    digital_rows = v3.normalize_ledger_rows(digital_book)
    digital_matches = v3.match_works(works, v3.build_ledger_index(digital_rows, mapping))
    digital_candidates = [v3.enrich_auto_apply(candidate) for candidate in v3.build_candidates(digital_matches, works)]
    digital_candidate_summary = v3.build_candidate_summary(digital_candidates, works)
    digital_dry_run = v3.build_dry_run(digital_candidates, works)

    original_path = locate_original_library(digital_path)
    original_book = v3.read_xlsx_workbook(original_path)
    original_structure = build_original_structure_audit(original_path, original_book)
    original_rows = normalize_original_rows(original_book, original_structure)
    original_matches = match_original_library(works, original_rows, mapping)

    cohort = classify_work_cohorts(works, digital_matches, original_matches)
    original_coverage = build_original_match_coverage(works, original_matches, digital_matches)
    original_candidates = build_original_candidates(original_matches, works, original_structure)
    dual_candidates = build_dual_source_candidates(digital_candidates, original_candidates, cohort, works)
    dual_dry_run = build_dual_dry_run(works, dual_candidates, digital_dry_run, digital_candidate_summary)
    m2_impact = build_m2_impact(works, digital_dry_run, dual_dry_run, dual_candidates, cohort)
    spotcheck_rows = build_spotcheck_rows(dual_candidates, works, cohort)
    spotcheck_guide = build_spotcheck_guide(spotcheck_rows, dual_dry_run)
    summary = build_summary(original_structure, cohort, original_coverage, dual_dry_run, m2_impact)

    public = {
        "schema": "m1.m2.dual_source_masterdata_backfill.v1.public",
        "generatedAt": generated_at,
        "currentHead": git(["rev-parse", "HEAD"]),
        "originMain": git(["rev-parse", "origin/main"]),
        "safeOutputBoundary": safe_boundary(),
        "originalStructure": original_structure,
        "cohortClassification": cohort["public"],
        "originalMatchCoverage": original_coverage,
        "dualSourceDryRun": dual_dry_run,
        "m2Impact": m2_impact,
        "spotcheckGuide": spotcheck_guide,
        "summary": summary,
    }
    private = {
        "schema": "m1.m2.dual_source_masterdata_backfill.v1.private",
        "generatedAt": generated_at,
        "safeOutputBoundary": {
            **safe_boundary(),
            "realWorkNamesIncluded": True,
            "authorNamesIncluded": True,
            "privateDetailsStoredOnlyInGitignoredOutput": True,
        },
        "sourceFiles": {
            "digitalLedger": rel(digital_path),
            "originalLibrary": rel(original_path),
        },
        "workCohorts": cohort["private"],
        "candidateRows": dual_candidates,
        "dryRun": dual_dry_run,
        "spotcheckRows": spotcheck_rows,
    }
    return {
        "public": public,
        "private": private,
        "originalStructure": original_structure,
        "cohort": cohort,
        "originalCoverage": original_coverage,
        "dualCandidates": dual_candidates,
        "dualDryRun": dual_dry_run,
        "m2Impact": m2_impact,
        "spotcheckRows": spotcheck_rows,
        "spotcheckGuide": spotcheck_guide,
        "summary": summary,
    }


def locate_original_library(digital_path: Path) -> Path:
    candidates = []
    for path in sorted((ROOT / "data" / "master-data").glob("*.xlsx")):
        if path.resolve() == digital_path.resolve():
            continue
        try:
            book = v3.read_xlsx_workbook(path, max_rows=2)
        except Exception:
            continue
        if not book["sheets"]:
            continue
        headers = [clean(header) for header in book["sheets"][0]["headers"]]
        score = 0
        if any("作品ID" in header or "原创ID" in header or "内容ID" in header for header in headers):
            score += 2
        if any("书名" in header or "作品名" in header for header in headers):
            score += 2
        if any("作者" in header or "笔名" in header for header in headers):
            score += 2
        if any("授权" in header or "结束时间" in header or "到期" in header for header in headers):
            score += 2
        if score >= 6:
            candidates.append((score, path.stat().st_size, path))
    if not candidates:
        raise SystemExit("No original library workbook was found under data/master-data.")
    candidates.sort(reverse=True)
    return candidates[0][2]


def build_original_structure_audit(path: Path, book: dict) -> dict:
    sheet_reports = []
    total_rows = 0
    aggregate_headers = []
    for sheet in book["sheets"]:
        headers = [clean(header) for header in sheet["headers"] if clean(header)]
        roles = recognize_fields(headers)
        non_empty = {}
        for header in headers:
            count = sum(1 for row in sheet["rows"] if has_value(row.get(header)))
            non_empty[header] = {"nonEmptyRows": count, "rate": ratio(count, len(sheet["rows"]))}
        total_rows += len(sheet["rows"])
        aggregate_headers.extend(headers)
        sheet_reports.append(
            {
                "sheetName": sheet["name"],
                "dataRows": len(sheet["rows"]),
                "fieldCount": len(headers),
                "fields": headers,
                "recognizedKeyFields": roles,
                "nonEmptyRates": non_empty,
                "supportedBackfillFields": supported_backfill_fields(roles),
            }
        )
    aggregate_roles = recognize_fields(sorted(set(aggregate_headers)))
    return {
        "schema": "m1.original_library.structure_audit.v1",
        "sourceWorkbook": rel(path),
        "sheetNames": [sheet["name"] for sheet in book["sheets"]],
        "totalDataRows": total_rows,
        "sheetCount": len(book["sheets"]),
        "sheets": sheet_reports,
        "recognizedKeyFields": aggregate_roles,
        "supportedBackfillFields": supported_backfill_fields(aggregate_roles),
        "sanitized": {
            "realWorkNamesIncluded": False,
            "authorNamesIncluded": False,
            "rawRowsIncluded": False,
        },
    }


def recognize_fields(headers: list[str]) -> dict:
    patterns = {
        "idFields": ["作品ID", "书号", "内容ID", "项目ID", "原创ID"],
        "titleFields": ["作品名", "书名", "标题"],
        "authorFields": ["作者", "笔名", "署名"],
        "licensorFields": ["签约主体", "授权方", "版权方"],
        "copyrightStartFields": ["版权开始", "签约日期", "授权开始", "授权时间"],
        "copyrightEndFields": ["版权结束", "到期", "结束时间", "授权到期"],
        "workStatusFields": ["作品状态", "状态"],
        "categoryFields": ["一级分类", "二级分类", "分类", "频道", "题材"],
        "tagFields": ["标签", "三级分类"],
        "audioRightsFields": ["有声", "音频权", "授权范围", "音频"],
        "contractStatusFields": ["合同状态", "授权状态"],
    }
    result = {}
    for role, needles in patterns.items():
        result[role] = [header for header in headers if any(needle in header for needle in needles)]
    return result


def supported_backfill_fields(roles: dict) -> list[str]:
    supported = []
    if roles.get("titleFields"):
        supported.append("standardWorkName")
    if roles.get("authorFields"):
        supported.append("authorName")
    if roles.get("copyrightStartFields"):
        supported.append("copyrightStartDate")
    if roles.get("copyrightEndFields"):
        supported.append("copyrightEndDate")
    if roles.get("categoryFields"):
        supported.extend(["classificationLevel1", "classificationLevel2"])
    if roles.get("tagFields"):
        supported.append("requiredTags")
    if roles.get("workStatusFields"):
        supported.append("workStatus")
    if roles.get("audioRightsFields"):
        supported.append("audioRightsStatus")
    return sorted(set(supported))


def normalize_original_rows(book: dict, structure: dict) -> list[dict]:
    rows = []
    for sheet in book["sheets"]:
        headers = [clean(header) for header in sheet["headers"] if clean(header)]
        roles = recognize_fields(headers)
        id_field = first(roles["idFields"])
        title_fields = roles["titleFields"]
        author_field = first(roles["authorFields"])
        start_field = first(roles["copyrightStartFields"])
        end_field = first(roles["copyrightEndFields"])
        class1_field = first([field for field in roles["categoryFields"] if "一级" in field]) or first(roles["categoryFields"])
        class2_field = first([field for field in roles["categoryFields"] if "二级" in field])
        tag_field = first(roles["tagFields"])
        status_field = first(roles["workStatusFields"])
        audio_field = first(roles["audioRightsFields"])
        for row_number, row in enumerate(sheet["rows"], start=2):
            title = ""
            for field in title_fields:
                if "更" in field and has_value(row.get(field)):
                    title = clean(row.get(field))
                    break
            if not title:
                title = clean(row.get(first(title_fields)))
            start = v3.parse_date_value(row.get(start_field))
            end = v3.parse_date_value(row.get(end_field))
            normalized = {
                "_source": "original_library",
                "_sheetName": sheet["name"],
                "_rowNumber": row_number,
                "_rowId": f"O{row_number:06d}",
                "_originalId": clean(row.get(id_field)),
                "_originalIdNormalized": v3.normalize_raw_work_id(row.get(id_field)),
                "_title": title,
                "_titleNormalized": v3.normalize_title(title),
                "_author": clean(row.get(author_field)),
                "_authorTokens": v3.author_tokens(row.get(author_field)),
                "_copyrightStartRaw": clean(row.get(start_field)),
                "_copyrightStartParsed": start,
                "_copyrightEndRaw": clean(row.get(end_field)),
                "_copyrightEndParsed": end,
                "_classificationLevel1": clean(row.get(class1_field)),
                "_classificationLevel2": clean(row.get(class2_field)),
                "_requiredTags": clean(row.get(tag_field)),
                "_workStatus": clean(row.get(status_field)),
                "_audioRightsStatus": clean(row.get(audio_field)),
                "_sourceFields": {
                    "id": id_field,
                    "title": ",".join(title_fields),
                    "author": author_field,
                    "copyrightStartDate": start_field,
                    "copyrightEndDate": end_field,
                    "classificationLevel1": class1_field,
                    "classificationLevel2": class2_field,
                    "requiredTags": tag_field,
                    "workStatus": status_field,
                    "audioRightsStatus": audio_field,
                },
            }
            if has_value(normalized["_originalId"]) or has_value(normalized["_title"]):
                rows.append(normalized)
    return rows


def match_original_library(works: dict, rows: list[dict], mapping: dict) -> dict:
    by_exact_id = defaultdict(list)
    by_mapped_id = defaultdict(list)
    by_title = defaultdict(list)
    by_title_author = defaultdict(list)
    by_title_bucket = defaultdict(list)
    for row in rows:
        original_id = row["_originalIdNormalized"]
        if original_id:
            by_exact_id[original_id].append(row)
            mapped = mapping.get(original_id)
            if mapped:
                by_mapped_id[mapped].append(row)
        title = row["_titleNormalized"]
        if title:
            by_title[title].append(row)
            by_title_bucket[(title[0], len(title) // 4)].append((title, row))
            for author in row["_authorTokens"]:
                by_title_author[(title, author)].append(row)

    results = {}
    for standard, work in works.items():
        raw_ids = set(work["rawWorkIds"]) | {standard}
        exact_rows = []
        for raw_id in raw_ids:
            exact_rows.extend(by_exact_id.get(raw_id, []))
        if exact_rows:
            results[standard] = original_match_result(standard, exact_rows, "exact_original_id", 1.0)
            continue
        mapped_rows = by_mapped_id.get(standard, [])
        if mapped_rows:
            results[standard] = original_match_result(standard, mapped_rows, "mapping_original_id", 1.0)
            continue
        title = work["titleNormalized"]
        exact_author_rows = []
        if title:
            for author in work["authorTokens"]:
                exact_author_rows.extend(by_title_author.get((title, author), []))
        if exact_author_rows:
            results[standard] = original_match_result(standard, exact_author_rows, "title_author_exact", 0.98)
            continue
        fuzzy_rows = []
        if title:
            candidates = []
            for length_bucket in range(len(title) // 4 - 1, len(title) // 4 + 2):
                candidates.extend(by_title_bucket.get((title[0], length_bucket), []))
            seen = set()
            for candidate_title, row in candidates:
                if row["_rowId"] in seen:
                    continue
                seen.add(row["_rowId"])
                if abs(len(title) - len(candidate_title)) > max(4, round(len(title) * 0.25)):
                    continue
                score = v3.title_similarity(title, candidate_title)
                if score >= 0.92 and (not work["authorTokens"] or v3.author_overlap(work["authorTokens"], row["_authorTokens"])):
                    fuzzy_rows.append((score, row))
        if fuzzy_rows:
            fuzzy_rows.sort(key=lambda item: item[0], reverse=True)
            best = fuzzy_rows[0][0]
            results[standard] = original_match_result(
                standard,
                [row for score, row in fuzzy_rows if score >= best - 0.02][:5],
                "title_author_fuzzy",
                round(best, 4),
            )
            continue
        title_only = by_title.get(title, []) if title else []
        title_only_ids = {row["_originalIdNormalized"] for row in title_only}
        author_sets = {tuple(sorted(row["_authorTokens"])) for row in title_only if row["_authorTokens"]}
        if len(title_only) == 1 or (len(title_only_ids) == 1 and len(author_sets) <= 1):
            results[standard] = original_match_result(standard, title_only[:5], "title_only_high_confidence", 0.88)
            continue
        results[standard] = original_match_result(standard, [], "unmatched", 0.0)
    return results


def original_match_result(standard: str, rows: list[dict], method: str, confidence: float) -> dict:
    conflicts = detect_original_conflicts(rows)
    return {
        "standardWorkId": standard,
        "matched": method != "unmatched",
        "matchStatus": "matched" if method != "unmatched" else "unmatched",
        "matchMethod": method,
        "matchConfidence": confidence,
        "originalRows": rows,
        "originalRowIds": [row["_rowId"] for row in rows],
        "conflictCount": conflicts["conflictCount"],
        "conflictReason": conflicts["conflictReason"],
        "requiresManualReview": method in {"title_author_fuzzy", "title_only_high_confidence"} or conflicts["conflictCount"] > 0,
    }


def detect_original_conflicts(rows: list[dict]) -> dict:
    if len(rows) <= 1:
        return {"conflictCount": 0, "conflictReason": "none"}
    fields = [
        "_title",
        "_author",
        "_copyrightStartParsed",
        "_copyrightEndParsed",
        "_classificationLevel1",
        "_classificationLevel2",
        "_requiredTags",
    ]
    conflict_count = 0
    reasons = []
    for field in fields:
        values = set()
        for row in rows:
            value = row[field]["normalized"] if isinstance(row.get(field), dict) else clean(row.get(field))
            if value:
                values.add(value)
        if len(values) > 1:
            conflict_count += 1
            reasons.append(field.replace("_", ""))
    return {
        "conflictCount": conflict_count,
        "conflictReason": ",".join(reasons) if reasons else "none",
    }


def classify_work_cohorts(works: dict, digital_matches: dict, original_matches: dict) -> dict:
    total_revenue = sum(work["totalHistoricalRevenue"] for work in works.values())
    private_rows = []
    groups = defaultdict(list)
    for standard, work in works.items():
        digital_matched = digital_matches[standard]["matched"]
        original_matched = original_matches[standard]["matched"]
        if digital_matched and not original_matched:
            cohort = "publication_cohort"
            reason = "digital_ledger_only_match"
        elif original_matched and not digital_matched:
            cohort = "web_original_cohort"
            reason = "original_library_only_match"
        else:
            cohort = "mixed_or_uncertain_cohort"
            reason = "dual_source_match" if digital_matched and original_matched else "no_strong_source_match"
        groups[cohort].append(standard)
        private_rows.append(
            {
                "standardWorkId": standard,
                "rawWorkIds": ",".join(work["rawWorkIds"][:5]),
                "workName": work["currentWorkName"],
                "authorName": work["currentAuthorName"],
                "cohort": cohort,
                "cohortReason": reason,
                "digitalMatched": digital_matched,
                "digitalMatchMethod": digital_matches[standard]["matchMethod"],
                "originalMatched": original_matched,
                "originalMatchMethod": original_matches[standard]["matchMethod"],
                "totalHistoricalRevenue": round(work["totalHistoricalRevenue"], 2),
            }
        )

    cohort_rows = []
    for cohort, standards in groups.items():
        revenue = sum(works[standard]["totalHistoricalRevenue"] for standard in standards)
        cohort_rows.append(
            {
                "cohort": cohort,
                "workCount": len(standards),
                "revenueShare": ratio(revenue, total_revenue),
            }
        )

    digital_matched_ids = {standard for standard, match in digital_matches.items() if match["matched"]}
    original_matched_ids = {standard for standard, match in original_matches.items() if match["matched"]}
    public = {
        "schema": "m1.m2.work_source_cohort_classification.v1",
        "totalM2Works": len(works),
        "cohorts": sorted(cohort_rows, key=lambda row: row["cohort"]),
        "topRevenueCohortDistribution": top_revenue_cohort_distribution(works, private_rows),
        "digitalMatchedPublicationCohortWorks": len(set(groups["publication_cohort"]).intersection(digital_matched_ids)),
        "digitalUnmatchedLikelyWebOriginalWorks": len((set(works) - digital_matched_ids).intersection(original_matched_ids)),
        "digitalMatchedWorks": len(digital_matched_ids),
        "originalMatchedWorks": len(original_matched_ids),
        "bothSourceMatchedWorks": len(digital_matched_ids.intersection(original_matched_ids)),
        "unmatchedByBothSources": len(set(works) - digital_matched_ids - original_matched_ids),
        "sanitized": {
            "realWorkNamesIncluded": False,
            "authorNamesIncluded": False,
            "rowLevelDetailsIncluded": False,
        },
    }
    return {"public": public, "private": private_rows, "byStandard": {row["standardWorkId"]: row for row in private_rows}}


def top_revenue_cohort_distribution(works: dict, private_rows: list[dict]) -> dict:
    by_standard = {row["standardWorkId"]: row for row in private_rows}
    ordered = sorted(works.values(), key=lambda work: work["totalHistoricalRevenue"], reverse=True)
    result = {}
    for label, fraction in [("top1Percent", 0.01), ("top5Percent", 0.05), ("top10Percent", 0.10)]:
        size = max(1, math.ceil(len(ordered) * fraction))
        subset = ordered[:size]
        total = sum(work["totalHistoricalRevenue"] for work in subset)
        counts = Counter(by_standard[work["standardWorkId"]]["cohort"] for work in subset)
        revenue = defaultdict(float)
        for work in subset:
            revenue[by_standard[work["standardWorkId"]]["cohort"]] += work["totalHistoricalRevenue"]
        result[label] = {
            "workCount": size,
            "countByCohort": dict(counts),
            "revenueShareByCohort": {key: ratio(value, total) for key, value in revenue.items()},
        }
    return result


def build_original_match_coverage(works: dict, original_matches: dict, digital_matches: dict) -> dict:
    matched = {standard for standard, match in original_matches.items() if match["matched"]}
    digital = {standard for standard, match in digital_matches.items() if match["matched"]}
    total_revenue = sum(work["totalHistoricalRevenue"] for work in works.values())
    method_counts = Counter(match["matchMethod"] for match in original_matches.values())
    conflict_count = sum(1 for match in original_matches.values() if match["conflictCount"] > 0)
    return {
        "schema": "m1.original_library.match_coverage.v1",
        "totalM2Works": len(works),
        "matchedWorks": len(matched),
        "unmatchedWorks": len(works) - len(matched),
        "matchedRevenueShare": ratio(sum(works[standard]["totalHistoricalRevenue"] for standard in matched), total_revenue),
        "matchMethodDistribution": dict(method_counts),
        "conflictMatchedWorks": conflict_count,
        "originalOnlyMatchedWorks": len(matched - digital),
        "bothSourceMatchedWorks": len(matched.intersection(digital)),
        "digitalOnlyMatchedWorks": len(digital - matched),
        "unmatchedByBothSources": len(set(works) - matched - digital),
        "topRevenueCoverage": v3.top_revenue_coverage(works, matched),
        "sanitized": {
            "realWorkNamesIncluded": False,
            "authorNamesIncluded": False,
            "rawRowsIncluded": False,
        },
    }


def build_original_candidates(original_matches: dict, works: dict, structure: dict) -> list[dict]:
    supported = set(structure["supportedBackfillFields"])
    candidates = []
    for standard, match in original_matches.items():
        if not match["matched"]:
            continue
        work = works[standard]
        rows = match["originalRows"]
        for field in ["standardWorkName", "authorName", "copyrightStartDate", "copyrightEndDate", "classificationLevel1", "classificationLevel2", "requiredTags", "workStatus", "audioRightsStatus"]:
            if field not in supported:
                continue
            candidate = original_candidate_for_field(field, work, match, rows)
            if candidate:
                candidates.append(candidate)
    return candidates


def original_candidate_for_field(field: str, work: dict, match: dict, rows: list[dict]) -> dict | None:
    values = []
    for row in rows:
        value = ""
        normalized = ""
        raw = ""
        parser_status = "parsed"
        source_field = row["_sourceFields"].get(field, "")
        if field == "standardWorkName":
            raw = row["_title"]
            value = raw
            normalized = raw
            source_field = row["_sourceFields"]["title"]
        elif field == "authorName":
            raw = row["_author"]
            value = raw
            normalized = raw
            source_field = row["_sourceFields"]["author"]
        elif field == "copyrightStartDate":
            raw = row["_copyrightStartRaw"]
            parsed = row["_copyrightStartParsed"]
            parser_status = parsed["status"]
            value = parsed["value"]
            normalized = parsed["normalized"]
        elif field == "copyrightEndDate":
            raw = row["_copyrightEndRaw"]
            parsed = row["_copyrightEndParsed"]
            parser_status = parsed["status"]
            value = parsed["value"]
            normalized = parsed["normalized"]
        elif field == "classificationLevel1":
            raw = row["_classificationLevel1"]
            value = raw
            normalized = raw
        elif field == "classificationLevel2":
            raw = row["_classificationLevel2"]
            value = raw
            normalized = raw
        elif field == "requiredTags":
            raw = row["_requiredTags"]
            value = raw
            normalized = raw
        elif field == "workStatus":
            raw = row["_workStatus"]
            value = raw
            normalized = raw
        elif field == "audioRightsStatus":
            raw = row["_audioRightsStatus"]
            value = raw
            normalized = raw
        if has_value(value):
            values.append(
                {
                    "raw": raw,
                    "value": value,
                    "normalized": normalized,
                    "rowId": row["_rowId"],
                    "status": parser_status,
                    "sourceField": source_field,
                }
            )
    if not values:
        return None
    normalized_values = {clean(item["normalized"]) for item in values if has_value(item["normalized"])}
    conflict_status = "value_conflict" if len(normalized_values) > 1 or match["conflictCount"] > 0 else "none"
    selected = values[0]
    current_field = {
        "standardWorkName": "currentWorkName",
        "authorName": "currentAuthorName",
        "copyrightStartDate": "currentCopyrightStartDate",
        "copyrightEndDate": "currentCopyrightEndDate",
        "classificationLevel1": "currentClassificationLevel1",
        "classificationLevel2": "currentClassificationLevel2",
        "requiredTags": "",
        "workStatus": "",
        "audioRightsStatus": "",
    }[field]
    current_value = work.get(current_field, "") if current_field else ""
    requires_manual = (
        field in MANUAL_ONLY_FIELDS
        or conflict_status != "none"
        or match["requiresManualReview"]
        or selected["status"] != "parsed"
    )
    return {
        "standardWorkId": work["standardWorkId"],
        "rawWorkId": ",".join(work["rawWorkIds"][:5]),
        "source": "original_library",
        "sourceRowIds": match["originalRowIds"],
        "fieldName": field,
        "currentValue": current_value,
        "proposedValue": selected["value"],
        "proposedValueNormalized": selected["normalized"],
        "sourceField": selected["sourceField"],
        "sourceRawValue": selected["raw"],
        "parserStatus": selected["status"],
        "matchMethod": match["matchMethod"],
        "matchConfidence": match["matchConfidence"],
        "valueConfidence": estimate_original_value_confidence(field, selected["status"], match["matchMethod"], conflict_status),
        "conflictStatus": conflict_status,
        "conflictCount": match["conflictCount"],
        "conflictReason": match["conflictReason"],
        "requiresManualReview": requires_manual,
        "reason": original_candidate_reason(field, selected["status"], conflict_status, match["matchMethod"]),
    }


def estimate_original_value_confidence(field: str, status: str, method: str, conflict: str) -> float:
    if conflict != "none" or status != "parsed":
        return 0.5
    if field in MANUAL_ONLY_FIELDS:
        return 0.9
    if method in {"exact_original_id", "mapping_original_id"}:
        return 0.99
    if method == "title_author_exact":
        return 0.97
    return 0.8


def original_candidate_reason(field: str, status: str, conflict: str, method: str) -> str:
    if conflict != "none":
        return "original library has conflicting candidate values; manual review required"
    if status != "parsed":
        return f"source parser status is {status}; manual review required"
    if field in MANUAL_ONLY_FIELDS:
        return "classification/tags/status fields are generated for review only"
    if method in {"title_author_fuzzy", "title_only_high_confidence"}:
        return "weak original library match; manual review required"
    return "strict original library candidate generated by local dry-run"


def build_dual_source_candidates(digital_candidates: list[dict], original_candidates: list[dict], cohort: dict, works: dict) -> list[dict]:
    digital_by_key = defaultdict(list)
    original_by_key = defaultdict(list)
    for candidate in digital_candidates:
        digital_by_key[(candidate["standardWorkId"], candidate["fieldName"])].append(candidate)
    for candidate in original_candidates:
        original_by_key[(candidate["standardWorkId"], candidate["fieldName"])].append(candidate)

    keys = sorted(set(digital_by_key) | set(original_by_key))
    rows = []
    for key in keys:
        standard, field = key
        work_cohort = cohort["byStandard"][standard]["cohort"]
        digital = digital_by_key.get(key, [])
        original = original_by_key.get(key, [])
        if digital and not original:
            if work_cohort != "publication_cohort":
                continue
            combined = normalize_digital_candidate(digital[0])
        elif original and not digital:
            if work_cohort not in {"web_original_cohort", "mixed_or_uncertain_cohort"}:
                continue
            combined = original[0]
        else:
            combined = combine_candidates(digital[0], original[0])
        combined["cohort"] = work_cohort
        combined["totalHistoricalRevenue"] = round(works[standard]["totalHistoricalRevenue"], 2)
        combined.update(evaluate_dual_auto_apply(combined))
        rows.append(combined)
    return rows


def normalize_digital_candidate(candidate: dict) -> dict:
    return {
        "standardWorkId": candidate["standardWorkId"],
        "rawWorkId": candidate["rawWorkId"],
        "source": "digital_copyright_ledger",
        "sourceRowIds": candidate["ledgerRowIds"],
        "fieldName": candidate["fieldName"],
        "currentValue": candidate["currentValue"],
        "proposedValue": candidate["proposedValue"],
        "proposedValueNormalized": candidate["proposedValueNormalized"],
        "sourceField": candidate["sourceField"],
        "sourceRawValue": candidate["sourceRawValue"],
        "parserStatus": candidate["parserStatus"],
        "matchMethod": candidate["matchMethod"],
        "matchConfidence": candidate["matchConfidence"],
        "valueConfidence": candidate["valueConfidence"],
        "conflictStatus": candidate["conflictStatus"],
        "conflictCount": 0 if candidate["conflictStatus"] == "none" else 1,
        "conflictReason": candidate["conflictStatus"],
        "requiresManualReview": candidate["requiresManualReview"],
        "reason": candidate["reason"],
    }


def combine_candidates(digital_candidate: dict, original_candidate: dict) -> dict:
    digital = normalize_digital_candidate(digital_candidate)
    digital_value = normalize_compare(digital["proposedValueNormalized"] or digital["proposedValue"])
    original_value = normalize_compare(original_candidate["proposedValueNormalized"] or original_candidate["proposedValue"])
    consistent = bool(digital_value and original_value and digital_value == original_value)
    base = original_candidate if not consistent else digital
    return {
        **base,
        "source": "both_sources_consistent" if consistent else "both_sources_conflict",
        "sourceRowIds": [*digital["sourceRowIds"], *original_candidate["sourceRowIds"]],
        "sourceField": f"{digital['sourceField']} + {original_candidate['sourceField']}",
        "sourceRawValue": f"{digital['sourceRawValue']} | {original_candidate['sourceRawValue']}",
        "matchMethod": f"{digital['matchMethod']}+{original_candidate['matchMethod']}",
        "matchConfidence": max(to_float(digital["matchConfidence"]), to_float(original_candidate["matchConfidence"])),
        "valueConfidence": max(to_float(digital["valueConfidence"]), to_float(original_candidate["valueConfidence"])) if consistent else min(to_float(digital["valueConfidence"]), to_float(original_candidate["valueConfidence"])),
        "conflictStatus": "none" if consistent else "dual_source_value_conflict",
        "conflictCount": 0 if consistent else 1,
        "conflictReason": "none" if consistent else "digital and original sources propose different values",
        "requiresManualReview": (not consistent) or digital["requiresManualReview"] or original_candidate["requiresManualReview"],
        "reason": "dual sources agree on the proposed value" if consistent else "dual source conflict; manual review required",
    }


def evaluate_dual_auto_apply(candidate: dict) -> dict:
    reasons = []
    field = candidate["fieldName"]
    source = candidate["source"]
    match_method = candidate["matchMethod"]
    current = normalize_compare(candidate.get("currentValue"))
    proposed = normalize_compare(candidate.get("proposedValueNormalized") or candidate.get("proposedValue"))
    if field not in AUTO_FIELDS:
        reasons.append("field_requires_manual_review" if field in MANUAL_ONLY_FIELDS else "field_not_supported")
    if source == "both_sources_conflict" or candidate["conflictStatus"] == "dual_source_value_conflict":
        reasons.append("dual_source_conflict_never_auto_apply")
    if "fuzzy" in match_method or "title_only" in match_method:
        reasons.append("weak_match_never_auto_apply")
    if source == "original_library" and not any(method in match_method.split("+") for method in STRICT_ORIGINAL_METHODS):
        reasons.append("original_match_not_strict_enough")
    if source == "digital_copyright_ledger" and not any(method in match_method.split("+") for method in STRICT_DIGITAL_METHODS):
        reasons.append("digital_match_not_strict_enough")
    if source == "both_sources_consistent":
        if not any(method in match_method.split("+") for method in STRICT_ORIGINAL_METHODS):
            reasons.append("dual_source_original_match_not_strict")
        if not any(method in match_method.split("+") for method in STRICT_DIGITAL_METHODS):
            reasons.append("dual_source_digital_match_not_strict")
    if candidate.get("requiresManualReview") is True:
        reasons.append("requires_manual_review")
    if candidate.get("parserStatus") != "parsed":
        reasons.append(f"parser_status_{candidate.get('parserStatus')}")
    if to_float(candidate.get("valueConfidence")) < 0.97:
        reasons.append("value_confidence_below_0_97")
    if current and current != proposed:
        reasons.append("current_authoritative_value_not_empty")
    if is_relative_expiry(candidate.get("sourceRawValue"), candidate.get("parserStatus")):
        reasons.append("relative_expiry_without_anchor_not_auto_apply")
    return {
        "autoApplyEligibleDualSource": len(reasons) == 0,
        "autoApplyExclusionReasonsDualSource": sorted(set(reasons)),
        "recommendedBucketDualSource": "auto_apply_dual_source_dry_run" if not reasons else "manual_review_or_dry_run_only",
    }


def build_dual_dry_run(works: dict, candidates: list[dict], digital_dry_run: dict, digital_candidate_summary: dict) -> dict:
    before = {
        "missingWorkName": sum(1 for work in works.values() if not has_value(work["currentWorkName"])),
        "missingAuthor": sum(1 for work in works.values() if not has_value(work["currentAuthorName"])),
        "missingCopyrightStart": len(works),
        "missingCopyrightEnd": len(works),
        "missingClassification1": len(works),
        "missingClassification2": len(works),
        "missingRequiredTags": len(works),
        "missingWorkStatus": len(works),
        "missingAudioRightsStatus": len(works),
    }
    gap_map = {
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
    auto_reductions = defaultdict(set)
    candidate_coverage = defaultdict(set)
    manual_review = defaultdict(set)
    for candidate in candidates:
        gap = gap_map[candidate["fieldName"]]
        candidate_coverage[gap].add(candidate["standardWorkId"])
        if candidate["autoApplyEligibleDualSource"]:
            auto_reductions[gap].add(candidate["standardWorkId"])
        else:
            manual_review[gap].add(candidate["standardWorkId"])
    fields = {}
    for gap, count in before.items():
        reduction = min(count, len(auto_reductions[gap]))
        fields[gap] = {
            "before": count,
            "autoApplyAfter": max(0, count - reduction),
            "autoApplyReduction": reduction,
            "candidateCoverageWorks": len(candidate_coverage[gap]),
            "manualCandidateWorks": len(manual_review[gap]),
        }
    auto = [candidate for candidate in candidates if candidate["autoApplyEligibleDualSource"]]
    manual = [candidate for candidate in candidates if not candidate["autoApplyEligibleDualSource"]]
    matched_works = {candidate["standardWorkId"] for candidate in candidates}
    auto_standards = {candidate["standardWorkId"] for candidate in auto}
    digital_end = digital_dry_run["fieldGapResults"]["missingCopyrightEnd"]["autoApplyReduction"]
    dual_end = fields["missingCopyrightEnd"]["autoApplyReduction"]
    return {
        "schema": "m1.dual_source_masterdata_backfill.dry_run.v1",
        "formalMasterDataWritten": False,
        "databaseWritten": False,
        "singleDigitalLedgerV3": {
            "matchedWorks": digital_candidate_summary["candidateWorks"],
            "autoApplyEligibleRows": digital_candidate_summary["autoApplyEligibleRows"],
            "autoApplyEligibleWorks": digital_candidate_summary["autoApplyEligibleWorks"],
            "copyrightEndFillableWorks": digital_end,
            "remainingManualReviewWorks": digital_dry_run["manualWorkloadReduction"]["remainingManualReviewWorks"],
        },
        "dualSource": {
            "matchedWorks": len(matched_works),
            "autoApplyEligibleRows": len(auto),
            "autoApplyEligibleWorks": len(auto_standards),
            "manualReviewRows": len(manual),
            "copyrightEndFillableWorks": dual_end,
            "authorOrWorkNameFillableWorks": len(
                {
                    candidate["standardWorkId"]
                    for candidate in auto
                    if candidate["fieldName"] in {"standardWorkName", "authorName"}
                }
            ),
            "classificationOrTagsCandidateWorks": len(
                {
                    candidate["standardWorkId"]
                    for candidate in candidates
                    if candidate["fieldName"] in {"classificationLevel1", "classificationLevel2", "requiredTags"}
                }
            ),
            "fieldGapResults": fields,
            "bySource": dict(Counter(candidate["source"] for candidate in candidates)),
            "byField": dict(Counter(candidate["fieldName"] for candidate in candidates)),
            "byCohort": dict(Counter(candidate["cohort"] for candidate in candidates)),
        },
        "deltaVsDigitalLedgerV3": {
            "additionalMatchedWorks": len(matched_works) - digital_candidate_summary["candidateWorks"],
            "additionalAutoApplyEligibleRows": len(auto) - digital_candidate_summary["autoApplyEligibleRows"],
            "additionalAutoApplyEligibleWorks": len(auto_standards) - digital_candidate_summary["autoApplyEligibleWorks"],
            "additionalCopyrightEndFillableWorks": dual_end - digital_end,
            "manualReviewRowsDelta": len(manual) - digital_dry_run["manualWorkloadReduction"]["manualCandidateRows"],
        },
        "safetyGuards": {
            "fuzzyAutoApplyBlocked": True,
            "dualSourceConflictAutoApplyBlocked": True,
            "nonEmptyAuthoritativeValueNotOverwritten": True,
            "relativeExpiryMissingAnchorAutoApplyBlocked": True,
            "classificationLevel3NotFabricated": True,
            "formalMasterDataWriteBlocked": True,
            "m3NotEntered": True,
        },
    }


def build_m2_impact(works: dict, digital_dry_run: dict, dual_dry_run: dict, candidates: list[dict], cohort: dict) -> dict:
    digital_end = digital_dry_run["fieldGapResults"]["missingCopyrightEnd"]["autoApplyReduction"]
    dual_end = dual_dry_run["dualSource"]["copyrightEndFillableWorks"]
    additional_end = max(0, dual_end - digital_end)
    original_end_auto = {
        candidate["standardWorkId"]
        for candidate in candidates
        if candidate["fieldName"] == "copyrightEndDate"
        and candidate["autoApplyEligibleDualSource"]
        and candidate["source"] in {"original_library", "both_sources_consistent"}
    }
    top30 = {work["standardWorkId"] for work in sorted(works.values(), key=lambda item: item["totalHistoricalRevenue"], reverse=True)[:30]}
    top20 = {work["standardWorkId"] for work in sorted(works.values(), key=lambda item: item["totalHistoricalRevenue"], reverse=True)[:20]}
    return {
        "schema": "m2.dual_source_backfill_impact_on_evaluation.v1",
        "comparisonBaseline": "cleaned_digital_ledger_v3_only",
        "copyrightTermForecast": {
            "digitalV3AutoEndDateWorks": digital_end,
            "dualSourceAutoEndDateWorks": dual_end,
            "increaseWorks": additional_end,
        },
        "operatingWindowForecastPendingExpiry": {
            "estimatedReductionWorks": additional_end,
            "requiresRerunAfterApprovedApply": additional_end > 0,
        },
        "relativeExpiryPendingAnchor": {
            "estimatedReductionRows": sum(
                1
                for candidate in candidates
                if candidate["fieldName"] == "copyrightEndDate" and candidate["parserStatus"] == "parsed" and candidate["source"] == "original_library"
            ),
            "note": "Dual-source parsing uses concrete original-library expiry dates where available; relative digital-ledger anchors remain non-auto.",
        },
        "renewalReview": {
            "improvedCandidateWorks": len(original_end_auto),
            "reliabilityImprovementRequiresApprovedApply": True,
        },
        "ratingRemainingCopyrightAdjustment": {
            "newlyUsableWorks": additional_end,
            "requiresForecastOutputTypeRerun": additional_end > 0,
        },
        "manualReview": {
            "digitalUnmatchedLikelyWebOriginalWorks": cohort["public"]["digitalUnmatchedLikelyWebOriginalWorks"],
            "unmatchedByBothSources": cohort["public"]["unmatchedByBothSources"],
            "estimatedManualTriageReductionWorks": max(0, cohort["public"]["digitalUnmatchedLikelyWebOriginalWorks"] - cohort["public"]["unmatchedByBothSources"]),
        },
        "samplePacks": {
            "operator30WorkPackLikelyNeedsUpdatedSamples": len(top30.intersection(original_end_auto)),
            "twentyYearSampleLikelyNeedsUpdatedSamples": len(top20.intersection(original_end_auto)),
        },
        "forecastabilityGate": {
            "v1_1RerunRecommended": additional_end > 0,
            "reason": "copyright expiry coverage changes forecastOutputType and remaining-copyright adjustment inputs",
        },
        "status": "local_dry_run_only_no_formal_write_no_m3",
    }


def build_spotcheck_rows(candidates: list[dict], works: dict, cohort: dict) -> list[dict]:
    candidate_rows = []
    for candidate in candidates:
        priority = spotcheck_priority(candidate)
        if priority <= 0:
            continue
        work = works[candidate["standardWorkId"]]
        candidate_rows.append((priority, work["totalHistoricalRevenue"], candidate))
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

    rows = []
    for index, candidate in enumerate(selected, start=1):
        rows.append(
            {
                "抽检编号": f"DS-{index:03d}",
                "标准作品ID": candidate["standardWorkId"],
                "原始作品ID": candidate["rawWorkId"],
                "来源分群": cohort_cn(candidate["cohort"]),
                "候选来源": source_cn(candidate["source"]),
                "候选字段": field_cn(candidate["fieldName"]),
                "当前值": candidate["currentValue"],
                "建议值": candidate["proposedValue"],
                "来源摘要": f"{candidate['sourceField']}；行数 {len(candidate['sourceRowIds'])}",
                "匹配方式": candidate["matchMethod"],
                "匹配置信度": confidence_cn(candidate["matchConfidence"]),
                "值置信度": confidence_cn(candidate["valueConfidence"]),
                "冲突状态": candidate["conflictStatus"],
                "是否需人工复核": "是" if candidate["requiresManualReview"] else "否",
                "是否可自动应用": "是" if candidate["autoApplyEligibleDualSource"] else "否",
                "系统建议": "可进入本地 dry-run apply 候选" if candidate["autoApplyEligibleDualSource"] else "需要人工复核或仅作候选",
                "建议理由": candidate["reason"],
                "用户判断": "",
                "用户修正值": "",
                "用户备注": "",
            }
        )
    return rows


def spotcheck_priority(candidate: dict) -> int:
    score = 1
    if candidate["source"] == "both_sources_conflict":
        score += 20
    if candidate["source"] == "both_sources_consistent":
        score += 10
    if candidate["cohort"] == "web_original_cohort":
        score += 8
    if candidate["cohort"] == "publication_cohort":
        score += 4
    if candidate["fieldName"] == "copyrightEndDate":
        score += 8
    if candidate["fieldName"] in {"standardWorkName", "authorName"}:
        score += 5
    if candidate["fieldName"] in {"classificationLevel1", "classificationLevel2", "requiredTags"}:
        score += 3
    if candidate["requiresManualReview"]:
        score += 3
    if candidate["totalHistoricalRevenue"] > 0:
        score += 2
    return score


def build_spotcheck_guide(rows: list[dict], dry_run: dict) -> dict:
    return {
        "schema": "m1.dual_source_user_spotcheck_guide.v1",
        "privateWorkbook": rel(PRIVATE_SPOTCHECK_XLSX),
        "rowCount": len(rows),
        "maxRows": 80,
        "reviewDecisions": ["接受", "拒绝", "需修改", "不确定"],
        "coverageTargets": [
            "publication_cohort",
            "web_original_cohort",
            "both_sources_consistent",
            "both_sources_conflict",
            "high_revenue",
            "copyright_expiry",
            "work_name_author",
            "classification_tags",
        ],
        "dualSourceDryRunStatus": dry_run["status"] if "status" in dry_run else "local_dry_run_only",
        "formalMasterDataWritten": False,
        "m3Entered": False,
    }


def build_summary(original_structure: dict, cohort: dict, coverage: dict, dry_run: dict, m2_impact: dict) -> dict:
    return {
        "schema": "m1.dual_source_masterdata_backfill_summary.v1",
        "conclusion": "original_library_added_for_web_original_cohort_local_dry_run_only",
        "digitalLedgerPrimaryUse": "publication_cohort",
        "originalLibraryPrimaryUse": "web_original_cohort",
        "supportedFieldsByOriginalLibrary": original_structure["supportedBackfillFields"],
        "dualSourceConflictPolicy": "manual_review_required_no_auto_apply",
        "nextUserAction": "fill the new dual-source private spotcheck pack before any local staging apply",
        "notEnteringM3": True,
        "cohortSummary": cohort["public"]["cohorts"],
        "originalCoverage": {
            "matchedWorks": coverage["matchedWorks"],
            "matchedRevenueShare": coverage["matchedRevenueShare"],
            "originalOnlyMatchedWorks": coverage["originalOnlyMatchedWorks"],
        },
        "dryRunSummary": {
            "matchedWorks": dry_run["dualSource"]["matchedWorks"],
            "autoApplyEligibleRows": dry_run["dualSource"]["autoApplyEligibleRows"],
            "copyrightEndFillableWorks": dry_run["dualSource"]["copyrightEndFillableWorks"],
            "additionalCopyrightEndFillableWorks": dry_run["deltaVsDigitalLedgerV3"]["additionalCopyrightEndFillableWorks"],
        },
        "m2ImpactSummary": {
            "copyrightTermForecastIncreaseWorks": m2_impact["copyrightTermForecast"]["increaseWorks"],
            "v1_1ForecastabilityGateRerunRecommended": m2_impact["forecastabilityGate"]["v1_1RerunRecommended"],
        },
    }


def write_outputs(payload: dict) -> None:
    OUTPUT_M1.mkdir(parents=True, exist_ok=True)
    OUTPUT_M2.mkdir(parents=True, exist_ok=True)
    PRIVATE_DIR.mkdir(parents=True, exist_ok=True)

    write_public(ORIGINAL_STRUCTURE_JSON, "m1.original_library.structure_audit.v1", payload["originalStructure"])
    write_md(ORIGINAL_STRUCTURE_MD, original_structure_md(payload["originalStructure"]))
    write_public(COHORT_JSON, "m1.m2.work_source_cohort_classification.v1", payload["cohort"]["public"])
    write_md(COHORT_MD, cohort_md(payload["cohort"]["public"]))
    write_public(MATCH_COVERAGE_JSON, "m1.original_library.match_coverage.v1", payload["originalCoverage"])
    write_md(MATCH_COVERAGE_MD, original_match_coverage_md(payload["originalCoverage"]))
    write_public(DUAL_DRY_RUN_JSON, "m1.dual_source_masterdata_backfill.dry_run.v1", payload["dualDryRun"])
    write_md(DUAL_DRY_RUN_MD, dual_dry_run_md(payload["dualDryRun"]))
    write_public(M2_IMPACT_JSON, "m2.dual_source_backfill_impact_on_evaluation.v1", payload["m2Impact"])
    write_md(M2_IMPACT_MD, m2_impact_md(payload["m2Impact"]))
    write_public(SUMMARY_JSON, "m1.dual_source_masterdata_backfill.summary.v1", payload["summary"])
    write_md(SUMMARY_MD, summary_md(payload["summary"]))
    write_public(SPOTCHECK_GUIDE_JSON, "m1.dual_source_user_spotcheck_guide.v1", payload["spotcheckGuide"])
    write_md(SPOTCHECK_GUIDE_MD, spotcheck_guide_md(payload["spotcheckGuide"]))

    v3.write_json(PRIVATE_CANDIDATES_JSON, payload["private"])
    v3.write_json(PRIVATE_DRY_RUN_JSON, {"dryRun": payload["dualDryRun"], "candidateRows": payload["dualCandidates"]})
    v3.write_xlsx(
        PRIVATE_CANDIDATES_XLSX,
        {
            "候选明细": private_candidate_rows(payload["dualCandidates"]),
            "聚合摘要": dict_to_rows(payload["dualDryRun"]),
        },
    )
    v3.write_xlsx(
        PRIVATE_DRY_RUN_XLSX,
        {
            "dry_run_聚合": dict_to_rows(payload["dualDryRun"]),
            "安全检查": dict_to_rows(payload["dualDryRun"]["safetyGuards"]),
        },
    )
    v3.write_xlsx(
        PRIVATE_SPOTCHECK_XLSX,
        {
            "01_抽检清单": payload["spotcheckRows"],
            "00_说明": spotcheck_readme_rows(payload["spotcheckGuide"]),
        },
        decision_sheet="01_抽检清单",
        decision_header="用户判断",
    )


def write_public(path: Path, schema: str, payload: dict) -> None:
    v3.write_json(
        path,
        {
            "schema": schema,
            "generatedAt": now(),
            "currentHead": git(["rev-parse", "HEAD"]),
            "originMain": git(["rev-parse", "origin/main"]),
            "safeOutputBoundary": safe_boundary(),
            "payload": payload,
        },
    )


def original_structure_md(payload: dict) -> str:
    sheet_rows = [
        {
            "sheet": sheet["sheetName"],
            "rows": sheet["dataRows"],
            "fields": sheet["fieldCount"],
            "supported": ", ".join(sheet["supportedBackfillFields"]),
        }
        for sheet in payload["sheets"]
    ]
    return "\n".join(
        [
            "# M1 Original Library Structure Audit v1",
            "",
            f"- Source workbook: `{payload['sourceWorkbook']}`",
            f"- Sheet count: `{payload['sheetCount']}`",
            f"- Total data rows: `{payload['totalDataRows']}`",
            "- This report is aggregate-only and contains no real work names, author names, or raw rows.",
            "",
            "## Sheets",
            table(sheet_rows, ["sheet", "rows", "fields", "supported"]),
            "",
            "## Recognized Key Fields",
            table(dict_to_rows(payload["recognizedKeyFields"]), ["key", "value"]),
            "",
            "## Supported Backfill Fields",
            ", ".join(f"`{field}`" for field in payload["supportedBackfillFields"]),
        ]
    )


def cohort_md(payload: dict) -> str:
    return "\n".join(
        [
            "# M1/M2 Work Source Cohort Classification v1",
            "",
            f"- Total M2 works: `{payload['totalM2Works']}`",
            f"- Digital ledger matched works: `{payload['digitalMatchedWorks']}`",
            f"- Original library matched works: `{payload['originalMatchedWorks']}`",
            f"- Both source matched works: `{payload['bothSourceMatchedWorks']}`",
            f"- Unmatched by both sources: `{payload['unmatchedByBothSources']}`",
            "",
            "## Cohorts",
            table(payload["cohorts"], ["cohort", "workCount", "revenueShare"]),
            "",
            "## Top Revenue Cohort Distribution",
            table(flatten_top_distribution(payload["topRevenueCohortDistribution"]), ["bucket", "cohort", "count", "revenueShare"]),
        ]
    )


def original_match_coverage_md(payload: dict) -> str:
    return "\n".join(
        [
            "# M1 Original Library Match Coverage v1",
            "",
            f"- Total M2 works: `{payload['totalM2Works']}`",
            f"- Original library matched works: `{payload['matchedWorks']}`",
            f"- Original-only matched works: `{payload['originalOnlyMatchedWorks']}`",
            f"- Both-source matched works: `{payload['bothSourceMatchedWorks']}`",
            f"- Matched revenue share: `{pct(payload['matchedRevenueShare'])}`",
            "",
            "## Match Method Distribution",
            table([{"method": key, "count": value} for key, value in payload["matchMethodDistribution"].items()], ["method", "count"]),
            "",
            "## Top Revenue Coverage",
            table([{"bucket": key, **value} for key, value in payload["topRevenueCoverage"].items()], ["bucket", "workCount", "matchedWorkCount", "matchedWorkRate", "matchedRevenueShare"]),
        ]
    )


def dual_dry_run_md(payload: dict) -> str:
    return "\n".join(
        [
            "# M1 Dual-Source Master Data Backfill Dry-Run v1",
            "",
            "- Formal master data written: `False`",
            "- Database written: `False`",
            "",
            "## Single Digital Ledger v3 Baseline",
            table(dict_to_rows(payload["singleDigitalLedgerV3"]), ["key", "value"]),
            "",
            "## Dual-Source Result",
            table(dict_to_rows(payload["dualSource"]), ["key", "value"]),
            "",
            "## Delta vs Digital v3",
            table(dict_to_rows(payload["deltaVsDigitalLedgerV3"]), ["key", "value"]),
            "",
            "## Safety Guards",
            table([{"guard": key, "passed": value} for key, value in payload["safetyGuards"].items()], ["guard", "passed"]),
        ]
    )


def m2_impact_md(payload: dict) -> str:
    return "\n".join(
        [
            "# M2 Dual-Source Backfill Impact on Evaluation v1",
            "",
            f"- Baseline: `{payload['comparisonBaseline']}`",
            f"- Copyright term forecast increase works: `{payload['copyrightTermForecast']['increaseWorks']}`",
            f"- Operating-window pending expiry estimated reduction: `{payload['operatingWindowForecastPendingExpiry']['estimatedReductionWorks']}`",
            f"- Renewal review improved candidate works: `{payload['renewalReview']['improvedCandidateWorks']}`",
            f"- Rating remaining-copyright newly usable works: `{payload['ratingRemainingCopyrightAdjustment']['newlyUsableWorks']}`",
            f"- v1.1 forecastability gate rerun recommended: `{payload['forecastabilityGate']['v1_1RerunRecommended']}`",
            f"- Status: `{payload['status']}`",
        ]
    )


def summary_md(payload: dict) -> str:
    return "\n".join(
        [
            "# M1 Dual-Source Master Data Backfill Summary v1",
            "",
            f"- Conclusion: `{payload['conclusion']}`",
            f"- Digital ledger primary use: `{payload['digitalLedgerPrimaryUse']}`",
            f"- Original library primary use: `{payload['originalLibraryPrimaryUse']}`",
            f"- Dual-source conflict policy: `{payload['dualSourceConflictPolicy']}`",
            f"- Next user action: `{payload['nextUserAction']}`",
            f"- Not entering M3: `{payload['notEnteringM3']}`",
            "",
            "## Supported Fields by Original Library",
            ", ".join(f"`{field}`" for field in payload["supportedFieldsByOriginalLibrary"]),
            "",
            "## Cohort Summary",
            table(payload["cohortSummary"], ["cohort", "workCount", "revenueShare"]),
            "",
            "## Dry-Run Summary",
            table(dict_to_rows(payload["dryRunSummary"]), ["key", "value"]),
        ]
    )


def spotcheck_guide_md(payload: dict) -> str:
    return "\n".join(
        [
            "# M1 Dual-Source User Spotcheck Guide v1",
            "",
            f"- Private spotcheck workbook: `{payload['privateWorkbook']}`",
            f"- Row count: `{payload['rowCount']}`",
            f"- Allowed decisions: `{', '.join(payload['reviewDecisions'])}`",
            "- This guide is aggregate-only. The private workbook contains real IDs/names/authors and must not be committed.",
            "- User should fill this new dual-source pack before any local staging apply.",
            "- M3 is not entered.",
        ]
    )


def private_candidate_rows(candidates: list[dict]) -> list[dict]:
    return [
        {
            "standardWorkId": item["standardWorkId"],
            "rawWorkId": item["rawWorkId"],
            "cohort": item["cohort"],
            "source": item["source"],
            "sourceRowIds": ",".join(item["sourceRowIds"]),
            "fieldName": item["fieldName"],
            "currentValue": item["currentValue"],
            "proposedValue": item["proposedValue"],
            "proposedValueNormalized": item["proposedValueNormalized"],
            "sourceField": item["sourceField"],
            "sourceRawValue": item["sourceRawValue"],
            "parserStatus": item["parserStatus"],
            "matchMethod": item["matchMethod"],
            "matchConfidence": item["matchConfidence"],
            "valueConfidence": item["valueConfidence"],
            "conflictStatus": item["conflictStatus"],
            "requiresManualReview": item["requiresManualReview"],
            "autoApplyEligibleDualSource": item["autoApplyEligibleDualSource"],
            "exclusionReasons": ",".join(item["autoApplyExclusionReasonsDualSource"]),
            "reason": item["reason"],
        }
        for item in candidates
    ]


def spotcheck_readme_rows(guide: dict) -> list[dict]:
    return [
        {"项目": "用途", "说明": "复核数字版权台账 + 原创全库的双源主数据回填候选"},
        {"项目": "决策值", "说明": "接受 / 拒绝 / 需修改 / 不确定"},
        {"项目": "安全边界", "说明": "本文件在 data/private-output 下，gitignored，不提交"},
        {"项目": "下一步", "说明": "用户填写后才能进入本地 staging dry-run apply，不写正式主数据"},
    ]


def summarize_spotcheck_pack() -> dict:
    book = v3.read_xlsx_workbook(PRIVATE_SPOTCHECK_XLSX)
    sheet = next((item for item in book["sheets"] if item["name"] == "01_抽检清单"), None)
    if sheet is None:
        raise SystemExit("dual-source spotcheck pack is missing sheet 01_抽检清单")
    rows = sheet["rows"]
    decisions = Counter(clean(row.get("用户判断")) or "未填写" for row in rows)
    completed = sum(decisions[key] for key in ["接受", "拒绝", "需修改", "不确定"])
    return {
        "schema": "m1.dual_source_user_spotcheck_summary.v1",
        "sourceWorkbook": rel(PRIVATE_SPOTCHECK_XLSX),
        "totalRows": len(rows),
        "completedRows": completed,
        "completionRate": ratio(completed, len(rows)),
        "decisionDistribution": dict(decisions),
        "readyForLocalStagingApply": False,
        "status": "waiting_for_user_spotcheck" if completed < len(rows) else "user_spotcheck_completed_needs_gate_review",
        "formalMasterDataWritten": False,
        "m3Entered": False,
    }


def public_cli_summary(scope: str, payload: dict) -> dict:
    return {
        "scope": scope,
        "originalRows": payload["originalStructure"]["totalDataRows"],
        "originalMatchedWorks": payload["originalCoverage"]["matchedWorks"],
        "dualMatchedWorks": payload["dualDryRun"]["dualSource"]["matchedWorks"],
        "dualAutoApplyEligibleRows": payload["dualDryRun"]["dualSource"]["autoApplyEligibleRows"],
        "dualCopyrightEndFillableWorks": payload["dualDryRun"]["dualSource"]["copyrightEndFillableWorks"],
        "spotcheckRows": payload["spotcheckGuide"]["rowCount"],
        "privateSpotcheckWorkbook": rel(PRIVATE_SPOTCHECK_XLSX),
        "formalMasterDataWritten": False,
        "m3Entered": False,
    }


def safe_boundary() -> dict:
    return {
        "sanitizedAggregateOnly": True,
        "realWorkNamesIncluded": False,
        "authorNamesIncluded": False,
        "rawRowsIncluded": False,
        "privateDetailsStoredOnlyInGitignoredOutput": True,
        "databaseConnected": False,
        "formalMasterDataWritten": False,
        "m3Entered": False,
    }


def flatten_top_distribution(payload: dict) -> list[dict]:
    rows = []
    for bucket, item in payload.items():
        cohorts = set(item["countByCohort"]) | set(item["revenueShareByCohort"])
        for cohort in sorted(cohorts):
            rows.append(
                {
                    "bucket": bucket,
                    "cohort": cohort,
                    "count": item["countByCohort"].get(cohort, 0),
                    "revenueShare": item["revenueShareByCohort"].get(cohort, 0),
                }
            )
    return rows


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


def field_cn(field: str) -> str:
    return {
        "standardWorkName": "作品名称",
        "authorName": "作者",
        "copyrightStartDate": "版权开始",
        "copyrightEndDate": "版权到期",
        "classificationLevel1": "一级分类",
        "classificationLevel2": "二级分类",
        "requiredTags": "标签/三级分类",
        "workStatus": "作品状态",
        "audioRightsStatus": "有声权利状态",
    }.get(field, field)


def source_cn(source: str) -> str:
    return {
        "digital_copyright_ledger": "数字版权台账",
        "original_library": "原创全库",
        "both_sources_consistent": "双源一致",
        "both_sources_conflict": "双源冲突",
    }.get(source, source)


def cohort_cn(cohort: str) -> str:
    return {
        "publication_cohort": "出版物/出版书",
        "web_original_cohort": "网文/原创",
        "mixed_or_uncertain_cohort": "混合或不确定",
    }.get(cohort, cohort)


def confidence_cn(value) -> str:
    score = to_float(value)
    if score >= 0.97:
        return "高"
    if score >= 0.8:
        return "中"
    return "低"


def first(values):
    for value in values or []:
        if has_value(value):
            return value
    return ""


def clean(value) -> str:
    return v3.clean(value)


def has_value(value) -> bool:
    return clean(value) != ""


def normalize_compare(value) -> str:
    return re.sub(r"\s+", "", clean(value)).lower()


def to_float(value) -> float:
    return v3.to_float(value)


def ratio(numerator, denominator) -> float:
    return v3.ratio(numerator, denominator)


def pct(value) -> str:
    return v3.pct(value)


def rel(path: Path) -> str:
    return v3.rel(path)


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def git(args: list[str]) -> str | None:
    try:
        return subprocess.check_output(["git", *args], cwd=ROOT, text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        return None


def write_md(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text + "\n", encoding="utf-8")


def is_relative_expiry(raw, parser_status) -> bool:
    text = clean(raw)
    return parser_status == "pending_anchor" or any(token in text for token in ["出版之日起", "签订之日起", "上线之日起", "最后一部"])


if __name__ == "__main__":
    main()
