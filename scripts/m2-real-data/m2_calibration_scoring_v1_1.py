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
FROZEN_AMENDMENT_COMMIT = "c348b5218d2cc5f2eec71ae619a284becf8f9254"
FROZEN_AMENDMENT_DIGEST = "440eef4bb9120c8dadac038f6a2ebe8ede38ddab4c381948b6e9574af5547375"
BASELINE_IDS = ("B0b", "B1", "B2", "B3")
PREDICTION_LOCK_SCHEMA = "m2.calibration.prediction-lock-receipt.v1_1"

# These names identify target outcomes, not cutoff-available prediction inputs or
# target-availability metadata.  The recursive check prevents a held outcome
# from being hidden inside a component payload before the prediction lock.
_OUTCOME_FIELD_NAMES = frozenset(
    {
        "actual",
        "actuals",
        "actualbychannel",
        "actualcomponent",
        "actualcomponents",
        "actuallabeluncertain",
        "actualrevenue",
        "componentactual",
        "componentactuals",
        "componentactualbychannel",
        "outcomelabel",
        "outcomevalue",
        "scoringtruth",
        "targetactual",
        "targetactualvalue",
        "unseensaleschannelcount",
    }
)


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


def _git_blob_oid(commit: str, path: Path) -> str:
    relative = path.relative_to(ROOT).as_posix()
    result = subprocess.run(
        ["git", "rev-parse", f"{commit}:{relative}"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise ScoringContractError(
            f"frozen amendment commit does not contain {relative}"
        )
    return result.stdout.strip()


def _worktree_clean_oid(path: Path) -> str:
    """Hash worktree bytes after Git's checkout-clean normalization.

    A Windows checkout may contain CRLF while the frozen blob contains LF.
    Comparing physical worktree bytes would reject that legitimate checkout;
    Git's path-aware clean filter preserves the exact repository-blob guard.
    """

    relative = path.relative_to(ROOT).as_posix()
    result = subprocess.run(
        ["git", "hash-object", f"--path={relative}", relative],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise ScoringContractError("cannot hash the v1.1 amendment through Git")
    return result.stdout.strip()


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
    if _git_blob_oid(FROZEN_AMENDMENT_COMMIT, AMENDMENT_PATH) != _worktree_clean_oid(
        AMENDMENT_PATH
    ):
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


def _model_id(row: Mapping[str, Any]) -> str:
    value = str(row.get("model_id", row.get("modelId", ""))).strip()
    if not value:
        raise ScoringContractError("model_id is missing")
    return value


def _normalized_field_name(value: Any) -> str:
    return "".join(character for character in str(value).casefold() if character.isalnum())


def _outcome_field_paths(value: Any, path: str = "$") -> list[str]:
    found: list[str] = []
    if isinstance(value, Mapping):
        for key, child in value.items():
            child_path = f"{path}.{key}"
            if _normalized_field_name(key) in _OUTCOME_FIELD_NAMES:
                found.append(child_path)
            found.extend(_outcome_field_paths(child, child_path))
    elif isinstance(value, (list, tuple)):
        for index, child in enumerate(value):
            found.extend(_outcome_field_paths(child, f"{path}[{index}]"))
    return found


def assert_prediction_side_only(rows: Sequence[Mapping[str, Any]]) -> None:
    """Reject any target outcome before a prediction population is locked."""

    for index, row in enumerate(rows):
        if not isinstance(row, Mapping):
            raise ScoringContractError(f"prediction row {index} is not an object")
        paths = _outcome_field_paths(row)
        if paths:
            preview = ", ".join(paths[:5])
            raise ScoringContractError(
                f"prediction lock input contains outcome fields: {preview}"
            )


def _required_bool(row: Mapping[str, Any], field: str) -> bool:
    value = row.get(field)
    if not isinstance(value, bool):
        raise ScoringContractError(f"{field} must be boolean")
    return value


def _boolean_text(value: bool) -> str:
    return "true" if value else "false"


def _nullable_text(value: Any) -> str:
    return "NULL" if value is None else str(value)


def _fixed_or_null(value: Any, field: str) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool) or _finite(value) is None:
        raise ScoringContractError(f"{field} must be finite numeric or null")
    return base.fixed_decimal(value)


def _fingerprint_line(fields: Sequence[Any]) -> str:
    normalized = [unicodedata.normalize("NFC", str(field)) for field in fields]
    if any("|" in field or "\n" in field or "\r" in field for field in normalized):
        raise ScoringContractError("fingerprint field contains a reserved delimiter")
    return "|".join(normalized)


def _prediction_fingerprint_line(
    row: Mapping[str, Any], contract: ScoringContract
) -> tuple[tuple[str, str, int, str, str], str, tuple[bool, str | None, bool]]:
    key = case_key(row)
    model_id = _model_id(row)
    scoreable = _required_bool(row, "statisticallyScoreable")
    scoreability_reason = row.get("scoreabilityReason")
    if scoreable and scoreability_reason is not None:
        raise ScoringContractError("scoreable prediction has a scoreabilityReason")
    if not scoreable and not str(scoreability_reason or "").strip():
        raise ScoringContractError("unscoreable prediction lacks scoreabilityReason")

    if "rawModelPrediction" not in row or "servedPrediction" not in row:
        raise ScoringContractError("prediction row lacks explicit raw/served fields")
    raw_value = row.get("rawModelPrediction")
    served_value = row.get("servedPrediction")
    raw = None if raw_value is None else _finite(raw_value)
    served = None if served_value is None else _finite(served_value)
    if raw_value is not None and raw is None:
        raise ScoringContractError("rawModelPrediction is not finite numeric")
    if served_value is not None and served is None:
        raise ScoringContractError("servedPrediction is not finite numeric")

    available = _required_bool(row, "modelPredictionAvailable")
    business_eligible = _required_bool(row, "businessServingEligible")
    abstained = _required_bool(row, "abstained")
    if available != (raw is not None):
        raise ScoringContractError(
            "modelPredictionAvailable does not reconcile to rawModelPrediction"
        )
    if scoreable and raw is None:
        raise ScoringContractError("scoreable prediction lacks rawModelPrediction")
    if key[3] == "unknown_revenue_model":
        if business_eligible:
            raise ScoringContractError("unresolved revenue model cannot be served")
        if scoreable and (raw is None or base.fixed_decimal(raw) != base.fixed_decimal(0)):
            raise ScoringContractError(
                "scoreable unresolved revenue model must use structural raw zero"
            )

    expected_served = raw if business_eligible and available else None
    if expected_served is None:
        if served is not None:
            raise ScoringContractError("ineligible prediction has a served value")
    elif served is None or base.fixed_decimal(served) != base.fixed_decimal(expected_served):
        raise ScoringContractError("servedPrediction differs from rawModelPrediction")
    if abstained != (served is None):
        raise ScoringContractError("abstained does not reconcile to servedPrediction")

    abstention_reason = row.get("abstentionReason")
    if abstained and not str(abstention_reason or "").strip():
        raise ScoringContractError("abstained prediction lacks abstentionReason")
    if not abstained and abstention_reason is not None:
        raise ScoringContractError("served prediction has an abstentionReason")

    raw_annual = row.get("rawAnnualBreakdown")
    served_annual = row.get("servedAnnualBreakdown")
    if not isinstance(raw_annual, list) or not isinstance(served_annual, list):
        raise ScoringContractError("prediction annual breakdowns must be arrays")
    if raw is None and raw_annual:
        raise ScoringContractError("null raw prediction has a nonempty annual breakdown")
    if served is None:
        if served_annual:
            raise ScoringContractError("null served prediction has a nonempty annual breakdown")
    elif canonical_bytes(served_annual) != canonical_bytes(raw_annual):
        raise ScoringContractError("served annual breakdown differs from raw annual breakdown")

    confidence = row.get("confidence")
    if not isinstance(confidence, str) or not confidence.strip():
        raise ScoringContractError("prediction confidence must be a nonempty string")
    limitations = row.get("limitation")
    if not isinstance(limitations, list):
        raise ScoringContractError("prediction limitation must be an array")
    ordered_limitations = base.ordered_limitations(limitations, contract.base_spec)
    if limitations != ordered_limitations:
        raise ScoringContractError("prediction limitations are not in frozen order")
    if abstained and str(abstention_reason) not in limitations:
        raise ScoringContractError("abstentionReason is absent from limitation")

    public = row.get("public_output")
    expected_public = {
        "pointForecast": served,
        "annualBreakdown": served_annual,
        "confidence": confidence,
        "limitation": limitations,
    }
    if public != expected_public:
        raise ScoringContractError("public output does not reconcile to locked fields")

    fields = [
        key[0],
        key[1],
        str(key[2]),
        key[3],
        model_id,
        _fixed_or_null(raw, "rawModelPrediction"),
        _boolean_text(available),
        _boolean_text(business_eligible),
        _fixed_or_null(served, "servedPrediction"),
        _boolean_text(abstained),
        _nullable_text(abstention_reason),
        canonical_bytes(raw_annual).decode("utf-8"),
        canonical_bytes(served_annual).decode("utf-8"),
        confidence,
        canonical_bytes(limitations).decode("utf-8"),
    ]
    return (*key, model_id), _fingerprint_line(fields), (
        scoreable,
        None if scoreability_reason is None else str(scoreability_reason),
        business_eligible,
    )


def prediction_fingerprint(
    rows: Sequence[Mapping[str, Any]],
    contract: ScoringContract | None = None,
    *,
    reject_outcome_fields: bool | None = None,
    allow_outcome_projection: bool = False,
) -> str:
    """Return the frozen v1.1 prediction fingerprint for annotated rows."""

    contract = contract or load_contract()
    if contract.amendment_digest != FROZEN_AMENDMENT_DIGEST:
        raise ScoringContractError("prediction fingerprint contract binding mismatch")
    if reject_outcome_fields is not None and allow_outcome_projection:
        raise ScoringContractError(
            "choose either reject_outcome_fields or allow_outcome_projection"
        )
    reject_outcomes = (
        not allow_outcome_projection
        if reject_outcome_fields is None
        else reject_outcome_fields
    )
    if reject_outcomes:
        assert_prediction_side_only(rows)
    lines: list[str] = []
    seen: set[tuple[str, str, int, str, str]] = set()
    keys_by_model: dict[str, set[tuple[str, str, int, str]]] = {}
    state_by_case: dict[tuple[str, str, int, str], tuple[bool, str | None, bool]] = {}
    for row in rows:
        lock_key, line, state = _prediction_fingerprint_line(row, contract)
        if lock_key in seen:
            raise ScoringContractError("prediction lock has a duplicate model/case key")
        seen.add(lock_key)
        key = lock_key[:4]
        model_id = lock_key[4]
        keys_by_model.setdefault(model_id, set()).add(key)
        prior_state = state_by_case.setdefault(key, state)
        if prior_state != state:
            raise ScoringContractError("case state differs across locked models")
        lines.append(line)
    if len(keys_by_model) > 1:
        reference = next(iter(keys_by_model.values()))
        if any(keys != reference for keys in keys_by_model.values()):
            raise ScoringContractError("locked model case-key sets are not identical")
    payload = "\n".join(sorted(lines)).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def lock_prediction_population(
    rows: Sequence[Mapping[str, Any]],
    *,
    role: str,
    score_origin: str | None = None,
    contract: ScoringContract | None = None,
) -> dict[str, Any]:
    """Create a receipt only after outcome rejection and exact fingerprinting."""

    contract = contract or load_contract()
    role_text = str(role).strip()
    if not role_text:
        raise ScoringContractError("prediction lock role is missing")
    assert_prediction_side_only(rows)
    if score_origin is not None and any(case_key(row)[1] != score_origin for row in rows):
        raise ScoringContractError("prediction lock contains a different score origin")
    fingerprint = prediction_fingerprint(
        rows, contract, allow_outcome_projection=True
    )
    model_ids = sorted({_model_id(row) for row in rows})
    case_keys = {case_key(row) for row in rows}
    return {
        "schema": PREDICTION_LOCK_SCHEMA,
        "role": role_text,
        "scoreOrigin": score_origin,
        "baseSpecDigest": contract.base_digest,
        "amendmentDigest": contract.amendment_digest,
        "predictionFingerprint": fingerprint,
        "predictionRowCount": len(rows),
        "caseKeyCount": len(case_keys),
        "modelIds": model_ids,
        "outcomeFieldsAbsentAtLock": True,
        "outcomeFieldRejectionPassed": True,
        "predictionLockedBeforeTruthJoin": True,
        "postTruthPredictionProjectionVerified": False,
    }


def verify_prediction_lock(
    rows: Sequence[Mapping[str, Any]],
    receipt: Mapping[str, Any],
    contract: ScoringContract | None = None,
) -> dict[str, Any]:
    """Verify that a truth join left every locked prediction field unchanged."""

    contract = contract or load_contract()
    if receipt.get("schema") != PREDICTION_LOCK_SCHEMA:
        raise ScoringContractError("prediction lock receipt schema mismatch")
    if receipt.get("predictionLockedBeforeTruthJoin") is not True:
        raise ScoringContractError("prediction population was not locked before truth join")
    if (
        receipt.get("outcomeFieldsAbsentAtLock") is not True
        or receipt.get("outcomeFieldRejectionPassed") is not True
    ):
        raise ScoringContractError("prediction lock lacks outcome-rejection evidence")
    if receipt.get("baseSpecDigest") != contract.base_digest or receipt.get(
        "amendmentDigest"
    ) != contract.amendment_digest:
        raise ScoringContractError("prediction lock receipt contract binding mismatch")
    if int(receipt.get("predictionRowCount", -1)) != len(rows):
        raise ScoringContractError("prediction row count changed during truth join")
    if int(receipt.get("caseKeyCount", -1)) != len({case_key(row) for row in rows}):
        raise ScoringContractError("prediction case-key count changed during truth join")
    if sorted({_model_id(row) for row in rows}) != list(receipt.get("modelIds", [])):
        raise ScoringContractError("prediction model set changed during truth join")
    fingerprint = prediction_fingerprint(
        rows, contract, allow_outcome_projection=True
    )
    if fingerprint != receipt.get("predictionFingerprint"):
        raise ScoringContractError("prediction fields changed during truth join")
    verified = dict(receipt)
    verified["postTruthPredictionProjectionVerified"] = True
    return verified


def create_prediction_lock(
    rows: Sequence[Mapping[str, Any]],
    role: str,
    contract: ScoringContract | None = None,
    *,
    allow_outcome_projection: bool = False,
) -> dict[str, Any]:
    """Runner-facing lock API; outcome projections can never claim a pre-truth lock."""

    contract = contract or load_contract()
    if not allow_outcome_projection:
        return lock_prediction_population(rows, role=role, contract=contract)
    fingerprint = prediction_fingerprint(
        rows, contract, allow_outcome_projection=True
    )
    return {
        "schema": PREDICTION_LOCK_SCHEMA,
        "role": str(role).strip(),
        "scoreOrigin": None,
        "baseSpecDigest": contract.base_digest,
        "amendmentDigest": contract.amendment_digest,
        "predictionFingerprint": fingerprint,
        "predictionRowCount": len(rows),
        "caseKeyCount": len({case_key(row) for row in rows}),
        "modelIds": sorted({_model_id(row) for row in rows}),
        "outcomeFieldsAbsentAtLock": False,
        "outcomeFieldRejectionPassed": False,
        "predictionLockedBeforeTruthJoin": False,
        "postTruthPredictionProjectionVerified": True,
        "projectionOnly": True,
    }


def scoreability_fingerprint(
    rows: Sequence[Mapping[str, Any]],
    contract: ScoringContract | None = None,
) -> str:
    """Hash unique case scoreability and joined actuals, independent of model."""

    contract = contract or load_contract()
    if contract.amendment_digest != FROZEN_AMENDMENT_DIGEST:
        raise ScoringContractError("scoreability fingerprint contract binding mismatch")
    lines_by_key: dict[tuple[str, str, int, str], str] = {}
    for row in rows:
        key = case_key(row)
        scoreable = _required_bool(row, "statisticallyScoreable")
        reason = row.get("scoreabilityReason")
        if scoreable and reason is not None:
            raise ScoringContractError("scoreable case has a scoreabilityReason")
        if not scoreable and not str(reason or "").strip():
            raise ScoringContractError("unscoreable case lacks scoreabilityReason")
        target_end = str(row.get("target_end", "")).strip()
        available_as_of = str(
            row.get("label_available_as_of", row.get("_available_as_of", ""))
        ).strip()
        if not target_end or not available_as_of:
            raise ScoringContractError("scoreability fingerprint lacks target metadata")
        actual_value = row.get("actual")
        actual = None if actual_value is None else _finite(actual_value)
        if actual_value is not None and actual is None:
            raise ScoringContractError("scoreability actual is not finite numeric")
        if scoreable and actual is None:
            raise ScoringContractError("scoreable case lacks an actual")
        line = _fingerprint_line(
            [
                key[0],
                key[1],
                str(key[2]),
                key[3],
                _boolean_text(scoreable),
                _nullable_text(reason),
                target_end,
                available_as_of,
                _fixed_or_null(actual, "actual"),
            ]
        )
        prior = lines_by_key.setdefault(key, line)
        if prior != line:
            raise ScoringContractError("scoreability or actual differs across models")
    payload = "\n".join(sorted(lines_by_key.values())).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


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


def _unresolved_route_history_is_structural_zero(
    work: Mapping[str, Any], origin: str
) -> bool:
    for channel in work.get("channels", []) or []:
        for month, value in (channel.get("monthly", {}) or {}).items():
            if str(month) > origin:
                continue
            if isinstance(value, bool) or _finite(value) is None:
                raise ScoringContractError(
                    "unresolved revenue model has non-finite cutoff history"
                )
            if float(value) != 0.0:
                return False
    return True


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
    if route == "unknown_revenue_model" and scoreable:
        if not _unresolved_route_history_is_structural_zero(work, origin):
            raise ScoringContractError(
                "unresolved revenue model has nonzero cutoff history; no raw fallback is allowed"
            )
        if raw is None:
            raw = 0.0
        elif base.fixed_decimal(raw) != base.fixed_decimal(0):
            raise ScoringContractError(
                "unresolved revenue model raw prediction must be structural zero"
            )
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
    limitations = base.ordered_limitations(limitations, contract.base_spec)
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
            "uniqueWorkCount": len(
                {(case_key(row)[0], case_key(row)[1]) for row in group}
            ),
            "actualRevenueShare": share(_positive_actual(group), total_revenue),
            "workCountDefinition": "distinct_standard_work_id_x_origin",
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
        "abstainedWorkCount": len(
            {(case_key(row)[0], case_key(row)[1]) for row in abstained}
        ),
        "abstainedActualRevenueShare": share(_positive_actual(abstained), total_revenue),
        "highValueAbstainedWorkCount": len(
            {
                (case_key(row)[0], case_key(row)[1])
                for row in abstained
                if bool(row.get("strata", {}).get("high_value"))
            }
        ),
        "abstentionReasonDistribution": reasons,
        "workCountDefinition": "distinct_standard_work_id_x_origin",
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
        if value < 0:
            raise ScoringContractError(f"{model} has a negative all-scoreable WAPE")
        wapes[model] = value
    provisional = min(BASELINE_IDS, key=lambda model: (wapes[model], BASELINE_IDS.index(model)))
    best = wapes[provisional]
    evidence: dict[str, dict[str, Any]] = {}
    equivalent: list[str] = []
    for model in BASELINE_IDS:
        difference = abs(wapes[model] - best)
        if best > 0:
            relative: float | None = difference / best
            relative_threshold_satisfied = relative < 0.01
        elif difference == 0:
            relative = 0.0
            relative_threshold_satisfied = True
        else:
            # A positive WAPE cannot be "within 1%" of a perfect zero WAPE.
            # Keep the ratio null instead of emitting infinity into JSON.
            relative = None
            relative_threshold_satisfied = False
        bootstrap = bootstrap_vs_best.get(model, {}) or {}
        lower = _finite(bootstrap.get("percentileLower"))
        upper = _finite(bootstrap.get("percentileUpper"))
        if model == provisional and (lower is None or upper is None):
            lower = upper = 0.0
        if lower is None or upper is None:
            raise ScoringContractError(f"{model} bootstrap CI is unavailable")
        ci_contains_zero = lower <= 0 <= upper
        is_equivalent = relative_threshold_satisfied or ci_contains_zero
        if is_equivalent:
            equivalent.append(model)
        evidence[model] = {
            "wape": _rounded(wapes[model]),
            "relativeDifferenceVsProvisionalBest": _rounded(relative),
            "relativeDifferenceBelowOnePercent": relative_threshold_satisfied,
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
    zero_work = copy.deepcopy(work)
    zero_work["channels"][0]["monthly"] = {"2019-01": 0.0}
    unresolved_input = copy.deepcopy(base_row)
    unresolved_input["case_key"]["route"] = "unknown_revenue_model"
    unresolved_input.pop("_raw_model_prediction")
    unresolved_input["_raw_annual_breakdown"] = []
    unresolved = annotate_case_states(unresolved_input, zero_work, contract)
    unresolved_nonzero_history_rejected = False
    try:
        annotate_case_states(unresolved_input, work, contract)
    except ScoringContractError:
        unresolved_nonzero_history_rejected = True
    prediction_rows = [served, unresolved]
    lock = create_prediction_lock(
        prediction_rows, "development_forward_score", contract
    )
    joined_rows = copy.deepcopy(prediction_rows)
    joined_rows[0]["actual"] = 8.0
    joined_rows[1]["actual"] = 4.0
    verified_lock = verify_prediction_lock(joined_rows, lock, contract)
    scoreability = scoreability_fingerprint(joined_rows, contract)
    duplicated_scoreability_rows = copy.deepcopy(joined_rows)
    for row in duplicated_scoreability_rows:
        row["model_id"] = "B2"
    scoreability_with_model_duplicates = scoreability_fingerprint(
        [*joined_rows, *duplicated_scoreability_rows], contract
    )
    all_metrics = all_scoreable_metrics(joined_rows)
    served_metrics = served_cohort_metrics(joined_rows)
    abstention = abstention_metrics(joined_rows)
    future_work = copy.deepcopy(work)
    future_work["channels"][0]["monthly"]["2025-01"] = 999999.0
    future = annotate_case_states(base_row, future_work, contract)
    outcome_rejected = False
    try:
        create_prediction_lock(joined_rows, "development_forward_score", contract)
    except ScoringContractError:
        outcome_rejected = True
    mutation_rejected = False
    mutated = copy.deepcopy(joined_rows)
    mutated[0]["confidence"] = "low"
    mutated[0]["public_output"]["confidence"] = "low"
    try:
        verify_prediction_lock(mutated, lock, contract)
    except ScoringContractError:
        mutation_rejected = True
    perturbed_actual = copy.deepcopy(joined_rows)
    perturbed_actual[0]["actual"] = 9.0
    actual_changes_scoreability_fingerprint = (
        scoreability_fingerprint(perturbed_actual, contract) != scoreability
    )
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
    zero_best = select_equivalent_comparator(
        {
            "B0b": {"wape": 0.0},
            "B1": {"wape": 0.1},
            "B2": {"wape": 0.2},
            "B3": {"wape": 0.3},
        },
        {
            "B0b": {"percentileLower": 0.0, "percentileUpper": 0.0},
            "B1": {"percentileLower": 0.01, "percentileUpper": 0.2},
            "B2": {"percentileLower": 0.02, "percentileUpper": 0.3},
            "B3": {"percentileLower": 0.03, "percentileUpper": 0.4},
        },
    )
    checks = {
        "contractBound": contract.amendment_digest == FROZEN_AMENDMENT_DIGEST,
        "statesIndependent": served["statisticallyScoreable"]
        and unresolved["statisticallyScoreable"]
        and not unresolved["businessServingEligible"]
        and unresolved["modelPredictionAvailable"],
        "rawRetainedForAbstention": unresolved["rawModelPrediction"] == 0.0
        and unresolved["servedPrediction"] is None,
        "unresolvedNonzeroHistoryRejected": unresolved_nonzero_history_rejected,
        "noNullToZeroInModelWape": all_metrics["predictedTotal"] == 10.0
        and served_metrics["predictedTotal"] == 10.0
        and all_metrics["zeroImputationUsed"] is False,
        "abstentionReported": abstention["abstainedCaseCount"] == 1,
        "outcomeFieldsRejectedAtLock": outcome_rejected,
        "preTruthLockVerifiedAfterJoin": lock["outcomeFieldsAbsentAtLock"] is True
        and verified_lock["postTruthPredictionProjectionVerified"] is True,
        "lockedPredictionMutationRejected": mutation_rejected,
        "scoreabilityFingerprintModelIndependent": scoreability
        == scoreability_with_model_duplicates,
        "scoreabilityFingerprintIncludesActual": actual_changes_scoreability_fingerprint,
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
        "zeroBestDoesNotMakePositiveWapeEquivalent": zero_best["lockedComparator"]
        == "B0b"
        and zero_best["evidence"]["B1"]["relativeDifferenceVsProvisionalBest"]
        is None
        and zero_best["evidence"]["B1"][
            "relativeDifferenceBelowOnePercent"
        ]
        is False,
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
    "PREDICTION_LOCK_SCHEMA",
    "ScoringContract",
    "ScoringContractError",
    "abstention_metrics",
    "all_scoreable_metrics",
    "annotate_case_states",
    "assert_prediction_side_only",
    "case_key",
    "create_prediction_lock",
    "end_to_end_business_loss",
    "first_observed_source_month",
    "load_contract",
    "lock_prediction_population",
    "prediction_fingerprint",
    "score_populations",
    "scoreability_fingerprint",
    "select_equivalent_comparator",
    "served_cohort_metrics",
    "synthetic_self_test",
    "verify_prediction_lock",
]
