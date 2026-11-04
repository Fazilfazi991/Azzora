import { createHash } from "node:crypto";
import { decodeSavedData } from "../domain/repository";
import { parseFils } from "../finance/settlement";

/** Server/offline only. This module never reads localStorage or writes a database. */
const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const escapePointer = (value: string) => value.replaceAll("~", "~0").replaceAll("/", "~1");

export interface MigrationRecord {
  /** Collection path plus source ID; never assumes IDs are globally unique. */
  key: string;
  path: string;
  id: string;
  hash: string;
}
export interface MigrationArchive {
  format: "azzora-browser-archive-v1";
  sourceId: string;
  companyId: string;
  browserKey: "azzora-demo-v1";
  originalUtf8: string;
  originalSha256: string;
  originalUtf8Bytes: number;
  collections: Record<string, number>;
  records: MigrationRecord[];
  /** Financial source totals, not journals or opening balances. */
  controls: Record<string, string>;
  issues: { code: string; path: string }[];
  readyForCanonicalMapping: boolean;
  financialPostingAllowed: false;
  rollback: { strategy: "retain-original-and-discard-staging-batch"; sourceSha256: string };
}

/** Retains malformed originals too; rejected records never become an automatic reset. */
export function prepareMigrationRehearsal(
  originalUtf8: string,
  identity: { sourceId: string; companyId: string },
): MigrationArchive {
  if (!/^[\w-]{1,100}$/.test(identity.sourceId) || !/^[\w-]{1,100}$/.test(identity.companyId))
    throw Error("Provide explicit stable source and company identifiers.");
  const digest = sha256(originalUtf8);
  const archive: MigrationArchive = {
    format: "azzora-browser-archive-v1", ...identity, browserKey: "azzora-demo-v1",
    originalUtf8, originalSha256: digest,
    originalUtf8Bytes: Buffer.byteLength(originalUtf8, "utf8"),
    collections: {}, records: [], controls: {}, issues: [],
    readyForCanonicalMapping: false, financialPostingAllowed: false,
    rollback: { strategy: "retain-original-and-discard-staging-batch", sourceSha256: digest },
  };
  let original: unknown;
  try { original = JSON.parse(originalUtf8); }
  catch { archive.issues.push({ code: "malformed-json", path: "/" }); return archive; }
  if (!isObject(original)) {
    archive.issues.push({ code: "invalid-root", path: "/" }); return archive;
  }
  // Traversal includes unknown additive fields and nested history arrays. The raw
  // export remains the authority; no allowlist silently drops future records.
  function walk(value: unknown, path: string) {
    if (Array.isArray(value)) {
      archive.collections[path] = value.length;
      const ids = new Set<string>();
      const refs = new Map<string, string>();
      value.forEach((item: unknown, index: number) => {
        if (isObject(item) && typeof item.id === "string") {
          if (ids.has(item.id)) archive.issues.push({ code: "duplicate-id", path });
          ids.add(item.id);
          archive.records.push({
            key: JSON.stringify([identity.companyId, identity.sourceId, path, item.id]),
            path, id: item.id, hash: sha256(JSON.stringify(item)),
          });
          // BOQ row/child display numbering is intentionally repeated. Only
          // canonical document registers carry unique business references.
          const uniqueRegister = /^\/(quotations|invoices|payments|operations\/(orders|bills|credits|refunds|supplierPayments))$/.test(path);
          const reference = uniqueRegister && typeof item.number === "string" ? item.number.trim().toLowerCase() : "";
          if (reference) {
            if (refs.has(reference) && refs.get(reference) !== item.id)
              archive.issues.push({ code: "conflicting-reference", path });
            refs.set(reference, item.id);
          }
        }
        walk(item, `${path}/${index}`);
      });
    } else if (isObject(value)) {
      for (const [key, child] of Object.entries(value)) walk(child, `${path}/${escapePointer(key)}`);
    }
  }
  walk(original, "");
  // Existing decoder validates relationship, issued snapshots and additive
  // compatibility on a separate parse. It cannot mutate the archived bytes.
  try { decodeSavedData(originalUtf8); }
  catch { archive.issues.push({ code: "schema-or-relationship-invalid", path: "/" }); }
  if (original.finance !== undefined || original.financeFixture !== undefined)
    archive.issues.push({ code: "synthetic-journal-quarantined", path: "/finance" });

  function total(name: string, values: unknown[], decimal: boolean) {
    try {
      archive.controls[name] = values.reduce<bigint>((sum, value) => {
        if (typeof value !== "string" || (!decimal && !/^\d+$/.test(value))) throw Error();
        return sum + (decimal ? parseFils(value) : BigInt(value));
      }, 0n).toString();
    } catch { archive.issues.push({ code: "invalid-financial-control", path: name }); }
  }
  const rows = (value: unknown) => Array.isArray(value) ? value.filter(isObject) : [];
  const active = (value: unknown) => rows(value).filter((row) => !row.reversedAt && !row.cancelledAt);
  total("issuedInvoiceGrossFils", rows(original.invoices).filter((row) => row.status === "Issued")
    .map((row) => isObject(row.snapshot) ? row.snapshot.grand : undefined), false);
  total("activeCustomerReceiptsFils", active(original.payments).map((row) => row.amount), true);
  const ops = isObject(original.operations) ? original.operations : {};
  total("issuedSupplierBillGrossFils", rows(ops.bills).filter((row) => row.status === "Issued").map((row) => row.gross), false);
  total("activeSupplierPaymentsFils", active(ops.supplierPayments).map((row) => row.amount), true);
  archive.readyForCanonicalMapping = archive.issues.length === 0;
  return archive;
}

/** Verify a staging archive before/after transport, including raw immutable history. */
export function verifyMigrationArchive(archive: MigrationArchive): boolean {
  const expected = prepareMigrationRehearsal(archive.originalUtf8, archive);
  return JSON.stringify(expected) === JSON.stringify(archive);
}

/** Cross-browser collisions require reviewed mapping; never merge by display name. */
export function findMigrationConflicts(archives: MigrationArchive[]): { code: string; path: string }[] {
  const issues: { code: string; path: string }[] = [];
  const sources = new Set<string>();
  const records = new Map<string, { hash: string; sourceId: string }>();
  for (const archive of archives) {
    if (!verifyMigrationArchive(archive)) throw Error("Archive integrity check failed.");
    const source = JSON.stringify([archive.companyId, archive.sourceId]);
    if (sources.has(source)) issues.push({ code: "duplicate-source", path: archive.sourceId });
    sources.add(source);
    for (const record of archive.records) {
      const key = JSON.stringify([archive.companyId, record.path, record.id]);
      const prior = records.get(key);
      if (prior && prior.sourceId !== archive.sourceId)
        issues.push({ code: prior.hash === record.hash ? "repeated-record" : "conflicting-record", path: record.path });
      records.set(key, { hash: record.hash, sourceId: archive.sourceId });
    }
  }
  return issues;
}
