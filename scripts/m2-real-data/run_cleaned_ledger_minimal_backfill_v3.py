from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import re
import subprocess
import zipfile
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape


ROOT = Path(__file__).resolve().parents[2]
OUTPUT_M1 = ROOT / "docs" / "analysis" / "m1-master-data"
OUTPUT_M2 = ROOT / "docs" / "analysis" / "m2-real-data"
PRIVATE_DIR = ROOT / "data" / "private-output" / "m1-master-data"

MINIMAL_HEADERS = ["作品ID", "出版书名", "合同书名", "作者署名", "签订日期", "到期时间", "产品线"]
BACKFILL_FIELDS = [
    "standardWorkName",
    "authorName",
    "copyrightStartDate",
    "copyrightEndDate",
    "classificationLevel1",
    "classificationLevel2",
]
AUTO_APPLY_FIELDS = {"standardWorkName", "authorName", "copyrightStartDate", "copyrightEndDate"}
OLD_FIELDS_DISABLED = [
    "publisherName",
    "firstPublicationDate",
    "audioRightsStatus",
    "classificationLevel3",
    "isbn",
    "cip",
    "contractNo",
    "contractType",
    "audioUseRight",
    "audioAdaptationRight",
    "audioSublicenseRight",
]

STRUCTURE_MD = OUTPUT_M1 / "M1-cleaned-ledger-minimal-structure-audit-v3.md"
STRUCTURE_JSON = OUTPUT_M1 / "M1-cleaned-ledger-minimal-structure-audit-v3.json"
MATCH_MD = OUTPUT_M1 / "M1-cleaned-ledger-minimal-work-centric-match-audit-v3.md"
MATCH_JSON = OUTPUT_M1 / "M1-cleaned-ledger-minimal-work-centric-match-audit-v3.json"
AUTO_MD = OUTPUT_M1 / "M1-cleaned-ledger-minimal-auto-apply-rule-v3.md"
AUTO_JSON = OUTPUT_M1 / "M1-cleaned-ledger-minimal-auto-apply-rule-v3.json"
DRY_RUN_MD = OUTPUT_M1 / "M1-cleaned-ledger-minimal-dry-run-v3-result.md"
DRY_RUN_JSON = OUTPUT_M1 / "M1-cleaned-ledger-minimal-dry-run-v3-result.json"
BACKFILL_SUMMARY_MD = OUTPUT_M1 / "M1-cleaned-ledger-minimal-backfill-summary-v3.md"
BACKFILL_SUMMARY_JSON = OUTPUT_M1 / "M1-cleaned-ledger-minimal-backfill-summary-v3.json"
SPOTCHECK_GUIDE_MD = OUTPUT_M1 / "M1-cleaned-ledger-minimal-user-spotcheck-guide-v3.md"
SPOTCHECK_GUIDE_JSON = OUTPUT_M1 / "M1-cleaned-ledger-minimal-user-spotcheck-guide-v3.json"
M2_IMPACT_MD = OUTPUT_M2 / "M2-cleaned-ledger-minimal-backfill-impact-v3.md"
M2_IMPACT_JSON = OUTPUT_M2 / "M2-cleaned-ledger-minimal-backfill-impact-v3.json"

PRIVATE_CANDIDATES_XLSX = PRIVATE_DIR / "M1-cleaned-ledger-minimal-backfill-candidates-v3.xlsx"
PRIVATE_CANDIDATES_JSON = PRIVATE_DIR / "M1-cleaned-ledger-minimal-backfill-candidates-v3.json"
PRIVATE_DRY_RUN_XLSX = PRIVATE_DIR / "M1-cleaned-ledger-minimal-dry-run-v3-result.xlsx"
PRIVATE_DRY_RUN_JSON = PRIVATE_DIR / "M1-cleaned-ledger-minimal-dry-run-v3-result.json"
PRIVATE_SPOTCHECK_XLSX = PRIVATE_DIR / "M1-cleaned-ledger-minimal-user-spotcheck-pack-cn-v3.xlsx"

NS = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL_NS = {"r": "http://schemas.openxmlformats.org/package/2006/relationships"}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scope", choices=["all", "backfill", "dry-run", "m2-impact", "spotcheck"], default="all")
    parser.add_argument("--print-json", action="store_true")
    args = parser.parse_args()

    if args.scope == "spotcheck":
        summary = summarize_filled_spotcheck_pack()
        print(json.dumps(summary, ensure_ascii=False))
        if args.print_json:
            print(json.dumps(summary, ensure_ascii=False, indent=2))
        return

    payload = build_payload()
    write_outputs(payload)

    summary = {
        "scope": args.scope,
        "ledgerRows": payload["structureAudit"]["totalDataRows"],
        "ledgerFieldCount": payload["structureAudit"]["fieldCount"],
        "m2StandardWorkCount": payload["matchAudit"]["totalStandardWorks"],
        "matchedWorks": payload["matchAudit"]["matchedWorks"],
        "unmatchedWorks": payload["matchAudit"]["unmatchedWorks"],
        "candidateRows": payload["candidateSummary"]["totalCandidateRows"],
        "autoApplyEligibleRows": payload["candidateSummary"]["autoApplyEligibleRows"],
        "spotcheckRows": payload["spotcheckGuide"]["rowCount"],
        "privateCandidatesXlsx": rel(PRIVATE_CANDIDATES_XLSX),
        "privateSpotcheckXlsx": rel(PRIVATE_SPOTCHECK_XLSX),
    }
    print(json.dumps(summary, ensure_ascii=False))
    if args.print_json:
        print(json.dumps(payload["public"], ensure_ascii=False, indent=2))


def build_payload() -> dict:
    generated_at = now()
    ledger_path = locate_cleaned_ledger()
    ledger_book = read_xlsx_workbook(ledger_path)
    ledger_rows = normalize_ledger_rows(ledger_book)
    mapping = load_mapping()
    author_index = load_author_index()
    works = build_m2_work_index(mapping, author_index)

    ledger_index = build_ledger_index(ledger_rows, mapping)
    match_results = match_works(works, ledger_index)
    candidates = build_candidates(match_results, works)
    auto_enriched = [enrich_auto_apply(candidate) for candidate in candidates]
    structure = build_structure_audit(ledger_path, ledger_book, ledger_rows)
    match_audit = build_match_audit(works, match_results)
    candidate_summary = build_candidate_summary(auto_enriched, works)
    auto_rule = build_auto_apply_rule(candidate_summary)
    dry_run = build_dry_run(auto_enriched, works)
    m2_impact = build_m2_impact(dry_run, candidate_summary, works, auto_enriched)
    spotcheck_rows = build_spotcheck_rows(auto_enriched, works)
    backfill_summary = build_backfill_summary(structure, match_audit, candidate_summary, dry_run, m2_impact)
    spotcheck_guide = build_spotcheck_guide(spotcheck_rows, candidate_summary)

    boundary = {
        "sanitizedAggregateOnly": True,
        "realWorkNamesIncluded": False,
        "authorNamesIncluded": False,
        "rawLedgerRowsIncluded": False,
        "privateDetailsStoredOnlyInGitignoredOutput": True,
        "databaseConnected": False,
        "formalMasterDataWritten": False,
        "m3Entered": False,
    }
    public = {
        "schema": "m1.m2.cleaned_ledger_minimal_backfill_v3.public",
        "generatedAt": generated_at,
        "currentHead": git(["rev-parse", "HEAD"]),
        "originMain": git(["rev-parse", "origin/main"]),
        "safeOutputBoundary": boundary,
        "structureAudit": structure,
        "matchAudit": match_audit,
        "candidateSummary": candidate_summary,
        "autoApplyRule": auto_rule,
        "dryRun": dry_run,
        "m2Impact": m2_impact,
        "backfillSummary": backfill_summary,
        "spotcheckGuide": spotcheck_guide,
    }
    private = {
        "schema": "m1.m2.cleaned_ledger_minimal_backfill_v3.private",
        "generatedAt": generated_at,
        "safeOutputBoundary": {
            **boundary,
            "realWorkNamesIncluded": True,
            "authorNamesIncluded": True,
            "rawLedgerSummaryIncluded": True,
            "gitignoredPrivateOutput": True,
        },
        "candidateRows": auto_enriched,
        "dryRun": dry_run,
        "spotcheckRows": spotcheck_rows,
    }
    return {
        "public": public,
        "private": private,
        "structureAudit": structure,
        "matchAudit": match_audit,
        "candidateSummary": candidate_summary,
        "autoApplyRule": auto_rule,
        "dryRun": dry_run,
        "m2Impact": m2_impact,
        "backfillSummary": backfill_summary,
        "spotcheckGuide": spotcheck_guide,
        "spotcheckRows": spotcheck_rows,
        "candidateRows": auto_enriched,
    }


