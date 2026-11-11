/** Server-only transport. This does not capture, schedule, alert, or configure OAuth. */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

type Fetch = typeof globalThis.fetch;
const api = "https://www.googleapis.com/drive/v3/files/";
const safeId = /^[A-Za-z0-9_-]{10,200}$/;
// Business archive encryption caps plaintext at 128 MiB; JSON/base64 expands it.
const maximumBytes = 180 * 1024 * 1024;

/**
 * Upload only an archive that has already passed authenticated decryption and
 * manifest checks; independently download and verify it before reporting success.
 * The caller supplies a short-lived OAuth token from its own secret manager.
 * Network errors after upload starts are ambiguous and MUST NOT be retried blindly.
 */
export async function uploadAndVerifyDriveBackup(input: {
  accessToken: string;
  expectedOwnerEmail: string;
  folderId: string;
  archive: Uint8Array;
  verifyArchive: (bytes: Uint8Array) => Promise<void>;
  fetchImpl?: Fetch;
}): Promise<{ fileId: string; sha256: string }> {
  if (!input.accessToken || /[\r\n]/.test(input.accessToken))
    throw Error("Drive authorization is unavailable.");
  if (
    !safeId.test(input.folderId) ||
    !/^[^@\s]+@[^@\s]+$/.test(input.expectedOwnerEmail)
  )
    throw Error("Invalid backup destination.");
  if (!input.archive.byteLength || input.archive.byteLength > maximumBytes)
    throw Error("Archive exceeds the supported 180 MiB upload limit.");
  const archive = Buffer.from(input.archive);
  await input.verifyArchive(archive);
  const request = input.fetchImpl ?? globalThis.fetch;
  const headers = { Authorization: `Bearer ${input.accessToken}` };
  const verifyMetadata = async (
    id: string,
    mimeType: string,
    parent?: string,
  ) => {
    const r = await request(
      `${api}${id}?fields=id,mimeType,shared,parents,owners(emailAddress)`,
      { headers, redirect: "error" },
    );
    if (!r.ok) throw Error("Backup destination cannot be verified.");
    const item = await r.json();
    if (
      item.id !== id ||
      item.mimeType !== mimeType ||
      item.shared !== false ||
      !Array.isArray(item.owners) ||
      item.owners.length !== 1 ||
      item.owners[0]?.emailAddress?.toLowerCase() !==
        input.expectedOwnerEmail.toLowerCase() ||
      (parent !== undefined &&
        (!Array.isArray(item.parents) ||
          item.parents.length !== 1 ||
          item.parents[0] !== parent))
    )
      throw Error(
        "Backup destination ownership, location or privacy check failed.",
      );
  };
  await verifyMetadata(input.folderId, "application/vnd.google-apps.folder");
  const initial = await request(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,parents",
    {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "application/json",
        "X-Upload-Content-Length": String(archive.byteLength),
      },
      body: JSON.stringify({
        name: `azzora-encrypted-${randomBytes(16).toString("hex")}.json`,
        parents: [input.folderId],
        mimeType: "application/json",
      }),
      redirect: "error",
    },
  );
  if (!initial.ok) throw Error("Cannot start Drive backup upload.");
  const location = initial.headers.get("location");
  let session: URL;
  try {
    session = new URL(location ?? "");
  } catch {
    throw Error("Drive upload session is invalid.");
  }
  if (
    session.origin !== "https://www.googleapis.com" ||
    session.pathname !== "/upload/drive/v3/files" ||
    session.username ||
    session.password ||
    session.hash ||
    !session.searchParams.has("upload_id")
  )
    throw Error("Drive upload session is invalid.");
  let upload: Response;
  try {
    upload = await request(session.toString(), {
      method: "PUT",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        "Content-Length": String(archive.byteLength),
      },
      body: archive,
      redirect: "error",
    });
  } catch {
    throw Error(
      "Upload outcome is uncertain; inspect Drive before another attempt.",
    );
  }
  if (!upload.ok)
    throw Error(
      "Backup upload failed or its outcome is uncertain; inspect Drive before another attempt.",
    );
  const metadata = await upload.json();
  if (
    !safeId.test(metadata.id ?? "") ||
    !Array.isArray(metadata.parents) ||
    metadata.parents.length !== 1 ||
    metadata.parents[0] !== input.folderId
  )
    throw Error(
      "Uploaded backup metadata is invalid; inspect Drive before another attempt.",
    );
  await verifyMetadata(metadata.id, "application/json", input.folderId);
  await verifyMetadata(input.folderId, "application/vnd.google-apps.folder");
  const download = await request(`${api}${metadata.id}?alt=media`, {
    headers,
    redirect: "error",
  });
  if (!download.ok)
    throw Error("Uploaded backup could not be independently downloaded.");
  if (!download.body) throw Error("Downloaded backup body is missing.");
  const reader = download.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > archive.byteLength) {
        await reader.cancel();
        throw Error("Downloaded backup exceeds the expected size.");
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const downloaded = Buffer.concat(chunks, total);
  const before = createHash("sha256").update(archive).digest();
  const after = createHash("sha256").update(downloaded).digest();
  if (!timingSafeEqual(before, after))
    throw Error("Uploaded backup integrity check failed.");
  await input.verifyArchive(downloaded);
  return { fileId: metadata.id, sha256: before.toString("hex") };
}
