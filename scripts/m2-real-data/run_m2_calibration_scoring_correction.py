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
import os
import pickle
import re
import sys
import tempfile
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

PUBLIC_REPORT_PATHS = (
    BASELINE_JSON,
    BASELINE_MD,
    CORRECTION_JSON,
    CORRECTION_MD,
    ATTRIBUTION_JSON,
    ATTRIBUTION_MD,
)
CORRECTION_CODE_PATHS = (
    Path(__file__).resolve(),
    Path(scoring.__file__).resolve(),
    Path(attribution.__file__).resolve(),
    Path(legacy.__file__).resolve(),
    Path(calibration.__file__).resolve(),
)
SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
GIT_COMMIT_PATTERN = re.compile(r"^[0-9a-f]{40}$")


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
    """Apply the frozen unresolved-route structural-zero policy; never serve it."""

    _months, history = _aggregate_history(work, origin, spec)
    if any(not math.isfinite(float(value)) or abs(float(value)) > 1e-12 for value in history):
        raise CorrectionError(
            "unresolved revenue-model route has non-zero or non-finite cutoff history"
        )
    forecast = {
        calibration.add_months(origin, offset): 0.0
        for offset in range(1, int(horizon) + 1)
    }
    return {
        "point": 0.0,
        "annual": calibration.annual_breakdown(forecast, 0.0),
        "source": "frozen_unresolved_route_structural_zero_not_served",
        "detail": {
            "policy": "all_cutoff_available_channel_history_amounts_are_zero",
            "modelId": model_id,
            "parameterRole": b0b_role if model_id == "B0b" else None,
        },
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

    forbidden = {
        "actual",
        "component_actuals",
        "_component_actual_by_channel",
    }
    if any(forbidden.intersection(row) for row in rows):
        raise CorrectionError("raw materialization received scoring-truth fields")
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
            if raw_source == "frozen_unresolved_route_structural_zero_not_served":
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
        "rawMaterializationFingerprint": digest(raw_lock_rows),
        "predictionLockCreated": False,
        "actualReadByMaterializer": False,
        "newlyMaterializedCaseRowCount": newly_materialized,
        "unresolvedRouteStructuralZeroCaseRowCount": unresolved_fallbacks,
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
        work_id, origin, horizon, _route = legacy.case_key(row)
        row["_residual_case_role"] = role
        row["target_end"] = str(
            row.get("target_end") or calibration.add_months(origin, horizon)
        )
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


def _group_by_model(
    rows: Sequence[Mapping[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {model: [] for model in BASELINE_IDS}
    for source in rows:
        model = str(source["model_id"])
        if model not in grouped:
            raise CorrectionError(f"unexpected model in prediction population: {model}")
        grouped[model].append(copy.deepcopy(dict(source)))
    return grouped


def _flatten_predictions(
    predictions: Mapping[str, Sequence[Mapping[str, Any]]],
) -> list[dict[str, Any]]:
    return [
        copy.deepcopy(dict(row))
        for model in BASELINE_IDS
        for row in predictions.get(model, [])
    ]


def _replace_prediction_population(
    predictions: dict[str, list[dict[str, Any]]],
    replacements: Sequence[Mapping[str, Any]],
) -> None:
    replacement_lookup = {
        (str(row["model_id"]), legacy.case_key(row)): copy.deepcopy(dict(row))
        for row in replacements
    }
    if len(replacement_lookup) != len(replacements):
        raise CorrectionError("replacement prediction population contains duplicate keys")
    replaced: set[tuple[str, tuple[str, str, int, str]]] = set()
    for model in BASELINE_IDS:
        for index, row in enumerate(predictions.get(model, [])):
            key = (model, legacy.case_key(row))
            replacement = replacement_lookup.get(key)
            if replacement is not None:
                predictions[model][index] = replacement
                replaced.add(key)
    if replaced != set(replacement_lookup):
        raise CorrectionError("replacement prediction population differs from generated keys")


def _origin_horizon_blocks(
    origins_by_horizon: Mapping[Any, Sequence[Any]],
) -> set[tuple[str, int]]:
    return {
        (str(origin), int(horizon))
        for horizon, origins in origins_by_horizon.items()
        for origin in origins
    }


def _allowed_truth_join_blocks(
    role: str,
    score_origin: str | None,
    spec: Mapping[str, Any],
) -> set[tuple[str, int]]:
    """Return the exact development-safe blocks a truth-join role may access."""

    if role == "development_warmup_interval_calibration":
        if score_origin is not None:
            raise CorrectionError("warmup truth join must not bind a score origin")
        return _origin_horizon_blocks(legacy.interval_warmup_origins(spec))
    if role == "development_fold_training_seed":
        if score_origin is not None:
            raise CorrectionError("training-seed truth join must not bind a score origin")
        warmup = set(spec["origins"]["forwardValidation"]["warmupOrigins"])
        return {
            (str(origin), int(horizon))
            for horizon, split in spec["origins"]["coreByHorizon"].items()
            for origin in split["development"]
            if str(origin) in warmup
        }
    if role.startswith("development_forward_score:"):
        role_origin = role.split(":", 1)[1]
        if not score_origin or role_origin != str(score_origin):
            raise CorrectionError("forward truth-join role and scoreOrigin differ")
        fold = next(
            (
                item
                for item in spec["origins"]["forwardValidation"]["folds"]
                if str(item["scoreOrigin"]) == str(score_origin)
            ),
            None,
        )
        if fold is None:
            raise CorrectionError("forward truth join uses a non-development score origin")
        return {
            (str(score_origin), int(horizon))
            for horizon in fold["testHorizons"]
        }
    if role == "development_long_horizon_audit":
        if score_origin is not None:
            raise CorrectionError("long-audit truth join must not bind a score origin")
        included, _deferred = legacy.long_audit_origins(
            spec, development_safe_only=True
        )
        return _origin_horizon_blocks(included)
    raise CorrectionError(f"truth join role is not authorized by the development seal: {role}")


def _assert_development_truth_join_scope(
    prediction_rows: Sequence[Mapping[str, Any]],
    lock: Mapping[str, Any],
    spec: Mapping[str, Any],
) -> dict[str, Any]:
    """Fail before truth access for embargo, final, deferred-60, or unknown blocks."""

    role = str(lock.get("role", ""))
    score_origin = lock.get("scoreOrigin")
    allowed = _allowed_truth_join_blocks(role, score_origin, spec)
    observed = {
        (legacy.case_key(row)[1], legacy.case_key(row)[2])
        for row in prediction_rows
    }
    if not observed.issubset(allowed):
        raise CorrectionError("truth join attempted a sealed or non-development case block")
    purge = str(
        spec["origins"]["crossHorizonPurge"]["developmentTargetEndOnOrBefore"]
    )
    for row in prediction_rows:
        origin = legacy.case_key(row)[1]
        horizon = legacy.case_key(row)[2]
        target_end = str(row.get("target_end") or calibration.add_months(origin, horizon))
        label_available = str(
            row.get("label_available_as_of")
            or row.get("_available_as_of")
            or target_end
        )
        if target_end > purge or label_available > purge or horizon == 60:
            raise CorrectionError("truth join crossed the development purge or 60-month seal")
    return {
        "role": role,
        "scoreOrigin": score_origin,
        "authorizedBlockCount": len(observed),
        "developmentPurge": purge,
        "sealedBlockIntersectionCount": 0,
    }


def _join_truth_after_prediction_lock(
    prediction_rows: Sequence[Mapping[str, Any]],
    works: Sequence[Mapping[str, Any]],
    spec: Mapping[str, Any],
    contract: scoring.ScoringContract,
    lock: Mapping[str, Any],
    *,
    event_log: list[dict[str, Any]] | None = None,
    event_scope: str | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    scoring.verify_prediction_lock(prediction_rows, lock, contract)
    scope_evidence = _assert_development_truth_join_scope(
        prediction_rows, lock, spec
    )
    joined = legacy.join_truth(_group_by_model(prediction_rows), works, spec)
    if event_log is not None:
        event_log.append(
            {
                "event": "held_truth_join_complete",
                "scope": event_scope or str(lock["role"]),
                "scoreOrigin": lock.get("scoreOrigin"),
            }
        )
    scoring.verify_prediction_lock(joined, lock, contract)
    return joined, {
        "role": lock["role"],
        "scoreOrigin": lock.get("scoreOrigin"),
        "predictionFingerprint": lock["predictionFingerprint"],
        "predictionRowCount": lock["predictionRowCount"],
        "predictionLockCreatedBeforeTruthJoin": True,
        "postTruthPredictionProjectionMatchesLock": True,
        "truthJoinScope": scope_evidence,
    }


def _materialize_annotate_lock_join(
    prediction_rows: Sequence[Mapping[str, Any]],
    works: Sequence[Mapping[str, Any]],
    spec: Mapping[str, Any],
    contract: scoring.ScoringContract,
    *,
    role: str,
    b0b_role: str,
    fold_evidence: Mapping[str, Any] | None = None,
    score_origin: str | None = None,
    event_log: list[dict[str, Any]] | None = None,
    event_scope: str | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any], dict[str, Any]]:
    materialized, materialization = materialize_raw_predictions(
        prediction_rows,
        works,
        spec,
        b0b_role=b0b_role,
        fold_evidence=fold_evidence,
    )
    annotated = annotate_rows(materialized, works, contract, role=role)
    expected_models = {"B0b"} if role == "development_fold_training_seed" else set(BASELINE_IDS)
    observed_models = {str(row["model_id"]) for row in annotated}
    if observed_models != expected_models:
        raise CorrectionError(
            f"pre-truth model population differs from frozen role contract: {role}"
        )
    lock = scoring.lock_prediction_population(
        annotated,
        role=role,
        score_origin=score_origin,
        contract=contract,
    )
    if event_log is not None:
        event_log.append(
            {
                "event": "held_prediction_lock_created",
                "scope": event_scope or role,
                "scoreOrigin": score_origin,
                "predictionFingerprint": lock["predictionFingerprint"],
            }
        )
    joined, join_receipt = _join_truth_after_prediction_lock(
        annotated,
        works,
        spec,
        contract,
        lock,
        event_log=event_log,
        event_scope=event_scope,
    )
    return joined, {
        **materialization,
        **lock,
        **join_receipt,
    }, lock


def _target_end(row: Mapping[str, Any]) -> str:
    _work_id, origin, horizon, _route = legacy.case_key(row)
    return str(row.get("target_end") or calibration.add_months(origin, horizon))


def _fold_training_row_available(
    row: Mapping[str, Any], score_origin: str
) -> bool:
    """Canonical cutoff-availability predicate used before every B0b fold fit."""

    target_end = _target_end(row)
    return bool(
        legacy.fold_label_available(row, score_origin)
        and str(row.get("label_available_as_of") or target_end) <= score_origin
        and str(row.get("_bill_month_max", target_end)) <= score_origin
        and str(row.get("_available_as_of", target_end)) <= score_origin
    )


def _training_rows_availability_fingerprint(
    rows: Sequence[Mapping[str, Any]],
) -> str:
    records = []
    for row in rows:
        key = legacy.case_key(row)
        target_end = _target_end(row)
        actual = row.get("actual")
        records.append(
            {
                "caseKey": list(key),
                "targetEnd": target_end,
                "labelAvailableAsOf": str(
                    row.get("label_available_as_of") or target_end
                ),
                "billMonthMax": str(row.get("_bill_month_max", target_end)),
                "sourceAvailableAsOf": str(
                    row.get("_available_as_of", target_end)
                ),
                "actual": None
                if actual is None
                else calibration.fixed_decimal(actual),
            }
        )
    return digest(sorted(records, key=lambda item: tuple(item["caseKey"])))


def _fold_training_population_fingerprints(
    rows: Sequence[Mapping[str, Any]], spec: Mapping[str, Any]
) -> dict[str, str]:
    """Bind exact B0b training rows and every as-of availability dimension."""

    eligible_roles = {"development_fold_training_seed"} | {
        f"development_forward_score:{origin}"
        for origin in spec["origins"]["forwardValidation"]["scoreOrigins"]
    }
    b0b_rows = [
        row
        for row in rows
        if str(row.get("model_id")) == "B0b"
        and str(row.get("_residual_case_role")) in eligible_roles
    ]
    return {
        str(score_origin): _training_rows_availability_fingerprint(
            [
                row
                for row in b0b_rows
                if _fold_training_row_available(row, str(score_origin))
            ]
        )
        for score_origin in spec["origins"]["forwardValidation"]["scoreOrigins"]
    }


def _fit_b0b_fold_from_prior_truth(
    training_truth_rows: Sequence[Mapping[str, Any]],
    score_origin: str,
    spec: Mapping[str, Any],
) -> dict[str, Any]:
    fit = legacy.b0b_baseline(spec)["developmentFit"]
    fold = next(
        (
            item
            for item in spec["origins"]["forwardValidation"]["folds"]
            if str(item["scoreOrigin"]) == str(score_origin)
        ),
        None,
    )
    if fold is None:
        raise CorrectionError(f"missing frozen forward fold: {score_origin}")
    available = [
        row
        for row in training_truth_rows
        if _fold_training_row_available(row, str(score_origin))
    ]
    if not available:
        raise CorrectionError(f"B0b forward fold has no prior truth: {score_origin}")
    if any(
        row.get("actual") is None
        or _target_end(row) > str(score_origin)
        or str(row.get("label_available_as_of") or _target_end(row)) > str(score_origin)
        or str(row.get("_bill_month_max", _target_end(row))) > str(score_origin)
        or str(row.get("_available_as_of", _target_end(row))) > str(score_origin)
        for row in available
    ):
        raise CorrectionError("B0b fold training crossed its label-availability boundary")
    block_count = len(
        {
            (legacy.case_key(row)[1], legacy.case_key(row)[2])
            for row in available
        }
    )
    if block_count != int(fold["expectedTrainOriginHorizonBlockCount"]):
        raise CorrectionError(
            f"B0b forward training block mismatch at {score_origin}: {block_count}"
        )
    factor_routes = set(fit["factorEligibleRoutes"])
    factor_rows = [
        row
        for row in legacy.numeric_b0b_fit_rows(available)
        if str(row["route"]) in factor_routes
    ]
    prior_origins = {legacy.case_key(row)[1] for row in factor_rows}
    if len(prior_origins) < int(
        spec["origins"]["forwardValidation"]["minimumPriorDistinctOriginDates"]
    ):
        raise CorrectionError(f"B0b fold has too few prior origins: {score_origin}")
    matrix = legacy.build_fit_matrix(factor_rows, fit["lifecycleOrder"])
    fitted = legacy.fit_b0b_matrix(matrix, spec)
    return {
        "factors": copy.deepcopy(fitted["factors"]),
        "passes": int(fitted["passes"]),
        "trainingCaseCount": len(factor_rows),
        "trainingPopulationFingerprint": _training_rows_availability_fingerprint(
            available
        ),
        "trainingOriginCount": len(prior_origins),
        "trainingMaximumTargetEnd": max(_target_end(row) for row in available),
        "trainingMaximumLabelAvailableAsOf": max(
            str(row.get("label_available_as_of") or _target_end(row))
            for row in available
        ),
        "trainingMaximumBillMonth": max(
            str(row.get("_bill_month_max", _target_end(row))) for row in available
        ),
        "trainingMaximumSourceAvailableAsOf": max(
            str(row.get("_available_as_of", _target_end(row))) for row in available
        ),
        "trainingBlockCount": block_count,
    }


def _replace_b0b_fold_predictions(
    predictions: dict[str, list[dict[str, Any]]],
    works: Sequence[Mapping[str, Any]],
    spec: Mapping[str, Any],
    score_origin: str,
    horizons: Sequence[int],
    factors: Mapping[str, float],
) -> dict[tuple[str, str, int, str], float]:
    fold_spec = copy.deepcopy(spec)
    baseline = next(
        item for item in fold_spec["models"]["baselines"] if item["id"] == "B0b"
    )
    baseline["lifecycleFactors"] = dict(factors)
    baseline.pop("boundFittedParameterDigest", None)
    generated = legacy.generate_predictions(
        works,
        {int(horizon): [str(score_origin)] for horizon in horizons},
        fold_spec,
        model_ids=("B0b",),
        b0b_parameter_role="development_forward_fold",
    )["B0b"]
    generated_lookup = {legacy.case_key(row): copy.deepcopy(row) for row in generated}
    expected = {
        legacy.case_key(row)
        for row in predictions["B0b"]
        if legacy.case_key(row)[1] == str(score_origin)
        and legacy.case_key(row)[2] in {int(value) for value in horizons}
    }
    if set(generated_lookup) != expected:
        raise CorrectionError("generated B0b held keys differ from frozen fold keys")
    for index, row in enumerate(predictions["B0b"]):
        replacement = generated_lookup.get(legacy.case_key(row))
        if replacement is not None:
            predictions["B0b"][index] = replacement
    numeric = {
        key: float(row["point_forecast"])
        for key, row in generated_lookup.items()
        if legacy.eligibility_status(row) == "forecastable_numeric"
        and row.get("point_forecast") is not None
    }
    return numeric


def _ordered_forward_replay_with_prediction_locks(
    development_predictions: dict[str, list[dict[str, Any]]],
    works: Sequence[Mapping[str, Any]],
    spec: Mapping[str, Any],
    contract: scoring.ScoringContract,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    warmup_origins = set(spec["origins"]["forwardValidation"]["warmupOrigins"])
    training_seed = [
        row
        for row in development_predictions["B0b"]
        if legacy.case_key(row)[1] in warmup_origins
    ]
    seed_joined, seed_receipt, _seed_lock = _materialize_annotate_lock_join(
        training_seed,
        works,
        spec,
        contract,
        role="development_fold_training_seed",
        b0b_role="prefit_development_template",
    )
    training_truth: list[dict[str, Any]] = list(seed_joined)
    forward_joined: list[dict[str, Any]] = []
    fold_receipts: list[dict[str, Any]] = []
    fold_factors: dict[str, dict[str, float]] = {}
    oof_points: dict[tuple[str, str, int, str], float] = {}
    event_log: list[dict[str, Any]] = []

    for fold in spec["origins"]["forwardValidation"]["folds"]:
        score_origin = str(fold["scoreOrigin"])
        horizons = [int(value) for value in fold["testHorizons"]]
        fitted = _fit_b0b_fold_from_prior_truth(training_truth, score_origin, spec)
        event_log.append(
            {
                "event": "prior_truth_fit_complete",
                "scope": score_origin,
                "scoreOrigin": score_origin,
                "trainingMaximumTargetEnd": fitted["trainingMaximumTargetEnd"],
                "trainingMaximumLabelAvailableAsOf": fitted[
                    "trainingMaximumLabelAvailableAsOf"
                ],
                "trainingMaximumBillMonth": fitted["trainingMaximumBillMonth"],
                "trainingMaximumSourceAvailableAsOf": fitted[
                    "trainingMaximumSourceAvailableAsOf"
                ],
            }
        )
        fold_factors[score_origin] = copy.deepcopy(fitted["factors"])
        generated_numeric = _replace_b0b_fold_predictions(
            development_predictions,
            works,
            spec,
            score_origin,
            horizons,
            fitted["factors"],
        )
        overlap = set(oof_points).intersection(generated_numeric)
        if overlap:
            raise CorrectionError("B0b OOF prediction key duplicated across folds")
        oof_points.update(generated_numeric)
        held = [
            row
            for row in _flatten_predictions(development_predictions)
            if legacy.case_key(row)[1] == score_origin
            and legacy.case_key(row)[2] in set(horizons)
        ]
        joined, receipt, lock = _materialize_annotate_lock_join(
            held,
            works,
            spec,
            contract,
            role=f"development_forward_score:{score_origin}",
            b0b_role="development_forward_fold",
            fold_evidence={"foldFactors": {score_origin: fitted["factors"]}},
            score_origin=score_origin,
            event_log=event_log,
            event_scope=score_origin,
        )
        if any(legacy.case_key(row)[1] != score_origin for row in joined):
            raise CorrectionError("forward fold truth join escaped its score origin")
        forward_joined.extend(joined)
        training_truth.extend(row for row in joined if row["model_id"] == "B0b")
        fold_receipts.append(
            {
                "scoreOrigin": score_origin,
                "testHorizons": horizons,
                "fit": fitted,
                "lock": receipt,
                "eventOrder": [
                    event["event"]
                    for event in event_log
                    if event.get("scope") == score_origin
                ],
                "heldTruthFieldsAbsentAtLock": bool(
                    lock.get("outcomeFieldsAbsentAtLock", True)
                ),
            }
        )

    expected_order = [
        "prior_truth_fit_complete",
        "held_prediction_lock_created",
        "held_truth_join_complete",
    ]
    order_by_origin = {
        str(origin): [
            event["event"]
            for event in event_log
            if event.get("scope") == str(origin)
        ]
        for origin in spec["origins"]["forwardValidation"]["scoreOrigins"]
    }
    order_valid = all(order == expected_order for order in order_by_origin.values())
    availability_valid = all(
        str(event.get(field)) <= str(event["scoreOrigin"])
        for event in event_log
        if event["event"] == "prior_truth_fit_complete"
        for field in (
            "trainingMaximumTargetEnd",
            "trainingMaximumLabelAvailableAsOf",
            "trainingMaximumBillMonth",
            "trainingMaximumSourceAvailableAsOf",
        )
    )
    if not order_valid or not availability_valid:
        raise CorrectionError("forward event trace or prior-label boundary is invalid")

    combined_fingerprint = scoring.prediction_fingerprint(
        forward_joined,
        contract,
        allow_outcome_projection=True,
    )
    return forward_joined, training_truth, {
        "trainingSeed": seed_receipt,
        "folds": fold_receipts,
        "foldFactors": fold_factors,
        "_oofPredictionByKey": oof_points,
        "combinedPredictionFingerprint": combined_fingerprint,
        "eventTrace": event_log,
        "eventOrderByScoreOrigin": order_by_origin,
        "predictionLockedBeforeScoringTruthAccess": order_valid,
        "sameOrFutureFoldTruthUsedForCurrentPrediction": not availability_valid,
    }


def _interval_compatible(rows: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    compatible: list[dict[str, Any]] = []
    for source in rows:
        row = copy.deepcopy(dict(source))
        lock_role = str(row.get("_residual_case_role", ""))
        if lock_role.startswith("development_forward_score:"):
            # The legacy conformal kernel has one frozen generic development
            # role.  Project only the role label on this disposable copy; the
            # per-origin lock role and fingerprint remain unchanged on source.
            row["_residual_case_role"] = "development_forward_score"
            row["_interval_role_projected_from"] = lock_role
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
        "caseCount": f"<{minimum}" if case_count < minimum else None,
        "uniqueWorkCount": f"<{minimum}" if work_count < minimum else None,
        "allCellMetricsWithheld": True,
        "suppressionReason": "case_or_unique_work_count_below_public_minimum",
    }


def _secondary_suppressed_cell() -> dict[str, Any]:
    return {
        "suppressed": True,
        "caseCount": None,
        "uniqueWorkCount": None,
        "secondarySuppression": True,
        "suppressionReason": "complement_protection_for_primary_small_cell",
    }


def _apply_complementary_axis_suppression(
    cells: Sequence[Mapping[str, Any]],
) -> list[dict[str, Any]]:
    """Hide one sibling when a sole primary small cell could be differenced."""

    result = [copy.deepcopy(dict(cell)) for cell in cells]
    for model in BASELINE_IDS:
        indexes = [
            index
            for index, cell in enumerate(result)
            if str(cell.get("modelId")) == model
        ]
        primary = [index for index in indexes if result[index].get("suppressed") is True]
        visible = [index for index in indexes if result[index].get("suppressed") is not True]
        if len(primary) != 1 or not visible:
            continue

        def population_size(index: int) -> tuple[int, int, str]:
            metrics = result[index].get("allScoreableModelMetrics", {})
            case_count = metrics.get("caseCount")
            work_count = metrics.get("uniqueWorkCount")
            return (
                int(case_count) if isinstance(case_count, int) else sys.maxsize,
                int(work_count) if isinstance(work_count, int) else sys.maxsize,
                str(result[index].get("value")),
            )

        chosen = min(visible, key=population_size)
        identity = {
            "modelId": result[chosen].get("modelId"),
            "value": result[chosen].get("value"),
        }
        result[chosen] = {**identity, **_secondary_suppressed_cell()}
    return result


def score_model_group(
    rows: Sequence[Mapping[str, Any]], minimum: int, *, allow_suppression: bool
) -> dict[str, Any]:
    scoreable = [row for row in rows if row.get("statisticallyScoreable") is True]
    if allow_suppression and (
        len(scoreable) < minimum or _unique_work_count(scoreable) < minimum
    ):
        return _suppressed_cell(
            len(scoreable), _unique_work_count(scoreable), minimum
        )
    result = scoring.score_populations(rows)
    result["internal80PredictionInterval"] = internal_interval_metrics(rows)
    return {"suppressed": False, **sanitize_score_payload(result, minimum)}


def _sanitize_metric_population(
    population: Mapping[str, Any], minimum: int
) -> dict[str, Any]:
    case_count = int(population.get("caseCount", 0))
    work_count = int(population.get("uniqueWorkCount", 0))
    if case_count < minimum or work_count < minimum:
        return _suppressed_cell(case_count, work_count, minimum)
    result = copy.deepcopy(dict(population))
    # Additive totals make a suppressed complement exactly recoverable from
    # all-scoreable minus served, so they stay in ignored private evidence only.
    result.pop("actualTotal", None)
    result.pop("predictedTotal", None)
    if "workCountDefinition" in result:
        result["workCountDefinition"] = "distinct_work_origin_block"
    return {"suppressed": False, **result}


def _sanitize_reason_distribution(
    reasons: Mapping[str, Mapping[str, Any]], minimum: int
) -> dict[str, Any]:
    output: dict[str, Any] = {}
    for reason, values in reasons.items():
        case_count = int(values.get("caseCount", 0))
        work_key = "uniqueWorkCount" if "uniqueWorkCount" in values else "workCount"
        work_count = int(values.get(work_key, 0))
        if case_count < minimum or work_count < minimum:
            output[str(reason)] = {
                "suppressed": True,
                "caseCount": f"<{minimum}" if case_count < minimum else None,
                work_key: f"<{minimum}" if work_count < minimum else None,
                "positiveActualRevenueShare": None,
                "suppressionReason": "case_or_unique_work_count_below_public_minimum",
            }
        else:
            public_values = copy.deepcopy(dict(values))
            if "workCountDefinition" in public_values:
                public_values["workCountDefinition"] = "distinct_work_origin_block"
            output[str(reason)] = {"suppressed": False, **public_values}
    return output


def _sanitize_public_semantic_strings(value: Any) -> Any:
    """Remove internal identifier field names while retaining aggregate meaning."""

    if isinstance(value, Mapping):
        return {
            str(key): _sanitize_public_semantic_strings(child)
            for key, child in value.items()
        }
    if isinstance(value, list):
        return [_sanitize_public_semantic_strings(child) for child in value]
    if isinstance(value, tuple):
        return [_sanitize_public_semantic_strings(child) for child in value]
    if isinstance(value, str):
        return value.replace("standard_work_id", "work").replace(
            "channel_key", "channel"
        )
    return value


def sanitize_score_payload(
    payload: Mapping[str, Any], minimum: int
) -> dict[str, Any]:
    """Apply the committed case-and-work small-cell rule to every population."""

    result = copy.deepcopy(dict(payload))
    result["allScoreableModelMetrics"] = _sanitize_metric_population(
        result["allScoreableModelMetrics"], minimum
    )
    served = copy.deepcopy(result["servedCohortMetrics"])
    high = _sanitize_metric_population(served.pop("highValuePerformance"), minimum)
    served_sanitized = _sanitize_metric_population(served, minimum)
    if not served_sanitized.get("suppressed"):
        served_sanitized["highValuePerformance"] = high
    result["servedCohortMetrics"] = served_sanitized

    abstention = copy.deepcopy(result["abstentionMetrics"])
    abstained_cases = int(abstention.get("abstainedCaseCount", 0))
    abstained_works = int(abstention.get("abstainedWorkCount", 0))
    small_abstention = abstained_cases < minimum or abstained_works < minimum
    abstention["abstentionCellSuppressed"] = small_abstention
    if small_abstention:
        result["abstentionMetrics"] = {
            "suppressed": True,
            "caseCount": f"<{minimum}" if abstained_cases < minimum else None,
            "uniqueWorkCount": f"<{minimum}" if abstained_works < minimum else None,
            "allCellMetricsWithheld": True,
            "suppressionReason": (
                "abstained_case_or_unique_work_count_below_public_minimum"
            ),
        }
        served_public = result["servedCohortMetrics"]
        if not served_public.get("suppressed"):
            served_public["caseCount"] = None
            served_public["uniqueWorkCount"] = None
            served_public["countSuppressedToProtectComplementSmallCell"] = True
            high_public = served_public.get("highValuePerformance")
            if isinstance(high_public, Mapping) and not high_public.get("suppressed"):
                high_public["caseCount"] = None
                high_public["uniqueWorkCount"] = None
                high_public["countSuppressedToProtectComplementSmallCell"] = True
    else:
        abstention["suppressed"] = False
        abstention["abstentionReasonDistribution"] = _sanitize_reason_distribution(
            abstention.get("abstentionReasonDistribution", {}), minimum
        )
        result["abstentionMetrics"] = abstention

    result["servingCoverageMetrics"] = {
        "population": "all_statistically_scoreable_large_denominator_cells",
        "servedWorkShare": abstention.get("servedWorkShare"),
        "servedActualRevenueShare": abstention.get("servedActualRevenueShare"),
        "top1ServedRevenueShare": abstention.get("top1ServedRevenueShare"),
        "top5ServedRevenueShare": abstention.get("top5ServedRevenueShare"),
        "top10ServedRevenueShare": abstention.get("top10ServedRevenueShare"),
        "abstentionSmallCellDetailsSuppressed": small_abstention,
    }

    interval = copy.deepcopy(result["internal80PredictionInterval"])
    required = int(interval.get("requiredCaseCount", 0))
    if required < minimum:
        result["internal80PredictionInterval"] = {
            "suppressed": True,
            "requiredCaseCount": f"<{minimum}",
        }
    else:
        result["internal80PredictionInterval"] = {"suppressed": False, **interval}
    return _sanitize_public_semantic_strings(result)


def sanitize_attribution_report(
    report: Mapping[str, Any], minimum: int
) -> dict[str, Any]:
    result = copy.deepcopy(dict(report))
    for stage in result.get("stages", []):
        all_metrics = stage.get("allScoreableModelMetrics")
        if isinstance(all_metrics, Mapping) and "caseCount" in all_metrics:
            stage["allScoreableModelMetrics"] = _sanitize_metric_population(
                all_metrics, minimum
            )
        served_metrics = stage.get("servedCohortMetrics")
        if isinstance(served_metrics, Mapping) and "caseCount" in served_metrics:
            stage["servedCohortMetrics"] = _sanitize_metric_population(
                served_metrics, minimum
            )
        high_metrics = stage.get("highValueServedPerformance")
        if isinstance(high_metrics, Mapping) and "caseCount" in high_metrics:
            stage["highValueServedPerformance"] = _sanitize_metric_population(
                high_metrics, minimum
            )
        abstention = stage.get("abstentionMetrics")
        if not isinstance(abstention, Mapping):
            continue
        cleaned = copy.deepcopy(dict(abstention))
        cases = cleaned.get("abstainedCaseCount")
        works = cleaned.get("abstainedWorkCount")
        if isinstance(cases, int) and isinstance(works, int) and (
            cases < minimum or works < minimum
        ):
            cleaned = {
                "suppressed": True,
                "caseCount": f"<{minimum}" if cases < minimum else None,
                "uniqueWorkCount": f"<{minimum}" if works < minimum else None,
                "allCellMetricsWithheld": True,
                "suppressionReason": (
                    "abstained_case_or_unique_work_count_below_public_minimum"
                ),
            }
            served = stage.get("servedCohortMetrics")
            if isinstance(served, Mapping):
                served = copy.deepcopy(dict(served))
                served["caseCount"] = None
                served["uniqueWorkCount"] = None
                served["countSuppressedToProtectComplementSmallCell"] = True
                stage["servedCohortMetrics"] = served
        else:
            cleaned["suppressed"] = False
            reasons = cleaned.get("abstentionReasonDistribution")
            if isinstance(reasons, Mapping):
                cleaned["abstentionReasonDistribution"] = _sanitize_reason_distribution(
                    reasons, minimum
                )
        stage["abstentionMetrics"] = cleaned
    return _sanitize_public_semantic_strings(result)


def _public_lock_receipt(
    receipt: Mapping[str, Any], *, suppress_counts: bool = False
) -> dict[str, Any]:
    included_keys = [
        "role",
        "scoreOrigin",
        "outcomeFieldsAbsentAtLock",
        "outcomeFieldRejectionPassed",
        "predictionLockedBeforeTruthJoin",
        "predictionLockCreatedBeforeTruthJoin",
        "postTruthPredictionProjectionVerified",
        "postTruthPredictionProjectionMatchesLock",
    ]
    if not suppress_counts:
        included_keys.append("predictionFingerprint")
    result = {
        key: copy.deepcopy(receipt.get(key))
        for key in included_keys
        if key in receipt
    }
    if not suppress_counts:
        result["predictionRowCount"] = receipt.get("predictionRowCount")
        result["caseKeyCount"] = receipt.get("caseKeyCount")
    else:
        result["countsSuppressed"] = True
        result["predictionFingerprintWithheldForSmallCell"] = True
    return result


def public_prediction_lock_evidence(
    warmup: Mapping[str, Any],
    forward: Mapping[str, Any],
    long_audit: Mapping[str, Any],
) -> dict[str, Any]:
    return {
        "warmup": _public_lock_receipt(warmup),
        "forward": {
            "trainingSeed": _public_lock_receipt(forward.get("trainingSeed", {})),
            "folds": [
                {
                    "scoreOrigin": item.get("scoreOrigin"),
                    "testHorizons": copy.deepcopy(item.get("testHorizons", [])),
                    "trainingMaximumTargetEnd": item.get("fit", {}).get(
                        "trainingMaximumTargetEnd"
                    ),
                    "trainingMaximumLabelAvailableAsOf": item.get("fit", {}).get(
                        "trainingMaximumLabelAvailableAsOf"
                    ),
                    "trainingMaximumBillMonth": item.get("fit", {}).get(
                        "trainingMaximumBillMonth"
                    ),
                    "trainingMaximumSourceAvailableAsOf": item.get("fit", {}).get(
                        "trainingMaximumSourceAvailableAsOf"
                    ),
                    "eventOrder": copy.deepcopy(item.get("eventOrder", [])),
                    "heldTruthFieldsAbsentAtLock": item.get(
                        "heldTruthFieldsAbsentAtLock"
                    ),
                    "lock": _public_lock_receipt(item.get("lock", {})),
                }
                for item in forward.get("folds", [])
            ],
            "combinedPredictionFingerprint": forward.get(
                "combinedPredictionFingerprint"
            ),
            "predictionLockedBeforeScoringTruthAccess": forward.get(
                "predictionLockedBeforeScoringTruthAccess"
            ),
            "sameOrFutureFoldTruthUsedForCurrentPrediction": forward.get(
                "sameOrFutureFoldTruthUsedForCurrentPrediction"
            ),
        },
        "longAudit": _public_lock_receipt(long_audit, suppress_counts=True),
    }


def aggregate_models(
    rows: Sequence[Mapping[str, Any]], spec: Mapping[str, Any]
) -> dict[str, Any]:
    minimum = int(spec["reporting"]["committableAggregateReport"]["minimumCellCount"])
    by_model = {
        model: [row for row in rows if row["model_id"] == model]
        for model in BASELINE_IDS
    }
    scoreable_by_model = {
        model: [row for row in value if row.get("statisticallyScoreable") is True]
        for model, value in by_model.items()
    }
    population_case_count = min(
        (len(value) for value in scoreable_by_model.values()), default=0
    )
    population_work_count = min(
        (_unique_work_count(value) for value in scoreable_by_model.values()), default=0
    )
    if population_case_count < minimum or population_work_count < minimum:
        return _suppressed_cell(population_case_count, population_work_count, minimum)
    overall = {
        model: score_model_group(model_rows, minimum, allow_suppression=True)
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
        slices[axis] = _apply_complementary_axis_suppression(cells)
    return {"suppressed": False, "overall": overall, "slices": slices}


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


def _posthoc_segment_fingerprint(rows: Sequence[Mapping[str, Any]]) -> str:
    return digest(
        [
            {
                "key": list(legacy.case_key(row)),
                "strata": copy.deepcopy(row.get("strata", {})),
            }
            for row in sorted(rows, key=legacy.case_key)
        ]
    )


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
    posthoc_fingerprints = {
        model: _posthoc_segment_fingerprint(values) for model, values in by_model.items()
    }
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
    first_scoreable_rows = [
        row
        for row in by_model[first]
        if row.get("statisticallyScoreable") is True
    ]
    first_abstained_rows = [
        row for row in first_scoreable_rows if row.get("abstained") is True
    ]
    first_abstained_blocks = {
        (legacy.case_key(row)[0], legacy.case_key(row)[1])
        for row in first_abstained_rows
    }
    suppress_abstention = (
        len(first_abstained_rows) < 10 or len(first_abstained_blocks) < 10
    )
    return {
        "caseKeysIdentical": all(values == key_sets[first] for values in key_sets.values()),
        "scoreableKeysIdentical": all(
            values == scoreable_sets[first] for values in scoreable_sets.values()
        ),
        "businessServingKeysIdentical": all(
            values == serving_sets[first] for values in serving_sets.values()
        ),
        "postHocSegmentAssignmentsIdentical": all(
            value == posthoc_fingerprints[first]
            for value in posthoc_fingerprints.values()
        ),
        "intersectionDropUsed": False,
        "rawPredictionCompleteOnAllScoreable": raw_complete,
        "rawEqualsServedWhenServedAndOtherwiseNull": served_consistent,
        "blockedOrAbstainedZeroImputedIntoModelWape": False,
        "caseCountPerModel": len(key_sets[first]),
        "scoreableCaseCountPerModel": len(scoreable_sets[first]),
        "businessServingCaseCountPerModel": (
            None if suppress_abstention else len(serving_sets[first])
        ),
        "abstentionCellSuppressed": suppress_abstention,
        "stateAndPredictionFingerprint": _state_fingerprint(rows),
        "contractPredictionFingerprint": scoring.prediction_fingerprint(
            rows, allow_outcome_projection=True
        ),
        "scoreabilityFingerprint": scoring.scoreability_fingerprint(rows),
        "postHocSegmentFingerprint": posthoc_fingerprints[first],
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
    abstained_blocks = {
        (legacy.case_key(row)[0], legacy.case_key(row)[1]) for row in abstained
    }
    suppress_abstention = len(abstained) < 10 or len(abstained_blocks) < 10
    return {
        "caseUniverseCount": len(b0b),
        "legacyForecastableCaseCountAuditOnly": len(legacy_numeric),
        "statisticallyScoreableCaseCount": len(scoreable),
        "modelPredictionAvailableScoreableCaseCount": sum(
            bool(row["modelPredictionAvailable"]) for row in scoreable
        ),
        "businessServingEligibleScoreableCaseCount": (
            None if suppress_abstention else len(serving)
        ),
        "abstainedScoreableCaseCount": (
            ("<10" if len(abstained) < 10 else None)
            if suppress_abstention
            else len(abstained)
        ),
        "abstainedWorkCount": (
            ("<10" if len(abstained_blocks) < 10 else None)
            if suppress_abstention
            else len(abstained_blocks)
        ),
        "abstentionCellSuppressed": suppress_abstention,
        "servingCountSuppressedToProtectComplementSmallCell": suppress_abstention,
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
    coverage = score["servingCoverageMetrics"]
    high = served["highValuePerformance"]
    horizon_biases = {}
    for cell in aggregate["slices"]["horizon"]:
        if cell["modelId"] != locked_comparator or cell.get("suppressed"):
            continue
        horizon_biases[str(cell["value"])] = cell["allScoreableModelMetrics"][
            "signedAggregateBias"
        ]
    top10 = coverage["top10ServedRevenueShare"]
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
                "postHocSegmentAssignmentsIdentical",
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
        "standardworkid",
        "workid",
        "workkey",
        "casekey",
        "worktitle",
        "author",
        "channelkey",
        "channelidentifier",
        "channelrowdetail",
        "channeldetail",
        "rawincomerow",
        "rawbillrow",
        "rawrow",
        "billrow",
        "lower",
        "upper",
        "p10",
        "p90",
        "pilower",
        "piupper",
        "predictionintervallower",
        "predictionintervalupper",
        "optimistic",
        "pessimistic",
        "high",
        "base",
        "low",
    }

    def visit(current: Any) -> None:
        if isinstance(current, Mapping):
            case_count = current.get("caseCount")
            work_count = current.get(
                "uniqueWorkCount", current.get("workCount")
            )
            small_count = (
                (isinstance(case_count, int) and case_count < 10)
                or (isinstance(work_count, int) and work_count < 10)
            )
            if small_count and current.get("suppressed") is not True:
                raise CorrectionError("public report contains an unsuppressed small cell")
            for key, child in current.items():
                normalized = str(key).replace("-", "").replace("_", "").casefold()
                if normalized in forbidden_keys:
                    raise CorrectionError(f"public report contains forbidden key: {key}")
                visit(child)
        elif isinstance(current, (list, tuple)):
            for child in current:
                visit(child)
        elif isinstance(current, str):
            text = current.replace("\\", "/").casefold()
            if "standard_work_id" in text or "channel_key" in text:
                raise CorrectionError("public report names a row-level identifier field")
            if "data/private-output/" in text:
                raise CorrectionError("public report contains a private path")
            root = str(ROOT).replace("\\", "/").casefold()
            if root in text:
                raise CorrectionError("public report contains a machine-local path")
            if (
                re.match(r"^[a-z]:/", text)
                or text.startswith("//")
                or re.match(r"^/(home|users|tmp|var|private|mnt)/", text)
            ):
                raise CorrectionError("public report contains an absolute local path")

    visit(value)


def assert_public_markdown_privacy(value: str) -> None:
    normalized = value.replace("\\", "/")
    folded = normalized.casefold()
    if "data/private-output/" in folded or str(ROOT).replace("\\", "/").casefold() in folded:
        raise CorrectionError("public Markdown contains a private or machine-local path")
    if re.search(r"(?im)(?:^|[\s`|])(?:standard_work_id|channel_key|caseKey|workKey)(?:[\s`|:]|$)", value):
        raise CorrectionError("public Markdown names a row-level identifier")
    if re.search(
        r"(?i)(?:predictionIntervalLower|predictionIntervalUpper|PI_lower|PI_upper|`(?:optimistic|pessimistic|high|base|low)`)",
        value,
    ):
        raise CorrectionError("public Markdown exposes an interval or scenario endpoint")
    for line in normalized.splitlines():
        candidate = line.strip().strip("`<>()[]{}.,;:'\"")
        if re.match(r"^[a-zA-Z]:/", candidate) or candidate.startswith("//"):
            raise CorrectionError("public Markdown contains an absolute local path")


def _atomic_write_bytes(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb",
            dir=path.parent,
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            temporary = Path(handle.name)
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        temporary.replace(path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def write_json(path: Path, value: Mapping[str, Any]) -> None:
    assert_public_privacy(value)
    _atomic_write_bytes(
        path,
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True, allow_nan=False).encode(
            "utf-8"
        )
        + b"\n",
    )


def write_public_markdown(path: Path, value: str) -> None:
    assert_public_markdown_privacy(value)
    _atomic_write_bytes(path, value.encode("utf-8") + (b"" if value.endswith("\n") else b"\n"))


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
    coverage = report["developmentBaseline"]["overall"]["B0b"][
        "servingCoverageMetrics"
    ]
    lines.extend(
        [
            "",
            "## Serving 与 abstention",
            "",
            f"- served work share：`{_fmt(coverage['servedWorkShare'])}`",
            f"- served actual revenue share：`{_fmt(coverage['servedActualRevenueShare'])}`",
            f"- top1 / top5 / top10 served revenue coverage：`{_fmt(coverage['top1ServedRevenueShare'])}` / `{_fmt(coverage['top5ServedRevenueShare'])}` / `{_fmt(coverage['top10ServedRevenueShare'])}`",
            f"- abstention cell：cases `{abstention.get('caseCount') if abstention.get('caseCount') is not None else '已抑制'}` / works `{abstention.get('uniqueWorkCount') if abstention.get('uniqueWorkCount') is not None else '已抑制'}`（小 cell 按规则整组抑制）。",
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
    mixed = report["historicalMixedScoringAudit"]
    attribution_conclusion = report["differenceAttributionConclusion"]
    served_count = state["businessServingEligibleScoreableCaseCount"]
    abstained_count = state["abstainedScoreableCaseCount"]
    lines = [
        "# M2 calibration-spec-v1.1 计分与 eligibility 修正",
        "",
        f"- 决策状态：`{report['decisionStatus']}`；C1 started：`false`。",
        f"- case universe / statistically scoreable / served / abstained：`{state['caseUniverseCount']}` / `{state['statisticallyScoreableCaseCount']}` / `{served_count if served_count is not None else '已抑制'}` / `{abstained_count if abstained_count is not None else '已抑制'}`。",
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
            f"| {model} | {item['allScoreableModelMetrics']['caseCount']} | {_fmt(item['allScoreableModelMetrics']['wape'])} | {_fmt(item['allScoreableModelMetrics']['signedAggregateBias'])} | {_fmt(item['servedCohortMetrics']['wape'])} | {_fmt(item['servedCohortMetrics']['signedAggregateBias'])} | {item['abstentionMetrics'].get('uniqueWorkCount', item['abstentionMetrics'].get('abstainedWorkCount'))} |"
        )
    lines.extend(
        [
            "",
            "## 旧约 64% → 132% 的解释",
            "",
            f"- B0a 历史 WAPE：`{_fmt(attribution_conclusion['historicalB0aWape'])}`；旧 coverage-aware null→0 混合量：`{_fmt(mixed['coverageAwareNullToZeroWape'])}`。后者不是模型 WAPE。",
            f"- 旧混合量同时出现总体 bias `{_fmt(mixed['coverageAwareNullToZeroSignedBias'])}`、legacy forecastable bias `{_fmt(mixed['legacyForecastableNumericSignedBias'])}` 与高价值 null→0 bias `{_fmt(mixed['legacyHighValueNullToZeroSignedBias'])}`，说明误差与 abstention 人口发生机械抵消。",
            f"- 固定 Stage 2–7 keys 后：as-of quantile/prior/features 的 WAPE 变化为 `{_fmt(attribution_conclusion['asOfQuantilePriorAndFeatureDelta'])}`；eligibility/abstention raw 模型 WAPE 变化为 `{_fmt(attribution_conclusion['eligibilityAndAbstentionRawModelWapeDelta'])}`；旧 selector 切换完整 B0b 的变化为 `{_fmt(attribution_conclusion['legacyModelToCompleteB0bFormulaDelta'])}`。",
            "- 因此不能把全部差异归因于去泄漏；固定 keys 下的主要恶化来自模型公式切换。",
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
    mixed = report["historicalMixedScoringAudit"]
    conclusion = report["differenceAttributionConclusion"]
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
        high = stage.get("highValueServedPerformance", {}) or {}
        lines.append(
            "| {stage} {title} | {cases} | {wape} | {bias} | {coverage} | {top10} | {high_wape} | {high_bias} |".format(
                stage=stage["stage"],
                title=stage["title"],
                cases=stage.get("caseCount"),
                wape=_fmt(all_metrics.get("wape")),
                bias=_fmt(all_metrics.get("signedAggregateBias")),
                coverage=_fmt(stage.get("servedRevenueCoverage")),
                top10=_fmt(stage.get("top10ServedRevenueCoverage")),
                high_wape=_fmt(high.get("wape")),
                high_bias=_fmt(high.get("signedAggregateBias")),
            )
        )
    lines.extend(
        [
            "",
            "## 差异主因",
            "",
            f"- 旧约 132% 数值为 `{_fmt(mixed['coverageAwareNullToZeroWape'])}`，其 null evaluation value 为 0，只能称业务覆盖混合量，不能称模型 WAPE。",
            f"- Stage 2→4 的 as-of 量化/先验/特征合计变化：`{_fmt(conclusion['asOfQuantilePriorAndFeatureDelta'])}`。",
            f"- Stage 4→6 的 eligibility 与 abstention raw 模型 WAPE 变化：`{_fmt(conclusion['eligibilityAndAbstentionRawModelWapeDelta'])}`。",
            f"- Stage 6→7 从旧 selector 到完整 B0b 公式的变化：`{_fmt(conclusion['legacyModelToCompleteB0bFormulaDelta'])}`，是固定 keys 后的主要来源。",
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
    for path in (PRIVATE_CASES, PRIVATE_MANIFEST):
        if not legacy.git_path_is_ignored(path):
            raise CorrectionError("private calibration evidence path is not Git-ignored")
    PRIVATE_DIR.mkdir(parents=True, exist_ok=True)
    case_temp: Path | None = None
    manifest_temp: Path | None = None
    try:
        case_digest = hashlib.sha256()
        row_count = 0
        with tempfile.NamedTemporaryFile(
            mode="wb",
            dir=PRIVATE_DIR,
            prefix=f".{PRIVATE_CASES.name}.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            case_temp = Path(handle.name)
            for row in rows:
                payload = {
                    "modelId": row["model_id"],
                    "caseKey": row["case_key"],
                    "actual": row.get("actual"),
                    "targetEnd": row.get("target_end"),
                    "labelAvailableAsOf": row.get("label_available_as_of"),
                    "billMonthMax": row.get("_bill_month_max", row.get("target_end")),
                    "sourceAvailableAsOf": row.get(
                        "_available_as_of", row.get("target_end")
                    ),
                    "statisticallyScoreable": row["statisticallyScoreable"],
                    "scoreabilityReason": row["scoreabilityReason"],
                    "modelPredictionAvailable": row["modelPredictionAvailable"],
                    "businessServingEligible": row["businessServingEligible"],
                    "rawModelPrediction": row["rawModelPrediction"],
                    "servedPrediction": row["servedPrediction"],
                    "abstained": row["abstained"],
                    "abstentionReason": row["abstentionReason"],
                    "rawAnnualBreakdown": row.get("rawAnnualBreakdown", []),
                    "servedAnnualBreakdown": row.get("servedAnnualBreakdown", []),
                    "confidence": row.get("confidence"),
                    "limitation": row.get("limitation", []),
                    "predictionRole": row.get("_residual_case_role"),
                    "internal80PredictionInterval": row.get("_internal_interval"),
                    "strata": row.get("strata"),
                }
                encoded_row = (
                    json.dumps(
                        payload,
                        ensure_ascii=False,
                        sort_keys=True,
                        separators=(",", ":"),
                        allow_nan=False,
                    ).encode("utf-8")
                    + b"\n"
                )
                handle.write(encoded_row)
                case_digest.update(encoded_row)
                row_count += 1
            handle.flush()
            os.fsync(handle.fileno())
        report_digests = {
            path.relative_to(ROOT).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in PUBLIC_REPORT_PATHS
        }
        bound_manifest = {
            **copy.deepcopy(dict(manifest)),
            "privateCaseRowCount": row_count,
            "caseEvidenceSha256": case_digest.hexdigest(),
            "privateCaseSerialization": "canonical_compact_JSON_UTF8_LF_one_object_per_line",
            "publicReportSha256": report_digests,
        }
        encoded = (
            json.dumps(
                bound_manifest,
                ensure_ascii=False,
                indent=2,
                sort_keys=True,
                allow_nan=False,
            ).encode("utf-8")
            + b"\n"
        )
        with tempfile.NamedTemporaryFile(
            mode="wb",
            dir=PRIVATE_DIR,
            prefix=f".{PRIVATE_MANIFEST.name}.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            manifest_temp = Path(handle.name)
            handle.write(encoded)
            handle.flush()
            os.fsync(handle.fileno())

        # Verify the complete staged bundle before either canonical path is replaced.
        verify_private_evidence_manifest(
            case_temp,
            manifest_temp,
            expected_bindings=manifest,
        )
        case_temp.replace(PRIVATE_CASES)
        case_temp = None
        manifest_temp.replace(PRIVATE_MANIFEST)
        manifest_temp = None
        verified = verify_private_evidence_manifest(
            PRIVATE_CASES,
            PRIVATE_MANIFEST,
            expected_bindings=manifest,
        )
        final_manifest_bytes = PRIVATE_MANIFEST.read_bytes()
        return {
            **verified,
            "manifestSha256": hashlib.sha256(final_manifest_bytes).hexdigest(),
            "tracked": False,
        }
    finally:
        for temporary in (case_temp, manifest_temp):
            if temporary is not None and temporary.exists():
                temporary.unlink()


def verify_private_evidence_manifest(
    case_path: Path = PRIVATE_CASES,
    manifest_path: Path = PRIVATE_MANIFEST,
    *,
    expected_bindings: Mapping[str, Any] | None = None,
    public_report_paths: Mapping[str, Path] | None = None,
) -> dict[str, Any]:
    def strict_object(pairs: Sequence[tuple[str, Any]]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key, value in pairs:
            if key in result:
                raise CorrectionError("private evidence JSON contains a duplicate key")
            result[key] = value
        return result

    def reject_constant(value: str) -> Any:
        raise CorrectionError(f"private evidence JSON contains non-finite {value}")

    def load_strict_json(payload: bytes) -> Any:
        try:
            return json.loads(
                payload.decode("utf-8"),
                object_pairs_hook=strict_object,
                parse_constant=reject_constant,
            )
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise CorrectionError("private evidence JSON is invalid UTF-8 JSON") from exc

    manifest_value = load_strict_json(manifest_path.read_bytes())
    if not isinstance(manifest_value, Mapping):
        raise CorrectionError("private evidence manifest is not an object")
    manifest = dict(manifest_value)
    required_fields = {
        "schema",
        "decisionStatus",
        "baseSpecDigest",
        "amendmentDigest",
        "combinedContractDigest",
        "correctionCodeCommit",
        "inputFingerprint",
        "scoreabilityFingerprint",
        "foldTrainingPopulationFingerprints",
        "predictionLockFingerprints",
        "fittedArtifactSha256",
        "privateCaseRowCount",
        "caseEvidenceSha256",
        "privateCaseSerialization",
        "publicReportSha256",
        "caseKeyAndStateParity",
        "finalHoldoutOpened",
        "candidateTrainingStarted",
    }
    missing = sorted(required_fields.difference(manifest))
    if missing:
        raise CorrectionError(f"private evidence manifest lacks bindings: {missing}")
    if manifest["schema"] != "m2.calibration-baseline-replay.private-manifest.v1_1":
        raise CorrectionError("private evidence manifest schema mismatch")
    if manifest["decisionStatus"] != "not_for_formal_decision":
        raise CorrectionError("private evidence manifest decision status is not sealed")
    if (
        manifest["caseKeyAndStateParity"] is not True
        or manifest["finalHoldoutOpened"] is not False
        or manifest["candidateTrainingStarted"] is not False
    ):
        raise CorrectionError("private evidence manifest seal or parity binding failed")
    if (
        manifest["privateCaseSerialization"]
        != "canonical_compact_JSON_UTF8_LF_one_object_per_line"
    ):
        raise CorrectionError("private case serialization contract mismatch")

    contract = scoring.load_contract()
    expected_contract = {
        "baseSpecDigest": contract.base_digest,
        "amendmentDigest": contract.amendment_digest,
        "combinedContractDigest": contract.combined_digest,
    }
    if any(manifest.get(key) != value for key, value in expected_contract.items()):
        raise CorrectionError("private manifest contract digest binding mismatch")
    for field in (
        "baseSpecDigest",
        "amendmentDigest",
        "combinedContractDigest",
        "inputFingerprint",
        "scoreabilityFingerprint",
        "fittedArtifactSha256",
        "caseEvidenceSha256",
    ):
        if not SHA256_PATTERN.fullmatch(str(manifest[field])):
            raise CorrectionError(f"private manifest has an invalid digest: {field}")
    code_commit = str(manifest["correctionCodeCommit"])
    if not GIT_COMMIT_PATTERN.fullmatch(code_commit):
        raise CorrectionError("private manifest correction code commit is invalid")
    if legacy.latest_exact_commit(CORRECTION_CODE_PATHS) != code_commit:
        raise CorrectionError("private manifest correction code bytes do not match commit")
    if expected_bindings is not None:
        for key, expected in expected_bindings.items():
            if manifest.get(key) != expected:
                raise CorrectionError(f"private manifest trusted binding differs: {key}")

    expected_count = manifest["privateCaseRowCount"]
    if isinstance(expected_count, bool) or not isinstance(expected_count, int) or expected_count <= 0:
        raise CorrectionError("private case row count is not a positive integer")
    expected_digest = str(manifest["caseEvidenceSha256"])
    actual_digest = hashlib.sha256()
    actual_count = 0
    seen: set[tuple[str, str, str, int, str, str]] = set()
    reconstructed_rows: list[dict[str, Any]] = []
    with case_path.open("rb") as handle:
        for raw_line in handle:
            if not raw_line.endswith(b"\n") or raw_line in {b"\n", b"\r\n"}:
                raise CorrectionError("private case evidence is not canonical LF NDJSON")
            actual_digest.update(raw_line)
            payload_value = load_strict_json(raw_line[:-1])
            if not isinstance(payload_value, Mapping):
                raise CorrectionError("private case evidence row is not an object")
            payload = dict(payload_value)
            canonical = (
                json.dumps(
                    payload,
                    ensure_ascii=False,
                    sort_keys=True,
                    separators=(",", ":"),
                    allow_nan=False,
                ).encode("utf-8")
                + b"\n"
            )
            if canonical != raw_line:
                raise CorrectionError("private case evidence row is not canonical JSON")
            required_case_fields = {
                "modelId",
                "caseKey",
                "actual",
                "targetEnd",
                "labelAvailableAsOf",
                "billMonthMax",
                "sourceAvailableAsOf",
                "statisticallyScoreable",
                "scoreabilityReason",
                "modelPredictionAvailable",
                "businessServingEligible",
                "rawModelPrediction",
                "servedPrediction",
                "abstained",
                "abstentionReason",
                "rawAnnualBreakdown",
                "servedAnnualBreakdown",
                "confidence",
                "limitation",
                "predictionRole",
            }
            if required_case_fields.difference(payload):
                raise CorrectionError("private case evidence row lacks a required field")
            key = payload["caseKey"]
            if not isinstance(key, Mapping):
                raise CorrectionError("private case evidence case key is invalid")
            role = str(payload["predictionRole"] or "")
            if not role:
                raise CorrectionError("private case evidence prediction role is missing")
            identity = (
                role,
                str(payload["modelId"]),
                str(key.get("standard_work_id", key.get("standardWorkId", ""))),
                str(key["origin"]),
                int(key.get("horizon_months", key.get("horizonMonths", 0))),
                str(key.get("route", "")),
            )
            if identity in seen:
                raise CorrectionError("private case evidence contains a duplicate role/model case key")
            seen.add(identity)
            reconstructed_rows.append(
                {
                    "model_id": payload["modelId"],
                    "case_key": copy.deepcopy(dict(key)),
                    "actual": payload["actual"],
                    "target_end": payload["targetEnd"],
                    "label_available_as_of": payload["labelAvailableAsOf"],
                    "_bill_month_max": payload["billMonthMax"],
                    "_available_as_of": payload["sourceAvailableAsOf"],
                    "statisticallyScoreable": payload["statisticallyScoreable"],
                    "scoreabilityReason": payload["scoreabilityReason"],
                    "modelPredictionAvailable": payload["modelPredictionAvailable"],
                    "businessServingEligible": payload["businessServingEligible"],
                    "rawModelPrediction": payload["rawModelPrediction"],
                    "servedPrediction": payload["servedPrediction"],
                    "abstained": payload["abstained"],
                    "abstentionReason": payload["abstentionReason"],
                    "rawAnnualBreakdown": payload["rawAnnualBreakdown"],
                    "servedAnnualBreakdown": payload["servedAnnualBreakdown"],
                    "confidence": payload["confidence"],
                    "limitation": payload["limitation"],
                    "public_output": {
                        "pointForecast": payload["servedPrediction"],
                        "annualBreakdown": payload["servedAnnualBreakdown"],
                        "confidence": payload["confidence"],
                        "limitation": payload["limitation"],
                    },
                    "_residual_case_role": role,
                }
            )
            actual_count += 1
    if actual_count != expected_count:
        raise CorrectionError("private case evidence row count differs from manifest")
    if actual_digest.hexdigest() != expected_digest:
        raise CorrectionError("private case evidence digest differs from manifest")

    try:
        recomputed_scoreability = scoring.scoreability_fingerprint(
            reconstructed_rows, contract
        )
    except scoring.ScoringContractError as exc:
        raise CorrectionError("private case scoreability evidence is invalid") from exc
    if recomputed_scoreability != manifest["scoreabilityFingerprint"]:
        raise CorrectionError("private case scoreability fingerprint differs from manifest")
    fold_training_fingerprints = manifest["foldTrainingPopulationFingerprints"]
    expected_fold_origins = {
        str(origin)
        for origin in contract.base_spec["origins"]["forwardValidation"]["scoreOrigins"]
    }
    if (
        not isinstance(fold_training_fingerprints, Mapping)
        or set(fold_training_fingerprints) != expected_fold_origins
        or any(
            not SHA256_PATTERN.fullmatch(str(value))
            for value in fold_training_fingerprints.values()
        )
    ):
        raise CorrectionError("private manifest fold-training fingerprints are invalid")
    if _fold_training_population_fingerprints(
        reconstructed_rows, contract.base_spec
    ) != dict(fold_training_fingerprints):
        raise CorrectionError("private fold-training population differs from manifest")
    rows_by_role: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in reconstructed_rows:
        rows_by_role[str(row["_residual_case_role"])].append(row)
    allowed_roles = {
        "development_warmup_interval_calibration",
        "development_fold_training_seed",
        "development_long_horizon_audit",
    } | {
        f"development_forward_score:{origin}"
        for origin in contract.base_spec["origins"]["forwardValidation"]["scoreOrigins"]
    }
    if set(rows_by_role).difference(allowed_roles):
        raise CorrectionError("private case evidence contains an unknown prediction role")
    expected_models_by_role = {
        "development_fold_training_seed": {"B0b"},
    }
    for role, role_rows in rows_by_role.items():
        expected_models = expected_models_by_role.get(role, set(BASELINE_IDS))
        if {str(row["model_id"]) for row in role_rows} != expected_models:
            raise CorrectionError("private case role has an incomplete model population")
    locks = manifest["predictionLockFingerprints"]
    if not isinstance(locks, Mapping):
        raise CorrectionError("private manifest prediction locks are invalid")
    required_lock_fields = {
        "warmup",
        "developmentTrainingSeed",
        "forwardCombined",
        "forwardByScoreOrigin",
        "longAudit",
    }
    if set(locks) != required_lock_fields:
        raise CorrectionError("private manifest prediction lock set differs from contract")
    forward_by_origin = locks["forwardByScoreOrigin"]
    expected_origins = expected_fold_origins
    if not isinstance(forward_by_origin, Mapping) or set(forward_by_origin) != expected_origins:
        raise CorrectionError("private manifest forward lock origins differ from contract")
    lock_values = [
        locks["warmup"],
        locks["developmentTrainingSeed"],
        locks["forwardCombined"],
        locks["longAudit"],
        *forward_by_origin.values(),
    ]
    if any(not SHA256_PATTERN.fullmatch(str(value)) for value in lock_values):
        raise CorrectionError("private manifest contains an invalid prediction lock digest")

    def role_fingerprint(role: str) -> str:
        try:
            return scoring.prediction_fingerprint(
                rows_by_role.get(role, []), contract, allow_outcome_projection=True
            )
        except scoring.ScoringContractError as exc:
            raise CorrectionError(
                f"private prediction evidence is invalid for role: {role}"
            ) from exc

    recomputed_locks = {
        "warmup": role_fingerprint("development_warmup_interval_calibration"),
        "developmentTrainingSeed": role_fingerprint(
            "development_fold_training_seed"
        ),
        "forwardByScoreOrigin": {
            origin: role_fingerprint(f"development_forward_score:{origin}")
            for origin in sorted(expected_origins)
        },
        "longAudit": role_fingerprint("development_long_horizon_audit"),
    }
    forward_rows = [
        row
        for origin in sorted(expected_origins)
        for row in rows_by_role.get(f"development_forward_score:{origin}", [])
    ]
    try:
        recomputed_locks["forwardCombined"] = scoring.prediction_fingerprint(
            forward_rows, contract, allow_outcome_projection=True
        )
    except scoring.ScoringContractError as exc:
        raise CorrectionError("private combined forward prediction evidence is invalid") from exc
    if recomputed_locks != locks:
        raise CorrectionError("private case prediction locks differ from manifest")

    allowed_reports = public_report_paths or {
        path.relative_to(ROOT).as_posix(): path for path in PUBLIC_REPORT_PATHS
    }
    report_digests = manifest["publicReportSha256"]
    if not isinstance(report_digests, Mapping) or set(report_digests) != set(allowed_reports):
        raise CorrectionError("private manifest public report set differs from contract")
    for relative, path in allowed_reports.items():
        expected = report_digests[relative]
        if not SHA256_PATTERN.fullmatch(str(expected)):
            raise CorrectionError("private manifest has an invalid public report digest")
        if hashlib.sha256(path.read_bytes()).hexdigest() != str(expected):
            raise CorrectionError("public report digest differs from private manifest")
    return {
        "privateCaseRowCount": actual_count,
        "caseEvidenceSha256": actual_digest.hexdigest(),
        "manifestEvidenceBound": expected_bindings is not None,
        "trustedBindingsVerified": expected_bindings is not None,
        "predictionLocksRecomputedFromCases": True,
        "scoreabilityFingerprintRecomputedFromCases": True,
        "foldTrainingFingerprintsRecomputedFromCases": True,
        "codeCommitBytesVerified": True,
        "allPublicReportDigestsVerified": True,
        "manifestRoundTripVerified": True,
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
    perturbed["channels"][0]["batch_cluster_sizes"]["2025-01"] = 999
    perturbed["channels"].append(
        {
            "channel_key": "SYNTHETIC-FUTURE-ONLY",
            "business_form": "synthetic",
            "first_observed_month": "2025-01",
            "monthly": {"2025-01": 888888888.0},
            "batch_cluster_sizes": {"2025-01": 888},
        }
    )
    checks = {}
    for model in BASELINE_IDS:
        role = "prefit_development_template" if model == "B0b" else None
        before = _raw_prediction(work, "2020-12", 12, model, contract.base_spec, role)
        after = _raw_prediction(perturbed, "2020-12", 12, model, contract.base_spec, role)
        checks[model] = before == after

    score_origin = str(
        contract.base_spec["origins"]["forwardValidation"]["scoreOrigins"][0]
    )
    fold = next(
        item
        for item in contract.base_spec["origins"]["forwardValidation"]["folds"]
        if str(item["scoreOrigin"]) == score_origin
    )
    horizon = int(fold["testHorizons"][0])
    target_months = {
        calibration.add_months(score_origin, offset): float(offset * 3)
        for offset in range(1, horizon + 1)
    }
    runner_work = copy.deepcopy(work)
    runner_work["channels"][0]["monthly"].update(target_months)
    runner_perturbed = copy.deepcopy(runner_work)
    perturb_month = calibration.add_months(score_origin, 1)
    runner_perturbed["channels"][0]["monthly"][perturb_month] = 987654321.0
    prediction_rows = [
        {
            "model_id": model,
            "case_key": {
                "standard_work_id": runner_work["standard_work_id"],
                "origin": score_origin,
                "horizon_months": horizon,
                "route": "pure_sales_share",
            },
            "point_forecast": float(10 + index),
            "annual_breakdown": [],
            "confidence": "low",
            "limitation": [],
        }
        for index, model in enumerate(BASELINE_IDS)
    ]
    control_events: list[dict[str, Any]] = []
    perturbed_events: list[dict[str, Any]] = []
    control_joined, control_receipt, control_lock = _materialize_annotate_lock_join(
        prediction_rows,
        [runner_work],
        contract.base_spec,
        contract,
        role=f"development_forward_score:{score_origin}",
        b0b_role="development_forward_fold",
        score_origin=score_origin,
        event_log=control_events,
        event_scope=score_origin,
    )
    perturbed_joined, perturbed_receipt, perturbed_lock = (
        _materialize_annotate_lock_join(
            prediction_rows,
            [runner_perturbed],
            contract.base_spec,
            contract,
            role=f"development_forward_score:{score_origin}",
            b0b_role="development_forward_fold",
            score_origin=score_origin,
            event_log=perturbed_events,
            event_scope=score_origin,
        )
    )
    state_fields = (
        "statisticallyScoreable",
        "scoreabilityReason",
        "modelPredictionAvailable",
        "businessServingEligible",
        "abstained",
        "abstentionReason",
    )
    control_states = [
        (str(row["model_id"]), *(row.get(field) for field in state_fields))
        for row in control_joined
    ]
    perturbed_states = [
        (str(row["model_id"]), *(row.get(field) for field in state_fields))
        for row in perturbed_joined
    ]
    actual_changed = {
        str(row["model_id"]): row.get("actual") for row in control_joined
    } != {
        str(row["model_id"]): row.get("actual") for row in perturbed_joined
    }
    expected_join_events = [
        "held_prediction_lock_created",
        "held_truth_join_complete",
    ]

    availability_probe = {
        "case_key": {
            "standard_work_id": "SYNTHETIC-AVAILABILITY",
            "origin": "2019-06",
            "horizon_months": 3,
            "route": "pure_sales_share",
        },
        "target_end": "2019-09",
        "label_available_as_of": "2019-09",
        "_bill_month_max": "2019-09",
        "_available_as_of": "2019-09",
        "actual": 1.0,
    }
    availability_checks = {}
    for field in (
        "target_end",
        "label_available_as_of",
        "_bill_month_max",
        "_available_as_of",
    ):
        candidate = copy.deepcopy(availability_probe)
        candidate[field] = "2021-01"
        availability_checks[field] = not _fold_training_row_available(
            candidate, "2020-12"
        )
    origin_candidate = copy.deepcopy(availability_probe)
    origin_candidate["case_key"]["origin"] = "2020-12"
    availability_checks["origin"] = not _fold_training_row_available(
        origin_candidate, "2020-12"
    )

    join_called = False
    sealed_cases = (
        ("development_forward_score:2023-06", "2023-06", "2023-06", 3),
        ("development_forward_score:2025-06", "2025-06", "2025-06", 3),
        ("development_long_horizon_audit", None, "2019-06", 60),
    )
    sealed_rejected = []
    original_join_truth = legacy.join_truth

    def forbidden_join(*_args: Any, **_kwargs: Any) -> Any:
        nonlocal join_called
        join_called = True
        raise AssertionError("sealed truth join reached the truth builder")

    legacy.join_truth = forbidden_join
    try:
        for sealed_role, sealed_origin_binding, origin, sealed_horizon in sealed_cases:
            sealed_predictions = copy.deepcopy(prediction_rows)
            for row in sealed_predictions:
                row["case_key"]["origin"] = origin
                row["case_key"]["horizon_months"] = sealed_horizon
            sealed_annotated = annotate_rows(
                sealed_predictions,
                [runner_work],
                contract,
                role=sealed_role,
            )
            sealed_lock = scoring.lock_prediction_population(
                sealed_annotated,
                role=sealed_role,
                score_origin=sealed_origin_binding,
                contract=contract,
            )
            try:
                _join_truth_after_prediction_lock(
                    sealed_annotated,
                    [runner_work],
                    contract.base_spec,
                    contract,
                    sealed_lock,
                )
            except CorrectionError:
                sealed_rejected.append(True)
            else:
                sealed_rejected.append(False)
    finally:
        legacy.join_truth = original_join_truth

    return {
        "byBaseline": checks,
        "allInvariant": all(checks.values())
        and control_lock["predictionFingerprint"]
        == perturbed_lock["predictionFingerprint"]
        and control_states == perturbed_states
        and actual_changed
        and [event["event"] for event in control_events] == expected_join_events
        and [event["event"] for event in perturbed_events] == expected_join_events
        and all(availability_checks.values())
        and all(sealed_rejected)
        and not join_called,
        "futureFactBoundary": "bill_month_greater_than_origin",
        "futureOnlyChannelAndBatchMetadataPerturbed": True,
        "runnerPredictionFingerprintInvariant": (
            control_lock["predictionFingerprint"]
            == perturbed_lock["predictionFingerprint"]
        ),
        "runnerCaseStatesInvariant": control_states == perturbed_states,
        "runnerTruthOutcomeChanged": actual_changed,
        "runnerControlLockReceipt": {
            "scoreOrigin": control_receipt.get("scoreOrigin"),
            "predictionLockCreatedBeforeTruthJoin": control_receipt.get(
                "predictionLockCreatedBeforeTruthJoin"
            ),
            "eventOrder": [event["event"] for event in control_events],
        },
        "runnerPerturbedLockReceipt": {
            "scoreOrigin": perturbed_receipt.get("scoreOrigin"),
            "predictionLockCreatedBeforeTruthJoin": perturbed_receipt.get(
                "predictionLockCreatedBeforeTruthJoin"
            ),
            "eventOrder": [event["event"] for event in perturbed_events],
        },
        "canonicalAvailabilityBoundaryChecks": availability_checks,
        "sealedTruthJoinCasesRejectedBeforeTruthBuilder": all(sealed_rejected),
        "sealedTruthBuilderCalled": join_called,
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
        "runnerPredictionLockTruthOrder": bool(
            future["runnerControlLockReceipt"]["eventOrder"]
            == ["held_prediction_lock_created", "held_truth_join_complete"]
        ),
        "runnerFutureTruthPerturbationInvariant": bool(
            future["runnerPredictionFingerprintInvariant"]
            and future["runnerCaseStatesInvariant"]
            and future["runnerTruthOutcomeChanged"]
        ),
        "canonicalFoldAvailabilityBoundaries": all(
            future["canonicalAvailabilityBoundaryChecks"].values()
        ),
        "sealedTruthJoinGuard": bool(
            future["sealedTruthJoinCasesRejectedBeforeTruthBuilder"]
            and not future["sealedTruthBuilderCalled"]
        ),
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
    code_commit = legacy.latest_exact_commit(CORRECTION_CODE_PATHS)
    synthetic = preflight(contract)
    spec = contract.base_spec
    artifact_with_bound, artifact_path = legacy.load_and_validate_fitted_artifact(spec)
    replay_spec = artifact_with_bound.pop("_boundSpec")
    works, posthoc, input_evidence = legacy.load_authorized_works(spec)
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

    progress("locking warmup predictions before warmup truth join")
    raw_warmup, raw_warmup_materialization = materialize_raw_predictions(
        _flatten_predictions(warmup_predictions),
        works,
        spec,
        b0b_role="interval_warmup_cold_start",
    )
    annotated_warmup = annotate_rows(
        raw_warmup,
        works,
        contract,
        role="development_warmup_interval_calibration",
    )
    warmup_prediction_lock = scoring.create_prediction_lock(
        annotated_warmup,
        "development_warmup_interval_calibration",
        contract,
    )
    legacy_warmup_rows = legacy.join_truth(warmup_predictions, works, spec)
    warmup_rows, warmup_join_receipt = _join_truth_after_prediction_lock(
        annotated_warmup,
        works,
        spec,
        contract,
        warmup_prediction_lock,
    )
    raw_warmup_lock = {
        **raw_warmup_materialization,
        **warmup_prediction_lock,
        **warmup_join_receipt,
    }
    warmup_evidence = legacy.complete_interval_warmup_evidence(
        legacy_warmup_rows, warmup_locks, spec
    )
    warmup_availability = legacy.interval_warmup_availability_evidence(
        warmup_evidence, spec
    )
    progress("replaying forward folds as prior-truth fit -> held lock -> held truth")
    forward_rows_legacy, development_b0b_truth, raw_forward_lock = (
        _ordered_forward_replay_with_prediction_locks(
            development_predictions, works, spec, contract
        )
    )
    recomputed_fit = legacy.b0b_fit_evidence(development_b0b_truth, spec)
    recomputed_fit["intervalWarmup"] = warmup_evidence["B0b"]
    legacy.validate_recomputed_b0b_fit(
        artifact_with_bound, recomputed_fit, input_evidence
    )
    legacy.validate_artifact_case_fingerprint(
        artifact_with_bound, legacy.numeric_b0b_fit_rows(development_b0b_truth)
    )
    if digest(raw_forward_lock["foldFactors"]) != digest(recomputed_fit["foldFactors"]):
        raise CorrectionError("pre-truth B0b fold factors differ from recomputed fit evidence")
    if {
        key: calibration.fixed_decimal(value)
        for key, value in raw_forward_lock["_oofPredictionByKey"].items()
    } != {
        key: calibration.fixed_decimal(value)
        for key, value in recomputed_fit["oofPredictionByKey"].items()
    }:
        raise CorrectionError("pre-truth B0b OOF predictions differ after truth join")
    raw_forward_lock.pop("_oofPredictionByKey", None)
    legacy.attach_b0b_oof_comparison_points(development_b0b_truth, recomputed_fit)
    legacy.attach_strata(forward_rows_legacy, works, posthoc)
    forward_rows_legacy, legacy_forward_parity = legacy.exact_forward_score_rows(
        forward_rows_legacy, spec, recomputed_fit
    )
    legacy.attach_strata(warmup_rows, works, posthoc)
    forward_rows = forward_rows_legacy
    apply_corrected_internal_intervals(
        forward_rows, [*warmup_rows, *forward_rows], spec
    )

    progress("locking development-safe long-horizon predictions before long truth")
    long_included, long_deferred = legacy.long_audit_origins(
        spec, development_safe_only=True
    )
    long_predictions = legacy.generate_predictions(
        works,
        long_included,
        replay_spec,
        b0b_parameter_role="committed_development_fit",
    )
    if any(long_included.values()):
        long_rows, raw_long_lock, _long_prediction_lock = (
            _materialize_annotate_lock_join(
                _flatten_predictions(long_predictions),
                works,
                replay_spec,
                contract,
                role="development_long_horizon_audit",
                b0b_role="committed_development_fit",
            )
        )
    else:
        long_rows = []
        raw_long_lock = {
            "role": "development_long_horizon_audit",
            "predictionRowCount": 0,
            "predictionLockedBeforeScoringTruthAccess": True,
            "truthJoinSkippedBecausePopulationEmpty": True,
        }
    legacy.attach_strata(long_rows, works, posthoc)
    apply_corrected_internal_intervals(
        long_rows, [*warmup_rows, *forward_rows], spec
    )
    long_eligible = [
        row for row in long_rows if legacy.long_horizon_cohort_eligible(row, spec)
    ]

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

    progress("loading the verified historical model cache after every prediction lock")
    model_inputs = load_verified_model_inputs()
    progress("building fixed-key B0a-to-B0b attribution bridge")
    attribution_internal = attribution.build_attribution_report(
        works, forward_rows, model_inputs, spec, contract.amendment
    )
    legacy_b0b_rows = [
        row for row in forward_rows_legacy if row.get("model_id") == "B0b"
    ]
    legacy_mixed_score = legacy.metric_score(legacy_b0b_rows)
    historical_mixed_audit = {
        "classification": "historical_business_coverage_mixture_not_model_wape",
        "coverageAwareNullToZeroWape": legacy_mixed_score["populations"][
            "coverageAwareOverall"
        ]["wape"],
        "coverageAwareNullToZeroSignedBias": legacy_mixed_score["populations"][
            "coverageAwareOverall"
        ]["signedAggregateBias"],
        "legacyForecastableNumericWape": legacy_mixed_score["populations"][
            "forecastableNumeric"
        ]["wape"],
        "legacyForecastableNumericSignedBias": legacy_mixed_score["populations"][
            "forecastableNumeric"
        ]["signedAggregateBias"],
        "legacyHighValueNullToZeroWape": legacy_mixed_score["populations"][
            "highValueAll"
        ]["wape"],
        "legacyHighValueNullToZeroSignedBias": legacy_mixed_score["populations"][
            "highValueAll"
        ]["signedAggregateBias"],
        "forecastableRevenueCoverage": legacy_mixed_score[
            "forecastableRevenueCoverage"
        ],
        "top10ForecastableRevenueCoverage": legacy_mixed_score[
            "top10ForecastableRevenueCoverage"
        ],
        "nullPredictionEvaluationValue": 0.0,
        "mayBeNamedModelWape": False,
        "selectionUseAllowed": False,
    }
    stages = {str(stage["stage"]): stage for stage in attribution_internal["stages"]}
    attribution_interpretation = {
        "historicalB0aWape": stages["1"]["servedCohortMetrics"]["wape"],
        "historicalMixedApproximately132Percent": historical_mixed_audit[
            "coverageAwareNullToZeroWape"
        ],
        "fixedKeyLegacyModelWape": stages["2"]["allScoreableModelMetrics"][
            "wape"
        ],
        "asOfSafeLegacyModelWape": stages["4"]["allScoreableModelMetrics"][
            "wape"
        ],
        "completeB0bWape": stages["7"]["allScoreableModelMetrics"]["wape"],
        "asOfQuantilePriorAndFeatureDelta": rounded(
            float(stages["4"]["allScoreableModelMetrics"]["wape"])
            - float(stages["2"]["allScoreableModelMetrics"]["wape"])
        ),
        "eligibilityAndAbstentionRawModelWapeDelta": rounded(
            float(stages["6"]["allScoreableModelMetrics"]["wape"])
            - float(stages["4"]["allScoreableModelMetrics"]["wape"])
        ),
        "legacyModelToCompleteB0bFormulaDelta": rounded(
            float(stages["7"]["allScoreableModelMetrics"]["wape"])
            - float(stages["6"]["allScoreableModelMetrics"]["wape"])
        ),
        "conclusionZh": (
            "旧约132%来自把未服务null按0混入全量业务覆盖人口，不能称模型WAPE；"
            "在Stage2至7固定keys后，as-of量化与特征使WAPE小幅下降，"
            "主要恶化来自旧selector切换为完整B0b公式，而不是eligibility或abstention计分。"
        ),
    }
    attribution_internal["historicalMixedScoringAudit"] = historical_mixed_audit
    attribution_internal["differenceAttributionConclusion"] = attribution_interpretation
    minimum_public_cell = int(
        spec["reporting"]["committableAggregateReport"]["minimumCellCount"]
    )
    attribution_report = sanitize_attribution_report(
        attribution_internal, minimum_public_cell
    )
    public_bootstrap = copy.deepcopy(bootstrap)
    public_bootstrap["clusterKeys"] = ["work_cluster", "origin_cluster"]
    public_bootstrap["population"] = "allScoreable_exact_key_parity"
    public_bootstrap["referenceBaseline"] = provisional_best
    for comparison in public_bootstrap.get("comparisons", {}).values():
        if "deltaWapeVsLockedComparatorMedian" in comparison:
            comparison["deltaWapeVsProvisionalBestMedian"] = comparison.pop(
                "deltaWapeVsLockedComparatorMedian"
            )

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
        "pairedTwoWayBlockBootstrap": public_bootstrap,
        "preC1Gates": gates,
        "rawPredictionLocks": {
            **public_prediction_lock_evidence(
                raw_warmup_lock, raw_forward_lock, raw_long_lock
            )
        },
        "B0aHistoricalAuditOnly": attribution_report["stages"][0],
        "historicalMixedScoringAudit": historical_mixed_audit,
        "differenceAttributionConclusion": attribution_interpretation,
        "B0aToB0bAttributionSummary": {
            "stageCount": len(attribution_report["stages"]),
            "fixedStage2To7Population": attribution_report["integrity"],
            "selectionUseAllowed": False,
        },
        "longHorizonAudit": {
            "maySelectModelOrThreshold": False,
            "included36MonthOriginCount": f"<{minimum_public_cell}",
            "deferred36MonthOriginCount": f"<{minimum_public_cell}",
            "deferred60MonthOriginCount": f"<{minimum_public_cell}",
            "originCountValuesSuppressed": True,
            "originListsRemainFrozenInMachineReadableSpec": True,
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
                    "postHocSegmentAssignmentsIdentical",
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
            "predictionLockBeforeTruthJoinVerified": bool(
                raw_warmup_lock.get("predictionLockCreatedBeforeTruthJoin")
                and raw_forward_lock.get("predictionLockedBeforeScoringTruthAccess")
                and all(
                    item.get("lock", {}).get(
                        "predictionLockCreatedBeforeTruthJoin"
                    )
                    for item in raw_forward_lock.get("folds", [])
                )
                and raw_long_lock.get(
                    "predictionLockCreatedBeforeTruthJoin",
                    raw_long_lock.get("truthJoinSkippedBecausePopulationEmpty", False),
                )
            ),
            "sealedTruthJoinGuardPassed": synthetic["checks"][
                "sealedTruthJoinGuard"
            ],
            "forwardEventOrderDerivedFromTrace": bool(
                raw_forward_lock.get("predictionLockedBeforeScoringTruthAccess")
            ),
            "sameOrFutureFoldTruthUsedForCurrentPrediction": raw_forward_lock.get(
                "sameOrFutureFoldTruthUsedForCurrentPrediction"
            ),
            "scoreabilityFingerprint": parity["scoreabilityFingerprint"],
            "predictionFingerprint": parity["contractPredictionFingerprint"],
            "postHocSegmentFingerprint": parity["postHocSegmentFingerprint"],
            "caseIidBootstrapUsed": False,
            "bootstrapClusters": ["work_cluster", "origin_cluster"],
            "currentStatusPostHocOnly": True,
            "blockedOrAbstainedZeroImputedIntoModelWape": False,
        },
        "seals": {
            "candidateTrainingStarted": False,
            "C1Started": False,
            "finalHoldoutOpened": final_holdout_opened,
            "finalHoldoutTruthRead": False,
            "finalHoldoutTruthReadDefinition": (
                "no_final_holdout_case_window_materialized_joined_or_used"
            ),
            "authorizedAuthorityFactsLoadedThroughLatestCompleteMonth": True,
            "authorityFactLoadingAloneDoesNotOpenHoldout": True,
            "finalHoldoutTruthWindowConstructedOrJoined": False,
            "finalHoldoutUsedForFitSelectionOrThresholds": False,
            "embargoShadowOpened": False,
            "embargoShadowTruthRead": False,
            "embargoTruthWindowConstructedOrJoined": False,
            "embargoUsedForFitSelectionOrThresholds": False,
            "deferred60MonthLabelsOpened": False,
            "deferred60MonthTruthWindowConstructedOrJoined": False,
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
        "historicalMixedScoringAudit": historical_mixed_audit,
        "differenceAttributionConclusion": attribution_interpretation,
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
    write_public_markdown(BASELINE_MD, baseline_markdown(baseline_report))
    write_json(CORRECTION_JSON, correction_report)
    write_public_markdown(CORRECTION_MD, correction_markdown(correction_report))
    write_json(ATTRIBUTION_JSON, attribution_report)
    write_public_markdown(ATTRIBUTION_MD, attribution_markdown(attribution_report))
    private_seed_rows = [
        row
        for row in development_b0b_truth
        if row.get("_residual_case_role") == "development_fold_training_seed"
    ]
    private_evidence_rows = [
        *warmup_rows,
        *private_seed_rows,
        *forward_rows,
        *long_rows,
    ]
    private_fold_training_fingerprints = _fold_training_population_fingerprints(
        private_evidence_rows, spec
    )
    runtime_fold_training_fingerprints = {
        str(item["scoreOrigin"]): str(item["fit"]["trainingPopulationFingerprint"])
        for item in raw_forward_lock.get("folds", [])
    }
    if runtime_fold_training_fingerprints != private_fold_training_fingerprints:
        raise CorrectionError(
            "private evidence does not reproduce the runtime fold-training population"
        )
    empty_prediction_fingerprint = scoring.prediction_fingerprint(
        [], contract, allow_outcome_projection=True
    )
    private = write_private_evidence(
        private_evidence_rows,
        {
            "schema": "m2.calibration-baseline-replay.private-manifest.v1_1",
            "decisionStatus": "not_for_formal_decision",
            "baseSpecDigest": contract.base_digest,
            "amendmentDigest": contract.amendment_digest,
            "combinedContractDigest": contract.combined_digest,
            "correctionCodeCommit": code_commit,
            "inputFingerprint": input_evidence["inputFingerprint"],
            "fittedArtifactSha256": hashlib.sha256(artifact_path.read_bytes()).hexdigest(),
            "scoreabilityFingerprint": scoring.scoreability_fingerprint(
                private_evidence_rows, contract
            ),
            "foldTrainingPopulationFingerprints": (
                private_fold_training_fingerprints
            ),
            "predictionLockFingerprints": {
                "warmup": raw_warmup_lock.get("predictionFingerprint"),
                "developmentTrainingSeed": raw_forward_lock.get(
                    "trainingSeed", {}
                ).get("predictionFingerprint"),
                "forwardCombined": raw_forward_lock.get(
                    "combinedPredictionFingerprint"
                ),
                "forwardByScoreOrigin": {
                    str(item["scoreOrigin"]): item["lock"].get(
                        "predictionFingerprint"
                    )
                    for item in raw_forward_lock.get("folds", [])
                },
                "longAudit": raw_long_lock.get(
                    "predictionFingerprint", empty_prediction_fingerprint
                ),
            },
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
        "privateEvidence": {
            "caseEvidenceSha256": private["caseEvidenceSha256"],
            "manifestSha256": private["manifestSha256"],
            "manifestEvidenceBound": private["manifestEvidenceBound"],
            "manifestRoundTripVerified": private["manifestRoundTripVerified"],
            "tracked": private["tracked"],
        },
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