def summarize_filled_spotcheck_pack() -> dict:
    if not PRIVATE_SPOTCHECK_XLSX.exists():
        raise SystemExit(f"v3 spotcheck pack not found: {rel(PRIVATE_SPOTCHECK_XLSX)}")
    book = read_xlsx_workbook(PRIVATE_SPOTCHECK_XLSX)
    review_sheet = next((sheet for sheet in book["sheets"] if sheet["name"] == "01_抽检清单"), None)
    if review_sheet is None:
        raise SystemExit("v3 spotcheck pack is missing sheet 01_抽检清单.")
    rows = [normalize_spotcheck_row(row) for row in review_sheet["rows"]]
    total = len(rows)
    completed_rows = [row for row in rows if row["用户判断"] in {"接受", "拒绝", "需修改", "不确定"}]
    completed = len(completed_rows)
    decision_counts = Counter(row["用户判断"] if row["用户判断"] else "未填写" for row in rows)
    high_conf_rows = [row for row in rows if row["匹配置信度"] == "高" and row["值置信度"] == "高"]
    high_conf_completed = [row for row in high_conf_rows if row["用户判断"] in {"接受", "拒绝", "需修改", "不确定"}]
    high_conf_accepted = [row for row in high_conf_completed if row["用户判断"] == "接受"]
    high_conf_acceptance_rate = (
        ratio(len(high_conf_accepted), len(high_conf_completed)) if high_conf_completed else None
    )
    error_rows = [row for row in rows if row["用户判断"] in {"拒绝", "需修改"}]
    high_revenue_proxy = rows[: min(20, len(rows))]
    high_revenue_error = [row for row in high_revenue_proxy if row["用户判断"] in {"拒绝", "需修改"}]
    copyright_expiry_errors = [row for row in error_rows if row["候选字段"] == "版权到期"]
    title_author_errors = [row for row in error_rows if row["候选字段"] in {"作品名称", "作者"}]
    classification_errors = [row for row in error_rows if row["候选字段"] in {"分类一级", "分类二级"}]
    needs_modify_missing_correction = [
        row for row in rows if row["用户判断"] == "需修改" and not clean(row.get("用户修正值"))
    ]
    core_ready = (
        ratio(completed, total) >= 0.9
        and (high_conf_acceptance_rate is None or high_conf_acceptance_rate >= 0.95)
        and len(high_revenue_error) == 0
        and len(copyright_expiry_errors) == 0
        and len(title_author_errors) == 0
        and len(needs_modify_missing_correction) == 0
    )
    blocking_reasons = []
    if ratio(completed, total) < 0.9:
        blocking_reasons.append("抽检完成率低于 90%")
    if high_conf_acceptance_rate is not None and high_conf_acceptance_rate < 0.95:
        blocking_reasons.append("高置信候选接受率低于 95%")
    if high_revenue_error:
        blocking_reasons.append("高收入/高优先样本存在拒绝或需修改")
    if copyright_expiry_errors:
        blocking_reasons.append("版权到期候选存在严重错误")
    if title_author_errors:
        blocking_reasons.append("作品名或作者候选存在严重错误")
    if needs_modify_missing_correction:
        blocking_reasons.append("存在“需修改”但未填写修正值的行")
    apply_scope = []
    if core_ready:
        apply_scope = [
            "仅限 v3 最小字段候选",
            "仅限字段：standardWorkName、authorName、copyrightStartDate、copyrightEndDate",
            "仅限当前值为空或仅格式归一化一致",
            "仅限 exact_work_id / mapping_work_id / title_author_exact>=0.99",
            "仅限 valueConfidence>=0.97、无冲突、非人工复核、非模糊匹配",
            "不包含 classificationLevel1/2，分类仍需人工确认",
            "不包含 publisherName、firstPublicationDate、audioRightsStatus、classificationLevel3",
        ]
    return {
        "schema": "m1.cleaned_ledger_minimal.user_spotcheck_summary.v3",
        "sourceWorkbook": rel(PRIVATE_SPOTCHECK_XLSX),
        "oldV2SpotcheckRead": False,
        "formalMasterDataWritten": False,
        "m3Entered": False,
        "metrics": {
            "totalRows": total,
            "completedRows": completed,
            "completionRate": ratio(completed, total),
            "acceptedRows": decision_counts["接受"],
            "acceptanceRate": ratio(decision_counts["接受"], completed),
            "rejectedRows": decision_counts["拒绝"],
            "rejectionRate": ratio(decision_counts["拒绝"], completed),
            "needsModifyRows": decision_counts["需修改"],
            "needsModifyRate": ratio(decision_counts["需修改"], completed),
            "uncertainRows": decision_counts["不确定"],
            "uncertainRate": ratio(decision_counts["不确定"], completed),
            "highConfidenceRows": len(high_conf_rows),
            "highConfidenceCompletedRows": len(high_conf_completed),
            "highConfidenceAcceptedRows": len(high_conf_accepted),
            "highConfidenceAcceptanceRate": high_conf_acceptance_rate,
            "highRevenueSampleErrorCount": len(high_revenue_error),
            "highRevenueSampleDefinition": "v3 抽检包生成顺序前 20 行，作为高收入/高优先样本代理",
            "copyrightExpirySevereErrorCount": len(copyright_expiry_errors),
            "titleAuthorSevereErrorCount": len(title_author_errors),
            "classificationCandidateErrorCount": len(classification_errors),
            "needsModifyMissingCorrectionCount": len(needs_modify_missing_correction),
        },
        "decisionDistribution": dict(decision_counts),
        "readyForLocalStagingApply": core_ready,
        "status": "ready_for_local_staging_apply" if core_ready else "not_ready_for_local_staging_apply",
        "blockingReasons": blocking_reasons,
        "nextLocalStagingApplyCandidateScope": apply_scope,
    }


def normalize_spotcheck_row(row: dict) -> dict:
    expected = [
        "抽检编号",
        "标准作品ID",
        "原始作品ID",
        "候选字段",
        "当前值",
        "建议值",
        "来源字段",
        "来源摘要",
        "匹配方式",
        "匹配置信度",
        "值置信度",
        "冲突状态",
        "是否需人工复核",
        "是否可自动应用",
        "系统建议",
        "建议理由",
        "用户判断",
        "用户修正值",
        "用户备注",
    ]
    normalized = {key: clean(row.get(key)) for key in expected}
    decision = normalized["用户判断"].strip()
    if decision not in {"接受", "拒绝", "需修改", "不确定"}:
        normalized["用户判断"] = ""
    return normalized


def locate_cleaned_ledger() -> Path:
    candidates = sorted((ROOT / "data" / "master-data").glob("*.xlsx"), key=lambda path: path.stat().st_mtime, reverse=True)
    for path in candidates:
        try:
            book = read_xlsx_workbook(path, max_rows=1)
        except Exception:
            continue
        if book["sheets"] and book["sheets"][0]["headers"] == MINIMAL_HEADERS:
            return path
    raise SystemExit("No cleaned 7-field digital copyright ledger was found under data/master-data.")


def read_xlsx_workbook(path: Path, max_rows: int | None = None) -> dict:
    with zipfile.ZipFile(path) as archive:
        shared_strings = read_shared_strings(archive)
        sheets = workbook_sheets(archive)
        result = []
        for sheet in sheets:
            rows = read_sheet_rows(archive, sheet["target"], shared_strings, max_rows=max_rows)
            headers = rows[0] if rows else []
            data_rows = []
            for raw in rows[1:]:
                item = {headers[index]: raw[index] if index < len(raw) else "" for index in range(len(headers)) if headers[index]}
                if any(has_value(value) for value in item.values()):
                    data_rows.append(item)
            result.append({"name": sheet["name"], "headers": headers, "rows": data_rows})
        return {"path": path, "sheets": result}


def read_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    values = []
    for si in root.findall("a:si", NS):
        values.append("".join(node.text or "" for node in si.findall(".//a:t", NS)))
    return values


def workbook_sheets(archive: zipfile.ZipFile) -> list[dict]:
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    rel_root = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    rels = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rel_root.findall("r:Relationship", REL_NS)}
    sheets = []
    for sheet in workbook.findall(".//a:sheet", NS):
        rid = sheet.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
        target = rels[rid]
        if not target.startswith("xl/"):
            target = f"xl/{target.lstrip('/')}"
        sheets.append({"name": sheet.attrib["name"], "target": target})
    return sheets


def read_sheet_rows(archive: zipfile.ZipFile, target: str, shared_strings: list[str], max_rows: int | None = None) -> list[list[str]]:
    root = ET.fromstring(archive.read(target))
    rows = []
    for row in root.findall(".//a:sheetData/a:row", NS):
        if max_rows is not None and len(rows) >= max_rows:
            break
        values = {}
        max_index = -1
        for cell in row.findall("a:c", NS):
            ref = cell.attrib.get("r", "")
            index = column_index(ref)
            max_index = max(max_index, index)
            values[index] = cell_value(cell, shared_strings)
        rows.append([values.get(index, "") for index in range(max_index + 1)])
    return rows


