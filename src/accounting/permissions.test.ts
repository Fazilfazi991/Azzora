import { describe, expect, it } from "vitest";
import {
  FINANCE_CAPABILITIES,
  FINANCE_ROLES,
  PROPOSED_FINANCE_POLICY,
  TRUSTED_AUTHORIZATION_REQUIREMENTS,
} from "./permissions";

describe("proposed Accountant authorization contract", () => {
  it("covers every capability for every intended role", () => {
    for (const role of FINANCE_ROLES)
      expect(Object.keys(PROPOSED_FINANCE_POLICY[role]).sort()).toEqual([...FINANCE_CAPABILITIES].sort());
  });

  it("does not grant Accountant control of role grants, reopening periods or opening balances", () => {
    const accountant = PROPOSED_FINANCE_POLICY.Accountant;
    expect(accountant.grantRoles.access).toBe("none");
    expect(accountant.reopenPeriod.access).toBe("none");
    expect(accountant.establishOpeningBalance.access).toBe("none");
    expect(accountant.postJournalOverride).toMatchObject({ access: "conditional", pendingDecisions: ["B01"] });
  });

  it("requires scope and unresolved decisions for staff and project financial views", () => {
    expect(PROPOSED_FINANCE_POLICY["Site Staff"].viewFinancialStatements.access).toBe("none");
    expect(PROPOSED_FINANCE_POLICY["Site Staff"].submitOwnExpense.scope).toMatch(/Own assigned-project/);
    expect(PROPOSED_FINANCE_POLICY["Site Staff"].viewOwnCustodyBalance.pendingDecisions).toContain("B07");
    expect(PROPOSED_FINANCE_POLICY["Project Manager"].viewReceivablesPayables.scope).toMatch(/assigned-project/);
  });

  it("records trusted-server requirements rather than asserting browser role state is enforcement", () => {
    expect(TRUSTED_AUTHORIZATION_REQUIREMENTS.identity).toMatch(/server-verified/);
    expect(TRUSTED_AUTHORIZATION_REQUIREMENTS.enforcement).toMatch(/Command and query boundary/);
    expect(TRUSTED_AUTHORIZATION_REQUIREMENTS.denial).toMatch(/Fail closed/);
  });
});
