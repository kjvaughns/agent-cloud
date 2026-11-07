# Hard paywall and plan-based access

## What's wrong today

The paywall check is broken. It asks the database for a field that doesn't exist on people's profiles, so the check fails quietly. The app then decides the person "has no workspace yet" and gives full access. That's why Kendrick Financial (agency) and Legacy Financial (solo) are fully inside with no subscription and not marked free. The "send them back to checkout" redirect never fires for the same reason.

Other gaps found:
- Three signed-in accounts belong to no agency at all, and they also get full access.
- Agency-only pages are hidden from the sidebar for solo accounts, but they still open if someone types the address.
- A solo owner can still create agent invites, and nothing suggests upgrading.
- The lock happens only in the browser. Most saves aren't checked again on the server.

## Access rules after this change

```text
Who                                   What they get
------------------------------------  -----------------------------------------------
Platform admin (Kaeden)               Everything
Free agencies (Vantage, APEX,         Everything (unchanged)
  Symmetry; admin can toggle)
Paid and current                      Everything their plan includes
Card failed, card provider retrying   Everything, with a "update your card" banner
  (~14 days)
Paid before, now ended (canceled or   View-only: can browse and export, can't change
  retries ran out)                      anything. Owner sees "Renew"; agents see
                                        "Ask your agency owner to renew"
Never paid, owner                     Fully locked: sent to the checkout screen to finish
Never paid, agent in that agency      Fully locked: "Your agency isn't active yet"
                                        screen, plus a sign-out button
Signed in, no agency                  Sent to /start to build one
```

Solo plan vs Agency plan:
- Solo keeps every personal tool: pipeline, book of business, contracting, commissions, calendar, resources and Nova (bought separately).
- Agency-only areas: inviting agents, Team, Leaderboard, Announcements, Challenges, Contracting Ops, Levels and roles, Sub-agencies.
- Solo owners still see "Invite an agent." It opens an upgrade page that shows what the Agency plan adds and has an "Upgrade to Agency – $999/mo" button. Opening any other agency-only page directly shows the same upgrade page, not the real page.
- Upgrading starts Agency checkout. When payment goes through, the workspace switches to Agency and the solo subscription ends (you aren't charged for both).

## What Kendrick and Legacy will see

Both are your test accounts. Neither has paid and neither is marked free, so after this change both land on the checkout screen. That lets you test the paywall with real accounts.

## Steps

1. Fix the access check so it finds the person's agency and treats only real admin roles as admins.
2. Add the "paid before" vs "never paid" distinction. Only Solo and Agency subscriptions count; Nova-only purchases don't. A failed first payment counts as never paid.
3. Add a full-screen lock to the signed-in app:
   - Owners who never paid go to checkout.
   - Agents in an agency that never paid get a locked screen.
   - People with no agency go to /start.
   - Billing, checkout, sign-out and support stay reachable.
4. Keep the existing view-only mode for lapsed accounts. It now kicks in only after the card provider stops retrying.
5. Add a plan gate for agency-only pages and an upgrade page, wired to "Invite an agent" and the other agency-only areas.
6. Server-side checks: invite creation rejects solo workspaces. Main server-side saves (invites, contracting submissions, imports, carrier sync, setup) reject locked or view-only workspaces.
7. Agency upgrade from solo: checkout for Agency, and on success switch plan type and cancel the solo subscription at once with a prorated credit.
8. Tests for each rule in the table above, then a browser run signed in as the Kendrick and Legacy accounts to confirm both hit the paywall.

## Technical notes

- Root cause: `getAccessFor` selects `profiles.is_platform_admin`, which doesn't exist, so `profile` is null, then `hasWorkspace=false`, then `{mode:'full', reason:'no_workspace'}`. Admin detection moves to `user_roles` (`super_admin`, `admin`).
- `computeAccess` gains `mode: 'full' | 'read_only' | 'locked'` plus `reason: 'never_paid' | 'lapsed' | 'no_workspace' | ...`. `everPaid` = a plan-kind row (`solo`/`agency`) whose status was ever `active`/`trialing`/`past_due`/`unpaid`/`canceled`. `incomplete*` doesn't count. Past-due access is unchanged (`subscriptionHasAccess`).
- New `AccessGate` in `_authenticated.tsx` renders the lock instead of `<Outlet/>`. It replaces `PaywallRedirect`, and allowed paths stay in one list.
- `PlanGate` component plus `requiresAgency` flag on navigation entries. The same flag drives the sidebar and the direct-URL guard.
- Known limitation: some saves go straight from the browser to the database. Blocking those at the database level would need test vs live payment awareness in database rules, which preview and live share. Left as a follow-up; for now the UI lock and server-function checks cover normal use.
- Update the billing-access memory: hard paywall for never-paid, view-only only for lapsed accounts after retries end.
