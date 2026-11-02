import { readFileSync } from "node:fs";
import { jsPDF } from "jspdf";
import { describe, expect, it } from "vitest";
import { prepareDeepSeekPdf } from "./deepseek-pdf";
import { createChatExtractor, digestOf } from "./providers";
import { sampleDocuments } from "./samples";

const upload = (pdf: jsPDF) => ({
  name: "synthetic.pdf",
  mime: "application/pdf",
  data: Buffer.from(pdf.output("arraybuffer")).toString("base64"),
});
function imagePdf(pages = 1) {
  const pdf = new jsPDF();
  const image = readFileSync("tests/fixtures/document-entry/19.jpg").toString(
    "base64",
  );
  for (let n = 0; n < pages; n++) {
    if (n) pdf.addPage();
    pdf.addImage(image, "JPEG", 10, 10, 180, 240);
  }
  return pdf;
}
describe("DeepSeek local PDF input preparation", () => {
  it("reuses selectable text without rendering or an external OCR service", async () => {
    const pdf = new jsPDF();
    pdf.text(
      "Synthetic Supplier Invoice No SYN-NEW-991 Total AED 42.00",
      10,
      20,
    );
    const result = await prepareDeepSeekPdf(upload(pdf));
    expect(result.text).toContain("SYN-NEW-991");
    expect(result.pages).toBe(1);
    expect(result.images).toHaveLength(0);
  });
  it("renders a scanned PDF locally and bounds the image dimensions", async () => {
    const result = await prepareDeepSeekPdf(upload(imagePdf()));
    expect(result.images).toHaveLength(1);
    expect(result.images[0].mime).toBe("image/jpeg");
    expect(Buffer.from(result.images[0].data, "base64").subarray(0, 2)).toEqual(
      Buffer.from([0xff, 0xd8]),
    );
    expect(result.images[0].data.length).toBeLessThan(2_800_000);
  });
  it("includes every page when selectable and scanned content are mixed", async () => {
    const pdf = imagePdf();
    pdf.addPage();
    pdf.text(
      "Synthetic invoice second page tax and total without private information",
      10,
      20,
    );
    const result = await prepareDeepSeekPdf(upload(pdf));
    expect(result.pages).toBe(2);
    expect(result.images).toHaveLength(2);
    expect(result.text).toContain("second page");
  });
  it("does not mistake a selectable scan footer for complete invoice text", async () => {
    const pdf = imagePdf();
    pdf.text(
      "Synthetic scanned bill archive footer with enough selectable characters",
      10,
      280,
    );
    const result = await prepareDeepSeekPdf(upload(pdf));
    expect(result.text).toContain("archive footer");
    expect(result.images).toHaveLength(1);
  });
  it("rejects invalid, oversized and overlong PDFs instead of submitting partial pages", async () => {
    await expect(
      prepareDeepSeekPdf({
        name: "bad.pdf",
        mime: "application/pdf",
        data: Buffer.from("not PDF").toString("base64"),
      }),
    ).rejects.toThrow(/valid PDF/);
    const pdf = new jsPDF();
    for (let n = 0; n < 5; n++) pdf.addPage();
    await expect(prepareDeepSeekPdf(upload(pdf))).rejects.toThrow(/five pages/);
  });
  it("sends selected PDF text in the existing DeepSeek adapter and rejects fabricated IDs", async () => {
    const pdf = new jsPDF();
    pdf.text(
      "Synthetic supplier invoice number UNSEEN-55 total AED 95.00",
      10,
      20,
    );
    const file = upload(pdf);
    let calls = 0;
    const transport: typeof fetch = async (_url, init) => {
      calls++;
      const sent = JSON.parse(String(init?.body));
      expect(sent.model).toBe("deepseek-flash");
      expect(sent.thinking.type).toBe("disabled");
      expect(sent.messages[1].content[0].text).toContain("UNSEEN-55");
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                fields: { ...sampleDocuments[0].fields, projectId: "made-up" },
                uncertain: [],
              }),
            },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 100 },
      });
    };
    const extractor = createChatExtractor(
      "deepseek",
      "unit-test-only",
      {
        reference: "mock",
        allowedDigests: new Set([digestOf(file)]),
        maxRequests: 1,
      },
      undefined,
      transport,
      { preparePdf: prepareDeepSeekPdf },
    );
    await expect(extractor.extract(file)).rejects.toThrow(/unverified entity/);
    expect(calls).toBe(1);
  });
});
