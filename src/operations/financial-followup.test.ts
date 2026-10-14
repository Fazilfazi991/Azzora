import { describe, expect, it } from "vitest";
import { seed } from "../domain/seed";
import type { Database } from "../domain/model";
import { today, uid } from "../domain/logic";
import type { Invoice, TaxTreatment } from "../commercial/model";
import { initializeCommercial } from "../commercial/migration";
import {
  blankInvoice,
  saveInvoice,
  issueInvoice,
  postPayment,
} from "../commercial/repository";
import {
  amountString,
  cents,
  financials,
  invoiceCreditLines,
  invoiceTotals,
} from "../commercial/calculations";
import { emptyFilter } from "../commercial/model";
import { statementData } from "../commercial/reports-data";
import { invoiceItemTotals, invoicePosition } from "./calculations";
import { creditAllocation, remainingCreditLines } from "./credit-allocation";
import {
  saveCredit,
  submitApproval,
  decideApproval,
  issueCredit,
  postRefund,
} from "./repository";
import type { CreditNote } from "./model";

function issued(
  rates = ["1"],
  taxes: TaxTreatment[] = ["Exclusive"],
  discount = "0",
) {
  const db = seed();
  initializeCommercial(db);
  const draft = blankInvoice(db.clients[0].id, db.projects[0].id);
  draft.lines = rates.map((rate, index) => ({
    id: uid(),
    description: `Financial follow-up ${index}`,
    quantity: "1",
    rate,
    tax: taxes[index],
  }));
  draft.discount = discount;
  saveInvoice(db, draft);
  issueInvoice(db, draft.id);
  return { db, invoice: db.invoices[0] };
}
function draftCredit(
  db: Database,
  invoice: Invoice,
  gross: string,
  itemId = "",
) {
  return saveCredit(
    db,
    {
      id: uid(),
      number: "",
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      projectId: invoice.projectId,
      date: today(),
      reason: "Financial follow-up adjustment",
      gross,
      itemId,
      status: "Draft",
    },
    "person-0",
  );
}
function credit(db: Database, invoice: Invoice, gross: string, itemId = "") {
  const c = draftCredit(db, invoice, gross, itemId);
  const approval = submitApproval(
    db,
    "Credit Note",
    c.id,
    "Internal",
    "person-0",
    "person-1",
  );
  decideApproval(
    db,
    approval.id,
    true,
    "Independent financial review",
    "person-1",
  );
  issueCredit(db, c.id, "person-1");
  return db.operations!.credits.find((row) => row.id === c.id)!;
}
function checkBounds(db: Database, invoice: Invoice) {
  const total = invoiceTotals(invoice),
    notes = db.operations!.credits.filter(
      (c) => c.invoiceId === invoice.id && c.status === "Issued",
    );
  const net = notes.reduce((sum, c) => sum + BigInt(c.net!), 0n),
    vat = notes.reduce((sum, c) => sum + BigInt(c.vat!), 0n),
    gross = notes.reduce((sum, c) => sum + cents(c.gross), 0n);
  expect(net).toBeLessThanOrEqual(total.net);
  expect(vat).toBeLessThanOrEqual(total.vat);
  expect(net + vat).toBe(gross);
  const pools = remainingCreditLines(db, invoice);
  expect(
    pools.every(
      (row) =>
        row.net >= 0n && row.vat >= 0n && row.gross === row.net + row.vat,
    ),
  ).toBe(true);
  expect(pools.reduce((sum, row) => sum + row.gross, 0n)).toBe(
    total.grand - gross,
  );
  return { net, vat, gross };
}
function legacyInvoice(invoice: Invoice) {
  delete invoice.snapshot!.allocationVersion;
  delete invoice.snapshot!.lineAllocations;
}

