"""Refresh the tracker's Adjust data straight from Adjust's Reports Service API (used by the GitHub Action).

  ADJUST_API_TOKEN=... python3 tools/adjust_fetch.py

Each file keeps its own columns: the metric list is read from the file's header, so the output matches what the
tracker already expects. Ranges run from each file's first date to yesterday (IST). A file is only replaced when
Adjust answers with the same columns; otherwise the old file is kept and the problem is printed.
"""
import csv, datetime, io, os, sys, urllib.error, urllib.parse, urllib.request

TOKEN = os.environ["ADJUST_API_TOKEN"]
APP = "92t2wuqhyrcw"  # Tuktuki Android
URL = "https://automate.adjust.com/reports-service/csv_report"
ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
IST = datetime.timezone(datetime.timedelta(hours=5, minutes=30))
TODAY = datetime.datetime.now(IST).date()
YDAY = TODAY - datetime.timedelta(days=1)
OEM = "Oppo Affinity,Xiaomi,Vivo Affinity,Transsion Holdings"

# file, dimension columns (in file order), extra filters
SETS = [
    ("behaviour/daily.csv", ["day"], {}),
    ("behaviour/events.csv", ["day"], {}),
    ("behaviour/cohorts.csv", ["day"], {}),
    ("behaviour/purchases.csv", ["day"], {}),
    ("behaviour/paycohort.csv", ["day"], {}),
    ("behaviour/channels.csv", ["month", "channel"], {}),
    ("behaviour/paychan.csv", ["month", "channel"], {}),
    ("behaviour/backcamp.csv", ["month", "campaign_network", "channel"], {}),
    ("behaviour/mau.csv", ["month"], {}),
    ("oem/oem_monthly.csv", ["network", "month", "campaign_network"], {"network__in": OEM}),
    ("oem/oem_daily.csv", ["day", "network", "campaign_network"], {"network__in": OEM}),
]


def report(dims, metrics, start, end, extra):
    q = {"date_period": f"{start}:{end}", "dimensions": ",".join(dims), "metrics": ",".join(metrics),
         "app_token__in": APP, **extra}
    req = urllib.request.Request(URL + "?" + urllib.parse.urlencode(q), headers={"Authorization": "Bearer " + TOKEN})
    with urllib.request.urlopen(req, timeout=300) as r:
        return r.read().decode("utf-8-sig")


def main():
    bad = 0
    for rel, dims, extra in SETS:
        path = os.path.join(ROOT, rel)
        with open(path, newline="") as f:
            rows = list(csv.reader(f))
        head = rows[0]
        metrics = [c for c in head if c not in dims]
        tcol = "day" if "day" in dims else "month"
        ti = head.index(tcol)
        first = min(r[ti] for r in rows[1:] if r and r[ti])
        if rel == "oem/oem_daily.csv":  # current month only
            start, end = TODAY.replace(day=1) if TODAY.day > 1 else (YDAY.replace(day=1)), YDAY
        elif rel == "oem/oem_monthly.csv":  # full months up to the end of last month
            start, end = datetime.date.fromisoformat(first + "-01"), TODAY.replace(day=1) - datetime.timedelta(days=1)
        else:
            start = datetime.date.fromisoformat(first if tcol == "day" else first + "-01")
            end = YDAY
        try:
            text = report(dims, metrics, start, end, extra)
        except urllib.error.HTTPError as e:
            print(f"!! {rel}: HTTP {e.code} {e.read()[:300]!r} - kept the old file"); bad += 1; continue
        except Exception as e:
            print(f"!! {rel}: {e} - kept the old file"); bad += 1; continue
        got = list(csv.reader(io.StringIO(text)))
        if not got or got[0] != head:
            print(f"!! {rel}: unexpected columns {got[0][:6] if got else None} - kept the old file"); bad += 1; continue
        body = [r for r in got[1:] if r]
        if rel == "behaviour/backcamp.csv":  # keep the campaigns that actually brought users back
            i, j = head.index("reattributions"), head.index("reinstalls")
            body = [r for r in body if float(r[i] or 0) or float(r[j] or 0)]
        body.sort(key=lambda r: [r[head.index(d)] for d in dims])
        with open(path, "w", newline="") as f:
            w = csv.writer(f, lineterminator="\n")
            w.writerow(head); w.writerows(body)
        print(f"{rel}: {len(body)} rows, {start} to {end}")
    sys.exit(1 if bad == len(SETS) else 0)


if __name__ == "__main__":
    main()
