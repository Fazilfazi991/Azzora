// Synthetic-only independent originals. No provider calls, app fixture answers or admission registration.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createCanvas } from "@napi-rs/canvas";
import { jsPDF } from "jspdf";

const dir = "tests/fixtures/general-document-entry";
fs.mkdirSync(dir, { recursive: true });
const cents = (n) => Math.round(Number(n) * 100);
const money = (n) => (n / 100).toFixed(2);
const item = (
  description,
  quantity,
  unit,
  unitRate,
  taxed = false,
  discount = "0.00",
) => {
  const net = Math.round(Number(quantity) * cents(unitRate)) - cents(discount);
  const tax = taxed ? Math.round(net * 0.05) : 0;
  return {
    description,
    quantity,
    unit,
    unitRate,
    discount,
    tax: money(tax),
    total: money(net + tax),
    productId: "",
  };
};
const many = [
  item("Cable trunking", "3", "length", "24.50", true),
  item("Cable ties", "2", "pack", "9.25", true),
  item("Wall anchors", "4", "box", "12.00", true),
  item("Safety gloves", "5", "pair", "8.40", true),
  item("Measuring tape", "2", "each", "16.75", true),
  item("Marker pens", "6", "each", "3.50", true),
];
const specs = [
  {
    id: "G01",
    name: "harbor-multi-item.png",
    supplier: "Harbor Cedar Supplies",
    layout: "grid",
    title: "SUPPLIER INVOICE",
    documentType: "invoice",
    reference: "HC-261106-17",
    date: "2026-11-06",
    dueDate: "2026-11-20",
    purchaseOrderReference: "DEMO-PO-817",
    kind: "supplier-bill",
    items: [
      item("Oak veneer sheets", "2", "sheet", "45.00", true, "5.00"),
      item("Brass hinges", "6", "each", "7.50", true),
      item("Edge adhesive", "1", "tin", "32.20", true),
    ],
    projectName: "Sample apartment renovation",
    department: "JOINERY",
  },
  {
    id: "G02",
    name: "office-thermal.png",
    supplier: "Paper Kite Office Mart",
    layout: "thermal",
    title: "PAID RECEIPT",
    documentType: "receipt",
    reference: "PK-44019",
    date: "2026-11-05",
    kind: "company-expense",
    noTaxPrinted: true,
    items: [
      item("Printer paper A4", "2", "ream", "18.50"),
      item("Desk labels", "1", "pack", "7.25"),
    ],
  },
  {
    id: "G03",
    name: "site-camera.jpg",
    supplier: "Dune Spark Hardware",
    layout: "photo",
    title: "SITE EXPENSE RECEIPT",
    documentType: "receipt",
    reference: "DS-CASH-608",
    date: "2026-11-04",
    kind: "project-expense",
    items: [
      item("PVC elbows", "8", "each", "4.25"),
      item("Thread seal tape", "3", "roll", "6.50"),
    ],
    projectName: "Sample apartment renovation",
    department: "MEP",
  },
  {
    id: "G04",
    name: "rotated-bill.jpg",
    supplier: "Blue Fig Fasteners",
    layout: "rotated",
    title: "PURCHASE INVOICE",
    documentType: "invoice",
    reference: "BFF-9088",
    date: "2026-11-03",
    dueDate: "2026-11-18",
    kind: "supplier-bill",
    items: [
      item("M8 anchor bolts", "12", "each", "2.75", true),
      item("Steel washers", "20", "each", "0.85", true),
    ],
  },
  {
    id: "G05",
    name: "bilingual-invoice.png",
    supplier: "Palm Lantern Building Materials",
    layout: "arabic",
    title: "فاتورة شراء / PURCHASE INVOICE",
    documentType: "invoice",
    reference: "PL-7031",
    date: "2026-11-02",
    dueDate: "2026-11-16",
    kind: "supplier-bill",
    items: [
      item("White grout / جراوت أبيض", "4", "bag", "22.50", true),
      item("Tile spacers / فواصل بلاط", "2", "pack", "13.75", true),
    ],
    department: "CIVIL",
  },
  {
    id: "G06",
    name: "selectable-two-page.pdf",
    supplier: "Copper Reed Electrical",
    layout: "text-pdf",
    title: "SUPPLIER PURCHASE BILL",
    documentType: "invoice",
    reference: "CR-2P-115",
    date: "2026-11-01",
    dueDate: "2026-11-15",
    purchaseOrderReference: "DEMO-PO-222",
    kind: "supplier-bill",
    items: many,
    department: "MEP",
  },
  {
    id: "G07",
    name: "scanned-two-page.pdf",
    supplier: "Stone Finch Trade Depot",
    layout: "scan-pdf",
    title: "SUPPLIER INVOICE",
    documentType: "invoice",
    reference: "SF-SCAN-821",
    date: "2026-10-31",
    kind: "supplier-bill",
    items: many.map((x) => ({ ...x })),
    department: "CIVIL",
  },
  {
    id: "G08",
    name: "mixed-two-page.pdf",
    supplier: "Juniper Line Services",
    layout: "mixed-pdf",
    title: "COMPANY EXPENSE INVOICE",
    documentType: "invoice",
    reference: "JL-MIX-426",
    date: "2026-10-30",
    kind: "company-expense",
    items: [
      item("Office cleaning supplies", "2", "set", "31.25"),
      item("Waste sacks", "3", "pack", "8.00"),
      item("Pantry tissues", "4", "box", "5.50"),
      item("Hand soap", "2", "bottle", "11.75"),
    ],
    noTaxPrinted: true,
  },
  {
    id: "G09",
    name: "quotation-not-bill.png",
    supplier: "Cobalt Arch Interiors",
    layout: "quotation",
    title: "QUOTATION - NOT AN OFFICIAL BILL",
    documentType: "quotation",
    reference: "CA-Q-902",
    date: "2026-11-06",
    kind: "unknown",
    items: [
      item("Cabinet design service", "3", "hour", "95.00", true),
      item("Finish samples", "1", "set", "42.00", true),
    ],
  },
  {
    id: "G10",
    name: "degraded-partial-receipt.jpg",
    supplier: "Willow Cup Pantry",
    layout: "degraded",
    title: "OFFICE RECEIPT",
    documentType: "receipt",
    reference: "",
    date: "",
    kind: "company-expense",
    noTaxPrinted: true,
    missingSubtotal: true,
    items: [
      item("Pantry coffee", "2", "bag", "28.50"),
      item("Drinking cups", "1", "pack", "12.00"),
    ],
    uncertain: ["date", "reference", "subtotal", "items.0.quantity"],
  },
];
const digits = (s) =>
  String(s)
    .replace(/\d/g, (c) => "٠١٢٣٤٥٦٧٨٩"[Number(c)])
    .replace(/\./g, "٫");
