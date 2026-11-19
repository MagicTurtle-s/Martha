"""Offline tests for Martha's Kroger and Pinterest clients: no network, fake credentials.
Run from the repo root:  python -m unittest discover -s tests -v
"""
import importlib.util, io, json, os, sys, tempfile, unittest, urllib.error
from pathlib import Path
from unittest import mock

SCRIPTS = Path(__file__).resolve().parent.parent / ".claude" / "skills" / "martha" / "scripts"


def load(name, creds_dir):
    """Import a client fresh, with MARTHA_DIR pointing at a folder of fake credentials."""
    with mock.patch.dict(os.environ, {"MARTHA_DIR": str(creds_dir), "KROGER_CREDS": "", "PINTEREST_CREDS": ""}):
        spec = importlib.util.spec_from_file_location(f"{name}_under_test", SCRIPTS / f"{name}.py")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod


class Reply(io.BytesIO):
    """Stands in for urlopen's response."""
    def __init__(self, payload, status=200):
        super().__init__(json.dumps(payload).encode()); self.status = status
    def __enter__(self): return self
    def __exit__(self, *a): return False


def http_error(code, body=b"{}"):
    return urllib.error.HTTPError("https://api.example", code, "err", {}, io.BytesIO(body))


def run_cli(name, creds_dir, *args):
    """Run a client from the command line with fake credentials; returns (exit code, output)."""
    import subprocess
    env = dict(os.environ, MARTHA_DIR=str(creds_dir), KROGER_CREDS="", PINTEREST_CREDS="")
    r = subprocess.run([sys.executable, str(SCRIPTS / f"{name}.py"), *args], capture_output=True, text=True, env=env, timeout=60)
    return r.returncode, r.stdout + r.stderr


class KrogerTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.creds = self.dir / "kroger-credentials.json"
        self.creds.write_text(json.dumps({
            "client_id": "test-app", "client_secret": "s3cret", "redirect_uri": "http://localhost:8000/callback",
            "refresh_token": "old-refresh", "store_location_id": "01234567"}))
        self.k = load("martha_kroger", self.dir)
        self.sleep = mock.patch.object(self.k.time, "sleep").start()
        self.addCleanup(mock.patch.stopall)

    def test_rotated_refresh_token_is_saved_at_once(self):
        with mock.patch.object(self.k.urllib.request, "urlopen", return_value=Reply({"access_token": "a1", "refresh_token": "new-refresh"})):
            self.assertEqual(self.k.user_token(), "a1")
        self.assertEqual(json.loads(self.creds.read_text())["refresh_token"], "new-refresh")

    def test_unchanged_refresh_token_leaves_the_file_alone(self):
        before = self.creds.read_text()
        with mock.patch.object(self.k.urllib.request, "urlopen", return_value=Reply({"access_token": "a1", "refresh_token": "old-refresh"})):
            self.k.user_token()
        self.assertEqual(self.creds.read_text(), before)

    def test_search_maps_price_size_and_stock(self):
        replies = [Reply({"access_token": "cc", "expires_in": 1800}),
                   Reply({"data": [{"productId": "0001", "description": "Chicken", "brand": "Kroger",
                                    "items": [{"size": "1 lb", "price": {"regular": 5.99, "promo": 4.99},
                                               "inventory": {"stockLevel": "HIGH"}}]}]})]
        with mock.patch.object(self.k.urllib.request, "urlopen", side_effect=replies) as urlopen:
            out = self.k.search("chicken")
        self.assertEqual(out[0]["upc"], "0001"); self.assertEqual(out[0]["promo"], 4.99); self.assertEqual(out[0]["stock"], "HIGH")
        self.assertIn("filter.locationId=01234567", urlopen.call_args_list[1][0][0].full_url)

    def test_a_403_burst_is_retried_with_backoff(self):
        self.k._cc_tokens["product.compact"] = ("cc", 10**12)
        with mock.patch.object(self.k.urllib.request, "urlopen", side_effect=[http_error(403), http_error(403), Reply({"data": []})]):
            self.assertEqual(self.k.search("eggs"), [])
        self.assertIn(mock.call(4), self.sleep.call_args_list); self.assertIn(mock.call(8), self.sleep.call_args_list)

    def test_other_errors_are_not_retried(self):
        self.k._cc_tokens["product.compact"] = ("cc", 10**12)
        with mock.patch.object(self.k.urllib.request, "urlopen", side_effect=[http_error(401)]):
            with self.assertRaises(urllib.error.HTTPError):
                self.k.search("eggs")

    def test_cart_add_uses_the_configured_modality(self):
        self.k.C["modality"] = "PICKUP"
        replies = [Reply({"access_token": "u1"}), Reply({}, status=204)]
        with mock.patch.object(self.k.urllib.request, "urlopen", side_effect=replies) as urlopen:
            self.assertEqual(self.k.add_to_cart([{"upc": "0001", "quantity": 2}]), 204)
        body = json.loads(urlopen.call_args_list[1][0][0].data)
        self.assertEqual(body["items"][0], {"upc": "0001", "quantity": 2, "modality": "PICKUP"})

    def test_authorize_url_asks_for_cart_and_product_scopes(self):
        url = self.k.authorize_url()
        self.assertIn("cart.basic%3Awrite", url); self.assertIn("client_id=test-app", url)

    def test_no_cowork_folder_is_created_on_a_normal_machine(self):
        if os.path.isdir(self.k.COWORK_OUT):
            self.skipTest("running inside a Cowork session")
        self.k._save()
        self.assertFalse(os.path.isdir(self.k.COWORK_OUT))

    def test_missing_credentials_say_where_to_look(self):
        empty = Path(tempfile.mkdtemp())
        with mock.patch.object(Path, "home", return_value=empty), mock.patch.dict(os.environ, {"HOME": str(empty), "USERPROFILE": str(empty)}):
            with self.assertRaises(SystemExit) as e:
                load("martha_kroger", empty)
        self.assertIn("KROGER-SETUP.md", str(e.exception))

    def test_a_profile_kept_elsewhere_is_found_through_the_location_file(self):
        home = Path(tempfile.mkdtemp())
        (home / ".martha").mkdir()
        (home / ".martha" / "profile-location.txt").write_text(str(self.dir) + "\n")
        env = {"MARTHA_DIR": "", "KROGER_CREDS": "", "HOME": str(home), "USERPROFILE": str(home)}
        with mock.patch.dict(os.environ, env):
            spec = importlib.util.spec_from_file_location("kroger_located", SCRIPTS / "martha_kroger.py")
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
        self.assertEqual(Path(mod.CREDS_PATH), self.creds)

    # ---- First-time setup and the ways it goes wrong (found by the pre-release review) ----

    def test_no_sign_in_yet_points_to_step_4_before_calling_kroger(self):
        self.k.C["refresh_token"] = ""
        with mock.patch.object(self.k.urllib.request, "urlopen") as urlopen:
            with self.assertRaises(SystemExit) as e:
                self.k.user_token()
        urlopen.assert_not_called()
        self.assertIn("step 4", str(e.exception))

    def test_a_refused_sign_in_says_to_sign_in_again_and_never_shows_the_secret(self):
        err = http_error(400, b'{"error": "invalid_grant", "error_description": "bad token old-refresh"}')
        with mock.patch.object(self.k.urllib.request, "urlopen", side_effect=[err]):
            with self.assertRaises(SystemExit) as e:
                self.k.user_token()
        msg = str(e.exception)
        self.assertIn("invalid_grant", msg); self.assertIn("auth", msg)
        self.assertNotIn("s3cret", msg); self.assertNotIn("old-refresh", msg)

    def test_code_takes_the_whole_callback_address(self):
        with mock.patch.object(self.k.urllib.request, "urlopen", return_value=Reply({"access_token": "a", "refresh_token": "first"})) as urlopen:
            keys = self.k.exchange_code("http://localhost:8000/callback?code=abc123&state=x")
        self.assertIn("code=abc123&", urlopen.call_args[0][0].data.decode() + "&")
        self.assertNotIn("first", keys)
        self.assertEqual(json.loads(self.creds.read_text())["refresh_token"], "first")

    def test_store_lookup_sends_no_empty_scope_and_tokens_are_kept_per_scope(self):
        replies = [Reply({"access_token": "loc", "expires_in": 1800}), Reply({"data": [{"locationId": "014", "name": "Kroger", "address": {"addressLine1": "1 Main"}}]}),
                   Reply({"access_token": "prod", "expires_in": 1800}), Reply({"data": []})]
        with mock.patch.object(self.k.urllib.request, "urlopen", side_effect=replies) as urlopen:
            self.assertEqual(self.k.locations("90210")[0]["id"], "014")
            self.k.search("eggs")
        self.assertNotIn("scope", urlopen.call_args_list[0][0][0].data.decode())
        self.assertIn("scope=product.compact", urlopen.call_args_list[2][0][0].data.decode())
        self.assertEqual(urlopen.call_args_list[3][0][0].headers["Authorization"], "Bearer prod")

    def test_credentials_saved_by_windows_notepad_still_load(self):
        self.creds.write_bytes(b"\xef\xbb\xbf" + self.creds.read_bytes())
        self.assertEqual(load("martha_kroger", self.dir).C["client_id"], "test-app")

    @unittest.skipIf(os.name == "nt", "file modes are a POSIX matter")
    def test_saved_credentials_are_readable_only_by_their_owner(self):
        self.k._save()
        self.assertEqual(self.creds.stat().st_mode & 0o777, 0o600)

    def test_a_failed_save_keeps_the_new_token_beside_the_old_file(self):
        real_replace = os.replace
        def refuse(src, dst):
            if dst == str(self.creds): raise PermissionError("locked by another program")
            return real_replace(src, dst)
        self.k.C["refresh_token"] = "rotated"
        with mock.patch.object(self.k.os, "replace", side_effect=refuse):
            self.k._save()
        self.assertEqual(json.loads(Path(str(self.creds) + ".new").read_text())["refresh_token"], "rotated")

    def test_command_line_without_a_command_prints_usage_and_calls_nobody(self):
        code, out = run_cli("martha_kroger", self.dir)
        self.assertEqual(code, 2); self.assertIn("usage", out.lower())
        code, out = run_cli("martha_kroger", self.dir, "stores")
        self.assertEqual(code, 2); self.assertIn("usage", out.lower())


