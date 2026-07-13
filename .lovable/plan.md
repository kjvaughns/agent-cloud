## Font swap: match insuracloud.ai

InsuraCloud uses **Inter** across the board — the "big look" is just Inter at weight 800/900 with tight letter-spacing (no separate display font, no Bebas Neue). Agent Cloud currently uses Bebas Neue for every heading and the sidebar wordmark, which is what you don't like.

### Changes

1. **`src/routes/__root.tsx`** — update the Google Fonts `<link>` to load only Inter (drop Bebas Neue), keep the full weight range 300–900.

2. **`src/styles.css`**
   - `--font-heading`: change from `"Bebas Neue"` to `"Inter"` (same stack as `--font-sans`).
   - Base `h1` rule: swap the Bebas-tuned `letter-spacing: 0.02em` for a tighter modern-sans treatment — `font-weight: 800; letter-spacing: -0.02em; line-height: 1.05;` — so headings read like insuracloud's bold Inter.

3. **`src/components/app-sidebar.tsx`** — the sidebar header currently forces `font-heading` (Bebas) on the "Agent Cloud" / agency-name wordmark and on the small "by Agent Cloud" tagline. Keep the classes as-is; because `--font-heading` now points at Inter, the wordmark automatically becomes bold Inter. No component logic changes.

4. **Landing page `src/routes/index.tsx`** — any inline `font-family: 'Bebas Neue'` styles on the hero headline get replaced with the Inter treatment (weight 800, tight tracking) so the marketing page matches insuracloud's hero.

5. **Sweep** — grep for remaining `Bebas Neue` / `font-heading` overrides in email templates (`src/lib/email-templates/*`) and any route that hardcodes the family. Email templates keep Inter (already web-safe fallback) so branded emails match the app.

### Out of scope

- Body font stays Inter (already correct).
- No color, layout, or logo changes.
- Gold brand tokens untouched.

### QA

- Sidebar wordmark reads as bold Inter, not Bebas.
- Dashboard / Pipeline / Finances page titles render in heavy Inter with tight tracking.
- Landing hero (`/`) matches the visual weight of insuracloud's "Your Entire Insurance Business."
- No 404s on font requests (Bebas Neue reference fully removed from the Google Fonts URL).
