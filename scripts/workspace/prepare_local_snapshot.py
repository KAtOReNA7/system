"""Build a private read-only projection; never run a model or change source files."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import sys
import tempfile
import zipfile
from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.dont_write_bytecode = True
for relative in ["tools/m2-calibration", "tools/m1-master-data-analysis", "scripts/m2-real-data", "scripts/m2-current"]:
    sys.path.insert(0, str(ROOT / relative))

from human_ledger_partition import discover_partition_sources, validate_partition  # noqa: E402
from calibrate_cleaned_bills import REAL_BILL_COLUMNS, parse_month  # noqa: E402
from work_id_rules import parse_raw_work_id  # noqa: E402
from run_cleaned_ledger_minimal_backfill_v3 import read_shared_strings, read_sheet_rows, workbook_sheets, parse_date_value  # noqa: E402
from materialize_canonical_channel_cases import load_channel_master, header_index  # noqa: E402

PARTITION = "config/m2-current-human-ledger-partition.v0.1.json"
CHANNEL = "config/m2-current-canonical-channel.v0.1.json"
PRD = "docs/prd/10-data-foundation/bill-import.md"
MAPPING = "data/m1-master-data-private/mapping-candidate/M1-formal-mapping-version-candidate-v0.1-detail-payload.json"
CHANNEL_BOOK = "data/private-output/outputs/channel-governance-20260726/M2-渠道统一与类型人工补全表-v0.2.xlsx"
MASTER_BOOKS = ["数字版权台账.xlsx", "原创全库2.xlsx", "授权汇总台账.xlsx", "授权关系仪表板.xlsx"]
OUTPUT = "data/private-output/workspace/current.json"


class SnapshotError(RuntimeError):
    """Messages are stable public codes, never source values."""


def clean(value):
    if value is None or isinstance(value, float) and math.isnan(value):
        return ""
    text = str(value).strip()
    return text[:-2] if re.fullmatch(r"[0-9]+\.0", text) else text


def digest(path):
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def source_metadata(root, relative):
    path = root / relative
    if not path.is_file() or not path.resolve().is_relative_to(root):
        raise SnapshotError("SOURCE_MISSING_OR_OUTSIDE_ROOT")
    stat = path.stat()
    return {"path": relative, "sha256": digest(path), "size": stat.st_size, "mtimeNs": str(stat.st_mtime_ns)}


def directory_metadata(root, relative):
    path = root / relative
    if not path.is_dir() or not path.resolve().is_relative_to(root):
        raise SnapshotError("SOURCE_DIRECTORY_MISSING_OR_OUTSIDE_ROOT")
    roles = {"data/master-data": "master-data-directory", "data/m1-master-data-private/mapping-candidate": "work-mapping-directory", "data/real-bills": "ledger-directory"}
    return {"path": relative, "role": roles.get(relative, "channel-master-directory"), "mtimeNs": str(path.stat().st_mtime_ns), "entries": sorted(entry.name for entry in path.iterdir())}


def month_shift(month, delta):
    year, number = map(int, month.split("-"))
    ordinal = year * 12 + number - 1 + delta
    return f"{ordinal // 12:04d}-{ordinal % 12 + 1:02d}"


def months_between(start, end):
    result = []
    while start <= end:
        result.append(start)
        start = month_shift(start, 1)
    return result


def issue(code, message, field, source="本地权威源"):
    return {"code": code, "messageZh": message, "severity": "warning", "field": field, "status": "needs_review", "sourceLabel": source}


def exact_date(value):
    text = clean(value)
    if not text:
        return None
    parsed = parse_date_value(text)
    # Do not turn an unspecified day, relative term or multi-date sentence into an exact date.
    numeric = bool(re.fullmatch(r"\d+(?:\.\d+)?", text))
    complete = bool(re.fullmatch(r"\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?(?: 00:00:00)?", text))
    if parsed["status"] != "parsed" or not (numeric or complete):
        return None
    try:
        return datetime.strptime(parsed["normalized"], "%Y-%m-%d").date().isoformat()
    except ValueError:
        return None


def read_master_fields(root):
    """Exact financial identity only; no name matching or product-line taxonomy guesses."""
    values = defaultdict(lambda: defaultdict(set))
    provenance = defaultdict(lambda: defaultdict(set))
    aliases = {
        "authorName": ["作者署名", "作者笔名", "作者名称", "作者"],
        "classificationLevel1": ["一级分类"], "classificationLevel2": ["二级分类"], "classificationLevel3": ["三级分类"],
        "workSource": ["出版or原创"],
        "rightsStartDate": ["签订日期", "授权时间", "授权开始日期"],
        "rightsEndDate": ["到期时间", "结束时间", "授权结束时间", "我方版权到期时间"]
    }
    for name in MASTER_BOOKS:
        relative = "data/master-data/" + name
        for sheet in read_master_sheets(root / relative):
            for row in sheet["rows"]:
                raw = clean(row.get("作品ID") or row.get("我方作品ID"))
                identity = parse_raw_work_id(raw)
                if not identity.valid:
                    continue
                for field, headers in aliases.items():
                    for header in headers:
                        value = clean(row.get(header))
                        if not value:
                            continue
                        if field.startswith("rights"):
                            value = exact_date(value)
                            if value is None:
                                values[identity.standard_id][field].add("__UNRESOLVED_DATE__")
                                continue
                        values[identity.standard_id][field].add(value)
                        provenance[identity.standard_id][field].add(relative + "#" + sheet["name"] + ":" + header)
    return values, provenance


def read_master_sheets(path):
    # Reuse the audited cell/row reader, adapting absolute OOXML relationship targets.
    with zipfile.ZipFile(path) as archive:
        shared = read_shared_strings(archive)
        for sheet in workbook_sheets(archive):
            target = sheet["target"]
            if target not in archive.namelist() and target.startswith("xl/xl/"):
                target = target[3:]
            rows = read_sheet_rows(archive, target, shared)
            headers = rows[0] if rows else []
            yield {"name": sheet["name"], "rows": [{header: row[index] if index < len(row) else "" for index, header in enumerate(headers) if header} for row in rows[1:]]}


def read_channels(root, config):
    import pandas as pd
    path = root / CHANNEL_BOOK
    rows, evidence = load_channel_master(config, path)
    specification = config["channelMaster"]
    frame = pd.read_excel(path, sheet_name=specification["sheetName"], header=specification["headerRow"] - 1, dtype=object)
    columns = {key: header_index(frame.columns, prefix) for key, prefix in specification["columnPrefixes"].items()}
    for _, row in frame.iterrows():
        key = (clean(row[columns["rawChannelId"]]), clean(row[columns["rawChannelName"]]))
        if key in rows:
            rows[key] = {**rows[key], "name": clean(row[columns["canonicalChannelName"]])}
    if evidence["confirmedRowCount"] != evidence["rawPairCount"]:
        raise SnapshotError("CHANNEL_AUTHORITY_NOT_CONFIRMED")
    return rows


def build_items(frames, masters, provenance, channel_master, pending_raw_ids, cutoff):
    start = month_shift(cutoff, -11)
    works = {}
    bill_max = None
    for cash_type, key in [("sales_share", "salesShare"), ("buyout", "buyout")]:
        for position, row in enumerate(frames[key].to_dict("records")):
            raw = clean(row["我方作品ID"])
            identity = parse_raw_work_id(raw)
            if not identity.valid:
                raise SnapshotError("INVALID_WORK_ID")
            work_id = identity.standard_id
            month = parse_month(row["年月"])
            if not month or not re.fullmatch(r"\d{4}-(?:0[1-9]|1[0-2])", month):
                raise SnapshotError("INVALID_BILL_MONTH")
            try:
                amount = Decimal(str(row["实销金额"]))
            except (InvalidOperation, ValueError):
                raise SnapshotError("INVALID_BILL_AMOUNT") from None
            if not amount.is_finite():
                raise SnapshotError("INVALID_BILL_AMOUNT")
            bill_max = max(bill_max or month, month)
            if work_id not in works:
                works[work_id] = {"raws": set(), "forms": set(), "names": set(), "months": set(), "sales": defaultdict(Decimal), "buyout": defaultdict(Decimal), "counts": defaultdict(int), "channels": {}, "issues": {}, "firstSalesMonth": None}
            work = works[work_id]
            work["raws"].add(raw)
            if identity.business_form:
                work["forms"].add(identity.business_form)
            if raw in pending_raw_ids:
                work["issues"]["PENDING_MAPPING_NOT_APPLIED"] = issue("PENDING_MAPPING_NOT_APPLIED", "存在未激活的候选映射，本档案未应用候选合并。", "standardWorkId", "作品映射候选")
            name = clean(row["作品名称"])
            if name:
                work["names"].add(name)
            work["months"].add(month)
            work["sales" if cash_type == "sales_share" else "buyout"][month] += amount
            work["counts"][cash_type] += 1
            if amount > 0 and (work["firstSalesMonth"] is None or month < work["firstSalesMonth"]):
                work["firstSalesMonth"] = month
            raw_pair = (clean(row["渠道ID"]), clean(row["文学库渠道名称"]))
            channel = channel_master.get(raw_pair)
            uid = channel["channelUid"] if channel else "raw_" + hashlib.sha256(json.dumps(raw_pair).encode()).hexdigest()[:20]
            if uid not in work["channels"]:
                work["channels"][uid] = {"uid": uid, "name": channel["name"] if channel else raw_pair[1] or None, "canonical": bool(channel), "amount": None}
            if channel is None:
                work["issues"]["CHANNEL_MAPPING_MISSING"] = issue("CHANNEL_MAPPING_MISSING", "部分原始渠道未命中已确认渠道主表，原始现金仍保留。", "channels", "人工渠道主表")
            if cash_type == "sales_share" and start <= month <= cutoff:
                previous = work["channels"][uid]["amount"]
                work["channels"][uid]["amount"] = (previous if previous is not None else Decimal(0)) + amount

    items = []
    for work_id, work in sorted(works.items()):
        sales, buyout = work["sales"], work["buyout"]
        pure_buyout = not work["counts"]["sales_share"]
        observed = [month for month in sales if start <= month <= cutoff]
        total = sum((sales[month] for month in observed), Decimal(0)) if observed else None
        issues = list(work["issues"].values())
        fields, sources = {}, {}
        for field in ["authorName", "classificationLevel1", "classificationLevel2", "classificationLevel3", "workSource", "rightsStartDate", "rightsEndDate"]:
            choices = masters.get(work_id, {}).get(field, set())
            fields[field] = next(iter(choices)) if len(choices) == 1 and "__UNRESOLVED_DATE__" not in choices else None
            sources[field] = sorted(provenance.get(work_id, {}).get(field, set()))
            if choices and fields[field] is None:
                issues.append(issue("MASTER_FIELD_CONFLICT", "精确ID命中的主数据值不唯一或日期不能精确解析，字段保持为空。", field, "作品主数据工作簿"))
        name = next(iter(work["names"])) if len(work["names"]) == 1 else None
        if name is None:
            issues.append(issue("BILL_NAME_NOT_UNIQUE", "账单作品名称缺失或不唯一，未使用候选名称替换。", "workName", "人工拆分账单"))
        missing_rights = fields["rightsStartDate"] is None or fields["rightsEndDate"] is None
        missing_core = name is None or fields["authorName"] is None or missing_rights
        missing_class = any(fields[field] is None for field in ["classificationLevel1", "classificationLevel2", "classificationLevel3"])
        if missing_core or missing_class:
            issues.append(issue("MASTER_DATA_INCOMPLETE", "作者、名称、版权起止或三级分类尚有缺项；未从产品线或相似标题推断。", "masterData"))
        if missing_rights:
            issues.append(issue("RIGHTS_DATES_INCOMPLETE", "版权起止日期缺失或未能唯一确认，保留为空。", "rightsDates", "作品主数据工作簿"))
        if work["firstSalesMonth"] is None:
            issues.append(issue("FIRST_POSITIVE_SALES_NOT_OBSERVED", "账单中尚未观察到严格正数实销，首次实销月份保持为空。", "firstSalesMonth", "人工拆分账单"))
        if not pure_buyout and len(observed) < 12:
            issues.append(issue("CASH_MONTHS_NOT_OBSERVED", "近12月存在无分成账单记录的月份，空值不代表零收入。", "monthlyCash", "人工拆分分成账单"))
        complete_months = len([month for month in work["months"] if month <= cutoff])
        cash_type = "pure_buyout" if pure_buyout else "mixed" if work["counts"]["buyout"] else "sales_share"
        history = [{"month": month, "amount": float(sales[month]) if month in sales else None, "complete": month <= cutoff, "observationStatus": "OUTSIDE_SCOPE" if pure_buyout else "OBSERVED_POSTING" if month in sales else "NOT_OBSERVED"} for month in months_between(min(min(work["months"]), start), max(max(work["months"]), cutoff))]
        channels = [{**channel, "amount": float(channel["amount"]) if channel["amount"] is not None else None} for channel in work["channels"].values()]
        review_reason = "部分渠道映射待确认" if "CHANNEL_MAPPING_MISSING" in work["issues"] else None
        items.append({
            "id": work_id, "standardWorkId": work_id, "workName": name, **fields,
            "category": fields["classificationLevel1"], "categoryPath": [fields[f"classificationLevel{i}"] for i in [1, 2, 3] if fields[f"classificationLevel{i}"] is not None],
            "completeBillMonths": complete_months, "channelCount": len(channels), "salesShareCash12Months": float(total) if total is not None else None,
            "cashCoverage": {"observedMonths": len(observed), "expectedMonths": 12}, "cashType": cash_type,
            "dataStatus": "needs_review" if issues else "complete",
            "businessStatus": "outside_scope" if pure_buyout else "needs_review" if review_reason else "insufficient_history" if complete_months < 3 else "not_evaluated",
            "completeness": {"missingBasicInfoRecord": work_id not in masters, "missingCoreFields": missing_core, "missingClassification": missing_class},
            "rawWorkIds": sorted(work["raws"]), "businessForms": sorted(work["forms"]), "firstSalesMonth": work["firstSalesMonth"], "productStatus": None,
            "syntheticOnly": False, "reviewReason": review_reason, "monthlyCash": history, "channels": channels,
            "buyoutAudit": {"cash12Months": float(sum((amount for month, amount in buyout.items() if start <= month <= cutoff), Decimal(0))) if any(start <= month <= cutoff for month in buyout) else None, "totalCash": float(sum(buyout.values(), Decimal(0))) if buyout else None, "recordCount": work["counts"]["buyout"], "notForecastCash": True},
            "predictions": [{"horizonMonths": months, "pointEstimate": None, "status": "ABSTAINED" if pure_buyout else "NOT_GENERATED", "reason": "buyout_outside_m2_forecast_scope" if pure_buyout else "No authorized work-level forecast is available"} for months in [3, 6, 12, 36]],
            "qualityIssues": issues, "fieldSources": {"workName": ["人工拆分账单中的唯一作品名称"], **sources},
            "notices": ["本地真实账单只读；候选作品映射未应用，不代表正式主数据治理完成。", "历史金额为原入账实销现金，负数保留为当月冲销；未执行模型重述或预测。", "完整月数仅统计实际有账单记录且不晚于人工确认截止月的月份；缺失月份不补零。", "晚于人工确认完整月的记录仍保留，不计入近12月已记录分成现金。"]
        })
    return items, bill_max


def prepare(source_root):
    root = Path(source_root).resolve(strict=True)
    partition = json.loads((root / PARTITION).read_text(encoding="utf-8"))
    contract = json.loads((root / CHANNEL).read_text(encoding="utf-8"))
    cutoff = contract["dataContract"]["latestCompleteMonth"]
    prd = (root / PRD).read_text(encoding="utf-8")
    if cutoff != "2026-04" or "最新已确认完整月份为 `2026-04`" not in prd or "2026-05" not in partition["incompleteMonths"]:
        raise SnapshotError("COMPLETE_MONTH_AUTHORITY_DIFFERS")
    ledger_sources = discover_partition_sources(root / "data", partition)
    relatives = [PARTITION, CHANNEL, PRD, MAPPING, CHANNEL_BOOK, *[p.relative_to(root).as_posix() for p in ledger_sources.all()], *["data/master-data/" + name for name in MASTER_BOOKS]]
    before = [source_metadata(root, relative) for relative in relatives]
    directory_paths = ["data/master-data", "data/m1-master-data-private/mapping-candidate", "data/real-bills", "data/private-output/outputs/channel-governance-20260726"]
    directory_before = [directory_metadata(root, relative) for relative in directory_paths]
    frames, evidence = validate_partition(ledger_sources, REAL_BILL_COLUMNS)
    if len(evidence["checksPassed"]) != 7:
        raise SnapshotError("LEDGER_PARTITION_NOT_VERIFIED")
    masters, provenance = read_master_fields(root)
    channels = read_channels(root, contract)
    candidates = json.loads((root / MAPPING).read_text(encoding="utf-8"))
    pending = {clean(row.get("raw_work_id")) for row in candidates.get("effective_mapping_snapshot", [])}
    items, bill_max = build_items(frames, masters, provenance, channels, pending, cutoff)
    after = [source_metadata(root, relative) for relative in relatives]
    directory_after = [directory_metadata(root, relative) for relative in directory_paths]
    if before != after or directory_before != directory_after:
        raise SnapshotError("SOURCE_CHANGED_DURING_READ")
    roles = {PARTITION: "ledger-partition-contract", CHANNEL: "canonical-channel-contract", PRD: "complete-month-authority", MAPPING: "pending-work-mapping", CHANNEL_BOOK: "user-reviewed-channel-master"}
    for path, role in zip(ledger_sources.all(), ["total-ledger-authority", "sales-share-ledger-authority", "buyout-ledger-authority"]):
        roles[path.relative_to(root).as_posix()] = role
    after = [{**source, "role": roles.get(source["path"], "work-master-authority")} for source in after]
    dataset = {
        "mode": "formal", "source": "local-reviewed-ledger-snapshot", "syntheticOnly": False, "notForFormalDecision": True,
        "cashAuthorityVerified": True, "cutoffMonth": cutoff, "cashPeriodStart": month_shift(cutoff, -11), "billMaxMonth": bill_max,
        "sourceLabelZh": "本地真实数据·只读", "cashDefinitionLabelZh": "近12月已记录分成现金；人工拆分分成账单实销金额，原入账口径，缺月不补零。金额单位沿用原账单，币种未提供。",
        "identityStatusLabelZh": "按财务ID规则归档，候选映射未应用", "governanceStatusLabelZh": "本地真实账单只读，不代表正式主数据治理完成",
        "completeBillMonthsDefinitionZh": "截至人工确认完整月，实际存在账单记录的不同月份数；不按跨度补月", "currency": None
    }
    authority_checks = {key: True for key in ["schemaEqual", "splitTypePure", "noSplitOverlap", "rowMultisetConserved", "amountConserved", "monthlyRowCountConserved", "monthlyAmountConserved"]}
    payload = {"generatedAt": datetime.now(timezone.utc).isoformat(), "dataset": dataset, "sources": after, "sourceDirectories": directory_after, "authorityChecks": authority_checks, "items": items}
    payload_json = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    envelope = {"schema": "workspace.local-readonly.v1", "payloadJson": payload_json, "sha256": hashlib.sha256(payload_json.encode("utf-8")).hexdigest()}
    target = root / OUTPUT
    if target.parent.resolve() != root / "data/private-output/workspace" or target.is_symlink():
        raise SnapshotError("OUTPUT_PATH_OUTSIDE_PRIVATE_DIRECTORY")
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", newline="\n", dir=target.parent, prefix=".workspace-", suffix=".tmp", delete=False) as handle:
            temporary = Path(handle.name)
            json.dump(envelope, handle, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, target)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()
    return {"status": "READY", "workCount": len(items), "sourceCount": len(after), "output": OUTPUT, "cashAuthorityVerified": True, "modelExecuted": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, default=ROOT)
    args = parser.parse_args()
    try:
        print(json.dumps(prepare(args.source_root), ensure_ascii=False))
    except Exception as error:
        # Exceptions from spreadsheet libraries may contain private cells or absolute paths.
        print(json.dumps({"status": "FAILED", "code": str(error) if isinstance(error, SnapshotError) else "SOURCE_VALIDATION_OR_READ_FAILED", "previousSnapshotPreserved": True}))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
