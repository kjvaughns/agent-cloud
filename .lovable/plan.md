# Address Autocomplete Across the App

## Goal
When a user types into any street-address field, suggest real addresses from Google Places and, on selection, auto-fill street / city / state / ZIP.

## Where it applies
Every place a street address is entered today:
1. **Producer Profile → Home Address card** (`src/routes/_authenticated/account/producer-profile.tsx`) — currently uses an old, partial autocomplete bound to a hard-coded `VITE_GOOGLE_MAPS_API_KEY` that is empty in this project, so it doesn't work. Will be replaced.
2. **Pipeline → Add Client dialog** (`src/routes/_authenticated/pipeline.tsx`, "Street address" input around line 335).
3. **Client Detail Drawer → Address section** (`src/components/pipeline/client-detail-drawer.tsx`, the `EditableField` for `street_address`) — when the field is opened for editing, it will use autocomplete and also auto-fill the sibling city / state / ZIP fields.
4. **Agent Invite onboarding form** (`src/routes/invite.$token.tsx`, "Street address" input).

No other address inputs exist in the codebase (verified with a project-wide search for `street_address` and address-labeled inputs).

## How it will work (for a non-technical reader)
- We'll connect Lovable's built-in Google Maps integration so the app gets a working maps key automatically — no manual key management.
- We'll build one shared "Address" input component and drop it into the four places above. Behavior:
  - User types → live suggestions appear underneath.
  - User picks one → the street field fills with the street line, and the related city / state / ZIP fields fill in automatically.
  - If Maps isn't available for any reason, the field still works as a plain text input (graceful fallback).
- Restricted to US addresses by default (matches the rest of the app: state dropdowns, ZIP, NPN).

## Technical details

### 1. Connector
- Use the **Lovable Google Maps Platform connector** (managed key, no user setup). Linking it provisions `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY` and `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID`.
- Remove the dead `VITE_GOOGLE_MAPS_API_KEY` reference from `.env` / `.env.example` and from `__root.tsx`.

### 2. Maps JS loader
- Replace the current `<script>` tag in `src/routes/__root.tsx` with an async loader that uses the connector's browser key and `loading=async&callback=...&channel=...` per the Lovable Google Maps guidance.
- Expose a tiny `ensureMaps()` helper in `src/lib/google-maps.ts` that returns a promise resolving once `google.maps` + the `places` library are ready (uses `importLibrary('places')`). This avoids each component racing the script.

### 3. Shared component: `AddressAutocomplete`
New file: `src/components/address-autocomplete.tsx`.

- Props:
  - `value: string`
  - `onChange(value: string)` — fires on every keystroke (so form state stays in sync).
  - `onSelect(parts: { street, city, state, zip, country })` — fires when a suggestion is chosen.
  - passthrough `placeholder`, `id`, `className`, `disabled`, `ref`.
- Implementation:
  - Uses **Places API (New)** via `google.maps.importLibrary('places')` → `AutocompleteSuggestion.fetchAutocompleteSuggestions` with a session token, debounced ~200ms, `includedRegionCodes: ['us']`, `includedPrimaryTypes: ['street_address','premise','subpremise','route']`.
  - Renders a simple shadcn-styled popover list under the existing `<Input>` (matches current design system; no new colors).
  - On select, resolves the place's `addressComponents` and maps them to `{ street: "<number> <route>", city: locality, state: administrative_area_level_1 (short), zip: postal_code, country }`.
  - If `ensureMaps()` rejects (no key, blocked, offline), the component silently behaves as a normal input.
- **Does NOT** use the legacy `google.maps.places.Autocomplete` class (per Lovable guidance to use Places API New).

### 4. Wiring into the four call sites
- **Producer Profile AddressCard**: replace the `streetRef` + legacy Autocomplete `useEffect` with `<AddressAutocomplete>` for street; `onSelect` updates `street`, `city`, `state`, `zip` local state and calls `onSave({ street_address, city, state, zip_code })`.
- **Pipeline Add Client**: replace the street `<Input>`; `onSelect` updates the `form` state for street/city/state/zip in one go.
- **Client Detail Drawer EditableField**: when the field name is `street_address`, render `AddressAutocomplete` in the edit popover. `onSelect` triggers an `updateClient` mutation patching all four address fields together (rather than only `street_address`).
- **Invite token form**: same swap as Pipeline, updates the `form` setter for the four fields.

### 5. Cleanup
- Delete the unused `VITE_GOOGLE_MAPS_API_KEY` entries (`.env`, `.env.example`).
- Update the audit checklist note in `.lovable/plan.md` if it references the old key.

## Out of scope
- No new map widgets, no geocoding on the server side, no changes to data schemas or RLS — `street_address`, `city`, `state`, `zip_code` columns already exist on `profiles` and `clients`.
- No address validation API; we only fill what the user picks.

## Approval / setup needed
Before building, I'll need you to approve linking the **Google Maps Platform** connector (one click — managed key, no billing setup on your end). After that I'll implement everything above in one pass.
