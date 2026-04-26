import type { MediaApiAdapter } from "./aggregator.js";

// TMDB adapter (movies, TV). Rate limit: 40 req/10s.
export const tmdbAdapter: MediaApiAdapter = {
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
