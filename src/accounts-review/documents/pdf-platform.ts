// Server-only, statically traced native renderer. Never imported by the client.
import { DOMMatrix, ImageData, Path2D, createCanvas } from "@napi-rs/canvas";
const scope = globalThis as unknown as Record<string, unknown>;
scope.DOMMatrix ??= DOMMatrix;
scope.ImageData ??= ImageData;
scope.Path2D ??= Path2D;

export class ReviewCanvasFactory {
  create(width: number, height: number) {
    if (!(width > 0 && height > 0 && width <= 10000 && height <= 10000))
      throw Error("Invalid PDF render dimensions.");
    const canvas = createCanvas(width, height);
    return { canvas, context: canvas.getContext("2d") };
  }
  reset(
    surface: ReturnType<ReviewCanvasFactory["create"]>,
    width: number,
    height: number,
  ) {
    if (!(width > 0 && height > 0 && width <= 10000 && height <= 10000))
      throw Error("Invalid PDF render dimensions.");
    surface.canvas.width = width;
    surface.canvas.height = height;
  }
  destroy(surface: ReturnType<ReviewCanvasFactory["create"]>) {
    surface.canvas.width = 0;
    surface.canvas.height = 0;
  }
}
