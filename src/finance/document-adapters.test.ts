import { describe, expect, it } from "vitest";
import { seed } from "../domain/seed";
import type { Database } from "../domain/model";
import type { Payment } from "../commercial/model";
import type { SupplierBill, SupplierPayment } from "../operations/model";
import { blankInvoice } from "../commercial/repository";
import { balanceDue } from "../commercial/calculations";
import { initializeCommercial } from "../commercial/migration";
import { getOperations } from "../operations/migration";
import { supplierBalance } from "../operations/calculations";
import {
  payablesAgeing,
  previewCustomerReceipt,
  previewSupplierPayment,
  readLegacyPayables,
  readLegacyReceivables,
  receivablesAgeing,
  type AllocationDraft,
} from "./document-adapters";

function ready(): Database {
  const db = seed();
  initializeCommercial(db);
  return db;
}

function invoice(db: Database, id: string, due = "2026-02-01") {
  const record = blankInvoice(db.clients[0].id, db.projects[0].id);
  Object.assign(record, {
    id,
    number: id,
    date: "2026-01-01",
    due,
    status: "Issued",
    issuedAt: "2026-01-01T10:00:00Z",
    vatPercentage: "0",
  });
  record.lines[0] = {
    ...record.lines[0],
    description: "Existing work",
    rate: "100",
    tax: "Exclusive",
  };
  db.invoices.push(record);
  return record;
}

function receipt(
  db: Database,
  id: string,
  invoiceId: string,
  amount: string,
  date = "2026-02-15",
) {
  const record: Payment = {
    id,
    number: id,
    invoiceId,
    customerId: db.clients[0].id,
    projectId: db.projects[0].id,
    date,
    amount,
    method: "Bank Transfer",
    reference: id,
    bank: "Demo bank",
    notes: "",
    attachments: [],
    postingKey: `key-${id}`,
    createdAt: `${date}T10:00:00Z`,
  };
  db.payments.push(record);
  return record;
}

function bill(db: Database, id: string, due = "2026-02-01") {
  const op = getOperations(db);
  const record: SupplierBill = {
    id,
    number: id,
    reference: id,
    poId: "po-1",
    supplierId: "supplier-a",
    projectId: db.projects[0].id,
    date: "2026-01-01",
    due,
    quantities: [],
    deliveryCharge: "0",
    net: "10000",
    vat: "0",
    gross: "10000",
    status: "Issued",
    snapshot: "{}",
    companySnapshot: op.settings.company,
    supplierSnapshot: {} as SupplierBill["supplierSnapshot"],
  };
  op.bills.push(record);
  return record;
}

function supplierPayment(
  db: Database,
  id: string,
  billId: string,
  amount: string,
) {
  const record: SupplierPayment = {
    id,
    number: id,
    billId,
    supplierId: "supplier-a",
    projectId: db.projects[0].id,
    date: "2026-02-15",
    amount,
    method: "Bank Transfer",
    reference: id,
    bank: "Demo bank",
    notes: "",
  };
  getOperations(db).supplierPayments.push(record);
  return record;
}

const draft = (
  partyId: string,
  allocations: AllocationDraft["allocations"],
  amountFils = 5_000n,
): AllocationDraft => ({
  id: "new-payment",
  postingKey: "new-key",
  partyId,
  date: "2026-03-01",
  amountFils,
  allocations,
});

