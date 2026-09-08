# Landing page: audit and rebuild

## What I found on the live page

I loaded the page at phone width (440px) and desktop (1280px). It is in worse shape than it looks in code:

1. **Two identical buttons in the hero.** Both say "Book a demo". The primary button is supposed to say "Get started", but it falls back to the demo label whenever checkout isn't configured — and the secondary was never swapped, so the visitor sees the same action twice.
2. **The hero dashboard shows $0 everywhere.** Month-to-date ALP, today, week, team, active policies — all zero, with green "+23%" and "+$1,240" badges next to them. The numbers are supposed to count up on view; above the fold they never start. The single most important visual on the page currently reads as an empty account.
3. **Huge blank stretches.** Several sections render empty because the scroll-reveal never fires for them. On a phone the page is 18,300px tall — roughly 23 screens — with entire screens of pure black in the middle.
4. **The page scrolls sideways on a phone.** Content is 524px wide inside a 440px screen.
5. **The page is dark, and the code comments claim it's light.** Keeping dark per your answer, but the styling was written for a light page, which is why contrast and gold usage feel inconsistent.
6. **The pipeline demo contradicts the product.** It still shows hot/warm/cold lead tags, which we removed from Pipeline weeks ago. Three separate demos (pipeline, commissions, retention) split attention and none of them tells the story that sells.
7. **Copy drift.** Nav has 5 links but the page has 11 sections; the meta description and structured data describe "recruit to renewal / persistency / chargebacks", which is not how you describe the product.
8. **Motion code that no page uses** (floating orbs, parallax) still ships in the bundle.

Pricing itself is clean: $49 solo, $399 agency, $49 Nova, $39 sponsored, 20% profit share, and no seat/overage language anywhere. A guard script already fails the build if a price gets hard-coded. That stays.

## What the rebuilt page will be

Dark, warm charcoal, gold used sparingly. Space Grotesk headings / Hanken Grotesk body stay. Section order:

1. **Hero** — "Run your entire insurance business from one place." One primary action, "Book a demo" as a quiet text link beside it. Trust line: built inside a working life insurance agency. Hero visual is the Dashboard with real (rounded, non-identifying) production totals from your own book — no more $0.
2. **Proof strip** — your real numbers: production tracked, policies managed, agents on the platform. I'll pull rounded figures from your book and round down so nothing is overstated.
3. **The connected sale** — the interactive demo, described below. This replaces the three existing demos and becomes the centerpiece.
4. **What agents use every day** — four focused stories, each with a real product frame: Pipeline & posting a deal, Book of Business, Dashboard & Leaderboard, Team / Contracts / Invites, Finances.
5. **Solo vs Agency** — two columns, "unlimited agents, no seat charges" made visually loud.
6. **Nova AI** — four outcome groups (Retention Autopilot, Client Relationship Automation, Pipeline Autopilot, Daily Agent Intelligence), each line carrying Available or Coming soon exactly as it is today. Nothing gets promoted to "available" that doesn't run.
7. **Agency profit share** — 20% with the 150-agent example and its qualifications.
8. **Pricing** — three cards + the compact comparison table, all figures read from the pricing model.
9. **Philosophy, FAQ, final call to action, footer.**

## The interactive demo: one sale, six clicks

A single guided walkthrough on sample data, no account needed, six steps, each with one obvious button:

```text
Pipeline        prospect card -> Mark as sold
Post the deal   carrier, product, premium, effective date, policy number pre-filled -> Submit
Book of Business  policy appears with client, carrier, premium, dates
Leaderboard     agent moves up, production updates
Finances        writing commission + upline overrides calculated
Nova AI         welcome message, draft reminder, anniversary follow-up, retention watch created
Agency view     toggle to owner: team production, finances, leaderboard all reflect the sale
```

The point it makes: enter the deal once, everything updates. Back/replay controls, keyboard reachable, and it reads as a single column on a phone. The commission figures it shows use the same advance/override math as the real calculator, so the demo and the product never disagree.

## Mobile

Rebuilt for the phone first: target roughly a third of the current page height, no sideways scroll at 320px and up, one dominant action in view at all times, tap targets at 44px, product frames that stay legible instead of shrinking to unreadable.

## Technical notes

- Rewrite `src/routes/index.tsx` and the files in `src/components/landing/` (nav, hero, workflow, product stories, nova, pricing, support, screens, primitives). New `deal-journey.tsx` replaces `live-demos.tsx`.
- Fix the CTA fallback so the primary and secondary actions are never the same label.
- Replace the scroll-reveal wrapper with one that cannot leave content invisible, and drop unused parallax/orb code.
- Product frames stay coded mockups in the real design system — no screenshots to sanitize or go stale, no client data on a public page.
- Proof numbers come from a read-only query against your book, rounded down, and live in one constant so they're easy to refresh.
- Update page title, description and structured data to plain "life insurance CRM and agency management" language.
- Extend `scripts/landing-check.ts` with the new invariants (no duplicate CTA label, no zeroed hero metrics, no temperature tags, no invented claims) so these regressions can't come back.
- Login, signup, demo and app routes are untouched.

## Not functional, and labelled as such

Pipeline autopilot, and the Nova items already marked Coming soon, stay marked Coming soon. Profit share keeps its eligibility and payout qualifications. No carrier reconciliation or automatic payment claims. No testimonials or customer logos.
