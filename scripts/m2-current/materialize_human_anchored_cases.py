#!/usr/bin/env python3
"""Materialize the bounded private cases for the human-anchored M2 model.

Only the user-reviewed sales-share ledger is used as cash authority.  Buyout
cash, post-2025 cash, provider calls, databases and sealed holdouts are outside
this adapter.  Identifiers and row-level facts remain in ignored private output.
"""

from __future__ import annotations

import hashlib
import json
import math
import subprocess
import sys
from collections import Counter, defaultdict
from decimal import Decimal
from pathlib import Path
from typing import Any, Iterable, Mapping


ROOT = Path(__file__).resolve().parents[2]
CURRENT = ROOT / "scripts" / "m2-current"
if str(CURRENT) not in sys.path:
    sys.path.insert(0, str(CURRENT))

import materialize_canonical_channel_cases as canonical  # noqa: E402
import run_m2_current_formal_execution_payload as formal  # noqa: E402


CONFIG_PATH = ROOT / "config" / "m2-current-human-anchored.v0.1.json"
CHANNEL_EXPERT_CONFIG_PATH = (
    ROOT / "config" / "m2-current-channel-experts.v0.1.json"
)
CHANNEL_GENERATIVE_CONFIG_PATH = (
    ROOT / "config" / "m2-current-channel-generative.v0.2.json"
)
PUBLISHING_SCALE_CHANNEL_CONFIG_PATH = (
    ROOT / "config" / "m2-current-publishing-scale-channel.v0.1.json"
)
PUBLISHING_SCALE_SUPPORT_PATH = (
    ROOT / "config" / "m2-publishing-scale-statistical-support.v1.json"
)
PUBLISHING_SCALE_EXECUTION_POLICY_PATH = (
    ROOT / "config" / "m2-publishing-scale-execution-policy.v0.2.json"
)
V03_PATH = (
    ROOT
    / "data"
    / "private-output"
    / "m2-current-quality"
    / "M2-current-occurrence-amount-candidate-cases-private-v0.3.ndjson"
)


class HumanAnchoredMaterializationError(RuntimeError):
    """The human-anchored private materialization contract was violated."""


def run(
    *,
    channel_experts: bool = False,
    channel_generative: bool = False,
    publishing_scale_channel: bool = False,
    execution_authorization_file: str | None = None,
    run_receipt_file: str | None = None,
) -> dict[str, Any]:
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    _validate_config(config)
    channel_config = (
        json.loads(
            CHANNEL_EXPERT_CONFIG_PATH.read_text(encoding="utf-8")
        )
        if channel_experts
        else None
    )
    if channel_generative and publishing_scale_channel:
        raise HumanAnchoredMaterializationError(
            "channel generative materialization modes are mutually exclusive"
        )
    generative_config_path = (
        PUBLISHING_SCALE_CHANNEL_CONFIG_PATH
        if publishing_scale_channel
        else CHANNEL_GENERATIVE_CONFIG_PATH
    )
    generative_config = (
        json.loads(generative_config_path.read_text(encoding="utf-8"))
        if channel_generative or publishing_scale_channel
        else None
    )
    if generative_config is not None:
        _validate_channel_generative_config(generative_config)
    output_dir = ROOT / (
        generative_config["privateOutputs"]["directory"]
        if publishing_scale_channel
        else config["privateOutputs"]["directory"]
    )
    receipt_path: Path | None = None
    publishing_scale_output_files: Mapping[str, str] | None = None
    if publishing_scale_channel:
        policy = json.loads(
            PUBLISHING_SCALE_EXECUTION_POLICY_PATH.read_text(
                encoding="utf-8"
            )
        )
        _validate_publishing_scale_execution_policy(policy)
        (
            receipt_path,
            publishing_scale_output_files,
        ) = _prepare_publishing_scale_private_materialization(
            output_dir=output_dir,
            config=generative_config,
            policy=policy,
            execution_authorization_file=execution_authorization_file,
            run_receipt_file=run_receipt_file,
        )
    master_config = json.loads(
        (ROOT / "config/m2-current-canonical-channel.v0.1.json").read_text(
            encoding="utf-8"
        )
    )
    master, master_evidence = canonical.load_channel_master(master_config)
    inputs = formal.load_or_build_model_inputs()
    if receipt_path is not None:
        _update_private_receipt(
            receipt_path,
            status="PRIVATE_INPUTS_READ_FOR_MATERIALIZATION",
            privateRowsRead=(
                len(inputs["formalInput"])
                + len(inputs["mappedSalesShareBill"])
            ),
        )
    authority_work_ids = {str(value) for value in inputs["formalInput"]}
    if len(authority_work_ids) != int(
        config["dataContract"]["authorityWorkCount"]
    ):
        raise HumanAnchoredMaterializationError(
            "authority work population differs"
        )
    bill = inputs["mappedSalesShareBill"].copy()
    if set(bill["cashCategory"].astype(str)) != {"sales_share"}:
        raise HumanAnchoredMaterializationError(
            "non-sales-share cash reached human-anchored adapter"
        )
    bill = bill[bill["validForCalibration"].astype(bool)].copy()
    rows, mapping_audit = _map_sales_share_rows(
        bill,
        master,
        config["dataContract"]["featureAndLabelWindowStart"],
        config["dataContract"]["featureAndLabelWindowEnd"],
    )
    mapped_work_ids = {str(row["standardWorkId"]) for row in rows}
    if not mapped_work_ids.issubset(authority_work_ids):
        raise HumanAnchoredMaterializationError(
            "modern sales-share rows exceed authority work population"
        )
    panel = _monthly_panel(rows)
    platform_panel = _platform_monthly_panel(panel)
    first_observed = _first_observed_month(bill, authority_work_ids)
    reporting = _reporting_attributes(inputs, authority_work_ids)
    v03 = _read_v03()

    history_origins = sorted(
        set(config["dataContract"]["primaryOrigins"])
        | set(config["dataContract"]["auxiliaryOrigins"])
    )
    histories: list[dict[str, Any]] = []
    history_by_key: dict[str, dict[str, Any]] = {}
    eligible_by_origin: dict[str, set[str]] = {}
    for origin in history_origins:
        eligible = {
            work_id
            for work_id in authority_work_ids
            if _has_modern_history(panel, work_id, origin)
        }
        eligible_by_origin[origin] = eligible
        for work_id in sorted(eligible):
            history = _history_row(
                work_id,
                origin,
                panel,
                platform_panel,
                first_observed,
                reporting[work_id],
            )
            histories.append(history)
            history_by_key[history["historyKey"]] = history

    primary = _build_cases(
        origins=config["dataContract"]["primaryOrigins"],
        horizons=[config["dataContract"]["primaryHorizonMonths"]],
        eligible_by_origin=eligible_by_origin,
        history_by_key=history_by_key,
        panel=panel,
        v03=v03,
        label_end=config["dataContract"]["featureAndLabelWindowEnd"],
        case_family="primary_36_month_cross_work",
    )
    auxiliary = _build_cases(
        origins=config["dataContract"]["auxiliaryOrigins"],
        horizons=config["dataContract"]["auxiliaryHorizons"],
        eligible_by_origin=eligible_by_origin,
        history_by_key=history_by_key,
        panel=panel,
        v03=v03,
        label_end=config["dataContract"]["featureAndLabelWindowEnd"],
        case_family="auxiliary_strict_as_of",
    )
    if not primary or not auxiliary:
        raise HumanAnchoredMaterializationError(
            "human-anchored case population is empty"
        )
    _validate_cases(primary, history_by_key, config)
    _validate_cases(auxiliary, history_by_key, config)

    history_bytes = _encode_ndjson(histories)
    primary_bytes = _encode_ndjson(primary)
    auxiliary_bytes = _encode_ndjson(auxiliary)
    manifest = _manifest(
        config,
        inputs,
        mapping_audit,
        master_evidence,
        histories,
        primary,
        auxiliary,
        history_bytes,
        primary_bytes,
        auxiliary_bytes,
        bill,
        rows,
    )
    output_dir.mkdir(parents=True, exist_ok=True)
    if not publishing_scale_channel:
        (output_dir / config["privateOutputs"]["histories"]).write_bytes(
            history_bytes
        )
        (output_dir / config["privateOutputs"]["primaryCases"]).write_bytes(
            primary_bytes
        )
        (output_dir / config["privateOutputs"]["auxiliaryCases"]).write_bytes(
            auxiliary_bytes
        )
        (output_dir / config["privateOutputs"]["manifest"]).write_text(
            json.dumps(
                manifest,
                ensure_ascii=False,
                indent=2,
                sort_keys=True,
                allow_nan=False,
            )
            + "\n",
            encoding="utf-8",
        )
    if channel_config is not None:
        _write_channel_expert_supplement(
            output_dir=output_dir,
            channel_config=channel_config,
            base_manifest=manifest,
            primary=primary,
            auxiliary=auxiliary,
            history_by_key=history_by_key,
            panel=panel,
            output_files=publishing_scale_output_files,
        )
    if generative_config is not None:
        materialization_manifest = _write_channel_generative_supplement(
            output_dir=output_dir,
            generative_config=generative_config,
            base_manifest=manifest,
            primary=primary,
            auxiliary=auxiliary,
            history_by_key=history_by_key,
            panel=panel,
        )
        if receipt_path is not None:
            _update_private_receipt(
                receipt_path,
                status="PRIVATE_MATERIALIZATION_COMPLETE",
                privateMaterializationComplete=True,
                materializedPrimaryPackedRows=materialization_manifest[
                    "primaryPackedRowCount"
                ],
                materializedStrictPackedRows=materialization_manifest[
                    "auxiliaryPackedRowCount"
                ],
            )
    return manifest


