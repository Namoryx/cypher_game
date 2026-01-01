import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def get_shared_strings(zf: zipfile.ZipFile):
    try:
        data = zf.read("xl/sharedStrings.xml")
    except KeyError:
        return []
    root = ET.fromstring(data)
    strings = []
    for si in root.findall(f"{NS}si"):
        text_parts = []
        for t in si.iter(f"{NS}t"):
            text_parts.append(t.text or "")
        strings.append("".join(text_parts))
    return strings


def cell_value(cell, shared_strings):
    cell_type = cell.get("t")
    v = cell.find(f"{NS}v")
    if cell_type == "s":
        if v is None or v.text is None:
            return ""
        idx = int(v.text)
        return shared_strings[idx] if 0 <= idx < len(shared_strings) else ""
    if cell_type == "inlineStr":
        t = cell.find(f"{NS}is/{NS}t")
        return t.text or "" if t is not None else ""
    if v is not None:
        return v.text or ""
    return ""


def parse_sheet(zf: zipfile.ZipFile, shared_strings):
    data = zf.read("xl/worksheets/sheet1.xml")
    root = ET.fromstring(data)
    sheet_data = root.find(f"{NS}sheetData")
    if sheet_data is None:
        return []

    header_map = {}
    rows = []
    for row in sheet_data.findall(f"{NS}row"):
        cells = row.findall(f"{NS}c")
        if not header_map:
            for cell in cells:
                ref = cell.get("r", "")
                match = re.match(r"([A-Z]+)", ref)
                if not match:
                    continue
                column = match.group(1)
                header_value = cell_value(cell, shared_strings)
                header_map[column] = header_value
            continue

        if not header_map:
            continue

        row_data = {}
        for cell in cells:
            ref = cell.get("r", "")
            match = re.match(r"([A-Z]+)", ref)
            if not match:
                continue
            column = match.group(1)
            header = header_map.get(column)
            if not header:
                continue
            row_data[header] = cell_value(cell, shared_strings)
        if any(value != "" for value in row_data.values()):
            rows.append(row_data)
    return rows


def read_xlsx(path: str):
    with zipfile.ZipFile(path, "r") as zf:
        shared_strings = get_shared_strings(zf)
        return parse_sheet(zf, shared_strings)


def main():
    if len(sys.argv) < 2:
        print("Usage: python read_xlsx.py <path>", file=sys.stderr)
        sys.exit(1)
    path = sys.argv[1]
    rows = read_xlsx(path)
    json.dump(rows, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
