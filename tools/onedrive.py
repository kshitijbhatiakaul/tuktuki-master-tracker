"""OneDrive access for the GitHub Actions refresh (Microsoft Graph, delegated, read-only).

  python3 tools/onedrive.py connect            one-time sign-in (device code); prints the code to enter at
                                               https://microsoft.com/devicelogin and writes the refresh token
                                               to $RT_OUT (never printed)
  python3 tools/onedrive.py fetch <out_dir>    downloads the tracker's source files into <out_dir>, using the
                                               refresh token in $MS_REFRESH_TOKEN; writes the new (rotated)
                                               refresh token to $RT_OUT

Needs env MS_CLIENT_ID and MS_TENANT_ID (the app registration "Tuktuki Tracker Sync").
Scopes: Files.Read offline_access (read-only, the signed-in user's own files).
"""
import json, os, sys, time, urllib.error, urllib.parse, urllib.request

CLIENT = os.environ["MS_CLIENT_ID"]
TENANT = os.environ["MS_TENANT_ID"]
SCOPE = "Files.Read offline_access"
AUTH = f"https://login.microsoftonline.com/{TENANT}/oauth2/v2.0"
FILES = [
    ("Updated Tuktuki Meta Daily Report.xlsx", "Updated Tuktuki Meta Daily Report.xlsx"),
    ("Updated Tuktuki Instagram Daily Analysis.xlsx", "Updated Tuktuki Instagram Daily Analysis.xlsx"),
    ("Tuktuki Business Performance Tracker.xlsx", "Tuktuki Business Performance Tracker.xlsx"),
    ("TukTuki_Influencer_Dashboard.xlsx", "TukTuki_Influencer_Dashboard.xlsx"),
    ("Tuktuki Meta Daily Report/_engine (do not edit)/data/adset_meta.json", "engine/adset_meta.json"),
    ("Tuktuki Meta Daily Report/_engine (do not edit)/data/ads_hist.json", "engine/ads_hist.json"),
]


def post(url, data):
    req = urllib.request.Request(url, urllib.parse.urlencode(data).encode())
    try:
        with urllib.request.urlopen(req) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return json.load(e)


def save_rt(tok):
    out = os.environ.get("RT_OUT")
    if out and tok.get("refresh_token"):
        with open(out, "w") as f:
            f.write(tok["refresh_token"])


def connect():
    d = post(f"{AUTH}/devicecode", {"client_id": CLIENT, "scope": SCOPE})
    if "device_code" not in d:
        sys.exit("device code request failed: " + d.get("error_description", str(d))[:300])
    print("=" * 60 + "\n" + d["message"] + "\n" + "=" * 60, flush=True)
    end = time.time() + d.get("expires_in", 900)
    while time.time() < end:
        time.sleep(d.get("interval", 5))
        t = post(f"{AUTH}/token", {"grant_type": "urn:ietf:params:oauth:grant-type:device_code", "client_id": CLIENT, "device_code": d["device_code"]})
        if "access_token" in t:
            save_rt(t)
            print("Signed in. OneDrive is connected.")
            return
        if t.get("error") not in ("authorization_pending", "slow_down"):
            sys.exit("sign-in failed: " + t.get("error_description", str(t))[:300])
    sys.exit("sign-in timed out")


def fetch(out):
    t = post(f"{AUTH}/token", {"grant_type": "refresh_token", "client_id": CLIENT, "refresh_token": os.environ["MS_REFRESH_TOKEN"], "scope": SCOPE})
    if "access_token" not in t:
        sys.exit("OneDrive sign-in expired or was revoked - run the 'Connect OneDrive' workflow again. " + t.get("error", ""))
    save_rt(t)
    for src, dst in FILES:
        path = os.path.join(out, dst)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        url = "https://graph.microsoft.com/v1.0/me/drive/root:/" + urllib.parse.quote(src) + ":/content"
        req = urllib.request.Request(url, headers={"Authorization": "Bearer " + t["access_token"]})
        with urllib.request.urlopen(req) as r, open(path, "wb") as f:
            f.write(r.read())
        print(f"{dst}: {os.path.getsize(path):,} bytes")


ENGINE = "Tuktuki Meta Daily Report/_engine (do not edit)"


def tree(src, out, token, skip=("raw",)):
    """Download a OneDrive folder recursively (read-only)."""
    n = 0
    url = "https://graph.microsoft.com/v1.0/me/drive/root:/" + urllib.parse.quote(src) + ":/children?$top=999"
    while url:
        req = urllib.request.Request(url, headers={"Authorization": "Bearer " + token})
        with urllib.request.urlopen(req) as r:
            page = json.load(r)
        for it in page.get("value", []):
            path = os.path.join(out, it["name"])
            if "folder" in it:
                if it["name"] not in skip:
                    os.makedirs(path, exist_ok=True)
                    n += tree(src + "/" + it["name"], path, token, ())
            elif "@microsoft.graph.downloadUrl" in it:
                with urllib.request.urlopen(it["@microsoft.graph.downloadUrl"]) as r, open(path, "wb") as f:
                    f.write(r.read())
                n += 1
        url = page.get("@odata.nextLink")
    return n


def engine(out):
    t = post(f"{AUTH}/token", {"grant_type": "refresh_token", "client_id": CLIENT, "refresh_token": os.environ["MS_REFRESH_TOKEN"], "scope": SCOPE})
    if "access_token" not in t:
        sys.exit("OneDrive sign-in expired - run the 'Connect OneDrive' workflow again.")
    save_rt(t)
    os.makedirs(out, exist_ok=True)
    print("engine files:", tree(ENGINE, out, t["access_token"]))


if __name__ == "__main__":
    if sys.argv[1] == "connect":
        connect()
    elif sys.argv[1] == "engine":
        engine(sys.argv[2])
    else:
        fetch(sys.argv[2])
