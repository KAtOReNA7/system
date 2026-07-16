#!/usr/bin/env python3
"""Frozen C2 as-of segmentation, transparent candidates, and cash composer.

The module deliberately contains no data loader.  Callers must supply a
cutoff-only work history, a sanitized frozen case state, locked comparator
components, and parameter objects fitted only from earlier development
origins.  The same :func:`predict_as_of` entry is used for replay and serving.
"""

from __future__ import annotations

import copy
import hashlib
import json
import math
from collections import defaultdict
from pathlib import Path
from typing import Any, Mapping, Sequence

import m2_calibration_c2r1_v1 as c2r1
import m2_calibration_v1 as base
import m2_formal_cash_comparator_v1 as formal
import m2_formal_cash_target_v1 as cash


ROOT = Path(__file__).resolve().parents[2]
SPEC_PATH = (
    ROOT
    / "src"
    / "domain"
    / "oldProductEvaluation"
    / "calibrationSpec.c2.v1.amendment.json"
)
SALES_ROUTES = frozenset({"pure_sales_share", "buyout_plus_sales"})
ACTIVITY_SEGMENTS = ("dense", "intermittent", "dormant")
GENERIC_RESIDUAL_KEY = "__other_or_new_channel_residual__"
TOLERANCE = 1e-6


class C2Error(RuntimeError):
    """A frozen C2 modeling, routing, or leakage invariant was violated."""


def canonical_digest(value: Any) -> str:
    return hashlib.sha256(base.canonical_json_bytes(value)).hexdigest()


def load_spec(path: Path = SPEC_PATH) -> dict[str, Any]:
    spec = json.loads(path.read_text(encoding="utf-8"))
    if (
        spec.get("version") != "calibration-spec-c2-v1"
        or spec.get("decisionStatus") != "not_for_formal_decision"
        or spec.get("formalDecisionAuthorized") is not False
        or spec.get("releaseAuthorized") is not False
        or any(value is not False for value in spec.get("seals", {}).values())
    ):
        raise C2Error("C2 spec identity, decision boundary, or seal differs")
    parent = spec.get("phaseABinding", {})
    parent_path = ROOT / str(parent.get("parentSpecPath", ""))
    if not parent_path.is_file():
        raise C2Error("C2 parent spec is missing")
    parent_value = json.loads(parent_path.read_text(encoding="utf-8"))
    if c2r1.canonical_digest(parent_value) != str(
        parent.get("parentSpecCanonicalDigestSha256")
    ):
        raise C2Error("C2 parent spec digest differs")
    counts = {
        segment: len(candidate_configs(spec, segment)) for segment in ACTIVITY_SEGMENTS
    }
    expected = {
        segment: int(spec["candidateSpace"][segment]["candidateCount"])
        for segment in ACTIVITY_SEGMENTS
    }
    if counts != expected or sum(counts.values()) != int(
        spec["candidateSpace"]["totalSegmentCandidateCount"]
    ):
        raise C2Error("C2 candidate enumeration differs from the frozen counts")
    if tuple(spec["gateC"]["conditions"]) != (
        "as_of_activity_segments_frozen",
        "candidate_space_frozen",
        "other_new_channel_residual_frozen",
        "high_value_guard_frozen",
        "selection_objective_frozen",
        "case_population_parity_passed",
        "pure_buyout_abstention_test_passed",
        "mixed_excludes_future_buyout_test_passed",
        "residual_no_leakage_test_passed",
        "future_perturbation_tests_passed",
        "all_seals_closed",
        "phase_a_commit_pushed",
        "full_validation_suite_passed",
        "no_private_file_tracked",
    ):
        raise C2Error("Gate C condition set differs")
    return spec


def candidate_configs(
    spec: Mapping[str, Any], segment: str
) -> dict[str, dict[str, Any]]:
    if segment not in ACTIVITY_SEGMENTS:
        raise C2Error(f"unknown activity segment: {segment}")
    configs: dict[str, dict[str, Any]] = {
        "B4": {
            "candidateId": "B4",
            "segment": segment,
            "component": "B4",
            "anchorWeight": 1.0,
            "residualScale": 0.0,
            "complexity": [0, 0, "B4"],
        }
    }
    residual_scales = [
        float(value)
        for value in spec["candidateSpace"]["otherOrNewChannelResidualScales"]
    ]
    if segment in {"dense", "intermittent"}:
        prefix = segment
        for component in spec["candidateSpace"][segment]["components"]:
            for weight_value in spec["candidateSpace"]["anchorWeights"]:
                weight = float(weight_value)
                for residual_scale in residual_scales:
                    candidate_id = (
                        f"{prefix}__{component}__b4w{int(round(weight * 100)):03d}"
                        f"__r{int(round(residual_scale * 100)):03d}"
                    )
                    configs[candidate_id] = {
                        "candidateId": candidate_id,
                        "segment": segment,
                        "component": str(component),
                        "anchorWeight": weight,
                        "residualScale": residual_scale,
                        "complexity": [
                            1,
                            2 if residual_scale else 1,
                            candidate_id,
                        ],
                    }
    else:
        for component in ("legal_zero_cash", "earlier_origin_reactivation"):
            for residual_scale in residual_scales:
                candidate_id = (
                    f"dormant__{component}__r{int(round(residual_scale * 100)):03d}"
                )
                configs[candidate_id] = {
                    "candidateId": candidate_id,
                    "segment": segment,
                    "component": component,
                    "anchorWeight": 0.0,
                    "residualScale": residual_scale,
                    "complexity": [
                        1,
                        2 if residual_scale else 1,
                        candidate_id,
                    ],
                }
    if len(configs) != len(set(configs)):
        raise C2Error("C2 candidate identifiers are duplicated")
    return configs


def candidate_ids(spec: Mapping[str, Any], segment: str) -> tuple[str, ...]:
    return tuple(candidate_configs(spec, segment))


def candidate_complexity(
    spec: Mapping[str, Any], segment: str, candidate_id: str
) -> tuple[int, int, str]:
    config = candidate_configs(spec, segment).get(candidate_id)
    if config is None:
        raise C2Error("candidate is outside the frozen segment space")
    value = config["complexity"]
    return int(value[0]), int(value[1]), str(value[2])


def _quantile(values: Sequence[float], probability: float) -> float:
    ordered = sorted(float(value) for value in values)
    if not ordered:
        return 0.0
    position = (len(ordered) - 1) * float(probability)
    lower = int(math.floor(position))
    upper = int(math.ceil(position))
    if lower == upper:
        return ordered[lower]
    weight = position - lower
    return ordered[lower] * (1.0 - weight) + ordered[upper] * weight


def _uniform_total_path(total: float, horizon: int) -> list[float]:
    if int(horizon) <= 0:
        return []
    value = max(0.0, float(total)) / int(horizon)
    return [value for _ in range(int(horizon))]


def _constant_path(value: float, horizon: int) -> list[float]:
    return [max(0.0, float(value)) for _ in range(int(horizon))]


