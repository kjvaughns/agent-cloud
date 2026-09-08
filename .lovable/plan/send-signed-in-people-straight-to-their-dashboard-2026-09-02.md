# Send signed-in people straight to their dashboard

Today anyone typing useagentcloud.com lands on the marketing page, even if they are already signed in on that browser. The fix is a session-aware home page: if the browser already holds a valid session, the site sends them to `/dashboard` instead of showing the landing page.

## Behavior

- Signed out (and search-engine crawlers): landing page exactly as today. No change to SEO, SSR, or metadata.
- Signed in: the moment the page loads in the browser, it redirects to `/dashboard` (history replace, so Back doesn't bounce them into a redirect loop).
- Escape hatch: `useagentcloud.com/?stay=1` always shows the landing page, so a signed-in owner can still review pricing or share the marketing site.
- No flash of marketing content for signed-in users: while the session check runs (a few hundred ms at most), the home route renders a minimal branded loading screen rather than the full landing page. If no session is found, the landing page renders normally.

Note: this is per-browser. It uses the session already stored in that browser — it does not log anyone in who hasn't signed in before, and it doesn't change how long sessions last.

## Technical notes

- `src/routes/index.tsx` stays SSR-rendered and public — no `beforeLoad` auth gate (SSR can't read the localStorage session, which would cause redirect loops).
- Add a small client-only check in the home component: read `supabase.auth.getSession()` in an effect; on a session, `navigate({ to: "/dashboard", replace: true })`. Fall back to `refreshSession()` once, matching the existing tolerance in `src/lib/require-session.ts`.
- Gate the check on `search.stay !== "1"` via `validateSearch` on the route.
- Render state: `checking` → lightweight centered spinner; `anonymous` → existing landing tree unchanged. Server render always emits the landing tree so crawlers and the initial HTML are unaffected.
