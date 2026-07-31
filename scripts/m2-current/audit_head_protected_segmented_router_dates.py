#!/usr/bin/env python3
"""Build the date-only opened-origin ledger for HPSR01 readiness.

This adapter does not fit, predict, score, aggregate cash, or inspect a new
later-origin outcome.  From already materialized historical caches it retains
only origin/horizon/date keys and whether an existing actual field is null.
From the source ledger it reads only the bill-month column.
"""

from __future__ import annotations

import json
import os
import re
import tempfile
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from openpyxl import load_workbook


ROOT = Path(__file__).resolve().parents[2]
READINESS_CONFIG = (
    ROOT / "config" / "m2-current-human-anchored-later-origin.v0.1.json"
)
FEATURE_CACHE = (
    ROOT
    / "data"
    / "private-output"
    / "m2-core-legacy-horizon-amount"
    / "M2-core-legacy-horizon-amount-feature-rows-private-v0.1.ndjson"
)
FROZEN_LG01_CACHE = (
    ROOT
    / "data"
    / "private-output"
    / "m2-core-legacy-horizon-amount"
    / "M2-core-legacy-horizon-amount-frozen-lg01-rows-private-v0.1.ndjson"
)
PRIVATE_LEDGER = (
    ROOT
    / "data"
    / "private-output"
    / "m2-head-protected-segmented-router"
    / "M2-head-protected-segmented-router-opened-origin-ledger-private-v0.1.json"
)
MONTH_PATTERN = re.compile(r"^\d{4}-(?:0[1-9]|1[0-2])$")


class DateAuditError(RuntimeError):
    """The date-only audit cannot prove its frozen public assertions."""


def _repository_relative(path: Path) -> str:
    return path.resolve().relative_to(ROOT).as_posix()


def _month_index(value: str) -> int:
    if not MONTH_PATTERN.fullmatch(value):
        raise DateAuditError(f"invalid month key: {value!r}")
    year, month = (int(part) for part in value.split("-"))
    return year * 12 + month - 1


def _add_months(value: str, offset: int) -> str:
    target = _month_index(value) + offset
    year, month_index = divmod(target, 12)
    return f"{year:04d}-{month_index + 1:02d}"


def _normalize_month(value: Any) -> str | None:
    if value is None:
        return None
    if hasattr(value, "strftime"):
        result = value.strftime("%Y-%m")
    else:
        text = str(value).strip()
        match = re.match(r"^(\d{4})[-/.年](\d{1,2})", text)
        if not match:
            return None
        result = f"{int(match.group(1)):04d}-{int(match.group(2)):02d}"
    return result if MONTH_PATTERN.fullmatch(result) else None


def _scan_opened_cache(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise DateAuditError(f"rebuildable opened-origin cache missing: {path.name}")
    origins: dict[str, dict[str, Any]] = defaultdict(
        lambda: {
            "rowCount": 0,
            "nonNullExistingActualCount": 0,
            "horizonsMonths": set(),
            "labelDateKeys": set(),
        }
    )
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            try:
                row = json.loads(line)
            except json.JSONDecodeError as exc:
                raise DateAuditError(
                    f"invalid NDJSON at {path.name}:{line_number}"
                ) from exc
            origin = str(row.get("origin", ""))
            if not MONTH_PATTERN.fullmatch(origin):
                raise DateAuditError(
                    f"missing origin at {path.name}:{line_number}"
                )
            entry = origins[origin]
            entry["rowCount"] += 1
            entry["nonNullExistingActualCount"] += row.get("actual") is not None
            horizon = row.get("horizonMonths")
            if horizon is not None:
                entry["horizonsMonths"].add(int(horizon))
            for key in ("labelAvailableAsOf", "maximumLabelAvailableAsOf"):
                value = row.get(key)
                if value is not None and MONTH_PATTERN.fullmatch(str(value)):
                    entry["labelDateKeys"].add(str(value))
    rows = []
    for origin, entry in sorted(origins.items()):
        rows.append(
            {
                "origin": origin,
                "rowCount": entry["rowCount"],
                "nonNullExistingActualCount": entry[
                    "nonNullExistingActualCount"
                ],
                "horizonsMonths": sorted(entry["horizonsMonths"]),
                "labelDateKeys": sorted(entry["labelDateKeys"]),
            }
        )
    if not rows:
        raise DateAuditError(f"opened-origin cache empty: {path.name}")
    return {
        "role": (
            "frozen-development-feature-rows"
            if path == FEATURE_CACHE
            else "frozen-lg01-same-case-rows"
        ),
        "artifactClass": "PRIVATE_DERIVED_CACHE",
        "repositoryRelativePath": _repository_relative(path),
        "scannedFields": [
            "origin",
            "horizonMonths",
            "labelAvailableAsOf_or_maximumLabelAvailableAsOf",
            "actual_nullness_only",
        ],
        "originCount": len(rows),
        "minimumOrigin": rows[0]["origin"],
        "maximumOrigin": rows[-1]["origin"],
        "origins": rows,
    }


def _scan_bill_months(path: Path) -> dict[str, Any]:
    if not path.is_file():
        raise DateAuditError(f"source authority missing: {path.name}")
    workbook = load_workbook(path, read_only=True, data_only=True)
    try:
        worksheet = workbook[workbook.sheetnames[0]]
        headers = [cell.value for cell in next(worksheet.iter_rows(min_row=1, max_row=1))]
        month_index = next(
            (
                index
                for index, header in enumerate(headers)
                if str(header).strip() in {"年月", "billMonth", "账期"}
            ),
            None,
        )
        if month_index is None:
            raise DateAuditError("sales-share ledger bill-month column missing")
        counts: Counter[str] = Counter()
        for row in worksheet.iter_rows(
            min_row=2,
            min_col=month_index + 1,
            max_col=month_index + 1,
            values_only=True,
        ):
            month = _normalize_month(row[0])
            if month is not None:
                counts[month] += 1
    finally:
        workbook.close()
    if not counts:
        raise DateAuditError("sales-share ledger has no bill-month values")
    return {
        "role": "sales-share-ledger-authority",
        "artifactClass": "PRIVATE_SOURCE_AUTHORITY",
        "scannedFields": ["billMonth"],
        "minimumBillMonth": min(counts),
        "maximumBillMonth": max(counts),
        "monthlyFactCounts": [
            {"billMonth": month, "factCount": counts[month]}
            for month in sorted(counts)
        ],
    }


def _eligible_origins(
    max_previously_opened_origin: str,
    latest_complete_month: str,
    horizon_months: int,
) -> list[dict[str, Any]]:
    first = _add_months(max_previously_opened_origin, 1)
    output = []
    origin = first
    while _month_index(origin) <= _month_index(latest_complete_month):
        future_months = [
            _add_months(origin, offset)
            for offset in range(1, horizon_months + 1)
        ]
        if _month_index(future_months[-1]) <= _month_index(
            latest_complete_month
        ):
            output.append(
                {
                    "origin": origin,
                    "futureBillMonths": future_months,
                    "complete": True,
                }
            )
        origin = _add_months(origin, 1)
    return output


def _write_immutable(path: Path, value: dict[str, Any]) -> None:
    serialized = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    if path.exists():
        existing = path.read_text(encoding="utf-8").replace("\r\n", "\n")
        if existing != serialized:
            raise DateAuditError(
                "immutable opened-origin ledger already exists with different bytes"
            )
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.", suffix=".tmp", dir=path.parent
    )
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(serialized)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_name, path)
    finally:
        temporary = Path(temporary_name)
        if temporary.exists():
            temporary.unlink()


