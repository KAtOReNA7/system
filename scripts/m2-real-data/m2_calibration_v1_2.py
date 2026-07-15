#!/usr/bin/env python3
"""M2 calibration v1.2 identity, scoring, and comparator primitives.

This module is deliberately side-effect free.  It reads no private role and no
database.  The local replay runner supplies an as-of catalog context and is
responsible for creating a prediction lock before any outcome is joined.
"""

from __future__ import annotations

import copy
import hashlib
import itertools
import json
import math
import re
import statistics
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

import m2_calibration_v1 as base


ROOT = Path(__file__).resolve().parents[2]
SPEC_PATH = (
    ROOT
    / "src"
    / "domain"
    / "oldProductEvaluation"
    / "calibrationSpec.v1.2.amendment.json"
)
BASE_SPEC_PATH = (
    ROOT / "src" / "domain" / "oldProductEvaluation" / "calibrationSpec.v1.json"
)
V1_1_AMENDMENT_PATH = (
    ROOT
    / "src"
    / "domain"
    / "oldProductEvaluation"
    / "calibrationSpec.v1.1.amendment.json"
)

BASELINE_IDS = ("B0b", "B1", "B2", "B3", "B4")
LEGAL_BASELINE_IDS = BASELINE_IDS
CORE_HORIZONS = (3, 6, 12, 18, 24)
C1_COMPONENT_IDS = (
    "damped_linear_trend",
    "recency_weighted_mean",
    "robust_positive_median",
    "seasonal_naive_12",
    "trailing_mean_12",
    "trailing_mean_3",
    "trailing_mean_6",
    "winsorized_recent_trend",
)
TOLERANCE = 1e-12


class CalibrationV12Error(RuntimeError):
    """A frozen v1.2 calibration contract was violated."""


def load_amendment(path: Path = SPEC_PATH) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def canonical_digest(value: Any) -> str:
    return hashlib.sha256(base.canonical_json_bytes(value)).hexdigest()


def load_and_validate_contract() -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    base_spec = json.loads(BASE_SPEC_PATH.read_text(encoding="utf-8"))
    amendment_v1_1 = json.loads(V1_1_AMENDMENT_PATH.read_text(encoding="utf-8"))
    amendment = load_amendment()
    bindings = amendment.get("baseBindings", {})
    expected_base = bindings.get("calibrationSpecV1", {}).get("canonicalDigestSha256")
    expected_v1_1 = bindings.get("calibrationSpecV1_1Amendment", {}).get(
        "canonicalDigestSha256"
    )
    if canonical_digest(base_spec) != expected_base:
        raise CalibrationV12Error("calibrationSpec.v1 base binding mismatch")
    if canonical_digest(amendment_v1_1) != expected_v1_1:
        raise CalibrationV12Error("calibrationSpec.v1.1 amendment binding mismatch")
    if amendment.get("version") != "calibration-spec-v1.2-amendment":
        raise CalibrationV12Error("unexpected calibration v1.2 version")
    if amendment.get("decisionStatus") != "not_for_formal_decision":
        raise CalibrationV12Error("v1.2 may not authorize a formal decision")
    if amendment.get("seals", {}).get("finalHoldoutOpened") is not False:
        raise CalibrationV12Error("final holdout must remain sealed")
    if amendment.get("seals", {}).get("embargoShadowOpened") is not False:
        raise CalibrationV12Error("embargo shadow must remain sealed")
    if amendment.get("seals", {}).get("deferred60MonthLabelsOpened") is not False:
        raise CalibrationV12Error("deferred 60-month labels must remain sealed")
    if amendment.get("modelIdentity", {}).get("B0b", {}).get("id") != (
        "B0b_v1_1_leakage_free_replay"
    ):
        raise CalibrationV12Error("faithful B0b identity is not frozen")
    if amendment.get("modelIdentity", {}).get("B4", {}).get("id") != (
        "B4_formula_switched_legacy_variant"
    ):
        raise CalibrationV12Error("formula-switched B4 identity is not frozen")
    return base_spec, amendment_v1_1, amendment


def strict_case_key(row: Mapping[str, Any]) -> tuple[str, str, int, str]:
    key = row.get("case_key")
    if not isinstance(key, Mapping):
        raise CalibrationV12Error("case_key must be an object")
    required = {"standard_work_id", "origin", "horizon_months", "route"}
    if set(key) != required:
        raise CalibrationV12Error("case_key must contain exactly four frozen fields")
    if not isinstance(key["standard_work_id"], str):
        raise CalibrationV12Error("case work id must be a native string")
    if not isinstance(key["origin"], str):
        raise CalibrationV12Error("case origin must be a native string")
    if not isinstance(key["route"], str):
        raise CalibrationV12Error("case route must be a native string")
    if not isinstance(key["horizon_months"], int) or isinstance(
        key["horizon_months"], bool
    ):
        raise CalibrationV12Error("case horizon must be a native integer")
    work_id = key["standard_work_id"].strip()
    origin = key["origin"]
    route = key["route"]
    horizon = key["horizon_months"]
    if not work_id or horizon < 0 or route not in {
        "pure_sales_share",
        "pure_buyout",
        "buyout_plus_sales",
        "unknown_revenue_model",
    }:
        raise CalibrationV12Error("case_key value is outside the frozen domain")
    base.month_ordinal(origin)
    return work_id, origin, horizon, route


def validate_case_state(row: Mapping[str, Any]) -> dict[str, bool]:
    """Validate the scoreable/available/served/abstained truth table."""

    for field in (
        "statisticallyScoreable",
        "modelPredictionAvailable",
        "businessServingEligible",
        "abstained",
    ):
        if not isinstance(row.get(field), bool):
            raise CalibrationV12Error(f"case state field is not a native boolean: {field}")
    scoreable = row["statisticallyScoreable"]
    scoreability_reason = row.get("scoreabilityReason")
    if scoreable:
        if scoreability_reason is not None:
            raise CalibrationV12Error("scoreable case has a scoreability failure reason")
    elif not isinstance(scoreability_reason, str) or not scoreability_reason.strip():
        raise CalibrationV12Error("unscoreable case lacks a scoreability reason")

    raw = row.get("rawModelPrediction")
    raw_available = raw is not None
    if raw_available:
        try:
            raw_available = math.isfinite(float(raw))
        except (TypeError, ValueError):
            raw_available = False
    if row["modelPredictionAvailable"] != raw_available:
        raise CalibrationV12Error("modelPredictionAvailable differs from finite raw prediction")
    if scoreable and not raw_available:
        raise CalibrationV12Error("scoreable case lacks a finite raw prediction")

    served = row.get("servedPrediction")
    expected_served = raw if row["businessServingEligible"] and raw_available else None
    if expected_served is None:
        if served is not None:
            raise CalibrationV12Error("ineligible or unavailable case has a served prediction")
    elif served is None or base.fixed_decimal(expected_served) != base.fixed_decimal(served):
        raise CalibrationV12Error("served prediction differs from the eligible raw prediction")

    expected_abstained = served is None
    if row["abstained"] != expected_abstained:
        raise CalibrationV12Error("abstained must be equivalent to servedPrediction=null")
    reason = row.get("abstentionReason")
    if expected_abstained:
        if not isinstance(reason, str) or not reason.strip():
            raise CalibrationV12Error("abstained case lacks an abstention reason")
    elif reason is not None:
        raise CalibrationV12Error("served case may not have an abstention reason")
    return {
        "rawPredictionCompleteOnAllScoreable": True,
        "modelPredictionAvailableIffRawFinite": True,
        "servedPredictionMatchesEligibilityAndRaw": True,
        "abstainedIffServedPredictionNull": True,
        "abstentionReasonPresentIffAbstained": True,
    }


