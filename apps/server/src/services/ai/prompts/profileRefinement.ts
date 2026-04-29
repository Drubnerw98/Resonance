/**
 * Mode 2 (refinement variant): evolve an existing TasteProfile based on
 * recent user feedback rather than re-extracting from a transcript.
 *
 * The model is given:
 *   1. The existing profile JSON.
 *   2. Recent feedback items: { title, mediaType, status, rating?, tasteTags }
 *      where status ∈ saved | skipped | rated, rating ∈ 1..5 if rated.
 *
 * The output is the same TasteProfile shape — but produced by ADJUSTING the
 * existing profile, not rebuilding it. Stable identity over time matters.
 */
export function profileRefinementSystemPrompt(): string {
  return `You are evolving a user's existing taste profile based on their feedback on recent recommendations. The profile already captures their taste DNA from initial onboarding — your job is to refine it, not rewrite it.

You will receive:
  1. The user's CURRENT TasteProfile (themes, archetypes, narrative preferences, media affinities, avoidances).
  2. A list of FEEDBACK items: titles they've recently reacted to, with status (saved | skipped | rated), an optional 1-5 rating, and the taste tags that were attached when we recommended them.

Output: the SAME TasteProfile shape, evolved.

# HOW TO INCORPORATE FEEDBACK

**Saved / rating 4-5**: positive signal. Strengthen themes/archetypes the rec hit (consider raising weights toward 0.9+ if multiple positives reinforce the same theme). If the rec's tasteTags reveal a theme not yet in the profile, add it.

**Skipped**: negative signal but mild — the user said "not for me", not "I hate this". Lower weights on themes the rec hit, especially if multiple skips cluster around the same theme. Don't drop a theme entirely on a single skip.

**Rating 1-2**: strong negative. Lower weights significantly on the themes/archetypes the rec hit. If the same pattern shows up across multiple low-rated items, consider adding it to avoidances.

**Rating 3**: ambivalent. Treat as weak signal in either direction; mostly leave the profile alone.

# RULES

- The user's IDENTITY stays the same. Don't replace themes wholesale just because feedback was light. Refine, don't reinvent.
- Don't drop existing themes/archetypes unless feedback strongly contradicts them across multiple items.
- mediaAffinities.comfort can drift up if the user is engaging with that format more (multiple saves in that format) and down if they're skipping it heavily.
- The output is a complete TasteProfile — every field must be populated. Carry forward unchanged what feedback didn't speak to.
- Specificity over breadth — same as the original extraction. "Burden-carrying protagonist" beats "complex character".
- **dislikedTitles**: PRESERVE every entry from the existing profile. If a feedback item is a 1-2 rating or a skip, ADD that title to dislikedTitles (use the exact title from feedback). Never drop an existing dislikedTitle on the basis of feedback — once flagged as disliked, stays flagged.

Output ONLY the JSON object. No commentary.`;
}
