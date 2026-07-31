#!/usr/bin/env python3
"""Build the metadata-only opened-origin semantics ledger for HPSR01.

This adapter does not fit, predict, score, aggregate cash, or inspect a new
later-origin outcome. From already materialized historical caches it retains
only origin/horizon/date keys and whether an existing actual field is null.
Historical receipts and manifests prove whether an earlier run had already
opened actual values; this audit does not open those values again. From the
source ledger it reads only the bill-month column.
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
    / "M2-head-protected-segmented-router-opened-origin-semantics-private-v0.2.json"
)
CHAM_RECEIPT = (
    ROOT
    / "data"
    / "private-output"
    / "m2-core-legacy-horizon-amount"
    / "M2-core-legacy-horizon-amount-attempt-receipt-private-v0.1.json"
)
CHAM_MANIFEST = (
    ROOT
    / "data"
    / "private-output"
    / "m2-core-legacy-horizon-amount"
    / "M2-core-legacy-horizon-amount-manifest-private-v0.1.json"
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


def _read_historical_outcome_provenance() -> dict[str, Any]:
    if not CHAM_RECEIPT.is_file() or not CHAM_MANIFEST.is_file():
        raise DateAuditError(
            "historical outcome provenance missing for actual-opened boundary"
        )
    receipt = json.loads(CHAM_RECEIPT.read_text(encoding="utf-8"))
    manifest = json.loads(CHAM_MANIFEST.read_text(encoding="utf-8"))
    if (
        receipt.get("status") != "COMPLETE_RESULT_FROZEN"
        or receipt.get("completeMetricsProduced") is not True
        or receipt.get("validCompleteInterpretableResultProduced") is not True
        or manifest.get("status") != "COMPLETE_RESULT_FROZEN"
        or manifest.get("resultFrozen") is not True
        or manifest.get("outputBindings", {})
        .get("featureRows", {})
        .get("rowCount", 0)
        <= 0
    ):
        raise DateAuditError(
            "historical outcome provenance cannot prove actual-opened boundary"
        )
    recovery = receipt.get("recovery", {})
    return {
        "completeOutcomePreviouslyProduced": True,
        "featureRowsBoundByFrozenManifest": True,
        "failedAttemptTouchedMetadataOnly": (
            recovery.get("partialOutcomeInspected") is False
            and recovery.get("priorAttemptId") is not None
        ),
        "failedAttemptOpenedOutcome": False,
        "evidenceRefs": [
            "PRIVATE_RUN_PROVENANCE:core-horizon-amount-complete-receipt",
            "PRIVATE_DERIVED_CACHE:core-horizon-amount-frozen-manifest",
            "PUBLIC_REPORT:M2-core-legacy-horizon-amount-development-v0.1",
        ],
    }


def _write_atomic(path: Path, value: dict[str, Any]) -> None:
    serialized = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    if (
        path.exists()
        and path.read_text(encoding="utf-8").replace("\r\n", "\n")
        == serialized
    ):
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
    complete_authoritative_bill_month_through = readiness[
        "qualificationAudit"
    ][
        "latestCompleteMonth"
    ]
    incomplete_month_keys = readiness["qualificationAudit"][
        "incompleteMonths"
    ]
    month_count = {
        row["billMonth"]: row["factCount"]
        for row in bill_profile["monthlyFactCounts"]
    }
    if (
        complete_authoritative_bill_month_through
        not in month_count
        or any(month not in month_count for month in incomplete_month_keys)
    ):
        raise DateAuditError(
            "bill-month availability differs from completeness authority"
        )
    provenance = _read_historical_outcome_provenance()
    max_availability_inspected_origin = max(
        profile["maximumOrigin"] for profile in cache_profiles
    )
    feature_profile = next(
        profile
        for profile in cache_profiles
        if profile["role"] == "frozen-development-feature-rows"
    )
    opened_actual_origins = [
        row
        for row in feature_profile["origins"]
        if row["nonNullExistingActualCount"] > 0
    ]
    if not opened_actual_origins:
        raise DateAuditError("historical actual-opened origins are empty")
    max_actual_value_opened_origin = max(
        row["origin"] for row in opened_actual_origins
    )
    opened_actual_label_dates = [
        value
        for row in opened_actual_origins
        for value in row["labelDateKeys"]
    ]
    if not opened_actual_label_dates:
        raise DateAuditError("historical actual-opened label boundary missing")
    actual_value_opened_through = max(opened_actual_label_dates)
    availability_inspected_through = bill_profile["maximumBillMonth"]
    earliest_independent_origin = _add_months(
        max_actual_value_opened_origin,
        1,
    )
    earliest_future_months = [
        _add_months(earliest_independent_origin, offset)
        for offset in range(1, 4)
    ]
    prospective_final_holdout_origin = _add_months(
        earliest_independent_origin,
        3,
    )
    prospective_final_holdout_months = [
        _add_months(prospective_final_holdout_origin, offset)
        for offset in range(1, 4)
    ]
    earliest_independent_ready = (
        _month_index(earliest_future_months[-1])
        <= _month_index(complete_authoritative_bill_month_through)
    )
    incomplete_months = [
        {
            "billMonth": month,
            "factCount": month_count[month],
        }
        for month in incomplete_month_keys
    ]
    ledger = {
        "schema": (
            "m2.current.head_protected_segmented_router."
            "opened_origin_semantics.private.v0.2"
        ),
        "tracked": False,
        "artifactClass": "PRIVATE_DERIVED_CACHE",
        "rebuildable": True,
        "auditMode": {
            "newFutureActualAmountsRead": False,
            "newModelMetricsRead": False,
            "modelFitRun": False,
            "modelEvaluationRun": False,
            "historicalCacheActualFieldUse": "NULLNESS_ONLY",
            "sourceLedgerFieldUse": "BILL_MONTH_ONLY",
        },
        "historicalCacheProfiles": cache_profiles,
        "openedSemantics": {
            "maxAvailabilityInspectedOrigin":
                max_availability_inspected_origin,
            "maxActualValueOpenedOrigin": max_actual_value_opened_origin,
            "availabilityInspectedThrough":
                availability_inspected_through,
            "actualValueOpenedThrough": actual_value_opened_through,
            "completeAuthoritativeBillMonthThrough":
                complete_authoritative_bill_month_through,
            "failedAttemptTouchedMetadataOnly":
                provenance["failedAttemptTouchedMetadataOnly"],
            "failedAttemptOpenedOutcome":
                provenance["failedAttemptOpenedOutcome"],
            "unknownOrAmbiguous": False,
            "evidenceRefs": provenance["evidenceRefs"],
        },
        "billMonthAvailability": {
            **bill_profile,
            "completeAuthoritativeBillMonthThrough":
                complete_authoritative_bill_month_through,
            "incompleteMonths": incomplete_months,
        },
        "prospectiveReservation": {
            "firstIndependentLaterOrigin": earliest_independent_origin,
            "firstIndependentFutureBillMonths": earliest_future_months,
            "firstIndependentRequiredCompleteThrough":
                earliest_future_months[-1],
            "firstIndependentLaterOriginReady":
                earliest_independent_ready,
            "prospectiveFinalHoldoutOrigin":
                prospective_final_holdout_origin,
            "prospectiveFinalHoldoutFutureBillMonths":
                prospective_final_holdout_months,
            "prospectiveFinalHoldoutOpened": False,
            "prospectiveFinalHoldoutOutcomeRead": False,
        },
        "semanticRevision": {
            "priorEarliestPotentialLaterOrigin": "2026-05",
            "correctedEarliestIndependentLaterOrigin":
                earliest_independent_origin,
            "changedEarliestLaterOrigin": (
                earliest_independent_origin != "2026-05"
            ),
            "reason": (
                "AVAILABILITY_METADATA_NO_LONGER_COUNTS_AS_ACTUAL_VALUE_OPENED"
            ),
            "historicalRawReceiptModified": False,
        },
        "decision": (
            "INDEPENDENT_LATER_ORIGIN_DATE_READY_AWAIT_SEPARATE_AUTHORIZATION"
            if earliest_independent_ready
            else "AWAITING_COMPLETE_AUTHORITATIVE_BILL_MONTHS"
        ),
    }
    _write_atomic(PRIVATE_LEDGER, ledger)
    return {
        "schema": "m2.current.hpsr_date_audit_stdout.v0.2",
        "maxAvailabilityInspectedOrigin":
            max_availability_inspected_origin,
        "maxActualValueOpenedOrigin": max_actual_value_opened_origin,
        "availabilityInspectedThrough": availability_inspected_through,
        "actualValueOpenedThrough": actual_value_opened_through,
        "completeAuthoritativeBillMonthThrough":
            complete_authoritative_bill_month_through,
        "incompleteMonths": incomplete_months,
        "earliestIndependentLaterOrigin": earliest_independent_origin,
        "earliestIndependentRequiredCompleteThrough":
            earliest_future_months[-1],
        "prospectiveFinalHoldoutOrigin":
            prospective_final_holdout_origin,
        "earliestIndependentLaterOriginReady":
            earliest_independent_ready,
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
