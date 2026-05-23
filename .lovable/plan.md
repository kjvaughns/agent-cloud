# Performance Plan — Agent Cloud

Goal: cut perceived page-load time on every authenticated route. Frontend / wiring only — no business-logic or schema changes.

## 1. Stop wasting SSR on the authenticated shell

The `_authenticated` layout can't render meaningfully on the server (session lives in `localStorage`, `beforeLoad` early-returns server-side). SSR currently builds the whole sidebar + topbar + page, then the client discards it.

- Add `ssr: false` to `src/routes/_authenticated.tsx`.
- Remove the per-route `ssr: false` workarounds on `team.tsx` (and any others added during earlier SSR debugging) once the parent opts out.
- Public routes (`/login`, `/invite/$token`, marketing) keep SSR.

## 2. Enable router preloading + give Query control of freshness

In `src/router.tsx` / `getRouter()`:
- `defaultPreload: "intent"` so hovering a sidebar link starts fetching the next route's JS + data.
- `defaultPreloadStaleTime: 0` so TanStack Query owns caching (it's already the data layer).
- Bump `QueryClient` defaults: `staleTime: 30_000`, `gcTime: 5 * 60_000`, `refetchOnWindowFocus: false`.

## 3. Convert hot routes to loader-prefetch pattern

For Dashboard, Pipeline, Book of Business, Analytics, Team, Calendar:
- Wrap each server fn in a `queryOptions(...)` factory.
- Route `loader` calls `context.queryClient.ensureQueryData(...)` (fire-and-forget for non-critical, awaited for the primary query).
- Component switches from `useQuery` + `isLoading` skeleton to `useSuspenseQuery`, with a route-level `pendingComponent`.
- Result: navigation paints with data already in cache, no skeleton flash.

## 4. Code-split heavy dependencies

- Lazy-load `recharts` charts via `React.lazy` + `Suspense` inside the chart components on Dashboard / Analytics / Finances. Charts are below-the-fold and shouldn't block first paint.
- Replace `date-fns` namespace usage with per-function imports (`import { format } from "date-fns/format"`) where applicable, so tree-shaking actually drops unused locales/utilities.
- Audit `phone.tsx` (1313 lines), `calendar.tsx` (874), `team.tsx` (672), `analytics.tsx` (665): extract heavy subcomponents (e.g. the call panel, the calendar grid, the analytics chart block) into separately-imported modules so the route's critical chunk shrinks.

## 5. Trim Dashboard default range

Default range is `"all"` which sends `2000-01-01` as `rangeStart`. Change initial state to `"30d"` (or `"90d"`) so the first server fn call is bounded. "All Time" remains selectable.

## 6. Stylesheet / font polish

- Add `<link rel="preload" as="style">` for `styles.css` and the Google Fonts URL in `__root.tsx` `head().links` so they start earlier.
- Add `&display=swap` is already present — good. Consider self-hosting Inter via `@fontsource-variable/inter` to remove the cross-origin font request entirely (one less render-blocker).

## Out of scope

- No backend / SQL / RLS changes.
- No visual redesign (the earlier `/skill:redesign` request is separate).
- No new features.

## Verification

- Re-run `browser--performance_profile` on `/dashboard` and one heavy route (e.g. `/analytics`) before/after; expect FCP and DOMContentLoaded to drop materially (target FCP < 1.5s on warm cache).
- Check the network panel: hovering a sidebar link should trigger the next route's chunk + server fn before the click.
- Confirm no console warnings about Suspense boundaries or missing QueryClient.

## Technical notes

- Files touched (expected): `src/router.tsx`, `src/routes/__root.tsx`, `src/routes/_authenticated.tsx`, `src/routes/_authenticated/{dashboard,pipeline,book-of-business,analytics,team,calendar,finances,phone}.tsx`, the corresponding `src/lib/*.functions.ts` (add `queryOptions` helpers — no handler logic changes).
- `useSuspenseQuery` requires the route to have an `errorComponent` (already present) and a `pendingComponent` — add minimal skeletons where missing.
- Keep `requireSupabaseAuth` middleware on every protected server fn; preload-on-intent still includes the auth header via `attachSupabaseAuth`.