def _legacy_baseline_spec(spec: Mapping[str, Any]) -> Mapping[str, Any]:
    return next(item for item in spec["models"]["baselines"] if item["id"] == "B0b")


def _legacy_lifecycle(
    history: Sequence[float], thresholds: Mapping[str, Any]
) -> str:
    """Reproduce the old v1.1 classify_at boundary semantics exactly."""

    values = [base.finite_number(value) for value in history]
    positive = [index for index, value in enumerate(values) if value > 0]
    history_count = len(values[positive[0] :]) if positive else 0
    if history_count < int(thresholds["insufficientHistoryCompleteMonths"]):
        return "insufficient_history"
    last6 = sum(values[-6:]) if len(values) >= 6 else sum(values)
    if last6 <= base.finite_number(thresholds["inactiveRecent6RevenueMax"]):
        return "inactive"
    recent6 = base.mean(values[-6:]) if len(values) >= 6 else 0.0
    previous6 = base.mean(values[-12:-6]) if len(values) >= 12 else 0.0
    recent3 = base.mean(values[-3:]) if len(values) >= 3 else 0.0
    previous3 = base.mean(values[-6:-3]) if len(values) >= 6 else 0.0
    if (
        previous3 > 0
        and recent3 / previous3
        >= base.finite_number(thresholds["reboundRecent3Previous3Ratio"])
        and previous3 < previous6 * 0.8
    ):
        return "rebound"
    if (
        previous6 > 0
        and recent6 / previous6
        >= base.finite_number(thresholds["growthRecent6Prior6Ratio"])
    ):
        return "growth"
    if (
        previous6 > 0
        and recent6 / previous6
        <= base.finite_number(thresholds["decliningRecent6Prior6Ratio"])
    ):
        return "declining"
    last12 = sum(values[-12:]) if len(values) >= 12 else sum(values)
    if 0 < last12 <= base.finite_number(thresholds["longTailLast12RevenueMax"]):
        return "long_tail"
    return "stable"


def _legacy_stats(history: Sequence[float], spec: Mapping[str, Any]) -> dict[str, Any]:
    values = [base.finite_number(value) for value in history]
    positive = [value for value in values if value > 0]
    recent = values[-6:]
    recent_mean = base.mean(recent)
    total = sum(values)
    baseline = _legacy_baseline_spec(spec)
    stage = _legacy_lifecycle(values, baseline["lifecycleThresholds"])
    if len(values) < 6:
        stage = "insufficient_history"
    return {
        "history": values,
        "lifecycle": stage,
        "last3": sum(values[-3:]),
        "last6": sum(values[-6:]),
        "last12": sum(values[-12:]),
        "last24": sum(values[-24:]),
        "activeMonths": sum(value > 0 for value in values),
        "total": total,
        "positiveMedian": base.median(positive),
        "volatility": (
            base.population_std(recent) / recent_mean if recent_mean > 0 else 0.0
        ),
        "peakShare": max(values, default=0.0) / total if total > 0 else 0.0,
        "recentZero": sum(values[-6:]) <= 0.01,
    }


def _scale(stats: Mapping[str, Any], quantiles: Mapping[str, float]) -> str:
    if stats["lifecycle"] == "long_tail":
        return "long_tail"
    total = float(stats["total"])
    if total >= float(quantiles["p95"]):
        return "top"
    if total >= float(quantiles["p75"]):
        return "high"
    if total >= float(quantiles["p40"]):
        return "mid"
    return "low" if total > 0 else "long_tail"


def _winsorized_mean(values: Sequence[float]) -> float:
    clean = [base.finite_number(value) for value in values]
    if not clean:
        return 0.0
    if len(clean) < 4:
        return base.mean(clean)
    lower = base.linear_quantile(clean, 0.10)
    upper = base.linear_quantile(clean, 0.85)
    assert lower is not None and upper is not None
    return base.mean([min(upper, max(lower, value)) for value in clean])


def _legacy_model_a(stats: Mapping[str, Any], horizon: int) -> float:
    last12_monthly = (
        float(stats["last12"]) / 12.0 if stats["last12"] > 0 else 0.0
    )
    last24_monthly = (
        float(stats["last24"]) / 24.0
        if stats["last24"] > 0
        else last12_monthly
    )
    monthly = (
        0.15 * (float(stats["last3"]) / 3.0 if stats["last3"] > 0 else 0.0)
        + 0.35 * (float(stats["last6"]) / 6.0 if stats["last6"] > 0 else 0.0)
        + 0.35 * last12_monthly
        + 0.15 * last24_monthly
    )
    factor = {
        "growth": 1.05,
        "stable": 0.95,
        "rebound": 0.98,
        "declining": 0.65,
        "long_tail": 0.35,
        "inactive": 0.08,
        "insufficient_history": 0.55,
    }.get(str(stats["lifecycle"]), 0.9)
    if bool(stats["recentZero"]):
        factor *= 0.20
    return max(0.0, monthly * horizon * factor)


def _legacy_model_b(
    stats: Mapping[str, Any], horizon: int, *, confirmed_spike: bool
) -> float:
    history = list(stats["history"])
    window = history[-24:]
    monthly = max(
        _winsorized_mean(window[-12:]),
        base.trimmed_mean(window, 0.15),
        float(stats["positiveMedian"]) * 0.40,
    )
    factor = {
        "growth": 1.12,
        "stable": 0.88,
        "rebound": 1.02,
        "declining": 0.48,
        "long_tail": 0.22,
        "inactive": 0.04,
        "insufficient_history": 0.45,
    }.get(str(stats["lifecycle"]), 0.85)
    prediction = monthly * horizon * factor
    # Historical code damped every peakShare>=.90.  The user has explicitly
    # forbidden automatic damping before spike-type confirmation.
    if confirmed_spike and float(stats["peakShare"]) >= 0.90:
        prediction *= 0.40
    if float(stats["last12"]) <= 10 or int(stats["activeMonths"]) <= 2:
        prediction = min(
            prediction,
            max(
                float(stats["last12"]) * horizon / 12.0,
                1.0 if float(stats["last12"]) > 0 else 0.0,
            ),
        )
    return max(0.0, prediction)


def _legacy_model_c(
    stats: Mapping[str, Any], horizon: int, *, confirmed_true_anomaly: bool = False
) -> float:
    if bool(stats["recentZero"]):
        return 0.0
    if (
        str(stats["lifecycle"]) in {"inactive", "long_tail"}
        or float(stats["last12"]) <= 10
        or int(stats["activeMonths"]) <= 3
    ):
        return max(
            0.0,
            min(
                float(stats["last6"]) / 6.0 * horizon * 0.35,
                max(
                    float(stats["last12"]) / 12.0 * horizon * 0.35,
                    1.0 if float(stats["last12"]) > 0 else 0.0,
                ),
            ),
        )
    return 0.75 * _legacy_model_b(
        stats, horizon, confirmed_spike=confirmed_true_anomaly
    )


