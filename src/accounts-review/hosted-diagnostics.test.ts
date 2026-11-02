import { describe, expect, it, vi } from "vitest";
import {
  BlobError,
  BlobPreconditionFailedError,
  BlobServiceRateLimited,
  BlobUnknownError,
} from "@vercel/blob";
import {
  safeHostedErrorDiagnostic,
  safeWritePreconditionDiagnostic,
} from "./hosted-diagnostics";

describe("safe hosted diagnostics", () => {
  it.each([
    [
      "ifMatch ETag precondition failed: weak unquoted version changed",
      "etag-precondition",
    ],
    ["Update in progress; concurrent writes are locked", "write-contention"],
    ["An update is already in progress", "write-contention"],
    ["The blob is currently being overwritten", "write-contention"],
    ["Blob already exists; overwrite was not enabled", "overwrite-or-existing"],
    ["Invalid token: authorization failed", "authorization"],
    ["Too many requests; rate limited", "rate-limit"],
    ["Invalid argument; option must be a string", "invalid-argument"],
    ["The argument has an invalid quoted format", "quote-or-format"],
    ["Opaque upstream rejection", "unknown"],
  ])(
    "emits only an allowlisted generic Blob reason for %s",
    (message, reason) => {
      const result = safeHostedErrorDiagnostic(new BlobError(message));
      expect(result.constructorName).toBe("BlobError");
      expect(result.sdkCode).toBe("blob_error");
      expect(result.blobReason).toBe(reason);
    },
  );
  it("exposes static message flags without raw paths, URLs, keys or private body content", () => {
    const message =
      'ETag ifMatch weak W/"PRIVATE-ETAG" unquoted changed; update in progress; path=accounts-review/v1/sessions/PRIVATE-SESSION.json https://private.example?token=PRIVATE-KEY body={"supplier":"PRIVATE-PARTY"}';
    const result = safeHostedErrorDiagnostic(new BlobError(message));
    expect(result.blobReason).toBe("etag-precondition");
    expect(result.blobFlags).toMatchObject({
      mentionsEtag: true,
      mentionsWeak: true,
      mentionsQuoted: true,
      mentionsChanged: true,
      mentionsBusy: true,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /PRIVATE|accounts-review|sessions|https:|supplier|token=|message|stack|cause/,
    );
  });
  it("classifies write preconditions without emitting the actual ETag", () => {
    for (const [version, versionFormat, writeMode] of [
      [undefined, "missing", "create"],
      ["", "missing", "create"],
      ['"PRIVATE-ETAG"', "strong-quoted", "conditional"],
      ['W/"PRIVATE-ETAG"', "weak", "conditional"],
      ["PRIVATE-ETAG", "opaque", "conditional"],
    ] as const) {
      expect(safeWritePreconditionDiagnostic(version)).toEqual({
        versionFormat,
        writeMode,
      });
      expect(
        JSON.stringify(safeWritePreconditionDiagnostic(version)),
      ).not.toContain("PRIVATE-ETAG");
    }
  });
  it("identifies SDK classes even when Error.name is only Error", () => {
    const error = new BlobServiceRateLimited(2);
    expect(error.name).toBe("Error");
    expect(safeHostedErrorDiagnostic(error)).toEqual({
      name: "Error",
      constructorName: "BlobServiceRateLimited",
      sdkCode: "rate_limited",
      retryAfterSeconds: 2,
    });
    expect(
      safeHostedErrorDiagnostic(new BlobPreconditionFailedError())
        .constructorName,
    ).toBe("BlobPreconditionFailedError");
    expect(safeHostedErrorDiagnostic(new BlobUnknownError()).sdkCode).toBe(
      "unknown_error",
    );
  });
  it("omits messages, stack, causes, URLs, credentials and unapproved string fields", () => {
    const error = Object.assign(
      new Error("https://private.example/file?token=secret"),
      {
        code: "private-secret-key",
        status: 503,
        cause: new Error("password"),
        url: "https://private.example",
      },
    );
    const detail = safeHostedErrorDiagnostic(error);
    expect(detail).toEqual({
      name: "Error",
      constructorName: "Error",
      status: 503,
    });
    expect(JSON.stringify(detail)).not.toMatch(
      /secret|private|password|https|stack|cause/,
    );
    error.name = "private-secret-key";
    expect(safeHostedErrorDiagnostic(error).name).toBe("unrecognized");
  });
  it("keeps bounded numeric status and allowlisted transport codes only", () => {
    expect(
      safeHostedErrorDiagnostic(
        Object.assign(new Error(), { statusCode: 429, code: "ECONNRESET" }),
      ),
    ).toEqual({
      name: "Error",
      constructorName: "Error",
      status: 429,
      code: "ECONNRESET",
    });
    expect(
      safeHostedErrorDiagnostic(
        Object.assign(new Error(), {
          status: "https://secret.example",
          statusCode: 999,
          code: "Bearer secret",
        }),
      ),
    ).toEqual({ name: "Error", constructorName: "Error" });
  });
  it("does not invoke toJSON or reveal non-Error objects", () => {
    const toJSON = vi.fn(() => ({ token: "secret" }));
    expect(safeHostedErrorDiagnostic({ toJSON, message: "secret" })).toEqual({
      name: "non-error",
      constructorName: "non-error",
    });
    expect(toJSON).not.toHaveBeenCalled();
  });
});
