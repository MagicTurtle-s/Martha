"""Offline tests for Martha's shared household client: two pretend computers and one stand-in table.
No network: every request the client signs is answered by FakeTable below, which behaves like
DynamoDB for the three calls the client makes (GetItem, PutItem with a condition, Query).
Run from the repo root:  python -m unittest discover -s tests -v
"""
import base64, contextlib, copy, gzip, importlib.util, io, json, os, re, tempfile, unittest, urllib.error
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

SCRIPTS = Path(__file__).resolve().parent.parent / ".claude" / "skills" / "martha" / "scripts"
# AWS's documentation example key pair (not a real key), and a second made-up key id for a phone.
KEY_ID = "AKIAIOSFODNN7EXAMPLE"
PHONE_KEY_ID = "AKIAI44QH8DHBEXAMPLE"
SECRET = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
# A fake home folder for every test, so nothing here can ever find a real ~/.martha.
FAKE_HOME = tempfile.mkdtemp(prefix="martha-test-home-")
ENV = {"MARTHA_VOICE_CREDS": "", "KROGER_CREDS": "", "PINTEREST_CREDS": "", "HOME": FAKE_HOME, "USERPROFILE": FAKE_HOME}
CONFIG, MEMORY = "martha-config.md", "martha-memory.json"
THIS_WEEK = (datetime.now(timezone.utc) - timedelta(days=datetime.now(timezone.utc).weekday())).strftime("%Y-%m-%d")
PLAN = f"outputs/martha-plan-{THIS_WEEK}.md"
CONFIG_TEXT = "# Household\n\n| Member | Restrictions |\n|---|---|\n| Sam | none |\n| Riley | gluten-free |\n"


class FakeTable:
    """One DynamoDB table in memory. Keeps every raw request body it was sent."""

    def __init__(self):
        self.items, self.bodies, self.headers, self.calls, self.denied = {}, [], [], [], {}
        self.seconds = 0

    def clock(self):
        """Every save gets its own second, so the log has a definite order."""
        self.seconds += 1
        return (datetime(2026, 11, 21, 18, 0, 0, tzinfo=timezone.utc) + timedelta(seconds=self.seconds)).strftime("%Y-%m-%dT%H:%M:%SZ")

    def _error(self, kind, message):
        body = json.dumps({"__type": "com.amazonaws.dynamodb.v20120810#" + kind, "message": message}).encode()
        return urllib.error.HTTPError("https://dynamodb.us-east-2.amazonaws.com/", 400, "Bad Request", {}, io.BytesIO(body))

    def urlopen(self, req, timeout=None):
        op = req.get_header("X-amz-target").split(".")[-1]
        auth = req.get_header("Authorization")
        assert auth and "Signature=" in auth, "every request must be signed"
        p = json.loads(req.data)
        self.bodies.append(req.data.decode("utf-8"))
        self.headers.append(json.dumps(dict(req.header_items())))
        self.calls.append(op)
        key_id = re.search(r"Credential=(\w+)/", auth).group(1)
        pk = (p.get("Key") or p.get("Item") or {}).get("pk", {}).get("S") or \
            (p.get("ExpressionAttributeValues") or {}).get(":pk", {}).get("S")
        if (op, pk) in self.denied.get(key_id, ()):
            raise self._error("AccessDeniedException", "User is not authorized to perform: dynamodb:" + op)
        return _Reply(getattr(self, "_" + op)(p))

    def _GetItem(self, p):
        item = self.items.get((p["Key"]["pk"]["S"], p["Key"]["sk"]["S"]))
        return {"Item": copy.deepcopy(item)} if item else {}

    def _PutItem(self, p):
        key = (p["Item"]["pk"]["S"], p["Item"]["sk"]["S"])
        cond = p.get("ConditionExpression")
        if cond:
            for name, real in (p.get("ExpressionAttributeNames") or {}).items():
                cond = cond.replace(name, real)
            now = self.items.get(key)
            if cond == "attribute_not_exists(pk)":
                ok = now is None
            else:
                m = re.fullmatch(r"version = (:\w+)", cond)
                assert m, f"a condition the stand-in table doesn't know: {cond}"
                ok = now is not None and now.get("version") == p["ExpressionAttributeValues"][m.group(1)]
            if not ok:
                raise self._error("ConditionalCheckFailedException", "The conditional request failed")
        self.items[key] = copy.deepcopy(p["Item"])
        return {}

    def _Query(self, p):
        expr, vals = p["KeyConditionExpression"], p.get("ExpressionAttributeValues") or {}
        for name, real in (p.get("ExpressionAttributeNames") or {}).items():
            expr = expr.replace(name, real)
        m = re.fullmatch(r"pk = (:\w+)(?: AND (?:begins_with\(sk, (:\w+)\)|sk BETWEEN (:\w+) AND (:\w+)))?", expr)
        assert m, f"a key condition the stand-in table doesn't know: {expr}"
        rows = sorted((sk, item) for (pk, sk), item in self.items.items() if pk == vals[m.group(1)]["S"])
        if m.group(2):
            rows = [r for r in rows if r[0].startswith(vals[m.group(2)]["S"])]
        if m.group(3):
            rows = [r for r in rows if vals[m.group(3)]["S"] <= r[0] <= vals[m.group(4)]["S"]]
        if p.get("ScanIndexForward") is False:
            rows.reverse()
        if "Limit" in p:
            rows = rows[:p["Limit"]]
        return {"Items": [copy.deepcopy(item) for _, item in rows]}

    def doc(self, sk):
        """(version, the file's bytes) of a shared doc, or None."""
        item = self.items.get(("household", sk))
        return (int(item["version"]["N"]), gzip.decompress(base64.b64decode(item["body"]["B"]))) if item else None

    def everything_sent(self):
        """Every request body and header as text, with each shared file's packed body unpacked too."""
        text = "\n".join(self.bodies + self.headers)
        for body in self.bodies:
            packed = (json.loads(body).get("Item") or {}).get("body", {}).get("B")
            if packed:
                text += "\n" + gzip.decompress(base64.b64decode(packed)).decode("utf-8", "replace")
        return text


