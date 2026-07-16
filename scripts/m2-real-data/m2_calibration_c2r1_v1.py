#!/usr/bin/env python3
"""Frozen C2-R.1 channel primitives and formal-cash prediction composer."""

from __future__ import annotations

import copy
import hashlib
import json
import math
from pathlib import Path
from typing import Any, Mapping, Sequence

import m2_calibration_v1 as base
import m2_formal_cash_comparator_v1 as formal
import m2_formal_cash_target_v1 as cash


ROOT = Path(__file__).resolve().parents[2]
SPEC_PATH = (
    ROOT
    / "src"
    / "domain"
    / "oldProductEvaluation"
    / "calibrationSpec.c2r1.v1.amendment.json"
)
SALES_ROUTES = frozenset({"pure_sales_share", "buyout_plus_sales"})
COMPARATOR_COMPONENTS = ("B0b", "B1", "B3", "B4")
PRIMITIVE_COMPONENTS = (
    "trailing_mean_3",
    "trailing_mean_6",
    "trailing_mean_12",
    "seasonal_naive_12",
    "zero_aware_recent_mean_18",
    "winsorized_robust_mean_18",
    "damped_trend_18",
    "recency_weighted_mean_18",
)
TOLERANCE = 1e-6


class C2R1Error(RuntimeError):
    """A frozen C2-R.1 modeling or routing invariant was violated."""


def canonical_digest(value: Any) -> str:
    return hashlib.sha256(base.canonical_json_bytes(value)).hexdigest()


def load_spec(path: Path = SPEC_PATH) -> dict[str, Any]:
    spec = json.loads(path.read_text(encoding="utf-8"))
    if (
        spec.get("version") != "calibration-spec-c2r1-v1"
        or spec.get("decisionStatus") != "not_for_formal_decision"
        or spec.get("formalDecisionAuthorized") is not False
        or spec.get("releaseAuthorized") is not False
        or any(value is not False for value in spec.get("seals", {}).values())
    ):
        raise C2R1Error("C2-R.1 spec identity or seal differs")
    components = tuple(spec["candidateSpace"]["singleComponents"])
    if components != (*COMPARATOR_COMPONENTS, *PRIMITIVE_COMPONENTS):
        raise C2R1Error("C2-R.1 single-component space differs")
    if len(candidate_ids(spec)) != int(spec["candidateSpace"]["candidateCount"]):
        raise C2R1Error("C2-R.1 candidate count differs")
    if spec["formalCashTarget"]["futureBuyoutProbabilityModelIncluded"] is not False:
        raise C2R1Error("C2-R.1 permits a future buyout probability model")
    return spec


def candidate_ids(spec: Mapping[str, Any]) -> tuple[str, ...]:
    singles = tuple(str(value) for value in spec["candidateSpace"]["singleComponents"])
    expansion = spec["candidateSpace"]["blendExpansion"]
    blends = tuple(
        f"blend_B4__{partner}__w{int(round(float(weight) * 100)):03d}"
        for partner in expansion["partners"]
        for weight in expansion["anchorWeights"]
    )
    values = (*singles, *blends)
    if len(values) != len(set(values)):
        raise C2R1Error("C2-R.1 candidate identifiers are duplicated")
    return values


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


def _constant_path(value: float, horizon: int) -> list[float]:
    return [max(0.0, float(value)) for _ in range(int(horizon))]


def _uniform_total_path(total: float, horizon: int) -> list[float]:
    if int(horizon) <= 0:
        return []
    monthly = max(0.0, float(total)) / int(horizon)
    return [monthly for _ in range(int(horizon))]


