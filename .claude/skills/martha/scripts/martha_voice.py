"""Martha - voice notes client. DynamoDB over HTTPS with hand-written AWS Signature Version 4,
standard library only (Python 3.9+).

The household leaves notes through its own Alexa skill ("Alexa, tell Martha Meal we're out of ground
cumin"), which saves each one to a DynamoDB table in the household's AWS account. This is
Martha's side of that table: read the waiting notes, delete the ones Martha has filed, and write the
small context record the skill reads (this week's meal names and the household's first names,
nothing else). Setup: VOICE-SETUP.md.

The computer's AWS key may only Query pk="note", DeleteItem a note and PutItem the context item,
so those are the only calls made here.

Table (shared with the skill's Lambda; keys pk and sk, both strings):
  note     pk="note", sk="<said_at>#<id>"; id, said_at, words, understood (a JSON string), interpreter
  context  pk="context", sk="current"; week_of, meals, people, updated_at

Credentials: voice-credentials.json (fields in VOICE-SETUP.md step 6), found in this order:
  $MARTHA_VOICE_CREDS (a full path), $MARTHA_DIR/voice-credentials.json, the profile folder named in
  ~/.martha/profile-location.txt, anything under /mnt/user-data/uploads/ (a Cowork session),
  ~/.martha/voice-credentials.json
Unlike the Kroger client, nothing is read at import: `setup` has to run before the file exists.

The signing is checked against AWS's published Signature Version 4 example (tests); the calls
themselves have not yet been run against a live table from this file.
"""
import os, re, sys, json, glob, hmac, time, getpass, hashlib, http.client, urllib.request, urllib.error
from datetime import datetime, timezone

_NAME = "voice-credentials.json"
DEFAULT_REGION = "us-east-1"
DEFAULT_TABLE = "martha-voice"
SERVICE = "dynamodb"
TARGET = "DynamoDB_20120810."
COWORK_OUT = "/mnt/user-data/outputs"
UNAVAILABLE = "voice notes unavailable, the run continues without them"
SETUP_AGAIN = "run `python3 martha_voice.py setup` again with the household's PC key (VOICE-SETUP.md step 6)"
REGION_RE = re.compile(r"[a-z]{2}(-[a-z]+)+-\d{1,2}")
TABLE_RE = re.compile(r"[A-Za-z0-9_.-]{3,255}")
KEY_ID_RE = re.compile(r"[A-Z0-9]{16,128}")
CONTEXT_FIELDS = ("week_of", "meals", "people")
# AWS error types (the part after '#' in __type) and what they mean for the household.
_KEY_WRONG = {"UnrecognizedClientException", "InvalidSignatureException", "IncompleteSignatureException",
              "MissingAuthenticationTokenException", "InvalidClientTokenId"}
_BUSY = {"ThrottlingException", "ProvisionedThroughputExceededException", "RequestLimitExceeded",
         "InternalServerError", "ServiceUnavailable", "LimitExceededException"}


def _profile_location():
    """The profile folder named on the first line of ~/.martha/profile-location.txt (PROFILE.md)."""
    try:
        with open(os.path.join(os.path.expanduser("~"), ".martha", "profile-location.txt"), encoding="utf-8-sig") as f:
            return f.readline().strip()
    except OSError:
        return ""


def _resolve():
    """The credentials file, or None: voice notes are optional, so a missing file is not an error yet."""
    home = os.path.expanduser("~")
    candidates = [os.environ.get("MARTHA_VOICE_CREDS", "")]
    if os.environ.get("MARTHA_DIR"):
        candidates.append(os.path.join(os.environ["MARTHA_DIR"], _NAME))
    if _profile_location():
        candidates.append(os.path.join(_profile_location(), _NAME))
    candidates += sorted(glob.glob("/mnt/user-data/uploads/**/" + _NAME, recursive=True))
    candidates.append(os.path.join(home, ".martha", _NAME))
    for c in candidates:
        if c and os.path.exists(c):
            return c
    return None


CREDS_PATH = _resolve()
_C = None  # the loaded credentials, read on first use


