import { expect, it } from "vitest";
import { backupFailureMessage } from "./manual-backup-message";
it.each([
  "staging_owner_backup_key_required",
  "production_owner_backup_key_required",
  "production_backup_adapter_required",
])("shows a clear configuration failure for %s", (code) => {
  expect(backupFailureMessage(code)).toBe(
    "Encrypted backup is not configured. No file was downloaded.",
  );
});
it("asks for fresh MFA without claiming a download", () => {
  expect(backupFailureMessage("backup_recent_mfa_required")).toMatch(
    /authenticator/,
  );
});
