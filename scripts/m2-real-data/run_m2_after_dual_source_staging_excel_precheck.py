from __future__ import annotations

import json
import re
import subprocess
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
M2_DOCS = ROOT / "docs" / "analysis" / "m2-real-data"
M2_PRIVATE = ROOT / "data" / "private-output" / "m2-business-review"

OPERATOR_SOURCE_JSON = M2_PRIVATE / "m2-v1.1-30-work-operator-task-pack-cn-after-dual-source-staging-v2-source.json"
OPERATOR_ORIGINAL_XLSX = M2_PRIVATE / "m2-v1.1-30-work-operator-task-pack-cn-after-dual-source-staging-v2.xlsx"
OPERATOR_XLSX = M2_PRIVATE / "m2-v1.1-30-work-operator-task-pack-cn-after-dual-source-staging-v3.xlsx"
RANDOM20_SOURCE_JSON = M2_PRIVATE / "M2-v1.1-random-20-year-evaluation-after-dual-source-staging-v2-cn-source.json"
RANDOM20_ORIGINAL_XLSX = M2_PRIVATE / "M2-v1.1-random-20-year-evaluation-after-dual-source-staging-v2-cn.xlsx"
RANDOM20_XLSX = M2_PRIVATE / "M2-v1.1-random-20-year-evaluation-after-dual-source-staging-v3-cn.xlsx"

REPORT_MD = M2_DOCS / "M2-after-dual-source-staging-excel-usability-precheck-v1.md"
REPORT_JSON = M2_DOCS / "M2-after-dual-source-staging-excel-usability-precheck-v1.json"

OPERATOR_REQUIRED_COLUMNS = [
    "样本编号",
    "样本来源",
    "standard_work_id",
    "作品名",
    "作者",
    "来源分组",
    "staging补全字段",
    "预测输出类型",
    "版权开始日期",
    "版权到期日期",
    "剩余版权月数",
    "版权期内预测",
    "运营窗口预测",
    "预测置信度",
    "回测摘要",
    "评级",
    "生命周期",
    "风险",
    "运营建议",
    "运营判断：预测是否可信",
    "运营判断：评级是否合理",
    "运营判断：建议是否可执行",
    "运营发现的问题类型",
    "运营建议修正",
    "是否应进入M4校准案例池",
    "辅助原始forecastOutputType",
]

RANDOM20_REQUIRED_COLUMNS = [
    "序号",
    "抽样年份",
    "standard_work_id",
    "作品名",
    "作者",
    "来源分组",
    "staging补全字段",
    "预测输出类型",
    "版权开始日期",
    "版权到期日期",
    "剩余版权月数",
    "版权期内预测",
    "运营窗口预测",
    "缺版权到期原因",
    "评级",
    "生命周期",
    "收入层级",
    "预测状态",
    "基准预测",
    "保守预测",
    "乐观预测",
    "辅助原始forecastOutputType",
]

FORBIDDEN_MAIN_READING_PATTERNS = [
    "未映射",
    "model_",
    "numeric_forecast_eligible",
    "conservative_numeric_forecast",
    "observe_only_no_numeric_forecast",
    "true_forecast_blocked",
    "copyright_term_forecast",
    "operating_window_forecast_pending_expiry",
    "publication_cohort",
    "web_original_cohort",
    "mixed_or_uncertain_cohort",
    "action_allowed",
    "manual_confirmation_required",
    "action_blocked",
    "insufficient_history",
    "long_tail",
]


def main() -> None:
    payload = build_payload()
    M2_DOCS.mkdir(parents=True, exist_ok=True)
    REPORT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    REPORT_MD.write_text(build_markdown(payload), encoding="utf-8")
    print(json.dumps({
        "operatorFillable": payload["operatorTask"]["fillable"],
        "random20Readable": payload["random20"]["readable"],
        "mainReadingCodeIssue": payload["mainReadingCodeIssue"],
        "unreasonableBlankIssue": payload["unreasonableBlankIssue"],
        "report": str(REPORT_MD.relative_to(ROOT)),
    }, ensure_ascii=False))


