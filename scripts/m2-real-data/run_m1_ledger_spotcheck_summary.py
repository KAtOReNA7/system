from __future__ import annotations

import argparse
import json
import re
import zipfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT = ROOT / "data" / "private-output" / "m1-master-data" / "M1-ledger-backfill-user-spotcheck-pack-simple-cn.xlsx"
PRIVATE_OUTPUT = ROOT / "data" / "private-output" / "m1-master-data" / "M1-ledger-backfill-user-spotcheck-summary-v2.json"
PUBLIC_JSON = ROOT / "docs" / "analysis" / "m1-master-data" / "M1-ledger-backfill-user-spotcheck-summary-v2.json"
PUBLIC_MD = ROOT / "docs" / "analysis" / "m1-master-data" / "M1-ledger-backfill-user-spotcheck-summary-v2.md"

REVIEW_SHEET = "01_极简审核清单"
VALID_DECISIONS = {"接受", "拒绝", "需修改", "不确定"}
ERROR_DECISIONS = {"拒绝", "需修改"}
AUTO_SUGGESTION = "可自动应用候选"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default=str(DEFAULT_INPUT))
    parser.add_argument("--rows-json")
    parser.add_argument("--private-output", default=str(PRIVATE_OUTPUT))
    parser.add_argument("--public-json", default=str(PUBLIC_JSON))
    parser.add_argument("--public-md", default=str(PUBLIC_MD))
    parser.add_argument("--print-json", action="store_true")
    args = parser.parse_args()

    rows = read_rows(args)
    payload = build_payload(rows, Path(args.input))
    write_outputs(payload, args)

    print(
        json.dumps(
            {
                "status": payload["publicSummary"]["status"],
                "readyForLocalStagingApply": payload["publicSummary"]["readyForLocalStagingApply"],
                "completionRate": payload["publicSummary"]["metrics"]["completionRate"],
                "acceptanceRate": payload["publicSummary"]["metrics"]["highConfidenceAcceptanceRate"],
                "totalRows": payload["publicSummary"]["metrics"]["totalRows"],
                "publicJson": str(Path(args.public_json).resolve()),
                "privateSummary": str(Path(args.private_output).resolve()),
            },
            ensure_ascii=False,
        )
    )
    if args.print_json:
        print(json.dumps(payload["publicSummary"], ensure_ascii=False, indent=2))


def read_rows(args) -> list[dict]:
    if args.rows_json:
        return json.loads(Path(args.rows_json).read_text(encoding="utf-8"))
    return read_xlsx_rows(Path(args.input), REVIEW_SHEET)


def build_payload(rows: list[dict], input_path: Path) -> dict:
    normalized_rows = [normalize_row(row) for row in rows]
    summary = summarize_rows(normalized_rows)
    generated_at = datetime.now(timezone.utc).isoformat()
    public_summary = {
        "schema": "m1.ledgerBackfill.spotcheckSummary.v2.public",
        "generatedAt": generated_at,
        "sourceWorkbook": input_path.name,
        "sanitizedAggregateOnly": True,
        "realTitlesIncluded": False,
        "authorNamesIncluded": False,
        "channelNamesIncluded": False,
        "rawLedgerRowsIncluded": False,
        **summary,
    }
    private_summary = {
        "schema": "m1.ledgerBackfill.spotcheckSummary.v2.private",
        "generatedAt": generated_at,
        "sourceWorkbook": str(input_path),
        "publicSummary": public_summary,
        "rowDecisionAudit": [
            {
                "reviewId": row["审核编号"],
                "priority": row["优先级"],
                "fieldType": row["字段类型"],
                "matchMethod": row["匹配方式"],
                "matchConfidence": row["匹配置信度"],
                "valueConfidence": row["值置信度"],
                "codexSuggestion": row["Codex建议"],
                "userDecision": row["用户判断"],
                "hasCorrectionValue": bool(row["用户修正值"]),
                "blockingReasons": row_blocking_reasons(row),
            }
            for row in normalized_rows
        ],
    }
    return {"publicSummary": public_summary, "privateSummary": private_summary}