def _legacy_model_d(
    stats: Mapping[str, Any],
    horizon: int,
    cohort_monthly: float,
    *,
    confirmed_true_anomaly: bool = False,
) -> float:
    individual = _legacy_model_b(
        stats, horizon, confirmed_spike=confirmed_true_anomaly
    )
    cohort = max(0.0, cohort_monthly * horizon)
    reliability = min(0.85, max(0.10, int(stats["activeMonths"]) / 24.0))
    if (
        str(stats["lifecycle"])
        in {"inactive", "long_tail", "insufficient_history"}
        or float(stats["last12"]) <= 10
    ):
        reliability *= 0.35
    # A high peak remains only a candidate until its business cause is
    # confirmed.  Volatility may reduce reliability independently, but peak
    # share alone may not damp or shrink an unconfirmed case.
    if float(stats["volatility"]) > 1.5:
        reliability *= 0.55
    prediction = individual * reliability + cohort * (1.0 - reliability)
    if float(stats["last12"]) <= 10:
        prediction = min(
            prediction,
            max(
                float(stats["last12"]) * horizon / 12.0,
                cohort * 0.6,
                1.0 if float(stats["last12"]) > 0 else 0.0,
            ),
        )
    return max(0.0, prediction)


def _component_histories(
    works: Sequence[Mapping[str, Any]], origin: str, spec: Mapping[str, Any]
) -> tuple[dict[tuple[str, str], list[float]], dict[str, Any]]:
    histories: dict[tuple[str, str], list[float]] = {}
    route_by_work: dict[str, Any] = {}
    for work in works:
        if not base.work_exists_as_of(work, origin):
            continue
        work_id = str(work["standard_work_id"])
        routing = base.route_work_as_of(work, origin, spec)
        route_by_work[work_id] = routing
        channels = base.channel_index(work)
        for item in routing["channels"]:
            if item["label"] not in {"sales_share_channel", "mixed_channel"}:
                continue
            channel = channels[item["channel_key"]]
            months, history = base._channel_history(  # pylint: disable=protected-access
                channel, origin, spec["authority"]["firstBillMonth"]
            )
            if item["label"] == "mixed_channel":
                buyout_months = set(item.get("buyoutEventMonths", []))
                history = [
                    0.0 if month in buyout_months else value
                    for month, value in zip(months, history)
                ]
            histories[(work_id, str(item["channel_key"]))] = history
    return histories, route_by_work


def build_b0b_context(
    works: Sequence[Mapping[str, Any]], origin: str, spec: Mapping[str, Any]
) -> dict[str, Any]:
    """Build component quantiles and cohort priors using only facts <= origin."""

    histories, route_by_work = _component_histories(works, origin, spec)
    totals = [sum(values) for values in histories.values()]
    if totals:
        quantiles = {
            "p40": float(base.linear_quantile(totals, 0.40) or 0.0),
            "p75": float(base.linear_quantile(totals, 0.75) or 0.0),
            "p95": float(base.linear_quantile(totals, 0.95) or 0.0),
        }
    else:
        quantiles = {"p40": 0.0, "p75": 0.0, "p95": 0.0}
    buckets: dict[tuple[str, str], list[float]] = defaultdict(list)
    stats_by_component: dict[tuple[str, str], dict[str, Any]] = {}
    work_lookup = {str(work["standard_work_id"]): work for work in works}
    spikes_by_component: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for key, history in histories.items():
        stats = _legacy_stats(history, spec)
        scale = _scale(stats, quantiles)
        work_id, channel_key = key
        channel = base.channel_index(work_lookup[work_id])[channel_key]
        allowed_spike_types = set(spec["spikePolicy"]["candidateTypes"])
        spikes: list[dict[str, Any]] = []
        for confirmation in channel.get("spike_confirmations", []) or []:
            candidate_month = str(confirmation.get("candidate_month", ""))
            available_as_of = str(confirmation.get("available_as_of", ""))
            confirmed_type = str(confirmation.get("confirmed_type", ""))
            if (
                re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", candidate_month) is None
                or re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", available_as_of)
                is None
                or confirmed_type not in allowed_spike_types
            ):
                raise CalibrationV12Error("invalid cutoff spike confirmation")
            if candidate_month <= origin and available_as_of <= origin:
                spikes.append(
                    {
                        "month": candidate_month,
                        "type": confirmed_type,
                        "heuristicType": "explicit_confirmation",
                        "evidenceConfirmed": True,
                    }
                )
        spikes_by_component[key] = copy.deepcopy(spikes)
        confirmed_types = sorted(
            {
                str(item["type"])
                for item in spikes
                if bool(item.get("evidenceConfirmed"))
            }
        )
        stats_by_component[key] = {
            **stats,
            "scale": scale,
            "confirmedSpikeTypes": confirmed_types,
            "confirmedTrueAnomaly": "true_anomaly" in confirmed_types,
        }
        monthly = min(
            float(stats["last12"]) / 12.0 if stats["last12"] > 0 else 0.0,
            float(stats["positiveMedian"])
            if stats["positiveMedian"]
            else float(stats["last12"]) / 12.0,
        )
        buckets[(str(stats["lifecycle"]), scale)].append(monthly)
        buckets[(str(stats["lifecycle"]), "all")].append(monthly)
    priors = {key: statistics.median(values) for key, values in buckets.items() if values}
    fingerprint = canonical_digest(
        {
            "origin": origin,
            "componentCount": len(histories),
            "quantiles": quantiles,
            "stats": [
                {
                    "key": list(key),
                    "history": [base.fixed_decimal(value) for value in histories[key]],
                    "lifecycle": stats_by_component[key]["lifecycle"],
                    "scale": stats_by_component[key]["scale"],
                    "spikeEvidence": [
                        {
                            "month": item["month"],
                            "type": item["type"],
                            "heuristicType": item["heuristicType"],
                            "evidenceConfirmed": bool(item["evidenceConfirmed"]),
                        }
                        for item in spikes_by_component[key]
                    ],
                }
                for key in sorted(histories)
            ],
            "priors": [
                {"key": list(key), "value": base.fixed_decimal(value)}
                for key, value in sorted(priors.items())
            ],
        }
    )
    return {
        "origin": origin,
        "histories": histories,
        "stats": stats_by_component,
        "spikes": spikes_by_component,
        "routes": route_by_work,
        "quantiles": quantiles,
        "priors": priors,
        "fingerprint": fingerprint,
        "maximumIncomeMonthReadOrUsed": origin,
    }


def _select_legacy_point(
    stats: Mapping[str, Any], horizon: int, priors: Mapping[tuple[str, str], float]
) -> tuple[float, str]:
    scale = str(stats["scale"])
    lifecycle = str(stats["lifecycle"])
    confirmed_true_anomaly = bool(stats.get("confirmedTrueAnomaly"))
    if lifecycle in {"inactive", "long_tail"} or scale in {"low", "long_tail"}:
        return _legacy_model_c(
            stats, horizon, confirmed_true_anomaly=confirmed_true_anomaly
        ), "C"
    if lifecycle == "insufficient_history" or int(stats["activeMonths"]) < 6:
        prior = float(
            priors.get((lifecycle, scale), priors.get((lifecycle, "all"), 0.0))
        )
        return _legacy_model_d(
            stats,
            horizon,
            prior,
            confirmed_true_anomaly=confirmed_true_anomaly,
        ), "D"
    if confirmed_true_anomaly:
        return _legacy_model_b(stats, horizon, confirmed_spike=True), "B"
    if lifecycle in {"stable", "growth", "rebound", "declining"}:
        return _legacy_model_b(
            stats, horizon, confirmed_spike=confirmed_true_anomaly
        ), "B"
    return _legacy_model_a(stats, horizon), "A"


def _raw_prediction_spec(spec: Mapping[str, Any]) -> dict[str, Any]:
    """Return the frozen model-capability spec, independent of scoring/serving state."""

    result = copy.deepcopy(spec)
    result["forecastability"]["rules"]["minimumObservedCalendarMonths"] = 0
    return result


