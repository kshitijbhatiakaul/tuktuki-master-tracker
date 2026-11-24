"""Daily Instagram + YouTube numbers for the tracker, without Claude (used by the GitHub Action).

Runs after tools/export_sheets.py. It updates the exported Instagram workbook sheets in place:
  data/sheets/ig_01.json  Instagram post log   (numbers refreshed for posts of the last 60 days, new posts added)
  data/sheets/ig_04.json  YouTube video log    (views / likes / comments refreshed for every video, new videos added)
The workbook's own analysis columns (show, hook score, observations ...) are kept as they are; new posts get them on
the next Monday rebuild of the Instagram workbook.

Env (each part is skipped when its value is missing):
  META_TOKEN      Meta system-user token with instagram_basic, instagram_manage_insights, pages_show_list,
                  pages_read_engagement (read-only)
  IG_USER_ID      optional; found from the token's pages when empty
  YT_API_KEY      Google API key restricted to the YouTube Data API v3
  YT_CHANNEL_ID   optional; defaults to the TukTuki channel id below
"""
import datetime, json, os, sys, urllib.parse, urllib.request

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "sheets")
IST = datetime.timezone(datetime.timedelta(hours=5, minutes=30))
SINCE = datetime.date(2026, 7, 1)
GRAPH = "https://graph.facebook.com/v21.0/"


def get(url, params):
    with urllib.request.urlopen(url + "?" + urllib.parse.urlencode(params), timeout=120) as r:
        return json.load(r)


def ist(ts):  # ISO from the API -> '22 Nov 2026 22:55' as in the workbook
    d = datetime.datetime.fromisoformat(ts.replace("Z", "+00:00").replace("+0000", "+00:00")).astimezone(IST)
    return d, d.strftime("%-d %b %Y %H:%M")


def fmt_int(v):
    return f"{int(v):,}" if v is not None else ""


def load(sid):
    p = os.path.join(ROOT, sid + ".json")
    d = json.load(open(p))
    t = d["tables"][0]
    h = next(i for i, r in enumerate(t["rows"][:6]) if r and r[0] == "#")
    return p, d, t, h, {c: i for i, c in enumerate(t["rows"][h]) if c}


def save(p, d):
    json.dump(d, open(p, "w"), ensure_ascii=False, indent=1)


def put(row, m, col, val):
    if col in m and val is not None:
        while len(row) <= m[col]:
            row.append("")
        row[m[col]] = val


def instagram():
    tok = os.environ.get("META_TOKEN")
    if not tok:
        print("META_TOKEN not set - Instagram left as in the workbook"); return True
    uid = os.environ.get("IG_USER_ID")
    if not uid:
        pages = get(GRAPH + "me/accounts", {"fields": "instagram_business_account,name", "access_token": tok}).get("data", [])
        uid = next((p["instagram_business_account"]["id"] for p in pages if p.get("instagram_business_account")), None)
        if not uid:
            print("!! Instagram: no Instagram business account reachable with this token"); return False
    media, url, params = [], GRAPH + uid + "/media", {"fields": "id,timestamp,media_type,media_product_type,caption", "limit": 100, "access_token": tok}
    while url:
        r = get(url, params); params = {}
        media += r.get("data", [])
        if media and ist(media[-1]["timestamp"])[0].date() < SINCE:
            break
        url = r.get("paging", {}).get("next", "")
        if url:
            url, q = url.split("?", 1); params = dict(urllib.parse.parse_qsl(q))
    p, d, t, h, m = load("ig_01")
    rows = t["rows"]
    by_time = {r[m["Posted (IST)"]]: r for r in rows[h + 1:] if len(r) > m["Posted (IST)"]}
    cutoff = datetime.datetime.now(IST) - datetime.timedelta(days=60)
    new, upd = [], 0
    for x in media:
        dt, key = ist(x["timestamp"])
        if dt.date() < SINCE:
            continue
        row = by_time.get(key)
        if row is None and dt < cutoff:
            continue
        reel = x.get("media_product_type") == "REELS"
        mets = "reach,views,likes,comments,shares,saved,total_interactions" if reel else "reach,views,likes,comments,shares,saved,total_interactions"
        try:
            ins = {i["name"]: i["values"][0]["value"] for i in get(GRAPH + x["id"] + "/insights", {"metric": mets, "access_token": tok}).get("data", [])}
        except Exception:
            continue
        if row is None:
            row = [""] * len(rows[h]); new.append(row)
            put(row, m, "Posted (IST)", key)
            put(row, m, "Creative type", "Reel" if reel else {"CAROUSEL_ALBUM": "Carousel", "IMAGE": "Static", "VIDEO": "Video"}.get(x.get("media_type"), x.get("media_type", "")))
            put(row, m, "Hook / opening line", (x.get("caption") or "").split("\n")[0][:140])
            put(row, m, "Link", "Open")
        reach = ins.get("reach"); inter = ins.get("total_interactions")
        put(row, m, "Reach", fmt_int(reach)); put(row, m, "Impressions / Views", fmt_int(ins.get("views")))
        put(row, m, "Likes", fmt_int(ins.get("likes"))); put(row, m, "Comments", fmt_int(ins.get("comments")))
        put(row, m, "Shares", fmt_int(ins.get("shares"))); put(row, m, "Saves", fmt_int(ins.get("saved")))
        put(row, m, "Total interactions", fmt_int(inter))
        if reach:
            put(row, m, "Engagement rate", f"{inter / reach:.1%}" if inter is not None else None)
        upd += 1
    new.sort(key=lambda r: datetime.datetime.strptime(r[m["Posted (IST)"]], "%d %b %Y %H:%M"), reverse=True)
    t["rows"] = rows[:h + 1] + new + rows[h + 1:]
    for i, r in enumerate(t["rows"][h + 1:], 1):
        if r and "#" in m:
            r[m["#"]] = str(i)
    save(p, d)
    print(f"Instagram: {upd} posts refreshed, {len(new)} new")
    return True


