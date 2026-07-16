#!/usr/bin/env python3
"""Frozen C3 B4-anchored correction models.

This module is intentionally data-loader free.  Callers provide cutoff-only
work histories, frozen case state, the locked B4 channel composition, and
models fitted exclusively from strictly earlier development origins.  Target
values are accepted only by the explicit fit helpers; :func:`predict_as_of`
rejects target, outcome, identity-feature, and post-cutoff fields.
"""

from __future__ import annotations

import copy
import hashlib
import json
import math
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any, Mapping, Sequence

import m2_calibration_c2_v1 as c2
import m2_calibration_v1 as base
import m2_formal_cash_comparator_v1 as formal
import m2_formal_cash_target_v1 as cash


ROOT = Path(__file__).resolve().parents[2]
SPEC_PATH = (
    ROOT
    / "src"
    / "domain"
    / "oldProductEvaluation"
    / "calibrationSpec.c3.v1.amendment.json"
)
SALES_ROUTES = frozenset({"pure_sales_share", "buyout_plus_sales"})
FAMILIES = ("c3A", "c3B", "c3C", "c3S")
TOLERANCE = 1e-8

NUMERIC_FEATURES = (
    "b4Prediction",
    "historyObservedMonths",
    "historyCashTotal",
    "trailing3Cash",
    "trailing6Cash",
    "trailing12Cash",
    "trailing24Cash",
    "zeroMonthCount",
    "zeroRate",
    "positiveMonthCount",
    "positiveRate",
    "positiveMonthCountTrailing6",
    "positiveMonthCountTrailing12",
    "trend12",
    "volatility12",
    "horizonMonths",
    "knownChannelCount",
    "knownChannelConcentration",
)
CATEGORICAL_FEATURES = ("route", "activitySegment")
ALLOWED_FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES
PREDICTION_FORBIDDEN_FRAGMENTS = (
    "actual",
    "outcome",
    "title",
    "author",
    "channelidentity",
    "channelkey",
    "sourceidentity",
    "currentrating",
    "currentlifecycle",
    "currentrisk",
    "currentrights",
    "currentshelf",
    "futureincome",
    "futurebuyout",
    "buyoutmonthlyequivalent",
    "postcutoff",
    "holdout",
    "embargo",
    "deferred60month",
)


class C3Error(RuntimeError):
    """A frozen C3 modeling, routing, or leakage invariant was violated."""


_C2_SPEC_CACHE: dict[str, Any] | None = None


def _c2_spec() -> Mapping[str, Any]:
    global _C2_SPEC_CACHE
    if _C2_SPEC_CACHE is None:
        _C2_SPEC_CACHE = c2.load_spec()
    return _C2_SPEC_CACHE


def canonical_digest(value: Any) -> str:
    """Return the repository-wide canonical JSON SHA-256 digest."""

    return hashlib.sha256(base.canonical_json_bytes(value)).hexdigest()


def _float_token(value: float) -> str:
    rendered = format(float(value), ".12g")
    return rendered.replace("-", "m").replace(".", "p")


def candidate_configs(spec: Mapping[str, Any]) -> dict[str, dict[str, Any]]:
    """Enumerate the complete preregistered 24-candidate C3 space."""

    space = spec["candidateSpace"]
    output: dict[str, dict[str, Any]] = {}
    for depth in space["c3A"]["hierarchyDepths"]:
        for prior in space["c3A"]["shrinkagePriors"]:
            for cap in space["c3A"]["correctionCaps"]:
                candidate_id = (
                    f"C3-A__{depth}__prior{_float_token(float(prior))}"
                    f"__cap{_float_token(float(cap))}"
                )
                output[candidate_id] = {
                    "candidateId": candidate_id,
                    "family": "c3A",
                    "hierarchyDepth": str(depth),
                    "shrinkagePrior": float(prior),
                    "correctionCap": float(cap),
                }
    for l2 in space["c3B"]["l2"]:
        for weight in space["c3B"]["b4AnchorWeights"]:
            candidate_id = (
                f"C3-B__l2{_float_token(float(l2))}"
                f"__b4w{_float_token(float(weight))}"
            )
            output[candidate_id] = {
                "candidateId": candidate_id,
                "family": "c3B",
                "l2": float(l2),
                "b4AnchorWeight": float(weight),
                "correctionCap": float(space["c3B"]["correctionCap"]),
            }
    for l2 in space["c3C"]["l2"]:
        for shrinkage in space["c3C"]["shrinkage"]:
            for cap in space["c3C"]["logCorrectionCaps"]:
                candidate_id = (
                    f"C3-C__l2{_float_token(float(l2))}"
                    f"__shrink{_float_token(float(shrinkage))}"
                    f"__logcap{_float_token(float(cap))}"
                )
                output[candidate_id] = {
                    "candidateId": candidate_id,
                    "family": "c3C",
                    "l2": float(l2),
                    "shrinkage": float(shrinkage),
                    "logCorrectionCap": float(cap),
                }
    for combination in space["c3S"]["convexCombinations"]:
        candidate_id = f"C3-S__{combination['id']}"
        output[candidate_id] = {
            "candidateId": candidate_id,
            "family": "c3S",
            "weights": {
                family: float(combination[family])
                for family in ("c3A", "c3B", "c3C")
            },
        }
    if len(output) != len(set(output)):
        raise C3Error("C3 candidate identifiers are duplicated")
    return output


def candidate_ids(
    spec: Mapping[str, Any], family: str | None = None
) -> tuple[str, ...]:
    configs = candidate_configs(spec)
    if family is None:
        return tuple(configs)
    if family not in FAMILIES:
        raise C3Error(f"unknown C3 candidate family: {family}")
    return tuple(
        candidate_id
        for candidate_id, config in configs.items()
        if config["family"] == family
    )


def candidate_counts(spec: Mapping[str, Any]) -> dict[str, int]:
    return {family: len(candidate_ids(spec, family)) for family in FAMILIES}


def load_spec(path: Path = SPEC_PATH) -> dict[str, Any]:
    """Load C3 and fail closed on every frozen parent or boundary mismatch."""

    spec = json.loads(path.read_text(encoding="utf-8"))
    if (
        spec.get("version") != "calibration-spec-c3-v1"
        or spec.get("decisionStatus") != "not_for_formal_decision"
        or spec.get("formalDecisionAuthorized") is not False
        or spec.get("releaseAuthorized") is not False
        or any(value is not False for value in spec.get("seals", {}).values())
    ):
        raise C3Error("C3 spec identity, decision boundary, or seal differs")
    binding = spec.get("phaseABinding", {})
    if (
        binding.get("authorizedStartHead")
        != "50d927d64438af5057e8b623a901a22c70bced53"
        or binding.get("branch") != "codex/m2-c3-v2"
        or binding.get("primaryComparator") != "B4"
        or tuple(binding.get("fixedComparatorBundle", ()))
        != ("B0b", "B1", "B3", "B4")
    ):
        raise C3Error("C3 start checkpoint, branch, or comparator bundle differs")
    parent_path = ROOT / str(binding.get("parentSpecPath", ""))
    if not parent_path.is_file():
        raise C3Error("C3 parent C2 spec is missing")
    parent = json.loads(parent_path.read_text(encoding="utf-8"))
    if canonical_digest(parent) != str(
        binding.get("parentSpecCanonicalDigestSha256")
    ):
        raise C3Error("C3 parent C2 spec digest differs")
    for field in (
        "formalCashTarget",
        "acceptance",
        "businessCoverageDecision",
        "overallDecision",
        "productOutput",
        "privacy",
        "seals",
    ):
        if spec.get(field) != parent.get(field):
            raise C3Error(f"C3 inherited C2 boundary differs: {field}")
    expected_authority = {
        "standardWorkCount": 3053,
        "incomeFactCount": 192872,
        "completeIncomeFactCount": 192869,
        "developmentCaseCount": 18615,
        "statisticallyScoreableCaseCount": 12223,
        "formalModelPopulationCaseCount": 7851,
        "formalModelPopulationWorkCount": 824,
    }
    if any(
        int(spec.get("authority", {}).get(key, -1)) != value
        for key, value in expected_authority.items()
    ):
        raise C3Error("C3 authority population differs")
    manifest = spec.get("featureManifest", {})
    if (
        tuple(manifest.get("allowed", ())) != ALLOWED_FEATURES
        or len(set(manifest.get("forbidden", ())))
        != len(manifest.get("forbidden", ()))
        or manifest.get("preprocessingFitScope") != "inner_origin_fold_only"
        or manifest.get("identityHashingAllowed") is not False
        or manifest.get("postCutoffFeatureAllowed") is not False
    ):
        raise C3Error("C3 feature manifest differs")
    counts = candidate_counts(spec)
    expected_counts = {
        family: int(spec["candidateSpace"][family]["candidateCount"])
        for family in FAMILIES
    }
    if (
        counts != expected_counts
        or sum(counts.values())
        != int(spec["candidateSpace"]["totalCandidateCount"])
        or counts != {"c3A": 8, "c3B": 4, "c3C": 8, "c3S": 4}
    ):
        raise C3Error("C3 candidate enumeration differs from frozen counts")
    for candidate_id in candidate_ids(spec, "c3S"):
        weights = candidate_configs(spec)[candidate_id]["weights"]
        if (
            any(value < 0.0 for value in weights.values())
            or abs(sum(weights.values()) - 1.0) > 1e-12
        ):
            raise C3Error("C3-S preregistered weights are not convex")
    gate = spec.get("gateD", {})
    if int(gate.get("requiredTrueCount", -1)) != len(gate.get("conditions", [])):
        raise C3Error("Gate D required count differs from its conditions")
    return spec


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


