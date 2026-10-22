import type { ExpenseCategoryMapping } from "../../finance/expense-submissions";
import type { ReviewState } from "../domain";
import {
  emptyEntries,
  fieldsSchema,
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
  "bills" | "invoices" | "documentEntries" | "documentCatalog"
>;
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
  for (const key of [
    "supplier",
    "date",
    "reference",
    "subtotal",
    "tax",
    "total",
  ] as const)
    if (!f[key]) add(`missing-${key}`, `Check missing ${key}.`, key);
  if (f.currency !== "AED")
    add(
      "currency",
      "Only AED draft review is supported; confirm currency.",
      "currency",
    );
  if (f.kind === "unknown")
    add("kind", "Choose a document classification.", "kind");
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
  if (f.kind !== "company-expense" && !f.projectId)
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
    fils(f.subtotal) + fils(f.tax) !== fils(f.total)
  )
    add(
      "totals",
      "Subtotal plus tax does not equal the document total.",
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
      nets += net;
      if (i.total && i.tax && net + fils(i.tax) !== fils(i.total))
        add(
          `line-math-${n}`,
          `Line ${n + 1}: quantity × rate plus tax does not match the line total.`,
          prefix,
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
        `Line ${n + 1}: no confirmed product match.`,
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
        (normalize(b.poReference || "") === normalize(f.reference) ||
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
  const action = draftActionSchema.parse(input);
  const next = structuredClone(previous),
    entries = next.documentEntries ?? emptyEntries();
  const doc = entries.reviews.find((d) => d.id === action.reviewId);
  if (!doc) throw Error("Document review not found.");
  if (doc.revision !== action.revision)
    throw Error("Document draft changed. Refresh and review again.");
  const f = fieldsSchema.parse(action.fields),
    catalog = catalogFor(next);
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
      "Confirm supplier, date, reference, AED total and classification before saving a draft.",
    );
  const category = categories.find((c) => c.id === f.categoryId && c.active),
    scope = f.kind === "company-expense" ? "company" : "project";
  if (!category || !category.allowedScopes.includes(scope))
    throw Error("Choose a category valid for this document scope.");
  const account = next.accounting.accounts.find(
    (a) =>
      a.id === category.expenseAccountId &&
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
  doc.mapping = {
    categoryId: category.id,
    accountId: account.id,
    accountCode: account.code,
  };
  if (action.rememberSupplier) {
    const value = {
      supplier: f.supplier,
      kind: f.kind,
      categoryId: f.categoryId,
      projectId: f.projectId,
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
import { z } from "zod";
export const draftActionSchema = z
  .object({
    kind: z.literal("document-draft"),
    id: z.string().optional(),
    reviewId: z.string(),
    revision: z.number().int().nonnegative(),
    fields: fieldsSchema,
    confirmed: z.literal(true),
    rememberSupplier: z.boolean(),
  })
  .strict();
