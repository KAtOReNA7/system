#!/usr/bin/env python3
"""Pure C2-R revenue-model and channel-aware point-forecast primitives.

This module has no private-data or database side effects.  The replay runner
supplies an as-of work view, the frozen base calibration spec, and the B4 fold
parameters fitted only from earlier development truth.
"""

from __future__ import annotations

import copy
import hashlib
import json
import math
import statistics
from collections import defaultdict
from pathlib import Path
from typing import Any, Mapping, Sequence

import m2_calibration_v1 as base
import m2_calibration_v1_2 as v12


ROOT = Path(__file__).resolve().parents[2]
SPEC_PATH = (
    ROOT
    / "src"
    / "domain"
    / "oldProductEvaluation"
    / "calibrationSpec.c2r.v1.amendment.json"
)
MODEL_ID = "C2-R"
ROUTES = (
    "pure_sales_share",
    "pure_buyout",
    "buyout_plus_sales",
    "unknown_revenue_model",
)
SALES_COMPONENT_IDS = (
    "trailing_mean_3",
    "trailing_mean_6",
    "trailing_mean_12",
    "seasonal_naive_12",
    "recent_robust_mean_12",
    "zero_aware_median_12",
    "damped_trend_12",
    "recency_weighted_mean_12",
    "B1_channel_point",
    "B3_channel_point",
    "B4_channel_point",
)


class C2RContractError(RuntimeError):
    """The frozen C2-R contract or as-of boundary was violated."""


def canonical_digest(value: Any) -> str:
    return hashlib.sha256(base.canonical_json_bytes(value)).hexdigest()


def load_spec(path: Path = SPEC_PATH) -> dict[str, Any]:
    contract = json.loads(path.read_text(encoding="utf-8"))
    parent = v12.load_amendment()
    if canonical_digest(parent) != contract.get("parentBinding", {}).get(
        "canonicalDigestSha256"
    ):
        raise C2RContractError("C2-R parent calibration binding differs")
    if (
        contract.get("version") != "calibration-spec-c2r-v1-amendment"
        or contract.get("decisionStatus") != "not_for_formal_decision"
        or contract.get("candidateIdentity", {}).get("id") != MODEL_ID
    ):
        raise C2RContractError("C2-R identity or decision boundary differs")
    seals = contract.get("seals", {})
    if any(
        seals.get(field) is not False
        for field in (
            "finalHoldoutOpened",
            "embargoShadowOpened",
            "deferred60MonthLabelsOpened",
        )
    ):
        raise C2RContractError("C2-R sealed truth boundary is open")
    if int(
        contract["salesRoute"]["candidateEnumeration"]["expectedCandidateCount"]
    ) != len(enumerate_candidates(contract)):
        raise C2RContractError("C2-R candidate count differs from pre-registration")
    return contract


def enumerate_candidates(contract: Mapping[str, Any]) -> list[dict[str, Any]]:
    sales = contract["salesRoute"]
    components = list(sales["components"])
    candidates = [
        {
            "candidateId": f"single:{component}",
            "weights": {component: 1.0},
            "componentCount": 1,
            "parameterCount": 0,
        }
        for component in components
    ]
    enumeration = sales["candidateEnumeration"]
    anchor = str(enumeration["twoComponentBlendAnchor"])
    for partner in enumeration["blendPartnerComponents"]:
        for partner_weight in enumeration["partnerWeights"]:
            weight = float(partner_weight)
            candidates.append(
                {
                    "candidateId": (
                        f"blend:{anchor}@{1.0 - weight:.2f}+{partner}@{weight:.2f}"
                    ),
                    "weights": {anchor: 1.0 - weight, str(partner): weight},
                    "componentCount": 2,
                    "parameterCount": 1,
                }
            )
    if len({item["candidateId"] for item in candidates}) != len(candidates):
        raise C2RContractError("C2-R candidate IDs are not unique")
    if any(
        any(float(weight) < 0 for weight in item["weights"].values())
        or not math.isclose(sum(item["weights"].values()), 1.0, abs_tol=1e-12)
        for item in candidates
    ):
        raise C2RContractError("C2-R candidate weights are invalid")
    return candidates


