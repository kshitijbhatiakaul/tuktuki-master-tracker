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
        ("overview", "Overview", [("part", "overview")]),
        ("months", "Month by month", [("part", "monthly")]),
        ("compare", "Compare periods", [("part", "compare")]),
        ("relaunch", "Before vs after relaunch", [("part", "relaunch"), ("sec", "eras")]),
        ("revenue", "Revenue & brand deals", [("part", "revenue")]),
        ("summary", "Observations & suggestions", [("part", "dashobs"), ("sec", "insights"), ("sec", "actions")]),
        ("more", "All key numbers", [("sec", "glance"), ("sec", "more")]),
    ]),
    ("app", "App insights", [
        ("growth", "Installs & uninstalls", [("part", "app_growth"), ("sec", "growth"), ("kids", "admin", 13, 14), ("part", "uninstalls")]),
        ("retention", "Retention", [("part", "app_ret"), ("sec", "retention")]),
        ("comeback", "Reinstalls & reactivations", [("sec", "comeback")]),
        ("viewing", "Viewing & drop points", [("part", "app_view"), ("kids", "admin", 0, 5), ("sec", "depth"), ("sec", "dropoff")]),
        ("sessions", "Session time", [("part", "sessions"), ("sec", "engagement")]),
        ("packages", "Subscriptions & packages", [("part", "app_rev"), ("sec", "purchases"), ("kids", "admin", 8, 10), ("part", "packages")]),
        ("renewals", "Renewals", [("sec", "subs"), ("kids", "admin", 11, 12), ("card", "admin", "Renewal by purchase month")]),
        ("ads", "Rewarded ads & AdMob", [("part", "admob"), ("sec", "ads")]),
        ("obs", "Observations & suggestions", [("part", "appobs"), ("kids", "admin", 15, 15), ("card", "admin", "Your range vs"), ("part", "fixed_ref_open"), ("card", "admin", "Findings"), ("kids", "admin", 18, 19), ("part", "fixed_ref_close"), ("sec", "tracking")]),
    ]),
    ("demo", "Demographics", [
        ("audience", "Audience", [("kids", "ga", 0, 6)]),
        ("agegender", "Age & gender", [("kids", "ga", 7, 9), ("part", "demo_age")]),
        ("geo", "Locations & language", [("kids", "ga", 10, 12), ("kids", "ga", 23, 23), ("part", "demo_city")]),
        ("interests", "Interests & devices", [("kids", "ga", 13, 15), ("kids", "ga", 26, 26)]),
        ("timing", "Timings & behaviour", [("kids", "ga", 19, 22), ("kids", "ga", 24, 25), ("kids", "ga", 27, 27)]),
        ("obs", "Observations & suggestions", [("part", "demoobs"), ("kids", "ga", 16, 18), ("kids", "ga", 28, 29)]),
    ]),
    ("series", "Series", [
        ("overview", "How each series performs", [("part", "series")]),
        ("table", "Viewership by show", [("kids", "admin", 6, 7)]),
        ("movers", "Gainers & losers", [("card", "admin", "Shows gaining")]),
        ("promo", "Promotion & where opens come from", [("part", "series_promo")]),
        ("obs", "Observations & suggestions", [("part", "series_obs")]),
    ]),
    ("social", "Social media", [
        ("ig", "Instagram", [("part", "ig")]),
        ("yt", "YouTube", [("part", "yt")]),
        ("logs", "Post & video logs", [("part", "sheetpick:ig_01,ig_04,ig_02,ig_05,ig_06")]),
        ("sugg", "Observations & suggestions", [("part", "social_sugg")]),
    ]),
    ("pm", "Performance marketing", [
        ("overview", "Overview", [("part", "pm")]),
        ("daily", "Day by day", [("part", "pm_daily")]),
        ("wm", "Week & month · all metrics", [("part", "pm_wm")]),
        ("sheets", "Daily Ads report sheets", [("part", "sheetpick:" + ",".join(f"ads_{i:02d}" for i in range(16)))]),
        ("channels", "Channel quality", [("part", "chq"), ("sec", "channels"), ("part", "demo_quality")]),
        ("obs", "Observations & suggestions", [("part", "pmobs")]),
    ]),
    ("infl", "Influencers", [
        ("overview", "Overview", [("part", "infl_over")]),
        ("casting", "Cast", [("part", "infl_cast")]),
        ("available", "Approved, not cast", [("part", "infl_avail")]),
        ("months", "Month by month", [("part", "infl_months")]),
        ("promo", "Promotions, CPI & barter", [("part", "infl_promo")]),
        ("tracker", "Tracker & targets", [("part", "infl_tracker")]),
        ("obs", "Observations & suggestions", [("part", "inflobs")]),
    ]),
    ("oem", "OEM", [
        ("overview", "Overview", [("part", "oem_over")]),
        ("detail", "By network & campaign", [("part", "oem_detail")]),
        ("other", "Other sources", [("part", "oem_other")]),
        ("obs", "Observations & suggestions", [("part", "oemobs")]),
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
    import subprocess
    subprocess.run([sys.executable, os.path.join(ROOT, "tools", "spend_daily.py")], check=True, stdout=subprocess.DEVNULL)
    daily = json.load(open(os.path.join(DATA, "spend", "daily.json"), encoding="utf-8"))
    oem = {k: read_csv(os.path.join(DATA, "oem", f"oem_{k}.csv")) for k in ("monthly", "daily") if os.path.exists(os.path.join(DATA, "oem", f"oem_{k}.csv"))}
    src_path = os.path.join(DATA, "sources.json")
    sources = json.load(open(src_path)) if os.path.exists(src_path) else {}
    return {"index": index, "sheets": sheets, "engine": eng, "pmHistory": hist, "spendDaily": daily, "oem": oem, "sources": sources}


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
            if name.startswith("sheetpick:"):
                ids = name[10:].split(",")
                opts = "".join(f'<option value="{i}">{html.escape(master_sheets[i]["title"])}</option>' for i in ids if i in master_sheets)
                return [BeautifulSoup(f'<div class="card"><div class="ctl"><b>Sheet</b> <select class="msel" data-sheetpick>{opts}</select><span class="muted" data-sheetnote></span></div><div data-sheethost></div></div>', "html.parser")]
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
        dot = {"dash": "#3b2bd6", "app": "#2f6fd1", "demo": "#d6407f", "series": "#7c4ddb", "social": "#e0a321", "pm": "#f08c2e", "infl": "#12a150", "oem": "#5a6b7d"}.get(pid, "#888")
        nav.append(f'<button class="m-page" data-page="{pid}"><i style="background:{dot}"></i>{html.escape(plabel)}</button>')
        tb, body = [], []
        for t in tabs:
            tid, tlabel, items = t[0], t[1], t[2]
            rng = len(t) > 3
            if tlabel is None:
                sid = items[0][1][6:]
                tlabel = master_sheets[sid]["title"]
            tb.append(f'<button class="m-tab" data-tab="{tid}">{html.escape(tlabel)}</button>')
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
    scripts = "".join(str(s) for s in beh.find_all("script")) + "<script>" + open(os.path.join(ROOT, "source", "app.js"), encoding="utf-8").read().replace("</script", "<\\/script") + "</script>"
    top = mst.find("div", id="m-top")
    body = f'{styles}<div class="tb">{top}<div class="m-sticky"><nav class="m-nav">{"".join(nav)}</nav>{rng}</div>{"".join(str(p) for p in out)}</div>{scripts}'
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
    open(os.path.join(ROOT, "docs", ".nojekyll"), "w").close()
    print(f"built docs/index.html ({len(out)//1024} KB); {note}")


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "build":
        build()
    else:
        sys.exit(__doc__)
