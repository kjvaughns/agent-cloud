# One combined Producer Profile page

## What changes
The Producer Profile's separate "Profile Information", "Contracting" and "Documents" tabs become one scrolling page. Background Questions and Integrations stay as their own tabs.

The page has these sections in order, each with its own Save button:

1. **Personal info**: legal name, phone, email, date of birth, gender and NPN.
2. **Home address**: street, city, state and ZIP.
3. **Identity**
   - SSN: shows only the last 4 once saved, with a "Replace" option. It stays encrypted, as it is now.
   - Driver's license: number, issuing state and expiration date, plus two upload boxes for the front and back photos, each with a preview.
4. **Licensing and contracting**: resident state, resident license number and the existing contracting details.
5. **E&O and AML**
   - Upload boxes for the E&O certificate and the AML certificate, showing the file and expiration once uploaded.
   - A "Get your AML in SureLC" button, plus the existing E&O and AML help links.
6. **Other documents**: the rest of the current Documents list.

A small checklist at the top shows what is still missing and jumps to that section.

## Technical details
- Rebuild `producer-profile.tsx` around the existing pieces: profile save, `saveMySsn`, and producer_documents uploads (license front and back use the same document types as the guided setup).
- License number, state and expiry use the existing `drivers_license_*` columns on profiles. No database change is needed.
- Old `?tab=contracting` and `?tab=documents` links open the combined page and scroll to the matching section.
- `getProducerFile`, which owners use, already reads these fields. Add the license number and state to the owner's Producer file view.
- SureLC link: https://surelc.surancebay.com (the button can be pointed at a specific agency SureLC link later).
