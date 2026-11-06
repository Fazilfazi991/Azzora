import { isPasswordOnlyClientReview } from "../backend/client-review-policy.js";
import type {
  AuthorizedActor,
  BackendAction,
  Workspace,
} from "../backend/permissions.js";
import { applyManagerCommand, managerCommandScope } from "./manager-commands.js";
import {
  isCommercialCommand,
  commercialCommandScope,
  applyCommercialCommand,
  refreshCommercialView,
  syncFinanceBillCosts,
  StagingPolicyError,
} from "./commercial-commands.js";
import { AccessDenied } from "../backend/permissions.js";
import type {
  Assignment,
  Client,
  Database,
  Person,
  Project,
} from "../domain/model.js";
import { saveAssignment } from "../workforce/commands.js";
import { createHash } from "node:crypto";
import { seed } from "../domain/seed.js";
import { createProject } from "../domain/repository.js";
import { initializeCommercial } from "../commercial/migration.js";
import { emptyOperations } from "../operations/migration.js";
import { saveCustomer } from "../commercial/customer-domain.js";
import {
  blankInvoice,
  convertQuotation,
  invoiceFromQuotation,
  issueInvoice,
  postPayment,
  saveInvoice,
} from "../commercial/repository.js";
import {
  amountString,
  invoiceTotals,
  invoiceCreditLines,
} from "../commercial/calculations.js";
import type { Invoice, Payment } from "../commercial/model.js";
import {
  changeQuotationStatus,
  copyQuotation,
  deleteDraft,
  newQuotation,
  saveQuotation,
} from "../quotation/repository.js";
import type { Quotation } from "../quotation/model.js";
import * as operations from "../operations/repository.js";
import type {
  ApprovalKind,
  Delivery,
  Material,
  PurchaseRequest,
  Supplier,
  SupplierPayment,
  SupplierQuote,
} from "../operations/model.js";
import {
  applyReviewAction,
  createReviewState,
  type ReviewAction,
  type ReviewDocument,
  type ReviewState,
} from "../accounts-review/domain.js";
import { departmentId, departments } from "../accounts-review/banking.js";
import { postJournal } from "../accounting/core.js";
import { parseFils, type PostedSettlement } from "../finance/settlement.js";

export interface ExpenseSubmission {
  id: string;
  projectId: string;
  description: string;
  amount: string;
  date: string;
  payee: string;
  departmentId?: "MEP" | "CIVIL" | "JOINERY";
  ledgerId?: string;
  submittedBy: string;
  submittedPersonId: string;
  status: "Submitted" | "Approved" | "Rejected" | "Posted";
  approvedBy?: string;
  comments?: string;
  approvedAt?: string;
  approvalSnapshot?: string;
}
export interface SharedCompanyState {
  version: 1;
  mode: "fictional-staging";
  manager: Database;
  finance: ReviewState;
  expenseSubmissions: ExpenseSubmission[];
  canonicalSnapshots?: import("./canonical.js").CanonicalData["snapshots"];
}
export interface SharedCommand {
  kind: string;
  payload: unknown;
}
export type SharedActor = AuthorizedActor & { personId?: string };
export interface SharedCommandScope {
  workspace: Workspace;
  projectId?: string;
  submittedBy?: string;
  financial: boolean;
  capability?: BackendAction;
}
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Command fields must be an object.");
  return value as Record<string, unknown>;
};
const text = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !value.trim() || value.length > 200)
    throw Error(`${label} is required.`);
  return value;
};
const role = (actor: SharedActor, values: string[]) =>
  actor.grant.roles.some((value) => values.includes(value));
const owner = (actor: SharedActor) => role(actor, ["owner", "admin"]);
const partyName = (value: string) =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
function requireWorkspace(actor: SharedActor, workspace: Workspace) {
  if (
    !actor.grant.active ||
    actor.grant.userId !== actor.userId ||
    actor.grant.companyId !== actor.companyId ||
    !actor.grant.workspaces.includes(workspace)
  )
    throw new AccessDenied("Workspace access denied.");
  if (
    role(actor, ["owner", "admin", "accountant"]) &&
    actor.assurance !== "aal2" &&
    !(
      actor.grant.roles.length === 1 &&
      isPasswordOnlyClientReview({
        ...actor,
        role: actor.grant.roles[0],
        workspace,
        capabilities: actor.grant.capabilities,
      })
    )
  )
    throw new AccessDenied("MFA is required.");
}
function requireProject(
  state: SharedCompanyState,
  actor: SharedActor,
  projectId: string,
) {
  if (!state.manager.projects.some((project) => project.id === projectId))
    throw Error("Project does not exist.");
  if (!actor.grant.projectIds.includes(projectId))
    throw new AccessDenied("Assigned project access is required.");
}
function person(state: SharedCompanyState, actor: SharedActor): string {
  const id = actor.personId || actor.userId;
  if (
    !state.manager.people.some(
      (item) => item.id === id && item.status === "Active",
    )
  )
    throw new AccessDenied(
      "The authenticated user needs an explicit active employee mapping.",
    );
  return id;
}
function refreshCatalog(state: SharedCompanyState) {
  state.finance.documentCatalog = {
    suppliers: state.manager
      .operations!.suppliers.filter((item) => item.status === "Active")
      .map((item) => item.name),
    customers: state.manager.clients
      .filter((item) => item.status !== "Archived")
      .map((item) => ({ id: item.id, name: item.name })),
    projects: state.manager.projects.map((item) => ({
      id: item.id,
      name: item.name,
    })),
    products: [],
  };
}

