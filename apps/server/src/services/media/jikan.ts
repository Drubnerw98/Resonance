import type { MediaApiAdapter } from "./aggregator.js";

// Jikan adapter (anime, manga via MyAnimeList). Rate limit: 3 req/s.
export const jikanAdapter: MediaApiAdapter = {
  async searchByTitle() {
    throw new Error("not implemented");
  },
  async searchByQuery() {
    throw new Error("not implemented");
  },
  async getById() {
    throw new Error("not implemented");
  },
};
