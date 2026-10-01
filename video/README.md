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
npm run check:jank              # card path continuity + no frame edge in shot
npm run measure                 # re-read every screen's geometry from the DOM
npm run audit                   # 37 stills, one per beat of interest
```

Renders land in `out/`, which is gitignored — all of it is one command from
source.

---

## What this needed from `src/`

The first cut of this video touched nothing outside `video/`. This one could
not: of the seven surfaces the story needs, only Pipeline and Commissions
existed as video-safe components. Post a Deal, Book of Business, Leaderboard,
Finances and a Nova panel existed **only** as real application routes wired to
TanStack Router, React Query and Supabase — none of which can be mounted in a
Remotion bundle.

So `src/components/landing/screens.tsx` gained six screens, built from the
vocabulary that was already private to that file (`Tile`, `Pill`, `Table`,
`Row`, `Cell`, `Avatar`). They are real marketing components, not video props:
the landing page can use them, and `product-stories.tsx` currently fakes its
"book" story with the commissions visual.

Three things to know if you edit that file:

- **`DEAL` is exported and shared.** Six screens and this video read the same
  object. The whole claim being made is that a sale entered once appears
  everywhere without being retyped; if the policy number on the Book screen were
  a different literal from the one on Finances, the screenshots would quietly be
  making the opposite claim.
- **The nav rail is stuck at twelve entries.** It is the taller of the two
  columns on every screen except Retention, so the rail — not the content — sets
  the frame's height. A thirteenth entry silently grows every screenshot on the
  marketing page by ~32px at once. Measured, not guessed: thirteen took all four
  pre-existing screens from 390/404 to a uniform 422. Swap entries in and out;
  do not append.
- **`Screen` takes a `scope` prop** (`"mine" | "agency"`), read only by
  `leaderboard`. It exists so the video can cross-fade one screen between two
  scopes rather than cut to a different one — which is what the application
  actually does, and the better shot: the page does not cut, it grows.

Verified against a rendered baseline: the four pre-existing screens measure
byte-identically before and after this change.

---

## The one idea

> **Post it once. Everything updates.**

Literally true of the product, which is why it is the right idea: a deal entered
on Post a Deal is the same record that appears in the book, moves the
leaderboard, produces two commission rows and hands Nova its follow-ups. Nobody
retypes it anywhere.

Six captions. Nothing else in the video gets words.

| #   | Copy                                  | Where            |
| --- | ------------------------------------- | ---------------- |
| 1   | **One sale.**                         | pipeline         |
| 2   | **Entered once.**                     | post a deal      |
| 3   | **In the book.**                      | book of business |
| 4   | **On the board.**                     | leaderboard      |
| 5   | **Paid — writing and override.**      | finances         |
| 6   | **Nova takes the follow-up.**         | nova             |
|     | _(silence)_                           | agency scope     |
| →   | **Post it once. Everything updates.** | endcard          |

The agency beat is deliberately wordless. It is the only rest in the cut and it
lands immediately before the thesis.

**Two cursor clicks, not six.** The interactive demo this advertises has six
guided clicks; the video's claim is the opposite of that number. A human marks
the deal sold and posts it, and the other five screens update without anyone
touching them. Animating a cursor onto the Book of Business or the leaderboard
would say the user had to go and do something there.

## The main character

**The deal.** A single rounded rectangle that never leaves the video. It does
not cut away — it transforms:

```
prospect card        "Willie Jenkins · Houston, TX · $99.99/mo · Callback"
  ↓  the cursor hits Mark Sold, burst
becomes the Post a Deal form
  ↓  carrier, product and premium type in
     $1,199.88 / year resolves green — computed, never typed
  ↓  the cursor hits Post Deal, burst
becomes the policy row in the Book of Business
  ↓  effective date, draft day, anniversary
becomes the leaderboard row
  ↓  ALP counts to $19,600, agency rank 5 → 4
