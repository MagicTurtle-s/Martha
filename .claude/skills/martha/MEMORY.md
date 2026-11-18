# Memory — schema, read rules, write rules

The memory file is what makes Martha better than a one-off meal plan. Read it first, write it
last, every single run.

## Location

`martha-memory.json` lives in the profile folder, beside `martha-config.md`. `SKILL.md` Step 0
says how to find that folder and how to read and write it in Claude Code and in Cowork.

**If the file does not exist:** create it from `martha-memory-template.json`, tell the user you
started a fresh memory, and don't pretend to have history you don't have.

**If the file is corrupt or won't parse:** do not overwrite it. Copy it aside as
`martha-memory.broken-[date].json`, start a fresh file, and tell the user what happened.

**If the file comes from an older Martha** (`"version": 1`): it may still hold `profile`,
`assumed_staples` or `standing_order_overrides`, which now live in `martha-config.md`. Compare
them with the config once; offer in one line to copy anything the config lacks into it. After
that the config wins. Never delete the old fields.

## Schema

`last_updated` is `"YYYY-MM-DD"`, or `null` on a fresh file (legal only before the first write).
The household itself (members, diets, store, budget, standing order) is in `martha-config.md`,
never here. The template's `_templates` holds an empty recipe and an empty week: copy one when
adding an entry, and never edit it.

```json
{
  "version": 2,
  "last_updated": "YYYY-MM-DD",
  "pinterest_last_pull": "YYYY-MM-DDTHH:MM:SS or null",
  "recipe_library": [
    {
      "id": "slug-case-unique-id",
      "name": "Recipe name",
      "slot": "salad | dinner | breakfast",
      "source_url": "",
      "rating": "unrated | loved | liked | ok | disliked | banned",
      "notes": "the user's own words, verbatim where possible",
      "times_served": 0,
      "last_served": "YYYY-MM-DD or null if never eaten",
      "base_servings": 4,
      "active_minutes": 25,
      "plants": [],
      "key_ingredients": [],
      "reheats_well": true,
      "tags": []
    }
  ],
  "weeks": [
    {
      "week_of": "YYYY-MM-DD",
      "breakfast_id": "",
      "salad_id": "",
      "dinner_ids": ["", "", ""],
      "carried_over": [],
      "plant_count": 0,
      "order_subtotal": 0,
      "order_all_in": 0,
      "order_placed": false,
      "plan_only": false,
      "cart_started": false,
      "substitutions": [],
      "feedback_collected": false,
      "feedback_asked": false
    }
  ],
  "loved_ingredients": [],
  "disliked_ingredients": [],
  "adult_snacks_recent": [],
  "notes": []
}
```

## Field meanings that matter

- **`rating`** drives selection. `loved` and `liked` are eligible and prioritized once past the
  repeat window. `ok` is eligible but deprioritized. `disliked` and `banned` are never proposed
  again: `banned` means the user said never, `disliked` means it missed.
- **`last_served`** is the repeat gate. `today − last_served` inside the config's repeat window
  → blocked, full stop. It is `null` until the recipe has actually been eaten, and it is written
  **only** when an order is confirmed placed, never at hand-off.
- **`order_placed`** distinguishes a planned week from an eaten week, and gates the
  `last_served` write. Only a placed order starts the repeat clock. In a plan-only week
  (`plan_only: true`) it means the household bought the groceries.
- **`week_of`** is the Monday of the week being cooked: the Monday on or after the day of the run,
  unless the user named another week (`SKILL.md` Step 1). One entry per `week_of`; the plan file
  is named after it.
- **`cart_started`** is set to true just before the first item goes into the Kroger cart for that
  week. A replan of that week must warn that the cart already holds its items.
- **`carried_over`** lists the ids of dinners carried from last week because they were never made
  (`[]` if none). Each is also in `dinner_ids`, so the week still lists every dinner it planned.
  A file from an earlier run may hold one id or `null` here: read it as a one-item list or none.
- **`pinterest_last_pull`** is when the board was last read, in UTC, so it compares with pins'
  `created_at`. `null` means never: read the whole board.
- **`reheats_well`** matters only for the dinner slot, where every recipe is eaten twice. Set it
  when you first add the recipe; update it if reheat feedback comes in.
- **`base_servings`** is the recipe's original yield, before scaling. Record it or you'll have to
  re-derive the multiplier every time the recipe comes back around.
- **`loved_ingredients`** is the positive mirror of `disliked_ingredients`: proteins, cuisines,
  vegetables and flavors that consistently land. Read it in Step 5 as a tiebreaker between two
  otherwise equal candidates, and add to it when praise is about an ingredient rather than a
  recipe ("we'd eat sweet potato every day").
- **`disliked_ingredients`** is learned from feedback; the config's disliked foods were stated up
  front. Both exclude. If the user says a prepped form ruined a dish, add that specific case (e.g.
  "frozen bell pepper in cold salad") here, so the exception sticks rather than the whole
  prepped-first preference getting reversed.
