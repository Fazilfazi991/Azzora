import { createHash } from "node:crypto";
import { stableBackupJson } from "../staging/backup.js";
import { verifyImportReview, type ImportReview } from "./import-plan.js";

/** Offline-only original verification. This never publishes or modifies a review. */
export type ImportOriginal = {
  documentId: string;
  originalName: string;
  bytes: Uint8Array;
};
type OriginalIssue = {
  documentId: string;
  code:
    | "missing-metadata"
    | "missing-original"
    | "duplicate-original"
    | "unexpected-original"
    | "name-mismatch"
    | "hash-mismatch"
    | "invalid-original";
};
export type OriginalVerification = {
  reviewSha256: string;
  status: "verified" | "blocked" | "not-required";
  documentCount: number;
  verifiedCount: number;
  originals: Array<{
    documentId: string;
    originalName: string;
    sha256: string;
    byteLength: number;
  }>;
  issues: OriginalIssue[];
  manifestSha256: string | null;
  publication: "quarantined";
  financialPostingAllowed: false;
};
const digest = (v: Uint8Array | string) =>
  createHash("sha256").update(v).digest("hex");

/** Callers supply actual bytes; names and hashes alone are never treated as proof. */
export function verifyImportOriginals(
  review: ImportReview,
  supplied: readonly ImportOriginal[],
): OriginalVerification {
  const checked = verifyImportReview(review);
  if (!Array.isArray(supplied) || supplied.length > 10000)
    throw Error("Supply at most 10,000 explicit original files.");
  const docs = checked.rows.filter((r) => r.kind === "historical-document");
  const expected = new Map<string, (typeof docs)[number]>();
  const issues: OriginalIssue[] = [];
  for (const doc of docs) {
    if (expected.has(doc.preservedId))
      issues.push({ documentId: doc.preservedId, code: "duplicate-original" });
    expected.set(doc.preservedId, doc);
  }
  const originals: OriginalVerification["originals"] = [];
  const seen = new Set<string>();
  for (const file of supplied) {
    if (
      !file ||
      typeof file.documentId !== "string" ||
      typeof file.originalName !== "string" ||
      !(file.bytes instanceof Uint8Array)
    )
      throw Error(
        "Each original requires an explicit document ID, name and byte array.",
      );
    if (seen.has(file.documentId)) {
      issues.push({ documentId: file.documentId, code: "duplicate-original" });
      continue;
    }
    seen.add(file.documentId);
    const doc = expected.get(file.documentId);
    if (!doc) {
      issues.push({ documentId: file.documentId, code: "unexpected-original" });
      continue;
    }
    const name = doc.payload.originalName;
    const sha = doc.payload.originalSha256;
    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof sha !== "string" ||
      !/^[a-f0-9]{64}$/i.test(sha)
    ) {
      issues.push({ documentId: file.documentId, code: "missing-metadata" });
      continue;
    }
    if (!file.bytes.byteLength) {
      issues.push({ documentId: file.documentId, code: "invalid-original" });
      continue;
    }
    if (file.originalName !== name) {
      issues.push({ documentId: file.documentId, code: "name-mismatch" });
      continue;
    }
    const actual = digest(file.bytes);
    if (actual !== sha.toLowerCase()) {
      issues.push({ documentId: file.documentId, code: "hash-mismatch" });
      continue;
    }
    originals.push({
      documentId: file.documentId,
      originalName: name,
      sha256: actual,
      byteLength: file.bytes.byteLength,
    });
  }
  for (const doc of docs)
    if (!seen.has(doc.preservedId))
      issues.push({ documentId: doc.preservedId, code: "missing-original" });
  originals.sort((a, b) =>
    a.documentId < b.documentId ? -1 : a.documentId > b.documentId ? 1 : 0,
  );
  const status = issues.length
    ? "blocked"
    : docs.length
      ? "verified"
      : "not-required";
  const manifestSha256 =
    status === "verified"
      ? digest(stableBackupJson({ reviewSha256: checked.sha256, originals }))
      : null;
  return {
    reviewSha256: checked.sha256,
    status,
    documentCount: docs.length,
    verifiedCount: originals.length,
    originals,
    issues,
    manifestSha256,
    publication: "quarantined",
    financialPostingAllowed: false,
  };
}
