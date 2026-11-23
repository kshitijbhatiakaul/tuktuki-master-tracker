#!/usr/bin/env python3
"""Export the Daily Ads report's hidden calculation sheets (_dash, _wm, _dcamp, _meta)
to data/ads_engine.json. Ad set and ad ids in _wm get names from the report's engine files.
Usage: python3 tools/export_engine.py <recalculated ads xlsx> <engine data folder>"""
import openpyxl, json, os, sys
xl, eng = sys.argv[1], sys.argv[2]
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "ads_engine.json")
wb = openpyxl.load_workbook(xl, read_only=True, data_only=True)
def rows(name):
    it = wb[name].iter_rows(values_only=True)
    h = [str(x) for x in next(it)]
    return [dict(zip(h, r)) for r in it if any(v is not None for v in r)]
adsets = json.load(open(os.path.join(eng, "adset_meta.json")))
adn = {}
for a in json.load(open(os.path.join(eng, "ads_hist.json"))):
    adn[a["id"]] = [a.get("camp"), a.get("asname"), a.get("name")]
wm = []
for r in rows("_wm"):
    k = str(r["key"]); ent = k.split("|")[0]
    lvl, _, ident = ent.partition(":")
    if lvl == "total": names = ["All app campaigns", "", ""]
    elif lvl == "camp": names = [ident, "", ""]
    elif lvl == "adset": names = (adsets.get(ident) or [None, ident]) + [""]
    else: names = adn.get(ident) or ["", "", ident]
    r = {**r, "level": lvl, "camp": names[0] or "", "adset": names[1] or "", "ad": names[2] or "", "id": ident}
    del r["key"]
    wm.append(r)
meta = {str(r[0]): r[1] for r in wb["_meta"].iter_rows(values_only=True)}
out = {"meta": meta, "dash": rows("_dash"), "dcamp": rows("_dcamp"), "wm": wm}
json.dump(out, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"), default=str)
print("ads_engine:", len(out["dash"]), "dash rows,", len(wm), "weekly/monthly rows, end", meta.get("end_date"))
