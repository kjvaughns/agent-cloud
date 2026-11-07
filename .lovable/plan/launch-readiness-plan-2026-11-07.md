# Launch readiness plan

## 1. Remove the app subdomain
- Delete the `app.useagentcloud.com` host split (host config file, request redirect in the startup middleware, host-aware links in landing/agency-suite and branding hook).
- Everything (marketing + portal) runs on useagentcloud.com. Drop the AGENTS.md rule about the subdomain.

## 2. Remove White Label
- Remove pages: `/white-label`, `/settings/white-label`, the settings panel, sidebar/nav entries, and White Label mentions on pricing, billing, admin subscriptions, landing, and support knowledge.
- Remove the White Label plan from the pricing catalog and checkout options (product left archived in payments; no existing subscribers are changed).
- Remove custom-domain branding (domain lookup endpoint, domain-branding hook, login page domain theming, white-label email sender override).
- Keep: each agency's own logo and brand color from onboarding/Agency settings — that's normal agency branding, not White Label. The theme helper is renamed and kept for this.
- Database columns are left in place (unused) to avoid data loss.

## 3. Finish onboarding wiring
- Carriers picked during signup are added to the agency's carrier list.
- Agents entered on "Invite your team" receive real invites after the workspace is built.
- License/E&O documents uploaded during signup are copied into the agency's document library.

## 4. Checkout and email compliance
- Recurring-charge consent line above the Launch button ("authorize $199/$999 monthly until cancelled", Terms + Privacy links).
- Business mailing address in every email footer — I'll ask you for the real address (placeholder until then).

## 5. Fix failing checks
- External agency API stops returning sensitive fields (face amount) so the existing API key checks pass; rerun them.

## 6. Clean test data
- Delete the "Gold Test Agency" and "Mia Mobile" test accounts, workspaces, and onboarding rows.

## 7. Verify
- Browser-run both signup paths (agent + agency) on phone and desktop: color, logo, carriers, invites, documents appear; unpaid users are sent back to checkout; test card 4242 4242 4242 4242 completes payment.
- Confirm no "White Label" or "app." links remain anywhere visible.

## Technical notes
- Files removed: src/lib/hosts.ts, white-label.functions.ts, white-label-panel.tsx, white-label routes, api/public/branding.ts, use-domain-branding.ts.
- applyBuilderSetup gains carriers, invites, documentPaths inputs (validated, owner-only), reusing existing invite and document storage code.
- Update AGENTS.md and Allison knowledge.ts; memory core rule unchanged except white-label color note.
