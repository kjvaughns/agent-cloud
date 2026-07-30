/**
 * Turn an uploaded file into something a vision model can read.
 *
 * Images pass through as a data URI. PDFs are rasterized in the browser using
 * the PDF.js build that ships with pdfjs-dist, so no server-side rendering or
 * external conversion service is needed — and the file never leaves the page
 * except as the image we choose to send.
 *
 * Only the first page is rendered. A commission grid is almost always one
 * page, and sending a whole statement would blow the token budget for no gain.
 */

const MAX_EDGE = 2000; // Enough to read grid digits, small enough to send.

export async function fileToImageDataUrl(file: File): Promise<string> {
  if (file.type.startsWith("image/")) return readAsDataUrl(file);
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return pdfFirstPageToDataUrl(file);
  }
  throw new Error("Upload a PDF or an image.");
}

/** Plain text for CSVs and text files, used by document intake. */
export async function fileToText(file: File): Promise<string> {
  return file.text();
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Couldn't read that file"));
    r.readAsDataURL(file);
  });
}

async function pdfFirstPageToDataUrl(file: File): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist");

  // The worker is bundled rather than fetched from a CDN — the app's CSP does
  // not allow external script origins.
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const page = await doc.getPage(1);

  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(MAX_EDGE / Math.max(base.width, base.height), 3);
  const viewport = page.getViewport({ scale: Math.max(1, scale) });

  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't render that PDF");

  // White background: a transparent canvas renders black text on black once
  // flattened to JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: ctx, viewport, canvas }).promise;

  return canvas.toDataURL("image/jpeg", 0.85);
}
