import { addAccount, addPeriod, emptyAccounting, postJournal } from "./core";
import type { AccountingState, JournalLine } from "./model";
import {
  buildBalanceSheet,
  buildGeneralLedger,
  buildProfitAndLoss,
  buildTrialBalance,
} from "./reports";
import type { AccountantDemoReports, LegacyArApView, LegacyOutstandingRow } from "./AccountantWorkspace";
import {
  documentAgeing,
  postSettlement,
  type PostedSettlement,
  type SettlementDocument,
  type SettlementEvent,
} from "../finance/settlement";
import {
  createExpenseDraft,
  submitExpense,
  type ExpenseSubmission,
  type ExpenseCategoryMapping,
  type ExpenseAccountReference,
} from "../finance/expense-submissions";
import {
  addCatalogProduct,
  emptyProductPrices,
  purchasePriceAlert,
  recordPurchasePrice,
  type PriceChangeAlert,
  type PurchasePriceInput,
} from "../finance/product-prices";

export interface ClientDemoScenario {
  readonly asOf: string;
  readonly arAp: LegacyArApView;
  readonly reports: AccountantDemoReports;
  readonly expenses: readonly ExpenseSubmission[];
  readonly expenseCategories: readonly ExpenseCategoryMapping[];
  readonly priceAlert: PriceChangeAlert;
  readonly customerReceipt: PostedSettlement;
  readonly supplierPayments: readonly PostedSettlement[];
}

const asOf = "2026-10-21";
const debit = (accountId: string, amount: string): JournalLine => ({ accountId, debitFils: amount, creditFils: "0" });
const credit = (accountId: string, amount: string): JournalLine => ({ accountId, debitFils: "0", creditFils: amount });

function scenarioDocuments() {
  const documents: SettlementDocument[] = [
    { id: "demo:invoice-older", side: "receivable", partyId: "demo:customer", issuedOn: "2026-08-01", dueOn: "2026-08-31", amountFils: 1_200_000n },
    { id: "demo:invoice-newer", side: "receivable", partyId: "demo:customer", issuedOn: "2026-09-20", dueOn: "2026-10-10", amountFils: 800_000n },
    { id: "demo:bill-older", side: "payable", partyId: "demo:supplier", issuedOn: "2026-09-01", dueOn: "2026-09-30", amountFils: 600_000n },
    { id: "demo:bill-newer", side: "payable", partyId: "demo:supplier", issuedOn: "2026-10-01", dueOn: "2026-10-31", amountFils: 300_000n },
  ];
  const customerReceipt: PostedSettlement = {
    type: "posted", id: "demo:receipt-newer", postingKey: "demo:receipt-newer", side: "receivable",
    partyId: "demo:customer", date: "2026-10-12", amountFils: 500_000n,
    allocations: [{ documentId: "demo:invoice-newer", amountFils: 500_000n }],
  };
  const supplierPayments: PostedSettlement[] = [
    { type: "posted", id: "demo:payment-older", postingKey: "demo:payment-older", side: "payable", partyId: "demo:supplier", date: "2026-10-14", amountFils: 200_000n, allocations: [{ documentId: "demo:bill-older", amountFils: 200_000n }] },
    { type: "posted", id: "demo:payment-newer", postingKey: "demo:payment-newer", side: "payable", partyId: "demo:supplier", date: "2026-10-15", amountFils: 100_000n, allocations: [{ documentId: "demo:bill-newer", amountFils: 100_000n }] },
  ];
  let events: SettlementEvent[] = [];
  for (const payment of [customerReceipt, ...supplierPayments])
    events = postSettlement(documents, events, payment);
  const rows = documents.map((document): LegacyOutstandingRow => {
    const age = documentAgeing(document, events, asOf);
    return {
      documentId: document.id,
      number: ({
        "demo:invoice-older": "DEMO-INV-01",
        "demo:invoice-newer": "DEMO-INV-02",
        "demo:bill-older": "DEMO-BILL-01",
        "demo:bill-newer": "DEMO-BILL-02",
      } as Record<string, string>)[document.id],
      partyName: document.side === "receivable" ? "Demo Client A" : "Demo Supplier B",
      due: document.dueOn,
      bucket: age.bucket,
      outstandingFils: age.outstandingFils.toString(),
    };
  });
  const arAp: LegacyArApView = {
    asOf,
    receivables: rows.filter((row) => row.documentId.startsWith("demo:invoice")),
    payables: rows.filter((row) => row.documentId.startsWith("demo:bill")),
    limitations: [],
  };
  return { arAp, customerReceipt, supplierPayments };
}

