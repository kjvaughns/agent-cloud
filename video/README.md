# Agent Cloud — launch video

A 30-second product launch cut, built in Remotion on the application's **real
screen components**. Nothing here is a mockup: every panel is
`src/components/landing/screens.tsx` rendering at 980px and driven by
`useCurrentFrame()`.

```
cd video
npm install
npm run studio                  # http://localhost:3000
```

| Composition    | Size      | Length | What it is                                         |
| -------------- | --------- | ------ | -------------------------------------------------- |
| `Launch`       | 1080×1920 | 30s    | the cut — Reels, TikTok, Shorts                    |
| `LaunchSquare` | 1080×1080 | 30s    | same edit, centre-cropped for square feeds         |
| `HeroLoop`     | 1920×1080 | 8s     | seamless ambient loop for the website hero         |
| `Probe`        | 1080×1920 | 1f     | measurement rig — not a deliverable, see _Anchors_ |

```
npm run render                  # out/launch.mp4        h264, CRF 18
npm run render:square
npm run render:hero
npm run render:draft            # --scale=0.5, CRF 28 — the iterate loop

npm run typecheck               # tsc + the parameterization guard
npm run check:jank              # samples the card path for discontinuities
npm run audit                   # 23 stills, one per beat of interest
```

Renders land in `out/`, which is gitignored — all of it is one command from
source.

---

## The one idea

> **One record. Recruit to renewal.**

Literally true of the product, which is why it is the right idea: an applicant
becomes an agent becomes a producer becomes a renewal, and it is the same row in
the same database the whole way.

Six anchors. Nothing else in the video gets words.

| #   | Copy                                | Where       |
| --- | ----------------------------------- | ----------- |
| 1   | **One agent.**                      | hook        |
| 2   | **Ready to sell.**                  | contracting |
| 3   | **Paid right.**                     | commissions |
| 4   | **Still on the books.**             | retention   |
| 5   | **One record. Recruit to renewal.** | climax      |
| 6   | **Agent Cloud · useagentcloud.com** | close       |

## The main character

**The agent card.** A single rounded rectangle that never leaves the video. It
does not cut away — it transforms:

```
applicant card       "Marcus Bell · Referral · 2d"
  ↓  a licence chip falls and lands, burst
becomes row 3 of the Contracting request queue
  ↓  a writing number types into it, burst
goes Active
  ↓  climbs into Commissions, becomes a statement line
     variance counts to −$4,180 in red, then resolves
  ↓  climbs into Retention, becomes an at-risk row
     risk score falls 88 → 24, turns green
  ↓  shrinks and multiplies into a downline of eight
  ↓  eight converge back into ONE
  ↓  that one card morphs into the Agent Cloud logo tile
```

The last move is the payoff: **the card becomes the logo.** The logo is already
a rounded gold square and the card has been a rounded rectangle for thirty
seconds — they are the same shape, so the morph costs nothing and lands the
thesis without a word of narration.

## Motion grammar

Five rules, and every one of them is enforced somewhere in the code rather than
left to discipline:

1. **Everything is a rounded rectangle.** One radius scale (`R` in
   `timeline.ts`). No circles except status dots and the burst.
2. **Vertical motion is always UP.** The card climbs 880 → 828 → 776 → 724 →
   656 → 610 and never descends. This is why `stageForCardY` exists: the card's
   Y is the primary variable and each screen positions _itself_ so its row lands
   there. Place the screens at fixed centres instead and the card bobs between
   beats, because the three rows sit at different heights inside their screens.
3. **The camera only pushes IN,** with exactly one pull-back when the logo
   lands. That single reversal is what makes the ending feel like an ending
   rather than like the video stopping.
4. **The card stays near frame centre at a similar size across every handover.**
   That is what makes the beats read as continuous rather than as a slideshow.
5. **Gold appears only when something resolves.** Four bursts in thirty seconds
   — a licence validates, a writing number issues, a variance is caught, a
   policy is saved — plus the endcard. Everything else is greyscale on
   near-black. Restraint is what makes the accent land.

