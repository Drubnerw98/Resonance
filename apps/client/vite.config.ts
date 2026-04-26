import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Point Vite at the repo-root .env.local so the client and server share a
// single env file. Without this, Vite looks in apps/client/ and never sees the
// VITE_* vars defined at the root.
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

export default defineConfig({
  plugins: [react()],
  envDir: repoRoot,
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