def run() -> dict[str, Any]:
    readiness = json.loads(READINESS_CONFIG.read_text(encoding="utf-8"))
    sales_share_path = ROOT / readiness["privateInputs"]["salesShareLedger"]
    cache_profiles = [
        _scan_opened_cache(FEATURE_CACHE),
        _scan_opened_cache(FROZEN_LG01_CACHE),
    ]
    bill_profile = _scan_bill_months(sales_share_path)
    latest_complete_month = readiness["qualificationAudit"][
        "latestCompleteMonth"
    ]
    incomplete_months = readiness["qualificationAudit"]["incompleteMonths"]
    if bill_profile["maximumBillMonth"] != "2026-05":
        raise DateAuditError("current maximum bill month differs from frozen K0A")
    month_count = {
        row["billMonth"]: row["factCount"]
        for row in bill_profile["monthlyFactCounts"]
    }
    if month_count.get("2026-05") != 3:
        raise DateAuditError("2026-05 incomplete fact count differs from frozen K0A")
    max_previously_opened_origin = max(
        profile["maximumOrigin"] for profile in cache_profiles
    )
    eligible = _eligible_origins(
        max_previously_opened_origin,
        latest_complete_month,
        3,
    )
    ledger = {
        "schema": (
            "m2.current.head_protected_segmented_router."
            "opened_origin_ledger.private.v0.1"
        ),
        "tracked": False,
        "immutableSnapshot": True,
        "auditMode": {
            "newFutureActualAmountsRead": False,
            "newModelMetricsRead": False,
            "modelFitRun": False,
            "modelEvaluationRun": False,
            "historicalCacheActualFieldUse": "NULLNESS_ONLY",
            "sourceLedgerFieldUse": "BILL_MONTH_ONLY",
        },
        "historicalCacheProfiles": cache_profiles,
        "maxPreviouslyOpenedOrigin": max_previously_opened_origin,
        "openedFutureActualThrough": "2026-05",
        "billMonthAvailability": {
            **bill_profile,
            "latestCompleteMonth": latest_complete_month,
            "incompleteMonths": incomplete_months,
        },
        "eligibleLaterOrigins": eligible,
        "decision": (
            "M2_HEAD_PROTECTED_SEGMENTED_ROUTER_WAITING_FOR_NEW_BILLS"
            if not eligible
            else "QUALIFIED_LATER_ORIGIN_EXISTS"
        ),
    }
    _write_immutable(PRIVATE_LEDGER, ledger)
    return {
        "schema": "m2.current.hpsr_date_audit_stdout.v0.1",
        "maxPreviouslyOpenedOrigin": max_previously_opened_origin,
        "openedFutureActualThrough": ledger["openedFutureActualThrough"],
        "latestCompleteMonth": latest_complete_month,
        "incompleteMonths": incomplete_months,
        "eligibleLaterOriginCount": len(eligible),
        "decision": ledger["decision"],
        "newFutureActualAmountsRead": False,
        "newModelMetricsRead": False,
    }


def main() -> None:
    try:
        print(json.dumps(run(), ensure_ascii=False, sort_keys=True))
    except Exception as exc:  # noqa: BLE001
        print(f"[M2_HPSR_DATE_AUDIT_ERROR] {exc}", file=os.sys.stderr)
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
