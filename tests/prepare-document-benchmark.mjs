// Offline PDF-to-image preparation. No OCR/AI service, keys or network calls.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
const manifest = JSON.parse(
  fs.readFileSync("tests/fixtures/document-entry/manifest.json", "utf8"),
);
const out = "tmp/document-entry-evidence/prepared";
fs.mkdirSync(out, { recursive: true });
const digest = (p) =>
  crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const rows = [];
for (const doc of manifest) {
  if (digest(doc.path) !== doc.sha256)
    throw Error(
      "Synthetic corpus digest changed; refusing to prepare unknown input.",
    );
  if (!doc.path.endsWith(".pdf")) {
    rows.push({ id: doc.id, sourceSha256: doc.sha256, pages: [] });
    continue;
  }
  const dir = path.join(out, doc.id);
  fs.mkdirSync(dir, { recursive: true });
  const result = spawnSync(
    process.env.PDFTOPPM_BIN || "pdftoppm",
    [
      "-jpeg",
      "-jpegopt",
      "quality=85",
      "-scale-to",
      "1300",
      doc.path,
      path.join(dir, "page"),
    ],
    { encoding: "utf8", timeout: 30000 },
  );
  if (result.status !== 0)
    throw Error(
      `Local PDF rendering failed for ${doc.id}. Check PDFTOPPM_BIN; no provider was called.`,
    );
  const pages = fs
    .readdirSync(dir)
    .filter((n) => /^page-\d+\.jpg$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
    .map((name) => {
      const file = path.join(dir, name);
      return { path: file, sha256: digest(file), mime: "image/jpeg" };
    });
  if (pages.length < 1 || pages.length > 5)
    throw Error("Synthetic PDF exceeds the five-page evaluation limit.");
  rows.push({ id: doc.id, sourceSha256: doc.sha256, pages });
}
fs.writeFileSync(
  path.join(out, "inventory.json"),
  JSON.stringify(rows, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    documents: rows.length,
    pdfs: rows.filter((d) => d.pages.length).length,
    pdfPages: rows.reduce((s, d) => s + d.pages.length, 0),
    externalCalls: 0,
    ocrServiceUsed: false,
  }),
);