def _validate_config(config: Mapping[str, Any]) -> None:
    authorization = config.get("authorization", {})
    contract = config.get("dataContract", {})
    if (
        config.get("schema")
        != "m2.current.human_anchored_development.v0.1"
        or config.get("target") != "future_sales_share_cash"
        or authorization.get("populationExpansion") is not True
        or authorization.get("humanParameterLearning") is not True
        or authorization.get("hierarchicalExpertDevelopment") is not True
        or authorization.get("probabilisticDevelopment") is not True
        or any(
            authorization.get(key) is not False
            for key in (
                "independentLaterOrigin",
                "finalHoldout",
                "provider",
                "database",
                "canary",
                "release",
                "m3Formal",
            )
        )
        or contract.get("featureAndLabelWindowStart") != "2021-01"
        or contract.get("featureAndLabelWindowEnd") != "2025-12"
        or contract.get("unmaturedLabelPolicy")
        != "exclude_never_zero_impute"
        or contract.get("pre2021CashAmountUsed") is not False
        or contract.get("post2025CashAmountUsed") is not False
        or contract.get("buyoutCashUsed") is not False
    ):
        raise HumanAnchoredMaterializationError(
            "human-anchored authorization or data boundary differs"
        )


def _map_sales_share_rows(
    bill: Any,
    master: Mapping[tuple[str, str], Mapping[str, str]],
    first_month: str,
    last_month: str,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    unmapped: set[tuple[str, str]] = set()
    input_amount = Decimal("0")
    for _, source in bill.iterrows():
        month = canonical.clean(source.get("billMonth"))
        if month < first_month or month > last_month:
            continue
        work_id = canonical.clean(source.get("standardWorkId"))
        pair = (
            canonical.clean(source.get("渠道ID")),
            canonical.clean(source.get("文学库渠道名称")),
        )
        mapping = master.get(pair)
        if mapping is None:
            unmapped.add(pair)
            continue
        amount = Decimal(str(source.get("amount")))
        input_amount += amount
        rows.append(
            {
                "standardWorkId": work_id,
                "billMonth": month,
                "amount": amount,
                "channelUid": mapping["channelUid"],
                "channelRole": mapping["channelRole"],
                "revenueMode": mapping["revenueMode"],
            }
        )
    if unmapped:
        raise HumanAnchoredMaterializationError(
            "modern sales-share rows contain unmapped channel pairs"
        )
    output_amount = sum(
        (row["amount"] for row in rows),
        Decimal("0"),
    )
    if input_amount != output_amount:
        raise HumanAnchoredMaterializationError(
            "modern sales-share amount conservation failed"
        )
    return rows, {
        "inputRowCount": len(rows),
        "outputRowCount": len(rows),
        "mappingCoverage": 1,
        "inputNetAmount": float(input_amount),
        "outputNetAmount": float(output_amount),
        "unmappedRawPairCount": 0,
    }


def _monthly_panel(
    rows: Iterable[Mapping[str, Any]]
) -> dict[str, Any]:
    panel: dict[str, Any] = defaultdict(
        lambda: defaultdict(
            lambda: defaultdict(
                lambda: {
                    "positive": Decimal("0"),
                    "reversal": Decimal("0"),
                    "net": Decimal("0"),
                }
            )
        )
    )
    for row in rows:
        key = (
            str(row["channelUid"]),
            str(row["channelRole"]),
            str(row["revenueMode"]),
        )
        amount = Decimal(str(row["amount"]))
        bucket = panel[str(row["standardWorkId"])][key][
            str(row["billMonth"])
        ]
        bucket["positive"] += max(amount, Decimal("0"))
        bucket["reversal"] += max(-amount, Decimal("0"))
        bucket["net"] += amount
    return panel


def _first_observed_month(
    bill: Any,
    authority_work_ids: set[str],
) -> dict[str, str]:
    output: dict[str, str] = {}
    for _, row in bill.iterrows():
        work_id = canonical.clean(row.get("standardWorkId"))
        month = canonical.clean(row.get("billMonth"))
        if work_id not in authority_work_ids or not month:
            continue
        previous = output.get(work_id)
        if previous is None or month < previous:
            output[work_id] = month
    return output


def _platform_monthly_panel(
    panel: Mapping[
        str,
        Mapping[tuple[str, str, str], Mapping[str, Decimal]],
    ]
) -> dict[str, dict[str, Decimal]]:
    output: dict[str, dict[str, Decimal]] = defaultdict(
        lambda: defaultdict(Decimal)
    )
    for channels in panel.values():
        for (channel_uid, _role, _mode), series in channels.items():
            for month, amounts in series.items():
                output[channel_uid][month] += amounts["positive"]
    return output


def _reporting_attributes(
    inputs: Mapping[str, Any],
    work_ids: set[str],
) -> dict[str, dict[str, str]]:
    formal_input = inputs["formalInput"]
    output: dict[str, dict[str, str]] = {}
    for work_id in work_ids:
        row = formal_input.get(work_id, {}) or {}
        output[work_id] = {
            "firstLevelCategoryReportingOnly":
                canonical.clean(row.get("一级分类")) or "unknown",
            "secondLevelCategoryReportingOnly":
                canonical.clean(row.get("二级分类")) or "unknown",
            "thirdLevelCategoryReportingOnly":
                canonical.clean(row.get("三级分类")) or "unknown",
        }
    return output


def _read_v03() -> dict[tuple[str, str, int], dict[str, Any]]:
    if not V03_PATH.is_file():
        return {}
    output: dict[tuple[str, str, int], dict[str, Any]] = {}
    for line in V03_PATH.read_text(encoding="utf-8").splitlines():
        if not line:
            continue
        row = json.loads(line)
        key = row["caseKey"]
        compact = (
            str(key["standardWorkId"]),
            str(key["origin"]),
            int(key["horizonMonths"]),
        )
        if compact in output:
            raise HumanAnchoredMaterializationError(
                "v0.3 overlap key is duplicated"
            )
        output[compact] = row
    return output


def _has_modern_history(
    panel: Mapping[str, Any],
    work_id: str,
    origin: str,
) -> bool:
    return any(
        month <= origin
        for series in panel.get(work_id, {}).values()
        for month in series
    )


def _history_row(
    work_id: str,
    origin: str,
    panel: Mapping[str, Any],
    platform_panel: Mapping[str, Mapping[str, Decimal]],
    first_observed: Mapping[str, str],
    reporting: Mapping[str, str],
) -> dict[str, Any]:
    channels = []
    history_months = canonical.month_range("2021-01", origin)
    amount_by_mode: dict[str, Decimal] = defaultdict(Decimal)
    total_positive_by_month = [Decimal("0") for _ in history_months]
    total_reversal_by_month = [Decimal("0") for _ in history_months]
    own_positive_by_uid_month: dict[
        str, dict[str, Decimal]
    ] = defaultdict(lambda: defaultdict(Decimal))
    for (uid, _role, _mode), series in panel.get(work_id, {}).items():
        for month, amounts in series.items():
            if month <= origin:
                own_positive_by_uid_month[uid][month] += amounts["positive"]
    for (uid, role, mode), series in sorted(
        panel.get(work_id, {}).items()
    ):
        if not any(month <= origin for month in series):
            continue
        positive = []
        reversal = []
        net = []
        for index, month in enumerate(history_months):
            amounts = series.get(month)
            pos = (
                amounts["positive"]
                if amounts is not None
                else Decimal("0")
            )
            rev = (
                amounts["reversal"]
                if amounts is not None
                else Decimal("0")
            )
            amount = (
                amounts["net"]
                if amounts is not None
                else Decimal("0")
            )
            positive.append(float(pos))
            reversal.append(float(rev))
            net.append(float(amount))
            total_positive_by_month[index] += pos
            total_reversal_by_month[index] += rev
            amount_by_mode[mode] += pos
        trailing_positive = positive[-12:]
        peer_series = [
            max(
                Decimal("0"),
                platform_panel.get(uid, {}).get(month, Decimal("0"))
                - own_positive_by_uid_month[uid].get(month, Decimal("0")),
            )
            for month in history_months
        ]
        peer_recent6 = sum(peer_series[-6:], Decimal("0"))
        peer_previous6 = sum(peer_series[-12:-6], Decimal("0"))
        if peer_previous6 > 0:
            peer_trend = float(peer_recent6 / peer_previous6)
        elif peer_recent6 > 0:
            peer_trend = 2.0
        else:
            peer_trend = 1.0
        positive_indexes = [
            index for index, amount in enumerate(positive) if amount > 0
        ]
        channel_months_since_positive = (
            len(positive) - 1 - positive_indexes[-1]
            if positive_indexes
            else len(positive)
        )
        channels.append(
            {
                "channelUid": uid,
                "channelRole": role,
                "revenueMode": mode,
                "trailingAnnualPositive": sum(trailing_positive),
                "latestMonthPositive": trailing_positive[-1],
                "recent3AnnualPositive":
                    sum(trailing_positive[-3:]) / 3 * 12,
                "cumulativePositive": sum(positive),
                "cumulativeReversal": sum(reversal),
                "cumulativeNet": sum(net),
                "monthsSinceLastPositive": channel_months_since_positive,
                "peerRecent6Positive": float(peer_recent6),
                "peerPrevious6Positive": float(peer_previous6),
                "peerTrendRatio": peer_trend,
            }
        )
    if not channels:
        raise HumanAnchoredMaterializationError(
            "eligible history has no canonical channel"
        )
    active_last12 = sum(
        value > 0 for value in total_positive_by_month[-12:]
    )
    trailing_positive = sum(total_positive_by_month[-12:], Decimal("0"))
    historical_positive = sum(total_positive_by_month, Decimal("0"))
    if trailing_positive == 0 and historical_positive > 0:
        segment = "dormant"
    elif active_last12 <= 3:
        segment = "intermittent"
    else:
        segment = "active"
    dominant_mode = max(
        amount_by_mode.items(),
        key=lambda item: (item[1], item[0]),
    )[0]
    first = first_observed.get(work_id, "2021-01")
    observed_start = max("2021-01", first)
    observed_start_index = history_months.index(observed_start)
    work_positive_indexes = [
        index
        for index, amount in enumerate(total_positive_by_month)
        if amount > 0
    ]
    months_since_last_positive = (
        len(total_positive_by_month) - 1 - work_positive_indexes[-1]
        if work_positive_indexes
        else len(total_positive_by_month)
    )
    observed_age = (
        len(canonical.month_range(first, origin))
        if first <= origin
        else len(history_months)
    )
    return {
        "historyKey": f"{work_id}|{origin}",
        "standardWorkId": work_id,
        "origin": origin,
        "observedSalesAgeMonths": observed_age,
        "monthsSinceLastPositive": months_since_last_positive,
        "firstObservedSalesMonthMetadataOnly": first,
        "segment": segment,
        "dominantRevenueMode": dominant_mode,
        **reporting,
        "canonicalChannels": channels,
        "salesShareMonthlyHistory": {
            "startsAt": observed_start,
            "through": origin,
            "positiveSeries": [
                float(value)
                for value in total_positive_by_month[
                    observed_start_index:
                ]
            ],
            "reversalSeries": [
                float(value)
                for value in total_reversal_by_month[
                    observed_start_index:
                ]
            ],
            "observedZeroMonthsIncluded": True,
            "unobservedMonthsZeroFilled": False,
        },
        "cashHistoryWindowStart": "2021-01",
        "cashHistoryThroughOriginOnly": True,
        "pre2021CashAmountUsed": False,
        "categoryUsedForPrediction": False,
        "channelAttributesEffectiveAtProven": False,
    }


def _build_cases(
    *,
    origins: Iterable[str],
    horizons: Iterable[int],
    eligible_by_origin: Mapping[str, set[str]],
    history_by_key: Mapping[str, Mapping[str, Any]],
    panel: Mapping[str, Any],
    v03: Mapping[tuple[str, str, int], Mapping[str, Any]],
    label_end: str,
    case_family: str,
) -> list[dict[str, Any]]:
    output = []
    for origin in origins:
        for horizon in horizons:
            target_end = canonical.add_months(origin, int(horizon))
            if target_end > label_end:
                continue
            for work_id in sorted(eligible_by_origin[origin]):
                positive, reversal = _future_amounts(
                    panel,
                    work_id,
                    origin,
                    target_end,
                )
                history = history_by_key[f"{work_id}|{origin}"]
                previous = v03.get((work_id, origin, int(horizon)))
                output.append(
                    {
                        "caseFamily": case_family,
                        "standardWorkId": work_id,
                        "historyKey": history["historyKey"],
                        "origin": origin,
                        "horizonMonths": int(horizon),
                        "targetEnd": target_end,
                        "labelAvailableAsOf": target_end,
                        "segment": history["segment"],
                        "dominantRevenueMode":
                            history["dominantRevenueMode"],
                        "secondLevelCategoryReportingOnly":
                            history["secondLevelCategoryReportingOnly"],
                        "actualPositive": float(positive),
                        "actualReversal": float(reversal),
                        "actual": float(positive - reversal),
                        "v03PointEstimate": (
                            float(previous["candidatePointEstimate"])
                            if previous is not None
                            else None
                        ),
                        "v03ExactOverlap": previous is not None,
                        "unmaturedLabelZeroImputed": False,
                        "buyoutCashUsed": False,
                        "post2025TruthRead": False,
                    }
                )
    return output


def _future_amounts(
    panel: Mapping[str, Any],
    work_id: str,
    origin: str,
    target_end: str,
) -> tuple[Decimal, Decimal]:
    positive = Decimal("0")
    reversal = Decimal("0")
    for series in panel.get(work_id, {}).values():
        for month, amounts in series.items():
            if origin < month <= target_end:
                positive += amounts["positive"]
                reversal += amounts["reversal"]
    return positive, reversal


def _write_channel_expert_supplement(
    *,
    output_dir: Path,
    channel_config: Mapping[str, Any],
    base_manifest: Mapping[str, Any],
    primary: list[Mapping[str, Any]],
    auxiliary: list[Mapping[str, Any]],
    history_by_key: Mapping[str, Mapping[str, Any]],
    panel: Mapping[str, Any],
) -> None:
    _validate_channel_expert_config(channel_config)
    platform_by_uid = {
        canonical.canonical_uid(
            str(platform["canonicalChannelName"]),
            "m2-current-channel-uid-v0.1",
        ): str(platform["platformId"])
        for platform in channel_config["platformModels"]
    }
    if len(platform_by_uid) != len(channel_config["platformModels"]):
        raise HumanAnchoredMaterializationError(
            "channel expert platform identities are duplicated"
        )
    primary_rows = _build_work_channel_supplement(
        primary,
        history_by_key,
        panel,
        platform_by_uid,
    )
    auxiliary_rows = _build_work_channel_supplement(
        auxiliary,
        history_by_key,
        panel,
        platform_by_uid,
    )
    primary_bytes = _encode_ndjson(primary_rows)
    auxiliary_bytes = _encode_ndjson(auxiliary_rows)
    outputs = channel_config["privateOutputs"]
    (output_dir / outputs["primaryWorkChannelCases"]).write_bytes(
        primary_bytes
    )
    (output_dir / outputs["auxiliaryWorkChannelCases"]).write_bytes(
        auxiliary_bytes
    )
    all_rows = [*primary_rows, *auxiliary_rows]
    labels = [
        label
        for row in all_rows
        for label in row["workChannelLabels"]
    ]
    platform_counts = Counter(
        {
            str(platform["platformId"]): 0
            for platform in channel_config["platformModels"]
        }
    )
    platform_counts.update(
        label["platformId"]
        for label in labels
        if label["observedAtOrigin"]
        and label["platformId"] != "other_platform"
    )
    manifest = {
        "schema":
            "m2.current.channel_expert_materialization_private.v0.1",
        "tracked": False,
        "candidateId": channel_config["candidateId"],
        "target": "future_sales_share_cash",
        "baseDatasetDigests": dict(base_manifest["digests"]),
        "primaryCaseRowCount": len(primary_rows),
        "auxiliaryCaseRowCount": len(auxiliary_rows),
        "workChannelLabelRowCount": len(labels),
        "predictionEligibleObservedChannelLabelCount": sum(
            label["observedAtOrigin"] for label in labels
        ),
        "futureFirstSeenLabelOnlyCount": sum(
            not label["observedAtOrigin"] for label in labels
        ),
        "namedPlatformObservedLabelCounts":
            dict(sorted(platform_counts.items())),
        "namedPlatformConfiguredCount":
            len(channel_config["platformModels"]),
        "primarySha256": hashlib.sha256(primary_bytes).hexdigest(),
        "auxiliarySha256":
            hashlib.sha256(auxiliary_bytes).hexdigest(),
        "dataQuality": {
            "caseGrain":
                "work_origin_horizon_with_channel_label_array",
            "channelLabelGrain":
                "work_origin_horizon_canonical_channel",
            "duplicateCaseKeyCount": 0,
            "workChannelPositiveConservationDifference": 0,
            "workChannelReversalConservationDifference": 0,
            "workChannelNetConservationDifference": 0,
            "futureFirstSeenIdentityUsedAsFeature": False,
            "unmaturedLabelZeroImputationCount": 0,
            "buyoutCashUsed": False,
            "pre2021CashAmountUsed": False,
            "post2025CashAmountUsed": False,
        },
        "featurePolicy": {
            "canonicalChannelIdentity": "static_user_confirmed",
            "monetizationMechanism": "static_user_confirmed",
            "intrinsicWorkCategory": "development_only",
            "futureFirstSeenChannel":
                "label_only_zero_prediction_no_identity_feature",
        },
        "independentLaterOriginOpened": False,
        "finalHoldoutOpened": False,
        "providerUsed": False,
        "databaseRead": False,
    }
    (output_dir / outputs["materializationManifest"]).write_text(
        json.dumps(
            manifest,
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
            allow_nan=False,
        )
        + "\n",
        encoding="utf-8",
    )


def _validate_channel_expert_config(
    config: Mapping[str, Any]
) -> None:
    authorization = config.get("authorization", {})
    contract = config.get("dataContract", {})
    if (
        config.get("schema")
        != "m2.current.channel_expert_development.v0.1"
        or config.get("target") != "future_sales_share_cash"
        or authorization.get("localPrivateDevelopmentTraining") is not True
        or authorization.get("boundedNestedSelection") is not True
        or authorization.get(
            "canonicalChannelIdentityStaticFeature"
        ) is not True
        or authorization.get(
            "userConfirmedMonetizationMechanismStaticFeature"
        ) is not True
        or authorization.get(
            "intrinsicWorkCategoryStaticFeature"
        ) is not True
        or any(
            authorization.get(key) is not False
            for key in (
                "productionModelModification",
                "exactV03Replacement",
                "independentLaterOrigin",
                "finalHoldout",
                "provider",
                "database",
                "canary",
                "release",
                "m3Formal",
            )
        )
        or contract.get("workChannelConservationRequired") is not True
        or contract.get("buyoutCashUsed") is not False
        or contract.get("pre2021CashAmountUsed") is not False
        or contract.get("post2025CashAmountUsed") is not False
    ):
        raise HumanAnchoredMaterializationError(
            "channel expert authorization or data boundary differs"
        )


def _build_work_channel_supplement(
    cases: Iterable[Mapping[str, Any]],
    histories: Mapping[str, Mapping[str, Any]],
    panel: Mapping[str, Any],
    platform_by_uid: Mapping[str, str],
) -> list[dict[str, Any]]:
    output = []
    seen: set[tuple[str, str, int]] = set()
    for row in cases:
        work_id = str(row["standardWorkId"])
        origin = str(row["origin"])
        horizon = int(row["horizonMonths"])
        key = (work_id, origin, horizon)
        if key in seen:
            raise HumanAnchoredMaterializationError(
                "channel expert supplemental case key is duplicated"
            )
        seen.add(key)
        history = histories[str(row["historyKey"])]
        observed_uids = {
            str(channel["channelUid"])
            for channel in history["canonicalChannels"]
        }
        labels_by_uid: dict[str, dict[str, Any]] = {}
        for (uid, role, mode), series in panel.get(work_id, {}).items():
            positive = Decimal("0")
            reversal = Decimal("0")
            for month, amounts in series.items():
                if origin < month <= row["targetEnd"]:
                    positive += amounts["positive"]
                    reversal += amounts["reversal"]
            if (
                uid not in observed_uids
                and positive == 0
                and reversal == 0
            ):
                continue
            previous = labels_by_uid.get(uid)
            if previous is not None and (
                previous["channelRole"] != role
                or previous["revenueMode"] != mode
            ):
                raise HumanAnchoredMaterializationError(
                    "canonical channel static attributes conflict in panel"
                )
            labels_by_uid[uid] = {
                "channelUid": uid,
                "channelRole": role,
                "revenueMode": mode,
                "platformId":
                    platform_by_uid.get(uid, "other_platform"),
                "observedAtOrigin": uid in observed_uids,
                "actualPositive": float(positive),
                "actualReversal": float(reversal),
                "actual": float(positive - reversal),
            }
        labels = [
            labels_by_uid[uid]
            for uid in sorted(labels_by_uid)
        ]
        positive_total = sum(
            (Decimal(str(label["actualPositive"])) for label in labels),
            Decimal("0"),
        )
        reversal_total = sum(
            (Decimal(str(label["actualReversal"])) for label in labels),
            Decimal("0"),
        )
        net_total = sum(
            (Decimal(str(label["actual"])) for label in labels),
            Decimal("0"),
        )
        if (
            not math.isclose(
                float(positive_total),
                float(row["actualPositive"]),
                rel_tol=0,
                abs_tol=1e-7,
            )
            or not math.isclose(
                float(reversal_total),
                float(row["actualReversal"]),
                rel_tol=0,
                abs_tol=1e-7,
            )
            or not math.isclose(
                float(net_total),
                float(row["actual"]),
                rel_tol=0,
                abs_tol=1e-7,
            )
        ):
            raise HumanAnchoredMaterializationError(
                "work-channel label conservation failed"
            )
        output.append(
            {
                "caseKey": {
                    "standardWorkId": work_id,
                    "origin": origin,
                    "horizonMonths": horizon,
                },
                "workChannelLabels": labels,
                "futureFirstSeenIdentityUsedAsFeature": False,
                "unmaturedLabelZeroImputed": False,
                "buyoutCashUsed": False,
            }
        )
    return output


def _write_channel_generative_supplement(
    *,
    output_dir: Path,
    generative_config: Mapping[str, Any],
    base_manifest: Mapping[str, Any],
    primary: list[Mapping[str, Any]],
    auxiliary: list[Mapping[str, Any]],
    history_by_key: Mapping[str, Mapping[str, Any]],
    panel: Mapping[str, Any],
    output_files: Mapping[str, str] | None = None,
) -> dict[str, Any]:
    _validate_channel_generative_config(generative_config)
    primary_rows = _build_channel_generative_rows(
        primary,
        history_by_key,
        panel,
        "primary",
    )
    auxiliary_rows = _build_channel_generative_rows(
        auxiliary,
        history_by_key,
        panel,
        "strict",
    )
    primary_bytes = _encode_ndjson(primary_rows)
    auxiliary_bytes = _encode_ndjson(auxiliary_rows)
    outputs = output_files or generative_config["privateOutputs"]
    _write_new_private_bytes(
        output_dir / outputs["primaryMonthlyCases"],
        primary_bytes,
    )
    _write_new_private_bytes(
        output_dir / outputs["auxiliaryMonthlyCases"],
        auxiliary_bytes,
    )
    monthly_label_count = sum(
        len(row["futureMonthlyLabels"])
        for rows in (primary_rows, auxiliary_rows)
        for row in rows
    )
    publishing_scale = (
        generative_config.get("schema")
        == "m2.current.publishing_scale_channel_core.v0.1"
    )
    manifest = {
        "schema": (
            "m2.current.publishing_scale_channel_"
            "materialization_private.v0.2"
            if publishing_scale
            else "m2.current.channel_generative_materialization_private.v0.2"
        ),
        "tracked": False,
        "modelId": (
            generative_config.get("modelId")
            if publishing_scale
            else None
        ),
        "experimentArmId": (
            generative_config.get("experimentArmId")
            if publishing_scale
            else None
        ),
        "candidateId": (
            "M2-CHAN-PSC01-RAW"
            if publishing_scale
            else generative_config["candidateId"]
        ),
        "materializerId": (
            generative_config.get("materializerId")
            if publishing_scale
            else "M2-MATERIALIZER-CHANNEL-GENERATIVE-V02"
        ),
        "target": generative_config["target"],
        "actualDefinitionId": generative_config["actualDefinitionId"],
        "labelMaterializationStage":
            (
                "POSTING_TIME_INTERMEDIATE_REBOUND_IN_MEMORY_"
                "BEFORE_PSC01_FIT"
                if publishing_scale
                else
                "POSTING_TIME_INTERMEDIATE_REBOUND_IN_MEMORY_BEFORE_G1_FIT"
            ),
        "baseDatasetDigests": dict(base_manifest["digests"]),
        "sourceArtifacts": {
            "historicalChannelGenerativeArtifactsRead": False,
            "historicalChannelGenerativeAuthorizationChecked": False,
            "historicalFrozenComparator": {
                "sourceArtifact": True,
                "readOnly": True,
                "overwritten": False,
            },
        },
        "primaryPackedRowCount": len(primary_rows),
        "auxiliaryPackedRowCount": len(auxiliary_rows),
        "monthlyLabelRowCount": monthly_label_count,
        "monthlyUniqueKeyCount": monthly_label_count,
        "predictionEligibleObservedPackedRowCount": sum(
            row["observedAtOrigin"]
            for rows in (primary_rows, auxiliary_rows)
            for row in rows
        ),
        "futureFirstSeenPackedRowCount": sum(
            not row["observedAtOrigin"]
            for rows in (primary_rows, auxiliary_rows)
            for row in rows
        ),
        "primarySha256": hashlib.sha256(primary_bytes).hexdigest(),
        "auxiliarySha256": hashlib.sha256(auxiliary_bytes).hexdigest(),
        "dataQuality": {
            "trainingGrain":
                "work_channel_origin_future_month",
            "overlappingHorizonDuplicateCount": 0,
            "trainingWeight": (
                generative_config.get("dataContract", {}).get(
                    "trainingWeight"
                )
                if publishing_scale
                else "one_per_monthly_row"
            ),
            "monthlyRowsAreIndependentWorks": False,
            "positiveConservationDifference": 0,
            "reversalConservationDifference": 0,
            "netConservationDifference": 0,
            "futureFirstSeenIdentityUsedAsFeature": False,
            "unmaturedLabelZeroImputationCount": 0,
            "unobservedPreStartMonthZeroImputationCount": 0,
            "observedZeroMonthsIncluded": True,
            "buyoutCashUsed": False,
            "pre2021CashAmountUsed": False,
            "post2025CashAmountUsed": False,
        },
        "featurePolicy": {
            "allowlistOnly": True,
            "platformFeatureUsed": False,
            "taxonomyFeatureUsed": False,
            "peerTrendFeatureUsed": False,
            "actualPredictionRatioUsed": False,
        },
        "independentLaterOriginOpened": False,
        "finalHoldoutOpened": False,
        "providerUsed": False,
        "databaseRead": False,
    }
    _write_new_private_text(
        output_dir / outputs["materializationManifest"],
        json.dumps(
            manifest,
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
            allow_nan=False,
        )
        + "\n",
    )
    return manifest


def _validate_channel_generative_config(
    config: Mapping[str, Any]
) -> None:
    if (
        config.get("schema")
        == "m2.current.publishing_scale_channel_core.v0.1"
    ):
        _validate_publishing_scale_channel_config(config)
        return
    authorization = config.get("authorization", {})
    contract = config.get("dataContract", {})
    if (
        config.get("schema")
        != "m2.current.channel_generative_core.v0.2"
        or config.get("target")
        != "future_sales_share_development_modelable_cash"
        or config.get("actualDefinitionId")
        != "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01"
        or authorization.get("coreImplementation") is not True
        or authorization.get(
            "oneTimePrivateDevelopmentEvaluation"
        ) is not True
        or authorization.get("authorizedModelId") != "M2-CHAN-GEN02"
        or authorization.get("authorizedArmId")
        != "M2-EXP-CHANNEL-GENERATIVE-02/G1"
        or authorization.get("G1IndependentCoreTraining") is not True
        or authorization.get("G1PrivateDevelopmentEvaluation") is not True
        or authorization.get("G2StructuredOffset") is not False
        or authorization.get("G3Blend") is not False
        or any(
            authorization.get(key) is not False
            for key in (
                "G4Platform",
                "G5Taxonomy",
                "G6Composition",
                "newModelFamily",
                "outcomeDrivenTuning",
                "laterOriginHoldout",
                "finalHoldout",
                "provider",
                "database",
                "canary",
                "full160",
                "automation",
                "production",
                "exactV03Replacement",
                "release",
                "mergePr",
            )
        )
        or contract.get("monthlyTrainingWeight") != 1
        or contract.get("futureFirstSeenPrediction") != 0
        or contract.get("buyoutCashUsed") is not False
        or contract.get("otherCashUsed") is not False
        or contract.get("commitmentUsed") is not False
        or contract.get("labelView")
        != "DEVELOPMENT_MODELABLE_RESTATEMENT_VIEW"
    ):
        raise HumanAnchoredMaterializationError(
            "channel generative authorization or data boundary differs"
        )


def _validate_publishing_scale_channel_config(
    config: Mapping[str, Any]
) -> None:
    authorization = config.get("authorization", {})
    execution = config.get("currentExecution", {})
    contract = config.get("dataContract", {})
    if (
        config.get("schema")
        != "m2.current.publishing_scale_channel_core.v0.1"
        or config.get("modelId") != "M2-CHAN-PSC01"
        or config.get("experimentArmId")
        != "M2-EXP-PUBLISHING-SCALE-CHANNEL-01/CORE"
        or config.get("target")
        != "future_sales_share_development_modelable_cash"
        or config.get("actualDefinitionId")
        != "M2-ACTUAL-DEVELOPMENT-MODELABLE-RESTATEMENT-01"
        or config.get("executionPolicy")
        != "config/m2-publishing-scale-execution-policy.v0.2.json"
        or config.get("materializerId")
        != "M2-MATERIALIZER-PUBLISHING-SCALE-CHANNEL-01"
        or config.get("receiptControllerId")
        != "M2-RECEIPT-CONTROLLER-PUBLISHING-SCALE-CHANNEL-01"
        or authorization.get("oneTimePrivateDevelopmentEvaluation")
        is not False
        or authorization.get("authorizedModelId") != "M2-CHAN-PSC01"
        or authorization.get("authorizedArmId")
        != "M2-EXP-PUBLISHING-SCALE-CHANNEL-01/CORE"
        or authorization.get("retryAuthorized") is not False
        or any(
            authorization.get(key) is not False
            for key in (
                "outcomeDrivenTuning",
                "laterOriginHoldout",
                "finalHoldout",
                "provider",
                "database",
                "canary",
                "full160",
                "automation",
                "production",
                "release",
                "mergePr",
            )
        )
        or execution.get("privateExecutionAuthorizationConsumed") is not True
        or execution.get("candidateFitStarted") is not False
        or execution.get("candidateOutputProduced") is not False
        or contract.get("trainingWeight")
        != "equal_total_weight_per_standard_work"
        or contract.get("monthlyRowsAreIndependentWorks") is not False
        or contract.get("futureFirstSeenPrediction") != 0
        or contract.get("taxonomyAsOfStatus") != "REPORT_ONLY"
        or contract.get("authorizationAsOfStatus") != "REPORT_ONLY"
        or contract.get("currentOnlyTaxonomyBackfill") is not False
        or contract.get("currentOnlyAuthorizationBackfill") is not False
        or contract.get("buyoutCashUsed") is not False
        or contract.get("otherCashUsed") is not False
        or contract.get("commitmentUsed") is not False
        or contract.get("labelView")
        != "DEVELOPMENT_MODELABLE_RESTATEMENT_VIEW"
    ):
        raise HumanAnchoredMaterializationError(
            "publishing-scale channel authorization or data boundary differs"
        )


def _validate_publishing_scale_execution_policy(
    policy: Mapping[str, Any]
) -> None:
    if (
        policy.get("schema")
        != "m2.publishing_scale.execution_policy.v0.2"
        or policy.get("status")
        != "USER_AUTHORIZED_RUNTIME_EXACT_HEAD_BINDING_REQUIRED"
        or policy.get("authorizedModelId") != "M2-CHAN-PSC01"
        or policy.get("authorizedArmId")
        != "M2-EXP-PUBLISHING-SCALE-CHANNEL-01/CORE"
        or policy.get("authorizedCommand")
        != "npm run develop:m2:current:publishing-scale-channel"
        or policy.get("runtimeBinding", {}).get("exactHeadRequired")
        is not True
        or policy.get("runtimeBinding", {}).get(
            "bothChecksMustSucceedBeforePrivateRead"
        )
        is not True
        or policy.get("historicalAuthorization", {}).get(
            "historicalConsumedFieldsMayBeRewritten"
        )
        is not False
        or policy.get("executionWindow", {}).get(
            "normalPrivateExecutionMaximum"
        )
        != 1
        or policy.get("executionWindow", {}).get(
            "infrastructureRecoveryRetryMaximum"
        )
        != 1
    ):
        raise HumanAnchoredMaterializationError(
            "publishing-scale execution policy differs"
        )


def _prepare_publishing_scale_private_materialization(
    *,
    output_dir: Path,
    config: Mapping[str, Any],
    policy: Mapping[str, Any],
    execution_authorization_file: str | None,
    run_receipt_file: str | None,
) -> tuple[Path, Mapping[str, str]]:
    for value in (execution_authorization_file, run_receipt_file):
        if (
            not value
            or Path(value).name != value
            or "/" in value
            or "\\" in value
        ):
            raise HumanAnchoredMaterializationError(
                "publishing-scale execution artifact filename invalid"
            )
    authorization_prefix = Path(
        config["privateOutputs"]["runtimeAuthorization"]
    ).stem
    receipt_prefix = config["privateOutputs"]["runReceiptPrefix"]
    if (
        not execution_authorization_file.startswith(
            authorization_prefix + "-"
        )
        or not run_receipt_file.startswith(receipt_prefix + "-")
    ):
        raise HumanAnchoredMaterializationError(
            "publishing-scale execution artifact identity invalid"
        )
    authorization_path = output_dir / execution_authorization_file
    receipt_path = output_dir / run_receipt_file
    authorization = json.loads(
        authorization_path.read_text(encoding="utf-8")
    )
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    output_files = receipt.get("outputFiles")
    _validate_publishing_scale_output_files(config, output_files)
    head = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
        shell=False,
    ).stdout.strip()
    if (
        authorization.get("schema")
        != "m2.publishing_scale.runtime_execution_authorization.private.v0.2"
        or authorization.get("status")
        != "ACTIVE_FOR_ONE_LOGICAL_EXECUTION_WINDOW"
        or authorization.get("authorizationPolicyId")
        != policy.get("authorizationPolicyId")
        or authorization.get("authorizedModelId") != "M2-CHAN-PSC01"
        or authorization.get("authorizedArmId")
        != "M2-EXP-PUBLISHING-SCALE-CHANNEL-01/CORE"
        or authorization.get("exactHead") != head
        or authorization.get("finalHoldoutAuthorized") is not False
        or authorization.get("productionAuthorized") is not False
        or authorization.get("mergeAuthorized") is not False
        or receipt.get("schema")
        != "m2.current.publishing_scale_channel_run_receipt_private.v0.2"
        or receipt.get("status")
        != "PREPARED_BEFORE_PRIVATE_MATERIALIZATION"
        or receipt.get("runtimeAuthorizationFile")
        != execution_authorization_file
        or receipt.get("implementationCommit") != head
        or receipt.get("modelId") != "M2-CHAN-PSC01"
        or receipt.get("experimentArmId")
        != "M2-EXP-PUBLISHING-SCALE-CHANNEL-01/CORE"
        or receipt.get("materializerId")
        != "M2-MATERIALIZER-PUBLISHING-SCALE-CHANNEL-01"
        or receipt.get("candidateFitStarted") is not False
        or int(receipt.get("predictionRowsProduced", -1)) != 0
        or int(receipt.get("evaluationRowsProduced", -1)) != 0
    ):
        raise HumanAnchoredMaterializationError(
            "publishing-scale runtime authorization or receipt differs"
        )
    _update_private_receipt(
        receipt_path,
        status="PRIVATE_MATERIALIZATION_STARTED_BEFORE_INPUT_READ",
        privateMaterializationStarted=True,
        privateRowsRead=0,
    )
    return receipt_path, output_files