def candidate_by_id(candidate_id: str, contract: Mapping[str, Any]) -> dict[str, Any]:
    for candidate in enumerate_candidates(contract):
        if candidate["candidateId"] == candidate_id:
            return copy.deepcopy(candidate)
    raise C2RContractError(f"unknown C2-R candidate: {candidate_id}")


def _future_months(origin: str, horizon: int) -> list[str]:
    return [base.add_months(origin, offset) for offset in range(1, horizon + 1)]


def _uniform(months: Sequence[str], value: float) -> dict[str, float]:
    return {month: max(0.0, float(value)) for month in months}


def _recent(values: Sequence[float], window: int) -> list[float]:
    clean = [max(0.0, base.finite_number(value)) for value in values]
    return clean[-window:] if clean else []


def _winsorized_mean(values: Sequence[float]) -> float:
    if not values:
        return 0.0
    lower = base.linear_quantile(values, 0.1) or 0.0
    upper = base.linear_quantile(values, 0.9) or 0.0
    return base.mean([min(upper, max(lower, value)) for value in values])


def _recency_weighted_mean(values: Sequence[float], decay: float) -> float:
    if not values:
        return 0.0
    weights = [decay ** (len(values) - index - 1) for index in range(len(values))]
    return sum(value * weight for value, weight in zip(values, weights)) / sum(weights)


def _damped_trend(values: Sequence[float], horizon: int, damping: float) -> list[float]:
    if not values:
        return [0.0] * horizon
    if len(values) == 1:
        return [max(0.0, values[0])] * horizon
    x_mean = (len(values) - 1) / 2.0
    y_mean = base.mean(values)
    denominator = sum((index - x_mean) ** 2 for index in range(len(values)))
    slope = (
        sum((index - x_mean) * (value - y_mean) for index, value in enumerate(values))
        / denominator
        if denominator > 0
        else 0.0
    )
    fitted_last = y_mean + slope * (len(values) - 1 - x_mean)
    return [max(0.0, fitted_last + damping * slope * offset) for offset in range(1, horizon + 1)]


def sales_component_monthly_paths(
    history_months: Sequence[str],
    history: Sequence[float],
    origin: str,
    horizon: int,
    calibration_spec: Mapping[str, Any],
    b4_fold_spec: Mapping[str, Any],
) -> dict[str, dict[str, float]]:
    """Build every frozen zero-aware channel component from cutoff history."""

    if any(str(month) > origin for month in history_months):
        raise C2RContractError("sales component received a future history month")
    months = _future_months(origin, int(horizon))
    values = [max(0.0, base.finite_number(value)) for value in history]
    last3 = _recent(values, 3)
    last6 = _recent(values, 6)
    last12 = _recent(values, 12)
    trend = _damped_trend(last12, int(horizon), 0.25)
    b1, _ = base._sales_monthly_forecast(  # pylint: disable=protected-access
        history_months, values, origin, horizon, "B1", calibration_spec
    )
    b3, _ = base._sales_monthly_forecast(  # pylint: disable=protected-access
        history_months, values, origin, horizon, "B3", calibration_spec
    )
    b4, _ = base._sales_monthly_forecast(  # pylint: disable=protected-access
        history_months, values, origin, horizon, "B0b", b4_fold_spec
    )
    if len(values) >= 12:
        seasonal_source = list(values[-12:])
        seasonal = {
            month: max(0.0, seasonal_source[index % 12])
            for index, month in enumerate(months)
        }
    else:
        # A lag-12 value does not exist with fewer than 12 observed months.
        # Reusing a 6..11 month vector cyclically would silently change the
        # frozen seasonal_naive_12 identity into lag-N, so use the already
        # frozen B4 channel fallback for this component only.
        seasonal = copy.deepcopy(b4)
    paths = {
        "trailing_mean_3": _uniform(months, base.mean(last3)),
        "trailing_mean_6": _uniform(months, base.mean(last6)),
        "trailing_mean_12": _uniform(months, base.mean(last12)),
        "seasonal_naive_12": seasonal,
        "recent_robust_mean_12": _uniform(months, _winsorized_mean(last12)),
        "zero_aware_median_12": _uniform(
            months, float(statistics.median(last12)) if last12 else 0.0
        ),
        "damped_trend_12": {
            month: value for month, value in zip(months, trend)
        },
        "recency_weighted_mean_12": _uniform(
            months, _recency_weighted_mean(last12, 0.85)
        ),
        "B1_channel_point": b1,
        "B3_channel_point": b3,
        "B4_channel_point": b4,
    }
    expected = set(SALES_COMPONENT_IDS)
    if set(paths) != expected or any(set(path) != set(months) for path in paths.values()):
        raise C2RContractError("C2-R sales component matrix is incomplete")
    return paths


