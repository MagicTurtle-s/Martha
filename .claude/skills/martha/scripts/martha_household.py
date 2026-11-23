"""Martha - shared household client. One copy of the household's profile (the config, the memory
and the weekly plan files) kept in the household's own DynamoDB table, so two computers and a phone
work from the same preferences and history. Standard library only (Python 3.9+).

It uses the build VOICE-SETUP.md describes, made with the Alexa skill or without it
(voice-setup.sh --sharing-only): the same table voice notes use, the same key file
(voice-credentials.json), and martha_voice.py's request signing. Nothing here deletes anything in
the table, and a sign-in file is never read or sent.

Table items, all under pk="household":
  doc    sk="doc#martha-config.md" or "doc#martha-memory.json"
  plan   sk="plan#<week_of>"        the file outputs/martha-plan-<week_of>.md
         each holds: version (a number that goes up by one per save), body (the file, gzipped),
         sha256, saved_at, saved_by, device
  log    sk="log#<saved_at>#<id>"   who, device, what (one line), docs (the names saved)

A save is refused by AWS unless the shared copy is still the version this computer last saw, so
two people saving in the same minute can't overwrite each other: the second one is told to `pull`
first. What this computer last saw is remembered in the profile folder's .household/ folder
(state.json, and base/ with a copy of each file as of the last sync, which is what lets `pull`
tell your changes from theirs).

Exit codes: 0 done; 1 couldn't run (the message says why); 2 usage; 3 both sides changed something
and a person (or Martha) has to settle it; 4 someone else saved first.

Checked offline against a stand-in table (tests/test_martha_household.py). Run against a live table
on 2026-11-22: check, status, pull, push (a first save and a later one), a refused out-of-date save,
and log. A pull that merges or asks has run offline only.
"""
import os, re, sys, json, gzip, glob, uuid, base64, socket, hashlib, argparse, importlib.util
from datetime import datetime, timezone, timedelta

_HERE = os.path.dirname(os.path.abspath(__file__))


