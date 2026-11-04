/** Server-only shared fictional staging BFF. No real posting or paid AI path. */
import { createHash } from "node:crypto";
import { createStagingAuth, type StagingActor } from "./auth";
import {
  rpc as defaultRpc,
  StagingServiceError,
  type StagingRpc,
} from "./supabase";
import {
  hydrateCanonical,
  serializeCanonical,
  type CanonicalData,
} from "./canonical";
import {
  applySharedCommand,
  createSharedCompanyState,
  sharedCommandScope,
  sharedManagerView,
  sharedExpenseSubmissions,
  type SharedActor,
  type SharedCommand,
  type SharedCompanyState,
} from "./domain";
import type { BackendAction } from "../backend/permissions";
import type { Person } from "../domain/model";
import {
  reportSelection,
  selectedSnapshot,
} from "../accounts-review/reporting";
import { reviewPdf } from "../accounts-review/pdf";
import { extractDocument } from "../accounts-review/documents/service";
import { extractionInputSchema } from "../accounts-review/documents/runtime";
import {
  disabledExtractor,
  digestOf,
} from "../accounts-review/documents/providers";
import { storePrivateAttachment, readPrivateAttachment } from "./storage";

const json = (status: number, value: unknown) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
      Vary: "Cookie",
    },
  });
