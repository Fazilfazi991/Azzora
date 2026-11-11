/** Server-only approval gate around the existing journal/command engine. No posting implementation lives here. */
import { createHash } from "node:crypto";
import { z } from "zod";
import type { AuthorizedActor, BusinessRole } from "../backend/permissions.js";
import type { OperationalSettings } from "../operations/model.js";

const date = z
  .string()
  .refine(
    (v) =>
      /^\d{4}-\d{2}-\d{2}$/.test(v) &&
      Number.isFinite(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Use a valid ISO date.",
  );
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const text = z.string().trim().min(1).max(300);
const role = z.enum([
  "owner",
  "admin",
  "project_manager",
  "accountant",
  "site_staff",
]);
/** These are configurable choices, not an inferred AZZORA accounting policy. Null means deferred. */
export const productionPolicySchema = z
  .object({
    version: z.literal(1),
    companyId: text,
    revision: z.number().int().positive(),
    effectiveFrom: date,
    companySettingsDigest: hash,
    chartDigest: hash,
    tax: z
      .object({
        registration: z.enum(["not-registered", "registered"]),
        trn: z.string().max(100),
        taxInvoice: z.enum(["disabled", "approved-registered"]),
        normalInvoice: z.literal("non-tax"),
        proforma: z.literal("non-posting"),
        ratesBasisPoints: z.array(z.number().int().min(0).max(10000)).min(1),
      })
      .strict()
      .nullable(),
    revenueRecognition: z
      .enum(["on-invoice-issue", "on-cash-receipt", "certified-milestone"])
      .nullable(),
    expenseAuthority: z
      .object({
        requireIndependentApproval: z.literal(true),
        approverRoles: z.array(role).min(1),
        postingRoles: z.array(role).min(1),
        maximumSinglePostingFils: z.string().regex(/^[1-9]\d*$/),
      })
      .strict()
      .nullable(),
    customerAdvances: z
      .enum(["blocked-until-supported", "liability-until-earned"])
      .nullable(),
    projectCosts: z
      .enum(["explicit-project-or-company", "custom-overhead-allocation"])
      .nullable(),
    openingBalances: z
      .object({
        asOf: date,
        reconciliationDigest: hash,
        approvedImportDigest: hash,
      })
      .strict()
      .nullable(),
    cutover: z
      .object({
        date,
        planDigest: hash,
        backupReceiptDigest: hash,
        restoreReceiptDigest: hash,
      })
      .strict()
      .nullable(),
  })
  .strict();
export type ProductionAccountingPolicy = z.infer<typeof productionPolicySchema>;
export interface PolicyApproval {
  companyId: string;
  revision: number;
  policyDigest: string;
  recordedAt: string;
  purpose: "accounting-policy" | "real-posting-activation";
  /** A trusted persisted approval receipt with the server-resolved identity snapshot, never browser input. */
  actor: AuthorizedActor;
  capacity: "owner" | "accountant";
}
export interface ProductionPostingContext {
  now: string;
  actor: AuthorizedActor;
  companyId: string;
  companySettingsDigest: string;
  chartDigest: string;
  approvals: readonly PolicyApproval[];
  /** Established by backend validation of the independently approved production RPC/storage contract. */
  runtimeContractVerified: boolean;
  projectId?: string;
  amountFils?: string;
  operation?: "post" | "approve-expense";
}
export interface ProductionPolicyIssue {
  field: string;
  code: string;
  message: string;
}
export class ProductionPolicyError extends Error {
  readonly status = 423;
  readonly code = "production_policy_blocked";
  constructor(public readonly issues: ProductionPolicyIssue[]) {
    super(
      issues[0]?.message || "Production financial posting is not approved.",
    );
  }
}
const ordered = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(ordered)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.entries(v)
            .filter(([, x]) => x !== undefined)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, x]) => [k, ordered(x)]),
        )
      : v;
export const productionPolicyDigest = (value: unknown): string =>
  createHash("sha256")
    .update(JSON.stringify(ordered(value)))
    .digest("hex");
