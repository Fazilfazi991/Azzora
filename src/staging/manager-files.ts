/** Private Manager originals using the same bucket and validated storage adapter. */
import type { Attachment, Database } from "../domain/model.js";
import type { SharedActor, SharedCompanyState } from "./domain.js";
import { sharedManagerView } from "./domain.js";
import { StagingServiceError } from "./supabase.js";
import {
  storePrivateAttachment,
  readPrivateAttachment,
  type StoredStagingAttachment,
} from "./storage.js";
type PrivateFile = Attachment & { storageObjectKey?: string };
type Reference = { file: PrivateFile; owner: string };
export function managerFileReferences(db: Database): Reference[] {
  const files: Reference[] = [];
  function walk(value: unknown, owner = "company") {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item, owner);
      return;
    }
    const row = value as Record<string, unknown>;
    if (
      typeof row.id === "string" &&
      typeof row.name === "string" &&
      typeof row.type === "string" &&
      typeof row.size === "number" &&
      ("dataUrl" in row || "storageObjectKey" in row)
    ) {
      files.push({ file: row as unknown as PrivateFile, owner });
      return;
    }
    const context = typeof row.id === "string" ? row.id : owner;
    for (const [key, item] of Object.entries(row))
      if (key !== "history" && key !== "canonicalSnapshots")
        walk(item, context);
  }
  walk(db);
  return files;
}
const same = (a: PrivateFile, b: PrivateFile) =>
  a.id === b.id &&
  a.name === b.name &&
  a.type === b.type &&
  a.size === b.size &&
  a.dataUrl === b.dataUrl &&
  a.storageObjectKey === b.storageObjectKey;
export async function prepareManagerFiles(
  previous: SharedCompanyState,
  next: SharedCompanyState,
  actor: SharedActor,
  store = storePrivateAttachment,
) {
  const before = managerFileReferences(previous.manager);
  const allowed = managerFileReferences(sharedManagerView(previous, actor));
  const saved = new Map<string, { pointer: PrivateFile; original: string }>();
  for (const { file, owner } of managerFileReferences(next.manager)) {
    const original = before.find(
      (v) => v.owner === owner && v.file.id === file.id,
    )?.file;
    if (original && same(original, file)) continue;
    if (!file.dataUrl?.startsWith("data:")) {
      if (!allowed.some((v) => same(v.file, file)))
        throw new StagingServiceError(
          403,
          "staging_attachment_reference_denied",
        );
      continue;
    }
    if (original || file.storageObjectKey)
      throw new StagingServiceError(400, "staging_original_is_immutable");
    if (!["application/pdf", "image/png", "image/jpeg"].includes(file.type))
      throw new StagingServiceError(400, "staging_attachment_type_unsupported");
    if (saved.has(file.id)) {
      const { pointer: other, original: raw } = saved.get(file.id)!;
      if (
        raw !== file.dataUrl ||
        other.name !== file.name ||
        other.size !== file.size ||
        other.type !== file.type
      )
        throw new StagingServiceError(400, "staging_attachment_id_conflict");
      Object.assign(file, other);
      continue;
    }
    const persisted = await store(actor.companyId, {
      id: file.id,
      name: file.name,
      mime: file.type as StoredStagingAttachment["mime"],
      size: file.size,
      data: file.dataUrl,
    });
    const pointer = {
      ...file,
      storageObjectKey: persisted.storageObjectKey,
      dataUrl: `/api/staging/files/${encodeURIComponent(file.id)}`,
    };
    saved.set(file.id, { pointer, original: file.dataUrl });
    Object.assign(file, pointer);
  }
}
export function permittedManagerFile(
  state: SharedCompanyState,
  actor: SharedActor,
  id: string,
): StoredStagingAttachment | undefined {
  const refs = managerFileReferences(sharedManagerView(state, actor)).filter(
    (v) => v.file.id === id && v.file.storageObjectKey,
  );
  if (!refs.length) return;
  if (new Set(refs.map((v) => v.file.storageObjectKey)).size !== 1)
    throw new StagingServiceError(409, "staging_attachment_id_conflict");
  const file = refs[0].file;
  return {
    id: file.id,
    name: file.name,
    mime: file.type as StoredStagingAttachment["mime"],
    size: file.size,
    data: "",
    storageObjectKey: file.storageObjectKey!,
  };
}
export async function readManagerFile(
  state: SharedCompanyState,
  actor: SharedActor,
  id: string,
  read = readPrivateAttachment,
) {
  const file = permittedManagerFile(state, actor, id);
  if (!file) throw new StagingServiceError(404, "staging_attachment_not_found");
  return read(actor.companyId, file);
}