def _candidate_monthly(
    paths: Mapping[str, Mapping[str, float]], candidate: Mapping[str, Any]
) -> dict[str, float]:
    months = sorted(next(iter(paths.values()))) if paths else []
    return {
        month: round(
            sum(
                float(weight) * float(paths[component][month])
                for component, weight in candidate["weights"].items()
            ),
            8,
        )
        for month in months
    }


def _buyout_channel_forecast(
    channel: Mapping[str, Any],
    classification: Mapping[str, Any],
    origin: str,
    horizon: int,
    contract: Mapping[str, Any],
    rights_horizon: int | None,
) -> tuple[dict[str, float], dict[str, Any], list[str]]:
    config = contract["pureBuyoutRoute"]
    monthly = channel.get("monthly", {}) or {}
    event_months = sorted(
        {
            str(month)
            for month in classification.get("buyoutEventMonths", [])
            if str(month) <= origin and base.finite_number(monthly.get(month)) > 0
        },
        key=base.month_ordinal,
    )
    amounts = [base.finite_number(monthly.get(month)) for month in event_months]
    gaps = [
        base.month_ordinal(right) - base.month_ordinal(left)
        for left, right in zip(event_months, event_months[1:])
    ]
    inferred = float(statistics.median(gaps)) if gaps else float(config["defaultCycleMonths"])
    cycle = int(
        round(
            min(
                float(config["maximumInferredCycleMonths"]),
                max(float(config["minimumCycleMonths"]), inferred),
            )
        )
    )
    months = _future_months(origin, int(horizon))
    forecast = {month: 0.0 for month in months}
    limitations = [] if rights_horizon is not None else ["rights_snapshot_unavailable_as_of"]
    limitations.append("buyout_event_classifier_resolved_not_user_confirmed")
    latest = event_months[-1] if event_months else None
    amount = amounts[-1] if amounts else 0.0
    monthly_equivalent = amount / cycle if cycle > 0 else 0.0
    covered_end = base.add_months(latest, cycle - 1) if latest else None
    if latest and covered_end and origin < covered_end:
        for offset, month in enumerate(months, 1):
            if month <= covered_end and (
                rights_horizon is None or offset <= rights_horizon
            ):
                forecast[month] = round(max(0.0, monthly_equivalent), 8)
    if latest is None:
        limitations.append("buyout_event_evidence_insufficient")
    beyond_known_cycle = covered_end is None or any(
        month > covered_end for month in months
    )
    beyond_rights = rights_horizon is not None and int(horizon) > rights_horizon
    if beyond_known_cycle:
        limitations.append("future_buyout_not_assumed")
    if beyond_rights:
        limitations.append("rights_horizon_cap_applied")
    if len(event_months) < 2:
        limitations.append("buyout_cycle_evidence_low")
    detail = {
        "buyoutEventMonth": latest,
        "buyoutAmount": amount,
        "monthsSincePriorBuyout": gaps[-1] if gaps else None,
        "previousBuyoutAmount": amounts[-2] if len(amounts) >= 2 else None,
        "inferredCycleLength": cycle,
        "buyoutMonthlyEquivalent": monthly_equivalent,
        "currentCoveredPeriodEnd": covered_end,
        "remainingRightsPeriod": rights_horizon,
        "eventEvidence": "as_of_classifier_resolved_not_user_confirmed",
        "eventConfidence": (
            "medium"
            if classification.get("confidence") == "high"
            and len(event_months) >= 2
            and not beyond_known_cycle
            and not beyond_rights
            else "low"
        ),
        "futureRenewalAssumed": False,
    }
    return forecast, detail, limitations