def _validate_publishing_scale_output_files(
    config: Mapping[str, Any],
    output_files: Any,
) -> None:
    required = (
        "primaryMonthlyCases",
        "auxiliaryMonthlyCases",
        "materializationManifest",
        "evaluationRows",
        "evaluationManifest",
    )
    if not isinstance(output_files, dict) or set(output_files) != set(required):
        raise HumanAnchoredMaterializationError(
            "publishing-scale versioned output plan invalid"
        )
    for key in required:
        value = output_files.get(key)
        base = config["privateOutputs"][key]
        if (
            not isinstance(value, str)
            or Path(value).name != value
            or "/" in value
            or "\\" in value
            or not value.startswith(Path(base).stem + "-")
            or Path(value).suffix != Path(base).suffix
        ):
            raise HumanAnchoredMaterializationError(
                "publishing-scale versioned output identity invalid"
            )


def _write_new_private_bytes(file_path: Path, value: bytes) -> None:
    with file_path.open("xb") as handle:
        handle.write(value)


def _write_new_private_text(file_path: Path, value: str) -> None:
    with file_path.open("x", encoding="utf-8", newline="\n") as handle:
        handle.write(value)


def _update_private_receipt(
    receipt_path: Path,
    *,
    status: str,
    **updates: Any,
) -> None:
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    receipt.update(updates)
    receipt["status"] = status
    receipt_path.write_text(
        json.dumps(
            receipt,
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
            allow_nan=False,
        )
        + "\n",
        encoding="utf-8",
    )


