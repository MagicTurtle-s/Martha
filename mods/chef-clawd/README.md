# Chef Clawd

*Chef Clawd is an unofficial fan mod. Clawd and Claude are Anthropic's; this
project is not affiliated with or endorsed by Anthropic.*

A Claude Code mod. Chef Clawd, in a tall puffy toque with a ladle in his right
hand, sits at the right end of the band above the prompt. While a prompt runs,
his kitchen appears and he stirs a pot; every 4 to 8 seconds he steps away for
an act, in an order shuffled for each prompt, and none comes round twice
before all have played. When the prompt ends he is back to idle at once,
wherever the act had got to.

The acts: the kitchen fire, a pancake flip (the last one never comes down),
chopping, a taste test, the long recipe, an oven check and egg juggling.

He appears only in sessions opened in the Martha checkout (or a folder inside
it): a folder, at or above the session's, holding both Martha's skill file
(`.claude/skills/martha/SKILL.md`) and this repository's marketplace file
naming `martha-meal-planning`. A copy of the skill installed for the user
(`~/.claude/skills/martha`) does not count, so sessions elsewhere in the home
folder never show him.

In the desktop app's local Code sessions (and other app surfaces that draw
SVG) he is the full SVG drawing, in an indoor kitchen: he stands at the range
and stirs the saucepan on it. In the terminal he is drawn the way Claude
Code draws its own logo, in flat-colour quadrant blocks four rows tall; there
is no room for a kitchen, so a cauldron rises into view for him to stir, with
five of the acts: the kitchen fire, the pancake flip, chopping, egg juggling
and the taste test. A band narrower than him is left as it was.

When other mods draw rows in the same band (a to-do list, say), he sits
beside them in the band's right quarter, bottom-aligned with them, instead of
under them; their long lines are cut short of his quarter, and their buttons
beside him still take clicks. Beside a short band (a list folded to one line)
he rises only that far. If one of their rows cannot get narrow enough (a long
word, a button or a fixed width would run into his quarter), he steps out of
the band while it shows. Cloud
sessions watched from the Claude app draw no mods, so he does not appear
there.

## Install

Type this at the prompt of a Claude Code session in a terminal (the desktop
app's Code tab does not take the command), answer `y` to add the marketplace,
and pick the user scope:

```
/plugin install chef-clawd --marketplace MagicTurtle-s/Martha
```

Or, from a shell:

```
claude plugin marketplace add MagicTurtle-s/Martha
claude plugin install chef-clawd@martha-meal-planning --scope user
```

The marketplace is this repository; inside it the marketplace is named
`martha-meal-planning`, which is the name the second command uses. Mods are an
early-access part of Claude Code that can change between releases; Chef Clawd
was last tested on Claude Code 2.1.327.

Then open a local Code session in the desktop app. A user-scope mod loads there
too.

To have him only in sessions opened in one checkout, install from that
checkout at the local scope instead (run it in the checkout's folder):

```
claude plugin install chef-clawd --marketplace /path/to/Martha --scope local
```

## Uninstall

```
claude plugin uninstall chef-clawd@martha-meal-planning --scope user
claude plugin marketplace remove martha-meal-planning
```

Use `--scope local` in the first line if you installed him for one checkout.

## Develop

```
claude plugin validate mods/chef-clawd
claude plugin test mods/chef-clawd
```

`hooks/art.ts` holds Chef Clawd and his ladle, `hooks/kitchen.ts` the
kitchen and its saucepan, `hooks/sprites.ts` his parts and props for the acts, and
`hooks/acts/` one file per act. `hooks/timeline.ts` places each act in a
looping programme (`hooks/scene.ts`), so the drawing needs no timers;
`hooks/register.tsx` draws it. The whole drawing must stay under the Svg
element's 131,072 characters, which a test checks.

The terminal drawing is `hooks/terminal/`: `pixels.ts` turns a pixel canvas
into a Raster's cells (two by two pixels to a quadrant block), and `chef.ts`
draws him, the pot and the acts frame by frame; `register.tsx` repaints the
band eight times a second while a prompt runs. The scripts below need Node
22.18 or newer and run from this folder (`mods/chef-clawd`). To look at the
frames without starting Claude Code:

```
node --import ./scripts/resolve-ts.mjs scripts/terminal-preview.ts            # every frame, as ANSI text
node --import ./scripts/resolve-ts.mjs scripts/terminal-preview.ts --play     # a whole prompt, animated
node --import ./scripts/resolve-ts.mjs scripts/terminal-preview.ts --png out.png  # every frame, dark and light
```

To watch the acts, write the preview page and open it in a browser (it has a
slider to scrub through each act and a beat-by-beat storyboard):

```
node --import ./scripts/resolve-ts.mjs scripts/preview.ts
```

Run it in this folder; it writes `preview.html` here. A browser that will not
open local files can use `node scripts/serve.mjs` and http://localhost:4317/.

To render an act as a looping GIF (the README's is made this way), with
Chrome or Edge and ffmpeg installed:

```
node --import ./scripts/resolve-ts.mjs scripts/gif.ts "Kitchen fire" --theme dark --out ../../docs/chef-clawd/kitchen-fire-dark.gif
node --import ./scripts/resolve-ts.mjs scripts/gif.ts --all --out-dir gifs
```

`--all` writes every act in both themes into `gifs/`, which git ignores; copy
the pair you want into `docs/chef-clawd/`.

Each GIF starts at the first stir and ends on a whole stir after the act, so
it loops without a jump. `CHROME` and `FFMPEG` point at the programs when they
are not in the usual places.
