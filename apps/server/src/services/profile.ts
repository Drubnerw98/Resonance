import { eq, sql } from "drizzle-orm";
import type { ProfileTrigger, TasteProfile } from "@resonance/shared";
import { db } from "../db/index.js";
import {
  discoveryThemes,
  profileVersions,
  tasteProfiles,
  type TasteProfileRow,
} from "../db/schema.js";

/**
 * Upsert the user's active TasteProfile and snapshot the new version into
 * profile_versions for history/rollback.
 *
 * The unique index on taste_profiles.user_id makes the upsert atomic at the
 * row level. Drizzle/neon-http doesn't support multi-statement transactions,
 * so the version snapshot is a separate insert; if it fails the profile is
 * still saved (acceptable trade-off for now — at worst we lose a snapshot,
 * never the live data).
 */
export async function saveProfile(
  userId: string,
  profile: TasteProfile,
  trigger: ProfileTrigger,
): Promise<TasteProfileRow> {
  const [row] = await db
    .insert(tasteProfiles)
    .values({
      userId,
      currentVersion: 1,
      profileData: profile,
    })
    .onConflictDoUpdate({
      target: tasteProfiles.userId,
      set: {
        profileData: profile,
        currentVersion: sql`${tasteProfiles.currentVersion} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning();

  if (!row) throw new Error("Failed to upsert taste profile");

  await db.insert(profileVersions).values({
    profileId: row.id,
    versionNumber: row.currentVersion,
    profileData: profile,
    trigger,
  });

  // Invalidate cached discovery themes — they were generated against the old
  // profile and may now misrepresent the user. Next /discover/themes GET
  // regenerates fresh against the current profile. Inline the delete to avoid
  // a circular import (services/ai/discover.ts → services/profile.ts).
  await db.delete(discoveryThemes).where(eq(discoveryThemes.userId, userId));

  return row;
}

export async function getActiveProfile(
  userId: string,
): Promise<TasteProfileRow | null> {
  const row = await db.query.tasteProfiles.findFirst({
    where: eq(tasteProfiles.userId, userId),
  });
  return row ?? null;
}
