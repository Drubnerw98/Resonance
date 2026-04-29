import type { MediaItem } from "./media.js";

export type RecommendationStatus =
  | "pending"
  | "seen"
  | "saved"
  | "skipped"
  | "rated"
  | "plan_to";

export interface Recommendation {
  id: string;
  batchId: string;
  mediaCacheId: string;
  matchScore: number;
  explanation: string;
  tasteTags: string[];
  status: RecommendationStatus;
  rating: number | null;
  createdAt: string;
  actedAt: string | null;
}

export interface RecommendationWithMedia extends Recommendation {
  media: MediaItem;
}

export interface RecommendationFeedback {
  status: RecommendationStatus;
  rating?: number;
  skipReason?: string;
}