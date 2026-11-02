import { z } from "zod";

const text = z.string().trim().max(200);
const amount = z
  .string()
  .regex(
    /^(?:\d{1,10}(?:\.\d{1,2})?)?$/,
    "Use a nonnegative amount with up to two decimal places.",
  );
const quantity = z
  .string()
  .regex(
    /^(?:\d{1,8}(?:\.\d{1,4})?)?$/,
    "Use a nonnegative quantity with up to four decimal places.",
  );
export const itemSchema = z
  .object({
    description: text,
    quantity,
    unit: text,
    unitRate: amount,
    discount: amount.optional(),
    tax: amount,
    total: amount,
    productId: text,
  })
  .strict();
export const fieldsSchema = z
  .object({
    supplier: text,
    date: z
      .string()
      .refine(
        (v) =>
          !v ||
          (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
            Number.isFinite(Date.parse(v)) &&
            new Date(v).toISOString().slice(0, 10) === v),
        "Enter a valid date.",
      ),
    dueDate: z
      .string()
      .optional()
      .refine(
        (v) =>
          !v ||
          (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
            Number.isFinite(Date.parse(v)) &&
            new Date(v).toISOString().slice(0, 10) === v),
        "Enter a valid due date.",
      ),
    reference: text,
    purchaseOrderReference: text.optional(),
    currency: z.enum(["AED", "other", "unknown"]),
    items: z.array(itemSchema).max(80),
    subtotal: amount,
    tax: amount,
    total: amount,
    kind: z.enum([
      "supplier-bill",
      "project-expense",
      "company-expense",
      "unknown",
    ]),
    categoryId: text,
    discount: amount.optional(),
    department: z.enum(["", "MEP", "CIVIL", "JOINERY"]).optional(),
    ledgerId: text.optional(),
    projectName: text,
    customerName: text,
    projectId: text,
    customerId: text,
  })
  .strict();
export type EntryFields = z.infer<typeof fieldsSchema>;
export const blankFields = (): EntryFields => ({
  supplier: "",
  date: "",
  dueDate: "",
  reference: "",
  purchaseOrderReference: "",
  currency: "unknown",
  items: [],
  subtotal: "",
  tax: "",
  total: "",
  kind: "unknown",
  categoryId: "",
  projectName: "",
  customerName: "",
  projectId: "",
  customerId: "",
});
export interface EntryWarning {
  code: string;
  message: string;
  field: string;
}
export interface Extraction {
  fields: EntryFields;
  uncertain: string[];
  provider: string;
  mode: "synthetic-replay" | "manual" | "local-pdf-text" | "live";
  inputTokens: number | null;
  outputTokens: number | null;
  requestId?: string;
  ocrPages?: number;
  costUsd: number | null;
  latencyMs: number;
  retries: number;
}
export interface DocumentReview {
  id: string;
  sha256: string;
  attachmentId: string;
  createdAt: string;
  extraction: Extraction;
  fields: EntryFields;
  status: "Review" | "Draft";
  revision: number;
  convertedBillId?: string;
  convertedExpenseId?: string;
  corrections: {
    at: string;
    actor: "demo-accountant";
    before: EntryFields;
    after: EntryFields;
  }[];
  warnings: EntryWarning[];
  mapping?: { categoryId: string; accountId: string; accountCode: string; ledgerId?: string };
}
export interface SupplierDefault {
  supplier: string;
  kind: EntryFields["kind"];
  categoryId: string;
  projectId: string;
  department?: EntryFields["department"];
  ledgerId?: string;
}
export interface DocumentEntryState {
  version: 1;
  reviews: DocumentReview[];
  defaults: SupplierDefault[];
}
export const emptyEntries = (): DocumentEntryState => ({
  version: 1,
  reviews: [],
  defaults: [],
});
export interface ReferenceCatalog {
  suppliers: string[];
  customers: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  products: {
    id: string;
    name: string;
    unit: string;
    supplier: string;
    rate: string;
  }[];
}
export type Upload = { name: string; mime: string; data: string };
