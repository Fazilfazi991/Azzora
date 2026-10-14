import type { Attachment } from "../domain/model";
import type {
  QuotationCustomerSnapshot,
  QuotationCompanyDetails,
} from "../quotation/model";

export interface CustomerContact {
  id: string;
  name: string;
  phone: string;
  email: string;
  role: string;
}
export type TaxTreatment = "Exclusive" | "Inclusive" | "Zero Rated" | "Exempt";
export interface InvoiceLine {
  id: string;
  description: string;
  quantity: string;
  rate: string;
  tax: TaxTreatment;
}
export interface InvoiceSnapshot {
  customer: QuotationCustomerSnapshot & { trn: string };
  company: QuotationCompanyDetails;
  project: string;
  quotation: string;
  subtotal: string;
  discount: string;
  net: string;
  vat: string;
  grand: string;
}
export interface Invoice {
  id: string;
  number: string;
  customerId: string;
  projectId: string;
  quotationId: string;
  milestoneId: string;
  variationId?: string;
  date: string;
  due: string;
  description: string;
  lines: InvoiceLine[];
  discount: string;
  vatPercentage: string;
  terms: string;
  notes: string;
  status: "Draft" | "Issued" | "Cancelled";
  createdAt: string;
  issuedAt?: string;
  cancelledAt?: string;
  snapshot?: InvoiceSnapshot;
}
export const paymentMethods = [
  "Bank Transfer",
  "Cash",
  "Cheque",
  "Other",
] as const;
export interface Payment {
  id: string;
  number: string;
  invoiceId: string;
  customerId: string;
  projectId: string;
  date: string;
  amount: string;
  method: (typeof paymentMethods)[number];
  reference: string;
  bank: string;
  notes: string;
  attachments: Attachment[];
  postingKey: string;
  createdAt: string;
  reversedAt?: string;
  reversalReason?: string;
  reversalDate?: string;
}
export const expenseCategories = [
  "Materials",
  "Labour",
  "Subcontractor",
  "Transportation",
  "Equipment",
  "Site Expenses",
  "Miscellaneous",
] as const;
export interface Expense {
  id: string;
  reference: string;
  projectId: string;
  category: string;
  supplier: string;
  date: string;
  description: string;
  amount: string;
  vat: string;
  paidAmount: string;
  method: (typeof paymentMethods)[number];
  attachmentReference: string;
  attachments: Attachment[];
  createdAt: string;
  supplierBillId?: string;
  cancelledAt?: string;
}
export interface Contract {
  id: string;
  quotationId: string;
  familyId: string;
  customerId: string;
  projectId: string;
  acceptedAt: string;
  convertedAt: string;
  net: string;
  vat: string;
  gross: string;
  quotationSnapshot: string;
  paymentTerms: string;
}
export interface CommercialFilter {
  supplierId?: string;
  from: string;
  to: string;
  customerId: string;
  projectId: string;
  status: string;
}
export const emptyFilter: CommercialFilter = {
  from: "",
  to: "",
  customerId: "",
  projectId: "",
  status: "",
};
