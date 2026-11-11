import { describe, expect, it } from "vitest";
import { postJournal } from "../accounting/core";
import { createReviewState, reviewSnapshot } from "../accounts-review/domain";
import { blankFields } from "../accounts-review/documents/model";
import { blankCustomer } from "../commercial/customer-domain";
import { newProjectDetails } from "../commercial/repository";
import { emptyOperations } from "../operations/migration";
import {
  createEmptyProductionCompany,
  createEmptyProductionFinance,
} from "./production-policy";
import {
  applySharedCommand,
  type SharedActor,
  type SharedCompanyState,
  type ProductionCommandOptions,
} from "../staging/domain";
import {
  assessProductionPolicy,
  productionPolicyDigest,
  productionCompanySettingsDigest,
  type PolicyApproval,
  type ProductionAccountingPolicy,
} from "../accounting/production-policy";
import type { Person } from "../domain/model";

const now = "2026-11-11T12:00:00.000Z",
  day = "2026-11-11",
  h = "1".repeat(64);
const actor = (id = "owner"): SharedActor => ({
  userId: id,
  personId: id,
  companyId: "authorized-production-fixture",
  sessionId: id + "-session",
  assurance: "aal2",
  grant: {
    userId: id,
    companyId: "authorized-production-fixture",
    active: true,
    roles: [
      id === "accountant"
        ? "accountant"
        : id === "pm"
          ? "project_manager"
          : id === "staff"
            ? "site_staff"
            : "owner",
    ],
    workspaces:
      id === "accountant" ? ["accountant"] : ["manager", "accountant"],
    projectIds: ["p1"],
    capabilities: [
      "project.read",
      "project.write",
      "expense.submit",
      "expense.approve",
      "finance.read",
      "finance.draft",
      "finance.post",
      "access.manage",
    ],
  },
});
const people: Person[] = ["owner", "accountant", "pm", "staff"].map((id) => ({
  id,
  name: `Synthetic ${id}`,
  role: id === "pm" ? "Project Manager" : id,
  phone: "",
  email: id + "@example.invalid",
  capacity: 100,
  status: "Active",
}));
function fixture() {
  const settings = emptyOperations().settings;
  settings.company = {
    ...settings.company,
    name: "SYNTHETIC PRODUCTION-CONTRACT QA",
    phone: "",
    email: "",
    location: "",
    trn: "",
    bank: "",
  };
  settings.vatPercentage = "0";
  settings.tax = "Zero Rated";
  return createEmptyProductionCompany({
    settings,
    people,
    accounts: createReviewState().accounting.accounts,
    periods: [
      { id: "test-open", start: day, end: "2026-12-31", status: "Open" },
    ],
  });
}
function policy(state: SharedCompanyState): ProductionAccountingPolicy {
  return {
    version: 1,
    companyId: actor().companyId,
    revision: 1,
    effectiveFrom: day,
    companySettingsDigest: productionCompanySettingsDigest(
      state.manager.operations!.settings,
    ),
    chartDigest: productionPolicyDigest(state.finance.accounting.accounts),
    tax: {
      registration: "not-registered",
      trn: "",
      taxInvoice: "disabled",
      normalInvoice: "non-tax",
      proforma: "non-posting",
      ratesBasisPoints: [0],
    },
    revenueRecognition: "on-invoice-issue",
    expenseAuthority: {
      requireIndependentApproval: true,
      approverRoles: ["owner", "project_manager"],
      postingRoles: ["owner", "accountant"],
      maximumSinglePostingFils: "10000000",
    },
    customerAdvances: "blocked-until-supported",
    projectCosts: "explicit-project-or-company",
    openingBalances: {
      asOf: "2026-11-10",
      reconciliationDigest: h,
      approvedImportDigest: h,
    },
    cutover: {
      date: day,
      planDigest: h,
      backupReceiptDigest: h,
      restoreReceiptDigest: h,
    },
  };
}
function approvals(p: ProductionAccountingPolicy): PolicyApproval[] {
  return ["accounting-policy", "real-posting-activation"].flatMap((purpose) =>
    ["owner", "accountant"].map((id) => ({
      companyId: p.companyId,
      revision: p.revision,
      policyDigest: productionPolicyDigest(p),
      recordedAt: now,
      purpose: purpose as PolicyApproval["purpose"],
      actor: actor(id),
      capacity: id as PolicyApproval["capacity"],
    })),
  );
}
function options(state: SharedCompanyState): ProductionCommandOptions {
  const p = policy(state);
  return {
    policy: p,
    context: { now, approvals: approvals(p), runtimeContractVerified: true },
  };
}
const fullContext = (s: SharedCompanyState, o = options(s)) => ({
  ...o.context,
  actor: actor(),
  companyId: actor().companyId,
  companySettingsDigest: productionCompanySettingsDigest(
    s.manager.operations!.settings,
  ),
  chartDigest: productionPolicyDigest(s.finance.accounting.accounts),
});

