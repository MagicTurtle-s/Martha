# Kroger setup

Martha fills your Kroger cart through Kroger's public API, with your own developer app. Without
this setup Martha still works in plan-only mode: you get the plan and a shopping list, no prices
and no cart. It never places the order.

**You need:** a kroger.com account (the one whose cart Martha fills), Python 3.9 or newer (the client uses
only the standard library), and about 15 minutes. The commands below say `python3`; on Windows
type `python` or `py` instead.

## 1. Register an app

1. Go to developer.kroger.com, sign in or create a developer account, then **Manage → Apps** and
   create an app.
2. Environment: **Production**.
3. API products: **Cart**, **Locations**, **Products** and **Profile**.
4. Redirect URI: `http://localhost:8000/callback`
5. Save, then copy the client id and client secret.

The client asks for the scopes `cart.basic:write`, `product.compact` and `profile.compact`.
Kroger's daily limits are about 10,000 product calls, 5,000 cart calls and 1,600 location calls; a
weekly Martha run uses around 45.

## 2. Write the credentials file

Create `kroger-credentials.json` in your profile folder: `~/.martha/`, or the cloud folder you
chose on Martha's first run (`PROFILE.md`). `KROGER_CREDS` can point at the file itself instead:

```json
{
  "client_id": "YOUR_CLIENT_ID",
  "client_secret": "YOUR_CLIENT_SECRET",
  "redirect_uri": "http://localhost:8000/callback",
  "refresh_token": "",
  "store_location_id": "",
  "modality": "DELIVERY"
}
```

| Field | What goes in it |
|---|---|
| `client_id`, `client_secret` | From step 1 |
| `redirect_uri` | Exactly the redirect URI registered in step 1 |
| `refresh_token` | Leave empty: step 4 fills it |
| `store_location_id` | Step 3 |
| `modality` | `DELIVERY` or `PICKUP`, the same as your `martha-config.md` |

This file is the key to your Kroger cart. Keep the profile folder private: not shared, not public,
and never in a repo. Martha never prints it.

## 3. Find your store's location id

Run these from the skill's `scripts` folder (in a clone of the repo:
`.claude/skills/martha/scripts`). They find your profile folder the way Martha does
(`PROFILE.md`, "How Martha finds it"), so a profile in a cloud folder needs nothing extra.

```
python3 martha_kroger.py stores <ZIP>
```

It lists nearby stores as `id | name | address`. Put your store's id into `store_location_id`, and
into the Store section of `martha-config.md`.

## 4. Sign in once to get a refresh token

```
python3 martha_kroger.py auth
```

1. Open the URL it prints, sign in with your kroger.com account, and click Allow.
2. The browser then goes to `http://localhost:8000/callback?code=...` and the page fails to load.
   That is expected: nothing is listening there.
3. Copy the whole address from the address bar.
4. Run, straight away (a code works once), with the address in quotes:

```
python3 martha_kroger.py code "<the address>"
```

It prints the names of the tokens it received and saves the refresh token into the file.

Check it works:

```
python3 martha_kroger.py check
python3 martha_kroger.py search milk
```

`check` proves the sign-in end to end (it trades the token for a new one and saves it); `search`
lists products with prices at your store.

## The refresh token rotates on every use

Each time Martha builds a cart, Kroger trades the refresh token for a new one, and the client
writes the new one into the file at once. So:

- Keep **one** copy of the file. If two machines each hold a copy, the first one to run makes the
  other's token stale. A profile in a cloud folder is one copy, as long as only one place runs
  Martha at a time and the folder syncs in between (`PROFILE.md`).
- In a Cowork session Martha commits the updated file back to your profile folder; a run that
  stops before that leaves the folder's copy stale.
- If Martha says Kroger refused the sign-in, repeat step 4.

## If a step fails

Every step in this file was run against Kroger in November 2026, from a new developer app to a
filled cart. Kroger changes its developer site from time to time, so if a step fails for you,
open an issue with the error message (never the credentials file). Until it's fixed, Martha
still plans your week and writes the shopping list.
