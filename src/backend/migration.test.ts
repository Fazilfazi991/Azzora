import { describe, expect, it } from "vitest";
import { seed } from "../domain/seed";
import { prepareMigrationRehearsal, verifyMigrationArchive, findMigrationConflicts } from "./migration";

const identity = { companyId: "fictional-company", sourceId: "fictional-browser" };
describe("offline migration rehearsal", () => {
  it("retains malformed bytes without creating seed records or permitting posting", () => {
    const raw = " { broken 😀\n";
    const archive = prepareMigrationRehearsal(raw, identity);
    expect(archive.originalUtf8).toBe(raw);
    expect(archive.originalUtf8Bytes).toBe(Buffer.byteLength(raw));
    expect(archive.records).toEqual([]);
    expect(archive.issues).toContainEqual({ code: "malformed-json", path: "/" });
    expect(archive.financialPostingAllowed).toBe(false);
    expect(verifyMigrationArchive(archive)).toBe(true);
  });
  it("archives complete synthetic CRM history and unknown additive fields without mutation", () => {
    const fixture = { ...seed(), futureExtension: [{ id: "future", history: [{ id: "old-revision", snapshot: "{original bytes}" }] }] };
    const raw = JSON.stringify(fixture, null, 2);
    const archive = prepareMigrationRehearsal(raw, identity);
    expect(archive.originalUtf8).toBe(raw);
    expect(archive.collections["/projects"]).toBe(fixture.projects.length);
    expect(archive.records.some((record) => record.id === "old-revision")).toBe(true);
    expect(archive.issues).toEqual([]);
    expect(archive.rollback.sourceSha256).toBe(archive.originalSha256);
    expect(verifyMigrationArchive(archive)).toBe(true);
  });
  it("rejects duplicate IDs and different IDs sharing a business number", () => {
    const db = { ...seed(), invoices: [{ id: "same", number: " Q1 " }, { id: "same", number: "Q2" }, { id: "different", number: "q1" }] };
    const archive = prepareMigrationRehearsal(JSON.stringify(db), identity);
    expect(archive.issues.map((issue) => issue.code)).toContain("duplicate-id");
    expect(archive.issues.map((issue) => issue.code)).toContain("conflicting-reference");
    expect(archive.readyForCanonicalMapping).toBe(false);
  });
  it("detects changed source, manifests, historical records and financial controls", () => {
    const archive = prepareMigrationRehearsal(JSON.stringify(seed()), identity);
    for (const tamper of [
      (value: typeof archive) => { value.originalUtf8 += " "; },
      (value: typeof archive) => { value.collections["/projects"] += 1; },
      (value: typeof archive) => { value.records[0].hash = "forged"; },
      (value: typeof archive) => { value.controls.activeCustomerReceiptsFils = "99999"; },
    ]) {
      const changed = structuredClone(archive); tamper(changed);
      expect(verifyMigrationArchive(changed)).toBe(false);
    }
  });
  it("reports cross-browser same-ID conflicts without merging records", () => {
    const db = seed();
    const first = prepareMigrationRehearsal(JSON.stringify(db), identity);
    db.projects[0].name = "Different fictional project";
    const second = prepareMigrationRehearsal(JSON.stringify(db), { ...identity, sourceId: "second-browser" });
    expect(findMigrationConflicts([first, second])).toContainEqual({ code: "conflicting-record", path: "/projects" });
    expect(findMigrationConflicts([first, first])).toContainEqual({ code: "duplicate-source", path: identity.sourceId });
  });
  it("does not infer opening balances or import a synthetic journal", () => {
    const db = { ...seed(), financeFixture: { mode: "synthetic-demo", id: "example" } };
    const archive = prepareMigrationRehearsal(JSON.stringify(db), identity);
    expect(archive.issues.map((issue) => issue.code)).toContain("synthetic-journal-quarantined");
    expect(archive.readyForCanonicalMapping).toBe(false);
    expect(archive.financialPostingAllowed).toBe(false);
  });
  it("rejects null input instead of silently bootstrapping seed data", () => {
    expect(prepareMigrationRehearsal("null", identity).issues[0].code).toBe("invalid-root");
  });
  it("validates source relationship consistency", () => {
    const db = seed(); db.tasks[0].projectId = "missing";
    const archive = prepareMigrationRehearsal(JSON.stringify(db), identity);
    expect(archive.issues.map((issue) => issue.code)).toContain("schema-or-relationship-invalid");
  });
  it("reconciles source integer-fils snapshots separately from decimal AED receipts", () => {
    const db = { ...seed(), invoices: [
      { id: "i1", number: "I1", status: "Issued", snapshot: { grand: "10500" } },
      { id: "i2", number: "I2", status: "Draft", snapshot: { grand: "99999" } },
    ], payments: [
      { id: "p1", amount: "20.25" }, { id: "p2", amount: "10.00", reversedAt: "2026-01-01" },
    ] };
    const archive = prepareMigrationRehearsal(JSON.stringify(db), identity);
    expect(archive.controls.issuedInvoiceGrossFils).toBe("10500");
    expect(archive.controls.activeCustomerReceiptsFils).toBe("2025");
    expect(archive.readyForCanonicalMapping).toBe(false); // Deliberately incomplete records never become importable.
  });
  it("rejects fractional-fils monetary controls rather than rounding source data", () => {
    const db = { ...seed(), payments: [{ id: "p", amount: "1.005" }] };
    const archive = prepareMigrationRehearsal(JSON.stringify(db), identity);
    expect(archive.issues).toContainEqual({ code: "invalid-financial-control", path: "activeCustomerReceiptsFils" });
    expect(archive.controls.activeCustomerReceiptsFils).toBeUndefined();
  });
});
