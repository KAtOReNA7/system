"""Synthetic workbook checks; no private source or model execution is required."""
from __future__ import annotations

import sys
import tempfile
import unittest
from collections import Counter
from datetime import datetime
from decimal import Decimal
from pathlib import Path

from openpyxl import Workbook

ROOT = Path(__file__).resolve().parents[2]
sys.dont_write_bytecode = True
sys.path.insert(0, str(ROOT / "tools/m2-calibration"))
import human_ledger_partition as partition  # noqa: E402


COLUMNS = ["年月", "渠道ID", "文学库渠道名称", "授权分类", "我方作品ID", "作品名称", "实销金额"]
HEADERS = [*COLUMNS, "类型"]


def bill(month="2026-04", amount=10, work="100", kind="", name="合成作品"):
    return [month, "001", "合成渠道", "音频", work, name, amount, kind]


class HumanLedgerPartitionTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="partition-synthetic-")
        root = Path(self.temporary.name)
        self.sources = partition.HumanLedgerPartitionSources(
            root / "total.xlsx", root / "share.xlsx", root / "buyout.xlsx"
        )
        self.rows = {
            "totalLedger": [bill(), bill(amount=7.25, work="200", kind="买断")],
            "salesShare": [bill(kind="分成")],
            "buyout": [bill(amount=7.25, work="200", kind="买断")],
        }
        for role, rows in self.rows.items():
            self.write(role, rows)

    def tearDown(self):
        self.temporary.cleanup()

    def path(self, role):
        return dict(zip(self.rows, self.sources.all()))[role]

    def write(self, role, rows, headers=HEADERS):
        book = Workbook()
        sheet = book.active
        sheet.append(headers)
        for row in rows:
            sheet.append(row)
        book.save(self.path(role))
        book.close()

    def analyze(self):
        return partition.analyze_partition(self.sources, COLUMNS)

    def test_legal_signatures_and_success_evidence_preserve_the_frozen_contract(self):
        share = [bill("2026-03", 10, kind="分成"), bill(amount=0, kind="分成"), bill(amount=-2.5, kind="分成")]
        total = [[*row[:-1], ""] for row in share] + self.rows["buyout"]
        self.write("salesShare", share)
        self.write("totalLedger", total)
        before = {path: path.read_bytes() for path in self.sources.all()}
        frames, evidence = partition.validate_partition(self.sources, COLUMNS)
        self.assertEqual(evidence, {
            "schema": "m2.current.human_ledger_partition.private_evidence.v0.1",
            "authorityMode": "user_reviewed_workbook_membership", "machineClassificationUsed": False,
            "checksPassed": list(partition.CHECK_NAMES),
            "rowCounts": {"totalLedger": 4, "salesShare": 3, "buyout": 1},
            "amounts": {"totalLedger": "14.75", "salesShare": "7.5", "buyout": "7.25"},
            "monthRange": {
                "totalLedger": {"first": "2026-03", "last": "2026-04"},
                "salesShare": {"first": "2026-03", "last": "2026-04"},
                "buyout": {"first": "2026-04", "last": "2026-04"},
            },
            "negativeRowCounts": {"totalLedger": 1, "salesShare": 1, "buyout": 0},
            "rawRowsExported": False, "workOrChannelIdentifiersExported": False,
        })
        self.assertEqual(partition._row_counter(frames["salesShare"], COLUMNS), Counter({
            ("2026-03", "001", "合成渠道", "音频", "100", "合成作品", Decimal("10")): 1,
            ("2026-04", "001", "合成渠道", "音频", "100", "合成作品", Decimal("0")): 1,
            ("2026-04", "001", "合成渠道", "音频", "100", "合成作品", Decimal("-2.5")): 1,
        }))
        self.assertEqual(partition.PARTITION_VALIDATION_VERSION, "human-ledger-partition.v0.2")
        self.assertEqual(before, {path: path.read_bytes() for path in self.sources.all()})

    def test_numeric_months_no_longer_collapse_to_1970_or_mismatch_the_same_text_month(self):
        self.write("salesShare", [bill(202604, kind="分成")])
        _, analysis = self.analyze()
        self.assertTrue(all(analysis["checks"].values()))
        self.assertEqual(analysis["sourceRows"]["salesShare"][0]["signature"][0], "2026-04")
        self.write("salesShare", [bill(202605, kind="分成")])
        _, analysis = self.analyze()
        self.assertFalse(analysis["checks"]["row_multiset_conserved"])
        self.assertFalse(analysis["checks"]["monthly_row_count_conserved"])
        self.assertEqual(sum(analysis["missingRows"].values()), 1)
        self.assertEqual(sum(analysis["extraRows"].values()), 1)
        self.assertEqual(set(analysis["differences"]["byMonth"]), {"2026-04", "2026-05"})

    def test_invalid_months_fail_before_a_matching_signature_can_hide_them(self):
        for value in [None, float("nan"), "not-a-month", "2026-13", 202613, 45000, 2026.04, True, "2026-02-30", "2026"]:
            with self.subTest(value=value):
                with self.assertRaisesRegex(partition.HumanLedgerPartitionError, "invalid bill month"):
                    partition._month_text(value)
        for value in [202604, 202604.0, "202604", "2026-04", "2026/4", datetime(2026, 4, 15)]:
            self.assertEqual(partition._month_text(value), "2026-04")
        self.write("totalLedger", [bill("invalid"), self.rows["buyout"][0]])
        self.write("salesShare", [bill("invalid", kind="分成")])
        with self.assertRaisesRegex(partition.HumanLedgerPartitionError, "invalid bill month"):
            self.analyze()

    def test_missing_and_nonfinite_amounts_are_rejected_in_every_ledger_including_total(self):
        for value in [None, float("nan"), float("inf"), float("-inf"), "", "not-an-amount", Decimal("NaN")]:
            with self.subTest(value=str(value)):
                with self.assertRaisesRegex(partition.HumanLedgerPartitionError, "invalid bill amount"):
                    partition._amount_decimal(value)
        for role in self.rows:
            with self.subTest(role=role):
                rows = [row.copy() for row in self.rows[role]]
                rows[0][6] = None
                self.write(role, rows)
                with self.assertRaisesRegex(partition.HumanLedgerPartitionError, "invalid bill amount"):
                    self.analyze()
                self.write(role, self.rows[role])
        self.write("totalLedger", [bill(amount=None), self.rows["buyout"][0]])
        self.write("salesShare", [bill(amount=0, kind="分成")])
        with self.assertRaisesRegex(partition.HumanLedgerPartitionError, "invalid bill amount") as caught:
            partition.validate_partition(self.sources, COLUMNS)
        self.assertEqual(caught.exception.source_role, "totalLedger")
        self.assertEqual(caught.exception.row_number, 2)

    def test_actual_column_sets_must_match_but_reordering_does_not_change_business_schema(self):
        self.write("salesShare", [[*self.rows["salesShare"][0], "extra"]], [*HEADERS, "仅此文件有的列"])
        frames, analysis = self.analyze()
        self.assertIn("仅此文件有的列", frames["salesShare"].attrs["sourceColumns"])
        self.assertFalse(analysis["checks"]["schema_equal"])
        self.assertNotIn("schema_equal", analysis["evidence"]["checksPassed"])
        with self.assertRaisesRegex(partition.HumanLedgerPartitionError, "schemas differ"):
            partition.validate_partition(self.sources, COLUMNS)
        reversed_headers = list(reversed(HEADERS))
        self.write("salesShare", [list(reversed(self.rows["salesShare"][0]))], reversed_headers)
        _, analysis = self.analyze()
        self.assertTrue(all(analysis["checks"].values()))
        partition.validate_partition(self.sources, COLUMNS)

    def test_duplicate_or_missing_headers_cannot_be_hidden_by_pandas_projection(self):
        self.write("salesShare", [[*self.rows["salesShare"][0], 999]], [*HEADERS, "实销金额"])
        with self.assertRaisesRegex(partition.HumanLedgerPartitionError, "duplicate workbook columns"):
            self.analyze()
        self.write("salesShare", [[*self.rows["salesShare"][0], 999]], [*HEADERS, None])
        with self.assertRaisesRegex(partition.HumanLedgerPartitionError, "invalid or duplicate workbook columns"):
            self.analyze()
        self.write("salesShare", [self.rows["salesShare"][0][:-1]], COLUMNS)
        with self.assertRaisesRegex(partition.HumanLedgerPartitionError, "missing required columns"):
            self.analyze()

    def test_multiset_multiplicity_and_every_original_row_location_are_preserved(self):
        self.write("totalLedger", [bill(), bill(), self.rows["buyout"][0]])
        self.write("salesShare", [bill(kind="分成"), bill(kind="分成"), bill(kind="分成")])
        _, analysis = self.analyze()
        signature = analysis["sourceRows"]["salesShare"][0]["signature"]
        self.assertEqual(analysis["rowCounters"]["totalLedger"][signature], 2)
        self.assertEqual(analysis["rowCounters"]["salesShare"][signature], 3)
        self.assertEqual(analysis["extraRows"], Counter({signature: 1}))
        self.assertEqual(analysis["missingRows"], Counter())
        self.assertEqual([row["rowNumber"] for row in analysis["sourceRows"]["salesShare"]], [2, 3, 4])
        self.assertEqual(analysis["differences"]["amountSplitMinusTotal"], Decimal("10"))
        with self.assertRaisesRegex(partition.HumanLedgerPartitionError, "missing=0, extra=1"):
            partition.validate_partition(self.sources, COLUMNS)

    def test_zero_net_amount_difference_does_not_hide_two_way_row_changes(self):
        self.write("totalLedger", [bill(amount=10), bill(amount=20), self.rows["buyout"][0]])
        self.write("salesShare", [bill(amount=12, kind="分成"), bill(amount=18, kind="分成")])
        _, analysis = self.analyze()
        self.assertEqual(sum(analysis["missingRows"].values()), 2)
        self.assertEqual(sum(analysis["extraRows"].values()), 2)
        self.assertEqual(analysis["differences"]["amountSplitMinusTotal"], 0)
        self.assertTrue(analysis["checks"]["monthly_amount_conserved"])
        self.assertTrue(analysis["checks"]["monthly_row_count_conserved"])
        self.assertFalse(analysis["checks"]["row_multiset_conserved"])
        with self.assertRaisesRegex(partition.HumanLedgerPartitionError, "missing=2, extra=2"):
            partition.validate_partition(self.sources, COLUMNS)

    def test_text_field_changes_remain_distinct_even_when_month_and_amount_match(self):
        self.write("salesShare", [bill(kind="分成", name="另一合成作品名称")])
        _, analysis = self.analyze()
        self.assertFalse(analysis["checks"]["row_multiset_conserved"])
        self.assertEqual(analysis["differences"]["amountSplitMinusTotal"], 0)
        self.assertEqual(len(analysis["missingRows"]), 1)
        self.assertEqual(len(analysis["extraRows"]), 1)

    def test_literal_na_text_is_preserved_and_never_equated_with_an_empty_cell(self):
        for name in ["NA", "N/A", "null", "NULL", "nan"]:
            with self.subTest(name=name):
                self.write("totalLedger", [bill(name=""), self.rows["buyout"][0]])
                self.write("salesShare", [bill(kind="分成", name=name)])
                frames, analysis = self.analyze()
                self.assertEqual(frames["salesShare"].iloc[0]["作品名称"], name)
                self.assertEqual(frames["totalLedger"].iloc[0]["作品名称"], "")
                self.assertFalse(analysis["checks"]["row_multiset_conserved"])
                self.assertTrue(analysis["checks"]["split_type_pure"])
                self.assertTrue(analysis["checks"]["amount_conserved"])
                self.assertEqual(sum(analysis["missingRows"].values()), 1)
                self.assertEqual(sum(analysis["extraRows"].values()), 1)
                with self.assertRaisesRegex(partition.HumanLedgerPartitionError, "missing=1, extra=1"):
                    partition.validate_partition(self.sources, COLUMNS)
                self.write("totalLedger", [bill(name=name), self.rows["buyout"][0]])
                _, evidence = partition.validate_partition(self.sources, COLUMNS)
                self.assertEqual(evidence["checksPassed"], list(partition.CHECK_NAMES))

    def test_cash_type_and_cross_split_overlap_are_checks_not_machine_classification(self):
        self.write("buyout", [bill(kind="买断")])
        self.write("totalLedger", [bill(), bill(kind="买断")])
        _, analysis = self.analyze()
        self.assertTrue(analysis["checks"]["row_multiset_conserved"])
        self.assertFalse(analysis["checks"]["no_split_overlap"])
        self.assertEqual(len(analysis["overlapRows"]), 1)
        with self.assertRaisesRegex(partition.HumanLedgerPartitionError, "overlap"):
            partition.validate_partition(self.sources, COLUMNS)
        self.write("buyout", self.rows["buyout"])
        self.write("totalLedger", self.rows["totalLedger"])
        self.write("salesShare", [bill(kind="买断")])
        _, analysis = self.analyze()
        self.assertFalse(analysis["checks"]["split_type_pure"])
        with self.assertRaisesRegex(partition.HumanLedgerPartitionError, "non-sales-share"):
            partition.validate_partition(self.sources, COLUMNS)

    def test_equal_duplicates_are_preserved_as_records_not_silently_deduplicated(self):
        self.write("totalLedger", [bill(), bill(), self.rows["buyout"][0]])
        self.write("salesShare", [bill(kind="分成"), bill(kind="分成")])
        _, analysis = self.analyze()
        self.assertTrue(all(analysis["checks"].values()))
        self.assertEqual(analysis["totals"]["salesShare"], Decimal("20"))
        self.assertEqual(len(analysis["sourceRows"]["salesShare"]), 2)
        self.assertEqual(list(analysis["rowCounters"]["salesShare"].values()), [2])


if __name__ == "__main__":
    unittest.main()
