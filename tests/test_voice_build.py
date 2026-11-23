"""Offline tests for the AWS build that voice notes and the shared household use: the CloudFormation
template (alexa/infra/martha-voice.yaml) and the two setup scripts (alexa/setup/). Nothing here
reaches AWS, Amazon or Kroger.

Three kinds of check:
  1. The template, read as text (there is no YAML library in the standard library): what exists
     only for the Alexa skill carries the HasAlexaSkill condition, and what sharing a profile needs
     (the table, the key users, the budget alert) never does.
  2. The scripts, read as text: --sharing-only is parsed, the Alexa-only stages sit inside its
     guard, and an empty skill id is never handed to AWS.
  3. The scripts, run for real in bash against stand-in programs. A folder of small scripts named
     aws, ask, node, npm, python3 and so on is put first on PATH; each writes down how it was
     called and answers the way the real tool would. Before any run the test asks bash which
     programs it would find under those names, and skips unless every one is a stand-in, so a real
     tool can never be started. HOME and every file the scripts write point into a temporary folder.

These prove what the scripts ask AWS for. They do not prove AWS accepts it: neither the
sharing-only build nor a key run against one has been run against a live account.
Run from the repo root:  python -m unittest discover -s tests -v
"""
import os, re, shutil, subprocess, tempfile, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / "alexa" / "infra" / "martha-voice.yaml"
SETUP = ROOT / "alexa" / "setup" / "voice-setup.sh"
KEY = ROOT / "alexa" / "setup" / "voice-key.sh"
CONDITION = "HasAlexaSkill"
# A made-up skill id of the right shape, and a second one to tell "from the build" from "from the file".
SKILL = "amzn1.ask.skill.0a1b2c3d-1111-2222-3333-444455556666"
OTHER_SKILL = "amzn1.ask.skill.9f8e7d6c-aaaa-bbbb-cccc-ddddeeeeffff"
EMAIL = "sam@example.com"

# Every resource the template has, by the name CloudFormation knows it by. Renaming one makes
# CloudFormation delete it and make a new one in a household's account, so a rename must be meant.
RESOURCES = {
    "NotesTable": "AWS::DynamoDB::Table",
    "SkillRole": "AWS::IAM::Role",
    "SkillFunction": "AWS::Lambda::Function",
    "AlexaInvoke": "AWS::Lambda::Permission",
    "PcUser": "AWS::IAM::User",
    "Pc2User": "AWS::IAM::User",
    "PhoneUser": "AWS::IAM::User",
    "MonthlyBudget": "AWS::Budgets::Budget",
}
# What sharing a profile needs, and so what a build without a skill id must still make.
ALWAYS_BUILT = {"AWS::DynamoDB::Table", "AWS::IAM::User", "AWS::Budgets::Budget"}
# Parameters that exist only for the skill: anything that uses one is the skill's.
SKILL_PARAMETERS = {"AlexaSkillId", "KeyParameter"}


# ---- Reading the template as text ----------------------------------------------------------------

def _blocks(lines, indent):
    """{name: its lines} for every `name:` key at exactly `indent` spaces. Comment lines are dropped."""
    out, name = {}, None
    key = re.compile(r" {%d}([A-Za-z][A-Za-z0-9]*):(?:\s|$)" % indent)
    for line in lines:
        if line.strip().startswith("#"):
            continue
        m = key.match(line)
        if m:
            name = m.group(1)
            out[name] = [line]
        elif name is not None:
            out[name].append(line)
    return out


def _attr(block, name, indent=4):
    """The value of `name:` written at exactly `indent` spaces inside a block, or None."""
    for line in block[1:]:
        m = re.match(r" {%d}%s:\s*(.*)$" % (indent, re.escape(name)), line)
        if m:
            return m.group(1).strip()
    return None


def _refs(block):
    """Every name a block points at: !Ref X, !GetAtt X.y and ${X} inside !Sub."""
    text = "\n".join(block[1:])
    names = set(re.findall(r"!Ref\s+([A-Za-z][A-Za-z0-9]*)", text))
    names |= set(re.findall(r"!GetAtt\s+([A-Za-z][A-Za-z0-9]*)\.", text))
    names |= set(re.findall(r"\$\{([A-Za-z][A-Za-z0-9]*)[.}]", text))
    return names


