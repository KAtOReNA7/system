#!/usr/bin/env python3
"""Package-complete OOXML verifier used by the canonical workbook verifier.

This module has no CLI.  ``verify_m2_v2_workbook.py`` is the only executable
entrypoint.  The implementation is deliberately stdlib-only and never emits
cell text, relationship targets, host names, or package member names.
"""

from __future__ import annotations

import binascii
import hashlib
import json
import posixpath
import re
import struct
import unicodedata
import zipfile
from pathlib import Path
from urllib.parse import unquote, urlparse
from xml.etree import ElementTree as ET


SCHEMA = "m2.v2.independent-workbook-verification.v0.2"
PROFILE = "m2-v2-pr7-s1-b5-strict-v0.2"
CONTRACT_RELATIVE = Path(
    "docs/technical-design/m2-v2/M2-v2-workbook-independent-verification-v0.2.json"
)
SHA256 = re.compile(r"^[a-f0-9]{64}$")
REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
CONTENT_TYPES_NS = "http://schemas.openxmlformats.org/package/2006/content-types"
XML_NS = "http://www.w3.org/XML/1998/namespace"
EOCD = b"PK\x05\x06"
LOCAL_HEADER = b"PK\x03\x04"
UTF8_FLAG = 0x0800
ENCRYPTED_FLAGS = 0x0001 | 0x0040
SUPPORTED_METHODS = {zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED}
SAFE_SCHEMES = {"http", "https", "mailto"}
HIGH_RISK_PART_MARKERS = (
    "/media/",
    "/embeddings/",
    "/oleobjects/",
    "/activex/",
    "/ctrlprops/",
    "/printersettings/",
)
FORBIDDEN_PART_MARKERS = (
    "/comments",
    "/threadedcomments/",
    "/persons/",
    "/drawings/",
    "/charts/",
    "/pivot",
    "/slicer",
    "/connections",
    "/query",
    "/externallinks/",
    "/customxml/",
)
FORBIDDEN_PART_SUFFIXES = (".bin", ".vml")
SECRET_PATTERNS = (
    re.compile(r"\bBearer\s+[A-Za-z0-9._~+/=-]{12,}", re.I),
    re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b"),
    re.compile(r"(?:api[_-]?key|password|secret)\s*[:=]\s*[^\s,;]{8,}", re.I),
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
)


def load_contract(repository_root: Path) -> tuple[dict, str]:
    contract_path = repository_root / CONTRACT_RELATIVE
    text = contract_path.read_text(encoding="utf-8")
    portable = text.replace("\r\n", "\n").replace("\r", "\n").encode("utf-8")
    return json.loads(text), hashlib.sha256(portable).hexdigest()


def inspect_package_complete(
    path: Path,
    repository_root: Path,
    base_facts: dict | None = None,
) -> dict:
    """Return the exact v0.2 receipt; all facts are independently derived."""

    contract, policy_digest = load_contract(repository_root)
    issue_codes: list[tuple[str, str | None, str | None, str]] = []
    part_decisions: list[dict] = []
    hyperlink_lineage: list[dict] = []
    derived_facts: list[dict] = []
    workbook_digest = "0" * 64
    member_set_digest = digest_json([])
    content_type_digest = digest_json([])
    relationship_digest = digest_json([])

    if not path.is_file():
        issue_codes.append(("workbook_missing", None, None, "required object is absent"))
        return make_receipt(
            workbook_digest,
            policy_digest,
            member_set_digest,
            content_type_digest,
            relationship_digest,
            part_decisions,
            derived_facts,
            hyperlink_lineage,
            issue_codes,
        )

    workbook_digest = file_digest(path)
    archive_bytes = path.read_bytes()
    budgets = contract["resourceBudgets"]

    try:
        with zipfile.ZipFile(path) as archive:
            infos = archive.infolist()
            zip_issues, member_records = inspect_zip_structure(archive_bytes, archive, infos, budgets)
            issue_codes.extend(zip_issues)
            member_set_digest = digest_json(member_records)

            content_types, content_issues = inspect_content_types(archive, infos, contract, budgets)
            issue_codes.extend(content_issues)
            content_type_digest = digest_json(content_types["records"])

            part_classes, class_issues = classify_parts(infos, content_types, contract)
            issue_codes.extend(class_issues)

            relationships, relation_issues, hyperlinks = inspect_relationships(
                archive, infos, part_classes, contract, budgets
            )
            issue_codes.extend(relation_issues)
            relationship_digest = digest_json(relationships)
            hyperlink_lineage = aggregate_hyperlinks(hyperlinks)
            issue_codes.extend(
                inspect_semantic_cardinalities(
                    archive,
                    infos,
                    part_classes,
                    relationships,
                    contract,
                    budgets,
                )
            )

            reachable, closure_issues = inspect_graph_closure(infos, part_classes, relationships)
            issue_codes.extend(closure_issues)

            scan_values: list[str] = []
            for info in infos:
                name = normalize_member_name(info.filename)
                part_class = part_classes.get(name, "unknown")
                content_type = content_types["resolved"].get(name, "")
                decision = "HANDLED_AND_SCANNED"
                justification = ""
                handler = handler_for(part_class)

                if part_class == "unknown":
                    decision = "REJECTED"
                    handler = ""
                    issue_codes.append(part_rejection(name))
                    if is_xml_part(name):
                        scan_values.append(
                            archive.read(info).decode("utf-8", errors="ignore")
                        )
                elif part_class == "feature_property_bag":
                    decision = "REJECTED"
                    handler = ""
                    issue_codes.append(("ooxml_part_forbidden", name, None, "feature property bag rejected"))
                elif name not in reachable:
                    decision = "REJECTED"
                    handler = ""
                elif is_xml_part(name):
                    try:
                        root, values = parse_bounded_xml(archive.read(info), part_class, contract, budgets)
                        scan_values.extend(values)
                        if part_class == "worksheet" and has_nonempty_header_footer(root):
                            issue_codes.append(
                                ("ooxml_unhandled_content_channel", name, None, "header/footer content")
                            )
                        validate_xml_registry(root, part_class, contract, issue_codes, name)
                    except (ET.ParseError, UnicodeError, ValueError):
                        issue_codes.append(
                            ("ooxml_xml_policy_violation", name, None, "bounded XML parse failed")
                        )
                else:
                    decision = "REJECTED"
                    handler = ""
                    issue_codes.append(part_rejection(name))

                part_decisions.append(
                    {
                        "partNameDigestSha256": digest_text(name),
                        "partClass": part_class,
                        "contentType": content_type,
                        "decision": decision,
                        "justificationCode": justification,
                        "handlerId": handler,
                        "contentSha256": digest_bytes(archive.read(info))
                        if not (info.flag_bits & ENCRYPTED_FLAGS)
                        else "0" * 64,
                    }
                )

            if any(pattern.search("\n".join(scan_values)) for pattern in SECRET_PATTERNS):
                issue_codes.append(
                    ("ooxml_part_forbidden_or_secret", None, None, "secret-shaped content")
                )

            derived_facts = build_derived_facts(
                infos,
                part_classes,
                relationships,
                hyperlink_lineage,
                base_facts or {},
                member_set_digest,
            )
    except (zipfile.BadZipFile, OSError, RuntimeError, ValueError, struct.error):
        issue_codes.append(("ooxml_zip_member_invalid", None, None, "archive parse failed"))

    part_decisions.sort(key=lambda item: item["partNameDigestSha256"])
    hyperlink_lineage.sort(key=lambda item: item["targetDigest"])
    return make_receipt(
        workbook_digest,
        policy_digest,
        member_set_digest,
        content_type_digest,
        relationship_digest,
        part_decisions,
        derived_facts,
        hyperlink_lineage,
        issue_codes,
    )


