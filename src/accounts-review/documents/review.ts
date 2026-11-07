import { ReviewDraftError, reviewSchemaError } from "./review-errors.js";
import type { ExpenseCategoryMapping } from "../../finance/expense-submissions.js";
import type { ReviewState } from "../domain.js";
import { expenseLedgersFor } from "../expense-ledgers.js";
import {
  emptyEntries,
  blankFields,
  type DocumentReview,
  fieldsSchema,
  draftFieldsSchema,
  type EntryFields,
  type EntryWarning,
  type ReferenceCatalog,
} from "./model.js";

// Uses the existing expense-category contract and the review ledger's existing accounts.
// These are demo mappings only, never a claim of approved production tax treatment.
export const categories: ExpenseCategoryMapping[] = [
  {
    id: "project-materials",
    name: "Project materials",
    expenseAccountId: "cost",
    allowedScopes: ["project"],
    active: true,
  },
  {
    id: "site-consumables",
    name: "Site consumables",
    expenseAccountId: "operating",
    allowedScopes: ["project"],
    active: true,
  },
  {
    id: "company-expenses",
    name: "Company expenses",
    expenseAccountId: "operating",
    allowedScopes: ["company"],
    active: true,
  },
];
export const normalize = (value: string) =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
const uniqueMatch = <T>(values: T[], predicate: (value: T) => boolean) => {
  const found = values.filter(predicate);
  return found.length === 1 ? found[0] : undefined;
};
type MatchContext = Pick<
  ReviewState,
  | "bills"
  | "invoices"
  | "documentEntries"
  | "documentCatalog"
  | "expenseLedgers"
>;
export const scopeFor = (f: EntryFields) =>
  f.kind === "company-expense" ||
  (f.kind === "supplier-bill" &&
    categories
      .find((c) => c.id === f.categoryId)
      ?.allowedScopes.includes("company"))
    ? "company"
    : "project";
export function catalogFor(state: MatchContext): ReferenceCatalog {
  return (
    state.documentCatalog ?? {
      suppliers: [...new Set(state.bills.map((b) => b.party))],
      customers: [...new Set(state.invoices.map((i) => i.party))].map(
        (name) => ({ id: name, name }),
      ),
      // The isolated portal has no canonical project/product directory. Explicit synthetic references only.
      projects: [{ id: "demo-apartment", name: "Sample apartment renovation" }],
      products: [
        {
          id: "demo-paint",
          name: "Interior paint",
          unit: "tin",
          supplier: "Sample Supplier B",
          rate: "50.00",
        },
      ],
    }
  );
}
export const fils = (s: string) => {
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(s))
    throw Error("Enter a nonnegative amount.");
  const [a, b = ""] = s.split(".");
  return BigInt(a) * 100n + BigInt(b.padEnd(2, "0"));
};
export const reviewDiscountFils = (s: string | undefined): bigint =>
  !s ? 0n : s.startsWith("-") ? -fils(s.slice(1)) : fils(s);
