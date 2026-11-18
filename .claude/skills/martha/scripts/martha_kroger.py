"""Martha - Kroger client. Direct REST, standard library only (Python 3.9+).

search / product / add_to_cart are the household-tested functions Martha runs every week.
locations / authorize_url / exchange_code / check_sign_in are for first-time setup (see
KROGER-SETUP.md); they follow Kroger's documented OAuth flow but have not yet been run
against Kroger from this file.

Credentials: kroger-credentials.json (fields in KROGER-SETUP.md), found in this order:
  $KROGER_CREDS (a full path), $MARTHA_DIR/kroger-credentials.json, the profile folder named in
  ~/.martha/profile-location.txt, anything under /mnt/user-data/uploads/ (a Cowork session),
  ~/.martha/kroger-credentials.json
Kroger rotates the refresh token on EVERY use: user_token() writes the new one back at once.
Lose it and the next run needs a fresh sign-in.
"""
import os, json, base64, sys, time, glob, urllib.request, urllib.parse, urllib.error

_NAME = "kroger-credentials.json"
BASE = "https://api.kroger.com/v1"
AUTHORIZE = BASE + "/connect/oauth2/authorize"
TOKEN = BASE + "/connect/oauth2/token"
SCOPES = "cart.basic:write product.compact profile.compact"
COWORK_OUT = "/mnt/user-data/outputs"
SIGN_IN_AGAIN = "sign in again: run `python3 martha_kroger.py auth` (KROGER-SETUP.md step 4)"


def _profile_location():
    """The profile folder named on the first line of ~/.martha/profile-location.txt (PROFILE.md)."""
    try:
        with open(os.path.join(os.path.expanduser("~"), ".martha", "profile-location.txt"), encoding="utf-8-sig") as f:
            return f.readline().strip()
    except OSError:
        return ""


def _resolve():
    home = os.path.expanduser("~")
    candidates = [os.environ.get("KROGER_CREDS", "")]
    if os.environ.get("MARTHA_DIR"):
        candidates.append(os.path.join(os.environ["MARTHA_DIR"], _NAME))
    if _profile_location():
        candidates.append(os.path.join(_profile_location(), _NAME))
    candidates += sorted(glob.glob("/mnt/user-data/uploads/**/" + _NAME, recursive=True))
    candidates.append(os.path.join(home, ".martha", _NAME))
    for c in candidates:
        if c and os.path.exists(c):
            return c
    raise SystemExit("kroger-credentials.json not found: set MARTHA_DIR or see KROGER-SETUP.md")


CREDS_PATH = _resolve()
# utf-8-sig: a file saved by Windows Notepad or PowerShell can start with a byte-order mark.
with open(CREDS_PATH, encoding="utf-8-sig") as _f:
    C = json.load(_f)
LOC = C.get("store_location_id")
_cc_tokens = {}  # scope -> (token, expiry)


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
                print(f"WARNING: could not update {path} ({e}). The new sign-in token is in {path}.new: "
                      f"rename it to {os.path.basename(path)} before the next run.", file=sys.stderr)
            except OSError:
                print(f"WARNING: could not save the new sign-in token anywhere ({e}). "
                      f"After this run, {SIGN_IN_AGAIN}.", file=sys.stderr)


def _basic():
    return "Basic " + base64.b64encode(f"{C['client_id']}:{C['client_secret']}".encode()).decode()


def _post_token(data):
    req = urllib.request.Request(TOKEN, data=urllib.parse.urlencode(data).encode(),
        headers={"Authorization": _basic(), "Content-Type": "application/x-www-form-urlencoded"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        # Only the error code is shown: the response can echo what was sent.
        try:
            code = json.load(e).get("error") or "no error code"
        except Exception:
            code = "no error code"
        if data.get("grant_type") == "client_credentials":
            raise SystemExit(f"Kroger refused the app (HTTP {e.code}, {code}): check client_id and "
                             f"client_secret in kroger-credentials.json (KROGER-SETUP.md step 1-2)") from None
        raise SystemExit(f"Kroger refused the sign-in (HTTP {e.code}, {code}): {SIGN_IN_AGAIN}") from None


def cc_token(scope="product.compact"):
    """App token (no user sign-in needed). A falsy scope asks for none."""
    tok, exp = _cc_tokens.get(scope or "", (None, 0))
    if tok and time.time() < exp - 60:
        return tok
    data = {"grant_type": "client_credentials"}
    if scope:
        data["scope"] = scope
    t = _post_token(data)
    _cc_tokens[scope or ""] = (t["access_token"], time.time() + t.get("expires_in", 1800))
    return t["access_token"]


def user_token():
    """Refresh-token flow for the cart. Writes the rotated refresh token back immediately."""
    if not C.get("refresh_token"):
        raise SystemExit("No Kroger sign-in yet: finish step 4 of KROGER-SETUP.md "
                         "(`python3 martha_kroger.py auth`, then `code`).")
    t = _post_token({"grant_type": "refresh_token", "refresh_token": C["refresh_token"]})
    if t.get("refresh_token") and t["refresh_token"] != C["refresh_token"]:
        C["refresh_token"] = t["refresh_token"]
        C["refresh_token_obtained"] = time.strftime("%Y-%m-%d")
        _save()
    return t["access_token"]


def _get(path, params, token):
    url = BASE + path + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + token, "Accept": "application/json", "User-Agent": "martha/2.0"})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                time.sleep(1.2)  # Kroger's edge answers bursts with 403s: keep a steady pace
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (403, 429) and attempt < 5:
                time.sleep(4 * (attempt + 1)); continue
            raise


