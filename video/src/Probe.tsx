import React from "react";
import { AbsoluteFill } from "remotion";
import { Screen, type ScreenKey } from "@/components/landing/screens";
import { FRAME_W } from "./components/ScreenStage";

/**
 * Measurement rig. Not part of any deliverable.
 *
 * Renders one screen at its natural 980px layout width, pinned to a known
 * origin, with a 100px ruler over it. Punch-in anchors in the scenes are frame
 * coordinates read straight off a still of this composition, which is a good
 * deal more reliable than guessing where a table row is and re-rendering.
 *
 *   npm run still -- Probe out/probe.png --props='{"screen":"commissions"}'
 */
const ORIGIN = { x: 40, y: 120 };

export const Probe: React.FC<{ screen: ScreenKey }> = ({ screen }) => {
  const ticks = [];
  for (let x = 0; x <= FRAME_W; x += 100) ticks.push(x);
  const yTicks = [];
  for (let y = 0; y <= 700; y += 100) yTicks.push(y);

  return (
    <AbsoluteFill style={{ background: "#08080A" }} className="dark">
      <div style={{ position: "absolute", left: ORIGIN.x, top: ORIGIN.y, width: FRAME_W }}>
        <Screen screen={screen} />
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
