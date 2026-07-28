#!/usr/bin/env python3
"""Materialize private canonical-channel M2 development inputs.

The adapter reads the user-reviewed channel workbook and the already verified
human-ledger cache.  Raw channel identities remain private.  It never connects
to a database, calls a provider, or opens labels after the registered
development boundary.
"""

from __future__ import annotations

import hashlib
import json
import math
import sys
import unicodedata
from collections import defaultdict
from decimal import Decimal
from pathlib import Path
from typing import Any, Iterable, Mapping

import pandas as pd


ROOT = Path(__file__).resolve().parents[2]
TOOLS = ROOT / "tools" / "m2-calibration"
REAL_DATA = ROOT / "scripts" / "m2-real-data"
CURRENT = ROOT / "scripts" / "m2-current"
for candidate in (TOOLS, REAL_DATA, CURRENT):
    if str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

import run_m2_current_formal_execution_payload as formal  # noqa: E402


CONFIG_PATH = ROOT / "config" / "m2-current-canonical-channel.v0.1.json"
WORKBOOK_PATH = (
    ROOT
    / "data"
    / "private-output"
    / "outputs"
    / "channel-governance-20260726"
    / "M2-渠道统一与类型人工补全表-v0.2.xlsx"
)
DENSE_DIR = ROOT / "data" / "private-output" / "m2-current-dense"
DENSE_CASE_PATH = DENSE_DIR / "M2-current-dense-cases-private-v0.1.ndjson"
DENSE_MANIFEST_PATH = DENSE_DIR / "M2-current-dense-manifest-private-v0.1.json"
FROZEN_TARGET_PATH = (
    DENSE_DIR / "M2-current-sales-share-frozen-cases-private-v0.1.ndjson"
)
V03_PATH = (
    ROOT
    / "data"
    / "private-output"
    / "m2-current-quality"
    / "M2-current-occurrence-amount-candidate-cases-private-v0.3.ndjson"
)


class CanonicalChannelMaterializationError(RuntimeError):
    """The canonical channel private input contract was violated."""