/** Explicit fictional bootstrap. Never reads browser storage or imports the reference quotation. */
export function createSharedCompanyState(
  people?: Person[],
): SharedCompanyState {
  const db = seed();
  db.clients = [];
  db.projects = [];
  db.phases = [];
  db.assignments = [];
  db.tasks = [];
  db.milestones = [];
  db.updates = [];
  db.snags = [];
  db.documents = [];
  db.handover = [];
  db.activities = [];
  db.quotations = [];
  db.invoices = [];
  db.payments = [];
  db.expenses = [];
  db.contracts = [];
  db.planning = [];
  delete db.finance;
  delete db.financeFixture;
  db.operations = emptyOperations();
  db.operations.settings.company = {
    ...db.operations.settings.company,
    name: "FICTIONAL AZZORA STAGING",
    tradingName: "AZZORA staging",
    location: "Fictional staging office, Dubai, UAE",
    phone: "",
    email: "",
    bank: "",
    trn: "",
    website: "",
    invoiceTerms:
      "Fictional demonstration only. Not a legal tax invoice or real payment request.",
  };
  db.operations.settings.vatPercentage = "0";
  db.operations.settings.tax = "Zero Rated";
  db.people = structuredClone(people || []);
  db.commercialNumbering = { customer: 1, invoice: 1, receipt: 1, expense: 1 };
  db.quotationNumbering = { prefix: "STAGE-QTN-", next: 1 };
  initializeCommercial(db);
  const finance = createReviewState();
  finance.invoices = [];
  finance.bills = [];
  finance.receipts = [];
  finance.supplierPayments = [];
  finance.expenses = [];
  finance.attachments = [];
  finance.settlementDetails = [];
  finance.transfers = [];
  finance.documentEntries = { version: 1, reviews: [], defaults: [] };
  finance.accounting = {
    ...finance.accounting,
    journals: [],
    periods: [
      { id: "staging", start: "2020-01-01", end: "2099-12-31", status: "Open" },
    ],
  };
  finance.accounting = postJournal(finance.accounting, {
    id: "staging-opening",
    postingKey: "fictional-staging:opening",
    source: { kind: "cash_account", id: "bank", action: "Fictional opening" },
    date: "2026-01-01",
    recordedAt: "2026-01-01T00:00:00.000Z",
    memo: "Fictional test capital only; not an approved company opening balance",
    currency: "AED",
    lines: [
      { accountId: "bank", debitFils: "10000000", creditFils: "0" },
      { accountId: "capital", debitFils: "0", creditFils: "10000000" },
    ],
  }).state;
  const state: SharedCompanyState = {
    version: 1,
    mode: "fictional-staging",
    manager: db,
    finance,
    expenseSubmissions: [],
  };
  refreshCatalog(state);
  return state;
}

/** Resource scopes are read from persisted records for existing IDs, never chosen by a browser role flag. */
export function sharedCommandScope(
  state: SharedCompanyState,
  command: SharedCommand,
): SharedCommandScope {
  const managerScope = managerCommandScope(state, command);
  if (managerScope) return managerScope;
  if (isCommercialCommand(command.kind))
    return commercialCommandScope(state, command);
  const p = object(command.payload);
  if (command.kind === "accounts.action") {
    const action = object(p.action);
    const id =
      typeof action.documentId === "string" ? action.documentId : action.id;
    const doc =
      state.finance.invoices.find((item) => item.id === id) ||
      state.finance.bills.find((item) => item.id === id);
    return {
      workspace: "accountant",
      projectId:
        doc?.projectId ||
        (typeof action.projectId === "string" ? action.projectId : undefined),
      // Draft permission is exclusively document review; catalog writes need full finance authority.
      financial: action.kind !== "document-draft",
    };
  }
  const suppliedEntity =
    p.project ||
    p.quotation ||
    p.invoice ||
    p.entity ||
    p.bill ||
    p.delivery ||
    p.assignment;
  const nested =
    suppliedEntity && typeof suppliedEntity === "object"
      ? (suppliedEntity as Record<string, unknown>)
      : {};
  const payment =
    p.payment && typeof p.payment === "object"
      ? (p.payment as Record<string, unknown>)
      : {};
  const id =
    p.id || p.quotationId || p.approvalId || p.supplierQuoteId || nested.id;
  const op = state.manager.operations!;
  const candidates = [
    state.manager.quotations,
    state.manager.invoices,
    state.expenseSubmissions,
    op.approvals,
    op.materials,
    op.requests,
    op.rfqs,
    op.quotes,
    op.orders,
    op.deliveries,
    op.bills,
  ];
  const existing = candidates.flat().find((item) => item.id === id);
  const relatedId =
    command.kind === "payment.record"
      ? payment.invoiceId
      : command.kind === "procurement.payment"
        ? payment.billId
        : ["procurement.rfq", "procurement.rfqs"].includes(command.kind)
          ? p.requestId
          : command.kind === "procurement.order"
            ? p.supplierQuoteId
            : command.kind === "procurement.submit"
              ? p.entityId
              : command.kind === "procurement.quote"
                ? nested.rfqId
                : ["procurement.bill", "procurement.delivery"].includes(
                      command.kind,
                    )
                  ? nested.poId
                  : undefined;
  const related = candidates.flat().find((item) => item.id === relatedId);
  if (
    typeof nested.projectId === "string" &&
    nested.projectId &&
    [existing?.projectId, related?.projectId].some(
      (value) => value && value !== nested.projectId,
    )
  )
    throw Error(
      "A record cannot be moved to another project through this command.",
    );
  const projectId =
    existing?.projectId ||
    (typeof p.projectId === "string" ? p.projectId : undefined) ||
    related?.projectId ||
    (typeof nested.projectId === "string"
      ? nested.projectId || undefined
      : undefined);
  return {
    workspace: "manager",
    projectId,
    submittedBy:
      existing && "submittedBy" in existing
        ? String(existing.submittedBy)
        : undefined,
    financial: [
      "invoice.issue",
      "payment.record",
      "procurement.bill",
      "procurement.payment",
    ].includes(command.kind),
  };
}

