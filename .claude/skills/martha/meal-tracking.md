# Meal History Tracker

Track confirmed meals for rotation management. This document is the single source of truth for meal history.

## Current History

| Date | Meal Name | Protein | Recipe URL | Notes |
|------|-----------|---------|------------|-------|
| | | | | |

## Rotation Rules

| Rule | Requirement |
|------|-------------|
| Same meal | Wait 3+ weeks before suggesting again |
| Similar meals | Wait 1+ week (e.g., chicken tacos then beef tacos) |
| Same protein | Limit to 2x per week max |

## Similarity Groups

Meals in the same group count as "similar" for rotation purposes:

| Group | Meals |
|-------|-------|
| Tacos/Burritos | Chicken tacos, beef tacos, fish tacos, burrito bowls |
| Stir Fry | Chicken stir fry, beef stir fry, shrimp stir fry |
| Pasta | Any pasta dish regardless of protein |
| Bowls | Buddha bowls, grain bowls, rice bowls |
| Soups/Stews | Any soup or stew |

## How to Update

After each meal planning session:

1. Add new rows for each confirmed meal
2. Include the date, meal name, primary protein, and recipe URL
3. Add any notes (modifications, family feedback, etc.)

## Querying History

To check recent meals before planning:

1. Use `conversation_search` tool with keywords like "meal plan" or "confirmed meals"
2. Review this document for the last 3 weeks of entries
3. Build exclusion list from both sources
