import { supabase } from "@/integrations/supabase/client";

/**
 * Uploading course artwork and video.
 *
 * The bucket is `academy-media` and it is public to read, which is the one
 * decision here worth defending. Every other bucket in this schema is private
 * and served through signed URLs, because every other bucket holds identity
 * documents, banking details or client PII. This one holds training video and
 * course thumbnails, and a signed URL that expires mid-lesson stops playback
 * part-way through — a failure the reader cannot recover from and cannot
 * explain. The path carries a random id, so a file is not reachable without
 * being handed the link.
 *
 * Writes are what is actually guarded. The first path segment is the owning
 * organisation, and the storage policy asks `can_manage_resources` about it —
 * the same function the rest of the resources editor asks. Passing another
 * agency's id here does not upload to their folder, it fails.
 */

const BUCKET = "academy-media";

/** Uploads that are refused before they start, with the reason in the message. */
export const MEDIA_LIMITS = {
  image: { bytes: 8 * 1024 * 1024, accept: "image/png,image/jpeg,image/webp,image/gif", label: "8 MB" },
  video: { bytes: 512 * 1024 * 1024, accept: "video/mp4,video/webm,video/quicktime", label: "512 MB" },
  document: { bytes: 32 * 1024 * 1024, accept: "application/pdf", label: "32 MB" },
} as const;

export type MediaKind = keyof typeof MEDIA_LIMITS;

/**
 * Where a file goes.
 *
 * `orgId` null means a platform default, which lives under `platform/` and is
 * super-admin only — the same split as `academy_courses.organization_id`.
 *
 * The original filename is kept as a trailing hint because "what did I upload"
 * is a real question when you are looking at a list of thumbnails, but it is
 * stripped down to characters that survive a URL. The random segment in front
 * of it is what makes the path unguessable and what stops two people uploading
 * `intro.mp4` from overwriting each other.
 */
export function mediaPath(orgId: string | null, kind: MediaKind, filename: string): string {
  const folder = orgId ?? "platform";
  const safe = filename
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-60) || "file";
  const rand = Math.random().toString(36).slice(2, 10);
  return `${folder}/${kind}/${rand}-${safe}`;
}

export function publicUrl(path: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Upload, and hand back the URL to store on the course or lesson.
 *
 * `upsert: false` on purpose. The path already contains a random segment, so a
 * collision means something is wrong rather than something needs replacing, and
 * overwriting silently would take out a file another lesson is pointing at.
 */
export async function uploadMedia(
  orgId: string | null, kind: MediaKind, file: File,
): Promise<{ url: string; path: string }> {
  const limit = MEDIA_LIMITS[kind];
  if (file.size > limit.bytes) {
    throw new Error(`That file is larger than ${limit.label}. Host it elsewhere and paste the link instead.`);
  }

  const path = mediaPath(orgId, kind, file.name);
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
    cacheControl: "31536000",
  });

  if (error) {
    // The bucket arrives with `20260803020000`. Until that is applied the
    // upload fails with a bucket-not-found, and "Bucket not found" sends
    // somebody to look for a bug in their own file.
    if (/bucket/i.test(error.message) && /not found/i.test(error.message)) {
      throw new Error("File uploads are waiting on a workspace update. Paste a link for now.");
    }
    throw new Error(error.message);
  }

  return { url: publicUrl(path), path };
}

/**
 * Everything the editor needs to talk about a link somebody pasted.
 *
 * Vimeo, Loom, YouTube and Drive all have a page URL people copy and an embed
 * URL that works in an iframe, and they are never the same string. Pasting the
 * page URL into an iframe gives a blank box with no error, which is the single
 * most common way a video lesson ends up broken.
 */
export type VideoSource =
  | { kind: "file"; url: string }
  | { kind: "embed"; url: string; provider: string }
  | { kind: "link"; url: string; provider: string };

export function readVideoUrl(raw: string | null | undefined): VideoSource | null {
  const url = (raw ?? "").trim();
  if (!url) return null;

  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/i);
  if (yt) return { kind: "embed", url: `https://www.youtube.com/embed/${yt[1]}`, provider: "YouTube" };

  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (vimeo) return { kind: "embed", url: `https://player.vimeo.com/video/${vimeo[1]}`, provider: "Vimeo" };

  const loom = url.match(/loom\.com\/(?:share|embed)\/([\w-]+)/i);
  if (loom) return { kind: "embed", url: `https://www.loom.com/embed/${loom[1]}`, provider: "Loom" };

  const drive = url.match(/drive\.google\.com\/file\/d\/([\w-]+)/i);
  if (drive) return { kind: "embed", url: `https://drive.google.com/file/d/${drive[1]}/preview`, provider: "Google Drive" };

  const wistia = url.match(/(?:wistia\.com|wi\.st)\/(?:medias|embed)\/([\w-]+)/i);
  if (wistia) return { kind: "embed", url: `https://fast.wistia.net/embed/iframe/${wistia[1]}`, provider: "Wistia" };

  if (/\.(mp4|webm|ogg|mov|m4v)(\?|$)/i.test(url)) return { kind: "file", url };

  // Anything else opens in a new tab rather than being forced into an iframe.
  // A blank player is a worse answer than a link that works.
  let host = "";
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { /* not a URL */ }
  return { kind: "link", url, provider: host || "link" };
}