def _all_cutoff_available_amounts_are_zero(
    work: Mapping[str, Any], origin: str, spec: Mapping[str, Any]
) -> bool:
    months = set(base.month_range(spec["authority"]["firstBillMonth"], origin))
    observed = False
    for channel in work.get("channels", []) or []:
        first = str(channel.get("first_observed_month", ""))
        if first and first > origin:
            continue
        for month, raw in (channel.get("monthly", {}) or {}).items():
            if str(month) not in months:
                continue
            observed = True
            if abs(base.finite_number(raw)) > TOLERANCE:
                return False
    return observed


def _apply_structural_zero_if_allowed(
    prediction: Mapping[str, Any],
    work: Mapping[str, Any],
    origin: str,
    horizon: int,
    spec: Mapping[str, Any],
) -> dict[str, Any]:
    result = copy.deepcopy(dict(prediction))
    if result.get("point_forecast") is not None:
        return result
    if not _all_cutoff_available_amounts_are_zero(work, origin, spec):
        return result
    monthly = {
        base.add_months(origin, offset): 0.0
        for offset in range(1, int(horizon) + 1)
    }
    annual = base.annual_breakdown(monthly, 0.0)
    result["point_forecast"] = 0.0
    result["annual_breakdown"] = annual
    result["public_output"] = {
        "pointForecast": 0.0,
        "annualBreakdown": annual,
        "confidence": result.get("confidence", "unavailable"),
        "limitation": copy.deepcopy(result.get("limitation", [])),
    }
    result["identity"] = "cutoff_observed_structural_zero_raw_prediction"
    return result


def _restore_business_eligibility_after_raw_materialization(
    prediction: Mapping[str, Any],
    original_eligibility: Mapping[str, Any],
    route: str,
    spec: Mapping[str, Any],
) -> dict[str, Any]:
    """Keep serving eligibility frozen without letting it alter model capability."""

    result = copy.deepcopy(dict(prediction))
    result["eligibility"] = copy.deepcopy(dict(original_eligibility))
    if (
        result.get("point_forecast") is not None
        and not bool(original_eligibility.get("eligible"))
        and route != "unknown_revenue_model"
    ):
        result["confidence"] = "low"
        limitations = list(result.get("limitation", []))
        if "business_serving_ineligible_low_confidence" not in limitations:
            limitations.append("business_serving_ineligible_low_confidence")
        result["limitation"] = base.ordered_limitations(limitations, spec)
        public = copy.deepcopy(result.get("public_output", {}))
        public["confidence"] = "low"
        public["limitation"] = copy.deepcopy(result["limitation"])
        result["public_output"] = public
    return result


