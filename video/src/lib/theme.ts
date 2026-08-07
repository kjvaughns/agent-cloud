/**
 * Video palette.
 *
 * The UI inside the frame colours itself from `src/styles.css` — we never
 * restate a token the product already owns. What lives here is the *video
 * furniture*: backgrounds, captions, glows, the endcard. Those need literal
 * values because they sit outside the app's DOM.
 *
 * GOLD is deliberately the app's real dark-mode `--gold` (#CBA35A), not the
 * #C9A227 in the brief. #C9A227 appears nowhere in the token set; the gold an
 * agent actually sees in the product is #CBA35A, with #E7C877 as `--gold-bright`
 * for figures. A caption in a different gold from the UI it sits under reads as
 * a mistake, so both come from the same pair. Change these two lines and the
 * whole video's accent moves.
 */
export const GOLD = "#CBA35A";
export const GOLD_BRIGHT = "#E7C877";
export const GOLD_DIM = "#8C7333";

export const BG = "#08080A";
export const SURFACE = "#101014";
export const TEXT = "#FAFAF9";
export const MUTED = "#8B8B93";
export const GREEN = "#4ADE80";
export const RED = "#F87171";

/** Font stacks. Loaded from local woff2 in `lib/fonts.ts`. */
export const DISPLAY = '"Space Grotesk", ui-sans-serif, system-ui, sans-serif';
export const BODY = '"Hanken Grotesk", ui-sans-serif, system-ui, sans-serif';

/**
 * Safe area for a 1080x1920 vertical post.
 *
 * Instagram and TikTok both paint their own UI over the top ~12% and bottom
 * ~20%. Nothing that has to be read may cross these lines.
 */
export const SAFE_TOP = 0.12;
export const SAFE_BOTTOM = 0.2;