def search(term, limit=20, start=0, fulfillment=None):
    """Products at your store: [{upc, desc, brand, size, regular, promo, stock, cats}]."""
    if not LOC:
        raise SystemExit("store_location_id missing: run `python3 martha_kroger.py stores <ZIP>` and add it")
    p = {"filter.term": term, "filter.locationId": LOC, "filter.limit": limit}
    if start: p["filter.start"] = start
    if fulfillment: p["filter.fulfillment"] = fulfillment
    d = _get("/products", p, cc_token()).get("data", [])
    out = []
    for it in d:
        item = (it.get("items") or [{}])[0]
        price = item.get("price") or {}
        inv = (item.get("inventory") or {}).get("stockLevel")
        out.append({
            "upc": it["productId"], "desc": it.get("description"), "brand": it.get("brand"),
            "size": item.get("size"), "regular": price.get("regular"), "promo": price.get("promo"),
            "stock": inv, "cats": it.get("categories"),
        })
    return out


def product(upc):
    return _get(f"/products/{upc}", {"filter.locationId": LOC}, cc_token())


def add_to_cart(items):
    """items: [{'upc':..., 'quantity':..., 'modality':'DELIVERY' or 'PICKUP'}].
    The cart is write-only: nothing can be read back, removed or re-quantified."""
    tok = user_token()
    modality = C.get("modality", "DELIVERY")
    body = json.dumps({"items": [{"upc": i["upc"], "quantity": int(i["quantity"]), "modality": i.get("modality", modality)} for i in items]}).encode()
    req = urllib.request.Request(BASE + "/cart/add", data=body, method="PUT",
        headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status


# ---- First-time setup (KROGER-SETUP.md) ----------------------------------------------------

def locations(zip_code, limit=5):
    """Stores near a ZIP code, to find your store_location_id."""
    d = _get("/locations", {"filter.zipCode.near": zip_code, "filter.limit": limit}, cc_token(scope=None))
    return [{"id": s.get("locationId"), "name": s.get("name"), "address": (s.get("address") or {}).get("addressLine1")}
            for s in d.get("data", [])]


def authorize_url():
    q = {"scope": SCOPES, "response_type": "code", "client_id": C["client_id"], "redirect_uri": C["redirect_uri"]}
    return AUTHORIZE + "?" + urllib.parse.urlencode(q)


def _code_from(value):
    """The one-time code, from the code itself or the whole localhost address it came back on."""
    value = value.strip()
    if "code=" in value:
        return urllib.parse.parse_qs(urllib.parse.urlsplit(value).query or value.split("?", 1)[-1])["code"][0]
    return value


def exchange_code(value):
    t = _post_token({"grant_type": "authorization_code", "code": _code_from(value), "redirect_uri": C["redirect_uri"]})
    C["refresh_token"] = t["refresh_token"]; C["refresh_token_obtained"] = time.strftime("%Y-%m-%d")
    _save()
    return sorted(t.keys())


def check_sign_in():
    """Proves the sign-in works end to end: refreshes the token (saving the rotated one) and
    reads the account's profile id. Returns True; a refused sign-in exits with what to do."""
    _get("/identity/profile", {}, user_token())
    return True


USAGE = """usage: python3 martha_kroger.py <command>
  stores <ZIP>            stores near a ZIP code, to find your store_location_id
  auth                    the sign-in address to open in a browser
  code <code or address>  finish the sign-in with what the browser came back with
  check                   prove the sign-in works (refreshes and saves the token)
  search <words>          products at your store"""

if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    cmd, rest = (sys.argv[1], sys.argv[2:]) if len(sys.argv) > 1 else ("", [])
    if cmd == "stores" and rest:
        for s in locations(rest[0]): print(s["id"], "|", s["name"], "|", s["address"])
    elif cmd == "auth":
        print(authorize_url())
    elif cmd == "code" and rest:
        print("Signed in; saved:", ", ".join(exchange_code(rest[0])))
    elif cmd == "check":
        check_sign_in(); print("Kroger sign-in works; the new token is saved.")
    elif cmd == "search" and rest:
        for r in search(" ".join(rest), limit=15):
            print(f"{r['upc']} | {r['desc']} | {r['size']} | reg {r['regular']} promo {r['promo']} | {r['stock']}")
    else:
        print(USAGE, file=sys.stderr); sys.exit(2)
