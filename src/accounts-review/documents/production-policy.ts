// Server-owned evidence references, not document contents or browser assertions.
import { z } from "zod";
import { FICTIONAL_AI_COMPANY_ID } from "./admission.js";

const reference = z.string().trim().min(1).max(500);
const baseBusinessApprovalSchema = z
  .object({
    companyId: z.uuid().refine((id) => id !== FICTIONAL_AI_COMPANY_ID),
    ownerApprovalReference: reference,
    processingPolicyReference: reference,
    sharedBudgetVerificationReference: reference,
  })
  .strict();
/** Version 1 is retained for previously reviewed fictional deployments.
 * Version 2 records an explicit owner exception when the provider has not
 * supplied verifiable no-training/retention terms for company documents. */
export const businessAiApprovalSchema = z.union([
  baseBusinessApprovalSchema.extend({
    version: z.literal(1),
    noTrainingVerificationReference: reference,
  }),
  baseBusinessApprovalSchema.extend({
    version: z.literal(2),
    providerPolicyExceptionReference: reference,
  }),
]);
export type BusinessAiApproval = z.infer<typeof businessAiApprovalSchema>;
