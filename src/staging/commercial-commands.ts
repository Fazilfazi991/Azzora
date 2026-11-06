/** Trusted adapters for existing commercial commands; one existing journal engine. */
import { AccessDenied } from "../backend/permissions.js";
import type {
  SharedActor,
  SharedCommand,
  SharedCommandScope,
  SharedCompanyState,
} from "./domain.js";
import { cancelInvoice, reversePayment } from "../commercial/repository.js";
import { cents, invoiceTotals, amountString } from "../commercial/calculations.js";
import * as operations from "../operations/repository.js";
import type {
  Budget,
  CreditNote,
  OperationalSettings,
  Variation,
} from "../operations/model.js";
import { closeCommercial } from "../operations/closure-domain.js";
import { postJournal, reverseJournal } from "../accounting/core.js";
import { reverseSettlement, documentOutstanding } from "../finance/settlement.js";
import { reviewSnapshot } from "../accounts-review/domain.js";
import { today } from "../domain/logic.js";

export class StagingPolicyError extends Error {
  readonly status = 423;
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export const commercialCommandNames = [
  "variation.save",
  "variation.revise",
  "variation.invoice",
  "credit.save",
  "credit.issue",
  "refund.post",
  "refund.reverse",
  "budget.save",
  "settings.save",
  "closure.record",
  "invoice.cancel",
  "payment.reverse",
  "procurement.cancel-order",
  "procurement.reverse-delivery",
  "procurement.cancel-bill",
  "procurement.reverse-payment",
  "approval.reassign",
] as const;
export const isCommercialCommand = (kind: string) =>
  (commercialCommandNames as readonly string[]).includes(kind);
const obj = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Command fields are required.");
  return value as Record<string, unknown>;
};
const text = (v: unknown) => {
  if (typeof v !== "string" || !v.trim() || v.length > 2000)
    throw Error("An identifier or review reason is required.");
  return v.trim();
};
const owner = (a: SharedActor) =>
  a.grant.roles.some((v) => v === "owner" || v === "admin");
