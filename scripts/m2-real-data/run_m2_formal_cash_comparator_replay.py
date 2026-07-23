#!/usr/bin/env python3
"""Replay formal-cash comparators, audit surprise facts, and attest Gate B."""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import os
import pickle
import subprocess
import sys
from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any, Mapping, Sequence

import m2_calibration_v1 as base
import m2_calibration_v1_2 as v12
import m2_formal_cash_comparator_v1 as formal
import m2_formal_cash_target_v1 as cash
import run_m2_c1_failure_forensic as forensic
import run_m2_calibration_baseline_replay as legacy
import run_m2_calibration_v1_2 as phase


ROOT = Path(__file__).resolve().parents[2]
PUBLIC_DIR = ROOT / "docs" / "analysis" / "m2-real-data"
PRIVATE_DIR = ROOT / "data" / "private-output" / "m2-formal-cash-comparator-v1"
REPLAY_JSON = PUBLIC_DIR / "M2-formal-cash-comparator-replay-v1.json"
REPLAY_MD = PUBLIC_DIR / "M2-formal-cash-comparator-replay-v1.md"
BUNDLE_JSON = PUBLIC_DIR / "M2-formal-cash-comparator-bundle-v1.json"
BUNDLE_MD = PUBLIC_DIR / "M2-formal-cash-comparator-bundle-v1.md"
SURPRISE_JSON = PUBLIC_DIR / "M2-surprise-buyout-unique-impact-audit-v1.json"
SURPRISE_MD = PUBLIC_DIR / "M2-surprise-buyout-unique-impact-audit-v1.md"
COVERAGE_JSON = PUBLIC_DIR / "M2-formal-cash-population-business-coverage-v1.json"
COVERAGE_MD = PUBLIC_DIR / "M2-formal-cash-population-business-coverage-v1.md"
GATE_B_JSON = PUBLIC_DIR / "M2-calibration-gate-b-v1.json"
PRIVATE_CASES = PRIVATE_DIR / "M2-formal-cash-comparator-cases-private-v1.ndjson"
PRIVATE_MANIFEST = PRIVATE_DIR / "M2-formal-cash-comparator-manifest-private-v1.json"
PRIVATE_VALIDATION = PRIVATE_DIR / "M2-calibration-gate-b-validation-private-v1.json"
PRIVATE_PUSH_RECEIPT = PRIVATE_DIR / "M2-calibration-gate-b-push-private-v1.json"
BRANCH = "codex/m2-calibration-v1"
SYNTHETIC_DEVELOPMENT_BRANCH_PREFIX = "codex/m2-"
PHASE_A_START_HEAD = "c7f1c21ea54f2a16ffd753afebfa157cfbf6ca12"
MINIMUM_CELL = 10
AGGREGATE_TOLERANCE = 0.01
PHASE_A_TRACKED_PATHS = (
    ROOT / "package.json",
    ROOT / "src/domain/oldProductEvaluation/calibrationSpec.formalCashComparator.v1.json",
    ROOT / "scripts/m2-real-data/m2_formal_cash_target_v1.py",
    ROOT / "scripts/m2-real-data/m2_formal_cash_comparator_v1.py",
    ROOT / "scripts/m2-real-data/run_m2_formal_cash_comparator_replay.py",
    ROOT / "test/m2-formal-cash-comparator.test.js",
    REPLAY_JSON,
    REPLAY_MD,
    BUNDLE_JSON,
    BUNDLE_MD,
    SURPRISE_JSON,
    SURPRISE_MD,
    COVERAGE_JSON,
    COVERAGE_MD,
    GATE_B_JSON,
)
IMMUTABLE_PHASE_A_PATHS = tuple(
    path for path in PHASE_A_TRACKED_PATHS if path not in {ROOT / "package.json", GATE_B_JSON}
)


class FormalReplayError(RuntimeError):
    """Formal-cash comparator evidence could not be reproduced safely."""


def progress(message: str) -> None:
    print(f"[formal-cash-comparator] {message}", file=sys.stderr, flush=True)


def run_git(*args: str, check: bool = True) -> str:
    process = subprocess.run(
        ["git", *args], cwd=ROOT, capture_output=True, text=True, check=False
    )
    if check and process.returncode != 0:
        raise FormalReplayError(process.stderr.strip() or "git command failed")
    return process.stdout.strip()


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def commit_artifact_digests(commit: str) -> dict[str, str]:
    output: dict[str, str] = {}
    for path in PHASE_A_TRACKED_PATHS:
        relative = path.relative_to(ROOT).as_posix()
        process = subprocess.run(
            ["git", "show", f"{commit}:{relative}"],
            cwd=ROOT,
            capture_output=True,
            check=False,
        )
        if process.returncode != 0:
            raise FormalReplayError(f"Phase A commit lacks tracked artifact: {relative}")
        output[relative] = hashlib.sha256(process.stdout).hexdigest()
    return output


def require_current_phase_a_sources_match_commit(
    committed: Mapping[str, Any],
) -> None:
    for path in IMMUTABLE_PHASE_A_PATHS:
        relative = path.relative_to(ROOT).as_posix()
        if not path.is_file() or file_sha256(path) != committed.get(relative):
            raise FormalReplayError(
                f"current Phase A dependency differs from pushed checkpoint: {relative}"
            )


def digest(value: Any) -> str:
    return formal.canonical_digest(value)


def rounded(value: Any, places: int = 8) -> float | None:
    if value is None:
        return None
    number = float(value)
    return round(number, places) if math.isfinite(number) else None


def money(value: Any) -> float:
    return round(float(value), 2)


def ratio(numerator: float, denominator: float) -> float | None:
    return float(numerator) / float(denominator) if float(denominator) != 0 else None


def write_json(path: Path, value: Mapping[str, Any]) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True, allow_nan=False)
        + "\n",
        encoding="utf-8",
        newline="\n",
    )


def write_text(path: Path, value: str) -> None:
    path.write_text(value.rstrip() + "\n", encoding="utf-8", newline="\n")


