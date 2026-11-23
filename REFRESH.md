# Monday refresh

Runs after the User Behaviour dashboard refresh (repo `tuktuki-user-behaviour`), in the same scheduled task.

1. **Behaviour data** — copy the refreshed behaviour repo in:
   `cp -r ../tuktuki-user-behaviour/data/* data/behaviour/ && cp ../tuktuki-user-behaviour/source/dashboard.html source/behaviour.html`
2. **GA dimensions snapshot** — run the `ga_dims` SQL (see `tools/ga_dims.sql`) with the Google Cloud BigQuery
   connector (`execute_sql_readonly`, project `tuktuki-54fa9`) and save the rows as `data/behaviour/ga/ga_dims.json`
   (list of `{dim, value, users, new_users, sessions, minutes_per_user}`). Read-only.
3. **Workbooks** — stage from the OneDrive folder on the Mac (read-only):
   `Updated Tuktuki Meta Daily Report.xlsx`, `Updated Tuktuki Instagram Daily Analysis.xlsx`,
   `Tuktuki Business Performance Tracker.xlsx`, `TukTuki_Influencer_Dashboard.xlsx`, and
   `Tuktuki Meta Daily Report/_engine (do not edit)/data/adset_meta.json` + `ads_hist.json`.
4. **Recalculate** (the pipelines save formulas without cached values):
   `soffice --headless --calc --convert-to xlsx:"Calc MS Excel 2007 XML" --outdir <recalc> <staged>/*.xlsx`
5. **Export**:
   `python3 tools/export_sheets.py <recalc> <staged>` and
   `python3 tools/export_engine.py "<recalc>/Updated Tuktuki Meta Daily Report.xlsx" <engine data folder>`
6. **Build**: `python3 build.py build` (needs `beautifulsoup4`) — writes `docs/index.html`.
7. Republish `docs/index.html` to the Master Tracker artifact (same URL), commit and push. Never rewrite history.

`data/spend/pm_history.json` (Meta + Google spend Oct 2025 – Jun 2026) is fixed history and is not refreshed.
If a new sheet is added to a workbook it shows up automatically in `data/sheets/`; add it to `LAYOUT` in `build.py`
to give it a tab (the build prints nothing for unplaced sheets, so check `data/sheets/index.json`).
