#!/usr/bin/env bash
# Rebuild the Daily Ads report workbook from the engine files the Daily Ads Update saves to OneDrive every weekday
# (data/, history/, judgement/ ...), using the report's own build.py. Read-only on OneDrive: nothing is written back.
# Usage: tools/ads_rebuild.sh <staged folder>   (the staged folder holds the downloaded top-level workbooks)
set -euo pipefail
S="$1"; E=/tmp/eng; REPO="$(cd "$(dirname "$0")/.." && pwd)"
rm -rf "$E"; mkdir -p "$E"
python3 "$REPO/tools/onedrive.py" engine "$E"
cp "$S/Updated Tuktuki Meta Daily Report.xlsx" "$E/prev.xlsx"
cd "$E"
python3 - <<'PY'
import json
c = json.load(open("config.json")); s = json.load(open("state.json"))
c["output_path"] = "/tmp/eng/out.xlsx"
c["end_date"] = s["last_end_date"]
c.setdefault("latest_days", [s["last_end_date"]])
if c["latest_days"][-1] != s["last_end_date"]:
    c["latest_days"] = [s["last_end_date"]]
json.dump(c, open("config.json", "w"))
print("Daily Ads data up to", s["last_end_date"], "(last run", s.get("last_run_label"), ")")
PY
mkdir -p raw raw_adj raw_adj_all raw_plat
python3 pm.py extract prev.xlsx history/pm_store.json
python3 build.py
test -s out.xlsx
cp out.xlsx "$S/Updated Tuktuki Meta Daily Report.xlsx"
cp data/adset_meta.json data/ads_hist.json "$S/engine/" 2>/dev/null || true
echo "Daily Ads workbook rebuilt from the engine files"