const financial = new Set([
  "credit.issue",
  "refund.post",
  "refund.reverse",
  "invoice.cancel",
  "payment.reverse",
  "procurement.cancel-bill",
  "procurement.reverse-payment",
]);
export function commercialCommandScope(
  state: SharedCompanyState,
  command: SharedCommand,
): SharedCommandScope {
  const p = obj(command.payload),
    op = state.manager.operations!;
  const entity = p.variation || p.credit || p.budget;
  const nested = entity ? obj(entity) : {};
  const id = p.id || nested.id;
  const old = [
    ...op.variations,
    ...op.credits,
    ...op.refunds,
    ...op.orders,
    ...op.deliveries,
    ...op.bills,
    ...op.supplierPayments,
    ...op.approvals,
    ...state.manager.invoices,
    ...state.manager.payments,
  ].find((v) => v.id === id);
  const projectId =
    old?.projectId ||
    (typeof nested.projectId === "string"
      ? nested.projectId
      : typeof p.projectId === "string"
        ? p.projectId
        : undefined);
  if (old && nested.projectId && nested.projectId !== old.projectId)
    throw new AccessDenied("Commercial record cannot move between projects.");
  return {
    workspace: "manager",
    projectId,
    financial: financial.has(command.kind),
    capability:
      command.kind === "settings.save" ? "access.manage" : "project.write",
  };
}
export function refreshCommercialView(state: SharedCompanyState) {
  const db = state.manager,
    op = db.operations!;
  state.finance.commercialAdjustments = [
    ...op.credits
      .filter((v) => v.status === "Issued")
      .map((v) => ({
        id: v.id,
        documentId: v.invoiceId,
        side: "receivable" as const,
        date: v.date,
        deltaFils: (-cents(v.gross)).toString(),
        kind: "credit" as const,
      })),
    ...db.invoices
      .filter(
        (v) =>
          v.status === "Cancelled" &&
          v.cancelledAt &&
          state.finance.invoices.some(
            (f) => f.id === v.id && f.status === "Issued",
          ),
      )
      .map((v) => ({
        id: `cancel:${v.id}`,
        documentId: v.id,
        side: "receivable" as const,
        date: v.cancelledAt!.slice(0, 10),
        deltaFils: (-invoiceTotals(v).grand).toString(),
        kind: "cancellation" as const,
      })),
    ...op.bills
      .filter(
        (v) =>
          v.status === "Cancelled" &&
          state.finance.bills.some(
            (f) => f.id === v.id && f.status === "Issued",
          ),
      )
      .map((v) => ({
        id: `cancel:${v.id}`,
        documentId: v.id,
        side: "payable" as const,
        date:
          db.activities
            .find(
              (a) =>
                a.entityId === v.id && a.action === "Supplier bill cancelled",
            )
            ?.timestamp.slice(0, 10) || today(),
        deltaFils: (-BigInt(
          state.finance.bills.find((f) => f.id === v.id)!.amountFils,
        )).toString(),
        kind: "cancellation" as const,
      })),
  ];
}
function reverseSource(state: SharedCompanyState, id: string, reason: string) {
  const original = state.finance.accounting.journals.find(
    (v) => v.source.id === id && !v.reversalOf,
  );
  if (!original)
    throw Error(
      "The original shared journal is unavailable; no correction was posted.",
    );
  state.finance.accounting = reverseJournal(state.finance.accounting, {
    id: `REV-${original.id}`,
    postingKey: `staging:reverse:${original.postingKey}`,
    originalId: original.id,
    date: today(),
    recordedAt: new Date().toISOString(),
    reason,
  }).state;
}
export function applyCommercialCommand(
  state: SharedCompanyState,
  command: SharedCommand,
  actor: SharedActor,
): void {
  const p = obj(command.payload),
    db = state.manager,
    op = db.operations!,
    personId = actor.personId || actor.userId;
  if (
    command.kind === "settings.save" &&
    (!owner(actor) || !actor.grant.capabilities.includes("access.manage"))
  )
    throw new AccessDenied(
      "Only the Owner may change staging company configuration.",
    );
  if (
    financial.has(command.kind) &&
    (!owner(actor) ||
      !actor.grant.capabilities.includes("finance.simulate") ||
      actor.assurance !== "aal2")
  )
    throw new AccessDenied(
      "A privileged Owner must authorize this fictional financial correction.",
    );
  switch (command.kind) {
    case "variation.save":
      operations.saveVariation(
        db,
        obj(p.variation) as unknown as Variation,
        personId,
      );
      break;
    case "variation.revise":
      operations.reviseVariation(db, text(p.id), text(p.reason), personId);
      break;
    case "variation.invoice":
      operations.generateVariationInvoice(db, text(p.id));
      break;
    case "credit.save":
      operations.saveCredit(
        db,
        obj(p.credit) as unknown as CreditNote,
        personId,
      );
      break;
    case "credit.issue": {
      const id = text(p.id),
        credit = op.credits.find((v) => v.id === id);
      if (!credit) throw Error("Credit note not found.");
      refreshCommercialView(state);
      const open = reviewSnapshot(state.finance, today()).invoices.find(
        (v) => v.id === credit.invoiceId,
      )?.outstandingFils;
      if (open === undefined || cents(credit.gross) > BigInt(open))
        throw new StagingPolicyError(
          "customer_credit_policy_pending",
          "Customer advances and refundable credit-balance treatment require approval. Staging credits cannot exceed the unpaid invoice balance.",
        );
      operations.issueCredit(db, id, personId);
      if (BigInt(credit.vat || "0") !== 0n)
        throw new StagingPolicyError(
          "vat_policy_pending",
          "VAT/TRN treatment remains pending; tax-bearing credits cannot be posted.",
        );
      const amount = cents(credit.gross);
      state.finance.accounting = postJournal(state.finance.accounting, {
        id: `SC-CREDIT-${id}`,
        postingKey: `staging:credit:${id}`,
        source: { kind: "Credit Note", id, action: "Issue" },
        date: credit.date,
        recordedAt: new Date().toISOString(),
        memo: `Fictional credit ${credit.number}`,
        currency: "AED",
        lines: [
          {
            accountId: "revenue",
            debitFils: amount.toString(),
            creditFils: "0",
            projectId: credit.projectId,
            partyId: credit.customerId,
          },
          {
            accountId: "receivables",
            debitFils: "0",
            creditFils: amount.toString(),
            projectId: credit.projectId,
            partyId: credit.customerId,
          },
        ],
      }).state;
      break;
    }
    case "refund.post":
    case "refund.reverse":
      throw new StagingPolicyError(
        "customer_credit_policy_pending",
        "Customer advances, refundable credit balances and their ledger treatment require Owner/Accountant approval. Refund posting is blocked in shared staging.",
      );
    case "budget.save":
      operations.saveBudget(db, obj(p.budget) as unknown as Budget, personId);
      break;
    case "settings.save": {
      if (p.settings) {
        const next = obj(p.settings) as unknown as OperationalSettings;
        for (const key of [
          "vatPercentage",
          "tax",
          "fiscalYearStart",
          "retentionPercentage",
          "blockOperationalForFinance",
        ] as const)
          if (JSON.stringify(next[key]) !== JSON.stringify(op.settings[key]))
            throw new StagingPolicyError(
              "financial_policy_pending",
              "VAT, fiscal-year, retention and financial handover policies require separate Owner/Accountant approval.",
            );
        if (next.company.trn !== op.settings.company.trn)
          throw new StagingPolicyError(
            "vat_policy_pending",
            "TRN and tax-document treatment require approval before a change can be enabled.",
          );
        for (const key of Object.keys(
          op.settings.numbering,
        ) as (keyof OperationalSettings["numbering"])[])
          if (next.numbering[key].next < op.settings.numbering[key].next)
            throw Error(
              "Numbering cannot move backwards or reuse issued references.",
            );
        operations.saveSettings(db, next, personId);
      }
      if (p.invoiceNext !== undefined) {
        if (
          !Number.isSafeInteger(p.invoiceNext) ||
          Number(p.invoiceNext) < db.commercialNumbering.invoice
        )
          throw Error("Invoice numbering cannot move backwards.");
        db.commercialNumbering.invoice = Number(p.invoiceNext);
      }
      if (p.quotationNumbering) {
        const n = obj(p.quotationNumbering);
        if (
          typeof n.prefix !== "string" ||
          !n.prefix.trim() ||
          n.prefix.length > 40 ||
          !Number.isSafeInteger(n.next) ||
          Number(n.next) < db.quotationNumbering.next
        )
          throw Error(
            "Check the quotation numbering; sequences cannot move backwards.",
          );
        db.quotationNumbering = { prefix: n.prefix, next: Number(n.next) };
      }
      break;
    }
    case "closure.record":
      closeCommercial(db, text(p.projectId), personId, text(p.notes));
      break;
    case "invoice.cancel": {
      const id = text(p.id),
        reason = text(p.reason),
        issued = db.invoices.find((v) => v.id === id)?.status === "Issued";
      cancelInvoice(db, id, reason);
      if (issued) reverseSource(state, id, reason);
      break;
    }
    case "payment.reverse": {
      const id = text(p.id),
        reason = text(p.reason);
      reversePayment(db, id, reason);
      state.finance.receipts = reverseSettlement(state.finance.receipts, {
        type: "reversed",
        id: `SETTLE-REV-${id}`,
        settlementId: id,
        date: today(),
        reason,
      });
      reverseSource(state, id, reason);
      break;
    }
    case "procurement.cancel-order":
      operations.cancelOrder(db, text(p.id), text(p.reason), personId);
      break;
    case "procurement.reverse-delivery":
      operations.reverseDelivery(db, text(p.id), text(p.reason), personId);
      break;
    case "procurement.cancel-bill": {
      const id = text(p.id),
        reason = text(p.reason);
      operations.cancelBill(db, id, reason, personId);
      reverseSource(state, id, reason);
      break;
    }
    case "procurement.reverse-payment": {
      const id = text(p.id),
        reason = text(p.reason);
      operations.reverseSupplierPayment(db, id, reason, personId);
      state.finance.supplierPayments = reverseSettlement(
        state.finance.supplierPayments,
        {
          type: "reversed",
          id: `SETTLE-REV-${id}`,
          settlementId: id,
          date: today(),
          reason,
        },
      );
      reverseSource(state, id, reason);
      break;
    }
    case "approval.reassign":
      if (!owner(actor))
        throw new AccessDenied(
          "Only Owner can reassign a live staging approval.",
        );
      operations.reassignApproval(
        db,
        text(p.id),
        text(p.approverId),
        text(p.reason),
        personId,
      );
      break;
    default:
      throw Error("Unknown commercial command.");
  }
  refreshCommercialView(state);
  // The existing statement builder reconciles AR/AP controls before the atomic write.
  reviewSnapshot(state.finance, today());
}

