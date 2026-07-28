#!/usr/bin/env python3
"""Training-side publishing-scale support study.

The study uses only v2.2-restated strict packed rows.  It holds out complete
standard-work clusters, preserves validation-origin chronology, normalizes
training weights by work, and publishes aggregates only.  It never opens a
candidate outer result, sealed holdout, provider, database, or production
surface.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import statistics
import unicodedata
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

import numpy as np


FEATURE_ORDER = (
    "log_recent_1_positive",
    "log_recent_3_positive",
    "log_recent_12_positive",
    "log_cumulative_positive",
    "positive_rate_3",
    "positive_rate_12",
    "log_recent_3_vs_previous_3",
    "previous_3_available",
    "log_positive_volatility_12",
    "months_since_last_positive_scaled",
    "log_historical_peak_positive",
    "months_since_peak_scaled",
    "log_observed_channel_age",
    "log_observed_work_age",
    "trailing_12_work_share",
    "channel_rank_percentile",
    "available_month_fraction_3",
    "available_month_fraction_12",
)
MECHANISMS = ("membership", "advertising", "transactional")
VALIDATION_ORIGINS = ("2024-06", "2024-12", "2025-06")
SUPPORT_GRID = (8, 12, 16, 24, 32, 48, 64, 96, 128)
L2_GRID = (1.0, 3.0, 10.0, 30.0, 100.0, 300.0)
REPLICATES = 5
EPSILON = 1e-12
PLATFORMS = {
    "喜马拉雅": "membership",
    "微信读书": "membership",
    "番茄畅听": "advertising",
    "猫耳": "transactional",
    "克拉漫播": "transactional",
}
CHANNEL_UID_NAMESPACE = "m2-current-channel-uid-v0.1"


@dataclass(frozen=True)
class Event:
    work_id: str
    channel_uid: str
    mechanism: str
    source_origin: str
    future_month: str
    future_month_index: int
    label_available_as_of: str
    features: tuple[float, ...]
    actual: float


@dataclass
class FittedModel:
    occurrence: np.ndarray | None
    occurrence_constant: float | None
    amount: np.ndarray
    smearing: float
    means: np.ndarray
    standard_deviations: np.ndarray
    basis_profile: str
    mechanism: str
    occurrence_converged: bool
    occurrence_iterations: int
    parameter_count: int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output-directory", type=Path, required=True)
    return parser.parse_args()


def fnv_fold(value: str, count: int) -> int:
    hashed = 2166136261
    for character in str(value):
        hashed ^= ord(character)
        hashed = (hashed * 16777619) & 0xFFFFFFFF
    return hashed % count


def stable_rank(value: str, salt: str) -> str:
    return hashlib.sha256(f"{salt}\x1f{value}".encode()).hexdigest()


def canonical_channel_uid(name: str) -> str:
    normalized = unicodedata.normalize("NFKC", name).lower()
    value = hashlib.sha256(
        f"{CHANNEL_UID_NAMESPACE}\x1f{normalized}".encode()
    ).hexdigest()[:20]
    return f"chn_{value}"


def quantiles(values: Sequence[float]) -> dict[str, float | None]:
    if not values:
        return {
            "minimum": None,
            "p25": None,
            "median": None,
            "p75": None,
            "maximum": None,
        }
    array = np.asarray(values, dtype=float)
    return {
        "minimum": float(np.min(array)),
        "p25": float(np.quantile(array, 0.25)),
        "median": float(np.median(array)),
        "p75": float(np.quantile(array, 0.75)),
        "maximum": float(np.max(array)),
    }


def safe_mean(values: Iterable[float]) -> float | None:
    clean = [float(value) for value in values if math.isfinite(float(value))]
    return statistics.fmean(clean) if clean else None


def load_events(
    input_path: Path,
) -> tuple[
    dict[str, dict[str, list[Event]]],
    dict[str, dict[str, list[Event]]],
]:
    training_candidates: dict[
        str,
        dict[str, dict[tuple[str, str, str], Event]],
    ] = {
        origin: {mechanism: {} for mechanism in MECHANISMS}
        for origin in VALIDATION_ORIGINS
    }
    validation: dict[str, dict[str, list[Event]]] = {
        origin: {mechanism: [] for mechanism in MECHANISMS}
        for origin in VALIDATION_ORIGINS
    }
    with input_path.open("r", encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            packed = json.loads(line)
            mechanism = str(packed.get("mechanism"))
            if mechanism not in MECHANISMS:
                continue
            if not bool(packed.get("observedAtOrigin")):
                continue
            work_id = str(packed["standardWorkId"])
            channel_uid = str(packed["channelUid"])
            source_origin = str(packed["origin"])
            features = tuple(
                float(packed["features"][field])
                for field in FEATURE_ORDER
            )
            for label in packed["futureMonthlyLabels"]:
                event = Event(
                    work_id=work_id,
                    channel_uid=channel_uid,
                    mechanism=mechanism,
                    source_origin=source_origin,
                    future_month=str(label["futureMonth"]),
                    future_month_index=int(label["futureMonthIndex"]),
                    label_available_as_of=str(label["labelAvailableAsOf"]),
                    features=features,
                    actual=max(0.0, float(label["actualPositive"])),
                )
                for validation_origin in VALIDATION_ORIGINS:
                    if source_origin == validation_origin:
                        if fnv_fold(work_id, 5) == 0:
                            validation[validation_origin][mechanism].append(
                                event
                            )
                    elif (
                        source_origin < validation_origin
                        and event.label_available_as_of < validation_origin
                        and fnv_fold(work_id, 5) != 0
                    ):
                        key = (
                            work_id,
                            channel_uid,
                            event.future_month,
                        )
                        current = training_candidates[
                            validation_origin
                        ][mechanism].get(key)
                        if (
                            current is None
                            or current.source_origin < source_origin
                        ):
                            training_candidates[
                                validation_origin
                            ][mechanism][key] = event
    training = {
        origin: {
            mechanism: list(
                training_candidates[origin][mechanism].values()
            )
            for mechanism in MECHANISMS
        }
        for origin in VALIDATION_ORIGINS
    }
    return training, validation


def time_basis(index: int) -> dict[str, float]:
    value = float(index)
    u = value / 36.0
    return {
        "u": u,
        "u_squared": u * u,
        "short": math.exp(-(value - 1.0) / 3.0),
        "short_spike": math.exp(-(value - 1.0) / 3.0),
        "long_tail": math.exp(-(value - 1.0) / 18.0),
    }


def basis_contract(
    mechanism: str,
    profile: str,
) -> tuple[tuple[str, ...], tuple[tuple[str, str], ...]]:
    if profile == "compact":
        return {
            "membership": (("u",), ()),
            "advertising": (("short", "u"), ()),
            "transactional": (("short_spike", "long_tail"), ()),
        }[mechanism]
    if profile != "current":
        raise ValueError("unknown basis profile")
    return {
        "membership": (
            ("u", "u_squared"),
            (
                ("u", "log_recent_12_positive"),
                ("u", "positive_rate_12"),
            ),
        ),
        "advertising": (
            ("short", "u", "u_squared"),
            (
                ("short", "log_recent_3_vs_previous_3"),
                ("short", "log_positive_volatility_12"),
            ),
        ),
        "transactional": (
            ("short_spike", "long_tail"),
            (
                (
                    "short_spike",
                    "months_since_last_positive_scaled",
                ),
                ("long_tail", "log_cumulative_positive"),
            ),
        ),
    }[mechanism]


def work_balanced_weights(events: Sequence[Event]) -> np.ndarray:
    counts: dict[str, int] = defaultdict(int)
    for event in events:
        counts[event.work_id] += 1
    weights = np.asarray(
        [1.0 / counts[event.work_id] for event in events],
        dtype=float,
    )
    return weights / np.sum(weights)


def standardize(
    events: Sequence[Event],
    weights: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    values = np.asarray([event.features for event in events], dtype=float)
    means = np.sum(values * weights[:, None], axis=0)
    variance = np.sum(
        ((values - means) ** 2) * weights[:, None],
        axis=0,
    )
    standard_deviations = np.sqrt(np.maximum(variance, 0.0))
    standard_deviations[standard_deviations == 0] = 1.0
    return means, standard_deviations


def design_matrix(
    events: Sequence[Event],
    means: np.ndarray,
    standard_deviations: np.ndarray,
    mechanism: str,
    profile: str,
) -> np.ndarray:
    raw = np.asarray([event.features for event in events], dtype=float)
    standardized = (raw - means) / standard_deviations
    feature_index = {
        field: index for index, field in enumerate(FEATURE_ORDER)
    }
    base_fields, interactions = basis_contract(mechanism, profile)
    output = [np.ones(len(events), dtype=float)]
    output.extend(standardized[:, index] for index in range(len(FEATURE_ORDER)))
    bases = [time_basis(event.future_month_index) for event in events]
    for field in base_fields:
        output.append(
            np.asarray([basis[field] for basis in bases], dtype=float)
        )
    for time_field, feature_field in interactions:
        output.append(
            np.asarray(
                [basis[time_field] for basis in bases],
                dtype=float,
            )
            * standardized[:, feature_index[feature_field]]
        )
    return np.column_stack(output)


def sigmoid(values: np.ndarray) -> np.ndarray:
    return 1.0 / (1.0 + np.exp(-np.clip(values, -35.0, 35.0)))


def fit_logistic(
    design: np.ndarray,
    labels: np.ndarray,
    weights: np.ndarray,
    l2: float,
) -> tuple[np.ndarray | None, float | None, bool, int]:
    positive = float(np.sum(weights * labels))
    if positive <= EPSILON or positive >= 1.0 - EPSILON:
        effective_rows = max(1.0, 1.0 / float(np.sum(weights**2)))
        constant = (
            positive * effective_rows + 0.5
        ) / (effective_rows + 1.0)
        return None, float(constant), True, 0
    dimension = design.shape[1]
    coefficients = np.zeros(dimension, dtype=float)
    coefficients[0] = math.log(positive / (1.0 - positive))
    penalty = np.eye(dimension, dtype=float)
    penalty[0, 0] = 0.0
    for iteration in range(1, 101):
        probability = sigmoid(design @ coefficients)
        variance = np.maximum(
            probability * (1.0 - probability),
            1e-8,
        )
        adjusted = (
            design @ coefficients
            + (labels - probability) / variance
        )
        combined = weights * variance
        matrix = design.T @ (combined[:, None] * design) + l2 * penalty
        vector = design.T @ (combined * adjusted)
        try:
            proposal = np.linalg.solve(matrix, vector)
        except np.linalg.LinAlgError:
            return coefficients, None, False, iteration
        difference = float(np.max(np.abs(proposal - coefficients)))
        coefficients = proposal
        if difference <= 1e-7:
            return coefficients, None, True, iteration
    return coefficients, None, False, 100


def fit_model(
    events: Sequence[Event],
    mechanism: str,
    basis_profile: str,
    occurrence_l2: float,
    amount_l2: float,
) -> FittedModel | None:
    if len(events) == 0:
        return None
    weights = work_balanced_weights(events)
    means, standard_deviations = standardize(events, weights)
    design = design_matrix(
        events,
        means,
        standard_deviations,
        mechanism,
        basis_profile,
    )
    labels = np.asarray(
        [1.0 if event.actual > 0 else 0.0 for event in events],
        dtype=float,
    )
    occurrence, constant, converged, iterations = fit_logistic(
        design,
        labels,
        weights,
        occurrence_l2,
    )
    positive_indexes = np.where(labels > 0)[0]
    if len(positive_indexes) == 0:
        return None
    positive_events = [events[index] for index in positive_indexes]
    positive_weights = work_balanced_weights(positive_events)
    positive_design = design[positive_indexes]
    targets = np.log1p(
        np.asarray(
            [events[index].actual for index in positive_indexes],
            dtype=float,
        )
    )
    penalty = np.eye(design.shape[1], dtype=float)
    penalty[0, 0] = 0.0
    matrix = (
        positive_design.T
        @ (positive_weights[:, None] * positive_design)
        + amount_l2 * penalty
    )
    vector = positive_design.T @ (positive_weights * targets)
    try:
        amount = np.linalg.solve(matrix, vector)
    except np.linalg.LinAlgError:
        return None
    residuals = targets - positive_design @ amount
    smearing = float(np.sum(positive_weights * np.exp(residuals)))
    return FittedModel(
        occurrence=occurrence,
        occurrence_constant=constant,
        amount=amount,
        smearing=smearing,
        means=means,
        standard_deviations=standard_deviations,
        basis_profile=basis_profile,
        mechanism=mechanism,
        occurrence_converged=converged,
        occurrence_iterations=iterations,
        parameter_count=design.shape[1],
    )


def predict(
    model: FittedModel,
    events: Sequence[Event],
) -> tuple[np.ndarray, np.ndarray, np.ndarray, float]:
    design = design_matrix(
        events,
        model.means,
        model.standard_deviations,
        model.mechanism,
        model.basis_profile,
    )
    if model.occurrence is None:
        probability = np.full(
            len(events),
            float(model.occurrence_constant),
            dtype=float,
        )
    else:
        probability = sigmoid(design @ model.occurrence)
    amount_linear = design @ model.amount
    clipped = np.abs(amount_linear) > 30.0
    conditional = np.maximum(
        0.0,
        np.exp(np.clip(amount_linear, -30.0, 30.0))
        * model.smearing
        - 1.0,
    )
    return (
        probability * conditional,
        probability,
        conditional,
        float(np.mean(clipped)),
    )


def score(
    model: FittedModel,
    validation: Sequence[Event],
) -> tuple[dict[str, float | bool], dict[str, float]]:
    points, probabilities, conditional, clip_rate = predict(
        model,
        validation,
    )
    actual = np.asarray([event.actual for event in validation], dtype=float)
    labels = (actual > 0).astype(float)
    weights = work_balanced_weights(validation)
    clipped = np.clip(probabilities, 1e-9, 1 - 1e-9)
    log_loss = -float(
        np.sum(
            weights
            * (
                labels * np.log(clipped)
                + (1 - labels) * np.log(1 - clipped)
            )
        )
    )
    positive = labels > 0
    if bool(np.any(positive)):
        positive_events = [
            event for event, keep in zip(validation, positive, strict=True)
            if keep
        ]
        positive_weights = work_balanced_weights(positive_events)
        conditional_log_mae = float(
            np.sum(
                positive_weights
                * np.abs(
                    np.log1p(conditional[positive])
                    - np.log1p(actual[positive])
                )
            )
        )
    else:
        conditional_log_mae = math.nan
    actual_by_work: dict[str, float] = defaultdict(float)
    point_by_work: dict[str, float] = defaultdict(float)
    for event, actual_value, point_value in zip(
        validation,
        actual,
        points,
        strict=True,
    ):
        actual_by_work[event.work_id] += float(actual_value)
        point_by_work[event.work_id] += float(point_value)
    denominator = sum(abs(value) for value in actual_by_work.values())
    absolute = sum(
        abs(point_by_work[work] - value)
        for work, value in actual_by_work.items()
    )
    signed = sum(
        point_by_work[work] - value
        for work, value in actual_by_work.items()
    )
    work_totals = {
        work: point_by_work[work]
        for work in sorted(point_by_work)
    }
    return {
        "converged": model.occurrence_converged and clip_rate == 0,
        "conditionalLogClipRate": clip_rate,
        "workTotalWape": absolute / denominator if denominator else math.nan,
        "workTotalSignedBias": signed / denominator if denominator else math.nan,
        "occurrenceLogLoss": log_loss,
        "conditionalLogMae": conditional_log_mae,
        "parameterCount": model.parameter_count,
        "occurrenceIterations": model.occurrence_iterations,
    }, work_totals


def select_works(
    events: Sequence[Event],
    count: int,
    salt: str,
) -> list[str]:
    works = sorted(
        {event.work_id for event in events},
        key=lambda value: stable_rank(value, salt),
    )
    return works[: min(count, len(works))]


def support_profile(events: Sequence[Event]) -> dict[str, float | int]:
    works = sorted({event.work_id for event in events})
    positive_works = sorted(
        {event.work_id for event in events if event.actual > 0}
    )
    cash_by_work: dict[str, float] = defaultdict(float)
    for event in events:
        cash_by_work[event.work_id] += max(0.0, event.actual)
    total = sum(cash_by_work.values())
    hhi = (
        sum((value / total) ** 2 for value in cash_by_work.values())
        if total > 0
        else 1.0
    )
    return {
        "distinctWorks": len(works),
        "positiveDistinctWorks": len(positive_works),
        "monthlyRows": len(events),
        "positiveMonths": sum(event.actual > 0 for event in events),
        "cashHhi": hhi,
        "cashEffectiveWorkCount": 1.0 / hhi if hhi > 0 else 0.0,
    }


def parameter_study(
    training: Mapping[str, Mapping[str, Sequence[Event]]],
    validation: Mapping[str, Mapping[str, Sequence[Event]]],
    mechanisms: Sequence[str] = MECHANISMS,
    basis_profiles: Sequence[str] = ("compact", "current"),
) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    public: dict[str, Any] = {}
    selected: dict[str, dict[str, Any]] = {}
    for mechanism in mechanisms:
        candidates: list[dict[str, Any]] = []
        for profile in basis_profiles:
            occurrence_results: dict[float, list[dict[str, Any]]] = {}
            for occurrence_l2 in L2_GRID:
                metrics: list[dict[str, Any]] = []
                for origin in VALIDATION_ORIGINS:
                    source = training[origin][mechanism]
                    works = select_works(
                        source,
                        min(96, len({row.work_id for row in source})),
                        f"parameter\x1f{mechanism}\x1f{origin}",
                    )
                    work_set = set(works)
                    rows = [
                        row for row in source if row.work_id in work_set
                    ]
                    model = fit_model(
                        rows,
                        mechanism,
                        profile,
                        occurrence_l2,
                        100.0,
                    )
                    if model is None:
                        continue
                    scored, _ = score(
                        model,
                        validation[origin][mechanism],
                    )
                    metrics.append(scored)
                occurrence_results[occurrence_l2] = metrics
            best_occurrence = min(
                occurrence_results,
                key=lambda value: (
                    safe_mean(
                        item["occurrenceLogLoss"]
                        for item in occurrence_results[value]
                    )
                    or math.inf,
                    -value,
                ),
            )
            for amount_l2 in L2_GRID:
                metrics = []
                for origin in VALIDATION_ORIGINS:
                    source = training[origin][mechanism]
                    works = select_works(
                        source,
                        min(96, len({row.work_id for row in source})),
                        f"parameter\x1f{mechanism}\x1f{origin}",
                    )
                    work_set = set(works)
                    rows = [
                        row for row in source if row.work_id in work_set
                    ]
                    model = fit_model(
                        rows,
                        mechanism,
                        profile,
                        best_occurrence,
                        amount_l2,
                    )
                    if model is None:
                        continue
                    scored, _ = score(
                        model,
                        validation[origin][mechanism],
                    )
                    metrics.append(scored)
                candidates.append({
                    "basisProfile": profile,
                    "occurrenceL2": best_occurrence,
                    "conditionalAmountL2": amount_l2,
                    "originCount": len(metrics),
                    "convergenceRate": safe_mean(
                        float(item["converged"]) for item in metrics
                    ),
                    "medianMetrics": {
                        field: (
                            float(
                                np.median(
                                    [
                                        item[field] for item in metrics
                                        if math.isfinite(
                                            float(item[field])
                                        )
                                    ]
                                )
                            )
                            if any(
                                math.isfinite(float(item[field]))
                                for item in metrics
                            )
                            else None
                        )
                        for field in (
                            "workTotalWape",
                            "workTotalSignedBias",
                            "occurrenceLogLoss",
                            "conditionalLogMae",
                        )
                    },
                    "parameterCount": (
                        metrics[0]["parameterCount"] if metrics else None
                    ),
                })
        ranked = sorted(
            candidates,
            key=lambda item: (
                -float(item["convergenceRate"] or 0),
                float(
                    item["medianMetrics"]["occurrenceLogLoss"]
                    if item["medianMetrics"]["occurrenceLogLoss"] is not None
                    else math.inf
                ),
                float(
                    item["medianMetrics"]["conditionalLogMae"]
                    if item["medianMetrics"]["conditionalLogMae"] is not None
                    else math.inf
                ),
                float(
                    item["medianMetrics"]["workTotalWape"]
                    if item["medianMetrics"]["workTotalWape"] is not None
                    else math.inf
                ),
                int(item["parameterCount"] or 10_000),
                -float(item["occurrenceL2"]),
                -float(item["conditionalAmountL2"]),
            ),
        )
        winner = ranked[0]
        selected[mechanism] = {
            "basisProfile": winner["basisProfile"],
            "occurrenceL2": winner["occurrenceL2"],
            "conditionalAmountL2": winner["conditionalAmountL2"],
            "parameterCount": winner["parameterCount"],
        }
        public[mechanism] = {
            "candidateCount": len(candidates),
            "selected": selected[mechanism],
            "selectedTrainingSideMetrics": winner["medianMetrics"],
            "selectedConvergenceRate": winner["convergenceRate"],
            "runnerUp": ranked[1] if len(ranked) > 1 else None,
        }
    return public, selected


def global_pooled_parent_study(
    training: Mapping[str, Mapping[str, Sequence[Event]]],
    validation: Mapping[str, Mapping[str, Sequence[Event]]],
    selected: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
    pooled_training = {
        origin: {
            mechanism: (
                [
                    event
                    for candidate in MECHANISMS
                    for event in training[origin][candidate]
                ]
                if mechanism == "membership"
                else []
            )
            for mechanism in MECHANISMS
        }
        for origin in VALIDATION_ORIGINS
    }
    pooled_validation = {
        origin: {
            mechanism: (
                [
                    event
                    for candidate in MECHANISMS
                    for event in validation[origin][candidate]
                ]
                if mechanism == "membership"
                else []
            )
            for mechanism in MECHANISMS
        }
        for origin in VALIDATION_ORIGINS
    }
    parameter_results, pooled_selected = parameter_study(
        pooled_training,
        pooled_validation,
        mechanisms=("membership",),
        basis_profiles=("compact",),
    )
    selected_for_helpers = {
        **selected,
        "membership": pooled_selected["membership"],
    }
    curves = learning_curves(
        pooled_training,
        pooled_validation,
        selected_for_helpers,
    )
    loo = leave_one_work_out(
        pooled_training,
        pooled_validation,
        selected_for_helpers,
    )
    return {
        "designInterpretation": (
            "common compact time basis with all mechanism rows pooled; "
            "mechanism children are estimated separately and shrunk to it"
        ),
        "parameterCalibration": parameter_results["membership"],
        "learningCurve": curves["membership"],
        "leaveOneWorkOut": loo["membership"],
        "population": {
            origin: {
                "training": support_profile(
                    pooled_training[origin]["membership"]
                ),
                "validation": support_profile(
                    pooled_validation[origin]["membership"]
                ),
            }
            for origin in VALIDATION_ORIGINS
        },
    }


def learning_curves(
    training: Mapping[str, Mapping[str, Sequence[Event]]],
    validation: Mapping[str, Mapping[str, Sequence[Event]]],
    selected: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for mechanism in MECHANISMS:
        points: list[dict[str, Any]] = []
        parameters = selected[mechanism]
        for support in SUPPORT_GRID:
            runs: list[dict[str, Any]] = []
            coefficient_vectors: list[np.ndarray] = []
            predictions_by_origin: dict[
                str,
                list[dict[str, float]],
            ] = defaultdict(list)
            for origin in VALIDATION_ORIGINS:
                source = training[origin][mechanism]
                if not validation[origin][mechanism]:
                    continue
                available = len({row.work_id for row in source})
                if support > available:
                    continue
                for replicate in range(REPLICATES):
                    works = select_works(
                        source,
                        support,
                        (
                            f"curve\x1f{mechanism}\x1f{origin}"
                            f"\x1f{support}\x1f{replicate}"
                        ),
                    )
                    work_set = set(works)
                    rows = [
                        row for row in source if row.work_id in work_set
                    ]
                    model = fit_model(
                        rows,
                        mechanism,
                        str(parameters["basisProfile"]),
                        float(parameters["occurrenceL2"]),
                        float(parameters["conditionalAmountL2"]),
                    )
                    if model is None:
                        continue
                    scored, work_totals = score(
                        model,
                        validation[origin][mechanism],
                    )
                    scored["support"] = support_profile(rows)
                    scored["origin"] = origin
                    runs.append(scored)
                    coefficients = np.concatenate([
                        (
                            model.occurrence
                            if model.occurrence is not None
                            else np.zeros(model.parameter_count)
                        ),
                        model.amount,
                    ])
                    coefficient_vectors.append(coefficients)
                    predictions_by_origin[origin].append(work_totals)
            if not runs:
                continue
            convergence_rate = safe_mean(
                float(run["converged"]) for run in runs
            )
            coefficient_instability = None
            if len(coefficient_vectors) > 1:
                matrix = np.vstack(coefficient_vectors)
                center = np.median(matrix, axis=0)
                coefficient_instability = float(
                    np.median(
                        np.linalg.norm(matrix - center, axis=1)
                        / (np.linalg.norm(center) + 1e-8)
                    )
                )
            prediction_cvs: list[float] = []
            for predictions_by_run in predictions_by_origin.values():
                prediction_keys = (
                    set.intersection(
                        *(set(item) for item in predictions_by_run)
                    )
                    if predictions_by_run
                    else set()
                )
                for key in prediction_keys:
                    values = np.asarray(
                        [item[key] for item in predictions_by_run],
                        dtype=float,
                    )
                    mean_value = float(np.mean(values))
                    prediction_cvs.append(
                        float(
                            np.std(values)
                            / (abs(mean_value) + 1e-8)
                        )
                    )
            points.append({
                "requestedDistinctWorks": support,
                "runCount": len(runs),
                "convergenceRate": convergence_rate,
                "support": {
                    field: quantiles(
                        [
                            float(run["support"][field])
                            for run in runs
                        ]
                    )
                    for field in (
                        "distinctWorks",
                        "positiveDistinctWorks",
                        "monthlyRows",
                        "positiveMonths",
                        "cashHhi",
                        "cashEffectiveWorkCount",
                    )
                },
                "metrics": {
                    field: quantiles(
                        [
                            float(run[field])
                            for run in runs
                            if math.isfinite(float(run[field]))
                        ]
                    )
                    for field in (
                        "workTotalWape",
                        "workTotalSignedBias",
                        "occurrenceLogLoss",
                        "conditionalLogMae",
                    )
                },
                "coefficientRelativeInstability": (
                    coefficient_instability
                ),
                "predictionWorkTotalCv": quantiles(prediction_cvs),
            })
        result[mechanism] = {
            "points": points,
            "observedStableRegion": infer_stable_region(points),
        }
    return result


def infer_stable_region(points: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    eligible = []
    for point in points:
        bias = point["metrics"]["workTotalSignedBias"]["median"]
        if bias is None:
            continue
        conditions = {
            "convergenceRateAtLeast095": (
                float(point["convergenceRate"] or 0) >= 0.95
            ),
            "coefficientRelativeInstabilityAtMost050": (
                point["coefficientRelativeInstability"] is not None
                and float(
                    point["coefficientRelativeInstability"]
                ) <= 0.50
            ),
            "predictionMedianCvAtMost025": (
                point["predictionWorkTotalCv"]["median"] is not None
                and float(
                    point["predictionWorkTotalCv"]["median"]
                ) <= 0.25
            ),
            "absoluteMedianBiasAtMost025": abs(float(bias)) <= 0.25,
        }
        if all(conditions.values()):
            eligible.append((point, conditions))
    if not eligible:
        return {
            "minimumObservedDistinctWorks": None,
            "status": "NO_INTEGER_STABILITY_THRESHOLD_SUPPORTED",
            "rule": "use continuous support score and parent shrinkage",
        }
    point, conditions = eligible[0]
    return {
        "minimumObservedDistinctWorks": point["requestedDistinctWorks"],
        "status": "OBSERVED_TRAINING_SIDE_STABLE_REGION",
        "conditions": conditions,
        "notStandalonePromotionAuthority": True,
    }


def leave_one_work_out(
    training: Mapping[str, Mapping[str, Sequence[Event]]],
    validation: Mapping[str, Mapping[str, Sequence[Event]]],
    selected: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
    origin = VALIDATION_ORIGINS[-1]
    result: dict[str, Any] = {}
    for mechanism in MECHANISMS:
        source = training[origin][mechanism]
        if not source or not validation[origin][mechanism]:
            result[mechanism] = {"status": "FIT_UNAVAILABLE"}
            continue
        support = min(
            48,
            len({row.work_id for row in source}),
        )
        works = select_works(
            source,
            support,
            f"loo\x1f{mechanism}\x1f{origin}",
        )
        work_set = set(works)
        rows = [row for row in source if row.work_id in work_set]
        parameters = selected[mechanism]
        full = fit_model(
            rows,
            mechanism,
            str(parameters["basisProfile"]),
            float(parameters["occurrenceL2"]),
            float(parameters["conditionalAmountL2"]),
        )
        if full is None:
            result[mechanism] = {"status": "FIT_UNAVAILABLE"}
            continue
        full_score, _ = score(full, validation[origin][mechanism])
        deltas = []
        coefficient_deltas = []
        full_coefficients = np.concatenate([
            (
                full.occurrence
                if full.occurrence is not None
                else np.zeros(full.parameter_count)
            ),
            full.amount,
        ])
        for omitted in works:
            reduced_rows = [
                row for row in rows if row.work_id != omitted
            ]
            reduced = fit_model(
                reduced_rows,
                mechanism,
                str(parameters["basisProfile"]),
                float(parameters["occurrenceL2"]),
                float(parameters["conditionalAmountL2"]),
            )
            if reduced is None:
                continue
            reduced_score, _ = score(
                reduced,
                validation[origin][mechanism],
            )
            deltas.append(
                abs(
                    float(reduced_score["workTotalWape"])
                    - float(full_score["workTotalWape"])
                )
            )
            reduced_coefficients = np.concatenate([
                (
                    reduced.occurrence
                    if reduced.occurrence is not None
                    else np.zeros(reduced.parameter_count)
                ),
                reduced.amount,
            ])
            coefficient_deltas.append(
                float(
                    np.linalg.norm(
                        reduced_coefficients - full_coefficients
                    )
                    / (np.linalg.norm(full_coefficients) + 1e-8)
                )
            )
        result[mechanism] = {
            "status": "COMPLETE",
            "validationOrigin": origin,
            "trainingDistinctWorks": support,
            "omissionFitCount": len(deltas),
            "absoluteWorkTotalWapeDelta": quantiles(deltas),
            "relativeCoefficientDelta": quantiles(coefficient_deltas),
        }
    return result


def platform_studies(
    training: Mapping[str, Mapping[str, Sequence[Event]]],
    validation: Mapping[str, Mapping[str, Sequence[Event]]],
    selected: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for platform_name, mechanism in PLATFORMS.items():
        channel_uid = canonical_channel_uid(platform_name)
        platform_training = {
            origin: {
                candidate: (
                    [
                        event
                        for event in training[origin][candidate]
                        if event.channel_uid == channel_uid
                    ]
                    if candidate == mechanism
                    else []
                )
                for candidate in MECHANISMS
            }
            for origin in VALIDATION_ORIGINS
        }
        platform_validation = {
            origin: {
                candidate: (
                    [
                        event
                        for event in validation[origin][candidate]
                        if event.channel_uid == channel_uid
                    ]
                    if candidate == mechanism
                    else []
                )
                for candidate in MECHANISMS
            }
            for origin in VALIDATION_ORIGINS
        }
        curves = learning_curves(
            platform_training,
            platform_validation,
            selected,
        )
        loo = leave_one_work_out(
            platform_training,
            platform_validation,
            selected,
        )
        result[platform_name] = {
            "mechanism": mechanism,
            "population": {
                origin: {
                    "training": support_profile(
                        platform_training[origin][mechanism]
                    ),
                    "validation": support_profile(
                        platform_validation[origin][mechanism]
                    ),
                }
                for origin in VALIDATION_ORIGINS
            },
            "learningCurve": curves[mechanism],
            "leaveOneWorkOut": loo[mechanism],
            "authorizationRelationUsed": False,
            "originObservedCashChannelIdentityOnly": True,
        }
    return result


def main() -> None:
    args = parse_args()
    if not args.input.is_file():
        raise RuntimeError("m2_publishing_scale_learning_input_missing")
    args.output_directory.mkdir(parents=True, exist_ok=True)
    training, validation = load_events(args.input)
    population = {
        origin: {
            mechanism: {
                "training": support_profile(
                    training[origin][mechanism]
                ),
                "validation": support_profile(
                    validation[origin][mechanism]
                ),
            }
            for mechanism in MECHANISMS
        }
        for origin in VALIDATION_ORIGINS
    }
    parameter_results, selected = parameter_study(
        training,
        validation,
    )
    curves = learning_curves(training, validation, selected)
    loo = leave_one_work_out(training, validation, selected)
    global_parent = global_pooled_parent_study(
        training,
        validation,
        selected,
    )
    platforms = platform_studies(
        training,
        validation,
        selected,
    )
    public = {
        "schema": "m2.publishing_scale.training_side_support_study.v1",
        "asOf": "2026-07-28",
        "status": "K7B_TRAINING_SIDE_STUDY_COMPLETE",
        "method": {
            "source": "v2.2-restated strict packed training rows",
            "validationOrigins": list(VALIDATION_ORIGINS),
            "workHoldoutFold": 0,
            "workHoldoutFoldCount": 5,
            "sameWorkRowsKeptTogether": True,
            "trainingLabelsAvailableBeforeValidationOrigin": True,
            "duplicateHistoricalLabelEventsCollapsed": True,
            "workBalancedTrainingWeights": True,
            "replicatesPerSupportAndOrigin": REPLICATES,
            "supportGrid": list(SUPPORT_GRID),
            "l2Grid": list(L2_GRID),
            "basisProfiles": ["compact", "current"],
            "newCandidateOuterOutcomeRead": False,
            "sealedHoldoutRead": False,
        },
        "population": population,
        "parameterCalibration": parameter_results,
        "learningCurves": curves,
        "leaveOneWorkOut": loo,
        "globalPooledParent": global_parent,
        "platformLearningCurves": platforms,
        "authorityBoundary": {
            "taxonomy": "REPORT_ONLY_CURRENT_AS_OF_AUTHORITY_MISSING",
            "authorization": "PROHIBITED_AS_STRICT_ORIGIN_FEATURE",
            "platformIdentity": (
                "origin-observed cash channel only; not authorization"
            ),
        },
        "publicPrivacy": {
            "aggregateOnly": True,
            "containsWorkIdentity": False,
            "containsCategoryValues": False,
            "containsPrivatePath": False,
            "containsPrivateArtifactDigest": False,
        },
    }
    private_path = (
        args.output_directory
        / "M2-publishing-scale-training-side-study-private-v1.json"
    )
    public_path = (
        args.output_directory
        / "M2-publishing-scale-training-side-public-candidate-v1.json"
    )
    text = json.dumps(
        public,
        ensure_ascii=False,
        indent=2,
        sort_keys=True,
    ) + "\n"
    private_path.write_text(text, encoding="utf-8")
    public_path.write_text(text, encoding="utf-8")
    print(json.dumps({
        "status": public["status"],
        "newCandidateOuterOutcomeRead": False,
        "mechanismsStudied": len(MECHANISMS),
        "privateOutputWritten": True,
        "publicAggregateCandidateWritten": True,
    }))


if __name__ == "__main__":
    main()
