import type { Database } from "../domain/model";
import type { Invoice } from "../commercial/model";
import type { CreditNote } from "./model";
import {
  allocateDiscount,
  cents,
  invoiceCreditLines,
  round,
} from "../commercial/calculations";
import { getOperations } from "./migration";

type Pool = {
  itemId: string;
  originalNet: bigint;
  originalVat: bigint;
  originalGross: bigint;
  net: bigint;
  vat: bigint;
  gross: bigint;
};
function review(): never {
  throw Error(
    "Issued credit history requires explicit review before further adjustments.",
  );
}
function integer(value: unknown) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return review();
  return BigInt(value);
}
function recorded(credit: CreditNote) {
  const net = integer(credit.net),
    vat = integer(credit.vat),
    gross = cents(credit.gross);
  if (net + vat !== gross || gross <= 0n) return review();
  return { net, vat, gross };
}
function consume(
  row: Pool | undefined,
  net: bigint,
  vat: bigint,
  gross: bigint,
) {
  if (
    !row ||
    net < 0n ||
    vat < 0n ||
    net + vat !== gross ||
    net > row.net ||
    vat > row.vat
  )
    return review();
  row.net -= net;
  row.vat -= vat;
  row.gross -= gross;
}

/** Historical amount credits have no posted item identity. Project their recorded
 * net/VAT components once, before versioned allocations, without changing them.
 * This ordering keeps the projection stable as new credits are posted. */
export function remainingCreditLines(db: Database, invoice: Invoice): Pool[] {
  const rows = invoiceCreditLines(invoice).map((line) => ({
    itemId: line.itemId,
    originalNet: line.net,
    originalVat: line.vat,
    originalGross: line.grand,
    net: line.net,
    vat: line.vat,
    gross: line.grand,
  }));
  const issued = getOperations(db).credits.filter(
    (c) => c.invoiceId === invoice.id && c.status === "Issued",
  );
  const legacy = issued.filter(
    (c) => c.allocationVersion === undefined && c.lineAllocations === undefined,
  );
  for (const credit of legacy.filter((c) => c.itemId)) {
    const amount = recorded(credit);
    consume(
      rows.find((row) => row.itemId === credit.itemId),
      amount.net,
      amount.vat,
      amount.gross,
    );
  }
  const amountHistory = legacy.filter((c) => !c.itemId).map(recorded);
  const legacyNet = amountHistory.reduce((sum, c) => sum + c.net, 0n),
    legacyVat = amountHistory.reduce((sum, c) => sum + c.vat, 0n);
  if (
    legacyNet > rows.reduce((sum, row) => sum + row.net, 0n) ||
    legacyVat > rows.reduce((sum, row) => sum + row.vat, 0n)
  )
    return review();
  const nets = allocateDiscount(
      rows.map((row) => row.net),
      legacyNet,
    ),
    vats = allocateDiscount(
      rows.map((row) => row.vat),
      legacyVat,
    );
  rows.forEach((row, index) =>
    consume(row, nets[index], vats[index], nets[index] + vats[index]),
  );
  for (const credit of issued.filter((c) => !legacy.includes(c))) {
    const expected = recorded(credit);
    if (
      credit.allocationVersion !== 1 ||
      !Array.isArray(credit.lineAllocations)
    )
      return review();
    let net = 0n,
      vat = 0n,
      gross = 0n;
    const ids = new Set<string>();
    for (const allocation of credit.lineAllocations) {
      if (
        ids.has(allocation.itemId) ||
        (credit.itemId && allocation.itemId !== credit.itemId)
      )
        return review();
      ids.add(allocation.itemId);
      const n = integer(allocation.net),
        v = integer(allocation.vat),
        g = integer(allocation.gross);
      consume(
        rows.find((row) => row.itemId === allocation.itemId),
        n,
        v,
        g,
      );
      net += n;
      vat += v;
      gross += g;
    }
    if (
      net !== expected.net ||
      vat !== expected.vat ||
      gross !== expected.gross
    )
      return review();
  }
  return rows;
}

/** Allocate gross within remaining line capacities, then take the cumulative
 * original line VAT entitlement minus VAT already credited. Component bounds
 * accommodate historical amount credits and reconcile the final fils exactly. */
export function creditAllocation(
  db: Database,
  invoice: Invoice,
  gross: bigint,
  itemId = "",
) {
  const rows = remainingCreditLines(db, invoice).filter(
    (row) => !itemId || row.itemId === itemId,
  );
  // Amount adjustments must leave pending item-specific claims available,
  // regardless of which approved note is issued first.
  const capacities = rows.map((row) => {
    const reserved = itemId
      ? 0n
      : getOperations(db)
          .credits.filter(
            (c) =>
              c.invoiceId === invoice.id &&
              c.itemId === row.itemId &&
              c.status !== "Issued" &&
              c.status !== "Rejected",
          )
          .reduce((sum, c) => sum + cents(c.gross), 0n);
    return reserved < row.gross ? row.gross - reserved : 0n;
  });
  const available = capacities.reduce((sum, value) => sum + value, 0n);
  if (gross <= 0n || gross > available)
    throw Error("Credit exceeds the remaining billed allocation.");
  const shares = allocateDiscount(capacities, gross);
  const allocations = rows
    .map((row, index) => {
      const amount = shares[index];
      const previouslyCreditedGross = row.originalGross - row.gross;
      const previouslyCreditedVat = row.originalVat - row.vat;
      const proposed = row.originalGross
        ? round(
            (previouslyCreditedGross + amount) * row.originalVat,
            row.originalGross,
          ) - previouslyCreditedVat
        : 0n;
      const lower = amount > row.net ? amount - row.net : 0n,
        upper = amount < row.vat ? amount : row.vat;
      const vat =
        proposed < lower ? lower : proposed > upper ? upper : proposed;
      const net = amount - vat;
      return {
        itemId: row.itemId,
        net: net.toString(),
        vat: vat.toString(),
        gross: amount.toString(),
      };
    })
    .filter((line) => BigInt(line.gross) > 0n);
  return {
    net: allocations.reduce((sum, line) => sum + BigInt(line.net), 0n),
    vat: allocations.reduce((sum, line) => sum + BigInt(line.vat), 0n),
    allocations,
  };
}
