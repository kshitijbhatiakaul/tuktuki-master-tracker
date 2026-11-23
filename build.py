#!/usr/bin/env python3
"""Build the TukTuki Master Tracker (docs/index.html).

  python3 build.py build

Inputs (all in this repo):
  source/behaviour.html  the User Behaviour dashboard page (copied from tuktuki-user-behaviour)
  source/master.html     the master tracker's own pages, styles and scripts
  data/behaviour/        Adjust, admin panel and GA data (copied from tuktuki-user-behaviour)
  data/sheets/*.json     every visible sheet of the Daily Ads, Instagram, Business Performance
                         and Influencer workbooks (tools/export_sheets.py)
  data/ads_engine.json   the Daily Ads report's hidden month/platform/campaign tables (tools/export_engine.py)
  data/spend/pm_history.json  Meta + Google spend before July 2026

The behaviour page's sections are cut out and rearranged into pages and tabs (LAYOUT below);
every chart keeps its original drawing code.
"""
import csv, io, json, os, sys, datetime, html, copy
from bs4 import BeautifulSoup

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data")
BEH = os.path.join(DATA, "behaviour")
ADJUST = ["daily", "events", "cohorts", "channels", "backcamp", "purchases", "paycohort", "paychan", "mau"]
GA = ["ga_breakdowns", "ga_explore", "ga_monthly"]
ADMIN = ["admin_daily", "series_daily", "series_windows"]

exec(open(os.path.join(ROOT, "tools", "_theme_shim.py"), encoding="utf-8").read())  # THEME, SHIM
SHIM = SHIM.replace(
    "loaders[id].fn({ answer: r.text !== undefined ? r.text : r.data })",
    "loaders[id].fn({ answer: r.text !== undefined ? r.text : r.data, read: { bigquery: (a) => (Array.isArray(a) ? a : (a && a.rows) || []) } })",
).replace(
    "refresh() {}, setLink() {}",
    "refresh() {}, setLink() {},\n    redraw(root) { draws.forEach((fn, name) => root.querySelectorAll('[data-draw=\"' + name + '\"]').forEach((el) => { try { fn(el); } catch (e) { console.error(name, e); } })); }",
)

# ---------------------------------------------------------------------------
# Page layout. Items:
#   ("sec", id)                 a whole behaviour section
#   ("kids", id, a, b)          children a..b (inclusive) of a behaviour section
#   ("card", id, heading)       the card in a behaviour section whose h3 starts with heading
#   ("clone", id)               a copy of a behaviour section with ids removed (shown twice)
#   ("part", name)              <template data-part="name"> from source/master.html
# ---------------------------------------------------------------------------
R = "range"  # tabs that follow the date range get a marker
LAYOUT = [
    ("dash", "Dashboard", [
        ("monthly", "Monthly highlights", [("part", "monthly")]),
        ("range", "Key numbers for a date range", [("sec", "glance"), ("sec", "more")], R),
        ("business", "Revenue & business", [("part", "business")]),
        ("summary", "What the data says", [("sec", "insights"), ("sec", "actions")], R),
    ]),
    ("app", "App insights", [
        ("growth", "Installs & uninstalls", [("sec", "growth"), ("kids", "admin", 13, 14), ("part", "uninstalls")], R),
        ("retention", "Retention & comebacks", [("sec", "retention"), ("sec", "comeback")], R),
        ("viewing", "Viewing & drop points", [("kids", "admin", 0, 5), ("sec", "depth"), ("sec", "dropoff")], R),
        ("sessions", "Session time", [("part", "sessions"), ("sec", "engagement")], R),
        ("packages", "Packages & revenue", [("sec", "purchases"), ("kids", "admin", 8, 10), ("part", "packages")], R),
        ("renewals", "Renewals", [("sec", "subs"), ("kids", "admin", 11, 12), ("card", "admin", "Renewal by purchase month")], R),
        ("ads", "Rewarded ads & AdMob", [("sec", "ads"), ("part", "admob")], R),
        ("channels", "Channel quality", [("sec", "channels"), ("sec", "eras")], R),
        ("obs", "Observations & suggestions", [("kids", "admin", 15, 15), ("card", "admin", "Your range vs"), ("card", "admin", "Findings"), ("kids", "admin", 18, 19), ("part", "appobs"), ("sec", "tracking")], R),
    ]),
    ("demo", "Demographics", [
        ("audience", "Audience", [("kids", "ga", 0, 6)], R),
        ("agegender", "Age & gender", [("kids", "ga", 7, 9), ("part", "demo_age")], R),
        ("geo", "Locations & language", [("kids", "ga", 10, 12), ("kids", "ga", 23, 23), ("part", "demo_city")], R),
        ("interests", "Interests & devices", [("kids", "ga", 13, 15), ("kids", "ga", 26, 26)]),
        ("timing", "Timings & behaviour", [("kids", "ga", 19, 22), ("kids", "ga", 24, 25), ("kids", "ga", 27, 27)]),
        ("quality", "Channel quality", [("clone", "channels"), ("part", "demo_quality")], R),
        ("obs", "Observations & suggestions", [("kids", "ga", 16, 18), ("kids", "ga", 28, 29)]),
    ]),
    ("series", "Series", [
        ("overview", "How each series performs", [("part", "series")], R),
        ("table", "Viewership by show", [("kids", "admin", 6, 7)], R),
        ("movers", "Gainers & losers", [("card", "admin", "Shows gaining")], R),
        ("promo", "Promotion & where opens come from", [("part", "series_promo")]),
        ("obs", "Observations & suggestions", [("part", "series_obs")], R),
    ]),
    ("social", "Social media", [
        ("ig", "Instagram overview", [("part", "ig")]),
        ("iglog", "Instagram post log", [("part", "sheet:ig_01")]),
        ("igworks", "What works on Instagram", [("part", "sheet:ig_02")]),
        ("yt", "YouTube overview", [("part", "yt")]),
        ("ytlog", "YouTube video log", [("part", "sheet:ig_04")]),
        ("ytworks", "What works on YouTube", [("part", "sheet:ig_05")]),
        ("sugg", "Suggestions", [("part", "social_sugg"), ("part", "sheet:ig_06")]),
    ]),
    ("pm", "Performance marketing", [
        ("overview", "Overview", [("part", "pm")]),
        ("wm", "Weekly & monthly · all metrics", [("part", "pm_wm")]),
    ] + [(f"s{i:02d}", None, [("part", f"sheet:ads_{i:02d}")]) for i in range(16)] + [
        ("infl", "Influencers & casting", [("part", "infl")]),
    ]),
]


