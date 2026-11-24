"""Write data/sources.json: the latest day of data each source covers (used by the page to flag anything
that is not up to yesterday). Run by the GitHub Action just before the build.

  python3 tools/sources.py [staged folder]
"""
import csv, datetime, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = os.path.join(ROOT, "data")
STAGED = sys.argv[1] if len(sys.argv) > 1 else ""
IST = datetime.timezone(datetime.timedelta(hours=5, minutes=30))
today = datetime.datetime.now(IST).date()


def last_day(path, col="day"):
    try:
        with open(path, newline="") as f:
            v = [r.get(col, "") for r in csv.DictReader(f)]
        return max(x for x in v if x) if v else None
    except (OSError, ValueError):
        return None


out = json.load(open(os.path.join(D, "sources.json"))) if os.path.exists(os.path.join(D, "sources.json")) else {}
out.update({
    "adjust": last_day(os.path.join(D, "behaviour", "daily.csv")),
    "oem": last_day(os.path.join(D, "oem", "oem_daily.csv")),
    "admin": last_day(os.path.join(D, "behaviour", "admin", "admin_daily.csv")),
    "ga": last_day(os.path.join(D, "behaviour", "ga", "ga_daily.csv")),
})
try:
    out["ads"] = json.load(open(os.path.join(D, "ads_engine.json")))["meta"].get("end_date")
except (OSError, KeyError, ValueError):
    pass
# Instagram: the Instagram Report saves the day's numbers each weekday morning -> data through the day before
lr = os.path.join(STAGED, "ig_last_run.json") if STAGED else ""
if lr and os.path.exists(lr):
    d = json.load(open(lr)).get("date")
    if d:
        out["ig"] = (datetime.date.fromisoformat(d) - datetime.timedelta(days=1)).isoformat()
# API refreshes recorded by tools/social_fetch.py
api = os.path.join(D, "_api_dates.json")
if os.path.exists(api):
    for k, v in json.load(open(api)).items():
        if v and (not out.get(k) or v > out[k]):
            out[k] = v
out["built"] = today.isoformat()
json.dump(out, open(os.path.join(D, "sources.json"), "w"), indent=1, sort_keys=True)
print("sources:", out)