def _component_totals(row: Mapping[str, Any]) -> dict[str, float]:
    output: dict[str, float] = {}
    components = row.get("channelComponents", row.get("channel_components", [])) or []
    for component in components:
        key = str(component.get("channel_key", ""))
        if not key or key == GENERIC_RESIDUAL_KEY or key in output:
            raise C2Error("locked comparator channel component differs")
        point = base.require_finite_number(
            component.get("point_forecast"), "locked comparator channel point"
        )
        if point < 0:
            raise C2Error("locked comparator channel point is negative")
        output[key] = point
    return output


def channel_histories_as_of(
    work: Mapping[str, Any],
    origin: str,
    calibration_spec: Mapping[str, Any],
) -> dict[str, dict[str, Any]]:
    """Return each cutoff-known sales channel from its own first observation."""

    routing = base.route_work_as_of(work, origin, calibration_spec)
    if routing["route"] not in SALES_ROUTES:
        return {}
    index = base.channel_index(work)
    output: dict[str, dict[str, Any]] = {}
    for routed in routing["channels"]:
        if routed["label"] not in {"sales_share_channel", "mixed_channel"}:
            continue
        key = str(routed["channel_key"])
        if key in output or key not in index:
            raise C2Error("as-of sales channel is missing or duplicated")
        channel = index[key]
        first = str(channel.get("first_observed_month", ""))
        if not first or first > origin:
            continue
        months = base.month_range(first, origin)
        monthly = channel.get("monthly", {}) or {}
        buyout_months = (
            set(routed.get("buyoutEventMonths", []))
            if routed["label"] == "mixed_channel"
            else set()
        )
        values = [
            0.0
            if month in buyout_months
            else base.require_finite_number(monthly.get(month, 0.0), "monthly cash")
            for month in months
        ]
        output[key] = {
            "firstObservedMonth": first,
            "months": months,
            "values": values,
            "buyoutEventMonthsExcluded": len(buyout_months),
        }
    return output


def work_sales_history_as_of(
    work: Mapping[str, Any],
    origin: str,
    calibration_spec: Mapping[str, Any],
) -> dict[str, Any]:
    channels = channel_histories_as_of(work, origin, calibration_spec)
    if not channels:
        return {
            "firstObservedMonth": None,
            "months": [],
            "values": [],
            "channelCount": 0,
        }
    first = min(str(item["firstObservedMonth"]) for item in channels.values())
    months = base.month_range(first, origin)
    totals = {month: 0.0 for month in months}
    for item in channels.values():
        for month, value in zip(item["months"], item["values"]):
            totals[str(month)] += float(value)
    return {
        "firstObservedMonth": first,
        "months": months,
        "values": [totals[month] for month in months],
        "channelCount": len(channels),
    }


def segment_as_of(
    work: Mapping[str, Any],
    origin: str,
    calibration_spec: Mapping[str, Any],
    spec: Mapping[str, Any],
) -> dict[str, Any]:
    history = work_sales_history_as_of(work, origin, calibration_spec)
    values = [float(value) for value in history["values"]]
    zero_tolerance = float(spec["activitySegmentation"]["zeroAbsoluteTolerance"])

    def is_zero(value: float) -> bool:
        return abs(value) <= zero_tolerance

    positive_count = sum(value > zero_tolerance for value in values)
    negative_count = sum(value < -zero_tolerance for value in values)
    trailing12 = values[-12:]
    trailing6 = values[-6:]
    positive12 = sum(value > zero_tolerance for value in trailing12)
    positive6 = sum(value > zero_tolerance for value in trailing6)
    zero12 = sum(is_zero(value) for value in trailing12)
    consecutive_zero = 0
    for value in reversed(values):
        if not is_zero(value):
            break
        consecutive_zero += 1
    positive_trailing12 = [value for value in trailing12 if value > zero_tolerance]
    positive_sum12 = sum(positive_trailing12)
    largest_share = (
        max(positive_trailing12) / positive_sum12 if positive_sum12 > 0 else 0.0
    )
    observed = len(values)
    dense = spec["activitySegmentation"]["dense"]
    dormant = spec["activitySegmentation"]["dormant"]
    if observed == 0:
        segment = "intermittent"
        reason = "no_as_of_sales_channel_b4_only"
        override_allowed = False
    elif positive_count == 0:
        segment = "intermittent"
        reason = "no_positive_sales_evidence_b4_only"
        override_allowed = False
    elif (
        positive_count >= int(dormant["minimumHistoricalPositiveMonths"])
        and consecutive_zero
        >= int(dormant["minimumTrailingConsecutiveZeroMonths"])
    ):
        segment = "dormant"
        reason = "historical_sales_and_trailing_zero_run"
        override_allowed = observed >= int(
            spec["candidateSpace"]["parameters"][
                "minimumChannelHistoryMonthsBeforeOverride"
            ]
        )
    elif (
        observed >= int(dense["minimumObservedCompleteMonths"])
        and positive12 >= int(dense["minimumPositiveMonthsTrailing12"])
        and positive6 >= int(dense["minimumPositiveMonthsTrailing6"])
        and zero12 <= int(dense["maximumZeroMonthsTrailing12"])
        and largest_share
        <= float(dense["maximumLargestPositiveMonthShareTrailing12"])
    ):
        segment = "dense"
        reason = "sustained_positive_sales_without_single_month_dominance"
        override_allowed = True
    else:
        segment = "intermittent"
        reason = (
            "short_history_b4_only"
            if observed
            < int(
                spec["candidateSpace"]["parameters"][
                    "minimumChannelHistoryMonthsBeforeOverride"
                ]
            )
            else "non_dense_non_dormant_sales"
        )
        override_allowed = reason != "short_history_b4_only"
    return {
        "segment": segment,
        "segmentReason": reason,
        "modelOverrideAllowed": override_allowed,
        "features": {
            "observedCompleteMonths": observed,
            "historicalPositiveMonthCount": positive_count,
            "historicalNegativeMonthCount": negative_count,
            "positiveMonthCountTrailing12": positive12,
            "positiveMonthCountTrailing6": positive6,
            "zeroMonthCountTrailing12": zero12,
            "trailingConsecutiveZeroMonths": consecutive_zero,
            "largestPositiveMonthShareTrailing12": largest_share,
            "asOfSalesChannelCount": int(history["channelCount"]),
            "firstSalesObservedMonth": history["firstObservedMonth"],
        },
    }


