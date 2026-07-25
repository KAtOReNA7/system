"""Human-reviewed M2 ledger partition authority.

The three workbooks remain private.  This module validates their aggregate
relationship and assigns cash categories only from workbook membership.  It
does not infer buyout status from amount shape, channel, notes, or sign.
"""

from __future__ import annotations

import json
import math
from collections import Counter, defaultdict
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Callable

import pandas as pd


CONFIG_PATH = (
    Path(__file__).resolve().parents[2]
    / "config"
    / "m2-current-human-ledger-partition.v0.1.json"
)
TYPE_COLUMN = "类型"


class HumanLedgerPartitionError(RuntimeError):
    """The user-reviewed ledger partition contract is not satisfied."""


@dataclass(frozen=True)
class HumanLedgerPartitionSources:
    total_ledger: Path
    sales_share: Path
    buyout: Path

    def all(self) -> tuple[Path, Path, Path]:
        return (self.total_ledger, self.sales_share, self.buyout)


def load_partition_config(path: Path = CONFIG_PATH) -> dict:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if (
        payload.get("schema") != "m2.current.human_ledger_partition.v0.1"
        or payload.get("authorityMode") != "user_reviewed_workbook_membership"
        or payload.get("cashCategoryContract", {}).get(
            "machineClassificationAllowed"
        )
        is not False
    ):
        raise HumanLedgerPartitionError(
            "human ledger partition configuration differs"
        )
    return payload


def discover_partition_sources(
    data_dir: Path, config: dict | None = None
) -> HumanLedgerPartitionSources:
    contract = config or load_partition_config()
    source_dir = data_dir / Path(contract["sourceDirectory"]).name
    names = contract["workbooks"]
    sources = HumanLedgerPartitionSources(
        total_ledger=source_dir / names["totalLedger"],
        sales_share=source_dir / names["salesShare"],
        buyout=source_dir / names["buyout"],
    )
    missing = [path.name for path in sources.all() if not path.is_file()]
    if missing:
        raise HumanLedgerPartitionError(
            "human-reviewed ledger partition is incomplete: "
            + ", ".join(sorted(missing))
        )
    return sources


def _clean_text(value) -> str:
    if value is None:
        return ""
    try:
        if bool(pd.isna(value)):
            return ""
    except (TypeError, ValueError):
        pass
    return str(value).strip()


def _month_text(value) -> str:
    if isinstance(value, pd.Timestamp):
        return value.strftime("%Y-%m")
    parsed = pd.to_datetime(value, errors="coerce")
    if pd.isna(parsed):
        return _clean_text(value)
    return parsed.strftime("%Y-%m")


def _amount_decimal(value) -> Decimal:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return Decimal("0")
    return Decimal(str(value))


def _row_counter(
    frame: pd.DataFrame, base_columns: list[str]
) -> Counter[tuple]:
    canonical = pd.DataFrame(index=frame.index)
    for column in base_columns:
        if column == "年月":
            canonical[column] = frame[column].map(_month_text)
        elif column == "实销金额":
            canonical[column] = frame[column].map(_amount_decimal)
        else:
            canonical[column] = frame[column].map(_clean_text)
    return Counter(canonical.itertuples(index=False, name=None))


def _load_raw(path: Path, base_columns: list[str]) -> pd.DataFrame:
    frame = pd.read_excel(
        path,
        dtype={"渠道ID": "string", "我方作品ID": "string", TYPE_COLUMN: "string"},
    )
    missing = [
        column for column in [*base_columns, TYPE_COLUMN] if column not in frame
    ]
    if missing:
        raise HumanLedgerPartitionError(
            f"{path.name} missing required columns: {missing}"
        )
    return frame[[*base_columns, TYPE_COLUMN]].copy()


def _type_values(frame: pd.DataFrame) -> set[str]:
    return {_clean_text(value) for value in frame[TYPE_COLUMN]}


def _monthly(frame: pd.DataFrame) -> dict[str, dict[str, Decimal | int]]:
    result: dict[str, dict[str, Decimal | int]] = defaultdict(
        lambda: {"rowCount": 0, "amount": Decimal("0")}
    )
    for month, amount in zip(frame["年月"], frame["实销金额"]):
        key = _month_text(month)
        result[key]["rowCount"] = int(result[key]["rowCount"]) + 1
        result[key]["amount"] = Decimal(result[key]["amount"]) + _amount_decimal(
            amount
        )
    return dict(result)


