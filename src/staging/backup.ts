/** Server-only fictional business export. No live restore endpoint or identity export. */
import { createHash } from "node:crypto";
import { hydrateCanonical, type CanonicalData } from "./canonical.js";
import { buildBalanceSheet, buildTrialBalance } from "../accounting/reports.js";
import type { StoredStagingAttachment } from "./storage.js";

const format = "azzora-fictional-staging-business-backup" as const;
const productionFormat = "azzora-production-business-backup" as const;
const maximumOriginalBytes = 2_000_000;
const maximumTotalOriginalBytes = 64 * 1024 * 1024;
const mimeExtensions = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
} as const;
type BackupCounts = Record<
  keyof CanonicalData | "journalLines" | "originals" | "allocations",
  number
>;
export interface StagingBackup {
  format: typeof format;
  schemaVersion: 1;
  mode: "fictional-staging";
  warning: string;
  capturedAt: string;
  companyId?: string;
  capturedCompanyVersion: number;
  data: CanonicalData;
  originals: {
    objectKey: string;
    mime: StoredStagingAttachment["mime"];
    size: number;
    sha256: string;
    references: { id: string; name: string }[];
    base64: string;
  }[];
  manifest: {
    canonicalSha256: string;
    counts: BackupCounts;
    originalsSha256: string;
    manifestSha256: string;
  };
}
export interface ProductionBusinessBackup extends Omit<
  StagingBackup,
  "format" | "mode"