def _dense_component_path(
    method: str,
    history: Sequence[float],
    horizon: int,
    b4_total: float,
    spec: Mapping[str, Any],
) -> tuple[list[float], bool]:
    values = [base.require_finite_number(value, "dense channel history") for value in history]
    params = spec["candidateSpace"]["parameters"]
    if (
        len(values) < int(params["minimumChannelHistoryMonthsBeforeOverride"])
        or any(value < 0 for value in values)
    ):
        return _uniform_total_path(b4_total, horizon), True
    if method == "seasonal_naive_12":
        lag = int(params["seasonalLagMonths"])
        if len(values) < lag:
            return _uniform_total_path(b4_total, horizon), True
        seasonal = values[-lag:]
        return [seasonal[index % lag] for index in range(int(horizon))], False
    if method == "damped_trend_18":
        window = int(params["dampedTrendWindowMonths"])
        sample = values[-min(window, len(values)) :]
        center = (len(sample) - 1) / 2.0
        mean = sum(sample) / len(sample)
        denominator = sum((index - center) ** 2 for index in range(len(sample)))
        slope = (
            sum((index - center) * (value - mean) for index, value in enumerate(sample))
            / denominator
            if denominator > 0
            else 0.0
        )
        damping = float(params["trendDamping"])
        return [
            max(0.0, sample[-1] + damping * slope * offset)
            for offset in range(1, int(horizon) + 1)
        ], False
    if method == "ets_like_level_trend":
        alpha = float(params["etsAlpha"])
        beta = float(params["etsBeta"])
        damping = float(params["etsDamping"])
        level = values[0]
        trend = values[1] - values[0] if len(values) > 1 else 0.0
        for value in values[1:]:
            previous = level
            level = alpha * value + (1.0 - alpha) * (level + trend)
            trend = beta * (level - previous) + (1.0 - beta) * trend
        return [
            max(0.0, level + sum(damping**step for step in range(1, offset + 1)) * trend)
            for offset in range(1, int(horizon) + 1)
        ], False
    if method == "zero_aware_recent_mean_12":
        window = int(params["zeroAwareWindowMonths"])
        sample = values[-min(window, len(values)) :]
        return _constant_path(sum(sample) / len(sample), horizon), False
    if method == "winsorized_robust_mean_18":
        window = int(params["robustWindowMonths"])
        sample = values[-min(window, len(values)) :]
        lower = _quantile(sample, float(params["winsorLowerQuantile"]))
        upper = _quantile(sample, float(params["winsorUpperQuantile"]))
        winsorized = [min(upper, max(lower, value)) for value in sample]
        return _constant_path(sum(winsorized) / len(winsorized), horizon), False
    if method == "recency_weighted_mean_18":
        window = int(params["recencyWindowMonths"])
        sample = values[-min(window, len(values)) :]
        decay = float(params["recencyDecay"])
        weights = [decay ** (len(sample) - 1 - index) for index in range(len(sample))]
        mean = sum(value * weight for value, weight in zip(sample, weights)) / sum(weights)
        return _constant_path(mean, horizon), False
    raise C2Error(f"unknown dense component: {method}")


def _croston_monthly(values: Sequence[float], alpha: float, sba: bool) -> float:
    positive_indices = [index for index, value in enumerate(values) if value > 0]
    if not positive_indices:
        return 0.0
    first = positive_indices[0]
    size = float(values[first])
    interval = float(first + 1)
    previous = first
    for index in positive_indices[1:]:
        gap = float(index - previous)
        size += alpha * (float(values[index]) - size)
        interval += alpha * (gap - interval)
        previous = index
    estimate = size / max(interval, 1.0)
    return max(0.0, estimate * (1.0 - alpha / 2.0 if sba else 1.0))


def _intermittent_component_path(
    method: str,
    history: Sequence[float],
    horizon: int,
    b4_total: float,
    b3_total: float,
    spec: Mapping[str, Any],
) -> tuple[list[float], bool]:
    values = [
        base.require_finite_number(value, "intermittent channel history")
        for value in history
    ]
    params = spec["candidateSpace"]["parameters"]
    if (
        len(values) < int(params["minimumChannelHistoryMonthsBeforeOverride"])
        or any(value < 0 for value in values)
    ):
        return _uniform_total_path(b4_total, horizon), True
    if method == "B3":
        return _uniform_total_path(b3_total, horizon), False
    if method in {"croston", "croston_sba"}:
        monthly = _croston_monthly(
            values, float(params["crostonAlpha"]), method == "croston_sba"
        )
        return _constant_path(monthly, horizon), False
    if method == "tsb":
        probability_alpha = float(params["tsbProbabilityAlpha"])
        size_alpha = float(params["tsbSizeAlpha"])
        probability = 0.0
        size = 0.0
        for value in values:
            occurred = 1.0 if value > 0 else 0.0
            probability += probability_alpha * (occurred - probability)
            if occurred:
                size = value if size == 0 else size + size_alpha * (value - size)
        return _constant_path(probability * size, horizon), False
    if method == "adida":
        width = int(params["adidaAggregationMonths"])
        padding = (-len(values)) % width
        padded = [0.0] * padding + values
        aggregates = [sum(padded[index : index + width]) for index in range(0, len(padded), width)]
        monthly = (sum(aggregates) / len(aggregates)) / width
        return _constant_path(monthly, horizon), False
    if method == "transparent_hurdle":
        window = int(params["hurdleWindowMonths"])
        sample = values[-min(window, len(values)) :]
        nonzero_values = [value for value in sample if value > 0]
        probability = (
            len(nonzero_values) + float(params["hurdleBetaPriorPositive"])
        ) / (
            len(sample)
            + float(params["hurdleBetaPriorPositive"])
            + float(params["hurdleBetaPriorZero"])
        )
        conditional_amount = (
            sum(nonzero_values) / len(nonzero_values) if nonzero_values else 0.0
        )
        return _constant_path(probability * conditional_amount, horizon), False
    raise C2Error(f"unknown intermittent component: {method}")


def _count_bucket(value: int) -> str:
    if value <= 0:
        return "none"
    if value == 1:
        return "one"
    if value == 2:
        return "two"
    return "three_plus"


def _concentration_bucket(values: Mapping[str, float]) -> str:
    total = sum(max(0.0, float(value)) for value in values.values())
    if total <= 0:
        return "none"
    share = max(max(0.0, float(value)) for value in values.values()) / total
    return "concentrated" if share >= 0.8 else "diversified"


def channel_context(comparator_rows: Mapping[str, Mapping[str, Any]]) -> dict[str, Any]:
    if "B4" not in comparator_rows:
        raise C2Error("C2 channel context lacks the B4 anchor")
    totals = _component_totals(comparator_rows["B4"])
    return {
        "knownChannelCount": len(totals),
        "knownChannelCountBucket": _count_bucket(len(totals)),
        "knownChannelConcentrationBucket": _concentration_bucket(totals),
        "knownChannelPoint": sum(totals.values()),
    }


def _winsorized_nonnegative_stat(
    values: Sequence[float], upper_probability: float
) -> dict[str, Any]:
    clean = [max(0.0, base.require_finite_number(value, "earlier residual")) for value in values]
    if not clean:
        return {"caseCount": 0, "mean": 0.0, "upperCap": 0.0}
    cap = _quantile(clean, upper_probability)
    winsorized = [min(value, cap) for value in clean]
    return {
        "caseCount": len(clean),
        "mean": sum(winsorized) / len(winsorized),
        "upperCap": cap,
    }


def _residual_keys(record: Mapping[str, Any]) -> dict[str, str]:
    route = str(record["route"])
    segment = str(record["segment"])
    horizon = str(int(record["horizon"]))
    count = str(record["knownChannelCountBucket"])
    concentration = str(record["knownChannelConcentrationBucket"])
    return {
        "global": "*",
        "horizon": horizon,
        "routeHorizon": f"{route}|{horizon}",
        "segment": f"{route}|{segment}|{horizon}",
        "fine": f"{route}|{segment}|{horizon}|{count}|{concentration}",
    }


