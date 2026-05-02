import { and, eq } from "drizzle-orm";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { db } from "../../db/index.js";
import { libraryItems, type LibraryItemRow } from "../../db/schema.js";
import { getActiveProfile } from "../profile.js";
import { getAnthropic, ONBOARDING_MODEL } from "./client.js";
import { libraryAnnotationSystemPrompt } from "./prompts/libraryAnnotation.js";
import {
  LibraryAnnotationSchema,
  type LibraryAnnotation,
} from "./schemas.js";

const ANNOTATION_MODEL = ONBOARDING_MODEL;

export interface AnnotateResult {
  annotation: LibraryAnnotation;
  /** The profile version active during annotation. Persisted alongside so
   * future regen logic can detect drift without timestamp comparisons. */
  profileVersion: number;
}

/**
 * Annotate one manual+consumed library item against the user's active taste
 * profile. Caller is responsible for persisting the result and for skipping
 * watchlist items / non-manual sources (this function will throw on those —
 * defensive guard, not user-state error).
 *
 * Returns both the annotation and the profile version it was generated
 * against, so the persist step can store `annotated_at_profile_version`
 * atomically without a second query.
 */
export async function annotateLibraryItem(
  userId: string,
  libraryItemId: string,
): Promise<AnnotateResult> {
  const [item] = await db
    .select()
    .from(libraryItems)
    .where(
      and(eq(libraryItems.id, libraryItemId), eq(libraryItems.userId, userId)),
    )
    .limit(1);

  if (!item) {
    throw new Error(
      `annotateLibraryItem: item ${libraryItemId} not found for user ${userId}`,
    );
  }

  // Defensive: callers must filter before calling. Annotating a watchlist
  // entry presupposes experience the user hasn't had; annotating an import
  // is bounded but pointless cost. Both are caller bugs, not user errors.
  if (item.source !== "manual") {
    throw new Error(
      `annotateLibraryItem: refusing to annotate non-manual source "${item.source}"`,
    );
  }
  if (item.status !== "consumed") {
    throw new Error(
      `annotateLibraryItem: refusing to annotate non-consumed status "${item.status}"`,
    );
  }

  const profileRow = await getActiveProfile(userId);
  if (!profileRow) {
    throw new Error(
      `annotateLibraryItem: user ${userId} has no active profile`,
    );
  }
  const profile = profileRow.profileData;

  // Trim the payload sent to the model. Themes + archetypes is what drives
  // tag selection; narrativePrefs and mediaAffinities add tokens for no
  // signal and (for affinities) create a self-referential loop when the
  // item being annotated is itself a favorite.
  const trimmedProfile = {
    themes: profile.themes,
    archetypes: profile.archetypes,
  };

  const userMessage = [
    `# Profile`,
    "",
    JSON.stringify(trimmedProfile, null, 2),
    "",
    `# Library item`,
    "",
    `- Title: ${item.title}`,
    `- Format: ${item.mediaType}`,
    `- Year: ${item.year ?? "n/a"}`,
    `- User's rating: ${item.rating != null ? `${item.rating}/5` : "unrated"}`,
  ].join("\n");

  const client = getAnthropic();
  const response = await client.messages.parse({
    model: ANNOTATION_MODEL,
    max_tokens: 600,
    system: libraryAnnotationSystemPrompt(),
    messages: [{ role: "user", content: userMessage }],
    output_config: {
      format: zodOutputFormat(
        LibraryAnnotationSchema as unknown as Parameters<
          typeof zodOutputFormat
        >[0],
      ),
    },
  });

  if (!response.parsed_output) {
    throw new Error(
      `annotateLibraryItem: model did not return a parseable annotation (stop_reason=${response.stop_reason})`,
    );
  }

  const parsed = LibraryAnnotationSchema.parse(response.parsed_output);

  // Filter tasteTags against canonical labels. The prompt instructs verbatim
  // labels; the model paraphrases anyway. Drop anything that doesn't exact-
  // match a known label — Constellation's matchLabel already does fuzzy
  // recovery on the consumer side, but the cleaner the tags arrive, the
  // tighter the cluster anchor.
  const knownLabels = new Set<string>([
    ...profile.themes.map((t) => t.label),
    ...profile.archetypes.map((a) => a.label),
  ]);
  const filtered = parsed.tasteTags.filter((tag) => knownLabels.has(tag));

  return {
    annotation: {
      fitNote: parsed.fitNote,
      // Empty tasteTags is allowed downstream (Constellation falls back to
      // title-substring matching). If the model produced only invented
      // labels, we'd rather ship empty than fabricate.
      tasteTags: filtered,
    },
    profileVersion: profileRow.currentVersion,
  };
}

/**
 * Persist an annotation onto the row. Split from `annotateLibraryItem` so
 * the inline POST handler and the backfill script can both reuse the
 * generation step without coupling to a particular update shape.
 */
export async function persistAnnotation(
  itemId: string,
  result: AnnotateResult,
): Promise<LibraryItemRow | null> {
  const [updated] = await db
    .update(libraryItems)
    .set({
      fitNote: result.annotation.fitNote,
      tasteTags: result.annotation.tasteTags,
      annotatedAtProfileVersion: result.profileVersion,
    })
    .where(eq(libraryItems.id, itemId))
    .returning();
  return updated ?? null;
}
