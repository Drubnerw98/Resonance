// Cross-site coordinates for the three sibling apps. The EcosystemSwitcher
// component reads from here so the chrome can render a uniform "Resonance ·
// Constellation · Ensemble" trio in headers/footers.
//
// Each URL can be overridden via env var at build time; the fallback is the
// known production URL so local dev still produces working cross-app links.

export type EcosystemApp = "resonance" | "constellation" | "ensemble";

interface EcosystemEntry {
  key: EcosystemApp;
  name: string;
  url: string;
}

export const ECOSYSTEM: EcosystemEntry[] = [
  {
    key: "resonance",
    name: "Resonance",
    url:
      import.meta.env.VITE_RESONANCE_URL ??
      "https://resonance-client.vercel.app",
  },
  {
    key: "constellation",
    name: "Constellation",
    url:
      import.meta.env.VITE_CONSTELLATION_URL ??
      "https://constellation-alpha-eight.vercel.app",
  },
  {
    key: "ensemble",
    name: "Ensemble",
    url:
      import.meta.env.VITE_ENSEMBLE_URL ??
      "https://ensemble-sigma.vercel.app",
  },
];
