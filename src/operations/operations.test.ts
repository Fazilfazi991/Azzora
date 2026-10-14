import { describe, expect, it } from "vitest";
import { seed, blankTask } from "../domain/seed";
import type { Database } from "../domain/model";
import { initializeCommercial } from "../commercial/migration";
import { today, uid, addDays, handoverState } from "../domain/logic";
import { saveTask, completeProject } from "../domain/repository";
import { changeQuotationStatus } from "../quotation/repository";
import {
  convertQuotation,
  blankInvoice,
  saveInvoice,
  issueInvoice,
  postPayment,
  saveExpense,
} from "../commercial/repository";
import {
  invoiceTotals,
  balanceDue,
  financials,
  amountString,
  cents,
} from "../commercial/calculations";
import { emptyFilter } from "../commercial/model";
import { statementData, reportData } from "../commercial/reports-data";
import { initializeOperations } from "./migration";
import * as commands from "./repository";
import {
  projectCosts,
  variationTotals,
  orderTotals,
  deliveredQuantity,
  billedQuantity,
  orderReceived,
  supplierBalance,
  invoicePosition,
  quantityUnits,
  credited,
} from "./calculations";
import { closureSummary, closeCommercial } from "./closure-domain";
import { operationalReports } from "./reports";
import type {
  Supplier,
  Variation,
  SupplierPayment,
  CreditNote,
  Refund,
} from "./model";
const actor = "person-0";
function ready() {
  const db = seed();
  initializeCommercial(db);
  const p = db.projects[0],
    q = db.quotations[0];
  q.projectId = p.id;
  q.customerId = p.clientId;
  q.project = { name: p.name, location: p.location };
  q.customer.name = db.clients[0].name;
  changeQuotationStatus(db, q.id, "Finalized");
  changeQuotationStatus(db, q.id, "Accepted");
  convertQuotation(db, q.id, p.id);
  return db;
}
function supplier(db: Database, name = "Supplier A") {
  return commands.saveSupplier(
    db,
    {
      id: uid(),
      code: "",
      name,
      contact: "Contact",
      phone: "",
      whatsapp: "",
      email: "",
      address: "Dubai",
      emirate: "Dubai",
      country: "UAE",
      trn: "",
      bank: "Demo only",
      category: "Materials",
      terms: "30 days",
      notes: "",
      status: "Active",
      createdAt: new Date().toISOString(),
    } satisfies Supplier,
    actor,
  );
}
function approve(
  db: Database,
  kind: Parameters<typeof commands.submitApproval>[1],
  id: string,
  stage = "Internal",
) {
  const a = commands.submitApproval(db, kind, id, stage, actor, actor);
  commands.decideApproval(
    db,
    a.id,
    true,
    "Reviewed scope and commercial basis",
    actor,
  );
  return a;
}
function variation(
  db: Database,
  direction: Variation["direction"] = "Addition",
  rate = "100",
) {
  const c = db.contracts[0];
  return commands.saveVariation(
    db,
    {
      id: uid(),
      familyId: uid(),
      revision: 0,
      number: "",
      projectId: c.projectId,
      customerId: c.customerId,
      contractId: c.id,
      title: "Joinery change",
      description: "Revised scope",
      reason: "Client instruction",
      requesterId: actor,
      date: today(),
      direction,
      items: [
        {
          id: uid(),
          description: "Joinery item",
          quantity: "1",
          unit: "LS",
          rate,
          tax: "Exclusive",
        },
      ],
      discount: "0",
      vatPercentage: "5",
      notes: "",
      attachments: [],
      status: "Draft",
    },
    actor,
  );
}
function approveVariation(db: Database, v: Variation) {
  approve(db, "Variation", v.id);
  approve(db, "Variation", v.id, "Client");
  return v;
}
function procurement(db: Database, quantity = "10", rate = "10") {
  const s = supplier(db),
    m = commands.saveMaterial(
      db,
      {
        id: uid(),
        number: "",
        projectId: db.projects[0].id,
        name: "Porcelain tile",
        specification: "600mm",
        unit: "Nos",
        quantity,
        requiredDate: addDays(today(), 7),
        requesterId: actor,
        priority: "Normal",
        notes: "",
        attachments: [],
      },
      actor,
    );
  const pr = commands.saveRequest(
    db,
    {
      id: uid(),
      number: "",
      projectId: m.projectId,
      materialIds: [m.id],
      requesterId: actor,
      date: today(),
      notes: "Required installation",
      status: "Draft",
    },
    actor,
  );
  approve(db, "Purchase Request", pr.id);
  const rfq = commands.createRfq(
    db,
    pr.id,
    s.id,
    addDays(today(), 7),
    today(),
    actor,
  );
  const q = commands.saveSupplierQuote(
    db,
    {
      id: uid(),
      number: "",
      rfqId: rfq.id,
      projectId: pr.projectId,
      supplierId: s.id,
      items: rfq.items.map((i) => ({ ...i, rate })),
      deliveryCharge: "0",
      vatPercentage: "5",
      leadDays: 2,
      terms: "30 days",
      remarks: "Meets specification",
      status: "Received",
    },
    actor,
  );
  approve(db, "Supplier Quotation", q.id);
  const po = commands.createOrder(
    db,
    q.id,
    "Dubai site",
    addDays(today(), 7),
    actor,
  );
  approve(db, "Purchase Order", po.id);
  return { s, m, pr, rfq, q, po };
}
function delivery(
  db: Database,
  po: ReturnType<typeof procurement>["po"],
  quantity = "10",
  reference: string = uid(),
) {
  return commands.receiveDelivery(
    db,
    {
      id: uid(),
      number: "",
      poId: po.id,
      projectId: po.projectId,
      date: today(),
      quantities: [{ itemId: po.items[0].id, quantity }],
      receiverId: actor,
      reference,
      remarks: "Checked",
    },
    actor,
  );
}
function bill(
  db: Database,
  po: ReturnType<typeof procurement>["po"],
  quantity = "10",
  reference: string = uid(),
) {
  return commands.recordBill(
    db,
    {
      id: uid(),
      reference,
      poId: po.id,
      projectId: po.projectId,
      supplierId: po.supplierId,
      date: today(),
      due: addDays(today(), 30),
      quantities: [{ itemId: po.items[0].id, quantity }],
      deliveryCharge: "0",
      status: "Issued",
    },
    actor,
  );
}
function supplierPayment(
  _db: Database,
  b: ReturnType<typeof bill>,
  amount = "40",
): SupplierPayment {
  return {
    id: uid(),
    number: "",
    billId: b.id,
    supplierId: b.supplierId,
    projectId: b.projectId,
    date: today(),
    amount,
    method: "Bank Transfer",
    reference: uid(),
    bank: "Demo bank",
    notes: "",
  };
}
function invoice(db: Database) {
  const i = blankInvoice(db.clients[0].id, db.projects[0].id);
  i.lines[0].description = "Installation";
  i.lines[0].rate = "100";
  saveInvoice(db, i);
  issueInvoice(db, i.id);
  return db.invoices.find((x) => x.id === i.id)!;
}
function credit(
  db: Database,
  i: ReturnType<typeof invoice>,
  gross = "50",
): CreditNote {
  return commands.saveCredit(
    db,
    {
      id: uid(),
      number: "",
      invoiceId: i.id,
      projectId: i.projectId,
      customerId: i.customerId,
      date: today(),
      reason: "Scope reduction",
      gross,
      itemId: "",
      status: "Draft",
    },
    actor,
  );
}
function issuedCredit(db: Database, c: CreditNote) {
  approve(db, "Credit Note", c.id);
  commands.issueCredit(db, c.id, actor);
  return c;
}
function receipt(db: Database, i: ReturnType<typeof invoice>, amount = "80") {
  return postPayment(db, {
    id: uid(),
    number: "",
    invoiceId: i.id,
    customerId: i.customerId,
    projectId: i.projectId,
    date: today(),
    amount,
    method: "Cash",
    reference: uid(),
    bank: "",
    notes: "",
    attachments: [],
    postingKey: uid(),
    createdAt: new Date().toISOString(),
  });
}
function refund(i: ReturnType<typeof invoice>, amount = "25"): Refund {
  return {
    id: uid(),
    number: "",
    invoiceId: i.id,
    customerId: i.customerId,
    projectId: i.projectId,
    date: today(),
    amount,
    reference: uid(),
    method: "Bank Transfer",
    reason: "Return valid credit",
  };
}
describe("operations migration and approval records", () => {
  it("is additive/idempotent and retains financial history", () => {
    const db = ready(),
      before = JSON.stringify({
        clients: db.clients,
        projects: db.projects,
        quotations: db.quotations,
        contracts: db.contracts,
        invoices: db.invoices,
      });
    initializeOperations(db);
    const once = JSON.stringify(db.operations);
    initializeOperations(db);
    expect(JSON.stringify(db.operations)).toBe(once);
    expect(
      JSON.stringify({
        clients: db.clients,
        projects: db.projects,
        quotations: db.quotations,
        contracts: db.contracts,
        invoices: db.invoices,
      }),
    ).toBe(before);
    expect(db.operations!.orders).toEqual([]);
  });
  it("rejects an incompatible operations collection without resetting it", () => {
    const db = ready();
    db.operations!.orders = null as unknown as NonNullable<
      Database["operations"]
    >["orders"];
    expect(() => initializeOperations(db)).toThrow("incompatible");
    expect(db.operations!.orders).toBe(null);
  });
  it("requires assigned active demo actor, comments and a single decision", () => {
    const db = ready(),
      v = variation(db),
      a = commands.submitApproval(
        db,
        "Variation",
        v.id,
        "Internal",
        actor,
        "person-1",
      );
    expect(() =>
      commands.decideApproval(db, a.id, true, "", "person-1"),
    ).toThrow("comments");
    expect(() =>
      commands.decideApproval(db, a.id, true, "Review", actor),
    ).toThrow("assigned");
    commands.decideApproval(db, a.id, true, "Review", "person-1");
    expect(a.actorId).toBe("person-1");
    expect(a.snapshot).toContain(v.title);
    expect(() =>
      commands.decideApproval(db, a.id, true, "Again", "person-1"),
    ).toThrow("already");
  });
  it("prevents duplicate pending approvals", () => {
    const db = ready(),
      v = variation(db);
    commands.submitApproval(db, "Variation", v.id, "Internal", actor, actor);
    expect(() =>
      commands.submitApproval(db, "Variation", v.id, "Internal", actor, actor),
    ).toThrow("pending");
  });
});
describe("signed approved variations", () => {
  it("updates only approved net variation values", () => {
    const db = ready(),
      base = financials(db, emptyFilter).contract,
      v = variation(db);
    expect(financials(db, emptyFilter).contract).toBe(base);
    approve(db, "Variation", v.id);
    expect(financials(db, emptyFilter).contract).toBe(base);
    approve(db, "Variation", v.id, "Client");
    expect(financials(db, emptyFilter).contract).toBe(base + 10000n);
    expect(v.vat).toBe("500");
  });
  it("uses deductions without mixing gross and net", () => {
    const db = ready(),
      v = approveVariation(db, variation(db, "Deduction", "35"));
    expect(variationTotals(v)).toEqual({
      net: -3500n,
      vat: -175n,
      grand: -3675n,
    });
    expect(projectCosts(db, v.projectId).revisedContract).toBe(
      BigInt(db.contracts[0].net) - 3500n,
    );
  });
  it("locks submitted and approved data", () => {
    const db = ready(),
      v = variation(db);
    approve(db, "Variation", v.id);
    expect(() =>
      commands.saveVariation(db, { ...v, status: "Draft" }, actor),
    ).toThrow("immutable");
    approve(db, "Variation", v.id, "Client");
    expect(() => commands.reviseVariation(db, v.id, "Scope", actor)).toThrow();
    expect(() =>
      commands.submitApproval(db, "Variation", v.id, "Client", actor, actor),
    ).toThrow();
  });
  it("retains submitted snapshots and creates a numbered draft revision", () => {
    const db = ready(),
      v = variation(db);
    const a = commands.submitApproval(
      db,
      "Variation",
      v.id,
      "Internal",
      actor,
      actor,
    );
    const next = commands.reviseVariation(
      db,
      v.id,
      "Clarify specification",
      actor,
    );
    expect(next.revision).toBe(1);
    expect(next.familyId).toBe(v.familyId);
    expect(v.status).toBe("Revised");
    expect(a.status).toBe("Rejected");
    expect(a.snapshot).toContain("Joinery change");
  });
  it("generates one eligible positive variation invoice without changing quotation", () => {
    const db = ready(),
      v = approveVariation(db, variation(db)),
      q = JSON.stringify(db.quotations[0]);
    const i = commands.generateVariationInvoice(db, v.id);
    expect(invoiceTotals(i).grand).toBe(10500n);
    issueInvoice(db, i.id);
    expect(() => commands.generateVariationInvoice(db, v.id)).toThrow(
      "already",
    );
    expect(JSON.stringify(db.quotations[0])).toBe(q);
    expect(() => saveInvoice(db, { ...i, status: "Draft" })).toThrow(
      "immutable",
    );
  });
  it("rejects unapproved variation billing and deduction invoices", () => {
    const db = ready(),
      v = variation(db);
    expect(() => commands.generateVariationInvoice(db, v.id)).toThrow();
    const deduction = approveVariation(db, variation(db, "Deduction"));
    expect(() => commands.generateVariationInvoice(db, deduction.id)).toThrow(
      "positive",
    );
  });
  it("enforces original contract tax basis and maximum deduction", () => {
    const db = ready(),
      v = variation(db);
    expect(() =>
      commands.saveVariation(db, { ...v, vatPercentage: "10" }, actor),
    ).toThrow("VAT");
    const d = variation(db, "Deduction", "999999");
    approve(db, "Variation", d.id);
    const a = commands.submitApproval(
      db,
      "Variation",
      d.id,
      "Client",
      actor,
      actor,
    );
    expect(() =>
      commands.decideApproval(db, a.id, true, "Reviewed", actor),
    ).toThrow("exceeds");
  });
});
describe("supplier and procurement flow", () => {
  it("archives supplier without deleting purchase history", () => {
    const db = ready(),
      { s, po } = procurement(db);
    commands.saveSupplier(db, { ...s, status: "Archived" }, actor);
    expect(db.operations!.orders[0].id).toBe(po.id);
    expect(() =>
      commands.createRfq(
        db,
        db.operations!.requests[0].id,
        s.id,
        today(),
        today(),
        actor,
      ),
    ).toThrow("active");
  });
  it("detects duplicate supplier identities", () => {
    const db = ready();
    supplier(db, "ACME Trading");
    expect(() => supplier(db, "acme-trading")).toThrow("duplicate");
  });
  it("requires request approval before RFQ and avoids duplicate material requests", () => {
    const db = ready(),
      { m, pr, s } = procurement(db);
    expect(() =>
      commands.saveRequest(
        db,
        { ...pr, id: uid(), number: "", status: "Draft", materialIds: [m.id] },
        actor,
      ),
    ).toThrow("already");
    const wrong = {
      ...pr,
      id: uid(),
      status: "Draft" as const,
      materialIds: ["missing"],
    };
    expect(() => commands.saveRequest(db, wrong, actor)).toThrow(
      "requirements",
    );
    pr.status = "Draft";
    expect(() =>
      commands.createRfq(db, pr.id, s.id, today(), today(), actor),
    ).toThrow("approved");
  });
  it("can compare multiple vendors and approve the dearer quote explicitly", () => {
    const db = ready(),
      { pr, q } = procurement(db);
    const s = supplier(db, "Supplier B"),
      r = commands.createRfq(db, pr.id, s.id, today(), today(), actor);
    commands.saveSupplierQuote(
      db,
      {
        ...q,
        id: uid(),
        number: "",
        rfqId: r.id,
        supplierId: s.id,
        items: r.items.map((i) => ({ ...i, rate: "1" })),
        status: "Received",
      },
      actor,
    );
    expect(q.status).toBe("Approved");
    expect(db.operations!.quotes[1].status).toBe("Received");
  });
  it("prevents second approved preferred supplier for a request", () => {
    const db = ready(),
      { pr, q } = procurement(db);
    const s = supplier(db, "Supplier B"),
      r = commands.createRfq(db, pr.id, s.id, today(), today(), actor);
    const b = commands.saveSupplierQuote(
      db,
      {
        ...q,
        id: uid(),
        number: "",
        rfqId: r.id,
        supplierId: s.id,
        items: r.items.map((i) => ({ ...i, rate: "9" })),
        status: "Received",
      },
      actor,
    );
    const a = commands.submitApproval(
      db,
      "Supplier Quotation",
      b.id,
      "Selection",
      actor,
      actor,
    );
    expect(() =>
      commands.decideApproval(db, a.id, true, "Selected", actor),
    ).toThrow("already");
  });
  it("prevents duplicate orders and delivery against unapproved PO", () => {
    const db = ready(),
      { q, po } = procurement(db);
    expect(() =>
      commands.createOrder(db, q.id, "Site", today(), actor),
    ).toThrow("already");
    po.status = "Draft";
    expect(() => delivery(db, po)).toThrow("approved");
  });
  it("tracks partial delivery and exact pending quantity", () => {
    const db = ready(),
      { po } = procurement(db);
    delivery(db, po, "4");
    expect(deliveredQuantity(db, po.id, po.items[0].id)).toBe(4000000n);
    expect(orderReceived(db, po)).toBe(false);
    delivery(db, po, "6");
    expect(orderReceived(db, po)).toBe(true);
    expect(() => delivery(db, po, "1")).toThrow("exceeds");
  });
  it("prevents duplicate delivery notes and supports unbilled reversal", () => {
    const db = ready(),
      { po } = procurement(db),
      d = delivery(db, po, "4", "DELIVERY-1");
    expect(() => delivery(db, po, "1", "delivery-1")).toThrow("Duplicate");
    commands.reverseDelivery(db, d.id, "Wrong quantity", actor);
    expect(deliveredQuantity(db, po.id, po.items[0].id)).toBe(0n);
  });
  it("rejects undelivered, overdelivered and repeatedly billed quantities", () => {
    const db = ready(),
      { po } = procurement(db);
    expect(() => bill(db, po)).toThrow("undelivered");
    expect(() => delivery(db, po, "11")).toThrow();
    delivery(db, po, "4");
    bill(db, po, "4");
    expect(() => bill(db, po, "1")).toThrow("already billed");
  });
  it("detects duplicate supplier invoice refs", () => {
    const db = ready(),
      { po } = procurement(db);
    delivery(db, po);
    bill(db, po, "4", "SUP-INV-1");
    expect(() => bill(db, po, "4", "sup-inv-1")).toThrow("Duplicate");
  });
  it("records supplier bills exactly once as actual project costs", () => {
    const db = ready(),
      { po } = procurement(db);
    delivery(db, po);
    const b = bill(db, po, "4");
    expect(db.expenses.filter((e) => e.supplierBillId === b.id)).toHaveLength(
      1,
    );
    expect(financials(db, emptyFilter).costs).toBe(4000n);
    expect(projectCosts(db, po.projectId).openCommitment).toBe(6000n);
    expect(() => saveExpense(db, { ...db.expenses[0], amount: "80" })).toThrow(
      "Procurement",
    );
  });
  it("blocks negative VAT when rebilling a cancelled fractional allocation", () => {
    const db = ready(),
      { po } = procurement(db, "100", "0.01");
    delivery(db, po, "100");
    const first = bill(db, po, "9");
    bill(db, po, "1");
    commands.cancelBill(db, first.id, "Correct allocation", actor);
    expect(() => bill(db, po, "2")).toThrow("negative net/VAT");
    expect(bill(db, po, "9").vat).toBe("0");
  });
  it("rounds cumulative fractional quantity bills to original PO total", () => {
    const db = ready(),
      { po } = procurement(db, "1", "0.05");
    delivery(db, po, "1");
    bill(db, po, "0.5");
    bill(db, po, "0.5");
    expect(db.operations!.bills.reduce((s, b) => s + BigInt(b.gross), 0n)).toBe(
      orderTotals(po).grand,
    );
  });
  it("keeps supplier payments out of customer collections and updates paid expense cash", () => {
    const db = ready(),
      { po } = procurement(db);
    delivery(db, po);
    const b = bill(db, po);
    commands.paySupplier(db, supplierPayment(db, b, "40"), actor);
    expect(supplierBalance(db, b.id)).toBe(6500n);
    expect(financials(db, emptyFilter).collected).toBe(0n);
    expect(financials(db, emptyFilter).paidCosts).toBe(4000n);
    commands.paySupplier(db, supplierPayment(db, b, "65"), actor);
    expect(supplierBalance(db, b.id)).toBe(0n);
  });
  it("prevents duplicate/negative/overallocated supplier payments", () => {
    const db = ready(),
      { po } = procurement(db);
    delivery(db, po);
    const b = bill(db, po),
      p = supplierPayment(db, b);
    commands.paySupplier(db, p, actor);
    expect(() => commands.paySupplier(db, p, actor)).toThrow("Duplicate");
    expect(() =>
      commands.paySupplier(db, supplierPayment(db, b, "66"), actor),
    ).toThrow("exceeds");
    expect(() =>
      commands.paySupplier(db, supplierPayment(db, b, "-1"), actor),
    ).toThrow();
  });
  it("reverses supplier payment and preserves correction history", () => {
    const db = ready(),
      { po } = procurement(db);
    delivery(db, po);
    const b = bill(db, po),
      p = commands.paySupplier(db, supplierPayment(db, b), actor);
    commands.reverseSupplierPayment(db, p.id, "Bank correction", actor);
    expect(supplierBalance(db, b.id)).toBe(10500n);
    expect(db.expenses.find((e) => e.supplierBillId === b.id)?.paidAmount).toBe(
      "0.00",
    );
    expect(p.reason).toBe("Bank correction");
  });
  it("blocks cancellation/reversal of allocated deliveries and paid bills", () => {
    const db = ready(),
      { po } = procurement(db),
      d = delivery(db, po);
    const b = bill(db, po);
    expect(() => commands.reverseDelivery(db, d.id, "Error", actor)).toThrow(
      "billed",
    );
    expect(() => commands.cancelOrder(db, po.id, "Error", actor)).toThrow(
      "Received",
    );
    const p = commands.paySupplier(db, supplierPayment(db, b), actor);
    expect(() => commands.cancelBill(db, b.id, "Error", actor)).toThrow(
      "Reverse",
    );
    commands.reverseSupplierPayment(db, p.id, "Correction", actor);
    commands.cancelBill(db, b.id, "Duplicate", actor);
    expect(
      db.expenses.find((e) => e.supplierBillId === b.id)?.cancelledAt,
    ).toBeTruthy();
    expect(financials(db, emptyFilter).costs).toBe(0n);
    expect(b.status).toBe("Cancelled");
    expect(billedQuantity(db, po.id, po.items[0].id)).toBe(0n);
  });
});
describe("customer credits, VAT and refunds", () => {
  it("preserves exempt item VAT treatment on an item-level credit", () => {
    const db = ready(),
      draft = blankInvoice(db.clients[0].id, db.projects[0].id);
    draft.lines = [
      {
        id: uid(),
        description: "Taxable scope",
        quantity: "1",
        rate: "100",
        tax: "Exclusive",
      },
      {
        id: uid(),
        description: "Exempt scope",
        quantity: "1",
        rate: "100",
        tax: "Exempt",
      },
    ];
    saveInvoice(db, draft);
    issueInvoice(db, draft.id);
    const i = db.invoices.find((i) => i.id === draft.id)!;
    const c = commands.saveCredit(
      db,
      { ...credit(db, i, "50"), itemId: i.lines[1].id },
      actor,
    );
    issuedCredit(db, c);
    expect(db.operations!.credits.find((x) => x.id === c.id)!.vat).toBe("0");
    expect(db.operations!.credits.find((x) => x.id === c.id)!.net).toBe("5000");
  });
  it("limits item credits to the discounted billed item value", () => {
    const db = ready(),
      draft = blankInvoice(db.clients[0].id, db.projects[0].id);
    draft.lines = [
      {
        id: uid(),
        description: "Taxable scope",
        quantity: "1",
        rate: "100",
        tax: "Exclusive",
      },
      {
        id: uid(),
        description: "Exempt scope",
        quantity: "1",
        rate: "100",
        tax: "Exempt",
      },
    ];
    draft.discount = "20";
    saveInvoice(db, draft);
    issueInvoice(db, draft.id);
    const i = db.invoices.find((i) => i.id === draft.id)!;
    const c = credit(db, i, "95");
    expect(() =>
      commands.saveCredit(db, { ...c, itemId: i.lines[0].id }, actor),
    ).toThrow("selected item's");
  });
  it("requires approval to issue credits and locks issued adjustments", () => {
    const db = ready(),
      i = invoice(db),
      c = credit(db, i);
    expect(() => commands.issueCredit(db, c.id, actor)).toThrow("Approve");
    issuedCredit(db, c);
    expect(() => commands.saveCredit(db, c, actor)).toThrow("immutable");
    expect(credited(db, i.id)).toBe(5000n);
    expect(balanceDue(db, i)).toBe(5500n);
  });
  it("reserves eligible billed value and prevents excessive credits", () => {
    const db = ready(),
      i = invoice(db);
    credit(db, i, "80");
    expect(() => credit(db, i, "26")).toThrow("exceeds");
  });
  it("reconciles partial receipt, credit and valid refund without negative receivable", () => {
    const db = ready(),
      i = invoice(db);
    receipt(db, i, "80");
    issuedCredit(db, credit(db, i, "50"));
    expect(balanceDue(db, i)).toBe(0n);
    expect(invoicePosition(db, i)).toBe(-2500n);
    const r = commands.postRefund(db, refund(i, "25"), actor);
    expect(invoicePosition(db, i)).toBe(0n);
    expect(financials(db, emptyFilter).collected).toBe(8000n);
    expect(financials(db, emptyFilter).refunds).toBe(2500n);
    expect(
      statementData(db, { ...emptyFilter, customerId: i.customerId }).rows.at(
        -1,
      )?.[5],
    ).toBe("0.00");
    commands.reverseRefund(db, r.id, "Wrong bank", actor);
    expect(invoicePosition(db, i)).toBe(-2500n);
  });
  it("prevents refund without a credit basis and repeated posting", () => {
    const db = ready(),
      i = invoice(db);
    expect(() => commands.postRefund(db, refund(i), actor)).toThrow("eligible");
    receipt(db, i, "105");
    issuedCredit(db, credit(db, i, "50"));
    const r = refund(i, "25");
    commands.postRefund(db, r, actor);
    expect(() => commands.postRefund(db, r, actor)).toThrow("Duplicate");
    expect(() => commands.postRefund(db, refund(i, "26"), actor)).toThrow(
      "eligible",
    );
  });
  it("adjusts VAT proportionately and exactly clears VAT on full credit", () => {
    const db = ready(),
      i = invoice(db);
    issuedCredit(db, credit(db, i, "50"));
    issuedCredit(db, credit(db, i, "55"));
    expect(
      db.operations!.credits.reduce((s, c) => s + BigInt(c.vat!), 0n),
    ).toBe(invoiceTotals(i).vat);
    expect(
      db.operations!.credits.reduce((s, c) => s + BigInt(c.net!), 0n),
    ).toBe(invoiceTotals(i).net);
  });
  it("preserves historical invoice and company snapshots after setting changes", () => {
    const db = ready(),
      i = invoice(db),
      snapshot = JSON.stringify(i.snapshot);
    const settings = structuredClone(db.operations!.settings);
    settings.company.name = "New company";
    settings.vatPercentage = "10";
    commands.saveSettings(db, settings, actor);
    expect(JSON.stringify(i.snapshot)).toBe(snapshot);
    expect(invoiceTotals(i).grand).toBe(10500n);
  });
  it("guards item-level credit eligibility", () => {
    const db = ready(),
      i = invoice(db);
    const c = credit(db, i, "50");
    c.itemId = i.lines[0].id;
    commands.saveCredit(db, c, actor);
    expect(() =>
      commands.saveCredit(db, { ...c, gross: "106" }, actor),
    ).toThrow("exceeds");
  });
});
describe("budgets, documents, workforce and closure", () => {
  it("uses an active demo actor for supplier edits after the initial actor leaves", () => {
    const db = ready(),
      s = supplier(db);
    commands.saveEmployee(db, { ...db.people[0], status: "Inactive" }, actor);
    commands.saveSupplier(db, { ...s, notes: "Updated by replacement actor" });
    expect(db.activities[0].actorId).toBe(db.people[1].id);
  });
  it("allows a pending approval to be reassigned after approver deactivation", () => {
    const db = ready(),
      v = variation(db),
      a = commands.submitApproval(
        db,
        "Variation",
        v.id,
        "Internal",
        actor,
        "person-1",
      );
    commands.saveEmployee(db, { ...db.people[1], status: "Inactive" }, actor);
    commands.reassignApproval(db, a.id, actor, "Reviewer left project", actor);
    commands.decideApproval(db, a.id, true, "Reassigned review checked", actor);
    expect(a.actorId).toBe(actor);
    expect(db.activities.some((a) => a.action === "Approval reassigned")).toBe(
      true,
    );
  });
  it("supersedes an older pending drawing review when a new version is saved", () => {
    const db = ready(),
      doc = commands.saveControlledDocument(
        db,
        {
          id: uid(),
          projectId: db.projects[0].id,
          name: "Drawing",
          category: "Design Drawings",
          status: "Pending",
          version: 1,
          uploadedAt: today(),
          uploadedBy: actor,
        },
        actor,
      );
    const a = commands.submitApproval(
      db,
      "Document",
      doc.id,
      "Drawing review",
      actor,
      actor,
    );
    commands.saveControlledDocument(
      db,
      {
        ...doc,
        id: uid(),
        revisionOf: doc.id,
        version: 2,
        status: "Pending",
        reviewState: "Draft",
      },
      actor,
    );
    expect(a.status).toBe("Rejected");
    expect(() =>
      commands.submitApproval(
        db,
        "Document",
        doc.id,
        "Drawing review",
        actor,
        actor,
      ),
    ).toThrow("latest");
  });
  it("keeps budgets/commitments/actuals/forecast distinct without duplicate cost", () => {
    const db = ready(),
      { po } = procurement(db);
    const b = {
      id: uid(),
      projectId: po.projectId,
      lines: [
        {
          id: uid(),
          category: "Materials",
          phaseId: "",
          original: "90",
          revised: "90",
        },
      ],
      remainingEstimate: "120",
      notes: "Baseline",
      updatedAt: "",
    };
    commands.saveBudget(db, b, actor);
    delivery(db, po);
    bill(db, po, "4");
    const s = projectCosts(db, po.projectId);
    expect(s.committed).toBe(10000n);
    expect(s.actual).toBe(4000n);
    expect(s.openCommitment).toBe(6000n);
    expect(s.forecast).toBe(16000n);
    expect(s.overrun).toBe(true);
    commands.saveBudget(
      db,
      {
        ...b,
        lines: b.lines.map((l) => ({ ...l, original: "999", revised: "200" })),
        remainingEstimate: "0",
      },
      actor,
    );
    expect(projectCosts(db, po.projectId).originalBudget).toBe(9000n);
    expect(projectCosts(db, po.projectId).forecast).toBe(10000n);
  });
  it("retains approved drawing version while rejected revision is resubmitted", () => {
    const db = ready();
    const doc = commands.saveControlledDocument(
      db,
      {
        id: uid(),
        projectId: db.projects[0].id,
        name: "Drawing",
        category: "Design Drawings",
        status: "Pending",
        version: 1,
        uploadedAt: today(),
        uploadedBy: actor,
      },
      actor,
    );
    approve(db, "Document", doc.id, "Drawing review");
    const original = JSON.stringify(doc);
    expect(() =>
      commands.saveControlledDocument(db, { ...doc, name: "Changed" }, actor),
    ).toThrow("immutable");
    const rev = commands.saveControlledDocument(
      db,
      {
        ...doc,
        id: uid(),
        revisionOf: doc.id,
        version: 2,
        status: "Pending",
        reviewState: "Draft",
      },
      actor,
    );
    const a = commands.submitApproval(
      db,
      "Document",
      rev.id,
      "Drawing review",
      actor,
      actor,
    );
    commands.decideApproval(db, a.id, false, "Revise dimensions", actor);
    expect(rev.reviewState).toBe("Revise & Resubmit");
    commands.submitApproval(
      db,
      "Document",
      rev.id,
      "Drawing review",
      actor,
      actor,
    );
    const pending = db.operations!.approvals.find(
      (a) => a.entityId === rev.id && a.status === "Pending Approval",
    )!;
    commands.decideApproval(db, pending.id, true, "Dimensions verified", actor);
    expect(JSON.stringify(doc)).toBe(original);
    expect(rev.status).toBe("Approved");
  });
  it("preserves employee task/project IDs and blocks new inactive assignments", () => {
    const db = ready();
    const p = {
      id: uid(),
      name: "New site employee",
      role: "Site Engineer",
      department: "Site",
      email: "site@example.com",
      phone: "",
      status: "Active" as const,
      capacity: 100,
    };
    commands.saveEmployee(db, p, actor);
    const task = {
      ...blankTask(db.projects[0].id, db.phases[0].id, p.id),
      name: "Employee task",
    };
    saveTask(db, task);
    commands.saveEmployee(db, { ...p, status: "Inactive" }, actor);
    expect(db.tasks.find((t) => t.id === task.id)?.assigneeId).toBe(p.id);
    expect(() =>
      saveTask(db, {
        ...blankTask(task.projectId, task.phaseId, p.id),
        name: "Another task",
      }),
    ).toThrow("active");
  });
  it("does not block operational handover for unpaid invoices by default", () => {
    const db = ready(),
      id = db.projects[0].id;
    invoice(db);
    db.tasks
      .filter((t) => t.projectId === id)
      .forEach((t) => {
        t.status = "Completed";
        t.progress = 100;
      });
    db.snags
      .filter((s) => s.projectId === id)
      .forEach((s) => (s.status = "Closed"));
    db.handover
      .filter((h) => h.projectId === id)
      .forEach((h) => (h.complete = true));
    expect(handoverState(db, id).ready).toBe(true);
    expect(closureSummary(db, id).commercialClear).toBe(false);
    completeProject(db, id);
    expect(db.projects[0].status).toBe("Completed");
    db.operations!.settings.blockOperationalForFinance = true;
    expect(() => completeProject(db, id)).toThrow("policy");
  });
  it("requires actual clear obligations for commercial closure", () => {
    const db = ready();
    expect(() =>
      closeCommercial(db, db.projects[0].id, actor, "Review"),
    ).toThrow("Resolve");
    const other = db.projects[1].id;
    db.documents
      .filter((d) => d.projectId === other)
      .forEach((d) => (d.status = "Approved"));
    closeCommercial(db, other, actor, "Final account reviewed");
    expect(db.operations!.closures).toHaveLength(1);
    expect(() => closeCommercial(db, other, actor, "Again")).toThrow("already");
  });
  it("exports all ten operational reports from shared records", () => {
    const db = ready(),
      { po } = procurement(db);
    delivery(db, po);
    bill(db, po);
    for (const name of operationalReports) {
      const r = reportData(db, name, emptyFilter);
      expect(r.rows.every((row) => row.length === r.headers.length)).toBe(true);
    }
    expect(
      reportData(db, "Supplier Outstanding", emptyFilter).rows[0].at(-1),
    ).toBe("105.00");
  });
  it.each(["-1", "NaN", "1e2"])(
    "rejects malformed monetary/quantity inputs %s",
    (value) => {
      expect(() => quantityUnits(value)).toThrow();
      expect(() => cents(value)).toThrow();
    },
  );
  it("uses exact fractional quantity scale and negative money formatting", () => {
    expect(quantityUnits("0.125")).toBe(125000n);
    expect(amountString(-123n)).toBe("-1.23");
  });
});
