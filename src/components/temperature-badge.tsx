import { cn } from "@/lib/utils";
import { TEMP_META, type Temperature } from "@/lib/mock-data";
import { Flame, Snowflake, Thermometer } from "lucide-react";

const ICONS = { hot: Flame, warm: Thermometer, cold: Snowflake };

export function TemperatureBadge({ value }: { value: Temperature }) {
  const m = TEMP_META[value];
  const Icon = ICONS[value];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", m.cls)}>
      <Icon className="h-3 w-3" />
      {m.label}
    </span>
  );
}
