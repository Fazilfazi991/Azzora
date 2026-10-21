import type { Database } from "../domain/model";
import { receivablesAgeing, payablesAgeing } from "../finance/document-adapters";
import { getOperations } from "../operations/migration";
import type { LegacyArApView, LegacyOutstandingRow } from "./AccountantWorkspace";

/** Read-only bridge from authoritative CRM documents to the Accountant preview. */
export function legacyArApView(db: Database, asOf: string): LegacyArApView {
  const limitations: string[] = [];
  const receivables: LegacyOutstandingRow[] = [];
  const payables: LegacyOutstandingRow[] = [];
  try {
    const result = receivablesAgeing(db, asOf);
    limitations.push(...result.limitations);
    for (const row of result.rows) {
      const invoice = db.invoices.find((item) => `sales:${item.id}` === row.documentId);
      if (!invoice) throw Error(`Invoice ${row.documentId} is missing.`);
      receivables.push({
        documentId: row.documentId,
        number: invoice.number,
        partyName: db.clients.find((client) => client.id === invoice.customerId)?.name ?? "Unknown customer",
        due: invoice.due,
        bucket: row.bucket,
        outstandingFils: row.outstandingFils.toString(),
      });
    }
  } catch (error) {
    receivables.length = 0;
    limitations.push(`Customer receivables could not be projected: ${String(error)}`);
  }
  try {
    const result = payablesAgeing(db, asOf);
    const operations = getOperations(db);
    limitations.push(...result.limitations);
    for (const row of result.rows) {
      const bill = operations.bills.find((item) => `purchase:${item.id}` === row.documentId);
      if (!bill) throw Error(`Supplier bill ${row.documentId} is missing.`);
      payables.push({
        documentId: row.documentId,
        number: bill.number,
        partyName: operations.suppliers.find((supplier) => supplier.id === bill.supplierId)?.name ?? "Unknown supplier",
        due: bill.due,
        bucket: row.bucket,
        outstandingFils: row.outstandingFils.toString(),
      });
    }
  } catch (error) {
    payables.length = 0;
    limitations.push(`Supplier payables could not be projected: ${String(error)}`);
  }
  return { asOf, receivables, payables, limitations };
}