def _creds():
    global _C
    if _C is not None:
        return _C
    if not CREDS_PATH:
        raise SystemExit(f"{_NAME} not found, so this computer has no key for voice notes: "
                         "run `python3 martha_voice.py setup` (VOICE-SETUP.md step 6)")
    try:
        # utf-8-sig: a file saved by Windows Notepad or PowerShell can start with a byte-order mark.
        with open(CREDS_PATH, encoding="utf-8-sig") as f:
            c = json.load(f)
    except (OSError, ValueError):
        raise SystemExit(f"{_NAME} can't be read: run `python3 martha_voice.py setup` again "
                         "(VOICE-SETUP.md step 6)") from None
    if not isinstance(c, dict) or not all(isinstance(c.get(k), str) and c[k] for k in ("aws_access_key_id", "aws_secret_access_key")):
        raise SystemExit(f"{_NAME} has no AWS key in it: run `python3 martha_voice.py setup` "
                         "(VOICE-SETUP.md step 6)")
    c = dict(c, region=c.get("region") or DEFAULT_REGION, table=c.get("table") or DEFAULT_TABLE)
    if not REGION_RE.fullmatch(c["region"]):
        raise SystemExit(f"the region in {_NAME} doesn't look like an AWS region (such as us-east-1): "
                         "run `python3 martha_voice.py setup` again (VOICE-SETUP.md step 6)")
    _C = c
    return _C


def _write_json(path, data):
    """Write whole or not at all. The file holds a secret, so only its owner may read it (on macOS
    and Linux)."""
    tmp = path + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.chmod(tmp, 0o600)
        os.replace(tmp, path)
    except OSError:
        try:
            os.remove(tmp)  # never leave a stray copy of the secret behind
        except OSError:
            pass
        raise


def _save(path, data):
    """Save the credentials, Cowork's copy first (that is the one committed back)."""
    targets = []
    if os.path.isdir(COWORK_OUT):
        os.makedirs(COWORK_OUT + "/.secrets-out", exist_ok=True)
        targets.append(COWORK_OUT + "/.secrets-out/" + _NAME)
    targets.append(path)
    for p in targets:
        try:
            _write_json(p, data)
        except OSError as e:
            raise SystemExit(f"could not save {p} ({type(e).__name__}): make sure the folder can be "
                             "written to, then run setup again (VOICE-SETUP.md step 6)") from None


def _new_path():
    """Where setup saves a new file: $MARTHA_VOICE_CREDS, else the profile folder (SKILL.md Step 0)."""
    if os.environ.get("MARTHA_VOICE_CREDS"):
        path = os.environ["MARTHA_VOICE_CREDS"]
        folder = os.path.dirname(os.path.abspath(path))
    else:
        folder = os.environ.get("MARTHA_DIR") or _profile_location()
        if not folder:
            folder = os.path.join(os.path.expanduser("~"), ".martha")
            os.makedirs(folder, exist_ok=True)
        path = os.path.join(folder, _NAME)
    if not os.path.isdir(folder):
        raise SystemExit(f"the profile folder {folder} doesn't exist: check $MARTHA_DIR or "
                         "~/.martha/profile-location.txt (PROFILE.md), then run setup again (VOICE-SETUP.md step 6)")
    return path


# ---- AWS Signature Version 4 -------------------------------------------------------------------

def sha256_hex(data):
    return hashlib.sha256(data if isinstance(data, bytes) else data.encode("utf-8")).hexdigest()


def _hmac(key, msg):
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


def signing_key(secret, date, region, service):
    """The derived key: HMAC-SHA256 chained over the date (YYYYMMDD), region, service, 'aws4_request'."""
    key = _hmac(("AWS4" + secret).encode("utf-8"), date)
    for part in (region, service, "aws4_request"):
        key = _hmac(key, part)
    return key


def canonical_request(method, path, query, headers, payload_hash):
    """Returns (canonical request, signed header names). Every header given is signed."""
    canon = {k.strip().lower(): " ".join(str(v).split()) for k, v in headers.items()}
    names = sorted(canon)
    lines = "".join(f"{n}:{canon[n]}\n" for n in names)
    signed = ";".join(names)
    return "\n".join([method, path, query, lines, signed, payload_hash]), signed


def string_to_sign(amz_date, scope, canonical):
    return "\n".join(["AWS4-HMAC-SHA256", amz_date, scope, sha256_hex(canonical)])


def authorization(key_id, secret, region, service, method, path, query, headers, payload):
    """The Authorization header value for a request whose headers include host and x-amz-date."""
    amz_date = {k.lower(): v for k, v in headers.items()}["x-amz-date"]
    scope = f"{amz_date[:8]}/{region}/{service}/aws4_request"
    canonical, signed = canonical_request(method, path, query, headers, sha256_hex(payload))
    sig = hmac.new(signing_key(secret, amz_date[:8], region, service),
                   string_to_sign(amz_date, scope, canonical).encode("utf-8"), hashlib.sha256).hexdigest()
    return f"AWS4-HMAC-SHA256 Credential={key_id}/{scope}, SignedHeaders={signed}, Signature={sig}"


