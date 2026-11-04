/** SERVER ONLY. Originals are never served through public or signed Storage URLs. */
import { createHash } from "node:crypto";
import type { ReviewAttachment } from "../accounts-review/domain";
import {
  stagingConfig,
  StagingServiceError,
  type StagingConfig,
} from "./supabase";

export type StoredStagingAttachment = ReviewAttachment & {
  storageObjectKey: string;
};
const bucket = "azzora-private";
// Preserve the existing document runtime's stricter decimal 2 MB limit.
const maximumBytes = 2_000_000;
const extensions = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
} as const;
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const fail = (code = "staging_attachment_invalid", status = 400): never => {
  throw new StagingServiceError(status, code);
};
function companyPrefix(companyId: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      companyId,
    )
  )
    fail();
  return companyId.toLowerCase();
}
function validateBytes(
  bytes: Uint8Array,
  mime: ReviewAttachment["mime"],
  size: number,
) {
  const signature =
    mime === "application/pdf"
      ? [37, 80, 68, 70, 45]
      : mime === "image/png"
        ? [137, 80, 78, 71, 13, 10, 26, 10]
        : [255, 216, 255];
  if (
    !bytes.length ||
    bytes.length > maximumBytes ||
    bytes.length !== size ||
    !signature.every((byte, index) => bytes[index] === byte)
  )
    fail();
}
function metadata(input: ReviewAttachment) {
  if (
    !input ||
    typeof input.id !== "string" ||
    !input.id ||
    input.id.length > 200 ||
    typeof input.name !== "string" ||
    !input.name.trim() ||
    input.name.length > 120 ||
    [...input.name].some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    ) ||
    !Object.hasOwn(extensions, input.mime) ||
    !Number.isSafeInteger(input.size) ||
    input.size <= 0 ||
    input.size > maximumBytes
  )
    fail();
}
function keyFor(companyId: string, attachment: StoredStagingAttachment) {
  metadata(attachment);
  const prefix = companyPrefix(companyId),
    extension = extensions[attachment.mime];
  const key = attachment.storageObjectKey;
  if (
    typeof key !== "string" ||
    !new RegExp(`^${prefix}/[a-f0-9]{64}\\.${extension}$`).test(key)
  )
    fail("staging_attachment_access_denied", 403);
  return key;
}

export function createPrivateAttachmentStorage(
  config: StagingConfig,
  transport: typeof fetch = fetch,
) {
  const headers = {
    apikey: config.serviceKey,
    ...(config.serviceKey.startsWith("eyJ")
      ? { Authorization: `Bearer ${config.serviceKey}` }
      : {}),
  };
  const request = async (key: string, init: RequestInit) => {
    try {
      return await transport(
        `${config.url}/storage/v1/object/${bucket}/${key}`,
        {
          ...init,
          headers: { ...headers, ...init.headers },
          redirect: "error",
          cache: "no-store",
          signal: AbortSignal.timeout(25_000),
        },
      );
    } catch {
      return fail("staging_attachment_service_unavailable", 503);
    }
  };
  const read = async (
    companyId: string,
    attachment: StoredStagingAttachment,
  ) => {
    const key = keyFor(companyId, attachment);
    const response = await request(key, { method: "GET" });
    if (!response.ok)
      fail(
        response.status === 404
          ? "staging_attachment_not_found"
          : "staging_attachment_service_unavailable",
        response.status === 404 ? 404 : 503,
      );
    const reader =
      response.body?.getReader() ||
      fail("staging_attachment_service_unavailable", 503);
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > maximumBytes) {
          await reader.cancel();
          fail("staging_attachment_integrity_failed", 503);
        }
        chunks.push(part.value);
      }
    } catch {
      fail("staging_attachment_integrity_failed", 503);
    }
    const bytes = Buffer.concat(chunks);
    try {
      validateBytes(bytes, attachment.mime, attachment.size);
    } catch {
      fail("staging_attachment_integrity_failed", 503);
    }
    if (hash(bytes) !== key.split("/")[1].split(".")[0])
      fail("staging_attachment_integrity_failed", 503);
    return {
      bytes: new Uint8Array(bytes),
      mime: attachment.mime,
      name: attachment.name,
    };
  };
  const store = async (
    companyId: string,
    input: ReviewAttachment,
  ): Promise<StoredStagingAttachment> => {
    const prefix = companyPrefix(companyId);
    metadata(input);
    if (typeof input.data !== "string" || input.data.length > 2_800_100) fail();
    const data = input.data.startsWith("data:")
      ? input.data.replace(new RegExp(`^data:${input.mime};base64,`), "")
      : input.data;
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) fail();
    const bytes = Buffer.from(data, "base64");
    if (bytes.toString("base64").replace(/=+$/, "") !== data.replace(/=+$/, ""))
      fail();
    validateBytes(bytes, input.mime, input.size);
    const storageObjectKey = `${prefix}/${hash(bytes)}.${extensions[input.mime]}`;
    const stored: StoredStagingAttachment = {
      id: input.id,
      name: input.name,
      mime: input.mime,
      size: bytes.length,
      data: "",
      storageObjectKey,
    };
    const response = await request(storageObjectKey, {
      method: "POST",
      headers: {
        "Content-Type": input.mime,
        "x-upsert": "false",
        "Cache-Control": "private, no-store",
      },
      body: new Uint8Array(bytes),
    });
    if (!response.ok) {
      // Duplicate/concurrent retries are safe only if existing immutable bytes match.
      // No server error body is read: it may contain confidential object metadata.
      if (![400, 409].includes(response.status))
        fail("staging_attachment_service_unavailable", 503);
      await read(companyId, stored);
    }
    return stored;
  };
  return { store, read };
}
export const storePrivateAttachment = (
  companyId: string,
  input: ReviewAttachment,
) => createPrivateAttachmentStorage(stagingConfig()).store(companyId, input);
export const readPrivateAttachment = (
  companyId: string,
  input: StoredStagingAttachment,
) => createPrivateAttachmentStorage(stagingConfig()).read(companyId, input);