class _Reply(io.BytesIO):
    def __init__(self, payload):
        super().__init__(json.dumps(payload).encode()); self.status = 200
    def __enter__(self): return self
    def __exit__(self, *a): return False


class Computer:
    """One computer: its own profile folder, its own key file, its own freshly imported client."""
    count = 0

    def __init__(self, root, table, folder, person, device, key_id=KEY_ID, read_only=False):
        self.dir = Path(root) / folder
        (self.dir / "outputs").mkdir(parents=True)
        creds = {"aws_access_key_id": key_id, "aws_secret_access_key": SECRET, "region": "us-east-2",
                 "table": "martha-voice", "person": person, "device": device}
        if read_only:
            creds["read_only"] = True
        (self.dir / "voice-credentials.json").write_text(json.dumps(creds), encoding="utf-8")
        self.env = dict(ENV, MARTHA_DIR=str(self.dir))
        Computer.count += 1
        with mock.patch.dict(os.environ, self.env):
            spec = importlib.util.spec_from_file_location(f"martha_household_under_test_{Computer.count}",
                                                          SCRIPTS / "martha_household.py")
            self.mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(self.mod)
        self.mod._now = table.clock

    def run(self, *argv):
        """Runs a command as the command line would. Returns (exit code, everything printed)."""
        out = io.StringIO()
        with mock.patch.dict(os.environ, self.env), contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
            try:
                code = self.mod.main(list(argv))
            except SystemExit as e:
                code = e.code if isinstance(e.code, int) else 1
                if not isinstance(e.code, int) and e.code:
                    out.write(str(e.code))
        return code, out.getvalue()

    def path(self, name):
        return self.dir.joinpath(*name.split("/"))

    def read(self, name):
        return self.path(name).read_bytes()

    def write(self, name, text):
        self.path(name).write_bytes(text.encode("utf-8"))

    def memory(self):
        return json.loads(self.read(MEMORY).decode("utf-8"))

    def set_memory(self, data):
        self.write(MEMORY, json.dumps(data, indent=2) + "\n")

    def edit(self, change):
        data = self.memory()
        change(data)
        self.set_memory(data)

    def recipe(self, rid):
        return next(r for r in self.memory()["recipe_library"] if r["id"] == rid)


def recipe(rid, name, **more):
    r = {"id": rid, "name": name, "slot": "dinner", "source_url": "", "rating": "unrated", "notes": "",
         "times_served": 0, "last_served": None, "base_servings": 4, "active_minutes": 25, "plants": [],
         "key_ingredients": [], "reheats_well": True, "tags": []}
    r.update(more)
    return r


def week(week_of, *dinners, **more):
    w = {"week_of": week_of, "breakfast_id": "", "salad_id": "", "dinner_ids": list(dinners), "carried_over": [],
         "plant_count": 0, "order_subtotal": 0, "order_all_in": 0, "order_placed": False, "plan_only": False,
         "cart_started": False, "substitutions": [], "feedback_collected": False, "feedback_asked": False}
    w.update(more)
    return w


def memory(recipes, weeks, **more):
    m = {"version": 3, "last_updated": "2026-11-15", "pinterest_last_pull": None, "recipe_library": recipes,
         "weeks": weeks, "loved_ingredients": [], "disliked_ingredients": [], "pending_items": [],
         "alexa_list_seen": [], "adult_snacks_recent": [], "notes": [], "_templates": {"recipe": {"id": ""}}}
    m.update(more)
    return m


def set_rating(rid, rating, notes=None):
    def change(data):
        for r in data["recipe_library"]:
            if r["id"] == rid:
                r["rating"] = rating
                if notes is not None:
                    r["notes"] = notes
    return change


