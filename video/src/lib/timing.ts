/**
 * The beat grid.
 *
 * Every cut in this video is expressed in beats, never in raw frames. Irregular
 * cut spacing reads amateur even on mute, and a grid means the edit can be
 * dropped onto a 120bpm track later without re-timing a single scene.
 *
 * Change BPM and the entire edit retimes: scene lengths, entrances, holds and
 * the composition's own `durationInFrames` all derive from `beat()`.
 */
export const BPM = 120;
export const FPS = 30;

/** Frames per beat. 15 at 120bpm / 30fps. */
export const B = (60 / BPM) * FPS;

export const beat = (n: number) => Math.round(n * B);

/**
 * Scene boundaries in beats. 48 beats = 720 frames = 24s.
 *
 * The product is on screen at beat 4 — two seconds — because a viewer who has
 * not seen the thing being sold by then has already scrolled.
 */
export const SCENES = [
  { id: "hook", from: 0, to: 4 },
  { id: "contracting", from: 4, to: 10 },
  { id: "commissions", from: 10, to: 16 },
  { id: "retention", from: 16, to: 22 },
  { id: "grid", from: 22, to: 28 },
  { id: "hero", from: 28, to: 34 },
  { id: "imo", from: 34, to: 40 },
  { id: "cta", from: 40, to: 48 },
] as const;

export type SceneId = (typeof SCENES)[number]["id"];

/** `{from, durationInFrames}` for a scene, in absolute frames. */
export const span = (id: SceneId) => {
  const s = SCENES.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown scene: ${id}`);
  return { from: beat(s.from), durationInFrames: beat(s.to) - beat(s.from) };
};

export const TOTAL = beat(SCENES[SCENES.length - 1].to);

/**
 * The element clock.
 *
 * Any single element's entrance is 6-9 frames — 200-300ms — because that is how
 * long real UI takes to respond, and "responsive product" is the feeling the
 * whole video is selling. The scene clock is 24-54 frames; the difference
 * between the two is dead air, and the dead air is what makes it legible.
 *
 * The failure mode is stretching element motion to fill the beat: a card that
 * takes 30 frames to arrive reads sluggish *and* the cut still lands too soon.
 */
export const ENTER = 7;
export const ENTER_SLOW = 9;