def enumerate_c1_candidates(
    amendment: Mapping[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Enumerate the complete frozen C1 grid without reading any outcomes."""

    contract = (amendment or load_amendment())["C1"]
    allowed = tuple(sorted(str(item) for item in contract["allowedComponents"]))
    if allowed != C1_COMPONENT_IDS:
        raise CalibrationV12Error("C1 component order differs from the frozen grid")
    candidates: list[dict[str, Any]] = []
    for component in allowed:
        candidates.append(
            {
                "candidateId": f"single:{component}",
                "weights": {component: 1.0},
                "componentCount": 1,
                "nonzeroParameterCount": 1,
            }
        )
    for first, second in itertools.combinations(allowed, 2):
        for first_weight in contract["weightGrid"]:
            left = float(first_weight)
            right = 1.0 - left
            candidates.append(
                {
                    "candidateId": (
                        f"pair:{first}@{left:.2f}+{second}@{right:.2f}"
                    ),
                    "weights": {first: left, second: right},
                    "componentCount": 2,
                    "nonzeroParameterCount": 2,
                }
            )
    for first, second, third in itertools.combinations(allowed, 3):
        weight = 1.0 / 3.0
        candidates.append(
            {
                "candidateId": (
                    f"triple:{first}+{second}+{third}:equal_thirds"
                ),
                "weights": {first: weight, second: weight, third: weight},
                "componentCount": 3,
                "nonzeroParameterCount": 3,
            }
        )
    candidates.sort(key=lambda item: str(item["candidateId"]))
    expected = int(contract["candidateEnumeration"]["expectedCandidateCount"])
    identifiers = [str(item["candidateId"]) for item in candidates]
    if len(candidates) != expected or len(set(identifiers)) != expected:
        raise CalibrationV12Error("C1 candidate enumeration is incomplete or duplicated")
    if any(
        set(candidate["weights"]).difference(allowed)
        or any(float(weight) <= 0 for weight in candidate["weights"].values())
        or not math.isclose(
            sum(float(weight) for weight in candidate["weights"].values()),
            1.0,
            abs_tol=TOLERANCE,
        )
        for candidate in candidates
    ):
        raise CalibrationV12Error("C1 candidate weights violate the frozen simplex")
    return candidates


def c1_candidate_by_id(
    candidate_id: str, amendment: Mapping[str, Any] | None = None
) -> dict[str, Any]:
    matches = [
        candidate
        for candidate in enumerate_c1_candidates(amendment)
        if candidate["candidateId"] == candidate_id
    ]
    if len(matches) != 1:
        raise CalibrationV12Error("C1 candidate id is outside the frozen grid")
    return copy.deepcopy(matches[0])


def _validate_c1_candidate(
    candidate: Mapping[str, Any] | None, amendment: Mapping[str, Any]
) -> dict[str, Any]:
    if not isinstance(candidate, Mapping):
        raise CalibrationV12Error("C1 requires one frozen candidate")
    candidate_id = candidate.get("candidateId")
    if not isinstance(candidate_id, str):
        raise CalibrationV12Error("C1 candidate lacks a native id")
    expected = c1_candidate_by_id(candidate_id, amendment)
    observed = {
        "candidateId": candidate_id,
        "weights": {
            str(key): float(value)
            for key, value in dict(candidate.get("weights", {})).items()
        },
        "componentCount": int(candidate.get("componentCount", -1)),
        "nonzeroParameterCount": int(candidate.get("nonzeroParameterCount", -1)),
    }
    if canonical_digest(observed) != canonical_digest(expected):
        raise CalibrationV12Error("C1 candidate parameters differ from pre-registration")
    return expected


def c1_component_monthly_values(
    history: Sequence[float], horizon: int
) -> dict[str, list[float]]:
    """Return all eight frozen component paths for one cutoff sales series."""

    horizon = int(horizon)
    if horizon < 0:
        raise CalibrationV12Error("C1 horizon cannot be negative")
    clean = [base.finite_number(value) for value in history]
    recent = ([0.0] * max(0, 12 - len(clean)) + clean)[-12:]
    positives = [value for value in recent if value > 0]

    def repeated(value: float) -> list[float]:
        return [max(0.0, float(value)) for _ in range(horizon)]

    means = {
        "trailing_mean_3": base.mean(recent[-3:]),
        "trailing_mean_6": base.mean(recent[-6:]),
        "trailing_mean_12": base.mean(recent),
    }
    seasonal = [max(0.0, recent[index % 12]) for index in range(horizon)]
    robust = repeated(float(statistics.median(positives)) if positives else 0.0)
    weights = list(range(1, 13))
    recency = repeated(
        sum(weight * value for weight, value in zip(weights, recent)) / 78.0
    )

    def linear_fit(values: Sequence[float]) -> tuple[float, float]:
        x_center = 5.5
        y_center = base.mean(values)
        denominator = sum((index - x_center) ** 2 for index in range(12))
        slope = sum(
            (index - x_center) * (float(value) - y_center)
            for index, value in enumerate(values)
        ) / denominator
        return y_center - slope * x_center, slope

    raw_intercept, raw_slope = linear_fit(recent)
    fitted_at_11 = raw_intercept + raw_slope * 11.0
    damped = [
        max(0.0, fitted_at_11 + 0.25 * raw_slope * step)
        for step in range(1, horizon + 1)
    ]
    q10 = float(base.linear_quantile(recent, 0.10) or 0.0)
    q90 = float(base.linear_quantile(recent, 0.90) or 0.0)
    winsorized = [min(q90, max(q10, value)) for value in recent]
    win_intercept, win_slope = linear_fit(winsorized)
    upper = 3.0 * float(statistics.median(positives)) if positives else math.inf
    winsorized_trend = [
        min(upper, max(0.0, win_intercept + win_slope * (11 + step)))
        for step in range(1, horizon + 1)
    ]
    result = {
        **{name: repeated(value) for name, value in means.items()},
        "seasonal_naive_12": seasonal,
        "robust_positive_median": robust,
        "winsorized_recent_trend": winsorized_trend,
        "damped_linear_trend": damped,
        "recency_weighted_mean": recency,
    }
    if tuple(sorted(result)) != C1_COMPONENT_IDS or any(
        len(path) != horizon
        or any(not math.isfinite(value) or value < 0 for value in path)
        for path in result.values()
    ):
        raise CalibrationV12Error("C1 component materialization failed")
    return result


def _c1_prediction_basis(
    work: Mapping[str, Any],
    origin: str,
    horizon: int,
    spec: Mapping[str, Any],
    *,
    long_horizon_evidence: bool,
) -> dict[str, Any]:
    if not base.work_exists_as_of(work, origin):
        raise CalibrationV12Error("future catalog entrant cannot be predicted")
    routing = base.route_work_as_of(work, origin, spec)
    relaxed = _raw_prediction_spec(spec)
    template = base.predict_as_of(
        work,
        origin,
        horizon,
        "B1",
        relaxed,
        long_horizon_evidence=long_horizon_evidence,
    )
    template = _apply_structural_zero_if_allowed(
        template, work, origin, horizon, relaxed
    )
    route = str(routing["route"])
    if route not in {"pure_sales_share", "buyout_plus_sales"}:
        point = template.get("point_forecast")
        points = {
            component: None if point is None else float(point)
            for component in C1_COMPONENT_IDS
        }
        return {
            "routing": routing,
            "template": template,
            "monthlyByComponent": None,
            "pointByComponent": points,
            "channelComponents": copy.deepcopy(
                template.get("channel_components", [])
            ),
        }

    future_months = [base.add_months(origin, step) for step in range(1, horizon + 1)]
    monthly_by_component = {
        component: {month: 0.0 for month in future_months}
        for component in C1_COMPONENT_IDS
    }
    channels = base.channel_index(work)
    channel_components: list[dict[str, Any]] = []
    for item in routing["channels"]:
        if item["label"] not in {"sales_share_channel", "mixed_channel"}:
            continue
        channel = channels[str(item["channel_key"])]
        months, history = base._channel_history(  # pylint: disable=protected-access
            channel, origin, spec["authority"]["firstBillMonth"]
        )
        if item["label"] == "mixed_channel":
            buyout_months = set(item.get("buyoutEventMonths", []))
            history = [
                0.0 if month in buyout_months else value
                for month, value in zip(months, history)
            ]
        component_paths = c1_component_monthly_values(history, horizon)
        for component, path in component_paths.items():
            for month, value in zip(future_months, path):
                monthly_by_component[component][month] += value
        channel_components.append(
            {
                "channel_key": item["channel_key"],
                "detail": {
                    "routeLabel": item["label"],
                    "componentPointForecasts": {
                        component: round(sum(path), 8)
                        for component, path in sorted(component_paths.items())
                    },
                    "buyoutMonthsExcludedFromSalesHistory": len(
                        item.get("buyoutEventMonths", [])
                    ),
                },
            }
        )
    point_by_component = {
        component: round(sum(monthly.values()), 8)
        for component, monthly in monthly_by_component.items()
    }
    return {
        "routing": routing,
        "template": template,
        "monthlyByComponent": monthly_by_component,
        "pointByComponent": point_by_component,
        "channelComponents": channel_components,
    }


def c1_component_point_predictions(
    work: Mapping[str, Any],
    origin: str,
    horizon: int,
    spec: Mapping[str, Any],
    *,
    long_horizon_evidence: bool = False,
) -> dict[str, float | None]:
    basis = _c1_prediction_basis(
        work,
        origin,
        int(horizon),
        spec,
        long_horizon_evidence=long_horizon_evidence,
    )
    return copy.deepcopy(basis["pointByComponent"])


def _predict_c1_as_of(
    work: Mapping[str, Any],
    origin: str,
    horizon: int,
    spec: Mapping[str, Any],
    amendment: Mapping[str, Any],
    candidate: Mapping[str, Any] | None,
    candidate_role: str | None,
    *,
    long_horizon_evidence: bool,
) -> dict[str, Any]:
    selected = _validate_c1_candidate(candidate, amendment)
    if not isinstance(candidate_role, str) or not candidate_role.strip():
        raise CalibrationV12Error("C1 candidate selection role is required")
    basis = _c1_prediction_basis(
        work,
        origin,
        int(horizon),
        spec,
        long_horizon_evidence=long_horizon_evidence,
    )
    routing = basis["routing"]
    route = str(routing["route"])
    template = copy.deepcopy(basis["template"])
    monthly_by_component = basis["monthlyByComponent"]
    if monthly_by_component is None:
        point = template.get("point_forecast")
        annual = copy.deepcopy(template.get("annual_breakdown", []))
        components = copy.deepcopy(basis["channelComponents"])
    else:
        future_months = [
            base.add_months(origin, step) for step in range(1, int(horizon) + 1)
        ]
        monthly = {
            month: sum(
                float(weight) * float(monthly_by_component[component][month])
                for component, weight in selected["weights"].items()
            )
            for month in future_months
        }
        point = round(sum(monthly.values()), 8)
        annual = base.annual_breakdown(monthly, point)
        components = copy.deepcopy(basis["channelComponents"])
        for item in components:
            component_points = item["detail"]["componentPointForecasts"]
            item["point_forecast"] = round(
                sum(
                    float(weight) * float(component_points[component])
                    for component, weight in selected["weights"].items()
                ),
                8,
            )
            item["detail"]["selectedCandidateId"] = selected["candidateId"]
    features = copy.deepcopy(template.get("features", {}))
    features.update(
        {
            "c1CandidateId": selected["candidateId"],
            "c1CandidateRole": candidate_role,
            "c1ComponentCount": selected["componentCount"],
        }
    )
    limitations = base.ordered_limitations(
        list(template.get("limitation", [])), spec
    )
    result = {
        **template,
        "model_id": "C1",
        "case_key": {
            "standard_work_id": str(work["standard_work_id"]),
            "origin": origin,
            "horizon_months": int(horizon),
            "route": route,
        },
        "route": route,
        "point_forecast": None if point is None else float(point),
        "annual_breakdown": annual if point is not None else [],
        "features": features,
        "limitation": limitations,
        "channel_components": components,
        "identity": "C1_transparent_ensemble",
        "c1_candidate": copy.deepcopy(selected),
        "c1_candidate_role": candidate_role,
    }
    result["public_output"] = {
        "pointForecast": result["point_forecast"],
        "annualBreakdown": copy.deepcopy(result["annual_breakdown"]),
        "confidence": result.get("confidence", "unavailable"),
        "limitation": copy.deepcopy(result["limitation"]),
    }
    original_eligibility = base.forecastability_as_of(work, origin, routing, spec)
    result = _restore_business_eligibility_after_raw_materialization(
        result, original_eligibility, route, spec
    )
    strict_case_key(result)
    if set(result["public_output"]) != {
        "pointForecast",
        "annualBreakdown",
        "confidence",
        "limitation",
    }:
        raise CalibrationV12Error("C1 public output escaped the four-field contract")
    return result


def predict_as_of(
    work: Mapping[str, Any],
    origin: str,
    horizon: int,
    model_id: str,
    spec: Mapping[str, Any],
    *,
    b0b_context: Mapping[str, Any] | None = None,
    b4_parameter_role: str | None = None,
    c1_candidate: Mapping[str, Any] | None = None,
    c1_candidate_role: str | None = None,
    long_horizon_evidence: bool = False,
) -> dict[str, Any]:
    """Single v1.2 point-prediction entry for replay and forward serving."""

    if model_id == "C1":
        return _predict_c1_as_of(
            work,
            origin,
            int(horizon),
            spec,
            load_amendment(),
            c1_candidate,
            c1_candidate_role,
            long_horizon_evidence=long_horizon_evidence,
        )

    if model_id in {"B1", "B2", "B3"}:
        routing = base.route_work_as_of(work, origin, spec)
        original_eligibility = base.forecastability_as_of(work, origin, routing, spec)
        prediction_spec = _raw_prediction_spec(spec)
        result = base.predict_as_of(
            work,
            origin,
            horizon,
            model_id,
            prediction_spec,
            long_horizon_evidence=long_horizon_evidence,
        )
        result = _apply_structural_zero_if_allowed(
            result, work, origin, horizon, prediction_spec
        )
        result = _restore_business_eligibility_after_raw_materialization(
            result,
            original_eligibility,
            str(routing["route"]),
            spec,
        )
        return result
    if model_id == "B4":
        if b4_parameter_role is None:
            raise CalibrationV12Error("B4 requires the historical B0b parameter role")
        routing = base.route_work_as_of(work, origin, spec)
        original_eligibility = base.forecastability_as_of(work, origin, routing, spec)
        prediction_spec = _raw_prediction_spec(spec)
        result = base.predict_as_of(
            work,
            origin,
            horizon,
            "B0b",
            prediction_spec,
            long_horizon_evidence=long_horizon_evidence,
            b0b_parameter_role=b4_parameter_role,
        )
        result = _apply_structural_zero_if_allowed(
            result, work, origin, horizon, prediction_spec
        )
        result = _restore_business_eligibility_after_raw_materialization(
            result,
            original_eligibility,
            str(routing["route"]),
            spec,
        )
        result["model_id"] = "B4"
        return result
    if model_id != "B0b":
        raise CalibrationV12Error(f"unsupported v1.2 model: {model_id}")
    if not isinstance(b0b_context, Mapping) or b0b_context.get("origin") != origin:
        raise CalibrationV12Error("faithful B0b requires the matching as-of context")
    if not base.work_exists_as_of(work, origin):
        raise CalibrationV12Error("future catalog entrant cannot be predicted")

    relaxed = _raw_prediction_spec(spec)
    template = base.predict_as_of(work, origin, horizon, "B1", relaxed)
    work_id = str(work["standard_work_id"])
    routing = b0b_context["routes"].get(work_id)
    if not isinstance(routing, Mapping):
        raise CalibrationV12Error("B0b context lacks the work route")
    route = str(routing["route"])
    future = {
        base.add_months(origin, offset): 0.0 for offset in range(1, int(horizon) + 1)
    }
    components: list[dict[str, Any]] = []
    point: float | None
    if horizon == 0:
        point = 0.0
    elif route == "pure_buyout":
        point = template.get("point_forecast")
        if point is not None:
            uniform = float(point) / horizon
            future = {month: uniform for month in future}
        components = copy.deepcopy(template.get("channel_components", []))
    elif route in {"pure_sales_share", "buyout_plus_sales"}:
        total = 0.0
        for item in routing["channels"]:
            if item["label"] not in {"sales_share_channel", "mixed_channel"}:
                continue
            key = (work_id, str(item["channel_key"]))
            stats = b0b_context["stats"].get(key)
            if not isinstance(stats, Mapping):
                raise CalibrationV12Error("B0b context lacks a sales component")
            component_point, selected = _select_legacy_point(
                stats, horizon, b0b_context["priors"]
            )
            total += component_point
            uniform = component_point / horizon
            for month in future:
                future[month] += uniform
            components.append(
                {
                    "channel_key": item["channel_key"],
                    "point_forecast": round(component_point, 8),
                    "detail": {
                        "selectedLegacySubmodel": selected,
                        "lifecycle": stats["lifecycle"],
                        "scale": stats["scale"],
                        "historicalRatingProxy": "C",
                        "spikeTypesAsOf": sorted(
                            {
                                str(candidate["type"])
                                for candidate in template.get("spike_candidates", [])
                                if str(candidate.get("channel_key"))
                                == str(item["channel_key"])
                            }
                        ),
                        "confirmedTrueAnomaly": bool(
                            stats.get("confirmedTrueAnomaly")
                        ),
                        "confirmedTrueAnomalyDampingApplied": bool(
                            stats.get("confirmedTrueAnomaly")
                            and float(stats["peakShare"]) >= 0.90
                            and selected in {"B", "C", "D"}
                        ),
                        "unconfirmedSpikeDamped": False,
                        "contextFingerprint": b0b_context["fingerprint"],
                    },
                }
            )
        point = round(total, 8)
    else:
        point = (
            0.0
            if _all_cutoff_available_amounts_are_zero(work, origin, spec)
            else None
        )

    annual = base.annual_breakdown(future, point or 0.0) if point is not None else []
    limitations = list(template.get("limitation", []))
    if "unconfirmed_spike_candidate_not_damped" not in limitations and any(
        not item.get("evidenceConfirmed", False)
        for item in template.get("spike_candidates", [])
    ):
        limitations.append("unconfirmed_spike_candidate_not_damped")
    limitations = base.ordered_limitations(limitations, spec)
    public = {
        "pointForecast": point,
        "annualBreakdown": annual,
        "confidence": template.get("confidence", "unavailable"),
        "limitation": limitations,
    }
    result = copy.deepcopy(template)
    result.update(
        {
            "model_id": "B0b",
            "case_key": {
                "standard_work_id": work_id,
                "origin": origin,
                "horizon_months": int(horizon),
                "route": route,
            },
            "route": route,
            "point_forecast": point,
            "annual_breakdown": annual,
            "limitation": limitations,
            "channel_components": components,
            "public_output": public,
            "identity": "B0b_v1_1_leakage_free_replay",
        }
    )
    original_eligibility = base.forecastability_as_of(work, origin, routing, spec)
    result = _restore_business_eligibility_after_raw_materialization(
        result, original_eligibility, route, spec
    )
    strict_case_key(result)
    return result


def metric_rows(rows: Sequence[Mapping[str, Any]], prediction_field: str) -> dict[str, Any]:
    predictions: list[float] = []
    actuals: list[float] = []
    for row in rows:
        prediction = row.get(prediction_field)
        actual = row.get("actual")
        if prediction is None or actual is None:
            raise CalibrationV12Error(f"metric population has null {prediction_field} or actual")
        prediction_value = float(prediction)
        actual_value = float(actual)
        if not math.isfinite(prediction_value) or not math.isfinite(actual_value):
            raise CalibrationV12Error("metric population contains a non-finite value")
        predictions.append(prediction_value)
        actuals.append(actual_value)
    errors = [abs(prediction - actual) for prediction, actual in zip(predictions, actuals)]
    smape_terms = [
        0.0
        if prediction == 0 and actual == 0
        else 2.0 * abs(prediction - actual) / (abs(prediction) + abs(actual))
        for prediction, actual in zip(predictions, actuals)
    ]
    return {
        "caseCount": len(rows),
        "uniqueWorkCount": len({strict_case_key(row)[0] for row in rows}),
        "wape": base.wape(predictions, actuals),
        "mae": sum(errors) / len(errors) if errors else None,
        "smape": sum(smape_terms) / len(smape_terms) if smape_terms else None,
        "signedAggregateBias": base.signed_aggregate_bias(predictions, actuals),
        "actualTotal": sum(actuals),
        "predictedTotal": sum(predictions),
        "nullPredictionCount": 0,
        "zeroImputationUsed": False,
    }


def paired_relative_block_bootstrap(
    rows: Sequence[Mapping[str, Any]],
    leader: str,
    model_ids: Sequence[str],
    amendment: Mapping[str, Any],
) -> dict[str, Any]:
    """Paired work x origin bootstrap of relative WAPE deltas."""

    by_model: dict[str, dict[tuple[str, str, int, str], Mapping[str, Any]]] = {
        model: {} for model in model_ids
    }
    for row in rows:
        model = str(row.get("model_id"))
        if model not in by_model or row.get("statisticallyScoreable") is not True:
            continue
        key = strict_case_key(row)
        if key in by_model[model]:
            raise CalibrationV12Error("duplicate bootstrap case key")
        by_model[model][key] = row
    reference_keys = set(by_model[leader])
    if not reference_keys or any(set(by_model[model]) != reference_keys for model in model_ids):
        raise CalibrationV12Error("bootstrap scoreable keys are not exactly paired")
    blocks: dict[tuple[str, str], dict[str, Any]] = {}
    for key in sorted(reference_keys):
        actual = float(by_model[leader][key]["actual"])
        block = blocks.setdefault(
            (key[0], key[1]),
            {"absoluteActual": 0.0, "errors": {model: 0.0 for model in model_ids}},
        )
        block["absoluteActual"] += abs(actual)
        for model in model_ids:
            point = float(by_model[model][key]["rawModelPrediction"])
            block["errors"][model] += abs(point - actual)
    block_keys = sorted(blocks)
    bootstrap_cases = [
        {"standard_work_id": work_id, "origin": origin}
        for work_id, origin in block_keys
    ]
    contract = amendment["practicalEquivalence"]["pairedBlockBootstrapRelativeDeltaCi"]
    replicates = int(contract["replicates"])
    seed = int(contract["seed"])
    values: dict[str, list[float]] = {model: [] for model in model_ids}
    for weights in base.iter_paired_two_way_bootstrap_weights(
        bootstrap_cases, replicates, seed
    ):
        denominator = sum(
            float(weight) * float(blocks[key]["absoluteActual"])
            for weight, key in zip(weights, block_keys)
        )
        if denominator <= 0:
            raise CalibrationV12Error("bootstrap WAPE denominator is not positive")
        replicate_wape = {
            model: sum(
                float(weight) * float(blocks[key]["errors"][model])
                for weight, key in zip(weights, block_keys)
            )
            / denominator
            for model in model_ids
        }
        leader_wape = replicate_wape[leader]
        for model in model_ids:
            if leader_wape == 0:
                if replicate_wape[model] != 0:
                    raise CalibrationV12Error("relative bootstrap has a zero leader denominator")
                values[model].append(0.0)
            else:
                values[model].append(
                    (replicate_wape[model] - leader_wape) / leader_wape
                )

    def nearest_rank(items: Sequence[float], probability: float) -> float:
        ordered = sorted(items)
        rank = min(len(ordered), max(1, math.ceil(probability * len(ordered))))
        return float(ordered[rank - 1])

    comparisons = {
        model: {
            "relativeDeltaMedian": nearest_rank(model_values, 0.5),
            "percentileLower": nearest_rank(model_values, 0.025),
            "percentileUpper": nearest_rank(model_values, 0.975),
        }
        for model, model_values in values.items()
    }
    return {
        "method": "paired_two_way_pigeonhole_cluster_bootstrap",
        "clusterKeys": ["standard_work_id", "origin"],
        "caseIidSampling": False,
        "pairedAcrossModels": True,
        "statistic": contract["statistic"],
        "replicatesCompleted": replicates,
        "seed": seed,
        "workOriginBlockCount": len(block_keys),
        "comparisons": comparisons,
    }


def select_primary_comparator(
    metrics: Mapping[str, Mapping[str, Any]],
    bootstrap: Mapping[str, Any],
    amendment: Mapping[str, Any],
    legal_models: Sequence[str] = LEGAL_BASELINE_IDS,
) -> dict[str, Any]:
    rule = amendment["practicalEquivalence"]
    wapes = {
        model: float(metrics[model]["allScoreable"]["wape"])
        for model in legal_models
    }
    leader = min(legal_models, key=lambda model: (wapes[model], model))
    leader_wape = wapes[leader]
    evidence: dict[str, Any] = {}
    equivalent: list[str] = []
    for model in legal_models:
        difference = abs(wapes[model] - leader_wape)
        relative = 0.0 if leader_wape == 0 and difference == 0 else (
            difference / leader_wape if leader_wape > 0 else None
        )
        condition1 = relative is not None and relative <= (
            float(rule["relativePrimaryWapeDifferenceMaximumInclusive"]) + TOLERANCE
        )
        interval = bootstrap["comparisons"][model]
        lower, upper = float(interval["percentileLower"]), float(interval["percentileUpper"])
        margin = float(rule["pairedBlockBootstrapRelativeDeltaCi"]["requiredEntireIntervalInclusive"][1])
        condition2 = lower >= -margin - TOLERANCE and upper <= margin + TOLERANCE
        bias_difference = abs(
            float(metrics[model]["allScoreable"]["signedAggregateBias"])
            - float(metrics[leader]["allScoreable"]["signedAggregateBias"])
        )
        condition3 = bias_difference <= float(
            rule["signedBiasDifferenceMaximumInclusive"]
        ) + TOLERANCE
        regressions: dict[str, float | None] = {}
        for label, candidate_value, leader_value in [
            (
                "top10",
                metrics[model]["topBands"]["top10"]["wape"],
                metrics[leader]["topBands"]["top10"]["wape"],
            ),
            *[
                (
                    f"horizon_{horizon}",
                    metrics[model]["horizons"][str(horizon)]["wape"],
                    metrics[leader]["horizons"][str(horizon)]["wape"],
                )
                for horizon in CORE_HORIZONS
            ],
        ]:
            if candidate_value is None or leader_value is None:
                regressions[label] = None
            elif float(leader_value) == 0:
                regressions[label] = 0.0 if float(candidate_value) == 0 else None
            else:
                regressions[label] = (
                    float(candidate_value) - float(leader_value)
                ) / float(leader_value)
        maximum_regression = float(
            rule["top10AndEachCoreHorizonRelativeWapeRegressionMaximumInclusive"]
        )
        condition4 = all(
            value is not None and value <= maximum_regression + TOLERANCE
            for value in regressions.values()
        )
        is_equivalent = condition1 and condition2 and condition3 and condition4
        if is_equivalent:
            equivalent.append(model)
        evidence[model] = {
            "relativeWapeDifference": relative,
            "relativeWapeWithinOnePercent": condition1,
            "bootstrapRelativeCi": {"lower": lower, "upper": upper},
            "bootstrapCiEntirelyInsideEquivalenceRegion": condition2,
            "absoluteSignedBiasDifference": bias_difference,
            "signedBiasDifferenceWithinTwoPoints": condition3,
            "top10AndHorizonRegressions": regressions,
            "noTop10OrHorizonRegressionOverTwoPercent": condition4,
            "allFourConditions": is_equivalent,
        }
    complexity = list(rule["complexityOrderSimplestFirst"])
    primary = min(equivalent, key=lambda model: complexity.index(model))
    return {
        "empiricalWapeLeader": leader,
        "strictEquivalentSet": equivalent,
        "primaryPerformanceComparator": primary,
        "selectionReason": (
            "simplest_strictly_equivalent_to_empirical_leader"
            if primary != leader
            else "empirical_leader_no_simpler_strict_equivalent"
        ),
        "B1NaiveComparator": "B1",
        "B3BusinessAwareComparator": "B3",
        "faithfulB0bComparator": "B0b",
        "B0aSelectionEligible": False,
        "evidence": evidence,
    }


def practical_equivalence_boundary_self_test(
    amendment: Mapping[str, Any],
) -> dict[str, Any]:
    """Prove the strict inclusive AND rule at every frozen boundary."""

    leader = "B0b"
    candidate = "B1"

    def metric_bundle(
        wape: float, bias: float, regression: float
    ) -> dict[str, Any]:
        return {
            "allScoreable": {"wape": wape, "signedAggregateBias": bias},
            "topBands": {"top10": {"wape": 1.0 * (1.0 + regression)}},
            "horizons": {
                str(horizon): {"wape": 1.0 * (1.0 + regression)}
                for horizon in CORE_HORIZONS
            },
        }

    def evaluate(
        *,
        candidate_wape: float = 1.01,
        candidate_bias: float = 0.02,
        regression: float = 0.02,
        interval: tuple[float, float] = (-0.01, 0.01),
    ) -> Mapping[str, Any]:
        metrics = {
            leader: metric_bundle(1.0, 0.0, 0.0),
            candidate: metric_bundle(candidate_wape, candidate_bias, regression),
        }
        bootstrap = {
            "comparisons": {
                leader: {"percentileLower": 0.0, "percentileUpper": 0.0},
                candidate: {
                    "percentileLower": interval[0],
                    "percentileUpper": interval[1],
                },
            }
        }
        return select_primary_comparator(
            metrics, bootstrap, amendment, legal_models=(leader, candidate)
        )["evidence"][candidate]

    boundary = evaluate()
    failures = {
        "relativeWape": evaluate(candidate_wape=1.010001),
        "bootstrapLower": evaluate(interval=(-0.010001, 0.01)),
        "bootstrapUpper": evaluate(interval=(-0.01, 0.010001)),
        "signedBias": evaluate(candidate_bias=0.020001),
        "top10OrHorizon": evaluate(regression=0.020001),
        "wideCiContainsZero": evaluate(interval=(-0.05, 0.05)),
    }
    boundary_conditions = (
        boundary["relativeWapeWithinOnePercent"],
        boundary["bootstrapCiEntirelyInsideEquivalenceRegion"],
        boundary["signedBiasDifferenceWithinTwoPoints"],
        boundary["noTop10OrHorizonRegressionOverTwoPercent"],
        boundary["allFourConditions"],
    )
    passed = all(boundary_conditions) and all(
        evidence["allFourConditions"] is False for evidence in failures.values()
    )
    if not passed:
        raise CalibrationV12Error("strict practical-equivalence boundary self-test failed")
    return {
        "passed": True,
        "inclusiveBoundaryAccepted": True,
        "eachSingleConditionFailureRejected": True,
        "wideCiContainingZeroRejected": True,
        "logicalOperator": "AND",
        "testedConditions": [
            "relative_primary_wape_within_1_percent",
            "paired_block_bootstrap_ci_entirely_within_plus_minus_1_percent",
            "signed_bias_difference_within_2_percentage_points",
            "top10_and_each_core_horizon_regression_within_2_percent",
        ],
    }


def synthetic_self_test() -> dict[str, Any]:
    base_spec, _v1_1, amendment = load_and_validate_contract()
    history = [0.0] * 12 + [10.0] * 12
    stats = {**_legacy_stats(history, base_spec), "scale": "mid"}
    peak_stats = {**stats, "peakShare": 0.95, "lifecycle": "stable"}
    undamped = _legacy_model_b(peak_stats, 12, confirmed_spike=False)
    damped = _legacy_model_b(peak_stats, 12, confirmed_spike=True)
    spike_type_decisions = {
        spike_type: (
            damped if spike_type == "true_anomaly" else undamped
        )
        for spike_type in (
            "buyout",
            "launch_burst",
            "batch_proration",
            "settlement_lag",
            "true_anomaly",
            "unconfirmed",
        )
    }
    checks = {
        "modelAIsFinite": math.isfinite(_legacy_model_a(stats, 12)),
        "modelBIsFinite": math.isfinite(
            _legacy_model_b(stats, 12, confirmed_spike=False)
        ),
        "modelCRecentZero": _legacy_model_c(
            {**stats, "recentZero": True}, 12
        )
        == 0.0,
        "modelDIsFinite": math.isfinite(_legacy_model_d(stats, 12, 5.0)),
        "unconfirmedPeakNotDamped": _legacy_model_b(
            {**stats, "peakShare": 0.95}, 12, confirmed_spike=False
        )
        >= _legacy_model_b({**stats, "peakShare": 0.95}, 12, confirmed_spike=True),
        "spikeTypesDistinguishedAndOnlyConfirmedTrueAnomalyDamped": (
            damped < undamped
            and spike_type_decisions["true_anomaly"] == damped
            and all(
                spike_type_decisions[spike_type] == undamped
                for spike_type in (
                    "buyout",
                    "launch_burst",
                    "batch_proration",
                    "settlement_lag",
                    "unconfirmed",
                )
            )
        ),
        "strictAndRuleFrozen": amendment["practicalEquivalence"][
            "allConditionsRequired"
        ]
        is True,
        "publicFieldsExact": set(
            amendment["intervalAndPublicBoundary"]["publicAllowedFields"]
        )
        == {"pointForecast", "annualBreakdown", "confidence", "limitation"},
        "allSealsClosed": all(
            amendment["seals"][key] is False
            for key in (
                "finalHoldoutOpened",
                "embargoShadowOpened",
                "deferred60MonthLabelsOpened",
            )
        ),
    }
    if not all(checks.values()):
        raise CalibrationV12Error("v1.2 synthetic self-test failed")
    return {
        "status": "passed",
        "checks": checks,
        "spikeTypeDecisions": {
            key: "confirmed_true_anomaly_damped"
            if key == "true_anomaly"
            else "not_automatically_damped"
            for key in spike_type_decisions
        },
        "specDigest": canonical_digest(amendment),
    }


__all__ = [
    "BASELINE_IDS",
    "C1_COMPONENT_IDS",
    "CORE_HORIZONS",
    "CalibrationV12Error",
    "build_b0b_context",
    "c1_candidate_by_id",
    "c1_component_monthly_values",
    "c1_component_point_predictions",
    "canonical_digest",
    "load_amendment",
    "load_and_validate_contract",
    "metric_rows",
    "enumerate_c1_candidates",
    "paired_relative_block_bootstrap",
    "predict_as_of",
    "select_primary_comparator",
    "strict_case_key",
    "synthetic_self_test",
    "practical_equivalence_boundary_self_test",
    "validate_case_state",
]
