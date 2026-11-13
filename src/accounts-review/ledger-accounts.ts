import { z } from "zod";
import { addAccount } from "../accounting/core.js";
import type { AccountType } from "../accounting/model.js";
import type { ReviewState } from "./domain.js";
import { ledgerNameKey } from "./expense-ledgers.js";

export const ledgerAccountTypes = [
  "Asset",
  "Liability",
  "Equity",
  "Income",
  "Cost of Sales",
  "Expense",
] as const satisfies readonly AccountType[];
const inputSchema = z
  .object({
    kind: z.literal("create-ledger-account"),
    id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/),
    code: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(
        /^[A-Za-z0-9][A-Za-z0-9._:-]*$/,
        "Use a readable unique account code.",
      ),
    name: z
      .string()
      .trim()
      .min(2)
      .max(100)
      .refine(
        (v) =>
          /[\p{L}\p{N}]/u.test(v) &&
          !/[<>]/u.test(v) &&
          [...v].every(
            (char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127,
          ),
        "Use a readable account name.",
      ),
    type: z.enum(ledgerAccountTypes),
    postable: z.boolean(),
  })
  .strict();
export type CreateLedgerAccount = z.infer<typeof inputSchema>;
/** Add a structural chart entry only. Never seed a balance, period or journal. */
export function createLedgerAccount(
  previous: ReviewState,
  input: CreateLedgerAccount,
): ReviewState {
  const value = inputSchema.parse(input);
  if (previous.accounting.accounts.length >= 1000)
    throw Error("The chart already contains 1,000 accounts.");
  if (
    previous.accounting.accounts.some(
      (account) => ledgerNameKey(account.code) === ledgerNameKey(value.code),
    )
  )
    throw Error("An account with this code already exists.");
  if (
    previous.accounting.accounts.some(
      (account) => ledgerNameKey(account.name) === ledgerNameKey(value.name),
    )
  )
    throw Error("An account with this name already exists.");
  return {
    ...structuredClone(previous),
    accounting: addAccount(previous.accounting, {
      id: value.id,
      code: value.code,
      name: value.name,
      type: value.type,
      postable: value.postable,
      status: "Active",
    }),
  };
}