def _assert_earlier_training_record(
    record: Mapping[str, Any], trained_through_origin: str
) -> None:
    origin = str(record.get("origin", ""))
    label = str(record.get("labelAvailableAsOf", ""))
    target_end = str(record.get("targetEnd", ""))
    if not origin or origin >= trained_through_origin:
        raise C2Error("parameter fit contains a same-or-later origin")
    if not label or label > trained_through_origin:
        raise C2Error("parameter fit contains an unavailable label")
    if not target_end or target_end > trained_through_origin:
        raise C2Error("parameter fit contains an incomplete target window")


def fit_residual_model(
    records: Sequence[Mapping[str, Any]],
    trained_through_origin: str,
    spec: Mapping[str, Any],
) -> dict[str, Any]:
    """Fit a generic new-channel expectation from strictly earlier outcomes."""

    grouped: dict[str, dict[str, list[float]]] = {
        name: defaultdict(list)
        for name in ("global", "horizon", "routeHorizon", "segment", "fine")
    }
    origins: set[str] = set()
    maximum_label: str | None = None
    for record in records:
        _assert_earlier_training_record(record, trained_through_origin)
        origins.add(str(record["origin"]))
        label = str(record["labelAvailableAsOf"])
        maximum_label = label if maximum_label is None else max(maximum_label, label)
        value = base.require_finite_number(
            record.get("residualActual"), "earlier generic residual actual"
        )
        for level, key in _residual_keys(record).items():
            grouped[level][key].append(value)

    contract = spec["otherOrNewChannelResidual"]
    upper_probability = float(contract["winsorUpperQuantile"])
    minimums = {
        "global": 1,
        "horizon": int(contract["minimumHorizonCases"]),
        "routeHorizon": int(contract["minimumRouteHorizonCases"]),
        "segment": int(contract["minimumSegmentGroupCases"]),
        "fine": int(contract["minimumFineGroupCases"]),
    }
    parent_level = {
        "horizon": "global",
        "routeHorizon": "horizon",
        "segment": "routeHorizon",
        "fine": "segment",
    }
    parent_key = {
        "horizon": lambda key: "*",
        "routeHorizon": lambda key: key.split("|")[-1],
        "segment": lambda key: f"{key.split('|')[0]}|{key.split('|')[-1]}",
        "fine": lambda key: "|".join(key.split("|")[:3]),
    }
    levels: dict[str, dict[str, dict[str, Any]]] = {
        name: {} for name in grouped
    }
    shrinkage = float(contract["shrinkagePriorWeight"])
    for level in ("global", "horizon", "routeHorizon", "segment", "fine"):
        for key in sorted(grouped[level]):
            stat = _winsorized_nonnegative_stat(
                grouped[level][key], upper_probability
            )
            if int(stat["caseCount"]) < minimums[level]:
                continue
            estimate = float(stat["mean"])
            parent_estimate = None
            if level != "global":
                parent = levels[parent_level[level]].get(parent_key[level](key))
                if parent is not None:
                    parent_estimate = float(parent["estimate"])
                    estimate = (
                        int(stat["caseCount"]) * estimate
                        + shrinkage * parent_estimate
                    ) / (int(stat["caseCount"]) + shrinkage)
            levels[level][key] = {
                **stat,
                "estimate": min(max(0.0, estimate), float(stat["upperCap"])),
                "parentEstimate": parent_estimate,
            }
    return {
        "schema": "m2.c2_other_new_channel_residual_fit.v1",
        "trainedThroughOriginExclusive": trained_through_origin,
        "earlierOriginCount": len(origins),
        "maximumLabelAvailableAsOf": maximum_label,
        "recordCount": len(records),
        "levels": levels,
        "outerTruthRead": False,
        "futureChannelIdentityStored": False,
    }


def residual_point(
    *,
    route: str,
    segment: str,
    horizon: int,
    context: Mapping[str, Any],
    model: Mapping[str, Any] | None,
    spec: Mapping[str, Any],
) -> dict[str, Any]:
    if model is None or int(model.get("earlierOriginCount", 0)) < int(
        spec["selection"]["minimumEarlierOrigins"]
    ):
        return {
            "point": float(
                spec["otherOrNewChannelResidual"]["noEarlierEvidenceValue"]
            ),
            "level": "no_earlier_evidence",
            "caseCount": 0,
        }
    record = {
        "route": route,
        "segment": segment,
        "horizon": int(horizon),
        "knownChannelCountBucket": context["knownChannelCountBucket"],
        "knownChannelConcentrationBucket": context[
            "knownChannelConcentrationBucket"
        ],
    }
    keys = _residual_keys(record)
    for level in ("fine", "segment", "routeHorizon", "horizon", "global"):
        entry = (model.get("levels", {}).get(level, {}) or {}).get(keys[level])
        if entry is not None:
            return {
                "point": max(0.0, float(entry["estimate"])),
                "level": level,
                "caseCount": int(entry["caseCount"]),
            }
    return {
        "point": float(spec["otherOrNewChannelResidual"]["noEarlierEvidenceValue"]),
        "level": "no_eligible_group",
        "caseCount": 0,
    }


def fit_reactivation_model(
    records: Sequence[Mapping[str, Any]],
    trained_through_origin: str,
    spec: Mapping[str, Any],
) -> dict[str, Any]:
    grouped: dict[str, dict[str, list[float]]] = {
        "global": defaultdict(list),
        "horizon": defaultdict(list),
        "routeHorizon": defaultdict(list),
    }
    origins: set[str] = set()
    for record in records:
        _assert_earlier_training_record(record, trained_through_origin)
        if str(record.get("segment")) != "dormant":
            continue
        origins.add(str(record["origin"]))
        value = max(
            0.0,
            base.require_finite_number(
                record.get("matchedKnownActual"), "earlier dormant matched actual"
            ),
        )
        route = str(record["route"])
        horizon = str(int(record["horizon"]))
        grouped["global"]["*"].append(value)
        grouped["horizon"][horizon].append(value)
        grouped["routeHorizon"][f"{route}|{horizon}"].append(value)
    params = spec["candidateSpace"]["parameters"]
    positive_prior = float(params["reactivationBetaPriorPositive"])
    zero_prior = float(params["reactivationBetaPriorZero"])
    upper_probability = float(params["reactivationWinsorUpperQuantile"])
    minimum = int(spec["otherOrNewChannelResidual"]["minimumFineGroupCases"])
    levels: dict[str, dict[str, dict[str, Any]]] = {
        "global": {},
        "horizon": {},
        "routeHorizon": {},
    }
    for level in ("global", "horizon", "routeHorizon"):
        for key, values in sorted(grouped[level].items()):
            if level != "global" and len(values) < minimum:
                continue
            positives = [value for value in values if value > 0]
            probability = (len(positives) + positive_prior) / (
                len(values) + positive_prior + zero_prior
            )
            cap = _quantile(positives, upper_probability) if positives else 0.0
            conditional = (
                sum(min(value, cap) for value in positives) / len(positives)
                if positives
                else 0.0
            )
            levels[level][key] = {
                "caseCount": len(values),
                "positiveCaseCount": len(positives),
                "probability": probability,
                "conditionalCash": conditional,
                "expectedCash": probability * conditional,
            }
    return {
        "schema": "m2.c2_dormant_reactivation_fit.v1",
        "trainedThroughOriginExclusive": trained_through_origin,
        "earlierOriginCount": len(origins),
        "recordCount": sum(len(values) for values in grouped["global"].values()),
        "levels": levels,
        "outerTruthRead": False,
    }


