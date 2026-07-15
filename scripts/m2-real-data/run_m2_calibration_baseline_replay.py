#!/usr/bin/env python3
"""Run the frozen M2 B0a/B0b-B3 calibration baseline replay.

The default mode is a synthetic-only preflight.  Real local data is read only
after an explicit ``--fit-b0b-development-parameters`` or ``--run-development``
flag.  Final-holdout opening is deliberately unavailable in this baseline-only
runner.  It never connects to a database, trains a candidate, changes a release
state, or produces a work/channel identifier in its committable reports.
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
import subprocess
import sys
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

import m2_calibration_v1 as calibration


ROOT = Path(__file__).resolve().parents[2]
SPEC_PATH = ROOT / "src" / "domain" / "oldProductEvaluation" / "calibrationSpec.v1.json"
PRIVATE_DIR = ROOT / "data" / "private-output" / "m2-calibration-v1"
PUBLIC_DIR = ROOT / "docs" / "analysis" / "m2-real-data"
BASELINE_IDS = ("B0b", "B1", "B2", "B3")
FROZEN_REVISION_5_COMMIT = "bbc4563a79dfb8387b93bdd47b898f0a91bb952b"


class ReplayError(RuntimeError):
    """A hard replay boundary was not satisfied."""


def progress(message: str) -> None:
    print(f"[m2-calibration] {message}", file=sys.stderr, flush=True)


def canonical_bytes(value: Any) -> bytes:
    return calibration.canonical_json_bytes(value)


def digest(value: Any) -> str:
    return calibration.sha256_canonical_json(value)


def spec_digest(spec: Mapping[str, Any]) -> str:
    return calibration.spec_digest(spec)


def rounded(value: Any, places: int = 8) -> float | None:
    if value is None:
        return None
    number = float(value)
    return round(number, places) if math.isfinite(number) else None


def round_currency_half_up(value: Any) -> Decimal:
    """Match the frozen bill-cluster currency rule; never use binary/banker's round."""

    try:
        amount = Decimal(str(value))
    except Exception as exc:
        raise ReplayError("batch-cluster amount is not decimal-compatible") from exc
    if not amount.is_finite():
        raise ReplayError("batch-cluster amount is not finite")
    return amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def synthetic_currency_rounding_evidence() -> dict[str, Any]:
    cases = {
        "1.005": 1.01,
        "2.675": 2.68,
        "-1.005": -1.01,
        "0.0049": 0.0,
    }
    observed = {text: float(round_currency_half_up(text)) for text in cases}
    return {
        "method": "Decimal(str(amount)).quantize(Decimal('0.01'), ROUND_HALF_UP)",
        "cases": observed,
        "allExact": observed == cases,
    }


def run_git(*args: str, check: bool = True) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=ROOT,
        text=True,
        encoding="utf-8",
        errors="replace",
        capture_output=True,
        check=False,
    )
    if check and result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        raise ReplayError(f"git {' '.join(args)} failed: {detail}")
    return result.stdout.strip()


