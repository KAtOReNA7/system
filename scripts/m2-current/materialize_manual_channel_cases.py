#!/usr/bin/env python3
"""Materialize private channel-level cases for the manual-rule M2 backtest.

The adapter reads the verified local model-input cache only.  It does not
connect to a database, open later/final holdout labels, or publish identifiers.
"""

from __future__ import annotations

import hashlib
import json
import math
import pickle
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
REAL_DATA = ROOT / "scripts" / "m2-real-data"
CURRENT = ROOT / "scripts" / "m2-current"
for module_path in (REAL_DATA, CURRENT):
    if str(module_path) not in sys.path:
        sys.path.insert(0, str(module_path))

import m2_calibration_c2_v1 as c2  # noqa: E402
import m2_calibration_v1 as base  # noqa: E402
import m2_calibration_v1_2 as v12  # noqa: E402
import m2_formal_cash_target_v1 as cash  # noqa: E402
import materialize_dense_development_cases as dense  # noqa: E402
import run_m2_calibration_baseline_replay as legacy  # noqa: E402
import run_m2_formal_execution_payload as formal  # noqa: E402


CONFIG = ROOT / "config" / "m2-current-manual-channel.v0.1.json"
OUTPUT_DIR = (
    ROOT / "data" / "private-output" / "m2-current-manual-channel"
)
CASE_OUTPUT = OUTPUT_DIR / "M2-current-manual-channel-cases-private-v0.1.ndjson"
MANIFEST_OUTPUT = (
    OUTPUT_DIR / "M2-current-manual-channel-manifest-private-v0.1.json"
)
MONTH_PATTERN = re.compile(r"(19|20)\d{2}[-/.](0?[1-9]|1[0-2])")


class ManualChannelMaterializationError(RuntimeError):
    """The bounded private materialization contract was violated."""


