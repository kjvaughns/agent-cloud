/**
 * Derive a full accent ramp from a single brand hex.
 *
 * White-label agencies pick one colour; the design system needs five tokens
 * (--gold, --gold-bright, --gold-dim, --gold-glow, --gold-foreground). Rather
 * than ask for five, we derive the rest, matching the relationships the stock
 * palette already uses: bright is a lighter tint, dim a darker shade, glow a
 * low-alpha wash, and foreground whichever of black/white stays readable.
 */

export type AccentRamp = {
  gold: string;
  goldBright: string;
  goldDim: string;
  goldGlow: string;
  goldForeground: string;
};

function clamp(n: number, lo = 0, hi = 255) {
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, "0")).join("")}`;
}

function mix(rgb: [number, number, number], target: number, amount: number) {
  return rgb.map((c) => c + (target - c) * amount) as [number, number, number];
}

/** Relative luminance, per WCAG. Used to pick a readable foreground. */
function luminance([r, g, b]: [number, number, number]) {
  const chan = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

/** WCAG contrast between two luminances. */
function ratio(a: number, b: number) {
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Black or white on the accent — whichever is actually more readable.
 *
 * This was `lum > 0.45 ? black : white`, and the threshold picked the wrong
 * side for exactly the colours the product ships with. Agent Cloud's own gold
 * `#CBA35A` sits just under the cutoff, so it took **white** text at 2.35:1
 * when black would have given 7.80:1 — over three times the contrast, on every
 * primary button in the app. Hot pink and mid-green failed the same way.
 *
 * There is no cutoff that gets this right, because the answer depends on the
 * distance to *both* ends rather than on a single position between them. So
 * ask the question directly: compute both and keep the winner. Two luminance
 * calculations, no constant to tune, and correct for every input by
 * construction.
 */
function readableForeground(rgb: [number, number, number]): string {
  const bg = luminance(rgb);
  const black = "#1a1400";
  const white = "#ffffff";
  return ratio(bg, luminance(hexToRgb(black)!)) >= ratio(bg, luminance(hexToRgb(white)!))
    ? black
    : white;
}

/**
 * `--gold-bright`, dragged until it is actually readable as text.
 *
 * This token is not decoration. `text-gold-bright` is every headline figure on
 * the dashboard, every active nav row, every selected chip — text on the page
 * background, not on the accent. The stock palette handles that by hand:
 * `--gold-bright` is `#7A5E22` in light mode, *darker* than `--gold` itself, so
 * the numbers survive a white background.
 *
 * A fixed 30% mix reproduced that for mid-tone colours and failed at the ends.
 * An agency picking near-white got `#B3B3B3` on white — around 1.9:1, which is
 * not text, it is a suggestion of text. That did not matter while this ran only
 * for white-label agencies, whose colours came out of a setup conversation.
 * Every agency can pick any hex now, including the pale ones, so the mix walks
 * until it crosses a luminance the page can hold it against rather than
 * trusting one constant to suit every input.
 */
function readableBright(rgb: [number, number, number], dark: boolean): [number, number, number] {
  // Targets, not exact values: light mode needs it dark enough to read on a
  // near-white surface, dark mode light enough to read on a near-black one.
  const target = dark ? 0.42 : 0.16;
  const toward = dark ? 255 : 0;

  let out = mix(rgb, toward, dark ? 0.28 : 0.3);
  // Bounded loop rather than while-true: 20 steps of 5% covers the whole
  // range, and a colour that somehow cannot reach the target returns the
  // closest it got instead of hanging.
  for (let i = 0; i < 20; i++) {
    const lum = luminance(out);
    if (dark ? lum >= target : lum <= target) break;
    out = mix(out, toward, 0.05);
  }
  return out;
}

/**
 * @param hex   the agency's brand colour
 * @param dark  whether the app is currently in dark mode — the stock palette
 *              brightens the accent on dark and darkens it on light so figures
 *              stay legible, and a custom accent should behave the same way.
 */
export function buildAccentRamp(hex: string, dark: boolean): AccentRamp | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;

  const bright = readableBright(rgb, dark);
  const dim = dark ? mix(rgb, 0, 0.35) : mix(rgb, 0, 0.15);
  const lum = luminance(rgb);

  return {
    gold: rgbToHex(...rgb),
    goldBright: rgbToHex(...bright),
    goldDim: rgbToHex(...dim),
    goldGlow: `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${dark ? 0.1 : 0.14})`,
    goldForeground: readableForeground(rgb),
  };
}

/** Stock palette. Applying these is equivalent to removing the override. */
export const DEFAULT_ACCENT = "#CBA35A";

export function applyAccentRamp(ramp: AccentRamp | null) {
  const root = document.documentElement;
  const vars: [string, string | null][] = [
    ["--gold", ramp?.gold ?? null],
    ["--gold-bright", ramp?.goldBright ?? null],
    ["--gold-dim", ramp?.goldDim ?? null],
    ["--gold-glow", ramp?.goldGlow ?? null],
    ["--gold-foreground", ramp?.goldForeground ?? null],
  ];
  for (const [name, value] of vars) {
    if (value) root.style.setProperty(name, value);
    else root.style.removeProperty(name);
  }
}
