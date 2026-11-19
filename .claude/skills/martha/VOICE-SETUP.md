# Voice notes setup (optional)

With voice notes, anyone in the house can tell Martha things between runs, through an Alexa skill
of your own called "Martha Meal":

- "Alexa, tell Martha Meal we're out of ground cumin."
- "Alexa, tell Martha Meal Sam really liked the chili tonight."
- "Alexa, use Martha Meal to note that we'd like more sheet-pan dinners."
- Or "Alexa, open Martha Meal", and say the note when it asks.

Keep the name singular. In testing on Alexa+ (2026-11-16), "tell Martha Meals ..." was taken as
a text message to a contact called Martha Meals, while "tell Martha Meal ..." and "use Martha
Meal to ..." reached the skill. If "tell" ever starts a message instead, say "use Martha Meal
to ...".

Alexa says back what it understood. The note waits in a small table in your own AWS account until
the next Martha run, which shows every note with how it was filed (a rating, this week's shopping
list, a taste to lean toward), asks about anything unclear, and deletes each note once it is
filed. Without this setup Martha works exactly as before.

**You need:** an Echo or the Alexa app on the household's Amazon account, an AWS account, an
Anthropic API key, Python 3.9 or newer and Node.js 22 or newer on this computer, and the steps
below. The commands run from the folder you cloned Martha into. They say `python`; on a Mac or
Linux type `python3`.

