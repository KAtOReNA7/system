#!/usr/bin/env python3
"""Freeze and audit the M2 formal-cash target without training C2-R.1.

The synthetic preflight has no private-data or database dependency.  The audit
mode reads the already verified, Git-ignored local Phase A evidence and model
input cache in read-only mode.  It never rebuilds those inputs and never opens
the final holdout, embargo shadow, or deferred 60-month labels.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any, Mapping, Sequence

import m2_calibration_v1 as base
import m2_calibration_v1_2 as v12
import m2_formal_cash_target_v1 as cash
import run_m2_c1_failure_forensic as forensic
import run_m2_calibration_baseline_replay as legacy


ROOT = Path(__file__).resolve().parents[2]
PUBLIC_DIR = ROOT / "docs" / "analysis" / "m2-real-data"
TARGET_JSON = PUBLIC_DIR / "M2-C2R1-formal-cash-target-separation-v1.json"
TARGET_MD = PUBLIC_DIR / "M2-C2R1-formal-cash-target-separation-v1.md"
COMMITMENT_JSON = PUBLIC_DIR / "M2-C2R1-buyout-commitment-as-of-audit-v1.json"
COMMITMENT_MD = PUBLIC_DIR / "M2-C2R1-buyout-commitment-as-of-audit-v1.md"
BRIDGE_JSON = PUBLIC_DIR / "M2-C2R1-old-target-new-target-bridge-v1.json"
BRIDGE_MD = PUBLIC_DIR / "M2-C2R1-old-target-new-target-bridge-v1.md"
BRANCH = "codex/m2-calibration-v1"
MINIMUM_CELL = 10
EXPECTED_DEVELOPMENT_CASES = 18615
EXPECTED_SCOREABLE_CASES = 12223
AGGREGATE_TOLERANCE = 0.000001
GATE_A_JSON = PUBLIC_DIR / "M2-calibration-gate-a-v1.json"
DATA_LOAD_CALLS = 0


class FormalCashCorrectionError(RuntimeError):
    """The formal-cash correction violated a frozen or sealed boundary."""


def progress(message: str) -> None:
    print(f"[M2 formal cash] {message}", file=sys.stderr, flush=True)


def run_git(*args: str) -> str:
    process = subprocess.run(
        ["git", *args], cwd=ROOT, capture_output=True, text=True, check=False
    )
    if process.returncode != 0:
        raise FormalCashCorrectionError(process.stderr.strip() or "git command failed")
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


def rounded(value: Any, places: int = 8) -> float:
    number = float(value)
    if not math.isfinite(number):
        raise FormalCashCorrectionError("public aggregate is not finite")
    return round(number, places)


def money(value: Any) -> float:
    return rounded(value, 2)


def ratio(numerator: float, denominator: float) -> float | None:
    return rounded(numerator / denominator) if denominator else None


def digest(value: Any) -> str:
    return hashlib.sha256(base.canonical_json_bytes(value)).hexdigest()


def case_key(row: Mapping[str, Any]) -> tuple[str, str, int, str]:
    return v12.strict_case_key(row)


def synthetic_buyout_work(*, committed: bool) -> dict[str, Any]:
    months = {month: 0.0 for month in base.month_range("2018-01", "2020-12")}
    for month in ("2018-01", "2019-01", "2020-01"):
        months[month] = 1200.0
    work: dict[str, Any] = {
        "standard_work_id": "SYNTHETIC-BUYOUT",
        "channels": [
            {
                "channel_key": "synthetic-buyout-channel",
                "business_form": "audio_copyright",
                "first_observed_month": "2018-01",
                "monthly": months,
                "batch_cluster_sizes": {
                    "2018-01": 3,
                    "2019-01": 3,
                    "2020-01": 3,
                },
            }
        ],
    }
    if committed:
        component = base.channel_component_key(work["channels"][0])
        work["cash_commitment_snapshots"] = [
            {
                "standard_work_id": "SYNTHETIC-BUYOUT",
                "commitment_id": "SYNTHETIC-COMMITMENT",
                "cash_type": "buyout_receivable",
                "status": "signed",
                "receivable_status": "outstanding",
                "confirmed_amount": 1200.0,
                "outstanding_amount": 1200.0,
                "expected_posting_month": "2020-01",
                "confirmed_as_of": "2019-12",
                "available_as_of": "2019-12",
                "evidence_ref": "synthetic-evidence",
            }
        ]
        work["authority_ledger_fact_registry"] = [
            {
                "standard_work_id": "SYNTHETIC-BUYOUT",
                "ledger_fact_key": "SYNTHETIC-LEDGER-FACT",
                "channel_component_key": component,
                "posting_month": "2020-01",
                "amount": 1200.0,
                "cash_type": "buyout_receivable",
            }
        ]
        work["cash_commitment_settlement_links"] = [
            {
                "standard_work_id": "SYNTHETIC-BUYOUT",
                "commitment_id": "SYNTHETIC-COMMITMENT",
                "ledger_fact_key": "SYNTHETIC-LEDGER-FACT",
                "cash_type": "buyout_receivable",
                "channel_component_key": component,
                "posting_month": "2020-01",
                "settlement_amount": 1200.0,
                "truth_available_as_of": "2020-12",
            }
        ]
    return work


def synthetic_preflight() -> dict[str, Any]:
    """Exercise the new semantics without reading any local private role."""

    spec = base.load_spec()
    amendment = cash.load_spec()
    origin = "2019-12"
    horizon = 12
    work_id = "SYNTHETIC-BUYOUT"
    commitment = {
        "standard_work_id": work_id,
        "commitment_id": "SYNTHETIC-COMMITMENT",
        "cash_type": "buyout_receivable",
        "status": "confirmed",
        "receivable_status": "outstanding",
        "confirmed_amount": 1200.0,
        "outstanding_amount": 1200.0,
        "expected_posting_month": "2020-01",
        "confirmed_as_of": origin,
        "available_as_of": origin,
        "evidence_ref": "synthetic-evidence",
    }
    pure_abstained = cash.compose_future_cash_forecast(
        standard_work_id=work_id,
        route="pure_buyout",
        origin=origin,
        horizon=horizon,
        sales_monthly_prediction=None,
        cash_commitment_snapshots=[],
        statistically_scoreable=True,
        business_serving_eligible=True,
    )
    pure_committed = cash.compose_future_cash_forecast(
        standard_work_id=work_id,
        route="pure_buyout",
        origin=origin,
        horizon=horizon,
        sales_monthly_prediction=None,
        cash_commitment_snapshots=[commitment],
        statistically_scoreable=True,
        business_serving_eligible=True,
    )
    mixed = cash.compose_future_cash_forecast(
        standard_work_id=work_id,
        route="buyout_plus_sales",
        origin=origin,
        horizon=horizon,
        sales_monthly_prediction={"2020-01": 100.0, "2020-02": 50.0},
        cash_commitment_snapshots=[commitment],
        statistically_scoreable=True,
        business_serving_eligible=True,
    )
    pure_sales_with_buyout = cash.compose_future_cash_forecast(
        standard_work_id=work_id,
        route="pure_sales_share",
        origin=origin,
        horizon=horizon,
        sales_monthly_prediction={"2020-01": 100.0},
        cash_commitment_snapshots=[commitment],
        statistically_scoreable=True,
        business_serving_eligible=True,
    )
    business_blocked = cash.compose_future_cash_forecast(
        standard_work_id=work_id,
        route="pure_sales_share",
        origin=origin,
        horizon=horizon,
        sales_monthly_prediction={"2020-01": 100.0},
        cash_commitment_snapshots=[],
        statistically_scoreable=True,
        business_serving_eligible=False,
        business_abstention_reason="synthetic_business_block",
    )
    late = copy.deepcopy(commitment)
    late["available_as_of"] = "2020-01"
    late_result = cash.compose_future_cash_forecast(
        standard_work_id=work_id,
        route="pure_buyout",
        origin=origin,
        horizon=horizon,
        sales_monthly_prediction=None,
        cash_commitment_snapshots=[late],
        statistically_scoreable=True,
        business_serving_eligible=True,
    )
    missing_timestamp = copy.deepcopy(commitment)
    missing_timestamp.pop("confirmed_as_of")
    missing_result = cash.compose_future_cash_forecast(
        standard_work_id=work_id,
        route="pure_buyout",
        origin=origin,
        horizon=horizon,
        sales_monthly_prediction=None,
        cash_commitment_snapshots=[missing_timestamp],
        statistically_scoreable=True,
        business_serving_eligible=True,
    )
    other_cash_only = copy.deepcopy(commitment)
    other_cash_only["cash_type"] = "other_confirmed_cash"
    other_cash_result = cash.compose_future_cash_forecast(
        standard_work_id=work_id,
        route="pure_buyout",
        origin=origin,
        horizon=horizon,
        sales_monthly_prediction=None,
        cash_commitment_snapshots=[other_cash_only],
        statistically_scoreable=True,
        business_serving_eligible=True,
    )
    outside_horizon = copy.deepcopy(commitment)
    outside_horizon["expected_posting_month"] = "2021-01"
    outside_horizon_result = cash.compose_future_cash_forecast(
        standard_work_id=work_id,
        route="pure_buyout",
        origin=origin,
        horizon=3,
        sales_monthly_prediction=None,
        cash_commitment_snapshots=[outside_horizon],
        statistically_scoreable=True,
        business_serving_eligible=True,
    )
    inverted = copy.deepcopy(commitment)
    inverted["confirmed_as_of"] = "2020-01"
    inverted_result = cash.compose_future_cash_forecast(
        standard_work_id=work_id,
        route="pure_buyout",
        origin=origin,
        horizon=horizon,
        sales_monthly_prediction=None,
        cash_commitment_snapshots=[inverted],
        statistically_scoreable=True,
        business_serving_eligible=True,
    )

    # Adding arbitrary future-only evidence must not change any cutoff output,
    # including internal prediction metadata.
    future_only = copy.deepcopy(commitment)
    future_only.update(
        {
            "commitment_id": "FUTURE-ONLY",
            "available_as_of": "2022-01",
            "confirmed_as_of": "2022-01",
            "confirmed_amount": 99999999.0,
            "expected_posting_month": "2020-02",
            "evidence_ref": "future-only-evidence",
        }
    )
    invariant_before = cash.compose_future_cash_forecast(
        standard_work_id=work_id,
        route="pure_buyout",
        origin=origin,
        horizon=horizon,
        sales_monthly_prediction=None,
        cash_commitment_snapshots=[commitment],
        statistically_scoreable=True,
        business_serving_eligible=True,
    )
    invariant_after = cash.compose_future_cash_forecast(
        standard_work_id=work_id,
        route="pure_buyout",
        origin=origin,
        horizon=horizon,
        sales_monthly_prediction=None,
        cash_commitment_snapshots=[commitment, future_only],
        statistically_scoreable=True,
        business_serving_eligible=True,
    )

    no_commitment_work = synthetic_buyout_work(committed=False)
    committed_work = synthetic_buyout_work(committed=True)
    no_commitment_route = base.route_work_as_of(no_commitment_work, origin, spec)["route"]
    committed_route = base.route_work_as_of(committed_work, origin, spec)["route"]
    no_commitment_actual = cash.build_formal_cash_actuals(
        no_commitment_work,
        origin,
        horizon,
        no_commitment_route,
        spec,
        label_available_as_of="2020-12",
    )
    committed_actual = cash.build_formal_cash_actuals(
        committed_work,
        origin,
        horizon,
        committed_route,
        spec,
        label_available_as_of="2020-12",
    )
    equivalent = cash.buyout_monthly_equivalent_context(100.0)
    public_fields = set(amendment["publicOutput"]["allowedFields"])
    checks = {
        "pureBuyoutWithoutCommitmentAbstains": pure_abstained["routeAbstained"] is True,
        "pureBuyoutWithoutCommitmentRawIsNull": pure_abstained["rawModelPrediction"] is None,
        "pureBuyoutWithoutCommitmentServedIsNull": pure_abstained["servedPrediction"] is None,
        "pureBuyoutWithoutCommitmentIsNotZero": pure_abstained["futureCashRevenueForecast"] is None,
        "pureBuyoutAbstentionReasonExact": pure_abstained["abstentionReason"]
        == "uncommitted_future_buyout_not_forecastable",
        "cutoffCommitmentIncludedAtExpectedMonth": pure_committed["rawModelPrediction"]
        == 1200.0
        and pure_committed["annualBreakdown"] == [{"year": "2020", "amount": 1200.0}],
        "mixedUsesAddition": mixed["rawModelPrediction"] == 1350.0,
        "mixedExcludesUncommittedBuyout": mixed["excludesUncommittedFutureBuyout"] is True
        and mixed["futureBuyoutPredicted"] is False,
        "pureSalesIncludesConfirmedBuyoutAndFlagsRouteReview": (
            pure_sales_with_buyout["rawModelPrediction"] == 1300.0
            and "cutoff_confirmed_buyout_requires_route_review"
            in pure_sales_with_buyout["limitation"]
        ),
        "pureBuyoutOtherCashOnlyStillAbstains": other_cash_result[
            "rawModelPrediction"
        ]
        is None,
        "knownBuyoutOutsideHorizonIsNumericZero": outside_horizon_result[
            "rawModelPrediction"
        ]
        == 0.0
        and outside_horizon_result["modelPredictionAvailable"] is True,
        "confirmationAvailabilityOrderEnforced": inverted_result[
            "rawModelPrediction"
        ]
        is None,
        "businessBlockedKeepsRawAndNullsServed": business_blocked["rawModelPrediction"]
        == 100.0
        and business_blocked["servedPrediction"] is None,
        "lateEvidenceCannotBackfill": late_result["rawModelPrediction"] is None,
        "missingTimestampCannotBackfill": missing_result["rawModelPrediction"] is None,
        "futurePerturbationInvariant": cash.canonical_digest(invariant_before)
        == cash.canonical_digest(invariant_after),
        "buyoutEquivalentHasFourHardBoundaryFlags": all(
            equivalent[field] is True
            for field in (
                "ratingContextOnly",
                "historicalValueOnly",
                "notCashForecast",
                "notIncludedInFutureCashRevenue",
            )
        ),
        "noCommitmentActualBecomesSurprise": no_commitment_actual[
            "forecastableCashActual"
        ]
        == 0.0
        and no_commitment_actual["uncommittedBuyoutSurpriseActual"] == 1200.0
        and no_commitment_actual["totalLedgerCashActual"] == 1200.0,
        "committedSettlementBecomesForecastable": committed_actual[
            "forecastableCashActual"
        ]
        == 1200.0
        and committed_actual["uncommittedBuyoutSurpriseActual"] == 0.0,
        "actualPartitionConserves": all(
            item["amountConservationDifference"] == 0.0
            for item in (no_commitment_actual, committed_actual)
        ),
        "publicFieldsExact": set(pure_abstained["public_output"]) == public_fields,
        "publicHasNoIntervalOrScenarioEndpoints": not (
            {"optimistic", "pessimistic", "high", "base", "low", "lower", "upper"}
            & set(pure_abstained["public_output"])
        ),
        "eligibilityAndScoreabilityNotRewritten": pure_abstained[
            "statisticallyScoreable"
        ]
        is True
        and pure_abstained["businessServingEligible"] is True,
        "noFutureBuyoutProbabilityModel": amendment["routeOverrides"][
            "buyout_plus_sales"
        ]["futureBuyoutOccurrenceModelAllowed"]
        is False,
        "noDefault36MonthCashForecast": amendment["routeOverrides"]["pure_buyout"][
            "default36MonthCycleForecastAllowed"
        ]
        is False,
        "noReceivedCashAmortization": amendment["routeOverrides"]["pure_buyout"][
            "alreadyReceivedCashAmortizationAllowed"
        ]
        is False,
        "allSealsClosed": all(value is False for value in amendment["seals"].values()),
    }
    return {
        "schema": "m2.formal_cash_target.synthetic_preflight.v1",
        "status": "passed" if all(checks.values()) else "failed",
        "privateDataRead": False,
        "databaseRead": False,
        "C2R1TrainingStarted": False,
        "amendmentDigest": cash.canonical_digest(amendment),
        "checks": checks,
    }


def require_audit_boundary() -> None:
    if run_git("branch", "--show-current") != BRANCH:
        raise FormalCashCorrectionError(f"formal-cash audit must run on {BRANCH}")
    amendment = cash.load_spec()
    if any(value is not False for value in amendment["seals"].values()):
        raise FormalCashCorrectionError("a formal-cash seal is open")


def load_audit_cases() -> tuple[list[dict[str, Any]], dict[str, Any]]:
    global DATA_LOAD_CALLS
    require_audit_boundary()
    amendment = cash.load_spec()
    spec = base.load_spec()
    progress("verifying frozen Phase A case evidence")
    DATA_LOAD_CALLS += 1
    phase_evidence = forensic.load_phase_a_evidence()
    rows = [
        row
        for row in phase_evidence["rows"]
        if row.get("model_id") == "B4"
        and str(row.get("_residual_case_role", "")).startswith(
            "development_forward_score:"
        )
    ]
    keys = [case_key(row) for row in rows]
    if len(rows) != EXPECTED_DEVELOPMENT_CASES or len(set(keys)) != len(rows):
        raise FormalCashCorrectionError("frozen development case universe differs")
    scoreable_rows = [row for row in rows if row.get("statisticallyScoreable") is True]
    if len(scoreable_rows) != EXPECTED_SCOREABLE_CASES:
        raise FormalCashCorrectionError("frozen scoreable case universe differs")

    progress("loading the verified authority adapter in read-only mode")
    DATA_LOAD_CALLS += 1
    works_list, _posthoc, input_evidence = legacy.load_authorized_works(spec)
    gate_a = json.loads(GATE_A_JSON.read_text(encoding="utf-8"))
    frozen_input_fingerprint = gate_a.get("evidenceBindings", {}).get(
        "inputFingerprint"
    )
    if (
        not isinstance(frozen_input_fingerprint, str)
        or input_evidence.get("inputFingerprint") != frozen_input_fingerprint
    ):
        raise FormalCashCorrectionError(
            "authority input fingerprint differs from frozen Gate A"
        )
    works = {str(work["standard_work_id"]): work for work in works_list}
    if len(works) != int(amendment["authority"]["standardWorkCount"]):
        raise FormalCashCorrectionError("authority work count differs")
    unauthorized_roles = (
        "cash_commitment_snapshots",
        "cash_commitment_settlement_links",
        "authority_ledger_fact_registry",
    )
    if any(
        role in work for work in works.values() for role in unauthorized_roles
    ):
        raise FormalCashCorrectionError(
            "an unbound formal-cash evidence role appeared in the authority adapter"
        )

    cases: list[dict[str, Any]] = []
    for index, row in enumerate(rows, start=1):
        key = case_key(row)
        work = works.get(key[0])
        if work is None:
            raise FormalCashCorrectionError("frozen case work is outside authority scope")
        label_available_as_of = row.get("label_available_as_of")
        actuals = cash.build_formal_cash_actuals(
            work,
            key[1],
            key[2],
            key[3],
            spec,
            label_available_as_of=str(label_available_as_of),
        )
        if actuals["target_end"] != str(row.get("target_end")):
            raise FormalCashCorrectionError("new target end differs from frozen case")
        old_actual = base.require_finite_number(row.get("actual"), "old target actual")
        route_abstained = key[3] in {"pure_buyout", "unknown_revenue_model"}
        abstention_reason = (
            "uncommitted_future_buyout_not_forecastable"
            if key[3] == "pure_buyout"
            else "unknown_revenue_model"
            if key[3] == "unknown_revenue_model"
            else None
        )
        cases.append(
            {
                "key": key,
                "statisticallyScoreable": row.get("statisticallyScoreable") is True,
                "businessServingEligible": row.get("businessServingEligible") is True,
                "modelPredictionAvailable": False if route_abstained else None,
                "routeAbstained": route_abstained,
                "abstentionReason": abstention_reason,
                "rawModelPrediction": None,
                "servedPrediction": None,
                "oldTargetActual": old_actual,
                **actuals,
            }
        )
        if index % 3000 == 0:
            progress(f"partitioned {index}/{len(rows)} frozen case windows")

    evidence = {
        "amendmentDigest": cash.canonical_digest(amendment),
        "phaseACheckpoint": phase_evidence["frozenCheckpoint"],
        "phaseACaseEvidenceSha256": phase_evidence["caseEvidenceSha256"],
        "authorityInputFingerprint": input_evidence["inputFingerprint"],
        "frozenGateAInputFingerprint": frozen_input_fingerprint,
        "authorityInputFingerprintMatchesGateA": True,
        "authorityWorkCount": input_evidence["standardWorkCount"],
        "authorityIncomeFactCount": input_evidence["incomeFactCount"],
        "authorityCompleteIncomeFactCount": input_evidence["completeIncomeFactCount"],
        "databaseRead": input_evidence["databaseRead"],
        "modelInputCacheReadOnly": input_evidence["modelInputCacheReadOnly"],
        "dataLoadCalls": DATA_LOAD_CALLS,
    }
    return cases, evidence


def summarize_cases(cases: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    scoreable = [case for case in cases if case["statisticallyScoreable"]]
    old_total = sum(float(case["oldTargetActual"]) for case in scoreable)
    forecastable = sum(float(case["forecastableCashActual"]) for case in scoreable)
    surprise = sum(
        float(case["uncommittedBuyoutSurpriseActual"]) for case in scoreable
    )
    ledger = sum(float(case["totalLedgerCashActual"]) for case in scoreable)
    positive_surprise = [
        case
        for case in scoreable
        if float(case["uncommittedBuyoutSurpriseActual"]) > 0
    ]
    conservation_values = [
        abs(
            float(case["forecastableCashActual"])
            + float(case["uncommittedBuyoutSurpriseActual"])
            - float(case["totalLedgerCashActual"])
        )
        for case in cases
    ]
    aggregate_conservation = forecastable + surprise - ledger
    if max(conservation_values, default=0.0) > cash.CONSERVATION_TOLERANCE:
        raise FormalCashCorrectionError("per-case amount conservation failed")
    if abs(aggregate_conservation) > AGGREGATE_TOLERANCE:
        raise FormalCashCorrectionError("aggregate amount conservation failed")

    # The legacy target differs only on the pure-buyout route: it used the
    # historical-cycle target while the formal-cash target uses actual sales/
    # other cash and excludes the uncommitted buyout surprise.  Attribute the
    # bridge at that frozen route level instead of netting unrelated case rows.
    pure_buyout = [case for case in scoreable if case["key"][3] == "pure_buyout"]
    added = sum(float(case["forecastableCashActual"]) for case in pure_buyout)
    removed = sum(float(case["oldTargetActual"]) for case in pure_buyout)
    non_pure_net = sum(
        float(case["forecastableCashActual"]) - float(case["oldTargetActual"])
        for case in scoreable
        if case["key"][3] != "pure_buyout"
    )
    if abs(non_pure_net) > AGGREGATE_TOLERANCE:
        raise FormalCashCorrectionError("non-pure-buyout target changed unexpectedly")
    bridge_difference = forecastable - old_total
    bridge_balance = added - removed - bridge_difference
    if abs(bridge_balance) > AGGREGATE_TOLERANCE:
        raise FormalCashCorrectionError("old-to-new target bridge does not balance")

    route_groups: dict[str, list[Mapping[str, Any]]] = defaultdict(list)
    for case in scoreable:
        route_groups[str(case["key"][3])].append(case)
    route_cells: dict[str, dict[str, Any]] = {}
    for route in sorted(route_groups):
        group = route_groups[route]
        unique_work_count = len({case["key"][0] for case in group})
        route_cells[route] = {
            "suppressed": len(group) < MINIMUM_CELL
            or unique_work_count < MINIMUM_CELL,
            "caseWindowCount": len(group),
            "uniqueWorkCount": unique_work_count,
            "oldTargetAmount": money(sum(float(case["oldTargetActual"]) for case in group)),
            "forecastableCashAmount": money(
                sum(float(case["forecastableCashActual"]) for case in group)
            ),
            "surpriseBuyoutAmount": money(
                sum(float(case["uncommittedBuyoutSurpriseActual"]) for case in group)
            ),
            "totalLedgerCashAmount": money(
                sum(float(case["totalLedgerCashActual"]) for case in group)
            ),
        }
    suppressed = [route for route, cell in route_cells.items() if cell["suppressed"]]
    if len(suppressed) == 1 and len(route_cells) > 1:
        complement = min(
            (route for route in route_cells if route not in suppressed),
            key=lambda route: route_cells[route]["caseWindowCount"],
        )
        route_cells[complement]["suppressed"] = True
    for cell in route_cells.values():
        if cell["suppressed"]:
            for field in (
                "caseWindowCount",
                "uniqueWorkCount",
                "oldTargetAmount",
                "forecastableCashAmount",
                "surpriseBuyoutAmount",
                "totalLedgerCashAmount",
            ):
                cell[field] = None

    key_rows = [list(case["key"]) for case in sorted(cases, key=lambda item: item["key"])]
    state_rows = [
        {
            "key": list(case["key"]),
            "statisticallyScoreable": case["statisticallyScoreable"],
            "businessServingEligible": case["businessServingEligible"],
            "modelPredictionAvailable": case["modelPredictionAvailable"],
            "routeAbstained": case["routeAbstained"],
            "abstentionReason": case["abstentionReason"],
            "rawModelPredictionIsNull": case["rawModelPrediction"] is None,
            "servedPredictionIsNull": case["servedPrediction"] is None,
        }
        for case in sorted(cases, key=lambda item: item["key"])
    ]
    uncertain = [
        case for case in scoreable if case["actualClassificationUncertain"] is True
    ]
    negative = [
        case for case in scoreable if float(case["negativeLedgerCashActual"]) < 0
    ]

    def protected_diagnostic(
        group: Sequence[Mapping[str, Any]], amount_field: str
    ) -> dict[str, Any]:
        unique_works = {case["key"][0] for case in group}
        suppressed = len(group) < MINIMUM_CELL or len(unique_works) < MINIMUM_CELL
        return {
            "present": bool(group),
            "suppressed": suppressed,
            "caseWindowCount": None if suppressed else len(group),
            "cashAmount": None
            if suppressed
            else money(sum(float(case[amount_field]) for case in group)),
        }

    return {
        "developmentCaseWindowCount": len(cases),
        "statisticallyScoreableCaseWindowCount": len(scoreable),
        # These complementary edge totals are deliberately suppressed.  When
        # combined with route cells, their exact values would reveal a small
        # revenue-model cell even though that cell is individually protected.
        "businessServingEligibleFrozenCaseWindowCount": None,
        "structurallyForecastableRouteCaseWindowCount": None,
        "routeAbstainedScoreableCaseWindowCount": None,
        "routeAbstainedScoreableActualRevenueShare": None,
        "caseStateEdgeTotalsSuppressed": True,
        "caseStateSuppressionReason": "complementary_disclosure_protection",
        "positiveSurpriseCaseWindowCount": len(positive_surprise),
        "oldTargetActual": money(old_total),
        "forecastableCashActual": money(forecastable),
        "uncommittedBuyoutSurpriseActual": money(surprise),
        "totalLedgerCashActual": money(ledger),
        "surpriseShareOfTotalLedgerCash": ratio(surprise, ledger),
        "formalForecastableCashAddedOnPureBuyoutCases": money(added),
        "legacyPureBuyoutTargetRemoved": money(removed),
        "nonPureBuyoutNetDifference": rounded(non_pure_net),
        "newMinusOldTarget": money(bridge_difference),
        "bridgeBalanceDifference": (
            0.0 if abs(bridge_balance) <= AGGREGATE_TOLERANCE else rounded(bridge_balance)
        ),
        "maximumPerCaseConservationDifference": rounded(
            max(conservation_values, default=0.0)
        ),
        "aggregateConservationDifference": (
            0.0
            if abs(aggregate_conservation) <= AGGREGATE_TOLERANCE
            else rounded(aggregate_conservation)
        ),
        "caseKeyFingerprint": digest(key_rows),
        "stateFingerprint": digest(state_rows),
        "routeDiagnostics": route_cells,
        "classificationUncertaintyAudit": protected_diagnostic(
            uncertain, "classificationUncertainCashActual"
        ),
        "negativeLedgerCashAudit": protected_diagnostic(
            negative, "negativeLedgerCashActual"
        ),
    }


def common_report_fields(evidence: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "version": "v1",
        "frozenAt": "2026-07-15T00:00:00+08:00",
        "language": "zh-CN",
        "decisionStatus": "not_for_formal_decision",
        "formalDecisionAuthorized": False,
        "releaseAuthorized": False,
        "C2R1TrainingStarted": False,
        "authorityInputsChanged": False,
        "eligibilityChanged": False,
        "evidenceBinding": dict(evidence),
        "seals": {
            "finalHoldoutOpened": False,
            "embargoShadowOpened": False,
            "deferred60MonthLabelsOpened": False,
        },
        "privacy": {
            "aggregateOnly": True,
            "deidentified": True,
            "minimumCellCount": MINIMUM_CELL,
            "workIdentifiersPresent": False,
            "channelIdentifiersPresent": False,
            "privatePathsPresent": False,
            "rawLedgerRowsPresent": False,
            "commitmentEvidenceReferencesPresent": False,
            "predictionIntervalEndpointsPresent": False,
        },
    }


def build_reports() -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    cases, evidence = load_audit_cases()
    summary = summarize_cases(cases)
    common = common_report_fields(evidence)
    target = {
        "schema": "m2.c2r1.formal_cash_target_separation.public.v1",
        **common,
        "reportTitle": "M2 C2-R.1 正式现金目标拆分审计 v1",
        "scope": {
            "standardWorkCount": evidence["authorityWorkCount"],
            "incomeFactCount": evidence["authorityIncomeFactCount"],
            "developmentCaseWindowCount": summary["developmentCaseWindowCount"],
            "statisticallyScoreableCaseWindowCount": summary[
                "statisticallyScoreableCaseWindowCount"
            ],
            "overlappingCaseWindowAmountsAreNotUniqueLedgerTotals": True,
        },
        "formalTarget": {
            "field": "futureCashRevenueForecast",
            "formula": "future_sales_cash_plus_cutoff_confirmed_future_receivables",
            "uncommittedFutureBuyoutIncluded": False,
            "historicalCycleBuyoutIncluded": False,
            "futureBuyoutProbabilityModelIncluded": False,
            "receivedBuyoutAmortizationIncluded": False,
            "buyoutMonthlyEquivalentIncluded": False,
        },
        "backtestTarget": {
            "primaryActualField": "forecastableCashActual",
            "surpriseAuditField": "uncommittedBuyoutSurpriseActual",
            "endToEndField": "totalLedgerCashActual",
            "totalLedgerGapMayBeNamedModelWape": False,
        },
        "developmentActualAudit": {
            key: summary[key]
            for key in (
                "forecastableCashActual",
                "uncommittedBuyoutSurpriseActual",
                "totalLedgerCashActual",
                "positiveSurpriseCaseWindowCount",
                "surpriseShareOfTotalLedgerCash",
            )
        },
        "businessImpact": {
            "surpriseExcludedFromPrimaryModelMetricsAndGates": True,
            "surpriseIncludedInEndToEndBusinessGap": True,
            "overlappingCaseWindowSurpriseShareOfLedgerCash": summary[
                "surpriseShareOfTotalLedgerCash"
            ],
            "pureBuyoutWithoutCutoffCommitmentRouteAbstains": True,
            "amountsAreOverlappingCaseWindowsNotUniqueLedgerTotals": True,
        },
        "caseStateAudit": {
            "scoreabilityDefinitionChanged": False,
            "businessServingEligibilityDefinitionChanged": False,
            "businessServingEligibleFrozenCaseWindowCount": summary[
                "businessServingEligibleFrozenCaseWindowCount"
            ],
            "structurallyForecastableRouteCaseWindowCount": summary[
                "structurallyForecastableRouteCaseWindowCount"
            ],
            "routeAbstainedScoreableCaseWindowCount": summary[
                "routeAbstainedScoreableCaseWindowCount"
            ],
            "routeAbstainedScoreableActualRevenueShare": summary[
                "routeAbstainedScoreableActualRevenueShare"
            ],
            "edgeTotalsSuppressed": summary["caseStateEdgeTotalsSuppressed"],
            "suppressionReason": summary["caseStateSuppressionReason"],
            "nullPredictionMayBeScoredAsZero": False,
            "routeAbstainedRawAndServedPredictionsAreNull": True,
            "salesRouteCandidatePredictionsRecomputed": False,
        },
        "classificationDiagnostics": {
            "uncertainCash": summary["classificationUncertaintyAudit"],
            "negativeLedgerCash": summary["negativeLedgerCashAudit"],
            "classifierEvidenceAcceptedAsCommitmentEvidence": False,
        },
        "conservation": {
            "caseKeysMatchFrozenDevelopmentUniverse": True,
            "eligibilityMatchesFrozenDevelopmentUniverse": True,
            "caseKeyFingerprint": summary["caseKeyFingerprint"],
            "stateFingerprint": summary["stateFingerprint"],
            "maximumPerCaseAmountDifference": summary[
                "maximumPerCaseConservationDifference"
            ],
            "aggregateAmountDifference": summary["aggregateConservationDifference"],
        },
        "metricStatus": {
            "C2R1CandidateMetricsComputed": False,
            "reason": "本轮只修正目标语义、路由和实际值；尚未重新训练或调参。",
        },
    }
    commitment = {
        "schema": "m2.c2r1.buyout_commitment_as_of_audit.public.v1",
        **common,
        "reportTitle": "M2 C2-R.1 买断承诺 as-of 审计 v1",
        "currentAuthorityAudit": {
            "cashCommitmentSnapshotRoleAvailable": False,
            "cashCommitmentSettlementLinkRoleAvailable": False,
            "authorityLedgerFactRegistryRoleAvailable": False,
            "auditableCutoffCommitmentCount": 0,
            "replayAdapterWorkCountWithCommitmentSnapshot": 0,
            "requiredFieldsAvailable": {
                field: False
                for field in (
                    "standardWorkIdentity",
                    "commitmentIdentity",
                    "cashType",
                    "status",
                    "receivableStatus",
                    "confirmedAmount",
                    "outstandingAmount",
                    "expectedPostingMonth",
                    "confirmedAsOf",
                    "availableAsOf",
                    "evidenceReference",
                )
            },
            "ledgerOccurrenceAloneAcceptedAsCommitment": False,
            "businessFormAloneAcceptedAsCommitment": False,
            "classifierEventAloneAcceptedAsCommitment": False,
            "postHocCommitmentRestorationUsed": False,
        },
        "historicalEvidenceConclusion": {
            "laterBuyoutMustBeSurpriseWhenTimestampMissing": True,
            "classifierDerivedPositiveSurpriseCaseWindowCount": summary[
                "positiveSurpriseCaseWindowCount"
            ],
            "classifierDerivedSurpriseAmount": summary[
                "uncommittedBuyoutSurpriseActual"
            ],
            "classifierDerivedSurpriseShareOfTotalLedgerCash": summary[
                "surpriseShareOfTotalLedgerCash"
            ],
            "classificationIsDiagnosticNotContractEvidence": True,
        },
        "futureRequiredAuthorizedRole": {
            "role": "cash_commitment_snapshots",
            "truthLinkRole": "cash_commitment_settlement_links",
            "authorityFactRegistryRole": "authority_ledger_fact_registry",
            "mayBeFabricatedFromLedger": False,
            "absenceBehavior": "uncommitted_future_buyout_not_forecastable",
        },
        "businessImpact": {
            "surpriseExcludedFromPrimaryModelMetricsAndGates": True,
            "surpriseIncludedInEndToEndBusinessGap": True,
            "overlappingCaseWindowSurpriseShareOfLedgerCash": summary[
                "surpriseShareOfTotalLedgerCash"
            ],
            "pureBuyoutWithoutCutoffCommitmentRouteAbstains": True,
        },
    }
    bridge = {
        "schema": "m2.c2r1.old_target_new_target_bridge.public.v1",
        **common,
        "reportTitle": "M2 C2-R.1 旧目标到正式现金目标桥接 v1",
        "population": {
            "developmentCaseWindowCount": summary["developmentCaseWindowCount"],
            "statisticallyScoreableCaseWindowCount": summary[
                "statisticallyScoreableCaseWindowCount"
            ],
            "sameCaseKeys": True,
            "sameScoreabilityAndEligibility": True,
            "oldAndNewActualValuesExpectedToDiffer": True,
            "overlappingCaseWindowAmountsAreNotUniqueLedgerTotals": True,
        },
        "amountBridge": {
            "oldTargetActual": summary["oldTargetActual"],
            "newForecastableCashActual": summary["forecastableCashActual"],
            "uncommittedBuyoutSurpriseActual": summary[
                "uncommittedBuyoutSurpriseActual"
            ],
            "totalLedgerCashActual": summary["totalLedgerCashActual"],
            "formalForecastableCashAddedOnPureBuyoutCases": summary[
                "formalForecastableCashAddedOnPureBuyoutCases"
            ],
            "legacyPureBuyoutTargetRemoved": summary[
                "legacyPureBuyoutTargetRemoved"
            ],
            "nonPureBuyoutNetDifference": summary["nonPureBuyoutNetDifference"],
            "newMinusOldTarget": summary["newMinusOldTarget"],
            "bridgeBalanceDifference": summary["bridgeBalanceDifference"],
        },
        "amountConservation": {
            "formula": "forecastableCashActual + uncommittedBuyoutSurpriseActual = totalLedgerCashActual",
            "maximumPerCaseDifference": summary[
                "maximumPerCaseConservationDifference"
            ],
            "aggregateDifference": summary["aggregateConservationDifference"],
            "passed": True,
        },
        "routeDiagnostics": summary["routeDiagnostics"],
        "businessImpact": {
            "surpriseExcludedFromPrimaryModelMetricsAndGates": True,
            "surpriseIncludedInEndToEndBusinessGap": True,
            "overlappingCaseWindowSurpriseShareOfLedgerCash": summary[
                "surpriseShareOfTotalLedgerCash"
            ],
            "legacyC2RRemainsHistoricalTargetEvidenceOnly": True,
        },
        "interpretation": {
            "legacyC2RResultsAreFormalCashMetrics": False,
            "allDifferenceAttributedToLeakageRemoval": False,
            "classifierDerivedBuyoutIsContractConfirmed": False,
            "C2R1MayCompareDirectlyBeforeTargetReplay": False,
        },
    }
    return target, commitment, bridge


def target_markdown(report: Mapping[str, Any]) -> str:
    audit = report["developmentActualAudit"]
    return f"""# M2 C2-R.1 正式现金目标拆分审计 v1