function syncManagerInvoice(state: SharedCompanyState, id: string) {
  const invoice = state.manager.invoices.find((item) => item.id === id)!;
  const total = invoiceTotals(invoice);
  if (invoice.status === "Issued" && total.vat !== 0n)
    throw new StagingPolicyError(
      "vat_policy_pending",
      "VAT policy is pending. Tax-bearing documents must remain drafts in staging.",
    );
  const old = state.finance.invoices.find((item) => item.id === id);
  if (old?.status === "Issued")
    throw Error("Issued financial history cannot be imported again.");
  const fields: ReviewAction = {
    kind: old ? "update-invoice-draft" : "invoice",
    id,
    party: state.manager.clients.find((item) => item.id === invoice.customerId)!
      .name,
    date: invoice.date,
    due: invoice.due,
    description: invoice.description || invoice.number,
    amount: amountString(total.grand),
    projectId: invoice.projectId || undefined,
    issue: invoice.status === "Issued",
    invoiceType: "Normal Invoice",
    ...(old ? { revision: old.revision || 0 } : {}),
  };
  state.finance = applyReviewAction(state.finance, fields);
  const projected = state.finance.invoices.find((item) => item.id === id)!;
  projected.invoiceReference = invoice.number;
  const allocations = invoiceCreditLines(invoice);
  projected.items = invoice.lines.map((line) => {
    const value = allocations.find((item) => item.itemId === line.id)!;
    return {
      description: line.description,
      quantity: line.quantity,
      unit: "",
      rate: line.rate,
      amountFils: value.net.toString(),
      ...(value.discount > 0n
        ? {
            details: `Approved discount allocation AED ${amountString(value.discount)}`,
          }
        : {}),
    };
  });
  projected.subtotalFils = total.subtotal.toString();
  projected.discountFils = total.discount.toString();
  projected.taxFils = total.vat.toString();
  projected.taxStatus = "Policy pending";
}
function syncFinanceInvoice(state: SharedCompanyState, item: ReviewDocument) {
  const matches = state.manager.clients.filter(
    (client) => client.name === item.party,
  );
  if (matches.length > 1)
    throw Error(
      "Customer name is ambiguous. Select a uniquely identified customer before issuing.",
    );
  let customer = matches[0];
  if (!customer) {
    customer = {
      id: `stage-customer-${item.id}`,
      name: item.party,
      contact: "",
      status: "Active",
      type: "Company",
    };
    saveCustomer(state.manager, customer);
  }
  const old = state.manager.invoices.find((invoice) => invoice.id === item.id);
  if (old?.status === "Issued") return;
  if (
    old &&
    (old as Invoice & { stagingOrigin?: string }).stagingOrigin !== "accountant"
  ) {
    if (invoiceTotals(old).grand.toString() !== item.amountFils)
      throw Error("The invoice differs from its authoritative Manager source.");
    if (item.status === "Issued") issueInvoice(state.manager, item.id);
    return;
  }
  const invoice: Invoice = {
    ...(old || blankInvoice(customer.id, item.projectId || "")),
    id: item.id,
    customerId: customer.id,
    projectId: item.projectId || "",
    number: old?.number || item.id,
    date: item.date,
    due: item.due,
    description: item.description,
    lines: item.items?.length
      ? item.items.map((line, index) => ({
          id: `${item.id}-line-${index + 1}`,
          description: line.description,
          quantity: line.quantity,
          rate: line.rate,
          tax: "Zero Rated" as const,
        }))
      : [
          {
            id: `${item.id}-line`,
            description: item.description,
            quantity: "1",
            rate: amountString(BigInt(item.amountFils)),
            tax: "Zero Rated",
          },
        ],
    discount: "0",
    vatPercentage: "0",
    status: "Draft",
  };
  // Proformas remain finance-only non-posting documents; do not create an ordinary Manager AR invoice.
  if (item.invoiceType === "Proforma") return;
  if (invoiceTotals(invoice).grand.toString() !== item.amountFils)
    throw Error(
      "Accountant itemization does not reconcile with its authoritative total; no Manager projection was saved.",
    );
  saveInvoice(state.manager, invoice);
  const saved = state.manager.invoices.find(
    (value) => value.id === item.id,
  )! as Invoice & { stagingOrigin?: "accountant" };
  if (
    !old ||
    (old as Invoice & { stagingOrigin?: string }).stagingOrigin === "accountant"
  )
    saved.stagingOrigin = "accountant";
  if (item.status === "Issued") issueInvoice(state.manager, item.id);
}
function syncReceipt(state: SharedCompanyState, event: PostedSettlement) {
  if (state.manager.payments.some((payment) => payment.id === event.id)) return;
  if (event.allocations.length !== 1)
    throw Error(
      "This staging bridge requires one explicitly selected invoice per receipt.",
    );
  const invoice = state.manager.invoices.find(
    (item) => item.id === event.allocations[0].documentId,
  );
  if (!invoice)
    throw Error("Receipt invoice has no canonical Manager projection.");
  const detail = state.finance.settlementDetails?.find(
    (item) => item.id === event.id,
  );
  postPayment(state.manager, {
    id: event.id,
    number: "",
    invoiceId: invoice.id,
    customerId: invoice.customerId,
    projectId: invoice.projectId,
    date: event.date,
    amount: amountString(event.amountFils),
    method: detail?.account === "cash" ? "Cash" : "Bank Transfer",
    reference: detail?.reference || event.id,
    bank: detail?.account || "bank",
    notes: "Fictional shared staging receipt",
    attachments: [],
    postingKey: event.postingKey,
    createdAt: new Date().toISOString(),
  });
}
function syncPaidExpense(state: SharedCompanyState, id: string) {
  const expense = state.finance.expenses.find((item) => item.id === id)!;
  if (!expense || state.manager.expenses.some((item) => item.id === id)) return;
  state.manager.expenses.push({
    id,
    reference: id,
    projectId: expense.projectId || "",
    category: expense.ledgerName || "Miscellaneous",
    supplier: expense.payee,
    date: expense.date,
    description: expense.description,
    amount: amountString(BigInt(expense.amountFils)),
    vat: "0",
    paidAmount: amountString(BigInt(expense.amountFils)),
    method: expense.account === "cash" ? "Cash" : "Bank Transfer",
    attachmentReference: expense.attachmentId || "",
    attachments: [],
    createdAt: new Date().toISOString(),
  });
}
function applyAccounts(
  state: SharedCompanyState,
  input: ReviewAction,
  actor: SharedActor,
) {
  refreshCatalog(state);
  let action = structuredClone(input);
  if (action.kind === "update-invoice-draft") {
    const source = state.manager.invoices.find(
      (item) => item.id === action.id,
    ) as (Invoice & { stagingOrigin?: string }) | undefined;
    if (source && source.stagingOrigin !== "accountant")
      throw Error(
        "Edit this Manager-origin invoice in its Manager source; its quotation and item amounts must remain authoritative.",
      );
  }
  if (action.kind === "bill" || action.kind === "update-bill-draft") {
    const name = text(action.party, "Supplier");
    const matches = state.manager.operations!.suppliers.filter(
      (item) => partyName(item.name) === partyName(name),
    );
    if (matches.length > 1)
      throw Error(
        "Supplier name is ambiguous; review the canonical supplier first.",
      );
    if (matches.length === 1) action.party = matches[0].name;
    else {
      const id = `finance-supplier:${createHash("sha256").update(partyName(name)).digest("hex").slice(0, 24)}`;
      operations.saveSupplier(
        state.manager,
        {
          id,
          code: "",
          name,
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
          notes: "Explicit fictional staging bill supplier",
          status: "Active",
          createdAt: new Date().toISOString(),
        },
        person(state, actor),
      );
    }
    refreshCatalog(state);
  }
  if (action.kind === "expense") {
    const submission = state.expenseSubmissions.find(
      (item) => item.id === action.id,
    );
    if (submission) {
      if (submission.status !== "Approved")
        throw Error(
          "An independently approved submission is required before expense posting.",
        );
      action = {
        ...action,
        projectId: submission.projectId,
        scope: "project",
        payee: submission.payee,
        date: submission.date,
        description: submission.description,
        amount: submission.amount,
        departmentId: submission.departmentId,
        ledgerId: submission.ledgerId || action.ledgerId,
      };
    }
  }
  state.finance = applyReviewAction(state.finance, action);
  syncFinanceBillCosts(state);
  if (
    ["invoice", "update-invoice-draft", "issue-invoice"].includes(action.kind)
  ) {
    const invoice = state.finance.invoices.find(
      (item) => item.id === action.id,
    )!;
    syncFinanceInvoice(state, invoice);
  }
  if (action.kind === "receipt")
    syncReceipt(
      state,
      state.finance.receipts.find(
        (item) => item.id === action.id && item.type === "posted",
      ) as PostedSettlement,
    );
  if (action.kind === "supplier-payment") {
    const bill = state.manager.operations!.bills.find(
      (item) => item.id === action.documentId,
    );
    if (bill)
      operations.paySupplier(
        state.manager,
        {
          id: action.id,
          number: "",
          billId: bill.id,
          supplierId: bill.supplierId,
          projectId: bill.projectId,
          date: action.date,
          amount: action.amount,
          method: action.account === "cash" ? "Cash" : "Bank Transfer",
          reference: action.reference || action.id,
          bank: action.account,
          notes: "Fictional shared staging supplier payment",
        },
        person(state, actor),
      );
  }
  if (
    action.kind === "expense" ||
    action.kind === "create-expense-from-review"
  ) {
    syncPaidExpense(state, action.id);
    const submission = state.expenseSubmissions.find(
      (item) => item.id === action.id,
    );
    if (submission) submission.status = "Posted";
  }
}