# ---- DynamoDB ----------------------------------------------------------------------------------

def _to_attr(value):
    """A Python value as a DynamoDB attribute value (only the types Martha's table uses)."""
    if value is None:
        return {"NULL": True}
    if isinstance(value, bool):
        return {"BOOL": value}
    if isinstance(value, str):
        return {"S": value}
    if isinstance(value, (list, tuple)):
        return {"L": [_to_attr(v) for v in value]}
    raise TypeError(f"no DynamoDB type for {type(value).__name__}")


def _from_attr(attr):
    kind, value = next(iter(attr.items()))
    if kind == "S":
        return value
    if kind == "BOOL":
        return bool(value)
    if kind == "NULL":
        return None
    if kind == "L":
        return [_from_attr(v) for v in value]
    if kind == "M":
        return {k: _from_attr(v) for k, v in value.items()}
    if kind == "N":
        return float(value) if any(ch in value for ch in ".eE") else int(value)
    return value  # binary and set types are not used by Martha's table


def _refused(e, c):
    """Plain words for an AWS error. Only the error type is shown: the message can name the account."""
    try:
        info = json.load(e)
    except Exception:
        info = {}
    if not isinstance(info, dict):
        info = {}
    kind = str(info.get("__type") or "").rsplit("#", 1)[-1] or "no error type"
    said = str(info.get("message") or info.get("Message") or "").lower()  # read, never shown
    where = f"HTTP {e.code}, {kind}"
    if e.code >= 500 or kind in _BUSY:
        return f"AWS is busy or failing ({where}): {UNAVAILABLE}"
    if kind == "InvalidSignatureException" and ("expired" in said or "not yet current" in said):
        return (f"AWS says this computer's clock is wrong ({where}): set the clock to the right time, "
                "then run `python3 martha_voice.py check` (VOICE-SETUP.md step 6)")
    if kind in _KEY_WRONG:
        return f"AWS didn't accept this computer's key, so the key id or secret is wrong ({where}): {SETUP_AGAIN}"
    if kind == "AccessDeniedException":
        return f"this computer's key lacks permission for the voice table ({where}): {SETUP_AGAIN}"
    if kind == "ResourceNotFoundException":
        return (f"there is no table {c['table']} in {c['region']} ({where}): check the region and table name "
                "with `python3 martha_voice.py setup` (VOICE-SETUP.md step 6), or make the table (VOICE-SETUP.md step 2)")
    return (f"AWS refused the request ({where}): {UNAVAILABLE}; if it happens again, run "
            "`python3 martha_voice.py check` (VOICE-SETUP.md step 6)")


