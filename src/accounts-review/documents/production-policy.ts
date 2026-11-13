// Server-owned evidence references, not document contents or browser assertions.
import { z } from "zod";
import { FICTIONAL_AI_COMPANY_ID } from "./admission.js";

const reference = z.string().trim().min(1).max(500);
export const businessAiApprovalSchema = z
  .object({
    version: z.literal(1),
    companyId: z.uuid().refine((id) => id !== FICTIONAL_AI_COMPANY_ID),
    ownerApprovalReference: reference,
    processingPolicyReference: reference,
    noTrainingVerificationReference: reference,
    sharedBudgetVerificationReference: reference,
  })
  .strict();
export type BusinessAiApproval = z.infer<typeof businessAiApprovalSchema>;
