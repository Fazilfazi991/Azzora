export const extractionFailures = {
  "not-authorized":
    "This document is not authorized for AI processing. No document was sent to the provider. Sign in with an authorized account and confirm fictional-data processing consent, or enter manually.",
  "configuration-required":
    "AI processing is not configured or approved. No extraction completed; the original is available for manual review.",
  "budget-blocked":
    "AI processing was blocked by the shared spending or prior-attempt safeguards. No new paid request is permitted; review the original manually.",
  "preparation-failed":
    "The document could not be prepared for AI. No extraction completed; the original is available for manual review.",
  "provider-unavailable":
    "The AI provider is unavailable or rejected the request. No extraction completed. There is no automatic paid retry; review the original manually.",
  "response-invalid":
    "The AI response could not be validated. Its values have not been accepted. Review the original manually; no automatic paid retry will occur.",
  "storage-unavailable":
    "AI processing could not complete because its protected storage is unavailable. No extraction result was accepted; review the original manually.",
} as const;
export type ExtractionFailureCode = keyof typeof extractionFailures;
export class DocumentExtractionError extends Error {
  constructor(public readonly code: ExtractionFailureCode) {
    super(extractionFailures[code]);
    this.name = "DocumentExtractionError";
  }
}
