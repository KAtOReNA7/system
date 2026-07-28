"""Export deterministic private reversal-authority facts from the reviewed split."""

from __future__ import annotations

import hashlib
import json
import math
import os
import sys
import tempfile
from decimal import Decimal
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[2]
TOOLS = ROOT / "tools" / "m2-calibration"
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

from calibrate_cleaned_bills import (  # noqa: E402
    REAL_BILL_COLUMNS,
    derive_standard_work_id,
    normalize_raw_work_id,
    parse_month,
)
from human_ledger_partition import (  # noqa: E402
    HumanLedgerPartitionSources,
    TYPE_COLUMN,
    validate_partition,
)

CURRENT = ROOT / "scripts" / "m2-current"
if str(CURRENT) not in sys.path:
    sys.path.insert(0, str(CURRENT))

import materialize_canonical_channel_cases as canonical  # noqa: E402


CAPABILITY_ID = "m2-evaluation-v2-2-reversal-rescore"
CATALOG_PATH = ROOT / "config" / "development-capability-catalog.v0.1.json"
REVERSAL_CONFIG_PATH = ROOT / "config" / "m2-reversal-restatement.v1.json"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def stable_hash(value) -> str:
    payload = json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def clean_text(value) -> str:
    if value is None:
        return ""
    try:
        if bool(pd.isna(value)):
            return ""
    except (TypeError, ValueError):
        pass
    return str(value).strip()


def exact_decimal(value) -> Decimal:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return Decimal("0")
    return Decimal(str(value))


def load_contracts() -> tuple[dict, dict]:
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    capability = next(
        (
            item
            for item in catalog["capabilities"]
            if item["id"] == CAPABILITY_ID
        ),
        None,
    )
    if capability is None:
        raise RuntimeError("m2_reversal_authority_capability_missing")
    reversal = json.loads(REVERSAL_CONFIG_PATH.read_text(encoding="utf-8"))
    return capability, reversal


def role_path(capability: dict, role: str, kind: str) -> Path:
    artifact = next(
        (
            item
            for item in capability["requiredPrivateArtifacts"]
            if item["role"] == role
        ),
        None,
    )
    if artifact is None or artifact["kind"] != kind:
        raise RuntimeError(f"m2_reversal_authority_role_missing:{role}")
    resolved = (ROOT / artifact["path"]).resolve()
    if ROOT.resolve() not in resolved.parents:
        raise RuntimeError(f"m2_reversal_authority_role_escapes_root:{role}")
    if kind == "file" and not resolved.is_file():
        raise RuntimeError(f"m2_reversal_authority_file_missing:{role}")
    if kind == "directory" and not resolved.is_dir():
        raise RuntimeError(f"m2_reversal_authority_directory_missing:{role}")
    return resolved


def load_mapping(mapping_directory: Path) -> tuple[dict[str, str], list[dict]]:
    selected_rows: list[dict] = []
    digests = []
    for path in sorted(mapping_directory.glob("*.json")):
        digests.append(
            {
                "relativePath": path.relative_to(ROOT).as_posix(),
                "sha256": sha256_file(path),
            }
        )
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        rows = (
            payload.get("effective_mapping_snapshot")
            or payload.get("mappings")
            or []
        )
        if len(rows) > len(selected_rows):
            selected_rows = rows
    mapping: dict[str, str] = {}
    for row in selected_rows:
        raw = normalize_raw_work_id(row.get("raw_work_id"))
        target = normalize_raw_work_id(row.get("target_standard_work_id"))
        if raw and target:
            mapping[raw] = target
    return mapping, digests


def authority_paths(
    capability: dict,
) -> tuple[HumanLedgerPartitionSources, Path, Path]:
    return (
        HumanLedgerPartitionSources(
            total_ledger=role_path(
                capability, "total-ledger-authority", "file"
            ),
            sales_share=role_path(
                capability, "sales-share-ledger-authority", "file"
            ),
            buyout=role_path(
                capability, "buyout-ledger-authority", "file"
            ),
        ),
        role_path(capability, "m1-work-mapping-authority", "directory"),
        role_path(capability, "user-reviewed-channel-master", "file"),
    )


def cached_export_valid(
    facts_path: Path,
    receipt_path: Path,
    source_digests: dict,
    mapping_digests: list[dict],
    adapter_digest: str,
    contract_digests: dict,
) -> bool:
    if not facts_path.is_file() or not receipt_path.is_file():
        return False
    try:
        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    return (
        receipt.get("status") == "READY"
        and receipt.get("sourceDigests") == source_digests
        and receipt.get("mappingArtifactDigests") == mapping_digests
        and receipt.get("adapterSha256") == adapter_digest
        and receipt.get("contractDigests") == contract_digests
        and receipt.get("authorityFactsSha256") == sha256_file(facts_path)
    )


