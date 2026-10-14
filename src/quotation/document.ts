import fonts from "./fonts.json";
import { jsPDF } from "jspdf";
import type { Quotation, QuotationLineItem } from "./model";
import { displayBoqCategoryNumber, isBoqParentDescription } from "./hierarchy";
import {
  amountInWords,
  displayAmount,
  displayRate,
  formatMoney,
  paymentAmount,
  sectionAmount,
  totals,
  discountAmount,
} from "./calculations";
export type Draw =
  | {
      kind: "text";
      x: number;
      y: number;
      text: string;
      size: number;
      style: "normal" | "bold" | "italic";
      color: string;
      align: "left" | "center" | "right";
    }
  | {
      kind: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
      fill: string;
      stroke: string;
    }
  | {
      kind: "line";
      x: number;
      y: number;
      x2: number;
      y2: number;
      color: string;
    }
  | {
      kind: "image";
      x: number;
      y: number;
      width: number;
      height: number;
      src: string;
    };
export interface DocumentPage {
  commands: Draw[];
}
function registerFonts(doc: jsPDF) {
  for (const style of ["bold", "italic"] as const) {
    doc.addFileToVFS("cera-" + style + ".ttf", fonts[style].data);
    doc.addFont("cera-" + style + ".ttf", "Cera", style);
  }
}
function fontFor(value: string, style: "normal" | "bold" | "italic") {
  return style !== "normal" &&
    [...value].every((c) => fonts[style].characters.includes(c) || c === "\n")
    ? "Cera"
    : "helvetica";
}
const measure = new jsPDF({ unit: "pt" });
registerFonts(measure);
const LEFT = 81,
  RIGHT = 531,
  WIDTH = 450,
  BOTTOM = 710;
