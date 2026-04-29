import type { LibraryItem } from "./recommender.js";

/**
 * Format the user's library as the bracketed numbered list every AI prompt
 * (rec scoring, evaluate verdicts, discovery themes) feeds in. Centralized so
 * the wording stays consistent across prompts — if we change how a "saved"
 * vs "imported" vs "mentioned in onboarding" item is labeled, every prompt
 * sees the change at once.
 *
 * Empty library returns an empty string; callers should guard with
 * `library.length > 0` before adding the surrounding section header.
 */
export function formatLibraryBlock(library: LibraryItem[]): string {
  if (library.length === 0) return "";
  return library
    .map((l, i) => {
      let detail: string;
      if (l.source === "saved") detail = "saved";
      else if (l.source === "rated" && l.rating != null)
        detail = `rated ${l.rating}/5`;
      else if (l.source === "imported")
        detail =
          l.rating != null ? `imported, rated ${l.rating}/5` : "imported";
      else detail = "mentioned in onboarding";
      return `[${i + 1}] ${l.title} (${l.mediaType}, ${detail})`;
    })
    .join("\n");
}
