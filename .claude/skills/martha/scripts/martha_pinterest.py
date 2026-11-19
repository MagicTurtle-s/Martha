"""Martha - Pinterest board reader (optional). Direct REST v5, standard library only (Python 3.9+).
Trial API access is enough to read your own public boards.

Credentials: pinterest-credentials.json (fields in PINTEREST-SETUP.md), found in this order:
  $PINTEREST_CREDS (a full path), $MARTHA_DIR/pinterest-credentials.json, the profile folder named in
  ~/.martha/profile-location.txt, a chat's attached files under /mnt/user-data/uploads/
  (claude.ai or Cowork; a name with a prefix counts),
  ~/.martha/pinterest-credentials.json
Access tokens last about 30 days. Refresh tokens last 60 days and Pinterest sends a new one with
each refresh, which is saved at once; a pause of more than 60 days means signing in again.
"""
import os, json, base64, sys, time, glob, urllib.request, urllib.parse, urllib.error

_NAME = "pinterest-credentials.json"
BASE = "https://api.pinterest.com/v5"
TOKEN = BASE + "/oauth/token"
SCOPES = "boards:read,pins:read"
COWORK_OUT = "/mnt/user-data/outputs"
UPLOADS = "/mnt/user-data/uploads"  # where a chat's attached files appear (claude.ai, Cowork)
SIGN_IN_AGAIN = "sign in again: run `python3 martha_pinterest.py auth` (PINTEREST-SETUP.md step 4)"


def _profile_location():
    """The profile folder named on the first line of ~/.martha/profile-location.txt (PROFILE.md)."""
    try:
        with open(os.path.join(os.path.expanduser("~"), ".martha", "profile-location.txt"), encoding="utf-8-sig") as f:
            return f.readline().strip()
    except OSError:
        return ""


def _uploaded(root):
    """pinterest-credentials.json among a chat's attached files, exact name first. claude.ai can add
    a prefix to an attached file's name (seen with Martha's voice key, 2026-11-19), so a .json whose
    name holds "pinterest-credentials" counts too."""
    stem = os.path.splitext(_NAME)[0]
    exact = sorted(glob.glob(os.path.join(root, "**", _NAME), recursive=True))
    loose = sorted(set(glob.glob(os.path.join(root, "**", "*" + stem + "*.json"), recursive=True)) - set(exact))
    return exact + loose


def _resolve():
    home = os.path.expanduser("~")
    candidates = [os.environ.get("PINTEREST_CREDS", "")]
    if os.environ.get("MARTHA_DIR"):
        candidates.append(os.path.join(os.environ["MARTHA_DIR"], _NAME))
    if _profile_location():
        candidates.append(os.path.join(_profile_location(), _NAME))
    candidates += _uploaded(UPLOADS)
    candidates.append(os.path.join(home, ".martha", _NAME))
    for c in candidates:
        if c and os.path.exists(c):
            return c
    raise SystemExit("pinterest-credentials.json not found: Pinterest is optional, see PINTEREST-SETUP.md")


CREDS_PATH = _resolve()
# utf-8-sig: a file saved by Windows Notepad or PowerShell can start with a byte-order mark.
with open(CREDS_PATH, encoding="utf-8-sig") as _f:
    C = json.load(_f)


def _write_json(path, data):
    """Write whole or not at all: a half-written file would lose the refresh token.
    The file holds secrets, so only its owner may read it (on macOS and Linux)."""
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.chmod(tmp, 0o600)
    os.replace(tmp, path)


def _save():
    """Save the credentials, Cowork's copy first (that is the one committed back). If the file
    can't be replaced (OneDrive or antivirus holding it), keep the new token beside it."""
    targets = []
    if os.path.isdir(COWORK_OUT):
        os.makedirs(COWORK_OUT + "/.secrets-out", exist_ok=True)
        targets.append(COWORK_OUT + "/.secrets-out/" + _NAME)
    targets.append(CREDS_PATH)
    for path in targets:
        try:
            _write_json(path, C)
        except OSError as e:
            try:
                _write_json(path + ".new", C)
                print(f"WARNING: could not update {path} ({e}). The new token is in {path}.new: "
                      f"rename it to {os.path.basename(path)} before the next run.", file=sys.stderr)
            except OSError:
                print(f"WARNING: could not save the new token anywhere ({e}). "
                      f"After this run, {SIGN_IN_AGAIN}.", file=sys.stderr)


def _basic():
    return "Basic " + base64.b64encode(f"{C['app_id']}:{C['app_secret']}".encode()).decode()