def _trend(values: Sequence[float]) -> float:
    if len(values) < 2:
        return 0.0
    x_mean = (len(values) - 1) / 2.0
    y_mean = sum(values) / len(values)
    denominator = sum((index - x_mean) ** 2 for index in range(len(values)))
    if denominator <= 0:
        return 0.0
    return sum(
        (index - x_mean) * (float(value) - y_mean)
        for index, value in enumerate(values)
    ) / denominator


def _volatility(values: Sequence[float]) -> float:
    if len(values) < 2:
        return 0.0
    mean = sum(values) / len(values)
    return math.sqrt(sum((float(value) - mean) ** 2 for value in values) / len(values))


def _b4_components(
    comparator_rows: Mapping[str, Mapping[str, Any]],
) -> list[float]:
    if "B4" not in comparator_rows:
        raise C3Error("C3 cutoff context lacks the locked B4 anchor")
    row = comparator_rows["B4"]
    components = row.get("channelComponents", row.get("channel_components", [])) or []
    values: list[float] = []
    for component in components:
        value = base.require_finite_number(
            component.get("point_forecast"), "C3 locked B4 component"
        )
        if value < 0:
            raise C3Error("C3 locked B4 component is negative")
        values.append(value)
    if not values:
        raw = row.get("rawModelPrediction")
        if raw is None:
            raise C3Error("C3 locked B4 anchor has no cash component")
        value = base.require_finite_number(raw, "C3 locked B4 point")
        if value < 0:
            raise C3Error("C3 locked B4 point is negative")
        values.append(value)
    return values


def b4_point(comparator_rows: Mapping[str, Mapping[str, Any]]) -> float:
    return sum(_b4_components(comparator_rows))


def validate_features(
    features: Mapping[str, Any], spec: Mapping[str, Any]
) -> dict[str, Any]:
    """Validate and copy the exact identity-free frozen feature projection."""

    if set(features) != set(spec["featureManifest"]["allowed"]):
        extra = sorted(set(features) - set(spec["featureManifest"]["allowed"]))
        missing = sorted(set(spec["featureManifest"]["allowed"]) - set(features))
        raise C3Error(f"C3 feature projection differs; extra={extra}, missing={missing}")
    output: dict[str, Any] = {}
    for name in NUMERIC_FEATURES:
        output[name] = base.require_finite_number(features[name], f"C3 feature {name}")
    levels = spec["featureManifest"]["categoricalLevels"]
    for name in CATEGORICAL_FEATURES:
        value = str(features[name])
        if value not in levels[name]:
            raise C3Error(f"C3 feature {name} has an unknown frozen level")
        output[name] = value
    return output


def _segment_from_history(
    values: Sequence[float], c2_spec: Mapping[str, Any]
) -> str:
    """Mirror the frozen C2 as-of segment using an already-read cutoff history."""

    zero_tolerance = float(
        c2_spec["activitySegmentation"]["zeroAbsoluteTolerance"]
    )
    positive_count = sum(value > zero_tolerance for value in values)
    trailing12 = list(values[-12:])
    trailing6 = list(values[-6:])
    positive12 = sum(value > zero_tolerance for value in trailing12)
    positive6 = sum(value > zero_tolerance for value in trailing6)
    zero12 = sum(abs(value) <= zero_tolerance for value in trailing12)
    consecutive_zero = 0
    for value in reversed(values):
        if abs(value) > zero_tolerance:
            break
        consecutive_zero += 1
    positive_trailing12 = [value for value in trailing12 if value > zero_tolerance]
    positive_sum12 = math.fsum(positive_trailing12)
    largest_share = (
        max(positive_trailing12) / positive_sum12 if positive_sum12 > 0 else 0.0
    )
    observed = len(values)
    dense = c2_spec["activitySegmentation"]["dense"]
    dormant = c2_spec["activitySegmentation"]["dormant"]
    if observed == 0 or positive_count == 0:
        return "intermittent"
    if (
        positive_count >= int(dormant["minimumHistoricalPositiveMonths"])
        and consecutive_zero
        >= int(dormant["minimumTrailingConsecutiveZeroMonths"])
    ):
        return "dormant"
    if (
        observed >= int(dense["minimumObservedCompleteMonths"])
        and positive12 >= int(dense["minimumPositiveMonthsTrailing12"])
        and positive6 >= int(dense["minimumPositiveMonthsTrailing6"])
        and zero12 <= int(dense["maximumZeroMonthsTrailing12"])
        and largest_share
        <= float(dense["maximumLargestPositiveMonthShareTrailing12"])
    ):
        return "dense"
    return "intermittent"


def extract_cutoff_features(
    *,
    work: Mapping[str, Any],
    origin: str,
    horizon: int,
    route: str,
    comparator_rows: Mapping[str, Mapping[str, Any]],
    calibration_spec: Mapping[str, Any],
    spec: Mapping[str, Any],
) -> dict[str, Any]:
    """Extract only preregistered aggregate features available by ``origin``."""

    if route not in SALES_ROUTES:
        raise C3Error("C3 cutoff features are only defined for sales-cash routes")
    if int(horizon) not in tuple(int(value) for value in spec["authority"]["horizonsMonths"]):
        raise C3Error("C3 horizon is outside the frozen authority")
    history = c2.work_sales_history_as_of(work, origin, calibration_spec)
    values = [
        base.require_finite_number(value, "C3 cutoff cash history")
        for value in history["values"]
    ]
    zero_tolerance = 1e-9
    trailing12 = values[-12:]
    components = _b4_components(comparator_rows)
    positive = sum(value > zero_tolerance for value in values)
    zero = sum(abs(value) <= zero_tolerance for value in values)
    c2_spec = _c2_spec()
    segment = _segment_from_history(values, c2_spec)
    features = {
        "b4Prediction": sum(components),
        "historyObservedMonths": float(len(values)),
        "historyCashTotal": sum(values),
        "trailing3Cash": sum(values[-3:]),
        "trailing6Cash": sum(values[-6:]),
        "trailing12Cash": sum(trailing12),
        "trailing24Cash": sum(values[-24:]),
        "zeroMonthCount": float(zero),
        "zeroRate": float(zero / len(values)) if values else 0.0,
        "positiveMonthCount": float(positive),
        "positiveRate": float(positive / len(values)) if values else 0.0,
        "positiveMonthCountTrailing6": float(
            sum(value > zero_tolerance for value in values[-6:])
        ),
        "positiveMonthCountTrailing12": float(
            sum(value > zero_tolerance for value in trailing12)
        ),
        "trend12": _trend(trailing12),
        "volatility12": _volatility(trailing12),
        "horizonMonths": float(horizon),
        "knownChannelCount": float(len(components)),
        "knownChannelConcentration": (
            max(components) / sum(components) if sum(components) > 0 else 0.0
        ),
        "route": route,
        "activitySegment": str(segment),
    }
    return validate_features(features, spec)


def _compact_key(value: Any) -> str:
    return str(value).replace("_", "").replace("-", "").lower()


def _reject_forbidden_mapping(
    value: Mapping[str, Any], *, prediction: bool
) -> None:
    fragments = PREDICTION_FORBIDDEN_FRAGMENTS
    for key in value:
        compact = _compact_key(key)
        if any(fragment in compact for fragment in fragments):
            raise C3Error(f"C3 {'prediction' if prediction else 'fit'} input contains forbidden field: {key}")