def build_payload() -> dict:
    operator_source = read_json(OPERATOR_SOURCE_JSON)
    random20_source = read_json(RANDOM20_SOURCE_JSON)
    operator = analyze_operator(operator_source)
    random20 = analyze_random20(random20_source)
    main_code_issue = bool(operator["mainReadingCodeHits"] or random20["mainReadingCodeHits"])
    unreasonable_blank_issue = bool(operator["structuralBlankCounts"] or random20["bugLikeBlankCounts"])
    return {
        "schema": "m2.after_dual_source_staging_excel_usability_precheck.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "currentHead": git(["rev-parse", "HEAD"]),
        "originMain": git(["rev-parse", "origin/main"]),
        "operatorTask": operator,
        "random20": random20,
        "bothWorkbooksCanBeGivenToUser": operator["fillable"] and random20["readable"],
        "anonymousMatchingIssue": operator["anonymousMatchingIssue"],
        "mainReadingCodeIssue": main_code_issue,
        "unreasonableBlankIssue": unreasonable_blank_issue,
        "userShouldFillFields": [
            "运营判断：预测是否可信",
            "运营判断：评级是否合理",
            "运营判断：建议是否可执行",
            "运营发现的问题类型",
            "运营建议修正",
            "是否应进入M4校准案例池",
        ],
        "m3Entered": False,
        "privateWorkbookCommitted": False,
        "safeOutputBoundary": {
            "sanitizedAggregateOnly": True,
            "realWorkNamesIncluded": False,
            "authorNamesIncluded": False,
            "channelNamesIncluded": False,
            "rawLedgerRowsIncluded": False,
            "databaseConnected": False,
            "databaseWritten": False,
        },
    }


def analyze_operator(source: dict) -> dict:
    task_sheet = find_sheet(source, "01_运营任务卡")
    detail_sheet = find_sheet(source, "02_预测与回测明细")
    rows = task_sheet["rows"]
    non_user_rows = [row for row in rows if row.get("样本来源") != "用户指定作品"]
    sample_breakdown = Counter(row.get("样本来源", "") for row in rows)
    missing_columns = missing_columns_from(rows, OPERATOR_REQUIRED_COLUMNS)
    structural_blanks = Counter()
    data_gap_blanks = Counter()
    for row in non_user_rows:
        has_id = bool(clean(row.get("standard_work_id")))
        has_expiry = bool(clean(row.get("版权到期日期")))
        output_type = clean(row.get("辅助原始forecastOutputType"))
        if has_expiry and not clean(row.get("剩余版权月数")):
            structural_blanks["hasExpiryButMissingRemainingMonths"] += 1
        if output_type == "copyright_term_forecast" and not usable_text(row.get("版权期内预测")):
            structural_blanks["copyrightTermForecastMissing"] += 1
        if output_type == "operating_window_forecast_pending_expiry" and not usable_text(row.get("运营窗口预测")):
            structural_blanks["operatingWindowForecastMissing"] += 1
        if has_id and not clean(row.get("作品名")):
            structural_blanks["standardWorkIdButMissingWorkName"] += 1
        if has_id and not clean(row.get("作者")):
            data_gap_blanks["standardWorkIdButMissingAuthor"] += 1
    code_hits = scan_main_reading_code_hits(rows, auxiliary_prefix="辅助原始")
    detail_code_hits = scan_main_reading_code_hits(detail_sheet["rows"], auxiliary_prefix="辅助原始")
    round_trip = bool(source.get("summary", {}).get("canRoundTripUserFeedbackByStandardWorkId"))
    fillable = (
        len(rows) == 30
        and sample_breakdown.get("系统分层样本", 0) == 20
        and sample_breakdown.get("用户指定作品", 0) == 5
        and sample_breakdown.get("高风险边界样本", 0) == 5
        and not missing_columns
        and not structural_blanks
        and not code_hits
        and not detail_code_hits
        and round_trip
        and xlsx_valid(OPERATOR_XLSX)
    )
    return {
        "path": str(OPERATOR_XLSX.relative_to(ROOT)),
        "originalLockedPath": str(OPERATOR_ORIGINAL_XLSX.relative_to(ROOT)),
        "sourceJsonPath": str(OPERATOR_SOURCE_JSON.relative_to(ROOT)),
        "xlsxExists": OPERATOR_XLSX.exists(),
        "xlsxZipValid": xlsx_valid(OPERATOR_XLSX),
        "fillable": fillable,
        "taskRowCount": len(rows),
        "nonUserSampleCount": len(non_user_rows),
        "sampleBreakdown": dict(sample_breakdown),
        "requiredColumnMissing": missing_columns,
        "structuralBlankCounts": dict(structural_blanks),
        "dataGapBlankCounts": dict(data_gap_blanks),
        "mainReadingCodeHits": code_hits + detail_code_hits,
        "canRoundTripUserFeedbackByStandardWorkId": round_trip,
        "anonymousMatchingIssue": not round_trip,
        "detailRowCount": len(detail_sheet["rows"]),
    }


