"""Diagnose the three private ledgers without importing, editing or classifying cash."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / "tools/m2-calibration"))
from calibrate_cleaned_bills import REAL_BILL_COLUMNS  # noqa: E402
from human_ledger_partition import analyze_partition, discover_partition_sources, load_partition_config, PARTITION_VALIDATION_VERSION  # noqa: E402

CONTRACT = "config/m2-current-human-ledger-partition.v0.1.json"
OUTPUT_DIRECTORY = "data/private-output/workspace-reconciliation"
CHECK_LABELS = {
    "schema_equal": "三表字段一致", "split_type_pure": "人工拆分类型纯度", "no_split_overlap": "分成与买断不重叠",
    "row_multiset_conserved": "逐行及重复次数守恒", "amount_conserved": "实销金额总额守恒",
    "monthly_row_count_conserved": "逐月行数守恒", "monthly_amount_conserved": "逐月实销金额守恒",
}


def digest(path):
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def metadata(root, path):
    if not path.is_file() or not path.resolve().is_relative_to(root):
        raise ValueError("SOURCE_MISSING_OR_OUTSIDE_ROOT")
    stat = path.stat()
    return {"path": path.relative_to(root).as_posix(), "sha256": digest(path), "size": stat.st_size, "mtimeNs": str(stat.st_mtime_ns)}


def code_identity():
    result = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True, shell=False, check=False)
    files = ["scripts/workspace/reconcile_local_ledgers.py", "tools/m2-calibration/human_ledger_partition.py"]
    return {"ledgerValidationVersion": PARTITION_VALIDATION_VERSION, "gitHead": result.stdout.strip() if result.returncode == 0 else None,
            "files": {path: digest(ROOT / path) for path in files}}


def atomic_write(target, contents):
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", newline="\n", dir=target.parent, prefix=".reconcile-", suffix=".tmp", delete=False) as handle:
            temporary = Path(handle.name)
            handle.write(contents)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, target)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def build_report(source_root):
    root = Path(source_root).resolve(strict=True)
    contract_path = root / CONTRACT
    contract_before = metadata(root, contract_path)
    code_before = code_identity()
    contract = load_partition_config(contract_path)
    sources = discover_partition_sources(root / "data", contract)
    paths = dict(zip(["totalLedger", "salesShare", "buyout"], sources.all()))
    before = {role: metadata(root, path) for role, path in paths.items()}
    frames, analysis = analyze_partition(sources, REAL_BILL_COLUMNS)
    counters = analysis["rowCounters"]
    differences = [("missing_from_split", analysis["missingRows"]), ("extra_in_split", analysis["extraRows"])]
    signatures = set().union(*(set(counter) for _, counter in differences))
    keys = {row[:-1] for row in signatures}
    occurrences = defaultdict(lambda: defaultdict(list))
    groups = defaultdict(lambda: defaultdict(list))
    for role, rows in analysis["sourceRows"].items():
        for source in rows:
            row = source["signature"]
            if row in signatures:
                occurrences[row][role].append(source["rowNumber"])
            if row[:-1] in keys:
                groups[row[:-1]][role].append({"rowNumber": source["rowNumber"], "amount": format(row[-1], "f")})
    details = []
    for direction, counter in differences:
        for row, count in sorted(counter.items(), key=lambda item: tuple(map(str, item[0]))):
            details.append({"direction": direction, "count": count,
                            "values": {column: format(value, "f") if isinstance(value, Decimal) else value for column, value in zip(REAL_BILL_COLUMNS, row)},
                            "multiplicities": {role: counter_[row] for role, counter_ in counters.items()},
                            "allMatchingSourceRows": dict(occurrences[row]),
                            "businessDecision": None, "yourAnswer": ""})
    duplicate_groups = {role: {"signatureGroupCount": sum(count > 1 for count in counter.values()),
                               "additionalOccurrenceCount": sum(max(0, count - 1) for count in counter.values())} for role, counter in counters.items()}
    after = {role: metadata(root, path) for role, path in paths.items()}
    if before != after or contract_before != metadata(root, contract_path) or code_before != code_identity():
        raise ValueError("SOURCE_OR_IMPLEMENTATION_CHANGED_DURING_READ")
    report = {
        "schema": "workspace.ledger-reconciliation.v1", "generatedAt": datetime.now(timezone.utc).isoformat(),
        "status": "PARTITION_CONSERVED" if all(analysis["checks"].values()) else "RECONCILIATION_REQUIRED",
        "readOnly": True, "formalImportExecuted": False, "modelExecuted": False, "businessDecisionsApplied": False,
        "implementation": code_before, "contract": contract_before, "sources": before, "sourceHashesUnchanged": True,
        "checks": analysis["checks"], "schemas": analysis["schemas"],
        "rowCounts": {role: len(frame) for role, frame in frames.items()},
        "amounts": {role: format(value, "f") for role, value in analysis["totals"].items()},
        "missingRowCount": sum(analysis["missingRows"].values()), "extraRowCount": sum(analysis["extraRows"].values()),
        "differences": analysis["differences"], "differenceRows": details, "duplicateSignatures": duplicate_groups,
        "sameSixFieldGroups": [{"values": dict(zip(REAL_BILL_COLUMNS[:-1], key)), "sourceRows": dict(value)} for key, value in groups.items()],
        "limitationsZh": ["同签名重复次数用于守恒，不自动裁定哪一条原始记录应删除。", "前六字段相同而金额不同只作为待核对组，不自动合并或覆盖。", "文件修改时间不证明具体记录的编辑时间；现有文件不能证明编辑人或编辑原因。", "金额沿用原始账单单位，未推定币种；守恒通过也不等于正式导入、重复问题验收或模型资格。"],
    }
    return report


def render_text(report):
    lines = ["总账、分成、买断账单核对", "", f"核对状态：{report['status']}", f"生成时间：{report['generatedAt']}",
             "差额方向统一为：分成加买断减总账。金额沿用账单单位，币种未提供。", ""]
    for role in ["totalLedger", "salesShare", "buyout"]:
        source = report["sources"][role]
        lines.append(f"{role}：{source['path']}；{report['rowCounts'][role]} 行；实销合计 {report['amounts'][role]}；SHA256 {source['sha256']}")
    lines += ["", "七项校验："]
    lines += [f"{CHECK_LABELS[key]}：{'通过' if passed else '未通过'}" for key, passed in report["checks"].items()]
    lines += ["", f"总账有、拆分无：{report['missingRowCount']} 行；拆分有、总账无：{report['extraRowCount']} 行。",
              f"实销金额差额：{report['differences']['amountSplitMinusTotal']}", "逐月非零差异："]
    for month, values in report["differences"]["byMonth"].items():
        if any(values.values()):
            lines.append(f"{month}：行数差 {values['rowCountSplitMinusTotal']}；金额差 {values['amountSplitMinusTotal']}")
    lines += ["", "逐条差异及业务确认（暂不应用任何决定）："]
    for index, row in enumerate(report["differenceRows"], start=1):
        lines += [f"{index}. {row['direction']}；差异次数 {row['count']}",
                  "；".join(f"{key}={value}" for key, value in row["values"].items()),
                  f"全部同签名行位置：{json.dumps(row['allMatchingSourceRows'], ensure_ascii=False)}",
                  "待确认选项：总账漏记 / 拆分误录或误保留 / 其他原因 / 不清楚", "你的填写：", "依据及原始凭证：", "确认人和确认时间：", ""]
    lines += ["前六字段相同的记录（金额不同不等于重复）："]
    for group in report["sameSixFieldGroups"]:
        lines.append("；".join(f"{key}={value}" for key, value in group["values"].items()))
        for role, rows in group["sourceRows"].items():
            lines.append(f"  {role}：" + "；".join(f"第{row['rowNumber']}行，金额{row['amount']}" for row in rows))
    lines += ["", *report["limitationsZh"], "", "原始文件未修改；未连接数据库，未正式导入，未执行模型；差异不能用调整金额凑平。"]
    return "\n".join(lines) + "\n"


def reconcile(source_root):
    root = Path(source_root).resolve(strict=True)
    directory = root / OUTPUT_DIRECTORY
    if directory.resolve() != directory:
        raise ValueError("OUTPUT_OUTSIDE_PRIVATE_DIRECTORY")
    directory.mkdir(parents=True, exist_ok=True)
    for name in ["current.json", "current.txt"]:
        if (directory / name).is_symlink():
            raise ValueError("OUTPUT_OUTSIDE_PRIVATE_DIRECTORY")
    report = build_report(root)
    atomic_write(directory / "current.json", json.dumps(report, ensure_ascii=False, indent=2, default=lambda value: format(value, "f") if isinstance(value, Decimal) else str(value)) + "\n")
    atomic_write(directory / "current.txt", render_text(report))
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, default=ROOT)
    args = parser.parse_args()
    try:
        report = reconcile(args.source_root)
        print(json.dumps({"status": report["status"], "privateReportWritten": True, "sourceHashesUnchanged": True, "formalImportExecuted": False, "modelExecuted": False}))
        return 0 if report["status"] == "PARTITION_CONSERVED" else 2
    except Exception:
        print(json.dumps({"status": "FAILED", "code": "SOURCE_VALIDATION_OR_READ_FAILED", "sourceFilesModified": False, "formalImportExecuted": False, "modelExecuted": False}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