def inspect_zip_structure(
    archive_bytes: bytes,
    archive: zipfile.ZipFile,
    infos: list[zipfile.ZipInfo],
    budgets: dict,
) -> tuple[list[tuple[str, str | None, str | None, str]], list[dict]]:
    issues: list[tuple[str, str | None, str | None, str]] = []
    records: list[dict] = []
    eocd_offsets = [match.start() for match in re.finditer(re.escape(EOCD), archive_bytes)]
    if len(eocd_offsets) != 1:
        issues.append(("ooxml_zip_member_invalid", None, None, "EOCD cardinality"))
    else:
        offset = eocd_offsets[0]
        if offset + 22 > len(archive_bytes):
            issues.append(("ooxml_zip_member_invalid", None, None, "truncated EOCD"))
        else:
            _, disk, central_disk, disk_count, total_count, central_size, central_offset, comment = struct.unpack_from(
                "<IHHHHIIH", archive_bytes, offset
            )
            if (
                disk != 0
                or central_disk != 0
                or disk_count != total_count
                or total_count != len(infos)
                or comment != 0
                or central_offset + central_size != offset
                or offset + 22 != len(archive_bytes)
            ):
                issues.append(("ooxml_zip_member_invalid", None, None, "EOCD boundary"))
    if not archive_bytes.startswith(LOCAL_HEADER):
        issues.append(("ooxml_zip_member_invalid", None, None, "archive prefix"))
    if len(infos) > budgets["maxEntryCount"]:
        issues.append(("ooxml_zip_budget_exceeded", None, None, "entry count"))

    seen_raw: set[bytes] = set()
    seen_normal: set[str] = set()
    seen_fold: set[str] = set()
    total_compressed = 0
    total_uncompressed = 0
    ranges: list[tuple[int, int]] = []
    for info in infos:
        raw_name = info.filename.encode("utf-8")
        normalized = normalize_member_name(info.filename)
        invalid_name = not is_canonical_member_name(info.filename)
        if raw_name in seen_raw or normalized in seen_normal or normalized.casefold() in seen_fold:
            invalid_name = True
        seen_raw.add(raw_name)
        seen_normal.add(normalized)
        seen_fold.add(normalized.casefold())
        if invalid_name:
            issues.append(("ooxml_zip_member_invalid", info.filename, None, "member path"))
        if len(raw_name) > budgets["maxPathLengthBytes"]:
            issues.append(("ooxml_zip_budget_exceeded", info.filename, None, "path length"))
        if not (info.flag_bits & UTF8_FLAG):
            issues.append(("ooxml_zip_member_invalid", info.filename, None, "UTF-8 flag"))
        if info.flag_bits & ENCRYPTED_FLAGS:
            issues.append(("ooxml_zip_budget_exceeded", info.filename, None, "encryption"))
        if info.compress_type not in SUPPORTED_METHODS:
            issues.append(("ooxml_zip_member_invalid", info.filename, None, "compression method"))
        if info.compress_size > budgets["maxPerEntryCompressedBytes"] or info.file_size > budgets["maxPerEntryUncompressedBytes"]:
            issues.append(("ooxml_zip_budget_exceeded", info.filename, None, "entry size"))
        if info.compress_size and info.file_size / info.compress_size > budgets["maxCompressionRatio"]:
            issues.append(("ooxml_zip_budget_exceeded", info.filename, None, "compression ratio"))
        total_compressed += info.compress_size
        total_uncompressed += info.file_size
        if info.external_attr:
            mode = (info.external_attr >> 16) & 0xFFFF
            if mode and (mode & 0o170000) not in (0, 0o100000):
                issues.append(("ooxml_zip_member_invalid", info.filename, None, "special file mode"))

        local_issue, data_range = validate_local_header(archive_bytes, info)
        if local_issue:
            issues.append(("ooxml_zip_member_invalid", info.filename, None, local_issue))
        if data_range:
            ranges.append(data_range)
        if not (info.flag_bits & ENCRYPTED_FLAGS):
            try:
                content = archive.read(info)
                if len(content) != info.file_size or (binascii.crc32(content) & 0xFFFFFFFF) != info.CRC:
                    issues.append(("ooxml_zip_member_invalid", info.filename, None, "CRC or length"))
            except (RuntimeError, zipfile.BadZipFile):
                issues.append(("ooxml_zip_member_invalid", info.filename, None, "inflate failed"))
        records.append(
            {
                "partNameDigestSha256": digest_text(normalized),
                "compressedBytes": info.compress_size,
                "uncompressedBytes": info.file_size,
                "compressionMethod": info.compress_type,
                "contentSha256": digest_bytes(archive.read(info))
                if not (info.flag_bits & ENCRYPTED_FLAGS)
                else "0" * 64,
            }
        )
    if total_compressed > budgets["maxTotalCompressedBytes"] or total_uncompressed > budgets["maxTotalUncompressedBytes"]:
        issues.append(("ooxml_zip_budget_exceeded", None, None, "archive size"))
    for prior, current in zip(sorted(ranges), sorted(ranges)[1:]):
        if current[0] < prior[1]:
            issues.append(("ooxml_zip_member_invalid", None, None, "overlapping local records"))
            break
    records.sort(key=lambda item: item["partNameDigestSha256"])
    return issues, records


