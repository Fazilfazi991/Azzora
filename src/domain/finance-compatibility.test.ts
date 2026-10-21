import { afterEach, describe, expect, it, vi } from "vitest";
import { seed } from "./seed";
import { decodeSavedData, localRepository, applySyntheticFinanceCommand } from "./repository";
import { initializeCommercial } from "../commercial/migration";
import { blankInvoice, issueInvoice, postPayment, saveInvoice } from "../commercial/repository";
import { createEmptyFinanceDemoState, type SyntheticFinanceEnvelope } from "../accounting/persistence";
import { legacyArApView } from "../accounting/legacy-ar-ap";

afterEach(() => vi.unstubAllGlobals());

function existingRecords() {
  const db = seed();
  initializeCommercial(db);
  const invoice = blankInvoice(db.clients[0].id, "");
  invoice.lines[0].description = "Historical demo service";
  invoice.lines[0].rate = "1";
  saveInvoice(db, invoice);
  issueInvoice(db, invoice.id);
  postPayment(db, {
    id: "legacy-receipt-c2",
    number: "",
    invoiceId: invoice.id,
    customerId: invoice.customerId,
    projectId: "",
    date: invoice.date,
    amount: "1.05",
    method: "Cash",
    reference: "legacy-receipt-c2",
    bank: "",
    notes: "",
    attachments: [],
    postingKey: "legacy-receipt-c2-key",
    createdAt: `${invoice.date}T00:00:00.000Z`,
  });
  return db;
}

const envelope: SyntheticFinanceEnvelope = {
  id: "fixture:checkpoint2:audit-bank",
  idempotencyKey: "fixture:checkpoint2:key-bank",
  actorId: "fixture:checkpoint2:actor",
  recordedAt: "2026-10-21T10:00:00.000Z",
  command: {
    kind: "AddAccount",
    account: {
      id: "fixture:checkpoint2:bank",
      code: "1000",
      name: "Synthetic bank",
      type: "Asset",
      postable: true,
      status: "Active",
    },
  },
};

