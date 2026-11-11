/** Display the commercial invoice number without changing its allocation key. */
export function settlementReference(
  document: { id: string; invoiceReference?: string },
  supplier: boolean,
): string {
  if (!supplier && document.invoiceReference?.trim())
    return document.invoiceReference;
  return document.id;
}

export function SettlementOption({
  document,
  supplier,
  amount,
}: {
  document: { id: string; invoiceReference?: string; party: string };
  supplier: boolean;
  amount: string;
}) {
  return (
    <option value={document.id}>
      {settlementReference(document, supplier)} · {document.party} · {amount}{" "}
      open
    </option>
  );
}