class Template(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        lines = TEMPLATE.read_text(encoding="utf-8").splitlines()
        top = _blocks(lines, 0)
        cls.top = top
        cls.parameters = _blocks(top["Parameters"][1:], 2)
        cls.conditions = _blocks(top.get("Conditions", [""])[1:], 2)
        cls.resources = _blocks(top["Resources"][1:], 2)
        cls.outputs = _blocks(top["Outputs"][1:], 2)
        # What exists only for the skill: every kind of resource sharing doesn't need, and
        # anything that points at a skill-only parameter or at another skill-only resource.
        skill = {n for n, b in cls.resources.items() if _attr(b, "Type") not in ALWAYS_BUILT}
        while True:
            more = {n for n, b in cls.resources.items()
                    if n not in skill and _refs(b) & (skill | SKILL_PARAMETERS)}
            if not more:
                break
            skill |= more
        cls.skill_only = skill

    def test_the_reader_sees_the_whole_template(self):
        self.assertEqual({n: _attr(b, "Type") for n, b in self.resources.items()}, RESOURCES)
        self.assertEqual(set(self.parameters), {"AlexaSkillId", "BudgetEmail", "TableName", "KeyParameter"})
        self.assertEqual(set(self.outputs),
                         {"FunctionArn", "TableName", "PcUserName", "Pc2UserName", "PhoneUserName", "KeyParameter"})

    def test_the_skill_id_may_be_left_empty(self):
        skill_id = self.parameters["AlexaSkillId"]
        self.assertEqual(_attr(skill_id, "Default"), "''")
        pattern = _attr(skill_id, "AllowedPattern")
        self.assertTrue(pattern.startswith("'") and pattern.endswith("'"), pattern)
        allowed = re.compile(pattern[1:-1])
        self.assertTrue(allowed.fullmatch(""))
        self.assertTrue(allowed.fullmatch(SKILL))
        for junk in ("none", "amzn1.ask.skill.", "amzn1.ask.skill.XYZ", " ", SKILL + " "):
            self.assertIsNone(allowed.fullmatch(junk), junk)
        # The condition is "a skill id was given", and it is the template's only one.
        self.assertEqual(set(self.conditions), {CONDITION})
        self.assertEqual(self.conditions[CONDITION][0].strip(),
                         CONDITION + ": !Not [!Equals [!Ref AlexaSkillId, '']]")

    def test_everything_only_the_skill_uses_has_the_condition(self):
        self.assertEqual(self.skill_only, {"SkillRole", "SkillFunction", "AlexaInvoke"})
        for name in sorted(self.skill_only):
            self.assertEqual(_attr(self.resources[name], "Condition"), CONDITION,
                             f"{name} exists only for the Alexa skill, so it needs Condition: {CONDITION}")

    def test_the_table_the_key_users_and_the_budget_have_no_condition(self):
        always = sorted(set(self.resources) - self.skill_only)
        self.assertEqual(always, sorted(["NotesTable", "PcUser", "Pc2User", "PhoneUser", "MonthlyBudget"]))
        for name in always:
            block = self.resources[name]
            self.assertIsNone(_attr(block, "Condition"),
                              f"{name} is needed for sharing a profile: it must be built with or without a skill id")
            # It can't lean on anything that a sharing-only build leaves out.
            self.assertEqual(_refs(block) & (self.skill_only | SKILL_PARAMETERS), set(), name)

    def test_outputs_follow_the_same_rule(self):
        for name, block in self.outputs.items():
            skill_only = bool(_refs(block) & (self.skill_only | SKILL_PARAMETERS))
            self.assertEqual(_attr(block, "Condition"), CONDITION if skill_only else None, name)
        self.assertEqual({n for n, b in self.outputs.items() if _attr(b, "Condition")}, {"FunctionArn", "KeyParameter"})

    def test_the_names_aws_knows_things_by_are_unchanged(self):
        # Changing any of these makes CloudFormation replace the thing in an account built earlier.
        text = TEMPLATE.read_text(encoding="utf-8")
        for line in ("TableName: !Ref TableName", "Default: martha-voice", "FunctionName: martha-meal-skill",
                     "UserName: martha-voice-pc", "UserName: martha-voice-pc-2", "UserName: martha-voice-phone",
                     "BudgetName: martha-voice-monthly", "SKILL_ID: !Ref AlexaSkillId",
                     "EventSourceToken: !Ref AlexaSkillId"):
            self.assertEqual(len(re.findall(r"^\s*" + re.escape(line) + r"\s*$", text, re.M)), 1, line)


# ---- Reading the scripts as text -----------------------------------------------------------------

def _stage_lines():
    """voice-setup.sh below its STAGES marker, as (line number, line)."""
    lines = SETUP.read_text(encoding="utf-8").splitlines()
    start = next(i for i, line in enumerate(lines) if line.startswith("# STAGES:"))
    return [(i + 1, line) for i, line in enumerate(lines)][start:]


def _guarded():
    """The line numbers that sit inside an `if [[ -z "$SHARING_ONLY" ]]; then ... fi` block."""
    inside, depth, guards = set(), 0, []
    for number, line in _stage_lines():
        s = line.strip()
        if guards:
            inside.add(number)
        if re.match(r"if\s", s) and not re.search(r";\s*fi\b", s):
            depth += 1
            if s == 'if [[ -z "$SHARING_ONLY" ]]; then':
                guards.append(depth)
        elif re.match(r"fi\b", s):
            if guards and guards[-1] == depth:
                guards.pop()
            depth -= 1
    assert depth == 0 and not guards, "voice-setup.sh's if/fi blocks don't pair up the way this reader expects"
    return inside


class ScriptText(unittest.TestCase):
    def test_sharing_only_is_an_option_the_script_parses(self):
        text = SETUP.read_text(encoding="utf-8")
        self.assertRegex(text, r'(?m)^\s*--sharing-only\)\s*SHARING_ONLY=1\s*;;')
        self.assertIn("bash alexa/setup/voice-setup.sh --sharing-only", text)
        # The option is read before anything is looked for or written.
        self.assertLess(text.index("--sharing-only) SHARING_ONLY=1"), text.index("AWS=$(_find aws"))
        self.assertLess(text.index("--sharing-only) SHARING_ONLY=1"), text.index('mkdir -p "$(dirname "$ENV_FILE")"'))

    def test_what_exists_only_for_alexa_is_inside_the_sharing_only_guard(self):
        guarded = _guarded()
        alexa_only = ("ASK=$(_find ask", "NODE=$(_find node", "NPM=$(_find npm",
                      'stage "The Anthropic API key', "console.anthropic.com", "ssm put-parameter", "ssm get-parameter",
                      'stage "Upload the skill', '"$NPM" ci', "lambda update-function-code", "lambda wait",
                      '"$NODE" -e', '"$ASK" smapi update-skill-manifest', '"$ASK" smapi set-skill-enablement',
                      "s=$(skill_status manifest)", "OutputKey=='FunctionArn'].OutputValue\")")
        found = {needle: [n for n, line in _stage_lines() if needle in line] for needle in alexa_only}
        for needle, numbers in found.items():
            self.assertTrue(numbers, f"{needle!r} is no longer in voice-setup.sh: update this test")
            for n in numbers:
                self.assertIn(n, guarded, f"line {n} ({needle!r}) runs in a sharing-only build")
        # And what sharing needs is outside it.
        for needle in ("cloudformation deploy", "iam create-access-key", "setup --from-env", '"$AWS" login'):
            numbers = [n for n, line in _stage_lines() if needle in line]
            self.assertTrue(numbers, needle)
            for n in numbers:
                self.assertNotIn(n, guarded, f"line {n} ({needle!r}) is skipped in a sharing-only build")

    def test_an_empty_skill_id_is_never_handed_to_aws(self):
        for script in (SETUP, KEY):
            lines = [line.strip() for line in script.read_text(encoding="utf-8").splitlines() if "AlexaSkillId=" in line]
            self.assertEqual(lines, ['if [[ -n "$SKILL_ID" ]]; then OVERRIDES+=("AlexaSkillId=$SKILL_ID"); fi'], script.name)

    def test_the_key_script_takes_the_skill_id_from_the_build_not_from_a_file_it_requires(self):
        text = KEY.read_text(encoding="utf-8")
        self.assertIn("Parameters[?ParameterKey=='AlexaSkillId'].ParameterValue", text)
        self.assertNotIn("missing the skill id", text)

    def test_the_scripts_keep_unix_line_endings(self):
        for script in (SETUP, KEY):
            self.assertNotIn(b"\r", script.read_bytes(), script.name)


# ---- Running the scripts against stand-in programs -----------------------------------------------

def _find_bash():
    """A real bash. On Windows that is Git's: the `bash` in System32 is the WSL launcher."""
    found = []
    if os.name == "nt":
        on_path = shutil.which("bash")
        if on_path and not re.search(r"system32|windowsapps", on_path, re.I):
            found.append(on_path)
        for base in (os.environ.get("ProgramFiles"), os.environ.get("ProgramW6432"),
                     os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs")):
            if base:
                found += [os.path.join(base, "Git", "usr", "bin", "bash.exe"), os.path.join(base, "Git", "bin", "bash.exe")]
    else:
        found = [shutil.which("bash"), "/bin/bash", "/usr/bin/bash"]
    return next((p for p in found if p and os.path.isfile(p)), None)


BASH = _find_bash()

STAND_IN_AWS = r"""#!/usr/bin/env bash
# A stand-in for the AWS command-line tool. It never reaches AWS: it writes down how it was called
# and answers from $STUB_STACK (none, sharing, alexa, unreadable or broken).
printf 'aws %s\n' "$*" >> "$STUB_LOG"
args=" $* "
case "$args" in
  *" cloudformation describe-stacks "*)
    case "$STUB_STACK" in
      none)   echo "An error occurred (ValidationError) when calling the DescribeStacks operation: Stack with id martha-voice does not exist" >&2; exit 254 ;;
      broken) echo "Could not connect to the endpoint URL" >&2; exit 255 ;;
    esac
    case "$args" in
      *AlexaSkillId*)
        case "$STUB_STACK" in alexa) echo "$STUB_SKILL" ;; sharing) echo "" ;; *) echo None ;; esac ;;
      *FunctionArn*)
        case "$STUB_STACK" in sharing) echo None ;; *) echo "arn:aws:lambda:us-east-2:123456789012:function:martha-meal-skill" ;; esac ;;
      *) echo martha-voice ;;
    esac ;;
  *" sts get-caller-identity "*) echo 123456789012 ;;
  *" iam list-access-keys "*) case "$args" in *"length("*) echo 0 ;; esac ;;
  *" iam create-access-key "*) printf 'AKIAIOSFODNN7EXAMPLE\twJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY\n' ;;
  *" iam get-user "*)
    user=$(printf '%s' "$args" | sed 's/.* --user-name \([^ ]*\) .*/\1/')
    echo "arn:aws:iam::123456789012:user/$user" ;;
  *" dynamodb describe-table "*) echo "arn:aws:dynamodb:us-east-2:123456789012:table/martha-voice" ;;
  *" iam simulate-principal-policy "*)
    kind=$(printf '%s' "$args" | grep -o 'ContextKeyValues=[a-z]*,ContextKeyType=stringList' | cut -d= -f2 | cut -d, -f1)
    may="note:Query note:DeleteItem context:PutItem household:GetItem household:Query household:PutItem"
    case "$args" in *martha-voice-phone*) may="note:Query household:GetItem household:Query" ;; esac
    for action in Query GetItem DeleteItem PutItem UpdateItem Scan DeleteTable; do
      verdict=implicitDeny
      case " $may " in *" $kind:$action "*) verdict=allowed ;; esac
      printf 'dynamodb:%s\t%s\n' "$action" "$verdict"
    done ;;
esac
exit 0
"""

STAND_IN_ASK = r"""#!/usr/bin/env bash
# A stand-in for the Alexa command-line tool. It never reaches Amazon.
printf 'ask %s\n' "$*" >> "$STUB_LOG"
case " $* " in *" get-skill-status "*) echo '{"manifest": {"lastUpdateRequest": {"status": "SUCCEEDED"}}}' ;; esac
exit 0
"""

STAND_IN_OTHER = r"""#!/usr/bin/env bash
# A stand-in for %s: it writes down how it was called and does nothing.
printf '%s %%s\n' "$*" >> "$STUB_LOG"
exit 0
"""

CORE = ("aws", "python3", "wslview", "sleep")   # what a sharing-only run may start
ALEXA = ("ask", "node", "npm", "zip")           # what only the Alexa stages start


@unittest.skipUnless(BASH, "no bash here (on Windows, Git for Windows provides one)")
class ScriptRuns(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(prefix="martha-stand-ins-")
        cls.addClassCleanup(cls.tmp.cleanup)
        base = Path(cls.tmp.name)
        cls.core, cls.alexa = base / "core", base / "alexa"
        for folder, names in ((cls.core, CORE), (cls.alexa, ALEXA)):
            folder.mkdir()
            for name in names:
                body = {"aws": STAND_IN_AWS, "ask": STAND_IN_ASK}.get(name) or STAND_IN_OTHER % (name, name)
                path = folder / name
                path.write_bytes(body.encode("utf-8"))
                path.chmod(0o755)
        # Git's bash keeps its everyday tools (grep, mktemp, cygpath) beside itself or in usr/bin.
        tools = [str(Path(BASH).parent)]
        if os.name == "nt":
            tools.append(str(Path(BASH).parent.parent / "usr" / "bin"))
        else:
            tools += ["/usr/bin", "/bin"]
        cls.tools = [t for t in dict.fromkeys(tools) if os.path.isdir(t)]
        # Which program would bash really start for each name? Unless every answer is a stand-in,
        # nothing below runs: a real aws, ask, npm or python must never be started by a test.
        asked = cls._bash(["-c", 'for n in "$@"; do type -P "$n" || echo "(none)"; done', "which", *CORE, *ALEXA],
                          cls._env(alexa=True))
        answers = asked.stdout.split("\n")[:len(CORE + ALEXA)]
        stand_ins = Path(cls.tmp.name).name
        if asked.returncode != 0 or len(answers) != len(CORE + ALEXA) or not all(stand_ins in a for a in answers):
            raise unittest.SkipTest("bash would not start the stand-in programs first, so the scripts are not run: "
                                    + " | ".join(answers))

    @classmethod
    def _env(cls, alexa=False, **more):
        home = Path(cls.tmp.name) / "home"
        home.mkdir(exist_ok=True)
        path = [str(cls.core)] + ([str(cls.alexa)] if alexa else []) + cls.tools
        env = {"PATH": os.pathsep.join(path), "HOME": str(home), "USERPROFILE": str(home),
               "APPDATA": str(home / "AppData" / "Roaming"), "LOCALAPPDATA": str(home / "AppData" / "Local"),
               "TMP": cls.tmp.name, "TEMP": cls.tmp.name, "TMPDIR": cls.tmp.name,
               "AWS_DEFAULT_REGION": "us-east-2", "STUB_SKILL": SKILL, "STUB_STACK": "none",
               "MARTHA_VOICE_PERSON": "Sam", "MARTHA_VOICE_DEVICE": "the kitchen PC"}
        if os.name == "nt":
            env["SystemRoot"] = os.environ.get("SystemRoot", r"C:\Windows")
        env.update(more)
        return env

    @staticmethod
    def _bash(argv, env):
        return subprocess.run([BASH, *argv], env=env, stdin=subprocess.DEVNULL, capture_output=True,
                              encoding="utf-8", errors="replace", timeout=300)

    def run_script(self, script, *args, stack="none", alexa=False, remembered=None):
        """Runs a setup script with nobody at the keyboard (every prompt gets Enter). Returns
        (exit code, what it printed, the stand-ins' record of how they were called, the file the
        script keeps its answers in)."""
        work = Path(tempfile.mkdtemp(dir=self.tmp.name))
        log, answers = work / "calls.log", work / "voice-setup.env"
        log.write_text("", encoding="utf-8")
        if remembered is not None:
            answers.write_bytes("".join(f"{k}={v}\n" for k, v in remembered.items()).encode("utf-8"))
        env = self._env(alexa=alexa, STUB_STACK=stack, STUB_LOG=str(log), MARTHA_VOICE_SETUP_ENV=str(answers),
                        MARTHA_PHONE_KEY_DIR=str(work / "phone-key"), MARTHA_SECOND_KEY_DIR=str(work / "second-key"))
        r = self._bash([script.as_posix(), *args], env)
        calls = log.read_text(encoding="utf-8").splitlines()
        return r.returncode, r.stdout + r.stderr, calls, answers

    def deploys(self, calls):
        return [c for c in calls if " cloudformation deploy " in c]

    def assert_no_alexa_calls(self, calls):
        for c in calls:
            self.assertFalse(c.startswith(("ask ", "node ", "npm ", "zip ")), c)
            self.assertNotIn(" ssm ", c)
            self.assertNotIn(" lambda ", c)

    # voice-setup.sh

    def test_bash_accepts_both_scripts(self):
        for script in (SETUP, KEY):
            r = self._bash(["-n", script.as_posix()], self._env())
            self.assertEqual(r.returncode, 0, r.stderr)

    def test_a_sharing_only_build_asks_aws_for_no_skill_and_skips_the_alexa_stages(self):
        # No ask, node, npm or zip on PATH at all: a household without the Alexa tool can run it.
        code, out, calls, answers = self.run_script(SETUP, "--sharing-only", remembered={"BUDGET_EMAIL": EMAIL})
        self.assertEqual(code, 0, out)
        deploys = self.deploys(calls)
        self.assertEqual(len(deploys), 1, calls)
        self.assertNotIn("AlexaSkillId", deploys[0])
        self.assertIn(f"BudgetEmail={EMAIL}", deploys[0])
        self.assertIn("martha-voice.yaml", deploys[0])
        self.assert_no_alexa_calls(calls)
        self.assertIn("Stage 4/4", out)
        self.assertNotIn("Anthropic", out)
        self.assertNotIn("Alexa now sends", out)
        self.assertIn("voice-key.sh computer2", out)
        # This computer still gets its key, and the shared household is checked with it.
        self.assertTrue(any(" iam create-access-key --user-name martha-voice-pc " in c for c in calls), calls)
        self.assertTrue(any(c.startswith("python3 ") and "martha_voice.py setup --from-env" in c for c in calls), calls)
        self.assertTrue(any(c.startswith("python3 ") and "martha_household.py check" in c for c in calls), calls)
        self.assertNotIn("SKILL_ID", answers.read_text(encoding="utf-8"))
        self.assertNotIn("EXAMPLEKEY", out)  # the stand-in key is never shown either

    def test_sharing_only_on_a_build_that_has_the_skill_keeps_the_skill(self):
        code, out, calls, answers = self.run_script(SETUP, "--sharing-only", stack="alexa",
                                                    remembered={"BUDGET_EMAIL": EMAIL})
        self.assertEqual(code, 0, out)
        deploys = self.deploys(calls)
        self.assertEqual(len(deploys), 1, calls)
        self.assertIn(f"AlexaSkillId={SKILL} ", deploys[0] + " ")
        self.assertIn("stays exactly as it is", out)
        self.assert_no_alexa_calls(calls)
        self.assertIn(f"SKILL_ID={SKILL}", answers.read_text(encoding="utf-8"))

    def test_sharing_only_stops_when_it_cannot_tell_what_is_built(self):
        # A back end exists but its skill id can't be read; or AWS doesn't answer at all.
        for stack in ("unreadable", "broken"):
            code, out, calls, _ = self.run_script(SETUP, "--sharing-only", stack=stack, remembered={"BUDGET_EMAIL": EMAIL})
            self.assertEqual(code, 1, out)
            self.assertEqual(self.deploys(calls), [], stack)
            self.assertIn("nothing was changed", out)
            self.assertFalse(any(" iam create-access-key " in c for c in calls), calls)

    def test_the_usual_run_with_a_skill_id_still_does_all_six_stages(self):
        code, out, calls, answers = self.run_script(SETUP, SKILL, stack="alexa", alexa=True,
                                                    remembered={"BUDGET_EMAIL": EMAIL})
        self.assertEqual(code, 0, out)
        deploys = self.deploys(calls)
        self.assertEqual(len(deploys), 1, calls)
        self.assertTrue(deploys[0].endswith(f"--parameter-overrides AlexaSkillId={SKILL} BudgetEmail={EMAIL}"), deploys[0])
        self.assertIn("Stage 6/6", out)
        for needle in (" ssm get-parameter ", " lambda update-function-code ", " lambda wait function-updated-v2 "):
            self.assertTrue(any(needle in c for c in calls), needle)
        for needle in ("npm ci ", "ask smapi update-skill-manifest ", "ask smapi set-skill-enablement "):
            self.assertTrue(any(c.startswith(needle) for c in calls), needle)
        self.assertIn(f"SKILL_ID={SKILL}", answers.read_text(encoding="utf-8"))
        self.assertFalse(any("martha_household.py" in c for c in calls), calls)

    def test_bad_options_stop_before_anything_is_looked_for_or_written(self):
        for args in (("--sharing-only", SKILL), ("--share",), (SKILL, OTHER_SKILL)):
            code, out, calls, answers = self.run_script(SETUP, *args)
            self.assertEqual(code, 2, out)
            self.assertIn("--sharing-only", out)
            self.assertEqual(calls, [])
            self.assertFalse(answers.exists())

    # voice-key.sh

    def test_every_key_can_be_made_against_a_sharing_only_build(self):
        for who, user in (("computer", "martha-voice-pc"), ("computer2", "martha-voice-pc-2"), ("phone", "martha-voice-phone")):
            code, out, calls, _ = self.run_script(KEY, who, stack="sharing", remembered={"BUDGET_EMAIL": EMAIL})
            self.assertEqual(code, 0, out)
            deploys = self.deploys(calls)
            self.assertEqual(len(deploys), 1, calls)
            self.assertNotIn("AlexaSkillId", deploys[0])
            self.assertIn(f"BudgetEmail={EMAIL}", deploys[0])
            self.assertTrue(any(f" iam create-access-key --user-name {user} " in c for c in calls), calls)
            self.assert_no_alexa_calls(calls)
            self.assertIn("Done.", out)

    def test_a_key_run_passes_on_the_skill_id_the_build_has(self):
        # The file of remembered answers has lost its skill id, or holds another one: the build's stands.
        for remembered in ({"BUDGET_EMAIL": EMAIL}, {"SKILL_ID": OTHER_SKILL, "BUDGET_EMAIL": EMAIL}):
            code, out, calls, _ = self.run_script(KEY, "computer2", stack="alexa", remembered=remembered)
            self.assertEqual(code, 0, out)
            deploys = self.deploys(calls)
            self.assertEqual(len(deploys), 1, calls)
            self.assertTrue(deploys[0].endswith(f"--parameter-overrides AlexaSkillId={SKILL} BudgetEmail={EMAIL}"), deploys[0])

    def test_a_key_run_never_updates_a_build_whose_skill_it_cannot_name(self):
        code, out, calls, _ = self.run_script(KEY, "computer2", stack="unreadable", remembered={"BUDGET_EMAIL": EMAIL})
        self.assertEqual(code, 1, out)
        self.assertEqual(self.deploys(calls), [])
        self.assertIn("nothing was changed", out)
        self.assertFalse(any(" iam create-access-key " in c for c in calls), calls)
        # With the id voice-setup.sh wrote down when it built the back end, it goes ahead with that id.
        code, out, calls, _ = self.run_script(KEY, "computer2", stack="unreadable",
                                              remembered={"SKILL_ID": OTHER_SKILL, "BUDGET_EMAIL": EMAIL})
        self.assertEqual(code, 0, out)
        self.assertIn(f"AlexaSkillId={OTHER_SKILL} ", self.deploys(calls)[0])
        # And when AWS doesn't answer, nothing is changed.
        code, out, calls, _ = self.run_script(KEY, "computer2", stack="broken", remembered={"BUDGET_EMAIL": EMAIL})
        self.assertEqual(code, 1, out)
        self.assertEqual(self.deploys(calls), [])


if __name__ == "__main__":
    unittest.main()
