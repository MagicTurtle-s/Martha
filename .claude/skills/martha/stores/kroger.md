# Kroger Adapter

Reference implementation for grocery store automation.

| Property | Value |
|----------|-------|
| Store | Kroger |
| Website | https://www.kroger.com |
| Supported Regions | United States |
| Fulfillment Options | Pickup, Delivery |
| Login Required | Yes |
| Parallel Agent Compatible | Yes |

## URLs

| Purpose | URL Pattern |
|---------|-------------|
| Homepage | `https://www.kroger.com/` |
| Search | `https://www.kroger.com/search?query={QUERY}` |
| Cart | `https://www.kroger.com/cart` |
| Product Page | `https://www.kroger.com/p/{product-slug}/{upc}?fulfillment=PICKUP` |

### Search URL Notes

- URL-encode spaces as `%20`
- Add `?fulfillment=PICKUP` to filter pickup-available items
- Example: `https://www.kroger.com/search?query=gluten%20free%20pasta`

## Authentication

### Verification

- Look for account name in top-right header area
- Logged-out state shows "Sign In" link
- Login wall may appear when accessing cart or checkout

### Login Flow

1. User clicks "Sign In" in header
2. User enters credentials manually (Martha does not handle passwords)
3. Martha waits for login confirmation before proceeding

## Store Selection

### Setting Store Location

1. Click on "Pickup at {Store}" button in header
2. Store selector modal appears
3. Search by ZIP code or address
4. Select store from results list

### Fulfillment Mode

- Displayed as "Pickup at {Store Name}" or "Delivery to {Address}"
- Click to open modal and switch between modes
- Must be set to Pickup or Delivery (not "Ship") for grocery items

### Verification

Check for text pattern: "Pickup at" or "Delivery to" in header area

## Product Search

### Search Results Page

- Products displayed in responsive grid
- Each product card shows: image, name, price, size/unit
- "Add to Cart" button appears on each card

### Element Patterns

| Element | Pattern |
|---------|---------|
| Product card | Grid item with product image |
| Product name | Text within card, usually linked |
| Price | Displayed prominently, may show sale price |
| Add to Cart button | `button "Add to Cart: {Product Name}"` |
| Quantity controls | `-` `{qty}` `+` buttons (after adding) |

### Availability Indicators

- "Available for pickup" badge/text
- Grayed out or "Unavailable" for out-of-stock
- "In-store only" means not available for pickup/delivery

## Add to Cart

### Primary Flow

1. Navigate to search URL with encoded query
2. Wait 2 seconds for results to load
3. Scroll once to expose Add to Cart buttons
4. Use `read_page` to get element refs
5. Click "Add to Cart" via ref (not coordinates)
6. Wait 1 second for cart update
7. Verify via cart badge increment or "X in Cart" text

### Button States

| State | Appearance | Action |
|-------|------------|--------|
| Not in cart | "Add to Cart" button | Click to add |
| In cart | `-` `{qty}` `+` controls | Adjust quantity |
| Unavailable | Grayed out / "Unavailable" | Skip, note in results |

### Quantity Adjustment

- After adding, product shows `-` and `+` buttons with quantity between
- Click `+` to increase, `-` to decrease
- Quantity of 0 removes from cart

### Success Verification

- Cart icon badge in header increments
- Product card shows "X in Cart" or quantity controls
- Brief toast notification may appear

## Cart Verification

### Cart Page

- URL: `https://www.kroger.com/cart`
- Items listed with image, name, quantity, price
- Running subtotal displayed

### Reading Cart Contents

- Item name: Product title in cart row
- Quantity: Number between `-`/`+` controls
- Price: Per-item and line total
- Remove: "Remove" link or trash icon per item

## Parallel Agent Compatibility

### Tab Management

- Multiple tabs can be open to kroger.com
- Session cookies shared across tabs (one login works for all)
- Each agent should create its own tab via `mcp__claude-in-chrome__tabs_create_mcp`

### Agent Configuration

| Setting | Recommended Value |
|---------|-------------------|
| Max parallel agents | 4 |
| Delay between batches | 2 seconds |
| Timeout per item | 60 seconds |
| Wait after navigation | 2 seconds |
| Wait after click | 1 second |

### Return Format

Each agent must return:

```json
{
  "item": "original item name from request",
  "qty_requested": 2,
  "qty_added": 2,
  "success": true,
  "product_name": "Exact product name from Kroger",
  "price": "$3.29",
  "notes": "Any relevant notes"
}
```

### Agent Prompt Template

```
You are a grocery item agent. Your task is to add ONE item to the Kroger cart.

ITEM: {item_name}
QUANTITY: {quantity}
SEARCH URL: {search_url}

Instructions:
1. Create a new browser tab using mcp__claude-in-chrome__tabs_create_mcp
2. Navigate to the search URL
3. Wait 2 seconds for results to load
4. Use mcp__claude-in-chrome__read_page to find product elements
5. Find the best matching product that is:
   - Available for pickup/delivery
   - Meets dietary requirements if specified
   - Reasonably priced
6. Click "Add to Cart" using mcp__claude-in-chrome__computer with ref parameter
7. Adjust quantity if needed using the +/- controls
8. Wait 1 second for cart update

Return your result as JSON (format above).

IMPORTANT:
- Do NOT proceed to checkout
- Do NOT navigate away from Kroger
- Work only in the tab you created
```

## Known Issues & Workarounds

| Issue | Workaround |
|-------|------------|
| Add to Cart button not visible | Scroll down 2 ticks before reading page |
| Button click doesn't register | Use ref-based click, not coordinates |
| Cart count doesn't update | Wait 2 seconds, then screenshot to verify |
| Login wall appears | Pause, alert user to re-authenticate |
| Item unavailable for pickup/delivery | Try alternative brand, note substitution |
| BOGO not auto-applied | BOGOs apply at checkout; note deal in summary |
| Price not loading | Refresh, retry once, then skip |

## Optimized Search Terms

| Item Type | Search Query |
|-----------|--------------|
| GF pasta | `barilla gluten free` |
| DF cheese | `violife cheese` |
| DF butter | `earth balance` or `miyokos butter` |
| GF bread | `canyon bakehouse` |
| GF soy sauce | `tamari` |
| Yogurt pouches | `once upon a farm pouch` |
| GF crackers | `simple mills crackers` |
| GF flour | `bobs red mill 1 to 1` |

## Direct Product URLs (Staples)

For frequently-purchased items, skip search entirely:

| Item | URL Path |
|------|----------|
| GF Chicken Broth | `/p/kroger-less-sodium-fat-free-chicken-broth/0001111004970?fulfillment=PICKUP` |
| Fresh Limes | `/p/fresh-limes-each/0000000004048?fulfillment=PICKUP` |
| Cilantro | `/p/cilantro/0000000004889?fulfillment=PICKUP` |
| Garlic | `/p/garlic/0000000004608?fulfillment=PICKUP` |
| Yellow Onion | `/p/jumbo-yellow-onions/0000000004093?fulfillment=PICKUP` |

## Error Recovery

| Error State | Recovery Action |
|-------------|-----------------|
| Session timeout | Re-navigate to kroger.com, check login status |
| Cart rollback | Navigate to /cart, verify actual contents |
| Item not found | Try broader search term, then alternative brand |
| Wrong fulfillment mode | Click store selector, change to Pickup |

## Screenshot Strategy

| When to Screenshot | When to Skip |
|--------------------|--------------|
| After navigation to new page | After simple scroll |
| Before checkpoint report | Between consecutive adds |
| When debugging failed click | After successful ref-based click |
| Cart verification | Mid-batch item additions |
