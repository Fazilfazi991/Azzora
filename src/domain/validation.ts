import { z } from "zod";
import type { Database } from "./model";

const text = z.string(),
  id = text.min(1),
  number = z.number().finite();
const money = text.regex(/^-?\d+(?:\.\d+)?$/),
  integerMoney = text.regex(/^-?\d+$/);
const entity = (shape: z.ZodRawShape) =>
  z.object({ id, ...shape }).passthrough();
const attachment = entity({
  name: text,
  type: text,
  size: number.nonnegative(),
  category: text,
  dataUrl: text.optional(),
});
const attachments = z.array(attachment);
const history = z
  .array(
    entity({
      action: text,
      actorId: text,
      actorName: text,
      timestamp: text,
      reason: text,
      previous: text.optional(),
    }),
  )
  .optional();
const priceLine = entity({
  description: text,
  quantity: money,
  rate: money,
  tax: z.enum(["Exclusive", "Inclusive", "Zero Rated", "Exempt"]),
});
const company = z
  .object({ name: text, location: text, email: text, phone: text })
  .passthrough();
const sequence = z
  .object({ prefix: text, next: number.int().nonnegative() })
  .passthrough();
const baseSchemas = {
  people: entity({
    name: text,
    role: text,
    email: text,
    phone: text,
    status: z.enum(["Active", "Away", "Inactive"]),
    capacity: number.positive(),
    history,
  }),
  clients: entity({
    name: text,
    contact: text,
    contacts: z
      .array(entity({ name: text, phone: text, email: text, role: text }))
      .optional(),
  }),
  projects: entity({
    code: text,
    name: text,
    clientId: id,
    managerId: text,
    start: text,
    due: text,
    value: number,
    area: number,
    location: text,
    scope: text,
    disciplines: z.array(text),
    status: z.enum(["Active", "Draft", "On Hold", "Completed"]),
  }),
  phases: entity({ projectId: id, name: text, weight: number, order: number }),
  assignments: entity({
    projectId: id,
    personId: id,
    role: text,
    start: text,
    end: text,
    responsibility: text,
    status: z.enum(["Active", "Removed", "Replaced"]),
  }),
  tasks: entity({
    projectId: id,
    phaseId: id,
    name: text,
    description: text,
    assigneeId: text,
    start: text,
    due: text,
    progress: number,
    allocation: number,
    dependencies: z.array(id),
    attachments,
    comments: z.array(entity({ authorId: text, text, createdAt: text })),
    status: z.enum([
      "Not Started",
      "In Progress",
      "Waiting",
      "Blocked",
      "Completed",
    ]),
  }),
  milestones: entity({ projectId: id, taskId: text, name: text, due: text }),
  updates: entity({
    projectId: id,
    date: text,
    completed: text,
    inProgress: text,
    issue: text,
    tomorrow: text,
    manpower: number,
    notes: text,
    authorId: text,
    photos: attachments,
    history,
  }),
  snags: entity({
    projectId: id,
    reference: text,
    area: text,
    description: text,
    assigneeId: text,
    createdBy: text,
    due: text,
    inspection: text,
    before: attachments,
    after: attachments,
    history,
    status: z.enum([
      "Open",
      "Assigned",
      "Rectification",
      "Ready for Inspection",
      "Closed",
    ]),
  }),
  documents: entity({
    projectId: id,
    name: text,
    category: text,
    status: z.enum(["Draft", "Pending", "Rejected", "Approved"]),
    version: number.int().positive(),
    uploadedAt: text,
    uploadedBy: text,
    attachment: attachment.optional(),
    history,
    reviewState: z
      .enum(["Draft", "Submitted", "Approved", "Revise & Resubmit"])
      .optional(),
    workflowVersion: z.literal(1).optional(),
    reviewerId: text.optional(),
    submittedBy: text.optional(),
    submittedAt: text.optional(),
  }),
  handover: entity({
    projectId: id,
    group: text,
    name: text,
    required: z.boolean(),
    applicable: z.boolean(),
    complete: z.boolean(),
  }),
  activities: entity({
    actorId: text,
    action: text,
    entityType: text,
    entityId: text,
    projectId: text,
    timestamp: text,
    summary: text,
    previous: text.optional(),
  }),
};
const quotation = entity({
  familyId: id,
  number: text,
  date: text,
  revision: number,
  status: text,
  customerId: text,
  projectId: text,
  customer: z
    .object({
      name: text,
      contact: text,
      address: text,
      email: text,
      phone: text,
    })
    .passthrough(),
  project: z.object({ name: text, location: text }).passthrough(),
  company,
  revisionDetails: z.object({ date: text, notes: text }).passthrough(),
  introduction: z
    .object({
      attention: text,
      opening: text,
      proposal: text,
      quality: text,
      clarification: text,
      closing: text,
      signature: text,
    })
    .passthrough(),
  vatEnabled: z.boolean(),
  vatPercentage: money,
  sections: z.array(
    entity({
      number: text,
      title: text,
      rows: z.array(
        entity({
          number: text,
          description: text,
          location: text,
          quantity: text,
          unit: text,
          rate: text,
          pricingType: text,
          notes: text,
        }),
      ),
    }),
  ),
  payments: z.array(
    entity({ number: text, description: text, percentage: money, notes: text }),
  ),
  terms: z.array(entity({ number: text, text })),
  history: z.array(
    z
      .object({
        date: text,
        action: text,
        notes: text,
        snapshot: text.optional(),
      })
      .passthrough(),
  ),
});
const commercialSchemas = {
  invoices: entity({
    number: text,
    customerId: id,
    projectId: text,
    quotationId: text,
    milestoneId: text,
    date: text,
    due: text,
    description: text,
    lines: z.array(priceLine),
    discount: money,
    vatPercentage: money,
    terms: text,
    notes: text,
    status: z.enum(["Draft", "Issued", "Cancelled"]),
    snapshot: z
      .object({
        company,
        customer: z.object({ name: text }).passthrough(),
        project: text,
        quotation: text,
        subtotal: integerMoney,
        discount: integerMoney,
        net: integerMoney,
        vat: integerMoney,
        grand: integerMoney,
      })
      .passthrough()
      .optional(),
  }),
  payments: entity({
    number: text,
    invoiceId: id,
    customerId: id,
    projectId: text,
    date: text,
    amount: money,
    method: text,
    reference: text,
    bank: text,
    notes: text,
    attachments,
    postingKey: text,
  }),
  expenses: entity({
    reference: text,
    projectId: id,
    category: text,
    supplier: text,
    date: text,
    description: text,
    amount: money,
    vat: money,
    paidAmount: money,
    method: text,
    attachments,
  }),
  contracts: entity({
    quotationId: id,
    familyId: id,
    customerId: id,
    projectId: id,
    net: integerMoney,
    vat: integerMoney,
    gross: integerMoney,
    quotationSnapshot: text,
    paymentTerms: text,
  }),
};
const quantities = z.array(
  z.object({ itemId: id, quantity: money }).passthrough(),
);
const opSchemas = {
  suppliers: entity({
    code: text,
    name: text,
    contact: text,
    phone: text,
    email: text,
    address: text,
    status: z.enum(["Active", "Archived"]),
  }),
  variations: entity({
    familyId: id,
    contractId: id,
    projectId: id,
    customerId: id,
    title: text,
    status: text,
    items: z.array(priceLine),
    discount: money,
    vatPercentage: money,
  }),
  materials: entity({
    projectId: id,
    name: text,
    unit: text,
    quantity: money,
    requesterId: id,
  }),
  requests: entity({
    projectId: id,
    materialIds: z.array(id),
    requesterId: id,
    status: text,
  }),
  rfqs: entity({
    projectId: id,
    requestId: id,
    supplierId: id,
    items: z.array(priceLine),
    status: text,
  }),
  quotes: entity({
    projectId: id,
    rfqId: id,
    supplierId: id,
    items: z.array(priceLine),
    deliveryCharge: money,
    vatPercentage: money,
    status: text,
  }),
  orders: entity({
    projectId: id,
    quoteId: id,
    supplierId: id,
    items: z.array(priceLine),
    deliveryCharge: money,
    vatPercentage: money,
    status: text,
  }),
  deliveries: entity({
    projectId: id,
    poId: id,
    receiverId: id,
    quantities,
    date: text,
  }),
  bills: entity({
    projectId: id,
    poId: id,
    supplierId: id,
    quantities,
    net: integerMoney,
    vat: integerMoney,
    gross: integerMoney,
    status: text,
    snapshot: text,
  }),
  supplierPayments: entity({
    projectId: id,
    billId: id,
    supplierId: id,
    amount: money,
    date: text,
  }),
  credits: entity({
    projectId: text,
    invoiceId: id,
    customerId: id,
    gross: money,
    itemId: text,
    status: text,
  }),
  refunds: entity({
    projectId: text,
    invoiceId: id,
    customerId: id,
    amount: money,
    date: text,
  }),
  budgets: entity({
    projectId: id,
    remainingEstimate: money,
    lines: z.array(
      entity({
        category: text,
        phaseId: text,
        original: money,
        revised: money,
      }),
    ),
  }),
  approvals: entity({
    kind: z.enum([
      "Variation",
      "Purchase Request",
      "Supplier Quotation",
      "Purchase Order",
      "Credit Note",
      "Document",
    ]),
    entityId: id,
    projectId: id,
    stage: text,
    requesterId: id,
    approverId: id,
    submittedAt: text,
    status: z.enum(["Pending Approval", "Approved", "Rejected"]),
    snapshot: text,
  }),
};
function check(schema: z.ZodTypeAny, value: unknown, label: string) {
  const result = schema.safeParse(value);
  if (!result.success)
    throw Error(
      `Saved data is incompatible at ${label}.${result.error.issues[0]?.path.join(".") || "value"}. Export the original data before recovery.`,
    );
}
export function validateSavedShape(value: unknown): asserts value is Database {
  check(z.object({ version: z.literal(1) }).passthrough(), value, "database");
  const v = value as Record<string, unknown>;
  for (const [key, schema] of Object.entries(baseSchemas))
    check(z.array(schema), v[key], key);
  if (v.commercialVersion !== undefined && v.commercialVersion !== 1)
    throw Error("Unsupported commercial data version.");
  for (const [key, schema] of Object.entries(commercialSchemas)) {
    if (v.commercialVersion === 1 || v[key] !== undefined)
      check(z.array(schema), v[key], key);
  }
  if (v.quotations !== undefined) {
    check(z.array(quotation), v.quotations, "quotations");
    check(sequence, v.quotationNumbering, "quotationNumbering");
  }
  if (v.commercialNumbering !== undefined)
    check(
      z.object({
        customer: number.int().nonnegative(),
        invoice: number.int().nonnegative(),
        receipt: number.int().nonnegative(),
        expense: number.int().nonnegative(),
      }),
      v.commercialNumbering,
      "commercialNumbering",
    );
  if (v.operations !== undefined) {
    check(
      z.object({ version: z.literal(1) }).passthrough(),
      v.operations,
      "operations",
    );
    const op = v.operations as Record<string, unknown>;
    for (const [key, schema] of Object.entries(opSchemas))
      check(z.array(schema), op[key], `operations.${key}`);
    check(
      z.array(
        z
          .object({
            projectId: id,
            date: text,
            actorId: id,
            notes: text,
            snapshot: text,
          })
          .passthrough(),
      ),
      op.closures,
      "operations.closures",
    );
    check(
      z
        .object({
          company,
          currency: z.literal("AED"),
          vatPercentage: money,
          tax: text,
          fiscalYearStart: text,
          paymentDays: number,
          blockOperationalForFinance: z.boolean(),
          retentionPercentage: money,
          numbering: z.object(
            Object.fromEntries(
              [
                "variation",
                "po",
                "credit",
                "supplier",
                "material",
                "request",
                "rfq",
                "quote",
                "delivery",
                "bill",
                "supplierPayment",
                "refund",
              ].map((k) => [k, sequence]),
            ),
          ),
        })
        .passthrough(),
      op.settings,
      "operations.settings",
    );
  }
}

