import { cn } from "@/lib/utils";
import { TEMP_META, type Temperature } from "@/lib/pipeline-meta";
import { BADGE_BASE } from "@/lib/tone";
import { Flame, Snowflake, Thermometer } from "lucide-react";

const ICONS = { hot: Flame, warm: Thermometer, cold: Snowflake };

export function TemperatureBadge({ value }: { value: Temperature }) {
  const m = TEMP_META[value];
  const Icon = ICONS[value];
  return (
    <span className={cn(BADGE_BASE, m.cls)}>
      <Icon className="h-3 w-3" />
      {m.label}
    </span>
  );
}
