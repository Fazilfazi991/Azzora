import type { Attachment, DocumentRecord } from "../domain/model";
import type { InvoiceLine, TaxTreatment } from "../commercial/model";
export type ApprovalKind =
  | "Variation"
  | "Purchase Request"
  | "Supplier Quotation"
  | "Purchase Order"
  | "Credit Note"
  | "Document";
export interface Approval {
  id: string;
  kind: ApprovalKind;
  entityId: string;
  projectId: string;
  stage: string;
  requesterId: string;
  approverId: string;
  submittedAt: string;
  status: "Pending Approval" | "Approved" | "Rejected";
  decisionAt?: string;
  actorId?: string;
  comments?: string;
  snapshot: string;
  supersededBy?: string;
}
export interface Supplier {
  id: string;
  code: string;
  name: string;
  contact: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  emirate: string;
  country: string;
  trn: string;
  bank: string;
  category: string;
  terms: string;
  notes: string;
  status: "Active" | "Archived";
  createdAt: string;
}
export interface PricedItem extends InvoiceLine {
  unit: string;
  materialId?: string;
  specification?: string;
}
export interface Variation {
  id: string;
  familyId: string;
  revision: number;
  number: string;
  projectId: string;
  customerId: string;
  contractId: string;
  title: string;
  description: string;
  reason: string;
  requesterId: string;
  date: string;
  direction: "Addition" | "Deduction";
  items: PricedItem[];
  discount: string;
  vatPercentage: string;
  notes: string;
  attachments: Attachment[];
  status:
    | "Draft"
    | "Submitted"
    | "Internally Approved"
    | "Sent to Client"
    | "Approved"
    | "Rejected"
    | "Revised";
  approvedAt?: string;
  snapshot?: string;
  net?: string;
  vat?: string;
  gross?: string;
}
export interface Material {
  id: string;
  number: string;
  projectId: string;
  name: string;
  specification: string;
  unit: string;
  quantity: string;
  requiredDate: string;
  requesterId: string;
  priority: string;
  notes: string;
  attachments: Attachment[];
}
export interface PurchaseRequest {
  id: string;
  number: string;
  projectId: string;
  materialIds: string[];
  requesterId: string;
  date: string;
  notes: string;
  status: "Draft" | "Submitted" | "Approved" | "Rejected";
}
export interface Rfq {
  id: string;
  number: string;
  projectId: string;
  requestId: string;
  supplierId: string;
  items: PricedItem[];
  deliveryDate: string;
  deadline: string;
  status: "Requested" | "Received" | "Closed";
}
export interface SupplierQuote {
  id: string;
  number: string;
  rfqId: string;
  projectId: string;
  supplierId: string;
  items: PricedItem[];
  deliveryCharge: string;
  vatPercentage: string;
  leadDays: number;
  terms: string;
  remarks: string;
  status: "Received" | "Submitted" | "Approved" | "Rejected";
  snapshot?: string;
}
export interface PurchaseOrder {
  id: string;
  number: string;
  quoteId: string;
  projectId: string;
  supplierId: string;
  date: string;
  items: PricedItem[];
  deliveryCharge: string;
  vatPercentage: string;
  deliveryLocation: string;
  deliveryDate: string;
  terms: string;
  status: "Draft" | "Submitted" | "Approved" | "Rejected" | "Cancelled";
  snapshot?: string;
  companySnapshot?: CompanyProfile;
  supplierSnapshot?: Supplier;
}
export interface Delivery {
  id: string;
  number: string;
  poId: string;
  projectId: string;
  date: string;
  quantities: { itemId: string; quantity: string }[];
  receiverId: string;
  reference: string;
  remarks: string;
  reversedAt?: string;
  reason?: string;
}
export interface SupplierBill {
  id: string;
  number: string;
  reference: string;
  poId: string;
  supplierId: string;
  projectId: string;
  date: string;
  due: string;
  quantities: { itemId: string; quantity: string }[];
  deliveryCharge: string;
  net: string;
  vat: string;
  gross: string;
  status: "Issued" | "Cancelled";
  snapshot: string;
  companySnapshot: CompanyProfile;
  supplierSnapshot: Supplier;
}
export interface SupplierPayment {
  id: string;
  number: string;
  billId: string;
  supplierId: string;
  projectId: string;
  date: string;
  amount: string;
  method: string;
  reference: string;
  bank: string;
  notes: string;
  reversedAt?: string;
  reversalDate?: string;
  reason?: string;
}
export interface CreditNote {
  id: string;
  number: string;
  invoiceId: string;
  projectId: string;
  customerId: string;
  variationId?: string;
  date: string;
  reason: string;
  gross: string;
  net?: string;
  vat?: string;
  itemId: string;
  status: "Draft" | "Submitted" | "Approved" | "Issued" | "Rejected";
  issuedAt?: string;
  snapshot?: string;
  allocationVersion?: 1;
  lineAllocations?: {
    itemId: string;
    net: string;
    vat: string;
    gross: string;
  }[];
}
export interface Refund {
  id: string;
  number: string;
  invoiceId: string;
  customerId: string;
  projectId: string;
  date: string;
  amount: string;
  reference: string;
  method: string;
  reason: string;
  reversedAt?: string;
  reversalDate?: string;
}
export interface Budget {
  id: string;
  projectId: string;
  lines: {
    id: string;
    category: string;
    phaseId: string;
    original: string;
    revised: string;
  }[];
  remainingEstimate: string;
  notes: string;
  updatedAt: string;
}
export interface CompanyProfile {
  name: string;
  tradingName: string;
  location: string;
  phone: string;
  email: string;
  website: string;
  trn: string;
  logo: string;
  bank: string;
  invoiceTerms: string;
}
export interface OperationalSettings {
  company: CompanyProfile;
  invoicePrefix: string;
  currency: "AED";
  vatPercentage: string;
  tax: TaxTreatment;
  fiscalYearStart: string;
  paymentDays: number;
  blockOperationalForFinance: boolean;
  retentionPercentage: string;
  numbering: Record<
    | "variation"
    | "po"
    | "credit"
    | "supplier"
    | "material"
    | "request"
    | "rfq"
    | "quote"
    | "delivery"
    | "bill"
    | "supplierPayment"
    | "refund",
    { prefix: string; next: number }
  >;
}
export interface OperationalData {
  version: 1;
  suppliers: Supplier[];
  variations: Variation[];
  materials: Material[];
  requests: PurchaseRequest[];
  rfqs: Rfq[];
  quotes: SupplierQuote[];
  orders: PurchaseOrder[];
  deliveries: Delivery[];
  bills: SupplierBill[];
  supplierPayments: SupplierPayment[];
  credits: CreditNote[];
  refunds: Refund[];
  budgets: Budget[];
  approvals: Approval[];
  closures: {
    projectId: string;
    date: string;
    actorId: string;
    notes: string;
    snapshot: string;
  }[];
  settings: OperationalSettings;
}
export type ControlledDocument = DocumentRecord;