The exception to rule 5 is the bloom, and it is deliberate: light _behind_ the
product is not the accent, it is the room.

---

## Architecture: one clock, no sequences

`Launch.tsx` contains no `<Sequence>` blocks. That is the central decision.

The card never leaves the frame, so cutting the video into seven sequences would
put a mount/unmount boundary at every handover — and those boundaries are
exactly where a morph turns into a jump. Instead everything reads the absolute
frame, the card's geometry is a continuous function of it, and the screens
arrive and leave around it.

The geometry lives in `src/card-path.ts` as a **pure function**, `cardAt(frame)`,
which `Launch` calls and `npm run check:jank` samples. Pulling it out of the
component is what makes the jank protocol mechanical instead of visual — see
below.

---

## Parameterization — the hard rule

**No raw frame numbers, no hex colours and no spring configs anywhere except
`src/timeline.ts`.**

This is not style policing. These constants get changed by hand, constantly, and
everything downstream has to recompute. A hardcoded `frame > 340` in a scene
file is a landmine: it works until someone lengthens an earlier beat, and then
it is wrong in a way that produces no error and is only visible if you happen to
scrub past it.

```ts
export const D = { cardFadeIn: 12, typeName: 26, /* … */ holdClose: 102 };

export const K = (() => {
  // keyframes DERIVED from durations
  let t = 0;
  const at = (d) => {
    const s = t;
    t += d;
    return s;
  };
  return { cardFadeIn: at(D.cardFadeIn), /* … */ TOTAL: t };
})();
```

`K.TOTAL` is 900. Lengthen any duration and every keyframe after it — and the
composition's own length — shifts automatically.

`D` has two kinds of entry and the distinction matters: **actions** (8–30
frames, tuned by eye then left alone) and **`hold*`** (deliberate stillness).
Tune the holds to move a boundary or hit a musical accent. Never stretch an
action to fill time — a card that takes 40 frames to arrive reads sluggish _and_
still leaves dead air.

### The guard

```
npm run check:params
```

Runs as part of `npm run typecheck`. Three checks, each unambiguous: hex colour
literals, spring config keys, and numeric literals inside a frame-driven
`lerp`/`interpolate` input range. It deliberately does **not** flag every
integer — scene files are full of legitimate layout pixels, and a rule that
fires on `left: 108` gets switched off within a day, which is worse than no
rule.

It found 29 violations the first time it ran. Expect it to keep finding them.

---

## The jank protocol

Every animation comes out janky the first time, and the tell is always the same:
a property that should ease smoothly jumps at one specific frame. You have to
find the frame and name it — "make it smoother" gets you nothing.

```
npm run check:jank
```

Samples `cardAt` at all 900 frames and reports, per property, the sharpest
single-frame change and where it is:

```
  ✓ cx        sharpest Δ 30.36 at frame 211   1.3× its neighbours
  ✓ w         sharpest Δ 116.54 at frame 211  1.3× its neighbours
  ✓ card path continuous across all 900 frames
```

The comparison is against each frame's **immediate neighbours**, not the whole
video. That distinction is the difference between a useful check and a noisy
one: most of these 900 frames are deliberate stillness, so a global average
makes every legitimate 9-frame punch-in look like a spike. What indicates a
discontinuity is one frame moving far more than the frames either side of it.

A ratio near 1 with a large delta — frame 211 above — is a punch-in starting at
speed. That is intended; `easeOut` is front-loaded on purpose.

For anything the numeric check cannot see (overlap, z-order, colour), render a
strip and look at it as a sequence:

```
for f in $(seq 210 4 260); do
  npx remotion still Launch out/f$f.png --frame $f --scale 0.4
done
```

---

## The three setup gotchas

All three are handled. This is here so that when you change something and one of
them bites, you recognise it.

### (a) The `@/` alias

