/** Server-resolved grants. Never construct these from browser role flags or user_metadata. */
export type BusinessRole =
  "owner" | "admin" | "project_manager" | "accountant" | "site_staff";
export type Workspace = "manager" | "accountant";
export type BackendAction =
  | "project.read"
  | "project.write"
  | "expense.submit"
  | "expense.approve"
  | "finance.read"
  | "finance.draft"
  | "finance.post"
  | "access.manage";
export interface AccessGrant {
  userId: string;
  companyId: string;
  active: boolean;
  roles: BusinessRole[];
  workspaces: Workspace[];
  projectIds: string[];
  /** Finance posting and approvals require separately approved business-policy grants. */
  capabilities: BackendAction[];
}
export interface AuthorizedActor {
  userId: string;
  companyId: string;
  sessionId: string;
  assurance: "aal1" | "aal2";
  grant: AccessGrant;
}
export class AccessDenied extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 403,
  ) {
    super(code);
  }
}
export function authorize(
  actor: AuthorizedActor,
  action: BackendAction,
  resource: { companyId: string; projectId?: string; submittedBy?: string },
): void {
  const grant = actor.grant;
  if (
    !grant.active ||
    grant.userId !== actor.userId ||
    grant.companyId !== actor.companyId ||
    resource.companyId !== actor.companyId
  )
    throw new AccessDenied("company_access_denied");
  const privileged = grant.roles.some(
    (role) => role === "owner" || role === "admin" || role === "accountant",
  );
  if (privileged && actor.assurance !== "aal2")
    throw new AccessDenied("mfa_required");
  if (!grant.capabilities.includes(action))
    throw new AccessDenied("capability_denied");
  const finance = action.startsWith("finance.");
  if (
    finance &&
    (!grant.workspaces.includes("accountant") ||
      !grant.roles.some((role) =>
        ["owner", "admin", "accountant"].includes(role),
      ))
  )
    throw new AccessDenied("finance_access_denied");
  if (
    action === "access.manage" &&
    (!grant.roles.some((role) => role === "owner" || role === "admin") ||
      actor.assurance !== "aal2")
  )
    throw new AccessDenied("administration_denied");
  if (
    [
      "project.read",
      "project.write",
      "expense.submit",
      "expense.approve",
    ].includes(action)
  ) {
    if (!grant.workspaces.includes("manager"))
      throw new AccessDenied("workspace_denied");
    if (!resource.projectId || !grant.projectIds.includes(resource.projectId))
      throw new AccessDenied("project_access_denied");
    if (
      action === "project.write" &&
      !grant.roles.some((role) =>
        ["owner", "admin", "project_manager"].includes(role),
      )
    )
      throw new AccessDenied("project_write_denied");
    if (action === "expense.approve") {
      if (!resource.submittedBy || resource.submittedBy === actor.userId)
        throw new AccessDenied("self_approval_denied");
      if (
        !grant.roles.some((role) =>
          ["owner", "admin", "project_manager"].includes(role),
        )
      )
        throw new AccessDenied("approval_denied");
    }
  }
}