def youtube():
    key = os.environ.get("YT_API_KEY")
    if not key:
        print("YT_API_KEY not set - YouTube left as in the workbook"); return True
    ch = os.environ.get("YT_CHANNEL_ID", "")
    api = "https://www.googleapis.com/youtube/v3/"
    if not ch:
        print("!! YouTube: YT_CHANNEL_ID not set"); return False
    q = {"forHandle": ch} if ch.startswith("@") else {"id": ch}
    up = get(api + "channels", {"part": "contentDetails", **q, "key": key})["items"][0]["contentDetails"]["relatedPlaylists"]["uploads"]
    ids, tok = [], None
    while True:
        r = get(api + "playlistItems", {"part": "contentDetails", "playlistId": up, "maxResults": 50, "key": key, **({"pageToken": tok} if tok else {})})
        ids += [i["contentDetails"]["videoId"] for i in r["items"] if i["contentDetails"].get("videoPublishedAt", "9") >= SINCE.isoformat()]
        tok = r.get("nextPageToken")
        if not tok or (r["items"] and r["items"][-1]["contentDetails"].get("videoPublishedAt", "9") < SINCE.isoformat()):
            break
    vids = []
    for i in range(0, len(ids), 50):
        vids += get(api + "videos", {"part": "snippet,statistics,contentDetails", "id": ",".join(ids[i:i + 50]), "key": key})["items"]
    p, d, t, h, m = load("ig_04")
    rows = t["rows"]
    by_time = {r[m["Published (IST)"]]: r for r in rows[h + 1:] if len(r) > m["Published (IST)"]}
    new = []
    for v in vids:
        dt, k = ist(v["snippet"]["publishedAt"])
        s = v.get("statistics", {})
        row = by_time.get(k)
        if row is None:
            row = [""] * len(rows[h]); new.append(row)
            put(row, m, "Published (IST)", k)
            put(row, m, "Title / hook", v["snippet"]["title"]); put(row, m, "Link", "Open")
            dur = v["contentDetails"]["duration"]
            secs = sum(int(n) * mult for n, mult in zip(
                [x or 0 for x in __import__("re").match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", dur).groups()], (3600, 60, 1)))
            put(row, m, "Format", "Short" if secs <= 180 else "Video"); put(row, m, "Length (s)", str(secs))
        views, likes, com = int(s.get("viewCount", 0)), int(s.get("likeCount", 0)), int(s.get("commentCount", 0))
        put(row, m, "Views", fmt_int(views)); put(row, m, "Likes", fmt_int(likes)); put(row, m, "Comments", fmt_int(com))
        try:
            sh = int(str(row[m["Shares"]]).replace(",", "") or 0)
        except (ValueError, IndexError, KeyError):
            sh = 0
        put(row, m, "Total interactions", fmt_int(likes + com + sh))
        if views:
            put(row, m, "Engagement rate", f"{(likes + com + sh) / views:.1%}")
    new.sort(key=lambda r: datetime.datetime.strptime(r[m["Published (IST)"]], "%d %b %Y %H:%M"), reverse=True)
    t["rows"] = rows[:h + 1] + new + rows[h + 1:]
    for i, r in enumerate(t["rows"][h + 1:], 1):
        if r and "#" in m:
            r[m["#"]] = str(i)
    save(p, d)
    print(f"YouTube: {len(vids)} videos refreshed, {len(new)} new")
    return True


ok = True
for f in (instagram, youtube):
    try:
        ok = f() and ok
    except Exception as e:
        print(f"!! {f.__name__}: {e}"); ok = False
sys.exit(0 if ok else 1)
