import { randomBytes } from "node:crypto";
import { expect, it, vi } from "vitest";
import { emptyOperations } from "../operations/migration";
import { createEmptyProductionCompany } from "../finance/production-policy";
import { serializeCanonical } from "../staging/canonical";
import { runVerifiedDriveBackupCandidate } from "./drive-backup-cycle";

it("captures an encrypted fictional archive, checks its manifest, uploads, downloads and checks it again", async () => {
  const companyId = "22222222-2222-4222-8222-222222222222";
  const key = randomBytes(32);
  const folderId = "folder_0123456789";
  let uploaded = Buffer.alloc(0);
  const calls: string[] = [];
  const request = vi.fn(
    async (url: string | URL | Request, init?: RequestInit) => {
      const target = String(url);
      if (target.includes("?fields=id,mimeType"))
        return new Response(
          JSON.stringify({
            id: folderId,
            mimeType: "application/vnd.google-apps.folder",
            shared: false,
            owners: [{ emailAddress: "owner@example.test" }],
          }),
        );
      if (target.includes("uploadType=resumable&fields"))
        return new Response(null, {
          headers: {
            location:
              "https://www.googleapis.com/upload/drive/v3/files?upload_id=fixture",
          },
        });
      if (target.includes("upload_id=fixture")) {
        uploaded = Buffer.from(init?.body as Uint8Array);
        return new Response(
          JSON.stringify({ id: "archive_0123456789", parents: [folderId] }),
        );
      }
      if (target.includes("?alt=media")) return new Response(uploaded);
      throw Error("unexpected request");
    },
  ) as unknown as typeof fetch;
  const result = await runVerifiedDriveBackupCandidate({
    request: {
      companyId,
      grantId: "33333333-3333-4333-8333-333333333333",
      requestId: "44444444-4444-4444-8444-444444444444",
      credential: randomBytes(32).toString("base64url"),
    },
    capture: {
      authority: {
        async begin() {
          calls.push("start");
          return true;
        },
        async finish() {
          calls.push("success");
          return true;
        },
      },
      readSnapshot: async () => ({
        companyId,
        version: 1,
        data: serializeCanonical(
          createEmptyProductionCompany({
            settings: emptyOperations().settings,
          }),
        ),
      }),
      readOriginal: async () => new Uint8Array(),
      backupKey: key,
      keyId: "QA-ONLY",
      now: () => new Date("2026-11-11T00:00:00Z"),
    },
    drive: {
      accessToken: "fictional-token",
      expectedOwnerEmail: "owner@example.test",
      folderId,
      fetchImpl: request,
    },
    maxAgeSeconds: 600,
  });
  expect(calls).toEqual(["start", "success"]);
  expect(result.coverage).toBe("business-archive-only");
  expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(uploaded.toString()).toContain("azzora-encrypted-business-backup-v1");
});
