#!/usr/bin/env python3
"""Export every visible sheet of the source workbooks to data/sheets/<key>.json.

Each file: {"title", "source", "tables": [{"cols": [first,last], "rows": [[cell text, ...], ...]}],
            "charts": [{"title","type","cats":[...],"series":[{"name","values":[...]}]}]}
Cell text is formatted with the cell's own Excel number format, so the page shows
exactly what the workbook shows. Tables are split where a whole column is empty.
Usage: python3 tools/export_sheets.py <recalculated xlsx folder> <original xlsx folder>
Recalculate first (the pipelines write formulas without cached values):
  soffice --headless --calc --convert-to xlsx:"Calc MS Excel 2007 XML" --outdir <recalc> <originals>/*.xlsx
"""
import openpyxl, json, os, re, sys, datetime
from openpyxl.utils import range_boundaries, get_column_letter

SRC = sys.argv[1] if len(sys.argv) > 1 else "."  # recalculated copies (LibreOffice), for values
ORIG = sys.argv[2] if len(sys.argv) > 2 else SRC  # originals, for chart definitions
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "sheets")
BOOKS = [
    ("ads", "Updated Tuktuki Meta Daily Report.xlsx", "Daily Ads report"),
    ("ig", "Updated Tuktuki Instagram Daily Analysis.xlsx", "Instagram & YouTube report"),
    ("biz", "Tuktuki Business Performance Tracker.xlsx", "Business Performance Tracker"),
    ("infl", "TukTuki_Influencer_Dashboard.xlsx", "Influencer dashboard"),
]


def fmt(v, nf):
    if v is None:
        return ""
    if isinstance(v, bool):
        return "Yes" if v else "No"
    if isinstance(v, datetime.datetime):
        if v.hour or v.minute:
            return v.strftime("%-d %b %Y %H:%M")
        return v.strftime("%-d %b %Y")
    if isinstance(v, datetime.date):
        return v.strftime("%-d %b %Y")
    if isinstance(v, (int, float)):
        nf = nf or "General"
        f = nf.split(";")[0]
        dec = 0
        m = re.search(r"0\.(0+)", f)
        if m:
            dec = len(m.group(1))
        if "%" in f:
            return f"{v*100:.{dec}f}%"
        cur = "₹" if "₹" in f or "Rs" in f else ("$" if "$" in f else "")
        if f == "General" or f == "@":
            if isinstance(v, float) and not v.is_integer():
                s = f"{v:,.2f}".rstrip("0").rstrip(".") if abs(v) >= 1 else f"{v:.4g}"
            else:
                s = f"{int(v):,}"
            return s
        if "x" in f.lower() and "0" in f and "×" not in f and '"x"' in f.lower():
            return f"{v:,.{dec}f}x"
        s = f"{v:,.{dec}f}" if "," in f else f"{v:.{dec}f}"
        if cur:
            s = ("-" if v < 0 else "") + cur + s.lstrip("-")
        suf = re.search(r'"([^"0#]*)"\s*$', f)
        if suf and suf.group(1).strip() and suf.group(1) not in ("₹",):
            s += suf.group(1)
        return s
    return str(v).strip()


def hidden_sets(ws):
    hc = set()
    for k, d in ws.column_dimensions.items():
        if d.hidden:
            for c in range(d.min or 0, (d.max or 0) + 1):
                hc.add(c)
    hr = {i for i, d in ws.row_dimensions.items() if d.hidden and not d.outlineLevel}  # keep collapsed groups
    return hc, hr


