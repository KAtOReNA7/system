#!/usr/bin/env python3
"""Build and verify the deterministic synthetic OOXML/OPC S0 corpus.

This support-only generator uses the Python standard library. It never opens a
governed workbook and never interprets business cell content.
"""

from __future__ import annotations

import argparse
import base64
import binascii
import hashlib
import json
import struct
import sys
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from xml.etree import ElementTree


SCHEMA = "m2.v2.pr7.s0.synthetic-ooxml-corpus.v0.1"
SEED = "m2-v2-pr7-s0-ooxml-v0.1"
SUPPORTED_PYTHON = ">=3.11,<3.14"
UTF8_FLAG = 0x0800
ENCRYPTED_FLAG = 0x0001
ZIP_STORED = 0
ZIP_DEFLATED = 8
DOS_TIME = 0
DOS_DATE = 33  # 1980-01-01
UNIX_FILE_MODE = 0o100644 << 16
REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
CONTENT_TYPE_NS = "http://schemas.openxmlformats.org/package/2006/content-types"
OFFICE_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/"
PACKAGE_REL = "http://schemas.openxmlformats.org/package/2006/relationships/metadata/"
SHEET_CT = "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"
WORKBOOK_CT = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"
XML_CT = "application/xml"
POLICY_LIMITS = {
    "maxCompressionRatio": 100,
    "maxEntryUncompressedBytes": 65536,
    "maxTotalUncompressedBytes": 131072,
    "maxXmlDepth": 64,
    "maxXmlElements": 1000,
    "maxXmlTextBytes": 65536,
}

# Raw DEFLATE bytes for exactly 262144 ASCII "A" bytes. Embedding the stream
# makes the archive byte-identical across Python/zlib versions and platforms.
HIGH_RATIO_DEFLATE = base64.b64decode(
    "7cExAQAAAMKgbOtfytsOQAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    "vAE="
)


@dataclass(frozen=True)
class Entry:
    name: str
    data: bytes
    method: int = ZIP_STORED
    flags: int = UTF8_FLAG
    compressed_data: bytes | None = None


@dataclass
class Package:
    parts: list[Entry] = field(default_factory=list)
    root_relationships: list[dict[str, str]] = field(default_factory=list)
    workbook_relationships: list[dict[str, str]] = field(default_factory=list)
    overrides: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class Case:
    case_id: str
    purpose: str
    expected_policy_result: str
    expected_reason: str
    package: Package


def xml(body: str) -> bytes:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        + body
        + "\n"
    ).encode("utf-8")


def relationships_xml(rows: list[dict[str, str]]) -> bytes:
    items = []
    for row in sorted(rows, key=lambda item: item["id"].encode("utf-8")):
        target_mode = (
            f' TargetMode="{row["targetMode"]}"' if row.get("targetMode") else ""
        )
        items.append(
            f'<Relationship Id="{row["id"]}" Type="{row["type"]}" '
            f'Target="{row["target"]}"{target_mode}/>'
        )
    return xml(f'<Relationships xmlns="{REL_NS}">' + "".join(items) + "</Relationships>")


def content_types_xml(overrides: dict[str, str]) -> bytes:
    defaults = [
        ("rels", "application/vnd.openxmlformats-package.relationships+xml"),
        ("xml", XML_CT),
    ]
    default_rows = "".join(
        f'<Default Extension="{extension}" ContentType="{content_type}"/>'
        for extension, content_type in defaults
    )
    override_rows = "".join(
        f'<Override PartName="/{name}" ContentType="{overrides[name]}"/>'
        for name in sorted(overrides, key=lambda value: value.encode("utf-8"))
    )
    return xml(
        f'<Types xmlns="{CONTENT_TYPE_NS}">{default_rows}{override_rows}</Types>'
    )


def workbook_xml() -> bytes:
    return xml(
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        '<sheets><sheet name="Synthetic" sheetId="1" r:id="rId1"/></sheets></workbook>'
    )


def worksheet_xml(content: str = "<sheetData/>") -> bytes:
    return xml(
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        + content
        + "</worksheet>"
    )


def base_package(sheet: bytes | None = None) -> Package:
    package = Package()
    package.parts.extend(
        [
            Entry("xl/workbook.xml", workbook_xml()),
            Entry("xl/worksheets/sheet1.xml", sheet or worksheet_xml()),
        ]
    )
    package.root_relationships.append(
        {
            "id": "rId1",
            "type": OFFICE_REL + "officeDocument",
            "target": "xl/workbook.xml",
        }
    )
    package.workbook_relationships.append(
        {
            "id": "rId1",
            "type": OFFICE_REL + "worksheet",
            "target": "worksheets/sheet1.xml",
        }
    )
    package.overrides.update(
        {"xl/workbook.xml": WORKBOOK_CT, "xl/worksheets/sheet1.xml": SHEET_CT}
    )
    return package


