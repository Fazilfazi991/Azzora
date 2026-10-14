import type { Database } from "../domain/model";
import type { OperationalData, OperationalSettings } from "./model";
export function emptyOperations(): OperationalData {
  const prefixes = {
    variation: "VO-",
    po: "PO-",
    credit: "CN-",
    supplier: "SUP-",
    material: "MR-",
    request: "PR-",
    rfq: "RFQ-",
    quote: "SQ-",
    delivery: "GRN-",
    bill: "BILL-",
    supplierPayment: "SP-",
    refund: "REF-",
  };
  return {
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
    settings: {
      company: {
        name: "AZZORA DESIGN TECHNICAL SERVICES LLC",
        tradingName: "AZZORA",
        location: "Dubai, UAE",
        phone: "+971 56 333 9288",
        email: "info@azzora.ae",
        website: "",
        trn: "",
        logo: "/assets/azzora-logo.png",
        bank: "",
        invoiceTerms: "",
      },
      invoicePrefix: "INV-",
      currency: "AED",
      vatPercentage: "5",
      tax: "Exclusive",
      fiscalYearStart: "01-01",
      paymentDays: 30,
      blockOperationalForFinance: false,
      retentionPercentage: "0",
      numbering: Object.fromEntries(
        Object.entries(prefixes).map(([key, prefix]) => [
          key,
          { prefix, next: 1 },
        ]),
      ) as OperationalSettings["numbering"],
    },
  };
}
export function initializeOperations(db: Database) {
  if (!db.operations) db.operations = emptyOperations();
  const op = db.operations;
  op.settings.invoicePrefix ??= "INV-";
  const demoRoles: Record<string, string> = {
    "person-0": "Owner",
    "person-1": "Project Manager",
    "person-2": "QS/Estimator",
    "person-3": "Site",
    "person-5": "Procurement",
    "person-6": "Accounts",
    "person-7": "Admin",
  };
  db.people.forEach((p) => {
    p.demoRole ??= demoRoles[p.id] || p.role;
  });
  if (
    op.version !== 1 ||
    [
      op.suppliers,
      op.variations,
      op.materials,
      op.requests,
      op.rfqs,
      op.quotes,
      op.orders,
      op.deliveries,
      op.bills,
      op.supplierPayments,
      op.credits,
      op.refunds,
      op.budgets,
      op.approvals,
      op.closures,
    ].some((a) => !Array.isArray(a))
  )
    throw Error(
      "Operational saved data is incompatible; export original data before resetting.",
    );
  return op;
}
export const getOperations = (db: Database) =>
  db.operations || emptyOperations();
