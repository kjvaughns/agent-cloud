# Agent Cloud — Full Wiring Audit Plan

Working through 12 audit sections in order. Each is scoped and independent enough to verify as I go.

## 1. AI Gateway consolidation
- Create `src/lib/ai-assistant.functions.ts` with `askAiAssistant` server fn (auth-protected, Zod-validated, Lovable gateway, `google/gemini-3-flash-preview`, handles 429/402).
- Rewire `src/routes/_authenticated/ai-assistant.tsx` `send()` to call it via `useServerFn`; keep conversation history in state, render typing dots, surface errors inline as an assistant bubble.
- Grep for `anthropic` / `api.anthropic.com` / `ANTHROPIC_API_KEY` and migrate any hits to the Lovable gateway pattern.
- Audit `src/routes/_authenticated/resources/state-licenses.tsx` — if it calls Anthropic for PDF scan, move to a server fn with base64 body.

## 2. Google sign-in wiring
- `login.tsx` + `signup.tsx`: swap raw `supabase.auth.signInWithOAuth({provider:"google"})` for `lovable.auth.signInWithOAuth("google", { redirect_uri })` from `@/integrations/lovable`. Run `supabase--configure_social_auth` for `google` to make sure provider is enabled.
- In `src/routes/__root.tsx` `onAuthStateChange`: on `SIGNED_IN` with provider=google, upsert `profiles.google_oauth_connected = true`. Keep filter to identity events only (no thrash on token refresh).
- Producer Profile → Integrations: read `google_oauth_connected` and render Connected ✓ vs Connect.

## 3. SureLC stub
- `src/lib/onboarding.functions.ts` (~L213): replace `example.com` stub with `{ ok: true, sso_url: null, pending: true, message: "..." }`.
- `src/routes/invite.$token.tsx`: branch on `pending` and render a friendly success card with Dashboard CTA instead of opening the URL.

## 4. Agent Academy
- `src/routes/_authenticated/resources/agent-academy.tsx`: remove both `toast.info("Course viewer coming soon")`. Open `course.url || course.video_url` in new tab when present; otherwise render a "Coming Soon" badge. Add empty state when no courses.

## 5. Book of Business banner
- `src/routes/_authenticated/book-of-business.tsx`: remove the carrier-feed banner entirely.

## 6. Phone page copy
- `src/routes/_authenticated/phone.tsx`: MMS tooltip → "Attach photo"; provisioning paragraph → "Contact your admin to set up a dedicated phone number for your account." Remove "coming soon" strings.

## 7. Realtime cleanup audit
- Verify cleanup in: `calendar.tsx`, `phone.tsx`, `pipeline.tsx`, `notifications.tsx`. Add `supabase.removeChannel(channel)` in `useEffect` return where missing.

## 8. .env.example
- Create `.env.example` at project root listing SUPABASE_*, VITE_SUPABASE_*, LOVABLE_API_KEY, VITE_GOOGLE_MAPS_API_KEY, AGENTSYNC_API_KEY.
- Confirm `LOVABLE_API_KEY` exists via `fetch_secrets`; if missing, run `ai_gateway--create`. Make AI server fns degrade to a clear "AI features unavailable" error instead of crashing.

## 9. Deprecate legacy drawer
- `src/components/client-detail-drawer.tsx`: add `// DEPRECATED` header comment, drop `MOCK_POLICIES` import, set `policies: any[] = []`. Grep for active imports and redirect them to `src/components/pipeline/client-detail-drawer.tsx`.

## 10. Auth callback route
- Verify `src/routes/auth.callback.tsx`. If missing, create it with the spec'd component (redirect to `/dashboard` on signed-in session, `/login` otherwise). Do NOT hand-edit `routeTree.gen.ts` — Vite plugin regenerates it.

## 11. Global error boundary
- In `src/routes/__root.tsx`, set `defaultErrorComponent` / wrap `<Outlet/>` with the spec'd `GlobalErrorFallback` (icon, message, Back to Dashboard button) so unhandled errors don't white-screen.

## 12. Global Suspense
- In `src/router.tsx`, wrap `<RouterProvider/>` in `<Suspense fallback={<Skeleton/>}>` so route transitions don't flash blank.

## Verification
After each section, spot-check the file. At the end: run a grep sweep for `anthropic`, `coming soon`, `example.com/surelc`, `MOCK_POLICIES`, and confirm the final checklist in the brief.

## Notes / assumptions
- I'll keep all existing business logic intact and only touch the files named above (plus any transitively required by import).
- If a referenced file/line doesn't match (e.g., a "coming soon" string was already removed), I'll skip silently rather than invent work.
- I will NOT run builds manually — the harness handles that.