def _rights_horizon_as_of(
    work: Mapping[str, Any], origin: str, calibration_spec: Mapping[str, Any]
) -> tuple[int | None, list[str]]:
    snapshots = work.get("rights_snapshots")
    if not snapshots:
        return None, []
    if not isinstance(snapshots, Sequence) or isinstance(
        snapshots, (str, bytes, bytearray)
    ):
        raise C2RContractError("rights_snapshots must be a sequence")
    eligible = [
        snapshot
        for snapshot in snapshots
        if isinstance(snapshot, Mapping)
        and str(snapshot.get("available_as_of", "")) <= origin
    ]
    if not eligible:
        return None, []
    resolved = base.resolve_serving_horizon_as_of(eligible, origin, calibration_spec)
    return int(resolved["horizon_months"]), list(resolved.get("limitations", []))


def _channel_lookup(work: Mapping[str, Any]) -> dict[str, Mapping[str, Any]]:
    return base.channel_index(work)


def _candidate_work_monthlies(
    work: Mapping[str, Any],
    origin: str,
    horizon: int,
    calibration_spec: Mapping[str, Any],
    contract: Mapping[str, Any],
    b4_fold_spec: Mapping[str, Any],
) -> tuple[
    str,
    dict[str, dict[str, float]],
    dict[str, dict[str, dict[str, float]]],
    list[dict[str, Any]],
]:
    routing = base.route_work_as_of(work, origin, calibration_spec)
    route = str(routing["route"])
    if route not in ROUTES:
        raise C2RContractError("C2-R route is outside the frozen domain")
    channels = _channel_lookup(work)
    future = _future_months(origin, horizon)
    candidate_monthlies = {
        candidate["candidateId"]: {month: 0.0 for month in future}
        for candidate in enumerate_candidates(contract)
    }
    component_matrix: dict[str, dict[str, dict[str, float]]] = {}
    details: list[dict[str, Any]] = []
    if route in {"pure_sales_share", "buyout_plus_sales"}:
        for item in routing["channels"]:
            if item["label"] not in {"sales_share_channel", "mixed_channel"}:
                continue
            key = str(item["channel_key"])
            channel = channels[key]
            first_observed = str(
                channel.get("first_observed_month")
                or calibration_spec["authority"]["firstBillMonth"]
            )
            if first_observed > origin:
                raise C2RContractError("routed channel starts after the prediction origin")
            history_months, history = base.monthly_values(
                channel.get("monthly", {}) or {}, first_observed, origin
            )
            buyout_months = (
                set(item.get("buyoutEventMonths", []))
                if item["label"] == "mixed_channel"
                else set()
            )
            sales_history = [
                0.0 if month in buyout_months else base.finite_number(value)
                for month, value in zip(history_months, history)
            ]
            paths = sales_component_monthly_paths(
                history_months,
                sales_history,
                origin,
                horizon,
                calibration_spec,
                b4_fold_spec,
            )
            component_matrix[key] = paths
            for candidate in enumerate_candidates(contract):
                selected = (
                    _candidate_monthly(paths, candidate)
                    if len(history_months)
                    >= int(contract["salesRoute"]["minimumChannelHistoryMonths"])
                    else copy.deepcopy(paths["B4_channel_point"])
                )
                for month, value in selected.items():
                    candidate_monthlies[candidate["candidateId"]][month] += value
            details.append(
                {
                    "channel_key": key,
                    "label": item["label"],
                    "historyMonthCount": len(history_months),
                    "buyoutEventMonthsRemoved": len(buyout_months),
                    "insufficientHistoryFallbackApplied": len(history_months)
                    < int(contract["salesRoute"]["minimumChannelHistoryMonths"]),
                    "seasonalNaive12FallbackApplied": len(history_months) < 12,
                }
            )
    return route, candidate_monthlies, component_matrix, details