def validate_local_header(archive_bytes: bytes, info: zipfile.ZipInfo) -> tuple[str | None, tuple[int, int] | None]:
    offset = info.header_offset
    if offset < 0 or offset + 30 > len(archive_bytes):
        return "local header bounds", None
    fields = struct.unpack_from("<IHHHHHIIIHH", archive_bytes, offset)
    signature, _, flags, method, _, _, crc, compressed, uncompressed, name_len, extra_len = fields
    if signature != 0x04034B50:
        return "local header signature", None
    name_start = offset + 30
    name_end = name_start + name_len
    extra_end = name_end + extra_len
    data_end = extra_end + info.compress_size
    if data_end > len(archive_bytes):
        return "local data bounds", None
    try:
        local_name = archive_bytes[name_start:name_end].decode("utf-8")
    except UnicodeDecodeError:
        return "local filename encoding", None
    descriptor = bool(flags & 0x0008)
    if (
        local_name != info.filename
        or flags != info.flag_bits
        or method != info.compress_type
        or (not descriptor and (crc != info.CRC or compressed != info.compress_size or uncompressed != info.file_size))
    ):
        return "central/local mismatch", (offset, data_end)
    return None, (offset, data_end)


def inspect_content_types(
    archive: zipfile.ZipFile,
    infos: list[zipfile.ZipInfo],
    contract: dict,
    budgets: dict,
) -> tuple[dict, list[tuple[str, str | None, str | None, str]]]:
    issues: list[tuple[str, str | None, str | None, str]] = []
    names = {normalize_member_name(info.filename) for info in infos}
    if "[Content_Types].xml" not in names:
        return {"records": [], "resolved": {}}, [
            ("ooxml_graph_not_closed", None, None, "content types root missing")
        ]
    try:
        root, _ = parse_bounded_xml(
            archive.read("[Content_Types].xml"), "content_types", contract, budgets
        )
    except (ET.ParseError, UnicodeError, ValueError):
        return {"records": [], "resolved": {}}, [
            ("ooxml_xml_policy_violation", "[Content_Types].xml", None, "content types invalid")
        ]
    defaults: dict[str, str] = {}
    overrides: dict[str, str] = {}
    for child in list(root):
        local = local_name(child.tag)
        if local == "Default":
            extension = child.attrib.get("Extension", "").lower()
            if not extension or extension in defaults:
                issues.append(("ooxml_graph_not_closed", "[Content_Types].xml", None, "default duplicate"))
            defaults[extension] = child.attrib.get("ContentType", "")
        elif local == "Override":
            raw = child.attrib.get("PartName", "")
            part_name = normalize_member_name(raw[1:] if raw.startswith("/") else raw)
            if not raw.startswith("/") or part_name in overrides:
                issues.append(("ooxml_graph_not_closed", "[Content_Types].xml", None, "override invalid"))
            overrides[part_name] = child.attrib.get("ContentType", "")
    resolved: dict[str, str] = {}
    records: list[dict] = []
    for name in sorted(names):
        if name == "[Content_Types].xml":
            resolved[name] = "application/xml"
        else:
            extension = name.rsplit(".", 1)[-1].lower() if "." in name else ""
            resolved[name] = overrides.get(name, defaults.get(extension, ""))
        records.append(
            {
                "partNameDigestSha256": digest_text(name),
                "contentType": resolved[name],
                "source": "OVERRIDE" if name in overrides else "DEFAULT",
            }
        )
        if not resolved[name]:
            issues.append(("ooxml_graph_not_closed", name, None, "content type unresolved"))
    if set(overrides) - names:
        issues.append(("ooxml_graph_not_closed", "[Content_Types].xml", None, "override target absent"))
    expected_rels = "application/vnd.openxmlformats-package.relationships+xml"
    expected_workbook = (
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"
    )
    if defaults.get("rels") != expected_rels or defaults.get("xml") != expected_workbook:
        issues.append(
            ("ooxml_graph_not_closed", "[Content_Types].xml", None, "default content type registry")
        )
    if set(defaults) != {"rels", "xml"}:
        issues.append(
            ("ooxml_graph_not_closed", "[Content_Types].xml", None, "default extension registry")
        )
    if "xl/workbook.xml" in overrides:
        issues.append(
            ("ooxml_graph_not_closed", "[Content_Types].xml", None, "workbook must use XML default")
        )
    for name in names:
        if name.endswith(".xml") and name not in {"[Content_Types].xml", "xl/workbook.xml"}:
            if name not in overrides:
                issues.append(
                    ("ooxml_graph_not_closed", name, None, "XML part exact override missing")
                )
    return {"records": records, "resolved": resolved, "defaults": defaults, "overrides": overrides}, issues


