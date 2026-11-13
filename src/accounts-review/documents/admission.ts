import { isPasswordOnlyClientReview } from "../../backend/client-review-policy.js";
import { isProductionPasswordOnly } from "../../backend/production-password-policy.js";
// Server-only admission. The BFF supplies a freshly verified actor, never request role claims.
import { z } from "zod";
import { attachment, type ReviewState } from "../domain.js";
import type { StagingActor } from "../../staging/auth.js";
import type { Upload } from "./model.js";
import { DocumentExtractionError } from "./extraction-status.js";

export const FICTIONAL_AI_COMPANY_ID = "11111111-1111-4111-8111-111111111111";
export const FICTIONAL_AI_POLICY_VERSION = "ai-fictional-v1";
export const fictionalDocumentProcessingSchema = z
  .object({
    dataClass: z.literal("fictional"),
    consent: z.literal(true),
    policyVersion: z.literal(FICTIONAL_AI_POLICY_VERSION),
  })
  .strict();
export const BUSINESS_AI_POLICY_VERSION = "ai-business-v1";
export const businessDocumentProcessingSchema = z
  .object({
    dataClass: z.literal("business"),
    consent: z.literal(true),
    policyVersion: z.literal(BUSINESS_AI_POLICY_VERSION),
  })
  .strict();
export const documentProcessingSchema = z.union([
  fictionalDocumentProcessingSchema,
  businessDocumentProcessingSchema,
]);

export type DocumentAdmissionActor = Pick<
  StagingActor,
  | "userId"
  | "companyId"
  | "role"
  | "workspace"
  | "assurance"
  | "capabilities"
  | "authenticationPolicy"
>;
export interface DocumentAuthorization {
  readonly userId: string;
  readonly companyId: string;
  readonly dataClass: "fictional" | "business";
  readonly policyVersion:
    typeof FICTIONAL_AI_POLICY_VERSION | typeof BUSINESS_AI_POLICY_VERSION;
  readonly reviewOnly: true;
  authorize(file: Upload): void;
}
const minted = new WeakSet<object>();
const fileSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    mime: z.enum(["application/pdf", "image/png", "image/jpeg"]),
    data: z.string().min(1).max(2_800_000),
  })
  .strict();

function validateFile(file: Upload): void {
  try {
    const parsed = fileSchema.parse(file);
    // Reuse the authoritative MIME/signature/base64/2,000,000-byte validation.
    // attachment touches only this scratch list; no original or financial record is written.
    attachment(
      { attachments: [] } as unknown as ReviewState,
      "admission",
      parsed,
    );
  } catch {
    throw new DocumentExtractionError("preparation-failed");
  }
}

/** Request-scoped only: call after current provider/session/membership checks.
 * An attestation authorizes fictional test processing; it is not real-data approval.
 * This does not replace CSRF, origin, storage, budget or provider-configuration gates.
 */
export function createDocumentAuthorization(
  currentStagingActor: DocumentAdmissionActor,
  processing: unknown,
): DocumentAuthorization {
  const actor = currentStagingActor;
  if (
    !actor ||
    actor.companyId !== FICTIONAL_AI_COMPANY_ID ||
    !z.uuid().safeParse(actor.userId).success ||
    actor.workspace !== "accountant" ||
    !["owner_admin", "accountant"].includes(actor.role) ||
    (actor.assurance !== "aal2" && !isPasswordOnlyClientReview(actor)) ||
    !Array.isArray(actor.capabilities) ||
    !actor.capabilities.includes("finance.draft") ||
    !fictionalDocumentProcessingSchema.safeParse(processing).success
  ) {
    throw new DocumentExtractionError("not-authorized");
  }
  const authorization: DocumentAuthorization = Object.freeze({
    userId: actor.userId,
    companyId: FICTIONAL_AI_COMPANY_ID,
    dataClass: "fictional",
    policyVersion: FICTIONAL_AI_POLICY_VERSION,
    reviewOnly: true,
    authorize: validateFile,
  });
  minted.add(authorization);
  return authorization;
}

/** The company argument is server configuration, never a request-supplied scope.
 * This grant proves only current actor/consent; runtime policy and spending
 * approval are independently required before any external request. */
export function createProductionDocumentAuthorization(
  actor: DocumentAdmissionActor,
  processing: unknown,
  approvedCompanyId: string,
): DocumentAuthorization {
  if (
    !actor ||
    !z.uuid().safeParse(approvedCompanyId).success ||
    approvedCompanyId === FICTIONAL_AI_COMPANY_ID ||
    actor.companyId !== approvedCompanyId ||
    !z.uuid().safeParse(actor.userId).success ||
    actor.workspace !== "accountant" ||
    !["owner_admin", "accountant"].includes(actor.role) ||
    (actor.assurance !== "aal2" && !isProductionPasswordOnly(actor)) ||
    !Array.isArray(actor.capabilities) ||
    !actor.capabilities.includes("finance.draft") ||
    !businessDocumentProcessingSchema.safeParse(processing).success
  )
    throw new DocumentExtractionError("not-authorized");
  const authorization: DocumentAuthorization = Object.freeze({
    userId: actor.userId,
    companyId: actor.companyId,
    dataClass: "business",
    policyVersion: BUSINESS_AI_POLICY_VERSION,
    reviewOnly: true,
    authorize: validateFile,
  });
  minted.add(authorization);
  return authorization;
}

/** Reject JSON/structural imitations before allowing any provider transport. */
export function assertDocumentAuthorization(
  authorization: unknown,
  file: Upload,
): asserts authorization is DocumentAuthorization {
  if (
    !authorization ||
    typeof authorization !== "object" ||
    !minted.has(authorization)
  )
    throw new DocumentExtractionError("not-authorized");
  (authorization as DocumentAuthorization).authorize(file);
}
