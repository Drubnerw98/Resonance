import type { MediaItem, MediaSearchQuery } from "@resonance/shared";
import { createTokenBucket, type RateLimiter } from "../../lib/rateLimiter.js";
import type { MediaApiAdapter } from "./aggregator.js";

const OPENLIBRARY_BASE = "https://openlibrary.org";
const COVERS_BASE = "https://covers.openlibrary.org";

// Open Library doesn't publish a hard rate limit. Their docs ask for a
// descriptive User-Agent and reasonable request rates. We self-throttle to
// 5 req/s to stay polite under bursts.
const olLimiter: RateLimiter = createTokenBucket({
  capacity: 5,
  intervalMs: 1_000,
});

const USER_AGENT = "Resonance/0.0.1 (https://github.com/Drubnerw98/Resonance)";

interface OpenLibraryDoc {
  /** Work key, e.g. "/works/OL45804W" */
  key: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  subject?: string[];
  // Editions can have edition-specific scores; we use the work-level data.
}

interface OpenLibrarySearchResponse {
  docs: OpenLibraryDoc[];
}

interface OpenLibraryWork {
  key: string;
  title?: string;
  description?: string | { value?: string };
  covers?: number[];
  subjects?: string[];
  first_publish_date?: string;
  authors?: { author?: { key: string } }[];
}

async function olFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${OPENLIBRARY_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  await olLimiter.acquire();
  const res = await fetch(url.toString(), {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenLibrary ${res.status}: ${body || res.statusText}`);
  }
  return (await res.json()) as T;
}

function workIdFromKey(key: string): string {
  // "/works/OL45804W" → "OL45804W"
  const parts = key.split("/");
  return parts[parts.length - 1] ?? key;
}

function coverUrl(coverId: number | undefined): string | null {
  return coverId ? `${COVERS_BASE}/b/id/${coverId}-L.jpg` : null;
}

function descriptionToString(
  d: OpenLibraryWork["description"] | undefined,
): string {
  if (!d) return "";
  if (typeof d === "string") return d;
  return d.value ?? "";
}

function normalizeDoc(doc: OpenLibraryDoc): MediaItem {
  const externalId = workIdFromKey(doc.key);
  const description = doc.author_name
    ? `By ${doc.author_name.slice(0, 3).join(", ")}.`
    : "";
  return {
    externalId,
    source: "openlibrary",
    mediaType: "book",
    title: doc.title ?? "Untitled",
    description,
    imageUrl: coverUrl(doc.cover_i),
    rating: null,
    year: doc.first_publish_year ?? null,
    genres: (doc.subject ?? []).slice(0, 6),
    externalUrl: `${OPENLIBRARY_BASE}${doc.key}`,
    metadata: {
      authors: doc.author_name ?? [],
    },
  };
}

async function searchByTitle(title: string): Promise<MediaItem[]> {
  // language=eng pre-filters out non-English editions of the same work
  // (e.g., a search for "Nausea" otherwise returns "La Nausée" alongside
  // the English novel — they're different titles, different OL keys, but
  // the same book).
  const res = await olFetch<OpenLibrarySearchResponse>("/search.json", {
    title,
    language: "eng",
    limit: "10",
  });
  return res.docs.slice(0, 10).map(normalizeDoc);
}

async function searchByQuery(query: MediaSearchQuery): Promise<MediaItem[]> {
  if (query.mediaType !== "book") {
    throw new Error("openlibrary only handles 'book' media type");
  }

  const params: Record<string, string> = {
    limit: String(query.limit ?? 20),
  };
  // Open Library's search.json supports title, author, subject, first_publish_year,
  // and a generic q. Treat keywords as a generic q; map genres to subject.
  if (query.keywords && query.keywords.length > 0) {
    params.q = query.keywords.join(" ");
  }
  if (query.genres && query.genres.length > 0) {
    params.subject = query.genres.join(",");
  }
  if (query.yearFrom)
    params.first_publish_year = `[${query.yearFrom} TO ${query.yearTo ?? "*"}]`;

  if (!params.q && !params.subject) {
    // No criteria → don't blanket-fetch the entire library.
    return [];
  }

  // English-only — see comment in searchByTitle.
  params.language = "eng";

  const res = await olFetch<OpenLibrarySearchResponse>("/search.json", params);
  return res.docs.map(normalizeDoc);
}

async function getById(externalId: string): Promise<MediaItem | null> {
  // externalId is the work key suffix (e.g. "OL45804W").
  try {
    const work = await olFetch<OpenLibraryWork>(`/works/${externalId}.json`);
    const cover = work.covers && work.covers.length > 0 ? work.covers[0] : undefined;
    const yearStr = work.first_publish_date?.match(/\d{4}/)?.[0];
    return {
      externalId,
      source: "openlibrary",
      mediaType: "book",
      title: work.title ?? "Untitled",
      description: descriptionToString(work.description),
      imageUrl: coverUrl(cover),
      rating: null,
      year: yearStr ? Number(yearStr) : null,
      genres: (work.subjects ?? []).slice(0, 6),
      externalUrl: `${OPENLIBRARY_BASE}/works/${externalId}`,
      metadata: {},
    };
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("OpenLibrary 404")) {
      return null;
    }
    throw err;
  }
}

export const openLibraryAdapter: MediaApiAdapter = {
  searchByTitle,
  searchByQuery,
  getById,
};