describe("production preparation and fail-closed policy", () => {
  it("creates a truly empty finance state and explicit company, without fake parties, balances or periods", () => {
    const f = createEmptyProductionFinance();
    expect(f.accounting).toEqual({
      version: 1,
      accounts: [],
      periods: [],
      journals: [],
    });
    expect(f.invoices).toEqual([]);
    expect(f.bills).toEqual([]);
    expect(f.cashAccounts).toEqual([]);
    const s = fixture();
    expect(s.mode).toBe("production");
    expect(s.finance.accounting.journals).toEqual([]);
    expect(s.manager.clients).toEqual([]);
    expect(s.manager.operations!.suppliers).toEqual([]);
    expect(s.manager.financeFixture).toBeUndefined();
  });
  it("validates chart/period setup with the existing accounting engine", () => {
    const a = createReviewState().accounting.accounts[0];
    expect(() => createEmptyProductionFinance({ accounts: [a, a] })).toThrow(
      /unique/,
    );
    expect(() =>
      createEmptyProductionFinance({
        periods: [{ id: "bad", start: "2026-02-30", end: day, status: "Open" }],
      }),
    ).toThrow();
  });
  it("allows only completely approved supported config in an isolated production contract fixture", () => {
    const s = fixture();
    expect(assessProductionPolicy(policy(s), fullContext(s))).toEqual([]);
  });
  it("keeps every deferred decision and an unverified runtime blocked", () => {
    const s = fixture(),
      p = policy(s);
    for (const k of [
      "tax",
      "revenueRecognition",
      "expenseAuthority",
      "customerAdvances",
      "projectCosts",
      "openingBalances",
      "cutover",
    ] as const) {
      const deferred = { ...p, [k]: null };
      expect(
        assessProductionPolicy(deferred, {
          ...fullContext(s),
          approvals: approvals(deferred),
        }).some((i) => i.field === k),
      ).toBe(true);
    }
    expect(
      assessProductionPolicy(p, {
        ...fullContext(s),
        runtimeContractVerified: false,
      }).map((i) => i.code),
    ).toContain("runtime-unverified");
  });
  it("binds approval content, revision, company, effective date, independent identities and separate activation", () => {
    const s = fixture(),
      p = policy(s),
      c = fullContext(s);
    for (const approvalsBad of [
      [],
      c.approvals.filter((r) => r.purpose === "accounting-policy"),
      c.approvals.map((r) => ({ ...r, revision: 2 })),
      c.approvals.map((r) => ({ ...r, companyId: "foreign" })),
      c.approvals.map((r) => ({ ...r, actor: actor("owner") })),
    ])
      expect(
        assessProductionPolicy(p, { ...c, approvals: approvalsBad }).length,
      ).toBeGreaterThan(0);
    expect(
      assessProductionPolicy({ ...p, effectiveFrom: "2027-01-01" }, c).map(
        (i) => i.code,
      ),
    ).toContain("not-effective");
    expect(
      assessProductionPolicy({ ...p, revision: 2 }, c).map((i) => i.code),
    ).toContain("policy-approval-missing");
  });
  it("rejects changed settings/chart, unapproved tax/recognition/advance methods and client-review authority", () => {
    const s = fixture(),
      p = policy(s),
      c = fullContext(s);
    for (const patch of [
      { companySettingsDigest: "2".repeat(64) },
      { chartDigest: "2".repeat(64) },
      {
        actor: {
          ...actor(),
          authenticationPolicy: "client-review-password-only",
        },
      },
      { actor: { ...actor(), assurance: "aal1" as const } },
    ])
      expect(
        assessProductionPolicy(p, { ...c, ...patch }).length,
      ).toBeGreaterThan(0);
    for (const patch of [
      {
        tax: {
          ...p.tax!,
          registration: "registered" as const,
          trn: "authorized-input-pending",
          taxInvoice: "approved-registered" as const,
          ratesBasisPoints: [500],
        },
      },
      { revenueRecognition: "on-cash-receipt" as const },
      { customerAdvances: "liability-until-earned" as const },
      { projectCosts: "custom-overhead-allocation" as const },
    ])
      expect(
        assessProductionPolicy({ ...p, ...patch }, c).some(
          (i) =>
            i.code.includes("unsupported") || i.code === "tax-engine-pending",
        ),
      ).toBe(true);
  });
  it("denies real writes even with simulate grants or forged policy data in the payload; drafts stay nonposting", () => {
    const s = fixture(),
      before = structuredClone(s),
      a = actor();
    a.grant.capabilities = a.grant.capabilities.filter(
      (v) => v !== "finance.post",
    );
    a.grant.capabilities.push("finance.simulate");
    const command = {
      kind: "accounts.action",
      payload: {
        action: {
          kind: "invoice",
          id: "i",
          party: "Synthetic",
          date: day,
          due: day,
          description: "Synthetic work",
          amount: "10.00",
          issue: true,
          invoiceType: "Normal Invoice",
        },
        productionPolicy: options(s),
      },
    };
    expect(() => applySharedCommand(s, command, a)).toThrow(/disabled/);
    expect(() => applySharedCommand(s, command, a, options(s))).toThrow(
      /finance.post/,
    );
    expect(s).toEqual(before);
    const d = applySharedCommand(
      s,
      {
        kind: "accounts.action",
        payload: {
          action: {
            kind: "document-manual",
            id: "DOC-UNCLASSIFIED",
            fields: blankFields(),
            confirmed: true,
            rememberSupplier: false,
          },
        },
      },
      actor("accountant"),
    );
    expect(d.finance.documentEntries!.reviews).toHaveLength(1);
    expect(d.finance.accounting).toEqual(s.finance.accounting);
  });
});

