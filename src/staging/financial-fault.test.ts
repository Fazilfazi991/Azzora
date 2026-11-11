import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Person } from "../domain/model";
import { blankCustomer } from "../commercial/customer-domain";
import { newProjectDetails } from "../commercial/repository";
import { blankLine } from "../quotation/repository";
import {
  applySharedCommand,
  createSharedCompanyState,
  type SharedActor,
} from "./domain";
import { serializeCanonical } from "./canonical";

const people: Person[] = [
  ["owner", "Owner", "Owner"],
  ["pm", "Project Manager", "Project Manager"],
  ["accountant", "Accountant", "Accounts"],
  ["staff", "Site Engineer", "Site"],
].map(([id, role, demoRole]) => ({
  id,
  name: `Fictional ${id}`,
  role,
  demoRole,
  email: `${id}@staging.test`,
  phone: "",
  status: "Active",
  capacity: 100,
}));
const actor = (id: string): SharedActor => ({
  userId: id,
  personId: id,
  companyId: "fictional",
  sessionId: `${id}-session`,
  assurance: ["owner", "accountant"].includes(id) ? "aal2" : "aal1",
  grant: {
    userId: id,
    companyId: "fictional",
    active: true,
    roles: [
      id === "owner"
        ? "owner"
        : id === "pm"
          ? "project_manager"
          : id === "staff"
            ? "site_staff"
            : "accountant",
    ],
    workspaces:
      id === "accountant"
        ? ["accountant"]
        : id === "owner"
          ? ["manager", "accountant"]
          : ["manager"],
    projectIds: ["p1"],
    capabilities: [
      "project.read",
      "project.write",
      "expense.submit",
      "expense.approve",
      "finance.read",
      "finance.draft",
      "finance.simulate",
    ],
  },
});
function fixture() {
  let state = createSharedCompanyState(people);
  const run = (kind: string, payload: unknown, user = actor("owner")) => {
    state = applySharedCommand(state, { kind, payload }, user);
    return state;
  };
  const customer = {
    ...blankCustomer(),
    id: "c1",
    name: "Fictional Client",
    contact: "Fictional contact",
  };
  run("customer.save", { customer });
  const project = {
    ...newProjectDetails(
      state.manager,
      "c1",
      "Fictional fitout",
      "Fictional Dubai site",
    ),
    id: "p1",
    managerId: "pm",
  };
  run("project.create", { project, standard: false, planMode: "empty" });
  return { run, state: () => state };
}
function sale(f = fixture()) {
  f.run("quotation.new", { projectId: "p1" });
  const quote = structuredClone(f.state().manager.quotations[0]);
  quote.sections = [
    {
      id: "scope",
      number: "1",
      title: "Fictional scope",
      rows: [
        {
          ...blankLine("1.1"),
          id: "item",
          description: "Fictional installation",
          quantity: "2",
          rate: "500",
          unit: "each",
        },
      ],
    },
  ];
  quote.vatEnabled = false;
  quote.payments = [
    {
      id: "full",
      number: "1",
      description: "Complete fictional scope",
      percentage: "100",
      notes: "",
    },
  ];
  f.run("quotation.save", { quotation: quote, validate: true });
  for (const status of ["Finalized", "Sent", "Accepted"])
    f.run("quotation.status", { id: quote.id, status });
  f.run("quotation.convert", { quotationId: quote.id, projectId: "p1" });
  f.run("invoice.from-quotation", { quotationId: quote.id });
  const invoice = f.state().manager.invoices[0];
  f.run("invoice.issue", { id: invoice.id });
  return { ...f, invoiceId: invoice.id, quotationId: quote.id };
}
function purchase(f = fixture()) {
  f.run("supplier.save", {
    supplier: {
      id: "supplier",
      code: "",
      name: "Fictional Supplier",
      contact: "",
      phone: "",
      whatsapp: "",
      email: "",
      address: "",
      emirate: "",
      country: "",
      trn: "",
      bank: "",
      category: "",
      terms: "",
      notes: "",
      status: "Active",
      createdAt: "2026-11-04T00:00:00.000Z",
    },
  });
  f.run("procurement.material", {
    entity: {
      id: "material",
      number: "",
      projectId: "p1",
      name: "Fictional material",
      specification: "",
      unit: "each",
      quantity: "2",
      requiredDate: "2026-11-04",
      requesterId: "owner",
      priority: "Normal",
      notes: "",
      attachments: [],
    },
  });
  f.run("procurement.request", {
    entity: {
      id: "request",
      number: "",
      projectId: "p1",
      materialIds: ["material"],
      requesterId: "owner",
      date: "2026-11-04",
      notes: "",
      status: "Draft",
    },
  });
  const approve = (kind: string, entityId: string) => {
    f.run("procurement.submit", {
      kind,
      entityId,
      stage: "Internal",
      approverId: "pm",
    });
    const approvalId = f.state().manager.operations!.approvals.at(-1)!.id;
    f.run(
      "procurement.decide",
      {
        approvalId,
        approved: true,
        comments: "Fictional independent approval",
      },
      actor("pm"),
    );
  };
  approve("Purchase Request", "request");
  f.run("procurement.rfqs", {
    requestId: "request",
    supplierIds: ["supplier"],
    deliveryDate: "2026-11-04",
    deadline: "2026-11-04",
  });
  const rfq = f.state().manager.operations!.rfqs[0];
  f.run("procurement.quote", {
    entity: {
      id: "supplier-quote",
      number: "",
      rfqId: rfq.id,
      projectId: "p1",
      supplierId: "supplier",
      items: rfq.items.map((item) => ({
        ...item,
        rate: "50",
        tax: "Zero Rated",
      })),
      deliveryCharge: "0",
      vatPercentage: "0",
      leadDays: 0,
      terms: "Fictional",
      remarks: "",
      status: "Received",
    },
  });
  approve("Supplier Quotation", "supplier-quote");
  f.run("procurement.order", {
    supplierQuoteId: "supplier-quote",
    location: "Fictional project",
    date: "2026-11-04",
  });
  const po = f.state().manager.operations!.orders[0];
  approve("Purchase Order", po.id);
  f.run("procurement.delivery", {
    delivery: {
      id: "delivery",
      number: "",
      poId: po.id,
      projectId: "p1",
      date: "2026-11-04",
      quantities: po.items.map((item) => ({ itemId: item.id, quantity: "2" })),
      receiverId: "owner",
      reference: "FICT-GRN-1",
      remarks: "",
    },
  });
  f.run("procurement.bill", {
    bill: {
      id: "bill",
      reference: "FICT-BILL-1",
      poId: po.id,
      projectId: "p1",
      supplierId: "supplier",
      date: "2026-11-04",
      due: "2026-11-30",
      quantities: po.items.map((item) => ({ itemId: item.id, quantity: "2" })),
      deliveryCharge: "0",
      status: "Issued",
    },
  });
  return f;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-04T12:00:00.000Z"));
});
afterEach(() => vi.useRealTimers());
it("rolls back real settlement commands when journal insertion fails", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { readdir, readFile } = await import("node:fs/promises");
  const db = new PGlite();
  const company = "11111111-1111-4111-8111-111111111111";
  const owner = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const session = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const hash = "a".repeat(64);
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb,email_confirmed_at timestamptz,banned_until timestamptz,is_anonymous boolean default false);
      create table auth.sessions(id uuid primary key,user_id uuid,aal text,not_after timestamptz);
      create table auth.mfa_factors(id uuid primary key,user_id uuid,status text,factor_type text);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
    for (const name of (await readdir(new URL("../../supabase/migrations/", import.meta.url))).filter(n => n.endsWith(".sql")).sort())
      await db.exec(await readFile(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8"));
    await db.query("insert into auth.users(id,email,raw_app_meta_data,email_confirmed_at) values($1,'owner@staging.azzora.test','{\"azzora_scope\":\"fictional-staging\"}',now())", [owner]);
    await db.query("insert into auth.sessions values($1,$2,'aal2',now()+interval '1 day')", [session,owner]);
    await db.query("insert into auth.mfa_factors values('dddddddd-dddd-4ddd-8ddd-dddddddddddd',$1,'verified','totp')", [owner]);
    await db.query("select public.staging_auth_fixture_membership($1,$2,'owner_admin')", [owner,company]);
    await db.query("select public.staging_auth_session_put($1,$2,$3,$4,$5,'manager','aal2','encrypted-unit-fixture')", [hash,"b".repeat(64),owner,session,company]);
    const saleFixture = sale();
    const f = purchase(saleFixture);
    const base = f.state();
    const commit = async (version: number, key: string, value: ReturnType<typeof serializeCanonical>, boot = false) => db.query(
      "select public.staging_company_commit($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)",
      [hash,version,key,"b".repeat(64),boot ? "fixture.initialize" : "accounts.action",JSON.stringify({workspace:"manager",financial:!boot}),JSON.stringify(value),boot]);
    await commit(0,"fixture-init-fault-00001",serializeCanonical(base),true);
    const original = (await db.query<{ data: unknown }>(
      "select azzora.staging_canonical_data($1) data", [company])).rows[0].data;
    await db.exec(`create function public.test_fail_financial_journal() returns trigger language plpgsql as $$begin
      if new.source_type in ('receipt','supplier_payment') then raise exception 'injected journal insertion failure'; end if;
      return new; end$$;
      create trigger test_fail_financial_journal before insert on azzora.journals for each row execute function public.test_fail_financial_journal();`);
    for (const [kind, documentId] of [["receipt", saleFixture.invoiceId],["supplier-payment", "bill"]] as const) {
      const id = `fault-actual-${kind}`;
      const after = applySharedCommand(base, {kind:"accounts.action",payload:{action:{kind,id,documentId,date:"2026-11-04",amount:"1",account:"bank",reference:id}}}, actor("accountant"));
      await expect(commit(1,`fault-actual-${kind}-00001`,serializeCanonical(after))).rejects.toThrow("injected journal insertion failure");
      const rows = await db.query<{ records: number; journals: number; allocations: number; version: number }>(`select
        (select count(*)::int from azzora.records where id=$1) records,
        (select count(*)::int from azzora.journals where source_id=$1) journals,
        (select count(*)::int from azzora.allocations where settlement_id=$1) allocations,
        (select version::int from azzora.companies where id=$2) version`,[id,company]);
      expect(rows.rows[0]).toEqual({ records:0,journals:0,allocations:0,version:1 });
      const restored = (await db.query<{ data: unknown }>(
        "select azzora.staging_canonical_data($1) data", [company])).rows[0].data;
      expect(restored).toEqual(original);
    }
  } finally { await db.close(); }
}, 120_000);
