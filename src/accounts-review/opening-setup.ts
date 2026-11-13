import { z } from "zod";
import { parseFils } from "../finance/settlement.js";

const amount = z
  .string()
  .max(30)
  .refine(
    (v) => v === "" || /^\d+(?:\.\d{1,2})?$/.test(v),
    "Enter a nonnegative AED amount or leave it blank.",
  );
const date = z
  .string()
  .refine(
    (v) =>
      v === "" ||
      (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
        Number.isFinite(Date.parse(v + "T00:00:00Z")) &&
        new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v),
    "Enter a valid date or leave it blank.",
  );
export const openingSetupSchema = z
  .object({
    date,
    rows: z
      .array(
        z
          .object({
            id: z.string().min(1).max(100),
            kind: z.enum([
              "bank",
              "cash",
              "petty-cash",
              "customer-invoice",
              "supplier-bill",
              "ledger",
            ]),
            accountOrParty: z.string().max(200),
            reference: z.string().max(200),
            documentDate: date,
            dueDate: date,
            debit: amount,
            credit: amount,
            notes: z.string().max(1000),
          })
          .strict(),
      )
      .max(1000),
    notes: z.string().max(4000),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = new Set<string>();
    value.rows.forEach((row, index) => {
      if (ids.has(row.id))
        context.addIssue({
          code: "custom",
          path: ["rows", index, "id"],
          message: "Each opening row needs a unique ID.",
        });
      ids.add(row.id);
    });
  });
export type OpeningSetupDraft = z.infer<typeof openingSetupSchema>;
export function inspectOpeningSetup(draft: OpeningSetupDraft) {
  let debit = 0n,
    credit = 0n;
  const warnings: string[] = [];
  if (!draft.date)
    warnings.push("Select the opening date before reconciliation.");
  if (!draft.rows.length)
    warnings.push(
      "Enter and reconcile all opening balances. No entries is not confirmation of zero company balances.",
    );
  draft.rows.forEach((row, index) => {
    if (!row.accountOrParty.trim())
      warnings.push(`Line ${index + 1}: identify the account or counterparty.`);
    if (!row.debit && !row.credit)
      warnings.push(`Line ${index + 1}: balance is not yet supplied.`);
    if (
      row.debit &&
      row.credit &&
      parseFils(row.debit) > 0n &&
      parseFils(row.credit) > 0n
    )
      warnings.push(
        `Line ${index + 1}: select one debit or credit side before approval.`,
      );
    if (
      ["customer-invoice", "supplier-bill"].includes(row.kind) &&
      (!row.reference.trim() || !row.documentDate || !row.dueDate)
    )
      warnings.push(
        `Line ${index + 1}: preserve the outstanding document reference, issue date and due date.`,
      );
    debit += row.debit ? parseFils(row.debit) : 0n;
    credit += row.credit ? parseFils(row.credit) : 0n;
  });
  if (debit !== credit)
    warnings.push(
      "Opening trial balance does not reconcile. No balancing amount will be invented.",
    );
  return {
    debitFils: debit.toString(),
    creditFils: credit.toString(),
    differenceFils: (debit - credit).toString(),
    warnings,
  };
}