def add_part(
    package: Package,
    name: str,
    data: bytes,
    content_type: str | None = None,
    *,
    method: int = ZIP_STORED,
    flags: int = UTF8_FLAG,
    compressed_data: bytes | None = None,
) -> None:
    package.parts.append(Entry(name, data, method, flags, compressed_data))
    if content_type is not None:
        package.overrides[name] = content_type


def add_workbook_relationship(
    package: Package,
    relationship_type: str,
    target: str,
    *,
    target_mode: str | None = None,
) -> None:
    row = {
        "id": f"rId{len(package.workbook_relationships) + 1}",
        "type": relationship_type,
        "target": target,
    }
    if target_mode is not None:
        row["targetMode"] = target_mode
    package.workbook_relationships.append(row)


def reachable_part_case(
    case_id: str,
    purpose: str,
    reason: str,
    part_name: str,
    content_type: str,
    relationship_type: str,
    data: bytes,
) -> Case:
    package = base_package()
    add_part(package, part_name, data, content_type)
    add_workbook_relationship(package, relationship_type, relative_workbook_target(part_name))
    return Case(case_id, purpose, "DENY", reason, package)


def relative_workbook_target(part_name: str) -> str:
    return part_name[3:] if part_name.startswith("xl/") else "../" + part_name


def positive_cases() -> list[Case]:
    minimal = Case(
        "positive_minimal_valid_workbook",
        "Minimal valid workbook",
        "ALLOW",
        "MINIMAL_VALID_WORKBOOK",
        base_package(),
    )

    shared = base_package(
        worksheet_xml('<sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row></sheetData>')
    )
    add_part(
        shared,
        "xl/sharedStrings.xml",
        xml(
            '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'count="1" uniqueCount="1"><si><t>Synthetic</t></si></sst>'
        ),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml",
    )
    add_workbook_relationship(shared, OFFICE_REL + "sharedStrings", "sharedStrings.xml")

    inline = base_package(
        worksheet_xml(
            '<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Synthetic</t></is>'
            "</c></row></sheetData>"
        )
    )
    formula = base_package(
        worksheet_xml(
            '<sheetData><row r="1"><c r="A1"><f>1+1</f><v>2</v></c></row></sheetData>'
        )
    )

    properties = base_package()
    add_part(
        properties,
        "docProps/core.xml",
        xml(
            '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
            'xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Synthetic</dc:title>'
            "</cp:coreProperties>"
        ),
        "application/vnd.openxmlformats-package.core-properties+xml",
    )
    add_part(
        properties,
        "docProps/app.xml",
        xml(
            '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">'
            "<Application>S0 Fixture</Application></Properties>"
        ),
        "application/vnd.openxmlformats-officedocument.extended-properties+xml",
    )
    properties.root_relationships.extend(
        [
            {
                "id": "rId2",
                "type": PACKAGE_REL + "core-properties",
                "target": "docProps/core.xml",
            },
            {
                "id": "rId3",
                "type": OFFICE_REL + "extended-properties",
                "target": "docProps/app.xml",
            },
        ]
    )

    utf8 = base_package()
    add_part(
        utf8,
        "docProps/core.xml",
        xml(
            '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
            'xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>合法 UTF-8 元数据 ✓</dc:title>'
            "</cp:coreProperties>"
        ),
        "application/vnd.openxmlformats-package.core-properties+xml",
    )
    utf8.root_relationships.append(
        {
            "id": "rId2",
            "type": PACKAGE_REL + "core-properties",
            "target": "docProps/core.xml",
        }
    )

    return [
        minimal,
        Case("positive_valid_shared_strings", "Valid sharedStrings", "ALLOW", "VALID_SHARED_STRINGS", shared),
        Case("positive_valid_inline_strings", "Valid inline strings", "ALLOW", "VALID_INLINE_STRINGS", inline),
        Case("positive_valid_formula_cached_value", "Valid formula with cached value", "ALLOW", "VALID_FORMULA_CACHED_VALUE", formula),
        Case("positive_valid_core_app_properties", "Valid core and app properties", "ALLOW", "VALID_CORE_APP_PROPERTIES", properties),
        Case("positive_legitimate_utf8_metadata", "Legitimate UTF-8 metadata", "ALLOW", "LEGITIMATE_UTF8_METADATA", utf8),
    ]