def validate_partition(
    sources: HumanLedgerPartitionSources, base_columns: list[str]
) -> tuple[dict[str, pd.DataFrame], dict]:
    total = _load_raw(sources.total_ledger, base_columns)
    sales_share = _load_raw(sources.sales_share, base_columns)
    buyout = _load_raw(sources.buyout, base_columns)

    if _type_values(sales_share) != {"分成"}:
        raise HumanLedgerPartitionError(
            "sales-share workbook contains a non-sales-share type"
        )
    if _type_values(buyout) != {"买断"}:
        raise HumanLedgerPartitionError(
            "buyout workbook contains a non-buyout type"
        )
    if not _type_values(total).issubset({"", "买断"}):
        raise HumanLedgerPartitionError(
            "total ledger contains an unsupported presentation type"
        )

    total_rows = _row_counter(total, base_columns)
    sales_rows = _row_counter(sales_share, base_columns)
    buyout_rows = _row_counter(buyout, base_columns)
    overlap = sales_rows.keys() & buyout_rows.keys()
    if overlap:
        raise HumanLedgerPartitionError(
            "sales-share and buyout workbooks overlap on source rows"
        )
    combined = sales_rows + buyout_rows
    if combined != total_rows:
        missing_count = sum((total_rows - combined).values())
        extra_count = sum((combined - total_rows).values())
        raise HumanLedgerPartitionError(
            "total ledger row multiset differs from the reviewed split: "
            f"missing={missing_count}, extra={extra_count}"
        )

    totals = {
        "totalLedger": sum(
            (_amount_decimal(value) for value in total["实销金额"]),
            Decimal("0"),
        ),
        "salesShare": sum(
            (_amount_decimal(value) for value in sales_share["实销金额"]),
            Decimal("0"),
        ),
        "buyout": sum(
            (_amount_decimal(value) for value in buyout["实销金额"]),
            Decimal("0"),
        ),
    }
    if totals["salesShare"] + totals["buyout"] != totals["totalLedger"]:
        raise HumanLedgerPartitionError(
            "total ledger amount differs from sales-share plus buyout"
        )

    monthly = {
        "totalLedger": _monthly(total),
        "salesShare": _monthly(sales_share),
        "buyout": _monthly(buyout),
    }
    for month in sorted(
        set(monthly["totalLedger"])
        | set(monthly["salesShare"])
        | set(monthly["buyout"])
    ):
        total_cell = monthly["totalLedger"].get(
            month, {"rowCount": 0, "amount": Decimal("0")}
        )
        sales_cell = monthly["salesShare"].get(
            month, {"rowCount": 0, "amount": Decimal("0")}
        )
        buyout_cell = monthly["buyout"].get(
            month, {"rowCount": 0, "amount": Decimal("0")}
        )
        if int(sales_cell["rowCount"]) + int(buyout_cell["rowCount"]) != int(
            total_cell["rowCount"]
        ):
            raise HumanLedgerPartitionError(
                f"monthly row conservation failed at {month}"
            )
        if Decimal(sales_cell["amount"]) + Decimal(
            buyout_cell["amount"]
        ) != Decimal(total_cell["amount"]):
            raise HumanLedgerPartitionError(
                f"monthly amount conservation failed at {month}"
            )

    evidence = {
        "schema": "m2.current.human_ledger_partition.private_evidence.v0.1",
        "authorityMode": "user_reviewed_workbook_membership",
        "machineClassificationUsed": False,
        "checksPassed": [
            "schema_equal",
            "split_type_pure",
            "no_split_overlap",
            "row_multiset_conserved",
            "amount_conserved",
            "monthly_row_count_conserved",
            "monthly_amount_conserved",
        ],
        "rowCounts": {
            "totalLedger": len(total),
            "salesShare": len(sales_share),
            "buyout": len(buyout),
        },
        "amounts": {key: format(value, "f") for key, value in totals.items()},
        "monthRange": {
            key: {
                "first": min(value) if value else None,
                "last": max(value) if value else None,
            }
            for key, value in monthly.items()
        },
        "negativeRowCounts": {
            "totalLedger": int(
                sum(_amount_decimal(value) < 0 for value in total["实销金额"])
            ),
            "salesShare": int(
                sum(
                    _amount_decimal(value) < 0
                    for value in sales_share["实销金额"]
                )
            ),
            "buyout": int(
                sum(_amount_decimal(value) < 0 for value in buyout["实销金额"])
            ),
        },
        "rawRowsExported": False,
        "workOrChannelIdentifiersExported": False,
    }
    return {
        "totalLedger": total,
        "salesShare": sales_share,
        "buyout": buyout,
    }, evidence


def load_mapped_partition(
    data_dir: Path,
    base_columns: list[str],
    mapping: dict[str, str],
    bill_reader: Callable[[Path | pd.DataFrame, dict[str, str]], pd.DataFrame],
) -> tuple[dict[str, pd.DataFrame], dict, HumanLedgerPartitionSources]:
    sources = discover_partition_sources(data_dir)
    raw, evidence = validate_partition(sources, base_columns)
    sales_share = bill_reader(raw["salesShare"], mapping)
    sales_share["cashCategory"] = "sales_share"
    sales_share["cashCategoryAuthority"] = "user_reviewed_workbook_membership"
    buyout = bill_reader(raw["buyout"], mapping)
    buyout["cashCategory"] = "buyout"
    buyout["cashCategoryAuthority"] = "user_reviewed_workbook_membership"
    total = pd.concat([sales_share, buyout], ignore_index=True, sort=False)
    return {
        "totalLedger": total,
        "salesShare": sales_share,
        "buyout": buyout,
    }, evidence, sources
