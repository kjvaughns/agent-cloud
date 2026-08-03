# Fix Google Maps on useagentcloud.com

## What's happening

Address autocomplete works in the Lovable preview but not on your live domain. The key currently in use is the Lovable-managed Google Maps key, which Google restricts to `*.lovable.app` and `*.lovableproject.com` only. On `useagentcloud.com` every request is rejected (`RefererNotAllowedMapError` / `REQUEST_DENIED`), so no suggestions appear. That restriction list isn't editable — the fix is your own key, which you already have.

## Steps

1. Open the Google Maps connector dialog and create a **custom** (non-managed) connection so you can paste in your own key. It lives alongside the managed connection and supplies the browser key the app reads.
2. Confirm the key lands as `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY`.
3. Double-check the key's referrer allowlist covers all four patterns so both the live site and the Lovable preview work:
   - `https://useagentcloud.com/*`
   - `https://*.useagentcloud.com/*`
   - `https://*.lovable.app/*`
   - `https://*.lovableproject.com/*`
   and that API restrictions include **Maps JavaScript API** and **Places API (New)**.
4. Improve failure visibility in `src/lib/google-maps.ts` and `src/components/address-autocomplete.tsx`: today a rejected key fails silently and the field quietly degrades to a plain text input. Log the specific Google error while keeping the plain-text fallback, so a future key problem is diagnosable instead of invisible.
5. Publish, then verify on `useagentcloud.com` that suggestions appear in both places autocomplete is used — the producer profile address field and the pipeline client detail drawer.

## Technical notes

- Only the browser key matters; the app makes no server-side Maps or gateway calls, so nothing else changes.
- No layout, data, or routing changes — the only code touched is the Maps loader and the autocomplete component's error handling.
