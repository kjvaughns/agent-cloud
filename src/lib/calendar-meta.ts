import { Cake, ClipboardList, Heart, AlertTriangle, Trophy, Calendar as CalIcon, Phone, Users, PhoneCall, MoreHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type EventTypeMeta = {
  label: string;
  color: string; // hex
  bg: string; // tailwind bg class
  border: string; // tailwind border class
  text: string; // tailwind text class
  icon: LucideIcon;
  emoji: string;
};

export const EVENT_META: Record<string, EventTypeMeta> = {
  appointment:          { label: "Appointment",          color: "#C9A227", bg: "bg-[#C9A227]",    border: "border-[#C9A227]",    text: "text-[#1a1a1a]",    icon: CalIcon,        emoji: "📅" },
  birthday:             { label: "Birthday",             color: "#ec4899", bg: "bg-pink-500",    border: "border-pink-500",    text: "text-pink-50",    icon: Cake,           emoji: "🎂" },
  policy_starting_soon: { label: "Policy Starting Soon", color: "#10b981", bg: "bg-emerald-500", border: "border-emerald-500", text: "text-emerald-50", icon: ClipboardList,  emoji: "📋" },
  beneficiary_checkin:  { label: "Beneficiary Check-In", color: "#f97316", bg: "bg-orange-500",  border: "border-orange-500",  text: "text-orange-50",  icon: Heart,          emoji: "💙" },
  lapse_follow_up:      { label: "Lapse Follow-Up",      color: "#ef4444", bg: "bg-red-500",     border: "border-red-500",     text: "text-red-50",     icon: AlertTriangle,  emoji: "⚠️" },
  policy_anniversary:   { label: "Policy Anniversary",   color: "#a855f7", bg: "bg-purple-500",  border: "border-purple-500",  text: "text-purple-50",  icon: Trophy,         emoji: "🏆" },
  follow_up:            { label: "Follow-Up",            color: "#6366f1", bg: "bg-indigo-500",  border: "border-indigo-500",  text: "text-indigo-50",  icon: PhoneCall,      emoji: "📞" },
  meeting:              { label: "Meeting",              color: "#0ea5e9", bg: "bg-sky-500",     border: "border-sky-500",     text: "text-sky-50",     icon: Users,          emoji: "🤝" },
  call:                 { label: "Call",                 color: "#14b8a6", bg: "bg-teal-500",    border: "border-teal-500",    text: "text-teal-50",    icon: Phone,          emoji: "📞" },
  other:                { label: "Other",                color: "#64748b", bg: "bg-slate-500",   border: "border-slate-500",   text: "text-slate-50",   icon: MoreHorizontal, emoji: "•" },
};

export function metaFor(type: string): EventTypeMeta {
  return EVENT_META[type] ?? EVENT_META.other;
}