def _publishing_scale_preflight() -> dict[str, Any]:
    config = json.loads(
        PUBLISHING_SCALE_CHANNEL_CONFIG_PATH.read_text(encoding="utf-8")
    )
    support = json.loads(
        PUBLISHING_SCALE_SUPPORT_PATH.read_text(encoding="utf-8")
    )
    policy = json.loads(
        PUBLISHING_SCALE_EXECUTION_POLICY_PATH.read_text(encoding="utf-8")
    )
    _validate_publishing_scale_channel_config(config)
    _validate_publishing_scale_execution_policy(policy)
    if (
        support.get("contractId") != "M2-PUBLISHING-SCALE-SUPPORT-01"
        or support.get("currentFreezeDecision", {}).get(
            "directFitNodeCount"
        )
        != 0
        or support.get("parameterFreeze", {}).get("taxonomy")
        != "REPORT_ONLY"
        or support.get("parameterFreeze", {}).get("authorization")
        != "REPORT_ONLY"
    ):
        raise HumanAnchoredMaterializationError(
            "publishing-scale support preflight differs"
        )
    return {
        "status": "READY",
        "modelId": config["modelId"],
        "experimentArmId": config["experimentArmId"],
        "materializerId": config["materializerId"],
        "legacyAuthorizationChecked": False,
        "privateArtifactRowsRead": 0,
        "privateOutputWrites": 0,
    }


