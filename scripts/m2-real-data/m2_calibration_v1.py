#!/usr/bin/env python3
"""Leakage-free M2 calibration primitives.

The contract self-test is synthetic-only and cannot read a database or private
data.  NumPy is loaded lazily only for the frozen PCG64 bootstrap.  The
authorized local replay runner imports these pure functions and is responsible
for loading the frozen local input role.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import re
import statistics
import unicodedata
from collections import Counter, defaultdict
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence


ROOT = Path(__file__).resolve().parents[2]
SPEC_PATH = ROOT / "src" / "domain" / "oldProductEvaluation" / "calibrationSpec.v1.json"


def load_spec(path: Path = SPEC_PATH) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _nfc(value: Any) -> Any:
    if isinstance(value, str):
        return unicodedata.normalize("NFC", value)
    if isinstance(value, Mapping):
        normalized: dict[str, Any] = {}
        for key, child in value.items():
            normalized_key = unicodedata.normalize("NFC", str(key))
            if normalized_key in normalized:
                raise ValueError("NFC key collision in canonical JSON")
            normalized[normalized_key] = _nfc(child)
        return normalized
    if isinstance(value, (list, tuple)):
        return [_nfc(child) for child in value]
    return value


def canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(
        _nfc(value),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")


def sha256_canonical_json(value: Any) -> str:
    return hashlib.sha256(canonical_json_bytes(value)).hexdigest()


def spec_digest(spec: Mapping[str, Any]) -> str:
    return sha256_canonical_json(spec)


def fixed_decimal(value: Any, places: int = 8) -> str:
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError("fingerprint value is not numeric") from exc
    if not math.isfinite(number):
        raise ValueError("fingerprint value is not finite")
    quantum = Decimal(1).scaleb(-places)
    return format(
        Decimal(str(value)).quantize(quantum, rounding=ROUND_HALF_UP),
        f".{places}f",
    )


def case_fingerprint(rows: Sequence[Mapping[str, Any]]) -> str:
    lines = []
    for row in rows:
        lines.append(
            "|".join(
                [
                    unicodedata.normalize("NFC", str(row["standard_work_id"])),
                    str(row["origin"]),
                    str(int(row["horizon_months"])),
                    str(row["route"]),
                    str(row["eligibility_status"]),
                    str(row["target_end"]),
                    fixed_decimal(row["actual"]),
                ]
            )
        )
    payload = "\n".join(sorted(lines)).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def apply_fitted_parameters(
    spec: Mapping[str, Any], artifact: Mapping[str, Any]
) -> dict[str, Any]:
    """Return a copy of the spec with committed development-only values bound."""

    contract = spec["freeze"]["fittedParametersArtifact"]
    expected = contract["schema"]
    if artifact.get("schema") != expected:
        raise ValueError("unexpected fitted-parameter artifact schema")
    missing_top = set(contract["requiredTopLevelFields"]) - set(artifact)
    if missing_top:
        raise ValueError(f"fitted-parameter artifact is missing top-level fields: {sorted(missing_top)}")
    if artifact.get("version") != "calibration-fitted-parameters-v1":
        raise ValueError("unexpected fitted-parameter artifact version")
    if artifact.get("specVersion") != spec.get("version"):
        raise ValueError("fitted-parameter artifact has the wrong spec version")
    if int(artifact.get("specRevision", -1)) != int(spec.get("preHoldoutRevision", -2)):
        raise ValueError("fitted-parameter artifact has the wrong spec revision")
    if artifact.get("specDigest") != spec_digest(spec):
        raise ValueError("fitted-parameter artifact does not match calibration spec")
    if artifact.get("decisionStatus") != "not_for_formal_decision":
        raise ValueError("fitted parameters cannot authorize a formal decision")
    baseline_spec = next(item for item in spec["models"]["baselines"] if item["id"] == "B0b")
    if artifact.get("parameterProvenance") != baseline_spec["parameterProvenance"]:
        raise ValueError("B0b fitted parameters have the wrong parameter provenance")
    fit_spec = baseline_spec["developmentFit"]
    fit = artifact.get("fit", {})
    missing_fit = set(contract["requiredFitFields"]) - set(fit)
    if missing_fit:
        raise ValueError(f"fitted-parameter artifact is missing fit fields: {sorted(missing_fit)}")
    forbidden_fit = set(contract.get("forbiddenFitFields", ())) & set(fit)
    if forbidden_fit:
        raise ValueError(f"fitted-parameter artifact contains forbidden fit fields: {sorted(forbidden_fit)}")
    for field, expected_value in contract.get("requiredFitFieldValues", {}).items():
        actual_value = fit.get(field)
        if type(actual_value) is not type(expected_value) or actual_value != expected_value:
            raise ValueError(f"fitted-parameter artifact has an invalid frozen value: {field}")
    if fit.get("baselineId") != "B0b" or fit.get("fitStatus") != "complete":
        raise ValueError("B0b fitted-parameter run is not complete")
    if fit.get("caseRole") != fit_spec["caseRole"]:
        raise ValueError("B0b fitted parameters did not use development-only cases")
    if fit.get("maximumTargetEnd") != fit_spec["maximumTargetEnd"]:
        raise ValueError("B0b fitted parameters have an invalid maximum target end")
    if list(fit.get("excludedRoles", [])) != list(fit_spec["excludedRoles"]):
        raise ValueError("B0b fitted parameters have invalid excluded roles")
    if fit.get("algorithm") != fit_spec["algorithm"]:
        raise ValueError("B0b fitted parameters used the wrong fit algorithm")
    if int(fit.get("randomSeed", -1)) != int(spec["randomSeed"]):
        raise ValueError("B0b fitted parameters used the wrong seed")
    grid_digest = sha256_canonical_json(fit_spec["factorGrid"])
    if fit.get("factorGridDigest") != grid_digest:
        raise ValueError("B0b fitted parameters used the wrong factor grid")
    if list(fit.get("caseKeyFields", [])) != list(spec["caseKeys"]["aggregateFields"]):
        raise ValueError("B0b fitted parameters used the wrong case-key fields")
    if fit.get("caseFingerprintSerialization") != fit_spec["caseFingerprintSerialization"]:
        raise ValueError("B0b fitted parameters used the wrong case fingerprint serialization")

    oof_spec = fit_spec["oofComparatorProtocol"]
    forward_spec = spec["origins"]["forwardValidation"]
    if fit.get("forwardValidationMethod") != forward_spec["method"]:
        raise ValueError("B0b fitted parameters used the wrong forward method")
    if fit.get("foldUnit") != forward_spec["foldUnit"]:
        raise ValueError("B0b fitted parameters used the wrong fold unit")
    if list(fit.get("warmupOrigins", [])) != list(forward_spec["warmupOrigins"]):
        raise ValueError("B0b fitted parameters used the wrong warmup origins")
    if list(fit.get("scoreOrigins", [])) != list(forward_spec["scoreOrigins"]):
        raise ValueError("B0b fitted parameters used the wrong score origins")
    expected_blocks = {
        row["scoreOrigin"]: int(row["expectedTrainOriginHorizonBlockCount"])
        for row in forward_spec["folds"]
    }
    reported_fold_counts = {
        str(key): int(value)
        for key, value in fit.get("foldTrainingCaseCountsByScoreOrigin", {}).items()
    }
    if set(reported_fold_counts) != set(expected_blocks) or any(
        reported_fold_counts[origin] < expected_blocks[origin]
        for origin in expected_blocks
    ):
        raise ValueError("B0b fitted parameters used invalid forward training case counts")
    maximum_target_ends = fit.get("foldTrainingMaximumTargetEndByScoreOrigin", {})
    if set(maximum_target_ends) != set(forward_spec["scoreOrigins"]):
        raise ValueError("B0b fitted parameters are missing fold target-end provenance")
    if any(str(maximum_target_ends[origin]) > str(origin) for origin in forward_spec["scoreOrigins"]):
        raise ValueError("B0b forward fold used a target label before it was available")
    if fit.get("trainingTargetEndRule") != forward_spec["trainCasePredicate"]:
        raise ValueError("B0b fitted parameters used the wrong target-end rule")
    if fit.get("usesOnlyStrictlyAvailableLabels") is not True:
        raise ValueError("B0b forward folds must use only available labels")
    if fit.get("oofComparatorScoreUsed") is not True:
        raise ValueError("B0b comparator score must be out-of-fold")
    if int(fit.get("minimumTrainingCasesPerLifecycleFactor", -1)) != int(oof_spec["minimumTrainingCasesPerLifecycleFactor"]):
        raise ValueError("B0b fitted parameters used the wrong lifecycle support floor")
    if int(fit.get("minimumTrainingOriginsPerLifecycleFactor", -1)) != int(oof_spec["minimumTrainingOriginsPerLifecycleFactor"]):
        raise ValueError("B0b fitted parameters used the wrong lifecycle origin support floor")
    if not math.isclose(
        finite_number(fit.get("minimumActualRevenueSharePerLifecycleFactor"), -1.0),
        finite_number(oof_spec["minimumActualRevenueSharePerLifecycleFactor"]),
        abs_tol=1e-12,
    ):
        raise ValueError("B0b fitted parameters used the wrong lifecycle revenue support floor")
    if not math.isclose(
        finite_number(fit.get("unsupportedFactorValue"), -1.0),
        finite_number(oof_spec["unsupportedFactorValue"]),
        abs_tol=1e-12,
    ):
        raise ValueError("B0b fitted parameters used the wrong unsupported factor value")
    if fit.get("finalFactorsFitScope") != oof_spec["finalFactorsFitAfterOofScoring"]:
        raise ValueError("B0b final factors used the wrong fit scope")

    def is_hex(value: Any, length: int) -> bool:
        return bool(re.fullmatch(rf"[0-9a-f]{{{length}}}", str(value or "")))

    if not is_hex(fit.get("fitCaseFingerprint"), 64):
        raise ValueError("B0b development case fingerprint is invalid")
    if not is_hex(fit.get("comparatorCaseFingerprint"), 64):
        raise ValueError("B0b comparator case fingerprint is invalid")
    if not is_hex(fit.get("oofPredictionFingerprint"), 64):
        raise ValueError("B0b forward prediction fingerprint is invalid")
    if not is_hex(fit.get("intervalWarmupCaseFingerprint"), 64):
        raise ValueError("B0b interval-warmup case fingerprint is invalid")
    if not is_hex(fit.get("intervalWarmupPredictionFingerprint"), 64):
        raise ValueError("B0b interval-warmup prediction fingerprint is invalid")
    if not is_hex(fit.get("authoritativeInputSignatureSha256"), 64):
        raise ValueError("B0b authoritative input signature is invalid")
    if not is_hex(fit.get("specCommit"), 40) or not is_hex(fit.get("fitCodeCommit"), 40):
        raise ValueError("B0b fitted-parameter commit provenance is invalid")

    def nonnegative_integer(value: Any, label: str) -> int:
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            raise ValueError(f"B0b fitted-parameter {label} must be a nonnegative integer")
        return value

    def positive_integer(value: Any, label: str) -> int:
        parsed = nonnegative_integer(value, label)
        if parsed == 0:
            raise ValueError(f"B0b fitted-parameter {label} must be positive")
        return parsed

    def positive_count_map(value: Any, label: str) -> dict[str, int]:
        if not isinstance(value, Mapping) or set(value) != set(core_horizons):
            raise ValueError(f"B0b fitted-parameter {label} has the wrong horizon keys")
        return {
            key: positive_integer(item, f"{label}.{key}") for key, item in value.items()
        }

    core_horizons = [str(value) for value in spec["backtest"]["coreHorizonsMonths"]]
    fit_case_count = positive_integer(fit.get("fitCaseCount"), "fitCaseCount")
    fit_origin_count = positive_integer(fit.get("fitOriginCount"), "fitOriginCount")
    fit_case_counts = positive_count_map(fit.get("fitCaseCountByHorizon"), "fitCaseCountByHorizon")
    fit_origin_counts = positive_count_map(
        fit.get("fitOriginCountByHorizon"), "fitOriginCountByHorizon"
    )
    if fit_case_count != sum(fit_case_counts.values()):
        raise ValueError("B0b fit case count does not equal its horizon counts")
    development_origin_union = {
        str(origin)
        for split in spec["origins"]["coreByHorizon"].values()
        for origin in split["development"]
    }
    if (
        fit_origin_count > len(development_origin_union)
        or any(value > fit_origin_count for value in fit_origin_counts.values())
        or fit_origin_count < max(fit_origin_counts.values())
    ):
        raise ValueError("B0b fit origin counts are inconsistent")

    comparator_case_count = positive_integer(
        fit.get("comparatorCaseCount"), "comparatorCaseCount"
    )
    comparator_origin_count = positive_integer(
        fit.get("comparatorOriginCount"), "comparatorOriginCount"
    )
    comparator_case_counts = positive_count_map(
        fit.get("comparatorCaseCountByHorizon"), "comparatorCaseCountByHorizon"
    )
    comparator_origin_counts = positive_count_map(
        fit.get("comparatorOriginCountByHorizon"), "comparatorOriginCountByHorizon"
    )
    if comparator_case_count != sum(comparator_case_counts.values()):
        raise ValueError("B0b comparator case count does not equal its horizon counts")
    if (
        comparator_origin_count > len(forward_spec["scoreOrigins"])
        or any(value > comparator_origin_count for value in comparator_origin_counts.values())
        or comparator_origin_count < max(comparator_origin_counts.values())
    ):
        raise ValueError("B0b comparator origin counts are inconsistent")

    warmup_case_counts = fit.get("intervalWarmupCaseCountByHorizon")
    warmup_origin_counts = fit.get("intervalWarmupOriginCountByHorizon")
    if not isinstance(warmup_case_counts, Mapping) or set(warmup_case_counts) != set(core_horizons):
        raise ValueError("B0b interval-warmup case counts have the wrong horizon keys")
    if not isinstance(warmup_origin_counts, Mapping) or set(warmup_origin_counts) != set(core_horizons):
        raise ValueError("B0b interval-warmup origin counts have the wrong horizon keys")
    parsed_warmup_case_counts = {
        key: nonnegative_integer(value, f"intervalWarmupCaseCountByHorizon.{key}")
        for key, value in warmup_case_counts.items()
    }
    parsed_warmup_origin_counts = {
        key: nonnegative_integer(value, f"intervalWarmupOriginCountByHorizon.{key}")
        for key, value in warmup_origin_counts.items()
    }
    warmup_case_count = nonnegative_integer(
        fit.get("intervalWarmupCaseCount"), "intervalWarmupCaseCount"
    )
    if warmup_case_count != sum(parsed_warmup_case_counts.values()):
        raise ValueError("B0b interval-warmup case count does not equal its horizon counts")
    if len(set(parsed_warmup_case_counts.values())) != 1:
        raise ValueError("B0b full warmup case population must match across core horizons")
    warmup_origin_count = nonnegative_integer(
        fit.get("intervalWarmupOriginCount"), "intervalWarmupOriginCount"
    )
    maximum_warmup_origins = len(forward_spec["warmupOrigins"])
    if (
        warmup_origin_count > maximum_warmup_origins
        or any(value > warmup_origin_count for value in parsed_warmup_origin_counts.values())
        or warmup_origin_count < max(parsed_warmup_origin_counts.values(), default=0)
        or len(set(parsed_warmup_origin_counts.values())) != 1
        or any(value != warmup_origin_count for value in parsed_warmup_origin_counts.values())
    ):
        raise ValueError("B0b interval-warmup origin counts are inconsistent")
    passes = positive_integer(fit.get("passes"), "passes")
    if not 1 <= passes <= int(fit_spec["maximumPasses"]):
        raise ValueError("B0b fitted-parameter pass count is invalid")
    for forbidden_flag in (
        "usesEmbargoShadowLabels",
        "usesFinalHoldoutLabels",
        "usesLongHorizonAuditLabels",
        "legacyFactorsReused",
    ):
        if fit.get(forbidden_flag) is not False:
            raise ValueError(f"B0b fitted-parameter provenance is unsafe: {forbidden_flag}")
    if finite_number(fit.get("developmentWape"), -1.0) < 0:
        raise ValueError("B0b fitted-parameter development WAPE is invalid")
    if not math.isfinite(finite_number(fit.get("developmentSignedAggregateBias"), math.nan)):
        raise ValueError("B0b fitted-parameter development bias is invalid")

    b0b_artifact = artifact.get("B0b", {})
    missing_b0b = set(contract["requiredB0bFields"]) - set(b0b_artifact)
    if missing_b0b:
        raise ValueError(f"B0b fitted artifact is missing fields: {sorted(missing_b0b)}")
    forbidden_b0b = set(contract.get("forbiddenB0bFields", ())) & set(b0b_artifact)
    if forbidden_b0b:
        raise ValueError(f"B0b fitted artifact contains forbidden fields: {sorted(forbidden_b0b)}")
    if b0b_artifact.get("lifecycleThresholds") != baseline_spec["lifecycleThresholds"]:
        raise ValueError("B0b fitted artifact changed the frozen semantic thresholds")
    factors = b0b_artifact.get("lifecycleFactors")
    required = set(fit_spec["initialFactors"])
    if not isinstance(factors, dict) or set(factors) != required:
        raise ValueError("B0b fitted global lifecycle factors are missing")
    grid = [finite_number(value) for value in fit_spec["factorGrid"]]
    legacy = baseline_spec["legacyOutcomeExposedFactorsAuditOnly"]
    if any(
        not any(math.isclose(finite_number(value, -1.0), candidate, abs_tol=1e-12) for candidate in grid)
        for value in factors.values()
    ):
        raise ValueError("B0b fitted global lifecycle factors are outside the frozen grid")
    if all(
        math.isclose(finite_number(factors[key]), finite_number(legacy[key]), abs_tol=1e-12)
        for key in required
    ):
        raise ValueError("B0b fitted lifecycle factors copy the outcome-exposed legacy vector")

    tolerance = finite_number(fit_spec["comparisonTolerance"], 1e-12)
    for expression in fit_spec["monotonicConstraints"]:
        match = re.fullmatch(r"([a-z_]+)<=([a-z_]+)", str(expression))
        if not match:
            raise ValueError(f"unsupported frozen B0b monotonic constraint: {expression}")
        left, right = match.groups()
        if finite_number(factors[left]) > finite_number(factors[right]) + tolerance:
            raise ValueError("B0b fitted global lifecycle factors violate monotonic constraints")

    metric_fields = {"caseCount", "wape", "signedAggregateBias", "actualTotal", "predictedTotal"}

    def validate_metric_block(label: str, block: Any) -> None:
        if not isinstance(block, Mapping) or not metric_fields.issubset(block):
            raise ValueError(f"B0b fitted metrics are incomplete: {label}")
        positive_integer(block.get("caseCount"), f"{label}.caseCount")
        metric_wape = require_finite_number(block.get("wape"), f"{label}.wape")
        if metric_wape < 0:
            raise ValueError(f"B0b fitted metric WAPE is invalid: {label}")
        signed_bias = require_finite_number(
            block.get("signedAggregateBias"), f"{label}.signedAggregateBias"
        )
        actual_total = require_finite_number(block.get("actualTotal"), f"{label}.actualTotal")
        predicted_total = require_finite_number(
            block.get("predictedTotal"), f"{label}.predictedTotal"
        )
        if actual_total <= 0:
            raise ValueError(f"B0b fitted metric actual total is invalid: {label}")
        expected_bias = (predicted_total - actual_total) / actual_total
        if not math.isclose(signed_bias, expected_bias, rel_tol=1e-7, abs_tol=1e-7):
            raise ValueError(f"B0b fitted metric bias does not reconcile to totals: {label}")

    for metrics_field in ("oofComparatorMetrics", "finalFitDiagnosticMetrics"):
        metrics = b0b_artifact.get(metrics_field)
        if not isinstance(metrics, Mapping) or set(metrics) != {"overall", "byHorizon"}:
            raise ValueError(f"B0b fitted metrics have the wrong shape: {metrics_field}")
        validate_metric_block(f"{metrics_field}.overall", metrics["overall"])
        by_horizon = metrics["byHorizon"]
        if not isinstance(by_horizon, Mapping) or set(by_horizon) != set(core_horizons):
            raise ValueError(f"B0b fitted metrics are missing core horizons: {metrics_field}")
        for horizon_key in core_horizons:
            validate_metric_block(f"{metrics_field}.byHorizon.{horizon_key}", by_horizon[horizon_key])

    expected_metric_counts = {
        "oofComparatorMetrics": (comparator_case_count, comparator_case_counts),
        "finalFitDiagnosticMetrics": (fit_case_count, fit_case_counts),
    }
    for metrics_field, (overall_count, horizon_counts) in expected_metric_counts.items():
        metrics = b0b_artifact[metrics_field]
        if metrics["overall"]["caseCount"] != overall_count or any(
            metrics["byHorizon"][key]["caseCount"] != horizon_counts[key]
            for key in core_horizons
        ):
            raise ValueError(f"B0b fitted metric counts do not match scope counts: {metrics_field}")

    oof_overall = b0b_artifact["oofComparatorMetrics"]["overall"]
    if not math.isclose(
        finite_number(fit["developmentWape"]), finite_number(oof_overall["wape"]), abs_tol=1e-12
    ) or not math.isclose(
        finite_number(fit["developmentSignedAggregateBias"]),
        finite_number(oof_overall["signedAggregateBias"]),
        abs_tol=1e-12,
    ):
        raise ValueError("B0b fitted development metrics are not the OOF comparator metrics")

    support = b0b_artifact.get("lifecycleSupport")
    support_keys = set(contract["requiredLifecycleSupportKeys"])
    support_fields = set(contract["requiredLifecycleSupportFields"])
    if not isinstance(support, Mapping) or set(support) != support_keys or support_keys != required:
        raise ValueError("B0b global lifecycle support is missing")
    minimum_cases = int(oof_spec["minimumTrainingCasesPerLifecycleFactor"])
    minimum_origins = int(oof_spec["minimumTrainingOriginsPerLifecycleFactor"])
    minimum_share = finite_number(oof_spec["minimumActualRevenueSharePerLifecycleFactor"])
    unsupported = finite_number(oof_spec["unsupportedFactorValue"])
    for stage in required:
        stage_support = support[stage]
        if not isinstance(stage_support, Mapping) or not support_fields.issubset(stage_support):
            raise ValueError(f"B0b lifecycle support is incomplete: {stage}")
        component_cases = int(stage_support["componentCaseCount"])
        origins = int(stage_support["distinctOriginCount"])
        actual_share = finite_number(stage_support["absoluteActualRevenueShare"], -1.0)
        if component_cases < 0 or origins < 0 or not 0.0 <= actual_share <= 1.0:
            raise ValueError(f"B0b lifecycle support is invalid: {stage}")
        support_flag = stage_support.get("supported")
        if not isinstance(support_flag, bool):
            raise ValueError(f"B0b lifecycle support flag is invalid: {stage}")
        structural_support = component_cases >= minimum_cases and origins >= minimum_origins
        share_rounding_radius = 0.5e-8
        if not structural_support and support_flag:
            raise ValueError(f"B0b lifecycle support flag is inconsistent: {stage}")
        if structural_support and actual_share < minimum_share - share_rounding_radius - tolerance:
            if support_flag:
                raise ValueError(f"B0b lifecycle support flag is inconsistent: {stage}")
        if structural_support and actual_share > minimum_share + share_rounding_radius + tolerance:
            if not support_flag:
                raise ValueError(f"B0b lifecycle support flag is inconsistent: {stage}")
        # Inside one 8-decimal rounding half-unit the raw share cannot be
        # reconstructed from the artifact.  The fit runner makes the decision
        # on the raw value and records only the rounded evidence, so either
        # boolean is admissible in that narrow interval.
        if not support_flag and not math.isclose(
            finite_number(factors[stage]), unsupported, abs_tol=tolerance
        ):
            raise ValueError(f"B0b unsupported lifecycle factor is not frozen to fallback: {stage}")

    bound = copy.deepcopy(spec)
    baseline = next(item for item in bound["models"]["baselines"] if item["id"] == "B0b")
    baseline["lifecycleFactors"] = {key: finite_number(value) for key, value in factors.items()}
    baseline["boundFittedParameterDigest"] = sha256_canonical_json(artifact)
    return bound


def month_ordinal(month: str) -> int:
    year_text, month_text = str(month).split("-", 1)
    year, number = int(year_text), int(month_text)
    if number < 1 or number > 12:
        raise ValueError(f"invalid month: {month}")
    return year * 12 + number - 1


def ordinal_month(value: int) -> str:
    return f"{value // 12:04d}-{value % 12 + 1:02d}"


def add_months(month: str, offset: int) -> str:
    return ordinal_month(month_ordinal(month) + int(offset))


def month_range(start: str, end: str) -> list[str]:
    first, last = month_ordinal(start), month_ordinal(end)
    if last < first:
        return []
    return [ordinal_month(value) for value in range(first, last + 1)]


def finite_number(value: Any, default: float = 0.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    return number if math.isfinite(number) else default


def require_finite_number(value: Any, label: str = "value") -> float:
    """Parse a numeric contract value without silently coercing bad data to zero."""

    if isinstance(value, bool):
        raise ValueError(f"{label} is not a finite number")
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{label} is not a finite number") from exc
    if not math.isfinite(number):
        raise ValueError(f"{label} is not a finite number")
    return number


def mean(values: Sequence[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def median(values: Sequence[float]) -> float:
    return float(statistics.median(values)) if values else 0.0


def population_std(values: Sequence[float]) -> float:
    if not values:
        return 0.0
    average = mean(values)
    return math.sqrt(sum((value - average) ** 2 for value in values) / len(values))


def linear_quantile(values: Sequence[float], probability: float) -> float | None:
    clean = sorted(finite_number(value) for value in values if math.isfinite(finite_number(value)))
    if not clean:
        return None
    if len(clean) == 1:
        return clean[0]
    position = min(1.0, max(0.0, probability)) * (len(clean) - 1)
    lower = int(math.floor(position))
    upper = int(math.ceil(position))
    if lower == upper:
        return clean[lower]
    fraction = position - lower
    return clean[lower] * (1.0 - fraction) + clean[upper] * fraction


def trimmed_mean(values: Sequence[float], fraction: float = 0.15) -> float:
    clean = sorted(finite_number(value) for value in values)
    if not clean:
        return 0.0
    if len(clean) < 6:
        return mean(clean)
    trim = max(1, int(len(clean) * fraction))
    kept = clean[trim:-trim] if len(clean) > trim * 2 else clean
    return mean(kept)


def monthly_values(
    monthly: Mapping[str, Any], start: str, end: str
) -> tuple[list[str], list[float]]:
    months = month_range(start, end)
    return months, [finite_number(monthly.get(month, 0.0)) for month in months]


def positive_positions(values: Sequence[float]) -> list[int]:
    return [index for index, value in enumerate(values) if value > 0]


def continuity_score(values: Sequence[float]) -> float:
    active = [value > 0 for value in values]
    if len(active) <= 1:
        return 0.0
    active_pairs = sum(1 for left, right in zip(active, active[1:]) if left and right)
    possible = max(1, sum(active))
    return min(1.0, active_pairs / possible)


def is_round_amount(value: float, params: Mapping[str, Any] | None = None) -> bool:
    params = params or {}
    number = abs(finite_number(value))
    minimum = finite_number(params.get("largePaymentMinimum"), 1000.0)
    integer_tolerance = finite_number(params.get("integerAmountTolerance"), 0.01)
    hundred_tolerance = finite_number(params.get("hundredMultipleQuotientTolerance"), 0.01)
    if number < minimum:
        return False
    return (
        abs(number - round(number)) <= integer_tolerance
        or abs(number / 100.0 - round(number / 100.0)) <= hundred_tolerance
    )


def _channel_history(channel: Mapping[str, Any], cutoff: str, first_month: str) -> tuple[list[str], list[float]]:
    monthly = channel.get("monthly", {})
    return monthly_values(monthly, first_month, cutoff)


def channel_component_key(channel: Mapping[str, Any]) -> str:
    """Keep the frozen channel × business-form classification unit unique."""

    return f"{channel.get('channel_key', '')}\x1f{channel.get('business_form', 'unknown')}"


def channel_index(work: Mapping[str, Any]) -> dict[str, Mapping[str, Any]]:
    """Index channel components and fail closed on an ambiguous component key."""

    result: dict[str, Mapping[str, Any]] = {}
    for channel in work.get("channels", []) or []:
        if not isinstance(channel, Mapping):
            raise ValueError("work channel must be an object")
        key = channel_component_key(channel)
        if key in result:
            raise ValueError("duplicate channel component key")
        result[key] = channel
    return result


def work_first_observed_month(work: Mapping[str, Any]) -> str | None:
    observed: list[str] = []
    for channel in work.get("channels", []) or []:
        explicit = str(channel.get("first_observed_month", ""))
        if explicit:
            observed.append(explicit)
            continue
        monthly = channel.get("monthly", {}) or {}
        observed.extend(str(month) for month in monthly)
    return min(observed) if observed else None


def work_exists_as_of(work: Mapping[str, Any], origin: str) -> bool:
    first_observed = work_first_observed_month(work)
    return first_observed is not None and first_observed <= origin


def classify_channel_as_of(
    channel: Mapping[str, Any], cutoff: str, spec: Mapping[str, Any]
) -> dict[str, Any]:
    """Classify one channel using only facts at or before ``cutoff``."""

    routing_spec = spec["revenueRouting"]
    params = routing_spec["classifierParameters"]
    first_month = spec["authority"]["firstBillMonth"]
    months, values = _channel_history(channel, cutoff, first_month)
    positions = positive_positions(values)
    cash_category = str(channel.get("cash_category", "")).strip()
    if cash_category in {"sales_share", "buyout"}:
        observed_months = [
            month for month, value in zip(months, values) if value != 0
        ]
        label = (
            "sales_share_channel"
            if cash_category == "sales_share"
            else "buyout_channel"
        )
        positive_total = sum((values[index] for index in positions), 0.0)
        return {
            "label": label,
            "confidence": "human_authoritative",
            "signalFamilies": ["user_reviewed_workbook_membership"],
            "positiveMonthCount": len(positions),
            "activeRatio": round(len(observed_months) / max(1, len(values)), 8),
            "continuity": round(continuity_score(values), 8),
            "amountVariation": 0.0,
            "largestShare": (
                round(
                    max((values[index] for index in positions), default=0.0)
                    / positive_total,
                    8,
                )
                if positive_total > 0
                else 0.0
            ),
            "peakMonth": (
                months[max(positions, key=lambda index: values[index])]
                if positions
                else None
            ),
            "buyoutEventMonths": (
                observed_months if cash_category == "buyout" else []
            ),
            "salesMonths": (
                observed_months if cash_category == "sales_share" else []
            ),
            "cashCategoryAuthority": "user_reviewed_workbook_membership",
            "machineClassificationUsed": False,
        }
    if not positions:
        return {
            "label": "unknown_channel",
            "confidence": "low",
            "signalFamilies": [],
            "positiveMonthCount": 0,
            "buyoutEventMonths": [],
            "salesMonths": [],
        }

    positives = [values[index] for index in positions]
    peak_index = max(positions, key=lambda index: values[index])
    peak_value = values[peak_index]
    total_positive = sum(positives)
    post_values = values[peak_index + 1 :]
    tail_indices = [
        peak_index + 1 + index
        for index, value in enumerate(post_values)
        if value > 0 and value < peak_value * finite_number(params["mixedTailMonthMaximumFractionOfPeak"])
    ]

    cluster_sizes = channel.get("batch_cluster_sizes", {}) or {}
    batch_minimum = int(params["sameAmountBatchMinimumDistinctWorks"])
    batch_signal = any(
        month <= cutoff
        and month in {months[index] for index in positions}
        and int(finite_number(size, 1)) >= batch_minimum
        for month, size in cluster_sizes.items()
    )
    minimum_post = int(params["minimumObservedPostPeakZeroMonths"])
    large_round_signal = False
    no_sales_after_signal = False
    for position in positions:
        later = values[position + 1 :]
        if len(later) < minimum_post:
            continue
        amount = values[position]
        if is_round_amount(amount, params) and all(value == 0 for value in later):
            large_round_signal = True
        if amount >= finite_number(params["largePaymentMinimum"]) and not any(value > 0 for value in later):
            no_sales_after_signal = True
    signal_families = []
    if large_round_signal:
        signal_families.append("large_round_or_integer_payment_followed_by_at_least_6_zero_months")
    if batch_signal:
        signal_families.append("same_month_same_amount_batch_size_at_least_3")
    if no_sales_after_signal:
        signal_families.append("payment_at_least_1000_with_no_post_payment_sales")

    active_ratio = len(positions) / max(1, len(values))
    variation = population_std(positives) / mean(positives) if mean(positives) > 0 else 0.0
    largest_share = peak_value / total_positive if total_positive > 0 else 0.0
    natural_sales = bool(
        len(positions) >= int(params["naturalSalesMinimumPositiveMonths"])
        and continuity_score(values) >= finite_number(params["naturalSalesMinimumContinuity"])
        and variation >= finite_number(params["naturalSalesMinimumCoefficientOfVariation"])
        and largest_share < finite_number(params["naturalSalesMaximumLargestShareExclusive"])
    )

    # A batch-like peak followed by a natural sales tail is retained as a mixed
    # channel.  The peak month is not silently attenuated; it is only separated
    # when the frozen evidence rule resolves the component type.
    peak_month = months[peak_index]
    peak_batch_signal = int(finite_number(cluster_sizes.get(peak_month, 1), 1)) >= batch_minimum
    mixed_signal = bool(
        peak_batch_signal
        and peak_value >= finite_number(params["mixedMinimumPeak"])
        and largest_share >= finite_number(params["mixedMinimumPeakShareOfPositive"])
        and len(tail_indices) >= int(params["mixedMinimumPostPeakPositiveTailMonths"])
    )
    if mixed_signal:
        label = "mixed_channel"
        confidence = "medium"
    elif len(signal_families) >= int(routing_spec["minimumBuyoutSignalFamilies"]):
        label = "buyout_channel"
        confidence = "medium" if len(signal_families) == 2 else "high"
    elif natural_sales or (
        len(positions) >= 1
        and len(signal_families) < int(routing_spec["minimumBuyoutSignalFamilies"])
    ):
        label = "sales_share_channel"
        confidence = "high" if natural_sales and len(positions) >= 6 else "medium" if len(positions) >= 3 else "low"
    else:
        label = "unknown_channel"
        confidence = "low"

    buyout_months = [months[peak_index]] if label == "mixed_channel" else (
        [months[index] for index in positions] if label == "buyout_channel" else []
    )
    sales_months = [
        months[index]
        for index in positions
        if months[index] not in set(buyout_months)
    ] if label in {"sales_share_channel", "mixed_channel"} else []
    return {
        "label": label,
        "confidence": confidence,
        "signalFamilies": signal_families,
        "positiveMonthCount": len(positions),
        "activeRatio": round(active_ratio, 8),
        "continuity": round(continuity_score(values), 8),
        "amountVariation": round(variation, 8),
        "largestShare": round(largest_share, 8),
        "peakMonth": peak_month,
        "buyoutEventMonths": buyout_months,
        "salesMonths": sales_months,
    }


def route_work_as_of(
    work: Mapping[str, Any], origin: str, spec: Mapping[str, Any]
) -> dict[str, Any]:
    classified = []
    for channel in sorted(work.get("channels", []), key=channel_component_key):
        # A channel that has no row/existence evidence by the origin must not
        # leak into the prediction view merely because it appears later.
        monthly = channel.get("monthly", {}) or {}
        first_observed = str(channel.get("first_observed_month", ""))
        if first_observed:
            exists_at_origin = first_observed <= origin
        else:
            # Fallback is safe only for the documented sparse observed-row
            # contract.  The real-data adapter always supplies first_observed.
            exists_at_origin = any(str(month) <= origin for month in monthly)
        if not exists_at_origin:
            continue
        result = classify_channel_as_of(channel, origin, spec)
        classified.append(
            {
                "channel_key": channel_component_key(channel),
                "raw_channel_key": str(channel.get("channel_key", "")),
                "business_form": str(channel.get("business_form", "unknown")),
                **result,
            }
        )
    labels = {item["label"] for item in classified}
    has_sales = bool(labels & {"sales_share_channel", "mixed_channel"})
    has_buyout = bool(labels & {"buyout_channel", "mixed_channel"})
    if has_sales and has_buyout:
        route = "buyout_plus_sales"
    elif has_sales:
        route = "pure_sales_share"
    elif has_buyout:
        route = "pure_buyout"
    else:
        route = "unknown_revenue_model"
    return {"route": route, "channels": classified}


def _robust_z(values: Sequence[float], index: int, multiplier: float = 1.4826) -> float:
    if not values:
        return 0.0
    center = median(values)
    mad = median([abs(value - center) for value in values])
    if mad <= 0:
        return math.inf if values[index] > center else 0.0
    return (values[index] - center) / (multiplier * mad)


def spike_candidates_as_of(
    channel: Mapping[str, Any], cutoff: str, classification: Mapping[str, Any], spec: Mapping[str, Any]
) -> list[dict[str, Any]]:
    month_pattern = re.compile(r"\d{4}-(0[1-9]|1[0-2])")
    allowed_types = set(spec["spikePolicy"]["candidateTypes"])
    confirmations: list[Mapping[str, Any]] = []
    for confirmation in channel.get("spike_confirmations", []) or []:
        if not isinstance(confirmation, Mapping):
            raise ValueError("spike confirmation must be an object")
        candidate_month = confirmation.get("candidate_month")
        available_as_of = confirmation.get("available_as_of")
        confirmed_type = confirmation.get("confirmed_type")
        if (
            not isinstance(candidate_month, str)
            or month_pattern.fullmatch(candidate_month) is None
            or not isinstance(available_as_of, str)
            or month_pattern.fullmatch(available_as_of) is None
        ):
            raise ValueError("spike confirmation months must use YYYY-MM")
        if confirmed_type not in allowed_types:
            raise ValueError("spike confirmation contains an unsupported type")
        confirmations.append(confirmation)
    first = max(
        month_ordinal(spec["authority"]["firstBillMonth"]),
        month_ordinal(add_months(cutoff, -(spec["spikePolicy"]["lookbackMonths"] - 1))),
    )
    months, values = monthly_values(channel.get("monthly", {}), ordinal_month(first), cutoff)
    candidate_params = spec["spikePolicy"]["candidateParameters"]
    positive_total = sum(value for value in values if value > 0)
    all_history_months, all_history = _channel_history(
        channel, cutoff, spec["authority"]["firstBillMonth"]
    )
    all_positive = positive_positions(all_history)
    candidates = []
    for index, value in enumerate(values):
        if value <= 0 or positive_total <= 0:
            continue
        share = value / positive_total
        z_score = _robust_z(
            values,
            index,
            finite_number(candidate_params["robustZMadMultiplier"], 1.4826),
        )
        if (
            share < finite_number(candidate_params["singleMonthPositiveShareMinimum"], 0.5)
            and not (
                math.isfinite(z_score)
                and z_score > finite_number(candidate_params["robustZThresholdExclusive"], 6.0)
            )
            and z_score != math.inf
        ):
            continue
        month = months[index]
        full_index = all_history_months.index(month)
        earlier_zeros = 0
        cursor = full_index - 1
        while cursor >= 0 and all_history[cursor] == 0:
            earlier_zeros += 1
            cursor -= 1
        later_two = all_history[full_index + 1 : full_index + 3]
        resumed = any(item > 0 for item in later_two)
        tail_fraction = finite_number(
            spec["revenueRouting"]["classifierParameters"]["mixedTailMonthMaximumFractionOfPeak"],
            0.35,
        )
        later_tail = [
            item for item in all_history[full_index + 1 :] if 0 < item < value * tail_fraction
        ]
        cluster_size = int(finite_number((channel.get("batch_cluster_sizes", {}) or {}).get(month, 1), 1))
        confirmed_types = {
            str(confirmation.get("confirmed_type", ""))
            for confirmation in confirmations
            if str(confirmation.get("candidate_month", "")) == month
            and str(confirmation["available_as_of"]) <= cutoff
        }
        confirmed_types.discard("")
        if not confirmed_types <= allowed_types:
            raise ValueError("spike confirmation contains an unsupported type")
        if len(confirmed_types) > 1:
            raise ValueError("spike confirmation contains conflicting as-of types")
        confirmed = next(iter(confirmed_types), "")
        if month in set(classification.get("buyoutEventMonths", [])):
            heuristic_type = "buyout"
        elif cluster_size >= int(spec["revenueRouting"]["classifierParameters"]["sameAmountBatchMinimumDistinctWorks"]):
            heuristic_type = "batch_proration"
        elif all_positive.index(full_index) < 3 and len(later_tail) >= 2:
            heuristic_type = "launch_burst"
        elif earlier_zeros >= 2 and resumed:
            heuristic_type = "settlement_lag"
        else:
            heuristic_type = "unconfirmed"
        candidate_type = confirmed or heuristic_type
        candidates.append(
            {
                "month": month,
                "type": candidate_type,
                "heuristicType": heuristic_type,
                "singleMonthShare": round(share, 8),
                "robustZ": None if not math.isfinite(z_score) else round(z_score, 8),
                "evidenceConfirmed": bool(confirmed),
                "appliedDamping": False,
            }
        )
    return candidates


def lifecycle(
    history: Sequence[float],
    thresholds: Mapping[str, Any],
    rebound_previous3_to_previous6_maximum: float = 0.8,
) -> str:
    positions = positive_positions(history)
    history_count = len(history[positions[0] :]) if positions else 0
    if history_count < int(thresholds["insufficientHistoryCompleteMonths"]):
        return "insufficient_history"
    last6 = sum(history[-6:])
    if last6 <= finite_number(thresholds["inactiveRecent6RevenueMax"]):
        return "inactive"
    recent6 = mean(history[-6:])
    previous6 = mean(history[-12:-6]) if len(history) >= 12 else 0.0
    recent3 = mean(history[-3:])
    previous3 = mean(history[-6:-3]) if len(history) >= 6 else 0.0
    if (
        previous3 != 0
        and recent3 / previous3 > finite_number(thresholds["reboundRecent3Previous3Ratio"])
        and previous3 < previous6 * rebound_previous3_to_previous6_maximum
    ):
        return "rebound"
    if previous6 != 0 and recent6 / previous6 > finite_number(thresholds["growthRecent6Prior6Ratio"]):
        return "growth"
    if previous6 != 0 and recent6 / previous6 < finite_number(thresholds["decliningRecent6Prior6Ratio"]):
        return "declining"
    last12 = sum(history[-12:])
    if 0 < last12 <= finite_number(thresholds["longTailLast12RevenueMax"]):
        return "long_tail"
    return "stable"


def _croston_sba(history: Sequence[float], alpha: float) -> float:
    first_positive = next((index for index, value in enumerate(history) if value > 0), None)
    if first_positive is None:
        return 0.0
    demand = history[first_positive]
    interval = float(first_positive + 1)
    gap = 1.0
    for value in history[first_positive + 1 :]:
        if value > 0:
            demand = demand + alpha * (value - demand)
            interval = interval + alpha * (gap - interval)
            gap = 1.0
        else:
            gap += 1.0
    return max(0.0, (1.0 - alpha / 2.0) * demand / max(interval, 1e-12))


def _sales_monthly_forecast(
    history_months: Sequence[str],
    history: Sequence[float],
    origin: str,
    horizon: int,
    model_id: str,
    spec: Mapping[str, Any],
) -> tuple[dict[str, float], dict[str, Any]]:
    future_months = [add_months(origin, offset) for offset in range(1, horizon + 1)]
    if horizon <= 0:
        return {}, {"model": model_id, "zeroHorizon": True}
    last12 = list(history[-12:])
    uniform_monthly = mean(last12)
    details: dict[str, Any] = {"model": model_id}
    if model_id == "B0b":
        baseline = next(item for item in spec["models"]["baselines"] if item["id"] == "B0b")
        constants = baseline["structuralConstants"]
        raw = mean(last12)
        robust = trimmed_mean(
            history[-24:], finite_number(constants["trimmedMeanTailFraction"], 0.15)
        )
        positive_median = median([value for value in history if value > 0])
        signal = max(
            raw,
            robust,
            positive_median * finite_number(constants["positiveMedianWeight"], 0.4),
        )
        stage = lifecycle(
            history,
            baseline["lifecycleThresholds"],
            finite_number(constants["reboundPrevious3ToPrevious6MaximumExclusive"], 0.8),
        )
        bound_factors = baseline.get("lifecycleFactors")
        factor_source = bound_factors or baseline["developmentFit"]["initialFactors"]
        factor = finite_number(factor_source.get(stage, 1.0), 1.0)
        unfactored_point = max(0.0, signal * horizon)
        total = unfactored_point * factor
        active_months = len(positive_positions(history))
        low_revenue_cap = None
        if (
            sum(last12) <= finite_number(constants["lowRevenueLast12Threshold"], 10.0)
            or active_months <= int(constants["lowRevenueActiveMonthThreshold"])
        ):
            low_revenue_cap = max(
                raw * horizon,
                finite_number(constants["positiveHistoryPointFloor"], 1.0)
                if sum(last12) > 0
                else 0.0,
            )
            total = min(total, low_revenue_cap)
        uniform_monthly = total / horizon
        details.update(
            {
                "lifecycle": stage,
                "monthlySignal": signal,
                "factor": factor,
                "unfactoredPoint": unfactored_point,
                "lowRevenueGuardCap": low_revenue_cap,
                "lowRevenueGuardApplied": low_revenue_cap is not None,
                "parameterMode": "committed_fitted_global" if bound_factors else "synthetic_prefit_initial",
                "factorScope": "global_across_core_horizons",
            }
        )
    elif model_id == "B1":
        uniform_monthly = max(0.0, mean(last12))
    elif model_id == "B2":
        if len(history) >= 12:
            last_year = list(history[-12:])
            return (
                {
                    month: max(0.0, finite_number(last_year[index % 12]))
                    for index, month in enumerate(future_months)
                },
                details,
            )
        details["fallback"] = "B1"
        uniform_monthly = max(0.0, mean(last12))
    elif model_id == "B3":
        dormant = sum(history[-6:]) == 0 and any(value > 0 for value in history[:-6])
        sparse = sum(1 for value in history[-12:] if value > 0) <= 3
        if dormant:
            uniform_monthly = 0.0
            details["branch"] = "dormant_zero"
        elif sparse:
            alpha = finite_number(next(item for item in spec["models"]["baselines"] if item["id"] == "B3")["crostonAlpha"], 0.1)
            uniform_monthly = _croston_sba(history, alpha)
            details["branch"] = "croston_sba"
        else:
            uniform_monthly = max(0.0, mean(last12))
            details["branch"] = "B1"
    else:
        raise ValueError(f"unsupported baseline: {model_id}")
    return ({month: max(0.0, uniform_monthly) for month in future_months}, details)


def _buyout_monthly_forecast(
    event_values: Sequence[float], event_months: Sequence[str], origin: str, horizon: int, spec: Mapping[str, Any]
) -> tuple[dict[str, float], dict[str, Any]]:
    config = spec["revenueRouting"]["pure_buyout"]
    if horizon <= 0:
        return {}, {"cycleMonths": None, "eventAmountMean": 0.0, "eventCount": 0}
    work_month_totals: dict[str, float] = defaultdict(float)
    for month, value in zip(event_months, event_values):
        work_month_totals[str(month)] += finite_number(value)
    ordered_months = sorted(
        [month for month, value in work_month_totals.items() if value > 0],
        key=month_ordinal,
    )
    positive_events = [work_month_totals[month] for month in ordered_months]
    gaps = [month_ordinal(right) - month_ordinal(left) for left, right in zip(ordered_months, ordered_months[1:])]
    if gaps:
        cycle = median(gaps)
    else:
        cycle = finite_number(config["singleEventCycleFallbackMonths"], 24.0)
    lower, upper = [finite_number(value) for value in config["cycleBoundsMonths"]]
    cycle = min(upper, max(lower, cycle))
    amount = mean(positive_events)
    monthly_equivalent = max(0.0, amount / max(cycle, 1.0))
    return (
        {add_months(origin, offset): monthly_equivalent for offset in range(1, horizon + 1)},
        {"cycleMonths": cycle, "eventAmountMean": amount, "eventCount": len(positive_events)},
    )


def _aggregate_route_history(
    work: Mapping[str, Any], origin: str, routing: Mapping[str, Any], spec: Mapping[str, Any]
) -> tuple[list[str], list[float]]:
    months = month_range(spec["authority"]["firstBillMonth"], origin)
    totals = {month: 0.0 for month in months}
    labels = {item["channel_key"]: item for item in routing["channels"]}
    for channel in work.get("channels", []):
        key = channel_component_key(channel)
        label = labels.get(key, {"label": "unknown_channel", "buyoutEventMonths": []})
        include_months: set[str]
        if routing["route"] == "pure_buyout":
            include_months = set(label.get("buyoutEventMonths", []))
        elif label["label"] == "sales_share_channel":
            include_months = set(months)
        elif label["label"] == "mixed_channel":
            include_months = set(months) - set(label.get("buyoutEventMonths", []))
        else:
            include_months = set()
        for month in include_months:
            if month <= origin:
                totals[month] += finite_number((channel.get("monthly", {}) or {}).get(month, 0.0))
    return months, [totals[month] for month in months]


def forecastability_as_of(
    work: Mapping[str, Any], origin: str, routing: Mapping[str, Any], spec: Mapping[str, Any]
) -> dict[str, Any]:
    work_id = str(work.get("standard_work_id", "")).strip()
    if not work_id or bool(work.get("duplicate_standard_work_id")):
        return {"eligible": False, "status": "blocked_identity_integrity"}
    months, values = _aggregate_route_history(work, origin, routing, spec)
    route_positions = positive_positions(values)
    raw_totals = {month: 0.0 for month in months}
    for channel in work.get("channels", []) or []:
        first_observed = str(channel.get("first_observed_month", ""))
        if first_observed and first_observed > origin:
            continue
        for month in months:
            raw_totals[month] += finite_number((channel.get("monthly", {}) or {}).get(month, 0.0))
    raw_values = [raw_totals[month] for month in months]
    raw_positions = positive_positions(raw_values)
    if not raw_positions:
        return {"eligible": False, "status": "blocked_no_positive_history"}
    history_start_position = route_positions[0] if route_positions else raw_positions[0]
    observed = len(values[history_start_position:])
    if observed < int(spec["forecastability"]["rules"]["minimumObservedCalendarMonths"]):
        return {"eligible": False, "status": "blocked_insufficient_history", "observedMonths": observed}
    if routing["route"] == "unknown_revenue_model":
        return {"eligible": False, "status": "blocked_unresolved_route", "observedMonths": observed}
    return {"eligible": True, "status": "forecastable_numeric", "observedMonths": observed}


def confidence_as_of(
    eligibility: Mapping[str, Any],
    routing: Mapping[str, Any],
    spike_candidates: Sequence[Mapping[str, Any]],
    history_values: Sequence[float],
    horizon: int,
    long_horizon_evidence: bool,
) -> str:
    if not eligibility.get("eligible"):
        return "unavailable"
    if horizon > 24:
        return "low"
    observed = int(eligibility.get("observedMonths", 0))
    unresolved_spike = any(not item.get("evidenceConfirmed", False) for item in spike_candidates)
    active = len(positive_positions(history_values))
    enough_signal = active >= 3 if routing.get("route") == "pure_buyout" else active >= 12
    if observed >= 24 and enough_signal and not unresolved_spike:
        return "high"
    if observed >= 12:
        return "medium"
    return "low"


def annual_breakdown(monthly_forecast: Mapping[str, float], point_forecast: float) -> list[dict[str, Any]]:
    cent = Decimal("0.01")
    by_year: dict[str, Decimal] = defaultdict(Decimal)
    for month, amount in sorted(monthly_forecast.items()):
        by_year[month[:4]] += Decimal(str(finite_number(amount)))
    rows = [
        {"year": year, "amount": float(amount.quantize(cent, rounding=ROUND_HALF_UP))}
        for year, amount in sorted(by_year.items())
    ]
    target = Decimal(str(finite_number(point_forecast))).quantize(cent, rounding=ROUND_HALF_UP)
    if rows:
        current = sum(Decimal(str(item["amount"])) for item in rows)
        difference = target - current
        rows[-1]["amount"] = float(
            (Decimal(str(rows[-1]["amount"])) + difference).quantize(
                cent, rounding=ROUND_HALF_UP
            )
        )
    return rows


def ordered_limitations(values: Iterable[str], spec: Mapping[str, Any]) -> list[str]:
    present = {str(value) for value in values if str(value)}
    order = list(spec["publicOutput"]["limitationOrder"])
    eligibility_values = [
        value for value in spec["forecastability"]["statuses"] if value in present
    ]
    result: list[str] = []
    for value in order:
        if value == "eligibility_status":
            result.extend(eligibility_values)
        elif value in present:
            result.append(value)
    consumed = set(result) | {"eligibility_status"}
    result.extend(sorted(present - consumed))
    return result


def resolve_serving_horizon_as_of(
    rights_snapshots: Sequence[Mapping[str, Any]],
    origin: str,
    spec: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Resolve a serving horizon from the latest unambiguous as-of rights fact."""

    spec = spec or load_spec()
    month_pattern = re.compile(r"\d{4}-(0[1-9]|1[0-2])")

    def require_month(value: Any, label: str) -> str:
        if not isinstance(value, str) or month_pattern.fullmatch(value) is None:
            raise ValueError(f"rights snapshot {label} must use YYYY-MM")
        # Keep the parser and the lexical contract aligned.
        month_ordinal(value)
        return value

    def require_positive_integer(value: Any, label: str) -> int:
        if isinstance(value, bool) or not isinstance(value, int) or value < 1:
            raise ValueError(f"rights snapshot {label} must be a positive integer")
        return value

    require_month(origin, "origin")
    if (
        not isinstance(rights_snapshots, Sequence)
        or isinstance(rights_snapshots, (str, bytes, bytearray))
        or isinstance(rights_snapshots, Mapping)
        or not rights_snapshots
    ):
        raise ValueError("rights snapshots must be a nonempty sequence")

    horizon_spec = spec["publicOutput"]["forecastHorizon"]
    contract = horizon_spec["servingRightsSnapshotContract"]
    allowed_types = set(horizon_spec["rightsTermTypePolicy"])
    validated: list[Mapping[str, Any]] = []
    for snapshot in rights_snapshots:
        if not isinstance(snapshot, Mapping):
            raise ValueError("rights snapshot must be an object")
        missing = set(contract["requiredFields"]) - set(snapshot)
        if missing:
            raise ValueError(f"rights snapshot is missing required fields: {sorted(missing)}")
        available_as_of = require_month(snapshot.get("available_as_of"), "available_as_of")
        term_type = snapshot.get("rights_term_type")
        if not isinstance(term_type, str) or term_type not in allowed_types:
            raise ValueError("rights snapshot has an unsupported rights_term_type")

        # Revision 5 requires validation of every supplied field before the
        # as-of filter, including fields on snapshots that are only available
        # in the future.
        if "rights_end_month" in snapshot:
            require_month(snapshot.get("rights_end_month"), "rights_end_month")
        if "rights_start_month" in snapshot:
            require_month(snapshot.get("rights_start_month"), "rights_start_month")
        if "relative_term_months" in snapshot:
            require_positive_integer(snapshot.get("relative_term_months"), "relative_term_months")
        if "rights_end_year" in snapshot:
            year = snapshot.get("rights_end_year")
            if isinstance(year, bool) or not isinstance(year, int) or not 1000 <= year <= 9999:
                raise ValueError("rights snapshot rights_end_year must be a four-digit year")

        if term_type == "exact_date" and "rights_end_month" not in snapshot:
            raise ValueError("exact-date rights snapshot is missing rights_end_month")
        if term_type == "year_only" and "rights_end_year" not in snapshot:
            raise ValueError("year-only rights snapshot is missing rights_end_year")
        if term_type == "relative_term":
            has_start = "rights_start_month" in snapshot
            has_term = "relative_term_months" in snapshot
            if has_start != has_term:
                raise ValueError("relative-term derivation fields must be present together")
        # Referencing the validated local keeps the full validation step
        # explicit; canonical deduplication below still uses the exact payload.
        _ = available_as_of
        validated.append(snapshot)

    eligible = [item for item in validated if str(item["available_as_of"]) <= origin]
    if not eligible:
        raise ValueError("no rights snapshot is available at the serving origin")
    latest_available = max(str(item["available_as_of"]) for item in eligible)
    latest = [item for item in eligible if str(item["available_as_of"]) == latest_available]
    distinct_payloads: dict[bytes, Mapping[str, Any]] = {}
    for snapshot in latest:
        distinct_payloads[canonical_json_bytes(snapshot)] = snapshot
    if len(distinct_payloads) != 1:
        raise ValueError("latest rights snapshots contain conflicting payloads")
    selected = next(iter(distinct_payloads.values()))
    term_type = str(selected["rights_term_type"])

    limitations: list[str] = []
    if term_type == "exact_date":
        horizon = max(
            0,
            month_ordinal(str(selected["rights_end_month"])) - month_ordinal(origin),
        )
    elif term_type == "perpetual":
        horizon = int(horizon_spec["perpetualPlanningHorizonMonths"])
        limitations.append(str(horizon_spec["perpetualLimitation"]))
    elif term_type == "relative_term":
        if "rights_start_month" not in selected:
            horizon = int(horizon_spec["nonExactRightsTermPlanningHorizonMonths"])
            limitations.append(str(horizon_spec["nonExactRightsTermLimitation"]))
        else:
            rights_end = add_months(
                str(selected["rights_start_month"]),
                int(selected["relative_term_months"]),
            )
            horizon = max(0, month_ordinal(rights_end) - month_ordinal(origin))
    elif term_type == "year_only":
        rights_end = f"{int(selected['rights_end_year']):04d}-12"
        horizon = min(
            int(horizon_spec["nonExactRightsTermPlanningHorizonMonths"]),
            max(0, month_ordinal(rights_end) - month_ordinal(origin)),
        )
        limitations.append(str(horizon_spec["nonExactRightsTermLimitation"]))
    elif term_type == "expired_unknown_date":
        horizon = 0
        limitations.append("rights_expired_unknown_date")
    else:  # pragma: no cover - guarded by the frozen enum validation above.
        raise ValueError("rights snapshot has an unsupported rights_term_type")

    return {
        "horizon_months": int(horizon),
        "limitations": ordered_limitations(limitations, spec),
    }