def classify_parts(
    infos: list[zipfile.ZipInfo],
    content_types: dict,
    contract: dict,
) -> tuple[dict[str, str], list[tuple[str, str | None, str | None, str]]]:
    issues: list[tuple[str, str | None, str | None, str]] = []
    classes: dict[str, str] = {}
    for info in infos:
        name = normalize_member_name(info.filename)
        content_type = content_types["resolved"].get(name, "")
        part_class = classify_part(name, content_type)
        classes[name] = part_class
        if part_class == "unknown":
            issues.append(part_rejection(name))
    counts: dict[str, int] = {}
    for part_class in classes.values():
        counts[part_class] = counts.get(part_class, 0) + 1
    for required, minimum, maximum in (
        ("content_types", 1, 1),
        ("relationships", 2, None),
        ("workbook", 1, 1),
        ("worksheet", 1, None),
        ("styles", 1, 1),
        ("shared_strings", 0, 1),
        ("theme", 0, 1),
        ("core_properties", 0, 1),
        ("extended_properties", 0, 1),
    ):
        count = counts.get(required, 0)
        if count < minimum or (maximum is not None and count > maximum):
            issues.append(("ooxml_graph_not_closed", None, None, f"{required} cardinality"))
    return classes, issues


def classify_part(name: str, content_type: str) -> str:
    lower = f"/{name.casefold()}"
    if name == "[Content_Types].xml":
        return "content_types"
    if name.endswith(".rels"):
        return "relationships"
    if name == "xl/workbook.xml" and content_type.endswith("spreadsheetml.sheet.main+xml"):
        return "workbook"
    if re.fullmatch(r"xl/worksheets/sheet[1-9][0-9]*[.]xml", name) and content_type.endswith("spreadsheetml.worksheet+xml"):
        return "worksheet"
    if name == "xl/sharedStrings.xml" and content_type.endswith("spreadsheetml.sharedStrings+xml"):
        return "shared_strings"
    if name == "xl/styles.xml" and content_type.endswith("spreadsheetml.styles+xml"):
        return "styles"
    if re.fullmatch(r"xl/theme/theme[1-9][0-9]*[.]xml", name) and content_type.endswith("officedocument.theme+xml"):
        return "theme"
    if re.fullmatch(r"xl/tables/table[1-9][0-9]*[.]xml", name) and content_type.endswith("spreadsheetml.table+xml"):
        return "table"
    if name == "docProps/core.xml" and content_type.endswith("package.core-properties+xml"):
        return "core_properties"
    if name == "docProps/app.xml" and content_type.endswith("extended-properties+xml"):
        return "extended_properties"
    if "featurepropertybag" in lower:
        return "feature_property_bag"
    return "unknown"


