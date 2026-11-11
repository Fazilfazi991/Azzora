/** Authentication of non-sensitive backup status; does not itself verify a backup or restore. */
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const payloadSchema = z
  .object({
    archiveBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    archiveFileId: z.string().regex(/^[A-Za-z0-9_-]{10,200}$/),
    archiveMd5: z.string().regex(/^[0-9a-f]{32}$/),
    archiveSha256: z.string().regex(/^[0-9a-f]{64}$/),
    capturedAt: z.iso.datetime(),
    complete: z.literal(true),
    completedAt: z.iso.datetime(),
    dataDump: z.literal(true),
    format: z.literal("azzora-backup-status-v1"),
    objectCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    projectRef: z.string().regex(/^[a-z0-9]{20}$/),
    rolesDump: z.literal(true),
    runId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
    schemaDump: z.literal(true),
  })
  .strict()
  .refine(
    (value) => Date.parse(value.completedAt) >= Date.parse(value.capturedAt),
    {
      message: "Completion cannot precede capture.",
    },
  );

export type FullBackupStatusPayload = z.infer<typeof payloadSchema>;

/** Flat scalar keys sorted lexicographically, UTF-8 JSON without whitespace. */
export function canonicalFreeBackupStatus(payload: unknown): string {
  const parsed = payloadSchema.parse(payload);
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(parsed).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    ),
  );
}

function authenticate(payload: string, key: Uint8Array): Buffer {
  if (key.byteLength !== 32)
    throw Error("A separate 32-byte monitor key is required.");
  return createHmac("sha256", key).update(payload, "utf8").digest();
}

/** Only a separately verified full database-and-object capture should call this. */
export function signFreeBackupStatus(payload: unknown, key: Uint8Array) {
  const canonical = canonicalFreeBackupStatus(payload);
  return {
    payload: JSON.parse(canonical) as FullBackupStatusPayload,
    mac: authenticate(canonical, key).toString("hex"),
  };
}

export function verifyFreeBackupStatus(
  input: unknown,
  key: Uint8Array,
): FullBackupStatusPayload {
  const wrapper = z
    .object({ payload: payloadSchema, mac: z.string().regex(/^[0-9a-f]{64}$/) })
    .strict()
    .parse(input);
  const expected = authenticate(
    canonicalFreeBackupStatus(wrapper.payload),
    key,
  );
  if (!timingSafeEqual(expected, Buffer.from(wrapper.mac, "hex")))
    throw Error("Backup status authentication failed.");
  return wrapper.payload;
}
