import { eq } from "drizzle-orm";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { DiscoveryTheme, TasteProfile } from "@resonance/shared";
import { db } from "../../db/index.js";
import {
  discoveryThemes,
  type DiscoveryThemesRow,
} from "../../db/schema.js";
import { getActiveProfile } from "../profile.js";
import { getAnthropic, ONBOARDING_MODEL } from "./client.js";
import { discoverThemesSystemPrompt } from "./prompts/discoverThemes.js";
import {
  DiscoveryThemesOutputSchema,
  type DiscoveryThemesOutput,
} from "./schemas.js";
import { getUserLibrary, type LibraryItem } from "./recommender.js";
import { formatLibraryBlock } from "./aiHelpers.js";

const DISCOVER_MODEL = ONBOARDING_MODEL;
const TARGET_THEME_COUNT = 6;

/**
 * Read cached themes for a user. Returns null if none exist; caller decides
 * whether to call generateThemes.
 */
export async function getCachedThemes(
  userId: string,
): Promise<DiscoveryThemesRow | null> {
  const row = await db.query.discoveryThemes.findFirst({
    where: eq(discoveryThemes.userId, userId),
  });
  return row ?? null;
}

/**
 * Generate fresh themes from the model and persist them. Overwrites any
 * existing row for this user (one row per user — we don't keep history).
 */
export async function generateThemes(
  userId: string,
): Promise<DiscoveryThemesRow> {
  const profileRow = await getActiveProfile(userId);
  if (!profileRow) {
    // Status-coded error so the global errorHandler returns 400 (user state),
    // not 500 (server fault). Frontend handles "missing profile" by gating
    // the UI to an EmptyState; this just keeps the API honest.
    const err: Error & { status?: number } = new Error(
      "Cannot generate themes: user has no taste profile yet",
    );
    err.status = 400;
    throw err;
  }
  const profile = profileRow.profileData;
  const library = await getUserLibrary(userId, profile);

  const result = await callModel(profile, library);
  const themes = result.themes.slice(0, TARGET_THEME_COUNT) as DiscoveryTheme[];

  const [row] = await db
    .insert(discoveryThemes)
    .values({ userId, themes, generatedAt: new Date() })
    .onConflictDoUpdate({
      target: discoveryThemes.userId,
      set: { themes, generatedAt: new Date() },
    })
    .returning();

  if (!row) throw new Error("Failed to persist discovery themes");
  return row;
}

/**
 * Read-or-generate. Used by the GET endpoint so first-time visitors get a
 * synchronous result without a separate refresh call.
 */
export async function getOrGenerateThemes(
  userId: string,
): Promise<DiscoveryThemesRow> {
  const cached = await getCachedThemes(userId);
  if (cached) return cached;
  return generateThemes(userId);
}

/**
 * Drop the cached themes row for a user. Called when the profile changes,
 * so the next /discover/themes GET regenerates against the new profile.
 */
export async function invalidateThemes(userId: string): Promise<void> {
  await db.delete(discoveryThemes).where(eq(discoveryThemes.userId, userId));
}

async function callModel(
  profile: TasteProfile,
  library: LibraryItem[],
): Promise<DiscoveryThemesOutput> {
  const client = getAnthropic();

  const sections: string[] = [
    `# User profile\n\n${JSON.stringify(profile, null, 2)}`,
  ];

  if (library.length > 0) {
    sections.push(
      `# User's library (works they personally loved — REFERENCE these by name in theme descriptions when applicable)\n\n${formatLibraryBlock(library)}`,
    );
  }

  sections.push(
    `# Task\n\nProduce 6 themes. Read the QUALITY BAR carefully — generic themes (genre labels, "hidden gems") are failures here.`,
  );

  const response = await client.messages.parse({
    model: DISCOVER_MODEL,
    max_tokens: 2000,
    system: discoverThemesSystemPrompt(),
    messages: [{ role: "user", content: sections.join("\n\n") }],
    output_config: {
      format: zodOutputFormat(
        DiscoveryThemesOutputSchema as unknown as Parameters<
          typeof zodOutputFormat
        >[0],
      ),
    },
  });

  if (!response.parsed_output) {
    throw new Error(
      `Theme generation failed (stop_reason=${response.stop_reason})`,
    );
  }
  return DiscoveryThemesOutputSchema.parse(response.parsed_output);
}
