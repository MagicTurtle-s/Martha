# Martha: AI Meal Planning & Grocery Shopping Assistant

Automated weekly meal planning and grocery shopping workflow powered by Claude Code with parallel browser automation.

## Features

- **Personalized Setup** - Interactive interview configures Martha for your household
- **Weather-Aware Meals** - Suggests appropriate meals based on forecast (no hot soups in summer)
- **Flexible Recipe Sources** - Pinterest boards, favorite blogs, or web search
- **Dietary Restriction Handling** - Supports GF, DF, vegan, keto, allergies, and more
- **Parallel Cart Building** - Uses multiple browser agents to build grocery carts fast
- **Meal Rotation Tracking** - Prevents repeating meals too frequently
- **Multi-Store Support** - Extensible architecture for community store adapters

## Requirements

- **Claude Code** (CLI) - [Installation guide](https://docs.anthropic.com/en/docs/claude-code)
- **Claude for Chrome** extension - Required for browser automation
- **Supported Grocery Store Account** - Currently: Kroger (more coming via community contributions)

## Quick Start

1. Clone this repository:
   ```bash
   git clone https://github.com/MagicTurtle-s/martha.git
   cd martha
   ```

2. Launch Claude Code:
   ```bash
   claude
   ```

3. Start meal planning:
   ```
   Martha, help me meal plan
   ```

4. On first run, Martha will interview you to set up your:
   - Family members and dietary needs
   - Meal preferences (servings, cook time, appliances)
   - Recipe sources
   - Grocery store and location
   - Budget and brand preferences

5. Your configuration is saved to `.claude/skills/martha/config.md` for future sessions.

## Usage

### Trigger Phrases

Martha responds to:
- "Martha, help me meal plan"
- "Help me grocery shop, Martha"
- "Meal plan for this week"
- "What should we eat"
- "Plan our meals"
- "I need a grocery list"

### Workflow

1. **Weather Check** - Fetches 7-day forecast to inform meal suggestions
2. **Recipe Discovery** - Browses your configured sources for matching recipes
3. **Meal Selection** - Presents 4-5 options, you select 3-4
4. **Ingredient Extraction** - Parses recipes, consolidates shopping list
5. **Parallel Cart Building** - Spawns multiple agents to add items concurrently
6. **Verification** - Presents cart summary for your approval
7. **Handoff** - You complete checkout manually

### Commands

| Command | Action |
|---------|--------|
| "Update my settings" | Re-run interview or edit specific sections |
| "Show my config" | Display current configuration |
| "Add a family member" | Update family profile |
| "Change my store" | Update grocery store settings |

## File Structure

```
martha/
├── .claude/skills/martha/
│   ├── SKILL.md              # Main skill definition
│   ├── config.md             # Your config (gitignored, created by interview)
│   ├── config-example.md     # Example configuration
│   ├── meal-tracking.md      # Meal history for rotation
│   ├── stores/
│   │   ├── STORE-ADAPTER-SPEC.md   # How to add new stores
│   │   └── kroger.md               # Kroger adapter
│   └── prompts/
│       └── chrome-prompts.md       # Browser automation templates
├── .gitignore
├── CONTRIBUTING.md
├── LICENSE
└── README.md
```

## Supported Stores

| Store | Status | Notes |
|-------|--------|-------|
| Kroger | Supported | Pickup and Delivery |
| Walmart | Coming Soon | Contributions welcome |
| Instacart | Coming Soon | Contributions welcome |

Want to add your grocery store? See [CONTRIBUTING.md](CONTRIBUTING.md).

## Configuration

Martha stores your preferences in `.claude/skills/martha/config.md`. This file is gitignored to protect your personal data.

### What's Configurable

- **Family Profile** - Names, ages, dietary restrictions, allergies
- **Meal Preferences** - Meals per week, servings, prep/cook time limits, appliances
- **Recipe Sources** - Pinterest board, blogs, or web search
- **Grocery Store** - Store, location, pickup vs delivery
- **Budget & Brands** - Weekly budget, preferred specialty brands
- **Nutrition Targets** - Optional macro tracking

See `config-example.md` for a complete example.

## Parallel Shopping Architecture

Martha uses Claude Code's Task subprocess capability for efficient cart building:

- **Up to 4 parallel agents** per batch
- Each agent handles one item: search → find → add to cart
- Results aggregated by main session
- Failed items retried once at end

This approach is 2-3x faster than sequential item addition.

## Privacy

- Your `config.md` is gitignored and never committed
- Personal data stays on your machine
- Store logins are handled by you manually
- Martha only automates post-authentication actions

## Contributing

We welcome contributions! The most impactful way to contribute is adding support for new grocery stores.

See [CONTRIBUTING.md](CONTRIBUTING.md) for:
- How to add a store adapter
- Store adapter specification
- PR guidelines

## License

MIT License - See [LICENSE](LICENSE) file.

## Acknowledgments

Built with [Claude Code](https://docs.anthropic.com/en/docs/claude-code) by Anthropic.