def inspect_relationships(
    archive: zipfile.ZipFile,
    infos: list[zipfile.ZipInfo],
    part_classes: dict[str, str],
    contract: dict,
    budgets: dict,
) -> tuple[list[dict], list[tuple[str, str | None, str | None, str]], list[dict]]:
    issues: list[tuple[str, str | None, str | None, str]] = []
    records: list[dict] = []
    hyperlinks: list[dict] = []
    names = set(part_classes)
    allowed = {row["uri"]: row for row in contract["opcRegistry"]["relationshipTypes"]}
    semantic_edges: set[tuple[str, str, str]] = set()
    count = 0
    for info in infos:
        rel_name = normalize_member_name(info.filename)
        if not rel_name.endswith(".rels"):
            continue
        source = relationship_source(rel_name)
        try:
            root, _ = parse_bounded_xml(archive.read(info), "relationships", contract, budgets)
        except (ET.ParseError, UnicodeError, ValueError):
            issues.append(("ooxml_xml_policy_violation", rel_name, None, "relationship XML"))
            continue
        seen_ids: set[str] = set()
        for element in list(root):
            count += 1
            relation_id = element.attrib.get("Id", "")
            relation_type = element.attrib.get("Type", "")
            target = element.attrib.get("Target", "")
            target_mode = element.attrib.get("TargetMode", "Internal")
            if relation_id in seen_ids or not relation_id:
                issues.append(("ooxml_graph_not_closed", rel_name, relation_id, "relationship ID"))
            seen_ids.add(relation_id)
            policy = allowed.get(relation_type)
            source_class = "PACKAGE_ROOT" if source == "/" else part_classes.get(source, "unknown")
            if not policy or policy["sourceClass"] != source_class or policy["targetMode"] != target_mode:
                issues.append(
                    (
                        "ooxml_external_relationship_forbidden"
                        if target_mode == "External"
                        else "ooxml_graph_not_closed",
                        rel_name,
                        relation_id,
                        "relationship type/source/mode",
                    )
                )
                continue
            if target_mode == "External":
                parsed = urlparse(target)
                if (
                    policy["relationId"] != "hyperlink"
                    or parsed.scheme.casefold() not in SAFE_SCHEMES
                    or parsed.username
                    or parsed.password
                    or len(target.encode("utf-8")) > budgets["maxHyperlinkLengthBytesUtf8"]
                ):
                    issues.append(
                        ("ooxml_external_relationship_forbidden", rel_name, relation_id, "external target")
                    )
                else:
                    hyperlinks.append(
                        {
                            "protocol": parsed.scheme.casefold(),
                            "targetMode": "External",
                            "relationshipType": "hyperlink",
                            "targetDigest": digest_text(target),
                        }
                    )
                target_digest = digest_text(target)
                target_class = "EXTERNAL_URI"
            else:
                try:
                    resolved = resolve_internal_target(source, target)
                except ValueError:
                    issues.append(("ooxml_graph_not_closed", rel_name, relation_id, "target normalization"))
                    continue
                if resolved not in names or part_classes.get(resolved) != policy["targetClass"]:
                    issues.append(("ooxml_graph_not_closed", rel_name, relation_id, "target missing/class"))
                target_digest = digest_text(resolved)
                target_class = part_classes.get(resolved, "unknown")
            semantic = (source, relation_type, target_digest)
            if semantic in semantic_edges:
                issues.append(("ooxml_graph_not_closed", rel_name, relation_id, "duplicate semantic edge"))
            semantic_edges.add(semantic)
            records.append(
                {
                    "sourcePartDigestSha256": digest_text(source),
                    "relationIdDigestSha256": digest_text(relation_id),
                    "relationshipType": relation_type,
                    "targetMode": target_mode,
                    "targetClass": target_class,
                    "targetDigestSha256": target_digest,
                }
            )
    if count > budgets["maxRelationshipCount"] or len(hyperlinks) > budgets["maxHyperlinkCount"]:
        issues.append(("ooxml_zip_budget_exceeded", None, None, "relationship count"))
    records.sort(key=lambda item: (item["sourcePartDigestSha256"], item["relationIdDigestSha256"]))
    return records, issues, hyperlinks


def inspect_graph_closure(
    infos: list[zipfile.ZipInfo],
    part_classes: dict[str, str],
    relationships: list[dict],
) -> tuple[set[str], list[tuple[str, str | None, str | None, str]]]:
    issues: list[tuple[str, str | None, str | None, str]] = []
    digest_to_name = {digest_text(name): name for name in part_classes}
    reachable = {"[Content_Types].xml", "_rels/.rels"}
    changed = True
    while changed:
        changed = False
        reachable_sources = {"/", *reachable}
        source_digests = {digest_text(source) for source in reachable_sources}
        for relation in relationships:
            if relation["targetMode"] != "Internal" or relation["sourcePartDigestSha256"] not in source_digests:
                continue
            target = digest_to_name.get(relation["targetDigestSha256"])
            if target and target not in reachable:
                reachable.add(target)
                changed = True
        for name in list(reachable):
            rel = relationship_part_for_source(name)
            if rel in part_classes and rel not in reachable:
                reachable.add(rel)
                changed = True
    names = {normalize_member_name(info.filename) for info in infos}
    orphans = names - reachable
    if orphans:
        issues.append(("ooxml_graph_not_closed", None, None, "orphan or unreachable part"))
    return reachable, issues


