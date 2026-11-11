import { ReviewDraftError } from "../accounts-review/documents/review-errors.js";
/** Server-only fictional staging BFF. Real posting is disabled; AI requires explicit admission and the shared evaluation cap. */
import { createHash, randomUUID } from "node:crypto";
import { prepareManagerFiles, readManagerFile } from "./manager-files.js";
import { StagingPolicyError } from "./commercial-commands.js";
import { createStagingBackup, type ReadBackupOriginal } from "./backup.js";
import { createStagingAuth, type StagingActor } from "./auth.js";
import {
  rpc as defaultRpc,
  StagingServiceError,
  type StagingRpc,
} from "./supabase.js";
import {
  hydrateCanonical,
  serializeCanonical,
  type CanonicalData,
} from "./canonical.js";
import {
  applySharedCommand,
  createSharedCompanyState,
  sharedCommandScope,
  sharedManagerView,
  sharedExpenseSubmissions,
  type SharedActor,
  type SharedCommand,
  type SharedCompanyState,
} from "./domain.js";
import type { BackendAction } from "../backend/permissions.js";
import type { Person } from "../domain/model.js";
import {
  reportSelection,
  selectedSnapshot,
} from "../accounts-review/reporting.js";
import { reviewPdf } from "../accounts-review/pdf.js";
import { ProductionPolicyError } from "../accounting/production-policy.js";
import { ReviewRecordingError } from "../accounts-review/domain.js";
import { prepareImportReview } from "../backend/import-plan.js";
import { extractDocument } from "../accounts-review/documents/service.js";
import { BlobReviewStore } from "../accounts-review/hosted-store.js";
import { DocumentExtractionError } from "../accounts-review/documents/extraction-status.js";
import { createDocumentAuthorization } from "../accounts-review/documents/admission.js";
import {
  configuredDocumentRuntime,
  documentAvailability,
} from "../accounts-review/documents/runtime.js";
import { extractionInputSchema } from "../accounts-review/documents/runtime.js";
import {
  disabledExtractor,
  digestOf,
} from "../accounts-review/documents/providers.js";
import { storePrivateAttachment, readPrivateAttachment } from "./storage.js";
import {
  assertProductionActor,
  type ProductionRuntime,
} from "../backend/runtime-production.js";

const json = (status: number, value: unknown, requestId?: string) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
      Vary: "Cookie",
      ...(requestId ? { "X-Azzora-Request-ID": requestId } : {}),
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
    authenticationPolicy: actor.authenticationPolicy,
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
/** Existing Accounts forms omit IDs for creations. Derive them on the trusted
 * server from the actor-bound action key, so an uncertain retry is identical. */
