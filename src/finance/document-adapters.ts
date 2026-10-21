import type { Database } from "../domain/model";
import type { Invoice, Payment } from "../commercial/model";
import type { SupplierBill, SupplierPayment } from "../operations/model";
import {
  balanceDue,
  invoiceTotals,
  paidAmount,
} from "../commercial/calculations";
import { getOperations } from "../operations/migration";
import { invoiceKind, type InvoiceKind } from "./invoice-types";
import {
  documentAgeing,
  documentOutstanding,
  parseFils,
  postSettlement,
  type DocumentAgeing,
  type PostedSettlement,
  type SettlementDocument,
  type SettlementEvent,
  type SettlementSide,
} from "./settlement";

export interface LegacySettlementProjection {
  documents: SettlementDocument[];
  events: SettlementEvent[];
  /** A missing cancellation date prevents reconstruction of earlier open balances. */
  limitations: string[];
}

export interface AllocationDraft {
  id: string;
  postingKey: string;
  partyId: string;
  date: string;
  amountFils: bigint;
  /** Existing native invoice/bill IDs, chosen explicitly by the user. */
  allocations: { documentId: string; amountFils: bigint }[];
}

export interface AllocationPreview {
  unallocatedFils: bigint;
  selectedBalances: { documentId: string; outstandingFils: bigint }[];
}

const salesId = (id: string) => `sales:${id}`;
const purchaseId = (id: string) => `purchase:${id}`;
const datePart = (timestamp: string) => timestamp.slice(0, 10);

function validateAsOf(asOf: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(asOf) ||
    Number.isNaN(Date.parse(`${asOf}T00:00:00Z`)) ||
    new Date(`${asOf}T00:00:00Z`).toISOString().slice(0, 10) !== asOf
  )
    throw Error("Use a valid YYYY-MM-DD as-of date.");
}

function activeInvoiceAsOf(invoice: Invoice, asOf: string): boolean {
  if (invoiceKind(invoice as Invoice & { kind?: InvoiceKind }) === "Proforma")
    return false;
  if (
    invoice.date > asOf ||
    (invoice.issuedAt && datePart(invoice.issuedAt) > asOf)
  )
    return false;
  return (
    invoice.status === "Issued" ||
    (invoice.status === "Cancelled" &&
      !!invoice.cancelledAt &&
      datePart(invoice.cancelledAt) > asOf)
  );
}

function legacyReceiptEvents(payments: readonly Payment[]): SettlementEvent[] {
  return payments.flatMap((payment): SettlementEvent[] => {
    const id = `legacy-sales-receipt:${payment.id}`;
    const posted: PostedSettlement = {
      type: "posted",
      id,
      postingKey: payment.postingKey || id,
      side: "receivable",
      partyId: payment.customerId,
      date: payment.date,
      amountFils: parseFils(payment.amount),
      allocations: [
        {
          documentId: salesId(payment.invoiceId),
          amountFils: parseFils(payment.amount),
        },
      ],
    };
    if (!payment.reversedAt) return [posted];
    if (!payment.reversalDate && !datePart(payment.reversedAt))
      throw Error(`Legacy receipt ${payment.id} has no reversal date.`);
    return [
      posted,
      {
        type: "reversed",
        id: `legacy-sales-reversal:${payment.id}`,
        settlementId: id,
        date: payment.reversalDate || datePart(payment.reversedAt),
        reason: payment.reversalReason || "",
      },
    ];
  });
}

function legacySupplierEvents(
  payments: readonly SupplierPayment[],
): SettlementEvent[] {
  return payments.flatMap((payment): SettlementEvent[] => {
    const id = `legacy-supplier-payment:${payment.id}`;
    const posted: PostedSettlement = {
      type: "posted",
      id,
      postingKey: id,
      side: "payable",
      partyId: payment.supplierId,
      date: payment.date,
      amountFils: parseFils(payment.amount),
      allocations: [
        {
          documentId: purchaseId(payment.billId),
          amountFils: parseFils(payment.amount),
        },
      ],
    };
    if (!payment.reversedAt) return [posted];
    if (!payment.reversalDate && !datePart(payment.reversedAt))
      throw Error(
        `Legacy supplier payment ${payment.id} has no reversal date.`,
      );
    return [
      posted,
      {
        type: "reversed",
        id: `legacy-supplier-reversal:${payment.id}`,
        settlementId: id,
        date: payment.reversalDate || datePart(payment.reversedAt),
        reason: payment.reason || "",
      },
    ];
  });
}