def inspect_semantic_cardinalities(
    archive: zipfile.ZipFile,
    infos: list[zipfile.ZipInfo],
    part_classes: dict[str, str],
    relationships: list[dict],
    contract: dict,
    budgets: dict,
) -> list[tuple[str, str | None, str | None, str]]:
    """Validate the exact relationship and workbook/table semantic maps."""

    issues: list[tuple[str, str | None, str | None, str]] = []
    digest_to_name = {digest_text(name): name for name in part_classes}
    relation_contract = {
        row["uri"]: row for row in contract["opcRegistry"]["relationshipTypes"]
    }
    counts: dict[str, int] = {}
    by_source_and_type: dict[tuple[str, str], list[dict]] = {}
    for relation in relationships:
        source = digest_to_name.get(relation["sourcePartDigestSha256"], "/")
        relation_type = relation["relationshipType"]
        relation_id = relation_contract.get(relation_type, {}).get("relationId", "unknown")
        counts[relation_id] = counts.get(relation_id, 0) + 1
        by_source_and_type.setdefault((source, relation_id), []).append(relation)

    exact_global = {
        "office_document": (1, 1),
        "core_properties": (0, 1),
        "extended_properties": (0, 1),
        "shared_strings": (0, 1),
        "styles": (1, 1),
        "theme": (0, 1),
    }
    for relation_id, (minimum, maximum) in exact_global.items():
        count = counts.get(relation_id, 0)
        if count < minimum or count > maximum:
            issues.append(
                ("ooxml_graph_not_closed", None, None, f"{relation_id} relationship cardinality")
            )

    try:
        workbook_root, _ = parse_bounded_xml(
            archive.read("xl/workbook.xml"), "workbook", contract, budgets
        )
        expected_sheet_ids = [
            element.attrib.get(expanded(
                "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
                "id",
            ), "")
            for element in workbook_root.findall(
                ".//" + expanded(
                    "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
                    "sheet",
                )
            )
        ]
        actual_sheet_ids = relationship_ids_for_part(
            archive, "xl/_rels/workbook.xml.rels", "worksheet", relation_contract
        )
        if (
            not expected_sheet_ids
            or len(set(expected_sheet_ids)) != len(expected_sheet_ids)
            or sorted(expected_sheet_ids) != sorted(actual_sheet_ids)
        ):
            issues.append(
                ("ooxml_graph_not_closed", "xl/workbook.xml", None, "worksheet sheet ID map")
            )
    except (KeyError, ET.ParseError, UnicodeError, ValueError):
        issues.append(
            ("ooxml_graph_not_closed", "xl/workbook.xml", None, "workbook semantic map")
        )

    for info in infos:
        sheet_name = normalize_member_name(info.filename)
        if part_classes.get(sheet_name) != "worksheet":
            continue
        relationship_name = relationship_part_for_source(sheet_name)
        try:
            root, _ = parse_bounded_xml(
                archive.read(info), "worksheet", contract, budgets
            )
            expected_table_ids = [
                element.attrib.get(expanded(
                    "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
                    "id",
                ), "")
                for element in root.findall(
                    ".//" + expanded(
                        "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
                        "tablePart",
                    )
                )
            ]
            actual_table_ids = relationship_ids_for_part(
                archive, relationship_name, "table", relation_contract
            ) if relationship_name in part_classes else []
            if (
                len(set(expected_table_ids)) != len(expected_table_ids)
                or sorted(expected_table_ids) != sorted(actual_table_ids)
            ):
                issues.append(
                    ("ooxml_graph_not_closed", sheet_name, None, "worksheet table ID map")
                )
        except (KeyError, ET.ParseError, UnicodeError, ValueError):
            issues.append(
                ("ooxml_graph_not_closed", sheet_name, None, "worksheet semantic map")
            )
    return issues


def relationship_ids_for_part(
    archive: zipfile.ZipFile,
    relationship_name: str,
    expected_relation_id: str,
    relation_contract: dict[str, dict],
) -> list[str]:
    if relationship_name not in archive.namelist():
        return []
    root = ET.fromstring(archive.read(relationship_name))
    return [
        element.attrib.get("Id", "")
        for element in list(root)
        if relation_contract.get(element.attrib.get("Type", ""), {}).get("relationId")
        == expected_relation_id
    ]


def parse_bounded_xml(
    data: bytes,
    part_class: str,
    contract: dict,
    budgets: dict,
) -> tuple[ET.Element, list[str]]:
    if len(data) > budgets["maxXmlBytesPerPart"]:
        raise ValueError("xml byte budget")
    head = data[:512].upper()
    if b"<!DOCTYPE" in data.upper() or b"<!ENTITY" in data.upper() or b"<XI:INCLUDE" in data.upper():
        raise ValueError("xml active construct")
    declaration_probe = data.lstrip()
    if declaration_probe.startswith(b"\xef\xbb\xbf"):
        declaration_probe = declaration_probe[3:]
    if data.count(b"<?") > (1 if declaration_probe.startswith(b"<?xml") else 0):
        raise ValueError("processing instruction")
    if b'xmlns=""' in data or b"xmlns='' " in data:
        raise ValueError("namespace undeclaration")
    if head.startswith((b"\x00\x00\xfe\xff", b"\xff\xfe\x00\x00")):
        raise ValueError("unsupported XML encoding")
    root = ET.fromstring(data)
    values: list[str] = []
    stack: list[tuple[ET.Element, int]] = [(root, 1)]
    element_count = 0
    text_bytes = 0
    while stack:
        element, depth = stack.pop()
        element_count += 1
        if depth > budgets["maxXmlDepth"] or element_count > budgets["maxXmlElementsPerPart"]:
            raise ValueError("xml structure budget")
        if len(element.attrib) > budgets["maxXmlAttributesPerElement"]:
            raise ValueError("xml attribute budget")
        for value in [element.text, element.tail, *element.attrib.values()]:
            if value:
                values.append(value)
                text_bytes += len(value.encode("utf-8"))
        if text_bytes > budgets["maxXmlTextBytesPerPart"]:
            raise ValueError("xml text budget")
        stack.extend((child, depth + 1) for child in reversed(list(element)))
    return root, values


