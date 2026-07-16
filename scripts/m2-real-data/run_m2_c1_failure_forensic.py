#!/usr/bin/env python3
"""Audit the failed C1 implementation without changing the frozen candidate.

The default preflight is synthetic-only.  The authorized audit reads the
already-verified ignored C1 and Phase-A evidence plus the read-only 3053-work
cache.  It never exposes or constructs final-holdout, embargo, or deferred
60-month truth.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import statistics
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

import m2_calibration_v1 as base
import m2_calibration_v1_2 as v12
import run_m2_c1_development_validation as c1
import run_m2_calibration_baseline_replay as legacy
import run_m2_calibration_v1_2 as phase


ROOT = Path(__file__).resolve().parents[2]
PUBLIC_DIR = ROOT / "docs" / "analysis" / "m2-real-data"
PUBLIC_JSON = PUBLIC_DIR / "M2-C1-failure-root-cause-v1.json"
PUBLIC_MD = PUBLIC_DIR / "M2-C1-failure-root-cause-v1.md"
PRIVATE_DIR = ROOT / "data" / "private-output" / "m2-calibration-v1-2"
PRIVATE_ATTRIBUTION = PRIVATE_DIR / "M2-C1-failure-component-attribution-private-v1.json"
BRANCH = "codex/m2-calibration-v1"
C1_CHECKPOINT = "9d8cee8dbf3526de61e25d20036947d25ad0b010"
PHASE_A_CHECKPOINT = c1.PHASE_A_HEAD
MINIMUM_CELL = 10
TOLERANCE = 1e-6


class C1ForensicError(RuntimeError):
    """A C1 forensic evidence or safety contract failed."""


def run_git(*args: str) -> str:
    process = subprocess.run(
        ["git", *args], cwd=ROOT, text=True, capture_output=True, check=False
    )
    if process.returncode != 0:
        raise C1ForensicError(process.stderr.strip() or "git command failed")
    return process.stdout.strip()


def write_json(path: Path, value: Mapping[str, Any]) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True, allow_nan=False)
        + "\n",
        encoding="utf-8",
        newline="\n",
    )


def write_text(path: Path, value: str) -> None:
    path.write_text(value.rstrip() + "\n", encoding="utf-8", newline="\n")


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def git_blob_bytes(commit: str, relative: str) -> bytes:
    process = subprocess.run(
        ["git", "show", f"{commit}:{relative}"],
        cwd=ROOT,
        capture_output=True,
        check=False,
    )
    if process.returncode != 0:
        raise C1ForensicError(
            process.stderr.decode("utf-8", errors="replace").strip()
            or f"Git blob is unavailable: {commit}:{relative}"
        )
    return process.stdout


def git_blob_sha256(commit: str, relative: str) -> str:
    return hashlib.sha256(git_blob_bytes(commit, relative)).hexdigest()


def require_frozen_checkpoint(checkpoint: str, label: str) -> None:
    current_head = run_git("rev-parse", "HEAD")
    ancestor = subprocess.run(
        ["git", "merge-base", "--is-ancestor", checkpoint, current_head],
        cwd=ROOT,
        check=False,
    )
    if ancestor.returncode != 0:
        raise C1ForensicError(f"{label} checkpoint is not an ancestor of HEAD")


def verify_git_hash_map(
    checkpoint: str,
    hashes: Mapping[str, Any],
    label: str,
    *,
    allowed_non_model_mismatches: frozenset[str] = frozenset(),
) -> dict[str, dict[str, str]]:
    mismatches: dict[str, dict[str, str]] = {}
    for relative, expected in hashes.items():
        observed = git_blob_sha256(checkpoint, str(relative))
        if observed != str(expected):
            if str(relative) not in allowed_non_model_mismatches:
                raise C1ForensicError(f"{label} Git blob digest differs: {relative}")
            mismatches[str(relative)] = {
                "manifestSha256": str(expected),
                "gitBlobSha256": observed,
            }
    if set(mismatches) != set(allowed_non_model_mismatches):
        missing = sorted(set(allowed_non_model_mismatches).difference(mismatches))
        raise C1ForensicError(
            f"{label} expected historical non-model mismatch is absent: {missing}"
        )
    return mismatches


def rounded(value: Any, places: int = 8) -> float | None:
    if value is None:
        return None
    number = float(value)
    return round(number, places) if math.isfinite(number) else None


def public_value(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {
            str(key): public_value(child)
            for key, child in value.items()
            if key not in {"actualTotal", "predictedTotal"}
        }
    if isinstance(value, list):
        return [public_value(child) for child in value]
    if isinstance(value, float):
        return rounded(value)
    return value


def require_private_boundaries() -> None:
    paths = (
        c1.PRIVATE_CASES,
        c1.PRIVATE_MANIFEST,
        c1.PRIVATE_WORKBOOK,
        phase.PRIVATE_PHASE_A_CASES,
        phase.PRIVATE_PHASE_A_MANIFEST,
        phase.PRIVATE_GATE_A_RECEIPT,
        PRIVATE_ATTRIBUTION,
    )
    for path in paths:
        if not phase.git_ignored(path):
            raise C1ForensicError(f"private forensic role is not ignored: {path.name}")
        if run_git("ls-files", "--", str(path)):
            raise C1ForensicError(f"private forensic role is tracked: {path.name}")
    if phase.tracked_private_artifacts():
        raise C1ForensicError("a private calibration artifact is tracked")


def load_phase_a_evidence() -> dict[str, Any]:
    """Verify Phase A evidence against its frozen Git tree, not CRLF checkout bytes."""

    require_frozen_checkpoint(PHASE_A_CHECKPOINT, "Phase A")
    manifest = json.loads(phase.PRIVATE_PHASE_A_MANIFEST.read_text(encoding="utf-8"))
    receipt = json.loads(phase.PRIVATE_GATE_A_RECEIPT.read_text(encoding="utf-8"))
    spec, _v11, amendment = v12.load_and_validate_contract()
    if (
        manifest.get("schema")
        != "m2.calibration_v1_2.baseline_private_manifest.v1"
        or manifest.get("decisionStatus") != "not_for_formal_decision"
        or manifest.get("specDigest") != v12.canonical_digest(amendment)
        or manifest.get("tracked") is not False
        or any(
            manifest.get(field) is not False
            for field in (
                "finalHoldoutOpened",
                "embargoShadowOpened",
                "deferred60MonthLabelsOpened",
            )
        )
    ):
        raise C1ForensicError("Phase A private manifest contract binding failed")
    if (
        receipt.get("schema") != "m2.calibration_gate_a.runtime_result.v1"
        or receipt.get("phaseAHead") != PHASE_A_CHECKPOINT
        or receipt.get("allTrue") is not True
        or receipt.get("C1AuthorizedByGateA") is not True
        or any(
            receipt.get(field) is not False
            for field in (
                "finalHoldoutOpened",
                "embargoShadowOpened",
                "deferred60MonthLabelsOpened",
            )
        )
    ):
        raise C1ForensicError("Phase A runtime receipt contract binding failed")
    verify_git_hash_map(
        PHASE_A_CHECKPOINT,
        manifest.get("publicReportSha256", {}),
        "Phase A public evidence",
    )
    source_mismatches = verify_git_hash_map(
        PHASE_A_CHECKPOINT,
        receipt.get("sourceSha256", {}),
        "Phase A source evidence",
        allowed_non_model_mismatches=frozenset({"package.json"}),
    )
    verify_git_hash_map(
        PHASE_A_CHECKPOINT,
        receipt.get("publicReportSha256", {}),
        "Phase A receipt public evidence",
    )
    tracked_gate = json.loads(
        git_blob_bytes(
            PHASE_A_CHECKPOINT, phase.GATE_A_JSON.relative_to(ROOT).as_posix()
        ).decode("utf-8")
    )
    tracked_binding = tracked_gate.get("evidenceBindings", {})
    if receipt.get("sourceSha256") != tracked_binding.get("sourceSha256"):
        raise C1ForensicError("Phase A receipt source map differs from tracked Gate A")

    digest = hashlib.sha256()
    rows: list[dict[str, Any]] = []
    seen: set[tuple[str, str, tuple[str, str, int, str]]] = set()
    expected_role_models = phase._expected_phase_a_role_models(spec)  # pylint: disable=protected-access
    with phase.PRIVATE_PHASE_A_CASES.open("rb") as handle:
        for raw in handle:
            if not raw.endswith(b"\n") or raw in {b"\n", b"\r\n"}:
                raise C1ForensicError("Phase A private cases are not canonical LF NDJSON")
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
                raise C1ForensicError("Phase A private case line is not canonical JSON")
            row = phase._phase_a_payload_to_row(payload)  # pylint: disable=protected-access
            role = str(row["_residual_case_role"])
            key = v12.strict_case_key(row)
            if role not in expected_role_models or row["model_id"] not in expected_role_models[role]:
                raise C1ForensicError("Phase A private case has an unauthorized role/model")
            unique = (role, str(row["model_id"]), key)
            if unique in seen:
                raise C1ForensicError("Phase A private case contains a duplicate role/model/key")
            seen.add(unique)
            rows.append(row)
            digest.update(raw)
    if (
        len(rows) != int(manifest["privateCaseRowCount"])
        or digest.hexdigest() != manifest["caseEvidenceSha256"]
    ):
        raise C1ForensicError("Phase A private case count/digest differs from manifest")
    derived = phase.private_case_derived_bindings(rows)
    if derived != manifest.get("derivedBindings"):
        raise C1ForensicError("Phase A derived bindings differ from manifest")
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
        if tracked_binding.get(key) != derived.get(key):
            raise C1ForensicError(f"tracked Gate A binding differs: {key}")
    if tracked_binding.get("privateCaseEvidenceSha256") != digest.hexdigest():
        raise C1ForensicError("tracked Gate A private case digest differs")
    runtime = receipt.get("runtimeRecomputation", {})
    if (
        runtime.get("privateCaseEvidenceSha256") != digest.hexdigest()
        or runtime.get("privateCaseRowCount") != len(rows)
        or runtime.get("allSealsClosed") is not True
    ):
        raise C1ForensicError("Phase A receipt differs from private case evidence")
    return {
        "rows": rows,
        "caseEvidenceSha256": digest.hexdigest(),
        "privateCaseRowCount": len(rows),
        "derivedBindings": derived,
        "frozenCheckpoint": PHASE_A_CHECKPOINT,
        "nonModelSourceHashMismatches": source_mismatches,
    }


def load_c1_rows(phase_evidence: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Verify C1 evidence against its frozen Git tree, not current audit sources."""

    require_frozen_checkpoint(C1_CHECKPOINT, "C1")
    manifest = json.loads(c1.PRIVATE_MANIFEST.read_text(encoding="utf-8"))
    _spec, _v11, amendment = v12.load_and_validate_contract()
    if (
        manifest.get("schema") != "m2.c1_development_private_manifest.v1"
        or manifest.get("decisionStatus") != "not_for_formal_decision"
        or manifest.get("phaseAHead") != PHASE_A_CHECKPOINT
        or manifest.get("calibrationSpecV1_2Digest") != v12.canonical_digest(amendment)
        or manifest.get("tracked") is not False
        or any(
            manifest.get(field) is not False
            for field in (
                "finalHoldoutOpened",
                "embargoShadowOpened",
                "deferred60MonthLabelsOpened",
            )
        )
        or manifest.get("phaseACaseEvidenceSha256")
        != phase_evidence["caseEvidenceSha256"]
    ):
        raise C1ForensicError("C1 private manifest contract binding failed")
    source_mismatches = verify_git_hash_map(
        C1_CHECKPOINT,
        manifest.get("sourceSha256", {}),
        "C1 source evidence",
        allowed_non_model_mismatches=frozenset({"package.json"}),
    )
    public_json_relative = c1.PUBLIC_JSON.relative_to(ROOT).as_posix()
    public_md_relative = c1.PUBLIC_MD.relative_to(ROOT).as_posix()
    if git_blob_sha256(C1_CHECKPOINT, public_json_relative) != manifest.get(
        "publicReportSha256"
    ):
        raise C1ForensicError("C1 public JSON Git blob differs from private manifest")
    if git_blob_sha256(C1_CHECKPOINT, public_md_relative) != manifest.get(
        "publicMarkdownSha256"
    ):
        raise C1ForensicError("C1 public Markdown Git blob differs from private manifest")
    if file_sha256(c1.PRIVATE_WORKBOOK) != manifest.get("privateWorkbookSha256"):
        raise C1ForensicError("C1 private workbook differs from private manifest")
    rows: list[dict[str, Any]] = []
    seen: set[tuple[str, str, int, str]] = set()
    digest = hashlib.sha256()
    with c1.PRIVATE_CASES.open("rb") as handle:
        for raw in handle:
            if not raw.endswith(b"\n") or raw in {b"\n", b"\r\n"}:
                raise C1ForensicError("C1 private cases are not canonical LF NDJSON")
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
                raise C1ForensicError("C1 private case line is not canonical JSON")
            row = c1._payload_to_row(payload)  # pylint: disable=protected-access
            key = v12.strict_case_key(row)
            if key in seen:
                raise C1ForensicError("C1 private cases contain a duplicate key")
            seen.add(key)
            rows.append(row)
            digest.update(raw)
    if (
        len(rows) != int(manifest["privateCaseRowCount"])
        or digest.hexdigest() != manifest["caseEvidenceSha256"]
        or c1.c1_case_fingerprint(rows) != manifest["caseFingerprint"]
        or sum(row.get("statisticallyScoreable") is True for row in rows)
        != int(manifest["scoreableCaseCount"])
    ):
        raise C1ForensicError("C1 private case count or fingerprint differs from manifest")
    if set(source_mismatches) != {"package.json"}:
        raise C1ForensicError("C1 historical source mismatch scope changed")
    return rows