export function validateRelationships(db: Database) {
  const all = { ...db, ...db.operations };
  const index = new Map<string, Set<string>>();
  for (const [key, value] of Object.entries(all)) {
    if (!Array.isArray(value) || key === "closures") continue;
    const ids = (value as { id: string }[]).map((v) => v.id);
    if (new Set(ids).size !== ids.length)
      throw Error(`Duplicate record IDs in ${key}.`);
    index.set(key, new Set(ids));
  }
  const ref = (collection: string, field: string, target: string) => {
    for (const row of (
      all as unknown as Record<string, Record<string, unknown>[]>
    )[collection] || []) {
      const key = row[field];
      if (key && !index.get(target)?.has(key as string))
        throw Error(
          `Saved ${collection}.${field} refers to a missing ${target} record.`,
        );
    }
  };
  for (const key of [
    "phases",
    "assignments",
    "tasks",
    "milestones",
    "updates",
    "snags",
    "documents",
    "handover",
    "invoices",
    "payments",
    "expenses",
    "contracts",
    "variations",
    "materials",
    "requests",
    "rfqs",
    "quotes",
    "orders",
    "deliveries",
    "bills",
    "supplierPayments",
    "credits",
    "refunds",
    "budgets",
    "approvals",
    "closures",
  ])
    ref(key, "projectId", "projects");
  for (const [collection, field] of [
    ["projects", "managerId"],
    ["assignments", "personId"],
    ["tasks", "assigneeId"],
    ["updates", "authorId"],
    ["documents", "uploadedBy"],
    ["documents", "reviewerId"],
    ["snags", "assigneeId"],
    ["approvals", "requesterId"],
    ["approvals", "approverId"],
  ])
    ref(collection, field, "people");
  ref("projects", "clientId", "clients");
  ref("tasks", "phaseId", "phases");
  ref("tasks", "parentId", "tasks");
  ref("milestones", "taskId", "tasks");
  ref("documents", "previousRevisionId", "documents");
  ref("documents", "revisionOf", "documents");
  for (const c of [
    "quotations",
    "invoices",
    "payments",
    "contracts",
    "variations",
    "credits",
    "refunds",
  ])
    ref(c, "customerId", "clients");
  for (const c of ["payments", "credits", "refunds"])
    ref(c, "invoiceId", "invoices");
  ref("invoices", "quotationId", "quotations");
  ref("contracts", "quotationId", "quotations");
  ref("variations", "contractId", "contracts");
  for (const c of ["rfqs", "quotes", "orders", "bills", "supplierPayments"])
    ref(c, "supplierId", "suppliers");
  ref("rfqs", "requestId", "requests");
  ref("quotes", "rfqId", "rfqs");
  ref("orders", "quoteId", "quotes");
  ref("deliveries", "poId", "orders");
  ref("bills", "poId", "orders");
  ref("supplierPayments", "billId", "bills");
  ref("expenses", "supplierBillId", "bills");
  for (const t of db.tasks) {
    if (
      !db.phases.some(
        (p) => p.id === t.phaseId && p.projectId === t.projectId,
      ) ||
      t.dependencies.some(
        (id) =>
          !db.tasks.some((x) => x.id === id && x.projectId === t.projectId),
      )
    )
      throw Error(
        "Saved task relationships cross projects or reference missing records.",
      );
  }
  for (const d of db.documents) {
    if (d.workflowVersion && d.reviewState) {
      const canonical = {
        Draft: "Draft",
        Submitted: "Pending",
        Approved: "Approved",
        "Revise & Resubmit": "Rejected",
      }[d.reviewState];
      if (canonical !== d.status)
        throw Error("Saved document approval states conflict.");
    }
    if (
      d.previousRevisionId &&
      !db.documents.some(
        (p) =>
          p.id === d.previousRevisionId &&
          p.projectId === d.projectId &&
          (p.familyId || p.id) === (d.familyId || d.id) &&
          p.version < d.version,
      )
    )
      throw Error("Saved document revision relationships are incompatible.");
  }
  for (const i of db.invoices)
    if (
      i.projectId &&
      !db.projects.some(
        (p) => p.id === i.projectId && p.clientId === i.customerId,
      )
    )
      throw Error(
        "Saved invoice customer/project relationship is incompatible.",
      );
  for (const i of db.invoices)
    if (i.status === "Issued" && !i.snapshot)
      throw Error("Saved issued invoice is missing its immutable snapshot.");
  for (const v of db.operations?.variations || [])
    if (
      v.status === "Approved" &&
      [v.net, v.vat, v.gross].some(
        (n) => typeof n !== "string" || !/^-?\d+$/.test(n),
      )
    )
      throw Error(
        "Saved approved variation has an incompatible monetary snapshot.",
      );
  for (const c of db.operations?.credits || [])
    if (
      c.status === "Issued" &&
      [c.net, c.vat].some((n) => typeof n !== "string" || !/^-?\d+$/.test(n))
    )
      throw Error(
        "Saved issued credit note has an incompatible monetary snapshot.",
      );
  for (const p of db.payments)
    if (
      !db.invoices.some(
        (i) =>
          i.id === p.invoiceId &&
          i.customerId === p.customerId &&
          i.projectId === p.projectId,
      )
    )
      throw Error("Saved payment allocation is incompatible.");
  for (const c of db.contracts) {
    try {
      const q = JSON.parse(c.quotationSnapshot);
      if (!q || typeof q !== "object" || !Array.isArray(q.payments))
        throw Error();
    } catch {
      throw Error("Saved accepted contract snapshot is unreadable.");
    }
  }
  const approvalTargets = {
    Variation: "variations",
    "Purchase Request": "requests",
    "Supplier Quotation": "quotes",
    "Purchase Order": "orders",
    "Credit Note": "credits",
    Document: "documents",
  };
  for (const a of db.operations?.approvals || []) {
    const target = approvalTargets[a.kind];
    if (!index.get(target)?.has(a.entityId))
      throw Error("Saved approval refers to a missing source record.");
    const record = (
      all as unknown as Record<string, { id: string; projectId: string }[]>
    )[target].find((x) => x.id === a.entityId)!;
    if (record.projectId !== a.projectId)
      throw Error("Saved approval source belongs to a different project.");
  }
  const revisionKeys = db.documents.map(
    (d) => `${d.projectId}:${d.familyId || d.id}:${d.version}`,
  );
  if (new Set(revisionKeys).size !== revisionKeys.length)
    throw Error("Saved document family contains duplicate revisions.");
}
