import { z } from "zod";
import type { Database } from "./model";
import { validateFinanceDemoState } from "../accounting/persistence";

const text = z.string(),
  id = text.min(1),
  number = z.number().finite();
const money = text.regex(/^-?\d+(?:\.\d+)?$/),
  integerMoney = text.regex(/^-?\d+$/);
const postedInteger = text.regex(/^\d+$/);
const invoiceAllocation = z
  .object({
    itemId: id,
    tax: z.enum(["Exclusive", "Inclusive", "Zero Rated", "Exempt"]),
    subtotal: postedInteger,
    discount: postedInteger,
    net: postedInteger,
    vat: postedInteger,
    grand: postedInteger,
  })
  .passthrough();
const creditAllocation = z
  .object({
    itemId: id,
    net: postedInteger,
    vat: postedInteger,
    gross: postedInteger,
  })
  .passthrough();
const entity = (shape: z.ZodRawShape) =>
  z.object({ id, ...shape }).passthrough();
const attachment = entity({
  name: text,
  type: text,
  size: number.nonnegative(),
  category: text,
  dataUrl: text.optional(),
});
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
});
const planningNode = z.object({ kind: z.enum(["task", "milestone"]), id });
const planningCalendar = z.object({
  timezone: id,
  workingWeekdays: z.array(z.number().int().min(1).max(7)).min(1),
  workdayStart: text.regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  workdayEnd: text.regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  holidays: z.array(localDate),
  projectNonworkingDates: z.array(localDate),
});
const planningLink = z.object({
  id, projectId: id, predecessor: planningNode, successor: planningNode,
  type: z.enum(["FS", "SS", "FF", "SF"]), lagWorkingDays: z.number().int(), createdAt: text,
});
const planningDates = z.object({ start: localDate, finish: localDate,
  durationWorkingDays: z.number().int().nonnegative() });
const planningIssue = z.object({ code: id, detail: text, node: planningNode.optional() });
const planningTask = z.object({ taskId: id, durationWorkingDays: z.number().int().positive(),
  scheduleRole: z.enum(["work", "summary"]), durationNeedsReview: z.boolean().optional(),
  startNoEarlierThan: localDate.optional(), finishNoLaterThan: localDate.optional(),
  lockedStart: localDate.optional(), lockedFinish: localDate.optional(),
  actualStart: localDate.optional(), actualFinish: localDate.optional(),
  explicitProgressWeight: z.number().finite().positive().optional(),
  assigneeIds: z.array(id).optional(), requiredInspectionIds: z.array(id).optional(),
  progressHistory: z.array(z.object({ id, taskId: id, date: localDate, actorId: id,
    percent: z.number().min(0).max(100), notes: text, evidenceRefs: z.array(id), createdAt: text })).optional(),
});
const milestoneCondition = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("Manual") }),
  z.object({ kind: z.literal("TaskComplete"), taskId: id }),
  z.object({ kind: z.literal("DocumentApproved"), documentId: id }),
  z.object({ kind: z.literal("QAApproved"), referenceId: id }),
]);
const planningMilestone = z.object({ milestoneId: id, requiredDate: localDate.optional(),
  actualDate: localDate.optional(), completionCondition: milestoneCondition,
  completedAt: text.optional(), completedBy: id.optional() });
const planningSnapshot = z.object({ id, revision: z.number().int().positive(), capturedAt: text,
  actorId: id, reason: text, calendar: planningCalendar,
  nodes: z.array(z.object({ node: planningNode }).merge(planningDates)), links: z.array(planningLink), finish: localDate });
