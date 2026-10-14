import type { Client, Database } from "../domain/model";
import { uid } from "../domain/logic";
import { initializeCommercial } from "./migration";
import { record } from "../domain/repository";

export const normalizeName = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
const phoneKey = (s = "") =>
  s
    .replace(/\D/g, "")
    .replace(/^00971/, "971")
    .replace(/^0(?=5\d{8}$)/, "971");
export function duplicateCustomers(db: Database, c: Client) {
  return db.clients.filter(
    (x) =>
      x.id !== c.id &&
      (normalizeName(x.name) === normalizeName(c.name) ||
        (!!c.email?.trim() &&
          x.email?.trim().toLowerCase() === c.email.trim().toLowerCase()) ||
        (!!phoneKey(c.phone) && phoneKey(x.phone) === phoneKey(c.phone)) ||
        (!!c.trn?.trim() &&
          x.trn?.replace(/\s/g, "") === c.trn.replace(/\s/g, ""))),
  );
}
export function blankCustomer(): Client {
  return {
    id: uid(),
    name: "",
    contact: "",
    type: "Company",
    status: "Active",
    phone: "",
    whatsapp: "",
    email: "",
    address: "",
    siteAddress: "",
    city: "",
    emirate: "Dubai",
    country: "United Arab Emirates",
    trn: "",
    notes: "",
    contacts: [],
  };
}
export function saveCustomer(
  db: Database,
  customer: Client,
  allowDuplicate = false,
  reason = "",
) {
  initializeCommercial(db);
  const c = structuredClone(customer);
  c.name = c.name.trim();
  if (c.name.length < 2)
    throw Error("Customer name needs at least two characters.");
  if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email))
    throw Error("Enter a valid customer email.");
  if (
    c.contacts?.some(
      (p) =>
        !p.name.trim() ||
        (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)),
    )
  )
    throw Error(
      "Each additional contact needs a name and valid email if supplied.",
    );
  const duplicates = duplicateCustomers(db, c);
  if (duplicates.length && (!allowDuplicate || !reason.trim()))
    throw Error(
      "Possible duplicate customer: " +
        duplicates.map((x) => x.name).join(", ") +
        ". Select the existing record or confirm a separate customer with a reason.",
    );
  const old = db.clients.find((x) => x.id === c.id);
  const previous = old ? JSON.stringify(old) : undefined;
  c.code = old?.code;
  if (!c.code) {
    do {
      c.code =
        "CUS-" + String(db.commercialNumbering.customer++).padStart(4, "0");
    } while (db.clients.some((x) => x.code === c.code));
  }
  c.createdAt = old?.createdAt || new Date().toISOString();
  c.status ??= "Active";
  if (old) Object.assign(old, c);
  else db.clients.push(c);
  record(
    db,
    "",
    "Customer",
    c.id,
    old ? "Customer updated" : "Customer created",
    c.name +
      (duplicates.length ? " · Duplicate warning acknowledged: " + reason : ""),
    previous,
  );
  return c;
}
export function customerSnapshot(c: Client) {
  return {
    name: c.name,
    contact: c.contact,
    address: c.address || "",
    email: c.email || "",
    phone: c.phone || "",
    trn: c.trn || "",
  };
}
