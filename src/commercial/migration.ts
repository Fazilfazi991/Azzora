import type { Database } from "../domain/model";
import { initializeOperations } from "../operations/migration";

// Additive and idempotent. No joins by guessed name and no replacement seed data.
export function initializeCommercial(db: Database) {
  initializeOperations(db);
  db.invoices ??= [];
  db.payments ??= [];
  db.expenses ??= [];
  db.contracts ??= [];
  db.commercialNumbering ??= {
    customer: 1,
    invoice: 1,
    receipt: 1,
    expense: 1,
  };
  for (const c of db.clients) {
    if (!c.code) {
      while (
        db.clients.some(
          (x) =>
            x.code ===
            "CUS-" + String(db.commercialNumbering.customer).padStart(4, "0"),
        )
      )
        db.commercialNumbering.customer++;
      c.code =
        "CUS-" + String(db.commercialNumbering.customer++).padStart(4, "0");
    }
    c.type ??= "Company";
    c.status ??= "Active";
    c.country ??= "United Arab Emirates";
    c.contacts ??= [];
    // A missing legacy creation date stays unknown instead of inventing history.
  }
  db.commercialVersion = 1;
}
