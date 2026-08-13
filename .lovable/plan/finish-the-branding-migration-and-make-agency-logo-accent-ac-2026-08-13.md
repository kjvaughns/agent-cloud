# Finish the branding migration and make agency logo + accent actually stick

## What I checked

- Every migration in `supabase/migrations/` is already live except one: `20260807100000_org-branding-bucket.sql`. The `org-branding` storage bucket does not exist and `may_write_org_branding` is not defined. Everything else on the old PENDING list (producer notes, sample flags, demo org, carrier aliases, Nova usage, self-activation gate, contracting PII column) is confirmed present in the live database.
- Because the bucket is missing, choosing a logo on `/settings/agency` and saving reports "Saved, but the logo did not upload — logo uploads are waiting on a workspace update." Name, tagline and accent colour do save.
- Accent colour is wired correctly (`WhiteLabelTheme` applies it for every plan), but the save does not refresh it: `useOrganization` is plain `useState`/`useEffect`, while the save invalidates the React Query key `["organization"]`, which nothing subscribes to. So after saving, the new logo and colour only appear after a page reload.

## What I'll do

1. **Apply the remaining migration.** Create the `org-branding` bucket as private (this workspace refuses public buckets, and `src/lib/org-branding.ts` already reads through a long-lived signed URL for exactly that reason), add `may_write_org_branding`, and add the four storage policies: read for any signed-in user, write/update/delete only when the first path segment is an organisation the caller administers.

2. **Make branding refresh without a reload.** Move `useOrganization` onto React Query under the `["organization"]` key it is already being invalidated with, keeping the same return shape (`{ org, loading }`) and the existing auth-state re-fetch. Saving then immediately updates the sidebar logo, name and accent.

3. **Verify end to end.** Confirm the bucket and policies exist, then drive the settings page in a browser: pick a logo, save, and check the upload lands under `<org id>/logo-…`, the stored `logo_url` resolves, the sidebar shows it, and a changed accent colour re-tints the UI immediately.

## Notes

- The path shape `<org id>/logo-<random>-<name>` is the authorisation check, so it stays exactly as `brandingPath` builds it; `scripts/agency-settings-check.ts` asserts it.
- `supabase/migrations/PENDING.md` is write-protected for me, so its list stays stale; `scripts/migration-safety.ts` gets the applied migration added to its verified list so the check keeps reporting zero pending.