def _post_token(data):
    req = urllib.request.Request(TOKEN, data=urllib.parse.urlencode(data).encode(),
        headers={"Authorization": _basic(), "Content-Type": "application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        # Only the status is shown: the response can echo what was sent.
        raise SystemExit(f"Pinterest refused the sign-in (HTTP {e.code}): {SIGN_IN_AGAIN}") from None


def authorize_url():
    q = {"client_id": C["app_id"], "redirect_uri": C["redirect_uri"], "response_type": "code",
         "scope": SCOPES, "state": "martha-pinterest"}
    return "https://www.pinterest.com/oauth/?" + urllib.parse.urlencode(q)


def _code_from(value):
    """The one-time code, from the code itself or the whole localhost address it came back on."""
    value = value.strip()
    if "code=" in value:
        return urllib.parse.parse_qs(urllib.parse.urlsplit(value).query or value.split("?", 1)[-1])["code"][0]
    return value


def exchange_code(value):
    t = _post_token({"grant_type": "authorization_code", "code": _code_from(value), "redirect_uri": C["redirect_uri"]})
    C["access_token"] = t["access_token"]; C["refresh_token"] = t.get("refresh_token", C.get("refresh_token"))
    C["access_expires"] = time.time() + t.get("expires_in", 2592000); C["token_obtained"] = time.strftime("%Y-%m-%d")
    _save()
    return sorted(t.keys())


def access_token():
    if C.get("access_token") and time.time() < C.get("access_expires", 0) - 300:
        return C["access_token"]
    if not C.get("refresh_token"):
        raise SystemExit("No Pinterest sign-in yet: finish step 4 of PINTEREST-SETUP.md "
                         "(`python3 martha_pinterest.py auth`, then `code`).")
    t = _post_token({"grant_type": "refresh_token", "refresh_token": C["refresh_token"], "scope": SCOPES})
    C["access_token"] = t["access_token"]; C["access_expires"] = time.time() + t.get("expires_in", 2592000)
    if t.get("refresh_token"): C["refresh_token"] = t["refresh_token"]
    _save(); return C["access_token"]


def _get(path, params=None):
    url = BASE + path + ("?" + urllib.parse.urlencode(params) if params else "")
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + access_token(), "Accept": "application/json"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=30) as r: return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 3: time.sleep(10 * (attempt + 1)); continue
            raise


def boards():
    out, bm = [], None
    while True:
        d = _get("/boards", {"page_size": 100, **({"bookmark": bm} if bm else {})})
        out += d.get("items", []); bm = d.get("bookmark")
        if not bm: break
    return out


def board_id(name):
    found = boards()
    for b in found:
        if b["name"].strip().lower() == name.strip().lower(): return b["id"]
    raise SystemExit(f"board '{name}' not found (a secret board can't be read; make it public). "
                     f"Boards found: {[b['name'] for b in found]}")


def pins(board=None, since=None):
    """Recipe pins on the board: [{id, created_at, title, link, note}], newest first."""
    bid = board_id(board or C.get("board_name", "Martha"))
    out, bm = [], None
    while True:
        d = _get(f"/boards/{bid}/pins", {"page_size": 100, **({"bookmark": bm} if bm else {})})
        for p in d.get("items", []):
            if since and p.get("created_at", "") < since: continue
            out.append({"id": p["id"], "created_at": p.get("created_at"), "title": p.get("title") or "",
                        "link": p.get("link") or "", "note": p.get("description") or ""})
        bm = d.get("bookmark")
        if not bm: break
    return sorted(out, key=lambda x: x["created_at"] or "", reverse=True)


USAGE = """usage: python3 martha_pinterest.py <command>
  auth                    the sign-in address to open in a browser
  code <code or address>  finish the sign-in with what the browser came back with
  boards                  your boards' names
  pins [since]            pins on the configured board, newest first (since: 2026-01-31T00:00:00)"""

if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    cmd, rest = (sys.argv[1], sys.argv[2:]) if len(sys.argv) > 1 else ("", [])
    if cmd == "auth":
        print(authorize_url())
    elif cmd == "code" and rest:
        print("Signed in; saved:", ", ".join(exchange_code(rest[0])))
    elif cmd == "boards":
        print([b["name"] for b in boards()])
    elif cmd == "pins":
        for p in pins(since=rest[0] if rest else None): print(p["created_at"], "|", p["title"][:50], "|", p["link"])
    else:
        print(USAGE, file=sys.stderr); sys.exit(2)
