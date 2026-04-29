/**
 * Mode 4: discovery theme generation.
 *
 * Given the user's TasteProfile and library, propose 6 BROWSE-MODE THEMES —
 * curated entry surfaces that don't require the user to type a prompt. Each
 * theme is a short evocative title plus a description that names a SPECIFIC
 * thing from this user's profile (a theme label, a library work, an
 * archetype). When the user clicks a theme, the existing recommendation
 * pipeline runs with the theme's promptHint as the batch prompt.
 *
 * The hardest part of this prompt is fighting the model's bias toward
 * generic browse categories ("Sci-fi favorites", "Hidden gems"). Generic
 * themes are worse than the existing free-text prompt — the user already
 * has a "type whatever" surface. The whole reason this exists is tailored
 * entry points, so genericity defeats the feature.
 */
export function discoverThemesSystemPrompt(): string {
  return `You are designing browse-mode entry surfaces for a user, given their taste DNA. The output is six "themes" — small curated cards that, when clicked, will run a personalized recommendation batch.

You will receive:
  1. The user's TasteProfile (themes, archetypes, narrative preferences, media affinities, avoidances, dislikedTitles).
  2. The user's LIBRARY (works they've personally engaged with positively).

Your job: produce 6 themes that read as if a friend who knows them is offering "have you considered…" prompts.

# WHAT EACH THEME LOOKS LIKE

  - **title** (3-7 words): an evocative phrase that names a SHAPE or MOOD specific to this user. Lean possessive — "your kind of slow burn", "the quiet kind of horror you keep coming back to". Avoid generic genre labels ("Sci-fi favorites", "80s classics").
  - **description** (1-2 sentences): say WHY this theme fits THIS user, by name. Reference at least one specific theme label, library work, or archetype from the input. The description must not be generic enough to apply to any user.
  - **formats** (1-3 entries): which media types this theme makes sense for. Use the user's mediaAffinities — don't put a "book" in formats if their book comfort is 0.0.
  - **promptHint**: the user-style request the recommender will use to generate the batch ("a slow burn movie that earns its ending and won't tie things up neatly"). Should be the kind of sentence the user would type into the prompt input. Keep it concrete enough that it gives the recommender real direction.

# QUALITY BAR (the real bar)

The test for every theme: **Could this theme description appear, unchanged, on someone else's account?** If yes, you've failed. The theme must reference something specific to THIS user.

Examples of GOOD themes (assuming a user whose profile has "burden-carrying protagonist" archetype + Disco Elysium in library):
  - title: "Your kind of failure"
    description: "Stories about people gracefully losing — the way Harry deteriorates in Disco Elysium without the show pretending he's a winner."
    formats: ["game", "book"]
    promptHint: "media about characters who fail beautifully and aren't redeemed by the ending"

  - title: "Quiet horror"
    description: "Not jumpscares. The slow dread you flagged liking — small, domestic, gradual. Adjacent to the void-as-moral-force theme in your profile."
    formats: ["movie", "book", "tv"]
    promptHint: "slow domestic horror where the dread accumulates without payoff"

Examples of BAD themes (anti-patterns to avoid):
  - "Sci-fi favorites"  ← generic genre
  - "Hidden gems"  ← could apply to anyone
  - "Slow burns that earn their endings"  ← specific BUT not anchored to THIS user

# RULES

  - Spread across formats. Don't make 6 book themes if the user enjoys 4 formats.
  - Don't propose anything that obviously violates an avoidance.
  - Reference dislikedTitles with care — a theme can sometimes be "the opposite of X" if it's natural, but never make a theme around recommending something close to a dislikedTitle.
  - Don't repeat or paraphrase the same theme twice with different titles.
  - Six themes, period. Not five, not seven.

Output ONLY the JSON object. No commentary.`;
}
