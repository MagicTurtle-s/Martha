# Your profile

Martha keeps everything about your household in one folder, your **profile folder**. It never
goes into the Martha repository.

| File | What it holds |
|---|---|
| `martha-config.md` | Who eats what, the weekly slate, your store, budget and standing order. Written by the first-run questions; edit it directly any time. |
| `martha-memory.json` | Every recipe Martha has planned, your ratings and past weeks. |
| `kroger-credentials.json` | Your Kroger app and sign-in token (`KROGER-SETUP.md`). A secret. |
| `pinterest-credentials.json` | Optional (`PINTEREST-SETUP.md`). |
| `voice-credentials.json` | Optional: this computer's AWS key for voice notes (`VOICE-SETUP.md`). A secret. |
| `outputs/` | The weekly plans, one file per week. |

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
