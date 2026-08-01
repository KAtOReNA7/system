#!/usr/bin/env python3
"""Build the metadata-only opened-origin semantics ledger for HPSR01/02.

This adapter does not fit, predict, score, aggregate cash, or inspect a new
later-origin amount. It verifies authoritative workbook schema, non-amount
row keys, split membership, work/channel mapping, bill-month coverage, and
the absence of an explicit partial-import marker. The amount column header is
required, but no amount cell is read. Missing derived caches and historical
receipts are reported by class and never masquerade as missing source
authority.
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

import export_m2_reversal_authority as reversal


ROOT = Path(__file__).resolve().parents[2]
READINESS_CONFIG = (
    ROOT / "config" / "m2-current-human-anchored-later-origin.v0.1.json"
)
HPSR_CONFIG = (
    ROOT / "config" / "m2-current-head-protected-segmented-router.v0.1.json"
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


def _scan_opened_cache_if_present(path: Path) -> dict[str, Any]:
    if path.is_file():
        return _scan_opened_cache(path)
    return {
        "role": (
            "frozen-development-feature-rows"
            if path == FEATURE_CACHE
            else "frozen-lg01-same-case-rows"
        ),
        "artifactClass": "PRIVATE_DERIVED_CACHE",
        "repositoryRelativePath": _repository_relative(path),
        "status": "CACHE_MISS_REBUILDABLE",
        "scannedFields": [],
        "originCount": None,
        "minimumOrigin": None,
        "maximumOrigin": None,
        "origins": [],
    }


def _metadata_row_key(values: tuple[Any, ...]) -> tuple[str, ...]:
    return tuple(reversal.clean_text(value) for value in values)


def _scan_ledger_metadata(
    path: Path,
    *,
    expected_types: set[str],
    mapping: dict[str, str] | None = None,
    channel_master: dict[tuple[str, str], dict] | None = None,
) -> tuple[dict[str, Any], Counter[tuple[str, ...]]]:
    if not path.is_file():
        raise DateAuditError(f"source authority missing: {path.name}")
    workbook = load_workbook(path, read_only=True, data_only=True)
    try:
        worksheet = workbook[workbook.sheetnames[0]]
        headers = [
            cell.value
            for cell in next(worksheet.iter_rows(min_row=1, max_row=1))
        ]
        required_headers = [
            *reversal.REAL_BILL_COLUMNS,
            reversal.TYPE_COLUMN,
        ]
        if headers != required_headers:
            raise DateAuditError(f"ledger schema mismatch: {path.name}")
        if len(required_headers) != 8 or required_headers[6] != "实销金额":
            raise DateAuditError("standard ledger amount column position changed")
        partial_markers = re.compile(
            r"partial|incomplete|部分导入|未完整",
            re.IGNORECASE,
        )
        if any(
            partial_markers.search(str(value))
            for value in [*workbook.sheetnames, *headers]
        ):
            raise DateAuditError(
                f"explicit partial-import marker present: {path.name}"
            )
        counts: Counter[str] = Counter()
        metadata_keys: Counter[tuple[str, ...]] = Counter()
        missing_month_count = 0
        missing_work_mapping_count = 0
        missing_channel_mapping_count = 0
        missing_channel_pairs: set[tuple[str, str]] = set()
        missing_channel_months: Counter[str] = Counter()
        for row in worksheet.iter_rows(
            min_row=2,
            min_col=1,
            max_col=6,
            values_only=True,
        ):
            if all(value is None for value in row):
                continue
            key = _metadata_row_key(row)
            metadata_keys[key] += 1
            month = _normalize_month(key[0])
            if month is None:
                missing_month_count += 1
            else:
                counts[month] += 1
            if mapping is not None:
                raw_work_id = reversal.normalize_raw_work_id(key[4])
                standard_work_id = mapping.get(raw_work_id)
                if not standard_work_id:
                    standard_work_id = reversal.derive_standard_work_id(
                        raw_work_id
                    )
                if not standard_work_id:
                    missing_work_mapping_count += 1
            if channel_master is not None:
                raw_pair = (
                    reversal.canonical.clean(key[1]),
                    reversal.canonical.clean(key[2]),
                )
                channel_mapping = channel_master.get(raw_pair)
                if not channel_mapping or not channel_mapping.get(
                    "channelUid"
                ):
                    missing_channel_mapping_count += 1
                    missing_channel_pairs.add(raw_pair)
                    if month is not None:
                        missing_channel_months[month] += 1
        type_counts: Counter[str] = Counter()
        for row in worksheet.iter_rows(
            min_row=2,
            min_col=8,
            max_col=8,
            values_only=True,
        ):
            value = reversal.clean_text(row[0])
            type_counts[value] += 1
    finally:
        workbook.close()
    if not counts:
        raise DateAuditError(f"ledger has no bill-month values: {path.name}")
    if set(type_counts) != expected_types:
        raise DateAuditError(f"ledger split type invalid: {path.name}")
    if sum(type_counts.values()) != sum(metadata_keys.values()):
        raise DateAuditError(f"ledger split type row mismatch: {path.name}")
    metadata_collision_count = sum(
        count - 1 for count in metadata_keys.values() if count > 1
    )
    return {
        "role": "reviewed-ledger-authority",
        "artifactClass": "PRIVATE_SOURCE_AUTHORITY",
        "repositoryRelativePath": _repository_relative(path),
        "scannedFields": [
            "billMonth",
            "rawChannelId",
            "rawChannelName",
            "authorizationCategory",
            "rawWorkId",
            "workName",
            "splitType",
        ],
        "amountColumnHeaderValidated": True,
        "amountCellReadCount": 0,
        "schemaValid": True,
        "splitTypeValues": sorted(type_counts),
        "rowCount": sum(metadata_keys.values()),
        "distinctMetadataKeyCount": len(metadata_keys),
        "metadataCollisionCount": metadata_collision_count,
        "missingMonthCount": missing_month_count,
        "missingWorkMappingCount": missing_work_mapping_count,
        "missingCanonicalChannelMappingCount":
            missing_channel_mapping_count,
        "missingCanonicalRawPairCount": len(missing_channel_pairs),
        "missingCanonicalChannelMonths": [
            {
                "billMonth": month,
                "rowCount": missing_channel_months[month],
            }
            for month in sorted(missing_channel_months)
        ],
        "minimumBillMonth": min(counts),
        "maximumBillMonth": max(counts),
        "monthlyFactCounts": [
            {"billMonth": month, "factCount": counts[month]}
            for month in sorted(counts)
        ],
        "explicitPartialImportMarkerPresent": False,
    }, metadata_keys


def _read_historical_outcome_provenance() -> dict[str, Any]:
    if not CHAM_RECEIPT.is_file() or not CHAM_MANIFEST.is_file():
        return {
            "status": "OPTIONAL_PROVENANCE_MISSING",
            "completeOutcomePreviouslyProduced": None,
            "featureRowsBoundByFrozenManifest": None,
            "failedAttemptTouchedMetadataOnly": None,
            "failedAttemptOpenedOutcome": None,
            "evidenceRefs": [
                "PUBLIC_FROZEN_AUTHORITY:"
                "M2-head-protected-segmented-router-opened-origin-"
                "semantics-v0.2"
            ],
        }
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
        "status": "PRIVATE_RUN_PROVENANCE_AVAILABLE",
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
    hpsr = json.loads(HPSR_CONFIG.read_text(encoding="utf-8"))
    capability, _ = reversal.load_contracts()
    sources, mapping_directory, channel_master_path = (
        reversal.authority_paths(capability)
    )
    expected_sales_share_path = (
        ROOT / readiness["privateInputs"]["salesShareLedger"]
    ).resolve()
    if sources.sales_share.resolve() != expected_sales_share_path:
        raise DateAuditError("sales-share authority path contract mismatch")
    mapping, _ = reversal.load_mapping(mapping_directory)
    channel_contract = json.loads(
        (
            ROOT / "config" / "m2-current-canonical-channel.v0.1.json"
        ).read_text(encoding="utf-8")
    )
    channel_master, channel_evidence = (
        reversal.canonical.load_channel_master(
            channel_contract,
            channel_master_path,
        )
    )
    total_profile, total_keys = _scan_ledger_metadata(
        sources.total_ledger,
        expected_types={"", "买断"},
    )
    bill_profile, sales_share_keys = _scan_ledger_metadata(
        sources.sales_share,
        expected_types={"分成"},
        mapping=mapping,
        channel_master=channel_master,
    )
    buyout_profile, buyout_keys = _scan_ledger_metadata(
        sources.buyout,
        expected_types={"买断"},
    )
    split_multiset_conserved = (
        total_keys == sales_share_keys + buyout_keys
    )
    combined_split_keys = sales_share_keys + buyout_keys
    metadata_split_missing_row_count = sum(
        (total_keys - combined_split_keys).values()
    )
    metadata_split_extra_row_count = sum(
        (combined_split_keys - total_keys).values()
    )
    cache_profiles = [
        _scan_opened_cache_if_present(FEATURE_CACHE),
        _scan_opened_cache_if_present(FROZEN_LG01_CACHE),
    ]
    month_count = {
        row["billMonth"]: row["factCount"]
        for row in bill_profile["monthlyFactCounts"]
    }
    required_months = hpsr["laterOriginQualification"][
        "earliestIndependentFutureBillMonths"
    ]
    missing_required_months = [
        month
        for month in required_months
        if month_count.get(month, 0) <= 0
    ]
    standard_metadata_checks_pass = all([
        total_profile["schemaValid"],
        bill_profile["schemaValid"],
        buyout_profile["schemaValid"],
        split_multiset_conserved,
        bill_profile["missingWorkMappingCount"] == 0,
        bill_profile["missingCanonicalChannelMappingCount"] == 0,
        not bill_profile["explicitPartialImportMarkerPresent"],
    ])
    bill_month_window_complete = all([
        not missing_required_months,
        not bill_profile["explicitPartialImportMarkerPresent"],
    ])
    complete_authoritative_bill_month_through = (
        required_months[-1]
        if bill_month_window_complete
        else hpsr["openedOriginSemantics"][
            "completeAuthoritativeBillMonthThrough"
        ]
    )
    source_authority_complete = standard_metadata_checks_pass
    source_authority_status = (
        "SOURCE_AUTHORITY_AVAILABLE"
        if source_authority_complete
        else "SOURCE_AUTHORITY_INCOMPLETE_STANDARD_IMPORT"
    )
    provenance = _read_historical_outcome_provenance()
    max_availability_inspected_origin = hpsr["openedOriginSemantics"][
        "maxAvailabilityInspectedOrigin"
    ]
    max_actual_value_opened_origin = hpsr["openedOriginSemantics"][
        "maxActualValueOpenedOrigin"
    ]
    actual_value_opened_through = hpsr["openedOriginSemantics"][
        "actualValueOpenedThrough"
    ]
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
    date_window_ready = (
        _month_index(earliest_future_months[-1])
        <= _month_index(complete_authoritative_bill_month_through)
    )
    earliest_independent_ready = (
        date_window_ready and source_authority_complete
    )
    incomplete_months = [
        {
            "billMonth": month,
            "factCount": month_count.get(month, 0),
        }
        for month in missing_required_months
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
            "historicalCacheActualFieldUse": (
                "NULLNESS_ONLY_WHEN_CACHE_PRESENT_OTHERWISE_PUBLIC_"
                "FROZEN_BOUNDARY"
            ),
            "sourceLedgerFieldUse": "NON_AMOUNT_METADATA_ONLY",
            "sourceLedgerAmountCellReadCount": 0,
        },
        "historicalCacheProfiles": cache_profiles,
        "sourceAuthorityReadiness": {
            "sourceAuthorityStatus": source_authority_status,
            "totalLedger": total_profile,
            "salesShareLedger": bill_profile,
            "buyoutLedger": buyout_profile,
            "splitRowMultisetConserved": split_multiset_conserved,
            "metadataSplitMissingRowCount":
                metadata_split_missing_row_count,
            "metadataSplitExtraRowCount":
                metadata_split_extra_row_count,
            "workMappingValid":
                bill_profile["missingWorkMappingCount"] == 0,
            "canonicalChannelMappingValid":
                bill_profile[
                    "missingCanonicalChannelMappingCount"
                ] == 0,
            "canonicalChannelCount":
                channel_evidence["canonicalChannelCount"],
            "standardMetadataChecksPass": standard_metadata_checks_pass,
            "billMonthWindowComplete": bill_month_window_complete,
            "dateWindowReady": date_window_ready,
            "completenessAuthorityMode": (
                "REQUIRED_MONTHS_PRESENT_STANDARD_METADATA_CHECKS_PASS_"
                "NO_PARTIAL_IMPORT_MARKER"
            ),
            "stalePriorIncompleteMonthSnapshotUsed": False,
        },
        "openedSemantics": {
            "maxAvailabilityInspectedOrigin":
                max_availability_inspected_origin,
            "maxActualValueOpenedOrigin": max_actual_value_opened_origin,
            "availabilityInspectedThrough":
                availability_inspected_through,
            "actualValueOpenedThrough": actual_value_opened_through,
            "completeAuthoritativeBillMonthThrough":
                complete_authoritative_bill_month_through,
            "failedAttemptTouchedMetadataOnly": provenance.get(
                "failedAttemptTouchedMetadataOnly"
            ),
            "failedAttemptOpenedOutcome": provenance.get(
                "failedAttemptOpenedOutcome"
            ),
            "unknownOrAmbiguous": False,
            "evidenceRefs": provenance["evidenceRefs"],
            "historicalReceiptStatus": provenance["status"],
        },
        "billMonthAvailability": {
            **bill_profile,
            "completeAuthoritativeBillMonthThrough":
                complete_authoritative_bill_month_through,
            "incompleteMonths": incomplete_months,
            "requiredMonths": required_months,
            "requiredMonthsPresent": not missing_required_months,
            "standardMetadataChecksPass": standard_metadata_checks_pass,
            "amountCellReadCount": 0,
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
            "M2_HPSR02_BLOCKED_MISSING_SOURCE_AUTHORITY"
            if not source_authority_complete
            else (
                "INDEPENDENT_LATER_ORIGIN_DATE_READY_AWAIT_SEPARATE_"
                "AUTHORIZATION"
                if earliest_independent_ready
                else "M2_HPSR02_WAITING_FOR_COMPLETE_AUTHORITATIVE_BILLS"
            )
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
        "sourceAuthorityStatus": source_authority_status,
        "derivedCacheStatus": (
            "CACHE_MISS_REBUILDABLE"
            if any(
                profile.get("status") == "CACHE_MISS_REBUILDABLE"
                for profile in cache_profiles
            )
            else "CACHE_READY"
        ),
        "historicalReceiptStatus": provenance["status"],
        "standardMetadataChecksPass": standard_metadata_checks_pass,
        "billMonthWindowComplete": bill_month_window_complete,
        "dateWindowReady": date_window_ready,
        "requiredBillMonths": required_months,
        "amountCellReadCount": 0,
    }


def main() -> None:
    try:
        print(json.dumps(run(), ensure_ascii=False, sort_keys=True))
    except Exception as exc:  # noqa: BLE001
        print(f"[M2_HPSR_DATE_AUDIT_ERROR] {exc}", file=os.sys.stderr)
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
