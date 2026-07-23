#!/usr/bin/env python3
"""Build the deterministic B6 private review workbook from normalized rows.

The caller is responsible for deriving the row JSON from governed private
source/evidence records.  This generator uses only the Python standard
library, emits a closed OOXML package, and never performs network access.
"""

from __future__ import annotations

import argparse
import json
from html import escape
from pathlib import Path
from urllib.parse import urlparse

from build_m2_v2_ooxml_corpus import Entry, OFFICE_REL, PACKAGE_REL, write_zip, xml


MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
OFFICE_REL_NS = OFFICE_REL.rstrip("/")
CONTENT_NS = "http://schemas.openxmlformats.org/package/2006/content-types"
WORKBOOK_CT = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"
SHEET_CT = "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"
STYLE_CT = "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"
TABLE_CT = "application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml"
CORE_CT = "application/vnd.openxmlformats-package.core-properties+xml"
APP_CT = "application/vnd.openxmlformats-officedocument.extended-properties+xml"
REL_CT = "application/vnd.openxmlformats-package.relationships+xml"

HEADERS = [
    "anonymousSampleId",
    "evidenceCategory",
    "sourceType",
    "claim",
    "structuredValue",
    "sourceTitle",
    "capturedAt",
    "availableAt",
    "availableAtBasis",
    "eventTime",
    "workIdentityConfidence",
    "authorIdentityConfidence",
    "evidenceConfidence",
    "conflictStatus",
    "rejectionOrLimitation",
    "userDecision",
]


def rels(rows: list[dict[str, str]]) -> bytes:
    body = "".join(
        '<Relationship Id="{id}" Type="{type}" Target="{target}"{mode}/>'.format(
            id=escape(row["id"], quote=True),
            type=escape(row["type"], quote=True),
            target=escape(row["target"], quote=True),
            mode=(
                f' TargetMode="{escape(row["targetMode"], quote=True)}"'
                if row.get("targetMode")
                else ""
            ),
        )
        for row in rows
    )
    return xml(f'<Relationships xmlns="{REL_NS}">{body}</Relationships>')


def cell_ref(column: int, row: int) -> str:
    value = column
    letters = ""
    while value:
        value, remainder = divmod(value - 1, 26)
        letters = chr(65 + remainder) + letters
    return f"{letters}{row}"


def safe_text(value: object) -> str:
    if value is None:
        return ""
    text = str(value).replace("\r\n", "\n").replace("\r", "\n")
    return "".join(character for character in text if character in "\n\t" or ord(character) >= 32)


def inline_cell(column: int, row: int, value: object) -> str:
    reference = cell_ref(column, row)
    text = escape(safe_text(value))
    return f'<c r="{reference}" t="inlineStr"><is><t>{text}</t></is></c>'


def safe_hyperlink(value: object) -> str | None:
    text = safe_text(value).strip()
    if not text or len(text.encode("utf-8")) > 4096:
        return None
    parsed = urlparse(text)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return None
    if parsed.username or parsed.password:
        return None
    return text


def worksheet(rows: list[dict[str, object]], table_id: int) -> tuple[bytes, bytes]:
    sheet_rows = [HEADERS] + [[row.get(header, "") for header in HEADERS] for row in rows]
    xml_rows = []
    hyperlinks = []
    relationships = [
        {
            "id": "rId1",
            "type": OFFICE_REL + "table",
            "target": f"/xl/tables/table{table_id}.xml",
        }
    ]
    hyperlink_relation_by_target: dict[str, str] = {}
    for row_index, values in enumerate(sheet_rows, start=1):
        cells = "".join(inline_cell(index, row_index, value) for index, value in enumerate(values, start=1))
        xml_rows.append(f'<row r="{row_index}">{cells}</row>')
        if row_index > 1:
            target = safe_hyperlink(rows[row_index - 2].get("sourceUrl"))
            if target:
                relation_id = hyperlink_relation_by_target.get(target)
                if relation_id is None:
                    relation_id = f"rId{len(relationships) + 1}"
                    hyperlink_relation_by_target[target] = relation_id
                    relationships.append(
                        {
                            "id": relation_id,
                            "type": OFFICE_REL + "hyperlink",
                            "target": target,
                            "targetMode": "External",
                        }
                    )
                hyperlinks.append(f'<hyperlink ref="F{row_index}" r:id="{relation_id}"/>')
    last_row = max(1, len(sheet_rows))
    last_column = cell_ref(len(HEADERS), 1)[:-1]
    hyperlink_xml = f"<hyperlinks>{''.join(hyperlinks)}</hyperlinks>" if hyperlinks else ""
    body = (
        f'<worksheet xmlns="{MAIN}" xmlns:r="{OFFICE_REL_NS}">'
        f"<sheetData>{''.join(xml_rows)}</sheetData>"
        f"{hyperlink_xml}"
        f'<tableParts count="1"><tablePart r:id="rId1"/></tableParts>'
        "</worksheet>"
    )
    return xml(body), rels(relationships)


