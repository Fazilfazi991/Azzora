// Fictional design data only. No CRM records, browser storage, or posting APIs are read.
export const asOf = "21 October 2026";
export const activityPeriod = "1 January–21 October 2026";

export const invoices = [
  { id: "INV-26041", party: "Sample Client A", issued: "31 Aug 2026", due: "31 Aug 2026", dueISO: "2026-08-31", gross: 1200000, paid: 0 },
  { id: "INV-26042", party: "Sample Client A", issued: "10 Oct 2026", due: "10 Oct 2026", dueISO: "2026-10-10", gross: 800000, paid: 500000 },
];

export const bills = [
  { id: "BILL-26031", party: "Sample Supplier B", category: "Project cost of sales", issued: "12 Oct 2026", due: "15 Oct 2026", dueISO: "2026-10-15", gross: 800000, paid: 300000 },
  { id: "BILL-26032", party: "Sample Supplier C", category: "Operating expense", issued: "16 Oct 2026", due: "30 Oct 2026", dueISO: "2026-10-30", gross: 100000, paid: 0 },
];

export function overdueDays(dueISO, asOfISO = "2026-10-21") {
  const due = Date.parse(`${dueISO}T00:00:00Z`);
  const asOfDate = Date.parse(`${asOfISO}T00:00:00Z`);
  if (!Number.isFinite(due) || !Number.isFinite(asOfDate)) throw new Error("Invalid fictional aging date");
  return Math.max(0, Math.floor((asOfDate - due) / 86_400_000));
}

export const accounts = {
  bank: { code: "1000", label: "Business bank", type: "asset" },
  cash: { code: "1010", label: "Petty cash", type: "asset" },
  receivables: { code: "1100", label: "Accounts receivable", type: "asset" },
  payables: { code: "2100", label: "Accounts payable", type: "liability" },
  capital: { code: "3000", label: "Opening capital", type: "equity" },
  revenue: { code: "4000", label: "Design & build revenue", type: "income" },
  cost: { code: "5000", label: "Project cost of sales", type: "cost" },
  operating: { code: "6000", label: "Operating expenses", type: "expense" },
};

export const journals = [
  { date: "01 Jan 2026", reference: "OPEN-001", description: "Opening capital", lines: [{ account: "bank", debit: 5000000 }, { account: "capital", credit: 5000000 }] },
  { date: "31 Aug 2026", reference: "INV-26041", description: "Issued invoice · Sample Client A", lines: [{ account: "receivables", debit: 1200000 }, { account: "revenue", credit: 1200000 }] },
  { date: "10 Oct 2026", reference: "INV-26042", description: "Issued invoice · Sample Client A", lines: [{ account: "receivables", debit: 800000 }, { account: "revenue", credit: 800000 }] },
  { date: "12 Oct 2026", reference: "BILL-26031", description: "Project supplier bill", lines: [{ account: "cost", debit: 800000 }, { account: "payables", credit: 800000 }] },
  { date: "16 Oct 2026", reference: "BILL-26032", description: "Company operating bill", lines: [{ account: "operating", debit: 100000 }, { account: "payables", credit: 100000 }] },
  { date: "17 Oct 2026", reference: "PAY-0031", description: "Supplier payment · Sample Supplier B", lines: [{ account: "payables", debit: 300000 }, { account: "bank", credit: 300000 }] },
  { date: "21 Oct 2026", reference: "RCPT-0042", description: "Customer receipt · Sample Client A", lines: [{ account: "bank", debit: 500000 }, { account: "receivables", credit: 500000 }] },
];

export function deriveFixture() {
  const balances = Object.fromEntries(Object.keys(accounts).map(key => [key, 0]));
  let debitTotal = 0;
  let creditTotal = 0;
  for (const journal of journals) {
    const debit = journal.lines.reduce((sum, line) => sum + (line.debit || 0), 0);
    const credit = journal.lines.reduce((sum, line) => sum + (line.credit || 0), 0);
    if (debit !== credit || debit <= 0) throw new Error(`Unbalanced fictional journal ${journal.reference}`);
    debitTotal += debit;
    creditTotal += credit;
    for (const line of journal.lines) {
      if (!accounts[line.account] || (line.debit || 0) < 0 || (line.credit || 0) < 0 || Boolean(line.debit) === Boolean(line.credit)) {
        throw new Error(`Invalid fictional journal line ${journal.reference}`);
      }
      balances[line.account] += (line.debit || 0) - (line.credit || 0);
    }
  }
  const revenue = -balances.revenue;
  const costOfSales = balances.cost;
  const operatingExpenses = balances.operating;
  const grossProfit = revenue - costOfSales;
  const netProfit = grossProfit - operatingExpenses;
  const bank = balances.bank;
  const cash = balances.cash;
  const bankAndCash = bank + cash;
  const receivables = balances.receivables;
  const payables = -balances.payables;
  const capital = -balances.capital;
  const assets = bankAndCash + receivables;
  const liabilitiesAndEquity = payables + capital + netProfit;
  if (assets !== liabilitiesAndEquity) throw new Error("Fictional balance sheet does not reconcile");
  if (receivables !== invoices.reduce((sum, row) => sum + row.gross - row.paid, 0)) throw new Error("Fictional AR does not reconcile");
  if (payables !== bills.reduce((sum, row) => sum + row.gross - row.paid, 0)) throw new Error("Fictional AP does not reconcile");
  return { balances, debitTotal, creditTotal, revenue, costOfSales, operatingExpenses, grossProfit, netProfit, bank, cash, bankAndCash, receivables, payables, capital, assets, liabilitiesAndEquity };
}

export const fixture = deriveFixture();
