# Fix Google Maps on useagentcloud.com

## What's happening

Address autocomplete works in the Lovable preview but not on your live domain. The Google Maps key currently in use is the Lovable-managed one, which Google restricts to `*.lovable.app` and `*.lovableproject.com` addresses only. On `useagentcloud.com` Google rejects every request (`RefererNotAllowedMapError` / `REQUEST_DENIED`), so no suggestions ever appear.

That restriction list is set by Lovable and can't be edited. The fix is a Google Maps API key of your own, allowlisted for your domain.

## What you need to do in Google Cloud

1. Open Google Cloud Console and pick (or create) a project.
2. Enable billing on that project — Maps requires it even for free-tier usage.
3. Enable these APIs: **Maps JavaScript API** and **Places API (New)** (that's all the address autocomplete uses).
4. Create an API key.
5. Under the key's Application restrictions, choose **HTTP referrers** and add all four patterns:
   - `https://useagentcloud.com/*`
   - `https://*.useagentcloud.com/*`
   - `https://*.lovable.app/*`
   - `https://*.lovableproject.com/*`
   (the last two keep the Lovable preview working)
6. Under API restrictions, limit the key to the two APIs from step 3.

I'll walk you through any of these steps if you get stuck.

## What I'll do once you have the key

1. Open the Google Maps connector dialog so you can create a **custom** connection and paste in your own key. The existing managed connection can stay — the custom one takes over the browser key value.
2. Verify the key is picked up as `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY`.
3. Add a graceful failure path in `src/lib/google-maps.ts` and `src/components/address-autocomplete.tsx`: today a rejected key fails silently and the field just behaves like a plain text input with no explanation. I'll log the specific Google error and keep the plain-text fallback, so a future key problem is diagnosable instead of invisible.
4. Publish, then confirm on `useagentcloud.com` that suggestions appear in the two places autocomplete is used — the producer profile address field and the pipeline client detail drawer.

## Technical notes

- Only the browser key matters here; the app makes no server-side Maps/gateway calls, so nothing else needs changing.
- No layout, data, or routing changes — the only code touched is the Maps loader and the autocomplete component's error handling.
