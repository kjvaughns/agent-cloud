/**
 * Pipeline display metadata.
 *
 * Extracted from the old mock-data module, which mixed genuine configuration
 * (these maps) with generated fixture clients and policies. The fixtures are
 * gone; this is the part that was actually in use.
 */

export type PipelineStage =
  | "new_lead" | "contacted" | "quoted" | "application" | "underwriting" | "placed" | "lost";

export type Temperature = "hot" | "warm" | "cold";

export const STAGE_META: Record<PipelineStage, { label: string; color: string }> = {
  new_lead:     { label: "New Lead",     color: "bg-slate-500" },
  contacted:    { label: "Contacted",    color: "bg-blue-500" },
  quoted:       { label: "Quoted",       color: "bg-violet-500" },
  application:  { label: "Application",  color: "bg-amber-500" },
  underwriting: { label: "Underwriting", color: "bg-orange-500" },
  placed:       { label: "Placed",       color: "bg-emerald-500" },
  lost:         { label: "Lost",         color: "bg-red-500" },
};

export const TEMP_META: Record<Temperature, { label: string; cls: string }> = {
  hot:  { label: "Hot",  cls: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30" },
  warm: { label: "Warm", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  cold: { label: "Cold", cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30" },
};
