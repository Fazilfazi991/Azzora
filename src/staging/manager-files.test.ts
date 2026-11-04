import { expect, it, vi } from "vitest";
import {
  managerFileReferences,
  prepareManagerFiles,
  permittedManagerFile,
} from "./manager-files";
import { createSharedCompanyState, type SharedActor } from "./domain";
import type { DocumentRecord } from "../domain/model";
const company = "11111111-1111-4111-8111-111111111111";
const actor: SharedActor = {
  userId: "pm",
  companyId: company,
  sessionId: "s",
  assurance: "aal1",
  grant: {
    userId: "pm",
    companyId: company,
    active: true,
    roles: ["project_manager"],
    workspaces: ["manager"],
    projectIds: ["p"],
    capabilities: ["project.read", "project.write"],
  },
};
const file = {
  id: "file",
  name: "Fictional.png",
  size: 8,
  type: "image/png",
  dataUrl: "data:image/png;base64,iVBORw0KGgo=",
  category: "Progress",
};
const key = company + "/" + "a".repeat(64) + ".png";
function fixture() {
  const s = createSharedCompanyState();
  s.manager.projects = [
    { id: "p", clientId: "c" },
    { id: "q", clientId: "d" },
  ] as typeof s.manager.projects;
  return s;
}
const doc = (
  id: string,
  projectId: string,
  attachment: typeof file & { storageObjectKey?: string },
) =>
  ({
    id,
    projectId,
    attachment,
    status: "Draft",
    history: [],
  }) as unknown as DocumentRecord;
it("stores originals once and replaces inline bytes with protected references", async () => {
  const previous = fixture(),
    next = structuredClone(previous);
  next.manager.documents = [doc("doc", "p", { ...file })];
  const store = vi.fn(async () => ({
    id: file.id,
    name: file.name,
    mime: "image/png" as const,
    size: file.size,
    data: "",
    storageObjectKey: key,
  }));
  await prepareManagerFiles(previous, next, actor, store);
  expect(store).toHaveBeenCalledTimes(1);
  expect(next.manager.documents[0].attachment?.dataUrl).toBe(
    "/api/staging/files/file",
  );
  expect(JSON.stringify(next.manager)).not.toContain("iVBORw0KGgo=");
  expect(permittedManagerFile(next, actor, "file")?.storageObjectKey).toBe(key);
});
it("denies cross-project original lookup and forged reference copies", async () => {
  const previous = fixture(),
    pointer = {
      ...file,
      dataUrl: "/api/staging/files/file",
      storageObjectKey: key,
    };
  previous.manager.documents = [doc("private", "q", pointer)];
  expect(permittedManagerFile(previous, actor, "file")).toBeUndefined();
  const next = structuredClone(previous);
  next.manager.documents.push(doc("forged", "p", pointer));
  const store = vi.fn();
  await expect(
    prepareManagerFiles(previous, next, actor, store),
  ).rejects.toThrow("reference_denied");
  expect(store).not.toHaveBeenCalled();
});
it("retains unchanged inaccessible originals but never replaces an original under the same ID", async () => {
  const previous = fixture();
  previous.manager.documents = [
    doc("private", "q", {
      ...file,
      dataUrl: "/api/staging/files/file",
      storageObjectKey: key,
    }),
  ];
  await expect(
    prepareManagerFiles(previous, structuredClone(previous), actor, vi.fn()),
  ).resolves.toBeUndefined();
  const next = structuredClone(previous);
  next.manager.documents[0].attachment = { ...file };
  await expect(
    prepareManagerFiles(previous, next, actor, vi.fn()),
  ).rejects.toThrow("immutable");
  expect(managerFileReferences(previous.manager)).toHaveLength(1);
});
it("rejects conflicting new contents under one attachment ID", async () => {
  const previous = fixture(),
    next = structuredClone(previous);
  next.manager.documents = [
    doc("first", "p", { ...file }),
    doc("second", "p", {
      ...file,
      dataUrl: "data:image/png;base64,BBBBBBBBBBB=",
    }),
  ];
  const store = vi.fn(async () => ({
    id: file.id,
    name: file.name,
    mime: "image/png" as const,
    size: file.size,
    data: "",
    storageObjectKey: key,
  }));
  await expect(
    prepareManagerFiles(previous, next, actor, store),
  ).rejects.toThrow("id_conflict");
  expect(store).toHaveBeenCalledTimes(1);
});