def summarize_rows(rows: list[dict]) -> dict:
    total = len(rows)
    completed_rows = [row for row in rows if row["用户判断"] in VALID_DECISIONS]
    completed = len(completed_rows)
    high_conf_rows = [row for row in rows if is_high_confidence_candidate(row)]
    high_conf_completed = [row for row in high_conf_rows if row["用户判断"] in VALID_DECISIONS]
    high_conf_accepted = [row for row in high_conf_completed if row["用户判断"] == "接受"]

    decision_counts = Counter(row["用户判断"] or "未填写" for row in rows)
    field_counts = Counter(row["字段类型"] for row in rows)
    match_counts = Counter(row["匹配方式"] for row in rows)
    priority_counts = Counter(row["优先级"] for row in rows)

    needs_modify_missing = [row for row in rows if row["用户判断"] == "需修改" and not row["用户修正值"]]
    high_revenue_errors = [row for row in rows if row["优先级"] == "高" and row["用户判断"] in ERROR_DECISIONS]
    copyright_end_errors = [row for row in rows if row["字段类型"] == "版权到期日期" and row["用户判断"] in ERROR_DECISIONS]
    title_author_errors = [
        row
        for row in rows
        if row["字段类型"] in {"作品名", "作者"} and row["用户判断"] in ERROR_DECISIONS
    ]
    audio_errors = [row for row in rows if row["字段类型"] == "有声权利" and row["用户判断"] == "拒绝"]
    uncertain_rows = [row for row in rows if row["用户判断"] == "不确定"]
    low_or_medium_rows = [row for row in rows if not is_high_confidence_candidate(row)]
    conflict_rows = [row for row in rows if "冲突" in row["Codex建议"] or "冲突" in row["为什么建议这样处理"]]

    metrics = {
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
        "highConfidenceAcceptanceRate": ratio(len(high_conf_accepted), len(high_conf_completed)),
        "needsModifyMissingCorrectionCount": len(needs_modify_missing),
        "highRevenueErrorCount": len(high_revenue_errors),
        "copyrightEndSevereErrorCount": len(copyright_end_errors),
        "titleAuthorSevereErrorCount": len(title_author_errors),
        "audioRightsSevereErrorCount": len(audio_errors),
        "uncertainExcludedFromAutoApply": True,
        "lowOrMediumConfidenceExcludedFromAutoApply": True,
        "conflictRowsExcludedFromAutoApply": True,
        "lowOrMediumConfidenceRowCount": len(low_or_medium_rows),
        "conflictRowCount": len(conflict_rows),
    }

    gate_checks = {
        "completionRateAtLeast90Percent": metrics["completionRate"] >= 0.9,
        "highConfidenceAcceptanceRateAtLeast95Percent": metrics["highConfidenceAcceptanceRate"] >= 0.95,
        "highRevenueErrorCountZero": metrics["highRevenueErrorCount"] == 0,
        "copyrightEndSevereErrorCountZero": metrics["copyrightEndSevereErrorCount"] == 0,
        "titleAuthorSevereErrorCountZero": metrics["titleAuthorSevereErrorCount"] == 0,
        "audioRightsSevereErrorCountAtMostOne": metrics["audioRightsSevereErrorCount"] <= 1,
        "allNeedsModifyHaveCorrectionValue": metrics["needsModifyMissingCorrectionCount"] == 0,
        "uncertainRowsExcludedFromAutoApply": True,
        "lowOrMediumConfidenceRowsExcludedFromAutoApply": True,
        "conflictRowsExcludedFromAutoApply": True,
    }

    if total == 0 or completed == 0:
        status = "waiting_for_user_spotcheck"
    elif not gate_checks["completionRateAtLeast90Percent"]:
        status = "needs_more_spotcheck"
    elif has_rule_fix_blocker(gate_checks):
        status = "needs_rule_fix"
    elif all(gate_checks.values()):
        status = "ready_for_local_staging_apply"
    else:
        status = "not_ready"

    return {
        "status": status,
        "readyForLocalStagingApply": status == "ready_for_local_staging_apply",
        "metrics": metrics,
        "decisionDistribution": dict(decision_counts),
        "fieldTypeDistribution": dict(field_counts),
        "matchMethodDistribution": dict(match_counts),
        "priorityDistribution": dict(priority_counts),
        "gateChecks": gate_checks,
        "blockingSummary": {
            "needsModifyMissingCorrectionReviewIds": ids(needs_modify_missing),
            "highRevenueErrorReviewIds": ids(high_revenue_errors),
            "copyrightEndSevereErrorReviewIds": ids(copyright_end_errors),
            "titleAuthorSevereErrorReviewIds": ids(title_author_errors),
            "audioRightsSevereErrorReviewIds": ids(audio_errors),
            "uncertainReviewIds": ids(uncertain_rows),
        },
        "nextAction": next_action(status),
    }