def primitive_path(
    method: str,
    history: Sequence[float],
    horizon: int,
    b4_total: float,
    spec: Mapping[str, Any],
) -> tuple[list[float], bool]:
    """Forecast one sales component while retaining every zero-income month."""

    values = [base.require_finite_number(value, "channel history") for value in history]
    if any(value < 0 for value in values):
        # Negative adjustments remain in actual audit but cannot become a
        # negative future cash point. The primitive fails to the frozen anchor.
        return _uniform_total_path(b4_total, horizon), True
    parameters = spec["candidateSpace"]["primitiveParameters"]
    minimum = int(parameters["minimumHistoryMonthsBeforePrimitive"])
    if len(values) < minimum:
        return _uniform_total_path(b4_total, horizon), True
    if method.startswith("trailing_mean_"):
        window = int(method.rsplit("_", 1)[1])
        sample = values[-min(window, len(values)) :]
        return _constant_path(sum(sample) / len(sample), horizon), False
    if method == "seasonal_naive_12":
        lag = int(parameters["seasonalLagMonths"])
        if len(values) < lag:
            return _uniform_total_path(b4_total, horizon), True
        seasonal = values[-lag:]
        return [seasonal[index % lag] for index in range(int(horizon))], False
    if method == "zero_aware_recent_mean_18":
        window = int(parameters["zeroAwareWindowMonths"])
        sample = values[-min(window, len(values)) :]
        return _constant_path(sum(sample) / len(sample), horizon), False
    if method == "winsorized_robust_mean_18":
        window = int(parameters["robustWindowMonths"])
        sample = values[-min(window, len(values)) :]
        lower = _quantile(sample, float(parameters["winsorLowerQuantile"]))
        upper = _quantile(sample, float(parameters["winsorUpperQuantile"]))
        winsorized = [min(upper, max(lower, value)) for value in sample]
        return _constant_path(sum(winsorized) / len(winsorized), horizon), False
    if method == "damped_trend_18":
        window = int(parameters["dampedTrendWindowMonths"])
        sample = values[-min(window, len(values)) :]
        center = (len(sample) - 1) / 2.0
        denominator = sum((index - center) ** 2 for index in range(len(sample)))
        slope = (
            sum(
                (index - center) * (value - sum(sample) / len(sample))
                for index, value in enumerate(sample)
            )
            / denominator
            if denominator > 0
            else 0.0
        )
        damping = float(parameters["trendDamping"])
        return [
            max(0.0, sample[-1] + damping * slope * offset)
            for offset in range(1, int(horizon) + 1)
        ], False
    if method == "recency_weighted_mean_18":
        window = int(parameters["recencyWindowMonths"])
        sample = values[-min(window, len(values)) :]
        decay = float(parameters["recencyDecay"])
        weights = [decay ** (len(sample) - 1 - index) for index in range(len(sample))]
        mean = sum(value * weight for value, weight in zip(sample, weights)) / sum(
            weights
        )
        return _constant_path(mean, horizon), False
    raise C2R1Error(f"unknown C2-R.1 primitive: {method}")


def channel_histories_as_of(
    work: Mapping[str, Any],
    origin: str,
    calibration_spec: Mapping[str, Any],
) -> dict[str, list[float]]:
    routing = base.route_work_as_of(work, origin, calibration_spec)
    if routing["route"] not in SALES_ROUTES:
        return {}
    index = base.channel_index(work)
    first = str(calibration_spec["authority"]["firstBillMonth"])
    months = base.month_range(first, origin)
    output: dict[str, list[float]] = {}
    for routed in routing["channels"]:
        if routed["label"] not in {"sales_share_channel", "mixed_channel"}:
            continue
        key = str(routed["channel_key"])
        if key in output:
            raise C2R1Error("duplicate as-of sales channel")
        channel = index[key]
        monthly = channel.get("monthly", {}) or {}
        buyout_months = (
            set(routed.get("buyoutEventMonths", []))
            if routed["label"] == "mixed_channel"
            else set()
        )
        output[key] = [
            0.0
            if month in buyout_months
            else base.require_finite_number(monthly.get(month, 0.0), "monthly cash")
            for month in months
        ]
    return output