export function layoutQuotation(q: Quotation): DocumentPage[] {
  const pages: DocumentPage[] = [];
  let page: DocumentPage;
  let y = 72;
  const text = (
    value: string,
    x: number,
    top: number,
    size = 8.2,
    style: "normal" | "bold" | "italic" = "italic",
    align: "left" | "center" | "right" = "left",
    color = "#000000",
  ) =>
    page.commands.push({
      kind: "text",
      x,
      y: top + size,
      text: value,
      size,
      style,
      align,
      color,
    });
  const rect = (
    x: number,
    top: number,
    width: number,
    height: number,
    fill = "#bfbfbf",
    stroke = "",
  ) =>
    page.commands.push({
      kind: "rect",
      x,
      y: top,
      width,
      height,
      fill,
      stroke,
    });
  const line = (
    x: number,
    top: number,
    x2: number,
    y2: number,
    color = "#aaaaaa",
  ) => page.commands.push({ kind: "line", x, y: top, x2, y2, color });
  const image = (
    src: string,
    x: number,
    top: number,
    width: number,
    height: number,
  ) => page.commands.push({ kind: "image", src, x, y: top, width, height });
  const wrap = (
    value: string,
    width: number,
    size = 8.2,
    style: "normal" | "bold" | "italic" = "italic",
  ): string[] => {
    measure.setFont(fontFor(value, style), style);
    measure.setFontSize(size);
    return value
      .split("\n")
      .flatMap(
        (part) => measure.splitTextToSize(part || " ", width) as string[],
      );
  };
  const newPage = (logo = true) => {
    page = { commands: [] };
    pages.push(page);
    y = 72;
    image("/assets/quotation/watermark.png", 162.6, 195.84, 317.4, 411.6);
    if (logo)
      image(
        q.company.logo?.startsWith("data:")
          ? q.company.logo
          : "/assets/quotation/logo.png",
        81,
        21.6,
        153.84,
        32.64,
      );
  };
  const ensure = (height: number) => {
    if (y + height > BOTTOM && y > 105) {
      newPage();
      return true;
    }
    return false;
  };
  const paragraph = (
    value: string,
    size = 9.3,
    width = WIDTH,
    x = 83,
    spacing = 12.1,
  ) => {
    const lines = wrap(value, width, size);
    for (const value of lines) {
      ensure(spacing);
      text(value, x, y, size);
      y += spacing;
    }
  };
  const bar = (title: string, height = 14) => {
    ensure(height + 14);
    rect(LEFT, y, WIDTH, height, "#bfbfbf", "#000000");
    text(title, 306, y + 2, 9, "bold", "center", "#ffffff");
    y += height;
  };
  newPage(true);
  y = 70.7;
  rect(LEFT, y, WIDTH, 17, "#bfbfbf", "#000000");
  text("QUOTATION", 306, y + 2, 13, "bold", "center");
  y = 118;
  const customerLines = wrap("Client: " + q.customer.name, 218, 9, "bold");
  const infoHeight = Math.max(44, customerLines.length * 12 + 6);
  rect(LEFT, y, WIDTH, infoHeight, "#bfbfbf", "#000000");
  customerLines.forEach((s, i) => text(s, 83, y + 3 + i * 12, 9, "bold"));
  line(312, y, 312, y + infoHeight, "#ffffff");
  line(350, y, 350, y + infoHeight, "#ffffff");
  const date = new Date(q.date + "T12:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Dubai",
  });
  [
    ["Q.No:", q.number + (q.revision ? " Rev " + q.revision : "")],
    ["Date:", date],
    ["Ref:", q.reference],
  ].forEach(([label, value], i) => {
    const top = y + (i * infoHeight) / 3;
    text(label, 332, top + 3, 8.2, "bold", "center");
    wrap(value, 177, 9).forEach((s, j) => text(s, 352, top + 3 + j * 10, 9));
    if (i < 2)
      line(312, top + infoHeight / 3, RIGHT, top + infoHeight / 3, "#ffffff");
  });
  y += infoHeight + 15;
  paragraph(q.introduction.attention);
  y += 17;
  paragraph(q.introduction.opening);
  y += 18;
  rect(LEFT, y, WIDTH, 14, "#bfbfbf", "#000000");
  text("SCOPE OF WORK", 306, y + 2, 9, "bold", "center");
  y += 14;
  for (const [label, value] of [
    ["JOB", q.project.name],
    ["LOCATION", q.project.location],
  ]) {
    const ls = wrap(value, 215, 9.3);
    const h = Math.max(14, ls.length * 12 + 4);
    rect(LEFT, y, WIDTH, h, "#bfbfbf", "#000000");
    line(312, y, 312, y + h, "#ffffff");
    text(label, 83, y + 2, 9, "bold");
    ls.forEach((s, i) => text(s, 314, y + 2 + i * 12, 9.3));
    y += h;
  }
  y += 28;
  paragraph(q.introduction.proposal);
  y += 14;
  paragraph(q.introduction.quality);
  y += 14;
  paragraph(q.introduction.clarification);
  y += 30;
  paragraph(q.introduction.closing);
  y += 17;
  const signature = q.introduction.signature.split("\n");
  signature.forEach((s, i) => {
    ensure(13);
    if (i === 0 && s.startsWith("AZZORA")) {
      text("AZZORA", 83, y, 8.8, "bold", "left", "#bc8b00");
      text(s.slice(6).trim(), 123, y, 8.8, "bold");
      y += 13;
    } else {
      paragraph(s, 9.3, WIDTH, 83, 12.1);
    }
  });
  newPage();
  // All BOQ anchors share the approved column boundaries. Keep stationery,
  // fonts, fills and borders unchanged; reserve padding inside each cell.
  const descriptionX = 114.9;
  const descriptionWidth = 199;
  const descriptionCenter = descriptionX + descriptionWidth / 2;
  const cellLines = (r: QuotationLineItem) => [
    wrap(r.quantity, 30),
    wrap(r.unit, 30),
    wrap(displayRate(r), 45),
    wrap(displayAmount(r), 78),
  ];
  const tableHeader = () => {
    rect(LEFT, y, WIDTH, 14);
    [
      ["Sl.No", 96],
      ["ITEM DESCRIPTION", descriptionCenter],
      ["QTY", 338],
      ["UNIT", 369],
      ["RATE/UNIT", 416],
      ["AMOUNT", 487],
    ].forEach(([s, x]) =>
      text(String(s), Number(x), y + 3, 8, "bold", "center", "#ffffff"),
    );
    y += 14;
  };
  tableHeader();
  const rowLines = (r: QuotationLineItem) =>
    wrap(
      r.description + (r.location ? "\n" + r.location : ""),
      descriptionWidth,
      8.2,
      isBoqParentDescription(r) ? "bold" : "italic",
    );
  const rowHeight = (r: QuotationLineItem) => {
    const count = Math.max(
      rowLines(r).length,
      ...(r.pricingType === "Heading" || r.pricingType === "Included"
        ? [1]
        : cellLines(r).map((ls) => ls.length)),
    );
    return Math.max(
      (r.minHeight || 14.52) * 0.9,
      count * 10.2 + (count > 1 ? 2.4 : 0.2),
    );
  };
  const sectionHeader = (number: string, title: string) => {
    const ls = wrap(title, 199, 8.2, "bold");
    const h = Math.max(10.6, ls.length * 10.2 + 2.2);
    rect(LEFT, y, WIDTH, h);
    text(number, 96, y + 2, 8.2, "bold", "center", "#ffffff");
    ls.forEach((s, i) =>
      text(
        s,
        descriptionCenter,
        y + 2 + i * 10.2,
        8.2,
        "bold",
        "center",
        "#ffffff",
      ),
    );
    y += h;
  };
  for (const section of q.sections) {
    const headingNumber = displayBoqCategoryNumber(q, section);
    const first = section.rows[0],
      second = section.rows[1];
    let preparedBreakRowId: string | undefined;
    if (
      (first?.pageBreakBefore ||
        (first && isBoqParentDescription(first) && second?.pageBreakBefore)) &&
      y > 95
    ) {
      newPage(section.rows[0].pageLogo !== false);
      tableHeader();
      if (first && isBoqParentDescription(first) && second?.pageBreakBefore)
        preparedBreakRowId = second.id;
    }
    const openingHeight =
      Math.max(
        10.6,
        wrap(section.title, 199, 8.2, "bold").length * 10.2 + 2.2,
      ) +
      2 +
      (first ? Math.min(rowHeight(first), BOTTOM - 140) : 0) +
      (first && isBoqParentDescription(first) && second
        ? Math.min(rowHeight(second), BOTTOM - 180)
        : 0);
    if (ensure(openingHeight)) tableHeader();
    sectionHeader(headingNumber, section.title);
    for (let i = 0; i < section.rows.length; i++) {
      const r = section.rows[i],
        ls = rowLines(r),
        h = rowHeight(r);
      const nextBreak =
        isBoqParentDescription(r) && section.rows[i + 1]?.pageBreakBefore;
      if (
        i > 0 &&
        ((r.pageBreakBefore && r.id !== preparedBreakRowId) || nextBreak) &&
        y > 95
      ) {
        newPage(r.pageLogo !== false);
        tableHeader();
        sectionHeader(headingNumber, section.title + " (continued)");
        if (nextBreak) preparedBreakRowId = section.rows[i + 1].id;
      }
      const keep =
        (h > BOTTOM - 120 ? 40 : h) +
        (isBoqParentDescription(r) && section.rows[i + 1]
          ? Math.min(rowHeight(section.rows[i + 1]), 40)
          : 0) +
        (i === section.rows.length - 1 ? 18 : 0);
      if (ensure(keep)) {
        tableHeader();
        sectionHeader(headingNumber, section.title + " (continued)");
      }
      // Keep ordinary rows intact. Oversized descriptions continue in deliberate chunks.
      let offset = 0;
      const valueLines =
        r.pricingType === "Heading" || r.pricingType === "Included"
          ? []
          : cellLines(r);
      const totalLines = Math.max(
        ls.length,
        ...valueLines.map((values) => values.length),
      );
      while (offset < totalLines) {
        const availableLines = Math.max(
          1,
          Math.floor((BOTTOM - y - 12) / 10.2),
        );
        const count =
          h <= BOTTOM - y
            ? totalLines - offset
            : Math.min(availableLines, totalLines - offset);
        const segment = ls.slice(offset, offset + count);
        const segmentHeight =
          offset === 0 && count === totalLines ? h : count * 10.2 + 4;
        if (isBoqParentDescription(r))
          rect(LEFT, y, WIDTH, segmentHeight, "#f2f2f2");
        else if (section.number !== "1")
          for (const x of [320, 356, 443]) line(x, y, x, y + segmentHeight);
        text(
          r.number,
          96,
          y + 2,
          8.2,
          isBoqParentDescription(r) ? "bold" : "italic",
          "center",
        );
        segment.forEach((s, j) =>
          text(
            s,
            descriptionX,
            y + 2 + j * 10.2,
            8.2,
            isBoqParentDescription(r) ? "bold" : "italic",
          ),
        );
        if (r.pricingType !== "Heading" && r.pricingType !== "Included") {
          const spanHeight =
            (r.priceSpanRows || 1) > 1
              ? section.rows
                  .slice(i + 1, i + (r.priceSpanRows || 1))
                  .reduce((sum, next) => sum + rowHeight(next), 0)
              : 0;
          const lines = valueLines.map((values) =>
            values.slice(offset, offset + count),
          );
          const cellHeight = Math.max(...lines.map((ls) => ls.length)) * 10.2;
          // A merged price is centered only inside rows present on this page.
          const visibleSpan =
            segmentHeight + spanHeight <= BOTTOM - y ? spanHeight : 0;
          const middle =
            y + Math.max(2, (segmentHeight + visibleSpan - cellHeight) / 2);
          lines.forEach((values, column) =>
            values.forEach((value, j) =>
              text(
                value,
                [338, 369, 440, 526][column],
                middle + j * 10.2,
                8.2,
                "italic",
                column < 2 ? "center" : "right",
              ),
            ),
          );
        }
        y += segmentHeight;
        offset += count;
        if (offset < totalLines) {
          newPage();
          tableHeader();
          sectionHeader(headingNumber, section.title + " (continued)");
        }
      }
    }
    const subtotalLines = wrap(
      "Sub total For  " + section.title,
      352,
      8.4,
      "bold",
    );
    const subtotalHeight = Math.max(13, subtotalLines.length * 10.2 + 4);
    if (ensure(subtotalHeight)) {
      tableHeader();
      sectionHeader(headingNumber, section.title + " (continued)");
    }
    rect(LEFT, y, WIDTH, subtotalHeight);
    subtotalLines.forEach((value, i) =>
      text(value, 262, y + 2 + i * 10.2, 8.4, "bold", "center", "#ffffff"),
    );
    text(
      formatMoney(sectionAmount(section)),
      526,
      y + 2,
      8.4,
      "bold",
      "right",
      "#ffffff",
    );
    y += subtotalHeight + 3.3;
  }
  const t = totals(q);
  const totalBlock = (height = 22.6, continued = tableHeader) => {
    if (ensure(height * (discountAmount(q) > 0n ? 4 : 3))) continued();
    [
      ["SUB TOTAL (AED)", t.subtotal],
      ...(discountAmount(q) > 0n
        ? [["DISCOUNT (AED)", discountAmount(q)]]
        : []),
      ["TAX " + (q.vatEnabled ? q.vatPercentage : "0") + "% (AED)", t.vat],
      ["GRAND TOTAL (AED)", t.grand],
    ].forEach(([label, value]) => {
      rect(LEFT, y, WIDTH, height);
      line(LEFT, y, RIGHT, y, "#ffffff");
      line(445, y, 445, y + height, "#ffffff");
      text(
        String(label),
        443,
        y + (height - 9) / 2,
        9,
        "bold",
        "right",
        "#ffffff",
      );
      text(
        formatMoney(value as bigint),
        526,
        y + (height - 9) / 2,
        9,
        "bold",
        "right",
        "#ffffff",
      );
      y += height;
    });
  };
  y += 8;
  totalBlock();
  y += 14;
  const wordLines = wrap(
    q.amountWordsOverride || amountInWords(t.grand),
    WIDTH - 8,
    9,
    "bold",
  );
  for (const value of wordLines) {
    ensure(12);
    text(value, 306, y, 9, "bold", "center");
    y += 12;
  }
  y += 12;
  const summaryHeader = () => {
    bar("SUMMARY OF COST");
    rect(LEFT, y, WIDTH, 14, "#f2f2f2");
    text("SL #", 96, y + 2, 8.2, "bold", "center");
    text("ITEM DESCRIPTION", 277, y + 2, 8.2, "bold", "center");
    text("AMOUNT (AED)", 488, y + 2, 8.2, "bold", "center");
    y += 14;
  };
  ensure(
    28 +
      (q.sections[0]
        ? Math.max(14.52, wrap(q.sections[0].title, 322, 9.3).length * 11.2 + 4)
        : 0),
  );
  summaryHeader();
  for (const s of q.sections) {
    const ls = wrap(s.title, 322, 9.3);
    const h = Math.max(14.52, ls.length * 11.2 + 3);
    if (ensure(h)) summaryHeader();
    text(s.number.replace(/\.00$/, ""), 96, y + 2, 9.3, "italic", "center");
    ls.forEach((v, i) =>
      text(v, 277, y + 2 + i * 11.2, 9.3, "italic", "center"),
    );
    text(formatMoney(sectionAmount(s)), 526, y + 2, 8.2, "italic", "right");
    y += h;
  }
  totalBlock(18.5, summaryHeader);
  y += 10;
  const firstPayment = q.payments[0];
  if (firstPayment) {
    const firstLines = wrap(
      "Term " +
        firstPayment.number +
        " - " +
        firstPayment.description +
        (firstPayment.notes ? "\n" + firstPayment.notes : ""),
      273,
      8.2,
    );
    ensure(14 + Math.min(Math.max(21.2, firstLines.length * 11.2 + 7), 80));
  }
  bar("PAYMENT TERMS & CONDITION");
  for (const p of q.payments) {
    const ls = wrap(
      "Term " +
        p.number +
        " - " +
        p.description +
        (p.notes ? "\n" + p.notes : ""),
      273,
      8.2,
    );
    const h = Math.max(21.2, ls.length * 11.2 + 7);
    if (ensure(h > BOTTOM - 114 ? 44 : h)) bar("PAYMENT TERMS & CONDITION");
    let offset = 0;
    while (offset < ls.length) {
      const count = Math.min(
        ls.length - offset,
        Math.max(1, Math.floor((BOTTOM - y - 7) / 11.2)),
      );
      const segment = ls.slice(offset, offset + count);
      segment.forEach((v, i) => text(v, 83, y + 4 + i * 11.2));
      if (offset === 0) {
        text(p.percentage + "%", 369, y + 4, 8.2, "italic", "center");
        text(
          formatMoney(paymentAmount(p, t.grand), true),
          526,
          y + 4,
          8.2,
          "italic",
          "right",
        );
      }
      y += Math.max(21.2, segment.length * 11.2 + 7);
      line(LEFT, y, RIGHT, y, "#000000");
      offset += count;
      if (offset < ls.length) {
        newPage();
        bar("PAYMENT TERMS & CONDITION");
      }
    }
  }
  y += 10;
  const firstTerm = q.terms[0];
  if (firstTerm)
    ensure(
      28 +
        Math.min(
          Math.max(14.52, wrap(firstTerm.text, 412, 8.2).length * 11.2 + 3),
          60,
        ),
    );
  bar("TERMS & CONDITION");
  y += 14;
  for (const term of q.terms) {
    const continuedTerms = () => {
      bar("TERMS & CONDITION");
      y += 14;
    };
    if (term.pageBreakBefore && y > 95) {
      newPage();
      continuedTerms();
    }
    const ls = wrap(term.text, 412, 8.2);
    const h = Math.max(14.52, ls.length * 11.2 + 3);
    if (ensure(h > BOTTOM - 114 ? 44 : h)) continuedTerms();
    text(term.number, 96, y + 2, 8.2, "italic", "center");
    for (const v of ls) {
      if (ensure(11.2)) {
        continuedTerms();
        text(term.number + " (cont.)", 96, y + 2, 7, "italic", "center");
      }
      text(v, 114.9, y + 2);
      y += 11.2;
    }
    y += Math.max(3, h - ls.length * 11.2);
  }
  pages.forEach((p, index) => {
    page = p;
    text("Page " + (index + 1), 81, 756.8, 11, "italic");
    const company = q.company.name;
    measure.setFont(fontFor(company, "bold"), "bold");
    measure.setFontSize(11);
    const w = measure.getTextWidth(company);
    if (company.startsWith("AZZORA")) {
      text("AZZORA", 560 - w, 728, 11, "bold", "left", "#bc8b00");
      text(company.slice(6).trim(), 560, 728, 11, "bold", "right");
    } else text(company, 560, 728, 11, "bold", "right");
    text("Email: " + q.company.email, 560, 742.9, 11, "italic", "right");
    text("Mob : " + q.company.phone, 560, 757.4, 11, "italic", "right");
  });
  return pages;
}
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
export function pageSvg(page: DocumentPage): string {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 612 792" preserveAspectRatio="none" role="img" aria-label="Quotation page"><defs><style>@font-face{font-family:Cera;src:url(/assets/quotation/cera-bold.ttf);font-weight:700}@font-face{font-family:Cera;src:url(/assets/quotation/cera-italic.ttf);font-style:italic}</style></defs>' +
    page.commands
      .map((c) => {
        if (c.kind === "text")
          return `<text x="${c.x}" y="${c.y}" font-family="${fontFor(c.text, c.style) === "Cera" ? "Cera" : "Arial, sans-serif"}" font-size="${c.size}" font-weight="${c.style === "bold" ? "700" : "400"}" font-style="${c.style === "italic" ? "italic" : "normal"}" fill="${c.color}" text-anchor="${c.align === "right" ? "end" : c.align === "center" ? "middle" : "start"}">${escape(c.text)}</text>`;
        if (c.kind === "rect")
          return `<rect x="${c.x}" y="${c.y}" width="${c.width}" height="${c.height}" fill="${c.fill}" stroke="${c.stroke || "none"}" stroke-width=".6"/>`;
        if (c.kind === "line")
          return `<line x1="${c.x}" y1="${c.y}" x2="${c.x2}" y2="${c.y2}" stroke="${c.color}" stroke-width=".45"/>`;
        return `<image href="${c.src}" x="${c.x}" y="${c.y}" width="${c.width}" height="${c.height}"/>`;
      })
      .join("") +
    "</svg>"
  );
}
export async function generatePdf(q: Quotation): Promise<jsPDF> {
  const pages = layoutQuotation(q);
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  registerFonts(doc);
  const sx = doc.internal.pageSize.getWidth() / 612,
    sy = doc.internal.pageSize.getHeight() / 792;
  const assets: Record<string, Uint8Array> = {};
  for (const src of [
    "/assets/quotation/logo.png",
    "/assets/quotation/watermark.png",
    ...(q.company.logo?.startsWith("data:") ? [q.company.logo] : []),
  ]) {
    const r = await fetch(src);
    if (!r.ok) throw Error("Quotation stationery could not be loaded.");
    assets[src] = new Uint8Array(await r.arrayBuffer());
  }
  pages.forEach((page, index) => {
    if (index) doc.addPage();
    page.commands.forEach((c) => {
      if (c.kind === "image")
        doc.addImage(
          assets[c.src],
          "PNG",
          c.x * sx,
          c.y * sy,
          c.width * sx,
          c.height * sy,
          undefined,
          "FAST",
        );
      if (c.kind === "text") {
        doc.setFont(fontFor(c.text, c.style), c.style);
        doc.setFontSize(c.size * sy);
        doc.setTextColor(c.color);
        measure.setFont(fontFor(c.text, c.style), c.style);
        measure.setFontSize(c.size);
        const width = measure.getTextWidth(c.text);
        const left =
          c.x -
          (c.align === "right" ? width : c.align === "center" ? width / 2 : 0);
        doc.text(c.text, left * sx, c.y * sy, {
          align: "left",
          horizontalScale: sx / sy,
        });
      }
      if (c.kind === "rect") {
        doc.setFillColor(c.fill);
        doc.setLineWidth(0.6);
        if (c.stroke) doc.setDrawColor(c.stroke);
        doc.rect(
          c.x * sx,
          c.y * sy,
          c.width * sx,
          c.height * sy,
          c.stroke ? "FD" : "F",
        );
      }
      if (c.kind === "line") {
        doc.setDrawColor(c.color);
        doc.setLineWidth(0.45);
        doc.line(c.x * sx, c.y * sy, c.x2 * sx, c.y2 * sy);
      }
    });
  });
  doc.setProperties({
    title: q.number + (q.revision ? " Rev " + q.revision : ""),
    subject: q.project.name,
    author: q.company.name,
  });
  return doc;
}
export async function downloadPdf(q: Quotation) {
  (await generatePdf(q)).save(
    q.number + (q.revision ? " Rev " + q.revision : "") + ".pdf",
  );
}
export function printQuotation(q: Quotation) {
  const win = window.open("", "_blank");
  if (!win) throw Error("Allow the print window to open, then try again.");
  win.document.write(
    "<!doctype html><html><head><title>" +
      escape(q.number) +
      '</title><base href="' +
      escape(location.origin) +
      '/"><style>@page{size:A4;margin:0}body{margin:0}.sheet{width:210mm;height:297mm;break-after:page}.sheet:last-child{break-after:auto}.sheet svg{display:block;width:100%;height:100%}</style></head><body>' +
      layoutQuotation(q)
        .map((p) => '<div class="sheet">' + pageSvg(p) + "</div>")
        .join("") +
      "</body></html>",
  );
  win.document.close();
  win.onload = () => {
    void win.document.fonts.ready.then(() => {
      win.focus();
      win.print();
    });
  };
}
