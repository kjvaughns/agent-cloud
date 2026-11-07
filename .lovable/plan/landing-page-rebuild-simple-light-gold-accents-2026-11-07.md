# Landing page rebuild — simple, light, gold accents

Goal: match the calm editorial look of Licensing / Release Center, lead with independence and keeping 100% of comp, and cut the page from 10+ sections to 6.

## New page order

```text
Nav (slim, sticky, ink "Start now" pill)
1. Hero        headline + subhead + CTAs + proof stats | photo with gold glow + floating card
2. Four pillars Post & sync · Hierarchy & comp · Carrier book sync · Leaderboard & Trophy Case
3. Agency Suite Licensing · Bankdocs · Release Center · Academy (included with Agency)
4. Nova AI     one compact band, add-on
5. Pricing     Solo $199 · Agency $999 + "No $50k setup fee. No comp cut. Month-to-month."
6. FAQ + final CTA, footer
```

## Copy

- Eyebrow: THE OPERATING SYSTEM FOR LIFE INSURANCE
- Headline: "Run your agency. Own your book." with gold line "Keep 100% of your comp."
- Subhead: "Track production, automate contracting and manage your hierarchy — without a $50k upfront fee or a cut of your commissions."
- Buttons: "Start now" (ink pill) and "Book a demo" (outline)
- Proof stats: **$1.8M+ production tracked** · **1,000+ clients managed** · **0% comp taken**

## Visuals

- Hero photo: generated warm, light editorial image (producer at a desk, cream/gold tones), rounded corners, soft gold glow behind it, a small white floating card ("This week: $20,477 written").
- Pillar and suite cards: white cards, thin border, soft shadow, gold icons. No dark software mockups anywhere.
- One or two more small photos (e.g. agency team) in the Agency Suite band.

## Removed

- Dark dashboard picture in the hero, the four alternating dark mockup stories, the interactive deal journey, audience split, ownership band, and the big pricing comparison table (cards keep their feature lists).
- Announcement bar trimmed or removed.

## Check

- Screenshot at phone size (your 440px screen) and desktop; confirm buttons go to /signup?plan=… and /demo.

## Technical details

- Rewrite `hero.tsx` (split grid), new `pillars.tsx`, restyle `agency-suite.tsx`, slim `nova-section.tsx`, drop matrix from `pricing.tsx`; update `src/routes/index.tsx` composition and head description with new copy/stats.
- Delete unused `product-stories.tsx`, `deal-journey.tsx`, `screens.tsx`, `story.tsx` if nothing else imports them.
- Images generated into `src/assets/`, imported as modules; tokens only (no hardcoded colors).
- Save stats/headline to memory.
