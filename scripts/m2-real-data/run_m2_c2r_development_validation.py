#!/usr/bin/env python3
"""Run the sealed-development C2-R replay and publish deidentified evidence."""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import re
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Sequence

from openpyxl import Workbook

import m2_calibration_c2r_v1 as c2r
import m2_calibration_v1 as base
import m2_calibration_v1_2 as v12
import run_m2_c1_development_validation as c1
import run_m2_c1_failure_forensic as forensic
import run_m2_calibration_baseline_replay as legacy
import run_m2_calibration_v1_2 as phase


ROOT = Path(__file__).resolve().parents[2]
PUBLIC_DIR = ROOT / "docs" / "analysis" / "m2-real-data"
PRIVATE_DIR = ROOT / "data" / "private-output" / "m2-calibration-c2r-v1"
PUBLIC_JSON = PUBLIC_DIR / "M2-C2R-development-validation-v1.json"
PUBLIC_MD = PUBLIC_DIR / "M2-C2R-development-validation-v1.md"
ROUTING_JSON = PUBLIC_DIR / "M2-C2R-revenue-model-routing-manifest-v1.json"
ROUTING_MD = PUBLIC_DIR / "M2-C2R-revenue-model-routing-manifest-v1.md"
CHANNEL_JSON = PUBLIC_DIR / "M2-C2R-channel-reconciliation-v1.json"
CHANNEL_MD = PUBLIC_DIR / "M2-C2R-channel-reconciliation-v1.md"
ROUTE_JSON = PUBLIC_DIR / "M2-C2R-route-specific-metrics-v1.json"
ROUTE_MD = PUBLIC_DIR / "M2-C2R-route-specific-metrics-v1.md"
PRIVATE_CASES = PRIVATE_DIR / "M2-C2R-development-cases-private-v1.ndjson"
PRIVATE_MANIFEST = PRIVATE_DIR / "M2-C2R-development-manifest-private-v1.json"
PRIVATE_WORKBOOK = PRIVATE_DIR / "M2-C2R-development-validation-private-v1.xlsx"
BRANCH = "codex/m2-calibration-v1"
DESIGN_CHECKPOINT = "b495fa1c63f3d45b94eadf063577819ee0f47430"
MINIMUM_CELL = 10
TOLERANCE = 1e-12


class C2RValidationError(RuntimeError):
    """C2-R replay or evidence failed a frozen contract."""


def progress(message: str) -> None:
    print(f"[C2-R] {message}", file=sys.stderr, flush=True)


def run_git(*args: str) -> str:
    process = subprocess.run(
        ["git", *args], cwd=ROOT, capture_output=True, text=True, check=False
    )
    if process.returncode != 0:
        raise C2RValidationError(process.stderr.strip() or "git command failed")
    return process.stdout.strip()


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_json(path: Path, value: Mapping[str, Any]) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True, allow_nan=False)
        + "\n",
        encoding="utf-8",
        newline="\n",
    )


def write_text(path: Path, value: str) -> None:
    path.write_text(value.rstrip() + "\n", encoding="utf-8", newline="\n")


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
            if key not in {"actualTotal", "predictedTotal", "lower", "upper"}
        }
    if isinstance(value, list):
        return [public_value(child) for child in value]
    if isinstance(value, float):
        return rounded(value)
    return value


def require_boundaries() -> None:
    if run_git("branch", "--show-current") != BRANCH:
        raise C2RValidationError(f"C2-R must run on {BRANCH}")
    ancestor = subprocess.run(
        ["git", "merge-base", "--is-ancestor", DESIGN_CHECKPOINT, "HEAD"],
        cwd=ROOT,
        check=False,
    )
    if ancestor.returncode != 0:
        raise C2RValidationError("C2-R design checkpoint is not an ancestor of HEAD")
    design_paths = (
        c2r.SPEC_PATH,
        PUBLIC_DIR / "M2-C2R-revenue-channel-design-v1.json",
        PUBLIC_DIR / "M2-C2R-revenue-channel-design-v1.md",
    )
    for path in design_paths:
        relative = path.relative_to(ROOT).as_posix()
        if run_git("diff", "--name-only", DESIGN_CHECKPOINT, "--", relative):
            raise C2RValidationError(f"frozen C2-R design changed after checkpoint: {relative}")
    for path in (PRIVATE_CASES, PRIVATE_MANIFEST, PRIVATE_WORKBOOK):
        if not phase.git_ignored(path):
            raise C2RValidationError(f"private C2-R role is not ignored: {path.name}")
        if run_git("ls-files", "--", str(path)):
            raise C2RValidationError(f"private C2-R artifact is tracked: {path.name}")
    if phase.tracked_private_artifacts():
        raise C2RValidationError("a private calibration artifact is tracked")


def synthetic_preflight() -> dict[str, Any]:
    calibration_spec = base.load_spec()
    contract = c2r.load_spec()
    fallback = c2r.candidate_by_id("single:B4_channel_point", contract)
    selected = {route: fallback for route in ("pure_sales_share", "buyout_plus_sales")}
    works = phase._synthetic_route_works()  # pylint: disable=protected-access
    routes = []
    reconciliation = []
    mixed_excludes = False
    buyout_no_renewal = False
    for work in works:
        prediction = c2r.predict_as_of(
            work,
            "2021-06",
            12,
            calibration_spec,
            contract,
            selected_candidate_by_route=selected,
            b4_fold_spec=calibration_spec,
        )
        routes.append(prediction["route"])
        reconciliation.append(
            math.isclose(
                float(prediction["point_forecast"]),
                sum(float(item["point_forecast"]) for item in prediction["channel_components"]),
                abs_tol=1e-6,
            )
            if prediction["route"] != "unknown_revenue_model"
            else prediction["point_forecast"] == 0
        )
        if prediction["route"] == "buyout_plus_sales":
            mixed_excludes = (
                prediction["excludesFutureBuyout"] is True
                and prediction["futureBuyoutPredicted"] is False
                and "excludes_future_buyout" in prediction["limitation"]
            )
        if prediction["route"] == "pure_buyout":
            buyout_no_renewal = prediction["futureBuyoutPredicted"] is False
    sparse = [0.0] * 11 + [120.0]
    paths = c2r.sales_component_monthly_paths(
        base.month_range("2020-07", "2021-06"),
        sparse,
        "2021-06",
        3,
        calibration_spec,
        calibration_spec,
    )
    exact_lag12_paths = c2r.sales_component_monthly_paths(
        base.month_range("2020-07", "2021-06"),
        [float(value) for value in range(1, 13)],
        "2021-06",
        3,
        calibration_spec,
        calibration_spec,
    )
    future_invariant = True
    future_route_horizon_checks = 0
    for before, after in zip(
        works,
        [phase._future_perturbed_work(work) for work in works],  # pylint: disable=protected-access
    ):
        for horizon in v12.CORE_HORIZONS:
            first = c2r.predict_as_of(
                before,
                "2021-06",
                horizon,
                calibration_spec,
                contract,
                selected_candidate_by_route=selected,
                b4_fold_spec=calibration_spec,
            )
            second = c2r.predict_as_of(
                after,
                "2021-06",
                horizon,
                calibration_spec,
                contract,
                selected_candidate_by_route=selected,
                b4_fold_spec=calibration_spec,
            )
            future_invariant = future_invariant and c2r.canonical_digest(
                first
            ) == c2r.canonical_digest(second)
            future_route_horizon_checks += 1
    all_candidate_checks = 0
    for candidate in c2r.enumerate_candidates(contract):
        candidate_selection = {
            "pure_sales_share": candidate,
            "buyout_plus_sales": candidate,
        }
        for index in (0, 2):
            before, after = works[index], phase._future_perturbed_work(works[index])  # pylint: disable=protected-access
            first = c2r.predict_as_of(
                before,
                "2021-06",
                12,
                calibration_spec,
                contract,
                selected_candidate_by_route=candidate_selection,
                b4_fold_spec=calibration_spec,
            )
            second = c2r.predict_as_of(
                after,
                "2021-06",
                12,
                calibration_spec,
                contract,
                selected_candidate_by_route=candidate_selection,
                b4_fold_spec=calibration_spec,
            )
            future_invariant = future_invariant and c2r.canonical_digest(
                first
            ) == c2r.canonical_digest(second)
            all_candidate_checks += 1
    short_work = {
        "standard_work_id": "SYNTH-C2R-SHORT",
        "channels": [
            {
                "channel_key": "short-sales",
                "business_form": "audio_product",
                "first_observed_month": "2021-04",
                "monthly": {"2021-04": 10.0, "2021-05": 30.0, "2021-06": 20.0},
                "batch_cluster_sizes": {},
            }
        ],
    }
    short_points = c2r.candidate_point_predictions(
        short_work,
        "2021-06",
        12,
        calibration_spec,
        contract,
        calibration_spec,
    )
    non_b4 = c2r.candidate_by_id("single:recency_weighted_mean_12", contract)
    short_prediction = c2r.predict_as_of(
        short_work,
        "2021-06",
        12,
        calibration_spec,
        contract,
        selected_candidate_by_route={
            "pure_sales_share": non_b4,
            "buyout_plus_sales": non_b4,
        },
        b4_fold_spec=calibration_spec,
    )
    eight_month_values = [10.0, 0.0, 15.0, 0.0, 20.0, 0.0, 25.0, 0.0]
    eight_months = base.month_range("2020-11", "2021-06")
    eight_month_paths = c2r.sales_component_monthly_paths(
        eight_months,
        eight_month_values,
        "2021-06",
        12,
        calibration_spec,
        calibration_spec,
    )
    blocked_work = {
        "standard_work_id": "SYNTH-C2R-BLOCKED",
        "channels": [
            {
                "channel_key": "blocked-sales",
                "business_form": "audio_product",
                "first_observed_month": "2020-11",
                "monthly": dict(zip(eight_months, eight_month_values)),
                "batch_cluster_sizes": {},
            }
        ],
    }
    blocked_prediction = c2r.predict_as_of(
        blocked_work,
        "2021-06",
        12,
        calibration_spec,
        contract,
        selected_candidate_by_route={
            "pure_sales_share": non_b4,
            "buyout_plus_sales": non_b4,
        },
        b4_fold_spec=calibration_spec,
    )
    rights_work = copy.deepcopy(works[1])
    rights_work["rights_snapshots"] = [
        {
            "available_as_of": "2021-06",
            "rights_term_type": "exact_date",
            "rights_end_month": "2021-08",
        }
    ]
    rights_prediction = c2r.predict_as_of(
        rights_work,
        "2021-06",
        12,
        calibration_spec,
        contract,
        selected_candidate_by_route=selected,
        b4_fold_spec=calibration_spec,
    )
    unknown_prediction = c2r.predict_as_of(
        works[3],
        "2021-06",
        12,
        calibration_spec,
        contract,
        selected_candidate_by_route=selected,
        b4_fold_spec=calibration_spec,
    )
    checks = {
        "candidateCount38": len(c2r.enumerate_candidates(contract)) == 38,
        "allFourRoutesCovered": set(routes) == set(c2r.ROUTES),
        "zeroAwareMedianIncludesZeroMonths": all(
            value == 0 for value in paths["zero_aware_median_12"].values()
        ),
        "channelAggregationReconciles": all(reconciliation),
        "mixedExcludesFutureBuyout": mixed_excludes,
        "pureBuyoutDoesNotAssumeRenewal": buyout_no_renewal,
        "futurePerturbationInvariant": future_invariant,
        "allCandidatesFuturePerturbationCovered": all_candidate_checks
        == len(c2r.enumerate_candidates(contract)) * 2,
        "allRouteHorizonFuturePerturbationCovered": future_route_horizon_checks == 20,
        "insufficientChannelHistoryUsesFrozenB4": len(set(short_points.values())) == 1,
        "shortHistorySelectedCandidateReconcilesWithEffectiveB4": math.isclose(
            float(short_prediction["point_forecast"]),
            sum(
                float(item["point_forecast"])
                for item in short_prediction["channel_components"]
            ),
            abs_tol=1e-6,
        )
        and math.isclose(
            float(short_prediction["point_forecast"]),
            float(short_points["single:B4_channel_point"]),
            abs_tol=1e-6,
        )
        and all(
            item["detail"]["effectiveCandidateId"] == "single:B4_channel_point"
            for item in short_prediction["channel_components"]
        ),
        "seasonalNaive12UsesB4WhenTrueLag12Unavailable": eight_month_paths[
            "seasonal_naive_12"
        ]
        == eight_month_paths["B4_channel_point"],
        "seasonalNaive12UsesExactLag12WhenAvailable": list(
            exact_lag12_paths["seasonal_naive_12"].values()
        )
        == [1.0, 2.0, 3.0],
        "blockedServingIsNullUnavailableAndExplained": blocked_prediction[
            "public_output"
        ]["pointForecast"]
        is None
        and blocked_prediction["public_output"]["annualBreakdown"] == []
        and blocked_prediction["public_output"]["confidence"] == "unavailable"
        and "blocked_insufficient_history"
        in blocked_prediction["public_output"]["limitation"],
        "asOfRightsSnapshotCapsBuyout": all(
            item["detail"]["remainingRightsPeriod"] == 2
            for item in rights_prediction["channel_components"]
        )
        and "rights_horizon_cap_applied" in rights_prediction["limitation"],
        "unknownProductPointIsNull": unknown_prediction["public_output"][
            "pointForecast"
        ]
        is None,
        "publicFieldsExact": all(
            set(prediction["public_output"])
            == {"pointForecast", "annualBreakdown", "confidence", "limitation"}
            for prediction in (
                short_prediction,
                blocked_prediction,
                rights_prediction,
                unknown_prediction,
            )
        ),
        "allSealsClosed": all(
            contract["seals"][field] is False
            for field in (
                "finalHoldoutOpened",
                "embargoShadowOpened",
                "deferred60MonthLabelsOpened",
            )
        ),
    }
    return {
        "status": "passed" if all(checks.values()) else "failed",
        "privateDataRead": False,
        "checks": checks,
    }