export const amountText = (n: bigint): string => {
  const sign = n < 0n ? "-" : "";
  const a = n < 0n ? -n : n;
  return sign + String(a / 100n) + "." + String(a % 100n).padStart(2, "0");
};
export function lineNet(q: string, rate: string): bigint {
  if (!/^\d{1,8}(\.\d{1,4})?$/.test(q)) throw Error("Enter a valid quantity.");
  const [a, b = ""] = q.split(".");
  return (
    ((BigInt(a) * 10000n + BigInt(b.padEnd(4, "0"))) * fils(rate) + 5000n) /
    10000n
  );
}
export function suggest(fields: EntryFields, state: ReviewState): EntryFields {
  const f = structuredClone(fields),
    c = catalogFor(state);
  f.supplier =
    uniqueMatch(c.suppliers, (s) => normalize(s) === normalize(f.supplier)) ||
    f.supplier;
  f.projectId =
    uniqueMatch(
      c.projects,
      (p) => normalize(p.name) === normalize(f.projectName),
    )?.id || "";
  f.customerId =
    uniqueMatch(
      c.customers,
      (p) => normalize(p.name) === normalize(f.customerName),
    )?.id || "";
  const saved = state.documentEntries?.defaults.find(
    (d) => normalize(d.supplier) === normalize(f.supplier),
  );
  const useDefault = Boolean(
    saved && (f.kind === "unknown" || f.kind === saved.kind),
  );
  if (saved && useDefault) {
    f.kind = saved.kind;
    f.categoryId = saved.categoryId;
    if (!f.projectName) f.projectId = saved.projectId;
    if (!f.department) f.department = saved.department;
    if (!f.ledgerId) f.ledgerId = saved.ledgerId;
  }
  for (const i of f.items)
    i.productId =
      uniqueMatch(
        c.products,
        (p) =>
          normalize(p.name) === normalize(i.description) &&
          normalize(p.unit) === normalize(i.unit),
      )?.id || "";
  if (!useDefault && f.kind !== "unknown" && !f.categoryId)
    f.categoryId =
      f.kind === "company-expense" ? "company-expenses" : "project-materials";
  if (!f.ledgerId) {
    const mapping = categories.find(
      (category) => category.id === f.categoryId && category.active,
    );
    const ledger = mapping
      ? uniqueMatch(
          expenseLedgersFor(state),
          (entry) => entry.accountId === mapping.expenseAccountId,
        )
      : undefined;
    if (ledger) f.ledgerId = ledger.id;
  }
  return f;
}
export function inspectFields(
  f: EntryFields,
  state: MatchContext,
  excludeId = "",
  digest = "",
): EntryWarning[] {
  const warnings: EntryWarning[] = [],
    add = (code: string, message: string, field: string) =>
      warnings.push({ code, message, field });
  if (f.documentType === "quotation")
    add(
      "quotation-not-invoice",
      "This is a quotation / not an official bill. Save it for review only; obtain an official invoice before creating a purchase bill or recording an expense.",
      "documentType",
    );
  for (const key of [
    "supplier",
    "date",
    "dueDate",
    "reference",
    "subtotal",
    "tax",
    "total",
  ] as const)
    if (!f[key] && (key !== "dueDate" || f.kind === "supplier-bill"))
      add(`missing-${key}`, `Check missing ${key}.`, key);
  if (f.currency !== "AED")
    add(
      "currency",
      "Confirm the currency before posting; only AED posting is supported.",
      "currency",
    );
  if (f.dueDate && f.date && f.dueDate < f.date)
    add(
      "due-date",
      "Due date cannot be earlier than the invoice date.",
      "dueDate",
    );
  if (f.kind === "unknown")
    add("kind", "Choose a document classification.", "kind");
  if (f.kind === "supplier-bill" && !f.purchaseOrderReference?.trim())
    add(
      "purchase-order",
      "Enter the purchase order reference before creating a bill.",
      "purchaseOrderReference",
    );
  const cat = categories.find((c) => c.id === f.categoryId);
  if (!cat)
    add("category", "Choose an existing expense category.", "categoryId");
  const catalog = catalogFor(state);
  if (!catalog.suppliers.some((s) => normalize(s) === normalize(f.supplier)))
    add(
      "supplier-match",
      "No exact supplier match; review this name. No supplier will be created.",
      "supplier",
    );
  if (scopeFor(f) === "project" && !f.projectId)
    add("project", "Select a project for project-related costs.", "projectId");
  if (f.customerName && !f.customerId)
    add(
      "customer",
      "No exact customer match; check the related customer.",
      "customerId",
    );
  if (
    f.subtotal &&
    f.tax &&
    f.total &&
    fils(f.subtotal) - reviewDiscountFils(f.discount) + fils(f.tax) !==
      fils(f.total)
  )
    add(
      "totals",
      "Subtotal less document discount plus tax does not equal the document total.",
      "total",
    );
  if (!f.items.length)
    add("items", "No line items were read; check the document.", "items");
  let nets = 0n,
    all = true,
    taxes = 0n,
    allTaxes = true;
  f.items.forEach((i, n) => {
    const prefix = `items.${n}`;
    if (!i.description || !i.quantity || !i.unitRate || !i.total) {
      add(
        `line-missing-${n}`,
        `Line ${n + 1}: check description, quantity, rate and amount.`,
        prefix,
      );
      all = false;
    }
    if (i.quantity && i.unitRate) {
      const net = lineNet(i.quantity, i.unitRate);
      const discount = reviewDiscountFils(i.discount);
      if (discount < 0n)
        add(
          `line-discount-negative-${n}`,
          `Line ${n + 1}: discount cannot be negative. Correct it before posting.`,
          `${prefix}.discount`,
        );
      if (discount > net)
        add(
          `line-discount-${n}`,
          `Line ${n + 1}: discount exceeds the line amount.`,
          `${prefix}.discount`,
        );
      nets += net - discount;
      if (i.total && i.tax && net - discount + fils(i.tax) !== fils(i.total))
        add(
          `line-math-${n}`,
          `Line ${n + 1} — Amount mismatch. Entered: AED ${i.total}; calculated: AED ${amountText(net - discount + fils(i.tax))}.`,
          `${prefix}.total`,
        );
    } else all = false;
    if (i.tax) taxes += fils(i.tax);
    else allTaxes = false;
    const p = catalog.products.find(
      (p) =>
        p.id === i.productId &&
        normalize(p.supplier) === normalize(f.supplier) &&
        normalize(p.unit) === normalize(i.unit),
    );
    if (p && i.unitRate && fils(p.rate) !== fils(i.unitRate))
      add(
        `price-${n}`,
        `Line ${n + 1}: ${p.name} changed from AED ${p.rate} to AED ${i.unitRate} per ${p.unit}.`,
        `${prefix}.unitRate`,
      );
    if (!i.productId)
      add(
        `product-${n}`,
        `Line ${n + 1}: no confirmed product match (optional for a review draft).`,
        `${prefix}.productId`,
      );
  });
  if (all && f.subtotal && nets !== fils(f.subtotal))
    add(
      "subtotal-lines",
      "Item net amounts do not match the subtotal.",
      "subtotal",
    );
  if (allTaxes && f.tax && taxes !== fils(f.tax))
    add("tax-lines", "Item taxes do not match the document tax.", "tax");
  if (
    f.discount &&
    f.subtotal &&
    reviewDiscountFils(f.discount) > fils(f.subtotal)
  )
    add("discount", "Document discount exceeds the subtotal.", "discount");
  if (f.discount && reviewDiscountFils(f.discount) < 0n)
    add(
      "discount-negative",
      "Document discount cannot be negative. Correct it before posting.",
      "discount",
    );
  if (f.total && fils(f.total) <= 0n)
    add(
      "nonpositive-total",
      "A positive total is needed before posting.",
      "total",
    );
  if (scopeFor(f) === "company" && f.projectId)
    add(
      "company-project",
      "Clear the project selection before posting a company expense.",
      "projectId",
    );
  const original = state.documentEntries?.reviews.find(
    (d) => d.id === excludeId,
  )?.extraction.fields;
  const changedDiscount = (
    oldValue: string | undefined,
    newValue: string | undefined,
  ) =>
    !!oldValue &&
    /^-?\d{1,10}(?:\.\d{1,2})?$/.test(oldValue) &&
    reviewDiscountFils(oldValue) !== reviewDiscountFils(newValue);
  if (original && changedDiscount(original.discount, f.discount))
    add(
      "discount-source-change",
      `Document discount differs from the extracted value AED ${original.discount}. Verify it against the original.`,
      "discount",
    );
  f.items.forEach((item, n) => {
    if (
      original?.items[n] &&
      changedDiscount(original.items[n].discount, item.discount)
    )
      add(
        `line-discount-source-${n}`,
        `Line ${n + 1}: discount differs from the extracted value AED ${original.items[n].discount}. Verify it against the original.`,
        `items.${n}.discount`,
      );
    if (
      item.productId &&
      !catalog.products.some((p) => p.id === item.productId)
    )
      add(
        `product-unavailable-${n}`,
        `Line ${n + 1}: the selected product match is unavailable. Review it before posting.`,
        `items.${n}.productId`,
      );
  });
  const reviews = state.documentEntries?.reviews || [];
  if (
    reviews.some(
      (d) =>
        d.id !== excludeId &&
        ((digest && d.sha256 === digest) ||
          (f.reference &&
            normalize(d.fields.supplier) === normalize(f.supplier) &&
            normalize(d.fields.reference) === normalize(f.reference)) ||
          (f.date &&
            f.total &&
            d.fields.date === f.date &&
            d.fields.total === f.total &&
            normalize(d.fields.supplier) === normalize(f.supplier))),
    )
  )
    add(
      "duplicate",
      "Possible duplicate document in this review session.",
      "reference",
    );
  if (
    state.bills.some(
      (b) =>
        normalize(b.party) === normalize(f.supplier) &&
        ((b.invoiceReference &&
          normalize(b.invoiceReference) === normalize(f.reference)) ||
          (f.date === b.date &&
            f.total &&
            fils(f.total) === BigInt(b.amountFils))),
    )
  )
    add(
      "existing-bill",
      "Possible match to an existing purchase bill. Check before later posting.",
      "reference",
    );
  return warnings;
}
export function saveDocumentDraft(
  previous: ReviewState,
  input: unknown,
  at: string,
): ReviewState {
  // Runtime validation deliberately rejects provider-supplied journal/account instructions.
  let action;
  try {
    action = draftActionSchema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) throw reviewSchemaError(error);
    throw error;
  }
  const next = structuredClone(previous),
    entries = next.documentEntries ?? emptyEntries();
  const doc = entries.reviews.find((d) => d.id === action.reviewId);
  if (!doc)
    throw new ReviewDraftError(
      "This review is not available to this account.",
      "draft-access-denied",
      403,
    );
  if (doc.convertedBillId || doc.convertedExpenseId)
    throw new ReviewDraftError(
      "This document is linked to a financial transaction and is read-only.",
      "draft-read-only",
      409,
    );
  if (doc.revision !== action.revision)
    throw new ReviewDraftError(
      "Your review has changed. Reload the latest saved version before saving again. Your entered changes are still shown.",
      "draft-stale",
      409,
    );
  const f = action.fields,
    catalog = catalogFor(next);
  if (f.projectId && !catalog.projects.some((p) => p.id === f.projectId))
    throw new ReviewDraftError(
      "The selected project is unavailable to this account. Clear it or choose an authorized project.",
      "draft-resource-unavailable",
      403,
      [
        {
          field: "projectId",
          message: "Choose an authorized project or clear this selection.",
        },
      ],
    );
  if (f.customerId && !catalog.customers.some((c) => c.id === f.customerId))
    throw new ReviewDraftError(
      "The selected customer is unavailable to this account. Clear it or choose an authorized customer.",
      "draft-resource-unavailable",
      403,
      [
        {
          field: "customerId",
          message: "Choose an authorized customer or clear this selection.",
        },
      ],
    );
  const category = categories.find((c) => c.id === f.categoryId && c.active),
    scope = scopeFor(f);
  const ledger = f.ledgerId
    ? expenseLedgersFor(next).find((l) => l.id === f.ledgerId)
    : undefined;
  if (f.ledgerId && !ledger)
    throw new ReviewDraftError(
      "The selected expense ledger is unavailable. Clear it to save an unclassified review draft.",
      "draft-resource-unavailable",
      403,
      [
        {
          field: "ledgerId",
          message: "Choose an available ledger or clear this selection.",
        },
      ],
    );
  const account = next.accounting.accounts.find(
    (a) =>
      a.id === (ledger?.accountId || category?.expenseAccountId) &&
      a.status === "Active" &&
      a.postable &&
      ["Cost of Sales", "Expense"].includes(a.type),
  );
  const mappingReady = !!(
    category &&
    category.allowedScopes.includes(scope) &&
    account &&
    f.kind !== "unknown" &&
    !(ledger?.group === "Direct Expense" && scope !== "project") &&
    (scope !== "project" || f.projectId) &&
    !(scope === "company" && f.projectId)
  );
  doc.corrections.push({
    at,
    actor: "demo-accountant",
    before: structuredClone(doc.fields),
    after: structuredClone(f),
  });
  doc.fields = f;
  doc.revision++;
  doc.status = "Draft";
  doc.warnings = inspectFields(f, next, doc.id, doc.sha256);
  doc.mapping =
    mappingReady && category && account
      ? {
          categoryId: category.id,
          accountId: account.id,
          accountCode: account.code,
          ...(ledger ? { ledgerId: ledger.id } : {}),
        }
      : undefined;
  if (!mappingReady && (f.categoryId || f.ledgerId || f.kind !== "unknown"))
    doc.warnings.push({
      code: "mapping-incomplete",
      field: "categoryId",
      message:
        "Classification/account mapping still needs review before posting. The review draft can be saved.",
    });
  if (action.rememberSupplier && !mappingReady)
    doc.warnings.push({
      code: "supplier-default-not-saved",
      field: "kind",
      message:
        "Supplier defaults were not changed because classification or mapping still needs review.",
    });
  if (
    action.rememberSupplier &&
    mappingReady &&
    f.supplier &&
    f.kind !== "unknown"
  ) {
    const value = {
      supplier: f.supplier,
      kind: f.kind,
      categoryId: f.categoryId,
      projectId: f.projectId,
      ...(f.department ? { department: f.department } : {}),
      ...(f.ledgerId ? { ledgerId: f.ledgerId } : {}),
    };
    entries.defaults = entries.defaults.filter(
      (d) => normalize(d.supplier) !== normalize(f.supplier),
    );
    entries.defaults.push(value);
  }
  next.documentEntries = entries;
  // No bill, paid expense, settlement or journal mutation exists on this path.
  return next;
}
import { z, ZodError } from "zod";
export const draftActionSchema = z
  .object({
    kind: z.literal("document-draft"),
    id: z.string().optional(),
    reviewId: z.string(),
    revision: z.number().int().nonnegative(),
    fields: draftFieldsSchema,
    confirmed: z.literal(true),
    rememberSupplier: z.boolean(),
  })
  .strict();