function scenarioAccounting(): AccountingState {
  let state = addPeriod(emptyAccounting(), { id: "demo:period-2026", start: "2026-01-01", end: "2026-12-31", status: "Open" });
  for (const [id, code, name, type] of [
    ["demo:bank", "1010", "Demo operating bank", "Asset"],
    ["demo:ar", "1100", "Demo receivables", "Asset"],
    ["demo:ap", "2100", "Demo payables", "Liability"],
    ["demo:capital", "3100", "Demo opening capital", "Equity"],
    ["demo:revenue", "4100", "Demo fit-out revenue", "Income"],
    ["demo:cost", "5100", "Demo materials cost", "Cost of Sales"],
  ] as const)
    state = addAccount(state, { id, code, name, type, postable: true, status: "Active" });
  const entries: { id: string; date: string; memo: string; lines: JournalLine[] }[] = [
    { id: "opening", date: "2026-01-01", memo: "Illustrative opening balance", lines: [debit("demo:bank", "5000000"), credit("demo:capital", "5000000")] },
    { id: "invoice-older", date: "2026-08-01", memo: "Demo invoice 01", lines: [debit("demo:ar", "1200000"), credit("demo:revenue", "1200000")] },
    { id: "invoice-newer", date: "2026-09-20", memo: "Demo invoice 02", lines: [debit("demo:ar", "800000"), credit("demo:revenue", "800000")] },
    { id: "bill-older", date: "2026-09-01", memo: "Demo supplier bill 01", lines: [debit("demo:cost", "600000"), credit("demo:ap", "600000")] },
    { id: "bill-newer", date: "2026-10-01", memo: "Demo supplier bill 02", lines: [debit("demo:cost", "300000"), credit("demo:ap", "300000")] },
    { id: "receipt-newer", date: "2026-10-12", memo: "Receipt allocated only to demo invoice 02", lines: [debit("demo:bank", "500000"), credit("demo:ar", "500000")] },
    { id: "payment-older", date: "2026-10-14", memo: "Partial settlement of demo bill 01", lines: [debit("demo:ap", "200000"), credit("demo:bank", "200000")] },
    { id: "payment-newer", date: "2026-10-15", memo: "Partial settlement of demo bill 02", lines: [debit("demo:ap", "100000"), credit("demo:bank", "100000")] },
  ];
  for (const entry of entries)
    state = postJournal(state, {
      id: `demo:${entry.id}`, postingKey: `demo:${entry.id}`,
      source: { kind: "Synthetic Fixture", id: `demo:${entry.id}`, action: "Post" },
      date: entry.date, recordedAt: `${entry.date}T12:00:00.000Z`, memo: entry.memo,
      currency: "AED", lines: entry.lines,
    }).state;
  return state;
}

function scenarioExpenses() {
  const expenseCategories: ExpenseCategoryMapping[] = [
    { id: "demo:materials", name: "Project materials", expenseAccountId: "demo:cost", allowedScopes: ["project"], active: true },
    { id: "demo:site-consumables", name: "Site consumables", expenseAccountId: "demo:expense", allowedScopes: ["project"], active: true },
  ];
  const accounts: ExpenseAccountReference[] = [
    { id: "demo:cost", classification: "Cost of Sales", active: true },
    { id: "demo:expense", classification: "Expense", active: true },
  ];
  const inputs = [
    { id: "demo:expense-1", categoryId: "demo:materials", payee: "Demo Supplier B", description: "Sample paint materials", amountFils: "12500" },
    { id: "demo:expense-2", categoryId: "demo:site-consumables", payee: "Demo Supplier C", description: "Sample site consumables", amountFils: "7500" },
  ];
  const expenses = inputs.map((input): ExpenseSubmission => {
    const draft = createExpenseDraft({
      ...input, scope: "project", projectId: "demo:project", currency: "AED", vatFils: "0",
      expenseDate: asOf, createdBy: "demo:site-requester",
      receipts: [{ id: `${input.id}:receipt`, name: "demo-receipt.jpg", mimeType: "image/jpeg", sizeBytes: 1000 }],
    }, "2026-10-21T08:00:00.000Z");
    return submitExpense(draft, expenseCategories, accounts, "2026-10-21T09:00:00.000Z");
  });
  return { expenses, expenseCategories };
}

function scenarioPriceAlert(): PriceChangeAlert {
  const product = { id: "demo:product", sku: "DEMO-PAINT-01", name: "Sample paint tin", comparisonUnit: "each" };
  const prior: PurchasePriceInput = {
    id: "demo:price-1", productId: product.id, supplierId: "demo:supplier",
    sourceDocumentId: "demo:bill-older", sourceLineId: "demo:line-1", purchaseDate: "2026-09-01",
    currency: "AED", unit: "each", taxBasis: "exclusive-sample", quantityUnits: "1",
    subtotalMinor: "500", discountMinor: "0", vatMinor: "0",
  };
  const current: PurchasePriceInput = {
    ...prior, id: "demo:price-2", sourceDocumentId: "demo:bill-newer",
    sourceLineId: "demo:line-2", purchaseDate: "2026-10-01", subtotalMinor: "600",
  };
  const state = recordPurchasePrice(addCatalogProduct(emptyProductPrices(), product), prior);
  return purchasePriceAlert(state, current);
}

/** Deterministic, in-memory fixture. Never imports or writes CRM/browser records. */
export function buildClientDemoScenario(): ClientDemoScenario {
  const { arAp, customerReceipt, supplierPayments } = scenarioDocuments();
  const accounting = scenarioAccounting();
  const from = "2026-01-01";
  const reports: AccountantDemoReports = {
    provenance: "Synthetic fixture",
    trialBalance: buildTrialBalance(accounting, asOf),
    profitAndLoss: buildProfitAndLoss(accounting, from, asOf),
    balanceSheet: buildBalanceSheet(accounting, asOf),
    generalLedgers: accounting.accounts.filter((account) => account.postable)
      .map((account) => buildGeneralLedger(accounting, account.id, from, asOf)),
  };
  return {
    asOf, arAp, reports, customerReceipt, supplierPayments,
    ...scenarioExpenses(), priceAlert: scenarioPriceAlert(),
  };
}
