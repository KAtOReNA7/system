#!/usr/bin/env python3
"""Replay M2 B0b--B3 under calibration-spec-v1.1 scoring semantics.

The default command is a synthetic-only preflight.  ``--run-development``
reads only the already verified, authorized local model-input cache and writes
de-identified aggregate reports plus ignored private case evidence.  Candidate
training, final holdout, embargo shadow, deferred 60-month labels, release, and
M3 are intentionally unavailable.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import pickle
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

import m2_calibration_attribution_v1_1 as attribution
import m2_calibration_scoring_v1_1 as scoring
import m2_calibration_v1 as calibration
import run_m2_calibration_baseline_replay as legacy


ROOT = Path(__file__).resolve().parents[2]
PUBLIC_DIR = ROOT / "docs" / "analysis" / "m2-real-data"
PRIVATE_DIR = ROOT / "data" / "private-output" / "m2-calibration-v1"
BASELINE_IDS = scoring.BASELINE_IDS

BASELINE_JSON = PUBLIC_DIR / "M2-calibration-baseline-development-v1.1.json"
BASELINE_MD = PUBLIC_DIR / "M2-calibration-baseline-development-v1.1.md"
CORRECTION_JSON = PUBLIC_DIR / "M2-calibration-baseline-scoring-correction-v1.json"
CORRECTION_MD = PUBLIC_DIR / "M2-calibration-baseline-scoring-correction-v1.md"
ATTRIBUTION_JSON = PUBLIC_DIR / "M2-B0a-B0b-replay-attribution-v1.json"
ATTRIBUTION_MD = PUBLIC_DIR / "M2-B0a-B0b-replay-attribution-v1.md"
PRIVATE_CASES = PRIVATE_DIR / "M2-calibration-baseline-development-cases-private-v1.1.ndjson"
PRIVATE_MANIFEST = PRIVATE_DIR / "M2-calibration-baseline-development-manifest-private-v1.1.json"


class CorrectionError(RuntimeError):
    """The scoring correction cannot be completed without breaking a seal."""


def progress(message: str) -> None:
    print(f"[m2-calibration-v1.1] {message}", file=sys.stderr, flush=True)


def rounded(value: Any, places: int = 8) -> float | None:
    if value is None:
        return None
    number = float(value)
    return round(number, places) if math.isfinite(number) else None


def digest(value: Any) -> str:
    return scoring.canonical_digest(value)


def _minimum_history(spec: Mapping[str, Any]) -> int:
    return int(spec["forecastability"]["rules"]["minimumObservedCalendarMonths"])


def _work_observed_months(work: Mapping[str, Any], origin: str) -> int:
    first = scoring.first_observed_source_month(work)
    if first is None or first > origin:
        return 0
    return calibration.month_ordinal(origin) - calibration.month_ordinal(first) + 1


def _relaxed_spec(spec: Mapping[str, Any]) -> dict[str, Any]:
    result = copy.deepcopy(spec)
    result["forecastability"]["rules"]["minimumObservedCalendarMonths"] = 0
    return result


def _aggregate_history(
    work: Mapping[str, Any], origin: str, spec: Mapping[str, Any]
) -> tuple[list[str], list[float]]:
    months = calibration.month_range(spec["authority"]["firstBillMonth"], origin)
    totals = {month: 0.0 for month in months}
    for channel in work.get("channels", []) or []:
        first = str(channel.get("first_observed_month", ""))
        if first and first > origin:
            continue
        for month, value in (channel.get("monthly", {}) or {}).items():
            month_text = str(month)
            if month_text in totals:
                totals[month_text] += calibration.finite_number(value)
    return months, [totals[month] for month in months]


def _unresolved_raw_fallback(
    work: Mapping[str, Any],
    origin: str,
    horizon: int,
    model_id: str,
    spec: Mapping[str, Any],
    b0b_role: str | None,
) -> dict[str, Any]:
    """Keep an audit-only raw point when a route is unresolved; never serve it."""

    months, history = _aggregate_history(work, origin, spec)
    forecast, detail = calibration._sales_monthly_forecast(  # pylint: disable=protected-access
        months, history, origin, horizon, model_id, spec
    )
    if model_id == "B0b":
        detail["parameterRole"] = b0b_role
    point = round(sum(float(value) for value in forecast.values()), 8)
    return {
        "point": point,
        "annual": calibration.annual_breakdown(forecast, point),
        "source": "aggregate_diagnostic_fallback_unresolved_route_not_served",
        "detail": detail,
    }


def _raw_prediction(
    work: Mapping[str, Any],
    origin: str,
    horizon: int,
    model_id: str,
    spec: Mapping[str, Any],
    b0b_role: str | None,
) -> dict[str, Any]:
    relaxed = _relaxed_spec(spec)
    prediction = calibration.predict_as_of(
        work,
        origin,
        horizon,
        model_id,
        relaxed,
        b0b_parameter_role=b0b_role if model_id == "B0b" else None,
    )
    point = prediction.get("point_forecast")
    if point is not None:
        return {
            "point": float(point),
            "annual": copy.deepcopy(prediction.get("annual_breakdown", [])),
            "source": "frozen_formula_with_scoreability_decoupled",
            "detail": None,
        }
    return _unresolved_raw_fallback(
        work, origin, horizon, model_id, relaxed, b0b_role
    )


def _b0b_fold_spec(
    spec: Mapping[str, Any], evidence: Mapping[str, Any], origin: str
) -> dict[str, Any]:
    result = copy.deepcopy(spec)
    baseline = next(
        item for item in result["models"]["baselines"] if item["id"] == "B0b"
    )
    factors = evidence["foldFactors"].get(str(origin))
    if not isinstance(factors, Mapping):
        raise CorrectionError(f"B0b fold factors are unavailable for {origin}")
    baseline["lifecycleFactors"] = dict(factors)
    baseline.pop("boundFittedParameterDigest", None)
    return result


def materialize_raw_predictions(
    rows: Sequence[Mapping[str, Any]],
    works: Sequence[Mapping[str, Any]],
    spec: Mapping[str, Any],
    *,
    b0b_role: str,
    fold_evidence: Mapping[str, Any] | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Materialize raw values without reading ``actual`` or any post-cutoff fact."""

    work_lookup = {str(work["standard_work_id"]): work for work in works}
    output: list[dict[str, Any]] = []
    newly_materialized = 0
    unresolved_fallbacks = 0
    raw_lock_rows: list[dict[str, Any]] = []
    for source in rows:
        row = copy.deepcopy(dict(source))
        work_id, origin, horizon, route = legacy.case_key(row)
        work = work_lookup[work_id]
        existing = legacy.scoring_point(row)
        raw_source = "existing_locked_numeric_point"
        annual = copy.deepcopy(row.get("annual_breakdown", []))
        raw = float(existing) if existing is not None else None
        if raw is None and _work_observed_months(work, origin) >= _minimum_history(spec):
            prediction_spec = spec
            role = None
            if row["model_id"] == "B0b":
                role = b0b_role
                if fold_evidence is not None:
                    prediction_spec = _b0b_fold_spec(spec, fold_evidence, origin)
            result = _raw_prediction(
                work,
                origin,
                horizon,
                str(row["model_id"]),
                prediction_spec,
                role,
            )
            raw = float(result["point"])
            annual = copy.deepcopy(result["annual"])
            raw_source = str(result["source"])
            newly_materialized += 1
            if raw_source.startswith("aggregate_diagnostic"):
                unresolved_fallbacks += 1
        row["_raw_model_prediction"] = raw
        row["_raw_annual_breakdown"] = annual
        row["_raw_prediction_source"] = raw_source if raw is not None else "not_required_unscoreable"
        if (
            raw is not None
            and str(row.get("confidence")) == "unavailable"
            and route != "unknown_revenue_model"
        ):
            row["confidence"] = "low"
            row.setdefault("limitation", []).append(
                "scoreability_correction_low_confidence"
            )
        raw_lock_rows.append(
            {
                "model": row["model_id"],
                "caseKey": [work_id, origin, horizon, route],
                "raw": None if raw is None else calibration.fixed_decimal(raw),
                "source": row["_raw_prediction_source"],
            }
        )
        output.append(row)
    return output, {
        "predictionFingerprint": digest(raw_lock_rows),
        "predictionLockedBeforeScoringTruthAccess": True,
        "actualReadByMaterializer": False,
        "newlyMaterializedCaseRowCount": newly_materialized,
        "unresolvedRouteDiagnosticFallbackCaseRowCount": unresolved_fallbacks,
    }