describe("FIX-A1-02 historical invoice allocation", () => {
  it("freezes the corrected one-fils line basis when issuing", () => {
    const { invoice } = issued(
      ["0.01", "0.01", "0.01"],
      ["Inclusive", "Inclusive", "Inclusive"],
      "0.02",
    );
    expect(invoice.snapshot!.allocationVersion).toBe(1);
    expect(invoice.snapshot!.lineAllocations!.map((row) => row.grand)).toEqual([
      "1",
      "0",
      "0",
    ]);
    const original = JSON.stringify(invoice.snapshot);
    invoice.lines[0].rate = "999";
    invoice.discount = "0";
    expect(invoiceItemTotals(invoice, invoice.lines[0].id).grand).toBe(1n);
    expect(JSON.stringify(invoice.snapshot)).toBe(original);
  });
  it("rejects duplicate item identity before freezing an invoice", () => {
    const { db, invoice } = issued(["1", "1"], ["Exclusive", "Exempt"]);
    const draft = blankInvoice(invoice.customerId, invoice.projectId);
    draft.lines = invoice.lines.map((line) => ({ ...line, id: "duplicate" }));
    expect(() => saveInvoice(db, draft)).toThrow("invoice items");
  });
  it.each(["Inclusive", "Exempt"] as const)(
    "blocks ambiguous legacy %s allocations even with nonnegative aggregate totals",
    (tax) => {
      const { db, invoice } = issued(
        ["10", "10", "0.01"],
        [tax, tax, tax],
        "0.02",
      );
      legacyInvoice(invoice);
      if (tax === "Inclusive")
        Object.assign(invoice.snapshot!, {
          net: "1904",
          vat: "95",
          grand: "1999",
        });
      const original = JSON.stringify(invoice.snapshot);
      expect(invoiceTotals(invoice).net).toBeGreaterThanOrEqual(0n);
      expect(invoiceTotals(invoice).vat).toBeGreaterThanOrEqual(0n);
      expect(() => invoiceItemTotals(invoice, invoice.lines[1].id)).toThrow(
        "explicit review",
      );
      expect(() => draftCredit(db, invoice, "10", invoice.lines[1].id)).toThrow(
        "explicit review",
      );
      expect(() => draftCredit(db, invoice, "0.01")).toThrow("explicit review");
      expect(JSON.stringify(invoice.snapshot)).toBe(original);
      expect(db.operations!.credits).toEqual([]);
    },
  );
  it("reconstructs a trustworthy legacy allocation without adding fields to its snapshot", () => {
    const { db, invoice } = issued(
      ["10", "20", "0"],
      ["Inclusive", "Inclusive", "Inclusive"],
      "0.01",
    );
    legacyInvoice(invoice);
    const original = JSON.stringify(invoice.snapshot);
    expect(invoiceCreditLines(invoice).map((row) => row.grand)).toEqual([
      1000n,
      1999n,
      0n,
    ]);
    credit(db, invoice, "5", invoice.lines[0].id);
    expect(JSON.stringify(invoice.snapshot)).toBe(original);
    expect(invoice.snapshot!.lineAllocations).toBeUndefined();
    checkBounds(db, invoice);
  });
  it("blocks a legacy snapshot whose valid line reconstruction disagrees with posted tax totals", () => {
    const { db, invoice } = issued();
    legacyInvoice(invoice);
    invoice.snapshot!.net = "101";
    invoice.snapshot!.vat = "4";
    const original = JSON.stringify(invoice.snapshot);
    expect(() => draftCredit(db, invoice, "0.11")).toThrow("explicit review");
    expect(JSON.stringify(invoice.snapshot)).toBe(original);
  });
  it.each(["missing", "duplicate", "negative", "version"] as const)(
    "rejects a %s frozen allocation without repricing it",
    (damage) => {
      const { db, invoice } = issued(["1", "1"], ["Exclusive", "Exempt"]);
      if (damage === "missing") delete invoice.snapshot!.lineAllocations;
      if (damage === "duplicate")
        invoice.snapshot!.lineAllocations![1].itemId = invoice.lines[0].id;
      if (damage === "negative")
        invoice.snapshot!.lineAllocations![0].vat = "-1";
      if (damage === "version") invoice.snapshot!.allocationVersion = 2 as 1;
      const original = JSON.stringify(invoice.snapshot);
      expect(() => draftCredit(db, invoice, "0.01")).toThrow("explicit review");
      expect(JSON.stringify(invoice.snapshot)).toBe(original);
    },
  );
});