def export_authority() -> dict:
    capability, reversal = load_contracts()
    sources, mapping_directory, channel_master_path = authority_paths(
        capability
    )
    mapping, mapping_digests = load_mapping(mapping_directory)
    channel_contract_path = (
        ROOT / "config" / "m2-current-canonical-channel.v0.1.json"
    )
    channel_contract = json.loads(
        channel_contract_path.read_text(encoding="utf-8")
    )
    channel_master, channel_evidence = canonical.load_channel_master(
        channel_contract,
        channel_master_path,
    )
    source_digests = {
        "totalLedger": sha256_file(sources.total_ledger),
        "salesShare": sha256_file(sources.sales_share),
        "buyout": sha256_file(sources.buyout),
        "channelMaster": sha256_file(channel_master_path),
    }
    output_directory = (
        ROOT
        / "data"
        / "private-output"
        / reversal["privateOutputs"]["directoryRole"]
    )
    output_directory.mkdir(parents=True, exist_ok=True)
    facts_path = (
        output_directory / reversal["privateOutputs"]["authorityFacts"]
    )
    receipt_path = (
        output_directory / reversal["privateOutputs"]["authorityReceipt"]
    )
    adapter_digest = sha256_file(Path(__file__).resolve())
    contract_digests = {
        "capabilityCatalog": sha256_file(CATALOG_PATH),
        "reversalContract": sha256_file(REVERSAL_CONFIG_PATH),
        "partitionContract": sha256_file(
            ROOT / "config" / "m2-current-human-ledger-partition.v0.1.json"
        ),
        "channelContract": sha256_file(channel_contract_path),
        "partitionImplementation": sha256_file(
            TOOLS / "human_ledger_partition.py"
        ),
        "workMappingImplementation": sha256_file(
            TOOLS / "calibrate_cleaned_bills.py"
        ),
        "channelMappingImplementation": sha256_file(
            CURRENT / "materialize_canonical_channel_cases.py"
        ),
    }
    if cached_export_valid(
        facts_path,
        receipt_path,
        source_digests,
        mapping_digests,
        adapter_digest,
        contract_digests,
    ):
        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
        return {
            "status": "READY",
            "cache": "VERIFIED_DIGEST_REUSE",
            "rowCount": receipt["rowCount"],
            "negativeRowCount": receipt["negativeRowCount"],
        }

    previous_receipt = None
    if receipt_path.is_file():
        try:
            previous_receipt = json.loads(
                receipt_path.read_text(encoding="utf-8")
            )
        except (OSError, json.JSONDecodeError):
            previous_receipt = None
    reviewed_checks = {
        "schema_equal",
        "split_type_pure",
        "no_split_overlap",
        "row_multiset_conserved",
        "amount_conserved",
        "monthly_row_count_conserved",
        "monthly_amount_conserved",
    }
    reusable_partition_proof = (
        previous_receipt is not None
        and {
            key: previous_receipt.get("sourceDigests", {}).get(key)
            for key in ("totalLedger", "salesShare", "buyout")
        }
        == {
            key: source_digests[key]
            for key in ("totalLedger", "salesShare", "buyout")
        }
        and reviewed_checks.issubset(
            set(previous_receipt.get("partitionChecksPassed", []))
        )
        and previous_receipt.get("authorityMode")
        == "user_reviewed_workbook_membership"
        and previous_receipt.get("machineClassificationUsed") is False
    )
    if reusable_partition_proof:
        sales_share = pd.read_excel(
            sources.sales_share,
            dtype={
                "渠道ID": "string",
                "我方作品ID": "string",
                TYPE_COLUMN: "string",
            },
        )
        required_columns = [*REAL_BILL_COLUMNS, TYPE_COLUMN]
        missing = [
            column
            for column in required_columns
            if column not in sales_share.columns
        ]
        if missing:
            raise RuntimeError(
                "m2_reversal_authority_sales_share_schema_missing"
            )
        sales_share = sales_share[required_columns].copy()
        if {
            clean_text(value)
            for value in sales_share[TYPE_COLUMN]
        } != {"分成"}:
            raise RuntimeError(
                "m2_reversal_authority_sales_share_type_invalid"
            )
        evidence = {
            "authorityMode": "user_reviewed_workbook_membership",
            "checksPassed": sorted(reviewed_checks),
        }
    else:
        partition, evidence = validate_partition(
            sources,
            REAL_BILL_COLUMNS,
        )
        sales_share = partition["salesShare"]
    amount_scale_power = 0
    negative_count = 0
    positive_total = Decimal("0")
    reversal_total = Decimal("0")
    missing_work_count = 0
    missing_channel_count = 0
    temporary = tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        newline="\n",
        prefix="m2-reversal-authority-",
        suffix=".ndjson",
        dir=output_directory,
        delete=False,
    )
    temporary_path = Path(temporary.name)
    try:
        for ordinal, (_, row) in enumerate(
            sales_share.iterrows(), start=1
        ):
            month = parse_month(row["年月"])
            raw_work_id = normalize_raw_work_id(row["我方作品ID"])
            standard_work_id = mapping.get(raw_work_id)
            if not standard_work_id:
                standard_work_id = derive_standard_work_id(raw_work_id)
            raw_channel_id = canonical.clean(row["渠道ID"])
            raw_channel_name = canonical.clean(row["文学库渠道名称"])
            channel_mapping = channel_master.get(
                (raw_channel_id, raw_channel_name)
            )
            if channel_mapping is None:
                raise RuntimeError(
                    "m2_reversal_authority_channel_mapping_missing"
                )
            channel_member_id = channel_mapping["channelUid"]
            amount = exact_decimal(row["实销金额"])
            amount_text = format(amount, "f")
            fraction = amount_text.partition(".")[2].rstrip("0")
            amount_scale_power = max(amount_scale_power, len(fraction))
            if not month or not standard_work_id:
                missing_work_count += int(not standard_work_id)
                raise RuntimeError(
                    "m2_reversal_authority_work_or_month_missing"
                )
            if not channel_member_id:
                missing_channel_count += 1
                raise RuntimeError(
                    "m2_reversal_authority_channel_missing"
                )
            if amount < 0:
                negative_count += 1
                reversal_total += amount
            else:
                positive_total += amount
            record = {
                "authorityRecordId": stable_hash(
                    [
                        source_digests["salesShare"],
                        ordinal,
                        month,
                        standard_work_id,
                        channel_member_id,
                        amount_text,
                    ]
                ),
                "authorityRowOrdinal": ordinal,
                "billMonth": f"{month}-01",
                "recordedAt": f"{month}-01",
                "standardWorkId": str(standard_work_id),
                "channelMemberId": channel_member_id,
                "actualSalesAmount": amount_text,
                "cashCategory": "sales_share",
                "cashCategoryAuthority":
                    "user_reviewed_workbook_membership",
                "currencyScope":
                    "authority_ledger_native_monetary_unit",
            }
            temporary.write(
                json.dumps(
                    record,
                    ensure_ascii=False,
                    separators=(",", ":"),
                )
                + "\n"
            )
    except Exception:
        temporary.close()
        temporary_path.unlink(missing_ok=True)
        raise
    temporary.close()
    os.replace(temporary_path, facts_path)
    receipt = {
        "schema": "m2.reversal-authority-export.private.v1",
        "status": "READY",
        "authorityMode": evidence["authorityMode"],
        "machineClassificationUsed": False,
        "partitionChecksPassed": evidence["checksPassed"],
        "sourceDigests": source_digests,
        "mappingArtifactDigests": mapping_digests,
        "channelMasterEvidence": {
            "workbookSha256": channel_evidence["workbookSha256"],
            "rawPairCount": channel_evidence["rawPairCount"],
            "canonicalChannelCount":
                channel_evidence["canonicalChannelCount"],
            "confirmedRowCount": channel_evidence["confirmedRowCount"],
            "inconsistentCanonicalGroupCount":
                channel_evidence["inconsistentCanonicalGroupCount"],
        },
        "adapterSha256": adapter_digest,
        "contractDigests": contract_digests,
        "authorityFactsSha256": sha256_file(facts_path),
        "rowCount": len(sales_share),
        "negativeRowCount": negative_count,
        "positiveRevenue": format(positive_total, "f"),
        "signedReversal": format(reversal_total, "f"),
        "amountScalePower": amount_scale_power,
        "missingWorkCount": missing_work_count,
        "missingChannelCount": missing_channel_count,
        "currencyScopeMode":
            "single_reviewed_ledger_native_monetary_unit",
        "channelScopeMode": "user_reviewed_canonical_channel_uid",
        "contractOrSettlementFieldStatus":
            "NOT_AVAILABLE_NOT_USED_FOR_SCOPE_COLLAPSE",
    }
    receipt_path.write_text(
        json.dumps(receipt, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return {
        "status": "READY",
        "cache": "REBUILT_FROM_REVIEWED_PARTITION",
        "rowCount": receipt["rowCount"],
        "negativeRowCount": receipt["negativeRowCount"],
    }


def main() -> None:
    print(json.dumps(export_authority(), ensure_ascii=False))


if __name__ == "__main__":
    main()
