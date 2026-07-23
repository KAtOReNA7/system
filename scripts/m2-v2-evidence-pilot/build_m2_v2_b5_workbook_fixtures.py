#!/usr/bin/env python3
"""Build deterministic synthetic workbooks for the frozen PR #7 B5 cases.

The fixtures contain no governed data.  They use the same deterministic ZIP
writer as the S0 corpus and intentionally cover the complete v0.2 OOXML
profile plus one mutation per frozen adversarial case.
"""

from __future__ import annotations

import argparse
import copy
import json
from pathlib import Path
from typing import Any

from build_m2_v2_ooxml_corpus import (
    ENCRYPTED_FLAG,
    Entry,
    OFFICE_REL,
    PACKAGE_REL,
    UTF8_FLAG,
    canonical_json_bytes,
    sha256,
    write_zip,
    xml,
)


MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
DRAWING = "http://schemas.openxmlformats.org/drawingml/2006/main"
OFFICE_REL_NS = OFFICE_REL.rstrip("/")
REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
CONTENT_NS = "http://schemas.openxmlformats.org/package/2006/content-types"
WORKBOOK_CT = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"
SHEET_CT = "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"
STYLE_CT = "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"
SHARED_CT = "application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"
THEME_CT = "application/vnd.openxmlformats-officedocument.theme+xml"
TABLE_CT = "application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"
CORE_CT = "application/vnd.openxmlformats-package.core-properties+xml"
APP_CT = "application/vnd.openxmlformats-officedocument.extended-properties+xml"
REL_CT = "application/vnd.openxmlformats-package.relationships+xml"
SCHEMA = "m2.v2.pr7-b5-synthetic-workbook-fixtures.v0.1"


def relationships(rows: list[dict[str, str]]) -> bytes:
    body = "".join(
        '<Relationship Id="{id}" Type="{type}" Target="{target}"{mode}/>'.format(
            id=row["id"],
            type=row["type"],
            target=row["target"],
            mode=f' TargetMode="{row["targetMode"]}"'
            if row.get("targetMode")
            else "",
        )
        for row in rows
    )
    return xml(f'<Relationships xmlns="{REL_NS}">{body}</Relationships>')


def content_types(entries: dict[str, Entry], overrides: dict[str, str]) -> bytes:
    override_rows = "".join(
        f'<Override PartName="/{name}" ContentType="{overrides[name]}"/>'
        for name in sorted(overrides, key=lambda item: item.encode("utf-8"))
    )
    return xml(
        f'<Types xmlns="{CONTENT_NS}">'
        f'<Default Extension="rels" ContentType="{REL_CT}"/>'
        f'<Default Extension="xml" ContentType="{WORKBOOK_CT}"/>'
        f"{override_rows}</Types>"
    )


def worksheet(table_index: int, *, header_footer: bool = False) -> bytes:
    header = "<headerFooter><oddHeader>Synthetic</oddHeader></headerFooter>" if header_footer else ""
    return xml(
        f'<worksheet xmlns="{MAIN}" xmlns:r="{OFFICE_REL_NS}">'
        '<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Value</t></is></c></row></sheetData>'
        f"{header}<tableParts count=\"1\"><tablePart r:id=\"rId1\"/></tableParts>"
        "</worksheet>"
    )


def table_xml(index: int) -> bytes:
    return xml(
        f'<table xmlns="{MAIN}" id="{index}" name="Table{index}" displayName="Table{index}" '
        'ref="A1:A1" totalsRowShown="0"><autoFilter ref="A1:A1"/>'
        '<tableColumns count="1"><tableColumn id="1" name="Value"/></tableColumns>'
        '<tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" '
        'showRowStripes="1" showColumnStripes="0"/></table>'
    )


