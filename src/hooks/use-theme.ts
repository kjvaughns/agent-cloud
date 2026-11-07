import { useEffect, useState } from "react";

type Theme = "light" | "dark";
type Density = "compact" | "regular" | "comfy";
type Accent = "gold" | "champagne" | "bronze";

// v2: the old key was auto-saved as "dark" for everyone, so it can't tell real choices apart.
const THEME_KEY = "agentcloud-theme-v2";
const DENSITY_KEY = "agentcloud-density";
const ACCENT_KEY = "agentcloud-accent";
const NOVA_KEY = "agentcloud-nova-rail";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "light";
    const stored = localStorage.getItem(THEME_KEY) as Theme | null;
    // Light is the default; only an explicit "dark" opts in.
    return stored === "dark" ? "dark" : "light";
  });

  const [density, setDensityState] = useState<Density>(() => {
    if (typeof window === "undefined") return "regular";
    return (localStorage.getItem(DENSITY_KEY) as Density | null) ?? "regular";
  });

  const [accent, setAccentState] = useState<Accent>(() => {
    if (typeof window === "undefined") return "gold";
    return (localStorage.getItem(ACCENT_KEY) as Accent | null) ?? "gold";
  });

  const [novaRail, setNovaRailState] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(NOVA_KEY) !== "off";
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    if (density === "regular") root.removeAttribute("data-density");
    else root.setAttribute("data-density", density);
    localStorage.setItem(DENSITY_KEY, density);
  }, [density]);

  useEffect(() => {
    const root = document.documentElement;
    if (accent === "gold") root.removeAttribute("data-accent");
    else root.setAttribute("data-accent", accent);
    localStorage.setItem(ACCENT_KEY, accent);
  }, [accent]);

  useEffect(() => {
    localStorage.setItem(NOVA_KEY, novaRail ? "on" : "off");
  }, [novaRail]);

  return {
    theme,
    toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    setTheme,
    density,
    setDensity: setDensityState,
    accent,
    setAccent: setAccentState,
    novaRail,
    setNovaRail: setNovaRailState,
  };
}