def analyze_random20(source: dict) -> dict:
    sheet = find_sheet(source, "01_跨年份样本评估")
    rows = sheet["rows"]
    missing_columns = missing_columns_from(rows, RANDOM20_REQUIRED_COLUMNS)
    code_hits = scan_main_reading_code_hits(rows, auxiliary_prefix="辅助原始")
    blank_reasons = Counter()
    bug_like = Counter()
    data_gap_blanks = Counter()
    for row in rows:
        output_type = clean(row.get("辅助原始forecastOutputType"))
        forecast_status = clean(row.get("辅助原始预测状态code")) or clean(row.get("预测状态"))
        has_expiry = bool(clean(row.get("版权到期日期")))
        if not clean(row.get("剩余版权月数")):
            blank_reasons[blank_reason(row, forecast_status, has_expiry, field="remainingMonths")] += 1
        if not clean(row.get("基准预测")) or not clean(row.get("保守预测")) or not clean(row.get("乐观预测")):
            blank_reasons[blank_reason(row, forecast_status, has_expiry, field="forecastScenarios")] += 1
        if output_type == "copyright_term_forecast" and not usable_text(row.get("版权期内预测")):
            bug_like["copyrightTermForecastMissing"] += 1
        if output_type == "operating_window_forecast_pending_expiry" and not usable_text(row.get("运营窗口预测")):
            bug_like["operatingWindowForecastMissing"] += 1
        if bool(clean(row.get("standard_work_id"))) and not clean(row.get("作品名")):
            bug_like["standardWorkIdButMissingWorkName"] += 1
        if bool(clean(row.get("standard_work_id"))) and not clean(row.get("作者")):
            data_gap_blanks["standardWorkIdButMissingAuthor"] += 1
    years = sorted({clean(row.get("抽样年份")) for row in rows if clean(row.get("抽样年份"))})
    output_types = Counter(clean(row.get("预测输出类型")) for row in rows)
    readable = (
        len(rows) == 20
        and len(years) >= 2
        and not missing_columns
        and not code_hits
        and not bug_like
        and xlsx_valid(RANDOM20_XLSX)
    )
    return {
        "path": str(RANDOM20_XLSX.relative_to(ROOT)),
        "originalPath": str(RANDOM20_ORIGINAL_XLSX.relative_to(ROOT)),
        "sourceJsonPath": str(RANDOM20_SOURCE_JSON.relative_to(ROOT)),
        "xlsxExists": RANDOM20_XLSX.exists(),
        "xlsxZipValid": xlsx_valid(RANDOM20_XLSX),
        "readable": readable,
        "rowCount": len(rows),
        "yearsCovered": years,
        "yearCoverageCount": len(years),
        "rowsWithStandardWorkId": sum(1 for row in rows if clean(row.get("standard_work_id"))),
        "rowsWithWorkName": sum(1 for row in rows if clean(row.get("作品名"))),
        "rowsWithAuthor": sum(1 for row in rows if clean(row.get("作者"))),
        "forecastOutputTypeDistribution": dict(output_types),
        "requiredColumnMissing": missing_columns,
        "mainReadingCodeHits": code_hits,
        "blankReasonDistribution": dict(blank_reasons),
        "bugLikeBlankCounts": dict(bug_like),
        "dataGapBlankCounts": dict(data_gap_blanks),
    }


def blank_reason(row: dict, forecast_status: str, has_expiry: bool, field: str) -> str:
    if not has_expiry and field == "remainingMonths":
        return "缺版权到期"
    if "暂不可预测" in forecast_status or forecast_status == "true_forecast_blocked":
        return "true forecast blocked"
    if "仅观察" in forecast_status or forecast_status == "observe_only_no_numeric_forecast":
        return "observe only"
    if clean(row.get("staging补全字段")) == "无":
        return "staging 未命中"
    if "历史不足" in forecast_status:
        return "数据不足"
    return "bug"


def find_sheet(source: dict, sheet_name: str) -> dict:
    for sheet in source.get("sheets", []):
        if sheet.get("name") == sheet_name:
            return sheet
    raise SystemExit(f"Missing sheet: {sheet_name}")


def missing_columns_from(rows: list[dict], required_columns: list[str]) -> list[str]:
    if not rows:
        return required_columns
    columns = set(rows[0].keys())
    return [column for column in required_columns if column not in columns]