class KrogerUploadedKeyTests(unittest.TestCase):
    """A Kroger key file attached to a claude.ai chat or Cowork session. claude.ai can add a prefix
    to an attached file's name (seen with Martha's voice key from a phone, 2026-11-19), and the
    search wanted the exact name."""
    def setUp(self):
        home = Path(tempfile.mkdtemp())            # a fake home: never the real ~/.martha
        self.dir = Path(tempfile.mkdtemp())        # MARTHA_DIR, with a key so the module loads
        (self.dir / "kroger-credentials.json").write_text(json.dumps({
            "client_id": "test-app", "client_secret": "s3cret", "refresh_token": "r", "store_location_id": "01234567"}))
        self.k = load("martha_kroger", self.dir)
        self.empty = Path(tempfile.mkdtemp())      # MARTHA_DIR with no key in it
        self.uploads = Path(tempfile.mkdtemp())    # stands in for /mnt/user-data/uploads
        self.env = {"MARTHA_DIR": str(self.empty), "KROGER_CREDS": "", "HOME": str(home), "USERPROFILE": str(home)}

    def put(self, rel):
        p = self.uploads / rel; p.parent.mkdir(parents=True, exist_ok=True); p.write_text("{}"); return str(p)

    def resolve(self, uploads=None):
        with mock.patch.dict(os.environ, self.env),              mock.patch.object(self.k, "UPLOADS", str(uploads or self.uploads)):
            return self.k._resolve()

    def test_a_prefixed_attachment_is_found(self):
        want = self.put("1a2b3c4d-kroger-credentials.json")
        self.assertEqual(self.resolve(), want)

    def test_a_renamed_copy_is_found(self):
        want = self.put("kroger-credentials (1).json")
        self.assertEqual(self.resolve(), want)

    def test_the_exact_name_wins_over_a_prefixed_one(self):
        self.put("aaa-kroger-credentials.json"); want = self.put("sub/kroger-credentials.json")
        self.assertEqual(self.resolve(), want)

    def test_other_files_are_not_taken_for_the_key(self):
        for name in ("voice-credentials.json", "pinterest-credentials.json", "kroger-credentials.txt", "kroger-cart.json"):
            self.put(name)
        with self.assertRaises(SystemExit):
            self.resolve()

    def test_no_uploads_folder_still_says_where_to_look(self):
        with self.assertRaises(SystemExit) as e:
            self.resolve(self.uploads / "not-there")
        self.assertIn("KROGER-SETUP.md", str(e.exception))