/** Same linked-cost projection as native bills; no invented PO/received history. */
export function syncFinanceBillCosts(state: SharedCompanyState) {
  for (const bill of state.finance.bills.filter(
    (v) =>
      v.status === "Issued" &&
      !state.manager.operations!.bills.some((b) => b.id === v.id),
  )) {
    const paid =
      BigInt(bill.amountFils) -
      documentOutstanding(
        {
          id: bill.id,
          side: "payable",
          partyId: bill.party,
          issuedOn: bill.date,
          dueOn: bill.due,
          amountFils: BigInt(bill.amountFils),
        },
        state.finance.supplierPayments,
        today(),
      );
    const old = state.manager.expenses.find(
      (v) => v.supplierBillId === bill.id,
    );
    if (old) {
      old.paidAmount = amountString(paid);
      continue;
    }
    state.manager.expenses.push({
      id: `bill-cost:${bill.id}`,
      reference: bill.invoiceReference || bill.id,
      projectId: bill.projectId || "",
      category:
        bill.category === "Cost of Sales" ? "Materials" : "Miscellaneous",
      supplier: bill.party,
      date: bill.date,
      description: bill.description,
      amount: amountString(BigInt(bill.amountFils)),
      vat: "0",
      paidAmount: amountString(paid),
      method: "Other",
      attachmentReference: bill.attachmentId || "",
      attachments: [],
      createdAt: new Date().toISOString(),
      supplierBillId: bill.id,
    });
  }
}
