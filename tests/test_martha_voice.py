"""Offline tests for Martha's voice notes client: no network, AWS's own documentation example keys.
Run from the repo root:  python -m unittest discover -s tests -v
"""
import contextlib, importlib.util, io, json, os, subprocess, sys, tempfile, unittest, urllib.error
from pathlib import Path
from unittest import mock

SCRIPTS = Path(__file__).resolve().parent.parent / ".claude" / "skills" / "martha" / "scripts"
# AWS's documentation example key pair (not a real key).
KEY_ID = "AKIAIOSFODNN7EXAMPLE"
SECRET = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
ENV = {"MARTHA_VOICE_CREDS": "", "KROGER_CREDS": "", "PINTEREST_CREDS": ""}


def load(creds_dir):
    """Import the client fresh, with MARTHA_DIR pointing at a folder of fake credentials."""
    with mock.patch.dict(os.environ, dict(ENV, MARTHA_DIR=str(creds_dir))):
        spec = importlib.util.spec_from_file_location("martha_voice_under_test", SCRIPTS / "martha_voice.py")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod


class Reply(io.BytesIO):
    """Stands in for urlopen's response."""
    def __init__(self, payload, status=200):
        super().__init__(json.dumps(payload).encode()); self.status = status
    def __enter__(self): return self
    def __exit__(self, *a): return False


def aws_error(code, kind, message=""):
    body = json.dumps({"__type": "com.amazonaws.dynamodb.v20120810#" + kind, "message": message}).encode()
    return urllib.error.HTTPError("https://dynamodb.us-east-1.amazonaws.com/", code, "err", {}, io.BytesIO(body))


def run_cli(creds_dir, *args):
    """Run the client from the command line with fake credentials; returns (exit code, output)."""
    env = dict(os.environ, **ENV, MARTHA_DIR=str(creds_dir))
    r = subprocess.run([sys.executable, str(SCRIPTS / "martha_voice.py"), *args], capture_output=True, text=True, env=env, timeout=60)
    return r.returncode, r.stdout + r.stderr


def note(said_at, nid, words, understood, interpreter="claude-haiku-5-5"):
    """A note item as DynamoDB returns it."""
    return {"pk": {"S": "note"}, "sk": {"S": f"{said_at}#{nid}"}, "id": {"S": nid}, "said_at": {"S": said_at},
            "words": {"S": words}, "understood": {"S": understood if isinstance(understood, str) else json.dumps(understood)},
            "interpreter": {"S": interpreter}}


def sent(urlopen, i):
    """(operation, JSON body) of the i-th request the client made."""
    req = urlopen.call_args_list[i][0][0]
    return req.get_header("X-amz-target").split(".")[-1], json.loads(req.data)