def has_rule_fix_blocker(gate_checks: dict) -> bool:
    blocker_keys = [
        "highConfidenceAcceptanceRateAtLeast95Percent",
        "highRevenueErrorCountZero",
        "copyrightEndSevereErrorCountZero",
        "titleAuthorSevereErrorCountZero",
        "audioRightsSevereErrorCountAtMostOne",
        "allNeedsModifyHaveCorrectionValue",
    ]
    return any(not gate_checks[key] for key in blocker_keys)


def row_blocking_reasons(row: dict) -> list[str]:
    reasons = []
    if row["用户判断"] == "需修改" and not row["用户修正值"]:
        reasons.append("needs_modify_missing_correction")
    if row["优先级"] == "高" and row["用户判断"] in ERROR_DECISIONS:
        reasons.append("high_revenue_error")
    if row["字段类型"] == "版权到期日期" and row["用户判断"] in ERROR_DECISIONS:
        reasons.append("copyright_end_severe_error")
    if row["字段类型"] in {"作品名", "作者"} and row["用户判断"] in ERROR_DECISIONS:
        reasons.append("title_author_severe_error")
    if row["字段类型"] == "有声权利" and row["用户判断"] == "拒绝":
        reasons.append("audio_rights_severe_error")
    if row["用户判断"] == "不确定":
        reasons.append("uncertain_excluded_from_auto_apply")
    if not is_high_confidence_candidate(row):
        reasons.append("low_or_medium_confidence_excluded_from_auto_apply")
    return reasons


def next_action(status: str) -> str:
    return {
        "waiting_for_user_spotcheck": "请用户填写极简中文抽检审核包后重新运行 npm run summarize:m1:ledger-spotcheck。",
        "needs_more_spotcheck": "抽检完成率不足 90%，继续填写或扩大抽检。",
        "needs_rule_fix": "存在阻断错误或需修改缺少修正值，先复核错误模式或修正规则。",
        "not_ready": "暂不进入本地 staging apply，先复核未达标指标。",
        "ready_for_local_staging_apply": "可在下一轮单独授权后进入本地 staging apply；本脚本不写主数据。",
    }[status]


def normalize_row(row: dict) -> dict:
    normalized = {key: clean(row.get(key, "")) for key in expected_headers()}
    normalized["字段类型"] = translate_field(normalized["字段类型"])
    normalized["匹配方式"] = translate_match_method(normalized["匹配方式"])
    normalized["匹配置信度"] = translate_confidence(normalized["匹配置信度"])
    normalized["值置信度"] = translate_confidence(normalized["值置信度"])
    normalized["用户判断"] = normalized["用户判断"] if normalized["用户判断"] in VALID_DECISIONS else ""
    return normalized