def negative_cases() -> list[Case]:
    cases: list[Case] = []

    custom = base_package()
    synthetic_secret_shape = "sk-" + "S0SYNTHETIC" + ("X" * 32)
    add_part(
        custom,
        "docProps/custom.xml",
        xml(
            '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties">'
            f"<property><value>{synthetic_secret_shape}</value></property></Properties>"
        ),
        "application/vnd.openxmlformats-officedocument.custom-properties+xml",
    )
    custom.root_relationships.append(
        {
            "id": "rId2",
            "type": OFFICE_REL + "custom-properties",
            "target": "docProps/custom.xml",
        }
    )
    cases.append(
        Case(
            "negative_custom_properties_secret_shape",
            "Custom properties contain a synthetic secret-shaped token",
            "DENY",
            "CUSTOM_PROPERTIES_SECRET_SHAPE",
            custom,
        )
    )

    active_specs = [
        ("comments", "Comments", "COMMENTS_PART", "xl/comments1.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml", "comments"),
        ("drawing", "Drawing", "DRAWING_PART", "xl/drawings/drawing1.xml", "application/vnd.openxmlformats-officedocument.drawing+xml", "drawing"),
        ("chart", "Chart", "CHART_PART", "xl/charts/chart1.xml", "application/vnd.openxmlformats-officedocument.drawingml.chart+xml", "chart"),
        ("vml", "VML", "VML_PART", "xl/drawings/vmlDrawing1.vml", "application/vnd.openxmlformats-officedocument.vmlDrawing", "vmlDrawing"),
        ("media", "Media", "MEDIA_PART", "xl/media/image1.png", "image/png", "image"),
        ("ole", "OLE object", "OLE_PART", "xl/oleObjects/oleObject1.bin", "application/vnd.openxmlformats-officedocument.oleObject", "oleObject"),
        ("activex", "ActiveX", "ACTIVEX_PART", "xl/activeX/activeX1.bin", "application/vnd.ms-office.activeX", "control"),
        ("embedding", "Embedding", "EMBEDDING_PART", "xl/embeddings/embedded1.bin", "application/octet-stream", "package"),
        ("printer_settings", "Printer settings", "PRINTER_SETTINGS_PART", "xl/printerSettings/printerSettings1.bin", "application/vnd.openxmlformats-officedocument.spreadsheetml.printerSettings", "printerSettings"),
        ("external_link", "External link", "EXTERNAL_LINK_PART", "xl/externalLinks/externalLink1.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.externalLink+xml", "externalLink"),
    ]
    for short_id, purpose, reason, name, content_type, rel_suffix in active_specs:
        cases.append(
            reachable_part_case(
                "negative_" + short_id,
                purpose,
                reason,
                name,
                content_type,
                OFFICE_REL + rel_suffix,
                xml(f'<synthetic xmlns="urn:m2-v2:s0:{short_id}"/>') if name.endswith((".xml", ".vml")) else b"S0-SYNTHETIC\n",
            )
        )

    threaded = base_package()
    add_part(threaded, "xl/threadedComments/threadedComment1.xml", xml('<threadedComments xmlns="http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments"/>'), "application/vnd.ms-excel.threadedcomments+xml")
    add_part(threaded, "xl/persons/person.xml", xml('<personList xmlns="http://schemas.microsoft.com/office/spreadsheetml/2018/person"/>'), "application/vnd.ms-excel.person+xml")
    add_workbook_relationship(threaded, "http://schemas.microsoft.com/office/2017/10/relationships/threadedComment", "threadedComments/threadedComment1.xml")
    add_workbook_relationship(threaded, "http://schemas.microsoft.com/office/2017/10/relationships/person", "persons/person.xml")
    cases.append(Case("negative_threaded_comments_persons", "Threaded comments and persons", "DENY", "THREADED_COMMENTS_OR_PERSONS", threaded))

    external = base_package()
    add_workbook_relationship(external, OFFICE_REL + "externalLinkPath", "https://example.invalid/synthetic.xlsx", target_mode="External")
    cases.append(Case("negative_external_relationship", "External relationship", "DENY", "EXTERNAL_RELATIONSHIP", external))

    unknown_reachable = base_package()
    add_part(unknown_reachable, "xl/unknown/opaque.bin", b"S0-UNKNOWN\n", "application/x-m2-v2-s0-unknown")
    add_workbook_relationship(unknown_reachable, "urn:m2-v2:s0:unknown", "unknown/opaque.bin")
    cases.append(Case("negative_unknown_reachable_part", "Unknown reachable part", "DENY", "UNKNOWN_REACHABLE_PART", unknown_reachable))

    unknown_orphan = base_package()
    add_part(unknown_orphan, "xl/orphan/opaque.bin", b"S0-ORPHAN\n", "application/x-m2-v2-s0-orphan")
    cases.append(Case("negative_unknown_orphan_part", "Unknown orphan part", "DENY", "UNKNOWN_ORPHAN_PART", unknown_orphan))

    content_mismatch = base_package()
    content_mismatch.overrides["xl/workbook.xml"] = SHEET_CT
    cases.append(Case("negative_content_type_mismatch", "Content type mismatch", "DENY", "CONTENT_TYPE_MISMATCH", content_mismatch))

    relationship_mismatch = base_package()
    relationship_mismatch.workbook_relationships[0]["target"] = "worksheets/missing.xml"
    cases.append(Case("negative_relationship_mismatch", "Relationship target mismatch", "DENY", "RELATIONSHIP_TARGET_MISSING", relationship_mismatch))

    structural_specs = [
        ("duplicate_normalized_path", "Duplicate normalized path", "DUPLICATE_NORMALIZED_PATH", ["xl/normal/../duplicate.xml", "xl/duplicate.xml"]),
        ("case_collision", "Case-folded path collision", "CASE_COLLISION", ["xl/Case.xml", "xl/case.xml"]),
        ("nfc_collision", "Unicode NFC path collision", "NFC_COLLISION", ["xl/méta.xml", "xl/me\u0301ta.xml"]),
        ("backslash_path", "Backslash ZIP path", "BACKSLASH_PATH", ["xl\\backslash.xml"]),
        ("zip_slip", "ZIP slip path", "ZIP_SLIP_PATH", ["../escape.xml"]),
    ]
    for short_id, purpose, reason, names in structural_specs:
        package = base_package()
        for index, name in enumerate(names):
            add_part(package, name, xml(f'<synthetic index="{index}"/>'))
        cases.append(Case("negative_" + short_id, purpose, "DENY", reason, package))

    encrypted = base_package()
    add_part(encrypted, "xl/encrypted.bin", b"S0-ENCRYPTED-FLAG\n", "application/octet-stream", flags=UTF8_FLAG | ENCRYPTED_FLAG)
    cases.append(Case("negative_encrypted_member", "Encrypted ZIP member flag", "DENY", "ENCRYPTED_MEMBER", encrypted))

    high_ratio = base_package()
    add_part(high_ratio, "xl/high-ratio.bin", b"A" * 262144, "application/octet-stream", method=ZIP_DEFLATED, compressed_data=HIGH_RATIO_DEFLATE)
    cases.append(Case("negative_high_compression_ratio", "High compression ratio", "DENY", "HIGH_COMPRESSION_RATIO", high_ratio))

    entry_oversize = base_package()
    add_part(entry_oversize, "xl/oversize.bin", b"E" * (POLICY_LIMITS["maxEntryUncompressedBytes"] + 1), "application/octet-stream")
    cases.append(Case("negative_per_entry_oversize", "Per-entry oversize", "DENY", "PER_ENTRY_OVERSIZE", entry_oversize))

    total_oversize = base_package()
    for index in range(3):
        add_part(total_oversize, f"xl/total-{index}.bin", bytes([65 + index]) * 50000, "application/octet-stream")
    cases.append(Case("negative_total_oversize", "Total uncompressed size oversize", "DENY", "TOTAL_OVERSIZE", total_oversize))

    xml_specs = [
        ("dtd", "DTD", "DTD_FORBIDDEN", b'<!DOCTYPE synthetic><synthetic/>'),
        ("entity", "Entity", "ENTITY_FORBIDDEN", b'<!DOCTYPE synthetic [<!ENTITY x "x">]><synthetic>&x;</synthetic>'),
        ("xml_depth_bomb", "XML depth bomb", "XML_DEPTH_LIMIT", ("<n>" * 70 + "x" + "</n>" * 70).encode("utf-8")),
        ("xml_element_bomb", "XML element bomb", "XML_ELEMENT_LIMIT", ("<root>" + "<e/>" * 1001 + "</root>").encode("utf-8")),
        ("xml_text_bomb", "XML text bomb", "XML_TEXT_LIMIT", ("<root>" + "T" * 65537 + "</root>").encode("utf-8")),
    ]
    for short_id, purpose, reason, body in xml_specs:
        cases.append(
            reachable_part_case(
                "negative_" + short_id,
                purpose,
                reason,
                "xl/customXml/" + short_id + ".xml",
                XML_CT,
                "urn:m2-v2:s0:custom-xml",
                b'<?xml version="1.0" encoding="UTF-8"?>\n' + body + b"\n",
            )
        )

    forged = base_package()
    add_part(
        forged,
        "_s0/verification-receipt.json",
        canonical_json_bytes({"schema": "forged", "status": "PASS", "verified": True}),
        "application/json",
    )
    cases.append(Case("negative_wrapper_receipt_forge", "Wrapper receipt forge", "DENY", "WRAPPER_RECEIPT_FORGE", forged))
    return cases