describe("finance namespace at the CRM storage boundary", () => {
  it("shows legacy receivables in the Accountant preview without posting or changing saved records", () => {
    const db = existingRecords();
    const invoice = blankInvoice(db.clients[0].id, "");
    invoice.lines[0].description = "Unpaid demo service";
    invoice.lines[0].rate = "100";
    saveInvoice(db, invoice);
    issueInvoice(db, invoice.id);
    const before = JSON.stringify(db);
    const view = legacyArApView(db, invoice.date);
    expect(view.receivables).toEqual(expect.arrayContaining([
      expect.objectContaining({
        documentId: `sales:${invoice.id}`,
        number: db.invoices.find((item) => item.id === invoice.id)?.number,
        partyName: db.clients[0].name,
        outstandingFils: "10500",
      }),
    ]));
    expect(db.finance).toBeUndefined();
    expect(JSON.stringify(db)).toBe(before);
  });

  it("loads existing issued documents and receipts without creating finance data", () => {
    const db = existingRecords();
    const raw = JSON.stringify(db);
    const loaded = decodeSavedData(raw);
    expect(loaded.finance).toBeUndefined();
    expect(loaded.financeFixture).toBeUndefined();
    expect(JSON.stringify(loaded.invoices)).toBe(JSON.stringify(db.invoices));
    expect(JSON.stringify(loaded.payments)).toBe(JSON.stringify(db.payments));
    expect(JSON.stringify(loaded.contracts)).toBe(JSON.stringify(db.contracts));
    expect(JSON.stringify(loaded.quotations)).toBe(JSON.stringify(db.quotations));
    expect(JSON.stringify(loaded.projects)).toBe(JSON.stringify(db.projects));
  });

  it("commits only an explicitly marked synthetic command and retries byte-identically", () => {
    const db = existingRecords();
    db.financeFixture = { mode: "synthetic-demo", id: "checkpoint2" };
    db.finance = createEmptyFinanceDemoState("checkpoint2");
    let raw = JSON.stringify(db);
    vi.stubGlobal("localStorage", {
      getItem: () => raw,
      setItem: (_key: string, value: string) => { raw = value; },
    });
    const loaded = decodeSavedData(raw);
    const legacyDocuments = JSON.stringify({
      invoices: loaded.invoices,
      payments: loaded.payments,
      quotations: loaded.quotations,
      projects: loaded.projects,
      operations: loaded.operations,
    });
    applySyntheticFinanceCommand(loaded, envelope);
    localRepository.save(loaded);
    const committed = raw;
    const reloaded = decodeSavedData(raw);
    expect(reloaded.finance?.accounting.accounts).toHaveLength(1);
    expect(JSON.stringify({
      invoices: reloaded.invoices,
      payments: reloaded.payments,
      quotations: reloaded.quotations,
      projects: reloaded.projects,
      operations: reloaded.operations,
    })).toBe(legacyDocuments);
    applySyntheticFinanceCommand(reloaded, envelope);
    localRepository.save(reloaded);
    expect(raw).toBe(committed);
    expect(reloaded.finance?.accounting.journals).toHaveLength(0);
  });

  it("rejects malformed finance without changing the original saved bytes", () => {
    const db = existingRecords();
    db.financeFixture = { mode: "synthetic-demo", id: "checkpoint2" };
    db.finance = createEmptyFinanceDemoState("checkpoint2");
    const raw = JSON.stringify({ ...db, finance: { ...db.finance, mode: "live" } });
    vi.stubGlobal("localStorage", {
      getItem: () => raw,
      setItem: vi.fn(),
    });
    expect(() => localRepository.load()).toThrow(/incompatible at finance/);
    expect(localStorage.getItem("azzora-demo-v1")).toBe(raw);
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it("rolls back an attempted fixture write when browser storage fails", () => {
    const db = existingRecords();
    db.financeFixture = { mode: "synthetic-demo", id: "checkpoint2" };
    db.finance = createEmptyFinanceDemoState("checkpoint2");
    const raw = JSON.stringify(db);
    vi.stubGlobal("localStorage", {
      getItem: () => raw,
      setItem: () => { throw Error("Quota exceeded"); },
    });
    const next = structuredClone(db);
    applySyntheticFinanceCommand(next, envelope);
    expect(() => localRepository.save(next)).toThrow(/Quota exceeded/);
    expect(localStorage.getItem("azzora-demo-v1")).toBe(raw);
    expect(db.finance?.audit).toHaveLength(0);
  });

  it("does not let another save path remove existing synthetic history", () => {
    const db = existingRecords();
    db.financeFixture = { mode: "synthetic-demo", id: "checkpoint2" };
    db.finance = createEmptyFinanceDemoState("checkpoint2");
    let raw = JSON.stringify(db);
    const setItem = vi.fn((_key: string, value: string) => { raw = value; });
    vi.stubGlobal("localStorage", { getItem: () => raw, setItem });
    const next = structuredClone(db);
    delete next.finance;
    expect(() => localRepository.save(next)).toThrow(/cannot be removed/);
    expect(setItem).not.toHaveBeenCalled();
    expect(raw).toBe(JSON.stringify(db));
  });

  it("rejects a stale fixture write instead of replacing a newer command", () => {
    const db = existingRecords();
    db.financeFixture = { mode: "synthetic-demo", id: "checkpoint2" };
    db.finance = createEmptyFinanceDemoState("checkpoint2");
    let raw = JSON.stringify(db);
    const setItem = vi.fn((_key: string, value: string) => { raw = value; });
    vi.stubGlobal("localStorage", { getItem: () => raw, setItem });
    const first = structuredClone(db);
    applySyntheticFinanceCommand(first, envelope);
    localRepository.save(first);
    const committed = raw;
    const stale = structuredClone(db);
    applySyntheticFinanceCommand(stale, {
      ...envelope,
      id: "fixture:checkpoint2:audit-other",
      idempotencyKey: "fixture:checkpoint2:key-other",
      command: {
        kind: "AddAccount",
        account: {
          id: "fixture:checkpoint2:other",
          code: "1010",
          name: "Other synthetic account",
          type: "Asset",
          postable: true,
          status: "Active",
        },
      },
    });
    expect(() => localRepository.save(stale)).toThrow(/append-only/);
    expect(raw).toBe(committed);
    expect(setItem).toHaveBeenCalledTimes(1);
  });
});
