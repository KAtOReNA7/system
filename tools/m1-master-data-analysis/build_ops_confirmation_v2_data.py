from __future__ import annotations

import hashlib
import json
import sys
from collections import Counter, defaultdict
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parents[1]
sys.path.insert(0, str(SCRIPT_DIR))

import analyze_master_data as amd  # noqa: E402


PRIVATE_ROOT = ROOT / "data" / "m1-master-data-private"
OPS_ROOT = PRIVATE_ROOT / "ops-confirmation"
OUTPUT_JSON = OPS_ROOT / "ops-confirmation-v2-data.json"


def sample_code(prefix: str, *values: Any) -> str:
    payload = "\x1f".join("" if value is None else str(value) for value in values)
    return f"{prefix}-{hashlib.sha256(payload.encode('utf-8')).hexdigest()[:10].upper()}"


def split_lines(value: str | None) -> list[str]:
    if not value:
        return []
    return [line.strip() for line in str(value).replace("；", "\n").splitlines() if line.strip()]


def join_unique(values: list[Any], limit: int | None = None) -> str:
    seen = set()
    result = []
    for value in values:
        text = amd.norm_text(value)
        if not text or text in seen:
            continue
        seen.add(text)
        result.append(text)
        if limit and len(result) >= limit:
            break
    return "\n".join(result)


def text_value_counts(rows: list[dict[str, Any]], key: str) -> str:
    counter = Counter(amd.norm_text(row.get(key)) for row in rows if amd.norm_text(row.get(key)))
    return "\n".join(f"{value}｜{count}" for value, count in counter.most_common())


def decimal_sum(rows: list[dict[str, Any]]) -> Decimal:
    total = Decimal("0")
    for row in rows:
        value = row.get("amount")
        if value is not None:
            total += value
    return total


