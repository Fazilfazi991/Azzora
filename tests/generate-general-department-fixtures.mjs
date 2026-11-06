// Additional independent originals only; never rewrites the first ten documents.
import fs from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createCanvas } from "@napi-rs/canvas";
import { jsPDF } from "jspdf";
const dir = "tests/fixtures/general-document-entry";
const original = JSON.parse(fs.readFileSync(dir + "/manifest.json"));
const digest = (p) =>
  createHash("sha256").update(fs.readFileSync(p)).digest("hex");
for (const doc of original.documents)
  assert.equal(digest(doc.path), doc.sha256);
const rows = [
  {
    id: "G11",
    name: "silver-fern-department.png",
    supplier: "Silver Fern Joinery Goods",
    documentType: "invoice",
    title: "SUPPLIER PURCHASE INVOICE",
    reference: "SFJ-6014",
    date: "2026-11-06",
    dueDate: "2026-11-20",
    purchaseOrderReference: "FIC-PO-558",
    currency: "AED",
    department: "JOINERY",
    kind: "supplier-bill",
    items: [
      {
        description: "Birch trim strips",
        quantity: "3",
        unit: "length",
        unitRate: "18.50",
        discount: "0.00",
        tax: "2.78",
        total: "58.28",
        productId: "",
      },
      {
        description: "Cabinet handles",
        quantity: "2",
        unit: "pair",
        unitRate: "25.00",
        discount: "0.00",
        tax: "2.50",
        total: "52.50",
        productId: "",
      },
    ],
    subtotal: "105.50",
    tax: "5.28",
    total: "110.78",
  },
  {
    id: "G12",
    name: "crescent-mill-department.pdf",
    supplier: "Crescent Mill Site Store",
    documentType: "receipt",
    title: "PAID SITE EXPENSE RECEIPT",
    reference: "CMS-CASH-914",
    date: "2026-11-05",
    dueDate: "",
    purchaseOrderReference: "",
    currency: "AED",
    department: "MEP",
    kind: "project-expense",
    items: [
      {
        description: "Conduit clips",
        quantity: "5",
        unit: "each",
        unitRate: "3.20",
        discount: "0.00",
        tax: "0.00",
        total: "16.00",
        productId: "",
      },
    ],
    subtotal: "16.00",
    tax: "0.00",
    total: "16.00",
  },
];
const docs = [];
for (const row of rows) {
  const target = dir + "/" + row.name;
  if (row.name.endsWith(".png")) {
    const canvas = createCanvas(1000, 1320),
      c = canvas.getContext("2d");
    c.fillStyle = "#fff";
    c.fillRect(0, 0, 1000, 1320);
    const text = (s, x, y, size = 24, bold = false) => {
      c.fillStyle = "#182932";
      c.font = `${bold ? "bold " : ""}${size}px Arial`;
      c.fillText(s, x, y);
    };
    c.fillStyle = "#e7eee8";
    c.fillRect(45, 40, 910, 150);
    text(row.supplier, 65, 90, 35, true);
    text(row.title, 65, 136, 26, true);
    text("FICTIONAL QA ONLY - NOT A REAL TAX DOCUMENT", 65, 175, 20, true);
    text("Reference: " + row.reference, 65, 240);
    text("Date: " + row.date, 65, 280);
    text("Due date: " + row.dueDate, 65, 320);
    text("PO: " + row.purchaseOrderReference, 65, 360);
    c.fillStyle = "#f1e8d7";
    c.fillRect(45, 395, 910, 88);
    text("DEPARTMENT: " + row.department, 65, 450, 32, true);
    text("Currency: AED | Purpose: Supplier purchase bill", 65, 530, 23);
    const columns = [65, 475, 555, 655, 750, 835, 940];
    const cell = (s, x, y, size = 21) => {
      c.fillStyle = "#182932";
      c.font = `${size}px Arial`;
      c.textAlign = x === 65 ? "left" : "right";
      c.fillText(s, x, y);
      c.textAlign = "left";
    };
    ["Description", "Qty", "Unit", "Rate", "Disc.", "VAT", "Amount"].forEach(
      (s, i) => cell(s, columns[i], 595, 20),
    );
    row.items.forEach((item, index) =>
      [
        item.description,
        item.quantity,
        item.unit,
        item.unitRate,
        item.discount,
        item.tax,
        item.total,
      ].forEach((s, i) => cell(s, columns[i], 645 + index * 65)),
    );
    let y = 850;
    for (const [label, amount] of [
      ["Subtotal", row.subtotal],
      ["VAT5%", row.tax],
      ["TOTAL AED", row.total],
    ]) {
      text(label, 565, y, 26, true);
      cell(amount, 940, y, 28);
      y += 48;
    }
    text("FICTIONAL QA - NOT A LEGAL TAX DOCUMENT", 65, 1200, 22, true);
    text("Independent department verification G11", 65, 1250, 20);
    fs.writeFileSync(target, canvas.toBuffer("image/png"));
  } else {
    const pdf = new jsPDF({ unit: "pt", format: "a4", compress: true });
    pdf.setCreationDate(new Date("2026-11-06T00:00:00Z"));
    pdf.setFileId(createHash("md5").update(row.id).digest("hex").toUpperCase());
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(23);
    pdf.text(row.supplier, 45, 65);
    pdf.setFontSize(15);
    pdf.text(row.title, 45, 95);
    pdf.setFontSize(11);
    pdf.text("FICTIONAL QA ONLY - NOT A REAL TAX DOCUMENT", 45, 125);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(13);
    pdf.text("Receipt reference: " + row.reference, 45, 180);
    pdf.text("Date: " + row.date, 45, 210);
    pdf.text("Currency: AED", 45, 240);
    pdf.setFillColor(229, 237, 242);
    pdf.rect(40, 275, 515, 50, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(20);
    pdf.text("DEPARTMENT: " + row.department, 52, 306);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(13);
    pdf.text("Purpose: Paid project expense - site materials", 45, 365);
    pdf.setFontSize(11);
    pdf.text("Description", 45, 420);
    pdf.text("Qty", 290, 420);
    pdf.text("Unit", 330, 420);
    pdf.text("Rate", 400, 420, { align: "right" });
    pdf.text("Disc.", 448, 420, { align: "right" });
    pdf.text("Tax", 495, 420, { align: "right" });
    pdf.text("Amount", 550, 420, { align: "right" });
    const item = row.items[0];
    [
      item.description,
      item.quantity,
      item.unit,
      item.unitRate,
      item.discount,
      item.tax,
      item.total,
    ].forEach((s, i) =>
      pdf.text(s, [45, 290, 330, 400, 448, 495, 550][i], 450, {
        align: i < 3 ? "left" : "right",
      }),
    );
    pdf.setFontSize(14);
    let y = 535;
    for (const [label, value] of [
      ["Subtotal", row.subtotal],
      ["VAT (not applicable)", row.tax],
      ["TOTAL AED", row.total],
    ]) {
      pdf.text(label, 330, y);
      pdf.text(value, 550, y, { align: "right" });
      y += 32;
    }
    pdf.setFontSize(11);
    pdf.text("FICTIONAL QA - NOT A LEGAL TAX DOCUMENT", 45, 740);
    pdf.text("Independent department verification G12 | Page1 of1", 45, 775);
    fs.writeFileSync(target, Buffer.from(pdf.output("arraybuffer")));
  }
  const { id, name, title, ...printed } = row;
  const groundTruth = {
    ...printed,
    discount: "",
    categoryId: "",
    ledgerId: "",
    projectName: "",
    projectId: "",
    customerName: "",
    customerId: "",
  };
  const bytes = fs.readFileSync(target);
  assert.ok(bytes.length < 2_000_000);
  assert.ok(!original.documents.some((d) => d.sha256 === digest(target)));
  docs.push({
    id,
    path: target,
    sha256: digest(target),
    bytes: bytes.length,
    format: name.endsWith(".pdf") ? "pdf" : "png",
    pages: 1,
    layout: name.endsWith(".pdf") ? "department-text-pdf" : "department-image",
    language: "English",
    fictional: true,
    previouslyUnseen: true,
    groundTruth,
    scoredFields: [
      "supplier",
      "date",
      "reference",
      "currency",
      "documentType",
      "dueDate",
      "purchaseOrderReference",
      "subtotal",
      "discount",
      "tax",
      "total",
      "kind",
      "department",
      "projectName",
    ],
    expectedMissing: [],
    notes:
      "New independent original for department prompt verification; no preset extraction or admission registration.",
  });
}
for (const doc of original.documents)
  assert.equal(digest(doc.path), doc.sha256, "Original corpus changed");
fs.writeFileSync(
  dir + "/department-supplement.json",
  JSON.stringify(
    {
      version: 1,
      createdAt: "2026-11-06T00:00:00Z",
      purpose:
        "New independent department prompt verification; original ten documents and results preserved.",
      documents: docs,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    newDocuments: docs.length,
    originalTenPreserved: true,
    providerCalls: 0,
  }),
);
