import { describe, expect, it } from "vitest";
import { blankInvoice } from "../commercial/repository";
import {
  invoiceHeading,
  invoiceKind,
  recognitionGate,
  reserveInvoiceNumber,
  validateProformaConversion,
  type InvoiceSeriesByKind,
} from "./invoice-types";

const series = (): InvoiceSeriesByKind => ({
  Tax: { prefix: "TAX-", next: 1 },
  Normal: { prefix: "INV-", next: 1 },
  Proforma: { prefix: "PRO-", next: 1 },
});

describe("invoice document contract", () => {
  it("preserves legacy invoices without guessing a tax classification", () => {
    const existing = blankInvoice();
    expect(invoiceKind(existing)).toBe("Legacy");
    expect(invoiceHeading(invoiceKind(existing))).toBe("Invoice");
    expect(recognitionGate("Legacy")).toBe("legacy-unchanged");
  });

  it("keeps headings and accounting gates distinct", () => {
    expect(invoiceHeading("Tax")).toBe("Tax Invoice");
    expect(invoiceHeading("Normal")).toBe("Invoice");
    expect(invoiceHeading("Proforma")).toBe("Proforma Invoice");
    expect(recognitionGate("Proforma")).toBe("prohibited");
    expect(recognitionGate("Tax")).toBe("policy-required");
    expect(recognitionGate("Normal")).toBe("policy-required");
  });

  it("previews separate numbering and skips an existing number without mutation", () => {
    const initial = series();
    const used = new Set(["TAX-00001", "INV-00001"]);
    const tax = reserveInvoiceNumber("Tax", initial, used);
    const normal = reserveInvoiceNumber("Normal", initial, used);
    const proforma = reserveInvoiceNumber("Proforma", initial, used);
    expect(tax.number).toBe("TAX-00002");
    expect(normal.number).toBe("INV-00002");
    expect(proforma.number).toBe("PRO-00001");
    expect(tax.series.Tax.next).toBe(3);
    expect(tax.series.Normal.next).toBe(1);
    expect(initial.Tax.next).toBe(1);
  });

  it("rejects overlapping prefixes and duplicate live conversions", () => {
    const duplicate = series();
    duplicate.Normal.prefix = duplicate.Tax.prefix;
    expect(() => reserveInvoiceNumber("Tax", duplicate, new Set())).toThrow(
      /distinct/,
    );
    const source = {
      id: "p1",
      kind: "Proforma" as const,
      status: "Issued" as const,
    };
    expect(validateProformaConversion(source, "Tax", [source])).toEqual({
      sourceProformaId: "p1",
      kind: "Tax",
    });
    expect(() =>
      validateProformaConversion(source, "Normal", [
        source,
        {
          id: "f1",
          kind: "Tax",
          status: "Issued",
          sourceProformaId: "p1",
        },
      ]),
    ).toThrow(/already/);
    expect(() =>
      validateProformaConversion({ ...source, status: "Draft" }, "Tax", []),
    ).toThrow(/issued/);
  });
});
