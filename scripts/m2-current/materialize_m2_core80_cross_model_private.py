#!/usr/bin/env python3
"""Materialize the ignored M2-CMX01 cash authority and static metadata.

The adapter deliberately accepts only the preregistered three-row split
anomaly, all in 2026-05 and therefore after the 2020-2025 evaluation target
window.  Sales-share workbook membership remains the cash-category authority;
no row is machine-classified and no private identity is written outside the
configured ignored capability directory.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from collections import Counter
from decimal import Decimal
from pathlib import Path
from typing import Any

import pandas as pd


ROOT = Path(__file__).resolve().parents[2]
CURRENT = ROOT / "scripts" / "m2-current"
REAL_DATA = ROOT / "scripts" / "m2-real-data"
TOOLS = ROOT / "tools" / "m2-calibration"
for candidate in (CURRENT, REAL_DATA, TOOLS):
    if str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

import calibrate_cleaned_bills as calibration  # noqa: E402
import human_ledger_partition as partition  # noqa: E402
import materialize_canonical_channel_cases as canonical  # noqa: E402
import run_m2_post_foundation_readiness as readiness  # noqa: E402


CONFIG_PATH = ROOT / "config" / "m2-core80-cross-model-evaluation.v0.1.json"
CHANNEL_CONFIG_PATH = ROOT / "config" / "m2-current-canonical-channel.v0.1.json"
DEFAULT_OUTPUT = (
    ROOT
    / "data"
    / "private-output"
    / "m2-core80-cross-model-real-business-evaluation-v0.1"
)
FACTS_NAME = "M2-CMX01-sales-share-authority-private-v0.1.ndjson"
METADATA_NAME = "M2-CMX01-static-metadata-private-v0.1.json"
RECEIPT_NAME = "M2-CMX01-materialization-receipt-private-v0.1.json"


class CmxMaterializationError(RuntimeError):
    """The frozen CMX01 source/materialization contract was violated."""


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def stable_hash(value: Any) -> str:
    payload = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def decimal_text(value: Any) -> str:
    number = Decimal(str(value))
    if not number.is_finite():
        raise CmxMaterializationError("cmx01_nonfinite_cash")
    return format(number, "f")


def atomic_write_text(path: Path, text: str) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(text, encoding="utf-8", newline="\n")
    os.replace(temporary, path)


def source_hash_contract(config: dict[str, Any]) -> dict[str, str]:
    snapshot = config["sourceSnapshot"]
    return {
        "totalLedger": snapshot["totalLedgerSha256"],
        "salesShare": snapshot["salesShareLedgerSha256"],
        "buyout": snapshot["buyoutLedgerSha256"],
        "channelMaster": snapshot["channelMasterSha256"],
        "mappingSet": snapshot["workMappingSetSha256"],
    }


def mapping_set_digest(path: Path) -> str:
    names = [
        "M1-formal-mapping-version-candidate-v0.1-detail-payload.json",
        "M1-formal-mapping-version-candidate-v0.1.json",
        "M1-mapping-candidate-input-v0.1.json",
    ]
    digest = hashlib.sha256()
    for name in names:
        item = path / name
        if not item.is_file():
            raise CmxMaterializationError(
                f"cmx01_mapping_artifact_missing:{name}"
            )
        digest.update(name.encode("utf-8"))
        digest.update(b"\0")
        digest.update(item.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def filtered(frame: pd.DataFrame, end_month: str) -> pd.DataFrame:
    months = frame["年月"].map(partition._month_text)  # noqa: SLF001
    return frame.loc[months <= end_month].copy()


def exact_partition_audit(
    sources: partition.HumanLedgerPartitionSources,
    base_columns: list[str],
) -> tuple[dict[str, pd.DataFrame], dict[str, Any]]:
    total = partition._load_raw(sources.total_ledger, base_columns)  # noqa: SLF001
    sales = partition._load_raw(sources.sales_share, base_columns)  # noqa: SLF001
    buyout = partition._load_raw(sources.buyout, base_columns)  # noqa: SLF001
    if partition._type_values(sales) != {"分成"}:  # noqa: SLF001
        raise CmxMaterializationError("cmx01_sales_share_type_impure")
    if partition._type_values(buyout) != {"买断"}:  # noqa: SLF001
        raise CmxMaterializationError("cmx01_buyout_type_impure")
    total_rows = partition._row_counter(total, base_columns)  # noqa: SLF001
    sales_rows = partition._row_counter(sales, base_columns)  # noqa: SLF001
    buyout_rows = partition._row_counter(buyout, base_columns)  # noqa: SLF001
    if sales_rows.keys() & buyout_rows.keys():
        raise CmxMaterializationError("cmx01_partition_overlap")
    combined = sales_rows + buyout_rows
    missing = total_rows - combined
    extra = combined - total_rows
    missing_count = sum(missing.values())
    extra_count = sum(extra.values())
    month_position = base_columns.index("年月")
    extra_months = sorted({row[month_position] for row in extra.elements()})
    if missing_count != 0 or extra_count != 3 or extra_months != ["2026-05"]:
        raise CmxMaterializationError(
            "cmx01_partition_anomaly_differs:"
            f"missing={missing_count}:extra={extra_count}:months={extra_months}"
        )
    scoped_total = filtered(total, "2025-12")
    scoped_sales = filtered(sales, "2025-12")
    scoped_buyout = filtered(buyout, "2025-12")
    scoped_total_rows = partition._row_counter(  # noqa: SLF001
        scoped_total, base_columns
    )
    scoped_combined = (
        partition._row_counter(scoped_sales, base_columns)  # noqa: SLF001
        + partition._row_counter(scoped_buyout, base_columns)  # noqa: SLF001
    )
    if scoped_total_rows != scoped_combined:
        raise CmxMaterializationError("cmx01_target_window_partition_mismatch")
    return {
        "total": total,
        "sales": sales,
        "buyout": buyout,
    }, {
        "fullRowCounts": {
            "totalLedger": len(total),
            "salesShare": len(sales),
            "buyout": len(buyout),
        },
        "fullPartitionMissingRows": missing_count,
        "fullPartitionExtraRows": extra_count,
        "fullPartitionExtraMonths": extra_months,
        "targetWindowEnd": "2025-12",
        "targetWindowPartitionExact": True,
        "machineClassificationUsed": False,
    }


def load_canonical_names(
    config: dict[str, Any],
) -> dict[str, str]:
    contract = config["channelMaster"]
    master_path = (
        ROOT
        / "data"
        / "private-output"
        / "outputs"
        / "channel-governance-20260726"
        / "M2-渠道统一与类型人工补全表-v0.2.xlsx"
    )
    frame = pd.read_excel(
        master_path,
        sheet_name=contract["sheetName"],
        header=contract["headerRow"] - 1,
    )
    canonical_column = next(
        column for column in frame.columns
        if str(column).startswith(
            contract["columnPrefixes"]["canonicalChannelName"]
        )
    )
    output: dict[str, str] = {}
    for value in frame[canonical_column]:
        name = canonical.clean(value)
        if not name:
            continue
        uid = canonical.canonical_uid(name, contract["uidNamespace"])
        previous = output.get(uid)
        if previous is not None and previous != name:
            raise CmxMaterializationError("cmx01_canonical_name_collision")
        output[uid] = name
    return output


def apply_foundation_scope_with_explicit_exclusion(
    bill: pd.DataFrame,
    final_ids: set[str],
    raw_mapping: dict[str, str],
    standard_mapping: dict[str, str],
) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Apply the canonical mapping and explicitly exclude non-foundation works.

    The canonical helper is intentionally fail-closed because it may not drop
    rows.  CMX01 has a separately frozen service-population contract, so rows
    outside the 3,053-work foundation are reported as scope exclusions instead
    of being silently coerced into an eligible work.
    """

    result = bill.copy()
    original_ids = result["standardWorkId"].map(readiness.canonical_work_id)
    mapped_ids = []
    mapped_by_raw = 0
    mapped_by_scope = 0
    for raw_work_id, original_id in zip(result["rawWorkId"], original_ids):
        raw_target = raw_mapping.get(readiness.clean(raw_work_id).upper())
        scope_target = None
        if original_id not in final_ids:
            candidate = standard_mapping.get(original_id)
            if candidate in final_ids:
                scope_target = candidate
        target = raw_target or scope_target or original_id
        mapped_ids.append(target)
        mapped_by_raw += int(bool(raw_target and raw_target != original_id))
        mapped_by_scope += int(bool(scope_target and scope_target != original_id))
    result["standardWorkId"] = mapped_ids
    valid = result["validForCalibration"].astype(bool)
    outside = result.loc[valid & ~result["standardWorkId"].isin(final_ids)].copy()
    inside = result.loc[~valid | result["standardWorkId"].isin(final_ids)].copy()
    valid_inside = inside[inside["validForCalibration"].astype(bool)]
    outside_months = sorted(
        str(value) for value in outside["billMonth"].dropna().unique()
    )
    return inside, {
        "beforeWorkCount": int(result.loc[valid, "standardWorkId"].nunique()),
        "afterWorkCount": int(valid_inside["standardWorkId"].nunique()),
        "foundationWorkCount": len(final_ids),
        "billRowsBefore": len(result),
        "billRowsAfter": len(inside),
        "excludedOutsideFoundationRowCount": len(outside),
        "excludedOutsideFoundationWorkCount": int(
            outside["standardWorkId"].nunique()
        ),
        "excludedOutsideFoundationMonths": outside_months,
        "mappedRowsByRawHistoricalMapping": mapped_by_raw,
        "mappedRowsByFoundationScopeReconciliation": mapped_by_scope,
        "historicalRawMappingsConfigured": len(raw_mapping),
        "historicalStandardMappingsConfigured": len(standard_mapping),
        "scopeWithinFoundation": set(
            valid_inside["standardWorkId"].astype(str)
        ).issubset(final_ids),
        "exclusionPolicy":
            "EXPLICIT_OUTSIDE_FIXED_3053_WORK_FOUNDATION_NOT_M2_ELIGIBLE",
    }


