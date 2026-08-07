# Agent Cloud — launch video

A 24-second product launch cut for Reels / TikTok / X, built in Remotion on the
application's **real screen components**. Nothing here is a mockup: every panel
you see is `src/components/landing/screens.tsx` rendering at 980px and driven by
`useCurrentFrame()`.

```
cd video
npm install
npm run studio                  # http://localhost:3000
```

| Composition    | Size      | Length | What it is                                             |
| -------------- | --------- | ------ | ------------------------------------------------------ |
| `Launch`       | 1080×1920 | 24s    | the cut — Reels, TikTok, Shorts                         |
| `LaunchSquare` | 1080×1080 | 24s    | same edit, centre-cropped for square feeds              |
| `HeroLoop`     | 1920×1080 | 8s     | seamless ambient loop for the website hero              |
| `Probe`        | 1080×1920 | 1f     | measurement rig — not a deliverable, see *Anchors*      |

```
npm run render                  # out/launch.mp4        h264, CRF 18
npm run render:square
npm run render:hero
npm run render:draft            # --scale=0.5, CRF 28 — the iterate loop
npm run audit                   # 15 stills, one per beat of interest
```

Renders land in `out/`, which is gitignored — all of it is one command away from
source.

---

## Why importing the app's components is safe here

Importing an application's React components into Remotion is normally a mistake.
CSS transitions and Framer Motion are driven by wall-clock time, and a renderer
that jumps to frame 412 and screenshots it gets whatever those animations looked
like at t=0 — frozen, mid-transition, wrong.

`screens.tsx` is the exception, and it was checked rather than assumed: no
`transition-*`, no `animate-*`, no `@keyframes`, no framer-motion. Pure static
JSX built from the app's design tokens. Every frame of motion in this video
comes from `useCurrentFrame()` in wrappers under `src/components/`.

**If you add a CSS transition to `screens.tsx`, this video breaks silently.** It
will still render. The affected element will just be wrong in every frame, in a
way that looks like a bug in the video.

One thing to know: `screens.tsx` imports `display` from `./primitives`, and
`primitives.tsx` *does* contain transitions and effects (`FadeUp`,
`LandingSection`). Those come along in the bundle but are never rendered, so
they cost a few KB and change nothing. `primitives.tsx` also reaches
`@/lib/landing-analytics`, which is window-guarded and inert here.

Nothing else is imported from `src/`. No routes, no hooks, nothing touching
TanStack Router, React Query or Supabase.

---

## The three setup gotchas

These are the ones that cost real time, and all three are already handled — this
is here so that when you change something and one of them bites, you recognise
it.

### (a) The `@/` alias

`screens.tsx` imports `@/lib/utils` and `@/lib/format`. `remotion.config.ts`
aliases `@` to `../src`.

The subtlety is *what it is resolved against*. Neither obvious anchor works: the
Remotion CLI transpiles the config to CJS, so `import.meta.url` is empty and
`fileURLToPath` throws; and it evaluates the result from inside its own package,
so `__dirname` is `node_modules/@remotion/cli/dist`. Aliasing against that
points `@` at Remotion's own source, and you get a wall of "doesn't exist" from
the resolver that names files you never wrote.

So it resolves from `process.cwd()`, which means **Remotion has to be run from
`video/`**. A wrong cwd throws one clear sentence instead of the wall.

There is a second half to this. Files under `../src` are outside this package,
so their bare imports — `lucide-react`, `clsx`, `tailwind-merge` — resolve by
walking up from the repo root, where nothing is installed. `resolve.modules`
points them back here, and `tsconfig.json` mirrors it with `paths` for the type
checker. That is what keeps `video/` self-contained: `npm install` in this
folder is the only install anyone needs.

### (b) Design tokens, and exactly one preflight

The screens are styled with semantic classes — `border-border`, `bg-card`,
`bg-surface-2`, `text-muted-foreground` — which mean nothing without the app's
token layer.

The obvious move is `@import "../../src/styles.css"` from the video's
stylesheet. It does not work, for a reason worth knowing: Tailwind v4 resolves
`@import` itself, with its own resolver rooted at the directory of the file
doing the importing. Inlined that way, `src/styles.css` tries to resolve its own
`@import "tailwindcss"` from `<repo>/src`, walks up to `<repo>/node_modules`,
and finds nothing. Webpack's `resolve` never gets a say — the resolution happens
inside the Tailwind compiler.

So `src/tailwind.css` declares Tailwind once, itself, and
`tools/app-tokens-loader.cjs` splices in the contents of `src/styles.css` with
its bare `@import`s stripped and its `@source` paths rewritten to absolute. The
app file is read from disk on every build and registered as a watched
dependency, so it stays the single source of truth — change `--gold` in the app
and this video's accent changes with it.

That also makes the single-preflight rule mechanical rather than a convention.
Two Tailwind preflights fighting over resets break the layout in ways that look
like bugs in scene code; there is no second `@import "tailwindcss"` anywhere in
the graph, because the loader deletes the only one that could have existed.