it("runs zero-tax item invoices, allocations, purchases, payments, approved project expense and transfer through ONE existing journal; failures preserve history", () => {
  let s = fixture();
  const customer = {
    ...blankCustomer(),
    id: "c1",
    name: "Synthetic customer",
    contact: "Synthetic",
  };
  s = applySharedCommand(
    s,
    { kind: "customer.save", payload: { customer } },
    actor(),
  );
  const project = {
    ...newProjectDetails(
      s.manager,
      "c1",
      "Synthetic site",
      "Synthetic location",
    ),
    id: "p1",
    managerId: "pm",
  };
  s = applySharedCommand(
    s,
    {
      kind: "project.create",
      payload: { project, standard: false, planMode: "empty" },
    },
    actor(),
  );
  s.finance.accounting = postJournal(s.finance.accounting, {
    id: "FIXTURE-FUNDING",
    postingKey: "synthetic-explicit-funding",
    source: { kind: "test-fixture", id: "fund", action: "test" },
    date: day,
    recordedAt: now,
    memo: "Synthetic test funding, not production opening balances",
    currency: "AED",
    lines: [
      { accountId: "bank", debitFils: "100000", creditFils: "0" },
      { accountId: "capital", debitFils: "0", creditFils: "100000" },
    ],
  }).state;
  const o = options(s);
  const run = (action: unknown, user = actor("accountant")) => {
    s = applySharedCommand(
      s,
      { kind: "accounts.action", payload: { action } },
      user,
      o,
    );
  };
  run({
    kind: "invoice",
    id: "i1",
    party: "Synthetic customer",
    date: day,
    due: day,
    description: "Synthetic work",
    items: [
      { description: "Synthetic A", quantity: "2", unit: "Nos", rate: "25.00" },
      { description: "Synthetic B", quantity: "1", unit: "Nos", rate: "50.00" },
    ],
    projectId: "p1",
    issue: true,
    invoiceType: "Normal Invoice",
  });
  run({
    kind: "invoice",
    id: "pro1",
    party: "Synthetic customer",
    date: day,
    due: day,
    description: "Synthetic proforma",
    amount: "10.00",
    projectId: "p1",
    issue: true,
    invoiceType: "Proforma",
  });
  expect(s.finance.accounting.journals).toHaveLength(2);
  expect(s.manager.invoices.find((i) => i.id === "i1")).toBeDefined();
  run({
    kind: "receipt",
    id: "r1",
    documentId: "i1",
    date: day,
    amount: "60.00",
    account: "bank",
    reference: "Synthetic receipt",
  });
  const beforeDuplicate = structuredClone(s);
  expect(() =>
    run({
      kind: "receipt",
      id: "r1",
      documentId: "i1",
      date: day,
      amount: "60.00",
      account: "bank",
    }),
  ).toThrow();
  expect(s).toEqual(beforeDuplicate);
  run({
    kind: "bill",
    id: "b1",
    party: "Synthetic supplier",
    date: day,
    due: day,
    description: "Synthetic materials",
    items: [
      {
        description: "Synthetic material",
        quantity: "1",
        unit: "Nos",
        rate: "25.00",
      },
    ],
    projectId: "p1",
    departmentId: "MEP",
    issue: true,
    category: "Cost of Sales",
    poReference: "SYN-PO",
    invoiceReference: "SYN-BILL",
  });
  run({
    kind: "supplier-payment",
    id: "sp1",
    documentId: "b1",
    date: day,
    amount: "10.00",
    account: "bank",
    reference: "Synthetic supplier payment",
  });
  const expense = {
    kind: "expense",
    id: "e1",
    date: day,
    payee: "Synthetic staff",
    description: "Synthetic project expense",
    amount: "5.00",
    account: "bank",
    ledgerId: "project-materials",
    scope: "project",
    projectId: "p1",
    departmentId: "CIVIL",
  };
  expect(() => run(expense)).toThrow(/independently approved/);
  s = applySharedCommand(
    s,
    {
      kind: "expense.submit",
      payload: {
        id: "e1",
        projectId: "p1",
        date: day,
        payee: "Synthetic staff",
        description: "Synthetic project expense",
        amount: "5.00",
        ledgerId: "project-materials",
        departmentId: "CIVIL",
      },
    },
    actor("staff"),
  );
  s = applySharedCommand(
    s,
    {
      kind: "expense.approve",
      payload: {
        id: "e1",
        approved: true,
        comments: "Synthetic independent approval",
      },
    },
    actor("pm"),
    o,
  );
  run(expense);
  run({
    kind: "transfer",
    id: "t1",
    date: day,
    fromAccount: "bank",
    toAccount: "cash",
    amount: "20.00",
    reference: "Synthetic transfer",
  });
  const view = reviewSnapshot(s.finance, day);
  expect(view.invoices.find((i) => i.id === "i1")!.outstandingFils).toBe(
    "4000",
  );
  expect(view.bills[0].outstandingFils).toBe("1500");
  expect(view.trial.balanced).toBe(true);
  expect(view.balance.differenceFils).toBe("0");
  const before = structuredClone(s);
  expect(() =>
    run({
      kind: "receipt",
      id: "r-too-much",
      documentId: "i1",
      date: day,
      amount: "41.00",
      account: "bank",
    }),
  ).toThrow();
  expect(s).toEqual(before);
  const limit = {
    ...o,
    policy: {
      ...o.policy,
      expenseAuthority: {
        ...o.policy.expenseAuthority!,
        maximumSinglePostingFils: "1",
      },
    },
  };
  limit.context = { ...o.context, approvals: approvals(limit.policy) };
  expect(() =>
    applySharedCommand(
      s,
      {
        kind: "accounts.action",
        payload: {
          action: {
            kind: "receipt",
            id: "limit",
            documentId: "i1",
            date: day,
            amount: "1.00",
            account: "bank",
          },
        },
      },
      actor("accountant"),
      limit,
    ),
  ).toThrow(/limit/);
  expect(s).toEqual(before);
  expect(() =>
    run({
      kind: "invoice",
      id: "historical",
      party: "Synthetic customer",
      date: "2026-11-10",
      due: day,
      description: "Historical cannot silently post",
      amount: "1.00",
      issue: true,
      invoiceType: "Normal Invoice",
    }),
  ).toThrow();
  expect(s).toEqual(before);
});