def validate_xml_registry(
    root: ET.Element,
    part_class: str,
    contract: dict,
    issues: list[tuple[str, str | None, str | None, str]],
    part_name: str,
) -> None:
    registries = {
        row["partClass"]: row for row in contract["xmlPolicy"]["elementAttributeRegistries"]
    }
    namespace_rules = {
        row["partClass"]: row for row in contract["xmlPolicy"]["partNamespaceRules"]
    }
    aliases = contract["xmlPolicy"]["namespaceAliases"]
    registry = registries.get(part_class)
    rule = namespace_rules.get(part_class)
    if not registry or not rule:
        issues.append(("ooxml_xml_policy_violation", part_name, None, "XML handler absent"))
        return
    root_alias, root_local = registry["rootExpandedName"].split(":", 1)
    if root.tag != expanded(aliases[root_alias], root_local):
        issues.append(("ooxml_xml_policy_violation", part_name, None, "root expanded name"))
    allowed_elements = set(registry["allowedElementLocalNames"])
    allowed_attributes = set(registry["allowedAttributeLocalNames"])
    allowed_element_namespaces = {
        aliases[alias] for alias in rule["allowedElementNamespaceAliases"]
    }
    allowed_attribute_namespaces = {
        "" if alias == "UNQUALIFIED" else aliases[alias]
        for alias in rule["allowedAttributeNamespaceAliases"]
    }
    for element in root.iter():
        namespace, local = split_expanded(element.tag)
        if namespace not in allowed_element_namespaces or local not in allowed_elements:
            issues.append(("ooxml_xml_policy_violation", part_name, None, "element registry"))
            break
        seen: set[tuple[str, str]] = set()
        for attribute in element.attrib:
            attr_namespace, attr_local = split_expanded(attribute)
            identity = (attr_namespace, attr_local)
            if identity in seen or attr_namespace not in allowed_attribute_namespaces or attr_local not in allowed_attributes:
                issues.append(("ooxml_xml_policy_violation", part_name, None, "attribute registry"))
                return
            seen.add(identity)


def build_derived_facts(
    infos: list[zipfile.ZipInfo],
    part_classes: dict[str, str],
    relationships: list[dict],
    hyperlinks: list[dict],
    base: dict,
    source_digest: str,
) -> list[dict]:
    facts = {
        "ENTRY_COUNT": ("INTEGER", len(infos)),
        "RELATIONSHIP_COUNT": ("INTEGER", len(relationships)),
        "HYPERLINK_COUNT": ("INTEGER", sum(row["occurrenceCount"] for row in hyperlinks)),
        "WORKSHEET_COUNT": ("INTEGER", sum(value == "worksheet" for value in part_classes.values())),
        "FORMULA_COUNT": ("INTEGER", int(base.get("formulaCount", 0))),
        "FORMULA_ERROR_COUNT": ("INTEGER", int(base.get("formulaErrorCount", 0))),
        "VALIDATION_COUNT": ("INTEGER", int(base.get("validationCount", 0))),
        "FORBIDDEN_VALUE_COUNT": ("INTEGER", int(base.get("forbiddenValueCount", 0))),
        "INTERNAL_ID_COUNT": ("INTEGER", int(base.get("internalIdCount", 0))),
        "INCOME_VALUE_COUNT": ("INTEGER", int(base.get("incomeValueCount", 0))),
        "SECRET_COUNT": ("INTEGER", int(base.get("secretCount", 0))),
        "VISUAL_REVIEW_ATTESTED": ("BOOLEAN", False),
    }
    return [
        {
            "factId": f"B5-{index:04d}",
            "factType": fact_type,
            "valueType": value_type,
            "value": value,
            "sourcePartSetDigestSha256": source_digest,
        }
        for index, (fact_type, (value_type, value)) in enumerate(sorted(facts.items()), start=1)
    ]


def aggregate_hyperlinks(rows: list[dict]) -> list[dict]:
    counts: dict[tuple[str, str, str, str], int] = {}
    for row in rows:
        key = (
            row["protocol"],
            row["targetMode"],
            row["relationshipType"],
            row["targetDigest"],
        )
        counts[key] = counts.get(key, 0) + 1
    return [
        {
            "protocol": key[0],
            "targetMode": key[1],
            "relationshipType": key[2],
            "targetDigest": key[3],
            "occurrenceCount": count,
        }
        for key, count in sorted(counts.items(), key=lambda item: item[0][3])
    ]


