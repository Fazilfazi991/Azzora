import { jsPDF } from "jspdf";
import { reviewSnapshot, type ReviewState } from "./domain.js";
const money = (fils: string) => {
  const n = BigInt(fils),
    a = n < 0n ? -n : n;
  return `${n < 0n ? "-" : ""}AED ${(a / 100n).toLocaleString("en-AE")}.${(a % 100n).toString().padStart(2, "0")}`;
};
export function reviewPdf(state: ReviewState, name: string): ArrayBuffer {
  const doc = new jsPDF({ format: "a4", unit: "mm" });
  const data = reviewSnapshot(state);
  let y = 48;
  function header(title: string) {
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
    const lines = doc.splitTextToSize(label, 115);
    const height = Math.max(9, lines.length * 5 + 3);
    if (y + height > 269) {
      doc.addPage();
      header(
        name === "pnl"
          ? "Profit & loss (continued)"
          : name === "balance"
            ? "Balance sheet (continued)"
            : "Demo invoice (continued)",
      );
      y = 48;
    }
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(10);
    doc.setTextColor(35);
    doc.text(lines, 18, y);
    if (value) doc.text(value, 192, y, { align: "right" });
    y += height;
  }
  if (name === "pnl") {
    header("Profit & loss");
    row(`Period ${data.period.from} to ${data.period.to}`);
    y += 4;
    row("Revenue", money(data.pnl.income.totalFils));
    row("Cost of sales", money(data.pnl.costOfSales.totalFils));
    row("Gross profit", money(data.pnl.grossProfitFils), true);
    y += 3;
    row("Operating expenses", money(data.pnl.expenses.totalFils));
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
    const invoice = data.invoices.find((item) => item.id === name);
    if (!invoice) throw Error("Demo invoice document was not found.");
    header(
      invoice.invoiceType === "Proforma"
        ? "Proforma - not a tax invoice"
        : invoice.invoiceType === "Normal Invoice"
          ? "Normal invoice"
          : "Tax invoice - demo",
    );
    row("Reference", invoice.id, true);
    row("Document type", invoice.invoiceType ?? "Tax Invoice");
    row("Status", invoice.status);
    row("Customer", invoice.party);
    row("Invoice date", invoice.date);
    row("Due date", invoice.due);
    y += 4;
    row(invoice.description, money(invoice.amountFils));
    row("VAT", "Not calculated in this demo");
    row("Total", money(invoice.amountFils), true);
    if (invoice.invoiceType !== "Proforma")
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
