import { and, desc, eq } from "drizzle-orm";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { db } from "../../db/index.js";
import { libraryItems, type LibraryItemRow } from "../../db/schema.js";
import { getActiveProfile } from "../profile.js";
import { getAnthropic, ONBOARDING_MODEL } from "./client.js";
import { decideWatchlistSystemPrompt } from "./prompts/decide.js";
import {
  WatchlistDecideOutputSchema,
  type WatchlistDecideOutput,
} from "./schemas.js";
import { getUserLibrary } from "./recommender.js";
import { formatLibraryBlock } from "./aiHelpers.js";

const DECIDE_MODEL = ONBOARDING_MODEL;

// Cap how many watchlist items we send to the model. Beyond this the prompt
// gets noisy and the model's ranking quality drops; the dedup pool is also
// less useful when the user has hundreds of plan-to items. If the user really
// has a 200-item watchlist, the most-recently-added items are the most likely
// to be relevant ("I added these because I was actually thinking about them").
const MAX_WATCHLIST_FOR_MODEL = 80;

export interface WatchlistPick {
  /** The original library_items row. */
  item: LibraryItemRow;
  rank: number;
  explanation: string;
}

/**
 * Rank a user's watchlist by a mood prompt. Different from /generate — we
 * are not producing new candidates, just ordering the user's existing set.
 *
 * Empty watchlist → throws a 400-coded error so the API surfaces a friendly
 * empty-state instead of an opaque AI failure. Rate-limit checking happens
 * at the API layer, before we get here.
 */
export async function decideWatchlist(
  userId: string,
  prompt: string,
): Promise<WatchlistPick[]> {
  const profileRow = await getActiveProfile(userId);
  if (!profileRow) {
    const err: Error & { status?: number } = new Error(
      "Cannot decide: user has no taste profile yet",
    );
    err.status = 400;
    throw err;
  }
  const profile = profileRow.profileData;

  const watchlist = await db.query.libraryItems.findMany({
    where: and(
      eq(libraryItems.userId, userId),
      eq(libraryItems.status, "watchlist"),
    ),
    orderBy: [desc(libraryItems.createdAt)],
    limit: MAX_WATCHLIST_FOR_MODEL,
  });

  if (watchlist.length === 0) {
    const err: Error & { status?: number } = new Error(
      "Watchlist is empty — add items via Plan to on a recommendation, or import a watchlist (Goodreads to-read, MAL plan-to-watch).",
    );
    err.status = 400;
    throw err;
  }

  const library = await getUserLibrary(userId, profile);

  // Build numbered watchlist block. We send sequential string IDs to the
  // model to keep token cost down and avoid UUID round-tripping; map back
  // by index after the response lands.
  const watchlistBlock = watchlist
    .map((row, i) => {
      const yearLabel = row.year != null ? ` (${row.year})` : "";
      return `[${i + 1}] ${row.title}${yearLabel} — ${row.mediaType}`;
    })
    .join("\n");

  const sections: string[] = [
    `# User profile\n\n${JSON.stringify(profile, null, 2)}`,
  ];

  if (library.length > 0) {
    sections.push(
      `# User's library (works they personally loved — REFERENCE these by name in explanations whenever the connection is strong)\n\n${formatLibraryBlock(library)}`,
    );
  }

  sections.push(`# Watchlist (rank these by mood fit)\n\n${watchlistBlock}`);
  sections.push(
    `# Mood prompt\n\n${prompt}\n\n# Task\n\nReturn the top picks (max 10) ranked best-first. Drop items that don't fit the mood; a short decisive list is the goal.`,
  );

  const client = getAnthropic();
  const response = await client.messages.parse({
    model: DECIDE_MODEL,
    max_tokens: 1500,
    system: decideWatchlistSystemPrompt(),
    messages: [{ role: "user", content: sections.join("\n\n") }],
    output_config: {
      format: zodOutputFormat(
        WatchlistDecideOutputSchema as unknown as Parameters<
          typeof zodOutputFormat
        >[0],
      ),
    },
  });

  if (!response.parsed_output) {
    throw new Error(`Decide failed (stop_reason=${response.stop_reason})`);
  }

  const parsed: WatchlistDecideOutput = WatchlistDecideOutputSchema.parse(
    response.parsed_output,
  );

  // Map sequential ids back to library_items rows. Drop any pick whose id
  // doesn't resolve — defensive, the model occasionally invents ids when the
  // watchlist is very short.
  const out: WatchlistPick[] = [];
  for (const pick of parsed.picks) {
    const idx = Number.parseInt(pick.candidateId, 10) - 1;
    if (Number.isNaN(idx) || idx < 0 || idx >= watchlist.length) continue;
    const item = watchlist[idx];
    if (!item) continue;
    out.push({ item, rank: pick.rank, explanation: pick.explanation });
  }
  out.sort((a, b) => a.rank - b.rank);
  return out;
}
