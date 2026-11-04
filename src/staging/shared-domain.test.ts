import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Person } from "../domain/model";
import { blankCustomer } from "../commercial/customer-domain";
import { blankInvoice, newProjectDetails } from "../commercial/repository";
import { blankLine } from "../quotation/repository";
import { balanceDue } from "../commercial/calculations";
import { supplierBalance, projectCosts } from "../operations/calculations";
import { reviewSnapshot } from "../accounts-review/domain";
import { blankFields } from "../accounts-review/documents/model";
import { AccessDenied } from "../backend/permissions";
import {
  applySharedCommand,
  createSharedCompanyState,
  sharedExpenseSubmissions,
  sharedManagerView,
  type SharedActor,
  type SharedCompanyState,
} from "./domain";
import { hydrateCanonical, serializeCanonical } from "./canonical";

const people: Person[] = [
  ["owner", "Owner", "Owner"],
  ["pm", "Project Manager", "Project Manager"],
  ["accountant", "Accountant", "Accounts"],
  ["staff", "Site Engineer", "Site"],
].map(([id, role, demoRole]) => ({
  id,
  name: `Fictional ${id}`,
  role,
  demoRole,
  email: `${id}@staging.test`,
  phone: "",
  status: "Active",
  capacity: 100,
}));
const actor = (id: string): SharedActor => ({
  userId: id,
  personId: id,
  companyId: "fictional",
  sessionId: `${id}-session`,
  assurance: ["owner", "accountant"].includes(id) ? "aal2" : "aal1",
  grant: {
    userId: id,
    companyId: "fictional",
    active: true,
    roles: [
      id === "owner"
        ? "owner"
        : id === "pm"
          ? "project_manager"
          : id === "staff"
            ? "site_staff"
            : "accountant",
    ],
    workspaces:
      id === "accountant"
        ? ["accountant"]
        : id === "owner"
          ? ["manager", "accountant"]
          : ["manager"],
    projectIds: ["p1"],
    capabilities: [
      "project.read",
      "project.write",
      "expense.submit",
      "expense.approve",
      "finance.read",
      "finance.draft",
      "finance.simulate",
    ],
  },
});
function fixture() {
  let state = createSharedCompanyState(people);
  const run = (kind: string, payload: unknown, user = actor("owner")) => {
    state = applySharedCommand(state, { kind, payload }, user);
    return state;
  };
  const customer = {
    ...blankCustomer(),
    id: "c1",
    name: "Fictional Client",
    contact: "Fictional contact",
  };
  run("customer.save", { customer });
  const project = {
    ...newProjectDetails(
      state.manager,
      "c1",
      "Fictional fitout",
      "Fictional Dubai site",
    ),
    id: "p1",
    managerId: "pm",
  };
  run("project.create", { project, standard: false, planMode: "empty" });
  return { run, state: () => state };
}
function sale(f = fixture()) {
  f.run("quotation.new", { projectId: "p1" });
  const quote = structuredClone(f.state().manager.quotations[0]);
  quote.sections = [
    {
      id: "scope",
      number: "1",
      title: "Fictional scope",
      rows: [
        {
          ...blankLine("1.1"),
          id: "item",
          description: "Fictional installation",
          quantity: "2",
          rate: "500",
          unit: "each",
        },
      ],
    },
  ];
  quote.vatEnabled = false;
  quote.payments = [
    {
      id: "full",
      number: "1",
      description: "Complete fictional scope",
      percentage: "100",
      notes: "",
    },
  ];
  f.run("quotation.save", { quotation: quote, validate: true });
  for (const status of ["Finalized", "Sent", "Accepted"])
    f.run("quotation.status", { id: quote.id, status });
  f.run("quotation.convert", { quotationId: quote.id, projectId: "p1" });
  f.run("invoice.from-quotation", { quotationId: quote.id });
  const invoice = f.state().manager.invoices[0];
  f.run("invoice.issue", { id: invoice.id });
  return { ...f, invoiceId: invoice.id, quotationId: quote.id };
}
function purchase(f = fixture()) {
  f.run("supplier.save", {
    supplier: {
      id: "supplier",
      code: "",
      name: "Fictional Supplier",
      contact: "",
      phone: "",
      whatsapp: "",
      email: "",
      address: "",
      emirate: "",
      country: "",
      trn: "",
      bank: "",
      category: "",
      terms: "",
      notes: "",
      status: "Active",
      createdAt: "2026-11-04T00:00:00.000Z",
    },
  });
  f.run("procurement.material", {
    entity: {
      id: "material",
      number: "",
      projectId: "p1",
      name: "Fictional material",
      specification: "",
      unit: "each",
      quantity: "2",
      requiredDate: "2026-11-04",
      requesterId: "owner",
      priority: "Normal",
      notes: "",
      attachments: [],
    },
  });
  f.run("procurement.request", {
    entity: {
      id: "request",
      number: "",
      projectId: "p1",
      materialIds: ["material"],
      requesterId: "owner",
      date: "2026-11-04",
      notes: "",
      status: "Draft",
    },
  });
  const approve = (kind: string, entityId: string) => {
    f.run("procurement.submit", {
      kind,
      entityId,
      stage: "Internal",
      approverId: "pm",
    });
    const approvalId = f.state().manager.operations!.approvals.at(-1)!.id;
    f.run(
      "procurement.decide",
      {
        approvalId,
        approved: true,
        comments: "Fictional independent approval",
      },
      actor("pm"),
    );
  };
  approve("Purchase Request", "request");
  f.run("procurement.rfqs", {
    requestId: "request",
    supplierIds: ["supplier"],
    deliveryDate: "2026-11-04",
    deadline: "2026-11-04",
  });
  const rfq = f.state().manager.operations!.rfqs[0];
  f.run("procurement.quote", {
    entity: {
      id: "supplier-quote",
      number: "",
      rfqId: rfq.id,
      projectId: "p1",
      supplierId: "supplier",
      items: rfq.items.map((item) => ({
        ...item,
        rate: "50",
        tax: "Zero Rated",
      })),
      deliveryCharge: "0",
      vatPercentage: "0",
      leadDays: 0,
      terms: "Fictional",
      remarks: "",
      status: "Received",
    },
  });
  approve("Supplier Quotation", "supplier-quote");
  f.run("procurement.order", {
    supplierQuoteId: "supplier-quote",
    location: "Fictional project",
    date: "2026-11-04",
  });
  const po = f.state().manager.operations!.orders[0];
  approve("Purchase Order", po.id);
  f.run("procurement.delivery", {
    delivery: {
      id: "delivery",
      number: "",
      poId: po.id,
      projectId: "p1",
      date: "2026-11-04",
      quantities: po.items.map((item) => ({ itemId: item.id, quantity: "2" })),
      receiverId: "owner",
      reference: "FICT-GRN-1",
      remarks: "",
    },
  });
  f.run("procurement.bill", {
    bill: {
      id: "bill",
      reference: "FICT-BILL-1",
      poId: po.id,
      projectId: "p1",
      supplierId: "supplier",
      date: "2026-11-04",
      due: "2026-11-30",
      quantities: po.items.map((item) => ({ itemId: item.id, quantity: "2" })),
      deliveryCharge: "0",
      status: "Issued",
    },
  });
  return f;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-04T12:00:00.000Z"));
});
afterEach(() => vi.useRealTimers());
describe("shared fictional company domain and canonical projections", () => {
  it("atomically links a new project only to an editable quotation for the same registered customer", () => {
    const f = fixture();
    f.run("quotation.new", { projectId: "p1" });
    const quotation = f.state().manager.quotations[0];
    const project = {
      ...newProjectDetails(
        f.state().manager,
        "c1",
        "Fictional linked project",
        "Fictional site",
      ),
      id: "linked-project",
      managerId: "pm",
    };
    f.run("project.create", {
      project,
      quotationId: quotation.id,
      planMode: "empty",
    });
    expect(f.state().manager.quotations[0].projectId).toBe(project.id);
    expect(f.state().manager.quotations[0].project.name).toBe(project.name);
    const accepted = sale();
    const before = structuredClone(accepted.state());
    expect(() =>
      accepted.run("project.create", {
        project: { ...project, id: "forbidden-project" },
        quotationId: accepted.quotationId,
        planMode: "empty",
      }),
    ).toThrow(/draft quotation/);
    expect(accepted.state()).toEqual(before);
  });
  it("classifies staff approval and genuine self-approval as forbidden while preserving validation errors", () => {
    const f = fixture();
    const submission = {
      id: "permission-expense",
      projectId: "p1",
      date: "2026-11-04",
      payee: "Fictional shop",
      description: "Fictional evidence",
      amount: "10",
    };
    f.run("expense.submit", submission, actor("pm"));
    const decide = (user: SharedActor, comments = "Fictional review") =>
      f.run(
        "expense.approve",
        { id: submission.id, approved: true, comments },
        user,
      );
    for (const user of [actor("staff"), actor("pm")]) {
      try {
        decide(user);
        throw Error("Expected forbidden approval");
      } catch (error) {
        expect(error).toBeInstanceOf(AccessDenied);
        expect((error as AccessDenied).status).toBe(403);
      }
    }
    try {
      decide(actor("owner"), "");
      throw Error("Expected invalid comments");
    } catch (error) {
      expect(error).not.toBeInstanceOf(AccessDenied);
      expect((error as Error).message).toMatch(/comments/i);
    }
    expect(f.state().expenseSubmissions[0].status).toBe("Submitted");
    expect(f.state().finance.expenses).toEqual([]);
  });
  it("classifies workspace, revoked capability and unrelated-project denials as forbidden", () => {
    const f = fixture(),
      revoked = actor("pm"),
      unrelated = actor("pm");
    revoked.grant.capabilities = [];
    unrelated.grant.projectIds = [];
    for (const [user, kind, payload] of [
      [
        actor("accountant"),
        "customer.save",
        { customer: f.state().manager.clients[0] },
      ],
      [revoked, "quotation.new", { projectId: "p1" }],
      [unrelated, "quotation.new", { projectId: "p1" }],
    ] as const) {
      try {
        f.run(kind, payload, user);
        throw Error("Expected forbidden command");
      } catch (error) {
        expect(error).toBeInstanceOf(AccessDenied);
        expect((error as AccessDenied).status).toBe(403);
      }
    }
  });
  it("bootstraps no reference quotation, customer, invoice or real financial record", () => {
    const state = createSharedCompanyState(people);
    expect(state.manager.quotations).toEqual([]);
    expect(state.manager.clients).toEqual([]);
    expect(state.finance.invoices).toEqual([]);
    expect(state.finance.accounting.journals[0].memo).toContain("Fictional");
    expect(
      serializeCanonical(state).records.filter(
        (item) => item.entity_type === "cash_account",
      ),
    ).toHaveLength(2);
  });
  it("Manager customer-to-contract issue becomes the same Accountant invoice and receipt", () => {
    const f = sale();
    const before = JSON.stringify(f.state().manager.quotations[0]);
    expect(f.state().finance.invoices[0].id).toBe(f.invoiceId);
    f.run(
      "accounts.action",
      {
        action: {
          kind: "receipt",
          id: "receipt",
          documentId: f.invoiceId,
          date: "2026-11-04",
          amount: "250",
          account: "bank",
          reference: "FICT-RCPT-1",
        },
      },
      actor("accountant"),
    );
    expect(balanceDue(f.state().manager, f.state().manager.invoices[0])).toBe(
      75000n,
    );
    expect(f.state().manager.payments[0].id).toBe("receipt");
    expect(f.state().finance.receipts[0].id).toBe("receipt");
    expect(JSON.stringify(f.state().manager.quotations[0])).toBe(before);
    expect(f.state().finance.accounting.journals).toHaveLength(3);
    const rows = serializeCanonical(f.state()).records.filter(
      (item) => item.entity_type === "sales_invoice",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].payload.manager).toBeTruthy();
    expect(rows[0].payload.finance).toBeTruthy();
  });
  it("rejects duplicate invoice issue and over-allocation without altering the prior shared state", () => {
    const f = sale();
    const prior = serializeCanonical(f.state());
    expect(() => f.run("invoice.issue", { id: f.invoiceId })).toThrow(/draft/i);
    expect(() =>
      f.run(
        "accounts.action",
        {
          action: {
            kind: "receipt",
            id: "bad",
            documentId: f.invoiceId,
            date: "2026-11-04",
            amount: "1001",
            account: "bank",
          },
        },
        actor("accountant"),
      ),
    ).toThrow();
    expect(serializeCanonical(f.state())).toEqual(prior);
  });
  it("roundtrips canonical rows without duplicating source documents or ledger history", () => {
    const f = sale();
    const canonical = serializeCanonical(f.state());
    const restored = hydrateCanonical(JSON.parse(JSON.stringify(canonical)));
    expect(serializeCanonical(restored)).toEqual(canonical);
    expect(restored.manager.invoices[0].snapshot).toEqual(
      f.state().manager.invoices[0].snapshot,
    );
    expect(restored.finance.accounting.journals).toEqual(
      f.state().finance.accounting.journals,
    );
  });
  it("runs approved procurement to a single bill/cost and Accountant supplier payment", () => {
    const f = purchase();
    expect(f.state().finance.bills[0].id).toBe("bill");
    expect(f.state().manager.expenses).toHaveLength(1);
    f.run(
      "accounts.action",
      {
        action: {
          kind: "supplier-payment",
          id: "supplier-payment",
          documentId: "bill",
          date: "2026-11-04",
          amount: "40",
          account: "bank",
          reference: "FICT-SP-1",
        },
      },
      actor("accountant"),
    );
    expect(supplierBalance(f.state().manager, "bill")).toBe(6000n);
    expect(f.state().manager.operations!.supplierPayments[0].id).toBe(
      "supplier-payment",
    );
    expect(
      f
        .state()
        .finance.accounting.journals.filter(
          (item) => item.source.id === "bill",
        ),
    ).toHaveLength(1);
    expect(projectCosts(f.state().manager, "p1").actual).toBe(10000n);
    expect(
      serializeCanonical(hydrateCanonical(serializeCanonical(f.state()))),
    ).toEqual(serializeCanonical(f.state()));
  });
  it("reconciles the shared journal with AR/AP, gross versus net profit and cash reports", () => {
    const f = purchase(sale());
    f.run(
      "accounts.action",
      {
        action: {
          kind: "receipt",
          id: "receipt",
          documentId: f.state().finance.invoices[0].id,
          date: "2026-11-04",
          amount: "250",
          account: "bank",
        },
      },
      actor("accountant"),
    );
    f.run(
      "accounts.action",
      {
        action: {
          kind: "expense",
          id: "company-expense",
          date: "2026-11-04",
          payee: "Fictional shop",
          description: "Fictional overhead",
          amount: "20",
          account: "bank",
          scope: "company",
        },
      },
      actor("accountant"),
    );
    const report = reviewSnapshot(f.state().finance, "2026-11-04");
    expect(report.metrics).toMatchObject({
      revenueFils: "100000",
      costOfSalesFils: "10000",
      operatingExpensesFils: "2000",
      grossProfitFils: "90000",
      netProfitFils: "88000",
      receivablesFils: "75000",
      payablesFils: "10000",
      bankFils: "10023000",
      cashFils: "0",
    });
    expect(report.trial.balanced).toBe(true);
    expect(report.balance.balanced).toBe(true);
  });
  it("saves document corrections and supplier defaults without creating any financial posting", () => {
    const f = fixture(),
      state = f.state();
    const fields = {
      ...blankFields(),
      documentType: "quotation" as const,
      supplier: "Fictional shop",
      date: "2026-11-04",
      reference: "FICT-QUOTE",
      currency: "AED" as const,
      total: "25",
      kind: "company-expense" as const,
      categoryId: "company-expenses",
    };
    state.finance.documentEntries!.reviews.push({
      id: "review",
      sha256: "fictional-digest",
      attachmentId: "attachment",
      createdAt: "2026-11-04T00:00:00.000Z",
      fields: blankFields(),
      status: "Review",
      revision: 0,
      corrections: [],
      warnings: [],
      extraction: {
        reviewOnly: true,
        requestedMode: "manual",
        fields: blankFields(),
        uncertain: [],
        provider: "Manual",
        mode: "manual",
        inputTokens: null,
        outputTokens: null,
        costUsd: null,
        latencyMs: 0,
        retries: 0,
      },
    });
    state.finance.attachments.push({
      id: "attachment",
      name: "fictional.txt.png",
      mime: "image/png",
      data: "data:image/png;base64,AA==",
      size: 1,
    });
    const before = structuredClone(state.finance.accounting);
    f.run(
      "accounts.action",
      {
        action: {
          kind: "document-draft",
          id: "draft",
          reviewId: "review",
          revision: 0,
          fields,
          confirmed: true,
          rememberSupplier: true,
        },
      },
      actor("accountant"),
    );
    expect(f.state().finance.accounting).toEqual(before);
    expect(f.state().finance.bills).toEqual([]);
    expect(f.state().finance.expenses).toEqual([]);
    expect(
      f.state().finance.documentEntries!.reviews[0].corrections,
    ).toHaveLength(1);
    expect(f.state().finance.documentEntries!.defaults[0].supplier).toBe(
      "Fictional shop",
    );
    const normalized = serializeCanonical(f.state());
    const documents = normalized.records.filter(
      (item) => item.entity_type === "document",
    );
    expect(documents).toHaveLength(2);
    expect(
      documents.find((item) => item.id === "attachment:attachment")!.payload
        .attachment,
    ).toEqual(f.state().finance.attachments[0]);
    expect(documents.find((item) => item.id === "review:review")!.status).toBe(
      "draft",
    );
    const metadata = normalized.records.find(
      (item) => item.entity_type === "workspace_metadata",
    )!.payload.metadata as {
      finance: Record<string, unknown>;
      documentDefaults: unknown;
      documentEntryVersion: number;
    };
    expect(metadata.finance).not.toHaveProperty("attachments");
    expect(metadata.finance).not.toHaveProperty("documentEntries");
    expect(metadata.documentDefaults).toEqual(
      f.state().finance.documentEntries!.defaults,
    );
    expect(metadata.documentEntryVersion).toBe(1);
    expect(
      serializeCanonical(hydrateCanonical(serializeCanonical(f.state()))),
    ).toEqual(serializeCanonical(f.state()));
    expect(() =>
      f.run(
        "accounts.action",
        {
          action: {
            kind: "create-expense-from-review",
            id: "forbidden",
            reviewId: "review",
            revision: 1,
            confirmed: true,
            account: "bank",
          },
        },
        actor("accountant"),
      ),
    ).toThrow(/review drafts only/);
    // The server strips inline content after private Storage upload; the codec preserves its opaque pointer.
    const stored = structuredClone(normalized);
    const attachment = stored.records.find(
      (item) => item.id === "attachment:attachment",
    )!.payload.attachment as Record<string, unknown>;
    attachment.data = "";
    attachment.storageObjectKey = "fictional-company/private-attachment";
    expect(serializeCanonical(hydrateCanonical(stored))).toEqual(stored);
    const incompatible = structuredClone(stored);
    (
      incompatible.records.find(
        (item) => item.entity_type === "workspace_metadata",
      )!.payload.metadata as Record<string, unknown>
    ).documentEntryVersion = 99;
    expect(() => hydrateCanonical(incompatible)).toThrow(/incompatible/);
  });
  it("keeps Accountant invoice itemization authoritative rather than flattening it through Manager edits", () => {
    const f = fixture();
    f.run(
      "accounts.action",
      {
        action: {
          kind: "invoice",
          id: "tax-draft",
          party: "Fictional Client",
          date: "2026-11-04",
          due: "2026-11-30",
          description: "Fictional tax evidence",
          items: [
            {
              description: "Fictional item",
              quantity: "2",
              unit: "each",
              rate: "10",
            },
          ],
          issue: false,
          invoiceType: "Tax Invoice",
          projectId: "p1",
        },
      },
      actor("accountant"),
    );
    expect(() => f.run("invoice.issue", { id: "tax-draft" })).toThrow(
      /Accountant-origin/,
    );
    expect(() =>
      f.run("invoice.save", { invoice: f.state().manager.invoices[0] }),
    ).toThrow(/Accountant-origin/);
    expect(f.state().finance.invoices[0].items).toHaveLength(1);
  });
  it("preserves Manager item content when the Accountant explicitly issues its existing draft", () => {
    const f = sale();
    // A second explicit Manager draft isolates issuance from the already issued first invoice.
    const invoice = {
      ...blankInvoice("c1", "p1"),
      id: "second-invoice",
      date: "2026-11-04",
      due: "2026-11-30",
      description: "Fictional second invoice",
      lines: [
        {
          id: "custom",
          description: "Keep this exact Manager description",
          quantity: "3",
          rate: "10",
          tax: "Zero Rated",
        },
      ],
    };
    f.run("invoice.save", { invoice });
    const original = structuredClone(
      f.state().manager.invoices.find((item) => item.id === "second-invoice")!
        .lines,
    );
    f.run(
      "accounts.action",
      { action: { kind: "issue-invoice", id: "second-invoice" } },
      actor("accountant"),
    );
    expect(
      f.state().manager.invoices.find((item) => item.id === "second-invoice")!
        .lines,
    ).toEqual(original);
    expect(
      f.state().finance.invoices.find((item) => item.id === "second-invoice")!
        .status,
    ).toBe("Issued");
  });
  it("separates staff submission, independent approval and explicit fictional expense posting", () => {
    const f = fixture();
    const journals = f.state().finance.accounting.journals.length;
    f.run(
      "expense.submit",
      {
        id: "submitted-expense",
        projectId: "p1",
        date: "2026-11-04",
        payee: "Fictional shop",
        description: "Fictional site material",
        amount: "75",
        ledgerId: "project-materials",
        departmentId: "CIVIL",
      },
      actor("staff"),
    );
    expect(f.state().finance.accounting.journals).toHaveLength(journals);
    expect(() =>
      f.run(
        "expense.approve",
        { id: "submitted-expense", approved: true, comments: "Self" },
        actor("staff"),
      ),
    ).toThrow();
    f.run(
      "expense.approve",
      {
        id: "submitted-expense",
        approved: true,
        comments: "Reviewed independent fictional evidence",
      },
      actor("pm"),
    );
    expect(f.state().finance.accounting.journals).toHaveLength(journals);
    f.run(
      "accounts.action",
      {
        action: {
          kind: "expense",
          id: "submitted-expense",
          date: "2026-11-04",
          payee: "Client forgery",
          description: "Changed",
          amount: "1",
          account: "bank",
          scope: "project",
          projectId: "p1",
        },
      },
      actor("accountant"),
    );
    expect(f.state().finance.expenses[0].amountFils).toBe("7500");
    expect(f.state().finance.expenses[0].payee).toBe("Fictional shop");
    expect(f.state().expenseSubmissions[0].status).toBe("Posted");
    expect(f.state().manager.expenses[0].amount).toBe("75.00");
  });
  it("keeps unapproved submission details from Accountant and unrelated Staff", () => {
    const f = fixture();
    f.run(
      "expense.submit",
      {
        id: "expense",
        projectId: "p1",
        date: "2026-11-04",
        payee: "Fictional",
        description: "Fictional cost",
        amount: "10",
      },
      actor("staff"),
    );
    expect(sharedExpenseSubmissions(f.state(), actor("accountant"))).toEqual(
      [],
    );
    const other = actor("staff");
    other.userId = "other";
    other.grant.userId = "other";
    expect(sharedExpenseSubmissions(f.state(), other)).toEqual([]);
  });
  it("allows PM own unassigned customer draft then project creation and preserves creator server-side", () => {
    let state = createSharedCompanyState(people);
    const pm = actor("pm");
    pm.grant.projectIds = [];
    state = applySharedCommand(
      state,
      {
        kind: "customer.save",
        payload: {
          customer: {
            ...blankCustomer(),
            id: "pm-client",
            name: "PM Fictional Client",
            stagingCreatedBy: "owner",
          },
        },
      },
      pm,
    );
    expect(sharedManagerView(state, pm).clients.map((item) => item.id)).toEqual(
      ["pm-client"],
    );
    const customer = { ...state.manager.clients[0], stagingCreatedBy: "owner" };
    state = applySharedCommand(
      state,
      { kind: "customer.save", payload: { customer } },
      pm,
    );
    expect((state.manager.clients[0] as typeof customer).stagingCreatedBy).toBe(
      "pm",
    );
    const project = {
      ...newProjectDetails(
        state.manager,
        "pm-client",
        "PM Fictional Project",
        "Fictional site",
      ),
      id: "pm-project",
      managerId: "pm",
    };
    state = applySharedCommand(
      state,
      { kind: "project.create", payload: { project, planMode: "empty" } },
      pm,
    );
    expect(state.manager.projects[0].managerId).toBe("pm");
  });
  it("denies unrelated customer edits and guessed project records", () => {
    const f = fixture();
    const restricted = actor("pm");
    restricted.grant.projectIds = [];
    expect(() =>
      f.run(
        "customer.save",
        { customer: f.state().manager.clients[0] },
        restricted,
      ),
    ).toThrow(/Customer access/);
    expect(() =>
      f.run("quotation.new", { projectId: "p1" }, restricted),
    ).toThrow(/Assigned project/);
  });
  it("denies workspace crossing and missing privileged MFA", () => {
    const f = fixture();
    expect(() =>
      f.run(
        "customer.save",
        { customer: f.state().manager.clients[0] },
        actor("accountant"),
      ),
    ).toThrow(/Workspace/);
    expect(() =>
      f.run(
        "accounts.action",
        {
          action: {
            kind: "create-cash-account",
            id: "evil",
            name: "Evil cash",
            type: "cash",
          },
        },
        actor("staff"),
      ),
    ).toThrow(/Workspace/);
    const unsafe = actor("owner");
    unsafe.assurance = "aal1";
    expect(() =>
      f.run(
        "customer.save",
        { customer: f.state().manager.clients[0] },
        unsafe,
      ),
    ).toThrow(/MFA/);
  });
  it("refuses production data and arbitrary full-state replacement", () => {
    const f = fixture();
    expect(() =>
      applySharedCommand(
        { ...f.state(), mode: "production" } as unknown as SharedCompanyState,
        { kind: "customer.save", payload: {} },
        actor("owner"),
      ),
    ).toThrow(/fictional/);
    expect(() => f.run("manager.replace", { db: f.state().manager })).toThrow(
      /not supported/,
    );
  });
  it("reuses one canonical supplier for multiple explicitly entered Accounts bills", () => {
    const f = fixture();
    for (const id of ["bill1", "bill2"])
      f.run(
        "accounts.action",
        {
          action: {
            kind: "bill",
            id,
            party: "Fictional common supplier",
            date: "2026-11-04",
            due: "2026-11-30",
            description: "Fictional standalone bill",
            amount: "25",
            category: "Operating Expense",
            poReference: "FICT-PO",
          },
        },
        actor("accountant"),
      );
    expect(f.state().manager.operations!.suppliers).toHaveLength(1);
    const data = serializeCanonical(f.state());
    expect(
      data.parties.filter((item) => item.kind === "supplier"),
    ).toHaveLength(1);
    expect(
      data.records
        .filter((item) => item.entity_type === "supplier_bill")
        .map((item) => item.party_id),
    ).toEqual([
      data.parties.find((item) => item.kind === "supplier")!.id,
      data.parties.find((item) => item.kind === "supplier")!.id,
    ]);
  });
});