def expected_headers() -> list[str]:
    return [
        "审核编号",
        "优先级",
        "字段类型",
        "当前值",
        "候选值",
        "来源台账字段",
        "台账摘要",
        "匹配方式",
        "匹配置信度",
        "值置信度",
        "Codex建议",
        "为什么建议这样处理",
        "用户判断",
        "用户修正值",
        "用户备注",
    ]


def is_high_confidence_candidate(row: dict) -> bool:
    return (
        row["匹配置信度"] == "高"
        and row["值置信度"] == "高"
        and row["Codex建议"] == AUTO_SUGGESTION
    )


def ratio(numerator: int, denominator: int) -> float:
    if denominator <= 0:
        return 0
    return round(numerator / denominator, 4)


def ids(rows: list[dict]) -> list[str]:
    return [row["审核编号"] for row in rows if row.get("审核编号")]


def clean(value) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    if text.endswith(".0") and re.fullmatch(r"\d+\.0", text):
        return text[:-2]
    return text


def translate_field(value: str) -> str:
    return {
        "standardWorkName": "作品名",
        "authorName": "作者",
        "copyrightStartDate": "版权开始日期",
        "copyrightEndDate": "版权到期日期",
        "publisherName": "出版社",
        "firstPublicationDate": "首发/出版日期",
        "audioRightsStatus": "有声权利",
        "classificationLevel1": "一级分类候选",
        "classificationLevel2": "二级分类候选",
    }.get(value, value)


def translate_match_method(value: str) -> str:
    return {
        "exact_work_id": "精确作品ID匹配",
        "mapping_work_id": "映射ID匹配",
        "title_author_exact": "书名作者精确匹配",
        "title_author_fuzzy": "书名作者模糊匹配",
    }.get(value, value)


def translate_confidence(value: str) -> str:
    return {
        "high": "高",
        "medium": "中",
        "low": "低",
    }.get(value, value)


def write_outputs(payload: dict, args) -> None:
    private_path = Path(args.private_output)
    public_json = Path(args.public_json)
    public_md = Path(args.public_md)
    private_path.parent.mkdir(parents=True, exist_ok=True)
    public_json.parent.mkdir(parents=True, exist_ok=True)
    private_path.write_text(json.dumps(payload["privateSummary"], ensure_ascii=False, indent=2), encoding="utf-8")
    public_json.write_text(json.dumps(payload["publicSummary"], ensure_ascii=False, indent=2), encoding="utf-8")
    public_md.write_text(render_public_md(payload["publicSummary"]), encoding="utf-8")


def render_public_md(summary: dict) -> str:
    metrics = summary["metrics"]
    gate = summary["gateChecks"]
    return "\n".join(
        [
            "# M1 Ledger Backfill User Spotcheck Summary v2",
            "",
            "本报告只包含聚合审核结果，不包含真实作品名、作者名、渠道名或台账原文。本脚本不连接数据库、不写正式主数据、不进入 M3。",
            "",
            "## 当前状态",
            f"- 状态：`{summary['status']}`",
            f"- ready_for_local_staging_apply：`{str(summary['readyForLocalStagingApply']).lower()}`",
            f"- 下一步：{summary['nextAction']}",
            "",
            "## 核心指标",
            "| 指标 | 数值 |",
            "|---|---:|",
            f"| 总行数 | {metrics['totalRows']} |",
            f"| 已填写行数 | {metrics['completedRows']} |",
            f"| 完成率 | {pct(metrics['completionRate'])} |",
            f"| 接受率 | {pct(metrics['acceptanceRate'])} |",
            f"| 高置信候选接受率 | {pct(metrics['highConfidenceAcceptanceRate'])} |",
            f"| 拒绝行数 | {metrics['rejectedRows']} |",
            f"| 需修改行数 | {metrics['needsModifyRows']} |",
            f"| 不确定行数 | {metrics['uncertainRows']} |",
            "",
            "## Apply Readiness Gate",
            "| 门槛 | 是否通过 |",
            "|---|---|",
            *[f"| {key} | `{str(value).lower()}` |" for key, value in gate.items()],
            "",
            "## 阻断摘要",
            f"- 高收入样本错误数：`{metrics['highRevenueErrorCount']}`",
            f"- 版权到期严重错误数：`{metrics['copyrightEndSevereErrorCount']}`",
            f"- 作者/书名严重错误数：`{metrics['titleAuthorSevereErrorCount']}`",
            f"- 有声权利严重错误数：`{metrics['audioRightsSevereErrorCount']}`",
            f"- 需修改但缺少修正值：`{metrics['needsModifyMissingCorrectionCount']}`",
            "",
            "未填写时状态应为 `waiting_for_user_spotcheck`；只有全部 gate 达标后，下一轮才可单独授权本地 staging apply。",
        ]
    )