def valid_entries() -> dict[str, Entry]:
    workbook = xml(
        f'<workbook xmlns="{MAIN}" xmlns:r="{OFFICE_REL_NS}"><sheets>'
        '<sheet name="Review1" sheetId="1" r:id="rId1"/>'
        '<sheet name="Review2" sheetId="2" r:id="rId2"/>'
        '<sheet name="Review3" sheetId="3" r:id="rId3"/>'
        "</sheets></workbook>"
    )
    root_rels = relationships(
        [
            {"id": "rId1", "type": OFFICE_REL + "officeDocument", "target": "xl/workbook.xml"},
            {"id": "rId2", "type": PACKAGE_REL + "core-properties", "target": "docProps/core.xml"},
            {"id": "rId3", "type": OFFICE_REL + "extended-properties", "target": "docProps/app.xml"},
        ]
    )
    workbook_rels = relationships(
        [
            {"id": "rId1", "type": OFFICE_REL + "worksheet", "target": "worksheets/sheet1.xml"},
            {"id": "rId2", "type": OFFICE_REL + "worksheet", "target": "worksheets/sheet2.xml"},
            {"id": "rId3", "type": OFFICE_REL + "worksheet", "target": "worksheets/sheet3.xml"},
            {"id": "rId4", "type": OFFICE_REL + "styles", "target": "styles.xml"},
            {"id": "rId5", "type": OFFICE_REL + "sharedStrings", "target": "sharedStrings.xml"},
            {"id": "rId6", "type": OFFICE_REL + "theme", "target": "theme/theme1.xml"},
        ]
    )
    entries: dict[str, Entry] = {
        "_rels/.rels": Entry("_rels/.rels", root_rels),
        "xl/workbook.xml": Entry("xl/workbook.xml", workbook),
        "xl/_rels/workbook.xml.rels": Entry("xl/_rels/workbook.xml.rels", workbook_rels),
        "xl/styles.xml": Entry(
            "xl/styles.xml",
            xml(
                f'<styleSheet xmlns="{MAIN}"><fonts count="0"/><fills count="0"/>'
                '<borders count="0"/><cellStyleXfs count="0"/><cellXfs count="0"/>'
                "</styleSheet>"
            ),
        ),
        "xl/sharedStrings.xml": Entry(
            "xl/sharedStrings.xml",
            xml(f'<sst xmlns="{MAIN}" count="1" uniqueCount="1"><si><t>Synthetic</t></si></sst>'),
        ),
        "xl/theme/theme1.xml": Entry(
            "xl/theme/theme1.xml",
            xml(
                f'<a:theme xmlns:a="{DRAWING}" name="Synthetic">'
                '<a:themeElements><a:clrScheme name="Synthetic"/></a:themeElements></a:theme>'
            ),
        ),
        "docProps/core.xml": Entry(
            "docProps/core.xml",
            xml(
                '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
                'xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Synthetic</dc:title>'
                "</cp:coreProperties>"
            ),
        ),
        "docProps/app.xml": Entry(
            "docProps/app.xml",
            xml(
                '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">'
                "<Application>B5 Fixture</Application></Properties>"
            ),
        ),
    }
    for index in range(1, 4):
        sheet_name = f"xl/worksheets/sheet{index}.xml"
        sheet_rel = f"xl/worksheets/_rels/sheet{index}.xml.rels"
        table_name = f"xl/tables/table{index}.xml"
        entries[sheet_name] = Entry(sheet_name, worksheet(index))
        entries[sheet_rel] = Entry(
            sheet_rel,
            relationships(
                [{"id": "rId1", "type": OFFICE_REL + "table", "target": f"/xl/tables/table{index}.xml"}]
            ),
        )
        entries[table_name] = Entry(table_name, table_xml(index))
    overrides = {
        "xl/styles.xml": STYLE_CT,
        "xl/sharedStrings.xml": SHARED_CT,
        "xl/theme/theme1.xml": THEME_CT,
        "docProps/core.xml": CORE_CT,
        "docProps/app.xml": APP_CT,
        **{f"xl/worksheets/sheet{i}.xml": SHEET_CT for i in range(1, 4)},
        **{f"xl/tables/table{i}.xml": TABLE_CT for i in range(1, 4)},
    }
    entries["[Content_Types].xml"] = Entry(
        "[Content_Types].xml", content_types(entries, overrides)
    )
    return entries


def add_part(
    entries: dict[str, Entry],
    name: str,
    data: bytes,
    content_type: str,
    *,
    relationship_type: str | None = None,
    target_mode: str | None = None,
    flags: int = UTF8_FLAG,
) -> None:
    entries[name] = Entry(name, data, flags=flags)
    overrides = read_overrides(entries["[Content_Types].xml"].data)
    overrides[name] = content_type
    entries["[Content_Types].xml"] = Entry(
        "[Content_Types].xml", content_types(entries, overrides)
    )
    if relationship_type:
        rows = read_relationships(entries["xl/_rels/workbook.xml.rels"].data)
        row = {
            "id": f"rId{len(rows) + 1}",
            "type": relationship_type,
            "target": name[3:] if name.startswith("xl/") else f"../{name}",
        }
        if target_mode:
            row["targetMode"] = target_mode
        rows.append(row)
        entries["xl/_rels/workbook.xml.rels"] = Entry(
            "xl/_rels/workbook.xml.rels", relationships(rows)
        )


def read_overrides(data: bytes) -> dict[str, str]:
    from xml.etree import ElementTree as ET

    root = ET.fromstring(data)
    return {
        child.attrib["PartName"].lstrip("/"): child.attrib["ContentType"]
        for child in list(root)
        if child.tag.endswith("Override")
    }


def read_relationships(data: bytes) -> list[dict[str, str]]:
    from xml.etree import ElementTree as ET

    root = ET.fromstring(data)
    return [
        {
            "id": child.attrib["Id"],
            "type": child.attrib["Type"],
            "target": child.attrib["Target"],
            **({"targetMode": child.attrib["TargetMode"]} if "TargetMode" in child.attrib else {}),
        }
        for child in list(root)
    ]


