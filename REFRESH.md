# Refresh schedule

Everything except the admin panel is refreshed by the GitHub Action **"Daily workbook refresh"** (`.github/workflows/daily-refresh.yml`) — no Claude, no computer, no credits. It runs every hour from about 07:37 to 23:37 IST (GitHub may start a run late), whenever Claude pushes admin data, and on demand (Actions tab → Run workflow). Every run writes `data/_refresh_status.txt` (step results + last log lines).

| Data | How the Action gets it | Key (repo secret) |
|---|---|---|
| Business tracker, Influencer dashboard, Instagram workbook | OneDrive download (`tools/onedrive.py fetch`), Microsoft app "Tuktuki Tracker Sync", read-only Files.Read | `MS_REFRESH_TOKEN` (kept fresh with `GH_PAT`) |
| Daily Ads report (Meta, Google, ShareChat spend, recs, PM log) | Rebuilt daily from the Daily Ads Update's engine files on OneDrive with its own build.py (`tools/ads_rebuild.sh`); nothing is written back | same |
| Adjust: daily, events, cohorts, purchases, channels, MAU, OEM | Reports Service API (`tools/adjust_fetch.py`) | `ADJUST_API_TOKEN` |
| GA: daily, places/versions (BigQuery), monthly totals and breakdowns incl. age/gender/interests (GA Data API) | `tools/ga_fetch.py`, service account `tracker-read@claude-tuktuki.iam.gserviceaccount.com` | `GCP_SA_KEY` |
| YouTube (views, likes, comments, new videos) | YouTube Data API, channel @tuktuki_in (`tools/social_fetch.py`) | `YT_API_KEY` |
| Instagram (reach, views, interactions, new posts) | Instagram Graph API (`tools/social_fetch.py`) | `META_TOKEN` |
| Admin panel (viewing, subscriptions, series) | **Claude, Mondays** — the behaviour routine pushes `data/behaviour/admin/` (and `source/behaviour.html`); the push starts the Action | — |

- If the OneDrive sign-in expires, run **Connect OneDrive** from the Actions tab. `GH_PAT` expires a year after it was created — make a new one the same way.
- Analysis columns of the Instagram / YouTube logs come from the Monday Instagram workbook; the API only refreshes the numbers and adds new posts.

# Monday (Claude — admin panel only)

The Monday behaviour routine (Mac scheduled task) refreshes the admin-panel data in `tuktuki-user-behaviour`, then here:
1. `cp ../tuktuki-user-behaviour/data/admin/* data/behaviour/admin/ && cp ../tuktuki-user-behaviour/source/dashboard.html source/behaviour.html`
2. Commit only those paths, `git pull --rebase`, push. Never commit `docs/` from Claude — the push starts the GitHub Action, which rebuilds and publishes.
3. Optionally republish the Claude artifact copy from a local `python3 build.py build` (not committed).

Building by hand: `python3 build.py build` (needs `openpyxl`, `beautifulsoup4`) writes `docs/index.html`.
`data/spend/pm_history.json` (Meta + Google spend Oct 2025 – Jun 2026) is fixed history. A new workbook sheet appears in `data/sheets/` automatically;
add it to `LAYOUT` in `build.py` to give it a tab.

## Influencer casting (how the Influencers pages read the sheets)

- The monthly casting sheets (Sep Casting Probables … January 2027) are the source of truth from September 2026.
  Their **Casting Status** column decides the section: "Casted" → **Cast**; "Not casted" / "Not Casted Yet" → **Approved, not cast**.
  A one-cell "Smaller Influencers" row switches the tier from Big Star to Influencer for the rows under it.
- Before September only the Casting sheet exists; its confirmed rows (a date, "Closed", "Shoot Done" or assets acquired) count as Cast.
- The Casting sheet also fills in character, coordinator, tier and trackable downloads for the same person within two months.
- Every count, cost and chart counts Cast people only; approved-not-cast quotes are shown but never added in.
- A new month's sheet needs one line in `ROSTER` in source/app.js (sheet id → month).
