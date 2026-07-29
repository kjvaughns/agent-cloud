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

/**
 * @param hex   the agency's brand colour
 * @param dark  whether the app is currently in dark mode — the stock palette
 *              brightens the accent on dark and darkens it on light so figures
 *              stay legible, and a custom accent should behave the same way.
 */
export function buildAccentRamp(hex: string, dark: boolean): AccentRamp | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;

  const bright = dark ? mix(rgb, 255, 0.28) : mix(rgb, 0, 0.3);
  const dim = dark ? mix(rgb, 0, 0.35) : mix(rgb, 0, 0.15);
  const lum = luminance(rgb);

  return {
    gold: rgbToHex(...rgb),
    goldBright: rgbToHex(...bright),
    goldDim: rgbToHex(...dim),
    goldGlow: `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${dark ? 0.1 : 0.14})`,
    // 0.45 rather than 0.5: mid-tone brand colours read better with dark text.
    goldForeground: lum > 0.45 ? "#1a1400" : "#ffffff",
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