def _validated_training_record(
    record: Mapping[str, Any], prediction_origin: str, spec: Mapping[str, Any]
) -> dict[str, Any]:
    required = {
        "origin",
        "targetEnd",
        "labelAvailableAsOf",
        "features",
        "actual",
        "b4Prediction",
    }
    if not required.issubset(record):
        raise C3Error("C3 training record lacks frozen evidence fields")
    for key in record:
        compact = _compact_key(key)
        if key == "actual":
            continue
        if any(
            fragment in compact
            for fragment in (
                "workid",
                "standardwork",
                "title",
                "author",
                "channelkey",
                "channelidentity",
                "future",
                "holdout",
                "embargo",
                "deferred60month",
            )
        ):
            raise C3Error(f"C3 fit record contains forbidden identity/future field: {key}")
    origin = str(record["origin"])
    target_end = str(record["targetEnd"])
    available = str(record["labelAvailableAsOf"])
    if origin >= prediction_origin or target_end > prediction_origin or available > prediction_origin:
        raise C3Error("C3 fit record is not strictly earlier and label-available")
    features = validate_features(record["features"], spec)
    actual = base.require_finite_number(record["actual"], "C3 earlier actual")
    anchor = base.require_finite_number(record["b4Prediction"], "C3 earlier B4")
    if anchor < 0:
        raise C3Error("C3 earlier B4 point is negative")
    if abs(float(features["b4Prediction"]) - anchor) > TOLERANCE:
        raise C3Error("C3 feature B4 point differs from training anchor")
    return {
        "origin": origin,
        "targetEnd": target_end,
        "labelAvailableAsOf": available,
        "features": features,
        "actual": actual,
        "b4Prediction": anchor,
    }


def _ordered_training_records(
    records: Sequence[Mapping[str, Any]], prediction_origin: str, spec: Mapping[str, Any]
) -> list[dict[str, Any]]:
    validated = [
        _validated_training_record(record, prediction_origin, spec)
        for record in records
    ]
    return sorted(
        validated,
        key=lambda record: base.canonical_json_bytes(record),
    )


def fit_preprocessor(
    records: Sequence[Mapping[str, Any]],
    prediction_origin: str,
    spec: Mapping[str, Any],
) -> dict[str, Any]:
    """Fit deterministic fold-local scaling from strictly earlier records."""

    ordered = _ordered_training_records(records, prediction_origin, spec)
    if not ordered:
        raise C3Error("C3 fold-local preprocessor lacks earlier records")
    means: dict[str, float] = {}
    scales: dict[str, float] = {}
    for name in NUMERIC_FEATURES:
        values = [float(record["features"][name]) for record in ordered]
        mean = math.fsum(values) / len(values)
        variance = math.fsum((value - mean) ** 2 for value in values) / len(values)
        means[name] = mean
        scales[name] = math.sqrt(variance) if variance > 1e-24 else 1.0
    payload = {
        "schema": "m2.c3.fold_local_preprocessor.v1",
        "predictionOrigin": prediction_origin,
        "trainingCaseCount": len(ordered),
        "trainingOrigins": sorted({record["origin"] for record in ordered}),
        "numericFeatureOrder": list(NUMERIC_FEATURES),
        "categoricalFeatureOrder": list(CATEGORICAL_FEATURES),
        "categoricalLevels": copy.deepcopy(
            spec["featureManifest"]["categoricalLevels"]
        ),
        "means": means,
        "scales": scales,
        "fitScope": "inner_origin_fold_only",
        "identityFeaturesUsed": False,
        "postCutoffFeaturesUsed": False,
    }
    payload["digest"] = canonical_digest(payload)
    return payload


def transform_features(
    features: Mapping[str, Any],
    preprocessor: Mapping[str, Any],
    spec: Mapping[str, Any],
) -> list[float]:
    clean = validate_features(features, spec)
    if (
        preprocessor.get("schema") != "m2.c3.fold_local_preprocessor.v1"
        or preprocessor.get("fitScope") != "inner_origin_fold_only"
        or preprocessor.get("identityFeaturesUsed") is not False
        or preprocessor.get("postCutoffFeaturesUsed") is not False
    ):
        raise C3Error("C3 preprocessor boundary differs")
    vector = [
        (float(clean[name]) - float(preprocessor["means"][name]))
        / float(preprocessor["scales"][name])
        for name in NUMERIC_FEATURES
    ]
    levels = preprocessor["categoricalLevels"]
    for name in CATEGORICAL_FEATURES:
        vector.extend(
            1.0 if clean[name] == level else 0.0 for level in levels[name]
        )
    if not all(math.isfinite(value) for value in vector):
        raise C3Error("C3 transformed feature vector is not finite")
    return vector


def _channel_count_bucket(value: float) -> str:
    count = int(round(value))
    if count <= 0:
        return "none"
    if count == 1:
        return "one"
    if count == 2:
        return "two"
    return "three_plus"


def _concentration_bucket(value: float) -> str:
    if value <= 0:
        return "none"
    if value >= 0.8:
        return "concentrated"
    return "diversified"


def _a_group_keys(features: Mapping[str, Any], depth: str) -> list[str]:
    route = str(features["route"])
    segment = str(features["activitySegment"])
    horizon = str(int(round(float(features["horizonMonths"]))))
    count = _channel_count_bucket(float(features["knownChannelCount"]))
    concentration = _concentration_bucket(
        float(features["knownChannelConcentration"])
    )
    fine = f"fine|{route}|{segment}|{horizon}|{count}|{concentration}"
    segment_key = f"segment|{route}|{segment}|{horizon}"
    route_key = f"route|{route}|{horizon}"
    horizon_key = f"horizon|{horizon}"
    if depth == "fine":
        return [fine, segment_key, route_key, horizon_key, "global"]
    if depth == "coarse":
        return [segment_key, route_key, horizon_key, "global"]
    raise C3Error("C3-A hierarchy depth differs")


def fit_c3a(
    records: Sequence[Mapping[str, Any]],
    prediction_origin: str,
    spec: Mapping[str, Any],
    candidate_id: str,
) -> dict[str, Any]:
    """Fit hierarchical signed B4 residuals with deterministic shrinkage."""

    config = candidate_configs(spec).get(candidate_id)
    if config is None or config["family"] != "c3A":
        raise C3Error("C3-A fit received a candidate outside its frozen family")
    ordered = _ordered_training_records(records, prediction_origin, spec)
    residuals = [record["actual"] - record["b4Prediction"] for record in ordered]
    quantile = float(
        spec["candidateSpace"]["c3A"]["winsorAbsoluteResidualQuantile"]
    )
    absolute_cap = _quantile([abs(value) for value in residuals], quantile)
    grouped: dict[str, list[float]] = defaultdict(list)
    for record, residual in zip(ordered, residuals):
        clipped = max(-absolute_cap, min(absolute_cap, residual))
        for key in _a_group_keys(record["features"], config["hierarchyDepth"]):
            grouped[key].append(clipped)
    prior = float(config["shrinkagePrior"])
    stats: dict[str, dict[str, Any]] = {}
    for key in sorted(grouped):
        values = sorted(grouped[key])
        mean = math.fsum(values) / len(values)
        stats[key] = {
            "caseCount": len(values),
            "winsorizedMeanResidual": mean,
            "shrunkResidual": (len(values) / (len(values) + prior)) * mean,
        }
    available = len(ordered) >= int(
        spec["candidateSpace"]["c3A"]["minimumGlobalCases"]
    )
    payload = {
        "schema": "m2.c3a.hierarchical_residual.v1",
        "candidateId": candidate_id,
        "family": "c3A",
        "predictionOrigin": prediction_origin,
        "trainingCaseCount": len(ordered),
        "trainingOrigins": sorted({record["origin"] for record in ordered}),
        "trainingDigest": canonical_digest(ordered),
        "fitKey": canonical_digest(
            {
                "family": "c3A",
                "predictionOrigin": prediction_origin,
                "hierarchyDepth": config["hierarchyDepth"],
                "shrinkagePrior": prior,
                "trainingDigest": canonical_digest(ordered),
            }
        ),
        "hierarchyDepth": config["hierarchyDepth"],
        "shrinkagePrior": prior,
        "correctionCap": float(config["correctionCap"]),
        "absoluteResidualWinsorCap": absolute_cap,
        "groupStats": stats,
        "available": available,
        "fallback": "B4",
        "identityFeaturesUsed": False,
        "postCutoffFeaturesUsed": False,
    }
    return payload


def _design_rows(
    ordered: Sequence[Mapping[str, Any]],
    preprocessor: Mapping[str, Any],
    spec: Mapping[str, Any],
) -> list[list[float]]:
    return [
        [1.0] + transform_features(record["features"], preprocessor, spec)
        for record in ordered
    ]


