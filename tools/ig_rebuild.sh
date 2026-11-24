#!/usr/bin/env bash
# Rebuild the Instagram + YouTube workbook from the data files the Instagram Report saves to OneDrive every weekday
# (Tuktuki Social Analytics/_pipeline), using its own build_workbook.py. Read-only on OneDrive: nothing is written back.
# Usage: tools/ig_rebuild.sh <staged folder>
set -euo pipefail
S="$1"; P=/tmp/igp; REPO="$(cd "$(dirname "$0")/.." && pwd)"
rm -rf "$P"; mkdir -p "$P"
python3 "$REPO/tools/onedrive.py" folder "Tuktuki Social Analytics/_pipeline" "$P"
python3 -c "import json;d=json.load(open('$P/last_run.json'));print('Instagram data saved on', d.get('date'), '(status', d.get('status'), ')')"
cd "$P"
python3 -I build_workbook.py "$P" "$P/out.xlsx"
test -s "$P/out.xlsx"
cp "$P/out.xlsx" "$S/Updated Tuktuki Instagram Daily Analysis.xlsx"
cp "$P/last_run.json" "$S/ig_last_run.json"
echo "Instagram workbook rebuilt from the pipeline files"
