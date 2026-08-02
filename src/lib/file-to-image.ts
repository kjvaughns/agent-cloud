/**
 * Compatibility wrappers over `document-extract.ts`.
 *
 * These two functions were the whole of this module. Their callers — the comp
 * grid uploader and the NIPR scanner — want exactly what they always wanted: a
 * single page image, or the raw text of a file. `document-extract` does more,
 * and Import needs the more; these keep the existing behaviour byte-for-byte
 * rather than making every caller opt into it.
 *
 * New code should call `extractDocument` directly.
 */

import { extractDocument } from "./document-extract";

/**
 * The first page of a PDF, or an image as-is, as a data URI.
 *
 * Still one page on purpose. `saveGrid` replaces every row it holds for a
 * carrier, so handing it a partial extraction is how products disappear — the
 * grid path gets multi-page support together with the merge mode that makes it
 * safe, not before.
 */
export async function fileToImageDataUrl(file: File): Promise<string> {
  const doc = await extractDocument(file, { maxPages: 1, prefer: "image" });
  const url = doc.images[0];
  if (!url) throw new Error("Upload a PDF or an image.");
  return url;
}

/** Plain text for CSVs and text files. */
export async function fileToText(file: File): Promise<string> {
  return file.text();
}
