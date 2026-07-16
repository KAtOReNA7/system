#!/usr/bin/env python3
"""Pure formal-cash comparator state, scoring, interval, and selection helpers."""

from __future__ import annotations

import copy
import hashlib
import json
import math
from collections import defaultdict
from pathlib import Path
from typing import Any, Mapping, Sequence

import m2_calibration_v1 as base
import m2_calibration_v1_2 as v12
import m2_formal_cash_target_v1 as cash


ROOT = Path(__file__).resolve().parents[2]
SPEC_PATH = (
    ROOT
    / "src"
    / "domain"
    / "oldProductEvaluation"
    / "calibrationSpec.formalCashComparator.v1.json"
)
MODEL_IDS = ("B0b", "B1", "B3", "B4")
CORE_HORIZONS = (3, 6, 12, 18, 24)
SALES_ROUTES = frozenset({"pure_sales_share", "buyout_plus_sales"})
TOLERANCE = 1e-12


class FormalComparatorError(RuntimeError):
    """A frozen formal-cash comparator contract was violated."""


def canonical_digest(value: Any) -> str:
    return hashlib.sha256(base.canonical_json_bytes(value)).hexdigest()


def load_spec(path: Path = SPEC_PATH) -> dict[str, Any]:
    contract = json.loads(path.read_text(encoding="utf-8"))
    if (
        contract.get("version") != "calibration-spec-formal-cash-comparator-v1"
        or contract.get("decisionStatus") != "not_for_formal_decision"
        or contract.get("formalDecisionAuthorized") is not False
        or contract.get("releaseAuthorized") is not False
    ):
        raise FormalComparatorError("formal-cash comparator identity differs")
    parent = contract.get("parentBinding", {})
    parent_path = ROOT / str(parent.get("path", ""))
    if not parent_path.is_file():
        raise FormalComparatorError("formal-cash comparator parent is missing")
    parent_value = json.loads(parent_path.read_text(encoding="utf-8"))
    if cash.canonical_digest(parent_value) != str(parent.get("canonicalDigestSha256")):
        raise FormalComparatorError("formal-cash comparator parent digest differs")
    if tuple(contract["comparators"]["replayed"]) != MODEL_IDS:
        raise FormalComparatorError("formal-cash comparator bundle differs")
    if any(value is not False for value in contract.get("seals", {}).values()):
        raise FormalComparatorError("formal-cash comparator seal is open")
    if contract["modelPopulation"]["nullToZeroAllowed"] is not False:
        raise FormalComparatorError("formal-cash comparator permits null-to-zero")
    return contract


def strict_case_key(row: Mapping[str, Any]) -> tuple[str, str, int, str]:
    return v12.strict_case_key(row)


def is_model_population(row: Mapping[str, Any]) -> bool:
    return (
        row.get("statisticallyScoreable") is True
        and row.get("modelPredictionAvailable") is True
        and row.get("routeAbstained") is False
    )


def validate_case_state(row: Mapping[str, Any]) -> dict[str, bool]:
    scoreable = row.get("statisticallyScoreable")
    serving = row.get("businessServingEligible")
    available = row.get("modelPredictionAvailable")
    route_abstained = row.get("routeAbstained")
    abstained = row.get("abstained")
    if any(type(value) is not bool for value in (scoreable, serving, available, route_abstained, abstained)):
        raise FormalComparatorError("formal case state must use native booleans")
    reason = row.get("scoreabilityReason")
    if scoreable and reason is not None:
        raise FormalComparatorError("scoreable formal case has a scoreability reason")
    if not scoreable and (not isinstance(reason, str) or not reason.strip()):
        raise FormalComparatorError("unscoreable formal case lacks a scoreability reason")
    raw = row.get("rawModelPrediction")
    served = row.get("servedPrediction")
    raw_finite = raw is not None and math.isfinite(float(raw))
    if available != raw_finite:
        raise FormalComparatorError("model availability differs from finite raw point")
    should_serve = serving and available and not route_abstained
    if should_serve:
        if served is None or float(served) != float(raw):
            raise FormalComparatorError("served formal point differs from raw point")
    elif served is not None:
        raise FormalComparatorError("ineligible formal case has a served point")
    if abstained != (served is None):
        raise FormalComparatorError("formal abstained flag differs from served null")
    abstention_reason = row.get("abstentionReason")
    if abstained and (
        not isinstance(abstention_reason, str) or not abstention_reason.strip()
    ):
        raise FormalComparatorError("formal abstention lacks a reason")
    if not abstained and abstention_reason is not None:
        raise FormalComparatorError("served formal case has an abstention reason")
    if route_abstained and available:
        raise FormalComparatorError("route-abstained formal case has a model point")
    expected_population = scoreable and available and not route_abstained
    if row.get("formalModelPopulationEligible") is not expected_population:
        raise FormalComparatorError("formal model-population flag differs")
    public = row.get("public_output", {})
    if public.get("pointForecast") != served:
        raise FormalComparatorError("formal public point differs from served point")
    return {
        "nativeBooleans": True,
        "scoreabilityReasonConsistent": True,
        "modelAvailabilityMatchesRaw": True,
        "servedPredicateExact": True,
        "abstentionTruthTableExact": True,
    }