def public_value(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {
            str(key): public_value(child)
            for key, child in value.items()
            if key
            not in {
                "actualTotal",
                "predictedTotal",
                "forecastableActualByComponent",
                "totalLedgerActualByComponent",
                "surpriseActualByComponentMonth",
            }
        }
    if isinstance(value, list):
        return [public_value(child) for child in value]
    if isinstance(value, float):
        return rounded(value)
    return value


def _checkout_identity_decision(
    *,
    branch: str,
    allow_trusted_ci_checkout: bool,
    github_actions: str,
    event_name: str,
    head_ref: str,
    base_ref: str,
    github_ref: str,
    github_repository: str,
    github_sha: str,
    head_sha: str,
    parent_shas: Sequence[str],
    remote_head_sha: str,
    remote_main_sha: str,
    remote_event_head_sha: str = "",
) -> str | None:
    """Accept the named branch or an exact synthetic-only GitHub CI checkout."""

    if branch == BRANCH:
        return "named_branch"
    if (
        allow_trusted_ci_checkout
        and branch == "main"
        and github_actions == "true"
        and event_name == "push"
        and head_ref == ""
        and base_ref == ""
        and github_ref == "refs/heads/main"
        and github_repository == "KAtOReNA7/system"
        and github_sha == head_sha
        and remote_main_sha == head_sha
    ):
        return "trusted_main_push"
    if (
        allow_trusted_ci_checkout
        and branch == ""
        and github_actions == "true"
        and event_name == "pull_request"
        and head_ref != ""
        and base_ref == "main"
        and github_ref.startswith("refs/pull/")
        and github_ref.endswith("/merge")
        and github_repository == "KAtOReNA7/system"
        and head_sha != ""
        and head_sha == remote_event_head_sha
    ):
        return "trusted_pr_head"
    if not (
        allow_trusted_ci_checkout
        and branch == ""
        and github_actions == "true"
        and event_name == "pull_request"
        and head_ref == BRANCH
        and base_ref == "main"
        and github_ref.startswith("refs/pull/")
        and github_ref.endswith("/merge")
        and github_repository == "KAtOReNA7/system"
        and github_sha == head_sha
        and len(parent_shas) == 2
        and parent_shas[1] == remote_head_sha
    ):
        return None
    return "trusted_pr_merge_ref"


def _is_clean_local_main_checkout(
    *, branch: str, head_sha: str, remote_main_sha: str, worktree_status: str
) -> bool:
    """Allow only a clean local main that is exactly synchronized with origin/main."""

    return (
        branch == "main"
        and bool(head_sha)
        and head_sha == remote_main_sha
        and worktree_status == ""
    )


def _checkout_boundary_self_test() -> dict[str, bool]:
    merge_sha = "a" * 40
    base_sha = "b" * 40
    remote_head_sha = "c" * 40
    trusted = {
        "branch": "",
        "allow_trusted_ci_checkout": True,
        "github_actions": "true",
        "event_name": "pull_request",
        "head_ref": BRANCH,
        "base_ref": "main",
        "github_ref": "refs/pull/2/merge",
        "github_repository": "KAtOReNA7/system",
        "github_sha": merge_sha,
        "head_sha": merge_sha,
        "parent_shas": (base_sha, remote_head_sha),
        "remote_head_sha": remote_head_sha,
        "remote_main_sha": base_sha,
    }
    trusted_main = {
        **trusted,
        "branch": "main",
        "event_name": "push",
        "head_ref": "",
        "base_ref": "",
        "github_ref": "refs/heads/main",
        "remote_main_sha": merge_sha,
    }
    trusted_head = {
        **trusted,
        "github_sha": merge_sha,
        "head_sha": remote_head_sha,
        "parent_shas": ("e" * 40,),
        "remote_event_head_sha": remote_head_sha,
    }
    checks = {
        "syntheticM2DevelopmentBranchRecognized": _is_synthetic_development_branch(
            "codex/m2-c2-v1"
        ),
        "unrelatedSyntheticBranchRejected": not _is_synthetic_development_branch(
            "codex/unrelated"
        ),
        "namedBranchAccepted": _checkout_identity_decision(
            **{**trusted, "branch": BRANCH, "allow_trusted_ci_checkout": False}
        )
        == "named_branch",
        "exactPullRequestMergeRefAccepted": _checkout_identity_decision(**trusted)
        == "trusted_pr_merge_ref",
        "exactPullRequestHeadAccepted": _checkout_identity_decision(**trusted_head)
        == "trusted_pr_head",
        "exactPullRequestHeadWrongRemoteRejected": _checkout_identity_decision(
            **{**trusted_head, "remote_event_head_sha": "d" * 40}
        )
        is None,
        "exactMainPushAccepted": _checkout_identity_decision(**trusted_main)
        == "trusted_main_push",
        "cleanLocalMainAccepted": _is_clean_local_main_checkout(
            branch="main",
            head_sha=merge_sha,
            remote_main_sha=merge_sha,
            worktree_status="",
        ),
        "dirtyLocalMainRejected": not _is_clean_local_main_checkout(
            branch="main",
            head_sha=merge_sha,
            remote_main_sha=merge_sha,
            worktree_status=" M test/example.test.js",
        ),
        "divergedLocalMainRejected": not _is_clean_local_main_checkout(
            branch="main",
            head_sha=merge_sha,
            remote_main_sha="d" * 40,
            worktree_status="",
        ),
        "detachedCheckoutRejectedOutsideActions": _checkout_identity_decision(
            **{**trusted, "github_actions": "false"}
        )
        is None,
        "wrongHeadBranchRejected": _checkout_identity_decision(
            **{**trusted, "head_ref": "codex/other"}
        )
        is None,
        "wrongMergeSecondParentRejected": _checkout_identity_decision(
            **{**trusted, "parent_shas": (base_sha, "d" * 40)}
        )
        is None,
        "mainPushRejectedOutsideActions": _checkout_identity_decision(
            **{**trusted_main, "github_actions": "false"}
        )
        is None,
        "mainPushWrongRemoteRejected": _checkout_identity_decision(
            **{**trusted_main, "remote_main_sha": "d" * 40}
        )
        is None,
        "wrongRepositoryRejected": _checkout_identity_decision(
            **{**trusted_main, "github_repository": "other/system"}
        )
        is None,
        "formalModeDetachedCheckoutRejected": _checkout_identity_decision(
            **{**trusted, "allow_trusted_ci_checkout": False}
        )
        is None,
        "formalModeMainPushRejected": _checkout_identity_decision(
            **{**trusted_main, "allow_trusted_ci_checkout": False}
        )
        is None,
    }
    if not all(checks.values()):
        raise FormalReplayError("formal-cash checkout boundary self-test failed")
    return checks


def _is_synthetic_development_branch(branch: str) -> bool:
    return branch.startswith(SYNTHETIC_DEVELOPMENT_BRANCH_PREFIX)


def require_boundaries(
    *,
    allow_trusted_ci_checkout: bool = False,
    allow_synthetic_m2_branch: bool = False,
    allow_clean_local_main: bool = False,
) -> str:
    branch = run_git("branch", "--show-current")
    if branch == BRANCH:
        checkout_identity = "named_branch"
    elif allow_synthetic_m2_branch and _is_synthetic_development_branch(branch):
        checkout_identity = "synthetic_m2_development_branch"
    else:
        head_sha = run_git("rev-parse", "HEAD")
        revision = run_git("rev-list", "--parents", "-n", "1", "HEAD").split()
        remote_head_sha = run_git(
            "rev-parse", f"origin/{BRANCH}", check=False
        )
        remote_main_sha = run_git("rev-parse", "origin/main", check=False)
        if allow_clean_local_main and _is_clean_local_main_checkout(
            branch=branch,
            head_sha=head_sha,
            remote_main_sha=remote_main_sha,
            worktree_status=run_git("status", "--porcelain"),
        ):
            checkout_identity = "clean_local_main"
        else:
            event_head_ref = os.environ.get("GITHUB_HEAD_REF", "")
            remote_event_head_sha = (
                run_git(
                    "rev-parse",
                    "--verify",
                    f"refs/remotes/origin/{event_head_ref}^{{commit}}",
                    check=False,
                )
                if event_head_ref
                else ""
            )
            checkout_identity = _checkout_identity_decision(
                branch=branch,
                allow_trusted_ci_checkout=allow_trusted_ci_checkout,
                github_actions=os.environ.get("GITHUB_ACTIONS", ""),
                event_name=os.environ.get("GITHUB_EVENT_NAME", ""),
                head_ref=event_head_ref,
                base_ref=os.environ.get("GITHUB_BASE_REF", ""),
                github_ref=os.environ.get("GITHUB_REF", ""),
                github_repository=os.environ.get("GITHUB_REPOSITORY", ""),
                github_sha=os.environ.get("GITHUB_SHA", ""),
                head_sha=head_sha,
                parent_shas=tuple(revision[1:]),
                remote_head_sha=remote_head_sha,
                remote_main_sha=remote_main_sha,
                remote_event_head_sha=remote_event_head_sha,
            )
        if checkout_identity is None:
            raise FormalReplayError(
                f"formal-cash comparator must run on {BRANCH} or an exact "
                "synthetic-only clean local main or GitHub PR/main CI checkout"
            )
    contract = formal.load_spec()
    if any(value is not False for value in contract["seals"].values()):
        raise FormalReplayError("formal-cash comparator seal is open")
    for path in (
        PRIVATE_CASES,
        PRIVATE_MANIFEST,
        PRIVATE_VALIDATION,
        PRIVATE_PUSH_RECEIPT,
    ):
        if not phase.git_ignored(path):
            raise FormalReplayError(f"private formal comparator role is not ignored: {path.name}")
        if run_git("ls-files", "--", str(path)):
            raise FormalReplayError(f"private formal comparator role is tracked: {path.name}")
    if phase.tracked_private_artifacts():
        raise FormalReplayError("a private calibration artifact is tracked")
    return checkout_identity


def _role_templates(
    rows: Sequence[Mapping[str, Any]], role: str
) -> dict[str, dict[tuple[str, str, int, str], Mapping[str, Any]]]:
    output: dict[str, dict[tuple[str, str, int, str], Mapping[str, Any]]] = {}
    for model in formal.MODEL_IDS:
        values: dict[tuple[str, str, int, str], Mapping[str, Any]] = {}
        for row in rows:
            if row.get("model_id") != model or row.get("_residual_case_role") != role:
                continue
            key = formal.strict_case_key(row)
            if key in values:
                raise FormalReplayError(f"Phase A has duplicate {model} case keys for {role}")
            values[key] = row
        if not values:
            raise FormalReplayError(f"Phase A lacks {model} templates for {role}")
        output[model] = values
    reference = set(output[formal.MODEL_IDS[0]])
    if any(set(output[model]) != reference for model in formal.MODEL_IDS):
        raise FormalReplayError("Phase A comparator case keys differ")
    return output


def _b4_fold_specs(
    calibration_spec: Mapping[str, Any], origins: Sequence[str]
) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    relative = (
        PUBLIC_DIR / "M2-baseline-comparator-identity-correction-v1.json"
    ).relative_to(ROOT).as_posix()
    frozen = json.loads(
        forensic.git_blob_bytes(forensic.PHASE_A_CHECKPOINT, relative).decode("utf-8")
    )
    fold_fits = frozen.get("integrity", {}).get(
        "allBaselineMaterialization", {}
    ).get("foldFits", {})
    if set(fold_fits) != set(origins):
        raise FormalReplayError("frozen B4 fold factors are incomplete")
    specs: dict[str, dict[str, Any]] = {}
    evidence: dict[str, Any] = {}
    for origin in origins:
        fitted = copy.deepcopy(fold_fits[origin])
        if any(
            str(fitted[field]) > origin
            for field in (
                "trainingMaximumTargetEnd",
                "trainingMaximumLabelAvailableAsOf",
                "trainingMaximumBillMonth",
                "trainingMaximumSourceAvailableAsOf",
            )
        ):
            raise FormalReplayError("frozen B4 factor reads future truth")
        fold_spec = copy.deepcopy(calibration_spec)
        baseline = next(
            item for item in fold_spec["models"]["baselines"] if item["id"] == "B0b"
        )
        baseline["lifecycleFactors"] = copy.deepcopy(fitted["factors"])
        baseline.pop("boundFittedParameterDigest", None)
        specs[origin] = fold_spec
        evidence[origin] = {
            key: value for key, value in fitted.items() if key != "factors"
        }
    factor_routes = set(
        next(
            item
            for item in calibration_spec["models"]["baselines"]
            if item["id"] == "B0b"
        )["developmentFit"]["factorEligibleRoutes"]
    )
    if factor_routes != {"pure_sales_share", "buyout_plus_sales"}:
        raise FormalReplayError("B4 factor-eligible routes are not sales-only")
    return specs, evidence


def _prediction_projection(row: Mapping[str, Any]) -> dict[str, Any]:
    key = formal.strict_case_key(row)
    return {
        "modelId": row["model_id"],
        "role": row["_residual_case_role"],
        "caseKey": list(key),
        "statisticallyScoreable": row["statisticallyScoreable"],
        "businessServingEligible": row["businessServingEligible"],
        "modelPredictionAvailable": row["modelPredictionAvailable"],
        "routeAbstained": row["routeAbstained"],
        "rawModelPrediction": row["rawModelPrediction"],
        "servedPrediction": row["servedPrediction"],
        "abstentionReason": row["abstentionReason"],
        "annualBreakdown": copy.deepcopy(row["rawAnnualBreakdown"]),
        "confidence": row["confidence"],
        "limitation": copy.deepcopy(row["limitation"]),
        "formalModelPopulationEligible": row["formalModelPopulationEligible"],
    }


def _materialize_role(
    *,
    role: str,
    phase_rows: Sequence[Mapping[str, Any]],
    works_list: Sequence[Mapping[str, Any]],
    calibration_spec: Mapping[str, Any],
    b4_spec: Mapping[str, Any],
    b4_role: str,
    contexts: dict[str, dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    templates = _role_templates(phase_rows, role)
    works = {str(work["standard_work_id"]): work for work in works_list}
    predictions: list[dict[str, Any]] = []
    base_points: dict[tuple[str, tuple[str, str, int, str]], float | None] = {}
    for model in formal.MODEL_IDS:
        for key, source in sorted(templates[model].items()):
            kwargs: dict[str, Any] = {"long_horizon_evidence": key[2] > 24}
            prediction_spec = calibration_spec
            if model == "B0b":
                if key[1] not in contexts:
                    contexts[key[1]] = v12.build_b0b_context(
                        works_list, key[1], calibration_spec
                    )
                kwargs["b0b_context"] = contexts[key[1]]
            elif model == "B4":
                prediction_spec = b4_spec
                kwargs["b4_parameter_role"] = b4_role
            prediction = v12.predict_as_of(
                works[key[0]], key[1], key[2], model, prediction_spec, **kwargs
            )
            base_points[(model, key)] = prediction.get("point_forecast")
            predictions.append(
                formal.decorate_prediction(
                    prediction,
                    source,
                    commitment_snapshots=works[key[0]].get(
                        "cash_commitment_snapshots", []
                    ),
                )
            )
    ordered = sorted(
        predictions, key=lambda row: (str(row["model_id"]), formal.strict_case_key(row))
    )
    projection = [_prediction_projection(row) for row in ordered]
    lock = digest(projection)
    truth_by_key: dict[tuple[str, str, int, str], dict[str, Any]] = {}
    for key in sorted(set(formal.strict_case_key(row) for row in ordered)):
        source = templates["B4"][key]
        truth_by_key[key] = cash.build_formal_cash_actuals(
            works[key[0]],
            key[1],
            key[2],
            key[3],
            calibration_spec,
            label_available_as_of=str(source["label_available_as_of"]),
        )
    joined: list[dict[str, Any]] = []
    old_numeric_checks = 0
    discarded_legacy_buyout_points = 0
    for row in ordered:
        key = formal.strict_case_key(row)
        item = copy.deepcopy(row)
        item.update(copy.deepcopy(truth_by_key[key]))
        item["actual"] = item["forecastableCashActual"]
        old = templates[str(item["model_id"])][key].get("rawModelPrediction")
        fresh = base_points[(str(item["model_id"]), key)]
        if old is None:
            if fresh is not None:
                raise FormalReplayError("fresh point appeared where the locked point was null")
        else:
            if fresh is None or base.fixed_decimal(old) != base.fixed_decimal(fresh):
                raise FormalReplayError("fresh legacy-identity point differs before formal projection")
            old_numeric_checks += 1
        if key[3] == "pure_buyout" and old is not None:
            if item["rawModelPrediction"] is not None:
                raise FormalReplayError("legacy pure-buyout point survived formal projection")
            discarded_legacy_buyout_points += 1
        joined.append(item)
    if digest([_prediction_projection(row) for row in joined]) != lock:
        raise FormalReplayError("formal prediction/state changed after truth join")
    return joined, {
        "role": role,
        "predictionFingerprint": lock,
        "predictionRowCount": len(ordered),
        "uniqueTruthCaseCount": len(truth_by_key),
        "predictionLockedBeforeFormalTruthJoin": True,
        "outcomeFieldsAbsentFromFormalPredictionProjection": True,
        "postTruthFormalProjectionMatchesLock": True,
        "freshLegacyIdentityPointsAuditedAfterLock": old_numeric_checks,
        "legacyPureBuyoutPointsDiscarded": discarded_legacy_buyout_points,
        "oldNumericPointsUsedForFormalPrediction": False,
    }


def _segment_metrics(
    rows: Sequence[Mapping[str, Any]], field: str
) -> dict[str, Any]:
    population = [row for row in rows if formal.is_model_population(row)]
    values = sorted({str(row.get("strata", {}).get(field, "unknown")) for row in population})
    groups = {
        value: [
            row
            for row in population
            if str(row.get("strata", {}).get(field, "unknown")) == value
        ]
        for value in values
    }
    small = {
        value
        for value, group in groups.items()
        if len(group) < MINIMUM_CELL
        or len({formal.strict_case_key(row)[0] for row in group}) < MINIMUM_CELL
    }
    visible = [value for value in values if value not in small]
    complement = (
        min(
            visible,
            key=lambda value: (
                len({formal.strict_case_key(row)[0] for row in groups[value]}),
                len(groups[value]),
                value,
            ),
        )
        if small and visible
        else None
    )
    result = {}
    for value, group in groups.items():
        if value in small or value == complement:
            result[value] = {
                "suppressed": True,
                "caseCount": None,
                "uniqueWorkCount": None,
                "suppressionReason": (
                    "primary_small_cell" if value in small else "complementary_suppression"
                ),
            }
        else:
            result[value] = {
                "suppressed": False,
                **public_value(formal.metric_rows(group, "rawModelPrediction")),
            }
    return result


def _channel_metrics(rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    population = [row for row in rows if formal.is_model_population(row)]

    def summarize(group: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
        predictions: list[float] = []
        actuals: list[float] = []
        predicted_components = 0
        predicted_without_truth = 0
        truth_without_prediction = 0
        truth_without_prediction_cash = 0.0
        matched_cash = 0.0
        total_cash = 0.0
        maximum_channel_sum_difference = 0.0
        maximum_truth_sum_difference = 0.0
        for row in group:
            components = row.get("channel_components", []) or []
            if not isinstance(components, Sequence) or isinstance(
                components, (str, bytes, bytearray)
            ):
                raise FormalReplayError("formal comparator channel components differ")
            component_by_key: dict[str, float] = {}
            for component in components:
                key = str(component.get("channel_key", ""))
                if not key or key in component_by_key:
                    raise FormalReplayError("formal comparator channel key is missing or duplicated")
                point = base.require_finite_number(
                    component.get("point_forecast"), "channel component point"
                )
                if point < 0:
                    raise FormalReplayError("formal comparator channel point is negative")
                component_by_key[key] = point
            predicted_components += len(component_by_key)
            point_total = sum(component_by_key.values())
            maximum_channel_sum_difference = max(
                maximum_channel_sum_difference,
                abs(point_total - float(row["rawModelPrediction"])),
            )
            truth = row.get("forecastableActualByComponent", {}) or {}
            if not isinstance(truth, Mapping):
                raise FormalReplayError("formal forecastable component actual is unavailable")
            truth_by_key = {
                str(key): base.require_finite_number(value, "component actual")
                for key, value in truth.items()
            }
            truth_total = sum(truth_by_key.values())
            maximum_truth_sum_difference = max(
                maximum_truth_sum_difference,
                abs(truth_total - float(row["forecastableCashActual"])),
            )
            total_cash += float(row["forecastableCashActual"])
            predicted_keys = set(component_by_key)
            truth_keys = set(truth_by_key)
            predicted_without_truth += len(predicted_keys - truth_keys)
            missing = truth_keys - predicted_keys
            truth_without_prediction += len(missing)
            truth_without_prediction_cash += sum(truth_by_key[key] for key in missing)
            for key in sorted(predicted_keys & truth_keys):
                predictions.append(component_by_key[key])
                actuals.append(truth_by_key[key])
                matched_cash += truth_by_key[key]
        matched_metrics = (
            {
                "matchedComponentCaseCount": len(predictions),
                "aggregateMatchedChannelWape": base.wape(predictions, actuals),
                "aggregateMatchedChannelSignedBias": base.signed_aggregate_bias(
                    predictions, actuals
                ),
            }
            if predictions
            else {
                "matchedComponentCaseCount": 0,
                "aggregateMatchedChannelWape": None,
                "aggregateMatchedChannelSignedBias": None,
            }
        )
        return {
            "workCaseCount": len(group),
            "predictedComponentCount": predicted_components,
            **matched_metrics,
            "predictedWithoutTruthComponentCount": predicted_without_truth,
            "truthWithoutPredictionComponentCount": truth_without_prediction,
            "truthWithoutPredictionCash": truth_without_prediction_cash,
            "matchedForecastableCashShare": ratio(matched_cash, total_cash),
            "maximumChannelSumToWorkPointAbsoluteDifference": maximum_channel_sum_difference,
            "maximumTruthComponentSumToWorkActualAbsoluteDifference": maximum_truth_sum_difference,
            "allWorkPointsStrictlyReconciled": maximum_channel_sum_difference <= 0.000001,
            "allWorkActualsStrictlyReconciled": maximum_truth_sum_difference <= 0.000001,
            "channelMetricIsWorkLevelModelWape": False,
            "identifiersPresent": False,
        }

    result = {"overall": summarize(population), "byRoute": {}}
    for route in ("pure_sales_share", "buyout_plus_sales"):
        result["byRoute"][route] = summarize(
            [row for row in population if formal.strict_case_key(row)[3] == route]
        )
    return result


def metrics_for_model(rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    scoreable = [row for row in rows if row.get("statisticallyScoreable") is True]
    population = [row for row in rows if formal.is_model_population(row)]
    served = [
        row
        for row in population
        if row.get("businessServingEligible") is True
        and row.get("servedPrediction") is not None
        and math.isfinite(float(row["servedPrediction"]))
    ]
    high = [row for row in population if bool(row.get("strata", {}).get("high_value"))]
    high_served = [
        row for row in served if bool(row.get("strata", {}).get("high_value"))
    ]
    route_abstained = [row for row in scoreable if row.get("routeAbstained") is True]
    business_abstained = [row for row in population if row.get("servedPrediction") is None]
    horizons = {
        str(horizon): formal.metric_rows(
            [row for row in population if formal.strict_case_key(row)[2] == horizon],
            "rawModelPrediction",
        )
        for horizon in formal.CORE_HORIZONS
    }
    top_bands = {
        f"top{percent}": formal.metric_rows(
            [
                row
                for row in population
                if bool(row.get("strata", {}).get(f"top_{percent}_percent"))
            ],
            "rawModelPrediction",
        )
        for percent in (1, 5, 10)
    }
    origins = {
        origin: formal.metric_rows(
            [row for row in population if formal.strict_case_key(row)[1] == origin],
            "rawModelPrediction",
        )
        for origin in sorted({formal.strict_case_key(row)[1] for row in population})
    }
    routes = {
        route: formal.metric_rows(
            [row for row in population if formal.strict_case_key(row)[3] == route],
            "rawModelPrediction",
        )
        for route in ("pure_sales_share", "buyout_plus_sales")
    }
    scoreable_forecastable = sum(float(row["forecastableCashActual"]) for row in scoreable)
    scoreable_surprise = sum(float(row["uncommittedBuyoutSurpriseActual"]) for row in scoreable)
    scoreable_ledger = sum(float(row["totalLedgerCashActual"]) for row in scoreable)
    model_actual = sum(float(row["forecastableCashActual"]) for row in population)
    served_actual = sum(float(row["forecastableCashActual"]) for row in served)
    route_abstained_actual = sum(
        float(row["forecastableCashActual"]) for row in route_abstained
    )
    scoreable_works = {formal.strict_case_key(row)[0] for row in scoreable}
    route_abstained_works = {
        formal.strict_case_key(row)[0] for row in route_abstained
    }
    served_prediction_sum = sum(float(row["servedPrediction"]) for row in served)
    e2e_absolute = sum(
        abs(
            (float(row["servedPrediction"]) if row.get("servedPrediction") is not None else 0.0)
            - float(row["totalLedgerCashActual"])
        )
        for row in scoreable
    )
    return {
        "caseState": {
            "frozenCaseCount": len(rows),
            "statisticallyScoreableCaseCount": len(scoreable),
            "rawPredictionCaseCount": sum(row.get("rawModelPrediction") is not None for row in rows),
            "modelPopulationCaseCount": len(population),
            "modelPopulationWorkCount": len({formal.strict_case_key(row)[0] for row in population}),
            "servedCaseCount": len(served),
            "routeAbstainedScoreableCaseCount": len(route_abstained),
            "businessAbstainedModelPopulationCaseCount": len(business_abstained),
            "pureBuyoutCommitmentCaseCount": sum(
                formal.strict_case_key(row)[3] == "pure_buyout"
                and row.get("modelPredictionAvailable") is True
                for row in scoreable
            ),
            "pureBuyoutNoCommitmentCaseCount": sum(
                formal.strict_case_key(row)[3] == "pure_buyout"
                and row.get("routeAbstained") is True
                for row in scoreable
            ),
            "zeroImputationUsed": False,
        },
        "modelPopulation": formal.metric_rows(population, "rawModelPrediction"),
        "served": formal.metric_rows(served, "servedPrediction"),
        "highValue": formal.metric_rows(high, "rawModelPrediction"),
        "highValueServed": formal.metric_rows(high_served, "servedPrediction"),
        "horizons": horizons,
        "topBands": top_bands,
        "origins": origins,
        "routes": routes,
        "channel": _channel_metrics(rows),
        "segments": {
            "sourcePostHoc": _segment_metrics(rows, "source"),
            "lifecycle": _segment_metrics(rows, "lifecycle"),
        },
        "internal80": formal.interval_metrics(rows),
        "businessCoverage": {
            "scoreableForecastableCashActual": scoreable_forecastable,
            "scoreableUncommittedBuyoutSurpriseActual": scoreable_surprise,
            "scoreableTotalLedgerCashActual": scoreable_ledger,
            "forecastableCashShareOfLedgerCash": ratio(
                scoreable_forecastable, scoreable_ledger
            ),
            "surpriseCashShareOfLedgerCash": ratio(scoreable_surprise, scoreable_ledger),
            "modelPopulationForecastableCashCoverage": ratio(
                model_actual, scoreable_forecastable
            ),
            "servedForecastableCashCoverage": ratio(served_actual, scoreable_forecastable),
            "routeAbstainedForecastableCashShare": ratio(
                route_abstained_actual, scoreable_forecastable
            ),
            "routeAbstainedCaseShare": ratio(len(route_abstained), len(scoreable)),
            "routeAbstainedWorkCount": len(route_abstained_works),
            "routeAbstainedWorkShare": ratio(
                len(route_abstained_works), len(scoreable_works)
            ),
            "endToEndBusinessGap": {
                "signedAggregateGap": ratio(
                    served_prediction_sum - scoreable_ledger, scoreable_ledger
                ),
                "normalizedAbsoluteGap": ratio(e2e_absolute, abs(scoreable_ledger)),
                "mayBeNamedModelWape": False,
                "nullServedPointTreatment": "unserved_cash_exposure_not_model_zero",
            },
        },
    }


def _complete_month_population(
    works_list: Sequence[Mapping[str, Any]],
    calibration_spec: Mapping[str, Any],
    posthoc: Mapping[str, Mapping[str, str]],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    first_month = str(calibration_spec["authority"]["firstBillMonth"])
    latest = str(calibration_spec["authority"]["latestCompleteMonth"])
    rows: list[dict[str, Any]] = []
    for work in works_list:
        work_id = str(work["standard_work_id"])
        audit = cash.build_complete_month_cash_audit(
            work, first_month, latest, calibration_spec
        )
        routing = base.route_work_as_of(work, latest, calibration_spec)
        rows.append(
            {
                "standardWorkId": work_id,
                "routePostHocAtLatestCompleteMonth": str(routing["route"]),
                "sourcePostHoc": str(posthoc.get(work_id, {}).get("source", "unknown")),
                **audit,
            }
        )
    if len(rows) != int(calibration_spec["authority"]["standardWorkCount"]):
        raise FormalReplayError("complete-month population scope differs")
    ranked = sorted(
        rows,
        key=lambda row: (
            -max(0.0, float(row["totalLedgerCashActual"])),
            str(row["standardWorkId"]),
        ),
    )
    rank_by_work = {
        str(row["standardWorkId"]): index
        for index, row in enumerate(ranked, start=1)
    }
    total_forecastable = sum(float(row["forecastableCashActual"]) for row in rows)
    total_surprise = sum(float(row["uncommittedBuyoutSurpriseActual"]) for row in rows)
    total_ledger = sum(float(row["totalLedgerCashActual"]) for row in rows)
    conservation = total_forecastable + total_surprise - total_ledger
    if abs(conservation) > AGGREGATE_TOLERANCE:
        raise FormalReplayError("complete-month population cash does not conserve")
    route_abstained = [
        row
        for row in rows
        if row["routePostHocAtLatestCompleteMonth"]
        in {"pure_buyout", "unknown_revenue_model"}
    ]
    top_bands = {}
    for percent, count in ((1, 31), (5, 153), (10, 306)):
        group = ranked[:count]
        denominator = sum(max(0.0, float(row["totalLedgerCashActual"])) for row in group)
        numerator = sum(max(0.0, float(row["forecastableCashActual"])) for row in group)
        top_bands[f"top{percent}"] = {
            "workCount": count,
            "forecastableCashCoverage": ratio(numerator, denominator),
            "rankingBuiltBeforeModelOrServingFilter": True,
        }
    coverage = {
        "schema": "m2.formal_cash_population_business_coverage.public.v1",
        "version": "M2-formal-cash-population-business-coverage-v1",
        "language": "zh-CN",
        "decisionStatus": "not_for_formal_decision",
        "formalDecisionAuthorized": False,
        "releaseAuthorized": False,
        "scope": {
            "standardWorkCount": len(rows),
            "completeIncomeFactCount": int(
                calibration_spec["authority"][
                    "completeIncomeFactCountThroughLatestCompleteMonth"
                ]
            ),
            "firstCompleteMonth": first_month,
            "latestCompleteMonth": latest,
            "nonOverlappingWorkLevelAggregation": True,
            "postHocOnly": True,
        },
        "cashCoverage": {
            "forecastableCashActual": money(total_forecastable),
            "uncommittedBuyoutClassifierExposureActual": money(total_surprise),
            "totalLedgerCashActual": money(total_ledger),
            "forecastableCashShareOfLedgerCash": ratio(
                total_forecastable, total_ledger
            ),
            "classifierExposureShareOfLedgerCash": ratio(total_surprise, total_ledger),
            "amountConservationDifference": rounded(conservation),
            "classifierExposureIsCommitmentFact": False,
        },
        "routeAbstentionPostHoc": {
            "workCount": len(route_abstained),
            "workShare": ratio(len(route_abstained), len(rows)),
            "forecastableCashShare": ratio(
                sum(float(row["forecastableCashActual"]) for row in route_abstained),
                total_forecastable,
            ),
            "ledgerCashShare": ratio(
                sum(float(row["totalLedgerCashActual"]) for row in route_abstained),
                total_ledger,
            ),
            "latestRouteIsPostHocNotHistoricalFeature": True,
        },
        "topBands": top_bands,
        "highValuePureBuyoutAbstention": {
            "definition": "top10_complete_month_ledger_ranking_and_latest_route_post_hoc",
            "workCount": sum(
                row["routePostHocAtLatestCompleteMonth"] == "pure_buyout"
                for row in ranked[:306]
            ),
            "postHocOnly": True,
        },
        "observationGates": {
            "forecastableCashShareMinimumRecommended": 0.9,
            "forecastableCashShareObserved": ratio(total_forecastable, total_ledger),
            "forecastableCashShareObservedPass": ratio(total_forecastable, total_ledger)
            >= 0.9,
            "top10ForecastableCashCoverageMinimum": 0.9,
            "top10ForecastableCashCoverageObserved": top_bands["top10"][
                "forecastableCashCoverage"
            ],
            "top10ForecastableCashCoverageObservedPass": top_bands["top10"][
                "forecastableCashCoverage"
            ]
            >= 0.9,
            "belowThresholdBehavior": "conditional_only_never_formal_approval",
            "mayAuthorizeRelease": False,
        },
        "seals": {
            "finalHoldoutOpened": False,
            "embargoShadowOpened": False,
            "deferred60MonthLabelsOpened": False,
        },
        "privacy": {
            "aggregateOnly": True,
            "deidentified": True,
            "workIdentifiersPresent": False,
            "channelIdentifiersPresent": False,
            "privatePathsPresent": False,
            "rawRowsPresent": False,
            "predictionIntervalEndpointsPresent": False,
        },
    }
    return rows, {
        "rankByWork": rank_by_work,
        "rankedWorkIds": [str(row["standardWorkId"]) for row in ranked],
        "coverageReport": coverage,
        "totalLedgerCash": total_ledger,
    }


def _private_fact_identity_audit(
    *,
    forward_rows: Sequence[Mapping[str, Any]],
    works_list: Sequence[Mapping[str, Any]],
    posthoc: Mapping[str, Mapping[str, str]],
    population: Mapping[str, Any],
) -> dict[str, Any]:
    try:
        import run_m2_formal_execution_payload as payload  # pylint: disable=import-outside-toplevel
    except ImportError as exc:
        raise FormalReplayError("formal fact payload verifier is unavailable") from exc
    for path in (payload.PAYLOAD_PATH, payload.FACTS_PATH, payload.MODEL_CACHE_PATH):
        if not path.is_file():
            return {
                "status": "unavailable",
                "reason": "frozen_private_formal_fact_role_missing",
                "identityStableWithinFrozenAuthoritySnapshot": False,
                "unsafeDedupAmount": None,
            }
        if not phase.git_ignored(path) or run_git("ls-files", "--", str(path)):
            raise FormalReplayError("private formal fact role escaped Git boundary")
    manifest = json.loads(payload.PAYLOAD_PATH.read_text(encoding="utf-8"))
    fact_meta = manifest.get("factImport", {})
    if not isinstance(fact_meta, Mapping) or not {
        "factFileSha256",
        "factRowCount",
        "factChecksum",
    }.issubset(fact_meta):
        # Current payload stores the fact manifest at the top-level execution
        # section.  Locate it by its immutable fact-file keys without exposing
        # any private filenames in public evidence.
        candidates = [
            value
            for value in manifest.values()
            if isinstance(value, Mapping)
            and {"factFileSha256", "factRowCount", "factChecksum"}.issubset(value)
        ]
        if len(candidates) != 1:
            raise FormalReplayError("private fact manifest role is ambiguous")
        fact_meta = candidates[0]
    if str(fact_meta.get("factFileSha256")) != file_sha256(payload.FACTS_PATH):
        raise FormalReplayError("private fact file digest differs from manifest")
    source = fact_meta.get("sourceBill", {})
    source_sha = str(source.get("sha256", ""))
    sheet = str(source.get("sourceSheetName", ""))
    if len(source_sha) != 64 or not sheet:
        raise FormalReplayError("private fact natural-key anchor is incomplete")

    facts: list[dict[str, Any]] = []
    identities: set[tuple[str, str, int]] = set()
    row_hashes: set[str] = set()
    fact_checksum_values: list[str] = []
    with payload.FACTS_PATH.open("r", encoding="utf-8") as handle:
        for line in handle:
            fact = json.loads(line)
            row_hash = str(fact.pop("rowHash", ""))
            if row_hash != payload.stable_hash(fact):
                raise FormalReplayError("private fact row hash differs")
            fact["rowHash"] = row_hash
            row_number = int(fact["sourceRowNumber"])
            identity = (source_sha, sheet, row_number)
            if identity in identities or row_hash in row_hashes:
                raise FormalReplayError("private fact natural key or row hash is duplicated")
            identities.add(identity)
            row_hashes.add(row_hash)
            fact_checksum_values.append(row_hash)
            facts.append(fact)
    if (
        len(facts) != int(fact_meta.get("factRowCount", -1))
        or payload.stable_hash(fact_checksum_values) != str(fact_meta.get("factChecksum"))
    ):
        raise FormalReplayError("private fact count or checksum differs")
    with payload.MODEL_CACHE_PATH.open("rb") as handle:
        cached = pickle.load(handle)
    if (
        not isinstance(cached, Mapping)
        or cached.get("signature") != payload.model_cache_signature()
        or not isinstance(cached.get("modelInputs"), Mapping)
    ):
        raise FormalReplayError("private model cache signature differs")
    mapped = cached["modelInputs"]["mappedBill"]
    valid = mapped[mapped["validForCalibration"].astype(bool)]
    cache_source_rows = {
        int(index) + 2 if isinstance(index, int) else position + 1
        for position, (index, _row) in enumerate(valid.iterrows(), start=1)
    }
    fact_source_rows = {int(fact["sourceRowNumber"]) for fact in facts}
    if cache_source_rows != fact_source_rows or len(cache_source_rows) != len(facts):
        raise FormalReplayError("private cache and fact source-row identities differ")

    expected_cells: dict[tuple[str, str, str], float] = {}
    for row in forward_rows:
        if row.get("model_id") != "B4" or row.get("statisticallyScoreable") is not True:
            continue
        work_id = formal.strict_case_key(row)[0]
        for (component, month), amount in row.get(
            "surpriseActualByComponentMonth", {}
        ).items():
            amount = float(amount)
            if amount <= 0:
                continue
            key = (work_id, str(component), str(month))
            previous = expected_cells.get(key)
            if previous is not None and not math.isclose(
                previous, amount, rel_tol=0.0, abs_tol=0.000001
            ):
                raise FormalReplayError("overlapping surprise cell amount differs")
            expected_cells[key] = amount

    facts_by_cell: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    complete_fact_total = Decimal("0")
    latest = "2026-04"
    for fact in facts:
        month = str(fact["billMonth"])[:7]
        if month > latest:
            continue
        amount = Decimal(str(fact["actualSalesAmount"]))
        complete_fact_total += amount
        component = (
            f"{fact['channelKey']}\x1f{str(fact.get('businessForm') or 'unknown')}"
        )
        facts_by_cell[
            (str(fact["standardWorkId"]), component, month)
        ].append(fact)

    unsafe: dict[tuple[str, str, str], float] = {}
    unique_facts: dict[tuple[str, str, int], dict[str, Any]] = {}
    for cell, expected in expected_cells.items():
        cell_facts = facts_by_cell.get(cell, [])
        observed = sum(float(fact["actualSalesAmount"]) for fact in cell_facts)
        if not cell_facts or not math.isclose(
            observed, expected, rel_tol=0.0, abs_tol=0.000001
        ):
            unsafe[cell] = expected
            continue
        for fact in cell_facts:
            if float(fact["actualSalesAmount"]) <= 0:
                unsafe[cell] = expected
                continue
            identity = (source_sha, sheet, int(fact["sourceRowNumber"]))
            unique_facts[identity] = fact
    if unsafe:
        return {
            "status": "unavailable",
            "reason": "surprise_cell_to_authority_fact_reconciliation_failed",
            "identityStableWithinFrozenAuthoritySnapshot": True,
            "unsafeDedupCellCount": len(unsafe),
            "unsafeDedupAmount": money(sum(unsafe.values())),
        }

    unique_amount = sum(float(fact["actualSalesAmount"]) for fact in unique_facts.values())
    involved = {str(fact["standardWorkId"]) for fact in unique_facts.values()}
    rank_by_work = population["rankByWork"]
    band_amounts = defaultdict(float)
    source_stats: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"factCount": 0, "workIds": set(), "amount": 0.0}
    )
    for fact in unique_facts.values():
        work_id = str(fact["standardWorkId"])
        rank = int(rank_by_work[work_id])
        band = (
            "top1"
            if rank <= 31
            else "next4"
            if rank <= 153
            else "next5"
            if rank <= 306
            else "middle40"
            if rank <= 1527
            else "bottom50"
        )
        amount = float(fact["actualSalesAmount"])
        band_amounts[band] += amount
        source_value = str(posthoc.get(work_id, {}).get("source", "unknown"))
        cell = source_stats[source_value]
        cell["factCount"] += 1
        cell["workIds"].add(work_id)
        cell["amount"] += amount

    works = {str(work["standard_work_id"]): work for work in works_list}
    same_batch_cells: set[tuple[str, str, str]] = set()
    for cell in expected_cells:
        work_id, component, month = cell
        channel = base.channel_index(works[work_id]).get(component)
        if channel and int((channel.get("batch_cluster_sizes", {}) or {}).get(month, 1)) > 1:
            same_batch_cells.add(cell)
    same_batch_facts = {
        identity: fact
        for identity, fact in unique_facts.items()
        if (
            str(fact["standardWorkId"]),
            f"{fact['channelKey']}\x1f{str(fact.get('businessForm') or 'unknown')}",
            str(fact["billMonth"])[:7],
        )
        in same_batch_cells
    }
    top = {
        "top1": sum(
            float(fact["actualSalesAmount"])
            for fact in unique_facts.values()
            if int(rank_by_work[str(fact["standardWorkId"])]) <= 31
        ),
        "top5": sum(
            float(fact["actualSalesAmount"])
            for fact in unique_facts.values()
            if int(rank_by_work[str(fact["standardWorkId"])]) <= 153
        ),
        "top10": sum(
            float(fact["actualSalesAmount"])
            for fact in unique_facts.values()
            if int(rank_by_work[str(fact["standardWorkId"])]) <= 306
        ),
    }
    return {
        "status": "available",
        "auditIdentity": "source_bill_sha256_x_source_sheet_name_x_source_row_number",
        "identityStableWithinFrozenAuthoritySnapshot": True,
        "identityStableAcrossAuthorityRevisions": False,
        "rowHashRole": "content_integrity_only_not_identity",
        "workMonthAmountIdentityUsed": False,
        "factIdentityChecks": {
            "authorityFactCount": len(facts),
            "identityUniqueCount": len(identities),
            "rowHashUniqueCount": len(row_hashes),
            "allRowHashesRecomputed": True,
            "factFileDigestMatchesManifest": True,
            "factChecksumMatchesManifest": True,
            "modelCacheSignatureCurrent": True,
            "modelCacheSourceRowsMatchFactPayload": True,
        },
        "uniqueScope": "frozen_scoreable_development_window_unique_surprise_fact_union",
        "uniqueSurpriseLedgerFactCount": len(unique_facts),
        "uniqueSurpriseEventCellCount": len(expected_cells),
        "uniqueSurpriseAmount": money(unique_amount),
        "uniqueCompleteMonthLedgerCash": money(complete_fact_total),
        "uniqueSurpriseShareOfUniqueCompleteMonthLedgerCash": ratio(
            unique_amount, float(complete_fact_total)
        ),
        "involvedWorkCount": len(involved),
        "topSurpriseShares": {
            key: ratio(value, unique_amount) for key, value in top.items()
        },
        "sourceDistribution": {
            source_name: {
                "factCount": int(cell["factCount"]),
                "workCount": len(cell["workIds"]),
                "amount": money(cell["amount"]),
                "share": ratio(float(cell["amount"]), unique_amount),
            }
            for source_name, cell in sorted(source_stats.items())
        },
        "historicalRevenueScaleDistribution": {
            band: {
                "amount": money(band_amounts.get(band, 0.0)),
                "share": ratio(band_amounts.get(band, 0.0), unique_amount),
            }
            for band in ("top1", "next4", "next5", "middle40", "bottom50")
        },
        "sameBatchClassifierSignal": {
            "present": bool(same_batch_cells),
            "eventCellCount": len(same_batch_cells),
            "factCount": len(same_batch_facts),
            "amount": money(
                sum(float(fact["actualSalesAmount"]) for fact in same_batch_facts.values())
            ),
            "share": ratio(
                sum(float(fact["actualSalesAmount"]) for fact in same_batch_facts.values()),
                unique_amount,
            ),
            "isContractCommitmentEvidence": False,
        },
        "unsafeDedupCellCount": 0,
        "unsafeDedupAmount": 0.0,
        "allSurpriseCellsReconcileToAuthorityFacts": True,
        "semanticConfidence": "classifier_derived_diagnostic_not_contract_fact",
    }


def _privacy_contract() -> dict[str, Any]:
    return {
        "aggregateOnly": True,
        "deidentified": True,
        "workIdentifiersPresent": False,
        "authorIdentifiersPresent": False,
        "channelIdentifiersPresent": False,
        "privatePathsPresent": False,
        "rawRowsPresent": False,
        "predictionIntervalEndpointsPresent": False,
        "smallCellsComplementarilySuppressed": True,
    }


def _seals() -> dict[str, bool]:
    return {
        "finalHoldoutOpened": False,
        "embargoShadowOpened": False,
        "deferred60MonthLabelsOpened": False,
    }


def _build_public_reports(
    *,
    forward: Sequence[Mapping[str, Any]],
    metrics: Mapping[str, Mapping[str, Any]],
    bootstrap: Mapping[str, Any],
    selection: Mapping[str, Any],
    locks: Sequence[Mapping[str, Any]],
    fold_evidence: Mapping[str, Any],
    input_evidence: Mapping[str, Any],
    phase_evidence: Mapping[str, Any],
    unique: Mapping[str, Any],
    coverage: Mapping[str, Any],
    contract: Mapping[str, Any],
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
    by_model = {
        model: [row for row in forward if row.get("model_id") == model]
        for model in formal.MODEL_IDS
    }
    case_sets = {
        model: {formal.strict_case_key(row) for row in rows}
        for model, rows in by_model.items()
    }
    model_sets = {
        model: {
            formal.strict_case_key(row)
            for row in rows
            if formal.is_model_population(row)
        }
        for model, rows in by_model.items()
    }
    reference_cases = case_sets["B4"]
    reference_model = model_sets["B4"]
    if any(values != reference_cases for values in case_sets.values()):
        raise FormalReplayError("formal comparator full case keys differ")
    if any(values != reference_model for values in model_sets.values()):
        raise FormalReplayError("formal comparator model-population keys differ")
    if len(reference_cases) != int(contract["caseContract"]["developmentCaseCountPerComparator"]):
        raise FormalReplayError("formal comparator case count differs")
    scoreable = [
        row
        for row in by_model["B4"]
        if row.get("statisticallyScoreable") is True
    ]
    if len(scoreable) != int(contract["caseContract"]["statisticallyScoreableCaseCount"]):
        raise FormalReplayError("formal comparator scoreable count differs")
    pure_abstained = [
        row
        for row in scoreable
        if formal.strict_case_key(row)[3] == "pure_buyout"
    ]
    if any(
        row.get("rawModelPrediction") is not None
        or row.get("servedPrediction") is not None
        or row.get("routeAbstained") is not True
        or row.get("abstentionReason")
        != "uncommitted_future_buyout_not_forecastable"
        for row in pure_abstained
    ):
        raise FormalReplayError("pure-buyout formal abstention contract differs")
    if any(
        row.get("_internal_interval", {}).get("available") is True
        for row in pure_abstained
    ):
        raise FormalReplayError("pure-buyout abstention received an internal interval")
    conservation = [
        abs(
            float(row["forecastableCashActual"])
            + float(row["uncommittedBuyoutSurpriseActual"])
            - float(row["totalLedgerCashActual"])
        )
        for row in by_model["B4"]
    ]
    aggregate_conservation = sum(
        float(row["forecastableCashActual"])
        + float(row["uncommittedBuyoutSurpriseActual"])
        - float(row["totalLedgerCashActual"])
        for row in by_model["B4"]
    )
    if max(conservation, default=0.0) > 0.000001 or abs(aggregate_conservation) > AGGREGATE_TOLERANCE:
        raise FormalReplayError("formal comparator actual partition does not conserve")

    old_by_key = {
        formal.strict_case_key(row): row
        for row in phase_evidence["rows"]
        if row.get("model_id") == "B4"
        and str(row.get("_residual_case_role", "")).startswith(
            "development_forward_score:"
        )
    }
    non_pure_difference = sum(
        float(row["forecastableCashActual"])
        - float(old_by_key[formal.strict_case_key(row)]["actual"])
        for row in scoreable
        if formal.strict_case_key(row)[3] != "pure_buyout"
    )
    if abs(non_pure_difference) > AGGREGATE_TOLERANCE:
        raise FormalReplayError("formal non-pure-buyout actual differs from frozen target")
    bridge = json.loads(
        (PUBLIC_DIR / "M2-C2R1-old-target-new-target-bridge-v1.json").read_text(
            encoding="utf-8"
        )
    )
    bridge_difference = float(bridge["amountBridge"]["bridgeBalanceDifference"])
    if abs(bridge_difference) > AGGREGATE_TOLERANCE:
        raise FormalReplayError("old-to-new target bridge does not reconcile")

    future_v12 = phase.future_perturbation_evidence(base.load_spec())
    future_formal = formal.synthetic_self_test()
    future_formal_projection = formal.future_perturbation_self_test()
    future_target = cash.compose_future_cash_forecast(
        standard_work_id="SYNTHETIC-GATE-B",
        route="pure_buyout",
        origin="2020-01",
        horizon=3,
        sales_monthly_prediction={},
        cash_commitment_snapshots=[],
        statistically_scoreable=True,
        business_serving_eligible=True,
        sales_confidence="unavailable",
    )
    future_passed = (
        future_v12.get("passed") is True
        and future_formal["status"] == "passed"
        and future_formal_projection["status"] == "passed"
        and future_target["rawModelPrediction"] is None
    )
    if not future_passed:
        raise FormalReplayError("formal future-perturbation boundary failed")

    public_metrics = {
        model: public_value(metrics[model]) for model in formal.MODEL_IDS
    }
    public_bootstrap = public_value(bootstrap)
    public_bootstrap.pop("clusterKeys", None)
    public_bootstrap["clusterDefinition"] = "deidentified_work_x_origin"
    replay = {
        "schema": "m2.formal_cash_comparator_replay.public.v1",
        "version": "M2-formal-cash-comparator-replay-v1",
        "language": "zh-CN",
        "decisionStatus": "not_for_formal_decision",
        "formalDecisionAuthorized": False,
        "releaseAuthorized": False,
        "technicalSummary": {
            "formalCashReplayComplete": True,
            "primaryComparator": selection["primaryPerformanceComparator"],
            "legacyTargetMetricsUsedForSelection": False,
            "pureBuyoutNullScoredAsZero": False,
            "C2R1TrainingStarted": False,
        },
        "scopeAndDefinitions": {
            "standardWorkCount": int(input_evidence["standardWorkCount"]),
            "incomeFactCount": int(input_evidence["incomeFactCount"]),
            "developmentCaseCountPerComparator": len(reference_cases),
            "statisticallyScoreableCaseCount": len(scoreable),
            "formalModelPopulationCaseCount": len(reference_model),
            "formalModelPopulationWorkCount": len({key[0] for key in reference_model}),
            "modelPopulationPredicate": contract["modelPopulation"]["predicate"],
            "actualField": "forecastableCashActual",
            "sameCaseKeysAcrossComparators": True,
            "sameModelPopulationKeysAcrossComparators": True,
            "scoreabilityAndBusinessEligibilityFrozen": True,
        },
        "comparatorMetrics": public_metrics,
        "comparatorSelection": public_value(selection),
        "pairedWorkOriginBootstrap": public_bootstrap,
        "routeAbstentionAudit": {
            "pureBuyoutWithoutCommitmentScoreableCaseCount": len(pure_abstained),
            "rawAndServedNullOnEveryCase": True,
            "zeroImputationUsed": False,
            "intervalAvailableCaseCount": 0,
        },
        "integrity": {
            "formalPredictionLockedBeforeTruthJoin": all(
                lock["predictionLockedBeforeFormalTruthJoin"] is True for lock in locks
            ),
            "outcomeFieldsAbsentAtFormalLock": all(
                lock["outcomeFieldsAbsentFromFormalPredictionProjection"] is True
                for lock in locks
            ),
            "freshLegacyIdentityPointParityPassed": True,
            "legacyPureBuyoutPointsDiscardedAfterFreshReplay": True,
            "B4FactorEligibleRoutesSalesOnly": True,
            "formalB4FoldFactorIdentityPassed": abs(non_pure_difference)
            <= AGGREGATE_TOLERANCE,
            "B4FoldEvidence": public_value(fold_evidence),
            "nonPureBuyoutActualDifference": rounded(non_pure_difference),
            "oldToNewBridgeBalanceDifference": rounded(bridge_difference),
            "maximumPerCaseActualConservationDifference": rounded(
                max(conservation, default=0.0)
            ),
            "aggregateActualConservationDifference": rounded(aggregate_conservation),
            "futurePerturbationInvariant": future_passed,
            "predictionLockCount": len(locks),
            "caseKeyFingerprint": digest([list(key) for key in sorted(reference_cases)]),
            "modelPopulationKeyFingerprint": digest(
                [list(key) for key in sorted(reference_model)]
            ),
        },
        "methodologyAndLimitations": {
            "B0aRole": "historical_audit_only",
            "B0aSelectionEligible": False,
            "legacyTargetComparatorSelectionEligible": False,
            "internal80Role": "coverage_WIS_and_overconfidence_audit_only",
            "predictionIntervalEndpointsPublic": False,
            "sourceAndCurrentLifecycleSlicesPostHocOnly": True,
            "visualizationOmissionReason": "精确审计表比图形更适合核对人口、阈值与守恒。",
        },
        "seals": _seals(),
        "privacy": _privacy_contract(),
        "nextBoundary": "Gate_B_before_C2R1",
    }
    bundle = {
        "schema": "m2.formal_cash_comparator_bundle.v1",
        "version": "M2-formal-cash-comparator-bundle-v1",
        "decisionStatus": "not_for_formal_decision",
        "formalDecisionAuthorized": False,
        "releaseAuthorized": False,
        "target": "forecastableCashActual",
        "modelPopulationPredicate": contract["modelPopulation"]["predicate"],
        "reportedComparators": list(formal.MODEL_IDS),
        "primaryComparator": selection["primaryPerformanceComparator"],
        "empiricalWapeLeader": selection["empiricalWapeLeader"],
        "strictEquivalentSet": list(selection["strictEquivalentSet"]),
        "metrics": {
            model: {
                "caseState": public_metrics[model]["caseState"],
                "modelPopulation": public_metrics[model]["modelPopulation"],
                "served": public_metrics[model]["served"],
                "highValue": public_metrics[model]["highValue"],
                "highValueServed": public_metrics[model]["highValueServed"],
                "horizons": public_metrics[model]["horizons"],
                "topBands": public_metrics[model]["topBands"],
                "origins": public_metrics[model]["origins"],
                "routes": public_metrics[model]["routes"],
                "channel": public_metrics[model]["channel"],
                "segments": public_metrics[model]["segments"],
                "internal80": public_metrics[model]["internal80"],
                "businessCoverage": public_metrics[model]["businessCoverage"],
            }
            for model in formal.MODEL_IDS
        },
        "selection": public_value(selection),
        "bootstrap": copy.deepcopy(public_bootstrap),
        "contractBinding": {
            "formalCashComparatorSpecDigest": formal.canonical_digest(contract),
            "formalCashTargetSpecDigest": cash.canonical_digest(cash.load_spec()),
            "authorityInputFingerprintMatchesGateA": True,
            "phaseACaseEvidenceSha256": phase_evidence["caseEvidenceSha256"],
        },
        "legacyTargetMetricsSelectionEligible": False,
        "B0aSelectionEligible": False,
        "thresholdsChangedAfterReplay": False,
        "seals": _seals(),
        "privacy": _privacy_contract(),
    }
    overlap_surprise = sum(
        float(row["uncommittedBuyoutSurpriseActual"]) for row in scoreable
    )
    overlap_forecastable = sum(float(row["forecastableCashActual"]) for row in scoreable)
    overlap_ledger = sum(float(row["totalLedgerCashActual"]) for row in scoreable)
    positive_windows = sum(
        float(row["uncommittedBuyoutSurpriseActual"]) > 0 for row in scoreable
    )
    unique_amount = unique.get("uniqueSurpriseAmount")
    surprise = {
        "schema": "m2.surprise_buyout_unique_impact_audit.public.v1",
        "version": "M2-surprise-buyout-unique-impact-audit-v1",
        "language": "zh-CN",
        "decisionStatus": "not_for_formal_decision",
        "formalDecisionAuthorized": False,
        "releaseAuthorized": False,
        "technicalSummary": {
            "uniqueAuditStatus": unique["status"],
            "classifierDerivedNotContractConfirmed": True,
            "overlappingWindowShareIsFullLibraryBusinessShare": False,
        },
        "overlappingBacktestWindows": {
            "forecastableCashActual": money(overlap_forecastable),
            "uncommittedBuyoutSurpriseActual": money(overlap_surprise),
            "totalLedgerCashActual": money(overlap_ledger),
            "positiveSurpriseWindowCount": positive_windows,
            "surpriseShareOfWindowLedgerCash": ratio(overlap_surprise, overlap_ledger),
            "scopeLabel": "backtest_window_exposure_only",
            "overlappingWindowsMayBeNamedUniqueLedgerFacts": False,
        },
        "uniqueFactUnion": public_value(unique),
        "overlapToUniqueBridge": {
            "overlapAmount": money(overlap_surprise),
            "uniqueAmount": unique_amount,
            "repeatedWindowAmount": (
                money(overlap_surprise - float(unique_amount))
                if unique_amount is not None
                else None
            ),
            "overlapToUniqueRatio": (
                ratio(overlap_surprise, float(unique_amount))
                if unique_amount not in {None, 0}
                else None
            ),
            "repeatedWindowAmountIsBusinessLoss": False,
        },
        "limitations": {
            "uniqueScopeIsAllLibraryUncommittedBuyout": False,
            "identityNaturalKeyStableOnlyWithinFrozenAuthoritySnapshot": bool(
                unique.get("identityStableWithinFrozenAuthoritySnapshot", False)
            ),
            "futureCrossRevisionTrackingNeedsPersistentLedgerFactKey": True,
            "commitmentEvidenceAvailable": False,
        },
        "seals": _seals(),
        "privacy": _privacy_contract(),
    }
    return replay, bundle, surprise, copy.deepcopy(dict(coverage))


def _gate_report(
    replay: Mapping[str, Any],
    bundle: Mapping[str, Any],
    surprise: Mapping[str, Any],
    coverage: Mapping[str, Any],
    *,
    validation_passed: bool = False,
    validation_receipt_sha256: str | None = None,
    validation_evidence: Mapping[str, Any] | None = None,
    phase_a_commit_pushed: bool = False,
    phase_a_checkpoint: str | None = None,
    remote_head_verified: bool = False,
) -> dict[str, Any]:
    unique = surprise.get("uniqueFactUnion", {})
    unique_status = surprise.get("technicalSummary", {}).get("uniqueAuditStatus")
    fact_checks = unique.get("factIdentityChecks", {}) or {}
    unique_audit_valid = (
        unique_status == "available"
        and unique.get("allSurpriseCellsReconcileToAuthorityFacts") is True
        and unique.get("unsafeDedupCellCount") == 0
        and float(unique.get("unsafeDedupAmount", 0.0)) == 0.0
        and fact_checks.get("authorityFactCount")
        == fact_checks.get("identityUniqueCount")
        == fact_checks.get("rowHashUniqueCount")
        and all(
            fact_checks.get(key) is True
            for key in (
                "allRowHashesRecomputed",
                "factFileDigestMatchesManifest",
                "factChecksumMatchesManifest",
                "modelCacheSignatureCurrent",
                "modelCacheSourceRowsMatchFactPayload",
            )
        )
    ) or (
        unique_status == "unavailable"
        and isinstance(unique.get("reason"), str)
        and bool(unique.get("reason"))
        and unique.get("uniqueSurpriseAmount") is None
    )
    coverage_complete = (
        coverage.get("scope", {}).get("standardWorkCount") == 3053
        and coverage.get("scope", {}).get("completeIncomeFactCount") == 192869
        and coverage.get("scope", {}).get("nonOverlappingWorkLevelAggregation")
        is True
        and abs(
            float(
                coverage.get("cashCoverage", {}).get(
                    "amountConservationDifference", 1
                )
            )
        )
        <= AGGREGATE_TOLERANCE
        and coverage.get("topBands", {}).get("top1", {}).get("workCount") == 31
        and coverage.get("topBands", {}).get("top5", {}).get("workCount") == 153
        and coverage.get("topBands", {}).get("top10", {}).get("workCount") == 306
        and coverage.get("observationGates", {}).get("mayAuthorizeRelease") is False
        and coverage.get("routeAbstentionPostHoc", {}).get(
            "latestRouteIsPostHocNotHistoricalFeature"
        )
        is True
    )
    conditions = {
        "formal_cash_comparator_replay_complete": replay["technicalSummary"][
            "formalCashReplayComplete"
        ]
        is True,
        "comparator_target_population_case_key_parity": replay["scopeAndDefinitions"][
            "sameCaseKeysAcrossComparators"
        ]
        is True
        and replay["scopeAndDefinitions"]["sameModelPopulationKeysAcrossComparators"]
        is True,
        "pure_buyout_null_never_scored_as_zero": replay["routeAbstentionAudit"][
            "rawAndServedNullOnEveryCase"
        ]
        is True
        and replay["routeAbstentionAudit"]["zeroImputationUsed"] is False,
        "legacy_target_comparator_excluded_from_selection": bundle[
            "legacyTargetMetricsSelectionEligible"
        ]
        is False,
        "old_new_target_bridge_reconciles": abs(
            float(replay["integrity"]["oldToNewBridgeBalanceDifference"])
        )
        <= AGGREGATE_TOLERANCE,
        "three_actuals_conserve_per_case_and_aggregate": abs(
            float(replay["integrity"]["maximumPerCaseActualConservationDifference"])
        )
        <= 0.000001
        and abs(float(replay["integrity"]["aggregateActualConservationDifference"]))
        <= AGGREGATE_TOLERANCE,
        "surprise_unique_audit_complete_or_fail_closed_unavailable": unique_audit_valid,
        "population_and_coverage_report_complete": coverage_complete,
        "future_perturbation_invariance_passed": replay["integrity"][
            "futurePerturbationInvariant"
        ]
        is True,
        "all_seals_closed": all(
            value is False for value in replay["seals"].values()
        ),
        "formal_cash_calibration_spec_frozen": bundle["contractBinding"][
            "formalCashComparatorSpecDigest"
        ]
        == formal.canonical_digest(formal.load_spec()),
        "full_validation_suite_passed": bool(validation_passed),
        "phase_a_commit_pushed": bool(phase_a_commit_pushed),
        "no_private_file_tracked": phase.tracked_private_artifacts() == [],
    }
    expected = formal.load_spec()["gateB"]["conditions"]
    if list(conditions) != list(expected):
        raise FormalReplayError("Gate B condition names differ from the frozen spec")
    return {
        "schema": "m2.calibration_gate_b.v1",
        "version": "M2-calibration-gate-b-v1",
        "decisionStatus": "not_for_formal_decision",
        "formalDecisionAuthorized": False,
        "releaseAuthorized": False,
        "conditions": conditions,
        "conditionCount": len(conditions),
        "passedConditionCount": sum(conditions.values()),
        "allTrue": all(conditions.values()),
        "C2R1AuthorizedByGateB": all(conditions.values()),
        "phaseACheckpoint": phase_a_checkpoint,
        "phaseACommitPushed": phase_a_commit_pushed,
        "validationReceiptSha256": validation_receipt_sha256,
        "validationEvidence": public_value(validation_evidence)
        if validation_evidence is not None
        else None,
        "evidenceBindings": {
            "replayDigest": digest(replay),
            "bundleDigest": digest(bundle),
            "surpriseAuditDigest": digest(surprise),
            "coverageDigest": digest(coverage),
            "formalCashComparatorSpecDigest": bundle["contractBinding"][
                "formalCashComparatorSpecDigest"
            ],
        },
        "observationGates": copy.deepcopy(coverage["observationGates"]),
        "observationGatesMayAuthorizeFormalApproval": False,
        "seals": _seals(),
        "privateFilesTracked": False,
        "remoteHeadVerified": bool(remote_head_verified),
        "nextBoundary": (
            "C2R1_development_only"
            if all(conditions.values())
            else "stop_before_C2R1"
        ),
    }


def replay_markdown(report: Mapping[str, Any]) -> str:
    rows = []
    for model in formal.MODEL_IDS:
        metric = report["comparatorMetrics"][model]["modelPopulation"]
        interval = report["comparatorMetrics"][model]["internal80"]
        rows.append(
            f"| {model} | {metric['caseCount']} | {metric['wape']:.4f} | "
            f"{metric['signedAggregateBias']:+.4f} | {metric['mae']:.2f} | "
            f"{metric['smape']:.4f} | {interval['internal80Coverage']:.4f} | "
            f"{interval['meanWis']:.2f} |"
        )
    primary = report["technicalSummary"]["primaryComparator"]
    scope = report["scopeAndDefinitions"]
    return f"""# M2 正式现金 comparator replay v1

## 技术结论

正式现金 comparator 已在相同 {scope['developmentCaseCountPerComparator']} 个 development case、{scope['statisticallyScoreableCaseCount']} 个 statistically scoreable case 上重新播放。模型质量人口严格为 `statisticallyScoreable && modelPredictionAvailable && !routeAbstained`，共 {scope['formalModelPopulationCaseCount']} 个 case、{scope['formalModelPopulationWorkCount']} 部作品。新的 primary comparator 为 **{primary}**。

无承诺纯买断仍保留在冻结 case universe 中，但 raw/served 均为 null，未按 0 进入 WAPE。B0a 和旧目标指标只作历史审计，未参与本次选择。

## comparator 结果

| comparator | 模型人口 case | WAPE | signed bias | MAE | SMAPE | 内部 80% coverage | WIS |
|---|---:|---:|---:|---:|---:|---:|---:|
{chr(10).join(rows)}

## 范围与口径

- 实际值：`forecastableCashActual`。
- 产品数值：未来实销现金加 cutoff 已确认应收；当前历史承诺角色为 0。
- pure-buyout 无承诺：`rawModelPrediction=null`、`servedPrediction=null`、`routeAbstained=true`。
- served 指标只使用 business serving eligible 且有有限点值的模型人口。
- source 与 lifecycle 仅为 post-hoc 切片，不是历史特征。

## 方法与稳健性

四个 comparator 都重新经过 as-of predictor；formal route projection 创建第二个 prediction/state lock，随后才连接三套 actual。case keys、model-population keys、B4 sales-only factor 边界、old→new bridge、逐 case/聚合守恒和 future perturbation 均通过。内部 80% 区间只用于 coverage/WIS/过度自信审计，公开报告不含端点。

## 限制与下一步

本报告仍为 `not_for_formal_decision`。它只冻结 C2-R.1 的 comparator，不授权 final holdout、release、C2/C3 或 M3。精确表格比图形更适合本轮人口与守恒审计，因此未添加图表。
"""


def bundle_markdown(report: Mapping[str, Any]) -> str:
    return f"""# M2 正式现金 comparator bundle v1

## 冻结结果

- primary comparator：**{report['primaryComparator']}**
- empirical WAPE leader：{report['empiricalWapeLeader']}
- strict equivalent set：{', '.join(report['strictEquivalentSet'])}
- 模型人口：`{report['modelPopulationPredicate']}`
- target：`{report['target']}`

B0a 与 legacy-target 指标均不具备选择资格。该 bundle 仅供 C2-R.1 development PASS/FAIL 使用，保持 `not_for_formal_decision`。
"""


def surprise_markdown(report: Mapping[str, Any]) -> str:
    overlap = report["overlappingBacktestWindows"]
    unique = report["uniqueFactUnion"]
    if unique.get("status") != "available":
        unsafe = unique.get("unsafeDedupAmount")
        unsafe_text = f"{float(unsafe):.2f}" if unsafe is not None else "不可确定"
        return f"""# M2 surprise buyout 非重叠业务影响审计 v1

## 技术结论

unique audit 已按 fail-closed 规则停止，状态为 **unavailable**，原因是 `{unique.get('reason', 'authority_identity_unavailable')}`。系统没有按作品、月份或金额猜测唯一事件，也没有把重叠窗口占比改称全库业务占比。

## 重叠 backtest-window exposure

| 指标 | 结果 |
|---|---:|
| forecastable cash | {overlap['forecastableCashActual']:.2f} |
| surprise cash | {overlap['uncommittedBuyoutSurpriseActual']:.2f} |
| ledger cash | {overlap['totalLedgerCashActual']:.2f} |
| positive windows | {overlap['positiveSurpriseWindowCount']} |
| overlap share | {overlap['surpriseShareOfWindowLedgerCash']:.4%} |
| unsafe dedup amount | {unsafe_text} |

## 限制与下一步

上述 6.2892% 仅是重叠 backtest-window exposure。获得稳定、权威且可复核的 ledger fact identity 前，不生成唯一并集金额或占比。本报告保持 `not_for_formal_decision`。
"""
    return f"""# M2 surprise buyout 非重叠业务影响审计 v1

## 技术结论

冻结 authority snapshot 内存在可复核自然键，unique audit 状态为 **{unique['status']}**。唯一并集只表示 statistically scoreable development windows 中出现过的 classifier-derived surprise facts，不表示全库所有未承诺买断，也不是合同承诺事实。

## 重叠 backtest-window exposure

| 指标 | 结果 |
|---|---:|
| forecastable cash | {overlap['forecastableCashActual']:.2f} |
| surprise cash | {overlap['uncommittedBuyoutSurpriseActual']:.2f} |
| ledger cash | {overlap['totalLedgerCashActual']:.2f} |
| positive windows | {overlap['positiveSurpriseWindowCount']} |
| overlap share | {overlap['surpriseShareOfWindowLedgerCash']:.4%} |

## 非重叠唯一账单并集

| 指标 | 结果 |
|---|---:|
| unique ledger facts | {unique.get('uniqueSurpriseLedgerFactCount')} |
| unique event cells | {unique.get('uniqueSurpriseEventCellCount')} |
| involved works | {unique.get('involvedWorkCount')} |
| unique amount | {unique.get('uniqueSurpriseAmount'):.2f} |
| complete-month ledger cash | {unique.get('uniqueCompleteMonthLedgerCash'):.2f} |
| unique exposure share | {unique.get('uniqueSurpriseShareOfUniqueCompleteMonthLedgerCash'):.4%} |
| unsafe dedup amount | {unique.get('unsafeDedupAmount'):.2f} |

## 身份、方法与限制

自然键为源账单 SHA、sheet 与 source row 的组合；row hash 只作内容校验。该身份仅在当前冻结 authority revision 内稳定，不能跨源文件重排或替换自动继承。作品/月/金额没有被用作 identity。same-batch 仅为 classifier signal，不等于买断合同确认。
"""


def coverage_markdown(report: Mapping[str, Any]) -> str:
    cash_report = report["cashCoverage"]
    gate = report["observationGates"]
    return f"""# M2 正式现金完整人口与业务覆盖 v1

## 技术结论

完整人口按 3053 部作品和 192869 条完整月账单事实做非重叠 post-hoc 聚合。forecastable cash / ledger cash 为 **{cash_report['forecastableCashShareOfLedgerCash']:.2%}**，top10 forecastable cash coverage 为 **{gate['top10ForecastableCashCoverageObserved']:.2%}**。

## 现金覆盖

| 指标 | 结果 |
|---|---:|
| forecastable cash | {cash_report['forecastableCashActual']:.2f} |
| classifier surprise exposure | {cash_report['uncommittedBuyoutClassifierExposureActual']:.2f} |
| total ledger cash | {cash_report['totalLedgerCashActual']:.2f} |
| forecastable share | {cash_report['forecastableCashShareOfLedgerCash']:.4%} |
| surprise exposure share | {cash_report['classifierExposureShareOfLedgerCash']:.4%} |

## 观察门槛

- forecastable cash share 建议门槛 90%：{'通过' if gate['forecastableCashShareObservedPass'] else '未通过'}。
- top10 forecastable cash coverage 门槛 90%：{'通过' if gate['top10ForecastableCashCoverageObservedPass'] else '未通过'}。
- 即使观察门槛通过，也不构成 formal approval；若未通过，则最多只能 conditional。

## 限制

当前 route、source 和高价值切片只用于 post-hoc 业务覆盖描述，不进入历史特征或 eligibility。`endToEndBusinessGap` 与 surprise exposure 不得命名为模型 WAPE。
"""


def assert_public_safety(paths: Sequence[Path]) -> None:
    forbidden_fragments = (
        "data/private-output",
        "private-output\\",
        '"standard_work_id"',
        '"channel_key"',
        '"rawWorkId"',
        '"rawChannelId"',
        '"rawChannelName"',
    )
    for path in paths:
        text_value = path.read_text(encoding="utf-8")
        if any(fragment in text_value for fragment in forbidden_fragments):
            raise FormalReplayError(f"public formal comparator artifact is unsafe: {path.name}")


def _private_case_payload(row: Mapping[str, Any]) -> dict[str, Any]:
    key = formal.strict_case_key(row)
    return {
        "modelId": row["model_id"],
        "predictionRole": row["_residual_case_role"],
        "caseKey": {
            "standard_work_id": key[0],
            "origin": key[1],
            "horizon_months": key[2],
            "route": key[3],
        },
        "statisticallyScoreable": row["statisticallyScoreable"],
        "scoreabilityReason": row["scoreabilityReason"],
        "businessServingEligible": row["businessServingEligible"],
        "modelPredictionAvailable": row["modelPredictionAvailable"],
        "routeAbstained": row["routeAbstained"],
        "abstained": row["abstained"],
        "abstentionReason": row["abstentionReason"],
        "rawModelPrediction": row["rawModelPrediction"],
        "servedPrediction": row["servedPrediction"],
        "channelComponents": copy.deepcopy(row.get("channel_components", [])),
        "forecastableCashActual": row["forecastableCashActual"],
        "uncommittedBuyoutSurpriseActual": row[
            "uncommittedBuyoutSurpriseActual"
        ],
        "totalLedgerCashActual": row["totalLedgerCashActual"],
        "forecastableActualByComponent": copy.deepcopy(
            row.get("forecastableActualByComponent", {})
        ),
        "totalLedgerActualByComponent": copy.deepcopy(
            row.get("totalLedgerActualByComponent", {})
        ),
        "targetEnd": row["target_end"],
        "labelAvailableAsOf": row["label_available_as_of"],
        "billMonthMax": row["_bill_month_max"],
        "sourceAvailableAsOf": row["_available_as_of"],
        "strata": copy.deepcopy(row.get("strata", {})),
        "internalInterval": copy.deepcopy(row.get("_internal_interval", {})),
    }


def write_private_evidence(
    rows: Sequence[Mapping[str, Any]],
    *,
    input_fingerprint: str,
    public_reports: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
    PRIVATE_DIR.mkdir(parents=True, exist_ok=True)
    digest_builder = hashlib.sha256()
    count = 0
    with PRIVATE_CASES.open("wb") as handle:
        for row in sorted(
            rows,
            key=lambda item: (
                str(item["model_id"]),
                str(item["_residual_case_role"]),
                formal.strict_case_key(item),
            ),
        ):
            payload = _private_case_payload(row)
            encoded = (
                json.dumps(
                    payload,
                    ensure_ascii=False,
                    sort_keys=True,
                    separators=(",", ":"),
                    allow_nan=False,
                ).encode("utf-8")
                + b"\n"
            )
            handle.write(encoded)
            digest_builder.update(encoded)
            count += 1
    manifest = {
        "schema": "m2.formal_cash_comparator.private_manifest.v1",
        "decisionStatus": "not_for_formal_decision",
        "tracked": False,
        "formalCashComparatorSpecDigest": formal.canonical_digest(formal.load_spec()),
        "inputFingerprint": input_fingerprint,
        "privateCaseRowCount": count,
        "caseEvidenceSha256": digest_builder.hexdigest(),
        "publicReportDigests": {
            name: digest(report) for name, report in sorted(public_reports.items())
        },
        "finalHoldoutOpened": False,
        "embargoShadowOpened": False,
        "deferred60MonthLabelsOpened": False,
        "C2R1TrainingStarted": False,
    }
    write_json(PRIVATE_MANIFEST, manifest)
    if run_git("ls-files", "--", str(PRIVATE_CASES)) or run_git(
        "ls-files", "--", str(PRIVATE_MANIFEST)
    ):
        raise FormalReplayError("private formal comparator evidence entered Git")
    return manifest


def run_phase_a(*, write: bool) -> dict[str, Any]:
    progress("verifying branch, seals, and private boundaries")
    require_boundaries()
    contract = formal.load_spec()
    calibration_spec, _v11, _v12_amendment = v12.load_and_validate_contract()
    progress("loading and verifying frozen Phase A case evidence")
    phase_evidence = forensic.load_phase_a_evidence()
    phase_rows = phase_evidence["rows"]
    progress("loading the authorized work cache read-only")
    works_list, posthoc, input_evidence = legacy.load_authorized_works(
        calibration_spec
    )
    gate_a = json.loads(phase.GATE_A_JSON.read_text(encoding="utf-8"))
    expected_input = gate_a["evidenceBindings"]["inputFingerprint"]
    if input_evidence.get("inputFingerprint") != expected_input:
        raise FormalReplayError("formal comparator authority differs from Gate A")
    if any(
        role in work
        for work in works_list
        for role in (
            "cash_commitment_snapshots",
            "cash_commitment_settlement_links",
            "authority_ledger_fact_registry",
        )
    ):
        raise FormalReplayError("an unbound commitment or settlement role appeared")
    origins = list(contract["caseContract"]["origins"])
    b4_specs, fold_evidence = _b4_fold_specs(calibration_spec, origins)
    contexts: dict[str, dict[str, Any]] = {}
    locks: list[dict[str, Any]] = []

    progress("fresh-replaying interval warmup through every comparator entry")
    warmup, lock = _materialize_role(
        role="development_warmup_interval_calibration",
        phase_rows=phase_rows,
        works_list=works_list,
        calibration_spec=calibration_spec,
        b4_spec=calibration_spec,
        b4_role="interval_warmup_cold_start",
        contexts=contexts,
    )
    locks.append(lock)
    phase.attach_strata(warmup, works_list, posthoc)
    forward: list[dict[str, Any]] = []
    for origin in origins:
        progress(f"fresh-replaying formal comparator origin {origin}")
        role = f"development_forward_score:{origin}"
        held, lock = _materialize_role(
            role=role,
            phase_rows=phase_rows,
            works_list=works_list,
            calibration_spec=calibration_spec,
            b4_spec=b4_specs[origin],
            b4_role="development_forward_fold",
            contexts=contexts,
        )
        phase.attach_strata(held, works_list, posthoc)
        forward.extend(held)
        locks.append(lock)
    progress("calibrating internal 80% intervals on formal model populations")
    formal.apply_internal_intervals(forward, [*warmup, *forward], contract)

    metrics = {
        model: metrics_for_model(
            [row for row in forward if row.get("model_id") == model]
        )
        for model in formal.MODEL_IDS
    }
    leader = min(
        formal.MODEL_IDS,
        key=lambda model: (
            float(metrics[model]["modelPopulation"]["wape"]),
            model,
        ),
    )
    bootstrap = formal.paired_relative_block_bootstrap(
        forward, leader, formal.MODEL_IDS, contract
    )
    selection = formal.select_primary_comparator(metrics, bootstrap, contract)

    progress("building non-overlapping complete-month business population")
    _population_rows, population = _complete_month_population(
        works_list, calibration_spec, posthoc
    )
    coverage = population["coverageReport"]
    progress("reconciling unique surprise facts through frozen authority identities")
    unique = _private_fact_identity_audit(
        forward_rows=forward,
        works_list=works_list,
        posthoc=posthoc,
        population=population,
    )
    if unique["status"] == "available" and not math.isclose(
        float(unique["uniqueCompleteMonthLedgerCash"]),
        float(population["totalLedgerCash"]),
        rel_tol=0.0,
        abs_tol=0.01,
    ):
        raise FormalReplayError("unique fact ledger total differs from work population")

    progress("building comparator, bundle, surprise, coverage, and Gate B reports")
    replay, bundle, surprise, coverage = _build_public_reports(
        forward=forward,
        metrics=metrics,
        bootstrap=bootstrap,
        selection=selection,
        locks=locks,
        fold_evidence=fold_evidence,
        input_evidence=input_evidence,
        phase_evidence=phase_evidence,
        unique=unique,
        coverage=coverage,
        contract=contract,
    )
    # Every content replay resets runtime attestations. A prior validation or
    # push receipt can never authorize newly materialized evidence.
    validation_passed = False
    validation_sha = None
    phase_pushed = False
    phase_checkpoint = None
    gate = _gate_report(
        replay,
        bundle,
        surprise,
        coverage,
        validation_passed=validation_passed,
        validation_receipt_sha256=validation_sha,
        phase_a_commit_pushed=phase_pushed,
        phase_a_checkpoint=phase_checkpoint,
    )
    public_reports = {
        "replay": replay,
        "bundle": bundle,
        "surprise": surprise,
        "coverage": coverage,
    }
    manifest = None
    if write:
        write_json(REPLAY_JSON, replay)
        write_text(REPLAY_MD, replay_markdown(replay))
        write_json(BUNDLE_JSON, bundle)
        write_text(BUNDLE_MD, bundle_markdown(bundle))
        write_json(SURPRISE_JSON, surprise)
        write_text(SURPRISE_MD, surprise_markdown(surprise))
        write_json(COVERAGE_JSON, coverage)
        write_text(COVERAGE_MD, coverage_markdown(coverage))
        write_json(GATE_B_JSON, gate)
        assert_public_safety(
            (
                REPLAY_JSON,
                REPLAY_MD,
                BUNDLE_JSON,
                BUNDLE_MD,
                SURPRISE_JSON,
                SURPRISE_MD,
                COVERAGE_JSON,
                COVERAGE_MD,
                GATE_B_JSON,
            )
        )
        manifest = write_private_evidence(
            [*warmup, *forward],
            input_fingerprint=str(input_evidence["inputFingerprint"]),
            public_reports=public_reports,
        )
    return {
        "status": "passed",
        "write": write,
        "primaryComparator": selection["primaryPerformanceComparator"],
        "modelPopulationCaseCount": metrics["B4"]["modelPopulation"]["caseCount"],
        "metrics": {
            model: {
                "wape": rounded(metrics[model]["modelPopulation"]["wape"]),
                "signedAggregateBias": rounded(
                    metrics[model]["modelPopulation"]["signedAggregateBias"]
                ),
            }
            for model in formal.MODEL_IDS
        },
        "uniqueAuditStatus": unique["status"],
        "uniqueSurpriseAmount": unique.get("uniqueSurpriseAmount"),
        "gateBPassedConditionCount": gate["passedConditionCount"],
        "gateBConditionCount": gate["conditionCount"],
        "gateBAllTrue": gate["allTrue"],
        "privateCaseEvidenceSha256": (
            manifest["caseEvidenceSha256"] if manifest else None
        ),
        "finalHoldoutOpened": False,
    }


def verify_phase_a() -> dict[str, Any]:
    required = (
        REPLAY_JSON,
        REPLAY_MD,
        BUNDLE_JSON,
        BUNDLE_MD,
        SURPRISE_JSON,
        SURPRISE_MD,
        COVERAGE_JSON,
        COVERAGE_MD,
        GATE_B_JSON,
        PRIVATE_CASES,
        PRIVATE_MANIFEST,
    )
    if any(not path.is_file() for path in required):
        raise FormalReplayError("formal comparator evidence is incomplete")
    manifest = json.loads(PRIVATE_MANIFEST.read_text(encoding="utf-8"))
    digest_builder = hashlib.sha256()
    row_count = 0
    with PRIVATE_CASES.open("rb") as handle:
        for raw in handle:
            if not raw.endswith(b"\n"):
                raise FormalReplayError("private comparator cases are not LF-delimited")
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
                raise FormalReplayError("private comparator case is not canonical")
            digest_builder.update(raw)
            row_count += 1
    if (
        row_count != int(manifest["privateCaseRowCount"])
        or digest_builder.hexdigest() != manifest["caseEvidenceSha256"]
    ):
        raise FormalReplayError("private comparator case manifest differs")
    report_paths = {
        "replay": REPLAY_JSON,
        "bundle": BUNDLE_JSON,
        "surprise": SURPRISE_JSON,
        "coverage": COVERAGE_JSON,
    }
    for name, path in report_paths.items():
        report = json.loads(path.read_text(encoding="utf-8"))
        if digest(report) != manifest["publicReportDigests"][name]:
            raise FormalReplayError(f"private manifest differs from public {name}")
    assert_public_safety(
        (
            REPLAY_JSON,
            REPLAY_MD,
            BUNDLE_JSON,
            BUNDLE_MD,
            SURPRISE_JSON,
            SURPRISE_MD,
            COVERAGE_JSON,
            COVERAGE_MD,
            GATE_B_JSON,
        )
    )
    return {
        "status": "passed",
        "privateCaseRowCount": row_count,
        "privateCaseEvidenceSha256": digest_builder.hexdigest(),
        "publicReportBindingsVerified": True,
        "privateArtifactsTracked": False,
        "finalHoldoutOpened": False,
    }


VALIDATION_COMMANDS = (
    "npm run check:no-real-data",
    "npm run lint",
    "npm run build",
    "npm test",
    "npm run smoke",
    "npm run test:e2e",
    "npm run validate:m2:formal-cash-target",
    "npm run validate:m2:formal-cash-comparator",
)

EXPECTED_FAIL_CLOSED_COMMANDS = (
    "npm run replay:m2:formal-cash-target:final-holdout",
    "npm run replay:m2:formal-cash-comparator:final-holdout",
)


def _validation_process(command: str) -> tuple[dict[str, Any], bytes, bytes]:
    parts = command.split()
    if not parts or parts[0] != "npm":
        raise FormalReplayError(f"unsupported validation command: {command}")
    executable = "npm.cmd" if os.name == "nt" else "npm"
    environment = os.environ.copy()
    environment.update(
        {
            "M1_APP_ENV": "ci",
            "M1_DATABASE_URL": "",
            "M1_DATABASE_READONLY_URL": "",
            "M1_DATABASE_BACKGROUND_URL": "",
        }
    )
    process = subprocess.run(
        [executable, *parts[1:]],
        cwd=ROOT,
        env=environment,
        capture_output=True,
        check=False,
        timeout=1200,
    )
    stdout = process.stdout or b""
    stderr = process.stderr or b""
    result = {
        "command": command,
        "exitCode": int(process.returncode),
        "stdoutSha256": hashlib.sha256(stdout).hexdigest(),
        "stderrSha256": hashlib.sha256(stderr).hexdigest(),
        "stdoutBytes": len(stdout),
        "stderrBytes": len(stderr),
    }
    return result, stdout, stderr


def _validate_receipt(receipt: Mapping[str, Any]) -> None:
    if (
        receipt.get("schema")
        != "m2.calibration_gate_b.validation_receipt.private.v1"
        or receipt.get("branch") != BRANCH
        or receipt.get("phaseAStartHead") != PHASE_A_START_HEAD
        or receipt.get("allSuccessCommandsPassed") is not True
        or receipt.get("allExpectedFailClosedCommandsFailedBeforeDataLoad") is not True
        or any(
            receipt.get(field) is not False
            for field in (
                "finalHoldoutOpened",
                "embargoShadowOpened",
                "deferred60MonthLabelsOpened",
            )
        )
    ):
        raise FormalReplayError("Gate B validation receipt boundary differs")
    if receipt.get("phaseAHead") is not None:
        for field in ("phaseAHead", "phaseATree", "remoteHead"):
            value = str(receipt.get(field, ""))
            if len(value) != 40 or any(char not in "0123456789abcdef" for char in value):
                raise FormalReplayError("Gate B runtime validation Git binding is invalid")
        if receipt["phaseAHead"] != receipt["remoteHead"]:
            raise FormalReplayError("Gate B runtime validation remote binding differs")
    successes = receipt.get("commandResults")
    failures = receipt.get("expectedFailClosedCommandResults")
    if not isinstance(successes, list) or not isinstance(failures, list):
        raise FormalReplayError("Gate B validation receipt lacks command results")
    if [item.get("command") for item in successes] != list(VALIDATION_COMMANDS):
        raise FormalReplayError("Gate B validation command set differs")
    if [item.get("command") for item in failures] != list(
        EXPECTED_FAIL_CLOSED_COMMANDS
    ):
        raise FormalReplayError("Gate B fail-closed command set differs")
    if any(int(item.get("exitCode", -1)) != 0 for item in successes):
        raise FormalReplayError("Gate B receipt records a failed validation command")
    if any(int(item.get("exitCode", 0)) == 0 for item in failures):
        raise FormalReplayError("Gate B receipt records an open final-holdout command")
    required = {
        "command",
        "exitCode",
        "stdoutSha256",
        "stderrSha256",
        "stdoutBytes",
        "stderrBytes",
    }
    for item in [*successes, *failures]:
        if set(item) != required:
            raise FormalReplayError("Gate B validation result shape differs")
        if len(str(item["stdoutSha256"])) != 64 or len(str(item["stderrSha256"])) != 64:
            raise FormalReplayError("Gate B validation output digest is invalid")
        if int(item["stdoutBytes"]) + int(item["stderrBytes"]) <= 0:
            raise FormalReplayError("Gate B validation command produced no evidence")
    if receipt.get("databaseEnvironmentEmpty") is not True:
        raise FormalReplayError("Gate B validation did not attest empty database roles")
    if receipt.get("M1_APP_ENV") != "ci":
        raise FormalReplayError("Gate B validation did not use CI semantics")


def execute_validation_suite() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    successes: list[dict[str, Any]] = []
    for command in VALIDATION_COMMANDS:
        progress(f"validation: {command}")
        result, stdout, stderr = _validation_process(command)
        if result["exitCode"] != 0:
            diagnostic = (stderr or stdout)[-1600:].decode("utf-8", errors="replace")
            raise FormalReplayError(
                f"validation failed ({command}, exit={result['exitCode']}): {diagnostic}"
            )
        successes.append(result)
    failures: list[dict[str, Any]] = []
    for command in EXPECTED_FAIL_CLOSED_COMMANDS:
        progress(f"fail-closed validation: {command}")
        result, stdout, stderr = _validation_process(command)
        combined = (stdout + b"\n" + stderr).decode("utf-8", errors="replace").lower()
        compact = combined.replace(" ", "")
        if (
            result["exitCode"] == 0
            or "final" not in combined
            or "holdout" not in combined
            or "dataloadcalls=0" not in compact
        ):
            raise FormalReplayError(
                f"final-holdout command did not fail closed before load: {command}"
            )
        failures.append(result)
    return successes, failures


def _load_public_gate_inputs() -> tuple[dict[str, Any], ...]:
    paths = (REPLAY_JSON, BUNDLE_JSON, SURPRISE_JSON, COVERAGE_JSON)
    if any(not path.is_file() for path in paths):
        raise FormalReplayError("formal comparator public reports are incomplete")
    return tuple(json.loads(path.read_text(encoding="utf-8")) for path in paths)


def finalize_gate_b_validation() -> dict[str, Any]:
    """Run the complete CI-semantic suite and bind it before the Phase A commit."""

    require_boundaries()
    verification = verify_phase_a()
    replay, bundle, surprise, coverage = _load_public_gate_inputs()
    gate_before = _gate_report(replay, bundle, surprise, coverage)
    false_before = [key for key, value in gate_before["conditions"].items() if not value]
    if set(false_before) != {"full_validation_suite_passed", "phase_a_commit_pushed"}:
        raise FormalReplayError(
            "Gate B content has failures before validation: " + ", ".join(false_before)
        )
    # Refresh the machine gate from the frozen reports before the test suite;
    # this makes the tests validate current source logic rather than a stale
    # pre-fix Gate JSON.
    write_json(GATE_B_JSON, gate_before)
    assert_public_safety((GATE_B_JSON,))
    successes, failures = execute_validation_suite()
    receipt = {
        "schema": "m2.calibration_gate_b.validation_receipt.private.v1",
        "recordedAt": datetime.now(timezone.utc).isoformat(),
        "branch": BRANCH,
        "phaseAStartHead": PHASE_A_START_HEAD,
        "M1_APP_ENV": "ci",
        "databaseEnvironmentEmpty": True,
        "realDataCalibrationExecutedByValidationCommands": False,
        "commandResults": successes,
        "expectedFailClosedCommandResults": failures,
        "allSuccessCommandsPassed": True,
        "allExpectedFailClosedCommandsFailedBeforeDataLoad": True,
        "finalHoldoutOpened": False,
        "embargoShadowOpened": False,
        "deferred60MonthLabelsOpened": False,
    }
    _validate_receipt(receipt)
    PRIVATE_DIR.mkdir(parents=True, exist_ok=True)
    write_json(PRIVATE_VALIDATION, receipt)
    if run_git("ls-files", "--", str(PRIVATE_VALIDATION)):
        raise FormalReplayError("private Gate B validation receipt entered Git")
    receipt_sha = file_sha256(PRIVATE_VALIDATION)
    gate = _gate_report(
        replay,
        bundle,
        surprise,
        coverage,
        validation_passed=True,
        validation_receipt_sha256=receipt_sha,
        validation_evidence=receipt,
    )
    if [key for key, value in gate["conditions"].items() if not value] != [
        "phase_a_commit_pushed"
    ]:
        raise FormalReplayError("Gate B did not reduce to the push condition")
    write_json(GATE_B_JSON, gate)
    assert_public_safety((GATE_B_JSON,))
    return {
        "status": "passed",
        "phaseAContentVerified": verification["status"] == "passed",
        "validationCommandCount": len(successes),
        "failClosedCommandCount": len(failures),
        "gateBPassedConditionCount": gate["passedConditionCount"],
        "gateBConditionCount": gate["conditionCount"],
        "onlyPendingCondition": "phase_a_commit_pushed",
        "validationReceiptSha256": receipt_sha,
        "privateReceiptTracked": False,
        "C2R1AuthorizedByGateB": False,
        "finalHoldoutOpened": False,
    }


def _remote_branch_head() -> str:
    output = run_git("ls-remote", "--heads", "origin", f"refs/heads/{BRANCH}")
    fields = output.split()
    if len(fields) != 2 or fields[1] != f"refs/heads/{BRANCH}":
        raise FormalReplayError("authorized remote branch head is unavailable")
    return fields[0]


def verify_gate_b_after_push() -> dict[str, Any]:
    """Attest the pushed Phase A checkpoint and materialize the final Gate B state."""

    require_boundaries()
    if run_git("status", "--porcelain=v1", "--untracked-files=all"):
        raise FormalReplayError("Gate B push verification requires a clean worktree")
    head = run_git("rev-parse", "HEAD")
    if run_git("rev-parse", "HEAD^") != PHASE_A_START_HEAD:
        raise FormalReplayError("Phase A checkpoint parent differs from the authorized HEAD")
    upstream = run_git(
        "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"
    )
    if upstream != f"origin/{BRANCH}":
        raise FormalReplayError("tracked upstream differs from the authorized branch")
    remote_head = _remote_branch_head()
    if head != run_git("rev-parse", "@{upstream}") or head != remote_head:
        raise FormalReplayError("Phase A checkpoint is not the current remote head")
    verification = verify_phase_a()
    if not PRIVATE_VALIDATION.is_file():
        raise FormalReplayError("private Gate B validation receipt is missing")
    validation_receipt = json.loads(PRIVATE_VALIDATION.read_text(encoding="utf-8"))
    _validate_receipt(validation_receipt)
    precommit_validation_sha = file_sha256(PRIVATE_VALIDATION)
    tracked_gate = json.loads(GATE_B_JSON.read_text(encoding="utf-8"))
    if tracked_gate.get("validationReceiptSha256") != precommit_validation_sha:
        raise FormalReplayError("tracked Gate B differs from the validation receipt")
    if [key for key, value in tracked_gate["conditions"].items() if not value] != [
        "phase_a_commit_pushed"
    ]:
        raise FormalReplayError("tracked Gate B was not ready for push attestation")
    replay, bundle, surprise, coverage = _load_public_gate_inputs()
    # Re-run the entire suite on the clean, remotely confirmed commit so the
    # authorization is bound to the actual pushed tree rather than a mutable
    # pre-commit working copy.
    runtime_successes, runtime_failures = execute_validation_suite()
    runtime_validation_receipt = {
        "schema": "m2.calibration_gate_b.validation_receipt.private.v1",
        "recordedAt": datetime.now(timezone.utc).isoformat(),
        "branch": BRANCH,
        "phaseAStartHead": PHASE_A_START_HEAD,
        "phaseAHead": head,
        "phaseATree": run_git("rev-parse", "HEAD^{tree}"),
        "trackedArtifactSha256": commit_artifact_digests(head),
        "remoteHead": remote_head,
        "M1_APP_ENV": "ci",
        "databaseEnvironmentEmpty": True,
        "realDataCalibrationExecutedByValidationCommands": False,
        "commandResults": runtime_successes,
        "expectedFailClosedCommandResults": runtime_failures,
        "allSuccessCommandsPassed": True,
        "allExpectedFailClosedCommandsFailedBeforeDataLoad": True,
        "finalHoldoutOpened": False,
        "embargoShadowOpened": False,
        "deferred60MonthLabelsOpened": False,
    }
    _validate_receipt(runtime_validation_receipt)
    write_json(PRIVATE_VALIDATION, runtime_validation_receipt)
    validation_sha = file_sha256(PRIVATE_VALIDATION)
    receipt = {
        "schema": "m2.calibration_gate_b.push_receipt.private.v1",
        "recordedAt": datetime.now(timezone.utc).isoformat(),
        "branch": BRANCH,
        "upstream": upstream,
        "phaseAHead": head,
        "phaseAParent": PHASE_A_START_HEAD,
        "remoteHead": remote_head,
        "phaseATree": run_git("rev-parse", "HEAD^{tree}"),
        "trackedArtifactSha256": commit_artifact_digests(head),
        "precommitValidationReceiptSha256": precommit_validation_sha,
        "runtimeValidationReceiptSha256": validation_sha,
        "runtimeValidationReexecutedOnRemoteConfirmedTree": True,
        "phaseAContentVerified": verification["status"] == "passed",
        "privateFilesTracked": False,
        "finalHoldoutOpened": False,
        "embargoShadowOpened": False,
        "deferred60MonthLabelsOpened": False,
    }
    write_json(PRIVATE_PUSH_RECEIPT, receipt)
    if run_git("ls-files", "--", str(PRIVATE_PUSH_RECEIPT)):
        raise FormalReplayError("private Gate B push receipt entered Git")
    push_sha = file_sha256(PRIVATE_PUSH_RECEIPT)
    gate = _gate_report(
        replay,
        bundle,
        surprise,
        coverage,
        validation_passed=True,
        validation_receipt_sha256=validation_sha,
        validation_evidence=runtime_validation_receipt,
        phase_a_commit_pushed=True,
        phase_a_checkpoint=head,
        remote_head_verified=True,
    )
    gate["runtimePushReceiptSha256"] = push_sha
    if not gate["allTrue"] or gate["conditionCount"] != 14:
        failed = [key for key, value in gate["conditions"].items() if not value]
        raise FormalReplayError("Gate B is not all true after push: " + ", ".join(failed))
    write_json(GATE_B_JSON, gate)
    assert_public_safety((GATE_B_JSON,))
    return {
        "status": "passed",
        "gateBAllTrue": True,
        "gateBPassedConditionCount": 14,
        "gateBConditionCount": 14,
        "phaseAHead": head,
        "remoteHead": remote_head,
        "C2R1AuthorizedByGateB": True,
        "runtimePushReceiptSha256": push_sha,
        "privateReceiptTracked": False,
        "finalHoldoutOpened": False,
    }


def verify_c2r1_authorization() -> dict[str, Any]:
    """Verify Gate B without mutating its post-push evidence."""

    require_boundaries()
    if not GATE_B_JSON.is_file() or not PRIVATE_PUSH_RECEIPT.is_file():
        raise FormalReplayError("Gate B push evidence is incomplete")
    gate = json.loads(GATE_B_JSON.read_text(encoding="utf-8"))
    receipt = json.loads(PRIVATE_PUSH_RECEIPT.read_text(encoding="utf-8"))
    require_current_phase_a_sources_match_commit(
        receipt.get("trackedArtifactSha256", {})
    )
    if (
        gate.get("allTrue") is not True
        or gate.get("C2R1AuthorizedByGateB") is not True
        or len(gate.get("conditions", {})) != 14
        or any(value is not True for value in gate["conditions"].values())
        or gate.get("runtimePushReceiptSha256") != file_sha256(PRIVATE_PUSH_RECEIPT)
        or gate.get("validationReceiptSha256") != file_sha256(PRIVATE_VALIDATION)
        or receipt.get("phaseAHead") != gate.get("phaseACheckpoint")
        or receipt.get("remoteHead") != gate.get("phaseACheckpoint")
        or _remote_branch_head() != gate.get("phaseACheckpoint")
        or receipt.get("trackedArtifactSha256")
        != commit_artifact_digests(str(receipt.get("phaseAHead")))
    ):
        raise FormalReplayError("Gate B runtime authorization differs")
    return {
        "status": "passed",
        "gateBAllTrue": True,
        "phaseACheckpoint": gate["phaseACheckpoint"],
        "C2R1AuthorizedByGateB": True,
        "finalHoldoutOpened": False,
    }


def preflight() -> dict[str, Any]:
    checkout_boundary = require_boundaries(
        allow_trusted_ci_checkout=True,
        allow_synthetic_m2_branch=True,
        allow_clean_local_main=True,
    )
    contract = formal.load_spec()
    synthetic = formal.synthetic_self_test()
    formal_future = formal.future_perturbation_self_test()
    future = phase.future_perturbation_evidence(base.load_spec())
    return {
        "status": "passed",
        "mode": "synthetic-only",
        "checkoutBoundary": checkout_boundary,
        "checkoutBoundarySelfTest": _checkout_boundary_self_test(),
        "specDigest": formal.canonical_digest(contract),
        "synthetic": synthetic,
        "futurePerturbation": future,
        "formalProjectionFuturePerturbation": formal_future,
        "seals": _seals(),
        "privateDataRead": False,
        "dataLoadCalls": 0,
        "finalHoldoutOpened": False,
    }


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--preflight", action="store_true")
    modes.add_argument("--run-phase-a", action="store_true")
    modes.add_argument("--verify-phase-a", action="store_true")
    modes.add_argument("--finalize-gate-b-validation", action="store_true")
    modes.add_argument("--verify-gate-b-after-push", action="store_true")
    modes.add_argument("--verify-c2r1-authorization", action="store_true")
    modes.add_argument("--run-final-holdout", action="store_true")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        if args.run_final_holdout:
            raise FormalReplayError(
                "final holdout is sealed in the formal-cash comparator runner; "
                "dataLoadCalls=0"
            )
        if args.run_phase_a:
            result = run_phase_a(write=True)
        elif args.verify_phase_a:
            result = verify_phase_a()
        elif args.finalize_gate_b_validation:
            result = finalize_gate_b_validation()
        elif args.verify_gate_b_after_push:
            result = verify_gate_b_after_push()
        elif args.verify_c2r1_authorization:
            result = verify_c2r1_authorization()
        else:
            result = preflight()
        print(json.dumps(result, ensure_ascii=False, sort_keys=True, allow_nan=False))
        return 0
    except (
        FormalReplayError,
        formal.FormalComparatorError,
        cash.FormalCashContractError,
        v12.CalibrationV12Error,
        forensic.C1ForensicError,
        legacy.ReplayError,
        RuntimeError,
        ValueError,
        AssertionError,
    ) as exc:
        print(
            json.dumps({"status": "failed", "reason": str(exc)}, ensure_ascii=False),
            file=sys.stderr,
        )
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
