# Fix Google Maps on useagentcloud.com

## What's happening

Two separate problems:

1. **Wrong key.** The app currently loads Maps with the Lovable-managed browser key, which Google restricts to `*.lovable.app` and `*.lovableproject.com`. On `useagentcloud.com` every request is rejected (`RefererNotAllowedMapError` / `REQUEST_DENIED`), so no address suggestions appear. That restriction list isn't editable.
2. **Your key isn't reachable from the browser.** Your own key is saved as the secret `GOOGLE_MAPS_API_AC`. Secrets like that are server-only — browser code can't read them, so the autocomplete component can't use it as-is. Only `VITE_`-prefixed values reach the browser, and that one isn't.

## The fix

Serve your key to the browser through a tiny public endpoint, then load Maps with it.

1. Add `src/routes/api/public/maps-key.ts` — a GET handler that reads `process.env.GOOGLE_MAPS_API_AC` and returns `{ key }` (plus the existing tracking/channel ID if present). This is safe: a referrer-restricted browser key is designed to be public, and Google's referrer allowlist is what protects it.
2. Update `src/lib/google-maps.ts` so `ensureMaps()` fetches that endpoint once, caches the result, and injects the Maps script with your key. Keep the existing `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY` as a fallback so the Lovable preview keeps working if the endpoint ever returns nothing.
3. Surface failures instead of swallowing them: today a rejected key fails silently and the address field quietly degrades to a plain text input. Log the specific Google/endpoint error in `google-maps.ts` and `src/components/address-autocomplete.tsx` while keeping the plain-text fallback, so a future key problem is diagnosable.
4. Publish, then verify on `useagentcloud.com` that suggestions appear in both places autocomplete is used — the producer profile address field and the pipeline client detail drawer.

## One thing to confirm on your key

In Google Cloud, the key behind `GOOGLE_MAPS_API_AC` needs:

- Application restrictions = HTTP referrers, including `https://useagentcloud.com/*` **and** `https://*.useagentcloud.com/*` (root and subdomains are separate patterns), plus `https://*.lovable.app/*` if you want the preview to use it too.
- API restrictions including **Maps JavaScript API** and **Places API (New)** — those are the only two this app uses.

If either is missing, autocomplete will still fail; the improved logging in step 3 will say exactly which.

## Technical notes

- Only the browser key path changes. The app makes no server-side Maps or gateway calls, so nothing else is touched.
- No layout, data, or routing changes beyond the one new public endpoint.
- The managed connector secrets stay in place, unused as the primary key.
