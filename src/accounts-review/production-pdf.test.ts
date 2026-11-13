// Fictional fixtures only; PDF rendering never posts or changes invoice history.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createEmptyProductionFinance } from "../finance/production-policy";
import { createReviewState, applyReviewAction } from "./domain";
import { calculateItemLines } from "./item-lines";
import { reviewPdf, type ReviewPdfContext } from "./pdf";

const context: ReviewPdfContext = {
  mode: "production-live",
  companyName: "Azzora",
  openingBalancesPending: true,
};
const selection = { from: "2026-11-01", to: "2026-11-30", asOf: "2026-11-30" };
function fixture(count = 1, discountFils = "0", issue = true) {
  const seed = createReviewState();
  const empty = createEmptyProductionFinance({
    accounts: seed.accounting.accounts,
    periods: seed.accounting.periods,
  });
  const calculated = calculateItemLines(
    Array.from({ length: count }, (_, i) => ({
      description:
        `FICTIONAL QA item ${String(i + 1).padStart(2, "0")}` +
        (count > 1
          ? " - Detailed installation work with protected surfaces, careful measurement, sample materials and final site cleanup. ".repeat(
              2,
            )
          : ""),
      quantity: "2",
      unit: "Nos",
      rate: "125.50",
    })),
  );
  const total = BigInt(calculated.subtotalFils) - BigInt(discountFils);
  const state = applyReviewAction(empty, {
    kind: "invoice",
    issue,
    id: "QA-NORMAL-ONLY",
    party: "FICTIONAL QA CUSTOMER - NOT A REAL TRANSACTION",
    date: "2026-11-15",
    due: "2026-11-30",
    description: "Fictional PDF verification",
    invoiceType: "Normal Invoice",
    amount: `${total / 100n}.${(total % 100n).toString().padStart(2, "0")}`,
  });
  const invoice = state.invoices[0];
  Object.assign(invoice, {
    invoiceReference: "QA-NORMAL-ONLY",
    subtotalFils: calculated.subtotalFils,
    taxFils: "0",
    items: calculated.items,
    ...(discountFils !== "0" ? { discountFils } : {}),
  });
  return { state, invoice };
}
const text = (bytes: ArrayBuffer) => new TextDecoder().decode(bytes);
function evidence(name: string, bytes: ArrayBuffer) {
  const dir = process.env.AZZORA_PDF_REVIEW_EVIDENCE_DIR;
  if (dir) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, name), Buffer.from(bytes));
  }
}

describe("approved issued Normal invoice PDF context", () => {
  it("prints stored subtotal, approved discount and total without recomputing or mutating them", () => {
    const { state, invoice } = fixture(1, "500");
    const before = structuredClone(state),
      output = text(reviewPdf(state, invoice.id, selection, context));
    expect(output).toContain("Approved discount");
    for (const amount of ["251.00", "5.00", "246.00"])
      expect(output).toContain(amount);
    expect(state).toEqual(before);
  });
  it("exports exact no-VAT stored values with company identity without draft or demo labels", () => {
    const { state } = fixture(),
      before = structuredClone(state),
      bytes = reviewPdf(state, "QA-NORMAL-ONLY", selection, context),
      output = text(bytes);
    for (const expected of [
      "Azzora",
      "NORMAL INVOICE - NO VAT CHARGED - NOT A TAX INVOICE",
      "QA-NORMAL-ONLY",
      "2026-11-15",
      "FICTIONAL QA item 01",
      "251.00",
      "Issued",
      "VAT \\(not charged\\)",
    ])
      expect(output).toContain(expected);
    for (const forbidden of [
      "DRAFT / SETUP",
      "FICTIONAL CLIENT REVIEW",
      "Synthetic demonstration",
      "VAT - policy pending",
      "Not applied in this fictional review",
      "TRN",
    ])
      expect(output).not.toContain(forbidden);
    expect(state).toEqual(before);
    expect((output.match(/\/Type \/Page\b/g) || []).length).toBe(1);
    evidence("normal-short-fictional-qa.pdf", bytes);
  });
  it("preserves every multi-page item and total with repeated headers and numbered pages", () => {
    const { state, invoice } = fixture(30),
      before = structuredClone(state),
      bytes = reviewPdf(state, invoice.id, selection, context),
      output = text(bytes),
      pages = (output.match(/\/Type \/Page\b/g) || []).length;
    expect(pages).toBeGreaterThan(1);
    for (let i = 1; i <= 30; i++)
      expect(output).toContain(
        `FICTIONAL QA item ${String(i).padStart(2, "0")}`,
      );
    expect(output).toContain("7,530.00");
    expect(
      (
        output.match(/NORMAL INVOICE - NO VAT CHARGED - NOT A TAX INVOICE/g) ||
        []
      ).length,
    ).toBe(pages);
    expect((output.match(/\(Description\)/g) || []).length).toBeGreaterThan(1);
    for (let i = 1; i <= pages; i++)
      expect(output).toContain(`Page ${i} of ${pages}`);
    expect(state).toEqual(before);
    evidence("normal-multipage-fictional-qa.pdf", bytes);
  });
  it.each(["pnl", "balance"])(
    "marks %s provisional while opening balances remain pending",
    (name) => {
      const { state } = fixture(),
        output = text(reviewPdf(state, name, selection, context));
      expect(output).toContain("PROVISIONAL - OPENING BALANCES PENDING");
      expect(output).toContain(
        "Provisional report - opening balances pending verification.",
      );
      expect(output).not.toContain("DRAFT / SETUP");
      if (name === "balance")
        evidence(
          "balance-provisional-fictional-qa.pdf",
          reviewPdf(state, name, selection, context),
        );
    },
  );
  it("keeps production drafts clearly marked and fictional export behavior unchanged", () => {
    const { state, invoice } = fixture(1, "0", false);
    const draft = text(
      reviewPdf(state, invoice.id, undefined, "production-setup"),
    );
    expect(draft).toContain("DRAFT / SETUP REVIEW ONLY");
    expect(draft).toContain("Normal Invoice - draft");
    expect(text(reviewPdf(state, invoice.id))).toContain(
      "FICTIONAL CLIENT REVIEW",
    );
    expect(() => reviewPdf(state, invoice.id, selection, context)).toThrow(
      /issued no-VAT Normal/,
    );
  });
  it.each([
    { invoiceType: "Tax Invoice" },
    { invoiceType: "Proforma" },
    { date: "2026-11-14" },
    { date: "not-a-date" },
    { taxFils: "100" },
  ])(
    "never presents unapproved documents as live Normal invoices %j",
    (change) => {
      const { state, invoice } = fixture();
      Object.assign(invoice, change);
      expect(() => reviewPdf(state, invoice.id, selection, context)).toThrow(
        /issued no-VAT Normal/,
      );
    },
  );
  it("does not turn supplier bills or settlement vouchers into live invoice exports", () => {
    const { state, invoice } = fixture();
    state.bills.push({ ...invoice, id: "QA-BILL" });
    for (const name of ["QA-BILL", "receipt:QA-RECEIPT", "payment:QA-PAYMENT"])
      expect(() => reviewPdf(state, name, selection, context)).toThrow(
        /issued no-VAT Normal/,
      );
  });
});