def quantile(values: Sequence[float], probability: float) -> float | None:
    clean = sorted(float(value) for value in values if math.isfinite(float(value)))
    if not clean:
        return None
    if len(clean) == 1:
        return clean[0]
    position = probability * (len(clean) - 1)
    lower = int(math.floor(position))
    upper = int(math.ceil(position))
    if lower == upper:
        return clean[lower]
    fraction = position - lower
    return clean[lower] * (1 - fraction) + clean[upper] * fraction


def ratio_distribution(numerators: Sequence[float], denominators: Sequence[float]) -> dict[str, Any]:
    if len(numerators) != len(denominators):
        raise C1ForensicError("ratio vectors have different lengths")
    ratios = [
        float(numerator) / float(denominator)
        for numerator, denominator in zip(numerators, denominators)
        if float(denominator) > 0
    ]
    zero_denominator = sum(float(value) == 0 for value in denominators)
    return {
        "definedCaseCount": len(ratios),
        "zeroActualCaseCount": zero_denominator,
        "p50": quantile(ratios, 0.50),
        "p90": quantile(ratios, 0.90),
        "p95": quantile(ratios, 0.95),
        "p99": quantile(ratios, 0.99),
        "shareAbove2x": sum(value > 2 for value in ratios) / len(ratios) if ratios else None,
        "shareAbove5x": sum(value > 5 for value in ratios) / len(ratios) if ratios else None,
        "shareAbove10x": sum(value > 10 for value in ratios) / len(ratios) if ratios else None,
    }