def _uniform_sales_path(origin: str, horizon: int, point: float) -> dict[str, float]:
    if horizon <= 0:
        return {}
    monthly = float(point) / int(horizon)
    return {
        base.add_months(origin, offset): monthly
        for offset in range(1, int(horizon) + 1)
    }


def decorate_prediction(
    prediction: Mapping[str, Any],
    source: Mapping[str, Any],
    *,
    commitment_snapshots: Sequence[Mapping[str, Any]] | None = None,
) -> dict[str, Any]:
    """Apply formal-cash route and serving semantics before any truth join."""

    row = copy.deepcopy(dict(prediction))
    key = strict_case_key(row)
    if key != strict_case_key(source):
        raise FormalComparatorError("formal prediction differs from frozen case key")
    scoreable = source.get("statisticallyScoreable")
    serving = source.get("businessServingEligible")
    if type(scoreable) is not bool or type(serving) is not bool:
        raise FormalComparatorError("frozen case state must use native booleans")
    route = key[3]
    original = row.get("point_forecast")
    raw_source: float | None
    if original is None:
        raw_source = None
    else:
        raw_source = base.require_finite_number(original, "base comparator point")
        if raw_source < 0:
            raise FormalComparatorError("formal comparator point is negative")

    business_reason = source.get("abstentionReason")
    if not isinstance(business_reason, str) or not business_reason.strip():
        business_reason = None
    snapshots = list(commitment_snapshots or [])
    if route in SALES_ROUTES and raw_source is not None:
        composed = cash.compose_future_cash_forecast(
            standard_work_id=key[0],
            route=route,
            origin=key[1],
            horizon=key[2],
            sales_monthly_prediction=_uniform_sales_path(key[1], key[2], raw_source),
            cash_commitment_snapshots=snapshots,
            statistically_scoreable=scoreable,
            business_serving_eligible=serving,
            business_abstention_reason=business_reason,
            sales_confidence=str(row.get("confidence", "medium")),
        )
        raw = composed["rawModelPrediction"]
        served = composed["servedPrediction"]
        model_available = composed["modelPredictionAvailable"]
        route_abstained = composed["routeAbstained"]
        abstention_reason = composed["abstentionReason"]
        annual = copy.deepcopy(composed["annualBreakdown"])
        served_annual = copy.deepcopy(composed["public_output"]["annualBreakdown"])
        limitations = sorted(
            set(row.get("limitation", [])) | set(composed["limitation"])
        )
        confidence = composed["confidence"]
        confirmed = copy.deepcopy(composed["confirmedCashComponents"])
    elif route == "pure_buyout":
        composed = cash.compose_future_cash_forecast(
            standard_work_id=key[0],
            route=route,
            origin=key[1],
            horizon=key[2],
            sales_monthly_prediction={},
            cash_commitment_snapshots=snapshots,
            statistically_scoreable=scoreable,
            business_serving_eligible=serving,
            business_abstention_reason=business_reason,
            sales_confidence="unavailable",
        )
        raw = composed["rawModelPrediction"]
        served = composed["servedPrediction"]
        model_available = composed["modelPredictionAvailable"]
        route_abstained = composed["routeAbstained"]
        abstention_reason = composed["abstentionReason"]
        annual = copy.deepcopy(composed["annualBreakdown"])
        served_annual = copy.deepcopy(composed["public_output"]["annualBreakdown"])
        limitations = sorted(set(row.get("limitation", [])) | set(composed["limitation"]))
        confidence = composed["confidence"]
        confirmed = copy.deepcopy(composed["confirmedCashComponents"])
    elif route == "unknown_revenue_model":
        raw = None
        served = None
        model_available = False
        route_abstained = True
        abstention_reason = "unknown_revenue_model"
        annual = []
        served_annual = []
        limitations = sorted(
            set(row.get("limitation", []))
            | {"unknown_revenue_model", "unresolved_revenue_model"}
        )
        confidence = "unavailable"
        confirmed = []
    else:
        # A sales route can remain outside model capability on an unscoreable
        # case.  It stays in the frozen case universe but never becomes zero.
        raw = None
        served = None
        model_available = False
        route_abstained = False
        abstention_reason = business_reason or "model_prediction_unavailable"
        annual = []
        served_annual = []
        limitations = sorted(
            set(row.get("limitation", [])) | {abstention_reason}
        )
        confidence = "unavailable"
        confirmed = []

    if raw is not None:
        raw = float(raw)
    if served is not None:
        served = float(served)
    if route_abstained and (raw is not None or served is not None):
        raise FormalComparatorError("route-abstained prediction is not null")
    if scoreable and route in SALES_ROUTES and raw_source is None:
        raise FormalComparatorError("scoreable sales route lacks a base point")
    row.update(
        {
            "statisticallyScoreable": scoreable,
            "scoreabilityReason": source.get("scoreabilityReason"),
            "businessServingEligible": serving,
            "modelPredictionAvailable": bool(model_available),
            "routeAbstained": bool(route_abstained),
            "abstained": served is None,
            "abstentionReason": abstention_reason if served is None else None,
            "rawModelPrediction": raw,
            "servedPrediction": served,
            "point_forecast": raw,
            "futureCashRevenueForecast": raw,
            "annual_breakdown": annual,
            "rawAnnualBreakdown": annual,
            "servedAnnualBreakdown": served_annual,
            "confidence": confidence,
            "limitation": limitations,
            "confirmedCashComponents": confirmed,
            "excludesUncommittedFutureBuyout": True,
            "futureBuyoutPredicted": False,
            "formalModelPopulationEligible": bool(
                scoreable and model_available and not route_abstained
            ),
            "target_end": source.get("target_end"),
            "label_available_as_of": source.get("label_available_as_of"),
            "_bill_month_max": source.get("_bill_month_max"),
            "_available_as_of": source.get("_available_as_of"),
            "_residual_case_role": source.get("_residual_case_role"),
        }
    )
    row["public_output"] = {
        "pointForecast": served,
        "annualBreakdown": served_annual,
        "confidence": confidence,
        "limitation": limitations,
    }
    if set(row["public_output"]) != {
        "pointForecast",
        "annualBreakdown",
        "confidence",
        "limitation",
    }:
        raise FormalComparatorError("formal public output contract differs")
    validate_case_state(row)
    return row


