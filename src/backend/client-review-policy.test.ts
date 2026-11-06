import { it, expect } from "vitest";
import { isPasswordOnlyClientReview } from "./client-review-policy";
import { createDocumentAuthorization } from "../accounts-review/documents/admission";
const actor = {
  userId: "52f925bd-8744-48cc-8781-d20109387d14",
  companyId: "11111111-1111-4111-8111-111111111111",
  role: "accountant" as const,
  workspace: "accountant" as const,
  assurance: "aal1" as const,
  authenticationPolicy: "client-review-password-only",
  capabilities: ["finance.read", "finance.draft"],
};
it("only exact restricted password review actor is accepted", () =>
  expect(isPasswordOnlyClientReview(actor)).toBe(true));
it.each([
  { userId: "other" },
  { companyId: "other" },
  { role: "owner_admin" },
  { workspace: "manager" },
  { authenticationPolicy: undefined },
  { capabilities: ["finance.read", "finance.draft", "finance.simulate"] },
  { capabilities: ["finance.draft", "finance.draft"] },
  { capabilities: [] },
])("rejects policy/identity/scope drift %j", (change) =>
  expect(isPasswordOnlyClientReview({ ...actor, ...change })).toBe(false),
);
it("preserves fictional extraction admission for the owner-approved password client", () =>
  expect(
    createDocumentAuthorization(actor, {
      dataClass: "fictional",
      consent: true,
      policyVersion: "ai-fictional-v1",
    }).reviewOnly,
  ).toBe(true));
it("full Accountant still cannot extract at aal1", () =>
  expect(() =>
    createDocumentAuthorization(
      {
        ...actor,
        userId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        authenticationPolicy: undefined,
      },
      {
        dataClass: "fictional",
        consent: true,
        policyVersion: "ai-fictional-v1",
      },
    ),
  ).toThrow());