/** A manual review has no fabricated attachment, extraction or financial posting. */
export function blankManualReview(id: string, at: string): DocumentReview {
  return {
    id,
    sha256: "",
    attachmentId: "",
    createdAt: at,
    status: "Review",
    revision: 0,
    fields: blankFields(),
    corrections: [],
    warnings: [],
    extraction: {
      fields: blankFields(),
      uncertain: [],
      provider: "Manual entry",
      mode: "manual",
      requestedMode: "manual",
      reviewPolicy: "draft-only",
      reviewOnly: true,
      inputTokens: null,
      outputTokens: null,
      costUsd: 0,
      latencyMs: 0,
      retries: 0,
    },
  };
}
const manualDraftSchema = z
  .object({
    kind: z.literal("document-manual"),
    id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/),
    fields: draftFieldsSchema,
    confirmed: z.literal(true),
    rememberSupplier: z.boolean(),
  })
  .strict();
export function saveManualDocumentDraft(
  previous: ReviewState,
  input: unknown,
  at: string,
): ReviewState {
  let action;
  try {
    action = manualDraftSchema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) throw reviewSchemaError(error);
    throw error;
  }
  if (previous.documentEntries?.reviews.some((d) => d.id === action.id))
    throw new ReviewDraftError(
      "This manual draft already exists. Reopen it before editing.",
      "draft-stale",
      409,
    );
  const next = structuredClone(previous);
  next.documentEntries ??= emptyEntries();
  next.documentEntries.reviews.push(blankManualReview(action.id, at));
  return saveDocumentDraft(
    next,
    {
      kind: "document-draft",
      reviewId: action.id,
      revision: 0,
      fields: action.fields,
      confirmed: true,
      rememberSupplier: action.rememberSupplier,
    },
    at,
  );
}

