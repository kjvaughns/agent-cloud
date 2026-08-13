import { useEffect } from "react";
import { useOrganization } from "@/hooks/use-organization";
import { buildAccentRamp, applyAccentRamp, DEFAULT_ACCENT } from "@/lib/theme/accent";

/**
 * Applies an agency's brand colour to the design system tokens.
 *
 * The plan check is gone. It used to require `plan_type === "white_label"`,
 * which meant the accent picker in Agency settings was the only control in the
 * product that was visible, editable, saved — and did nothing. Every agency
 * can set a colour now and see it.
 *
 * The other half of the condition stays and is doing real work: an accent has
 * to be present *and* differ from the stock gold. Plenty of organisations carry
 * an `accent_color` row from an older default, and those must keep rendering
 * the standard palette rather than being re-tinted with a value nobody chose.
 */
export function WhiteLabelTheme() {
  const { org } = useOrganization();

  const accent = org?.accent_color ?? null;
  const enabled = !!accent && accent.toLowerCase() !== DEFAULT_ACCENT.toLowerCase();

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
