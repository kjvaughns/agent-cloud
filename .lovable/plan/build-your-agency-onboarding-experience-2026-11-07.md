# "Build your agency" onboarding experience

Replace today's quick signup form with a guided, animated builder where new owners create their agency first and see checkout only at the end.

## The flow (new page: /start, linked from every "Start now" button)

1. **Name your agency** — big single question. A live preview card beside it (stacked on phones) updates as they type: agency name, portal address, initials logo. Brand color swatches tint the preview instantly. Small reward line: "Looking sharp. Your address is reserved."
2. **Your team** — Solo or Agency choice (pre-picked from the pricing link), team size and monthly production goal sliders.
3. **Your carriers** — tap-to-select grid of common carriers (Mutual of Omaha, Americo, Aetna, GTL, Corebridge, Foresters, etc.). Selected ones appear on the preview card.
4. **Your documents (optional)** — drop a comp grid or contracting PDF. An animated scan plays, then shows "Saved — we'll set this up for you." Skippable.
5. **Agency Suite (Agency plan)** — Licensing, Bankdocs, Release Center and Academy switch on one by one with check animations; shows their real partner code.
6. **Save your agency** — name, email, password (or Google). Framed as "Save what you built," not a gate.
7. **The build screen** — full-screen gold sequence (~5 seconds): commission engine, hierarchy splits, Academy and partner portals, Nova. Ends with "Your agency is ready."
8. **The reveal + checkout** — blurred preview of their dashboard with their name, color and carriers, with a card on top: "[Agency] is ready to launch" and the plan price. Paying opens the existing secure checkout; on success a short celebration, then straight into the dashboard.

Progress is kept in the browser while they build, so a refresh doesn't lose their work. A slim progress bar and Back button on every step. Funnel tracking records each step so Admin → Analytics shows drop-off.

Existing /signup links redirect to /start. The current /setup wizard stays as a fallback for anyone who paid but skipped steps.

## Technical details
- New route `src/routes/start.tsx` with step components under `src/components/onboarding-builder/` (framer-motion if installed, else CSS transitions); state in a local reducer persisted to sessionStorage (read in useEffect).
- Account step: supabase signUp, then `initSoloWorkspace({ plan, agencyName })`, then a new server fn `applyBuilderSetup` saving brand color, carriers, team size/goal, uploaded document (existing documents storage), activating the suite, and marking onboarding complete so SetupRedirect doesn't bounce them.
- Email-confirmation projects: if signUp returns no session, show "confirm your email" and resume the build screen on return (state preserved).
- Checkout via existing `useBillingCheckout({ onPaid })`; `trackFunnel` per step.
- `/signup` redirects to `/start` preserving search; pricing/hero CTAs updated; head() metadata for /start; update AGENTS.md signup rule and `scripts/self-serve-check.ts`.
