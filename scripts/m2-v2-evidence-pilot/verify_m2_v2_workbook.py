#!/usr/bin/env python3
"""Independent, read-only OOXML workbook verifier.

Every reported fact is derived from the XLSX ZIP/XML object.  The verifier
does not accept generator-supplied counts or assertions, does not emit cell
values or hyperlink targets, and never claims that a visual review occurred.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import posixpath
import re
import sys
import zipfile
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse
from xml.etree import ElementTree as ET

MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships"
NS = {"m": MAIN, "r": REL, "p": PKG_REL}

MAX_ENTRY_COUNT = 10_000
MAX_TOTAL_UNCOMPRESSED = 256 * 1024 * 1024
SAFE_HYPERLINK_PROTOCOLS = frozenset({"http", "https", "mailto"})
PROFILE_SHEETS = ("说明与汇总", "优先复核", "全部证据", "未解析作品")

EXCEL_ERROR_TOKEN = re.compile(
    r"#(?:NULL!|DIV/0!|VALUE!|REF!|NAME\?|NUM!|N/A|GETTING_DATA|SPILL!|CALC!|FIELD!|BLOCKED!|UNKNOWN!|CONNECT!|BUSY!|PYTHON!)",
    re.I,
)
IMPLEMENTATION_ERROR = re.compile(
    r"(?:implementation[ _-]?error|not[ _-]?implemented|unsupported[ _-]?formula)",
    re.I,
)
FORMULA_HYPERLINK = re.compile(r"^\s*HYPERLINK\s*\(", re.I)
EXTERNAL_DEFINED_NAME = re.compile(r"\[[^\]\r\n]+\](?:[^!\r\n]+!)?", re.I)

# These patterns are deliberately local and fixed.  Caller input can only add
# stricter forbidden tokens; it cannot make any of these checks disappear.
FORBIDDEN_VALUE_PATTERNS = (
    re.compile(r"\b(?:rawResponse|chainOfThought|promptTranscript|apiResponseBody)\b", re.I),
    re.compile(r"(?:^|[\\/])data[\\/]private-output(?:[\\/]|$)", re.I),
    re.compile(r"(?:^|[\\/])\.env(?:\.[A-Za-z0-9_-]+)?(?:$|[\s\\/])", re.I),
    re.compile(r"\b(?:full160Authorized|researchApproved|modelEligible)\s*[:=]\s*true\b", re.I),
)
INTERNAL_ID_PATTERNS = (
    re.compile(
        r"\b(?:standardWorkId|standard_work_id|internalWorkId|internal_work_id|internalId|internal_id)\b",
        re.I,
    ),
    re.compile(r"(?:标准作品|内部作品|内部工作|内部)[ _-]?(?:ID|Id|id|编号)"),
)
INCOME_VALUE_PATTERNS = (
    re.compile(
        r"\b(?:income|revenue|billingAmount|billing_amount|cashForecast|cash_forecast|buyoutMonthlyEquivalent)\b",
        re.I,
    ),
    re.compile(
        r"(?:收入|营收|账单|现金预测|买断月均)(?:金额|数值|预测值|合计|总额)?\s*[:=：]\s*[-+]?\d",
        re.I,
    ),
)
SECRET_PATTERNS = (
    re.compile(r"\bBearer\s+[A-Za-z0-9._~+/=-]{12,}", re.I),
    re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b"),
    re.compile(r"(?:api[_-]?key|password|secret)\s*[:=]\s*[^\s,;]{8,}", re.I),
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
)


def inspect_workbook(
    path: Path,
    expected_sheets: tuple[str, ...] = (),
    forbidden_tokens: tuple[str, ...] = (),
    profile: str | None = None,
) -> dict:
    issues: list[str] = []
    workbook_path = path.resolve()
    if not workbook_path.is_file():
        return verdict(path, ["workbook_missing"], {})

    try:
        with zipfile.ZipFile(workbook_path) as archive:
            names = archive.namelist()
            names_set = set(names)
            unsafe = [name for name in names if name.startswith(("/", "\\")) or ".." in Path(name).parts]
            if unsafe:
                issues.append("unsafe_zip_member_path")
            if len(names_set) != len(names):
                issues.append("duplicate_zip_member_name")
            if len(names) > MAX_ENTRY_COUNT:
                issues.append("zip_entry_count_limit_exceeded")
            total_uncompressed = sum(item.file_size for item in archive.infolist())
            if total_uncompressed > MAX_TOTAL_UNCOMPRESSED:
                issues.append("zip_uncompressed_size_limit_exceeded")
            for required in ("[Content_Types].xml", "xl/workbook.xml", "xl/_rels/workbook.xml.rels"):
                if required not in names_set:
                    issues.append(f"required_ooxml_part_missing:{required}")
            if issues:
                return verdict(
                    path,
                    issues,
                    {"zipEntryCount": len(names), "totalUncompressedBytes": total_uncompressed},
                )

            workbook = parse_xml(archive, "xl/workbook.xml")
            workbook_rels = relationship_map(parse_xml(archive, "xl/_rels/workbook.xml.rels"))
            shared_strings = read_shared_strings(archive)
            content_records: list[str] = list(shared_strings)
            sheets: list[dict] = []
            cached_formula_errors: list[dict] = []
            hyperlink_target_records: list[dict] = []
            totals = {
                "cellCount": 0,
                "rowCount": 0,
                "formulaCount": 0,
                "formulaErrorCount": 0,
                "formulaHyperlinkCount": 0,
                "nativeHyperlinkCount": 0,
                "unsafeHyperlinkCount": 0,
                "invalidHyperlinkRelationshipCount": 0,
                "dataValidationCount": 0,
                "cachedFormulaErrorCount": 0,
                "styledCellCount": 0,
                "hiddenRowCount": 0,
                "hiddenColumnCount": 0,
            }

            for sheet_index, sheet in enumerate(workbook.findall("m:sheets/m:sheet", NS), start=1):
                name = sheet.attrib.get("name", "")
                state = sheet.attrib.get("state", "visible")
                rel_id = sheet.attrib.get(f"{{{REL}}}id", "")
                relation = workbook_rels.get(rel_id)
                if not relation:
                    issues.append(f"worksheet_relationship_missing:{sheet_index}")
                    continue
                target = normalize_part("xl/workbook.xml", relation["target"])
                if target not in names_set:
                    issues.append(f"worksheet_part_missing:{sheet_index}")
                    continue
                result = inspect_sheet(archive, target, shared_strings, sheet_index)
                content_records.extend(result.pop("_content"))
                cached_formula_errors.extend(
                    {"sheetName": name, **item} for item in result.pop("_cachedFormulaErrors")
                )
                hyperlink_target_records.extend(result.pop("_hyperlinkTargets"))
                result.update({"name": name, "state": state, "part": target})
                sheets.append(result)
                for key in totals:
                    totals[key] += result[key]

            sheet_names = [sheet["name"] for sheet in sheets]
            row_counts = [sheet["rowCount"] for sheet in sheets]
            for expected in expected_sheets:
                if expected not in sheet_names:
                    issues.append(f"expected_sheet_missing:{digest(expected)[:16]}")
            if len(set(sheet_names)) != len(sheet_names):
                issues.append("duplicate_sheet_name")
            if any(sheet["state"] != "visible" for sheet in sheets):
                issues.append("hidden_sheet_present")
            if totals["formulaHyperlinkCount"]:
                issues.append("formula_hyperlink_forbidden_use_native_hyperlink")
            if totals["formulaErrorCount"]:
                issues.append("formula_or_cached_value_error_present")
            if totals["unsafeHyperlinkCount"] or totals["invalidHyperlinkRelationshipCount"]:
                issues.append("unsafe_or_invalid_hyperlink_target_present")

            defined_names: list[dict] = []
            external_defined_name_digests: set[str] = set()
            for item in workbook.findall("m:definedNames/m:definedName", NS):
                name = item.attrib.get("name", "")
                formula = "".join(item.itertext())
                content_records.extend((name, formula))
                defined_names.append({"nameDigest": digest(name), "formulaDigest": digest(formula)})
                if EXTERNAL_DEFINED_NAME.search(formula):
                    external_defined_name_digests.add(digest(formula))

            external_links = inspect_external_links(archive, workbook, workbook_rels)
            external_links.update(external_defined_name_digests)
            external_link_parts = sorted(name for name in names if name.startswith("xl/externalLinks/"))
            if external_links or external_link_parts:
                issues.append("external_workbook_link_present")

            custom_xml_parts = sorted(
                name for name in names if name.startswith("customXml/") and name.endswith(".xml")
            )
            for custom_part in custom_xml_parts:
                custom_root = parse_xml(archive, custom_part)
                content_records.extend(xml_text_and_attributes(custom_root))
            if custom_xml_parts:
                issues.append("custom_xml_part_present")

            style_summary = inspect_styles(archive)
            content_blob = "\n".join(content_records)
            fixed_forbidden_count = match_count(FORBIDDEN_VALUE_PATTERNS, content_blob)
            caller_forbidden_count = sum(
                content_blob.casefold().count(token.casefold()) for token in forbidden_tokens if token
            )
            forbidden_value_count = fixed_forbidden_count + caller_forbidden_count
            internal_id_count = match_count(INTERNAL_ID_PATTERNS, content_blob)
            income_value_count = match_count(INCOME_VALUE_PATTERNS, content_blob)
            secret_count = match_count(SECRET_PATTERNS, content_blob)
            if forbidden_value_count:
                issues.append("forbidden_value_present")
            if internal_id_count:
                issues.append("internal_id_present")
            if income_value_count:
                issues.append("income_value_present")
            if secret_count:
                issues.append("secret_like_content_present")

            hyperlink_targets = aggregate_hyperlink_targets(hyperlink_target_records)
            external_link_digest = digest("\n".join(sorted(external_links)))
            summary = {
                "workbookSha256": file_digest(workbook_path),
                "workbookByteLength": workbook_path.stat().st_size,
                "zipEntryCount": len(names),
                "totalUncompressedBytes": total_uncompressed,
                "sheetCount": len(sheets),
                "sheetNames": sheet_names,
                "rowCounts": row_counts,
                "rowCountBySheet": dict(zip(sheet_names, row_counts, strict=True)),
                "visibleSheetCount": sum(sheet["state"] == "visible" for sheet in sheets),
                "hiddenSheetCount": sum(sheet["state"] != "visible" for sheet in sheets),
                "sheets": sheets,
                **totals,
                "cachedFormulaErrors": cached_formula_errors,
                "hyperlinkCount": totals["nativeHyperlinkCount"],
                "hyperlinkTargets": hyperlink_targets,
                "hyperlinkTargetAggregateDigest": digest(
                    canonical_json(hyperlink_targets)
                ),
                "validationCount": totals["dataValidationCount"],
                "definedNameCount": len(defined_names),
                "definedNames": defined_names,
                "externalLinkCount": len(external_links),
                "externalLinkPartCount": len(external_link_parts),
                "externalLinkTargetAggregateDigest": external_link_digest,
                "customXmlPartCount": len(custom_xml_parts),
                "styleSummary": style_summary,
                "forbiddenValueCount": forbidden_value_count,
                "fixedForbiddenValueCount": fixed_forbidden_count,
                "callerForbiddenTokenMatchCount": caller_forbidden_count,
                "forbiddenTokenMatchCount": caller_forbidden_count,
                "internalIdCount": internal_id_count,
                "incomeValueCount": income_value_count,
                "secretCount": secret_count,
                "secretPatternMatchCount": secret_count,
            }
            apply_profile(profile, summary, issues)
            return verdict(path, issues, summary)
    except zipfile.BadZipFile:
        return verdict(path, ["xlsx_zip_invalid"], {})
    except (ET.ParseError, KeyError, ValueError, IndexError) as error:
        return verdict(path, [f"ooxml_parse_failed:{type(error).__name__}"], {})


def inspect_sheet(
    archive: zipfile.ZipFile,
    part: str,
    shared_strings: list[str],
    sheet_index: int,
) -> dict:
    root = parse_xml(archive, part)
    rel_part = posixpath.join(posixpath.dirname(part), "_rels", posixpath.basename(part) + ".rels")
    rels = relationship_map(parse_xml(archive, rel_part)) if rel_part in archive.namelist() else {}
    content: list[str] = []
    cached_formula_errors: list[dict] = []
    hyperlink_targets: list[dict] = []
    formula_count = formula_errors = formula_links = styled = 0
    unsafe_links = invalid_link_rels = 0
    cells = root.findall(".//m:c", NS)

    for cell in cells:
        formula = cell.find("m:f", NS)
        value = cell_value(cell, shared_strings)
        storage_text = cell_storage_text(cell)
        if storage_text is not None:
            content.append(storage_text)
        if formula is not None:
            formula_count += 1
            formula_text = "".join(formula.itertext()).strip()
            content.append(formula_text)
            if FORMULA_HYPERLINK.match(formula_text):
                formula_links += 1
            cached_text = value or ""
            cached_tokens = EXCEL_ERROR_TOKEN.findall(cached_text)
            formula_tokens = EXCEL_ERROR_TOKEN.findall(formula_text)
            cached_is_error = cell.attrib.get("t") == "e" or bool(cached_tokens) or bool(
                IMPLEMENTATION_ERROR.search(cached_text)
            )
            formula_is_error = bool(formula_tokens) or bool(IMPLEMENTATION_ERROR.search(formula_text))
            if cached_is_error or formula_is_error:
                formula_errors += 1
            if cached_is_error:
                error_class = "excel_error_token" if cached_tokens or cell.attrib.get("t") == "e" else "implementation_error"
                cached_formula_errors.append(
                    {
                        "sheetIndex": sheet_index,
                        "cellRef": cell.attrib.get("r", ""),
                        "errorClass": error_class,
                        "errorDigest": digest(cached_text),
                    }
                )
        if int(cell.attrib.get("s", "0") or 0) > 0:
            styled += 1

    validations = root.findall("m:dataValidations/m:dataValidation", NS)
    for validation in validations:
        content.extend(value for value in validation.attrib.values() if value)
        for formula_name in ("formula1", "formula2"):
            formula_value = validation.findtext(f"m:{formula_name}", default="", namespaces=NS)
            if formula_value:
                content.append(formula_value)

    native_links = 0
    for link in root.findall("m:hyperlinks/m:hyperlink", NS):
        native_links += 1
        content.extend(
            value for key, value in link.attrib.items() if key in {"display", "tooltip"} and value
        )
        rel_id = link.attrib.get(f"{{{REL}}}id")
        location = link.attrib.get("location")
        if rel_id:
            relation = rels.get(rel_id)
            if not relation:
                invalid_link_rels += 1
                continue
            target = relation.get("target", "")
            raw_target_mode = relation.get("targetMode", "Internal")
            target_mode = raw_target_mode if raw_target_mode in {"External", "Internal"} else "Unknown"
            parsed = urlparse(target)
            raw_protocol = parsed.scheme.lower() if parsed.scheme else (
                "internal" if target_mode != "External" else "relative"
            )
            protocol = raw_protocol if raw_protocol in SAFE_HYPERLINK_PROTOCOLS | {"internal", "relative"} else "unsafe"
            raw_relationship_type = relation.get("type", "")
            relationship_type = "hyperlink" if raw_relationship_type.endswith("/hyperlink") else "unknown"
            safe = (
                target_mode == "External"
                and raw_protocol in SAFE_HYPERLINK_PROTOCOLS
                and relationship_type == "hyperlink"
                and not parsed.username
                and not parsed.password
            )
            if not safe:
                unsafe_links += 1
            hyperlink_targets.append(
                {
                    "protocol": protocol,
                    "targetMode": target_mode,
                    "relationshipType": relationship_type,
                    "targetDigest": digest(target),
                }
            )
        elif location:
            hyperlink_targets.append(
                {
                    "protocol": "internal",
                    "targetMode": "Internal",
                    "relationshipType": "location",
                    "targetDigest": digest(location),
                }
            )
        else:
            invalid_link_rels += 1

    rows = root.findall("m:sheetData/m:row", NS)
    return {
        "cellCount": len(cells),
        "rowCount": len(rows),
        "formulaCount": formula_count,
        "formulaErrorCount": formula_errors,
        "formulaHyperlinkCount": formula_links,
        "nativeHyperlinkCount": native_links,
        "unsafeHyperlinkCount": unsafe_links,
        "invalidHyperlinkRelationshipCount": invalid_link_rels,
        "dataValidationCount": len(validations),
        "cachedFormulaErrorCount": len(cached_formula_errors),
        "styledCellCount": styled,
        "hiddenRowCount": sum(
            row.attrib.get("hidden") in ("1", "true") for row in root.findall(".//m:row", NS)
        ),
        "hiddenColumnCount": sum(
            col.attrib.get("hidden") in ("1", "true") for col in root.findall("m:cols/m:col", NS)
        ),
        "_content": content,
        "_cachedFormulaErrors": cached_formula_errors,
        "_hyperlinkTargets": hyperlink_targets,
    }


def cell_value(cell: ET.Element, shared_strings: list[str]) -> str | None:
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        return "".join(node.text or "" for node in cell.findall(".//m:is//m:t", NS))
    value = cell.findtext("m:v", default=None, namespaces=NS)
    if value is None:
        return None
    if cell_type == "s":
        return shared_strings[int(value)]
    return value


def cell_storage_text(cell: ET.Element) -> str | None:
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        return "".join(node.text or "" for node in cell.findall(".//m:is//m:t", NS))
    # Shared strings are scanned exactly once from sharedStrings.xml.
    if cell_type == "s":
        return None
    return cell.findtext("m:v", default=None, namespaces=NS)


def read_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = parse_xml(archive, "xl/sharedStrings.xml")
    return [
        "".join(node.text or "" for node in item.findall(".//m:t", NS))
        for item in root.findall("m:si", NS)
    ]


def inspect_styles(archive: zipfile.ZipFile) -> dict:
    if "xl/styles.xml" not in archive.namelist():
        return {
            "present": False,
            "cellFormatCount": 0,
            "cellStyleFormatCount": 0,
            "customNumberFormatCount": 0,
            "fontCount": 0,
            "fillCount": 0,
            "borderCount": 0,
        }
    root = parse_xml(archive, "xl/styles.xml")
    return {
        "present": True,
        "cellFormatCount": len(root.findall("m:cellXfs/m:xf", NS)),
        "cellStyleFormatCount": len(root.findall("m:cellStyleXfs/m:xf", NS)),
        "customNumberFormatCount": len(root.findall("m:numFmts/m:numFmt", NS)),
        "fontCount": len(root.findall("m:fonts/m:font", NS)),
        "fillCount": len(root.findall("m:fills/m:fill", NS)),
        "borderCount": len(root.findall("m:borders/m:border", NS)),
    }


def inspect_external_links(
    archive: zipfile.ZipFile,
    workbook: ET.Element,
    workbook_rels: dict[str, dict[str, str]],
) -> set[str]:
    external_links: set[str] = set()
    for reference in workbook.findall("m:externalReferences/m:externalReference", NS):
        rel_id = reference.attrib.get(f"{{{REL}}}id", "")
        relation = workbook_rels.get(rel_id)
        if relation:
            external_links.add(digest(normalize_relationship_target("xl/workbook.xml", relation)))
        else:
            external_links.add(digest(f"missing:{rel_id}"))

    for rel_part in (name for name in archive.namelist() if name.endswith(".rels")):
        source_part = relationship_source_part(rel_part)
        root = parse_xml(archive, rel_part)
        for relation in relationship_map(root).values():
            relationship_type = relation.get("type", "").rsplit("/", 1)[-1]
            if relationship_type in {"externalLink", "externalLinkPath"}:
                external_links.add(digest(normalize_relationship_target(source_part, relation)))

    for part in archive.namelist():
        if part.startswith("xl/externalLinks/") and not part.endswith(".rels"):
            external_links.add(digest(part))
    return external_links


def normalize_relationship_target(source_part: str, relation: dict[str, str]) -> str:
    target = relation.get("target", "")
    if relation.get("targetMode") == "External":
        return target
    return normalize_part(source_part, target)


def relationship_source_part(rel_part: str) -> str:
    directory = posixpath.dirname(rel_part)
    if posixpath.basename(directory) != "_rels":
        return ""
    source_directory = posixpath.dirname(directory)
    source_name = posixpath.basename(rel_part)[:-5]
    return posixpath.join(source_directory, source_name) if source_directory else source_name


def xml_text_and_attributes(root: ET.Element) -> list[str]:
    values: list[str] = []
    for element in root.iter():
        if element.text:
            values.append(element.text)
        if element.tail:
            values.append(element.tail)
        values.extend(value for value in element.attrib.values() if value)
    return values


def aggregate_hyperlink_targets(records: list[dict]) -> list[dict]:
    counts = Counter(
        (
            item["protocol"],
            item["targetMode"],
            item["relationshipType"],
            item["targetDigest"],
        )
        for item in records
    )
    return [
        {
            "protocol": protocol,
            "targetMode": target_mode,
            "relationshipType": relationship_type,
            "targetDigest": target_digest,
            "occurrenceCount": count,
        }
        for (protocol, target_mode, relationship_type, target_digest), count in sorted(counts.items())
    ]


def apply_profile(profile: str | None, summary: dict, issues: list[str]) -> None:
    if profile is None:
        return
    if profile != "m2-v2-canary-v3-review-v0.4":
        issues.append("verification_profile_unknown")
        return
    if tuple(summary["sheetNames"]) != PROFILE_SHEETS:
        issues.append("profile_sheet_set_or_order_mismatch")
    if summary["sheetCount"] != 4 or summary["visibleSheetCount"] != 4 or summary["hiddenSheetCount"] != 0:
        issues.append("profile_sheet_visibility_mismatch")
    if summary["nativeHyperlinkCount"] != 115 or summary["hyperlinkCount"] != 115:
        issues.append("profile_native_hyperlink_count_mismatch")
    if summary["formulaHyperlinkCount"] != 0:
        issues.append("profile_formula_hyperlink_present")
    if summary["formulaErrorCount"] != 0 or summary["cachedFormulaErrors"]:
        issues.append("profile_formula_error_present")
    if summary["unsafeHyperlinkCount"] != 0 or summary["invalidHyperlinkRelationshipCount"] != 0:
        issues.append("profile_hyperlink_safety_mismatch")
    if summary["dataValidationCount"] < 3:
        issues.append("profile_data_validation_count_too_low")
    if not summary["styleSummary"]["present"] or summary["styledCellCount"] == 0:
        issues.append("profile_styles_missing")
    for key, issue in (
        ("forbiddenValueCount", "profile_forbidden_value_present"),
        ("internalIdCount", "profile_internal_id_present"),
        ("incomeValueCount", "profile_income_value_present"),
        ("secretCount", "profile_secret_present"),
        ("externalLinkCount", "profile_external_link_present"),
        ("customXmlPartCount", "profile_custom_xml_present"),
    ):
        if summary[key] != 0:
            issues.append(issue)


def relationship_map(root: ET.Element) -> dict[str, dict[str, str]]:
    return {
        item.attrib.get("Id", ""): {
            "target": item.attrib.get("Target", ""),
            "targetMode": item.attrib.get("TargetMode", "Internal"),
            "type": item.attrib.get("Type", ""),
        }
        for item in root.findall("p:Relationship", NS)
    }


def normalize_part(source_part: str, target: str) -> str:
    if target.startswith("/"):
        return target.lstrip("/")
    return posixpath.normpath(posixpath.join(posixpath.dirname(source_part), target))


def parse_xml(archive: zipfile.ZipFile, name: str) -> ET.Element:
    return ET.fromstring(archive.read(name))


def match_count(patterns: tuple[re.Pattern, ...], value: str) -> int:
    return sum(len(pattern.findall(value)) for pattern in patterns)


def verdict(path: Path, issues: list[str], summary: dict) -> dict:
    return {
        "schema": "m2.v2.independent-workbook-verification.v0.1",
        "workbookFileName": path.name,
        "verificationBasis": "xlsx_zip_xml_actual_object",
        "generatorAssertionsTrusted": False,
        "passed": not issues,
        "issues": sorted(set(issues)),
        "visualReviewAttested": False,
        "visualReviewStatus": "NOT_PERFORMED",
        **summary,
    }


def canonical_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def file_digest(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("workbook", type=Path)
    parser.add_argument("--expect-sheet", action="append", default=[])
    parser.add_argument("--forbidden-token", action="append", default=[])
    parser.add_argument("--profile", choices=["m2-v2-canary-v3-review-v0.4"])
    args = parser.parse_args()
    result = inspect_workbook(
        args.workbook,
        tuple(args.expect_sheet),
        tuple(args.forbidden_token),
        args.profile,
    )
    json.dump(result, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
