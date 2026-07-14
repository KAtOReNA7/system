#!/usr/bin/env python3
"""Deterministic B0a -> B0b scoring-correction attribution bridge.

The module is deliberately side-effect free: it accepts already-authorized
in-memory inputs, does not load a database or private file, and returns only
de-identified aggregates and SHA-256 fingerprints.  It never opens embargo,
final-holdout, or long-audit labels.

Stages 2 through 7 are evaluated on one immutable population: the B0b
development-forward rows explicitly marked ``statisticallyScoreable``.  The
legacy cache is used for historical features and serving state only; a missing
legacy key can never remove a case from the model-quality population.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import sys
import unicodedata
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from typing import Any, Mapping, Sequence


ROOT = Path(__file__).resolve().parents[2]
SCRIPT_DIR = Path(__file__).resolve().parent
TEMP_DEPS = Path(os.environ.get("TEMP", "")) / "codex-system-pydeps"
for _candidate in (TEMP_DEPS, SCRIPT_DIR):
    if _candidate.exists() and str(_candidate) not in sys.path:
        sys.path.insert(0, str(_candidate))


class AttributionError(RuntimeError):
    """A frozen attribution or privacy boundary was not satisfied."""


_MISSING = object()
_DEVELOPMENT_ROLE = "development_forward_score"
_FORBIDDEN_ROLE_TOKENS = ("holdout", "embargo", "shadow", "long_audit")
_FROZEN_AMENDMENT_COMMIT = "c64c56be0ad51048647ee450639b1ac91ebef62d"
_FROZEN_AMENDMENT_DIGEST = "5c7945571520b4f229f15c14b29320bf65d11880ae92770fe0513f2a21eb799b"


def _normalize(value: Any) -> Any:
    if isinstance(value, str):
        return unicodedata.normalize("NFC", value)
    if isinstance(value, Mapping):
        return {
            _normalize(str(key)): _normalize(item)
            for key, item in value.items()
        }
    if isinstance(value, (list, tuple)):
        return [_normalize(item) for item in value]
    return value


def _canonical_bytes(value: Any) -> bytes:
    try:
        text = json.dumps(
            _normalize(value),
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        )
    except (TypeError, ValueError) as exc:
        raise AttributionError("attribution payload is not canonical-JSON compatible") from exc
    return text.encode("utf-8")


def _digest(value: Any) -> str:
    return hashlib.sha256(_canonical_bytes(value)).hexdigest()


def _fixed_decimal(value: Any, places: int = 8) -> str:
    try:
        number = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise AttributionError("metric value is not decimal-compatible") from exc
    if not number.is_finite():
        raise AttributionError("metric value is not finite")
    quantum = Decimal(1).scaleb(-places)
    return format(number.quantize(quantum, rounding=ROUND_HALF_UP), "f")


def _rounded(value: float | None, places: int = 8) -> float | None:
    if value is None:
        return None
    if not math.isfinite(float(value)):
        return None
    return round(float(value), places)


def _finite(value: Any, field: str) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise AttributionError(f"{field} must be numeric") from exc
    if not math.isfinite(number):
        raise AttributionError(f"{field} must be finite")
    return number


def _path_value(value: Any, path: Sequence[str]) -> Any:
    current = value
    for key in path:
        if not isinstance(current, Mapping) or key not in current:
            return _MISSING
        current = current[key]
    return current


def _first_path(value: Any, paths: Sequence[Sequence[str]], default: Any = _MISSING) -> Any:
    for path in paths:
        observed = _path_value(value, path)
        if observed is not _MISSING:
            return observed
    if default is not _MISSING:
        return default
    rendered = ", ".join(".".join(path) for path in paths)
    raise AttributionError(f"required field is missing ({rendered})")


def _strict_bool(value: Any, field: str) -> bool:
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"true", "1"}:
            return True
        if lowered in {"false", "0"}:
            return False
        raise AttributionError(f"{field} must be boolean")
    if isinstance(value, (bool, int, float)):
        if value in (True, 1):
            return True
        if value in (False, 0):
            return False
    # numpy.bool_ and equivalent scalar wrappers deliberately remain accepted.
    if type(value).__name__ == "bool_":
        return bool(value)
    raise AttributionError(f"{field} must be boolean")


def _month_ordinal(month: str) -> int:
    try:
        year_text, month_text = str(month).split("-")
        year, number = int(year_text), int(month_text)
    except (TypeError, ValueError) as exc:
        raise AttributionError(f"invalid calendar month: {month!r}") from exc
    if year < 1 or number < 1 or number > 12:
        raise AttributionError(f"invalid calendar month: {month!r}")
    return year * 12 + number - 1


def _ordinal_month(value: int) -> str:
    year, zero_based_month = divmod(int(value), 12)
    return f"{year:04d}-{zero_based_month + 1:02d}"


def _month_range(start: str, end: str) -> list[str]:
    first, last = _month_ordinal(start), _month_ordinal(end)
    if first > last:
        raise AttributionError("authoritative month range is reversed")
    return [_ordinal_month(value) for value in range(first, last + 1)]


def _records(table: Any, key_field: str) -> list[Mapping[str, Any]]:
    if table is None:
        return []
    if hasattr(table, "to_dict"):
        try:
            rows = table.to_dict(orient="records")
        except TypeError:
            rows = table.to_dict("records")
        if isinstance(rows, list):
            return [row for row in rows if isinstance(row, Mapping)]
    if isinstance(table, Mapping):
        rows: list[Mapping[str, Any]] = []
        for key, item in table.items():
            if isinstance(item, Mapping):
                rows.append({key_field: str(key), **dict(item)})
        return rows
    if isinstance(table, Sequence) and not isinstance(table, (str, bytes, bytearray)):
        return [row for row in table if isinstance(row, Mapping)]
    raise AttributionError("legacy table cannot be adapted to records")


def _case_key(row: Mapping[str, Any]) -> tuple[str, str, int, str]:
    key = _first_path(row, (("case_key",), ("caseKey",)))
    if not isinstance(key, Mapping):
        raise AttributionError("case key must be an object")
    work_id = _first_path(key, (("standard_work_id",), ("standardWorkId",)))
    origin = _first_path(key, (("origin",),))
    horizon = _first_path(key, (("horizon_months",), ("horizonMonths",)))
    route = _first_path(key, (("route",),))
    if not str(work_id).strip() or not str(route).strip():
        raise AttributionError("case key has a blank work or route")
    return str(work_id), str(origin), int(horizon), str(route)


def _model_id(row: Mapping[str, Any]) -> str:
    return str(_first_path(row, (("model_id",), ("modelId",)), default=""))


def _row_role(row: Mapping[str, Any]) -> str | None:
    value = _first_path(
        row,
        (
            ("_residual_case_role",),
            ("caseRole",),
            ("case_role",),
            ("scoring", "role"),
            ("role",),
        ),
        default=None,
    )
    return None if value is None or not str(value).strip() else str(value)


def _scoreable(row: Mapping[str, Any]) -> bool:
    value = _first_path(
        row,
        (
            ("statisticallyScoreable",),
            ("statistically_scoreable",),
            ("scoring", "statisticallyScoreable"),
            ("scoring", "statistically_scoreable"),
            ("scoreability", "statisticallyScoreable"),
        ),
    )
    return _strict_bool(value, "statisticallyScoreable")


def _business_serving(row: Mapping[str, Any]) -> bool:
    value = _first_path(
        row,
        (
            ("businessServingEligible",),
            ("business_serving_eligible",),
            ("scoring", "businessServingEligible"),
            ("scoring", "business_serving_eligible"),
            ("serving", "eligible"),
        ),
    )
    return _strict_bool(value, "businessServingEligible")


def _model_prediction_available(row: Mapping[str, Any]) -> bool | None:
    value = _first_path(
        row,
        (
            ("modelPredictionAvailable",),
            ("model_prediction_available",),
            ("scoring", "modelPredictionAvailable"),
            ("scoring", "model_prediction_available"),
        ),
        default=None,
    )
    return None if value is None else _strict_bool(value, "modelPredictionAvailable")


def _raw_prediction(row: Mapping[str, Any]) -> float:
    value = _first_path(
        row,
        (
            ("rawModelPrediction",),
            ("raw_model_prediction",),
            ("scoring", "rawModelPrediction"),
            ("scoring", "raw_model_prediction"),
        ),
    )
    if value is None:
        raise AttributionError("scoreable B0b case has a null rawModelPrediction")
    return _finite(value, "rawModelPrediction")


def _served_prediction_if_present(row: Mapping[str, Any]) -> Any:
    return _first_path(
        row,
        (
            ("servedPrediction",),
            ("served_prediction",),
            ("scoring", "servedPrediction"),
            ("scoring", "served_prediction"),
        ),
        default=_MISSING,
    )


def _abstention_reason(row: Mapping[str, Any]) -> str:
    value = _first_path(
        row,
        (
            ("abstentionReason",),
            ("abstention_reason",),
            ("scoring", "abstentionReason"),
            ("scoring", "abstention_reason"),
            ("serving", "abstentionReason"),
        ),
        default="",
    )
    return "" if value is None else str(value).strip()


def _stratum_bool(row: Mapping[str, Any], snake_name: str, camel_name: str) -> bool:
    value = _first_path(
        row,
        (
            ("strata", snake_name),
            ("strata", camel_name),
            (snake_name,),
            (camel_name,),
        ),
    )
    return _strict_bool(value, f"strata.{snake_name}")


def _forward_score_origins(spec: Mapping[str, Any]) -> set[str]:
    raw = _first_path(
        spec,
        (("origins", "forwardValidation", "scoreOrigins"),),
        default=[],
    )
    if not isinstance(raw, Sequence) or isinstance(raw, (str, bytes, bytearray)):
        raise AttributionError("forward score origins must be an array")
    return {str(value) for value in raw}


def _validate_frozen_binding(
    base_spec: Mapping[str, Any], amendment: Mapping[str, Any] | None
) -> dict[str, Any]:
    if amendment is None:
        raise AttributionError("calibration-spec-v1.1 amendment is required")
    if amendment.get("schema") != "m2.calibration_spec.v1_1.amendment":
        raise AttributionError("calibration-spec-v1.1 amendment schema mismatch")
    if amendment.get("version") != "calibration-spec-v1.1-amendment":
        raise AttributionError("calibration-spec-v1.1 amendment version mismatch")
    amendment_digest = _digest(amendment)
    if amendment_digest != _FROZEN_AMENDMENT_DIGEST:
        raise AttributionError("amendment bytes do not match frozen commit c64c56be")
    binding = amendment.get("baseBinding") or {}
    base_digest = _digest(base_spec)
    if base_digest != binding.get("canonicalSpecDigestSha256"):
        raise AttributionError("base calibration spec digest does not match amendment binding")
    correction = amendment.get("correctionBoundary") or {}
    seals = amendment.get("seals") or {}
    candidate_seal = seals.get("candidateTraining") or {}
    if any(
        bool(correction.get(name))
        for name in ("candidateTrainingStarted", "finalHoldoutOpened", "embargoShadowOpened")
    ):
        raise AttributionError("amendment correction seal is open")
    if any(bool(candidate_seal.get(name)) for name in ("C1Started", "C2RStarted", "C2Started", "C3Started")):
        raise AttributionError("candidate-training seal is open")
    for name in ("finalHoldout", "embargoShadow", "deferred60Month"):
        seal = seals.get(name) or {}
        if bool(seal.get("opened")) or bool(seal.get("truthRead")):
            raise AttributionError(f"{name} seal is open")
    return {
        "baseSpecDigest": base_digest,
        "amendmentDigest": amendment_digest,
        "frozenAmendmentCommit": _FROZEN_AMENDMENT_COMMIT,
        "bindingValid": True,
        "allLabelSealsClosed": True,
        "candidateTrainingStarted": False,
    }


def _fixed_forward_cases(
    forward_rows: Sequence[Mapping[str, Any]],
    spec: Mapping[str, Any],
) -> list[dict[str, Any]]:
    allowed_origins = _forward_score_origins(spec)
    selected: list[dict[str, Any]] = []
    seen: set[tuple[str, str, int, str]] = set()
    for row in forward_rows:
        if not isinstance(row, Mapping) or _model_id(row) != "B0b":
            continue
        role = _row_role(row)
        if role is not None:
            lowered = role.lower()
            if any(token in lowered for token in _FORBIDDEN_ROLE_TOKENS):
                raise AttributionError("attribution input includes a sealed or audit-only label role")
            if role != _DEVELOPMENT_ROLE:
                raise AttributionError("B0b attribution row is not development_forward_score")
        key = _case_key(row)
        if role is None and (not allowed_origins or key[1] not in allowed_origins):
            raise AttributionError("role-less B0b row is outside frozen development score origins")
        if not _scoreable(row):
            continue
        if key in seen:
            raise AttributionError("duplicate scoreable B0b case key")
        seen.add(key)
        actual = _first_path(row, (("actual",), ("scoring", "actual")))
        actual_number = _finite(actual, "actual")
        serving = _business_serving(row)
        available = _model_prediction_available(row)
        raw = _raw_prediction(row)
        if available is not True:
            raise AttributionError("scoreable B0b case must have modelPredictionAvailable=true")
        served_value = _served_prediction_if_present(row)
        if served_value is _MISSING:
            raise AttributionError("scoreable B0b case is missing servedPrediction")
        if serving:
            if served_value is None:
                raise AttributionError("served case has a null servedPrediction")
            if _fixed_decimal(served_value) != _fixed_decimal(raw):
                raise AttributionError("servedPrediction differs from rawModelPrediction")
        elif served_value is not None:
            raise AttributionError("abstained case must have servedPrediction=null")
        reason = _abstention_reason(row)
        if not serving and not reason:
            raise AttributionError("abstained case is missing abstentionReason")
        if serving and reason:
            raise AttributionError("served case must have abstentionReason=null")
        selected.append(
            {
                "key": key,
                "actual": actual_number,
                "business_serving": serving,
                "abstention_reason": reason if not serving else "",
                "raw_b0b": raw,
                "high_value": _stratum_bool(row, "high_value", "highValue"),
                "top_1": _stratum_bool(row, "top_1_percent", "top1Percent"),
                "top_5": _stratum_bool(row, "top_5_percent", "top5Percent"),
                "top_10": _stratum_bool(row, "top_10_percent", "top10Percent"),
            }
        )
    if not selected:
        raise AttributionError("no statisticallyScoreable B0b development-forward cases")
    return sorted(selected, key=lambda item: item["key"])


def _build_authoritative_matrix(
    works: Sequence[Mapping[str, Any]], spec: Mapping[str, Any]
) -> tuple[Any, list[str], dict[str, str | None]]:
    try:
        import run_m2_forecast_model_bakeoff as bake  # pylint: disable=import-outside-toplevel
    except ImportError as exc:
        raise AttributionError(
            "legacy attribution dependencies are unavailable; use scripts/run-codex-python.mjs"
        ) from exc

    first = str(_first_path(spec, (("authority", "firstBillMonth"),)))
    latest = str(_first_path(spec, (("authority", "latestCompleteMonth"),)))
    months = _month_range(first, latest)
    month_index = {month: index for index, month in enumerate(months)}
    rows: dict[str, list[float]] = {}
    first_observed: dict[str, str | None] = {}
    for work in works:
        if not isinstance(work, Mapping):
            raise AttributionError("work must be an object")
        work_id = str(
            _first_path(work, (("standard_work_id",), ("standardWorkId",)))
        ).strip()
        if not work_id or work_id in rows:
            raise AttributionError("authoritative works contain a blank or duplicate id")
        values = [0.0] * len(months)
        observed: list[str] = []
        channels = work.get("channels", []) or []
        if not isinstance(channels, Sequence) or isinstance(channels, (str, bytes, bytearray)):
            raise AttributionError("work channels must be an array")
        for channel in channels:
            if not isinstance(channel, Mapping):
                raise AttributionError("work channel must be an object")
            monthly = channel.get("monthly", {}) or {}
            if not isinstance(monthly, Mapping):
                raise AttributionError("channel monthly facts must be an object")
            explicit_first = str(channel.get("first_observed_month", "")).strip()
            if explicit_first:
                _month_ordinal(explicit_first)
                observed.append(explicit_first)
            elif monthly:
                observed.append(min(str(month) for month in monthly))
            for month, amount in monthly.items():
                month_text = str(month)
                _month_ordinal(month_text)
                if month_text > latest:
                    continue
                if month_text < first:
                    raise AttributionError("work facts precede authority.firstBillMonth")
                values[month_index[month_text]] += _finite(amount, "monthly income")
        rows[work_id] = values
        first_observed[work_id] = min(observed) if observed else None
    if not rows:
        raise AttributionError("authoritative work collection is empty")
    matrix = bake.pd.DataFrame.from_dict(rows, orient="index", columns=months, dtype=float)
    matrix = matrix.sort_index()
    return matrix, months, first_observed


def _legacy_features(model_inputs: Mapping[str, Any]) -> dict[str, dict[str, Any]]:
    lookup: dict[str, dict[str, Any]] = {}
    for row in _records(model_inputs.get("evaluated"), "standardWorkId"):
        work_id = str(row.get("standardWorkId", "")).strip()
        if not work_id:
            continue
        risk_codes = row.get("riskCodes") or []
        if isinstance(risk_codes, str):
            try:
                parsed = json.loads(risk_codes)
                risk_codes = parsed if isinstance(parsed, list) else [risk_codes]
            except json.JSONDecodeError:
                risk_codes = [risk_codes]
        rating = str(row.get("rating") or "C").strip() or "C"
        data_gap = bool(row.get("forecastFallbackUsed")) or (
            "missing_copyright_end" in {str(value) for value in risk_codes}
        )
        lookup[work_id] = {"rating": rating, "data_gap": data_gap}
    return lookup


def _legacy_serving(model_inputs: Mapping[str, Any]) -> dict[str, dict[str, Any]]:
    lookup: dict[str, dict[str, Any]] = {}
    for row in _records(model_inputs.get("gate"), "workKey"):
        work_id = str(row.get("workKey", "")).strip()
        if not work_id:
            continue
        if "canUseNumericForecast" in row:
            eligible = _strict_bool(row["canUseNumericForecast"], "canUseNumericForecast")
        else:
            status = str(row.get("forecastabilityStatus", ""))
            eligible = status in {
                "numeric_forecast_eligible",
                "conservative_numeric_forecast",
                "forecastable_numeric",
            }
        reason = str(row.get("forecastabilityStatus") or "legacy_not_numeric").strip()
        lookup[work_id] = {"eligible": eligible, "reason": "" if eligible else reason}
    return lookup


def _lifecycle_thresholds(model_inputs: Mapping[str, Any]) -> Mapping[str, Any]:
    thresholds = _first_path(
        model_inputs,
        (("context", "parameters", "lifecycle"),),
        default=None,
    )
    if not isinstance(thresholds, Mapping):
        raise AttributionError("legacy lifecycle thresholds are unavailable")
    return thresholds


def _legacy_predictions(
    cases: Sequence[Mapping[str, Any]],
    matrix: Any,
    months: Sequence[str],
    first_observed: Mapping[str, str | None],
    model_inputs: Mapping[str, Any],
) -> tuple[dict[int, dict[tuple[str, str, int, str], float]], dict[int, dict[tuple[str, str, int, str], str]]]:
    try:
        import run_m2_forecast_model_bakeoff as bake  # pylint: disable=import-outside-toplevel
        import run_m2_formal_execution_payload as formal  # pylint: disable=import-outside-toplevel
    except ImportError as exc:
        raise AttributionError(
            "legacy attribution dependencies are unavailable; use scripts/run-codex-python.mjs"
        ) from exc

    thresholds = _lifecycle_thresholds(model_inputs)
    features = _legacy_features(model_inputs)
    month_to_index = {month: index for index, month in enumerate(months)}
    full_quantiles = bake.build_quantile_reference(matrix)
    all_work_priors: dict[str, Mapping[Any, float]] = {}
    as_of_quantiles: dict[str, Mapping[str, float]] = {}
    as_of_priors: dict[str, Mapping[Any, float]] = {}
    predictions = {2: {}, 3: {}, 4: {}}
    lifecycles = {2: {}, 3: {}, 4: {}}

    for case in cases:
        work_id, origin, horizon, _route = case["key"]
        if work_id not in matrix.index:
            raise AttributionError("a scoreable case is absent from authoritative works")
        if origin not in month_to_index:
            raise AttributionError("a scoreable origin is outside the authoritative matrix")
        observed = first_observed.get(work_id)
        if observed is None or observed > origin:
            raise AttributionError("scoreable case is a future catalog entrant at its origin")
        cutoff = month_to_index[origin]
        if origin not in all_work_priors:
            all_work_priors[origin] = bake.build_cohort_priors(
                matrix, cutoff, thresholds, full_quantiles
            )
        if origin not in as_of_priors:
            eligible_ids = [
                key
                for key, first in first_observed.items()
                if first is not None and first <= origin
            ]
            if not eligible_ids:
                raise AttributionError("as-of prior has no catalog entrants")
            as_of_matrix = matrix.loc[sorted(eligible_ids)]
            as_of_slice = as_of_matrix.iloc[:, : cutoff + 1]
            as_of_quantiles[origin] = bake.build_quantile_reference(as_of_slice)
            as_of_priors[origin] = bake.build_cohort_priors(
                as_of_matrix, cutoff, thresholds, as_of_quantiles[origin]
            )
        history = matrix.loc[work_id].iloc[: cutoff + 1].to_numpy(dtype=float)
        current = features.get(work_id, {"rating": "C", "data_gap": False})
        stage_inputs = {
            2: (full_quantiles, all_work_priors[origin], current["rating"], current["data_gap"]),
            3: (
                as_of_quantiles[origin],
                as_of_priors[origin],
                current["rating"],
                current["data_gap"],
            ),
            4: (as_of_quantiles[origin], as_of_priors[origin], "C", False),
        }
        for stage, (quantiles, priors, rating, data_gap) in stage_inputs.items():
            output, _raw_trailing = formal.predict_selector_only(
                history,
                horizon,
                dict(thresholds),
                dict(quantiles),
                dict(priors),
                rating=str(rating),
                data_gap=bool(data_gap),
            )
            point = _finite(output.get("base"), f"stage {stage} legacy prediction")
            predictions[stage][case["key"]] = point
            lifecycles[stage][case["key"]] = str(output.get("lifecycle", ""))

    lifecycle_fingerprints = {
        stage: _fingerprint_values(cases, values, value_name="lifecycle")
        for stage, values in lifecycles.items()
    }
    if len(set(lifecycle_fingerprints.values())) != 1:
        raise AttributionError("lifecycle changed across q/prior or feature attribution stages")
    return predictions, lifecycles


def _key_payload(key: tuple[str, str, int, str]) -> dict[str, Any]:
    return {
        "standardWorkId": key[0],
        "origin": key[1],
        "horizonMonths": key[2],
        "route": key[3],
    }


def _fingerprint_values(
    cases: Sequence[Mapping[str, Any]],
    values: Mapping[tuple[str, str, int, str], Any],
    *,
    value_name: str,
) -> str:
    payload = []
    for case in cases:
        key = case["key"]
        if key not in values:
            raise AttributionError(f"{value_name} fingerprint is missing a case")
        value = values[key]
        if isinstance(value, float):
            value = _fixed_decimal(value)
        payload.append({"key": _key_payload(key), value_name: value})
    return _digest(payload)


def _case_fingerprint(cases: Sequence[Mapping[str, Any]]) -> str:
    return _digest([_key_payload(case["key"]) for case in cases])


def _actual_fingerprint(cases: Sequence[Mapping[str, Any]]) -> str:
    return _digest(
        [
            {"key": _key_payload(case["key"]), "actual": _fixed_decimal(case["actual"])}
            for case in cases
        ]
    )


def _point_metrics(
    rows: Sequence[Mapping[str, Any]], *, include_horizon_stability: bool = True
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
            "horizonStability": {"byHorizon": [], "wapeRange": None},
        }
    errors = [abs(float(row["prediction"]) - float(row["actual"])) for row in rows]
    actuals = [float(row["actual"]) for row in rows]
    predictions = [float(row["prediction"]) for row in rows]
    absolute_denominator = sum(abs(value) for value in actuals)
    signed_denominator = sum(actuals)
    smape_values = [
        (
            0.0
            if abs(prediction) + abs(actual) == 0
            else 2.0 * error / (abs(prediction) + abs(actual))
        )
        for prediction, actual, error in zip(predictions, actuals, errors)
    ]
    metrics = {
        "caseCount": len(rows),
        "uniqueWorkCount": len(
            {str(row["key"][0]) for row in rows if row.get("key") is not None}
        ),
        "wape": _rounded(sum(errors) / absolute_denominator) if absolute_denominator > 0 else None,
        "mae": _rounded(sum(errors) / len(errors)),
        "smape": _rounded(sum(smape_values) / len(smape_values)) if smape_values else None,
        "signedAggregateBias": (
            _rounded((sum(predictions) - signed_denominator) / signed_denominator)
            if signed_denominator > 0
            else None
        ),
        "actualTotal": _rounded(signed_denominator),
        "predictedTotal": _rounded(sum(predictions)),
    }
    if include_horizon_stability and all(row.get("key") is not None for row in rows):
        by_horizon = []
        for horizon in sorted({int(row["key"][2]) for row in rows}):
            cell = _point_metrics(
                [row for row in rows if int(row["key"][2]) == horizon],
                include_horizon_stability=False,
            )
            by_horizon.append(
                {
                    "horizonMonths": horizon,
                    "caseCount": cell["caseCount"],
                    "wape": cell["wape"],
                    "signedAggregateBias": cell["signedAggregateBias"],
                }
            )
        wapes = [float(item["wape"]) for item in by_horizon if item["wape"] is not None]
        metrics["horizonStability"] = {
            "byHorizon": by_horizon,
            "wapeRange": _rounded(max(wapes) - min(wapes)) if wapes else None,
        }
    else:
        metrics["horizonStability"] = {"byHorizon": [], "wapeRange": None}
    return metrics


def _revenue_share(
    cases: Sequence[Mapping[str, Any]],
    served: Mapping[tuple[str, str, int, str], bool],
    predicate: Any = None,
) -> float | None:
    selected = [case for case in cases if predicate is None or predicate(case)]
    denominator = sum(max(float(case["actual"]), 0.0) for case in selected)
    numerator = sum(
        max(float(case["actual"]), 0.0)
        for case in selected
        if served[case["key"]]
    )
    return _rounded(numerator / denominator) if denominator > 0 else None


def _abstention_metrics(
    cases: Sequence[Mapping[str, Any]],
    served: Mapping[tuple[str, str, int, str], bool],
    reasons: Mapping[tuple[str, str, int, str], str],
) -> dict[str, Any]:
    work_origins = {(case["key"][0], case["key"][1]) for case in cases}
    served_work_origins = {
        (case["key"][0], case["key"][1]) for case in cases if served[case["key"]]
    }
    abstained_work_origins = {
        (case["key"][0], case["key"][1])
        for case in cases
        if not served[case["key"]]
    }
    fully_abstained_work_origins = work_origins - served_work_origins
    abstained = [case for case in cases if not served[case["key"]]]
    positive_total = sum(max(float(case["actual"]), 0.0) for case in cases)
    positive_abstained = sum(max(float(case["actual"]), 0.0) for case in abstained)
    reason_rows: dict[str, list[Mapping[str, Any]]] = {}
    for case in abstained:
        reason = reasons.get(case["key"], "unspecified") or "unspecified"
        reason_rows.setdefault(reason, []).append(case)
    reason_distribution = {}
    for reason, rows in sorted(reason_rows.items()):
        revenue = sum(max(float(case["actual"]), 0.0) for case in rows)
        reason_distribution[reason] = {
            "caseCount": len(rows),
            "workCount": len({(case["key"][0], case["key"][1]) for case in rows}),
            "positiveActualRevenueShare": (
                _rounded(revenue / positive_total) if positive_total > 0 else None
            ),
        }
    return {
        "servedCaseCount": len(cases) - len(abstained),
        "servedWorkCount": len(served_work_origins),
        "servedWorkShare": (
            _rounded(len(served_work_origins) / len(work_origins)) if work_origins else None
        ),
        "servedActualRevenueShare": _revenue_share(cases, served),
        "top1ServedRevenueShare": _revenue_share(cases, served, lambda row: row["top_1"]),
        "top5ServedRevenueShare": _revenue_share(cases, served, lambda row: row["top_5"]),
        "top10ServedRevenueShare": _revenue_share(cases, served, lambda row: row["top_10"]),
        "abstainedCaseCount": len(abstained),
        "abstainedWorkCount": len(abstained_work_origins),
        "fullyAbstainedWorkCount": len(fully_abstained_work_origins),
        "abstainedActualRevenueShare": (
            _rounded(positive_abstained / positive_total) if positive_total > 0 else None
        ),
        "highValueAbstainedCaseCount": sum(bool(case["high_value"]) for case in abstained),
        "highValueAbstainedWorkCount": len(
            {
                (case["key"][0], case["key"][1])
                for case in abstained
                if case["high_value"]
            }
        ),
        "abstentionReasonDistribution": reason_distribution,
        "revenueShareBasis": "positive_actual_revenue",
        "workCountDefinition": "unique_work_x_origin_with_at_least_one_core_horizon_case_in_the_named_state",
    }


def _stage_report(
    stage_id: str,
    title: str,
    cases: Sequence[Mapping[str, Any]],
    predictions: Mapping[tuple[str, str, int, str], float],
    served: Mapping[tuple[str, str, int, str], bool],
    reasons: Mapping[tuple[str, str, int, str], str],
    *,
    change: str,
    lifecycle: Mapping[tuple[str, str, int, str], str] | None = None,
) -> dict[str, Any]:
    if set(predictions) != {case["key"] for case in cases}:
        raise AttributionError(f"{stage_id} prediction keys differ from the fixed scoreable keys")
    if set(served) != set(predictions) or set(reasons) != set(predictions):
        raise AttributionError(f"{stage_id} serving keys differ from the fixed scoreable keys")
    all_rows = [
        {"key": case["key"], "actual": case["actual"], "prediction": predictions[case["key"]]}
        for case in cases
    ]
    served_rows = [
        {"key": case["key"], "actual": case["actual"], "prediction": predictions[case["key"]]}
        for case in cases
        if served[case["key"]]
    ]
    high_value_rows = [
        {"key": case["key"], "actual": case["actual"], "prediction": predictions[case["key"]]}
        for case in cases
        if served[case["key"]] and case["high_value"]
    ]
    end_to_end_rows = [
        {
            "key": case["key"],
            "actual": case["actual"],
            "prediction": predictions[case["key"]] if served[case["key"]] else 0.0,
        }
        for case in cases
    ]
    end_to_end_score = _point_metrics(end_to_end_rows)
    serving_values = {key: bool(value) for key, value in served.items()}
    served_predictions = {
        key: _fixed_decimal(predictions[key]) if served[key] else None
        for key in predictions
    }
    abstention_values = {
        key: reasons[key] if not served[key] else ""
        for key in predictions
    }
    fingerprints = {
        "caseFingerprint": _case_fingerprint(cases),
        "actualFingerprint": _actual_fingerprint(cases),
        "rawPredictionFingerprint": _fingerprint_values(
            cases, predictions, value_name="rawModelPrediction"
        ),
        "servingFingerprint": _fingerprint_values(
            cases, serving_values, value_name="businessServingEligible"
        ),
        "servedPredictionFingerprint": _fingerprint_values(
            cases, served_predictions, value_name="servedPrediction"
        ),
        "abstentionFingerprint": _fingerprint_values(
            cases, abstention_values, value_name="abstentionReason"
        ),
        "lifecycleFingerprint": (
            _fingerprint_values(cases, lifecycle, value_name="lifecycle")
            if lifecycle is not None
            else None
        ),
    }
    all_metrics = _point_metrics(all_rows)
    served_metrics = _point_metrics(served_rows)
    high_value_metrics = _point_metrics(high_value_rows)
    abstention_metrics = _abstention_metrics(cases, served, reasons)
    served_metrics["highValueWape"] = high_value_metrics["wape"]
    served_metrics["highValueSignedAggregateBias"] = high_value_metrics[
        "signedAggregateBias"
    ]
    definition_digest = _digest(
        {"stage": stage_id, "change": change, "casePopulation": "fixed_all_scoreable"}
    )
    prediction_fingerprint = _digest(
        {
            "raw": fingerprints["rawPredictionFingerprint"],
            "serving": fingerprints["servingFingerprint"],
            "served": fingerprints["servedPredictionFingerprint"],
        }
    )
    return {
        "stage": stage_id,
        "title": title,
        "caseCount": len(cases),
        "changeFromPrior": change,
        "definitionDigest": definition_digest,
        "caseFingerprint": fingerprints["caseFingerprint"],
        "predictionFingerprint": prediction_fingerprint,
        "allScoreableWape": all_metrics["wape"],
        "allScoreableSignedAggregateBias": all_metrics["signedAggregateBias"],
        "servedRevenueCoverage": abstention_metrics["servedActualRevenueShare"],
        "top10ServedRevenueCoverage": abstention_metrics["top10ServedRevenueShare"],
        "highValueWape": high_value_metrics["wape"],
        "highValueSignedAggregateBias": high_value_metrics["signedAggregateBias"],
        "allScoreableModelMetrics": all_metrics,
        "servedCohortMetrics": served_metrics,
        "highValueServedPerformance": high_value_metrics,
        "abstentionMetrics": abstention_metrics,
        "endToEndBusinessLoss": {
            "value": end_to_end_score["wape"],
            "caseCount": end_to_end_score["caseCount"],
            "formula": "sum(abs((served_raw_or_zero)-actual))/sum(abs(actual))",
            "classification": "business_coverage_loss_not_model_wape",
        },
        "fingerprints": fingerprints,
    }


def _legacy_b0a_stage(model_inputs: Mapping[str, Any]) -> dict[str, Any]:
    validation = model_inputs.get("validation")
    coverage = model_inputs.get("coverage")
    if not isinstance(validation, Mapping) or not isinstance(coverage, Mapping):
        raise AttributionError("B0a validation/coverage aggregate anchor is unavailable")
    score = validation.get("forecastableCohortScore")
    high_value = validation.get("highValueForecastableScore")
    legacy_coverage = coverage.get("forecastableNumericIncludingConservative")
    top = coverage.get("topRevenueCoverage")
    if not all(isinstance(item, Mapping) for item in (score, high_value, legacy_coverage, top)):
        raise AttributionError("B0a aggregate anchor is incomplete")

    def bias(item: Mapping[str, Any]) -> float | None:
        actual = _finite(item.get("actualTotal"), "B0a actualTotal")
        predicted = _finite(item.get("predictedTotal"), "B0a predictedTotal")
        return _rounded((predicted - actual) / actual) if actual > 0 else None

    served_work_count = int(legacy_coverage.get("count", 0))
    authority_work_count = int(
        _first_path(model_inputs, (("foundationSummary", "standardWorkCount"),), default=0)
        or 0
    )
    if authority_work_count <= 0:
        foundation = model_inputs.get("foundation")
        authority_work_count = len(foundation) if isinstance(foundation, Mapping) else 0
    top1 = top.get("top1Percent", {}) or {}
    top5 = top.get("top5Percent", {}) or {}
    top10 = top.get("top10Percent", {}) or {}
    return {
        "stage": "1",
        "title": "B0a旧历史最终聚合锚点",
        "caseCount": int(score.get("caseCount", 0)),
        "changeFromPrior": "historical_anchor_only",
        "comparability": {
            "comparableToStages2Through7": False,
            "reason": "legacy aggregate has no fixed scoreable case fingerprint",
        },
        "allScoreableModelMetrics": {
            "available": False,
            "reason": "legacy report only retained the legacy forecastable population",
        },
        "servedCohortMetrics": {
            "caseCount": int(score.get("caseCount", 0)),
            "wape": _rounded(_finite(score.get("wape"), "B0a wape")),
            "mae": _rounded(_finite(score.get("mae"), "B0a mae")),
            "smape": _rounded(_finite(score.get("smape"), "B0a smape")),
            "signedAggregateBias": bias(score),
            "actualTotal": _rounded(_finite(score.get("actualTotal"), "B0a actualTotal")),
            "predictedTotal": _rounded(
                _finite(score.get("predictedTotal"), "B0a predictedTotal")
            ),
            "population": "legacy_forecastable_not_new_statistically_scoreable",
        },
        "highValueServedPerformance": {
            "caseCount": int(high_value.get("caseCount", 0)),
            "wape": _rounded(_finite(high_value.get("wape"), "B0a high-value wape")),
            "mae": _rounded(_finite(high_value.get("mae"), "B0a high-value mae")),
            "smape": _rounded(_finite(high_value.get("smape"), "B0a high-value smape")),
            "signedAggregateBias": bias(high_value),
            "actualTotal": _rounded(
                _finite(high_value.get("actualTotal"), "B0a high-value actualTotal")
            ),
            "predictedTotal": _rounded(
                _finite(high_value.get("predictedTotal"), "B0a high-value predictedTotal")
            ),
        },
        "abstentionMetrics": {
            "servedWorkCount": served_work_count,
            "servedWorkShare": (
                _rounded(served_work_count / authority_work_count)
                if authority_work_count > 0
                else None
            ),
            "servedActualRevenueShare": _rounded(
                _finite(legacy_coverage.get("revenueShare"), "B0a revenue coverage")
            ),
            "top1ServedRevenueShare": _rounded(
                _finite(top1.get("forecastableRevenueShareWithinBucket"), "B0a top1 coverage")
            ),
            "top5ServedRevenueShare": _rounded(
                _finite(top5.get("forecastableRevenueShareWithinBucket"), "B0a top5 coverage")
            ),
            "top10ServedRevenueShare": _rounded(
                _finite(top10.get("forecastableRevenueShareWithinBucket"), "B0a top10 coverage")
            ),
            "abstainedWorkCount": (
                authority_work_count - served_work_count if authority_work_count > 0 else None
            ),
            "abstentionReasonDistribution": None,
            "population": "current-work aggregate, not fixed historical case keys",
        },
        "endToEndBusinessLoss": {
            "value": None,
            "classification": "unavailable_in_legacy_aggregate",
        },
        "fingerprints": {
            "available": False,
            "caseFingerprint": None,
            "actualFingerprint": None,
            "rawPredictionFingerprint": None,
            "servingFingerprint": None,
            "servedPredictionFingerprint": None,
            "abstentionFingerprint": None,
            "lifecycleFingerprint": None,
        },
    }


def _transition(previous: Mapping[str, Any], current: Mapping[str, Any]) -> dict[str, Any]:
    previous_all = previous.get("allScoreableModelMetrics", {}) or {}
    current_all = current.get("allScoreableModelMetrics", {}) or {}
    previous_served = previous.get("servedCohortMetrics", {}) or {}
    current_served = current.get("servedCohortMetrics", {}) or {}

    def delta(left: Any, right: Any) -> float | None:
        if left is None or right is None:
            return None
        return _rounded(float(right) - float(left))

    comparable = bool(previous_all.get("wape") is not None and current_all.get("wape") is not None)
    return {
        "fromStage": previous["stage"],
        "toStage": current["stage"],
        "comparable": comparable,
        "change": current.get("changeFromPrior"),
        "allScoreableWapeDelta": delta(previous_all.get("wape"), current_all.get("wape")),
        "allScoreableSignedBiasDelta": delta(
            previous_all.get("signedAggregateBias"),
            current_all.get("signedAggregateBias"),
        ),
        "servedWapeDelta": delta(previous_served.get("wape"), current_served.get("wape")),
        "servedSignedBiasDelta": delta(
            previous_served.get("signedAggregateBias"),
            current_served.get("signedAggregateBias"),
        ),
        "servedRevenueCoverageDelta": delta(
            (previous.get("abstentionMetrics", {}) or {}).get("servedActualRevenueShare"),
            (current.get("abstentionMetrics", {}) or {}).get("servedActualRevenueShare"),
        ),
        "nonComparableReason": (
            None if comparable else "B0a has no identical case/actual fingerprint"
        ),
    }


def _assert_fixed_population(stages: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    comparable = [stage for stage in stages if stage["stage"] != "1"]
    case_fingerprints = {
        str(stage["fingerprints"]["caseFingerprint"]) for stage in comparable
    }
    actual_fingerprints = {
        str(stage["fingerprints"]["actualFingerprint"]) for stage in comparable
    }
    case_counts = {int(stage["caseCount"]) for stage in comparable}
    if len(case_fingerprints) != 1 or len(actual_fingerprints) != 1 or len(case_counts) != 1:
        raise AttributionError("stages 2 through 7 do not share an identical case/actual population")
    by_id = {stage["stage"]: stage for stage in comparable}
    if by_id["4"]["fingerprints"]["rawPredictionFingerprint"] != by_id["5"]["fingerprints"]["rawPredictionFingerprint"]:
        raise AttributionError("stage 5 changed raw predictions while swapping eligibility")
    for field in ("rawPredictionFingerprint", "servingFingerprint", "servedPredictionFingerprint"):
        if by_id["5"]["fingerprints"][field] != by_id["6"]["fingerprints"][field]:
            raise AttributionError("stage 6 changed predictions or serving while renaming scoring populations")
    if by_id["6"]["fingerprints"]["servingFingerprint"] != by_id["7"]["fingerprints"]["servingFingerprint"]:
        raise AttributionError("stage 7 unexpectedly changed the frozen business-serving population")
    return {
        "stages2Through7CaseCountEqual": True,
        "stages2Through7CaseFingerprintEqual": True,
        "stages2Through7ActualFingerprintEqual": True,
        "stage4To5RawPredictionFingerprintEqual": True,
        "stage5To6RawAndServingFingerprintsEqual": True,
        "stage6To7ServingFingerprintEqual": True,
        "caseCount": next(iter(case_counts)),
        "caseFingerprint": next(iter(case_fingerprints)),
        "actualFingerprint": next(iter(actual_fingerprints)),
    }


def build_attribution_report(
    works: Sequence[Mapping[str, Any]],
    forward_rows: Sequence[Mapping[str, Any]],
    model_inputs: Mapping[str, Any],
    base_spec: Mapping[str, Any],
    amendment: Mapping[str, Any] | None,
) -> dict[str, Any]:
    """Build the seven-stage, de-identified B0a -> B0b attribution report.

    ``forward_rows`` may contain other baselines, but every B0b row must belong
    to the development-forward score role.  Only rows explicitly marked
    statistically scoreable enter stages 2--7.  No row-level value is returned.
    """

    if not isinstance(base_spec, Mapping) or not isinstance(model_inputs, Mapping):
        raise AttributionError("base_spec and model_inputs must be objects")
    if amendment is not None and not isinstance(amendment, Mapping):
        raise AttributionError("amendment must be an object or null")
    binding_evidence = _validate_frozen_binding(base_spec, amendment)
    spec = base_spec
    cases = _fixed_forward_cases(forward_rows, spec)
    matrix, months, first_observed = _build_authoritative_matrix(works, spec)
    predictions, lifecycles = _legacy_predictions(
        cases, matrix, months, first_observed, model_inputs
    )
    legacy_serving = _legacy_serving(model_inputs)

    legacy_served: dict[tuple[str, str, int, str], bool] = {}
    legacy_reasons: dict[tuple[str, str, int, str], str] = {}
    new_served: dict[tuple[str, str, int, str], bool] = {}
    new_reasons: dict[tuple[str, str, int, str], str] = {}
    b0b_predictions: dict[tuple[str, str, int, str], float] = {}
    missing_legacy_gate_case_count = 0
    for case in cases:
        key = case["key"]
        legacy = legacy_serving.get(key[0])
        if legacy is None:
            missing_legacy_gate_case_count += 1
            legacy_served[key] = False
            legacy_reasons[key] = "legacy_gate_key_missing"
        else:
            legacy_served[key] = bool(legacy["eligible"])
            legacy_reasons[key] = str(legacy["reason"])
        new_served[key] = bool(case["business_serving"])
        new_reasons[key] = str(case["abstention_reason"])
        b0b_predictions[key] = float(case["raw_b0b"])

    stage1 = _legacy_b0a_stage(model_inputs)
    stage2 = _stage_report(
        "2",
        "旧模型+固定B0b可计分case keys",
        cases,
        predictions[2],
        legacy_served,
        legacy_reasons,
        change="legacy_selector_full_period_quantiles_all_work_prior_current_rating_and_data_gap",
        lifecycle=lifecycles[2],
    )
    stage3 = _stage_report(
        "3",
        "旧模型+cutoff-as-of quantiles/priors",
        cases,
        predictions[3],
        legacy_served,
        legacy_reasons,
        change="only_quantiles_and_priors_switch_to_cutoff_as_of_excluding_future_entrants",
        lifecycle=lifecycles[3],
    )
    stage4 = _stage_report(
        "4",
        "旧模型+as-of-safe features",
        cases,
        predictions[4],
        legacy_served,
        legacy_reasons,
        change="only_unavailable_historical_rating_and_risk_features_switch_to_C_and_false",
        lifecycle=lifecycles[4],
    )
    stage5 = _stage_report(
        "5",
        "旧模型+新business eligibility",
        cases,
        predictions[4],
        new_served,
        new_reasons,
        change="only_business_serving_eligibility_and_abstention_reason_change",
        lifecycle=lifecycles[4],
    )
    stage6 = _stage_report(
        "6",
        "旧模型+新abstention scoring",
        cases,
        predictions[4],
        new_served,
        new_reasons,
        change="only_metric_population_names_and_served_vs_raw_scoring_semantics_change",
        lifecycle=lifecycles[4],
    )
    stage7 = _stage_report(
        "7",
        "完整B0b无泄漏内核",
        cases,
        b0b_predictions,
        new_served,
        new_reasons,
        change="replace_legacy_selector_raw_prediction_with_B0b_raw_model_prediction",
        lifecycle=None,
    )
    stages = [stage1, stage2, stage3, stage4, stage5, stage6, stage7]
    integrity = _assert_fixed_population(stages)
    transitions = [
        _transition(previous, current)
        for previous, current in zip(stages, stages[1:])
    ]
    return {
        "schema": "m2.calibration-b0a-b0b-attribution.v1",
        "version": "M2-B0a-B0b-replay-attribution-v1",
        "decisionStatus": "not_for_formal_decision",
        "scope": "development_forward_score_only",
        "binding": binding_evidence,
        "baseSpecDigest": binding_evidence["baseSpecDigest"],
        "amendmentDigest": binding_evidence["amendmentDigest"],
        "finalHoldoutOpened": False,
        "embargoShadowOpened": False,
        "longHorizonLabelsUsed": False,
        "legacyGateMissingCaseCount": missing_legacy_gate_case_count,
        "integrity": integrity,
        "stages": stages,
        "attributionTransitions": transitions,
        "caveats": [
            "B0a only has a final historical aggregate and no case or prediction fingerprint, so stage 1 is not numerically attributable to stage 2.",
            "Stages 2 through 4 use the legacy selector for audit only and never participate in comparator selection.",
            "Historical rating and risk snapshots are unavailable; stage 4 freezes rating=C and data_gap=false. Lifecycle remains cutoff-as-of from income history.",
            "A missing legacy gate key abstains the audit-only served view but never removes a scoreable case or its raw prediction.",
            "Internal 80% interval values and endpoint fields are intentionally absent from this attribution report.",
        ],
        "privacy": {
            "aggregateOnly": True,
            "containsWorkIdentifiers": False,
            "containsChannelDetails": False,
            "containsPrivatePaths": False,
            "containsRawRows": False,
            "containsIntervalEndpoints": False,
        },
    }


__all__ = ["AttributionError", "build_attribution_report"]