def table_xml(table_id: int, row_count: int) -> bytes:
    last_row = max(1, row_count + 1)
    last_column = cell_ref(len(HEADERS), 1)[:-1]
    columns = "".join(
        f'<tableColumn id="{index}" name="{escape(header, quote=True)}"/>'
        for index, header in enumerate(HEADERS, start=1)
    )
    return xml(
        f'<table xmlns="{MAIN}" id="{table_id}" name="B6Review{table_id}" '
        f'displayName="B6Review{table_id}" ref="A1:{last_column}{last_row}" totalsRowShown="0">'
        f'<autoFilter ref="A1:{last_column}{last_row}"/>'
        f'<tableColumns count="{len(HEADERS)}">{columns}</tableColumns>'
        '<tableStyleInfo name="TableStyleMedium2" showFirstColumn="0" showLastColumn="0" '
        'showRowStripes="1" showColumnStripes="0"/></table>'
    )


def build(input_path: Path, output_path: Path) -> None:
    payload = json.loads(input_path.read_text(encoding="utf-8"))
    if payload.get("schema") != "m2.v2.b6-private-review-workbook-input.v0.1":
        raise ValueError("b6 workbook input schema invalid")
    rows = payload.get("rows")
    if not isinstance(rows, list) or not rows:
        raise ValueError("b6 workbook rows missing")
    if output_path.exists():
        raise ValueError("b6 workbook output already exists")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    priority = [
        row for row in rows
        if row.get("conflictStatus") not in {"", "none", None}
        or row.get("rejectionOrLimitation")
    ]
    sheets = [
        ("Priority Review", priority or rows[:1]),
        ("All Evidence", rows),
    ]
    workbook = xml(
        f'<workbook xmlns="{MAIN}" xmlns:r="{OFFICE_REL_NS}"><sheets>'
        + "".join(
            f'<sheet name="{escape(name, quote=True)}" sheetId="{index}" r:id="rId{index}"/>'
            for index, (name, _) in enumerate(sheets, start=1)
        )
        + "</sheets></workbook>"
    )
    workbook_relationships = [
        {
            "id": f"rId{index}",
            "type": OFFICE_REL + "worksheet",
            "target": f"worksheets/sheet{index}.xml",
        }
        for index in range(1, len(sheets) + 1)
    ] + [{"id": f"rId{len(sheets) + 1}", "type": OFFICE_REL + "styles", "target": "styles.xml"}]
    entries = [
        Entry(
            "_rels/.rels",
            rels(
                [
                    {"id": "rId1", "type": OFFICE_REL + "officeDocument", "target": "xl/workbook.xml"},
                    {"id": "rId2", "type": PACKAGE_REL + "core-properties", "target": "docProps/core.xml"},
                    {"id": "rId3", "type": OFFICE_REL + "extended-properties", "target": "docProps/app.xml"},
                ]
            ),
        ),
        Entry("xl/workbook.xml", workbook),
        Entry("xl/_rels/workbook.xml.rels", rels(workbook_relationships)),
        Entry(
            "xl/styles.xml",
            xml(
                f'<styleSheet xmlns="{MAIN}"><fonts count="0"/><fills count="0"/>'
                '<borders count="0"/><cellStyleXfs count="0"/><cellXfs count="0"/></styleSheet>'
            ),
        ),
        Entry(
            "docProps/core.xml",
            xml(
                '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
                'xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>M2 v2 B6 Private Review</dc:title>'
                "</cp:coreProperties>"
            ),
        ),
        Entry(
            "docProps/app.xml",
            xml(
                '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">'
                "<Application>Deterministic B6 Generator</Application></Properties>"
            ),
        ),
    ]
    overrides = {
        "xl/styles.xml": STYLE_CT,
        "docProps/core.xml": CORE_CT,
        "docProps/app.xml": APP_CT,
    }
    for index, (_, sheet_rows) in enumerate(sheets, start=1):
        sheet, sheet_rels = worksheet(sheet_rows, index)
        entries.extend(
            [
                Entry(f"xl/worksheets/sheet{index}.xml", sheet),
                Entry(f"xl/worksheets/_rels/sheet{index}.xml.rels", sheet_rels),
                Entry(f"xl/tables/table{index}.xml", table_xml(index, len(sheet_rows))),
            ]
        )
        overrides[f"xl/worksheets/sheet{index}.xml"] = SHEET_CT
        overrides[f"xl/tables/table{index}.xml"] = TABLE_CT
    override_rows = "".join(
        f'<Override PartName="/{name}" ContentType="{overrides[name]}"/>'
        for name in sorted(overrides, key=lambda value: value.encode("utf-8"))
    )
    entries.append(
        Entry(
            "[Content_Types].xml",
            xml(
                f'<Types xmlns="{CONTENT_NS}">'
                f'<Default Extension="rels" ContentType="{REL_CT}"/>'
                f'<Default Extension="xml" ContentType="{WORKBOOK_CT}"/>'
                f"{override_rows}</Types>"
            ),
        )
    )
    entries.sort(
        key=lambda entry: (
            {"[Content_Types].xml": 0, "_rels/.rels": 1, "xl/workbook.xml": 2}.get(entry.name, 100),
            entry.name.encode("utf-8"),
        )
    )
    write_zip(output_path, entries)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    build(args.input, args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