def committed_file_bytes(commit: str, path: Path) -> bytes:
    relative = path.relative_to(ROOT).as_posix()
    result = subprocess.run(
        ["git", "show", f"{commit}:{relative}"],
        cwd=ROOT,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise ReplayError(f"commit {commit[:12]} does not contain {relative}")
    return result.stdout


def committed_file_oid(commit: str, path: Path) -> str:
    relative = path.relative_to(ROOT).as_posix()
    return run_git("rev-parse", f"{commit}:{relative}")


def clean_worktree_oid(path: Path) -> str:
    """Return the Git-clean object id, independent of checkout EOL style."""

    relative = path.relative_to(ROOT).as_posix()
    return run_git("hash-object", f"--path={relative}", relative)


def matches_committed_file(commit: str, path: Path) -> bool:
    return committed_file_oid(commit, path) == clean_worktree_oid(path)


def latest_exact_commit(paths: Sequence[Path]) -> str:
    relative = [path.relative_to(ROOT).as_posix() for path in paths]
    commit = run_git("log", "-1", "--format=%H", "--", *relative)
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ReplayError("fit protocol/code must be committed before fitting B0b")
    for path in paths:
        if not matches_committed_file(commit, path):
            raise ReplayError(
                f"current {path.relative_to(ROOT).as_posix()} is not frozen in fit commit {commit[:12]}"
            )
    return commit


def require_clean_worktree() -> None:
    if run_git("status", "--porcelain"):
        raise ReplayError(
            "B0b fit/replay requires a clean worktree with all protocol and code bytes committed"
        )


def revision5_forward_contract(spec: Mapping[str, Any]) -> dict[str, Any]:
    """Validate forward fold geometry without reading any local/private data."""

    protocol = spec["origins"]["forwardValidation"]
    development_blocks = {
        (str(origin), int(horizon), calibration.add_months(str(origin), int(horizon)))
        for horizon, split in spec["origins"]["coreByHorizon"].items()
        for origin in split["development"]
    }
    warmup = list(protocol["warmupOrigins"])
    score_origins = list(protocol["scoreOrigins"])
    if len(set(warmup)) != len(warmup) or warmup != sorted(warmup):
        raise ReplayError("revision-5 warmup origins are not unique and ascending")
    if len(set(score_origins)) != len(score_origins) or score_origins != sorted(score_origins):
        raise ReplayError("revision-5 score origins are not unique and ascending")
    if len(warmup) < int(protocol["minimumPriorDistinctOriginDates"]):
        raise ReplayError("revision-5 forward warmup has too few distinct origins")
    if set(warmup) & set(score_origins):
        raise ReplayError("revision-5 warmup and score origins overlap")

    warmup_contract = protocol["warmupIntervalCalibration"]
    if warmup_contract["predictionMustBeMaterializedBeforeTruthJoin"] is not True:
        raise ReplayError("revision-5 warmup prediction lock is not mandatory")
    if warmup_contract["mayFitPointModelOrChooseHyperparameter"] is not False:
        raise ReplayError("revision-5 warmup may not fit a point model")
    if warmup_contract["maySelectOrScoreComparator"] is not False:
        raise ReplayError("revision-5 warmup may not select or score a comparator")
    if warmup_contract["mayEnterPointMetricGate"] is not False:
        raise ReplayError("revision-5 warmup may not enter point metric gates")
    if warmup_contract["mayEnterBootstrap"] is not False:
        raise ReplayError("revision-5 warmup may not enter bootstrap")
    earliest_score = str(warmup_contract["earliestRequiredScoreOrigin"])
    expected_warmup_blocks = {
        (str(origin), int(horizon))
        for origin, horizons in warmup_contract[
            "expectedAvailableOriginHorizonBlocksAtEarliestRequiredScoreOrigin"
        ].items()
        for horizon in horizons
    }
    available_warmup_blocks = {
        (origin, horizon)
        for origin, horizon, target_end in development_blocks
        if origin in warmup and origin < earliest_score and target_end <= earliest_score
    }
    if available_warmup_blocks != expected_warmup_blocks:
        raise ReplayError("revision-5 earliest warmup residual block set mismatch")
    if len(available_warmup_blocks) != int(
        warmup_contract["expectedAvailableOriginHorizonBlockCountAtEarliestRequiredScoreOrigin"]
    ):
        raise ReplayError("revision-5 earliest warmup residual block count mismatch")

    fold_counts: dict[str, int] = {}
    for fold in protocol["folds"]:
        score_origin = str(fold["scoreOrigin"])
        train_blocks = {
            (origin, horizon)
            for origin, horizon, target_end in development_blocks
            if origin < score_origin and target_end <= score_origin
        }
        expected_count = int(fold["expectedTrainOriginHorizonBlockCount"])
        if len(train_blocks) != expected_count:
            raise ReplayError(
                f"revision-5 forward fold {score_origin} has {len(train_blocks)} "
                f"training blocks, expected {expected_count}"
            )
        test_horizons = sorted(
            horizon
            for origin, horizon, _target_end in development_blocks
            if origin == score_origin
        )
        if test_horizons != sorted(int(value) for value in fold["testHorizons"]):
            raise ReplayError(f"revision-5 forward fold test horizons mismatch: {score_origin}")
        prior_origins = {origin for origin, _horizon in train_blocks}
        if len(prior_origins) < int(protocol["minimumPriorDistinctOriginDates"]):
            raise ReplayError(f"revision-5 forward fold lacks warmup origins: {score_origin}")
        fold_counts[score_origin] = len(train_blocks)
    if list(fold_counts) != score_origins:
        raise ReplayError("revision-5 forward fold order differs from scoreOrigins")
    return {
        "method": protocol["method"],
        "warmupOrigins": warmup,
        "scoreOrigins": score_origins,
        "trainingBlockCountsByScoreOrigin": fold_counts,
        "earliestIntervalResidualBlockCount": len(available_warmup_blocks),
        "earliestIntervalResidualBlocks": [
            {"origin": origin, "horizonMonths": horizon}
            for origin, horizon in sorted(available_warmup_blocks)
        ],
        "strictTargetAvailability": True,
    }


def git_path_is_ignored(path: Path) -> bool:
    relative = path.relative_to(ROOT).as_posix()
    result = subprocess.run(
        ["git", "check-ignore", "-q", relative],
        cwd=ROOT,
        capture_output=True,
        check=False,
    )
    return result.returncode == 0


def fitted_artifact_path(spec: Mapping[str, Any]) -> Path:
    relative = str(spec["freeze"]["fittedParametersArtifact"]["path"])
    path = (ROOT / relative).resolve()
    try:
        path.relative_to(ROOT)
    except ValueError as exc:
        raise ReplayError("fitted-parameter artifact path escapes the repository") from exc
    return path


def preflight(spec: Mapping[str, Any]) -> dict[str, Any]:
    calibration.validate_spec(spec)
    try:
        fixture = calibration.contract_self_test()
    except RuntimeError as exc:
        raise ReplayError(
            "synthetic preflight requires the bundled Python dependencies; "
            "use scripts/run-codex-python.mjs"
        ) from exc
    forward_contract = revision5_forward_contract(spec)
    refit_invariance = synthetic_forward_refit_invariance(spec)
    currency_rounding = synthetic_currency_rounding_evidence()
    report_contract = synthetic_report_shape_privacy_evidence(spec)
    checks = {
        "specValid": True,
        "specRevision5BytesFrozen": matches_committed_file(
            FROZEN_REVISION_5_COMMIT, SPEC_PATH
        ),
        "strictForwardFoldGeometryValid": forward_contract[
            "trainingBlockCountsByScoreOrigin"
        ] == {
            "2020-12": 9,
            "2021-06": 14,
            "2021-12": 19,
            "2022-06": 24,
            "2022-12": 29,
        },
        "B0bForwardRefitFuturePerturbationInvariant": (
            refit_invariance["factorsInvariant"]
            and refit_invariance["oofPointsInvariant"]
        ),
        "intervalWarmupPredictionFingerprintOutcomeInvariant": refit_invariance[
            "warmupPredictionFingerprintInvariantToOutcomePerturbation"
        ],
        "batchClusterCurrencyRoundingHalfUp": currency_rounding["allExact"],
        "committableReportShapeAndPrivacyFailClosed": report_contract[
            "allChecksPass"
        ],
        "syntheticContractChecksPass": all(fixture["checks"].values()),
        "defaultDoesNotLoadPrivateData": True,
        "defaultDoesNotOpenFinalHoldout": True,
        "privateOutputPathIgnored": git_path_is_ignored(PRIVATE_DIR / "preflight-probe.json"),
        "releaseRemainsProhibited": not bool(spec["releaseBoundary"]["releaseAllowed"]),
        "m3RemainsProhibited": not bool(spec["releaseBoundary"]["m3Allowed"]),
        "candidateTrainingNotAuthorized": not bool(spec["models"]["candidateTrainingAuthorizedNow"]),
    }
    if not all(checks.values()):
        raise ReplayError(f"preflight failed: {checks}")
    return {
        "schema": "m2.calibration-baseline-replay.preflight.v1",
        "mode": "preflight",
        "decisionStatus": "not_for_formal_decision",
        "specVersion": spec["version"],
        "specDigest": spec_digest(spec),
        "checks": checks,
        "syntheticEvidence": fixture,
        "forwardProtocolEvidence": forward_contract,
        "B0bForwardRefitEvidence": refit_invariance,
        "batchClusterCurrencyRoundingEvidence": currency_rounding,
        "committableReportContractEvidence": report_contract,
        "nextAllowedModes": [
            "--fit-b0b-development-parameters",
            "--run-development",
        ],
        "fairB0bReplayRequiresFittedArtifact": True,
        "finalHoldoutAvailable": False,
        "finalHoldoutBlockedUntil": (
            "user-approved C1->C2-R->C2->C3 training and a committed candidate artifact"
        ),
    }


def b0b_baseline(spec: Mapping[str, Any]) -> Mapping[str, Any]:
    return next(item for item in spec["models"]["baselines"] if item["id"] == "B0b")


def load_and_validate_fitted_artifact(spec: Mapping[str, Any]) -> tuple[dict[str, Any], Path]:
    path = fitted_artifact_path(spec)
    if not path.is_file():
        raise ReplayError(
            "B0b fitted-parameter artifact is missing; run "
            "--fit-b0b-development-parameters and review/commit it first"
        )
    try:
        artifact = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ReplayError("B0b fitted-parameter artifact is not valid JSON") from exc
    baseline = b0b_baseline(spec)
    fit = baseline["developmentFit"]
    if artifact.get("specDigest") != spec_digest(spec):
        raise ReplayError("B0b fitted-parameter artifact has the wrong canonical spec digest")
    try:
        bound = calibration.apply_fitted_parameters(spec, artifact)
    except (TypeError, ValueError) as exc:
        raise ReplayError(str(exc)) from exc
    if artifact.get("parameterProvenance") != baseline["parameterProvenance"]:
        raise ReplayError("B0b fitted-parameter provenance mismatch")
    if artifact.get("fit", {}).get("caseFingerprintSerialization") != fit["caseFingerprintSerialization"]:
        raise ReplayError("B0b fitted-parameter fingerprint serialization mismatch")
    spec_commit = str(artifact["fit"]["specCommit"])
    fit_code_commit = str(artifact["fit"]["fitCodeCommit"])
    if spec_commit != FROZEN_REVISION_5_COMMIT:
        raise ReplayError("B0b artifact is not bound to the frozen revision-5 spec commit")
    if not matches_committed_file(spec_commit, SPEC_PATH):
        raise ReplayError("B0b artifact specCommit does not contain the current frozen spec bytes")
    for code_path in (Path(__file__).resolve(), Path(calibration.__file__).resolve()):
        if not matches_committed_file(fit_code_commit, code_path):
            raise ReplayError("B0b artifact fitCodeCommit does not contain the current fit code bytes")
    artifact_commit = latest_exact_commit([path])
    if not matches_committed_file(artifact_commit, path):
        raise ReplayError("B0b fitted-parameter artifact bytes are not committed")
    return {
        **artifact,
        "_boundSpec": bound,
        "_artifactCommit": artifact_commit,
    }, path


def eligibility_status(row: Mapping[str, Any]) -> str:
    return str((row.get("eligibility", {}) or {}).get("status", ""))


def development_case_fingerprint(rows: Sequence[Mapping[str, Any]]) -> str:
    """Adapt replay rows to the core frozen case fingerprint contract."""

    payload: list[dict[str, Any]] = []
    keys: list[tuple[str, str, int, str]] = []
    for row in rows:
        key = row["case_key"]
        if row.get("actual") is None or not row.get("target_end"):
            raise ReplayError("case fingerprint requires actual and target_end")
        keys.append(case_key(row))
        payload.append(
            {
                "standard_work_id": str(key["standard_work_id"]),
                "origin": str(key["origin"]),
                "horizon_months": int(key["horizon_months"]),
                "route": str(key["route"]),
                "eligibility_status": eligibility_status(row),
                "target_end": str(row["target_end"]),
                "actual": float(row["actual"]),
            }
        )
    if len(keys) != len(set(keys)):
        raise ReplayError("development case fingerprint input has duplicate aggregate keys")
    return calibration.case_fingerprint(payload)


def interval_warmup_origins(spec: Mapping[str, Any]) -> dict[int, list[str]]:
    """Return only frozen warmup origins that belong to each development horizon."""

    warmup = set(spec["origins"]["forwardValidation"]["warmupOrigins"])
    result = {
        int(horizon): [
            str(origin) for origin in split["development"] if str(origin) in warmup
        ]
        for horizon, split in spec["origins"]["coreByHorizon"].items()
    }
    observed = {origin for origins in result.values() for origin in origins}
    if observed != warmup or any(not origins for origins in result.values()):
        raise ReplayError("frozen interval warmup origins are not represented at every core horizon")
    return result


def interval_warmup_prediction_fingerprint(
    rows: Sequence[Mapping[str, Any]], spec: Mapping[str, Any]
) -> str:
    """Hash the complete warmup prediction population before any truth join."""

    lines: list[str] = []
    seen: set[tuple[str, str, int, str, str]] = set()
    for row in rows:
        if any(
            field in row
            for field in (
                "actual",
                "target_end",
                "label_available_as_of",
                "component_actuals",
                "_component_actual_by_channel",
            )
        ):
            raise ReplayError("interval warmup prediction lock contains outcome fields")
        key = case_key(row)
        model_id = str(row["model_id"])
        lock_key = (*key, model_id)
        if lock_key in seen:
            raise ReplayError("interval warmup prediction lock has a duplicate model case key")
        seen.add(lock_key)
        point = row.get("point_forecast")
        point_text = "NULL" if point is None else calibration.fixed_decimal(point)
        annual = row.get("annual_breakdown", [])
        limitations = calibration.ordered_limitations(row.get("limitation", []), spec)
        if list(row.get("limitation", [])) != limitations:
            raise ReplayError("interval warmup limitation order differs from the frozen contract")
        public = row.get("public_output", {}) or {}
        if public != {
            "pointForecast": point,
            "annualBreakdown": annual,
            "confidence": row.get("confidence"),
            "limitation": limitations,
        }:
            raise ReplayError("interval warmup public output does not reconcile to locked fields")
        fields = [
            key[0],
            key[1],
            str(key[2]),
            key[3],
            eligibility_status(row),
            model_id,
            point_text,
            canonical_bytes(annual).decode("utf-8"),
            str(row.get("confidence", "")),
            canonical_bytes(limitations).decode("utf-8"),
        ]
        lines.append("|".join(unicodedata.normalize("NFC", value) for value in fields))
    return hashlib.sha256("\n".join(sorted(lines)).encode("utf-8")).hexdigest()


def prediction_only_projection(row: Mapping[str, Any]) -> dict[str, Any]:
    """Remove fields that can exist only after the outcome boundary is crossed."""

    outcome_fields = {
        "actual",
        "target_end",
        "label_available_as_of",
        "component_actuals",
        "_component_actual_by_channel",
        "actual_label_uncertain",
        "unseen_sales_channel_count",
        "_residual_case_role",
        "_bill_month_max",
        "_available_as_of",
        "_future_perturbation",
    }
    return {
        key: copy.deepcopy(value)
        for key, value in row.items()
        if key not in outcome_fields
    }


def lock_interval_warmup_predictions(
    predictions: Mapping[str, Sequence[Mapping[str, Any]]],
    spec: Mapping[str, Any],
) -> dict[str, dict[str, Any]]:
    """Materialize model fingerprints before the caller is permitted to join truth."""

    expected_blocks = {
        (str(origin), int(horizon))
        for horizon, origins in interval_warmup_origins(spec).items()
        for origin in origins
    }
    if "B0b" in predictions and "lifecycleFactors" in b0b_baseline(spec):
        raise ReplayError("B0b interval warmup received a bound fitted-factor spec")
    locks: dict[str, dict[str, Any]] = {}
    reference_keys: set[tuple[str, str, int, str]] | None = None
    for model_id, model_rows in predictions.items():
        rows = [
            row
            for row in model_rows
            if (str(row["case_key"]["origin"]), int(row["case_key"]["horizon_months"]))
            in expected_blocks
        ]
        blocks = {
            (str(row["case_key"]["origin"]), int(row["case_key"]["horizon_months"]))
            for row in rows
        }
        if blocks != expected_blocks:
            raise ReplayError(f"{model_id} interval warmup block coverage is incomplete")
        if model_id == "B0b" and any(
            component.get("detail", {}).get("lifecycle") is not None
            and (
                component.get("detail", {}).get("parameterMode")
                != "synthetic_prefit_initial"
                or component.get("detail", {}).get("parameterRole")
                != "interval_warmup_cold_start"
            )
            for row in rows
            for component in row.get("channel_components", [])
        ):
            raise ReplayError(
                "B0b interval warmup did not use its explicit frozen cold-start role"
            )
        keys = {case_key(row) for row in rows}
        if len(keys) != len(rows):
            raise ReplayError(f"{model_id} interval warmup aggregate keys are not unique")
        if reference_keys is None:
            reference_keys = keys
        elif keys != reference_keys:
            raise ReplayError("interval warmup case-key parity failed before truth join")
        locks[str(model_id)] = {
            "predictionFingerprint": interval_warmup_prediction_fingerprint(rows, spec),
            "predictionPopulationCount": len(rows),
            "predictionOriginHorizonBlockCount": len(blocks),
            "predictionLockedBeforeTruthJoin": True,
            "usesOutcomeLabelsForPrediction": False,
            "_caseKeys": keys,
        }
    if not locks:
        raise ReplayError("interval warmup prediction lock population is empty")
    return locks


def interval_warmup_case_fingerprint(rows: Sequence[Mapping[str, Any]]) -> str:
    """Hash numeric warmup cases after a development-safe truth join."""

    lines: list[str] = []
    seen: set[tuple[str, str, int, str]] = set()
    for row in rows:
        key = case_key(row)
        if key in seen:
            raise ReplayError("interval warmup truth population has a duplicate aggregate key")
        seen.add(key)
        if eligibility_status(row) != "forecastable_numeric":
            raise ReplayError("interval warmup case fingerprint contains a blocked case")
        if row.get("point_forecast") is None or row.get("actual") is None:
            raise ReplayError("interval warmup case fingerprint requires numeric point and actual")
        target_end = str(row.get("target_end", ""))
        available = str(row.get("label_available_as_of", ""))
        if not target_end or not available:
            raise ReplayError("interval warmup case fingerprint lacks label availability")
        fields = [
            key[0],
            key[1],
            str(key[2]),
            key[3],
            eligibility_status(row),
            target_end,
            available,
            calibration.fixed_decimal(row["actual"]),
        ]
        lines.append("|".join(unicodedata.normalize("NFC", value) for value in fields))
    return hashlib.sha256("\n".join(sorted(lines)).encode("utf-8")).hexdigest()


def complete_interval_warmup_evidence(
    joined_rows: Sequence[dict[str, Any]],
    locks: Mapping[str, Mapping[str, Any]],
    spec: Mapping[str, Any],
) -> dict[str, dict[str, Any]]:
    """Join-safe warmup case evidence; warmup stays interval-only thereafter."""

    horizons = [int(value) for value in spec["backtest"]["coreHorizonsMonths"]]
    warmup_blocks = {
        (str(origin), int(horizon))
        for horizon, origins in interval_warmup_origins(spec).items()
        for origin in origins
    }
    evidence: dict[str, dict[str, Any]] = {}
    for model_id, lock in locks.items():
        model_rows = [
            row
            for row in joined_rows
            if str(row["model_id"]) == model_id
            and (
                str(row["case_key"]["origin"]),
                int(row["case_key"]["horizon_months"]),
            )
            in warmup_blocks
        ]
        keys = {case_key(row) for row in model_rows}
        if keys != set(lock["_caseKeys"]) or len(keys) != len(model_rows):
            raise ReplayError(f"{model_id} interval warmup truth join changed case keys")
        for row in model_rows:
            row["label_available_as_of"] = str(
                row.get("label_available_as_of")
                or row.get("_available_as_of")
                or row["target_end"]
            )
            row["_residual_case_role"] = "development_warmup_interval_calibration"
        if interval_warmup_prediction_fingerprint(
            [prediction_only_projection(row) for row in model_rows],
            spec,
        ) != lock["predictionFingerprint"]:
            raise ReplayError(f"{model_id} interval warmup prediction changed during truth join")
        numeric = [
            row
            for row in model_rows
            if eligibility_status(row) == "forecastable_numeric"
            and row.get("point_forecast") is not None
            and row.get("actual") is not None
        ]
        counts, origin_count, origin_counts = scope_counts(numeric, horizons)
        evidence[model_id] = {
            "predictionFingerprint": str(lock["predictionFingerprint"]),
            "predictionPopulationCount": int(lock["predictionPopulationCount"]),
            "predictionOriginHorizonBlockCount": int(
                lock["predictionOriginHorizonBlockCount"]
            ),
            "caseFingerprint": interval_warmup_case_fingerprint(numeric),
            "caseCount": len(numeric),
            "caseCountByHorizon": counts,
            "originCount": origin_count,
            "originCountByHorizon": origin_counts,
            "predictionLockedBeforeTruthJoin": True,
            "usesOutcomeLabelsForPrediction": False,
            "rows": model_rows,
        }
    return evidence


def interval_warmup_availability_evidence(
    evidence: Mapping[str, Mapping[str, Any]], spec: Mapping[str, Any]
) -> dict[str, Any]:
    """Prove the earliest required PI fold has the nine frozen residual blocks."""

    contract = spec["origins"]["forwardValidation"]["warmupIntervalCalibration"]
    score_origin = str(contract["earliestRequiredScoreOrigin"])
    expected_blocks = {
        (str(origin), int(horizon))
        for origin, horizons in contract[
            "expectedAvailableOriginHorizonBlocksAtEarliestRequiredScoreOrigin"
        ].items()
        for horizon in horizons
    }
    by_model: dict[str, Any] = {}
    for model_id, item in evidence.items():
        available_rows = [
            row
            for row in item["rows"]
            if eligibility_status(row) == "forecastable_numeric"
            and row.get("point_forecast") is not None
            and str(row["case_key"]["origin"]) < score_origin
            and str(row["target_end"]) <= score_origin
            and str(row["label_available_as_of"]) <= score_origin
        ]
        blocks = {
            (
                str(row["case_key"]["origin"]),
                int(row["case_key"]["horizon_months"]),
            )
            for row in available_rows
        }
        if blocks != expected_blocks:
            raise ReplayError(
                f"{model_id} earliest interval warmup residual blocks differ from revision 5"
            )
        by_model[model_id] = {
            "predictionFingerprint": item["predictionFingerprint"],
            "predictionPopulationCount": item["predictionPopulationCount"],
            "fullPredictionOriginHorizonBlockCount": item[
                "predictionOriginHorizonBlockCount"
            ],
            "caseFingerprint": item["caseFingerprint"],
            "caseCount": item["caseCount"],
            "caseCountByHorizon": dict(item["caseCountByHorizon"]),
            "originCount": item["originCount"],
            "originCountByHorizon": dict(item["originCountByHorizon"]),
            "earliestAvailableResidualCaseCount": len(available_rows),
            "earliestAvailableOriginHorizonBlockCount": len(blocks),
            "predictionLockedBeforeTruthJoin": True,
            "usesOutcomeLabelsForPrediction": False,
        }
    return {
        "role": "development_warmup_interval_calibration",
        "firstRequiredScoreOrigin": score_origin,
        "fullPredictionOriginHorizonBlockCount": sum(
            len(origins) for origins in interval_warmup_origins(spec).values()
        ),
        "expectedAvailableOriginHorizonBlockCount": len(expected_blocks),
        "availableOriginHorizonBlocksExactForEveryModel": True,
        "mayEnterPointMetricGate": False,
        "maySelectOrScoreComparator": False,
        "mayEnterBootstrap": False,
        "mayCalibrateFrozenInternalInterval": True,
        "byModel": by_model,
    }


def validate_artifact_case_fingerprint(
    artifact: Mapping[str, Any], rows: Sequence[Mapping[str, Any]]
) -> str:
    actual = development_case_fingerprint(rows)
    expected = str(artifact["fit"]["fitCaseFingerprint"])
    if actual != expected:
        raise ReplayError(
            "B0b fitted-parameter development case fingerprint mismatch; fair replay is blocked"
        )
    expected_count = int(artifact["fit"]["fitCaseCount"])
    if expected_count != len(rows):
        raise ReplayError("B0b fitted-parameter development case count mismatch")
    return actual


def load_authorized_works(spec: Mapping[str, Any]) -> tuple[list[dict[str, Any]], dict[str, dict[str, str]], dict[str, Any]]:
    """Read the verified local cache only; never rebuild, export, or invoke a DB."""

    # Deliberately lazy: importing the legacy loader in preflight would make the
    # default command depend on private local roles.
    try:
        import run_m2_formal_execution_payload as formal  # pylint: disable=import-outside-toplevel
    except ImportError as exc:
        raise ReplayError(
            "authorized cache replay dependencies are unavailable; use scripts/run-codex-python.mjs"
        ) from exc

    progress("loading the verified final model-input cache in read-only mode")
    cache_path = formal.MODEL_CACHE_PATH
    if not cache_path.is_file():
        raise ReplayError(
            "verified local model-input cache is missing; provide the authorized private roles "
            "(final bill, fixed foundation, formal basic-info input, mapping payload and overlay) "
            "and use a separately authorized cache workflow; this runner will not rebuild it"
        )
    try:
        expected_signature = formal.model_cache_signature()
    except (OSError, SystemExit, ValueError) as exc:
        raise ReplayError(
            "the authorized private input roles needed to verify the local model-input cache "
            "are missing or invalid; this runner will not fabricate or rebuild them"
        ) from exc
    try:
        with cache_path.open("rb") as handle:
            cached = pickle.load(handle)
    except (OSError, EOFError, pickle.PickleError, AttributeError, ValueError, TypeError) as exc:
        raise ReplayError(
            "verified local model-input cache is unreadable; this runner will not overwrite it"
        ) from exc
    if not isinstance(cached, Mapping) or cached.get("signature") != expected_signature:
        raise ReplayError(
            "verified local model-input cache is stale or has a signature mismatch; "
            "this runner will not rebuild or overwrite it"
        )
    model_inputs = cached.get("modelInputs")
    if not isinstance(model_inputs, Mapping):
        raise ReplayError("verified local model-input cache payload is invalid")
    scope = model_inputs["scopeReconciliation"]
    required_scope_checks = ("scopeFullyAligned", "rowCountConserved", "incomeAmountConserved")
    if not all(bool(scope.get(name)) for name in required_scope_checks):
        raise ReplayError("verified model-input scope reconciliation is not fully closed")
    mapped = model_inputs["mappedBill"]
    latest = str(spec["authority"]["latestCompleteMonth"])
    valid = mapped[mapped["validForCalibration"].astype(bool)].copy()
    complete = valid[valid["billMonth"].astype(str) <= latest].copy()
    complete["standardWorkId"] = complete["standardWorkId"].astype(str)
    complete["businessForm"] = complete["businessForm"].fillna("unknown").astype(str)
    complete["billMonth"] = complete["billMonth"].astype(str).str.slice(0, 7)
    complete["amount"] = complete["amount"].astype(float)

    def clean_scalar(value: Any) -> str:
        try:
            if bool(formal.pd.isna(value)):
                return ""
        except (TypeError, ValueError):
            pass
        return str(value).strip()

    # mappedBill.channelKey is only the raw channel id and can merge unrelated
    # missing-id channels.  Reproduce the formal fact identity algorithm in
    # memory without writing a fact payload or retaining the raw id/name.
    required_channel_columns = {"渠道ID", "文学库渠道名称"}
    if not required_channel_columns.issubset(set(complete.columns)):
        raise ReplayError("mapped bill is missing the channel identity columns")
    channel_keys = []
    for raw_id_value, name_value in zip(complete["渠道ID"], complete["文学库渠道名称"]):
        raw_name = clean_scalar(name_value) or "未提供渠道名称"
        raw_id = clean_scalar(raw_id_value)
        if not raw_id:
            raw_id = f"missing-{formal.stable_hash(raw_name)[:16]}"
        channel_keys.append(formal.stable_hash([raw_id, raw_name])[:24])
    complete["_calibrationChannelKey"] = channel_keys

    expected_facts = int(spec["authority"]["incomeFactCount"])
    expected_complete = int(spec["authority"]["completeIncomeFactCountThroughLatestCompleteMonth"])
    if len(valid) != expected_facts or len(complete) != expected_complete:
        raise ReplayError(
            f"income scope mismatch: valid={len(valid)} complete={len(complete)} "
            f"expected={expected_facts}/{expected_complete}"
        )
    if len(valid) != len(mapped):
        raise ReplayError("mapped bill contains facts outside the validated calibration scope")

    positive = complete[complete["amount"] > 0].copy()
    positive["_amountRounded2"] = positive["amount"].map(
        round_currency_half_up
    )
    cluster_counts = (
        positive.groupby(["billMonth", "_amountRounded2"])["standardWorkId"]
        .nunique()
        .to_dict()
    )
    positive["_clusterSize"] = [
        int(cluster_counts.get((str(month), amount), 1))
        for month, amount in zip(positive["billMonth"], positive["_amountRounded2"])
    ]
    batch_lookup = (
        positive.groupby(
            ["standardWorkId", "_calibrationChannelKey", "businessForm", "billMonth"],
            dropna=False,
        )["_clusterSize"]
        .max()
        .to_dict()
    )
    batch_by_channel: dict[tuple[str, str, str], dict[str, int]] = defaultdict(dict)
    for (sid, channel, form, month), size in batch_lookup.items():
        batch_by_channel[(str(sid), str(channel), str(form))][str(month)] = int(size)

    channels_by_work: dict[str, list[dict[str, Any]]] = defaultdict(list)
    fingerprint_rows: list[dict[str, Any]] = []
    grouped = complete.groupby(
        ["standardWorkId", "_calibrationChannelKey", "businessForm"], dropna=False, sort=True
    )
    for (work_id, channel_key, business_form), frame in grouped:
        work_id = str(work_id)
        channel_key = str(channel_key).strip() or "missing-channel"
        business_form = str(business_form).strip() or "unknown"
        monthly_series = frame.groupby("billMonth")["amount"].sum().sort_index()
        monthly = {str(month): float(amount) for month, amount in monthly_series.items()}
        batch = batch_by_channel.get((work_id, channel_key, business_form), {})
        # channel_component_key in the kernel adds business_form, preserving the
        # frozen (work, channel, form) unit even when channel ids repeat.
        channels_by_work[work_id].append(
            {
                "channel_key": channel_key,
                "business_form": business_form,
                "first_observed_month": str(frame["billMonth"].min()),
                "monthly": monthly,
                "batch_cluster_sizes": batch,
            }
        )
        fingerprint_rows.append(
            {
                "standardWorkId": work_id,
                "channelKey": channel_key,
                "businessForm": business_form,
                "firstObservedMonth": str(frame["billMonth"].min()),
                "monthly": monthly,
                "batchClusterSizes": batch,
            }
        )

    foundation = model_inputs["foundation"]
    formal_input = model_inputs["formalInput"]
    work_ids = sorted(str(item) for item in foundation)
    if len(work_ids) != int(spec["authority"]["standardWorkCount"]):
        raise ReplayError(f"foundation scope mismatch: {len(work_ids)} works")
    formal_ids = {str(item) for item in formal_input}
    evaluated_ids = set(model_inputs["evaluated"]["standardWorkId"].astype(str))
    if set(work_ids) != formal_ids or set(work_ids) != evaluated_ids:
        raise ReplayError("foundation/formal-input/evaluated ID parity failed")
    missing_bill_scope = sorted(set(channels_by_work) - set(work_ids))
    if missing_bill_scope:
        raise ReplayError("mapped bill contains work ids outside the frozen foundation")

    source_values = {"出版物", "网文"}
    shelf_values = {"已上架", "已下架"}
    rights_values = {"版权有效", "无限期", "版权已到期"}
    term_values = {"exact_date", "perpetual", "relative_term", "year_only", "expired_unknown_date"}
    posthoc: dict[str, dict[str, str]] = {}
    works: list[dict[str, Any]] = []
    for work_id in work_ids:
        foundation_record = foundation.get(work_id, {}) or {}
        formal_record = formal_input.get(work_id, {}) or {}
        foundation_source = str(foundation_record.get("一级分类", "")).strip()
        formal_source = str(formal_record.get("一级分类", "")).strip()
        source = formal_source or foundation_source
        shelf = str(formal_record.get("作品状态", "")).strip()
        rights = str(formal_record.get("音频版权状态", "")).strip()
        term_type = str(formal_record.get("版权到期类型", "")).strip()
        if foundation_source != formal_source:
            raise ReplayError("formal input and foundation source classification differ")
        if source not in source_values or shelf not in shelf_values or rights not in rights_values or term_type not in term_values:
            raise ReplayError("post-hoc source/shelf/rights/term-type contract is incomplete")
        posthoc[work_id] = {
            "source": source,
            "shelf_status": shelf,
            "rights_status": rights,
            "rights_term_type": term_type,
        }
        works.append(
            {
                "standard_work_id": work_id,
                "channels": sorted(
                    channels_by_work.get(work_id, []),
                    key=calibration.channel_component_key,
                ),
            }
        )

    component_keys: set[tuple[str, str]] = set()
    aggregated_amount = 0.0
    for work in works:
        for channel in work["channels"]:
            component = (str(work["standard_work_id"]), calibration.channel_component_key(channel))
            if component in component_keys:
                raise ReplayError("duplicate calibration channel component")
            component_keys.add(component)
            for month, amount in channel["monthly"].items():
                if str(month) > latest or not math.isfinite(float(amount)):
                    raise ReplayError("calibration cube contains an invalid month or amount")
                aggregated_amount += float(amount)
    source_amount = float(complete["amount"].sum())
    if not math.isclose(aggregated_amount, source_amount, rel_tol=0.0, abs_tol=1e-5):
        raise ReplayError("calibration cube amount does not reconcile to complete income facts")

    evidence = {
        "standardWorkCount": len(works),
        "incomeFactCount": len(valid),
        "completeIncomeFactCount": len(complete),
        "latestCompleteMonth": latest,
        "completeAmount": rounded(complete["amount"].sum()),
        "cubeAmountReconciles": True,
        "inputFingerprint": digest(sorted(fingerprint_rows, key=lambda row: (
            row["standardWorkId"], row["channelKey"], row["businessForm"]
        ))),
        "loader": "verified_final_model_input_cache_read_only",
        "modelInputCacheReadOnly": True,
        "databaseRead": False,
    }
    return works, posthoc, evidence


def development_origins(spec: Mapping[str, Any]) -> dict[int, list[str]]:
    return {
        int(horizon): list(split["development"])
        for horizon, split in spec["origins"]["coreByHorizon"].items()
    }


def long_audit_origins(spec: Mapping[str, Any], *, development_safe_only: bool) -> tuple[dict[int, list[str]], dict[int, list[str]]]:
    if not development_safe_only:
        raise ReplayError("the baseline runner may open development-safe long-audit labels only")
    cutoff = str(spec["origins"]["crossHorizonPurge"]["developmentTargetEndOnOrBefore"])
    included: dict[int, list[str]] = {}
    deferred: dict[int, list[str]] = {}
    for horizon_text, origins in spec["origins"]["longAuditByHorizon"].items():
        horizon = int(horizon_text)
        if horizon == 36:
            included[horizon] = [
                origin for origin in origins if calibration.add_months(origin, horizon) <= cutoff
            ]
            deferred[horizon] = [origin for origin in origins if origin not in included[horizon]]
        else:
            included[horizon] = []
            deferred[horizon] = list(origins)
    if included.get(60):
        raise ReplayError("60-month labels must remain closed in the baseline runner")
    if any(
        calibration.add_months(origin, horizon) > cutoff
        for horizon, origins in included.items()
        for origin in origins
    ):
        raise ReplayError("a deferred long-audit label crossed the development purge boundary")
    return included, deferred


def generate_predictions(
    works: Sequence[Mapping[str, Any]],
    origins_by_horizon: Mapping[int, Sequence[str]],
    spec: Mapping[str, Any],
    model_ids: Sequence[str] = BASELINE_IDS,
    *,
    b0b_parameter_role: str | None = None,
) -> dict[str, list[dict[str, Any]]]:
    results: dict[str, list[dict[str, Any]]] = {}
    for model_id in model_ids:
        progress(f"predicting {model_id}")
        rows: list[dict[str, Any]] = []
        for horizon in sorted(origins_by_horizon):
            for origin in origins_by_horizon[horizon]:
                for work in works:
                    if not calibration.work_exists_as_of(work, str(origin)):
                        continue
                    rows.append(
                        calibration.predict_as_of(
                            work,
                            str(origin),
                            int(horizon),
                            model_id,
                            spec,
                            long_horizon_evidence=False,
                            b0b_parameter_role=(
                                b0b_parameter_role if model_id == "B0b" else None
                            ),
                        )
                    )
        results[model_id] = rows
    if len(results) >= 2:
        calibration.assert_case_key_parity(results)
    return results


def case_key(row: Mapping[str, Any]) -> tuple[str, str, int, str]:
    key = row["case_key"]
    return (
        str(key["standard_work_id"]),
        str(key["origin"]),
        int(key["horizon_months"]),
        str(key["route"]),
    )


def join_truth(
    results: Mapping[str, Sequence[Mapping[str, Any]]],
    works: Sequence[Mapping[str, Any]],
    spec: Mapping[str, Any],
) -> list[dict[str, Any]]:
    """Join outcomes only after every prediction in ``results`` already exists."""

    work_lookup = {str(work["standard_work_id"]): work for work in works}
    if not results:
        return []
    first_model = next(iter(results))
    truth: dict[tuple[str, str, int, str], dict[str, Any]] = {}
    progress("building outcome windows after prediction materialization")
    for row in results[first_model]:
        key = case_key(row)
        truth_row = calibration.build_truth_window(
            work_lookup[key[0]], key[1], key[2], key[3], spec
        )
        component_actual_by_channel: dict[str, float] = {}
        for component in truth_row.get("component_actuals", []):
            channel_key = str(component.get("channel_key", ""))
            if channel_key in component_actual_by_channel:
                raise ReplayError("duplicate component actual returned by the core kernel")
            if component.get("known_resolved_at_origin"):
                component_actual_by_channel[channel_key] = float(component["actual"])
        truth_row["_component_actual_by_channel"] = component_actual_by_channel
        truth[key] = truth_row
    joined: list[dict[str, Any]] = []
    for model_id in results:
        for source in results[model_id]:
            row = copy.deepcopy(source)
            row.update(truth[case_key(row)])
            joined.append(row)
    return joined


def numeric_b0b_fit_rows(rows: Sequence[Mapping[str, Any]]) -> list[Mapping[str, Any]]:
    return [
        row
        for row in rows
        if row.get("model_id") == "B0b"
        and eligibility_status(row) == "forecastable_numeric"
        and row.get("point_forecast") is not None
        and row.get("actual") is not None
    ]


def fit_metrics(predictions: Sequence[float], actuals: Sequence[float]) -> dict[str, Any]:
    return {
        "caseCount": len(predictions),
        "wape": rounded(calibration.wape(predictions, actuals)),
        "signedAggregateBias": rounded(calibration.signed_aggregate_bias(predictions, actuals)),
        "actualTotal": rounded(sum(float(value) for value in actuals)),
        "predictedTotal": rounded(sum(float(value) for value in predictions)),
    }


def fixed_prediction_value(value: Any) -> float:
    """Canonical eight-decimal scoring precision used by materialized predict_as_of."""

    return float(calibration.fixed_decimal(value))


def monotonic_factors_valid(factors: Mapping[str, float], constraints: Sequence[str], tolerance: float) -> bool:
    for expression in constraints:
        match = re.fullmatch(r"([a-z_]+)<=([a-z_]+)", str(expression))
        if not match:
            raise ReplayError(f"unsupported B0b monotonic constraint: {expression}")
        left, right = match.groups()
        if float(factors[left]) > float(factors[right]) + tolerance:
            return False
    return True


def build_fit_matrix(rows: Sequence[Mapping[str, Any]], lifecycle_order: Sequence[str]) -> dict[str, Any]:
    try:
        import numpy as np  # pylint: disable=import-outside-toplevel
    except Exception as exc:
        raise ReplayError(
            "B0b fitting requires the bundled Python dependencies; use scripts/run-codex-python.mjs"
        ) from exc
    numeric = list(numeric_b0b_fit_rows(rows))
    if not numeric:
        raise ReplayError("B0b development fit has no numeric cases")
    actual = np.asarray([float(row["actual"]) for row in numeric], dtype=float)
    fixed = np.zeros(len(numeric), dtype=float)
    component_index: dict[str, list[int]] = {stage: [] for stage in lifecycle_order}
    component_unfactored: dict[str, list[float]] = {stage: [] for stage in lifecycle_order}
    component_cap: dict[str, list[float]] = {stage: [] for stage in lifecycle_order}
    component_actual: dict[str, list[float]] = {stage: [] for stage in lifecycle_order}
    initial_from_components = np.zeros(len(numeric), dtype=float)
    for index, row in enumerate(numeric):
        for component in row.get("channel_components", []):
            detail = component.get("detail", {}) or {}
            stage = detail.get("lifecycle")
            if stage in component_index:
                unfactored = float(detail.get("unfactoredPoint", 0.0))
                cap_value = detail.get("lowRevenueGuardCap")
                cap = math.inf if cap_value is None else float(cap_value)
                channel_key = str(component.get("channel_key", ""))
                actual_by_channel = row.get("_component_actual_by_channel", {}) or {}
                if channel_key not in actual_by_channel:
                    raise ReplayError(
                        "B0b lifecycle component is missing its target component actual"
                    )
                component_index[stage].append(index)
                component_unfactored[stage].append(unfactored)
                component_cap[stage].append(cap)
                component_actual[stage].append(float(actual_by_channel[channel_key]))
                initial_from_components[index] += min(unfactored, cap)
            else:
                value = float(component.get("point_forecast", 0.0))
                fixed[index] += value
                initial_from_components[index] += value
    expected = np.asarray([float(row["point_forecast"]) for row in numeric], dtype=float)
    # This check is valid only when initial factors are all one.  Bound replay
    # still uses the same templates, but its current component totals differ.
    initial_mode = all(
        component.get("detail", {}).get("parameterMode") == "synthetic_prefit_initial"
        for row in numeric
        for component in row.get("channel_components", [])
        if component.get("detail", {}).get("lifecycle") in component_index
    )
    if initial_mode and not np.allclose(initial_from_components, expected, rtol=1e-9, atol=1e-6):
        raise ReplayError("B0b fit component templates do not reconcile to initial predictions")
    components = {}
    for stage in lifecycle_order:
        components[stage] = {
            "caseIndex": np.asarray(component_index[stage], dtype=np.int32),
            "unfactored": np.asarray(component_unfactored[stage], dtype=float),
            "cap": np.asarray(component_cap[stage], dtype=float),
            "actual": np.asarray(component_actual[stage], dtype=float),
        }
    return {
        "rows": numeric,
        "actual": actual,
        "fixed": fixed,
        "components": components,
        "origins": [str(row["case_key"]["origin"]) for row in numeric],
        "horizons": [int(row["case_key"]["horizon_months"]) for row in numeric],
        "np": np,
    }


def stage_contribution(matrix: Mapping[str, Any], stage: str, factor: float) -> Any:
    np = matrix["np"]
    component = matrix["components"][stage]
    if len(component["caseIndex"]) == 0:
        return np.zeros(len(matrix["actual"]), dtype=float)
    values = np.minimum(component["unfactored"] * float(factor), component["cap"])
    return np.bincount(
        component["caseIndex"], weights=values, minlength=len(matrix["actual"])
    ).astype(float)


def predict_fit_matrix(matrix: Mapping[str, Any], factors: Mapping[str, float]) -> Any:
    prediction = matrix["fixed"].copy()
    for stage, factor in factors.items():
        prediction += stage_contribution(matrix, stage, float(factor))
    return prediction


def lifecycle_support(
    matrix: Mapping[str, Any],
    stages: Sequence[str],
    protocol: Mapping[str, Any],
) -> dict[str, dict[str, Any]]:
    denominator = float(
        sum(
            abs(float(value))
            for stage in stages
            for value in matrix["components"][stage]["actual"]
        )
    )
    support: dict[str, dict[str, Any]] = {}
    for stage in stages:
        component = matrix["components"][stage]
        supported_component_positions = [
            position
            for position, value in enumerate(component["unfactored"])
            if float(value) > 0
        ]
        case_indices = [
            int(component["caseIndex"][position])
            for position in supported_component_positions
        ]
        origins = {matrix["origins"][index] for index in case_indices}
        actual_share = (
            sum(
                abs(float(component["actual"][position]))
                for position in supported_component_positions
            )
            / denominator
            if denominator > 0 else 0.0
        )
        reported_share = rounded(actual_share) or 0.0
        supported = (
            len(supported_component_positions)
            >= int(protocol["minimumTrainingCasesPerLifecycleFactor"])
            and len(origins) >= int(protocol["minimumTrainingOriginsPerLifecycleFactor"])
            and actual_share + 1e-12
            >= float(protocol["minimumActualRevenueSharePerLifecycleFactor"])
        )
        support[stage] = {
            "componentCaseCount": len(supported_component_positions),
            "distinctOriginCount": len(origins),
            "absoluteActualRevenueShare": reported_share,
            "supported": supported,
        }
    return support


def candidate_objective(prediction: Any, actual: Any) -> tuple[float, float]:
    denominator = float(sum(abs(value) for value in actual))
    actual_total = float(sum(actual))
    if denominator <= 0 or actual_total <= 0:
        raise ReplayError("B0b fit objective has a non-positive actual denominator")
    wape_value = float(sum(abs(prediction - actual)) / denominator)
    bias_value = abs(float((sum(prediction) - actual_total) / actual_total))
    return wape_value, bias_value


def objective_candidate_better(
    candidate: tuple[float, float, float, float],
    incumbent: tuple[float, float, float, float] | None,
    tolerance: float,
) -> bool:
    if incumbent is None:
        return True
    for index, (left, right) in enumerate(zip(candidate, incumbent)):
        if index < 2:
            if left < right - tolerance:
                return True
            if left > right + tolerance:
                return False
        elif left != right:
            return left < right
    return False


def fit_b0b_matrix(matrix: Mapping[str, Any], spec: Mapping[str, Any]) -> dict[str, Any]:
    fit = b0b_baseline(spec)["developmentFit"]
    protocol = fit["oofComparatorProtocol"]
    stages = list(fit["lifecycleOrder"])
    precision = int(fit["factorPrecisionDecimals"])
    tolerance = float(fit["comparisonTolerance"])
    factors = {key: round(float(value), precision) for key, value in fit["initialFactors"].items()}
    support = lifecycle_support(matrix, stages, protocol)
    unsupported_value = round(float(protocol["unsupportedFactorValue"]), precision)
    for stage in stages:
        if not support[stage]["supported"]:
            factors[stage] = unsupported_value
    if not monotonic_factors_valid(factors, fit["monotonicConstraints"], tolerance):
        raise ReplayError("B0b initial/support factors violate frozen monotonic constraints")
    current = predict_fit_matrix(matrix, factors)
    passes = 0
    converged = False
    for pass_index in range(1, int(fit["maximumPasses"]) + 1):
        changed = False
        for stage in stages:
            if not support[stage]["supported"]:
                continue
            base_without_stage = current - stage_contribution(matrix, stage, factors[stage])
            best_factor = factors[stage]
            best_prediction = current
            best_objective: tuple[float, float, float, float] | None = None
            for value in fit["factorGrid"]:
                candidate_factor = round(float(value), precision)
                candidate_factors = {**factors, stage: candidate_factor}
                if not monotonic_factors_valid(
                    candidate_factors, fit["monotonicConstraints"], tolerance
                ):
                    continue
                prediction = base_without_stage + stage_contribution(
                    matrix, stage, candidate_factor
                )
                wape_value, bias_value = candidate_objective(prediction, matrix["actual"])
                objective = (
                    wape_value,
                    bias_value,
                    abs(candidate_factor - 1.0),
                    candidate_factor,
                )
                if objective_candidate_better(objective, best_objective, tolerance):
                    best_objective = objective
                    best_factor = candidate_factor
                    best_prediction = prediction
            if best_objective is None:
                raise ReplayError(f"B0b coordinate has no feasible factor: {stage}")
            if not math.isclose(best_factor, factors[stage], rel_tol=0.0, abs_tol=tolerance):
                changed = True
            factors[stage] = best_factor
            current = best_prediction
        passes = pass_index
        if not changed:
            converged = True
            break
    if not converged:
        raise ReplayError("B0b deterministic coordinate fit did not converge")
    predictions = [float(value) for value in current]
    actuals = [float(value) for value in matrix["actual"]]
    return {
        "factors": factors,
        "passes": passes,
        "support": support,
        "predictions": predictions,
        "metrics": fit_metrics(predictions, actuals),
    }


def synthetic_forward_fit_rows(spec: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Build identifier-free-in-output synthetic cases for fold-refit invariance."""

    target_factors = {
        "inactive": 0.2,
        "long_tail": 0.4,
        "declining": 0.6,
        "stable": 0.9,
        "growth": 1.2,
        "rebound": 1.0,
        "insufficient_history": 0.8,
    }
    stages = list(b0b_baseline(spec)["developmentFit"]["lifecycleOrder"])
    rows: list[dict[str, Any]] = []
    for horizon_text, split in spec["origins"]["coreByHorizon"].items():
        horizon = int(horizon_text)
        for origin in split["development"]:
            target_end = calibration.add_months(origin, horizon)
            for work_index in range(24):
                components = []
                component_actuals: dict[str, float] = {}
                for stage_index, stage in enumerate(stages):
                    channel_key = f"synthetic-{stage}"
                    unfactored = float(5 + 2 * ((work_index + 2 * stage_index) % 7))
                    components.append(
                        {
                            "channel_key": channel_key,
                            "point_forecast": unfactored,
                            "detail": {
                                "lifecycle": stage,
                                "unfactoredPoint": unfactored,
                                "lowRevenueGuardCap": None,
                                "parameterMode": "synthetic_prefit_initial",
                                "parameterRole": (
                                    "interval_warmup_cold_start"
                                    if origin
                                    in spec["origins"]["forwardValidation"][
                                        "warmupOrigins"
                                    ]
                                    else "prefit_development_template"
                                ),
                            },
                        }
                    )
                    component_actuals[channel_key] = (
                        unfactored * target_factors[stage]
                    )
                synthetic_point = sum(
                    float(component["point_forecast"])
                    for component in components
                )
                synthetic_annual = [
                    {
                        "year": target_end[:4],
                        "amount": round(synthetic_point, 2),
                    }
                ]
                rows.append(
                    {
                        "model_id": "B0b",
                        "case_key": {
                            "standard_work_id": f"synthetic-work-{work_index:02d}",
                            "origin": origin,
                            "horizon_months": horizon,
                            "route": "pure_sales_share",
                        },
                        "route": "pure_sales_share",
                        "eligibility": {
                            "eligible": True,
                            "status": "forecastable_numeric",
                        },
                        "point_forecast": synthetic_point,
                        "annual_breakdown": synthetic_annual,
                        "confidence": "medium",
                        "limitation": [],
                        "public_output": {
                            "pointForecast": synthetic_point,
                            "annualBreakdown": synthetic_annual,
                            "confidence": "medium",
                            "limitation": [],
                        },
                        "channel_components": components,
                        "actual": sum(component_actuals.values()),
                        "target_end": target_end,
                        "_component_actual_by_channel": component_actuals,
                        "_bill_month_max": target_end,
                        "_available_as_of": target_end,
                    }
                )
    return rows


def synthetic_fold_snapshot(
    rows: Sequence[Mapping[str, Any]], score_origin: str, spec: Mapping[str, Any]
) -> dict[str, Any]:
    fit = b0b_baseline(spec)["developmentFit"]
    factor_routes = set(fit["factorEligibleRoutes"])
    train = [
        row
        for row in numeric_b0b_fit_rows(rows)
        if str(row["route"]) in factor_routes
        and fold_label_available(row, score_origin)
    ]
    held = [
        row
        for row in numeric_b0b_fit_rows(rows)
        if str(row["case_key"]["origin"]) == score_origin
    ]
    if not train or not held:
        raise ReplayError("synthetic forward fold has an empty train or score population")
    fitted = fit_b0b_matrix(build_fit_matrix(train, fit["lifecycleOrder"]), spec)
    held_matrix = build_fit_matrix(held, fit["lifecycleOrder"])
    predictions = predict_fit_matrix(held_matrix, fitted["factors"])
    return {
        "factors": dict(fitted["factors"]),
        "points": {
            case_key(row): fixed_prediction_value(point)
            for row, point in zip(held_matrix["rows"], predictions)
        },
        "trainingCaseCount": len(train),
        "trainingMaximumTargetEnd": max(str(row["target_end"]) for row in train),
    }


def synthetic_forward_refit_invariance(spec: Mapping[str, Any]) -> dict[str, Any]:
    """Prove unavailable future labels cannot alter fold factors or OOF points."""

    base_rows = synthetic_forward_fit_rows(spec)
    warmup_origin_set = set(
        spec["origins"]["forwardValidation"]["warmupOrigins"]
    )
    warmup_control = [
        prediction_only_projection(row)
        for row in base_rows
        if str(row["case_key"]["origin"]) in warmup_origin_set
    ]
    label_perturbed = copy.deepcopy(base_rows)
    for row in label_perturbed:
        row["actual"] = float(row["actual"]) * 13.0 + 991.0
        for channel_key in row["_component_actual_by_channel"]:
            row["_component_actual_by_channel"][channel_key] = (
                float(row["_component_actual_by_channel"][channel_key]) * 13.0
                + 991.0
            )
    warmup_perturbed = [
        prediction_only_projection(row)
        for row in label_perturbed
        if str(row["case_key"]["origin"]) in warmup_origin_set
    ]
    warmup_control_fingerprint = interval_warmup_prediction_fingerprint(
        warmup_control, spec
    )
    warmup_perturbed_fingerprint = interval_warmup_prediction_fingerprint(
        warmup_perturbed, spec
    )
    fold_evidence: dict[str, Any] = {}
    for score_origin in spec["origins"]["forwardValidation"]["scoreOrigins"]:
        control = copy.deepcopy(base_rows)
        delayed_until = calibration.add_months(str(score_origin), 1)
        # A subset of otherwise target-complete labels is explicitly not yet
        # available; both control and perturbation must exclude it.
        for row in control:
            if (
                str(row["case_key"]["standard_work_id"]).endswith("00")
                and str(row["case_key"]["origin"]) < str(score_origin)
                and str(row["target_end"]) <= str(score_origin)
            ):
                row["_available_as_of"] = delayed_until
                row["_bill_month_max"] = delayed_until
        perturbed = copy.deepcopy(control)
        perturbed_count = 0
        for row in perturbed:
            if fold_label_available(row, str(score_origin)):
                continue
            row["_future_perturbation"] = {
                "bill_month": delayed_until,
                "available_as_of": delayed_until,
            }
            component_actuals = row["_component_actual_by_channel"]
            for channel_key in component_actuals:
                component_actuals[channel_key] = (
                    float(component_actuals[channel_key]) * 11.0 + 777.0
                )
            row["actual"] = sum(float(value) for value in component_actuals.values())
            perturbed_count += 1
        control_snapshot = synthetic_fold_snapshot(control, str(score_origin), spec)
        perturbed_snapshot = synthetic_fold_snapshot(
            perturbed, str(score_origin), spec
        )
        factors_equal = control_snapshot["factors"] == perturbed_snapshot["factors"]
        points_equal = control_snapshot["points"] == perturbed_snapshot["points"]
        if not factors_equal or not points_equal:
            raise ReplayError(
                f"synthetic future perturbation changed B0b fold {score_origin}"
            )
        fold_evidence[str(score_origin)] = {
            "factorsInvariant": factors_equal,
            "oofPointsInvariant": points_equal,
            "trainingCaseCount": control_snapshot["trainingCaseCount"],
            "trainingMaximumTargetEnd": control_snapshot[
                "trainingMaximumTargetEnd"
            ],
            "futureRowsPerturbed": perturbed_count,
        }
    return {
        "refitsEveryFold": True,
        "futureBillMonthPerturbed": True,
        "futureAvailableAsOfPerturbed": True,
        "futureTargetLabelsPerturbed": True,
        "factorsInvariant": all(
            item["factorsInvariant"] for item in fold_evidence.values()
        ),
        "oofPointsInvariant": all(
            item["oofPointsInvariant"] for item in fold_evidence.values()
        ),
        "warmupPredictionFingerprintInvariantToOutcomePerturbation": (
            warmup_control_fingerprint == warmup_perturbed_fingerprint
        ),
        "warmupPredictionFingerprint": warmup_control_fingerprint,
        "folds": fold_evidence,
    }


def scope_counts(
    rows: Sequence[Mapping[str, Any]], core_horizons: Sequence[int]
) -> tuple[dict[str, int], int, dict[str, int]]:
    counts: dict[str, int] = {}
    origin_counts: dict[str, int] = {}
    for horizon in core_horizons:
        selected = [
            row
            for row in rows
            if int(row["case_key"]["horizon_months"]) == int(horizon)
        ]
        counts[str(horizon)] = len(selected)
        origin_counts[str(horizon)] = len(
            {str(row["case_key"]["origin"]) for row in selected}
        )
    return counts, len({str(row["case_key"]["origin"]) for row in rows}), origin_counts


def oof_prediction_fingerprint(
    rows: Sequence[Mapping[str, Any]],
    predictions: Mapping[tuple[str, str, int, str], float],
) -> str:
    records: list[dict[str, Any]] = []
    for row in rows:
        key = case_key(row)
        if key not in predictions:
            raise ReplayError("OOF prediction fingerprint is missing a comparator key")
        records.append(
            {
                "standard_work_id": key[0],
                "origin": key[1],
                "horizon_months": key[2],
                "route": key[3],
                "eligibility_status": eligibility_status(row),
                "point": calibration.fixed_decimal(predictions[key]),
            }
        )
    records.sort(
        key=lambda item: (
            item["standard_work_id"],
            item["origin"],
            item["horizon_months"],
            item["route"],
        )
    )
    return calibration.sha256_canonical_json(records)


def fold_label_available(row: Mapping[str, Any], score_origin: str) -> bool:
    """Apply every frozen synthetic/real label-availability boundary."""

    origin = str(row["case_key"]["origin"])
    target_end = str(row["target_end"])
    bill_month_max = str(row.get("_bill_month_max", target_end))
    available_as_of = str(row.get("_available_as_of", target_end))
    return (
        origin < score_origin
        and target_end <= score_origin
        and bill_month_max <= score_origin
        and available_as_of <= score_origin
    )


def b0b_fit_evidence(rows: Sequence[Mapping[str, Any]], spec: Mapping[str, Any]) -> dict[str, Any]:
    fit = b0b_baseline(spec)["developmentFit"]
    protocol = fit["oofComparatorProtocol"]
    forward = spec["origins"]["forwardValidation"]
    revision5_forward_contract(spec)
    all_b0b = [
        row
        for row in rows
        if row.get("model_id") == "B0b" and row.get("actual") is not None
    ]
    numeric = list(numeric_b0b_fit_rows(all_b0b))
    factor_routes = set(fit["factorEligibleRoutes"])
    factor_rows = [row for row in numeric if str(row["route"]) in factor_routes]
    if not factor_rows:
        raise ReplayError("B0b development fit has no factor-eligible sales-route cases")
    if any(str(row.get("target_end")) > str(fit["maximumTargetEnd"]) for row in all_b0b):
        raise ReplayError("B0b development fit would read a target past the purge boundary")
    if list(protocol["scoreOrigins"]) != list(forward["scoreOrigins"]):
        raise ReplayError("B0b score origins differ from the frozen forward protocol")
    if list(protocol["warmupOrigins"]) != list(forward["warmupOrigins"]):
        raise ReplayError("B0b warmup origins differ from the frozen forward protocol")

    # Pure-buyout rows stay in the fit/comparator fingerprints and metrics, but
    # only sales-bearing component rows influence lifecycle factors.
    full_factor_matrix = build_fit_matrix(factor_rows, fit["lifecycleOrder"])
    full_fit = fit_b0b_matrix(full_factor_matrix, spec)
    full_comparator_matrix = build_fit_matrix(numeric, fit["lifecycleOrder"])
    full_comparator_predictions = [
        fixed_prediction_value(value)
        for value in predict_fit_matrix(full_comparator_matrix, full_fit["factors"])
    ]

    fold_by_origin = {str(item["scoreOrigin"]): item for item in forward["folds"]}
    oof_prediction_by_key: dict[tuple[str, str, int, str], float] = {}
    comparator_rows: list[Mapping[str, Any]] = []
    fold_passes: dict[str, int] = {}
    fold_factors: dict[str, dict[str, float]] = {}
    fold_training_counts: dict[str, int] = {}
    fold_training_max_target_end: dict[str, str] = {}
    minimum_prior_origins = int(forward["minimumPriorDistinctOriginDates"])
    for score_origin in forward["scoreOrigins"]:
        score_origin = str(score_origin)
        fold = fold_by_origin.get(score_origin)
        if fold is None:
            raise ReplayError(f"missing frozen forward fold: {score_origin}")
        expected_horizons = sorted(int(value) for value in fold["testHorizons"])
        held_all = [
            row
            for row in all_b0b
            if str(row["case_key"]["origin"]) == score_origin
        ]
        held_horizons = sorted(
            {int(row["case_key"]["horizon_months"]) for row in held_all}
        )
        if held_horizons != expected_horizons:
            raise ReplayError(f"B0b forward test horizon mismatch: {score_origin}")
        train_universe = [
            row
            for row in all_b0b
            if fold_label_available(row, score_origin)
        ]
        block_count = len(
            {
                (
                    str(row["case_key"]["origin"]),
                    int(row["case_key"]["horizon_months"]),
                )
                for row in train_universe
            }
        )
        if block_count != int(fold["expectedTrainOriginHorizonBlockCount"]):
            raise ReplayError(
                f"B0b forward training block mismatch at {score_origin}: {block_count}"
            )
        train = [
            row
            for row in factor_rows
            if fold_label_available(row, score_origin)
        ]
        prior_origins = {str(row["case_key"]["origin"]) for row in train}
        if len(prior_origins) < minimum_prior_origins:
            raise ReplayError(f"B0b forward fold has too few prior origins: {score_origin}")
        held = [
            row
            for row in held_all
            if eligibility_status(row) == "forecastable_numeric"
        ]
        if not train or not held:
            raise ReplayError(f"B0b forward fold is empty: {score_origin}")
        if any(row.get("point_forecast") is None for row in held):
            raise ReplayError("forecastable B0b forward case has a null point")
        fold_matrix = build_fit_matrix(train, fit["lifecycleOrder"])
        fold_fit = fit_b0b_matrix(fold_matrix, spec)
        held_matrix = build_fit_matrix(held, fit["lifecycleOrder"])
        held_predictions = predict_fit_matrix(held_matrix, fold_fit["factors"])
        fold_passes[score_origin] = int(fold_fit["passes"])
        fold_factors[score_origin] = dict(fold_fit["factors"])
        fold_training_counts[score_origin] = len(train)
        fold_training_max_target_end[score_origin] = max(
            str(row["target_end"]) for row in train
        )
        if fold_training_max_target_end[score_origin] > score_origin:
            raise ReplayError("B0b forward fold read a label not available at score origin")
        for row, prediction in zip(held_matrix["rows"], held_predictions):
            key = case_key(row)
            if key in oof_prediction_by_key:
                raise ReplayError("B0b forward prediction key duplicated across folds")
            oof_prediction_by_key[key] = fixed_prediction_value(prediction)
            comparator_rows.append(row)

    comparator_key_set = {case_key(row) for row in comparator_rows}
    if comparator_key_set != set(oof_prediction_by_key):
        raise ReplayError("B0b forward predictions do not exactly cover comparator keys")
    if len(comparator_key_set) != len(comparator_rows):
        raise ReplayError("B0b forward comparator keys are not unique")

    oof_predictions = [oof_prediction_by_key[case_key(row)] for row in comparator_rows]
    comparator_actuals = [float(row["actual"]) for row in comparator_rows]
    fit_actuals = [float(row["actual"]) for row in numeric]
    core_horizons = [int(value) for value in spec["backtest"]["coreHorizonsMonths"]]
    oof_by_horizon: dict[str, Any] = {}
    final_by_horizon: dict[str, Any] = {}
    for horizon in core_horizons:
        comparator_indices = [
            index
            for index, row in enumerate(comparator_rows)
            if int(row["case_key"]["horizon_months"]) == horizon
        ]
        fit_indices = [
            index
            for index, row in enumerate(numeric)
            if int(row["case_key"]["horizon_months"]) == horizon
        ]
        oof_by_horizon[str(horizon)] = fit_metrics(
            [oof_predictions[index] for index in comparator_indices],
            [comparator_actuals[index] for index in comparator_indices],
        )
        final_by_horizon[str(horizon)] = fit_metrics(
            [full_comparator_predictions[index] for index in fit_indices],
            [fit_actuals[index] for index in fit_indices],
        )
    fit_counts, fit_origin_count, fit_origin_counts = scope_counts(
        numeric, core_horizons
    )
    comparator_counts, comparator_origin_count, comparator_origin_counts = scope_counts(
        comparator_rows, core_horizons
    )
    return {
        "numericRows": numeric,
        "comparatorRows": comparator_rows,
        "fitCaseFingerprint": development_case_fingerprint(numeric),
        "comparatorCaseFingerprint": development_case_fingerprint(comparator_rows),
        "oofPredictionFingerprint": oof_prediction_fingerprint(
            comparator_rows, oof_prediction_by_key
        ),
        "fitCaseCount": len(numeric),
        "fitCaseCountByHorizon": fit_counts,
        "fitOriginCount": fit_origin_count,
        "fitOriginCountByHorizon": fit_origin_counts,
        "comparatorCaseCount": len(comparator_rows),
        "comparatorCaseCountByHorizon": comparator_counts,
        "comparatorOriginCount": comparator_origin_count,
        "comparatorOriginCountByHorizon": comparator_origin_counts,
        "fullFit": full_fit,
        "oofPredictionByKey": oof_prediction_by_key,
        "oofMetrics": {
            "overall": fit_metrics(oof_predictions, comparator_actuals),
            "byHorizon": oof_by_horizon,
        },
        "finalFitDiagnosticMetrics": {
            "overall": fit_metrics(full_comparator_predictions, fit_actuals),
            "byHorizon": final_by_horizon,
        },
        "foldPasses": fold_passes,
        "foldFactors": fold_factors,
        "foldTrainingCaseCountsByScoreOrigin": fold_training_counts,
        "foldTrainingMaximumTargetEndByScoreOrigin": fold_training_max_target_end,
    }


def build_fitted_artifact(
    spec: Mapping[str, Any],
    evidence: Mapping[str, Any],
    input_evidence: Mapping[str, Any],
) -> dict[str, Any]:
    baseline = b0b_baseline(spec)
    fit = baseline["developmentFit"]
    protocol = fit["oofComparatorProtocol"]
    forward = spec["origins"]["forwardValidation"]
    spec_commit = latest_exact_commit([SPEC_PATH])
    if spec_commit != FROZEN_REVISION_5_COMMIT:
        raise ReplayError("B0b fit is not bound to frozen calibration revision 5")
    fit_code_commit = latest_exact_commit(
        [Path(__file__).resolve(), Path(calibration.__file__).resolve()]
    )
    grid_digest = digest(fit["factorGrid"])
    oof_overall = evidence["oofMetrics"]["overall"]
    artifact = {
        "schema": spec["freeze"]["fittedParametersArtifact"]["schema"],
        "version": "calibration-fitted-parameters-v1",
        "decisionStatus": "not_for_formal_decision",
        "specVersion": spec["version"],
        "specRevision": int(spec["preHoldoutRevision"]),
        "specDigest": spec_digest(spec),
        "parameterProvenance": baseline["parameterProvenance"],
        "fit": {
            "baselineId": "B0b",
            "fitStatus": "complete",
            "caseRole": fit["caseRole"],
            "maximumTargetEnd": fit["maximumTargetEnd"],
            "excludedRoles": list(fit["excludedRoles"]),
            "algorithm": fit["algorithm"],
            "randomSeed": int(spec["randomSeed"]),
            "factorGridDigest": grid_digest,
            "caseKeyFields": list(spec["caseKeys"]["aggregateFields"]),
            "caseFingerprintSerialization": fit["caseFingerprintSerialization"],
            "fitCaseFingerprint": evidence["fitCaseFingerprint"],
            "fitCaseCount": int(evidence["fitCaseCount"]),
            "fitCaseCountByHorizon": dict(evidence["fitCaseCountByHorizon"]),
            "fitOriginCount": int(evidence["fitOriginCount"]),
            "fitOriginCountByHorizon": dict(evidence["fitOriginCountByHorizon"]),
            "comparatorCaseFingerprint": evidence["comparatorCaseFingerprint"],
            "comparatorCaseCount": int(evidence["comparatorCaseCount"]),
            "comparatorCaseCountByHorizon": dict(
                evidence["comparatorCaseCountByHorizon"]
            ),
            "comparatorOriginCount": int(evidence["comparatorOriginCount"]),
            "comparatorOriginCountByHorizon": dict(
                evidence["comparatorOriginCountByHorizon"]
            ),
            "oofPredictionFingerprint": evidence["oofPredictionFingerprint"],
            "intervalWarmupCaseFingerprint": evidence["intervalWarmup"][
                "caseFingerprint"
            ],
            "intervalWarmupPredictionFingerprint": evidence["intervalWarmup"][
                "predictionFingerprint"
            ],
            "intervalWarmupCaseCount": int(
                evidence["intervalWarmup"]["caseCount"]
            ),
            "intervalWarmupCaseCountByHorizon": dict(
                evidence["intervalWarmup"]["caseCountByHorizon"]
            ),
            "intervalWarmupOriginCount": int(
                evidence["intervalWarmup"]["originCount"]
            ),
            "intervalWarmupOriginCountByHorizon": dict(
                evidence["intervalWarmup"]["originCountByHorizon"]
            ),
            "intervalWarmupPredictionLockedBeforeTruthJoin": True,
            "intervalWarmupUsesOutcomeLabelsForPrediction": False,
            "authoritativeInputSignatureSha256": input_evidence["inputFingerprint"],
            "specCommit": spec_commit,
            "fitCodeCommit": fit_code_commit,
            "passes": int(evidence["fullFit"]["passes"]),
            "usesEmbargoShadowLabels": False,
            "usesFinalHoldoutLabels": False,
            "usesLongHorizonAuditLabels": False,
            "legacyFactorsReused": False,
            "developmentWape": oof_overall["wape"],
            "developmentSignedAggregateBias": oof_overall["signedAggregateBias"],
            "forwardValidationMethod": forward["method"],
            "foldUnit": forward["foldUnit"],
            "warmupOrigins": list(forward["warmupOrigins"]),
            "scoreOrigins": list(forward["scoreOrigins"]),
            "foldTrainingCaseCountsByScoreOrigin": dict(
                evidence["foldTrainingCaseCountsByScoreOrigin"]
            ),
            "foldTrainingMaximumTargetEndByScoreOrigin": dict(
                evidence["foldTrainingMaximumTargetEndByScoreOrigin"]
            ),
            "trainingTargetEndRule": forward["trainCasePredicate"],
            "usesOnlyStrictlyAvailableLabels": True,
            "oofComparatorScoreUsed": True,
            "minimumTrainingCasesPerLifecycleFactor": int(
                protocol["minimumTrainingCasesPerLifecycleFactor"]
            ),
            "minimumTrainingOriginsPerLifecycleFactor": int(
                protocol["minimumTrainingOriginsPerLifecycleFactor"]
            ),
            "minimumActualRevenueSharePerLifecycleFactor": float(
                protocol["minimumActualRevenueSharePerLifecycleFactor"]
            ),
            "unsupportedFactorValue": float(protocol["unsupportedFactorValue"]),
            "finalFactorsFitScope": protocol["finalFactorsFitAfterOofScoring"],
        },
        "B0b": {
            "lifecycleThresholds": copy.deepcopy(baseline["lifecycleThresholds"]),
            "lifecycleFactors": dict(evidence["fullFit"]["factors"]),
            "oofComparatorMetrics": copy.deepcopy(evidence["oofMetrics"]),
            "finalFitDiagnosticMetrics": copy.deepcopy(
                evidence["finalFitDiagnosticMetrics"]
            ),
            "lifecycleSupport": copy.deepcopy(evidence["fullFit"]["support"]),
        },
    }
    try:
        calibration.apply_fitted_parameters(spec, artifact)
    except (TypeError, ValueError) as exc:
        raise ReplayError(f"generated fitted artifact failed core validation: {exc}") from exc
    return artifact


def write_fitted_artifact(spec: Mapping[str, Any], artifact: Mapping[str, Any]) -> tuple[Path, str]:
    path = fitted_artifact_path(spec)
    path.parent.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(
        artifact, ensure_ascii=False, indent=2, sort_keys=True, allow_nan=False
    ).encode("utf-8") + b"\n"
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("wb") as handle:
        handle.write(encoded)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)
    if path.read_bytes() != encoded:
        raise ReplayError("fitted-parameter artifact read-back verification failed")
    return path, hashlib.sha256(encoded).hexdigest()


def fit_b0b_development_parameters(spec: Mapping[str, Any]) -> dict[str, Any]:
    calibration.validate_spec(spec)
    try:
        fixture = calibration.contract_self_test()
    except RuntimeError as exc:
        raise ReplayError(
            "B0b fitting requires the bundled Python dependencies; "
            "use scripts/run-codex-python.mjs"
        ) from exc
    if not all(fixture["checks"].values()):
        raise ReplayError("synthetic boundary checks failed before B0b fitting")
    refit_invariance = synthetic_forward_refit_invariance(spec)
    if not (
        refit_invariance["factorsInvariant"]
        and refit_invariance["oofPointsInvariant"]
        and refit_invariance[
            "warmupPredictionFingerprintInvariantToOutcomePerturbation"
        ]
    ):
        raise ReplayError("synthetic B0b forward-refit invariance failed before fitting")
    # Clean/commit provenance is checked before any private input is loaded.
    require_clean_worktree()
    if latest_exact_commit([SPEC_PATH]) != FROZEN_REVISION_5_COMMIT:
        raise ReplayError("calibration revision 5 is not the frozen fit spec commit")
    latest_exact_commit([Path(__file__).resolve(), Path(calibration.__file__).resolve()])
    works, _posthoc, input_evidence = load_authorized_works(spec)
    warmup_predictions = generate_predictions(
        works,
        interval_warmup_origins(spec),
        spec,
        model_ids=("B0b",),
        b0b_parameter_role="interval_warmup_cold_start",
    )
    warmup_locks = lock_interval_warmup_predictions(warmup_predictions, spec)
    initial_predictions = generate_predictions(
        works,
        development_origins(spec),
        spec,
        model_ids=("B0b",),
        b0b_parameter_role="prefit_development_template",
    )
    rows = join_truth(initial_predictions, works, spec)
    warmup_rows = join_truth(warmup_predictions, works, spec)
    warmup_evidence = complete_interval_warmup_evidence(
        warmup_rows, warmup_locks, spec
    )
    warmup_availability = interval_warmup_availability_evidence(
        warmup_evidence, spec
    )
    evidence = b0b_fit_evidence(rows, spec)
    evidence["intervalWarmup"] = warmup_evidence["B0b"]
    artifact = build_fitted_artifact(spec, evidence, input_evidence)
    path, artifact_sha = write_fitted_artifact(spec, artifact)
    return {
        "mode": "fit-b0b-development-parameters",
        "decisionStatus": "not_for_formal_decision",
        "specDigest": spec_digest(spec),
        "artifact": path.relative_to(ROOT).as_posix(),
        "artifactSha256": artifact_sha,
        "fitCaseCount": evidence["fitCaseCount"],
        "comparatorCaseCount": evidence["comparatorCaseCount"],
        "comparatorOriginCount": evidence["comparatorOriginCount"],
        "intervalWarmup": warmup_availability,
        "lifecycleFactors": evidence["fullFit"]["factors"],
        "oofComparatorMetrics": evidence["oofMetrics"],
        "finalFitDiagnosticMetrics": evidence["finalFitDiagnosticMetrics"],
        "holdoutOpened": False,
        "embargoShadowOpened": False,
        "longHorizonAuditOpened": False,
        "nextRequiredAction": (
            "review_and_commit_fitted_artifact_then_run_development_forward_replay"
        ),
    }


def validate_recomputed_b0b_fit(
    artifact: Mapping[str, Any],
    evidence: Mapping[str, Any],
    input_evidence: Mapping[str, Any],
) -> None:
    fit = artifact["fit"]
    b0b = artifact["B0b"]
    checks = {
        "fitCaseFingerprint": evidence["fitCaseFingerprint"],
        "fitCaseCount": evidence["fitCaseCount"],
        "fitCaseCountByHorizon": evidence["fitCaseCountByHorizon"],
        "fitOriginCount": evidence["fitOriginCount"],
        "fitOriginCountByHorizon": evidence["fitOriginCountByHorizon"],
        "comparatorCaseFingerprint": evidence["comparatorCaseFingerprint"],
        "comparatorCaseCount": evidence["comparatorCaseCount"],
        "comparatorCaseCountByHorizon": evidence[
            "comparatorCaseCountByHorizon"
        ],
        "comparatorOriginCount": evidence["comparatorOriginCount"],
        "comparatorOriginCountByHorizon": evidence[
            "comparatorOriginCountByHorizon"
        ],
        "oofPredictionFingerprint": evidence["oofPredictionFingerprint"],
        "intervalWarmupCaseFingerprint": evidence["intervalWarmup"][
            "caseFingerprint"
        ],
        "intervalWarmupPredictionFingerprint": evidence["intervalWarmup"][
            "predictionFingerprint"
        ],
        "intervalWarmupCaseCount": evidence["intervalWarmup"]["caseCount"],
        "intervalWarmupCaseCountByHorizon": evidence["intervalWarmup"][
            "caseCountByHorizon"
        ],
        "intervalWarmupOriginCount": evidence["intervalWarmup"]["originCount"],
        "intervalWarmupOriginCountByHorizon": evidence["intervalWarmup"][
            "originCountByHorizon"
        ],
        "intervalWarmupPredictionLockedBeforeTruthJoin": True,
        "intervalWarmupUsesOutcomeLabelsForPrediction": False,
        "foldTrainingCaseCountsByScoreOrigin": evidence[
            "foldTrainingCaseCountsByScoreOrigin"
        ],
        "foldTrainingMaximumTargetEndByScoreOrigin": evidence[
            "foldTrainingMaximumTargetEndByScoreOrigin"
        ],
        "authoritativeInputSignatureSha256": input_evidence["inputFingerprint"],
        "passes": evidence["fullFit"]["passes"],
    }
    for key, expected in checks.items():
        if fit.get(key) != expected:
            raise ReplayError(f"B0b fitted artifact recomputation mismatch: {key}")
    b0b_checks = {
        "lifecycleFactors": evidence["fullFit"]["factors"],
        "oofComparatorMetrics": evidence["oofMetrics"],
        "finalFitDiagnosticMetrics": evidence["finalFitDiagnosticMetrics"],
        "lifecycleSupport": evidence["fullFit"]["support"],
    }
    for key, expected in b0b_checks.items():
        if b0b.get(key) != expected:
            raise ReplayError(f"B0b fitted artifact recomputation mismatch: {key}")


def materialize_b0b_forward_predictions(
    rows: Sequence[dict[str, Any]],
    works: Sequence[Mapping[str, Any]],
    spec: Mapping[str, Any],
    evidence: Mapping[str, Any],
) -> None:
    """Replace scored B0b rows with predictions made by each fold's factors."""

    prediction_fields = (
        "case_key",
        "route",
        "eligibility",
        "features",
        "point_forecast",
        "annual_breakdown",
        "confidence",
        "limitation",
        "spike_candidates",
        "channel_components",
        "public_output",
    )
    generated: dict[tuple[str, str, int, str], Mapping[str, Any]] = {}
    fold_by_origin = {
        str(fold["scoreOrigin"]): fold
        for fold in spec["origins"]["forwardValidation"]["folds"]
    }
    for score_origin, factors in evidence["foldFactors"].items():
        fold_spec = copy.deepcopy(spec)
        baseline = next(
            item for item in fold_spec["models"]["baselines"] if item["id"] == "B0b"
        )
        baseline["lifecycleFactors"] = dict(factors)
        fold = fold_by_origin[str(score_origin)]
        origins_by_horizon = {
            int(horizon): [str(score_origin)] for horizon in fold["testHorizons"]
        }
        predictions = generate_predictions(
            works,
            origins_by_horizon,
            fold_spec,
            model_ids=("B0b",),
            b0b_parameter_role="development_forward_fold",
        )["B0b"]
        for prediction in predictions:
            if any(
                component.get("detail", {}).get("lifecycle") is not None
                and component.get("detail", {}).get("parameterRole")
                != "development_forward_fold"
                for component in prediction.get("channel_components", [])
            ):
                raise ReplayError("B0b fold prediction has the wrong parameter role")
            key = case_key(prediction)
            if key in generated:
                raise ReplayError("duplicate materialized B0b forward prediction")
            generated[key] = prediction

    expected = set(evidence["oofPredictionByKey"])
    generated_numeric = {
        key
        for key, row in generated.items()
        if eligibility_status(row) == "forecastable_numeric"
    }
    if generated_numeric != expected:
        raise ReplayError("materialized B0b forward numeric keys differ from fit evidence")
    row_lookup = {
        case_key(row): row
        for row in rows
        if row.get("model_id") == "B0b" and case_key(row) in generated
    }
    if set(row_lookup) != set(generated):
        raise ReplayError("materialized B0b forward rows do not match development rows")
    for key, prediction in generated.items():
        target = row_lookup[key]
        expected_point = evidence["oofPredictionByKey"].get(key)
        actual_point = prediction.get("point_forecast")
        if expected_point is not None and (
            actual_point is None
            or calibration.fixed_decimal(actual_point)
            != calibration.fixed_decimal(expected_point)
        ):
            raise ReplayError(
                "materialized B0b forward point differs from the fixed-precision fold score"
            )
        for field in prediction_fields:
            target[field] = copy.deepcopy(prediction[field])
        target["_prediction_parameter_role"] = "development_forward_fold_factors"


def attach_b0b_oof_comparison_points(
    rows: Sequence[dict[str, Any]], evidence: Mapping[str, Any]
) -> None:
    points = evidence["oofPredictionByKey"]
    seen: set[tuple[str, str, int, str]] = set()
    for row in rows:
        if row.get("model_id") != "B0b":
            continue
        key = case_key(row)
        if key not in points:
            continue
        if (
            eligibility_status(row) != "forecastable_numeric"
            or row.get("point_forecast") is None
        ):
            raise ReplayError("B0b forward comparator case is not numeric forecastable")
        if calibration.fixed_decimal(row["point_forecast"]) != calibration.fixed_decimal(
            points[key]
        ):
            raise ReplayError("materialized B0b point differs from frozen OOF evidence")
        row["_comparison_point_forecast"] = float(row["point_forecast"])
        row["_comparison_point_source"] = "materialized_predict_as_of"
        row["_comparison_point_role"] = "development_forward_score"
        seen.add(key)
    if seen != set(points):
        raise ReplayError("B0b forward comparison points do not match development replay cases")


def exact_forward_score_rows(
    rows: Sequence[dict[str, Any]], spec: Mapping[str, Any], evidence: Mapping[str, Any]
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Freeze B0b-B3 to identical scored and forecastable-numeric key sets."""

    fold_horizons = {
        str(fold["scoreOrigin"]): {int(value) for value in fold["testHorizons"]}
        for fold in spec["origins"]["forwardValidation"]["folds"]
    }
    scored = [
        row
        for row in rows
        if str(row["case_key"]["origin"]) in fold_horizons
        and int(row["case_key"]["horizon_months"])
        in fold_horizons[str(row["case_key"]["origin"])]
    ]
    by_model: dict[str, list[dict[str, Any]]] = {
        model: [row for row in scored if row["model_id"] == model]
        for model in BASELINE_IDS
    }
    all_key_sets = {model: {case_key(row) for row in model_rows} for model, model_rows in by_model.items()}
    first_all = all_key_sets[BASELINE_IDS[0]]
    if not first_all or any(keys != first_all for keys in all_key_sets.values()):
        raise ReplayError("B0b-B3 forward score case-key parity failed")
    if any(len(by_model[model]) != len(all_key_sets[model]) for model in BASELINE_IDS):
        raise ReplayError("B0b-B3 forward score contains duplicate case keys")

    numeric_sets: dict[str, set[tuple[str, str, int, str]]] = {}
    for model, model_rows in by_model.items():
        numeric_keys: set[tuple[str, str, int, str]] = set()
        for row in model_rows:
            if eligibility_status(row) != "forecastable_numeric":
                continue
            if scoring_point(row) is None:
                raise ReplayError(
                    f"{model} has a null prediction on a frozen forecastable key"
                )
            numeric_keys.add(case_key(row))
        numeric_sets[model] = numeric_keys
    first_numeric = numeric_sets[BASELINE_IDS[0]]
    if not first_numeric or any(keys != first_numeric for keys in numeric_sets.values()):
        raise ReplayError("B0b-B3 forecastable forward key parity failed")
    if first_numeric != set(evidence["oofPredictionByKey"]):
        raise ReplayError("B0b OOF keys differ from the frozen forecastable comparator keys")
    if development_case_fingerprint(evidence["comparatorRows"]) != evidence[
        "comparatorCaseFingerprint"
    ]:
        raise ReplayError("B0b comparator fingerprint changed before model comparison")
    return scored, {
        "allScoredCaseCount": len(first_all),
        "forecastableScoredCaseCount": len(first_numeric),
        "allScoredKeysIdentical": True,
        "forecastableKeysIdentical": True,
        "intersectionDropUsed": False,
    }


def scoring_point(row: Mapping[str, Any]) -> Any:
    return row.get("_comparison_point_forecast", row.get("point_forecast"))


def long_horizon_cohort_eligible(row: Mapping[str, Any], spec: Mapping[str, Any]) -> bool:
    evidence = spec["backtest"]["longHorizonEvidence"]
    if int(row.get("features", {}).get("observed_months", 0)) < int(
        evidence["minimumHistoryMonths"]
    ):
        return False
    route = str(row.get("route"))
    if route in {"pure_sales_share", "buyout_plus_sales"}:
        return int(row.get("features", {}).get("active_months", 0)) >= int(
            evidence["salesMinimumPositiveMonths"]
        )
    if route == "pure_buyout":
        event_count = max(
            (
                int(component.get("detail", {}).get("eventCount", 0))
                for component in row.get("channel_components", [])
            ),
            default=0,
        )
        return event_count >= int(evidence["buyoutMinimumConfirmedEvents"])
    return False


def trailing_value_context(
    works: Sequence[Mapping[str, Any]], origins: Iterable[str]
) -> dict[tuple[str, str], dict[str, Any]]:
    raw: dict[str, list[tuple[str, float, int]]] = defaultdict(list)
    for origin in sorted(set(origins)):
        months = set(calibration.month_range(calibration.add_months(origin, -11), origin))
        for work in works:
            if not calibration.work_exists_as_of(work, origin):
                continue
            by_month = {month: 0.0 for month in months}
            for channel in work.get("channels", []):
                for month in months:
                    by_month[month] += calibration.finite_number(
                        (channel.get("monthly", {}) or {}).get(month, 0.0)
                    )
            value = sum(by_month.values())
            positive_months = sum(amount > 0 for amount in by_month.values())
            raw[origin].append((str(work["standard_work_id"]), value, positive_months))

    context: dict[tuple[str, str], dict[str, Any]] = {}
    for origin, rows in raw.items():
        positive_ranked = sorted(
            (item for item in rows if item[1] > 0), key=lambda item: (-item[1], item[0])
        )
        count = len(positive_ranked)
        top1_count = math.ceil(count * 0.01)
        top5_count = math.ceil(count * 0.05)
        top10_count = math.ceil(count * 0.10)
        top1_ids = {item[0] for item in positive_ranked[:top1_count]}
        top5_ids = {item[0] for item in positive_ranked[:top5_count]}
        top10_ids = {item[0] for item in positive_ranked[:top10_count]}
        bottom_count = math.ceil(count * 0.50)
        bottom_positive = {
            item[0] for item in (positive_ranked[-bottom_count:] if bottom_count else [])
        }
        for work_id, value, positive_months in rows:
            top1 = work_id in top1_ids
            top5 = work_id in top5_ids
            top10 = work_id in top10_ids
            if top1:
                band = "top_1_percent"
            elif top5:
                band = "next_4_percent"
            elif top10:
                band = "next_5_percent"
            elif value > 0:
                band = "other_positive"
            else:
                band = "non_positive"
            context[(work_id, origin)] = {
                "top_1_percent": top1,
                "top_5_percent": top5,
                "top_10_percent": top10,
                "high_value": top10,
                "value_band": band,
                "bottom_half_positive": work_id in bottom_positive,
                "trailing_12_signed_revenue": value,
                "positive_month_count_12": positive_months,
            }
    return context


def attach_strata(
    rows: Sequence[dict[str, Any]],
    works: Sequence[Mapping[str, Any]],
    posthoc: Mapping[str, Mapping[str, str]],
) -> None:
    origins = {str(row["case_key"]["origin"]) for row in rows}
    values = trailing_value_context(works, origins)
    for row in rows:
        key = row["case_key"]
        work_id, origin = str(key["standard_work_id"]), str(key["origin"])
        current = posthoc.get(work_id, {})
        value = values[(work_id, origin)]
        dormant = bool(row["features"].get("dormant"))
        sparse = bool(row["features"].get("sparse_income")) and not dormant
        row["strata"] = {
            "source": current.get("source", "unknown"),
            "revenue_model": str(row["route"]),
            "shelf_rights": f"{current.get('shelf_status', 'unknown')}|{current.get('rights_status', 'unknown')}",
            "rights_term_type": current.get("rights_term_type", "unknown"),
            "high_value": bool(value["high_value"]),
            "top_1_percent": bool(value["top_1_percent"]),
            "top_5_percent": bool(value["top_5_percent"]),
            "top_10_percent": bool(value["top_10_percent"]),
            "value_band": value["value_band"],
            "dormant": dormant,
            "sparse_income": sparse,
            "long_tail": bool(
                not dormant
                and not sparse
                and value["positive_month_count_12"] >= 4
                and value["bottom_half_positive"]
            ),
            "spike_candidate": bool(row.get("spike_candidates")),
            "horizon": int(key["horizon_months"]),
            "historicalFeaturePolicy": "as_of_only",
            "sourceShelfRightsTermPolicy": "post_hoc_only",
        }


def residual_index(
    rows: Sequence[Mapping[str, Any]],
) -> dict[tuple[Any, ...], list[tuple[int, int, int, float]]]:
    raw: dict[tuple[Any, ...], list[tuple[int, int, int, float]]] = defaultdict(list)
    allowed_roles = {
        "development_warmup_interval_calibration",
        "development_forward_score",
    }
    for row in rows:
        role = str(row.get("_residual_case_role", ""))
        if role not in allowed_roles:
            raise ReplayError("interval residual population contains an unauthorized role")
        if eligibility_status(row) != "forecastable_numeric":
            continue
        point, actual = scoring_point(row), row.get("actual")
        if point is None or actual is None:
            raise ReplayError("numeric interval residual case has a missing point or actual")
        model = str(row["model_id"])
        horizon = int(row["case_key"]["horizon_months"])
        route = str(row["route"])
        origin_order = calibration.month_ordinal(str(row["case_key"]["origin"]))
        target_end_order = calibration.month_ordinal(str(row["target_end"]))
        available_order = calibration.month_ordinal(
            str(row.get("label_available_as_of") or row["target_end"])
        )
        residual = abs(float(point) - float(actual))
        if not math.isfinite(residual) or residual < 0:
            raise ReplayError("interval residual is non-finite or negative")
        record = (origin_order, target_end_order, available_order, residual)
        raw[("model_horizon_route", model, horizon, route)].append(record)
        raw[("model_horizon", model, horizon)].append(record)
        raw[("model", model)].append(record)
    result: dict[tuple[Any, ...], list[tuple[int, int, int, float]]] = {}
    for key, values in raw.items():
        result[key] = sorted(values)
    return result


def prior_residuals(
    index: Mapping[tuple[Any, ...], Sequence[tuple[int, int, int, float]]],
    key: tuple[Any, ...],
    origin_order: int,
) -> list[float]:
    return [
        residual
        for residual_origin, residual_target_end, residual_available, residual in index.get(
            key, ()
        )
        if residual_origin < origin_order
        and residual_target_end <= origin_order
        and residual_available <= origin_order
    ]


def apply_internal_intervals(
    target_rows: Sequence[dict[str, Any]],
    calibration_rows: Sequence[Mapping[str, Any]],
    spec: Mapping[str, Any],
) -> None:
    """Attach internal-only PI fields; no endpoint enters a public report."""

    index = residual_index(calibration_rows)
    nominal = float(spec["internalInterval"]["nominalCoverage"])
    for row in target_rows:
        point, actual = scoring_point(row), row.get("actual")
        if point is None or actual is None:
            row["_internal_interval"] = {"available": False}
            continue
        model = str(row["model_id"])
        horizon = int(row["case_key"]["horizon_months"])
        route = str(row["route"])
        origin_order = calibration.month_ordinal(str(row["case_key"]["origin"]))
        candidates = (
            (("model_horizon_route", model, horizon, route), 100, "model_x_horizon_x_route"),
            (("model_horizon", model, horizon), 100, "model_x_horizon"),
            (("model", model), 200, "model"),
        )
        selected: list[float] = []
        group = None
        for pool_key, minimum, name in candidates:
            pool = prior_residuals(index, pool_key, origin_order)
            if len(pool) >= minimum:
                selected, group = pool, name
                break
        q_value = (
            calibration.finite_sample_conformal_quantile(selected, nominal)
            if selected
            else None
        )
        if q_value is None:
            row["_internal_interval"] = {"available": False}
            continue
        bounds = calibration.conformal_interval(float(point), selected)
        if bounds is None:
            row["_internal_interval"] = {"available": False}
            continue
        lower, upper = bounds
        actual_value = float(actual)
        interval_score = calibration.interval_score_80(actual_value, lower, upper)
        wis = calibration.wis_80(actual_value, float(point), lower, upper)
        row["_internal_interval"] = {
            "available": True,
            "group": group,
            "calibrationCount": len(selected),
            "lower": lower,
            "upper": upper,
            "covered": lower <= actual_value <= upper,
            "wis": wis,
            "intervalScore": interval_score,
            "width": upper - lower,
        }


def point_population_metrics(
    rows: Sequence[Mapping[str, Any]], *, null_to_zero: bool
) -> dict[str, Any]:
    predictions: list[float] = []
    actuals: list[float] = []
    null_count = 0
    for row in rows:
        if row.get("actual") is None:
            raise ReplayError("metric population contains a missing actual")
        point = scoring_point(row)
        if point is None:
            null_count += 1
            if not null_to_zero:
                raise ReplayError("numeric metric population contains a null prediction")
            point = 0.0
        predictions.append(float(point))
        actuals.append(float(row["actual"]))
    return {
        "caseCount": len(rows),
        "uniqueWorkCount": len({str(row["case_key"]["standard_work_id"]) for row in rows}),
        "nullPredictionCount": null_count,
        "nullPredictionEvaluationValue": 0.0 if null_to_zero else None,
        "actualTotal": rounded(sum(actuals)),
        "predictedTotal": rounded(sum(predictions)),
        "wape": rounded(calibration.wape(predictions, actuals)),
        "signedAggregateBias": rounded(calibration.signed_aggregate_bias(predictions, actuals)),
    }


def metric_score(rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    forecastable = [
        row for row in rows if eligibility_status(row) == "forecastable_numeric"
    ]
    if any(scoring_point(row) is None for row in forecastable):
        raise ReplayError("forecastableNumeric population contains a null prediction")
    high_value = [row for row in rows if bool(row.get("strata", {}).get("high_value"))]
    available_rows = [
        row
        for row in forecastable
        if (row.get("_internal_interval", {}) or {}).get("available")
    ]
    available = [row["_internal_interval"] for row in available_rows]

    positive_actual_all = sum(max(float(row["actual"]), 0.0) for row in rows)
    positive_actual_forecastable = sum(
        max(float(row["actual"]), 0.0) for row in forecastable
    )
    top10_all = [
        row for row in rows if bool(row.get("strata", {}).get("top_10_percent"))
    ]
    top10_forecastable = [
        row
        for row in top10_all
        if eligibility_status(row) == "forecastable_numeric"
    ]
    top10_denominator = sum(max(float(row["actual"]), 0.0) for row in top10_all)
    top10_numerator = sum(
        max(float(row["actual"]), 0.0) for row in top10_forecastable
    )
    actuals_available = [float(row["actual"]) for row in available_rows]
    lowers = [float(item["lower"]) for item in available]
    uppers = [float(item["upper"]) for item in available]
    interval_complete = bool(forecastable) and len(available) == len(forecastable)
    return {
        "caseCount": len(rows),
        "uniqueWorkCount": len({str(row["case_key"]["standard_work_id"]) for row in rows}),
        "forecastableCaseCount": len(forecastable),
        "blockedCaseCount": len(rows) - len(forecastable),
        "forecastableRevenueCoverage": rounded(
            positive_actual_forecastable / positive_actual_all
            if positive_actual_all > 0
            else None
        ),
        "top10ForecastableRevenueCoverage": rounded(
            top10_numerator / top10_denominator if top10_denominator > 0 else None
        ),
        "populations": {
            "coverageAwareOverall": point_population_metrics(rows, null_to_zero=True),
            "forecastableNumeric": point_population_metrics(
                forecastable, null_to_zero=False
            ),
            "highValueAll": point_population_metrics(high_value, null_to_zero=True),
        },
        "internalInterval": {
            "requiredCaseCount": len(forecastable),
            "availableCaseCount": len(available),
            "missingCaseCount": len(forecastable) - len(available),
            "completeOnRequiredPopulation": interval_complete,
            "gateEligible": interval_complete,
            "internal80Coverage": rounded(
                sum(bool(item["covered"]) for item in available) / len(available)
                if interval_complete
                else None
            ),
            "meanWis": rounded(
                sum(float(item["wis"]) for item in available) / len(available)
                if interval_complete
                else None
            ),
            "standardizedWidth": rounded(
                calibration.standardized_interval_width(
                    lowers, uppers, actuals_available
                )
                if interval_complete
                else None
            ),
        },
    }


def aggregate_report(
    rows: Sequence[Mapping[str, Any]],
    minimum_cell_count: int,
    spec: Mapping[str, Any],
) -> dict[str, Any]:
    by_model: dict[str, list[Mapping[str, Any]]] = defaultdict(list)
    for row in rows:
        by_model[str(row["model_id"])].append(row)

    def group_unique_work_count(group: Sequence[Mapping[str, Any]]) -> int:
        return len({str(row["case_key"]["standard_work_id"]) for row in group})

    def suppressed_metric_cell(
        case_count: int, unique_work_count: int
    ) -> dict[str, Any]:
        return {
            "suppressed": True,
            "caseCount": (
                f"<{minimum_cell_count}"
                if case_count < minimum_cell_count
                else case_count
            ),
            "uniqueWorkCount": (
                f"<{minimum_cell_count}"
                if unique_work_count < minimum_cell_count
                else unique_work_count
            ),
        }

    def metric_cell(group: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
        """Suppress metrics below both case- and work-level public minima."""

        group_case_count = len(group)
        group_work_count = group_unique_work_count(group)
        if (
            group_case_count < minimum_cell_count
            or group_work_count < minimum_cell_count
        ):
            return suppressed_metric_cell(group_case_count, group_work_count)
        score = metric_score(group)

        for population_name, population in list(score["populations"].items()):
            population_case_count = int(population["caseCount"])
            population_work_count = int(population["uniqueWorkCount"])
            if (
                population_case_count < minimum_cell_count
                or population_work_count < minimum_cell_count
            ):
                score["populations"][population_name] = suppressed_metric_cell(
                    population_case_count,
                    population_work_count,
                )
            else:
                score["populations"][population_name] = {
                    "suppressed": False,
                    **population,
                }

        forecastable_group = [
            row for row in group if eligibility_status(row) == "forecastable_numeric"
        ]
        forecastable_count = len(forecastable_group)
        forecastable_work_count = group_unique_work_count(forecastable_group)
        score["forecastableUniqueWorkCount"] = (
            f"<{minimum_cell_count}"
            if forecastable_work_count < minimum_cell_count
            else forecastable_work_count
        )
        if (
            forecastable_count < minimum_cell_count
            or forecastable_work_count < minimum_cell_count
        ):
            if forecastable_count < minimum_cell_count:
                score["forecastableCaseCount"] = f"<{minimum_cell_count}"
            score["forecastableRevenueCoverage"] = None
            score["forecastableRevenueCoverageSuppressed"] = True
        else:
            score["forecastableRevenueCoverageSuppressed"] = False

        blocked_count = int(score["blockedCaseCount"])
        if blocked_count < minimum_cell_count:
            score["blockedCaseCount"] = f"<{minimum_cell_count}"

        top10_group = [
            row for row in group if bool(row.get("strata", {}).get("top_10_percent"))
        ]
        if (
            len(top10_group) < minimum_cell_count
            or group_unique_work_count(top10_group) < minimum_cell_count
        ):
            score["top10ForecastableRevenueCoverage"] = None
            score["top10ForecastableRevenueCoverageSuppressed"] = True
        else:
            score["top10ForecastableRevenueCoverageSuppressed"] = False

        interval = score["internalInterval"]
        if (
            forecastable_count < minimum_cell_count
            or forecastable_work_count < minimum_cell_count
        ):
            score["internalInterval"] = suppressed_metric_cell(
                forecastable_count,
                forecastable_work_count,
            )
        else:
            for count_name in (
                "availableCaseCount",
                "missingCaseCount",
            ):
                if int(interval[count_name]) < minimum_cell_count:
                    interval[count_name] = f"<{minimum_cell_count}"
            score["internalInterval"] = {
                "suppressed": False,
                **interval,
            }

        return {
            "suppressed": False,
            **score,
        }

    overall = {model: metric_cell(by_model.get(model, [])) for model in BASELINE_IDS}

    registered: dict[str, list[Any]] = {
        "horizon": [
            *spec["backtest"]["coreHorizonsMonths"],
            *spec["backtest"]["longHorizonAuditMonths"],
        ],
        "revenue_model": [
            "pure_sales_share",
            "pure_buyout",
            "buyout_plus_sales",
            "unknown_revenue_model",
        ],
        "rights_term_type": list(spec["strata"]["definitions"]["rights_term_type"]),
        "high_value": [False, True],
        "value_band": [
            "top_1_percent",
            "next_4_percent",
            "next_5_percent",
            "other_positive",
            "non_positive",
        ],
        "long_tail": [False, True],
        "dormant": [False, True],
        "sparse_income": [False, True],
        "spike_candidate": [False, True],
        "confidence": list(spec["confidence"]["publicLevels"]),
    }

    def sliced(field: str, *, from_strata: bool = True) -> list[dict[str, Any]]:
        groups: dict[tuple[str, str], list[Mapping[str, Any]]] = defaultdict(list)
        for row in rows:
            value = row.get("strata", {}).get(field) if from_strata else row.get(field)
            groups[(str(row["model_id"]), str(value))].append(row)
        output = []
        observed_values = {value for _model, value in groups}
        values = observed_values | {str(value) for value in registered.get(field, [])}
        for model in BASELINE_IDS:
            for value in sorted(values):
                group = groups.get((model, value), [])
                if len(group) < minimum_cell_count:
                    output.append({"modelId": model, "value": value, **metric_cell(group)})
                    continue
                output.append(
                    {
                        "modelId": model,
                        "value": value,
                        **metric_cell(group),
                    }
                )
        return output

    return {
        "overall": overall,
        "slices": {
            "horizon": sliced("horizon"),
            "revenueModel": sliced("revenue_model"),
            "sourcePostHoc": sliced("source"),
            "shelfRightsPostHoc": sliced("shelf_rights"),
            "rightsTermTypePostHoc": sliced("rights_term_type"),
            "highValue": sliced("high_value"),
            "valueBand": sliced("value_band"),
            "longTail": sliced("long_tail"),
            "dormant": sliced("dormant"),
            "sparseIncome": sliced("sparse_income"),
            "spikeCandidate": sliced("spike_candidate"),
            "confidence": sliced("confidence", from_strata=False),
        },
    }


def select_locked_comparator(aggregate: Mapping[str, Any]) -> str:
    metrics = aggregate["overall"]
    tolerance = 1e-12
    complexity = {
        model: index
        for index, model in enumerate(("B1", "B2", "B3", "B0b"))
    }
    ranked: list[tuple[float, float, int, str]] = []
    for model_id in BASELINE_IDS:
        score = metrics[model_id]["populations"]["forecastableNumeric"]
        wape_value = score["wape"] if score["wape"] is not None else math.inf
        bias_value = abs(score["signedAggregateBias"]) if score["signedAggregateBias"] is not None else math.inf
        ranked.append((wape_value, bias_value, complexity[model_id], model_id))
    best_wape = min(item[0] for item in ranked)
    primary = [item for item in ranked if item[0] <= best_wape + tolerance]
    best_bias = min(item[1] for item in primary)
    secondary = [item for item in primary if item[1] <= best_bias + tolerance]
    return min(secondary, key=lambda item: item[2])[3]


def paired_two_way_bootstrap(
    rows: Sequence[Mapping[str, Any]],
    comparator: str,
    spec: Mapping[str, Any],
) -> dict[str, Any]:
    """Vectorized paired work x origin pigeonhole bootstrap (never case-iid)."""

    try:
        import numpy as np  # pylint: disable=import-outside-toplevel
    except Exception as exc:  # pragma: no cover - bundled runtime is required
        raise ReplayError(
            "paired two-way bootstrap requires NumPy; use scripts/run-codex-python.mjs"
        ) from exc

    by_model_key: dict[str, dict[tuple[str, str, int, str], Mapping[str, Any]]] = {
        model: {} for model in BASELINE_IDS
    }
    for row in rows:
        model = str(row["model_id"])
        key = case_key(row)
        if key in by_model_key[model]:
            raise ReplayError("bootstrap input contains a duplicate model case key")
        by_model_key[model][key] = row
    all_sets = {model: set(by_model_key[model]) for model in BASELINE_IDS}
    if any(all_sets[model] != all_sets[BASELINE_IDS[0]] for model in BASELINE_IDS):
        raise ReplayError("bootstrap input model case-key sets are not identical")
    numeric_sets: dict[str, set[tuple[str, str, int, str]]] = {}
    for model in BASELINE_IDS:
        numeric_sets[model] = {
            key
            for key, row in by_model_key[model].items()
            if eligibility_status(row) == "forecastable_numeric"
        }
        if any(
            scoring_point(by_model_key[model][key]) is None
            for key in numeric_sets[model]
        ):
            raise ReplayError("bootstrap forecastable population contains a null point")
    if any(
        numeric_sets[model] != numeric_sets[BASELINE_IDS[0]]
        for model in BASELINE_IDS
    ):
        raise ReplayError("bootstrap forecastable key parity failed")
    common = sorted(numeric_sets[BASELINE_IDS[0]])
    if not common:
        raise ReplayError("bootstrap forecastable population is empty")

    block_values: dict[tuple[str, str], dict[str, Any]] = {}
    for key in common:
        base = by_model_key[BASELINE_IDS[0]][key]
        block = block_values.setdefault(
            (key[0], key[1]),
            {"absoluteActual": 0.0, "errors": {model: 0.0 for model in BASELINE_IDS}},
        )
        actual = float(base["actual"])
        block["absoluteActual"] += abs(actual)
        for model in BASELINE_IDS:
            point = float(scoring_point(by_model_key[model][key]))
            block["errors"][model] += abs(point - actual)

    block_keys = sorted(block_values)
    works = sorted({key[0] for key in block_keys})
    origins = sorted({key[1] for key in block_keys})
    absolute_actual = np.asarray([block_values[key]["absoluteActual"] for key in block_keys], dtype=float)
    errors = {
        model: np.asarray([block_values[key]["errors"][model] for key in block_keys], dtype=float)
        for model in BASELINE_IDS
    }
    replicates = int(spec["bootstrap"]["replicates"])
    seed = int(spec["bootstrap"]["seed"])
    deltas = {model: [] for model in BASELINE_IDS}
    bootstrap_cases = [
        {"standard_work_id": key[0], "origin": key[1]} for key in block_keys
    ]
    for raw_weights in calibration.iter_paired_two_way_bootstrap_weights(
        bootstrap_cases, replicates, seed
    ):
        weights = np.asarray(raw_weights, dtype=float)
        denominator = float(np.dot(weights, absolute_actual))
        if denominator <= 0:
            raise ReplayError("bootstrap replicate has an invalid WAPE denominator")
        comparator_wape = float(np.dot(weights, errors[comparator]) / denominator)
        for model in BASELINE_IDS:
            value = float(np.dot(weights, errors[model]) / denominator) - comparator_wape
            deltas[model].append(value)

    confidence = float(spec["bootstrap"]["confidenceLevel"])
    tail = (1.0 - confidence) / 2.0

    def nearest_rank(values: Sequence[float], probability: float) -> float:
        ordered = sorted(float(value) for value in values)
        rank = min(len(ordered), max(1, math.ceil(probability * len(ordered))))
        return ordered[rank - 1]

    comparisons = {}
    for model, values in deltas.items():
        if not values:
            comparisons[model] = {"available": False}
            continue
        comparisons[model] = {
            "available": True,
            "deltaWapeVsLockedComparatorMedian": rounded(
                nearest_rank(values, 0.5)
            ),
            "percentileLower": rounded(nearest_rank(values, tail)),
            "percentileUpper": rounded(nearest_rank(values, 1.0 - tail)),
        }
    return {
        "available": True,
        "method": spec["bootstrap"]["method"],
        "caseIidSampling": False,
        "clusterKeys": list(spec["bootstrap"]["clusterKeys"]),
        "pairedAcrossModels": True,
        "population": "forecastableNumeric_exact_key_parity",
        "keyIntersectionDropUsed": False,
        "replicatesRequested": replicates,
        "replicatesCompleted": min((len(values) for values in deltas.values()), default=0),
        "seed": seed,
        "workClusterCount": len(works),
        "originClusterCount": len(origins),
        "workOriginBlockCount": len(block_keys),
        "comparisons": comparisons,
    }


def write_private_details(mode: str, rows: Sequence[Mapping[str, Any]], manifest: Mapping[str, Any]) -> dict[str, Any]:
    detail_path = PRIVATE_DIR / f"M2-calibration-baseline-{mode}-cases-private-v1.ndjson"
    manifest_path = PRIVATE_DIR / f"M2-calibration-baseline-{mode}-manifest-private-v1.json"
    for path in (detail_path, manifest_path):
        if not git_path_is_ignored(path):
            raise ReplayError(f"private output is not Git-ignored: {path.name}")
    PRIVATE_DIR.mkdir(parents=True, exist_ok=True)
    detail_hash = hashlib.sha256()
    with detail_path.open("w", encoding="utf-8", newline="\n") as handle:
        for row in rows:
            encoded = canonical_bytes(row)
            handle.write(encoded.decode("utf-8") + "\n")
            detail_hash.update(encoded + b"\n")
    private_manifest = {
        **dict(manifest),
        "privateCaseRowCount": len(rows),
        "privateCaseFileSha256": detail_hash.hexdigest(),
    }
    manifest_path.write_bytes(canonical_bytes(private_manifest) + b"\n")
    return {
        "privateCaseRowCount": len(rows),
        "privateCaseFileSha256": detail_hash.hexdigest(),
        "pathsExcludedFromCommittableReport": True,
    }


def public_paths(mode: str) -> tuple[Path, Path]:
    stem = f"M2-calibration-baseline-{mode}-v1"
    return PUBLIC_DIR / f"{stem}.json", PUBLIC_DIR / f"{stem}.md"


def limitation_distribution(
    rows: Sequence[Mapping[str, Any]], minimum_cell_count: int
) -> dict[str, Any]:
    """Aggregate multi-label limitation counts without exposing small cells."""

    counts: dict[tuple[str, str], int] = defaultdict(int)
    model_totals = {model: 0 for model in BASELINE_IDS}
    for row in rows:
        model = str(row["model_id"])
        if model not in model_totals:
            raise ReplayError("limitation distribution contains an unknown model")
        model_totals[model] += 1
        values = sorted({str(value) for value in row.get("limitation", []) if str(value)})
        for value in values or ["none"]:
            counts[(model, value)] += 1
    cells: list[dict[str, Any]] = []
    for model in BASELINE_IDS:
        model_values = sorted(
            {value for candidate, value in counts if candidate == model} | {"none"}
        )
        for value in model_values:
            count = counts.get((model, value), 0)
            suppressed = count < minimum_cell_count
            cells.append(
                {
                    "modelId": model,
                    "limitation": value,
                    "suppressed": suppressed,
                    "caseCount": f"<{minimum_cell_count}" if suppressed else count,
                }
            )
    return {
        "population": "all_model_case_rows_in_reported_role",
        "multiLabelCasesCountInEveryApplicableLimitation": True,
        "minimumCellCount": minimum_cell_count,
        "modelCaseCounts": {
            model: (
                f"<{minimum_cell_count}"
                if count < minimum_cell_count
                else count
            )
            for model, count in model_totals.items()
        },
        "cells": cells,
    }


def gate_failures_and_unverified_items(report: Mapping[str, Any]) -> dict[str, Any]:
    """Make baseline diagnostic failures and unavailable candidate gates explicit."""

    integrity = report["integrity"]
    required_integrity = (
        "authorityScopeExact",
        "incomeFactScopeExact",
        "caseKeyParity",
        "futurePerturbationInvariant",
        "futurePerturbationInferenceAndPublicOutputInvariant",
        "futurePerturbationForwardRefitInvariant",
        "futurePerturbationWarmupPredictionFingerprintInvariant",
        "intervalWarmupPredictionLockedBeforeTruthJoin",
        "intervalWarmupExcludedFromPointMetricsComparatorAndBootstrap",
    )
    failures = [
        {
            "gate": f"integrity.{name}",
            "reason": "required_integrity_condition_false",
        }
        for name in required_integrity
        if integrity.get(name) is not True
    ]
    if integrity.get("intervalWarmupUsesOutcomeLabelsForPrediction") is not False:
        failures.append(
            {
                "gate": "integrity.intervalWarmupUsesOutcomeLabelsForPrediction",
                "reason": "warmup_prediction_used_outcome_labels",
            }
        )
    for model, metrics in report["developmentBaseline"]["overall"].items():
        interval = metrics["internalInterval"]
        if interval["gateEligible"] is not True:
            failures.append(
                {
                    "gate": f"baselineDiagnostic.{model}.internal80PredictionInterval",
                    "reason": "missing_interval_on_required_population",
                    "missingCaseCount": interval["missingCaseCount"],
                }
            )
    candidate_gate_ids = (
        "integrity",
        "overallPointAccuracy",
        "signedAggregateBias",
        "horizonNonRegression",
        "highValue",
        "importantStrata",
        "internal80PredictionInterval",
        "originStability",
        "issueSeverity",
    )
    unverified = [
        *[
            {
                "item": f"candidate_gate.{gate_id}",
                "reason": "C1_C2-R_C2_C3_not_authorized_or_trained_in_baseline_runner",
            }
            for gate_id in candidate_gate_ids
        ],
        {
            "item": "final_holdout_confirmation",
            "reason": "final_holdout_unopened_and_unavailable_in_baseline_runner",
        },
        {
            "item": "deferred_36_and_all_60_month_long_audit_labels",
            "reason": "outside_development_safe_purge_and_left_closed",
        },
        {
            "item": "chinese_business_sampling",
            "reason": "generated_only_after_a_candidate_passes_all_frozen_technical_gates",
        },
        {
            "item": "formal_decision_release_and_M3",
            "reason": "explicit_user_approval_not_granted",
        },
    ]
    return {
        "scope": "baseline_replay_diagnostics_only",
        "candidateGateEvaluationPerformed": False,
        "baselineDiagnosticFailureCount": len(failures),
        "baselineDiagnosticFailures": failures,
        "unverifiedItemCount": len(unverified),
        "unverifiedItems": unverified,
        "gateRelaxationAfterResultsAllowed": False,
    }


def build_required_report_sections(
    report: Mapping[str, Any],
    forward_rows: Sequence[Mapping[str, Any]],
    long_rows: Sequence[Mapping[str, Any]],
    artifact: Mapping[str, Any],
    spec: Mapping[str, Any],
) -> dict[str, Any]:
    """Materialize every frozen committable-report section by its exact id."""

    minimum_cell = int(
        spec["reporting"]["committableAggregateReport"]["minimumCellCount"]
    )
    aggregate = report["developmentBaseline"]
    overall = aggregate["overall"]
    slices = aggregate["slices"]
    eligibility = {
        model: {
            "caseCount": metrics["caseCount"],
            "forecastableCaseCount": metrics["forecastableCaseCount"],
            "blockedCaseCount": metrics["blockedCaseCount"],
            "forecastableRevenueCoverage": metrics["forecastableRevenueCoverage"],
            "top10ForecastableRevenueCoverage": metrics[
                "top10ForecastableRevenueCoverage"
            ],
        }
        for model, metrics in overall.items()
    }
    extrapolated_raw = {
        model: sum(
            "extrapolated" in row.get("limitation", [])
            for row in long_rows
            if str(row["model_id"]) == model
        )
        for model in BASELINE_IDS
    }
    extrapolated = {
        model: (f"<{minimum_cell}" if count < minimum_cell else count)
        for model, count in extrapolated_raw.items()
    }
    failures = gate_failures_and_unverified_items(report)
    authority = {
        "authority": copy.deepcopy(report["inputEvidence"]),
        "specVersion": report["specVersion"],
        "specRevision": int(spec["preHoldoutRevision"]),
        "specDigest": report["specDigest"],
        "specCommit": str(artifact["fit"]["specCommit"]),
        "fitCodeCommit": str(artifact["fit"]["fitCodeCommit"]),
        "fittedArtifactCommit": str(artifact["_artifactCommit"]),
        "fittedArtifactSha256": report["B0bFittedParameterEvidence"][
            "artifactSha256"
        ],
        "caseFingerprints": {
            "fit": report["B0bFittedParameterEvidence"]["fitCaseFingerprint"],
            "comparator": report["B0bFittedParameterEvidence"][
                "comparatorCaseFingerprint"
            ],
            "oofPrediction": report["B0bFittedParameterEvidence"][
                "oofPredictionFingerprint"
            ],
            "intervalWarmupPrediction": report["B0bFittedParameterEvidence"][
                "intervalWarmupPredictionFingerprint"
            ],
            "intervalWarmupCase": report["B0bFittedParameterEvidence"][
                "intervalWarmupCaseFingerprint"
            ],
        },
    }
    sections = {
        "authority_spec_code_and_case_fingerprints": authority,
        "B0a_audit_boundary_and_B0b_B3_forward_replay": {
            "B0aHistoricalAuditOnly": copy.deepcopy(report["B0aHistoricalAuditOnly"]),
            "B0bThroughB3ForwardReplay": copy.deepcopy(overall),
            "lockedComparator": report["lockedComparator"],
        },
        "future_perturbation_and_case_key_integrity": {
            "integrity": copy.deepcopy(report["integrity"]),
            "intervalWarmupEvidence": copy.deepcopy(report["intervalWarmupEvidence"]),
        },
        "metric_population_and_coverage_reconciliation": {
            "byModel": {
                model: {
                    "caseCount": metrics["caseCount"],
                    "forecastableCaseCount": metrics["forecastableCaseCount"],
                    "blockedCaseCount": metrics["blockedCaseCount"],
                    "populations": copy.deepcopy(metrics["populations"]),
                    "internalIntervalRequiredCaseCount": metrics["internalInterval"][
                        "requiredCaseCount"
                    ],
                    "internalIntervalAvailableCaseCount": metrics[
                        "internalInterval"
                    ]["availableCaseCount"],
                }
                for model, metrics in overall.items()
            },
            "caseKeyParity": copy.deepcopy(report["integrity"]["forwardScoreParity"]),
        },
        "horizon_source_revenue_model_shelf_rights_and_high_value_slices": {
            "horizon": copy.deepcopy(slices["horizon"]),
            "sourcePostHoc": copy.deepcopy(slices["sourcePostHoc"]),
            "revenueModel": copy.deepcopy(slices["revenueModel"]),
            "shelfRightsPostHoc": copy.deepcopy(slices["shelfRightsPostHoc"]),
            "highValue": copy.deepcopy(slices["highValue"]),
        },
        "long_tail_dormant_sparse_spike_and_rights_term_slices": {
            "longTail": copy.deepcopy(slices["longTail"]),
            "dormant": copy.deepcopy(slices["dormant"]),
            "sparseIncome": copy.deepcopy(slices["sparseIncome"]),
            "spikeCandidate": copy.deepcopy(slices["spikeCandidate"]),
            "rightsTermTypePostHoc": copy.deepcopy(slices["rightsTermTypePostHoc"]),
        },
        "wape_signed_bias_internal_coverage_wis_and_standardized_width": {
            "byModel": {
                model: {
                    "populations": copy.deepcopy(metrics["populations"]),
                    "internalInterval": copy.deepcopy(metrics["internalInterval"]),
                }
                for model, metrics in overall.items()
            }
        },
        "paired_two_way_bootstrap": copy.deepcopy(report["pairedTwoWayBootstrap"]),
        "eligibility_top10_coverage_extrapolated_and_limitation_distribution": {
            "eligibilityAndCoverageByModel": eligibility,
            "extrapolatedLongHorizonCaseCountByModel": extrapolated,
            "developmentForwardLimitationDistribution": limitation_distribution(
                forward_rows, minimum_cell
            ),
            "developmentSafeLongAuditLimitationDistribution": limitation_distribution(
                long_rows, minimum_cell
            ),
        },
        "all_gate_failures_and_unverified_items": failures,
        "not_for_formal_decision_release_and_M3_boundary": {
            "decisionStatus": report["decisionStatus"],
            "releaseBoundary": copy.deepcopy(report["releaseBoundary"]),
            "finalHoldoutOpened": report["integrity"]["finalHoldoutOpened"],
            "embargoShadowOpened": report["integrity"]["embargoShadowOpened"],
            "deferredLongAuditLabelsOpened": report["integrity"][
                "deferredLongAuditLabelsOpened"
            ],
        },
    }
    expected = list(
        spec["reporting"]["committableAggregateReport"]["requiredSections"]
    )
    if list(sections) != expected:
        raise ReplayError("committable report required-section order or membership mismatch")
    return sections


def assert_required_report_shape(
    report: Mapping[str, Any], spec: Mapping[str, Any]
) -> None:
    expected = list(
        spec["reporting"]["committableAggregateReport"]["requiredSections"]
    )
    sections = report.get("requiredSections")
    if not isinstance(sections, Mapping) or list(sections) != expected:
        raise ReplayError("committable report does not implement every frozen required section")
    if any(not isinstance(sections[name], Mapping) or not sections[name] for name in expected):
        raise ReplayError("committable report contains an empty or malformed required section")
    authority = sections["authority_spec_code_and_case_fingerprints"]
    if authority.get("specCommit") != FROZEN_REVISION_5_COMMIT:
        raise ReplayError("committable report has the wrong frozen spec commit")
    if int(authority.get("specRevision", -1)) != int(spec["preHoldoutRevision"]):
        raise ReplayError("committable report has the wrong frozen spec revision")
    for name in ("specCommit", "fitCodeCommit", "fittedArtifactCommit"):
        if not re.fullmatch(r"[0-9a-f]{40}", str(authority.get(name, ""))):
            raise ReplayError(f"committable report provenance is invalid: {name}")
    for name in ("specDigest", "fittedArtifactSha256"):
        if not re.fullmatch(r"[0-9a-f]{64}", str(authority.get(name, ""))):
            raise ReplayError(f"committable report digest is invalid: {name}")
    authority_scope = authority.get("authority", {})
    if int(authority_scope.get("standardWorkCount", -1)) != int(
        spec["authority"]["standardWorkCount"]
    ) or int(authority_scope.get("incomeFactCount", -1)) != int(
        spec["authority"]["incomeFactCount"]
    ):
        raise ReplayError("committable report authority scope is not exact")
    for name, value in authority.get("caseFingerprints", {}).items():
        if not re.fullmatch(r"[0-9a-f]{64}", str(value)):
            raise ReplayError(f"committable report fingerprint is invalid: {name}")
    if set(authority.get("caseFingerprints", {})) != {
        "fit",
        "comparator",
        "oofPrediction",
        "intervalWarmupPrediction",
        "intervalWarmupCase",
    }:
        raise ReplayError("committable report case-fingerprint set is incomplete")
    failures = sections["all_gate_failures_and_unverified_items"]
    if not isinstance(failures.get("baselineDiagnosticFailures"), list):
        raise ReplayError("committable report gate-failure list is malformed")
    if not isinstance(failures.get("unverifiedItems"), list) or not failures[
        "unverifiedItems"
    ]:
        raise ReplayError("committable report must enumerate unverified items")
    limitation = sections[
        "eligibility_top10_coverage_extrapolated_and_limitation_distribution"
    ]
    for name in (
        "developmentForwardLimitationDistribution",
        "developmentSafeLongAuditLimitationDistribution",
    ):
        item = limitation.get(name)
        if not isinstance(item, Mapping) or not isinstance(item.get("cells"), list):
            raise ReplayError("committable report limitation distribution is malformed")
    boundary = sections["not_for_formal_decision_release_and_M3_boundary"]
    if boundary.get("decisionStatus") != "not_for_formal_decision":
        raise ReplayError("committable report decision boundary is not closed")
    release = boundary.get("releaseBoundary", {})
    if release.get("formalDecisionAllowed") or release.get("releaseAllowed") or release.get(
        "m3Allowed"
    ):
        raise ReplayError("committable report release/M3 boundary is open")


def assert_committable_report_privacy(
    report: Mapping[str, Any], spec: Mapping[str, Any]
) -> None:
    """Fail closed before a committable aggregate report reaches disk."""

    assert_required_report_shape(report, spec)
    forbidden = {
        str(value).casefold()
        for value in spec["reporting"]["committableAggregateReport"]["forbidden"]
    }
    forbidden |= {
        "standard_work_id",
        "standardworkid",
        "channel_key",
        "channelkey",
        "work_id",
        "workid",
        "work_title",
        "privateevidence",
        "privatepath",
        "privatepaths",
        "_internal_interval",
        "internal_pi_lower",
        "internal_pi_upper",
    }
    minimum_cell_count = int(
        spec["reporting"]["committableAggregateReport"]["minimumCellCount"]
    )
    sensitive_metric_keys = {
        "actualtotal",
        "availablecasecount",
        "blockedcasecount",
        "completeonrequiredpopulation",
        "forecastablecasecount",
        "forecastablerevenuecoverage",
        "forecastablerevenuecoveragesuppressed",
        "gateeligible",
        "predictedtotal",
        "wape",
        "signedaggregatebias",
        "internal80coverage",
        "meanwis",
        "missingcasecount",
        "nullpredictioncount",
        "nullpredictionevaluationvalue",
        "requiredcasecount",
        "standardizedwidth",
        "top10forecastablerevenuecoverage",
        "top10forecastablerevenuecoveragesuppressed",
    }

    def visit(value: Any) -> None:
        if isinstance(value, Mapping):
            normalized_keys = {str(key).casefold() for key in value}
            case_count = value.get("caseCount")
            if isinstance(case_count, int) and not isinstance(case_count, bool) and case_count < minimum_cell_count:
                raise ReplayError(
                    "committable aggregate report exposes a numeric small-cell count"
                )
            if case_count == f"<{minimum_cell_count}":
                if value.get("suppressed") is not True:
                    raise ReplayError(
                        "committable aggregate report has an unmarked small cell"
                    )
                if normalized_keys & sensitive_metric_keys:
                    raise ReplayError(
                        "committable aggregate report retains metrics in a small cell"
                    )
            unique_work_count = value.get("uniqueWorkCount")
            if (
                isinstance(unique_work_count, int)
                and not isinstance(unique_work_count, bool)
                and unique_work_count < minimum_cell_count
            ):
                raise ReplayError(
                    "committable aggregate report exposes a numeric work-level small-cell count"
                )
            if unique_work_count == f"<{minimum_cell_count}":
                if value.get("suppressed") is not True:
                    raise ReplayError(
                        "committable aggregate report has an unmarked work-level small cell"
                    )
                if normalized_keys & sensitive_metric_keys:
                    raise ReplayError(
                        "committable aggregate report retains metrics in a work-level small cell"
                    )
            forecastable_unique_work_count = value.get(
                "forecastableUniqueWorkCount"
            )
            if (
                isinstance(forecastable_unique_work_count, int)
                and not isinstance(forecastable_unique_work_count, bool)
                and forecastable_unique_work_count < minimum_cell_count
            ):
                raise ReplayError(
                    "committable aggregate report exposes a numeric forecastable-work small-cell count"
                )
            if forecastable_unique_work_count == f"<{minimum_cell_count}":
                if value.get("forecastableRevenueCoverageSuppressed") is not True:
                    raise ReplayError(
                        "committable aggregate report has an unmarked forecastable-work small cell"
                    )
                if value.get("forecastableRevenueCoverage") is not None:
                    raise ReplayError(
                        "committable aggregate report retains coverage for too few forecastable works"
                    )
            required_case_count = value.get("requiredCaseCount")
            if (
                isinstance(required_case_count, int)
                and not isinstance(required_case_count, bool)
                and required_case_count < minimum_cell_count
                and normalized_keys & sensitive_metric_keys
            ):
                raise ReplayError(
                    "committable aggregate report exposes interval metrics for a small cell"
                )
            if value.get("suppressed") is True:
                if (
                    case_count != f"<{minimum_cell_count}"
                    and unique_work_count != f"<{minimum_cell_count}"
                ):
                    raise ReplayError(
                        "committable aggregate report has a malformed suppressed cell"
                    )
                if normalized_keys & sensitive_metric_keys:
                    raise ReplayError(
                        "committable aggregate report retains metrics in a suppressed cell"
                    )
            for key, child in value.items():
                normalized = str(key).casefold()
                if normalized in forbidden:
                    raise ReplayError(
                        f"committable aggregate report contains forbidden key: {key}"
                    )
                visit(child)
        elif isinstance(value, (list, tuple)):
            for child in value:
                visit(child)
        elif isinstance(value, str):
            normalized_value = value.replace("\\", "/").casefold()
            if "data/private-output/" in normalized_value:
                raise ReplayError("committable aggregate report contains a private path")
            root_text = str(ROOT).replace("\\", "/").casefold()
            if root_text and root_text in normalized_value:
                raise ReplayError("committable aggregate report contains a machine-local path")

    visit(report)
    boundary = report.get("reportingBoundary", {})
    if boundary.get("aggregateOnly") is not True:
        raise ReplayError("committable report is not declared aggregate-only")
    if boundary.get("workOrChannelIdentifiersPresent") is not False:
        raise ReplayError("committable report identifier boundary is not closed")
    if boundary.get("internalPredictionIntervalEndpointsPresent") is not False:
        raise ReplayError("committable report exposes internal PI endpoints")


def synthetic_report_shape_privacy_evidence(spec: Mapping[str, Any]) -> dict[str, Any]:
    """Exercise required-section shape and recursive privacy fail-closed behavior."""

    minimum_cell_count = int(
        spec["reporting"]["committableAggregateReport"]["minimumCellCount"]
    )
    required = list(
        spec["reporting"]["committableAggregateReport"]["requiredSections"]
    )
    sections: dict[str, Any] = {name: {"synthetic": True} for name in required}
    sections["authority_spec_code_and_case_fingerprints"] = {
        "authority": {
            "standardWorkCount": int(spec["authority"]["standardWorkCount"]),
            "incomeFactCount": int(spec["authority"]["incomeFactCount"]),
        },
        "specRevision": int(spec["preHoldoutRevision"]),
        "specDigest": spec_digest(spec),
        "specCommit": FROZEN_REVISION_5_COMMIT,
        "fitCodeCommit": "a" * 40,
        "fittedArtifactCommit": "c" * 40,
        "fittedArtifactSha256": "d" * 64,
        "caseFingerprints": {
            "fit": "b" * 64,
            "comparator": "b" * 64,
            "oofPrediction": "b" * 64,
            "intervalWarmupPrediction": "b" * 64,
            "intervalWarmupCase": "b" * 64,
        },
    }
    sections["all_gate_failures_and_unverified_items"] = {
        "baselineDiagnosticFailures": [],
        "unverifiedItems": [{"item": "synthetic"}],
    }
    sections[
        "eligibility_top10_coverage_extrapolated_and_limitation_distribution"
    ] = {
        "developmentForwardLimitationDistribution": {"cells": []},
        "developmentSafeLongAuditLimitationDistribution": {"cells": []},
    }
    sections["not_for_formal_decision_release_and_M3_boundary"] = {
        "decisionStatus": "not_for_formal_decision",
        "releaseBoundary": {
            "formalDecisionAllowed": False,
            "releaseAllowed": False,
            "m3Allowed": False,
        },
    }
    report = {
        "requiredSections": sections,
        "reportingBoundary": {
            "aggregateOnly": True,
            "workOrChannelIdentifiersPresent": False,
            "internalPredictionIntervalEndpointsPresent": False,
        },
    }
    synthetic_rows: list[dict[str, Any]] = []
    for index in range((minimum_cell_count * 2) - 1):
        forecastable = index < minimum_cell_count
        synthetic_rows.append(
            {
                "model_id": "B0b",
                "case_key": {
                    "standard_work_id": (
                        "SYNTHETIC-FORECASTABLE"
                        if forecastable
                        else f"SYNTHETIC-BLOCKED-{index}"
                    ),
                    "origin": "2020-12",
                    "horizon_months": 3,
                    "route": "pure_sales_share",
                },
                "route": "pure_sales_share",
                "actual": 10.0,
                "point_forecast": 10.0 if forecastable else None,
                "eligibility": {
                    "status": (
                        "forecastable_numeric"
                        if forecastable
                        else "blocked_insufficient_history"
                    )
                },
                "confidence": "medium" if forecastable else "unavailable",
                "strata": {
                    "horizon": 3,
                    "revenue_model": "pure_sales_share",
                    "source": "synthetic",
                    "shelf_rights": "synthetic",
                    "rights_term_type": "perpetual",
                    "high_value": forecastable,
                    "value_band": "top_1_percent" if forecastable else "other_positive",
                    "long_tail": False,
                    "dormant": False,
                    "sparse_income": False,
                    "spike_candidate": False,
                    "top_10_percent": forecastable,
                },
                "_internal_interval": (
                    {
                        "available": True,
                        "lower": 0.0,
                        "upper": 20.0,
                        "covered": True,
                        "wis": 2.0,
                        "width": 20.0,
                    }
                    if forecastable
                    else {"available": False}
                ),
            }
        )
    report["requiredSections"][required[2]]["nestedPopulationFixture"] = aggregate_report(
        synthetic_rows,
        minimum_cell_count,
        spec,
    )
    assert_committable_report_privacy(report, spec)
    nested_small_cells_suppressed = (
        report["requiredSections"][required[2]]["nestedPopulationFixture"]
        ["overall"]["B0b"]["populations"]["forecastableNumeric"]
        == {
            "suppressed": True,
            "caseCount": minimum_cell_count,
            "uniqueWorkCount": f"<{minimum_cell_count}",
        }
        and report["requiredSections"][required[2]]["nestedPopulationFixture"]
        ["overall"]["B0b"]["populations"]["highValueAll"]
        == {
            "suppressed": True,
            "caseCount": minimum_cell_count,
            "uniqueWorkCount": f"<{minimum_cell_count}",
        }
        and report["requiredSections"][required[2]]["nestedPopulationFixture"]
        ["overall"]["B0b"]["internalInterval"]
        == {
            "suppressed": True,
            "caseCount": minimum_cell_count,
            "uniqueWorkCount": f"<{minimum_cell_count}",
        }
    )
    recursive_privacy_failed_closed = False
    bad_privacy = copy.deepcopy(report)
    bad_privacy["requiredSections"][required[1]]["nested"] = [
        {"standard_work_id": "forbidden"}
    ]
    try:
        assert_committable_report_privacy(bad_privacy, spec)
    except ReplayError:
        recursive_privacy_failed_closed = True
    missing_section_failed_closed = False
    bad_shape = copy.deepcopy(report)
    del bad_shape["requiredSections"][required[-1]]
    try:
        assert_committable_report_privacy(bad_shape, spec)
    except ReplayError:
        missing_section_failed_closed = True
    small_cell_metrics_failed_closed = False
    bad_small_cell = copy.deepcopy(report)
    bad_small_cell["requiredSections"][required[2]]["smallMetricCell"] = {
        "caseCount": 1,
        "actualTotal": 100.0,
        "predictedTotal": 90.0,
        "wape": 0.1,
    }
    try:
        assert_committable_report_privacy(bad_small_cell, spec)
    except ReplayError:
        small_cell_metrics_failed_closed = True
    suppressed_cell_metrics_failed_closed = False
    bad_suppressed_cell = copy.deepcopy(report)
    bad_suppressed_cell["requiredSections"][required[2]]["smallMetricCell"] = {
        "suppressed": True,
        "caseCount": f"<{spec['reporting']['committableAggregateReport']['minimumCellCount']}",
        "actualTotal": 100.0,
    }
    try:
        assert_committable_report_privacy(bad_suppressed_cell, spec)
    except ReplayError:
        suppressed_cell_metrics_failed_closed = True
    coverage_only_small_cell_failed_closed = False
    bad_coverage_cell = copy.deepcopy(report)
    bad_coverage_cell["requiredSections"][required[2]]["smallMetricCell"] = {
        "caseCount": f"<{minimum_cell_count}",
        "forecastableRevenueCoverage": 0.5,
        "top10ForecastableRevenueCoverage": 0.5,
    }
    try:
        assert_committable_report_privacy(bad_coverage_cell, spec)
    except ReplayError:
        coverage_only_small_cell_failed_closed = True
    unique_work_small_cell_failed_closed = False
    bad_unique_work_cell = copy.deepcopy(report)
    bad_unique_work_cell["requiredSections"][required[2]]["smallMetricCell"] = {
        "caseCount": minimum_cell_count,
        "uniqueWorkCount": 1,
        "actualTotal": 100.0,
        "predictedTotal": 90.0,
    }
    try:
        assert_committable_report_privacy(bad_unique_work_cell, spec)
    except ReplayError:
        unique_work_small_cell_failed_closed = True
    unique_work_count_only_failed_closed = False
    bad_unique_work_count_only = copy.deepcopy(report)
    bad_unique_work_count_only["requiredSections"][required[2]]["smallMetricCell"] = {
        "caseCount": minimum_cell_count,
        "uniqueWorkCount": 1,
    }
    try:
        assert_committable_report_privacy(bad_unique_work_count_only, spec)
    except ReplayError:
        unique_work_count_only_failed_closed = True
    forecastable_work_count_only_failed_closed = False
    bad_forecastable_work_count_only = copy.deepcopy(report)
    bad_forecastable_work_count_only["requiredSections"][required[2]]["smallMetricCell"] = {
        "caseCount": minimum_cell_count,
        "forecastableUniqueWorkCount": 1,
    }
    try:
        assert_committable_report_privacy(bad_forecastable_work_count_only, spec)
    except ReplayError:
        forecastable_work_count_only_failed_closed = True
    return {
        "requiredSectionCount": len(required),
        "validShapeAccepted": True,
        "recursivePrivacyFailedClosed": recursive_privacy_failed_closed,
        "missingSectionFailedClosed": missing_section_failed_closed,
        "smallCellMetricsFailedClosed": small_cell_metrics_failed_closed,
        "suppressedCellMetricsFailedClosed": suppressed_cell_metrics_failed_closed,
        "coverageOnlySmallCellFailedClosed": coverage_only_small_cell_failed_closed,
        "nestedSmallCellsSuppressed": nested_small_cells_suppressed,
        "uniqueWorkSmallCellFailedClosed": unique_work_small_cell_failed_closed,
        "uniqueWorkCountOnlyFailedClosed": unique_work_count_only_failed_closed,
        "forecastableWorkCountOnlyFailedClosed": forecastable_work_count_only_failed_closed,
        "allChecksPass": recursive_privacy_failed_closed
        and missing_section_failed_closed
        and small_cell_metrics_failed_closed
        and suppressed_cell_metrics_failed_closed
        and coverage_only_small_cell_failed_closed
        and nested_small_cells_suppressed
        and unique_work_small_cell_failed_closed
        and unique_work_count_only_failed_closed
        and forecastable_work_count_only_failed_closed,
    }


def markdown_report(report: Mapping[str, Any]) -> str:
    metrics = report["developmentBaseline"]["overall"]
    lines = [
        "# M2 calibration baseline replay v1",
        "",
        f"- Mode: `{report['mode']}`",
        f"- Decision status: `{report['decisionStatus']}`",
        f"- Spec digest: `{report['specDigest']}`",
        f"- Locked comparator: `{report['lockedComparator']}`",
        "- Boundary: baseline audit/replay only; no candidate training, formal decision, release, or M3.",
        "- Public contract: point value, annual breakdown, confidence, and limitation only; PI endpoints remain internal.",
        "",
        "## Development baseline metrics",
        "",
        "| Model | Cases | Forecastable | Coverage-aware WAPE | Overall bias | Forecastable WAPE | High-value bias | Internal 80% coverage | Mean WIS |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for model_id in BASELINE_IDS:
        item = metrics[model_id]
        overall = item["populations"]["coverageAwareOverall"]
        forecastable = item["populations"]["forecastableNumeric"]
        high_value = item["populations"]["highValueAll"]
        interval = item["internalInterval"]
        lines.append(
            "| {model} | {cases} | {forecastable_cases} | {overall_wape} | {overall_bias} | {forecastable_wape} | {high_value_bias} | {coverage} | {wis} |".format(
                model=model_id,
                cases=item["caseCount"],
                forecastable_cases=item["forecastableCaseCount"],
                overall_wape=overall["wape"],
                overall_bias=overall["signedAggregateBias"],
                forecastable_wape=forecastable["wape"],
                high_value_bias=high_value["signedAggregateBias"],
                coverage=interval["internal80Coverage"],
                wis=interval["meanWis"],
            )
        )
    lines.extend(
        [
            "",
            "## Integrity and interpretation",
            "",
            f"- Authority scope: `{report['inputEvidence']['standardWorkCount']}` works / "
            f"`{report['inputEvidence']['incomeFactCount']}` facts.",
            f"- B0b-B3 case-key parity: `{report['integrity']['caseKeyParity']}`.",
            f"- Future-perturbation synthetic invariance: `{report['integrity']['futurePerturbationInvariant']}`.",
            f"- Interval warmup prediction locked before truth join: `{report['integrity']['intervalWarmupPredictionLockedBeforeTruthJoin']}`.",
            f"- Warmup prediction lock covers `{report['intervalWarmupEvidence']['fullPredictionOriginHorizonBlockCount']}` origin-horizon blocks; the earliest score origin admits exactly `{report['intervalWarmupEvidence']['expectedAvailableOriginHorizonBlockCount']}` target-available residual blocks for every baseline.",
            "- Warmup rows calibrate internal PI only; they are excluded from point metrics, comparator selection, and bootstrap.",
            f"- Final holdout opened: `{report['integrity']['finalHoldoutOpened']}`.",
            "- Source, shelf/rights, and rights-term slices are post-hoc only and were not prediction features.",
            "- B0a is the rejected historical audit record only and is excluded from fair case replay.",
            "- Only 36-month audit labels ending by the development purge were opened; all 60-month and deferred labels remain closed, and every >24-month point remains `extrapolated`.",
            "",
        ]
    )
    return "\n".join(lines)


def write_public_report(mode: str, report: Mapping[str, Any]) -> tuple[Path, Path]:
    spec = calibration.load_spec(SPEC_PATH)
    assert_committable_report_privacy(report, spec)
    json_path, md_path = public_paths(mode)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    json_path.write_bytes(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True).encode("utf-8") + b"\n")
    md_path.write_text(markdown_report(report), encoding="utf-8", newline="\n")
    return json_path, md_path


def run_replay(mode: str, spec: Mapping[str, Any], frozen_commit: str | None) -> dict[str, Any]:
    if mode != "development":
        raise ReplayError(
            "final holdout is unavailable in the baseline replay runner; "
            "complete user-approved C1->C2-R->C2->C3 training and commit the "
            "candidate artifact before any separate final-opening workflow"
        )
    calibration.validate_spec(spec)
    try:
        fixture = calibration.contract_self_test()
    except RuntimeError as exc:
        raise ReplayError(
            "development replay requires the bundled Python dependencies; "
            "use scripts/run-codex-python.mjs"
        ) from exc
    if not all(fixture["checks"].values()):
        raise ReplayError("synthetic boundary checks failed before real-data replay")
    refit_invariance = synthetic_forward_refit_invariance(spec)
    if not (
        refit_invariance["factorsInvariant"]
        and refit_invariance["oofPointsInvariant"]
        and refit_invariance[
            "warmupPredictionFingerprintInvariantToOutcomePerturbation"
        ]
    ):
        raise ReplayError("synthetic B0b forward-refit invariance failed before replay")
    if frozen_commit:
        raise ReplayError("--frozen-spec-commit is unavailable in the baseline replay runner")
    require_clean_worktree()
    artifact_with_bound, artifact_path = load_and_validate_fitted_artifact(spec)
    replay_spec = artifact_with_bound.pop("_boundSpec")

    works, posthoc, input_evidence = load_authorized_works(spec)
    # Revision 5 cold-start warmup predictions are deliberately generated from
    # the unbound frozen spec.  In particular, B0b uses initialFactors here;
    # neither the fitted artifact nor any outcome label may affect this lock.
    warmup_predictions = generate_predictions(
        works,
        interval_warmup_origins(spec),
        spec,
        b0b_parameter_role="interval_warmup_cold_start",
    )
    warmup_locks = lock_interval_warmup_predictions(warmup_predictions, spec)
    development_predictions = generate_predictions(
        works,
        development_origins(spec),
        spec,
        b0b_parameter_role="prefit_development_template",
    )
    development_parity = calibration.assert_case_key_parity(development_predictions)
    warmup_rows = join_truth(warmup_predictions, works, spec)
    warmup_evidence = complete_interval_warmup_evidence(
        warmup_rows, warmup_locks, spec
    )
    warmup_availability = interval_warmup_availability_evidence(
        warmup_evidence, spec
    )
    development_rows = join_truth(development_predictions, works, spec)
    recomputed_fit = b0b_fit_evidence(development_rows, spec)
    recomputed_fit["intervalWarmup"] = warmup_evidence["B0b"]
    validate_recomputed_b0b_fit(
        artifact_with_bound, recomputed_fit, input_evidence
    )
    validate_artifact_case_fingerprint(
        artifact_with_bound, numeric_b0b_fit_rows(development_rows)
    )
    materialize_b0b_forward_predictions(
        development_rows, works, spec, recomputed_fit
    )
    attach_b0b_oof_comparison_points(development_rows, recomputed_fit)
    attach_strata(development_rows, works, posthoc)
    forward_rows, forward_parity = exact_forward_score_rows(
        development_rows, spec, recomputed_fit
    )
    for row in forward_rows:
        row["label_available_as_of"] = str(
            row.get("label_available_as_of")
            or row.get("_available_as_of")
            or row["target_end"]
        )
        row["_residual_case_role"] = "development_forward_score"
    attach_strata(warmup_rows, works, posthoc)
    interval_calibration_rows = [*warmup_rows, *forward_rows]
    apply_internal_intervals(forward_rows, interval_calibration_rows, spec)
    minimum_cell = int(spec["reporting"]["committableAggregateReport"]["minimumCellCount"])
    development_aggregate = aggregate_report(forward_rows, minimum_cell, spec)
    locked_comparator = select_locked_comparator(development_aggregate)
    bootstrap = paired_two_way_bootstrap(forward_rows, locked_comparator, spec)

    long_included, long_deferred = long_audit_origins(
        spec, development_safe_only=True
    )
    # Only the 36-month labels whose target_end is inside the development
    # purge may be joined.  Every 60-month and deferred 36-month label stays
    # closed in this runner.
    long_predictions = generate_predictions(
        works,
        long_included,
        replay_spec,
        b0b_parameter_role="committed_development_fit",
    )
    target_rows = (
        join_truth(long_predictions, works, replay_spec)
        if any(long_included.values())
        else []
    )
    attach_strata(target_rows, works, posthoc)
    apply_internal_intervals(target_rows, interval_calibration_rows, spec)

    core_horizons = set(int(item) for item in spec["backtest"]["coreHorizonsMonths"])
    target_long = [row for row in target_rows if int(row["case_key"]["horizon_months"]) not in core_horizons]
    target_long_eligible = [
        row for row in target_long if long_horizon_cohort_eligible(row, spec)
    ]
    long_generated_keys = {case_key(row) for row in target_long}
    long_eligible_keys = {case_key(row) for row in target_long_eligible}
    long_counts_by_horizon = {}
    public_count = lambda count: (
        f"<{minimum_cell}" if int(count) < minimum_cell else int(count)
    )
    for horizon in spec["backtest"]["longHorizonAuditMonths"]:
        generated = {
            case_key(row) for row in target_long
            if int(row["case_key"]["horizon_months"]) == int(horizon)
        }
        eligible = {
            case_key(row) for row in target_long_eligible
            if int(row["case_key"]["horizon_months"]) == int(horizon)
        }
        long_counts_by_horizon[str(horizon)] = {
            "generatedAggregateCaseCount": public_count(len(generated)),
            "eligibleAggregateCaseCount": public_count(len(eligible)),
        }
    target_parity = (
        calibration.assert_case_key_parity(
            {
                model: [row for row in target_rows if row["model_id"] == model]
                for model in BASELINE_IDS
            }
        )
        if target_rows
        else {"aggregateKeysUnique": True, "keySetsEqual": True, "channelComponentsReconcile": True}
    )
    b0a = next(item for item in spec["models"]["baselines"] if item["id"] == "B0a")
    report = {
        "schema": "m2.calibration-baseline-replay.aggregate.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "mode": mode,
        "decisionStatus": "not_for_formal_decision",
        "specVersion": spec["version"],
        "specDigest": spec_digest(spec),
        "inputEvidence": input_evidence,
        "B0aHistoricalAuditOnly": {
            "fairComparisonEligible": False,
            "recordedMetrics": b0a["recordedMetrics"],
            "note": "rejected_v1_1_historical_audit_only_no_case_replay",
        },
        "developmentBaseline": development_aggregate,
        "lockedComparator": locked_comparator,
        "pairedTwoWayBootstrap": bootstrap,
        "intervalWarmupEvidence": warmup_availability,
        "B0bFittedParameterEvidence": {
            "artifactSha256": hashlib.sha256(artifact_path.read_bytes()).hexdigest(),
            "fitCaseFingerprint": recomputed_fit["fitCaseFingerprint"],
            "comparatorCaseFingerprint": recomputed_fit[
                "comparatorCaseFingerprint"
            ],
            "oofPredictionFingerprint": recomputed_fit[
                "oofPredictionFingerprint"
            ],
            "intervalWarmupPredictionFingerprint": recomputed_fit[
                "intervalWarmup"
            ]["predictionFingerprint"],
            "intervalWarmupCaseFingerprint": recomputed_fit["intervalWarmup"][
                "caseFingerprint"
            ],
            "intervalWarmupPredictionLockedBeforeTruthJoin": True,
            "intervalWarmupUsesOutcomeLabelsForPrediction": False,
            "oofComparatorScoreUsed": True,
            "forwardScorePointSource": "materialized_predict_as_of_fixed_8_decimal",
            "lifecycleFactors": artifact_with_bound["B0b"]["lifecycleFactors"],
            "oofComparatorMetrics": artifact_with_bound["B0b"]["oofComparatorMetrics"],
            "legacyOutcomeExposedFactorsUsed": False,
        },
        "targetCore": None,
        "longHorizonAudit": {
            "maySelectModelOrThreshold": False,
            "includedOrigins": {str(key): value for key, value in long_included.items()},
            "deferredOrigins": {str(key): value for key, value in long_deferred.items()},
            "allPredictionsOver24MonthsMarkedExtrapolated": all(
                "extrapolated" in row.get("limitation", []) for row in target_long
            ) if target_long else True,
            "cohortDefinition": copy.deepcopy(spec["backtest"]["longHorizonEvidence"]),
            "generatedAggregateCaseCount": public_count(len(long_generated_keys)),
            "eligibleAggregateCaseCount": public_count(len(long_eligible_keys)),
            "generatedModelCaseRowCount": public_count(len(target_long)),
            "eligibleModelCaseRowCount": public_count(len(target_long_eligible)),
            "countsByHorizon": long_counts_by_horizon,
            "aggregate": aggregate_report(target_long_eligible, minimum_cell, spec)
            if target_long_eligible else None,
        },
        "integrity": {
            "authorityScopeExact": input_evidence["standardWorkCount"] == int(spec["authority"]["standardWorkCount"]),
            "incomeFactScopeExact": input_evidence["incomeFactCount"] == int(spec["authority"]["incomeFactCount"]),
            "caseKeyParity": (
                all(development_parity.values())
                and all(target_parity.values())
                and forward_parity["allScoredKeysIdentical"]
                and forward_parity["forecastableKeysIdentical"]
                and not forward_parity["intersectionDropUsed"]
            ),
            "developmentParity": development_parity,
            "forwardScoreParity": forward_parity,
            "targetParity": target_parity,
            "futurePerturbationInvariant": bool(fixture["checks"]["futurePerturbationInvariant"]),
            "futurePerturbationInferenceAndPublicOutputInvariant": bool(
                fixture["checks"]["futurePerturbationInvariant"]
            ),
            "futurePerturbationForwardRefitInvariant": bool(
                refit_invariance["factorsInvariant"]
                and refit_invariance["oofPointsInvariant"]
            ),
            "futurePerturbationWarmupPredictionFingerprintInvariant": bool(
                refit_invariance[
                    "warmupPredictionFingerprintInvariantToOutcomePerturbation"
                ]
            ),
            "futurePerturbationForwardRefitEvidence": refit_invariance,
            "intervalWarmupPredictionLockedBeforeTruthJoin": all(
                bool(item["predictionLockedBeforeTruthJoin"])
                for item in warmup_availability["byModel"].values()
            ),
            "intervalWarmupUsesOutcomeLabelsForPrediction": any(
                bool(item["usesOutcomeLabelsForPrediction"])
                for item in warmup_availability["byModel"].values()
            ),
            "intervalWarmupExcludedFromPointMetricsComparatorAndBootstrap": True,
            "currentStatusPostHocOnly": bool(fixture["checks"]["currentStatusPostHocOnly"]),
            "finalHoldoutOpened": False,
            "embargoShadowOpened": False,
            "deferredLongAuditLabelsOpened": False,
        },
        "reportingBoundary": {
            "aggregateOnly": True,
            "minimumCellCount": minimum_cell,
            "workOrChannelIdentifiersPresent": False,
            "internalPredictionIntervalEndpointsPresent": False,
            "publicPredictionFields": list(spec["publicOutput"]["allowedFields"]),
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
    report["requiredSections"] = build_required_report_sections(
        report,
        forward_rows,
        target_long,
        artifact_with_bound,
        spec,
    )
    assert_committable_report_privacy(report, spec)
    private_evidence = write_private_details(
        mode,
        [*warmup_rows, *forward_rows, *target_rows],
        {
            "schema": "m2.calibration-baseline-replay.private-manifest.v1",
            "mode": mode,
            "decisionStatus": "not_for_formal_decision",
            "specDigest": spec_digest(spec),
            "inputFingerprint": input_evidence["inputFingerprint"],
        },
    )
    json_path, md_path = write_public_report(mode, report)
    return {
        "mode": mode,
        "decisionStatus": "not_for_formal_decision",
        "specDigest": report["specDigest"],
        "lockedComparator": locked_comparator,
        "publicJson": json_path.relative_to(ROOT).as_posix(),
        "publicMarkdown": md_path.relative_to(ROOT).as_posix(),
        "privateCaseRowCount": private_evidence["privateCaseRowCount"],
        "integrity": report["integrity"],
    }


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--preflight", action="store_true", help="synthetic-only; this is the default")
    modes.add_argument(
        "--fit-b0b-development-parameters",
        action="store_true",
        help="fit B0b only on purged development labels and write the tracked parameter artifact",
    )
    modes.add_argument("--run-development", action="store_true", help="open development labels only")
    modes.add_argument(
        "--run-final-holdout",
        action="store_true",
        help="prohibited here; retained only so legacy commands fail closed",
    )
    parser.add_argument(
        "--frozen-spec-commit",
        help="prohibited in this baseline-only runner",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    spec = calibration.load_spec(SPEC_PATH)
    try:
        if args.fit_b0b_development_parameters:
            if args.frozen_spec_commit:
                raise ReplayError(
                    "--frozen-spec-commit is not valid while fitting development-only B0b parameters"
                )
            result = fit_b0b_development_parameters(spec)
        elif args.run_development:
            result = run_replay("development", spec, args.frozen_spec_commit)
        elif args.run_final_holdout:
            raise ReplayError(
                "--run-final-holdout is unavailable in the baseline replay runner"
            )
        else:
            if args.frozen_spec_commit:
                raise ReplayError(
                    "--frozen-spec-commit is unavailable in the baseline replay runner"
                )
            result = preflight(spec)
        print(json.dumps(result, ensure_ascii=False, sort_keys=True))
        return 0
    except (ReplayError, AssertionError) as exc:
        print(json.dumps({"status": "failed", "reason": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
