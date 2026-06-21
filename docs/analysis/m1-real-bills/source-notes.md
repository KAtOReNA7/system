# 分析来源与复现说明

```json
{
  "source_inventory": [
    {
      "file_id": "F001",
      "size": 7792878,
      "sha256": "866d064f40cf751fd8e773b70bb17270633e9a8fe40305c5f16454ec9f429803"
    }
  ],
  "script": "tools/m1-data-analysis/analyze_real_bills.py",
  "input_policy": "read-only; source size, mtime and SHA-256 verified before and after",
  "public_output_policy": "aggregates and anonymized sample codes only",
  "private_output_policy": "raw review samples under Git-ignored data/m1-real-bills-private",
  "definitions": {
    "row_count": "non-empty rows after the exact seven-column header",
    "total_amount": "sum of exact 实销金额 tokens read from XLSX XML, including zero and negative values; no display rounding",
    "duplicate_candidate": "same file/sheet and identical seven raw cell values; not confirmed duplicate",
    "launch_candidate": "earliest parseable month per standard-work body; zero/negative eligibility remains pending"
  },
  "chart_map": [
    {
      "section": "数据范围",
      "chart": "assets/monthly-row-count.png",
      "family": "Trend line",
      "claim": "月度记录量分布和覆盖变化"
    },
    {
      "section": "金额质量",
      "chart": "assets/amount-sign-count.png",
      "family": "Bar",
      "claim": "正数、零值、负数和无效金额记录规模"
    },
    {
      "section": "阻断问题",
      "chart": "assets/issue-candidate-count.png",
      "family": "Ranked horizontal bar",
      "claim": "各类待确认问题的受影响行数"
    },
    {
      "section": "作品 ID",
      "chart": "assets/work-id-format.png",
      "family": "Ranked horizontal bar",
      "claim": "当前账单中作品 ID 的物理存储与格式分布"
    }
  ],
  "omissions": [
    "No raw names, channel names, work IDs or row-level amounts in Git-trackable reports.",
    "No status, mapping, cleaning, merge or deduplication rule was enabled.",
    "No production SLA inferred from a single-machine run."
  ]
}
```