def run(output_dir: Path) -> dict[str, Any]:
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    channel_config = json.loads(CHANNEL_CONFIG_PATH.read_text(encoding="utf-8"))
    expected = source_hash_contract(config)
    sources = partition.discover_partition_sources(calibration.DATA_DIR)
    channel_master_path = (
        ROOT
        / "data/private-output/outputs/channel-governance-20260726"
        / "M2-渠道统一与类型人工补全表-v0.2.xlsx"
    )
    mapping_dir = ROOT / "data/m1-master-data-private/mapping-candidate"
    actual_hashes = {
        "totalLedger": sha256_file(sources.total_ledger),
        "salesShare": sha256_file(sources.sales_share),
        "buyout": sha256_file(sources.buyout),
        "channelMaster": sha256_file(channel_master_path),
        "mappingSet": mapping_set_digest(mapping_dir),
    }
    if actual_hashes != expected:
        raise CmxMaterializationError(
            f"cmx01_source_hash_mismatch:{actual_hashes}"
        )
    raw, partition_audit = exact_partition_audit(
        sources, calibration.REAL_BILL_COLUMNS
    )
    _bill_path, _master_path, mapping, _selection = calibration.discover_sources()
    mapped_sales = calibration.read_bill_frame(raw["sales"], mapping)
    mapped_sales["cashCategory"] = "sales_share"
    mapped_sales["cashCategoryAuthority"] = (
        "user_reviewed_workbook_membership"
    )
    foundation, foundation_summary = readiness.load_foundation()
    final_ids = set(foundation)
    formal_input = readiness.load_verified_formal_input(final_ids)
    raw_mapping, standard_mapping = readiness.load_historical_mappings()
    scoped_sales, scope_audit = apply_foundation_scope_with_explicit_exclusion(
        mapped_sales,
        final_ids,
        raw_mapping,
        standard_mapping,
    )
    valid = scoped_sales[scoped_sales["validForCalibration"].astype(bool)].copy()
    if len(valid) != len(scoped_sales):
        raise CmxMaterializationError("cmx01_invalid_mapped_sales_rows")
    master, master_evidence = canonical.load_channel_master(channel_config)
    canonical_names = load_canonical_names(channel_config)
    amount_scale_power = 0
    fact_rows = []
    work_titles: dict[str, str] = {}
    channels: dict[str, dict[str, str]] = {}
    row_ids: set[str] = set()
    unmapped_after_target_count = 0
    unmapped_after_target_months: set[str] = set()
    for ordinal, (_, row) in enumerate(valid.iterrows(), start=1):
        month = canonical.clean(row.get("billMonth"))
        work_id = canonical.clean(row.get("standardWorkId"))
        raw_pair = (
            canonical.clean(row.get("渠道ID")),
            canonical.clean(row.get("文学库渠道名称")),
        )
        channel = master.get(raw_pair)
        if channel is None:
            if month <= "2025-12":
                raise CmxMaterializationError(
                    "cmx01_target_window_channel_mapping_missing"
                )
            unmapped_after_target_count += 1
            unmapped_after_target_months.add(month)
            channel = {
                "channelUid": "unresolved_" + stable_hash(raw_pair)[:20],
                "channelRole": "unresolved_after_target",
                "revenueMode": "unresolved_after_target",
                "contentForm": "unknown",
            }
        amount = decimal_text(row.get("amount"))
        fraction = amount.partition(".")[2].rstrip("0")
        amount_scale_power = max(amount_scale_power, len(fraction))
        # The verified formal-input title is the canonical display authority.
        # Historical ledger spellings may vary and are never allowed to split
        # or rename a work identity during evaluation.
        title = canonical.clean(formal_input.get(work_id, {}).get("书名"))
        if not title:
            raise CmxMaterializationError("cmx01_work_title_missing")
        previous_title = work_titles.get(work_id)
        if previous_title is not None and previous_title != title:
            raise CmxMaterializationError("cmx01_work_title_unstable")
        work_titles[work_id] = title
        channel_uid = channel["channelUid"]
        channel_name = canonical_names.get(channel_uid, raw_pair[1])
        channels[channel_uid] = {
            "channelUid": channel_uid,
            "channelName": channel_name,
            "channelRole": channel["channelRole"],
            "revenueMode": channel["revenueMode"],
            "contentForm": channel["contentForm"],
            "identityStatus": (
                "UNRESOLVED_AFTER_TARGET"
                if channel_uid.startswith("unresolved_")
                else "CANONICAL_CONFIRMED"
            ),
        }
        record_id = stable_hash([
            actual_hashes["salesShare"],
            ordinal,
            month,
            work_id,
            channel_uid,
            amount,
        ])
        if record_id in row_ids:
            raise CmxMaterializationError("cmx01_authority_record_duplicate")
        row_ids.add(record_id)
        fact_rows.append({
            "authorityRecordId": record_id,
            "authorityRowOrdinal": ordinal,
            "billMonth": f"{month}-01",
            "recordedAt": f"{month}-01",
            "standardWorkId": work_id,
            "channelMemberId": channel_uid,
            "actualSalesAmount": amount,
            "cashCategory": "sales_share",
            "cashCategoryAuthority": "user_reviewed_workbook_membership",
            "currencyScope": "authority_ledger_native_monetary_unit",
        })
    work_metadata = []
    for work_id in sorted(work_titles):
        source = formal_input.get(work_id, {})
        work_metadata.append({
            "standardWorkId": work_id,
            "workTitle": work_titles[work_id],
            "rightsStartMonth": canonical.clean(
                source.get("版权开始")
            )[:7] or None,
            "level1Category": canonical.clean(source.get("一级分类"))
            or "UNKNOWN",
            "level2Category": canonical.clean(source.get("二级分类"))
            or "UNKNOWN",
            "level3Category": canonical.clean(source.get("三级分类"))
            or "UNKNOWN",
        })
    output_dir.mkdir(parents=True, exist_ok=True)
    facts_path = output_dir / FACTS_NAME
    facts_text = "".join(
        json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n"
        for row in fact_rows
    )
    atomic_write_text(facts_path, facts_text)
    metadata = {
        "schema": "m2.cmx01.static_metadata.private.v0.1",
        "tracked": False,
        "works": work_metadata,
        "channels": [channels[key] for key in sorted(channels)],
        "foundationWorkCount": len(final_ids),
        "foundationSummaryDigest": stable_hash(foundation_summary),
    }
    metadata_path = output_dir / METADATA_NAME
    atomic_write_text(
        metadata_path,
        json.dumps(metadata, ensure_ascii=False, sort_keys=True, indent=2)
        + "\n",
    )
    receipt = {
        "schema": "m2.cmx01.materialization_receipt.private.v0.1",
        "status": "READY",
        "tracked": False,
        "sourceDigests": actual_hashes,
        "partitionAudit": partition_audit,
        "scopeAudit": scope_audit,
        "channelMasterEvidence": master_evidence,
        "channelMappingAudit": {
            "targetWindowUnmappedRowCount": 0,
            "afterTargetUnmappedRowCount": unmapped_after_target_count,
            "afterTargetUnmappedMonths": sorted(unmapped_after_target_months),
            "policy":
                "PRESERVE_WITH_STABLE_RAW_SCOPE_ONLY_AFTER_2025_12",
        },
        "cashAuthority": "user_reviewed_sales_share_workbook_membership",
        "actualDefinitionId":
            "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01",
        "rowCount": len(fact_rows),
        "workCount": len(work_metadata),
        "channelCount": len(channels),
        "amountScalePower": amount_scale_power,
        "firstBillMonth": min(row["billMonth"][:7] for row in fact_rows),
        "lastBillMonth": max(row["billMonth"][:7] for row in fact_rows),
        "negativeRowCount": sum(
            Decimal(row["actualSalesAmount"]) < 0 for row in fact_rows
        ),
        "authorityFactsSha256": sha256_file(facts_path),
        "metadataSha256": sha256_file(metadata_path),
        "privateIdentityPublished": False,
        "finalHoldoutOpened": False,
        "productionChanged": False,
    }
    receipt_path = output_dir / RECEIPT_NAME
    atomic_write_text(
        receipt_path,
        json.dumps(receipt, ensure_ascii=False, sort_keys=True, indent=2)
        + "\n",
    )
    return {
        "status": "READY",
        "rowCount": len(fact_rows),
        "workCount": len(work_metadata),
        "channelCount": len(channels),
        "amountScalePower": amount_scale_power,
        "receipt": str(receipt_path),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    result = run(args.output.resolve())
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