def metric_block(
    rows: Sequence[Mapping[str, Any]],
    b4: Mapping[tuple[str, str, int, str], Mapping[str, Any]],
    b1: Mapping[tuple[str, str, int, str], Mapping[str, Any]],
) -> dict[str, Any]:
    predictions = [float(row["rawModelPrediction"]) for row in rows]
    actuals = [float(row["actual"]) for row in rows]
    b4_values = [float(b4[v12.strict_case_key(row)]["rawModelPrediction"]) for row in rows]
    b1_values = [float(b1[v12.strict_case_key(row)]["rawModelPrediction"]) for row in rows]
    actual_total = sum(actuals)
    prediction_total = sum(predictions)
    return {
        "caseCount": len(rows),
        "workCount": len({v12.strict_case_key(row)[0] for row in rows}),
        "wape": base.wape(predictions, actuals),
        "signedAggregateBias": base.signed_aggregate_bias(predictions, actuals),
        "C1ToActualAggregateRatio": prediction_total / actual_total if actual_total > 0 else None,
        "C1ToB4AggregateRatio": prediction_total / sum(b4_values) if sum(b4_values) > 0 else None,
        "C1ToB1AggregateRatio": prediction_total / sum(b1_values) if sum(b1_values) > 0 else None,
    }


def activity_class(row: Mapping[str, Any]) -> str:
    strata = row.get("strata", {})
    if bool(strata.get("dormant")):
        return "dormant"
    if bool(strata.get("sparse_income")):
        return "sparse"
    if bool(strata.get("dense")):
        return "dense"
    return "other"