def sheet_tables(ws):
    rows = []
    maxc = 0
    hc, hr = hidden_sets(ws)
    for r in ws.iter_rows():
        if r and r[0].row in hr:
            continue
        lvl = ws.row_dimensions[r[0].row].outlineLevel if r else 0
        row = [fmt(c.value, c.number_format) for c in r if c.column not in hc]
        if lvl:
            row = row[:1] and [("\u00a0\u00a0" * lvl) + row[0]] + row[1:]
        while row and row[-1] == "":
            row.pop()
        rows.append(row)
        maxc = max(maxc, len(row))
    while rows and not rows[-1]:
        rows.pop()
    if not rows:
        return []
    # column occupancy -> split into blocks at fully empty columns
    occ = [any(i < len(r) and r[i] for r in rows) for i in range(maxc)]
    blocks, start = [], None
    for i, o in enumerate(occ + [False]):
        if o and start is None:
            start = i
        if not o and start is not None:
            blocks.append((start, i - 1)); start = None
    # merge tiny blocks (1 col) into neighbour so labels stay with their table
    merged = []
    for b in blocks:
        if merged and (b[1] - b[0] < 1 or merged[-1][1] - merged[-1][0] < 1) and b[0] - merged[-1][1] <= 2:
            merged[-1] = (merged[-1][0], b[1])
        else:
            merged.append(b)
    out = []
    for a, b in merged:
        t = [r[a:b + 1] + [""] * max(0, b + 1 - max(a, len(r))) if len(r) > a else [] for r in rows]
        t = [[c for c in r][: b - a + 1] for r in t]
        t = [r if any(r) else [] for r in t]
        # drop leading/trailing empty rows
        while t and not t[0]: t.pop(0)
        while t and not t[-1]: t.pop()
        # collapse runs of empty rows to one
        tt = []
        for r in t:
            if not r and tt and not tt[-1]:
                continue
            tt.append(r)
        if tt:
            out.append({"cols": [get_column_letter(a + 1), get_column_letter(b + 1)], "rows": tt})
    return out


def resolve(wb, ref):
    if not ref:
        return []
    m = re.match(r"^'?(.*?)'?!(.+)$", ref)
    ws = wb[m.group(1)]
    c1, r1, c2, r2 = range_boundaries(m.group(2).replace("$", ""))
    vals = []
    for r in range(r1, r2 + 1):
        for c in range(c1, c2 + 1):
            vals.append(ws.cell(r, c).value)
    return vals


def charts(wb, wbv, ws):
    out = []
    for ch in ws._charts:
        try:
            title = "".join(r.t for p in ch.title.tx.rich.p for r in (p.r or []))
        except Exception:
            title = ""
        typ = type(ch).__name__.replace("Chart", "").lower()
        cats, series = None, []
        for s in ch.series:
            cref = None
            if s.cat is not None:
                cref = (s.cat.numRef or s.cat.strRef).f if (s.cat.numRef or s.cat.strRef) else None
            if cats is None and cref:
                cats = [fmt(v, None) if not isinstance(v, str) else v for v in resolve(wbv, cref)]
            name = ""
            if s.tx is not None and s.tx.strRef is not None:
                nv = resolve(wbv, s.tx.strRef.f)
                name = str(nv[0]) if nv else ""
            vals = resolve(wbv, s.val.numRef.f) if s.val and s.val.numRef else []
            vals = [v if isinstance(v, (int, float)) else None for v in vals]
            series.append({"name": name, "values": vals})
        out.append({"title": title, "type": typ, "cats": cats or [], "series": series,
                    "grouping": getattr(ch, "grouping", None)})
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    index = []
    for key, fn, label in BOOKS:
        p = os.path.join(SRC, fn)
        if not os.path.exists(p):
            print("missing", fn); continue
        wbv = openpyxl.load_workbook(p, data_only=True)
        wbf = openpyxl.load_workbook(os.path.join(ORIG, fn)) if key == 'ig' else None  # chart definitions (only the IG workbook has charts)
        import gc; gc.collect()
        for i, ws in enumerate(wbv.worksheets):
            if ws.sheet_state != "visible":
                continue
            sid = f"{key}_{i:02d}"
            data = {"id": sid, "book": key, "bookLabel": label, "title": ws.title,
                    "tables": sheet_tables(ws), "charts": charts(wbf, wbv, wbf[ws.title]) if wbf else []}
            with open(os.path.join(OUT, sid + ".json"), "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
            n = sum(len(t["rows"]) for t in data["tables"])
            index.append({"id": sid, "book": key, "title": ws.title, "rows": n, "tables": len(data["tables"]), "charts": len(data["charts"])})
            print(sid, ws.title, n, "rows", len(data["tables"]), "tables", len(data["charts"]), "charts")
    with open(os.path.join(OUT, "index.json"), "w") as f:
        json.dump(index, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
