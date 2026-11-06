import { expect, it, vi, beforeEach, afterEach } from "vitest";
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-04T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());
import {
  applySharedCommand,
  createSharedCompanyState,
  type SharedActor,
} from "./domain";
import { hydrateCanonical, serializeCanonical } from "./canonical";
import { blankCustomer } from "../commercial/customer-domain";
import { blankInvoice, newProjectDetails } from "../commercial/repository";
import { reviewSnapshot } from "../accounts-review/domain";
import { StagingPolicyError } from "./commercial-commands";
const actor = (id = "owner"): SharedActor => ({
  userId: id,
  personId: id,
  companyId: "fictional",
  sessionId: id,
  assurance: id === "owner" ? "aal2" : "aal1",
  grant: {
    userId: id,
    companyId: "fictional",
    active: true,
    roles: [id === "owner" ? "owner" : "project_manager"],
    workspaces: id === "owner" ? ["manager", "accountant"] : ["manager"],
    projectIds: ["p"],
    capabilities: [
      "project.read",
      "project.write",
      "finance.simulate",
      "finance.draft",
      "access.manage",
    ],
  },
});
function fixture() {
  let state = createSharedCompanyState(
    ["owner", "pm"].map((id) => ({
      id,
      name: `Fictional ${id}`,
      role: "Project Manager",
      demoRole: id === "owner" ? "Owner" : "Project Manager",
      email: `${id}@staging.test`,
      phone: "",
      status: "Active",
      capacity: 100,
    })),
  );
  const run = (kind: string, payload: unknown, who = actor()) => {
    state = applySharedCommand(state, { kind, payload }, who);
    return state;
  };
  run("customer.save", {
    customer: {
      ...blankCustomer(),
      id: "c",
      name: "Fictional customer",
      contact: "Fictional contact",
    },
  });
  run("project.create", {
    project: {
      ...newProjectDetails(
        state.manager,
        "c",
        "Fictional project",
        "Fictional site",
      ),
      id: "p",
      managerId: "pm",
    },
    standard: false,
    planMode: "empty",
  });
  run("invoice.save", {
    invoice: {
      ...blankInvoice("c", "p"),
      id: "invoice",
      date: "2026-11-01",
      due: "2026-12-01",
      description: "Fictional itemized service",
      vatPercentage: "0",
      lines: [
        {
          id: "line",
          description: "Fictional service",
          quantity: "2",
          rate: "50",
          tax: "Zero Rated",
        },
      ],
    },
  });
  run("invoice.issue", { id: "invoice" });
  return {
    run,
    state: () => state,
    reload: () => {
      state = hydrateCanonical(serializeCanonical(state));
    },
    snapshot: () => reviewSnapshot(state.finance, "2026-11-04"),
  };
}
it("credits reduce the same AR control and income without changing the issued invoice", () => {
  const f = fixture(),
    original = JSON.stringify(f.state().manager.invoices[0]);
  f.run("credit.save", {
    credit: {
      id: "credit",
      number: "",
      invoiceId: "invoice",
      projectId: "p",
      customerId: "c",
      date: "2026-11-04",
      reason: "Fictional scope adjustment",
      gross: "20",
      itemId: "",
      status: "Draft",
    },
  });
  f.run("procurement.submit", {
    kind: "Credit Note",
    entityId: "credit",
    stage: "Credit authorization",
    approverId: "pm",
  });
  const approval = f.state().manager.operations!.approvals[0];
  f.run(
    "procurement.decide",
    {
      approvalId: approval.id,
      approved: true,
      comments: "Independently reviewed",
    },
    actor("pm"),
  );
  f.run("credit.issue", { id: "credit" });
  f.reload();
  expect(f.snapshot().metrics.receivablesFils).toBe("8000");
  expect(f.snapshot().metrics.revenueFils).toBe("8000");
  expect(JSON.stringify(f.state().manager.invoices[0])).toBe(original);
  expect(
    reviewSnapshot(f.state().finance, "2026-11-02").metrics.receivablesFils,
  ).toBe("10000");
  expect(f.snapshot().invoices[0].creditedFils).toBe("2000");
  expect(
    f
      .state()
      .finance.accounting.journals.filter((v) => v.source.id === "credit"),
  ).toHaveLength(1);
});
it("cancellation appends an exact reversal and preserves historical as-of balances", () => {
  const f = fixture();
  f.reload();
  const before = f
    .state()
    .finance.accounting.journals.find((v) => v.source.id === "invoice")!;
  f.run("invoice.cancel", {
    id: "invoice",
    reason: "Fictional duplicate issue correction",
  });
  f.reload();
  expect(f.snapshot().metrics.receivablesFils).toBe("0");
  expect(f.snapshot().metrics.revenueFils).toBe("0");
  expect(
    reviewSnapshot(f.state().finance, "2026-11-02").metrics.receivablesFils,
  ).toBe("10000");
  expect(
    f.state().finance.accounting.journals.find((v) => v.id === before.id),
  ).toEqual(before);
  expect(
    f
      .state()
      .finance.accounting.journals.filter((v) => v.reversalOf === before.id),
  ).toHaveLength(1);
  expect(
    serializeCanonical(f.state()).snapshots.some(
      (v) => v.entity_id === "invoice",
    ),
  ).toBe(true);
  expect(f.snapshot().invoices[0].cancellationDate).toBe("2026-11-04");
});
it("receipt reversal restores shared AR and cash while retaining the original settlement", () => {
  const f = fixture();
  f.run("accounts.action", {
    action: {
      kind: "receipt",
      id: "receipt",
      documentId: "invoice",
      date: "2026-11-04",
      amount: "25",
      account: "bank",
      reference: "Fictional receipt",
    },
  });
  expect(f.snapshot().metrics.receivablesFils).toBe("7500");
  f.run("payment.reverse", {
    id: "receipt",
    reason: "Fictional receipt correction",
  });
  f.reload();
  expect(f.snapshot().metrics.receivablesFils).toBe("10000");
  expect(f.snapshot().metrics.bankFils).toBe("10000000");
  expect(f.snapshot().receipts[0].reversedOn).toBe("2026-11-04");
  expect(
    f.state().finance.receipts.filter((v) => v.type === "posted"),
  ).toHaveLength(1);
  expect(f.state().manager.payments[0].reversedAt).toBeTruthy();
  expect(() =>
    f.run("payment.reverse", { id: "receipt", reason: "Duplicate correction" }),
  ).toThrow();
});
it("does not permit customer credit/advance or VAT policy to be silently inferred", () => {
  const f = fixture();
  expect(() => f.run("refund.post", { refund: {} })).toThrow(
    StagingPolicyError,
  );
  expect(() =>
    f.run("settings.save", {
      settings: {
        ...f.state().manager.operations!.settings,
        vatPercentage: "9",
      },
    }),
  ).toThrow(StagingPolicyError);
  const before = JSON.stringify(serializeCanonical(f.state()));
  expect(() =>
    f.run(
      "invoice.cancel",
      { id: "invoice", reason: "Unauthorized correction" },
      actor("pm"),
    ),
  ).toThrow(/privileged Owner/);
  expect(JSON.stringify(serializeCanonical(f.state()))).toBe(before);
});
it("projects original itemization and numbering to Accounts without inventing another amount", () => {
  const f = fixture(),
    invoice = f.state().manager.invoices[0],
    projected = f.snapshot().invoices[0];
  expect(projected.invoiceReference).toBe(invoice.number);
  expect(
    projected.items?.map((v) => [v.quantity, v.rate, v.amountFils]),
  ).toEqual([["2", "50", "10000"]]);
  expect(projected.amountFils).toBe("10000");
});
