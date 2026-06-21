from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
ADR_PATH = ROOT / "docs" / "technical-design" / "ADR-M1-数据库选型.md"
MODEL_PATH = ROOT / "docs" / "technical-design" / "M1-物理数据模型-v0.1.md"
VALIDATION_PATH = ROOT / "docs" / "technical-design" / "M1-物理数据模型-v0.1-validation.json"

EXPECTED_AT = [
    "AT-M1-001",
    "AT-M1-002",
    "AT-M1-003",
    "AT-M1-004",
    "AT-M1-005",
    "AT-M1-006",
    "AT-M1-007",
    "AT-M1-010",
    "AT-M1-011",
    "AT-M1-012",
    "AT-M1-020",
    "AT-M1-021",
    "AT-M1-022",
    "AT-M1-023",
    "AT-M1-024",
    "AT-M1-025",
    "AT-M1-026",
    "AT-M1-027",
    "AT-M1-028",
    "AT-M1-029",
    "AT-M1-030",
    "AT-M1-031",
    "AT-M1-040",
    "AT-M1-041",
    "AT-M1-050",
    "AT-M1-051",
    "AT-M1-052",
]

FORBIDDEN_FILE_PATTERNS = [
    re.compile(r"(^|[\\/])migrations?([\\/]|$)", re.I),
    re.compile(r"(^|[\\/])alembic([\\/]|$)", re.I),
    re.compile(r"\.(sql)$", re.I),
    re.compile(r"(^|[\\/])app\.(py|ts|tsx|js)$", re.I),
    re.compile(r"(^|[\\/])route\.(ts|tsx|js)$", re.I),
    re.compile(r"(^|[\\/])page\.(ts|tsx|js)$", re.I),
]


def main() -> None:
    adr = ADR_PATH.read_text(encoding="utf-8")
    model = MODEL_PATH.read_text(encoding="utf-8")
    table_sections = re.findall(r"^### 3\.\d+ `([^`]+)`", model, flags=re.M)
    missing_at = [item for item in EXPECTED_AT if item not in model]

    generated_forbidden_files: list[str] = []
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        rel = str(path.relative_to(ROOT))
        if rel.startswith(".analysis-python") or rel.startswith(".analysis-node-workspace"):
            continue
        if "node_modules" in rel.split("\\") or "node_modules" in rel.split("/"):
            continue
        if any(pattern.search(rel) for pattern in FORBIDDEN_FILE_PATTERNS):
            generated_forbidden_files.append(rel)

    checks = {
        "adr_exists": ADR_PATH.exists(),
        "model_exists": MODEL_PATH.exists(),
        "recommended_database_postgresql": "PostgreSQL 16+" in adr and "唯一推荐方案" in adr,
        "table_count": len(table_sections),
        "table_count_ok": len(table_sections) == 42,
        "all_27_m1_at_covered": not missing_at and len(EXPECTED_AT) == 27,
        "missing_at": missing_at,
        "numeric_32_18_confirmed": "NUMERIC(32,18)" in model and "float" in model and "double" in model,
        "natural_month_date_check_present": "date_trunc('month'" in model,
        "immutable_income_fact_present": "不可变收入事实" in model and "事实不删除" in model,
        "version_switch_visibility_present": "短事务" in model and "building" in model and "active" in model,
        "delete_and_revoke_separated": "删除：" in model and "撤销：" in model and "重新导入：" in model,
        "not_dependent_on_3099_basic_info": "不依赖 3,099 部标准作品基础信息已经全部填写" in model,
        "cache_authority_and_recompute_present": "权威来源" in model and "重算或变更触发" in model,
        "no_migrations_or_app_code_generated": not generated_forbidden_files,
        "forbidden_files": generated_forbidden_files,
    }
    checks["overall"] = all(
        value
        for key, value in checks.items()
        if key not in {"table_count", "missing_at", "forbidden_files"}
    )
    VALIDATION_PATH.write_text(json.dumps(checks, ensure_ascii=False, indent=2), encoding="utf-8")
    if not checks["overall"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