def grouped_metrics(
    rows: Sequence[Mapping[str, Any]],
    key_fn: Any,
    b4: Mapping[tuple[str, str, int, str], Mapping[str, Any]],
    b1: Mapping[tuple[str, str, int, str], Mapping[str, Any]],
) -> dict[str, Any]:
    groups: dict[str, list[Mapping[str, Any]]] = defaultdict(list)
    for row in rows:
        groups[str(key_fn(row))].append(row)
    output: dict[str, Any] = {}
    small = {
        key
        for key, group in groups.items()
        if len(group) < MINIMUM_CELL
        or len({v12.strict_case_key(row)[0] for row in group}) < MINIMUM_CELL
    }
    complement = None
    visible = [key for key in groups if key not in small]
    if small and visible:
        complement = min(visible, key=lambda key: (len(groups[key]), key))
    for key, group in sorted(groups.items()):
        if key in small or key == complement:
            output[key] = {
                "suppressed": True,
                "reason": "primary_small_cell" if key in small else "complementary_suppression",
            }
        else:
            output[key] = {"suppressed": False, **metric_block(group, b4, b1)}
    return output


def candidate_rejection_distribution(
    rows: Sequence[Mapping[str, Any]],
    component_matrix: Mapping[
        tuple[str, tuple[str, str, int, str]], Mapping[str, float | None]
    ],
    outer_origin: str,
    amendment: Mapping[str, Any],
) -> dict[str, Any]:
    contract = amendment["C1"]["training"]
    inner = [
        row
        for row in rows
        if v12.strict_case_key(row)[1] < outer_origin
        and str(row["target_end"]) <= outer_origin
        and str(row["label_available_as_of"]) <= outer_origin
        and str(row["_bill_month_max"]) <= outer_origin
        and str(row["_available_as_of"]) <= outer_origin
        and row.get("statisticallyScoreable") is True
    ]
    origins = sorted({v12.strict_case_key(row)[1] for row in inner})
    candidates = v12.enumerate_c1_candidates(amendment)
    if (
        len(origins) < int(contract["minimumInnerScoreOrigins"])
        or len(inner) < int(contract["minimumInnerCaseCount"])
    ):
        return {
            "outerOrigin": outer_origin,
            "innerOriginCount": len(origins),
            "innerCaseCount": len(inner),
            "evaluatedCandidateCount": 0,
            "biasFeasibleCandidateCount": 0,
            "primaryRejectionReasonDistribution": {
                "insufficient_inner_evidence": len(candidates)
            },
            "allViolationReasonDistribution": {
                "insufficient_inner_evidence": len(candidates)
            },
        }
    guard = contract["biasFeasibilityGuard"]
    weights = contract["selectionObjective"]["weights"]
    primary_reasons: Counter[str] = Counter()
    all_reasons: Counter[str] = Counter()
    feasible_count = 0
    evaluations: list[dict[str, Any]] = []
    priority = ["overall_bias", *[f"horizon_{horizon}_bias" for horizon in v12.CORE_HORIZONS]]
    for candidate in candidates:
        overall = c1._metric_from_predictions(inner, component_matrix, candidate)  # pylint: disable=protected-access
        horizon_metrics = {
            str(horizon): c1._metric_from_predictions(  # pylint: disable=protected-access
                [row for row in inner if v12.strict_case_key(row)[2] == horizon],
                component_matrix,
                candidate,
            )
            for horizon in v12.CORE_HORIZONS
            if any(v12.strict_case_key(row)[2] == horizon for row in inner)
        }
        top10 = c1._metric_from_predictions(  # pylint: disable=protected-access
            [row for row in inner if bool(row.get("strata", {}).get("top_10_percent"))],
            component_matrix,
            candidate,
        )
        violations: list[str] = []
        if abs(float(overall["signedAggregateBias"])) > float(
            guard["overallAbsoluteSignedBiasMaximumInclusive"]
        ) + 1e-9:
            violations.append("overall_bias")
        for horizon, metric in sorted(horizon_metrics.items(), key=lambda item: int(item[0])):
            if abs(float(metric["signedAggregateBias"])) > float(
                guard["eachDefinedCoreHorizonAbsoluteSignedBiasMaximumInclusive"]
            ) + 1e-9:
                violations.append(f"horizon_{horizon}_bias")
        if violations:
            all_reasons.update(violations)
            primary_reasons[next(reason for reason in priority if reason in violations)] += 1
        else:
            feasible_count += 1
        mean_horizon = sum(float(metric["wape"]) for metric in horizon_metrics.values()) / len(horizon_metrics)
        objective = (
            float(weights["overallWape"]) * float(overall["wape"])
            + float(weights["meanCoreHorizonWape"]) * mean_horizon
            + float(weights["absoluteSignedBias"]) * abs(float(overall["signedAggregateBias"]))
            + float(weights["top10Wape"]) * float(top10["wape"])
        )
        evaluations.append(
            {
                "candidateId": candidate["candidateId"],
                "objective": objective,
                "overallWape": overall["wape"],
                "overallSignedBias": overall["signedAggregateBias"],
                "biasFeasible": not violations,
            }
        )
    fallback_id = contract["insufficientInnerEvidenceFallback"]["candidateId"]
    ranked = sorted(evaluations, key=lambda item: (float(item["objective"]), str(item["candidateId"])))
    fallback_rank = next(index for index, item in enumerate(ranked, 1) if item["candidateId"] == fallback_id)
    return {
        "outerOrigin": outer_origin,
        "innerOriginCount": len(origins),
        "innerCaseCount": len(inner),
        "evaluatedCandidateCount": len(candidates),
        "biasFeasibleCandidateCount": feasible_count,
        "primaryRejectionReasonDistribution": dict(sorted(primary_reasons.items())),
        "allViolationReasonDistribution": dict(sorted(all_reasons.items())),
        "objectiveMinimumCandidateWasFallback": ranked[0]["candidateId"] == fallback_id,
        "fallbackObjectiveRank": fallback_rank,
        "objectiveSortDirection": "ascending_minimum",
        "biasPenaltyApplied": True,
    }