def read_csv(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def load_raw():
    raw = {}
    for name in ADJUST:
        p = os.path.join(BEH, name + ".csv")
        if os.path.exists(p):
            raw[name] = {"text": open(p, encoding="utf-8").read()}
    for name in ADMIN:
        p = os.path.join(BEH, "admin", name + ".csv")
        if os.path.exists(p):
            raw[name] = {"data": read_csv(p)}
    for name in GA:
        p = os.path.join(BEH, "ga", name + ".json")
        if os.path.exists(p):
            raw[name] = {"data": json.load(open(p, encoding="utf-8"))}
    p = os.path.join(BEH, "ga", "ga_daily.csv")
    if os.path.exists(p):
        rows = read_csv(p)
        for r in rows:
            for k, v in r.items():
                if k != "day":
                    try:
                        r[k] = float(v)
                    except ValueError:
                        pass
        raw["ga_daily"] = {"data": rows}
    p = os.path.join(BEH, "ga", "ga_dims.json")
    if os.path.exists(p):
        raw["ga_dims"] = {"data": json.load(open(p, encoding="utf-8"))}
    return raw


def load_master():
    sheets = {}
    sdir = os.path.join(DATA, "sheets")
    index = json.load(open(os.path.join(sdir, "index.json"), encoding="utf-8"))
    for it in index:
        sheets[it["id"]] = json.load(open(os.path.join(sdir, it["id"] + ".json"), encoding="utf-8"))
    eng = json.load(open(os.path.join(DATA, "ads_engine.json"), encoding="utf-8"))
    hist = json.load(open(os.path.join(DATA, "spend", "pm_history.json"), encoding="utf-8"))
    return {"index": index, "sheets": sheets, "engine": eng, "pmHistory": hist}


def assemble(master_sheets):
    beh = BeautifulSoup(open(os.path.join(ROOT, "source", "behaviour.html"), encoding="utf-8").read(), "html.parser")
    mst = BeautifulSoup(open(os.path.join(ROOT, "source", "master.html"), encoding="utf-8").read(), "html.parser")
    kids = lambda n: [c for c in n.children if getattr(c, "name", None)]
    secs = {s["id"]: s for s in beh.find_all("section")}
    snap = {k: kids(v) for k, v in secs.items()}
    clones = {k: copy.copy(v) for k, v in secs.items()}  # child lists before anything is moved
    parts = {t["data-part"]: t for t in mst.find_all("template")}
    used = set()

    def item(it):
        kind = it[0]
        if kind == "sec":
            used.add(it[1]); n = secs[it[1]]
            d = beh.new_tag("div", attrs={"class": "msec", "id": "b-" + it[1]})
            for c in list(n.contents):
                d.append(c)
            return [d]
        if kind == "kids":
            used.add(it[1]); ks = snap[it[1]]
            return ks[it[2]: it[3] + 1]
        if kind == "card":
            used.add(it[1])
            for h in secs[it[1]].find_all("h3"):
                if h.get_text(strip=True).startswith(it[2]):
                    return [h.find_parent("div", class_="card")]
            raise SystemExit(f"card not found: {it}")
        if kind == "clone":
            n = copy.copy(clones[it[1]])
            for el in [n] + n.find_all(attrs={"id": True}):
                del el["id"]
            d = beh.new_tag("div", attrs={"class": "msec"})
            for c in list(n.contents):
                d.append(c)
            return [d]
        if kind == "part":
            name = it[1]
            if name.startswith("sheet:"):
                sid = name[6:]
                t = master_sheets[sid]
                return [BeautifulSoup(f'<div class="card sheetcard"><h3>{html.escape(t["title"])}</h3><p class="note">{html.escape(t["bookLabel"])} · sheet “{html.escape(t["title"])}” — every row and column as the workbook shows it.</p><div data-sheet="{sid}"></div></div>', "html.parser")]
            t = parts[name]
            return list(copy.copy(t).contents)
        raise SystemExit(it)

    out = []
    nav = []
    for pid, plabel, tabs in LAYOUT:
        nav.append(f'<button class="m-page" data-page="{pid}">{html.escape(plabel)}</button>')
        tb, body = [], []
        for t in tabs:
            tid, tlabel, items = t[0], t[1], t[2]
            rng = len(t) > 3
            if tlabel is None:
                sid = items[0][1][6:]
                tlabel = master_sheets[sid]["title"]
            tb.append(f'<button class="m-tab" data-tab="{tid}">{html.escape(tlabel)}{"<span class=rdot title=\"Follows the date range\">•</span>" if rng else ""}</button>')
            holder = BeautifulSoup(f'<section class="m-tabpane" data-tab="{tid}"{" data-range" if rng else ""} hidden></section>', "html.parser").section
            for i in items:
                for node in item(i):
                    holder.append(node.extract() if node.parent is not None and i[0] != "part" else node)
            body.append(holder)
        page = BeautifulSoup(f'<section class="m-page-pane" data-page="{pid}" hidden><div class="m-tabs" role="tablist">{"".join(tb)}</div></section>', "html.parser").section
        for b in body:
            page.append(b)
        out.append(page)

    # Anything in the behaviour page we did not place is reported, so nothing gets lost silently.
    missing = [s for s in secs if s not in used]
    if missing:
        print("WARNING: behaviour sections not placed:", missing)
    head = beh.find("header", id="top")
    rng = beh.find("div", id="range")
    styles = "".join(str(s) for s in beh.find_all("style")) + "".join(str(s) for s in mst.find_all("style"))
    scripts = "".join(str(s) for s in beh.find_all("script")) + "<script>" + open(os.path.join(ROOT, "source", "master.js"), encoding="utf-8").read().replace("</script", "<\\/script") + "</script>"
    top = mst.find("div", id="m-top")
    body = f'{styles}<div class="tb">{top}<nav class="m-nav">{"".join(nav)}</nav>{rng}{"".join(str(p) for p in out)}</div>{scripts}'
    return body


def build():
    raw = load_raw()
    m = load_master()
    page = assemble(m["sheets"])
    stamp = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=5, minutes=30))).strftime("%-d %b %Y, %-I:%M %p IST")
    last = ""
    if "daily" in raw:
        rows = list(csv.reader(io.StringIO(raw["daily"]["text"])))
        last = max((r[0] for r in rows[1:] if r), default="")
    note = f"Snapshot refreshed {stamp}" + (f" · Adjust data up to {last}" if last else "") + f" · Daily Ads report to {m['engine']['meta'].get('end_date', '?')}"
    dj = lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    out = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Tuktuki Master Tracker</title>
<style>{THEME}</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"></script>
<script>window.__DASH_RAW = {dj(raw)};</script>
<script>window.__MASTER = {dj(m)};</script>
<script>{SHIM}</script>
</head>
<body>
<div class="snap">{html.escape(note)}</div>
<div id="dash-root">
{page}
</div>
</body>
</html>
"""
    os.makedirs(os.path.join(ROOT, "docs"), exist_ok=True)
    with open(os.path.join(ROOT, "docs", "index.html"), "w", encoding="utf-8") as f:
        f.write(out)
    print(f"built docs/index.html ({len(out)//1024} KB); {note}")


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "build":
        build()
    else:
        sys.exit(__doc__)
