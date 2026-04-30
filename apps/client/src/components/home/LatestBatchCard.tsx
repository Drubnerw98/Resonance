import { Link } from "react-router-dom";
import type { MediaType } from "@resonance/shared";
import {
  useRecommendations,
  type RecommendationItem,
} from "../../hooks/useRecommendations.ts";
import { useBatches, type BatchSummary } from "../../hooks/useBatches.ts";
import { Skeleton } from "../shared/Skeleton.tsx";
import { SectionCard } from "./SectionCard.tsx";

const FORMAT_LABEL: Record<MediaType, string> = {
  movie: "Movies",
  tv: "TV",
  anime: "Anime",
  manga: "Manga",
  game: "Games",
  book: "Books",
};

/**
 * Most recent batch shown as a horizontal poster row. The existing
 * useRecommendations response is sorted createdAt-desc and batch-grouped, so
 * the first rec's batchId is the latest batch — pull every rec sharing that
 * batchId and show the top 5 by match score.
 */
export function LatestBatchCard() {
  const recs = useRecommendations();
  const batches = useBatches();

  if (recs.status === "loading" || batches.status === "loading") {
    return (
      <SectionCard title="Latest batch">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[2/3] w-full rounded-md" />
          ))}
        </div>
      </SectionCard>
    );
  }

  if (recs.recommendations.length === 0) {
    return (
      <SectionCard title="Latest batch">
        <p className="text-sm text-neutral-400">
          No batches yet — your first prompt above will land here.
        </p>
      </SectionCard>
    );
  }

  const latestBatchId = recs.recommendations[0]!.batchId;
  const latestBatchRecs = recs.recommendations.filter(
    (r) => r.batchId === latestBatchId,
  );
  const topPicks = [...latestBatchRecs]
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 4);
  const batchMeta = batches.batches.find((b) => b.id === latestBatchId) ?? null;

  return (
    <SectionCard
      title="Latest batch"
      subtitle={batchMeta ? batchSubtitle(batchMeta) : null}
      action={
        <Link
          to={`/recommendations?batch=${latestBatchId}`}
          className="text-xs text-neutral-400 hover:text-neutral-100"
        >
          View this batch →
        </Link>
      }
    >
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {topPicks.map((rec) => (
          <li key={rec.id}>
            <PosterCard rec={rec} />
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function batchSubtitle(batch: BatchSummary): string {
  if (batch.name) return batch.name;
  if (batch.prompt) return `"${batch.prompt}"`;
  return new Date(batch.createdAt).toLocaleDateString();
}

function PosterCard({ rec }: { rec: RecommendationItem }) {
  const scorePct = Math.round(rec.matchScore * 100);
  return (
    <a
      href={rec.media.externalUrl}
      target="_blank"
      rel="noreferrer"
      className="group block space-y-1.5"
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-md border border-neutral-800 bg-neutral-900">
        {rec.media.imageUrl ? (
          <img
            src={rec.media.imageUrl}
            alt={rec.media.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center px-2 text-center text-xs text-neutral-500">
            {rec.media.title}
          </div>
        )}
        {/* Match score in the bottom corner — emerald accent for confidence */}
        <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400 backdrop-blur-sm">
          {scorePct}%
        </span>
      </div>
      <p className="text-xs font-medium leading-snug text-neutral-200 group-hover:text-white">
        {rec.media.title}
      </p>
      <p className="text-[10px] uppercase tracking-wide text-neutral-500">
        {FORMAT_LABEL[rec.media.mediaType] ?? rec.media.mediaType}
        {rec.media.year && ` · ${rec.media.year}`}
      </p>
    </a>
  );
}
