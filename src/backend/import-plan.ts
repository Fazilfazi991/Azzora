import { createHash } from "node:crypto";
import { z } from "zod";
import { stableBackupJson } from "../staging/backup.js";

/** Server/offline import-review boundary. Preparing or approving a package never posts or publishes it. */
const id = z.string().min(1).max(200);
const fils = z.string().regex(/^(?:0|[1-9]\d{0,23})$/);
const signedFils = z.string().regex(/^-?(?:0|[1-9]\d{0,23})$/);
const date = z
  .string()
  .refine(
    (v) =>
      /^\d{4}-\d{2}-\d{2}$/.test(v) &&
      Number.isFinite(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    "Use an explicit valid date.",
  );
const rowSchema = z
  .object({
    kind: z.enum([
      "customer",
      "supplier",
      "project",
      "sales-invoice",
      "supplier-bill",
      "bank",
      "cash",
      "petty-cash",
      "opening-balance",
      "historical-quotation",
      "historical-document",
    ]),
    sourceId: id,
    preservedId: id,
    documentNumber: id.optional(),
    partyId: id.optional(),
    projectId: id.optional(),
    accountId: id.optional(),
    date: date.optional(),
    outstandingFils: fils.optional(),
    balanceFils: signedFils.optional(),
    debitFils: fils.optional(),
    creditFils: fils.optional(),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();
const sourceSchema = z
  .object({
    companyId: z.uuid(),
    sourceId: id,
    dataClass: z.enum(["synthetic-rehearsal", "authorized-company-export"]),
    cutoverDate: date,
    originalUtf8: z.string().min(1).max(10_000_000),
    rows: z.array(rowSchema).min(1).max(10000),
  })
  .strict();
export type ImportSource = z.infer<typeof sourceSchema>;
export interface ImportIssue {
  code: string;
  row?: number;
  message: string;
}
export interface ImportReview {
  format: "azzora-import-review-v1";
  companyId: string;
  sourceId: string;
  dataClass: ImportSource["dataClass"];
  cutoverDate: string;
  originalUtf8: string;
  originalSha256: string;
  rows: ImportSource["rows"];
  controls: {
    salesOutstandingFils: string;
    supplierOutstandingFils: string;
    bankFils: string;
    cashFils: string;
    pettyCashFils: string;
    openingDebitsFils: string;
    openingCreditsFils: string;
  };
  counts: Record<string, number>;
  issues: ImportIssue[];
  publication: "quarantined";
  financialPostingAllowed: false;
  sha256: string;
}
const digest = (v: string) => createHash("sha256").update(v).digest("hex");
function jsonData(value: unknown): void {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (Array.isArray(value)) {
    value.forEach(jsonData);
    return;
  }
  if (
    value &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    for (const [key, v] of Object.entries(value)) {
      if (
        /^(?:password|passwordHash|apiKey|serviceKey|secret|access_token|refresh_token|cookie|cookies|csrf|sessionHash|sessionId|totpSecret|authUsers|authSessions|credentials)$/i.test(
          key,
        )
      )
        throw Error("Credentials/identity data are not a business import.");
      jsonData(v);
    }
    return;
  }
  throw Error("Import payload must contain JSON values only.");
}
const packageHash = (v: Omit<ImportReview, "sha256">) =>
  digest(stableBackupJson(v));
export function prepareImportReview(input: unknown): ImportReview {
  const s = sourceSchema.parse(input);
  jsonData(s.rows);
  if (Buffer.byteLength(s.originalUtf8, "utf8") > 10_000_000)
    throw Error("Original export exceeds the 10 MB review limit.");
  let raw: unknown;
  try {
    raw = JSON.parse(s.originalUtf8);
  } catch {
    /* CSV/plain originals are retained verbatim. */
  }
  if (raw !== undefined) jsonData(raw);
  if (
    /(?:^|[,;\t])\s*(?:password|access_token|refresh_token|apiKey|serviceKey|secret)\s*(?:[,;\t]|$)/i.test(
      s.originalUtf8.split(/\r?\n/)[0],
    )
  )
    throw Error("Credential columns are not a business import.");
  const issues: ImportIssue[] = [],
    ids = new Set<string>(),
    sources = new Set<string>(),
    references = new Set<string>(),
    parties = new Set(
      s.rows
        .filter((r) => r.kind === "customer" || r.kind === "supplier")
        .map((r) => r.preservedId),
    ),
    projects = new Set(
      s.rows.filter((r) => r.kind === "project").map((r) => r.preservedId),
    );
  const totals = {
    salesOutstandingFils: 0n,
    supplierOutstandingFils: 0n,
    bankFils: 0n,
    cashFils: 0n,
    pettyCashFils: 0n,
    openingDebitsFils: 0n,
    openingCreditsFils: 0n,
  };
  const counts: Record<string, number> = {};
  s.rows.forEach((r, i) => {
    const row = i + 1,
      add = (code: string, message: string) =>
        issues.push({ code, row, message }),
      key = JSON.stringify([r.kind, r.preservedId]),
      sourceKey = JSON.stringify([r.kind, r.sourceId]);
    counts[r.kind] = (counts[r.kind] || 0) + 1;
    if (ids.has(key))
      add(
        "duplicate-id",
        "Resolve repeated target IDs explicitly; no overwrite is inferred.",
      );
    ids.add(key);
    if (sources.has(sourceKey))
      add(
        "duplicate-source-record",
        "One source record cannot be imported twice.",
      );
    sources.add(sourceKey);
    if (r.partyId && !parties.has(r.partyId))
      add(
        "missing-party",
        "Map the referenced customer/supplier in this reviewed package.",
      );
    if (r.projectId && !projects.has(r.projectId))
      add(
        "missing-project",
        "Map the referenced project in this reviewed package.",
      );
    if (
      ["sales-invoice", "supplier-bill", "historical-quotation"].includes(
        r.kind,
      )
    ) {
      if (!r.documentNumber)
        add(
          "missing-document-number",
          "Preserve the original issued document number.",
        );
      if (r.documentNumber) {
        const ref = JSON.stringify([
          r.kind,
          r.kind === "supplier-bill" ? r.partyId || "" : "",
          r.documentNumber.trim().replace(/\s+/g, " ").toUpperCase(),
        ]);
        if (references.has(ref))
          add(
            "duplicate-document-number",
            "Resolve duplicate issued document numbers before approval.",
          );
        references.add(ref);
      }
    }
    if (r.kind === "sales-invoice" || r.kind === "supplier-bill") {
      if (!r.partyId)
        add(
          "missing-party",
          "Outstanding documents require a reviewed party mapping.",
        );
      if (!r.date)
        add("missing-document-date", "Preserve the historical issue date.");
      if (r.outstandingFils === undefined)
        add(
          "missing-outstanding",
          "Enter the accountant-reconciled outstanding amount in integer fils.",
        );
      else
        totals[
          r.kind === "sales-invoice"
            ? "salesOutstandingFils"
            : "supplierOutstandingFils"
        ] += BigInt(r.outstandingFils);
    }
    if (["bank", "cash", "petty-cash"].includes(r.kind)) {
      if (r.balanceFils === undefined)
        add(
          "missing-balance",
          "Provide the reconciled balance; zero is not assumed.",
        );
      else
        totals[
          r.kind === "bank"
            ? "bankFils"
            : r.kind === "cash"
              ? "cashFils"
              : "pettyCashFils"
        ] += BigInt(r.balanceFils);
      if (!r.accountId)
        add(
          "missing-account",
          "Map the approved accounting account explicitly.",
        );
    }
    if (r.kind === "opening-balance") {
      if (!r.accountId)
        add(
          "missing-account",
          "Map the approved accounting account explicitly.",
        );
      const d = BigInt(r.debitFils || "0"),
        c = BigInt(r.creditFils || "0");
      if (d > 0n === c > 0n)
        add(
          "invalid-opening-line",
          "Each opening line must have exactly one positive debit or credit.",
        );
      totals.openingDebitsFils += d;
      totals.openingCreditsFils += c;
    }
  });
  if (totals.openingDebitsFils !== totals.openingCreditsFils)
    issues.push({
      code: "opening-unbalanced",
      message:
        "Opening debits and credits must reconcile; no balancing journal is invented.",
    });
  const controls = Object.fromEntries(
    Object.entries(totals).map(([k, v]) => [k, v.toString()]),
  ) as ImportReview["controls"];
  const base: Omit<ImportReview, "sha256"> = {
    format: "azzora-import-review-v1",
    companyId: s.companyId,
    sourceId: s.sourceId,
    dataClass: s.dataClass,
    cutoverDate: s.cutoverDate,
    originalUtf8: s.originalUtf8,
    originalSha256: digest(s.originalUtf8),
    rows: structuredClone(s.rows),
    controls,
    counts,
    issues,
    publication: "quarantined",
    financialPostingAllowed: false,
  };
  return { ...base, sha256: packageHash(base) };
}
export function verifyImportReview(input: ImportReview): ImportReview {
  const recalculated = prepareImportReview({
    companyId: input.companyId,
    sourceId: input.sourceId,
    dataClass: input.dataClass,
    cutoverDate: input.cutoverDate,
    originalUtf8: input.originalUtf8,
    rows: input.rows,
  });
  if (stableBackupJson(recalculated) !== stableBackupJson(input))
    throw Error("Import review integrity check failed.");
  return structuredClone(input);
}
export interface ImportApproval {
  role: "owner" | "accountant";
  userId: string;
  companyId: string;
  reviewSha256: string;
  approvedAt: string;
  evidenceReference: string;
  controls: ImportReview["controls"];
}
export interface ApprovedImportReview {
  review: ImportReview;
  approvals: readonly ImportApproval[];
  backup: { companyId: string; manifestSha256: string; verifiedAt: string };
  publication: "quarantined";
  financialPostingAllowed: false;
}
/** Receipts must be resolved from authenticated server-side approval records, never from browser role fields. */
export function approveImportReview(
  review: ImportReview,
  receipts: readonly ImportApproval[],
  backup: ApprovedImportReview["backup"],
): ApprovedImportReview {
  const v = verifyImportReview(review);
  if (v.issues.length)
    throw Error("Resolve every reconciliation issue before approval.");
  if (
    backup.companyId !== v.companyId ||
    !/^[a-f0-9]{64}$/.test(backup.manifestSha256) ||
    !Number.isFinite(Date.parse(backup.verifiedAt))
  )
    throw Error("A verified target-company backup receipt is required.");
  for (const role of ["owner", "accountant"]) {
    const matches = receipts.filter((r) => r.role === role);
    if (matches.length !== 1)
      throw Error("One explicit owner and accountant approval are required.");
    const a = matches[0];
    if (
      !a.userId ||
      a.companyId !== v.companyId ||
      a.reviewSha256 !== v.sha256 ||
      !Number.isFinite(Date.parse(a.approvedAt)) ||
      !a.evidenceReference.trim() ||
      stableBackupJson(a.controls) !== stableBackupJson(v.controls)
    )
      throw Error(
        "Approval must bind exact source, mapping, company and reconciled controls.",
      );
  }
  if (receipts.length !== 2 || receipts[0].userId === receipts[1].userId)
    throw Error("Independent owner/accountant approval is required.");
  return {
    review: v,
    approvals: structuredClone(receipts),
    backup: structuredClone(backup),
    publication: "quarantined",
    financialPostingAllowed: false,
  };
}
export interface ImportQueueTransaction {
  currentOwner(): Promise<{
    userId: string;
    companyId: string;
    assurance: "aal1" | "aal2";
    active: boolean;
    role: string;
    environment: "production" | "synthetic-rehearsal";
  }>;
  version(): Promise<number>;
  receipt(
    key: string,
  ): Promise<{ sha256: string; batchId: string; actorId: string } | null>;
  stage(batchId: string, review: ApprovedImportReview): Promise<void>;
  recordReceipt(
    key: string,
    receipt: { sha256: string; batchId: string; actorId: string },
  ): Promise<void>;
  bumpVersion(): Promise<void>;
}
export interface ImportQueueRepository {
  transaction<T>(
    companyId: string,
    fn: (tx: ImportQueueTransaction) => Promise<T>,
  ): Promise<T>;
}
/** Atomically stages one approved immutable batch. It never inserts active financial records or calls postJournal. */
export async function stageApprovedImport(
  repository: ImportQueueRepository,
  input: {
    batchId: string;
    expectedVersion: number;
    idempotencyKey: string;
    package: ApprovedImportReview;
  },
): Promise<{ batchId: string; replayed: boolean; publication: "quarantined" }> {
  const p = structuredClone(input);
  if (
    !/^[\w-]{1,100}$/.test(p.batchId) ||
    !/^[\w-]{16,128}$/.test(p.idempotencyKey) ||
    !Number.isSafeInteger(p.expectedVersion) ||
    p.expectedVersion < 0
  )
    throw Error(
      "An explicit batch ID, expected version and idempotency key are required.",
    );
  const verified = approveImportReview(
    p.package.review,
    p.package.approvals,
    p.package.backup,
  );
  const fingerprint = digest(stableBackupJson(verified));
  return repository.transaction(verified.review.companyId, async (tx) => {
    const owner = await tx.currentOwner();
    if (
      !owner.active ||
      owner.role !== "owner" ||
      owner.assurance !== "aal2" ||
      owner.companyId !== verified.review.companyId
    )
      throw Error("Current authorized Owner with MFA is required.");
    if (
      owner.environment === "production" &&
      verified.review.dataClass !== "authorized-company-export"
    )
      throw Error("Synthetic data cannot enter a production import queue.");
    const prior = await tx.receipt(p.idempotencyKey);
    if (prior) {
      if (
        prior.sha256 !== fingerprint ||
        prior.batchId !== p.batchId ||
        prior.actorId !== owner.userId
      )
        throw Error("Import idempotency conflict.");
      return {
        batchId: prior.batchId,
        replayed: true,
        publication: "quarantined",
      };
    }
    if ((await tx.version()) !== p.expectedVersion)
      throw Error(
        "Import version conflict; reconcile against the latest target state.",
      );
    await tx.stage(p.batchId, verified);
    await tx.recordReceipt(p.idempotencyKey, {
      sha256: fingerprint,
      batchId: p.batchId,
      actorId: owner.userId,
    });
    await tx.bumpVersion();
    return { batchId: p.batchId, replayed: false, publication: "quarantined" };
  });
}
