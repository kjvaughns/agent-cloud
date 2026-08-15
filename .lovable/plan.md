# Pipeline client screen fixes

Seven fixes to the pipeline client drawer.

## 1. Address autocomplete

Confirmed cause from the browser console: Google is rejecting the request —
`API_KEY_HTTP_REFERRER_BLOCKED ... Requests from referer https://<preview>.lovableproject.com/ are blocked`.
The key itself works; its referrer allowlist doesn't include the preview domain, so nothing the
UI does can fix it client-side.

Fix: stop calling Google from the browser. Add a server-side proxy (`/api/public/places`, caller
verified as a signed-in user) that forwards autocomplete and place-details requests using the key
server-side, where referrer restrictions don't apply. `AddressAutocomplete` calls the proxy instead
of the Maps JS SDK, so it works on preview, published, and the custom domains alike.

## 2. Remove hot / warm / cold

Remove the temperature picker from the Contact tab, the temperature pill from the client cards on
the pipeline board, and the temperature column from the CSV importer copy. The database column and
enum stay in place (other reports read it) — it just disappears from the pipeline UI.

## 3. Date of birth: auto-format + age

Replace the `<input type="date">` DOB field with a text field that formats digits to `MM/DD/YYYY`
as they're typed, and shows the calculated age as a badge next to it (e.g. `Age 47`). Stored value
stays a real date. Age also shows on the read-only view of the field.

## 4. Phone auto-format

Apply the existing phone formatter as the agent types on every phone field in the drawer that
doesn't already have it: client phone, beneficiary phone, referral phone.

## 5. Social Security billing draft date

Under Bank Info, Draft Date becomes two choices:
- Day of month (1–28) — today's behaviour
- Social Security schedule — 2nd, 3rd, or 4th Wednesday

Requires two new columns on the banking record (`draft_schedule`, `draft_wednesday`) and the draft
summary line updated to read e.g. "Draft 3rd Wednesday (SS)".

## 6. Pipeline opens on Contact

Clicking a client opens the drawer on the Contact tab instead of Timeline.

## 7. Policy Information products

The product dropdown uses a hard-coded global list. Switch it to the agency's configured carriers
and each carrier's configured product types — the same source the post-deal flow already uses
(`listCarriersForDeal` + `productsForCarrier`), so selecting a carrier narrows products to what
that carrier is set up to write. Applies to both the add-policy form and the policy edit row.

## Technical notes

- New file: `src/routes/api/public/places.ts` (autocomplete + details proxy, auth-checked, input validated).
- `src/components/address-autocomplete.tsx` rewritten against the proxy; `src/lib/google-maps.ts`
  keeps only the address-component parser.
- Migration: `alter table public.client_banking add column draft_schedule text, add column draft_wednesday smallint` with a
  check constraint (2–4), plus the Zod schema in `src/lib/pipeline.functions.ts`.
- Drawer edits in `src/components/pipeline/client-detail-drawer.tsx`; board edits in
  `src/routes/_authenticated/pipeline.tsx`.