def predict_for_serving_as_of(
    work: Mapping[str, Any],
    origin: str,
    model_id: str,
    rights_snapshots: Sequence[Mapping[str, Any]],
    spec: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Serve exactly the four public fields using an internally resolved horizon."""

    spec = spec or load_spec()
    resolved = resolve_serving_horizon_as_of(rights_snapshots, origin, spec)
    horizon = int(resolved["horizon_months"])
    prediction = predict_as_of(
        work,
        origin,
        horizon,
        model_id,
        spec,
        b0b_parameter_role=("committed_development_fit" if model_id == "B0b" else None),
    )
    public = prediction["public_output"]
    limitations = ordered_limitations(
        [*public["limitation"], *resolved["limitations"]], spec
    )
    if horizon == 0:
        point_forecast: float | None = 0
        yearly: list[dict[str, Any]] = []
    else:
        point_forecast = public["pointForecast"]
        yearly = public["annualBreakdown"]
    result = {
        "pointForecast": point_forecast,
        "annualBreakdown": yearly,
        "confidence": public["confidence"],
        "limitation": limitations,
    }
    if set(result) != set(spec["publicOutput"]["allowedFields"]):
        raise AssertionError("serving output does not match the frozen public contract")
    return result


def aggregate_case_key(result: Mapping[str, Any]) -> tuple[Any, ...]:
    key = result["case_key"]
    return (
        key["standard_work_id"],
        key["origin"],
        int(key["horizon_months"]),
        key["route"],
    )


def validate_b0b_parameter_role(
    spec: Mapping[str, Any], origin: str, parameter_role: str | None
) -> None:
    """Make B0b cold-start, fold-fit, and committed-fit use explicit."""

    baseline = next(item for item in spec["models"]["baselines"] if item["id"] == "B0b")
    has_factors = isinstance(baseline.get("lifecycleFactors"), Mapping)
    has_artifact_digest = bool(
        re.fullmatch(r"[0-9a-f]{64}", str(baseline.get("boundFittedParameterDigest", "")))
    )
    development_origins = {
        str(value)
        for split in spec["origins"]["coreByHorizon"].values()
        for value in split["development"]
    }
    warmup_origins = {
        str(value) for value in spec["origins"]["forwardValidation"]["warmupOrigins"]
    }
    score_origins = {
        str(value) for value in spec["origins"]["forwardValidation"]["scoreOrigins"]
    }
    if parameter_role == "interval_warmup_cold_start":
        valid = not has_factors and origin in warmup_origins
    elif parameter_role == "prefit_development_template":
        valid = not has_factors and origin in development_origins
    elif parameter_role == "development_forward_fold":
        valid = has_factors and not has_artifact_digest and origin in score_origins
    elif parameter_role == "committed_development_fit":
        valid = has_factors and has_artifact_digest
    else:
        raise ValueError("B0b prediction requires an explicit frozen parameter role")
    if not valid:
        raise ValueError(f"B0b parameter state does not match role: {parameter_role}")


def predict_as_of(
    work: Mapping[str, Any],
    origin: str,
    horizon: int,
    model_id: str,
    spec: Mapping[str, Any] | None = None,
    *,
    long_horizon_evidence: bool = False,
    b0b_parameter_role: str | None = None,
) -> dict[str, Any]:
    """Create a prediction without reading any fact after ``origin``."""

    spec = spec or load_spec()
    if model_id not in {"B0b", "B1", "B2", "B3"}:
        raise ValueError(f"unsupported replay model: {model_id}")
    if model_id == "B0b":
        validate_b0b_parameter_role(spec, origin, b0b_parameter_role)
    elif b0b_parameter_role is not None:
        raise ValueError("B0b parameter role was supplied for a different model")
    if int(horizon) < 0:
        raise ValueError("forecast horizon cannot be negative")
    if not work_exists_as_of(work, origin):
        raise ValueError("work is a future catalog entrant at this origin")
    channel_by_key = channel_index(work)
    routing = route_work_as_of(work, origin, spec)
    eligibility = forecastability_as_of(work, origin, routing, spec)
    spike_candidates: list[dict[str, Any]] = []
    for item in routing["channels"]:
        channel = channel_by_key[item["channel_key"]]
        for candidate in spike_candidates_as_of(channel, origin, item, spec):
            spike_candidates.append({"channel_key": item["channel_key"], **candidate})

    route_months, route_history = _aggregate_route_history(work, origin, routing, spec)
    component_rows: list[dict[str, Any]] = []
    future_totals = {add_months(origin, offset): 0.0 for offset in range(1, horizon + 1)}
    if eligibility.get("eligible") and horizon > 0 and routing["route"] == "pure_buyout":
        event_values: list[float] = []
        event_months: list[str] = []
        for item in routing["channels"]:
            if item["label"] not in {"buyout_channel", "mixed_channel"}:
                continue
            channel = channel_by_key[item["channel_key"]]
            for month in item.get("buyoutEventMonths", []):
                value = finite_number((channel.get("monthly", {}) or {}).get(month, 0.0))
                if value > 0:
                    event_months.append(month)
                    event_values.append(value)
        forecast, detail = _buyout_monthly_forecast(event_values, event_months, origin, horizon, spec)
        future_totals.update(forecast)
        component_rows.append(
            {
                "channel_key": "__work_buyout_cycle__",
                "point_forecast": round(sum(forecast.values()), 8),
                "detail": detail,
            }
        )
    elif eligibility.get("eligible") and horizon > 0:
        for item in routing["channels"]:
            if item["label"] not in {"sales_share_channel", "mixed_channel"}:
                continue
            channel = channel_by_key[item["channel_key"]]
            history_months, history = _channel_history(channel, origin, spec["authority"]["firstBillMonth"])
            if item["label"] == "mixed_channel":
                buyout_months = set(item.get("buyoutEventMonths", []))
                history = [0.0 if month in buyout_months else value for month, value in zip(history_months, history)]
            forecast, detail = _sales_monthly_forecast(history_months, history, origin, horizon, model_id, spec)
            if model_id == "B0b":
                detail["parameterRole"] = b0b_parameter_role
            for month, value in forecast.items():
                future_totals[month] += value
            component_rows.append(
                {
                    "channel_key": item["channel_key"],
                    "point_forecast": round(sum(forecast.values()), 8),
                    "detail": detail,
                }
            )

    point = round(sum(future_totals.values()), 8) if eligibility.get("eligible") else None
    limitations: list[str] = []
    if not eligibility.get("eligible"):
        limitations.append(str(eligibility.get("status")))
    if routing["route"] == "unknown_revenue_model":
        limitations.append("unresolved_revenue_model")
    if any(item["label"] == "unknown_channel" for item in routing["channels"]):
        limitations.append("unresolved_channel_component")
    if any(not item.get("evidenceConfirmed", False) for item in spike_candidates):
        limitations.append("unconfirmed_spike_candidate_not_damped")
    if horizon > spec["backtest"]["extrapolatedAfterMonths"]:
        limitations.append("extrapolated")
    limitations = ordered_limitations(limitations, spec)

    confidence = confidence_as_of(
        eligibility,
        routing,
        spike_candidates,
        route_history,
        horizon,
        long_horizon_evidence,
    )
    annual_allocation = (
        {
            add_months(origin, offset): finite_number(point) / horizon
            for offset in range(1, horizon + 1)
        }
        if point is not None and horizon > 0
        else {}
    )
    public = {
        "pointForecast": point,
        "annualBreakdown": annual_breakdown(annual_allocation, point or 0.0) if point is not None else [],
        "confidence": confidence,
        "limitation": limitations,
    }
    features = {
        "observed_months": int(eligibility.get("observedMonths", 0)),
        "active_months": len(positive_positions(route_history)),
        "last_3": round(sum(route_history[-3:]), 8),
        "last_6": round(sum(route_history[-6:]), 8),
        "last_12": round(sum(route_history[-12:]), 8),
        "last_24": round(sum(route_history[-24:]), 8),
        "dormant": bool(sum(route_history[-6:]) == 0 and any(value > 0 for value in route_history[:-6])),
        "sparse_income": bool(sum(1 for value in route_history[-12:] if value > 0) <= 3),
    }
    return {
        "model_id": model_id,
        "case_key": {
            "standard_work_id": str(work.get("standard_work_id", "")),
            "origin": origin,
            "horizon_months": int(horizon),
            "route": routing["route"],
        },
        "route": routing["route"],
        "eligibility": eligibility,
        "features": features,
        "point_forecast": point,
        "annual_breakdown": public["annualBreakdown"],
        "confidence": confidence,
        "limitation": limitations,
        "spike_candidates": spike_candidates,
        "channel_components": component_rows,
        "public_output": public,
    }


def build_truth_window(
    work: Mapping[str, Any],
    origin: str,
    horizon: int,
    route_at_origin: str,
    spec: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Build an outcome label without exposing it to ``predict_as_of``."""

    spec = spec or load_spec()
    channel_index(work)
    target_end = add_months(origin, horizon)
    target_months = set(month_range(add_months(origin, 1), target_end))
    actual = 0.0
    uncertain = False
    unseen_sales_channels = 0
    component_actuals: list[dict[str, Any]] = []
    origin_routing = route_work_as_of(work, origin, spec)
    if route_at_origin != origin_routing["route"]:
        raise ValueError("truth route does not match the prediction-time route")
    known_channels = {item["channel_key"] for item in origin_routing["channels"] if item["label"] != "unknown_channel"}
    for channel in work.get("channels", []):
        key = channel_component_key(channel)
        outcome = classify_channel_as_of(channel, target_end, spec)
        monthly = channel.get("monthly", {}) or {}
        values = {month: finite_number(monthly.get(month, 0.0)) for month in target_months}
        if route_at_origin == "unknown_revenue_model":
            uncertain = True
            included_months = target_months
        elif outcome["label"] == "unknown_channel":
            uncertain = True
            included_months = target_months
        elif route_at_origin == "pure_buyout":
            if outcome["label"] == "buyout_channel":
                included_months = target_months
            elif outcome["label"] == "mixed_channel":
                included_months = target_months & set(outcome.get("buyoutEventMonths", []))
            else:
                included_months = set()
        else:
            if outcome["label"] == "sales_share_channel":
                included_months = target_months
            elif outcome["label"] == "mixed_channel":
                included_months = target_months - set(outcome.get("buyoutEventMonths", []))
            elif outcome["label"] == "buyout_channel":
                included_months = set()
            else:
                included_months = target_months
        channel_actual = sum(values[month] for month in included_months)
        actual += channel_actual
        if key not in known_channels and outcome["label"] in {"sales_share_channel", "mixed_channel"} and channel_actual != 0:
            unseen_sales_channels += 1
        component_actuals.append(
            {
                "channel_key": key,
                "actual": round(channel_actual, 8),
                "outcome_label": outcome["label"],
                "known_resolved_at_origin": key in known_channels,
            }
        )
    return {
        "actual": round(actual, 8),
        "target_end": target_end,
        "actual_label_uncertain": uncertain,
        "unseen_sales_channel_count": unseen_sales_channels,
        "component_actuals": component_actuals,
    }


def signed_aggregate_bias(predictions: Iterable[float], actuals: Iterable[float]) -> float | None:
    prediction_values = list(predictions)
    actual_values = list(actuals)
    if len(prediction_values) != len(actual_values):
        raise ValueError("signed aggregate bias vectors have different lengths")
    pred_total = sum(
        require_finite_number(value, f"predictions[{index}]")
        for index, value in enumerate(prediction_values)
    )
    actual_total = sum(
        require_finite_number(value, f"actuals[{index}]")
        for index, value in enumerate(actual_values)
    )
    if actual_total <= 0:
        return None
    return (pred_total - actual_total) / actual_total


def wape(predictions: Iterable[float], actuals: Iterable[float]) -> float | None:
    prediction_values = list(predictions)
    actual_values = list(actuals)
    if len(prediction_values) != len(actual_values):
        raise ValueError("WAPE vectors have different lengths")
    pairs = [
        (
            require_finite_number(pred, f"predictions[{index}]"),
            require_finite_number(actual, f"actuals[{index}]"),
        )
        for index, (pred, actual) in enumerate(zip(prediction_values, actual_values))
    ]
    denominator = sum(abs(actual) for _, actual in pairs)
    if denominator <= 0:
        return None
    return sum(abs(pred - actual) for pred, actual in pairs) / denominator


def finite_sample_conformal_quantile(
    residuals: Sequence[float], coverage: float = 0.8
) -> float | None:
    coverage_value = require_finite_number(coverage, "coverage")
    if not 0.0 < coverage_value < 1.0:
        raise ValueError("coverage must be strictly between zero and one")
    clean = []
    for index, value in enumerate(residuals):
        residual = require_finite_number(value, f"residuals[{index}]")
        if residual < 0:
            raise ValueError("conformal residual cannot be negative")
        clean.append(residual)
    clean.sort()
    if not clean:
        return None
    rank = min(len(clean), int(math.ceil((len(clean) + 1) * coverage_value)))
    return clean[rank - 1]


def conformal_interval(point: float, residuals: Sequence[float]) -> tuple[float, float] | None:
    quantile = finite_sample_conformal_quantile(residuals, 0.8)
    if quantile is None:
        return None
    center = require_finite_number(point, "point")
    return max(0.0, center - quantile), center + quantile


def interval_score_80(actual: float, lower: float, upper: float) -> float:
    y = require_finite_number(actual, "actual")
    low = require_finite_number(lower, "lower")
    high = require_finite_number(upper, "upper")
    if high < low:
        raise ValueError("interval upper bound is below lower bound")
    score = high - low
    if y < low:
        score += 10.0 * (low - y)
    elif y > high:
        score += 10.0 * (y - high)
    return score


def wis_80(actual: float, point: float, lower: float, upper: float) -> float:
    absolute_error = abs(
        require_finite_number(actual, "actual") - require_finite_number(point, "point")
    )
    return (0.5 * absolute_error + 0.1 * interval_score_80(actual, lower, upper)) / 1.5


def standardized_interval_width(
    lowers: Sequence[float], uppers: Sequence[float], actuals: Sequence[float]
) -> float | None:
    if len(lowers) != len(uppers) or len(lowers) != len(actuals):
        raise ValueError("standardized interval width vectors have different lengths")
    triples = [
        (
            require_finite_number(lower, f"lowers[{index}]"),
            require_finite_number(upper, f"uppers[{index}]"),
            require_finite_number(actual, f"actuals[{index}]"),
        )
        for index, (lower, upper, actual) in enumerate(zip(lowers, uppers, actuals))
    ]
    widths = 0.0
    for lower, upper, _ in triples:
        if upper < lower:
            raise ValueError("interval upper bound is below lower bound")
        widths += upper - lower
    denominator = sum(abs(actual) for _, _, actual in triples)
    if denominator <= 0:
        return None
    return widths / denominator


def assert_case_key_parity(results_by_model: Mapping[str, Sequence[Mapping[str, Any]]]) -> dict[str, bool]:
    if len(results_by_model) < 2:
        raise AssertionError("case parity requires at least two models")
    key_sets: dict[str, set[tuple[Any, ...]]] = {}
    aggregate_unique = True
    components_reconcile = True
    for model_id, rows in results_by_model.items():
        if not rows:
            raise AssertionError(f"case parity cannot use an empty case set: {model_id}")
        keys = [aggregate_case_key(row) for row in rows]
        aggregate_unique = aggregate_unique and len(keys) == len(set(keys))
        key_sets[model_id] = set(keys)
        for row in rows:
            point = row.get("point_forecast")
            if point is None:
                continue
            component_sum = sum(finite_number(item.get("point_forecast")) for item in row.get("channel_components", []))
            components_reconcile = components_reconcile and math.isclose(
                finite_number(point), component_sum, rel_tol=1e-8, abs_tol=1e-6
            )
    sets = list(key_sets.values())
    equal = all(item == sets[0] for item in sets[1:]) if sets else True
    if not aggregate_unique or not equal or not components_reconcile:
        raise AssertionError(
            f"case parity failed: unique={aggregate_unique}, equal={equal}, reconcile={components_reconcile}"
        )
    return {
        "aggregateKeysUnique": aggregate_unique,
        "keySetsEqual": equal,
        "channelComponentsReconcile": components_reconcile,
    }


def cluster_bootstrap_units(cases: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    works = sorted({unicodedata.normalize("NFC", str(row["standard_work_id"])) for row in cases})
    origins = sorted({str(row["origin"]) for row in cases})
    memberships: dict[str, list[int]] = defaultdict(list)
    for index, row in enumerate(cases):
        work_id = unicodedata.normalize("NFC", str(row["standard_work_id"]))
        memberships[f"{work_id}|{row['origin']}"] .append(index)
    return {
        "workIds": works,
        "origins": origins,
        "workOriginBlocks": dict(memberships),
        "iidCaseSampling": False,
    }


def iter_paired_two_way_bootstrap_weights(
    cases: Sequence[Mapping[str, Any]], replicates: int, seed: int
) -> Iterable[list[int]]:
    units = cluster_bootstrap_units(cases)
    works, origins = units["workIds"], units["origins"]
    if not works or not origins:
        raise ValueError("bootstrap population has no work or origin clusters")
    try:
        import numpy as np  # type: ignore
    except ImportError as exc:  # pragma: no cover - exercised by dependency preflight
        raise RuntimeError("NumPy is required for the frozen PCG64 bootstrap") from exc
    rng = np.random.Generator(np.random.PCG64(int(seed)))
    for _ in range(replicates):
        work_draw = rng.integers(0, len(works), size=len(works))
        origin_draw = rng.integers(0, len(origins), size=len(origins))
        work_counts = Counter(works[int(index)] for index in work_draw)
        origin_counts = Counter(origins[int(index)] for index in origin_draw)
        weights = [
            int(
                work_counts[unicodedata.normalize("NFC", str(row["standard_work_id"]))]
                * origin_counts[str(row["origin"])]
            )
            for row in cases
        ]
        if not any(weights):
            raise ValueError("two-way bootstrap produced an empty work-origin draw")
        yield weights


def paired_two_way_bootstrap_weights(
    cases: Sequence[Mapping[str, Any]], replicates: int, seed: int
) -> list[list[int]]:
    """Materialized compatibility wrapper for small synthetic contract tests."""

    return list(iter_paired_two_way_bootstrap_weights(cases, replicates, seed))


def validate_spec(spec: Mapping[str, Any]) -> None:
    if spec.get("schema") != "m2.calibration_spec.v1":
        raise AssertionError("unexpected spec schema")
    if spec.get("decisionStatus") != "not_for_formal_decision":
        raise AssertionError("calibration spec cannot authorize a formal decision")
    if int(spec.get("preHoldoutRevision", 0)) != 5:
        raise AssertionError("calibration kernel requires frozen pre-holdout revision 5")
    if not spec["freeze"]["frozenBeforeFinalHoldout"]:
        raise AssertionError("spec is not frozen before holdout")
    if spec["publicOutput"]["internalPredictionInterval"]["externalOutputAllowed"]:
        raise AssertionError("prediction interval cannot be public")
    if spec["bootstrap"]["caseIidSamplingAllowed"]:
        raise AssertionError("iid case sampling is prohibited")
    if spec["bootstrap"]["rng"] != "numpy.random.Generator(numpy.random.PCG64(seed))":
        raise AssertionError("bootstrap RNG is not the frozen PCG64 generator")
    if spec["freeze"]["finalHoldout"]["baselineOnlyRunnerMayOpen"]:
        raise AssertionError("a baseline-only runner cannot open final holdout")
    if spec["gates"]["selectionUsesFinalHoldout"]:
        raise AssertionError("final holdout cannot select a candidate")
    if spec["gates"]["importantStrata"]["postHocAxesMayFailAcceptance"]:
        raise AssertionError("post-hoc strata cannot fail acceptance")
    for horizon_text, split in spec["origins"]["coreByHorizon"].items():
        horizon = int(horizon_text)
        if len(split["finalHoldout"]) != spec["freeze"]["finalHoldout"]["originCount"]:
            raise AssertionError(f"holdout count mismatch for horizon {horizon}")
        roles = [set(split[name]) for name in ("development", "embargoShadow", "finalHoldout")]
        if any(left & right for index, left in enumerate(roles) for right in roles[index + 1 :]):
            raise AssertionError(f"origin role overlap for horizon {horizon}")
        for origin in split["development"]:
            if add_months(origin, horizon) > spec["origins"]["crossHorizonPurge"]["developmentTargetEndOnOrBefore"]:
                raise AssertionError(f"unpurged development target for horizon {horizon}: {origin}")
    forward = spec["origins"]["forwardValidation"]
    if forward["method"] != "expanding_origin_target_available":
        raise AssertionError("forward validation method changed")
    score_origins = list(forward["scoreOrigins"])
    warmup_origins = list(forward["warmupOrigins"])
    if warmup_origins != sorted(set(warmup_origins)) or score_origins != sorted(set(score_origins)):
        raise AssertionError("forward origins must be unique and ascending")
    if set(warmup_origins) & set(score_origins):
        raise AssertionError("warmup and score origins overlap")
    if [row["scoreOrigin"] for row in forward["folds"]] != score_origins:
        raise AssertionError("forward fold origins changed")
    for fold in forward["folds"]:
        score_origin = fold["scoreOrigin"]
        expected_test_horizons = sorted(
            int(horizon)
            for horizon, split in spec["origins"]["coreByHorizon"].items()
            if score_origin in split["development"]
        )
        if list(fold["testHorizons"]) != expected_test_horizons:
            raise AssertionError(f"forward score horizons changed: {score_origin}")
        block_count = sum(
            1
            for horizon_text, split in spec["origins"]["coreByHorizon"].items()
            for origin in split["development"]
            if origin < score_origin and add_months(origin, int(horizon_text)) <= score_origin
        )
        if block_count != int(fold["expectedTrainOriginHorizonBlockCount"]):
            raise AssertionError(f"forward training blocks changed: {score_origin}")

    warmup = forward["warmupIntervalCalibration"]
    earliest_score = str(warmup["earliestRequiredScoreOrigin"])
    if earliest_score != score_origins[0]:
        raise AssertionError("interval warmup does not start at the first score origin")
    expected_warmup_blocks = {
        origin: [
            int(horizon_text)
            for horizon_text, split in spec["origins"]["coreByHorizon"].items()
            if origin in split["development"]
            and add_months(origin, int(horizon_text)) <= earliest_score
        ]
        for origin in warmup_origins
    }
    if expected_warmup_blocks != warmup["expectedAvailableOriginHorizonBlocksAtEarliestRequiredScoreOrigin"]:
        raise AssertionError("interval warmup origin-horizon blocks changed")
    if sum(len(values) for values in expected_warmup_blocks.values()) != int(
        warmup["expectedAvailableOriginHorizonBlockCountAtEarliestRequiredScoreOrigin"]
    ):
        raise AssertionError("interval warmup block count changed")
    if not warmup["predictionMustBeMaterializedBeforeTruthJoin"]:
        raise AssertionError("interval warmup predictions must be locked before truth join")
    if warmup["mayFitPointModelOrChooseHyperparameter"] or warmup["maySelectOrScoreComparator"]:
        raise AssertionError("interval warmup cannot fit point models or select comparators")
    required_population = spec["internalInterval"]["requiredPopulation"]
    if (
        required_population["firstRequiredScoreOrigin"] != earliest_score
        or required_population["burnInScoreOrigins"]
        or required_population["burnInExclusionAllowed"]
        or required_population["completeCaseFilteringAllowed"]
    ):
        raise AssertionError("interval required population permits an unfrozen exclusion")
    warmup_values = spec["freeze"]["fittedParametersArtifact"]["requiredFitFieldValues"]
    if warmup_values != {
        "intervalWarmupPredictionLockedBeforeTruthJoin": True,
        "intervalWarmupUsesOutcomeLabelsForPrediction": False,
    }:
        raise AssertionError("fitted warmup lock values changed")
    rights_contract = spec["publicOutput"]["forecastHorizon"]["servingRightsSnapshotContract"]
    if rights_contract["callerSuppliedServingHorizonAllowed"]:
        raise AssertionError("serving callers cannot supply their own rights horizon")
    if not rights_contract["validateAllSnapshotFieldsBeforeSelection"]:
        raise AssertionError("rights snapshots must be fully validated before selection")
    if rights_contract["historicalBacktestMayUseCurrentRightsSnapshot"]:
        raise AssertionError("historical backtests cannot use a current rights snapshot as a feature")


def holdout_origin_isolation(spec: Mapping[str, Any]) -> bool:
    try:
        expected_count = int(spec["freeze"]["finalHoldout"]["originCount"])
        purge_end = str(spec["origins"]["crossHorizonPurge"]["developmentTargetEndOnOrBefore"])
        for horizon_text, split in spec["origins"]["coreByHorizon"].items():
            horizon = int(horizon_text)
            eligible = list(split["eligible"])
            holdout = list(split["finalHoldout"])
            roles = [set(split[name]) for name in ("development", "embargoShadow", "finalHoldout")]
            if len(holdout) != expected_count or holdout != eligible[-expected_count:]:
                return False
            if any(left & right for index, left in enumerate(roles) for right in roles[index + 1 :]):
                return False
            if set().union(*roles) != set(eligible):
                return False
            if any(add_months(origin, horizon) > purge_end for origin in split["development"]):
                return False
        return True
    except (KeyError, TypeError, ValueError):
        return False


def _synthetic_work() -> dict[str, Any]:
    months = month_range("2017-06", "2024-12")
    sales = {}
    second = {}
    for index, month in enumerate(months):
        sales[month] = 0.0 if index < 12 else round(90 + (index % 12) * 4 + (index % 5) * 1.25, 2)
        second[month] = 0.0 if index % 4 else round(25 + index * 0.4, 2)
    sales["2021-01"] = 5000.0
    return {
        "standard_work_id": "SYNTH-001",
        "current_shelf_status": "not_a_feature",
        "current_rights_status": "not_a_feature",
        "channels": [
            {
                "channel_key": "sales-a",
                "business_form": "audio_product",
                "first_observed_month": "2017-06",
                "monthly": sales,
                "batch_cluster_sizes": {},
            },
            {
                "channel_key": "sales-b",
                "business_form": "audio_product",
                "first_observed_month": "2017-06",
                "monthly": second,
                "batch_cluster_sizes": {},
            },
        ],
    }


def contract_self_test() -> dict[str, Any]:
    spec = load_spec()
    validate_spec(spec)
    work = _synthetic_work()
    origin, horizon = "2022-12", 6

    def synthetic_predict(
        candidate: Mapping[str, Any], prediction_horizon: int, model_id: str
    ) -> dict[str, Any]:
        return predict_as_of(
            candidate,
            origin,
            prediction_horizon,
            model_id,
            spec,
            b0b_parameter_role=(
                "prefit_development_template" if model_id == "B0b" else None
            ),
        )

    original = predict_as_of(work, origin, horizon, "B1", spec)

    perturbed = copy.deepcopy(work)
    for channel in perturbed["channels"]:
        for month in list(channel["monthly"]):
            if month > origin:
                channel["monthly"][month] = channel["monthly"][month] * 91.0 + 7777.0
    perturbed["current_shelf_status"] = "changed_but_post_hoc_only"
    perturbed["current_rights_status"] = "changed_but_post_hoc_only"
    perturbed["channels"][0]["confirmed_spike_type"] = "true_anomaly"
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
    changed = predict_as_of(perturbed, origin, horizon, "B1", spec)
    compared_fields = [
        "case_key",
        "confidence",
        "eligibility",
        "features",
        "limitation",
        "point_forecast",
        "route",
        "spike_candidates",
    ]
    full_prediction_fields = compared_fields + [
        "annual_breakdown",
        "channel_components",
        "public_output",
    ]
    future_invariant = True
    for invariant_model in ("B0b", "B1", "B2", "B3"):
        before = synthetic_predict(work, horizon, invariant_model)
        after = synthetic_predict(perturbed, horizon, invariant_model)
        future_invariant = future_invariant and all(
            before[field] == after[field] for field in full_prediction_fields
        )

    second_work = copy.deepcopy(work)
    second_work["standard_work_id"] = "SYNTH-002"
    results_by_model = {
        model_id: [
            synthetic_predict(candidate, horizon, model_id)
            for candidate in (work, second_work)
        ]
        for model_id in ("B0b", "B1", "B2", "B3")
    }
    parity = assert_case_key_parity(results_by_model)
    bias_ok = (
        math.isclose(signed_aggregate_bias([120.0, 90.0], [100.0, 100.0]) or 0.0, 0.05)
        and math.isclose(signed_aggregate_bias([80.0, 90.0], [100.0, 100.0]) or 0.0, -0.15)
        and signed_aggregate_bias([1.0], [0.0]) is None
    )
    units = cluster_bootstrap_units(
        [
            {"standard_work_id": "A", "origin": "2020-06", "horizon": 3},
            {"standard_work_id": "A", "origin": "2020-06", "horizon": 6},
            {"standard_work_id": "B", "origin": "2020-12", "horizon": 3},
        ]
    )
    bootstrap_ok = (
        not units["iidCaseSampling"]
        and len(units["workIds"]) == 2
        and len(units["origins"]) == 2
        and len(units["workOriginBlocks"]["A|2020-06"]) == 2
    )
    bootstrap_cases = [
        {"standard_work_id": "A", "origin": "2020-06"},
        {"standard_work_id": "A", "origin": "2020-06"},
        {"standard_work_id": "A", "origin": "2020-12"},
        {"standard_work_id": "B", "origin": "2020-06"},
        {"standard_work_id": "B", "origin": "2020-12"},
    ]
    weights_one = paired_two_way_bootstrap_weights(bootstrap_cases, 20, 20260714)
    weights_two = paired_two_way_bootstrap_weights(bootstrap_cases, 20, 20260714)
    bootstrap_ok = bootstrap_ok and weights_one == weights_two and all(row[0] == row[1] for row in weights_one)

    negative_parity_ok = False
    try:
        duplicate = copy.deepcopy(results_by_model["B1"][0])
        assert_case_key_parity({"X": [duplicate, duplicate], "Y": [duplicate]})
    except AssertionError:
        negative_parity_ok = True

    b2_months = month_range("2021-01", "2022-12")
    b2_history = [float((index % 12) + 1) for index in range(len(b2_months))]
    b2_forecast, _ = _sales_monthly_forecast(
        b2_months, b2_history, "2022-12", 24, "B2", spec
    )
    b2_values = list(b2_forecast.values())
    b2_ok = b2_values == b2_history[-12:] + b2_history[-12:]

    buyout_monthly = {month: 0.0 for month in month_range("2020-01", "2022-12")}
    buyout_monthly["2020-01"] = 1200.0
    buyout_channel = {
        "channel_key": "buyout-a",
        "business_form": "audio_copyright",
        "first_observed_month": "2020-01",
        "monthly": buyout_monthly,
        "batch_cluster_sizes": {"2020-01": 3},
    }
    buyout_work = {"standard_work_id": "SYNTH-BUYOUT", "channels": [buyout_channel]}
    mixed_work = copy.deepcopy(work)
    mixed_work["standard_work_id"] = "SYNTH-MIXED"
    mixed_work["channels"].append(buyout_channel)
    buyout_prediction = predict_as_of(buyout_work, origin, horizon, "B1", spec)
    mixed_prediction = predict_as_of(mixed_work, origin, horizon, "B1", spec)
    routing_ok = (
        original["route"] == "pure_sales_share"
        and len(original["channel_components"]) == 2
        and buyout_prediction["route"] == "pure_buyout"
        and len(buyout_prediction["channel_components"]) == 1
        and mixed_prediction["route"] == "buyout_plus_sales"
        and len(mixed_prediction["channel_components"]) == 2
        and math.isclose(
            finite_number(mixed_prediction["point_forecast"]),
            finite_number(original["point_forecast"]),
            rel_tol=1e-10,
            abs_tol=1e-8,
        )
    )
    extrapolated = predict_as_of(work, origin, 36, "B1", spec)
    extrapolation_ok = "extrapolated" in extrapolated["limitation"]
    public_contract = set(original["public_output"]) == set(spec["publicOutput"]["allowedFields"])

    def nested_keys(value: Any) -> set[str]:
        if isinstance(value, Mapping):
            return {str(key) for key in value} | set().union(
                *(nested_keys(child) for child in value.values()), set()
            )
        if isinstance(value, list):
            return set().union(*(nested_keys(child) for child in value), set())
        return set()

    forbidden_absent = not (
        nested_keys(original["public_output"]) & set(spec["publicOutput"]["forbiddenFields"])
    )
    annual_reconciles = math.isclose(
        sum(finite_number(item["amount"]) for item in original["public_output"]["annualBreakdown"]),
        float(
            Decimal(str(finite_number(original["public_output"]["pointForecast"]))).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
        ),
        abs_tol=1e-9,
    )
    spike_only = all(not item["appliedDamping"] for item in original["spike_candidates"])
    current_only = copy.deepcopy(work)
    current_only["current_shelf_status"] = "changed_but_post_hoc_only"
    current_only["current_rights_status"] = "changed_but_post_hoc_only"
    current_only["current_source"] = "changed_but_post_hoc_only"
    current_changed = predict_as_of(current_only, origin, horizon, "B1", spec)
    status_post_hoc = all(original[field] == current_changed[field] for field in compared_fields)

    return {
        "fixtureSelfTest": True,
        "fixtureBoundary": {
            "databaseRead": False,
            "privateDataRead": False,
            "syntheticOnly": True,
        },
        "specDigest": spec_digest(spec),
        "evidence": {
            "futurePerturbation": {
                "comparedPredictionFields": compared_fields,
                "alsoComparedForEveryBaseline": [
                    "annual_breakdown",
                    "channel_components",
                    "public_output",
                ],
                "baselines": ["B0b", "B1", "B2", "B3"],
            },
            "caseKeyParity": parity,
        },
        "checks": {
            "specFrozenBeforeHoldout": True,
            "holdoutOriginIsolation": holdout_origin_isolation(spec),
            "futurePerturbationInvariant": future_invariant,
            "caseKeyParity": all(parity.values()) and negative_parity_ok,
            "signedBiasFormula": bias_ok,
            "clusterBootstrapUnit": bootstrap_ok,
            "publicOutputContract": public_contract and forbidden_absent and annual_reconciles,
            "spikeCandidateOnly": spike_only,
            "currentStatusPostHocOnly": status_post_hoc,
            "baselineDefinitions": b2_ok,
            "revenueRouting": routing_ok,
            "longHorizonLimitation": extrapolation_ok,
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contract-self-test", action="store_true")
    parser.add_argument("--print-spec-digest", action="store_true")
    args = parser.parse_args()
    if args.contract_self_test:
        result = contract_self_test()
        if not all(result["checks"].values()):
            raise SystemExit(json.dumps(result, ensure_ascii=False, indent=2))
        print(json.dumps(result, ensure_ascii=False, sort_keys=True))
        return 0
    if args.print_spec_digest:
        print(spec_digest(load_spec()))
        return 0
    parser.print_help()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