/** Posting retains all former readiness requirements; incomplete reviews cannot issue or post. */
export function assertReviewReadyForPosting(
  fields: EntryFields,
  state: ReviewState,
): void {
  const f = fieldsSchema.parse(fields),
    catalog = catalogFor(state);
  if (
    !f.supplier ||
    !f.date ||
    !f.reference ||
    !f.total ||
    fils(f.total) <= 0n ||
    f.currency !== "AED" ||
    f.kind === "unknown"
  )
    throw Error(
      "Confirm supplier, date, reference, AED total and classification before posting this document.",
    );
  const category = categories.find((c) => c.id === f.categoryId && c.active),
    scope = scopeFor(f);
  if (!category || !category.allowedScopes.includes(scope))
    throw Error("Choose a category valid for this document scope.");
  const ledger = f.ledgerId
    ? expenseLedgersFor(state).find((l) => l.id === f.ledgerId)
    : undefined;
  if (f.ledgerId && !ledger) throw Error("Choose an existing expense ledger.");
  if (ledger?.group === "Direct Expense" && scope !== "project")
    throw Error("Direct expense ledgers require an existing project.");
  const account = state.accounting.accounts.find(
    (a) =>
      a.id === (ledger?.accountId || category.expenseAccountId) &&
      a.status === "Active" &&
      a.postable &&
      ["Cost of Sales", "Expense"].includes(a.type),
  );
  if (!account) throw Error("The category account is unavailable.");
  if (
    scope === "project" &&
    !catalog.projects.some((p) => p.id === f.projectId)
  )
    throw Error("Choose an existing project.");
  if (scope === "company" && f.projectId)
    throw Error("Company expenses cannot carry a project.");
  if (f.customerId && !catalog.customers.some((c) => c.id === f.customerId))
    throw Error("Choose an existing customer.");
  if (
    f.items.some(
      (i) => i.productId && !catalog.products.some((p) => p.id === i.productId),
    )
  )
    throw Error("Choose an existing product.");
}
