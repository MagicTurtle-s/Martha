# Store Adapter Specification

This document defines the interface for contributing grocery store adapters to Martha.

## Overview

Each store adapter is a markdown file in the `stores/` directory that provides Martha with the information needed to automate cart building for that store. Adapters must follow this specification to ensure compatibility with Martha's parallel agent architecture.

## File Structure

Create a new file: `stores/{store-name}.md`

Example: `stores/walmart.md`, `stores/instacart.md`

## Required Sections

### 1. Store Metadata

```markdown
# {Store Name} Adapter

| Property | Value |
|----------|-------|
| Store | {Store Name} |
| Website | {base URL} |
| Supported Regions | {countries/regions} |
| Fulfillment Options | {Pickup, Delivery, Ship} |
| Login Required | Yes/No |
| Parallel Agent Compatible | Yes/No |
```

### 2. URLs

Define URL patterns for navigation:

```markdown
## URLs

| Purpose | URL Pattern |
|---------|-------------|
| Homepage | `https://...` |
| Search | `https://.../search?query={QUERY}` |
| Cart | `https://.../cart` |
| Product Page | `https://.../product/{id}` |

### Search URL Notes
- How to encode search terms
- Available filters (fulfillment, dietary, etc.)
- Example searches
```

### 3. Authentication

How to verify user is logged in:

```markdown
## Authentication

### Verification
- What element indicates logged-in state?
- Where does the username appear?
- How to detect login wall?

### Login Flow
- Where is the login button?
- What authentication methods are supported?
- Any special handling needed?
```

### 4. Store/Location Selection

How to set the user's store:

```markdown
## Store Selection

### Setting Store Location
- How to access store selector?
- Search by ZIP or address?
- How to verify correct store is set?

### Fulfillment Mode
- How to switch between Pickup/Delivery?
- Where is this displayed?
- How to verify fulfillment mode?
```

### 5. Product Search

How to search and identify products:

```markdown
## Product Search

### Search Results Page
- How are products displayed? (grid, list)
- What information is visible per product?
- How to identify "Add to Cart" button?

### Element Patterns
| Element | Selector/Pattern |
|---------|------------------|
| Product card | ... |
| Product name | ... |
| Price | ... |
| Add to Cart button | ... |
| Quantity controls | ... |

### Availability Indicators
- How to know if item is available for pickup/delivery?
- How to identify out-of-stock items?
```

### 6. Add to Cart

The critical interaction pattern:

```markdown
## Add to Cart

### Primary Flow
1. Step-by-step instructions
2. What to click
3. How to verify success

### Button States
| State | Appearance | Action |
|-------|------------|--------|
| Not in cart | ... | ... |
| In cart | ... | ... |
| Unavailable | ... | ... |

### Quantity Adjustment
- How to increase/decrease quantity?
- Where are +/- controls?
- Max quantity limits?

### Success Verification
- How to confirm item was added?
- Cart badge update?
- Confirmation toast/modal?
```

### 7. Cart Verification

How to verify cart contents:

```markdown
## Cart Verification

### Cart Page
- URL to cart
- How items are displayed
- How to get total count and subtotal

### Reading Cart Contents
- Item name location
- Quantity location
- Price location
- Remove button location
```

### 8. Parallel Agent Compatibility

Requirements for parallel execution:

```markdown
## Parallel Agent Compatibility

### Tab Management
- Can multiple tabs be open?
- Any session/cookie conflicts?
- Rate limiting considerations?

### Agent Configuration
| Setting | Recommended Value |
|---------|-------------------|
| Max parallel agents | ... |
| Delay between adds | ... |
| Timeout per item | ... |

### Return Format
Agents must return this JSON structure:
{json format here}
```

### 9. Known Issues

Document quirks and workarounds:

```markdown
## Known Issues & Workarounds

| Issue | Workaround |
|-------|------------|
| ... | ... |
```

### 10. Pre-Built Search Terms

Optimized searches for common items:

```markdown
## Optimized Search Terms

| Item Type | Search Query |
|-----------|--------------|
| GF pasta | ... |
| DF cheese | ... |
```

---

## Example: Minimal Adapter

See `stores/kroger.md` for a complete reference implementation.

## Contributing

1. Copy this spec as a template
2. Fill in all required sections for your store
3. Test the patterns manually in a browser
4. Submit a pull request with your adapter
5. Include test results in your PR description

## Notes

- All adapters assume Claude for Chrome (MCP tools) for browser automation
- Users must authenticate manually; adapters only verify login status
- Adapters should be region-aware (same store may differ by country)
- Include any store-specific dietary filters available