def _publishing_scale_config_self_test() -> dict[str, Any]:
    config = json.loads(
        PUBLISHING_SCALE_CHANNEL_CONFIG_PATH.read_text(encoding="utf-8")
    )
    _validate_publishing_scale_channel_config(config)
    return {
        "modelId": config["modelId"],
        "experimentArmId": config["experimentArmId"],
        "publishingScaleConfigBoundaryValidated": True,
        "privateArtifactRead": False,
    }


def _build_channel_generative_rows(
    cases: Iterable[Mapping[str, Any]],
    histories: Mapping[str, Mapping[str, Any]],
    panel: Mapping[str, Any],
    evaluation_family: str,
) -> list[dict[str, Any]]:
    case_groups: dict[
        tuple[str, str], list[Mapping[str, Any]]
    ] = defaultdict(list)
    for row in cases:
        case_groups[
            (str(row["standardWorkId"]), str(row["origin"]))
        ].append(row)
    output: list[dict[str, Any]] = []
    for (work_id, origin), group in sorted(case_groups.items()):
        group_output_start = len(output)
        horizons = sorted({int(row["horizonMonths"]) for row in group})
        maximum_horizon = max(horizons)
        by_horizon = {
            int(row["horizonMonths"]): row for row in group
        }
        if len(by_horizon) != len(group):
            raise HumanAnchoredMaterializationError(
                "channel generative case horizon is duplicated"
            )
        history = histories[f"{work_id}|{origin}"]
        channel_static: dict[str, tuple[str, str]] = {}
        channel_series: dict[str, Mapping[str, Any]] = {}
        for (uid, role, mode), series in panel.get(work_id, {}).items():
            previous = channel_static.get(uid)
            if previous is not None and previous != (role, mode):
                raise HumanAnchoredMaterializationError(
                    "canonical channel static attributes conflict in panel"
                )
            channel_static[uid] = (role, mode)
            channel_series[uid] = series
        observed_uids = {
            uid
            for uid, series in channel_series.items()
            if any(
                month <= origin and amounts["positive"] > 0
                for month, amounts in series.items()
            )
        }
        trailing_by_uid = {
            uid: _channel_trailing_positive(series, origin, 12)
            for uid, series in channel_series.items()
            if uid in observed_uids
        }
        ranked = sorted(
            observed_uids,
            key=lambda uid: (-trailing_by_uid[uid], uid),
        )
        denominator = max(len(ranked) - 1, 1)
        rank_percentile = {
            uid: index / denominator
            for index, uid in enumerate(ranked)
        }
        work_trailing = sum(
            trailing_by_uid.values(),
            Decimal("0"),
        )
        future_uids = {
            uid
            for uid, series in channel_series.items()
            if any(
                origin < month
                <= canonical.add_months(origin, maximum_horizon)
                and (
                    amounts["positive"] > 0
                    or amounts["reversal"] > 0
                )
                for month, amounts in series.items()
            )
        }
        for uid in sorted(observed_uids | future_uids):
            observed = uid in observed_uids
            role, mode = channel_static[uid]
            features = (
                _channel_generative_features(
                    channel_series[uid],
                    origin,
                    int(history["observedSalesAgeMonths"]),
                    work_trailing,
                    rank_percentile[uid],
                )
                if observed
                else None
            )
            labels = []
            for future_month_index in range(1, maximum_horizon + 1):
                included = [
                    horizon
                    for horizon in horizons
                    if horizon >= future_month_index
                ]
                if not included:
                    continue
                future_month = canonical.add_months(
                    origin,
                    future_month_index,
                )
                amounts = channel_series[uid].get(
                    future_month,
                    {
                        "positive": Decimal("0"),
                        "reversal": Decimal("0"),
                        "net": Decimal("0"),
                    },
                )
                labels.append(
                    {
                        "futureMonthIndex": future_month_index,
                        "futureMonth": future_month,
                        "labelAvailableAsOf": future_month,
                        "actualPositive": float(amounts["positive"]),
                        "actualReversal": float(amounts["reversal"]),
                        "actual": float(amounts["net"]),
                        "includedHorizons": included,
                    }
                )
            output.append(
                {
                    "schema":
                        "m2.current.channel_generative_packed_private.v0.2",
                    "evaluationFamily": evaluation_family,
                    "standardWorkId": work_id,
                    "channelUid": uid,
                    "origin": origin,
                    "channelRole": role,
                    "revenueMode": mode,
                    "mechanism": _mechanism_parent(mode),
                    "observedAtOrigin": observed,
                    "features": features,
                    "futureMonthlyLabels": labels,
                    "horizonMonths": horizons,
                    "operationalFallbackPointByHorizon": {
                        str(horizon): (
                            float(by_horizon[horizon]["v03PointEstimate"])
                            if by_horizon[horizon]["v03PointEstimate"]
                            is not None
                            else None
                        )
                        for horizon in horizons
                    },
                    "reversalRateByHorizon": {},
                    "futureFirstSeenIdentityUsedAsFeature": False,
                    "unmaturedLabelZeroImputed": False,
                    "buyoutCashUsed": False,
                }
            )
        _validate_channel_generative_conservation(
            output[group_output_start:],
            work_id,
            origin,
            by_horizon,
        )
    return output


