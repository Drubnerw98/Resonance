import type { MediaApiAdapter } from "./aggregator.js";

// Open Library adapter (books). No hard rate limit — be polite.
export const openLibraryAdapter: MediaApiAdapter = {
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