def cases() -> dict[str, dict[str, Entry]]:
    result: dict[str, dict[str, Entry]] = {}
    result["PR7-P1-013-structural-pass"] = valid_entries()

    docprops = valid_entries()
    synthetic_secret_shape = "sk-" + "SYNTHETIC" + ("X" * 24)
    add_part(
        docprops,
        "docProps/custom.xml",
        xml(
            '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties">'
            f"<property><value>{synthetic_secret_shape}</value></property></Properties>"
        ),
        "application/vnd.openxmlformats-officedocument.custom-properties+xml",
        relationship_type=OFFICE_REL + "custom-properties",
    )
    result["PR7-P1-013-docprops"] = docprops

    comments = valid_entries()
    add_part(
        comments,
        "xl/comments1.xml",
        xml('<comments xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"/>'),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml",
        relationship_type=OFFICE_REL + "comments",
    )
    result["PR7-P1-013-comments"] = comments

    drawing = valid_entries()
    add_part(
        drawing,
        "xl/drawings/drawing1.xml",
        xml(f'<a:drawing xmlns:a="{DRAWING}"/>'),
        "application/vnd.openxmlformats-officedocument.drawing+xml",
        relationship_type=OFFICE_REL + "drawing",
    )
    result["PR7-P1-013-drawing-chart"] = drawing

    media = valid_entries()
    add_part(
        media,
        "xl/media/image1.png",
        b"B5-SYNTHETIC-NOT-AN-IMAGE\n",
        "image/png",
        relationship_type=OFFICE_REL + "image",
    )
    result["PR7-P1-013-media-embedded"] = media

    header = valid_entries()
    header["xl/worksheets/sheet1.xml"] = Entry(
        "xl/worksheets/sheet1.xml", worksheet(1, header_footer=True)
    )
    result["PR7-P1-013-header-footer"] = header

    external = valid_entries()
    rows = read_relationships(external["xl/_rels/workbook.xml.rels"].data)
    rows.append(
        {
            "id": "rId7",
            "type": OFFICE_REL + "externalLinkPath",
            "target": "https://example.invalid/synthetic.xlsx",
            "targetMode": "External",
        }
    )
    external["xl/_rels/workbook.xml.rels"] = Entry(
        "xl/_rels/workbook.xml.rels", relationships(rows)
    )
    result["PR7-P1-013-external"] = external

    orphan = valid_entries()
    add_part(orphan, "xl/orphan/opaque.dat", b"B5-ORPHAN\n", "application/octet-stream")
    result["PR7-P1-013-unknown-orphan"] = orphan

    path_case = valid_entries()
    add_part(path_case, "../escape.xml", xml("<escape/>"), "application/xml")
    result["PR7-P1-013-zip-path-duplicate"] = path_case

    bomb = valid_entries()
    add_part(
        bomb,
        "xl/media/encrypted.bin",
        b"B5-ENCRYPTED-FLAG\n",
        "application/octet-stream",
        flags=UTF8_FLAG | ENCRYPTED_FLAG,
    )
    result["PR7-P1-013-zip-bomb"] = bomb

    xml_bomb = valid_entries()
    xml_bomb["xl/theme/theme1.xml"] = Entry(
        "xl/theme/theme1.xml",
        (
            f'<?xml version="1.0" encoding="UTF-8"?>\n'
            f'<!DOCTYPE a:theme [<!ENTITY x "synthetic">]>'
            f'<a:theme xmlns:a="{DRAWING}" name="Synthetic">&x;</a:theme>\n'
        ).encode("utf-8"),
    )
    result["PR7-P1-013-xml-bomb"] = xml_bomb
    return result


def build(output_dir: Path) -> dict[str, Any]:
    if output_dir.exists() and any(output_dir.iterdir()):
        raise ValueError("output directory must be empty")
    output_dir.mkdir(parents=True, exist_ok=True)
    records = []
    for case_id, entry_map in sorted(cases().items()):
        path = output_dir / f"{case_id}.xlsx"
        ordered = sorted(
            entry_map.values(),
            key=lambda entry: (
                {"[Content_Types].xml": 0, "_rels/.rels": 1, "xl/workbook.xml": 2}.get(
                    entry.name, 100
                ),
                entry.name.encode("utf-8"),
            ),
        )
        write_zip(path, ordered)
        records.append(
            {
                "caseId": case_id,
                "relativePath": path.name,
                "sha256": sha256(path.read_bytes()),
                "entryCount": len(ordered),
            }
        )
    manifest = {
        "schema": SCHEMA,
        "syntheticOnly": True,
        "providerRequestDelta": 0,
        "actualExternalFetchCount": 0,
        "caseCount": len(records),
        "cases": records,
    }
    (output_dir / "manifest.json").write_bytes(canonical_json_bytes(manifest) + b"\n")
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(build(args.output_dir), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