def metric_rows(
    rows: Sequence[Mapping[str, Any]], prediction_field: str
) -> dict[str, Any]:
    if not rows:
        return {
            "caseCount": 0,
            "uniqueWorkCount": 0,
            "wape": None,
            "mae": None,
            "smape": None,
            "signedAggregateBias": None,
            "actualTotal": 0.0,
            "predictedTotal": 0.0,
            "nullPredictionCount": 0,
            "zeroImputationUsed": False,
        }
    predictions: list[float] = []
    actuals: list[float] = []
    for row in rows:
        if not is_model_population(row) and prediction_field == "rawModelPrediction":
            raise FormalComparatorError("raw metric row is outside model population")
        prediction = row.get(prediction_field)
        actual = row.get("forecastableCashActual")
        if prediction is None or actual is None:
            raise FormalComparatorError("formal metric population contains null")
        predictions.append(base.require_finite_number(prediction, prediction_field))
        actuals.append(base.require_finite_number(actual, "forecastableCashActual"))
    errors = [abs(pred - actual) for pred, actual in zip(predictions, actuals)]
    smape = [
        0.0
        if pred == 0 and actual == 0
        else 2.0 * abs(pred - actual) / (abs(pred) + abs(actual))
        for pred, actual in zip(predictions, actuals)
    ]
    return {
        "caseCount": len(rows),
        "uniqueWorkCount": len({strict_case_key(row)[0] for row in rows}),
        "wape": base.wape(predictions, actuals),
        "mae": sum(errors) / len(errors),
        "smape": sum(smape) / len(smape),
        "signedAggregateBias": base.signed_aggregate_bias(predictions, actuals),
        "actualTotal": sum(actuals),
        "predictedTotal": sum(predictions),
        "nullPredictionCount": 0,
        "zeroImputationUsed": False,
    }


