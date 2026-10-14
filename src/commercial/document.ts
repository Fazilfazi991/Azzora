import type { Database } from "../domain/model";
import type { Invoice } from "./model";
import type { ReportData } from "./reports-data";
import { invoiceTotals, aed, balanceDue } from "./calculations";
import { customerSnapshot } from "./customer-domain";
import { defaultCompany } from "../quotation/seed";

export function invoiceDetails(db: Database, i: Invoice) {
  return (
    i.snapshot || {
      customer: customerSnapshot(
        db.clients.find((c) => c.id === i.customerId)!,
      ),
      company: defaultCompany,
      project: db.projects.find((p) => p.id === i.projectId)?.name || "",
      quotation:
        db.quotations.find((q) => q.id === i.quotationId)?.number || "",
    }
  );
}
// Wrapped, paginated text shared by invoice and report downloads. No rasterized text.
export async function tabularPdf(
  title: string,
  subtitle: string,
  data: ReportData,
  filename?: string,
) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const ascii = (s: string) => s.replace(/[−–—]/g, "-");
  let logo: string | undefined;
  try {
    const response = await fetch("/assets/azzora-logo.png");
    if (response.ok) {
      const blob = await response.blob();
      logo = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
    }
  } catch {
    /* Brand text remains if a local logo cannot be read. */
  }
  const width = 515,
    left = 40,
    bottom = 785;
  let y = 0;
  const header = () => {
    doc.setTextColor("#9a3c25");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("AZZORA", left, 42);
    if (logo) doc.addImage(logo, "PNG", 523, 20, 26, 40);
    doc.setFontSize(13);
    doc.text(title, left, 70);
    doc.setTextColor("#6b6661");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const lines = doc.splitTextToSize(ascii(subtitle), 460);
    doc.text(lines, left, 87);
    y = 90 + lines.length * 10;
  };
  const ensure = (height: number) => {
    if (y + height > bottom) {
      doc.addPage();
      header();
      tableHeader();
    }
  };
  const colWidth = width / data.headers.length;
  const tableHeader = () => {
    doc.setFillColor("#f7f3f0");
    doc.rect(left, y, width, 34, "F");
    doc.setTextColor("#745a37");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    data.headers.forEach((h, j) =>
      doc.text(
        doc.splitTextToSize(h, colWidth - 10),
        left + j * colWidth + 4,
        y + 12,
      ),
    );
    y += 40;
  };
  header();
  tableHeader();
  doc.setFontSize(8);
  for (const row of data.rows) {
    const cells: string[][] = row.map((v) =>
      doc.splitTextToSize(ascii(v), colWidth - 10),
    );
    const count = Math.max(1, ...cells.map((c) => c.length));
    // Split unusually long cells across pages rather than clipping a single huge row.
    for (let offset = 0; offset < count;) {
      ensure(24);
      const take = Math.max(
        1,
        Math.min(count - offset, Math.floor((bottom - y - 10) / 11)),
      );
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor("#1c1b1a");
      cells.forEach((lines, j) => {
        const chunk = lines.slice(offset, offset + take);
        if (chunk.length) doc.text(chunk, left + j * colWidth + 4, y + 10);
      });
      y += take * 11 + 10;
      offset += take;
      doc.setDrawColor("#e6e2df");
      doc.line(left, y - 4, left + width, y - 4);
    }
  }
  const count = doc.getNumberOfPages();
  for (let page = 1; page <= count; page++) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor("#6b6661");
    doc.text(`AZZORA · Commercial record · ${page} / ${count}`, left, 818);
  }
  if (filename) doc.save(filename);
  return doc;
}
export async function invoicePdf(db: Database, i: Invoice, download = true) {
  const s = invoiceDetails(db, i),
    t = invoiceTotals(i);
  const rows = i.lines.map((l) => [l.description, l.quantity, l.rate, l.tax]);
  rows.push(
    ["Subtotal (entered line values)", "", "", aed(t.subtotal)],
    ["Discount", "", "", aed(t.discount)],
    ["Net amount", "", "", aed(t.net)],
    ["VAT " + i.vatPercentage + "%", "", "", aed(t.vat)],
    ["Grand total", "", "", aed(t.grand)],
    [
      "Amount paid",
      "",
      "",
      aed(i.status === "Issued" ? t.grand - balanceDue(db, i) : 0n),
    ],
    ["Balance due", "", "", aed(balanceDue(db, i))],
    ["Payment terms", "", "", i.terms],
    ["Notes", "", "", i.notes],
  );
  return tabularPdf(
    `${i.status === "Draft" ? "DRAFT " : i.status === "Cancelled" ? "CANCELLED " : ""}INVOICE ${i.number}`,
    `${s.company.name} · ${s.company.location}\n${s.company.email} · ${s.company.phone}\nBill to: ${s.customer.name} · ${s.customer.contact}\n${s.customer.address} · TRN: ${s.customer.trn || "Not supplied"}\n${s.customer.email} · ${s.customer.phone}\nDate: ${i.date} · Due: ${i.due}\nProject: ${s.project || "—"} · Quotation: ${s.quotation || "—"}`,
    {
      headers: ["Description", "Quantity", "Rate AED", "Tax / Total AED"],
      rows,
    },
    download ? i.number + ".pdf" : undefined,
  );
}
export function printInvoice(element: HTMLElement | null) {
  if (!element) throw Error("Invoice preview unavailable.");
  const popup = window.open("", "_blank");
  if (!popup) throw Error("Allow popups to print the invoice.");
  const style = popup.document.createElement("style");
  style.textContent =
    "body{font:12px Arial;color:#1c1b1a;padding:24px}h2{color:#9a3c25}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:10px;border-bottom:1px solid #e6e2df}.numeric{text-align:right}.between{display:flex;justify-content:space-between}img{width:40px}small{display:block;color:#6b6661}a{color:inherit;text-decoration:none}@page{size:A4;margin:15mm}tr{break-inside:avoid}thead{display:table-header-group}.table-scroll{overflow:visible}.preserve-lines{white-space:pre-wrap}";
  popup.document.head.append(style);
  popup.document.body.append(element.cloneNode(true));
  popup.document.title = "AZZORA Invoice";
  popup.focus();
  popup.print();
}