One consequence worth stating: **the app's unscoped tokens are the light
theme**. The dark values live under `.dark`, so every root in this workspace
carries `className="dark"`. Drop it and you get a white product on a black
canvas.

### (c) Container queries — render wide, scale down

`AppFrame` is an `@container/frame`. Its sidebar is `@3xl/frame:block`, so it
exists only above **768px of layout width**, and the second column and table
headers of every screen key off `@xl/frame` at 576px.

So the card is laid out at `FRAME_W = 980` and shrunk with a CSS transform.
Setting `width: 900px` to make it fit a 1080px canvas *looks like it worked* and
quietly costs you the nav rail, the table headers and the right-hand column of
every screen — which is most of what makes this read as an application rather
than a card with some rows in it. Transforms do not affect layout width, so the
container query still sees 980.

---

## The beat grid, and how to retime

Every cut is expressed in beats, never in raw frames. Irregular cut spacing
reads amateur even on mute, and a grid means the edit drops onto a 120bpm track
later without re-timing a single scene.

```ts
// src/lib/timing.ts
export const BPM = 120;
export const FPS = 30;
export const B = (60 / BPM) * FPS;        // 15 frames per beat
export const beat = (n: number) => Math.round(n * B);
```

**To retime the whole video, change `BPM`.** Scene boundaries, composition
lengths and `TOTAL` all derive from `beat()`; nothing has a hard-coded frame
count for its position.

48 beats = 720 frames = 24s:

| Beats | Frames  | Scene         | File                      |
| ----- | ------- | ------------- | ------------------------- |
| 0–4   | 0–60    | Hook          | `scenes/Hook.tsx`         |
| 4–10  | 60–150  | Contracting   | `scenes/Contracting.tsx`  |
| 10–16 | 150–240 | Commissions   | `scenes/Commissions.tsx`  |
| 16–22 | 240–330 | Retention     | `scenes/Retention.tsx`    |
| 22–28 | 330–420 | Grid          | `scenes/Grid.tsx`         |
| 28–34 | 420–510 | Hero          | `scenes/Hero.tsx`         |
| 34–40 | 510–600 | Not your IMO  | `scenes/NotYourImo.tsx`   |
| 40–48 | 600–720 | CTA           | `scenes/Cta.tsx`          |

Scenes are pure — none reads absolute time — so any of them can be re-ordered
or dropped into another composition without editing it.

### The two clocks

The mechanism that makes this feel fast without feeling frantic:

- **Element clock** — any single entrance is **6–9 frames**. Not 20. Real UI
  moves in 150–250ms, and "responsive product" is the feeling being sold.
- **Scene clock** — a beat holds for 24–54 frames.
- **Dead air** — after every action, nothing happens. A card arrives in 7 frames
  and then sits for 25.

The failure mode is stretching element motion to fill the beat. A card that
takes 30 frames to arrive reads sluggish *and* the cut still lands too soon.

Three spring configs live in `lib/motion.ts`; `SNAPPY` does about 90% of the
work, `POP` is spent once on the hero line, and `NONE` exists for transitions.
Use `enter(frame, fps, 7)` rather than hand-tuning stiffness. `lerp()` is
`interpolate` with both ends clamped, which is what a scene always wants.

---

## Transitions

About 70% of the cuts are hard cuts on the beat. Nothing uses
`TransitionSeries`, and that is a decision rather than an omission:

- `TransitionSeries` consumes frames from both neighbours
  (`total = seqA + seqB − transition`), so a fixed beat grid and a series of
  transitions fight each other, and the grid loses a frame at a time until the
  cuts drift audibly off the track.
- The one transition that matters — the **element-anchored zoom-through** from
  the Contracting row into the Commissions statement panel — has both halves
  living inside the scenes they belong to. Contracting accelerates away over its
  last five frames and blurs to 8px; Commissions opens at 2.2× on the matching
  anchor and decelerates in over seven, with one frame of gold at 30% over the
  seam. Each scene owns its curve, reads its own local frame, and the cut stays
  exactly on the beat.

The built-in `crossZoom()` and `dreamyZoom()` cannot do this — they zoom to
*frame centre*, not to an element. They are also built on HTML-in-canvas, which
needs Chrome 149 with `chrome://flags/#canvas-draw-element` to preview and does
not work in Firefox or Safari at all; a preview that looks broken while the
render is correct is that.

`@remotion/transitions` is installed and currently unused. It is kept because
anything added later will want it — and if you do reach for it, pass
`springTiming({ durationRestThreshold: 0.001 })`, since the 0.005 default cuts
off visibly.

---

## Anchors, and the `Probe` composition

A punch-in that closes on "roughly the middle-left" is the difference between a
shot that looks aimed and one that looks like a zoom. Every punch-in target in
`lib/anchors.ts` is a **measured** frame coordinate, not a guess:

```
npm run still -- Probe out/probe.png --props='{"screen":"retention"}'
```