def _channel_trailing_positive(
    series: Mapping[str, Mapping[str, Decimal]],
    origin: str,
    count: int,
) -> Decimal:
    months = canonical.month_range(
        canonical.add_months(origin, -(count - 1)),
        origin,
    )
    return sum(
        (
            series.get(month, {}).get("positive", Decimal("0"))
            for month in months
        ),
        Decimal("0"),
    )


def _channel_generative_features(
    series: Mapping[str, Mapping[str, Decimal]],
    origin: str,
    observed_work_age: int,
    work_trailing_12: Decimal,
    rank_percentile: float,
) -> dict[str, float]:
    first_positive = min(
        month
        for month, amounts in series.items()
        if month <= origin and amounts["positive"] > 0
    )
    months = canonical.month_range(first_positive, origin)
    values = [
        float(
            series.get(month, {}).get("positive", Decimal("0"))
        )
        for month in months
    ]
    recent3 = values[-3:]
    previous3 = values[-6:-3]
    recent12 = values[-12:]
    positive_indexes = [
        index for index, value in enumerate(values) if value > 0
    ]
    peak = max(values)
    latest_peak = max(
        index for index, value in enumerate(values) if value == peak
    )
    logs = [math.log1p(value) for value in recent12]
    log_mean = sum(logs) / len(logs)
    volatility = math.sqrt(
        sum((value - log_mean) ** 2 for value in logs) / len(logs)
    )
    channel_trailing = Decimal(str(sum(recent12)))
    return {
        "log_recent_1_positive": math.log1p(sum(values[-1:])),
        "log_recent_3_positive": math.log1p(sum(recent3)),
        "log_recent_12_positive": math.log1p(sum(recent12)),
        "log_cumulative_positive": math.log1p(sum(values)),
        "positive_rate_3":
            sum(value > 0 for value in recent3) / len(recent3),
        "positive_rate_12":
            sum(value > 0 for value in recent12) / len(recent12),
        "log_recent_3_vs_previous_3": (
            0.0
            if len(values) < 4
            else math.log1p(sum(recent3))
            - math.log1p(sum(previous3))
        ),
        "previous_3_available": 1.0 if len(values) >= 4 else 0.0,
        "log_positive_volatility_12": volatility,
        "months_since_last_positive_scaled":
            min(len(values) - 1 - positive_indexes[-1], 36) / 36,
        "log_historical_peak_positive": math.log1p(peak),
        "months_since_peak_scaled":
            min(len(values) - 1 - latest_peak, 36) / 36,
        "log_observed_channel_age": math.log1p(len(values)),
        "log_observed_work_age": math.log1p(observed_work_age),
        "trailing_12_work_share": (
            0.0
            if work_trailing_12 == 0
            else float(channel_trailing / work_trailing_12)
        ),
        "channel_rank_percentile": rank_percentile,
        "available_month_fraction_3": min(len(values), 3) / 3,
        "available_month_fraction_12": min(len(values), 12) / 12,
    }


