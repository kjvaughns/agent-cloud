import { useEffect } from "react";
import { useOrganization } from "@/hooks/use-organization";
import { buildAccentRamp, applyAccentRamp, DEFAULT_ACCENT } from "@/lib/theme/accent";

/**
 * Applies a white-label agency's brand colour to the design system tokens.
 *
 * Deliberately narrow. The override runs only when the organization is on the
 * white_label plan AND has set an accent that differs from the stock gold.
 * Every other workspace — including agencies that happen to have an
 * accent_color row from an older default — renders the standard palette,
 * untouched.
 */
export function WhiteLabelTheme() {
  const { org } = useOrganization();

  const accent = org?.accent_color ?? null;
  const enabled =
    org?.plan_type === "white_label" &&
    !!accent &&
    accent.toLowerCase() !== DEFAULT_ACCENT.toLowerCase();

  useEffect(() => {
    if (!enabled || !accent) {
      applyAccentRamp(null);
      return;
    }

    const apply = () => {
      const dark = document.documentElement.classList.contains("dark");
      applyAccentRamp(buildAccentRamp(accent, dark));
    };
    apply();

    // The ramp differs between light and dark, so re-derive when the theme
    // class changes rather than baking in whichever mode happened to load first.
    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => {
      observer.disconnect();
      applyAccentRamp(null);
    };
  }, [enabled, accent]);

  return null;
}