class TwoComputers(unittest.TestCase):
    def setUp(self):
        self.table = FakeTable()
        patcher = mock.patch("urllib.request.urlopen", self.table.urlopen)
        patcher.start()
        self.addCleanup(patcher.stop)
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = tmp.name
        self.pc = Computer(self.root, self.table, "pc", "Sam", "the kitchen PC")
        self.laptop = Computer(self.root, self.table, "laptop", "Riley", "Riley's laptop")

    def seed(self, comp=None):
        """The PC holds a config, a memory with two recipes and this week's plan."""
        comp = comp or self.pc
        comp.write(CONFIG, CONFIG_TEXT)
        comp.set_memory(memory([recipe("turkey-chili", "Turkey Chili"), recipe("fish-tacos", "Fish Tacos")],
                               [week(THIS_WEEK, "turkey-chili", "fish-tacos")]))
        comp.write(PLAN, "# This week\n\n- Turkey Chili\n- Fish Tacos\n")

    def in_step(self):
        """Both computers hold the same shared profile."""
        self.seed()
        self.assertEqual(self.pc.run("push", "--note", "planned the week")[0], 0)
        self.assertEqual(self.laptop.run("pull")[0], 0)

    # a
    def test_one_pushes_and_an_empty_computer_pulls_the_same_files(self):
        self.seed()
        code, out = self.pc.run("push", "--note", "planned the week")
        self.assertEqual(code, 0, out)
        code, out = self.laptop.run("pull")
        self.assertEqual(code, 0, out)
        for name in (CONFIG, MEMORY, PLAN):
            self.assertEqual(self.laptop.read(name), self.pc.read(name), name)
        self.assertIn("in step", self.laptop.run("status")[1])
        self.assertNotIn("newer", self.laptop.run("status")[1])
        # A second pull and a second push have nothing to do and save nothing.
        puts = self.table.calls.count("PutItem")
        self.assertEqual(self.laptop.run("pull")[0], 0)
        self.assertEqual(self.laptop.run("push")[0], 0)
        self.assertEqual(self.pc.run("push")[0], 0)
        self.assertEqual(self.table.calls.count("PutItem"), puts)

    # b
    def test_a_rating_made_on_one_computer_shows_up_on_the_other_and_the_log_says_who(self):
        self.in_step()
        self.laptop.edit(set_rating("turkey-chili", "loved", "best one yet"))
        self.assertIn("this computer's is newer", self.laptop.run("status")[1])
        code, out = self.laptop.run("push", "--note", "rated the chili loved")
        self.assertEqual(code, 0, out)
        self.assertIn("the shared copy is newer (saved by Riley on Riley's laptop", self.pc.run("status")[1])
        code, out = self.pc.run("pull")
        self.assertEqual(code, 0, out)
        self.assertIn("saved by Riley on Riley's laptop", out)
        self.assertEqual(self.pc.recipe("turkey-chili")["rating"], "loved")
        self.assertEqual(self.pc.recipe("turkey-chili")["notes"], "best one yet")
        code, out = self.pc.run("log")
        lines = out.strip().splitlines()
        self.assertEqual(len(lines), 2, out)
        self.assertIn("Riley (Riley's laptop): rated the chili loved", lines[0])  # newest first
        self.assertIn("Sam (the kitchen PC): planned the week", lines[1])
        self.assertEqual(len(self.pc.run("log", "1")[1].strip().splitlines()), 1)

    # c
    def test_both_change_different_recipes_and_neither_change_is_lost(self):
        self.in_step()
        self.pc.edit(set_rating("turkey-chili", "loved"))
        self.laptop.edit(set_rating("fish-tacos", "disliked", "too much cumin"))
        self.assertEqual(self.pc.run("push", "--note", "rated the chili")[0], 0)
        before = copy.deepcopy(self.table.items)
        code, out = self.laptop.run("push", "--note", "rated the tacos")
        self.assertEqual(code, 4, out)
        self.assertIn("someone else saved first", out)
        self.assertEqual(self.table.items, before)  # nothing overwritten, nothing logged
        code, out = self.laptop.run("pull")
        self.assertEqual(code, 0, out)
        self.assertIn("merged with nothing lost", out)
        self.assertEqual(self.laptop.recipe("turkey-chili")["rating"], "loved")
        self.assertEqual(self.laptop.recipe("fish-tacos")["rating"], "disliked")
        code, out = self.laptop.run("push", "--note", "rated the tacos")
        self.assertEqual(code, 0, out)
        self.assertEqual(self.pc.run("pull")[0], 0)
        for comp in (self.pc, self.laptop):
            self.assertEqual(comp.recipe("turkey-chili")["rating"], "loved")
            self.assertEqual(comp.recipe("fish-tacos")["rating"], "disliked")
            self.assertEqual(comp.recipe("fish-tacos")["notes"], "too much cumin")
        self.assertEqual(self.pc.memory(), self.laptop.memory())
        self.assertEqual(self.table.doc("doc#" + MEMORY)[0], 3)

    def kept_copies(self, comp):
        folder = comp.dir / ".household" / "before-merge"
        return sorted(folder.iterdir()) if folder.is_dir() else []

    def test_a_merge_keeps_a_copy_of_this_computers_file_from_before_it(self):
        # A clean merge and a merge that asks both replace the local memory file: its bytes from
        # before must stay on this computer, and a plain "took the shared copy" keeps nothing.
        self.in_step()
        self.assertEqual(self.kept_copies(self.laptop), [])
        self.pc.edit(set_rating("turkey-chili", "loved"))
        self.laptop.edit(set_rating("fish-tacos", "disliked"))
        self.assertEqual(self.pc.run("push")[0], 0)
        before = self.laptop.read(MEMORY)
        code, out = self.laptop.run("pull")
        self.assertEqual(code, 0, out)
        copies = self.kept_copies(self.laptop)
        self.assertEqual(len(copies), 1, out)
        self.assertEqual(copies[0].read_bytes(), before)
        self.assertNotEqual(self.laptop.read(MEMORY), before)
        self.assertIn("before-merge", out)
        self.assertEqual(self.laptop.run("push")[0], 0)
        # The merge that asks keeps one too.
        self.assertEqual(self.pc.run("pull")[0], 0)
        self.pc.edit(set_rating("turkey-chili", "ok"))
        self.laptop.edit(set_rating("turkey-chili", "banned"))
        self.assertEqual(self.pc.run("push")[0], 0)
        before = self.laptop.read(MEMORY)
        code, out = self.laptop.run("pull")
        self.assertEqual(code, 3, out)
        copies = self.kept_copies(self.laptop)
        self.assertEqual(len(copies), 2, out)
        self.assertIn(before, [c.read_bytes() for c in copies])
        # Kept copies are never sent anywhere.
        for body in self.table.bodies:
            self.assertNotIn("before-merge", body)
        # The PC only ever took the shared copy: nothing to keep.
        self.assertEqual(self.kept_copies(self.pc), [])

    # d
    def test_both_set_the_same_rating_differently_and_someone_is_asked(self):
        self.in_step()
        self.pc.edit(set_rating("turkey-chili", "loved"))
        self.laptop.edit(set_rating("turkey-chili", "ok"))
        self.laptop.edit(set_rating("fish-tacos", "liked"))  # an unrelated change still merges
        self.assertEqual(self.pc.run("push")[0], 0)
        code, out = self.laptop.run("pull")
        self.assertEqual(code, 3, out)
        self.assertIn("Turkey Chili, rating", out)
        self.assertIn('this computer says "ok"', out)
        self.assertIn('says "loved"', out)
        self.assertEqual(self.laptop.recipe("turkey-chili")["rating"], "ok")       # this computer's value kept
        theirs = json.loads(self.laptop.read("martha-memory.theirs.json"))
        self.assertEqual(next(r for r in theirs["recipe_library"] if r["id"] == "turkey-chili")["rating"], "loved")
        self.assertIn("waiting to be settled", self.laptop.run("status")[1])
        puts = self.table.calls.count("PutItem")
        code, out = self.laptop.run("push")
        self.assertEqual(code, 3, out)
        self.assertEqual(self.table.calls.count("PutItem"), puts)                  # refused before any save
        self.assertEqual(self.laptop.run("pull")[0], 3)                            # still waiting
        code, out = self.laptop.run("settled", MEMORY)
        self.assertEqual(code, 0, out)
        self.assertFalse(self.laptop.path("martha-memory.theirs.json").exists())
        code, out = self.laptop.run("push", "--note", "settled the chili rating")
        self.assertEqual(code, 0, out)
        self.assertEqual(self.pc.run("pull")[0], 0)
        self.assertEqual(self.pc.recipe("turkey-chili")["rating"], "ok")
        self.assertEqual(self.pc.recipe("fish-tacos")["rating"], "liked")
        self.assertEqual(self.pc.memory(), self.laptop.memory())

    # e
    def test_a_first_join_keeps_both_histories(self):
        self.pc.write(CONFIG, CONFIG_TEXT)
        self.laptop.write(CONFIG, CONFIG_TEXT)
        self.pc.set_memory(memory(
            [recipe("turkey-chili", "Turkey Chili", times_served=1, last_served="2026-11-16"),
             recipe("sheet-pan-sausage", "Sheet-Pan Sausage")],
            [week("2026-11-16", "turkey-chili", "sheet-pan-sausage", order_placed=True)],
            notes=["Fresh memory file. No history yet - the first run is a cold start."]))
        self.laptop.set_memory(memory(
            [recipe("turkey-chili", "Turkey Chili", times_served=4, last_served="2026-10-05"),
             recipe("fish-tacos", "Fish Tacos", rating="loved", times_served=3, last_served="2026-10-26"),
             recipe("lentil-soup", "Lentil Soup", rating="banned", notes="never again")],
            [week("2026-10-05", "turkey-chili", order_placed=True), week("2026-10-26", "fish-tacos", order_placed=True),
             week("2026-11-02", "lentil-soup", order_placed=True)],
            disliked_ingredients=["cilantro"], notes=["The store is often out of shredded red cabbage."]))
        self.assertEqual(self.pc.run("push", "--note", "first share")[0], 0)
        code, out = self.laptop.run("pull")
        self.assertEqual(code, 0, out)
        self.assertEqual(self.laptop.run("push", "--note", "joined with the older history")[0], 0)
        self.assertEqual(self.pc.run("pull")[0], 0)
        self.assertEqual(self.pc.memory(), self.laptop.memory())
        m = self.pc.memory()
        self.assertEqual({r["id"] for r in m["recipe_library"]},
                         {"turkey-chili", "sheet-pan-sausage", "fish-tacos", "lentil-soup"})
        self.assertEqual([w["week_of"] for w in m["weeks"]], ["2026-10-05", "2026-10-26", "2026-11-02", "2026-11-16"])
        chili = self.pc.recipe("turkey-chili")
        self.assertEqual(chili["times_served"], 4)            # no shared starting point: the larger count
        self.assertEqual(chili["last_served"], "2026-11-16")  # the later date
        self.assertEqual(self.pc.recipe("lentil-soup")["rating"], "banned")
        self.assertEqual(m["disliked_ingredients"], ["cilantro"])
        self.assertEqual(len(m["notes"]), 2)

    # f
    def test_a_sign_in_file_is_never_read_or_sent(self):
        self.seed()
        self.pc.write("kroger-credentials.json", json.dumps({"client_secret": "KROGER_SECRET_MARKER", "refresh_token": "KROGER_TOKEN_MARKER"}))
        self.pc.write("pinterest-credentials.json", json.dumps({"access_token": "PINTEREST_TOKEN_MARKER"}))
        self.pc.write("outputs/kroger-credentials.json", "KROGER_COPY_MARKER")
        self.pc.write("outputs/martha-plan-credentials.md", "PLAN_NAMED_LIKE_A_KEY_MARKER")
        self.pc.write("outputs/martha-recipes-2026-11-16.pdf", "PDF_MARKER")
        self.pc.write("notes-to-self.md", "STRAY_FILE_MARKER")
        self.assertEqual(self.pc.run("push")[0], 0)
        self.assertEqual(self.laptop.run("pull", "--all")[0], 0)
        self.pc.run("status"); self.pc.run("log")
        sent = self.table.everything_sent()
        for marker in ("KROGER_SECRET_MARKER", "KROGER_TOKEN_MARKER", "PINTEREST_TOKEN_MARKER", "KROGER_COPY_MARKER",
                       "PLAN_NAMED_LIKE_A_KEY_MARKER", "PDF_MARKER", "STRAY_FILE_MARKER", SECRET, "credentials"):
            self.assertNotIn(marker, sent)
        self.assertIn("Turkey Chili", sent)  # the search really does see inside the packed files
        self.assertEqual({sk for _, sk in self.table.items if not sk.startswith("log#")},
                         {"doc#" + CONFIG, "doc#" + MEMORY, "plan#" + THIS_WEEK})
        self.assertFalse(self.laptop.path("kroger-credentials.json").exists())
        for name in ("kroger-credentials.json", "voice-credentials.json", "outputs/x-credentials.md", "../x.md",
                     "outputs/martha-plan-2026-11-16.theirs.md", "martha-memory.theirs.json"):
            self.assertFalse(self.pc.mod.allowed(name), name)

    # g
    def test_a_read_only_key_pulls_but_never_saves(self):
        self.in_step()
        phone = Computer(self.root, self.table, "phone", "Riley", "Riley's phone", key_id=PHONE_KEY_ID, read_only=True)
        code, out = phone.run("pull")
        self.assertEqual(code, 0, out)
        self.assertEqual(phone.read(MEMORY), self.pc.read(MEMORY))
        phone.edit(set_rating("turkey-chili", "loved"))
        calls = len(self.table.calls)
        code, out = phone.run("push", "--note", "rated the chili")
        self.assertEqual(code, 1, out)
        self.assertIn("read-only key", out)
        self.assertEqual(len(self.table.calls), calls)  # refused before any call to AWS

    # h
    def test_a_config_both_changed_waits_for_someone_to_fold_it_together(self):
        self.in_step()
        self.pc.write(CONFIG, CONFIG_TEXT + "| Disliked | seaweed |\n")
        self.laptop.write(CONFIG, CONFIG_TEXT + "| Budget | $180 |\n")
        self.assertEqual(self.pc.run("push")[0], 0)
        code, out = self.laptop.run("pull")
        self.assertEqual(code, 3, out)
        self.assertIn("martha-config.theirs.md", out)
        self.assertIn("seaweed", self.laptop.read("martha-config.theirs.md").decode())
        self.assertIn("$180", self.laptop.read(CONFIG).decode())            # this computer's copy untouched
        puts = self.table.calls.count("PutItem")
        self.assertEqual(self.laptop.run("push")[0], 3)
        self.assertEqual(self.table.calls.count("PutItem"), puts)
        self.assertEqual(self.table.doc("doc#" + CONFIG)[1].decode(), CONFIG_TEXT + "| Disliked | seaweed |\n")
        both = CONFIG_TEXT + "| Disliked | seaweed |\n| Budget | $180 |\n"
        self.laptop.write(CONFIG, both)                                      # Martha folds the two together
        self.assertEqual(self.laptop.run("settled", CONFIG)[0], 0)
        self.assertEqual(self.laptop.run("push", "--note", "budget")[0], 0)
        self.assertEqual(self.pc.run("pull")[0], 0)
        self.assertEqual(self.pc.read(CONFIG).decode(), both)
        self.assertEqual(self.laptop.run("settled", CONFIG)[0], 1)           # nothing left to settle

    # i
    def test_lists_keep_what_each_side_added_and_drop_what_either_removed(self):
        cumin = {"item": "ground cumin", "said": "we're out of ground cumin", "added": "2026-11-14", "source": "voice"}
        oil = {"item": "olive oil", "said": "we need olive oil", "added": "2026-11-15", "source": "voice"}
        milk = {"item": "oat milk", "said": "out of oat milk", "added": "2026-11-17", "source": "voice"}
        self.seed()
        self.pc.edit(lambda d: d.update(pending_items=[cumin, oil], adult_snacks_recent=["almonds"]))
        self.assertEqual(self.pc.run("push")[0], 0)
        self.assertEqual(self.laptop.run("pull")[0], 0)
        self.pc.edit(lambda d: d.update(pending_items=[oil], adult_snacks_recent=["almonds", "plantain chips"]))  # cumin went in the cart
        self.laptop.edit(lambda d: d.update(pending_items=[cumin, oil, milk]))                                    # a new note
        self.assertEqual(self.pc.run("push")[0], 0)
        self.assertEqual(self.laptop.run("pull")[0], 0)
        self.assertEqual(self.laptop.memory()["pending_items"], [oil, milk])
        self.assertEqual(self.laptop.memory()["adult_snacks_recent"], ["almonds", "plantain chips"])
        self.assertEqual(self.laptop.run("push")[0], 0)
        self.assertEqual(self.pc.run("pull")[0], 0)
        self.assertEqual(self.pc.memory()["pending_items"], [oil, milk])

    def test_an_order_confirmed_on_one_side_and_feedback_on_the_other_both_count(self):
        self.in_step()

        def confirm(d):
            d["weeks"][0]["order_placed"] = True
            for r in d["recipe_library"]:
                r["times_served"] += 1
                r["last_served"] = THIS_WEEK
            d["last_updated"] = "2026-11-22"
        self.pc.edit(confirm)

        def feedback(d):
            d["weeks"][0]["feedback_collected"] = True
            d["recipe_library"][0]["rating"] = "liked"
            d["last_updated"] = "2026-11-23"
        self.laptop.edit(feedback)
        self.assertEqual(self.pc.run("push")[0], 0)
        code, out = self.laptop.run("pull")
        self.assertEqual(code, 0, out)
        m = self.laptop.memory()
        self.assertTrue(m["weeks"][0]["order_placed"] and m["weeks"][0]["feedback_collected"])
        self.assertEqual(m["recipe_library"][0]["times_served"], 1)
        self.assertEqual(m["recipe_library"][0]["rating"], "liked")
        self.assertEqual(m["last_updated"], "2026-11-23")

    def test_a_plan_email_sent_from_one_computer_is_known_on_the_other(self):
        self.in_step()
        self.pc.edit(lambda d: d["weeks"][0].update(order_placed=True, plan_emailed="2026-12-01T22:10:00"))
        self.laptop.edit(set_rating("fish-tacos", "liked"))        # a change of its own, so the pull merges
        self.assertEqual(self.pc.run("push", "--note", "emailed the plan")[0], 0)
        code, out = self.laptop.run("pull")
        self.assertEqual(code, 0, out)
        self.assertEqual(self.laptop.memory()["weeks"][0]["plan_emailed"], "2026-12-01T22:10:00")
        self.assertTrue(self.laptop.memory()["weeks"][0]["order_placed"])
        self.assertEqual(self.laptop.recipe("fish-tacos")["rating"], "liked")
        # The laptop sends it again later ("email the plan") while the PC changes something else.
        self.assertEqual(self.laptop.run("push")[0], 0)
        self.assertEqual(self.pc.run("pull")[0], 0)
        self.laptop.edit(lambda d: d["weeks"][0].update(plan_emailed="2026-12-03T09:00:00"))
        self.pc.edit(set_rating("turkey-chili", "loved"))
        self.assertEqual(self.laptop.run("push")[0], 0)
        code, out = self.pc.run("pull")
        self.assertEqual(code, 0, out)
        self.assertEqual(self.pc.memory()["weeks"][0]["plan_emailed"], "2026-12-03T09:00:00")

    def test_a_plan_older_than_eight_weeks_comes_only_when_asked_for(self):
        self.seed()
        self.pc.write("outputs/martha-plan-2026-01-05.md", "# An old week\n")
        self.assertEqual(self.pc.run("push")[0], 0)
        self.assertEqual(self.laptop.run("pull")[0], 0)
        self.assertTrue(self.laptop.path(PLAN).exists())
        self.assertFalse(self.laptop.path("outputs/martha-plan-2026-01-05.md").exists())
        self.assertNotIn("2026-01-05", self.pc.run("status")[1])   # shared, just out of the usual window
        self.assertEqual(self.laptop.run("pull", "--all")[0], 0)
        self.assertEqual(self.laptop.read("outputs/martha-plan-2026-01-05.md"), b"# An old week\n")

    def test_a_key_without_the_household_permission_is_told_how_to_fix_it(self):
        self.table.denied[KEY_ID] = {("GetItem", "household"), ("PutItem", "household"), ("Query", "household")}
        for command in (("check",), ("pull",), ("status",)):
            code, out = self.pc.run(*command)
            self.assertEqual(code, 1, out)
            self.assertIn("isn't allowed to use the shared household yet", out)
            self.assertIn("VOICE-SETUP.md", out)
        self.table.denied.clear()
        code, out = self.pc.run("check")
        self.assertEqual(code, 0, out)

    def test_nothing_shared_yet_and_bad_usage(self):
        code, out = self.pc.run("pull")
        self.assertEqual(code, 0, out)
        self.assertIn("Nothing is shared yet", out)
        self.assertIn("Nothing has been shared yet", self.pc.run("log")[1])
        self.seed()
        self.assertIn("not shared yet", self.pc.run("status")[1])
        self.assertEqual(self.pc.run("frobnicate")[0], 2)
        self.assertEqual(self.pc.run()[0], 2)

    def test_a_file_too_big_for_the_table_is_refused_whole(self):
        self.seed()
        self.pc.write(PLAN, os.urandom(400 * 1024).hex())  # random text packs badly: over the limit
        code, out = self.pc.run("push")
        self.assertEqual(code, 1, out)
        self.assertIn("too big to share", out)
        self.assertIsNone(self.table.doc("plan#" + THIS_WEEK))

    def test_the_key_is_never_printed(self):
        self.in_step()
        self.laptop.edit(set_rating("turkey-chili", "loved"))
        printed = "".join(self.laptop.run(*c)[1] for c in (("status",), ("push",), ("pull",), ("log",), ("check",)))
        self.assertNotIn(SECRET, printed)
        self.assertNotIn(KEY_ID, printed)