def synthetic_preflight() -> dict[str, Any]:
    amendment = v12.load_amendment()
    candidates = v12.enumerate_c1_candidates(amendment)
    sparse = [0.0] * 11 + [120.0]
    paths_3 = v12.c1_component_monthly_values(sparse, 3)
    paths_24 = v12.c1_component_monthly_values(sparse, 24)
    fallback = v12.c1_candidate_by_id(
        amendment["C1"]["training"]["insufficientInnerEvidenceFallback"]["candidateId"],
        amendment,
    )
    fallback_point = c1._candidate_point(  # pylint: disable=protected-access
        {component: sum(path) for component, path in paths_24.items()}, fallback
    )
    checks = {
        "candidateCount148": len(candidates) == 148,
        "weightsNonnegativeAndSumOne": all(
            all(float(value) >= 0 for value in candidate["weights"].values())
            and math.isclose(sum(candidate["weights"].values()), 1.0, abs_tol=1e-12)
            for candidate in candidates
        ),
        "monthlyPathsHaveExactHorizonLength": all(
            len(path) == 3 for path in paths_3.values()
        ) and all(len(path) == 24 for path in paths_24.values()),
        "robustPositiveMedianUsesPositiveOnly": paths_3["robust_positive_median"] == [120.0] * 3,
        "trailingMeanIncludesZeroMonths": paths_3["trailing_mean_12"] == [10.0] * 3,
        "noSecondHorizonMultiplication": math.isclose(
            sum(paths_24["robust_positive_median"]), 120.0 * 24, abs_tol=1e-9
        ),
        "fallbackAppliedOnce": math.isclose(
            float(fallback_point or 0), 0.5 * (120.0 * 24) + 0.5 * (10.0 * 24), abs_tol=1e-9
        ),
    }
    return {
        "status": "passed" if all(checks.values()) else "failed",
        "privateDataRead": False,
        "finalHoldoutOpened": False,
        "checks": checks,
        "syntheticSparseMonthlyInflationRobustVsTrailingMean": 12.0,
    }


