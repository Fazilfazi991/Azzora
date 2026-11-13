import { expect, it } from "vitest";
import { createEmptyProductionCompany } from "../finance/production-policy";
import { emptyOperations } from "../operations/migration";
import {
  applySharedCommand,
  sharedCommandScope,
  type SharedActor,
} from "./domain";
import { hydrateCanonical, serializeCanonical } from "./canonical";
import { validateSavedShape } from "../domain/validation";
import {
  inspectOpeningSetup,
  openingSetupSchema,
} from "../accounts-review/opening-setup";

const actor: SharedActor = {
  userId: "production-accountant",
  personId: "production-accountant",
  companyId: "authorized-company",
  sessionId: "session",
  assurance: "aal2",
  grant: {
    userId: "production-accountant",
    companyId: "authorized-company",
    active: true,
    roles: ["accountant"],
    workspaces: ["accountant"],
    projectIds: [],
    capabilities: ["finance.read", "finance.draft"],
  },
};
function fixture() {
  const settings = emptyOperations().settings;
  settings.company = {
    name: "Company setup",
    tradingName: "",
    location: "",
    phone: "",
    email: "",
    website: "",
    trn: "",
    bank: "",
    logo: "",
    invoiceTerms: "",
  };
  settings.tax = "Unconfigured";
  settings.vatPercentage = "";
  return createEmptyProductionCompany({
    settings,
    people: [
      {
        id: actor.userId,
        name: "Authorized accountant",
        role: "Accountant",
        status: "Active",
        capacity: 100,
        email: "accountant@example.invalid",
        phone: "",
      },
    ],
  });
}
const command = (action: Record<string, unknown>) => ({
  kind: "accounts.action",
  payload: { action },
});
it("verified production Accountant can persist explicitly unissued invoice/bill drafts and empty catalog records without posting policy", () => {
  let state = fixture();
  const initialJournals = structuredClone(state.finance.accounting.journals);
  for (const action of [
    {
      kind: "create-expense-ledger",
      id: "office",
      name: "Office",
      group: "Indirect Expense",
    },
    {
      kind: "create-cash-account",
      id: "cash-setup",
      name: "Office cash",
      type: "cash",
    },
    {
      kind: "invoice",
      id: "draft-sale",
      party: "Unissued customer draft",
      date: "2026-11-13",
      due: "2026-11-13",
      description: "Review only",
      amount: "10",
      invoiceType: "Tax Invoice",
      issue: false,
    },
    {
      kind: "bill",
      id: "draft-purchase",
      party: "Unissued supplier draft",
      date: "2026-11-13",
      due: "2026-11-13",
      description: "Review only",
      amount: "10",
      category: "Operating Expense",
      poReference: "Pending review",
      issue: false,
    },
  ]) {
    expect(sharedCommandScope(state, command(action)).financial).toBe(false);
    state = applySharedCommand(state, command(action), actor);
  }
  expect(state.finance.accounting.journals).toEqual(initialJournals);
  expect(state.finance.invoices[0].status).toBe("Draft");
  expect(state.finance.bills[0].status).toBe("Draft");
  expect(hydrateCanonical(serializeCanonical(state)).finance).toMatchObject({
    invoices: [{ id: "draft-sale", status: "Draft" }],
    bills: [{ id: "draft-purchase", status: "Draft" }],
  });
});
it.each([
  { kind: "invoice", issue: true },
  { kind: "bill", issue: true },
  { kind: "bill" },
  { kind: "issue-invoice" },
  { kind: "issue-bill" },
  { kind: "receipt" },
  { kind: "supplier-payment" },
  { kind: "expense" },
  { kind: "transfer" },
])("production $kind remains behind the posting gate", (action) => {
  const state = fixture(),
    before = structuredClone(state);
  expect(sharedCommandScope(state, command(action)).financial).toBe(true);
  expect(() => applySharedCommand(state, command(action), actor)).toThrow(
    /posting remains disabled/,
  );
  expect(state).toEqual(before);
});
it("does not expand the staging document-review-only grant", () => {
  const state = fixture();
  state.mode = "fictional-staging";
  for (const action of [
    { kind: "create-expense-ledger" },
    { kind: "create-cash-account" },
    { kind: "invoice", issue: false },
    { kind: "bill", issue: false },
  ]) {
    expect(sharedCommandScope(state, command(action)).financial).toBe(true);
    expect(() => applySharedCommand(state, command(action), actor)).toThrow(
      /capability/,
    );
  }
});
it("incomplete opening setup persists separately from journals, reports and outstanding documents", () => {
  const state = fixture(),
    before = structuredClone(state.finance);
  const draft = {
    date: "",
    notes: "Awaiting accountant reconciliation",
    rows: [
      {
        id: "bank",
        kind: "bank",
        accountOrParty: "Bank to confirm",
        reference: "",
        documentDate: "",
        dueDate: "",
        debit: "",
        credit: "",
        notes: "Not supplied",
      },
      {
        id: "invoice",
        kind: "customer-invoice",
        accountOrParty: "Customer to confirm",
        reference: "OUT-1",
        documentDate: "2026-10-01",
        dueDate: "2026-11-01",
        debit: "123.45",
        credit: "0",
        notes: "Original outstanding document",
      },
    ],
  };
  const parsed = openingSetupSchema.parse(draft);
  const next = applySharedCommand(
    state,
    command({
      kind: "opening-setup-draft",
      id: "opening-setup",
      draft: parsed,
    }),
    actor,
  );
  const recovered = hydrateCanonical(serializeCanonical(next));
  expect(recovered.finance.openingSetup).toEqual(parsed);
  expect(recovered.finance.openingSetup!.rows[0].debit).toBe("");
  expect(recovered.finance.openingSetup!.rows[1].credit).toBe("0");
  expect(next.finance.accounting).toEqual(before.accounting);
  expect(next.finance.invoices).toEqual(before.invoices);
  expect(next.finance.bills).toEqual(before.bills);
  expect(inspectOpeningSetup(parsed)).toMatchObject({
    debitFils: "12345",
    creditFils: "0",
    differenceFils: "12345",
  });
  expect(inspectOpeningSetup(parsed).warnings).toContain(
    "Opening trial balance does not reconcile. No balancing amount will be invented.",
  );
  expect(state.finance).toEqual(before);
});
it.each(["-1", "abc", "1.001", "Infinity"])(
  "invalid opening amount %s is rejected without changing the draft",
  (value) => {
    const state = fixture(),
      before = structuredClone(state);
    expect(() =>
      applySharedCommand(
        state,
        command({
          kind: "opening-setup-draft",
          id: "opening-setup",
          draft: {
            date: "",
            notes: "",
            rows: [
              {
                id: "invalid",
                kind: "ledger",
                accountOrParty: "",
                reference: "",
                documentDate: "",
                dueDate: "",
                debit: value,
                credit: "",
                notes: "",
              },
            ],
          },
        }),
        actor,
      ),
    ).toThrow();
    expect(state).toEqual(before);
  },
);
it("Owner can save an unconfigured company profile without inventing financial defaults; Accountant and policy edits remain denied", () => {
  const state = fixture();
  state.manager.operations!.settings.retentionPercentage = "";
  state.manager.operations!.settings.invoicePrefix = "";
  state.manager.operations!.settings.fiscalYearStart = "";
  Object.values(state.manager.operations!.settings.numbering).forEach(
    (sequence) => (sequence.prefix = ""),
  );
  const settings = structuredClone(state.manager.operations!.settings);
  settings.company.phone = "+971 50 000 0000";
  const owner = structuredClone(actor);
  owner.grant.roles = ["owner"];
  owner.grant.workspaces.push("manager");
  owner.grant.capabilities.push("access.manage", "project.write");
  const next = applySharedCommand(
    state,
    { kind: "settings.save", payload: { settings } },
    owner,
  );
  expect(next.manager.operations!.settings).toEqual(settings);
  expect(next.manager.operations!.settings.tax).toBe("Unconfigured");
  expect(next.manager.operations!.settings.vatPercentage).toBe("");
  expect(next.finance.accounting.journals).toEqual([]);
  expect(() =>
    applySharedCommand(
      state,
      { kind: "settings.save", payload: { settings } },
      actor,
    ),
  ).toThrow();
  for (const changes of [
    { tax: "Exclusive", vatPercentage: "5" },
    { paymentDays: 31 },
    { invoicePrefix: "INV-" },
  ])
    expect(() =>
      applySharedCommand(
        state,
        {
          kind: "settings.save",
          payload: { settings: { ...settings, ...changes } },
        },
        owner,
      ),
    ).toThrow(/approval/);
});
it("blank policy fields are valid only for explicit unconfigured setup, not corrupted configured records", () => {
  const state = fixture();
  state.manager.operations!.settings.retentionPercentage = "";
  expect(() => validateSavedShape(state.manager)).not.toThrow();
  state.manager.operations!.settings.tax = "Exclusive";
  expect(() => validateSavedShape(state.manager)).toThrow(/operations.settings.vatPercentage/);
});
