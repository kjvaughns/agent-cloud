import React from "react";
import { Screen, type ScreenKey } from "@/components/landing/screens";
import { FRAME_H, FRAME_W, type Anchor, centerOf } from "../lib/anchors";

export { FRAME_W };
export type { Anchor };

/**
 * Base fit from frame pixels to canvas pixels for the establishing shot.
 *
 * At 1.0 the 980px card is 980px wide on a 1080px canvas — a 50px margin each
 * side. Deliberately near the edge: on a vertical canvas a landscape card is
 * always going to be a band, and the way to stop it reading as a postage stamp
 * is to let it own the full width and let the punch-ins do the rest.
 */
export const FIT = 1.0;

export type ScreenStageProps = {
  screen: ScreenKey;
  /** Fit scale from frame pixels to canvas pixels. */
  fit?: number;
  /**
   * Total zoom, including any punch-in and any zoom-through on top of it.
   */
  zoom?: number;
  /**
   * How far the anchor has been pulled to the middle of the card, 0 to 1.
   *
   * This is separate from `zoom` on purpose. Centring the anchor is what makes
   * a punch-in look aimed, but it is *not* wanted at zoom 1 — an establishing
   * shot with the anchor centred is just a card sitting off to one side for no
   * reason. Scenes drive `pull` on the same interpolation as the zoom, so the
   * card is centred when wide and the element is centred when close.
   */
  pull?: number;
  /** The point a punch-in closes on. Defaults to the middle of the card. */
  anchor?: Anchor;
  /** Where the card's centre sits on a 1920-tall canvas. */
  centerY?: number;
  /** 3D establish. Degrees. */
  rotateX?: number;
  rotateY?: number;
  opacity?: number;
  /** Live `filter: blur()`. Reserve for the handful of frames that animate it. */
  blur?: number;
  /** Planar rotation, for the hero stack. */
  rotate?: number;
  translateX?: number;
  translateY?: number;
  /** `clip-path` on the card, for the mask wipe. */
  clipPath?: string;
  /** Overlays in frame coordinates — row highlights, light sweeps. */
  children?: React.ReactNode;
};

/**
 * A product screen on the canvas, with a punch-in that closes on a named
 * element rather than on the middle of the picture.
 *
 * The transform is `translate(...) scale(zoom)` with the origin AT the anchor:
 * scaling about the anchor pins it in place, and the translate then carries it
 * to the centre of the card, by `pull`. In that order, `anchor` can be read
 * straight off a `Probe` still in frame pixels with no arithmetic at the call
 * site — which is the only reason `lib/anchors.ts` stays maintainable.
 */
export const ScreenStage: React.FC<ScreenStageProps> = ({
  screen,
  fit = FIT,
  zoom = 1,
  pull = 0,
  anchor,
  centerY = 900,
  rotateX = 0,
  rotateY = 0,
  opacity = 1,
  blur = 0,
  rotate = 0,
  translateX = 0,
  translateY = 0,
  clipPath,
  children,
}) => {
  const mid = centerOf(screen);
  const a = anchor ?? mid;
  const dx = (mid.x - a.x) * pull;
  const dy = (mid.y - a.y) * pull;

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: centerY,
        width: FRAME_W,
        height: FRAME_H[screen],
        marginLeft: -FRAME_W / 2,
        marginTop: -FRAME_H[screen] / 2,
        // `perspective` belongs on the ancestor of the rotated element. Put it
        // on the element itself and the tilt flattens into a shear.
        perspective: 1400,
        opacity,
        filter: blur > 0.05 ? `blur(${blur}px)` : undefined,
      }}
    >
      <div
        style={{
          transform: `translate(${translateX}px, ${translateY}px) scale(${fit}) rotateX(${rotateX}deg) rotateY(${rotateY}deg) rotate(${rotate}deg)`,
          transformStyle: "preserve-3d",
        }}
      >
        <div
          style={{
            transform: `translate(${dx}px, ${dy}px) scale(${zoom})`,
            transformOrigin: `${a.x}px ${a.y}px`,
          }}
        >
          <div
            style={{
              width: FRAME_W,
              height: FRAME_H[screen],
              clipPath,
              position: "relative",
            }}
            className="dark"
          >
            <Screen screen={screen} />
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};