def _templates(
    phase_rows: Sequence[Mapping[str, Any]], role: str, model: str = "B4"
) -> dict[tuple[str, str, int, str], Mapping[str, Any]]:
    output = {
        v12.strict_case_key(row): row
        for row in phase_rows
        if row.get("model_id") == model and row.get("_residual_case_role") == role
    }
    if not output:
        raise C2RValidationError(f"Phase A lacks {model} templates for {role}")
    return output


def build_b4_fold_specs(
    phase_rows: Sequence[Mapping[str, Any]], calibration_spec: Mapping[str, Any]
) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    del phase_rows
    relative = (
        PUBLIC_DIR / "M2-baseline-comparator-identity-correction-v1.json"
    ).relative_to(ROOT).as_posix()
    frozen_report = json.loads(
        forensic.git_blob_bytes(forensic.PHASE_A_CHECKPOINT, relative).decode("utf-8")
    )
    fold_fits = frozen_report.get("integrity", {}).get(
        "allBaselineMaterialization", {}
    ).get("foldFits", {})
    expected_origins = c2r.load_spec()["caseAndStateContract"]["origins"]
    if set(fold_fits) != set(expected_origins):
        raise C2RValidationError("frozen Phase A B4 fold factors are incomplete")
    specs: dict[str, dict[str, Any]] = {}
    evidence: dict[str, Any] = {}
    for origin in expected_origins:
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
            raise C2RValidationError("frozen B4 fold factor reads future truth")
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
    return specs, evidence


def _metric(
    rows: Sequence[Mapping[str, Any]],
    matrix: Mapping[tuple[str, str, int, str], Mapping[str, float]],
    candidate_id: str,
) -> dict[str, float]:
    predictions = [float(matrix[v12.strict_case_key(row)][candidate_id]) for row in rows]
    actuals = [float(row["actual"]) for row in rows]
    denominator = sum(abs(value) for value in actuals)
    signed = sum(actuals)
    if not rows or denominator <= 0 or signed <= 0:
        raise C2RValidationError("C2-R inner metric has an invalid denominator")
    return {
        "wape": sum(abs(pred - actual) for pred, actual in zip(predictions, actuals))
        / denominator,
        "signedAggregateBias": (sum(predictions) - signed) / signed,
    }


def select_route_candidate(
    route: str,
    outer_origin: str,
    prior_rows: Sequence[Mapping[str, Any]],
    matrix: Mapping[tuple[str, str, int, str], Mapping[str, float]],
    contract: Mapping[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]]:
    fallback = c2r.candidate_by_id(
        str(contract["innerSelection"]["noBiasFeasibleCandidatePolicy"]), contract
    )
    candidates = c2r.enumerate_candidates(contract)
    inner = [
        row
        for row in prior_rows
        if row.get("statisticallyScoreable") is True
        and v12.strict_case_key(row)[3] == route
        and v12.strict_case_key(row)[1] < outer_origin
        and str(row.get("target_end")) <= outer_origin
        and str(row.get("label_available_as_of")) <= outer_origin
        and str(row.get("_bill_month_max")) <= outer_origin
        and str(row.get("_available_as_of")) <= outer_origin
    ]
    origins = sorted({v12.strict_case_key(row)[1] for row in inner})
    base_evidence = {
        "outerOrigin": outer_origin,
        "route": route,
        "candidateSpaceCount": len(candidates),
        "innerDistinctScoreOrigins": len(origins),
        "innerScoreableCaseCount": len(inner),
        "sameOrLaterOuterTruthRead": False,
    }
    rules = contract["innerSelection"]
    if len(origins) < int(rules["minimumDistinctEarlierOrigins"]) or len(inner) < int(
        rules["minimumEarlierScoreableCasesPerRoute"]
    ):
        return fallback, {
            **base_evidence,
            "selectionStatus": "frozen_fallback_insufficient_inner_evidence",
            "selectedCandidateId": fallback["candidateId"],
            "selectedWeights": copy.deepcopy(fallback["weights"]),
            "fallbackAppliedToRoute": True,
            "biasFeasibleCandidateCount": 0,
            "rejectionReasonDistribution": {"insufficient_inner_evidence": len(candidates)},
        }
    high = [row for row in inner if bool(row.get("strata", {}).get("top_10_percent"))]
    guard = rules["biasFeasibility"]
    evaluations = []
    reasons: Counter[str] = Counter()
    for candidate in candidates:
        candidate_id = str(candidate["candidateId"])
        overall = _metric(inner, matrix, candidate_id)
        horizons = {
            str(horizon): _metric(
                [row for row in inner if v12.strict_case_key(row)[2] == horizon],
                matrix,
                candidate_id,
            )
            for horizon in v12.CORE_HORIZONS
            if any(v12.strict_case_key(row)[2] == horizon for row in inner)
        }
        high_metric = _metric(high, matrix, candidate_id)
        violations = []
        if abs(overall["signedAggregateBias"]) > float(
            guard["overallAbsoluteSignedBiasMaximumInclusive"]
        ) + TOLERANCE:
            violations.append("overall_bias")
        if abs(high_metric["signedAggregateBias"]) > float(
            guard["highValueAbsoluteSignedBiasMaximumInclusive"]
        ) + TOLERANCE:
            violations.append("high_value_bias")
        if any(
            abs(metric["signedAggregateBias"])
            > float(
                guard["eachDefinedCoreHorizonAbsoluteSignedBiasMaximumInclusive"]
            )
            + TOLERANCE
            for metric in horizons.values()
        ):
            violations.append("horizon_bias")
        reasons.update(violations)
        evaluations.append(
            {
                "candidateId": candidate_id,
                "biasFeasible": not violations,
                "overallWape": overall["wape"],
                "meanHorizonWape": sum(item["wape"] for item in horizons.values())
                / len(horizons),
                "highValueWape": high_metric["wape"],
                "componentCount": candidate["componentCount"],
                "parameterCount": candidate["parameterCount"],
            }
        )
    feasible = [item for item in evaluations if item["biasFeasible"]]
    if not feasible:
        return fallback, {
            **base_evidence,
            "selectionStatus": "frozen_fallback_no_bias_feasible_candidate",
            "selectedCandidateId": fallback["candidateId"],
            "selectedWeights": copy.deepcopy(fallback["weights"]),
            "fallbackAppliedToRoute": True,
            "biasFeasibleCandidateCount": 0,
            "rejectionReasonDistribution": dict(sorted(reasons.items())),
            "candidateEvaluationDigest": c2r.canonical_digest(evaluations),
        }
    chosen = min(
        feasible,
        key=lambda item: (
            item["overallWape"],
            item["meanHorizonWape"],
            item["highValueWape"],
            item["componentCount"],
            item["parameterCount"],
            item["candidateId"],
        ),
    )
    return c2r.candidate_by_id(str(chosen["candidateId"]), contract), {
        **base_evidence,
        "selectionStatus": "bias_feasible_lexicographic_minimum",
        "selectedCandidateId": chosen["candidateId"],
        "selectedWeights": copy.deepcopy(
            c2r.candidate_by_id(str(chosen["candidateId"]), contract)["weights"]
        ),
        "fallbackAppliedToRoute": False,
        "biasFeasibleCandidateCount": len(feasible),
        "rejectionReasonDistribution": dict(sorted(reasons.items())),
        "candidateEvaluationDigest": c2r.canonical_digest(evaluations),
    }


def materialize_role(
    templates: Mapping[tuple[str, str, int, str], Mapping[str, Any]],
    works: Mapping[str, Mapping[str, Any]],
    calibration_spec: Mapping[str, Any],
    contract: Mapping[str, Any],
    role: str,
    selected: Mapping[str, Mapping[str, Any]],
    b4_spec: Mapping[str, Any],
) -> tuple[list[dict[str, Any]], dict[str, Any], dict[tuple[str, str, int, str], dict[str, float]]]:
    predictions = []
    matrix: dict[tuple[str, str, int, str], dict[str, float]] = {}
    for key, source in sorted(templates.items()):
        points = c2r.candidate_point_predictions(
            works[key[0]], key[1], key[2], calibration_spec, contract, b4_spec
        )
        if key[3] in {"pure_sales_share", "buyout_plus_sales"}:
            matrix[key] = points
        prediction = c2r.predict_as_of(
            works[key[0]],
            key[1],
            key[2],
            calibration_spec,
            contract,
            selected_candidate_by_route=selected,
            b4_fold_spec=b4_spec,
        )
        predictions.append(
            phase._decorate_v12_prediction(  # pylint: disable=protected-access
                prediction, source, role, c2r.MODEL_ID
            )
        )
    joined, lock = phase._lock_and_guarded_join_v12_block(  # pylint: disable=protected-access
        predictions, {"B4": templates}, works, role, calibration_spec
    )
    return joined, {
        **lock,
        "samePredictAsOfEntryUsed": True,
        "heldOutcomeFieldsReadByPredictor": False,
    }, matrix