- 状态：`not_for_formal_decision`
- C2-R.1 训练：未开始
- final holdout / embargo / 60-month labels：全部 sealed

## 结论

正式点值已经冻结为“未来实销现金 + cutoff 时已确认且可审计的未来应收”。未承诺买断、历史周期推测、概率乘金额、已到账买断摊销和买断月均等效值均不进入正式现金预测。

历史 development 回测保持 {report['scope']['developmentCaseWindowCount']} 个原 case window，其中 statistically scoreable 为 {report['scope']['statisticallyScoreableCaseWindowCount']} 个。当前权威输入没有 as-of commitment 角色，因此纯买断无承诺 case 走 route abstention，null 不按 0 计分；既有 scoreability 和 business eligibility 未改写。

## 三套 actual（重叠 case-window 聚合，不是唯一账单总额）

| actual | 金额 |
|---|---:|
| forecastableCashActual | {audit['forecastableCashActual']:.2f} |
| uncommittedBuyoutSurpriseActual | {audit['uncommittedBuyoutSurpriseActual']:.2f} |
| totalLedgerCashActual | {audit['totalLedgerCashActual']:.2f} |

surprise 为 {audit['positiveSurpriseCaseWindowCount']} 个正金额 case window，占 total ledger cash 的 {audit['surpriseShareOfTotalLedgerCash']:.4%}。金额逐 case 与聚合守恒均通过。

