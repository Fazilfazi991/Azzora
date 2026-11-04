import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { seed } from "../domain/seed";
import { decodeSavedData } from "../domain/repository";
import {
  blankLine,
  changeQuotationStatus,
  newQuotation,
  saveQuotation,
} from "../quotation/repository";
import {
  blankInvoice,
  issueInvoice,
  saveInvoice,
} from "../commercial/repository";
import { initializeCommercial } from "../commercial/migration";
import { getProjectPlanning } from "../planning/compatibility";
import { createSharedCompanyState } from "./domain";
import { hydrateCanonical, serializeCanonical } from "./canonical";
import { createStagingBackup, verifyStagingBackup } from "./backup";
import type { Database } from "../domain/model";

const identityLists = (db: Database) =>
  Object.fromEntries(
    [
      "people",
      "clients",
      "projects",
      "phases",
      "assignments",
      "tasks",
      "milestones",
      "updates",
      "snags",
      "documents",
      "handover",
      "quotations",
      "invoices",
      "contracts",
      "payments",
      "expenses",
    ].map((key) => [
      key,
      ((db as unknown as Record<string, { id: string }[]>)[key] || [])
        .map((value) => value.id)
        .sort(),
    ]),
  );
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
function originalFictionalBrowserExport() {
  // Bundled demo seed only. Never reads localStorage, owner exports or cloud records.
  const db = seed();
  initializeCommercial(db);
  const project = db.projects[0],
    customer = db.clients.find((value) => value.id === project.clientId)!;
  const quote = newQuotation(db);
  quote.customerId = customer.id;
  quote.projectId = project.id;
  quote.customer = {
    name: customer.name,
    contact: customer.contact,
    address: "Fictional fixture address",
    phone: "",
    email: "fictional@migration.test",
  };
  quote.project = { name: project.name, location: project.location };
  quote.vatEnabled = false;
  quote.sections = [
    {
      id: "migration-section",
      number: "1",
      title: "Fictional migration work",
      rows: [
        {
          ...blankLine("1.1"),
          id: "migration-row",
          description: "Fictional fixture service",
          quantity: "1",
          rate: "100",
          unit: "each",
        },
      ],
    },
  ];
  quote.payments = [
    {
      id: "migration-payment-term",
      number: "1",
      description: "Fictional complete scope",
      percentage: "100",
      notes: "",
    },
  ];
  saveQuotation(db, quote, true);
  for (const status of ["Finalized", "Sent", "Accepted"] as const)
    changeQuotationStatus(db, quote.id, status);
  const invoice = {
    ...blankInvoice(customer.id, project.id),
    id: "migration-issued-invoice",
    date: "2026-11-04",
    due: "2026-11-30",
    description: "Fictional legacy issued record",
    vatPercentage: "0",
    lines: [
      {
        id: "migration-invoice-line",
        description: "Fictional service",
        quantity: "1",
        rate: "100",
        tax: "Zero Rated" as const,
      },
    ],
  };
  saveInvoice(db, invoice);
  issueInvoice(db, invoice.id);
  return JSON.stringify(db);
}
describe("offline additive browser-export migration rehearsal", () => {
  it("preserves all bundled-demo entity IDs/counts and task dates without creating a baseline", () => {
    const original = originalFictionalBrowserExport(),
      before = JSON.parse(original) as Database,
      beforeHash = digest(original);
    const migrated = decodeSavedData(original);
    expect(identityLists(migrated)).toEqual(identityLists(before));
    expect(
      migrated.tasks.map((task) => [task.id, task.start, task.due]),
    ).toEqual(before.tasks.map((task) => [task.id, task.start, task.due]));
    for (const project of migrated.projects)
      expect(getProjectPlanning(migrated, project.id).baselineHistory).toEqual(
        [],
      );
    expect(
      migrated.planning?.some((value) => value.baselineStatus === "Captured"),
    ).toBeFalsy();
    expect(digest(original)).toBe(beforeHash);
  });
  it("roundtrips accepted quotation history and issued invoice snapshots through canonical backup without auto posting", async () => {
    const original = originalFictionalBrowserExport(),
      before = JSON.parse(original) as Database,
      migrated = decodeSavedData(original),
      state = createSharedCompanyState();
    state.manager = migrated;
    const beforeJournalCount = state.finance.accounting.journals.length;
    const canonical = serializeCanonical(state),
      backup = await createStagingBackup(
        { version: 7, data: canonical },
        async () => {
          throw Error("This fixture contains no private file");
        },
      );
    const verified = verifyStagingBackup(JSON.parse(JSON.stringify(backup))),
      restored = hydrateCanonical(verified.data);
    expect(identityLists(restored.manager)).toEqual(identityLists(before));
    const accepted = before.quotations.find(
      (value) => value.status === "Accepted",
    )!;
    expect(
      restored.manager.quotations.find((value) => value.id === accepted.id),
    ).toEqual(accepted);
    expect(
      restored.manager.invoices.find(
        (value) => value.id === "migration-issued-invoice",
      )!.snapshot,
    ).toEqual(
      before.invoices.find((value) => value.id === "migration-issued-invoice")!
        .snapshot,
    );
    expect(restored.finance.accounting.journals).toHaveLength(
      beforeJournalCount,
    );
    expect(restored.finance.invoices).toEqual([]); // Legacy opening/posting reconciliation is deliberately not invented.
    expect(serializeCanonical(restored)).toEqual(canonical);
  });
  it("rejects malformed legacy exports while preserving their original byte strings for recovery", () => {
    for (const original of [
      "{malformed-json",
      JSON.stringify({ version: 999, projects: [], tasks: [] }),
      JSON.stringify({ ...seed(), tasks: "damaged" }),
    ]) {
      const before = digest(original);
      expect(() => decodeSavedData(original)).toThrow();
      expect(digest(original)).toBe(before);
    }
  });
});