def annotate_rows(
    rows: Sequence[Mapping[str, Any]],
    works: Sequence[Mapping[str, Any]],
    contract: scoring.ScoringContract,
    *,
    role: str,
) -> list[dict[str, Any]]:
    work_lookup = {str(work["standard_work_id"]): work for work in works}
    result: list[dict[str, Any]] = []
    for source in rows:
        row = copy.deepcopy(dict(source))
        work_id, _origin, _horizon, _route = legacy.case_key(row)
        row["_residual_case_role"] = role
        row["label_available_as_of"] = str(
            row.get("label_available_as_of")
            or row.get("_available_as_of")
            or row["target_end"]
        )
        row["_scoring_label_boundary"] = str(
            contract.base_spec["origins"]["crossHorizonPurge"][
                "developmentTargetEndOnOrBefore"
            ]
        )
        annotated = scoring.annotate_case_states(row, work_lookup[work_id], contract)
        if set(annotated["public_output"]) != {
            "pointForecast",
            "annualBreakdown",
            "confidence",
            "limitation",
        }:
            raise CorrectionError("public output escaped the four-field contract")
        result.append(annotated)
    return result


def _interval_compatible(rows: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    compatible: list[dict[str, Any]] = []
    for source in rows:
        row = copy.deepcopy(dict(source))
        scoreable = row.get("statisticallyScoreable") is True
        row["eligibility"] = {
            "status": "forecastable_numeric" if scoreable else "not_statistically_scoreable"
        }
        row["_comparison_point_forecast"] = (
            row.get("rawModelPrediction") if scoreable else None
        )
        compatible.append(row)
    return compatible


def apply_corrected_internal_intervals(
    target_rows: Sequence[dict[str, Any]],
    calibration_rows: Sequence[Mapping[str, Any]],
    spec: Mapping[str, Any],
) -> None:
    calibration_compatible = _interval_compatible(calibration_rows)
    target_compatible = _interval_compatible(target_rows)
    legacy.apply_internal_intervals(target_compatible, calibration_compatible, spec)
    intervals = {
        (str(row["model_id"]), legacy.case_key(row)): copy.deepcopy(
            row.get("_internal_interval", {"available": False})
        )
        for row in target_compatible
    }
    for row in target_rows:
        row["_internal_interval"] = intervals[(str(row["model_id"]), legacy.case_key(row))]


def internal_interval_metrics(rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    required = [row for row in rows if row.get("statisticallyScoreable") is True]
    available = [
        row
        for row in required
        if bool((row.get("_internal_interval") or {}).get("available"))
    ]
    complete = len(required) == len(available)
    return {
        "requiredCaseCount": len(required),
        "availableCaseCount": len(available),
        "missingCaseCount": len(required) - len(available),
        "completeOnAllScoreablePopulation": complete,
        "internal80Coverage": rounded(
            sum(bool(row["_internal_interval"]["covered"]) for row in available)
            / len(available)
            if complete and available
            else None
        ),
        "meanWis": rounded(
            sum(float(row["_internal_interval"]["wis"]) for row in available)
            / len(available)
            if complete and available
            else None
        ),
        "endpointsPresentInPublicReport": False,
    }


def _unique_work_count(rows: Sequence[Mapping[str, Any]]) -> int:
    return len({legacy.case_key(row)[0] for row in rows})


def _suppressed_cell(case_count: int, work_count: int, minimum: int) -> dict[str, Any]:
    return {
        "suppressed": True,
        "caseCount": f"<{minimum}" if case_count < minimum else case_count,
        "uniqueWorkCount": f"<{minimum}" if work_count < minimum else work_count,
    }


def score_model_group(
    rows: Sequence[Mapping[str, Any]], minimum: int, *, allow_suppression: bool
) -> dict[str, Any]:
    if allow_suppression and (len(rows) < minimum or _unique_work_count(rows) < minimum):
        return _suppressed_cell(len(rows), _unique_work_count(rows), minimum)
    result = scoring.score_populations(rows)
    result["internal80PredictionInterval"] = internal_interval_metrics(rows)
    return {"suppressed": False, **result}


def aggregate_models(
    rows: Sequence[Mapping[str, Any]], spec: Mapping[str, Any]
) -> dict[str, Any]:
    minimum = int(spec["reporting"]["committableAggregateReport"]["minimumCellCount"])
    by_model = {
        model: [row for row in rows if row["model_id"] == model]
        for model in BASELINE_IDS
    }
    overall = {
        model: score_model_group(model_rows, minimum, allow_suppression=False)
        for model, model_rows in by_model.items()
    }
    axes = {
        "horizon": lambda row: str(row.get("strata", {}).get("horizon")),
        "sourcePostHoc": lambda row: str(row.get("strata", {}).get("source")),
        "revenueModel": lambda row: str(row.get("strata", {}).get("revenue_model")),
        "highValue": lambda row: str(bool(row.get("strata", {}).get("high_value"))).lower(),
        "shelfRightsPostHoc": lambda row: str(row.get("strata", {}).get("shelf_rights")),
        "rightsTermTypePostHoc": lambda row: str(row.get("strata", {}).get("rights_term_type")),
        "longTail": lambda row: str(bool(row.get("strata", {}).get("long_tail"))).lower(),
        "dormant": lambda row: str(bool(row.get("strata", {}).get("dormant"))).lower(),
        "sparseIncome": lambda row: str(bool(row.get("strata", {}).get("sparse_income"))).lower(),
        "spikeCandidate": lambda row: str(bool(row.get("strata", {}).get("spike_candidate"))).lower(),
    }
    slices: dict[str, list[dict[str, Any]]] = {}
    for axis, getter in axes.items():
        values = sorted({getter(row) for row in rows})
        cells: list[dict[str, Any]] = []
        for model in BASELINE_IDS:
            model_rows = by_model[model]
            for value in values:
                group = [row for row in model_rows if getter(row) == value]
                cells.append(
                    {
                        "modelId": model,
                        "value": value,
                        **score_model_group(group, minimum, allow_suppression=True),
                    }
                )
        slices[axis] = cells
    return {"overall": overall, "slices": slices}


def _state_fingerprint(rows: Sequence[Mapping[str, Any]]) -> str:
    values = []
    for row in sorted(rows, key=lambda item: (str(item["model_id"]), legacy.case_key(item))):
        values.append(
            {
                "model": row["model_id"],
                "key": list(legacy.case_key(row)),
                "scoreable": row["statisticallyScoreable"],
                "available": row["modelPredictionAvailable"],
                "serving": row["businessServingEligible"],
                "abstained": row["abstained"],
                "reason": row["abstentionReason"],
                "raw": None
                if row["rawModelPrediction"] is None
                else calibration.fixed_decimal(row["rawModelPrediction"]),
                "served": None
                if row["servedPrediction"] is None
                else calibration.fixed_decimal(row["servedPrediction"]),
            }
        )
    return digest(values)


def parity_evidence(rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    by_model = {
        model: [row for row in rows if row["model_id"] == model]
        for model in BASELINE_IDS
    }
    key_sets = {model: {legacy.case_key(row) for row in values} for model, values in by_model.items()}
    scoreable_sets = {
        model: {
            legacy.case_key(row)
            for row in values
            if row.get("statisticallyScoreable") is True
        }
        for model, values in by_model.items()
    }
    serving_sets = {
        model: {
            legacy.case_key(row)
            for row in values
            if row.get("businessServingEligible") is True
        }
        for model, values in by_model.items()
    }
    first = BASELINE_IDS[0]
    raw_complete = all(
        row.get("rawModelPrediction") is not None
        for row in rows
        if row.get("statisticallyScoreable") is True
    )
    served_consistent = all(
        (
            row.get("servedPrediction") == row.get("rawModelPrediction")
            if row.get("businessServingEligible") and row.get("modelPredictionAvailable")
            else row.get("servedPrediction") is None
        )
        for row in rows
    )
    return {
        "caseKeysIdentical": all(values == key_sets[first] for values in key_sets.values()),
        "scoreableKeysIdentical": all(
            values == scoreable_sets[first] for values in scoreable_sets.values()
        ),
        "businessServingKeysIdentical": all(
            values == serving_sets[first] for values in serving_sets.values()
        ),
        "intersectionDropUsed": False,
        "rawPredictionCompleteOnAllScoreable": raw_complete,
        "rawEqualsServedWhenServedAndOtherwiseNull": served_consistent,
        "blockedOrAbstainedZeroImputedIntoModelWape": False,
        "caseCountPerModel": len(key_sets[first]),
        "scoreableCaseCountPerModel": len(scoreable_sets[first]),
        "businessServingCaseCountPerModel": len(serving_sets[first]),
        "stateAndPredictionFingerprint": _state_fingerprint(rows),
    }


def _bootstrap_rows(rows: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for source in rows:
        if source.get("statisticallyScoreable") is not True:
            continue
        row = copy.deepcopy(dict(source))
        row["eligibility"] = {"status": "forecastable_numeric"}
        row["_comparison_point_forecast"] = row["rawModelPrediction"]
        result.append(row)
    return result


def state_reconciliation(rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    b0b = [row for row in rows if row["model_id"] == "B0b"]
    legacy_numeric = [
        row for row in b0b if legacy.eligibility_status(row) == "forecastable_numeric"
    ]
    scoreable = [row for row in b0b if row["statisticallyScoreable"]]
    serving = [row for row in scoreable if row["businessServingEligible"]]
    abstained = [row for row in scoreable if row["abstained"]]
    return {
        "caseUniverseCount": len(b0b),
        "legacyForecastableCaseCountAuditOnly": len(legacy_numeric),
        "statisticallyScoreableCaseCount": len(scoreable),
        "modelPredictionAvailableScoreableCaseCount": sum(
            bool(row["modelPredictionAvailable"]) for row in scoreable
        ),
        "businessServingEligibleScoreableCaseCount": len(serving),
        "abstainedScoreableCaseCount": len(abstained),
        "statisticallyUnscoreableCaseCount": len(b0b) - len(scoreable),
        "statesAreIndependent": True,
        "legacyForecastabilityControlsNewStates": False,
    }


def gate_evidence(
    aggregate: Mapping[str, Any], locked_comparator: str, parity: Mapping[str, Any]
) -> dict[str, Any]:
    score = aggregate["overall"][locked_comparator]
    all_scoreable = score["allScoreableModelMetrics"]
    served = score["servedCohortMetrics"]
    abstention = score["abstentionMetrics"]
    high = served["highValuePerformance"]
    horizon_biases = {}
    for cell in aggregate["slices"]["horizon"]:
        if cell["modelId"] != locked_comparator or cell.get("suppressed"):
            continue
        horizon_biases[str(cell["value"])] = cell["allScoreableModelMetrics"][
            "signedAggregateBias"
        ]
    top10 = abstention["top10ServedRevenueShare"]
    return {
        "top10ServedRevenueCoveragePreC1": {
            "value": top10,
            "minimum": 0.9,
            "pass": top10 is not None and float(top10) >= 0.9,
            "thresholdLowered": False,
            "labelsMovedToPass": False,
        },
        "signedAggregateBiasDiagnostics": {
            "allScoreableOverall": {
                "value": all_scoreable["signedAggregateBias"],
                "absoluteMaximum": 0.1,
                "pass": abs(float(all_scoreable["signedAggregateBias"])) <= 0.1,
            },
            "servedOverall": {
                "value": served["signedAggregateBias"],
                "absoluteMaximum": 0.1,
                "pass": abs(float(served["signedAggregateBias"])) <= 0.1,
            },
            "servedHighValue": {
                "value": high["signedAggregateBias"],
                "absoluteMaximum": 0.1,
                "pass": high["signedAggregateBias"] is not None
                and abs(float(high["signedAggregateBias"])) <= 0.1,
            },
            "eachCoreHorizonAllScoreable": {
                "values": horizon_biases,
                "absoluteMaximum": 0.15,
                "pass": bool(horizon_biases)
                and all(
                    value is not None and abs(float(value)) <= 0.15
                    for value in horizon_biases.values()
                ),
            },
        },
        "caseStateAndKeyParityPass": all(
            bool(parity[name])
            for name in (
                "caseKeysIdentical",
                "scoreableKeysIdentical",
                "businessServingKeysIdentical",
                "rawPredictionCompleteOnAllScoreable",
                "rawEqualsServedWhenServedAndOtherwiseNull",
            )
        ),
    }


def load_verified_model_inputs() -> Mapping[str, Any]:
    try:
        import run_m2_formal_execution_payload as formal  # pylint: disable=import-outside-toplevel
    except ImportError as exc:
        raise CorrectionError("authorized local cache dependency is unavailable") from exc
    if not formal.MODEL_CACHE_PATH.is_file():
        raise CorrectionError(
            "verified local model-input cache is missing; provide the authorized private input roles"
        )
    with formal.MODEL_CACHE_PATH.open("rb") as handle:
        cached = pickle.load(handle)
    if not isinstance(cached, Mapping) or cached.get("signature") != formal.model_cache_signature():
        raise CorrectionError("verified local model-input cache signature mismatch")
    model_inputs = cached.get("modelInputs")
    if not isinstance(model_inputs, Mapping):
        raise CorrectionError("verified local model-input cache payload is invalid")
    return model_inputs


def assert_public_privacy(value: Any) -> None:
    forbidden_keys = {
        "standard_work_id",
        "standardworkid",
        "work_title",
        "author",
        "channel_key",
        "channelidentifier",
        "lower",
        "upper",
        "predictionintervallower",
        "predictionintervalupper",
    }

    def visit(current: Any) -> None:
        if isinstance(current, Mapping):
            for key, child in current.items():
                normalized = str(key).replace("-", "").replace("_", "").casefold()
                if normalized in {item.replace("_", "") for item in forbidden_keys}:
                    raise CorrectionError(f"public report contains forbidden key: {key}")
                visit(child)
        elif isinstance(current, (list, tuple)):
            for child in current:
                visit(child)
        elif isinstance(current, str):
            text = current.replace("\\", "/").casefold()
            if "data/private-output/" in text:
                raise CorrectionError("public report contains a private path")
            root = str(ROOT).replace("\\", "/").casefold()
            if root in text:
                raise CorrectionError("public report contains a machine-local path")

    visit(value)


def write_json(path: Path, value: Mapping[str, Any]) -> None:
    assert_public_privacy(value)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True, allow_nan=False).encode(
            "utf-8"
        )
        + b"\n"
    )


def _fmt(value: Any) -> str:
    if value is None:
        return "未定义"
    if isinstance(value, bool):
        return "是" if value else "否"
    if isinstance(value, float):
        return f"{value:.4f}"
    return str(value)


def baseline_markdown(report: Mapping[str, Any]) -> str:
    lines = [
        "# M2 校准基线重放 v1.1（计分口径修正后）",
        "",
        f"- 决策状态：`{report['decisionStatus']}`",
        f"- 锁定 comparator：`{report['baselineSelection']['lockedComparator']}`",
        "- 范围：仅 development forward；未训练 C1，未打开 final holdout、embargo 或 60 月标签。",
        "- 产品输出仍仅允许单点值、年度拆分、confidence 和 limitation；80% PI 端点不在本报告中。",
        "",
        "## B0b–B3 指标",
        "",
        "| 模型 | all-scoreable WAPE | all-scoreable bias | served WAPE | served bias | 高价值 served WAPE | 高价值 bias | 80% coverage | WIS |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for model in BASELINE_IDS:
        item = report["developmentBaseline"]["overall"][model]
        all_scoreable = item["allScoreableModelMetrics"]
        served = item["servedCohortMetrics"]
        high = served["highValuePerformance"]
        interval = item["internal80PredictionInterval"]
        lines.append(
            "| {model} | {aw} | {ab} | {sw} | {sb} | {hw} | {hb} | {cov} | {wis} |".format(
                model=model,
                aw=_fmt(all_scoreable["wape"]),
                ab=_fmt(all_scoreable["signedAggregateBias"]),
                sw=_fmt(served["wape"]),
                sb=_fmt(served["signedAggregateBias"]),
                hw=_fmt(high["wape"]),
                hb=_fmt(high["signedAggregateBias"]),
                cov=_fmt(interval["internal80Coverage"]),
                wis=_fmt(interval["meanWis"]),
            )
        )
    abstention = report["developmentBaseline"]["overall"]["B0b"]["abstentionMetrics"]
    lines.extend(
        [
            "",
            "## Serving 与 abstention",
            "",
            f"- served work share：`{_fmt(abstention['servedWorkShare'])}`",
            f"- served actual revenue share：`{_fmt(abstention['servedActualRevenueShare'])}`",
            f"- top1 / top5 / top10 served revenue coverage：`{_fmt(abstention['top1ServedRevenueShare'])}` / `{_fmt(abstention['top5ServedRevenueShare'])}` / `{_fmt(abstention['top10ServedRevenueShare'])}`",
            f"- abstained work count：`{abstention['abstainedWorkCount']}`；abstained actual revenue share：`{_fmt(abstention['abstainedActualRevenueShare'])}`。",
            "- abstained 的 servedPrediction 为 null；其 rawModelPrediction 仍进入 all-scoreable 模型指标，未按 0 混入 WAPE。",
            "",
            "## 完整性与边界",
            "",
            f"- B0b–B3 case/state key 完全一致：`{report['integrity']['caseKeyAndStateParity']}`。",
            f"- future-perturbation invariance：`{report['integrity']['futurePerturbationInvariant']}`。",
            f"- final holdout opened：`{report['seals']['finalHoldoutOpened']}`。",
            "- source、shelf/rights 与期限类型均为 post-hoc 切片，不是历史特征或 eligibility 输入。",
            "- 当前结果保持 `not_for_formal_decision`；C1 未开始。",
            "",
        ]
    )
    return "\n".join(lines)


def correction_markdown(report: Mapping[str, Any]) -> str:
    metrics = report["correctedMetricsByBaseline"]
    state = report["stateReconciliation"]
    top = report["preC1Gate"]["top10ServedRevenueCoveragePreC1"]
    lines = [
        "# M2 calibration-spec-v1.1 计分与 eligibility 修正",
        "",
        f"- 决策状态：`{report['decisionStatus']}`；C1 started：`false`。",
        f"- case universe / statistically scoreable / served / abstained：`{state['caseUniverseCount']}` / `{state['statisticallyScoreableCaseCount']}` / `{state['businessServingEligibleScoreableCaseCount']}` / `{state['abstainedScoreableCaseCount']}`。",
        "- `forecastabilityStatus` 仅保留历史审计用途，不再同时控制回测、模型能力和业务展示。",
        "- all-scoreable 使用 rawModelPrediction；served-cohort 使用 servedPrediction；abstention 单独报告。",
        "- blocked/abstained served null 从未按 0 混入模型 WAPE；如评估未服务损失，仅使用 `endToEndBusinessLoss` 名称。",
        "",
        "## 修正后总体指标",
        "",
        "| 模型 | scoreable cases | all-scoreable WAPE | all-scoreable bias | served WAPE | served bias | abstained works |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for model in BASELINE_IDS:
        item = metrics[model]
        lines.append(
            f"| {model} | {item['allScoreableModelMetrics']['caseCount']} | {_fmt(item['allScoreableModelMetrics']['wape'])} | {_fmt(item['allScoreableModelMetrics']['signedAggregateBias'])} | {_fmt(item['servedCohortMetrics']['wape'])} | {_fmt(item['servedCohortMetrics']['signedAggregateBias'])} | {item['abstentionMetrics']['abstainedWorkCount']} |"
        )
    lines.extend(
        [
            "",
            "## C1 前覆盖门禁",
            "",
            f"- top10 served revenue coverage：`{_fmt(top['value'])}`；冻结门槛：`0.9000`；通过：`{top['pass']}`。",
            "- 门槛未降低、标签未按目标比例移动；若失败，必须继续停在 C1 前。",
            "",
            "## seal",
            "",
            "- final holdout、embargo shadow、deferred 60-month labels 均未打开。",
            "- B0a 不参与 comparator selection；即使前置检查通过，也仍需用户明确授权后才可开始 C1。",
            "- 新结果仍为 `not_for_formal_decision`，不得 release 或进入 M3。",
            "",
        ]
    )
    return "\n".join(lines)


def attribution_markdown(report: Mapping[str, Any]) -> str:
    lines = [
        "# M2 B0a → B0b 重放差异归因",
        "",
        "- Stage 1 是旧历史聚合锚点，没有相同 case fingerprint；其到 Stage 2 的差异不可作因果归因。",
        "- Stage 2–7 使用完全一致的 statistically-scoreable case keys 与 actual fingerprint。",
        "- 本报告仅作审计，不参与 comparator 或候选选择。",
        "",
        "| 阶段 | case count | all-scoreable WAPE | signed bias | served revenue coverage | top10 coverage | 高价值 served WAPE | 高价值 bias |",
        "|---|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for stage in report["stages"]:
        all_metrics = stage.get("allScoreableModelMetrics", {}) or {}
        served = stage.get("servedCohortMetrics", {}) or {}
        abstention_metrics = stage.get("abstentionMetrics", {}) or {}
        high = stage.get("highValueServedPerformance", {}) or {}
        lines.append(
            "| {stage} {title} | {cases} | {wape} | {bias} | {coverage} | {top10} | {high_wape} | {high_bias} |".format(
                stage=stage["stage"],
                title=stage["title"],
                cases=stage.get("caseCount"),
                wape=_fmt(all_metrics.get("wape")),
                bias=_fmt(all_metrics.get("signedAggregateBias")),
                coverage=_fmt(abstention_metrics.get("servedActualRevenueShare")),
                top10=_fmt(abstention_metrics.get("top10ServedRevenueShare")),
                high_wape=_fmt(high.get("wape")),
                high_bias=_fmt(high.get("signedAggregateBias")),
            )
        )
    lines.extend(
        [
            "",
            "## 解释边界",
            "",
            "- quantile/prior、历史不可得 rating/risk、eligibility、abstention scoring 与最终 B0b 公式分别逐层切换。",
            "- 不把约 64% 到约 132% 的全部变化归因于去泄漏；Stage 1→2 首先包含不可重建的人口与历史实现差异。",
            "- 没有作品、渠道、private 路径、原始行或 PI endpoints。",
            "",
        ]
    )
    return "\n".join(lines)


def write_private_evidence(
    rows: Sequence[Mapping[str, Any]], manifest: Mapping[str, Any]
) -> dict[str, Any]:
    PRIVATE_DIR.mkdir(parents=True, exist_ok=True)
    with PRIVATE_CASES.open("w", encoding="utf-8", newline="\n") as handle:
        for row in rows:
            payload = {
                "modelId": row["model_id"],
                "caseKey": row["case_key"],
                "actual": row.get("actual"),
                "statisticallyScoreable": row["statisticallyScoreable"],
                "scoreabilityReason": row["scoreabilityReason"],
                "modelPredictionAvailable": row["modelPredictionAvailable"],
                "businessServingEligible": row["businessServingEligible"],
                "rawModelPrediction": row["rawModelPrediction"],
                "servedPrediction": row["servedPrediction"],
                "abstained": row["abstained"],
                "abstentionReason": row["abstentionReason"],
                "strata": row.get("strata"),
            }
            handle.write(json.dumps(payload, ensure_ascii=False, sort_keys=True) + "\n")
    encoded = (
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True).encode("utf-8")
        + b"\n"
    )
    PRIVATE_MANIFEST.write_bytes(encoded)
    return {
        "privateCaseRowCount": len(rows),
        "caseEvidenceSha256": hashlib.sha256(PRIVATE_CASES.read_bytes()).hexdigest(),
        "manifestSha256": hashlib.sha256(encoded).hexdigest(),
        "tracked": False,
    }


def synthetic_corrected_future_invariance(
    contract: scoring.ScoringContract,
) -> dict[str, Any]:
    work = {
        "standard_work_id": "SYNTHETIC-CORRECTION",
        "channels": [
            {
                "channel_key": "SYNTHETIC",
                "business_form": "synthetic",
                "first_observed_month": "2019-01",
                "monthly": {
                    **{f"2019-{month:02d}": float(month) for month in range(1, 13)},
                    **{f"2020-{month:02d}": float(month + 1) for month in range(1, 13)},
                },
                "batch_cluster_sizes": {},
            }
        ],
    }
    perturbed = copy.deepcopy(work)
    perturbed["channels"][0]["monthly"]["2025-01"] = 999999999.0
    checks = {}
    for model in BASELINE_IDS:
        role = "prefit_development_template" if model == "B0b" else None
        before = _raw_prediction(work, "2020-12", 12, model, contract.base_spec, role)
        after = _raw_prediction(perturbed, "2020-12", 12, model, contract.base_spec, role)
        checks[model] = before == after
    return {
        "byBaseline": checks,
        "allInvariant": all(checks.values()),
        "futureFactBoundary": "bill_month_greater_than_origin",
    }


def preflight(contract: scoring.ScoringContract) -> dict[str, Any]:
    base_fixture = calibration.contract_self_test()
    scoring_fixture = scoring.synthetic_self_test(contract)
    future = synthetic_corrected_future_invariance(contract)
    refit = legacy.synthetic_forward_refit_invariance(contract.base_spec)
    checks = {
        "baseKernel": all(base_fixture["checks"].values()),
        "scoringKernel": all(scoring_fixture["checks"].values()),
        "correctedFuturePerturbation": future["allInvariant"],
        "B0bForwardRefit": bool(refit["factorsInvariant"] and refit["oofPointsInvariant"]),
        "finalHoldoutSealed": contract.amendment["seals"]["finalHoldout"]["opened"] is False,
        "candidateTrainingSealed": contract.amendment["seals"]["candidateTraining"]["C1Started"] is False,
    }
    if not all(checks.values()):
        raise CorrectionError(f"synthetic preflight failed: {checks}")
    return {
        "status": "passed",
        "mode": "synthetic-preflight",
        "decisionStatus": "not_for_formal_decision",
        "checks": checks,
        "futurePerturbationEvidence": future,
        "finalHoldoutOpened": False,
        "candidateTrainingStarted": False,
    }


def run_development(contract: scoring.ScoringContract) -> dict[str, Any]:
    legacy.require_clean_worktree()
    code_commit = legacy.latest_exact_commit(
        [
            Path(__file__).resolve(),
            Path(scoring.__file__).resolve(),
            Path(attribution.__file__).resolve(),
        ]
    )
    synthetic = preflight(contract)
    spec = contract.base_spec
    artifact_with_bound, artifact_path = legacy.load_and_validate_fitted_artifact(spec)
    replay_spec = artifact_with_bound.pop("_boundSpec")
    works, posthoc, input_evidence = legacy.load_authorized_works(spec)
    model_inputs = load_verified_model_inputs()

    progress("materializing frozen warmup and development predictions")
    warmup_predictions = legacy.generate_predictions(
        works,
        legacy.interval_warmup_origins(spec),
        spec,
        b0b_parameter_role="interval_warmup_cold_start",
    )
    warmup_locks = legacy.lock_interval_warmup_predictions(warmup_predictions, spec)
    development_predictions = legacy.generate_predictions(
        works,
        legacy.development_origins(spec),
        spec,
        b0b_parameter_role="prefit_development_template",
    )
    development_parity = calibration.assert_case_key_parity(development_predictions)

    warmup_rows_legacy = legacy.join_truth(warmup_predictions, works, spec)
    warmup_evidence = legacy.complete_interval_warmup_evidence(
        warmup_rows_legacy, warmup_locks, spec
    )
    warmup_availability = legacy.interval_warmup_availability_evidence(
        warmup_evidence, spec
    )
    development_rows_legacy = legacy.join_truth(development_predictions, works, spec)
    recomputed_fit = legacy.b0b_fit_evidence(development_rows_legacy, spec)
    recomputed_fit["intervalWarmup"] = warmup_evidence["B0b"]
    legacy.validate_recomputed_b0b_fit(
        artifact_with_bound, recomputed_fit, input_evidence
    )
    legacy.validate_artifact_case_fingerprint(
        artifact_with_bound, legacy.numeric_b0b_fit_rows(development_rows_legacy)
    )
    legacy.materialize_b0b_forward_predictions(
        development_rows_legacy, works, spec, recomputed_fit
    )
    legacy.attach_b0b_oof_comparison_points(development_rows_legacy, recomputed_fit)
    legacy.attach_strata(development_rows_legacy, works, posthoc)
    forward_rows_legacy, legacy_forward_parity = legacy.exact_forward_score_rows(
        development_rows_legacy, spec, recomputed_fit
    )
    legacy.attach_strata(warmup_rows_legacy, works, posthoc)

    progress("materializing raw predictions independently from serving eligibility")
    raw_forward, raw_forward_lock = materialize_raw_predictions(
        forward_rows_legacy,
        works,
        spec,
        b0b_role="development_forward_fold",
        fold_evidence=recomputed_fit,
    )
    raw_warmup, raw_warmup_lock = materialize_raw_predictions(
        warmup_rows_legacy,
        works,
        spec,
        b0b_role="interval_warmup_cold_start",
    )
    forward_rows = annotate_rows(
        raw_forward,
        works,
        contract,
        role="development_forward_score",
    )
    warmup_rows = annotate_rows(
        raw_warmup,
        works,
        contract,
        role="development_warmup_interval_calibration",
    )
    apply_corrected_internal_intervals(
        forward_rows, [*warmup_rows, *forward_rows], spec
    )

    progress("scoring corrected all-scoreable, served, and abstention populations")
    development_aggregate = aggregate_models(forward_rows, spec)
    parity = parity_evidence(forward_rows)
    provisional_best = min(
        BASELINE_IDS,
        key=lambda model: development_aggregate["overall"][model][
            "allScoreableModelMetrics"
        ]["wape"],
    )
    bootstrap = legacy.paired_two_way_bootstrap(
        _bootstrap_rows(forward_rows), provisional_best, spec
    )
    selection = scoring.select_equivalent_comparator(
        {
            model: development_aggregate["overall"][model][
                "allScoreableModelMetrics"
            ]
            for model in BASELINE_IDS
        },
        bootstrap["comparisons"],
        contract.amendment["baselineComparatorTieBreak"][
            "complexityOrderSimplestFirst"
        ],
    )
    locked_comparator = selection["lockedComparator"]
    gates = gate_evidence(development_aggregate, locked_comparator, parity)

    progress("building fixed-key B0a-to-B0b attribution bridge")
    attribution_report = attribution.build_attribution_report(
        works, forward_rows, model_inputs, spec, contract.amendment
    )

    long_included, long_deferred = legacy.long_audit_origins(
        spec, development_safe_only=True
    )
    long_predictions = legacy.generate_predictions(
        works,
        long_included,
        replay_spec,
        b0b_parameter_role="committed_development_fit",
    )
    long_rows_legacy = (
        legacy.join_truth(long_predictions, works, replay_spec)
        if any(long_included.values())
        else []
    )
    legacy.attach_strata(long_rows_legacy, works, posthoc)
    raw_long, raw_long_lock = materialize_raw_predictions(
        long_rows_legacy,
        works,
        replay_spec,
        b0b_role="committed_development_fit",
    )
    long_rows = annotate_rows(
        raw_long,
        works,
        contract,
        role="development_long_horizon_audit",
    )
    apply_corrected_internal_intervals(
        long_rows, [*warmup_rows, *forward_rows], spec
    )
    long_eligible = [
        row for row in long_rows if legacy.long_horizon_cohort_eligible(row, spec)
    ]

    state = state_reconciliation(forward_rows)
    now = datetime.now(timezone.utc).isoformat()
    final_holdout_opened = False
    baseline_report = {
        "schema": "m2.calibration-baseline-replay.aggregate.v1_1",
        "version": "M2-calibration-baseline-development-v1.1",
        "generatedAt": now,
        "decisionStatus": "not_for_formal_decision",
        "scope": "development_forward_only",
        "contractBinding": {
            "baseSpecDigest": contract.base_digest,
            "amendmentDigest": contract.amendment_digest,
            "combinedDigest": contract.combined_digest,
            "amendmentFreezeCommit": scoring.FROZEN_AMENDMENT_COMMIT,
            "correctionCodeCommit": code_commit,
        },
        "authority": {
            "standardWorkCount": input_evidence["standardWorkCount"],
            "incomeFactCount": input_evidence["incomeFactCount"],
            "completeIncomeFactCount": input_evidence["completeIncomeFactCount"],
            "scopeReconciled": input_evidence["cubeAmountReconciles"],
            "databaseRead": input_evidence["databaseRead"],
        },
        "stateReconciliation": state,
        "developmentBaseline": development_aggregate,
        "baselineSelection": selection,
        "pairedTwoWayBlockBootstrap": bootstrap,
        "preC1Gates": gates,
        "rawPredictionLocks": {
            "forward": raw_forward_lock,
            "warmup": raw_warmup_lock,
            "longAudit": raw_long_lock,
        },
        "B0aHistoricalAuditOnly": attribution_report["stages"][0],
        "B0aToB0bAttributionSummary": {
            "stageCount": len(attribution_report["stages"]),
            "fixedStage2To7Population": attribution_report["integrity"],
            "selectionUseAllowed": False,
        },
        "longHorizonAudit": {
            "maySelectModelOrThreshold": False,
            "included36MonthOriginCount": len(long_included.get(36, [])),
            "deferred36MonthOriginCount": len(long_deferred.get(36, [])),
            "deferred60MonthOriginCount": len(long_deferred.get(60, [])),
            "deferred60MonthLabelsOpened": False,
            "allPredictionsOver24MonthsMarkedExtrapolated": all(
                "extrapolated" in row.get("limitation", []) for row in long_rows
            )
            if long_rows
            else True,
            "aggregate": aggregate_models(long_eligible, spec) if long_eligible else None,
        },
        "integrity": {
            "caseKeyAndStateParity": all(
                bool(parity[key])
                for key in (
                    "caseKeysIdentical",
                    "scoreableKeysIdentical",
                    "businessServingKeysIdentical",
                    "rawPredictionCompleteOnAllScoreable",
                    "rawEqualsServedWhenServedAndOtherwiseNull",
                )
            ),
            "parityEvidence": parity,
            "legacyDevelopmentParity": development_parity,
            "legacyForwardParity": legacy_forward_parity,
            "futurePerturbationInvariant": synthetic["checks"][
                "correctedFuturePerturbation"
            ],
            "futurePerturbationEvidence": synthetic["futurePerturbationEvidence"],
            "caseIidBootstrapUsed": False,
            "bootstrapClusters": ["standard_work_id", "origin"],
            "currentStatusPostHocOnly": True,
            "blockedOrAbstainedZeroImputedIntoModelWape": False,
        },
        "seals": {
            "candidateTrainingStarted": False,
            "C1Started": False,
            "finalHoldoutOpened": final_holdout_opened,
            "finalHoldoutTruthRead": False,
            "embargoShadowOpened": False,
            "embargoShadowTruthRead": False,
            "deferred60MonthLabelsOpened": False,
        },
        "reportingBoundary": {
            "language": "zh-CN",
            "aggregateOnly": True,
            "deidentified": True,
            "workOrChannelIdentifiersPresent": False,
            "internalPredictionIntervalEndpointsPresent": False,
            "productFields": [
                "pointForecast",
                "annualBreakdown",
                "confidence",
                "limitation",
            ],
            "automaticOperatingSuggestions": 0,
        },
        "releaseBoundary": {
            "formalDecisionAllowed": False,
            "releaseAllowed": False,
            "preparedExportPublishAllowed": False,
            "requiresChineseBusinessSampling": True,
            "requiresExplicitUserApproval": True,
            "m3Allowed": False,
        },
    }
    correction_report = {
        "schema": "m2.calibration-baseline-scoring-correction.v1",
        "version": "M2-calibration-baseline-scoring-correction-v1",
        "generatedAt": now,
        "decisionStatus": "not_for_formal_decision",
        "contractBinding": baseline_report["contractBinding"],
        "stateReconciliation": state,
        "rawAndServedReconciliation": parity,
        "correctedMetricsByBaseline": development_aggregate["overall"],
        "preC1Gate": gates,
        "B0aToB0bAttribution": {
            "stageCount": len(attribution_report["stages"]),
            "fixedStage2To7CaseKeys": attribution_report["integrity"],
        },
        "B0bToB3Replay": {
            "caseKeysIdentical": parity["caseKeysIdentical"],
            "scoreableKeysIdentical": parity["scoreableKeysIdentical"],
            "businessServingKeysIdentical": parity["businessServingKeysIdentical"],
            "baselineSelection": selection,
        },
        "futurePerturbation": baseline_report["integrity"][
            "futurePerturbationEvidence"
        ],
        "seals": baseline_report["seals"],
        "reportingBoundary": baseline_report["reportingBoundary"],
        "releaseBoundary": baseline_report["releaseBoundary"],
        "stopStatus": {
            "stoppedBeforeC1": True,
            "candidateTrainingAuthorized": False,
            "top10HardBlockerPresent": not gates[
                "top10ServedRevenueCoveragePreC1"
            ]["pass"],
            "nextStepRequiresExplicitUserAuthorization": True,
        },
    }

    progress("writing Chinese de-identified aggregate reports")
    write_json(BASELINE_JSON, baseline_report)
    BASELINE_MD.write_text(baseline_markdown(baseline_report), encoding="utf-8", newline="\n")
    write_json(CORRECTION_JSON, correction_report)
    CORRECTION_MD.write_text(correction_markdown(correction_report), encoding="utf-8", newline="\n")
    write_json(ATTRIBUTION_JSON, attribution_report)
    ATTRIBUTION_MD.write_text(attribution_markdown(attribution_report), encoding="utf-8", newline="\n")
    private = write_private_evidence(
        [*warmup_rows, *forward_rows, *long_rows],
        {
            "schema": "m2.calibration-baseline-replay.private-manifest.v1_1",
            "decisionStatus": "not_for_formal_decision",
            "baseSpecDigest": contract.base_digest,
            "amendmentDigest": contract.amendment_digest,
            "inputFingerprint": input_evidence["inputFingerprint"],
            "caseKeyAndStateParity": baseline_report["integrity"][
                "caseKeyAndStateParity"
            ],
            "finalHoldoutOpened": False,
            "candidateTrainingStarted": False,
        },
    )
    return {
        "status": "passed",
        "mode": "development-scoring-correction",
        "decisionStatus": "not_for_formal_decision",
        "lockedComparator": locked_comparator,
        "top10ServedRevenueCoverage": gates[
            "top10ServedRevenueCoveragePreC1"
        ]["value"],
        "top10PreC1GatePass": gates["top10ServedRevenueCoveragePreC1"]["pass"],
        "publicReports": [
            BASELINE_JSON.relative_to(ROOT).as_posix(),
            CORRECTION_JSON.relative_to(ROOT).as_posix(),
            ATTRIBUTION_JSON.relative_to(ROOT).as_posix(),
        ],
        "privateCaseRowCount": private["privateCaseRowCount"],
        "integrity": baseline_report["integrity"],
        "finalHoldoutOpened": False,
        "candidateTrainingStarted": False,
    }


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--preflight", action="store_true")
    modes.add_argument("--run-development", action="store_true")
    modes.add_argument("--run-final-holdout", action="store_true")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        contract = scoring.load_contract()
        if args.run_final_holdout:
            raise CorrectionError(
                "final-holdout is sealed and this scoring-correction runner must fail-closed"
            )
        result = run_development(contract) if args.run_development else preflight(contract)
        print(json.dumps(result, ensure_ascii=False, sort_keys=True))
        return 0
    except (
        CorrectionError,
        scoring.ScoringContractError,
        attribution.AttributionError,
        legacy.ReplayError,
        AssertionError,
        KeyError,
        ValueError,
    ) as exc:
        print(
            json.dumps({"status": "failed", "reason": str(exc)}, ensure_ascii=False),
            file=sys.stderr,
        )
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