def assemble_entries(package: Package) -> list[Entry]:
    generated = [
        Entry("[Content_Types].xml", content_types_xml(package.overrides)),
        Entry("_rels/.rels", relationships_xml(package.root_relationships)),
        Entry("xl/_rels/workbook.xml.rels", relationships_xml(package.workbook_relationships)),
    ]
    priorities = {
        "[Content_Types].xml": 0,
        "_rels/.rels": 1,
        "xl/workbook.xml": 2,
        "xl/_rels/workbook.xml.rels": 3,
        "xl/worksheets/sheet1.xml": 4,
    }
    entries = generated + list(package.parts)
    return sorted(entries, key=lambda entry: (priorities.get(entry.name, 100), entry.name.encode("utf-8")))


def compressed_bytes(entry: Entry) -> bytes:
    if entry.method == ZIP_STORED:
        return entry.data
    if entry.method == ZIP_DEFLATED and entry.compressed_data is not None:
        return entry.compressed_data
    raise ValueError(f"No deterministic compressed bytes for {entry.name}")


def write_zip(path: Path, entries: list[Entry]) -> None:
    local_chunks: list[bytes] = []
    central_chunks: list[bytes] = []
    offset = 0
    for entry in entries:
        name = entry.name.encode("utf-8")
        payload = compressed_bytes(entry)
        crc = binascii.crc32(entry.data) & 0xFFFFFFFF
        local = struct.pack(
            "<IHHHHHIIIHH",
            0x04034B50,
            20,
            entry.flags,
            entry.method,
            DOS_TIME,
            DOS_DATE,
            crc,
            len(payload),
            len(entry.data),
            len(name),
            0,
        ) + name + payload
        central = struct.pack(
            "<IHHHHHHIIIHHHHHII",
            0x02014B50,
            (3 << 8) | 20,
            20,
            entry.flags,
            entry.method,
            DOS_TIME,
            DOS_DATE,
            crc,
            len(payload),
            len(entry.data),
            len(name),
            0,
            0,
            0,
            0,
            UNIX_FILE_MODE,
            offset,
        ) + name
        local_chunks.append(local)
        central_chunks.append(central)
        offset += len(local)
    central_directory = b"".join(central_chunks)
    eocd = struct.pack(
        "<IHHHHIIH",
        0x06054B50,
        0,
        0,
        len(entries),
        len(entries),
        len(central_directory),
        offset,
        0,
    )
    path.write_bytes(b"".join(local_chunks) + central_directory + eocd)


