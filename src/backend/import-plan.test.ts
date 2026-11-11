import { afterAll, beforeAll, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import {
  prepareImportReview,
  verifyImportReview,
  approveImportReview,
  stageApprovedImport,
  type ImportSource,
  type ImportApproval,
} from "./import-plan";
import {
  createImportQueueRepository,
  type ImportSqlConnection,
  type ImportSqlDatabase,
} from "./import-repository";
const company = "22222222-2222-4222-8222-222222222222",
  owner = "33333333-3333-4333-8333-333333333333",
  accountant = "44444444-4444-4444-8444-444444444444";
function source(n = 1): ImportSource {
  return {
    companyId: company,
    sourceId: "fixture-" + n,
    dataClass: "synthetic-rehearsal",
    cutoverDate: "2026-11-11",
    originalUtf8:
      ' {"fixture":"SYNTHETIC IMPORT ' + n + '","preserveSpacing":true} \n',
    rows: [
      {
        kind: "customer",
        sourceId: "customer-source",
        preservedId: "C-001",
        payload: { name: "Fictional Customer" },
      },
      {
        kind: "supplier",
        sourceId: "supplier-source",
        preservedId: "S-001",
        payload: { name: "Fictional Supplier" },
      },
      {
        kind: "project",
        sourceId: "project-source",
        preservedId: "P-001",
        partyId: "C-001",
        payload: { name: "Fictional Project" },
      },
      {
        kind: "sales-invoice",
        sourceId: "invoice-source",
        preservedId: "INV-ID",
        documentNumber: "INV-001",
        partyId: "C-001",
        projectId: "P-001",
        date: "2026-11-01",
        outstandingFils: "10000",
        payload: { issuedSnapshot: "  ORIGINAL ISSUED SNAPSHOT  " },
      },
      {
        kind: "supplier-bill",
        sourceId: "bill-source",
        preservedId: "BILL-ID",
        documentNumber: "SUP-001",
        partyId: "S-001",
        projectId: "P-001",
        date: "2026-11-01",
        outstandingFils: "6000",
        payload: { revisionHistory: [{ number: 1, note: "original" }] },
      },
      {
        kind: "bank",
        sourceId: "bank-source",
        preservedId: "BANK-ID",
        accountId: "bank-main",
        balanceFils: "4000",
        payload: { name: "Fictional Bank" },
      },
      {
        kind: "cash",
        sourceId: "cash-source",
        preservedId: "CASH-ID",
        accountId: "office-cash",
        balanceFils: "1000",
        payload: { name: "Fictional Cash" },
      },
      {
        kind: "petty-cash",
        sourceId: "petty-source",
        preservedId: "THOMAS-CASH",
        accountId: "staff-cash",
        balanceFils: "1000",
        payload: { name: "Thomas Cash — synthetic fixture" },
      },
      {
        kind: "opening-balance",
        sourceId: "opening-debit",
        preservedId: "OPEN-DR",
        accountId: "opening-assets",
        debitFils: "16000",
        payload: {},
      },
      {
        kind: "opening-balance",
        sourceId: "opening-credit",
        preservedId: "OPEN-CR",
        accountId: "opening-liabilities-equity",
        creditFils: "16000",
        payload: {},
      },
      {
        kind: "historical-quotation",
        sourceId: "quotation-source",
        preservedId: "Q-ID",
        documentNumber: "Q-001",
        payload: { snapshot: '{ "immutable": true, "boq": [1,2] }' },
      },
      {
        kind: "historical-document",
        sourceId: "document-source",
        preservedId: "DOC-ID",
        payload: {
          originalSha256: "a".repeat(64),
          originalName: "fictional-original.pdf",
        },
      },
    ],
  };
}
function approved(n = 1) {
  const review = prepareImportReview(source(n));
  const approvals: ImportApproval[] = [
    {
      role: "owner",
      userId: owner,
      companyId: company,
      reviewSha256: review.sha256,
      approvedAt: "2026-11-11T00:00:00.000Z",
      evidenceReference: "QA-ONLY-OWNER-APPROVAL",
      controls: review.controls,
    },
    {
      role: "accountant",
      userId: accountant,
      companyId: company,
      reviewSha256: review.sha256,
      approvedAt: "2026-11-11T00:00:00.000Z",
      evidenceReference: "QA-ONLY-ACCOUNTANT-APPROVAL",
      controls: review.controls,
    },
  ];
  return approveImportReview(review, approvals, {
    companyId: company,
    manifestSha256: "b".repeat(64),
    verifiedAt: "2026-11-11T00:00:00.000Z",
  });
}
it("preserves every original byte, ID, document number/history and deterministic integer-fils controls without posting", () => {
  const s = source(),
    before = structuredClone(s),
    r = prepareImportReview(s);
  expect(s).toEqual(before);
  expect(r.originalUtf8).toBe(s.originalUtf8);
  expect(r.issues).toEqual([]);
  expect(r.rows[3].documentNumber).toBe("INV-001");
  expect(r.rows[3].payload.issuedSnapshot).toBe("  ORIGINAL ISSUED SNAPSHOT  ");
  expect(r.controls).toEqual({
    salesOutstandingFils: "10000",
    supplierOutstandingFils: "6000",
    bankFils: "4000",
    cashFils: "1000",
    pettyCashFils: "1000",
    openingDebitsFils: "16000",
    openingCreditsFils: "16000",
  });
  expect(r.financialPostingAllowed).toBe(false);
  expect(r.publication).toBe("quarantined");
  expect(verifyImportReview(r)).toEqual(r);
});
it("does not guess absent balances, unresolved mappings, duplicate IDs/references or an opening difference", () => {
  const s = source();
  delete s.rows[5].balanceFils;
  s.rows[3].partyId = "MISSING";
  s.rows[9].creditFils = "15000";
  s.rows.push({
    ...s.rows[3],
    sourceId: "different-source",
    preservedId: "different-id",
  });
  s.rows.push(s.rows[0]);
  const r = prepareImportReview(s);
  expect(r.issues.map((i) => i.code)).toEqual(
    expect.arrayContaining([
      "missing-balance",
      "missing-party",
      "duplicate-id",
      "duplicate-document-number",
      "opening-unbalanced",
    ]),
  );
  expect(() =>
    approveImportReview(r, [], {
      companyId: company,
      manifestSha256: "b".repeat(64),
      verifiedAt: "2026-11-11T00:00:00Z",
    }),
  ).toThrow(/reconciliation/);
});
it("rejects credential-bearing data, invalid monetary types and any hash/control/original tampering", () => {
  const s = source();
  s.rows[0].payload.password = "not-a-real-password";
  expect(() => prepareImportReview(s)).toThrow(/Credentials/);
  s.rows[0].payload = {};
  s.rows[3].outstandingFils = "1.25";
  expect(() => prepareImportReview(s)).toThrow();
  const r = prepareImportReview(source());
  for (const changed of [
    { ...r, originalUtf8: r.originalUtf8 + " " },
    { ...r, controls: { ...r.controls, bankFils: "0" } },
    { ...r, publication: "published" },
  ])
    expect(() => verifyImportReview(changed as typeof r)).toThrow(/integrity/);
});
it("requires independent exact-company owner/accountant approvals and verified backup evidence", () => {
  const p = approved();
  expect(p.financialPostingAllowed).toBe(false);
  for (const receipts of [
    [],
    [p.approvals[0]],
    p.approvals.map((a) => ({ ...a, userId: owner })),
    p.approvals.map((a) => ({ ...a, reviewSha256: "c".repeat(64) })),
  ])
    expect(() => approveImportReview(p.review, receipts, p.backup)).toThrow();
  expect(() =>
    approveImportReview(p.review, p.approvals, {
      ...p.backup,
      companyId: accountant,
    }),
  ).toThrow(/backup/);
});
let db: PGlite;
let environment: "synthetic-rehearsal" | "production" = "synthetic-rehearsal";
const database: ImportSqlDatabase = {
  transaction: (execute) =>
    db.transaction((connection) =>
      execute(connection as unknown as ImportSqlConnection),
    ),
};
const repository = () =>
  createImportQueueRepository(database, async (connection) => {
    const m = (
      await connection.query<{ role: string; active: boolean }>(
        "select role,active from azzora.memberships where company_id=$1 and user_id=$2",
        [company, owner],
      )
    ).rows[0];
    return {
      userId: owner,
      companyId: company,
      assurance: "aal2",
      active: Boolean(m?.active),
      role: m?.role === "owner_admin" ? "owner" : m?.role || "none",
      environment,
    };
  });
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid,user_id uuid,not_after timestamptz);create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;`,
  );
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20261104081228_canonical_backend_foundation.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    "alter table azzora.companies add column version bigint not null default 0",
  );
  await db.query("insert into auth.users values($1)", [owner]);
  await db.query(
    "insert into azzora.companies(id,name) values($1,'ISOLATED IMPORT QA ONLY')",
    [company],
  );
  await db.query(
    "insert into azzora.memberships(company_id,user_id,role,active) values($1,$2,'owner_admin',true)",
    [company, owner],
  );
}, 30000);
afterAll(async () => db?.close());
it("stages one approved batch in the existing canonical SQL tables; an idempotent retry is actor bound", async () => {
  const request = {
    batchId: "BATCH-1",
    expectedVersion: 0,
    idempotencyKey: "qa-import-once-00001",
    package: approved(),
  };
  const results = await Promise.all([
    stageApprovedImport(repository(), request),
    stageApprovedImport(repository(), request),
  ]);
  expect(results.map((r) => r.replayed).sort()).toEqual([false, true]);
  const row = (
    await db.query<{ status: string; manifest: unknown }>(
      "select status,manifest from azzora.migration_batches",
    )
  ).rows[0];
  expect(row.status).toBe("approved");
  expect(row.manifest).toEqual(request.package);
  for (const t of ["journals", "records", "parties", "projects", "accounts"])
    expect(
      (await db.query<{ n: number }>(`select count(*)::int n from azzora.${t}`))
        .rows[0].n,
    ).toBe(0);
  expect(
    (
      await db.query<{ n: number }>(
        "select count(*)::int n from azzora.audit_events",
      )
    ).rows[0].n,
  ).toBe(1);
});
it("two competing versioned imports cannot both commit and no stale package is silently retried", async () => {
  const results = await Promise.allSettled(
    [2, 3].map((n) =>
      stageApprovedImport(repository(), {
        batchId: "BATCH-" + n,
        expectedVersion: 1,
        idempotencyKey: "qa-competing-import-0000" + n,
        package: approved(n),
      }),
    ),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  expect(
    (
      await db.query<{ version: number }>(
        "select version from azzora.companies",
      )
    ).rows[0].version,
  ).toBe(2);
});
it("interruption between queue and receipt rolls back source package, audit, receipt and target version", async () => {
  const broken: ImportSqlDatabase = {
    transaction: (execute) =>
      db.transaction((connection) =>
        execute({
          query: async <T>(sql: string, values?: unknown[]) => {
            if (sql.startsWith("insert into azzora.command_receipts"))
              throw Error("Controlled interrupted write");
            return connection.query<T>(sql, values);
          },
        }),
      ),
  };
  const repo = createImportQueueRepository(broken, async () => ({
    userId: owner,
    companyId: company,
    assurance: "aal2",
    active: true,
    role: "owner",
    environment: "synthetic-rehearsal",
  }));
  await expect(
    stageApprovedImport(repo, {
      batchId: "INTERRUPTED",
      expectedVersion: 2,
      idempotencyKey: "qa-interrupted-import-00001",
      package: approved(4),
    }),
  ).rejects.toThrow(/interrupted/);
  expect(
    (
      await db.query<{ n: number }>(
        "select count(*)::int n from azzora.migration_batches where id='INTERRUPTED'",
      )
    ).rows[0].n,
  ).toBe(0);
  expect(
    (
      await db.query<{ version: number }>(
        "select version from azzora.companies",
      )
    ).rows[0].version,
  ).toBe(2);
});
it("production rejects synthetic queues; revoked/incorrect roles cannot stage even approved data", async () => {
  environment = "production";
  await expect(
    stageApprovedImport(repository(), {
      batchId: "FORBIDDEN",
      expectedVersion: 2,
      idempotencyKey: "qa-production-synthetic-00001",
      package: approved(5),
    }),
  ).rejects.toThrow(/Synthetic data/);
  environment = "synthetic-rehearsal";
  await db.query("update azzora.memberships set active=false");
  await expect(
    stageApprovedImport(repository(), {
      batchId: "FORBIDDEN",
      expectedVersion: 2,
      idempotencyKey: "qa-revoked-import-00001",
      package: approved(5),
    }),
  ).rejects.toThrow(/authorized Owner/);
});
