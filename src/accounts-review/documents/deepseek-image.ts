import { createCanvas, loadImage } from "@napi-rs/canvas";
import type { Upload } from "./model.js";
function dimensions(bytes: Buffer, mime: string) {
  if (mime === "image/png" && bytes.length >= 24)
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  if (mime === "image/jpeg") {
    let i = 2;
    while (i + 4 < bytes.length) {
      if (bytes[i++] !== 255) continue;
      while (bytes[i] === 255) i++;
      const marker = bytes[i++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker >= 0xd0 && marker <= 0xd7) continue;
      const length = bytes.readUInt16BE(i);
      if (length < 2 || i + length > bytes.length) break;
      if (
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker) &&
        length >= 7
      )
        return [bytes.readUInt16BE(i + 5), bytes.readUInt16BE(i + 3)];
      i += length;
    }
  }
  throw Error("Image dimensions could not be verified.");
}
/** Preserve the original separately; only this bounded rendering reaches vision. */
export async function prepareDeepSeekImage(
  file: Upload,
): Promise<{ mime: "image/jpeg"; data: string }> {
  const bytes = Buffer.from(file.data, "base64");
  const [w, h] = dimensions(bytes, file.mime);
  if (!w || !h || w * h > 16_000_000 || Math.max(w, h) > 16000)
    throw Error("Image exceeds the supported16megapixel decoding limit.");
  const image = await loadImage(bytes);
  const scale = Math.min(1, 2000 / Math.max(image.width, image.height));
  const canvas = createCanvas(
    Math.max(1, Math.round(image.width * scale)),
    Math.max(1, Math.round(image.height * scale)),
  );
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const result = canvas.toBuffer("image/jpeg", 92);
  if (result.length > 2_000_000) throw Error("Prepared image exceeds2MB.");
  return { mime: "image/jpeg", data: result.toString("base64") };
}