/** Only finite typed commands enter the shared company mutation path. Entire result is committed atomically by the server. */
export function applySharedCommand(
  previous: SharedCompanyState,
  command: SharedCommand,
  actor: SharedActor,
): SharedCompanyState {
  if (previous.mode !== "fictional-staging" || previous.version !== 1)
    throw Error("Only explicitly fictional staging data is supported.");
  const scope = sharedCommandScope(previous, command);
  requireWorkspace(actor, scope.workspace);
  if (scope.workspace === "accountant") {
    if (!role(actor, ["owner", "admin", "accountant"]))
      throw new AccessDenied("Accountant permission is required.");
    if (
      !actor.grant.capabilities.includes(
        scope.financial ? "finance.simulate" : "finance.draft",
      )
    )
      throw new AccessDenied(
        "Explicit staging finance capability is required.",
      );
  } else if (!managerCommandScope(previous, command)) {
    const capability =
      command.kind === "expense.submit"
        ? "expense.submit"
        : command.kind === "expense.approve"
          ? "expense.approve"
          : "project.write";
    if (!actor.grant.capabilities.includes(capability))
      throw new AccessDenied("Manager command capability is required.");
    if (command.kind === "expense.submit") {
      if (!role(actor, ["owner", "admin", "project_manager", "site_staff"]))
        throw new AccessDenied("Expense submission access denied.");
    } else if (!role(actor, ["owner", "admin", "project_manager"]))
      throw new AccessDenied("Manager write access denied.");
    if (scope.projectId) requireProject(previous, actor, scope.projectId);
    if (
      !owner(actor) &&
      command.kind.startsWith("quotation.") &&
      !scope.projectId
    )
      throw new AccessDenied(
        "Project Managers must select an assigned project for quotation commands.",
      );
  }
  const next = structuredClone(previous);
  refreshCommercialView(next);
  if (applyManagerCommand(next, command, actor)) {
    refreshCommercialView(next);
    refreshCatalog(next);
    return next;
  }
  if (isCommercialCommand(command.kind)) {
    const invoices = new Set(next.manager.invoices.map((value) => value.id));
    applyCommercialCommand(next, command, actor);
    if (command.kind === "variation.invoice")
      for (const invoice of next.manager.invoices)
        if (!invoices.has(invoice.id)) syncManagerInvoice(next, invoice.id);
    refreshCommercialView(next);
    refreshCatalog(next);
    return next;
  }
  const p = object(command.payload);
  switch (command.kind) {
    case "customer.save": {
      const customer = object(p.customer) as unknown as Client;
      const old = next.manager.clients.find(
        (item) => item.id === customer.id,
      ) as (Client & { stagingCreatedBy?: string }) | undefined;
      const originalCreator = old?.stagingCreatedBy;
      if (
        old &&
        !owner(actor) &&
        old.stagingCreatedBy !== actor.userId &&
        !next.manager.projects.some(
          (project) =>
            project.clientId === old.id &&
            actor.grant.projectIds.includes(project.id),
        )
      )
        throw new AccessDenied(
          "Customer access is limited to assigned projects or your own unassigned customer drafts.",
        );
      let saved: Client;
      try {
        saved = saveCustomer(
          next.manager,
          customer,
          owner(actor) && p.allowDuplicate === true,
          typeof p.reason === "string" ? p.reason : "",
        );
      } catch (error) {
        if (
          !owner(actor) &&
          error instanceof Error &&
          error.message.startsWith("Possible duplicate customer")
        )
          throw Error(
            "Possible duplicate customer exists. Ask an authorized administrator to review it.",
          );
        throw error;
      }
      const stored = next.manager.clients.find(
        (item) => item.id === saved.id,
      )! as Client & { stagingCreatedBy?: string };
      stored.stagingCreatedBy = originalCreator || actor.userId;
      break;
    }
    case "project.create": {
      const project = object(p.project) as unknown as Project;
      const linkedQuotation =
        typeof p.quotationId === "string"
          ? next.manager.quotations.find((value) => value.id === p.quotationId)
          : undefined;
      if (p.quotationId !== undefined) {
        if (
          !linkedQuotation ||
          linkedQuotation.status !== "Draft" ||
          linkedQuotation.customerId !== project.clientId
        )
          throw Error(
            "Link only a draft quotation for the selected registered customer.",
          );
        if (
          linkedQuotation.projectId &&
          next.manager.projects.some(
            (value) => value.id === linkedQuotation.projectId,
          )
        )
          requireProject(next, actor, linkedQuotation.projectId);
      }
      if (next.manager.projects.some((item) => item.id === project.id))
        throw Error("Project ID already exists.");
      if (!owner(actor) && project.managerId !== person(next, actor))
        throw new AccessDenied(
          "Project Managers can create projects assigned to themselves.",
        );
      const client = next.manager.clients.find(
        (item) => item.id === project.clientId,
      );
      if (!client)
        throw Error(
          "Select a registered customer before creating a staging project.",
        );
      if (
        !owner(actor) &&
        (client as Client & { stagingCreatedBy?: string }).stagingCreatedBy !==
          actor.userId &&
        !next.manager.projects.some(
          (item) =>
            item.clientId === client.id &&
            actor.grant.projectIds.includes(item.id),
        )
      )
        throw new AccessDenied(
          "Customer access is limited to assigned projects or your own unassigned customer drafts.",
        );
      createProject(
        next.manager,
        project,
        client?.name || text(p.clientName, "Customer name"),
        client?.contact || "",
        object(p.team || {}) as Record<string, string>,
        p.standard !== false,
        p.planMode === "empty" ? "empty" : "legacy",
      );
      if (linkedQuotation) {
        linkedQuotation.projectId = project.id;
        linkedQuotation.project = {
          ...linkedQuotation.project,
          name: project.name,
          location: project.location,
        };
        linkedQuotation.updatedAt = new Date().toISOString();
      }
      break;
    }
    case "project.assign": {
      const assignment = object(p.assignment) as unknown as Assignment;
      saveAssignment(
        next.manager,
        assignment,
        text(p.personId || assignment.personId, "Employee"),
        p.reassign === true,
        person(next, actor),
      );
      break;
    }
    case "quotation.new": {
      const quotation = newQuotation(next.manager);
      if (typeof p.projectId === "string" && p.projectId) {
        const project = next.manager.projects.find(
          (item) => item.id === p.projectId,
        )!;
        const customer = next.manager.clients.find(
          (item) => item.id === project.clientId,
        )!;
        quotation.projectId = project.id;
        quotation.customerId = customer.id;
        quotation.customer = {
          ...quotation.customer,
          name: customer.name,
          contact: customer.contact,
          address: customer.address || "",
          phone: customer.phone || "",
          email: customer.email || "",
        };
        quotation.project = {
          ...quotation.project,
          name: project.name,
          location: project.location,
        };
      }
      break;
    }
    case "quotation.save": {
      const quotation = object(p.quotation) as unknown as Quotation;
      if (
        quotation.projectId &&
        !next.manager.projects.some(
          (project) =>
            project.id === quotation.projectId &&
            project.clientId === quotation.customerId,
        )
      )
        throw Error("Quotation customer must match its assigned project.");
      saveQuotation(next.manager, quotation, p.validate === true);
      break;
    }
    case "quotation.status":
      changeQuotationStatus(
        next.manager,
        text(p.id, "Quotation"),
        p.status as Quotation["status"],
        typeof p.notes === "string" ? p.notes : "",
      );
      break;
    case "quotation.copy":
      copyQuotation(
        next.manager,
        text(p.id, "Quotation"),
        p.revision === true,
        typeof p.notes === "string" ? p.notes : "",
      );
      break;
    case "quotation.delete":
      deleteDraft(next.manager, text(p.id, "Quotation"));
      break;
    case "quotation.convert":
      convertQuotation(
        next.manager,
        text(p.quotationId, "Quotation"),
        text(p.projectId, "Project"),
        p.newProject as Project | undefined,
      );
      break;
    case "invoice.from-quotation": {
      const invoice = invoiceFromQuotation(
        next.manager,
        text(p.quotationId, "Quotation"),
        typeof p.milestoneId === "string" ? p.milestoneId : "",
      );
      saveInvoice(next.manager, invoice);
      syncManagerInvoice(next, invoice.id);
      break;
    }
    case "invoice.save": {
      const invoice = structuredClone(object(p.invoice)) as unknown as Invoice;
      const old = next.manager.invoices.find(
        (item) => item.id === invoice.id,
      ) as (Invoice & { stagingOrigin?: string }) | undefined;
      if (old?.stagingOrigin === "accountant")
        throw Error(
          "Edit this Accountant-origin invoice in the Accountant Portal to preserve its itemization and tax evidence.",
        );
      delete (invoice as Invoice & { stagingOrigin?: string }).stagingOrigin;
      saveInvoice(next.manager, invoice);
      syncManagerInvoice(next, invoice.id);
      break;
    }
    case "invoice.issue": {
      const id = text(p.id, "Invoice");
      if (
        (
          next.manager.invoices.find((item) => item.id === id) as
            (Invoice & { stagingOrigin?: string }) | undefined
        )?.stagingOrigin === "accountant"
      )
        throw Error(
          "Issue this Accountant-origin invoice in the Accountant Portal; VAT policy remains pending.",
        );
      issueInvoice(next.manager, id);
      syncManagerInvoice(next, id);
      break;
    }
    case "payment.record": {
      const payment = object(p.payment) as unknown as Payment;
      const invoice = next.manager.invoices.find(
        (item) => item.id === payment.invoiceId,
      );
      if (
        !invoice ||
        payment.customerId !== invoice.customerId ||
        payment.projectId !== invoice.projectId
      )
        throw Error(
          "Payment must match the canonical invoice customer and project.",
        );
      applyAccounts(
        next,
        {
          kind: "receipt",
          id: payment.id,
          documentId: payment.invoiceId,
          amount: payment.amount,
          date: payment.date,
          account:
            payment.bank &&
            next.finance.accounting.accounts.some(
              (item) => item.id === payment.bank,
            )
              ? payment.bank
              : payment.method === "Cash"
                ? "cash"
                : "bank",
          reference: payment.reference,
        },
        actor,
      );
      break;
    }
    case "supplier.save":
      operations.saveSupplier(
        next.manager,
        object(p.supplier) as unknown as Supplier,
        person(next, actor),
      );
      break;
    case "procurement.material":
      operations.saveMaterial(
        next.manager,
        object(p.entity) as unknown as Material,
        person(next, actor),
      );
      break;
    case "procurement.request":
      operations.saveRequest(
        next.manager,
        object(p.entity) as unknown as PurchaseRequest,
        person(next, actor),
      );
      break;
    case "procurement.rfq":
      operations.createRfq(
        next.manager,
        text(p.requestId, "Request"),
        text(p.supplierId, "Supplier"),
        text(p.deliveryDate, "Delivery date"),
        text(p.deadline, "Deadline"),
        person(next, actor),
      );
      break;
    case "procurement.rfqs": {
      if (
        !Array.isArray(p.supplierIds) ||
        !p.supplierIds.length ||
        p.supplierIds.some((id) => typeof id !== "string") ||
        new Set(p.supplierIds).size !== p.supplierIds.length
      )
        throw Error("Select unique suppliers for the RFQ batch.");
      for (const id of p.supplierIds)
        operations.createRfq(
          next.manager,
          text(p.requestId, "Request"),
          text(id, "Supplier"),
          text(p.deliveryDate, "Delivery date"),
          text(p.deadline, "Deadline"),
          person(next, actor),
        );
      break;
    }
    case "procurement.close-rfq": {
      const rfq = next.manager.operations!.rfqs.find(
        (item) => item.id === p.id,
      );
      if (!rfq || rfq.status === "Closed") throw Error("Choose an open RFQ.");
      rfq.status = "Closed";
      break;
    }
    case "procurement.quote":
      operations.saveSupplierQuote(
        next.manager,
        object(p.entity) as unknown as SupplierQuote,
        person(next, actor),
      );
      break;
    case "procurement.submit":
      operations.submitApproval(
        next.manager,
        p.kind as ApprovalKind,
        text(p.entityId, "Record"),
        text(p.stage, "Approval stage"),
        person(next, actor),
        text(p.approverId, "Approver"),
      );
      break;
    case "procurement.decide": {
      const id = text(p.approvalId, "Approval");
      const approval = next.manager.operations!.approvals.find(
        (item) => item.id === id,
      );
      if (!approval) throw Error("Approval not found.");
      if (approval.requesterId === person(next, actor))
        throw new AccessDenied("An independent approver is required.");
      if (approval.approverId !== person(next, actor))
        throw new AccessDenied(
          "Only the assigned approver may record this decision.",
        );
      operations.decideApproval(
        next.manager,
        id,
        p.approved === true,
        text(p.comments, "Comments"),
        person(next, actor),
      );
      break;
    }
    case "procurement.order":
      operations.createOrder(
        next.manager,
        text(p.supplierQuoteId, "Supplier quotation"),
        text(p.location, "Delivery location"),
        text(p.date, "Delivery date"),
        person(next, actor),
      );
      break;
    case "procurement.delivery":
      operations.receiveDelivery(
        next.manager,
        object(p.delivery) as unknown as Delivery,
        person(next, actor),
      );
      break;
    case "procurement.bill": {
      const bill = operations.recordBill(
        next.manager,
        object(p.bill) as unknown as Parameters<
          typeof operations.recordBill
        >[1],
        person(next, actor),
      );
      if (BigInt(bill.vat) !== 0n)
        throw new StagingPolicyError(
          "vat_policy_pending",
          "VAT-bearing supplier bills remain blocked pending tax policy.",
        );
      refreshCatalog(next);
      next.finance = applyReviewAction(next.finance, {
        kind: "bill",
        id: bill.id,
        party: bill.supplierSnapshot.name,
        date: bill.date,
        due: bill.due,
        description: `Supplier bill ${bill.reference}`,
        amount: amountString(BigInt(bill.gross)),
        category: "Cost of Sales",
        poReference: next.manager.operations!.orders.find(
          (item) => item.id === bill.poId,
        )!.number,
        invoiceReference: bill.reference,
        projectId: bill.projectId,
      });
      break;
    }
    case "procurement.payment": {
      const payment = object(p.payment) as unknown as SupplierPayment;
      const bill = next.manager.operations!.bills.find(
        (item) => item.id === payment.billId,
      );
      if (
        !bill ||
        payment.projectId !== bill.projectId ||
        payment.supplierId !== bill.supplierId
      )
        throw Error("Supplier payment must match the canonical bill.");
      applyAccounts(
        next,
        {
          kind: "supplier-payment",
          id: payment.id,
          documentId: payment.billId,
          date: payment.date,
          amount: payment.amount,
          account:
            payment.bank &&
            next.finance.accounting.accounts.some(
              (item) => item.id === payment.bank,
            )
              ? payment.bank
              : "bank",
          reference: payment.reference,
        },
        actor,
      );
      break;
    }
    case "expense.submit": {
      const id = text(p.id, "Expense ID"),
        projectId = text(p.projectId, "Project");
      requireProject(next, actor, projectId);
      if (
        next.expenseSubmissions.some((item) => item.id === id) ||
        next.finance.expenses.some((item) => item.id === id)
      )
        throw Error("Expense ID already exists.");
      const amount = text(p.amount, "Amount");
      if (parseFils(amount) <= 0n)
        throw Error("Expense amount must be positive.");
      const date = text(p.date, "Expense date");
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
      )
        throw Error("Invalid expense date.");
      next.expenseSubmissions.push({
        id,
        projectId,
        amount,
        date,
        description: text(p.description, "Description"),
        payee: text(p.payee, "Payee"),
        departmentId: departmentId(p.departmentId),
        ledgerId: typeof p.ledgerId === "string" ? p.ledgerId : undefined,
        submittedBy: actor.userId,
        submittedPersonId: person(next, actor),
        status: "Submitted",
      });
      break;
    }
    case "expense.approve": {
      const submission = next.expenseSubmissions.find(
        (item) => item.id === p.id,
      );
      if (!submission || submission.status !== "Submitted")
        throw Error("Choose a pending expense submission.");
      if (submission.submittedBy === actor.userId)
        throw new AccessDenied(
          "Only an independent approver may decide a pending expense.",
        );
      requireProject(next, actor, submission.projectId);
      submission.status = p.approved === true ? "Approved" : "Rejected";
      submission.approvedBy = actor.userId;
      submission.comments = text(p.comments, "Decision comments");
      submission.approvedAt = new Date().toISOString();
      submission.approvalSnapshot = JSON.stringify({ ...submission });
      break;
    }
    case "accounts.action": {
      const action = object(p.action) as unknown as ReviewAction;
      if (
        ![
          "invoice",
          "update-invoice-draft",
          "issue-invoice",
          "bill",
          "update-bill-draft",
          "issue-bill",
          "receipt",
          "supplier-payment",
          "expense",
          "transfer",
          "create-expense-ledger",
          "create-cash-account",
          "document-draft",
          "create-bill-from-review",
          "create-expense-from-review",
        ].includes(action.kind)
      )
        throw Error("Unsupported finance command.");
      applyAccounts(next, action, actor);
      break;
    }
    default:
      throw Error(
        "This action is not supported by the shared staging command boundary.",
      );
  }
  refreshCommercialView(next);
  refreshCatalog(next);
  return next;
}