def _component_totals(row: Mapping[str, Any]) -> dict[str, float]:
    output: dict[str, float] = {}
    for component in row.get("channelComponents", []) or []:
        key = str(component.get("channel_key", ""))
        if not key or key in output:
            raise C2R1Error("locked comparator channel component differs")
        point = base.require_finite_number(
            component.get("point_forecast"), "locked comparator channel point"
        )
        if point < 0:
            raise C2R1Error("locked comparator channel point is negative")
        output[key] = point
    return output


def candidate_channel_paths(
    *,
    work: Mapping[str, Any],
    origin: str,
    horizon: int,
    comparator_rows: Mapping[str, Mapping[str, Any]],
    calibration_spec: Mapping[str, Any],
    spec: Mapping[str, Any],
) -> dict[str, dict[str, list[float]]]:
    comparator_totals = {
        model: _component_totals(comparator_rows[model])
        for model in COMPARATOR_COMPONENTS
    }
    reference_keys = set(comparator_totals["B4"])
    if not reference_keys or any(
        set(comparator_totals[model]) != reference_keys
        for model in COMPARATOR_COMPONENTS
    ):
        raise C2R1Error("formal comparator channel keys differ")
    histories = channel_histories_as_of(work, origin, calibration_spec)
    if set(histories) != reference_keys:
        raise C2R1Error("as-of sales history differs from locked comparator channels")
    singles: dict[str, dict[str, list[float]]] = {}
    for model in COMPARATOR_COMPONENTS:
        singles[model] = {
            key: _uniform_total_path(comparator_totals[model][key], horizon)
            for key in sorted(reference_keys)
        }
    for method in PRIMITIVE_COMPONENTS:
        paths: dict[str, list[float]] = {}
        for key in sorted(reference_keys):
            paths[key], _fallback = primitive_path(
                method,
                histories[key],
                horizon,
                comparator_totals["B4"][key],
                spec,
            )
        singles[method] = paths
    output = copy.deepcopy(singles)
    expansion = spec["candidateSpace"]["blendExpansion"]
    for partner in expansion["partners"]:
        for weight_value in expansion["anchorWeights"]:
            weight = float(weight_value)
            candidate = f"blend_B4__{partner}__w{int(round(weight * 100)):03d}"
            output[candidate] = {
                key: [
                    weight * anchor + (1.0 - weight) * other
                    for anchor, other in zip(
                        singles["B4"][key], singles[str(partner)][key]
                    )
                ]
                for key in sorted(reference_keys)
            }
    if set(output) != set(candidate_ids(spec)):
        raise C2R1Error("materialized C2-R.1 candidate space differs")
    return output


def _future_monthly_map(
    origin: str, horizon: int, channel_paths: Mapping[str, Sequence[float]]
) -> dict[str, float]:
    months = [base.add_months(origin, offset) for offset in range(1, horizon + 1)]
    output = {month: 0.0 for month in months}
    for path in channel_paths.values():
        if len(path) != horizon:
            raise C2R1Error("candidate channel path length differs")
        for month, value in zip(months, path):
            number = base.require_finite_number(value, "candidate monthly point")
            if number < 0:
                raise C2R1Error("candidate monthly point is negative")
            output[month] += number
    return output


