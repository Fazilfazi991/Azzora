import { postJournal } from "../accounting/core.js";
import {
  buildBalanceSheet,
  buildGeneralLedger,
  buildProfitAndLoss,
  buildTrialBalance,
} from "../accounting/reports.js";
import type { AccountingState, JournalLine } from "../accounting/model";
import { saveDocumentDraft } from "./documents/review.js";
import type {
  DocumentEntryState,
  ReferenceCatalog,
  EntryFields,
} from "./documents/model";
import { catalogFor, categories } from "./documents/review.js";
import {
  documentAgeing,
  documentOutstanding,
  parseFils,
  postSettlement,
} from "../finance/settlement.js";
import type {
  PostedSettlement,
  SettlementDocument,
  SettlementEvent,
} from "../finance/settlement";

export interface ReviewDocument {
  id: string;
  party: string;
  date: string;
  due: string;
  description: string;
  amountFils: string;
  status: "Draft" | "Issued";
  category?: "Cost of Sales" | "Operating Expense";
  poReference?: string;
  attachmentId?: string;
}
export interface ReviewExpense {
  id: string;
  date: string;
  payee: string;
  description: string;
  amountFils: string;
  account: "bank" | "cash";
  attachmentId?: string;
}
export interface ReviewAttachment {
  id: string;
  name: string;
  mime: "application/pdf" | "image/png" | "image/jpeg";
  data: string;
  size: number;
}
export interface ReviewState {
  documentEntries?: DocumentEntryState;
  documentCatalog?: ReferenceCatalog;
  accounting: AccountingState;
  invoices: ReviewDocument[];
  bills: ReviewDocument[];
  receipts: SettlementEvent[];
  supplierPayments: SettlementEvent[];
  expenses: ReviewExpense[];
  attachments: ReviewAttachment[];
}

const zero = "0";
const line = (
  accountId: string,
  debit: bigint,
  credit: bigint,
): JournalLine => ({
  accountId,
  debitFils: debit.toString(),
  creditFils: credit.toString(),
});
const iso = (value: unknown): string => {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
  )
    throw Error("Enter a valid date.");
  return value;
};
const required = (value: unknown, label: string, max = 140): string => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    throw Error(`${label} is required (up to ${max} characters).`);
  return value.trim();
};
const positive = (value: unknown): bigint => {
  if (typeof value !== "string") throw Error("Enter a valid AED amount.");
  const amount = parseFils(value);
  if (amount <= 0n) throw Error("Amount must be greater than zero.");
  return amount;
};
const document = (
  item: ReviewDocument,
  side: "receivable" | "payable",
): SettlementDocument => ({
  id: item.id,
  side,
  partyId: item.party,
  issuedOn: item.date,
  dueOn: item.due,
  amountFils: BigInt(item.amountFils),
});
const stamp = (date: string) => `${date}T12:00:00.000Z`;
function journal(
  state: ReviewState,
  id: string,
  date: string,
  memo: string,
  lines: JournalLine[],
): void {
  state.accounting = postJournal(state.accounting, {
    id: `J-${id}`,
    postingKey: `review:${id}`,
    source: { kind: "Review", id, action: "Post" },
    date,
    recordedAt: stamp(date),
    memo,
    currency: "AED",
    lines,
  }).state;
}