class SigningTests(unittest.TestCase):
    def setUp(self):
        self.v = load(Path(tempfile.mkdtemp()))

    def test_signature_matches_aws_published_example(self):
        # AWS's worked example, "Example Signature Calculation" (Create Vault, PUT vault):
        # https://docs.aws.amazon.com/amazonglacier/latest/dev/amazon-glacier-signing-requests.html
        # Every expected value below is copied from that page (fetched 2026-11-16).
        headers = {"Host": "glacier.us-east-1.amazonaws.com", "x-amz-date": "20120525T002453Z",
                   "x-amz-glacier-version": "2012-06-01"}
        canonical, signed = self.v.canonical_request("PUT", "/-/vaults/examplevault", "", headers, self.v.sha256_hex(b""))
        self.assertEqual(canonical, "PUT\n/-/vaults/examplevault\n\n"
                                    "host:glacier.us-east-1.amazonaws.com\nx-amz-date:20120525T002453Z\nx-amz-glacier-version:2012-06-01\n\n"
                                    "host;x-amz-date;x-amz-glacier-version\n"
                                    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
        sts = self.v.string_to_sign("20120525T002453Z", "20120525/us-east-1/glacier/aws4_request", canonical)
        self.assertEqual(sts, "AWS4-HMAC-SHA256\n20120525T002453Z\n20120525/us-east-1/glacier/aws4_request\n"
                              "5f1da1a2d0feb614dd03d71e87928b8e449ac87614479332aced3a701f916743")
        auth = self.v.authorization(KEY_ID, SECRET, "us-east-1", "glacier", "PUT", "/-/vaults/examplevault", "", headers, b"")
        # The page's header, with its line breaks taken out. (Built in pieces only so the release
        # check's token-shape rule doesn't mistake AWS's example for a real key.)
        signature = "3ce5b2f2fffac9262b4da9256f8d086b4aaf42eba5f111c21681a65a127b7c2a"
        self.assertEqual(auth, f"AWS4-HMAC-SHA256 Credential={KEY_ID}/20120525/us-east-1/glacier/aws4_request, "
                               f"SignedHeaders=host;x-amz-date;x-amz-glacier-version, Signature={signature}")

    def test_header_values_are_trimmed_and_their_spaces_collapsed(self):
        canonical, _ = self.v.canonical_request("POST", "/", "", {"X-Amz-Target": "  a   b "}, "h")
        self.assertIn("x-amz-target:a b\n", canonical)


class VoiceTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.creds = self.dir / "voice-credentials.json"
        self.creds.write_text(json.dumps({"aws_access_key_id": KEY_ID, "aws_secret_access_key": SECRET,
                                          "region": "us-east-1", "table": "martha-voice"}))
        self.v = load(self.dir)

    def test_a_call_is_signed_over_the_exact_body_sent_to_dynamodb(self):
        with mock.patch.object(self.v.urllib.request, "urlopen", return_value=Reply({"Items": [], "Count": 0})) as urlopen:
            self.assertTrue(self.v.check())
        req = urlopen.call_args[0][0]
        self.assertEqual((req.get_method(), req.full_url), ("POST", "https://dynamodb.us-east-1.amazonaws.com/"))
        self.assertEqual(req.get_header("X-amz-target"), "DynamoDB_20120810.Query")
        self.assertEqual(req.get_header("Content-type"), "application/x-amz-json-1.0")
        auth = req.get_header("Authorization")
        self.assertIn("/us-east-1/dynamodb/aws4_request, SignedHeaders=content-type;host;x-amz-date;x-amz-target, ", auth)
        signed = {k: req.get_header(k) for k in ("Content-type", "Host", "X-amz-date", "X-amz-target")}
        self.assertEqual(auth, self.v.authorization(KEY_ID, SECRET, "us-east-1", "dynamodb", "POST", "/", "", signed, req.data))
        body = json.loads(req.data)
        self.assertEqual((body["Limit"], body["TableName"]), (1, "martha-voice"))
        self.assertEqual(body["ExpressionAttributeValues"], {":pk": {"S": "note"}})

    def test_every_page_of_notes_is_read(self):
        first = note("2026-11-14T01:00:00Z", "n1", "we're out of ground cumin", {"kind": "out_of", "item": "ground cumin", "unclear": False})
        second = note("2026-11-15T01:00:00Z", "n2", "more sheet-pan dinners", {"kind": "preference", "unclear": False})
        replies = [Reply({"Items": [first], "LastEvaluatedKey": {"pk": {"S": "note"}, "sk": first["sk"]}}), Reply({"Items": [second]})]
        with mock.patch.object(self.v.urllib.request, "urlopen", side_effect=replies) as urlopen:
            out = self.v.notes()
        self.assertEqual([n["id"] for n in out], ["n1", "n2"])
        self.assertNotIn("ExclusiveStartKey", sent(urlopen, 0)[1])
        self.assertEqual(sent(urlopen, 1)[1]["ExclusiveStartKey"], {"pk": {"S": "note"}, "sk": first["sk"]})

    def test_notes_come_oldest_first_with_what_alexa_understood(self):
        items = [note("2026-11-15T19:30:00Z", "late", "Sam really liked the chili tonight",
                      {"kind": "meal_feedback", "readback": "Sam liked the chili", "item": None, "meal": "chili", "person": "Sam",
                       "sentiment": "liked", "unclear": False, "question": None, "answer": None}),
                 note("2026-11-13T08:00:00.250Z", "early", "cumin something", {"kind": "other", "unclear": True}, interpreter="fallback"),
                 note("2026-11-14T12:00:00Z", "middle", "the thing", "not json")]
        with mock.patch.object(self.v.urllib.request, "urlopen", return_value=Reply({"Items": items})):
            out = self.v.notes()
        self.assertEqual([n["id"] for n in out], ["early", "middle", "late"])
        self.assertEqual(out[2]["understood"]["sentiment"], "liked"); self.assertEqual(out[2]["understood"]["person"], "Sam")
        self.assertEqual(out[2]["words"], "Sam really liked the chili tonight")
        self.assertEqual(out[0]["interpreter"], "fallback")
        self.assertEqual(out[1]["understood"], {"kind": "other", "unclear": True})  # unreadable: Martha asks

    def test_done_deletes_only_the_named_notes_by_their_own_keys(self):
        items = [note("2026-11-13T08:00:00Z", "a", "w", {}), note("2026-11-14T08:00:00Z", "b", "w", {}),
                 note("2026-11-15T08:00:00Z", "c", "w", {})]
        replies = [Reply({"Items": items}), Reply({}), Reply({})]
        with mock.patch.object(self.v.urllib.request, "urlopen", side_effect=replies) as urlopen:
            deleted, missing = self.v.done(["c", "a", "gone"])
        self.assertEqual((deleted, missing), (["c", "a"], ["gone"]))
        self.assertEqual(urlopen.call_count, 3)
        self.assertEqual(sent(urlopen, 1), ("DeleteItem", {"TableName": "martha-voice", "Key": {"pk": {"S": "note"}, "sk": {"S": "2026-11-15T08:00:00Z#c"}}}))
        self.assertEqual(sent(urlopen, 2)[1]["Key"]["sk"], {"S": "2026-11-13T08:00:00Z#a"})

    def test_context_writes_only_the_week_meal_names_and_first_names(self):
        f = self.dir / "context.json"
        f.write_text(json.dumps({"week_of": "2026-11-16", "meals": ["Chili", "Sheet-pan chicken", "Chili"],
                                 "people": ["Alex Example", "Sam", "Jamie"], "budget": 220, "address": "somewhere", "diets": ["gluten-free"]}))
        err = io.StringIO()
        with mock.patch.object(self.v.urllib.request, "urlopen", return_value=Reply({})) as urlopen, \
                contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(err):
            self.assertEqual(self.v.main(["context", str(f)]), 0)
        op, body = sent(urlopen, 0)
        self.assertEqual(op, "PutItem")
        item = body["Item"]
        self.assertEqual(set(item), {"pk", "sk", "week_of", "meals", "people", "updated_at"})
        self.assertEqual((item["pk"], item["sk"], item["week_of"]), ({"S": "context"}, {"S": "current"}, {"S": "2026-11-16"}))
        self.assertEqual(item["meals"], {"L": [{"S": "Chili"}, {"S": "Sheet-pan chicken"}]})
        self.assertEqual(item["people"], {"L": [{"S": "Alex"}, {"S": "Sam"}, {"S": "Jamie"}]})
        self.assertRegex(item["updated_at"]["S"], r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
        self.assertNotIn("somewhere", urlopen.call_args[0][0].data.decode())
        self.assertIn("address, budget, diets", err.getvalue())

    def test_a_bad_context_file_is_refused_before_calling_aws(self):
        with mock.patch.object(self.v.urllib.request, "urlopen") as urlopen:
            with self.assertRaises(SystemExit):
                self.v.write_context("next week", ["Chili"], ["Sam"])
            with self.assertRaises(SystemExit):
                self.v.write_context("2026-11-16", "Chili", ["Sam"])
        urlopen.assert_not_called()

    def test_errors_are_plain_words_and_never_show_the_key_or_what_aws_said(self):
        arn = "arn:aws:iam::123456789012:user/example-pc"
        cases = [(aws_error(400, "UnrecognizedClientException", arn), "key id or secret is wrong"),
                 (aws_error(400, "InvalidSignatureException", arn), "key id or secret is wrong"),
                 (aws_error(400, "AccessDeniedException", f"User: {arn} is not authorized"), "lacks permission"),
                 (aws_error(400, "ResourceNotFoundException", arn), "no table martha-voice in us-east-1"),
                 (aws_error(400, "InvalidSignatureException", "Signature expired: " + arn), "clock"),
                 (aws_error(500, "InternalServerError", arn), "the run continues without them"),
                 (urllib.error.URLError("getaddrinfo failed"), "the run continues without them"),
                 (TimeoutError("timed out"), "the run continues without them")]
        for error, words in cases:
            with self.subTest(words=words, error=type(error).__name__):
                self.v._C = None
                out, err = io.StringIO(), io.StringIO()
                with mock.patch.object(self.v.urllib.request, "urlopen", side_effect=[error]), \
                        contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
                    with self.assertRaises(SystemExit) as e:
                        self.v.main(["check"])
                msg = str(e.exception.code)
                self.assertIn(words, msg)
                if "continues" not in words:
                    self.assertIn("VOICE-SETUP.md step", msg)
                for shown in (msg, out.getvalue(), err.getvalue()):
                    self.assertNotIn(SECRET, shown); self.assertNotIn(KEY_ID, shown); self.assertNotIn("123456789012", shown)

    def test_access_denied_says_to_use_the_household_pc_key(self):
        with mock.patch.object(self.v.urllib.request, "urlopen", side_effect=[aws_error(400, "AccessDeniedException")]):
            with self.assertRaises(SystemExit) as e:
                self.v.check()
        self.assertIn("household's PC key", str(e.exception)); self.assertIn("setup", str(e.exception))

    def test_missing_credentials_point_at_voice_setup(self):
        empty = Path(tempfile.mkdtemp())
        with mock.patch.dict(os.environ, {"HOME": str(empty), "USERPROFILE": str(empty)}):
            v = load(empty)
            with mock.patch.object(v.urllib.request, "urlopen") as urlopen:
                with self.assertRaises(SystemExit) as e:
                    v.notes()
        urlopen.assert_not_called()
        self.assertIn("VOICE-SETUP.md", str(e.exception)); self.assertIn("setup", str(e.exception))

    def test_credentials_saved_by_windows_notepad_still_load(self):
        self.creds.write_bytes(b"\xef\xbb\xbf" + self.creds.read_bytes())
        self.assertEqual(load(self.dir)._creds()["table"], "martha-voice")

    def test_region_and_table_default_when_left_out(self):
        self.creds.write_text(json.dumps({"aws_access_key_id": KEY_ID, "aws_secret_access_key": SECRET}))
        c = load(self.dir)._creds()
        self.assertEqual((c["region"], c["table"]), ("us-east-1", "martha-voice"))

    def test_a_profile_kept_elsewhere_is_found_through_the_location_file(self):
        home = Path(tempfile.mkdtemp())
        (home / ".martha").mkdir()
        (home / ".martha" / "profile-location.txt").write_text(str(self.dir) + "\n")
        with mock.patch.dict(os.environ, {"HOME": str(home), "USERPROFILE": str(home)}):
            with mock.patch.dict(os.environ, dict(ENV, MARTHA_DIR="")):
                spec = importlib.util.spec_from_file_location("voice_located", SCRIPTS / "martha_voice.py")
                mod = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(mod)
        self.assertEqual(Path(mod.CREDS_PATH), self.creds)

    def test_command_line_without_a_command_prints_usage_and_calls_nobody(self):
        for args in ([], ["done"], ["context"], ["fly"]):
            with self.subTest(args=args):
                code, out = run_cli(self.dir, *args)
                self.assertEqual(code, 2); self.assertIn("usage", out.lower())


class SetupTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.v = load(self.dir)  # no credentials yet
        self.env = mock.patch.dict(os.environ, dict(ENV, MARTHA_DIR=str(self.dir)))
        self.env.start(); self.addCleanup(self.env.stop)

    def run_setup(self, answers, secret=SECRET):
        out, err = io.StringIO(), io.StringIO()
        with mock.patch("builtins.input", side_effect=answers), mock.patch.object(self.v.getpass, "getpass", return_value=secret), \
                mock.patch.object(self.v.urllib.request, "urlopen", return_value=Reply({"Items": []})) as urlopen, \
                contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            self.v.main(["setup"])
        return out.getvalue() + err.getvalue(), urlopen

    def test_setup_saves_the_key_in_the_profile_folder_checks_it_and_never_echoes_it(self):
        shown, urlopen = self.run_setup([KEY_ID, "", ""])
        saved = json.loads((self.dir / "voice-credentials.json").read_text())
        self.assertEqual(saved, {"aws_access_key_id": KEY_ID, "aws_secret_access_key": SECRET, "region": "us-east-1", "table": "martha-voice"})
        self.assertEqual(urlopen.call_count, 1)  # the check
        self.assertIn("Voice notes work", shown)
        self.assertNotIn(SECRET, shown); self.assertNotIn(KEY_ID, shown)
        self.assertFalse((self.dir / "voice-credentials.json.tmp").exists())

    @unittest.skipIf(os.name == "nt", "file modes are a POSIX matter")
    def test_saved_credentials_are_readable_only_by_their_owner(self):
        self.run_setup([KEY_ID, "", ""])
        self.assertEqual((self.dir / "voice-credentials.json").stat().st_mode & 0o777, 0o600)

    def test_setup_keeps_a_named_region_and_table(self):
        self.run_setup([KEY_ID, "us-west-2", "our-notes"])
        saved = json.loads((self.dir / "voice-credentials.json").read_text())
        self.assertEqual((saved["region"], saved["table"]), ("us-west-2", "our-notes"))

    def test_setup_refuses_a_temporary_key_and_saves_nothing(self):
        with self.assertRaises(SystemExit) as e:
            self.run_setup(["ASIAIOSFODNN7EXAMPLE"])
        self.assertIn("AKIA", str(e.exception))
        self.assertFalse((self.dir / "voice-credentials.json").exists())

    def test_a_failed_check_after_setup_says_why_without_the_secret(self):
        with self.assertRaises(SystemExit) as e:
            with mock.patch("builtins.input", side_effect=[KEY_ID, "", ""]), mock.patch.object(self.v.getpass, "getpass", return_value=SECRET), \
                    mock.patch.object(self.v.urllib.request, "urlopen", side_effect=[aws_error(400, "UnrecognizedClientException")]), \
                    contextlib.redirect_stdout(io.StringIO()):
                self.v.main(["setup"])
        self.assertIn("key id or secret is wrong", str(e.exception)); self.assertNotIn(SECRET, str(e.exception))
        self.assertTrue((self.dir / "voice-credentials.json").exists())  # saved, so a re-run of setup replaces it

    def test_no_cowork_folder_is_created_on_a_normal_machine(self):
        if os.path.isdir(self.v.COWORK_OUT):
            self.skipTest("running inside a Cowork session")
        self.run_setup([KEY_ID, "", ""])
        self.assertFalse(os.path.isdir(self.v.COWORK_OUT))


if __name__ == "__main__":
    unittest.main()
