## Root cause

`src/routes/_authenticated.tsx` checks the Supabase session inside the **component render** with `useEffect` + `useState`, and when the user is logged out it calls `throw redirect({ to: "/login" })` during render.

TanStack Router only treats `redirect()` as a navigation when it's thrown from `beforeLoad` or `loader`. Throws during render bubble up to the nearest `errorComponent` — which is the root's `ErrorComponent` showing **"This page didn't load"** with Try again / Go home. The browser console confirms this: the logged error object is `{ options: { to: "/login", statusCode: 307 } }` rendered by `ErrorComponent` in `__root.tsx`.

Result: every `/_authenticated/*` route (dashboard, pipeline, calendar, phone, contracting, etc.) shows the generic error page instead of redirecting unauthenticated users to `/login`.

## Fix

### 1. `src/routes/_authenticated.tsx` — gate in `beforeLoad`, not in render

Move the session check out of the component and into an async `beforeLoad`. This is the canonical TanStack pattern and makes `redirect()` work correctly.

```tsx
export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href },
      });
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  // No more status state, no more throw-in-render.
  // Just render the sidebar + topbar + <Outlet />.
}
```

This guarantees the redirect fires before any child renders — no flash, no error boundary.

### 2. `src/routes/__root.tsx` — make `ErrorComponent` re-throw redirects

Defensive safety net: if any future code throws a `redirect()` from render, surface it as navigation instead of an error page.

```tsx
import { isRedirect } from "@tanstack/react-router";

function ErrorComponent({ error, reset }) {
  if (isRedirect(error)) throw error; // let the router handle it
  // ...existing UI
}
```

## Files to change

- `src/routes/_authenticated.tsx` — replace render-time auth check with `beforeLoad` async gate that calls `supabase.auth.getSession()`.
- `src/routes/__root.tsx` — add `isRedirect` re-throw at the top of `ErrorComponent`.

## Verification

After the fix:
- Logged-out user visiting `/dashboard` → instantly bounced to `/login` (no error page).
- Logged-in user visiting `/dashboard` → sidebar + dashboard render normally.
- All other `/_authenticated/*` pages (pipeline, calendar, phone, finances, contracting…) load.
