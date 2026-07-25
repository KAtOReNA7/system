#!/usr/bin/env python3
"""Materialize private monthly M2 development cases from frozen authority.

This adapter reads the already verified local model-input cache.  It never
connects to a database, calls a provider, opens the final holdout, or writes
identifiers to tracked output.
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path
from typing import Any, Iterable, Mapping


ROOT = Path(__file__).resolve().parents[2]
REAL_DATA = ROOT / "scripts" / "m2-real-data"
if str(REAL_DATA) not in sys.path:
    sys.path.insert(0, str(REAL_DATA))

import m2_calibration_c2_v1 as c2  # noqa: E402
import m2_calibration_v1 as base  # noqa: E402
import m2_calibration_v1_2 as v12  # noqa: E402
import m2_formal_cash_target_v1 as cash  # noqa: E402
import run_m2_calibration_baseline_replay as legacy  # noqa: E402


CONFIG = ROOT / "config" / "m2-current.v0.4.json"
USER_CONFIRMATION_CONFIG = (
    ROOT / "config" / "m2-current-user-confirmation.v0.1.json"
)
CURRENT_PRIVATE = (
    ROOT
    / "data"
    / "private-output"
    / "m2-current-quality"
    / "M2-current-occurrence-amount-candidate-cases-private-v0.3.ndjson"
)
CURRENT_MANIFEST = (
    ROOT
    / "data"
    / "private-output"
    / "m2-current-quality"
    / "M2-current-occurrence-amount-candidate-manifest-private-v0.3.json"
)
OUTPUT_DIR = ROOT / "data" / "private-output" / "m2-current-dense"
CASE_OUTPUT = OUTPUT_DIR / "M2-current-dense-cases-private-v0.1.ndjson"
HISTORY_OUTPUT = OUTPUT_DIR / "M2-current-dense-history-private-v0.1.ndjson"
MANIFEST_OUTPUT = OUTPUT_DIR / "M2-current-dense-manifest-private-v0.1.json"
FROZEN_TARGET_OUTPUT = (
    OUTPUT_DIR / "M2-current-sales-share-frozen-cases-private-v0.1.ndjson"
)
SALES_ROUTES = frozenset({"pure_sales_share", "buyout_plus_sales"})


class DenseMaterializationError(RuntimeError):
    """The bounded dense development adapter contract was violated."""


def load_user_confirmations() -> tuple[dict[str, Any], list[dict[str, Any]]]:
    confirmation_config = json.loads(
        USER_CONFIRMATION_CONFIG.read_text(encoding="utf-8")
    )
    confirmations = confirmation_config.get("targetClassifications")
    if (
        confirmation_config.get("schema")
        != "m2.current.user_confirmation.v0.1"
        or confirmation_config.get("authorityMode")
        != "user_business_attestation"
        or confirmation_config.get("negativeCashEventPolicy")
        != "all_negative_cash_records_are_reversals"
        or not isinstance(confirmations, list)
        or not confirmations
        or confirmation_config.get("boundaries", {}).get(
            "rawFinancialRecordIncluded"
        )
        is not False
    ):
        raise DenseMaterializationError(
            "M2 user confirmation contract differs"
        )
    for confirmation in confirmations:
        if (
            confirmation.get("cashCategory") != "sales_share"
            or confirmation.get("eventType") != "reversal"
            or confirmation.get("authoritySource")
            != "financial_system_record"
            or confirmation.get("rawEvidenceExported") is not False
            or confirmation.get("scope")
            != "exact_digest_bound_cash_cell_only"
        ):
            raise DenseMaterializationError(
                "M2 target classification confirmation differs"
            )
    return confirmation_config, confirmations


def validate_confirmation_bindings(
    works: Mapping[str, Mapping[str, Any]],
    confirmations: list[dict[str, Any]],
) -> dict[str, int]:
    match_counts = {
        str(item["targetCellSha256"]): 0 for item in confirmations
    }
    if len(match_counts) != len(confirmations):
        raise DenseMaterializationError(
            "duplicate M2 target confirmation digest"
        )
    for work in works.values():
        for channel in work.get("channels", []) or []:
            component = base.channel_component_key(channel)
            for month, raw_amount in (channel.get("monthly", {}) or {}).items():
                amount = base.finite_number(raw_amount)
                digest = cash.truth_cash_cell_digest(
                    str(work["standard_work_id"]),
                    str(component),
                    str(month),
                    amount,
                )
                if digest not in match_counts:
                    continue
                if amount >= 0:
                    raise DenseMaterializationError(
                        "target confirmation is not bound to negative cash"
                    )
                match_counts[digest] += 1
    if any(count != 1 for count in match_counts.values()):
        raise DenseMaterializationError(
            "target confirmation does not bind exactly one authority cash cell"
        )
    return match_counts


def digest_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def read_current_cases() -> tuple[set[str], list[dict[str, Any]]]:
    if not CURRENT_PRIVATE.is_file() or not CURRENT_MANIFEST.is_file():
        raise DenseMaterializationError(
            "current v0.3 private candidate authority is missing"
        )
    private_bytes = CURRENT_PRIVATE.read_bytes()
    manifest = json.loads(CURRENT_MANIFEST.read_text(encoding="utf-8"))
    if (
        manifest.get("schema")
        != "m2.current.occurrence_amount_candidate.private_manifest.v0.3"
        or manifest.get("tracked") is not False
        or manifest.get("privateCaseSha256") != digest_bytes(private_bytes)
    ):
        raise DenseMaterializationError(
            "current v0.3 private candidate authority differs"
        )
    work_ids: set[str] = set()
    cases: list[dict[str, Any]] = []
    count = 0
    for line in private_bytes.decode("utf-8").splitlines():
        if not line:
            continue
        row = json.loads(line)
        case_key = row["caseKey"]
        work_ids.add(str(case_key["standardWorkId"]))
        cases.append(
            {
                "standardWorkId": str(case_key["standardWorkId"]),
                "origin": str(case_key["origin"]),
                "horizonMonths": int(case_key["horizonMonths"]),
                "route": str(case_key["route"]),
                "labelAvailableAsOf": str(row["labelAvailableAsOf"]),
            }
        )
        count += 1
    if (
        count != int(manifest["privateCaseRowCount"])
        or len(work_ids) != 824
    ):
        raise DenseMaterializationError(
            "current v0.3 private candidate population differs"
        )
    return work_ids, cases


def month_range(first: str, last: str, step: int) -> Iterable[str]:
    current = first
    while current <= last:
        yield current
        current = base.add_months(current, step)


def encode_ndjson(rows: Iterable[Mapping[str, Any]]) -> tuple[bytes, int]:
    encoded: list[bytes] = []
    count = 0
    for row in rows:
        encoded.append(
            json.dumps(
                row,
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
                allow_nan=False,
            ).encode("utf-8")
            + b"\n"
        )
        count += 1
    return b"".join(encoded), count


def run() -> dict[str, Any]:
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    confirmation_config, target_confirmations = load_user_confirmations()
    dense = config["development"]["denseOrigins"]
    if (
        dense["stepMonths"] != 1
        or dense["decisionPopulationMoved"] is not False
        or dense["labelAvailableThrough"] != "2023-06"
    ):
        raise DenseMaterializationError("dense development boundary differs")
    work_ids, frozen_cases = read_current_cases()
    calibration_spec, _v11, _v12 = v12.load_and_validate_contract()
    c2_spec = c2.load_spec()
    works_list, _posthoc, input_evidence = legacy.load_authorized_works(
        calibration_spec
    )
    works = {
        str(work["standard_work_id"]): work
        for work in works_list
        if str(work["standard_work_id"]) in work_ids
    }
    if set(works) != work_ids:
        raise DenseMaterializationError(
            "dense development work population differs"
        )
    confirmation_match_counts = validate_confirmation_bindings(
        works, target_confirmations
    )
    case_rows: list[dict[str, Any]] = []
    history_rows: list[dict[str, Any]] = []
    frozen_target_rows: list[dict[str, Any]] = []
    route_counts: dict[str, int] = {}
    segment_counts: dict[str, int] = {}
    for origin in month_range(
        dense["firstOrigin"],
        dense["lastOrigin"],
        int(dense["stepMonths"]),
    ):
        for work_id in sorted(works):
            work = works[work_id]
            routing = base.route_work_as_of(work, origin, calibration_spec)
            route = str(routing["route"])
            segment_state = c2.segment_as_of(
                work,
                origin,
                calibration_spec,
                c2_spec,
            )
            segment = str(segment_state["segment"])
            history = c2.work_sales_history_as_of(
                work,
                origin,
                calibration_spec,
            )
            history_key = f"{work_id}|{origin}"
            history_rows.append(
                {
                    "historyKey": history_key,
                    "standardWorkId": work_id,
                    "origin": origin,
                    "route": route,
                    "segment": segment,
                    "historySeries": [
                        float(value) for value in history["values"]
                    ],
                    "historyFirstObservedMonth": history["firstObservedMonth"],
                    "historyMonthCount": len(history["values"]),
                    "historyThroughOriginOnly": True,
                }
            )
            route_counts[route] = route_counts.get(route, 0) + 1
            segment_counts[segment] = segment_counts.get(segment, 0) + 1
            for horizon in dense["horizons"]:
                target_end = base.add_months(origin, int(horizon))
                if target_end > dense["labelAvailableThrough"]:
                    continue
                actuals = cash.build_sales_share_cash_actuals(
                    work,
                    origin,
                    int(horizon),
                    route,
                    calibration_spec,
                    label_available_as_of=target_end,
                    target_classification_confirmations=target_confirmations,
                )
                served = route in SALES_ROUTES
                case_rows.append(
                    {
                        "standardWorkId": work_id,
                        "origin": origin,
                        "horizonMonths": int(horizon),
                        "targetEnd": target_end,
                        "labelAvailableAsOf": target_end,
                        "labelStatus": "observed",
                        "route": route,
                        "segment": segment,
                        "historyKey": history_key,
                        "actual": float(actuals["forecastableCashActual"]),
                        "salesShareCashActual": float(
                            actuals["salesShareCashActual"]
                        ),
                        "isolatedBuyoutCashActual": float(
                            actuals["isolatedBuyoutCashActual"]
                        ),
                        "isolatedOtherCashActual": float(
                            actuals["isolatedOtherCashActual"]
                        ),
                        "totalLedgerCashActual": float(
                            actuals["totalLedgerCashActual"]
                        ),
                        "classificationUncertainCashActual": float(
                            actuals["classificationUncertainCashActual"]
                        ),
                        "userConfirmedSalesShareCashActual": float(
                            actuals["userConfirmedSalesShareCashActual"]
                        ),
                        "userConfirmedSalesShareEventCount": int(
                            actuals["userConfirmedSalesShareEventCount"]
                        ),
                        "uncommittedBuyoutSurpriseActual": float(
                            actuals["uncommittedBuyoutSurpriseActual"]
                        ),
                        "served": served,
                        "abstained": not served,
                        "abstentionReason": (
                            None
                            if served
                            else "buyout_outside_m2_forecast_scope"
                            if route == "pure_buyout"
                            else "unknown_revenue_model"
                        ),
                        "finalHoldoutOpened": False,
                        "deferred60MonthLabelsOpened": False,
                    }
                )
    for case in frozen_cases:
        work = works[case["standardWorkId"]]
        actuals = cash.build_sales_share_cash_actuals(
            work,
            case["origin"],
            case["horizonMonths"],
            case["route"],
            calibration_spec,
            label_available_as_of=case["labelAvailableAsOf"],
            target_classification_confirmations=target_confirmations,
        )
        frozen_target_rows.append(
            {
                "caseKey": {
                    "standardWorkId": case["standardWorkId"],
                    "origin": case["origin"],
                    "horizonMonths": case["horizonMonths"],
                    "route": case["route"],
                },
                "labelAvailableAsOf": case["labelAvailableAsOf"],
                "legacyForecastableCashActual": float(
                    actuals["forecastableCashActual"]
                ),
                "salesShareCashActual": float(
                    actuals["salesShareCashActual"]
                ),
                "isolatedBuyoutCashActual": float(
                    actuals["isolatedBuyoutCashActual"]
                ),
                "isolatedOtherCashActual": float(
                    actuals["isolatedOtherCashActual"]
                ),
                "totalLedgerCashActual": float(
                    actuals["totalLedgerCashActual"]
                ),
                "classificationUncertainCashActual": float(
                    actuals["classificationUncertainCashActual"]
                ),
                "userConfirmedSalesShareCashActual": float(
                    actuals["userConfirmedSalesShareCashActual"]
                ),
                "userConfirmedSalesShareEventCount": int(
                    actuals["userConfirmedSalesShareEventCount"]
                ),
                "allBuyoutExcludedFromForecast": True,
            }
        )
    case_bytes, case_count = encode_ndjson(case_rows)
    history_bytes, history_count = encode_ndjson(history_rows)
    frozen_target_bytes, frozen_target_count = encode_ndjson(
        frozen_target_rows
    )
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    CASE_OUTPUT.write_bytes(case_bytes)
    HISTORY_OUTPUT.write_bytes(history_bytes)
    FROZEN_TARGET_OUTPUT.write_bytes(frozen_target_bytes)
    manifest = {
        "schema": "m2.current.dense_development.private_manifest.v0.2",
        "tracked": False,
        "decisionStatus": "not_for_formal_decision",
        "role": "secondary_development_diagnostic",
        "decisionPopulationMoved": False,
        "workCount": len(work_ids),
        "originCount": len(
            list(
                month_range(
                    dense["firstOrigin"],
                    dense["lastOrigin"],
                    int(dense["stepMonths"]),
                )
            )
        ),
        "caseRowCount": case_count,
        "caseSha256": digest_bytes(case_bytes),
        "historyRowCount": history_count,
        "historySha256": digest_bytes(history_bytes),
        "frozenSalesShareTargetRowCount": frozen_target_count,
        "frozenSalesShareTargetSha256": digest_bytes(frozen_target_bytes),
        "targetPolicy": "sales_share_cash_only",
        "allBuyoutExcludedFromForecast": True,
        "userConfirmation": {
            "schema": confirmation_config["schema"],
            "configCanonicalSha256": cash.canonical_digest(
                confirmation_config
            ),
            "exactCellConfirmationCount": len(target_confirmations),
            "exactAuthorityCellMatchCount": sum(
                confirmation_match_counts.values()
            ),
            "negativeCashEventPolicy": confirmation_config[
                "negativeCashEventPolicy"
            ],
            "rawEvidenceExported": False,
        },
        "routeCountsByWorkOrigin": dict(sorted(route_counts.items())),
        "segmentCountsByWorkOrigin": dict(sorted(segment_counts.items())),
        "inputFingerprint": input_evidence["inputFingerprint"],
        "providerCalled": False,
        "databaseConnected": False,
        "finalHoldoutOpened": False,
        "embargoShadowOpened": False,
        "deferred60MonthLabelsOpened": False,
    }
    MANIFEST_OUTPUT.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return manifest


if __name__ == "__main__":
    print(json.dumps(run(), ensure_ascii=False, indent=2))
