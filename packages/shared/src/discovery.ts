import type { MediaType } from "./media.js";

/**
 * A "browse mode" theme — a curated entry surface generated from the user's
 * taste profile. Clicking a theme runs the standard recommendation pipeline
 * with `promptHint` as the batch prompt, so themes plug into existing infra.
 *
 * Themes are persisted per-user (one row per user, all themes in a jsonb
 * array) and regenerated only on manual refresh or after profile changes.
 */
export interface DiscoveryTheme {
  /** Short, evocative phrase. e.g. "Your kind of slow burn". */
  title: string;
  /** 1-2 sentences naming the SPECIFIC connection to this user's profile or
   * library — not a generic category description. */
  description: string;
  /** Which media types this theme makes sense for. 1-3 entries. */
  formats: MediaType[];
  /** Internal prompt the recommender will use when the user clicks. Worded
   * as a user request ("a slow burn movie that earns its ending"). Not
   * shown in the UI. */
  promptHint: string;
}
