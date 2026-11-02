// Server logs only. Never serialize Error objects, messages, causes, paths or URLs.
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { memoryUsage } from "node:process";
import {
  BlobAccessError,
  BlobClientTokenExpiredError,
  BlobContentTypeNotAllowedError,
  BlobError,
  BlobFileTooLargeError,
  BlobNotFoundError,
  BlobPathnameMismatchError,
  BlobPreconditionFailedError,
  BlobRequestAbortedError,
  BlobServiceNotAvailable,
  BlobServiceRateLimited,
  BlobStoreNotFoundError,
  BlobStoreSuspendedError,
  BlobUnknownError,
} from "@vercel/blob";

const blobTypes = [
  [BlobAccessError, "BlobAccessError", "forbidden"],
  [
    BlobClientTokenExpiredError,
    "BlobClientTokenExpiredError",
    "client_token_expired",
  ],
  [
    BlobContentTypeNotAllowedError,
    "BlobContentTypeNotAllowedError",
    "content_type_not_allowed",
  ],
  [BlobFileTooLargeError, "BlobFileTooLargeError", "file_too_large"],
  [BlobNotFoundError, "BlobNotFoundError", "not_found"],
  [
    BlobPathnameMismatchError,
    "BlobPathnameMismatchError",
    "client_token_pathname_mismatch",
  ],
  [
    BlobPreconditionFailedError,
    "BlobPreconditionFailedError",
    "precondition_failed",
  ],
  [BlobRequestAbortedError, "BlobRequestAbortedError", "request_aborted"],
  [BlobServiceNotAvailable, "BlobServiceNotAvailable", "service_unavailable"],
  [BlobServiceRateLimited, "BlobServiceRateLimited", "rate_limited"],
  [BlobStoreNotFoundError, "BlobStoreNotFoundError", "store_not_found"],
  [BlobStoreSuspendedError, "BlobStoreSuspendedError", "store_suspended"],
  [BlobUnknownError, "BlobUnknownError", "unknown_error"],
  [BlobError, "BlobError", "blob_error"],
] as const;
const names = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "AbortError",
  "TimeoutError",
  "SyntaxError",
  "ZodError",
  "ReviewConflict",
  ...blobTypes.map(([, name]) => name),
]);
const codes = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  ...blobTypes.map(([, , code]) => code),
]);

type DiagnosticOperation = "none" | "read" | "write" | "remove";
interface HostedRequestDiagnosticContext {
  requestId: string;
  method: "GET" | "POST" | "OTHER";
  route: string;
  startedAt: number;
  operation: DiagnosticOperation;
  signal: AbortSignal;
}
const requests = new AsyncLocalStorage<HostedRequestDiagnosticContext>();
export const HOSTED_STORE_TIMEOUT_MS = 15_000;
export const HOSTED_REQUEST_TIMEOUT_MS = 45_000;
const routeNames = new Set([
  "/login",
  "/logout",
  "/session",
  "/snapshot",
  "/action",
  "/reset",
  "/documents/extract",
]);
function diagnosticRoute(request: Request) {
  const url = new URL(request.url);
  const path =
    "/" +
    (
      url.searchParams.get("route") ||
      url.pathname.replace(/^\/api\/accounts-review\/?/, "")
    ).replace(/^\/+/, "");
  if (routeNames.has(path)) return path;
  if (path.startsWith("/attachment/")) return "/attachment/:id";
  if (path.startsWith("/pdf/")) return "/pdf/:id";
  return "other";
}
export function hostedRequestDiagnosticContext() {
  const context = requests.getStore();
  if (!context) return {};
  const usage = memoryUsage();
  return {
    requestId: context.requestId,
    method: context.method,
    route: context.route,
    operation: context.operation,
    elapsedMs: Math.max(0, Date.now() - context.startedAt),
    rssMiB: Math.ceil(usage.rss / 1_048_576),
    heapUsedMiB: Math.ceil(usage.heapUsed / 1_048_576),
    aborted: context.signal.aborted,
  };
}
export function setHostedDiagnosticOperation(operation: DiagnosticOperation) {
  const context = requests.getStore();
  if (context) context.operation = operation;
}
export function hostedStoreAbortSignal() {
  const signal = requests.getStore()?.signal;
  const operation = AbortSignal.timeout(HOSTED_STORE_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, operation]) : operation;
  const controller = new AbortController();
  // Blob SDK 2.8 bails immediately for AbortError, but otherwise may retry a
  // TimeoutError or a caller-supplied abort reason. Normalize cancellation so
  // a deadline cannot enter that retry backoff or disclose a private reason.
  if (combined.aborted) controller.abort();
  else combined.addEventListener("abort", () => controller.abort(), { once: true });
  return controller.signal;
}
export function withHostedRequestDiagnostics(
  request: Request,
  work: () => Promise<Response>,
) {
  return requests.run(
    {
      requestId: randomUUID(),
      method:
        request.method === "GET" || request.method === "POST"
          ? request.method
          : "OTHER",
      route: diagnosticRoute(request),
      startedAt: Date.now(),
      operation: "none",
      signal: AbortSignal.any([
        request.signal,
        AbortSignal.timeout(HOSTED_REQUEST_TIMEOUT_MS),
      ]),
    },
    async () => {
      const response = await work();
      response.headers.set(
        "X-Azzora-Request-ID",
        requests.getStore()!.requestId,
      );
      if (response.status >= 500)
        console.error("accounts-review-request-unavailable", {
          ...hostedRequestDiagnosticContext(),
          status: response.status,
        });
      return response;
    },
  );
}

export function safeHostedErrorDiagnostic(error: unknown) {
  try {
    if (!(error instanceof Error))
      return { name: "non-error", constructorName: "non-error" };
    const found = blobTypes.find(([Type]) => error instanceof Type);
    const constructorName =
      found?.[1] ??
      (names.has(error.constructor.name)
        ? error.constructor.name
        : "unrecognized");
    const value = error as Error & {
      status?: unknown;
      statusCode?: unknown;
      code?: unknown;
      retryAfter?: unknown;
    };
    const status = [value.status, value.statusCode].find(
      (v) => Number.isInteger(v) && Number(v) >= 100 && Number(v) <= 599,
    );
    return {
      name: names.has(error.name) ? error.name : "unrecognized",
      constructorName,
      ...(status === undefined ? {} : { status: Number(status) }),
      ...(typeof value.code === "string" && codes.has(value.code)
        ? { code: value.code }
        : {}),
      ...(found ? { sdkCode: found[2] } : {}),
      ...(error instanceof BlobServiceRateLimited &&
      Number.isFinite(error.retryAfter) &&
      error.retryAfter >= 0 &&
      error.retryAfter <= 3600
        ? { retryAfterSeconds: error.retryAfter }
        : {}),
    };
  } catch {
    return { name: "uninspectable", constructorName: "uninspectable" };
  }
}
