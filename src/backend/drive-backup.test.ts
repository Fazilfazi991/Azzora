import { describe, expect, it, vi } from "vitest";
import { uploadAndVerifyDriveBackup } from "./drive-backup";

const folderId = "folder_0123456789";
const fileId = "archive_0123456789";
const archive = Buffer.from('{"fictional":"encrypted"}');
const folder = {
  id: folderId,
  mimeType: "application/vnd.google-apps.folder",
  shared: false,
  owners: [{ emailAddress: "owner@example.test" }],
};
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { status: 200 });
const session = () =>
  new Response(null, {
    status: 200,
    headers: {
      location:
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=fixture",
    },
  });
const setup = (
  fetchImpl: typeof fetch,
  verifyArchive: (bytes: Uint8Array) => Promise<void> = vi.fn(async () => {}),
) => ({
  accessToken: "fictional-token",
  expectedOwnerEmail: "owner@example.test",
  folderId,
  archive,
  verifyArchive,
  fetchImpl,
});

describe("offsite encrypted archive transport", () => {
  it("checks private owner, validates before upload and after exact independent download", async () => {
    const verify = vi.fn(async (bytes: Uint8Array) => {
      expect(Buffer.from(bytes)).toEqual(archive);
    });
    const request = vi
      .fn()
      .mockResolvedValueOnce(json(folder))
      .mockResolvedValueOnce(session())
      .mockResolvedValueOnce(json({ id: fileId, parents: [folderId] }))
      .mockResolvedValueOnce(new Response(archive));
    const result = await uploadAndVerifyDriveBackup(
      setup(request as unknown as typeof fetch, verify),
    );
    expect(result.fileId).toBe(fileId);
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(verify).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenCalledTimes(4);
  });
  it("refuses a shared or wrong-owner folder before upload", async () => {
    const request = vi
      .fn()
      .mockResolvedValue(json({ ...folder, shared: true }));
    await expect(
      uploadAndVerifyDriveBackup(setup(request as unknown as typeof fetch)),
    ).rejects.toThrow("privacy");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("never uploads if authenticated archive verification fails", async () => {
    const request = vi.fn();
    await expect(
      uploadAndVerifyDriveBackup(
        setup(
          request as unknown as typeof fetch,
          vi.fn(async () => {
            throw Error("bad tag");
          }),
        ),
      ),
    ).rejects.toThrow("bad tag");
    expect(request).not.toHaveBeenCalled();
  });
  it("fails if downloaded bytes differ", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(json(folder))
      .mockResolvedValueOnce(session())
      .mockResolvedValueOnce(json({ id: fileId, parents: [folderId] }))
      .mockResolvedValueOnce(new Response("corrupted"));
    await expect(
      uploadAndVerifyDriveBackup(setup(request as unknown as typeof fetch)),
    ).rejects.toThrow("integrity");
  });
  it("does not retry an ambiguous upload", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(json(folder))
      .mockResolvedValueOnce(session())
      .mockRejectedValueOnce(Error("network"));
    await expect(
      uploadAndVerifyDriveBackup(setup(request as unknown as typeof fetch)),
    ).rejects.toThrow("uncertain");
    expect(request).toHaveBeenCalledTimes(3);
  });
  it("rejects archives larger than the supported encrypted archive limit", async () => {
    const request = vi.fn();
    await expect(
      uploadAndVerifyDriveBackup({
        ...setup(request as unknown as typeof fetch),
        archive: new Uint8Array(180 * 1024 * 1024 + 1),
      }),
    ).rejects.toThrow("limit");
    expect(request).not.toHaveBeenCalled();
  });
  it("never sends a bearer token to an untrusted upload URL", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(json(folder))
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { location: "https://example.test/upload?upload_id=bad" },
        }),
      );
    await expect(
      uploadAndVerifyDriveBackup(setup(request as unknown as typeof fetch)),
    ).rejects.toThrow("invalid");
    expect(request).toHaveBeenCalledTimes(2);
  });
});
