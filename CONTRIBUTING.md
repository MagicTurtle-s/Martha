# Contributing to Martha

Thank you for your interest in contributing to Martha! This document explains how to contribute, especially for adding support for new grocery stores.

## Ways to Contribute

### 1. Add a New Store Adapter

The most impactful contribution is adding support for a new grocery store. Martha currently supports Kroger, but the architecture is designed to support any store with online ordering.

#### How to Add a Store

1. **Read the spec**: Review `.claude/skills/martha/stores/STORE-ADAPTER-SPEC.md` for the required format
2. **Study the reference**: Look at `stores/kroger.md` as a working example
3. **Create your adapter**: Make a new file `stores/{store-name}.md`
4. **Test manually**: Verify the patterns work by testing in a browser
5. **Submit a PR**: Include test results and any known limitations

#### Stores We'd Love to See

- Walmart
- Instacart (multi-store)
- Amazon Fresh
- Whole Foods
- Safeway/Albertsons
- Publix
- H-E-B
- Costco
- Target
- Aldi (where online ordering available)

### 2. Improve Existing Adapters

If you use a supported store and find issues:

- Document new element patterns that work better
- Add optimized search terms for common items
- Report and fix known issues
- Add direct product URLs for staple items

### 3. Recipe Source Integrations

Help improve recipe discovery:

- Document patterns for popular recipe sites
- Add dietary filter strategies for different sites
- Improve recipe parsing accuracy

### 4. Documentation

- Improve setup instructions
- Add troubleshooting guides
- Translate documentation
- Create video tutorials

## Submitting a Pull Request

### For Store Adapters

Your PR should include:

1. **The adapter file**: `stores/{store-name}.md`
2. **Test results**: Brief description of what you tested
3. **Known limitations**: Any issues or unsupported features
4. **Region info**: What countries/regions this works in

### PR Template

```markdown
## Store Adapter: {Store Name}

### Tested Features
- [ ] Search and add to cart
- [ ] Quantity adjustment
- [ ] Fulfillment mode selection (pickup/delivery)
- [ ] Cart verification
- [ ] Parallel agent compatibility

### Test Environment
- Region: {country/state}
- Date tested: {date}
- Browser: Chrome with Claude for Chrome extension

### Known Limitations
- {any issues or unsupported features}

### Screenshots
{optional: include relevant screenshots}
```

## Code of Conduct

- Be respectful and constructive
- Test your contributions before submitting
- Document any limitations honestly
- Help others who are trying to contribute

## Questions?

Open an issue if you have questions about contributing or need help with a store adapter.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
