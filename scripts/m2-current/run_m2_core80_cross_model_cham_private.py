"""Private M2-CMX01 replay for the frozen CHAM01 algorithm.

The repository JavaScript implementation is the formula authority.  This
adapter preserves its feature, weighting, nested-selection and IRLS contracts,
while delegating the dense linear algebra to NumPy so the frozen algorithm can
be evaluated at every monthly outer origin.  Private rows remain Git ignored.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np


ROOT = Path(__file__).resolve().parents[2]
PRIVATE_DIR = (
    ROOT
    / "data"
    / "private-output"
    / "m2-core80-cross-model-real-business-evaluation-v0.1"
)
INPUT = PRIVATE_DIR / "M2-CMX01-cham01-input-private-v0.1.ndjson"
INPUT_MANIFEST = (
    PRIVATE_DIR / "M2-CMX01-cham01-input-manifest-private-v0.1.json"
)
OUTPUT = PRIVATE_DIR / "M2-CMX01-cham01-predictions-private-v0.1.ndjson"
MANIFEST = PRIVATE_DIR / "M2-CMX01-cham01-model-manifest-private-v0.1.json"
CONFIG = ROOT / "config" / "m2-current-core-legacy-horizon-amount.v0.1.json"
SCHEDULE = ROOT / "config" / "m2-current-oa03-replication.v0.1.json"

EPSILON = 1e-12
FEATURES: tuple[tuple[str, str, bool], ...] = (
    ("trailing1Cash", "SIGNED_LOG1P", True),
    ("trailing3Cash", "SIGNED_LOG1P", True),
    ("trailing6Cash", "SIGNED_LOG1P", True),
    ("trailing12Cash", "SIGNED_LOG1P", True),
    ("sixMonthSlope", "IDENTITY", True),
    ("sixMonthRelativeSlope", "IDENTITY", True),
    ("trailing6ToPrevious6Ratio", "IDENTITY", True),
    ("trailing12ToPrevious12Ratio", "IDENTITY", True),
    ("currentToHistoricalPeakRatio", "IDENTITY", True),
    ("monthsSinceHistoricalPeak", "IDENTITY", True),
    ("validHistoryMonths", "IDENTITY", False),
    ("matureChannelCount", "IDENTITY", False),
    ("trailing12ZeroShare", "IDENTITY", True),
    ("trailing12CoefficientOfVariation", "IDENTITY", True),
    ("workAgeMonths", "IDENTITY", False),
    ("core80", "BINARY", False),
    ("core90", "BINARY", False),
)


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def add_months(month: str, offset: int) -> str:
    year, one_based = (int(value) for value in month.split("-"))
    serial = year * 12 + one_based - 1 + offset
    return f"{serial // 12:04d}-{serial % 12 + 1:02d}"


def signed_log1p(value: float | np.ndarray[Any, Any]) -> Any:
    return np.sign(value) * np.log1p(np.abs(value))


def signed_expm1(value: np.ndarray[Any, Any]) -> np.ndarray[Any, Any]:
    return np.sign(value) * np.expm1(np.abs(value))


def transformed_feature(value: Any, transform: str) -> float:
    if value is None:
        return math.nan
    number = float(value)
    if not math.isfinite(number):
        return math.nan
    if transform == "SIGNED_LOG1P":
        return math.copysign(math.log1p(abs(number)), number)
    if transform == "BINARY":
        return 0.0 if number == 0 else 1.0
    return number


@dataclass
class Design:
    centers: np.ndarray[Any, Any]
    scales: np.ndarray[Any, Any]
    missing: np.ndarray[Any, Any]


@dataclass
class State:
    coefficients: np.ndarray[Any, Any]
    design: Design
    maximum_label: str
    training_rows: int
    training_works: int
    converged: bool
    iterations: int


class ArmIndex:
    def __init__(
        self,
        rows: list[dict[str, Any]],
        horizon: int,
        arm: str,
        training_origins: set[str],
    ) -> None:
        self.rows = rows
        self.horizon = horizon
        self.arm = arm
        grouped: dict[str, list[int]] = {}
        for row_index, row in enumerate(rows):
            grouped.setdefault(str(row["origin"]), []).append(row_index)
        self.by_origin = {
            origin: np.asarray(indices, dtype=np.int64)
            for origin, indices in sorted(grouped.items())
        }
        self.origins = sorted(self.by_origin)
        self.training_origins = [
            origin for origin in self.origins if origin in training_origins
        ]
        specifications = FEATURES + (
            (("lg01PointEstimate", "SIGNED_LOG1P", True),)
            if arm == "B3"
            else ()
        )
        self.specifications = specifications
        self.raw = np.asarray(
            [
                [
                    transformed_feature(row["features"].get(field), transform)
                    for field, transform, _missing in specifications
                ]
                for row in rows
            ],
            dtype=np.float64,
        )
        self.actual = np.asarray([float(row["actual"]) for row in rows])
        self.target = signed_log1p(self.actual)
        self.work_ids = np.asarray(
            [str(row["standardWorkId"]) for row in rows], dtype=object
        )
        self.labels = np.asarray(
            [str(row["labelAvailableAsOf"]) for row in rows], dtype=object
        )
        self.base_weights = self._build_base_weights()
        self._training_cache: dict[str, np.ndarray[Any, Any]] = {}

    def _build_base_weights(self) -> np.ndarray[Any, Any]:
        weights = np.ones(len(self.rows), dtype=np.float64)
        if self.arm == "B1":
            return weights
        trailing_index = next(
            index
            for index, (field, _transform, _missing) in enumerate(
                self.specifications
            )
            if field == "trailing12Cash"
        )
        for indices in self.by_origin.values():
            available = [
                int(index)
                for index in indices
                if math.isfinite(float(self.raw[index, trailing_index]))
            ]
            available.sort(
                key=lambda index: (
                    float(self.raw[index, trailing_index]),
                    str(self.work_ids[index]),
                )
            )
            groups: list[list[int]] = []
            for index in available:
                if (
                    not groups
                    or self.raw[groups[-1][0], trailing_index]
                    != self.raw[index, trailing_index]
                ):
                    groups.append([index])
                else:
                    groups[-1].append(index)
            preceding = 0
            for same in groups:
                midpoint = preceding + (len(same) - 1) / 2
                percentile = (
                    1.0
                    if len(available) <= 1
                    else midpoint / (len(available) - 1)
                )
                weight = min(4.0, max(1.0, 1 + 3 * percentile**2))
                weights[np.asarray(same, dtype=np.int64)] = weight
                preceding += len(same)
        return weights

    def training(self, outer_origin: str) -> np.ndarray[Any, Any]:
        cached = self._training_cache.get(outer_origin)
        if cached is not None:
            return cached
        eligible = [
            self.by_origin[origin]
            for origin in self.training_origins
            if add_months(origin, self.horizon) <= outer_origin
        ]
        indices = (
            np.concatenate(eligible)
            if eligible
            else np.asarray([], dtype=np.int64)
        )
        if indices.size:
            indices = indices[
                np.asarray(
                    [str(self.labels[int(i)]) <= outer_origin for i in indices],
                    dtype=bool,
                )
            ]
        if indices.size and (
            any(str(self.rows[int(i)]["origin"]) >= outer_origin for i in indices)
            or any(str(self.labels[int(i)]) > outer_origin for i in indices)
        ):
            raise RuntimeError("m2_cmx01_cham_training_index_boundary_failed")
        self._training_cache[outer_origin] = indices
        return indices

    def sufficient(self, indices: np.ndarray[Any, Any], config: dict[str, Any]) -> bool:
        return (
            indices.size >= int(config["rolling"]["minimumTrainingRows"])
            and len(set(self.work_ids[indices]))
            >= int(config["rolling"]["minimumTrainingWorks"])
        )


def design_for(index: ArmIndex, indices: np.ndarray[Any, Any]) -> Design:
    raw = index.raw[indices]
    centers = np.zeros(raw.shape[1], dtype=np.float64)
    scales = np.ones(raw.shape[1], dtype=np.float64)
    missing = np.asarray(
        [specification[2] for specification in index.specifications],
        dtype=bool,
    )
    for column, (_field, transform, _indicator) in enumerate(
        index.specifications
    ):
        values = raw[:, column]
        finite = values[np.isfinite(values)]
        if transform == "BINARY" or finite.size == 0:
            centers[column] = 0
            scales[column] = 1
        else:
            centers[column] = float(np.mean(finite))
            scales[column] = (
                1.0
                if finite.size <= 1
                else max(EPSILON, float(np.std(finite, ddof=0)))
            )
    return Design(centers=centers, scales=scales, missing=missing)


def matrix_for(
    index: ArmIndex,
    indices: np.ndarray[Any, Any],
    design: Design,
) -> np.ndarray[Any, Any]:
    raw = index.raw[indices]
    finite = np.isfinite(raw)
    normalized = np.where(
        finite,
        (raw - design.centers) / design.scales,
        0.0,
    )
    columns: list[np.ndarray[Any, Any]] = [
        np.ones(indices.size, dtype=np.float64)
    ]
    for column in range(raw.shape[1]):
        columns.append(normalized[:, column])
        if bool(design.missing[column]):
            columns.append((~finite[:, column]).astype(np.float64))
    return np.column_stack(columns)


def gaussian_solve(
    input_matrix: np.ndarray[Any, Any],
    input_vector: np.ndarray[Any, Any],
) -> np.ndarray[Any, Any]:
    matrix = input_matrix.copy()
    vector = input_vector.copy()
    dimension = matrix.shape[0]
    for pivot in range(dimension):
        selected = pivot + int(np.argmax(np.abs(matrix[pivot:, pivot])))
        if selected != pivot:
            matrix[[pivot, selected]] = matrix[[selected, pivot]]
            vector[[pivot, selected]] = vector[[selected, pivot]]
        if abs(float(matrix[pivot, pivot])) <= EPSILON:
            matrix[pivot, pivot] = (
                -EPSILON if matrix[pivot, pivot] < 0 else EPSILON
            )
        scale = float(matrix[pivot, pivot])
        matrix[pivot, pivot:] /= scale
        vector[pivot] /= scale
        for row in range(dimension):
            if row == pivot:
                continue
            factor = float(matrix[row, pivot])
            if abs(factor) <= EPSILON:
                continue
            matrix[row, pivot:] -= factor * matrix[pivot, pivot:]
            vector[row] -= factor * vector[pivot]
    if not np.all(np.isfinite(vector)):
        raise RuntimeError("m2_core_horizon_amount_linear_solve_failed")
    return vector


def weighted_ridge(
    x: np.ndarray[Any, Any],
    y: np.ndarray[Any, Any],
    weights: np.ndarray[Any, Any],
    l2: float,
) -> np.ndarray[Any, Any]:
    matrix = x.T @ (x * weights[:, None])
    vector = x.T @ (weights * y)
    diagonal = np.arange(matrix.shape[0])
    matrix[diagonal[1:], diagonal[1:]] += l2
    matrix[0, 0] += 1e-10
    return gaussian_solve(matrix, vector)


def fit(
    index: ArmIndex,
    indices: np.ndarray[Any, Any],
    delta: float,
    l2: float,
    config: dict[str, Any],
) -> State:
    design = design_for(index, indices)
    x = matrix_for(index, indices, design)
    y = index.target[indices]
    base_weights = index.base_weights[indices]
    coefficients = weighted_ridge(x, y, base_weights, l2)
    converged = False
    iterations = 0
    for iteration in range(int(config["training"]["maximumIrlsIterations"])):
        residuals = y - x @ coefficients
        absolute = np.abs(residuals)
        robust = base_weights * np.where(
            absolute <= delta,
            1.0,
            delta / np.maximum(EPSILON, absolute),
        )
        next_coefficients = weighted_ridge(x, y, robust, l2)
        iterations = iteration + 1
        difference = float(np.max(np.abs(next_coefficients - coefficients)))
        coefficients = next_coefficients
        if difference <= float(config["training"]["convergenceTolerance"]):
            converged = True
            break
    return State(
        coefficients=coefficients,
        design=design,
        maximum_label=max(str(index.labels[int(i)]) for i in indices),
        training_rows=int(indices.size),
        training_works=len(set(index.work_ids[indices])),
        converged=converged,
        iterations=iterations,
    )


def predict(
    index: ArmIndex,
    indices: np.ndarray[Any, Any],
    state: State,
) -> tuple[np.ndarray[Any, Any], np.ndarray[Any, Any]]:
    transformed = matrix_for(index, indices, state.design) @ state.coefficients
    return signed_expm1(transformed), transformed


def huber_mean(residuals: np.ndarray[Any, Any], delta: float) -> float:
    absolute = np.abs(residuals)
    losses = np.where(
        absolute <= delta,
        0.5 * residuals**2,
        delta * (absolute - 0.5 * delta),
    )
    return float(np.mean(losses))


def choose_parameters(
    index: ArmIndex,
    outer_origin: str,
    config: dict[str, Any],
    score_cache: dict[tuple[Any, ...], float],
    selection_cache: dict[tuple[Any, ...], dict[str, Any]],
) -> dict[str, Any]:
    training = index.training(outer_origin)
    mature_origins = tuple(
        origin
        for origin in index.training_origins
        if add_months(origin, index.horizon) <= outer_origin
    )
    cached = selection_cache.get(mature_origins)
    if cached is not None:
        return cached
    inner_origins = [
        origin
        for origin in mature_origins
        if index.sufficient(index.training(origin), config)
    ]
    if len(inner_origins) < int(
        config["rolling"]["minimumInnerValidationOrigins"]
    ):
        result = {
            "status": "NOT_SELECTABLE_INSUFFICIENT_INNER_ORIGINS",
            "innerOriginCount": len(inner_origins),
            "eligibleTrainingRowCount": int(training.size),
            "selected": None,
        }
        selection_cache[mature_origins] = result
        return result
    candidates: list[dict[str, Any]] = []
    for delta in config["training"]["grid"]["huberDelta"]:
        for l2 in config["training"]["grid"]["l2"]:
            losses: list[float] = []
            for inner_origin in inner_origins:
                key = (inner_origin, float(delta), float(l2))
                loss = score_cache.get(key)
                if loss is None:
                    inner_training = index.training(inner_origin)
                    validation = index.by_origin[inner_origin]
                    state = fit(
                        index,
                        inner_training,
                        float(delta),
                        float(l2),
                        config,
                    )
                    _points, transformed = predict(index, validation, state)
                    loss = huber_mean(
                        index.target[validation] - transformed,
                        float(delta),
                    )
                    score_cache[key] = loss
                losses.append(loss)
            candidates.append(
                {
                    "huberDelta": float(delta),
                    "l2": float(l2),
                    "meanValidationHuberLoss": sum(losses) / len(losses),
                }
            )
    candidates.sort(
        key=lambda value: (
            value["meanValidationHuberLoss"],
            value["huberDelta"],
            value["l2"],
        )
    )
    result = {
        "status": "SELECTED_ON_EARLIER_MATURE_INNER_ORIGINS",
        "innerOriginCount": len(inner_origins),
        "eligibleTrainingRowCount": int(training.size),
        "selected": candidates[0],
    }
    selection_cache[mature_origins] = result
    return result


def prediction_row(
    row: dict[str, Any],
    arm: str,
    point: float,
    state: State,
    delta: float,
    l2: float,
) -> dict[str, Any]:
    actual = float(row["actual"])
    return {
        "modelId": "M2-WORK-CHAM01",
        "modelVariantId": f"M2-WORK-CHAM01/{arm}",
        "predictionGrain": "WORK_TOTAL",
        "nativeOrComposite": "NATIVE_RAW_CANDIDATE",
        "populationRoute": "POPULATION_INDEPENDENT",
        "standardWorkId": row["standardWorkId"],
        "workTitle": row.get("workTitle"),
        "origin": row["origin"],
        "horizonMonths": int(row["horizonMonths"]),
        "targetStart": row.get("targetStart"),
        "targetEnd": row.get("targetEnd"),
        "targetYear": row.get("targetYear"),
        "pointEstimate": point,
        "actual": actual,
        "actualPositive": max(0.0, actual),
        "actualReversal": max(0.0, -actual),
        "labelAvailableAsOf": row["labelAvailableAsOf"],
        "dynamicCore80Flag": bool(row.get("dynamicCore80Flag")),
        "annualActualCore80Flag": bool(row.get("annualActualCore80Flag")),
        "core90": bool(row.get("core90")),
        "cashBandId": row.get("cashBandId"),
        "segment": row.get("segment"),
        "dominantRevenueMode": row.get("dominantRevenueMode"),
        "revenueDecile": row.get("revenueDecile"),
        "referenceRank": row.get("referenceRank"),
        "originSafeStatus": row.get("originSafeStatus"),
        "trainingMaximumLabelAvailableAsOf": state.maximum_label,
        "selectedHuberDelta": delta,
        "selectedL2": l2,
        "converged": state.converged,
        "irlsIterations": state.iterations,
        "rawCandidatePreserved": True,
        "selectedFallbackApplied": False,
        "lg01InputUsed": arm == "B3",
    }


def main() -> None:
    input_manifest = read_json(INPUT_MANIFEST)
    config = read_json(CONFIG)
    schedule = read_json(SCHEDULE)
    if (
        input_manifest.get("status") != "COMPLETE"
        or input_manifest["file"]["sha256"] != sha256_file(INPUT)
        or config.get("schema")
        != "m2.current.core_legacy_horizon_amount.v0.1"
    ):
        raise RuntimeError("m2_cmx01_cham_numpy_upstream_invalid")
    training_origins = set(
        schedule["rollingEvaluation"]["schedules"]["PRIMARY_ROLLING"]
        ["trainingAndEvaluationOrigins"]
    ) | set(
        schedule["rollingEvaluation"]["schedules"]["STRICT_ROLLING"]
        ["trainingAndEvaluationOrigins"]
    )
    rows: list[dict[str, Any]] = []
    with INPUT.open("r", encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                rows.append(json.loads(line))
    by_horizon: dict[int, list[dict[str, Any]]] = {
        horizon: [row for row in rows if int(row["horizonMonths"]) == horizon]
        for horizon in (3, 6, 12)
    }
    temporary = OUTPUT.with_suffix(OUTPUT.suffix + ".tmp")
    temporary.unlink(missing_ok=True)
    counts: dict[str, int] = {}
    selections: list[dict[str, Any]] = []
    state_reuse_count = 0
    with temporary.open("w", encoding="utf-8", newline="\n") as output:
        for horizon in (3, 6, 12):
            base = by_horizon[horizon]
            outer_origins = sorted({str(row["origin"]) for row in base})
            for arm in ("B1", "B2", "B3"):
                arm_rows = (
                    [row for row in base if row.get("lg01PointEstimate") is not None]
                    if arm == "B3"
                    else base
                )
                if arm == "B3":
                    for row in arm_rows:
                        row["features"]["lg01PointEstimate"] = float(
                            row["lg01PointEstimate"]
                        )
                index = ArmIndex(arm_rows, horizon, arm, training_origins)
                score_cache: dict[tuple[Any, ...], float] = {}
                selection_cache: dict[tuple[Any, ...], dict[str, Any]] = {}
                state_cache: dict[tuple[Any, ...], State] = {}
                for outer_origin in outer_origins:
                    validation = index.by_origin.get(outer_origin)
                    training = index.training(outer_origin)
                    if (
                        validation is None
                        or validation.size == 0
                        or not index.sufficient(training, config)
                    ):
                        selections.append(
                            {
                                "armId": arm,
                                "horizonMonths": horizon,
                                "outerOrigin": outer_origin,
                                "status": (
                                    "MODEL_UNAVAILABLE_INSUFFICIENT_"
                                    "MATURE_EARLIER_ROWS"
                                ),
                                "trainingRowCount": int(training.size),
                                "validationRowCount": (
                                    0 if validation is None else int(validation.size)
                                ),
                            }
                        )
                        continue
                    selection = choose_parameters(
                        index,
                        outer_origin,
                        config,
                        score_cache,
                        selection_cache,
                    )
                    if selection["selected"] is None:
                        selections.append(
                            {
                                "armId": arm,
                                "horizonMonths": horizon,
                                "outerOrigin": outer_origin,
                                **selection,
                                "validationRowCount": int(validation.size),
                            }
                        )
                        continue
                    delta = float(selection["selected"]["huberDelta"])
                    l2 = float(selection["selected"]["l2"])
                    state_key = (outer_origin, delta, l2)
                    state = state_cache.get(state_key)
                    if state is None:
                        state = fit(index, training, delta, l2, config)
                        state_cache[state_key] = state
                    else:
                        state_reuse_count += 1
                    points, _transformed = predict(index, validation, state)
                    for local, row_index in enumerate(validation):
                        row = index.rows[int(row_index)]
                        output.write(
                            json.dumps(
                                prediction_row(
                                    row,
                                    arm,
                                    float(points[local]),
                                    state,
                                    delta,
                                    l2,
                                ),
                                ensure_ascii=False,
                                allow_nan=False,
                                separators=(",", ":"),
                            )
                            + "\n"
                        )
                    variant = f"M2-WORK-CHAM01/{arm}"
                    counts[variant] = counts.get(variant, 0) + int(
                        validation.size
                    )
                    selections.append(
                        {
                            "armId": arm,
                            "horizonMonths": horizon,
                            "outerOrigin": outer_origin,
                            "status": "EVALUATED_ORIGIN_SAFE",
                            "trainingRowCount": state.training_rows,
                            "trainingWorkCount": state.training_works,
                            "validationRowCount": int(validation.size),
                            "maximumTrainingLabelAvailableAsOf": (
                                state.maximum_label
                            ),
                            "selectedHuberDelta": delta,
                            "selectedL2": l2,
                            "innerOriginCount": selection["innerOriginCount"],
                            "sameOrLaterOuterTruthRead": False,
                        }
                    )
                    print(
                        f"[M2-CMX01] cham-numpy {arm} H{horizon} "
                        f"{outer_origin} training={state.training_rows}",
                        flush=True,
                    )
    os.replace(temporary, OUTPUT)
    prediction_count = sum(counts.values())
    manifest = {
        "schema": "m2.cmx01.cham01_model_manifest.private.v0.1",
        "status": "COMPLETE" if prediction_count > 0 else "FAILED_NO_PREDICTIONS",
        "tracked": False,
        "executionDesign": (
            "ORIGINAL_HORIZON_SPECIFIC_ORIGIN_BOUNDED_FIT_WITH_"
            "FROZEN_TRAINING_PSEUDO_ORIGINS_AND_NUMPY_LINEAR_ALGEBRA"
        ),
        "formulaAuthority": (
            "src/domain/m2Current/coreLegacyHorizonAmount.js"
        ),
        "trainingPseudoOriginAuthority": (
            "config/m2-current-oa03-replication.v0.1.json"
        ),
        "trainingPseudoOrigins": sorted(training_origins),
        "allLegalMonthlyOuterOriginsEvaluatedWhenModelAvailable": True,
        "modelVariantCounts": dict(sorted(counts.items())),
        "selections": selections,
        "equivalentStateReuseCount": state_reuse_count,
        "rawCandidateResultsPreserved": True,
        "selectedFallbackUsedToReplaceRawCandidate": False,
        "horizon36ReadOrProduced": False,
        "file": {
            "path": OUTPUT.name,
            "rowCount": prediction_count,
            "byteCount": OUTPUT.stat().st_size,
            "sha256": sha256_file(OUTPUT),
        },
        "finalHoldoutOpened": False,
        "productionChanged": False,
    }
    MANIFEST.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, allow_nan=False) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "status": manifest["status"],
                "predictionCount": prediction_count,
                "modelVariantCounts": manifest["modelVariantCounts"],
                "equivalentStateReuseCount": state_reuse_count,
            },
            ensure_ascii=False,
        ),
        flush=True,
    )


if __name__ == "__main__":
    main()