class PinterestTests(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        (self.dir / "pinterest-credentials.json").write_text(json.dumps({
            "app_id": "123", "app_secret": "s", "redirect_uri": "http://localhost:8000/callback",
            "access_token": "tok", "access_expires": 10**12, "refresh_token": "r", "board_name": "Dinners"}))
        self.p = load("martha_pinterest", self.dir)

    def test_pins_since_a_date_newest_first(self):
        replies = [Reply({"items": [{"id": "b1", "name": "Dinners"}], "bookmark": None}),
                   Reply({"items": [{"id": "1", "created_at": "2026-01-01T00:00:00", "title": "Old"},
                                    {"id": "2", "created_at": "2026-03-01T00:00:00", "title": "Soup", "description": "double it"},
                                    {"id": "3", "created_at": "2026-02-01T00:00:00", "title": "Tacos"}], "bookmark": None})]
        with mock.patch.object(self.p.urllib.request, "urlopen", side_effect=replies):
            out = self.p.pins(since="2026-01-15")
        self.assertEqual([p["id"] for p in out], ["2", "3"]); self.assertEqual(out[0]["note"], "double it")

    def test_code_exchange_returns_key_names_only_and_saves_the_tokens(self):
        reply = Reply({"access_token": "acc-secret", "refresh_token": "ref-secret", "expires_in": 100})
        with mock.patch.object(self.p.urllib.request, "urlopen", return_value=reply):
            keys = self.p.exchange_code("http://localhost:8000/callback?code=xyz&state=martha-pinterest")
        self.assertNotIn("acc-secret", str(keys)); self.assertIn("access_token", keys)
        saved = json.loads((self.dir / "pinterest-credentials.json").read_text())
        self.assertEqual(saved["refresh_token"], "ref-secret")

    def test_a_rotated_refresh_token_is_saved(self):
        self.p.C["access_expires"] = 0
        with mock.patch.object(self.p.urllib.request, "urlopen", return_value=Reply({"access_token": "a2", "refresh_token": "r2", "expires_in": 100})):
            self.assertEqual(self.p.access_token(), "a2")
        self.assertEqual(json.loads((self.dir / "pinterest-credentials.json").read_text())["refresh_token"], "r2")

    def test_a_refused_sign_in_says_to_sign_in_again(self):
        self.p.C["access_expires"] = 0
        with mock.patch.object(self.p.urllib.request, "urlopen", side_effect=[http_error(400, b'{"code": 2, "message": "invalid_grant r"}')]):
            with self.assertRaises(SystemExit) as e:
                self.p.access_token()
        self.assertIn("auth", str(e.exception)); self.assertNotIn('"s"', str(e.exception))

    def test_pages_of_pins_are_all_read(self):
        replies = [Reply({"items": [{"id": "b1", "name": "Dinners"}], "bookmark": None}),
                   Reply({"items": [{"id": "1", "created_at": "2026-03-01T00:00:00"}], "bookmark": "next"}),
                   Reply({"items": [{"id": "2", "created_at": "2026-02-01T00:00:00"}], "bookmark": None})]
        with mock.patch.object(self.p.urllib.request, "urlopen", side_effect=replies):
            self.assertEqual([p["id"] for p in self.p.pins()], ["1", "2"])

    def test_command_line_without_a_command_prints_usage(self):
        code, out = run_cli("martha_pinterest", self.dir)
        self.assertEqual(code, 2); self.assertIn("usage", out.lower())


if __name__ == "__main__":
    unittest.main()