`Probe` renders one screen at its natural 980px width against a 100px ruler.
Read the coordinate off the still, write it into `lib/anchors.ts`, done. If a
screen's layout changes in the app, re-run the probe and update the numbers —
nothing else in the video needs to move.

`ScreenStage` takes `zoom` and `pull` separately, and the split matters:
centring the anchor is what makes a punch-in look aimed, but it is *not* wanted
at zoom 1, where an off-centre anchor is just a card sitting to one side for no
reason. Scenes drive `pull` on the same interpolation as the zoom.

---

## Layout constraints

- **Safe area.** Nothing meaningful in the top 12% or bottom 20% — the platforms
  paint their own UI there.
- **The square crop.** `LaunchSquare` is a 1080×1080 window onto y 370–1450 of
  the vertical master. The vertical layout is tuned against that band: eyebrows
  sit at 376 so the square keeps them, captions at 1290 and the hero line at
  1230 so their second lines land above 1450. **Change a Y coordinate in a scene
  and check the square crop before shipping.**
- **Muted by default.** 85%+ of views have no sound. Every claim is on screen as
  text; if it is not written, it is not communicated.
- **Two lines maximum, 3–7 words.** Captions are authored one line per line — a
  wrap means the writing and the layout have stopped agreeing about what the
  shot says. `Caption` is 46px because at 52 the longest line wrapped to three.

---

## Look

Palette in `lib/theme.ts`. Two things to know:

**The gold is the app's real gold.** `GOLD` is `#CBA35A`, the dark-mode `--gold`
from `src/styles.css`, with `#E7C877` as `--gold-bright` for figures. The brief
specified `#C9A227`, but that value appears nowhere in the token set, and a
caption in a different gold from the UI beneath it reads as a mistake. Both come
from the same pair; change those two lines and the whole video's accent moves.

**The fonts are the app's real fonts.** Space Grotesk (`--font-display`) and
Hanken Grotesk (`--font-body`), loaded from local woff2 in `public/fonts/`. The
brief asked for Sora and Inter; the product ships neither, and since
`screens.tsx` sets headings in `var(--font-display)`, loading Sora would have
left the UI in one typeface and the captions in another.

Grain is not optional — large flat near-black fields band visibly once Instagram
re-encodes them, and 3.5% noise gives the encoder something to hold onto. It is
composited last, above every scene.

Performance: the bloom behind each card is a radial gradient, not a `box-shadow`
and not a `filter: blur()`. Shadows and blurs are the render bottleneck in this
genre, and at this softness the two are indistinguishable. Live `filter: blur()`
is reserved for the handful of frames that actually animate it — the
zoom-through and word punch-ins, which drop to `none` the moment they settle.

---

## Rendering notes

Two things in `remotion.config.ts` exist because of failures that were hit, not
anticipated:

**Chromium discovery.** Remotion downloads its own Chrome Headless Shell from
`remotion.media` on first render, which 403s behind an egress allowlist — CI,
sandboxes, most locked-down build images. The config prefers
`$REMOTION_BROWSER_EXECUTABLE`, then Playwright's Chromium under
`$PLAYWRIGHT_BROWSERS_PATH`, then Remotion's own resolution. It looks for
`headless_shell` across every install *before* falling back to `chrome`, because
Playwright installs both side by side and the full binary has removed old
headless mode — finding it first gets you a browser that exits immediately with
an error that does not mention browser selection at all.

**`setDelayRenderTimeoutInMilliseconds(120_000)`.** The 28-second default killed
a 720-frame render at frame 224, reproducibly, while the same frames rendered
fine in isolation. The cause is not what the error says. A render does not use
one browser page: Remotion runs several concurrently and spawns fresh ones as it
goes, and every new page re-evaluates the bundle from scratch. Do that a few
hundred frames in, on a machine whose cores are all busy encoding, and the new
page can miss a timer that started the moment the module was evaluated. It
surfaces as "a `delayRender()` was called but not cleared", naming the fonts,
and it is a scheduling problem. Set globally because `@remotion/fonts` opens its
own handle with its own default — a per-call timeout fixes half of it and lets
the other half fail four frames later.

Related: the woff2 files are **imported**, not fetched with `staticFile()` — an
`asset/inline` rule in the webpack config turns them into data URIs. 65KB of
fonts becomes ~88KB of base64 in the bundle and there is no request left to
race.

---

## Audit before you render

A 24-second render takes minutes; a bad `line-height` takes one still to find.

```
npm run audit                   # 15 stills into out/audit/
```

Check specifically for: text clipped (line-height must be ≥ 1.2), things stacked
vertically because `AbsoluteFill` is `display: flex; flex-direction: column`,
content truncated inside a card, and **whether the `AppFrame` sidebar actually
rendered** — its absence is the loudest signal that gotcha (c) has come back.

One trap in reading the stills: the frames in `scripts/audit-stills.mjs` are
absolute, but every scene animates on its own local clock, so a frame that looks
late in the video can be frame 3 of the shot it lands in. Scene starts are in
the table above.