def decimal_display(value: Decimal) -> float:
    return float(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def parse_decimal_text(value: Any) -> Decimal:
    try:
        return Decimal(str(value).replace(",", "").strip())
    except Exception:
        return Decimal("0")


def amount_from_text(value: Any) -> tuple[float, str]:
    exact = parse_decimal_text(value)
    return decimal_display(exact), format(exact, "f")


def standard_id_list(value: str | None) -> list[str]:
    return sorted({line for line in split_lines(value) if line})


def derive_bill_group_summary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    amount = decimal_sum(rows)
    names = Counter(amd.norm_text(row.get("work_name")) for row in rows if amd.norm_text(row.get("work_name")))
    main_name = names.most_common(1)[0][0] if names else ""
    other_names = [name for name, _count in names.most_common() if name != main_name]
    return {
        "record_count": len(rows),
        "month_range": amd.month_range(row.get("month") for row in rows),
        "amount_display": decimal_display(amount),
        "amount_exact": format(amount, "f"),
        "main_name": main_name,
        "other_names": "\n".join(other_names),
        "all_names": "\n".join(f"{name}｜{count}" for name, count in names.most_common()),
        "all_auths": text_value_counts(rows, "auth"),
        "raw_ids": "\n".join(sorted({row["raw_work_id"] for row in rows if row.get("raw_work_id")})),
        "forms": "\n".join(sorted({row["business_form"] for row in rows if row.get("business_form")})),
    }


def build_formal_blockers(bill_conflicts: dict[str, Any]) -> list[dict[str, Any]]:
    by_raw: dict[str, dict[str, Any]] = {}

    def upsert(source_row: dict[str, Any], issue_type: str) -> None:
        raw_id = source_row.get("raw_work_id") or ""
        if not raw_id:
            raw_id = source_row.get("confirmation_group_id") or sample_code("RAW", issue_type, source_row)
        item = by_raw.setdefault(
            raw_id,
            {
                "任务ID": sample_code("IMPORT", raw_id),
                "原始作品ID": raw_id,
                "标准作品ID候选": source_row.get("standard_id", ""),
                "业务形态候选": source_row.get("business_form", ""),
                "问题类型": [],
                "记录数": source_row.get("record_count", ""),
                "月份范围": source_row.get("month_range", ""),
                "累计实销": "",
                "累计实销_完整精度": "",
                "历史作品名称及记录数": source_row.get("name_details", ""),
                "历史授权分类及记录数": source_row.get("auth_details", ""),
                "纯数字/Y关系": source_row.get("pure_digit_y_relation", ""),
                "系统候选解释": [],
                "运营确认结果": "",
                "确认标准作品ID": "",
                "确认标准作品名称": "",
                "是否解除阻断": "",
                "运营备注": "",
            },
        )
        if issue_type not in item["问题类型"]:
            item["问题类型"].append(issue_type)
        explanation = source_row.get("system_candidate_explanation", "")
        if explanation and explanation not in item["系统候选解释"]:
            item["系统候选解释"].append(explanation)
        if not item["累计实销"] and source_row.get("amount_total") is not None:
            display, exact = amount_from_text(source_row.get("amount_total"))
            item["累计实销"] = display
            item["累计实销_完整精度"] = exact

    for row in bill_conflicts["multi_name"]:
        upsert(row, "多名称作品ID")
    for row in bill_conflicts["multi_auth"]:
        upsert(row, "多授权分类作品ID")
    for row in bill_conflicts["abnormal_ids"]:
        upsert(row, "异常作品ID")

    result = []
    for item in by_raw.values():
        item["问题类型"] = "\n".join(item["问题类型"])
        item["系统候选解释"] = "\n".join(item["系统候选解释"])
        result.append(item)
    return sorted(result, key=lambda item: item["原始作品ID"])


def build_multi_id_candidates(volume_candidates: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    multi_id = []
    single_id = []
    for row in volume_candidates:
        standards = standard_id_list(row.get("standard_id_candidates"))
        display, exact = amount_from_text(row.get("amount_total"))
        out = {
            "任务ID": row.get("confirmation_group_id", ""),
            "候选类型": row.get("candidate_type", ""),
            "标准作品ID候选": "\n".join(standards),
            "原始财务ID候选": row.get("raw_work_id_candidates", ""),
            "业务形态候选": row.get("business_form_candidates", ""),
            "记录数": row.get("record_count", ""),
            "月份范围": row.get("month_range", ""),
            "累计实销": display,
            "累计实销_完整精度": exact,
            "历史作品名称及记录数": row.get("name_details", ""),
            "授权分类及记录数": row.get("auth_details", ""),
            "系统候选解释": row.get("system_candidate_explanation", ""),
            "是否归并": "",
            "主标准作品ID": "",
            "其他ID处理方式": "",
            "是否解除阻断": "",
            "备注": "",
        }
        if len(standards) >= 2:
            multi_id.append(out)
        else:
            single_id.append(out)
    return sorted(multi_id, key=lambda item: item["任务ID"]), sorted(single_id, key=lambda item: item["任务ID"])


def candidate_values(records: list[dict[str, Any]], columns: list[str], limit: int | None = None) -> str:
    values = []
    for record in records:
        for column in columns:
            value = amd.norm_text(record.get(column))
            if value:
                values.append(value)
    return join_unique(values, limit=limit)


def candidate_field_values(records: list[dict[str, Any]], columns: list[str], limit: int = 30) -> str:
    values = []
    for record in records:
        for column in columns:
            value = amd.norm_text(record.get(column))
            if value:
                if len(value) > 180:
                    value = value[:177] + "..."
                values.append(f"{column}: {value}")
    return join_unique(values, limit=limit)


def build_basic_info(
    bill_conflicts: dict[str, Any],
    master_analysis: dict[str, Any],
) -> list[dict[str, Any]]:
    rows = []
    for standard_id in sorted(bill_conflicts["standards_seen"], key=lambda value: (len(value), value)):
        bill_rows = bill_conflicts["by_standard"].get(standard_id, [])
        master_records = master_analysis["master_by_standard"].get(standard_id, [])
        bill_summary = derive_bill_group_summary(bill_rows)

        title_candidates = candidate_values(master_records, ["出版书名", "合同书名"], limit=20)
        author_candidates = candidate_values(master_records, ["作者署名", "作者原名"], limit=20)
        start_candidates = join_unique([record.get("_copyright_start_candidate") for record in master_records])
        end_candidates = join_unique([record.get("_copyright_end_candidate") for record in master_records])
        category_candidates = candidate_field_values(master_records, amd.CATEGORY_CANDIDATE_COLS, limit=25)
        tag_candidates = candidate_field_values(master_records, amd.TAG_CANDIDATE_COLS, limit=25)

        missing = []
        if not title_candidates and not bill_summary["main_name"]:
            missing.append("标准作品名称")
        if not author_candidates:
            missing.append("作者")
        missing.append("一级至三级分类")
        if not start_candidates:
            missing.append("版权开始日期")
        if not end_candidates:
            missing.append("版权到期日期")
        if not tag_candidates:
            missing.append("必需标签")

        if not master_records:
            match_status = "台账未匹配"
        elif standard_id in {row.get("standard_id") for row in master_analysis["copyright_period_groups"]}:
            match_status = "台账已匹配，但版权期限冲突"
        elif any(row.get("standard_id") == standard_id for row in master_analysis["duplicate_raw_ids"]):
            match_status = "台账已匹配，但同ID关键字段冲突"
        else:
            match_status = "台账已匹配"

        rows.append(
            {
                "标准作品ID": standard_id,
                "原始财务ID": bill_summary["raw_ids"],
                "业务形态": bill_summary["forms"],
                "账单主要名称": bill_summary["main_name"],
                "其他历史名称": bill_summary["other_names"],
                "首次正数实销月份": bill_conflicts["first_positive_by_standard"].get(standard_id, ""),
                "累计实销": bill_summary["amount_display"],
                "累计实销_完整精度": bill_summary["amount_exact"],
                "数字版权台账匹配状态": match_status,
                "台账标准名称候选": title_candidates,
                "作者候选": author_candidates,
                "版权开始日期候选（签订日期）": start_candidates,
                "版权到期日期候选（到期时间）": end_candidates,
                "分类候选": category_candidates,
                "标签候选": tag_candidates,
                "需要补充的字段": "\n".join(missing),
                "运营确认标准作品名称": "",
                "运营确认作者": "",
                "运营确认一级分类": "",
                "运营确认二级分类": "",
                "运营确认三级分类": "",
                "运营确认版权开始日期": "",
                "运营确认版权到期日期": "",
                "运营确认必需标签": "",
                "补全状态": "",
                "运营备注": "",
            }
        )
    return rows


def build_ledger_conflicts(master_analysis: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for row in master_analysis["duplicate_raw_ids"]:
        conflict_fields = []
        if int(row.get("distinct_title_count", 0) or 0) > 1:
            conflict_fields.append("标准名称候选")
        if int(row.get("distinct_author_count", 0) or 0) > 1:
            conflict_fields.append("作者候选")
        if int(row.get("distinct_copyright_period_count", 0) or 0) > 1:
            conflict_fields.append("版权期限")
        rows.append(
            {
                "任务ID": row.get("confirmation_group_id", ""),
                "标准作品ID": row.get("standard_id", ""),
                "原始作品ID": row.get("raw_work_id", ""),
                "冲突字段": "\n".join(conflict_fields),
                "各候选值": "\n".join(
                    item
                    for item in [
                        "名称候选:\n" + row.get("master_title_candidates", "") if row.get("master_title_candidates") else "",
                        "作者候选:\n" + row.get("author_candidates", "") if row.get("author_candidates") else "",
                        "版权期限候选:\n" + row.get("copyright_period_candidates", "") if row.get("copyright_period_candidates") else "",
                    ]
                    if item
                ),
                "来源记录数量": row.get("record_count", ""),
                "运营确认值": "",
                "是否解除冲突": "",
                "备注": "",
            }
        )
    return sorted(rows, key=lambda item: item["任务ID"])


def build_copyright_conflicts(master_analysis: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for row in master_analysis["copyright_period_groups"] + master_analysis["pure_y_counterexamples"]:
        periods = []
        if row.get("copyright_period_candidates"):
            periods = split_lines(row.get("copyright_period_candidates"))
        else:
            periods = split_lines(row.get("pure_digit_periods")) + split_lines(row.get("y_prefix_periods"))
        starts = []
        ends = []
        for period in periods:
            if "~" in period:
                start, end = period.split("~", 1)
                starts.append(start.strip())
                ends.append(end.strip())
        rows.append(
            {
                "任务ID": row.get("confirmation_group_id", ""),
                "标准作品ID": row.get("standard_id", ""),
                "全部签订日期候选": join_unique(starts),
                "全部到期时间候选": join_unique(ends),
                "来源记录及业务形态": "\n".join(
                    item
                    for item in [
                        "原始ID: " + row.get("raw_work_id_candidates", "") if row.get("raw_work_id_candidates") else "",
                        "业务形态: " + row.get("business_form_candidates", "") if row.get("business_form_candidates") else "",
                        "纯数字期限: " + row.get("pure_digit_periods", "") if row.get("pure_digit_periods") else "",
                        "Y前缀期限: " + row.get("y_prefix_periods", "") if row.get("y_prefix_periods") else "",
                    ]
                    if item
                ),
                "来源记录数量": row.get("record_count", ""),
                "确认版权开始日期": "",
                "确认版权到期日期": "",
                "冲突原因": "",
                "是否解除阻断": "",
                "备注": "",
            }
        )
    return sorted(rows, key=lambda item: item["任务ID"])


def build_non_blocking_observations(single_id_volume: list[dict[str, Any]], bill_conflicts: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for row in single_id_volume:
        rows.append(
            {
                "观察ID": row.get("任务ID", ""),
                "观察类型": "单ID分册文字标记",
                "标准作品ID": row.get("标准作品ID候选", ""),
                "原始财务ID": row.get("原始财务ID候选", ""),
                "记录数": row.get("记录数", ""),
                "月份范围": row.get("月份范围", ""),
                "金额": row.get("累计实销", ""),
                "金额_完整精度": row.get("累计实销_完整精度", ""),
                "名称/说明": row.get("历史作品名称及记录数", ""),
                "默认处理": "默认不阻断收入事实入库",
                "是否标记为异常": "否",
                "是否升级为阻断": "否",
                "运营备注": "",
            }
        )
    for row in bill_conflicts["offset_candidates"]:
        display, exact = amount_from_text(row.get("amount_total"))
        rows.append(
            {
                "观察ID": row.get("confirmation_group_id", ""),
                "观察类型": "正负冲抵候选",
                "标准作品ID": row.get("standard_id", ""),
                "原始财务ID": row.get("raw_work_id_candidates", ""),
                "记录数": row.get("record_count", ""),
                "月份范围": row.get("month_range", ""),
                "金额": display,
                "金额_完整精度": exact,
                "名称/说明": row.get("name_details", ""),
                "默认处理": "默认不阻断收入事实入库",
                "是否标记为异常": "否",
                "是否升级为阻断": "否",
                "运营备注": "",
            }
        )
    for row in bill_conflicts["first_sale_empty"]:
        display, exact = amount_from_text(row.get("amount_total"))
        rows.append(
            {
                "观察ID": row.get("confirmation_group_id", ""),
                "观察类型": "从未出现正数实销",
                "标准作品ID": row.get("standard_id", ""),
                "原始财务ID": row.get("raw_work_id_candidates", ""),
                "记录数": row.get("record_count", ""),
                "月份范围": row.get("month_range", ""),
                "金额": display,
                "金额_完整精度": exact,
                "名称/说明": row.get("name_details", ""),
                "默认处理": "默认不阻断收入事实入库；首次实销月份留空",
                "是否标记为异常": "否",
                "是否升级为阻断": "否",
                "运营备注": "",
            }
        )
    return rows


def main() -> None:
    OPS_ROOT.mkdir(parents=True, exist_ok=True)
    source_snapshots_before = {
        "bill": [item.__dict__ for item in amd.snapshot_sources(amd.workbook_inputs(amd.BILL_INPUT_ROOT), "B")],
        "master": [item.__dict__ for item in amd.snapshot_sources(amd.workbook_inputs(amd.MASTER_INPUT_ROOT), "M")],
    }

    bill_rows, _bill_structure = amd.read_bills()
    master_rows, _structure = amd.read_master()
    bill_conflicts = amd.group_bill_conflicts(bill_rows)
    master_analysis = amd.analyze_master_relations(master_rows, bill_rows, bill_conflicts)

    formal_blockers = build_formal_blockers(bill_conflicts)
    multi_id_candidates, single_id_volume = build_multi_id_candidates(bill_conflicts["volume_candidates"])
    basic_info = build_basic_info(bill_conflicts, master_analysis)
    ledger_conflicts = build_ledger_conflicts(master_analysis)
    copyright_conflicts = build_copyright_conflicts(master_analysis)
    non_blocking = build_non_blocking_observations(single_id_volume, bill_conflicts)

    source_snapshots_after = {
        "bill": [item.__dict__ for item in amd.snapshot_sources(amd.workbook_inputs(amd.BILL_INPUT_ROOT), "B")],
        "master": [item.__dict__ for item in amd.snapshot_sources(amd.workbook_inputs(amd.MASTER_INPUT_ROOT), "M")],
    }

    sheet_order = [
        {"name": "确认进度总览", "kind": "overview", "rows": []},
        {"name": "正式导入阻断确认", "kind": "formal_blockers", "rows": formal_blockers},
        {"name": "多ID归并候选", "kind": "multi_id", "rows": multi_id_candidates},
        {"name": "标准作品基础信息补全", "kind": "basic_info", "rows": basic_info},
        {"name": "台账真实冲突", "kind": "ledger_conflicts", "rows": ledger_conflicts},
        {"name": "版权期限反例", "kind": "copyright_conflicts", "rows": copyright_conflicts},
        {"name": "非阻断观察", "kind": "non_blocking", "rows": non_blocking},
    ]
    metrics = {
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "formal_import_blocker_count": len(formal_blockers),
        "multi_id_candidate_count": len(multi_id_candidates),
        "single_id_volume_observation_count": len(single_id_volume),
        "basic_info_work_count": len(basic_info),
        "m2_basic_info_missing_count": sum(1 for row in basic_info if amd.norm_text(row.get("需要补充的字段"))),
        "ledger_conflict_count": len(ledger_conflicts),
        "copyright_conflict_count": len(copyright_conflicts),
        "non_blocking_observation_count": len(non_blocking),
        "source_unchanged": source_snapshots_before == source_snapshots_after,
    }
    payload = {
        "generated_at": metrics["generated_at"],
        "metrics": metrics,
        "sheets": sheet_order,
        "source_snapshots": source_snapshots_after,
        "rules": {
            "copyright_start_source": "数字版权台账“签订日期”",
            "copyright_end_source": "数字版权台账“到期时间”",
            "no_inference": "不得根据作品上线时间、首次实销月份或文件创建时间推算版权开始日期。",
        },
    }
    OUTPUT_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