export function stagingAction(
  input: Record<string, unknown>,
  actor: StagingActor,
  key: string,
  production = false,
): Record<string, unknown> {
  if (input.id !== undefined) return input;
  const prefixes: Record<string, string> = {
    invoice:
      input.invoiceType === "Normal Invoice"
        ? "NOR"
        : input.invoiceType === "Proforma"
          ? "PRO"
          : "INV",
    bill: "BILL",
    receipt: "RCPT",
    "supplier-payment": "PAY",
    expense: "EXP",
    "create-expense-ledger": "LEDGER",
    "create-cash-account": "CASH",
    transfer: "TRANSFER",
    "create-expense-from-review": "EXP",
    "create-bill-from-review": "BILL",
    "document-draft": "DOC",
    "document-manual": "DOC",
  };
  const prefix = prefixes[String(input.kind)];
  if (!prefix) return input; // Existing-resource actions must supply their real ID.
  const suffix = fingerprint({
    company: actor.companyId,
    actor: actor.userId,
    key,
  })
    .slice(0, 20)
    .toUpperCase();
  return { ...input, id: `${prefix}-${production ? "" : "STG-"}${suffix}` };
}
export function createStagingHandler(
  options: {
    rpc?: StagingRpc;
    auth?: ReturnType<typeof createStagingAuth>;
    production?: ProductionRuntime;
    storage?: {
      store: typeof storePrivateAttachment;
      read: typeof readPrivateAttachment;
    };
    productionBackup?: (
      source: { version: number; data: CanonicalData; companyId: string },
      read: ReadBackupOriginal,
      actor: SharedActor,
    ) => Promise<{
      format: "azzora-encrypted-business-backup-v1";
      ciphertext: string;
    }>;
  } = {},
) {
  const rpc = options.rpc ?? defaultRpc;
  const production = options.production;
  if (production && (!options.rpc || !options.auth || !options.storage))
    throw Error(
      "Production handlers require explicitly isolated RPC, authentication and storage adapters.",
    );
  const originals = options.storage || {
    store: storePrivateAttachment,
    read: readPrivateAttachment,
  };
  let auth = options.auth;
  return async (request: Request): Promise<Response> => {
    const requestId = randomUUID(),
      started = performance.now();
    let stage = "transport";
    try {
      const url = new URL(request.url);
      const path =
        "/" +
        (
          url.searchParams.get("route") ||
          url.pathname.replace(/^\/api\/(?:staging|production)\/?/, "")
        ).replace(/^\/+/, "");
      if (url.protocol !== "https:")
        return json(403, { error: "HTTPS is required." });
      if (!["GET", "POST"].includes(request.method))
        return json(405, { error: "Method not allowed." });
      auth ??= createStagingAuth({ rpc });
      if (path.startsWith("/auth/")) return auth.handle(request, path);
      const requestedWorkspace = path.startsWith("/manager/")
        ? "manager"
        : path.startsWith("/accounts/")
          ? "accountant"
          : undefined;
      const fileRoute = path.startsWith("/files/");
      if (!requestedWorkspace && !fileRoute)
        return json(404, { error: "Unknown staging route." });
      stage = "authentication";
      let actor = await auth.requireActor(request, requestedWorkspace);
      if (production) assertProductionActor(actor, production);
      const workspace = requestedWorkspace || actor.workspace;
      const read = () =>
        rpc<Loaded>("staging_company_read", {
          p_session_hash: actor.sessionHash,
          p_workspace: workspace,
        });
      stage = "read";
      let loaded = await read();
      if (path === "/manager/import/preview" && request.method === "POST") {
        if (
          actor.role !== "owner_admin" ||
          actor.assurance !== "aal2" ||
          !actor.capabilities.includes("access.manage")
        )
          return json(
            403,
            {
              error:
                "Current Owner access with MFA is required for import review.",
            },
            requestId,
          );
        if (
          !request.headers
            .get("Content-Type")
            ?.toLowerCase()
            .startsWith("application/json")
        )
          return json(415, { error: "JSON is required." }, requestId);
        const raw = await request.text();
        if (Buffer.byteLength(raw) > 2_900_000)
          return json(
            413,
            {
              error:
                "Use a review package below the 2.9 MB request limit; no records were saved.",
            },
            requestId,
          );
        let input: Record<string, unknown>;
        try {
          input = JSON.parse(raw);
          if (!input || Array.isArray(input) || typeof input !== "object")
            throw Error();
        } catch {
          return json(
            422,
            {
              error:
                "Provide a valid JSON import review package; no records were saved.",
            },
            requestId,
          );
        }
        if (input.companyId !== actor.companyId)
          return json(
            403,
            { error: "Import review must use this authorized company." },
            requestId,
          );
        if (input.dataClass !== "synthetic-rehearsal")
          return json(
            423,
            {
              error:
                "Real-company import review requires explicit migration approval and verified backup. No records were saved.",
              code: "real_import_approval_required",
            },
            requestId,
          );
        try {
          const review = prepareImportReview(input);
          return json(
            200,
            {
              format: review.format,
              companyId: review.companyId,
              sourceId: review.sourceId,
              dataClass: review.dataClass,
              cutoverDate: review.cutoverDate,
              sha256: review.sha256,
              originalSha256: review.originalSha256,
              counts: review.counts,
              controls: review.controls,
              issues: review.issues,
              reviewOnly: true,
              persisted: false,
              financialPostingAllowed: false,
              targetCompanyVersion: loaded.version,
            },
            requestId,
          );
        } catch {
          return json(
            422,
            {
              error:
                "Check the required import fields, formats and business-only source contents; no records were saved.",
            },
            requestId,
          );
        }
      }
      if (loaded.version === 0) {
        if (production)
          return json(
            409,
            {
              error:
                "This company requires approved setup or a reviewed import before use. No sample records or opening balances were created.",
              code: "production_company_setup_required",
            },
            requestId,
          );
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
      if (
        String(state.mode) !== (production ? "production" : "fictional-staging")
      )
        throw new StagingServiceError(503, "workspace_environment_mismatch");
      if (path === "/manager/backup" && request.method === "GET") {
        if (
          actor.role !== "owner_admin" ||
          actor.assurance !== "aal2" ||
          !actor.capabilities.includes("access.manage")
        )
          throw Object.assign(new Error("Owner backup access required"), {
            status: 403,
          });
        if (production && !options.productionBackup)
          throw new StagingServiceError(
            503,
            "production_backup_adapter_required",
          );
        const source = {
          version: loaded.version,
          data: loaded.data,
          companyId: actor.companyId,
        };
        const readOriginal: ReadBackupOriginal = (file) =>
          originals.read(actor.companyId, file);
        const backup = production
          ? await options.productionBackup!(
              source,
              readOriginal,
              sharedActor(actor),
            )
          : await createStagingBackup(source, readOriginal);
        if (
          production &&
          (!("format" in backup) ||
            backup.format !== "azzora-encrypted-business-backup-v1" ||
            !("ciphertext" in backup))
        )
          throw new StagingServiceError(
            503,
            "production_backup_format_invalid",
          );
        const bytes = new TextEncoder().encode(JSON.stringify(backup));
        let offset = 0;
        const body = new ReadableStream<Uint8Array>({
          pull(controller) {
            if (offset >= bytes.length) {
              controller.close();
              return;
            }
            const end = Math.min(offset + 65536, bytes.length);
            controller.enqueue(bytes.subarray(offset, end));
            offset = end;
          },
        });
        return new Response(body, {
          headers: {
            "Content-Type": "application/json",
            "Content-Disposition": production
              ? "attachment; filename=AZZORA-production-business-backup.encrypted.json"
              : "attachment; filename=AZZORA-fictional-staging-backup.json",
            "Cache-Control": "no-store, private",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
      if (fileRoute && request.method === "GET") {
        const id = decodeURIComponent(path.slice(7));
        const result =
          workspace === "manager"
            ? await readManagerFile(
                state,
                sharedActor(actor),
                id,
                originals.read,
              )
            : await (async () => {
                const file = state.finance.attachments.find(
                  (value) => value.id === id,
                );
                if (!file)
                  throw new StagingServiceError(
                    404,
                    "staging_attachment_not_found",
                  );
                return originals.read(
                  actor.companyId,
                  file as Parameters<typeof readPrivateAttachment>[1],
                );
              })();
        return new Response(Buffer.from(result.bytes), {
          headers: {
            "Content-Type": result.mime,
            "Cache-Control": "no-store, private",
            "X-Content-Type-Options": "nosniff",
            "Content-Disposition": `attachment; filename="${result.name.replace(/[^a-zA-Z0-9._-]/g, "_")}"`,
          },
        });
      }
      const snapshot = () =>
        workspace === "manager"
          ? {
              db: sharedManagerView(state, sharedActor(actor)),
              version: loaded.version,
              accountantBills:
                actor.role === "site_staff"
                  ? []
                  : selectedSnapshot(state.finance, reportSelection(url))
                      .bills.filter(
                        (b) =>
                          !state.manager.operations!.bills.some(
                            (native) => native.id === b.id,
                          ) &&
                          (actor.role === "owner_admin" ||
                            (b.projectId &&
                              actor.projectIds.includes(b.projectId))),
                      )
                      .map((b) => ({
                        id: b.id,
                        reference: b.invoiceReference || b.id,
                        party: b.party,
                        projectId: b.projectId,
                        date: b.date,
                        due: b.due,
                        status: b.cancellationDate ? "Cancelled" : b.status,
                        amountFils: b.amountFils,
                        outstandingFils: b.outstandingFils,
                      })),
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
              documentAi: production
                ? {
                    enabled: false,
                    provider: "deepseek",
                    status: "disabled",
                    message:
                      "External AI processing requires approved real-document data-processing and retention controls. Manual entry remains available.",
                  }
                : process.env.AZZORA_AI_GENERAL_DOCUMENTS === "fictional-v1"
                  ? documentAvailability(
                      configuredDocumentRuntime(new BlobReviewStore()),
                    )
                  : {
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
        return production
          ? json(
              423,
              {
                error:
                  "Production financial PDFs require the approved accounting and legal-document policy.",
                code: "production_document_policy_required",
              },
              requestId,
            )
          : new Response(
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
        const result = await originals.read(
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
      const action =
        workspace === "accountant" && !isUpload
          ? stagingAction(input, actor, key, Boolean(production))
          : input;
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
              payload: isUpload ? input : { action },
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
        if (production && parsed.mode !== "manual")
          return json(
            423,
            {
              error:
                "Real documents cannot be sent to an AI provider until data-processing and operating-budget approval is recorded. Manual entry remains available.",
              code: "production_document_processing_disabled",
            },
            requestId,
          );
        const general =
          !production &&
          process.env.AZZORA_AI_GENERAL_DOCUMENTS === "fictional-v1";
        const authorization =
          general && parsed.mode !== "manual"
            ? createDocumentAuthorization(actor, parsed.processing)
            : undefined;
        const extractor = authorization
          ? configuredDocumentRuntime(new BlobReviewStore(), authorization)
              .extractor
          : parsed.mode === "manual"
            ? disabledExtractor
            : undefined;
        const result = await extractDocument(
          state.finance,
          parsed.file,
          extractor,
        );
        // Membership/session may have changed while the provider was reading.
        actor = await auth.requireActor(request, "accountant");
        if (
          authorization &&
          (actor.userId !== authorization.userId ||
            actor.companyId !== authorization.companyId)
        )
          throw Object.assign(
            Error("Session changed during document processing."),
            { status: 403 },
          );
        if (authorization && !result.reused) {
          const review = result.state.documentEntries?.reviews.find(
            (doc) => doc.id === result.id,
          );
          if (review)
            review.processingConsent = {
              userId: authorization.userId,
              companyId: authorization.companyId,
              policyVersion: authorization.policyVersion,
              dataClass: "fictional",
              confirmedAt: new Date().toISOString(),
            };
        }
        const next = { ...state, finance: result.state };
        for (let i = 0; i < next.finance.attachments.length; i++)
          if (next.finance.attachments[i].data)
            next.finance.attachments[i] = await originals.store(
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
        stage = "validate";
        const scope = sharedCommandScope(state, command);
        if (production && scope.financial)
          return json(
            423,
            {
              error:
                "Real financial posting requires approved company policy and a separately authorized cutover.",
              code: "production_financial_posting_disabled",
            },
            requestId,
          );
        const next = applySharedCommand(state, command, sharedActor(actor));
        if (workspace === "manager") {
          stage = "private-file";
          await prepareManagerFiles(
            state,
            next,
            sharedActor(actor),
            originals.store,
          );
        }
        selectedSnapshot(next.finance, reportSelection(url));
        for (let i = 0; i < next.finance.attachments.length; i++)
          if (next.finance.attachments[i].data)
            next.finance.attachments[i] = await originals.store(
              actor.companyId,
              next.finance.attachments[i],
            );
        stage = "commit";
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
        : action.id;
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
      console.warn(
        JSON.stringify({
          event: production
            ? "production_request_failed"
            : "staging_request_failed",
          requestId,
          stage,
          status,
          code:
            error instanceof StagingServiceError ||
            error instanceof StagingPolicyError ||
            error instanceof ProductionPolicyError ||
            error instanceof ReviewRecordingError
              ? error.code
              : "request_rejected",
          elapsedMs: Math.round(performance.now() - started),
        }),
      );
      if (error instanceof ReviewDraftError)
        return json(
          error.status,
          {
            error: error.message,
            code: error.code,
            issues: error.issues,
            requestId,
          },
          requestId,
        );
      if (error instanceof DocumentExtractionError)
        return json(
          error.code === "not-authorized" ? 403 : 400,
          { error: error.message, code: error.code, requestId },
          requestId,
        );
      if (error instanceof StagingPolicyError)
        return new Response(
          JSON.stringify({ error: error.message, code: error.code, requestId }),
          {
            status: error.status,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-store, private",
              "X-Azzora-Request-ID": requestId,
            },
          },
        );
      if (error instanceof ProductionPolicyError)
        return json(
          error.status,
          {
            error: error.message,
            code: error.code,
            issues: error.issues,
            requestId,
          },
          requestId,
        );
      if (error instanceof ReviewRecordingError)
        return json(
          error.status,
          { error: error.message, code: error.code, requestId },
          requestId,
        );
      return json(
        status,
        {
          requestId,
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
        },
        requestId,
      );
    }
  };
}
export const stagingHandler = createStagingHandler();
