import { eq } from "drizzle-orm";
import { clerkClient } from "@clerk/express";
import { db } from "../db/index.js";
import { users, type User } from "../db/schema.js";

/**
 * Look up the local users row for a Clerk user, creating it on first contact.
 * Called from the requireUser middleware so every authenticated request has a
 * synced user available downstream.
 */
export async function ensureUser(clerkId: string): Promise<User> {
  const existing = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
  });
  if (existing) return existing;

  const clerkUser = await clerkClient.users.getUser(clerkId);

  const primaryEmailId = clerkUser.primaryEmailAddressId;
  const email =
    clerkUser.emailAddresses.find((e) => e.id === primaryEmailId)
      ?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress ??
    "";

  const displayName =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
    clerkUser.username ||
    email.split("@")[0] ||
    "New user";

  // The unique constraint on users.clerk_id makes this race-safe: if a
  // concurrent request inserted first, ON CONFLICT lets us read the winner.
  const [row] = await db
    .insert(users)
    .values({
      clerkId,
      email,
      displayName,
      onboardingStatus: "pending",
    })
    .onConflictDoUpdate({
      target: users.clerkId,
      set: { updatedAt: new Date() },
    })
    .returning();

  if (!row) throw new Error("Failed to upsert user");
  return row;
}
