# Your profile

Martha keeps everything about your household in one folder, your **profile folder**. It never
goes into the Martha repository.

| File | What it holds |
|---|---|
| `martha-config.md` | Who eats what, the weekly slate, your store, budget and standing order. Written by the first-run questions; edit it directly any time. |
| `martha-memory.json` | Every recipe Martha has planned, your ratings and past weeks. |
| `kroger-credentials.json` | Your Kroger app and sign-in token (`KROGER-SETUP.md`). A secret. |
| `pinterest-credentials.json` | Optional (`PINTEREST-SETUP.md`). |
| `voice-credentials.json` | Optional: this computer's AWS key for voice notes, a shared profile (below), or both (`VOICE-SETUP.md`). A secret. |
| `outputs/` | The weekly plans, one file per week. |
| `.household/` | Only when two people share the profile (below): what this computer last synced. |

## Where it lives: two choices

Martha's first run asks which you want.

### This computer only

The folder is `~/.martha` (on Windows `C:\Users\<you>\.martha`). It stays private, and only
Claude on this computer can use it. Back it up yourself if you want a copy.

### A cloud folder you already sync

A folder inside OneDrive, iCloud Drive, Dropbox or Google Drive, for example `OneDrive/Martha`.
Your other computers can use the same profile, and so can Claude Cowork running on any of them.

One rule comes with it: **run Martha from one place at a time, and let the folder finish syncing
in between.** Kroger replaces your sign-in token every time Martha fills a cart. If two computers
run at once, or one runs before the other has synced, one of them is left holding an old token.
Kroger then refuses it, and you sign in again (`KROGER-SETUP.md` step 4).

If you ever see a conflict copy such as `kroger-credentials (1).json`, keep the newest file and
delete the other.

Anyone you share that cloud folder with can read your household's details and fill your Kroger
cart, so don't share it.

## How Martha finds it

Martha looks in this order:

1. The `MARTHA_DIR` environment variable, if you set one.
2. The path written on the first line of `~/.martha/profile-location.txt`. Martha writes this file
   when you choose a cloud folder.
3. `~/.martha` itself.

You don't need `MARTHA_DIR` unless you want it, for example to switch between two profiles.

## Moving it later

Say "Move my profile" and name the new folder. Martha:

- copies the whole folder there
- checks the copy opens
- points `~/.martha/profile-location.txt` at it
- asks you to delete the old copy

Only one copy of the Kroger sign-in may stay in use. To move it by hand, do the same three
things yourself.

"Where's my profile?" tells you which folder Martha is using.

## Claude Cowork

In Cowork, Martha works on a folder of the computer the session is linked to. It asks once per run
for access; pick your profile folder. A cloud profile works from every computer that syncs it.

## Sharing one profile between two people (optional)

Two people who each run Martha on their own computer can work from one profile: one set of
preferences, one history of recipes, ratings and weeks, one set of plans. Whatever one of you
changes, the other's next run starts from.

It needs one small table in your own AWS account: the shared copy lives there, and each computer
gets its own key to it. The setup script in `VOICE-SETUP.md` builds it, and in its sharing-only
form it builds nothing else: no Alexa skill, no Amazon developer account, no Anthropic API key.
Voice notes are optional and separate. A household that already has voice notes already has the
table; one that starts with sharing can add voice notes later.

1. **Build the table.** Skip this step if the household already set up voice notes. Otherwise,
   on the computer that holds the most history: make the AWS account and install the AWS
   command-line tool (`VOICE-SETUP.md` step 2, parts 1 and 2), then run this from the folder you
   cloned Martha into:

   ```
   bash alexa/setup/voice-setup.sh --sharing-only
   ```

   On Windows, type it in Git Bash, not PowerShell; `VOICE-SETUP.md` step 2 gives the form that
   works from PowerShell. The script signs this computer in to AWS, builds the table, a key user
   for each computer and for a phone, and a $1 monthly budget alert, and saves this computer's
   key. `VOICE-SETUP.md`, Only sharing a profile, says which of that page's steps apply.
2. **Make the second computer's key.** On the computer that ran the setup script:
   `bash alexa/setup/voice-key.sh computer2` (`VOICE-SETUP.md`, A second computer; on Windows, in
   Git Bash as in step 1). Carry that one file to the other computer yourself and put it in that
   computer's profile folder.
3. On each computer, tell Martha "share our profile" (or set the Shared household row in
   `martha-config.md` to `on`).
4. Start with the computer that holds the most history. Its next run saves the profile to the
   table; the other computer's next run brings it down and adds its own history to it. Recipes,
   ratings and weeks from both are kept. Where the two computers' configs differ, Martha shows
   both and asks.

The sharing-only build is tested offline only: it has not yet been run against AWS
(`VOICE-SETUP.md`, Not yet tested, says what has).

**What is shared:** `martha-config.md`, `martha-memory.json` and the weekly plan files
(`outputs/martha-plan-*.md`). **What never is:** any credentials file. Each computer keeps its own
Kroger sign-in, so the rule about running from one place at a time doesn't apply here. If you
both sign in to the same Kroger account, you fill the same cart; with two accounts, a cart one of
you fills is not in the other's account.

**When you both change something.** Martha fetches the other person's changes at the start of a
run and saves yours at the end. If you both changed things in between, different things are
simply combined: your rating of the tacos and their rating of the chili both stand. If you both
changed the same thing to different values (you rated the chili ok, they rated it loved; you each
edited the budget), Martha shows both and asks which stands. Nothing is overwritten without
that question: a save is refused by the table unless it builds on the latest copy.

"Who changed what?" lists the last ten saves, with who made each and from which computer. The
table keeps the latest copy of each file, not its history; `.household/` in the profile folder
holds this computer's copy as of its last sync, and Martha manages it. Each time Martha combines
your memory with the other person's, your file from just before is kept in
`.household/before-merge/`, dated; it stays on this computer, and you can delete old ones.

A phone's read-only key (`VOICE-SETUP.md`, Reading notes from a phone) can read the shared profile
too, so the phone's Claude can answer "what's for dinner Thursday?" or "have we had this
before?". It can't save anything.

To stop sharing, set the row to `off` on a computer: it keeps its files as they are and stops
syncing. To cut a computer off, cancel its key (`VOICE-SETUP.md`).

## Keeping it in a private git repository (optional)

If you use git, your profile folder can be a clone of a **private** repository. That gives you
the history of your config and ratings, and an off-machine copy. Keep the secrets out of it. Its
`.gitignore` needs at least:

```
*-credentials.json
*.tmp
*.new
.secrets-out/
```

Commit after a run if you want the history. Never push a credentials file anywhere.

## Starting over

- Delete `martha-config.md` and the next run asks the setup questions again.
- Delete `martha-memory.json` and Martha starts a fresh memory: no ratings, no history.
- Delete the whole folder (and `~/.martha/profile-location.txt`, if you have one) to start from
  nothing.