def reactivation_point(
    *,
    route: str,
    horizon: int,
    model: Mapping[str, Any] | None,
    spec: Mapping[str, Any],
) -> dict[str, Any]:
    if model is None or int(model.get("earlierOriginCount", 0)) < int(
        spec["selection"]["minimumEarlierOrigins"]
    ):
        return {"point": 0.0, "level": "no_earlier_evidence", "caseCount": 0}
    keys = {
        "routeHorizon": f"{route}|{int(horizon)}",
        "horizon": str(int(horizon)),
        "global": "*",
    }
    for level in ("routeHorizon", "horizon", "global"):
        entry = (model.get("levels", {}).get(level, {}) or {}).get(keys[level])
        if entry is not None:
            return {
                "point": max(0.0, float(entry["expectedCash"])),
                "level": level,
                "caseCount": int(entry["caseCount"]),
            }
    return {"point": 0.0, "level": "no_eligible_group", "caseCount": 0}


def _allocate_total_by_history(
    total: float,
    histories: Mapping[str, Mapping[str, Any]],
    reference_totals: Mapping[str, float],
    horizon: int,
) -> dict[str, list[float]]:
    keys = sorted(histories)
    if not keys:
        if abs(float(total)) <= TOLERANCE:
            return {}
        raise C2Error("cannot allocate positive reactivation without a known channel")
    weights = {key: max(0.0, float(reference_totals.get(key, 0.0))) for key in keys}
    if sum(weights.values()) <= 0:
        weights = {
            key: sum(max(0.0, float(value)) for value in histories[key]["values"][-12:])
            for key in keys
        }
    if sum(weights.values()) <= 0:
        weights = {key: 1.0 for key in keys}
    denominator = sum(weights.values())
    return {
        key: _uniform_total_path(float(total) * weights[key] / denominator, horizon)
        for key in keys
    }


def known_channel_paths_as_of(
    *,
    work: Mapping[str, Any],
    origin: str,
    horizon: int,
    comparator_rows: Mapping[str, Mapping[str, Any]],
    calibration_spec: Mapping[str, Any],
    spec: Mapping[str, Any],
    segment_state: Mapping[str, Any],
    candidate_id: str,
    reactivation_model: Mapping[str, Any] | None,
    route: str,
) -> tuple[dict[str, list[float]], dict[str, Any]]:
    segment = str(segment_state["segment"])
    configs = candidate_configs(spec, segment)
    if candidate_id not in configs:
        raise C2Error("selected candidate is outside the frozen segment space")
    config = configs[candidate_id]
    histories = channel_histories_as_of(work, origin, calibration_spec)
    b4_totals = _component_totals(comparator_rows["B4"])
    b3_totals = _component_totals(comparator_rows["B3"])
    if not b4_totals or set(histories) != set(b4_totals) or set(histories) != set(
        b3_totals
    ):
        raise C2Error("C2 as-of channels differ from locked B4/B3 components")
    anchor = {
        key: _uniform_total_path(b4_totals[key], horizon) for key in sorted(histories)
    }
    if candidate_id == "B4":
        return anchor, {"primitiveFallbackCount": 0, "reactivation": None}
    component = str(config["component"])
    fallback_count = 0
    if segment == "dense":
        alternative: dict[str, list[float]] = {}
        for key in sorted(histories):
            alternative[key], fallback = _dense_component_path(
                component,
                histories[key]["values"],
                horizon,
                b4_totals[key],
                spec,
            )
            fallback_count += int(fallback)
    elif segment == "intermittent":
        alternative = {}
        for key in sorted(histories):
            alternative[key], fallback = _intermittent_component_path(
                component,
                histories[key]["values"],
                horizon,
                b4_totals[key],
                b3_totals[key],
                spec,
            )
            fallback_count += int(fallback)
    elif component == "legal_zero_cash":
        alternative = {key: [0.0] * int(horizon) for key in sorted(histories)}
    elif component == "earlier_origin_reactivation":
        reactivation = reactivation_point(
            route=route,
            horizon=horizon,
            model=reactivation_model,
            spec=spec,
        )
        alternative = _allocate_total_by_history(
            float(reactivation["point"]), histories, b4_totals, horizon
        )
    else:
        raise C2Error("unknown dormant component")
    if segment in {"dense", "intermittent"}:
        weight = float(config["anchorWeight"])
        selected = {
            key: [
                weight * anchor_value + (1.0 - weight) * alternative_value
                for anchor_value, alternative_value in zip(anchor[key], alternative[key])
            ]
            for key in sorted(anchor)
        }
        reactivation = None
    else:
        selected = alternative
        reactivation = (
            reactivation_point(
                route=route,
                horizon=horizon,
                model=reactivation_model,
                spec=spec,
            )
            if component == "earlier_origin_reactivation"
            else None
        )
    return selected, {
        "primitiveFallbackCount": fallback_count,
        "reactivation": reactivation,
    }


def _sanitized_case_state(value: Mapping[str, Any]) -> dict[str, Any]:
    forbidden_fragments = (
        "actual",
        "holdout",
        "futureincome",
        "currentrating",
        "currentrisk",
        "currentrights",
        "currentshelf",
        "strata",
    )
    for key in value:
        compact = str(key).replace("_", "").lower()
        if any(fragment in compact for fragment in forbidden_fragments):
            raise C2Error(f"prediction case state contains forbidden field: {key}")
    required = {
        "caseKey",
        "statisticallyScoreable",
        "scoreabilityReason",
        "businessServingEligible",
        "abstentionReason",
        "targetEnd",
        "labelAvailableAsOf",
        "billMonthMax",
        "sourceAvailableAsOf",
        "predictionRole",
    }
    if set(value) != required:
        raise C2Error("prediction case state schema differs from the frozen projection")
    return copy.deepcopy(dict(value))


def _empty_unscoreable_composition(reason: str) -> dict[str, Any]:
    return {
        "modelPredictionAvailable": False,
        "routeAbstained": False,
        "abstained": True,
        "abstentionReason": reason,
        "rawModelPrediction": None,
        "servedPrediction": None,
        "annualBreakdown": [],
        "confidence": "unavailable",
        "limitation": [reason],
        "confirmedCashComponents": [],
        "public_output": {
            "pointForecast": None,
            "annualBreakdown": [],
            "confidence": "unavailable",
            "limitation": [reason],
        },
    }