export function createReviewState(): ReviewState {
  const accounting: AccountingState = {
    version: 1,
    accounts: [
      ["bank", "1000", "Business bank", "Asset"],
      ["cash", "1010", "Petty cash", "Asset"],
      ["receivables", "1100", "Accounts receivable", "Asset"],
      ["payables", "2100", "Accounts payable", "Liability"],
      ["capital", "3000", "Opening capital", "Equity"],
      ["revenue", "4000", "Design & build revenue", "Income"],
      ["cost", "5000", "Project cost of sales", "Cost of Sales"],
      ["operating", "6000", "Operating expenses", "Expense"],
    ].map(([id, code, name, type]) => ({
      id,
      code,
      name,
      type: type as AccountingState["accounts"][number]["type"],
      postable: true,
      status: "Active" as const,
    })),
    periods: [
      { id: "2026", start: "2026-01-01", end: "2026-12-31", status: "Open" },
    ],
    journals: [],
  };
  const state: ReviewState = {
    accounting,
    invoices: [
      {
        id: "INV-26041",
        party: "Sample Client A",
        date: "2026-08-31",
        due: "2026-08-31",
        description: "Apartment renovation milestone",
        amountFils: "1200000",
        status: "Issued",
      },
      {
        id: "INV-26042",
        party: "Sample Client A",
        date: "2026-10-10",
        due: "2026-10-10",
        description: "Fit-out progress milestone",
        amountFils: "800000",
        status: "Issued",
      },
    ],
    bills: [
      {
        id: "BILL-26031",
        party: "Sample Supplier B",
        date: "2026-10-12",
        due: "2026-10-15",
        description: "Project paint materials",
        amountFils: "800000",
        status: "Issued",
        category: "Cost of Sales",
        poReference: "DEMO-PO-31",
      },
      {
        id: "BILL-26032",
        party: "Sample Supplier C",
        date: "2026-10-16",
        due: "2026-10-30",
        description: "Office services",
        amountFils: "100000",
        status: "Issued",
        category: "Operating Expense",
        poReference: "DEMO-PO-32",
      },
    ],
    receipts: [],
    supplierPayments: [],
    expenses: [],
    attachments: [],
  };
  journal(state, "OPEN-001", "2026-01-01", "Fictional opening capital", [
    line("bank", 5000000n, 0n),
    line("capital", 0n, 5000000n),
  ]);
  for (const invoice of state.invoices)
    journal(state, invoice.id, invoice.date, `Invoice ${invoice.id}`, [
      line("receivables", BigInt(invoice.amountFils), 0n),
      line("revenue", 0n, BigInt(invoice.amountFils)),
    ]);
  for (const bill of state.bills)
    journal(state, bill.id, bill.date, `Purchase bill ${bill.id}`, [
      line(
        bill.category === "Cost of Sales" ? "cost" : "operating",
        BigInt(bill.amountFils),
        0n,
      ),
      line("payables", 0n, BigInt(bill.amountFils)),
    ]);
  const supplier: PostedSettlement = {
    type: "posted",
    id: "PAY-0031",
    postingKey: "review:PAY-0031",
    side: "payable",
    partyId: "Sample Supplier B",
    date: "2026-10-17",
    amountFils: 300000n,
    allocations: [{ documentId: "BILL-26031", amountFils: 300000n }],
  };
  state.supplierPayments = postSettlement(
    state.bills.map((item) => document(item, "payable")),
    [],
    supplier,
  );
  journal(state, supplier.id, supplier.date, "Supplier payment", [
    line("payables", 300000n, 0n),
    line("bank", 0n, 300000n),
  ]);
  const receipt: PostedSettlement = {
    type: "posted",
    id: "RCPT-0042",
    postingKey: "review:RCPT-0042",
    side: "receivable",
    partyId: "Sample Client A",
    date: "2026-10-21",
    amountFils: 500000n,
    allocations: [{ documentId: "INV-26042", amountFils: 500000n }],
  };
  state.receipts = postSettlement(
    state.invoices.map((item) => document(item, "receivable")),
    [],
    receipt,
  );
  journal(state, receipt.id, receipt.date, "Customer receipt", [
    line("bank", 500000n, 0n),
    line("receivables", 0n, 500000n),
  ]);
  return state;
}

export type ReviewAction =
  | {
      kind: "document-draft";
      id: string;
      reviewId: string;
      revision: number;
      fields: EntryFields;
      confirmed: true;
      rememberSupplier: boolean;
    }
  | {
      kind: "invoice";
      id: string;
      party: string;
      date: string;
      due: string;
      description: string;
      amount: string;
      issue: boolean;
    }
  | { kind: "issue-invoice"; id: string }
  | {
      kind: "bill";
      id: string;
      party: string;
      date: string;
      due: string;
      description: string;
      amount: string;
      category: "Cost of Sales" | "Operating Expense";
      poReference: string;
      attachment?: { name: string; mime: string; data: string };
    }
  | {
      kind: "receipt" | "supplier-payment";
      id: string;
      documentId: string;
      date: string;
      amount: string;
      account: "bank" | "cash";
    }
  | {
      kind: "expense";
      id: string;
      payee: string;
      date: string;
      description: string;
      amount: string;
      account: "bank" | "cash";
      attachment?: { name: string; mime: string; data: string };
    };