const fingerprint = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function sharedActor(actor: StagingActor): SharedActor {
  return {
    userId: actor.userId,
    personId: actor.userId,
    companyId: actor.companyId,
    sessionId: actor.sessionHash,
    assurance: actor.assurance,
    grant: {
      userId: actor.userId,
      companyId: actor.companyId,
      active: true,
      roles: [actor.role === "owner_admin" ? "owner" : actor.role],
      workspaces: [actor.workspace],
      projectIds: actor.projectIds,
      capabilities: actor.capabilities as BackendAction[],
    },
  };
}
type Loaded = { version: number; data: CanonicalData };
export function createStagingHandler(
  options: {
    rpc?: StagingRpc;
    auth?: ReturnType<typeof createStagingAuth>;
  } = {},
) {
  const rpc = options.rpc ?? defaultRpc;
  let auth = options.auth;
  return async (request: Request): Promise<Response> => {
    try {
      const url = new URL(request.url);
      const path =
        "/" +
        (
          url.searchParams.get("route") ||
          url.pathname.replace(/^\/api\/staging\/?/, "")
        ).replace(/^\/+/, "");
      if (url.protocol !== "https:")
        return json(403, { error: "HTTPS is required." });
      if (!["GET", "POST"].includes(request.method))
        return json(405, { error: "Method not allowed." });
      auth ??= createStagingAuth({ rpc });
      if (path.startsWith("/auth/")) return auth.handle(request, path);
      const workspace = path.startsWith("/manager/")
        ? "manager"
        : path.startsWith("/accounts/")
          ? "accountant"
          : undefined;
      if (!workspace) return json(404, { error: "Unknown staging route." });
      let actor = await auth.requireActor(request, workspace);
      const read = () =>
        rpc<Loaded>("staging_company_read", {
          p_session_hash: actor.sessionHash,
          p_workspace: workspace,
        });
      let loaded = await read();
      if (loaded.version === 0) {
        if (actor.role !== "owner_admin" || actor.assurance !== "aal2")
          return json(409, {
            error:
              "The staging Owner must initialize fictional fixtures first.",
          });
        const people = await rpc<Person[]>("staging_company_people", {
          p_session_hash: actor.sessionHash,
        });
        const data = serializeCanonical(createSharedCompanyState(people));
        await rpc("staging_company_commit", {
          p_session_hash: actor.sessionHash,
          p_expected_version: 0,
          p_idempotency_key: "fictional_fixture_initialize",
          p_fingerprint: fingerprint({ kind: "fixture.initialize" }),
          p_command: "fixture.initialize",
          p_scope: { workspace, financial: true },
          p_data: data,
          p_bootstrap: true,
        });
        loaded = await read();
      }
      let state = hydrateCanonical(loaded.data);
      const snapshot = () =>
        workspace === "manager"
          ? {
              db: sharedManagerView(state, sharedActor(actor)),
              version: loaded.version,
              expenseSubmissions: sharedExpenseSubmissions(
                state,
                sharedActor(actor),
              ),
            }
          : {
              ...selectedSnapshot(state.finance, reportSelection(url)),
              version: loaded.version,
              expenseSubmissions: sharedExpenseSubmissions(
                state,
                sharedActor(actor),
              ),
              documentAi: {
                enabled: false,
                provider: "deepseek",
                status: "disabled",
                message:
                  "Paid AI is disabled in shared staging. Local PDF reading, labelled prepared demo suggestions and manual review remain available.",
              },
            };
      if (
        path ===
          `/${workspace === "manager" ? "manager" : "accounts"}/snapshot` &&
        request.method === "GET"
      )
        return json(200, snapshot());
      if (
        workspace === "accountant" &&
        request.method === "GET" &&
        path.startsWith("/accounts/pdf/")
      )
        return new Response(
          reviewPdf(
            state.finance,
            decodeURIComponent(path.slice(14)),
            reportSelection(url),
          ),
          {
            headers: {
              "Content-Type": "application/pdf",
              "X-Content-Type-Options": "nosniff",
              "Cache-Control": "no-store, private",
              "Content-Disposition":
                "attachment; filename=AZZORA-fictional-staging.pdf",
            },
          },
        );
      if (
        workspace === "accountant" &&
        request.method === "GET" &&
        path.startsWith("/accounts/attachment/")
      ) {
        const file = state.finance.attachments.find(
          (value) => value.id === decodeURIComponent(path.slice(21)),
        );
        if (!file) return json(404, { error: "Attachment not found." });
        const result = await readPrivateAttachment(
          actor.companyId,
          file as Parameters<typeof readPrivateAttachment>[1],
        );
        return new Response(Buffer.from(result.bytes), {
          headers: {
            "Content-Type": result.mime,
            "Cache-Control": "no-store, private",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": `attachment; filename="${result.name.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
          },
        });
      }
      if (request.method !== "POST")
        return json(404, { error: "Unknown staging route." });
      const raw = await request.text();
      if (Buffer.byteLength(raw, "utf8") > 2_900_000)
        return json(413, { error: "Request is too large." });
      if (
        !request.headers
          .get("Content-Type")
          ?.toLowerCase()
          .startsWith("application/json")
      )
        return json(415, { error: "JSON is required." });
      const input = JSON.parse(raw) as Record<string, unknown>;
      const expectedHeader = request.headers.get("X-Azzora-Expected-Version");
      if (
        workspace === "accountant" &&
        (!expectedHeader || !/^\d+$/.test(expectedHeader))
      )
        return json(400, { error: "An expected version is required." });
      const expected =
        workspace === "manager"
          ? input.expectedVersion
          : Number(expectedHeader);
      const key =
        workspace === "manager"
          ? input.idempotencyKey
          : request.headers.get("X-Azzora-Idempotency-Key");
      if (
        !Number.isSafeInteger(expected) ||
        typeof key !== "string" ||
        !/^[A-Za-z0-9_-]{16,128}$/.test(key)
      )
        return json(400, {
          error: "A version and unique action key are required.",
        });
      const isUpload = path === "/accounts/documents/extract";
      if (
        path !== "/manager/command" &&
        path !== "/accounts/action" &&
        !isUpload
      )
        return json(404, { error: "Unknown staging command." });
      const command: SharedCommand =
        workspace === "manager"
          ? { kind: String(input.kind), payload: input.payload }
          : {
              kind: isUpload ? "document.upload" : "accounts.action",
              payload: isUpload ? input : { action: input },
            };
      const print = fingerprint({ workspace, command });
      const commit = async (
        next: SharedCompanyState | undefined,
        scope: unknown,
      ) =>
        rpc<{ version: number; replayed: boolean }>("staging_company_commit", {
          p_session_hash: actor.sessionHash,
          p_expected_version: expected,
          p_idempotency_key: key,
          p_fingerprint: print,
          p_command: command.kind,
          p_scope: scope,
          p_data: next ? serializeCanonical(next) : {},
          p_bootstrap: false,
        });
      if (expected !== loaded.version) {
        // The database checks the actor-bound receipt before version/data validation.
        // This recovers a lost response without applying a command twice.
        await commit(undefined, {});
      } else if (isUpload) {
        const parsed = extractionInputSchema.parse(input);
        const result = await extractDocument(
          state.finance,
          parsed.file,
          parsed.mode === "manual" ? disabledExtractor : undefined,
        );
        const next = { ...state, finance: result.state };
        for (let i = 0; i < next.finance.attachments.length; i++)
          if (next.finance.attachments[i].data)
            next.finance.attachments[i] = await storePrivateAttachment(
              actor.companyId,
              next.finance.attachments[i],
            );
        await commit(next, { workspace: "accountant", financial: false });
        loaded = await read();
        state = hydrateCanonical(loaded.data);
        return json(200, {
          id: result.id,
          reused: result.reused,
          snapshot: snapshot(),
        });
      } else {
        const scope = sharedCommandScope(state, command);
        const next = applySharedCommand(state, command, sharedActor(actor));
        for (let i = 0; i < next.finance.attachments.length; i++)
          if (next.finance.attachments[i].data)
            next.finance.attachments[i] = await storePrivateAttachment(
              actor.companyId,
              next.finance.attachments[i],
            );
        await commit(next, scope);
      }
      actor = await auth.requireActor(request, workspace);
      loaded = await read();
      state = hydrateCanonical(loaded.data);
      const recoveredId = isUpload
        ? state.finance.documentEntries?.reviews.find(
            (value) =>
              value.sha256 ===
              digestOf(extractionInputSchema.parse(input).file),
          )?.id
        : input.id;
      return json(
        200,
        workspace === "manager"
          ? snapshot()
          : { id: String(recoveredId || ""), snapshot: snapshot() },
      );
    } catch (error) {
      const status =
        error instanceof StagingServiceError
          ? error.status
          : typeof error === "object" &&
              error &&
              "status" in error &&
              typeof error.status === "number"
            ? error.status
            : 400;
      return json(status, {
        error:
          status === 409
            ? "Staging data changed. Your changes are unconfirmed; refresh before retrying with a new action."
            : status === 401
              ? "Sign in to continue."
              : status === 403
                ? "This action is not permitted."
                : status >= 500
                  ? "The staging service is unavailable. No success has been confirmed."
                  : "Review the entered fields and try again.",
      });
    }
  };
}
export const stagingHandler = createStagingHandler();