**What it costs:** about $0 a month on AWS at household use (a $1 budget alert emails you if
that's ever wrong), and about 15 cents a month of Anthropic API use for the read-back at ten
notes a day.

## 1. Make the Alexa skill "Martha Meal"

The skill is private to your household: it is never published, so only devices on your Amazon
account can use it.

1. Sign in at [developer.amazon.com](https://developer.amazon.com) with the household's Amazon
   account. If it asks to register, choose an individual (sole proprietor) account; no business is
   needed, and nothing is published.
2. Install the Alexa command-line tool and sign it in. When it asks whether to link an AWS
   account, answer **No**.

   ```
   npm install -g ask-cli
   ask configure
   ```

3. Create the skill and give it its words. The first command prints the skill id
   (`amzn1.ask.skill....`); put it in the second, and keep it for step 2.

   ```
   ask smapi create-skill-for-vendor --manifest file:alexa/skill-package/skill.json
   ask smapi set-interaction-model --skill-id <skill id> --stage development --locale en-US --interaction-model file:alexa/skill-package/interactionModels/custom/en-US.json
   ```

## 2. The AWS pieces: the account and the setup script

1. **The account.** Sign up at [portal.aws.amazon.com/billing/signup](https://portal.aws.amazon.com/billing/signup)
   and choose the **Paid plan**: the Free plan closes the account after six months and deletes it
   90 days later, and voice notes would stop with it. Everything here stays inside the amounts AWS
   never charges for at household use.
   AWS's newer sign-up can instead make a "project" account, which builds in one region only,
   chosen from your address and fixed (Ohio, us-east-2, for one household in November 2026). The
   setup script finds that region by itself; nothing to choose. If the account shows **Upgrade
   plan** in the console, upgrade it: that is the Paid plan.
2. **The AWS command-line tool.** On Windows: `winget install Amazon.AWSCLI`. On a Mac or Linux,
   AWS's installer from [aws.amazon.com/cli](https://aws.amazon.com/cli/).
3. **The setup script.** It walks you through the rest in six short stages, and is safe to re-run.
   On Windows, run it in Git Bash (or `"C:\Program Files\Git\bin\bash.exe"` from PowerShell); on a
   Mac or Linux, in Terminal:

   ```
   bash alexa/setup/voice-setup.sh <skill id>
   ```

   | Stage | What happens |
   |---|---|
   | 1. AWS account | Confirms you have one (above). |
   | 2. Sign-in | `aws login` opens the browser; this computer gets a temporary sign-in, never a permanent admin key. |
   | 3. Build | Makes the notes table, the skill's back end, a key user for this computer that can only read and delete notes and write the week's context record, and a $1 monthly budget alert to the email you give (`alexa/infra/martha-voice.yaml`). |
   | 4. Anthropic key | Step 4 below. |
   | 5. This computer's key | Makes the computer's key and saves it straight into `voice-credentials.json` (step 6) without showing it. |
   | 6. Connect | Uploads the skill's code and points the Martha Meal skill at it (step 3). |

## 3. What "connect" did

The skill you made in step 1 now sends each note to the back end in your AWS account. The back
end asks Claude what the note means, saves it to the notes table with the words Alexa heard, and
tells Alexa what to say back. If Claude doesn't answer in time, the note is saved as said and
Alexa answers "Got it, I'll pass on: ..."; Martha asks about it at the next run. Nothing has to be
done here unless the setup script's last stage failed: then run the script again.

## 4. The Anthropic API key for the read-back

Stage 4 of the setup script opens [console.anthropic.com](https://console.anthropic.com/settings/keys).
Add a small prepaid amount under Billing (five dollars lasts a long time here) and leave
auto-reload off, so the bill can't grow on its own. Create a key named `martha-meal`, and paste it
into the script, where it is hidden as you type. The script saves it, encrypted, in your AWS
account where only the skill's back end can read it. To replace the key later, run the script
again; at the other stages, press Enter to keep what is there.

## 5. Leave a first note

Say: "Alexa, tell Martha Meal we're out of ground cumin." Alexa answers with what she
understood, such as "Got it: ground cumin goes on next week's list." Then check that it arrived:

```
python .claude/skills/martha/scripts/martha_voice.py notes
```

| Alexa says | It means |
|---|---|
| What she understood | Everything works. |
| "Got it, I'll pass on: ..." | The note is saved, but the read-back isn't working: re-run the script and redo stage 4. |
| She starts a text message | Say "Alexa, use Martha Meal to ..." instead (see the top of this page). |
| "There was a problem with the requested skill's response" | The skill and the back end aren't connected: re-run the script. |

## 6. Give this computer its key

The setup script (stage 5) already did this on the computer that ran it. Do it by hand on another
computer, or after replacing the key: in the AWS console, open IAM > Users > `martha-voice-pc` >
Security credentials > Create access key (choose "Application running outside AWS"). That gives
an access key id (20 capital letters and digits, starting with `AKIA`) and a secret access key.
This key can only read and delete notes and write the week's context record (below); it can't
reach anything else in the account.

Run this in a terminal on this computer (PowerShell, or Terminal on a Mac), from the folder you
cloned Martha into. Type the secret there, never into a chat with Claude: Martha never asks for
it.

```
python .claude/skills/martha/scripts/martha_voice.py setup
```

(If you copied the skill to `~/.claude/skills/martha`, use that path instead.) It asks four
things:

| It asks | You give it |
|---|---|
| AWS access key id | The access key id from the AWS console (above) |
| AWS secret access key (hidden) | The secret from the AWS console. Nothing shows as you paste it; that is expected. Press Enter. |
| Region [us-east-1] | The region the setup script said it built in ("Building in region ..."); Enter if us-east-1 |
| Table [martha-voice] | Enter, unless the table was given another name |

It saves `voice-credentials.json` in your profile folder, beside `martha-config.md` (`PROFILE.md`
says where that is; on macOS and Linux only you can read the file), then asks AWS whether the key
works. When it does, you see:

```
Saved voice-credentials.json in <your profile folder>. Checking it with AWS...
Voice notes work: the key, the region and the table answered.
```

Check again any time:

```
python .claude/skills/martha/scripts/martha_voice.py check
```

If it says something else, the first words tell you what to do:

| It says | Do this |
|---|---|
| voice-credentials.json not found | Run `setup` (above). |
| AWS didn't accept this computer's key | The key id or secret was mistyped: run `setup` again. |
| this computer's key lacks permission | That is a different AWS key, perhaps your own: run `setup` again with the key made for `martha-voice-pc` (above). |
| there is no table ... in ... | The region or table name doesn't match step 2: run `setup` again. |
| AWS says this computer's clock is wrong | Set the computer's clock, then `check`. |
| AWS didn't answer, or AWS is busy or failing | No internet, or AWS is having trouble. Martha plans without the notes this time; they wait for the next run. |

The file holds the secret. Keep it in the profile folder only: never in a repo, a chat or an
email. `MARTHA_VOICE_CREDS` can point at the file instead (a full path), the way `KROGER_CREDS`
does for Kroger. Martha never prints the file.

### A new key for this computer

When the key file is lost or broken (`check` says the key is wrong), the script makes a fresh key
and replaces the file in place, with no console clicking:

```
bash alexa/setup/voice-key.sh computer
```

It signs this computer in to AWS if needed (a browser window opens), finds the region the build
is in, asks AWS's own policy simulator what `martha-voice-pc` may do and stops if that is anything
other than reading and deleting notes and writing the context record, then saves the key and runs
`check`. Then it offers to delete the computer's older key, which nothing here can use any more.

## Reading notes from a phone (optional)

The computer's key stays on the computer. For a phone, make a second key that can **only list
notes**: it can't delete one, file one or write anything, and cancelling it doesn't touch the
computer's key. Run, on the computer:

```
bash alexa/setup/voice-key.sh phone
```

It adds a user `martha-voice-phone` to the build, has AWS's policy simulator confirm that reading
is the only thing it may do, makes its key, and saves it as
`~/.martha/phone-key/voice-credentials.json` (marked `"read_only": true`). Then:

1. On the computer, at claude.ai, start a new chat (call it "Martha notes") and attach that file.
2. On the phone, open the same chat in the Claude app whenever you want the notes and ask: *Clone
   the Martha repo and run `python3 .claude/skills/martha/scripts/martha_voice.py notes`.* Martha
   finds an attached `voice-credentials.json` by itself.

Notes read this way stay in the table: Martha files and deletes them at the next run on the
computer. The worst a stolen phone key allows is reading the household's waiting notes. To cancel
it: AWS console > IAM > Users > `martha-voice-phone` > Security credentials > Deactivate (or
Delete) the key, and delete the chat. Not yet tried: whether a claude.ai **project's** files reach
the phone's code the way a chat attachment does, so the chat is the way that is expected to work.

## 7. Turn voice notes on

Tell Martha "turn voice notes on", or set this row in the Outputs section of `martha-config.md`:

```
| Voice notes (optional; needs VOICE-SETUP.md) | on |
```

**What you see at the next run.** Martha checks the key first. The opening message then starts
with the notes left since the last run, one line each: what was said, word for word, and how
Martha filed it, or a question when a note was unclear. The run's usual questions follow, and one
reply answers both:

```
Voice notes since last time:
1. "we're out of ground cumin" (Sat): on this week's list.
2. "Sam really liked the chili tonight" (Fri): Turkey Chili rated liked, Sam's words kept.
3. "we'd like more sheet-pan dinners" (Thu): noted as a taste; it tips close calls for six weeks.
4. "the thing from Tuesday was too salty" (Wed): which dinner was that, the tacos or the soup?
5. Did you place last week's order? ...
```

Filed notes are deleted from the table once Martha has saved them; an unclear one stays until you
answer. Things you're out of go into that week's cart or shopping list, and a name Martha doesn't
know ("Nana loved it") gets one question, after which it is remembered. If the row is on but the
check fails, Martha says why in one line, names the step that fixes it, and plans without the
notes.

## What leaves this computer

At the end of each run Martha writes one small record to the table so Alexa can match what you
say: the week's date, this week's meal names, and the household's first names. Nothing else: no
diets, allergies, budget, address or Kroger details. Apart from that record, Martha only reads
notes and deletes the ones it has filed.

## Turning it off

Set the Voice notes row to `off`. Martha stops reading notes; any left in the table stay there,
and Alexa still takes new ones until the skill is switched off too.

## Not yet tested

The signing in `martha_voice.py` is checked against the worked Signature Version 4 example AWS
publishes, and the client is tested offline. It has read a live table (`check` and `notes`,
2026-11-19). Not yet run live: `done`, `context`, and `voice-key.sh` (either mode).
If a step fails, open an issue with the message it printed (never the credentials file).
