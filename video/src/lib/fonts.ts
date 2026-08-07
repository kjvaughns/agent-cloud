import { loadFont } from "@remotion/fonts";
import { continueRender, delayRender } from "remotion";

import spaceGrotesk500 from "../../public/fonts/SpaceGrotesk-500.woff2";
import spaceGrotesk700 from "../../public/fonts/SpaceGrotesk-700.woff2";
import hanken400 from "../../public/fonts/HankenGrotesk-400.woff2";
import hanken600 from "../../public/fonts/HankenGrotesk-600.woff2";
import hanken700 from "../../public/fonts/HankenGrotesk-700.woff2";

/**
 * Fonts, loaded at module level from woff2 inlined into the bundle.
 *
 * Module level and not `useEffect`, because `delayRender` has to be registered
 * before the first frame is asked for. Loaded in an effect, the first frames
 * render in a fallback face and the type jumps partway through the video.
 *
 * Local files and not `@remotion/google-fonts`: that package fetches from a CDN
 * at render time, so an offline or sandboxed render produces a silently
 * mis-typeset video rather than an error you can see.
 *
 * Imported rather than fetched with `staticFile()`: see the `asset/inline` rule
 * in `remotion.config.ts`. These arrive as `data:` URIs, so the load is
 * synchronous in everything but name and cannot race the render.
 *
 * These are the app's real faces. The brief asked for Sora and Inter, but the
 * product ships Space Grotesk (`--font-display`) and Hanken Grotesk
 * (`--font-body`) — see `src/styles.css` and `src/routes/__root.tsx`. Since
 * `screens.tsx` renders headings with `font-family: var(--font-display)`,
 * loading Sora would have left the UI in one typeface and the captions in
 * another. Matching the app was the actual goal, so the app won.
 */
const FACES: { family: string; weight: string; url: string }[] = [
  { family: "Space Grotesk", weight: "500", url: spaceGrotesk500 },
  { family: "Space Grotesk", weight: "700", url: spaceGrotesk700 },
  { family: "Hanken Grotesk", weight: "400", url: hanken400 },
  { family: "Hanken Grotesk", weight: "600", url: hanken600 },
  { family: "Hanken Grotesk", weight: "700", url: hanken700 },
];

const handle = delayRender("Loading Space Grotesk + Hanken Grotesk");

Promise.all(
  FACES.map((f) =>
    loadFont({
      family: f.family,
      url: f.url,
      weight: f.weight,
      format: "woff2",
      display: "block",
    }),
  ),
)
  .catch((err) => {
    // Never leave the handle open. An unhandled rejection here stalls the page
    // until the timeout and then reports a font problem as a render timeout,
    // which sends you looking in entirely the wrong place.
    // eslint-disable-next-line no-console
    console.error("Font loading failed, continuing in a fallback face", err);
  })
  .finally(() => continueRender(handle));

export {};