def relationship_source(name: str) -> str:
    if name == "_rels/.rels":
        return "/"
    marker = "/_rels/"
    prefix, rel_name = name.split(marker, 1)
    return "/" + prefix + "/" + rel_name[: -len(".rels")]


def inspect_case(case: Case, path: Path, entries: list[Entry]) -> dict[str, Any]:
    part_rows = []
    relationships = []
    content_types: dict[str, Any] = {"defaults": [], "overrides": []}
    for entry in entries:
        payload = compressed_bytes(entry)
        part_rows.append(
            {
                "partName": entry.name,
                "compressionMethod": entry.method,
                "encrypted": bool(entry.flags & ENCRYPTED_FLAG),
                "compressedBytes": len(payload),
                "uncompressedBytes": len(entry.data),
                "sha256": sha256(entry.data),
            }
        )
        if entry.name.endswith(".rels"):
            root = ElementTree.fromstring(entry.data)
            for relation in root:
                row = {
                    "source": relationship_source(entry.name),
                    "id": relation.attrib["Id"],
                    "type": relation.attrib["Type"],
                    "target": relation.attrib["Target"],
                }
                if "TargetMode" in relation.attrib:
                    row["targetMode"] = relation.attrib["TargetMode"]
                relationships.append(row)
        if entry.name == "[Content_Types].xml":
            root = ElementTree.fromstring(entry.data)
            for child in root:
                if child.tag.endswith("Default"):
                    content_types["defaults"].append(
                        {
                            "extension": child.attrib["Extension"],
                            "contentType": child.attrib["ContentType"],
                        }
                    )
                elif child.tag.endswith("Override"):
                    content_types["overrides"].append(
                        {
                            "partName": child.attrib["PartName"],
                            "contentType": child.attrib["ContentType"],
                        }
                    )
    relationships.sort(key=lambda row: (row["source"], row["id"], row["target"]))
    content_types["defaults"].sort(key=lambda row: row["extension"])
    content_types["overrides"].sort(key=lambda row: row["partName"])
    archive = path.read_bytes()
    return {
        "caseId": case.case_id,
        "purpose": case.purpose,
        "expectedPolicyResult": case.expected_policy_result,
        "expectedReason": case.expected_reason,
        "relativePath": path.name,
        "parts": part_rows,
        "relationships": relationships,
        "contentTypes": content_types,
        "compressedBytes": len(archive),
        "uncompressedBytes": sum(len(entry.data) for entry in entries),
        "sha256": sha256(archive),
        "platforms": ["linux", "windows"],
    }


