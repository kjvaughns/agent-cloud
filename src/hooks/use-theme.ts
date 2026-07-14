import { useEffect, useState } from "react";

type Theme = "light" | "dark";
type Density = "compact" | "regular" | "comfy";
type Accent = "gold" | "champagne" | "bronze";

const THEME_KEY = "agentcloud-theme";
const DENSITY_KEY = "agentcloud-density";
const ACCENT_KEY = "agentcloud-accent";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "dark";
    const stored = localStorage.getItem(THEME_KEY) as Theme | null;
    // Dark is the default; only an explicit "light" opts out.
    return stored === "light" ? "light" : "dark";
  });

  const [density, setDensityState] = useState<Density>(() => {
    if (typeof window === "undefined") return "regular";
    return (localStorage.getItem(DENSITY_KEY) as Density | null) ?? "regular";
  });

  const [accent, setAccentState] = useState<Accent>(() => {
    if (typeof window === "undefined") return "gold";
    return (localStorage.getItem(ACCENT_KEY) as Accent | null) ?? "gold";
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

  return {
    theme,
    toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    setTheme,
    density,
    setDensity: setDensityState,
    accent,
    setAccent: setAccentState,
  };
}