- **`adult_snacks_recent`** prevents buying the same snacks forever. Track the last ~3 weeks and
  rotate.

## Read rules — at the start of every run (Step 1)

Compute and hold before proposing anything:

1. **Blocked list:** every `recipe_library` id whose `last_served` is inside the repeat window.
   Because `last_served` is only written after an order is confirmed placed, this needs no join
   against `weeks[]`. A `null` `last_served` means never eaten and is always eligible.
2. **Priority pool:** `loved` then `liked`, past the window, oldest `last_served` first.
   Repeating a favorite every few weeks is desired behavior, not a failure of variety.
3. **Exclusion list:** `disliked` and `banned` recipes, every entry in `disliked_ingredients`,
   and the config's disliked foods. Ingredient exclusions apply to recipes you've never served
   too. Check them.
4. **Preference pool:** `loved_ingredients`, as a tiebreaker between equal candidates.
5. **Snack rotation:** `adult_snacks_recent`, to avoid a repeat.
6. **Pattern read:** with 3+ rated recipes, look for the actual signal: cuisines that land,
   proteins that land, textures that fail, prep styles that fail. Say what you're seeing in the
   proposal: "you've rated the two sheet-pan dinners highest, so here's a third."

## Write rules — at the end of every run (Step 10)

After the hand-off:

1. Write the week to `weeks[]`, replacing any entry with the same `week_of` (a cart build may
   already have saved it), with `order_placed: false`, `plan_only` set for a plan-only week, and
   `carried_over` listing any dinner that came from last week.
2. For each recipe in the week (normally the salad, the dinners and the breakfast): create it in
   `recipe_library[]` if it is new, with `rating: "unrated"` and `last_served: null`. A
   carried-over dinner is already there. **Do not write `last_served` or `times_served` now**:
   the order hasn't been placed, so nothing has been eaten.
3. **Fill every field on a new recipe**, not just the name: `source_url`, `slot`,
   `base_servings`, `active_minutes`, `plants`, `key_ingredients`, `reheats_well`, and `tags`
   (cuisine, appliance, protein, prep style). These make the pattern read possible; an entry with
   only a name teaches nothing.
4. Record `order_subtotal` and `order_all_in` (estimates in a plan-only week; say so in `notes`
   if it matters).
5. Record substitutions worth remembering.
6. Update `adult_snacks_recent`.
7. Set `pinterest_last_pull` to the run's timestamp, if the board was read this run.
8. Add anything durable and non-obvious to top-level `notes`: a recurring stock problem, what
   worked for the Apple Note paste. Keep it short; this is not a diary. Household rules go in
   `martha-config.md`, not here.
9. Set `last_updated` and save.
10. Tell the user in one line what you wrote, and ask them to say when the order is placed.

**When the user confirms the order was placed:** flip that week's `order_placed` to `true`, then
set `last_served` to the week's date on every recipe in the week, and `times_served++` on each
except the `carried_over` dinners (each was counted when the week it was first planned was
confirmed). This is the only place `last_served` is ever written. It starts the repeat clock.

**If the most recent week is still `order_placed: false` at the start of a new run:** ask
whether they placed it (Step 1). Do not assume either way: an unconfirmed week is just as likely
to be an ordered week nobody came back to confirm.

- They placed it → do the confirm-write above, dated to that week.
- They didn't → leave the week as `order_placed: false` and change nothing else. Because
  `last_served` was never written, there is nothing to roll back, and those recipes are simply
  eligible again. This is why the write is deferred.

## The feedback path (Step 1, or on its own)

Martha triggers on feedback alone: "we loved that chili," "the salad was a miss," "never make
that again." No meal plan needs to be running.

1. Read memory. Find the recipe. If the reference is ambiguous, ask which one; don't guess and
   write a rating onto the wrong recipe.
2. Set `rating`. Map it honestly:
   - "we loved it," "make this again," "best one yet" → **`loved`**
   - "that was good," "yeah that worked," "we'd eat that again" → **`liked`**
   - "it was fine," "no strong feelings" → **`ok`**
   - "didn't love it," "wouldn't pick that again," any specific complaint → **`disliked`**
   - "never again," "don't ever make that" → **`banned`**
3. Write `notes` in the user's own words. "Too much cumin" is more useful next week than
   "disliked."
4. If the feedback is about an ingredient rather than the recipe, put it in
   `disliked_ingredients` (or `loved_ingredients` if it's praise) so it shapes every future week,
   and say you did that, because it's a bigger move than rating one recipe.
5. Set the week's `feedback_collected` to true. (`feedback_asked: true` means the start-of-run
   question went out for that week and got "skip" or no answer; it stops the same week being
   asked about again. `false` or a missing field means it has not been asked.)
6. Confirm what you recorded, then ask in one line whether there's feedback on anything else
   from the week.

## Never

- Never write a password, token, account number or payment detail into memory.
- Never overwrite the file without having read the current version in this run.
- Never silently drop history. If you can't write, say so: a lost week means a repeat next week.