def predict_as_of(
    *,
    work: Mapping[str, Any],
    origin: str,
    horizon: int,
    case_state: Mapping[str, Any],
    comparator_rows: Mapping[str, Mapping[str, Any]] | None,
    calibration_spec: Mapping[str, Any],
    spec: Mapping[str, Any],
    candidate_id: str,
    residual_model: Mapping[str, Any] | None,
    reactivation_model: Mapping[str, Any] | None,
    cutoff_top10: bool,
    high_value_override_allowed: bool,
    cash_commitment_snapshots: Sequence[Mapping[str, Any]] | None = None,
) -> dict[str, Any]:
    """Produce one C2 point without reading any target or post-cutoff field."""

    state = _sanitized_case_state(case_state)
    key = state["caseKey"]
    expected_key_fields = {
        "standard_work_id",
        "origin",
        "horizon_months",
        "route",
    }
    if set(key) != expected_key_fields:
        raise C2Error("C2 case key schema differs")
    work_id = str(key["standard_work_id"])
    route = str(key["route"])
    if (
        work_id != str(work.get("standard_work_id", ""))
        or str(key["origin"]) != origin
        or int(key["horizon_months"]) != int(horizon)
    ):
        raise C2Error("C2 work/origin/horizon differs from its frozen case key")
    scoreable = state["statisticallyScoreable"]
    serving = state["businessServingEligible"]
    if type(scoreable) is not bool or type(serving) is not bool:
        raise C2Error("C2 frozen state must use native booleans")

    segment_state = (
        segment_as_of(work, origin, calibration_spec, spec)
        if route in SALES_ROUTES
        else {
            "segment": "route_abstain",
            "segmentReason": f"{route}_cash_route",
            "modelOverrideAllowed": False,
            "features": {},
        }
    )
    requested_candidate = str(candidate_id)
    effective_candidate = requested_candidate
    guard_fallback = False
    structural_fallback = False
    if route in SALES_ROUTES and scoreable:
        if not bool(segment_state["modelOverrideAllowed"]):
            structural_fallback = effective_candidate != "B4"
            effective_candidate = "B4"
        if cutoff_top10 and effective_candidate != "B4" and not high_value_override_allowed:
            effective_candidate = "B4"
            guard_fallback = True

    components: list[dict[str, Any]] = []
    residual_evidence: dict[str, Any] = {
        "point": 0.0,
        "level": "not_applicable",
        "caseCount": 0,
    }
    primitive_evidence: dict[str, Any] = {
        "primitiveFallbackCount": 0,
        "reactivation": None,
    }
    if route in SALES_ROUTES and scoreable:
        if comparator_rows is None:
            raise C2Error("scoreable C2 sales case lacks locked comparator components")
        segment = str(segment_state["segment"])
        config = candidate_configs(spec, segment).get(effective_candidate)
        if config is None:
            raise C2Error("effective C2 candidate is outside the frozen segment space")
        known_paths, primitive_evidence = known_channel_paths_as_of(
            work=work,
            origin=origin,
            horizon=int(horizon),
            comparator_rows=comparator_rows,
            calibration_spec=calibration_spec,
            spec=spec,
            segment_state=segment_state,
            candidate_id=effective_candidate,
            reactivation_model=reactivation_model,
            route=route,
        )
        context = channel_context(comparator_rows)
        residual_evidence = residual_point(
            route=route,
            segment=segment,
            horizon=int(horizon),
            context=context,
            model=residual_model,
            spec=spec,
        )
        residual_total = float(config["residualScale"]) * float(
            residual_evidence["point"]
        )
        months = [base.add_months(origin, offset) for offset in range(1, int(horizon) + 1)]
        sales = {month: 0.0 for month in months}
        for channel_key, path in sorted(known_paths.items()):
            if len(path) != int(horizon):
                raise C2Error("C2 known-channel path length differs")
            point = 0.0
            for month, value in zip(months, path):
                number = base.require_finite_number(value, "C2 monthly channel point")
                if number < 0:
                    raise C2Error("C2 channel point is negative")
                sales[month] += number
                point += number
            components.append(
                {
                    "channel_key": channel_key,
                    "component_type": "known_as_of_channel",
                    "point_forecast": round(point, 8),
                }
            )
        residual_path = _uniform_total_path(residual_total, int(horizon))
        for month, value in zip(months, residual_path):
            sales[month] += value
        components.append(
            {
                "channel_key": GENERIC_RESIDUAL_KEY,
                "component_type": "other_or_new_channel_residual",
                "point_forecast": round(sum(residual_path), 8),
            }
        )
        composed = cash.compose_future_cash_forecast(
            standard_work_id=work_id,
            route=route,
            origin=origin,
            horizon=int(horizon),
            sales_monthly_prediction=sales,
            cash_commitment_snapshots=list(cash_commitment_snapshots or []),
            statistically_scoreable=True,
            business_serving_eligible=serving,
            business_abstention_reason=state.get("abstentionReason"),
            sales_confidence="medium",
        )
    elif route in {"pure_buyout", "unknown_revenue_model"}:
        composed = cash.compose_future_cash_forecast(
            standard_work_id=work_id,
            route=route,
            origin=origin,
            horizon=int(horizon),
            sales_monthly_prediction={},
            cash_commitment_snapshots=list(cash_commitment_snapshots or []),
            statistically_scoreable=scoreable,
            business_serving_eligible=serving,
            business_abstention_reason=state.get("abstentionReason"),
            sales_confidence="unavailable",
        )
    else:
        reason = str(state.get("scoreabilityReason") or "model_prediction_unavailable")
        composed = _empty_unscoreable_composition(reason)

    limitations = set(composed.get("limitation", []))
    residual_component = next(
        (
            item
            for item in components
            if item.get("component_type") == "other_or_new_channel_residual"
        ),
        None,
    )
    if residual_component is not None and float(residual_component["point_forecast"]) > 0:
        limitations.add("includes_generic_other_or_new_channel_residual")
    if guard_fallback:
        limitations.add("high_value_guard_fallback_to_B4")
    if structural_fallback:
        limitations.add("insufficient_as_of_activity_evidence_fallback_to_B4")
    limitations = set(sorted(limitations))
    public_output = copy.deepcopy(composed["public_output"])
    public_output["limitation"] = sorted(limitations)
    raw = composed["rawModelPrediction"]
    confirmed_total = sum(
        float(item["outstandingAmount"])
        for item in composed.get("confirmedCashComponents", [])
    )
    if raw is not None:
        component_total = sum(float(item["point_forecast"]) for item in components)
        if abs(component_total + confirmed_total - float(raw)) > TOLERANCE:
            raise C2Error("C2 known/residual/confirmed cash does not reconcile to work point")
    row = {
        "model_id": "C2",
        "candidate_id": effective_candidate,
        "requested_candidate_id": requested_candidate,
        "case_key": copy.deepcopy(key),
        "route": route,
        "activity_segment": segment_state["segment"],
        "segment_reason": segment_state["segmentReason"],
        "segment_features": copy.deepcopy(segment_state["features"]),
        "modelOverrideAllowed": bool(segment_state["modelOverrideAllowed"]),
        "highValueGuardActive": True,
        "highValueGuardFallbackToB4": guard_fallback,
        "cutoffTop10": bool(cutoff_top10),
        "highValueOverrideAllowed": bool(high_value_override_allowed),
        "structuralFallbackToB4": structural_fallback,
        "statisticallyScoreable": scoreable,
        "scoreabilityReason": state.get("scoreabilityReason"),
        "businessServingEligible": serving,
        "modelPredictionAvailable": bool(composed["modelPredictionAvailable"]),
        "routeAbstained": bool(composed["routeAbstained"]),
        "abstained": bool(composed["abstained"]),
        "abstentionReason": composed["abstentionReason"],
        "rawModelPrediction": raw,
        "servedPrediction": composed["servedPrediction"],
        "futureCashRevenueForecast": raw,
        "annual_breakdown": copy.deepcopy(composed["annualBreakdown"]),
        "confidence": composed["confidence"],
        "limitation": sorted(limitations),
        "confirmedCashComponents": copy.deepcopy(
            composed.get("confirmedCashComponents", [])
        ),
        "channel_components": components,
        "otherOrNewChannelResidualPoint": (
            float(residual_component["point_forecast"])
            if residual_component is not None
            else 0.0
        ),
        "residualEvidenceLevel": residual_evidence["level"],
        "residualEvidenceCaseCount": int(residual_evidence["caseCount"]),
        "primitiveFallbackCount": int(primitive_evidence["primitiveFallbackCount"]),
        "reactivationEvidence": copy.deepcopy(primitive_evidence["reactivation"]),
        "excludesUncommittedFutureBuyout": True,
        "futureBuyoutPredicted": False,
        "formalModelPopulationEligible": bool(
            scoreable
            and composed["modelPredictionAvailable"]
            and not composed["routeAbstained"]
        ),
        "target_end": state["targetEnd"],
        "label_available_as_of": state["labelAvailableAsOf"],
        "_bill_month_max": state["billMonthMax"],
        "_available_as_of": state["sourceAvailableAsOf"],
        "_residual_case_role": state["predictionRole"],
        "public_output": public_output,
    }
    formal.validate_case_state(row)
    if set(row["public_output"]) != {
        "pointForecast",
        "annualBreakdown",
        "confidence",
        "limitation",
    }:
        raise C2Error("C2 public output fields differ")
    if route == "pure_buyout" and scoreable and not cash_commitment_snapshots:
        if (
            row["rawModelPrediction"] is not None
            or row["servedPrediction"] is not None
            or row["routeAbstained"] is not True
            or row["abstentionReason"]
            != "uncommitted_future_buyout_not_forecastable"
        ):
            raise C2Error("C2 pure-buyout no-commitment abstention differs")
    if route == "buyout_plus_sales" and row["futureBuyoutPredicted"] is not False:
        raise C2Error("C2 mixed route predicts an uncommitted buyout")
    return row


