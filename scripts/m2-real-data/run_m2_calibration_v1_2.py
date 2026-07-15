#!/usr/bin/env python3
"""Run M2 calibration v1.2 baseline identity correction and Gate A.

The default command is synthetic-only.  ``--run-baselines`` reads only the
authorized local cache plus the already verified, Git-ignored v1.1 case role.
It never constructs final-holdout, embargo, or deferred 60-month truth windows.
``--run-final-holdout`` exists solely to prove fail-closed behavior.
"""

from __future__ import annotations

import argparse
import copy
import contextlib
import hashlib
import inspect
import io
import json
import math
import os
import re
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

import m2_calibration_scoring_v1_1 as scoring
import m2_calibration_v1 as base
import m2_calibration_v1_2 as v12
import run_m2_calibration_baseline_replay as legacy
import run_m2_calibration_scoring_correction as correction


ROOT = Path(__file__).resolve().parents[2]
PUBLIC_DIR = ROOT / "docs" / "analysis" / "m2-real-data"
PRIVATE_V1_1_CASES = (
    ROOT
    / "data"
    / "private-output"
    / "m2-calibration-v1"
    / "M2-calibration-baseline-development-cases-private-v1.1.ndjson"
)
PRIVATE_V1_1_MANIFEST = (
    ROOT
    / "data"
    / "private-output"
    / "m2-calibration-v1"
    / "M2-calibration-baseline-development-manifest-private-v1.1.json"
)
PRIVATE_DIR = ROOT / "data" / "private-output" / "m2-calibration-v1-2"
PRIVATE_PHASE_A_CASES = PRIVATE_DIR / "M2-calibration-v1.2-baseline-cases-private.ndjson"
PRIVATE_PHASE_A_MANIFEST = PRIVATE_DIR / "M2-calibration-v1.2-baseline-manifest-private.json"
PRIVATE_GATE_A_RECEIPT = PRIVATE_DIR / "M2-calibration-gate-a-runtime-v1.json"

IDENTITY_JSON = PUBLIC_DIR / "M2-baseline-comparator-identity-correction-v1.json"
IDENTITY_MD = PUBLIC_DIR / "M2-baseline-comparator-identity-correction-v1.md"
POPULATION_JSON = PUBLIC_DIR / "M2-calibration-population-coverage-v1.json"
POPULATION_MD = PUBLIC_DIR / "M2-calibration-population-coverage-v1.md"
READY_JSON = PUBLIC_DIR / "M2-calibration-ready-for-modeling-v1.json"
READY_MD = PUBLIC_DIR / "M2-calibration-ready-for-modeling-v1.md"
FORMULA_MANIFEST = PUBLIC_DIR / "M2-v1.1-formula-difference-manifest-v1.json"
GATE_A_JSON = PUBLIC_DIR / "M2-calibration-gate-a-v1.json"
C1_DESIGN_JSON = PUBLIC_DIR / "M2-C1-transparent-ensemble-design-v1.json"
C1_DESIGN_MD = PUBLIC_DIR / "M2-C1-transparent-ensemble-design-v1.md"
PUBLIC_PHASE_A_PATHS = (
    FORMULA_MANIFEST,
    IDENTITY_JSON,
    IDENTITY_MD,
    POPULATION_JSON,
    POPULATION_MD,
    GATE_A_JSON,
    READY_JSON,
    READY_MD,
    C1_DESIGN_JSON,
    C1_DESIGN_MD,
)

BRANCH = "codex/m2-calibration-v1"
PHASE_A_START_HEAD = "be03db7bdec19b83139d85712bee43995d872679"
MODEL_IDS = v12.BASELINE_IDS
PUBLIC_MINIMUM = 10
SHA256 = re.compile(r"[0-9a-f]{64}")

PHASE_A_SOURCE_PATHS = (
    ROOT / "package.json",
    ROOT / "scripts" / "m2-real-data" / "m2_calibration_v1_2.py",
    ROOT / "scripts" / "m2-real-data" / "run_m2_calibration_v1_2.py",
    ROOT / "scripts" / "m2-real-data" / "run_m2_calibration_baseline_replay.py",
    ROOT
    / "scripts"
    / "m2-real-data"
    / "run_m2_calibration_scoring_correction.py",
    ROOT / "src" / "domain" / "oldProductEvaluation" / "calibrationSpec.v1.json",
    ROOT
    / "src"
    / "domain"
    / "oldProductEvaluation"
    / "calibrationSpec.v1.1.amendment.json",
    ROOT
    / "src"
    / "domain"
    / "oldProductEvaluation"
    / "calibrationSpec.v1.2.amendment.json",
    ROOT / "test" / "m2-calibration-v1-2-contract.test.js",
)


class ReplayV12Error(RuntimeError):
    """A v1.2 replay or Gate A boundary failed."""


def progress(message: str) -> None:
    print(f"[m2-calibration-v1.2] {message}", file=sys.stderr, flush=True)


def rounded(value: Any, places: int = 8) -> float | None:
    if value is None:
        return None
    number = float(value)
    return round(number, places) if math.isfinite(number) else None


