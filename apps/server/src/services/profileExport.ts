import { desc, eq } from "drizzle-orm";
import type { TasteProfile } from "@resonance/shared";
import { titleAppearsIn } from "@resonance/shared";
import { db } from "../db/index.js";
import { recommendations } from "../db/schema.js";
import { listLibraryItems } from "./library.js";

/**
 * Build the export-shape payload (Constellation's input contract) from a
 * TasteProfile snapshot plus the user's CURRENT library + recommendations.
 *
 * Used by both /api/profile/export (snapshot = the live profile) and
 * /api/profile/versions/:versionId/export (snapshot = a historical version).
 * Library/rec rows aren't versioned — every version-export pairs an old
 * profile with the live consumed/manual library + live deduped recs. The
 * diff Constellation visualizes between two version exports is therefore
 * profile-only (themes / archetypes / favorites / avoidances), which is the
 * useful comparison anyway.
 *
 * Library items shipped: only `source = "manual"` (curated taste signal,
 * not bulk imports). Recommendations: deduped by `mediaCacheId` (newest
 * wins) so multi-batch repeats don't render as duplicate stars.
 */
export async function buildProfileExport(
  userId: string,
  profile: TasteProfile,
): Promise<{
  profile: TasteProfile;
  library: ExportLibraryItem[];
  recommendations: ExportRecommendation[];
  favorites: ExportFavorite[];
  avoidances: ExportAvoidance[];
}> {
  const libraryRows = (await listLibraryItems(userId)).filter(
    (row) => row.source === "manual",
  );
  const recRows = await db.query.recommendations.findMany({
    where: eq(recommendations.userId, userId),
    orderBy: [desc(recommendations.createdAt)],
    with: { media: true },
  });

  const seen = new Set<string>();
  const dedupedRecs: typeof recRows = [];
  for (const r of recRows) {
    if (seen.has(r.mediaCacheId)) continue;
    seen.add(r.mediaCacheId);
    dedupedRecs.push(r);
  }

  const favorites = deriveFavorites(profile);
  const avoidances = deriveAvoidances(profile);

  return {
    profile,
    library: libraryRows.map((row) => ({
      id: row.id,
      title: row.title,
      mediaType: row.mediaType,
      year: row.year,
      rating: row.rating,
      // Synthetic constant — the row's source is "manual" but the export
      // label has been "library" since the endpoint shipped. Constellation's
      // type pins it; don't break the contract.
      source: "library" as const,
      status: row.status,
      fitNote: row.fitNote,
      tasteTags: row.tasteTags,
    })),
    recommendations: dedupedRecs.map((r) => ({
      id: r.id,
      title: r.media.title,
      mediaType: r.media.mediaType,
      year: r.media.normalizedData.year,
      matchScore: r.matchScore,
      tasteTags: r.tasteTags,
      status: r.status,
      rating: r.rating,
      explanation: r.explanation,
    })),
    favorites,
    avoidances,
  };
}

/**
 * Flatten profile.mediaAffinities[].favorites and tag each by which
 * themes/archetypes mention them. Mirrors Constellation's graph.ts:
 * titleAppearsIn so the consumer doesn't redo the work — direct substring
 * first, then a 2+ content-token overlap fallback.
 */
export function deriveFavorites(profile: TasteProfile): ExportFavorite[] {
  return profile.mediaAffinities.flatMap((affinity) =>
    affinity.favorites.map((title) => ({
      title,
      mediaType: affinity.format,
      themes: profile.themes
        .filter((t) => titleAppearsIn(title, t.evidence))
        .map((t) => t.label),
      archetypes: profile.archetypes
        .filter((a) => titleAppearsIn(title, a.attraction))
        .map((a) => a.label),
    })),
  );
}

/**
 * Combine abstract avoidance patterns with named disliked titles into one
 * list, tagged by `kind`. dislikedTitles is optional on the profile shape
 * (predates the field); ?? [] guards.
 */
export function deriveAvoidances(profile: TasteProfile): ExportAvoidance[] {
  return [
    ...profile.avoidances.map((description) => ({
      description,
      kind: "pattern" as const,
    })),
    ...(profile.dislikedTitles ?? []).map((description) => ({
      description,
      kind: "title" as const,
    })),
  ];
}

export interface ExportLibraryItem {
  id: string;
  title: string;
  mediaType: import("@resonance/shared").MediaType;
  year: number | null;
  rating: number | null;
  source: "library";
  status: "consumed" | "watchlist";
  fitNote: string | null;
  tasteTags: string[];
}

export interface ExportRecommendation {
  id: string;
  title: string;
  mediaType: import("@resonance/shared").MediaType;
  year: number | null | undefined;
  matchScore: number;
  tasteTags: string[];
  status: "pending" | "seen" | "saved" | "skipped" | "rated" | "plan_to";
  rating: number | null;
  explanation: string;
}

export interface ExportFavorite {
  title: string;
  mediaType: import("@resonance/shared").MediaType;
  themes: string[];
  archetypes: string[];
}

export interface ExportAvoidance {
  description: string;
  kind: "pattern" | "title";
}
