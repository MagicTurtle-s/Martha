# Martha by voice (Alexa): interview questions

> **This file does NOT hold the answers.** Answers live only in
> `plans/alexa-voice/decision-ledger.json`. A "(Recommended)" mark here says what Claude
> suggested, never what was chosen.
>
> Household names are left out on purpose: this repository is the source of a public release.

Started 2026-11-16. Branch `Alexa-developer-trial`.

## Where things stand

- An Amazon developer account exists and a test skill ("martha test", hosted free by Amazon)
  opened and answered from the Alexa phone app on the household's account (2026-11-16). So a
  skill only this household uses does run on its Alexa+.
- Already chosen in chat (SCOPE-1): the first version takes **notes to Martha**: how a meal
  went, items the house is out of, and preferences. Martha interprets and files them for the
  next plan, a standing preference, or the cart. His examples: "Martha, I'm out of ground
  cumin" and "[a child] really liked [a meal] tonight". Reading the plan out loud and starting
  a run by voice were offered and not picked.
- Still open: where Martha does the work (SCOPE-2). He asked to settle what success looks like
  first, then choose around cost and feasibility.

## Assumptions stated instead of asked (overturn any one in a word)

| id | assumption |
|---|---|
| VOICE-1 | The phrase is "Alexa, tell Martha ...". An Echo can't wake on "Martha" itself. Whether "Martha" alone is accepted as the skill's name, or needs a second word, is a lookup Claude runs (NAME-1). |
| ITEM-1 | "Alexa, add ground cumin to the grocery list" already works today with no build, because Martha reads that list into the cart. The skill takes items too, and both paths end in the next cart. |
| WHO-1 | Anyone in the house can leave a note. The first version doesn't tell voices apart; people name who they mean ("[a child] liked ..."). |
| FILE-1 | At the start of the next Martha run, every note is shown with how it was filed, so a misheard or misfiled note is caught before it shapes a plan. |
| PREF-1 | "[A person] liked [a meal]" is recorded on that recipe in the speaker's own words and nudges its rating. No new per-person preference tracking in the first version. The config's child has no name yet, so Martha asks once who a name refers to. |
| HOST-1 | Taking notes happens in Amazon's free hosting, so it works with the PC off. Notes wait in a private mailbox until Martha picks them up. Which mailbox is round 2 (MAIL-1). |

## Sitting 1: what success looks like (3 questions)

### SUCC-1: A month in, what makes this a success?

**Situation.** He asked to define success before choosing how to build. The answer becomes the
acceptance checks for the first version.

| option | what it costs |
|---|---|
| We stop losing notes: things we'd forget by planning day get said once and turn up at planning | Nothing extra; this is the core of the build |
| Plans visibly learn: next week's plan reflects what we said | Martha's planning step must cite the notes it used |
| The whole house uses it, not only him | Phrasing has to forgive loose wording; voice ID may follow later |
| Planning goes faster: the planning run asks fewer questions because notes already answered them | Martha's feedback step must check notes before asking |

Multiple choice; no recommendation. **Why it matters:** it sets what "done" is checked against.
**Unblocks:** the acceptance checks in the build plan.

### TALK-1: Right after a note, what should Alexa say?

**Situation.** Taking a note needs no AI. Understanding it on the spot does: the skill would call
Claude through the paid API, because Alexa allows about 8 seconds per answer and the Max plan
doesn't cover API calls.

| option | what it costs |
|---|---|
| **"Got it"; Martha files it at the next run (Recommended)** | Free; no new keys. A misheard note is caught when the next run shows it (FILE-1) |
| Read back what Martha understood ("cumin goes on next week's list"), and ask if it's unclear | A Claude API key he creates, and a small pay-per-use bill on top of the Max plan |

**Why it matters:** it decides whether any paid service or new key is needed at all.
**Unblocks:** SCOPE-2, MAIL-1.

### CART-1: When should a spoken item reach Kroger?

**Situation.** The Kroger sign-in lives only on the PC, and only one copy can work, because
Kroger replaces it on every use (KROGER-SETUP.md).

| option | what it costs |
|---|---|
| **At the next Martha run: it lands in that week's cart (Recommended)** | Nothing; the Kroger sign-in stays on the PC |
| Straight into the Kroger cart right away, riding on whatever order is placed next | The Kroger sign-in moves to the cloud, and Martha's weekly cart step must use it from there |

**Why it matters:** it is the one thing that would force Martha's Kroger access off the PC.
**Unblocks:** SCOPE-2.

## Sitting 2: build mechanics (3 questions)

Found before asking (NAME-1): Amazon rejects a one-word name ("Invocation name must be at least
2 words"), and a one-line command ("tell martha test hello") reaches the skill directly on Alexa+
in the simulator. New assumption CTX-1 (household data that leaves the PC) and known risk
CAPTURE-1 (whether a whole spoken sentence reaches the skill) are in the ledger.

### READ-2: Who understands a note for the read-back?

**Situation.** He chose a read-back (TALK-1). Prices: the claude-api skill's model table, cached
2026-11-03; estimate at 10 notes a day.

| option | what it costs |
|---|---|
| **Claude Haiku 5.5 understands any wording (Recommended)** | About 15 cents a month; an Anthropic API key he creates, loaded with a small prepaid amount |
| Alexa's own fixed note types ("out of X", "NAME liked MEAL"); anything else read back word for word | Free, no key; loose wording isn't understood, which works against "the whole house uses it" |
| Claude Opus 5.5 | About $6 a month; slower, so closer to Alexa's 8-second limit |

**Why it matters:** it decides whether a paid key exists at all. **Unblocks:** the skill's code.

### MAIL-1: Where do notes wait?

**Situation.** The PC can't read the storage that comes with Amazon's free hosting, so notes
need a place both sides reach.

| option | what it costs |
|---|---|
| **A private GitHub repository (Recommended)** | Free; a GitHub key limited to that one repository, held by the skill; the PC already signs in to GitHub |
| His own AWS account linked to the skill | Notes stay inside Amazon; an AWS account to create (free tier) and link |

**Why it matters:** it is the only new place household notes are kept. **Unblocks:** the PC
pickup step.

### NAME-2: What two-word name does the household say?

| option | what it costs |
|---|---|
| **Chef Martha (Recommended)**: "Alexa, tell Chef Martha the chili was a hit" | Nothing; changeable any time, since this skill is never published |
| Martha Kitchen | Same |
| Martha Meals | Same |

**Why it matters:** everyone says it every day. **Unblocks:** the skill's name.

### Assumptions added after sitting 2

| id | assumption |
|---|---|
| AWS-1 | One DynamoDB table in us-east-1. The skill's borrowed role may only add notes and read the week's context; the PC's key may only read and delete notes and write the context. |
| AWS-2 | A $1 monthly budget alert emails him if the account ever costs anything. |