def _mechanism_parent(revenue_mode: str) -> str:
    return {
        "membership_subscription": "membership",
        "advertising_or_free_share": "advertising",
        "single_purchase_or_on_demand": "transactional",
    }.get(revenue_mode, "other")


def _validate_channel_generative_conservation(
    rows: Iterable[Mapping[str, Any]],
    work_id: str,
    origin: str,
    cases: Mapping[int, Mapping[str, Any]],
) -> None:
    selected = [
        row
        for row in rows
        if row["standardWorkId"] == work_id and row["origin"] == origin
    ]
    for horizon, case in cases.items():
        labels = [
            label
            for row in selected
            for label in row["futureMonthlyLabels"]
            if horizon in label["includedHorizons"]
        ]
        positive = sum(label["actualPositive"] for label in labels)
        reversal = sum(label["actualReversal"] for label in labels)
        net = sum(label["actual"] for label in labels)
        if not (
            math.isclose(
                positive,
                float(case["actualPositive"]),
                rel_tol=0,
                abs_tol=1e-7,
            )
            and math.isclose(
                reversal,
                float(case["actualReversal"]),
                rel_tol=0,
                abs_tol=1e-7,
            )
            and math.isclose(
                net,
                float(case["actual"]),
                rel_tol=0,
                abs_tol=1e-7,
            )
        ):
            raise HumanAnchoredMaterializationError(
                "channel generative monthly conservation failed"
            )


def _validate_cases(
    cases: Iterable[Mapping[str, Any]],
    histories: Mapping[str, Mapping[str, Any]],
    config: Mapping[str, Any],
) -> None:
    seen: set[tuple[str, str, int]] = set()
    for row in cases:
        key = (
            str(row["standardWorkId"]),
            str(row["origin"]),
            int(row["horizonMonths"]),
        )
        if key in seen:
            raise HumanAnchoredMaterializationError(
                "human-anchored case key is duplicated"
            )
        seen.add(key)
        history = histories.get(row["historyKey"])
        monthly = (
            history.get("salesShareMonthlyHistory", {})
            if history is not None
            else {}
        )
        positive_series = monthly.get("positiveSeries", [])
        reversal_series = monthly.get("reversalSeries", [])
        if (
            history is None
            or row["labelAvailableAsOf"] != row["targetEnd"]
            or row["labelAvailableAsOf"]
            > config["dataContract"]["featureAndLabelWindowEnd"]
            or monthly.get("through") != row["origin"]
            or monthly.get("observedZeroMonthsIncluded") is not True
            or monthly.get("unobservedMonthsZeroFilled") is not False
            or not positive_series
            or len(positive_series) != len(reversal_series)
            or any(float(value) < 0 for value in positive_series)
            or any(float(value) < 0 for value in reversal_series)
            or not math.isclose(
                float(row["actual"]),
                float(row["actualPositive"])
                - float(row["actualReversal"]),
                rel_tol=0,
                abs_tol=1e-8,
            )
        ):
            raise HumanAnchoredMaterializationError(
                "human-anchored case integrity failed"
            )