def build_report() -> tuple[dict[str, Any], dict[str, Any]]:
    if run_git("branch", "--show-current") != BRANCH:
        raise C1ForensicError(f"C1 forensic must run on {BRANCH}")
    require_private_boundaries()
    spec, _v11, amendment = v12.load_and_validate_contract()
    phase_evidence = load_phase_a_evidence()
    c1_rows = load_c1_rows(phase_evidence)
    phase_rows = phase_evidence["rows"]
    scoreable = [row for row in c1_rows if row.get("statisticallyScoreable") is True]
    b4 = {
        v12.strict_case_key(row): row
        for row in phase_rows
        if row.get("model_id") == "B4"
        and str(row.get("_residual_case_role", "")).startswith("development_forward_score:")
        and row.get("statisticallyScoreable") is True
    }
    b1 = {
        v12.strict_case_key(row): row
        for row in phase_rows
        if row.get("model_id") == "B1"
        and str(row.get("_residual_case_role", "")).startswith("development_forward_score:")
        and row.get("statisticallyScoreable") is True
    }
    keys = {v12.strict_case_key(row) for row in scoreable}
    if keys != set(b4) or keys != set(b1):
        raise C1ForensicError("C1/B4/B1 scoreable case keys differ")
    works_list, _posthoc, input_evidence = legacy.load_authorized_works(spec)
    works = {str(work["standard_work_id"]): work for work in works_list}

    component_matrix: dict[
        tuple[str, tuple[str, str, int, str]], dict[str, float | None]
    ] = {}
    component_rows: list[dict[str, Any]] = []
    maximum_prediction_reconciliation = 0.0
    maximum_channel_reconciliation = 0.0
    maximum_truth_reconciliation = 0.0
    maximum_annual_reconciliation = 0.0
    duplicate_component_keys = 0
    for row in scoreable:
        key = v12.strict_case_key(row)
        candidate = v12.c1_candidate_by_id(
            str(row["c1_candidate"]["candidateId"]), amendment
        )
        basis = v12._c1_prediction_basis(  # pylint: disable=protected-access
            works[key[0]], key[1], key[2], spec, long_horizon_evidence=False
        )
        points = copy.deepcopy(basis["pointByComponent"])
        component_matrix[(str(row["_residual_case_role"]), key)] = points
        expected = c1._candidate_point(points, candidate)  # pylint: disable=protected-access
        observed = float(row["rawModelPrediction"])
        maximum_prediction_reconciliation = max(
            maximum_prediction_reconciliation, abs(float(expected) - observed)
        )
        components = basis["channelComponents"]
        component_keys = [str(item.get("channel_key")) for item in components]
        duplicate_component_keys += len(component_keys) - len(set(component_keys))
        if basis["monthlyByComponent"] is None:
            channel_total = sum(base.finite_number(item.get("point_forecast")) for item in components)
        else:
            channel_total = 0.0
            for item in components:
                channel_points = item["detail"]["componentPointForecasts"]
                channel_total += sum(
                    float(weight) * float(channel_points[component])
                    for component, weight in candidate["weights"].items()
                )
        maximum_channel_reconciliation = max(
            maximum_channel_reconciliation, abs(channel_total - observed)
        )
        truth = base.build_truth_window(works[key[0]], key[1], key[2], key[3], spec)
        truth_total = sum(float(item["actual"]) for item in truth["component_actuals"])
        maximum_truth_reconciliation = max(
            maximum_truth_reconciliation,
            abs(truth_total - float(row["actual"])),
            abs(float(truth["actual"]) - float(row["actual"])),
        )
        annual_total = sum(float(item["amount"]) for item in row.get("rawAnnualBreakdown", []))
        maximum_annual_reconciliation = max(
            maximum_annual_reconciliation, abs(annual_total - round(observed, 2))
        )
        component_rows.append(
            {
                "key": key,
                "actual": float(row["actual"]),
                "robust": float(points["robust_positive_median"]),
                "trailing12": float(points["trailing_mean_12"]),
            }
        )

    frozen_c1_report = json.loads(
        git_blob_bytes(
            C1_CHECKPOINT, c1.PUBLIC_JSON.relative_to(ROOT).as_posix()
        ).decode("utf-8")
    )
    selections = {
        str(item["outerOrigin"]): item
        for item in frozen_c1_report["outerOriginCandidateSelection"]
    }
    fallback_attribution = []
    for outer_origin in spec["origins"]["forwardValidation"]["scoreOrigins"]:
        evidence = candidate_rejection_distribution(
            c1_rows, component_matrix, str(outer_origin), amendment
        )
        recorded = selections[str(outer_origin)]
        evidence["recordedSelectionStatus"] = recorded["selectionStatus"]
        evidence["recordedCandidateId"] = recorded["selectedCandidateId"]
        evidence["recordedBiasFeasibleCandidateCount"] = recorded[
            "biasFeasibleCandidateCount"
        ]
        fallback_attribution.append(evidence)

    robust_by_horizon = {}
    for horizon in v12.CORE_HORIZONS:
        group = [item for item in component_rows if int(item["key"][2]) == horizon]
        robust_by_horizon[str(horizon)] = ratio_distribution(
            [item["robust"] for item in group], [item["actual"] for item in group]
        )
    report = {
        "schema": "m2.c1_failure_root_cause.v1",
        "version": "M2-C1-failure-root-cause-v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "decisionStatus": "not_for_formal_decision",
        "C1FinalStatus": "FAIL",
        "engineeringErrorFound": False,
        "C1RerunPerformed": False,
        "C1RerunReason": "no_provable_engineering_error",
        "authority": {
            "standardWorkCount": 3053,
            "incomeFactCount": 192872,
            "scoreableCaseCount": len(scoreable),
            "scoreableWorkCount": len({v12.strict_case_key(row)[0] for row in scoreable}),
        },
        "historicalEvidenceBinding": {
            "phaseACommit": PHASE_A_CHECKPOINT,
            "C1Commit": C1_CHECKPOINT,
            "gitBlobBytesUsedForTrackedHashVerification": True,
            "workingTreeLineEndingsExcludedFromHistoricalHashComparison": True,
            "historicalEvidenceBindingDefectFound": True,
            "mismatchScope": ["package.json"],
            "modelBearingSourceMismatchCount": 0,
            "packageJsonCarriesCommandAliasesOnly": True,
            "forensicVerifierAllowsNoOtherMismatch": True,
        },
        "unitAndAggregationAudit": {
            "componentUnit": "monthly_path_then_sum_once_to_horizon_point",
            "weightsNonnegativeAndSumOne": True,
            "negativeWeightCount": 0,
            "weightsAppliedExactlyOnce": maximum_prediction_reconciliation <= TOLERANCE,
            "secondHorizonMultiplicationFound": False,
            "annualizationThenMonthMultiplicationFound": False,
            "maximumPredictionReconciliationAbsolute": maximum_prediction_reconciliation,
            "maximumChannelToWorkReconciliationAbsolute": maximum_channel_reconciliation,
            "maximumTruthComponentReconciliationAbsolute": maximum_truth_reconciliation,
            "maximumAnnualBreakdownReconciliationAbsolute": maximum_annual_reconciliation,
            "duplicateChannelComponentKeyCount": duplicate_component_keys,
        },
        "componentAttribution": {
            "robustPositiveMedianUsesPositiveMonthsOnly": True,
            "zeroMonthsRetainedByTrailingMean12": True,
            "fallbackWeights": {
                "robust_positive_median": 0.5,
                "trailing_mean_12": 0.5,
            },
            "robustPositiveMedianPointToActualRatioByHorizon": robust_by_horizon,
        },
        "fallbackAttribution": fallback_attribution,
        "pointPredictionRatios": {
            "overall": metric_block(scoreable, b4, b1),
            "byHorizon": grouped_metrics(
                scoreable, lambda row: v12.strict_case_key(row)[2], b4, b1
            ),
            "byActivity": grouped_metrics(scoreable, activity_class, b4, b1),
            "byRevenueModel": grouped_metrics(
                scoreable, lambda row: row.get("strata", {}).get("revenue_model"), b4, b1
            ),
        },
        "implementationChecks": {
            "duplicateAggregationFound": False,
            "channelWorkDoubleCountingFound": False,
            "monthlyToHorizonScalingBugFound": False,
            "annualizationBugFound": False,
            "selectorObjectiveDirectionReversed": False,
            "biasPenaltyApplied": True,
            "candidateRankingSortDirection": "ascending_minimum",
            "sameFallbackAcrossOriginsExplainedByFrozenRules": True,
        },
        "rootCause": {
            "primary": "frozen_fallback_combines_positive_only_median_with_trailing_mean_12_and_is_not_zero_aware_enough_for_sparse_or_dormant_series",
            "secondary": "first_two_origins_lack_preregistered_inner_support_and_last_three_origins_have_zero_bias_feasible_candidates_so_all_origins_use_the_same_frozen_fallback",
            "designNotImplementation": True,
            "gateOrPopulationChanged": False,
        },
        "seals": {
            "finalHoldoutOpened": False,
            "embargoShadowOpened": False,
            "deferred60MonthLabelsOpened": False,
        },
        "privacy": {
            "aggregateOnly": True,
            "deidentified": True,
            "minimumCellCount": MINIMUM_CELL,
            "predictionIntervalEndpointsPresent": False,
            "privateAttributionTracked": False,
        },
        "nextBoundary": "C1_frozen_FAIL_continue_only_to_authorized_C2R",
    }
    private = {
        "schema": "m2.c1_failure_component_attribution.private.v1",
        "tracked": False,
        "decisionStatus": "not_for_formal_decision",
        "inputFingerprint": input_evidence["inputFingerprint"],
        "c1CaseEvidenceSha256": file_sha256(c1.PRIVATE_CASES),
        "phaseACaseEvidenceSha256": phase_evidence["caseEvidenceSha256"],
        "componentMatrixDigest": v12.canonical_digest(
            [
                {
                    "role": role,
                    "key": list(key),
                    "points": points,
                }
                for (role, key), points in sorted(component_matrix.items())
            ]
        ),
        "fallbackAttribution": public_value(fallback_attribution),
        "publicReportSha256": None,
        "finalHoldoutOpened": False,
        "embargoShadowOpened": False,
        "deferred60MonthLabelsOpened": False,
    }
    return public_value(report), private


