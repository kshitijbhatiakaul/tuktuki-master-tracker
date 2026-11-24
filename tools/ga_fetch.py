"""Refresh the tracker's Google Analytics data without Claude (used by the GitHub Action).

  GCP_SA_KEY='<service account JSON>' python3 tools/ga_fetch.py

Read-only. Service account "tracker-read" (project tuktuki-54fa9) needs:
  BigQuery Data Viewer + BigQuery Job User on the project, and Viewer on GA4 property 495378590.
Writes:
  data/behaviour/ga/ga_daily.csv     BigQuery export, daily since 17 Nov 2026 (same SQL as the dashboard)
  data/behaviour/ga/ga_dims.json     BigQuery export, totals by country / state / city / language / version
  data/behaviour/ga/ga_monthly.json  GA Data API, this month and last month replaced
  data/behaviour/ga/ga_breakdowns.json  GA Data API (age, gender, interests, places, versions), this month and last month
ga_explore.json is a fixed one-off copy and is not touched.
A month already in a file is only replaced when the new value is within 25% of the old one for a closed month,
so a unit or definition mismatch can never silently overwrite good history.
"""
import csv, datetime, json, os, sys, urllib.request
from google.oauth2 import service_account
from google.auth.transport.requests import Request

PROJECT, PROPERTY = "tuktuki-54fa9", "495378590"
GA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "behaviour", "ga")
TOOLS = os.path.dirname(os.path.abspath(__file__))
IST = datetime.timezone(datetime.timedelta(hours=5, minutes=30))
TODAY = datetime.datetime.now(IST).date()
YDAY = TODAY - datetime.timedelta(days=1)
THIS_M = YDAY.strftime("%Y-%m")
LAST_M = (YDAY.replace(day=1) - datetime.timedelta(days=1)).strftime("%Y-%m")

creds = service_account.Credentials.from_service_account_info(
    json.loads(os.environ["GCP_SA_KEY"]),
    scopes=["https://www.googleapis.com/auth/bigquery.readonly", "https://www.googleapis.com/auth/analytics.readonly",
            "https://www.googleapis.com/auth/cloud-platform.read-only"])
creds.refresh(Request())


def call(url, body):
    req = urllib.request.Request(url, json.dumps(body).encode(), {"Authorization": "Bearer " + creds.token, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.load(r)


def bq(sql):
    r = call(f"https://bigquery.googleapis.com/bigquery/v2/projects/{PROJECT}/queries",
             {"query": sql, "useLegacySql": False, "timeoutMs": 240000})
    if not r.get("jobComplete"):
        raise RuntimeError("BigQuery job did not finish in time")
    names = [f["name"] for f in r["schema"]["fields"]]
    return [dict(zip(names, [c["v"] for c in row["f"]])) for row in r.get("rows", [])]


def ga(dims, metrics, start, end, limit=10000):
    r = call(f"https://analyticsdata.googleapis.com/v1beta/properties/{PROPERTY}:runReport",
             {"dateRanges": [{"startDate": start, "endDate": end}], "dimensions": [{"name": d} for d in dims],
              "metrics": [{"name": m} for m in metrics], "limit": limit})
    out = []
    for row in r.get("rows", []):
        out.append([d["value"] for d in row["dimensionValues"]] + [float(m["value"]) for m in row["metricValues"]])
    return out


def sql(name, start="2026-11-17", end=""):
    return open(os.path.join(TOOLS, name)).read().replace("{{start}}", start).replace("{{end}}", end)


def num(v):
    try:
        f = float(v)
        return int(f) if f.is_integer() else round(f, 4)
    except (TypeError, ValueError):
        return v


ok = True
# ---- BigQuery: daily + dims
try:
    rows = bq(sql("ga_daily.sql"))
    with open(os.path.join(GA, "ga_daily.csv"), "w", newline="") as f:
        w = csv.writer(f, lineterminator="\n")
        cols = ["day", "active_users", "new_users", "sessions", "engaged_sessions", "engagement_minutes", "purchases", "revenue_usd"]
        w.writerow(cols)
        for r in rows:
            w.writerow([r[c] for c in cols])
    print("ga_daily.csv:", len(rows), "days")
    rows = bq(sql("ga_dims.sql"))
    json.dump([{k: num(v) for k, v in r.items()} for r in rows], open(os.path.join(GA, "ga_dims.json"), "w"), ensure_ascii=False, indent=0)
    print("ga_dims.json:", len(rows), "rows")
except Exception as e:
    print("!! BigQuery:", e); ok = False

# ---- GA Data API: monthly totals and breakdowns for last month + this month
M = ["activeUsers", "newUsers", "engagedSessions", "engagementRate", "userEngagementDuration", "totalRevenue"]
months = {LAST_M: (LAST_M + "-01", (datetime.date.fromisoformat(THIS_M + "-01") - datetime.timedelta(days=1)).isoformat()),
          THIS_M: (THIS_M + "-01", YDAY.isoformat())}


def rec(a, nu, es, er, dur, rev):
    return {"active_users": int(a), "new_users": int(nu), "engaged_sessions": int(es), "engagement_rate": round(er, 4),
            "avg_engagement_sec": round(dur / a) if a else 0, "revenue_usd": round(rev, 2)}


def safe(old, new, closed):
    if not old or not closed:
        return True
    a, b = old.get("active_users") or 0, new.get("active_users") or 0
    return a == 0 or abs(b - a) / a <= 0.25


try:
    path = os.path.join(GA, "ga_monthly.json"); hist = json.load(open(path)); byM = {r["month"]: r for r in hist}
    for m, (s, e) in months.items():
        r = ga([], M, s, e)
        if not r:
            continue
        new = {"month": m, **rec(*r[0])}
        if safe(byM.get(m), new, m != THIS_M):
            byM[m] = new
        else:
            print(f"!! ga_monthly {m}: new numbers differ >25% from the saved ones - kept the saved month"); ok = False
    json.dump([byM[k] for k in sorted(byM)], open(path, "w"), ensure_ascii=False, indent=0)
    print("ga_monthly.json:", len(byM), "months")

    DIMS = [("Country", "country", 15), ("State", "region", 20), ("City", "city", 25), ("Language", "language", 10),
            ("Gender", "userGender", 5), ("Age", "userAgeBracket", 10), ("Interest", "brandingInterest", 20),
            ("App version", "appVersion", 10), ("Android version", "operatingSystemVersion", 10)]
    path = os.path.join(GA, "ga_breakdowns.json"); hist = json.load(open(path))
    keep = [r for r in hist if r["month"] not in months]
    for m, (s, e) in months.items():
        for label, dim, top in DIMS:
            rows = sorted(ga([dim], M, s, e), key=lambda x: -x[1])[:top]
            keep += [{"dimension": label, "name": r[0], "month": m, **rec(*r[1:])} for r in rows if r[0] not in ("(not set)", "")]
    keep.sort(key=lambda r: (r["month"], r["dimension"], -r["active_users"]))
    json.dump(keep, open(path, "w"), ensure_ascii=False, indent=0)
    print("ga_breakdowns.json:", len(keep), "rows")
except Exception as e:
    print("!! GA Data API:", e); ok = False

sys.exit(0 if ok else 1)