def cell_value(cell: ET.Element, shared_strings: list[str]) -> str:
    kind = cell.attrib.get("t")
    if kind == "inlineStr":
        return "".join(node.text or "" for node in cell.findall(".//a:t", NS)).strip()
    value = cell.find("a:v", NS)
    if value is None or value.text is None:
        return ""
    text = value.text.strip()
    if kind == "s":
        return shared_strings[int(text)] if text else ""
    return text


def normalize_ledger_rows(book: dict) -> list[dict]:
    rows = []
    for sheet in book["sheets"]:
        for index, row in enumerate(sheet["rows"], start=2):
            normalized = {field: clean(row.get(field)) for field in MINIMAL_HEADERS}
            normalized["_sheetName"] = sheet["name"]
            normalized["_ledgerRowNumber"] = index
            normalized["_ledgerRowId"] = f"L{index:06d}"
            normalized["_workIdNormalized"] = normalize_work_id(normalized["作品ID"])
            normalized["_publicationTitleNormalized"] = normalize_title(normalized["出版书名"])
            normalized["_contractTitleNormalized"] = normalize_title(normalized["合同书名"])
            normalized["_authorTokens"] = author_tokens(normalized["作者署名"])
            rows.append(normalized)
    return rows


def load_mapping() -> dict:
    directory = ROOT / "data" / "m1-master-data-private" / "mapping-candidate"
    best_rows = []
    for path in sorted(directory.glob("*.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        rows = []
        mappings = payload.get("mappings") if isinstance(payload, dict) else None
        if isinstance(mappings, dict):
            rows = mappings.get("effective_mapping_snapshot") or mappings.get("priority_covered_candidates") or []
        if isinstance(payload.get("effective_mapping_snapshot"), list):
            rows = payload["effective_mapping_snapshot"]
        if len(rows) > len(best_rows):
            best_rows = rows
    raw_to_standard = {}
    for row in best_rows:
        raw = normalize_raw_work_id(row.get("raw_work_id") or row.get("rawWorkId"))
        target = normalize_work_id(row.get("target_standard_work_id") or row.get("standard_work_id") or row.get("standardWorkId"))
        if raw and target:
            raw_to_standard[raw] = target
    return raw_to_standard


def load_author_index() -> dict:
    path = ROOT / "data" / "m1-master-data-private" / "master-author-alias-candidates.csv"
    result = {}
    if not path.exists():
        return result
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            standard = normalize_work_id(row.get("standard_id"))
            candidate = clean(row.get("author_standard_candidate")) or clean(row.get("author_alias"))
            if standard and candidate and standard not in result:
                result[standard] = candidate
    return result


def build_m2_work_index(mapping: dict, author_index: dict) -> dict:
    bill_path = next((ROOT / "data" / "real-bills").glob("*.xlsx"), None)
    if not bill_path:
        raise SystemExit("No real bill workbook was found under data/real-bills.")
    book = read_xlsx_workbook(bill_path)
    rows = book["sheets"][0]["rows"]
    works = {}
    name_revenue = defaultdict(lambda: defaultdict(float))
    name_count = defaultdict(Counter)
    for row in rows:
        raw = normalize_raw_work_id(row.get("我方作品ID"))
        standard = mapping.get(raw) or derive_standard_work_id(raw)
        if not standard:
            continue
        amount = to_float(row.get("实销金额"))
        work = works.setdefault(
            standard,
            {
                "standardWorkId": standard,
                "rawWorkIds": set(),
                "totalHistoricalRevenue": 0.0,
                "billRowCount": 0,
                "currentWorkName": "",
                "currentAuthorName": author_index.get(standard, ""),
                "currentCopyrightStartDate": "",
                "currentCopyrightEndDate": "",
                "currentClassificationLevel1": "",
                "currentClassificationLevel2": "",
            },
        )
        work["rawWorkIds"].add(raw)
        work["totalHistoricalRevenue"] += amount
        work["billRowCount"] += 1
        name = clean(row.get("作品名称"))
        if name:
            name_revenue[standard][name] += amount
            name_count[standard][name] += 1
    for standard, work in works.items():
        if name_revenue[standard]:
            ranked = sorted(name_revenue[standard], key=lambda name: (name_revenue[standard][name], name_count[standard][name], name), reverse=True)
            work["currentWorkName"] = ranked[0]
        work["rawWorkIds"] = sorted(work["rawWorkIds"])
        work["titleNormalized"] = normalize_title(work["currentWorkName"])
        work["authorTokens"] = author_tokens(work["currentAuthorName"])
    return works


def build_ledger_index(rows: list[dict], mapping: dict) -> dict:
    by_exact_id = defaultdict(list)
    by_mapped_id = defaultdict(list)
    by_title = defaultdict(list)
    by_title_bucket = defaultdict(list)
    for row in rows:
        norm_id = row["_workIdNormalized"]
        if norm_id:
            by_exact_id[norm_id].append(row)
            mapped = mapping.get(norm_id)
            if mapped:
                by_mapped_id[mapped].append(row)
        for title_field in ["_publicationTitleNormalized", "_contractTitleNormalized"]:
            title = row[title_field]
            if title:
                by_title[title].append(row)
                by_title_bucket[(title[0], len(title) // 4)].append((title, row))
    return {
        "rows": rows,
        "byExactId": by_exact_id,
        "byMappedId": by_mapped_id,
        "byTitle": by_title,
        "byTitleBucket": by_title_bucket,
    }


def match_works(works: dict, ledger_index: dict) -> dict:
    results = {}
    for standard, work in works.items():
        exact = ledger_index["byExactId"].get(standard, [])
        if exact:
            results[standard] = build_match_result(standard, exact, "exact_work_id", 1.0)
            continue
        mapped = ledger_index["byMappedId"].get(standard, [])
        if mapped:
            results[standard] = build_match_result(standard, mapped, "mapping_work_id", 1.0)
            continue
        title_rows = ledger_index["byTitle"].get(work["titleNormalized"], [])
        exact_author = [row for row in title_rows if author_overlap(work["authorTokens"], row["_authorTokens"])]
        if exact_author:
            results[standard] = build_match_result(standard, exact_author, "title_author_exact", 0.99)
            continue
        fuzzy = []
        if work["titleNormalized"]:
            fuzzy_candidates = []
            title_key = work["titleNormalized"]
            for length_bucket in range(len(title_key) // 4 - 1, len(title_key) // 4 + 2):
                fuzzy_candidates.extend(ledger_index["byTitleBucket"].get((title_key[0], length_bucket), []))
            seen_rows = set()
            for title, row in fuzzy_candidates:
                if row["_ledgerRowId"] in seen_rows:
                    continue
                seen_rows.add(row["_ledgerRowId"])
                if abs(len(title_key) - len(title)) > max(4, round(len(title_key) * 0.25)):
                    continue
                score = title_similarity(work["titleNormalized"], title)
                if score >= 0.92 and (not work["authorTokens"] or author_overlap(work["authorTokens"], row["_authorTokens"])):
                    fuzzy.append((score, row))
        if fuzzy:
            fuzzy.sort(key=lambda item: item[0], reverse=True)
            best_score = fuzzy[0][0]
            rows = [row for score, row in fuzzy if score >= best_score - 0.02][:5]
            results[standard] = build_match_result(standard, rows, "title_author_fuzzy", round(best_score, 4))
            continue
        results[standard] = build_match_result(standard, [], "unmatched", 0.0)
    return results


def build_match_result(standard: str, rows: list[dict], method: str, confidence: float) -> dict:
    return {
        "standardWorkId": standard,
        "matchMethod": method,
        "matchConfidence": confidence,
        "matched": method != "unmatched",
        "ledgerRows": rows,
        "ledgerRowIds": [row["_ledgerRowId"] for row in rows],
    }


def build_candidates(matches: dict, works: dict) -> list[dict]:
    rows = []
    for standard, match in matches.items():
        if not match["matched"]:
            continue
        work = works[standard]
        source_rows = match["ledgerRows"]
        for field in BACKFILL_FIELDS:
            candidate = candidate_for_field(field, work, match, source_rows)
            if candidate is not None:
                rows.append(candidate)
    return rows


def candidate_for_field(field: str, work: dict, match: dict, source_rows: list[dict]) -> dict | None:
    values = []
    source_field = ""
    parser_status = "parsed"
    for row in source_rows:
        value = None
        normalized = None
        raw = ""
        if field == "standardWorkName":
            source_field = "出版书名/合同书名"
            raw = clean(row.get("出版书名")) or clean(row.get("合同书名"))
            value = raw
            normalized = raw
        elif field == "authorName":
            source_field = "作者署名"
            raw = clean(row.get("作者署名"))
            value = raw
            normalized = raw
        elif field == "copyrightStartDate":
            source_field = "签订日期"
            raw = clean(row.get("签订日期"))
            parsed = parse_date_value(raw)
            parser_status = parsed["status"]
            value = parsed["value"]
            normalized = parsed["normalized"]
        elif field == "copyrightEndDate":
            source_field = "到期时间"
            raw = clean(row.get("到期时间"))
            parsed = parse_date_value(raw)
            parser_status = parsed["status"]
            value = parsed["value"]
            normalized = parsed["normalized"]
        elif field in {"classificationLevel1", "classificationLevel2"}:
            source_field = "产品线"
            raw = clean(row.get("产品线"))
            levels = parse_product_line(raw)
            value = levels[0] if field == "classificationLevel1" else levels[1]
            normalized = value
            parser_status = "parsed" if value else "missing"
        if has_value(value):
            values.append({"raw": raw, "value": value, "normalized": normalized, "rowId": row["_ledgerRowId"], "status": parser_status})
    if not values:
        return None
    normalized_values = {clean(item["normalized"]) for item in values if has_value(item["normalized"])}
    conflict_status = "value_conflict" if len(normalized_values) > 1 else "none"
    selected = values[0]
    current_field = {
        "standardWorkName": "currentWorkName",
        "authorName": "currentAuthorName",
        "copyrightStartDate": "currentCopyrightStartDate",
        "copyrightEndDate": "currentCopyrightEndDate",
        "classificationLevel1": "currentClassificationLevel1",
        "classificationLevel2": "currentClassificationLevel2",
    }[field]
    match_method = match["matchMethod"]
    match_confidence = match["matchConfidence"]
    value_confidence = estimate_value_confidence(field, selected["status"], match_method, match_confidence, conflict_status)
    requires_manual = (
        conflict_status != "none"
        or match_method == "title_author_fuzzy"
        or selected["status"] != "parsed"
        or field.startswith("classification")
    )
    return {
        "standardWorkId": work["standardWorkId"],
        "rawWorkId": ",".join(work["rawWorkIds"][:5]),
        "ledgerRowIds": match["ledgerRowIds"],
        "fieldName": field,
        "currentValue": work.get(current_field) or "",
        "proposedValue": selected["value"],
        "proposedValueNormalized": selected["normalized"],
        "sourceField": source_field,
        "sourceRawValue": selected["raw"],
        "parserStatus": selected["status"],
        "matchMethod": match_method,
        "matchConfidence": match_confidence,
        "valueConfidence": value_confidence,
        "conflictStatus": conflict_status,
        "requiresManualReview": requires_manual,
        "autoApplyEligible": False,
        "reason": candidate_reason(field, selected["status"], conflict_status, match_method),
        "auditMetadata": {
            "generatedBy": "run_cleaned_ledger_minimal_backfill_v3.py",
            "minimalLedgerV3": True,
            "oldV2FieldsDisabled": True,
            "privateRealDataCandidate": True,
        },
        "totalHistoricalRevenue": round(work["totalHistoricalRevenue"], 2),
    }


def enrich_auto_apply(candidate: dict) -> dict:
    reasons = []
    field = candidate["fieldName"]
    current = normalize_compare(candidate.get("currentValue"))
    proposed = normalize_compare(candidate.get("proposedValueNormalized") or candidate.get("proposedValue"))
    raw = clean(candidate.get("sourceRawValue"))
    if field not in BACKFILL_FIELDS:
        reasons.append("field_not_supported_by_minimal_ledger_v3")
    if field not in AUTO_APPLY_FIELDS:
        reasons.append("field_not_auto_applyable_in_minimal_ledger_v3")
    if not (
        candidate["matchMethod"] in {"exact_work_id", "mapping_work_id"}
        or (candidate["matchMethod"] == "title_author_exact" and to_float(candidate["matchConfidence"]) >= 0.99)
    ):
        reasons.append("match_not_strict_enough")
    if candidate["matchMethod"] == "title_author_fuzzy":
        reasons.append("title_author_fuzzy_never_auto_apply")
    if to_float(candidate["valueConfidence"]) < 0.97:
        reasons.append("value_confidence_below_0_97")
    if candidate["conflictStatus"] != "none":
        reasons.append("conflict_status_not_none")
    if candidate["requiresManualReview"]:
        reasons.append("requires_manual_review")
    if current and current != proposed:
        reasons.append("current_authoritative_value_not_empty")
    if candidate["parserStatus"] == "pending_anchor" or re.search(r"出版之日起|签订之日起|上线之日起|最后一部", raw):
        reasons.append("relative_expiry_without_anchor_not_auto_apply")
    if re.search(r"自动续|顺延|续约", raw):
        reasons.append("automatic_renewal_not_extended")
    if candidate["parserStatus"] == "indefinite" or re.search(r"永久|长期|无期限|版权保护期满", raw):
        reasons.append("indefinite_expiry_not_concrete_date")
    enriched = dict(candidate)
    enriched["autoApplyEligible"] = len(reasons) == 0
    enriched["autoApplyEligibleV3"] = len(reasons) == 0
    enriched["autoApplyExclusionReasonsV3"] = sorted(set(reasons))
    enriched["recommendedBucketV3"] = "auto_apply_v3" if len(reasons) == 0 else "manual_review_or_dry_run_only"
    return enriched


def build_structure_audit(path: Path, book: dict, rows: list[dict]) -> dict:
    sheet_summaries = []
    non_empty = {field: 0 for field in MINIMAL_HEADERS}
    for row in rows:
        for field in MINIMAL_HEADERS:
            if has_value(row.get(field)):
                non_empty[field] += 1
    for sheet in book["sheets"]:
        headers = sheet["headers"]
        sheet_summaries.append(
            {
                "sheetName": sheet["name"],
                "rowCount": len(sheet["rows"]),
                "fieldCount": len(headers),
                "fields": headers,
                "exactSevenFieldLedger": headers == MINIMAL_HEADERS,
            }
        )
    total = len(rows)
    return {
        "schema": "m1.cleaned_ledger_minimal.structure.v3",
        "ledgerPath": "data/master-data/cleaned-digital-copyright-ledger.xlsx",
        "ledgerPathNote": "actual private workbook is gitignored under data/master-data",
        "sheetCount": len(book["sheets"]),
        "sheetNames": [sheet["name"] for sheet in book["sheets"]],
        "totalDataRows": total,
        "fieldCount": len(book["sheets"][0]["headers"]) if book["sheets"] else 0,
        "fields": book["sheets"][0]["headers"] if book["sheets"] else [],
        "expectedFields": MINIMAL_HEADERS,
        "exactSevenFieldLedger": bool(book["sheets"] and book["sheets"][0]["headers"] == MINIMAL_HEADERS),
        "nonEmptyRates": {
            field: {"nonEmptyRows": non_empty[field], "rate": ratio(non_empty[field], total)} for field in MINIMAL_HEADERS
        },
        "sheets": sheet_summaries,
        "oldFieldsNoLongerParsed": OLD_FIELDS_DISABLED,
        "oldV2SpotcheckPackStatus": "obsolete_not_used",
    }


def build_match_audit(works: dict, matches: dict) -> dict:
    total_revenue = sum(work["totalHistoricalRevenue"] for work in works.values())
    matched_ids = [standard for standard, match in matches.items() if match["matched"]]
    unmatched_ids = [standard for standard, match in matches.items() if not match["matched"]]
    method_counts = Counter(match["matchMethod"] for match in matches.values())
    conflict_ids = [
        standard
        for standard, match in matches.items()
        if match["matched"] and len({tuple(candidate_values(row)) for row in match["ledgerRows"]}) > 1
    ]
    matched_revenue = sum(works[standard]["totalHistoricalRevenue"] for standard in matched_ids)
    unmatched_revenue = sum(works[standard]["totalHistoricalRevenue"] for standard in unmatched_ids)
    v2 = load_v2_comparison()
    return {
        "schema": "m1.cleaned_ledger_minimal.work_centric_match.v3",
        "m2TotalStandardWorks": len(works),
        "totalStandardWorks": len(works),
        "matchedWorks": len(matched_ids),
        "unmatchedWorks": len(unmatched_ids),
        "conflictStandardWorks": len(conflict_ids),
        "exactIdMatched": method_counts.get("exact_work_id", 0),
        "mappingIdMatched": method_counts.get("mapping_work_id", 0),
        "titleAuthorExactMatched": method_counts.get("title_author_exact", 0),
        "titleAuthorFuzzyMatched": method_counts.get("title_author_fuzzy", 0),
        "matchMethodDistribution": dict(method_counts),
        "revenueShares": {
            "matchedRevenueShare": ratio(matched_revenue, total_revenue),
            "unmatchedRevenueShare": ratio(unmatched_revenue, total_revenue),
        },
        "topRevenueCoverage": top_revenue_coverage(works, set(matched_ids)),
        "v2Comparison": v2,
        "sanitized": {
            "realWorkNamesIncluded": False,
            "authorNamesIncluded": False,
            "rawLedgerRowsIncluded": False,
        },
    }


def load_v2_comparison() -> dict:
    path = OUTPUT_M1 / "M1-ledger-backfill-match-enhancement-audit-v2.json"
    if not path.exists():
        return {"v2ReportAvailable": False}
    payload = json.loads(path.read_text(encoding="utf-8"))
    audit = payload.get("matchEnhancementAudit", {})
    return {
        "v2ReportAvailable": True,
        "previousMatchedWorks": audit.get("previousMatchedWorks"),
        "v2MatchedWorks": audit.get("v2MatchedWorks"),
        "v2UnmatchedWorks": audit.get("v2UnmatchedWorks"),
        "comparisonNote": "v3 uses only the new seven-column cleaned ledger; v2 65-field/audio-rights/publisher/CIP logic is obsolete.",
    }


def build_candidate_summary(candidates: list[dict], works: dict) -> dict:
    auto = [candidate for candidate in candidates if candidate["autoApplyEligibleV3"]]
    manual = [candidate for candidate in candidates if candidate["requiresManualReview"]]
    total_revenue = sum(work["totalHistoricalRevenue"] for work in works.values())
    candidate_standards = {candidate["standardWorkId"] for candidate in candidates}
    auto_standards = {candidate["standardWorkId"] for candidate in auto}
    return {
        "schema": "m1.cleaned_ledger_minimal.backfill_candidates.v3",
        "totalCandidateRows": len(candidates),
        "candidateWorks": len(candidate_standards),
        "autoApplyEligibleRows": len(auto),
        "autoApplyEligibleWorks": len(auto_standards),
        "manualReviewRows": len(manual),
        "byField": dict(Counter(candidate["fieldName"] for candidate in candidates)),
        "byMatchMethod": dict(Counter(candidate["matchMethod"] for candidate in candidates)),
        "byParserStatus": dict(Counter(candidate["parserStatus"] for candidate in candidates)),
        "byConflictStatus": dict(Counter(candidate["conflictStatus"] for candidate in candidates)),
        "byRecommendedBucket": dict(Counter(candidate["recommendedBucketV3"] for candidate in candidates)),
        "candidateRevenueShare": ratio(sum(works[standard]["totalHistoricalRevenue"] for standard in candidate_standards), total_revenue),
        "autoApplyRevenueShare": ratio(sum(works[standard]["totalHistoricalRevenue"] for standard in auto_standards), total_revenue),
        "explicitlyExcludedFields": OLD_FIELDS_DISABLED,
    }


def build_auto_apply_rule(candidate_summary: dict) -> dict:
    return {
        "schema": "m1.cleaned_ledger_minimal.auto_apply_rule.v3",
        "allowedAutoApplyFields": sorted(AUTO_APPLY_FIELDS),
        "neverAutoApplyFields": ["classificationLevel1", "classificationLevel2", *OLD_FIELDS_DISABLED],
        "criteria": {
            "currentValue": "must be empty, unless identical formatting normalization only",
            "matchMethod": "exact_work_id or mapping_work_id, or title_author_exact with matchConfidence >= 0.99",
            "valueConfidence": ">= 0.97",
            "conflictStatus": "none",
            "manualReview": "false",
            "fuzzyMatch": "never auto apply",
            "relativeExpiryWithoutAnchor": "never auto apply",
            "automaticRenewal": "never extend automatically",
            "indefiniteExpiry": "not converted to concrete date",
            "nonEmptyAuthoritativeValue": "not overwritten unless identical",
        },
        "summary": candidate_summary,
    }


def build_dry_run(candidates: list[dict], works: dict) -> dict:
    before = {
        "missingWorkName": sum(1 for work in works.values() if not has_value(work["currentWorkName"])),
        "missingAuthor": sum(1 for work in works.values() if not has_value(work["currentAuthorName"])),
        "missingCopyrightStart": len(works),
        "missingCopyrightEnd": len(works),
        "missingClassification1": len(works),
        "missingClassification2": len(works),
    }
    gap_map = {
        "standardWorkName": "missingWorkName",
        "authorName": "missingAuthor",
        "copyrightStartDate": "missingCopyrightStart",
        "copyrightEndDate": "missingCopyrightEnd",
        "classificationLevel1": "missingClassification1",
        "classificationLevel2": "missingClassification2",
    }
    reductions = defaultdict(set)
    manual_candidates = defaultdict(set)
    for candidate in candidates:
        gap = gap_map[candidate["fieldName"]]
        if candidate["autoApplyEligibleV3"]:
            reductions[gap].add(candidate["standardWorkId"])
        elif candidate["recommendedBucketV3"] == "manual_review_or_dry_run_only":
            manual_candidates[gap].add(candidate["standardWorkId"])
    fields = {}
    for gap, count in before.items():
        reduction = min(count, len(reductions[gap]))
        fields[gap] = {
            "before": count,
            "autoApplyAfter": max(0, count - reduction),
            "autoApplyReduction": reduction,
            "manualCandidateWorks": len(manual_candidates[gap]),
        }
    auto_standards = {candidate["standardWorkId"] for candidate in candidates if candidate["autoApplyEligibleV3"]}
    manual_standards = {candidate["standardWorkId"] for candidate in candidates if candidate["requiresManualReview"]}
    return {
        "schema": "m1.cleaned_ledger_minimal.dry_run.v3",
        "formalMasterDataWritten": False,
        "databaseWritten": False,
        "fieldGapResults": fields,
        "manualWorkloadReduction": {
            "autoApplyEligibleWorks": len(auto_standards),
            "remainingManualReviewWorks": len(manual_standards),
            "manualCandidateRows": sum(1 for candidate in candidates if candidate["requiresManualReview"]),
        },
        "topRevenueGapReduction": top_revenue_coverage(works, auto_standards),
        "safetyGuards": {
            "onlySixMinimalFieldsGenerated": True,
            "publisherNameGenerated": False,
            "firstPublicationDateGenerated": False,
            "audioRightsStatusGenerated": False,
            "classificationLevel3Generated": False,
            "fuzzyAutoApplyBlocked": True,
            "relativeExpiryAutoApplyBlocked": True,
            "automaticRenewalAutoExtendBlocked": True,
        },
    }


def build_m2_impact(dry_run: dict, candidate_summary: dict, works: dict, candidates: list[dict]) -> dict:
    end_auto = {
        candidate["standardWorkId"]
        for candidate in candidates
        if candidate["fieldName"] == "copyrightEndDate" and candidate["autoApplyEligibleV3"]
    }
    end_manual = {
        candidate["standardWorkId"]
        for candidate in candidates
        if candidate["fieldName"] == "copyrightEndDate" and not candidate["autoApplyEligibleV3"]
    }
    start_auto = {
        candidate["standardWorkId"]
        for candidate in candidates
        if candidate["fieldName"] == "copyrightStartDate" and candidate["autoApplyEligibleV3"]
    }
    relative_pending = sum(1 for candidate in candidates if candidate["parserStatus"] == "pending_anchor")
    return {
        "schema": "m2.cleaned_ledger_minimal_backfill_impact.v3",
        "copyrightTermForecast": {
            "autoApplyEndDateCandidateWorks": len(end_auto),
            "manualReviewEndDateCandidateWorks": len(end_manual),
            "expectedIncrease": "copyright_term_forecast output type can increase after approved local staging apply and forecast rerun",
        },
        "pendingExpiryReduction": {
            "autoReducibleWorks": len(end_auto),
            "manualCandidateWorks": len(end_manual),
        },
        "relativeExpiryPendingAnchorReduction": {
            "pendingAnchorCandidateRows": relative_pending,
            "autoReduction": 0,
            "reason": "relative expiry without an anchor remains manual-only",
        },
        "renewalReviewImprovement": {
            "startDateAutoCandidateWorks": len(start_auto),
            "endDateAutoCandidateWorks": len(end_auto),
        },
        "ratingAdjustmentImprovement": {
            "classificationCandidateRows": candidate_summary["byField"].get("classificationLevel1", 0)
            + candidate_summary["byField"].get("classificationLevel2", 0),
            "classificationDefaultAutoApply": False,
        },
        "manualReviewImprovement": {
            "candidateWorks": candidate_summary["candidateWorks"],
            "autoApplyEligibleWorks": candidate_summary["autoApplyEligibleWorks"],
            "manualReviewRows": candidate_summary["manualReviewRows"],
        },
        "audioRightsStatus": {
            "stillNeedsOtherSource": True,
            "reason": "the cleaned ledger v3 has no audio-rights field",
        },
        "recommendedRerunsAfterApprovedApply": [
            "forecastOutputType distribution",
            "30-work operator pack selection",
            "20-year sample validation",
            "business review selection",
            "v1.1 forecastability gate",
        ],
        "notM3": True,
    }


def build_spotcheck_rows(candidates: list[dict], works: dict) -> list[dict]:
    ordered = sorted(
        candidates,
        key=lambda item: (
            item["requiresManualReview"],
            item["fieldName"] in {"copyrightEndDate", "copyrightStartDate"},
            item["totalHistoricalRevenue"],
            item["matchMethod"] != "title_author_fuzzy",
        ),
        reverse=True,
    )
    rows = []
    seen = set()
    for candidate in ordered:
        key = (candidate["standardWorkId"], candidate["fieldName"])
        if key in seen:
            continue
        seen.add(key)
        rows.append(
            {
                "抽检编号": f"V3-{len(rows) + 1:03d}",
                "标准作品ID": candidate["standardWorkId"],
                "原始作品ID": candidate["rawWorkId"],
                "候选字段": field_cn(candidate["fieldName"]),
                "当前值": candidate["currentValue"],
                "建议值": candidate["proposedValue"],
                "来源字段": candidate["sourceField"],
                "来源摘要": summarize_private_source(candidate),
                "匹配方式": match_cn(candidate["matchMethod"]),
                "匹配置信度": confidence_cn(candidate["matchConfidence"]),
                "值置信度": confidence_cn(candidate["valueConfidence"]),
                "冲突状态": "无冲突" if candidate["conflictStatus"] == "none" else "存在冲突",
                "是否需人工复核": "是" if candidate["requiresManualReview"] else "否",
                "是否可自动应用": "是" if candidate["autoApplyEligibleV3"] else "否",
                "系统建议": "可自动应用候选" if candidate["autoApplyEligibleV3"] else "需人工复核",
                "建议理由": candidate["reason"],
                "用户判断": "",
                "用户修正值": "",
                "用户备注": "",
            }
        )
        if len(rows) >= 80:
            break
    return rows


def build_backfill_summary(structure: dict, match: dict, candidates: dict, dry_run: dict, impact: dict) -> dict:
    return {
        "schema": "m1.cleaned_ledger_minimal.backfill_summary.v3",
        "ledgerFieldScope": {
            "exactSevenFields": structure["exactSevenFieldLedger"],
            "fields": structure["fields"],
            "candidateFields": BACKFILL_FIELDS,
            "notGenerated": OLD_FIELDS_DISABLED,
        },
        "m2MatchCoverage": {
            "total": match["totalStandardWorks"],
            "matched": match["matchedWorks"],
            "unmatched": match["unmatchedWorks"],
            "matchedRevenueShare": match["revenueShares"]["matchedRevenueShare"],
        },
        "candidateSummary": candidates,
        "dryRunSummary": dry_run["manualWorkloadReduction"],
        "m2ImpactSummary": impact,
        "status": "dry_run_only_waiting_for_user_spotcheck",
        "m3Entered": False,
    }


def build_spotcheck_guide(rows: list[dict], candidate_summary: dict) -> dict:
    return {
        "schema": "m1.cleaned_ledger_minimal.user_spotcheck_guide.v3",
        "rowCount": len(rows),
        "privateWorkbook": rel(PRIVATE_SPOTCHECK_XLSX),
        "reviewDecisions": ["接受", "拒绝", "需修改", "不确定"],
        "fieldScope": {
            "included": ["作品名称", "作者", "版权开始", "版权到期", "分类一级", "分类二级"],
            "excluded": ["出版社", "首次出版日期", "有声权利状态", "分类三级", "CIP", "ISBN", "合同编号"],
        },
        "instructions": [
            "只复核候选值是否能作为本地 dry-run 回填候选。",
            "不确定、需修改、拒绝均不会自动进入正式主数据。",
            "分类一二级默认仅作人工复核候选。",
            "本轮不进入 M3，不写正式主数据。",
        ],
        "candidateSummary": candidate_summary,
    }


def write_outputs(payload: dict) -> None:
    OUTPUT_M1.mkdir(parents=True, exist_ok=True)
    OUTPUT_M2.mkdir(parents=True, exist_ok=True)
    PRIVATE_DIR.mkdir(parents=True, exist_ok=True)

    write_json(STRUCTURE_JSON, wrap_public("m1.cleaned_ledger_minimal.structure_audit.v3", payload["structureAudit"]))
    write_md(STRUCTURE_MD, structure_md(payload["structureAudit"]))
    write_json(MATCH_JSON, wrap_public("m1.cleaned_ledger_minimal.work_centric_match_audit.v3", payload["matchAudit"]))
    write_md(MATCH_MD, match_md(payload["matchAudit"]))
    write_json(AUTO_JSON, wrap_public("m1.cleaned_ledger_minimal.auto_apply_rule.v3", payload["autoApplyRule"]))
    write_md(AUTO_MD, auto_rule_md(payload["autoApplyRule"]))
    write_json(DRY_RUN_JSON, wrap_public("m1.cleaned_ledger_minimal.dry_run_result.v3", payload["dryRun"]))
    write_md(DRY_RUN_MD, dry_run_md(payload["dryRun"]))
    write_json(M2_IMPACT_JSON, wrap_public("m2.cleaned_ledger_minimal_backfill_impact.v3", payload["m2Impact"]))
    write_md(M2_IMPACT_MD, m2_impact_md(payload["m2Impact"]))
    write_json(BACKFILL_SUMMARY_JSON, wrap_public("m1.cleaned_ledger_minimal.backfill_summary.v3", payload["backfillSummary"]))
    write_md(BACKFILL_SUMMARY_MD, backfill_summary_md(payload["backfillSummary"]))
    write_json(SPOTCHECK_GUIDE_JSON, wrap_public("m1.cleaned_ledger_minimal.user_spotcheck_guide.v3", payload["spotcheckGuide"]))
    write_md(SPOTCHECK_GUIDE_MD, spotcheck_guide_md(payload["spotcheckGuide"]))

    write_json(PRIVATE_CANDIDATES_JSON, payload["private"])
    write_json(PRIVATE_DRY_RUN_JSON, {"dryRun": payload["dryRun"], "candidateRows": payload["candidateRows"]})
    write_xlsx(
        PRIVATE_CANDIDATES_XLSX,
        {
            "候选明细": private_candidate_rows(payload["candidateRows"]),
            "聚合摘要": dict_to_rows(payload["candidateSummary"]),
        },
    )
    write_xlsx(
        PRIVATE_DRY_RUN_XLSX,
        {
            "dry_run_聚合": dict_to_rows(payload["dryRun"]),
            "安全检查": dict_to_rows(payload["dryRun"]["safetyGuards"]),
        },
    )
    write_xlsx(
        PRIVATE_SPOTCHECK_XLSX,
        {"01_抽检清单": payload["spotcheckRows"], "00_说明": spotcheck_readme_rows(payload["spotcheckGuide"])},
        decision_sheet="01_抽检清单",
        decision_header="用户判断",
    )


def wrap_public(schema: str, payload: dict) -> dict:
    return {
        "schema": schema,
        "generatedAt": now(),
        "currentHead": git(["rev-parse", "HEAD"]),
        "originMain": git(["rev-parse", "origin/main"]),
        "safeOutputBoundary": {
            "sanitizedAggregateOnly": True,
            "realWorkNamesIncluded": False,
            "authorNamesIncluded": False,
            "rawLedgerRowsIncluded": False,
            "privateDetailsStoredOnlyInGitignoredOutput": True,
            "databaseConnected": False,
            "formalMasterDataWritten": False,
            "m3Entered": False,
        },
        "payload": payload,
    }


def structure_md(payload: dict) -> str:
    rows = [{"字段": field, "非空行数": item["nonEmptyRows"], "非空率": pct(item["rate"])} for field, item in payload["nonEmptyRates"].items()]
    return "\n".join(
        [
            "# M1 Cleaned Ledger Minimal Structure Audit v3",
            "",
            f"- Ledger path alias: `{payload['ledgerPath']}`",
            f"- Sheet names: `{', '.join(payload['sheetNames'])}`",
            f"- Data rows: `{payload['totalDataRows']}`",
            f"- Field count: `{payload['fieldCount']}`",
            f"- Exact seven-field ledger: `{payload['exactSevenFieldLedger']}`",
            "",
            "## Seven Fields",
            table(rows, ["字段", "非空行数", "非空率"]),
            "",
            "## Disabled v2 Fields",
            ", ".join(f"`{field}`" for field in payload["oldFieldsNoLongerParsed"]),
            "",
            "This report is aggregate-only and contains no real work names, author names, or raw ledger rows.",
        ]
    )


def match_md(payload: dict) -> str:
    method_rows = [{"匹配方式": key, "作品数": value} for key, value in payload["matchMethodDistribution"].items()]
    top_rows = [{"范围": key, **value} for key, value in payload["topRevenueCoverage"].items()]
    return "\n".join(
        [
            "# M1 Cleaned Ledger Minimal Work-Centric Match Audit v3",
            "",
            f"- M2 total standard works: `{payload['totalStandardWorks']}`",
            f"- Matched works: `{payload['matchedWorks']}`",
            f"- Unmatched works: `{payload['unmatchedWorks']}`",
            f"- Conflict works: `{payload['conflictStandardWorks']}`",
            f"- Matched revenue share: `{pct(payload['revenueShares']['matchedRevenueShare'])}`",
            "",
            "## Match Method Distribution",
            table(method_rows, ["匹配方式", "作品数"]),
            "",
            "## Top Revenue Coverage",
            table(top_rows, ["范围", "workCount", "matchedWorkCount", "matchedWorkRate", "matchedRevenueShare"]),
            "",
            "## v2 Comparison",
            f"- v2 available: `{payload['v2Comparison'].get('v2ReportAvailable')}`",
            f"- v2 matched works: `{payload['v2Comparison'].get('v2MatchedWorks')}`",
            "- v3 only uses the seven-field cleaned ledger; old publisher/audio-rights/CIP/contract parsing is obsolete.",
        ]
    )


def auto_rule_md(payload: dict) -> str:
    return "\n".join(
        [
            "# M1 Cleaned Ledger Minimal Auto-Apply Rule v3",
            "",
            "Auto apply is only a local dry-run eligibility rule. It does not write formal master data.",
            "",
            f"- Allowed auto-apply fields: `{', '.join(payload['allowedAutoApplyFields'])}`",
            f"- Never auto-apply fields: `{', '.join(payload['neverAutoApplyFields'])}`",
            "",
            "## Criteria",
            table([{"规则": key, "要求": value} for key, value in payload["criteria"].items()], ["规则", "要求"]),
        ]
    )


def dry_run_md(payload: dict) -> str:
    rows = [{"gap": key, **value} for key, value in payload["fieldGapResults"].items()]
    return "\n".join(
        [
            "# M1 Cleaned Ledger Minimal Dry-Run v3 Result",
            "",
            "- Formal master data written: `False`",
            "- Database written: `False`",
            "",
            "## Field Gap Results",
            table(rows, ["gap", "before", "autoApplyAfter", "autoApplyReduction", "manualCandidateWorks"]),
            "",
            "## Safety Guards",
            table([{"guard": key, "passed": value} for key, value in payload["safetyGuards"].items()], ["guard", "passed"]),
        ]
    )


def m2_impact_md(payload: dict) -> str:
    return "\n".join(
        [
            "# M2 Cleaned Ledger Minimal Backfill Impact v3",
            "",
            f"- Auto reducible copyright end works: `{payload['pendingExpiryReduction']['autoReducibleWorks']}`",
            f"- Manual candidate copyright end works: `{payload['pendingExpiryReduction']['manualCandidateWorks']}`",
            f"- Relative expiry pending anchor rows: `{payload['relativeExpiryPendingAnchorReduction']['pendingAnchorCandidateRows']}`",
            "- Audio rights status still needs another source: `True`",
            "- Not entering M3: `True`",
            "",
            "## Recommended Reruns After Approved Apply",
            "\n".join(f"- {item}" for item in payload["recommendedRerunsAfterApprovedApply"]),
        ]
    )


def backfill_summary_md(payload: dict) -> str:
    return "\n".join(
        [
            "# M1 Cleaned Ledger Minimal Backfill Summary v3",
            "",
            "- The cleaned ledger has exactly seven columns.",
            "- Generated candidate fields are limited to work name, author, copyright start, copyright end, classification level1, and classification level2.",
            "- No publisher, first publication date, audio rights, CIP, ISBN, contract, or classification level3 candidates are generated.",
            "- Classification level3 and audio rights still need another source or human process.",
            "- This is dry-run and spotcheck preparation only; no M3 entry.",
            "",
            f"- M2 matched works: `{payload['m2MatchCoverage']['matched']}` / `{payload['m2MatchCoverage']['total']}`",
            f"- Candidate rows: `{payload['candidateSummary']['totalCandidateRows']}`",
            f"- Auto-apply eligible rows: `{payload['candidateSummary']['autoApplyEligibleRows']}`",
            f"- Status: `{payload['status']}`",
        ]
    )


def spotcheck_guide_md(payload: dict) -> str:
    return "\n".join(
        [
            "# M1 Cleaned Ledger Minimal User Spotcheck Guide v3",
            "",
            f"- Private spotcheck workbook: `{payload['privateWorkbook']}`",
            f"- Row count: `{payload['rowCount']}`",
            f"- Allowed decisions: `{', '.join(payload['reviewDecisions'])}`",
            "- Included fields: work name, author, copyright start, copyright end, classification level1, classification level2.",
            "- Excluded fields: publisher, first publication date, audio rights, classification level3, CIP, ISBN, contract fields.",
            "- This guide is aggregate-only and contains no real work names or author names.",
        ]
    )


def private_candidate_rows(candidates: list[dict]) -> list[dict]:
    return [
        {
            "standardWorkId": item["standardWorkId"],
            "rawWorkId": item["rawWorkId"],
            "ledgerRowIds": ",".join(item["ledgerRowIds"]),
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
            "autoApplyEligible": item["autoApplyEligibleV3"],
            "reason": item["reason"],
            "auditMetadata": json.dumps(item["auditMetadata"], ensure_ascii=False),
        }
        for item in candidates
    ]


def spotcheck_readme_rows(guide: dict) -> list[dict]:
    return [
        {"项目": "用途", "说明": "复核新 7 字段台账生成的最小字段回填候选"},
        {"项目": "决策值", "说明": "接受 / 拒绝 / 需修改 / 不确定"},
        {"项目": "不会生成", "说明": "出版社、首次出版日期、有声权利状态、三级分类、CIP、ISBN、合同字段"},
        {"项目": "安全边界", "说明": "本文件在 data/private-output 下，gitignored，不提交"},
    ]


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


def write_xlsx(path: Path, sheets: dict[str, list[dict]], decision_sheet: str | None = None, decision_header: str | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types_xml(len(sheets)))
        archive.writestr("_rels/.rels", root_rels_xml())
        archive.writestr("xl/workbook.xml", workbook_xml(list(sheets)))
        archive.writestr("xl/_rels/workbook.xml.rels", workbook_rels_xml(len(sheets)))
        archive.writestr("xl/styles.xml", styles_xml())
        for index, (name, rows) in enumerate(sheets.items(), start=1):
            archive.writestr(
                f"xl/worksheets/sheet{index}.xml",
                worksheet_xml(rows, name == decision_sheet, decision_header),
            )


def worksheet_xml(rows: list[dict], add_decision_validation: bool, decision_header: str | None) -> str:
    headers = list(rows[0].keys()) if rows else ["空"]
    lines = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>']
    lines.append('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">')
    lines.append("<sheetData>")
    lines.append(row_xml(1, headers))
    for row_index, row in enumerate(rows, start=2):
        lines.append(row_xml(row_index, [row.get(header, "") for header in headers]))
    lines.append("</sheetData>")
    if add_decision_validation and decision_header in headers:
        col = column_name(headers.index(decision_header) + 1)
        last = max(2, len(rows) + 1)
        lines.append(
            f'<dataValidations count="1"><dataValidation type="list" allowBlank="1" sqref="{col}2:{col}{last}">'
            "<formula1>&quot;接受,拒绝,需修改,不确定&quot;</formula1></dataValidation></dataValidations>"
        )
    lines.append("</worksheet>")
    return "\n".join(lines)


def row_xml(row_index: int, values: list) -> str:
    cells = []
    for index, value in enumerate(values, start=1):
        ref = f"{column_name(index)}{row_index}"
        text = escape(str(value if value is not None else ""))
        cells.append(f'<c r="{ref}" t="inlineStr"><is><t>{text}</t></is></c>')
    return f'<row r="{row_index}">' + "".join(cells) + "</row>"


def content_types_xml(sheet_count: int) -> str:
    sheet_overrides = "\n".join(
        f'<Override PartName="/xl/worksheets/sheet{index}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        for index in range(1, sheet_count + 1)
    )
    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
{sheet_overrides}
</Types>'''


def root_rels_xml() -> str:
    return '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>'''


def workbook_xml(sheet_names: list[str]) -> str:
    sheets = "\n".join(
        f'<sheet name="{escape(name)}" sheetId="{index}" r:id="rId{index}"/>'
        for index, name in enumerate(sheet_names, start=1)
    )
    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>{sheets}</sheets>
</workbook>'''


def workbook_rels_xml(sheet_count: int) -> str:
    rels = "\n".join(
        f'<Relationship Id="rId{index}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{index}.xml"/>'
        for index in range(1, sheet_count + 1)
    )
    rels += f'\n<Relationship Id="rId{sheet_count + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    return f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
{rels}
</Relationships>'''


def styles_xml() -> str:
    return '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="1"><fill><patternFill patternType="none"/></fill></fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>'''


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_md(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text + "\n", encoding="utf-8")


def git(args: list[str]) -> str | None:
    try:
        return subprocess.check_output(["git", *args], cwd=ROOT, text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        return None


def clean(value) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if text.endswith(".0") and re.fullmatch(r"\d+\.0", text):
        text = text[:-2]
    return text


def has_value(value) -> bool:
    return clean(value) != ""


def normalize_work_id(value) -> str:
    text = clean(value).upper()
    text = text.replace(" ", "").replace("\u3000", "")
    if text.endswith(".0") and re.fullmatch(r"\d+\.0", text):
        text = text[:-2]
    if re.fullmatch(r"Y\d+", text):
        return text[1:]
    if re.fullmatch(r"\d+", text):
        return text
    return text


def normalize_raw_work_id(value) -> str:
    text = clean(value).upper()
    text = text.replace(" ", "").replace("\u3000", "")
    if text.endswith(".0") and re.fullmatch(r"\d+\.0", text):
        text = text[:-2]
    return text


def derive_standard_work_id(raw: str) -> str | None:
    if re.fullmatch(r"\d+", raw):
        return raw
    if re.fullmatch(r"Y\d+", raw.upper()):
        return raw[1:]
    return None


def normalize_title(value) -> str:
    text = clean(value)
    text = text.translate(str.maketrans({chr(0xFF01 + i): chr(0x21 + i) for i in range(94)}))
    text = re.sub(r"[《》“”\"'‘’（）()\[\]【】、，,。:：;；\s]", "", text)
    text = re.sub(r"(新版|修订版|珍藏版|套装|全集|增订版|纪念版|典藏版)", "", text)
    return text.lower()


def author_tokens(value) -> set[str]:
    text = clean(value)
    text = text.translate(str.maketrans({chr(0xFF01 + i): chr(0x21 + i) for i in range(94)}))
    parts = re.split(r"[、，,;；/／\s]+| and | 和 | 与 ", text)
    return {re.sub(r"(著|编著|主编|作者)", "", part).strip().lower() for part in parts if part.strip()}


def author_overlap(left: set[str], right: set[str]) -> bool:
    return bool(left and right and left.intersection(right))


def title_similarity(left: str, right: str) -> float:
    if not left or not right:
        return 0.0
    return sequence_ratio(left, right)


def sequence_ratio(left: str, right: str) -> float:
    # Small standard-library implementation to avoid importing difflib repeatedly in tight loops.
    import difflib

    return difflib.SequenceMatcher(None, left, right).ratio()


def parse_date_value(value) -> dict:
    text = clean(value)
    if not text:
        return {"status": "missing", "value": "", "normalized": ""}
    if re.search(r"永久|长期|无期限|版权保护期满", text):
        return {"status": "indefinite", "value": text, "normalized": ""}
    if re.search(r"出版之日起|签订之日起|上线之日起|最后一部", text):
        return {"status": "pending_anchor", "value": text, "normalized": ""}
    if re.search(r"自动续|顺延|续约", text):
        return {"status": "auto_renewal", "value": text, "normalized": ""}
    if re.fullmatch(r"\d+(\.\d+)?", text):
        serial = float(text)
        if 20000 <= serial <= 80000:
            date = datetime(1899, 12, 30) + timedelta(days=serial)
            return {"status": "parsed", "value": date.strftime("%Y-%m-%d"), "normalized": date.strftime("%Y-%m-%d")}
    match = re.search(r"(\d{4})[-/.年](\d{1,2})(?:[-/.月](\d{1,2}))?", text)
    if match:
        year = int(match.group(1))
        month = int(match.group(2))
        day = int(match.group(3) or 1)
        if 1900 <= year <= 2100 and 1 <= month <= 12 and 1 <= day <= 31:
            return {"status": "parsed", "value": f"{year:04d}-{month:02d}-{day:02d}", "normalized": f"{year:04d}-{month:02d}-{day:02d}"}
    return {"status": "unparsed", "value": text, "normalized": ""}


def parse_product_line(value) -> tuple[str, str]:
    text = clean(value)
    if not text:
        return "", ""
    parts = [part.strip() for part in re.split(r"\s*[>/／\\|｜-]\s*", text) if part.strip()]
    if len(parts) >= 2:
        return parts[0], parts[1]
    return text, ""


def estimate_value_confidence(field: str, status: str, method: str, match_confidence: float, conflict: str) -> float:
    if conflict != "none" or status != "parsed":
        return 0.5
    if field.startswith("classification"):
        return 0.9
    if method in {"exact_work_id", "mapping_work_id"}:
        return 0.99
    if method == "title_author_exact" and match_confidence >= 0.99:
        return 0.97
    return 0.8


def candidate_reason(field: str, status: str, conflict: str, method: str) -> str:
    if conflict != "none":
        return "same work has conflicting ledger candidate values; manual review required"
    if status != "parsed":
        return f"source value parser status is {status}; manual review required"
    if field.startswith("classification"):
        return "product line can only propose level1/level2 classification and defaults to manual review"
    if method == "title_author_fuzzy":
        return "fuzzy match candidate; never auto apply"
    return "minimal seven-field ledger candidate generated by strict local dry-run"


def candidate_values(row: dict) -> tuple:
    return (
        clean(row.get("出版书名")),
        clean(row.get("合同书名")),
        clean(row.get("作者署名")),
        clean(row.get("签订日期")),
        clean(row.get("到期时间")),
        clean(row.get("产品线")),
    )


def top_revenue_coverage(works: dict, matched: set[str]) -> dict:
    ordered = sorted(works.values(), key=lambda item: item["totalHistoricalRevenue"], reverse=True)
    total_revenue = sum(item["totalHistoricalRevenue"] for item in ordered)
    result = {}
    for label, fraction in [("top1Percent", 0.01), ("top5Percent", 0.05), ("top10Percent", 0.10)]:
        size = max(1, math.ceil(len(ordered) * fraction))
        cohort = ordered[:size]
        cohort_ids = {item["standardWorkId"] for item in cohort}
        matched_ids = cohort_ids.intersection(matched)
        matched_revenue = sum(item["totalHistoricalRevenue"] for item in cohort if item["standardWorkId"] in matched_ids)
        cohort_revenue = sum(item["totalHistoricalRevenue"] for item in cohort)
        result[label] = {
            "workCount": size,
            "matchedWorkCount": len(matched_ids),
            "matchedWorkRate": ratio(len(matched_ids), size),
            "matchedRevenueShare": ratio(matched_revenue, cohort_revenue),
            "matchedTotalRevenueShare": ratio(matched_revenue, total_revenue),
        }
    return result


def summarize_private_source(candidate: dict) -> str:
    return f"{candidate['sourceField']}；行数 {len(candidate['ledgerRowIds'])}；解析 {candidate['parserStatus']}"


def field_cn(field: str) -> str:
    return {
        "standardWorkName": "作品名称",
        "authorName": "作者",
        "copyrightStartDate": "版权开始",
        "copyrightEndDate": "版权到期",
        "classificationLevel1": "分类一级",
        "classificationLevel2": "分类二级",
    }.get(field, field)


def match_cn(method: str) -> str:
    return {
        "exact_work_id": "作品ID精确匹配",
        "mapping_work_id": "映射ID匹配",
        "title_author_exact": "书名作者精确匹配",
        "title_author_fuzzy": "书名作者模糊匹配",
        "unmatched": "未匹配",
    }.get(method, method)


def confidence_cn(value) -> str:
    score = to_float(value)
    if score >= 0.97:
        return "高"
    if score >= 0.8:
        return "中"
    return "低"


def normalize_compare(value) -> str:
    return re.sub(r"\s+", "", clean(value)).lower()


def to_float(value) -> float:
    try:
        if value is None or value == "":
            return 0.0
        return float(value)
    except Exception:
        return 0.0


def ratio(numerator, denominator) -> float:
    denominator = to_float(denominator)
    if abs(denominator) < 1e-12:
        return 0.0
    return round(to_float(numerator) / denominator, 6)


def pct(value) -> str:
    return f"{to_float(value) * 100:.2f}%"


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def rel(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT)).replace("\\", "/")
    except ValueError:
        return str(path).replace("\\", "/")


def column_index(ref: str) -> int:
    match = re.match(r"([A-Z]+)", ref)
    if not match:
        return 0
    index = 0
    for char in match.group(1):
        index = index * 26 + ord(char) - ord("A") + 1
    return index - 1


def column_name(index: int) -> str:
    name = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        name = chr(ord("A") + remainder) + name
    return name


def table(rows: list[dict], headers: list[str]) -> str:
    if not rows:
        return "_No rows._"
    lines = ["| " + " | ".join(headers) + " |", "| " + " | ".join("---" for _ in headers) + " |"]
    for row in rows:
        lines.append("| " + " | ".join(str(row.get(header, "")) for header in headers) + " |")
    return "\n".join(lines)


if __name__ == "__main__":
    main()
