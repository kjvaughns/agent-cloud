/**
 * Semantic tones.
 *
 * A tone names what a piece of state *means* — success, warning, danger, info,
 * brand, neutral — and leaves the colour to the theme. The classes returned
 * here are defined in src/styles.css and are built from the theme tokens, so a
 * badge follows light/dark and the agency's accent without knowing either.
 *
 * Use this instead of reaching into the Tailwind palette (bg-warning,
 * text-success). Those values are outside the theme and drift.
 */

export type Tone = "brand" | "success" | "warning" | "danger" | "info" | "neutral";

/** Tinted chip: surface + border + legible text. The default for a badge. */
export const toneSoft = (t: Tone) => `tone-${t}`;

/** Filled chip. Reserve for the one status on a screen that must dominate. */
export const toneSolid = (t: Tone) => `tone-solid-${t}`;

/** Colour as a background only — for a 6px status dot or a progress bar. */
export const toneDot = (t: Tone) => `tone-dot-${t}`;

/** Colour as text only — for a figure that carries its own meaning. */
export const toneText = (t: Tone) => `tone-text-${t}`;

/** The shared geometry of every badge in the app, so they cannot drift apart. */
export const BADGE_BASE =
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap";

/** A soft badge's full class string. */
export const toneBadge = (t: Tone) => `${BADGE_BASE} ${toneSoft(t)}`;
