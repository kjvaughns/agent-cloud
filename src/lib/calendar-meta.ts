import { Cake, ClipboardList, Heart, AlertTriangle, Trophy, Calendar as CalIcon, Phone, Users, PhoneCall, MoreHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toneDot, toneSoft, type Tone } from "./tone";

/**
 * Ten event types previously carried ten hard-coded hex values and ten palette
 * classes — pink, teal, indigo, sky, purple — which turned a week view into a
 * confetti of colours that meant nothing and ignored the theme entirely.
 *
 * An event now declares a tone. Two things read an event: a filled dot in the
 * legend and a chip in the grid. The chip is the soft rendering, so a day with
 * six events stays readable instead of six saturated blocks fighting the text.
 */
export type EventTypeMeta = {
  label: string;
  tone: Tone;
  /** Solid dot — legend and month-cell markers. */
  bg: string;
  /** Soft chip — event blocks in week/day views. */
  chip: string;
  icon: LucideIcon;
  emoji: string;
};

const def = (label: string, tone: Tone, icon: LucideIcon, emoji: string): EventTypeMeta => ({
  label,
  tone,
  bg: toneDot(tone),
  chip: toneSoft(tone),
  icon,
  emoji,
});

export const EVENT_META: Record<string, EventTypeMeta> = {
  appointment:          def("Appointment",          "brand",   CalIcon,         "📅"),
  birthday:             def("Birthday",             "brand",   Cake,            "🎂"),
  policy_starting_soon: def("Policy Starting Soon", "success", ClipboardList,   "📋"),
  beneficiary_checkin:  def("Beneficiary Check-In", "info",    Heart,           "💙"),
  lapse_follow_up:      def("Lapse Follow-Up",      "danger",  AlertTriangle,   "⚠️"),
  policy_anniversary:   def("Policy Anniversary",   "success", Trophy,          "🏆"),
  follow_up:            def("Follow-Up",            "warning", PhoneCall,       "📞"),
  meeting:              def("Meeting",              "info",    Users,           "🤝"),
  call:                 def("Call",                 "info",    Phone,           "📞"),
  other:                def("Other",                "neutral", MoreHorizontal,  "•"),
};

export function metaFor(type: string): EventTypeMeta {
  return EVENT_META[type] ?? EVENT_META.other;
}
