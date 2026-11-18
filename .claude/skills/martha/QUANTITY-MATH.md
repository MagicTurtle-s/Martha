# Quantity math, standing order and budget

Read this **before Step 5**, not just before the cart: the multipliers and budget figures drive
the recipe proposals. The household's numbers come from `martha-config.md`; the examples here use
`config-example.md`'s household (two adults and a toddler at 0.25). The user's word this week
beats the config, and the config beats the defaults here.

## The portion unit

One **adult serving (AS)** is the unit. Each member's portion is in the config's Household table:
adults are 1, a child is a fraction (0.25 for the example toddler). One meal for everyone is the
sum of the portions: 2 + 0.25 = **2.25 AS** in the example. Always round the final grocery
quantity **up**: running short is worse than a little leftover.

## Scaling each slot

The slots, how often each is eaten and by whom are in the config's Weekly slate. The defaults:

**Salad — lunch, the adults, 5 days**

- Requirement: lunch eaters × days = 2 × 5 = **10 AS** in the example.
- **Build to about 20% over: 12 AS** for a 10 AS requirement. The extra servings absorb wilting,
  an oversized appetite and one repeat lunch. The build number is what you shop and cook from.
- Multipliers to reach 12 AS: serves-4 → **×3**, serves-6 → **×2**, serves-2 → **×6**.
- The time ceiling applies to batching **all** of it, not to the original recipe.
- Dressing packaged separately, greens undressed until served, or day 5 is a swamp.
- Sturdy bases only: cabbage, kale, romaine hearts, shredded carrot, roasted vegetables, quinoa,
  lentils, chickpeas. No pre-dressed spring mix.
- **If the plan also uses the salad as a fiber-first dinner starter** (see `ZOE-STANDARDS.md`),
  that is up to another full build and it is **not** funded by the lunch batch. Either buy a
  separate bag of greens for the starter or say plainly that the salad covers lunches only. Do
  not assume one batch stretches to both.

**Dinners — each recipe cooked once, eaten as 2 dinners**

- Per recipe: 2 dinners × the family portion = 2 × 2.25 = 4.5 AS → **5 AS minimum, 6 AS in
  practice**.
- Multipliers, all landing at 6 AS: serves-4 → **×1.5**, serves-2 → **×3**, serves-6 → **×1**.
  Shop and cook from 6; 5 is the floor you may not go below.
- 3 recipes = 6 dinners. **Night 7 is flex/leftovers**: say so out loud in the proposal.
- Reheat quality is a selection criterion. Anything that dies on day 2 (crisp-fried, delicate
  fish, dressed grains) is the wrong pick for this slot.
- **The configured dinner count is a hard floor.** A carried-over dinner counts toward it. Never
  plan fewer and stretch the flex nights.

**Breakfast — 1 recipe, all 7 days, everyone**

- Requirement: 7 × the family portion = 7 × 2.25 = 15.75 AS → **build to 16 AS minimum**.
- Multipliers that clear 16 AS: serves-4 → **×4** (16), serves-6 → **×3** (18), serves-8 →
  **×2** (16), serves-2 → **×8** (16). Overshoot is fine; a shortfall means a morning with no
  breakfast.
- **A ×8 scale-up is a red flag on the time ceiling.** Prefer a recipe with a base of 4+ servings
  for this slot, or one that batch-preps components and assembles in 5 minutes each morning.
- Must hold 7 days refrigerated, be freezer-portioned, or be a fast assembly from batched parts.

For another household, redo the arithmetic with its own portions and slate; the rules (round up,
build over the requirement, the dinner floor) stay the same.

## Equipment

The config lists the household's appliances. Use them: they are how a 12-serving or 16-serving
batch stays inside the time ceiling. State which appliance carries each recipe when proposing it.
A slow-cooker recipe counts as inside the ceiling if the *active* time is, but say the total
elapsed time too, so nobody starts dinner at 6pm expecting 6:30.

## Prepped ingredients

The other half of hitting the ceiling at batch scale: **buy everything already cut.** Bagged
shredded, frozen diced, jarred minced. The hierarchy and the short keep-it-fresh list are in
`PREPPED-FIRST.md`. Read it before estimating any recipe's active time and before choosing
product forms. When scaling, convert to the prepped measure and write *that* into the plan: 6
cloves of garlic becomes 1 tablespoon of jarred minced, not "6 cloves."

## The standing order — in every cart unless the user skips it this week

The items and quantities are in the config's Standing order table. These rules apply to any of
them:

- **Fruit: count pieces, not pounds.** Bag counts vary (a 3 lb bag of apples can hold 6–9); read
  the listed count or buy loose. If you can only buy bags, buy enough to clear the count even if
  that means overshooting, unless that item's Rule in the config says loose only. Compare unit
  price, not shelf price: bagged against loose is usually a real gap.
- **"Whichever is on sale" items** (berries, a variety of apple, a flavor of drink): pick the
  discounted one and say which. Mixing two promoted varieties helps the plant count. Frozen
  berries count if fresh is unpromoted and expensive.