def clean(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and math.isnan(value):
        return ""
    normalized = str(value).strip()
    if normalized.endswith(".0") and normalized[:-2].lstrip("-").isdigit():
        return normalized[:-2]
    return normalized


def digest_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def digest_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_uid(name: str, namespace: str) -> str:
    normalized = unicodedata.normalize("NFKC", name).lower()
    value = hashlib.sha256(
        f"{namespace}\x1f{normalized}".encode("utf-8")
    ).hexdigest()[:20]
    return f"chn_{value}"


def header_index(columns: Iterable[Any], prefix: str) -> str:
    matches = [
        str(column)
        for column in columns
        if clean(column).replace("\n", "").startswith(prefix)
    ]
    if len(matches) != 1:
        raise CanonicalChannelMaterializationError(
            f"channel workbook column differs: {prefix}"
        )
    return matches[0]


def load_channel_master(
    config: Mapping[str, Any],
    workbook_path: Path = WORKBOOK_PATH,
) -> tuple[dict[tuple[str, str], dict[str, str]], dict[str, Any]]:
    if not workbook_path.is_file():
        raise CanonicalChannelMaterializationError(
            "user-reviewed channel workbook is missing"
        )
    master_config = config["channelMaster"]
    frame = pd.read_excel(
        workbook_path,
        sheet_name=master_config["sheetName"],
        header=int(master_config["headerRow"]) - 1,
        dtype=object,
    )
    prefixes = master_config["columnPrefixes"]
    columns = {
        key: header_index(frame.columns, prefix)
        for key, prefix in prefixes.items()
    }
    enums = master_config["enumMappings"]
    rows: dict[tuple[str, str], dict[str, str]] = {}
    canonical_attributes: dict[str, tuple[str, str, str]] = {}
    status_counts: dict[str, int] = defaultdict(int)
    role_counts: dict[str, int] = defaultdict(int)
    mode_counts: dict[str, int] = defaultdict(int)
    form_counts: dict[str, int] = defaultdict(int)
    effective_month_count = 0
    for position, source in frame.iterrows():
        raw_id = clean(source[columns["rawChannelId"]])
        raw_name = clean(source[columns["rawChannelName"]])
        if not raw_id and not raw_name:
            continue
        canonical_name = clean(source[columns["canonicalChannelName"]])
        role_cn = clean(source[columns["channelRole"]])
        mode_cn = clean(source[columns["revenueMode"]])
        form_cn = clean(source[columns["contentForm"]])
        status_cn = clean(source[columns["auditStatus"]])
        effective_month = clean(source[columns["effectiveMonth"]])
        if not all((canonical_name, role_cn, mode_cn, form_cn, status_cn)):
            raise CanonicalChannelMaterializationError(
                f"channel workbook required cell missing at row {position + 5}"
            )
        try:
            role = enums["channelRole"][role_cn]
            mode = enums["revenueMode"][mode_cn]
            content_form = enums["contentForm"][form_cn]
            audit_status = enums["auditStatus"][status_cn]
        except KeyError as exc:
            raise CanonicalChannelMaterializationError(
                f"channel workbook enum differs at row {position + 5}"
            ) from exc
        if status_cn != master_config["requiredAuditStatus"]:
            raise CanonicalChannelMaterializationError(
                f"channel workbook row is not confirmed at row {position + 5}"
            )
        key = (raw_id, raw_name)
        if key in rows:
            raise CanonicalChannelMaterializationError(
                "channel workbook raw pair is duplicated"
            )
        uid = canonical_uid(
            canonical_name,
            master_config["uidNamespace"],
        )
        attributes = (role, mode, content_form)
        if (
            uid in canonical_attributes
            and canonical_attributes[uid] != attributes
        ):
            raise CanonicalChannelMaterializationError(
                "canonical channel attributes conflict"
            )
        canonical_attributes[uid] = attributes
        rows[key] = {
            "channelUid": uid,
            "channelRole": role,
            "revenueMode": mode,
            "contentForm": content_form,
            "auditStatus": audit_status,
        }
        status_counts[audit_status] += 1
        role_counts[role] += 1
        mode_counts[mode] += 1
        form_counts[content_form] += 1
        if effective_month:
            effective_month_count += 1
    if len(rows) != int(master_config["expectedRawPairCount"]):
        raise CanonicalChannelMaterializationError(
            "channel workbook raw pair count differs"
        )
    if (
        len(canonical_attributes)
        != int(master_config["expectedCanonicalChannelCount"])
    ):
        raise CanonicalChannelMaterializationError(
            "channel workbook canonical channel count differs"
        )
    evidence = {
        "workbookSha256": digest_file(workbook_path),
        "rawPairCount": len(rows),
        "canonicalChannelCount": len(canonical_attributes),
        "confirmedRowCount": status_counts.get("confirmed", 0),
        "inconsistentCanonicalGroupCount": 0,
        "roleCounts": dict(sorted(role_counts.items())),
        "revenueModeCounts": dict(sorted(mode_counts.items())),
        "contentFormCounts": dict(sorted(form_counts.items())),
        "effectiveMonthRowCount": effective_month_count,
        "effectiveMonthCoverage": effective_month_count / len(rows),
        "userMaintainedChannelUid": False,
    }
    return rows, evidence


def read_ndjson(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        raise CanonicalChannelMaterializationError(
            f"required private input is missing: {path.name}"
        )
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line
    ]


def encode_ndjson(
    rows: Iterable[Mapping[str, Any]]
) -> tuple[bytes, int]:
    encoded: list[bytes] = []
    count = 0
    for row in rows:
        encoded.append(
            json.dumps(
                row,
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
                allow_nan=False,
            ).encode("utf-8")
            + b"\n"
        )
        count += 1
    return b"".join(encoded), count


def add_months(month: str, offset: int) -> str:
    year, month_number = map(int, month.split("-"))
    absolute = year * 12 + month_number - 1 + offset
    return f"{absolute // 12:04d}-{absolute % 12 + 1:02d}"


def month_range(first: str, last: str) -> list[str]:
    output: list[str] = []
    current = first
    while current <= last:
        output.append(current)
        current = add_months(current, 1)
    return output


def decimal_sum(values: Iterable[Any]) -> Decimal:
    return sum((Decimal(str(value)) for value in values), Decimal("0"))


def case_key(row: Mapping[str, Any]) -> str:
    key = row["caseKey"]
    return "|".join(
        (
            str(key["standardWorkId"]),
            str(key["origin"]),
            str(int(key["horizonMonths"])),
            str(key["route"]),
        )
    )


def materialize() -> dict[str, Any]:
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    if (
        config.get("schema")
        != "m2.current.canonical_channel_development.v0.1"
        or config["authorization"]["newCandidateFamilyDevelopment"] is not True
        or config["authorization"]["developmentModelFitting"] is not True
        or config["authorization"]["finalHoldout"] is not False
        or config["authorization"]["deferredLabels"] is not False
        or config["authorization"]["provider"] is not False
        or config["authorization"]["database"] is not False
        or config["authorization"]["release"] is not False
    ):
        raise CanonicalChannelMaterializationError(
            "canonical channel development authorization differs"
        )
    master, master_evidence = load_channel_master(config)
    model_inputs = formal.load_or_build_model_inputs()
    bill = model_inputs["mappedSalesShareBill"].copy()
    latest_complete_month = str(
        model_inputs["cashClassificationAuthority"]["latestCompleteMonth"]
    )
    if latest_complete_month != config["dataContract"]["latestCompleteMonth"]:
        raise CanonicalChannelMaterializationError(
            "latest complete month differs"
        )
    if set(bill["cashCategory"].astype(str)) != {"sales_share"}:
        raise CanonicalChannelMaterializationError(
            "canonical channel input includes non-sales-share cash"
        )
    mapped_rows: list[dict[str, Any]] = []
    unmapped_pairs: set[tuple[str, str]] = set()
    for _, row in bill.iterrows():
        pair = (
            clean(row.get("渠道ID")),
            clean(row.get("文学库渠道名称")),
        )
        mapping = master.get(pair)
        if mapping is None:
            unmapped_pairs.add(pair)
            continue
        mapped_rows.append({
            "standardWorkId": clean(row.get("standardWorkId")),
            "billMonth": clean(row.get("billMonth")),
            "amount": Decimal(str(row.get("amount"))),
            **mapping,
        })
    if unmapped_pairs:
        raise CanonicalChannelMaterializationError(
            "sales-share bill contains unmapped raw channel pairs"
        )
    if len(mapped_rows) != len(bill):
        raise CanonicalChannelMaterializationError(
            "channel mapping row conservation failed"
        )
    input_amount = decimal_sum(bill["amount"].tolist())
    output_amount = decimal_sum(row["amount"] for row in mapped_rows)
    if input_amount != output_amount:
        raise CanonicalChannelMaterializationError(
            "channel mapping amount conservation failed"
        )
    complete_rows = [
        row for row in mapped_rows
        if row["billMonth"] <= latest_complete_month
    ]
    complete_input = bill[
        bill["billMonth"].astype(str) <= latest_complete_month
    ]
    complete_input_amount = decimal_sum(complete_input["amount"].tolist())
    complete_output_amount = decimal_sum(
        row["amount"] for row in complete_rows
    )
    if (
        len(complete_rows) != len(complete_input)
        or complete_input_amount != complete_output_amount
    ):
        raise CanonicalChannelMaterializationError(
            "complete-month channel mapping conservation failed"
        )

    monthly: dict[
        tuple[str, str, str, str, str],
        Decimal,
    ] = defaultdict(Decimal)
    first_observed: dict[str, str] = {}
    used_raw_pairs: set[tuple[str, str]] = set()
    used_channels: set[str] = set()
    for row in complete_rows:
        key = (
            row["standardWorkId"],
            row["billMonth"],
            row["channelUid"],
            row["channelRole"],
            row["revenueMode"],
        )
        monthly[key] += row["amount"]
        used_channels.add(row["channelUid"])
        previous = first_observed.get(row["standardWorkId"])
        if previous is None or row["billMonth"] < previous:
            first_observed[row["standardWorkId"]] = row["billMonth"]
    for _, row in bill.iterrows():
        used_raw_pairs.add((
            clean(row.get("渠道ID")),
            clean(row.get("文学库渠道名称")),
        ))
    panel_amount = decimal_sum(monthly.values())
    if panel_amount != complete_output_amount:
        raise CanonicalChannelMaterializationError(
            "canonical monthly panel amount conservation failed"
        )

    by_work_channel: dict[
        str,
        dict[tuple[str, str, str], dict[str, Decimal]],
    ] = defaultdict(lambda: defaultdict(dict))
    for (
        work_id,
        bill_month,
        channel_uid,
        role,
        mode,
    ), amount in monthly.items():
        by_work_channel[work_id][
            (channel_uid, role, mode)
        ][bill_month] = amount

    dense_manifest = json.loads(
        DENSE_MANIFEST_PATH.read_text(encoding="utf-8")
    )
    dense_cases = read_ndjson(DENSE_CASE_PATH)
    dense_contract = config["dataContract"]["denseDevelopment"]
    if (
        dense_manifest.get("originCount") != dense_contract["originCount"]
        or dense_manifest.get("caseRowCount") != len(dense_cases)
        or any(
            row["labelAvailableAsOf"]
            > dense_contract["labelAvailableThrough"]
            for row in dense_cases
        )
    ):
        raise CanonicalChannelMaterializationError(
            "dense development boundary differs"
        )
    frozen_targets = read_ndjson(FROZEN_TARGET_PATH)
    v03_rows = read_ndjson(V03_PATH)
    if (
        len(frozen_targets)
        != config["dataContract"]["frozenMachineRouteAudit"]["caseCount"]
        or len(v03_rows)
        != config["dataContract"]["frozenMachineRouteAudit"]["caseCount"]
    ):
        raise CanonicalChannelMaterializationError(
            "frozen machine-route population differs"
        )
    v03_by_key = {case_key(row): row for row in v03_rows}
    if len(v03_by_key) != len(v03_rows):
        raise CanonicalChannelMaterializationError(
            "v0.3 frozen case key is duplicated"
        )

    required_work_origins: set[tuple[str, str]] = {
        (str(row["standardWorkId"]), str(row["origin"]))
        for row in dense_cases
    }
    required_work_origins.update(
        (
            str(row["caseKey"]["standardWorkId"]),
            str(row["caseKey"]["origin"]),
        )
        for row in frozen_targets
        if row["servedUnderHumanAuthority"] is True
    )
    formal_input = model_inputs["formalInput"]
    rating_by_work = {
        clean(row["standardWorkId"]): clean(row["rating"])
        for _, row in model_inputs["evaluated"].iterrows()
    }
    history_rows: list[dict[str, Any]] = []
    for work_id, origin in sorted(required_work_origins):
        channels = []
        amount_by_mode: dict[str, Decimal] = defaultdict(Decimal)
        for (
            channel_uid,
            role,
            mode,
        ), series in sorted(by_work_channel.get(work_id, {}).items()):
            eligible_months = [
                month for month in series
                if month <= origin
            ]
            if not eligible_months:
                continue
            first = min(eligible_months)
            values = [
                float(series.get(month, Decimal("0")))
                for month in month_range(first, origin)
            ]
            amount_by_mode[mode] += sum(
                (
                    abs(series.get(month, Decimal("0")))
                    for month in eligible_months
                ),
                Decimal("0"),
            )
            channels.append({
                "channelUid": channel_uid,
                "channelRole": role,
                "revenueMode": mode,
                "historyFirstMonth": first,
                "historySeries": values,
            })
        dominant_mode = (
            max(
                amount_by_mode.items(),
                key=lambda item: (float(item[1]), item[0]),
            )[0]
            if amount_by_mode
            else "unknown"
        )
        first_month = first_observed.get(work_id)
        observed_age = (
            len(month_range(first_month, origin))
            if first_month and first_month <= origin
            else 0
        )
        source = formal_input.get(work_id, {})
        history_rows.append({
            "historyKey": f"{work_id}|{origin}",
            "standardWorkId": work_id,
            "origin": origin,
            "canonicalChannels": channels,
            "dominantRevenueMode": dominant_mode,
            "observedSalesAgeMonths": observed_age,
            "thirdLevelCategoryReportingOnly": clean(
                source.get("三级分类")
            ) or "unknown",
            "currentRatingReportingOnly": rating_by_work.get(
                work_id,
                "unknown",
            ),
            "launchAgeUsed": False,
            "currentStateBackfillUsed": False,
            "historyThroughOriginOnly": True,
        })

    dense_output = [{
        **row,
        "historyKey": f"{row['standardWorkId']}|{row['origin']}",
        "basePolicy": "seasonal_naive_from_work_history",
    } for row in dense_cases if row["served"] is True]
    frozen_output: list[dict[str, Any]] = []
    for target in frozen_targets:
        key = case_key(target)
        base = v03_by_key.get(key)
        if base is None:
            raise CanonicalChannelMaterializationError(
                "frozen target is missing exact v0.3 comparator"
            )
        if target["servedUnderHumanAuthority"] is not True:
            continue
        frozen_output.append({
            "standardWorkId": str(target["caseKey"]["standardWorkId"]),
            "origin": str(target["caseKey"]["origin"]),
            "horizonMonths": int(target["caseKey"]["horizonMonths"]),
            "route": str(target["authorityRoute"]),
            "segment": str(base["activitySegment"]),
            "labelAvailableAsOf": str(target["labelAvailableAsOf"]),
            "actual": float(target["salesShareCashActual"]),
            "basePointEstimate": float(base["candidatePointEstimate"]),
            "historyKey":
                f"{target['caseKey']['standardWorkId']}|"
                f"{target['caseKey']['origin']}",
            "allBuyoutExcludedFromForecast": True,
        })
    served_contract = config["dataContract"]["currentHumanAuthorityServed"]
    if (
        len(frozen_output) != served_contract["caseCount"]
        or len({
            row["standardWorkId"] for row in frozen_output
        }) != served_contract["workCount"]
    ):
        raise CanonicalChannelMaterializationError(
            "current human-authority served population differs"
        )

    output_config = config["privateOutputs"]
    output_dir = ROOT / output_config["directory"]
    output_dir.mkdir(parents=True, exist_ok=True)
    history_bytes, history_count = encode_ndjson(history_rows)
    dense_bytes, dense_count = encode_ndjson(dense_output)
    frozen_bytes, frozen_count = encode_ndjson(frozen_output)
    (output_dir / output_config["channelHistory"]).write_bytes(history_bytes)
    (output_dir / output_config["denseCases"]).write_bytes(dense_bytes)
    (output_dir / output_config["frozenCases"]).write_bytes(frozen_bytes)
    role_amounts: dict[str, Decimal] = defaultdict(Decimal)
    mode_amounts: dict[str, Decimal] = defaultdict(Decimal)
    for row in complete_rows:
        role_amounts[row["channelRole"]] += row["amount"]
        mode_amounts[row["revenueMode"]] += row["amount"]
    manifest = {
        "schema": "m2.current.canonical_channel.private_manifest.v0.1",
        "tracked": False,
        "decisionStatus": "not_for_formal_decision",
        "authorizationSource": config["authorization"]["source"],
        "channelMaster": master_evidence,
        "mapping": {
            "salesShareFactCount": len(bill),
            "salesShareRawPairCount": len(used_raw_pairs),
            "mappedFactCount": len(mapped_rows),
            "unmappedFactCount": 0,
            "completeFactCount": len(complete_rows),
            "completeAmount": float(complete_output_amount),
            "canonicalChannelsUsedBySalesShare": len(used_channels),
            "rowConserved": True,
            "amountConserved": True,
            "mappingCoverage": 1.0,
        },
        "panel": {
            "grain":
                "standard_work_x_bill_month_x_canonical_channel_x_role_x_mode",
            "rowCount": len(monthly),
            "amount": float(panel_amount),
            "latestCompleteMonth": latest_complete_month,
            "incompleteMonthsExcluded":
                config["dataContract"]["excludedIncompleteMonths"],
            "roleAmountShares": {
                key: float(value / panel_amount)
                for key, value in sorted(role_amounts.items())
            },
            "revenueModeAmountShares": {
                key: float(value / panel_amount)
                for key, value in sorted(mode_amounts.items())
            },
        },
        "histories": {
            "rowCount": history_count,
            "sha256": digest_bytes(history_bytes),
            "historyThroughOriginOnly": True,
            "rawChannelIdentifiersWritten": False,
        },
        "denseCases": {
            "rowCount": dense_count,
            "sha256": digest_bytes(dense_bytes),
            "originCount": len({
                row["origin"] for row in dense_output
            }),
            "labelAvailableThrough":
                dense_contract["labelAvailableThrough"],
        },
        "frozenCases": {
            "machineRouteAuditCaseCount": len(frozen_targets),
            "servedCaseCount": frozen_count,
            "servedWorkCount": len({
                row["standardWorkId"] for row in frozen_output
            }),
            "sha256": digest_bytes(frozen_bytes),
        },
        "featureBoundary": {
            "thirdLevelCategoryPredictionFeatureUsed": False,
            "currentRatingPredictionFeatureUsed": False,
            "verifiedHistoricalLaunchMonthAvailable": False,
            "observedSalesAgeProxyUsed": True,
            "singlePurchaseNetUnitPriceAvailable": False,
            "singlePurchaseUnitConversionUsed": False,
            "historicalChannelStatusSnapshotAvailable": False,
            "postHocStaticChannelAttributesUsed": True,
            "currentStateBackfillUsed": False,
        },
        "providerCalled": False,
        "databaseConnected": False,
        "finalHoldoutOpened": False,
        "embargoShadowOpened": False,
        "deferredLabelsOpened": False,
        "releaseAuthorized": False,
    }
    (output_dir / output_config["manifest"]).write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return manifest


if __name__ == "__main__":
    print(json.dumps(materialize(), ensure_ascii=False, indent=2))