def run() -> dict[str, Any]:
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    population = config["population"]
    if (
        config.get("schema") != "m2.current.manual_channel_backtest.v0.1"
        or int(population["horizonMonths"]) != 36
        or population["labelAvailableThrough"] != "2023-06"
        or config["boundaries"]["finalHoldoutOpened"] is not False
        or config["boundaries"]["deferredLabelsOpened"] is not False
    ):
        raise ManualChannelMaterializationError(
            "manual-channel development boundary differs"
        )
    confirmation_config, target_confirmations = dense.load_user_confirmations()
    work_ids, _frozen_cases = dense.read_current_cases()
    if len(work_ids) != int(population["frozenWorkCount"]):
        raise ManualChannelMaterializationError(
            "manual-channel frozen work population differs"
        )

    calibration_spec, _v11, _v12 = v12.load_and_validate_contract()
    c2_spec = c2.load_spec()
    works_list, _posthoc, input_evidence = legacy.load_authorized_works(
        calibration_spec
    )
    works = {
        str(work["standard_work_id"]): work
        for work in works_list
        if str(work["standard_work_id"]) in work_ids
    }
    if set(works) != work_ids:
        raise ManualChannelMaterializationError(
            "manual-channel work population differs"
        )
    confirmation_match_counts = dense.validate_confirmation_bindings(
        works, target_confirmations
    )
    model_inputs = _read_verified_model_inputs()
    formal_input = model_inputs["formalInput"]
    identity_audit = _channel_identity_audit(
        model_inputs["mappedBill"],
        calibration_spec["authority"]["latestCompleteMonth"],
    )
    classification_coverage = _classification_coverage(formal_input)
    classifier_audit = _classifier_audit(
        works_list,
        calibration_spec,
        calibration_spec["authority"]["latestCompleteMonth"],
    )

    rows: list[dict[str, Any]] = []
    route_skips: Counter[str] = Counter()
    origin_counts: Counter[str] = Counter()
    segment_counts: Counter[str] = Counter()
    rights_start_sources: Counter[str] = Counter()
    channel_counts: list[int] = []
    buyout_event_months_excluded = 0
    special_category_case_count = 0
    allowed_routes = set(population["salesRoutes"])
    horizon = int(population["horizonMonths"])
    for origin in population["origins"]:
        for work_id in sorted(works):
            work = works[work_id]
            routing = base.route_work_as_of(
                work, origin, calibration_spec
            )
            route = str(routing["route"])
            if route not in allowed_routes:
                route_skips[route] += 1
                continue
            histories = c2.channel_histories_as_of(
                work, origin, calibration_spec
            )
            if not histories:
                route_skips["no_sales_history"] += 1
                continue
            target_end = base.add_months(origin, horizon)
            if target_end > str(population["labelAvailableThrough"]):
                raise ManualChannelMaterializationError(
                    "manual-channel target crosses sealed label boundary"
                )
            actuals = cash.build_sales_share_cash_actuals(
                work,
                origin,
                horizon,
                route,
                calibration_spec,
                label_available_as_of=target_end,
                target_classification_confirmations=target_confirmations,
            )
            segment = str(
                c2.segment_as_of(
                    work, origin, calibration_spec, c2_spec
                )["segment"]
            )
            metadata = formal_input.get(work_id, {}) or {}
            first_observed = min(
                str(item["firstObservedMonth"])
                for item in histories.values()
            )
            rights_start, rights_source = _rights_start_month(
                metadata.get("版权开始"), first_observed, origin
            )
            special_category = _is_danmei(metadata)
            channels = []
            for channel_id, item in sorted(histories.items()):
                months = [str(value) for value in item["months"]]
                values = [float(value) for value in item["values"]]
                if (
                    not months
                    or len(months) != len(values)
                    or months[-1] > origin
                    or any(not math.isfinite(value) for value in values)
                ):
                    raise ManualChannelMaterializationError(
                        "manual-channel history differs"
                    )
                excluded = int(item["buyoutEventMonthsExcluded"])
                buyout_event_months_excluded += excluded
                channels.append(
                    {
                        "channelId": str(channel_id),
                        "firstObservedMonth": str(
                            item["firstObservedMonth"]
                        ),
                        "months": months,
                        "values": values,
                        "buyoutEventMonthsExcluded": excluded,
                    }
                )
            rows.append(
                {
                    "standardWorkId": work_id,
                    "origin": origin,
                    "horizonMonths": horizon,
                    "targetEnd": target_end,
                    "labelAvailableAsOf": target_end,
                    "route": route,
                    "segment": segment,
                    "rightsStartMonth": rights_start,
                    "rightsStartSource": rights_source,
                    "specialCategory": (
                        "danmei" if special_category else "ordinary_proxy"
                    ),
                    "actual": float(actuals["salesShareCashActual"]),
                    "isolatedBuyoutCashActual": float(
                        actuals["isolatedBuyoutCashActual"]
                    ),
                    "isolatedOtherCashActual": float(
                        actuals["isolatedOtherCashActual"]
                    ),
                    "classificationUncertainCashActual": float(
                        actuals["classificationUncertainCashActual"]
                    ),
                    "channels": channels,
                    "channelNormalizationComplete": False,
                    "manualBuyoutTruthAvailable": True,
                    "historicalFeatureAvailableAtProven": False,
                    "finalHoldoutOpened": False,
                    "deferredLabelsOpened": False,
                }
            )
            origin_counts[origin] += 1
            segment_counts[segment] += 1
            rights_start_sources[rights_source] += 1
            channel_counts.append(len(channels))
            special_category_case_count += int(special_category)

    if not rows:
        raise ManualChannelMaterializationError(
            "manual-channel case population is empty"
        )
    private_text = "".join(
        f"{json.dumps(row, ensure_ascii=False, sort_keys=True)}\n"
        for row in rows
    )
    private_bytes = private_text.encode("utf-8")
    manifest = {
        "schema":
            "m2.current.manual_channel_backtest.private_manifest.v0.1",
        "tracked": False,
        "candidateId": config["candidateId"],
        "privateCaseRowCount": len(rows),
        "privateCaseSha256": hashlib.sha256(private_bytes).hexdigest(),
        "workCount": len({row["standardWorkId"] for row in rows}),
        "originCounts": dict(sorted(origin_counts.items())),
        "segmentCounts": dict(sorted(segment_counts.items())),
        "routeSkipCounts": dict(sorted(route_skips.items())),
        "specialCategoryCaseCount": special_category_case_count,
        "rightsStartSourceCounts": dict(
            sorted(rights_start_sources.items())
        ),
        "channelCount": {
            "minimum": min(channel_counts),
            "median": _quantile(channel_counts, 0.5),
            "p90": _quantile(channel_counts, 0.9),
            "maximum": max(channel_counts),
        },
        "buyoutEventMonthsExcludedFromHistory":
            buyout_event_months_excluded,
        "channelIdentityAudit": identity_audit,
        "classificationCoverage": classification_coverage,
        "classifierAudit": classifier_audit,
        "inputEvidence": input_evidence,
        "targetPolicy": "sales_share_cash_only",
        "channelNormalizationComplete": False,
        "manualBuyoutTruthAvailable": True,
        "historicalFeatureAvailableAtProven": False,
        "labelAvailableThrough": population["labelAvailableThrough"],
        "finalHoldoutOpened": False,
        "deferredLabelsOpened": False,
        "databaseRead": False,
        "providerUsed": False,
        "userConfirmationSha256": hashlib.sha256(
            json.dumps(
                confirmation_config,
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
            ).encode("utf-8")
        ).hexdigest(),
        "targetConfirmationMatchCounts": dict(
            sorted(confirmation_match_counts.items())
        ),
    }
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    CASE_OUTPUT.write_bytes(private_bytes)
    MANIFEST_OUTPUT.write_text(
        f"{json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True)}\n",
        encoding="utf-8",
    )
    return manifest


def _read_verified_model_inputs() -> dict[str, Any]:
    expected_signature = formal.model_cache_signature()
    with formal.MODEL_CACHE_PATH.open("rb") as handle:
        cached = pickle.load(handle)
    if (
        not isinstance(cached, dict)
        or cached.get("signature") != expected_signature
        or not isinstance(cached.get("modelInputs"), dict)
    ):
        raise ManualChannelMaterializationError(
            "manual-channel verified model cache differs"
        )
    return cached["modelInputs"]


