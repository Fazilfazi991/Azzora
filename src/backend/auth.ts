import {
  AccessDenied,
  type AccessGrant,
  type AuthorizedActor,
  type Workspace,
} from "./permissions.js";
import {
  assertTransport,
  clearSessionCookie,
  newSecret,
  readSessionCookie,
  sameSecret,
  secretHash,
  sessionCookie,
} from "./security.js";

export interface VerifiedIdentity {
  userId: string;
  providerSessionId: string;
  assurance: "aal1" | "aal2";
  expiresAt: number;
}
export interface IdentityProvider {
  /** Must verify signature/issuer/audience/expiry online or using trusted JWKS, never decode-only. */
  verifyAccessToken(token: string): Promise<VerifiedIdentity>;
  revokeSession(providerSessionId: string, userId: string): Promise<void>;
}
export interface AuthSession {
  tokenHash: string;
  csrfHash: string;
  userId: string;
  providerSessionId: string;
  companyId: string;
  assurance: "aal1" | "aal2";
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  revokedAt: number | null;
}
export interface AuthSessionStore {
  create(session: AuthSession): Promise<void>;
  read(tokenHash: string): Promise<AuthSession | null>;
  /** Must atomically reject revoked/expired sessions; never recreate a deleted session. */
  touch(tokenHash: string, now: number): Promise<boolean>;
  revoke(tokenHash: string, now: number): Promise<void>;
}
export interface AccessDirectory {
  currentGrant(userId: string, companyId: string): Promise<AccessGrant | null>;
  /** Trusted DB/identity check: session still exists, is not revoked, and its current
   * MFA assurance/factors still satisfy expectedAssurance (never rely on stale JWT AAL).
   * The production adapter must fail closed if that current assurance cannot be proven.
   */
  providerSessionActive(
    providerSessionId: string,
    userId: string,
    expectedAssurance: "aal1" | "aal2",
  ): Promise<boolean>;
}
export interface SecurityAudit {
  append(event: {
    kind: "session.created" | "session.revoked" | "access.denied";
    userId?: string;
    companyId?: string;
    code?: string;
    at: number;
  }): Promise<void>;
}
export function createBackendAuth(options: {
  identity: IdentityProvider;
  sessions: AuthSessionStore;
  access: AccessDirectory;
  audit: SecurityAudit;
  allowedOrigins: ReadonlySet<string>;
  now?: () => number;
  idleMs?: number;
  absoluteMs?: number;
}) {
  const now = options.now || Date.now;
  const idleMs = options.idleMs ?? 15 * 60_000;
  const absoluteMs = options.absoluteMs ?? 8 * 60 * 60_000;
  if (
    !Number.isSafeInteger(idleMs) ||
    !Number.isSafeInteger(absoluteMs) ||
    idleMs <= 0 ||
    absoluteMs < idleMs ||
    absoluteMs > 86_400_000
  )
    throw new Error("Invalid session lifetime policy");
  async function grantFor(
    identity: Pick<
      VerifiedIdentity,
      "userId" | "providerSessionId" | "assurance"
    >,
    companyId: string,
    workspace: Workspace,
  ): Promise<AccessGrant> {
    if (
      !(await options.access.providerSessionActive(
        identity.providerSessionId,
        identity.userId,
        identity.assurance,
      ))
    )
      throw new AccessDenied("authentication_required", 401);
    const grant = await options.access.currentGrant(identity.userId, companyId);
    if (
      !grant ||
      !grant.active ||
      grant.userId !== identity.userId ||
      grant.companyId !== companyId ||
      !grant.workspaces.includes(workspace)
    )
      throw new AccessDenied("workspace_denied");
    if (
      grant.roles.some((role) =>
        ["owner", "admin", "accountant"].includes(role),
      ) &&
      identity.assurance !== "aal2"
    )
      throw new AccessDenied("mfa_required");
    return grant;
  }
  return {
    /** Exchange only a provider-verified token; credentials/MFA are handled by approved identity flow. */
    async login(
      request: Request,
      input: { accessToken: string; companyId: string; workspace: Workspace },
    ) {
      assertTransport(request, options.allowedOrigins, true);
      if (request.method !== "POST")
        throw new AccessDenied("method_denied", 405);
      if (
        !input.accessToken ||
        input.accessToken.length > 16_384 ||
        !input.companyId ||
        !["manager", "accountant"].includes(input.workspace)
      )
        throw new AccessDenied("authentication_required", 401);
      const identity = await options.identity.verifyAccessToken(
        input.accessToken,
      );
      const at = now();
      if (
        !identity.userId ||
        !identity.providerSessionId ||
        !["aal1", "aal2"].includes(identity.assurance) ||
        !Number.isSafeInteger(identity.expiresAt) ||
        identity.expiresAt <= at
      )
        throw new AccessDenied("authentication_required", 401);
      await grantFor(identity, input.companyId, input.workspace);
      const token = newSecret();
      const csrf = newSecret();
      const session: AuthSession = {
        tokenHash: secretHash(token),
        csrfHash: secretHash(csrf),
        userId: identity.userId,
        providerSessionId: identity.providerSessionId,
        companyId: input.companyId,
        assurance: identity.assurance,
        createdAt: at,
        lastSeenAt: at,
        expiresAt: Math.min(at + absoluteMs, identity.expiresAt),
        revokedAt: null,
      };
      await options.sessions.create(session);
      try {
        await options.audit.append({
          kind: "session.created",
          userId: identity.userId,
          companyId: input.companyId,
          at,
        });
      } catch (error) {
        await options.sessions.revoke(session.tokenHash, at);
        throw error;
      }
      return {
        cookie: sessionCookie(
          token,
          Math.floor((session.expiresAt - at) / 1000),
        ),
        csrf,
        userId: identity.userId,
        workspace: input.workspace,
      };
    },
    async authenticate(
      request: Request,
      workspace: Workspace,
    ): Promise<AuthorizedActor> {
      const mutation = !["GET", "HEAD"].includes(request.method);
      assertTransport(request, options.allowedOrigins, mutation);
      const tokenHash = secretHash(readSessionCookie(request));
      const session = await options.sessions.read(tokenHash);
      const at = now();
      if (
        !session ||
        session.tokenHash !== tokenHash ||
        session.revokedAt !== null ||
        !Number.isSafeInteger(session.expiresAt) ||
        session.expiresAt <= at ||
        session.createdAt > at ||
        session.lastSeenAt > at ||
        session.lastSeenAt + idleMs <= at ||
        session.createdAt + absoluteMs <= at
      )
        throw new AccessDenied("authentication_required", 401);
      if (
        mutation &&
        !sameSecret(request.headers.get("x-azzora-csrf"), session.csrfHash)
      )
        throw new AccessDenied("csrf_denied");
      const grant = await grantFor(
        {
          userId: session.userId,
          providerSessionId: session.providerSessionId,
          assurance: session.assurance,
        },
        session.companyId,
        workspace,
      );
      if (!(await options.sessions.touch(tokenHash, at)))
        throw new AccessDenied("authentication_required", 401);
      return {
        userId: session.userId,
        companyId: session.companyId,
        sessionId: session.providerSessionId,
        assurance: session.assurance,
        grant,
      };
    },
    async logout(request: Request) {
      assertTransport(request, options.allowedOrigins, true);
      if (request.method !== "POST")
        throw new AccessDenied("method_denied", 405);
      const tokenHash = secretHash(readSessionCookie(request));
      const session = await options.sessions.read(tokenHash);
      if (
        !session ||
        !sameSecret(request.headers.get("x-azzora-csrf"), session.csrfHash)
      )
        throw new AccessDenied("csrf_denied");
      const at = now();
      // Local revocation first: provider outage cannot keep the AZZORA session usable.
      await options.sessions.revoke(tokenHash, at);
      await options.audit.append({
        kind: "session.revoked",
        userId: session.userId,
        companyId: session.companyId,
        at,
      });
      await options.identity.revokeSession(
        session.providerSessionId,
        session.userId,
      );
      return { cookie: clearSessionCookie };
    },
  };
}
