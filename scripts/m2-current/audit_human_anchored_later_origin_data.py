#!/usr/bin/env python3
"""Profile only the evidence needed for the v1.0 later-origin readiness audit.

This adapter never fits or scores a model.  It publishes no row-level data and
returns private file digests only to the ignored preregistration writer.
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
CURRENT = ROOT / "scripts" / "m2-current"
if str(CURRENT) not in sys.path:
    sys.path.insert(0, str(CURRENT))

import run_m2_current_formal_execution_payload as formal  # noqa: E402


CONFIG_PATH = (
    ROOT
    / "config"
    / "m2-current-human-anchored-later-origin.v0.1.json"
)


class LaterOriginDataAuditError(RuntimeError):
    """The private readiness evidence does not satisfy the frozen contract."""


def run() -> dict[str, Any]:
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    inputs = formal.load_or_build_model_inputs()
    authority_work_ids = {str(value) for value in inputs["formalInput"]}
    bill = inputs["mappedSalesShareBill"].copy()
    if set(bill["cashCategory"].astype(str)) != {"sales_share"}:
        raise LaterOriginDataAuditError(
            "non-sales-share cash reached later-origin audit"
        )

    bill_month = bill["billMonth"].astype(str)
    incomplete = bill[bill_month == "2026-05"].copy()
    complete = bill[bill_month <= "2026-04"].copy()
    if len(incomplete) != 3:
        raise LaterOriginDataAuditError(
            "2026-05 incomplete fact count differs"
        )
    if incomplete["validForCalibration"].astype(bool).any():
        raise LaterOriginDataAuditError(
            "2026-05 incomplete facts are calibration-valid"
        )
    if complete.empty or max(complete["billMonth"].astype(str)) != "2026-04":
        raise LaterOriginDataAuditError(
            "latest complete sales-share month differs"
        )

    ledger_evidence_path = _resolve(
        config["privateInputs"]["ledgerPartitionEvidence"]
    )
    human_manifest_path = _resolve(
        config["privateInputs"]["humanAnchoredManifest"]
    )
    evaluation_manifest_path = _resolve(
        config["privateInputs"]["humanAnchoredEvaluationManifest"]
    )
    ledger = json.loads(ledger_evidence_path.read_text(encoding="utf-8"))
    human = json.loads(human_manifest_path.read_text(encoding="utf-8"))
    evaluation = json.loads(
        evaluation_manifest_path.read_text(encoding="utf-8")
    )
    expected_partition_checks = {
        "schema_equal",
        "split_type_pure",
        "no_split_overlap",
        "row_multiset_conserved",
        "amount_conserved",
        "monthly_row_count_conserved",
        "monthly_amount_conserved",
    }
    if (
        ledger.get("authorityMode")
        != "user_reviewed_workbook_membership"
        or set(ledger.get("checksPassed", [])) != expected_partition_checks
        or ledger.get("machineClassificationUsed") is not False
        or human.get("dataQuality", {}).get("mappingCoverage") != 1
        or human.get("dataQuality", {}).get(
            "amountConservationDifference"
        ) != 0
        or human.get("dataQuality", {}).get(
            "unmaturedLabelZeroImputationCount"
        ) != 0
        or human.get("dataQuality", {}).get("buyoutCashUsed") is not False
        or human.get("independentLaterOriginOpened") is not False
        or evaluation.get("independentLaterOriginOpened") is not False
    ):
        raise LaterOriginDataAuditError(
            "existing authority or development manifest differs"
        )

    digest_paths = {
        key: _resolve(value)
        for key, value in config["privateInputs"].items()
    }
    frozen_state_path = _resolve(
        config["frozenDevelopment"]["requiredFrozenStateArtifact"]
    )
    observed_work_ids = {
        str(value)
        for value in bill["standardWorkId"].dropna().astype(str)
    }
    if not observed_work_ids.issubset(authority_work_ids):
        raise LaterOriginDataAuditError(
            "sales-share observations exceed authority population"
        )
    return {
        "schema": "m2.current.human_anchored_later_origin_private_profile.v0.1",
        "authorityWorkCount": len(authority_work_ids),
        "observedSalesShareWorkCount": len(observed_work_ids),
        "modernWindowWorkCount":
            int(human["modernWindowWorkWithFactCount"]),
        "salesShareFactRowCount": len(bill),
        "modernWindowFactRowCount": int(human["modernWindowFactRowCount"]),
        "ledgerRowCounts": ledger["rowCounts"],
        "latestCompleteMonth": "2026-04",
        "incomplete202605FactCount": len(incomplete),
        "incomplete202605Excluded": True,
        "mappingCoverage": human["dataQuality"]["mappingCoverage"],
        "rowConservationPassed": True,
        "cashConservationPassed": True,
        "buyoutIsolated": True,
        "unmaturedLabelZeroImputationCount":
            human["dataQuality"]["unmaturedLabelZeroImputationCount"],
        "frozenModelStatePresent": frozen_state_path.is_file(),
        "sourceDigests": {
            key: _digest_file(path)
            for key, path in sorted(digest_paths.items())
        },
        "frozenStateDigest": (
            _digest_file(frozen_state_path)
            if frozen_state_path.is_file()
            else None
        ),
        "rawRowsExported": False,
        "workIdentifiersExported": False,
        "channelIdentifiersExported": False,
        "newLaterOriginMetricsRead": False,
    }


def _resolve(repository_relative: str) -> Path:
    candidate = (ROOT / repository_relative).resolve()
    try:
        candidate.relative_to(ROOT)
    except ValueError as exc:
        raise LaterOriginDataAuditError(
            "private evidence path escapes repository"
        ) from exc
    return candidate


def _digest_file(path: Path) -> str:
    if not path.is_file():
        raise LaterOriginDataAuditError(
            f"required readiness evidence missing: {path.name}"
        )
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    try:
        print(json.dumps(run(), ensure_ascii=False, sort_keys=True))
    except Exception as exc:  # noqa: BLE001
        print(
            f"[M2_LATER_ORIGIN_DATA_AUDIT_ERROR] {exc}",
            file=sys.stderr,
        )
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