该 {audit['surpriseShareOfTotalLedgerCash']:.4%} surprise 不进入主要模型指标和候选 gate，但必须进入端到端业务差额；无 cutoff 承诺的纯买断路由继续 abstain。为防止与 route 小格做差分还原，served、结构可预测和 route-abstained 的互补边际总数均不公开。本轮没有重新训练、调参或计算 C2-R.1 候选指标。
"""


def commitment_markdown(report: Mapping[str, Any]) -> str:
    conclusion = report["historicalEvidenceConclusion"]
    return f"""# M2 C2-R.1 买断承诺 as-of 审计 v1

- 状态：`not_for_formal_decision`
- 当前可审计 cutoff commitment：0
- 结论：现有权威输入不能证明后来买断在历史 cutoff 时已承诺

当前 3053 部作品、192872 条收入事实及校准 replay adapter 均没有独立的 `cash_commitment_snapshots` 数据角色，也没有承诺身份、未结应收状态、确认金额、未结金额、预计入账月、确认时间、证据可得时间和证据引用的完整 as-of 契约；逐账单事实 registry 与承诺 settlement link 角色同样不存在。

因此，历史 cutoff 之后识别到的买断不得事后恢复为“已承诺”。本次诊断识别到 {conclusion['classifierDerivedPositiveSurpriseCaseWindowCount']} 个正 surprise case window，重叠 case-window 金额为 {conclusion['classifierDerivedSurpriseAmount']:.2f}，占 total ledger cash 的 {conclusion['classifierDerivedSurpriseShareOfTotalLedgerCash']:.4%}。这些只是 classifier-derived 诊断，不是合同已确认事实。

