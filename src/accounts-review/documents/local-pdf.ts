import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { blankFields, type EntryFields, type Upload } from "./model.js";
import type { DocumentExtractor } from "./providers.js";

const arabicDigits = (value: string) =>
  value.replace(/[\u0660-\u0669\u06f0-\u06f9]/g, (digit) =>
    String.fromCharCode(
      digit.charCodeAt(0) >= 0x06f0
        ? 48 + digit.charCodeAt(0) - 0x06f0
        : 48 + digit.charCodeAt(0) - 0x0660,
    ),
  );
const afterLabel = (text: string, labels: string[]) => {
  for (const label of labels) {
    const match = text.match(
      new RegExp("(?:^|\\n)\\s*(?:" + label + ")\\s*[:#-]?\\s*([^\\n]+)", "imu"),
    );
    if (match?.[1]) return match[1].trim().replace(/\s{2,}/g, " ");
  }
  return "";
};
const amount = (value: string) => {
  const match = arabicDigits(value).match(/(?:AED|د\.إ|درهم)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/iu);
  if (!match) return "";
  const normalized = match[1].replaceAll(",", "");
  return /^\d{1,10}(?:\.\d{1,2})?$/.test(normalized) ? normalized : "";
};
const date = (value: string) => {
  const normalized = arabicDigits(value);
  const iso = normalized.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (iso) return iso[1] + "-" + iso[2].padStart(2, "0") + "-" + iso[3].padStart(2, "0");
  const dmy = normalized.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/);
  if (dmy) return dmy[3] + "-" + dmy[2].padStart(2, "0") + "-" + dmy[1].padStart(2, "0");
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : "";
};

function itemRows(text: string): EntryFields["items"] {
  const items: EntryFields["items"] = [];
  for (const raw of text.split("\n")) {
    const line = arabicDigits(raw).replace(/\s+/g, " ").trim();
    if (!line || /^(description|item|qty|quantity|subtotal|tax|vat|total|المجموع|الكمية)/iu.test(line)) continue;
    const match = line.match(/^(.+?)\s+(\d{1,8}(?:\.\d{1,4})?)\s+([\p{L}]+)\s+([\d,]+\.\d{1,2})\s+([\d,]+\.\d{1,2})\s+([\d,]+\.\d{1,2})$/u);
    if (!match) continue;
    const [, description, quantity, unit, unitRate, tax, total] = match;
    items.push({
      description: description.slice(0, 200),
      quantity,
      unit,
      unitRate: amount(unitRate),
      tax: amount(tax),
      total: amount(total),
      productId: "",
    });
    if (items.length === 80) break;
  }
  return items;
}

export async function readPdfText(file: Upload) {
  const bytes = Buffer.from(file.data, "base64");
  const task = getDocument({
    data: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    useSystemFonts: true,
    disableFontFace: true,
  });
  try {
    const pdf = await task.promise;
    const rows: string[] = [];
    for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 5); pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines = new Map<number, string[]>();
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const y = Math.round(item.transform[5]);
        lines.set(y, [...(lines.get(y) || []), item.str.trim()]);
      }
      rows.push(
        ...[...lines.entries()]
          .sort((a, b) => b[0] - a[0])
          .map(([, parts]) => parts.join(" ")),
      );
    }
    return { text: rows.join("\n").slice(0, 100_000), pages: pdf.numPages };
  } finally {
    await task.destroy();
  }
}

