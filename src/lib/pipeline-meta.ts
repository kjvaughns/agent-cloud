/**
 * Pipeline display metadata.
 *
 * The stage colours used to be raw palette values (bg-slate-500, bg-violet-500)
 * which meant the board ignored the agency accent and read as seven unrelated
 * colours. A stage now expresses progress through the theme: neutral while it
 * is only a lead, brand while the agent is working it, success when placed,
 * danger when lost.
 */

import { toneDot, toneSoft, type Tone } from "./tone";

export type PipelineStage =
  | "new_lead" | "contacted" | "quoted" | "application" | "underwriting" | "placed" | "lost";

export type Temperature = "hot" | "warm" | "cold";

const STAGE_TONE: Record<PipelineStage, Tone> = {
  new_lead:     "neutral",
  contacted:    "info",
  quoted:       "info",
  application:  "brand",
  underwriting: "warning",
  placed:       "success",
  lost:         "danger",
};

export const STAGE_META: Record<PipelineStage, { label: string; tone: Tone; color: string; chip: string }> = {
  new_lead:     { label: "New Lead",     tone: STAGE_TONE.new_lead,     color: toneDot(STAGE_TONE.new_lead),     chip: toneSoft(STAGE_TONE.new_lead) },
  contacted:    { label: "Contacted",    tone: STAGE_TONE.contacted,    color: toneDot(STAGE_TONE.contacted),    chip: toneSoft(STAGE_TONE.contacted) },
  quoted:       { label: "Quoted",       tone: STAGE_TONE.quoted,       color: toneDot(STAGE_TONE.quoted),       chip: toneSoft(STAGE_TONE.quoted) },
  application:  { label: "Application",  tone: STAGE_TONE.application,  color: toneDot(STAGE_TONE.application),  chip: toneSoft(STAGE_TONE.application) },
  underwriting: { label: "Underwriting", tone: STAGE_TONE.underwriting, color: toneDot(STAGE_TONE.underwriting), chip: toneSoft(STAGE_TONE.underwriting) },
  placed:       { label: "Placed",       tone: STAGE_TONE.placed,       color: toneDot(STAGE_TONE.placed),       chip: toneSoft(STAGE_TONE.placed) },
  lost:         { label: "Lost",         tone: STAGE_TONE.lost,         color: toneDot(STAGE_TONE.lost),         chip: toneSoft(STAGE_TONE.lost) },
};

/**
 * Lead temperature keeps its traffic-light reading — hot is urgent, cold is
 * calm — because agents scan for it, and it is the one place blue means "cold"
 * rather than "informational".
 */
export const TEMP_META: Record<Temperature, { label: string; tone: Tone; cls: string; dot: string }> = {
  hot:  { label: "Hot",  tone: "danger",  cls: toneSoft("danger"),  dot: toneDot("danger") },
  warm: { label: "Warm", tone: "warning", cls: toneSoft("warning"), dot: toneDot("warning") },
  cold: { label: "Cold", tone: "info",    cls: toneSoft("info"),    dot: toneDot("info") },
};