def _load_voice():
    """martha_voice.py from this folder: the key file, the signing and the DynamoDB call."""
    spec = importlib.util.spec_from_file_location("martha_voice", os.path.join(_HERE, "martha_voice.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


V = _load_voice()

PK = "household"
CONFIG = "martha-config.md"
MEMORY = "martha-memory.json"
PLAN_RE = re.compile(r"outputs/martha-plan-(\d{4}-\d{2}-\d{2})\.md")
RECENT_WEEKS = 8
MAX_BODY = 350 * 1024  # DynamoDB refuses an item over 400 KB
STATE_DIR = ".household"
SETTLE, SAVED_FIRST = 3, 4
READ_ONLY = ("this is a read-only key: it reads the shared household but can't save to it, so changes "
             "are saved from a computer that has the household's computer key (VOICE-SETUP.md)")
NO_PERMISSION = ("this key isn't allowed to use the shared household yet: update the build so the keys "
                 "may read and save it (VOICE-SETUP.md, Sharing one profile), then run "
                 "`python3 martha_household.py check`")
_MISSING = object()

# How two edits to the same field are settled without asking anyone.
COUNTERS = {"times_served", "times"}                                   # both counted: add both
LATER = {"last_served", "last_said", "last_updated", "pinterest_last_pull",
         "plan_emailed"}                                               # the later date wins
EARLIER = {"first_seen", "added"}                                      # the earlier date wins
STICKY = {"order_placed", "cart_started", "feedback_collected", "feedback_asked"}  # once true, true
# A time recorded here is never cleared by a merge. A week's plan_emailed is null until that week's
# plan email goes out, then the time it went; Martha never sets it back to null. So a null, or a
# week entry with no such field, beside a time is the older copy, and losing the time could send
# the household the same email twice.
KEPT_TIMES = {"plan_emailed"}
SET_LISTS = {"plants", "key_ingredients", "tags", "substitutions"}     # lists merged entry by entry
TOP_LISTS = ("loved_ingredients", "disliked_ingredients", "pending_items", "alexa_list_seen",
             "adult_snacks_recent", "notes")
KEYED = {"recipe_library": "id", "weeks": "week_of"}


# ---- The profile folder and what this computer last saw ------------------------------------------

def profile_dir():
    """The profile folder, found the way SKILL.md Step 0 says."""
    folder = os.environ.get("MARTHA_DIR") or V._profile_location() or os.path.join(os.path.expanduser("~"), ".martha")
    if not os.path.isdir(folder):
        raise SystemExit(f"the profile folder {folder} doesn't exist: check $MARTHA_DIR or "
                         "~/.martha/profile-location.txt (PROFILE.md)")
    return folder


def allowed(name):
    """Only the config, the memory and a week's plan file are ever read or sent. Never a sign-in file."""
    if "credentials" in name.lower():
        return False
    return name in (CONFIG, MEMORY) or bool(PLAN_RE.fullmatch(name))


def _sk(name):
    m = PLAN_RE.fullmatch(name)
    return "plan#" + m.group(1) if m else "doc#" + name


def _name(sk):
    kind, _, rest = sk.partition("#")
    return f"outputs/martha-plan-{rest}.md" if kind == "plan" else rest


def _theirs(name):
    root, ext = os.path.splitext(name)
    return root + ".theirs" + ext


def _path(folder, name):
    return os.path.join(folder, *name.split("/"))


def _read(path):
    try:
        with open(path, "rb") as f:
            return f.read()
    except OSError:
        return None


def _write(path, data):
    """Whole or not at all."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    try:
        with open(tmp, "wb") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    except OSError as e:
        try:
            os.remove(tmp)
        except OSError:
            pass
        raise SystemExit(f"could not save {path} ({type(e).__name__}): make sure the folder can be "
                         "written to, then run this again") from None


def _sha(data):
    return hashlib.sha256(data).hexdigest()


class State:
    """<profile>/.household/state.json: per file, the shared version this computer last synced with
    and the hash of that content; `pending` while a both-changed file waits to be settled."""

    def __init__(self, folder):
        self.folder = folder
        self.path = os.path.join(folder, STATE_DIR, "state.json")
        raw = _read(self.path)
        try:
            data = json.loads(raw.decode("utf-8")) if raw else {}
        except ValueError:
            raise SystemExit(f"{self.path} can't be read. Rename the {STATE_DIR} folder and run `pull`: "
                             "it compares this computer's files with the shared copy from scratch") from None
        self.docs = data.get("docs") if isinstance(data.get("docs"), dict) else {}

    def get(self, name):
        return self.docs.get(name) or {}

    def base(self, name):
        return _read(os.path.join(self.folder, STATE_DIR, "base", *name.split("/")))

    def synced(self, name, version, data):
        """This computer and the shared copy agreed on `data` at `version`."""
        _write(os.path.join(self.folder, STATE_DIR, "base", *name.split("/")), data)
        self.docs[name] = {"version": version, "sha256": _sha(data)}
        self.save()

    def pending(self, name, version, sha):
        self.docs[name] = dict(self.get(name), pending={"version": version, "sha256": sha})
        self.save()

    def save(self):
        _write(self.path, json.dumps({"docs": self.docs}, indent=2, sort_keys=True).encode("utf-8"))


def local_names(folder):
    """The allow-listed files that exist in the profile folder."""
    names = [n for n in (CONFIG, MEMORY) if os.path.isfile(_path(folder, n))]
    for p in sorted(glob.glob(os.path.join(folder, "outputs", "martha-plan-*.md"))):
        n = "outputs/" + os.path.basename(p)
        if allowed(n):
            names.append(n)
    return names


def unsettled(folder, state):
    return sorted(n for n, d in state.docs.items() if d.get("pending") and os.path.exists(_path(folder, _theirs(n))))


# ---- The table -----------------------------------------------------------------------------------

def _table():
    return V._creds()["table"]


def _call(op, payload, expect=()):
    try:
        return V._call(op, payload, expect=tuple(expect) + ("AccessDeniedException",))
    except V.Refused as e:
        if e.kind == "AccessDeniedException":
            raise SystemExit(NO_PERMISSION) from None
        raise


def _doc(item):
    """A doc or plan item as {name, version, data, saved_at, saved_by, device}."""
    f = {k: next(iter(v.values())) for k, v in item.items()}
    try:
        data = gzip.decompress(base64.b64decode(f["body"]))
    except (KeyError, ValueError, OSError, EOFError):
        raise SystemExit(f"the shared copy of {_name(f.get('sk', '?'))} can't be read (its body is damaged): "
                         "nothing was changed on this computer") from None
    return {"name": _name(f["sk"]), "version": int(f.get("version", 0)), "data": data,
            "saved_at": f.get("saved_at", ""), "saved_by": f.get("saved_by", "someone"), "device": f.get("device", "")}


def remote_doc(name):
    r = _call("GetItem", {"TableName": _table(), "ConsistentRead": True,
                          "Key": {"pk": {"S": PK}, "sk": {"S": _sk(name)}}})
    return _doc(r["Item"]) if r.get("Item") else None


def _query(payload):
    items = []
    while True:
        r = _call("Query", payload)
        items += r.get("Items") or []
        if not r.get("LastEvaluatedKey") or ("Limit" in payload and len(items) >= payload["Limit"]):
            return items
        payload = dict(payload, ExclusiveStartKey=r["LastEvaluatedKey"])


def remote_plans(every=False):
    """The shared plan files: the last eight weeks' unless `every`."""
    q = {"TableName": _table(), "ConsistentRead": True, "ExpressionAttributeNames": {"#pk": "pk", "#sk": "sk"}}
    if every:
        q.update(KeyConditionExpression="#pk = :pk AND begins_with(#sk, :p)",
                 ExpressionAttributeValues={":pk": {"S": PK}, ":p": {"S": "plan#"}})
    else:
        since = (datetime.now(timezone.utc) - timedelta(weeks=RECENT_WEEKS)).strftime("%Y-%m-%d")
        q.update(KeyConditionExpression="#pk = :pk AND #sk BETWEEN :a AND :b",
                 ExpressionAttributeValues={":pk": {"S": PK}, ":a": {"S": "plan#" + since}, ":b": {"S": "plan#~"}})
    return [d for d in map(_doc, _query(q)) if allowed(d["name"])]


def remote_all(every=False):
    docs = [d for d in (remote_doc(CONFIG), remote_doc(MEMORY)) if d]
    return {d["name"]: d for d in docs + remote_plans(every)}


def _put(name, data, version, who, device):
    """Saves `data` as version+1 only if the shared copy is still `version` (None: only if there is
    none yet). Returns the new version, or None when someone else saved first."""
    body = gzip.compress(data, mtime=0)
    if len(body) > MAX_BODY:
        raise SystemExit(f"{name} is too big to share ({len(body) // 1024} KB packed; the table holds up to "
                         f"{MAX_BODY // 1024} KB per file): nothing was saved")
    new = (version or 0) + 1
    item = {"pk": {"S": PK}, "sk": {"S": _sk(name)}, "version": {"N": str(new)},
            "body": {"B": base64.b64encode(body).decode("ascii")}, "sha256": {"S": _sha(data)},
            "saved_at": {"S": _now()}, "saved_by": {"S": who}, "device": {"S": device}}
    req = {"TableName": _table(), "Item": item}
    if version is None:
        req.update(ConditionExpression="attribute_not_exists(#pk)", ExpressionAttributeNames={"#pk": "pk"})
    else:
        req.update(ConditionExpression="#v = :v", ExpressionAttributeNames={"#v": "version"},
                   ExpressionAttributeValues={":v": {"N": str(version)}})
    try:
        _call("PutItem", req, expect=("ConditionalCheckFailedException",))
    except V.Refused:
        return None
    return new


def _now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _identity(args):
    c = V._creds()
    who = (getattr(args, "who", None) or c.get("person") or "someone").strip()
    device = (getattr(args, "device", None) or c.get("device") or socket.gethostname() or "a computer").strip()
    return who[:60], device[:60]


def _day(stamp):
    """'Sat 11/21' in this computer's time zone, or the stamp itself if it can't be read."""
    try:
        d = datetime.fromisoformat(str(stamp).replace("Z", "+00:00")).astimezone()
        return f"{d:%a} {d.month}/{d.day}"
    except ValueError:
        return str(stamp)


def _by(doc):
    where = f" on {doc['device']}" if doc.get("device") else ""
    return f"saved by {doc['saved_by']}{where}, {_day(doc['saved_at'])}"


# ---- Merging the memory file ---------------------------------------------------------------------

def _canon(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False)


def _entry_id(entry):
    """What makes two list entries the same entry: a dict's name or item, else the whole value."""
    if isinstance(entry, dict):
        for k in ("name", "item"):
            if isinstance(entry.get(k), str) and entry[k].strip():
                return k + ":" + entry[k].strip().lower()
    return "=" + _canon(entry)


def _date_pick(mine, theirs, later):
    known = [v for v in (mine, theirs) if isinstance(v, str) and v]
    if not known:
        return mine
    return max(known) if later else min(known)


def _merge_list(base, mine, theirs, label, conflicts):
    """Additions from both sides kept, removals honoured; mine's order, then what theirs added."""
    base_ids = {_entry_id(e): e for e in (base if isinstance(base, list) else [])}
    mine_ids = {_entry_id(e): e for e in mine}
    theirs_ids = {_entry_id(e): e for e in theirs}
    out = []
    for i, e in mine_ids.items():
        if i in theirs_ids:
            t = theirs_ids[i]
            if isinstance(e, dict) and isinstance(t, dict) and e != t:
                t = dict(t, **{k: e[k] for k in ("name", "item") if k in e and k in t})  # same entry: one spelling
                e = _merge_dict(base_ids.get(i) if isinstance(base_ids.get(i), dict) else None, e, t,
                                f"{label}: {e.get('name') or e.get('item')}", conflicts)
            out.append(e)
        elif i in base_ids and e == base_ids[i]:
            continue  # the other side removed it, and it wasn't touched here
        else:
            out.append(e)
    for i, t in theirs_ids.items():
        if i in mine_ids or (i in base_ids and t == base_ids[i]):
            continue  # already in, or removed here and untouched there
        out.append(t)
    return out


def _merge_value(key, base, mine, theirs, label, conflicts):
    """One field changed on both sides. Returns the value to keep."""
    if mine is _MISSING:
        return theirs  # added there, or removed here but changed there: never dropped
    if theirs is _MISSING:
        return mine
    if key in COUNTERS and all(isinstance(v, int) and not isinstance(v, bool) for v in (mine, theirs)):
        b = base if isinstance(base, int) and not isinstance(base, bool) else None
        return max(mine, theirs) if b is None else b + (mine - b) + (theirs - b)
    if key in LATER or key in EARLIER:
        return _date_pick(mine, theirs, later=key in LATER)
    if key in STICKY and isinstance(mine, bool) and isinstance(theirs, bool):
        return mine or theirs
    if key == "version" and all(isinstance(v, int) for v in (mine, theirs)):
        return max(mine, theirs)
    if isinstance(mine, dict) and isinstance(theirs, dict):
        return _merge_dict(base if isinstance(base, dict) else None, mine, theirs, f"{label}, {key}", conflicts)
    if key in SET_LISTS and isinstance(mine, list) and isinstance(theirs, list):
        return _merge_list(base if isinstance(base, list) else None, mine, theirs, f"{label}, {key}", conflicts)
    conflicts.append({"where": label, "field": key, "mine": mine, "theirs": theirs})
    return mine


def _merge_dict(base, mine, theirs, label, conflicts):
    base = base if isinstance(base, dict) else {}
    out = {}
    for k in list(mine) + [k for k in theirs if k not in mine]:
        m, t, b = mine.get(k, _MISSING), theirs.get(k, _MISSING), base.get(k, _MISSING)
        if m is not _MISSING and t is not _MISSING and m == t:
            v = m
        elif k in KEPT_TIMES and any(isinstance(x, str) and x for x in (m, t)):
            v = _date_pick(m, t, later=True)   # a time outlives a null or a missing field; of two, the later
        elif b is not _MISSING and m is not _MISSING and m == b:
            v = t   # only the other side changed it (or removed it)
        elif b is not _MISSING and t is not _MISSING and t == b:
            v = m   # only this side changed it (or removed it)
        else:
            v = _merge_value(k, b, m, t, label, conflicts)
        if v is not _MISSING:
            out[k] = v
    return out


def _entry_label(kind, entry):
    if kind == "weeks":
        return f"the week of {entry.get('week_of')}"
    return str(entry.get("name") or entry.get("id"))


def _merge_keyed(kind, key, base, mine, theirs, conflicts):
    """recipe_library by id, weeks by week_of."""
    def index(entries):
        return {e.get(key): e for e in entries if isinstance(e, dict) and e.get(key)}
    b, m, t = index(base if isinstance(base, list) else []), index(mine), index(theirs)
    out = []
    for k, e in m.items():
        if k in t:
            out.append(e if e == t[k] else _merge_dict(b.get(k), e, t[k], _entry_label(kind, e), conflicts))
        elif k in b and e == b[k]:
            continue  # removed on the other side, untouched here
        else:
            out.append(e)
    for k, e in t.items():
        if k in m or (k in b and e == b[k]):
            continue
        out.append(e)
    if kind == "weeks":
        out.sort(key=lambda e: str(e.get("week_of")))
    # Entries without a usable key can't be matched: keep this computer's, and the other side's new ones.
    loose = [e for e in mine if not (isinstance(e, dict) and e.get(key))]
    loose += [e for e in theirs if not (isinstance(e, dict) and e.get(key)) and e not in loose]
    return out + loose


def merge_memory(base, mine, theirs):
    """Three-way merge of two memory files that both changed since `base` (None on a first join,
    which makes the result the union of both histories). Returns (merged, conflicts): a conflict is
    one field both sides set to different values, where this computer's value is kept."""
    base = base if isinstance(base, dict) else {}
    conflicts, out = [], {}
    for k in list(mine) + [k for k in theirs if k not in mine]:
        m, t, b = mine.get(k, _MISSING), theirs.get(k, _MISSING), base.get(k, _MISSING)
        if k == "_templates":
            v = m if m is not _MISSING else t
        elif k in KEYED and isinstance(m, list) and isinstance(t, list):
            v = _merge_keyed(k, KEYED[k], None if b is _MISSING else b, m, t, conflicts)
        elif k in TOP_LISTS and isinstance(m, list) and isinstance(t, list):
            v = _merge_list(None if b is _MISSING else b, m, t, k.replace("_", " "), conflicts)
        elif m is not _MISSING and t is not _MISSING and m == t:
            v = m
        elif b is not _MISSING and m is not _MISSING and m == b:
            v = t
        elif b is not _MISSING and t is not _MISSING and t == b:
            v = m
        else:
            v = _merge_value(k, b, m, t, "the memory file", conflicts)
        if v is not _MISSING:
            out[k] = v
    return out, conflicts


def _parse(data):
    if data is None:
        return None
    try:
        value = json.loads(data.decode("utf-8-sig"))
    except (ValueError, UnicodeDecodeError):
        return None
    return value if isinstance(value, dict) else None


def _dump(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def _show(value):
    text = _canon(value)
    return text if len(text) <= 120 else text[:117] + "..."


# ---- Commands ------------------------------------------------------------------------------------

def _ask_settle(folder, state, name, remote, why):
    """Both sides changed a file that can't be merged without judgement: keep the other side beside it."""
    _write(_path(folder, _theirs(name)), remote["data"])
    state.pending(name, remote["version"], _sha(remote["data"]))
    print(f"{name}: {why} The other copy ({_by(remote)}) is saved beside it as {_theirs(name)}. "
          f"Fold its changes into {name}, then run `settled {name}`.")


def _keep_before_merge(folder, name, local):
    """A merge replaces this computer's file, so its bytes from before stay here, in
    .household/before-merge/. Never sent anywhere, never deleted by Martha. Returns the copy's
    path relative to the profile folder."""
    root, ext = os.path.splitext(os.path.basename(name))
    stamp = re.sub(r"[^0-9TZ]", "", _now())
    rel, n = f"{STATE_DIR}/before-merge/{root}.{stamp}{ext}", 1
    while os.path.exists(_path(folder, rel)):
        n += 1
        rel = f"{STATE_DIR}/before-merge/{root}.{stamp}-{n}{ext}"
    _write(_path(folder, rel), local)
    return rel


def pull(args):
    folder = profile_dir()
    state = State(folder)
    remote = remote_all(every=args.all)
    if not remote:
        print("Nothing is shared yet. `push` from the computer that holds the household's history starts it.")
        return 0
    code = 0
    for name, r in remote.items():
        path, s = _path(folder, name), state.get(name)
        local = _read(path)
        waiting = s.get("pending") and os.path.exists(_path(folder, _theirs(name)))
        if s.get("version") == r["version"] and not waiting:
            continue  # nothing new on the shared side
        if local is None or _sha(local) == _sha(r["data"]) or (s.get("sha256") == _sha(local) and not waiting):
            if local is None or _sha(local) != _sha(r["data"]):
                _write(path, r["data"])
                print(f"{name}: took the shared copy ({_by(r)}).")
            state.synced(name, r["version"], r["data"])
            continue
        if waiting and s["pending"].get("version") == r["version"]:
            print(f"{name}: still waiting to be settled. Fold {_theirs(name)} into it, then run `settled {name}`.")
            code = SETTLE
            continue
        # Both changed (or this computer has its own file and has never synced it: the first join).
        if name != MEMORY:
            _ask_settle(folder, state, name, r, "this computer's copy and the shared copy both changed.")
            code = SETTLE
            continue
        mine, theirs = _parse(local), _parse(r["data"])
        if mine is None or theirs is None:
            _ask_settle(folder, state, name, r, "both changed, and one of the two can't be read as JSON, "
                        "so nothing was merged.")
            code = SETTLE
            continue
        merged, conflicts = merge_memory(_parse(state.base(name)), mine, theirs)
        kept = _keep_before_merge(folder, name, local)  # before either write below replaces the file
        if not conflicts:
            _write(path, r["data"] if merged == theirs else _dump(merged))
            state.synced(name, r["version"], r["data"])
            print(f"{name}: both changed; merged with nothing lost" +
                  ("." if merged == theirs else ". `push` shares the result.") +
                  f" This computer's file from before the merge is kept as {kept}.")
            continue
        print(f"{name}: this computer's file from before the merge is kept as {kept}.")
        _write(path, _dump(merged))
        _write(_path(folder, _theirs(name)), r["data"])
        state.pending(name, r["version"], _sha(r["data"]))
        print(f"{name}: both changed. Everything else is merged; {len(conflicts)} thing(s) were set differently "
              f"on each side, and this computer's value was kept:")
        for c in conflicts:
            print(f"  - {c['where']}, {c['field']}: this computer says {_show(c['mine'])}; "
                  f"the shared copy ({_by(r)}) says {_show(c['theirs'])}")
        print(f"The other copy is saved as {_theirs(name)}. Set each one right in {name}, then run `settled {name}`.")
        code = SETTLE
    if code == 0:
        print("This computer has everything the shared household has.")
    return code


def settled(args):
    folder = profile_dir()
    state = State(folder)
    name = args.name.replace("\\", "/")
    s = state.get(name)
    theirs = _read(_path(folder, _theirs(name)))
    if not allowed(name) or not s.get("pending") or theirs is None:
        raise SystemExit(f"{name} isn't waiting to be settled (`status` lists what is)")
    if _read(_path(folder, name)) is None:
        raise SystemExit(f"{name} is missing from the profile folder: put it back, then run `settled {name}` again")
    state.synced(name, s["pending"]["version"], theirs)
    os.remove(_path(folder, _theirs(name)))
    print(f"{name}: settled. `push` shares it.")
    return 0


def push(args):
    if V._creds().get("read_only"):
        raise SystemExit(READ_ONLY)
    folder = profile_dir()
    state = State(folder)
    waiting = unsettled(folder, state)
    if waiting:
        print("Not saved: " + ", ".join(waiting) + " still wait(s) to be settled. Fold the .theirs copy into "
              "each, run `settled <name>`, then `push` again.", file=sys.stderr)
        return SETTLE
    who, device = _identity(args)
    sent, refused = [], []
    for name in local_names(folder):
        data, s = _read(_path(folder, name)), state.get(name)
        if data is None or s.get("sha256") == _sha(data):
            continue
        new = _put(name, data, s.get("version"), who, device)
        if new is None:
            refused.append(name)
            continue
        state.synced(name, new, data)
        sent.append(name)
    if sent:
        note = " ".join((args.note or "").split())[:300] or "saved " + ", ".join(sent)
        stamp = _now()
        _call("PutItem", {"TableName": _table(), "Item": {
            "pk": {"S": PK}, "sk": {"S": f"log#{stamp}#{uuid.uuid4().hex[:8]}"}, "saved_at": {"S": stamp},
            "who": {"S": who}, "device": {"S": device}, "what": {"S": note}, "docs": {"L": [{"S": n} for n in sent]}}})
        print("Shared: " + ", ".join(sent) + ".")
    if refused:
        print("Not saved, because someone else saved first: " + ", ".join(refused) + ". Nothing of theirs was "
              "overwritten. Run `pull`, then `push` again.", file=sys.stderr)
        return SAVED_FIRST
    if not sent:
        print("Nothing to share: the shared household already has this computer's changes.")
    return 0


def status(args):
    folder = profile_dir()
    state = State(folder)
    remote = remote_all(every=args.all)
    names = list(dict.fromkeys(local_names(folder) + list(remote)))
    waiting = set(unsettled(folder, state))
    since = (datetime.now(timezone.utc) - timedelta(weeks=RECENT_WEEKS)).strftime("%Y-%m-%d")
    for name in names:
        local, r, s = _read(_path(folder, name)), remote.get(name), state.get(name)
        m = PLAN_RE.fullmatch(name)
        if r is None and m and not args.all and s.get("version") and m.group(1) < since:
            continue  # an older plan that was shared: only `--all` looks that far back
        if name in waiting:
            what = f"both changed: waiting to be settled ({_theirs(name)})"
        elif r is None:
            what = "not shared yet"
        elif local is not None and _sha(local) == _sha(r["data"]):
            what = "in step"
        elif local is None or (s.get("sha256") == _sha(local) and s.get("version") != r["version"]):
            what = f"the shared copy is newer ({_by(r)})"
        elif s.get("version") == r["version"]:
            what = "this computer's is newer"
        else:
            what = f"both changed (the shared copy: {_by(r)})"
        print(f"{name}: {what}")
    if not names:
        print("Nothing here and nothing shared yet.")
    return 0


def log(args):
    items = _query({"TableName": _table(), "KeyConditionExpression": "#pk = :pk AND begins_with(#sk, :p)",
                    "ExpressionAttributeNames": {"#pk": "pk", "#sk": "sk"},
                    "ExpressionAttributeValues": {":pk": {"S": PK}, ":p": {"S": "log#"}},
                    "ScanIndexForward": False, "Limit": max(1, args.n)})
    for item in items[:max(1, args.n)]:
        f = {k: V._from_attr(v) for k, v in item.items()}
        stamp = f.get("saved_at") or (str(f.get("sk", "")).split("#") + [""])[1]
        where = f" ({f['device']})" if f.get("device") else ""
        print(f"{_day(stamp)} {f.get('who') or 'someone'}{where}: {f.get('what') or ''}")
    if not items:
        print("Nothing has been shared yet.")
    return 0


def check(args=None):
    """Proves the key may read the shared household: one GetItem."""
    remote_doc(CONFIG)
    print("The shared household works: the key, the region and the table answered.")
    return 0


def main(argv=None):
    p = argparse.ArgumentParser(prog="martha_household.py", description="Martha's shared household profile.")
    sub = p.add_subparsers(dest="cmd")
    sub.add_parser("check", help="prove this key may read the shared household")
    for name, text in (("status", "which files differ from the shared copy"),
                       ("pull", "bring the other person's changes to this computer")):
        s = sub.add_parser(name, help=text)
        s.add_argument("--all", action="store_true", help="every plan file, not only the last eight weeks'")
    s = sub.add_parser("push", help="save this computer's changes to the shared household")
    s.add_argument("--note", default="", help="one line: what this run did")
    s.add_argument("--who", help="the person's first name (default: the key file's `person`)")
    s.add_argument("--device", help="this device's name (default: the key file's `device`)")
    s = sub.add_parser("settled", help="a both-changed file has been put right")
    s.add_argument("name")
    s = sub.add_parser("log", help="who changed what, newest first")
    s.add_argument("n", nargs="?", type=int, default=10)
    args = p.parse_args(argv)
    commands = {"check": check, "status": status, "pull": pull, "push": push, "settled": settled, "log": log}
    if args.cmd not in commands:
        p.print_usage(sys.stderr)
        return 2
    return commands[args.cmd](args)


if __name__ == "__main__":
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    sys.exit(main())
