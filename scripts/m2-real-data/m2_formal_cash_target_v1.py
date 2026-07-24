#!/usr/bin/env python3
"""Pure M2 formal-cash target, routing, and truth-partition primitives.

The module has no database or private-data side effects.  A caller supplies an
as-of work view, sales-channel point paths, and (when available) separately
authorized commitment snapshots.  Settlement links are accepted only by the
truth builder and are never read by the prediction composer.
"""

from __future__ import annotations

import copy
import hashlib
import json
import math
import re
from collections import defaultdict
from pathlib import Path
from typing import Any, Mapping, Sequence

import m2_calibration_v1 as base


ROOT = Path(__file__).resolve().parents[2]
SPEC_PATH = (
    ROOT
    / "src"
    / "domain"
    / "oldProductEvaluation"
    / "calibrationSpec.c2r.v1.1.amendment.json"
)
MONTH_PATTERN = re.compile(r"\d{4}-(0[1-9]|1[0-2])")
ROUTES = (
    "pure_sales_share",
    "pure_buyout",
    "buyout_plus_sales",
    "unknown_revenue_model",
)
COMMITMENT_STATUSES = frozenset({"signed", "confirmed"})
RECEIVABLE_STATUSES = frozenset({"outstanding", "partially_outstanding"})
COMMITMENT_CASH_TYPES = frozenset(
    {"buyout_receivable", "other_confirmed_cash"}
)
REGISTRY_CASH_TYPES = frozenset(
    {
        "sales_cash",
        "buyout_receivable",
        "other_confirmed_cash",
        "unclassified_cash",
    }
)
CONSERVATION_TOLERANCE = 0.000001


class FormalCashContractError(RuntimeError):
    """A frozen formal-cash semantic or as-of boundary was violated."""


def canonical_digest(value: Any) -> str:
    return hashlib.sha256(base.canonical_json_bytes(value)).hexdigest()


def load_spec(path: Path = SPEC_PATH) -> dict[str, Any]:
    contract = json.loads(path.read_text(encoding="utf-8"))
    if (
        contract.get("version") != "calibration-spec-c2r-v1.1-amendment"
        or contract.get("amendmentKind") != "formal_cash_target_correction"
        or contract.get("decisionStatus") != "not_for_formal_decision"
    ):
        raise FormalCashContractError("formal-cash amendment identity differs")
    for binding in contract.get("parentBindings", {}).values():
        parent_path = ROOT / str(binding["path"])
        parent = json.loads(parent_path.read_text(encoding="utf-8"))
        if canonical_digest(parent) != str(binding["canonicalDigestSha256"]):
            raise FormalCashContractError(
                f"formal-cash parent binding differs: {parent_path.name}"
            )
    if any(
        contract.get(field) is not False
        for field in ("formalDecisionAuthorized", "releaseAuthorized")
    ):
        raise FormalCashContractError("formal-cash decision authorization is open")
    seals = contract.get("seals", {})
    if not seals or any(value is not False for value in seals.values()):
        raise FormalCashContractError("formal-cash sealed boundary is open")
    boundary = contract.get("buyoutMonthlyEquivalentBoundary", {})
    if any(
        boundary.get(field) is not True
        for field in (
            "ratingContextOnly",
            "historicalValueOnly",
            "notCashForecast",
            "notIncludedInFutureCashRevenue",
        )
    ):
        raise FormalCashContractError("buyout monthly-equivalent boundary differs")
    return contract


def _is_month(value: Any) -> bool:
    return isinstance(value, str) and MONTH_PATTERN.fullmatch(value) is not None


def _future_months(origin: str, horizon: int) -> list[str]:
    if not _is_month(origin):
        raise FormalCashContractError("origin must use YYYY-MM")
    if isinstance(horizon, bool) or not isinstance(horizon, int) or horizon < 0:
        raise FormalCashContractError("horizon must be a nonnegative integer")
    return [base.add_months(origin, offset) for offset in range(1, horizon + 1)]


