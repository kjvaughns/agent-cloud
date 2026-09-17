# Multi-Domain Setup: Landing / Agent Portal / Admin Portal

## What you want

One project, three addresses, three experiences:

```text
useagentcloud.com        → marketing landing page (public)
app.useagentcloud.com    → the agent portal (sign-in, dashboard, everything agents use)
admin.useagentcloud.com  → a separate platform admin portal (only for you/your team)
```

Yes — all of this is handled inside Lovable. The only thing you do outside is add DNS records at your domain host, and even that is guided by Lovable's built-in domain connection flow.

## How it works

- **Multiple domains on one project**: supported. We connect `useagentcloud.com`, `www.useagentcloud.com`, `app.useagentcloud.com`, and `admin.useagentcloud.com` — each is just a DNS entry pointing at Lovable, added through Project Settings → Domains (I'll walk you through the cards).
- **Different experience per domain**: the app checks which address the visitor used and shows the right experience automatically. This is a small piece of code in the app, not a hosting feature.
- **One backend, one login system**: all three addresses share the same accounts and data. An agent who signs in on `app.useagentcloud.com` has the same account they have today.

## Steps

### 1. Domain connections (you confirm, Lovable sets up)
- Connect `app.useagentcloud.com` and `admin.useagentcloud.com` (root + www are already connected).
- Publish must be live for the new addresses to serve content.

### 2. Hostname-based experience routing (code)
- Add a small "which site am I on?" helper that reads the visitor's address (`landing` | `app` | `admin`).
- **useagentcloud.com**: serves only the landing page and public pages. Sign-in buttons point to `app.useagentcloud.com`. Signed-in users landing here are redirected to the app portal.
- **app.useagentcloud.com**: the full agent experience exactly as it exists today — auth, dashboard, pipeline, leaderboard, finances, settings, Nova. This is the default (preview URLs and agent-cloud.lovable.app keep working as the app too, so nothing breaks during rollout).
- **admin.useagentcloud.com**: serves only the new platform admin portal. Anyone who isn't a platform admin sees a sign-in screen and nothing else — agency pages are not reachable from this address.

### 3. Platform admin portal (new, on admin.useagentcloud.com only)
A separate, stripped-down portal for running Agent Cloud itself — visually distinct from the agency app so there's no confusion:
- **Platform admin access**: secured by a dedicated platform-level role checked server-side (not an agency role — agency owners do NOT get in).
- **First version includes**: agency list (all organizations, plan, status, member counts), user lookup (find any user, see their agency/role), and key platform stats (total agencies, agents, production volume).
- No agency data editing in v1 — read-only oversight plus the ability to sign in as support later if you want it.

### 4. Sign-in / signup links updated
- Landing page "Sign in" / "Get started" buttons send people to `app.useagentcloud.com`.
- Invite and email links keep working — they already point at full URLs; we'll confirm they use the app subdomain going forward.

## What doesn't change
- All existing agency features, data, and logins stay exactly as they are.
- The preview URL keeps working for development.
- Per-agency white-label custom domains keep working as they do today.

## Technical details
- Domains connected via Lovable's domain flow (A/TXT records guided in-chat); SSL is automatic.
- Routing: hostname detected once in the root route (`src/routes/__root.tsx`) + a tiny `src/lib/site-host.ts` helper; route guards redirect wrong-host visits (e.g. an agent URL opened on admin.* bounces to app.*).
- Platform admin: new `platform_admins` table (separate from agency roles, per security rules) + RLS-gated server functions; admin routes live under a pathless layout that only renders on the admin host.
- Admin portal v1 is read-heavy: agency/user listing via admin-scoped server functions; no changes to agency tables.

## Out of scope (say the word to add)
- Editing agencies/billing from the admin portal (v1 is oversight-only).
- Wildcard subdomains (every-agency-gets-name.useagentcloud.com) — not supported by the platform's domain system.