export function attachment(
  state: ReviewState,
  id: string,
  input: { name: string; mime: string; data: string } | undefined,
): string | undefined {
  if (!input) return undefined;
  const name = required(input.name, "File name", 120);
  if (
    !["application/pdf", "image/png", "image/jpeg"].includes(input.mime) ||
    typeof input.data !== "string" ||
    input.data.length > 2_800_000 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(input.data)
  )
    throw Error("Upload a PDF, PNG or JPEG under 2 MB.");
  const bytes = Uint8Array.from(atob(input.data), (char) => char.charCodeAt(0));
  const starts = (signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte);
  const signature =
    input.mime === "application/pdf"
      ? starts([37, 80, 68, 70, 45])
      : input.mime === "image/png"
        ? starts([137, 80, 78, 71, 13, 10, 26, 10])
        : starts([255, 216, 255]);
  if (!signature || bytes.length > 2_000_000 || bytes.length === 0)
    throw Error(
      "File content does not match the selected type or exceeds 2 MB.",
    );
  state.attachments.push({
    id,
    name,
    mime: input.mime as ReviewAttachment["mime"],
    data: input.data,
    size: bytes.length,
  });
  return id;
}

export function applyReviewAction(
  previous: ReviewState,
  action: ReviewAction,
): ReviewState {
  if (action.kind === "document-draft")
    return saveDocumentDraft(previous, action, new Date().toISOString());
  const next = structuredClone(previous);
  const id = required(action.id, "Action ID", 80);
  if (
    action.kind !== "issue-invoice" &&
    (next.invoices.some((item) => item.id === id) ||
      next.bills.some((item) => item.id === id) ||
      next.expenses.some((item) => item.id === id) ||
      [...next.receipts, ...next.supplierPayments].some(
        (item) => item.id === id,
      ))
  )
    throw Error("This action has already been recorded.");
  if (action.kind === "invoice") {
    const date = iso(action.date),
      due = iso(action.due),
      amount = positive(action.amount);
    if (due < date) throw Error("Due date cannot precede invoice date.");
    const invoice: ReviewDocument = {
      id,
      party: required(action.party, "Customer"),
      date,
      due,
      description: required(action.description, "Description"),
      amountFils: amount.toString(),
      status: action.issue ? "Issued" : "Draft",
    };
    next.invoices.push(invoice);
    if (action.issue)
      journal(next, id, date, `Invoice ${id}`, [
        line("receivables", amount, 0n),
        line("revenue", 0n, amount),
      ]);
  } else if (action.kind === "issue-invoice") {
    const invoice = next.invoices.find((item) => item.id === action.id);
    if (!invoice || invoice.status !== "Draft")
      throw Error("Only a draft invoice can be issued.");
    invoice.status = "Issued";
    journal(next, id, invoice.date, `Invoice ${id}`, [
      line("receivables", BigInt(invoice.amountFils), 0n),
      line("revenue", 0n, BigInt(invoice.amountFils)),
    ]);
  } else if (action.kind === "bill") {
    const date = iso(action.date),
      due = iso(action.due),
      amount = positive(action.amount);
    if (due < date) throw Error("Due date cannot precede bill date.");
    if (!["Cost of Sales", "Operating Expense"].includes(action.category))
      throw Error("Choose a bill category.");
    const item: ReviewDocument = {
      id,
      party: required(action.party, "Supplier"),
      date,
      due,
      description: required(action.description, "Description"),
      amountFils: amount.toString(),
      status: "Issued",
      category: action.category,
      poReference: required(action.poReference, "Demo purchase reference"),
      attachmentId: attachment(next, `${id}-file`, action.attachment),
    };
    next.bills.push(item);
    journal(next, id, date, `Purchase bill ${id}`, [
      line(
        action.category === "Cost of Sales" ? "cost" : "operating",
        amount,
        0n,
      ),
      line("payables", 0n, amount),
    ]);
  } else if (action.kind === "receipt" || action.kind === "supplier-payment") {
    const date = iso(action.date),
      amount = positive(action.amount);
    if (!["bank", "cash"].includes(action.account))
      throw Error("Choose bank or cash.");
    const receivable = action.kind === "receipt";
    const source = receivable ? next.invoices : next.bills;
    const selected = source.find(
      (item) => item.id === action.documentId && item.status === "Issued",
    );
    if (!selected) throw Error("Choose an issued document.");
    const event: PostedSettlement = {
      type: "posted",
      id,
      postingKey: `review:${id}`,
      side: receivable ? "receivable" : "payable",
      partyId: selected.party,
      date,
      amountFils: amount,
      allocations: [{ documentId: selected.id, amountFils: amount }],
    };
    const events = receivable ? next.receipts : next.supplierPayments;
    const posted = postSettlement(
      source
        .filter((item) => item.status === "Issued")
        .map((item) => document(item, receivable ? "receivable" : "payable")),
      events,
      event,
    );
    if (receivable) next.receipts = posted;
    else next.supplierPayments = posted;
    journal(
      next,
      id,
      date,
      receivable
        ? `Customer receipt for ${selected.id}`
        : `Supplier payment for ${selected.id}`,
      receivable
        ? [line(action.account, amount, 0n), line("receivables", 0n, amount)]
        : [line("payables", amount, 0n), line(action.account, 0n, amount)],
    );
  } else if (action.kind === "expense") {
    const date = iso(action.date),
      amount = positive(action.amount);
    if (!["bank", "cash"].includes(action.account))
      throw Error("Choose bank or cash.");
    next.expenses.push({
      id,
      date,
      payee: required(action.payee, "Payee"),
      description: required(action.description, "Description"),
      amountFils: amount.toString(),
      account: action.account,
      attachmentId: attachment(next, `${id}-file`, action.attachment),
    });
    journal(next, id, date, `Paid operating expense ${id}`, [
      line("operating", amount, 0n),
      line(action.account, 0n, amount),
    ]);
  }
  return next;
}

