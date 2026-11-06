import { describe, expect, it } from "vitest";
import {
  assertDocumentAuthorization,
  createDocumentAuthorization,
  FICTIONAL_AI_COMPANY_ID,
  type DocumentAdmissionActor,
} from "./admission";
import type { Upload } from "./model";

const processing = {
  dataClass: "fictional",
  consent: true,
  policyVersion: "ai-fictional-v1",
};
const actor = (): DocumentAdmissionActor => ({
  userId: "22222222-2222-4222-8222-222222222222",
  companyId: FICTIONAL_AI_COMPANY_ID,
  role: "accountant",
  workspace: "accountant",
  assurance: "aal2",
  capabilities: ["finance.draft"],
});
const upload = (mime = "image/png", suffix = "unseen-layout"): Upload => ({
  name: "new bill",
  mime,
  data: Buffer.concat([
    Buffer.from(
      mime === "application/pdf"
        ? [37, 80, 68, 70, 45]
        : mime === "image/jpeg"
          ? [255, 216, 255]
          : [137, 80, 78, 71, 13, 10, 26, 10],
    ),
    Buffer.from(suffix),
  ]).toString("base64"),
});

describe("fictional document admission", () => {
  it.each(["image/png", "image/jpeg", "application/pdf"])(
    "admits new %s bytes without registering a fingerprint",
    (mime) => {
      const authorization = createDocumentAuthorization(actor(), processing);
      for (const layout of [
        "new-supplier-A",
        "rotated-fictional-B",
        "Arabic-English-C",
      ])
        expect(() =>
          assertDocumentAuthorization(authorization, upload(mime, layout)),
        ).not.toThrow();
      expect(authorization.reviewOnly).toBe(true);
    },
  );
  it("admits the current Owner in the Accountant workspace", () => {
    expect(() =>
      createDocumentAuthorization(
        { ...actor(), role: "owner_admin" },
        processing,
      ),
    ).not.toThrow();
  });
  it.each([
    { companyId: "33333333-3333-4333-8333-333333333333" },
    { userId: "" },
    { role: "project_manager" },
    { role: "site_staff" },
    { workspace: "manager" },
    { assurance: "aal1" },
    { capabilities: [] },
  ])("denies an ineligible current actor %j", (change) => {
    expect(() =>
      createDocumentAuthorization(
        { ...actor(), ...change } as DocumentAdmissionActor,
        processing,
      ),
    ).toThrow(/not authorized/);
  });
  it.each([
    undefined,
    null,
    {},
    { ...processing, dataClass: "real" },
    { ...processing, consent: false },
    { ...processing, policyVersion: "old" },
    { ...processing, companyId: FICTIONAL_AI_COMPANY_ID },
    { ...processing, consent: "true" },
  ])("requires explicit exact fictional consent %j", (value) => {
    expect(() => createDocumentAuthorization(actor(), value)).toThrow(
      /not authorized/,
    );
  });
  it("rejects serialized or structurally forged grants", () => {
    const valid = createDocumentAuthorization(actor(), processing);
    expect(() => assertDocumentAuthorization({ ...valid }, upload())).toThrow(
      /not authorized/,
    );
    expect(() =>
      assertDocumentAuthorization(JSON.parse(JSON.stringify(valid)), upload()),
    ).toThrow(/not authorized/);
  });
  it("captures immutable trusted scope without exposing sessions or capabilities", () => {
    const source = actor(),
      authorization = createDocumentAuthorization(source, processing);
    source.companyId = "foreign";
    source.capabilities.length = 0;
    expect(authorization.companyId).toBe(FICTIONAL_AI_COMPANY_ID);
    expect(Object.isFrozen(authorization)).toBe(true);
    expect(Object.keys(authorization).sort()).toEqual([
      "authorize",
      "companyId",
      "dataClass",
      "policyVersion",
      "reviewOnly",
      "userId",
    ]);
  });
  it.each([
    { ...upload(), mime: "image/svg+xml" },
    { ...upload(), data: Buffer.from("not image").toString("base64") },
    { ...upload(), data: "not+base64!" },
    { ...upload(), data: "" },
    { ...upload(), name: "" },
    { ...upload(), mime: "application/pdf" },
  ])(
    "rejects unsupported or mismatched files before provider access",
    (file) => {
      expect(() =>
        assertDocumentAuthorization(
          createDocumentAuthorization(actor(), processing),
          file,
        ),
      ).toThrow(/prepared/);
    },
  );
  it("enforces the exact existing two-million-byte boundary without mutating the file", () => {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      authorization = createDocumentAuthorization(actor(), processing);
    const file = {
      ...upload(),
      data: Buffer.concat([
        signature,
        Buffer.alloc(2_000_000 - signature.length),
      ]).toString("base64"),
    };
    const original = structuredClone(file);
    expect(() =>
      assertDocumentAuthorization(authorization, file),
    ).not.toThrow();
    expect(file).toEqual(original);
    file.data = Buffer.concat([
      signature,
      Buffer.alloc(2_000_001 - signature.length),
    ]).toString("base64");
    expect(() => assertDocumentAuthorization(authorization, file)).toThrow(
      /prepared/,
    );
  });
});