export function parseBillText(text: string) {
  const fields = blankFields();
  fields.supplier = afterLabel(text, ["supplier", "vendor", "المورد"]);
  if (!fields.supplier) {
    fields.supplier =
      text.split("\n").map((row) => row.trim()).find((row) =>
        row.length > 2 && row.length < 100 &&
        !/(invoice|receipt|فاتورة|تاريخ|date|reference|subtotal|total|\d{4}-\d{2}-\d{2})/iu.test(row),
      ) || "";
  }
  fields.reference = afterLabel(text, ["invoice\\s*(?:no|number|#|ref(?:erence)?)", "bill\\s*(?:no|number|#)", "reference", "رقم\\s*الفاتورة"])
    .match(/[\p{L}\p{N}][\p{L}\p{N}./_-]{1,39}/u)?.[0] || "";
  fields.date = date(afterLabel(text, ["invoice\\s*date", "bill\\s*date", "date", "التاريخ"]));
  fields.dueDate = date(afterLabel(text, ["due\\s*date", "payment\\s*due", "تاريخ\\s*الاستحقاق"]));
  fields.purchaseOrderReference = afterLabel(text, ["(?:purchase\\s*)?order\\s*(?:no|number|#|reference)", "po\\s*(?:no|number|#|ref)", "أمر\\s*الشراء"])
    .match(/[\p{L}\p{N}][\p{L}\p{N}./_-]{1,39}/u)?.[0] || "";
  fields.currency = /\bAED\b|د\.إ|درهم/iu.test(text) ? "AED" : "unknown";
  fields.subtotal = amount(afterLabel(text, ["subtotal", "sub\\s*total", "المجموع\\s*قبل\\s*الضريبة"]));
  fields.tax = amount(afterLabel(text, ["(?:vat|tax)(?:\\s*amount)?", "ضريبة(?:\\s*القيمة\\s*المضافة)?"]));
  fields.total = amount(afterLabel(text, ["grand\\s*total", "invoice\\s*total", "total", "المجموع\\s*شامل\\s*الضريبة"]));
  fields.items = itemRows(text);
  const categoryText = text + "\n" + afterLabel(text, ["classification", "category", "نوع\\s*المصروف"]);
  if (/company expense|office (?:purchase|expense)|مصاريف الشركة|مصروفات الشركة|مصاريف المكتب/iu.test(categoryText)) {
    fields.kind = "company-expense";
    fields.categoryId = "company-expenses";
  } else if (/project|site|موقع|مشروع|supplier invoice|purchase invoice|فاتورة/iu.test(categoryText)) {
    fields.kind = "supplier-bill";
    fields.categoryId = "project-materials";
  }
  fields.projectName = afterLabel(text, ["project(?:\\s*name)?\\s*:", "المشروع\\s*:"]);
  const uncertain: string[] = [];
  for (const key of ["supplier", "date", "dueDate", "reference", "items", "subtotal", "tax", "total", "kind", "categoryId", "currency", "purchaseOrderReference"] as const)
    if (!fields[key] || (key === "items" && !fields.items.length)) uncertain.push(key);
  return { fields, uncertain: [...new Set(uncertain)] };
}

export const localPdfExtractor: DocumentExtractor = {
  async extract(file) {
    if (file.mime !== "application/pdf") {
      return {
        fields: blankFields(),
        uncertain: ["supplier", "date", "dueDate", "reference", "items", "subtotal", "tax", "total", "kind", "categoryId", "projectId", "currency"],
        provider: "No local image OCR engine installed",
        mode: "manual",
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        latencyMs: 0,
        retries: 0,
      };
    }
    const document = await readPdfText(file);
    if (document.pages > 5) throw Error("This review supports up to five PDF pages at a time.");
    if (document.text.replace(/\s/g, "").length < 24) {
      return {
        fields: blankFields(),
        uncertain: ["supplier", "date", "dueDate", "reference", "items", "subtotal", "tax", "total", "kind", "categoryId", "projectId", "currency"],
        provider: "PDF has no selectable text; manual review required (no OCR engine installed)",
        mode: "manual",
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        latencyMs: 0,
        retries: 0,
      };
    }
    return {
      ...parseBillText(document.text),
      provider: "Local PDF text extraction (PDF.js)",
      mode: "local-pdf-text",
      inputTokens: 0,
      outputTokens: 0,
      ocrPages: document.pages,
      costUsd: 0,
      latencyMs: 0,
      retries: 0,
    };
  },
};