def _solve_linear_system(
    matrix: Sequence[Sequence[float]], values: Sequence[float]
) -> list[float]:
    size = len(values)
    if len(matrix) != size or any(len(row) != size for row in matrix):
        raise C3Error("C3 linear system shape differs")
    augmented = [
        [float(value) for value in matrix[index]] + [float(values[index])]
        for index in range(size)
    ]
    for column in range(size):
        pivot = max(range(column, size), key=lambda row: abs(augmented[row][column]))
        if abs(augmented[pivot][column]) < 1e-12:
            augmented[pivot][column] += 1e-8
        augmented[column], augmented[pivot] = augmented[pivot], augmented[column]
        divisor = augmented[column][column]
        if abs(divisor) < 1e-20:
            raise C3Error("C3 linear system is singular")
        augmented[column] = [value / divisor for value in augmented[column]]
        for row in range(size):
            if row == column:
                continue
            factor = augmented[row][column]
            if factor == 0:
                continue
            augmented[row] = [
                left - factor * right
                for left, right in zip(augmented[row], augmented[column])
            ]
    return [augmented[index][-1] for index in range(size)]


def _ridge_fit(
    design: Sequence[Sequence[float]], targets: Sequence[float], l2: float
) -> list[float]:
    if not design or len(design) != len(targets):
        raise C3Error("C3 ridge training shape differs")
    width = len(design[0])
    if any(len(row) != width for row in design):
        raise C3Error("C3 ridge design width differs")
    matrix = [[0.0 for _ in range(width)] for _ in range(width)]
    vector = [0.0 for _ in range(width)]
    for row, target in zip(design, targets):
        for left in range(width):
            vector[left] += float(row[left]) * float(target)
            for right in range(width):
                matrix[left][right] += float(row[left]) * float(row[right])
    for index in range(1, width):
        matrix[index][index] += float(l2)
    matrix[0][0] += 1e-8
    return _solve_linear_system(matrix, vector)


def _linear_predict(weights: Sequence[float], features: Sequence[float]) -> float:
    row = [1.0] + [float(value) for value in features]
    if len(row) != len(weights):
        raise C3Error("C3 linear prediction width differs")
    return math.fsum(weight * value for weight, value in zip(weights, row))


def _logistic_fit(
    design: Sequence[Sequence[float]],
    targets: Sequence[float],
    *,
    l2: float,
    iterations: int,
    learning_rate: float,
) -> list[float]:
    if not design or len(design) != len(targets):
        raise C3Error("C3 logistic training shape differs")
    width = len(design[0])
    weights = [0.0 for _ in range(width)]
    for iteration in range(int(iterations)):
        gradients = [0.0 for _ in range(width)]
        for row, target in zip(design, targets):
            linear = max(-35.0, min(35.0, math.fsum(
                weight * value for weight, value in zip(weights, row)
            )))
            probability = 1.0 / (1.0 + math.exp(-linear))
            error = probability - float(target)
            for index, value in enumerate(row):
                gradients[index] += error * float(value)
        for index in range(1, width):
            gradients[index] += float(l2) * weights[index]
        step = float(learning_rate) / math.sqrt(iteration + 1.0)
        for index in range(width):
            weights[index] -= step * gradients[index] / len(design)
    return weights


def _preprocessor_matches(
    preprocessor: Mapping[str, Any], prediction_origin: str
) -> bool:
    return (
        preprocessor.get("schema") == "m2.c3.fold_local_preprocessor.v1"
        and preprocessor.get("predictionOrigin") == prediction_origin
        and preprocessor.get("fitScope") == "inner_origin_fold_only"
    )


