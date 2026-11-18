# Contributing to Martha

Martha started as one household's weekly shop. Issues and pull requests that make it work for more households are welcome.

## Good first contributions

- **Another store.** Martha talks to Kroger through `.claude/skills/martha/scripts/martha_kroger.py`, which does three things: search the store's products with prices and promotions, look up one product, and add items to the cart. A store with an official API could get a sibling client offering the same three functions. Please open an issue first to agree on the shape.
- **Setup that went wrong for you.** If [KROGER-SETUP.md](.claude/skills/martha/KROGER-SETUP.md) or [PINTEREST-SETUP.md](.claude/skills/martha/PINTEREST-SETUP.md) lost you somewhere, an issue saying where helps the next person.
- **Diets and nutrition standards.** The config supports per-person restrictions and a ZOE or macro standard. Others are welcome when they come with clear rules Claude can follow.

## Before you open a pull request

1. Run the tests and the release checks (the checks need Node 22.18 or newer):
   ```
   python -m unittest discover -s tests
   claude plugin test mods/chef-clawd
   node release/check.mjs
   ```
   To have git run the secret and personal-data checks before every commit, turn on the repository's hooks once: `git config core.hooksPath .githooks`.
2. Leave your household out: no names, addresses, store ids, account emails or credentials in the repo. Those belong in your profile folder (`martha-config.md`, `martha-memory.json`, `*-credentials.json`, the plans in `outputs/`), which git already ignores. The checks catch email addresses, phone numbers and street addresses on their own; to have them catch your names too, list them in `release/deny-list.local.txt`, which git ignores as well.
3. Never add anything that places an order or checks out. Martha fills the cart, and a person places the order.

## Chef Clawd

Changes to the mod in `mods/chef-clawd` need `claude plugin validate mods/chef-clawd` and `claude plugin test mods/chef-clawd` to pass. Chef Clawd is an unofficial fan mod. Clawd and Claude are Anthropic's; this project is not affiliated with or endorsed by Anthropic.