export function reviewSnapshot(state: ReviewState, asOf = "2026-10-22") {
  iso(asOf);
  const from = `${asOf.slice(0, 4)}-01-01`;
  const pnl = buildProfitAndLoss(state.accounting, from, asOf);
  const balance = buildBalanceSheet(state.accounting, asOf);
  const trial = buildTrialBalance(state.accounting, asOf);
  const invoiceRows = state.invoices.map((item) => ({
    ...item,
    outstandingFils:
      item.status === "Issued"
        ? documentOutstanding(
            document(item, "receivable"),
            state.receipts,
            asOf,
          ).toString()
        : zero,
    ageing:
      item.status === "Issued"
        ? {
            ...documentAgeing(
              document(item, "receivable"),
              state.receipts,
              asOf,
            ),
            outstandingFils: documentOutstanding(
              document(item, "receivable"),
              state.receipts,
              asOf,
            ).toString(),
          }
        : null,
  }));
  const billRows = state.bills.map((item) => ({
    ...item,
    outstandingFils: documentOutstanding(
      document(item, "payable"),
      state.supplierPayments,
      asOf,
    ).toString(),
    ageing: {
      ...documentAgeing(
        document(item, "payable"),
        state.supplierPayments,
        asOf,
      ),
      outstandingFils: documentOutstanding(
        document(item, "payable"),
        state.supplierPayments,
        asOf,
      ).toString(),
    },
  }));
  const receivables = invoiceRows.reduce(
    (sum, item) => sum + BigInt(item.outstandingFils),
    0n,
  );
  const payables = billRows.reduce(
    (sum, item) => sum + BigInt(item.outstandingFils),
    0n,
  );
  const balanceOf = (id: string) =>
    BigInt(
      trial.rows.find((item) => item.accountId === id)?.signedBalanceFils ||
        zero,
    );
  if (
    !balance.balanced ||
    !trial.balanced ||
    receivables !== balanceOf("receivables") ||
    payables !== -balanceOf("payables")
  )
    throw Error("Demo statements and open documents do not reconcile.");
  return {
    documentEntries: state.documentEntries ?? {
      version: 1 as const,
      reviews: [],
      defaults: [],
    },
    documentCatalog: catalogFor(state),
    documentCategories: categories,
    asOf,
    period: { from, to: asOf },
    metrics: {
      revenueFils: pnl.income.totalFils,
      costOfSalesFils: pnl.costOfSales.totalFils,
      operatingExpensesFils: pnl.expenses.totalFils,
      grossProfitFils: pnl.grossProfitFils,
      netProfitFils: pnl.netProfitFils,
      receivablesFils: receivables.toString(),
      payablesFils: payables.toString(),
      bankFils: balanceOf("bank").toString(),
      cashFils: balanceOf("cash").toString(),
    },
    invoices: invoiceRows,
    bills: billRows,
    expenses: state.expenses,
    receipts: state.receipts
      .filter((item): item is PostedSettlement => item.type === "posted")
      .map((item) => ({
        id: item.id,
        date: item.date,
        documentId: item.allocations[0].documentId,
        amountFils: item.amountFils.toString(),
      })),
    supplierPayments: state.supplierPayments
      .filter((item): item is PostedSettlement => item.type === "posted")
      .map((item) => ({
        id: item.id,
        date: item.date,
        documentId: item.allocations[0].documentId,
        amountFils: item.amountFils.toString(),
      })),
    accounts: state.accounting.accounts,
    ledger: state.accounting.accounts.map((account) =>
      buildGeneralLedger(state.accounting, account.id, from, asOf),
    ),
    pnl,
    balance,
    trial,
  };
}