未来若要纳入已确认应收，必须另行提供经过授权、可审计的 as-of commitment snapshot、逐账单事实 registry 与 settlement link 角色；不得从后来账单、business form 或分类器结果反推。上述 surprise 不进入主要模型指标和 gate，但形成 {conclusion['classifierDerivedSurpriseShareOfTotalLedgerCash']:.4%} 的端到端业务 surprise gap，并使无承诺纯买断保持 route abstention。
"""


def bridge_markdown(report: Mapping[str, Any]) -> str:
    amount = report["amountBridge"]
    return f"""# M2 C2-R.1 旧目标到正式现金目标桥接 v1

- 状态：`not_for_formal_decision`
- case key：与冻结 development universe 完全一致
- eligibility / scoreability：未改变

## 金额桥（仅 statistically scoreable；重叠 case-window 聚合）

| 项目 | 金额 |
|---|---:|
| 旧目标 actual | {amount['oldTargetActual']:.2f} |
| 新 forecastable cash actual | {amount['newForecastableCashActual']:.2f} |
| uncommitted buyout surprise | {amount['uncommittedBuyoutSurpriseActual']:.2f} |
| total ledger cash actual | {amount['totalLedgerCashActual']:.2f} |
| pure-buyout case 改用正式口径后补入的 forecastable cash | {amount['formalForecastableCashAddedOnPureBuyoutCases']:.2f} |
| 移除的 legacy pure-buyout target | {amount['legacyPureBuyoutTargetRemoved']:.2f} |
| 新目标减旧目标 | {amount['newMinusOldTarget']:.2f} |

