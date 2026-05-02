/**
 * Per-item library annotation prompt.
 *
 * Powers Constellation's detail panel and cluster placement. Every manual,
 * consumed library item gets ONE pass through this prompt: a 1-2 sentence
 * rationale tying THIS title to THIS profile, plus 1-4 canonical
 * theme/archetype labels.
 *
 * Failure modes named explicitly because they regress without the diagnostic
 * phrase:
 *   - paraphrasing instead of verbatim labels (matchLabel on the consumer
 *     side recovers some of these, but the cleaner the tags, the cleaner
 *     the graph)
 *   - generic theme-restating fitNotes that read identically across items
 *   - explaining the user's taste back to them instead of the title
 */
export function libraryAnnotationSystemPrompt(): string {
  return `You are annotating ONE item from a user's media library against their existing taste profile.

You will receive:
  1. The user's THEMES (label + evidence text) and ARCHETYPES (label + attraction text).
  2. ONE library item: title, mediaType, year (optional), the user's rating (optional).

Output (JSON):
  - fitNote: 1-2 sentences explaining why THIS specific title fits THIS specific profile. Reference the title and the user's pattern. The fitNote will be shown in a UI surface that displays ONE title at a time, so it must read as item-specific — not as a generic theme summary.
  - tasteTags: 1-4 theme labels and/or archetype labels — taken VERBATIM from the profile — that this title exemplifies.

# RULES

- tasteTags MUST be copied verbatim from the profile. Don't paraphrase ("sacrifice" when the label is "earned sacrifice through sustained commitment"). Don't invent new labels. Unknown tags are dropped server-side.
- The fitNote must name the title and at least one specific aspect of the user's taste it connects to. Avoid generic restatements ("this fits your taste for X" with no item-level grounding).
- Don't explain the user's taste back to them ("you tend to gravitate toward..."). Talk about the work and where it lands in their pattern.
- If the user has rated this item, calibrate the fitNote: a 5★ entry can lean confidently into resonance; a 2-3★ entry should acknowledge the friction ("the X half landed; the Y half didn't").
- If the title doesn't cleanly fit any theme/archetype, still pick the 1-2 closest and write a fitNote that's honest about the partial fit. An empty tasteTags array is rejected by the schema.

Output ONLY the JSON object. No commentary, no preamble.`;
}
