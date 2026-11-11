import { addAccount, addPeriod, emptyAccounting } from "../accounting/core.js";
import type { Account, AccountingPeriod } from "../accounting/model.js";
import type { ReviewState } from "../accounts-review/domain.js";
import type { Database, Person } from "../domain/model.js";
import type {
  OperationalData,
  OperationalSettings,
} from "../operations/model.js";
import type { SharedCompanyState } from "../staging/domain.js";

/** No seed import, fictitious party/account, automatic opening balance or historical journal. */
export function createEmptyProductionFinance(
  setup: {
    accounts?: readonly Account[];
    periods?: readonly AccountingPeriod[];
  } = {},
): ReviewState {
  let accounting = emptyAccounting();
  for (const account of setup.accounts || [])
    accounting = addAccount(accounting, structuredClone(account));
  for (const period of setup.periods || [])
    accounting = addPeriod(accounting, structuredClone(period));
  return {
    accounting,
    invoices: [],
    bills: [],
    receipts: [],
    supplierPayments: [],
    expenses: [],
    attachments: [],
    cashAccounts: [],
    transfers: [],
    settlementDetails: [],
    expenseLedgers: [],
    commercialAdjustments: [],
    documentEntries: { version: 1, reviews: [], defaults: [] },
    documentCatalog: {
      suppliers: [],
      customers: [],
      projects: [],
      products: [],
    },
  };
}
/** Explicit structural workspace preparation; supplying settings is NOT policy/cutover approval. */
export function createEmptyProductionCompany(setup: {
  settings: OperationalSettings;
  people?: Person[];
  accounts?: readonly Account[];
  periods?: readonly AccountingPeriod[];
}): SharedCompanyState {
  if (!setup.settings.company.name.trim() || setup.settings.currency !== "AED")
    throw Error(
      "Explicit company settings and supported currency are required.",
    );
  const operations: OperationalData = {
    version: 1,
    suppliers: [],
    variations: [],
    materials: [],
    requests: [],
    rfqs: [],
    quotes: [],
    orders: [],
    deliveries: [],
    bills: [],
    supplierPayments: [],
    credits: [],
    refunds: [],
    budgets: [],
    approvals: [],
    closures: [],
    settings: structuredClone(setup.settings),
  };
  const manager: Database = {
    version: 1,
    people: structuredClone(setup.people || []),
    clients: [],
    projects: [],
    phases: [],
    assignments: [],
    tasks: [],
    milestones: [],
    updates: [],
    snags: [],
    documents: [],
    handover: [],
    activities: [],
    quotations: [],
    invoices: [],
    payments: [],
    expenses: [],
    contracts: [],
    planningVersion: 1,
    planning: [],
    commercialVersion: 1,
    commercialNumbering: { customer: 1, invoice: 1, receipt: 1, expense: 1 },
    quotationNumbering: { prefix: "", next: 1 },
    operations,
  };
  return {
    version: 1,
    mode: "production",
    manager,
    finance: createEmptyProductionFinance(setup),
    expenseSubmissions: [],
  };
}
