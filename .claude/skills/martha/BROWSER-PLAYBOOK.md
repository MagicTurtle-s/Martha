# Browser playbook — the Apple Note and the Alexa list

Both outputs are optional and switched on in `martha-config.md` (Outputs: an Apple Note link, an
Alexa list name). Neither has an API, so they go through **Claude in Chrome**
(`mcp__claude-in-chrome__*`) in the user's own Chrome, where the user is already signed in.

The browser is used for these two sites only, plus, read-only, a recipe page that refused a fetch
(`SKILL.md` Step 2). Kroger is API-only (`SKILL.md`), and coupons are the household's to clip.

## Rules

- **Never ask for, store, type or write down a password**, and never handle a 2FA code. Not in
  the skill, not in memory, not in a scratch file.
- Don't click anything that opens a browser confirm or alert dialog: it freezes the automation.
- Use the Chrome that is connected. Never call `list_connected_browsers` and never ask which
  browser to use.
- Close the tabs you opened when you're done.

## Session start

1. Load the tools in **one** ToolSearch call:
   `select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__find,mcp__claude-in-chrome__form_input,mcp__claude-in-chrome__get_page_text,mcp__claude-in-chrome__javascript_tool`
2. Call `tabs_context_mcp` first. Never reuse a tab id from a previous session.
3. Open a new tab for the work unless the user points you at an existing one.

**Login check (both sites):** open the URL and take a screenshot. If it shows a sign-in page
instead of the note or the list, stop and say in one line: "Please sign in to [iCloud / Amazon]
in Chrome, then tell me when you're in." When the user says they're in, or says "try again",
reload and continue right away. If a safety check blocks it, say so in one line and retry only
when the user asks again; otherwise use the fallback below.

**Never ask which browser to use.** If Claude in Chrome won't act until a browser is picked, fall
back: for the Alexa list, ask for a screenshot (below); for the note, keep the plan file as the
record and say in one line that the note wasn't updated.

## The Apple Note (SKILL.md Step 6)

The note at the config's Apple Note link is overwritten every week with the plan.

**Layout:** the plan from `SKILL.md` Step 6, as a note.

```
Week of M/D                         <- note title, the Monday of the week being cooked
Breakfast                           <- plain-text section label
  ( ) Recipe Name                   <- checklist item; the name is a hyperlink to the recipe
      - variation / swap            <- bullets under the recipe
      - sizing: scaled amount
Lunch
  ( ) Recipe Name                   <- always a linked name, never a bare URL
Dinner
  ( ) Recipe Name
  ( ) Leftover Recipe Name (from last week)
      - only what's still needed
Prep                                <- after ALL recipes, so it's easy to find
  - prep-day step
```

No headings beyond the title and the four labels, no emojis, and no shopping list or
disclosures: those stay in the plan file.

**Mechanics (iCloud web Notes):**
- iCloud Notes renders without readable page text (`get_page_text` returns nothing), so read it
  from screenshots.
- Click into the note body, select all (Ctrl+A; Cmd+A on a Mac), and replace it. Links and checkboxes must survive: put rich
  HTML on the clipboard with `javascript_tool` (an anchor tag for each recipe name, a list for the
  bullets) and paste (Ctrl+V; Cmd+V on a Mac), then apply the checklist button in the toolbar to each recipe
  line.
- After the toolbar shows "Saved", take a screenshot to check the links, checkboxes and bullets,
  and that the amounts match the plan file, then tell the user in one line that the note is
  updated.
- If the paste loses links or checkboxes, say so, keep the plan file as the record, and note
  what worked (or didn't) in memory's `notes` for next week.

## The Alexa list (SKILL.md Step 7)

Amazon has repeatedly broken web access to Alexa lists, so treat this as best effort with a fast
fallback. **Three attempts, then fall back.** The list's name is in the config.

Try in order:

1. `https://alexa.amazon.com/` → Lists → the configured list
2. `amazon.com` → Account → Alexa Shopping Lists / "Your Lists"
3. Search Amazon's help pages for the current lists address, if both fail.

If none load, or sign-in loops: ask the user for a screenshot of the list from the Alexa phone
app and read it from the image. Say plainly that web access is broken rather than retrying
indefinitely.

**Reading:** take every unchecked item (fall back to screenshots if the page text is empty).
Reconcile the list against the recipe list before adding: the two overlap, and double-adding is a
common error. Ask about anything ambiguous ("milk": which milk, and for whom?).

**Dates:** the list doesn't say when an item was added, so Martha keeps the date she first saw
it, in memory's `alexa_list_seen` (`MEMORY.md`). After reading, add each new item with today's
date, keep the date of an item already there, and drop entries for items no longer on the list.
Show the date beside each Alexa item in the cart table or shopping list ("on the list since Thu
11/12"), and call it first seen, never "added".

**Checking off (after `SKILL.md` Step 8.4):** check off every item that went into the Kroger
cart. Leave unchecked anything that wasn't added (not found, cut for budget) and name those in
the disclosures. Never delete items; only check them off. In plan-only mode, check nothing off.

## Failure handling

Stop and ask the user rather than grinding if:

- any browser action fails 3 times;
- a sign-in wall you can't get past;
- the Chrome extension stops responding, or a dialog freezes the tab.

Say what you tried, what broke, and what you'd do next. Do not loop. A browser failure never
blocks the plan file or the cart: note it at the top of the disclosures and carry on.
