# Voice notes setup (optional)

With voice notes, anyone in the house can tell Martha things between runs, through an Alexa skill
of your own called "Martha Meals":

- "Alexa, use Martha Meals to add ground cumin."
- "Alexa, use Martha Meals to note that Sam really liked the chili tonight."
- "Alexa, use Martha Meals to note that we'd like more sheet-pan dinners."
- Or "Alexa, open Martha Meals", and say the note when it asks.

Say "use Martha Meals to", not "tell Martha Meals": with Alexa+, "tell" plus a name that sounds
like a person starts a text message to a contact instead of reaching the skill (tested
2026-11-16).

Alexa says back what it understood. The note waits in a small table in your own AWS account until
the next Martha run, which shows every note with how it was filed (a rating, this week's shopping
list, a taste to lean toward), asks about anything unclear, and deletes each note once it is
filed. Without this setup Martha works exactly as before.

**You need:** an Echo or the Alexa app on the household's Amazon account, an AWS account, an
Anthropic API key, Python 3.9 or newer on this computer, and the steps below. The commands say
`python`; on a Mac or Linux type `python3`.

## 1. Create the household's AWS account

Written in the next phase.

## 2. Deploy the AWS pieces: the notes table, the note-taker and this computer's key

Written in the next phase.

## 3. Make the Alexa skill "Martha Meals"

Written in the next phase.

## 4. Give the note-taker an Anthropic API key

Written in the next phase.

## 5. Leave a first note

Written in the next phase.

## 6. Give this computer its key

Step 2 made an access key for this computer: an access key id (20 capital letters and digits,
starting with `AKIA`) and a secret access key. This key can only read and delete notes and write
the week's context record (below); it can't reach anything else in the account.

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
| AWS access key id | The access key id from step 2 |
| AWS secret access key (hidden) | The secret from step 2. Nothing shows as you paste it; that is expected. Press Enter. |
| Region [us-east-1] | Enter, unless step 2 put the table in another region |
| Table [martha-voice] | Enter, unless step 2 gave the table another name |

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
| this computer's key lacks permission | That is a different AWS key, perhaps your own: run `setup` again with the key made for this computer in step 2. |
| there is no table ... in ... | The region or table name doesn't match step 2: run `setup` again. |
| AWS says this computer's clock is wrong | Set the computer's clock, then `check`. |
| AWS didn't answer, or AWS is busy or failing | No internet, or AWS is having trouble. Martha plans without the notes this time; they wait for the next run. |

The file holds the secret. Keep it in the profile folder only: never in a repo, a chat or an
email. `MARTHA_VOICE_CREDS` can point at the file instead (a full path), the way `KROGER_CREDS`
does for Kroger. Martha never prints the file.

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
publishes, and the client is tested offline, but it has not yet been run against a live table.
If a step fails, open an issue with the message it printed (never the credentials file).
