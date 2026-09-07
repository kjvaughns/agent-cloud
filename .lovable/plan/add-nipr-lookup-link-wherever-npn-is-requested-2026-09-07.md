# Add NIPR lookup link wherever NPN is requested

Add the NIPR lookup URL `https://nipr.com/licensing-center/look-up-a-national-producer-number` next to every field that asks a user for their National Producer Number (NPN), so they can look it up without leaving the flow.

## Scope — NPN input fields only

1. **Producer profile** (`/account/producer-profile`) — NPN Number input above Verify/Sync.
2. **Contracting request form** (`/contracting`) — NPN * input in the new-request form.
3. **Invite acceptance** (`/invite/:token`) — NPN input on the account-creation screen.
4. **Recruiting funnel apply** (`/join/:slug`) — NPN Number (optional) input.
5. **License sync** (`/contracting-ops/licensing` → `MyLicenses` component) — both the default NPN input and the preview-phase NPN field.

Display-only NPN fields (read-only request packets, hierarchy cards, tables, search placeholders) are out of scope.

## Implementation

- Create a tiny reusable component `NpnLookupLink` in `src/components/npn-lookup-link.tsx` that renders:
  - External-link icon (`ExternalLink` from `lucide-react`)
  - Text: "Look up your NPN"
  - Href: `https://nipr.com/licensing-center/look-up-a-national-producer-number`
  - `target="_blank"` and `rel="noreferrer"`
- Use the existing muted-foreground helper text style so it matches the invite page's current "Your National Producer Number..." copy.
- Replace or augment the existing generic "Open NIPR.com" link in `MyLicenses` with the same specific lookup URL.
- In each of the five locations, place the link directly under the NPN input as a one-line helper.

## Files to change

- `src/components/npn-lookup-link.tsx` (new)
- `src/routes/_authenticated/account/producer-profile.tsx`
- `src/routes/_authenticated/contracting/index.tsx`
- `src/routes/invite.$token.tsx`
- `src/routes/join.$slug.tsx`
- `src/components/licensing/my-licenses.tsx`

## Verification

- Typecheck passes.
- Each listed screen still renders its NPN input and the new helper link opens the correct NIPR URL in a new tab.