def fit_c3b(
    records: Sequence[Mapping[str, Any]],
    prediction_origin: str,
    spec: Mapping[str, Any],
    candidate_id: str,
    *,
    preprocessor: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Fit a deterministic positive hurdle and conditional log-amount model."""

    config = candidate_configs(spec).get(candidate_id)
    if config is None or config["family"] != "c3B":
        raise C3Error("C3-B fit received a candidate outside its frozen family")
    ordered = _ordered_training_records(records, prediction_origin, spec)
    processor = (
        copy.deepcopy(dict(preprocessor))
        if preprocessor is not None
        else fit_preprocessor(ordered, prediction_origin, spec)
    )
    if not _preprocessor_matches(processor, prediction_origin):
        raise C3Error("C3-B preprocessor was not fit for this inner origin")
    design = _design_rows(ordered, processor, spec)
    positive_targets = [1.0 if record["actual"] > 0.0 else 0.0 for record in ordered]
    positive_design = [
        row for row, target in zip(design, positive_targets) if target == 1.0
    ]
    amount_targets = [
        math.log1p(max(0.0, record["actual"]))
        for record in ordered
        if record["actual"] > 0.0
    ]
    b_spec = spec["candidateSpace"]["c3B"]
    available = (
        len(ordered) >= int(b_spec["minimumTrainingCases"])
        and len(positive_design) >= int(b_spec["minimumPositiveCases"])
        and len(positive_design) < len(ordered)
    )
    logistic_weights: list[float] = []
    amount_weights: list[float] = []
    if available:
        logistic_weights = _logistic_fit(
            design,
            positive_targets,
            l2=float(config["l2"]),
            iterations=int(b_spec["logisticIterations"]),
            learning_rate=float(b_spec["logisticLearningRate"]),
        )
        amount_weights = _ridge_fit(
            positive_design, amount_targets, float(config["l2"])
        )
    training_digest = canonical_digest(ordered)
    return {
        "schema": "m2.c3b.positive_hurdle.v1",
        "candidateId": candidate_id,
        "family": "c3B",
        "predictionOrigin": prediction_origin,
        "trainingCaseCount": len(ordered),
        "positiveTrainingCaseCount": len(positive_design),
        "trainingOrigins": sorted({record["origin"] for record in ordered}),
        "trainingDigest": training_digest,
        "fitKey": canonical_digest(
            {
                "family": "c3B",
                "predictionOrigin": prediction_origin,
                "l2": config["l2"],
                "preprocessorDigest": processor["digest"],
                "trainingDigest": training_digest,
            }
        ),
        "l2": float(config["l2"]),
        "b4AnchorWeight": float(config["b4AnchorWeight"]),
        "correctionCap": float(config["correctionCap"]),
        "preprocessor": processor,
        "logisticWeights": logistic_weights,
        "amountWeights": amount_weights,
        "available": available,
        "fallback": "B4",
        "twoStage": True,
        "identityFeaturesUsed": False,
        "postCutoffFeaturesUsed": False,
    }


def fit_c3c(
    records: Sequence[Mapping[str, Any]],
    prediction_origin: str,
    spec: Mapping[str, Any],
    candidate_id: str,
    *,
    preprocessor: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Fit a ridge correction to log1p(actual) - log1p(B4)."""

    config = candidate_configs(spec).get(candidate_id)
    if config is None or config["family"] != "c3C":
        raise C3Error("C3-C fit received a candidate outside its frozen family")
    ordered = _ordered_training_records(records, prediction_origin, spec)
    processor = (
        copy.deepcopy(dict(preprocessor))
        if preprocessor is not None
        else fit_preprocessor(ordered, prediction_origin, spec)
    )
    if not _preprocessor_matches(processor, prediction_origin):
        raise C3Error("C3-C preprocessor was not fit for this inner origin")
    design = _design_rows(ordered, processor, spec)
    targets = [
        math.log1p(max(0.0, record["actual"]))
        - math.log1p(record["b4Prediction"])
        for record in ordered
    ]
    available = len(ordered) >= int(
        spec["candidateSpace"]["c3C"]["minimumTrainingCases"]
    )
    weights = _ridge_fit(design, targets, float(config["l2"])) if available else []
    training_digest = canonical_digest(ordered)
    return {
        "schema": "m2.c3c.log_b4_offset.v1",
        "candidateId": candidate_id,
        "family": "c3C",
        "predictionOrigin": prediction_origin,
        "trainingCaseCount": len(ordered),
        "trainingOrigins": sorted({record["origin"] for record in ordered}),
        "trainingDigest": training_digest,
        "fitKey": canonical_digest(
            {
                "family": "c3C",
                "predictionOrigin": prediction_origin,
                "l2": config["l2"],
                "preprocessorDigest": processor["digest"],
                "trainingDigest": training_digest,
            }
        ),
        "l2": float(config["l2"]),
        "shrinkage": float(config["shrinkage"]),
        "logCorrectionCap": float(config["logCorrectionCap"]),
        "preprocessor": processor,
        "weights": weights,
        "available": available,
        "fallback": "B4",
        "identityFeaturesUsed": False,
        "postCutoffFeaturesUsed": False,
    }


def fit_candidate(
    records: Sequence[Mapping[str, Any]],
    prediction_origin: str,
    spec: Mapping[str, Any],
    candidate_id: str,
    *,
    preprocessor: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    family = candidate_configs(spec).get(candidate_id, {}).get("family")
    if family == "c3A":
        return fit_c3a(records, prediction_origin, spec, candidate_id)
    if family == "c3B":
        return fit_c3b(
            records,
            prediction_origin,
            spec,
            candidate_id,
            preprocessor=preprocessor,
        )
    if family == "c3C":
        return fit_c3c(
            records,
            prediction_origin,
            spec,
            candidate_id,
            preprocessor=preprocessor,
        )
    if family == "c3S":
        raise C3Error("C3-S uses earlier OOF activation, not a direct target fit")
    raise C3Error("candidate is outside the frozen C3 space")


def _wape(predictions: Sequence[float], actuals: Sequence[float]) -> float:
    denominator = math.fsum(abs(float(value)) for value in actuals)
    numerator = math.fsum(
        abs(float(prediction) - float(actual))
        for prediction, actual in zip(predictions, actuals)
    )
    if denominator <= 0:
        return 0.0 if numerator <= TOLERANCE else math.inf
    return numerator / denominator


def _signed_bias(predictions: Sequence[float], actuals: Sequence[float]) -> float:
    denominator = math.fsum(float(value) for value in actuals)
    numerator = math.fsum(
        float(prediction) - float(actual)
        for prediction, actual in zip(predictions, actuals)
    )
    if abs(denominator) <= TOLERANCE:
        return 0.0 if abs(numerator) <= TOLERANCE else math.copysign(math.inf, numerator)
    return numerator / denominator


def _validated_oof_record(
    record: Mapping[str, Any], prediction_origin: str
) -> dict[str, Any]:
    required = {
        "origin",
        "targetEnd",
        "labelAvailableAsOf",
        "horizon",
        "actual",
        "b4Prediction",
        "c3APrediction",
        "c3BPrediction",
        "c3CPrediction",
    }
    if set(record) != required:
        raise C3Error("C3-S OOF record schema differs")
    origin = str(record["origin"])
    target_end = str(record["targetEnd"])
    available = str(record["labelAvailableAsOf"])
    if origin >= prediction_origin or target_end > prediction_origin or available > prediction_origin:
        raise C3Error("C3-S received same/later or label-unavailable OOF evidence")
    output = {
        "origin": origin,
        "targetEnd": target_end,
        "labelAvailableAsOf": available,
        "horizon": int(record["horizon"]),
    }
    for name in (
        "actual",
        "b4Prediction",
        "c3APrediction",
        "c3BPrediction",
        "c3CPrediction",
    ):
        output[name] = base.require_finite_number(record[name], f"C3-S OOF {name}")
        if name != "actual" and output[name] < 0:
            raise C3Error("C3-S OOF prediction is negative")
    return output


def _stack_value(record: Mapping[str, Any], weights: Mapping[str, float]) -> float:
    return math.fsum(
        float(weights[family]) * float(record[f"{family}Prediction"])
        for family in ("c3A", "c3B", "c3C")
    )


def evaluate_c3s_activation(
    oof_records: Sequence[Mapping[str, Any]],
    prediction_origin: str,
    spec: Mapping[str, Any],
) -> dict[str, Any]:
    """Evaluate preregistered stacks using strictly earlier OOF evidence only."""

    records = sorted(
        (_validated_oof_record(record, prediction_origin) for record in oof_records),
        key=lambda record: base.canonical_json_bytes(record),
    )
    rule = spec["C3SActivation"]
    origins = sorted({record["origin"] for record in records})
    minimum_origins = int(rule["minimumStrictlyEarlierOofValidationOrigins"])
    b4_values = [float(record["b4Prediction"]) for record in records]
    actuals = [float(record["actual"]) for record in records]
    b4_wape = _wape(b4_values, actuals) if records else None
    b4_bias = _signed_bias(b4_values, actuals) if records else None
    evidence: dict[str, dict[str, Any]] = {}
    eligible: list[str] = []
    configs = candidate_configs(spec)
    for candidate_id in candidate_ids(spec, "c3S"):
        weights = configs[candidate_id]["weights"]
        predictions = [_stack_value(record, weights) for record in records]
        stack_wape = _wape(predictions, actuals) if records else None
        stack_bias = _signed_bias(predictions, actuals) if records else None
        origin_wins = 0
        for origin in origins:
            indexes = [
                index for index, record in enumerate(records) if record["origin"] == origin
            ]
            origin_actuals = [actuals[index] for index in indexes]
            if _wape(
                [predictions[index] for index in indexes], origin_actuals
            ) < _wape([b4_values[index] for index in indexes], origin_actuals) - TOLERANCE:
                origin_wins += 1
        win_share = origin_wins / len(origins) if origins else 0.0
        improvement = (
            (float(b4_wape) - float(stack_wape)) / float(b4_wape)
            if b4_wape not in (None, 0.0) and math.isfinite(float(b4_wape))
            else (1.0 if b4_wape == 0.0 and stack_wape == 0.0 else None)
        )
        horizon_regressions: dict[str, float | None] = {}
        horizon_safe = True
        for horizon in sorted({record["horizon"] for record in records}):
            indexes = [
                index
                for index, record in enumerate(records)
                if int(record["horizon"]) == int(horizon)
            ]
            horizon_actuals = [actuals[index] for index in indexes]
            baseline = _wape([b4_values[index] for index in indexes], horizon_actuals)
            stacked = _wape([predictions[index] for index in indexes], horizon_actuals)
            regression = (
                (stacked - baseline) / baseline
                if baseline > 0 and math.isfinite(baseline)
                else (0.0 if stacked <= baseline + TOLERANCE else None)
            )
            horizon_regressions[str(horizon)] = regression
            if regression is None or regression > float(
                rule["eachHorizonRelativeWapeRegressionMaximum"]
            ):
                horizon_safe = False
        bias_safe = (
            stack_bias is not None
            and b4_bias is not None
            and abs(float(stack_bias)) <= abs(float(b4_bias)) + TOLERANCE
        )
        passed = bool(
            len(origins) >= minimum_origins
            and win_share >= float(rule["minimumOriginWinShare"])
            and improvement is not None
            and improvement >= float(rule["minimumAggregateWapeImprovement"])
            and bias_safe
            and horizon_safe
        )
        if passed:
            eligible.append(candidate_id)
        evidence[candidate_id] = {
            "oofCaseCount": len(records),
            "oofValidationOriginCount": len(origins),
            "originWinShare": win_share,
            "aggregateWape": stack_wape,
            "b4AggregateWape": b4_wape,
            "aggregateWapeImprovement": improvement,
            "absoluteBias": abs(float(stack_bias)) if stack_bias is not None else None,
            "b4AbsoluteBias": abs(float(b4_bias)) if b4_bias is not None else None,
            "horizonRelativeWapeRegression": horizon_regressions,
            "passed": passed,
        }
    selected = (
        min(
            eligible,
            key=lambda candidate_id: (
                float(evidence[candidate_id]["aggregateWape"]), candidate_id
            ),
        )
        if eligible
        else None
    )
    return {
        "schema": "m2.c3s.earlier_oof_activation.v1",
        "predictionOrigin": prediction_origin,
        "strictlyEarlierOofOnly": True,
        "outerActualUsed": False,
        "oofRecordDigest": canonical_digest(records),
        "oofValidationOrigins": origins,
        "candidateEvidence": evidence,
        "eligibleCandidates": eligible,
        "active": bool(eligible),
        "selectedCandidateId": selected,
        "otherwise": "skip",
        "fallback": "B4",
    }


def _bounded_correction(anchor: float, proposed: float, cap_ratio: float, scale: float) -> tuple[float, float]:
    cap = max(1.0, abs(float(anchor)), abs(float(scale))) * float(cap_ratio)
    correction = max(-cap, min(cap, float(proposed) - float(anchor)))
    return max(0.0, float(anchor) + correction), correction


def _predict_c3a(
    features: Mapping[str, Any],
    anchor: float,
    model: Mapping[str, Any] | None,
    config: Mapping[str, Any],
    spec: Mapping[str, Any],
) -> tuple[float, dict[str, Any]]:
    if (
        model is None
        or model.get("schema") != "m2.c3a.hierarchical_residual.v1"
        or model.get("available") is not True
        or model.get("hierarchyDepth") != config["hierarchyDepth"]
        or float(model.get("shrinkagePrior", -1.0))
        != float(config["shrinkagePrior"])
    ):
        return anchor, {"fallbackToB4": True, "reason": "insufficient_C3A_evidence"}
    minimum = int(spec["candidateSpace"]["c3A"]["minimumGroupCases"])
    minimum_global = int(spec["candidateSpace"]["c3A"]["minimumGlobalCases"])
    selected_key = None
    stat = None
    for key in _a_group_keys(features, str(config["hierarchyDepth"])):
        candidate = model["groupStats"].get(key)
        required = minimum_global if key == "global" else minimum
        if candidate is not None and int(candidate["caseCount"]) >= required:
            selected_key = key
            stat = candidate
            break
    if stat is None:
        return anchor, {"fallbackToB4": True, "reason": "no_C3A_group_evidence"}
    point, correction = _bounded_correction(
        anchor,
        anchor + float(stat["shrunkResidual"]),
        float(config["correctionCap"]),
        float(features["trailing12Cash"]),
    )
    return point, {
        "fallbackToB4": False,
        "hierarchyLevel": selected_key,
        "evidenceCaseCount": int(stat["caseCount"]),
        "correction": correction,
    }


def _predict_c3b(
    features: Mapping[str, Any],
    anchor: float,
    model: Mapping[str, Any] | None,
    config: Mapping[str, Any],
    spec: Mapping[str, Any],
) -> tuple[float, dict[str, Any]]:
    if (
        model is None
        or model.get("schema") != "m2.c3b.positive_hurdle.v1"
        or model.get("available") is not True
        or float(model.get("l2", -1.0)) != float(config["l2"])
    ):
        return anchor, {"fallbackToB4": True, "reason": "insufficient_C3B_evidence"}
    vector = transform_features(features, model["preprocessor"], spec)
    logit = max(-35.0, min(35.0, _linear_predict(model["logisticWeights"], vector)))
    probability = 1.0 / (1.0 + math.exp(-logit))
    conditional_log = max(0.0, min(30.0, _linear_predict(model["amountWeights"], vector)))
    hurdle_point = probability * math.expm1(conditional_log)
    weight = float(config["b4AnchorWeight"])
    proposed = weight * anchor + (1.0 - weight) * hurdle_point
    point, correction = _bounded_correction(
        anchor,
        proposed,
        float(config["correctionCap"]),
        float(features["trailing12Cash"]),
    )
    return point, {
        "fallbackToB4": False,
        "positiveProbability": probability,
        "conditionalPositiveAmount": math.expm1(conditional_log),
        "correction": correction,
    }


def _predict_c3c(
    features: Mapping[str, Any],
    anchor: float,
    model: Mapping[str, Any] | None,
    config: Mapping[str, Any],
    spec: Mapping[str, Any],
) -> tuple[float, dict[str, Any]]:
    if (
        model is None
        or model.get("schema") != "m2.c3c.log_b4_offset.v1"
        or model.get("available") is not True
        or float(model.get("l2", -1.0)) != float(config["l2"])
    ):
        return anchor, {"fallbackToB4": True, "reason": "insufficient_C3C_evidence"}
    vector = transform_features(features, model["preprocessor"], spec)
    raw_delta = _linear_predict(model["weights"], vector)
    delta = float(config["shrinkage"]) * raw_delta
    cap = float(config["logCorrectionCap"])
    delta = max(-cap, min(cap, delta))
    point = max(0.0, math.expm1(math.log1p(anchor) + delta))
    return point, {
        "fallbackToB4": False,
        "rawLogCorrection": raw_delta,
        "appliedLogCorrection": delta,
        "correction": point - anchor,
    }


def predict_c3s_point(
    *,
    candidate_id: str,
    component_points: Mapping[str, Any],
    activation: Mapping[str, Any] | None,
    anchor: float,
    spec: Mapping[str, Any],
) -> tuple[float, dict[str, Any]]:
    """Apply one preregistered convex stack only after earlier-OOF activation."""

    config = candidate_configs(spec).get(candidate_id)
    if config is None or config["family"] != "c3S":
        raise C3Error("C3-S point received a candidate outside its frozen family")
    if activation is None or activation.get("outerActualUsed") is not False:
        return anchor, {"fallbackToB4": True, "reason": "C3S_not_activated"}
    if candidate_id not in activation.get("eligibleCandidates", []):
        return anchor, {"fallbackToB4": True, "reason": "C3S_rule_not_met"}
    if set(component_points) != {"c3A", "c3B", "c3C"}:
        raise C3Error("C3-S component projection differs")
    clean = {
        family: base.require_finite_number(component_points[family], f"C3-S {family}")
        for family in ("c3A", "c3B", "c3C")
    }
    if any(value < 0 for value in clean.values()):
        raise C3Error("C3-S component point is negative")
    point = math.fsum(
        float(config["weights"][family]) * clean[family]
        for family in ("c3A", "c3B", "c3C")
    )
    return point, {
        "fallbackToB4": False,
        "weights": copy.deepcopy(config["weights"]),
        "correction": point - anchor,
    }


def _sanitized_case_state(value: Mapping[str, Any]) -> dict[str, Any]:
    for key in value:
        if key == "caseKey":
            continue
        compact = _compact_key(key)
        if any(fragment in compact for fragment in PREDICTION_FORBIDDEN_FRAGMENTS):
            raise C3Error(f"C3 prediction case state contains forbidden field: {key}")
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
        raise C3Error("C3 prediction case state schema differs")
    key = value["caseKey"]
    if set(key) != {"standard_work_id", "origin", "horizon_months", "route"}:
        raise C3Error("C3 case key schema differs")
    return copy.deepcopy(dict(value))


def _empty_unscoreable(reason: str) -> dict[str, Any]:
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
    fitted_model: Mapping[str, Any] | None,
    cutoff_top10: bool = False,
    high_value_override_allowed: bool = False,
    stack_activation: Mapping[str, Any] | None = None,
    stack_component_points: Mapping[str, Any] | None = None,
    cash_commitment_snapshots: Sequence[Mapping[str, Any]] | None = None,
    feature_overrides: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Produce one C3 point from cutoff-only inputs through the formal route."""

    state = _sanitized_case_state(case_state)
    if feature_overrides is not None:
        _reject_forbidden_mapping(feature_overrides, prediction=True)
        raise C3Error("C3 prediction does not permit caller feature overrides")
    key = state["caseKey"]
    work_id = str(key["standard_work_id"])
    route = str(key["route"])
    if (
        work_id != str(work.get("standard_work_id", ""))
        or str(key["origin"]) != origin
        or int(key["horizon_months"]) != int(horizon)
    ):
        raise C3Error("C3 work/origin/horizon differs from its frozen case key")
    scoreable = state["statisticallyScoreable"]
    serving = state["businessServingEligible"]
    if type(scoreable) is not bool or type(serving) is not bool:
        raise C3Error("C3 frozen state must use native booleans")
    requested_candidate = str(candidate_id)
    if requested_candidate != "B4" and requested_candidate not in candidate_configs(spec):
        raise C3Error("C3 prediction candidate is outside the frozen space")
    effective_candidate = requested_candidate
    model_features: dict[str, Any] = {}
    correction_evidence: dict[str, Any] = {
        "fallbackToB4": True,
        "reason": "route_or_scoreability_not_applicable",
    }
    structural_fallback = False
    guard_fallback = False
    anchor: float | None = None
    sales_point: float | None = None
    if route in SALES_ROUTES and scoreable:
        if comparator_rows is None:
            raise C3Error("scoreable C3 sales case lacks the locked B4 anchor")
        anchor = b4_point(comparator_rows)
        model_features = extract_cutoff_features(
            work=work,
            origin=origin,
            horizon=int(horizon),
            route=route,
            comparator_rows=comparator_rows,
            calibration_spec=calibration_spec,
            spec=spec,
        )
        minimum_history = int(
            _c2_spec()["candidateSpace"]["parameters"][
                "minimumChannelHistoryMonthsBeforeOverride"
            ]
        )
        model_override_allowed = bool(
            float(model_features["historyObservedMonths"]) >= minimum_history
            and float(model_features["positiveMonthCount"]) > 0
        )
        if not model_override_allowed and effective_candidate != "B4":
            effective_candidate = "B4"
            structural_fallback = True
        if cutoff_top10 and effective_candidate != "B4" and not high_value_override_allowed:
            effective_candidate = "B4"
            guard_fallback = True
        if effective_candidate == "B4":
            sales_point = anchor
            correction_evidence = {
                "fallbackToB4": requested_candidate != "B4",
                "reason": (
                    "mandatory_B4_region"
                    if structural_fallback
                    else "high_value_guard"
                    if guard_fallback
                    else "B4_requested"
                ),
                "correction": 0.0,
            }
        else:
            config = candidate_configs(spec)[effective_candidate]
            family = config["family"]
            if family == "c3A":
                sales_point, correction_evidence = _predict_c3a(
                    model_features, anchor, fitted_model, config, spec
                )
            elif family == "c3B":
                sales_point, correction_evidence = _predict_c3b(
                    model_features, anchor, fitted_model, config, spec
                )
            elif family == "c3C":
                sales_point, correction_evidence = _predict_c3c(
                    model_features, anchor, fitted_model, config, spec
                )
            else:
                sales_point, correction_evidence = predict_c3s_point(
                    candidate_id=effective_candidate,
                    component_points=stack_component_points or {},
                    activation=stack_activation,
                    anchor=anchor,
                    spec=spec,
                )
        months = [base.add_months(origin, offset) for offset in range(1, int(horizon) + 1)]
        monthly_value = float(sales_point) / int(horizon)
        composed = cash.compose_future_cash_forecast(
            standard_work_id=work_id,
            route=route,
            origin=origin,
            horizon=int(horizon),
            sales_monthly_prediction={month: monthly_value for month in months},
            cash_commitment_snapshots=list(cash_commitment_snapshots or []),
            statistically_scoreable=True,
            business_serving_eligible=serving,
            business_abstention_reason=state.get("abstentionReason"),
            sales_confidence="medium",
        )
    elif route in SALES_ROUTES:
        if comparator_rows is None or "B4" not in comparator_rows:
            raise C3Error("unscoreable C3 sales case lacks the locked B4 boundary")
        locked_b4 = comparator_rows["B4"]
        available = bool(locked_b4.get("modelPredictionAvailable"))
        route_abstained = bool(locked_b4.get("routeAbstained"))
        abstained = bool(locked_b4.get("abstained"))
        raw = locked_b4.get("rawModelPrediction")
        anchor = (
            base.require_finite_number(raw, "C3 unscoreable locked B4 point")
            if raw is not None
            else None
        )
        if available != (anchor is not None):
            raise C3Error("C3 unscoreable locked B4 availability differs")
        reason = state.get("abstentionReason") or state.get("scoreabilityReason")
        limitations = [str(reason)] if reason else []
        sales_point = anchor
        correction_evidence = {
            "fallbackToB4": True,
            "reason": "unscoreable_locked_B4_boundary",
            "correction": 0.0 if anchor is not None else None,
        }
        composed = {
            "modelPredictionAvailable": available,
            "routeAbstained": route_abstained,
            "abstained": abstained,
            "abstentionReason": reason,
            "rawModelPrediction": anchor,
            "servedPrediction": None,
            "annualBreakdown": [],
            "confidence": "unavailable",
            "limitation": limitations,
            "confirmedCashComponents": [],
            "public_output": {
                "pointForecast": None,
                "annualBreakdown": [],
                "confidence": "unavailable",
                "limitation": limitations,
            },
        }
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
        composed = _empty_unscoreable(
            str(state.get("scoreabilityReason") or "model_prediction_unavailable")
        )
    limitations = set(composed.get("limitation", []))
    if structural_fallback:
        limitations.add("mandatory_B4_region_fallback")
    if guard_fallback:
        limitations.add("high_value_guard_fallback_to_B4")
    if correction_evidence.get("fallbackToB4") and requested_candidate != "B4":
        limitations.add("C3_insufficient_or_unsafe_signal_fallback_to_B4")
    public_output = copy.deepcopy(composed["public_output"])
    public_output["limitation"] = sorted(limitations)
    raw = composed["rawModelPrediction"]
    row = {
        "model_id": "C3",
        "candidate_id": effective_candidate,
        "requested_candidate_id": requested_candidate,
        "case_key": copy.deepcopy(key),
        "route": route,
        "activity_segment": model_features.get("activitySegment", "route_abstain"),
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
        "b4AnchorPoint": anchor,
        "c3SalesCashPoint": sales_point,
        "c3CorrectionApplied": (
            None if anchor is None or sales_point is None else sales_point - anchor
        ),
        "correctionEvidence": copy.deepcopy(correction_evidence),
        "modelFeatureProjection": copy.deepcopy(model_features),
        "structuralFallbackToB4": structural_fallback,
        "highValueGuardFallbackToB4": guard_fallback,
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
        raise C3Error("C3 public output fields differ")
    if route == "pure_buyout" and scoreable and not cash_commitment_snapshots:
        if (
            row["rawModelPrediction"] is not None
            or row["servedPrediction"] is not None
            or row["routeAbstained"] is not True
            or row["abstentionReason"]
            != "uncommitted_future_buyout_not_forecastable"
        ):
            raise C3Error("C3 pure-buyout no-commitment abstention differs")
    if route == "buyout_plus_sales" and row["futureBuyoutPredicted"] is not False:
        raise C3Error("C3 mixed route predicts an uncommitted buyout")
    return row


def _synthetic_work(values: Sequence[float], *, work_id: str) -> dict[str, Any]:
    start = "2020-01"
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


def _synthetic_comparators(point: float = 120.0) -> dict[str, dict[str, Any]]:
    return {
        "B4": {
            "channelComponents": [
                {
                    "channel_key": "synthetic-channel",
                    "point_forecast": float(point),
                }
            ]
        }
    }


def synthetic_self_test() -> dict[str, Any]:
    """Exercise the frozen C3 core without reading any private artifact."""

    spec = load_spec()
    calibration_spec = base.load_spec()
    origin = "2022-12"
    values = [10.0 + (index % 4) for index in range(36)]
    work = _synthetic_work(values, work_id="SYNTHETIC-C3")
    comparators = _synthetic_comparators()
    features = extract_cutoff_features(
        work=work,
        origin=origin,
        horizon=3,
        route="pure_sales_share",
        comparator_rows=comparators,
        calibration_spec=calibration_spec,
        spec=spec,
    )
    earlier_origins = ("2020-12", "2021-06", "2021-12")
    training: list[dict[str, Any]] = []
    for index in range(60):
        record_features = copy.deepcopy(features)
        anchor = 80.0 + float(index % 11)
        record_features["b4Prediction"] = anchor
        record_features["historyObservedMonths"] = 12.0 + float(index % 18)
        record_features["historyCashTotal"] = 120.0 + float(index * 2)
        record_features["trailing12Cash"] = 80.0 + float(index % 20)
        record_features["trailing6Cash"] = 40.0 + float(index % 10)
        record_features["trailing3Cash"] = 20.0 + float(index % 6)
        record_features["trend12"] = float((index % 7) - 3) / 10.0
        record_features["volatility12"] = 1.0 + float(index % 5)
        record_features["knownChannelCount"] = 1.0 + float(index % 2)
        record_features["knownChannelConcentration"] = (
            1.0 if index % 2 == 0 else 0.65
        )
        earlier = earlier_origins[index % len(earlier_origins)]
        actual = 0.0 if index % 3 == 0 else anchor * 0.82 + float(index % 5)
        training.append(
            {
                "origin": earlier,
                "targetEnd": base.add_months(earlier, 3),
                "labelAvailableAsOf": base.add_months(earlier, 3),
                "features": record_features,
                "actual": actual,
                "b4Prediction": anchor,
            }
        )
    processor = fit_preprocessor(training, origin, spec)
    processor_reversed = fit_preprocessor(list(reversed(training)), origin, spec)
    a_id = candidate_ids(spec, "c3A")[0]
    b_id = candidate_ids(spec, "c3B")[0]
    c_id = candidate_ids(spec, "c3C")[0]
    a_model = fit_c3a(training, origin, spec, a_id)
    a_model_reversed = fit_c3a(list(reversed(training)), origin, spec, a_id)
    b_model = fit_c3b(
        training, origin, spec, b_id, preprocessor=processor
    )
    c_model = fit_c3c(
        training, origin, spec, c_id, preprocessor=processor
    )
    state = _synthetic_case_state(
        "SYNTHETIC-C3", origin, 3, "pure_sales_share"
    )
    a_prediction = predict_as_of(
        work=work,
        origin=origin,
        horizon=3,
        case_state=state,
        comparator_rows=comparators,
        calibration_spec=calibration_spec,
        spec=spec,
        candidate_id=a_id,
        fitted_model=a_model,
        high_value_override_allowed=True,
    )
    b_prediction = predict_as_of(
        work=work,
        origin=origin,
        horizon=3,
        case_state=state,
        comparator_rows=comparators,
        calibration_spec=calibration_spec,
        spec=spec,
        candidate_id=b_id,
        fitted_model=b_model,
        high_value_override_allowed=True,
    )
    c_prediction = predict_as_of(
        work=work,
        origin=origin,
        horizon=3,
        case_state=state,
        comparator_rows=comparators,
        calibration_spec=calibration_spec,
        spec=spec,
        candidate_id=c_id,
        fitted_model=c_model,
        high_value_override_allowed=True,
    )
    perturbed_work = copy.deepcopy(work)
    perturbed_work["current_rating"] = "future-only"
    perturbed_work["current_lifecycle"] = "future-only"
    perturbed_work["current_rights"] = "future-only"
    perturbed_work["current_shelf"] = "future-only"
    perturbed_work["channels"][0]["monthly"]["2023-01"] = 999999.0
    perturbed_work["channels"].append(
        {
            "channel_key": "future-only-channel",
            "business_form": "audio_product",
            "first_observed_month": "2023-01",
            "monthly": {"2023-01": 888888.0},
            "batch_cluster_sizes": {},
        }
    )
    perturbed_prediction = predict_as_of(
        work=perturbed_work,
        origin=origin,
        horizon=3,
        case_state=state,
        comparator_rows=comparators,
        calibration_spec=calibration_spec,
        spec=spec,
        candidate_id=a_id,
        fitted_model=a_model,
        high_value_override_allowed=True,
    )
    mixed = predict_as_of(
        work=work,
        origin=origin,
        horizon=3,
        case_state=_synthetic_case_state(
            "SYNTHETIC-C3", origin, 3, "buyout_plus_sales"
        ),
        comparator_rows=comparators,
        calibration_spec=calibration_spec,
        spec=spec,
        candidate_id="B4",
        fitted_model=None,
    )
    pure_buyout = predict_as_of(
        work=work,
        origin=origin,
        horizon=3,
        case_state=_synthetic_case_state(
            "SYNTHETIC-C3", origin, 3, "pure_buyout"
        ),
        comparator_rows=None,
        calibration_spec=calibration_spec,
        spec=spec,
        candidate_id="B4",
        fitted_model=None,
    )
    identity_rejected = False
    try:
        predict_as_of(
            work=work,
            origin=origin,
            horizon=3,
            case_state=state,
            comparator_rows=comparators,
            calibration_spec=calibration_spec,
            spec=spec,
            candidate_id="B4",
            fitted_model=None,
            feature_overrides={"author": "forbidden"},
        )
    except C3Error:
        identity_rejected = True
    outcome_rejected = False
    try:
        predict_as_of(
            work=work,
            origin=origin,
            horizon=3,
            case_state={**state, "forecastableCashActual": 1.0},
            comparator_rows=comparators,
            calibration_spec=calibration_spec,
            spec=spec,
            candidate_id="B4",
            fitted_model=None,
        )
    except C3Error:
        outcome_rejected = True
    same_or_later_fit_rejected = False
    try:
        fit_c3a(
            [dict(training[0], origin=origin)], origin, spec, a_id
        )
    except C3Error:
        same_or_later_fit_rejected = True
    oof_records: list[dict[str, Any]] = []
    for earlier in earlier_origins:
        for horizon in (3, 6, 12):
            oof_records.append(
                {
                    "origin": earlier,
                    "targetEnd": base.add_months(earlier, min(horizon, 6)),
                    "labelAvailableAsOf": base.add_months(earlier, min(horizon, 6)),
                    "horizon": horizon,
                    "actual": 80.0,
                    "b4Prediction": 100.0,
                    "c3APrediction": 80.0,
                    "c3BPrediction": 80.0,
                    "c3CPrediction": 80.0,
                }
            )
    activation = evaluate_c3s_activation(oof_records, origin, spec)
    empty_activation = evaluate_c3s_activation([], origin, spec)
    json.dumps(empty_activation, allow_nan=False, sort_keys=True)
    s_id = str(activation["selectedCandidateId"])
    s_point, s_evidence = predict_c3s_point(
        candidate_id=s_id,
        component_points={"c3A": 80.0, "c3B": 80.0, "c3C": 80.0},
        activation=activation,
        anchor=100.0,
        spec=spec,
    )
    cutoff_history = c2.work_sales_history_as_of(work, origin, calibration_spec)
    cached_segment = _segment_from_history(
        [float(value) for value in cutoff_history["values"]], _c2_spec()
    )
    reference_segment = c2.segment_as_of(
        work, origin, calibration_spec, _c2_spec()
    )["segment"]
    projection_fields = (
        "rawModelPrediction",
        "servedPrediction",
        "candidate_id",
        "activity_segment",
        "b4AnchorPoint",
        "c3SalesCashPoint",
        "c3CorrectionApplied",
        "correctionEvidence",
        "modelFeatureProjection",
        "public_output",
    )
    counts = candidate_counts(spec)
    checks = {
        "candidateCountsFrozen": counts
        == {"c3A": 8, "c3B": 4, "c3C": 8, "c3S": 4}
        and sum(counts.values()) == 24,
        "deterministicPreprocessor": processor == processor_reversed,
        "deterministicHierarchicalFit": a_model == a_model_reversed,
        "cachedCutoffSegmentMatchesFrozenC2": cached_segment == reference_segment,
        "allFamiliesProduceFinitePoint": all(
            prediction["rawModelPrediction"] is not None
            and math.isfinite(float(prediction["rawModelPrediction"]))
            for prediction in (a_prediction, b_prediction, c_prediction)
        ),
        "futurePerturbationInvariant": all(
            a_prediction.get(field) == perturbed_prediction.get(field)
            for field in projection_fields
        ),
        "pureBuyoutNullAbstain": pure_buyout["rawModelPrediction"] is None
        and pure_buyout["servedPrediction"] is None
        and pure_buyout["routeAbstained"] is True
        and pure_buyout["abstentionReason"]
        == "uncommitted_future_buyout_not_forecastable",
        "mixedExcludesUncommittedFutureBuyout": mixed[
            "excludesUncommittedFutureBuyout"
        ]
        is True
        and mixed["futureBuyoutPredicted"] is False,
        "predictionRejectsIdentityFeature": identity_rejected,
        "predictionRejectsOutcomeField": outcome_rejected,
        "fitRejectsSameOrLaterEvidence": same_or_later_fit_rejected,
        "featureProjectionContainsNoIdentity": set(features) == set(ALLOWED_FEATURES)
        and not any(
            fragment in _compact_key(name)
            for name in features
            for fragment in (
                "workid",
                "title",
                "author",
                "channelkey",
                "channelidentity",
                "actual",
                "outcome",
                "future",
            )
        ),
        "C3SUsesStrictlyEarlierOofOnly": activation["strictlyEarlierOofOnly"]
        is True
        and activation["outerActualUsed"] is False,
        "C3SActivationRuleApplied": activation["active"] is True
        and s_evidence["fallbackToB4"] is False
        and abs(s_point - 80.0) <= TOLERANCE,
        "C3SEmptyEarlierOofEvidenceIsCanonical": empty_activation["active"] is False
        and empty_activation["selectedCandidateId"] is None
        and all(
            evidence["aggregateWapeImprovement"] is None
            for evidence in empty_activation["candidateEvidence"].values()
        ),
        "parentCashAcceptanceCoveragePrivacyInherited": all(
            spec[field] == _c2_spec()[field]
            for field in (
                "formalCashTarget",
                "acceptance",
                "businessCoverageDecision",
                "privacy",
                "seals",
            )
        ),
        "allSealsClosed": all(value is False for value in spec["seals"].values()),
    }
    checks.update(
        {
            "identityFeaturesRejected": checks["predictionRejectsIdentityFeature"]
            and checks["featureProjectionContainsNoIdentity"],
            "actualFieldsRejected": checks["predictionRejectsOutcomeField"],
            "innerOriginOnly": checks["fitRejectsSameOrLaterEvidence"],
            "sameOrLaterOriginRejected": checks["fitRejectsSameOrLaterEvidence"],
            "crossFitOnly": activation["strictlyEarlierOofOnly"] is True,
            "foldLocalPreprocessing": processor["fitScope"]
            == "inner_origin_fold_only",
            "deterministicReplay": checks["deterministicPreprocessor"]
            and checks["deterministicHierarchicalFit"],
            "predictionStateExcludesTruth": checks["predictionRejectsOutcomeField"],
            "pureBuyoutWithoutCommitmentAbstainsNull": checks[
                "pureBuyoutNullAbstain"
            ],
            "zeroImputationUsed": False,
        }
    )
    failed = [
        key
        for key, value in checks.items()
        if (key == "zeroImputationUsed" and value is not False)
        or (key != "zeroImputationUsed" and value is not True)
    ]
    if failed:
        raise C3Error("C3 synthetic self-test failed: " + ", ".join(failed))
    return {
        "status": "passed",
        "privateDataRead": False,
        "candidateCounts": counts,
        "checks": checks,
    }


__all__ = [
    "ALLOWED_FEATURES",
    "C3Error",
    "FAMILIES",
    "NUMERIC_FEATURES",
    "SALES_ROUTES",
    "SPEC_PATH",
    "b4_point",
    "candidate_configs",
    "candidate_counts",
    "candidate_ids",
    "canonical_digest",
    "evaluate_c3s_activation",
    "extract_cutoff_features",
    "fit_c3a",
    "fit_c3b",
    "fit_c3c",
    "fit_candidate",
    "fit_preprocessor",
    "load_spec",
    "predict_as_of",
    "predict_c3s_point",
    "synthetic_self_test",
    "transform_features",
    "validate_features",
]


if __name__ == "__main__":
    if sys.argv[1:] not in ([], ["--self-test"]):
        raise SystemExit("usage: m2_calibration_c3_v1.py [--self-test]")
    print(json.dumps(synthetic_self_test(), ensure_ascii=False, sort_keys=True))
