import type { MediaApiAdapter } from "./aggregator.js";

// IGDB adapter (games). Rate limit: 4 req/s.
export const igdbAdapter: MediaApiAdapter = {
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
