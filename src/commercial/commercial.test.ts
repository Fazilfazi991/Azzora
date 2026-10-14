import { describe, expect, it, vi } from "vitest";
import { seed } from "../domain/seed";
import type { Database } from "../domain/model";
import { localRepository, createProject } from "../domain/repository";
import { addDays, today, uid } from "../domain/logic";
import {
  changeQuotationStatus,
  saveQuotation,
  copyQuotation,
  newQuotation,
  blankLine,
} from "../quotation/repository";
import { totals } from "../quotation/calculations";
import { initializeCommercial } from "./migration";
import {
  blankCustomer,
  saveCustomer,
  duplicateCustomers,
} from "./customer-domain";
import {
  blankInvoice,
  saveInvoice,
  issueInvoice,
  cancelInvoice,
  postPayment,
  reversePayment,
  saveExpense,
  convertQuotation,
  newProjectDetails,
  invoiceFromQuotation,
  milestoneAmounts,
} from "./repository";
import {
  amountString,
  aed,
  invoiceTotals,
  balanceDue,
  invoiceStatus,
  financials,
  ageingBucket,
  cents,
} from "./calculations";
import { emptyFilter } from "./model";
import type { Payment, Expense } from "./model";
import { reportData, statementData, csv, reportNames } from "./reports-data";