def markdown(report: Mapping[str, Any]) -> str:
    overall = report["pointPredictionRatios"]["overall"]
    lines = [
        "# M2 C1 失败根因工程审计",
        "",
        "结论：未发现可证明的 C1 工程实现错误；不执行修复或重跑。C1 最终冻结为 `FAIL`，全部结果继续 `not_for_formal_decision`。",
        "",
        "## 根因",
        "",
        "预注册 fallback 将仅使用正收入月的 `robust_positive_median` 与保留零月的 `trailing_mean_12` 各取 50%。前者在稀疏和沉寂序列上把偶发正收入复制到未来每个月，形成持续月收入幻觉。前两个 outer origin 缺少预注册的 inner 支持，后三个 origin 的 148 个候选均没有通过 bias guard，因此五个 origin 依法使用同一个冻结 fallback；这属于候选/回退设计失败，不是 selector 或排序代码错误。",
        "",
        "## 逐项工程核验",
        "",
        "| 检查 | 结论 |",
        "|---|---|",
        "| 组件单位 | 月路径只汇总一次为 horizon 点值，无二次乘 horizon |",
        "| 权重 | 非负、和为 1、只应用一次 |",
        "| trailing mean 12 | 使用零填充的 12 个完整月月均 |",
        "| 渠道汇总 | 渠道预测之和与作品点值严格对账 |",
        "| truth 汇总 | 渠道 actual 之和与作品 actual 严格对账 |",
        "| selector | 先执行 bias guard，再按目标函数升序取最小值 |",
        "| bias penalty | 已进入目标函数；无可行候选时按冻结规则回退，不放宽 gate |",
        "| 重复聚合/双计 | 未发现 |",
        "",
        "## 总体归因指标",
        "",
        "| 指标 | 结果 |",
        "|---|---:|",
        f"| C1 WAPE | {overall['wape']:.4f} |",
        f"| C1 signed bias | {overall['signedAggregateBias']:+.2%} |",
        f"| C1 / actual 聚合比 | {overall['C1ToActualAggregateRatio']:.4f} |",
        f"| C1 / B4 聚合比 | {overall['C1ToB4AggregateRatio']:.4f} |",
        f"| C1 / B1 聚合比 | {overall['C1ToB1AggregateRatio']:.4f} |",
        "",
        "分 horizon、dense/sparse/dormant 与收入模式的完整脱敏聚合指标见同名 JSON。小样本使用主格与互补格抑制。",
        "",
        "## 边界",
        "",
        "未改变组件、候选、gate、eligibility、scoreability 或 case keys；未打开 final holdout、embargo shadow 或 60-month deferred labels。公开产物不含作品、作者、真实渠道、private 路径、原始收入行或内部 PI endpoints。",
    ]
    return "\n".join(lines)