桥接差额和三套 actual 的逐 case/聚合金额守恒均通过。surprise 不进入主要模型指标和候选 gate，但完整进入端到端业务差额。旧 C2-R 结果保留为历史目标口径证据，不能改称 formal-cash 指标，也不能在新目标 replay 前与 C2-R.1 直接比较。差异不被笼统归因于“去泄漏”。
"""


def assert_public_safety(report: Mapping[str, Any], markdown: str) -> None:
    serialized = json.dumps(report, ensure_ascii=False, sort_keys=True)
    combined = f"{serialized}\n{markdown}"
    lowered = combined.lower()
    forbidden = (
        "data/private",
        "private-output",
        "standard_work_id",
        "channel_key",
        "channel_component_key",
        "evidence_ref",
        ".xlsx",
        "�",
    )
    if any(token in lowered for token in forbidden):
        raise FormalCashCorrectionError("public report contains forbidden detail")
    if re.search(r"(?:^|[\s`\"'(])[a-z]:[\\/]", combined, re.IGNORECASE | re.MULTILINE):
        raise FormalCashCorrectionError("public report contains an absolute path")
    if re.search(
        r'["\'](?:optimistic|pessimistic|high|base|low|lower|upper)["\']\s*:',
        combined,
        re.IGNORECASE,
    ):
        raise FormalCashCorrectionError("public report contains a scenario or PI endpoint")
    if re.search(r"[\u3400-\u9fff]", combined) is None:
        raise FormalCashCorrectionError("public report must contain Chinese text")


def run_audit(*, write: bool) -> dict[str, Any]:
    global DATA_LOAD_CALLS
    DATA_LOAD_CALLS = 0
    target, commitment, bridge = build_reports()
    rendered = (
        (target, target_markdown(target), TARGET_JSON, TARGET_MD),
        (commitment, commitment_markdown(commitment), COMMITMENT_JSON, COMMITMENT_MD),
        (bridge, bridge_markdown(bridge), BRIDGE_JSON, BRIDGE_MD),
    )
    for report, markdown, _json_path, _md_path in rendered:
        assert_public_safety(report, markdown)
    if write:
        for report, markdown, json_path, md_path in rendered:
            write_json(json_path, report)
            write_text(md_path, markdown)
    else:
        for report, markdown, json_path, md_path in rendered:
            if not json_path.is_file() or not md_path.is_file():
                raise FormalCashCorrectionError(
                    f"public report is missing: {json_path.name} or {md_path.name}"
                )
            observed = json.loads(json_path.read_text(encoding="utf-8"))
            if observed != report:
                raise FormalCashCorrectionError(
                    "public JSON differs from deterministic recomputation: "
                    f"{json_path.name}"
                )
            if md_path.read_text(encoding="utf-8") != markdown.rstrip() + "\n":
                raise FormalCashCorrectionError(
                    "public Markdown differs from deterministic recomputation: "
                    f"{md_path.name}"
                )
    return {
        "status": "passed",
        "mode": "run-audit" if write else "verify-audit",
        "developmentCaseWindowCount": target["scope"]["developmentCaseWindowCount"],
        "statisticallyScoreableCaseWindowCount": target["scope"][
            "statisticallyScoreableCaseWindowCount"
        ],
        "forecastableCashActual": target["developmentActualAudit"][
            "forecastableCashActual"
        ],
        "uncommittedBuyoutSurpriseActual": target["developmentActualAudit"][
            "uncommittedBuyoutSurpriseActual"
        ],
        "totalLedgerCashActual": target["developmentActualAudit"][
            "totalLedgerCashActual"
        ],
        "finalHoldoutOpened": False,
        "C2R1TrainingStarted": False,
    }


def fail_closed(message: str) -> None:
    raise FormalCashCorrectionError(f"{message}; dataLoadCalls={DATA_LOAD_CALLS}")


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--preflight", action="store_true")
    mode.add_argument("--run-audit", action="store_true")
    mode.add_argument("--verify-audit", action="store_true")
    mode.add_argument("--run-legacy-c2r", action="store_true")
    mode.add_argument("--run-c2r1", action="store_true")
    mode.add_argument("--run-final-holdout", action="store_true")
    args = parser.parse_args(argv)
    try:
        if args.run_final_holdout:
            fail_closed("final holdout is sealed; formal-cash correction fails closed")
        if args.run_legacy_c2r:
            fail_closed(
                "legacy C2-R development write is stopped; only immutable historical-target verification remains allowed"
            )
        if args.run_c2r1:
            fail_closed("C2-R.1 training has not been authorized and remains stopped")
        if args.preflight:
            result = synthetic_preflight()
            if result["status"] != "passed":
                raise FormalCashCorrectionError("synthetic formal-cash preflight failed")
        elif args.run_audit:
            result = run_audit(write=True)
        else:
            result = run_audit(write=False)
        print(json.dumps(result, ensure_ascii=False, sort_keys=True, allow_nan=False))
        return 0
    except (FormalCashCorrectionError, cash.FormalCashContractError, ValueError) as exc:
        print(f"formal-cash correction failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
