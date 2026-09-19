import React from "react";
import { AbsoluteFill, continueRender, delayRender } from "remotion";
import { Screen, type ScreenKey, type ScreenScope } from "@/components/landing/screens";
import { FRAME_W } from "./components/ScreenStage";

/**
 * Measurement rig. Not part of any deliverable.
 *
 * Renders one screen at its natural 980px layout width and reports the exact
 * rect of the elements the video has to weld itself to, straight out of the
 * DOM. `scripts/measure.mjs` renders this composition once per screen, reads
 * the numbers off the browser console and prints a paste-ready block for
 * `lib/anchors.ts`.
 *
 * The previous version drew a 100px ruler and left you to read positions off a
 * still. That is fine for a sanity check and hopeless as a source of truth: a
 * row centre guessed to the nearest ten pixels puts the card visibly off its
 * row, and the error looks like bad animation rather than like the arithmetic
 * mistake it is. The ruler is still drawn — it is genuinely useful for seeing
 * whether a punch-in is aimed somewhere sensible — but nothing is read from it.
 *
 *   npm run measure
 *   npm run still -- Probe out/probe.png --props='{"screen":"book"}'
 */
const ORIGIN = { x: 40, y: 120 };

/** The smallest element matching `sel` whose text contains `text`. */
const byText = (root: HTMLElement, sel: string, text: string): HTMLElement | null => {
  const hits = Array.from(root.querySelectorAll<HTMLElement>(sel)).filter((el) =>
    (el.textContent ?? "").includes(text),
  );
  if (!hits.length) return null;
  return hits.reduce((a, b) =>
    b.getBoundingClientRect().height < a.getBoundingClientRect().height ? b : a,
  );
};

/**
 * What to measure on each screen.
 *
 * `row` is the thing the deal card becomes and must cover exactly. `anchor` is
 * where a punch-in aims — usually the row's own centre, because a row whose
 * centre is not the anchor ends up straddling the canvas edge once the zoom
 * bites.
 */
const TARGETS: Partial<Record<ScreenKey, { row: [string, string]; anchor?: [string, string] }>> = {
  pipeline: { row: ["div.rounded-md.border", "Mark Sold"] },
  postDeal: {
    row: ["div.rounded-lg.border", "Policy Details"],
    anchor: ["div.min-w-0", "Annual Premium"],
  },
  book: { row: ["div.flex.items-center", "Willie Jenkins"] },
  leaderboard: { row: ["div.flex.items-center", "Priya Raman"] },
  finances: { row: ["div.flex.items-center", "Advance"] },
  // The header strip, not one of the four cards: the deal card lands as Nova's
  // subject line and the automations fan out beneath it. A 396px card would
  // also force a much deeper punch than its neighbours to fill the canvas.
  // Matched on "online" rather than "Nova AI": the window title bar reads
  // "Nova AI — Agent Cloud", is also a flex row, and is shorter — so it wins a
  // smallest-match on the obvious string.
  nova: { row: ["div.flex.items-center", "online"] },
  contracting: { row: ["div.flex.items-center", "Foresters"] },
  commissions: { row: ["div.flex.items-center", "TA_July_2026"] },
  retention: { row: ["div.flex.items-center", "Angela Ruiz"] },
  grid: { row: ["div.flex.items-center", "Transamerica"] },
};

export const Probe: React.FC<{ screen: ScreenKey; scope?: ScreenScope }> = ({
  screen,
  scope = "mine",
}) => {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const [handle] = React.useState(() => delayRender(`probe:${screen}`));

  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const frame = host.firstElementChild as HTMLElement | null;
    const fr = frame?.getBoundingClientRect();
    const rel = (el: HTMLElement | null) => {
      if (!el || !fr) return null;
      const r = el.getBoundingClientRect();
      return {
        cx: Math.round((r.left + r.width / 2 - fr.left) * 10) / 10,
        cy: Math.round((r.top + r.height / 2 - fr.top) * 10) / 10,
        w: Math.round(r.width * 10) / 10,
        h: Math.round(r.height * 10) / 10,
      };
    };
    const t = TARGETS[screen];
    // eslint-disable-next-line no-console
    console.log(
      "PROBE " +
        JSON.stringify({
          screen,
          scope,
          frameH: fr ? Math.round(fr.height * 10) / 10 : null,
          frameW: fr ? Math.round(fr.width * 10) / 10 : null,
          row: t ? rel(byText(host, t.row[0], t.row[1])) : null,
          anchor: t?.anchor ? rel(byText(host, t.anchor[0], t.anchor[1])) : null,
        }),
    );
    continueRender(handle);
  }, [screen, scope, handle]);

  const ticks: number[] = [];
  for (let x = 0; x <= FRAME_W; x += 100) ticks.push(x);
  const yTicks: number[] = [];
  for (let y = 0; y <= 700; y += 100) yTicks.push(y);

  return (
    <AbsoluteFill style={{ background: "#08080A" }} className="dark">
      <div
        ref={hostRef}
        style={{ position: "absolute", left: ORIGIN.x, top: ORIGIN.y, width: FRAME_W }}
      >
        <Screen screen={screen} scope={scope} />
        {ticks.map((x) => (
          <div
            key={`x${x}`}
            style={{
              position: "absolute",
              left: x,
              top: -40,
              bottom: -40,
              width: 1,
              background: "rgba(255,0,120,0.55)",
            }}
          >
            <span style={{ color: "#ff2d87", fontSize: 18, position: "absolute", top: 0, left: 3 }}>
              {x}
            </span>
          </div>
        ))}
        {yTicks.map((y) => (
          <div
            key={`y${y}`}
            style={{
              position: "absolute",
              top: y,
              left: -40,
              right: -40,
              height: 1,
              background: "rgba(0,200,255,0.55)",
            }}
          >
            <span style={{ color: "#00c8ff", fontSize: 18, position: "absolute", left: 0, top: 2 }}>
              {y}
            </span>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