def _require_nonempty_string(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise FormalCashContractError(f"{label} must be a nonempty string")
    return value.strip()


def _require_native_bool(value: Any, label: str) -> bool:
    if type(value) is not bool:
        raise FormalCashContractError(f"{label} must be a native boolean")
    return value


def buyout_monthly_equivalent_context(value: Any) -> dict[str, Any]:
    """Return the retained value with the four mandatory non-cash flags."""

    equivalent = base.require_finite_number(value, "buyoutMonthlyEquivalent")
    return {
        "buyoutMonthlyEquivalent": equivalent,
        "ratingContextOnly": True,
        "historicalValueOnly": True,
        "notCashForecast": True,
        "notIncludedInFutureCashRevenue": True,
    }


def _snapshot_public_reason(reason: str) -> dict[str, str]:
    return {"reason": reason}


def resolve_commitments_as_of(
    standard_work_id: str,
    snapshots: Sequence[Mapping[str, Any]] | None,
    origin: str,
    horizon: int,
) -> dict[str, Any]:
    """Resolve auditable commitment snapshots visible at ``origin``.

    A snapshot that lacks a valid availability timestamp is never treated as
    cutoff-known.  Snapshots after the cutoff are filtered before their future
    payload is inspected, which keeps future perturbations invariant.
    """

    work_id = _require_nonempty_string(standard_work_id, "standard_work_id")
    future_months = set(_future_months(origin, horizon))
    if snapshots is None:
        snapshots = []
    if not isinstance(snapshots, Sequence) or isinstance(
        snapshots, (str, bytes, bytearray)
    ):
        raise FormalCashContractError("cash_commitment_snapshots must be a sequence")

    grouped: dict[str, list[Mapping[str, Any]]] = defaultdict(list)
    excluded: list[dict[str, str]] = []
    visible_snapshot_count = 0
    for snapshot in snapshots:
        if not isinstance(snapshot, Mapping):
            excluded.append(_snapshot_public_reason("snapshot_not_object"))
            continue
        available_as_of = snapshot.get("available_as_of")
        if not _is_month(available_as_of):
            excluded.append(
                _snapshot_public_reason("missing_or_invalid_evidence_available_as_of")
            )
            continue
        if str(available_as_of) > origin:
            continue
        visible_snapshot_count += 1
        snapshot_work_id = _require_nonempty_string(
            snapshot.get("standard_work_id"), "commitment standard_work_id"
        )
        if snapshot_work_id != work_id:
            raise FormalCashContractError("commitment belongs to a different work")
        commitment_id = _require_nonempty_string(
            snapshot.get("commitment_id"), "commitment_id"
        )
        grouped[commitment_id].append(snapshot)

    cutoff_known: list[dict[str, Any]] = []
    for commitment_id in sorted(grouped):
        candidates = grouped[commitment_id]
        latest_available = max(str(item["available_as_of"]) for item in candidates)
        latest = [
            item
            for item in candidates
            if str(item["available_as_of"]) == latest_available
        ]
        canonical = {base.canonical_json_bytes(dict(item)) for item in latest}
        if len(canonical) != 1:
            raise FormalCashContractError(
                "conflicting latest commitment snapshots at the same availability month"
            )
        snapshot = copy.deepcopy(latest[0])
        status = str(snapshot.get("status", "")).strip()
        cash_type = str(snapshot.get("cash_type", "")).strip()
        receivable_status = str(snapshot.get("receivable_status", "")).strip()
        confirmed_as_of = snapshot.get("confirmed_as_of")
        expected_month = snapshot.get("expected_posting_month")
        evidence_ref_value = snapshot.get("evidence_ref")
        evidence_ref = (
            evidence_ref_value.strip()
            if isinstance(evidence_ref_value, str)
            else ""
        )
        if status not in COMMITMENT_STATUSES:
            excluded.append(_snapshot_public_reason("status_not_signed_or_confirmed"))
            continue
        if cash_type not in COMMITMENT_CASH_TYPES:
            excluded.append(_snapshot_public_reason("unsupported_cash_type"))
            continue
        if receivable_status not in RECEIVABLE_STATUSES:
            excluded.append(_snapshot_public_reason("receivable_not_outstanding"))
            continue
        if (
            not _is_month(confirmed_as_of)
            or str(confirmed_as_of) > latest_available
            or latest_available > origin
        ):
            excluded.append(
                _snapshot_public_reason("invalid_confirmation_availability_order")
            )
            continue
        if not _is_month(expected_month):
            excluded.append(_snapshot_public_reason("missing_expected_posting_month"))
            continue
        if str(expected_month) <= origin:
            excluded.append(_snapshot_public_reason("expected_posting_month_not_future"))
            continue
        if not evidence_ref:
            excluded.append(_snapshot_public_reason("missing_evidence_ref"))
            continue
        try:
            confirmed_amount = base.require_finite_number(
                snapshot.get("confirmed_amount"), "confirmed_amount"
            )
            outstanding_amount = base.require_finite_number(
                snapshot.get("outstanding_amount"), "outstanding_amount"
            )
        except (TypeError, ValueError):
            excluded.append(_snapshot_public_reason("missing_or_invalid_commitment_amount"))
            continue
        if (
            confirmed_amount <= 0
            or outstanding_amount <= 0
            or outstanding_amount > confirmed_amount + CONSERVATION_TOLERANCE
        ):
            excluded.append(_snapshot_public_reason("invalid_outstanding_amount"))
            continue
        cutoff_known.append(
            {
                "standardWorkId": work_id,
                "commitmentId": commitment_id,
                "cashType": cash_type,
                "status": status,
                "receivableStatus": receivable_status,
                "confirmedAmount": round(confirmed_amount, 8),
                "outstandingAmount": round(outstanding_amount, 8),
                "expectedPostingMonth": str(expected_month),
                "confirmedAsOf": str(confirmed_as_of),
                "availableAsOf": latest_available,
                "evidenceRef": evidence_ref,
            }
        )
    scheduled = [
        item
        for item in cutoff_known
        if str(item["expectedPostingMonth"]) in future_months
    ]
    return {
        "cutoffKnown": cutoff_known,
        "scheduledInHorizon": scheduled,
        "excluded": excluded,
        # Counts are deliberately limited to the as-of-visible view.  Even
        # metadata about later evidence must not perturb a cutoff prediction.
        "visibleInputSnapshotCount": visible_snapshot_count,
    }


def _normalize_sales_path(
    sales_monthly_prediction: Mapping[str, Any] | None,
    origin: str,
    horizon: int,
) -> dict[str, float]:
    months = _future_months(origin, horizon)
    source = sales_monthly_prediction or {}
    if not isinstance(source, Mapping):
        raise FormalCashContractError("sales_monthly_prediction must be an object")
    if any(str(month) not in set(months) for month in source):
        raise FormalCashContractError("sales path contains a month outside the horizon")
    normalized = {}
    for month in months:
        value = base.require_finite_number(source.get(month, 0.0), f"sales[{month}]")
        if value < 0:
            raise FormalCashContractError("sales cash point cannot be negative")
        normalized[month] = round(value, 8)
    return normalized


def compose_future_cash_forecast(
    *,
    standard_work_id: str,
    route: str,
    origin: str,
    horizon: int,
    sales_monthly_prediction: Mapping[str, Any] | None,
    cash_commitment_snapshots: Sequence[Mapping[str, Any]] | None,
    statistically_scoreable: bool,
    business_serving_eligible: bool,
    business_abstention_reason: str | None = None,
    sales_confidence: str = "medium",
) -> dict[str, Any]:
    """Compose the only formal point: sales cash plus cutoff-known receivables."""

    work_id = _require_nonempty_string(standard_work_id, "standard_work_id")
    if route not in ROUTES:
        raise FormalCashContractError("route is outside the frozen domain")
    if sales_confidence not in {"high", "medium", "low", "unavailable"}:
        raise FormalCashContractError("unsupported confidence")
    scoreable = _require_native_bool(
        statistically_scoreable, "statistically_scoreable"
    )
    serving_eligible = _require_native_bool(
        business_serving_eligible, "business_serving_eligible"
    )
    sales = _normalize_sales_path(sales_monthly_prediction, origin, horizon)
    if route in {"pure_buyout", "unknown_revenue_model"} and any(sales.values()):
        raise FormalCashContractError("non-sales route received a sales point")
    commitments = resolve_commitments_as_of(
        work_id, cash_commitment_snapshots, origin, horizon
    )
    future = copy.deepcopy(sales)
    for commitment in commitments["scheduledInHorizon"]:
        month = str(commitment["expectedPostingMonth"])
        future[month] = round(
            future[month] + float(commitment["outstandingAmount"]), 8
        )

    limitations: list[str] = []
    route_abstained = False
    abstention_reason: str | None = None
    model_available = True
    confidence = sales_confidence
    has_cutoff_buyout = any(
        item["cashType"] == "buyout_receivable"
        for item in commitments["cutoffKnown"]
    )
    if route == "pure_buyout" and not has_cutoff_buyout:
        route_abstained = True
        model_available = False
        abstention_reason = "uncommitted_future_buyout_not_forecastable"
        limitations.append(abstention_reason)
        confidence = "unavailable"
    elif route == "unknown_revenue_model":
        route_abstained = True
        model_available = False
        abstention_reason = "unknown_revenue_model"
        limitations.extend(["unknown_revenue_model", "unresolved_revenue_model"])
        confidence = "unavailable"
    else:
        limitations.append("excludes_uncommitted_future_buyout")
        if commitments["scheduledInHorizon"]:
            limitations.append("includes_cutoff_confirmed_receivable")
        if len(commitments["cutoffKnown"]) > len(
            commitments["scheduledInHorizon"]
        ):
            limitations.append("known_receivable_outside_forecast_horizon")
        if route == "pure_sales_share" and any(
            item["cashType"] == "buyout_receivable"
            for item in commitments["cutoffKnown"]
        ):
            limitations.append("cutoff_confirmed_buyout_requires_route_review")

    raw = round(sum(future.values()), 8) if model_available else None
    if not serving_eligible and not route_abstained:
        abstention_reason = business_abstention_reason or "business_serving_ineligible"
        limitations.append(abstention_reason)
        confidence = "unavailable"
    served = (
        raw
        if serving_eligible and model_available and not route_abstained
        else None
    )
    abstained = served is None
    annual = base.annual_breakdown(future, raw or 0.0) if raw is not None else []
    served_annual = annual if served is not None else []
    limitations = sorted(set(limitations))
    public_output = {
        "pointForecast": served,
        "annualBreakdown": served_annual,
        "confidence": confidence,
        "limitation": limitations,
    }
    return {
        "standardWorkId": work_id,
        "route": route,
        "statisticallyScoreable": scoreable,
        "businessServingEligible": serving_eligible,
        "modelPredictionAvailable": model_available,
        "routeAbstained": route_abstained,
        "abstained": abstained,
        "abstentionReason": abstention_reason,
        "rawModelPrediction": raw,
        "servedPrediction": served,
        "futureCashRevenueForecast": raw,
        "annualBreakdown": annual,
        "confidence": confidence,
        "limitation": limitations,
        "excludesUncommittedFutureBuyout": True,
        "futureBuyoutPredicted": False,
        "confirmedCashComponents": commitments["scheduledInHorizon"],
        "cutoffKnownCashComponents": commitments["cutoffKnown"],
        "commitmentResolution": commitments,
        "public_output": public_output,
    }


def _truth_cash_components(
    work: Mapping[str, Any],
    origin: str,
    horizon: int,
    calibration_spec: Mapping[str, Any],
) -> dict[str, Any]:
    target_end = base.add_months(origin, horizon)
    target_month_list = base.month_range(base.add_months(origin, 1), target_end)
    target_months = set(target_month_list)
    total = 0.0
    classifier_buyout = 0.0
    uncertain = False
    uncertain_amount = 0.0
    negative_amount = 0.0
    event_count = 0
    cell_actual: dict[tuple[str, str], float] = {}
    buyout_by_cell: dict[tuple[str, str], float] = {}
    seen_components: set[str] = set()
    for channel in sorted(
        work.get("channels", []) or [], key=base.channel_component_key
    ):
        component = base.channel_component_key(channel)
        if component in seen_components:
            raise FormalCashContractError("duplicate truth channel component")
        seen_components.add(component)
        monthly = channel.get("monthly", {}) or {}
        outcome = base.classify_channel_as_of(channel, target_end, calibration_spec)
        channel_uncertain = outcome.get("label") == "unknown_channel"
        if channel_uncertain:
            uncertain = True
        buyout_months = set(outcome.get("buyoutEventMonths", [])) & target_months
        for month in target_month_list:
            amount = base.finite_number(monthly.get(month, 0.0))
            total += amount
            cell_actual[(component, month)] = amount
            if amount < 0:
                negative_amount += amount
            if channel_uncertain:
                uncertain_amount += amount
            if month in buyout_months and amount > 0:
                classifier_buyout += amount
                event_count += 1
                buyout_by_cell[(component, month)] = amount
    return {
        "targetEnd": target_end,
        "totalLedgerCashActual": total,
        "classifierDerivedBuyoutActual": classifier_buyout,
        "classifierDerivedBuyoutEventCount": event_count,
        "actualClassificationUncertain": uncertain,
        "classificationUncertainCashActual": uncertain_amount,
        "negativeLedgerCashActual": negative_amount,
        "cellActualByComponentMonth": cell_actual,
        "classifierBuyoutByComponentMonth": buyout_by_cell,
    }


def build_complete_month_cash_audit(
    work: Mapping[str, Any],
    first_month: str,
    latest_complete_month: str,
    calibration_spec: Mapping[str, Any],
) -> dict[str, Any]:
    """Build one non-overlapping complete-month cash partition per work.

    This is a post-hoc business-coverage audit, not a prediction feature.  It
    intentionally returns component maps only to the ignored local evidence
    layer; public reports must aggregate and remove their identifiers.
    """

    if not _is_month(first_month) or not _is_month(latest_complete_month):
        raise FormalCashContractError("complete-month audit bounds must use YYYY-MM")
    start_order = base.month_ordinal(first_month)
    end_order = base.month_ordinal(latest_complete_month)
    if end_order < start_order:
        raise FormalCashContractError("complete-month audit bounds are inverted")
    origin = base.add_months(first_month, -1)
    horizon = end_order - base.month_ordinal(origin)
    components = _truth_cash_components(
        work, origin, horizon, calibration_spec
    )
    ledger_by_component: dict[str, float] = defaultdict(float)
    buyout_by_component: dict[str, float] = defaultdict(float)
    for (component, _month), amount in components[
        "cellActualByComponentMonth"
    ].items():
        ledger_by_component[str(component)] += float(amount)
    for (component, _month), amount in components[
        "classifierBuyoutByComponentMonth"
    ].items():
        buyout_by_component[str(component)] += float(amount)
    forecastable_by_component = {
        component: float(amount) - float(buyout_by_component.get(component, 0.0))
        for component, amount in ledger_by_component.items()
    }
    total = float(components["totalLedgerCashActual"])
    surprise = float(components["classifierDerivedBuyoutActual"])
    forecastable = total - surprise
    conservation = forecastable + surprise - total
    if not math.isclose(
        conservation, 0.0, rel_tol=0.0, abs_tol=CONSERVATION_TOLERANCE
    ):
        raise FormalCashContractError("complete-month cash audit does not conserve")
    return {
        "forecastableCashActual": round(forecastable, 8),
        "uncommittedBuyoutSurpriseActual": round(surprise, 8),
        "totalLedgerCashActual": round(total, 8),
        "forecastableActualByComponent": {
            key: round(value, 8)
            for key, value in sorted(forecastable_by_component.items())
        },
        "totalLedgerActualByComponent": {
            key: round(value, 8)
            for key, value in sorted(ledger_by_component.items())
        },
        "classifierDerivedBuyoutEventCount": int(
            components["classifierDerivedBuyoutEventCount"]
        ),
        "amountConservationDifference": round(conservation, 8),
        "firstMonth": first_month,
        "latestCompleteMonth": latest_complete_month,
        "postHocBusinessCoverageOnly": True,
    }


def _linked_committed_actual_by_event(
    work: Mapping[str, Any],
    resolved_commitments: Mapping[str, Any],
    origin: str,
    horizon: int,
    label_available_as_of: str,
    components: Mapping[str, Any],
) -> dict[str, Any]:
    work_id = _require_nonempty_string(
        work.get("standard_work_id"), "work standard_work_id"
    )
    known = {
        str(item["commitmentId"]): item
        for item in resolved_commitments.get("cutoffKnown", [])
    }
    target_months = set(_future_months(origin, horizon))
    if not _is_month(label_available_as_of):
        raise FormalCashContractError("label_available_as_of must use YYYY-MM")
    links = work.get("cash_commitment_settlement_links", []) or []
    registry = work.get("authority_ledger_fact_registry", []) or []
    for value, label in (
        (links, "cash_commitment_settlement_links"),
        (registry, "authority_ledger_fact_registry"),
    ):
        if not isinstance(value, Sequence) or isinstance(
            value, (str, bytes, bytearray)
        ):
            raise FormalCashContractError(f"{label} must be a sequence")
    if links and not registry:
        raise FormalCashContractError(
            "settlement links require the authority ledger-fact registry"
        )

    fact_by_key: dict[str, dict[str, Any]] = {}
    registry_by_cell: dict[tuple[str, str], float] = defaultdict(float)
    for fact in registry:
        if not isinstance(fact, Mapping):
            raise FormalCashContractError("authority ledger fact must be an object")
        fact_work_id = _require_nonempty_string(
            fact.get("standard_work_id"), "ledger fact standard_work_id"
        )
        if fact_work_id != work_id:
            raise FormalCashContractError("ledger fact belongs to a different work")
        fact_key = _require_nonempty_string(
            fact.get("ledger_fact_key"), "ledger_fact_key"
        )
        if fact_key in fact_by_key:
            raise FormalCashContractError("duplicate authority ledger_fact_key")
        component = _require_nonempty_string(
            fact.get("channel_component_key"), "ledger channel_component_key"
        )
        posting_month = fact.get("posting_month")
        if not _is_month(posting_month):
            raise FormalCashContractError("ledger posting_month must use YYYY-MM")
        amount = base.require_finite_number(fact.get("amount"), "ledger fact amount")
        cash_type = _require_nonempty_string(
            fact.get("cash_type"), "ledger fact cash_type"
        )
        if cash_type not in REGISTRY_CASH_TYPES:
            raise FormalCashContractError("ledger fact cash_type is unsupported")
        normalized = {
            "standardWorkId": fact_work_id,
            "ledgerFactKey": fact_key,
            "channelComponentKey": component,
            "postingMonth": str(posting_month),
            "amount": amount,
            "cashType": cash_type,
        }
        fact_by_key[fact_key] = normalized
        if str(posting_month) in target_months:
            registry_by_cell[(component, str(posting_month))] += amount

    if links:
        actual_by_cell = components["cellActualByComponentMonth"]
        for cell in set(actual_by_cell) | set(registry_by_cell):
            actual = float(actual_by_cell.get(cell, 0.0))
            registered = float(registry_by_cell.get(cell, 0.0))
            if not math.isclose(
                actual,
                registered,
                rel_tol=0.0,
                abs_tol=CONSERVATION_TOLERANCE,
            ):
                raise FormalCashContractError(
                    "authority ledger-fact registry does not reconcile to target cash"
                )

    linked_facts: set[str] = set()
    linked_by_cell: dict[tuple[str, str], float] = defaultdict(float)
    linked_by_type: dict[str, float] = defaultdict(float)
    linked_by_commitment: dict[str, float] = defaultdict(float)
    for link in links:
        if not isinstance(link, Mapping):
            raise FormalCashContractError("settlement link must be an object")
        link_work_id = _require_nonempty_string(
            link.get("standard_work_id"), "settlement standard_work_id"
        )
        if link_work_id != work_id:
            raise FormalCashContractError("settlement link belongs to a different work")
        commitment_id = _require_nonempty_string(
            link.get("commitment_id"), "settlement commitment_id"
        )
        if commitment_id not in known:
            raise FormalCashContractError(
                "settlement link lacks a cutoff-known commitment"
            )
        fact_key = _require_nonempty_string(
            link.get("ledger_fact_key"), "settlement ledger_fact_key"
        )
        if fact_key in linked_facts:
            raise FormalCashContractError("ledger fact has multiple settlement links")
        fact = fact_by_key.get(fact_key)
        if fact is None:
            raise FormalCashContractError("settlement link lacks an authority ledger fact")
        cash_type = _require_nonempty_string(
            link.get("cash_type"), "settlement cash_type"
        )
        component = _require_nonempty_string(
            link.get("channel_component_key"), "settlement channel_component_key"
        )
        posting_month = link.get("posting_month")
        truth_available = link.get("truth_available_as_of")
        if not _is_month(posting_month) or str(posting_month) not in target_months:
            raise FormalCashContractError("settlement posting month is outside target")
        if (
            not _is_month(truth_available)
            or str(truth_available) < str(posting_month)
            or str(truth_available) > label_available_as_of
        ):
            raise FormalCashContractError("settlement truth was unavailable at label join")
        amount = base.require_finite_number(
            link.get("settlement_amount"), "settlement amount"
        )
        if amount <= 0:
            raise FormalCashContractError("settlement amount must be positive")
        commitment = known[commitment_id]
        if cash_type != commitment["cashType"] or cash_type != fact["cashType"]:
            raise FormalCashContractError(
                "settlement cash type differs from commitment or ledger fact"
            )
        if (
            component != fact["channelComponentKey"]
            or str(posting_month) != fact["postingMonth"]
            or not math.isclose(
                amount,
                float(fact["amount"]),
                rel_tol=0.0,
                abs_tol=CONSERVATION_TOLERANCE,
            )
        ):
            raise FormalCashContractError(
                "settlement link differs from its authority ledger fact"
            )
        linked_facts.add(fact_key)
        linked_by_cell[(component, str(posting_month))] += amount
        linked_by_type[cash_type] += amount
        linked_by_commitment[commitment_id] += amount
    for commitment_id, amount in linked_by_commitment.items():
        if amount > float(known[commitment_id]["outstandingAmount"]) + CONSERVATION_TOLERANCE:
            raise FormalCashContractError(
                "linked settlement exceeds cutoff outstanding receivable"
            )
    return {
        "linkedByComponentMonth": dict(linked_by_cell),
        "linkedByCashType": dict(linked_by_type),
        "linkedByCommitment": dict(linked_by_commitment),
        "linkedLedgerFactCount": len(linked_facts),
    }


def build_formal_cash_actuals(
    work: Mapping[str, Any],
    origin: str,
    horizon: int,
    route_at_origin: str,
    calibration_spec: Mapping[str, Any],
    label_available_as_of: str,
) -> dict[str, Any]:
    """Build the three formal-cash actuals after prediction lock."""

    work_id = _require_nonempty_string(
        work.get("standard_work_id"), "work standard_work_id"
    )
    if not isinstance(route_at_origin, str) or route_at_origin not in ROUTES:
        raise FormalCashContractError("truth route is outside the frozen domain")
    if not _is_month(label_available_as_of):
        raise FormalCashContractError("label_available_as_of must use YYYY-MM")
    routing = base.route_work_as_of(work, origin, calibration_spec)
    if route_at_origin != routing.get("route"):
        raise FormalCashContractError("truth route differs from cutoff route")
    components = _truth_cash_components(work, origin, horizon, calibration_spec)
    if str(label_available_as_of) < str(components["targetEnd"]):
        raise FormalCashContractError("label joined before the target window closed")
    commitments = resolve_commitments_as_of(
        work_id,
        work.get("cash_commitment_snapshots", []) or [],
        origin,
        horizon,
    )
    linked = _linked_committed_actual_by_event(
        work,
        commitments,
        origin,
        horizon,
        label_available_as_of,
        components,
    )
    linked_by_cell = linked["linkedByComponentMonth"]
    classifier_buyout = float(components["classifierDerivedBuyoutActual"])
    total = float(components["totalLedgerCashActual"])
    # Only an exact link to the same authority ledger fact may remove cash from
    # the classifier-derived surprise bucket.  Aggregates from another event,
    # work, component, or month can never offset an uncommitted buyout event.
    surprise = 0.0
    for cell, classified_amount in components[
        "classifierBuyoutByComponentMonth"
    ].items():
        linked_amount = float(linked_by_cell.get(cell, 0.0))
        if linked_amount > float(classified_amount) + CONSERVATION_TOLERANCE:
            raise FormalCashContractError(
                "linked committed cash exceeds its classifier-derived cash cell"
            )
        surprise += max(0.0, float(classified_amount) - linked_amount)
    forecastable = total - surprise
    ledger_by_component: dict[str, float] = defaultdict(float)
    surprise_by_component: dict[str, float] = defaultdict(float)
    for (component, _month), amount in components[
        "cellActualByComponentMonth"
    ].items():
        ledger_by_component[str(component)] += float(amount)
    for (component, _month), classified_amount in components[
        "classifierBuyoutByComponentMonth"
    ].items():
        linked_amount = float(linked_by_cell.get((component, _month), 0.0))
        surprise_by_component[str(component)] += max(
            0.0, float(classified_amount) - linked_amount
        )
    forecastable_by_component = {
        component: float(amount) - float(surprise_by_component.get(component, 0.0))
        for component, amount in ledger_by_component.items()
    }
    conservation = forecastable + surprise - total
    if not math.isclose(
        conservation, 0.0, rel_tol=0.0, abs_tol=CONSERVATION_TOLERANCE
    ):
        raise FormalCashContractError("formal-cash actual partition does not conserve")
    return {
        "forecastableCashActual": round(forecastable, 8),
        "uncommittedBuyoutSurpriseActual": round(surprise, 8),
        "totalLedgerCashActual": round(total, 8),
        "salesAndOtherCashActual": round(total - classifier_buyout, 8),
        "cutoffCommittedBuyoutActual": round(
            float(linked["linkedByCashType"].get("buyout_receivable", 0.0)), 8
        ),
        "cutoffCommittedOtherCashActual": round(
            float(linked["linkedByCashType"].get("other_confirmed_cash", 0.0)), 8
        ),
        "classifierDerivedBuyoutActual": round(classifier_buyout, 8),
        "classifierDerivedBuyoutEventCount": int(
            components["classifierDerivedBuyoutEventCount"]
        ),
        "actualClassificationUncertain": bool(
            components["actualClassificationUncertain"]
        ),
        "classificationUncertainCashActual": round(
            float(components["classificationUncertainCashActual"]), 8
        ),
        "negativeLedgerCashActual": round(
            float(components["negativeLedgerCashActual"]), 8
        ),
        "commitmentEvidenceAvailableAtCutoffCount": len(
            commitments["cutoffKnown"]
        ),
        "linkedLedgerFactCount": int(linked["linkedLedgerFactCount"]),
        "forecastableActualByComponent": {
            key: round(value, 8)
            for key, value in sorted(forecastable_by_component.items())
        },
        "totalLedgerActualByComponent": {
            key: round(value, 8)
            for key, value in sorted(ledger_by_component.items())
        },
        "surpriseActualByComponentMonth": {
            (str(component), str(month)): round(
                max(
                    0.0,
                    float(classified_amount)
                    - float(linked_by_cell.get((component, month), 0.0)),
                ),
                8,
            )
            for (component, month), classified_amount in sorted(
                components["classifierBuyoutByComponentMonth"].items()
            )
        },
        "target_end": str(components["targetEnd"]),
        "label_available_as_of": str(label_available_as_of),
        "amountConservationDifference": round(conservation, 8),
    }


def build_sales_share_cash_actuals(
    work: Mapping[str, Any],
    origin: str,
    horizon: int,
    route_at_origin: str,
    calibration_spec: Mapping[str, Any],
    label_available_as_of: str,
) -> dict[str, Any]:
    """Build the current sales-share-only target and its isolated cash ledger.

    This is a forward-compatible target migration layered on the immutable
    formal-cash partition above.  Every classifier-derived buyout event is
    excluded, including an event linked to a cutoff-known commitment.  Any
    separately identified non-sales commitment is also excluded so the model
    target contains revenue-share cash only.
    """

    actuals = build_formal_cash_actuals(
        work,
        origin,
        horizon,
        route_at_origin,
        calibration_spec,
        label_available_as_of,
    )
    isolated_buyout = float(actuals["classifierDerivedBuyoutActual"])
    isolated_other = float(actuals["cutoffCommittedOtherCashActual"])
    sales_share = float(actuals["salesAndOtherCashActual"]) - isolated_other
    total = float(actuals["totalLedgerCashActual"])
    conservation = sales_share + isolated_buyout + isolated_other - total
    if not math.isclose(
        conservation, 0.0, rel_tol=0.0, abs_tol=CONSERVATION_TOLERANCE
    ):
        raise FormalCashContractError(
            "sales-share target partition does not conserve ledger cash"
        )
    return {
        **actuals,
        "salesShareCashActual": round(sales_share, 8),
        "isolatedBuyoutCashActual": round(isolated_buyout, 8),
        "isolatedOtherCashActual": round(isolated_other, 8),
        "salesShareTargetConservationDifference": round(conservation, 8),
        "allBuyoutExcludedFromForecast": True,
        "commitmentCashExcludedFromForecast": True,
        "targetPolicy": "sales_share_cash_only",
    }


def formal_cash_case_key(
    standard_work_id: str, origin: str, horizon: int, route: str
) -> tuple[str, str, int, str]:
    work_id = _require_nonempty_string(standard_work_id, "standard_work_id")
    if not isinstance(route, str) or route not in ROUTES:
        raise FormalCashContractError("case route is outside the frozen domain")
    _future_months(origin, horizon)
    return work_id, origin, horizon, route