def route_metrics(rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    groups = {
        route: [
            row
            for row in rows
            if row.get("statisticallyScoreable") is True
            and v12.strict_case_key(row)[3] == route
        ]
        for route in c2r.ROUTES
    }
    small = {
        route
        for route, group in groups.items()
        if len(group) < MINIMUM_CELL
        or len({v12.strict_case_key(row)[0] for row in group}) < MINIMUM_CELL
    }
    visible = [route for route in c2r.ROUTES if route not in small]
    complement = min(visible, key=lambda route: len(groups[route])) if small and visible else None
    output = {}
    for route, group in groups.items():
        if route in small or route == complement:
            output[route] = {
                "suppressed": True,
                "suppressionReason": (
                    "primary_small_cell" if route in small else "complementary_suppression"
                ),
            }
        else:
            output[route] = {
                "suppressed": False,
                **v12.metric_rows(group, "rawModelPrediction"),
            }
    return public_value(output)


def safe_origin_route_distribution(
    rows: Sequence[Mapping[str, Any]], origins: Sequence[str]
) -> dict[str, Any]:
    output: dict[str, Any] = {}
    for origin in origins:
        origin_rows = [row for row in rows if v12.strict_case_key(row)[1] == origin]
        groups = {
            route: [row for row in origin_rows if v12.strict_case_key(row)[3] == route]
            for route in c2r.ROUTES
        }
        primary_small = {
            route
            for route, group in groups.items()
            if len(group) < MINIMUM_CELL
            or len({v12.strict_case_key(row)[0] for row in group}) < MINIMUM_CELL
        }
        visible = [route for route in c2r.ROUTES if route not in primary_small]
        complement = (
            min(
                visible,
                key=lambda route: (
                    len({v12.strict_case_key(row)[0] for row in groups[route]}),
                    len(groups[route]),
                    route,
                ),
            )
            if primary_small and visible
            else None
        )
        output[origin] = {}
        for route, group in groups.items():
            if route in primary_small or route == complement:
                output[origin][route] = {
                    "suppressed": True,
                    "caseCount": None,
                    "uniqueWorkCount": None,
                    "suppressionReason": (
                        "primary_small_cell"
                        if route in primary_small
                        else "complementary_suppression"
                    ),
                }
            else:
                output[origin][route] = {
                    "suppressed": False,
                    "caseCount": len(group),
                    "uniqueWorkCount": len(
                        {v12.strict_case_key(row)[0] for row in group}
                    ),
                }
    return output


def safe_origin_route_metrics(
    rows: Sequence[Mapping[str, Any]], origins: Sequence[str]
) -> dict[str, Any]:
    output: dict[str, Any] = {}
    for origin in origins:
        groups = {
            route: [
                row
                for row in rows
                if row.get("statisticallyScoreable") is True
                and v12.strict_case_key(row)[1] == origin
                and v12.strict_case_key(row)[3] == route
            ]
            for route in c2r.ROUTES
        }
        primary_small = {
            route
            for route, group in groups.items()
            if len(group) < MINIMUM_CELL
            or len({v12.strict_case_key(row)[0] for row in group}) < MINIMUM_CELL
        }
        visible = [route for route in c2r.ROUTES if route not in primary_small]
        complement = (
            min(
                visible,
                key=lambda route: (
                    len({v12.strict_case_key(row)[0] for row in groups[route]}),
                    len(groups[route]),
                    route,
                ),
            )
            if primary_small and visible
            else None
        )
        output[origin] = {}
        for route, group in groups.items():
            if route in primary_small or route == complement:
                output[origin][route] = {
                    "suppressed": True,
                    "caseCount": None,
                    "uniqueWorkCount": None,
                    "wape": None,
                    "signedAggregateBias": None,
                    "suppressionReason": (
                        "primary_small_cell"
                        if route in primary_small
                        else "complementary_suppression"
                    ),
                }
            else:
                output[origin][route] = {
                    "suppressed": False,
                    **v12.metric_rows(group, "rawModelPrediction"),
                }
    return public_value(output)


def _safe_small_count(value: int) -> int | None:
    return int(value) if int(value) == 0 or int(value) >= MINIMUM_CELL else None


def channel_evidence(rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    predicted = []
    actual = []
    concentration = []
    maximum_reconciliation = 0.0
    maximum_known_truth_to_work_actual = 0.0
    component_case_count = 0
    scoreable_work_actual = 0.0
    matched_component_actual = 0.0
    predicted_without_truth = 0
    truth_without_prediction = 0
    by_origin: dict[str, dict[str, Any]] = defaultdict(
        lambda: {
            "predicted": [],
            "actual": [],
            "componentCount": 0,
            "shortHistoryFallbackCount": 0,
            "seasonalFallbackCount": 0,
            "maximumReconciliation": 0.0,
        }
    )
    route_pairs: dict[str, dict[str, Any]] = {
        route: {"predicted": [], "actual": [], "works": set()}
        for route in c2r.ROUTES
    }
    per_channel: dict[str, dict[str, float]] = defaultdict(
        lambda: {"predicted": 0.0, "actual": 0.0}
    )
    for row in rows:
        if row.get("statisticallyScoreable") is not True:
            continue
        key = v12.strict_case_key(row)
        origin = key[1]
        route = key[3]
        components = row.get("channel_components", [])
        component_total = sum(float(item.get("point_forecast", 0.0)) for item in components)
        reconciliation = abs(component_total - float(row["rawModelPrediction"]))
        maximum_reconciliation = max(maximum_reconciliation, reconciliation)
        by_origin[origin]["maximumReconciliation"] = max(
            float(by_origin[origin]["maximumReconciliation"]), reconciliation
        )
        by_origin[origin]["componentCount"] += len(components)
        by_origin[origin]["shortHistoryFallbackCount"] += sum(
            bool(item.get("detail", {}).get("insufficientHistoryFallbackApplied"))
            for item in components
        )
        by_origin[origin]["seasonalFallbackCount"] += sum(
            bool(item.get("detail", {}).get("seasonalNaive12FallbackApplied"))
            for item in components
        )
        if float(row["rawModelPrediction"]) > 0 and components:
            concentration.append(
                max(float(item.get("point_forecast", 0.0)) for item in components)
                / float(row["rawModelPrediction"])
            )
        truth = row.get("_component_actual_by_channel", {})
        scoreable_work_actual += float(row["actual"])
        known_truth_total = sum(float(value) for value in truth.values())
        maximum_known_truth_to_work_actual = max(
            maximum_known_truth_to_work_actual,
            abs(known_truth_total - float(row["actual"])),
        )
        predicted_keys = {str(item.get("channel_key", "")) for item in components}
        truth_without_prediction += len(set(map(str, truth)) - predicted_keys)
        for item in components:
            channel_key = str(item.get("channel_key", ""))
            if channel_key in truth:
                component_prediction = float(item.get("point_forecast", 0.0))
                component_actual = float(truth[channel_key])
                predicted.append(component_prediction)
                actual.append(component_actual)
                matched_component_actual += component_actual
                component_case_count += 1
                by_origin[origin]["predicted"].append(component_prediction)
                by_origin[origin]["actual"].append(component_actual)
                route_pairs[route]["predicted"].append(component_prediction)
                route_pairs[route]["actual"].append(component_actual)
                route_pairs[route]["works"].add(key[0])
                per_channel[channel_key]["predicted"] += component_prediction
                per_channel[channel_key]["actual"] += component_actual
            else:
                predicted_without_truth += 1

    origin_metrics = {}
    for origin, group in sorted(by_origin.items()):
        origin_metrics[origin] = {
            "suppressed": False,
            "matchedComponentCaseCount": _safe_small_count(len(group["predicted"])),
            "aggregateMatchedChannelWape": base.wape(
                group["predicted"], group["actual"]
            ),
            "aggregateMatchedChannelSignedBias": base.signed_aggregate_bias(
                group["predicted"], group["actual"]
            ),
            "maximumChannelSumToWorkAbsoluteDifference": group[
                "maximumReconciliation"
            ],
            "allWorkForecastsStrictlyReconciled": float(
                group["maximumReconciliation"]
            )
            <= 1e-6,
            "channelComponentCount": _safe_small_count(group["componentCount"]),
            "shortHistoryFallbackChannelComponentCount": _safe_small_count(
                group["shortHistoryFallbackCount"]
            ),
            "seasonalNaive12FallbackChannelComponentCount": _safe_small_count(
                group["seasonalFallbackCount"]
            ),
            "smallPositiveCountsSuppressed": any(
                0 < int(group[field]) < MINIMUM_CELL
                for field in (
                    "componentCount",
                    "shortHistoryFallbackCount",
                    "seasonalFallbackCount",
                )
            ),
        }
    small_origins = {
        origin
        for origin, group in by_origin.items()
        if len(group["predicted"]) < MINIMUM_CELL
    }
    visible_origins = [origin for origin in sorted(by_origin) if origin not in small_origins]
    complementary_origin = (
        min(
            visible_origins,
            key=lambda origin: (len(by_origin[origin]["predicted"]), origin),
        )
        if small_origins and visible_origins
        else None
    )
    for origin in sorted(by_origin):
        if origin not in small_origins and origin != complementary_origin:
            continue
        cell = origin_metrics[origin]
        cell.update(
            {
                "suppressed": True,
                "matchedComponentCaseCount": None,
                "aggregateMatchedChannelWape": None,
                "aggregateMatchedChannelSignedBias": None,
                "channelComponentCount": None,
                "shortHistoryFallbackChannelComponentCount": None,
                "seasonalNaive12FallbackChannelComponentCount": None,
                "suppressionReason": (
                    "primary_small_cell"
                    if origin in small_origins
                    else "complementary_suppression"
                ),
            }
        )

    route_small = {
        route
        for route, group in route_pairs.items()
        if len(group["predicted"]) < MINIMUM_CELL
        or len(group["works"]) < MINIMUM_CELL
    }
    route_visible = [route for route in c2r.ROUTES if route not in route_small]
    route_complement = (
        min(
            route_visible,
            key=lambda route: (
                len(route_pairs[route]["works"]),
                len(route_pairs[route]["predicted"]),
                route,
            ),
        )
        if route_small and route_visible
        else None
    )
    route_component_metrics = {}
    for route, group in route_pairs.items():
        if route in route_small or route == route_complement:
            route_component_metrics[route] = {
                "suppressed": True,
                "matchedComponentCaseCount": None,
                "aggregateMatchedChannelWape": None,
                "aggregateMatchedChannelSignedBias": None,
                "suppressionReason": (
                    "primary_small_cell"
                    if route in route_small
                    else "complementary_suppression"
                ),
            }
        else:
            route_component_metrics[route] = {
                "suppressed": False,
                "matchedComponentCaseCount": len(group["predicted"]),
                "aggregateMatchedChannelWape": base.wape(
                    group["predicted"], group["actual"]
                ),
                "aggregateMatchedChannelSignedBias": base.signed_aggregate_bias(
                    group["predicted"], group["actual"]
                ),
            }

    channel_biases = [
        (cell["predicted"] - cell["actual"]) / cell["actual"]
        for cell in per_channel.values()
        if cell["actual"] > 0
    ]
    channel_bias_distribution = (
        {
            "suppressed": False,
            "deidentifiedChannelCount": len(channel_biases),
            "p10": base.linear_quantile(channel_biases, 0.1),
            "p50": base.linear_quantile(channel_biases, 0.5),
            "p90": base.linear_quantile(channel_biases, 0.9),
        }
        if len(channel_biases) >= MINIMUM_CELL
        else {
            "suppressed": True,
            "deidentifiedChannelCount": None,
            "p10": None,
            "p50": None,
            "p90": None,
            "suppressionReason": "primary_small_cell",
        }
    )
    return {
        "schema": "m2.c2r_channel_reconciliation.v1",
        "decisionStatus": "not_for_formal_decision",
        "scoreableChannelComponentCaseCount": component_case_count,
        "maximumChannelSumToWorkAbsoluteDifference": maximum_reconciliation,
        "allWorkForecastsStrictlyReconciled": maximum_reconciliation <= 1e-6,
        "aggregateMatchedChannelWape": base.wape(predicted, actual),
        "aggregateMatchedChannelSignedBias": base.signed_aggregate_bias(predicted, actual),
        "matchedChannelActualRevenueShareOfScoreableWorkActual": (
            matched_component_actual / scoreable_work_actual
            if scoreable_work_actual > 0
            else None
        ),
        "predictedComponentWithoutMatchedTruthCount": _safe_small_count(
            predicted_without_truth
        ),
        "knownTruthWithoutPredictedComponentCount": _safe_small_count(
            truth_without_prediction
        ),
        "maximumKnownComponentActualToWorkActualDifference": (
            maximum_known_truth_to_work_actual
        ),
        "knownComponentTruthIsAReconciliationAuditNotACompletenessClaim": True,
        "perOriginChannelAudit": origin_metrics,
        "matchedComponentMetricsByRoute": route_component_metrics,
        "deidentifiedPerChannelSignedBiasDistribution": channel_bias_distribution,
        "channelConcentrationMeanLargestShare": (
            sum(concentration) / len(concentration) if concentration else None
        ),
        "trueChannelNamesPresent": False,
        "finalHoldoutOpened": False,
    }


def relative_improvement(candidate: Any, comparator: Any) -> float | None:
    if candidate is None or comparator is None:
        return None
    value = float(comparator)
    return (value - float(candidate)) / value if value != 0 else (0.0 if float(candidate) == 0 else None)


def apply_c2r_internal_intervals(
    target_rows: Sequence[dict[str, Any]],
    calibration_rows: Sequence[Mapping[str, Any]],
    contract: Mapping[str, Any],
) -> None:
    interval = contract["internalInterval"]
    nominal = float(interval["nominalCoverage"])
    minimum = int(interval["minimumCalibrationCount"])
    residual_rows = [
        row
        for row in calibration_rows
        if row.get("statisticallyScoreable") is True
        and row.get("rawModelPrediction") is not None
        and row.get("actual") is not None
    ]
    pools_by_origin: dict[str, dict[str, Any]] = {}
    for target_origin in sorted(
        {v12.strict_case_key(row)[1] for row in target_rows}
    ):
        prior = [
            source
            for source in residual_rows
            if v12.strict_case_key(source)[1] < target_origin
            and str(source.get("target_end")) <= target_origin
            and str(source.get("label_available_as_of")) <= target_origin
            and str(source.get("_bill_month_max")) <= target_origin
            and str(source.get("_available_as_of")) <= target_origin
        ]
        pools_by_origin[target_origin] = {
            "global": [
                abs(float(source["rawModelPrediction"]) - float(source["actual"]))
                for source in prior
            ],
            "routeHorizon": {
                (route, horizon): [
                    abs(
                        float(source["rawModelPrediction"])
                        - float(source["actual"])
                    )
                    for source in prior
                    if v12.strict_case_key(source)[2] == horizon
                    and v12.strict_case_key(source)[3] == route
                ]
                for route in c2r.ROUTES
                for horizon in v12.CORE_HORIZONS
            },
        }
    for row in target_rows:
        if row.get("statisticallyScoreable") is not True:
            row["_internal_interval"] = {"available": False}
            continue
        key = v12.strict_case_key(row)
        pools = pools_by_origin[key[1]]
        route_horizon = pools["routeHorizon"][(key[3], key[2])]
        global_pool = pools["global"]
        if len(route_horizon) >= minimum:
            selected, group = route_horizon, "route_x_horizon"
        elif len(global_pool) >= minimum:
            selected, group = global_pool, "global"
        else:
            row["_internal_interval"] = {"available": False}
            continue
        bounds = base.conformal_interval(float(row["rawModelPrediction"]), selected)
        if bounds is None:
            row["_internal_interval"] = {"available": False}
            continue
        lower, upper = bounds
        actual = float(row["actual"])
        row["_internal_interval"] = {
            "available": True,
            "group": group,
            "calibrationCount": len(selected),
            "lower": lower,
            "upper": upper,
            "covered": lower <= actual <= upper,
            "wis": base.wis_80(actual, float(row["rawModelPrediction"]), lower, upper),
            "intervalScore": base.interval_score_80(actual, lower, upper),
            "width": upper - lower,
            "nominalCoverage": nominal,
        }


def interval_protocol_evidence(
    rows: Sequence[Mapping[str, Any]], contract: Mapping[str, Any]
) -> dict[str, Any]:
    scoreable = [row for row in rows if row.get("statisticallyScoreable") is True]
    available = [
        row
        for row in scoreable
        if bool((row.get("_internal_interval") or {}).get("available"))
    ]
    groups = Counter(
        str(row["_internal_interval"].get("group")) for row in available
    )
    counts = [
        int(row["_internal_interval"].get("calibrationCount", 0))
        for row in available
    ]
    minimum = int(contract["internalInterval"]["minimumCalibrationCount"])
    return {
        "residualModelId": c2r.MODEL_ID,
        "candidateOwnResidualsOnly": True,
        "strictlyEarlierOriginAndAvailableLabelFilter": True,
        "routeHorizonThenGlobalFallback": True,
        "allowedCalibrationGroups": ["global", "route_x_horizon"],
        "calibrationGroupDistribution": dict(sorted(groups.items())),
        "configuredMinimumCalibrationCount": minimum,
        "observedMinimumCalibrationCount": min(counts) if counts else None,
        "allAvailableIntervalsMeetMinimum": bool(counts)
        and min(counts) >= minimum,
        "availableOnAllScoreable": len(available) == len(scoreable),
        "publicEndpointsAbsent": True,
    }


def acceptance_evidence(
    candidate: Mapping[str, Any],
    primary: Mapping[str, Any],
    bootstrap: Mapping[str, Any],
    issue: Mapping[str, Any],
    contract: Mapping[str, Any],
) -> dict[str, Any]:
    gates = contract["acceptanceGates"]
    horizon_improvement = {
        str(horizon): relative_improvement(
            candidate["horizons"][str(horizon)]["wape"],
            primary["horizons"][str(horizon)]["wape"],
        )
        for horizon in v12.CORE_HORIZONS
    }
    top_improvement = {
        band: relative_improvement(
            candidate["topBands"][band]["wape"], primary["topBands"][band]["wape"]
        )
        for band in ("top1", "top5", "top10")
    }
    origins = sorted(candidate["origins"])
    origin_improvement = {
        origin: relative_improvement(
            candidate["origins"][origin]["wape"], primary["origins"][origin]["wape"]
        )
        for origin in origins
    }
    regress_flags = [
        origin_improvement[origin] is not None
        and float(origin_improvement[origin])
        < -float(gates["top1Top5WapeRelativeRegressionVsB4MaximumInclusive"])
        - TOLERANCE
        for origin in origins
    ]
    three_consecutive = any(
        all(regress_flags[index : index + 3])
        for index in range(max(0, len(regress_flags) - 2))
    )
    coverage = candidate["internal80"]["internal80Coverage"]
    wis_improvement = relative_improvement(
        candidate["internal80"]["meanWis"], primary["internal80"]["meanWis"]
    )
    candidate_width = candidate["internal80"]["standardizedWidth"]
    primary_width = primary["internal80"]["standardizedWidth"]
    width_regression = (
        (float(candidate_width) - float(primary_width)) / float(primary_width)
        if candidate_width is not None
        and primary_width is not None
        and float(primary_width) != 0
        else None
    )
    conditions = {
        "overallWapeAtMost60Percent": float(candidate["allScoreable"]["wape"])
        <= float(gates["overallWapeMaximumInclusive"]) + TOLERANCE,
        "overallServedHighValueBiasWithin10Percent": all(
            abs(float(value))
            <= float(gates["overallServedAndHighValueAbsoluteSignedBiasMaximumInclusive"])
            + TOLERANCE
            for value in (
                candidate["allScoreable"]["signedAggregateBias"],
                candidate["served"]["signedAggregateBias"],
                candidate["highValueAllScoreable"]["signedAggregateBias"],
            )
        ),
        "eachHorizonBiasWithin15Percent": all(
            abs(float(candidate["horizons"][str(horizon)]["signedAggregateBias"]))
            <= float(gates["eachCoreHorizonAbsoluteSignedBiasMaximumInclusive"])
            + TOLERANCE
            for horizon in v12.CORE_HORIZONS
        ),
        "horizon3_6_12ImproveAtLeast3Percent": all(
            horizon_improvement[str(horizon)] is not None
            and float(horizon_improvement[str(horizon)])
            >= float(gates["horizon3_6_12RelativeWapeImprovementVsB4MinimumInclusive"])
            - TOLERANCE
            for horizon in (3, 6, 12)
        ),
        "horizon18_24RegressAtMost2Percent": all(
            horizon_improvement[str(horizon)] is not None
            and float(horizon_improvement[str(horizon)])
            >= -float(gates["horizon18_24RelativeWapeRegressionVsB4MaximumInclusive"])
            - TOLERANCE
            for horizon in (18, 24)
        ),
        "top10ImprovesAtLeast5Percent": top_improvement["top10"] is not None
        and float(top_improvement["top10"])
        >= float(gates["top10WapeRelativeImprovementVsB4MinimumInclusive"]) - TOLERANCE,
        "top1Top5RegressAtMost5Percent": all(
            top_improvement[band] is not None
            and float(top_improvement[band])
            >= -float(
                gates["top1Top5WapeRelativeRegressionVsB4MaximumInclusive"]
            )
            - TOLERANCE
            for band in ("top1", "top5")
        ),
        "outerOriginWinShareAtLeast70Percent": sum(
            float(candidate["origins"][origin]["wape"])
            < float(primary["origins"][origin]["wape"]) - TOLERANCE
            for origin in origins
        )
        / len(origins)
        >= float(gates["outerOriginWinShareVsB4MinimumInclusive"]) - TOLERANCE,
        "noThreeConsecutiveOriginsRegressOver5Percent": not three_consecutive,
        "internal80CoverageBetween75And85Percent": coverage is not None
        and float(gates["internal80CoverageInclusive"][0]) - TOLERANCE
        <= float(coverage)
        <= float(gates["internal80CoverageInclusive"][1]) + TOLERANCE,
        "meanWisImprovesAtLeast5Percent": wis_improvement is not None
        and float(wis_improvement)
        >= float(gates["meanWisRelativeImprovementVsB4MinimumInclusive"]) - TOLERANCE,
        "standardizedWidthRegressAtMost10Percent": width_regression is not None
        and float(width_regression)
        <= float(gates["standardizedWidthRelativeRegressionVsB4MaximumInclusive"])
        + TOLERANCE,
        "pairedBootstrapUpper95BelowZero": float(
            bootstrap["comparisons"][c2r.MODEL_ID]["percentileUpper"]
        )
        < float(
            gates["pairedWorkOriginBootstrap95UpperRelativeWapeDeltaVsB4Exclusive"]
        ),
        "P0IsZero": int(issue["P0"]) <= int(gates["P0Maximum"]),
        "P1IsZero": int(issue["P1"]) <= int(gates["P1Maximum"]),
        "P2FactReviewOnly": issue["P2FactReviewPromptsOnly"] is True,
        "automaticOperatingActionFieldsZero": int(
            issue["automaticOperatingActionFieldCount"]
        )
        <= int(gates["automaticOperatingActionFieldCountMaximum"]),
    }
    return {
        "conditions": conditions,
        "allAcceptanceConditionsPassed": all(conditions.values()),
        "horizonWapeRelativeImprovementVsB4": horizon_improvement,
        "topBandWapeRelativeImprovementVsB4": top_improvement,
        "originWapeRelativeImprovementVsB4": origin_improvement,
        "thresholdsChangedAfterResults": False,
    }


def private_payload(row: Mapping[str, Any]) -> dict[str, Any]:
    key = v12.strict_case_key(row)
    return {
        "caseKey": {
            "standard_work_id": key[0],
            "origin": key[1],
            "horizon_months": key[2],
            "route": key[3],
        },
        "rawModelPrediction": row["rawModelPrediction"],
        "servedPrediction": row["servedPrediction"],
        "actual": row["actual"],
        "statisticallyScoreable": row["statisticallyScoreable"],
        "modelPredictionAvailable": row["modelPredictionAvailable"],
        "businessServingEligible": row["businessServingEligible"],
        "abstained": row["abstained"],
        "abstentionReason": row["abstentionReason"],
        "selectedCandidateId": row.get("selectedCandidateId"),
        "comparatorRawPredictions": copy.deepcopy(
            row.get("_comparator_raw_predictions", {})
        ),
        "excludesFutureBuyout": row.get("excludesFutureBuyout"),
        "channelComponents": copy.deepcopy(row.get("channel_components", [])),
        "componentActualByChannel": copy.deepcopy(
            row.get("_component_actual_by_channel", {})
        ),
        "internalInterval": copy.deepcopy(row.get("_internal_interval", {})),
        "strata": copy.deepcopy(row.get("strata", {})),
        "publicOutput": copy.deepcopy(row.get("public_output", {})),
    }


def write_private_evidence(
    rows: Sequence[Mapping[str, Any]],
    report: Mapping[str, Any],
    authority_input_fingerprint: str,
) -> dict[str, Any]:
    PRIVATE_DIR.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256()
    with PRIVATE_CASES.open("wb") as handle:
        for row in sorted(rows, key=v12.strict_case_key):
            raw = base.canonical_json_bytes(private_payload(row)) + b"\n"
            handle.write(raw)
            digest.update(raw)
    workbook = Workbook()
    summary = workbook.active
    summary.title = "结论"
    summary.append(["项目", "结果"])
    summary.append(["C2-R development", report["C2RDevelopmentResult"]])
    summary.append(["决策状态", "not_for_formal_decision"])
    summary.append(["all-scoreable WAPE", report["metrics"]["C2-R"]["allScoreable"]["wape"]])
    summary.append(["all-scoreable signed bias", report["metrics"]["C2-R"]["allScoreable"]["signedAggregateBias"]])
    summary.append(["final holdout", "sealed"])
    route_sheet = workbook.create_sheet("路由选择")
    route_sheet.append(["origin", "route", "状态", "候选", "可行候选数"])
    for item in report["routeSelection"]:
        route_sheet.append(
            [
                item["outerOrigin"],
                item["route"],
                item["selectionStatus"],
                item["selectedCandidateId"],
                item["biasFeasibleCandidateCount"],
            ]
        )
    workbook.save(PRIVATE_WORKBOOK)
    manifest = {
        "schema": "m2.c2r_development_private_manifest.v1",
        "decisionStatus": "not_for_formal_decision",
        "tracked": False,
        "privateCaseRowCount": len(rows),
        "caseEvidenceSha256": digest.hexdigest(),
        "privateWorkbookSha256": file_sha256(PRIVATE_WORKBOOK),
        "publicReportSha256": file_sha256(PUBLIC_JSON),
        "publicReportSha256ByPath": {
            path.relative_to(ROOT).as_posix(): file_sha256(path)
            for path in (
                PUBLIC_JSON,
                PUBLIC_MD,
                ROUTING_JSON,
                ROUTING_MD,
                CHANNEL_JSON,
                CHANNEL_MD,
                ROUTE_JSON,
                ROUTE_MD,
            )
        },
        "authorityInputFingerprint": authority_input_fingerprint,
        "specDigest": c2r.canonical_digest(c2r.load_spec()),
        "finalHoldoutOpened": False,
        "embargoShadowOpened": False,
        "deferred60MonthLabelsOpened": False,
    }
    write_json(PRIVATE_MANIFEST, manifest)
    require_boundaries()
    return manifest


def report_markdown(report: Mapping[str, Any]) -> str:
    metrics = report["metrics"]["C2-R"]
    served_wape = (
        "互补抑制"
        if metrics["served"].get("wape") is None
        else f"{metrics['served']['wape']:.4f}"
    )
    served_bias = (
        "互补抑制"
        if metrics["served"].get("signedAggregateBias") is None
        else f"{metrics['served']['signedAggregateBias']:+.2%}"
    )
    lines = [
        "# M2 C2-R development 验证",
        "",
        f"结论：C2-R development 为 `{report['C2RDevelopmentResult']}`；结果继续 `not_for_formal_decision`。未打开 final holdout、embargo shadow 或 60-month labels，未授权 C2/C3 或 release。",
        "",
        "## 核心指标",
        "",
        "| 指标 | 结果 |",
        "|---|---:|",
        f"| all-scoreable WAPE | {metrics['allScoreable']['wape']:.4f} |",
        f"| all-scoreable signed bias | {metrics['allScoreable']['signedAggregateBias']:+.2%} |",
        f"| served WAPE | {served_wape} |",
        f"| served signed bias | {served_bias} |",
        f"| 高价值 WAPE | {metrics['highValueAllScoreable']['wape']:.4f} |",
        f"| 高价值 signed bias | {metrics['highValueAllScoreable']['signedAggregateBias']:+.2%} |",
        f"| 内部 80% coverage | {metrics['internal80']['internal80Coverage']:.2%} |",
        f"| 内部 mean WIS | {metrics['internal80']['meanWis']:.4f} |",
        "",
        "## horizon",
        "",
        "| 月数 | WAPE | signed bias |",
        "|---:|---:|---:|",
    ]
    for horizon in v12.CORE_HORIZONS:
        cell = metrics["horizons"][str(horizon)]
        lines.append(
            f"| {horizon} | {cell['wape']:.4f} | {cell['signedAggregateBias']:+.2%} |"
        )
    lines.extend(
        [
            "",
            "渠道级对账、收入模式分层、四个 comparator 和全部 gate 结果见同名 JSON 及配套脱敏报告。公开产物不含作品、作者、真实渠道、原始收入行或内部 PI endpoints。",
        ]
    )
    return "\n".join(lines)


def routing_markdown(report: Mapping[str, Any]) -> str:
    return "\n".join(
        [
            "# M2 C2-R 收入模式路由 manifest",
            "",
            "路由在每个 cutoff 仅由当时及以前的渠道行为确定。pure sales 按渠道预测后求和；pure buyout 使用事件周期；mixed 只预测实销且排除未来买断；unknown 固定 abstain。",
            "",
            f"outer 选择记录 {len(report['routeSelection'])} 条；所有记录均使用更早可得 development truth，未改变 eligibility 或 scoreability。",
        ]
    )


def channel_markdown(report: Mapping[str, Any]) -> str:
    return "\n".join(
        [
            "# M2 C2-R 渠道对账",
            "",
            f"scoreable 渠道组件 case 数：{report['scoreableChannelComponentCaseCount']}。",
            f"渠道和到作品点值最大绝对差：{report['maximumChannelSumToWorkAbsoluteDifference']:.8f}；严格对账：`{report['allWorkForecastsStrictlyReconciled']}`。",
            "",
            "公开报告仅保留聚合指标，不含真实渠道名称或渠道标识。",
        ]
    )


def route_markdown(report: Mapping[str, Any]) -> str:
    lines = ["# M2 C2-R 收入模式分层指标", "", "小样本采用主格与互补格抑制。", ""]
    for route, cell in report["routes"].items():
        if cell.get("suppressed"):
            lines.append(f"- `{route}`：已抑制（{cell['suppressionReason']}）")
        else:
            lines.append(
                f"- `{route}`：WAPE {cell['wape']:.4f}，signed bias {cell['signedAggregateBias']:+.2%}"
            )
    return "\n".join(lines)


def privacy_check(paths: Sequence[Path]) -> None:
    text = "\n".join(path.read_text(encoding="utf-8") for path in paths).lower()
    forbidden = (
        "standard_work_id",
        "channel_key",
        "private-output",
        "data/private",
        ".xlsx",
        "optimistic",
        "pessimistic",
        "\"lower\"",
        "\"upper\"",
    )
    if any(token in text for token in forbidden):
        raise C2RValidationError("public C2-R report contains forbidden detail")


def small_cell_check(
    routing_report: Mapping[str, Any],
    route_report: Mapping[str, Any],
    channel_report: Mapping[str, Any],
) -> None:
    grids = [
        routing_report["perOriginRouteDistribution"],
        routing_report["perOriginRouteMetrics"],
    ]
    for grid in grids:
        for cells in grid.values():
            suppressed = [cell for cell in cells.values() if cell.get("suppressed")]
            if suppressed and len(suppressed) < 2:
                raise C2RValidationError(
                    "public per-origin route grid lacks complementary suppression"
                )
            for cell in cells.values():
                if cell.get("suppressed"):
                    if cell.get("caseCount") is not None or cell.get(
                        "uniqueWorkCount"
                    ) is not None:
                        raise C2RValidationError(
                            "suppressed route cell exposes a population count"
                        )
                    continue
                if int(cell.get("caseCount", 0)) < MINIMUM_CELL or int(
                    cell.get("uniqueWorkCount", 0)
                ) < MINIMUM_CELL:
                    raise C2RValidationError(
                        "public per-origin route cell is below the minimum"
                    )
    if set(channel_report["perOriginChannelAudit"]) != set(
        routing_report["perOriginRouteDistribution"]
    ):
        raise C2RValidationError("public channel audit does not cover every origin")
    origin_channel_cells = channel_report["perOriginChannelAudit"]
    origin_channel_suppressed = [
        cell for cell in origin_channel_cells.values() if cell.get("suppressed")
    ]
    if origin_channel_suppressed and len(origin_channel_suppressed) < 2:
        raise C2RValidationError(
            "per-origin channel audit lacks complementary suppression"
        )
    aggregate_routes = route_report["routes"]
    aggregate_suppressed = [
        cell for cell in aggregate_routes.values() if cell.get("suppressed")
    ]
    if aggregate_suppressed and len(aggregate_suppressed) < 2:
        raise C2RValidationError("route report lacks complementary suppression")
    component_routes = channel_report["matchedComponentMetricsByRoute"]
    component_suppressed = [
        cell for cell in component_routes.values() if cell.get("suppressed")
    ]
    if component_suppressed and len(component_suppressed) < 2:
        raise C2RValidationError(
            "channel route report lacks complementary suppression"
        )
    for _origin, cell in channel_report["perOriginChannelAudit"].items():
        if cell.get("suppressed"):
            if any(
                cell.get(field) is not None
                for field in (
                    "matchedComponentCaseCount",
                    "aggregateMatchedChannelWape",
                    "aggregateMatchedChannelSignedBias",
                    "channelComponentCount",
                    "shortHistoryFallbackChannelComponentCount",
                    "seasonalNaive12FallbackChannelComponentCount",
                )
            ):
                raise C2RValidationError(
                    "suppressed per-origin channel cell exposes metrics or counts"
                )
            continue
        for field in (
            "matchedComponentCaseCount",
            "channelComponentCount",
            "shortHistoryFallbackChannelComponentCount",
            "seasonalNaive12FallbackChannelComponentCount",
        ):
            value = cell.get(field)
            if value is not None and 0 < int(value) < MINIMUM_CELL:
                raise C2RValidationError(
                    "public channel audit exposes a positive small-cell count"
                )
        if int(cell.get("matchedComponentCaseCount", 0)) < MINIMUM_CELL:
            raise C2RValidationError(
                "public per-origin channel metric is below the minimum"
            )


def verify_private_recomputation(
    payloads: Sequence[Mapping[str, Any]],
    report: Mapping[str, Any],
    routing_report: Mapping[str, Any],
    channel_report: Mapping[str, Any],
    route_report: Mapping[str, Any],
) -> dict[str, Any]:
    rows = []
    for payload in payloads:
        key = payload["caseKey"]
        rows.append(
            {
                "standard_work_id": key["standard_work_id"],
                "origin": key["origin"],
                "horizon_months": key["horizon_months"],
                "route": key["route"],
                "case_key": {
                    "standard_work_id": key["standard_work_id"],
                    "origin": key["origin"],
                    "horizon_months": key["horizon_months"],
                    "route": key["route"],
                },
                "model_id": c2r.MODEL_ID,
                "actual": payload["actual"],
                "statisticallyScoreable": payload["statisticallyScoreable"],
                "modelPredictionAvailable": payload["modelPredictionAvailable"],
                "rawModelPrediction": payload["rawModelPrediction"],
                "servedPrediction": payload["servedPrediction"],
                "businessServingEligible": payload["businessServingEligible"],
                "abstained": payload["abstained"],
                "abstentionReason": payload["abstentionReason"],
                "strata": copy.deepcopy(payload.get("strata", {})),
                "_internal_interval": copy.deepcopy(
                    payload.get("internalInterval", {})
                ),
                "channel_components": copy.deepcopy(
                    payload.get("channelComponents", [])
                ),
                "_component_actual_by_channel": copy.deepcopy(
                    payload.get("componentActualByChannel", {})
                ),
                "public_output": copy.deepcopy(payload.get("publicOutput", {})),
            }
        )
    if not rows or len({v12.strict_case_key(row) for row in rows}) != len(rows):
        raise C2RValidationError("C2-R private evidence has duplicate or empty case keys")
    phase_rows = forensic.load_phase_a_evidence()["rows"]
    b4_rows = [
        row
        for row in phase_rows
        if row.get("model_id") == "B4"
        and str(row.get("_residual_case_role", "")).startswith(
            "development_forward_score:"
        )
    ]
    private_by_key = {v12.strict_case_key(row): row for row in rows}
    payload_by_key = {
        (
            str(payload["caseKey"]["standard_work_id"]),
            str(payload["caseKey"]["origin"]),
            int(payload["caseKey"]["horizon_months"]),
            str(payload["caseKey"]["route"]),
        ): payload
        for payload in payloads
    }
    b4_by_key = {v12.strict_case_key(row): row for row in b4_rows}
    if set(private_by_key) != set(b4_by_key):
        raise C2RValidationError("private case universe differs from frozen B4")
    for key, row in private_by_key.items():
        source = b4_by_key[key]
        served_expected = (
            row["rawModelPrediction"]
            if row["businessServingEligible"] is True
            else None
        )
        if (
            not math.isclose(
                float(row["actual"]), float(source["actual"]), abs_tol=TOLERANCE
            )
            or row["statisticallyScoreable"]
            is not source["statisticallyScoreable"]
            or row["businessServingEligible"]
            is not source["businessServingEligible"]
            or row["modelPredictionAvailable"]
            is not (row["rawModelPrediction"] is not None)
            or row["servedPrediction"] != served_expected
            or bool(row["abstained"])
            is not (row["servedPrediction"] is None)
            or bool(row["abstentionReason"])
            is not bool(row["abstained"])
            or row["abstentionReason"] != source["abstentionReason"]
            or not math.isclose(
                float(payload_by_key[key]["comparatorRawPredictions"]["B4"]),
                float(source["rawModelPrediction"]),
                abs_tol=TOLERANCE,
            )
        ):
            raise C2RValidationError(
                "private case truth or scoring/serving state differs from frozen B4"
            )
    if any(
        (row["servedPrediction"] is None) is not bool(row["abstained"])
        for row in rows
    ):
        raise C2RValidationError("private serving and abstention states do not reconcile")

    public_metrics = report["metrics"][c2r.MODEL_ID]
    scoreable = [row for row in rows if row["statisticallyScoreable"] is True]

    def assert_metric(
        label: str,
        group: Sequence[Mapping[str, Any]],
        public: Mapping[str, Any],
    ) -> None:
        computed = v12.metric_rows(group, "rawModelPrediction")
        for field in (
            "caseCount",
            "uniqueWorkCount",
            "wape",
            "mae",
            "smape",
            "signedAggregateBias",
            "nullPredictionCount",
            "zeroImputationUsed",
        ):
            left, right = computed[field], public[field]
            if isinstance(left, float):
                if right is None or not math.isclose(
                    float(left), float(right), rel_tol=0.0, abs_tol=5e-8
                ):
                    raise C2RValidationError(
                        f"private metric recomputation differs: {label}.{field}"
                    )
            elif left != right:
                raise C2RValidationError(
                    f"private metric recomputation differs: {label}.{field}"
                )

    assert_metric("allScoreable", scoreable, public_metrics["allScoreable"])
    for horizon in v12.CORE_HORIZONS:
        assert_metric(
            f"horizon.{horizon}",
            [
                row
                for row in scoreable
                if v12.strict_case_key(row)[2] == horizon
            ],
            public_metrics["horizons"][str(horizon)],
        )
    for band, field in (("top1", "top_1_percent"), ("top5", "top_5_percent"), ("top10", "top_10_percent")):
        assert_metric(
            band,
            [row for row in scoreable if bool(row["strata"].get(field))],
            public_metrics["topBands"][band],
        )
    for origin, public in public_metrics["origins"].items():
        assert_metric(
            f"origin.{origin}",
            [row for row in scoreable if v12.strict_case_key(row)[1] == origin],
            public,
        )
    high = [row for row in scoreable if bool(row["strata"].get("high_value"))]
    assert_metric(
        "highValueAllScoreable", high, public_metrics["highValueAllScoreable"]
    )
    for route, public in report["routeSpecificMetrics"].items():
        if public.get("suppressed"):
            continue
        assert_metric(
            f"route.{route}",
            [row for row in scoreable if v12.strict_case_key(row)[3] == route],
            public,
        )

    interval = phase.interval_metrics(rows)
    for field in (
        "requiredCaseCount",
        "availableCaseCount",
        "completeOnAllScoreablePopulation",
        "internal80Coverage",
        "meanWis",
        "standardizedWidth",
    ):
        left, right = interval[field], public_metrics["internal80"][field]
        if isinstance(left, float):
            if right is None or not math.isclose(
                float(left), float(right), rel_tol=0.0, abs_tol=5e-8
            ):
                raise C2RValidationError(
                    f"private interval recomputation differs: {field}"
                )
        elif left != right:
            raise C2RValidationError(
                f"private interval recomputation differs: {field}"
            )
    for row in scoreable:
        evidence = row["_internal_interval"]
        if evidence.get("available") is not True:
            raise C2RValidationError("a scoreable private case lacks an interval")
        point = float(row["rawModelPrediction"])
        actual = float(row["actual"])
        lower = float(evidence["lower"])
        upper = float(evidence["upper"])
        radius = upper - point
        if (
            radius < 0
            or not math.isclose(lower, max(0.0, point - radius), abs_tol=5e-8)
            or bool(evidence["covered"]) is not (lower <= actual <= upper)
            or not math.isclose(
                float(evidence["wis"]),
                base.wis_80(actual, point, lower, upper),
                abs_tol=5e-8,
            )
            or not math.isclose(
                float(evidence["intervalScore"]),
                base.interval_score_80(actual, lower, upper),
                abs_tol=5e-8,
            )
        ):
            raise C2RValidationError("private interval fields do not reconcile")

    bootstrap_rows = []
    for payload, row in zip(payloads, rows):
        if row["statisticallyScoreable"] is not True:
            continue
        comparators = payload.get("comparatorRawPredictions", {})
        if set(comparators) != {"B4", "B0b", "B1", "B3"}:
            raise C2RValidationError("private comparator prediction binding is incomplete")
        for model, point in (
            (c2r.MODEL_ID, row["rawModelPrediction"]),
            ("B4", comparators["B4"]),
        ):
            bootstrap_rows.append(
                {
                    **{key: row[key] for key in (
                        "standard_work_id",
                        "origin",
                        "horizon_months",
                        "route",
                        "actual",
                    )},
                    "case_key": copy.deepcopy(row["case_key"]),
                    "model_id": model,
                    "statisticallyScoreable": True,
                    "rawModelPrediction": point,
                }
            )
    _calibration, _v11, parent = v12.load_and_validate_contract()
    bootstrap = v12.paired_relative_block_bootstrap(
        bootstrap_rows, "B4", ("B4", c2r.MODEL_ID), parent
    )
    expected_bootstrap = report["pairedBootstrapVsB4"]["C2R"]
    for field in ("relativeDeltaMedian", "percentileLower", "percentileUpper"):
        if not math.isclose(
            float(bootstrap["comparisons"][c2r.MODEL_ID][field]),
            float(expected_bootstrap[field]),
            rel_tol=0.0,
            abs_tol=5e-8,
        ):
            raise C2RValidationError(
                f"private bootstrap recomputation differs: {field}"
            )
    contract = c2r.load_spec()
    private_metrics = phase.metrics_for_model(rows)
    b4_metrics = phase.metrics_for_model(b4_rows)
    recomputed_issue = c1.issue_and_product_boundary(rows)
    recomputed_acceptance = acceptance_evidence(
        private_metrics,
        b4_metrics,
        bootstrap,
        recomputed_issue,
        contract,
    )
    if public_value(recomputed_acceptance["conditions"]) != report["acceptance"][
        "conditions"
    ] or recomputed_acceptance["allAcceptanceConditionsPassed"] is not report[
        "acceptance"
    ]["allAcceptanceConditionsPassed"]:
        raise C2RValidationError("private acceptance-gate recomputation differs")
    if public_value(recomputed_issue) != report["issueAndProductBoundary"]:
        raise C2RValidationError("private product-boundary recomputation differs")

    origins = contract["caseAndStateContract"]["origins"]
    recomputed_distribution = safe_origin_route_distribution(rows, origins)
    recomputed_origin_routes = safe_origin_route_metrics(rows, origins)
    recomputed_routes = route_metrics(rows)
    recomputed_channel = public_value(channel_evidence(rows))
    if recomputed_distribution != routing_report["perOriginRouteDistribution"]:
        raise C2RValidationError("private per-origin route distribution differs")
    if recomputed_origin_routes != routing_report["perOriginRouteMetrics"]:
        raise C2RValidationError("private per-origin route metrics differ")
    if recomputed_routes != route_report["routes"]:
        raise C2RValidationError("private route metrics differ")
    if recomputed_channel != channel_report:
        raise C2RValidationError("private channel report recomputation differs")
    for item in routing_report["routeSelection"]:
        if item.get("sameOrLaterOuterTruthRead") is not False:
            raise C2RValidationError("route selection admits same/later outer truth")
        if item["route"] in {"pure_sales_share", "buyout_plus_sales"}:
            candidate = c2r.candidate_by_id(item["selectedCandidateId"], contract)
            if item.get("selectedWeights") != public_value(candidate["weights"]):
                raise C2RValidationError("route selection weights differ from spec")
        elif item.get("selectedWeights") != {}:
            raise C2RValidationError("fixed route unexpectedly exposes model weights")
        cell = routing_report["perOriginRouteDistribution"][item["outerOrigin"]][
            item["route"]
        ]
        expected_fallback_count = (
            cell.get("caseCount") if item.get("fallbackAppliedToRoute") else 0
        )
        if item.get("fallbackCaseCount") != expected_fallback_count:
            raise C2RValidationError("route fallback count does not reconcile")
    expected_result = (
        "PASS"
        if report["acceptance"]["allAcceptanceConditionsPassed"] is True
        and report["allStructuralValidationPassed"] is True
        else "FAIL"
    )
    if report["C2RDevelopmentResult"] != expected_result:
        raise C2RValidationError("C2-R result does not reconcile to frozen gates")
    return {
        "metricsRecomputed": True,
        "storedInternalIntervalArithmeticRecomputed": True,
        "conformalResidualQuantilesRebuilt": False,
        "pairedBootstrapRecomputed": True,
        "frozenB4CaseTruthAndServingParityRecomputed": True,
        "acceptanceGatesRecomputed": True,
        "routeAndChannelReportsRecomputed": True,
        "resultReconciledToAcceptanceAndStructuralGates": True,
    }


def run_development() -> dict[str, Any]:
    progress("verifying branch, seals, design checkpoint, and private boundaries")
    require_boundaries()
    calibration_spec, _v11, parent = v12.load_and_validate_contract()
    contract = c2r.load_spec()
    progress("loading frozen Phase A evidence")
    phase_evidence = forensic.load_phase_a_evidence()
    phase_rows = phase_evidence["rows"]
    progress("loading the authorized 3053-work cache read-only")
    works_list, posthoc, input_evidence = legacy.load_authorized_works(calibration_spec)
    gate_json = json.loads(phase.GATE_A_JSON.read_text(encoding="utf-8"))
    expected_input_fingerprint = gate_json["evidenceBindings"]["inputFingerprint"]
    if input_evidence.get("inputFingerprint") != expected_input_fingerprint:
        raise C2RValidationError("C2-R authority input differs from Phase A")
    progress("authority fingerprint matches Gate A")
    works = {str(work["standard_work_id"]): work for work in works_list}
    fold_specs, fold_evidence = build_b4_fold_specs(phase_rows, calibration_spec)
    fallback = c2r.candidate_by_id("single:B4_channel_point", contract)
    fallback_routes = {route: fallback for route in ("pure_sales_share", "buyout_plus_sales")}

    warmup_role = "development_warmup_interval_calibration"
    warmup, warmup_lock, _warmup_matrix = materialize_role(
        _templates(phase_rows, warmup_role),
        works,
        calibration_spec,
        contract,
        warmup_role,
        fallback_routes,
        calibration_spec,
    )
    phase.attach_strata(warmup, works_list, posthoc)
    progress("interval warmup predictions locked")
    forward: list[dict[str, Any]] = []
    component_matrix: dict[tuple[str, str, int, str], dict[str, float]] = {}
    selections = []
    locks = [warmup_lock]
    for origin in contract["caseAndStateContract"]["origins"]:
        progress(f"selecting and locking development origin {origin}")
        selected: dict[str, Mapping[str, Any]] = {}
        for route in ("pure_sales_share", "buyout_plus_sales"):
            candidate, evidence = select_route_candidate(
                route, origin, forward, component_matrix, contract
            )
            selected[route] = candidate
            selections.append(evidence)
        role = f"development_forward_score:{origin}"
        held, lock, matrix = materialize_role(
            _templates(phase_rows, role),
            works,
            calibration_spec,
            contract,
            role,
            selected,
            fold_specs[origin],
        )
        phase.attach_strata(held, works_list, posthoc)
        forward.extend(held)
        component_matrix.update(matrix)
        locks.append(lock)
        for route, identity in (
            ("pure_buyout", "pure_buyout_event_cycle_v1"),
            ("unknown_revenue_model", "unknown_structural_zero_abstain"),
        ):
            selections.append(
                {
                    "outerOrigin": origin,
                    "route": route,
                    "candidateSpaceCount": 1,
                    "innerDistinctScoreOrigins": 0,
                    "innerScoreableCaseCount": 0,
                    "sameOrLaterOuterTruthRead": False,
                    "selectionStatus": "frozen_route_policy",
                    "selectedCandidateId": identity,
                    "selectedWeights": {},
                    "fallbackAppliedToRoute": False,
                    "biasFeasibleCandidateCount": 1,
                    "rejectionReasonDistribution": {},
                }
            )

    progress("building C2-R own strictly-earlier internal intervals")
    apply_c2r_internal_intervals(forward, [*warmup, *forward], contract)
    comparator_rows = {
        model: [
            row
            for row in phase_rows
            if row.get("model_id") == model
            and str(row.get("_residual_case_role", "")).startswith(
                "development_forward_score:"
            )
        ]
        for model in ("B4", "B0b", "B1", "B3")
    }
    comparator_by_model = {
        model: {v12.strict_case_key(row): row for row in rows}
        for model, rows in comparator_rows.items()
    }
    for row in forward:
        key = v12.strict_case_key(row)
        row["_comparator_raw_predictions"] = {
            model: comparator_by_model[model][key]["rawModelPrediction"]
            for model in ("B4", "B0b", "B1", "B3")
        }
    parity = c1.case_parity(forward, comparator_rows["B4"])
    progress("computing metrics, paired work-origin bootstrap, and gates")
    metrics = {c2r.MODEL_ID: phase.metrics_for_model(forward)}
    metrics.update(
        {model: phase.metrics_for_model(rows) for model, rows in comparator_rows.items()}
    )
    relative = c1.comparison_summary(metrics[c2r.MODEL_ID], comparator_rows and {
        model: metrics[model] for model in ("B4", "B0b", "B1", "B3")
    })
    bootstrap = v12.paired_relative_block_bootstrap(
        [*forward, *comparator_rows["B4"]],
        "B4",
        ("B4", c2r.MODEL_ID),
        parent,
    )
    issue = c1.issue_and_product_boundary(forward)
    acceptance = acceptance_evidence(
        metrics[c2r.MODEL_ID], metrics["B4"], bootstrap, issue, contract
    )
    future = synthetic_preflight()
    channel = public_value(channel_evidence(forward))
    routes = route_metrics(forward)
    origin_route_distribution = safe_origin_route_distribution(
        forward, contract["caseAndStateContract"]["origins"]
    )
    origin_route_metrics = safe_origin_route_metrics(
        forward, contract["caseAndStateContract"]["origins"]
    )
    for item in selections:
        fallback_applied = bool(item.get("fallbackAppliedToRoute", False))
        distribution_cell = origin_route_distribution[item["outerOrigin"]][
            item["route"]
        ]
        item["fallbackCaseCount"] = (
            distribution_cell.get("caseCount") if fallback_applied else 0
        )
        item["fallbackCaseCountSuppressed"] = bool(
            fallback_applied and distribution_cell.get("suppressed")
        )
    interval_evidence = interval_protocol_evidence(forward, contract)
    structural = {
        "designCheckpointAncestor": True,
        "samePredictAsOfEntryUsedForBacktestAndForward": all(
            lock["samePredictAsOfEntryUsed"] is True for lock in locks
        ),
        "predictionLockedBeforeTruthJoin": all(
            lock["predictionLockedBeforeTruthJoin"] is True for lock in locks
        ),
        "heldOutcomeFieldsAbsentAtLock": all(
            lock["outcomeFieldsAbsentAtLock"] is True for lock in locks
        ),
        "caseKeysAndActualsMatchB4": parity["caseKeysIdentical"] is True
        and parity["actualValuesIdentical"] is True,
        "scoreabilityAndServingStateMatchB4": parity[
            "scoreabilityAndServingStateIdentical"
        ]
        is True,
        "rawPredictionCompleteOnAllScoreable": parity[
            "rawPredictionCompleteOnAllScoreable"
        ]
        is True,
        "servedNullIffAbstained": parity["servedPredictionNullIffAbstained"] is True,
        "channelAggregationReconciled": channel["allWorkForecastsStrictlyReconciled"]
        is True,
        "syntheticFuturePerturbationPassed": future["checks"][
            "futurePerturbationInvariant"
        ]
        is True,
        "C2ROwnFrozenIntervalProtocolPassed": interval_evidence[
            "candidateOwnResidualsOnly"
        ]
        is True
        and interval_evidence["allAvailableIntervalsMeetMinimum"] is True
        and set(interval_evidence["calibrationGroupDistribution"])
        <= {"global", "route_x_horizon"},
        "productOutputFieldsExact": issue["publicOutputFieldsExact"] is True,
        "publicPredictionIntervalEndpointsAbsent": issue[
            "publicPredictionIntervalEndpointsAbsent"
        ]
        is True,
        "finalHoldoutEmbargoAnd60MonthSealed": True,
    }
    result = (
        "PASS"
        if acceptance["allAcceptanceConditionsPassed"] and all(structural.values())
        else "FAIL"
    )
    public_metrics = phase.public_metrics_bundle(metrics)
    report = {
        "schema": "m2.c2r_development_validation.v1",
        "version": "M2-C2R-development-validation-v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "decisionStatus": "not_for_formal_decision",
        "formalDecisionAuthorized": False,
        "releaseAuthorized": False,
        "C2RDevelopmentResult": result,
        "contractBinding": {
            "designCheckpoint": DESIGN_CHECKPOINT,
            "C2RSpecDigest": c2r.canonical_digest(contract),
            "candidateCount": len(c2r.enumerate_candidates(contract)),
            "primaryComparator": "B4",
            "thresholdsChangedAfterResults": False,
        },
        "authority": {
            "standardWorkCount": len(works),
            "incomeFactCount": 192872,
            "inputFingerprintPresent": bool(input_evidence.get("inputFingerprint")),
            "inputFingerprintMatchesPhaseA": True,
            "scoreableCaseCount": parity["scoreableCaseCount"],
            "expectedCaseCount": parity["expectedCaseCount"],
        },
        "routeSelection": public_value(selections),
        "metrics": public_metrics,
        "relativeComparisons": public_value(relative),
        "pairedBootstrapVsB4": public_value(
            {
                **{
                    key: (["work", "origin"] if key == "clusterKeys" else value)
                    for key, value in bootstrap.items()
                    if key != "comparisons"
                },
                "C2R": bootstrap["comparisons"][c2r.MODEL_ID],
            }
        ),
        "acceptance": public_value(acceptance),
        "structuralValidation": structural,
        "allStructuralValidationPassed": all(structural.values()),
        "channelReconciliation": channel,
        "routeSpecificMetrics": routes,
        "perOriginRouteMetrics": origin_route_metrics,
        "internalIntervalProtocol": interval_evidence,
        "issueAndProductBoundary": public_value(issue),
        "coverage": {
            "fullLibraryWorkDenominator": 3053,
            "scoreableWorkCount": metrics[c2r.MODEL_ID]["allScoreable"][
                "uniqueWorkCount"
            ],
            "unscoreableWorkCount": 3053
            - metrics[c2r.MODEL_ID]["allScoreable"]["uniqueWorkCount"],
            "scoreableWorksShareOf3053": 0.34195873,
            "scoreableFullLibraryRevenueCoverageReference": 0.73232909,
            "unscoreableForwardUsesFrozenPopulationPolicy": True,
            "highValueUnscoreableFallbackDetailPubliclySuppressed": True,
            "servedWorkAndRevenueCoverage": None,
            "servedCoverageComplementarilySuppressed": True,
            "topBandCoverage": {
                "top1": {
                    "fullLibraryWorkCount": 31,
                    "scoreableRevenueCoverage": 0.80278003,
                    "servedRevenueCoverage": None,
                },
                "top5": {
                    "fullLibraryWorkCount": 153,
                    "scoreableRevenueCoverage": 0.75638306,
                    "servedRevenueCoverage": None,
                },
                "top10": {
                    "fullLibraryWorkCount": 306,
                    "scoreableRevenueCoverage": 0.74260518,
                    "servedRevenueCoverage": None,
                },
            },
            "abstention": public_metrics[c2r.MODEL_ID]["abstention"],
        },
        "foldParameterEvidence": public_value(fold_evidence),
        "seals": {
            "finalHoldoutOpened": False,
            "embargoShadowOpened": False,
            "deferred60MonthLabelsOpened": False,
        },
        "privacy": {
            "aggregateOnly": True,
            "deidentified": True,
            "workOrChannelIdentifiersPresent": False,
            "privatePathsPresent": False,
            "rawIncomeRowsPresent": False,
            "predictionIntervalEndpointsPresent": False,
            "smallCellsComplementarilySuppressed": True,
        },
        "nextBoundary": "stop_after_C2R_no_C2_C3_pending_user_review",
    }
    routing_report = {
        "schema": "m2.c2r_revenue_model_routing_manifest.v1",
        "decisionStatus": "not_for_formal_decision",
        "routeDefinitions": {
            "pure_sales_share": "channel_first_zero_retaining_sales_forecast_then_sum",
            "pure_buyout": "as_of_event_cycle_monthly_equivalent_no_future_renewal_assumption",
            "buyout_plus_sales": "sales_channels_only_excludes_future_buyout",
            "unknown_revenue_model": "structural_zero_raw_and_business_abstain",
        },
        "pureBuyoutEventEvidenceBoundary": (
            "as_of_classifier_resolved_not_user_confirmed_and_low_confidence_unless_"
            "classifier_high_with_multiple_events"
        ),
        "routeSelection": public_value(selections),
        "perOriginRouteDistribution": origin_route_distribution,
        "perOriginRouteMetrics": origin_route_metrics,
        "eligibilityChanged": False,
        "scoreabilityChanged": False,
        "currentRightsOrShelfUsedHistorically": False,
        "finalHoldoutOpened": False,
    }
    route_report = {
        "schema": "m2.c2r_route_specific_metrics.v1",
        "decisionStatus": "not_for_formal_decision",
        "routes": routes,
        "perOriginRoutes": origin_route_metrics,
        "pureBuyoutEventEvidenceBoundary": (
            "as_of_classifier_resolved_not_user_confirmed"
        ),
        "smallCellsComplementarilySuppressed": True,
        "finalHoldoutOpened": False,
    }
    progress("writing deidentified public reports and ignored private evidence")
    small_cell_check(routing_report, route_report, channel)
    write_json(PUBLIC_JSON, public_value(report))
    write_text(PUBLIC_MD, report_markdown(report))
    write_json(ROUTING_JSON, routing_report)
    write_text(ROUTING_MD, routing_markdown(routing_report))
    write_json(CHANNEL_JSON, channel)
    write_text(CHANNEL_MD, channel_markdown(channel))
    write_json(ROUTE_JSON, route_report)
    write_text(ROUTE_MD, route_markdown(route_report))
    privacy_check(
        (PUBLIC_JSON, PUBLIC_MD, ROUTING_JSON, ROUTING_MD, CHANNEL_JSON, CHANNEL_MD, ROUTE_JSON, ROUTE_MD)
    )
    manifest = write_private_evidence(
        forward, report, str(input_evidence["inputFingerprint"])
    )
    progress("development replay complete")
    return {
        "status": "passed",
        "C2RDevelopmentResult": result,
        "allScoreableWape": metrics[c2r.MODEL_ID]["allScoreable"]["wape"],
        "allScoreableSignedBias": metrics[c2r.MODEL_ID]["allScoreable"][
            "signedAggregateBias"
        ],
        "scoreableCaseCount": parity["scoreableCaseCount"],
        "privateCaseEvidenceSha256": manifest["caseEvidenceSha256"],
        "finalHoldoutOpened": False,
    }


def verify_development() -> dict[str, Any]:
    require_boundaries()
    required = (
        PUBLIC_JSON,
        PUBLIC_MD,
        ROUTING_JSON,
        ROUTING_MD,
        CHANNEL_JSON,
        CHANNEL_MD,
        ROUTE_JSON,
        ROUTE_MD,
        PRIVATE_CASES,
        PRIVATE_MANIFEST,
        PRIVATE_WORKBOOK,
    )
    if any(not path.is_file() for path in required):
        raise C2RValidationError("C2-R development evidence is incomplete")
    manifest = json.loads(PRIVATE_MANIFEST.read_text(encoding="utf-8"))
    digest = hashlib.sha256()
    count = 0
    payloads = []
    with PRIVATE_CASES.open("rb") as handle:
        for raw in handle:
            if not raw.endswith(b"\n") or raw in {b"\n", b"\r\n"}:
                raise C2RValidationError("C2-R private cases are not canonical LF NDJSON")
            payload = json.loads(raw[:-1].decode("utf-8"))
            if base.canonical_json_bytes(payload) + b"\n" != raw:
                raise C2RValidationError("C2-R private case is not canonical JSON")
            digest.update(raw)
            count += 1
            payloads.append(payload)
    if (
        manifest.get("decisionStatus") != "not_for_formal_decision"
        or count != int(manifest["privateCaseRowCount"])
        or digest.hexdigest() != manifest["caseEvidenceSha256"]
        or file_sha256(PRIVATE_WORKBOOK) != manifest["privateWorkbookSha256"]
        or file_sha256(PUBLIC_JSON) != manifest["publicReportSha256"]
        or manifest.get("publicReportSha256ByPath")
        != {
            path.relative_to(ROOT).as_posix(): file_sha256(path)
            for path in (
                PUBLIC_JSON,
                PUBLIC_MD,
                ROUTING_JSON,
                ROUTING_MD,
                CHANNEL_JSON,
                CHANNEL_MD,
                ROUTE_JSON,
                ROUTE_MD,
            )
        }
        or manifest.get("authorityInputFingerprint")
        != json.loads(phase.GATE_A_JSON.read_text(encoding="utf-8"))[
            "evidenceBindings"
        ]["inputFingerprint"]
        or c2r.canonical_digest(c2r.load_spec()) != manifest["specDigest"]
        or any(
            manifest.get(field) is not False
            for field in (
                "finalHoldoutOpened",
                "embargoShadowOpened",
                "deferred60MonthLabelsOpened",
            )
        )
    ):
        raise C2RValidationError("C2-R private manifest binding failed")
    privacy_check(
        (PUBLIC_JSON, PUBLIC_MD, ROUTING_JSON, ROUTING_MD, CHANNEL_JSON, CHANNEL_MD, ROUTE_JSON, ROUTE_MD)
    )
    report = json.loads(PUBLIC_JSON.read_text(encoding="utf-8"))
    routing_report = json.loads(ROUTING_JSON.read_text(encoding="utf-8"))
    route_report = json.loads(ROUTE_JSON.read_text(encoding="utf-8"))
    channel_report = json.loads(CHANNEL_JSON.read_text(encoding="utf-8"))
    small_cell_check(routing_report, route_report, channel_report)
    recomputation = verify_private_recomputation(
        payloads, report, routing_report, channel_report, route_report
    )
    return {
        "status": "passed",
        "C2RDevelopmentResult": report["C2RDevelopmentResult"],
        "privateCaseRowCount": count,
        "privateArtifactsTracked": False,
        "finalHoldoutOpened": False,
        "embargoShadowOpened": False,
        "deferred60MonthLabelsOpened": False,
        "independentRecomputation": recomputation,
    }


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--preflight", action="store_true")
    group.add_argument("--run-development", action="store_true")
    group.add_argument("--verify-development", action="store_true")
    group.add_argument("--run-final-holdout", action="store_true")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    if args.run_final_holdout:
        raise C2RValidationError(
            "C2-R final holdout is sealed; this command is intentionally fail-closed"
        )
    if args.run_development:
        result = run_development()
    elif args.verify_development:
        result = verify_development()
    else:
        result = synthetic_preflight()
    if result.get("status") != "passed":
        raise SystemExit(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