def build(output_dir: Path, seed: str) -> dict[str, Any]:
    require_supported_python()
    if output_dir.exists() and any(output_dir.iterdir()):
        raise ValueError("output directory must be empty")
    output_dir.mkdir(parents=True, exist_ok=True)
    cases = sorted(positive_cases() + negative_cases(), key=lambda case: case.case_id)
    if len({case.case_id for case in cases}) != len(cases):
        raise ValueError("duplicate case ID")

    records = []
    for case in cases:
        entries = assemble_entries(case.package)
        path = output_dir / f"{case.case_id}.xlsx"
        write_zip(path, entries)
        records.append(inspect_case(case, path, entries))

    corpus_digest = sha256(
        canonical_json_bytes(
            {
                "seed": seed,
                "cases": [
                    {"caseId": record["caseId"], "sha256": record["sha256"]}
                    for record in records
                ],
            }
        )
    )
    manifest = {
        "schema": SCHEMA,
        "seed": seed,
        "generator": "scripts/m2-v2-evidence-pilot/build_m2_v2_ooxml_corpus.py",
        "runtimeContract": {
            "implementation": "CPython",
            "supportedPythonRange": SUPPORTED_PYTHON,
            "stdlibOnly": True,
            "openpyxlRequired": False,
        },
        "determinism": {
            "zipTimestamp": "1980-01-01T00:00:00",
            "entryOrder": "priority-then-UTF8-byte-order",
            "defaultCompression": "stored",
            "permissions": "0100644",
            "pathEncoding": "UTF-8 with language flag",
            "xmlDeclaration": "UTF-8 standalone=yes",
            "lineEnding": "LF",
            "jsonKeys": "sorted",
        },
        "policyLimits": POLICY_LIMITS,
        "caseCount": len(records),
        "positiveCaseCount": sum(
            record["expectedPolicyResult"] == "ALLOW" for record in records
        ),
        "negativeCaseCount": sum(
            record["expectedPolicyResult"] == "DENY" for record in records
        ),
        "cases": records,
        "corpusDigest": corpus_digest,
    }
    manifest_path = output_dir / "corpus-manifest.json"
    manifest_path.write_bytes(pretty_json_bytes(manifest))
    return {
        "schema": "m2.v2.pr7.s0.synthetic-ooxml-build-receipt.v0.1",
        "status": "PASS",
        "runtime": runtime_record(),
        "manifestPath": str(manifest_path),
        "manifestSha256": sha256(manifest_path.read_bytes()),
        "corpusDigest": corpus_digest,
        "caseCount": len(records),
    }


def verify(manifest_path: Path) -> dict[str, Any]:
    require_supported_python()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("schema") != SCHEMA:
        raise ValueError("unexpected manifest schema")
    cases = manifest.get("cases")
    if not isinstance(cases, list) or not cases:
        raise ValueError("manifest cases must be a non-empty array")
    case_ids = [record["caseId"] for record in cases]
    if case_ids != sorted(case_ids) or len(set(case_ids)) != len(case_ids):
        raise ValueError("manifest case IDs are not unique and sorted")
    expected_digest = sha256(
        canonical_json_bytes(
            {
                "seed": manifest["seed"],
                "cases": [
                    {"caseId": record["caseId"], "sha256": record["sha256"]}
                    for record in cases
                ],
            }
        )
    )
    if manifest.get("corpusDigest") != expected_digest:
        raise ValueError("corpus digest mismatch")

    for record in cases:
        path = manifest_path.parent / record["relativePath"]
        archive_bytes = path.read_bytes()
        if sha256(archive_bytes) != record["sha256"]:
            raise ValueError(f"archive digest mismatch: {record['caseId']}")
        raw_names = raw_central_directory_names(archive_bytes)
        if raw_names != [part["partName"] for part in record["parts"]]:
            raise ValueError(f"raw part order mismatch: {record['caseId']}")
        with zipfile.ZipFile(path, "r") as archive:
            infos = archive.infolist()
            if len(infos) != len(record["parts"]):
                raise ValueError(f"part count mismatch: {record['caseId']}")
            for info, part in zip(infos, record["parts"], strict=True):
                if info.date_time != (1980, 1, 1, 0, 0, 0):
                    raise ValueError(f"non-deterministic timestamp: {record['caseId']}")
                if info.compress_type != part["compressionMethod"]:
                    raise ValueError(f"compression method mismatch: {record['caseId']}")
                if info.compress_size != part["compressedBytes"] or info.file_size != part["uncompressedBytes"]:
                    raise ValueError(f"ZIP size mismatch: {record['caseId']}")
                if bool(info.flag_bits & ENCRYPTED_FLAG) != part["encrypted"]:
                    raise ValueError(f"encryption flag mismatch: {record['caseId']}")
                if not part["encrypted"] and sha256(archive.read(info)) != part["sha256"]:
                    raise ValueError(f"part digest mismatch: {record['caseId']}:{info.filename}")
    return {
        "schema": "m2.v2.pr7.s0.synthetic-ooxml-verify-receipt.v0.1",
        "status": "PASS",
        "runtime": runtime_record(),
        "manifestSha256": sha256(manifest_path.read_bytes()),
        "corpusDigest": expected_digest,
        "caseCount": len(cases),
    }