> {
  format: typeof productionFormat;
  mode: "production";
}
export type BusinessBackup = StagingBackup | ProductionBusinessBackup;
export type ReadBackupOriginal = (
  file: StoredStagingAttachment,
) => Promise<Uint8Array | { bytes: Uint8Array }>;
const invalid = (message: string): never => {
  throw Error(`Business backup rejected: ${message}`);
};
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return invalid("expected an object");
  return value as Record<string, unknown>;
};
export function stableBackupJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const json = JSON.stringify(value);
    if (json === undefined) return invalid("non-JSON data");
    return json;
  }
  if (Array.isArray(value)) return `[${value.map(stableBackupJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableBackupJson((value as Record<string, unknown>)[key])}`,
    )
    .join(",")}}`;
}
const sha = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const jsonSha = (value: unknown) => sha(stableBackupJson(value));
/** Registry order can vary with PostgreSQL collation. Entity payload/history array order is preserved. */
export function canonicalBusinessSha256(data: CanonicalData): string {
  const ordered = <T>(values: T[], key: (value: T) => string) =>
    [...values].sort((a, b) =>
      key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0,
    );
  return jsonSha({
    ...data,
    parties: ordered(data.parties, (value) => value.id),
    projects: ordered(data.projects, (value) => value.id),
    departments: ordered(data.departments, (value) => value.id),
    records: ordered(data.records, (value) =>
      JSON.stringify([value.entity_type, value.id]),
    ),
    accounts: ordered(data.accounts, (value) => value.id),
    periods: ordered(data.periods, (value) => value.id),
    journals: ordered(
      data.journals.map((value) => ({
        ...value,
        recorded_at: new Date(value.recorded_at).toISOString(),
        lines: [...value.lines].sort((a, b) => a.line_no - b.line_no),
      })),
      (value) => `${value.recorded_at}:${value.id}`,
    ),
    snapshots: ordered(data.snapshots, (value) =>
      JSON.stringify([value.entity_type, value.entity_id, value.revision]),
    ),
  });
}
function verifyOriginalSignature(
  bytes: Uint8Array,
  mime: StoredStagingAttachment["mime"],
) {
  const signature =
    mime === "application/pdf"
      ? [37, 80, 68, 70, 45]
      : mime === "image/png"
        ? [137, 80, 78, 71, 13, 10, 26, 10]
        : [255, 216, 255];
  if (!signature.every((byte, index) => bytes[index] === byte))
    invalid("original content does not match its MIME type");
}
function noCredentials(value: unknown) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach(noCredentials);
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (
      /^(?:password|passwordHash|apiKey|serviceKey|secret|access_token|accessToken|refresh_token|refreshToken|cookie|cookies|csrf|csrfHash|sessionHash|sessionId|providerSessionId|totpSecret|token|tokens|auth|authUsers|authSessions|credentials)$/i.test(
        key,
      )
    )
      invalid("identity or credential fields are prohibited");
    noCredentials(item);
  }
}
function privateReferences(data: CanonicalData, companyId?: string) {
  const historicalInline: {
    id: string;
    name: string;
    mime: string;
    size: number;
    digest: string;
  }[] = [];
  const files = new Map<
    string,
    {
      file: StoredStagingAttachment;
      references: { id: string; name: string }[];
    }
  >();
  function walk(value: unknown, historical = false, field = "") {
    if (
      typeof value === "string" &&
      value.startsWith("{") &&
      value.length < 4_000_000
    ) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch {
        return;
      }
      walk(parsed, historical || field === "snapshot");
      return;
    }
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, historical));
      return;
    }
    const row = value as Record<string, unknown>;
    if (
      typeof row.id === "string" &&
      typeof row.name === "string" &&
      typeof row.size === "number" &&
      (row.mime || row.type) &&
      ((typeof row.data === "string" && row.data) ||
        (typeof row.dataUrl === "string" && row.dataUrl.startsWith("data:")))
    ) {
      if (!historical)
        invalid(
          "inline originals must be stored privately before business export",
        );
      const mime = String(row.mime || row.type),
        raw = String(row.data || row.dataUrl);
      const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(raw);
      if (!match || match[1] !== mime || !Object.hasOwn(mimeExtensions, mime))
        invalid("historical original MIME is invalid");
      const bytes = Buffer.from(match![2], "base64");
      if (
        bytes.length !== row.size ||
        bytes.length <= 0 ||
        bytes.length > maximumOriginalBytes ||
        bytes.toString("base64") !== match![2]
      )
        invalid("historical original size or encoding is invalid");
      verifyOriginalSignature(bytes, mime as StoredStagingAttachment["mime"]);
      historicalInline.push({
        id: String(row.id),
        name: String(row.name),
        mime,
        size: bytes.length,
        digest: sha(bytes),
      });
    }
    if (row.storageObjectKey !== undefined) {
      const key = row.storageObjectKey,
        mime = row.mime || row.type;
      if (
        typeof key !== "string" ||
        !/^[0-9a-f-]{36}\/[0-9a-f]{64}\.(pdf|png|jpg)$/.test(key) ||
        (companyId && !key.startsWith(`${companyId}/`)) ||
        typeof mime !== "string" ||
        !Object.hasOwn(mimeExtensions, mime) ||
        !key.endsWith(
          `.${mimeExtensions[mime as keyof typeof mimeExtensions]}`,
        ) ||
        typeof row.id !== "string" ||
        !row.id ||
        typeof row.name !== "string" ||
        !Number.isSafeInteger(row.size) ||
        Number(row.size) <= 0 ||
        Number(row.size) > maximumOriginalBytes
      )
        invalid("invalid or cross-company private original reference");
      const typedKey = key as string,
        file: StoredStagingAttachment = {
          id: row.id as string,
          name: row.name as string,
          mime: mime as StoredStagingAttachment["mime"],
          size: Number(row.size),
          data: "",
          storageObjectKey: typedKey,
        };
      const previous = files.get(typedKey);
      if (
        previous &&
        (previous.file.mime !== file.mime || previous.file.size !== file.size)
      )
        invalid("conflicting original metadata");
      const entry = previous || { file, references: [] };
      if (
        !entry.references.some(
          (ref) => ref.id === file.id && ref.name === file.name,
        )
      )
        entry.references.push({ id: file.id, name: file.name });
      files.set(typedKey, entry);
    }
    for (const [key, item] of Object.entries(row))
      if (!/^(?:base64|data|dataUrl)$/.test(key)) walk(item, historical, key);
  }
  walk(data);
  for (const inline of historicalInline) {
    const found = [...files.values()].find(
      (entry) =>
        entry.references.some((ref) => ref.id === inline.id) &&
        entry.file.mime === inline.mime &&
        entry.file.size === inline.size &&
        entry.file.storageObjectKey.split("/")[1].split(".")[0] ===
          inline.digest,
    );
    if (!found)
      return invalid(
        "historical original has no matching private pointer and content hash",
      );
    if (
      !found.references.some(
        (ref) => ref.id === inline.id && ref.name === inline.name,
      )
    )
      found.references.push({ id: inline.id, name: inline.name });
  }
  if (new Set([...files.keys()].map((key) => key.split("/")[0])).size > 1)
    invalid("multiple company prefixes");
  return [...files.values()].sort((a, b) =>
    a.file.storageObjectKey.localeCompare(b.file.storageObjectKey),
  );
}
function canonicalCounts(
  data: CanonicalData,
  originalCount: number,
): BackupCounts {
  const counts = {} as BackupCounts;
  for (const key of [
    "parties",
    "projects",
    "departments",
    "records",
    "accounts",
    "periods",
    "journals",
    "snapshots",
  ] as const) {
    if (!Array.isArray(data[key])) invalid(`missing canonical ${key}`);
    counts[key] = data[key].length;
  }
  counts.journalLines = data.journals.reduce(
    (total, journal) => total + journal.lines.length,
    0,
  );
  counts.originals = originalCount;
  counts.allocations = data.records
    .filter((value) =>
      ["receipt", "supplier_payment"].includes(value.entity_type),
    )
    .reduce((total, value) => {
      const event = value.payload.finance as
        { type?: string; allocations?: unknown[] } | undefined;
      return (
        total +
        (event?.type === "posted" && Array.isArray(event.allocations)
          ? event.allocations.length
          : 0)
      );
    }, 0);
  return counts;
}
function validateCanonical(
  data: CanonicalData,
  mode: "fictional-staging" | "production" = "fictional-staging",
) {
  if (
    Object.keys(object(data)).some(
      (key) =>
        ![
          "parties",
          "projects",
          "departments",
          "records",
          "accounts",
          "periods",
          "journals",
          "snapshots",
        ].includes(key),
    )
  )
    invalid("unexpected canonical section");
  noCredentials(data);
  const state = hydrateCanonical(data);
  if (state.mode !== mode)
    invalid("backup mode does not match the canonical company");
  const sources = new Set(
    data.records.map((record) =>
      JSON.stringify([record.entity_type, record.id]),
    ),
  );
  for (const journal of data.journals)
    if (!sources.has(JSON.stringify([journal.source_type, journal.source_id])))
      invalid("journal source is missing");
  for (const snapshot of data.snapshots) {
    if (
      !sources.has(
        JSON.stringify([snapshot.entity_type, snapshot.entity_id]),
      ) ||
      snapshot.sha256 !== jsonSha(snapshot.payload)
    )
      invalid("immutable snapshot hash or source is invalid");
  }
  const asOf = [
    "2020-01-01",
    ...data.journals.map((journal) => journal.posting_date),
  ]
    .sort()
    .at(-1)!;
  if (
    !buildTrialBalance(state.finance.accounting, asOf).balanced ||
    !buildBalanceSheet(state.finance.accounting, asOf).balanced
  )
    invalid("journal statements do not balance");
  return state;
}
function manifestHash(
  backup: Omit<BusinessBackup, "manifest">,
  canonicalSha256: string,
  counts: BackupCounts,
  originalsSha256: string,
) {
  return jsonSha({
    format: backup.format,
    schemaVersion: backup.schemaVersion,
    mode: backup.mode,
    warning: backup.warning,
    capturedAt: backup.capturedAt,
    companyId: backup.companyId || null,
    capturedCompanyVersion: backup.capturedCompanyVersion,
    canonicalSha256,
    counts,
    originalsSha256,
  });
}

/** Authorization belongs to the BFF: current Owner, AAL2 and access.manage only. */
async function createBusinessBackup(
  source: { version: number; data: CanonicalData; companyId?: string },
  readOriginal: ReadBackupOriginal,
  capturedAt: string,
  mode: "fictional-staging" | "production",
): Promise<BusinessBackup> {
  if (!Number.isSafeInteger(source.version) || source.version < 1)
    invalid("invalid company version");
  if (!Number.isFinite(Date.parse(capturedAt))) invalid("invalid capture time");
  if (source.companyId && !/^[0-9a-f-]{36}$/.test(source.companyId))
    invalid("invalid company scope");
  if (
    mode === "production" &&
    (!source.companyId ||
      source.companyId === "11111111-1111-4111-8111-111111111111")
  )
    invalid("explicit separate production company scope is required");
  validateCanonical(source.data, mode);
  const refs = privateReferences(source.data, source.companyId),
    originals: StagingBackup["originals"] = [];
  if (
    refs.reduce((total, entry) => total + entry.file.size, 0) >
    maximumTotalOriginalBytes
  )
    invalid(
      "fictional export exceeds the reviewed 64 MiB limit; no partial export was created",
    );
  for (const entry of refs) {
    const result = await readOriginal(entry.file),
      bytes = result instanceof Uint8Array ? result : result.bytes;
    const digest = sha(bytes);
    if (
      bytes.length !== entry.file.size ||
      digest !== entry.file.storageObjectKey.split("/")[1].split(".")[0]
    )
      invalid("private original hash or size differs");
    verifyOriginalSignature(bytes, entry.file.mime);
    originals.push({
      objectKey: entry.file.storageObjectKey,
      mime: entry.file.mime,
      size: bytes.length,
      sha256: digest,
      references: entry.references.sort(
        (a, b) => a.id.localeCompare(b.id) || a.name.localeCompare(b.name),
      ),
      base64: Buffer.from(bytes).toString("base64"),
    });
  }
  const backup: Omit<BusinessBackup, "manifest"> = {
    format: mode === "production" ? productionFormat : format,
    schemaVersion: 1,
    mode,
    warning:
      mode === "production"
        ? "PRIVATE PRODUCTION BUSINESS DATA. Encrypt with the owner-managed backup key; exclude from Git and public storage. Excludes Auth/security infrastructure; not a PITR or offsite-backup service."
        : "FICTIONAL TEST BUSINESS DATA ONLY. Plaintext export; exclude from Git and protect offline. Not a production accounting backup or identity recovery package.",
    capturedAt,
    ...(source.companyId ? { companyId: source.companyId } : {}),
    capturedCompanyVersion: source.version,
    data: structuredClone(source.data),
    originals,
  };
  const canonicalSha256 = jsonSha(backup.data),
    counts = canonicalCounts(backup.data, originals.length),
    originalsSha256 = jsonSha(originals);
  return {
    ...backup,
    manifest: {
      canonicalSha256,
      counts,
      originalsSha256,
      manifestSha256: manifestHash(
        backup,
        canonicalSha256,
        counts,
        originalsSha256,
      ),
    },
  } as BusinessBackup;
}

/** Offline integrity validation; never connects to, resets or restores a cloud database. */
function verifyBusinessBackup(
  value: unknown,
  mode: "fictional-staging" | "production",
): BusinessBackup {
  const row = object(value);
  if (
    Object.keys(row).some(
      (key) =>
        ![
          "format",
          "schemaVersion",
          "mode",
          "warning",
          "capturedAt",
          "companyId",
          "capturedCompanyVersion",
          "data",
          "originals",
          "manifest",
        ].includes(key),
    )
  )
    invalid("unexpected export section");
  if (
    row.format !== (mode === "production" ? productionFormat : format) ||
    row.schemaVersion !== 1 ||
    row.mode !== mode ||
    typeof row.warning !== "string" ||
    !row.warning.startsWith(
      mode === "production" ? "PRIVATE PRODUCTION" : "FICTIONAL TEST",
    ) ||
    typeof row.capturedAt !== "string" ||
    !Number.isFinite(Date.parse(row.capturedAt)) ||
    !Number.isSafeInteger(row.capturedCompanyVersion) ||
    Number(row.capturedCompanyVersion) < 1 ||
    !Array.isArray(row.originals)
  )
    invalid("unsupported format, scope, version or capture time");
  if (
    mode === "production" &&
    (typeof row.companyId !== "string" ||
      !/^[0-9a-f-]{36}$/.test(row.companyId) ||
      row.companyId === "11111111-1111-4111-8111-111111111111")
  )
    invalid("explicit separate production company scope is required");
  noCredentials(row);
  const backup = structuredClone(value) as BusinessBackup;
  const refs = privateReferences(backup.data, backup.companyId);
  if (backup.originals.length !== refs.length)
    invalid("missing or duplicate originals");
  let bytesTotal = 0;
  for (const [index, original] of backup.originals.entries()) {
    if (
      typeof original.base64 !== "string" ||
      original.base64.length > 2_800_000 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(original.base64)
    )
      invalid("invalid original encoding");
    const bytes = Buffer.from(original.base64, "base64"),
      reference = refs[index];
    verifyOriginalSignature(bytes, original.mime);
    bytesTotal += bytes.length;
    if (
      original.objectKey !== reference.file.storageObjectKey ||
      original.mime !== reference.file.mime ||
      original.size !== reference.file.size ||
      bytes.length !== original.size ||
      sha(bytes) !== original.sha256 ||
      !original.objectKey.includes(`/${original.sha256}.`) ||
      stableBackupJson(original.references) !==
        stableBackupJson(
          reference.references.sort(
            (a, b) => a.id.localeCompare(b.id) || a.name.localeCompare(b.name),
          ),
        )
    )
      invalid("original manifest or content differs");
  }
  if (bytesTotal > maximumTotalOriginalBytes)
    invalid("original size limit exceeded");
  const manifest = object(backup.manifest),
    canonicalSha256 = jsonSha(backup.data),
    counts = canonicalCounts(backup.data, backup.originals.length),
    originalsSha256 = jsonSha(backup.originals);
  if (
    manifest.canonicalSha256 !== canonicalSha256 ||
    manifest.originalsSha256 !== originalsSha256 ||
    stableBackupJson(manifest.counts) !== stableBackupJson(counts) ||
    manifest.manifestSha256 !==
      manifestHash(backup, canonicalSha256, counts, originalsSha256)
  )
    invalid("integrity manifest differs");
  validateCanonical(backup.data, mode);
  return backup;
}

/** Retained staging-only API. Production archives cannot pass this verifier. */
export async function createStagingBackup(
  source: { version: number; data: CanonicalData; companyId?: string },
  readOriginal: ReadBackupOriginal,
  capturedAt = new Date().toISOString(),
): Promise<StagingBackup> {
  return (await createBusinessBackup(
    source,
    readOriginal,
    capturedAt,
    "fictional-staging",
  )) as StagingBackup;
}
export function verifyStagingBackup(value: unknown): StagingBackup {
  return verifyBusinessBackup(value, "fictional-staging") as StagingBackup;
}
/** Production capture validates explicit production canonical metadata; never relabels staging data. */
export async function createProductionBusinessBackup(
  source: { version: number; data: CanonicalData; companyId: string },
  readOriginal: ReadBackupOriginal,
  capturedAt = new Date().toISOString(),
): Promise<ProductionBusinessBackup> {
  return (await createBusinessBackup(
    source,
    readOriginal,
    capturedAt,
    "production",
  )) as ProductionBusinessBackup;
}
export function verifyProductionBusinessBackup(
  value: unknown,
): ProductionBusinessBackup {
  return verifyBusinessBackup(value, "production") as ProductionBusinessBackup;
}
