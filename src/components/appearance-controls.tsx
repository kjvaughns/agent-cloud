import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              "px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors",
              value === o.value ? "bg-gold-glow text-gold-bright" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Appearance panel: theme / accent / density / Nova rail — from the reference tweaks. */
export function AppearanceControls() {
  const { theme, setTheme, accent, setAccent, density, setDensity, novaRail, setNovaRail } = useTheme();
  return (
    <div className="p-3 space-y-3 min-w-[260px]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground">Appearance</div>
      <Segmented label="Theme" value={theme} options={[{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }]} onChange={setTheme} />
      <Segmented label="Accent" value={accent} options={[{ value: "gold", label: "Gold" }, { value: "champagne", label: "Champagne" }, { value: "bronze", label: "Bronze" }]} onChange={setAccent} />
      <Segmented label="Density" value={density} options={[{ value: "compact", label: "Compact" }, { value: "regular", label: "Regular" }, { value: "comfy", label: "Comfy" }]} onChange={setDensity} />
      <div className="flex items-center justify-between gap-3 pt-1 border-t border-border">
        <span className="text-xs text-muted-foreground pt-2">Nova assistant rail</span>
        <button
          onClick={() => setNovaRail(!novaRail)}
          className={cn("mt-2 relative h-5 w-9 rounded-full transition-colors", novaRail ? "bg-primary" : "bg-surface-2 border border-border")}
          aria-label="Toggle Nova rail"
        >
          <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-background transition-all", novaRail ? "left-[18px]" : "left-0.5")} />
        </button>
      </div>
    </div>
  );
}