def _manifest(
    config: Mapping[str, Any],
    inputs: Mapping[str, Any],
    mapping_audit: Mapping[str, Any],
    master_evidence: Mapping[str, Any],
    histories: list[Mapping[str, Any]],
    primary: list[Mapping[str, Any]],
    auxiliary: list[Mapping[str, Any]],
    history_bytes: bytes,
    primary_bytes: bytes,
    auxiliary_bytes: bytes,
    source_bill: Any,
    modern_rows: list[Mapping[str, Any]],
) -> dict[str, Any]:
    modern_work_ids = {
        str(row["standardWorkId"]) for row in modern_rows
    }
    primary_work_ids = {
        str(row["standardWorkId"]) for row in primary
    }
    auxiliary_work_ids = {
        str(row["standardWorkId"]) for row in auxiliary
    }
    primary_origin_counts = Counter(row["origin"] for row in primary)
    auxiliary_origin_counts = Counter(row["origin"] for row in auxiliary)
    auxiliary_horizon_counts = Counter(
        str(row["horizonMonths"]) for row in auxiliary
    )
    segment_counts = Counter(row["segment"] for row in histories)
    mode_counts = Counter(row["dominantRevenueMode"] for row in histories)
    category_counts = Counter(
        row["secondLevelCategoryReportingOnly"] for row in histories
    )
    source_window = source_bill[
        (
            source_bill["billMonth"].astype(str)
            >= config["dataContract"]["featureAndLabelWindowStart"]
        )
        & (
            source_bill["billMonth"].astype(str)
            <= config["dataContract"]["featureAndLabelWindowEnd"]
        )
    ]
    source_net = sum(
        (Decimal(str(value)) for value in source_window["amount"].tolist()),
        Decimal("0"),
    )
    mapped_net = sum(
        (Decimal(str(row["amount"])) for row in modern_rows),
        Decimal("0"),
    )
    if source_net != mapped_net:
        raise HumanAnchoredMaterializationError(
            "manifest source amount conservation failed"
        )
    v03_overlap = sum(row["v03ExactOverlap"] for row in auxiliary)
    return {
        "schema":
            "m2.current.human_anchored.private_manifest.v0.1",
        "tracked": False,
        "candidateId": config["candidateId"],
        "target": config["target"],
        "authorityWorkCount": int(
            config["dataContract"]["authorityWorkCount"]
        ),
        "modernWindowWorkWithFactCount": len(modern_work_ids),
        "modernWindowWorkWithFactShare": len(modern_work_ids)
        / int(config["dataContract"]["authorityWorkCount"]),
        "modernWindowFactRowCount": len(modern_rows),
        "modernWindowNetSalesShareCash": float(mapped_net),
        "mappingAudit": dict(mapping_audit),
        "channelMasterEvidence": dict(master_evidence),
        "historyRowCount": len(histories),
        "historyWorkCount": len(
            {str(row["standardWorkId"]) for row in histories}
        ),
        "primary": {
            "horizonMonths": 36,
            "caseRowCount": len(primary),
            "independentWorkCount": len(primary_work_ids),
            "originCount": len(primary_origin_counts),
            "originCounts": dict(sorted(primary_origin_counts.items())),
            "positiveTargetCaseCount": sum(
                float(row["actualPositive"]) > 0 for row in primary
            ),
            "reversalTargetCaseCount": sum(
                float(row["actualReversal"]) > 0 for row in primary
            ),
            "v03ExactOverlapCaseCount": 0,
            "evaluationDesign":
                "deterministic_cross_work_only_not_later_origin",
        },
        "auxiliary": {
            "caseRowCount": len(auxiliary),
            "independentWorkCount": len(auxiliary_work_ids),
            "originCount": len(auxiliary_origin_counts),
            "originCounts": dict(sorted(auxiliary_origin_counts.items())),
            "horizonCounts": dict(sorted(auxiliary_horizon_counts.items())),
            "positiveTargetCaseCount": sum(
                float(row["actualPositive"]) > 0 for row in auxiliary
            ),
            "reversalTargetCaseCount": sum(
                float(row["actualReversal"]) > 0 for row in auxiliary
            ),
            "v03ExactOverlapCaseCount": v03_overlap,
            "evaluationDesign":
                "strict_as_of_rolling_with_mature_earlier_labels_only",
        },
        "segmentHistoryCounts": dict(sorted(segment_counts.items())),
        "dominantRevenueModeHistoryCounts": dict(sorted(mode_counts.items())),
        "secondLevelCategory": {
            "distinctCount": len(category_counts),
            "minimumHistoryRows": min(category_counts.values()),
            "medianHistoryRows": _integer_quantile(
                list(category_counts.values()),
                0.5,
            ),
            "maximumHistoryRows": max(category_counts.values()),
            "usedForPrediction": False,
        },
        "digests": {
            "historiesSha256": hashlib.sha256(history_bytes).hexdigest(),
            "primaryCasesSha256":
                hashlib.sha256(primary_bytes).hexdigest(),
            "auxiliaryCasesSha256":
                hashlib.sha256(auxiliary_bytes).hexdigest(),
        },
        "dataQuality": {
            "intendedGrain":
                "one case per authority work origin horizon",
            "duplicateCaseKeyCount": 0,
            "unmappedChannelPairCount": 0,
            "mappingCoverage": 1,
            "amountConservationDifference": float(source_net - mapped_net),
            "targetIdentity":
                "actual_positive_minus_actual_reversal_equals_net",
            "signedCashSeparatedBeforeAggregation": True,
            "peerTrendExcludesTargetWork": True,
            "unmaturedLabelZeroImputationCount": 0,
            "pre2021CashAmountUsed": False,
            "post2025CashAmountUsed": False,
            "buyoutCashUsed": False,
            "categoryUsedForPrediction": False,
            "channelAttributesEffectiveAtProven": False,
        },
        "featureAvailability": {
            "salesHistory": "strict_as_of_origin_2021_onward",
            "firstObservedSalesMonth":
                "metadata_only_may_predate_2021_no_amount_read",
            "canonicalChannelIdentity":
                "user_reviewed_static_mapping",
            "channelRoleAndRevenueMode":
                "current_static_attribute_effective_month_unproven",
            "category":
                "current_record_reporting_only_not_prediction",
        },
        "operationalAsOf36MonthEvaluationPossible": False,
        "operationalAsOf36MonthBlockReason":
            "within_2021_2025_only_origins_through_2022_12_have_36_month_labels",
        "independentLaterOriginOpened": False,
        "finalHoldoutOpened": False,
        "providerUsed": False,
        "databaseRead": False,
        "inputAuthority": {
            "cashClassification":
                inputs["cashClassificationAuthority"]["authorityMode"],
            "machineCashClassificationUsed": False,
        },
    }


def _encode_ndjson(rows: Iterable[Mapping[str, Any]]) -> bytes:
    return b"".join(
        json.dumps(
            row,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode("utf-8")
        + b"\n"
        for row in rows
    )


def _integer_quantile(values: list[int], probability: float) -> int:
    ordered = sorted(values)
    index = min(
        len(ordered) - 1,
        int((len(ordered) - 1) * probability),
    )
    return int(ordered[index])


def _fixture_self_test() -> dict[str, Any]:
    rows = [
        {
            "standardWorkId": "W1",
            "billMonth": "2021-01",
            "amount": Decimal("100"),
            "channelUid": "C1",
            "channelRole": "MAIN",
            "revenueMode": "membership_subscription",
        },
        {
            "standardWorkId": "W1",
            "billMonth": "2021-01",
            "amount": Decimal("-25"),
            "channelUid": "C1",
            "channelRole": "MAIN",
            "revenueMode": "membership_subscription",
        },
        {
            "standardWorkId": "W1",
            "billMonth": "2021-07",
            "amount": Decimal("10"),
            "channelUid": "C1",
            "channelRole": "MAIN",
            "revenueMode": "membership_subscription",
        },
        {
            "standardWorkId": "W2",
            "billMonth": "2021-01",
            "amount": Decimal("50"),
            "channelUid": "C1",
            "channelRole": "MAIN",
            "revenueMode": "membership_subscription",
        },
        {
            "standardWorkId": "W2",
            "billMonth": "2021-07",
            "amount": Decimal("100"),
            "channelUid": "C1",
            "channelRole": "MAIN",
            "revenueMode": "membership_subscription",
        },
    ]
    panel = _monthly_panel(rows)
    positive, reversal = _future_amounts(
        panel,
        "W1",
        "2020-12",
        "2021-07",
    )
    history = _history_row(
        "W1",
        "2021-07",
        panel,
        _platform_monthly_panel(panel),
        {"W1": "2021-01"},
        {
            "firstLevelCategoryReportingOnly": "unknown",
            "secondLevelCategoryReportingOnly": "unknown",
            "thirdLevelCategoryReportingOnly": "unknown",
        },
    )
    channel = history["canonicalChannels"][0]
    monthly = history["salesShareMonthlyHistory"]
    passed = (
        positive == Decimal("110")
        and reversal == Decimal("25")
        and channel["cumulativePositive"] == 110.0
        and channel["cumulativeReversal"] == 25.0
        and channel["cumulativeNet"] == 85.0
        and channel["peerTrendRatio"] == 2.0
        and monthly["startsAt"] == "2021-01"
        and monthly["through"] == "2021-07"
        and monthly["positiveSeries"] == [
            100.0, 0.0, 0.0, 0.0, 0.0, 0.0, 10.0
        ]
        and monthly["reversalSeries"] == [
            25.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0
        ]
        and monthly["observedZeroMonthsIncluded"] is True
        and monthly["unobservedMonthsZeroFilled"] is False
    )
    if not passed:
        raise HumanAnchoredMaterializationError(
            "signed-cash or leave-one-work-out peer fixture failed"
        )
    return {
        "signedCashSeparatedBeforeAggregation": True,
        "peerTrendExcludesTargetWork": True,
        "netCashConserved": True,
    }


if __name__ == "__main__":
    arguments = sys.argv[1:]
    if arguments == ["--fixture-self-test"]:
        result = _fixture_self_test()
    elif arguments == ["--publishing-scale-preflight"]:
        result = _publishing_scale_preflight()
    elif arguments == ["--publishing-scale-config-self-test"]:
        result = _publishing_scale_config_self_test()
    elif arguments == ["--channel-experts"]:
        result = run(channel_experts=True)
    elif arguments == ["--channel-generative"]:
        result = run(channel_generative=True)
    elif (
        len(arguments) == 5
        and arguments[0] == "--publishing-scale-channel"
        and arguments[1] == "--execution-authorization"
        and arguments[3] == "--run-receipt"
    ):
        result = run(
            publishing_scale_channel=True,
            execution_authorization_file=arguments[2],
            run_receipt_file=arguments[4],
        )
    elif arguments == ["--publishing-scale-channel"]:
        raise HumanAnchoredMaterializationError(
            "publishing-scale private materialization requires "
            "runtime authorization and run receipt"
        )
    elif arguments:
        raise HumanAnchoredMaterializationError(
            "unsupported materialization mode"
        )
    else:
        result = run()
    print(
        json.dumps(
            result,
            ensure_ascii=False,
            sort_keys=True,
            allow_nan=False,
        )
    )
