/** Proposed policy contract only. No browser caller may use this as a security gate. */
export const FINANCE_ROLES = ["Owner/Admin", "Accountant", "Project Manager", "Site Staff"] as const;
export type FinanceRole = (typeof FINANCE_ROLES)[number];

export const FINANCE_CAPABILITIES = [
  "configureAccounts",
  "grantRoles",
  "prepareSalesInvoice",
  "preparePurchaseBill",
  "recordSettlement",
  "viewFinancialStatements",
  "viewGeneralLedger",
  "viewReceivablesPayables",
  "reviewExpense",
  "submitOwnExpense",
  "viewOwnCustodyBalance",
  "postJournalOverride",
  "reverseJournal",
  "reopenPeriod",
  "establishOpeningBalance",
] as const;
export type FinanceCapability = (typeof FINANCE_CAPABILITIES)[number];
export type ProposedAccess = "proposed" | "conditional" | "none";

export interface PolicyDecision {
  readonly access: ProposedAccess;
  readonly pendingDecisions?: readonly string[];
  readonly scope?: string;
}

const proposed = (scope?: string): PolicyDecision => ({ access: "proposed", scope });
const conditional = (pendingDecisions: readonly string[], scope?: string): PolicyDecision => ({
  access: "conditional",
  pendingDecisions,
  scope,
});
const none = (): PolicyDecision => ({ access: "none" });

/**
 * Intended permissions for review. B01/B02/B07/B11 are unresolved.
 * This matrix is neither a session, an authenticated actor, nor an authorization check.
 */
export const PROPOSED_FINANCE_POLICY: Readonly<Record<FinanceRole, Readonly<Record<FinanceCapability, PolicyDecision>>>> = {
  "Owner/Admin": {
    configureAccounts: conditional(["B01", "B10"]),
    grantRoles: conditional(["B11"]),
    prepareSalesInvoice: proposed(),
    preparePurchaseBill: proposed(),
    recordSettlement: conditional(["B01"]),
    viewFinancialStatements: proposed(),
    viewGeneralLedger: proposed(),
    viewReceivablesPayables: proposed(),
    reviewExpense: conditional(["B02"]),
    submitOwnExpense: proposed(),
    viewOwnCustodyBalance: proposed("Own authorized account only"),
    postJournalOverride: conditional(["B01"]),
    reverseJournal: conditional(["B01"]),
    reopenPeriod: conditional(["B01"]),
    establishOpeningBalance: conditional(["B10"]),
  },
  Accountant: {
    configureAccounts: none(),
    grantRoles: none(),
    prepareSalesInvoice: proposed(),
    preparePurchaseBill: proposed(),
    recordSettlement: conditional(["B01"], "Approved limits and documents"),
    viewFinancialStatements: proposed(),
    viewGeneralLedger: proposed(),
    viewReceivablesPayables: proposed(),
    reviewExpense: conditional(["B01", "B02"]),
    submitOwnExpense: proposed(),
    viewOwnCustodyBalance: proposed("Own authorized account only"),
    postJournalOverride: conditional(["B01"], "Explicitly delegated only"),
    reverseJournal: conditional(["B01"], "Explicitly delegated only"),
    reopenPeriod: none(),
    establishOpeningBalance: none(),
  },
  "Project Manager": {
    configureAccounts: none(),
    grantRoles: none(),
    prepareSalesInvoice: conditional(["B01"], "Explicitly delegated assigned project"),
    preparePurchaseBill: conditional(["B01"], "Explicitly delegated assigned project"),
    recordSettlement: none(),
    viewFinancialStatements: none(),
    viewGeneralLedger: none(),
    viewReceivablesPayables: conditional(["B01"], "Approved assigned-project summary only"),
    reviewExpense: conditional(["B02"], "Assigned-project submission only"),
    submitOwnExpense: proposed("Assigned project only"),
    viewOwnCustodyBalance: conditional(["B07"], "Own authorized account only"),
    postJournalOverride: none(),
    reverseJournal: none(),
    reopenPeriod: none(),
    establishOpeningBalance: none(),
  },
  "Site Staff": {
    configureAccounts: none(),
    grantRoles: none(),
    prepareSalesInvoice: none(),
    preparePurchaseBill: none(),
    recordSettlement: none(),
    viewFinancialStatements: none(),
    viewGeneralLedger: none(),
    viewReceivablesPayables: none(),
    reviewExpense: none(),
    submitOwnExpense: proposed("Own assigned-project submission only"),
    viewOwnCustodyBalance: conditional(["B07"], "Own authorized account only"),
    postJournalOverride: none(),
    reverseJournal: none(),
    reopenPeriod: none(),
    establishOpeningBalance: none(),
  },
};

export interface TrustedAuthorizationRequirements {
  readonly identity: "Trusted server-verified user identity and active session";
  readonly enforcement: "Command and query boundary, before data access or mutation";
  readonly resourceScope: "Verify company, project, party, and custody-account scope for each request";
  readonly policyVersion: "Persisted approved policy with audit trail and revocation";
  readonly denial: "Fail closed with no record disclosure or partial mutation";
}

export const TRUSTED_AUTHORIZATION_REQUIREMENTS: TrustedAuthorizationRequirements = {
  identity: "Trusted server-verified user identity and active session",
  enforcement: "Command and query boundary, before data access or mutation",
  resourceScope: "Verify company, project, party, and custody-account scope for each request",
  policyVersion: "Persisted approved policy with audit trail and revocation",
  denial: "Fail closed with no record disclosure or partial mutation",
};