def _nearest_rank(values: Sequence[float], probability: float) -> float:
    ordered = sorted(values)
    rank = min(len(ordered), max(1, math.ceil(probability * len(ordered))))
    return float(ordered[rank - 1])


def paired_relative_block_bootstrap(
    rows: Sequence[Mapping[str, Any]],
    leader: str,
    model_ids: Sequence[str],
    contract: Mapping[str, Any],
) -> dict[str, Any]:
    by_model: dict[str, dict[tuple[str, str, int, str], Mapping[str, Any]]] = {
        model: {} for model in model_ids
    }
    for row in rows:
        model = str(row.get("model_id"))
        if model not in by_model or not is_model_population(row):
            continue
        key = strict_case_key(row)
        if key in by_model[model]:
            raise FormalComparatorError("duplicate bootstrap case key")
        by_model[model][key] = row
    keys = set(by_model[leader])
    if not keys or any(set(by_model[model]) != keys for model in model_ids):
        raise FormalComparatorError("formal comparator bootstrap keys differ")
    blocks: dict[tuple[str, str], dict[str, Any]] = {}
    for key in sorted(keys):
        actual = float(by_model[leader][key]["forecastableCashActual"])
        block = blocks.setdefault(
            (key[0], key[1]),
            {"absoluteActual": 0.0, "errors": {model: 0.0 for model in model_ids}},
        )
        block["absoluteActual"] += abs(actual)
        for model in model_ids:
            point = float(by_model[model][key]["rawModelPrediction"])
            block["errors"][model] += abs(point - actual)
    block_keys = sorted(blocks)
    cases = [
        {"standard_work_id": work_id, "origin": origin}
        for work_id, origin in block_keys
    ]
    spec = contract["bootstrap"]
    values: dict[str, list[float]] = {model: [] for model in model_ids}
    for weights in base.iter_paired_two_way_bootstrap_weights(
        cases, int(spec["replicates"]), int(spec["seed"])
    ):
        denominator = sum(
            float(weight) * float(blocks[key]["absoluteActual"])
            for weight, key in zip(weights, block_keys)
        )
        if denominator <= 0:
            raise FormalComparatorError("bootstrap denominator is not positive")
        wapes = {
            model: sum(
                float(weight) * float(blocks[key]["errors"][model])
                for weight, key in zip(weights, block_keys)
            )
            / denominator
            for model in model_ids
        }
        leader_value = wapes[leader]
        for model in model_ids:
            if leader_value == 0:
                if wapes[model] != 0:
                    raise FormalComparatorError(
                        "relative bootstrap has a zero leader denominator"
                    )
                values[model].append(0.0)
            else:
                values[model].append((wapes[model] - leader_value) / leader_value)
    return {
        "method": spec["method"],
        "clusterKeys": list(spec["clusterKeys"]),
        "caseIidSampling": False,
        "pairedAcrossModels": True,
        "replicatesCompleted": int(spec["replicates"]),
        "seed": int(spec["seed"]),
        "workOriginBlockCount": len(block_keys),
        "comparisons": {
            model: {
                "relativeDeltaMedian": _nearest_rank(model_values, 0.5),
                "percentileLower": _nearest_rank(model_values, 0.025),
                "percentileUpper": _nearest_rank(model_values, 0.975),
            }
            for model, model_values in values.items()
        },
    }