def candidate_point_predictions(
    work: Mapping[str, Any],
    origin: str,
    horizon: int,
    calibration_spec: Mapping[str, Any],
    contract: Mapping[str, Any],
    b4_fold_spec: Mapping[str, Any],
) -> dict[str, float]:
    route, monthlies, _matrix, _details = _candidate_work_monthlies(
        work, origin, horizon, calibration_spec, contract, b4_fold_spec
    )
    if route not in {"pure_sales_share", "buyout_plus_sales"}:
        return {}
    return {
        candidate_id: round(sum(monthly.values()), 8)
        for candidate_id, monthly in monthlies.items()
    }


def predict_as_of(
    work: Mapping[str, Any],
    origin: str,
    horizon: int,
    calibration_spec: Mapping[str, Any],
    contract: Mapping[str, Any],
    *,
    selected_candidate_by_route: Mapping[str, Mapping[str, Any]],
    b4_fold_spec: Mapping[str, Any],
    long_horizon_evidence: bool = False,
) -> dict[str, Any]:
    """Single C2-R entry point shared by backtest and future serving."""

    if int(horizon) < 0:
        raise C2RContractError("forecast horizon cannot be negative")
    if not base.work_exists_as_of(work, origin):
        raise C2RContractError("future catalog entrant cannot be predicted")
    route, candidate_monthlies, component_matrix, channel_details = _candidate_work_monthlies(
        work, origin, horizon, calibration_spec, contract, b4_fold_spec
    )
    routing = base.route_work_as_of(work, origin, calibration_spec)
    eligibility = base.forecastability_as_of(work, origin, routing, calibration_spec)
    channels = _channel_lookup(work)
    future = {month: 0.0 for month in _future_months(origin, horizon)}
    channel_components: list[dict[str, Any]] = []
    limitations: list[str] = []
    selected_id: str | None = None
    confidence = "medium"
    excludes_future_buyout = route == "buyout_plus_sales"

    if route in {"pure_sales_share", "buyout_plus_sales"}:
        candidate = selected_candidate_by_route.get(route)
        if not isinstance(candidate, Mapping):
            raise C2RContractError(f"C2-R lacks a selected candidate for {route}")
        selected_id = str(candidate["candidateId"])
        if selected_id not in candidate_monthlies:
            raise C2RContractError("selected C2-R candidate is outside the frozen matrix")
        future = copy.deepcopy(candidate_monthlies[selected_id])
        for detail in channel_details:
            key = str(detail["channel_key"])
            effective_candidate = (
                candidate
                if not detail["insufficientHistoryFallbackApplied"]
                else candidate_by_id("single:B4_channel_point", contract)
            )
            selected = _candidate_monthly(component_matrix[key], effective_candidate)
            channel_components.append(
                {
                    "channel_key": key,
                    "point_forecast": round(sum(selected.values()), 8),
                    "detail": {
                        **detail,
                        "candidateId": selected_id,
                        "effectiveCandidateId": effective_candidate["candidateId"],
                        "zeroMonthsRetained": True,
                    },
                }
            )
        if route == "buyout_plus_sales":
            limitations.append("excludes_future_buyout")
        if any(item["historyMonthCount"] < 6 for item in channel_details):
            limitations.append("channel_history_insufficient_frozen_B4_fallback")
            confidence = "low"
    elif route == "pure_buyout":
        rights_horizon, rights_limitations = _rights_horizon_as_of(
            work, origin, calibration_spec
        )
        limitations.extend(rights_limitations)
        for item in routing["channels"]:
            if item["label"] not in {"buyout_channel", "mixed_channel"}:
                continue
            key = str(item["channel_key"])
            forecast, detail, channel_limitations = _buyout_channel_forecast(
                channels[key], item, origin, horizon, contract, rights_horizon
            )
            for month, value in forecast.items():
                future[month] += value
            channel_components.append(
                {
                    "channel_key": key,
                    "point_forecast": round(sum(forecast.values()), 8),
                    "detail": detail,
                }
            )
            limitations.extend(channel_limitations)
        selected_id = "pure_buyout_event_cycle_v1"
        confidence = (
            "medium"
            if channel_components
            and all(item["detail"]["eventConfidence"] == "medium" for item in channel_components)
            else "low"
        )
    else:
        selected_id = "unknown_structural_zero_abstain"
        limitations.extend(["unresolved_revenue_model", "unknown_revenue_model"])
        confidence = "unavailable"

    spike_candidates: list[dict[str, Any]] = []
    for item in routing["channels"]:
        channel = channels[str(item["channel_key"])]
        for spike in base.spike_candidates_as_of(channel, origin, item, calibration_spec):
            spike_candidates.append({"channel_key": item["channel_key"], **spike})
    if any(not item.get("evidenceConfirmed", False) for item in spike_candidates):
        limitations.append("unconfirmed_spike_candidate_not_damped")
    if horizon > 24 and not long_horizon_evidence:
        limitations.append("extrapolated")
    _route_months, route_history = base._aggregate_route_history(  # pylint: disable=protected-access
        work, origin, routing, calibration_spec
    )
    b0b = next(
        item
        for item in calibration_spec["models"]["baselines"]
        if item["id"] == "B0b"
    )
    features = {
        "observed_months": int(eligibility.get("observedMonths", 0)),
        "active_months": len(base.positive_positions(route_history)),
        "last_3": round(sum(route_history[-3:]), 8),
        "last_6": round(sum(route_history[-6:]), 8),
        "last_12": round(sum(route_history[-12:]), 8),
        "last_24": round(sum(route_history[-24:]), 8),
        "dormant": bool(
            sum(route_history[-6:]) == 0
            and any(value > 0 for value in route_history[:-6])
        ),
        "sparse_income": bool(
            sum(1 for value in route_history[-12:] if value > 0) <= 3
        ),
        "lifecycle": base.lifecycle(
            route_history,
            b0b["lifecycleThresholds"],
            base.finite_number(
                b0b.get("structuralConstants", {}).get(
                    "reboundPrevious3ToPrevious6MaximumExclusive"
                ),
                0.8,
            ),
        ),
    }
    if not eligibility.get("eligible"):
        limitations.append(str(eligibility.get("status", "blocked_unknown")))
        confidence = "unavailable"
    limitations = sorted(set(limitations))
    point = round(sum(future.values()), 8)
    component_sum = round(
        sum(base.finite_number(item.get("point_forecast")) for item in channel_components),
        8,
    )
    if route != "unknown_revenue_model" and not math.isclose(
        point, component_sum, abs_tol=1e-6
    ):
        raise C2RContractError("C2-R channel sum differs from work point")
    annual = base.annual_breakdown(future, point)
    served_point = point if eligibility.get("eligible") and route != "unknown_revenue_model" else None
    served_annual = annual if served_point is not None else []
    public = {
        "pointForecast": served_point,
        "annualBreakdown": served_annual,
        "confidence": confidence,
        "limitation": limitations,
    }
    return {
        "model_id": MODEL_ID,
        "identity": "C2R_revenue_model_channel_transparent_v1",
        "case_key": {
            "standard_work_id": str(work.get("standard_work_id", "")),
            "origin": origin,
            "horizon_months": int(horizon),
            "route": route,
        },
        "route": route,
        "eligibility": eligibility,
        "features": features,
        "point_forecast": point,
        "annual_breakdown": annual,
        "confidence": confidence,
        "limitation": limitations,
        "selectedCandidateId": selected_id,
        "excludesFutureBuyout": excludes_future_buyout,
        "futureBuyoutPredicted": False,
        "channel_components": channel_components,
        "spike_candidates": spike_candidates,
        "public_output": public,
    }
