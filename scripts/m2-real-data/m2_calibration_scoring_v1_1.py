#!/usr/bin/env python3
"""M2 calibration-spec-v1.1 scoring and eligibility kernel.

This module deliberately does not implement a forecasting model.  It receives
predictions materialized by the frozen B0b--B3 formulas, separates statistical
scoreability from product serving, and computes the three metric populations
defined by the committed v1.1 amendment.  It never opens a database, a holdout,
an embargo label, or a deferred 60-month label.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import subprocess
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Sequence

import m2_calibration_v1 as base


ROOT = Path(__file__).resolve().parents[2]
BASE_SPEC_PATH = ROOT / "src" / "domain" / "oldProductEvaluation" / "calibrationSpec.v1.json"
AMENDMENT_PATH = (
    ROOT
    / "src"
    / "domain"
    / "oldProductEvaluation"
    / "calibrationSpec.v1.1.amendment.json"
)
FROZEN_AMENDMENT_COMMIT = "c64c56be0ad51048647ee450639b1ac91ebef62d"
FROZEN_AMENDMENT_DIGEST = "5c7945571520b4f229f15c14b29320bf65d11880ae92770fe0513f2a21eb799b"
BASELINE_IDS = ("B0b", "B1", "B2", "B3")


class ScoringContractError(RuntimeError):
    """The frozen scoring contract or a required case invariant failed."""


def _normalize(value: Any) -> Any:
    if isinstance(value, str):
        return unicodedata.normalize("NFC", value)
    if isinstance(value, list):
        return [_normalize(item) for item in value]
    if isinstance(value, tuple):
        return [_normalize(item) for item in value]
    if isinstance(value, Mapping):
        return {
            unicodedata.normalize("NFC", str(key)): _normalize(child)
            for key, child in value.items()
        }
    return value


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(
        _normalize(value),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")


def canonical_digest(value: Any) -> str:
    return hashlib.sha256(canonical_bytes(value)).hexdigest()


def _finite(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _rounded(value: Any, places: int = 8) -> float | None:
    number = _finite(value)
    return None if number is None else round(number, places)


def _git_bytes(commit: str, path: Path) -> bytes:
    relative = path.relative_to(ROOT).as_posix()
    result = subprocess.run(
        ["git", "show", f"{commit}:{relative}"],
        cwd=ROOT,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise ScoringContractError(
            f"frozen amendment commit does not contain {relative}"
        )
    return result.stdout


@dataclass(frozen=True)
class ScoringContract:
    base_spec: Mapping[str, Any]
    amendment: Mapping[str, Any]
    base_digest: str
    amendment_digest: str
    combined_digest: str


def load_contract() -> ScoringContract:
    base_spec = json.loads(BASE_SPEC_PATH.read_text(encoding="utf-8"))
    amendment = json.loads(AMENDMENT_PATH.read_text(encoding="utf-8"))
    base.validate_spec(base_spec)
    base_digest = base.spec_digest(base_spec)
    expected_base = str(amendment["baseBinding"]["canonicalSpecDigestSha256"])
    if base_digest != expected_base:
        raise ScoringContractError("v1.1 amendment base-spec digest binding failed")
    amendment_digest = canonical_digest(amendment)
    if amendment_digest != FROZEN_AMENDMENT_DIGEST:
        raise ScoringContractError("v1.1 amendment canonical digest changed")
    if _git_bytes(FROZEN_AMENDMENT_COMMIT, AMENDMENT_PATH) != AMENDMENT_PATH.read_bytes():
        raise ScoringContractError("v1.1 amendment bytes differ from the frozen commit")
    if amendment.get("decisionStatus") != "not_for_formal_decision":
        raise ScoringContractError("v1.1 amendment decision boundary changed")
    seals = amendment.get("seals", {})
    if (
        seals.get("finalHoldout", {}).get("opened") is not False
        or seals.get("embargoShadow", {}).get("opened") is not False
        or seals.get("deferred60Month", {}).get("opened") is not False
        or any(
            bool(value)
            for key, value in seals.get("candidateTraining", {}).items()
            if str(key).endswith("Started")
        )
    ):
        raise ScoringContractError("a holdout, embargo, 60-month, or candidate seal is open")
    combined = hashlib.sha256(
        base_digest.encode("utf-8") + b"\n" + canonical_bytes(amendment)
    ).hexdigest()
    return ScoringContract(base_spec, amendment, base_digest, amendment_digest, combined)


def case_key(row: Mapping[str, Any]) -> tuple[str, str, int, str]:
    key = row.get("case_key") or row.get("caseKey")
    if not isinstance(key, Mapping):
        raise ScoringContractError("case key is missing")
    work_id = str(key.get("standard_work_id", key.get("standardWorkId", ""))).strip()
    origin = str(key.get("origin", "")).strip()
    route = str(key.get("route", row.get("route", ""))).strip()
    horizon = int(key.get("horizon_months", key.get("horizonMonths", 0)))
    if not work_id or not origin or not route or horizon <= 0:
        raise ScoringContractError("case key is incomplete")
    return work_id, origin, horizon, route


def first_observed_source_month(work: Mapping[str, Any]) -> str | None:
    observed: list[str] = []
    for channel in work.get("channels", []) or []:
        first = str(channel.get("first_observed_month", "")).strip()
        if first:
            observed.append(first)
        else:
            observed.extend(
                str(month)
                for month in (channel.get("monthly", {}) or {})
                if str(month)
            )
    return min(observed) if observed else None


def _observed_calendar_months(work: Mapping[str, Any], origin: str) -> int:
    first = first_observed_source_month(work)
    if first is None or first > origin:
        return 0
    return base.month_ordinal(origin) - base.month_ordinal(first) + 1


def _truth_boundary(row: Mapping[str, Any], contract: ScoringContract) -> str:
    explicit = row.get("_scoring_label_boundary") or row.get("scoringLabelBoundary")
    if explicit:
        return str(explicit)
    role = str(row.get("_residual_case_role", row.get("caseRole", "")))
    if role in {"development_forward_score", "development_warmup_interval_calibration"}:
        return str(
            contract.base_spec["origins"]["crossHorizonPurge"][
                "developmentTargetEndOnOrBefore"
            ]
        )
    return str(contract.base_spec["authority"]["latestCompleteMonth"])


def _raw_value(row: Mapping[str, Any]) -> float | None:
    for key in (
        "rawModelPrediction",
        "raw_model_prediction",
        "_raw_model_prediction",
        "_comparison_point_forecast",
        "point_forecast",
    ):
        if key in row:
            value = _finite(row.get(key))
            if value is not None:
                return value
    return None


def _raw_annual(row: Mapping[str, Any]) -> list[dict[str, Any]]:
    value = row.get("rawAnnualBreakdown", row.get("_raw_annual_breakdown"))
    if value is None:
        value = row.get("annual_breakdown", [])
    return copy.deepcopy(value) if isinstance(value, list) else []


def annotate_case_states(
    prediction: Mapping[str, Any],
    work: Mapping[str, Any],
    contract: ScoringContract | None = None,
) -> dict[str, Any]:
    """Return a case with four independent states and explicit raw/served values."""

    contract = contract or load_contract()
    row = copy.deepcopy(dict(prediction))
    work_id, origin, _horizon, route = case_key(row)
    identity_valid = (
        bool(work_id)
        and work_id == str(work.get("standard_work_id", "")).strip()
        and not bool(work.get("duplicate_standard_work_id"))
    )
    observed = _observed_calendar_months(work, origin)
    minimum = int(
        contract.base_spec["forecastability"]["rules"][
            "minimumObservedCalendarMonths"
        ]
    )
    history_integrity = row.get("incomeFactIntegrityValid", True) is True
    target_end = str(row.get("target_end", base.add_months(origin, _horizon)))
    target_complete = target_end <= str(contract.base_spec["authority"]["latestCompleteMonth"])
    label_available = str(
        row.get("label_available_as_of")
        or row.get("_available_as_of")
        or target_end
    ) <= _truth_boundary(row, contract)
    scoreable = bool(
        identity_valid
        and observed >= minimum
        and target_complete
        and history_integrity
        and label_available
    )
    business_eligible = bool(
        identity_valid
        and history_integrity
        and observed >= minimum
        and route != "unknown_revenue_model"
    )
    raw = _raw_value(row)
    available = raw is not None
    if scoreable and not available:
        raise ScoringContractError(
            "statistically scoreable case is missing rawModelPrediction"
        )
    served = raw if business_eligible and available else None
    if not identity_valid:
        scoreability_reason = "identity_integrity_failure"
    elif observed == 0:
        scoreability_reason = "work_not_yet_observable_at_origin"
    elif observed < minimum:
        scoreability_reason = "insufficient_observed_calendar_history"
    elif not target_complete:
        scoreability_reason = "incomplete_actual_window"
    elif not history_integrity:
        scoreability_reason = "income_fact_integrity_failure"
    elif not label_available:
        scoreability_reason = "target_label_not_available_for_role"
    else:
        scoreability_reason = None
    if served is not None:
        abstention_reason = None
    elif not scoreable:
        suffix = {
            "identity_integrity_failure": "identity_integrity",
            "work_not_yet_observable_at_origin": "work_not_yet_observable",
            "insufficient_observed_calendar_history": "insufficient_history",
            "incomplete_actual_window": "incomplete_actual_window",
            "income_fact_integrity_failure": "income_fact_integrity",
            "target_label_not_available_for_role": "label_unavailable",
        }[str(scoreability_reason)]
        abstention_reason = f"not_statistically_scoreable_{suffix}"
    elif not identity_valid:
        abstention_reason = "business_ineligible_identity_integrity"
    elif not history_integrity:
        abstention_reason = "business_ineligible_income_history_integrity"
    elif observed < minimum:
        abstention_reason = "business_ineligible_insufficient_history"
    elif route == "unknown_revenue_model":
        abstention_reason = "business_ineligible_unresolved_revenue_model"
    else:
        abstention_reason = "model_prediction_unavailable"

    raw_annual = _raw_annual(row)
    served_annual = copy.deepcopy(raw_annual) if served is not None else []
    limitations = [
        str(item)
        for item in row.get("limitation", []) or []
        if str(item)
        not in {
            "blocked_no_positive_history",
            "blocked_insufficient_history",
            "blocked_unresolved_route",
        }
    ]
    if abstention_reason and abstention_reason not in limitations:
        limitations.append(abstention_reason)
    row.update(
        {
            "statisticallyScoreable": scoreable,
            "scoreabilityReason": scoreability_reason,
            "observedSourceCalendarMonths": observed,
            "modelPredictionAvailable": available,
            "businessServingEligible": business_eligible,
            "rawModelPrediction": raw,
            "servedPrediction": served,
            "abstained": served is None,
            "abstentionReason": abstention_reason,
            "rawAnnualBreakdown": raw_annual,
            "servedAnnualBreakdown": served_annual,
            "limitation": limitations,
            "public_output": {
                "pointForecast": served,
                "annualBreakdown": served_annual,
                "confidence": row.get("confidence", "unavailable"),
                "limitation": limitations,
            },
        }
    )
    return row


def _metric_rows(rows: Sequence[Mapping[str, Any]], prediction_field: str) -> dict[str, Any]:
    predictions: list[float] = []
    actuals: list[float] = []
    for row in rows:
        actual = _finite(row.get("actual"))
        prediction = _finite(row.get(prediction_field))
        if actual is None or prediction is None:
            raise ScoringContractError(
                f"metric population has missing {prediction_field} or actual"
            )
        predictions.append(prediction)
        actuals.append(actual)
    absolute_errors = [abs(prediction - actual) for prediction, actual in zip(predictions, actuals)]
    smape_terms = [
        0.0
        if prediction == 0 and actual == 0
        else 2.0 * abs(prediction - actual) / (abs(prediction) + abs(actual))
        for prediction, actual in zip(predictions, actuals)
    ]
    return {
        "caseCount": len(rows),
        "uniqueWorkCount": len({case_key(row)[0] for row in rows}),
        "actualTotal": _rounded(sum(actuals)),
        "predictedTotal": _rounded(sum(predictions)),
        "wape": _rounded(base.wape(predictions, actuals)),
        "mae": _rounded(sum(absolute_errors) / len(absolute_errors) if absolute_errors else None),
        "smape": _rounded(sum(smape_terms) / len(smape_terms) if smape_terms else None),
        "signedAggregateBias": _rounded(base.signed_aggregate_bias(predictions, actuals)),
        "nullPredictionCount": 0,
        "zeroImputationUsed": False,
    }


def all_scoreable_metrics(rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    selected = [row for row in rows if row.get("statisticallyScoreable") is True]
    result = _metric_rows(selected, "rawModelPrediction")
    by_horizon: dict[str, float | None] = {}
    for horizon in sorted({case_key(row)[2] for row in selected}):
        score = _metric_rows(
            [row for row in selected if case_key(row)[2] == horizon],
            "rawModelPrediction",
        )
        by_horizon[str(horizon)] = score["wape"]
    numeric = [float(value) for value in by_horizon.values() if value is not None]
    result["horizonStability"] = {
        "wapeByHorizon": by_horizon,
        "maximumMinusMinimumWape": _rounded(max(numeric) - min(numeric)) if numeric else None,
    }
    return result


def served_cohort_metrics(rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    selected = [
        row
        for row in rows
        if row.get("statisticallyScoreable") is True
        and row.get("businessServingEligible") is True
    ]
    result = _metric_rows(selected, "servedPrediction")
    high_value = [row for row in selected if bool(row.get("strata", {}).get("high_value"))]
    result["highValuePerformance"] = _metric_rows(high_value, "servedPrediction")
    return result


def _positive_actual(rows: Sequence[Mapping[str, Any]]) -> float:
    return sum(max(float(row.get("actual", 0.0)), 0.0) for row in rows)


def abstention_metrics(rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    scoreable = [row for row in rows if row.get("statisticallyScoreable") is True]
    served = [row for row in scoreable if row.get("servedPrediction") is not None]
    abstained = [row for row in scoreable if row.get("servedPrediction") is None]
    scoreable_blocks = {(case_key(row)[0], case_key(row)[1]) for row in scoreable}
    served_blocks = {(case_key(row)[0], case_key(row)[1]) for row in served}
    total_revenue = _positive_actual(scoreable)

    def share(numerator: float, denominator: float) -> float | None:
        return _rounded(numerator / denominator) if denominator > 0 else None

    def top_share(field: str) -> float | None:
        denominator_rows = [row for row in scoreable if bool(row.get("strata", {}).get(field))]
        numerator_rows = [row for row in served if bool(row.get("strata", {}).get(field))]
        return share(_positive_actual(numerator_rows), _positive_actual(denominator_rows))

    reasons: dict[str, dict[str, Any]] = {}
    for reason in sorted({str(row.get("abstentionReason")) for row in abstained}):
        group = [row for row in abstained if str(row.get("abstentionReason")) == reason]
        reasons[reason] = {
            "caseCount": len(group),
            "uniqueWorkCount": len({case_key(row)[0] for row in group}),
            "actualRevenueShare": share(_positive_actual(group), total_revenue),
        }
    return {
        "scoreableCaseCount": len(scoreable),
        "servedCaseCount": len(served),
        "servedWorkShare": share(float(len(served_blocks)), float(len(scoreable_blocks))),
        "servedActualRevenueShare": share(_positive_actual(served), total_revenue),
        "top1ServedRevenueShare": top_share("top_1_percent"),
        "top5ServedRevenueShare": top_share("top_5_percent"),
        "top10ServedRevenueShare": top_share("top_10_percent"),
        "abstainedCaseCount": len(abstained),
        "abstainedWorkCount": len({case_key(row)[0] for row in abstained}),
        "abstainedActualRevenueShare": share(_positive_actual(abstained), total_revenue),
        "highValueAbstainedWorkCount": len(
            {
                case_key(row)[0]
                for row in abstained
                if bool(row.get("strata", {}).get("high_value"))
            }
        ),
        "abstentionReasonDistribution": reasons,
    }


def end_to_end_business_loss(rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    selected = [row for row in rows if row.get("statisticallyScoreable") is True]
    predictions = [
        0.0 if row.get("servedPrediction") is None else float(row["servedPrediction"])
        for row in selected
    ]
    actuals = [float(row["actual"]) for row in selected]
    return {
        "value": _rounded(base.wape(predictions, actuals)),
        "caseCount": len(selected),
        "classification": "business_coverage_loss_not_model_wape",
        "mayBeNamedModelWape": False,
    }


def score_populations(rows: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    return {
        "allScoreableModelMetrics": all_scoreable_metrics(rows),
        "servedCohortMetrics": served_cohort_metrics(rows),
        "abstentionMetrics": abstention_metrics(rows),
        "endToEndBusinessLoss": end_to_end_business_loss(rows),
    }


def select_equivalent_comparator(
    metrics_by_model: Mapping[str, Mapping[str, Any]],
    bootstrap_vs_best: Mapping[str, Mapping[str, Any]],
    complexity_order: Sequence[str] = ("B1", "B2", "B3", "B0b"),
) -> dict[str, Any]:
    wapes: dict[str, float] = {}
    for model in BASELINE_IDS:
        value = _finite(metrics_by_model.get(model, {}).get("wape"))
        if value is None:
            raise ScoringContractError(f"{model} has no numeric all-scoreable WAPE")
        wapes[model] = value
    provisional = min(BASELINE_IDS, key=lambda model: (wapes[model], BASELINE_IDS.index(model)))
    best = wapes[provisional]
    evidence: dict[str, dict[str, Any]] = {}
    equivalent: list[str] = []
    for model in BASELINE_IDS:
        denominator = min(wapes[model], best)
        relative = abs(wapes[model] - best) / denominator if denominator > 0 else 0.0
        bootstrap = bootstrap_vs_best.get(model, {}) or {}
        lower = _finite(bootstrap.get("percentileLower"))
        upper = _finite(bootstrap.get("percentileUpper"))
        if model == provisional and (lower is None or upper is None):
            lower = upper = 0.0
        if lower is None or upper is None:
            raise ScoringContractError(f"{model} bootstrap CI is unavailable")
        ci_contains_zero = lower <= 0 <= upper
        is_equivalent = relative < 0.01 or ci_contains_zero
        if is_equivalent:
            equivalent.append(model)
        evidence[model] = {
            "wape": _rounded(wapes[model]),
            "relativeDifferenceVsProvisionalBest": _rounded(relative),
            "pairedCiLower": _rounded(lower),
            "pairedCiUpper": _rounded(upper),
            "pairedCiContainsZero": ci_contains_zero,
            "statisticallyEquivalent": is_equivalent,
        }
    selected = next(model for model in complexity_order if model in equivalent)
    return {
        "provisionalBest": provisional,
        "equivalentBaselineIds": equivalent,
        "complexityOrderSimplestFirst": list(complexity_order),
        "lockedComparator": selected,
        "evidence": evidence,
        "B0aParticipated": False,
    }


def synthetic_self_test(contract: ScoringContract | None = None) -> dict[str, Any]:
    contract = contract or load_contract()
    work = {
        "standard_work_id": "SYNTHETIC-1",
        "channels": [
            {
                "channel_key": "SYNTHETIC-CHANNEL",
                "business_form": "synthetic",
                "first_observed_month": "2019-01",
                "monthly": {"2019-01": 1.0},
            }
        ],
    }
    base_row = {
        "model_id": "B1",
        "case_key": {
            "standard_work_id": "SYNTHETIC-1",
            "origin": "2020-12",
            "horizon_months": 3,
            "route": "pure_sales_share",
        },
        "target_end": "2021-03",
        "label_available_as_of": "2021-03",
        "_residual_case_role": "development_forward_score",
        "_raw_model_prediction": 10.0,
        "_raw_annual_breakdown": [{"year": 2021, "value": 10.0}],
        "actual": 8.0,
        "strata": {
            "high_value": True,
            "top_1_percent": True,
            "top_5_percent": True,
            "top_10_percent": True,
        },
        "confidence": "medium",
        "limitation": [],
    }
    served = annotate_case_states(base_row, work, contract)
    unresolved_input = copy.deepcopy(base_row)
    unresolved_input["case_key"]["route"] = "unknown_revenue_model"
    unresolved_input["_raw_model_prediction"] = 6.0
    unresolved_input["actual"] = 4.0
    unresolved = annotate_case_states(unresolved_input, work, contract)
    rows = [served, unresolved]
    all_metrics = all_scoreable_metrics(rows)
    served_metrics = served_cohort_metrics(rows)
    abstention = abstention_metrics(rows)
    future_work = copy.deepcopy(work)
    future_work["channels"][0]["monthly"]["2025-01"] = 999999.0
    future = annotate_case_states(base_row, future_work, contract)
    selected = select_equivalent_comparator(
        {
            "B0b": {"wape": 0.501},
            "B1": {"wape": 0.504},
            "B2": {"wape": 0.7},
            "B3": {"wape": 0.5},
        },
        {
            "B0b": {"percentileLower": -0.01, "percentileUpper": 0.02},
            "B1": {"percentileLower": 0.001, "percentileUpper": 0.02},
            "B2": {"percentileLower": 0.1, "percentileUpper": 0.3},
            "B3": {"percentileLower": 0.0, "percentileUpper": 0.0},
        },
    )
    checks = {
        "contractBound": contract.amendment_digest == FROZEN_AMENDMENT_DIGEST,
        "statesIndependent": served["statisticallyScoreable"]
        and unresolved["statisticallyScoreable"]
        and not unresolved["businessServingEligible"]
        and unresolved["modelPredictionAvailable"],
        "rawRetainedForAbstention": unresolved["rawModelPrediction"] == 6.0
        and unresolved["servedPrediction"] is None,
        "noNullToZeroInModelWape": all_metrics["predictedTotal"] == 16.0
        and served_metrics["predictedTotal"] == 10.0
        and all_metrics["zeroImputationUsed"] is False,
        "abstentionReported": abstention["abstainedCaseCount"] == 1,
        "futurePerturbationInvariant": all(
            served[key] == future[key]
            for key in (
                "statisticallyScoreable",
                "businessServingEligible",
                "rawModelPrediction",
                "servedPrediction",
                "abstentionReason",
            )
        ),
        "simplestEquivalentTieBreak": selected["lockedComparator"] == "B1",
        "B0aExcluded": selected["B0aParticipated"] is False,
    }
    if not all(checks.values()):
        raise ScoringContractError(f"synthetic scoring checks failed: {checks}")
    return {
        "ok": True,
        "checks": checks,
        "baseSpecDigest": contract.base_digest,
        "amendmentDigest": contract.amendment_digest,
    }


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--validate-contract", action="store_true")
    modes.add_argument("--self-test", action="store_true")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        contract = load_contract()
        result = synthetic_self_test(contract) if args.self_test else {
            "ok": True,
            "baseDigest": contract.base_digest,
            "amendmentDigest": contract.amendment_digest,
            "combinedDigest": contract.combined_digest,
        }
        print(json.dumps(result, ensure_ascii=False, sort_keys=True))
        return 0
    except (ScoringContractError, AssertionError, KeyError, ValueError) as exc:
        print(json.dumps({"ok": False, "reason": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())


__all__ = [
    "BASELINE_IDS",
    "ScoringContract",
    "ScoringContractError",
    "abstention_metrics",
    "all_scoreable_metrics",
    "annotate_case_states",
    "case_key",
    "end_to_end_business_loss",
    "first_observed_source_month",
    "load_contract",
    "score_populations",
    "select_equivalent_comparator",
    "served_cohort_metrics",
    "synthetic_self_test",
]