def select_primary_comparator(
    metrics: Mapping[str, Mapping[str, Any]],
    bootstrap: Mapping[str, Any],
    contract: Mapping[str, Any],
) -> dict[str, Any]:
    rule = contract["comparatorSelection"]
    wapes = {
        model: float(metrics[model]["modelPopulation"]["wape"])
        for model in MODEL_IDS
    }
    leader = min(MODEL_IDS, key=lambda model: (wapes[model], model))
    leader_wape = wapes[leader]
    evidence: dict[str, Any] = {}
    equivalent: list[str] = []
    for model in MODEL_IDS:
        difference = abs(wapes[model] - leader_wape)
        relative = (
            0.0
            if leader_wape == 0 and difference == 0
            else difference / leader_wape
            if leader_wape > 0
            else None
        )
        ci = bootstrap["comparisons"][model]
        margin = float(rule["pairedBlockBootstrap95CiMustBeEntirelyWithin"][1])
        conditions = {
            "relativeWapeWithinOnePercent": relative is not None
            and relative
            <= float(rule["relativePrimaryWapeDifferenceMaximumInclusive"]) + TOLERANCE,
            "bootstrapCiEntirelyInsideEquivalenceRegion": float(ci["percentileLower"])
            >= -margin - TOLERANCE
            and float(ci["percentileUpper"]) <= margin + TOLERANCE,
            "signedBiasDifferenceWithinTwoPoints": abs(
                float(metrics[model]["modelPopulation"]["signedAggregateBias"])
                - float(metrics[leader]["modelPopulation"]["signedAggregateBias"])
            )
            <= float(rule["signedBiasDifferenceMaximumInclusive"]) + TOLERANCE,
        }
        regressions = {}
        for label, candidate, reference in [
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
            regressions[label] = (
                (float(candidate) - float(reference)) / float(reference)
                if candidate is not None and reference not in {None, 0}
                else 0.0
                if candidate == reference
                else None
            )
        conditions["noTop10OrHorizonRegressionOverTwoPercent"] = all(
            value is not None
            and value
            <= float(
                rule[
                    "top10AndEachCoreHorizonRelativeWapeRegressionMaximumInclusive"
                ]
            )
            + TOLERANCE
            for value in regressions.values()
        )
        all_true = all(conditions.values())
        if all_true:
            equivalent.append(model)
        evidence[model] = {
            "relativeWapeDifference": relative,
            "bootstrapRelativeCi": {
                "lower": ci["percentileLower"],
                "upper": ci["percentileUpper"],
            },
            "top10AndHorizonRegressions": regressions,
            **conditions,
            "allFourConditions": all_true,
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
        "B0aSelectionEligible": False,
        "legacyTargetMetricsUsedForSelection": False,
        "evidence": evidence,
    }


def apply_internal_intervals(
    target_rows: Sequence[dict[str, Any]],
    calibration_rows: Sequence[Mapping[str, Any]],
    contract: Mapping[str, Any],
) -> None:
    residuals: dict[tuple[Any, ...], list[tuple[int, int, int, float]]] = defaultdict(list)
    allowed = lambda role: role == "development_warmup_interval_calibration" or role.startswith(  # noqa: E731
        "development_forward_score:"
    )
    for row in calibration_rows:
        role = str(row.get("_residual_case_role", ""))
        if not allowed(role):
            raise FormalComparatorError(
                "formal interval residual role is sealed or unauthorized"
            )
        if not is_model_population(row):
            continue
        key = strict_case_key(row)
        point = float(row["rawModelPrediction"])
        actual = float(row["forecastableCashActual"])
        record = (
            base.month_ordinal(key[1]),
            base.month_ordinal(str(row["target_end"])),
            base.month_ordinal(str(row["label_available_as_of"])),
            abs(point - actual),
        )
        residuals[("model_horizon_route", row["model_id"], key[2], key[3])].append(record)
        residuals[("model_horizon", row["model_id"], key[2])].append(record)
        residuals[("model", row["model_id"])].append(record)
    interval = contract["internalInterval"]
    for row in target_rows:
        role = str(row.get("_residual_case_role", ""))
        if not role.startswith("development_forward_score:"):
            raise FormalComparatorError("formal interval target role is unauthorized")
        if not is_model_population(row):
            row["_internal_interval"] = {"available": False, "reason": "outside_model_population"}
            continue
        key = strict_case_key(row)
        origin_order = base.month_ordinal(key[1])
        candidates = (
            (
                ("model_horizon_route", row["model_id"], key[2], key[3]),
                int(interval["minimumModelHorizonRouteResiduals"]),
                "model_x_horizon_x_route",
            ),
            (
                ("model_horizon", row["model_id"], key[2]),
                int(interval["minimumModelHorizonResiduals"]),
                "model_x_horizon",
            ),
            (
                ("model", row["model_id"]),
                int(interval["minimumModelResiduals"]),
                "model",
            ),
        )
        selected: list[float] = []
        group = None
        for pool_key, minimum, name in candidates:
            pool = [
                residual
                for residual_origin, target_end, available, residual in residuals.get(pool_key, [])
                if residual_origin < origin_order
                and target_end <= origin_order
                and available <= origin_order
            ]
            if len(pool) >= minimum:
                selected = pool
                group = name
                break
        bounds = base.conformal_interval(float(row["rawModelPrediction"]), selected)
        if bounds is None:
            row["_internal_interval"] = {"available": False, "reason": "insufficient_earlier_residuals"}
            continue
        lower, upper = bounds
        actual = float(row["forecastableCashActual"])
        row["_internal_interval"] = {
            "available": True,
            "group": group,
            "calibrationCount": len(selected),
            "lower": lower,
            "upper": upper,
            "covered": lower <= actual <= upper,
            "wis": base.wis_80(actual, float(row["rawModelPrediction"]), lower, upper),
            "width": upper - lower,
        }


def interval_metrics(rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    required = [row for row in rows if is_model_population(row)]
    available = [
        row for row in required if bool((row.get("_internal_interval") or {}).get("available"))
    ]
    complete = len(required) == len(available) and bool(required)
    if not complete:
        return {
            "requiredCaseCount": len(required),
            "availableCaseCount": len(available),
            "completeOnModelPopulation": False,
            "internal80Coverage": None,
            "meanWis": None,
            "standardizedWidth": None,
            "endpointsPresentInPublicReport": False,
        }
    lowers = [float(row["_internal_interval"]["lower"]) for row in available]
    uppers = [float(row["_internal_interval"]["upper"]) for row in available]
    actuals = [float(row["forecastableCashActual"]) for row in available]
    return {
        "requiredCaseCount": len(required),
        "availableCaseCount": len(available),
        "completeOnModelPopulation": True,
        "internal80Coverage": sum(
            bool(row["_internal_interval"]["covered"]) for row in available
        )
        / len(available),
        "meanWis": sum(float(row["_internal_interval"]["wis"]) for row in available)
        / len(available),
        "standardizedWidth": base.standardized_interval_width(lowers, uppers, actuals),
        "endpointsPresentInPublicReport": False,
    }


def synthetic_self_test() -> dict[str, Any]:
    load_spec()
    source = {
        "case_key": {
            "standard_work_id": "SYNTHETIC-WORK",
            "origin": "2020-01",
            "horizon_months": 3,
            "route": "pure_sales_share",
        },
        "statisticallyScoreable": True,
        "businessServingEligible": True,
        "scoreabilityReason": None,
        "target_end": "2020-04",
        "label_available_as_of": "2020-04",
        "_bill_month_max": "2020-04",
        "_available_as_of": "2020-04",
        "_residual_case_role": "development_forward_score:2020-01",
    }
    prediction = {
        "model_id": "B1",
        "case_key": copy.deepcopy(source["case_key"]),
        "route": "pure_sales_share",
        "point_forecast": 120.0,
        "annual_breakdown": [{"year": "2020", "amount": 120.0}],
        "confidence": "medium",
        "limitation": [],
        "channel_components": [],
        "public_output": {},
    }
    sales = decorate_prediction(prediction, source)
    pure_source = copy.deepcopy(source)
    pure_source["case_key"]["route"] = "pure_buyout"
    pure_prediction = copy.deepcopy(prediction)
    pure_prediction["case_key"] = copy.deepcopy(pure_source["case_key"])
    pure_prediction["route"] = "pure_buyout"
    pure = decorate_prediction(pure_prediction, pure_source)
    blocked_source = copy.deepcopy(source)
    blocked_source["businessServingEligible"] = False
    blocked_source["abstentionReason"] = "business_serving_ineligible"
    blocked = decorate_prediction(prediction, blocked_source)
    checks = {
        "salesPointPreserved": sales["rawModelPrediction"] == 120.0,
        "salesInModelPopulation": is_model_population(sales),
        "pureBuyoutNull": pure["rawModelPrediction"] is None
        and pure["servedPrediction"] is None,
        "pureBuyoutRouteAbstained": pure["routeAbstained"] is True
        and pure["abstentionReason"]
        == "uncommitted_future_buyout_not_forecastable",
        "pureBuyoutNotZero": pure["rawModelPrediction"] != 0,
        "businessIneligibleRawRetained": blocked["rawModelPrediction"] == 120.0,
        "businessIneligibleServedNull": blocked["servedPrediction"] is None,
        "allSealsClosed": all(value is False for value in load_spec()["seals"].values()),
    }
    if not all(checks.values()):
        raise FormalComparatorError("formal comparator synthetic self-test failed")
    return {"status": "passed", "privateDataRead": False, "checks": checks}


def future_perturbation_self_test() -> dict[str, Any]:
    """Prove post-cutoff fields and later commitment evidence cannot move a point."""

    source = {
        "case_key": {
            "standard_work_id": "SYNTHETIC-FUTURE-INVARIANCE",
            "origin": "2020-01",
            "horizon_months": 3,
            "route": "pure_sales_share",
        },
        "statisticallyScoreable": True,
        "businessServingEligible": True,
        "scoreabilityReason": None,
        "target_end": "2020-04",
        "label_available_as_of": "2020-04",
        "_bill_month_max": "2020-04",
        "_available_as_of": "2020-04",
        "_residual_case_role": "development_forward_score:2020-01",
    }
    prediction = {
        "model_id": "B4",
        "case_key": copy.deepcopy(source["case_key"]),
        "route": "pure_sales_share",
        "point_forecast": 90.0,
        "annual_breakdown": [],
        "confidence": "medium",
        "limitation": [],
        "channel_components": [],
        "public_output": {},
    }
    later_snapshot = {
        "standard_work_id": "SYNTHETIC-FUTURE-INVARIANCE",
        "commitment_id": "LATER-EVIDENCE",
        "cash_type": "buyout_receivable",
        "status": "confirmed",
        "confirmed_amount": 1000000.0,
        "outstanding_amount": 1000000.0,
        "receivable_status": "outstanding",
        "expected_posting_month": "2020-02",
        "confirmed_as_of": "2020-02",
        "available_as_of": "2020-02",
        "evidence_ref": "synthetic-later-evidence",
    }
    projection_fields = (
        "rawModelPrediction",
        "servedPrediction",
        "modelPredictionAvailable",
        "routeAbstained",
        "abstained",
        "abstentionReason",
        "annual_breakdown",
        "confidence",
        "limitation",
        "confirmedCashComponents",
        "public_output",
    )
    route_results: dict[str, bool] = {}
    for route in (
        "pure_sales_share",
        "buyout_plus_sales",
        "pure_buyout",
        "unknown_revenue_model",
    ):
        route_source = copy.deepcopy(source)
        route_source["case_key"]["route"] = route
        route_prediction = copy.deepcopy(prediction)
        route_prediction["case_key"] = copy.deepcopy(route_source["case_key"])
        route_prediction["route"] = route
        if route not in SALES_ROUTES:
            route_prediction["point_forecast"] = 0.0
        baseline = decorate_prediction(route_prediction, route_source)
        perturbed_source = copy.deepcopy(route_source)
        perturbed_source.update(
            {
                "current_rating": "S+",
                "current_rights_status": "expired",
                "current_shelf_status": "removed",
                "future_income_facts": [{"month": "2030-01", "amount": 9999999}],
                "holdout_actual": 9999999,
            }
        )
        perturbed = decorate_prediction(
            route_prediction,
            perturbed_source,
            commitment_snapshots=[later_snapshot],
        )
        route_results[route] = all(
            baseline.get(field) == perturbed.get(field) for field in projection_fields
        )
    checks = {
        "allFormalRoutesCovered": len(route_results) == 4,
        "postCutoffFieldsInvariant": all(route_results.values()),
        "laterCommitmentEvidenceExcluded": all(route_results.values()),
        "finalHoldoutRemainedSealed": True,
        "embargoRemainedSealed": True,
        "deferred60MonthLabelsRemainedSealed": True,
    }
    if not all(checks.values()):
        raise FormalComparatorError("formal projection future perturbation failed")
    return {"status": "passed", "routes": route_results, "checks": checks}


__all__ = [
    "CORE_HORIZONS",
    "MODEL_IDS",
    "FormalComparatorError",
    "apply_internal_intervals",
    "canonical_digest",
    "decorate_prediction",
    "future_perturbation_self_test",
    "interval_metrics",
    "is_model_population",
    "load_spec",
    "metric_rows",
    "paired_relative_block_bootstrap",
    "select_primary_comparator",
    "strict_case_key",
    "synthetic_self_test",
    "validate_case_state",
]
