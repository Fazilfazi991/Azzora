/** Owner-approved password authentication for exactly the two initial production
 * identities. The marker must come from the production SQL grant, never an HTTP
 * payload or user_metadata. This changes authentication policy, not privileges. */
export const productionPasswordCompany = "fc525d78-bc83-4845-96f1-fb402bb07465";
const identities = {
  "86d914dd-1f39-4860-87d0-b671dd39eb00": {
    email: "info@azzora.ae",
    role: "owner_admin",
    domainRole: "owner",
  },
  "c9a75ea9-2ab9-4ca3-a1f0-33d7f5c554a3": {
    email: "accounts@azzora.ae",
    role: "accountant",
    domainRole: "accountant",
  },
} as const;
export function isProductionPasswordOnly(actor: {
  authenticationPolicy?: string;
  userId: string;
  companyId: string;
  email?: string;
  role?: string;
  capabilities?: readonly string[];
  grant?: {
    userId: string;
    companyId: string;
    active: boolean;
    roles: readonly string[];
    capabilities: readonly string[];
  };
}): boolean {
  const identity = identities[actor.userId as keyof typeof identities];
  if (
    actor.authenticationPolicy !== "production-password-only" ||
    actor.companyId !== productionPasswordCompany ||
    !identity
  )
    return false;
  if (actor.email !== undefined && actor.email !== identity.email) return false;
  if (
    actor.role !== undefined &&
    actor.role !== identity.role &&
    actor.role !== identity.domainRole
  )
    return false;
  const grant = actor.grant;
  if (
    grant &&
    (!grant.active ||
      grant.userId !== actor.userId ||
      grant.companyId !== actor.companyId ||
      grant.roles.length !== 1 ||
      grant.roles[0] !== identity.domainRole)
  )
    return false;
  return !(grant?.capabilities || actor.capabilities || []).some(
    (capability) =>
      capability === "finance.post" || capability === "finance.simulate",
  );
}
