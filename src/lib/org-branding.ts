import { supabase } from "@/integrations/supabase/client";

/**
 * The agency's logo.
 *
 * This replaces an upload that had never once succeeded. The old code wrote to
 * the `agent-documents` bucket at `org-logos/<org id>.<ext>`, and that bucket's
 * insert policy requires the first path segment to be the caller's *user* id —
 * so every upload was rejected by row-level security, the error was swallowed
 * by a bare `if (!uploadErr)`, and the page reported success anyway. The logo
 * you saw after choosing a file was a local `blob:` URL, which is why it looked
 * fine until the first reload.
 *
 * `org-branding` is private, like every other bucket here, because this
 * workspace refuses public ones. Reads therefore go through a signed URL with a
 * ten-year expiry — the same trade `academy-media` makes, and for a sharper
 * reason: `/api/public/branding` serves this logo to the sign-in page before
 * any session exists, so there is nobody to re-sign the URL on demand. It has
 * to still resolve years later or the branded login page breaks with no way to
 * notice.
 *
 * Writes are the part that is actually guarded. The first path segment is the
 * owning organisation and the storage policy asks `is_org_admin` about it, so
 * passing another agency's id does not upload into their folder — it fails.
 * **That segment is the whole authorisation check**, which is why
 * `scripts/agency-settings-check.ts` asserts the path shape: change how this is
 * built and the bucket quietly stops being guarded.
 */

const BUCKET = "org-branding";

/** Refused before the upload starts, with the reason in the message. */
export const LOGO_LIMIT = {
  bytes: 4 * 1024 * 1024,
  accept: "image/png,image/jpeg,image/webp,image/svg+xml",
  label: "4 MB",
} as const;

/**
 * Where a logo goes: `<org id>/logo-<random>-<name>`.
 *
 * The random segment matters. The old path was `org-logos/<org id>.<ext>` — one
 * fixed name per agency, overwritten in place — which means a stored URL keeps
 * pointing at a file whose contents changed underneath it, and every CDN and
 * browser between here and the user keeps serving the old picture. A new path
 * per upload makes a replacement a genuinely new URL.
 */
export function brandingPath(orgId: string, filename: string): string {
  const safe = filename
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-60) || "logo";
  const rand = Math.random().toString(36).slice(2, 10);
  return `${orgId}/logo-${rand}-${safe}`;
}

/** A ten-year signed URL — see the note above on why it cannot be short. */
export async function brandingUrl(path: string): Promise<string> {
  const TEN_YEARS = 60 * 60 * 24 * 365 * 10;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, TEN_YEARS);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Uploaded the logo but could not build a link to it.");
  }
  return data.signedUrl;
}

/**
 * Upload a logo and hand back the URL to store on the organisation.
 *
 * Throws on every failure. That is the entire point of this function existing:
 * the code it replaces treated a rejected upload as a no-op and still told the
 * user their settings were saved.
 */
export async function uploadOrgLogo(orgId: string, file: File): Promise<{ url: string; path: string }> {
  if (!orgId) throw new Error("No agency on your account, so there is nowhere to put a logo.");

  if (file.size > LOGO_LIMIT.bytes) {
    throw new Error(`That image is larger than ${LOGO_LIMIT.label}. Try a smaller one.`);
  }
  if (file.type && !LOGO_LIMIT.accept.split(",").includes(file.type)) {
    throw new Error("Logos must be a PNG, JPEG, WebP or SVG.");
  }

  const path = brandingPath(orgId, file.name);
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
    cacheControl: "31536000",
  });

  if (error) {
    // The bucket arrives with `20260807100000`. Until that is applied every
    // upload fails, and "Bucket not found" sends somebody looking for a
    // problem with their own file.
    if (/bucket/i.test(error.message) && /not found/i.test(error.message)) {
      throw new Error("Logo uploads are waiting on a workspace update. Your name and tagline still save.");
    }
    // The other failure worth naming. Row-level security answers a refused
    // upload with a generic message, and "new row violates row-level security
    // policy" is not a sentence anybody can act on.
    if (/row-level security|violates|unauthor/i.test(error.message)) {
      throw new Error("You don't have permission to change this agency's branding.");
    }
    throw new Error(error.message);
  }

  return { url: await brandingUrl(path), path };
}