describe("legacy sales adapter", () => {
  it("projects one-invoice receipts and validates a selected multi-invoice draft without writing history", () => {
    const db = ready();
    invoice(db, "INV-A", "2026-01-31");
    invoice(db, "INV-B", "2026-02-15");
    receipt(db, "RCT-OLD", "INV-A", "25.00");
    const before = JSON.stringify(db);
    const projection = readLegacyReceivables(db, "2026-03-01");
    expect(projection.documents.map((document) => document.id)).toEqual([
      "sales:INV-A",
      "sales:INV-B",
    ]);
    expect(projection.events).toHaveLength(1);
    expect(
      receivablesAgeing(db, "2026-03-01").rows.map(
        (row) => row.outstandingFils,
      ),
    ).toEqual([7_500n, 10_000n]);
    expect(
      previewCustomerReceipt(
        db,
        draft(db.clients[0].id, [
          { documentId: "INV-A", amountFils: 2_500n },
          { documentId: "INV-B", amountFils: 2_000n },
        ]),
      ),
    ).toEqual({
      unallocatedFils: 500n,
      selectedBalances: [
        { documentId: "INV-A", outstandingFils: 5_000n },
        { documentId: "INV-B", outstandingFils: 8_000n },
      ],
    });
    expect(JSON.stringify(db)).toBe(before);
  });

  it("shows customer credit as zero open AR after later credit/refund, without inventing a payable", () => {
    const db = ready();
    const i = invoice(db, "INV-C");
    receipt(db, "RCT-C", i.id, "80.00");
    const op = getOperations(db);
    op.credits.push({
      id: "credit-1",
      number: "CN-1",
      invoiceId: i.id,
      projectId: i.projectId,
      customerId: i.customerId,
      date: "2026-02-20",
      reason: "Reduction",
      gross: "30.00",
      itemId: i.lines[0].id,
      status: "Issued",
    });
    op.refunds.push({
      id: "refund-1",
      number: "REF-1",
      invoiceId: i.id,
      customerId: i.customerId,
      projectId: i.projectId,
      date: "2026-02-22",
      amount: "5.00",
      reference: "REF-1",
      method: "Bank Transfer",
      reason: "Partial return",
    });
    const before = JSON.stringify(db);
    expect(balanceDue(db, i, "2026-02-21")).toBe(0n);
    expect(balanceDue(db, i, "2026-03-01")).toBe(0n);
    expect(
      readLegacyReceivables(db, "2026-03-01").documents[0].amountFils,
    ).toBe(8_000n);
    expect(receivablesAgeing(db, "2026-03-01").rows).toEqual([]);
    expect(() =>
      previewCustomerReceipt(
        db,
        draft(i.customerId, [{ documentId: i.id, amountFils: 1n }], 1n),
      ),
    ).toThrow(/balance/);
    expect(JSON.stringify(db)).toBe(before);
  });

  it("uses reversal date for historical aging and omits cancelled invoices after cancellation", () => {
    const db = ready();
    const i = invoice(db, "INV-REV", "2026-01-31");
    const p = receipt(db, "RCT-REV", i.id, "100.00");
    p.reversedAt = "2026-03-10T08:00:00Z";
    p.reversalDate = "2026-03-10";
    expect(receivablesAgeing(db, "2026-03-09").rows).toEqual([]);
    expect(receivablesAgeing(db, "2026-03-10").rows[0]).toMatchObject({
      documentId: "sales:INV-REV",
      outstandingFils: 10_000n,
      daysOverdue: 38,
    });
    i.status = "Cancelled";
    i.cancelledAt = "2026-04-01T12:00:00Z";
    expect(receivablesAgeing(db, "2026-03-10").rows).toHaveLength(1);
    expect(receivablesAgeing(db, "2026-04-01").rows).toEqual([]);
    delete i.cancelledAt;
    expect(receivablesAgeing(db, "2026-03-10").limitations).toContainEqual(
      expect.stringContaining("cancellation date unavailable"),
    );
  });

  it("rejects foreign-party, duplicate, and over-balance draft allocations", () => {
    const db = ready();
    invoice(db, "INV-A");
    expect(() =>
      previewCustomerReceipt(
        db,
        draft("other", [{ documentId: "INV-A", amountFils: 1n }], 1n),
      ),
    ).toThrow(/same party/);
    expect(() =>
      previewCustomerReceipt(
        db,
        draft(
          db.clients[0].id,
          [
            { documentId: "INV-A", amountFils: 1n },
            { documentId: "INV-A", amountFils: 1n },
          ],
          2n,
        ),
      ),
    ).toThrow(/at most once/);
    expect(() =>
      previewCustomerReceipt(
        db,
        draft(
          db.clients[0].id,
          [{ documentId: "INV-A", amountFils: 10_001n }],
          10_001n,
        ),
      ),
    ).toThrow(/balance/);
  });

  it("keeps proforma out of AR and supports a deliberately unallocated advance preview", () => {
    const db = ready();
    const proforma = invoice(db, "PRO-1") as ReturnType<typeof invoice> & {
      kind?: "Proforma";
    };
    proforma.kind = "Proforma";
    expect(receivablesAgeing(db, "2026-03-01").rows).toEqual([]);
    expect(() =>
      previewCustomerReceipt(
        db,
        draft(
          db.clients[0].id,
          [{ documentId: proforma.id, amountFils: 1n }],
          1n,
        ),
      ),
    ).toThrow(/not found/);
    expect(
      previewCustomerReceipt(db, draft(db.clients[0].id, [], 5_000n)),
    ).toEqual({
      unallocatedFils: 5_000n,
      selectedBalances: [],
    });
  });
});

describe("legacy supplier adapter", () => {
  it("matches supplier balance now, supports explicit split payment, and keeps different due dates", () => {
    const db = ready();
    bill(db, "BILL-A", "2026-01-31");
    bill(db, "BILL-B", "2026-02-15");
    supplierPayment(db, "SP-OLD", "BILL-A", "25.00");
    const before = JSON.stringify(db);
    expect(supplierBalance(db, "BILL-A")).toBe(7_500n);
    expect(
      payablesAgeing(db, "2026-03-01").rows.map((row) => row.outstandingFils),
    ).toEqual([7_500n, 10_000n]);
    expect(
      payablesAgeing(db, "2026-03-01").rows.map((row) => row.daysOverdue),
    ).toEqual([29, 14]);
    expect(
      previewSupplierPayment(
        db,
        draft("supplier-a", [
          { documentId: "BILL-A", amountFils: 2_500n },
          { documentId: "BILL-B", amountFils: 2_000n },
        ]),
      ).unallocatedFils,
    ).toBe(500n);
    expect(JSON.stringify(db)).toBe(before);
  });

  it("restores payable on reversal date and reports missing bill cancellation time", () => {
    const db = ready();
    const b = bill(db, "BILL-REV");
    const p = supplierPayment(db, "SP-REV", b.id, "100.00");
    p.reversedAt = "2026-03-10T00:00:00Z";
    p.reversalDate = "2026-03-10";
    expect(payablesAgeing(db, "2026-03-09").rows).toEqual([]);
    expect(payablesAgeing(db, "2026-03-10").rows[0].outstandingFils).toBe(
      10_000n,
    );
    b.status = "Cancelled";
    expect(readLegacyPayables(db, "2026-03-09").documents).toEqual([]);
    expect(payablesAgeing(db, "2026-03-09").limitations).toContainEqual(
      expect.stringContaining("cancellation date unavailable"),
    );
  });
});