/** Read-only, on-demand projection. It never creates persisted finance events. */
export function readLegacyReceivables(
  db: Database,
  asOf: string,
): LegacySettlementProjection {
  validateAsOf(asOf);
  const limitations: string[] = [];
  const events = legacyReceiptEvents(db.payments);
  const documents = db.invoices.flatMap((invoice): SettlementDocument[] => {
    if (invoice.status === "Cancelled" && !invoice.cancelledAt)
      limitations.push(
        `Invoice ${invoice.id}: cancellation date unavailable; historical as-of balance omitted.`,
      );
    if (!activeInvoiceAsOf(invoice, asOf)) return [];
    // Existing invoicePosition is canonical: gross - credits - receipts + refunds.
    // Add active receipts back so the pure settlement projection has exactly
    // the existing open balance, including credit/refund and over-credit cases.
    const issued = { ...invoice, status: "Issued" as const };
    const alreadyPaid = paidAmount(db, invoice.id, asOf);
    const open = balanceDue(db, issued, asOf);
    const amountFils = alreadyPaid + open;
    if (amountFils > invoiceTotals(invoice).grand && open > 0n)
      limitations.push(
        `Invoice ${invoice.id}: refund-adjusted eligible balance exceeds original gross.`,
      );
    return [
      {
        id: salesId(invoice.id),
        side: "receivable",
        partyId: invoice.customerId,
        issuedOn: invoice.date,
        dueOn: invoice.due,
        amountFils,
      },
    ];
  });
  return { documents, events, limitations };
}

/** Bill cancellation has no timestamp in legacy data; cancelled bills are omitted. */
export function readLegacyPayables(
  db: Database,
  asOf: string,
): LegacySettlementProjection {
  validateAsOf(asOf);
  const op = getOperations(db);
  const limitations = op.bills
    .filter((bill) => bill.status === "Cancelled")
    .map(
      (bill) =>
        `Bill ${bill.id}: cancellation date unavailable; historical as-of balance omitted.`,
    );
  const documents = op.bills.flatMap(
    (bill: SupplierBill): SettlementDocument[] =>
      bill.status === "Issued" && bill.date <= asOf
        ? [
            {
              id: purchaseId(bill.id),
              side: "payable",
              partyId: bill.supplierId,
              issuedOn: bill.date,
              dueOn: bill.due,
              amountFils: BigInt(bill.gross),
            },
          ]
        : [],
  );
  return {
    documents,
    events: legacySupplierEvents(op.supplierPayments),
    limitations,
  };
}

function openAgeing(
  projection: LegacySettlementProjection,
  asOf: string,
): DocumentAgeing[] {
  return projection.documents
    .map((document) => documentAgeing(document, projection.events, asOf))
    .filter((row) => row.outstandingFils > 0n);
}

export function receivablesAgeing(
  db: Database,
  asOf: string,
): {
  rows: DocumentAgeing[];
  limitations: string[];
} {
  const projection = readLegacyReceivables(db, asOf);
  return {
    rows: openAgeing(projection, asOf),
    limitations: projection.limitations,
  };
}

export function payablesAgeing(
  db: Database,
  asOf: string,
): {
  rows: DocumentAgeing[];
  limitations: string[];
} {
  const projection = readLegacyPayables(db, asOf);
  return {
    rows: openAgeing(projection, asOf),
    limitations: projection.limitations,
  };
}

function preview(
  projection: LegacySettlementProjection,
  draft: AllocationDraft,
  side: SettlementSide,
  nativePrefix: "sales" | "purchase",
): AllocationPreview {
  const id = `preview-${side}:${draft.id}`;
  const input: PostedSettlement = {
    type: "posted",
    id,
    postingKey: draft.postingKey,
    side,
    partyId: draft.partyId,
    date: draft.date,
    amountFils: draft.amountFils,
    allocations: draft.allocations.map((allocation) => ({
      documentId: `${nativePrefix}:${allocation.documentId}`,
      amountFils: allocation.amountFils,
    })),
  };
  const candidateEvents = postSettlement(
    projection.documents,
    projection.events,
    input,
  );
  return {
    unallocatedFils:
      draft.amountFils -
      draft.allocations.reduce(
        (sum, allocation) => sum + allocation.amountFils,
        0n,
      ),
    selectedBalances: draft.allocations.map((allocation) => ({
      documentId: allocation.documentId,
      outstandingFils: documentOutstanding(
        projection.documents.find(
          (document) =>
            document.id === `${nativePrefix}:${allocation.documentId}`,
        )!,
        candidateEvents,
        draft.date,
      ),
    })),
  };
}

/** Validation only. Posting and persistence belong to the coordinator boundary. */
export function previewCustomerReceipt(
  db: Database,
  draft: AllocationDraft,
): AllocationPreview {
  if (db.payments.some((payment) => payment.id === draft.id))
    throw Error("Legacy receipt ID already exists.");
  return preview(
    readLegacyReceivables(db, draft.date),
    draft,
    "receivable",
    "sales",
  );
}

/** Validation only. Posting and persistence belong to the coordinator boundary. */
export function previewSupplierPayment(
  db: Database,
  draft: AllocationDraft,
): AllocationPreview {
  if (
    getOperations(db).supplierPayments.some(
      (payment) => payment.id === draft.id,
    )
  )
    throw Error("Legacy supplier payment ID already exists.");
  return preview(
    readLegacyPayables(db, draft.date),
    draft,
    "payable",
    "purchase",
  );
}
