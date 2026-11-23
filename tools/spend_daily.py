#!/usr/bin/env python3
"""Daily performance-marketing spend by platform -> data/spend/daily.json.

Exact where a daily source exists, otherwise a month's total spread evenly over its days
(those days carry est=1 so the page can say so):
  Meta     Oct 2025 – Apr 2026: Meta API account-level daily spend (meta_account_daily.json);
           any monthly remainder (spend from the older, now-disabled account) is spread evenly.
           May – Aug 2026: monthly total spread evenly.
           1 Sep 2026 on: Day-wise sheet of the Daily Ads report, campaign rows (exact).
  Google   monthly (pm_history before July, the report's month table after) spread evenly.
  ShareChat monthly spread evenly.
"""
import json, os, datetime, calendar, re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = lambda *p: os.path.join(ROOT, "data", *p)
hist = json.load(open(D("spend", "pm_history.json")))["months"]
acct = json.load(open(D("spend", "meta_account_daily.json")))
eng = json.load(open(D("ads_engine.json")))
MON = {m: i for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}
monthly = {}  # (yyyy-mm, platform) -> spend
for m, v in hist.items():
    monthly[(m, "meta")] = v["meta"]; monthly[(m, "google")] = v["google"]; monthly[(m, "sc")] = v["sharechat"]
for r in eng["dash"]:  # report months replace history (Jul 2026 on)
    a, y = r["Month"].split(); m = f"{y}-{MON[a[:3]]:02d}"
    p = {"Meta": "meta", "Google": "google", "ShareChat": "sc"}.get(r["Platform"])
    if p:
        monthly.setdefault(("_r", m, p), 0)
        monthly[("_r", m, p)] += float(r["spend"] or 0)
for k in [k for k in monthly if k[0] == "_r"]:
    monthly[(k[1], k[2])] = monthly.pop(k)
# Meta exact days from the Day-wise sheet (campaign rows)
dw = json.load(open(D("sheets", "ads_10.json")))["tables"][0]["rows"]
hdr = next(i for i, r in enumerate(dw) if r and r[0] == "Date")
meta_exact = {}
for r in dw[hdr + 1:]:
    if len(r) > 6 and r[1] == "Campaign":
        d = datetime.datetime.strptime(r[0].strip(), "%d %b %Y").strftime("%Y-%m-%d")
        meta_exact[d] = meta_exact.get(d, 0) + float(re.sub(r"[₹,]", "", r[6]) or 0)
end = eng["meta"].get("end_date") or max(meta_exact)
days = {}
d = datetime.date(2025, 10, 1); last = datetime.date.fromisoformat(str(end)[:10])
while d <= last:
    days[d.isoformat()] = {"meta": 0.0, "google": 0.0, "sc": 0.0, "est": 0}; d += datetime.timedelta(days=1)
months = sorted({k[:7] for k in days})
for m in months:
    ds = [k for k in days if k.startswith(m)]
    y, mo = map(int, m.split("-")); full = calendar.monthrange(y, mo)[1]
    for p in ("meta", "google", "sc"):
        tot = monthly.get((m, p), 0) or 0
        if p == "meta" and m >= "2026-09":
            for k in ds:
                days[k]["meta"] = round(meta_exact.get(k, 0), 2)
            continue
        exact = {k: acct[k] for k in ds if k in acct} if p == "meta" else {}
        rem = max(0.0, tot - sum(exact.values()))
        n = len(ds) if m == last.strftime("%Y-%m") else full
        for k in ds:
            v = exact.get(k, 0) + (rem / n if rem > 0.5 else 0)
            days[k][p] = round(v, 2)
            if rem > 0.5 and tot:
                days[k]["est"] = 1
json.dump(days, open(D("spend", "daily.json"), "w"), separators=(",", ":"))
chk = {}
for k, v in days.items():
    chk[k[:7]] = chk.get(k[:7], 0) + v["meta"] + v["google"] + v["sc"]
print({m: round(v) for m, v in chk.items()})
