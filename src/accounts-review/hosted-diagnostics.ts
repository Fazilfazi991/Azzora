// Server logs only. Never serialize Error objects, messages, causes, paths or URLs.
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