`screens.tsx` imports `@/lib/utils` and `@/lib/format`; `remotion.config.ts`
aliases `@` to `../src`. The subtlety is _what it resolves against_. Neither
obvious anchor works: the Remotion CLI transpiles the config to CJS, so
`import.meta.url` is empty and `fileURLToPath` throws; and it evaluates the
result from inside its own package, so `__dirname` is
`node_modules/@remotion/cli/dist`. Aliasing against that points `@` at
Remotion's own source and produces a wall of "doesn't exist" naming files you
never wrote.

So it resolves from `process.cwd()`, which means **Remotion must be run from
`video/`**. A wrong cwd throws one clear sentence instead of the wall.

Second half: files under `../src` are outside this package, so their bare
imports — `lucide-react`, `clsx`, `tailwind-merge` — resolve by walking up from
the repo root, where nothing is installed. `resolve.modules` points them back
here, and `tsconfig.json` mirrors it with `paths` for the type checker. That is
what keeps `video/` self-contained: `npm install` here is the only install
anyone needs.

### (b) Design tokens, and exactly one preflight

The screens are styled with semantic classes — `border-border`, `bg-card`,
`bg-surface-2` — which mean nothing without the app's token layer.

The obvious move, `@import "../../src/styles.css"`, does not work. Tailwind v4
resolves `@import` itself, with its own resolver rooted at the directory of the
importing file, so `src/styles.css` tries to resolve its own
`@import "tailwindcss"` from `<repo>/src`, walks up to `<repo>/node_modules`,
and finds nothing. Webpack's `resolve` never gets a say — the resolution happens
inside the Tailwind compiler.

So `src/tailwind.css` declares Tailwind once, itself, and
`tools/app-tokens-loader.cjs` splices in `src/styles.css` with its bare
`@import`s stripped and its `@source` paths rewritten to absolute. The app file
is read on every build and registered as a watched dependency, so it stays the
single source of truth — change `--gold` in the app and this video changes with
it. It also makes the single-preflight rule mechanical: there is no second
`@import "tailwindcss"` in the graph because the loader deletes the only one
that could have existed.

One consequence: **the app's unscoped tokens are the light theme.** The dark
values live under `.dark`, so every root here carries `className="dark"`.

### (c) Container queries — render wide, scale down

`AppFrame` is an `@container/frame`. Its sidebar is `@3xl/frame:block`, so it
exists only above **768px of layout width**, and second columns and table
headers key off `@xl/frame` at 576px.

So the card is laid out at `FRAME_W = 980` and shrunk with a transform. Setting
`width: 900px` to fit a 1080px canvas _looks like it worked_ and quietly costs
you the nav rail, the table headers and the right-hand column — most of what
makes this read as an application. Transforms do not affect layout width, so the
query still sees 980.

---

## Anchors and the `Probe` composition

The card lands _inside_ real table rows, and it has to sit on them exactly — a
few pixels out and it visibly floats above the table instead of being part of
it. Every row rect in `lib/anchors.ts` is measured, not guessed:

```
npm run still -- Probe out/probe.png --props='{"screen":"retention"}'
```

`Probe` renders one screen at its natural 980px width against a 100px ruler.
Read the coordinate off the still and write it into `lib/anchors.ts`. If a
screen's layout changes in the app, re-run the probe and update the numbers —
nothing else needs to move.

`lib/space.ts` holds `toCanvas`, which maps a point through the same transform
`ScreenStage` applies as CSS. Both read one `Stage` object, and that shared
source is what lets the card stay welded to a row through a punch-in. Two
implementations of one transform drift, and the failure — a card sliding a few
pixels off its row mid-zoom — reads as sloppy animation rather than as the
arithmetic bug it is.

Punch-in depths per screen are not a taste setting: each is chosen so the
card-as-row fits the canvas with its status pill intact _and_ the screen behind
it reaches the right-hand edge instead of stopping short.

---

## Layout constraints

- **Safe area.** Nothing meaningful in the top 12% or bottom 20% — the platforms
  paint their own UI there.
