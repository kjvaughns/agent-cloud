# Full brand realignment: light by default, everywhere

Goal: Agent Cloud opens in the same warm cream / white / ink / gold look as Licensing, Release Center, Academy and Bankdocs. Dark mode stays available as an opt-in in Appearance settings.

## What changes for users
- Landing page, Tools, Signup, Login, Demo, legal pages: cream background, white cards, ink text, gold accents, ink pill buttons.
- Signed-in app (dashboard, pipeline, book of business, leaderboard, settings, setup wizard): light by default.
- Anyone who previously chose dark in Appearance keeps dark. Everyone else (never chose) gets light.
- The product screenshots inside the landing page's "deal journey" panel switch to light so the page reads as one brand.

## Steps
1. **Default theme flip** — the startup script that picks the theme defaults to light; only a stored "dark" turns dark on. Remove the forced dark class on the page root.
2. **Remove forced dark wrappers** on landing, login, demo, legal pages, deal-journey panel and the signed-in loading screen.
3. **Token pass** — tune the light palette in the stylesheet to match the sister sites exactly (cream canvas, white surfaces with soft shadow, ink text, gold primary, ink pill). Check sidebar, top bar, charts, badges, dialogs, drawers and sheets read well in light.
4. **Hardcoded colors sweep** — replace leftover fixed colors (e.g. on the public join page and agent template pages, dialog overlays) with theme colors; keep green/red/amber status colors and the blue cold-lead badge.
5. **Appearance setting** — the theme toggle offers Light (default) / Dark; champagne/bronze accents keep working in both.
6. **White-label agencies** — confirm their custom brand color still applies in light.
7. **Emails** already use the brand palette; no change.
8. **Visual check** — screenshot landing, tools, signup, login, demo, dashboard, pipeline, leaderboard, settings and setup wizard in light and dark, desktop and phone, and fix contrast issues.

## Technical details
- `src/routes/__root.tsx`: THEME_INIT → `if(t==="dark") add("dark")`; drop `className="dark"` on `<html>`; catch branch does nothing.
- Remove `dark` class from: `src/routes/index.tsx`, `login.tsx`, `demo.tsx`, `src/components/legal-page.tsx`, `src/components/landing/deal-journey.tsx`.
- `src/styles.css` `:root` tokens adjusted against the sister projects' values; `.dark` block untouched.
- `appearance-controls.tsx` / `top-bar.tsx` theme toggle writes `agentcloud-theme` = light|dark.
- Record the "light default, dark opt-in" rule in memory (brand).