def pct(value: float) -> str:
    return f"{value * 100:.1f}%"


def read_xlsx_rows(path: Path, sheet_name: str) -> list[dict]:
    if not path.exists():
        raise FileNotFoundError(f"Spotcheck workbook not found: {path}")
    with zipfile.ZipFile(path) as archive:
        shared_strings = read_shared_strings(archive)
        sheet_path = locate_sheet_path(archive, sheet_name)
        matrix = read_sheet_matrix(archive, sheet_path, shared_strings)
    if not matrix:
        return []
    headers = [clean(cell) for cell in matrix[0]]
    rows = []
    for values in matrix[1:]:
        row = {headers[index]: clean(values[index]) if index < len(values) else "" for index in range(len(headers))}
        if any(row.values()):
            rows.append(row)
    return rows


def read_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))
    values = []
    for item in root.iter(qname("si")):
        values.append("".join(text.text or "" for text in item.iter(qname("t"))))
    return values


def locate_sheet_path(archive: zipfile.ZipFile, sheet_name: str) -> str:
    workbook = ElementTree.fromstring(archive.read("xl/workbook.xml"))
    rels = ElementTree.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    rel_map = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels}
    for sheet in workbook.iter(qname("sheet")):
        if sheet.attrib.get("name") != sheet_name:
            continue
        relation_id = sheet.attrib.get(qname("id", rel=True))
        target = rel_map[relation_id].lstrip("/")
        return target if target.startswith("xl/") else f"xl/{target}"
    raise ValueError(f"Sheet not found: {sheet_name}")


def read_sheet_matrix(archive: zipfile.ZipFile, sheet_path: str, shared_strings: list[str]) -> list[list[str]]:
    root = ElementTree.fromstring(archive.read(sheet_path))
    rows = []
    for row in root.iter(qname("row")):
        cells = {}
        for cell in row.iter(qname("c")):
            column = cell_column_index(cell.attrib.get("r", "A1"))
            cells[column] = read_cell_value(cell, shared_strings)
        max_col = max(cells.keys(), default=-1)
        rows.append([cells.get(index, "") for index in range(max_col + 1)])
    return rows


def read_cell_value(cell, shared_strings: list[str]) -> str:
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        return "".join(text.text or "" for text in cell.iter(qname("t")))
    value = cell.find(qname("v"))
    if value is None or value.text is None:
        return ""
    raw = value.text
    if cell_type == "s":
        return shared_strings[int(raw)]
    return raw


def cell_column_index(reference: str) -> int:
    letters = re.match(r"[A-Z]+", reference)
    if not letters:
        return 0
    total = 0
    for char in letters.group(0):
        total = total * 26 + ord(char) - ord("A") + 1
    return total - 1


def qname(name: str, rel: bool = False) -> str:
    namespace = "http://schemas.openxmlformats.org/officeDocument/2006/relationships" if rel else "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    return f"{{{namespace}}}{name}"


if __name__ == "__main__":
    main()
