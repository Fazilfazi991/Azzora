import { describe, expect, it } from "vitest";
import { prepareIdentityRecoveryReview } from "./recovery-identity-review";

const owner = "11111111-1111-4111-8111-111111111111", former = "22222222-2222-4222-8222-222222222222", replacement = "33333333-3333-4333-8333-333333333333";
function fixture() {
  return {
    companyId: "44444444-4444-4444-8444-444444444444", inventorySha256: "a".repeat(64),
    expectedCounts: { members: 2, journals: 1, snapshots: 1, auditEvents: 1 },
    members: [
      { originalUserId: owner, proposedNewUserId: replacement, sourceRole: "owner_admin", wasActive: true, hadFinanceAccess: true },
      { originalUserId: former, proposedNewUserId: null, sourceRole: "site_staff", wasActive: false, hadFinanceAccess: false },
    ],
    journals: [{ id: "journal-1", originalActorId: former }],
    snapshots: [{ entityType: "invoice", entityId: "invoice-1", revision: 1, originalCapturedBy: owner }],
    auditEvents: [{ originalEventId: "72", originalActorId: former, contentSha256: "b".repeat(64) }],
  };
}
describe("offline identity and audit recovery review", () => {
  it("keeps original actors distinct from proposed sign-in identities, without granting or restoring", () => {
    const review = prepareIdentityRecoveryReview(fixture());
    expect(review.issues).toEqual([]);
    expect(review.journals[0].originalActorId).toBe(former);
    expect(review.members[0].originalUserId).toBe(owner);
    expect(review.members[0].proposedNewUserId).toBe(replacement);
    expect(review).toMatchObject({ publication: "review-only", grantsApplied: false, historicalActorsRewritten: false, identityAndAuditRestoreVerified: false });
  });
  it("detects missing actor, unreviewed mapping and incomplete inventory", () => {
    const f = fixture();
    f.members = f.members.slice(0, 1);
    f.members[0].proposedNewUserId = null;
    expect(prepareIdentityRecoveryReview(f).issues).toEqual(expect.arrayContaining(["count:members", "unknown-historical-actor", "missing-reprovision-mapping"]));
  });
  it("detects duplicate mappings and duplicate immutable history identities", () => {
    const f = fixture();
    f.members[1].proposedNewUserId = replacement;
    f.auditEvents.push(f.auditEvents[0]);
    expect(prepareIdentityRecoveryReview(f).issues).toEqual(expect.arrayContaining(["duplicate-new-user", "duplicate-audit-event", "count:auditEvents"]));
  });
  it("rejects credential and MFA fields rather than preserving them", () => {
    const f = fixture();
    expect(() => prepareIdentityRecoveryReview({ ...f, password: "fictional-only" })).toThrow();
    expect(() => prepareIdentityRecoveryReview({ ...f, members: [{ ...f.members[0], totpSecret: "fictional-only" }] })).toThrow();
    expect(() => prepareIdentityRecoveryReview({ ...f, sessions: [] })).toThrow();
  });
  it("binds the digest to the proposed mappings and historical actors", () => {
    const f = fixture(), before = prepareIdentityRecoveryReview(f).sha256;
    f.journals[0].originalActorId = owner;
    expect(prepareIdentityRecoveryReview(f).sha256).not.toBe(before);
  });
});