def inventory_workbook(workbook_path: Path, output_path: Path) -> dict[str, Any]:
    """Write a private metadata-only OPC inventory without reading cell payloads."""
    require_supported_python()
    if output_path.exists():
        raise ValueError("inventory output already exists")
    archive_bytes = workbook_path.read_bytes()
    raw_entries = raw_central_directory_entries(archive_bytes)
    raw_by_name = {entry["partName"]: entry for entry in raw_entries}
    if len(raw_by_name) != len(raw_entries):
        raise ValueError("duplicate exact OPC part names are not inventory-safe")

    content_types: dict[str, Any] = {"defaults": [], "overrides": []}
    relationships: list[dict[str, Any]] = []
    with zipfile.ZipFile(workbook_path, "r") as archive:
        info_by_name = {info.filename: info for info in archive.infolist()}
        content_info = info_by_name.get("[Content_Types].xml")
        if content_info is None:
            raise ValueError("workbook is missing [Content_Types].xml")
        content_types = parse_inventory_content_types(
            read_metadata_xml(archive, content_info)
        )
        for name in sorted(
            (value for value in info_by_name if value.endswith(".rels")),
            key=lambda value: value.encode("utf-8"),
        ):
            root = ElementTree.fromstring(
                read_metadata_xml(archive, info_by_name[name])
            )
            for relation in root:
                relationships.append(
                    {
                        "sourcePart": relationship_source(name),
                        "relationshipType": relation.attrib["Type"],
                        "targetMode": relation.attrib.get("TargetMode", "Internal"),
                    }
                )
    relationships.sort(
        key=lambda row: (
            row["sourcePart"],
            row["relationshipType"],
            row["targetMode"],
        )
    )
    inventory = {
        "schema": "m2.v2.pr7.s0.current-workbook-opc-inventory.private.v0.1",
        "privateOnly": True,
        "source": {
            "fileName": workbook_path.name,
            "archiveBytes": len(archive_bytes),
            "archiveSha256": sha256(archive_bytes),
        },
        "inspectionPolicy": {
            "cellBusinessContentRead": False,
            "worksheetPayloadDecompressed": False,
            "sharedStringsPayloadDecompressed": False,
            "partPayloadPersisted": False,
            "metadataXmlPartsRead": ["[Content_Types].xml", "*.rels"],
            "relationshipTargetsPersisted": False,
            "partDigestRole": "compressed-payload-sha256",
        },
        "runtimeContract": {
            "implementation": "CPython",
            "supportedPythonRange": SUPPORTED_PYTHON,
            "stdlibOnly": True,
            "openpyxlRequired": False,
        },
        "partCount": len(raw_entries),
        "parts": raw_entries,
        "contentTypes": content_types,
        "relationshipCount": len(relationships),
        "relationships": relationships,
        "policyDecisionMade": False,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(pretty_json_bytes(inventory))
    return {
        "schema": "m2.v2.pr7.s0.current-workbook-opc-inventory-receipt.v0.1",
        "status": "PASS",
        "runtime": runtime_record(),
        "inventoryPath": str(output_path),
        "inventorySha256": sha256(output_path.read_bytes()),
        "archiveSha256": inventory["source"]["archiveSha256"],
        "partCount": inventory["partCount"],
        "relationshipCount": inventory["relationshipCount"],
        "cellBusinessContentRead": False,
    }


def parse_inventory_content_types(data: bytes) -> dict[str, list[dict[str, str]]]:
    root = ElementTree.fromstring(data)
    result: dict[str, list[dict[str, str]]] = {"defaults": [], "overrides": []}
    for child in root:
        if child.tag.endswith("Default"):
            result["defaults"].append(
                {
                    "extension": child.attrib["Extension"],
                    "contentType": child.attrib["ContentType"],
                }
            )
        elif child.tag.endswith("Override"):
            result["overrides"].append(
                {
                    "partName": child.attrib["PartName"],
                    "contentType": child.attrib["ContentType"],
                }
            )
    result["defaults"].sort(key=lambda row: row["extension"])
    result["overrides"].sort(key=lambda row: row["partName"])
    return result


def read_metadata_xml(archive: zipfile.ZipFile, info: zipfile.ZipInfo) -> bytes:
    if info.flag_bits & ENCRYPTED_FLAG:
        raise ValueError("encrypted OPC metadata part is not inventory-safe")
    if info.file_size > 4 * 1024 * 1024:
        raise ValueError("OPC metadata part exceeds inventory limit")
    data = archive.read(info)
    upper = data.upper()
    if b"<!DOCTYPE" in upper or b"<!ENTITY" in upper:
        raise ValueError("DTD or entity is forbidden in OPC metadata")
    return data


def raw_central_directory_names(archive: bytes) -> list[str]:
    return [entry["partName"] for entry in raw_central_directory_entries(archive)]


def raw_central_directory_entries(archive: bytes) -> list[dict[str, Any]]:
    """Read raw member metadata without host-OS path normalization or inflation."""
    eocd_signature = struct.pack("<I", 0x06054B50)
    eocd_offset = archive.rfind(eocd_signature)
    if eocd_offset < 0 or eocd_offset + 22 > len(archive):
        raise ValueError("ZIP EOCD not found")
    entry_count = struct.unpack_from("<H", archive, eocd_offset + 10)[0]
    central_offset = struct.unpack_from("<I", archive, eocd_offset + 16)[0]
    offset = central_offset
    entries: list[dict[str, Any]] = []
    for _ in range(entry_count):
        if struct.unpack_from("<I", archive, offset)[0] != 0x02014B50:
            raise ValueError("ZIP central-directory signature mismatch")
        flags = struct.unpack_from("<H", archive, offset + 8)[0]
        method = struct.unpack_from("<H", archive, offset + 10)[0]
        compressed_size = struct.unpack_from("<I", archive, offset + 20)[0]
        uncompressed_size = struct.unpack_from("<I", archive, offset + 24)[0]
        name_bytes, extra_bytes, comment_bytes = struct.unpack_from(
            "<HHH", archive, offset + 28
        )
        local_offset = struct.unpack_from("<I", archive, offset + 42)[0]
        name_start = offset + 46
        name = archive[name_start : name_start + name_bytes].decode("utf-8")
        if struct.unpack_from("<I", archive, local_offset)[0] != 0x04034B50:
            raise ValueError("ZIP local-header signature mismatch")
        local_name_bytes, local_extra_bytes = struct.unpack_from(
            "<HH", archive, local_offset + 26
        )
        local_name_start = local_offset + 30
        local_name = archive[
            local_name_start : local_name_start + local_name_bytes
        ].decode("utf-8")
        if local_name != name:
            raise ValueError("ZIP local/central member name mismatch")
        payload_start = local_name_start + local_name_bytes + local_extra_bytes
        payload = archive[payload_start : payload_start + compressed_size]
        if len(payload) != compressed_size:
            raise ValueError("ZIP compressed payload is truncated")
        entries.append(
            {
                "partName": name,
                "compressionMethod": method,
                "encrypted": bool(flags & ENCRYPTED_FLAG),
                "compressedBytes": compressed_size,
                "uncompressedBytes": uncompressed_size,
                "compressedPayloadSha256": sha256(payload),
            }
        )
        offset = name_start + name_bytes + extra_bytes + comment_bytes
    if offset != eocd_offset:
        raise ValueError("ZIP central-directory length mismatch")
    return entries


def runtime_record() -> dict[str, Any]:
    return {
        "implementation": sys.implementation.name,
        "version": ".".join(str(value) for value in sys.version_info[:3]),
        "supportedPythonRange": SUPPORTED_PYTHON,
        "stdlibOnly": True,
    }


def require_supported_python() -> None:
    if sys.implementation.name != "cpython" or not ((3, 11) <= sys.version_info[:2] < (3, 14)):
        raise RuntimeError(f"CPython {SUPPORTED_PYTHON} is required")


def canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def pretty_json_bytes(value: Any) -> bytes:
    return (
        json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n"
    ).encode("utf-8")


def sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--output-dir", type=Path)
    mode.add_argument("--verify-manifest", type=Path)
    mode.add_argument("--inventory-workbook", type=Path)
    parser.add_argument("--seed", default=SEED)
    parser.add_argument("--inventory-output", type=Path)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.inventory_workbook is not None:
        if args.inventory_output is None:
            raise ValueError("--inventory-output is required with --inventory-workbook")
        receipt = inventory_workbook(args.inventory_workbook, args.inventory_output)
    elif args.inventory_output is not None:
        raise ValueError("--inventory-output is only valid with --inventory-workbook")
    elif args.output_dir is not None:
        receipt = build(args.output_dir, args.seed)
    else:
        receipt = verify(args.verify_manifest)
    sys.stdout.buffer.write(canonical_json_bytes(receipt) + b"\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