- **Pack sizes:** when the config names a pack (a 6-pack, a 12-count), buy a real multipack of
  that size, never loose units.
- **Loved products:** buy the exact UPC from the config. If it's out of stock, say so; don't
  substitute silently.
- **One-member items** (a child's cheese sticks, one adult's drink) meet that member's
  restrictions only (`SKILL.md` Diet rules).
- **Prefer the store brand** on packaged items when it clears every restriction.

**Adult snacks:** the count in the config. Each one meets every adult's restrictions and the
nutrition standard (with `zoe`, the acceptable-UPF tier), is never a disliked food, rotates
against `adult_snacks_recent`, **and carries some discount** (in plan-only mode, a note on the
list to pick ones on sale): a sale, a digital coupon, or a
mega-event. A mega-event (Buy 5 Save $5 and the like) pays out only at the required quantity; a
4-of-5 cart pays full price, so count before you rely on one. If fewer snacks qualify with a
discount that week, buy the best-value qualifying items at full price to reach the count and say
so at hand-off. Never let the discount rule silently shrink the allowance to zero: the
requirement is that they have snacks; the discount is the preference.

Good adult-snack territory, once it clears every adult's restrictions and allergies: raw or
dry-roasted nuts, seed mixes, plain popcorn, roasted chickpeas, whole-grain crackers with seeds,
dark chocolate ≥70%, olives, freeze-dried fruit with no added sugar, nut-butter packets, oat bars
with no added sugar. Skip anything on the config's disliked list.

### Settled exceptions — resolve once, don't re-litigate weekly

The config can list items that go in every order even though they fail the nutrition standard
(an artificially sweetened drink one adult wants, say). They are known, deliberate exceptions.
Buy them without comment: do not flag them, do not suggest a swap, do not leave them out, do not
raise them again week after week. The nutrition standard governs the recipes and the
adult-snack *selection*, not these items.

### One-week skips vs permanent changes

"Skip the applesauce this week" is a **one-week** skip. Only change the config's standing order
if the user says to stop (or start) including it going forward, and say in one line that you did.
Ask which one they mean if it's ambiguous.

## Budget arithmetic — the all-in ceiling

The config's ceiling covers groceries **plus** the delivery or pickup fee, tax and tip. Work
backward:

| Line | Where it comes from |
|---|---|
| Fee | The config's planning figure. With a membership that waives it, the config says 0. The API cart is write-only, so the real fee only shows in the Kroger app: never claim it. |
| Tax | The config's food and non-food rates. **Compute them separately; don't blend.** |
| Tip | The config's planning figure (often 0 for pickup). |
| **Grocery subtotal** | The config's target and hard stop. |

If the config leaves the target or the hard stop blank: hard stop = ceiling − fee − tip − food
tax − about $10 of room for non-food tax and surprises; target = about $5 under the hard stop.
In the example: $220 − $10 − $15 − $0 − $10 = **$185 hard stop**, **$180 target**. Never plan
the subtotal right up to ceiling − fee − tip: that leaves zero margin, and one non-food item off
the Alexa list pushes it over.

Keep a running subtotal as you build the line list and report it at every checkpoint, not just
at the end. In plan-only mode the same arithmetic runs on estimates; say they are estimates.

**If the projected all-in crosses the ceiling, or the subtotal crosses the hard stop:** stop and
bring the user specific trade-offs. Never trim silently. Rank the cuts in this order:

1. Adult snacks halved, rounding down (3 items down to 1 in the example).
2. Berries halved, or fresh swapped for frozen.
3. Swap the most expensive protein for the discounted one: chicken thighs over breasts, frozen
   fish over fresh, a legume-forward dinner in place of a meat-forward one.
4. Store brand across the board on packaged items.
5. Re-propose one dinner as a cheaper legume-based dinner at the same serving count.
6. Salad build back down to its requirement (12 AS to 10 AS in the example).

**Never cut** to hit budget: any standing-order item not named above (including the settled
exceptions); the salad below its requirement; the breakfast below its requirement; a dinner
below its floor; or the number of dinner recipes. Those are the point of the order. If the math
still doesn't work after cut 6, tell the user the ceiling is not achievable this week and show
them the number: they asked to be told.

## Substitution rules

- Out of stock on a recipe-critical item → find the closest equivalent that clears every
  restriction, note it, tell the user at hand-off, and update the plan file (and the Apple Note)
  if it changes an ingredient. Name the recipe-critical items at hand-off so the user can set
  "no substitutions" on them in the Kroger app: an auto-substitute that breaks someone's
  restriction would break the week.
- Out of stock on a snack → pick another discounted item in the same category.
- Out of stock on a standing item → say so explicitly at hand-off. Never omit it silently.
- A cheaper equivalent that's equally compliant always wins. A cheaper item that fails a
  restriction or the nutrition standard never wins.
