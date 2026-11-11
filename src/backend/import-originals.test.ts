import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { prepareImportReview } from "./import-plan";
import { verifyImportOriginals } from "./import-originals";

const bytes = Buffer.from("fictional-original-bytes\n", "utf8");
const sha = createHash("sha256").update(bytes).digest("hex");
const review = () =>
  prepareImportReview({
    companyId: "22222222-2222-4222-8222-222222222222",
    sourceId: "synthetic-only",
    dataClass: "synthetic-rehearsal",
    cutoverDate: "2026-11-11",
    originalUtf8: '{"synthetic":true}',
    rows: [
      {
        kind: "historical-document",
        sourceId: "old-id",
        preservedId: "DOC-1",
        payload: { originalName: "fictional.pdf", originalSha256: sha },
      },
    ],
  });

it("verifies actual original bytes against name and digest without changing the review or publishing", () => {
  const input = review(),
    before = structuredClone(input);
  const result = verifyImportOriginals(input, [
    { documentId: "DOC-1", originalName: "fictional.pdf", bytes },
  ]);
  expect(result).toMatchObject({
    status: "verified",
    documentCount: 1,
    verifiedCount: 1,
    publication: "quarantined",
    financialPostingAllowed: false,
  });
  expect(result.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(result.originals[0]).toEqual({
    documentId: "DOC-1",
    originalName: "fictional.pdf",
    sha256: sha,
    byteLength: bytes.length,
  });
  expect(input).toEqual(before);
  expect(JSON.stringify(result)).not.toContain(bytes.toString());
});
it("blocks missing, duplicate, renamed, tampered, empty and unexpected originals", () => {
  const original = {
    documentId: "DOC-1",
    originalName: "fictional.pdf",
    bytes,
  };
  for (const [files, code] of [
    [[], "missing-original"],
    [[original, original], "duplicate-original"],
    [[{ ...original, originalName: "other.pdf" }], "name-mismatch"],
    [[{ ...original, bytes: Buffer.from("changed") }], "hash-mismatch"],
    [[{ ...original, bytes: Buffer.alloc(0) }], "invalid-original"],
    [[original, { ...original, documentId: "other" }], "unexpected-original"],
  ] as const) {
    const result = verifyImportOriginals(review(), files);
    expect(result.status).toBe("blocked");
    expect(result.issues.map((issue) => issue.code)).toContain(code);
    expect(result.manifestSha256).toBeNull();
    expect(result.financialPostingAllowed).toBe(false);
  }
});
it("rejects altered review and reports absent manifest metadata without inventing it", () => {
  const value = review();
  expect(() =>
    verifyImportOriginals({ ...value, originalUtf8: "changed" }, []),
  ).toThrow(/integrity/);
  const missing = prepareImportReview({
    companyId: value.companyId,
    sourceId: "other",
    dataClass: "synthetic-rehearsal",
    cutoverDate: value.cutoverDate,
    originalUtf8: "{}",
    rows: [
      {
        kind: "historical-document",
        sourceId: "x",
        preservedId: "DOC-1",
        payload: {},
      },
    ],
  });
  const result = verifyImportOriginals(missing, [
    { documentId: "DOC-1", originalName: "fictional.pdf", bytes },
  ]);
  expect(result.issues).toContainEqual({
    documentId: "DOC-1",
    code: "missing-metadata",
  });
  expect(result.manifestSha256).toBeNull();
});

it("does not claim attachment verification when a review has no historical documents", () => {
  const r = review();
  const empty = prepareImportReview({
    companyId: r.companyId,
    sourceId: "no-documents",
    dataClass: "synthetic-rehearsal",
    cutoverDate: r.cutoverDate,
    originalUtf8: "{}",
    rows: [{ kind: "customer", sourceId: "c", preservedId: "C", payload: {} }],
  });
  expect(verifyImportOriginals(empty, [])).toMatchObject({
    status: "not-required",
    documentCount: 0,
    verifiedCount: 0,
    manifestSha256: null,
    financialPostingAllowed: false,
  });
});
