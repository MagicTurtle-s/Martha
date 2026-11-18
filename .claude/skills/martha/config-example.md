# Martha configuration

Every value below belongs to a made-up household. Martha's first-run interview writes your own
copy as `martha-config.md` in your profile folder (`~/.martha/` or a cloud folder: `PROFILE.md`); you can
also copy this file there and edit it. Martha reads it at the start of every run, never re-asks
what it answers, and writes standing rules you state mid-run back into it. Leave an optional value
blank to switch it off.

## Household

| Member | Age | Portion | Restrictions | Nutrition standard | Notes |
|---|---|---|---|---|---|
| Alex | adult | 1 | gluten-free, dairy-free | strict | |
| Sam | adult | 1 | dairy-free | loose | dislikes olives |
| Jamie | 3 | 0.25 | none (dairy is fine) | — | mild spice only |

- **Portion** is a share of one adult serving: adults are 1, a child a fraction.
- **Restrictions** are per member. A shared dish meets the restrictions of everyone who eats it;
  an item for one member meets only theirs.
- **Nutrition standard** per member: strict, loose, or — (doesn't follow it).

## Weekly slate

| Slot | Recipes | Eaten | Who | Notes |
|---|---|---|---|---|
| Lunch salad | 1 | Monday to Friday | adults | made ahead; dressing kept separate |
| Dinner | 3 | each cooked once, eaten on 2 nights; night 7 is leftovers | everyone | must reheat well |
| Breakfast | 1 | all 7 days | everyone | prepped ahead |

## Kitchen and time

| Setting | Value |
|---|---|
| Max active minutes per recipe, at the scaled batch | 30 |
| Repeat window (days before a recipe can come back) | 21 |
| Equipment | Instant Pot, air fryer, sheet pans |
| Prepped-first (buy pre-cut, frozen, pre-minced) | yes |
| Never buy whole (always prepped) | onion, garlic |
| Spice level | mild |

## Nutrition

| Setting | Value |
|---|---|
| Standard (`zoe`, `macros` or `none`) | zoe |
| Weekly plant target (`zoe`) | 30 |
| Settled exceptions (bought every week, never flagged) | Sam's sparkling energy drink, 6-pack |

Macro targets per day (used only with `macros`):

| Member | Calories | Protein | Fat | Carbs |
|---|---|---|---|---|
| Alex | 1800 | 90 g | 60 g | 180 g |

## Store

| Setting | Value |
|---|---|
| Store | Kroger |
| ZIP code | 90210 |
| Location id (from `python3 martha_kroger.py stores <ZIP>`) | 01400999 |
| Fulfillment (`DELIVERY` or `PICKUP`) | DELIVERY |
| Delivery or pickup day | the household picks it in the Kroger app |
| Store notes | no shaved Brussels sprouts at this store: buy whole |

## Budget

| Setting | Value |
|---|---|
| Ceiling, all-in (groceries, fee, tax, tip) | $220 |
| Grocery subtotal target | $180 |
| Grocery subtotal hard stop | $185 |
| Fee (planning figure; 0 if a membership waives it) | $10 |
| Tip (planning figure) | $15 |
| Sales tax on food | 0% |
| Sales tax on non-food | 9.5% |

## Standing order

In every cart unless the household skips it that week.

| Item | Quantity | Rule |
|---|---|---|
| Apples, any red variety | 12 apples | whichever is discounted; count apples, not pounds |
| Bananas | 6 | mixed ripeness |
| Berries | 2 containers | whichever is on sale; frozen if fresh is unpromoted and dear |
| Unsweetened almond milk | 2 cartons | unsweetened only |
| Cheese sticks (Jamie) | 1 pack, 12 ct | Jamie only; the loved product below |
| Adult snacks | 3 items | with a discount; rotate week to week |
| Sparkling energy drink (Sam) | 1 6-pack | a real multipack; a settled exception |

## Foods

| Setting | Value |
|---|---|
| Disliked (never cooked or bought) | olives (Sam), mushrooms (Jamie) |
| Assumed staples (always in the house) | salt, black pepper, extra virgin olive oil |
| Preferred brands | GF pasta: Jovial; DF cheese: Violife |

Loved products (Martha buys this exact item; the UPCs here are made up):

| Product | UPC | Rule |
|---|---|---|
| Example Farms Colby-Jack cheese sticks, 12 ct | 0000000000101 | Jamie's cheese sticks; never mozzarella |

## Recipes

| Setting | Value |
|---|---|
| Pinterest board (optional, see `PINTEREST-SETUP.md`) | Weeknight Dinners |
| Other sources | links sent in chat; web search as a fallback |

## Outputs

| Setting | Value |
|---|---|
| Plan file (always) | `outputs/martha-plan-YYYY-MM-DD.md` in the profile folder |
| Apple Note link (optional; needs Claude in Chrome) | |
| Alexa list name (optional; Martha reads it into the cart and checks off what it added; needs Claude in Chrome) | Shopping |

## Coupons

| Setting | Value |
|---|---|
| Who clips digital coupons | Alex, in the Kroger app. Martha never clips; it reminds at hand-off. Blank = no reminder. |

## Notes

Anything else Martha should know, one line each.

- Alex cooks on weeknights; Sam does the Sunday prep.
