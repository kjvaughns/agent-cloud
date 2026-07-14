import * as React from "react";

/**
 * Premium-OS line-icon set, ported from the dashboard reference.
 * 24×24 viewBox, stroke 1.6, currentColor, round caps/joins.
 * Use for compact UI accents; lucide-react is still fine elsewhere.
 */
const P = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const PATHS: Record<string, React.ReactNode> = {
  grid: (<><rect x="3" y="3" width="7" height="7" rx="1.5" {...P} /><rect x="14" y="3" width="7" height="7" rx="1.5" {...P} /><rect x="3" y="14" width="7" height="7" rx="1.5" {...P} /><rect x="14" y="14" width="7" height="7" rx="1.5" {...P} /></>),
  flow: (<><circle cx="6" cy="6" r="2.2" {...P} /><circle cx="6" cy="18" r="2.2" {...P} /><circle cx="18" cy="12" r="2.2" {...P} /><path d="M8 6h4a3 3 0 0 1 3 3v0M8 18h4a3 3 0 0 0 3-3v0" {...P} /></>),
  plus: (<><circle cx="12" cy="12" r="9" {...P} /><path d="M12 8v8M8 12h8" {...P} /></>),
  book: (<path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4zM18 16H7a2 2 0 0 0-2 2" {...P} />),
  coin: (<><ellipse cx="12" cy="7" rx="7" ry="3" {...P} /><path d="M5 7v10c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" {...P} /></>),
  hex: (<path d="M12 3l7.5 4.5v9L12 21l-7.5-4.5v-9L12 3z" {...P} />),
  chart: (<><path d="M4 20V4M4 20h16" {...P} /><path d="M8 16v-3M12 16v-7M16 16v-5" {...P} /></>),
  users: (<><circle cx="9" cy="8" r="3" {...P} /><path d="M4 20a5 5 0 0 1 10 0M16 6.5a3 3 0 0 1 0 5.8M20 20a5 5 0 0 0-3.5-4.8" {...P} /></>),
  trophy: (<><path d="M7 4h10v4a5 5 0 0 1-10 0V4z" {...P} /><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M9 20h6M12 13v4" {...P} /></>),
  spark: (<path d="M12 3l1.8 5.7L19.5 10l-4.8 3.1L15 19l-3-3.4L9 19l.3-5.9L4.5 10l5.7-1.3L12 3z" {...P} />),
  doc: (<><path d="M7 3h7l5 5v13H7z" {...P} /><path d="M14 3v5h5M10 13h6M10 17h6" {...P} /></>),
  play: (<><circle cx="12" cy="12" r="9" {...P} /><path d="M10 8.5l6 3.5-6 3.5z" fill="currentColor" stroke="none" /></>),
  folder: (<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" {...P} />),
  box: (<><path d="M3.5 7.5L12 3l8.5 4.5v9L12 21l-8.5-4.5v-9z" {...P} /><path d="M3.5 7.5L12 12l8.5-4.5M12 12v9" {...P} /></>),
  phone: (<path d="M6 3h3l1.5 4.5-2 1.5a12 12 0 0 0 5 5l1.5-2L20 15v3a2 2 0 0 1-2.2 2A15 15 0 0 1 4 6.2 2 2 0 0 1 6 3z" {...P} />),
  calendar: (<><rect x="3.5" y="5" width="17" height="16" rx="2" {...P} /><path d="M3.5 9.5h17M8 3v4M16 3v4" {...P} /></>),
  nova: (<path d="M12 2.5l2.2 6.9 7.3.1-5.9 4.4 2.2 7-5.8-4.2L6.2 21l2.2-7L2.5 9.5l7.3-.1L12 2.5z" {...P} />),
  bell: (<path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6zM10 20a2 2 0 0 0 4 0" {...P} />),
  search: (<><circle cx="11" cy="11" r="6" {...P} /><path d="M20 20l-4.3-4.3" {...P} /></>),
  arrow: (<path d="M5 12h14M13 6l6 6-6 6" {...P} />),
  up: (<path d="M12 19V5M6 11l6-6 6 6" {...P} />),
  down: (<path d="M12 5v14M6 13l6 6 6-6" {...P} />),
  flat: (<path d="M5 12h14" {...P} />),
  alert: (<><path d="M12 3l9.5 16.5H2.5L12 3z" {...P} /><path d="M12 10v4M12 17h.01" {...P} /></>),
  send: (<path d="M4 12l16-7-7 16-2.5-6.5L4 12z" {...P} />),
  chevron: (<path d="M6 9l6 6 6-6" {...P} />),
  sun: (<><circle cx="12" cy="12" r="4" {...P} /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" {...P} /></>),
  moon: (<path d="M20 14.5A8 8 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5z" {...P} />),
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 17, className, style }: { name: IconName; size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} style={{ display: "block", ...style }}>
      {PATHS[name]}
    </svg>
  );
}
