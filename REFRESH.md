# Monday refresh

Runs after the User Behaviour dashboard refresh (repo `tuktuki-user-behaviour`), in the same scheduled task.

1. **Behaviour data** — copy the refreshed behaviour repo in:
   `cp -r ../tuktuki-user-behaviour/data/* data/behaviour/ && cp ../tuktuki-user-behaviour/source/dashboard.html source/behaviour.html`
2a. **OEM data** — with the Adjust connector (`copilot_reporting_tool`) get installs, reinstalls, reattributions, sessions, daus, uninstalls, D1, D7 and time_spent_per_user_d0 by month, network and campaign for the networks Vivo Global, OPPO Global, Xiaomi Global and Transsion Holdings (Oct 2025 to the end of last month) → `data/oem/oem_monthly.csv`, and the same by day for the current month → `data/oem/oem_daily.csv` (same column names).
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
6. **Daily spend** is rebuilt automatically by the build (`tools/spend_daily.py`): Meta exact days from the Day-wise sheet (Sep on) and the Meta API history in `data/spend/meta_account_daily.json` (Oct 2025 – Apr 2026); other months are spread evenly and flagged.
7. **Build**: `python3 build.py build` (needs `beautifulsoup4`) — writes `docs/index.html`.
8. Republish `docs/index.html` to the Master Tracker artifact (same URL), commit and push to main — GitHub Pages (main /docs) updates the public link https://kshitijbhatiakaul.github.io/tuktuki-master-tracker/. Never rewrite history.

`data/spend/pm_history.json` (Meta + Google spend Oct 2025 – Jun 2026) is fixed history and is not refreshed.
If a new sheet is added to a workbook it shows up automatically in `data/sheets/`; add it to `LAYOUT` in `build.py`
to give it a tab (the build prints nothing for unplaced sheets, so check `data/sheets/index.json`).

## Influencer casting (how the Influencers pages read the sheets)

- The monthly casting sheets (Sep Casting Probables … January 2027) are the source of truth from September 2026.
  Their **Casting Status** column decides the section: "Casted" → **Cast**; "Not casted" / "Not Casted Yet" → **Approved, not cast**.
  A one-cell "Smaller Influencers" row switches the tier from Big Star to Influencer for the rows under it.
- Before September only the Casting sheet exists; its confirmed rows (a date, "Closed", "Shoot Done" or assets acquired) count as Cast.
- The Casting sheet also fills in character, coordinator, tier and trackable downloads for the same person within two months.
- Every count, cost and chart counts Cast people only; approved-not-cast quotes are shown but never added in.
- A new month's sheet needs one line in `ROSTER` in source/app.js (sheet id → month).