export function sharedManagerView(
  state: SharedCompanyState,
  actor: SharedActor,
): Database {
  requireWorkspace(actor, "manager");
  if (owner(actor)) return structuredClone(state.manager);
  const db = structuredClone(state.manager);
  const allowed = new Set(actor.grant.projectIds);
  db.projects = db.projects.filter((item) => allowed.has(item.id));
  db.planning = db.planning?.filter((item) => allowed.has(item.projectId));
  const clients = new Set(db.projects.map((item) => item.clientId));
  db.clients = db.clients.filter(
    (item) =>
      clients.has(item.id) ||
      (item as Client & { stagingCreatedBy?: string }).stagingCreatedBy ===
        actor.userId,
  );
  for (const key of [
    "phases",
    "assignments",
    "tasks",
    "milestones",
    "updates",
    "snags",
    "documents",
    "handover",
    "activities",
    "quotations",
    "contracts",
    "invoices",
    "payments",
    "expenses",
  ] as const)
    (db[key] as unknown[]) = db[key].filter(
      (item) => "projectId" in item && allowed.has(String(item.projectId)),
    );
  if (role(actor, ["site_staff"])) {
    db.quotations = [];
    db.contracts = [];
    db.invoices = [];
    db.payments = [];
    db.expenses = [];
    db.clients = [];
    db.operations = { ...emptyOperations(), settings: db.operations!.settings };
  } else if (db.operations) {
    for (const key of [
      "variations",
      "materials",
      "requests",
      "rfqs",
      "quotes",
      "orders",
      "deliveries",
      "bills",
      "supplierPayments",
      "credits",
      "refunds",
      "budgets",
      "approvals",
      "closures",
    ] as const)
      (db.operations[key] as unknown[]) = db.operations[key].filter((item) =>
        allowed.has(item.projectId),
      );
  }
  return db;
}

export function sharedExpenseSubmissions(
  state: SharedCompanyState,
  actor: SharedActor,
): ExpenseSubmission[] {
  if (
    actor.grant.workspaces.includes("accountant") &&
    role(actor, ["owner", "admin", "accountant"])
  ) {
    requireWorkspace(actor, "accountant");
    return structuredClone(
      state.expenseSubmissions.filter(
        (item) => owner(actor) || ["Approved", "Posted"].includes(item.status),
      ),
    );
  }
  requireWorkspace(actor, "manager");
  return structuredClone(
    state.expenseSubmissions.filter(
      (item) =>
        owner(actor) ||
        (actor.grant.projectIds.includes(item.projectId) &&
          (!role(actor, ["site_staff"]) || item.submittedBy === actor.userId)),
    ),
  );
}

export { departments };