const planningProposal = z.object({ id, projectId: id, revision: z.number().int().positive(),
  revisedByProposalId: id.optional(),
  status: z.enum(["Draft", "Submitted", "Approved", "Rejected"]),
  sourceApprovedRevision: z.number().int().nonnegative(), sourceFingerprint: id,
  initiatingNode: planningNode, reason: text, initiatedBy: id,
  submittedAt: text.optional(), submittedBy: id.optional(), decidedAt: text.optional(),
  decidedBy: id.optional(), decisionReason: text.optional(),
  changes: z.array(z.object({ node: planningNode, before: planningDates,
    after: planningDates, cause: z.enum(["direct", "indirect"]) })),
  unchangedSuccessors: z.array(planningNode), proposedLinks: z.array(planningLink).optional(),
  proposedCalendar: planningCalendar.optional(), proposedTaskPlanning: z.array(planningTask).optional(),
  proposedMilestonePlanning: z.array(planningMilestone).optional(),
  proposedTask: z.object({ id, projectId: id, phaseId: id, name: id,
    start: localDate, due: localDate, dependencies: z.array(id) }).passthrough().optional(),
  proposedMilestone: z.object({ id, projectId: id, name: id, due: localDate, taskId: text }).passthrough().optional(),
  requestedEdit: z.object({ start: localDate.optional(), finish: localDate.optional(),
    milestoneDate: localDate.optional(), durationWorkingDays: z.number().int().nonnegative().optional(),
    links: z.array(planningLink).optional(), calendar: planningCalendar.optional(),
    taskPlanning: z.array(planningTask).optional(), milestonePlanning: z.array(planningMilestone).optional() }).optional(),
  considerEarlierDates: z.boolean().optional(),
  warnings: z.array(planningIssue), conflicts: z.array(planningIssue),
  history: z.array(z.object({ action: text, actorId: id, at: text, reason: text })),
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
        allocationVersion: z.literal(1).optional(),
        lineAllocations: z.array(invoiceAllocation).optional(),
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
    allocationVersion: z.literal(1).optional(),
    lineAllocations: z.array(creditAllocation).optional(),
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
    projectId: text,
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
  if (v.financeFixture !== undefined)
    check(
      z.object({
        mode: z.literal("synthetic-demo"),
        id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
      }).strict(),
      v.financeFixture,
      "financeFixture",
    );
  if (v.finance !== undefined) {
    try {
      validateFinanceDemoState(v.finance);
    } catch (error) {
      throw Error("Saved data is incompatible at finance. Export the original data before recovery. " + String(error));
    }
    const marker = v.financeFixture as { mode?: string; id?: string } | undefined;
    if (marker?.mode !== "synthetic-demo" || marker.id !== v.finance.fixtureId)
      throw Error("Saved finance fixture marker is missing or mismatched. Export the original data before recovery.");
  }
  for (const [key, schema] of Object.entries(baseSchemas))
    check(z.array(schema), v[key], key);
  if (v.commercialVersion !== undefined && v.commercialVersion !== 1)
    throw Error("Unsupported commercial data version.");
  if (v.planningVersion !== undefined || v.planning !== undefined) {
    check(z.literal(1), v.planningVersion, "planningVersion");
    check(z.array(z.object({
      projectId: id, enabled: z.boolean().optional(), calendar: planningCalendar,
      approvedRevision: z.number().int().nonnegative(),
      baselineStatus: z.enum(["Unset", "Captured"]),
      baselineHistory: z.array(planningSnapshot), taskPlanning: z.array(planningTask),
      milestonePlanning: z.array(planningMilestone), links: z.array(planningLink),
      proposals: z.array(planningProposal),
    })), v.planning, "planning");
  }
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
  const allocations = [
    ...(
      (v.invoices as { snapshot?: Record<string, unknown> }[] | undefined) || []
    ).flatMap((i) => (i.snapshot ? [i.snapshot] : [])),
    ...((v.operations as { credits?: Record<string, unknown>[] } | undefined)
      ?.credits || []),
  ];
  for (const a of allocations)
    if (a.allocationVersion !== undefined || a.lineAllocations !== undefined) {
      if (a.allocationVersion !== 1 || !Array.isArray(a.lineAllocations))
        throw Error("Saved posted line allocations are incompatible.");
    }
}

export function validateRelationships(db: Database) {
  const all = { ...db, ...db.operations };
  const index = new Map<string, Set<string>>();
  for (const [key, value] of Object.entries(all)) {
    // Planning rows are keyed by projectId, not id; validatePlanningData checks
    // their uniqueness and nested references after this generic entity pass.
    if (!Array.isArray(value) || key === "closures" || key === "planning") continue;
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