def scan_main_reading_code_hits(rows: list[dict], auxiliary_prefix: str) -> list[dict]:
    hits = []
    pattern = re.compile("|".join(re.escape(item) for item in FORBIDDEN_MAIN_READING_PATTERNS))
    for row in rows:
        for column, value in row.items():
            if column.startswith(auxiliary_prefix) or column in {"standard_work_id", "raw_work_id"}:
                continue
            text = clean(value)
            if text and pattern.search(text):
                hits.append({"column": column, "pattern": "english_code_or_unmapped", "counted": True})
                break
        if len(hits) >= 10:
            break
    return hits


def xlsx_valid(path: Path) -> bool:
    if not path.exists():
        return False
    if not zipfile.is_zipfile(path):
        return False
    with zipfile.ZipFile(path) as archive:
        return "[Content_Types].xml" in archive.namelist()


def usable_text(value) -> bool:
    text = clean(value)
    return bool(text) and not text.startswith("不适用")


def clean(value) -> str:
    if value is None:
        return ""
    return str(value).strip()


def read_json(path: Path) -> dict:
    if not path.exists():
        raise SystemExit(f"Missing input: {path.relative_to(ROOT)}")
    return json.loads(path.read_text(encoding="utf-8"))


def git(args: list[str]) -> str:
    try:
        return subprocess.check_output(["git", *args], cwd=ROOT, text=True, encoding="utf-8").strip()
    except Exception:
        return ""


def build_markdown(payload: dict) -> str:
    op = payload["operatorTask"]
    random20 = payload["random20"]
    return "\n".join([
        "# M2 after-dual-source-staging Excel usability precheck v1",
        "",
        "## 结论",
        f"- 30-work 运营任务包可填写: `{op['fillable']}`",
        f"- 20-year evaluation 表可读: `{random20['readable']}`",
        f"- 两张表是否可以交给用户填写: `{payload['bothWorkbooksCanBeGivenToUser']}`",
        f"- 是否仍存在匿名无法匹配问题: `{payload['anonymousMatchingIssue']}`",
        f"- 是否仍存在主阅读英文 code 或未映射: `{payload['mainReadingCodeIssue']}`",
        f"- 是否仍存在不合理空白: `{payload['unreasonableBlankIssue']}`",
        f"- 是否进入 M3: `{payload['m3Entered']}`",
        "",
        "## 30-work 运营任务包",
        f"- 文件: `{op['path']}`",
        f"- xlsx 格式有效: `{op['xlsxZipValid']}`",
        f"- 任务行数: `{op['taskRowCount']}`",
        f"- 样本分布: `{json.dumps(op['sampleBreakdown'], ensure_ascii=False)}`",
        f"- 缺失列: `{json.dumps(op['requiredColumnMissing'], ensure_ascii=False)}`",
        f"- 结构性不合理空白计数: `{json.dumps(op['structuralBlankCounts'], ensure_ascii=False)}`",
        f"- 真实数据缺口空白计数: `{json.dumps(op['dataGapBlankCounts'], ensure_ascii=False)}`",
        f"- 可用 standard_work_id 回写: `{op['canRoundTripUserFeedbackByStandardWorkId']}`",
        "",
        "## 20-year evaluation",
        f"- 文件: `{random20['path']}`",
        f"- xlsx 格式有效: `{random20['xlsxZipValid']}`",
        f"- 有效样本行数: `{random20['rowCount']}`",
        f"- 覆盖年份: `{json.dumps(random20['yearsCovered'], ensure_ascii=False)}`",
        f"- 预测输出类型分布: `{json.dumps(random20['forecastOutputTypeDistribution'], ensure_ascii=False)}`",
        f"- 空白原因分布: `{json.dumps(random20['blankReasonDistribution'], ensure_ascii=False)}`",
        f"- 疑似 bug 空白计数: `{json.dumps(random20['bugLikeBlankCounts'], ensure_ascii=False)}`",
        f"- 真实数据缺口空白计数: `{json.dumps(random20['dataGapBlankCounts'], ensure_ascii=False)}`",
        "",
        "## 用户填写字段",
        *[f"- {field}" for field in payload["userShouldFillFields"]],
        "",
        "## 安全边界",
        "- 本报告只包含聚合统计和文件路径，不包含真实作品名、作者名、渠道名或原始账单行。",
        "- private Excel 与 private source JSON 保持在 gitignored data/private-output 下，不提交。",
        "- 本轮未进入 M3。",
        "",
    ])


if __name__ == "__main__":
    main()