function truth(s) {
  const subtotal = s.items.reduce(
    (sum, i) =>
      sum +
      Math.round(Number(i.quantity) * cents(i.unitRate)) -
      cents(i.discount),
    0,
  );
  const tax = s.items.reduce((sum, i) => sum + cents(i.tax), 0);
  return {
    documentType: s.documentType,
    supplier: s.supplier,
    date: s.date,
    dueDate: s.dueDate || "",
    reference: s.reference,
    purchaseOrderReference: s.purchaseOrderReference || "",
    currency: "AED",
    items: s.items.map((i) => ({ ...i, tax: s.noTaxPrinted ? "" : i.tax })),
    subtotal: s.missingSubtotal ? "" : money(subtotal),
    discount: "",
    tax: s.noTaxPrinted ? "" : money(tax),
    total: money(subtotal + tax),
    kind: s.kind,
    categoryId: "",
    department: s.department || "",
    ledgerId: "",
    projectName: s.projectName || "",
    customerName: "",
    projectId: "",
    customerId: "",
  };
}
function canvasPage(s, rows, page = 1, pages = 1) {
  const thermal = s.layout === "thermal";
  const width = thermal ? 620 : 1000,
    height = thermal ? 1100 : 1400;
  const canvas = createCanvas(width, height),
    c = canvas.getContext("2d");
  c.fillStyle = s.layout === "quotation" ? "#f4f5f9" : "#fff";
  c.fillRect(0, 0, width, height);
  const left = thermal ? 40 : 58,
    right = width - left;
  const text = (
    v,
    x,
    y,
    size = 21,
    bold = false,
    color = "#17212b",
    align = "left",
  ) => {
    c.font = `${bold ? "bold " : ""}${size}px ${thermal ? "Consolas" : "Arial"}`;
    c.fillStyle = color;
    c.textAlign = align;
    c.fillText(String(v), x, y);
  };
  const line = (y) => {
    c.strokeStyle = "#6e777c";
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(left, y);
    c.lineTo(right, y);
    c.stroke();
  };
  c.fillStyle = ["grid", "arabic"].includes(s.layout) ? "#e7eef1" : "#f1eee7";
  c.fillRect(left - 14, 32, width - 2 * left + 28, 146);
  text(s.supplier, left, 77, thermal ? 24 : 32, true);
  text(s.title, left, 119, thermal ? 23 : 25, true);
  text(
    "FICTIONAL QA ONLY - NO REAL COMPANY RECORDS",
    left,
    153,
    thermal ? 16 : 18,
    true,
    "#8a260c",
  );
  let y = 220;
  const data = [
    ["Reference", s.reference || "[not printed]"],
    ["Date", s.date || "[not printed]"],
    ["Currency", "AED"],
    ...(s.dueDate ? [["Due date", s.dueDate]] : []),
    ...(s.purchaseOrderReference
      ? [["PO reference", s.purchaseOrderReference]]
      : []),
  ];
  for (const [k, v] of data) {
    text(
      k + ": " + (s.layout === "arabic" && k === "Date" ? digits(v) : v),
      left,
      y,
      22,
    );
    y += 35;
  }
  if (s.layout === "arabic") {
    text(
      "المورد: شركة تجريبية - جميع الأرقام بالدرهم",
      right,
      y,
      22,
      false,
      "#17212b",
      "right",
    );
    y += 36;
  }
  const purpose =
    s.kind === "company-expense"
      ? "Office / company expense"
      : s.kind === "project-expense"
        ? "Paid site expense"
        : s.kind === "supplier-bill"
          ? "Supplier purchase bill"
          : "Price proposal only - no payment due";
  text(purpose, left, y + 5, 22, true);
  y += 43;
  if (s.projectName) {
    text("Project: " + s.projectName, left, y, 21);
    y += 33;
  }
  if (s.department) {
    text("Department: " + s.department, left, y, 21);
    y += 33;
  }
  line(y);
  y += 34;
  if (thermal) {
    text("ITEM / QTY x RATE / AMOUNT", left, y, 18, true);
    y += 34;
  } else {
    for (const [v, x] of [
      ["Description", left],
      ["Qty", 500],
      ["Unit", 600],
      ["Rate", 700],
      ["Disc.", 780],
      ["Tax", 850],
      ["Amount", right],
    ])
      text(v, x, y, 17, true, "#17212b", x === left ? "left" : "right");
    y += 30;
  }
  for (const [index, i] of rows) {
    if (thermal) {
      text(i.description, left, y, 21, true);
      y += 30;
      text(`${i.quantity} ${i.unit} x ${i.unitRate}`, left, y, 20);
      text(i.total, right, y, 22, true, "#17212b", "right");
      y += 45;
    } else {
      const description =
        i.description.length > 35 ? i.description.slice(0, 35) : i.description;
      text(description, left, y, 20);
      const vals = [
        index === 0 && s.layout === "degraded" ? "???" : i.quantity,
        i.unit,
        i.unitRate,
        i.discount,
        s.noTaxPrinted ? "" : i.tax,
        i.total,
      ];
      [500, 600, 700, 780, 850, right].forEach((x, j) =>
        text(
          s.layout === "arabic" && j !== 1 ? digits(vals[j]) : vals[j],
          x,
          y,
          20,
          j === 5,
          "#17212b",
          "right",
        ),
      );
      y += 49;
    }
  }
  line(y);
  y += 44;
  if (page === pages) {
    const f = truth(s);
    if (!s.missingSubtotal) {
      text("Subtotal", left, y, 23);
      text(
        s.layout === "arabic" ? digits(f.subtotal) : f.subtotal,
        right,
        y,
        24,
        false,
        "#17212b",
        "right",
      );
      y += 38;
    }
    if (!s.noTaxPrinted) {
      text("VAT 5%", left, y, 23);
      text(
        s.layout === "arabic" ? digits(f.tax) : f.tax,
        right,
        y,
        24,
        false,
        "#17212b",
        "right",
      );
      y += 38;
    }
    text("TOTAL AED", left, y, 27, true);
    text(
      s.layout === "arabic" ? digits(f.total) : f.total,
      right,
      y,
      29,
      true,
      "#17212b",
      "right",
    );
    y += 45;
  } else {
    text(
      "Continued on page " + (page + 1) + "; totals appear there.",
      left,
      y,
      22,
    );
    y += 40;
  }
  if (s.layout === "quotation") {
    text(
      "QUOTATION ONLY - NOT AN OFFICIAL BILL",
      left,
      y + 25,
      25,
      true,
      "#8a260c",
    );
  }
  text(
    "FICTIONAL QA - NOT A LEGAL TAX DOCUMENT",
    left,
    height - 80,
    thermal ? 17 : 21,
    true,
    "#8a260c",
  );
  text(
    `Independent sample ${s.id} | Page ${page} of ${pages}`,
    left,
    height - 43,
    18,
  );
  return canvas;
}
function photographed(canvas, rotated = false, degraded = false) {
  const border = 50,
    w = rotated ? canvas.height + 2 * border : canvas.width + 2 * border,
    h = rotated ? canvas.width + 2 * border : canvas.height + 2 * border;
  const out = createCanvas(w, h),
    c = out.getContext("2d");
  c.fillStyle = "#b6ad9e";
  c.fillRect(0, 0, w, h);
  c.translate(w / 2, h / 2);
  c.rotate(rotated ? Math.PI / 2 : -0.035);
  c.shadowColor = "#2a251f88";
  c.shadowBlur = 14;
  c.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  if (degraded) {
    c.shadowBlur = 0;
    c.globalAlpha = 0.075;
    for (let n = 0; n < 7500; n++) {
      const x = ((n * 701) % canvas.width) - canvas.width / 2,
        y = ((n * 487) % canvas.height) - canvas.height / 2;
      c.fillStyle = n % 2 ? "#111" : "#fff";
      c.fillRect(x, y, 2, 2);
    }
    c.globalAlpha = 1;
  }
  return out;
}
function textPage(pdf, s, rows, page, pages) {
  pdf.setTextColor(25, 35, 45);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(22);
  pdf.text(s.supplier, 42, 55);
  pdf.setFontSize(14);
  pdf.text(s.title, 42, 82);
  pdf.setFontSize(10);
  pdf.setTextColor(140, 38, 12);
  pdf.text("FICTIONAL QA ONLY - NOT A REAL TAX DOCUMENT", 42, 105);
  pdf.setTextColor(25, 35, 45);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(12);
  let y = 143;
  for (const [k, v] of [
    ["Reference", s.reference],
    ["Date", s.date],
    ["Currency", "AED"],
    ...(s.dueDate ? [["Due date", s.dueDate]] : []),
    ...(s.purchaseOrderReference
      ? [["PO reference", s.purchaseOrderReference]]
      : []),
  ]) {
    pdf.text(k + ": " + v, 42, y);
    y += 22;
  }
  pdf.text(
    s.kind === "company-expense"
      ? "Office / company expense"
      : "Supplier purchase bill",
    42,
    y + 8,
  );
  y += 43;
  if (s.department) {
    pdf.text("Department: " + s.department, 42, y);
    y += 26;
  }
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text("Description", 42, y);
  pdf.text("Qty", 300, y);
  pdf.text("Unit", 340, y);
  pdf.text("Rate", 420, y, { align: "right" });
  pdf.text("Disc.", 465, y, { align: "right" });
  pdf.text("Tax", 505, y, { align: "right" });
  pdf.text("Amount", 553, y, { align: "right" });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(12);
  y += 18;
  for (const [, i] of rows) {
    pdf.line(42, y, 553, y);
    y += 24;
    pdf.text(i.description, 42, y);
    pdf.text(i.quantity, 300, y);
    pdf.text(i.unit, 340, y);
    pdf.text(i.unitRate, 420, y, { align: "right" });
    pdf.text(i.discount, 465, y, { align: "right" });
    pdf.text(s.noTaxPrinted ? "" : i.tax, 505, y, { align: "right" });
    pdf.text(i.total, 553, y, { align: "right" });
    y += 22;
  }
  y += 28;
  if (page === pages) {
    const f = truth(s);
    for (const [k, v] of [
      ["Subtotal", f.subtotal],
      ...(!s.noTaxPrinted ? [["VAT 5%", f.tax]] : []),
      ["TOTAL AED", f.total],
    ]) {
      pdf.text(k, 365, y);
      pdf.text(v, 550, y, { align: "right" });
      y += 27;
    }
  } else
    pdf.text("Continued on next page. Totals printed on final page.", 42, y);
  pdf.setFontSize(10);
  pdf.text(
    `Independent fictional sample ${s.id} | Page ${page} of ${pages}`,
    42,
    790,
  );
}
const manifest = [];
for (const s of specs) {
  const p = path.join(dir, s.name),
    f = truth(s),
    rows = s.items.map((i, index) => [index, i]);
  if (s.name.endsWith(".pdf")) {
    const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
    doc.setCreationDate(new Date("2026-11-06T00:00:00Z"));
    doc.setFileId(createHash("md5").update(s.id).digest("hex").toUpperCase());
    const cut = Math.ceil(rows.length / 2);
    for (let page = 1; page <= 2; page++) {
      if (page > 1) doc.addPage();
      const portion = page === 1 ? rows.slice(0, cut) : rows.slice(cut);
      if (s.layout === "text-pdf" || (s.layout === "mixed-pdf" && page === 1))
        textPage(doc, s, portion, page, 2);
      else
        doc.addImage(
          canvasPage(s, portion, page, 2).toBuffer("image/png"),
          "PNG",
          0,
          0,
          595.28,
          841.89,
        );
    }
    fs.writeFileSync(p, Buffer.from(doc.output("arraybuffer")));
  } else {
    let canvas = canvasPage(s, rows);
    if (["photo", "rotated", "degraded"].includes(s.layout))
      canvas = photographed(
        canvas,
        s.layout === "rotated",
        s.layout === "degraded",
      );
    fs.writeFileSync(
      p,
      canvas.toBuffer(
        s.name.endsWith(".jpg") ? "image/jpeg" : "image/png",
        s.layout === "degraded" ? 36 : 82,
      ),
    );
  }
  if (s.layout === "degraded") f.items[0].quantity = "";
  if (s.layout === "thermal") for (const i of f.items) i.discount = "";
  const bytes = fs.readFileSync(p);
  if (bytes.length > 2_000_000) throw Error(s.id + " exceeds2MB");
  const exactPaths = [
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
  ];
  manifest.push({
    id: s.id,
    path: p.replaceAll("\\", "/"),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
    format: path.extname(p).slice(1),
    pages: s.name.endsWith(".pdf") ? 2 : 1,
    layout: s.layout,
    language: s.layout === "arabic" ? "Arabic/English" : "English",
    fictional: true,
    previouslyUnseen: true,
    groundTruth: f,
    scoredFields: exactPaths,
    expectedMissing: s.uncertain || [],
    notes:
      s.layout === "degraded"
        ? "Missing date/reference/subtotal and obscured first quantity must stay uncertain."
        : s.layout === "quotation"
          ? "Quotation must remain unpostable regardless of editable type."
          : "Ground truth copied from the printed original; IDs are never provider facts.",
  });
}
fs.writeFileSync(
  path.join(dir, "manifest.json"),
  JSON.stringify(
    {
      version: 1,
      createdAt: "2026-11-06T00:00:00Z",
      purpose:
        "Independent fictional unseen-document QA; not an extraction fixture or model answer source.",
      documents: manifest,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({
    documents: manifest.length,
    pdfPages: manifest
      .filter((x) => x.format === "pdf")
      .reduce((a, x) => a + x.pages, 0),
    largestBytes: Math.max(...manifest.map((x) => x.bytes)),
    providerCalls: 0,
  }),
);
