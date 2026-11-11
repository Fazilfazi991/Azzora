import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SettlementOption, settlementReference } from "./settlement-reference";

describe("settlement document references", () => {
  const invoice = {
    id: "0b160132-1111-4111-8111-111111111111",
    invoiceReference: "INV-00017",
    party: "Fictional customer",
  };
  it("shows the Manager invoice number while retaining its immutable ID as the allocation value", () => {
    const html = renderToStaticMarkup(
      <select>
        <SettlementOption
          document={invoice}
          supplier={false}
          amount="AED 100.00"
        />
      </select>,
    );
    expect(html).toContain(`value="${invoice.id}"`);
    expect(html).toContain("INV-00017 · Fictional customer · AED 100.00 open");
    expect(settlementReference(invoice, false)).toBe("INV-00017");
  });
  it("keeps legacy invoices and supplier bills identified consistently with their lists", () => {
    expect(
      settlementReference({ id: "LEGACY", invoiceReference: "  " }, false),
    ).toBe("LEGACY");
    expect(
      settlementReference(
        { id: "BILL-42", invoiceReference: "SUPPLIER-9" },
        true,
      ),
    ).toBe("BILL-42");
    const bill = renderToStaticMarkup(
      <select>
        <SettlementOption
          document={{
            id: "BILL-42",
            invoiceReference: "SUPPLIER-9",
            party: "Supplier",
          }}
          supplier
          amount="AED 60.00"
        />
      </select>,
    );
    expect(bill).toContain('value="BILL-42"');
    expect(bill).toContain("BILL-42 · Supplier · AED 60.00 open");
  });
});