def make_receipt(
    workbook_digest: str,
    policy_digest: str,
    member_set_digest: str,
    content_type_digest: str,
    relationship_digest: str,
    part_decisions: list[dict],
    derived_facts: list[dict],
    hyperlink_lineage: list[dict],
    issues: list[tuple[str, str | None, str | None, str]],
) -> dict:
    records = []
    seen: set[tuple[str, str, str, str]] = set()
    for reason, part, relation, detail in issues:
        key = (reason, part or "", relation or "", detail)
        if key in seen:
            continue
        seen.add(key)
        records.append(
            {
                "issueId": digest_text("|".join(key))[:32],
                "severity": "ERROR",
                "reasonCode": safe_reason(reason),
                "partNameDigestSha256": digest_text(part) if part else "0" * 64,
                "relationIdDigestSha256": digest_text(relation) if relation else "0" * 64,
                "safeDetail": safe_detail(detail),
            }
        )
    records.sort(key=lambda item: item["issueId"])
    derived_facts.sort(key=lambda item: item["factId"])
    part_decisions.sort(key=lambda item: item["partNameDigestSha256"])
    hyperlink_lineage.sort(key=lambda item: item["targetDigest"])
    return {
        "schema": SCHEMA,
        "workbookSha256": workbook_digest,
        "profileVersion": PROFILE,
        "policyDigestSha256": policy_digest,
        "packageMemberSetDigestSha256": member_set_digest,
        "contentTypeGraphDigestSha256": content_type_digest,
        "relationshipGraphDigestSha256": relationship_digest,
        "partDecisionDigestSha256": digest_json(part_decisions),
        "partDecisions": part_decisions,
        "derivedFacts": derived_facts,
        "hyperlinkLineage": hyperlink_lineage,
        "issues": records,
        "passed": not records,
        "visualReviewAttested": False,
        "providerRequestDelta": 0,
        "actualExternalFetchCount": 0,
    }


def part_rejection(name: str) -> tuple[str, str | None, str | None, str]:
    lower = f"/{name.casefold()}"
    if any(marker in lower for marker in HIGH_RISK_PART_MARKERS) or lower.endswith(FORBIDDEN_PART_SUFFIXES):
        return ("ooxml_high_risk_part_forbidden", name, None, "high-risk package part")
    if any(marker in lower for marker in FORBIDDEN_PART_MARKERS) or lower.startswith("/docprops/custom."):
        return ("ooxml_part_forbidden", name, None, "unsupported package part")
    return ("ooxml_graph_not_closed", name, None, "unknown package part")


def handler_for(part_class: str) -> str:
    return {
        "content_types": "content-types-v0.2",
        "relationships": "relationships-v0.2",
        "workbook": "workbook-v0.2",
        "worksheet": "worksheet-v0.2",
        "shared_strings": "shared-strings-v0.2",
        "styles": "styles-v0.2",
        "theme": "theme-v0.2",
        "table": "table-v0.2",
        "core_properties": "core-properties-v0.2",
        "extended_properties": "extended-properties-v0.2",
    }.get(part_class, "")


def relationship_source(name: str) -> str:
    if name == "_rels/.rels":
        return "/"
    marker = "/_rels/"
    if marker not in name or not name.endswith(".rels"):
        return ""
    prefix, relation_name = name.split(marker, 1)
    return f"{prefix}/{relation_name[:-5]}"


def relationship_part_for_source(source: str) -> str:
    if source == "/":
        return "_rels/.rels"
    directory = posixpath.dirname(source)
    filename = posixpath.basename(source)
    return posixpath.join(directory, "_rels", f"{filename}.rels")


def resolve_internal_target(source: str, target: str) -> str:
    decoded = unquote(target)
    if (
        "\\" in target
        or "#" in target
        or re.match(r"^[A-Za-z][A-Za-z0-9+.-]*:", target)
        or re.match(r"^[A-Za-z]:", target)
        or target.startswith("//")
        or any(token in decoded for token in ("\\", "\x00"))
        or any(segment in (".", "..") for segment in decoded.replace("\\", "/").split("/"))
    ):
        raise ValueError("relationship target invalid")
    if target.startswith("/"):
        candidate = target[1:]
    else:
        base = "" if source == "/" else posixpath.dirname(source)
        candidate = posixpath.join(base, target)
    normalized = normalize_member_name(posixpath.normpath(candidate))
    if not is_canonical_member_name(normalized):
        raise ValueError("relationship target not canonical")
    return normalized


def normalize_member_name(value: str) -> str:
    return unicodedata.normalize("NFC", str(value).replace("\\", "/"))


def is_canonical_member_name(value: str) -> bool:
    if not value or value != unicodedata.normalize("NFC", value) or "\\" in value or "\x00" in value:
        return False
    if value.startswith(("/", "//")) or re.match(r"^[A-Za-z]:", value):
        return False
    segments = value.split("/")
    return all(segment not in ("", ".", "..") for segment in segments) and posixpath.normpath(value) == value


def is_xml_part(name: str) -> bool:
    return name.endswith(".xml") or name.endswith(".rels") or name == "[Content_Types].xml"


def has_nonempty_header_footer(root: ET.Element) -> bool:
    for element in root.iter():
        if local_name(element.tag) == "headerFooter":
            if any((child.text or "").strip() for child in element.iter()):
                return True
    return False


def split_expanded(value: str) -> tuple[str, str]:
    if value.startswith("{") and "}" in value:
        namespace, local = value[1:].split("}", 1)
        return namespace, local
    return "", value


def expanded(namespace: str, local: str) -> str:
    return f"{{{namespace}}}{local}" if namespace else local


def local_name(value: str) -> str:
    return split_expanded(value)[1]


def safe_reason(value: str) -> str:
    text = re.sub(r"[^a-z0-9_]", "_", value.casefold())[:64]
    return text or "ooxml_policy_failure"


def safe_detail(value: str) -> str:
    text = re.sub(r"[^A-Za-z0-9_.: -]", "_", value)[:256]
    return text or "policy failure"


def digest_json(value: object) -> str:
    return digest_bytes(
        json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    )


def digest_text(value: str) -> str:
    return digest_bytes(unicodedata.normalize("NFC", value).encode("utf-8"))


def digest_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def file_digest(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()