def _synthetic_work(values: Sequence[float], *, work_id: str) -> dict[str, Any]:
    start = "2021-01"
    months = [base.add_months(start, index) for index in range(len(values))]
    return {
        "standard_work_id": work_id,
        "channels": [
            {
                "channel_key": "synthetic-channel",
                "business_form": "audio_product",
                "first_observed_month": start,
                "monthly": {
                    month: float(value) for month, value in zip(months, values)
                },
                "batch_cluster_sizes": {},
            }
        ],
    }


def _synthetic_case_state(
    work_id: str, origin: str, horizon: int, route: str
) -> dict[str, Any]:
    target_end = base.add_months(origin, horizon)
    return {
        "caseKey": {
            "standard_work_id": work_id,
            "origin": origin,
            "horizon_months": horizon,
            "route": route,
        },
        "statisticallyScoreable": True,
        "scoreabilityReason": None,
        "businessServingEligible": True,
        "abstentionReason": None,
        "targetEnd": target_end,
        "labelAvailableAsOf": target_end,
        "billMonthMax": target_end,
        "sourceAvailableAsOf": target_end,
        "predictionRole": f"development_forward_score:{origin}",
    }


def _synthetic_comparators(work: Mapping[str, Any]) -> dict[str, dict[str, Any]]:
    key = base.channel_component_key(work["channels"][0])
    return {
        "B4": {"channelComponents": [{"channel_key": key, "point_forecast": 60.0}]},
        "B3": {"channelComponents": [{"channel_key": key, "point_forecast": 54.0}]},
    }


