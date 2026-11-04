import { describe, expect, it } from "vitest";
import {
  createSharedCompanyState,
  applySharedCommand,
  type SharedActor,
} from "./domain";
import { serializeCanonical, hydrateCanonical } from "./canonical";
import { blankCustomer } from "../commercial/customer-domain";
import { blankInvoice, newProjectDetails } from "../commercial/repository";
import { reverseJournal } from "../accounting/core";

const owner: SharedActor = {
  userId: "owner",
  personId: "owner",
  companyId: "fictional",
  sessionId: "fixture",
  assurance: "aal2",
  grant: {
    userId: "owner",
    companyId: "fictional",
    active: true,
    roles: ["owner"],
    workspaces: ["manager", "accountant"],
    projectIds: ["project"],
    capabilities: [
      "project.write",
      "finance.simulate",
      "finance.draft",
      "access.manage",
    ],
  },
};
function fixture() {
  let state = createSharedCompanyState([
    {
      id: "owner",
      name: "Fictional Owner",
      role: "Project Manager",
      demoRole: "Owner",
      email: "owner@fictional.test",
      phone: "",
      status: "Active",
      capacity: 100,
    },
  ]);
  const run = (kind: string, payload: unknown) => {
    state = applySharedCommand(state, { kind, payload }, owner);
    return state;
  };
  run("customer.save", {
    customer: {
      ...blankCustomer(),
      id: "client",
      name: "Fictional canonical client",
      contact: "Fictional",
    },
  });
  run("project.create", {
    project: {
      ...newProjectDetails(
        state.manager,
        "client",
        "Fictional canonical project",
        "Fictional site",
      ),
      id: "project",
      managerId: "owner",
    },
    standard: false,
    planMode: "empty",
  });
  run("invoice.save", {
    invoice: {
      ...blankInvoice("client", "project"),
      id: "invoice",
      date: "2026-11-04",
      due: "2026-11-30",
      description: "Fictional original source",
      vatPercentage: "0",
      lines: [
        {
          id: "item",
          description: "Fictional scope",
          quantity: "1",
          rate: "100",
          tax: "Zero Rated",
        },
      ],
    },
  });
  run("invoice.issue", { id: "invoice" });
  return {
    state: () => state,
    run,
    replace: (next: typeof state) => {
      state = next;
    },
  };
}
describe("canonical immutable history and derived financial views", () => {
  it("retains the original issued snapshot after cancellation and preserves reversal source metadata", () => {
    const f = fixture(),
      issued = serializeCanonical(f.state());
    f.replace(hydrateCanonical(issued));
    f.run("invoice.cancel", {
      id: "invoice",
      reason: "Fictional correction only",
    });
    const cancelled = serializeCanonical(f.state());
    expect(cancelled.snapshots).toEqual(issued.snapshots);
    const reversal = cancelled.journals.find((value) => value.reversal_of);
    expect(reversal?.source_type).toBe("sales_invoice");
    expect(reversal?.source_id).toBe("invoice");
    expect(reversal?.domain_source.kind).toBe("Journal Reversal");
    const reloaded = hydrateCanonical(cancelled);
    expect(
      reloaded.finance.accounting.journals.find((value) => value.reversalOf)
        ?.reversalOf,
    ).toBe(reversal?.reversal_of);
    expect(serializeCanonical(reloaded)).toEqual(cancelled);
  });
  it("does not persist derived commercial adjustment arrays or duplicate credits", () => {
    const f = fixture();
    f.state().finance.commercialAdjustments = [
      {
        id: "runtime-only",
        documentId: "invoice",
        side: "receivable",
        date: "2026-11-04",
        deltaFils: "-1",
        kind: "credit",
      },
    ];
    const normalized = serializeCanonical(f.state());
    const metadata = normalized.records.find(
      (value) => value.entity_type === "workspace_metadata",
    )!.payload.metadata as { finance: object };
    expect(metadata.finance).not.toHaveProperty("commercialAdjustments");
    expect(hydrateCanonical(normalized).finance.commercialAdjustments).toEqual(
      [],
    );
  });
  it("rejects modification of an immutable snapshot at the same entity/revision", () => {
    const f = fixture(),
      original = serializeCanonical(f.state());
    f.replace(hydrateCanonical(original));
    f.state().manager.invoices[0].description = "Forged rewrite";
    expect(() => serializeCanonical(f.state())).toThrow(
      /Immutable canonical snapshot/,
    );
  });
  it("rejects orphaned or cyclic reversal sources instead of inventing a source record", () => {
    const f = fixture(),
      state = f.state();
    const original = state.finance.accounting.journals.find(
      (value) => value.source.id === "invoice",
    )!;
    state.finance.accounting = reverseJournal(state.finance.accounting, {
      id: "reversal",
      postingKey: "reversal",
      originalId: original.id,
      date: "2026-11-04",
      recordedAt: "2026-11-04T23:00:00.000Z",
      reason: "Fictional test",
    }).state;
    const bad = structuredClone(state);
    bad.finance.accounting = {
      ...bad.finance.accounting,
      journals: bad.finance.accounting.journals.map((value) =>
        value.id === "reversal" ? { ...value, reversalOf: "missing" } : value,
      ),
    };
    expect(() => serializeCanonical(bad)).toThrow(/original is missing/);
  });
});
