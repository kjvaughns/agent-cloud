import React from "react";
import { Screen } from "@/components/landing/screens";
import { FRAME_H, FRAME_W } from "../lib/anchors";
import { type Stage } from "../lib/space";
import { FIT, R } from "../timeline";

export { FRAME_W };

export { FIT };

/**
 * A product screen on the canvas.
 *
 * Everything about where it sits comes from the `Stage` object, which is also
 * what `toCanvas` reads to work out where a given table row has ended up. That
 * shared source is the whole reason the agent card can land in a row and stay
 * welded to it through a punch-in.
 *
 * Gotcha (c) in the README lives here: the card is laid out at `FRAME_W` and
 * shrunk with a transform, never by setting a narrower width. `AppFrame` is an
 * `@container/frame` whose sidebar only exists above 768px of *layout* width,
 * and transforms do not affect layout width.
 */
export const ScreenStage: React.FC<{
  stage: Stage;
  opacity?: number;
  blur?: number;
  rotate?: number;
  /** `clip-path` on the card, for the build-in wipe. */
  clipPath?: string;
  /** Overlays in frame coordinates. */
  children?: React.ReactNode;
}> = ({ stage: s, opacity = 1, blur = 0, rotate = 0, clipPath, children }) => {
  const w = FRAME_W;
  const h = FRAME_H[s.screen];
  const dx = s.pull * (w / 2 - s.anchor.x);
  const dy = s.pull * (h / 2 - s.anchor.y);

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: s.centerY,
        width: w,
        height: h,
        marginLeft: -w / 2,
        marginTop: -h / 2,
        opacity,
        filter: blur > 0.05 ? `blur(${blur}px)` : undefined,
      }}
    >
      <div
        style={{
          transform: `translate(${s.translateX}px, ${s.translateY}px) scale(${s.fit}) rotate(${rotate}deg)`,
        }}
      >
        <div
          style={{
            transform: `translate(${dx}px, ${dy}px) scale(${s.zoom})`,
            transformOrigin: `${s.anchor.x}px ${s.anchor.y}px`,
          }}
        >
          <div
            style={{
              width: w,
              height: h,
              clipPath,
              borderRadius: R.screen,
              position: "relative",
            }}
            className="dark"
          >
            <Screen screen={s.screen} />
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};
