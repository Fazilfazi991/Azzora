/** Server-resolved exception for the owner's restricted fictional client review only. */
export function isPasswordOnlyClientReview(actor: {
  userId: string;
  companyId: string;
  role: string;
  workspace: string;
  capabilities: readonly string[];
  authenticationPolicy?: string;
}): boolean {
  return (
    actor.authenticationPolicy === "client-review-password-only" &&
    actor.userId === "52f925bd-8744-48cc-8781-d20109387d14" &&
    actor.companyId === "11111111-1111-4111-8111-111111111111" &&
    actor.role === "accountant" &&
    actor.workspace === "accountant" &&
    Array.isArray(actor.capabilities) &&
    actor.capabilities.length === 2 &&
    actor.capabilities.includes("finance.read") &&
    actor.capabilities.includes("finance.draft")
  );
}