def run_git(*args: str, check: bool = True) -> str:
    process = subprocess.run(
        ["git", *args],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if check and process.returncode != 0:
        raise ReplayV12Error(process.stderr.strip() or "git command failed")
    return process.stdout.strip()


def git_blob_bytes(commit: str, path: Path) -> bytes:
    relative = path.relative_to(ROOT).as_posix()
    process = subprocess.run(
        ["git", "show", f"{commit}:{relative}"],
        cwd=ROOT,
        capture_output=True,
        check=False,
    )
    if process.returncode != 0:
        raise ReplayV12Error(f"cannot resolve frozen source blob: {relative}@{commit}")
    return process.stdout


def git_ignored(path: Path) -> bool:
    process = subprocess.run(
        ["git", "check-ignore", "--quiet", "--", str(path)],
        cwd=ROOT,
        check=False,
    )
    return process.returncode == 0


def require_branch() -> None:
    if run_git("branch", "--show-current") != BRANCH:
        raise ReplayV12Error(f"v1.2 must run on {BRANCH}")


def require_private_boundaries() -> None:
    for path in (
        PRIVATE_V1_1_CASES,
        PRIVATE_V1_1_MANIFEST,
        PRIVATE_PHASE_A_CASES,
        PRIVATE_PHASE_A_MANIFEST,
        PRIVATE_GATE_A_RECEIPT,
    ):
        if not git_ignored(path):
            raise ReplayV12Error(f"private role is not Git-ignored: {path.name}")
        if run_git("ls-files", "--", str(path)):
            raise ReplayV12Error(f"private role is tracked: {path.name}")


def tracked_private_artifacts() -> list[str]:
    """Find every tracked path that could contain a private calibration artifact."""

    tracked = run_git("ls-files").splitlines()
    forbidden: list[str] = []
    for raw in tracked:
        path = raw.replace("\\", "/")
        lowered = path.lower()
        name = Path(path).name.lower()
        if (
            lowered.startswith("data/private")
            or "/private-output/" in lowered
            or name.endswith(".ipynb")
            or (
                "private" in name
                and name.endswith((".xlsx", ".xls", ".csv", ".ndjson"))
            )
            or (
                name.endswith(".json")
                and any(
                    token in name
                    for token in (
                        "cases-private",
                        "manifest-private",
                        "workbook-private",
                        "private-cases",
                        "private-manifest",
                    )
                )
            )
        ):
            forbidden.append(path)
    return sorted(forbidden)


def _payload_to_row(payload: Mapping[str, Any]) -> dict[str, Any]:
    key = payload.get("caseKey")
    if not isinstance(key, Mapping):
        raise ReplayV12Error("private case lacks caseKey")
    if set(key) != {"standard_work_id", "origin", "horizon_months", "route"}:
        raise ReplayV12Error("private case key differs from the frozen four-field schema")
    normalized_key = {
        "standard_work_id": key["standard_work_id"],
        "origin": key["origin"],
        "horizon_months": key["horizon_months"],
        "route": key["route"],
    }
    model = payload.get("modelId")
    if not isinstance(model, str):
        raise ReplayV12Error("private case modelId must be a native string")
    if model == "B0b":
        model = "B4"
    row = {
        "model_id": model,
        "case_key": normalized_key,
        "route": normalized_key["route"],
        "actual": payload.get("actual"),
        "target_end": payload.get("targetEnd"),
        "label_available_as_of": payload.get("labelAvailableAsOf"),
        "_bill_month_max": payload.get("billMonthMax"),
        "_available_as_of": payload.get("sourceAvailableAsOf"),
        "statisticallyScoreable": payload.get("statisticallyScoreable"),
        "scoreabilityReason": payload.get("scoreabilityReason"),
        "modelPredictionAvailable": payload.get("modelPredictionAvailable"),
        "businessServingEligible": payload.get("businessServingEligible"),
        "rawModelPrediction": payload.get("rawModelPrediction"),
        "servedPrediction": payload.get("servedPrediction"),
        "abstained": payload.get("abstained"),
        "abstentionReason": payload.get("abstentionReason"),
        "rawAnnualBreakdown": copy.deepcopy(payload.get("rawAnnualBreakdown", [])),
        "servedAnnualBreakdown": copy.deepcopy(
            payload.get("servedAnnualBreakdown", [])
        ),
        "confidence": payload.get("confidence") or "unavailable",
        "limitation": copy.deepcopy(payload.get("limitation", [])),
        "_residual_case_role": payload.get("predictionRole") or "",
    }
    if not isinstance(row["confidence"], str) or not isinstance(
        row["_residual_case_role"], str
    ):
        raise ReplayV12Error("private case confidence/role must be native strings")
    row["public_output"] = {
        "pointForecast": row["servedPrediction"],
        "annualBreakdown": copy.deepcopy(row["servedAnnualBreakdown"]),
        "confidence": row["confidence"],
        "limitation": copy.deepcopy(row["limitation"]),
    }
    v12.strict_case_key(row)
    return row


def load_verified_v1_1_rows() -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if not PRIVATE_V1_1_CASES.is_file() or not PRIVATE_V1_1_MANIFEST.is_file():
        raise ReplayV12Error(
            "verified v1.1 private case/manifest role is missing; rerun the authorized "
            "scoring-correction workflow before v1.2"
        )
    evidence = correction.verify_private_evidence_manifest(
        PRIVATE_V1_1_CASES, PRIVATE_V1_1_MANIFEST
    )
    rows: list[dict[str, Any]] = []
    with PRIVATE_V1_1_CASES.open("r", encoding="utf-8", newline="") as handle:
        for line in handle:
            if not line.endswith("\n"):
                raise ReplayV12Error("private case role is not canonical LF NDJSON")
            rows.append(_payload_to_row(json.loads(line)))
    if len(rows) != int(evidence["privateCaseRowCount"]):
        raise ReplayV12Error("private case count changed after verification")
    observed_models = {str(row["model_id"]) for row in rows}
    if not {"B1", "B2", "B3", "B4"}.issubset(observed_models):
        raise ReplayV12Error("private baseline role is incomplete")
    return rows, evidence


def assert_prior_rows_unsealed(
    rows: Sequence[Mapping[str, Any]], spec: Mapping[str, Any]
) -> dict[str, Any]:
    """Bind the inherited private evidence to development-only roles and pairs."""

    score_origins = {
        str(fold["scoreOrigin"])
        for fold in spec["origins"]["forwardValidation"]["folds"]
    }
    allowed_roles = {
        "development_warmup_interval_calibration",
        "development_fold_training_seed",
        "development_long_horizon_audit",
    } | {f"development_forward_score:{origin}" for origin in score_origins}
    sealed_pairs = {
        (str(origin), int(horizon))
        for horizon, split in spec["origins"]["coreByHorizon"].items()
        for boundary in ("finalHoldout", "embargoShadow")
        for origin in split[boundary]
    } | {
        (str(origin), 60)
        for origin in spec["origins"]["longAuditByHorizon"]["60"]
    }
    roles = Counter()
    for row in rows:
        role = row.get("_residual_case_role")
        if not isinstance(role, str) or role not in allowed_roles:
            raise ReplayV12Error("prior private case contains a non-development role")
        _work_id, origin, horizon, _route = v12.strict_case_key(row)
        if (origin, horizon) in sealed_pairs or horizon == 60:
            raise ReplayV12Error("prior private case intersects a sealed origin/horizon")
        roles[role.split(":", 1)[0]] += 1
    return {
        "priorManifestRoundTripVerified": True,
        "priorManifestFinalHoldoutFalseVerified": True,
        "priorCaseRowsChecked": len(rows),
        "allowedDevelopmentRoleSetExact": True,
        "sealedOriginHorizonIntersectionCount": 0,
        "deferred60MonthCaseCount": 0,
        "roleFamilies": sorted(roles),
    }


def _common_features(
    work: Mapping[str, Any], origin: str, spec: Mapping[str, Any]
) -> tuple[dict[str, Any], list[dict[str, Any]], str]:
    relaxed = copy.deepcopy(spec)
    relaxed["forecastability"]["rules"]["minimumObservedCalendarMonths"] = 0
    template = base.predict_as_of(work, origin, 1, "B1", relaxed)
    routing = base.route_work_as_of(work, origin, spec)
    _months, history = base._aggregate_route_history(  # pylint: disable=protected-access
        work, origin, routing, spec
    )
    baseline = next(item for item in spec["models"]["baselines"] if item["id"] == "B0b")
    lifecycle = base.lifecycle(
        history,
        baseline["lifecycleThresholds"],
        base.finite_number(
            baseline["structuralConstants"][
                "reboundPrevious3ToPrevious6MaximumExclusive"
            ],
            0.8,
        ),
    )
    features = copy.deepcopy(template.get("features", {}))
    features["lifecycle"] = lifecycle
    return features, copy.deepcopy(template.get("spike_candidates", [])), str(
        routing["route"]
    )


def attach_common_features(
    rows: Sequence[dict[str, Any]],
    works: Sequence[Mapping[str, Any]],
) -> None:
    spec = base.load_spec()
    work_lookup = {str(work["standard_work_id"]): work for work in works}
    cache: dict[tuple[str, str], tuple[dict[str, Any], list[dict[str, Any]], str]] = {}
    for row in rows:
        work_id, origin, _horizon, route = v12.strict_case_key(row)
        cache_key = (work_id, origin)
        if cache_key not in cache:
            cache[cache_key] = _common_features(work_lookup[work_id], origin, spec)
        features, spikes, observed_route = cache[cache_key]
        if observed_route != route:
            raise ReplayV12Error("recomputed as-of route differs from locked case key")
        row["features"] = copy.deepcopy(features)
        row["spike_candidates"] = copy.deepcopy(spikes)


def prediction_projection(row: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "model": row["model_id"],
        "key": list(v12.strict_case_key(row)),
        "scoreable": bool(row["statisticallyScoreable"]),
        "available": bool(row["modelPredictionAvailable"]),
        "serving": bool(row["businessServingEligible"]),
        "abstained": bool(row["abstained"]),
        "scoreabilityReason": row.get("scoreabilityReason"),
        "reason": row.get("abstentionReason"),
        "raw": None
        if row.get("rawModelPrediction") is None
        else base.fixed_decimal(row["rawModelPrediction"]),
        "served": None
        if row.get("servedPrediction") is None
        else base.fixed_decimal(row["servedPrediction"]),
        "pointForecast": row.get("point_forecast"),
        "route": row.get("route"),
        "identity": row.get("identity"),
        "eligibility": copy.deepcopy(row.get("eligibility", {})),
        "modelCapabilityEligibility": copy.deepcopy(
            row.get("modelCapabilityEligibility", {})
        ),
        "annualBreakdown": copy.deepcopy(row.get("annual_breakdown", [])),
        "rawAnnualBreakdown": copy.deepcopy(row.get("rawAnnualBreakdown", [])),
        "servedAnnualBreakdown": copy.deepcopy(row.get("servedAnnualBreakdown", [])),
        "confidence": row.get("confidence"),
        "limitation": copy.deepcopy(row.get("limitation", [])),
        "features": copy.deepcopy(row.get("features", {})),
        "spikeCandidates": copy.deepcopy(row.get("spike_candidates", [])),
        "channelComponents": copy.deepcopy(row.get("channel_components", [])),
        "publicOutput": copy.deepcopy(row.get("public_output", {})),
        "targetEnd": row.get("target_end"),
    }


def prediction_fingerprints_by_model(
    rows: Sequence[Mapping[str, Any]],
) -> dict[str, str]:
    """Hash the complete locked prediction state for every baseline model."""

    return {
        model: v12.canonical_digest(
            [
                prediction_projection(row)
                for row in sorted(
                    (item for item in rows if item.get("model_id") == model),
                    key=lambda item: (
                        str(item["_residual_case_role"]),
                        v12.strict_case_key(item),
                    ),
                )
            ]
        )
        for model in MODEL_IDS
    }


ALLOWED_TRUTH_ROLE_PREFIXES = {
    "development_point_fit",
    "development_fold_training_seed",
    "development_forward_score",
    "development_warmup_interval_calibration",
    "development_long_horizon_audit",
}
SEALED_TRUTH_ROLES = {
    "final_holdout",
    "embargo_shadow",
    "deferred_60_month",
}


def guarded_truth_builder(
    role: str,
    origin: str,
    horizon: int,
    builder: Any,
    spec: Mapping[str, Any],
) -> Any:
    """Reject every non-development truth role before invoking its builder."""

    prefix = str(role).split(":", 1)[0]
    horizon = int(horizon)
    sealed_pairs = {
        (str(block_origin), int(block_horizon))
        for block_horizon, split in spec["origins"]["coreByHorizon"].items()
        for key in ("finalHoldout", "embargoShadow")
        for block_origin in split[key]
    } | {
        (str(block_origin), 60)
        for block_origin in spec["origins"]["longAuditByHorizon"]["60"]
    }
    allowed_point_fit = {
        (str(block_origin), int(block_horizon))
        for block_horizon, split in spec["origins"]["coreByHorizon"].items()
        for block_origin in split["development"]
    }
    warmup_origins = set(spec["origins"]["forwardValidation"]["warmupOrigins"])
    allowed_warmup = {
        pair for pair in allowed_point_fit if pair[0] in warmup_origins
    }
    allowed_forward = {
        (str(fold["scoreOrigin"]), int(block_horizon))
        for fold in spec["origins"]["forwardValidation"]["folds"]
        for block_horizon in fold["testHorizons"]
    }
    purge = str(spec["origins"]["crossHorizonPurge"]["developmentTargetEndOnOrBefore"])
    allowed_36 = {
        (str(block_origin), 36)
        for block_origin in spec["origins"]["longAuditByHorizon"]["36"]
        if base.add_months(str(block_origin), 36) <= purge
    }
    pair = (str(origin), horizon)
    role_suffix = str(role).partition(":")[2]
    role_matches_pair = (
        (
            prefix == "development_point_fit"
            and pair in allowed_point_fit
        )
        or (
            prefix == "development_fold_training_seed"
            and pair in allowed_warmup
            and not role_suffix
        )
        or (
            prefix == "development_forward_score"
            and pair in allowed_forward
            and role_suffix == str(origin)
        )
        or (
            prefix == "development_warmup_interval_calibration"
            and pair in allowed_warmup
            and not role_suffix
        )
        or (
            prefix == "development_long_horizon_audit"
            and pair in allowed_36
            and not role_suffix
        )
    )
    if (
        pair in sealed_pairs
        or prefix in SEALED_TRUTH_ROLES
        or prefix not in ALLOWED_TRUTH_ROLE_PREFIXES
        or not role_matches_pair
    ):
        raise ReplayV12Error(f"truth role is sealed or unauthorized: {prefix}")
    return builder()


def build_faithful_b0b_rows(
    b4_rows: Sequence[Mapping[str, Any]],
    works: Sequence[Mapping[str, Any]],
    spec: Mapping[str, Any],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Predict without outcome fields, lock, then join the already verified truth."""

    raise ReplayV12Error(
        "retired alternate materializer; use materialize_all_baselines_v12 only"
    )

    work_lookup = {str(work["standard_work_id"]): work for work in works}
    contexts: dict[str, dict[str, Any]] = {}
    predictions: list[dict[str, Any]] = []
    truth_by_key: dict[tuple[str, str, str, int, str], Mapping[str, Any]] = {}
    for source in b4_rows:
        key = v12.strict_case_key(source)
        role_key = (str(source.get("_residual_case_role")), *key)
        if role_key in truth_by_key:
            raise ReplayV12Error("B4 source contains a duplicate role case key")
        truth_by_key[role_key] = source
        origin = key[1]
        if origin not in contexts:
            contexts[origin] = v12.build_b0b_context(works, origin, spec)
        prediction = v12.predict_as_of(
            work_lookup[key[0]],
            origin,
            key[2],
            "B0b",
            spec,
            b0b_context=contexts[origin],
            long_horizon_evidence=key[2] > 24,
        )
        raw = prediction.get("point_forecast")
        scoreable = source.get("statisticallyScoreable") is True
        business_eligible = source.get("businessServingEligible") is True
        if scoreable and raw is None:
            raise ReplayV12Error("faithful B0b lacks a raw prediction on a scoreable case")
        served = float(raw) if business_eligible and raw is not None else None
        annual = copy.deepcopy(prediction.get("annual_breakdown", []))
        served_annual = copy.deepcopy(annual) if served is not None else []
        row = {
            **prediction,
            "statisticallyScoreable": bool(source.get("statisticallyScoreable")),
            "scoreabilityReason": source.get("scoreabilityReason"),
            "modelPredictionAvailable": raw is not None,
            "businessServingEligible": business_eligible,
            "rawModelPrediction": raw,
            "servedPrediction": served,
            "abstained": served is None,
            "abstentionReason": source.get("abstentionReason") if served is None else None,
            "rawAnnualBreakdown": annual,
            "servedAnnualBreakdown": served_annual,
            "target_end": source.get("target_end"),
            "label_available_as_of": source.get("label_available_as_of"),
            "_bill_month_max": source.get("_bill_month_max"),
            "_available_as_of": source.get("_available_as_of"),
            "_residual_case_role": source.get("_residual_case_role"),
        }
        row["public_output"] = {
            "pointForecast": served,
            "annualBreakdown": served_annual,
            "confidence": row["confidence"],
            "limitation": copy.deepcopy(row["limitation"]),
        }
        predictions.append(row)

    lock_payload = [
        prediction_projection(row)
        for row in sorted(
            predictions, key=lambda item: (str(item["_residual_case_role"]), v12.strict_case_key(item))
        )
    ]
    lock = v12.canonical_digest(lock_payload)
    # Outcome values are copied only after the complete prediction projection is locked.
    joined: list[dict[str, Any]] = []
    for prediction in predictions:
        role = str(prediction.get("_residual_case_role"))
        key = v12.strict_case_key(prediction)
        source = guarded_truth_builder(
            role,
            key[1],
            key[2],
            lambda role=role, key=key: truth_by_key[(role, *key)],
            spec,
        )
        row = copy.deepcopy(prediction)
        row["actual"] = source.get("actual")
        joined.append(row)
    if v12.canonical_digest(
        [
            prediction_projection(row)
            for row in sorted(
                joined,
                key=lambda item: (
                    str(item["_residual_case_role"]),
                    v12.strict_case_key(item),
                ),
            )
        ]
    ) != lock:
        raise ReplayV12Error("faithful B0b prediction changed after truth join")
    return joined, {
        "predictionFingerprint": lock,
        "predictionLockedBeforeTruthJoin": True,
        "outcomeFieldsReadByPredictor": False,
        "contextCount": len(contexts),
        "contextFingerprints": {
            origin: context["fingerprint"] for origin, context in sorted(contexts.items())
        },
        "maximumIncomeMonthByContext": {
            origin: context["maximumIncomeMonthReadOrUsed"]
            for origin, context in sorted(contexts.items())
        },
    }


def _prior_template_index(
    rows: Sequence[Mapping[str, Any]], spec: Mapping[str, Any]
) -> dict[str, dict[str, dict[tuple[str, str, int, str], Mapping[str, Any]]]]:
    by_role: dict[
        str, dict[str, dict[tuple[str, str, int, str], Mapping[str, Any]]]
    ] = defaultdict(lambda: defaultdict(dict))
    for row in rows:
        role = str(row.get("_residual_case_role"))
        model = str(row.get("model_id"))
        key = v12.strict_case_key(row)
        if key in by_role[role][model]:
            raise ReplayV12Error("prior checkpoint has a duplicate role/model case key")
        by_role[role][model][key] = row

    warmup = "development_warmup_interval_calibration"
    seed = "development_fold_training_seed"
    long_role = "development_long_horizon_audit"
    expected_roles = {warmup, seed, long_role} | {
        f"development_forward_score:{fold['scoreOrigin']}"
        for fold in spec["origins"]["forwardValidation"]["folds"]
    }
    if set(by_role) != expected_roles:
        raise ReplayV12Error("prior checkpoint role set differs from the frozen replay")
    for role, models in by_role.items():
        expected_models = {"B4"} if role == seed else {"B1", "B2", "B3", "B4"}
        if set(models) != expected_models:
            raise ReplayV12Error("prior checkpoint model set differs for a frozen role")
        reference = next(iter(models.values()))
        if any(set(model_rows) != set(reference) for model_rows in models.values()):
            raise ReplayV12Error("prior checkpoint role has cross-model case-key drift")
        for key in reference:
            sources = [model_rows[key] for model_rows in models.values()]
            state = {
                (
                    source.get("statisticallyScoreable"),
                    source.get("scoreabilityReason"),
                    source.get("businessServingEligible"),
                    source.get("abstained"),
                    source.get("abstentionReason"),
                )
                for source in sources
            }
            truth = {
                (
                    base.fixed_decimal(source.get("actual")),
                    source.get("target_end"),
                    source.get("label_available_as_of"),
                    source.get("_bill_month_max"),
                    source.get("_available_as_of"),
                )
                for source in sources
            }
            if len(state) != 1 or len(truth) != 1:
                raise ReplayV12Error("prior checkpoint state/truth parity failed")
    return {
        role: {model: dict(values) for model, values in models.items()}
        for role, models in by_role.items()
    }


def _decorate_v12_prediction(
    prediction: Mapping[str, Any],
    source: Mapping[str, Any],
    role: str,
    model: str,
) -> dict[str, Any]:
    row = copy.deepcopy(dict(prediction))
    key = v12.strict_case_key(row)
    if key != v12.strict_case_key(source):
        raise ReplayV12Error("v1.2 prediction differs from the frozen template key")
    for field in ("statisticallyScoreable", "businessServingEligible"):
        if not isinstance(source.get(field), bool):
            raise ReplayV12Error(f"prior template {field} must be a native boolean")
    scoreable = source["statisticallyScoreable"]
    raw = row.get("point_forecast")
    raw_available = raw is not None
    if raw_available:
        try:
            raw_available = math.isfinite(float(raw))
        except (TypeError, ValueError):
            raw_available = False
    if scoreable and not raw_available:
        raise ReplayV12Error("v1.2 entry returned null raw on a scoreable case")
    raw_value = float(raw) if raw_available else None
    serving = source["businessServingEligible"]
    capability_eligibility = copy.deepcopy(row.get("eligibility", {}))
    served = raw_value if serving and raw_value is not None else None
    abstained = served is None
    reason = None
    if abstained:
        frozen_reason = source.get("abstentionReason")
        reason = (
            frozen_reason
            if isinstance(frozen_reason, str) and frozen_reason.strip()
            else "model_prediction_unavailable"
            if raw_value is None
            else "business_serving_ineligible"
        )
    annual = copy.deepcopy(row.get("annual_breakdown", [])) if raw_value is not None else []
    served_annual = copy.deepcopy(annual) if served is not None else []
    target_end = base.add_months(key[1], key[2])
    if source.get("target_end") != target_end:
        raise ReplayV12Error("prior target_end differs from origin plus horizon")
    row.update(
        {
            "model_id": model,
            "statisticallyScoreable": scoreable,
            "scoreabilityReason": source.get("scoreabilityReason"),
            "modelPredictionAvailable": raw_available,
            "businessServingEligible": serving,
            "modelCapabilityEligibility": capability_eligibility,
            "eligibility": {
                "eligible": serving,
                "status": (
                    "forecastable_numeric"
                    if serving
                    else str(
                        source.get("abstentionReason")
                        or "business_serving_ineligible"
                    )
                ),
                "source": "frozen_v1_1_amendment_cutoff_only_business_eligibility",
            },
            "rawModelPrediction": raw_value,
            "servedPrediction": served,
            "abstained": abstained,
            "abstentionReason": reason,
            "rawAnnualBreakdown": annual,
            "servedAnnualBreakdown": served_annual,
            "target_end": target_end,
            "_residual_case_role": role,
        }
    )
    row["public_output"] = {
        "pointForecast": served,
        "annualBreakdown": served_annual,
        "confidence": row.get("confidence", "unavailable"),
        "limitation": copy.deepcopy(row.get("limitation", [])),
    }
    v12.validate_case_state(row)
    if any(
        field in row
        for field in (
            "actual",
            "component_actuals",
            "_component_actual_by_channel",
            "label_available_as_of",
            "_bill_month_max",
            "_available_as_of",
        )
    ):
        raise ReplayV12Error("prediction block contains truth before its lock")
    return row


def _truth_from_authority(
    source: Mapping[str, Any],
    work: Mapping[str, Any],
    spec: Mapping[str, Any],
) -> dict[str, Any]:
    key = v12.strict_case_key(source)
    truth = base.build_truth_window(work, key[1], key[2], key[3], spec)
    if truth.get("target_end") != source.get("target_end"):
        raise ReplayV12Error("rebuilt truth target differs from the prior checkpoint")
    if base.fixed_decimal(truth.get("actual")) != base.fixed_decimal(
        source.get("actual")
    ):
        raise ReplayV12Error("rebuilt truth actual differs from the prior checkpoint")
    component_actuals: dict[str, float] = {}
    for component in truth.get("component_actuals", []):
        channel_key = str(component.get("channel_key", ""))
        if channel_key in component_actuals:
            raise ReplayV12Error("rebuilt truth has a duplicate component")
        if component.get("known_resolved_at_origin"):
            component_actuals[channel_key] = float(component["actual"])
    for field in ("label_available_as_of", "_bill_month_max", "_available_as_of"):
        if source.get(field) != truth["target_end"]:
            raise ReplayV12Error(
                f"prior truth metadata differs from independently derived target end: {field}"
            )
    return {
        **truth,
        "_component_actual_by_channel": component_actuals,
        "label_available_as_of": truth["target_end"],
        "_bill_month_max": truth["target_end"],
        "_available_as_of": truth["target_end"],
    }


def _lock_and_guarded_join_v12_block(
    predictions: Sequence[Mapping[str, Any]],
    sources: Mapping[str, Mapping[tuple[str, str, int, str], Mapping[str, Any]]],
    works: Mapping[str, Mapping[str, Any]],
    role: str,
    spec: Mapping[str, Any],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    ordered = sorted(
        predictions,
        key=lambda row: (str(row["model_id"]), v12.strict_case_key(row)),
    )
    projection = [prediction_projection(row) for row in ordered]
    lock = v12.canonical_digest(projection)
    unique_keys = sorted({v12.strict_case_key(row) for row in ordered})
    truth_by_key: dict[tuple[str, str, int, str], dict[str, Any]] = {}
    builder_calls = 0
    for key in unique_keys:
        candidates = [model_rows[key] for model_rows in sources.values() if key in model_rows]
        if not candidates:
            raise ReplayV12Error("prediction block lacks a truth template")

        def build(
            source: Mapping[str, Any] = candidates[0],
            work: Mapping[str, Any] = works[key[0]],
        ) -> dict[str, Any]:
            nonlocal builder_calls
            builder_calls += 1
            return _truth_from_authority(source, work, spec)

        truth_by_key[key] = guarded_truth_builder(
            role, key[1], key[2], build, spec
        )
    if builder_calls != len(unique_keys):
        raise ReplayV12Error("guarded truth builder did not run once per unique case")
    joined: list[dict[str, Any]] = []
    old_numeric_comparisons = 0
    for prediction in ordered:
        key = v12.strict_case_key(prediction)
        row = copy.deepcopy(dict(prediction))
        row.update(copy.deepcopy(truth_by_key[key]))
        joined.append(row)
        model = str(row["model_id"])
        if model in sources and key in sources[model]:
            old = sources[model][key].get("rawModelPrediction")
            new = row.get("rawModelPrediction")
            if old is not None:
                if new is None or base.fixed_decimal(old) != base.fixed_decimal(new):
                    raise ReplayV12Error(
                        "fresh v1.2 baseline point differs from audit checkpoint: "
                        f"model={model}, role={role}, origin={key[1]}, "
                        f"horizon={key[2]}, route={key[3]}, "
                        f"old={None if old is None else base.fixed_decimal(old)}, "
                        f"new={None if new is None else base.fixed_decimal(new)}"
                    )
                old_numeric_comparisons += 1
    if v12.canonical_digest(
        [prediction_projection(row) for row in joined]
    ) != lock:
        raise ReplayV12Error("prediction/state projection changed after guarded truth join")
    return joined, {
        "role": role,
        "predictionFingerprint": lock,
        "predictionRowCount": len(ordered),
        "uniqueTruthCaseCount": len(unique_keys),
        "guardedTruthBuilderCallCount": builder_calls,
        "predictionLockedBeforeTruthJoin": True,
        "outcomeFieldsAbsentAtLock": True,
        "postTruthPredictionProjectionMatchesLock": True,
        "oldNumericPredictionFieldsUsedForPrediction": False,
        "oldNumericAuditComparisonsAfterJoin": old_numeric_comparisons,
    }


def _b4_fit_view(rows: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for source in rows:
        if (
            source.get("model_id") != "B4"
            or source.get("statisticallyScoreable") is not True
        ):
            continue
        row = copy.deepcopy(dict(source))
        row["model_id"] = "B0b"
        row["point_forecast"] = row.get("rawModelPrediction")
        # The historical B4 factor artifact was fitted on its own model-capability
        # eligibility, not the independently frozen product-serving decision.
        # Keeping these states separate prevents the 294 short-history serving
        # cases from silently changing the committed supervised fit population.
        row["eligibility"] = copy.deepcopy(
            row.get("modelCapabilityEligibility", row.get("eligibility", {}))
        )
        output.append(row)
    return output


def _fit_b4_fold(
    training_truth: Sequence[Mapping[str, Any]],
    score_origin: str,
    spec: Mapping[str, Any],
) -> dict[str, Any]:
    fold = next(
        (
            item
            for item in spec["origins"]["forwardValidation"]["folds"]
            if str(item["scoreOrigin"]) == score_origin
        ),
        None,
    )
    if fold is None:
        raise ReplayV12Error("B4 fold is not frozen")
    available = [
        row
        for row in training_truth
        if legacy.fold_label_available(row, score_origin)
        and str(row.get("label_available_as_of")) <= score_origin
        and str(row.get("_bill_month_max")) <= score_origin
        and str(row.get("_available_as_of")) <= score_origin
    ]
    if not available:
        raise ReplayV12Error("B4 fold has no prior target-available truth")
    blocks = {
        (v12.strict_case_key(row)[1], v12.strict_case_key(row)[2])
        for row in available
    }
    if len(blocks) != int(fold["expectedTrainOriginHorizonBlockCount"]):
        raise ReplayV12Error("B4 fold training block count changed")
    fit = legacy.b0b_baseline(spec)["developmentFit"]
    factor_routes = set(fit["factorEligibleRoutes"])
    factor_rows = [
        row
        for row in legacy.numeric_b0b_fit_rows(available)
        if str(row["route"]) in factor_routes
    ]
    prior_origins = {v12.strict_case_key(row)[1] for row in factor_rows}
    if len(prior_origins) < int(
        spec["origins"]["forwardValidation"]["minimumPriorDistinctOriginDates"]
    ):
        raise ReplayV12Error("B4 fold has too few prior origins")
    fitted = legacy.fit_b0b_matrix(
        legacy.build_fit_matrix(factor_rows, fit["lifecycleOrder"]), spec
    )
    return {
        "factors": copy.deepcopy(fitted["factors"]),
        "passes": int(fitted["passes"]),
        "trainingCaseCount": len(factor_rows),
        "trainingOriginCount": len(prior_origins),
        "trainingBlockCount": len(blocks),
        "trainingMaximumTargetEnd": max(str(row["target_end"]) for row in available),
        "trainingMaximumLabelAvailableAsOf": max(
            str(row["label_available_as_of"]) for row in available
        ),
        "trainingMaximumBillMonth": max(
            str(row["_bill_month_max"]) for row in available
        ),
        "trainingMaximumSourceAvailableAsOf": max(
            str(row["_available_as_of"]) for row in available
        ),
    }


def materialize_all_baselines_v12(
    prior_rows: Sequence[Mapping[str, Any]],
    works: Sequence[Mapping[str, Any]],
    spec: Mapping[str, Any],
    input_evidence: Mapping[str, Any],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    templates = _prior_template_index(prior_rows, spec)
    work_lookup = {str(work["standard_work_id"]): work for work in works}
    b0b_contexts: dict[str, dict[str, Any]] = {}
    receipts: list[dict[str, Any]] = []

    def materialize(
        role: str,
        *,
        models: Sequence[str],
        b4_spec: Mapping[str, Any],
        b4_role: str,
    ) -> list[dict[str, Any]]:
        role_sources = templates[role]
        predictions: list[dict[str, Any]] = []
        for model in models:
            source_model = "B4" if model == "B0b" else model
            if source_model not in role_sources:
                raise ReplayV12Error("frozen role lacks a source template for a model")
            for key, source in sorted(role_sources[source_model].items()):
                kwargs: dict[str, Any] = {
                    "long_horizon_evidence": key[2] > 24,
                }
                prediction_spec = spec
                if model == "B0b":
                    if key[1] not in b0b_contexts:
                        b0b_contexts[key[1]] = v12.build_b0b_context(
                            works, key[1], spec
                        )
                    kwargs["b0b_context"] = b0b_contexts[key[1]]
                elif model == "B4":
                    prediction_spec = b4_spec
                    kwargs["b4_parameter_role"] = b4_role
                prediction = v12.predict_as_of(
                    work_lookup[key[0]],
                    key[1],
                    key[2],
                    model,
                    prediction_spec,
                    **kwargs,
                )
                predictions.append(
                    _decorate_v12_prediction(prediction, source, role, model)
                )
        joined, receipt = _lock_and_guarded_join_v12_block(
            predictions, role_sources, work_lookup, role, spec
        )
        receipts.append(receipt)
        return joined

    warmup_role = "development_warmup_interval_calibration"
    warmup = materialize(
        warmup_role,
        models=MODEL_IDS,
        b4_spec=spec,
        b4_role="interval_warmup_cold_start",
    )
    seed_role = "development_fold_training_seed"
    seed = materialize(
        seed_role,
        models=("B4",),
        b4_spec=spec,
        b4_role="prefit_development_template",
    )
    training_truth = _b4_fit_view(seed)
    forward: list[dict[str, Any]] = []
    fold_fits: dict[str, Any] = {}
    event_order: dict[str, list[str]] = {}
    for fold in spec["origins"]["forwardValidation"]["folds"]:
        origin = str(fold["scoreOrigin"])
        fitted = _fit_b4_fold(training_truth, origin, spec)
        fold_spec = copy.deepcopy(spec)
        baseline = next(
            item for item in fold_spec["models"]["baselines"] if item["id"] == "B0b"
        )
        baseline["lifecycleFactors"] = copy.deepcopy(fitted["factors"])
        baseline.pop("boundFittedParameterDigest", None)
        role = f"development_forward_score:{origin}"
        held = materialize(
            role,
            models=MODEL_IDS,
            b4_spec=fold_spec,
            b4_role="development_forward_fold",
        )
        if any(v12.strict_case_key(row)[1] != origin for row in held):
            raise ReplayV12Error("held fold escaped its score origin")
        forward.extend(held)
        training_truth.extend(_b4_fit_view(held))
        fold_fits[origin] = fitted
        event_order[origin] = [
            "prior_truth_fit_complete",
            "held_prediction_lock_created",
            "held_truth_join_complete",
        ]

    recomputed_fit = legacy.b0b_fit_evidence(training_truth, spec)
    if v12.canonical_digest(
        {origin: item["factors"] for origin, item in fold_fits.items()}
    ) != v12.canonical_digest(recomputed_fit["foldFactors"]):
        raise ReplayV12Error("sequential B4 fold factors differ from full recomputation")
    artifact, _artifact_path = legacy.load_and_validate_fitted_artifact(spec)
    if v12.canonical_digest(recomputed_fit["fullFit"]["factors"]) != v12.canonical_digest(
        artifact["B0b"]["lifecycleFactors"]
    ):
        raise ReplayV12Error("recomputed B4 full factors differ from the committed artifact")
    if artifact["fit"]["authoritativeInputSignatureSha256"] != input_evidence["inputFingerprint"]:
        raise ReplayV12Error("committed B4 artifact has a different authority fingerprint")
    numeric_fit_rows = legacy.numeric_b0b_fit_rows(training_truth)
    observed_fit_fingerprint = legacy.development_case_fingerprint(numeric_fit_rows)
    expected_fit_fingerprint = str(artifact["fit"]["fitCaseFingerprint"])
    if observed_fit_fingerprint != expected_fit_fingerprint:
        raise ReplayV12Error(
            "B4 committed fit case population differs: "
            f"observedCount={len(numeric_fit_rows)}, "
            f"expectedCount={artifact['fit']['fitCaseCount']}, "
            f"recomputedFactorFitCount={recomputed_fit['fitCaseCount']}, "
            f"observedFingerprint={observed_fit_fingerprint}, "
            f"expectedFingerprint={expected_fit_fingerprint}"
        )

    long_role = "development_long_horizon_audit"
    long_rows = materialize(
        long_role,
        models=MODEL_IDS,
        b4_spec=artifact["_boundSpec"],
        b4_role="committed_development_fit",
    )
    if any(v12.strict_case_key(row)[2] != 36 for row in long_rows):
        raise ReplayV12Error("long audit contains a non-36-month case")
    if any("extrapolated" not in row.get("limitation", []) for row in long_rows):
        raise ReplayV12Error("long audit prediction lacks extrapolated limitation")

    combined = [*warmup, *seed, *forward, *long_rows]
    fingerprints = prediction_fingerprints_by_model(combined)
    return combined, {
        "allBaselinePredictionsMaterializedThroughV12Entry": True,
        "oldNumericPredictionFieldsUsed": False,
        "predictionLockedBeforeTruthJoin": True,
        "guardedTruthRebuiltFromAuthorizedWorks": True,
        "priorCheckpointUsedOnlyForCaseStateTruthParity": True,
        "predictionFingerprintsByModel": fingerprints,
        "roleReceipts": receipts,
        "foldFits": fold_fits,
        "eventOrderByScoreOrigin": event_order,
        "B4SequentialFactorsMatchFullRecomputation": True,
        "B4FullFactorsMatchCommittedArtifact": True,
        "committedArtifactCaseFingerprintVerified": True,
        "contextFingerprints": {
            origin: context["fingerprint"]
            for origin, context in sorted(b0b_contexts.items())
        },
    }


def forward_rows(rows: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    return [
        copy.deepcopy(dict(row))
        for row in rows
        if str(row.get("_residual_case_role", "")).startswith(
            "development_forward_score:"
        )
    ]


def expected_forward_keys(
    works: Sequence[Mapping[str, Any]], spec: Mapping[str, Any]
) -> set[tuple[str, str, int, str]]:
    expected: set[tuple[str, str, int, str]] = set()
    for fold in spec["origins"]["forwardValidation"]["folds"]:
        origin = str(fold["scoreOrigin"])
        for work in works:
            if not base.work_exists_as_of(work, origin):
                continue
            route = str(base.route_work_as_of(work, origin, spec)["route"])
            for horizon in fold["testHorizons"]:
                key = (
                    str(work["standard_work_id"]),
                    origin,
                    int(horizon),
                    route,
                )
                if key in expected:
                    raise ReplayV12Error("independent expected case universe is not unique")
                expected.add(key)
    return expected


def verify_case_and_state_parity(
    rows: Sequence[Mapping[str, Any]],
    works: Sequence[Mapping[str, Any]],
    spec: Mapping[str, Any],
) -> dict[str, Any]:
    by_model = {
        model: [row for row in rows if row.get("model_id") == model]
        for model in MODEL_IDS
    }
    expected = expected_forward_keys(works, spec)
    key_sets = {
        model: {v12.strict_case_key(row) for row in model_rows}
        for model, model_rows in by_model.items()
    }
    exact = {
        model: keys == expected and len(keys) == len(by_model[model])
        for model, keys in key_sets.items()
    }
    if not all(exact.values()):
        raise ReplayV12Error("a baseline differs from the independent expected case universe")
    scoreable_sets = {
        model: {
            v12.strict_case_key(row)
            for row in model_rows
            if row.get("statisticallyScoreable") is True
        }
        for model, model_rows in by_model.items()
    }
    serving_sets = {
        model: {
            v12.strict_case_key(row)
            for row in model_rows
            if row.get("businessServingEligible") is True
        }
        for model, model_rows in by_model.items()
    }
    first = MODEL_IDS[0]
    if any(scoreable_sets[model] != scoreable_sets[first] for model in MODEL_IDS):
        raise ReplayV12Error("scoreable key parity failed")
    if any(serving_sets[model] != serving_sets[first] for model in MODEL_IDS):
        raise ReplayV12Error("business-serving key parity failed")
    actual_by_key: dict[tuple[str, str, int, str], str] = {}
    state_by_key: dict[tuple[str, str, int, str], tuple[Any, ...]] = {}
    label_metadata_by_key: dict[tuple[str, str, int, str], tuple[Any, ...]] = {}
    raw_complete = True
    served_null_correct = True
    availability_correct = True
    abstention_correct = True
    abstention_reason_correct = True
    for model in MODEL_IDS:
        for row in by_model[model]:
            key = v12.strict_case_key(row)
            try:
                v12.validate_case_state(row)
            except v12.CalibrationV12Error as exc:
                raise ReplayV12Error(str(exc)) from exc
            for field in (
                "statisticallyScoreable",
                "modelPredictionAvailable",
                "businessServingEligible",
                "abstained",
            ):
                if not isinstance(row.get(field), bool):
                    raise ReplayV12Error(f"case state field is not boolean: {field}")
            actual = base.fixed_decimal(row["actual"])
            if key in actual_by_key and actual_by_key[key] != actual:
                raise ReplayV12Error("actual value differs across paired baselines")
            actual_by_key[key] = actual
            target_end = row.get("target_end")
            label_available = row.get("label_available_as_of")
            expected_target_end = base.add_months(key[1], key[2])
            if target_end != expected_target_end:
                raise ReplayV12Error("case target_end differs from frozen horizon semantics")
            if not isinstance(label_available, str) or label_available < target_end:
                raise ReplayV12Error("case label availability precedes its target window")
            bill_max = row.get("_bill_month_max")
            available_as_of = row.get("_available_as_of")
            label_metadata = (
                target_end,
                label_available,
                bill_max,
                available_as_of,
            )
            if key in label_metadata_by_key and label_metadata_by_key[key] != label_metadata:
                raise ReplayV12Error("case target/availability metadata differs across baselines")
            label_metadata_by_key[key] = label_metadata
            state = (
                row["statisticallyScoreable"],
                row.get("scoreabilityReason"),
                row["businessServingEligible"],
                row["abstained"],
                row.get("abstentionReason"),
            )
            if key in state_by_key and state_by_key[key] != state:
                raise ReplayV12Error("case state differs across paired baselines")
            state_by_key[key] = state
            scoreability_reason = row.get("scoreabilityReason")
            if row["statisticallyScoreable"]:
                if scoreability_reason is not None:
                    raise ReplayV12Error("scoreable case has a scoreability failure reason")
            elif not isinstance(scoreability_reason, str) or not scoreability_reason.strip():
                raise ReplayV12Error("unscoreable case lacks a scoreability reason")
            raw = row.get("rawModelPrediction")
            raw_available = raw is not None
            if raw_available:
                try:
                    raw_available = math.isfinite(float(raw))
                except (TypeError, ValueError):
                    raw_available = False
            if bool(row.get("modelPredictionAvailable")) != raw_available:
                availability_correct = False
            if row["statisticallyScoreable"] and not raw_available:
                raw_complete = False
            expected_served = (
                raw
                if row.get("businessServingEligible")
                and raw_available
                else None
            )
            if (
                expected_served is None
                and row.get("servedPrediction") is not None
            ) or (
                expected_served is not None
                and base.fixed_decimal(expected_served)
                != base.fixed_decimal(row.get("servedPrediction"))
            ):
                served_null_correct = False
            expected_abstained = row.get("servedPrediction") is None
            if bool(row.get("abstained")) != expected_abstained:
                abstention_correct = False
            reason = row.get("abstentionReason")
            if expected_abstained:
                if not isinstance(reason, str) or not reason.strip():
                    abstention_reason_correct = False
            elif reason is not None:
                abstention_reason_correct = False
    if not all(
        (
            raw_complete,
            served_null_correct,
            availability_correct,
            abstention_correct,
            abstention_reason_correct,
        )
    ):
        raise ReplayV12Error("raw/served/availability/abstention truth table failed")
    return {
        "expectedCaseCountPerModel": len(expected),
        "scoreableCaseCountPerModel": len(scoreable_sets[first]),
        "expectedUniverseFingerprint": v12.canonical_digest(
            [list(key) for key in sorted(expected)]
        ),
        "scoreableUniverseFingerprint": v12.canonical_digest(
            [list(key) for key in sorted(scoreable_sets[first])]
        ),
        "actualFingerprint": v12.canonical_digest(
            [
                {"key": list(key), "actual": actual_by_key[key]}
                for key in sorted(actual_by_key)
            ]
        ),
        "targetAvailabilityFingerprint": v12.canonical_digest(
            [
                {
                    "key": list(key),
                    "targetEnd": label_metadata_by_key[key][0],
                    "labelAvailableAsOf": label_metadata_by_key[key][1],
                    "truthWindowBillMonthMaximum": label_metadata_by_key[key][2],
                    "truthSourceAvailableAsOf": label_metadata_by_key[key][3],
                }
                for key in sorted(label_metadata_by_key)
            ]
        ),
        "eachModelEqualsIndependentExpectedUniverse": exact,
        "caseKeysIdentical": True,
        "scoreableKeysIdentical": True,
        "businessServingKeysIdentical": True,
        "actualValuesIdentical": True,
        "targetAndAvailabilityMetadataIdentical": True,
        "targetEndMatchesOriginPlusHorizon": True,
        "caseStateTruthTableValidated": True,
        "nativeStateTypesVerified": True,
        "scoreabilityReasonReconciled": True,
        "rawPredictionCompleteOnAllScoreable": raw_complete,
        "modelPredictionAvailableIffRawFinite": availability_correct,
        "servedPredictionMatchesEligibilityAndRaw": served_null_correct,
        "servedPredictionNullWhenAbstained": served_null_correct,
        "abstainedIffServedPredictionNull": abstention_correct,
        "abstentionReasonPresentIffAbstained": abstention_reason_correct,
        "zeroImputationUsed": False,
        "intersectionDropUsed": False,
    }


def attach_strata(
    rows: Sequence[dict[str, Any]],
    works: Sequence[Mapping[str, Any]],
    posthoc: Mapping[str, Mapping[str, str]],
) -> None:
    legacy.attach_strata(rows, works, posthoc)
    for row in rows:
        strata = row["strata"]
        lifecycle = str(row.get("features", {}).get("lifecycle", "unknown"))
        strata["lifecycle"] = lifecycle
        strata["dense"] = not any(
            bool(strata.get(name)) for name in ("dormant", "sparse_income", "long_tail")
        )


def interval_metrics(rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    required = [row for row in rows if row.get("statisticallyScoreable") is True]
    available = [
        row
        for row in required
        if bool((row.get("_internal_interval") or {}).get("available"))
    ]
    complete = len(required) == len(available)
    if not complete or not available:
        return {
            "requiredCaseCount": len(required),
            "availableCaseCount": len(available),
            "completeOnAllScoreablePopulation": False,
            "internal80Coverage": None,
            "meanWis": None,
            "standardizedWidth": None,
            "endpointsPresentInPublicReport": False,
        }
    lowers = [float(row["_internal_interval"]["lower"]) for row in available]
    uppers = [float(row["_internal_interval"]["upper"]) for row in available]
    actuals = [float(row["actual"]) for row in available]
    return {
        "requiredCaseCount": len(required),
        "availableCaseCount": len(available),
        "completeOnAllScoreablePopulation": True,
        "internal80Coverage": sum(
            bool(row["_internal_interval"]["covered"]) for row in available
        )
        / len(available),
        "meanWis": sum(float(row["_internal_interval"]["wis"]) for row in available)
        / len(available),
        "standardizedWidth": base.standardized_interval_width(lowers, uppers, actuals),
        "endpointsPresentInPublicReport": False,
    }


def _metric_or_none(
    rows: Sequence[Mapping[str, Any]], field: str
) -> dict[str, Any] | None:
    return v12.metric_rows(rows, field) if rows else None


def metrics_for_model(rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    scoreable = [row for row in rows if row.get("statisticallyScoreable") is True]
    served = [row for row in scoreable if row.get("servedPrediction") is not None]
    high = [row for row in scoreable if bool(row.get("strata", {}).get("high_value"))]
    high_served = [row for row in served if bool(row.get("strata", {}).get("high_value"))]
    horizons = {
        str(horizon): v12.metric_rows(
            [row for row in scoreable if v12.strict_case_key(row)[2] == horizon],
            "rawModelPrediction",
        )
        for horizon in v12.CORE_HORIZONS
    }
    top_bands = {
        f"top{percent}": v12.metric_rows(
            [
                row
                for row in scoreable
                if bool(row.get("strata", {}).get(f"top_{percent}_percent"))
            ],
            "rawModelPrediction",
        )
        for percent in (1, 5, 10)
    }
    by_origin = {
        origin: v12.metric_rows(
            [row for row in scoreable if v12.strict_case_key(row)[1] == origin],
            "rawModelPrediction",
        )
        for origin in sorted({v12.strict_case_key(row)[1] for row in scoreable})
    }
    axes = {
        "sourcePostHoc": "source",
        "revenueModel": "revenue_model",
        "lifecycle": "lifecycle",
        "dense": "dense",
        "sparseIncome": "sparse_income",
        "dormant": "dormant",
        "longTail": "long_tail",
        "shelfRightsPostHoc": "shelf_rights",
    }
    slices: dict[str, dict[str, Any]] = {}
    for public_name, field in axes.items():
        values = sorted({str(row.get("strata", {}).get(field)) for row in scoreable})
        cells: dict[str, Any] = {}
        groups = {
            value: [
                row
                for row in scoreable
                if str(row.get("strata", {}).get(field)) == value
            ]
            for value in values
        }
        primary_small = {
            value
            for value, group in groups.items()
            if len(group) < PUBLIC_MINIMUM
            or len({v12.strict_case_key(row)[0] for row in group}) < PUBLIC_MINIMUM
        }
        complementary = None
        if primary_small:
            visible = [value for value in values if value not in primary_small]
            if visible:
                complementary = min(
                    visible,
                    key=lambda value: (
                        len({v12.strict_case_key(row)[0] for row in groups[value]}),
                        len(groups[value]),
                        value,
                    ),
                )
        for value in values:
            group = groups[value]
            work_count = len({v12.strict_case_key(row)[0] for row in group})
            if value in primary_small or value == complementary:
                cells[value] = {
                    "suppressed": True,
                    "caseCount": None,
                    "uniqueWorkCount": None,
                    "suppressionReason": (
                        "primary_small_cell"
                        if value in primary_small
                        else "complementary_suppression"
                    ),
                }
            else:
                cells[value] = {
                    "suppressed": False,
                    **v12.metric_rows(group, "rawModelPrediction"),
                }
        slices[public_name] = cells
    scoreable_actual = sum(max(float(row["actual"]), 0.0) for row in scoreable)
    served_actual = sum(max(float(row["actual"]), 0.0) for row in served)
    abstained = [row for row in scoreable if row.get("servedPrediction") is None]
    reason_groups: dict[str, list[Mapping[str, Any]]] = defaultdict(list)
    for row in abstained:
        reason_groups[str(row.get("abstentionReason"))].append(row)
    return {
        "allScoreable": v12.metric_rows(scoreable, "rawModelPrediction"),
        "served": v12.metric_rows(served, "servedPrediction"),
        "highValueAllScoreable": _metric_or_none(high, "rawModelPrediction"),
        "highValueServed": _metric_or_none(high_served, "servedPrediction"),
        "horizons": horizons,
        "topBands": top_bands,
        "origins": by_origin,
        "slices": slices,
        "abstention": {
            "scoreableCaseCount": len(scoreable),
            "servedCaseCount": len(served),
            "abstainedCaseCount": len(abstained),
            "abstainedUniqueWorkCount": len(
                {v12.strict_case_key(row)[0] for row in abstained}
            ),
            "servedActualRevenueShareOfScoreableCases": (
                served_actual / scoreable_actual if scoreable_actual > 0 else None
            ),
            "abstentionReasonDistribution": {
                reason: {
                    "caseCount": len(group),
                    "uniqueWorkCount": len(
                        {v12.strict_case_key(row)[0] for row in group}
                    ),
                }
                for reason, group in sorted(reason_groups.items())
            },
            "servedPredictionNullOnEveryAbstention": all(
                row.get("servedPrediction") is None for row in abstained
            ),
            "zeroImputationUsed": False,
        },
        "internal80": interval_metrics(rows),
    }


def internal_metrics_by_model(
    rows: Sequence[Mapping[str, Any]]
) -> dict[str, dict[str, Any]]:
    return {
        model: metrics_for_model([row for row in rows if row.get("model_id") == model])
        for model in MODEL_IDS
    }


def _public_metric(value: Any) -> Any:
    if isinstance(value, Mapping):
        result = {
            str(key): _public_metric(child)
            for key, child in value.items()
            if key not in {"actualTotal", "predictedTotal"}
        }
        return result
    if isinstance(value, list):
        return [_public_metric(child) for child in value]
    if isinstance(value, float):
        return rounded(value)
    return value


def public_metrics_bundle(
    metrics: Mapping[str, Mapping[str, Any]]
) -> dict[str, Any]:
    public = copy.deepcopy(dict(metrics))
    for model, bundle in public.items():
        abstention = bundle["abstention"]
        case_count = int(abstention["abstainedCaseCount"])
        work_count = int(abstention["abstainedUniqueWorkCount"])
        if case_count < PUBLIC_MINIMUM or work_count < PUBLIC_MINIMUM:
            bundle["abstention"] = {
                "suppressed": True,
                "scoreableCaseCount": abstention["scoreableCaseCount"],
                "servedCaseCount": None,
                "abstainedCaseCount": None,
                "abstainedUniqueWorkCount": f"<{PUBLIC_MINIMUM}",
                "servedActualRevenueShareOfScoreableCases": None,
                "abstentionReasonDistribution": None,
                "servedPredictionNullOnEveryAbstention": True,
                "zeroImputationUsed": False,
                "suppressionReason": "small_abstention_and_complement_protection",
            }
            suppressed_metric = {
                "suppressed": True,
                "caseCount": None,
                "uniqueWorkCount": None,
                "wape": None,
                "mae": None,
                "smape": None,
                "signedAggregateBias": None,
                "nullPredictionCount": None,
                "zeroImputationUsed": False,
                "suppressionReason": (
                    "served_metric_complement_of_small_abstention_cell"
                ),
            }
            # Counts alone are not sufficient protection: exact all-scoreable and
            # served MAE/WAPE/bias can algebraically reveal the suppressed case
            # count. Suppress the entire served metric complement.
            bundle["served"] = copy.deepcopy(suppressed_metric)
            if bundle.get("highValueServed") is not None:
                bundle["highValueServed"] = copy.deepcopy(suppressed_metric)
        else:
            reasons = abstention.get("abstentionReasonDistribution", {})
            small_reasons = {
                reason
                for reason, cell in reasons.items()
                if int(cell["caseCount"]) < PUBLIC_MINIMUM
                or int(cell["uniqueWorkCount"]) < PUBLIC_MINIMUM
            }
            complement = None
            visible = [reason for reason in reasons if reason not in small_reasons]
            if small_reasons and visible:
                complement = min(
                    visible,
                    key=lambda reason: (
                        int(reasons[reason]["uniqueWorkCount"]),
                        int(reasons[reason]["caseCount"]),
                        reason,
                    ),
                )
            abstention["abstentionReasonDistribution"] = {
                reason: (
                    {
                        "suppressed": True,
                        "caseCount": None,
                        "uniqueWorkCount": None,
                        "share": None,
                        "suppressionReason": (
                            "primary_small_cell"
                            if reason in small_reasons
                            else "complementary_suppression"
                        ),
                    }
                    if reason in small_reasons or reason == complement
                    else {
                        "suppressed": False,
                        **cell,
                        "share": rounded(int(cell["caseCount"]) / case_count),
                    }
                )
                for reason, cell in sorted(reasons.items())
            }
            abstention["suppressed"] = False
    return _public_metric(public)


def _safe_share(numerator: float, denominator: float) -> float:
    if denominator <= 0:
        raise ReplayV12Error("population revenue denominator is not positive")
    value = numerator / denominator
    if value < -1e-12 or value > 1 + 1e-12:
        raise ReplayV12Error("population coverage is outside [0,1]")
    return min(1.0, max(0.0, value))


def _reason_for_unscoreable_work(
    work_rows: Sequence[Mapping[str, Any]], has_any_expected_case: bool
) -> str:
    if not has_any_expected_case or not work_rows:
        return "not_observable_at_any_frozen_development_origin"
    reasons = {str(row.get("scoreabilityReason")) for row in work_rows}
    precedence = (
        ("identity_integrity_failure", "identity_integrity_failure"),
        ("income_fact_integrity_failure", "income_fact_integrity_failure"),
        (
            "insufficient_observed_calendar_history",
            "insufficient_observed_calendar_history_at_every_eligible_origin",
        ),
        ("work_not_yet_observable_at_origin", "not_observable_at_frozen_origins"),
        (
            "incomplete_actual_window",
            "no_complete_actual_window_or_label_for_development_role",
        ),
        (
            "target_label_not_available_for_role",
            "no_complete_actual_window_or_label_for_development_role",
        ),
    )
    for observed, output in precedence:
        if observed in reasons:
            return output
    return "other_fail_closed"


def _suppressed_distribution(counts: Mapping[str, int], total: int) -> dict[str, Any]:
    small = [key for key, count in counts.items() if count < PUBLIC_MINIMUM]
    complement = None
    if small:
        visible = [key for key, count in counts.items() if count >= PUBLIC_MINIMUM]
        if visible:
            complement = min(visible, key=lambda key: (counts[key], key))
    output: dict[str, Any] = {}
    for key, count in sorted(counts.items()):
        if key in small:
            output[key] = {
                "suppressed": True,
                "count": f"<{PUBLIC_MINIMUM}",
                "share": None,
                "reason": "primary_small_cell",
            }
        elif key == complement:
            output[key] = {
                "suppressed": True,
                "count": None,
                "share": None,
                "reason": "complementary_suppression",
            }
        else:
            output[key] = {
                "suppressed": False,
                "count": int(count),
                "share": rounded(count / total) if total else None,
            }
    return output


def build_population_coverage(
    rows: Sequence[Mapping[str, Any]],
    works: Sequence[Mapping[str, Any]],
    model_inputs: Mapping[str, Any],
    spec: Mapping[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Build work-level denominators once; never use overlapping case actuals."""

    authority_count = len(works)
    if authority_count != 3053:
        raise ReplayV12Error("population authority is not 3053 works")
    baseline_rows = [row for row in rows if row.get("model_id") == "B1"]
    scoreable_ids = {
        v12.strict_case_key(row)[0]
        for row in baseline_rows
        if row.get("statisticallyScoreable") is True
    }
    served_ids = {
        v12.strict_case_key(row)[0]
        for row in baseline_rows
        if row.get("statisticallyScoreable") is True
        and row.get("servedPrediction") is not None
    }
    if not served_ids.issubset(scoreable_ids):
        raise ReplayV12Error("served work set is not a scoreable subset")
    abstained_ids = scoreable_ids - served_ids
    protect_served_complement = len(abstained_ids) < PUBLIC_MINIMUM
    all_ids = {str(work["standard_work_id"]) for work in works}
    unscoreable_ids = all_ids - scoreable_ids
    if scoreable_ids & unscoreable_ids or scoreable_ids | unscoreable_ids != all_ids:
        raise ReplayV12Error("scoreable/unscoreable partition is invalid")

    mapped = model_inputs["mappedBill"]
    valid = mapped[mapped["validForCalibration"].astype(bool)].copy()
    valid["billMonth"] = valid["billMonth"].astype(str).str.slice(0, 7)
    complete = valid[valid["billMonth"] <= str(spec["authority"]["latestCompleteMonth"])].copy()
    if len(valid) != 192872 or len(complete) != 192869:
        raise ReplayV12Error("authority fact denominators changed")
    complete["standardWorkId"] = complete["standardWorkId"].astype(str)
    complete["amount"] = complete["amount"].astype(float)
    signed_by_work = complete.groupby("standardWorkId")["amount"].sum().to_dict()
    positive_by_work = {
        work_id: max(0.0, float(signed_by_work.get(work_id, 0.0)))
        for work_id in all_ids
    }
    library_revenue = sum(positive_by_work.values())
    scoreable_revenue = sum(positive_by_work[work_id] for work_id in scoreable_ids)
    served_revenue = sum(positive_by_work[work_id] for work_id in served_ids)
    if library_revenue <= 0 or scoreable_revenue <= 0:
        raise ReplayV12Error("population revenue denominator is empty")

    ranked = sorted(all_ids, key=lambda work_id: (-positive_by_work[work_id], work_id))
    top: dict[str, Any] = {}
    import math as _math  # local alias keeps the frozen ceil rule explicit

    for percent in (1, 5, 10):
        count = _math.ceil(authority_count * percent / 100.0)
        ids = set(ranked[:count])
        denominator = sum(positive_by_work[work_id] for work_id in ids)
        top[f"top{percent}"] = {
            "fullLibraryBucketWorkCount": count,
            "rankingUniverseWorkCount": authority_count,
            "denominatorPopulation": "full_3053_complete_month_positive_work_revenue_bucket",
            "denominatorBuiltBeforeScoreableServedFilter": True,
            "scoreableRevenueCoverage": _safe_share(
                sum(positive_by_work[work_id] for work_id in ids & scoreable_ids),
                denominator,
            ),
            "servedRevenueCoverage": (
                None
                if protect_served_complement
                else _safe_share(
                    sum(positive_by_work[work_id] for work_id in ids & served_ids),
                    denominator,
                )
            ),
            "servedCoverageComplementarilySuppressed": protect_served_complement,
        }
    if not (
        top["top1"]["fullLibraryBucketWorkCount"]
        < top["top5"]["fullLibraryBucketWorkCount"]
        < top["top10"]["fullLibraryBucketWorkCount"]
    ):
        raise ReplayV12Error("full-library top bands are not nested")

    rows_by_work: dict[str, list[Mapping[str, Any]]] = defaultdict(list)
    expected_ids = set()
    for row in baseline_rows:
        work_id = v12.strict_case_key(row)[0]
        rows_by_work[work_id].append(row)
        expected_ids.add(work_id)
    reason_by_work = {
        work_id: _reason_for_unscoreable_work(
            rows_by_work.get(work_id, []), work_id in expected_ids
        )
        for work_id in unscoreable_ids
    }
    reasons = Counter(reason_by_work.values())
    if sum(reasons.values()) != len(unscoreable_ids):
        raise ReplayV12Error("unscoreable reason distribution is not exhaustive")

    latest = str(spec["authority"]["latestCompleteMonth"])
    work_lookup = {str(work["standard_work_id"]): work for work in works}
    allowed_paths = list(
        v12.load_amendment()["unscoreableForwardPolicy"]["allowedPathEnum"]
    )
    paths: Counter[str] = Counter({path: 0 for path in allowed_paths})
    forward_abstention_reasons: Counter[str] = Counter()
    for work_id in sorted(unscoreable_ids):
        work = work_lookup[work_id]
        if reason_by_work[work_id] in {
            "identity_integrity_failure",
            "income_fact_integrity_failure",
        }:
            paths["abstain"] += 1
            forward_abstention_reasons[
                "identity_or_income_integrity_failure"
            ] += 1
            continue
        if not base.work_exists_as_of(work, latest):
            paths["abstain"] += 1
            forward_abstention_reasons["no_observable_history"] += 1
            continue
        first = scoring.first_observed_source_month(work)
        observed = (
            0
            if first is None or first > latest
            else base.month_ordinal(latest) - base.month_ordinal(first) + 1
        )
        routing = base.route_work_as_of(work, latest, spec)
        if str(routing["route"]) == "unknown_revenue_model":
            paths["abstain"] += 1
            forward_abstention_reasons["unresolved_revenue_route"] += 1
        elif observed < 12:
            paths["insufficient_history_route"] += 1
            forward_abstention_reasons[
                "insufficient_history_below_12_complete_calendar_months"
            ] += 1
        else:
            prediction = v12.predict_as_of(work, latest, 12, "B1", spec)
            if prediction.get("point_forecast") is None:
                paths["abstain"] += 1
                forward_abstention_reasons["model_prediction_unavailable"] += 1
            elif str(prediction.get("confidence")) == "low":
                paths["low_confidence_output"] += 1
            else:
                paths["deterministic_fallback"] += 1
    if sum(paths.values()) != len(unscoreable_ids):
        raise ReplayV12Error("unscoreable forward paths are not exhaustive")

    public = {
        "schema": "m2.calibration_population_coverage.v1",
        "version": "M2-calibration-population-coverage-v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "decisionStatus": "not_for_formal_decision",
        "authority": {
            "standardWorkCount": authority_count,
            "incomeFactCount": len(valid),
            "completeMonthIncomeFactCount": len(complete),
            "factsAfterLatestCompleteMonthExcludedFromCoverage": len(valid) - len(complete),
            "latestCompleteMonth": latest,
        },
        "population": {
            "scoreableWorkCount": len(scoreable_ids),
            "scoreableWorksShareOf3053": len(scoreable_ids) / authority_count,
            "unscoreableWorkCount": len(unscoreable_ids),
            "servedWorkCount": None if protect_served_complement else len(served_ids),
            "servedWorkCountRange": {
                "minimumInclusive": max(0, len(scoreable_ids) - (PUBLIC_MINIMUM - 1)),
                "maximumInclusive": len(scoreable_ids),
            }
            if protect_served_complement
            else None,
            "servedWorksShareOfScoreable": (
                None
                if protect_served_complement
                else len(served_ids) / len(scoreable_ids)
            ),
            "servedWorksShareOf3053": (
                None if protect_served_complement else len(served_ids) / authority_count
            ),
            "scoreableFullHistoryRevenueShare": _safe_share(
                scoreable_revenue, library_revenue
            ),
            "servedFullHistoryRevenueShareOfScoreable": (
                None
                if protect_served_complement
                else _safe_share(served_revenue, scoreable_revenue)
            ),
            "servedFullHistoryRevenueShareOfLibrary": (
                None
                if protect_served_complement
                else _safe_share(served_revenue, library_revenue)
            ),
            "servedAndAbstainedComplementarilySuppressed": protect_served_complement,
            "revenueBasis": (
                "work_level_signed_net_sum_then_max_zero_across_complete_month_facts; "
                "post_hoc_population_description_only"
            ),
            "overlappingBacktestActualUsedAsPopulationDenominator": False,
        },
        "fullLibraryRanking": {
            "rule": v12.load_amendment()["populationCoverage"][
                "topBandRanking"
            ],
            "rankingUniverseWorkCount": authority_count,
            "uniqueRankedWorkCount": len(ranked),
            "builtBeforeScoreableServedOrAbstentionFilter": True,
            "stableWorkIdUsedOnlyAsTieBreak": True,
        },
        "fullLibraryTopBands": top,
        "unscoreableReasons": {
            "total": len(unscoreable_ids),
            "distribution": _suppressed_distribution(reasons, len(unscoreable_ids)),
            "mutuallyExclusive": True,
            "exhaustive": True,
        },
        "forwardPathsForHistoricallyUnscoreableWorks": {
            "asOfMonth": latest,
            "total": len(unscoreable_ids),
            "allowedPathEnum": allowed_paths,
            "distribution": _suppressed_distribution(paths, len(unscoreable_ids)),
            "servedNullAbstentionReasonDistribution": _suppressed_distribution(
                forward_abstention_reasons,
                sum(forward_abstention_reasons.values()),
            ),
            "mutuallyExclusive": True,
            "exhaustive": True,
            "historicallyUnscoreableDoesNotMeanCurrentlyUnservable": True,
            "insufficientHistoryRouteServedPrediction": None,
            "abstentionReasonRequiredWheneverServedPredictionIsNull": True,
        },
        "selectionBoundary": {
            "fullHistoryCoverageMaySelectModelOrThreshold": False,
            "currentShelfRightsRatingRiskUsed": False,
            "finalHoldoutOriginHorizonTruthWindowConstructed": False,
            "authorityFullHistoryAggregationReadForPostHocPopulationOnly": True,
            "authorityFullHistoryAggregationUsedForModelOrThresholdSelection": False,
        },
        "privacy": {
            "aggregateOnly": True,
            "deidentified": True,
            "globalDenominatorsSuppressed": False,
            "smallCellsComplementarilySuppressed": True,
            "servedComplementProtectedBecauseUniqueWorksBelowMinimum": protect_served_complement,
        },
    }
    private = {
        "scoreableWorkIds": sorted(scoreable_ids),
        "servedWorkIds": sorted(served_ids),
        "unscoreableWorkIds": sorted(unscoreable_ids),
        "positiveRevenueByWork": positive_by_work,
        "unscoreableReasonCounts": dict(sorted(reasons.items())),
        "forwardPathCounts": dict(sorted(paths.items())),
        "forwardAbstentionReasonCounts": dict(
            sorted(forward_abstention_reasons.items())
        ),
        "rankingUniverseWorkCount": len(ranked),
        "rankedWorkIds": ranked,
    }
    return _public_metric(public), private


def _synthetic_route_works() -> list[dict[str, Any]]:
    sales = base._synthetic_work()  # pylint: disable=protected-access
    sales["standard_work_id"] = "SYNTH-SALES"
    buyout_months = {
        month: 0.0 for month in base.month_range("2018-01", "2024-12")
    }
    for month, amount in (("2018-01", 1200.0), ("2019-01", 1200.0), ("2020-01", 1200.0)):
        buyout_months[month] = amount
    buyout_channel = {
        "channel_key": "buyout-a",
        "business_form": "audio_copyright",
        "first_observed_month": "2018-01",
        "monthly": buyout_months,
        "batch_cluster_sizes": {"2018-01": 3, "2019-01": 3, "2020-01": 3},
    }
    buyout = {"standard_work_id": "SYNTH-BUYOUT", "channels": [buyout_channel]}
    mixed = copy.deepcopy(sales)
    mixed["standard_work_id"] = "SYNTH-MIXED"
    mixed["channels"].append(copy.deepcopy(buyout_channel))
    unknown_months = {
        month: 0.0 for month in base.month_range("2019-01", "2024-12")
    }
    unknown = {
        "standard_work_id": "SYNTH-UNKNOWN",
        "channels": [
            {
                "channel_key": "unknown-a",
                "business_form": "unknown",
                "first_observed_month": "2019-01",
                "monthly": unknown_months,
                "batch_cluster_sizes": {},
            }
        ],
    }
    return [sales, buyout, mixed, unknown]


def _future_perturbed_work(work: Mapping[str, Any]) -> dict[str, Any]:
    result = copy.deepcopy(work)
    for field in (
        "current_rating",
        "current_risk_bucket",
        "current_rights_status",
        "current_shelf_status",
        "current_business_action_status",
    ):
        result[field] = "future_or_current_post_hoc_mutation"
    for channel in result["channels"]:
        channel.setdefault("monthly", {})["2024-01"] = float(
            channel.get("monthly", {}).get("2024-01", 0.0)
        ) + 9876543.21
        channel.setdefault("batch_cluster_sizes", {})["2024-01"] = 99999
        channel.setdefault("spike_confirmations", []).append(
            {
                "candidate_month": "2021-01",
                "available_as_of": "2024-01",
                "confirmed_type": "true_anomaly",
            }
        )
    result["channels"].append(
        {
            "channel_key": "future-only",
            "business_form": "audio_product",
            "first_observed_month": "2024-01",
            "monthly": {"2024-01": 99999999.0},
            "batch_cluster_sizes": {"2024-01": 99999},
        }
    )
    return result


def _synthetic_prediction_state(prediction: Mapping[str, Any]) -> dict[str, Any]:
    raw = prediction.get("point_forecast")
    serving = bool((prediction.get("eligibility") or {}).get("eligible")) and (
        str(prediction.get("route")) != "unknown_revenue_model"
    )
    served = raw if serving and raw is not None else None
    row = {
        **copy.deepcopy(dict(prediction)),
        "statisticallyScoreable": True,
        "scoreabilityReason": None,
        "modelPredictionAvailable": raw is not None,
        "businessServingEligible": serving,
        "rawModelPrediction": raw,
        "servedPrediction": served,
        "abstained": served is None,
        "abstentionReason": None if served is not None else "synthetic_not_served",
        "rawAnnualBreakdown": copy.deepcopy(prediction.get("annual_breakdown", [])),
        "servedAnnualBreakdown": (
            copy.deepcopy(prediction.get("annual_breakdown", []))
            if served is not None
            else []
        ),
    }
    row["public_output"] = {
        "pointForecast": served,
        "annualBreakdown": copy.deepcopy(row["servedAnnualBreakdown"]),
        "confidence": row.get("confidence"),
        "limitation": copy.deepcopy(row.get("limitation", [])),
    }
    return prediction_projection(row)


def future_perturbation_evidence(spec: Mapping[str, Any]) -> dict[str, Any]:
    origin = "2021-06"
    control_works = _synthetic_route_works()
    perturbed_works = [_future_perturbed_work(work) for work in control_works]
    future_work = {
        "standard_work_id": "SYNTH-FUTURE-WHOLE-WORK",
        "channels": [
            {
                "channel_key": "future-work-channel",
                "business_form": "audio_product",
                "first_observed_month": "2024-01",
                "monthly": {"2024-01": 999.0},
                "batch_cluster_sizes": {},
            }
        ],
    }
    control_context = v12.build_b0b_context(control_works, origin, spec)
    perturbed_context = v12.build_b0b_context(
        [*perturbed_works, future_work], origin, spec
    )
    matrices: list[dict[str, Any]] = []
    expected_before: set[tuple[str, str, int, str, str]] = set()
    expected_after: set[tuple[str, str, int, str, str]] = set()
    for model in MODEL_IDS:
        for control_work, perturbed_work in zip(control_works, perturbed_works):
            for horizon in v12.CORE_HORIZONS:
                kwargs: dict[str, Any] = {}
                changed_kwargs: dict[str, Any] = {}
                if model == "B0b":
                    kwargs["b0b_context"] = control_context
                    changed_kwargs["b0b_context"] = perturbed_context
                elif model == "B4":
                    kwargs["b4_parameter_role"] = "prefit_development_template"
                    changed_kwargs["b4_parameter_role"] = "prefit_development_template"
                before = v12.predict_as_of(
                    control_work, origin, horizon, model, spec, **kwargs
                )
                after = v12.predict_as_of(
                    perturbed_work,
                    origin,
                    horizon,
                    model,
                    spec,
                    **changed_kwargs,
                )
                before_projection = _synthetic_prediction_state(before)
                after_projection = _synthetic_prediction_state(after)
                same = v12.canonical_digest(before_projection) == v12.canonical_digest(
                    after_projection
                )
                before_key = (*v12.strict_case_key(before), model)
                after_key = (*v12.strict_case_key(after), model)
                expected_before.add(before_key)
                expected_after.add(after_key)
                matrices.append(
                    {
                        "model": model,
                        "route": before["route"],
                        "horizonMonths": horizon,
                        "fullPredictionAndStateInvariant": same,
                    }
                )
    future_rejections = 0
    for model in MODEL_IDS:
        try:
            kwargs = (
                {"b0b_context": control_context}
                if model == "B0b"
                else {"b4_parameter_role": "prefit_development_template"}
                if model == "B4"
                else {}
            )
            v12.predict_as_of(future_work, origin, 3, model, spec, **kwargs)
        except (ValueError, v12.CalibrationV12Error):
            future_rejections += 1
        else:
            raise ReplayV12Error("a future-only whole work entered the case universe")
    b4_role_invariance: dict[str, bool] = {}
    for role in (
        "prefit_development_template",
        "development_forward_fold",
        "committed_development_fit",
    ):
        role_spec = copy.deepcopy(spec)
        role_baseline = next(
            item for item in role_spec["models"]["baselines"] if item["id"] == "B0b"
        )
        if role != "prefit_development_template":
            role_baseline["lifecycleFactors"] = copy.deepcopy(
                role_baseline["developmentFit"]["initialFactors"]
            )
        if role == "committed_development_fit":
            role_baseline["boundFittedParameterDigest"] = "0" * 64
        before = v12.predict_as_of(
            control_works[0],
            origin,
            12,
            "B4",
            role_spec,
            b4_parameter_role=role,
        )
        after = v12.predict_as_of(
            perturbed_works[0],
            origin,
            12,
            "B4",
            role_spec,
            b4_parameter_role=role,
        )
        b4_role_invariance[role] = v12.canonical_digest(
            _synthetic_prediction_state(before)
        ) == v12.canonical_digest(_synthetic_prediction_state(after))
    scoreability_is_not_a_predictor_argument = (
        "scoreability_decoupled"
        not in inspect.signature(v12.predict_as_of).parameters
        and "statisticallyScoreable"
        not in inspect.signature(v12.predict_as_of).parameters
    )
    base_fixture = base.contract_self_test()
    routes = {item["route"] for item in matrices}
    passed = bool(
        control_context["fingerprint"] == perturbed_context["fingerprint"]
        and all(item["fullPredictionAndStateInvariant"] for item in matrices)
        and expected_before == expected_after
        and len(matrices) == len(MODEL_IDS) * len(control_works) * len(v12.CORE_HORIZONS)
        and routes
        == {
            "pure_sales_share",
            "pure_buyout",
            "buyout_plus_sales",
            "unknown_revenue_model",
        }
        and future_rejections == len(MODEL_IDS)
        and all(b4_role_invariance.values())
        and scoreability_is_not_a_predictor_argument
        and bool(base_fixture["checks"]["futurePerturbationInvariant"])
    )
    if not passed:
        raise ReplayV12Error("future perturbation changed a v1.2 prediction or state")
    return {
        "passed": True,
        "allCoreHorizonsCovered": True,
        "allBaselineModelsCovered": True,
        "allRevenueRoutesCovered": True,
        "matrixCaseCount": len(matrices),
        "futureAmountPerturbation": True,
        "futureChannelPerturbation": True,
        "futureBatchMetadataPerturbation": True,
        "futureSpikeConfirmationPerturbation": True,
        "currentPostHocStatePerturbation": True,
        "futureOnlyWholeWorkRejectedByEveryModel": True,
        "contextFingerprintInvariant": True,
        "expectedCaseUniverseInvariant": True,
        "fullPredictionAndStateProjectionInvariant": True,
        "scoreabilityStateIsNotAPredictorInput": True,
        "B4ParameterRolesCovered": sorted(b4_role_invariance),
        "B4AllParameterRolesFutureInvariant": True,
    }


def fail_closed_entrypoint_loader_sentinel() -> dict[str, Any]:
    """Monkeypatch every development loader and prove final modes never call one."""

    calls: Counter[str] = Counter()

    def trap(name: str) -> Any:
        def blocked(*_args: Any, **_kwargs: Any) -> Any:
            calls[name] += 1
            raise AssertionError(f"final-holdout entrypoint called loader: {name}")

        return blocked

    patches = [
        (correction, "run_development"),
        (correction, "load_verified_model_inputs"),
        (legacy, "run_replay"),
        (legacy, "fit_b0b_development_parameters"),
        (legacy, "load_authorized_works"),
    ]
    originals: list[tuple[Any, str, Any]] = []
    for module, name in patches:
        originals.append((module, name, getattr(module, name)))
        setattr(module, name, trap(f"{module.__name__}.{name}"))
    current_originals = {
        "run_baselines": globals()["run_baselines"],
        "finalize_phase_a_validation": globals()["finalize_phase_a_validation"],
        "verify_gate_a_after_push": globals()["verify_gate_a_after_push"],
        "load_verified_v1_1_rows": globals()["load_verified_v1_1_rows"],
    }
    for name in current_originals:
        globals()[name] = trap(f"run_m2_calibration_v1_2.{name}")
    statuses: dict[str, int] = {}
    try:
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(
            io.StringIO()
        ):
            statuses = {
                "scoringCorrection": int(correction.main(["--run-final-holdout"])),
                "baselineReplay": int(legacy.main(["--run-final-holdout"])),
                "v1_2": int(main(["--run-final-holdout"])),
            }
    finally:
        for module, name, original in originals:
            setattr(module, name, original)
        for name, original in current_originals.items():
            globals()[name] = original
    if any(status == 0 for status in statuses.values()) or sum(calls.values()) != 0:
        raise ReplayV12Error("a final-holdout entrypoint reached a development loader")
    return {
        "commandsChecked": 3,
        "allExitedNonzero": True,
        "developmentLoaderCallCount": 0,
        "truthBuilderCallCount": 0,
    }


def sealed_block_evidence(spec: Mapping[str, Any]) -> dict[str, Any]:
    final_blocks = [
        (origin, int(horizon))
        for horizon, split in spec["origins"]["coreByHorizon"].items()
        for origin in split["finalHoldout"]
    ]
    embargo_blocks = [
        (origin, int(horizon))
        for horizon, split in spec["origins"]["coreByHorizon"].items()
        for origin in split["embargoShadow"]
    ]
    deferred_60 = [
        (origin, 60) for origin in spec["origins"]["longAuditByHorizon"]["60"]
    ]
    if not final_blocks or not embargo_blocks or not deferred_60:
        raise ReplayV12Error("sealed block matrix is unexpectedly empty")
    builder_calls = 0
    rejected = 0
    masquerade_rejected = 0

    def trap() -> None:
        nonlocal builder_calls
        builder_calls += 1
        raise AssertionError("sealed truth builder was invoked")

    matrices = [
        ("final_holdout", *block) for block in final_blocks
    ] + [("embargo_shadow", *block) for block in embargo_blocks] + [
        ("deferred_60_month", *block) for block in deferred_60
    ]
    for role, origin, horizon in matrices:
        try:
            guarded_truth_builder(role, origin, horizon, trap, spec)
        except ReplayV12Error:
            rejected += 1
        else:
            raise ReplayV12Error("a sealed truth role passed its guard")
        try:
            guarded_truth_builder(
                "development_forward_score:masquerade",
                origin,
                horizon,
                trap,
                spec,
            )
        except ReplayV12Error:
            masquerade_rejected += 1
        else:
            raise ReplayV12Error("a sealed block passed under a development-looking role")
    control_calls = 0

    def control() -> str:
        nonlocal control_calls
        control_calls += 1
        return "synthetic_control"

    first_fold = spec["origins"]["forwardValidation"]["folds"][0]
    control_origin = str(first_fold["scoreOrigin"])
    control_result = guarded_truth_builder(
        f"development_forward_score:{control_origin}",
        control_origin,
        int(first_fold["testHorizons"][0]),
        control,
        spec,
    )
    if control_result != "synthetic_control" or control_calls != 1:
        raise ReplayV12Error("development truth guard control did not execute exactly once")
    if builder_calls != 0 or rejected != len(matrices) or masquerade_rejected != len(matrices):
        raise ReplayV12Error("sealed truth guard evidence is incomplete")
    entrypoint_sentinel = fail_closed_entrypoint_loader_sentinel()
    return {
        "finalHoldoutBlockCount": len(final_blocks),
        "embargoShadowBlockCount": len(embargo_blocks),
        "deferred60MonthBlockCount": len(deferred_60),
        "sealedBlockAttemptCount": len(matrices),
        "sealedRoleRejectionCount": rejected,
        "developmentRoleMasqueradeRejectionCount": masquerade_rejected,
        "truthBuilderCallsForThoseBlocks": builder_calls,
        "developmentGuardSyntheticControlBuilderCalls": control_calls,
        "finalHoldoutOpened": False,
        "embargoShadowOpened": False,
        "deferred60MonthLabelsOpened": False,
        "runnerFinalHoldoutMode": "fail_closed_before_data_load",
        "failClosedEntrypointLoaderSentinel": entrypoint_sentinel,
    }


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def formula_difference_manifest(amendment: Mapping[str, Any]) -> dict[str, Any]:
    sources = [
        (
            "legacy_model_formulas",
            ROOT / "scripts" / "m2-real-data" / "run_m2_forecast_model_bakeoff.py",
            "797f222c7bd6e8f437487749b446db1f7e09d4be",
        ),
        (
            "legacy_forecastability_wrapper",
            ROOT
            / "scripts"
            / "m2-real-data"
            / "run_m2_disentangled_forecastability_validation.py",
            "797f222c7bd6e8f437487749b446db1f7e09d4be",
        ),
        (
            "legacy_v1_1_validation",
            ROOT
            / "scripts"
            / "m2-real-data"
            / "run_m2_disentangled_forecast_v1_1_validation.py",
            "797f222c7bd6e8f437487749b446db1f7e09d4be",
        ),
        (
            "formal_adapter",
            ROOT / "scripts" / "m2-real-data" / "run_m2_formal_execution_payload.py",
            "74feb1277918ffbea827ddd9a8745e62a5293034",
        ),
        (
            "formula_switched_kernel",
            ROOT / "scripts" / "m2-real-data" / "m2_calibration_v1.py",
            "be03db7bdec19b83139d85712bee43995d872679",
        ),
    ]
    bound_sources = []
    for role, path, commit in sources:
        historical = git_blob_bytes(commit, path)
        historical_sha = hashlib.sha256(historical).hexdigest()
        current_sha = file_sha256(path)
        if current_sha != historical_sha:
            raise ReplayV12Error(
                f"formula manifest source bytes differ from {commit}: "
                f"{path.relative_to(ROOT).as_posix()}"
            )
        bound_sources.append(
            {
                "role": role,
                "path": path.relative_to(ROOT).as_posix(),
                "sourceCommit": commit,
                "historicalBlobSha256": historical_sha,
                "currentFileSha256": current_sha,
                "currentMatchesSourceCommit": True,
            }
        )
    return {
        "schema": "m2.v1_1_formula_difference_manifest.v1",
        "version": "M2-v1.1-formula-difference-manifest-v1",
        "decisionStatus": "not_for_formal_decision",
        "historicalReportedModelId": "model_h_disentangled_forecast_v1_1",
        "historicalPointEngine": "model_e_selector",
        "historicalBacktestPostProcessor": "numeric_E_conservative_D_blocked_zero",
        "historicalForwardPointEngine": "model_e_selector_for_all_served",
        "backtestForwardIdentityMismatch": True,
        "faithfulReplayId": amendment["modelIdentity"]["B0b"]["id"],
        "renamedVariantId": amendment["modelIdentity"]["B4"]["id"],
        "sources": bound_sources,
        "differences": {
            "selector": {
                "legacy": "A_B_C_D_Model_E_selector",
                "faithfulReplay": "same_selector_precedence_with_neutral_C_rating",
                "B4": "single_lifecycle_robust_formula_no_selector",
                "fidelity": "required_policy_divergence_for_unavailable_rating_snapshot",
            },
            "pointFormula": {
                "legacy": "Model_E_selected_A_B_C_or_D",
                "faithfulReplay": "legacy_A_B_C_D_per_sales_component_then_sum",
                "B4": "max_recent_robust_positive_median_times_fitted_lifecycle_factor",
                "fidelity": (
                    "A_B_C_D_numeric_formula_exact_except_the_explicit_unconfirmed_spike_policy; "
                    "historical_full_period_lifecycle_thresholds_2.82_1.52_0.45_are_outcome_exposed_"
                    "and_are_replaced_by_the_pre_registered_as_of_safe_10_1.5_0.5_thresholds"
                ),
            },
            "features": {
                "legacy": "full_period_quantiles_current_rating_and_data_gap",
                "faithfulReplay": "origin_as_of_quantiles_priors_rating_C_data_gap_false",
                "fidelity": "required_no_leakage_divergence",
            },
            "routing": {
                "legacy": "whole_work_aggregate_single_selector",
                "faithfulReplay": "sales_per_channel_buyout_cycle_mixed_future_sales_only",
                "fidelity": "required_current_policy_divergence",
            },
            "gate": {
                "legacy": "current_state_work_gate_plus_target_20_percent_boundary",
                "faithfulReplay": "independent_frozen_business_serving_eligibility",
                "fidelity": "legacy_behavior_illegal_and_not_replayed",
            },
            "postProcessing": {
                "legacy": "conservative_to_D_and_blocked_to_zero_in_backtest_only",
                "faithfulReplay": "raw_E_identity_served_null_when_abstained",
                "fidelity": "canonicalized_due_historical_backtest_forward_conflict",
            },
            "spike": {
                "legacy": "peakShare_at_least_0.90_automatic_0.40_damping",
                "faithfulReplay": (
                    "buyout_launch_burst_batch_proration_settlement_lag_and_unconfirmed_"
                    "never_auto_damped; only_cutoff_available_explicit_true_anomaly_"
                    "confirmation_applies_legacy_0.40_peak_damping"
                ),
                "fidelity": "required_user_policy_divergence",
            },
            "confidenceAnnualAndServing": {
                "legacy": "historical_wrapper_confidence_and_backtest_specific_postprocessing",
                "faithfulReplay": (
                    "confidence_inherited_from_lawful_B1_as_of_output; annual_allocation_routing_"
                    "and_served_null_postprocessing_follow_the_v1.2_contract"
                ),
                "fidelity": "required_policy_divergence_and_not_a_claim_of_bit_exact_wrapper_replay",
            },
            "interval": {
                "legacy": "confidence_multiplier_then_required_ratio_group_widening",
                "faithfulReplay": "strict_target_available_rolling_residual_conformal_internal_80",
                "fidelity": "legacy_overlap_residual_behavior_illegal_and_unreplayable",
            },
            "scoring": {
                "legacy": "blocked_zero_and_forecastable_subset",
                "faithfulReplay": "all_scoreable_raw_WAPE_and_served_null_abstention",
                "fidelity": "required_scoring_correction",
            },
        },
        "forbiddenHistoricalBehaviors": [
            "future_outcome_quantiles_or_priors",
            "current_rating_risk_rights_shelf_or_action_as_historical_feature",
            "target_coverage_driven_eligibility",
            "blocked_or_abstained_null_to_zero_in_model_WAPE",
            "unconfirmed_spike_automatic_damping",
            "overlapping_unavailable_interval_residual",
        ],
        "zeroImputationUsed": False,
        "sealedRolesAccessed": False,
    }


def assert_public_privacy(value: Mapping[str, Any]) -> None:
    text = json.dumps(value, ensure_ascii=False, sort_keys=True)
    forbidden = (
        "data/private",
        "private-output",
        "\\private",
        "optimistic",
        "pessimistic",
    )
    if any(token.lower() in text.lower() for token in forbidden):
        raise ReplayV12Error("public report violates the de-identification boundary")


def write_json(path: Path, value: Mapping[str, Any]) -> None:
    assert_public_privacy(value)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )


def write_text(path: Path, value: str) -> None:
    lowered = value.lower()
    if any(
        token in lowered
        for token in (
            "data/private",
            "private-output",
            "optimistic",
            "pessimistic",
            "pi endpoint",
        )
    ):
        raise ReplayV12Error("public Markdown violates the reporting boundary")
    path.write_text(value.rstrip() + "\n", encoding="utf-8", newline="\n")


def _fmt(value: Any) -> str:
    if value is None:
        return "—"
    if isinstance(value, float):
        return f"{value:.4f}"
    return str(value)


def identity_markdown(report: Mapping[str, Any]) -> str:
    lines = [
        "# M2 基线身份与 comparator 修正",
        "",
        "结论：旧 v1.1 的合法重放身份是 Model E selector 的无泄漏、路由化重放；此前名为 B0b 的生命周期稳健单公式已改名 B4。所有结果仍为 `not_for_formal_decision`。",
        "",
        "## 开发集基线",
        "",
        "| 模型 | all-scoreable WAPE | signed bias | served WAPE | 高价值 WAPE | 内部 80% coverage |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for model in MODEL_IDS:
        metrics = report["developmentBaseline"][model]
        lines.append(
            "| "
            + " | ".join(
                [
                    model,
                    _fmt(metrics["allScoreable"]["wape"]),
                    _fmt(metrics["allScoreable"]["signedAggregateBias"]),
                    _fmt(metrics["served"]["wape"]),
                    _fmt(metrics["highValueAllScoreable"]["wape"]),
                    _fmt(metrics["internal80"]["internal80Coverage"]),
                ]
            )
            + " |"
        )
    selection = report["comparatorBundle"]
    lines.extend(
        [
            "",
            "## 冻结选择",
            "",
            f"- 经验 WAPE leader：`{selection['empiricalWapeLeader']}`。",
            f"- primary performance comparator：`{selection['primaryPerformanceComparator']}`。",
            f"- 严格实用等价集合：`{', '.join(selection['strictEquivalentSet'])}`。",
            "- 固定伴随比较器：B1、B3、faithful B0b；B0a 只作历史审计。",
            "",
            "严格等价必须同时满足 WAPE 相对差不超过 1%、相对差 bootstrap 95% CI 完全落在 ±1%、bias 差不超过 2 个百分点，以及 top10 与每个核心 horizon 回退不超过 2%。",
            "",
            "内部区间只用于 coverage/WIS 审计；公开输出仍只有单点值、年度拆分、confidence 和 limitation。",
        ]
    )
    return "\n".join(lines)


def population_markdown(report: Mapping[str, Any]) -> str:
    population = report["population"]
    served_count = population.get("servedWorkCount")
    served_range = population.get("servedWorkCountRange") or {}
    served_work_text = (
        f"{served_count} / {population['scoreableWorkCount']}"
        if served_count is not None
        else (
            "互补抑制（安全范围 "
            f"{served_range.get('minimumInclusive')}–{served_range.get('maximumInclusive')}）"
        )
    )
    served_library_text = (
        f"{served_count} / 3053"
        if served_count is not None
        else "互补抑制"
    )
    served_scoreable_revenue = population.get(
        "servedFullHistoryRevenueShareOfScoreable"
    )
    served_library_revenue = population.get("servedFullHistoryRevenueShareOfLibrary")
    served_scoreable_revenue_text = (
        f"{served_scoreable_revenue:.2%}"
        if served_scoreable_revenue is not None
        else "互补抑制"
    )
    served_library_revenue_text = (
        f"{served_library_revenue:.2%}"
        if served_library_revenue is not None
        else "互补抑制"
    )
    lines = [
        "# M2 校准人口覆盖",
        "",
        "本报告使用完整 3053 部作品作作品分母；收入覆盖使用截至 2026-04 的 192869 条完整月事实。其余 3 条事实只做 192872 权威范围对账，不进入模型或覆盖分母。",
        "",
        "| 指标 | 结果 |",
        "|---|---:|",
        f"| scoreable works / 3053 | {population['scoreableWorkCount']} / 3053（{population['scoreableWorksShareOf3053']:.2%}） |",
        f"| served works / scoreable | {served_work_text} |",
        f"| served works / 3053 | {served_library_text} |",
        f"| scoreable 完整月历史收入覆盖 | {population['scoreableFullHistoryRevenueShare']:.2%} |",
        f"| served / scoreable 完整月历史收入 | {served_scoreable_revenue_text} |",
        f"| served / 全库完整月历史收入 | {served_library_revenue_text} |",
        f"| unscoreable works | {report['unscoreableReasons']['total']} |",
        "",
        "## 完整 3053 收入桶覆盖",
        "",
        "| 收入桶 | 完整桶作品数 | scoreable 收入覆盖 | served 收入覆盖 |",
        "|---|---:|---:|---:|",
    ]
    for name in ("top1", "top5", "top10"):
        item = report["fullLibraryTopBands"][name]
        served_coverage = item.get("servedRevenueCoverage")
        served_coverage_text = (
            f"{served_coverage:.2%}"
            if served_coverage is not None
            else "互补抑制"
        )
        lines.append(
            f"| {name} | {item['fullLibraryBucketWorkCount']} | "
            f"{item['scoreableRevenueCoverage']:.2%} | {served_coverage_text} |"
        )
    lines.extend(
        [
            "",
            "unscoreable 原因与前向路径均为互斥、穷尽分区；小于 10 的子格与至少一个互补子格一起抑制，但 3053、192872、192869 及总作品数不抑制。完整历史覆盖只作事后人口描述，不参与模型、阈值或 comparator 选择。",
        ]
    )
    return "\n".join(lines)


def ready_markdown(report: Mapping[str, Any]) -> str:
    conditions = report["gateAContentConditions"]
    lines = [
        "# M2 calibration 建模就绪检查",
        "",
        "Phase A 内容门禁已经机器化。提交并推送条件需在 checkpoint 推送后由独立运行时收据验证；在此之前不得启动 C1。",
        "",
        "| 条件 | 状态 |",
        "|---|---|",
    ]
    for key, value in conditions.items():
        lines.append(f"| {key} | {'PASS' if value else 'PENDING/FAIL'} |")
    lines.extend(
        [
            "",
            "final holdout、embargo shadow 和 deferred 60-month labels 均未打开。即使 Gate A 通过，C1 也仍为 `not_for_formal_decision`。",
        ]
    )
    return "\n".join(lines)


def c1_design_report(amendment: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "schema": "m2.c1_transparent_ensemble_design.v1",
        "version": "M2-C1-transparent-ensemble-design-v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "decisionStatus": "not_for_formal_decision",
        "authorization": "only_after_every_Gate_A_runtime_condition_is_true",
        "design": copy.deepcopy(amendment["C1"]),
        "acceptanceGates": copy.deepcopy(amendment["C1AcceptanceGates"]),
        "frozenBeforeTraining": True,
        "finalHoldoutMayBeRead": False,
        "C2RC2C3MayStart": False,
        "publicOutputFields": copy.deepcopy(
            amendment["intervalAndPublicBoundary"]["publicAllowedFields"]
        ),
    }


def c1_design_markdown(report: Mapping[str, Any]) -> str:
    design = report["design"]
    return "\n".join(
        [
            "# M2 C1 transparent ensemble 预注册设计",
            "",
            "C1 只在 Gate A 全部通过后执行。它是低复杂度、透明的点预测组合，不使用 final holdout，不改变 eligibility，也不进入 C2-R。",
            "",
            "## 冻结组件",
            "",
            *[f"- `{item}`" for item in design["allowedComponents"]],
            "",
            f"最多 {design['componentCap']} 个非零组件；权重格为 {design['weightGrid']}。选择采用 expanding-origin inner evidence，固定 seed，并按组件数、参数数、候选 ID 依次打破平局。",
            "",
            "pure sales 按渠道组合后求和；pure buyout 保持历史周期月均等效；buyout+sales 只预测未来实销。内部 80% 区间只用于 calibration 审计，不公开端点。",
        ]
    )


PRIVATE_PHASE_A_CASE_FIELDS = frozenset(
    {
        "modelId",
        "caseKey",
        "predictionRole",
        "route",
        "pointForecast",
        "identity",
        "eligibility",
        "modelCapabilityEligibility",
        "actual",
        "statisticallyScoreable",
        "scoreabilityReason",
        "modelPredictionAvailable",
        "businessServingEligible",
        "rawModelPrediction",
        "servedPrediction",
        "abstained",
        "abstentionReason",
        "targetEnd",
        "labelAvailableAsOf",
        "billMonthMax",
        "sourceAvailableAsOf",
        "features",
        "strata",
        "confidence",
        "limitation",
        "annualBreakdown",
        "rawAnnualBreakdown",
        "servedAnnualBreakdown",
        "spikeCandidates",
        "channelComponents",
        "publicOutput",
        "internalInterval",
    }
)


def _private_row(row: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "modelId": row["model_id"],
        "caseKey": copy.deepcopy(row["case_key"]),
        "predictionRole": row.get("_residual_case_role"),
        "route": row.get("route"),
        "pointForecast": row.get("point_forecast"),
        "identity": row.get("identity"),
        "eligibility": copy.deepcopy(row.get("eligibility", {})),
        "modelCapabilityEligibility": copy.deepcopy(
            row.get("modelCapabilityEligibility", {})
        ),
        "actual": row.get("actual"),
        "statisticallyScoreable": row.get("statisticallyScoreable"),
        "scoreabilityReason": row.get("scoreabilityReason"),
        "modelPredictionAvailable": row.get("modelPredictionAvailable"),
        "businessServingEligible": row.get("businessServingEligible"),
        "rawModelPrediction": row.get("rawModelPrediction"),
        "servedPrediction": row.get("servedPrediction"),
        "abstained": row.get("abstained"),
        "abstentionReason": row.get("abstentionReason"),
        "targetEnd": row.get("target_end"),
        "labelAvailableAsOf": row.get("label_available_as_of"),
        "billMonthMax": row.get("_bill_month_max"),
        "sourceAvailableAsOf": row.get("_available_as_of"),
        "features": copy.deepcopy(row.get("features", {})),
        "strata": copy.deepcopy(row.get("strata", {})),
        "confidence": row.get("confidence"),
        "limitation": copy.deepcopy(row.get("limitation", [])),
        "annualBreakdown": copy.deepcopy(row.get("annual_breakdown", [])),
        "rawAnnualBreakdown": copy.deepcopy(row.get("rawAnnualBreakdown", [])),
        "servedAnnualBreakdown": copy.deepcopy(
            row.get("servedAnnualBreakdown", [])
        ),
        "spikeCandidates": copy.deepcopy(row.get("spike_candidates", [])),
        "channelComponents": copy.deepcopy(row.get("channel_components", [])),
        "publicOutput": copy.deepcopy(row.get("public_output", {})),
        "internalInterval": copy.deepcopy(row.get("_internal_interval", {})),
    }


def _phase_a_payload_to_row(payload: Mapping[str, Any]) -> dict[str, Any]:
    if set(payload) != PRIVATE_PHASE_A_CASE_FIELDS:
        raise ReplayV12Error("Phase A private case schema is not exact")
    key = payload.get("caseKey")
    if not isinstance(key, Mapping) or set(key) != {
        "standard_work_id",
        "origin",
        "horizon_months",
        "route",
    }:
        raise ReplayV12Error("Phase A private case key schema is not exact")
    row = {
        "model_id": payload["modelId"],
        "case_key": copy.deepcopy(dict(key)),
        "_residual_case_role": payload["predictionRole"],
        "route": payload["route"],
        "point_forecast": payload["pointForecast"],
        "identity": payload["identity"],
        "eligibility": copy.deepcopy(payload["eligibility"]),
        "modelCapabilityEligibility": copy.deepcopy(
            payload["modelCapabilityEligibility"]
        ),
        "actual": payload["actual"],
        "statisticallyScoreable": payload["statisticallyScoreable"],
        "scoreabilityReason": payload["scoreabilityReason"],
        "modelPredictionAvailable": payload["modelPredictionAvailable"],
        "businessServingEligible": payload["businessServingEligible"],
        "rawModelPrediction": payload["rawModelPrediction"],
        "servedPrediction": payload["servedPrediction"],
        "abstained": payload["abstained"],
        "abstentionReason": payload["abstentionReason"],
        "target_end": payload["targetEnd"],
        "label_available_as_of": payload["labelAvailableAsOf"],
        "_bill_month_max": payload["billMonthMax"],
        "_available_as_of": payload["sourceAvailableAsOf"],
        "features": copy.deepcopy(payload["features"]),
        "strata": copy.deepcopy(payload["strata"]),
        "confidence": payload["confidence"],
        "limitation": copy.deepcopy(payload["limitation"]),
        "annual_breakdown": copy.deepcopy(payload["annualBreakdown"]),
        "rawAnnualBreakdown": copy.deepcopy(payload["rawAnnualBreakdown"]),
        "servedAnnualBreakdown": copy.deepcopy(payload["servedAnnualBreakdown"]),
        "spike_candidates": copy.deepcopy(payload["spikeCandidates"]),
        "channel_components": copy.deepcopy(payload["channelComponents"]),
        "public_output": copy.deepcopy(payload["publicOutput"]),
        "_internal_interval": copy.deepcopy(payload["internalInterval"]),
    }
    if row["model_id"] not in MODEL_IDS:
        raise ReplayV12Error("Phase A private case has an unknown model")
    if not isinstance(row["_residual_case_role"], str):
        raise ReplayV12Error("Phase A private case role is not a native string")
    if row["route"] != row["case_key"]["route"]:
        raise ReplayV12Error("Phase A private row route differs from its case key")
    v12.strict_case_key(row)
    v12.validate_case_state(row)
    return row


def role_model_counts(rows: Sequence[Mapping[str, Any]]) -> dict[str, dict[str, int]]:
    counts: dict[str, Counter[str]] = defaultdict(Counter)
    for row in rows:
        counts[str(row["_residual_case_role"])][str(row["model_id"])] += 1
    return {
        role: {model: int(count) for model, count in sorted(models.items())}
        for role, models in sorted(counts.items())
    }


def write_private_phase_a(
    rows: Sequence[Mapping[str, Any]], manifest: Mapping[str, Any]
) -> dict[str, Any]:
    require_private_boundaries()
    PRIVATE_DIR.mkdir(parents=True, exist_ok=True)
    hasher = hashlib.sha256()
    with PRIVATE_PHASE_A_CASES.open("wb") as handle:
        for row in sorted(
            rows,
            key=lambda item: (
                str(item.get("_residual_case_role")),
                str(item.get("model_id")),
                v12.strict_case_key(item),
            ),
        ):
            line = (
                json.dumps(
                    _private_row(row),
                    ensure_ascii=False,
                    sort_keys=True,
                    separators=(",", ":"),
                    allow_nan=False,
                ).encode("utf-8")
                + b"\n"
            )
            handle.write(line)
            hasher.update(line)
    derived = private_case_derived_bindings(rows)
    payload = {
        **copy.deepcopy(dict(manifest)),
        "privateCaseRowCount": len(rows),
        "caseEvidenceSha256": hasher.hexdigest(),
        "derivedBindings": derived,
        "tracked": False,
        "finalHoldoutOpened": False,
        "embargoShadowOpened": False,
        "deferred60MonthLabelsOpened": False,
    }
    PRIVATE_PHASE_A_MANIFEST.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    if run_git("ls-files", "--", str(PRIVATE_PHASE_A_CASES), str(PRIVATE_PHASE_A_MANIFEST)):
        raise ReplayV12Error("private v1.2 evidence entered Git")
    return {
        "rowCount": len(rows),
        "caseEvidenceSha256": hasher.hexdigest(),
        "derivedBindings": derived,
        "manifestSha256": file_sha256(PRIVATE_PHASE_A_MANIFEST),
        "tracked": False,
    }


def public_phase_a_digests() -> dict[str, str]:
    missing = [path.name for path in PUBLIC_PHASE_A_PATHS if not path.is_file()]
    if missing:
        raise ReplayV12Error(f"Phase A public artifacts are missing: {missing}")
    return {
        path.relative_to(ROOT).as_posix(): file_sha256(path)
        for path in PUBLIC_PHASE_A_PATHS
    }


def phase_a_source_digests() -> dict[str, str]:
    missing = [path.name for path in PHASE_A_SOURCE_PATHS if not path.is_file()]
    if missing:
        raise ReplayV12Error(f"Phase A source binding is incomplete: {missing}")
    return {
        path.relative_to(ROOT).as_posix(): file_sha256(path)
        for path in PHASE_A_SOURCE_PATHS
    }


def non_self_public_evidence_digests() -> dict[str, str]:
    paths = (
        FORMULA_MANIFEST,
        IDENTITY_JSON,
        IDENTITY_MD,
        POPULATION_JSON,
        POPULATION_MD,
        C1_DESIGN_JSON,
        C1_DESIGN_MD,
    )
    return {path.relative_to(ROOT).as_posix(): file_sha256(path) for path in paths}


def private_case_derived_bindings(
    rows: Sequence[Mapping[str, Any]],
) -> dict[str, Any]:
    if not rows:
        raise ReplayV12Error("Phase A private case evidence is empty")
    development = forward_rows(rows)
    by_model = {
        model: [row for row in development if row.get("model_id") == model]
        for model in MODEL_IDS
    }
    reference_model = MODEL_IDS[0]
    reference_keys = {v12.strict_case_key(row) for row in by_model[reference_model]}
    if not reference_keys or any(
        {v12.strict_case_key(row) for row in by_model[model]} != reference_keys
        for model in MODEL_IDS
    ):
        raise ReplayV12Error("private Phase A forward case keys are not paired")
    scoreable_keys = {
        v12.strict_case_key(row)
        for row in by_model[reference_model]
        if row.get("statisticallyScoreable") is True
    }
    actual_by_key: dict[tuple[str, str, int, str], str] = {}
    target_by_key: dict[tuple[str, str, int, str], tuple[Any, ...]] = {}
    for model in MODEL_IDS:
        for row in by_model[model]:
            key = v12.strict_case_key(row)
            actual = base.fixed_decimal(row["actual"])
            target = (
                row.get("target_end"),
                row.get("label_available_as_of"),
                row.get("_bill_month_max"),
                row.get("_available_as_of"),
            )
            if key in actual_by_key and actual_by_key[key] != actual:
                raise ReplayV12Error("private Phase A actual differs across models")
            if key in target_by_key and target_by_key[key] != target:
                raise ReplayV12Error("private Phase A label metadata differs across models")
            actual_by_key[key] = actual
            target_by_key[key] = target
    return {
        "privateCaseRowCount": len(rows),
        "roleModelCounts": role_model_counts(rows),
        "predictionFingerprintsByModel": prediction_fingerprints_by_model(rows),
        "expectedUniverseFingerprint": v12.canonical_digest(
            [list(key) for key in sorted(reference_keys)]
        ),
        "scoreableUniverseFingerprint": v12.canonical_digest(
            [list(key) for key in sorted(scoreable_keys)]
        ),
        "actualFingerprint": v12.canonical_digest(
            [
                {"key": list(key), "actual": actual_by_key[key]}
                for key in sorted(actual_by_key)
            ]
        ),
        "targetAvailabilityFingerprint": v12.canonical_digest(
            [
                {
                    "key": list(key),
                    "targetEnd": target_by_key[key][0],
                    "labelAvailableAsOf": target_by_key[key][1],
                    "truthWindowBillMonthMaximum": target_by_key[key][2],
                    "truthSourceAvailableAsOf": target_by_key[key][3],
                }
                for key in sorted(target_by_key)
            ]
        ),
        "strataFingerprint": v12.canonical_digest(
            [
                {
                    "model": row["model_id"],
                    "key": list(v12.strict_case_key(row)),
                    "strata": copy.deepcopy(row.get("strata", {})),
                }
                for row in sorted(
                    development,
                    key=lambda item: (
                        str(item["model_id"]),
                        v12.strict_case_key(item),
                    ),
                )
            ]
        ),
        "internalIntervalFingerprint": v12.canonical_digest(
            [
                {
                    "model": row["model_id"],
                    "key": list(v12.strict_case_key(row)),
                    "internalInterval": copy.deepcopy(
                        row.get("_internal_interval", {})
                    ),
                }
                for row in sorted(
                    development,
                    key=lambda item: (
                        str(item["model_id"]),
                        v12.strict_case_key(item),
                    ),
                )
            ]
        ),
    }


def _expected_phase_a_role_models(spec: Mapping[str, Any]) -> dict[str, set[str]]:
    return {
        "development_warmup_interval_calibration": set(MODEL_IDS),
        "development_fold_training_seed": {"B4"},
        "development_long_horizon_audit": set(MODEL_IDS),
        **{
            f"development_forward_score:{fold['scoreOrigin']}": set(MODEL_IDS)
            for fold in spec["origins"]["forwardValidation"]["folds"]
        },
    }


def verify_private_phase_a_evidence() -> dict[str, Any]:
    require_private_boundaries()
    if not PRIVATE_PHASE_A_CASES.is_file() or not PRIVATE_PHASE_A_MANIFEST.is_file():
        raise ReplayV12Error("ignored Phase A case/manifest evidence is missing")
    manifest = json.loads(PRIVATE_PHASE_A_MANIFEST.read_text(encoding="utf-8"))
    if not isinstance(manifest, Mapping):
        raise ReplayV12Error("Phase A private manifest is not an object")
    _base_spec, _v1_1, amendment = v12.load_and_validate_contract()
    required = {
        "schema",
        "decisionStatus",
        "specDigest",
        "privateCaseRowCount",
        "caseEvidenceSha256",
        "publicReportSha256",
        "tracked",
        "finalHoldoutOpened",
        "embargoShadowOpened",
        "deferred60MonthLabelsOpened",
        "derivedBindings",
    }
    if required.difference(manifest):
        raise ReplayV12Error("Phase A private manifest lacks required bindings")
    if (
        manifest["schema"] != "m2.calibration_v1_2.baseline_private_manifest.v1"
        or manifest["decisionStatus"] != "not_for_formal_decision"
        or manifest["specDigest"] != v12.canonical_digest(amendment)
        or manifest["tracked"] is not False
        or manifest["finalHoldoutOpened"] is not False
        or manifest["embargoShadowOpened"] is not False
        or manifest["deferred60MonthLabelsOpened"] is not False
    ):
        raise ReplayV12Error("Phase A private manifest contract binding failed")
    digest = hashlib.sha256()
    rows: list[dict[str, Any]] = []
    seen: set[tuple[str, str, tuple[str, str, int, str]]] = set()
    expected_role_models = _expected_phase_a_role_models(_base_spec)
    with PRIVATE_PHASE_A_CASES.open("rb") as handle:
        for raw in handle:
            if not raw.endswith(b"\n") or raw in {b"\n", b"\r\n"}:
                raise ReplayV12Error("Phase A private cases are not canonical LF NDJSON")
            payload = json.loads(raw[:-1].decode("utf-8"))
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
            if canonical != raw:
                raise ReplayV12Error("Phase A private case line is not canonical JSON")
            row = _phase_a_payload_to_row(payload)
            role = row["_residual_case_role"]
            key = v12.strict_case_key(row)
            if role not in expected_role_models or row["model_id"] not in expected_role_models[role]:
                raise ReplayV12Error("Phase A private case contains an unauthorized role/model")
            guarded_truth_builder(role, key[1], key[2], lambda: True, _base_spec)
            unique = (role, str(row["model_id"]), key)
            if unique in seen:
                raise ReplayV12Error("Phase A private case contains a duplicate role/model/key")
            seen.add(unique)
            rows.append(row)
            digest.update(raw)
    count = len(rows)
    if (
        count != int(manifest["privateCaseRowCount"])
        or digest.hexdigest() != manifest["caseEvidenceSha256"]
    ):
        raise ReplayV12Error("Phase A private case count/digest differs from its manifest")
    observed_role_models = {
        role: set(models) for role, models in role_model_counts(rows).items()
    }
    if observed_role_models != expected_role_models:
        raise ReplayV12Error("Phase A private role/model set is incomplete")
    derived = private_case_derived_bindings(rows)
    if dict(manifest["derivedBindings"]) != derived:
        raise ReplayV12Error("Phase A private derived bindings differ from the manifest")
    gate = json.loads(GATE_A_JSON.read_text(encoding="utf-8"))
    tracked_binding = gate.get("evidenceBindings")
    if not isinstance(tracked_binding, Mapping):
        raise ReplayV12Error("tracked Gate A lacks the private evidence anchor")
    for key in (
        "privateCaseRowCount",
        "privateCaseEvidenceSha256",
        "roleModelCounts",
        "predictionFingerprintsByModel",
        "expectedUniverseFingerprint",
        "scoreableUniverseFingerprint",
        "actualFingerprint",
        "targetAvailabilityFingerprint",
        "strataFingerprint",
        "internalIntervalFingerprint",
    ):
        observed = digest.hexdigest() if key == "privateCaseEvidenceSha256" else derived.get(key)
        if tracked_binding.get(key) != observed:
            raise ReplayV12Error(f"tracked Gate A private binding differs: {key}")
    public_digests = public_phase_a_digests()
    if dict(manifest["publicReportSha256"]) != public_digests:
        raise ReplayV12Error("Phase A public report hashes differ from the private manifest")
    if tracked_private_artifacts():
        raise ReplayV12Error("a private case/manifest/notebook/workbook is tracked")
    return {
        "manifestRoundTripVerified": True,
        "privateCaseRowCount": count,
        "caseEvidenceSha256": digest.hexdigest(),
        "manifestSha256": file_sha256(PRIVATE_PHASE_A_MANIFEST),
        "publicReportSha256": public_digests,
        "specDigest": manifest["specDigest"],
        "derivedBindings": derived,
        "rows": rows,
        "allRowsDevelopmentOnly": True,
        "trackedPrivateArtifactCount": 0,
        "finalHoldoutOpened": False,
        "embargoShadowOpened": False,
        "deferred60MonthLabelsOpened": False,
    }


def rebind_private_phase_a_public_hashes() -> dict[str, Any]:
    manifest = json.loads(PRIVATE_PHASE_A_MANIFEST.read_text(encoding="utf-8"))
    manifest["publicReportSha256"] = public_phase_a_digests()
    PRIVATE_PHASE_A_MANIFEST.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    return verify_private_phase_a_evidence()


def phase_a_condition_evidence(
    *,
    amendment: Mapping[str, Any],
    formula: Mapping[str, Any],
    selection: Mapping[str, Any],
    bootstrap: Mapping[str, Any],
    parity: Mapping[str, Any],
    population: Mapping[str, Any],
    private_population: Mapping[str, Any],
    future: Mapping[str, Any],
    seals: Mapping[str, Any],
    prior_seals: Mapping[str, Any],
    materialization: Mapping[str, Any],
    practical_boundary: Mapping[str, Any],
) -> tuple[dict[str, bool], dict[str, Any]]:
    def passed(checks: Mapping[str, Any]) -> bool:
        return bool(checks) and all(value is True for value in checks.values())

    model_identity = amendment["modelIdentity"]
    identity_checks = {
        "faithfulIdExact": model_identity["B0b"]["id"]
        == "B0b_v1_1_leakage_free_replay",
        "formulaManifestNamesFaithfulId": formula["faithfulReplayId"]
        == model_identity["B0b"]["id"],
        "historicalConflictDisclosed": formula["backtestForwardIdentityMismatch"]
        is True,
        "allFormulaSourcesBoundToHistoricalBlob": all(
            source.get("currentMatchesSourceCommit") is True
            and bool(SHA256.fullmatch(str(source.get("historicalBlobSha256", ""))))
            for source in formula["sources"]
        ),
        "freshV12Materialization": materialization[
            "allBaselinePredictionsMaterializedThroughV12Entry"
        ]
        is True,
        "oldNumericNotUsed": materialization["oldNumericPredictionFieldsUsed"]
        is False,
    }
    rename_checks = {
        "renamedIdExact": model_identity["B4"]["id"]
        == "B4_formula_switched_legacy_variant",
        "formulaManifestNamesB4": formula["renamedVariantId"]
        == model_identity["B4"]["id"],
        "B4SequentialFitVerified": materialization[
            "B4SequentialFactorsMatchFullRecomputation"
        ]
        is True,
        "B4CommittedArtifactVerified": materialization[
            "B4FullFactorsMatchCommittedArtifact"
        ]
        is True,
    }
    comparator_checks = {
        "primaryIsLegalBaseline": selection["primaryPerformanceComparator"]
        in MODEL_IDS,
        "B0aExcluded": selection["B0aSelectionEligible"] is False,
        "B1RoleExact": selection["B1NaiveComparator"] == "B1",
        "B3RoleExact": selection["B3BusinessAwareComparator"] == "B3",
        "faithfulRoleExact": selection["faithfulB0bComparator"] == "B0b",
        "empiricalLeaderInEquivalentSet": selection["empiricalWapeLeader"]
        in selection["strictEquivalentSet"],
        "primaryInEquivalentSet": selection["primaryPerformanceComparator"]
        in selection["strictEquivalentSet"],
        "B4IncludedBecauseFormulaDiffers": "B4" in MODEL_IDS,
    }
    equivalence_checks = {
        "boundarySelfTestPassed": practical_boundary["passed"] is True,
        "inclusiveBoundaryAccepted": practical_boundary[
            "inclusiveBoundaryAccepted"
        ]
        is True,
        "singleFailuresRejected": practical_boundary[
            "eachSingleConditionFailureRejected"
        ]
        is True,
        "wideCiContainingZeroRejected": practical_boundary[
            "wideCiContainingZeroRejected"
        ]
        is True,
        "fourWayAndFrozen": amendment["practicalEquivalence"][
            "allConditionsRequired"
        ]
        is True,
        "bootstrapClusterKeysExact": bootstrap["clusterKeys"]
        == ["standard_work_id", "origin"],
        "bootstrapCaseIidDisabled": bootstrap["caseIidSampling"] is False,
        "selectionEvidenceUsesExactAnd": all(
            evidence["allFourConditions"]
            is (
                evidence["relativeWapeWithinOnePercent"]
                and evidence["bootstrapCiEntirelyInsideEquivalenceRegion"]
                and evidence["signedBiasDifferenceWithinTwoPoints"]
                and evidence["noTop10OrHorizonRegressionOverTwoPercent"]
            )
            for evidence in selection["evidence"].values()
        ),
    }
    path_counts = private_population["forwardPathCounts"]
    reason_counts = private_population["unscoreableReasonCounts"]
    population_checks = {
        "authorityWorkCountExact": population["authority"]["standardWorkCount"]
        == 3053,
        "authorityFactCountExact": population["authority"]["incomeFactCount"]
        == 192872,
        "completeFactCountExact": population["authority"][
            "completeMonthIncomeFactCount"
        ]
        == 192869,
        "scoreableUnscoreablePartitionExact": population["population"][
            "scoreableWorkCount"
        ]
        + population["population"]["unscoreableWorkCount"]
        == 3053,
        "rankingUniverseExact": population["fullLibraryRanking"][
            "rankingUniverseWorkCount"
        ]
        == 3053
        and population["fullLibraryRanking"]["uniqueRankedWorkCount"] == 3053,
        "rankingBeforeFilters": population["fullLibraryRanking"][
            "builtBeforeScoreableServedOrAbstentionFilter"
        ]
        is True,
        "topBucketCountsExact": [
            population["fullLibraryTopBands"][name]["fullLibraryBucketWorkCount"]
            for name in ("top1", "top5", "top10")
        ]
        == [31, 153, 306],
        "topDenominatorsBuiltBeforeFilters": all(
            population["fullLibraryTopBands"][name][
                "denominatorBuiltBeforeScoreableServedFilter"
            ]
            is True
            for name in ("top1", "top5", "top10")
        ),
        "unscoreableReasonsExhaustive": sum(reason_counts.values())
        == population["population"]["unscoreableWorkCount"],
        "forwardPathsExactEnum": set(path_counts)
        == set(amendment["unscoreableForwardPolicy"]["allowedPathEnum"]),
        "forwardPathsExhaustive": sum(path_counts.values())
        == population["population"]["unscoreableWorkCount"],
        "servedComplementProtected": population["privacy"][
            "smallCellsComplementarilySuppressed"
        ]
        is True,
        "postHocCoverageCannotSelect": population["selectionBoundary"][
            "fullHistoryCoverageMaySelectModelOrThreshold"
        ]
        is False,
    }
    parity_checks = {
        "allExpectedUniversesExact": all(
            parity["eachModelEqualsIndependentExpectedUniverse"].values()
        ),
        "caseKeysIdentical": parity["caseKeysIdentical"] is True,
        "scoreableKeysIdentical": parity["scoreableKeysIdentical"] is True,
        "actualValuesIdentical": parity["actualValuesIdentical"] is True,
        "targetMetadataIdentical": parity[
            "targetAndAvailabilityMetadataIdentical"
        ]
        is True,
        "expectedCaseCountExact": parity["expectedCaseCountPerModel"] == 18615,
        "allScoreableRawComplete": parity[
            "rawPredictionCompleteOnAllScoreable"
        ]
        is True,
        "allThroughV12Entry": materialization[
            "allBaselinePredictionsMaterializedThroughV12Entry"
        ]
        is True,
        "predictionLockedBeforeTruth": materialization[
            "predictionLockedBeforeTruthJoin"
        ]
        is True,
    }
    state_checks = {
        "truthTableValidated": parity["caseStateTruthTableValidated"] is True,
        "nativeStateTypes": parity["nativeStateTypesVerified"] is True,
        "availabilityIffRaw": parity["modelPredictionAvailableIffRawFinite"]
        is True,
        "servedMatchesEligibilityAndRaw": parity[
            "servedPredictionMatchesEligibilityAndRaw"
        ]
        is True,
        "abstainedIffServedNull": parity["abstainedIffServedPredictionNull"]
        is True,
        "abstentionReasonReconciled": parity[
            "abstentionReasonPresentIffAbstained"
        ]
        is True,
        "scoreabilityReasonReconciled": parity["scoreabilityReasonReconciled"]
        is True,
        "zeroImputationDisabled": parity["zeroImputationUsed"] is False,
        "intersectionDropDisabled": parity["intersectionDropUsed"] is False,
    }
    seal_attempts = int(seals["sealedBlockAttemptCount"])
    seal_checks = {
        "allSealedRolesRejected": seals["sealedRoleRejectionCount"]
        == seal_attempts,
        "allMasqueradesRejected": seals[
            "developmentRoleMasqueradeRejectionCount"
        ]
        == seal_attempts,
        "sealedBuildersNeverCalled": seals["truthBuilderCallsForThoseBlocks"]
        == 0,
        "developmentControlCalledOnce": seals[
            "developmentGuardSyntheticControlBuilderCalls"
        ]
        == 1,
        "allFinalEntrypointsLoaderSentinelZero": seals[
            "failClosedEntrypointLoaderSentinel"
        ]["developmentLoaderCallCount"]
        == 0
        and seals["failClosedEntrypointLoaderSentinel"]["truthBuilderCallCount"]
        == 0
        and seals["failClosedEntrypointLoaderSentinel"]["allExitedNonzero"]
        is True,
        "finalClosed": seals["finalHoldoutOpened"] is False,
        "embargoClosed": seals["embargoShadowOpened"] is False,
        "deferred60Closed": seals["deferred60MonthLabelsOpened"] is False,
        "priorRowsDevelopmentOnly": prior_seals[
            "allowedDevelopmentRoleSetExact"
        ]
        is True,
        "priorRowsNoSealedIntersection": prior_seals[
            "sealedOriginHorizonIntersectionCount"
        ]
        == 0
        and prior_seals["deferred60MonthCaseCount"] == 0,
    }
    c1 = amendment["C1"]
    spec_checks = {
        "versionExact": amendment["version"] == "calibration-spec-v1.2-amendment",
        "decisionStatusSealed": amendment["decisionStatus"]
        == "not_for_formal_decision",
        "candidateSpaceFrozen": c1[
            "candidateSpaceFrozenBeforeGateAAndBeforeAnyC1OuterResult"
        ]
        is True,
        "candidateCountExact": c1["candidateEnumeration"][
            "expectedTotalCandidateCount"
        ]
        == 148,
        "finalReadForbidden": c1["training"]["finalHoldoutMayBeRead"] is False,
    }
    private_checks = {
        "knownRolesIgnoredAndUntracked": not tracked_private_artifacts(),
        "globalTrackedPrivateScanEmpty": tracked_private_artifacts() == [],
    }
    evidence = {
        "faithfulB0bIdentityConfirmed": identity_checks,
        "incorrectB0bRenamed": rename_checks,
        "comparatorBundleFrozen": comparator_checks,
        "strictPracticalEquivalenceTested": equivalence_checks,
        "full3053DenominatorReported": population_checks,
        "baselineExpectedCaseUniverseExact": parity_checks,
        "futurePerturbationPassed": {
            "futureMatrixPassed": future["passed"] is True,
            "matrixCaseCountExact": future["matrixCaseCount"] == 100,
            "allModelsRoutesHorizonsCovered": all(
                future[key] is True
                for key in (
                    "allCoreHorizonsCovered",
                    "allBaselineModelsCovered",
                    "allRevenueRoutesCovered",
                )
            ),
            "fullStateProjectionInvariant": future[
                "fullPredictionAndStateProjectionInvariant"
            ]
            is True,
            "futureOnlyWorkRejected": future[
                "futureOnlyWholeWorkRejectedByEveryModel"
            ]
            is True,
            "scoreabilityNotPredictorInput": future[
                "scoreabilityStateIsNotAPredictorInput"
            ]
            is True,
            "B4AllParameterRolesInvariant": future[
                "B4AllParameterRolesFutureInvariant"
            ]
            is True,
        },
        "scoreableServedAbstentionPassed": state_checks,
        "allSealsClosed": seal_checks,
        "calibrationSpecV1_2Generated": spec_checks,
        "privateFilesUntracked": private_checks,
    }
    conditions = {name: passed(checks) for name, checks in evidence.items()}
    conditions["allPhaseAValidationPassed"] = False
    return conditions, evidence


def run_baselines() -> dict[str, Any]:
    require_branch()
    require_private_boundaries()
    spec, _v1_1_amendment, amendment = v12.load_and_validate_contract()
    synthetic = v12.synthetic_self_test()
    # Prove every sealed role rejects its builder before any ignored case or
    # authority cache is opened in this process.
    seals = sealed_block_evidence(spec)
    progress("verifying the existing ignored v1.1 case and manifest checkpoint")
    prior_rows, prior_evidence = load_verified_v1_1_rows()
    prior_seals = assert_prior_rows_unsealed(prior_rows, spec)
    progress("loading the authorized 3053-work cache in read-only mode")
    works, posthoc, input_evidence = legacy.load_authorized_works(spec)
    model_inputs = correction.load_verified_model_inputs()

    progress("materializing B0b and B1-B4 through the single v1.2 predict_as_of entry")
    all_rows, materialization = materialize_all_baselines_v12(
        prior_rows, works, spec, input_evidence
    )
    faithful_lock = {
        "predictionFingerprint": materialization["predictionFingerprintsByModel"][
            "B0b"
        ],
        "predictionLockedBeforeTruthJoin": True,
        "outcomeFieldsReadByPredictor": False,
    }
    attach_strata(all_rows, works, posthoc)
    post_strata_fingerprints = prediction_fingerprints_by_model(all_rows)
    if post_strata_fingerprints != materialization["predictionFingerprintsByModel"]:
        raise ReplayV12Error(
            "reporting strata augmentation changed a locked prediction projection"
        )
    materialization["postReportingAugmentationFingerprintsVerified"] = True
    development = forward_rows(all_rows)
    warmup = [
        row
        for row in all_rows
        if row.get("_residual_case_role")
        == "development_warmup_interval_calibration"
    ]
    long_rows = [
        row
        for row in all_rows
        if row.get("_residual_case_role") == "development_long_horizon_audit"
    ]
    seed_rows = [
        row
        for row in all_rows
        if row.get("_residual_case_role") == "development_fold_training_seed"
    ]
    if {str(row["model_id"]) for row in development} != set(MODEL_IDS):
        raise ReplayV12Error("development baseline population is incomplete")
    progress("applying strict earlier-target-available internal intervals")
    correction.apply_corrected_internal_intervals(
        development, [*warmup, *development], spec
    )
    if long_rows:
        correction.apply_corrected_internal_intervals(
            long_rows, [*warmup, *development], spec
        )
    parity = verify_case_and_state_parity(development, works, spec)
    metrics = internal_metrics_by_model(development)
    empirical_leader = min(
        MODEL_IDS,
        key=lambda model: (
            float(metrics[model]["allScoreable"]["wape"]),
            model,
        ),
    )
    progress("running paired work x origin relative block bootstrap")
    bootstrap = v12.paired_relative_block_bootstrap(
        development, empirical_leader, MODEL_IDS, amendment
    )
    selection = v12.select_primary_comparator(
        metrics, bootstrap, amendment, legal_models=MODEL_IDS
    )
    population, private_population = build_population_coverage(
        development, works, model_inputs, spec
    )
    future = future_perturbation_evidence(spec)
    formula = formula_difference_manifest(amendment)
    practical_boundary = v12.practical_equivalence_boundary_self_test(amendment)

    long_audit: dict[str, Any] = {
        "horizonMonths": 36,
        "maySelectModelOrThreshold": False,
        "deferred60MonthLabelsOpened": False,
        "metrics": {},
    }
    for model in MODEL_IDS:
        selected = [
            row
            for row in long_rows
            if row.get("model_id") == model
            and row.get("statisticallyScoreable") is True
        ]
        long_audit["metrics"][model] = (
            _public_metric(v12.metric_rows(selected, "rawModelPrediction"))
            if len(selected) >= PUBLIC_MINIMUM
            and len({v12.strict_case_key(row)[0] for row in selected})
            >= PUBLIC_MINIMUM
            else {"suppressed": True, "minimumCellCount": PUBLIC_MINIMUM}
        )

    now = datetime.now(timezone.utc).isoformat()
    b0a = next(item for item in spec["models"]["baselines"] if item["id"] == "B0a")
    public_metrics = public_metrics_bundle(metrics)
    public_bootstrap = _public_metric(copy.deepcopy(bootstrap))
    identity_report = {
        "schema": "m2.baseline_comparator_identity_correction.v1",
        "version": "M2-baseline-comparator-identity-correction-v1",
        "generatedAt": now,
        "decisionStatus": "not_for_formal_decision",
        "contractBinding": {
            "calibrationSpecV1_2Digest": v12.canonical_digest(amendment),
            "formulaDifferenceManifestDigest": v12.canonical_digest(formula),
        },
        "authority": {
            "standardWorkCount": input_evidence["standardWorkCount"],
            "incomeFactCount": input_evidence["incomeFactCount"],
            "completeIncomeFactCount": input_evidence["completeIncomeFactCount"],
            "databaseRead": False,
        },
        "identityDecision": {
            "faithfulB0b": copy.deepcopy(amendment["modelIdentity"]["B0b"]),
            "renamedB4": copy.deepcopy(amendment["modelIdentity"]["B4"]),
            "historicalBacktestForwardIdentityConflictDisclosed": True,
            "formulaDifferenceManifest": FORMULA_MANIFEST.relative_to(ROOT).as_posix(),
        },
        "B0aHistoricalAuditOnly": {
            "selectionEligible": False,
            "recordedMetrics": copy.deepcopy(b0a["recordedMetrics"]),
        },
        "developmentBaseline": public_metrics,
        "pairedRelativeBlockBootstrap": public_bootstrap,
        "comparatorBundle": _public_metric(selection),
        "practicalEquivalence": copy.deepcopy(amendment["practicalEquivalence"]),
        "practicalEquivalenceExecutableEvidence": practical_boundary,
        "longHorizonAudit": long_audit,
        "integrity": {
            **parity,
            "faithfulPredictionLock": {
                "predictionFingerprint": faithful_lock["predictionFingerprint"],
                "predictionLockedBeforeTruthJoin": True,
                "outcomeFieldsReadByPredictor": False,
            },
            "allBaselineMaterialization": _public_metric(materialization),
            "priorPrivateCheckpointSealEvidence": prior_seals,
            "futurePerturbation": future,
            "scoreableServedAbstentionContract": True,
            "blockedOrAbstainedZeroImputedIntoModelWape": False,
            "currentStatePostHocOnly": True,
        },
        "seals": seals,
        "authorityReadBoundary": {
            "fullAuthorizedIncomeHistoryReadForPostHocPopulationAggregation": True,
            "finalHoldoutOriginHorizonTruthConstructed": False,
            "embargoOriginHorizonTruthConstructed": False,
            "deferred60MonthTruthConstructed": False,
            "fullHistoryPopulationAggregationMaySelectModelOrThreshold": False,
        },
        "publicOutputBoundary": {
            "fields": copy.deepcopy(
                amendment["intervalAndPublicBoundary"]["publicAllowedFields"]
            ),
            "internal80EndpointsPresent": False,
            "automaticOperatingSuggestions": 0,
        },
        "releaseBoundary": {
            "formalDecisionAllowed": False,
            "releaseAllowed": False,
            "C2RC2C3Allowed": False,
            "M3Allowed": False,
        },
    }

    content_conditions, condition_evidence = phase_a_condition_evidence(
        amendment=amendment,
        formula=formula,
        selection=selection,
        bootstrap=bootstrap,
        parity=parity,
        population=population,
        private_population=private_population,
        future=future,
        seals=seals,
        prior_seals=prior_seals,
        materialization=materialization,
        practical_boundary=practical_boundary,
    )
    gate_report = {
        "schema": "m2.calibration_gate_a.content_result.v1",
        "version": "M2-calibration-gate-a-v1",
        "generatedAt": now,
        "decisionStatus": "not_for_formal_decision",
        "gateAContentConditions": content_conditions,
        "conditionEvidence": _public_metric(condition_evidence),
        "phaseACheckpointCommittedAndPushed": {
            "status": "runtime_verification_required_after_first_commit_and_push",
            "selfReferentialCommitShaStoredInTrackedArtifact": False,
        },
        "contentGatePassExceptValidationAndRuntimePush": all(
            value
            for key, value in content_conditions.items()
            if key != "allPhaseAValidationPassed"
        ),
        "C1MayStartNow": False,
        "runtimeReceiptRequired": True,
        "seals": seals,
    }
    ready_report = {
        "schema": "m2.calibration_ready_for_modeling.v1",
        "version": "M2-calibration-ready-for-modeling-v1",
        "generatedAt": now,
        "decisionStatus": "not_for_formal_decision",
        "primaryPerformanceComparator": selection[
            "primaryPerformanceComparator"
        ],
        "gateAContentConditions": copy.deepcopy(content_conditions),
        "phaseACheckpointRuntimeVerificationRequired": True,
        "C1MayStartNow": False,
        "finalHoldoutOpened": False,
        "embargoShadowOpened": False,
        "deferred60MonthLabelsOpened": False,
    }
    design = c1_design_report(amendment)

    progress("writing Chinese de-identified Phase A reports")
    write_json(FORMULA_MANIFEST, formula)
    write_json(IDENTITY_JSON, _public_metric(identity_report))
    write_text(IDENTITY_MD, identity_markdown(_public_metric(identity_report)))
    write_json(POPULATION_JSON, population)
    write_text(POPULATION_MD, population_markdown(population))
    write_json(GATE_A_JSON, gate_report)
    write_json(READY_JSON, ready_report)
    write_text(READY_MD, ready_markdown(ready_report))
    write_json(C1_DESIGN_JSON, design)
    write_text(C1_DESIGN_MD, c1_design_markdown(design))

    public_digests = {
        path.relative_to(ROOT).as_posix(): file_sha256(path)
        for path in (
            FORMULA_MANIFEST,
            IDENTITY_JSON,
            IDENTITY_MD,
            POPULATION_JSON,
            POPULATION_MD,
            GATE_A_JSON,
            READY_JSON,
            READY_MD,
            C1_DESIGN_JSON,
            C1_DESIGN_MD,
        )
    }
    private = write_private_phase_a(
        [*warmup, *seed_rows, *development, *long_rows],
        {
            "schema": "m2.calibration_v1_2.baseline_private_manifest.v1",
            "decisionStatus": "not_for_formal_decision",
            "specDigest": v12.canonical_digest(amendment),
            "inputFingerprint": input_evidence["inputFingerprint"],
            "priorManifestVerified": bool(prior_evidence["manifestRoundTripVerified"]),
            "faithfulB0bPredictionFingerprint": faithful_lock[
                "predictionFingerprint"
            ],
            "allBaselinePredictionFingerprints": materialization[
                "predictionFingerprintsByModel"
            ],
            "allBaselinePredictionsMaterializedThroughV12Entry": True,
            "oldNumericPredictionFieldsUsed": False,
            "predictionLockedBeforeTruthJoin": True,
            "priorCheckpointSealEvidenceDigest": v12.canonical_digest(
                prior_seals
            ),
            "materializationEvidenceDigest": v12.canonical_digest(
                materialization
            ),
            "expectedUniverseFingerprint": parity["expectedUniverseFingerprint"],
            "scoreableUniverseFingerprint": parity["scoreableUniverseFingerprint"],
            "actualFingerprint": parity["actualFingerprint"],
            "publicReportSha256": public_digests,
            "populationPrivateDigest": v12.canonical_digest(private_population),
        },
    )
    evidence_bindings = {
        "specDigest": v12.canonical_digest(amendment),
        "inputFingerprint": input_evidence["inputFingerprint"],
        "privateCaseEvidenceSha256": private["caseEvidenceSha256"],
        **copy.deepcopy(private["derivedBindings"]),
        "materializationEvidenceDigest": v12.canonical_digest(materialization),
        "conditionEvidenceDigest": v12.canonical_digest(condition_evidence),
        "sourceSha256": phase_a_source_digests(),
        "nonSelfPublicEvidenceSha256": non_self_public_evidence_digests(),
        "priorPrivateManifestSha256": file_sha256(PRIVATE_V1_1_MANIFEST),
        "trackedPrivateArtifactCount": 0,
    }
    gate_report["evidenceBindings"] = copy.deepcopy(evidence_bindings)
    ready_report["evidenceBindings"] = copy.deepcopy(evidence_bindings)
    write_json(GATE_A_JSON, gate_report)
    write_json(READY_JSON, ready_report)
    write_text(READY_MD, ready_markdown(ready_report))
    private_verified = rebind_private_phase_a_public_hashes()
    private["manifestSha256"] = private_verified["manifestSha256"]
    return {
        "status": "passed",
        "mode": "phase-a-baseline-replay",
        "decisionStatus": "not_for_formal_decision",
        "primaryPerformanceComparator": selection[
            "primaryPerformanceComparator"
        ],
        "scoreableWorkCount": population["population"]["scoreableWorkCount"],
        "expectedCaseCountPerModel": parity["expectedCaseCountPerModel"],
        "scoreableCaseCountPerModel": parity["scoreableCaseCountPerModel"],
        "gateAContentReady": gate_report[
            "contentGatePassExceptValidationAndRuntimePush"
        ],
        "validationPending": True,
        "phaseACommitPushPending": True,
        "privateEvidence": private,
        "finalHoldoutOpened": False,
    }


PHASE_A_VALIDATION_COMMANDS = [
    "npm run check:no-real-data",
    "npm run lint",
    "npm run build",
    "npm test",
    "npm run smoke",
    "npm run validate:m2:calibration-v1-contract",
    "npm run validate:m2:calibration-v1-1-contract",
    "npm run validate:m2:calibration-v1-2-contract",
    "npm run replay:m2:calibration-v1-2:preflight",
]

PHASE_A_EXPECTED_FAIL_CLOSED_COMMANDS = [
    "npm run replay:m2:calibration-scoring-correction:final-holdout",
    "npm run replay:m2:calibration-baselines:final-holdout",
    "npm run replay:m2:calibration-v1-2:final-holdout",
]


def _validation_process_result(command: str) -> tuple[dict[str, Any], bytes, bytes]:
    parts = command.split()
    if not parts or parts[0] != "npm":
        raise ReplayV12Error(f"unsupported validation command: {command}")
    executable = "npm.cmd" if os.name == "nt" else "npm"
    process = subprocess.run(
        [executable, *parts[1:]],
        cwd=ROOT,
        capture_output=True,
        check=False,
        timeout=900,
    )
    stdout = process.stdout or b""
    stderr = process.stderr or b""
    return {
        "command": command,
        "exitCode": int(process.returncode),
        "stdoutSha256": hashlib.sha256(stdout).hexdigest(),
        "stderrSha256": hashlib.sha256(stderr).hexdigest(),
        "stdoutBytes": len(stdout),
        "stderrBytes": len(stderr),
    }, stdout, stderr


def _validate_recorded_phase_a_receipt(receipt: Mapping[str, Any]) -> None:
    successes = receipt.get("commandResults")
    failures = receipt.get("expectedFailClosedCommandResults")
    if not isinstance(successes, list) or not isinstance(failures, list):
        raise ReplayV12Error("Phase A validation receipt lacks process results")
    sentinel = receipt.get("failClosedEntrypointLoaderSentinel")
    if (
        not isinstance(sentinel, Mapping)
        or sentinel.get("commandsChecked") != 3
        or sentinel.get("allExitedNonzero") is not True
        or sentinel.get("developmentLoaderCallCount") != 0
        or sentinel.get("truthBuilderCallCount") != 0
    ):
        raise ReplayV12Error("Phase A validation receipt lacks a zero-call loader sentinel")
    if [item.get("command") for item in successes] != PHASE_A_VALIDATION_COMMANDS:
        raise ReplayV12Error("Phase A validation success command set differs")
    if [item.get("command") for item in failures] != PHASE_A_EXPECTED_FAIL_CLOSED_COMMANDS:
        raise ReplayV12Error("Phase A fail-closed command set differs")
    required = {
        "command",
        "exitCode",
        "stdoutSha256",
        "stderrSha256",
        "stdoutBytes",
        "stderrBytes",
    }
    if any(set(item) != required for item in [*successes, *failures]):
        raise ReplayV12Error("Phase A validation result shape is not exact")
    if any(int(item["exitCode"]) != 0 for item in successes):
        raise ReplayV12Error("a recorded Phase A validation command did not pass")
    if any(int(item["exitCode"]) == 0 for item in failures):
        raise ReplayV12Error("a recorded final-holdout command did not fail closed")
    for item in [*successes, *failures]:
        if not SHA256.fullmatch(str(item["stdoutSha256"])) or not SHA256.fullmatch(
            str(item["stderrSha256"])
        ):
            raise ReplayV12Error("Phase A validation output digest is invalid")
        if str(item["stdoutSha256"]) == "0" * 64 or str(item["stderrSha256"]) == "0" * 64:
            raise ReplayV12Error("Phase A validation output digest is a placeholder")
        if int(item["stdoutBytes"]) + int(item["stderrBytes"]) <= 0:
            raise ReplayV12Error("Phase A validation process produced no auditable output")


def execute_phase_a_validation_suite() -> tuple[
    list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]
]:
    """Run the frozen success and fail-closed commands and retain process evidence."""

    loader_sentinel = fail_closed_entrypoint_loader_sentinel()
    command_results: list[dict[str, Any]] = []
    for command in PHASE_A_VALIDATION_COMMANDS:
        progress(f"validation: {command}")
        result, stdout, stderr = _validation_process_result(command)
        if result["exitCode"] != 0:
            diagnostic = (stderr or stdout)[-1000:].decode("utf-8", errors="replace")
            raise ReplayV12Error(
                f"Phase A validation failed ({command}, exit={result['exitCode']}): "
                f"{diagnostic}"
            )
        command_results.append(result)
    fail_closed_results: list[dict[str, Any]] = []
    for command in PHASE_A_EXPECTED_FAIL_CLOSED_COMMANDS:
        progress(f"fail-closed validation: {command}")
        result, stdout, stderr = _validation_process_result(command)
        combined = (stdout + b"\n" + stderr).decode("utf-8", errors="replace").lower()
        if (
            result["exitCode"] == 0
            or not any(
                marker in combined
                for marker in ("final holdout", "final_holdout", "final-holdout")
            )
            or (
                command.endswith("calibration-v1-2:final-holdout")
                and "dataloadcalls=0" not in combined.replace(" ", "")
            )
        ):
            raise ReplayV12Error(
                f"final-holdout command did not prove fail-closed before load: {command}"
            )
        if any(
            marker in combined
            for marker in (
                "loading the authorized",
                "loading the verified final model-input cache",
                "building outcome windows",
            )
        ):
            raise ReplayV12Error(
                f"final-holdout command reached a data-load/truth-build marker: {command}"
            )
        fail_closed_results.append(result)
    return command_results, fail_closed_results, loader_sentinel


def validate_gate_ready_semantics(
    gate: Mapping[str, Any],
    ready: Mapping[str, Any],
    *,
    validation_required: bool,
) -> None:
    if (
        gate.get("schema") != "m2.calibration_gate_a.content_result.v1"
        or ready.get("schema") != "m2.calibration_ready_for_modeling.v1"
        or gate.get("decisionStatus") != "not_for_formal_decision"
        or ready.get("decisionStatus") != "not_for_formal_decision"
        or gate.get("C1MayStartNow") is not False
        or ready.get("C1MayStartNow") is not False
        or ready.get("finalHoldoutOpened") is not False
        or ready.get("embargoShadowOpened") is not False
        or ready.get("deferred60MonthLabelsOpened") is not False
    ):
        raise ReplayV12Error("Gate/ready release and seal semantics are invalid")
    expected = {
        item
        for item in v12.load_amendment()["GateA"]["requiredTrueItems"]
        if item != "phaseACheckpointCommittedAndPushed"
    }
    gate_conditions = gate.get("gateAContentConditions")
    ready_conditions = ready.get("gateAContentConditions")
    if (
        not isinstance(gate_conditions, Mapping)
        or set(gate_conditions) != expected
        or dict(gate_conditions) != dict(ready_conditions or {})
    ):
        raise ReplayV12Error("Gate/ready condition schemas or values differ")
    validation_value = gate_conditions.get("allPhaseAValidationPassed")
    if validation_value is not validation_required:
        raise ReplayV12Error("Gate validation state differs from the current phase")
    if any(
        value is not True
        for key, value in gate_conditions.items()
        if key != "allPhaseAValidationPassed"
    ):
        raise ReplayV12Error("a non-validation Gate A content condition is false")
    if not isinstance(gate.get("evidenceBindings"), Mapping) or dict(
        gate["evidenceBindings"]
    ) != dict(ready.get("evidenceBindings") or {}):
        raise ReplayV12Error("Gate/ready evidence bindings are absent or inconsistent")


def finalize_phase_a_validation() -> dict[str, Any]:
    """Execute and bind every Phase A validation before marking the content ready."""

    require_branch()
    required = (
        IDENTITY_JSON,
        POPULATION_JSON,
        READY_JSON,
        FORMULA_MANIFEST,
        GATE_A_JSON,
        C1_DESIGN_JSON,
        PRIVATE_PHASE_A_CASES,
        PRIVATE_PHASE_A_MANIFEST,
    )
    if any(not path.is_file() for path in required):
        raise ReplayV12Error("Phase A artifacts are incomplete")
    status_lines = run_git("status", "--porcelain=v1", "--untracked-files=all").splitlines()
    if any(line.startswith("??") for line in status_lines):
        raise ReplayV12Error(
            "stage every explicit Phase A path before validation; untracked files remain"
        )
    unstaged = subprocess.run(
        ["git", "diff", "--quiet"], cwd=ROOT, capture_output=True, check=False
    )
    if unstaged.returncode != 0:
        raise ReplayV12Error(
            "Phase A finalization requires every intended tracked change staged"
        )
    for path in PUBLIC_PHASE_A_PATHS:
        if not run_git("ls-files", "--", str(path)):
            raise ReplayV12Error(f"Phase A public artifact is not staged/tracked: {path.name}")
    verify_private_phase_a_evidence()
    gate = json.loads(GATE_A_JSON.read_text(encoding="utf-8"))
    ready = json.loads(READY_JSON.read_text(encoding="utf-8"))
    validate_gate_ready_semantics(gate, ready, validation_required=False)
    for key, value in gate["gateAContentConditions"].items():
        if key != "allPhaseAValidationPassed" and value is not True:
            raise ReplayV12Error(f"cannot finalize validation while {key} is false")
    validated_index_tree = run_git("write-tree")
    command_results, fail_closed_results, loader_sentinel = (
        execute_phase_a_validation_suite()
    )
    receipt = {
        "recordedAt": datetime.now(timezone.utc).isoformat(),
        "phaseAStartHead": run_git("rev-parse", "HEAD"),
        "validatedIndexTree": validated_index_tree,
        "allCommandsExitZero": True,
        "commandResults": command_results,
        "expectedFailClosedCommandResults": fail_closed_results,
        "allExpectedFailClosedCommandsExitedNonzeroBeforeDataLoad": True,
        "failClosedEntrypointLoaderSentinel": loader_sentinel,
    }
    _validate_recorded_phase_a_receipt(receipt)
    gate["gateAContentConditions"]["allPhaseAValidationPassed"] = True
    gate["validationReceipt"] = receipt
    gate["contentGatePassExceptRuntimePush"] = all(
        gate["gateAContentConditions"].values()
    )
    ready["gateAContentConditions"]["allPhaseAValidationPassed"] = True
    ready["validationReceipt"] = copy.deepcopy(gate["validationReceipt"])
    ready["contentGatePassExceptRuntimePush"] = True
    write_json(GATE_A_JSON, gate)
    write_json(READY_JSON, ready)
    write_text(READY_MD, ready_markdown(ready))
    rebind_private_phase_a_public_hashes()
    progress("post-finalization contract verification")
    post_result, post_stdout, post_stderr = _validation_process_result(
        "npm run validate:m2:calibration-v1-2-contract"
    )
    if post_result["exitCode"] != 0:
        diagnostic = (post_stderr or post_stdout)[-1000:].decode(
            "utf-8", errors="replace"
        )
        raise ReplayV12Error(
            "post-finalization v1.2 contract verification failed: " + diagnostic
        )
    gate = json.loads(GATE_A_JSON.read_text(encoding="utf-8"))
    ready = json.loads(READY_JSON.read_text(encoding="utf-8"))
    gate["postFinalizationContractVerification"] = post_result
    ready["postFinalizationContractVerification"] = copy.deepcopy(post_result)
    write_json(GATE_A_JSON, gate)
    write_json(READY_JSON, ready)
    write_text(READY_MD, ready_markdown(ready))
    private_evidence = rebind_private_phase_a_public_hashes()
    validate_gate_ready_semantics(
        json.loads(GATE_A_JSON.read_text(encoding="utf-8")),
        json.loads(READY_JSON.read_text(encoding="utf-8")),
        validation_required=True,
    )
    return {
        "status": "passed",
        "phaseAValidationRecorded": True,
        "contentGatePassExceptRuntimePush": True,
        "C1MayStartNow": False,
        "validationCommandCount": len(command_results),
        "failClosedCommandCount": len(fail_closed_results),
        "postFinalizationContractVerificationExitCode": post_result["exitCode"],
        "privateManifestRoundTripVerified": private_evidence[
            "manifestRoundTripVerified"
        ],
        "finalHoldoutOpened": False,
    }


def _without_generated_at(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {
            str(key): _without_generated_at(child)
            for key, child in value.items()
            if key != "generatedAt"
        }
    if isinstance(value, list):
        return [_without_generated_at(child) for child in value]
    return value


def _require_semantic_equal(name: str, observed: Any, expected: Any) -> None:
    if v12.canonical_digest(_without_generated_at(observed)) != v12.canonical_digest(
        _without_generated_at(expected)
    ):
        raise ReplayV12Error(f"runtime recomputation differs from tracked {name}")


def recompute_phase_a_runtime_evidence(
    *, validation_required: bool = True
) -> dict[str, Any]:
    """Rebuild Gate evidence from ignored cases and authorized development inputs."""

    spec, _v1_1_amendment, amendment = v12.load_and_validate_contract()
    # This matrix executes before any ignored outcome row or authority input load.
    seals = sealed_block_evidence(spec)
    gate = json.loads(GATE_A_JSON.read_text(encoding="utf-8"))
    ready = json.loads(READY_JSON.read_text(encoding="utf-8"))
    validate_gate_ready_semantics(
        gate, ready, validation_required=validation_required
    )
    binding = gate["evidenceBindings"]
    if binding.get("specDigest") != v12.canonical_digest(amendment):
        raise ReplayV12Error("tracked Gate spec digest is stale")
    if dict(binding.get("sourceSha256", {})) != phase_a_source_digests():
        raise ReplayV12Error("tracked Gate source hashes differ from the pushed sources")
    if dict(binding.get("nonSelfPublicEvidenceSha256", {})) != (
        non_self_public_evidence_digests()
    ):
        raise ReplayV12Error("tracked Gate non-self report hashes differ")

    private_evidence = verify_private_phase_a_evidence()
    rows = [copy.deepcopy(row) for row in private_evidence.pop("rows")]
    manifest = json.loads(PRIVATE_PHASE_A_MANIFEST.read_text(encoding="utf-8"))
    if manifest.get("inputFingerprint") != binding.get("inputFingerprint"):
        raise ReplayV12Error("private authority fingerprint differs from tracked Gate")
    if manifest.get("materializationEvidenceDigest") != binding.get(
        "materializationEvidenceDigest"
    ):
        raise ReplayV12Error("private materialization digest differs from tracked Gate")
    if file_sha256(PRIVATE_V1_1_MANIFEST) != binding.get(
        "priorPrivateManifestSha256"
    ):
        raise ReplayV12Error("prior verified private manifest changed after replay")

    prior_rows, prior_evidence = load_verified_v1_1_rows()
    prior_seals = assert_prior_rows_unsealed(prior_rows, spec)
    progress("runtime recomputation: loading authorized development inputs read-only")
    works, posthoc, input_evidence = legacy.load_authorized_works(spec)
    model_inputs = correction.load_verified_model_inputs()
    if input_evidence["inputFingerprint"] != binding.get("inputFingerprint"):
        raise ReplayV12Error("authorized development input fingerprint changed")

    stored_strata_fingerprint = binding["strataFingerprint"]
    for row in rows:
        row.pop("strata", None)
    attach_strata(rows, works, posthoc)
    recomputed_bindings = private_case_derived_bindings(rows)
    if recomputed_bindings["strataFingerprint"] != stored_strata_fingerprint:
        raise ReplayV12Error("private reporting strata do not recompute from authority")
    for key in (
        "privateCaseRowCount",
        "roleModelCounts",
        "predictionFingerprintsByModel",
        "expectedUniverseFingerprint",
        "scoreableUniverseFingerprint",
        "actualFingerprint",
        "targetAvailabilityFingerprint",
        "strataFingerprint",
        "internalIntervalFingerprint",
    ):
        if recomputed_bindings[key] != binding[key]:
            raise ReplayV12Error(f"runtime private-case binding differs: {key}")

    development = forward_rows(rows)
    long_rows = [
        row
        for row in rows
        if row.get("_residual_case_role") == "development_long_horizon_audit"
    ]
    parity = verify_case_and_state_parity(development, works, spec)
    for key in (
        "expectedUniverseFingerprint",
        "scoreableUniverseFingerprint",
        "actualFingerprint",
        "targetAvailabilityFingerprint",
    ):
        if parity[key] != binding[key]:
            raise ReplayV12Error(f"independent authority parity differs: {key}")
    metrics = internal_metrics_by_model(development)
    empirical_leader = min(
        MODEL_IDS,
        key=lambda model: (float(metrics[model]["allScoreable"]["wape"]), model),
    )
    bootstrap = v12.paired_relative_block_bootstrap(
        development, empirical_leader, MODEL_IDS, amendment
    )
    selection = v12.select_primary_comparator(
        metrics, bootstrap, amendment, legal_models=MODEL_IDS
    )
    population, private_population = build_population_coverage(
        development, works, model_inputs, spec
    )
    future = future_perturbation_evidence(spec)
    formula = formula_difference_manifest(amendment)
    practical_boundary = v12.practical_equivalence_boundary_self_test(amendment)

    identity = json.loads(IDENTITY_JSON.read_text(encoding="utf-8"))
    tracked_population = json.loads(POPULATION_JSON.read_text(encoding="utf-8"))
    tracked_formula = json.loads(FORMULA_MANIFEST.read_text(encoding="utf-8"))
    tracked_design = json.loads(C1_DESIGN_JSON.read_text(encoding="utf-8"))
    materialization = identity.get("integrity", {}).get(
        "allBaselineMaterialization"
    )
    if not isinstance(materialization, Mapping):
        raise ReplayV12Error("identity report lacks materialization evidence")
    if materialization.get("predictionFingerprintsByModel") != binding.get(
        "predictionFingerprintsByModel"
    ):
        raise ReplayV12Error("identity materialization fingerprints differ from cases")
    if not all(
        materialization.get(key) is expected
        for key, expected in {
            "allBaselinePredictionsMaterializedThroughV12Entry": True,
            "oldNumericPredictionFieldsUsed": False,
            "predictionLockedBeforeTruthJoin": True,
            "guardedTruthRebuiltFromAuthorizedWorks": True,
            "postReportingAugmentationFingerprintsVerified": True,
            "B4SequentialFactorsMatchFullRecomputation": True,
            "B4FullFactorsMatchCommittedArtifact": True,
            "committedArtifactCaseFingerprintVerified": True,
        }.items()
    ):
        raise ReplayV12Error("materialization evidence lacks a required executable proof")

    _require_semantic_equal(
        "baseline metrics", identity["developmentBaseline"], public_metrics_bundle(metrics)
    )
    _require_semantic_equal(
        "paired bootstrap", identity["pairedRelativeBlockBootstrap"], _public_metric(bootstrap)
    )
    _require_semantic_equal(
        "comparator selection", identity["comparatorBundle"], _public_metric(selection)
    )
    _require_semantic_equal("population report", tracked_population, population)
    _require_semantic_equal("formula manifest", tracked_formula, formula)
    _require_semantic_equal("C1 design", tracked_design, c1_design_report(amendment))
    if manifest.get("populationPrivateDigest") != v12.canonical_digest(
        private_population
    ):
        raise ReplayV12Error("private population ledger differs from its replay digest")

    long_metrics: dict[str, Any] = {}
    for model in MODEL_IDS:
        selected = [
            row
            for row in long_rows
            if row.get("model_id") == model
            and row.get("statisticallyScoreable") is True
        ]
        long_metrics[model] = (
            _public_metric(v12.metric_rows(selected, "rawModelPrediction"))
            if len(selected) >= PUBLIC_MINIMUM
            and len({v12.strict_case_key(row)[0] for row in selected})
            >= PUBLIC_MINIMUM
            else {"suppressed": True, "minimumCellCount": PUBLIC_MINIMUM}
        )
    _require_semantic_equal(
        "long-horizon audit metrics",
        identity["longHorizonAudit"]["metrics"],
        long_metrics,
    )

    recomputed_conditions, recomputed_evidence = phase_a_condition_evidence(
        amendment=amendment,
        formula=formula,
        selection=selection,
        bootstrap=bootstrap,
        parity=parity,
        population=population,
        private_population=private_population,
        future=future,
        seals=seals,
        prior_seals=prior_seals,
        materialization=materialization,
        practical_boundary=practical_boundary,
    )
    if v12.canonical_digest(recomputed_evidence) != binding.get(
        "conditionEvidenceDigest"
    ):
        raise ReplayV12Error("independently recomputed Gate evidence digest differs")
    _require_semantic_equal(
        "Gate condition evidence",
        gate["conditionEvidence"],
        _public_metric(recomputed_evidence),
    )
    recomputed_conditions["allPhaseAValidationPassed"] = validation_required
    if dict(gate["gateAContentConditions"]) != recomputed_conditions:
        raise ReplayV12Error("tracked Gate booleans differ from independent recomputation")
    if prior_evidence.get("manifestRoundTripVerified") is not True:
        raise ReplayV12Error("prior v1.1 evidence did not round-trip at runtime")
    return {
        "conditions": recomputed_conditions,
        "conditionEvidenceDigest": v12.canonical_digest(recomputed_evidence),
        "privateCaseEvidenceSha256": private_evidence["caseEvidenceSha256"],
        "privateCaseRowCount": private_evidence["privateCaseRowCount"],
        "predictionFingerprintsByModel": binding["predictionFingerprintsByModel"],
        "expectedUniverseFingerprint": parity["expectedUniverseFingerprint"],
        "scoreableUniverseFingerprint": parity["scoreableUniverseFingerprint"],
        "actualFingerprint": parity["actualFingerprint"],
        "populationPrivateDigest": v12.canonical_digest(private_population),
        "primaryPerformanceComparator": selection["primaryPerformanceComparator"],
        "allSealsClosed": True,
    }


def verify_phase_a_content() -> dict[str, Any]:
    """Independently recompute every pre-validation Gate A content condition."""

    require_branch()
    require_private_boundaries()
    evidence = recompute_phase_a_runtime_evidence(validation_required=False)
    if any(
        value is not True
        for key, value in evidence["conditions"].items()
        if key != "allPhaseAValidationPassed"
    ):
        raise ReplayV12Error("a pre-validation Gate A content condition is false")
    if evidence["conditions"].get("allPhaseAValidationPassed") is not False:
        raise ReplayV12Error("pre-validation Gate A state is not sealed")
    return {
        "status": "passed",
        "gateAContentIndependentlyRecomputed": True,
        "allNonValidationConditionsTrue": True,
        "validationStillPending": True,
        "C1MayStartNow": False,
        "finalHoldoutOpened": False,
    }


def remote_branch_head() -> str:
    process = subprocess.run(
        [
            "git",
            "ls-remote",
            "--heads",
            "origin",
            f"refs/heads/{BRANCH}",
        ],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
        timeout=120,
    )
    if process.returncode != 0:
        raise ReplayV12Error(process.stderr.strip() or "cannot verify remote branch")
    lines = [line for line in process.stdout.splitlines() if line.strip()]
    if len(lines) != 1:
        raise ReplayV12Error("authorized remote branch is absent or ambiguous")
    remote_sha, remote_ref = lines[0].split("\t", 1)
    if remote_ref != f"refs/heads/{BRANCH}" or not re.fullmatch(
        r"[0-9a-f]{40}", remote_sha
    ):
        raise ReplayV12Error("remote branch response is malformed")
    return remote_sha


def verify_gate_a_after_push() -> dict[str, Any]:
    require_branch()
    require_private_boundaries()
    status = run_git("status", "--porcelain=v1", "--untracked-files=all")
    if status:
        raise ReplayV12Error("Gate A runtime verification requires a clean worktree")
    head = run_git("rev-parse", "HEAD")
    parent = run_git("rev-parse", "HEAD^")
    tree = run_git("rev-parse", "HEAD^{tree}")
    if parent != PHASE_A_START_HEAD:
        raise ReplayV12Error("Phase A checkpoint parent is not the authorized start SHA")
    upstream_name = run_git(
        "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"
    )
    if upstream_name != f"origin/{BRANCH}":
        raise ReplayV12Error("tracked upstream is not the authorized current branch")
    upstream = run_git("rev-parse", "@{upstream}")
    if head != upstream:
        raise ReplayV12Error("Phase A checkpoint is not pushed to the tracked branch")
    remote_head = remote_branch_head()
    if head != remote_head:
        raise ReplayV12Error("Phase A checkpoint differs from the actual remote branch")
    gate = json.loads(GATE_A_JSON.read_text(encoding="utf-8"))
    ready = json.loads(READY_JSON.read_text(encoding="utf-8"))
    validate_gate_ready_semantics(gate, ready, validation_required=True)
    _validate_recorded_phase_a_receipt(gate.get("validationReceipt", {}))
    post_result = gate.get("postFinalizationContractVerification", {})
    if (
        post_result.get("command")
        != "npm run validate:m2:calibration-v1-2-contract"
        or post_result.get("exitCode") != 0
        or not SHA256.fullmatch(str(post_result.get("stdoutSha256", "")))
        or not SHA256.fullmatch(str(post_result.get("stderrSha256", "")))
    ):
        raise ReplayV12Error("post-finalization contract verification is missing/invalid")
    _base, _v1_1, amendment = v12.load_and_validate_contract()
    spec_digest = v12.canonical_digest(amendment)
    identity = json.loads(IDENTITY_JSON.read_text(encoding="utf-8"))
    formula = json.loads(FORMULA_MANIFEST.read_text(encoding="utf-8"))
    if identity["contractBinding"]["calibrationSpecV1_2Digest"] != spec_digest:
        raise ReplayV12Error("identity report has a stale calibration-spec digest")
    if identity["contractBinding"]["formulaDifferenceManifestDigest"] != v12.canonical_digest(
        formula
    ):
        raise ReplayV12Error("identity report has a stale formula-manifest digest")
    # Do not trust the pre-commit receipt: execute the complete suite again on
    # the clean, remotely confirmed commit tree.
    command_results, fail_closed_results, loader_sentinel = (
        execute_phase_a_validation_suite()
    )
    runtime_recomputed = recompute_phase_a_runtime_evidence()
    conditions = {
        **runtime_recomputed["conditions"],
        "phaseACheckpointCommittedAndPushed": True,
    }
    receipt = {
        "schema": "m2.calibration_gate_a.runtime_result.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "decisionStatus": "not_for_formal_decision",
        "phaseAHead": head,
        "phaseAParent": parent,
        "phaseATree": tree,
        "remoteHead": remote_head,
        "branch": BRANCH,
        "upstream": upstream_name,
        "calibrationSpecV1_2Digest": spec_digest,
        "sourceSha256": phase_a_source_digests(),
        "publicReportSha256": public_phase_a_digests(),
        "runtimeValidation": {
            "commandResults": command_results,
            "expectedFailClosedCommandResults": fail_closed_results,
            "failClosedEntrypointLoaderSentinel": loader_sentinel,
        },
        "runtimeRecomputation": runtime_recomputed,
        "conditions": conditions,
        "allTrue": all(conditions.values()),
        "C1AuthorizedByGateA": all(conditions.values()),
        "finalHoldoutOpened": False,
        "embargoShadowOpened": False,
        "deferred60MonthLabelsOpened": False,
    }
    if not receipt["allTrue"]:
        raise ReplayV12Error("Gate A runtime result is not all true")
    PRIVATE_DIR.mkdir(parents=True, exist_ok=True)
    PRIVATE_GATE_A_RECEIPT.write_text(
        json.dumps(receipt, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    if run_git("ls-files", "--", str(PRIVATE_GATE_A_RECEIPT)):
        raise ReplayV12Error("runtime Gate receipt entered Git")
    roundtrip = json.loads(PRIVATE_GATE_A_RECEIPT.read_text(encoding="utf-8"))
    if roundtrip != receipt:
        raise ReplayV12Error("runtime Gate receipt failed its write/read round trip")
    return {
        "status": "passed",
        "gateAAllTrue": True,
        "phaseAHead": head,
        "C1AuthorizedByGateA": True,
        "runtimeReceiptTracked": False,
        "remoteHeadVerified": True,
        "runtimeValidationReexecuted": True,
        "runtimeEvidenceIndependentlyRecomputed": True,
        "privateManifestRoundTripVerified": True,
        "publicReportHashesVerified": True,
        "finalHoldoutOpened": False,
    }


def preflight() -> dict[str, Any]:
    require_branch()
    require_private_boundaries()
    spec, _v1_1, amendment = v12.load_and_validate_contract()
    synthetic = v12.synthetic_self_test()
    practical = v12.practical_equivalence_boundary_self_test(amendment)
    future = future_perturbation_evidence(spec)
    seals = sealed_block_evidence(spec)
    return {
        "status": "passed",
        "mode": "synthetic-only",
        "specDigest": v12.canonical_digest(amendment),
        "synthetic": synthetic,
        "practicalEquivalenceBoundary": practical,
        "futurePerturbation": future,
        "seals": seals,
        "privateDataRead": False,
        "finalHoldoutOpened": False,
    }


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--preflight", action="store_true")
    modes.add_argument("--run-baselines", action="store_true")
    modes.add_argument("--verify-phase-a-content", action="store_true")
    modes.add_argument("--finalize-phase-a-validation", action="store_true")
    modes.add_argument("--verify-gate-a-after-push", action="store_true")
    modes.add_argument("--run-final-holdout", action="store_true")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        if args.run_final_holdout:
            raise ReplayV12Error(
                "final holdout is unavailable in the v1.2 baseline/C1 development "
                "runner; dataLoadCalls=0"
            )
        if args.run_baselines:
            result = run_baselines()
        elif args.verify_phase_a_content:
            result = verify_phase_a_content()
        elif args.finalize_phase_a_validation:
            result = finalize_phase_a_validation()
        elif args.verify_gate_a_after_push:
            result = verify_gate_a_after_push()
        else:
            result = preflight()
        print(json.dumps(result, ensure_ascii=False, sort_keys=True))
        return 0
    except (
        ReplayV12Error,
        v12.CalibrationV12Error,
        scoring.ScoringContractError,
        correction.CorrectionError,
        legacy.ReplayError,
        AssertionError,
        ValueError,
    ) as exc:
        print(
            json.dumps({"status": "failed", "reason": str(exc)}, ensure_ascii=False),
            file=sys.stderr,
        )
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
