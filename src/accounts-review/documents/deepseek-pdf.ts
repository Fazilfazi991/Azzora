// Server-only PDF preparation. Originals stay in AZZORA; no external OCR service.
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { Canvas } from "@napi-rs/canvas";
import { readPdfText } from "./local-pdf.js";
import type { Upload } from "./model.js";
import type { PreparedPdfInput } from "./providers.js";

const MAX_PAGES = 5;
const MAX_EDGE = 1300;
const MAX_OUTPUT_BYTES = 6_000_000;
const MAX_TEXT = 40_000;

export async function prepareDeepSeekPdf(
  file: Upload,
): Promise<PreparedPdfInput> {
  if (file.mime !== "application/pdf") throw Error("PDF input is required.");
  const bytes = Buffer.from(file.data, "base64");
  if (
    bytes.byteLength > 2_000_000 ||
    bytes.subarray(0, 5).toString() !== "%PDF-"
  )
    throw Error("Choose a valid PDF under 2 MB.");
  // Reuse the existing selectable-text extraction; never truncate an overlong
  // document and present the first pages as the complete bill.
  const text = await readPdfText(file);
  if (text.pages < 1 || text.pages > MAX_PAGES || text.text.length > MAX_TEXT)
    throw Error("PDF exceeds five pages or the text limit; review manually.");
  const task = getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
    disableFontFace: true,
    maxImageSize: 16_000_000,
  });
  try {
    const pdf = await task.promise;
    let needsVision = false;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const visible = content.items
        .flatMap((item) => ("str" in item ? [item.str] : []))
        .join("")
        .replace(/\s/g, "");
      if (visible.length < 24) needsVision = true;
      // A scanned bill may have a selectable footer/header. Its existence does
      // not prove that the invoice lines are selectable; retain raster content.
      const operations = await page.getOperatorList();
      const imageOperations = new Set([
        OPS.paintImageXObject,
        OPS.paintInlineImageXObject,
        OPS.paintImageMaskXObject,
        OPS.paintImageXObjectRepeat,
        OPS.paintInlineImageXObjectGroup,
        OPS.paintImageMaskXObjectGroup,
      ]);
      if (operations.fnArray.some((op) => imageOperations.has(op)))
        needsVision = true;
    }
    if (!needsVision)
      return { text: text.text, pages: pdf.numPages, images: [] };
    const images: PreparedPdfInput["images"][number][] = [];
    let totalBytes = 0;
    const factory = pdf.canvasFactory as {
      create(
        width: number,
        height: number,
      ): { canvas: Canvas; context: CanvasRenderingContext2D };
      destroy(value: {
        canvas: Canvas;
        context: CanvasRenderingContext2D;
      }): void;
    };
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      if (
        !Number.isFinite(base.width) ||
        !Number.isFinite(base.height) ||
        base.width <= 0 ||
        base.height <= 0
      )
        throw Error("PDF page dimensions are invalid.");
      const viewport = page.getViewport({
        scale: Math.min(MAX_EDGE / base.width, MAX_EDGE / base.height),
      });
      const surface = factory.create(
        Math.ceil(viewport.width),
        Math.ceil(viewport.height),
      );
      try {
        await page.render({
          canvas: null,
          canvasContext: surface.context,
          viewport,
          background: "white",
        }).promise;
        const data = surface.canvas.toBuffer("image/jpeg", 85);
        totalBytes += data.byteLength;
        if (data.byteLength > 2_000_000 || totalBytes > MAX_OUTPUT_BYTES)
          throw Error(
            "Rendered PDF exceeds the image budget; review manually.",
          );
        images.push({ mime: "image/jpeg", data: data.toString("base64") });
      } finally {
        factory.destroy(surface);
        page.cleanup();
      }
    }
    return { text: text.text, pages: pdf.numPages, images };
  } finally {
    await task.destroy();
  }
}