def _channel_identity_audit(mapped_bill: Any, latest: str) -> dict[str, Any]:
    valid = mapped_bill[mapped_bill["validForCalibration"].astype(bool)].copy()
    complete = valid[
        valid["billMonth"].astype(str).str.slice(0, 7) <= str(latest)
    ].copy()
    pairs = {
        (_clean(raw_id), _clean(name))
        for raw_id, name in zip(
            complete["渠道ID"], complete["文学库渠道名称"]
        )
    }
    names_by_id: dict[str, set[str]] = defaultdict(set)
    ids_by_name: dict[str, set[str]] = defaultdict(set)
    for raw_id, name in pairs:
        names_by_id[raw_id].add(name)
        ids_by_name[name].add(raw_id)
    return {
        "distinctRawIdCount": len(names_by_id),
        "distinctRawNameCount": len(ids_by_name),
        "distinctRawIdNamePairCount": len(pairs),
        "rawIdsWithMultipleExactNames": sum(
            len(values) > 1 for values in names_by_id.values()
        ),
        "rawNamesWithMultipleExactIds": sum(
            len(values) > 1 for values in ids_by_name.values()
        ),
        "semanticAliasResolutionAvailable": False,
        "semanticAliasConflictCount": None,
        "auditInterpretation":
            "exact one-to-one does not prove one real platform per pair",
    }


def _classification_coverage(
    formal_input: dict[str, dict[str, Any]]
) -> dict[str, Any]:
    fields = [
        "一级分类",
        "二级分类",
        "三级分类",
        "辅助标签",
        "版权开始",
        "版权到期",
        "作品状态",
        "音频版权状态",
    ]
    coverage = {}
    for field in fields:
        values = [_clean(row.get(field)) for row in formal_input.values()]
        coverage[field] = {
            "nonemptyCount": sum(bool(value) for value in values),
            "distinctNonemptyCount": len(
                {value for value in values if value}
            ),
        }
    coverage["danmeiWorkCount"] = sum(
        _is_danmei(row) for row in formal_input.values()
    )
    coverage["historicalAvailableAtProven"] = False
    return coverage


def _classifier_audit(
    works: list[dict[str, Any]],
    calibration_spec: dict[str, Any],
    latest: str,
) -> dict[str, Any]:
    channel_counts: Counter[str] = Counter()
    isolated_buyout = 0.0
    total_positive = 0.0
    for work in works:
        for channel in work.get("channels", []) or []:
            outcome = base.classify_channel_as_of(
                channel, str(latest), calibration_spec
            )
            channel_counts[str(outcome["label"])] += 1
            buyout_months = set(outcome.get("buyoutEventMonths", []))
            for month, raw_amount in (channel.get("monthly", {}) or {}).items():
                if str(month) > str(latest):
                    continue
                amount = float(raw_amount)
                total_positive += max(0.0, amount)
                if str(month) in buyout_months and amount != 0:
                    isolated_buyout += amount
    return {
        "channelClassificationCounts": dict(sorted(channel_counts.items())),
        "classifierIsolatedPositiveBuyoutCash": round(
            isolated_buyout, 8
        ),
        "classifierIsolatedShareOfPositiveCash": (
            isolated_buyout / total_positive if total_positive > 0 else 0
        ),
        "humanReviewedIsolatedBuyoutCash": round(isolated_buyout, 8),
        "humanReviewedIsolatedShareOfPositiveCash": (
            isolated_buyout / total_positive if total_positive > 0 else 0
        ),
        "manualFinancialTruthTableAvailable": True,
        "cashClassificationAuthority":
            "user_reviewed_workbook_membership",
        "machineCashClassificationUsed": False,
    }


def _rights_start_month(
    value: Any, fallback: str, origin: str
) -> tuple[str, str]:
    text = _clean(value)
    match = MONTH_PATTERN.search(text)
    if match:
        month = text[match.start() : match.end()].replace("/", "-").replace(
            ".", "-"
        )
        year, raw_month = month.split("-")
        normalized = f"{int(year):04d}-{int(raw_month):02d}"
        if normalized <= origin:
            return normalized, "formal_input_current_record"
    return str(fallback), "first_observed_month_proxy"


def _is_danmei(row: dict[str, Any]) -> bool:
    fields = ("一级分类", "二级分类", "三级分类", "辅助标签")
    return "耽美" in "|".join(_clean(row.get(field)) for field in fields)


def _clean(value: Any) -> str:
    try:
        if bool(formal.pd.isna(value)):
            return ""
    except (TypeError, ValueError):
        pass
    return str(value).strip()


def _quantile(values: list[int], probability: float) -> int:
    ordered = sorted(values)
    index = min(len(ordered) - 1, int((len(ordered) - 1) * probability))
    return int(ordered[index])


if __name__ == "__main__":
    result = run()
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
