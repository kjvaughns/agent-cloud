# Send signed-in agents to app.useagentcloud.com

## Goal
useagentcloud.com (and www) stays the public landing page. Everything you do once signed in happens on app.useagentcloud.com.

## Important things to know first
- **app.useagentcloud.com isn't live yet.** It's connected but still waiting on its DNS records. Until those are added at your domain provider, sending people there would break sign-in. The change below only switches on when that address is live.
- **Sign-ins don't carry across addresses.** A browser keeps a login per address, so a login on useagentcloud.com doesn't count on app.useagentcloud.com. That's why sign-in itself should happen on the app address, not get forwarded afterward.

## What changes
1. **Sign in / Sign up buttons on the landing page** take people to app.useagentcloud.com/auth.
2. **Any portal page opened on useagentcloud.com or www** (dashboard, pipeline, etc., or the sign-in page) forwards to the same page on app.useagentcloud.com, links and search included, so old bookmarks and email links keep working.
3. **After signing in, resetting a password, finishing a Google sign-in, or opening an invite**, people end up on app.useagentcloud.com/dashboard.
4. **On app.useagentcloud.com**, the bare address goes straight to the dashboard (or to sign-in if logged out). The landing page isn't shown there.
5. **Preview and the agent-cloud.lovable.app address keep working as they do now**, so testing isn't affected.
6. Password reset, invite, and announcement emails link to app.useagentcloud.com.
7. Google sign-in gets app.useagentcloud.com added as an allowed return address.

## Technical details
- One shared helper, `src/lib/hosts.ts`: `APP_ORIGIN = "https://app.useagentcloud.com"`, plus `isMarketingHost(host)` (apex/www) and `isAppHost(host)`. A single `APP_SUBDOMAIN_ENABLED` flag, turned on once DNS shows Active.
- Forwarding runs in the server request middleware (src/start.ts): on a marketing host, any path besides public marketing pages (/, /pricing, /support, legal, /api/public/*) gets a 302 to APP_ORIGIN + path + search. Running it on the server avoids a flash of the wrong page.
- src/routes/index.tsx: on the app host, redirect to /dashboard. On the marketing host, drop the `?stay=1` signed-in redirect, since no session exists there.
- Auth links (src/routes/auth.callback.tsx, reset-password, the email redirectTo/emailRedirectTo values, invite links) build from APP_ORIGIN when the flag is on, and from window.location.origin otherwise.
- Agency-branding lookup by hostname keeps working; app.useagentcloud.com resolves the default AgentCloud branding.
- Test: unit tests for host classification and forwarding paths. Then check with Playwright using Host header overrides.