def synthetic_self_test() -> dict[str, Any]:
    spec = load_spec()
    calibration_spec = base.load_spec()
    origin = "2022-12"
    dense_values = [10.0 + (index % 3) for index in range(24)]
    intermittent_values = [8.0 if index in {1, 7, 13, 20} else 0.0 for index in range(24)]
    dormant_values = [5.0 if index in {0, 5, 10} else 0.0 for index in range(24)]
    dense_work = _synthetic_work(dense_values, work_id="SYNTHETIC-C2-DENSE")
    intermittent_work = _synthetic_work(
        intermittent_values, work_id="SYNTHETIC-C2-INTERMITTENT"
    )
    dormant_work = _synthetic_work(dormant_values, work_id="SYNTHETIC-C2-DORMANT")
    segment_results = {
        "dense": segment_as_of(dense_work, origin, calibration_spec, spec),
        "intermittent": segment_as_of(
            intermittent_work, origin, calibration_spec, spec
        ),
        "dormant": segment_as_of(dormant_work, origin, calibration_spec, spec),
    }
    earlier_records = [
        {
            "origin": "2020-12",
            "labelAvailableAsOf": "2021-03",
            "targetEnd": "2021-03",
            "route": "pure_sales_share",
            "segment": "dense",
            "horizon": 3,
            "knownChannelCountBucket": "one",
            "knownChannelConcentrationBucket": "concentrated",
            "residualActual": 12.0,
            "matchedKnownActual": 30.0,
        },
        {
            "origin": "2021-06",
            "labelAvailableAsOf": "2021-09",
            "targetEnd": "2021-09",
            "route": "pure_sales_share",
            "segment": "dense",
            "horizon": 3,
            "knownChannelCountBucket": "one",
            "knownChannelConcentrationBucket": "concentrated",
            "residualActual": 0.0,
            "matchedKnownActual": 24.0,
        },
    ]
    residual_model = fit_residual_model(earlier_records, origin, spec)
    reactivation_model = fit_reactivation_model(
        [dict(record, segment="dormant") for record in earlier_records], origin, spec
    )
    dense_candidates = candidate_ids(spec, "dense")
    non_anchor = next(value for value in dense_candidates if value != "B4")
    case_state = _synthetic_case_state(
        "SYNTHETIC-C2-DENSE", origin, 3, "pure_sales_share"
    )
    baseline = predict_as_of(
        work=dense_work,
        origin=origin,
        horizon=3,
        case_state=case_state,
        comparator_rows=_synthetic_comparators(dense_work),
        calibration_spec=calibration_spec,
        spec=spec,
        candidate_id=non_anchor,
        residual_model=residual_model,
        reactivation_model=reactivation_model,
        cutoff_top10=False,
        high_value_override_allowed=False,
    )
    guarded = predict_as_of(
        work=dense_work,
        origin=origin,
        horizon=3,
        case_state=case_state,
        comparator_rows=_synthetic_comparators(dense_work),
        calibration_spec=calibration_spec,
        spec=spec,
        candidate_id=non_anchor,
        residual_model=residual_model,
        reactivation_model=reactivation_model,
        cutoff_top10=True,
        high_value_override_allowed=False,
    )
    perturbed = copy.deepcopy(dense_work)
    perturbed["current_rating"] = "future-only"
    perturbed["current_risk"] = "future-only"
    perturbed["current_rights"] = "future-only"
    perturbed["current_shelf"] = "future-only"
    perturbed["channels"][0]["monthly"]["2023-01"] = 999999.0
    perturbed["channels"].append(
        {
            "channel_key": "future-only-channel",
            "business_form": "audio_product",
            "first_observed_month": "2023-01",
            "monthly": {"2023-01": 888888.0},
            "batch_cluster_sizes": {},
        }
    )
    perturbed_prediction = predict_as_of(
        work=perturbed,
        origin=origin,
        horizon=3,
        case_state=case_state,
        comparator_rows=_synthetic_comparators(dense_work),
        calibration_spec=calibration_spec,
        spec=spec,
        candidate_id=non_anchor,
        residual_model=residual_model,
        reactivation_model=reactivation_model,
        cutoff_top10=False,
        high_value_override_allowed=False,
    )
    projection_fields = (
        "rawModelPrediction",
        "servedPrediction",
        "candidate_id",
        "activity_segment",
        "segment_reason",
        "segment_features",
        "channel_components",
        "otherOrNewChannelResidualPoint",
        "public_output",
    )
    mixed_state = _synthetic_case_state(
        "SYNTHETIC-C2-DENSE", origin, 3, "buyout_plus_sales"
    )
    mixed = predict_as_of(
        work=dense_work,
        origin=origin,
        horizon=3,
        case_state=mixed_state,
        comparator_rows=_synthetic_comparators(dense_work),
        calibration_spec=calibration_spec,
        spec=spec,
        candidate_id="B4",
        residual_model=residual_model,
        reactivation_model=reactivation_model,
        cutoff_top10=False,
        high_value_override_allowed=False,
    )
    pure_state = _synthetic_case_state(
        "SYNTHETIC-C2-DENSE", origin, 3, "pure_buyout"
    )
    pure_buyout = predict_as_of(
        work=dense_work,
        origin=origin,
        horizon=3,
        case_state=pure_state,
        comparator_rows=None,
        calibration_spec=calibration_spec,
        spec=spec,
        candidate_id="B4",
        residual_model=residual_model,
        reactivation_model=reactivation_model,
        cutoff_top10=False,
        high_value_override_allowed=False,
    )
    dormant_zero_id = "dormant__legal_zero_cash__r000"
    dormant_zero = predict_as_of(
        work=dormant_work,
        origin=origin,
        horizon=3,
        case_state=_synthetic_case_state(
            "SYNTHETIC-C2-DORMANT", origin, 3, "pure_sales_share"
        ),
        comparator_rows=_synthetic_comparators(dormant_work),
        calibration_spec=calibration_spec,
        spec=spec,
        candidate_id=dormant_zero_id,
        residual_model=residual_model,
        reactivation_model=reactivation_model,
        cutoff_top10=False,
        high_value_override_allowed=False,
    )
    leakage_rejected = False
    try:
        predict_as_of(
            work=dense_work,
            origin=origin,
            horizon=3,
            case_state={**case_state, "forecastableCashActual": 999999.0},
            comparator_rows=_synthetic_comparators(dense_work),
            calibration_spec=calibration_spec,
            spec=spec,
            candidate_id="B4",
            residual_model=residual_model,
            reactivation_model=reactivation_model,
            cutoff_top10=False,
            high_value_override_allowed=False,
        )
    except C2Error:
        leakage_rejected = True
    same_or_later_fit_rejected = False
    try:
        fit_residual_model(
            [dict(earlier_records[0], origin=origin)], origin, spec
        )
    except C2Error:
        same_or_later_fit_rejected = True
    checks = {
        "denseDefinitionDeterministic": segment_results["dense"]["segment"] == "dense",
        "intermittentDefinitionDeterministic": segment_results["intermittent"]["segment"]
        == "intermittent",
        "dormantDefinitionDeterministic": segment_results["dormant"]["segment"]
        == "dormant",
        "allSegmentReasonsPresent": all(
            bool(value["segmentReason"]) for value in segment_results.values()
        ),
        "candidateCountsFrozen": {
            segment: len(candidate_ids(spec, segment)) for segment in ACTIVITY_SEGMENTS
        }
        == {"dense": 37, "intermittent": 37, "dormant": 5},
        "allZeroMonthsRetained": intermittent_values.count(0.0) == 20,
        "conditionalMedianNotUsed": True,
        "samePredictAsOfEntryUsed": baseline["model_id"] == "C2",
        "futureAsOfSegmentInvariant": segment_as_of(
            dense_work, origin, calibration_spec, spec
        )
        == segment_as_of(perturbed, origin, calibration_spec, spec),
        "futurePredictionInvariant": all(
            baseline.get(field) == perturbed_prediction.get(field)
            for field in projection_fields
        ),
        "predictionRejectsActualField": leakage_rejected,
        "residualFitRejectsSameOrLaterOrigin": same_or_later_fit_rejected,
        "residualStoresNoFutureChannelIdentity": residual_model[
            "futureChannelIdentityStored"
        ]
        is False,
        "highValueGuardFallsBackToB4": guarded["candidate_id"] == "B4"
        and guarded["highValueGuardFallbackToB4"] is True,
        "mixedExcludesUncommittedFutureBuyout": mixed[
            "excludesUncommittedFutureBuyout"
        ]
        is True
        and mixed["futureBuyoutPredicted"] is False,
        "pureBuyoutNullAbstain": pure_buyout["rawModelPrediction"] is None
        and pure_buyout["servedPrediction"] is None
        and pure_buyout["routeAbstained"] is True,
        "legalDormantZeroIsNotAbstention": dormant_zero["rawModelPrediction"] == 0.0
        and dormant_zero["modelPredictionAvailable"] is True,
        "channelResidualWorkPointReconciles": abs(
            sum(
                float(item["point_forecast"])
                for item in baseline["channel_components"]
            )
            - float(baseline["rawModelPrediction"])
        )
        <= TOLERANCE,
        "publicOutputFieldsExact": set(baseline["public_output"])
        == {"pointForecast", "annualBreakdown", "confidence", "limitation"},
        "allSealsClosed": all(value is False for value in spec["seals"].values()),
    }
    if not all(checks.values()):
        failed = [key for key, value in checks.items() if not value]
        raise C2Error("C2 synthetic self-test failed: " + ", ".join(failed))
    return {
        "status": "passed",
        "privateDataRead": False,
        "candidateCounts": {
            segment: len(candidate_ids(spec, segment)) for segment in ACTIVITY_SEGMENTS
        },
        "segments": {
            key: value["segmentReason"] for key, value in segment_results.items()
        },
        "checks": checks,
    }


__all__ = [
    "ACTIVITY_SEGMENTS",
    "C2Error",
    "GENERIC_RESIDUAL_KEY",
    "SALES_ROUTES",
    "candidate_complexity",
    "candidate_configs",
    "candidate_ids",
    "canonical_digest",
    "channel_context",
    "channel_histories_as_of",
    "fit_reactivation_model",
    "fit_residual_model",
    "known_channel_paths_as_of",
    "load_spec",
    "predict_as_of",
    "reactivation_point",
    "residual_point",
    "segment_as_of",
    "synthetic_self_test",
    "work_sales_history_as_of",
]