describe("FIX-A1-02 cumulative credit capacity", () => {
  it("posts six 0.11 credits and the final 0.39 with exactly the original five VAT fils", () => {
    const { db, invoice } = issued(),
      original = JSON.stringify(invoice.snapshot),
      vats = [];
    for (let index = 0; index < 6; index++) {
      vats.push(credit(db, invoice, "0.11").vat);
      checkBounds(db, invoice);
    }
    expect(vats).toEqual(["1", "0", "1", "0", "1", "0"]);
    expect(checkBounds(db, invoice)).toEqual({ net: 63n, vat: 3n, gross: 66n });
    expect(credit(db, invoice, "0.39")).toMatchObject({ net: "37", vat: "2" });
    expect(checkBounds(db, invoice)).toEqual({
      net: 100n,
      vat: 5n,
      gross: 105n,
    });
    expect(JSON.stringify(invoice.snapshot)).toBe(original);
  });
  it.each(["Exclusive", "Inclusive", "Exempt", "Zero Rated"] as const)(
    "keeps repeated one-fils %s item/amount credits within posted components",
    (tax) => {
      const { db, invoice } = issued(["0.20"], [tax]),
        total = invoiceTotals(invoice);
      for (let index = 0; index < Number(total.grand); index++) {
        credit(db, invoice, "0.01", index % 2 ? invoice.lines[0].id : "");
        checkBounds(db, invoice);
      }
      expect(checkBounds(db, invoice)).toEqual({
        net: total.net,
        vat: total.vat,
        gross: total.grand,
      });
    },
  );
  it.each([
    [
      [1, "1.00"],
      [-1, "0.11"],
      [-1, "0.11"],
      [0, "0.23"],
    ],
    [
      [-1, "0.11"],
      [-1, "0.11"],
      [1, "0.20"],
      [2, "0.11"],
    ],
    [
      [0, "1.05"],
      [-1, "0.11"],
      [-1, "0.11"],
      [1, "0.20"],
    ],
    [
      [-1, "1.00"],
      [3, "0.20"],
      [-1, "0.31"],
      [1, "0.01"],
    ],
  ] satisfies [number, string][][])(
    "reconciles mixed-tax item/amount ordering %j",
    (...sequence) => {
      const { db, invoice } = issued(
        ["1", "1", "1.05", "1"],
        ["Exclusive", "Exempt", "Inclusive", "Zero Rated"],
      );
      const original = JSON.stringify(invoice.snapshot),
        prior = new Map<string, string>();
      for (const [line, amount] of sequence) {
        for (const c of db.operations!.credits)
          expect(JSON.stringify(c)).toBe(prior.get(c.id));
        const c = credit(
          db,
          invoice,
          amount,
          line < 0 ? "" : invoice.lines[line].id,
        );
        prior.set(c.id, JSON.stringify(c));
        checkBounds(db, invoice);
      }
      const remaining =
        invoiceTotals(invoice).grand - checkBounds(db, invoice).gross;
      credit(db, invoice, amountString(remaining));
      const total = invoiceTotals(invoice);
      expect(checkBounds(db, invoice)).toEqual({
        net: total.net,
        vat: total.vat,
        gross: total.grand,
      });
      expect(JSON.stringify(invoice.snapshot)).toBe(original);
    },
  );
  it("amount credits consume item capacity before a later item-credit reservation", () => {
    const { db, invoice } = issued(["100", "100"], ["Exempt", "Exempt"]);
    credit(db, invoice, "100");
    expect(remainingCreditLines(db, invoice).map((row) => row.gross)).toEqual([
      5000n,
      5000n,
    ]);
    expect(() => draftCredit(db, invoice, "100", invoice.lines[0].id)).toThrow(
      "selected item's",
    );
    credit(db, invoice, "50", invoice.lines[0].id);
    credit(db, invoice, "50", invoice.lines[1].id);
    expect(checkBounds(db, invoice).gross).toBe(20000n);
  });
  it("keeps a pending item credit available when an amount credit is issued first", () => {
    const { db, invoice } = issued(["100", "100"], ["Exempt", "Exempt"]);
    const pending = draftCredit(db, invoice, "100", invoice.lines[0].id);
    const amount = credit(db, invoice, "100");
    expect(amount.lineAllocations).toEqual([
      { itemId: invoice.lines[1].id, net: "10000", vat: "0", gross: "10000" },
    ]);
    const approval = submitApproval(
      db,
      "Credit Note",
      pending.id,
      "Internal",
      "person-0",
      "person-1",
    );
    decideApproval(
      db,
      approval.id,
      true,
      "Preserved pending item capacity",
      "person-1",
    );
    issueCredit(db, pending.id, "person-1");
    expect(checkBounds(db, invoice)).toEqual({
      net: 20000n,
      vat: 0n,
      gross: 20000n,
    });
  });
  it.each(["amount", "item"] as const)(
    "retains trustworthy historical %s credit totals while new allocations reconcile",
    (kind) => {
      const { db, invoice } = issued();
      legacyInvoice(invoice);
      const legacy: CreditNote = {
        id: uid(),
        number: "LEGACY-CN",
        invoiceId: invoice.id,
        projectId: invoice.projectId,
        customerId: invoice.customerId,
        date: today(),
        reason: "Historic posted credit",
        gross: "0.11",
        net: "10",
        vat: "1",
        itemId: kind === "item" ? invoice.lines[0].id : "",
        status: "Issued",
        issuedAt: new Date().toISOString(),
        snapshot: JSON.stringify({
          invoice,
          net: "10",
          vat: "1",
          gross: "0.11",
          company: db.operations!.settings.company,
        }),
      };
      db.operations!.credits.push(legacy);
      const original = JSON.stringify(legacy),
        invoiceOriginal = JSON.stringify(invoice.snapshot);
      expect(credit(db, invoice, "0.11").vat).toBe("0");
      credit(db, invoice, "0.83");
      expect(checkBounds(db, invoice)).toEqual({
        net: 100n,
        vat: 5n,
        gross: 105n,
      });
      expect(JSON.stringify(legacy)).toBe(original);
      expect(JSON.stringify(invoice.snapshot)).toBe(invoiceOriginal);
    },
  );
  it.each(["VAT", "net"] as const)(
    "blocks an already over-credited historical %s component without rewriting issued credits",
    (component) => {
      const { db, invoice } = issued();
      for (let n = 0; n < (component === "VAT" ? 6 : 101); n++)
        db.operations!.credits.push({
          id: uid(),
          number: `LEGACY-${n}`,
          invoiceId: invoice.id,
          projectId: invoice.projectId,
          customerId: invoice.customerId,
          date: today(),
          reason: "Legacy rounding",
          gross: component === "VAT" ? "0.11" : "0.01",
          net: component === "VAT" ? "10" : "1",
          vat: component === "VAT" ? "1" : "0",
          itemId: "",
          status: "Issued",
        });
      const original = JSON.stringify(db.operations!.credits);
      expect(() =>
        draftCredit(db, invoice, component === "VAT" ? "0.39" : "0.04"),
      ).toThrow("explicit review");
      expect(JSON.stringify(db.operations!.credits)).toBe(original);
    },
  );
  it("keeps a historical mixed-tax amount projection stable after new item and amount credits", () => {
    const { db, invoice } = issued(["1", "1"], ["Exclusive", "Exempt"]);
    legacyInvoice(invoice);
    const legacy: CreditNote = {
      id: uid(),
      number: "LEGACY-MIXED",
      invoiceId: invoice.id,
      projectId: invoice.projectId,
      customerId: invoice.customerId,
      date: today(),
      reason: "Historical amount adjustment",
      gross: "0.50",
      net: "49",
      vat: "1",
      itemId: "",
      status: "Issued",
      snapshot: JSON.stringify({ invoice, net: "49", vat: "1", gross: "0.50" }),
    };
    db.operations!.credits.push(legacy);
    const original = JSON.stringify(legacy);
    credit(db, invoice, "0.11", invoice.lines[0].id);
    const pool = remainingCreditLines(db, invoice).map((row) => ({ ...row }));
    expect(remainingCreditLines(db, invoice)).toEqual(pool);
    credit(db, invoice, "0.11");
    checkBounds(db, invoice);
    credit(
      db,
      invoice,
      amountString(
        invoiceTotals(invoice).grand - checkBounds(db, invoice).gross,
      ),
    );
    expect(checkBounds(db, invoice)).toEqual({
      net: 200n,
      vat: 5n,
      gross: 205n,
    });
    expect(JSON.stringify(legacy)).toBe(original);
  });
  it.each(["duplicate", "over-capacity", "version"] as const)(
    "blocks %s issued credit allocation metadata without changing the record",
    (damage) => {
      const { db, invoice } = issued(),
        c = credit(db, invoice, "0.11");
      if (damage === "duplicate")
        c.lineAllocations!.push({ ...c.lineAllocations![0] });
      if (damage === "over-capacity")
        Object.assign(c.lineAllocations![0], { net: "999", gross: "1000" });
      if (damage === "version") c.allocationVersion = 2 as 1;
      const original = JSON.stringify(c);
      expect(() => draftCredit(db, invoice, "0.11")).toThrow("explicit review");
      expect(JSON.stringify(c)).toBe(original);
    },
  );
  it("freezes new credit allocation history across reload and ignores forged draft posting fields", () => {
    const { db, invoice } = issued(),
      first = credit(db, invoice, "0.11"),
      original = JSON.stringify(first);
    const reload = JSON.parse(JSON.stringify(db)) as Database;
    initializeCommercial(reload);
    const i = reload.invoices[0],
      draft = draftCredit(reload, i, "0.11");
    const saved = saveCredit(
      reload,
      {
        ...draft,
        net: "999",
        vat: "999",
        allocationVersion: 1,
        lineAllocations: [
          { itemId: i.lines[0].id, net: "999", vat: "999", gross: "1998" },
        ],
      },
      "person-0",
    );
    expect(saved.net).toBeUndefined();
    expect(saved.lineAllocations).toBeUndefined();
    const approval = submitApproval(
      reload,
      "Credit Note",
      draft.id,
      "Internal",
      "person-0",
      "person-1",
    );
    decideApproval(reload, approval.id, true, "Reviewed", "person-1");
    issueCredit(reload, draft.id, "person-1");
    expect(reload.operations!.credits[1].vat).toBe("0");
    expect(JSON.stringify(reload.operations!.credits[0])).toBe(original);
    checkBounds(reload, i);
  });
  it("retains receipts/refunds/customer-credit accounting through repeated partial credits", () => {
    const { db, invoice } = issued();
    postPayment(db, {
      id: uid(),
      number: "",
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      projectId: invoice.projectId,
      date: today(),
      amount: "1.05",
      method: "Cash",
      reference: uid(),
      bank: "",
      notes: "",
      attachments: [],
      postingKey: uid(),
      createdAt: new Date().toISOString(),
    });
    for (let n = 0; n < 6; n++) credit(db, invoice, "0.11");
    expect(invoicePosition(db, invoice)).toBe(-66n);
    const refund = (amount: string) =>
      postRefund(
        db,
        {
          id: uid(),
          number: "",
          invoiceId: invoice.id,
          projectId: invoice.projectId,
          customerId: invoice.customerId,
          date: today(),
          amount,
          reference: uid(),
          method: "Cash",
          reason: "Return genuine credit",
        },
        "person-1",
      );
    refund("0.66");
    expect(invoicePosition(db, invoice)).toBe(0n);
    credit(db, invoice, "0.39");
    refund("0.39");
    expect(invoicePosition(db, invoice)).toBe(0n);
    expect(financials(db, emptyFilter)).toMatchObject({
      collected: 105n,
      credits: 105n,
      refunds: 105n,
      customerCredit: 0n,
    });
    expect(
      statementData(db, {
        ...emptyFilter,
        customerId: invoice.customerId,
      }).rows.at(-1)?.[5],
    ).toBe("0.00");
  });
  it("rejects an excessive allocation before consuming any credit capacity", () => {
    const { db, invoice } = issued();
    const before = JSON.stringify(db);
    expect(() => creditAllocation(db, invoice, 106n)).toThrow(
      "remaining billed",
    );
    expect(JSON.stringify(db)).toBe(before);
  });
});
