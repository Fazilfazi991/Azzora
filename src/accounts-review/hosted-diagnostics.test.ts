import { describe, expect, it, vi } from "vitest";
import {
  BlobPreconditionFailedError,
  BlobServiceRateLimited,
  BlobUnknownError,
} from "@vercel/blob";
import { safeHostedErrorDiagnostic } from "./hosted-diagnostics";

describe("safe hosted diagnostics", () => {
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