- **The square crop.** `LaunchSquare` is a 1080×1080 window onto the middle band
  of the vertical master. Change a Y coordinate and check the crop before
  shipping.
- **Muted by default.** 85%+ of views have no sound. Every claim is on screen as
  text.
- **Captions must leave.** Each caption has an explicit `until`. Six captions
  that only fade _in_ end up stacked on top of each other by the climax — which
  survives every still you happen to check and then ruins the render.

---

## Look

Palette, radii and type sizes in `timeline.ts`. Two things to know:

**The gold is the brief's `#C9A227`.** The product's own dark-mode `--gold` is
`#CBA35A`, and the screens inside the frame render themselves from that token —
so the UI's gold and the video furniture's gold are close but not identical. Set
`C.accent` to `#CBA35A` and `C.accentLt` to `#E7C877` if you want them the same;
it is a two-line change and nothing else moves. The bloom is built from
`accentLt` rather than `accent` regardless, because a saturated olive gold
spread thinly on near-black stops reading as light and starts reading as a brown
smear.

**Display type is Space Grotesk, not Sora.** The slop rule being guarded against
is "Inter or Roboto or system fonts for display text" — a face with no character
carrying the big type. Space Grotesk is not that, and it is what the product
sets `--font-display` to. Since `screens.tsx` renders its headings from that
variable, choosing Sora would have put the captions in one typeface and the UI
inside the card in another, manufacturing exactly the incoherence the rule
exists to prevent.

Grain is not optional — flat near-black bands visibly once Instagram re-encodes,
and 3.5% noise gives the encoder something to hold onto. It composites last.

Performance: the bloom is a radial gradient, not a `box-shadow` and not a
`filter: blur()`. Shadows and blurs are the render bottleneck in this genre, and
at this softness the two are indistinguishable. Live `filter: blur()` is
reserved for the frames that actually animate it.

---

## Music — not done

The one part of the plan that is not built, because it cannot be generated here.
Videos are half image, half audio and silent has no punch.

```
Suno: "30 second track for a product launch video, percussion only,
       building tension, resolving at the end"
```

Generate 4–6 candidates. What to look for: a clear transient around **19s**
where the eight-way fan hits, and a rhythm that accelerates into the final third
so the multiply can ride it.

Syncing is then editing constants, not rewriting scenes — which is what the
architecture is for. `timeline.ts` exports `BPM`, `B` (frames per beat) and
`beatsAt(frame)`; adjust the `hold*` durations until the big moments land on
beats. Drop the track in `public/`, add `<Audio src={staticFile("track.mp3")} />`
to `Launch`, and nothing else changes.

---

## Rendering notes

Two entries in `remotion.config.ts` exist because of failures actually hit here:

**Chromium discovery.** Remotion downloads its own Chrome Headless Shell from
`remotion.media` on first render, which 403s behind an egress allowlist. The
config prefers `$REMOTION_BROWSER_EXECUTABLE`, then Playwright's Chromium under
`$PLAYWRIGHT_BROWSERS_PATH`, then Remotion's own resolution. It looks for
`headless_shell` across every install _before_ falling back to `chrome`, because
Playwright installs both side by side and the full binary removed old headless
mode — finding it first gets a browser that exits immediately with an error that
never mentions browser selection.

**`setDelayRenderTimeoutInMilliseconds(120_000)`.** The 28-second default killed
a 720-frame render at frame 224, reproducibly, while the same frames rendered
fine in isolation. A render does not use one browser page: Remotion runs several
concurrently and spawns fresh ones as it goes, and every new page re-evaluates
the bundle. A few hundred frames in, on a machine whose cores are all busy
encoding, boot-to-first-paint can exceed a timer that started when the module
was evaluated. It surfaces as "a `delayRender()` was called but not cleared",
naming the fonts, and is a scheduling problem. Set globally because
`@remotion/fonts` opens its own handle with its own default.

Related: the woff2 files are **imported**, not fetched with `staticFile()` — an
`asset/inline` rule turns them into data URIs, so there is no request left to
race.