def _call(op, payload):
    """One signed DynamoDB call (JSON 1.0 protocol). Errors exit with what happened and what to do."""
    c = _creds()
    host = f"dynamodb.{c['region']}.amazonaws.com"
    body = json.dumps(payload).encode("utf-8")
    headers = {"content-type": "application/x-amz-json-1.0", "host": host,
               "x-amz-date": time.strftime("%Y%m%dT%H%M%SZ", time.gmtime()), "x-amz-target": TARGET + op}
    headers["authorization"] = authorization(c["aws_access_key_id"], c["aws_secret_access_key"], c["region"],
                                             SERVICE, "POST", "/", "", headers, body)
    req = urllib.request.Request(f"https://{host}/", data=body, method="POST", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise SystemExit(_refused(e, c)) from None
    except (urllib.error.URLError, OSError, http.client.HTTPException, ValueError) as e:
        reason = getattr(e, "reason", None) or type(e).__name__
        raise SystemExit(f"AWS didn't answer ({reason}): {UNAVAILABLE}") from None


def _note_query():
    c = _creds()
    return {"TableName": c["table"], "KeyConditionExpression": "#pk = :pk",
            "ExpressionAttributeNames": {"#pk": "pk"}, "ExpressionAttributeValues": {":pk": {"S": "note"}},
            "ScanIndexForward": True}


def _raw_notes():
    """Every note item, all pages."""
    items, payload = [], _note_query()
    while True:
        r = _call("Query", payload)
        items += r.get("Items") or []
        if not r.get("LastEvaluatedKey"):
            return items
        payload["ExclusiveStartKey"] = r["LastEvaluatedKey"]


def _understood(value):
    """The skill's reading of a note. One that can't be read is unclear, so Martha asks about it."""
    if isinstance(value, dict):
        return value
    try:
        parsed = json.loads(value)
        if isinstance(parsed, dict):
            return parsed
    except (TypeError, ValueError):
        pass
    return {"kind": "other", "unclear": True}


def _when(said_at):
    """Sort key for said_at: parsed as a UTC time where possible, anything unreadable last."""
    s = str(said_at or "")
    for text in (s, re.sub(r"\.\d+", "", s)):
        try:
            t = datetime.fromisoformat(text.replace("Z", "+00:00"))
            return (0, t if t.tzinfo else t.replace(tzinfo=timezone.utc), "")
        except ValueError:
            continue
    return (1, datetime.min.replace(tzinfo=timezone.utc), s)


def _note_id(item):
    return item.get("id") or str(item.get("sk", "")).rsplit("#", 1)[-1]


def check():
    """Proves the key, the region and the table work: one Query for at most one note."""
    _call("Query", dict(_note_query(), Limit=1))
    return True


def notes():
    """Every waiting note, oldest first: [{id, said_at, words, understood, interpreter}]."""
    out = []
    for raw in _raw_notes():
        n = {k: _from_attr(v) for k, v in raw.items()}
        out.append({"id": _note_id(n), "said_at": n.get("said_at") or str(n.get("sk", "")).split("#", 1)[0],
                    "words": n.get("words") or "", "understood": _understood(n.get("understood")),
                    "interpreter": n.get("interpreter")})
    out.sort(key=lambda n: (_when(n["said_at"]), n["id"]))
    return out


def done(ids):
    """Deletes the notes with these ids (ids from notes()). Each key is taken from the note itself,
    found with one Query, so only a note that exists can be deleted, never the context record.
    Returns (deleted ids, ids not found)."""
    wanted = [i for i in dict.fromkeys(ids) if i]
    keys = {}
    for raw in _raw_notes():
        n = {k: _from_attr(v) for k, v in raw.items() if k in ("id", "sk")}
        if n.get("sk"):
            keys[_note_id(n)] = n["sk"]
    table = _creds()["table"]
    deleted = []
    for i in wanted:
        if i in keys:
            _call("DeleteItem", {"TableName": table, "Key": {"pk": {"S": "note"}, "sk": {"S": keys[i]}}})
            deleted.append(i)
    return deleted, [i for i in wanted if i not in keys]


def _names(value, field):
    if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
        raise SystemExit(f"the context's {field} must be a list of names: rewrite the file and run "
                         "`python3 martha_voice.py context <file.json>` again")
    return list(dict.fromkeys(v.strip() for v in value if v.strip()))


def write_context(week_of, meals, people):
    """Writes the context record the skill reads: the week, its meal names and the household's first
    names. PutItem replaces the whole item, so nothing else is ever in it. Returns what was written."""
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(week_of or "")):
        raise SystemExit("the context's week_of must be a date as YYYY-MM-DD: rewrite the file and run "
                         "`python3 martha_voice.py context <file.json>` again")
    meals = _names(meals, "meals")
    people = list(dict.fromkeys(p.split()[0] for p in _names(people, "people")))  # first names only
    item = {"pk": "context", "sk": "current", "week_of": week_of, "meals": meals, "people": people,
            "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
    _call("PutItem", {"TableName": _creds()["table"], "Item": {k: _to_attr(v) for k, v in item.items()}})
    return item


def _read_context_file(path):
    try:
        with open(path, encoding="utf-8-sig") as f:
            data = json.load(f)
    except (OSError, ValueError) as e:
        raise SystemExit(f"can't read {path} ({type(e).__name__}): write it as JSON with week_of, meals "
                         "and people") from None
    if not isinstance(data, dict):
        raise SystemExit(f"{path} must be a JSON object with week_of, meals and people")
    extra = sorted(set(data) - set(CONTEXT_FIELDS))
    if extra:
        print("Not sent (the context holds only week_of, meals and people): " + ", ".join(extra), file=sys.stderr)
    return {k: data.get(k) for k in CONTEXT_FIELDS}


# ---- First-time setup (VOICE-SETUP.md step 6) ----------------------------------------------------

def setup(from_env=False):
    """Asks for this computer's AWS key (the secret hidden as it is typed), saves voice-credentials.json,
    then checks it. Nothing typed is printed back.

    With from_env (`setup --from-env`, used by alexa/setup/voice-setup.sh), the key comes from
    MARTHA_VOICE_KEY_ID and MARTHA_VOICE_SECRET (region and table from MARTHA_VOICE_REGION and
    MARTHA_VOICE_TABLE, else the defaults), so it goes from AWS into the file without being shown."""
    if from_env:
        key_id = os.environ.get("MARTHA_VOICE_KEY_ID", "").strip()
        secret = os.environ.get("MARTHA_VOICE_SECRET", "").strip()
        region = os.environ.get("MARTHA_VOICE_REGION", "").strip() or DEFAULT_REGION
        table = os.environ.get("MARTHA_VOICE_TABLE", "").strip() or DEFAULT_TABLE
        return _save_key(key_id, secret, region, table)
    print("Voice notes: this computer's AWS key (VOICE-SETUP.md step 6). The secret isn't shown as you type it.")
    key_id = input("AWS access key id: ").strip()
    _check_key_id(key_id)
    secret = getpass.getpass("AWS secret access key (hidden): ").strip()
    region = input(f"Region [{DEFAULT_REGION}]: ").strip() or DEFAULT_REGION
    table = input(f"Table [{DEFAULT_TABLE}]: ").strip() or DEFAULT_TABLE
    _save_key(key_id, secret, region, table)


def _check_key_id(key_id):
    if key_id.startswith("ASIA"):
        raise SystemExit("that is a temporary key, which stops working within hours: use the household's PC key, "
                         "which starts with AKIA (VOICE-SETUP.md step 6)")
    if not KEY_ID_RE.fullmatch(key_id):
        raise SystemExit("that doesn't look like an access key id (capital letters and digits, starting with AKIA): "
                         "copy it again and run setup again (VOICE-SETUP.md step 6)")


def _save_key(key_id, secret, region, table):
    """Validates the four values, saves voice-credentials.json, and checks it with AWS."""
    global CREDS_PATH, _C
    _check_key_id(key_id)
    if not secret or any(ch.isspace() for ch in secret):
        raise SystemExit("no secret access key was entered: run setup again and paste it (VOICE-SETUP.md step 6)")
    if not REGION_RE.fullmatch(region):
        raise SystemExit(f"{region} doesn't look like an AWS region (such as us-east-1): run setup again "
                         "(VOICE-SETUP.md step 6)")
    if not TABLE_RE.fullmatch(table):
        raise SystemExit("a table name is 3 to 255 letters, digits, '_', '-' or '.': run setup again "
                         "(VOICE-SETUP.md step 6)")
    path = CREDS_PATH or _new_path()
    data = {"aws_access_key_id": key_id, "aws_secret_access_key": secret, "region": region, "table": table}
    _save(path, data)
    CREDS_PATH, _C = path, None
    print(f"Saved {_NAME} in {os.path.dirname(os.path.abspath(path))}. Checking it with AWS...")
    check()
    print("Voice notes work: the key, the region and the table answered.")


USAGE = """usage: python3 martha_voice.py <command>
  setup                 save this computer's AWS key, then check it (VOICE-SETUP.md step 6)
  setup --from-env      the same, with the key from MARTHA_VOICE_KEY_ID / MARTHA_VOICE_SECRET
  check                 prove the key, the region and the table work
  notes                 every waiting voice note, oldest first, as JSON
  done <id> [<id> ...]  delete the notes Martha has filed (ids from `notes`)
  context <file.json>   write this week's context for Alexa: week_of, meals, people"""


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    cmd, rest = (argv[0], argv[1:]) if argv else ("", [])
    if cmd == "setup" and not rest:
        setup()
    elif cmd == "setup" and rest == ["--from-env"]:
        setup(from_env=True)
    elif cmd == "check" and not rest:
        check(); print("Voice notes work: the key, the region and the table answered.")
    elif cmd == "notes" and not rest:
        print(json.dumps(notes(), indent=2, ensure_ascii=False))
    elif cmd == "done" and rest:
        deleted, missing = done(rest)
        print(f"Deleted {len(deleted)} note(s).")
        if missing:
            print("Not found, so not deleted (already filed?): " + ", ".join(missing), file=sys.stderr)
    elif cmd == "context" and len(rest) == 1:
        item = write_context(**_read_context_file(rest[0]))
        print(f"Context written for the week of {item['week_of']}: {len(item['meals'])} meal(s), "
              f"{len(item['people'])} first name(s).")
    else:
        print(USAGE, file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    sys.exit(main())
