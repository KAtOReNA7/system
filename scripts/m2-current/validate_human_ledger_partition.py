"""Validate the private user-reviewed total/share/buyout ledger partition."""

from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
TOOLS = ROOT / "tools" / "m2-calibration"
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

from calibrate_cleaned_bills import REAL_BILL_COLUMNS  # noqa: E402
from human_ledger_partition import (  # noqa: E402
    discover_partition_sources,
    validate_partition,
)


OUTPUT = (
    ROOT
    / "data"
    / "private-output"
    / "m2-current-ledger"
    / "M2-current-human-ledger-partition-private-v0.1.json"
)


def main() -> None:
    sources = discover_partition_sources(ROOT / "data")
    _, evidence = validate_partition(sources, REAL_BILL_COLUMNS)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(evidence, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "status": "PASS",
                "authorityMode": evidence["authorityMode"],
                "machineClassificationUsed": False,
                "rowCounts": evidence["rowCounts"],
                "amountConserved": True,
                "privateEvidenceWritten": True,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