function dbReady() {
  const db = seed();
  initializeCommercial(db);
  return db;
}
function accepted(db: Database, unlinked = false) {
  const q = db.quotations[0];
  if (unlinked) q.projectId = "";
  changeQuotationStatus(db, q.id, "Finalized");
  changeQuotationStatus(db, q.id, "Accepted");
  return q;
}
function issued(
  db: Database,
  value = "100",
  tax: "Inclusive" | "Exclusive" | "Exempt" = "Exclusive",
) {
  const i = blankInvoice(db.clients[0].id, db.projects[0].id);
  i.lines[0] = {
    ...i.lines[0],
    description: "Fit-out works",
    rate: value,
    tax,
  };
  saveInvoice(db, i);
  issueInvoice(db, i.id);
  return db.invoices.find((x) => x.id === i.id)!;
}
function receipt(db: Database, id: string, amount: string): Payment {
  const i = db.invoices.find((i) => i.id === id)!;
  return {
    id: uid(),
    number: "",
    invoiceId: id,
    customerId: i.customerId,
    projectId: i.projectId,
    date: today(),
    amount,
    method: "Bank Transfer",
    reference: uid(),
    bank: "Demo Bank",
    notes: "",
    attachments: [],
    postingKey: uid(),
    createdAt: new Date().toISOString(),
  };
}
function expense(
  db: Database,
  amount = "20",
  vat = "1",
  paidAmount = "0",
): Expense {
  return {
    id: uid(),
    reference: "",
    projectId: db.projects[0].id,
    category: "Materials",
    supplier: "QA Supplier",
    date: today(),
    description: "Fit-out material",
    amount,
    vat,
    paidAmount,
    method: "Cash",
    attachmentReference: "BILL-1",
    attachments: [],
    createdAt: new Date().toISOString(),
  };
}
describe("customer master and migration", () => {
  it("migrates legacy data additively and idempotently without financial seed", () => {
    const db = seed(),
      original = structuredClone(db);
    delete (db as Partial<Database>).invoices;
    delete (db as Partial<Database>).commercialNumbering;
    initializeCommercial(db);
    const once = JSON.stringify(db);
    initializeCommercial(db);
    expect(JSON.stringify(db)).toBe(once);
    expect(db.projects).toEqual(original.projects);
    expect(db.quotations).toEqual(original.quotations);
    expect(db.clients.map((c) => c.id)).toEqual(
      original.clients.map((c) => c.id),
    );
    expect(db.invoices).toEqual([]);
    expect(db.payments).toEqual([]);
    expect(db.contracts).toEqual([]);
  });
  it("creates and edits customers with stable IDs and codes", () => {
    const db = dbReady(),
      c = saveCustomer(db, {
        ...blankCustomer(),
        name: "Acme Trading",
        email: "qa@example.com",
      });
    const code = c.code,
      id = c.id,
      count = db.clients.length;
    saveCustomer(db, {
      ...c,
      name: "Acme Trading LLC",
      contacts: [
        {
          id: uid(),
          name: "Contact Two",
          email: "two@example.com",
          phone: "",
          role: "Accounts",
        },
      ],
    });
    expect(db.clients).toHaveLength(count);
    expect(db.clients.find((c) => c.id === id)?.code).toBe(code);
  });
  it.each([
    [{ name: "ACME Trading" }, { name: " Acme-trading. " }],
    [
      { name: "A Company", email: "a@example.com" },
      { name: "B Company", email: "A@example.com" },
    ],
    [
      { name: "A Company", phone: "+971 50 123 4567" },
      { name: "B Company", phone: "0501234567" },
    ],
    [
      { name: "A Company", trn: "123456" },
      { name: "B Company", trn: "123 456" },
    ],
  ])("warns about normalized identity matches without merging", (one, two) => {
    const db = dbReady();
    saveCustomer(db, { ...blankCustomer(), ...one });
    const c = { ...blankCustomer(), ...two };
    expect(duplicateCustomers(db, c)).toHaveLength(1);
    expect(() => saveCustomer(db, c)).toThrow("duplicate");
    expect(() => saveCustomer(db, c, true)).toThrow();
    const count = db.clients.length;
    saveCustomer(db, c, true, "Separate legal company confirmed");
    expect(db.clients).toHaveLength(count + 1);
  });
  it("does not treat blank identifiers as duplicate matches", () => {
    const db = dbReady();
    expect(
      duplicateCustomers(db, {
        ...blankCustomer(),
        name: "New Unique Business",
      }),
    ).toHaveLength(0);
  });
  it("rejects missing names and invalid emails", () => {
    const db = dbReady();
    expect(() => saveCustomer(db, blankCustomer())).toThrow();
    expect(() =>
      saveCustomer(db, {
        ...blankCustomer(),
        name: "Valid name",
        email: "bad",
      }),
    ).toThrow();
  });
  it("uses an existing project customer without reinserting it", () => {
    const db = dbReady(),
      count = db.clients.length;
    const p = newProjectDetails(
      db,
      db.clients[0].id,
      "Connected project",
      "Dubai Marina",
    );
    createProject(db, p, db.clients[0].name, db.clients[0].contact, {}, true);
    expect(db.clients).toHaveLength(count);
    expect(db.tasks.filter((t) => t.projectId === p.id)).toHaveLength(37);
    expect(db.handover.filter((h) => h.projectId === p.id)).toHaveLength(12);
  });
  it("blocks archived customers for new projects and new invoices", () => {
    const db = dbReady();
    db.clients[0].status = "Archived";
    expect(() =>
      createProject(
        db,
        newProjectDetails(db, db.clients[0].id, "Archived project", "Dubai"),
        db.clients[0].name,
        "",
        {},
        true,
      ),
    ).toThrow("active");
    expect(() => issued(db)).toThrow("active");
  });
  it("preserves all commercial records through storage roundtrip", () => {
    const db = dbReady(),
      i = issued(db);
    postPayment(db, receipt(db, i.id, "20"));
    saveExpense(db, expense(db));
    let raw = "";
    vi.stubGlobal("localStorage", {
      setItem: (_: string, value: string) => {
        raw = value;
      },
      getItem: () => raw,
    });
    localRepository.save(db);
    expect(localRepository.load()).toEqual(db);
    vi.unstubAllGlobals();
  });
});
describe("quotation acceptance and contract conversion", () => {
  it("rejects mismatched customer/project links in drafts and issuance", () => {
    const db = dbReady(),
      q = structuredClone(db.quotations[0]);
    q.customerId = db.clients[0].id;
    expect(() => saveQuotation(db, q)).toThrow("belong");
    Object.assign(db.quotations[0], q);
    expect(() => changeQuotationStatus(db, q.id, "Finalized")).toThrow(
      "belong",
    );
  });
  it("discounts before VAT while preserving the baseline calculation", () => {
    const db = dbReady(),
      q = db.quotations[0];
    q.discount = "100";
    expect(totals(q)).toEqual({
      subtotal: 20032075n,
      vat: 1001104n,
      grand: 21023179n,
    });
    q.discount = "999999";
    expect(() => totals(q)).toThrow("Discount");
  });
  it("requires acceptance before conversion", () => {
    const db = dbReady();
    expect(() =>
      convertQuotation(db, db.quotations[0].id, db.projects[0].id),
    ).toThrow("Accept");
  });
  it("converts acceptance to existing project exactly once without invoices", () => {
    const db = dbReady(),
      q = accepted(db),
      snapshot = JSON.stringify(q),
      count = db.projects.length;
    const c = convertQuotation(db, q.id, q.projectId);
    expect(c.net).toBe("20032075");
    expect(convertQuotation(db, q.id, q.projectId).id).toBe(c.id);
    expect(db.projects).toHaveLength(count);
    expect(db.contracts).toHaveLength(1);
    expect(db.invoices).toHaveLength(0);
    expect(JSON.stringify(q)).toBe(snapshot);
    expect(c.quotationSnapshot).toBe(snapshot);
    expect(c.paymentTerms).toContain("Advance");
  });
  it("creates connected standard plan from an accepted unlinked quotation", () => {
    const db = dbReady(),
      q = accepted(db, true),
      p = newProjectDetails(
        db,
        q.customerId,
        q.project.name,
        q.project.location,
      );
    const c = convertQuotation(db, q.id, p.id, p);
    expect(c.projectId).toBe(p.id);
    expect(db.tasks.filter((t) => t.projectId === p.id)).toHaveLength(37);
    expect(q.projectId).toBe("");
    expect(db.projects.find((x) => x.id === p.id)?.value).toBe(200320.75);
  });
  it("prevents duplicate project conversion and cross-customer conversion", () => {
    const db = dbReady(),
      q = accepted(db);
    expect(() => convertQuotation(db, q.id, db.projects[0].id)).toThrow();
    expect(() =>
      convertQuotation(
        db,
        q.id,
        "new",
        newProjectDetails(db, q.customerId, "Another", "Dubai"),
      ),
    ).toThrow("already has a project");
  });
  it("keeps accepted revisions immutable and permits independent proposed revision", () => {
    const db = dbReady(),
      q = accepted(db);
    expect(() => changeQuotationStatus(db, q.id, "Draft", "Attempt")).toThrow(
      "immutable",
    );
    expect(() => changeQuotationStatus(db, q.id, "Rejected")).toThrow(
      "immutable",
    );
    const revision = copyQuotation(db, q.id, true);
    expect(revision.acceptedAt).toBeUndefined();
    expect(revision.status).toBe("Draft");
  });
});
describe("invoice calculations, snapshots and provenance", () => {
  it("rounds decimal products and VAT without floating point drift", () => {
    const db = dbReady(),
      i = blankInvoice(db.clients[0].id);
    i.lines[0] = {
      ...i.lines[0],
      quantity: "1.005",
      rate: "1",
      description: "Work",
    };
    expect(invoiceTotals(i).net).toBe(101n);
    expect(invoiceTotals(i).vat).toBe(5n);
  });
  it("extracts VAT from inclusive amounts once", () => {
    const db = dbReady(),
      i = issued(db, "105", "Inclusive");
    expect(invoiceTotals(i)).toMatchObject({
      net: 10000n,
      vat: 500n,
      grand: 10500n,
    });
  });
  it("allocates mixed-tax discount proportionally to avoid taxing exempt costs", () => {
    const db = dbReady(),
      i = blankInvoice(db.clients[0].id);
    i.lines = [
      {
        id: "a",
        description: "Taxable",
        quantity: "1",
        rate: "100",
        tax: "Exclusive",
      },
      {
        id: "b",
        description: "Exempt",
        quantity: "1",
        rate: "100",
        tax: "Exempt",
      },
    ];
    i.discount = "20";
    expect(invoiceTotals(i)).toEqual({
      subtotal: 20000n,
      discount: 2000n,
      net: 18000n,
      vat: 450n,
      grand: 18450n,
    });
  });
  it.each(["-1", "NaN", "1e3", "0.0000001"])(
    "rejects malformed invoice rate %s",
    (rate) => {
      const db = dbReady();
      expect(() => issued(db, rate)).toThrow();
    },
  );
  it("preserves issued totals and billing identity when master data changes", () => {
    const db = dbReady(),
      i = issued(db),
      snapshot = structuredClone(i.snapshot);
    db.clients[0].name = "Renamed client";
    db.projects[0].name = "Renamed project";
    db.quotations[0].vatPercentage = "15";
    expect(i.snapshot).toEqual(snapshot);
    expect(invoiceTotals(i).grand).toBe(10500n);
    expect(() => saveInvoice(db, { ...i, status: "Draft" })).toThrow(
      "immutable",
    );
  });
  it("creates unique invoice numbers and audits cancellation", () => {
    const db = dbReady(),
      a = issued(db),
      b = issued(db);
    expect(a.number).not.toBe(b.number);
    expect(() => cancelInvoice(db, a.id, "")).toThrow();
    cancelInvoice(db, a.id, "Duplicate requested scope");
    expect(a.snapshot).toBeTruthy();
    expect(balanceDue(db, a)).toBe(0n);
    expect(db.activities[0].previous).toContain(a.number);
  });
  it("rejects duplicate numbers and invalid dates", () => {
    const db = dbReady(),
      first = issued(db),
      other = blankInvoice(db.clients[0].id);
    other.number = first.number;
    other.lines[0].description = "Work";
    other.lines[0].rate = "100";
    expect(() => saveInvoice(db, other)).toThrow("unique");
    other.number = "";
    other.date = "2026-02-30";
    expect(() => saveInvoice(db, other)).toThrow("date");
  });
  it("generates milestones with exact accepted total, then blocks duplicates", () => {
    const db = dbReady(),
      q = accepted(db),
      amounts = milestoneAmounts(db, q.id);
    expect(amounts.difference).toBe(1n);
    expect(amounts.values.reduce((s, n) => s + n, 0n)).toBe(totals(q).grand);
    expect(invoiceFromQuotation(db, q.id, q.payments[0].id).notes).toContain(
      "Final milestone reconciles the accepted schedule by one fils",
    );
    for (const term of q.payments) {
      const i = saveInvoice(db, invoiceFromQuotation(db, q.id, term.id));
      issueInvoice(db, i.id);
    }
    expect(db.invoices.reduce((s, i) => s + invoiceTotals(i).grand, 0n)).toBe(
      totals(q).grand,
    );
    expect(() =>
      saveInvoice(db, invoiceFromQuotation(db, q.id, q.payments[0].id)),
    ).toThrow("already");
    expect(() => saveInvoice(db, invoiceFromQuotation(db, q.id))).toThrow(
      "already",
    );
  });
  it("invoices marked future quotations using the same positive tiny milestones shown in the PDF", () => {
    const db = dbReady();
    const q = newQuotation(db);
    q.customerId = db.clients[0].id;
    q.projectId = db.projects.find(
      (project) => project.clientId === q.customerId,
    )!.id;
    q.customer.name = db.clients[0].name;
    q.project.name = "Tiny works";
    q.project.location = "Dubai";
    q.vatEnabled = false;
    q.sections = [
      {
        id: "tiny",
        number: "1",
        title: "Works",
        rows: [
          {
            ...blankLine(),
            description: "Tiny works",
            quantity: "1",
            unit: "LS",
            rate: "0.10",
          },
        ],
      },
    ];
    changeQuotationStatus(db, q.id, "Finalized");
    changeQuotationStatus(db, q.id, "Accepted");
    const amounts = milestoneAmounts(db, q.id);
    expect(amounts.values).toEqual([5n, 4n, 1n]);
    expect(amounts.difference).toBe(-1n);
    expect(amounts.values.reduce((sum, amount) => sum + amount, 0n)).toBe(10n);
    expect(
      q.payments.map(
        (term) => invoiceFromQuotation(db, q.id, term.id).lines[0].rate,
      ),
    ).toEqual(["0.05", "0.04", "0.01"]);
    expect(invoiceFromQuotation(db, q.id, q.payments[1].id).notes).toContain(
      "Automatic payment schedule reconciles 1 fils",
    );
  });
  it("blocks milestone tampering and releases reservations after draft cancellation", () => {
    const db = dbReady(),
      q = accepted(db),
      i = invoiceFromQuotation(db, q.id, q.payments[0].id);
    i.lines[0].rate = "1";
    expect(() => saveInvoice(db, i)).toThrow("eligible");
    const draft = saveInvoice(
      db,
      invoiceFromQuotation(db, q.id, q.payments[0].id),
    );
    cancelInvoice(db, draft.id, "Replace draft");
    expect(
      saveInvoice(db, invoiceFromQuotation(db, q.id, q.payments[0].id)).id,
    ).not.toBe(draft.id);
  });
  it("prevents full quotation and milestone double invoicing", () => {
    const db = dbReady(),
      q = accepted(db);
    saveInvoice(db, invoiceFromQuotation(db, q.id));
    expect(() =>
      saveInvoice(db, invoiceFromQuotation(db, q.id, q.payments[0].id)),
    ).toThrow("already");
  });
});
describe("payments, reversals, expenses and shared financial reporting", () => {
  it("tracks partial and full receipts with zero remaining balance", () => {
    const db = dbReady(),
      i = issued(db, "100000", "Exempt");
    postPayment(db, receipt(db, i.id, "40000"));
    expect(balanceDue(db, i)).toBe(6000000n);
    expect(invoiceStatus(db, i)).toBe("Partially Paid");
    postPayment(db, receipt(db, i.id, "60000"));
    expect(balanceDue(db, i)).toBe(0n);
    expect(invoiceStatus(db, i)).toBe("Paid");
  });
  it.each(["0", "-1", "105.01"])("rejects invalid allocation %s", (amount) => {
    const db = dbReady(),
      i = issued(db);
    expect(() => postPayment(db, receipt(db, i.id, amount))).toThrow();
    expect(db.payments).toHaveLength(0);
  });
  it("prevents duplicate posting keys and normalized bank references", () => {
    const db = dbReady(),
      i = issued(db),
      p = receipt(db, i.id, "10");
    postPayment(db, p);
    expect(() => postPayment(db, p)).toThrow("Duplicate");
    expect(() =>
      postPayment(db, {
        ...receipt(db, i.id, "10"),
        reference: p.reference.toUpperCase(),
        bank: " demo bank ",
      }),
    ).toThrow("Duplicate");
  });
  it("rejects mismatched customers, future payments and draft allocations", () => {
    const db = dbReady(),
      i = issued(db),
      p = receipt(db, i.id, "10");
    expect(() =>
      postPayment(db, { ...p, customerId: db.clients[1].id }),
    ).toThrow();
    expect(() =>
      postPayment(db, { ...p, date: addDays(today(), 1) }),
    ).toThrow();
    i.status = "Draft";
    expect(() => postPayment(db, p)).toThrow("issued");
  });
  it("reverses allocation with history and supports a replacement", () => {
    const db = dbReady(),
      i = issued(db),
      p = postPayment(db, receipt(db, i.id, "40"));
    expect(() => cancelInvoice(db, i.id, "Cancel")).toThrow("Reverse");
    reversePayment(db, p.id, "Wrong amount");
    expect(balanceDue(db, i)).toBe(10500n);
    expect(p.reversalReason).toBe("Wrong amount");
    expect(() => reversePayment(db, p.id, "Again")).toThrow();
    postPayment(db, { ...receipt(db, i.id, "50"), reference: p.reference });
    expect(balanceDue(db, i)).toBe(5500n);
  });
  it("derives overdue status while preserving lifecycle", () => {
    const db = dbReady(),
      i = issued(db);
    i.due = addDays(today(), -1);
    postPayment(db, receipt(db, i.id, "10"));
    expect(invoiceStatus(db, i)).toBe("Overdue");
    expect(i.status).toBe("Issued");
    postPayment(db, receipt(db, i.id, "95"));
    expect(invoiceStatus(db, i)).toBe("Paid");
  });
  it.each([
    [0, "Current"],
    [1, "1–30 days"],
    [30, "1–30 days"],
    [31, "31–60 days"],
    [61, "61–90 days"],
    [91, "90+ days"],
  ])("ages %s days correctly", (n, bucket) => {
    expect(ageingBucket(addDays(today(), -Number(n)))).toBe(bucket);
  });
  it("distinguishes incurred net cost, VAT and paid cash", () => {
    const db = dbReady();
    saveExpense(db, expense(db, "200", "10", "50"));
    const s = financials(db, emptyFilter);
    expect(s.costs).toBe(20000n);
    expect(s.paidCosts).toBe(5000n);
    expect(() => saveExpense(db, expense(db, "10", "0", "11"))).toThrow();
    expect(() =>
      saveExpense(db, { ...expense(db), projectId: "missing" }),
    ).toThrow();
  });
  it("uses contract less net costs for profit regardless of cash collections", () => {
    const db = dbReady(),
      q = accepted(db);
    convertQuotation(db, q.id, q.projectId);
    const p = db.projects.find((p) => p.id === q.projectId)!;
    saveExpense(db, { ...expense(db, "1000", "50", "0"), projectId: p.id });
    const i = invoiceFromQuotation(db, q.id, q.payments[0].id);
    saveInvoice(db, i);
    issueInvoice(db, i.id);
    const before = financials(db, emptyFilter);
    postPayment(db, receipt(db, i.id, "100"));
    const after = financials(db, emptyFilter);
    expect(after.profit).toBe(19932075n);
    expect(before.profit).toBe(after.profit);
    expect(after.collected - before.collected).toBe(10000n);
    expect(
      financials(db, { ...emptyFilter, projectId: p.id }).outstanding,
    ).toBe(after.outstanding);
    expect(
      reportData(db, "Project Financial Summary", emptyFilter).rows.find(
        (r) => r[0] === p.code,
      )?.[7],
    ).toBe("199320.75");
  });
  it("builds statements with opening balances and reversal entries", () => {
    const db = dbReady(),
      i = issued(db),
      p = postPayment(db, receipt(db, i.id, "40"));
    reversePayment(db, p.id, "Correction");
    const data = statementData(db, {
      ...emptyFilter,
      customerId: i.customerId,
    });
    expect(data.rows.at(-1)?.[5]).toBe("105.00");
    expect(data.rows.some((r) => r[2].includes("Reversal"))).toBe(true);
    const opening = statementData(db, {
      ...emptyFilter,
      customerId: i.customerId,
      from: addDays(today(), 1),
    });
    expect(opening.rows[0][5]).toBe("105.00");
    cancelInvoice(db, i.id, "Cancelled scope");
    expect(
      statementData(db, { ...emptyFilter, customerId: i.customerId }).rows.at(
        -1,
      )?.[5],
    ).toBe("0.00");
  });
  it("renders all report types from shared records and escapes CSV formulas", () => {
    const db = dbReady();
    issued(db);
    saveExpense(db, expense(db));
    reportNames.forEach((name) => {
      const data = reportData(db, name, emptyFilter);
      expect(data.headers.length).toBeGreaterThan(1);
      expect(data.rows.every((r) => r.length === data.headers.length)).toBe(
        true,
      );
    });
    expect(
      csv({ headers: ["Name"], rows: [['=HYPERLINK("bad")'], ["A,B\nC"]] }),
    ).toContain("'=HYPERLINK");
    expect(csv({ headers: ["Name"], rows: [['A "quote"']] })).toContain(
      '"A ""quote"""',
    );
  });
  it("formats losses and decimal-safe fils", () => {
    expect(aed(-101n)).toBe("AED −1.01");
    expect(amountString(2n)).toBe("0.02");
    expect(cents("1.005")).toBe(101n);
  });
  it("corrects expenses with preserved previous record", () => {
    const db = dbReady(),
      e = saveExpense(db, expense(db));
    saveExpense(db, { ...e, amount: "25" });
    expect(db.expenses).toHaveLength(1);
    expect(db.activities[0].previous).toContain('"amount":"20"');
  });
});