becomes the Finances payout — $720 advance
  ↓  a second row lands underneath: $225 override to the upline
becomes Nova's subject line
  ↓  four automations fan out beneath it
the scope toggle flips Mine → Agency, six rows fade in around it
  ↓  that one card morphs into the Agent Cloud logo tile
```

One posted deal, seven surfaces, and the only two clicks in the video happen in
the first nine seconds.

The last move is the payoff: **the card becomes the logo.** The logo is already
a rounded gold square and the card has been a rounded rectangle for thirty
seconds — they are the same shape, so the morph costs nothing and lands the
thesis without a word of narration.

## Motion grammar

Five rules, and every one of them is enforced somewhere in the code rather than
left to discipline:

1. **Everything is a rounded rectangle.** One radius scale (`R` in
   `timeline.ts`). No circles except status dots and the burst.
2. **Vertical motion is always UP.** The card climbs 1120 → 700 and never
   descends; `check:jank` asserts it. This is why `stageForCardY` exists: the
   card's Y is the primary variable and each screen positions _itself_ so its
   row lands there. Place the screens at fixed centres instead and the card bobs
   between beats, because the seven rows sit at different heights inside their
   screens.
3. **The camera only pushes IN,** with exactly one pull-back when the logo
   lands. That single reversal is what makes the ending feel like an ending
   rather than like the video stopping.
4. **The card stays near frame centre at a similar size across every handover.**
   That is what makes the beats read as continuous rather than as a slideshow.
5. **Gold appears only when something resolves.** Two bursts in thirty seconds —
   the deal is marked sold, the deal is posted — plus the endcard. The annual
   premium resolves green because that is the product's own colour for a
   computed figure. Everything else is greyscale on near-black. Restraint is
   what makes the accent land.

The exception to rule 5 is the bloom, and it is deliberate: light _behind_ the
product is not the accent, it is the room.

---

## Architecture: one clock, no sequences

`Launch.tsx` contains no `<Sequence>` blocks. That is the central decision.

The card never leaves the frame, so cutting the video into eight sequences would
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
it. Every rect in `lib/anchors.ts` is measured, not guessed:

```
npm run measure
```

`Probe` renders one screen at its natural 980px width and reports
`getBoundingClientRect()` for the frame and for the row the card has to cover;
`scripts/measure.mjs` renders it once per screen, reads the numbers off the
browser console and prints a paste-ready block. Re-run it whenever a screen's
layout changes in the app — nothing else needs to move.

It used to draw a 100px ruler and leave you to read positions off a still. That
is fine as a sanity check and hopeless as a source of truth: the hand-read
values it produced had the frames at 390 and 404 when they are really 393.5 and
406.5. Three pixels is invisible in a still and very visible in motion, because
the card is welded to the row and a constant offset makes it look like it is
hovering just above the table. The ruler is still drawn — it is genuinely useful
for seeing whether a shot is aimed sensibly — but nothing is read from it.

The measurement runs through the Node API rather than the CLI, because the CLI
does not forward browser console output at any log level. `remotion.config.ts`
and `scripts/measure.mjs` therefore share one webpack definition in
`tools/bundle-config.cjs`; two copies would drift, and the failure mode is a
measurement taken against a differently-built page than the one that renders.

`lib/space.ts` holds `toCanvas`, which maps a point through the same transform
`ScreenStage` applies as CSS. Both read one `Stage` object, and that shared
source is what lets the card stay welded to a row through a punch-in. Two
implementations of one transform drift, and the failure — a card sliding a few
pixels off its row mid-zoom — reads as sloppy animation rather than as the
arithmetic bug it is.

---

## One scale, and why there are no punch-ins

`FIT` is `1080/980`, and every beat uses it. This replaced a set of per-beat
punch-ins, and the reason is the single most useful thing in this file.

Every wide row sits at x=563 in a 980px frame — right of centre, because the nav
rail eats the left 146px. Centring that row on the canvas therefore carries the
whole frame left, and at any scale past ~1.1 the rail goes off the left edge and
the window title gets chopped mid-word: an audit still read `oud` where it
should have read `Book of Business — Agent Cloud`. That does not look like a
camera pushing in. It looks like a bug.

1080/980 is the largest scale that still shows all of it, and it happens to land
exactly full-bleed — no side margins, no rounded corner floating in frame, the
rail and the table headers intact. `check:jank` asserts the frame's edges stay
off canvas on every frame of every beat, camera included.

What it costs is legibility: an 11px table cell lands at 12px. That is what
`Readout` is for — the app carries the context, a large gold figure carries the
number. It is the right division of labour anyway, because nobody reads a
spreadsheet in a thirty-second video.

The same arithmetic is why the single camera pull-back happens _after_ the logo
morph rather than during the agency beat, where it started out: pulling back 11%
while a screen is still on shot drags its right edge 34px into frame.

---

## Layout constraints

- **Safe area.** Nothing meaningful in the top 12% or bottom 20% — the platforms
  paint their own UI there. This is why the captions are at the top and the
  readouts sit just under the screens: the first draft put both in the lower
  band, which left the top 40% of a 9:16 frame empty and pushed the readouts
  into the zone where TikTok draws its own caption and button rail. Text there
  is not cropped, it is _covered_, and only on the phone.
- **The square crop.** `LaunchSquare` is a 1080×1080 window onto the vertical
  master, and it **reframes once**. Through the seven product beats it has to
  hold the card, the readout at 1400 and the caption at 280; the endcard's band
  is 300px higher. No fixed window holds both, so it moves on the same handover
  the logo morph runs on. Change a Y coordinate in `LAYOUT` and check the crop
  before shipping.
- **Muted by default.** 85%+ of views have no sound. Every claim is on screen as
  text.
- **Captions must leave.** Each caption has an explicit `until`. Six captions
  that only fade _in_ end up stacked on top of each other by the climax — which
  survives every still you happen to check and then ruins the render.

---

## Look

Palette, radii and type sizes in `timeline.ts`. Two things to know:

**There were three golds and now there is one family.** The brief specified
`#C9A227`. The product's own dark-mode `--gold` is `#CBA35A`, and every screen
inside the frame renders itself from that token. The brand mark — the asset this
video ends on — is `#C09F40`, sampled from the file rather than guessed.
`#C9A227` was the outlier of the three, more saturated and yellower than either
thing actually on screen, which showed up as the endcard tile reading a
different colour from the bursts that led into it. So `C.accent` is the mark's
own gold and `C.accentLt` is the product's `--gold-bright`, which makes a
`Readout` figure literally the same colour as the gold numbers in the
application behind it. Set `accent` back to `#C9A227` if the brief's value was
deliberate; it is a one-line change and nothing else moves. The bloom is built
from `accentLt` rather than `accent` regardless, because a saturated olive gold
spread thinly on near-black stops reading as light and starts reading as a brown
smear.

**The logo is the application's own asset,** `src/assets/agent-cloud-logo.jpg` —
the same file `BrandLogo` renders — inlined as a data URI by the same
`asset/inline` rule the fonts use. It is deliberately not a traced SVG: a redraw
is a second source of truth for the mark, and it is the one nobody remembers to
update the day the brand changes. It is drawn `object-fit: cover`, because the
card is still 1036x47 when the morph begins and only squares up at the end of
it — so most of the transition is a horizontal slice through the middle of the
mark, resolving into the whole logo. `contain` would letterbox it inside a wide
dark row and read as a bug.

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

Generate 4–6 candidates. What to look for: a hit around **4.5s** where the Post
Deal button is clicked, a bigger one at **18s** where the override row lands
under the advance, and a rhythm that opens out into the final third so the
agency roll-up and the endcard can ride it.

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