class MergeRules(unittest.TestCase):
    """merge_memory on its own: the rules that settle a field without asking."""

    @classmethod
    def setUpClass(cls):
        with mock.patch.dict(os.environ, dict(ENV, MARTHA_DIR=FAKE_HOME)):
            spec = importlib.util.spec_from_file_location("martha_household_merge_rules", SCRIPTS / "martha_household.py")
            cls.mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(cls.mod)

    def merge(self, base, mine, theirs):
        return self.mod.merge_memory(copy.deepcopy(base), copy.deepcopy(mine), copy.deepcopy(theirs))

    def test_counts_add_dates_take_the_later_and_flags_stay_true(self):
        base = memory([recipe("a", "A", times_served=2, last_served="2026-10-01")], [week("2026-11-16", "a")])
        mine, theirs = copy.deepcopy(base), copy.deepcopy(base)
        mine["recipe_library"][0].update(times_served=3, last_served="2026-11-16")
        theirs["recipe_library"][0].update(times_served=3, last_served="2026-11-09", tags=["soup"])
        mine["recipe_library"][0]["tags"] = ["slow cooker"]
        merged, conflicts = self.merge(base, mine, theirs)
        self.assertEqual(conflicts, [])
        r = merged["recipe_library"][0]
        self.assertEqual((r["times_served"], r["last_served"], r["tags"]), (3, "2026-11-16", ["slow cooker", "soup"]))
        theirs["recipe_library"][0]["times_served"] = 4   # both counted a different serving
        mine["recipe_library"][0]["times_served"] = 3
        self.assertEqual(self.merge(base, mine, theirs)[0]["recipe_library"][0]["times_served"], 5)

    def test_a_loved_ingredient_said_on_both_sides_is_one_entry(self):
        base = memory([], [])
        mine, theirs = copy.deepcopy(base), copy.deepcopy(base)
        mine["loved_ingredients"] = [{"name": "sweet potato", "said": "we'd eat it daily", "last_said": "2026-11-10", "times": 1}]
        theirs["loved_ingredients"] = [{"name": "Sweet Potato", "said": "we'd eat it daily", "last_said": "2026-11-18", "times": 1},
                                       "sheet-pan dinners"]
        merged, conflicts = self.merge(base, mine, theirs)
        self.assertEqual(len(merged["loved_ingredients"]), 2)
        self.assertEqual(merged["loved_ingredients"][0]["last_said"], "2026-11-18")
        self.assertEqual(merged["loved_ingredients"][0]["name"], "sweet potato")
        self.assertEqual(conflicts, [])

    def test_a_week_replanned_on_both_sides_is_a_conflict_not_a_blend(self):
        base = memory([], [week("2026-11-16", "a", "b")])
        mine, theirs = copy.deepcopy(base), copy.deepcopy(base)
        mine["weeks"][0]["dinner_ids"] = ["a", "c"]
        theirs["weeks"][0]["dinner_ids"] = ["d", "b"]
        merged, conflicts = self.merge(base, mine, theirs)
        self.assertEqual(merged["weeks"][0]["dinner_ids"], ["a", "c"])
        self.assertEqual([(c["where"], c["field"]) for c in conflicts], [("the week of 2026-11-16", "dinner_ids")])

    # A week's plan_emailed: null until that week's plan email is sent, then the time it went (UTC).

    def emailed(self, base, mine, theirs):
        """Merges one week whose plan_emailed is given per side; "absent" means the week has no
        such field. Returns (the merged week, the conflicts)."""
        def mem(value):
            if value == "none":
                return None  # no shared starting point: a first join
            w = week("2026-11-30", "a", "b")
            if value != "absent":
                w["plan_emailed"] = value
            return memory([], [w])
        merged, conflicts = self.merge(mem(base), mem(mine), mem(theirs))
        self.assertEqual(len(merged["weeks"]), 1)
        return merged["weeks"][0], conflicts

    def test_two_different_emailed_times_keep_the_later_and_nobody_is_asked(self):
        early, late = "2026-12-01T22:10:00", "2026-12-02T08:05:30"
        for base in (None, "absent", "none"):
            for mine, theirs in ((early, late), (late, early)):
                w, conflicts = self.emailed(base, mine, theirs)
                self.assertEqual(w["plan_emailed"], late, (base, mine, theirs))
                self.assertEqual(conflicts, [], (base, mine, theirs))
        # One computer sent it again ("email the plan") after both had the first time.
        w, conflicts = self.emailed(early, late, early)
        self.assertEqual((w["plan_emailed"], conflicts), (late, []))

    def test_an_emailed_time_beside_a_null_is_kept(self):
        sent = "2026-12-01T22:10:00"
        for base in (None, "absent", "none", sent):
            for mine, theirs in ((sent, None), (None, sent)):
                w, conflicts = self.emailed(base, mine, theirs)
                self.assertEqual(w["plan_emailed"], sent, (base, mine, theirs))
                self.assertEqual(conflicts, [], (base, mine, theirs))

    def test_an_emailed_time_beside_a_week_without_the_field_is_kept(self):
        sent = "2026-12-01T22:10:00"
        for base in (None, "absent", "none", sent):
            for mine, theirs in ((sent, "absent"), ("absent", sent)):
                w, conflicts = self.emailed(base, mine, theirs)
                self.assertEqual(w.get("plan_emailed"), sent, (base, mine, theirs))
                self.assertEqual(conflicts, [], (base, mine, theirs))

    def test_a_week_nobody_emailed_stays_unsent(self):
        for base in (None, "none"):
            w, conflicts = self.emailed(base, None, None)
            self.assertIn("plan_emailed", w)
            self.assertIsNone(w["plan_emailed"])
            self.assertEqual(conflicts, [])
        # Written before the email existed, on both computers: the field is not invented.
        w, conflicts = self.emailed("absent", "absent", "absent")
        self.assertNotIn("plan_emailed", w)
        self.assertEqual(conflicts, [])
        # Null on one computer, no field on the other, nothing shared before: no time appears and
        # nobody is asked.
        for mine, theirs in ((None, "absent"), ("absent", None)):
            w, conflicts = self.emailed("none", mine, theirs)
            self.assertIsNone(w.get("plan_emailed"), (mine, theirs))
            self.assertEqual(conflicts, [], (mine, theirs))

    def test_the_emailed_time_leaves_the_weeks_other_fields_alone(self):
        base = memory([], [week("2026-11-30", "a", "b", plan_emailed=None)])
        mine, theirs = copy.deepcopy(base), copy.deepcopy(base)
        mine["weeks"][0].update(order_placed=True, plan_emailed="2026-12-01T22:10:00")
        theirs["weeks"][0].update(feedback_collected=True, plan_emailed="2026-12-01T22:12:45")
        merged, conflicts = self.merge(base, mine, theirs)
        self.assertEqual(conflicts, [])
        w = merged["weeks"][0]
        expect = week("2026-11-30", "a", "b", order_placed=True, feedback_collected=True,
                      plan_emailed="2026-12-01T22:12:45")
        self.assertEqual(w, expect)
        # order_placed keeps its own rule: true on one side stays true, and false on both stays false.
        theirs["weeks"][0]["order_placed"] = False
        self.assertTrue(self.merge(base, mine, theirs)[0]["weeks"][0]["order_placed"])
        mine["weeks"][0]["order_placed"] = False
        self.assertFalse(self.merge(base, mine, theirs)[0]["weeks"][0]["order_placed"])
        # A week replanned on both sides is still asked about, emailed or not.
        mine["weeks"][0]["dinner_ids"] = ["a", "c"]
        theirs["weeks"][0]["dinner_ids"] = ["d", "b"]
        merged, conflicts = self.merge(base, mine, theirs)
        self.assertEqual([c["field"] for c in conflicts], ["dinner_ids"])
        self.assertEqual(merged["weeks"][0]["plan_emailed"], "2026-12-01T22:12:45")

    def test_templates_are_never_merged_and_unknown_keys_are_kept(self):
        base = memory([], [])
        mine, theirs = copy.deepcopy(base), copy.deepcopy(base)
        theirs["_templates"] = {"recipe": {"id": "changed"}}
        theirs["something_new"] = {"a": 1}
        merged, conflicts = self.merge(base, mine, theirs)
        self.assertEqual(merged["_templates"], mine["_templates"])
        self.assertEqual(merged["something_new"], {"a": 1})
        self.assertEqual(conflicts, [])


if __name__ == "__main__":
    unittest.main()