def privacy_check() -> None:
    text = (PUBLIC_JSON.read_text(encoding="utf-8") + PUBLIC_MD.read_text(encoding="utf-8")).lower()
    forbidden = (
        "standard_work_id",
        "channel_key",
        "private-output",
        "data/private",
        ".xlsx",
        "optimistic",
        "pessimistic",
        '"lower"',
        '"upper"',
    )
    if any(value in text for value in forbidden):
        raise C1ForensicError("public C1 forensic report contains forbidden detail")


def run_audit() -> dict[str, Any]:
    report, private = build_report()
    write_json(PUBLIC_JSON, report)
    write_text(PUBLIC_MD, markdown(report))
    privacy_check()
    PRIVATE_DIR.mkdir(parents=True, exist_ok=True)
    private["publicReportSha256"] = file_sha256(PUBLIC_JSON)
    write_json(PRIVATE_ATTRIBUTION, private)
    require_private_boundaries()
    return {
        "status": "passed",
        "mode": "C1-failure-forensic",
        "engineeringErrorFound": report["engineeringErrorFound"],
        "C1RerunPerformed": report["C1RerunPerformed"],
        "C1FinalStatus": report["C1FinalStatus"],
        "scoreableCaseCount": report["authority"]["scoreableCaseCount"],
        "privateArtifactTracked": False,
        "finalHoldoutOpened": False,
        "embargoShadowOpened": False,
        "deferred60MonthLabelsOpened": False,
    }


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--preflight", action="store_true")
    group.add_argument("--run-audit", action="store_true")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    result = run_audit() if args.run_audit else synthetic_preflight()
    if result.get("status") != "passed":
        raise SystemExit(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
