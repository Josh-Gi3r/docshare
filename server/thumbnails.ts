import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, readFile, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { createCanvas } from "@napi-rs/canvas";
import { storagePut } from "./storage";

const execFileAsync = promisify(execFile);
const LO_TIMEOUT_MS = 10 * 60 * 1000;

// Per-page render timeout — if a single page hangs, bail out
const PAGE_RENDER_TIMEOUT_MS = 45_000;

// Scale factor: 1.5 → ~1440×810 for a 16:9 slide.
// Lower than 2.0 but still high quality, and uses ~44% less memory per page.
const RENDER_SCALE = 1.5;

export interface PageThumbnail {
  pageNumber: number;
  thumbnailUrl: string;
  thumbnailKey: string;
}

/**
 * Render a single PDF page with a hard timeout.
 * Returns null if the page fails (so we can skip it rather than abort the whole job).
 */
async function renderPage(
  pdf: any,
  pageNum: number,
  documentId: number
): Promise<PageThumbnail | null> {
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale: RENDER_SCALE });
  const width = Math.round(viewport.width);
  const height = Math.round(viewport.height);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const renderPromise = page.render({ canvasContext: ctx as any, viewport }).promise;
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Page ${pageNum} render timed out`)), PAGE_RENDER_TIMEOUT_MS)
  );

  await Promise.race([renderPromise, timeoutPromise]);

  const imgBuffer = canvas.toBuffer("image/png");

  // Release page resources immediately to free memory
  page.cleanup();

  const key = `thumbnails/doc-${documentId}/page-${pageNum}.png`;
  const { url } = await storagePut(key, imgBuffer, "image/png");
  return { pageNumber: pageNum, thumbnailUrl: url, thumbnailKey: key };
}

/**
 * Generate thumbnails for a PDF buffer using pdfjs-dist + @napi-rs/canvas.
 * Pure Node.js — no system binaries required. Works in any container.
 */
export async function generatePdfThumbnails(
  pdfBuffer: Buffer,
  documentId: number
): Promise<PageThumbnail[]> {
  // Dynamic import — pdfjs-dist is ESM-only in v4+
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs" as string);
  const getDocument = (pdfjsLib as any).getDocument ?? (pdfjsLib as any).default?.getDocument;

  const pdf = await getDocument({
    data: new Uint8Array(pdfBuffer),
    // Disable font rendering to reduce memory usage
    disableFontFace: true,
    // Use minimal worker config
    isEvalSupported: false,
  }).promise;

  const pageCount: number = pdf.numPages;

  if (!pageCount || pageCount === 0) {
    throw new Error("PDF has no pages");
  }

  const thumbnails: PageThumbnail[] = [];

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    try {
      const thumb = await renderPage(pdf, pageNum, documentId);
      if (thumb) {
        thumbnails.push(thumb);
      }
    } catch (err) {
      console.error(`[Thumbnails] Page ${pageNum} failed, skipping:`, err);
      // Continue with remaining pages rather than aborting the whole job
    }
  }

  // Destroy the PDF document to free memory
  try { pdf.destroy(); } catch {}

  if (thumbnails.length === 0) {
    throw new Error("All pages failed to render");
  }

  return thumbnails;
}

/**
 * Generate thumbnails for a PPTX file.
 * Converts to PDF via LibreOffice headless, then processes with pdfjs-dist.
 */
export async function generatePptxThumbnails(
  pptxBuffer: Buffer,
  documentId: number
): Promise<PageThumbnail[]> {
  const tmpDir = await mkdtemp(join(tmpdir(), `docshare-pptx-${documentId}-`));
  try {
    const pptxPath = join(tmpDir, "input.pptx");
    await writeFile(pptxPath, pptxBuffer);

    await execFileAsync(
      "libreoffice",
      ["--headless", "--convert-to", "pdf", "--outdir", tmpDir, pptxPath],
      { timeout: LO_TIMEOUT_MS }
    );

    const pdfPath = join(tmpDir, "input.pdf");
    const pdfBuffer = await readFile(pdfPath);
    return generatePdfThumbnails(pdfBuffer, documentId);
  } finally {
    try { await rm(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

/**
 * Dispatch thumbnail generation based on file type.
 */
export async function generateThumbnails(
  fileBuffer: Buffer,
  fileType: "pdf" | "pptx",
  documentId: number
): Promise<PageThumbnail[]> {
  if (fileType === "pdf") {
    return generatePdfThumbnails(fileBuffer, documentId);
  }
  return generatePptxThumbnails(fileBuffer, documentId);
}
