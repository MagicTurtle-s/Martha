# Chrome Prompt Templates

Reusable prompts for browser automation. These templates use placeholders from the user's config.md.

## Placeholders

| Placeholder | Source |
|-------------|--------|
| `{CONFIG.location}` | User's ZIP code or address |
| `{CONFIG.store}` | Grocery store name |
| `{CONFIG.fulfillment}` | Pickup or Delivery |
| `{CONFIG.recipe_source}` | Pinterest URL, blog list, or "web search" |
| `{CONFIG.dietary}` | Combined dietary restrictions |

---

## Phase 1: Weather Check

```
Navigate to weather.com and search for "{CONFIG.location}".
Extract the 7-day forecast high temperatures and report them back.
```

---

## Phase 1: Recipe Discovery

### Pinterest Board (if configured)

```
Open Pinterest and navigate to this board: {CONFIG.recipe_source}

Browse for recipes that:
- Meet these dietary requirements: {CONFIG.dietary}
- Have prep time under {CONFIG.max_prep} minutes
- Have total cook time under {CONFIG.max_cook} minutes

Open 4-5 promising recipes in new tabs.
Note any that require pre-prep (marinating, thawing, etc.)
```

### Pinterest Search (fallback)

```
Search Pinterest for "{CONFIG.dietary} [PROTEIN] dinner easy".
Open 5-6 promising recipes in new tabs.
Look for recipes with:
- Prep time under {CONFIG.max_prep} minutes
- Cook time under {CONFIG.max_cook} minutes
- Simple ingredient lists
```

### Web Search (if configured)

```
Search the web for "{CONFIG.dietary} [PROTEIN] dinner recipe easy weeknight".
Look for recipes from reputable cooking sites.
Filter for:
- Prep time under {CONFIG.max_prep} minutes
- Total cook time under {CONFIG.max_cook} minutes
Open 4-5 promising recipes.
```

---

## Phase 2: Recipe Extraction

```
For each recipe tab:
1. Extract the full ingredient list with quantities
2. Note the prep time and cook time
3. Copy the recipe URL
4. Flag any ingredients that don't meet: {CONFIG.dietary}

Compile all ingredients into a single consolidated list.
Sum quantities for overlapping ingredients.
Round to standard package sizes.
```

---

## Phase 3: Store Setup

```
Navigate to {CONFIG.store} website.

Verify:
1. Logged into account (should show account name in header)
2. Store location set to: {CONFIG.location}
3. Fulfillment mode set to: {CONFIG.fulfillment}

Tell me when ready to proceed.
```

---

## Phase 3: Parallel Agent - Grocery Item

Use this when spawning a Task agent to add a single item:

```
You are a grocery item agent. Your task is to add ONE item to the cart.

STORE: {CONFIG.store}
ITEM: {item_name}
QUANTITY: {quantity}
SEARCH URL: {search_url}
DIETARY REQUIREMENTS: {CONFIG.dietary}

Instructions:
1. Get the current browser tab context using mcp__claude-in-chrome__tabs_context_mcp
2. Create a new browser tab using mcp__claude-in-chrome__tabs_create_mcp
3. Navigate to the search URL using mcp__claude-in-chrome__navigate
4. Wait 2 seconds for results to load
5. Use mcp__claude-in-chrome__read_page to find product elements
6. Find the best matching product that is:
   - Available for {CONFIG.fulfillment}
   - Compliant with dietary requirements if specified
   - Reasonably priced
7. Click "Add to Cart" using mcp__claude-in-chrome__computer with ref parameter
8. Adjust quantity if needed using the +/- controls
9. Wait 1 second for cart update

Return your result in this exact JSON format:
{
  "item": "{item_name}",
  "qty_requested": {quantity},
  "qty_added": {actual_quantity_added},
  "success": true/false,
  "product_name": "Actual product name selected",
  "price": "$X.XX",
  "notes": "Any relevant notes (substitution made, unavailable, etc.)"
}

If the item is unavailable or you cannot complete the task, set success to false and explain in notes.

IMPORTANT:
- Do NOT proceed to checkout
- Do NOT navigate away from {CONFIG.store}
- Work only in the tab you created
- Return your result as the final output
```

---

## Batch Coordinator

Use this in the main session to coordinate parallel agents:

```
You are coordinating parallel grocery item agents.

STORE: {CONFIG.store}
ITEMS TO PROCESS:
{list of items with quantities}

WORKFLOW:
1. Load store adapter from ./stores/{CONFIG.store}.md
2. Compute search URLs per adapter specification

3. Launch agents in parallel (check adapter for max count):
   - Use subagent_type: "general-purpose"
   - Set run_in_background: true
   - Use the Grocery Item Agent Prompt template
   - Provide: item_name, quantity, search_url

4. As each agent completes:
   - Log success/failure
   - Launch next queued item
   - Track running subtotal

5. After all items processed:
   - Retry failed items once
   - Compile final report

6. Present checkpoint to user:
   - Total items added
   - Total items failed
   - Estimated subtotal
   - List of unavailable items with alternatives
```

---

## Fulfillment Verification

```
Before adding items, confirm the cart shows:
- {CONFIG.fulfillment} at: {CONFIG.location}

If fulfillment mode is incorrect, change it before proceeding.
```

---

## Reference Files

- `../stores/{store}.md` - Store-specific patterns and selectors
- `../meal-tracking.md` - Meal history for rotation tracking
- `../config.md` - User configuration
