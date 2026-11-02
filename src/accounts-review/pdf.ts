import { jsPDF } from "jspdf";
import { reviewSnapshot, type ReviewState } from "./domain.js";
import type { ReviewStoredLine } from "./item-lines";
import type { ReviewReportSelection } from "./reporting";
const money = (fils: string) => {
  const n = BigInt(fils),
    a = n < 0n ? -n : n;
  return `${n < 0n ? "-" : ""}AED ${(a / 100n).toLocaleString("en-AE")}.${(a % 100n).toString().padStart(2, "0")}`;
};
export function reviewPdf(
  state: ReviewState,
  name: string,
  selection?: ReviewReportSelection,
): ArrayBuffer {
  const doc = new jsPDF({ format: "a4", unit: "mm" });
  const data = reviewSnapshot(
    state,
    selection?.asOf,
    selection ? { from: selection.from, to: selection.to } : undefined,
  );
  let y = 48;
  let pageTitle = "Demo document";
  function header(title: string) {
    pageTitle = title.replace(" (continued)", "");
    doc.setTextColor(120, 45, 25);
    doc.setFontSize(18);
    doc.text("AZZORA Accounts", 18, 20);
    doc.setFontSize(10);
    doc.text(title, 18, 29);
    doc.setTextColor(70);
    doc.setFontSize(8);
    doc.text(
      "FICTIONAL CLIENT REVIEW - NOT A TAX OR PRODUCTION ACCOUNTING DOCUMENT",
      18,
      37,
    );
  }
  function row(label: string, value = "", bold = false) {
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(label, 92);
    const values = doc.splitTextToSize(value, 76);
    const height = Math.max(9, Math.max(lines.length, values.length) * 5 + 3);
    if (y + height > 269) {
      doc.addPage();
      header(
        name === "pnl"
          ? "Profit & loss (continued)"
          : name === "balance"
            ? "Balance sheet (continued)"
            : pageTitle + " (continued)",
      );
      y = 48;
    }
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(10);
    doc.setTextColor(35);
    doc.text(lines, 18, y);
    if (value) doc.text(values, 192, y, { align: "right" });
    y += height;
  }
  function tableHeader() {
    doc.setFillColor(242, 240, 237);
    doc.rect(18, y - 4, 174, 9, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(60);
    ["#", "Description", "Qty", "Unit", "Rate", "Amount"].forEach(
      (label, index) =>
        doc.text(label, [20, 28, 124, 137, 164, 190][index], y + 1, {
          align: index >= 2 ? "right" : "left",
        }),
    );
    y += 10;
  }
  function itemTable(items: ReviewStoredLine[]) {
    if (y + 25 > 265) {
      doc.addPage();
      header(pageTitle + " (continued)");
      y = 48;
    }
    items.forEach((item, index) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      const cells: string[][] = [
        [String(index + 1)],
        doc.splitTextToSize(
          item.description + (item.details ? "\nDetails: " + item.details : ""),
          75,
        ),
        doc.splitTextToSize(item.quantity, 18),
        doc.splitTextToSize(item.unit, 12),
        doc.splitTextToSize(item.rate, 24),
        doc.splitTextToSize(money(item.amountFils).replace("AED ", ""), 24),
      ];
      const height = Math.max(
        10,
        Math.max(...cells.map((cell) => cell.length)) * 4 + 5,
      );
      function nextTablePage() {
        doc.addPage();
        header(pageTitle + " (continued)");
        y = 48;
        tableHeader();
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
      }
      if (index === 0) {
        if (height <= 207 && y + 10 + height > 265) {
          doc.addPage();
          header(pageTitle + " (continued)");
          y = 48;
        }
        tableHeader();
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
      }
      if (height <= 207 && y + height > 265) nextTablePage();
      const lineCount = Math.max(...cells.map((cell) => cell.length));
      let offset = 0;
      while (offset < lineCount) {
        const available = Math.floor((265 - y - 5) / 4);
        if (available < 1) {
          nextTablePage();
          continue;
        }
        const count = Math.min(available, lineCount - offset);
        const chunkHeight = Math.max(10, count * 4 + 5);
        doc.setTextColor(35);
        cells.forEach((cell, column) => {
          const chunk =
            column === 0
              ? [String(index + 1) + (offset ? "*" : "")]
              : cell.slice(offset, offset + count);
          if (chunk.length)
            doc.text(chunk, [20, 28, 124, 137, 164, 190][column], y, {
              align: column >= 2 ? "right" : "left",
            });
        });
        doc.setDrawColor(220);
        doc.line(18, y + chunkHeight - 5, 192, y + chunkHeight - 5);
        y += chunkHeight;
        offset += count;
        if (offset < lineCount) nextTablePage();
      }
    });
    y += 4;
  }
  if (name === "pnl") {
    header("Profit & loss");
    row(`Period ${data.period.from} to ${data.period.to}`);
    y += 4;
    row("Revenue", money(data.pnl.income.totalFils));
    row("Cost of sales", money(data.pnl.costOfSales.totalFils));
    for (const account of data.pnl.costOfSales.rows.filter(
      (account) => account.normalBalanceFils !== "0",
    ))
      row(
        account.code + " - " + account.name,
        money(account.normalBalanceFils),
      );
    row("Gross profit", money(data.pnl.grossProfitFils), true);
    y += 3;
    row("Operating expenses", money(data.pnl.expenses.totalFils));
    for (const account of data.pnl.expenses.rows.filter(
      (account) => account.normalBalanceFils !== "0",
    ))
      row(
        account.code + " - " + account.name,
        money(account.normalBalanceFils),
      );
    row("Net profit", money(data.pnl.netProfitFils), true);
  } else if (name === "balance") {
    header("Balance sheet");
    row(`As of ${data.asOf}`);
    y += 4;
    for (const [title, section] of [
      ["Assets", data.balance.assets],
      ["Liabilities", data.balance.liabilities],
      ["Equity", data.balance.equity],
    ] as const) {
      row(title, money(section.totalFils), true);
      for (const account of section.rows)
        row(
          `${account.code} - ${account.name}`,
          money(account.normalBalanceFils),
        );
      y += 3;
    }
    row("Current earnings", money(data.balance.currentEarningsFils));
    row(
      "Liabilities and equity",
      money(data.balance.liabilitiesAndEquityFils),
      true,
    );
    row("Reconciliation difference", money(data.balance.differenceFils), true);
  } else {
    const bill = data.bills.find((item) => item.id === name);
    const invoice = data.invoices.find((item) => item.id === name) || bill;
    if (!invoice) throw Error("Demo invoice or bill document was not found.");
    header(
      bill
        ? "Purchase bill - demo"
        : invoice.invoiceType === "Proforma"
          ? "Proforma - not a tax invoice"
          : invoice.invoiceType === "Normal Invoice"
            ? "Normal invoice"
            : "Tax invoice - demo",
    );
    row("Reference", invoice.id, true);
    row(
      "Document type",
      bill ? "Purchase bill" : (invoice.invoiceType ?? "Tax Invoice"),
    );
    row("Status", invoice.status);
    row(bill ? "Supplier" : "Customer", invoice.party);
    row(bill ? "Bill date" : "Invoice date", invoice.date);
    row("Due date", invoice.due);
    if (invoice.projectId)
      row(
        "Project",
        data.documentCatalog.projects.find(
          (project) => project.id === invoice.projectId,
        )?.name || invoice.projectId,
      );
    if (bill?.poReference) row("PO reference", bill.poReference);
    if (bill?.invoiceReference)
      row("Supplier invoice number", bill.invoiceReference);
    y += 4;
    if (invoice.items) {
      itemTable(invoice.items);
      row("Subtotal", money(invoice.subtotalFils || invoice.amountFils));
      row("VAT - policy pending", money(invoice.taxFils || "0"));
      row("Grand total", money(invoice.amountFils), true);
      row("Tax policy", "Not applied in this fictional review");
    } else {
      row(invoice.description, money(invoice.amountFils));
      row("VAT", "Not calculated in this demo");
      row("Total", money(invoice.amountFils), true);
    }
    if (invoice.status === "Draft")
      row("Accounting", "Draft - no financial posting");
    else if (invoice.invoiceType !== "Proforma")
      row("Open balance as of " + data.asOf, money(invoice.outstandingFils));
    else row("Accounting", "No revenue or receivable posting");
  }
  for (let page = 1; page <= doc.getNumberOfPages(); page++) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(
      "Synthetic demonstration only. No real records or money movement.",
      18,
      282,
    );
    doc.text(`Page ${page} of ${doc.getNumberOfPages()}`, 192, 282, {
      align: "right",
    });
  }
  return doc.output("arraybuffer");
}
