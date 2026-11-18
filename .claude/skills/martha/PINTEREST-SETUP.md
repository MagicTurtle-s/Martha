# Pinterest setup (optional)

With this, Martha reads new pins from one Pinterest board each week and treats every pin as a
recipe request, with the pin's note as instructions ("not hot", "mayo instead of yogurt").
Without it, just send recipe links in chat.

**You need:** a Pinterest business account, a developer app with trial access (enough to read your
own boards), Python 3.9 or newer, and about 15 minutes. The commands below say `python3`; on
Windows type `python` or `py` instead.

## 1. Make your account a business account

Pinterest → Settings → Account management → Convert to business. Business type "other", no
website needed, and name it after yourself. Your boards carry over.

## 2. Create the app

1. On developers.pinterest.com, connect a new app. Name it "<your name> Martha"; any picture
   works as the icon.
2. Purpose "Personal API access", use case "Reporting", audience "Pinners", and for reading data
   "Yes, mine". The reCAPTCHA and Submit are yours to click.
3. Trial access is enough: it reads your own boards, which is all Martha needs.
4. In the app's settings, add the redirect URI `http://localhost:8000/callback`, then reveal the
   app secret.

## 3. Write the credentials file

Create `pinterest-credentials.json` in your profile folder (`~/.martha/`, or the cloud folder you
chose; see `PROFILE.md`). `PINTEREST_CREDS` can point at the file itself instead:

```json
{
  "app_id": "YOUR_APP_ID",
  "app_secret": "YOUR_APP_SECRET",
  "redirect_uri": "http://localhost:8000/callback",
  "board_name": "Martha"
}
```

`board_name` is the board Martha reads. It must be a public board: this setup does not ask for
Pinterest's permission to read secret boards. Put the same name in the Recipes section of
`martha-config.md`; the config wins if they differ.

## 4. Sign in once

From the skill's `scripts` folder:

```
python3 martha_pinterest.py auth
```

1. Open the URL it prints, sign in, and click "Give access".
2. The browser goes to `http://localhost:8000/callback?code=...` and the page fails to load.
   That is expected.
3. Copy the whole address from the address bar, then run, straight away, with it in quotes:

```
python3 martha_pinterest.py code "<the address>"
```

It saves the tokens into the file. Check with `python3 martha_pinterest.py boards` (your board
names) and `python3 martha_pinterest.py pins` (the board's pins, newest first; add a date such as
`2026-01-31T00:00:00` to see only pins since then).

## Tokens

The access token lasts about 30 days and the client refreshes it on its own. The refresh token
lasts 60 days, and each refresh brings a new one, which the client saves at once. So a weekly
Martha never runs out; after more than 60 days without a run, repeat step 4.

Pinterest has said apps registered from September 2026 may be refused when reading pins of
accounts that aren't business accounts; step 1 is why the account is a business one.