def build_prediction(
    *,
    template: Mapping[str, Any],
    candidate_id: str,
    channel_paths: Mapping[str, Sequence[float]] | None,
) -> dict[str, Any]:
    """Build a prediction projection before any formal-cash actual is joined."""

    key = template["caseKey"]
    work_id = str(key["standard_work_id"])
    origin = str(key["origin"])
    horizon = int(key["horizon_months"])
    route = str(key["route"])
    scoreable = template.get("statisticallyScoreable")
    serving = template.get("businessServingEligible")
    if type(scoreable) is not bool or type(serving) is not bool:
        raise C2R1Error("frozen C2-R.1 case state is not native boolean")
    role = str(template["predictionRole"])
    if route in SALES_ROUTES and scoreable:
        if channel_paths is None:
            raise C2R1Error("scoreable sales case lacks candidate channel paths")
        sales = _future_monthly_map(origin, horizon, channel_paths)
        composed = cash.compose_future_cash_forecast(
            standard_work_id=work_id,
            route=route,
            origin=origin,
            horizon=horizon,
            sales_monthly_prediction=sales,
            cash_commitment_snapshots=[],
            statistically_scoreable=True,
            business_serving_eligible=serving,
            business_abstention_reason=template.get("abstentionReason"),
            sales_confidence="medium",
        )
        components = [
            {
                "channel_key": channel_key,
                "point_forecast": round(sum(path), 8),
            }
            for channel_key, path in sorted(channel_paths.items())
        ]
    elif route in {"pure_buyout", "unknown_revenue_model"}:
        composed = cash.compose_future_cash_forecast(
            standard_work_id=work_id,
            route=route,
            origin=origin,
            horizon=horizon,
            sales_monthly_prediction={},
            cash_commitment_snapshots=[],
            statistically_scoreable=scoreable,
            business_serving_eligible=serving,
            business_abstention_reason=template.get("abstentionReason"),
            sales_confidence="unavailable",
        )
        components = []
    else:
        # Frozen unscoreable sales cases stay null. Calling the formal composer
        # with an empty path would incorrectly manufacture a zero prediction.
        reason = template.get("scoreabilityReason") or "model_prediction_unavailable"
        composed = {
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
        components = []
    row = {
        "model_id": "C2-R.1",
        "candidate_id": candidate_id,
        "case_key": {
            "standard_work_id": work_id,
            "origin": origin,
            "horizon_months": horizon,
            "route": route,
        },
        "statisticallyScoreable": scoreable,
        "scoreabilityReason": template.get("scoreabilityReason"),
        "businessServingEligible": serving,
        "modelPredictionAvailable": bool(composed["modelPredictionAvailable"]),
        "routeAbstained": bool(composed["routeAbstained"]),
        "abstained": bool(composed["abstained"]),
        "abstentionReason": composed["abstentionReason"],
        "rawModelPrediction": composed["rawModelPrediction"],
        "servedPrediction": composed["servedPrediction"],
        "futureCashRevenueForecast": composed["rawModelPrediction"],
        "annual_breakdown": copy.deepcopy(composed["annualBreakdown"]),
        "confidence": composed["confidence"],
        "limitation": copy.deepcopy(composed["limitation"]),
        "confirmedCashComponents": copy.deepcopy(
            composed.get("confirmedCashComponents", [])
        ),
        "channel_components": components,
        "excludesUncommittedFutureBuyout": True,
        "futureBuyoutPredicted": False,
        "formalModelPopulationEligible": bool(
            scoreable
            and composed["modelPredictionAvailable"]
            and not composed["routeAbstained"]
        ),
        "target_end": template["targetEnd"],
        "label_available_as_of": template["labelAvailableAsOf"],
        "_bill_month_max": template["billMonthMax"],
        "_available_as_of": template["sourceAvailableAsOf"],
        "_residual_case_role": role,
        "public_output": copy.deepcopy(composed["public_output"]),
    }
    formal.validate_case_state(row)
    if route == "pure_buyout" and scoreable and (
        row["rawModelPrediction"] is not None
        or row["servedPrediction"] is not None
        or row["routeAbstained"] is not True
        or row["abstentionReason"]
        != "uncommitted_future_buyout_not_forecastable"
    ):
        raise C2R1Error("C2-R.1 pure-buyout abstention differs")
    return row


def synthetic_self_test() -> dict[str, Any]:
    spec = load_spec()
    values = [0.0, 0.0, 3.0, 0.0, 6.0, 0.0, 0.0, 9.0, 0.0, 0.0, 0.0, 12.0]
    checks = {}
    for method in PRIMITIVE_COMPONENTS:
        path, fallback = primitive_path(method, values, 6, 30.0, spec)
        checks[method] = (
            len(path) == 6
            and all(math.isfinite(value) and value >= 0 for value in path)
            and fallback is False
        )
    short, fallback = primitive_path("trailing_mean_3", [0.0, 4.0], 4, 20.0, spec)

    # C2-R.1 primitives may only see the same cutoff-available channel history
    # as the frozen predict_as_of kernel. Exercise future cash, post-hoc state,
    # later spike evidence, and a future-only channel together.
    calibration_spec = base.load_spec()
    origin = "2022-12"
    work = base._synthetic_work()  # pylint: disable=protected-access
    history_before = channel_histories_as_of(work, origin, calibration_spec)
    perturbed = copy.deepcopy(work)
    for channel in perturbed["channels"]:
        for month in list(channel["monthly"]):
            if month > origin:
                channel["monthly"][month] = (
                    float(channel["monthly"][month]) * 97.0 + 8888.0
                )
    perturbed["current_shelf_status"] = "future_post_hoc_change"
    perturbed["current_rights_status"] = "future_post_hoc_change"
    perturbed["current_source"] = "future_post_hoc_change"
    perturbed["channels"][0]["spike_confirmations"] = [
        {
            "candidate_month": "2021-01",
            "confirmed_type": "true_anomaly",
            "available_as_of": "2023-01",
        }
    ]
    perturbed["channels"].append(
        {
            "channel_key": "future-only",
            "business_form": "audio_product",
            "first_observed_month": "2023-02",
            "monthly": {"2023-02": 99999.0, "2023-03": 88888.0},
            "batch_cluster_sizes": {"2023-02": 10},
        }
    )
    history_after = channel_histories_as_of(perturbed, origin, calibration_spec)
    synthetic_comparators = {
        model: {
            "channelComponents": [
                {
                    "channel_key": key,
                    "point_forecast": float((model_index + 1) * (key_index + 1) * 12),
                }
                for key_index, key in enumerate(sorted(history_before))
            ]
        }
        for model_index, model in enumerate(COMPARATOR_COMPONENTS)
    }
    candidates_before = candidate_channel_paths(
        work=work,
        origin=origin,
        horizon=6,
        comparator_rows=synthetic_comparators,
        calibration_spec=calibration_spec,
        spec=spec,
    )
    candidates_after = candidate_channel_paths(
        work=perturbed,
        origin=origin,
        horizon=6,
        comparator_rows=synthetic_comparators,
        calibration_spec=calibration_spec,
        spec=spec,
    )
    checks.update(
        {
            "allZeroMonthsRetained": sum(values) == 30.0 and values.count(0.0) == 8,
            "shortHistoryUsesFrozenB4": fallback and math.isclose(sum(short), 20.0),
            "candidateCountFrozen": len(candidate_ids(spec)) == 45,
            "futureAsOfChannelHistoryInvariant": history_before == history_after,
            "futureCandidatePathInvariant": candidates_before == candidates_after,
            "noFutureBuyoutProbability": spec["formalCashTarget"][
                "futureBuyoutProbabilityModelIncluded"
            ]
            is False,
            "allSealsClosed": all(value is False for value in spec["seals"].values()),
        }
    )
    if not all(checks.values()):
        raise C2R1Error("C2-R.1 synthetic self-test failed")
    return {"status": "passed", "privateDataRead": False, "checks": checks}


__all__ = [
    "C2R1Error",
    "COMPARATOR_COMPONENTS",
    "PRIMITIVE_COMPONENTS",
    "SALES_ROUTES",
    "build_prediction",
    "candidate_channel_paths",
    "candidate_ids",
    "canonical_digest",
    "channel_histories_as_of",
    "load_spec",
    "primitive_path",
    "synthetic_self_test",
]
