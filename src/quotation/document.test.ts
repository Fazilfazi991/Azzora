import { describe, expect, it } from "vitest";
import { jsPDF } from "jspdf";
import fonts from "./fonts.json";
import { layoutQuotation, type Draw } from "./document";
import { referenceQuotation } from "./seed";
import { blankLine } from "./repository";
import { totals } from "./calculations";

type Text = Extract<Draw, { kind: "text" }>;
const measure = new jsPDF({ unit: "pt" });
for (const style of ["bold", "italic"] as const) {
  measure.addFileToVFS(`cera-${style}.ttf`, fonts[style].data);
  measure.addFont(`cera-${style}.ttf`, "Cera", style);
}
function bounds(command: Text) {
  const font =
    command.style !== "normal" &&
    [...command.text].every((c) =>
      fonts[command.style as "bold" | "italic"].characters.includes(c),
    )
      ? "Cera"
      : "helvetica";
  measure.setFont(font, command.style);
  measure.setFontSize(command.size);
  const width = measure.getTextWidth(command.text);
  const left =
    command.x -
    (command.align === "center"
      ? width / 2
      : command.align === "right"
        ? width
        : 0);
  return { left, right: left + width };
}
const textOf = (commands: Draw[]) =>
  commands.filter((c): c is Text => c.kind === "text");
function sample() {
  const q = referenceQuotation();
  q.sections = [
    {
      id: "s",
      number: "2",
      title: "Painting",
      rows: [
        {
          ...blankLine(),
          number: "2.1",
          description: "Prepare and paint walls",
          quantity: "40",
          unit: "m²",
          rate: "35",
        },
      ],
    },
  ];
  q.amountWordsOverride = "";
  q.terms = [];
  q.payments = [];
  return q;
}

describe("approved quotation alignment and pagination", () => {
  it("retains stationery geometry and immutable quotation content and figures", () => {
    const q = referenceQuotation();
    const before = JSON.stringify(q);
    const figures = totals(q);
    const pages = layoutQuotation(q);
    expect(pages).toHaveLength(7);
    for (const page of pages) {
      expect(
        page.commands.find(
          (c) => c.kind === "image" && c.src.endsWith("watermark.png"),
        ),
      ).toEqual({
        kind: "image",
        src: "/assets/quotation/watermark.png",
        x: 162.6,
        y: 195.84,
        width: 317.4,
        height: 411.6,
      });
      const logo = page.commands.find(
        (c) => c.kind === "image" && c.src.endsWith("logo.png"),
      );
      if (logo)
        expect(logo).toEqual({
          kind: "image",
          src: "/assets/quotation/logo.png",
          x: 81,
          y: 21.6,
          width: 153.84,
          height: 32.64,
        });
    }
    expect(JSON.stringify(q)).toBe(before);
    expect(totals(q)).toEqual(figures);
  });
  it("centers headers over their columns and repeats them after explicit row breaks", () => {
    const q = sample();
    q.sections[0].rows.push({
      ...blankLine(),
      number: "2.2",
      description: "Explicit next-page work",
      pageBreakBefore: true,
      quantity: "2",
      unit: "LS",
      rate: "50",
    });
    const pages = layoutQuotation(q);
    for (const page of pages.slice(1)) {
      const texts = textOf(page.commands);
      if (texts.some((c) => c.text === "2.1" || c.text === "2.2")) {
        expect(texts.find((c) => c.text === "Sl.No")?.x).toBe(96);
        expect(texts.find((c) => c.text === "QTY")?.x).toBe(338);
        expect(texts.find((c) => c.text === "AMOUNT")?.x).toBe(487);
      }
    }
  });
  it("wraps long descriptions and section subtotals inside their own columns", () => {
    const q = sample();
    q.sections[0].title =
      "Specialist coordinated painting and preparation of internal finishes in the designated project areas ".repeat(
        2,
      );
    q.sections[0].rows[0].description =
      "Coordinate all surfaces with the approved architectural specification and finishing schedule. ".repeat(
        100,
      );
    const pages = layoutQuotation(q);
    expect(pages.length).toBeGreaterThan(3);
    for (const page of pages.slice(1))
      for (const c of textOf(page.commands)) {
        if (c.x === 114.9) {
          expect(bounds(c).left).toBeGreaterThanOrEqual(114.8);
          expect(bounds(c).right).toBeLessThanOrEqual(314.1);
        }
        if (c.x === 262 && c.style === "bold") {
          expect(bounds(c).left).toBeGreaterThanOrEqual(85.9);
          expect(bounds(c).right).toBeLessThanOrEqual(438.1);
        }
        if (c.y < 720) expect(c.y + 1.8).toBeLessThanOrEqual(712);
      }
  });
  it("keeps unusually long quantity and unit cells inside page and column bounds", () => {
    const q = sample();
    q.sections[0].rows[0].quantity = "123456789012.123456";
    q.sections[0].rows[0].rate = "0";
    q.sections[0].rows[0].unit = "Long-unit ".repeat(80);
    for (const page of layoutQuotation(q).slice(1))
      for (const c of textOf(page.commands)) {
        if (c.x === 338 && c.style === "italic") {
          expect(bounds(c).left).toBeGreaterThanOrEqual(322.9);
          expect(bounds(c).right).toBeLessThanOrEqual(353.1);
        }
        if (c.x === 369 && c.style === "italic") {
          expect(bounds(c).left).toBeGreaterThanOrEqual(353.9);
          expect(bounds(c).right).toBeLessThanOrEqual(384.1);
        }
        if (c.y < 728) expect(c.y + 1.8).toBeLessThanOrEqual(712);
      }
  });
  it("repeats the Summary of Cost heading and aligns summary descriptions on continuation pages", () => {
    const q = sample();
    q.sections = Array.from({ length: 50 }, (_, i) => ({
      id: `s${i}`,
      number: String(i + 1),
      title: `Category ${i + 1}: specialist preparation and coordinated internal finishes`,
      rows: [],
    }));
    const pages = layoutQuotation(q);
    let summaryPages = 0;
    for (const page of pages) {
      const texts = textOf(page.commands);
      const rows = texts.filter((c) => c.x === 277 && c.style === "italic");
      if (rows.length) {
        summaryPages++;
        expect(texts.some((c) => c.text === "SUMMARY OF COST")).toBe(true);
        expect(
          texts.find((c) => c.text === "ITEM DESCRIPTION" && c.x === 277),
        ).toBeTruthy();
      }
    }
    expect(summaryPages).toBeGreaterThan(1);
  });
  it("paginates oversized payment and terms text before the fixed footer", () => {
    const q = sample();
    q.payments = [
      {
        id: "p",
        number: "1",
        description:
          "Approved stage milestone and coordinated completion. ".repeat(180),
        percentage: "100",
        notes: "",
      },
    ];
    q.terms = [
      {
        id: "t",
        number: "1",
        text: "Provide approved access and confirm coordinated finishes. ".repeat(
          180,
        ),
      },
    ];
    const pages = layoutQuotation(q);
    expect(pages.length).toBeGreaterThan(4);
    let paymentPages = 0;
    for (const page of pages) {
      const texts = textOf(page.commands);
      if (texts.some((c) => c.text === "PAYMENT TERMS & CONDITION"))
        paymentPages++;
      for (const c of texts)
        if (c.y < 728) expect(c.y + 1.8).toBeLessThanOrEqual(712);
    }
    expect(paymentPages).toBeGreaterThan(1);
  });
});
