import type { Database, Project } from "../domain/model";
import type { Expense, Invoice, Payment } from "./model";
import { expenseCategories, paymentMethods } from "./model";
import { addDays, today, uid } from "../domain/logic";
import { createProject, record } from "../domain/repository";
import { defaultCompany } from "../quotation/seed";
import {
  discountAmount,
  totals,
  paymentAmount,
} from "../quotation/calculations";
import {
  amountString,
  cents,
  invoiceTotals,
  invoiceLineTotals,
  balanceDue,
  effectiveProject,
} from "./calculations";
import { customerSnapshot } from "./customer-domain";
import { initializeCommercial } from "./migration";
import { getOperations } from "../operations/migration";

export function validDate(value: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    throw Error("Enter a valid date.");
}
function relation(
  db: Database,
  customerId: string,
  projectId: string,
  active = true,
) {
  const c = db.clients.find((x) => x.id === customerId);
  if (!c || (active && c.status === "Archived"))
    throw Error("Choose an active customer.");
  if (
    projectId &&
    !db.projects.some((p) => p.id === projectId && p.clientId === customerId)
  )
    throw Error("Project must belong to the selected customer.");
  return c;
}
export function newProjectDetails(
  db: Database,
  customerId: string,
  name = "",
  location = "",
): Project {
  let sequence =
    Math.max(
      0,
      ...db.projects.map((p) => Number(p.code.replace(/\D/g, "")) || 0),
    ) + 1;
  while (
    db.projects.some(
      (p) => p.code === "AZ-" + String(sequence).padStart(3, "0"),
    )
  )
    sequence++;
  return {
    id: uid(),
    code: "AZ-" + String(sequence).padStart(3, "0"),
    name,
    clientId: customerId,
    location,
    emirate: "Dubai",
    building: "",
    unit: "",
    area: 0,
    scope: "",
    disciplines: [],
    type: "Office Fit-Out",
    value: 0,
    start: today(),
    due: addDays(today(), 90),
    managerId: db.people[0]?.id || "",
    priority: "Normal",
    status: "Active",
  };
}
export function convertQuotation(
  db: Database,
  quotationId: string,
  projectId: string,
  newProject?: Project,
) {
  initializeCommercial(db);
  const q = db.quotations.find((x) => x.id === quotationId);
  if (!q || q.status !== "Accepted")
    throw Error("Accept the quotation before converting it.");
  const existing = db.contracts.find((c) => c.familyId === q.familyId);
  if (existing) {
    if (existing.quotationId !== q.id || existing.projectId !== projectId)
      throw Error(
        "This quotation family is already contracted. Open its existing project.",
      );
    return existing;
  }
  const c = relation(db, q.customerId, newProject ? "" : projectId);
  if (
    q.projectId &&
    db.projects.some((p) => p.id === q.projectId) &&
    (newProject || projectId !== q.projectId)
  )
    throw Error(
      "This quotation already has a project. Convert using its existing project.",
    );
  const t = totals(q),
    net = t.subtotal - discountAmount(q);
  if (net <= 0n) throw Error("A contract needs a positive accepted value.");
  if (newProject) {
    if (newProject.clientId !== q.customerId)
      throw Error("New project customer must match the accepted quotation.");
    createProject(
      db,
      { ...newProject, value: Number(net) / 100 },
      c.name,
      c.contact,
      {},
      true,
    );
    projectId = newProject.id;
  }
  relation(db, q.customerId, projectId);
  if (!projectId) throw Error("Select or create a project.");
  if (db.contracts.some((c) => c.projectId === projectId))
    throw Error(
      "This project already has an accepted contract. Variations require a separate approved workflow.",
    );
  const contract = {
    id: uid(),
    quotationId: q.id,
    familyId: q.familyId,
    customerId: q.customerId,
    projectId,
    acceptedAt:
      q.acceptedAt ||
      q.history.find((h) => h.action.endsWith("→ Accepted"))?.date ||
      q.updatedAt,
    convertedAt: new Date().toISOString(),
    net: net.toString(),
    vat: t.vat.toString(),
    gross: t.grand.toString(),
    quotationSnapshot: JSON.stringify(q),
    paymentTerms: q.payments
      .map((p) => `${p.description}: ${p.percentage}% ${p.notes}`)
      .join("\n"),
  };
  db.contracts.push(contract);
  record(
    db,
    projectId,
    "Contract",
    contract.id,
    "Accepted quotation converted",
    q.number + " Rev " + q.revision,
  );
  return contract;
}
export function blankInvoice(customerId = "", projectId = ""): Invoice {
  return {
    id: uid(),
    number: "",
    customerId,
    projectId,
    quotationId: "",
    milestoneId: "",
    date: today(),
    due: addDays(today(), 30),
    description: "",
    lines: [
      {
        id: uid(),
        description: "",
        quantity: "1",
        rate: "0",
        tax: "Exclusive",
      },
    ],
    discount: "0",
    vatPercentage: "5",
    terms: "",
    notes: "",
    status: "Draft",
    createdAt: new Date().toISOString(),
  };
}
export function milestoneAmounts(db: Database, quotationId: string) {
  const q = db.quotations.find((q) => q.id === quotationId);
  if (!q) throw Error("Quotation not found.");
  const grand = totals(q).grand;
  const values = q.payments.map((p) => paymentAmount(p, grand));
  const difference = grand - values.reduce((s, n) => s + n, 0n);
  if (difference < -1n || difference > 1n)
    throw Error(
      "Payment schedule amounts must equal quotation total within one fils before invoicing. Create a corrected revision.",
    );
  // Explicit last-milestone reconciliation, leaving the accepted schedule immutable.
  if (values.length) values[values.length - 1] += difference;
  if (values.some((v) => v <= 0n))
    throw Error("All invoice milestones must have a positive amount.");
  return { values, difference };
}
export function invoiceFromQuotation(
  db: Database,
  quotationId: string,
  milestoneId = "",
) {
  const q = db.quotations.find((q) => q.id === quotationId);
  if (!q || q.status !== "Accepted")
    throw Error("Only accepted quotations can generate invoices.");
  if (!effectiveProject(db, q.id))
    throw Error(
      "Convert the accepted quotation to a project before generating its invoices.",
    );
  const i = blankInvoice(q.customerId, effectiveProject(db, q.id));
  i.quotationId = q.id;
  i.milestoneId = milestoneId;
  i.vatPercentage = q.vatEnabled ? q.vatPercentage : "0";
  const term = q.payments.find((p) => p.id === milestoneId);
  const t = totals(q);
  if (milestoneId && !term) throw Error("Payment milestone not found.");
  const amount = term
    ? milestoneAmounts(db, q.id).values[q.payments.indexOf(term)]
    : t.grand;
  i.lines = [
    {
      id: uid(),
      description:
        term?.description ||
        "Accepted scope · " + q.number + " Rev " + q.revision,
      quantity: "1",
      rate: amountString(amount),
      tax: "Inclusive",
    },
  ];
  i.description = term?.description || q.project.name;
  i.terms = term
    ? term.description + " " + term.notes
    : q.payments
        .map((p) => p.description + ": " + p.percentage + "% " + p.notes)
        .join("\n");
  if (term && milestoneAmounts(db, q.id).difference !== 0n)
    i.notes =
      "Final milestone reconciles the accepted schedule by one fils to the quotation total.";
  return i;
}
function validateInvoice(db: Database, i: Invoice) {
  relation(db, i.customerId, i.projectId);
  validDate(i.date);
  validDate(i.due);
  if (i.due < i.date) throw Error("Due date cannot precede invoice date.");
  if (
    !i.lines.length ||
    new Set(i.lines.map((line) => line.id)).size !== i.lines.length ||
    i.lines.some(
      (l) =>
        !l.description.trim() ||
        !["Exclusive", "Inclusive", "Zero Rated", "Exempt"].includes(l.tax),
    )
  )
    throw Error("Add invoice items with descriptions and valid tax treatment.");
  const t = invoiceTotals({ ...i, snapshot: undefined, status: "Draft" });
  if (t.net < 0n || t.vat < 0n)
    throw Error("Invoice taxable bases and VAT must be non-negative.");
  if (t.grand <= 0n) throw Error("Invoice total must be positive.");
  if (i.variationId) {
    const v = getOperations(db).variations.find(
      (v) => v.id === i.variationId && v.status === "Approved",
    );
    if (
      !v ||
      v.customerId !== i.customerId ||
      v.projectId !== i.projectId ||
      BigInt(v.gross!) !== t.grand ||
      BigInt(v.net!) !== t.net ||
      BigInt(v.vat!) !== t.vat ||
      i.quotationId ||
      i.milestoneId
    )
      throw Error(
        "Variation invoice must match its approved value/customer/project.",
      );
    if (
      db.invoices.some(
        (x) =>
          x.id !== i.id &&
          x.variationId === i.variationId &&
          x.status !== "Cancelled",
      )
    )
      throw Error("Variation already invoiced or reserved.");
  }
  if (
    db.invoices.some(
      (x) =>
        x.id !== i.id &&
        i.number &&
        x.number.toLowerCase() === i.number.toLowerCase(),
    )
  )
    throw Error("Invoice number must be unique.");
  if (i.milestoneId && !i.quotationId)
    throw Error("Milestone requires a related quotation.");
  if (i.quotationId) {
    const q = db.quotations.find((q) => q.id === i.quotationId);
    if (
      !q ||
      q.status !== "Accepted" ||
      q.customerId !== i.customerId ||
      effectiveProject(db, q.id) !== i.projectId
    )
      throw Error(
        "Invoice must match the accepted quotation customer and project.",
      );
    const family = new Set(
      db.quotations.filter((x) => x.familyId === q.familyId).map((x) => x.id),
    );
    const siblings = db.invoices.filter(
      (x) =>
        x.id !== i.id && x.status !== "Cancelled" && family.has(x.quotationId),
    );
    if (i.milestoneId) {
      const index = q.payments.findIndex((p) => p.id === i.milestoneId);
      if (index < 0) throw Error("Payment milestone not found.");
      if (
        siblings.some((x) => x.milestoneId === i.milestoneId || !x.milestoneId)
      )
        throw Error(
          "This milestone or full quotation is already invoiced or reserved by a draft.",
        );
      if (t.grand !== milestoneAmounts(db, q.id).values[index])
        throw Error("Milestone invoice total must equal its eligible amount.");
    } else if (siblings.length)
      throw Error(
        "Quotation already has invoices or milestone drafts. Open existing invoices.",
      );
    const billed = siblings.reduce((s, x) => s + invoiceTotals(x).grand, 0n);
    if (billed + t.grand > totals(q).grand)
      throw Error("Invoicing exceeds accepted quotation value.");
  }
  return t;
}
export function saveInvoice(db: Database, draft: Invoice) {
  initializeCommercial(db);
  const old = db.invoices.find((i) => i.id === draft.id);
  const previous = old ? JSON.stringify(old) : undefined;
  if (old && old.status !== "Draft")
    throw Error(
      "Issued invoices are immutable. Cancel with a reason and create a replacement.",
    );
  if (draft.status !== "Draft")
    throw Error("Use Issue Invoice to preserve a financial snapshot.");
  validateInvoice(db, draft);
  const next = structuredClone(draft);
  delete next.snapshot;
  delete next.issuedAt;
  delete next.cancelledAt;
  if (!next.number) {
    do {
      next.number =
        (db.operations?.settings.invoicePrefix || "INV-") +
        String(db.commercialNumbering.invoice++).padStart(5, "0");
    } while (db.invoices.some((i) => i.number === next.number));
  }
  if (old) Object.assign(old, next);
  else db.invoices.push(next);
  record(
    db,
    next.projectId,
    "Invoice",
    next.id,
    old ? "Draft invoice updated" : "Invoice draft created",
    next.number,
    previous,
  );
  return next;
}
export function issueInvoice(db: Database, id: string) {
  const i = db.invoices.find((i) => i.id === id);
  if (!i || i.status !== "Draft")
    throw Error("Only draft invoices can be issued.");
  if (i.date > today())
    throw Error("Invoice date cannot be in the future when issuing.");
  const t = validateInvoice(db, i);
  const c = db.clients.find((c) => c.id === i.customerId)!;
  const q = db.quotations.find((q) => q.id === i.quotationId);
  const lineAllocations = invoiceLineTotals(i).map((line, index) => ({
    itemId: i.lines[index].id,
    tax: i.lines[index].tax,
    subtotal: line.subtotal.toString(),
    discount: line.discount.toString(),
    net: line.net.toString(),
    vat: line.vat.toString(),
    grand: line.grand.toString(),
  }));
  i.snapshot = {
    customer: customerSnapshot(c),
    company: structuredClone(
      db.operations?.settings.company || q?.company || defaultCompany,
    ),
    project: db.projects.find((p) => p.id === i.projectId)?.name || "",
    quotation: q ? q.number + " Rev " + q.revision : "",
    subtotal: t.subtotal.toString(),
    discount: t.discount.toString(),
    net: t.net.toString(),
    vat: t.vat.toString(),
    grand: t.grand.toString(),
    allocationVersion: 1,
    lineAllocations,
  };
  i.status = "Issued";
  i.issuedAt = new Date().toISOString();
  record(
    db,
    i.projectId,
    "Invoice",
    i.id,
    "Invoice issued",
    i.number,
    JSON.stringify(i),
  );
}
export function cancelInvoice(db: Database, id: string, reason: string) {
  const i = db.invoices.find((i) => i.id === id);
  if (!i || i.status === "Cancelled" || !reason.trim())
    throw Error("Enter a reason for cancellation.");
  if (db.payments.some((p) => p.invoiceId === id && !p.reversedAt))
    throw Error("Reverse allocated receipts before cancelling this invoice.");
  if (
    getOperations(db).credits.some(
      (c) => c.invoiceId === id && c.status !== "Rejected",
    ) ||
    getOperations(db).refunds.some((r) => r.invoiceId === id && !r.reversedAt)
  )
    throw Error(
      "Invoices with credit notes/refunds must be corrected through the credit workflow.",
    );
  record(
    db,
    i.projectId,
    "Invoice",
    i.id,
    "Invoice cancelled",
    i.number + ": " + reason,
    JSON.stringify(i),
  );
  i.status = "Cancelled";
  i.cancelledAt = new Date().toISOString();
}
export function postPayment(db: Database, payment: Payment) {
  initializeCommercial(db);
  const i = db.invoices.find((i) => i.id === payment.invoiceId);
  if (!i || i.status !== "Issued") throw Error("Choose an issued invoice.");
  relation(db, payment.customerId, payment.projectId, false);
  if (i.customerId !== payment.customerId || i.projectId !== payment.projectId)
    throw Error("Receipt must match invoice customer and project.");
  validDate(payment.date);
  if (payment.date > today() || payment.date < i.date)
    throw Error("Receipt date must be between invoice date and today.");
  if (
    !payment.reference.trim() ||
    !payment.postingKey ||
    !paymentMethods.includes(payment.method)
  )
    throw Error("Payment reference and valid method are required.");
  const normalized = (s: string) => s.trim().toLowerCase();
  if (
    db.payments.some(
      (p) =>
        p.id === payment.id ||
        p.postingKey === payment.postingKey ||
        (!p.reversedAt &&
          normalized(p.reference) === normalized(payment.reference) &&
          normalized(p.bank) === normalized(payment.bank)),
    )
  )
    throw Error(
      "Duplicate receipt posting/reference. Open the existing receipt or use a distinct bank reference.",
    );
  const value = cents(payment.amount);
  if (value <= 0n || value > balanceDue(db, i))
    throw Error(
      "Payment must be positive and cannot exceed the invoice balance.",
    );
  if (payment.reversedAt || payment.reversalDate)
    throw Error("New receipts cannot contain reversal metadata.");
  const next = structuredClone(payment);
  do {
    next.number =
      "RCT-" + String(db.commercialNumbering.receipt++).padStart(5, "0");
  } while (db.payments.some((p) => p.number === next.number));
  next.amount = amountString(value);
  next.createdAt = new Date().toISOString();
  db.payments.push(next);
  record(
    db,
    i.projectId,
    "Payment",
    next.id,
    "Receipt posted",
    next.number + " · " + i.number + " · AED " + next.amount,
  );
  return next;
}
export function reversePayment(db: Database, id: string, reason: string) {
  const p = db.payments.find((p) => p.id === id);
  if (!p || p.reversedAt || !reason.trim())
    throw Error("Choose an active receipt and enter a correction reason.");
  record(
    db,
    p.projectId,
    "Payment",
    p.id,
    "Receipt reversed",
    p.number + ": " + reason,
    JSON.stringify(p),
  );
  p.reversedAt = new Date().toISOString();
  p.reversalDate = today();
  p.reversalReason = reason;
}
export function saveExpense(db: Database, expense: Expense) {
  initializeCommercial(db);
  if (!db.projects.some((p) => p.id === expense.projectId))
    throw Error("Select a project.");
  validDate(expense.date);
  if (
    !expense.description.trim() ||
    !expense.supplier.trim() ||
    !expenseCategories.includes(
      expense.category as (typeof expenseCategories)[number],
    ) ||
    !paymentMethods.includes(expense.method)
  )
    throw Error(
      "Enter expense description, supplier, category and payment method.",
    );
  const base = cents(expense.amount),
    vat = cents(expense.vat),
    paid = cents(expense.paidAmount);
  if (base <= 0n || paid > base + vat)
    throw Error(
      "Expense must be positive; paid amount cannot exceed gross expense.",
    );
  const old = db.expenses.find((e) => e.id === expense.id);
  if (old?.supplierBillId || expense.supplierBillId)
    throw Error(
      "Correct supplier-bill costs through Procurement to preserve quantity and payment controls.",
    );
  const next = structuredClone(expense);
  if (!next.reference) {
    do {
      next.reference =
        "EXP-" + String(db.commercialNumbering.expense++).padStart(5, "0");
    } while (db.expenses.some((e) => e.reference === next.reference));
  }
  if (
    db.expenses.some(
      (e) =>
        e.id !== next.id &&
        e.reference.toLowerCase() === next.reference.toLowerCase(),
    )
  )
    throw Error("Expense reference must be unique.");
  record(
    db,
    next.projectId,
    "Expense",
    next.id,
    old ? "Expense corrected" : "Expense recorded",
    next.reference,
    old ? JSON.stringify(old) : undefined,
  );
  if (old) Object.assign(old, next);
  else db.expenses.push(next);
  return next;
}
