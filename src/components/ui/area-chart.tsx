/**
 * Self-contained smooth SVG area chart (catmull-rom → bezier), ported from
 * the dashboard reference. Gold gradient fill + end-point marker.
 * For single-series sparspark-style trends; multi-series pages use Recharts.
 */
export function SmoothAreaChart({
  data,
  w = 560,
  h = 132,
  className,
}: {
  data: number[];
  w?: number;
  h?: number;
  className?: string;
}) {
  if (!data || data.length < 2) {
    return <div style={{ height: h }} className={className} />;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const pad = 6;
  const X = (i: number) => pad + (i / (data.length - 1)) * (w - pad * 2);
  const Y = (v: number) => h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2 - 8);
  const pts = data.map((v, i) => [X(i), Y(v)] as [number, number]);

  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  const area = `${d} L${X(data.length - 1)},${h} L${X(0)},${h} Z`;
  const last = pts[pts.length - 1];
  const gid = `smootharea-grad`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className} style={{ width: "100%", height: h, display: "block" }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1="0" x2={w} y1={h * f} y2={h * f} stroke="var(--border-soft)" strokeWidth="1" />
      ))}
      <path d={area} fill={`url(#${gid})`} />
      <path d={d} fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="3.5" fill="var(--gold-bright)" />
      <circle cx={last[0]} cy={last[1]} r="7" fill="var(--gold)" opacity="0.18" />
    </svg>
  );
}