/** Routine counter increments do not change approved prefixes, company details or tax settings. */
export function productionCompanySettingsDigest(
  settings: OperationalSettings | undefined,
): string {
  if (!settings) return productionPolicyDigest(null);
  const { numbering, ...configuration } = settings;
  return productionPolicyDigest({
    ...configuration,
    numbering: Object.fromEntries(
      Object.entries(numbering).map(([k, v]) => [k, { prefix: v.prefix }]),
    ),
  });
}
function approver(
  record: PolicyApproval,
  policy: ProductionAccountingPolicy,
  digest: string,
  now: string,
): boolean {
  const a = record.actor,
    g = a.grant;
  return (
    record.companyId === policy.companyId &&
    record.revision === policy.revision &&
    record.policyDigest === digest &&
    Number.isFinite(Date.parse(record.recordedAt)) &&
    new Date(record.recordedAt).toISOString() === record.recordedAt &&
    record.recordedAt <= now &&
    g.active &&
    g.userId === a.userId &&
    g.companyId === policy.companyId &&
    a.companyId === policy.companyId &&
    a.assurance === "aal2" &&
    !a.authenticationPolicy?.includes("client-review") &&
    (record.capacity === "owner"
      ? g.roles.some((r) => r === "owner" || r === "admin") &&
        g.capabilities.includes("access.manage")
      : g.roles.includes("accountant") &&
        g.capabilities.includes("finance.read"))
  );
}
/** Approval records must come from an ACL-protected server store; SHA256 binds content, it is not an identity signature. */
export function assessProductionPolicy(
  input: unknown,
  context: ProductionPostingContext,
): ProductionPolicyIssue[] {
  const parsed = productionPolicySchema.safeParse(input),
    issues: ProductionPolicyIssue[] = [];
  const add = (field: string, code: string, message: string) =>
    issues.push({ field, code, message });
  if (!parsed.success)
    return parsed.error.issues.map((i) => ({
      field: i.path.join("."),
      code: "policy-shape",
      message: i.message,
    }));
  const p = parsed.data,
    now = context.now;
  if (
    !/^\d{4}-\d{2}-\d{2}T/.test(now) ||
    !Number.isFinite(Date.parse(now)) ||
    new Date(now).toISOString() !== now
  ) {
    add(
      "now",
      "clock-invalid",
      "A trusted canonical server timestamp is required.",
    );
    return issues;
  }
  const a = context.actor,
    g = a.grant;
  if (
    p.companyId !== context.companyId ||
    a.companyId !== context.companyId ||
    g.companyId !== context.companyId ||
    g.userId !== a.userId ||
    !g.active
  )
    add(
      "companyId",
      "company-denied",
      "An active same-company authenticated identity is required.",
    );
  const approval = context.operation === "approve-expense";
  if (
    a.assurance !== "aal2" ||
    a.authenticationPolicy?.includes("client-review") ||
    !g.capabilities.includes(approval ? "expense.approve" : "finance.post") ||
    !g.workspaces.includes(approval ? "manager" : "accountant")
  )
    add(
      "actor",
      "posting-authority",
      approval
        ? "Production expense approval requires MFA and an explicit expense.approve grant."
        : "Real posting requires privileged MFA and an explicit production finance.post grant.",
    );
  if (!context.runtimeContractVerified)
    add(
      "runtime",
      "runtime-unverified",
      "The approved production database, atomic command and private-storage contract must be verified before real posting.",
    );
  if (p.effectiveFrom > now.slice(0, 10))
    add(
      "effectiveFrom",
      "not-effective",
      "The accounting policy is not effective yet.",
    );
  if (p.companySettingsDigest !== context.companySettingsDigest)
    add(
      "companySettingsDigest",
      "settings-changed",
      "Company settings differ from the approved policy; obtain approval for this exact configuration.",
    );
  if (p.chartDigest !== context.chartDigest)
    add(
      "chartDigest",
      "chart-changed",
      "The Chart of Accounts differs from the approved configuration.",
    );
  const topics = [
    "tax",
    "revenueRecognition",
    "expenseAuthority",
    "customerAdvances",
    "projectCosts",
    "openingBalances",
    "cutover",
  ] as const;
  for (const topic of topics)
    if (p[topic] === null)
      add(
        topic,
        "decision-deferred",
        `${topic} requires an explicit owner/accountant decision.`,
      );
  if (p.tax) {
    if (
      p.tax.registration === "not-registered" &&
      (p.tax.trn ||
        p.tax.taxInvoice !== "disabled" ||
        p.tax.ratesBasisPoints.some((r) => r !== 0))
    )
      add(
        "tax",
        "tax-inconsistent",
        "A nonregistered policy must not claim a TRN, tax invoice authorization or nonzero VAT.",
      );
    if (p.tax.registration === "registered" && !p.tax.trn.trim())
      add(
        "tax.trn",
        "trn-missing",
        "The registered company's approved TRN is required.",
      );
    if (
      p.tax.taxInvoice !== "disabled" ||
      p.tax.ratesBasisPoints.some((r) => r !== 0)
    )
      add(
        "tax",
        "tax-engine-pending",
        "Tax-bearing/legal Tax Invoice execution needs the accountant-approved implementation and acceptance tests; this gate does not enable it.",
      );
  }
  if (p.revenueRecognition && p.revenueRecognition !== "on-invoice-issue")
    add(
      "revenueRecognition",
      "recognition-unsupported",
      "This recognition method needs an approved implementation; existing invoice-issue posting must not substitute for it.",
    );
  if (p.customerAdvances === "liability-until-earned")
    add(
      "customerAdvances",
      "advances-unsupported",
      "Advance-liability recognition/refund rules require implementation and acceptance before activation.",
    );
  if (p.projectCosts === "custom-overhead-allocation")
    add(
      "projectCosts",
      "allocation-unsupported",
      "A custom overhead allocation rule cannot be inferred from direct project-cost posting.",
    );
  if (p.openingBalances && p.cutover && p.openingBalances.asOf > p.cutover.date)
    add(
      "openingBalances.asOf",
      "opening-after-cutover",
      "Opening reconciliation must not follow the cutover date.",
    );
  if (p.cutover && p.cutover.date > now.slice(0, 10))
    add(
      "cutover.date",
      "cutover-not-effective",
      "The approved cutover date has not arrived.",
    );
  const digest = productionPolicyDigest(p);
  for (const purpose of [
    "accounting-policy",
    "real-posting-activation",
  ] as const) {
    const records = context.approvals.filter(
        (r) => r.purpose === purpose && approver(r, p, digest, now),
      ),
      owner = records.find((r) => r.capacity === "owner"),
      accountant = records.find((r) => r.capacity === "accountant");
    if (!owner || !accountant || owner.actor.userId === accountant.actor.userId)
      add(
        "approvals",
        purpose === "accounting-policy"
          ? "policy-approval-missing"
          : "activation-approval-missing",
        `Independent verified Owner and Accountant ${purpose} receipts for this exact revision are required.`,
      );
  }
  if (p.expenseAuthority) {
    if (
      !g.roles.some((r) =>
        (approval
          ? p.expenseAuthority!.approverRoles
          : p.expenseAuthority!.postingRoles
        ).includes(r as BusinessRole),
      )
    )
      add(
        "actor.roles",
        "role-not-approved",
        "This user's role is not in the approved financial posting matrix.",
      );
    if (
      context.amountFils &&
      (!/^(0|[1-9]\d*)$/.test(context.amountFils) ||
        BigInt(context.amountFils) >
          BigInt(p.expenseAuthority.maximumSinglePostingFils))
    )
      add(
        "amountFils",
        "limit-exceeded",
        "The posting exceeds the approved role/transaction limit or has an invalid amount.",
      );
  }
  if (
    context.projectId &&
    !g.projectIds.includes(context.projectId) &&
    !g.roles.some((r) => r === "owner" || r === "admin")
  )
    add(
      "projectId",
      "project-denied",
      "The financial transaction is outside this user's assigned projects.",
    );
  return issues;
}
export function assertProductionPostingAllowed(
  policy: unknown,
  context: ProductionPostingContext,
): void {
  const issues = assessProductionPolicy(policy, context);
  if (issues.length) throw new ProductionPolicyError(issues);
}
