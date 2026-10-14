import type { Database, Person, DocumentRecord } from "../domain/model";
import type {
  ApprovalKind,
  Approval,
  Supplier,
  Variation,
  Material,
  PurchaseRequest,
  Rfq,
  SupplierQuote,
  PurchaseOrder,
  Delivery,
  SupplierBill,
  SupplierPayment,
  CreditNote,
  Refund,
  Budget,
  OperationalSettings,
} from "./model";
import { initializeOperations } from "./migration";
import {
  saveEmployee as saveCanonicalEmployee,
  setEmployeeActive,
  saveDocumentDraft,
  reviseDocument,
  reviewDocument,
} from "../workforce/commands";
import {
  latestDocument,
  activeApprovals,
} from "../workforce/document-approvals";
import { uid, today } from "../domain/logic";
import { record } from "../domain/repository";
import { cents, amountString, invoiceTotals } from "../commercial/calculations";
import { blankInvoice, saveInvoice, validDate } from "../commercial/repository";
import {
  variationTotals,
  variationNet,
  quantityUnits,
  deliveredQuantity,
  billedQuantity,
  orderTotals,
  quantityString,
  supplierBalance,
  supplierPaid,
  credited,
  invoicePosition,
  proportionalVat,
  invoiceItemTotals,
} from "./calculations";
export function demoActor(db: Database, id: string) {
  const actor = db.people.find((p) => p.id === id && p.status !== "Inactive");
  if (!actor) throw Error("Select an active demo approval actor.");
  return actor;
}
export function audit(
  db: Database,
  projectId: string,
  kind: string,
  id: string,
  action: string,
  notes: string,
  actorId: string,
  previous?: string,
) {
  demoActor(db, actorId);
  record(db, projectId, kind, id, action, notes, previous);
  db.activities[0].actorId = actorId;
}
const required = (s: string, label: string) => {
  if (!s.trim()) throw Error(label + " is required.");
};
const project = (db: Database, id: string) => {
  const p = db.projects.find((p) => p.id === id);
  if (!p) throw Error("Select an existing project.");
  return p;
};
const supplier = (db: Database, id: string) => {
  const s = initializeOperations(db).suppliers.find(
    (s) => s.id === id && s.status === "Active",
  );
  if (!s) throw Error("Select an active supplier.");
  return s;
};
export function allocate(
  db: Database,
  kind: keyof OperationalSettings["numbering"],
) {
  const op = initializeOperations(db),
    config = op.settings.numbering[kind];
  let value: string;
  const used = JSON.stringify(op);
  do {
    value = config.prefix + String(config.next++).padStart(5, "0");
  } while (used.includes('"' + value + '"'));
  return value;
}
export function saveSupplier(
  db: Database,
  s: Supplier,
  actor = db.people.find((p) => p.status !== "Inactive")?.id || "",
) {
  const op = initializeOperations(db);
  required(s.name, "Company name");
  if (s.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email))
    throw Error("Enter a valid supplier email.");
  const normalized = (s: string) =>
    s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  if (
    op.suppliers.some(
      (x) =>
        x.id !== s.id &&
        (normalized(x.name) === normalized(s.name) ||
          (s.trn && x.trn === s.trn)),
    )
  )
    throw Error(
      "Possible duplicate supplier name/TRN; use the existing supplier.",
    );
  const old = op.suppliers.find((x) => x.id === s.id),
    next = structuredClone(s);
  next.code = old?.code || allocate(db, "supplier");
  audit(
    db,
    "",
    "Supplier",
    s.id,
    old ? "Supplier updated" : "Supplier created",
    s.name,
    actor,
    old ? JSON.stringify(old) : undefined,
  );
  if (old) Object.assign(old, next);
  else op.suppliers.push(next);
  return next;
}
export function saveVariation(db: Database, v: Variation, actor: string) {
  const op = initializeOperations(db),
    p = project(db, v.projectId),
    contract = db.contracts.find(
      (c) => c.id === v.contractId && c.projectId === p.id,
    );
  if (!contract || v.customerId !== p.clientId)
    throw Error(
      "Variation must reference this project's accepted contract and customer.",
    );
  const old = op.variations.find((x) => x.id === v.id);
  if (old && old.status !== "Draft")
    throw Error(
      "Submitted/approved variation revisions are immutable; create a revision.",
    );
  if (v.status !== "Draft") throw Error("Submit the draft through approval.");
  required(v.title, "Variation title");
  required(v.reason, "Variation reason");
  validDate(v.date);
  demoActor(db, v.requesterId);
  if (
    !v.items.length ||
    v.items.some(
      (i) =>
        !i.description.trim() ||
        quantityUnits(i.quantity) <= 0n ||
        !i.unit.trim(),
    )
  )
    throw Error(
      "Variation items require description, unit and positive quantity.",
    );
  const accepted = JSON.parse(contract.quotationSnapshot);
  const expectedRate = accepted.vatEnabled ? accepted.vatPercentage : "0";
  if (v.vatPercentage !== expectedRate)
    throw Error("Use the original accepted contract VAT percentage.");
  const t = variationTotals(v);
  if (t.grand === 0n) throw Error("Variation value must be non-zero.");
  const next = structuredClone(v);
  next.number = old?.number || v.number || allocate(db, "variation");
  audit(
    db,
    p.id,
    "Variation",
    v.id,
    old ? "Variation draft updated" : "Variation draft created",
    v.title,
    actor,
    old ? JSON.stringify(old) : undefined,
  );
  if (old) Object.assign(old, next);
  else op.variations.push(next);
  return next;
}
export function reviseVariation(
  db: Database,
  id: string,
  reason: string,
  actor: string,
) {
  const op = initializeOperations(db),
    v = op.variations.find((v) => v.id === id);
  if (!v || v.status === "Draft" || v.status === "Approved")
    throw Error("Only submitted/rejected unapproved revisions can be revised.");
  required(reason, "Revision reason");
  const next = {
    ...structuredClone(v),
    id: uid(),
    revision:
      Math.max(
        ...op.variations
          .filter((x) => x.familyId === v.familyId)
          .map((x) => x.revision),
      ) + 1,
    status: "Draft" as const,
    notes: reason,
  };
  delete next.snapshot;
  v.status = "Revised";
  op.approvals
    .filter((a) => a.entityId === id && a.status === "Pending Approval")
    .forEach((a) => {
      a.status = "Rejected";
      a.comments = "Superseded: " + reason;
      a.actorId = actor;
      a.decisionAt = new Date().toISOString();
    });
  op.variations.push(next);
  audit(
    db,
    v.projectId,
    "Variation",
    id,
    "Variation revision requested",
    reason,
    actor,
    JSON.stringify(v),
  );
  return next;
}
export function saveMaterial(db: Database, m: Material, actor: string) {
  const op = initializeOperations(db);
  project(db, m.projectId);
  required(m.name, "Material/service");
  required(m.unit, "Unit");
  if (quantityUnits(m.quantity) <= 0n)
    throw Error("Quantity must be positive.");
  validDate(m.requiredDate);
  demoActor(db, m.requesterId);
  if (op.materials.some((x) => x.id === m.id))
    throw Error(
      "Material requirement is already recorded; create a new requirement for changed scope.",
    );
  const next = { ...structuredClone(m), number: allocate(db, "material") };
  op.materials.push(next);
  audit(
    db,
    m.projectId,
    "Material",
    m.id,
    "Material requirement recorded",
    next.number,
    actor,
  );
  return next;
}
export function saveRequest(db: Database, pr: PurchaseRequest, actor: string) {
  const op = initializeOperations(db);
  project(db, pr.projectId);
  validDate(pr.date);
  demoActor(db, pr.requesterId);
  if (
    !pr.materialIds.length ||
    new Set(pr.materialIds).size !== pr.materialIds.length ||
    pr.materialIds.some(
      (id) =>
        !op.materials.some((m) => m.id === id && m.projectId === pr.projectId),
    )
  )
    throw Error("Select material requirements in this project.");
  const old = op.requests.find((x) => x.id === pr.id);
  if (old && !["Draft", "Rejected"].includes(old.status))
    throw Error("Submitted requests are locked.");
  if (
    op.requests.some(
      (x) =>
        x.id !== pr.id &&
        x.status !== "Rejected" &&
        x.materialIds.some((id) => pr.materialIds.includes(id)),
    )
  )
    throw Error("Material already has a purchase request.");
  const next = {
    ...structuredClone(pr),
    number: old?.number || allocate(db, "request"),
    status: "Draft" as const,
  };
  audit(
    db,
    pr.projectId,
    "Purchase Request",
    pr.id,
    "Purchase request saved",
    next.number,
    actor,
    old ? JSON.stringify(old) : undefined,
  );
  if (old) Object.assign(old, next);
  else op.requests.push(next);
  return next;
}
export function createRfq(
  db: Database,
  requestId: string,
  supplierId: string,
  deliveryDate: string,
  deadline: string,
  actor: string,
) {
  const op = initializeOperations(db),
    pr = op.requests.find((r) => r.id === requestId && r.status === "Approved");
  if (!pr) throw Error("Purchase request must be approved.");
  supplier(db, supplierId);
  validDate(deliveryDate);
  validDate(deadline);
  if (deadline > deliveryDate)
    throw Error("RFQ deadline must not follow requested delivery.");
  if (
    op.rfqs.some(
      (r) =>
        r.requestId === requestId &&
        r.supplierId === supplierId &&
        r.status !== "Closed",
    )
  )
    throw Error("Supplier already has an open RFQ for this request.");
  const rfq: Rfq = {
    id: uid(),
    number: allocate(db, "rfq"),
    projectId: pr.projectId,
    requestId,
    supplierId,
    items: pr.materialIds.map((id) => {
      const m = op.materials.find((m) => m.id === id)!;
      return {
        id: uid(),
        materialId: id,
        description: m.name,
        specification: m.specification,
        quantity: m.quantity,
        unit: m.unit,
        rate: "0",
        tax: op.settings.tax,
      };
    }),
    deliveryDate,
    deadline,
    status: "Requested",
  };
  op.rfqs.push(rfq);
  audit(
    db,
    pr.projectId,
    "RFQ",
    rfq.id,
    "Supplier RFQ requested",
    rfq.number,
    actor,
  );
  return rfq;
}
export function saveSupplierQuote(
  db: Database,
  q: SupplierQuote,
  actor: string,
) {
  const op = initializeOperations(db),
    rfq = op.rfqs.find((r) => r.id === q.rfqId && r.status === "Requested");
  if (
    !rfq ||
    q.projectId !== rfq.projectId ||
    q.supplierId !== rfq.supplierId ||
    op.quotes.some((x) => x.rfqId === rfq.id)
  )
    throw Error("Quote must match an unquoted RFQ.");
  supplier(db, q.supplierId);
  if (!Number.isInteger(q.leadDays) || q.leadDays < 0)
    throw Error("Lead time must be a non-negative whole number.");
  if (
    q.items.length !== rfq.items.length ||
    q.items.some(
      (i) =>
        !rfq.items.some(
          (r) =>
            r.id === i.id &&
            r.quantity === i.quantity &&
            r.materialId === i.materialId,
        ),
    )
  )
    throw Error(
      "Supplier quotation must cover the requested items and quantities.",
    );
  if (orderTotals(q).grand <= 0n)
    throw Error("Supplier quotation needs a positive price.");
  const next = {
    ...structuredClone(q),
    number: allocate(db, "quote"),
    status: "Received" as const,
  };
  op.quotes.push(next);
  rfq.status = "Received";
  audit(
    db,
    q.projectId,
    "Supplier Quotation",
    q.id,
    "Supplier quotation received",
    next.number,
    actor,
  );
  return next;
}
function approvalEntity(db: Database, kind: ApprovalKind, id: string) {
  const op = initializeOperations(db);
  const entity =
    kind === "Variation"
      ? op.variations.find((x) => x.id === id)
      : kind === "Purchase Request"
        ? op.requests.find((x) => x.id === id)
        : kind === "Supplier Quotation"
          ? op.quotes.find((x) => x.id === id)
          : kind === "Purchase Order"
            ? op.orders.find((x) => x.id === id)
            : kind === "Credit Note"
              ? op.credits.find((x) => x.id === id)
              : db.documents.find((x) => x.id === id);
  if (!entity) throw Error("Approval record not found.");
  return entity;
}
export function submitApproval(
  db: Database,
  kind: ApprovalKind,
  id: string,
  stage: string,
  requesterId: string,
  approverId: string,
) {
  const op = initializeOperations(db),
    e = approvalEntity(db, kind, id);
  if (kind === "Document") {
    const d = e as DocumentRecord;
    if (!latestDocument(db, d))
      throw Error("Submit the latest document revision.");
    if (requesterId === approverId)
      throw Error("Choose an independent assigned reviewer.");
    demoActor(db, approverId);
    reviewDocument(db, id, "Pending", requesterId, stage, approverId);
    return initializeOperations(db).approvals.find(
      (a) =>
        a.entityId === id && a.status === "Pending Approval" && !a.supersededBy,
    )!;
  }
  demoActor(db, requesterId);
  demoActor(db, approverId);
  if (
    op.approvals.some(
      (a) =>
        a.kind === kind && a.entityId === id && a.status === "Pending Approval",
    )
  )
    throw Error("This record already has a pending approval.");
  if (kind === "Variation") {
    const v = e as Variation;
    if (
      stage === "Client"
        ? v.status !== "Internally Approved"
        : v.status !== "Draft"
    )
      throw Error("Follow internal approval before sending to client.");
    v.status = stage === "Client" ? "Sent to Client" : "Submitted";
  } else {
    if (!["Draft", "Received", "Rejected"].includes(e.status))
      throw Error("Record is not eligible for submission.");
    e.status = "Submitted";
  }
  const a: Approval = {
    id: uid(),
    kind,
    entityId: id,
    projectId: e.projectId,
    stage,
    requesterId,
    approverId,
    submittedAt: new Date().toISOString(),
    status: "Pending Approval" as const,
    snapshot: JSON.stringify(e),
  };
  op.approvals.push(a);
  audit(
    db,
    e.projectId,
    kind,
    id,
    "Submitted for " + stage + " approval",
    "Demo approver: " + db.people.find((p) => p.id === approverId)!.name,
    requesterId,
    a.snapshot,
  );
  return a;
}
export function decideApproval(
  db: Database,
  id: string,
  approved: boolean,
  comments: string,
  actor: string,
) {
  const op = initializeOperations(db),
    a = op.approvals.find((a) => a.id === id);
  if (
    !a ||
    a.status !== "Pending Approval" ||
    !activeApprovals(db).some(
      (v) => v.id === id && v.status === "Pending Approval",
    )
  )
    throw Error("Approval has already been decided.");
  demoActor(db, actor);
  if (a.approverId !== actor)
    throw Error("Select the assigned demo approver to record this decision.");
  required(comments, "Approval/rejection comments");
  const e = approvalEntity(db, a.kind, a.entityId);
  if (a.kind === "Document") {
    reviewDocument(
      db,
      a.entityId,
      approved ? "Approved" : "Rejected",
      actor,
      comments,
    );
    return a;
  }
  if (a.kind === "Variation" && approved) variationTotals(e as Variation);
  if (a.kind === "Variation" && approved && a.stage === "Client") {
    const v = e as Variation;
    if (
      op.variations.some(
        (x) =>
          x.familyId === v.familyId && x.id !== v.id && x.status === "Approved",
      )
    )
      throw Error("This variation family has already been applied.");
    const t = variationTotals(v),
      contract = db.contracts.find((c) => c.id === v.contractId)!;
    if (BigInt(contract.net) + variationNet(db, v.projectId) + t.net < 0n)
      throw Error("Deduction exceeds revised contract value.");
    v.net = t.net.toString();
    v.vat = t.vat.toString();
    v.gross = t.grand.toString();
    v.approvedAt = new Date().toISOString();
    v.snapshot = JSON.stringify({ ...v, status: "Approved" });
  }
  if (a.kind === "Supplier Quotation" && approved) {
    const q = e as SupplierQuote,
      r = op.rfqs.find((r) => r.id === q.rfqId)!;
    if (
      op.quotes.some(
        (x) =>
          x.id !== q.id &&
          x.status === "Approved" &&
          op.rfqs.find((f) => f.id === x.rfqId)?.requestId === r.requestId,
      )
    )
      throw Error("A preferred supplier is already approved for this request.");
    q.snapshot = JSON.stringify({ ...q, status: "Approved" });
  }
  if (a.kind === "Purchase Order" && approved) {
    const po = e as PurchaseOrder;
    supplier(db, po.supplierId);
    po.companySnapshot = structuredClone(op.settings.company);
    po.supplierSnapshot = structuredClone(
      op.suppliers.find((s) => s.id === po.supplierId)!,
    );
    po.snapshot = JSON.stringify({ ...po, status: "Approved" });
  }
  if (a.kind === "Credit Note" && approved) validateCredit(db, e as CreditNote);
  e.status = approved
    ? a.kind === "Variation" && a.stage !== "Client"
      ? "Internally Approved"
      : "Approved"
    : "Rejected";
  a.status = approved ? "Approved" : "Rejected";
  a.actorId = actor;
  a.decisionAt = new Date().toISOString();
  a.comments = comments;
  audit(
    db,
    e.projectId,
    a.kind,
    e.id,
    a.stage + (approved ? " approved" : " rejected"),
    comments,
    actor,
    a.snapshot,
  );
  return a;
}
export function reassignApproval(
  db: Database,
  id: string,
  approverId: string,
  reason: string,
  actor: string,
) {
  const a = initializeOperations(db).approvals.find(
    (a) => a.id === id && a.status === "Pending Approval",
  );
  if (!a) throw Error("Only pending approvals can be reassigned.");
  demoActor(db, approverId);
  if (
    a.kind === "Document" &&
    (!activeApprovals(db).some(
      (v) => v.id === id && v.status === "Pending Approval",
    ) ||
      a.requesterId === approverId)
  )
    throw Error(
      "Assign an independent active reviewer to the current revision.",
    );
  required(reason, "Reassignment reason");
  audit(
    db,
    a.projectId,
    a.kind,
    a.entityId,
    "Approval reassigned",
    reason,
    actor,
    JSON.stringify(a),
  );
  a.approverId = approverId;
  if (a.kind === "Document")
    db.documents.find((d) => d.id === a.entityId)!.reviewerId = approverId;
}
export function createOrder(
  db: Database,
  quoteId: string,
  location: string,
  date: string,
  actor: string,
) {
  const op = initializeOperations(db),
    q = op.quotes.find((q) => q.id === quoteId && q.status === "Approved");
  if (!q) throw Error("Approve preferred supplier quotation first.");
  if (op.orders.some((o) => o.quoteId === q.id && o.status !== "Cancelled"))
    throw Error("Supplier quotation already has a purchase order.");
  required(location, "Delivery location");
  validDate(date);
  supplier(db, q.supplierId);
  const po: PurchaseOrder = {
    id: uid(),
    number: allocate(db, "po"),
    quoteId: q.id,
    projectId: q.projectId,
    supplierId: q.supplierId,
    date: today(),
    items: structuredClone(q.items),
    deliveryCharge: q.deliveryCharge,
    vatPercentage: q.vatPercentage,
    deliveryLocation: location,
    deliveryDate: date,
    terms: q.terms,
    status: "Draft",
  };
  op.orders.push(po);
  audit(
    db,
    q.projectId,
    "Purchase Order",
    po.id,
    "Purchase order created",
    po.number,
    actor,
  );
  return po;
}
export function cancelOrder(
  db: Database,
  id: string,
  reason: string,
  actor: string,
) {
  const op = initializeOperations(db),
    po = op.orders.find((o) => o.id === id);
  if (!po || po.status === "Cancelled")
    throw Error("Purchase order not found or already cancelled.");
  required(reason, "Cancellation reason");
  if (
    op.deliveries.some((d) => d.poId === id && !d.reversedAt) ||
    op.bills.some((b) => b.poId === id && b.status === "Issued")
  )
    throw Error("Received or billed purchase orders cannot be cancelled.");
  audit(
    db,
    po.projectId,
    "Purchase Order",
    po.id,
    "Purchase order cancelled",
    reason,
    actor,
    JSON.stringify(po),
  );
  po.status = "Cancelled";
  op.approvals
    .filter((a) => a.entityId === po.id && a.status === "Pending Approval")
    .forEach((a) => {
      a.status = "Rejected";
      a.actorId = actor;
      a.comments = reason;
      a.decisionAt = new Date().toISOString();
    });
}
export function receiveDelivery(db: Database, d: Delivery, actor: string) {
  const op = initializeOperations(db),
    po = op.orders.find((o) => o.id === d.poId && o.status === "Approved");
  if (!po || d.projectId !== po.projectId)
    throw Error("Receive against an approved purchase order in this project.");
  validDate(d.date);
  if (d.date > today() || d.date < po.date)
    throw Error("Delivery date must be between PO date and today.");
  required(d.reference, "Delivery note reference");
  demoActor(db, d.receiverId);
  if (
    op.deliveries.some(
      (x) =>
        x.id === d.id ||
        (!x.reversedAt &&
          x.poId === po.id &&
          x.reference.trim().toLowerCase() ===
            d.reference.trim().toLowerCase()),
    )
  )
    throw Error("Duplicate delivery note.");
  if (
    !d.quantities.length ||
    new Set(d.quantities.map((q) => q.itemId)).size !== d.quantities.length
  )
    throw Error("Select unique delivered items.");
  for (const q of d.quantities) {
    const item = po.items.find((i) => i.id === q.itemId);
    if (
      !item ||
      quantityUnits(q.quantity) <= 0n ||
      deliveredQuantity(db, po.id, q.itemId) + quantityUnits(q.quantity) >
        quantityUnits(item.quantity)
    )
      throw Error("Delivered quantity exceeds pending PO quantity.");
  }
  const next = { ...structuredClone(d), number: allocate(db, "delivery") };
  op.deliveries.push(next);
  audit(
    db,
    d.projectId,
    "Delivery",
    d.id,
    "Material delivery recorded",
    next.number,
    actor,
  );
  return next;
}
export function reverseDelivery(
  db: Database,
  id: string,
  reason: string,
  actor: string,
) {
  const op = initializeOperations(db),
    d = op.deliveries.find((d) => d.id === id && !d.reversedAt);
  if (!d) throw Error("Active delivery not found.");
  required(reason, "Delivery reversal reason");
  if (
    d.quantities.some(
      (q) =>
        deliveredQuantity(db, d.poId, q.itemId) - quantityUnits(q.quantity) <
        billedQuantity(db, d.poId, q.itemId),
    )
  )
    throw Error(
      "Delivered quantities are already billed; cancel eligible bills first.",
    );
  audit(
    db,
    d.projectId,
    "Delivery",
    d.id,
    "Delivery reversed",
    reason,
    actor,
    JSON.stringify(d),
  );
  d.reversedAt = new Date().toISOString();
  d.reason = reason;
}
export function recordBill(
  db: Database,
  input: Omit<
    SupplierBill,
    | "number"
    | "net"
    | "vat"
    | "gross"
    | "snapshot"
    | "companySnapshot"
    | "supplierSnapshot"
  >,
  actor: string,
) {
  const op = initializeOperations(db),
    po = op.orders.find((o) => o.id === input.poId && o.status === "Approved");
  if (input.status !== "Issued")
    throw Error("New supplier bills must be issued records.");
  if (
    !po ||
    input.projectId !== po.projectId ||
    input.supplierId !== po.supplierId
  )
    throw Error("Bill must match approved PO supplier/project.");
  required(input.reference, "Supplier invoice reference");
  validDate(input.date);
  validDate(input.due);
  if (input.date < po.date || input.date > today() || input.due < input.date)
    throw Error("Check bill invoice and due dates.");
  if (
    op.bills.some(
      (b) =>
        b.id === input.id ||
        (b.status === "Issued" &&
          b.supplierId === po.supplierId &&
          b.reference.trim().toLowerCase() ===
            input.reference.trim().toLowerCase()),
    )
  )
    throw Error("Duplicate supplier invoice reference.");
  if (
    !input.quantities.length ||
    new Set(input.quantities.map((q) => q.itemId)).size !==
      input.quantities.length
  )
    throw Error("Select unique received quantities.");
  for (const q of input.quantities)
    if (
      !po.items.some((i) => i.id === q.itemId) ||
      quantityUnits(q.quantity) <= 0n ||
      quantityUnits(q.quantity) + billedQuantity(db, po.id, q.itemId) >
        deliveredQuantity(db, po.id, q.itemId)
    )
      throw Error(
        "Cannot bill quantities that are undelivered or already billed.",
      );
  const billedDelivery = op.bills
    .filter((b) => b.poId === po.id && b.status === "Issued")
    .reduce((s, b) => s + cents(b.deliveryCharge), 0n);
  if (billedDelivery + cents(input.deliveryCharge) > cents(po.deliveryCharge))
    throw Error("Delivery charges exceed purchase order allowance.");
  const cumulative = orderTotals({
    items: po.items.map((item) => ({
      ...item,
      quantity: quantityString(
        billedQuantity(db, po.id, item.id) +
          quantityUnits(
            input.quantities.find((q) => q.itemId === item.id)?.quantity || "0",
          ),
      ),
    })),
    vatPercentage: po.vatPercentage,
    deliveryCharge: amountString(billedDelivery + cents(input.deliveryCharge)),
  });
  const previousBills = op.bills.filter(
    (b) => b.poId === po.id && b.status === "Issued",
  );
  const t = {
    net:
      cumulative.net -
      previousBills.reduce((sum, b) => sum + BigInt(b.net), 0n),
    vat:
      cumulative.vat -
      previousBills.reduce((sum, b) => sum + BigInt(b.vat), 0n),
    grand:
      cumulative.grand -
      previousBills.reduce((sum, b) => sum + BigInt(b.gross), 0n),
  };
  if (t.grand <= 0n) throw Error("Supplier bill total must be positive.");
  if (t.net < 0n || t.vat < 0n)
    throw Error(
      "This partial correction would produce negative net/VAT after rounding. Rebill the cancelled allocation together or cancel the remaining unpaid bill first.",
    );
  const bill: SupplierBill = {
    ...structuredClone(input),
    number: allocate(db, "bill"),
    net: t.net.toString(),
    vat: t.vat.toString(),
    gross: t.grand.toString(),
    snapshot: JSON.stringify({ po, quantities: input.quantities }),
    companySnapshot: structuredClone(op.settings.company),
    supplierSnapshot: structuredClone(
      po.supplierSnapshot || op.suppliers.find((s) => s.id === po.supplierId)!,
    ),
  };
  op.bills.push(bill);
  db.expenses.push({
    id: uid(),
    reference: bill.number,
    projectId: po.projectId,
    category: "Materials",
    supplier: bill.supplierSnapshot.name,
    date: bill.date,
    description: "Supplier bill " + bill.reference + " · " + po.number,
    amount: amountString(t.net),
    vat: amountString(t.vat),
    paidAmount: "0",
    method: "Bank Transfer",
    attachmentReference: bill.reference,
    attachments: [],
    createdAt: new Date().toISOString(),
    supplierBillId: bill.id,
  });
  audit(
    db,
    po.projectId,
    "Supplier Bill",
    bill.id,
    "Supplier bill recorded as linked actual cost",
    bill.number,
    actor,
  );
  return bill;
}
function syncBillExpense(db: Database, id: string) {
  const e = db.expenses.find((e) => e.supplierBillId === id);
  if (e) e.paidAmount = amountString(supplierPaid(db, id));
}
export function paySupplier(db: Database, p: SupplierPayment, actor: string) {
  const op = initializeOperations(db),
    b = op.bills.find((b) => b.id === p.billId && b.status === "Issued");
  if (!b || p.supplierId !== b.supplierId || p.projectId !== b.projectId)
    throw Error("Supplier payment must match an issued bill.");
  validDate(p.date);
  required(p.reference, "Supplier payment reference");
  if (!["Bank Transfer", "Cash", "Cheque", "Other"].includes(p.method))
    throw Error("Choose a valid supplier payment method.");
  if (
    p.date < b.date ||
    p.date > today() ||
    cents(p.amount) <= 0n ||
    cents(p.amount) > supplierBalance(db, b.id)
  )
    throw Error("Supplier payment exceeds payable or has invalid date/amount.");
  if (
    op.supplierPayments.some(
      (x) =>
        x.id === p.id ||
        (!x.reversedAt &&
          x.reference.trim().toLowerCase() ===
            p.reference.trim().toLowerCase() &&
          x.bank.trim().toLowerCase() === p.bank.trim().toLowerCase()),
    )
  )
    throw Error("Duplicate supplier payment posting.");
  const next = {
    ...structuredClone(p),
    number: allocate(db, "supplierPayment"),
  };
  op.supplierPayments.push(next);
  syncBillExpense(db, b.id);
  audit(
    db,
    b.projectId,
    "Supplier Payment",
    p.id,
    "Supplier payment posted",
    next.number,
    actor,
  );
  return next;
}
export function reverseSupplierPayment(
  db: Database,
  id: string,
  reason: string,
  actor: string,
) {
  const op = initializeOperations(db),
    p = op.supplierPayments.find((p) => p.id === id && !p.reversedAt);
  if (!p) throw Error("Active supplier payment not found.");
  required(reason, "Reversal reason");
  audit(
    db,
    p.projectId,
    "Supplier Payment",
    id,
    "Supplier payment reversed",
    reason,
    actor,
    JSON.stringify(p),
  );
  p.reversedAt = new Date().toISOString();
  p.reversalDate = today();
  p.reason = reason;
  syncBillExpense(db, p.billId);
}
export function cancelBill(
  db: Database,
  id: string,
  reason: string,
  actor: string,
) {
  const op = initializeOperations(db),
    b = op.bills.find((b) => b.id === id && b.status === "Issued");
  if (!b || supplierPaid(db, id) > 0n)
    throw Error("Reverse supplier payments before bill cancellation.");
  required(reason, "Cancellation reason");
  audit(
    db,
    b.projectId,
    "Supplier Bill",
    b.id,
    "Supplier bill cancelled",
    reason,
    actor,
    JSON.stringify(b),
  );
  b.status = "Cancelled";
  db.expenses
    .filter((e) => e.supplierBillId === b.id)
    .forEach((e) => {
      e.cancelledAt = new Date().toISOString();
    });
}
export function generateVariationInvoice(db: Database, id: string) {
  const op = initializeOperations(db),
    v = op.variations.find((v) => v.id === id && v.status === "Approved");
  if (!v || BigInt(v.gross!) <= 0n)
    throw Error(
      "Only approved positive variations generate invoices; use a credit note for a deduction.",
    );
  if (db.invoices.some((i) => i.variationId === id && i.status !== "Cancelled"))
    throw Error("Variation is already invoiced/reserved.");
  const i = blankInvoice(v.customerId, v.projectId);
  i.variationId = id;
  i.lines = v.items.map((item) => ({
    id: uid(),
    description: v.number + " · " + item.description,
    quantity: item.quantity,
    rate: item.rate,
    tax: item.tax,
  }));
  i.discount = v.discount;
  i.vatPercentage = v.vatPercentage;
  i.description = v.title;
  return saveInvoice(db, i);
}
function validateCredit(db: Database, c: CreditNote) {
  const op = initializeOperations(db),
    i = db.invoices.find((i) => i.id === c.invoiceId && i.status === "Issued");
  if (!i || i.projectId !== c.projectId || i.customerId !== c.customerId)
    throw Error("Credit note must match an issued invoice.");
  const invoiceValue = invoiceTotals(i);
  if (invoiceValue.net < 0n || invoiceValue.vat < 0n)
    throw Error(
      "Invoice snapshot has negative net/VAT; review the original posting before issuing adjustments.",
    );
  required(c.reason, "Credit reason");
  validDate(c.date);
  if (c.date < i.date || c.date > today())
    throw Error("Credit date must be between invoice date and today.");
  const reserved = op.credits
    .filter(
      (x) => x.id !== c.id && x.invoiceId === i.id && x.status !== "Rejected",
    )
    .reduce((s, x) => s + cents(x.gross), 0n);
  if (cents(c.gross) <= 0n || cents(c.gross) + reserved > invoiceValue.grand)
    throw Error("Credit exceeds eligible billed value.");
  if (c.itemId) {
    const line = i.lines.find((l) => l.id === c.itemId);
    if (!line) throw Error("Credit invoice item not found.");
    const lineTotal = invoiceItemTotals(i, c.itemId).grand;
    const itemReserved = op.credits
      .filter(
        (x) =>
          x.id !== c.id &&
          x.invoiceId === i.id &&
          x.itemId === c.itemId &&
          x.status !== "Rejected",
      )
      .reduce((s, x) => s + cents(x.gross), 0n);
    if (itemReserved + cents(c.gross) > lineTotal)
      throw Error("Credit exceeds the selected item's billed value.");
  }
  if (c.variationId) {
    const v = op.variations.find(
      (v) =>
        v.id === c.variationId &&
        v.status === "Approved" &&
        BigInt(v.gross!) < 0n &&
        v.projectId === c.projectId,
    );
    if (
      !v ||
      op.credits.some(
        (x) =>
          x.id !== c.id && x.variationId === v.id && x.status !== "Rejected",
      ) ||
      cents(c.gross) !== -BigInt(v.gross!)
    )
      throw Error(
        "Deduction credit must exactly match a unique approved variation.",
      );
  }
  return i;
}
export function saveCredit(db: Database, c: CreditNote, actor: string) {
  const op = initializeOperations(db),
    old = op.credits.find((x) => x.id === c.id);
  if (old && !["Draft", "Rejected"].includes(old.status))
    throw Error("Submitted/issued credit notes are immutable.");
  validateCredit(db, c);
  const next = {
    ...structuredClone(c),
    gross: amountString(cents(c.gross)),
    number: old?.number || allocate(db, "credit"),
    status: "Draft" as const,
  };
  audit(
    db,
    c.projectId,
    "Credit Note",
    c.id,
    "Credit note draft saved",
    next.number,
    actor,
    old ? JSON.stringify(old) : undefined,
  );
  if (old) Object.assign(old, next);
  else op.credits.push(next);
  return next;
}
export function issueCredit(db: Database, id: string, actor: string) {
  const op = initializeOperations(db),
    c = op.credits.find((c) => c.id === id && c.status === "Approved");
  if (!c) throw Error("Approve credit note before issuing.");
  const i = validateCredit(db, c),
    t = invoiceTotals(i),
    creditedSoFar = op.credits
      .filter((x) => x.invoiceId === i.id && x.status === "Issued")
      .reduce((s, x) => s + BigInt(x.vat!), 0n);
  const total = credited(db, i.id) + cents(c.gross);
  let value =
    total === t.grand
      ? {
          vat: t.vat - creditedSoFar,
          net: cents(c.gross) - (t.vat - creditedSoFar),
        }
      : proportionalVat(t.net, t.vat, t.grand, cents(c.gross));
  if (c.itemId && total !== t.grand) {
    const item = invoiceItemTotals(i, c.itemId),
      previous = op.credits.filter(
        (x) =>
          x.invoiceId === i.id &&
          x.itemId === c.itemId &&
          x.status === "Issued",
      );
    const previousGross = previous.reduce((sum, x) => sum + cents(x.gross), 0n),
      previousVat = previous.reduce((sum, x) => sum + BigInt(x.vat!), 0n);
    const proposed =
      previousGross + cents(c.gross) === item.grand
        ? item.vat - previousVat
        : proportionalVat(item.net, item.vat, item.grand, cents(c.gross)).vat;
    const vat =
      proposed > t.vat - creditedSoFar ? t.vat - creditedSoFar : proposed;
    value = { vat, net: cents(c.gross) - vat };
  }
  if (value.vat < 0n || value.net < 0n)
    throw Error(
      "Credit allocation cannot reconcile VAT; review the item/amount adjustment basis.",
    );
  c.net = value.net.toString();
  c.vat = value.vat.toString();
  c.issuedAt = new Date().toISOString();
  c.snapshot = JSON.stringify({
    invoice: i,
    company: op.settings.company,
    gross: c.gross,
    net: c.net,
    vat: c.vat,
  });
  c.status = "Issued";
  audit(
    db,
    c.projectId,
    "Credit Note",
    c.id,
    "Credit note issued and locked",
    c.number,
    actor,
  );
}
export function postRefund(db: Database, r: Refund, actor: string) {
  const op = initializeOperations(db),
    i = db.invoices.find((i) => i.id === r.invoiceId && i.status === "Issued");
  if (!i || r.customerId !== i.customerId || r.projectId !== i.projectId)
    throw Error("Refund must match an issued invoice/customer.");
  validDate(r.date);
  required(r.reason, "Refund reason");
  required(r.reference, "Refund reference");
  if (!["Bank Transfer", "Cash", "Cheque", "Other"].includes(r.method))
    throw Error("Choose a valid refund method.");
  if (
    r.date > today() ||
    r.date < i.date ||
    cents(r.amount) <= 0n ||
    cents(r.amount) > -invoicePosition(db, i)
  )
    throw Error("Refund exceeds eligible customer credit balance.");
  if (
    op.refunds.some(
      (x) =>
        x.id === r.id ||
        (!x.reversedAt &&
          x.reference.trim().toLowerCase() ===
            r.reference.trim().toLowerCase()),
    )
  )
    throw Error("Duplicate refund posting.");
  const next = { ...structuredClone(r), number: allocate(db, "refund") };
  next.amount = amountString(cents(next.amount));
  op.refunds.push(next);
  audit(
    db,
    i.projectId,
    "Refund",
    r.id,
    "Customer refund posted",
    next.number,
    actor,
  );
  return next;
}
export function reverseRefund(
  db: Database,
  id: string,
  reason: string,
  actor: string,
) {
  const r = initializeOperations(db).refunds.find(
    (r) => r.id === id && !r.reversedAt,
  );
  if (!r) throw Error("Active refund not found.");
  required(reason, "Reversal reason");
  audit(
    db,
    r.projectId,
    "Refund",
    r.id,
    "Refund reversed",
    reason,
    actor,
    JSON.stringify(r),
  );
  r.reversedAt = new Date().toISOString();
  r.reversalDate = today();
}
export function saveBudget(db: Database, b: Budget, actor: string) {
  const op = initializeOperations(db);
  project(db, b.projectId);
  if (
    !b.lines.length ||
    b.lines.some(
      (l) =>
        !l.category.trim() ||
        (l.phaseId &&
          !db.phases.some(
            (p) => p.id === l.phaseId && p.projectId === b.projectId,
          )),
    )
  )
    throw Error(
      "Budget lines require category and a valid project phase if selected.",
    );
  b.lines.forEach((l) => {
    cents(l.original);
    cents(l.revised);
  });
  cents(b.remainingEstimate);
  const old = op.budgets.find((x) => x.projectId === b.projectId),
    next = structuredClone(b);
  if (old) {
    if (old.lines.some((l) => !next.lines.some((n) => n.id === l.id)))
      throw Error(
        "Keep original budget lines; set revised value to zero instead of deleting.",
      );
    next.lines = next.lines.map((l) => ({
      ...l,
      original: old.lines.find((x) => x.id === l.id)?.original || "0",
    }));
  }
  next.updatedAt = new Date().toISOString();
  audit(
    db,
    b.projectId,
    "Budget",
    b.id,
    "Project budget saved",
    b.notes,
    actor,
    old ? JSON.stringify(old) : undefined,
  );
  if (old) Object.assign(old, next);
  else op.budgets.push(next);
  return next;
}
// Legacy API adapters delegate every mutation to the canonical workforce commands.
export function saveEmployee(db: Database, p: Person, actor: string) {
  const old = db.people.find((x) => x.id === p.id);
  if (old && (old.status === "Inactive") !== (p.status === "Inactive")) {
    if (!p.notes?.trim())
      throw Error("Record a reason for employee status changes.");
    return setEmployeeActive(db, p.id, p.status !== "Inactive", actor, p.notes);
  }
  return saveCanonicalEmployee(db, p, actor);
}
export function saveControlledDocument(
  db: Database,
  doc: DocumentRecord,
  actor: string,
) {
  const existing = db.documents.find((d) => d.id === doc.id);
  if (existing && existing.status !== "Draft")
    throw Error(
      "Submitted/approved revisions are immutable; create a revision.",
    );
  let input = { ...doc, status: "Draft" as const };
  if (!existing && doc.revisionOf) {
    const next = reviseDocument(
      db,
      doc.revisionOf,
      actor,
      doc.revisionNote || "Requested document revision",
      doc.id,
    );
    input = {
      ...input,
      familyId: next.familyId,
      previousRevisionId: next.previousRevisionId,
      version: next.version,
    };
  }
  saveDocumentDraft(db, input, actor);
  return db.documents.find((d) => d.id === doc.id)!;
}
export function saveSettings(
  db: Database,
  s: OperationalSettings,
  actor: string,
) {
  required(s.company.name, "Company name");
  required(s.invoicePrefix, "Invoice prefix");
  validDate("2024-" + s.fiscalYearStart);
  if (s.company.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.company.email))
    throw Error("Enter a valid company email.");
  const rate = cents(s.vatPercentage);
  if (
    rate > 10000n ||
    cents(s.retentionPercentage) > 10000n ||
    s.currency !== "AED" ||
    !Number.isInteger(s.paymentDays) ||
    s.paymentDays < 0 ||
    !/^\d{2}-\d{2}$/.test(s.fiscalYearStart)
  )
    throw Error(
      "Check VAT/retention percentage, AED currency, payment days and financial year start.",
    );
  for (const n of Object.values(s.numbering))
    if (!n.prefix.trim() || !Number.isSafeInteger(n.next) || n.next < 1)
      throw Error("Number prefixes and positive next sequences are required.");
  const op = initializeOperations(db);
  audit(
    db,
    "",
    "Settings",
    "company",
    "Company/financial settings updated",
    s.company.name,
    actor,
    JSON.stringify(op.settings),
  );
  op.settings = structuredClone(s);
}
