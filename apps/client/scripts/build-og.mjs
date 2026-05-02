// One-shot script that renders the social-share OG image to
// apps/client/public/og.png. Reproducible: edit this file and rerun
// `pnpm build:og` to regenerate.
//
// Layout: warm near-black canvas, a soft emerald halo behind a centered
// concentric-ring brand mark, a Spectral serif wordmark, and an PTSans
// tagline. Mirrors the editorial system used on the marketing surface.

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

const here = dirname(fileURLToPath(import.meta.url));
const fontDir = resolve(here, "fonts");
const outFile = resolve(here, "..", "public", "og.png");

const [spectralMedium, spectralItalic, ptSans] = await Promise.all([
  readFile(resolve(fontDir, "Spectral-Medium.ttf")),
  readFile(resolve(fontDir, "Spectral-Italic.ttf")),
  readFile(resolve(fontDir, "PTSans-Regular.ttf")),
]);

const WIDTH = 1200;
const HEIGHT = 630;

// Concentric-ring brand mark, hand-built from nested divs because satori's
// SVG support is limited. Outer-to-inner: 9.5r faint, 5.5r softer, 2r solid.
function BrandMark() {
  return {
    type: "div",
    props: {
      style: {
        position: "relative",
        width: "120px",
        height: "120px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      },
      children: [
        {
          type: "div",
          props: {
            style: {
              position: "absolute",
              width: "95px",
              height: "95px",
              borderRadius: "9999px",
              border: "2.5px solid #34d399",
              opacity: 0.35,
            },
          },
        },
        {
          type: "div",
          props: {
            style: {
              position: "absolute",
              width: "55px",
              height: "55px",
              borderRadius: "9999px",
              border: "2.5px solid #34d399",
              opacity: 0.75,
            },
          },
        },
        {
          type: "div",
          props: {
            style: {
              width: "20px",
              height: "20px",
              borderRadius: "9999px",
              backgroundColor: "#34d399",
            },
          },
        },
      ],
    },
  };
}

const tree = {
  type: "div",
  props: {
    style: {
      width: `${WIDTH}px`,
      height: `${HEIGHT}px`,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#0c0b08",
      backgroundImage:
        "radial-gradient(60% 60% at 50% 0%, rgba(16,185,129,0.18) 0%, rgba(16,185,129,0) 70%)",
      fontFamily: "PTSans",
      color: "#fafaf8",
      padding: "80px",
    },
    children: [
      BrandMark(),
      {
        type: "div",
        props: {
          style: {
            display: "flex",
            marginTop: "48px",
            fontFamily: "Spectral",
            fontSize: "140px",
            fontWeight: 500,
            letterSpacing: "-0.02em",
            lineHeight: 1,
            color: "#fafaf8",
          },
          children: "Resonance",
        },
      },
      {
        type: "div",
        props: {
          style: {
            display: "flex",
            marginTop: "28px",
            maxWidth: "960px",
            fontSize: "32px",
            fontWeight: 500,
            lineHeight: 1.35,
            letterSpacing: "-0.005em",
            color: "#a8a29e",
            textAlign: "center",
          },
          children:
            "Cross-format media recommendations grounded in your taste DNA.",
        },
      },
      {
        type: "div",
        props: {
          style: {
            display: "flex",
            marginTop: "44px",
            fontFamily: "Spectral",
            fontSize: "26px",
            fontStyle: "italic",
            color: "#34d399",
            opacity: 0.85,
          },
          children: "Movies. TV. Anime. Manga. Games. Books.",
        },
      },
    ],
  },
};

const svg = await satori(tree, {
  width: WIDTH,
  height: HEIGHT,
  fonts: [
    { name: "Spectral", data: spectralMedium, weight: 500, style: "normal" },
    { name: "Spectral", data: spectralItalic, weight: 400, style: "italic" },
    { name: "PTSans", data: ptSans, weight: 400, style: "normal" },
  ],
});

const png = new Resvg(svg, {
  fitTo: { mode: "width", value: WIDTH },
}).render().asPng();

await writeFile(outFile, png);
console.log(`Wrote ${outFile} (${(png.length / 1024).toFixed(1)} kB)`);
